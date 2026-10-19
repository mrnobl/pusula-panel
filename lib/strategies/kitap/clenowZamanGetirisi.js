/**
 * CLENOW — ZAMAN GETİRİSİ (zaman serisi momentumu). Long + short (vadeli).
 *
 * Kaynak: Clenow, *Trading Evolved*, Bölüm 16 — `referans/kitap-clenow-python-trading.md`.
 *
 * Kitap kuralı (aynen): "Ay başında … kapanış hem 250 gün öncesinden hem 125
 * gün öncesinden yüksekse uzun; ikisinden de düşükse kısa; aksi halde
 * pozisyon yok. İndikatör yok, durdurma yok." Boyut vol-parite, risk 0.0015,
 * std penceresi 60 gün.
 *
 * Bizim varsayımlarımız:
 *   · "Ay başı" = ayın ilk UTC günü.
 *   · Kitap ay içi yeniden dengelemeyi "geliştirme alanı" bırakıyor → yok.
 *   · Yön değişiminde motor bir barda tek sinyal işler: önce kapanış, ertesi
 *     bar yeni yön açılır (1 gün gecikme).
 *   · Spotta short yok → kısa sinyalde pozisyonsuz kalınır.
 */
const { stdDegisim, STOPSUZ, KitapStratejisi } = require('./ortak');

class ClenowZamanGetirisi extends KitapStratejisi {
  constructor(config = {}) { super('clenow_zaman_getirisi', config); }
  sifirla() { this.hedef = 0; this.bekleyen = null; }

  p() {
    const c = this.config || {};
    return { uzun: +c.uzunGeri || 250, kisa: +c.kisaGeri || 125, vol: +c.volPencere || 60, risk: +c.riskFaktor || 0.0015 };
  }

  gostergeler(m) {
    const c = m.map(x => x.close);
    return { c, t: m.map(x => Number(x.time)), std: stdDegisim(c, this.p().vol) };
  }

  karar(i, g, d) {
    const p = this.p();
    const { c, t, std } = g;
    if (i < p.uzun || std[i] == null || !(std[i] > 0)) return { action: 'HOLD' };
    const ayBasi = new Date(t[i]).getUTCMonth() !== new Date(t[i - 1]).getUTCMonth();
    let yon = this.hedef;
    if (ayBasi) {
      yon = c[i] > c[i - p.uzun] && c[i] > c[i - p.kisa] ? 1 : (c[i] < c[i - p.uzun] && c[i] < c[i - p.kisa] ? -1 : 0);
      if (d.spot && yon < 0) yon = 0;
      this.hedef = yon;
    }
    const indicators = { hedefYon: yon, getiri250: +((c[i] / c[i - p.uzun] - 1) * 100).toFixed(1), getiri125: +((c[i] / c[i - p.kisa] - 1) * 100).toFixed(1) };
    // 1. Ters ya da sıfır yönde açık pozisyon → kapat.
    if (d.long && yon !== 1) return { action: 'SELL', side: 'long', reason: 'Zaman getirisi: long sinyali bitti', indicators, ...STOPSUZ };
    if (d.short && yon !== -1) return { action: 'SELL', side: 'short', reason: 'Zaman getirisi: short sinyali bitti', indicators, ...STOPSUZ };
    // 2. Yön var, pozisyon yok → aç (ay başında ya da kapanıştan sonraki bar).
    if (yon !== 0 && !d.long && !d.short) {
      const oran = p.risk * c[i] / std[i];
      const pct = KitapStratejisi.yuzde(oran, d);
      if (pct <= 0) return { action: 'HOLD', indicators };
      return { action: yon > 0 ? 'BUY' : 'SHORT', allocationPct: pct, reason: `Zaman getirisi ${yon > 0 ? 'long' : 'short'} (hedef ${oran.toFixed(2)}x)`, indicators, ...this.stopAyari(i, c[i]) };
    }
    return { action: 'HOLD', indicators };
  }
}

ClenowZamanGetirisi.warmupBars = () => 251;
ClenowZamanGetirisi.boyutlama = 'portfoyRiski';
ClenowZamanGetirisi.paramSchema = {
  stopAtr: { type: 'number', default: 0, min: 0, max: 10, step: 0.5, label: 'Gevşek stop (ATR katı)', group: 'Stop', description: '0 = kitap kuralı (stopsuz). Örn. 3 → girişten 3 × ATR(20).' },
  uzunGeri: { type: 'number', default: 250, min: 20, max: 500, step: 5, label: 'Uzun geri bakış (gün)', group: 'Sinyal' },
  kisaGeri: { type: 'number', default: 125, min: 10, max: 300, step: 5, label: 'Kısa geri bakış (gün)', group: 'Sinyal' },
  volPencere: { type: 'number', default: 60, min: 10, max: 200, step: 1, label: 'Vol penceresi (gün)', group: 'Boyut' },
  riskFaktor: { type: 'number', default: 0.0015, min: 0.0005, max: 0.01, step: 0.0005, label: 'Risk faktörü', group: 'Boyut' }
};

module.exports = ClenowZamanGetirisi;
