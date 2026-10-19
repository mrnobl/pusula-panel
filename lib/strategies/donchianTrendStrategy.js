/**
 * DONCHIAN TREND TOPLULUĞU — motor (backtest / bot) uyarlaması.
 *
 * Kuralların TEK sahibi `donchianEnsemble.js` (`adim`): araştırma ölçümü,
 * canlı Donchian botu ve bu sınıf aynı fonksiyonu çağırır. Burada yalnızca
 * "hedef maruziyet"i motorun anladığı sinyallere çeviriyoruz:
 *
 *   hedef 0 → x        : BUY  (allocationPct)
 *   hedef x → y, y > x : BUY  addToPosition
 *   hedef x → y, y < x : SELL partialPct
 *   hedef x → 0        : SELL (tam çıkış)
 *
 * Sinyal YALNIZCA hedef değiştiğinde üretilir; hedef aynı kaldığı günlerde
 * birim korunur — araştırma simülasyonunun sözleşmesiyle aynı (fiyat kaydıkça
 * her gün yeniden dengelemek hem maliyeti hem sonucu değiştirirdi).
 *
 * ⚠ ZAMAN DİLİMİ: kaynak günlük kapanışla çalışır ve N gün cinsindendir.
 * Başka dilimde N bar olur (4h'te N=360 → 60 gün) ve vol yıllıklandırması
 * yanlış ölçeklenir. Bu yüzden panel uyarı gösterir; doğru kullanım 1d.
 *
 * Motor farkı: motor emri sinyal barının KAPANIŞINDA doldurur, araştırma
 * simülasyonu ertesi günün AÇILIŞINDA. 7/24 piyasada ikisi neredeyse aynı
 * fiyattır ama sonuçlar kuruşu kuruşuna tutmaz.
 */
const BaseStrategy = require('./baseStrategy');
const D = require('./donchianEnsemble');

const STOP_YOK = 95;        // % — motorun varsayılan %2 stop'u trendi ilk gün keserdi
const HEDEF_YOK = 1e6;      // % — kâr alma hedefi yok, çıkış yalnız Donchian stop'undan

class DonchianTrendStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('donchian_trend', config);
    this.hedefler = null;   // prepare() ile önceden hesaplanan seri
    this.sonHedef = 0;
  }

  ayar() {
    const c = this.config || {};
    return {
      hedefVol: (Number(c.hedefVolPct) > 0 ? Number(c.hedefVolPct) : 25) / 100,
      kaldiracTavani: Number(c.kaldiracTavani) > 0 ? Number(c.kaldiracTavani) : 2,
      esik: Number(c.esik) >= 0 ? Number(c.esik) : 0.10
    };
  }

  /** Hedef maruziyet dizisi — `adim` yalnız t'ye kadar okur, ileriye bakmaz. */
  hedefSerisi(mumlar) {
    const a = this.ayar();
    const kap = mumlar.map(m => m.close);
    let durum = D.yeniDurum(a);
    const h = new Array(kap.length).fill(0);
    for (let t = 0; t < kap.length; t++) {
      const r = D.adim(durum, kap.slice(Math.max(0, t - 400), t + 1), a);
      durum = r.durum;
      h[t] = r.maruziyet;
    }
    return h;
  }

  prepare(mumlar) {
    this.hedefler = this.hedefSerisi(mumlar);
    this.sonHedef = 0;
  }

  evaluate(ohlcv, ticker, positions, motor = {}) {
    const i = Number.isFinite(motor.barIndex) ? motor.barIndex : ohlcv.length - 1;
    // Canlıda prepare çağrılmaz: pencereden hesapla.
    const seri = this.hedefler && i < this.hedefler.length ? this.hedefler : this.hedefSerisi(ohlcv);
    const idx = seri === this.hedefler ? i : seri.length - 1;
    const kaldirac = Math.max(1, Number(this.config.leverage) || 1);
    const spot = !this.config.marketType || String(this.config.marketType) === 'spot';
    // Spotta 1x'in üstü alınamaz; motor zaten nakdin %95'ini tavan sayıyor.
    let hedef = seri[idx] || 0;
    if (spot) hedef = Math.min(hedef, 0.95);

    const poz = (positions || []).find(p => p.side !== 'short');
    const close = ohlcv[ohlcv.length - 1].close;
    const ozsermaye = Number(motor.equity) > 0 ? motor.equity : null;
    const mevcut = poz && ozsermaye ? (poz.amount * close) / ozsermaye : 0;
    const nakit = Number(motor.capital) > 0 ? motor.capital : null;

    const gostergeler = { hedefMaruziyet: +hedef.toFixed(4), mevcutMaruziyet: +mevcut.toFixed(4) };
    if (hedef === this.sonHedef) return { action: 'HOLD', indicators: gostergeler };
    const onceki = this.sonHedef;
    this.sonHedef = hedef;

    const ortak = { stopLossPct: STOP_YOK, takeProfitPct: HEDEF_YOK, indicators: gostergeler };
    if (hedef === 0) {
      return poz ? { action: 'SELL', side: 'long', reason: `Donchian: tüm alt modeller kapandı (${onceki.toFixed(2)}x → 0)`, ...ortak } : { action: 'HOLD', indicators: gostergeler };
    }
    if (!poz) {
      if (!ozsermaye || !nakit) return { action: 'HOLD', indicators: gostergeler };
      // allocationPct NAKDİN yüzdesi; vadelide nakit marj olur, nominal = marj × kaldıraç.
      const pct = Math.min(95, (hedef * ozsermaye / kaldirac) / nakit * 100);
      return { action: 'BUY', allocationPct: pct, reason: `Donchian giriş: hedef ${hedef.toFixed(2)}x`, ...ortak };
    }
    if (hedef > mevcut) {
      if (!ozsermaye || !nakit) return { action: 'HOLD', indicators: gostergeler };
      const pct = Math.min(95, ((hedef - mevcut) * ozsermaye / kaldirac) / nakit * 100);
      if (pct <= 0) return { action: 'HOLD', indicators: gostergeler };
      return { action: 'BUY', addToPosition: true, allocationPct: pct, reason: `Donchian artır: ${mevcut.toFixed(2)}x → ${hedef.toFixed(2)}x`, ...ortak };
    }
    const oran = mevcut > 0 ? Math.min(0.99, 1 - hedef / mevcut) : 0;
    if (oran <= 0) return { action: 'HOLD', indicators: gostergeler };
    return { action: 'SELL', side: 'long', partialPct: oran, reason: `Donchian azalt: ${mevcut.toFixed(2)}x → ${hedef.toFixed(2)}x`, ...ortak };
  }
}

DonchianTrendStrategy.warmupBars = () => D.isinma();

/** Kaynaktan sabit parametreler — arama ızgarası bilerek YOK (aşırı uyum). */
DonchianTrendStrategy.paramSchema = {
  hedefVolPct: { type: 'number', default: 25, min: 5, max: 100, step: 1, label: 'Yıllık vol hedefi (%)', group: 'Boyut', description: 'Kaynak: %25. Maruziyet = açık alt model oranı × hedef vol / 30 günlük vol.' },
  kaldiracTavani: { type: 'number', default: 2, min: 0.5, max: 5, step: 0.5, label: 'Maruziyet tavanı (x)', group: 'Boyut', description: 'Spotta en çok 0,95x uygulanır.' },
  esik: { type: 'number', default: 0.10, min: 0, max: 1, step: 0.01, label: 'Değişim eşiği (x)', group: 'Boyut', description: 'Hedef bundan az değişirse işlem yapılmaz (kaynak dışı varsayım).' }
};

module.exports = DonchianTrendStrategy;
