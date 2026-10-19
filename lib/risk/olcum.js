/**
 * RİSK ÖLÇÜMÜ — saf fonksiyonlar (G/Ç yok). `referans/ARASTIRMA-RISK.md` §4.0, §4.7.
 *
 *   ewmaSigma      · EWMA oynaklık (span), yıllık √365
 *   harmanSigma    · 0,7·EWMA(32) + 0,3·uzun dönem σ, taban (Carver)
 *   tarihselES     · Expected Shortfall (tarihsel, α kuyruğu)
 *   cdar           · Conditional Drawdown-at-Risk (drawdown dağılımının kuyruğu)
 *   maxDD          · en büyük düşüş (özsermaye eğrisinden ya da getirilerden)
 *   duraganBootstrap · Politis–Romano durağan bootstrap (tohumlu, takvim eşzamanlı)
 *   portfoySigma   · ağırlık + EWMA kovaryans (büzülmeli) → σ_p
 *
 * Kripto 7/24: yıllıklaştırma √365.
 */

const YIL = 365;

/** xorshift32 — tohumlu, tekrarlanabilir. */
function rastgele(tohum = 1) {
  let x = (tohum >>> 0) || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

/** EWMA varyansı → yıllık σ. `span` gün; λ = 1 − 2/(span+1). */
function ewmaSigma(getiriler, span = 32) {
  if (!getiriler.length) return null;
  const a = 2 / (span + 1);
  let v = null;
  for (const r of getiriler) v = v == null ? r * r : (1 - a) * v + a * r * r;
  return Math.sqrt(v * YIL);
}

/** Uzun dönem σ (son en çok 3 yıl), yıllık. */
function uzunSigma(getiriler, gun = 3 * YIL) {
  const s = getiriler.slice(-gun);
  if (s.length < 2) return null;
  const o = s.reduce((x, y) => x + y, 0) / s.length;
  return Math.sqrt(s.reduce((x, y) => x + (y - o) ** 2, 0) / (s.length - 1) * YIL);
}

/** Carver harmanı: 0,7·EWMA(32) + 0,3·uzun; yıllık taban (kriptoda %30). */
function harmanSigma(getiriler, taban = 0.30) {
  const e = ewmaSigma(getiriler, 32), u = uzunSigma(getiriler);
  if (e == null) return null;
  const s = u == null ? e : 0.7 * e + 0.3 * u;
  return Math.max(taban, s);
}

/** Tarihsel ES: en kötü α kuyruğunun ortalama KAYBI (pozitif sayı). */
function tarihselES(getiriler, alfa = 0.025) {
  if (!getiriler.length) return null;
  const s = [...getiriler].sort((a, b) => a - b);
  const k = Math.max(1, Math.floor(s.length * alfa));
  return -s.slice(0, k).reduce((x, y) => x + y, 0) / k;
}

/** Getirilerden özsermaye eğrisi (başlangıç 1). */
function egri(getiriler) {
  const e = [1];
  for (const r of getiriler) e.push(e[e.length - 1] * (1 + r));
  return e;
}

/** Drawdown dizisi (0 … 1) ve en büyük düşüş. */
function dusus(egriDizi) {
  let tepe = -Infinity, en = 0;
  const d = egriDizi.map(v => { tepe = Math.max(tepe, v); const x = 1 - v / tepe; en = Math.max(en, x); return x; });
  return { dizi: d, max: en };
}

const maxDD = (getiriler) => dusus(egri(getiriler)).max;

/** CDaR: drawdown dizisinin en kötü (1−β) kısmının ortalaması. */
function cdar(getiriler, beta = 0.95) {
  const d = dusus(egri(getiriler)).dizi.slice(1).sort((a, b) => b - a);
  if (!d.length) return null;
  const k = Math.max(1, Math.floor(d.length * (1 - beta)));
  return d.slice(0, k).reduce((x, y) => x + y, 0) / k;
}

/** h günlük kayan toplam getirinin en kötüsü (bileşik). */
function enKotuPencere(getiriler, h) {
  let en = Infinity;
  for (let i = 0; i + h <= getiriler.length; i++) {
    let c = 1; for (let j = i; j < i + h; j++) c *= 1 + getiriler[j];
    en = Math.min(en, c - 1);
  }
  return en === Infinity ? null : en;
}

const yuzdelik = (dizi, q) => { const s = [...dizi].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };

/**
 * DURAĞAN BOOTSTRAP (Politis & Romano 1994). Satırlar = günler; her satır bir
 * dizi (takvim eşzamanlı: aynı günün tüm serileri birlikte çekilir — kriz
 * korelasyonu korunur). Blok uzunluğu geometrik, ortalama `b`.
 * @param satirlar  [[r_seri1, r_seri2, …], …] ya da [r, r, …]
 * @param secenek   { b = 20, N = 10000, H = 365, tohum = 42, olc(yol) → nesne }
 * @returns olc() çıktılarının dizisi
 */
function duraganBootstrap(satirlar, secenek = {}) {
  const { b = 20, N = 10000, H = YIL, tohum = 42, olc } = secenek;
  const R = rastgele(tohum), n = satirlar.length, p = 1 / b;
  const sonuc = [];
  for (let k = 0; k < N; k++) {
    const yol = [];
    let i = Math.floor(R() * n);
    for (let t = 0; t < H; t++) {
      yol.push(satirlar[i]);
      i = R() < p ? Math.floor(R() * n) : (i + 1) % n;
    }
    sonuc.push(olc(yol));
  }
  return sonuc;
}

/**
 * Portföy σ (yıllık): w ağırlıklar (özsermayenin katı), getiri matrisi
 * [gün][varlık]. EWMA kovaryans (span) + sabit korelasyona doğru büzülme δ.
 */
function portfoySigma(w, matris, span = 32, delta = 0.3) {
  const n = w.length; if (!matris.length) return null;
  const a = 2 / (span + 1);
  const C = Array.from({ length: n }, () => new Array(n).fill(0));
  let ilk = true;
  for (const r of matris) {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = (r[i] || 0) * (r[j] || 0);
      C[i][j] = ilk ? x : (1 - a) * C[i][j] + a * x;
    }
    ilk = false;
  }
  // Büzülme: korelasyonları ortalama korelasyona doğru δ kadar çek.
  const s = C.map((row, i) => Math.sqrt(Math.max(row[i], 0)));
  let top = 0, say = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (s[i] > 0 && s[j] > 0) { top += C[i][j] / (s[i] * s[j]); say++; }
  const rOrt = say ? top / say : 0;
  let v = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const rho = i === j ? 1 : (s[i] > 0 && s[j] > 0 ? (1 - delta) * C[i][j] / (s[i] * s[j]) + delta * rOrt : 0);
    v += w[i] * w[j] * rho * s[i] * s[j];
  }
  return Math.sqrt(Math.max(v, 0) * YIL);
}

module.exports = { rastgele, ewmaSigma, uzunSigma, harmanSigma, tarihselES, egri, dusus, maxDD, cdar, enKotuPencere, yuzdelik, duraganBootstrap, portfoySigma, YIL };
