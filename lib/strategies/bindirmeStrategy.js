/**
 * HÜCUM / DENGE — BTC AYAĞI (O-GC rejimi), standart backtest motoru için.
 *
 * Bu, iki portföy botunun (lib/live/bindirmeBot.js) TEK GRAFİĞE çizilebilen
 * parçasıdır: BTC günlük mumlarında trend rejimi. Kalkan kolu (15 coin, ×3
 * vadeli) tek grafiğe sığmaz; botun tamamının ölçümü backtest sonucunda ayrı
 * bir kutuda (`lib/research/bindirme.js`) gösterilir.
 *
 * Kural (Pine "Hucum BTC ayagi - TradingView Pine.txt" ve `ogcDurum` ile aynı):
 *   LONG AÇ   : pozisyon yokken kapanış > SMA100 VE SMA50 > SMA200
 *   LONG KAPAT: long açıkken kapanış < SMA100
 *   Yalnız long; short yok. Karar günün KAPANIŞINDA.
 *   Durum makinesi histerezisli: giriş iki şart, çıkış yalnız SMA100.
 *   Pine gibi: rejim "içeride" iken pozisyon yoksa (ör. koşunun ilk günü) LONG AÇ.
 *
 * Boyut: Hücum nakdin %100'ü (`tamSermaye` — motorun %95 tavanını yalnız bu
 * sinyal için kaldırır), Denge %50. Stop / hedef yok (STOPSUZ).
 *
 * Motor farkı (bilinçli, açıklanır): motor emri sinyal barının KAPANIŞINDA
 * doldurur; araştırma simülasyonu ve Pine ertesi günün AÇILIŞINDA. 7/24
 * piyasada ikisi aynı ana denk gelir (fiyat kuruş düzeyinde farklı), ama
 * TradingView işlem listesinde tarih bir gün SONRA görünür. Komisyon: motor
 * %0,15/yön (canlı kâğıt motorla aynı), Pine/araştırma %0,12.
 *
 * Yalnız GÜNLÜK (1d) mumlar: SMA uzunlukları gün cinsindendir. Başka dilimde
 * strateji hata fırlatır (sessizce yanlış sonuç üretmez).
 */
const BaseStrategy = require('./baseStrategy');
const { ogcDurum } = require('../research/bindirme');

const GUN = 864e5;
const STOPSUZ = Object.freeze({ stopLossPct: 95, takeProfitPct: 1e6 });
const fmt = (x) => (+x).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const zaman = (m) => { const t = m && m.time; return typeof t === 'number' ? t : Date.parse(t); };

/** Mum aralığı günlük mü? (medyan aralık 1 gün; boşluklu veri tolere edilir) */
function gunlukMu(mumlar) {
  const n = Math.min(mumlar.length, 60);
  if (n < 3) return true;
  const a = [];
  for (let i = mumlar.length - n + 1; i < mumlar.length; i++) a.push(zaman(mumlar[i]) - zaman(mumlar[i - 1]));
  a.sort((x, y) => x - y);
  return Math.abs(a[Math.floor(a.length / 2)] - GUN) < 3600e3;
}

class BindirmeBtcAyagi extends BaseStrategy {
  constructor(ad, varsayilanPay, config = {}) { super(ad, config); this.varsayilanPay = varsayilanPay; this.g = null; this.n = 0; }

  p() {
    const c = this.config || {};
    return { cikis: +c.cikisSma || 100, hizli: +c.hizliSma || 50, yavas: +c.yavasSma || 200,
      pay: c.btcPayPct != null && Number.isFinite(+c.btcPayPct) ? Math.max(1, Math.min(100, +c.btcPayPct)) : this.varsayilanPay };
  }

  _denetle(mumlar) {
    if (!gunlukMu(mumlar)) {
      throw new Error(`${this.name === 'denge' ? 'Denge' : 'Hücum'} yalnız GÜNLÜK (1d) mumlarda çalışır — SMA100/50/200 gün cinsinden. Zaman dilimini 1d seçin.`);
    }
  }

  _hesapla(mumlar) {
    const p = this.p();
    return ogcDurum(mumlar.map(m => +m.close), { hizli: p.hizli, cikis: p.cikis, yavas: p.yavas });
  }

  prepare(mumlar) { this._denetle(mumlar); this.g = this._hesapla(mumlar); this.n = mumlar.length; }

  evaluate(ohlcv, ticker, positions, motor = {}) {
    let i = Number.isFinite(motor.barIndex) ? motor.barIndex : ohlcv.length - 1;
    let g = this.g;
    if (!g || i >= this.n) { this._denetle(ohlcv); g = this._hesapla(ohlcv); i = ohlcv.length - 1; }
    const p = this.p();
    const c = +ohlcv[ohlcv.length - 1].close;
    const s50 = g.sma50[i], s100 = g.sma100[i], s200 = g.sma200[i];
    if (s50 == null || s100 == null || s200 == null) return { action: 'HOLD', reason: `ısınma (${p.yavas} gün)` };
    const icerde = g.durum[i] === 1;
    const indicators = { sma50: +s50.toFixed(2), sma100: +s100.toFixed(2), sma200: +s200.toFixed(2), rejim: icerde ? 1 : 0 };
    const long = (positions || []).find(x => x.side !== 'short');
    if (long && !icerde) {
      return { action: 'SELL', side: 'long', reason: `LONG KAPAT — kapanış ${fmt(c)} < SMA${p.cikis} ${fmt(s100)}`, indicators, ...STOPSUZ };
    }
    if (!long && icerde) {
      const yeni = g.durum[i - 1] !== 1;
      return { action: 'BUY', allocationPct: p.pay, tamSermaye: p.pay >= 100,
        reason: `LONG AÇ — kapanış ${fmt(c)} > SMA${p.cikis} ${fmt(s100)}, SMA${p.hizli} ${fmt(s50)} > SMA${p.yavas} ${fmt(s200)}${yeni ? '' : ' (rejim zaten açık, pozisyon yoktu)'} · BTC payı %${p.pay}`,
        indicators, ...STOPSUZ };
    }
    return { action: 'HOLD', indicators };
  }
}

const sema = (pay) => ({
  btcPayPct: { type: 'number', default: pay, min: 1, max: 100, step: 1, label: 'BTC payı (nakdin %)', group: 'Boyut',
    description: 'Rejim açıkken BTC\'ye giden nakit payı. Hücum 100, Denge 50 (ölçülen botlar).' },
  cikisSma: { type: 'number', default: 100, min: 10, max: 400, step: 5, label: 'Giriş/çıkış SMA (gün)', group: 'Rejim',
    description: 'LONG AÇ: kapanış bunun üstünde (+ altın kesişim); LONG KAPAT: kapanış bunun altında.' },
  hizliSma: { type: 'number', default: 50, min: 5, max: 200, step: 5, label: 'Hızlı SMA (altın kesişim)', group: 'Rejim' },
  yavasSma: { type: 'number', default: 200, min: 20, max: 400, step: 10, label: 'Yavaş SMA (altın kesişim)', group: 'Rejim' }
});

class Hucum extends BindirmeBtcAyagi { constructor(config = {}) { super('hucum', 100, config); } }
class Denge extends BindirmeBtcAyagi { constructor(config = {}) { super('denge', 50, config); } }
for (const [S, pay] of [[Hucum, 100], [Denge, 50]]) {
  S.warmupBars = (cfg = {}) => Math.max(+cfg.yavasSma || 200, +cfg.cikisSma || 100, +cfg.hizliSma || 50);
  S.paramSchema = sema(pay);
  S.boyutlama = 'sermayePayi';
  S.gunlukMu = gunlukMu;
}

module.exports = { Hucum, Denge, gunlukMu };
