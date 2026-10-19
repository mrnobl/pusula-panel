/**
 * CONNORS — RSI POWER ZONES. Yalnız long, kısa vadeli ortalamaya dönüş.
 *
 * Kaynak: Larry Connors, *Buy the Fear, Sell the Greed* (Türkçe: Korkuyu Al),
 * Bölüm 2 — `referans/kitap-connors-korkuyu-al.md`.
 *
 * Kitap kuralı (aynen):
 *   1. Kapanış 200 günlük SMA üstünde.
 *   2. RSI(4) 30'un altında kapanırsa kapanışta 1 birim al.
 *   3. Pozisyon açıkken RSI(4) 25'in altında kapanırsa ikinci birim.
 *   4. RSI(4) 55'in üstünde kapanınca kapanışta sat.
 *   Stop yok. Kitabın SPY ölçümü (1993–2017, maliyetsiz): 202 işlem, %90,6
 *   isabet, işlem başı ort. %1,73, tutma ~5 gün.
 *
 * Bizim varsayımımız: kitap "birim" tanımlamıyor → 1. birim nakdin %47,5'i,
 * 2. birim kalan nakdin %95'i (iki birim ≈ tam pozisyon, kaldıraçsız).
 */
const { sma, rsi, STOPSUZ, KitapStratejisi } = require('./ortak');

class ConnorsRsiGuc extends KitapStratejisi {
  constructor(config = {}) { super('connors_rsi_guc', config); }
  sifirla() { this.birim = 0; }

  p() {
    const c = this.config || {};
    return { ma: +c.maPencere || 200, rsiN: +c.rsiPencere || 4, giris: c.girisEsik != null ? +c.girisEsik : 30,
      ek: c.ekEsik != null ? +c.ekEsik : 25, cikis: c.cikisEsik != null ? +c.cikisEsik : 55 };
  }

  gostergeler(m) {
    const c = m.map(x => x.close);
    const p = this.p();
    return { c, ma: sma(c, p.ma), r: rsi(c, p.rsiN) };
  }

  karar(i, g, d) {
    const p = this.p();
    const { c, ma, r } = g;
    if (ma[i] == null || r[i] == null) return { action: 'HOLD' };
    const indicators = { rsi4: +r[i].toFixed(1), sma200: +ma[i].toFixed(4) };
    if (d.long) {
      if (this.birim === 0) this.birim = 1;
      if (r[i] > p.cikis) { this.birim = 0; return { action: 'SELL', side: 'long', reason: `RSI${p.rsiN} ${r[i].toFixed(0)} > ${p.cikis}`, indicators, ...STOPSUZ }; }
      if (this.birim === 1 && r[i] < p.ek) {
        this.birim = 2;
        return { action: 'BUY', addToPosition: true, allocationPct: 95, reason: `2. birim: RSI${p.rsiN} ${r[i].toFixed(0)} < ${p.ek}`, indicators, ...STOPSUZ };
      }
      return { action: 'HOLD', indicators };
    }
    this.birim = 0;
    if (c[i] > ma[i] && r[i] < p.giris) {
      this.birim = 1;
      return { action: 'BUY', allocationPct: 47.5, reason: `1. birim: RSI${p.rsiN} ${r[i].toFixed(0)} < ${p.giris}, SMA200 üstü`, indicators, ...this.stopAyari(i, c[i]) };
    }
    return { action: 'HOLD', indicators };
  }
}

ConnorsRsiGuc.warmupBars = () => 201;
ConnorsRsiGuc.boyutlama = 'sermayePayi';
ConnorsRsiGuc.paramSchema = {
  stopAtr: { type: 'number', default: 0, min: 0, max: 10, step: 0.5, label: 'Gevşek stop (ATR katı)', group: 'Stop', description: '0 = kitap kuralı (stopsuz). Örn. 3 → girişten 3 × ATR(20).' },
  maPencere: { type: 'number', default: 200, min: 20, max: 400, step: 10, label: 'Trend SMA (gün)', group: 'Filtre' },
  rsiPencere: { type: 'number', default: 4, min: 2, max: 14, step: 1, label: 'RSI periyodu', group: 'Sinyal' },
  girisEsik: { type: 'number', default: 30, min: 5, max: 50, step: 1, label: '1. birim: RSI altında', group: 'Sinyal' },
  ekEsik: { type: 'number', default: 25, min: 1, max: 50, step: 1, label: '2. birim: RSI altında', group: 'Sinyal' },
  cikisEsik: { type: 'number', default: 55, min: 40, max: 90, step: 1, label: 'Çıkış: RSI üstünde', group: 'Çıkış' }
};

module.exports = ConnorsRsiGuc;
