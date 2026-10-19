/**
 * KİTAP STRATEJİLERİ — TUR 3 (PLAN-KITAP-STRATEJI.md "TUR 3").
 *
 *   pruitt_yuzde_b   · Pruitt, Ultimate Algorithmic Trading System Toolbox, Kutu 3.4
 *   kestner_iraksama · Kestner, Quantitative Trading Strategies, Böl. 8 (#4)
 *   chande_cbpb      · Chande, Beyond Technical Analysis, Böl. 4
 *   carver_carpiklik · Carver, Advanced Futures Trading Strategies, Strateji 24
 *
 * Her sınıfın başında kitap kuralı ve "bizim varsayımımız" ayrı yazılı.
 */
const { sma, stdDegisim, atr, STOPSUZ, KitapStratejisi } = require('./ortak');

/** Kayan pencere std (örneklem). */
function stdKayan(x, n) {
  const o = new Array(x.length).fill(null);
  for (let i = n - 1; i < x.length; i++) {
    let t = 0, t2 = 0;
    for (let j = i - n + 1; j <= i; j++) { t += x[j]; t2 += x[j] * x[j]; }
    const ort = t / n;
    o[i] = Math.sqrt(Math.max(0, (t2 - n * ort * ort) / (n - 1)));
  }
  return o;
}

// ═══════════════════════════════════════════════════════════════════════════
/**
 * PRUITT — %B ORTALAMAYA DÖNÜŞ. Long + short.
 * Kitap: close > MA200 ve MA3(%B(5)) < 0,25 → long; close < MA200 ve > 0,75 → short.
 *        Çıkış %B > 0,75 (long) / < 0,25 (short) ya da $2.000 stop.
 * Bizim: BB std çarpanı 2 (notta yok); $2.000 → 3×ATR(20); boyut nakdin %95'i.
 */
class PruittYuzdeB extends KitapStratejisi {
  constructor(config = {}) { super('pruitt_yuzde_b', config); }
  gostergeler(m) {
    const c = m.map(x => x.close);
    const orta = sma(c, 5), sd = stdKayan(c, 5);
    const b = c.map((x, i) => (orta[i] == null || !(sd[i] > 0) ? null : (x - (orta[i] - 2 * sd[i])) / (4 * sd[i])));
    const bOrt = b.map((_, i) => (i >= 2 && b[i] != null && b[i - 1] != null && b[i - 2] != null ? (b[i] + b[i - 1] + b[i - 2]) / 3 : null));
    return { c, ma: sma(c, 200), b, bOrt };
  }
  karar(i, g, d) {
    const { c, ma, b, bOrt } = g;
    if (ma[i] == null || b[i] == null || bOrt[i] == null) return { action: 'HOLD' };
    const indicators = { yuzdeB: +b[i].toFixed(3), yuzdeB3: +bOrt[i].toFixed(3), ma200: +ma[i].toFixed(4) };
    const stop = Number(this.config.stopAtr) > 0 ? this.stopAyari(i, c[i]) : this.stopAyari3(i, c[i]);
    if (d.long) return b[i] > 0.75 ? { action: 'SELL', side: 'long', reason: `%B ${b[i].toFixed(2)} > 0,75`, indicators, ...STOPSUZ } : { action: 'HOLD', indicators };
    if (d.short) return b[i] < 0.25 ? { action: 'SELL', side: 'short', reason: `%B ${b[i].toFixed(2)} < 0,25`, indicators, ...STOPSUZ } : { action: 'HOLD', indicators };
    if (c[i] > ma[i] && bOrt[i] < 0.25) return { action: 'BUY', allocationPct: 95, reason: `Pruitt long: MA3(%B) ${bOrt[i].toFixed(2)}`, indicators, ...stop };
    if (!d.spot && c[i] < ma[i] && bOrt[i] > 0.75) return { action: 'SHORT', allocationPct: 95, reason: `Pruitt short: MA3(%B) ${bOrt[i].toFixed(2)}`, indicators, ...stop };
    return { action: 'HOLD', indicators };
  }
  /** Kitapta stop VAR ($2.000) → varsayılan 3×ATR(20) (bizim çevirimiz). */
  stopAyari3(i, kapanis) {
    const a = this.atrDizi && this.atrDizi[i];
    return a > 0 ? { stopLossPct: Math.min(95, 3 * a / kapanis * 100), takeProfitPct: 1e6 } : STOPSUZ;
  }
}
PruittYuzdeB.warmupBars = () => 201;
PruittYuzdeB.boyutlama = 'sermayePayi';
PruittYuzdeB.paramSchema = {
  stopAtr: { type: 'number', default: 0, min: 0, max: 10, step: 0.5, label: 'Stop (ATR katı, 0 = varsayılan 3)', group: 'Stop' }
};

// ═══════════════════════════════════════════════════════════════════════════
/**
 * KESTNER — IRAKSAMA ENDEKSİ. Long + short, trend yönünde geri çekilme.
 * Kitap: DI = (mom10 × mom40) / σ40(Δfiyat)²; DI < −10 ve mom40 > 0 → long;
 *        DI < −10 ve mom40 < 0 → short; çıkış ters sinyal.
 * Bizim: formül çeviriden yeniden kuruldu (not: "çarpma işareti kaybolmuş");
 *        boyut vol-parite, risk 0,0015 × portföy / σ100(Δfiyat) (Kestner'in
 *        10.000$/σ100 kuralının oransal hali).
 */
class KestnerIraksama extends KitapStratejisi {
  constructor(config = {}) { super('kestner_iraksama', config); }
  sifirla() { this.yon = 0; }
  gostergeler(m) {
    const c = m.map(x => x.close);
    return { c, s40: stdDegisim(c, 40), s100: stdDegisim(c, 100) };
  }
  karar(i, g, d) {
    const { c, s40, s100 } = g;
    if (i < 100 || !(s40[i] > 0) || !(s100[i] > 0)) return { action: 'HOLD' };
    const m10 = c[i] - c[i - 10], m40 = c[i] - c[i - 40];
    const di = (m10 * m40) / (s40[i] * s40[i]);
    const indicators = { iraksama: +di.toFixed(2), mom10: +m10.toFixed(4), mom40: +m40.toFixed(4) };
    let sinyal = 0;
    if (di < -10) sinyal = m40 > 0 ? 1 : -1;
    if (d.spot && sinyal < 0) sinyal = 0;
    if (sinyal === 0) return { action: 'HOLD', indicators };
    // Ters sinyal → mevcut pozisyonu kapat; sonraki barda yeni yön.
    if (d.long && sinyal < 0) return { action: 'SELL', side: 'long', reason: `Iraksama ters: DI ${di.toFixed(1)}`, indicators, ...STOPSUZ };
    if (d.short && sinyal > 0) return { action: 'SELL', side: 'short', reason: `Iraksama ters: DI ${di.toFixed(1)}`, indicators, ...STOPSUZ };
    if (d.long || d.short) return { action: 'HOLD', indicators };
    const oran = 0.0015 * c[i] / s100[i];
    const pct = KitapStratejisi.yuzde(oran, d);
    if (pct <= 0) return { action: 'HOLD', indicators };
    return { action: sinyal > 0 ? 'BUY' : 'SHORT', allocationPct: pct, reason: `Kestner ${sinyal > 0 ? 'long' : 'short'}: DI ${di.toFixed(1)}`, indicators, ...this.stopAyari(i, c[i]) };
  }
}
KestnerIraksama.warmupBars = () => 101;
KestnerIraksama.boyutlama = 'portfoyRiski';
KestnerIraksama.paramSchema = {
  stopAtr: { type: 'number', default: 0, min: 0, max: 10, step: 0.5, label: 'Gevşek stop (ATR katı)', group: 'Stop', description: '0 = kitap kuralı (stopsuz).' }
};

// ═══════════════════════════════════════════════════════════════════════════
/**
 * CHANDE — KANAL KIRILIMI + GERİ ÇEKİLME (CB-PB). Yalnız long.
 * Kitap: son 7 gün içinde yeni 20 günlük zirve VE bugünün low'u son 5 günün en
 *        düşük low'unun altında → ertesi açılışta al. Çıkış: 50. gün kapanışı
 *        ya da 40 günlük düşük izleyen stop. İlk stop $1.500 / $5.000.
 * Bizim: ilk stop → 3 × ortalama aralık(10) (Chande'nin kendi önerisi);
 *        kapanışta doldurma; boyut nakdin %95'i.
 */
class ChandeCbPb extends KitapStratejisi {
  constructor(config = {}) { super('chande_cbpb', config); }
  sifirla() { this.girisBar = null; }
  gostergeler(m) {
    const c = m.map(x => x.close), h = m.map(x => x.high), l = m.map(x => x.low);
    const aralik = m.map(x => x.high - x.low);
    return { c, h, l, ort10: sma(aralik, 10) };
  }
  karar(i, g, d) {
    const { c, h, l, ort10 } = g;
    if (i < 60 || ort10[i] == null) return { action: 'HOLD' };
    // Son 7 günde (bugün dahil) yeni 20 günlük zirve var mı?
    let yeniZirve = false;
    for (let k = i - 6; k <= i; k++) {
      let onceki = -Infinity;
      for (let j = k - 20; j < k; j++) if (h[j] > onceki) onceki = h[j];
      if (h[k] > onceki) { yeniZirve = true; break; }
    }
    let dusuk5 = Infinity; for (let j = i - 5; j < i; j++) if (l[j] < dusuk5) dusuk5 = l[j];
    let dusuk40 = Infinity; for (let j = i - 39; j <= i; j++) if (l[j] < dusuk40) dusuk40 = l[j];
    const indicators = { yeniZirve7g: yeniZirve ? 1 : 0, dusuk5: +dusuk5.toFixed(4), dusuk40: +dusuk40.toFixed(4) };
    if (d.long) {
      if (this.girisBar == null) this.girisBar = i;
      if (i - this.girisBar >= 50) { this.girisBar = null; return { action: 'SELL', side: 'long', reason: 'Chande: 50 gün', indicators, ...STOPSUZ }; }
      if (c[i] < dusuk40) { this.girisBar = null; return { action: 'SELL', side: 'long', reason: 'Chande: 40 günlük düşük kırıldı', indicators, ...STOPSUZ }; }
      return { action: 'HOLD', indicators };
    }
    this.girisBar = null;
    if (yeniZirve && l[i] < dusuk5) {
      this.girisBar = i;
      const stop = Number(this.config.stopAtr) > 0 ? this.stopAyari(i, c[i]) : { stopLossPct: Math.min(95, 3 * ort10[i] / c[i] * 100), takeProfitPct: 1e6 };
      return { action: 'BUY', allocationPct: 95, reason: 'Chande CB-PB: 20g zirve sonrası 5g dibi', indicators, ...stop };
    }
    return { action: 'HOLD', indicators };
  }
}
ChandeCbPb.warmupBars = () => 61;
ChandeCbPb.boyutlama = 'sermayePayi';
ChandeCbPb.paramSchema = {
  stopAtr: { type: 'number', default: 0, min: 0, max: 10, step: 0.5, label: 'Stop (ATR katı, 0 = 3 × ort. aralık)', group: 'Stop' }
};

// ═══════════════════════════════════════════════════════════════════════════
/**
 * CARVER — ÇARPIKLIK (SKEW) KURALI. Long + short, sürekli maruziyet.
 * Kitap: tahmin = −çarpıklık(60g günlük getiri), EWMA span = 60/4 = 15;
 *        ölçekleyici 33,3; |F| ≤ 20; pozisyon = F/10 × vol hedefli pozisyon.
 * Bizim: vol hedefi %25 yıllık / σ(30g), tavan 2x (Donchian ile aynı);
 *        maruziyet değişimi < 0,10 ise işlem yok. Ölçekleyici vadeli
 *        verisinden — kriptoda yeniden hesaplanmadı (sabit kitap değeri).
 */
class CarverCarpiklik extends KitapStratejisi {
  constructor(config = {}) { super('carver_carpiklik', config); }
  sifirla() { this.uygulanan = 0; }
  gostergeler(m) {
    const c = m.map(x => x.close);
    const r = c.map((x, i) => (i ? x / c[i - 1] - 1 : 0));
    const skew = new Array(c.length).fill(null);
    for (let i = 60; i < c.length; i++) {
      let t = 0; for (let j = i - 59; j <= i; j++) t += r[j];
      const o = t / 60; let m2 = 0, m3 = 0;
      for (let j = i - 59; j <= i; j++) { const d = r[j] - o; m2 += d * d; m3 += d * d * d; }
      m2 /= 60; m3 /= 60;
      skew[i] = m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
    }
    const k = 2 / (15 + 1), sk = new Array(c.length).fill(null);
    let e = null;
    for (let i = 0; i < c.length; i++) { if (skew[i] == null) continue; e = e == null ? skew[i] : skew[i] * k + e * (1 - k); sk[i] = e; }
    const vol = stdKayan(r, 30).map(v => (v == null ? null : v * Math.sqrt(365)));
    return { c, sk, vol };
  }
  karar(i, g, d) {
    const { c, sk, vol } = g;
    if (sk[i] == null || !(vol[i] > 0)) return { action: 'HOLD' };
    const F = Math.max(-20, Math.min(20, -sk[i] * 33.3));
    let hedef = Math.max(-2, Math.min(2, (F / 10) * (0.25 / vol[i])));
    if (d.spot && hedef < 0) hedef = 0;
    const indicators = { tahmin: +F.toFixed(2), carpiklik: +sk[i].toFixed(3), hedefMaruziyet: +hedef.toFixed(3) };
    const poz = d.long || d.short;
    const mevcut = poz && d.ozsermaye ? (d.short ? -1 : 1) * poz.amount * c[i] / d.ozsermaye : 0;
    if (Math.abs(hedef - this.uygulanan) < 0.10 && !(hedef === 0 && poz)) return { action: 'HOLD', indicators };
    this.uygulanan = hedef;
    // Yön değişimi ya da sıfır: önce kapat.
    if (d.long && hedef <= 0) return { action: 'SELL', side: 'long', reason: `Skew: hedef ${hedef.toFixed(2)}x`, indicators, ...STOPSUZ };
    if (d.short && hedef >= 0) return { action: 'SELL', side: 'short', reason: `Skew: hedef ${hedef.toFixed(2)}x`, indicators, ...STOPSUZ };
    if (hedef === 0) return { action: 'HOLD', indicators };
    if (!poz) return { action: hedef > 0 ? 'BUY' : 'SHORT', allocationPct: KitapStratejisi.yuzde(Math.abs(hedef), d), reason: `Skew ${hedef > 0 ? 'long' : 'short'} ${hedef.toFixed(2)}x (F ${F.toFixed(1)})`, indicators, ...STOPSUZ };
    // Aynı yönde büyüt / küçült.
    const a = Math.abs(hedef), m = Math.abs(mevcut);
    if (a > m) {
      if (d.short) return { action: 'HOLD', indicators };   // motor short'a kademe eklemez — eşikte kalır
      return { action: 'BUY', addToPosition: true, allocationPct: KitapStratejisi.yuzde(a - m, d), reason: `Skew artır ${m.toFixed(2)} → ${a.toFixed(2)}x`, indicators, ...STOPSUZ };
    }
    const oran = m > 0 ? Math.min(0.99, 1 - a / m) : 0;
    return oran > 0 ? { action: 'SELL', side: d.short ? 'short' : 'long', partialPct: oran, reason: `Skew azalt ${m.toFixed(2)} → ${a.toFixed(2)}x`, indicators, ...STOPSUZ } : { action: 'HOLD', indicators };
  }
}
CarverCarpiklik.warmupBars = () => 61;
CarverCarpiklik.boyutlama = 'sermayePayi';
CarverCarpiklik.paramSchema = {};

module.exports = { PruittYuzdeB, KestnerIraksama, ChandeCbPb, CarverCarpiklik };
