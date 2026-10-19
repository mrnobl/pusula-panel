/**
 * CLENOW — KARŞI TREND (trend içinde dipten alım). Yalnız long.
 *
 * Kaynak: Andreas Clenow, *Trading Evolved* (Türkçe: Python ile Trading),
 * Bölüm 17 — `referans/kitap-clenow-python-trading.md`.
 *
 * Kitap kuralı (aynen):
 *   filtre : EMA(40) > EMA(80)
 *   giriş  : (kapanış − son 20 günün en yüksek kapanışı) / std40(Δkapanış) < −3
 *   çıkış  : EMA40 < EMA80, YA DA pozisyon 20 işlem günü tutulduysa
 *   stop   : "Fiyat stopu ve kâr hedefi yok"
 *   boyut  : adet = portföy × 0.0015 / std40(Δkapanış)   (vol-parite)
 *
 * Bizim varsayımımız: kitap ertesi gün açılışta girer; motor sinyal barının
 * kapanışında doldurur (7/24 piyasada fark kayma kadar). Kitabın en kötü
 * ayı −%26 (Mayıs 2010) — stopsuz yapının kuyruğu kill kriterinde izlenir.
 */
const { ema, stdDegisim, STOPSUZ, KitapStratejisi } = require('./ortak');

class ClenowKarsiTrend extends KitapStratejisi {
  constructor(config = {}) { super('clenow_karsi_trend', config); }
  sifirla() { this.girisBar = null; }

  gostergeler(m) {
    const c = m.map(x => x.close);
    const p = this.p();
    const tepe = new Array(c.length).fill(null);
    for (let i = p.tepe - 1; i < c.length; i++) { let t = -Infinity; for (let j = i - p.tepe + 1; j <= i; j++) if (c[j] > t) t = c[j]; tepe[i] = t; }
    return { c, hizli: ema(c, p.hizli), yavas: ema(c, p.yavas), std: stdDegisim(c, p.vol), tepe };
  }

  p() {
    const c = this.config || {};
    return { hizli: +c.hizliEma || 40, yavas: +c.yavasEma || 80, vol: +c.volPencere || 40, tepe: +c.tepePencere || 20,
      tutma: +c.tutmaGun || 20, dip: c.dipEsik != null ? +c.dipEsik : -3, risk: +c.riskFaktor || 0.0015 };
  }

  karar(i, g, d) {
    const p = this.p();
    const { c, hizli, yavas, std, tepe } = g;
    if (hizli[i] == null || yavas[i] == null || std[i] == null || tepe[i] == null || !(std[i] > 0)) return { action: 'HOLD' };
    const trendYukari = hizli[i] > yavas[i];
    const sapma = (c[i] - tepe[i]) / std[i];
    const indicators = { ema40: +hizli[i].toFixed(4), ema80: +yavas[i].toFixed(4), sapmaSigma: +sapma.toFixed(2) };
    if (d.long) {
      if (this.girisBar == null) this.girisBar = i;
      if (!trendYukari) { this.girisBar = null; return { action: 'SELL', side: 'long', reason: 'Clenow: EMA40 < EMA80', indicators, ...STOPSUZ }; }
      if (i - this.girisBar >= p.tutma) { this.girisBar = null; return { action: 'SELL', side: 'long', reason: `Clenow: ${p.tutma} gün doldu`, indicators, ...STOPSUZ }; }
      return { action: 'HOLD', indicators };
    }
    this.girisBar = null;
    if (trendYukari && sapma < p.dip) {
      // Vol-parite: nominal oran = risk × fiyat / std(Δfiyat).
      const oran = p.risk * c[i] / std[i];
      const pct = KitapStratejisi.yuzde(oran, d);
      if (pct <= 0) return { action: 'HOLD', indicators };
      this.girisBar = i;
      return { action: 'BUY', allocationPct: pct, reason: `Clenow dip: ${sapma.toFixed(1)}σ (hedef ${oran.toFixed(2)}x)`, indicators, ...this.stopAyari(i, c[i]) };
    }
    return { action: 'HOLD', indicators };
  }
}

ClenowKarsiTrend.warmupBars = () => 90;
ClenowKarsiTrend.boyutlama = 'portfoyRiski';
ClenowKarsiTrend.paramSchema = {
  stopAtr: { type: 'number', default: 0, min: 0, max: 10, step: 0.5, label: 'Gevşek stop (ATR katı)', group: 'Stop', description: '0 = kitap kuralı (stopsuz). Örn. 3 → girişten 3 × ATR(20).' },
  hizliEma: { type: 'number', default: 40, min: 5, max: 200, step: 1, label: 'Hızlı EMA', group: 'Trend filtresi' },
  yavasEma: { type: 'number', default: 80, min: 10, max: 400, step: 1, label: 'Yavaş EMA', group: 'Trend filtresi' },
  tepePencere: { type: 'number', default: 20, min: 5, max: 100, step: 1, label: 'Tepe penceresi (gün)', group: 'Giriş' },
  dipEsik: { type: 'number', default: -3, min: -10, max: -0.5, step: 0.5, label: 'Dip eşiği (σ)', group: 'Giriş' },
  volPencere: { type: 'number', default: 40, min: 10, max: 200, step: 1, label: 'Vol penceresi (gün)', group: 'Boyut' },
  riskFaktor: { type: 'number', default: 0.0015, min: 0.0005, max: 0.01, step: 0.0005, label: 'Risk faktörü', group: 'Boyut', description: 'Portföyün günlük riski: adet = özsermaye × faktör / std(Δfiyat).' },
  tutmaGun: { type: 'number', default: 20, min: 1, max: 100, step: 1, label: 'Zaman çıkışı (gün)', group: 'Çıkış' }
};

module.exports = ClenowKarsiTrend;
