/**
 * KİTAP STRATEJİLERİ — ortak göstergeler ve iskelet.
 *
 * Tüm göstergeler NEDENSEL dizi döndürür: `g[i]` yalnız `0..i` barlarından
 * hesaplanır (ileriye bakma yok). Strateji `prepare(mumlar)` ile diziyi bir
 * kez kurar, `evaluate` `motor.barIndex` ile okur — O(n). Canlı motor
 * `prepare` çağırmaz; o zaman pencereden yeniden hesaplanır.
 */
const BaseStrategy = require('../baseStrategy');

function ema(x, n) {
  const k = 2 / (n + 1), o = new Array(x.length).fill(null);
  let e = null;
  for (let i = 0; i < x.length; i++) { e = e == null ? x[i] : x[i] * k + e * (1 - k); if (i >= n - 1) o[i] = e; }
  return o;
}

function sma(x, n) {
  const o = new Array(x.length).fill(null);
  let t = 0;
  for (let i = 0; i < x.length; i++) { t += x[i]; if (i >= n) t -= x[i - n]; if (i >= n - 1) o[i] = t / n; }
  return o;
}

/** Wilder RSI. */
function rsi(x, n) {
  const o = new Array(x.length).fill(null);
  let ag = 0, al = 0;
  for (let i = 1; i < x.length; i++) {
    const d = x[i] - x[i - 1], u = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { ag += u / n; al += dn / n; if (i === n) o[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); continue; }
    ag = (ag * (n - 1) + u) / n; al = (al * (n - 1) + dn) / n;
    o[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return o;
}

/** Son n fiyat DEĞİŞİMİNİN (Δclose) örneklem std'si — Clenow/Kestner tanımı. */
function stdDegisim(c, n) {
  const o = new Array(c.length).fill(null);
  for (let i = n; i < c.length; i++) {
    let t = 0, t2 = 0;
    for (let j = i - n + 1; j <= i; j++) { const d = c[j] - c[j - 1]; t += d; t2 += d * d; }
    const ort = t / n;
    o[i] = Math.sqrt(Math.max(0, (t2 - n * ort * ort) / (n - 1)));
  }
  return o;
}

/** Tarihsel volatilite (%, yıllık, √365 — kripto 7/24): log getiri std'si. */
function hv(c, n) {
  const o = new Array(c.length).fill(null);
  for (let i = n; i < c.length; i++) {
    let t = 0, t2 = 0;
    for (let j = i - n + 1; j <= i; j++) { const r = Math.log(c[j] / c[j - 1]); t += r; t2 += r * r; }
    const ort = t / n;
    o[i] = Math.sqrt(Math.max(0, (t2 - n * ort * ort) / (n - 1))) * Math.sqrt(365) * 100;
  }
  return o;
}

/**
 * ConnorsRSI = [RSI(C,3) + RSI(seri,2) + YüzdeSırası(ROC1, 100)] / 3.
 * Seri: ardışık yükseliş günü sayısı (+), düşüş (−), değişmezse 0.
 * Yüzde sırası: önceki 100 günlük getirinin kaçı bugünkünden küçük.
 */
function connorsRsi(c) {
  const r3 = rsi(c, 3);
  const seri = new Array(c.length).fill(0);
  for (let i = 1; i < c.length; i++) {
    if (c[i] > c[i - 1]) seri[i] = seri[i - 1] > 0 ? seri[i - 1] + 1 : 1;
    else if (c[i] < c[i - 1]) seri[i] = seri[i - 1] < 0 ? seri[i - 1] - 1 : -1;
  }
  const rs = rsi(seri, 2);
  const o = new Array(c.length).fill(null);
  for (let i = 101; i < c.length; i++) {
    const bugun = c[i] / c[i - 1] - 1;
    let kucuk = 0;
    for (let j = i - 100; j < i; j++) if (c[j] / c[j - 1] - 1 < bugun) kucuk++;
    if (r3[i] != null && rs[i] != null) o[i] = (r3[i] + rs[i] + kucuk) / 3;
  }
  return o;
}

/** Wilder ATR. */
function atr(m, n) {
  const o = new Array(m.length).fill(null);
  let a = null;
  for (let i = 1; i < m.length; i++) {
    const tr = Math.max(m[i].high - m[i].low, Math.abs(m[i].high - m[i - 1].close), Math.abs(m[i].low - m[i - 1].close));
    if (i < n) { a = (a || 0) + tr / n; continue; }
    a = i === n ? (a + tr / n) : (a * (n - 1) + tr) / n;
    o[i] = a;
  }
  return o;
}

/** Stopsuz kitap kuralı: motorun varsayılan %2 stop / %4 hedefini kapatır. */
const STOPSUZ = Object.freeze({ stopLossPct: 95, takeProfitPct: 1e6 });

/**
 * İskelet: `gostergeler(mumlar)` → { ad: dizi } ; `karar(i, g, durum)`.
 * Alt sınıf yalnız bu ikisini yazar.
 */
class KitapStratejisi extends BaseStrategy {
  constructor(ad, config) { super(ad, config); this.g = null; this.n = 0; }
  prepare(mumlar) { this.g = this.gostergeler(mumlar); this.atrDizi = atr(mumlar, 20); this.n = mumlar.length; this.sifirla(); }

  /**
   * GEVŞEK STOP VARYANTI (PLAN-KITAP-STRATEJI.md tur 2b). `config.stopAtr` = k
   * verilirse giriş stopu = k × ATR(20); verilmezse kitap kuralı (stopsuz).
   * Değer aranmaz — ölçümde tek önceden seçilmiş k = 3.
   */
  stopAyari(i, kapanis) {
    const k = Number(this.config && this.config.stopAtr) || 0;
    const a = this.atrDizi && this.atrDizi[i];
    if (!(k > 0) || !(a > 0) || !(kapanis > 0)) return STOPSUZ;
    return { stopLossPct: Math.min(95, k * a / kapanis * 100), takeProfitPct: 1e6 };
  }
  sifirla() {}
  evaluate(ohlcv, ticker, positions, motor = {}) {
    let i = Number.isFinite(motor.barIndex) ? motor.barIndex : ohlcv.length - 1;
    let g = this.g;
    if (!g || i >= this.n) { g = this.gostergeler(ohlcv); this.atrDizi = atr(ohlcv, 20); i = ohlcv.length - 1; }
    const poz = positions || [];
    return this.karar(i, g, {
      long: poz.find(p => p.side !== 'short') || null,
      short: poz.find(p => p.side === 'short') || null,
      mum: ohlcv[ohlcv.length - 1],
      zaman: Number(ohlcv[ohlcv.length - 1].time),
      ozsermaye: Number(motor.equity) > 0 ? motor.equity : null,
      nakit: Number(motor.capital) > 0 ? motor.capital : null,
      kaldirac: Math.max(1, Number(this.config.leverage) || 1),
      spot: !this.config.marketType || String(this.config.marketType) === 'spot'
    });
  }

  /** Hedef nominal oran (özsermayenin katı) → motorun allocationPct'si (nakdin %'si). */
  static yuzde(oran, d) {
    if (!d.ozsermaye || !d.nakit) return 0;
    return Math.max(0, Math.min(95, (oran * d.ozsermaye / d.kaldirac) / d.nakit * 100));
  }
}

module.exports = { ema, sma, rsi, atr, stdDegisim, hv, connorsRsi, STOPSUZ, KitapStratejisi };
