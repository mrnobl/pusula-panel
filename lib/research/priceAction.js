/**
 * PRICE ACTION TANIMLARI — PLAN-PRICE-ACTION.md (ön kayıt c890b29), parametre araması YOK.
 * Saf fonksiyonlar; girdi dizileri { t, o, h, l, c } (eski → yeni). Bar i'de üretilen her şey
 * YALNIZ ≤ i verisini kullanır (scripts/pa-dalga1.js ileriye-bakma denetimiyle sınanır).
 *
 *  · Salınım (fractal, Bill Williams): bar k'nın tepesi k−2…k+2'nin en yükseği (komşu dördünden KESİN büyük;
 *    eşitlikte salınım yok) → k+2 kapanınca BİLİNİR. Dip aynası.
 *  · Yapı (i'de): onaylı (k ≤ i−2) son iki tepe ve son iki dip: HH+HL → +1 (YÜKSELİŞ), LH+LL → −1 (DÜŞÜŞ), aksi 0.
 *  · Güçlü kapanış: (c−l)/(h−l) ≥ 0,75 (long) / ≤ 0,25 (short); h = l → güçlü değil.
 *  · Pin bar: alt fitil ≥ 2×gövde ve ≥ %60×aralık, kapanış üst üçte birde (+1); kayan yıldız aynası (−1).
 *  · Yutan: önceki kırmızı, bu yeşil, bu gövde önceki gövdeyi kapsar (o ≤ önceki c, c ≥ önceki o) → +1; ayna −1.
 *  · İç bar: h[k] ≤ h[k−1] ve l[k] ≥ l[k−1]; k+1…k+3 içinde kapanışın ANA barın tepesini ilk aşması → +1 (dip → −1).
 *  · Süpürme: l[i] < son onaylı dip VE c[i] > o dip → +1; ayna −1.
 *  · Seviye: son 100 barın (k ∈ [i−99, i−2]) onaylı salınım fiyatları; fiyat ±0,5×ATR14 içinde → seviyede.
 *  · ATR14: son 14 barın gerçek aralık ortalaması (basit), i dahil.
 */
'use strict';

function diziler(bars) {
  const n = bars.length, t = new Float64Array(n), o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n);
  bars.forEach((b, i) => { t[i] = b.time; o[i] = b.open; h[i] = b.high; l[i] = b.low; c[i] = b.close; });
  return { n, t, o, h, l, c };
}

/** Ham fractal işaretleri (k+2 verisi gerekir — yalnız k ≤ i−2 için okunmalı). */
function fractal(X) {
  const { n, h, l } = X, tepe = new Uint8Array(n), dip = new Uint8Array(n);
  for (let k = 2; k + 2 < n; k++) {
    if (h[k] > h[k - 1] && h[k] > h[k - 2] && h[k] > h[k + 1] && h[k] > h[k + 2]) tepe[k] = 1;
    if (l[k] < l[k - 1] && l[k] < l[k - 2] && l[k] < l[k + 1] && l[k] < l[k + 2]) dip[k] = 1;
  }
  return { tepe, dip };
}

/** i'deki yapı, son onaylı tepe/dip fiyatı (i'de bilinen). */
function yapiDizi(X, F = fractal(X)) {
  const { n, h, l } = X;
  const yapi = new Int8Array(n), sonTepe = new Float64Array(n).fill(NaN), sonDip = new Float64Array(n).fill(NaN);
  let t1 = NaN, t2 = NaN, d1 = NaN, d2 = NaN;   // t2 en son, t1 bir önceki
  for (let i = 0; i < n; i++) {
    const k = i - 2;
    if (k >= 2) {
      if (F.tepe[k]) { t1 = t2; t2 = h[k]; }
      if (F.dip[k]) { d1 = d2; d2 = l[k]; }
    }
    sonTepe[i] = t2; sonDip[i] = d2;
    if (Number.isFinite(t1) && Number.isFinite(d1)) {
      if (t2 > t1 && d2 > d1) yapi[i] = 1;
      else if (t2 < t1 && d2 < d1) yapi[i] = -1;
    }
  }
  return { yapi, sonTepe, sonDip };
}

function atrDizi(X, N = 14) {
  const { n, h, l, c } = X, a = new Float64Array(n).fill(NaN);
  for (let i = N; i < n; i++) {
    let s = 0;
    for (let j = i - N + 1; j <= i; j++) s += Math.max(h[j] - l[j], Math.abs(h[j] - c[j - 1]), Math.abs(l[j] - c[j - 1]));
    a[i] = s / N;
  }
  return a;
}

function gucluKapanis(h, l, c, yon) {
  const r = h - l; if (!(r > 0)) return false;
  const p = (c - l) / r;
  return yon > 0 ? p >= 0.75 : p <= 0.25;
}

function pinBar(o, h, l, c) {
  const r = h - l; if (!(r > 0)) return 0;
  const g = Math.abs(c - o), alt = Math.min(o, c) - l, ust = h - Math.max(o, c), p = (c - l) / r;
  if (alt >= 2 * g && alt >= 0.6 * r && p >= 2 / 3) return 1;
  if (ust >= 2 * g && ust >= 0.6 * r && p <= 1 / 3) return -1;
  return 0;
}

function yutan(o0, c0, o1, c1) {
  if (c0 < o0 && c1 > o1 && o1 <= c0 && c1 >= o0) return 1;
  if (c0 > o0 && c1 < o1 && o1 >= c0 && c1 <= o0) return -1;
  return 0;
}

/** Bar i, k ∈ [i−99, i−2] onaylı salınım fiyatlarından birine ±0,5×atr içinde mi? */
function seviyede(X, F, i, fiyat, atr) {
  if (!Number.isFinite(atr)) return false;
  const e = 0.5 * atr;
  for (let k = Math.max(2, i - 99); k <= i - 2; k++) {
    if (F.tepe[k] && Math.abs(X.h[k] - fiyat) <= e) return true;
    if (F.dip[k] && Math.abs(X.l[k] - fiyat) <= e) return true;
  }
  return false;
}

/** İç bar kırılımı i'de: { yon, k (iç bar) } | null. En yeni iç bar önce. */
function icBarKirilim(X, i) {
  const { h, l, c } = X;
  for (let k = i - 1; k >= i - 3 && k >= 1; k--) {
    if (!(h[k] <= h[k - 1] && l[k] >= l[k - 1])) continue;
    const ust = h[k - 1], alt = l[k - 1];
    let oncekiU = false, oncekiA = false;
    for (let j = k + 1; j < i; j++) { if (c[j] > ust) oncekiU = true; if (c[j] < alt) oncekiA = true; }
    if (c[i] > ust && !oncekiU) return { yon: 1, k };
    if (c[i] < alt && !oncekiA) return { yon: -1, k };
  }
  return null;
}

function supurme(X, Y, i) {
  const d = Y.sonDip[i], t = Y.sonTepe[i];
  if (Number.isFinite(d) && X.l[i] < d && X.c[i] > d) return 1;
  if (Number.isFinite(t) && X.h[i] > t && X.c[i] < t) return -1;
  return 0;
}

/**
 * Kurulum sinyalleri. gunYapi(i) → bar i kapanışında bilinen GÜNLÜK yapı (+1/−1/0).
 * @returns Array(n) of null | { yon, stop } (bar i kapanışında karar; giriş i+1 açılışı)
 */
function sinyaller(X, kurulum, gunYapi) {
  const F = fractal(X), Y = yapiDizi(X, F), A = atrDizi(X);
  const out = new Array(X.n).fill(null);
  for (let i = 15; i < X.n; i++) {
    const a = A[i]; if (!Number.isFinite(a)) continue;
    let yon = 0, sb = i;
    if (kurulum === 'pin') { yon = pinBar(X.o[i], X.h[i], X.l[i], X.c[i]); if (yon && !seviyede(X, F, i, yon > 0 ? X.l[i] : X.h[i], a)) yon = 0; }
    else if (kurulum === 'yutan') { yon = yutan(X.o[i - 1], X.c[i - 1], X.o[i], X.c[i]); if (yon && !seviyede(X, F, i, yon > 0 ? X.l[i] : X.h[i], a)) yon = 0; }
    else if (kurulum === 'icbar') { const r = icBarKirilim(X, i); if (r) { yon = r.yon; sb = r.k; } }
    else if (kurulum === 'supurme') yon = supurme(X, Y, i);
    else throw new Error('kurulum: ' + kurulum);
    if (!yon) continue;
    if (gunYapi(i) !== yon) continue;   // trend yönünde: long ⇔ YÜKSELİŞ, short ⇔ DÜŞÜŞ
    const stop = yon > 0 ? X.l[sb] - 0.1 * a : X.h[sb] + 0.1 * a;
    out[i] = { yon, stop, sb };
  }
  return out;
}

module.exports = { diziler, fractal, yapiDizi, atrDizi, gucluKapanis, pinBar, yutan, seviyede, icBarKirilim, supurme, sinyaller };
