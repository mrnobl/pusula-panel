const BaseStrategy = require('./baseStrategy');
const pool = require('../indicatorPool');

/**
 * 3COMMAS TARZI DCA BOTU — YERLİ UYARLAMA
 *
 * Kaynak: "Backtesting 3commas DCA Bot v2" (© rouxam, MPL 2.0)
 * https://mozilla.org/MPL/2.0/
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN PINE ÇEVİRİCİDEN GEÇİRİLMEDİ DE ELLE YAZILDI
 * ─────────────────────────────────────────────────────────────────────────
 * Betiğin özgün hâli Pine v4'tür ve çeviricinin desteklemediği yerlere
 * dokunuyor: `security()`, `array.*`, v4'ün ad alanı olmayan gösterge
 * çağrıları. Çevrilmiş bir sürüm ancak parçaları atılarak çalışıyordu ve
 * her yeni ayarda başka bir kenar duruma çarpıyordu.
 *
 * Yerli uyarlama bu belirsizliği tamamen kaldırır: motorun kendi
 * göstergelerini ve emir defterini doğrudan kullanır, çeviri katmanı yoktur.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MERDİVEN — botun kalbi
 * ─────────────────────────────────────────────────────────────────────────
 * Bir "deal" açılırken TEK SEFERDE 1 baz + N güvenlik emri masaya konur:
 *
 *   BO  : giriş fiyatı (koşulun sağlandığı barın kapanışı)
 *   SO1 : BO × (1 − sapma)
 *   SO2 : SO1 × (1 − sapma × adımÇarpanı)
 *   SO3 : SO2 × (1 − sapma × adımÇarpanı²)      …
 *
 * Tutarlar da büyür: güvenlikTutarı × hacimÇarpanı^(i−1). Ortalama düşürme
 * gücü bu iki çarpandan gelir; basamakları eşitlemek DCA'yı sıradan bir
 * kademeli alıma çevirir.
 *
 * Emirler KALICIDIR (motorun emir defteri) ve doldukça pozisyona ortalama
 * alınarak eklenir. Deal kapanınca kalan emirler iptal edilir — yoksa
 * ilerideki bir barda kendiliğinden dolup merdivensiz bir pozisyon açarlar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ÖZGÜN BETİKTEN BİLİNÇLİ FARKLAR
 * ─────────────────────────────────────────────────────────────────────────
 * · Tarih penceresi (`start_time`/`end_time`) YOK — test aralığı mum sayısıyla
 *   belirleniyor, ikinci bir pencere kafa karıştırırdı.
 * · Sonuç tablosu YOK — motorun kendi backtest raporu aynı bilgileri üretir.
 *   Ama tablodaki UYARILAR korundu ve `configWarnings`e taşındı; onlar
 *   raporlama değil TEŞHİS'ti (bkz. CLAUDE.md "sonuçlar sıfır" vakası).
 * · Gösterge zaman dilimi (`dsc_res`) YOK — motor tek zaman dilimi okur.
 *   Özgün betikte de boş bırakıldığında grafik zaman dilimi kullanılıyordu.
 */

const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);

/** `pool.computeOne` çıktısından tek seriyi alır. */
function seri(cikti, ad) {
  const s = cikti && cikti[ad];
  return Array.isArray(s) ? s : [];
}

class DcaBotStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('DCA Botu (3commas tarzı)', config);
    this.hazir = null;
    this.dealSayaci = 0;
    this.stopSayaci = 0;
    this.boSeviye = null;
    this.ttpAktif = false;
    this.ttpUc = null;
    this.oncekiPozVar = false;
    // Deal ömrü: merdiven kurulduktan sonra geçen bar sayısı.
    this.dealBar = 0;
    this.sayilanBarZaman = null;
  }

  cfg() {
    const c = this.config || {};
    const s = (ad, vars) => (c[ad] !== undefined ? c[ad] : vars);
    return {
      dsc: s('dsc', 'RSI-7'),
      dscRsiThreshold: +s('dscRsiThreshold', 30),
      dscTechnicals: s('dscTechnicals', 'Strong'),
      botDirection: s('botDirection', 'Long'),

      orderSizeType: s('orderSizeType', 'Fixed'),
      baseOrder: +s('baseOrder', 100),
      safeOrder: +s('safeOrder', 140),
      maxSafeOrder: Math.max(0, Math.floor(+s('maxSafeOrder', 6))),
      priceDeviation: +s('priceDeviation', 1.5) / 100,
      safeOrderVolumeScale: +s('safeOrderVolumeScale', 1.5),
      safeOrderStepScale: +s('safeOrderStepScale', 1.6),

      takeProfit: +s('takeProfit', 4.5) / 100,
      takeProfitType: s('takeProfitType', '% from total volume'),
      ttp: +s('ttp', 0) / 100,
      stopLoss: +s('stopLoss', 0) / 100,
      dealMaxBar: Math.max(0, Math.floor(+s('dealMaxBar', 0)))
    };
  }

  get uzunMu() { return this.cfg().botDirection !== 'Short'; }

  // ── Merdiven hesapları ────────────────────────────────────────────────
  /** `index`. güvenlik emrinin BİR ÖNCEKİ seviyeye göre sapması. */
  sapma(index, p) { return p.priceDeviation * Math.pow(p.safeOrderStepScale, index - 1); }

  /** `index`. güvenlik emrinin TUTARI (para birimi). */
  guvenlikTutari(index, p, sermaye) {
    const taban = p.orderSizeType === 'Fixed' ? p.safeOrder : (p.safeOrder / 100) * sermaye;
    return taban * Math.pow(p.safeOrderVolumeScale, index - 1);
  }

  bazTutar(p, sermaye) {
    return p.orderSizeType === 'Fixed' ? p.baseOrder : (p.baseOrder / 100) * sermaye;
  }

  /** Merdivenin tamamı için gereken toplam tutar. */
  static toplamTutar(p, sermaye) {
    const taban = p.orderSizeType === 'Fixed' ? p.baseOrder : (p.baseOrder / 100) * sermaye;
    let toplam = taban;
    for (let i = 1; i <= p.maxSafeOrder; i++) {
      const g = p.orderSizeType === 'Fixed' ? p.safeOrder : (p.safeOrder / 100) * sermaye;
      toplam += g * Math.pow(p.safeOrderVolumeScale, i - 1);
    }
    return toplam;
  }

  /** Merdivenin en alt basamağına kadar toplam fiyat sapması. */
  static toplamSapma(p) {
    let t = 0;
    for (let i = 1; i <= p.maxSafeOrder; i++) {
      t += p.priceDeviation * Math.pow(p.safeOrderStepScale, i - 1);
    }
    return t;
  }

  // ── Göstergeler ───────────────────────────────────────────────────────
  /**
   * Giriş koşulunun gösterge serilerini TÜM seride bir kez hesaplar.
   *
   * İleriye bakma DEĞİLDİR: kullanılan göstergelerin hepsi havuzun lookahead
   * testinden geçiyor, yani `i`. bardaki değer seri `i`'de kesilse de aynı.
   */
  prepare(candles) {
    if (!Array.isArray(candles) || candles.length < 60) { this.hazir = null; return; }
    const p = this.cfg();
    const n = candles.length;

    try {
      const zaman = new Map();
      candles.forEach((c, i) => zaman.set(c.time, i));

      if (p.dsc === 'RSI-7') {
        const rsi7 = seri(pool.computeOne(candles, 'rsi', { period: 7 }), 'value');
        this.hazir = { zaman, n, kosul: rsi7.map(v => {
          if (!sayiMi(v)) return false;
          return this.uzunMu ? v < p.dscRsiThreshold : v > p.dscRsiThreshold;
        }) };
        return;
      }

      /**
       * 'RSI-2+SMA200' — Connors ("Short Term Trading Strategies That Work", 2008) hisse/ETF girişi:
       * RSI(2) < eşik VE kapanış > SMA(200) (short yönde ayna: RSI(2) > eşik VE kapanış < SMA200).
       * PLAN-NASDAQ-KOL3.md D2; eşik `dscRsiThreshold` (ön kayıt 10). Havuz göstergeleri i'de
       * yalnız ≤ i veri kullanır (lookahead testi). SMA200 ısınmamışsa koşul yanlış.
       */
      if (p.dsc === 'RSI-2+SMA200') {
        const rsi2 = seri(pool.computeOne(candles, 'rsi', { period: 2 }), 'value');
        const sma200 = seri(pool.computeOne(candles, 'sma', { period: 200 }), 'value');
        this.hazir = { zaman, n, kosul: rsi2.map((v, i) => {
          const m = sma200[i], c = candles[i].close;
          if (!sayiMi(v) || !sayiMi(m) || !sayiMi(c)) return false;
          return this.uzunMu ? (v < p.dscRsiThreshold && c > m) : (v > p.dscRsiThreshold && c < m);
        }) };
        return;
      }

      if (p.dsc === 'TV presets') {
        const puan = this.teknikPuan(candles);
        const sinir = p.dscTechnicals === 'Strong' ? 0.5 : 0.1;
        this.hazir = { zaman, n, puan, kosul: puan.map(v => {
          if (!sayiMi(v)) return false;
          return this.uzunMu ? v > sinir : v < -sinir;
        }) };
        return;
      }

      // "Start ASAP"
      this.hazir = { zaman, n, kosul: new Array(n).fill(true) };
    } catch (err) {
      this.hazir = null;
    }
  }

  /**
   * TradingView "Technical Ratings" puanı (−1 … +1).
   *
   * Özgün betiğin kopyaladığı hesabın aynısı: MA ailesi ve osilatör ailesi
   * ayrı ayrı puanlanır, ikisinin ortalaması alınır. Her bileşen +1 (al),
   * −1 (sat) ya da 0 (nötr) verir.
   *
   * DOĞRULAMA NOTU: bu hesap TradingView'ın kendi çıktısıyla KARŞILAŞTIRILMADI
   * — elimizde referans değer yok. Formüller özgün betikten birebir taşındı
   * ama "TradingView ile aynı sayıyı üretir" İDDİA EDİLMİYOR. Bu giriş
   * koşulunu kullanan sonuçlar bu belirsizlikle okunmalı; `RSI-7` ve
   * `Start ASAP` böyle bir belirsizlik taşımaz.
   */
  teknikPuan(candles) {
    const n = candles.length;
    const kapanis = candles.map(c => c.close);
    const hl2 = candles.map(c => (c.high + c.low) / 2);

    const sma = (per) => seri(pool.computeOne(candles, 'sma', { period: per }), 'value');
    const ema = (per) => seri(pool.computeOne(candles, 'ema', { period: per }), 'value');

    const smaLar = [10, 20, 30, 50, 100, 200].map(sma);
    const emaLar = [10, 20, 30, 50, 100, 200].map(ema);
    const hull9 = seri(pool.computeOne(candles, 'hma', { period: 9 }), 'value');
    const vwma20 = seri(pool.computeOne(candles, 'vwma', { period: 20 }), 'value');

    const rsi14 = seri(pool.computeOne(candles, 'rsi', { period: 14 }), 'value');
    const stoch = pool.computeOne(candles, 'stochastic', { period: 14, signalPeriod: 3 });
    const kSt = seri(stoch, 'k'), dSt = seri(stoch, 'd');
    const cci20 = seri(pool.computeOne(candles, 'cci', { period: 20 }), 'value');
    const adx = pool.computeOne(candles, 'adx', { period: 14 });
    const adxV = seri(adx, 'adx'), pdi = seri(adx, 'pdi'), mdi = seri(adx, 'mdi');
    const macd = pool.computeOne(candles, 'macd', { fast: 12, slow: 26, signal: 9 });
    const macdL = seri(macd, 'macd'), macdS = seri(macd, 'signal');
    const wpr14 = seri(pool.computeOne(candles, 'williams_r', { period: 14 }), 'value');
    const ema13 = ema(13);
    const ema50 = ema(50);

    // Awesome Oscillator: sma(hl2,5) − sma(hl2,34). Havuzda hl2 kaynağı yok,
    // yerel hesaplanıyor.
    const smaDizi = (kaynak, per) => {
      const out = new Array(n).fill(null);
      let t = 0;
      for (let i = 0; i < n; i++) {
        t += kaynak[i];
        if (i >= per) t -= kaynak[i - per];
        if (i >= per - 1) out[i] = t / per;
      }
      return out;
    };
    const ao = (() => {
      const a = smaDizi(hl2, 5), b = smaDizi(hl2, 34);
      return a.map((v, i) => (sayiMi(v) && sayiMi(b[i]) ? v - b[i] : null));
    })();

    // Momentum: close − close[10]
    const mom = kapanis.map((v, i) => (i >= 10 ? v - kapanis[i - 10] : null));

    // Stochastic RSI: rsi(14) üzerinde stokastik(14), K=sma3, D=sma3(K)
    const stochRsiHam = (() => {
      const out = new Array(n).fill(null);
      for (let i = 0; i < n; i++) {
        if (i < 13 + 14) continue;
        let en = -Infinity, dip = Infinity;
        let gecerli = true;
        for (let j = i - 13; j <= i; j++) {
          const v = rsi14[j];
          if (!sayiMi(v)) { gecerli = false; break; }
          if (v > en) en = v;
          if (v < dip) dip = v;
        }
        if (!gecerli || en === dip) continue;
        out[i] = 100 * (rsi14[i] - dip) / (en - dip);
      }
      return out;
    })();
    const srK = smaDizi(stochRsiHam.map(v => (sayiMi(v) ? v : 0)), 3);
    const srD = smaDizi(srK.map(v => (sayiMi(v) ? v : 0)), 3);

    // Ultimate Oscillator (7/14/28)
    const uo = (() => {
      const tr = new Array(n).fill(null);
      const bp = new Array(n).fill(null);
      for (let i = 1; i < n; i++) {
        const c1 = candles[i - 1].close;
        const dipDusuk = Math.min(candles[i].low, c1);
        tr[i] = Math.max(candles[i].high, c1) - dipDusuk;
        bp[i] = candles[i].close - dipDusuk;
      }
      const topla = (dizi, per, i) => {
        let t = 0;
        for (let j = i - per + 1; j <= i; j++) {
          if (j < 1 || !sayiMi(dizi[j])) return null;
          t += dizi[j];
        }
        return t;
      };
      const out = new Array(n).fill(null);
      for (let i = 28; i < n; i++) {
        const t7 = topla(tr, 7, i), t14 = topla(tr, 14, i), t28 = topla(tr, 28, i);
        const b7 = topla(bp, 7, i), b14 = topla(bp, 14, i), b28 = topla(bp, 28, i);
        if (![t7, t14, t28, b7, b14, b28].every(sayiMi) || !t7 || !t14 || !t28) continue;
        const a0 = 28 / 7, a1 = 28 / 14;
        out[i] = ((b7 / t7) * a0 + (b14 / t14) * a1 + (b28 / t28)) / (a0 + a1 + 1) * 100;
      }
      return out;
    })();

    // Ichimoku: donchian(9/26/52) ortalamaları
    const don = (per) => {
      const d = pool.computeOne(candles, 'donchian', { period: per });
      const u = seri(d, 'upper'), l = seri(d, 'lower');
      return u.map((v, i) => (sayiMi(v) && sayiMi(l[i]) ? (v + l[i]) / 2 : null));
    };
    const icC = don(9), icB = don(26), icL2 = don(52);
    const icL1 = icC.map((v, i) => (sayiMi(v) && sayiMi(icB[i]) ? (v + icB[i]) / 2 : null));

    const puanMA = (ma, src) => (!sayiMi(ma) || !sayiMi(src) ? null : (ma === src ? 0 : (ma < src ? 1 : -1)));
    const puanla = (al, sat) => (al ? 1 : (sat ? -1 : 0));

    const sonuc = new Array(n).fill(null);
    for (let i = 1; i < n; i++) {
      const c = kapanis[i], c1 = kapanis[i - 1];

      // ── MA ailesi ──
      let mToplam = 0, mAdet = 0;
      for (const dizi of [...smaLar, ...emaLar, hull9, vwma20]) {
        const r = puanMA(dizi[i], c);
        if (r !== null) { mToplam += r; mAdet++; }
      }
      if (sayiMi(icL1[i]) && sayiMi(icL2[i]) && sayiMi(icB[i]) && sayiMi(icC[i]) && sayiMi(c1)) {
        mToplam += puanla(
          icL1[i] > icL2[i] && c > icL1[i] && c < icB[i] && c1 < icC[i] && c > icC[i],
          icL2[i] > icL1[i] && c < icL2[i] && c > icB[i] && c1 > icC[i] && c < icC[i]);
        mAdet++;
      }
      const maPuan = mAdet > 0 ? mToplam / mAdet : null;

      // ── Osilatör ailesi ──
      let oToplam = 0, oAdet = 0;
      const trendAsagi = sayiMi(ema50[i]) && c < ema50[i];
      const trendYukari = sayiMi(ema50[i]) && c > ema50[i];

      if (sayiMi(rsi14[i]) && sayiMi(rsi14[i - 1])) {
        oToplam += puanla(rsi14[i] < 30 && rsi14[i - 1] < rsi14[i], rsi14[i] > 70 && rsi14[i - 1] > rsi14[i]);
        oAdet++;
      }
      if ([kSt[i], dSt[i], kSt[i - 1], dSt[i - 1]].every(sayiMi)) {
        oToplam += puanla(
          kSt[i] < 20 && dSt[i] < 20 && kSt[i] > dSt[i] && kSt[i - 1] < dSt[i - 1],
          kSt[i] > 80 && dSt[i] > 80 && kSt[i] < dSt[i] && kSt[i - 1] > dSt[i - 1]);
        oAdet++;
      }
      if (sayiMi(cci20[i]) && sayiMi(cci20[i - 1])) {
        oToplam += puanla(cci20[i] < -100 && cci20[i] > cci20[i - 1], cci20[i] > 100 && cci20[i] < cci20[i - 1]);
        oAdet++;
      }
      if ([adxV[i], pdi[i], mdi[i], pdi[i - 1], mdi[i - 1]].every(sayiMi)) {
        oToplam += puanla(
          adxV[i] > 20 && pdi[i - 1] < mdi[i - 1] && pdi[i] > mdi[i],
          adxV[i] > 20 && pdi[i - 1] > mdi[i - 1] && pdi[i] < mdi[i]);
        oAdet++;
      }
      if (sayiMi(ao[i]) && sayiMi(ao[i - 1]) && i >= 2 && sayiMi(ao[i - 2])) {
        const yukariKes = ao[i - 1] <= 0 && ao[i] > 0;
        const asagiKes = ao[i - 1] >= 0 && ao[i] < 0;
        oToplam += puanla(
          yukariKes || (ao[i] > 0 && ao[i - 1] > 0 && ao[i] > ao[i - 1] && ao[i - 2] > ao[i - 1]),
          asagiKes || (ao[i] < 0 && ao[i - 1] < 0 && ao[i] < ao[i - 1] && ao[i - 2] < ao[i - 1]));
        oAdet++;
      }
      if (sayiMi(mom[i]) && sayiMi(mom[i - 1])) {
        oToplam += puanla(mom[i] > mom[i - 1], mom[i] < mom[i - 1]);
        oAdet++;
      }
      if (sayiMi(macdL[i]) && sayiMi(macdS[i])) {
        oToplam += puanla(macdL[i] > macdS[i], macdL[i] < macdS[i]);
        oAdet++;
      }
      if ([srK[i], srD[i], srK[i - 1], srD[i - 1]].every(sayiMi) && sayiMi(ema50[i])) {
        oToplam += puanla(
          trendAsagi && srK[i] < 20 && srD[i] < 20 && srK[i] > srD[i] && srK[i - 1] < srD[i - 1],
          trendYukari && srK[i] > 80 && srD[i] > 80 && srK[i] < srD[i] && srK[i - 1] > srD[i - 1]);
        oAdet++;
      }
      if (sayiMi(wpr14[i]) && sayiMi(wpr14[i - 1])) {
        oToplam += puanla(wpr14[i] < -80 && wpr14[i] > wpr14[i - 1], wpr14[i] > -20 && wpr14[i] < wpr14[i - 1]);
        oAdet++;
      }
      if (sayiMi(ema13[i]) && sayiMi(ema13[i - 1]) && sayiMi(ema50[i])) {
        const boga = candles[i].high - ema13[i];
        const ayi = candles[i].low - ema13[i];
        const bogaOnce = candles[i - 1].high - ema13[i - 1];
        const ayiOnce = candles[i - 1].low - ema13[i - 1];
        oToplam += puanla(
          trendYukari && ayi < 0 && ayi > ayiOnce,
          trendAsagi && boga > 0 && boga < bogaOnce);
        oAdet++;
      }
      if (sayiMi(uo[i])) {
        oToplam += puanla(uo[i] > 70, uo[i] < 30);
        oAdet++;
      }
      const osPuan = oAdet > 0 ? oToplam / oAdet : null;

      // ── Toplam ──
      let tToplam = 0, tAdet = 0;
      if (sayiMi(maPuan)) { tToplam += maPuan; tAdet++; }
      if (sayiMi(osPuan)) { tToplam += osPuan; tAdet++; }
      sonuc[i] = tAdet > 0 ? tToplam / tAdet : null;
    }
    return sonuc;
  }

  indeksBul(ohlcv) {
    const son = ohlcv[ohlcv.length - 1];
    if (this.hazir && this.hazir.zaman.has(son.time)) return this.hazir.zaman.get(son.time);
    return null;
  }

  // ── Değerlendirme ─────────────────────────────────────────────────────
  evaluate(ohlcv, ticker, positions, motorDurumu) {
    const p = this.cfg();
    if (!Array.isArray(ohlcv) || ohlcv.length < 60) {
      return { action: 'HOLD', reason: 'Yetersiz mum verisi' };
    }
    if (!this.hazir || !this.hazir.zaman.has(ohlcv[ohlcv.length - 1].time)) this.prepare(ohlcv);
    if (!this.hazir) return { action: 'HOLD', reason: 'Göstergeler hazırlanamadı' };

    const i = this.indeksBul(ohlcv);
    if (i === null) return { action: 'HOLD', reason: 'Bar indeksi çözülemedi' };

    const mum = ohlcv[i];
    const acik = (positions || []).filter(x => x && x.amount > 0);
    const poz = acik[0] || null;
    const acikEmir = motorDurumu ? (motorDurumu.openOrders || 0) : 0;
    const sermaye = motorDurumu && sayiMi(motorDurumu.equity) ? motorDurumu.equity : 10000;
    const uzun = this.uzunMu;

    /**
     * DEAL ÖMRÜ SAYACI.
     *
     * "Deal" merdivenin kurulduğu anda başlar — pozisyon açıldığı anda
     * değil. Dolmayan bir merdiven de masayı işgal eder ve yeni deal'i
     * engeller, yani o da ölçülmesi gereken bir ömürdür.
     *
     * Bar zamanı karşılaştırılıyor çünkü canlıda `evaluate` aynı bar içinde
     * defalarca çağrılır; indeks yerine zaman kullanmak backtest ile canlıyı
     * aynı sayıya götürür.
     */
    const dealAcik = !!poz || acikEmir > 0;
    if (dealAcik && this.sayilanBarZaman !== mum.time) {
      this.dealBar++;
      this.sayilanBarZaman = mum.time;
    }

    const gostergeler = {
      deal: this.dealSayaci,
      boSeviye: sayiMi(this.boSeviye) ? +this.boSeviye.toFixed(6) : null,
      acikEmir,
      dealBar: this.dealBar,
      ttp: this.ttpAktif
    };

    // ── Deal kapandı: kalan merdiven emirlerini iptal et ──
    // Kalan güvenlik emirleri masada bırakılırsa ilerideki bir barda dolup
    // MERDİVENSİZ bir pozisyon açarlar; o pozisyonun ortalama düşürme planı
    // olmaz ve ölçtüğümüz şey DCA botu olmaktan çıkar.
    if (this.oncekiPozVar && !poz) {
      this.oncekiPozVar = false;
      this.ttpAktif = false;
      this.ttpUc = null;
      this.boSeviye = null;
      this.dealBar = 0;
      return { action: 'HOLD', cancelAll: true, reason: 'Deal kapandı — merdiven iptal', indicators: gostergeler };
    }
    this.oncekiPozVar = !!poz;

    /**
     * ÖMÜR SINIRI — deal `dealMaxBar` bar içinde kapanmazsa zorla kapatılır.
     *
     * Bu botun ölçülmüş hastalığına karşı (`PLAN-DCA.md` §6): stop kapalı ve
     * ömür sınırı yokken, hedefe ulaşmayan bir pozisyon SONSUZA KADAR
     * taşınıyor — ölçümde 4.8 yıl açık kalıp %88 zarardaki deal'ler çıktı.
     * O pozisyon yalnızca zarar etmiyor, sermayeyi de kilitliyor ve bot
     * yeni deal açamıyor.
     *
     * Stop'tan FARKI, kapatma kararının FİYATA DEĞİL SÜREYE bakması. Stop
     * bu botta ayrıca kısıtlı: toplam sapmadan küçükse merdiveni iptal
     * ettiği için hiç uygulanmıyor (aşağıya bakın). Ömür sınırının böyle
     * bir çelişkisi yok, merdivenin tamamı dolabilir.
     *
     * VARSAYILAN 0 = KAPALI. Yeni davranış parametre arkasındadır; açıkça
     * verilmedikçe botun eski ölçümleri aynen tekrarlanabilir kalır.
     */
    if (p.dealMaxBar > 0 && dealAcik && this.dealBar >= p.dealMaxBar) {
      this.ttpAktif = false;
      this.ttpUc = null;
      this.boSeviye = null;
      this.dealBar = 0;
      this.oncekiPozVar = false;
      if (poz) {
        return {
          action: 'SELL', cancelAll: true,
          reason: `Deal ömür sınırı (${p.dealMaxBar} bar) — piyasadan kapatıldı`,
          indicators: gostergeler
        };
      }
      // Pozisyon yok ama merdiven masada: BO hiç dolmamış, deal iptal.
      return {
        action: 'HOLD', cancelAll: true,
        reason: `Deal ömür sınırı (${p.dealMaxBar} bar) — dolmayan merdiven iptal`,
        indicators: gostergeler
      };
    }

    // ── Pozisyon varken: çıkış seviyeleri ──
    if (poz) {
      const ortalama = poz.entryPrice;
      const tpCarpan = uzun ? (1 + p.takeProfit) : (1 - p.takeProfit);
      const tabanFiyat = p.takeProfitType === '% from total volume' ? ortalama : (this.boSeviye || ortalama);
      const tpSeviye = tabanFiyat * tpCarpan;

      const sinyal = { action: 'HOLD', reason: 'DCA pozisyon taşınıyor', indicators: gostergeler };

      /**
       * TRAILING TAKE PROFIT. Hedefe ULAŞILDIĞINDA iz sürmeye başlar; hedef
       * artık sabit bir çıkış değil, izin başlangıcıdır.
       */
      if (p.ttp > 0) {
        const ulasti = uzun ? mum.high >= tpSeviye : mum.low <= tpSeviye;
        if (ulasti) {
          this.ttpAktif = true;
          const uc = uzun ? mum.high : mum.low;
          this.ttpUc = this.ttpUc === null ? uc : (uzun ? Math.max(uc, this.ttpUc) : Math.min(uc, this.ttpUc));
        }
        if (this.ttpAktif && sayiMi(this.ttpUc)) {
          sinyal.updateStop = this.ttpUc * (uzun ? (1 - p.ttp) : (1 + p.ttp));
          sinyal.reason = 'DCA trailing take profit';
          gostergeler.ttp = true;
          return sinyal;
        }
      } else {
        sinyal.updateTarget = tpSeviye;
      }

      /**
       * STOP LOSS yalnızca TOPLAM SAPMADAN BÜYÜKSE anlamlıdır. Merdivenin
       * en alt basamağının üstünde bir stop, güvenlik emirleri dolmadan
       * pozisyonu kapatır — yani DCA'yı iptal eder. Özgün betiğin kuralı da
       * budur (`stop_loss > max_dev`).
       */
      if (p.stopLoss > 0 && sayiMi(this.boSeviye)) {
        const toplamSapma = DcaBotStrategy.toplamSapma(p);
        if (p.stopLoss > toplamSapma) {
          sinyal.updateStop = this.boSeviye * (uzun ? (1 - p.stopLoss) : (1 + p.stopLoss));
        }
      }
      return sinyal;
    }

    // ── Pozisyon yok, emirler masada: bekle ──
    if (acikEmir > 0) {
      return { action: 'HOLD', reason: `Merdiven masada (${acikEmir} emir)`, indicators: gostergeler };
    }

    // ── Yeni deal: koşul sağlandıysa merdiveni kur ──
    if (!this.hazir.kosul[i]) {
      return { action: 'HOLD', reason: 'Alım başlatma koşulu sağlanmadı', indicators: gostergeler };
    }

    const boSeviye = mum.close;
    if (!(boSeviye > 0)) return { action: 'HOLD', reason: 'Geçersiz fiyat', indicators: gostergeler };

    this.boSeviye = boSeviye;
    this.dealSayaci++;
    this.ttpAktif = false;
    this.ttpUc = null;
    // Ömür sayacı merdivenin kurulduğu barda sıfırlanır; ilk sayım bir
    // sonraki barda yapılır (emir verildiği barda dolmaz kuralıyla aynı).
    this.dealBar = 0;
    this.sayilanBarZaman = null;

    const emirler = [{
      id: 'BO',
      side: uzun ? 'long' : 'short',
      limitPrice: +boSeviye.toFixed(8),
      qty: this.bazTutar(p, sermaye) / boSeviye
    }];

    let sonSeviye = boSeviye;
    for (let k = 1; k <= p.maxSafeOrder; k++) {
      const sap = this.sapma(k, p);
      const seviye = uzun ? sonSeviye * (1 - sap) : sonSeviye * (1 + sap);
      if (!(seviye > 0)) break;
      emirler.push({
        id: `SO${k}`,
        side: uzun ? 'long' : 'short',
        limitPrice: +seviye.toFixed(8),
        qty: this.guvenlikTutari(k, p, sermaye) / seviye
      });
      sonSeviye = seviye;
    }

    gostergeler.deal = this.dealSayaci;
    gostergeler.boSeviye = +boSeviye.toFixed(6);

    return {
      action: 'HOLD',
      orders: emirler,
      reason: `DCA merdiveni kuruldu — ${emirler.length} emir (deal ${this.dealSayaci})`,
      indicators: gostergeler
    };
  }
}

/** Isınma: TV presets 200 periyotlu MA kullanır, en uzun bileşen odur. */
DcaBotStrategy.warmupBars = (cfg = {}) => (cfg.dsc === 'TV presets' || cfg.dsc === 'RSI-2+SMA200' ? 220 : 30);

/**
 * AYAR UYARILARI — özgün betiğin uyarı tablosunun karşılığı.
 *
 * O tablo "raporlama" diye çıkarılabilir görünüyordu ama TEŞHİS değeri
 * yüksekti: kullanıcının sıfır sonuç alıp sebebini bilememesi tam olarak
 * bu uyarılar olmadığı için oluyordu (bkz. CLAUDE.md "sonuçlar sıfır" vakası).
 */
DcaBotStrategy.configWarnings = (cfg = {}) => {
  const u = [];
  const p = new DcaBotStrategy(cfg).cfg();

  const toplamSapma = DcaBotStrategy.toplamSapma(p);
  if (toplamSapma >= 1.0) {
    u.push(`Toplam fiyat sapması %${(toplamSapma * 100).toFixed(1)} — %100'ü aşamaz.`
      + ' Güvenlik emri sayısını ya da adım çarpanını düşürün.');
  }
  if (p.stopLoss > 0 && p.stopLoss <= toplamSapma) {
    u.push(`Stop loss (%${(p.stopLoss * 100).toFixed(2)}) toplam sapmadan (%${(toplamSapma * 100).toFixed(2)}) küçük`
      + ' — güvenlik emirleri dolmadan pozisyon kapanır, yani merdiven hiç çalışmaz. Bu yüzden UYGULANMAZ.');
  }
  /**
   * Ömür sınırı merdivenin dolmasına yetmiyorsa, bot DCA olmaktan çıkar:
   * alt basamaklar hiç denenmeden deal kapanır. Kaç bar gerektiği veriye
   * bağlı olduğu için burada bir EŞİK değil, ölçülmüş bir emsal verilir.
   */
  if (p.dealMaxBar > 0 && p.dealMaxBar < 24) {
    u.push(`Deal ömür sınırı ${p.dealMaxBar} bar — ölçümde deal'lerin %77'si 24 bardan kısa sürüyor,`
      + ' bu kadar kısa bir sınır merdivenin alt basamaklarını hiç denemeden kapatır.');
  }
  if (p.ttp > 0 && p.ttp >= p.takeProfit) {
    u.push(`Trailing take profit (%${(p.ttp * 100).toFixed(2)}) take profit'ten (%${(p.takeProfit * 100).toFixed(2)}) büyük olamaz.`);
  }

  if (p.orderSizeType === 'Fixed') {
    const gerekli = DcaBotStrategy.toplamTutar(p, 0);
    u.push(`Merdivenin tamamı için gereken sermaye: ${gerekli.toFixed(2)}.`
      + ' Backtest başlangıç sermayesi bunun altındaysa alt basamaklar dolmaz.');
  } else {
    // Yüzde modunda toplam, sermayenin yüzdesidir; %100'ü aşarsa merdiven
    // matematiksel olarak kurulamaz.
    const yuzde = DcaBotStrategy.toplamTutar(p, 100);
    if (yuzde > 100) {
      u.push(`Emir boyutu "% of equity" ve merdivenin toplamı sermayenin %${yuzde.toFixed(0)}'i`
        + ' — %100 üstü karşılanamaz, emirler dolmaz. Baz/güvenlik yüzdelerini düşürün.');
    }
  }
  return u;
};

DcaBotStrategy.paramSchema = {
  dsc: { type: 'enum', values: ['Start ASAP', 'RSI-7', 'TV presets', 'RSI-2+SMA200'], default: 'RSI-7', label: 'Alım başlatma koşulu', group: 'Giriş' },
  dscRsiThreshold: { type: 'number', default: 30, min: 1, max: 99, step: 1, label: 'RSI-7 eşiği', group: 'Giriş', description: '"RSI-2+SMA200" seçiliyken RSI(2) eşiği (Connors: 10).' },
  dscTechnicals: { type: 'enum', values: ['Strong', 'Weak'], default: 'Strong', label: 'TV presets gücü', group: 'Giriş', description: 'Yalnızca "TV presets" seçiliyken.' },
  botDirection: { type: 'enum', values: ['Long', 'Short'], default: 'Long', label: 'Bot yönü', group: 'Giriş' },

  orderSizeType: { type: 'enum', values: ['Fixed', '% of equity'], default: 'Fixed', label: 'Emir boyutu tipi', group: 'Merdiven', description: '"% of equity" seçiliyken değerler YÜZDE okunur: 150 = sermayenin %150\'si.' },
  baseOrder: { type: 'number', default: 100, min: 0, step: 1, label: 'Baz emir', group: 'Merdiven' },
  safeOrder: { type: 'number', default: 140, min: 0, step: 1, label: 'Güvenlik emri', group: 'Merdiven' },
  maxSafeOrder: { type: 'number', default: 6, min: 0, max: 20, step: 1, label: 'Güvenlik emri sayısı', group: 'Merdiven' },
  priceDeviation: { type: 'number', default: 1.5, min: 0.1, step: 0.1, label: 'Güvenlik emri sapması (%)', group: 'Merdiven' },
  safeOrderVolumeScale: { type: 'number', default: 1.5, min: 0.1, step: 0.1, label: 'Hacim çarpanı', group: 'Merdiven' },
  safeOrderStepScale: { type: 'number', default: 1.6, min: 0.1, step: 0.1, label: 'Adım çarpanı', group: 'Merdiven' },

  takeProfit: { type: 'number', default: 4.5, min: 0.1, step: 0.1, label: 'Take profit (%)', group: 'Çıkış' },
  takeProfitType: { type: 'enum', values: ['% from total volume', '% from base order'], default: '% from total volume', label: 'Take profit tipi', group: 'Çıkış' },
  ttp: { type: 'number', default: 0, min: 0, step: 0.1, label: 'Trailing take profit (%) [0 = kapalı]', group: 'Çıkış' },
  stopLoss: { type: 'number', default: 0, min: 0, step: 0.1, label: 'Stop loss (%) [0 = kapalı]', group: 'Çıkış', description: 'Toplam sapmadan büyük olmalı, yoksa uygulanmaz.' },
  dealMaxBar: { type: 'number', default: 0, min: 0, step: 1, label: 'Deal ömür sınırı (bar) [0 = kapalı]', group: 'Çıkış', description: 'Deal bu kadar bar içinde kapanmazsa piyasadan kapatılır. Fiyata değil SÜREYE bakar; stop\'tan farkı budur.' }
};

/**
 * Izgara DAR tutuldu: 3 parametre × 3 değer = 27 kombinasyon, hepsi denenir.
 * Baz/güvenlik TUTARLARI bilinçli olarak DIŞARIDA — onlar pozisyon boyutudur,
 * aranınca sermaye uyumu bozulur ve sonuçlar karşılaştırılamaz hale gelir.
 */
DcaBotStrategy.optimizeGrid = {
  takeProfit: [2.5, 4.5, 7.0],
  priceDeviation: [1.0, 1.5, 2.5],
  safeOrderStepScale: [1.2, 1.6, 2.0]
};

module.exports = DcaBotStrategy;
