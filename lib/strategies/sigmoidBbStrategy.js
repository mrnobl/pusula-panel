const BaseStrategy = require('./baseStrategy');

/**
 * Sigmoid TS + Bollinger — kademeli çıkışlı trend takibi.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN BU YAPI — ölçümle kuruldu, tercihle değil
 * ─────────────────────────────────────────────────────────────────────────
 * Sigmoid trailing stop'un flip'ten flip'e sonucu ölçüldü (5000 mum):
 *
 *   BTC 4h: isabet %31.7, brüt −%0.54, net −%0.84 — ama MEDYAN MFE +%2.63
 *   ETH 4h: isabet %32.5, brüt +%0.17, net −%0.13 — medyan MFE +%4.52
 *
 * Yani medyan işlem bir noktada %2.6 lehte gidiyor ve buna rağmen zararla
 * kapanıyor. GİRİŞ kötü değil, ÇIKIŞ her şeyi geri veriyor: flip'i çıkış
 * olarak kullanmak tam bir trend dönüşü beklemek demek.
 *
 * Bu yüzden: giriş flip'te kalır, çıkış Bollinger bantlarında KADEMELENİR.
 * Aynı ölçümde segmentlerin ~%90'ında hedef banda en az bir kez dokunuluyor
 * (medyan 5–7 dokunuş), yani kademeli çıkış için malzeme var.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * "5 SAPMA" NEDEN YOK — matematiksel sınır
 * ─────────────────────────────────────────────────────────────────────────
 * BB'de σ aynı pencereden hesaplandığı için tek bir barın z-skoru tavana
 * çarpar: n barlık pencerede en fazla (n−1)/√n, BB(20) için ≈4.25.
 * Ölçtük: 5000 barda maksimum |z| = 4.08 (BTC 4h), |z|≥5 → SIFIR.
 * `extremeZ` bu yüzden varsayılan 2.8; 5 yazılırsa kural hiç tetiklenmez.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SPOT'TA "KARŞI SHORT" DİYE BİR ŞEY YOK
 * ─────────────────────────────────────────────────────────────────────────
 * Long dururken short açmak, spotta pozisyonu küçültmekle aynı şeydir —
 * sadece daha pahalı. `extremeMode: 'exit'` (varsayılan) bu yüzden ekstremde
 * büyük bir dilim satar. `extremeMode: 'hedge'` gerçek karşı pozisyon açar
 * ama `marketType: 'perpetual'` ister ve motor SHORT'u işlemediği için
 * BUGÜN ETKİSİZDİR — perpetual yürütme katmanı yazıldığında bağlanacak yer.
 */

/** Sigmoid geçiş: 0..1 arası ilerlemeyi S eğrisine çevirir. */
function sigmoid(t) {
  const x = -6 + 12 * Math.min(Math.max(t, 0), 1);
  const sMin = 1 / (1 + Math.exp(6));
  const sMax = 1 / (1 + Math.exp(-6));
  return (1 / (1 + Math.exp(-x)) - sMin) / (sMax - sMin);
}

class SigmoidBbStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('Sigmoid TS + Bollinger', config);
    this.resetState();
  }

  /**
   * Durum makinesi barlar arasında YAŞAR. Sigmoid TS ardışık bir hesap:
   * her çağrıda tüm pencereyi baştan işlemek 5000 barlık bir backtestte
   * O(n²) olurdu. Bu yüzden yalnızca YENİ barlar işlenir; kimlik olarak
   * indeks değil ZAMAN kullanılır — motor kayan pencere geçirdiği için
   * indeksler tick başına kayar.
   */
  resetState() {
    this.st = {
      lastTime: null,
      // Sigmoid TS
      trailingStop: null,
      direction: 1,
      isAdjusting: false,
      sigCounter: 0,
      startLevel: null,
      targetOffset: 0,
      flipAtLastBar: 0,
      // Wilder ATR (RMA) — Pine'ın ta.atr'si ile aynı
      atr: null,
      trSum: 0,
      trCount: 0,
      prevClose: null,
      // Bollinger için kapanış tamponu
      closes: [],
      bb: null,
      // İşlem içi kademe durumu
      trade: null
    };
  }

  cfg() {
    const c = this.config || {};
    return {
      // Sigmoid TS
      atrLength: +c.atrLength || 200,
      atrMult: +c.atrMult || 3.0,
      sigLength: +c.sigLength || 20,
      sigAmp: +c.sigAmp || 3.0,
      minDistMult: c.minDistMult !== undefined ? +c.minDistMult : 0.5,
      // Bollinger
      bbLength: +c.bbLength || 20,
      bbStdDev: +c.bbStdDev || 2.0,
      // Giriş
      entryMode: c.entryMode || 'flip',       // flip | pullback | bandFade
      allocationPct: +c.allocationPct || 20.0,
      minBarsBetweenEntries: c.minBarsBetweenEntries !== undefined ? +c.minBarsBetweenEntries : 0,
      // Kademeli çıkış — orijinal pozisyonun oranları
      tp1Pct: c.tp1Pct !== undefined ? +c.tp1Pct : 0.30,
      tp2Pct: c.tp2Pct !== undefined ? +c.tp2Pct : 0.30,
      tp3Pct: c.tp3Pct !== undefined ? +c.tp3Pct : 0.20,
      // Kalan (1 − toplam) sigmoid TS ile taşınan "koşucu"dur.
      requireBandClose: c.requireBandClose === true,
      // Maliyet kapısı: dilim ancak kâr, gidiş-dönüş komisyonun bu katını
      // geçerse alınır. Deponun bir numaralı katili buydu.
      feePct: c.feePct !== undefined ? +c.feePct : 0.15,
      minTpCostMultiple: c.minTpCostMultiple !== undefined ? +c.minTpCostMultiple : 2.0,
      // Ekstrem sapma
      extremeZ: c.extremeZ !== undefined ? +c.extremeZ : 2.8,
      extremeExitPct: c.extremeExitPct !== undefined ? +c.extremeExitPct : 0.40,
      extremeMode: c.extremeMode || 'exit',   // exit | hedge
      // Short yalnızca perpetual'da üretilir; bu anahtar onu ayrıca kapatır.
      allowShorts: c.allowShorts !== false,
      // Motorun SABİT take-profit'i bu stratejide bir yedek fren olmalı,
      // çıkışı yöneten şey değil. Gönderilmezse motor varsayılan %4'ü
      // uyguluyor ve kademeli TP daha ilk banda varmadan pozisyonu kapatıyordu
      // — ölçümde "motor TP" olarak görünen çıkışlar buydu.
      hardTakeProfitPct: c.hardTakeProfitPct !== undefined ? +c.hardTakeProfitPct : 30.0,
      // Takip eden stop motora her barda gönderilsin mi
      sendTrailingStop: c.sendTrailingStop !== false,
      marketType: c.marketType || 'spot'
    };
  }

  /** Yeni barları işleyip TS ve BB durumunu günceller. */
  ingest(candles, p) {
    const st = this.st;

    let start = 0;
    if (st.lastTime !== null) {
      // Yalnızca yeni barlar. Zaman geriye gitmişse (farklı sembol/dizi)
      // durum sıfırlanır — eski trendin stopunu yeni seriye taşımak sessiz
      // ve çok büyük bir hata olurdu.
      const ilkZaman = candles[0] && candles[0].time;
      if (Number.isFinite(ilkZaman) && ilkZaman > st.lastTime) { this.resetState(); }
      else {
        start = candles.length;
        for (let i = candles.length - 1; i >= 0; i--) {
          if (candles[i].time <= this.st.lastTime) { start = i + 1; break; }
          if (i === 0) start = 0;
        }
      }
    }

    for (let i = start; i < candles.length; i++) {
      const c = candles[i];
      const s = this.st;

      // ── Wilder ATR ──
      const tr = s.prevClose === null
        ? (c.high - c.low)
        : Math.max(c.high - c.low, Math.abs(c.high - s.prevClose), Math.abs(c.low - s.prevClose));
      if (s.atr === null) {
        s.trSum += tr;
        s.trCount++;
        if (s.trCount >= p.atrLength) s.atr = s.trSum / s.trCount;
      } else {
        s.atr += (tr - s.atr) / p.atrLength;
      }
      s.prevClose = c.close;

      // ── Bollinger ──
      s.closes.push(c.close);
      if (s.closes.length > p.bbLength) s.closes.shift();
      if (s.closes.length === p.bbLength) {
        const mean = s.closes.reduce((a, b) => a + b, 0) / p.bbLength;
        const varyans = s.closes.reduce((a, b) => a + (b - mean) * (b - mean), 0) / p.bbLength;
        const sd = Math.sqrt(varyans);
        s.bb = {
          middle: mean,
          sd,
          upper: mean + p.bbStdDev * sd,
          lower: mean - p.bbStdDev * sd,
          z: sd > 0 ? (c.close - mean) / sd : 0
        };
      }

      // ── Sigmoid Transition Trailing Stop ──
      const a = s.atr;
      s.flipAtLastBar = 0;

      if (s.trailingStop === null || !Number.isFinite(a)) {
        const upper = c.high + p.atrMult * (a || 0);
        const lower = c.low - p.atrMult * (a || 0);
        s.trailingStop = s.direction === 1 ? lower : upper;
      } else {
        const upper = c.high + p.atrMult * a;
        const lower = c.low - p.atrMult * a;
        if (s.direction === 1 && c.close < s.trailingStop) {
          s.direction = -1; s.trailingStop = upper; s.isAdjusting = false; s.sigCounter = 0; s.flipAtLastBar = -1;
        } else if (s.direction === -1 && c.close > s.trailingStop) {
          s.direction = 1; s.trailingStop = lower; s.isAdjusting = false; s.sigCounter = 0; s.flipAtLastBar = 1;
        }
      }

      if (Number.isFinite(a) && a > 0) {
        const currentDist = s.direction === 1 ? c.close - s.trailingStop : s.trailingStop - c.close;
        const kDist = p.atrMult * a;
        const minDist = p.minDistMult * a;

        if (!s.isAdjusting && currentDist > kDist) {
          s.isAdjusting = true; s.sigCounter = 0; s.startLevel = s.trailingStop; s.targetOffset = p.sigAmp * a;
        }

        if (s.isAdjusting) {
          s.sigCounter++;
          const sf = sigmoid(s.sigCounter / p.sigLength);
          const aday = s.direction === 1 ? s.startLevel + s.targetOffset * sf : s.startLevel - s.targetOffset * sf;
          const newDist = s.direction === 1 ? c.close - aday : aday - c.close;
          if (newDist < minDist || s.sigCounter >= p.sigLength) s.isAdjusting = false;
          else s.trailingStop = s.direction === 1 ? Math.max(s.trailingStop, aday) : Math.min(s.trailingStop, aday);
        }
      }

      s.lastTime = c.time;
      s.barIndex = (s.barIndex || 0) + 1;
    }
  }

  /** Pozisyon özeti: ağırlıklı ortalama giriş, toplam miktar ve yön. */
  static positionSummary(positions) {
    const acik = (positions || []).filter(p => p && p.amount > 0);
    if (!acik.length) return null;
    const miktar = acik.reduce((a, p) => a + p.amount, 0);
    const deger = acik.reduce((a, p) => a + p.amount * p.entryPrice, 0);
    return {
      amount: miktar,
      entryPrice: deger / miktar,
      count: acik.length,
      side: acik[0].side === 'short' ? 'short' : 'long'
    };
  }

  evaluate(ohlcv, ticker, positions) {
    const p = this.cfg();
    if (!Array.isArray(ohlcv) || ohlcv.length < Math.max(p.bbLength, 30)) {
      return { action: 'HOLD', reason: 'Yetersiz mum verisi' };
    }

    this.ingest(ohlcv, p);
    const s = this.st;
    const son = ohlcv[ohlcv.length - 1];
    const fiyat = (ticker && ticker.last) || son.close;
    const poz = SigmoidBbStrategy.positionSummary(positions);

    const gostergeler = {
      dir: s.direction,
      stop: s.trailingStop ? +s.trailingStop.toFixed(6) : null,
      atr: s.atr ? +s.atr.toFixed(6) : null,
      z: s.bb ? +s.bb.z.toFixed(2) : null,
      bbUpper: s.bb ? +s.bb.upper.toFixed(6) : null,
      bbLower: s.bb ? +s.bb.lower.toFixed(6) : null
    };

    // Isınma: ATR(200) dolmadan hiçbir karar verilmez.
    if (!Number.isFinite(s.atr) || !s.bb || s.trailingStop === null) {
      return { action: 'HOLD', reason: `Isınma (ATR ${p.atrLength} bekleniyor)`, indicators: gostergeler };
    }

    // İşlem durumu: pozisyon yokken kademe sayaçları sıfırlanır.
    if (!poz) s.trade = null;
    else if (!s.trade) {
      s.trade = { entryPrice: poz.entryPrice, tpDone: 0, extremeDone: false, openedAt: s.lastTime };
    }

    const takip = p.sendTrailingStop && poz ? s.trailingStop : undefined;
    const komisyonGidisDonus = p.feePct * 2;

    // ── ÇIKIŞ TARAFI (pozisyon varken) ───────────────────────────────────
    if (poz) {
      // SHORT AYNADAKİ KARŞILIĞIDIR: kâr fiyat düşünce oluşur, hedef ALT band,
      // ekstrem NEGATİF z, trend dönüşü yukarı flip. Tek yön çarpanı ve tek
      // hedef bandı değişkeniyle iki taraf da aynı koddan geçiyor — mantığı
      // ikinci kez yazmak, birinde yapılan düzeltmenin diğerine geçmemesi
      // demekti.
      const kisa = poz.side === 'short';
      const yon = kisa ? -1 : 1;
      const kar = yon * (fiyat - s.trade.entryPrice) / s.trade.entryPrice * 100;
      const hedefBant = kisa ? s.bb.lower : s.bb.upper;

      // 1) Trend dönüşü: sigmoid TS flip → tamamını kapat.
      //    (Stop zaten motora gönderiliyor; bu, kapanış bazlı yedek çıkış.)
      if ((kisa && s.direction === 1) || (!kisa && s.direction === -1)) {
        return {
          action: 'SELL', closeAll: true, updateStop: takip,
          reason: `Sigmoid TS trend dönüşü (stop $${s.trailingStop.toFixed(4)})`,
          indicators: gostergeler
        };
      }

      // 2) Ekstrem sapma: |z| eşiği aşarsa büyük dilim.
      if (!s.trade.extremeDone && (kisa ? s.bb.z <= -p.extremeZ : s.bb.z >= p.extremeZ)) {
        const kapiTamam = kar >= komisyonGidisDonus * p.minTpCostMultiple;
        if (kapiTamam) {
          s.trade.extremeDone = true;
          if (p.extremeMode === 'hedge' && p.marketType === 'perpetual') {
            // Gerçek karşı pozisyon — motor SHORT işlemediği için bugün etkisiz.
            return {
              action: 'SHORT', allocationPct: p.allocationPct * p.extremeExitPct, updateStop: takip,
              reason: `Ekstrem sapma z=${s.bb.z.toFixed(2)} — karşı pozisyon`,
              indicators: gostergeler
            };
          }
          return {
            action: 'SELL', partialPct: Math.min(0.95, p.extremeExitPct), updateStop: takip,
            reason: `Ekstrem sapma z=${s.bb.z.toFixed(2)} ≥ ${p.extremeZ} — büyük dilim (kâr %${kar.toFixed(2)})`,
            indicators: gostergeler
          };
        }
      }

      // 3) Kademeli TP: üst banda dokunuşlarda sırayla çık.
      const dilimler = [p.tp1Pct, p.tp2Pct, p.tp3Pct];
      if (s.trade.tpDone < dilimler.length) {
        const bandaDegdi = kisa
          ? (p.requireBandClose ? son.close <= hedefBant : son.low <= hedefBant)
          : (p.requireBandClose ? son.close >= hedefBant : son.high >= hedefBant);
        if (bandaDegdi) {
          const kapiTamam = kar >= komisyonGidisDonus * p.minTpCostMultiple;
          if (!kapiTamam) {
            return {
              action: 'HOLD', updateStop: takip,
              reason: `Band dokunuşu ama maliyet kapısı kapalı (kâr %${kar.toFixed(2)} < %${(komisyonGidisDonus * p.minTpCostMultiple).toFixed(2)})`,
              indicators: gostergeler
            };
          }

          // Dilimler ORİJİNAL pozisyonun oranı; motor ise KALAN üzerinden
          // kesiyor. Kalan oran hesaplanmazsa üçüncü dilim ilkinden çok daha
          // küçük olurdu.
          const oncekiToplam = dilimler.slice(0, s.trade.tpDone).reduce((a, b) => a + b, 0);
          const kalanOran = 1 - oncekiToplam;
          const dilim = dilimler[s.trade.tpDone];
          const partial = kalanOran > 0 ? Math.min(0.95, dilim / kalanOran) : 0.95;

          s.trade.tpDone++;
          return {
            action: 'SELL', partialPct: partial, updateStop: takip,
            reason: `Kademeli TP ${s.trade.tpDone}/${dilimler.length} — ${kisa ? 'alt' : 'üst'} band $${hedefBant.toFixed(4)} (kâr %${kar.toFixed(2)})`,
            indicators: gostergeler
          };
        }
      }

      // 4) Koşucu: sigmoid TS ile taşınır, stop her barda güncellenir.
      return {
        action: 'HOLD', updateStop: takip,
        reason: `Pozisyon taşınıyor (TS $${s.trailingStop.toFixed(4)}, kademe ${s.trade.tpDone}/3)`,
        indicators: gostergeler
      };
    }

    // ── GİRİŞ TARAFI (pozisyon yokken) ───────────────────────────────────
    //
    // SHORT yalnızca perpetual piyasada üretilir. Spotta borsa açığa satışa
    // izin vermiyor; sinyal üretmek onu "etkisiz ama kafa karıştırıcı" bir
    // koda çevirirdi. `marketType` stratejinin ayarı değil, motorun enjekte
    // ettiği borsa gerçeğidir.
    const shortSerbest = p.marketType === 'perpetual' && p.allowShorts !== false;
    const kisaGiris = s.direction === -1;

    if (kisaGiris && !shortSerbest) {
      return { action: 'HOLD', reason: 'Sigmoid TS ayı yönünde — spotta short yok', indicators: gostergeler };
    }

    let girisTamam = false;
    let girisSebep = '';

    if (p.entryMode === 'flip') {
      // Yalnızca flip BARINDA gir: sonraki barlarda girmek, trendin ortasında
      // rastgele bir yerden girmek olur.
      girisTamam = kisaGiris ? s.flipAtLastBar === -1 : s.flipAtLastBar === 1;
      girisSebep = kisaGiris ? 'Sigmoid TS ayı flip' : 'Sigmoid TS boğa flip';
    } else if (p.entryMode === 'pullback') {
      // Trend yönünde orta banda geri çekilme (short'ta yukarıdan).
      girisTamam = kisaGiris
        ? (son.high >= s.bb.middle && son.close < s.bb.middle)
        : (son.low <= s.bb.middle && son.close > s.bb.middle);
      girisSebep = `Orta banda geri çekilme (trend ${kisaGiris ? 'aşağı' : 'yukarı'})`;
    } else if (p.entryMode === 'bandFade') {
      girisTamam = kisaGiris ? son.high >= s.bb.upper : son.low <= s.bb.lower;
      girisSebep = `${kisaGiris ? 'Üst' : 'Alt'} band dokunuşu (trend ${kisaGiris ? 'aşağı' : 'yukarı'})`;
    }

    if (!girisTamam) {
      return { action: 'HOLD', reason: 'Giriş koşulu yok', indicators: gostergeler };
    }

    // Stop mesafesi TS'den gelir; short'ta stop fiyatın ÜSTÜNDEdir.
    const stopMesafesiPct = kisaGiris
      ? ((s.trailingStop - fiyat) / fiyat) * 100
      : ((fiyat - s.trailingStop) / fiyat) * 100;
    if (!(stopMesafesiPct > 0)) {
      return { action: 'HOLD', reason: 'Stop yanlış tarafta — giriş atlandı', indicators: gostergeler };
    }

    // Maliyet kapısı: hedef banda kadarki mesafe komisyonu karşılamıyorsa
    // işlem açmanın anlamı yok.
    const hedefBantGiris = kisaGiris ? s.bb.lower : s.bb.upper;
    const hedefMesafePct = kisaGiris
      ? ((fiyat - hedefBantGiris) / fiyat) * 100
      : ((hedefBantGiris - fiyat) / fiyat) * 100;
    if (hedefMesafePct < komisyonGidisDonus * p.minTpCostMultiple) {
      return {
        action: 'HOLD',
        reason: `Hedef mesafesi maliyeti karşılamıyor (%${hedefMesafePct.toFixed(2)} < %${(komisyonGidisDonus * p.minTpCostMultiple).toFixed(2)})`,
        indicators: gostergeler
      };
    }

    return {
      action: kisaGiris ? 'SHORT' : 'BUY',
      allocationPct: p.allocationPct,
      stopLossPct: +stopMesafesiPct.toFixed(4),
      takeProfitPct: p.hardTakeProfitPct,
      slLevel: +s.trailingStop.toFixed(6),
      updateStop: takip,
      reason: `${girisSebep} — stop $${s.trailingStop.toFixed(4)} (%${stopMesafesiPct.toFixed(2)}), hedef ${kisaGiris ? 'alt' : 'üst'} band $${hedefBantGiris.toFixed(4)}`,
      indicators: gostergeler
    };
  }
}

/**
 * Isınma bildirimi: strateji kaç bar sonra karar verebiliyor.
 *
 * ATR(300) ile 500 mumluk bir backtest çalıştırıldığında barların %60'ı
 * ısınmada geçiyor ve strateji "sadece 1 işlem açtı" gibi görünüyordu —
 * ayar bozuk değil, örneklem kısa. Bunu kullanıcının keşfetmesi yerine
 * backtest sonucu söylesin.
 */
SigmoidBbStrategy.warmupBars = (cfg = {}) =>
  Math.max(+cfg.atrLength || 200, +cfg.bbLength || 20) + 5;

/**
 * Ayar uyarıları — "strateji kötü" ile "ayar tutarsız"ı ayırır.
 *
 * En önemlisi `sigAmp < atrMult`: geçiş, boşluk `atrMult × ATR`'yi aşınca
 * TETİKLENİR ama yalnızca `sigAmp × ATR` kadar KAPATIR. sigAmp küçükse her
 * geçiş tetikleyen mesafenin bir kısmını kapatır, trend sürerken boşluk
 * yeniden açılır ve stop kalıcı olarak geride kalır.
 *
 * Ölçüldü (BTC 4h, 1500 bar): atrMult 3 / sigAmp 1.5 ile stop fiyattan medyan
 * %8.13, en kötüde %42 uzakta ve 1500 barda yalnızca 8 flip oluyor. Eşit
 * tutulduğunda (3/3) medyan %3.34'e iniyor. LuxAlgo'nun orijinal
 * varsayılanlarının ikisi de 3.0 — tesadüf değil.
 */
SigmoidBbStrategy.configWarnings = (cfg = {}) => {
  const uyari = [];
  const atrMult = +cfg.atrMult || 3;
  const sigAmp = +cfg.sigAmp || 3;
  const sigLength = +cfg.sigLength || 20;
  const tpToplam = (+cfg.tp1Pct || 0) + (+cfg.tp2Pct || 0) + (+cfg.tp3Pct || 0);

  if (sigAmp < atrMult) {
    uyari.push(
      `Sigmoid genliği (${sigAmp}) ATR çarpanından (${atrMult}) küçük: stop, tetikleyen mesafeyi kapatamaz ve `
      + `fiyattan kalıcı olarak uzaklaşır. Grafikte "fiyatı takip etmeyen" çizgi ve çok az flip bunun belirtisidir. `
      + `sigAmp ≥ atrMult olmalı.`
    );
  }
  if (sigLength > 30 && sigAmp <= atrMult) {
    uyari.push(`Sigmoid uzunluğu ${sigLength} bar: yaklaşma çok yavaş, stop trendin gerisinde kalır.`);
  }
  if (tpToplam > 1) {
    uyari.push(`Kademe oranları toplamı ${tpToplam.toFixed(2)} > 1 — üçüncü dilim pozisyonun tamamını kapatır, koşucu kalmaz.`);
  }
  if (+cfg.extremeZ > 4.2) {
    uyari.push(`Ekstrem eşiği ${cfg.extremeZ}: BB(${cfg.bbLength || 20}) ile |z| matematiksel tavanı ~4.25, bu kural HİÇ tetiklenmez.`);
  }
  return uyari;
};

/**
 * Parametre bildirimi — panel formu bundan ÜRETİLİR, elle HTML yazılmaz.
 *
 * Eskiden her strateji için `index.html`'e elle form blokları yazılıyordu;
 * stratejiler arşive taşınınca 177 satırlık form ölü kaldı ve yeni strateji
 * panelden hiç ayarlanamıyordu. Gösterge havuzunda uygulanan çözümün aynısı:
 * tip, sınır ve açıklama burada durur, arayüz okur.
 */
SigmoidBbStrategy.paramSchema = {
  entryMode: {
    type: 'enum', values: ['flip', 'pullback', 'bandFade'], default: 'flip',
    label: 'Giriş biçimi', group: 'Giriş',
    description: 'flip: sigmoid TS yön dönüşünde gir · pullback: trend yukarıyken orta banda geri çekilmede · bandFade: alt band dokunuşunda'
  },
  allocationPct: { type: 'number', default: 20, min: 1, max: 100, step: 1, label: 'Pozisyon büyüklüğü (% nakit)', group: 'Giriş' },

  atrLength: { type: 'number', default: 200, min: 10, max: 500, step: 10, label: 'ATR periyodu', group: 'Sigmoid Trailing Stop', description: 'Stop mesafesinin temeli. 200 çok yavaştır; rejim değişimine geç tepki verir.' },
  atrMult: { type: 'number', default: 3.0, min: 0.5, max: 8, step: 0.1, label: 'ATR çarpanı', group: 'Sigmoid Trailing Stop', description: 'Flip anındaki başlangıç stop mesafesi ve geçiş tetik eşiği.' },
  sigLength: { type: 'number', default: 20, min: 2, max: 100, step: 1, label: 'Sigmoid uzunluğu (bar)', group: 'Sigmoid Trailing Stop', description: 'Stop yaklaşmasının kaç barda tamamlanacağı. Hareketin çoğu ortadaki barlarda olur.' },
  sigAmp: { type: 'number', default: 3.0, min: 0.1, max: 10, step: 0.1, label: 'Sigmoid genliği (ATR)', group: 'Sigmoid Trailing Stop', description: 'Geçiş boyunca stopun fiyata ne kadar yaklaşacağı.' },
  minDistMult: { type: 'number', default: 0.5, min: 0, max: 3, step: 0.1, label: 'Minimum mesafe (ATR)', group: 'Sigmoid Trailing Stop', description: 'Stop fiyata bu kadar yaklaşınca yaklaşma durur — bilerek yapışmaz.' },
  sendTrailingStop: { type: 'boolean', default: true, label: 'Stopu motora gönder', group: 'Sigmoid Trailing Stop', description: 'Kapalıysa stop yalnızca kapanış bazlı çıkış sinyaliyle çalışır (bar içi tetiklenmez).' },

  bbLength: { type: 'number', default: 20, min: 5, max: 200, step: 1, label: 'Bollinger periyodu', group: 'Bollinger' },
  bbStdDev: { type: 'number', default: 2.0, min: 0.5, max: 5, step: 0.1, label: 'Bollinger sapma (σ çarpanı)', group: 'Bollinger', description: 'Kademeli TP hedefi olan üst/alt bandın genişliği.' },
  requireBandClose: { type: 'boolean', default: false, label: 'Bandı kapanışla teyit et', group: 'Bollinger', description: 'Açıkken fitille dokunmak yetmez, kapanış bandın ötesinde olmalı.' },

  tp1Pct: { type: 'number', default: 0.30, min: 0, max: 1, step: 0.05, label: '1. kademe TP (oran)', group: 'Kademeli Çıkış' },
  tp2Pct: { type: 'number', default: 0.30, min: 0, max: 1, step: 0.05, label: '2. kademe TP (oran)', group: 'Kademeli Çıkış' },
  tp3Pct: { type: 'number', default: 0.20, min: 0, max: 1, step: 0.05, label: '3. kademe TP (oran)', group: 'Kademeli Çıkış', description: 'Kalan (1 − toplam) sigmoid TS ile taşınan koşucudur.' },
  minTpCostMultiple: { type: 'number', default: 2.0, min: 0, max: 10, step: 0.5, label: 'Maliyet kapısı (komisyon katı)', group: 'Kademeli Çıkış', description: 'Kâr, gidiş-dönüş komisyonun bu katını geçmeden dilim alınmaz. 0 = kapalı.' },
  feePct: { type: 'number', default: 0.15, min: 0, max: 1, step: 0.01, label: 'Tek yön komisyon (%)', group: 'Kademeli Çıkış' },
  hardTakeProfitPct: { type: 'number', default: 30, min: 1, max: 200, step: 1, label: 'Yedek sabit TP (%)', group: 'Kademeli Çıkış', description: 'Motorun sabit take-profit freni. Düşük tutulursa kademeli çıkışla yarışır ve onu etkisizleştirir.' },

  extremeZ: { type: 'number', default: 2.8, min: 1, max: 4.2, step: 0.1, label: 'Ekstrem sapma eşiği (z)', group: 'Ekstrem Sapma', description: 'BB(20) ile |z| matematiksel olarak ~4.25 tavanına çarpar; 5 yazılırsa kural HİÇ tetiklenmez.' },
  extremeExitPct: { type: 'number', default: 0.40, min: 0, max: 0.95, step: 0.05, label: 'Ekstremde çıkış oranı', group: 'Ekstrem Sapma' },
  extremeMode: {
    type: 'enum', values: ['exit', 'hedge'], default: 'exit',
    label: 'Ekstrem davranışı', group: 'Ekstrem Sapma',
    description: 'exit: büyük dilim sat · hedge: karşı pozisyon aç (perpetual ister; motor SHORT işlemediği için bugün etkisiz)'
  }
};

/**
 * Optimizasyon ızgarası — optimizatör bunu okur, orada elle kod yazılmaz.
 * Değerler ölçümden seçildi: `extremeZ` 4 üstü matematiksel olarak
 * imkânsız olduğu için ızgaraya konmadı.
 */
SigmoidBbStrategy.optimizeGrid = {
  atrLength: [100, 200, 300],
  atrMult: [2.0, 3.0, 4.0],
  sigLength: [10, 20, 40],
  sigAmp: [1.5, 3.0, 4.5],
  bbLength: [20, 34],
  bbStdDev: [2.0, 2.5],
  entryMode: ['flip', 'pullback', 'bandFade'],
  tp1Pct: [0.2, 0.3, 0.4],
  tp3Pct: [0.1, 0.2],
  extremeZ: [2.2, 2.8, 3.2],
  extremeExitPct: [0.3, 0.4, 0.5],
  minTpCostMultiple: [1.0, 2.0, 3.0]
};

module.exports = SigmoidBbStrategy;
