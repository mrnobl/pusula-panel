const BaseStrategy = require('./baseStrategy');
const Indicators = require('../indicators');

/**
 * Rejim Kapılı Trend Devamı (regime_trend)
 *
 * Depodaki 7 stratejinin ölçülen dört ortak eksikliğine karşılık tasarlandı.
 * Hepsinin brüt edge'i (komisyon geri eklenmiş beklenti) sıfır civarındaydı;
 * yani hiçbiri fiyat yönünü bilmiyordu, sadece komisyon ödüyordu.
 *
 *  1. MALİYET KAPISI — hiçbiri hedefin komisyonu geçip geçmediğini sormuyordu.
 *     TSS 1m'de 14 dakika tutup %0.32 komisyon ödüyordu. Burada beklenen hedef
 *     mesafesi gidiş-dönüş maliyetin `minCostMultiple` katından küçükse işlem
 *     açılmaz.
 *
 *  2. REJİM KAPISI — `Indicators.detectMarketRegime` motorda her tick
 *     hesaplanıp panelde gösteriliyor ama hiçbir strateji giriş kapısı olarak
 *     kullanmıyordu. Burada ADX + yön + volatilite bandı birlikte kapı oluşturur.
 *
 *  3. ÇOK BARLI TEYİT — hepsi tek barlık tetikleyiciyle (kesişim/eşik) giriyordu.
 *     Burada rejim koşulları `confirmBars` bar üst üste sağlanmalıdır.
 *
 *  4. KÂR KOŞTURMA — çoğu ya sinyal tersine dönünce ya da risk yöneticisinin
 *     sabit stopuna teslim oluyordu. Burada 1R'de yarısı alınır, kalanı risk
 *     yöneticisinin iz süren stopuyla taşınır.
 *
 * SHORT DESTEĞİ: mantık yazılıdır ama yalnızca `marketType === 'perpetual'`
 * iken sinyal üretir. Spot piyasada borsa açığa satışa izin vermediği için
 * kurulum tespit edilse bile sinyal bastırılır. Short sinyali `action: 'SHORT'`
 * olarak çıkar — motor ve backtester yalnızca 'BUY'/'SELL' işlediği için bu
 * bugün etkisizdir (yanlış yorumlanıp long kapatma sayılmaz). Perpetual
 * yürütme katmanı yazıldığında bağlanacak tek nokta budur.
 */
class RegimeTrendStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('Rejim Kapılı Trend Devamı', config);
    // Sıklık freni ve kısmi çıkış durumu. Strateji örnekleri barlar arasında
    // korunur (motor önbelleğe alır, backtester döngü öncesi bir kez kurar).
    this.lastEntryTime = 0;
    // Bastırılan short kurulumları ayrı bir zaman damgasıyla aralıklandırılır.
    // `lastEntryTime` kullanılamaz: spot'ta bastırılan bir short, ardından
    // gelecek long girişini de bloke ederdi. Aralıklandırmadan sayılırsa da
    // aynı kurulum her barda yeniden sayılıp rakamı kat kat şişirir.
    this.lastShortSetupTime = 0;
    this.tp1Done = false;
    this.suppressedShorts = 0;
  }

  /** Gidiş-dönüş komisyon oranı (%). Motor ve backtester ile aynı. */
  roundTripFeePct() {
    return (this.config.feePct != null ? this.config.feePct : 0.15) * 2;
  }

  /** İki mum arasındaki süre; sıklık freni bar sayısı yerine zamanla ölçülür. */
  barDurationMs(ohlcv) {
    const n = ohlcv.length;
    if (n < 2) return 0;
    const d = Number(ohlcv[n - 1].time) - Number(ohlcv[n - 2].time);
    return Number.isFinite(d) && d > 0 ? d : 0;
  }

  /**
   * ADX dizisi mum dizisiyle HİZALI DEĞİL — `calculateADX` ham dizi döner
   * (120 mum için 93 eleman). Indeks kaydırılmadan okunursa çok barlı teyit
   * sessizce yanlış barlara bakar.
   */
  adxAccessor(ohlcv, period) {
    const series = Indicators.calculateADX(ohlcv, period) || [];
    const offset = ohlcv.length - series.length;
    return (i) => {
      const idx = i - offset;
      return (idx >= 0 && idx < series.length) ? series[idx] : null;
    };
  }

  evaluate(ohlcv, ticker, positions = []) {
    const fastLen = Math.max(2, parseInt(this.config.emaFast) || 21);
    const slowLen = Math.max(fastLen + 1, parseInt(this.config.emaSlow) || 55);
    const atrPeriod = Math.max(2, parseInt(this.config.atrPeriod) || 14);
    const adxPeriod = Math.max(2, parseInt(this.config.adxPeriod) || 14);
    const confirmBars = Math.max(1, parseInt(this.config.confirmBars) || 3);

    const minBars = Math.max(slowLen + adxPeriod * 2 + confirmBars, 60);
    // KUYRUK PENCERESİ: göstergeler her barda TÜM geçmiş üzerinde hesaplanıyordu
    // → O(n²): 5000 bar 10 sn, 20000 bar 169 sn (2026-10-06). EMA/ADX'in
    // 10×minBars öncesine etkisi ~e⁻²⁰; sonuç değişmez, süre doğrusal olur.
    const kuyruk = Math.max(minBars * 10, 600);
    if (ohlcv && ohlcv.length > kuyruk) ohlcv = ohlcv.slice(-kuyruk);
    if (!ohlcv || ohlcv.length < minBars) {
      return { action: 'HOLD', reason: `Yetersiz veri (<${minBars} mum)` };
    }
    if (!ticker || !ticker.last) {
      return { action: 'HOLD', reason: 'Fiyat verisi bekleniyor...' };
    }

    const currentPrice = ticker.last;
    const last = ohlcv.length - 1;
    const hasPosition = positions.length > 0;

    const adxThreshold = parseFloat(this.config.adxThreshold) || 22;
    const atrMinPct = parseFloat(this.config.atrMinPct) || 0.5;
    const atrMaxPct = parseFloat(this.config.atrMaxPct) || 8.0;
    const atrStopMult = parseFloat(this.config.atrStopMult) || 1.5;
    const rewardRisk = parseFloat(this.config.rewardRisk) || 2.0;
    const minCostMultiple = parseFloat(this.config.minCostMultiple) || 4.0;
    const minBarGap = Math.max(0, parseInt(this.config.minBarGap) || 10);
    const pullbackAtr = parseFloat(this.config.pullbackAtr) || 0.5;

    const allowShorts = this.config.allowShorts === true;
    const marketType = this.config.marketType || 'spot';
    const shortsExecutable = allowShorts && marketType === 'perpetual';

    // --- Göstergeler -------------------------------------------------------
    const closes = ohlcv.map(c => c.close);
    const emaFast = Indicators.calculateEMA(closes, fastLen);
    const emaSlow = Indicators.calculateEMA(closes, slowLen);
    const atrSeries = Indicators.calculateATR(ohlcv, atrPeriod);
    const adxAt = this.adxAccessor(ohlcv, adxPeriod);

    const atr = Number(atrSeries[last]);
    const fastNow = Number(emaFast[last]);
    const slowNow = Number(emaSlow[last]);
    const adxNow = adxAt(last);

    if (!Number.isFinite(atr) || atr <= 0 || !Number.isFinite(fastNow) || !Number.isFinite(slowNow) || !adxNow) {
      return { action: 'HOLD', reason: 'Göstergeler ısınıyor...' };
    }

    const atrPct = (atr / currentPrice) * 100;

    // --- Açık pozisyon: 1R'de yarısını al, kalanı iz süren stopa bırak ------
    if (hasPosition) {
      const pos = positions[0];
      const stopPct = Number(pos.stopPct) > 0 ? Number(pos.stopPct) : (atrPct * atrStopMult);
      const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;

      if (!this.tp1Done && pnlPct >= stopPct) {
        this.tp1Done = true;
        return {
          action: 'SELL',
          partialPct: 0.5,
          reason: `TP1: 1R'ye ulaşıldı (+%${pnlPct.toFixed(2)} ≥ %${stopPct.toFixed(2)}), pozisyonun yarısı alındı`
        };
      }

      // Trend kırıldı: kalanı bırakma, iz süren stopu beklemeden çık.
      if (fastNow < slowNow) {
        this.tp1Done = false;
        return {
          action: 'SELL',
          closeAll: true,
          reason: `Trend kırıldı (EMA${fastLen} < EMA${slowLen}), pozisyon kapatılıyor`
        };
      }

      return {
        action: 'HOLD',
        reason: `Pozisyon taşınıyor (%${pnlPct.toFixed(2)}, TP1 ${this.tp1Done ? 'alındı' : 'bekliyor'})`
      };
    }

    this.tp1Done = false;

    // --- Sıklık freni ------------------------------------------------------
    const barMs = this.barDurationMs(ohlcv);
    const nowTime = Number(ohlcv[last].time) || 0;
    if (minBarGap > 0 && barMs > 0 && this.lastEntryTime > 0) {
      const elapsedBars = (nowTime - this.lastEntryTime) / barMs;
      if (elapsedBars < minBarGap) {
        return {
          action: 'HOLD',
          reason: `Sıklık freni: son girişten ${Math.floor(elapsedBars)}/${minBarGap} bar geçti`
        };
      }
    }

    // --- Rejim kapısı ------------------------------------------------------
    if (atrPct < atrMinPct) {
      return { action: 'HOLD', reason: `Volatilite çok düşük (ATR %${atrPct.toFixed(2)} < %${atrMinPct})` };
    }
    if (atrPct > atrMaxPct) {
      return { action: 'HOLD', reason: `Volatilite çok yüksek (ATR %${atrPct.toFixed(2)} > %${atrMaxPct})` };
    }

    // --- Çok barlı teyit ---------------------------------------------------
    // Yön ve trend gücü `confirmBars` bar boyunca kesintisiz sürmeli.
    let longConfirmed = true;
    let shortConfirmed = true;
    for (let k = 0; k < confirmBars; k++) {
      const i = last - k;
      const f = Number(emaFast[i]);
      const s = Number(emaSlow[i]);
      const a = adxAt(i);
      if (!Number.isFinite(f) || !Number.isFinite(s) || !a || !(a.adx >= adxThreshold)) {
        longConfirmed = false;
        shortConfirmed = false;
        break;
      }
      if (!(f > s)) longConfirmed = false;
      if (!(f < s)) shortConfirmed = false;
    }

    if (!longConfirmed && !shortConfirmed) {
      return {
        action: 'HOLD',
        reason: `Rejim kapısı kapalı (ADX ${adxNow.adx.toFixed(1)}/${adxThreshold}, ${confirmBars} bar teyit yok)`
      };
    }

    // --- Maliyet kapısı ----------------------------------------------------
    // Stop mesafesi ATR'den, hedef ondan türer. Hedef, gidiş-dönüş komisyonun
    // katı kadar değilse bu işlem daha açılmadan maliyete yeniktir.
    const stopPct = atrPct * atrStopMult;
    const targetPct = stopPct * rewardRisk;
    const feeFloor = this.roundTripFeePct() * minCostMultiple;

    if (targetPct < feeFloor) {
      return {
        action: 'HOLD',
        reason: `Maliyet kapısı: hedef %${targetPct.toFixed(2)} < gerekli %${feeFloor.toFixed(2)} (komisyon × ${minCostMultiple})`
      };
    }

    // --- Geri çekilme girişi ----------------------------------------------
    // Kırılım kovalamak yerine fiyatın hızlı EMA'ya yaklaşmasını bekler:
    // giriş trende yakınlaşır, stop mesafesi aynı kalırken risk azalır.
    const distanceToFast = Math.abs(currentPrice - fastNow) / atr;
    const nearFast = distanceToFast <= pullbackAtr;

    if (!nearFast) {
      return {
        action: 'HOLD',
        reason: `Geri çekilme bekleniyor (EMA${fastLen}'e uzaklık ${distanceToFast.toFixed(2)} ATR > ${pullbackAtr})`
      };
    }

    const signalBase = {
      stopLossPct: +stopPct.toFixed(4),
      takeProfitPct: +targetPct.toFixed(4),
      indicators: {
        adx: +adxNow.adx.toFixed(1),
        atrPct: +atrPct.toFixed(3),
        emaFast: +fastNow.toFixed(6),
        emaSlow: +slowNow.toFixed(6)
      }
    };

    if (longConfirmed && currentPrice > slowNow) {
      this.lastEntryTime = nowTime;
      return {
        ...signalBase,
        action: 'BUY',
        direction: 'long',
        reason: `Trend devamı LONG: ADX ${adxNow.adx.toFixed(1)}, EMA${fastLen}>EMA${slowLen}, geri çekilme ${distanceToFast.toFixed(2)} ATR, stop %${stopPct.toFixed(2)} hedef %${targetPct.toFixed(2)}`
      };
    }

    if (shortConfirmed && currentPrice < slowNow) {
      // Spot piyasada borsa açığa satışa izin vermez; kurulum tespit edilse de
      // sinyal bastırılır. Sayaç, kaç fırsatın piyasa tipi yüzünden kaçtığını
      // gösterir — perpetuale geçmenin değerini ölçmek için.
      if (!shortsExecutable) {
        // Yalnızca sıklık freni kadar aralıklı olanlar sayılır — perpetual'da
        // gerçekten açılacak işlem sayısıyla karşılaştırılabilir olsun diye.
        const spacedEnough = !this.lastShortSetupTime || !barMs
          || ((nowTime - this.lastShortSetupTime) / barMs) >= minBarGap;
        if (spacedEnough) {
          this.lastShortSetupTime = nowTime;
          this.suppressedShorts += 1;
        }
        return {
          action: 'HOLD',
          reason: `SHORT kurulumu tespit edildi ama ${marketType} piyasada açığa satış kapalı (${this.suppressedShorts} ayrı kurulum kaçtı)`
        };
      }

      this.lastEntryTime = nowTime;
      return {
        ...signalBase,
        action: 'SHORT',
        direction: 'short',
        reason: `Trend devamı SHORT: ADX ${adxNow.adx.toFixed(1)}, EMA${fastLen}<EMA${slowLen}, stop %${stopPct.toFixed(2)} hedef %${targetPct.toFixed(2)}`
      };
    }

    return {
      action: 'HOLD',
      reason: `Kapılar açık ama fiyat EMA${slowLen}'in yanlış tarafında`
    };
  }
}

/** Panel formu bu bildirimden üretilir (bkz. sigmoidBbStrategy.paramSchema). */
RegimeTrendStrategy.paramSchema = {
  emaFast: { type: 'number', default: 21, min: 2, max: 200, step: 1, label: 'Hızlı EMA', group: 'Rejim Kapısı' },
  emaSlow: { type: 'number', default: 55, min: 5, max: 400, step: 1, label: 'Yavaş EMA', group: 'Rejim Kapısı' },
  adxPeriod: { type: 'number', default: 14, min: 2, max: 100, step: 1, label: 'ADX periyodu', group: 'Rejim Kapısı' },
  adxThreshold: { type: 'number', default: 22, min: 5, max: 60, step: 1, label: 'ADX eşiği', group: 'Rejim Kapısı', description: 'Altında trend sayılmaz, giriş yapılmaz.' },
  confirmBars: { type: 'number', default: 3, min: 1, max: 20, step: 1, label: 'Teyit barı', group: 'Rejim Kapısı', description: 'Rejim koşulları bu kadar bar üst üste sağlanmalı.' },

  atrPeriod: { type: 'number', default: 14, min: 2, max: 100, step: 1, label: 'ATR periyodu', group: 'Volatilite' },
  atrMinPct: { type: 'number', default: 0.5, min: 0, max: 10, step: 0.1, label: 'Min ATR (%)', group: 'Volatilite', description: 'Bu kadar oynaklık yoksa hedef komisyonu karşılamaz.' },
  atrMaxPct: { type: 'number', default: 8, min: 1, max: 50, step: 0.5, label: 'Maks ATR (%)', group: 'Volatilite' },
  atrStopMult: { type: 'number', default: 1.5, min: 0.2, max: 6, step: 0.1, label: 'ATR stop çarpanı', group: 'Volatilite' },
  pullbackAtr: { type: 'number', default: 0.5, min: 0, max: 3, step: 0.1, label: 'Geri çekilme (ATR)', group: 'Giriş' },
  minBarGap: { type: 'number', default: 10, min: 0, max: 200, step: 1, label: 'İşlemler arası min bar', group: 'Giriş' },

  rewardRisk: { type: 'number', default: 2, min: 0.5, max: 10, step: 0.1, label: 'Ödül/Risk', group: 'Çıkış' },
  minCostMultiple: { type: 'number', default: 4, min: 0, max: 20, step: 0.5, label: 'Maliyet kapısı (komisyon katı)', group: 'Çıkış', description: 'Hedef mesafesi gidiş-dönüş maliyetin bu katından küçükse işlem açılmaz.' },
  feePct: { type: 'number', default: 0.15, min: 0, max: 1, step: 0.01, label: 'Tek yön komisyon (%)', group: 'Çıkış' },
  allowShorts: { type: 'boolean', default: true, label: 'Short mantığı açık', group: 'Çıkış', description: 'Yalnızca perpetual piyasada sinyal üretir; spotta bastırılır.' }
};

module.exports = RegimeTrendStrategy;
