/**
 * PORTFÖY OPTİMİZASYONU — PLAN-PORTFOY.md ön kaydı C (walk-forward), D (ağırlık yöntemleri), E (ölçüler).
 * Ölçüm: `node scripts/portfoy-tasarim.js` · öz test: `node scripts/portfoy-selftest.js`
 * Saf modül: veri okumaz (veri birleştirme scripts/portfoy-tasarim.js'te).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SÖZLEŞME
 * ═══════════════════════════════════════════════════════════════════════════
 *  · Takvim: Pzt–Cum günleri (UTC gece yarısı ms, artan). Her kolun getirisi bu takvime hizalı Float64Array;
 *    NaN = o gün kolun verisi yok (başlamadı / pencere dışı). NAKIT_USD = 0 getiri.
 *  · Walk-forward (ön kayıt C): her ay başı M için hedef ağırlık YALNIZ [M − 36 ay, M) günlerinden hesaplanır.
 *    Tahmin verisi = bu aralıktaki TAM haftaların (Pzt–Cum beş günün hepsi aralıkta) bileşik haftalık getirileri.
 *    Bir kol M ayında ancak penceredeki günlerin HEPSİNDE verisi varsa (36 ay geçmiş) uygun sayılır; değilse 0 ağırlık.
 *  · Uygulama: hedef, M'nin ilk takvim gününün (ilk Pzt–Cum günü) KAPANIŞINDA işleme girer; o günün getirisi eski
 *    ağırlıklarla kazanılır (bir gün gecikme). İlk ay başında ilk yerleşim maliyetsizdir.
 *  · Dengeleme (ön kayıt D "üç ayda bir + %5 bant", yorum): her ay başı denetlenir; işlem yapılır ⇔ ay çeyrek başı
 *    (Ocak/Nisan/Temmuz/Ekim) VEYA herhangi bir kolda |gerçek ağırlık − hedef| > bant. İşlemde tüm kollar hedefe çekilir.
 *    Maliyet = maliyet × Σ|Δ tutar| (her bacak, tek yön %0,3 — çıkan ve giren tutarın ikisi de öder).
 *  · Ağırlıklar long-only, toplam 1, kol başına [0, tavan].
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * API
 * ═══════════════════════════════════════════════════════════════════════════
 * Doğrusal cebir / kestirim
 *   kovaryans(X)                  → n×n örneklem kovaryansı (1/T, ortalamadan arındırılmış) — X: T×n dizi
 *   ledoitWolf(X)                 → { S (büzülmüş), delta, F (sabit korelasyon hedefi), orneklem }
 *                                   Ledoit & Wolf (2004) "Honey, I shrunk the sample covariance matrix" — sabit korelasyon hedefi.
 *   cvar(kayiplar, alfa = 0.95)   → kayıpların en kötü (1−α) kesiminin ortalaması (kesirli sınır ağırlıklı; Rockafellar–Uryasev)
 * Kısıt kümesi
 *   kutuSimpleksIzdusum(v, hi)    → argmin ||w − v||², Σw = 1, 0 ≤ w ≤ hi  (τ ikiye bölme)
 *   suDoldur(a, hi)               → w_i = min(hi_i, λ a_i), Σw = 1 (a_i = 0 → w_i = 0)  — tavanlı eşit / ters-vol
 * Yöntemler — agirlikHesapla(yontem, X, { hi, nakit }) → { w: Float64Array, not? }
 *   X: T×n haftalık getiri (uygun kollar), hi: tavanlar, nakit: nakit kolunun sütunu (yoksa −1)
 *   'esit'      eşit ağırlık (nakit dahil tüm kollar), tavanla su doldurma
 *   'tersVol'   w ∝ 1/σ (yalnız riskli kollar; nakit σ = 0 → dışarıda), tavanla su doldurma
 *   'erc'       eşit risk katkısı (LW Σ, riskli kollar); tavan bağlamazsa CCD (Griveau-Billion 2013) tam çözüm,
 *               bağlarsa Σ_i (RC_i/σ² − 1/n)² en küçüklemesi (izdüşümlü gradyan, CCD başlangıçlı)
 *   'minVar'    w'Σw en küçük (LW Σ; nakit sıfır satır/sütun olarak dahil)
 *   'cvar'      haftalık kayıp CVaR(%95) en küçük (nakit dahil; Rockafellar–Uryasev LP, iki aşamalı simpleks — tam çözüm;
 *               öz testte ızgara araması ve yumuşatılmış ikinci çözücü minCVaR ile çapraz denetlenir)
 *   'maksSharpe' μ'w/√(w'Σw) en büyük; μ = geçmiş ortalamanın YARISI (ön kayıt), Σ = LW, yalnız riskli kollar
 *               (nakit σ = 0, rf = 0 → oran ölçek-değişmez). Tüm μ ≤ 0 → 'minVar' (not: 'μ≤0 → minVar').
 * Walk-forward motoru
 *   walkForward({ takvim, getiri: {kol: Float64Array}, kollar, yontem, tavan: {kol: üst sınır}, oosBas, bitIdx?,
 *                 pencereAy = 36, bant = 0.05, ceyrek = [0,3,6,9], maliyet = 0.003, nakit = 'NAKIT_USD', sabit? })
 *        sabit: {kol: ağırlık} verilirse yöntem yerine bu sabit hedef (kıyas portföyleri: 60/40, yalnız bot)
 *        gunlukBant (vars. false): true → ay başı dışındaki HER takvim gününün kapanışında da bant denetlenir; herhangi bir kolun
 *            |gerçek − son hedef| > bant ise o kapanışta son hedefe tam dengelenir (837 sürüm 2 kuralı, denetim B-01). false iken
 *            davranış BİREBİR eski (öz test). Gün içi dengelemeler `bantIslemleri` [{ time, sapma, maliyet }] dizisinde.
 *        → { egri:[{time, oz}], gunluk: { ts, r, x (kol katkıları x[i][k] = w_önceki × r) }, aylar:[{ay, hedef, onceki,
 *            islem, maliyet, uygun, not}], maliyetToplam, devirToplam, ortAgirlik, sonHedef, kollar }
 *   ayBaslari(takvim)             → [indeks] ayın ilk takvim günü
 *   ayEkle(t, k)                  → t'nin ayının 1'inden k ay sonrası (UTC ms)
 *   haftalikMatris(takvim, getiri, kollar, a, b) → { X: T×n, haftalar } [a, b) içindeki tam haftalar
 * Ölçüler
 *   olcu(egri, { bas, bit, yillik = 261 })     → { cagr, maxDD, sharpe, sortino, vol, enKotuYil, enKotuAy, cvarGun, cvarAy, yillar, gun }
 *   riskKatkisi(sonuc, bas, bit)  → { kol: pay } haftalık toplanmış katkı: cov(x_k, p)/var(p)
 *   bootstrapAralik(r, { b = 20, N = 2000, tohum = 7, yillik = 261 }) → { cagr: [p5, p50, p95], maxDD: [p5, p50, p95] }
 */
const GUN = 864e5;

// ═══ 1. DOĞRUSAL CEBİR / KESTİRİM ════════════════════════════════════════════
function ortalama(X) { const T = X.length, n = X[0].length, m = new Float64Array(n); for (const x of X) for (let i = 0; i < n; i++) m[i] += x[i]; for (let i = 0; i < n; i++) m[i] /= T; return m; }
function kovaryans(X) {
  const T = X.length, n = X[0].length, m = ortalama(X);
  const S = Array.from({ length: n }, () => new Float64Array(n));
  for (const x of X) for (let i = 0; i < n; i++) { const a = x[i] - m[i]; for (let j = i; j < n; j++) S[i][j] += a * (x[j] - m[j]); }
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { S[i][j] /= T; S[j][i] = S[i][j]; }
  return S;
}
function ledoitWolf(X) {
  const T = X.length, n = X[0].length;
  const S = kovaryans(X);
  if (n === 1) return { S, delta: 0, F: S, orneklem: S };
  const m = ortalama(X);
  const Y = X.map(x => Float64Array.from(x, (v, i) => v - m[i]));
  const sd = Float64Array.from({ length: n }, (_, i) => Math.sqrt(S[i][i]));
  let rs = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) rs += S[i][j] / (sd[i] * sd[j]);
  const rbar = 2 * rs / ((n - 1) * n);
  const F = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => (i === j ? S[i][i] : rbar * sd[i] * sd[j])));
  // π̂ ve θ
  const pi = Array.from({ length: n }, () => new Float64Array(n));
  const th = Array.from({ length: n }, () => new Float64Array(n));   // th[i][j] = θ_ii,ij
  for (const y of Y) for (let i = 0; i < n; i++) {
    const a = y[i] * y[i] - S[i][i];
    for (let j = 0; j < n; j++) { const b = y[i] * y[j] - S[i][j]; pi[i][j] += b * b; th[i][j] += a * b; }
  }
  let piHat = 0, rho = 0, gam = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    pi[i][j] /= T; th[i][j] /= T; piHat += pi[i][j]; gam += (F[i][j] - S[i][j]) ** 2;
  }
  for (let i = 0; i < n; i++) rho += pi[i][i];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) rho += rbar / 2 * (sd[j] / sd[i] * th[i][j] + sd[i] / sd[j] * th[j][i]);
  const kappa = gam > 0 ? (piHat - rho) / gam : 0;
  const delta = Math.max(0, Math.min(1, kappa / T));
  const Sh = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => delta * F[i][j] + (1 - delta) * S[i][j]));
  return { S: Sh, delta, F, orneklem: S };
}
const matVec = (A, w) => Float64Array.from(A, satir => { let s = 0; for (let j = 0; j < w.length; j++) s += satir[j] * w[j]; return s; });
const nokta = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** CVaR_α: en kötü (1−α)·T kaybın ortalaması; kesirli sınırda son gözlem kısmi ağırlıkla (RU tanımıyla aynı). */
function cvar(kayiplar, alfa = 0.95) {
  const L = Float64Array.from(kayiplar).sort().reverse();
  const k = (1 - alfa) * L.length; const tam = Math.floor(k);
  let s = 0; for (let i = 0; i < tam; i++) s += L[i];
  if (k > tam && tam < L.length) s += (k - tam) * L[tam];
  return s / k;
}

// ═══ 2. KISIT KÜMESİ ═════════════════════════════════════════════════════════
function kutuSimpleksIzdusum(v, hi) {
  const n = v.length; let alt = -1e9, ust = 1e9;
  for (let i = 0; i < n; i++) { alt = Math.min(alt, v[i] - hi[i]); ust = Math.max(ust, v[i]); }
  alt -= 1; ust += 1;
  const top = (tau) => { let s = 0; for (let i = 0; i < n; i++) s += Math.min(hi[i], Math.max(0, v[i] - tau)); return s; };
  for (let k = 0; k < 200; k++) { const m = (alt + ust) / 2; if (top(m) > 1) alt = m; else ust = m; if (ust - alt < 1e-15) break; }
  const tau = (alt + ust) / 2;
  return Float64Array.from(v, (x, i) => Math.min(hi[i], Math.max(0, x - tau)));
}
function suDoldur(a, hi) {
  const n = a.length; let tavanToplam = 0; for (let i = 0; i < n; i++) if (a[i] > 0) tavanToplam += hi[i];
  if (tavanToplam < 1 - 1e-12) throw new Error('suDoldur: tavanların toplamı < 1');
  const top = (l) => { let s = 0; for (let i = 0; i < n; i++) s += a[i] > 0 ? Math.min(hi[i], l * a[i]) : 0; return s; };
  let alt = 0, ust = 1; while (top(ust) < 1) ust *= 2;
  for (let k = 0; k < 200; k++) { const m = (alt + ust) / 2; if (top(m) < 1) alt = m; else ust = m; }
  const w = Float64Array.from(a, (x, i) => (x > 0 ? Math.min(hi[i], ust * x) : 0));
  const s = w.reduce((p, q) => p + q, 0); return w.map(x => x / s);
}

// ═══ 3. İZDÜŞÜMLÜ GRADYAN (geri izlemeli, monoton) ═══════════════════════════
function igd(f, g, w0, proj, { iter = 3000, tol = 1e-11, L0 = 1 } = {}) {
  let x = proj(w0), fx = f(x), L = L0;
  for (let k = 0; k < iter; k++) {
    const gx = g(x); let z, fz, d2;
    for (let b = 0; b < 80; b++) {
      z = proj(Float64Array.from(x, (v, i) => v - gx[i] / L)); fz = f(z);
      let lin = 0; d2 = 0; for (let i = 0; i < x.length; i++) { const d = z[i] - x[i]; lin += gx[i] * d; d2 += d * d; }
      if (fz <= fx + lin + L / 2 * d2 + 1e-15) break; L *= 2;
    }
    const adim = Math.sqrt(d2); x = z; const once = fx; fx = fz; L = Math.max(L / 1.5, 1e-12);
    if (adim < tol || Math.abs(once - fx) < 1e-16 * Math.max(1, Math.abs(fx))) break;
  }
  return x;
}

// ═══ 4. YÖNTEMLER ════════════════════════════════════════════════════════════
const YONTEMLER = ['esit', 'tersVol', 'erc', 'minVar', 'cvar', 'maksSharpe'];
const YONTEM_ADI = { esit: 'Eşit ağırlık', tersVol: 'Ters-oynaklık', erc: 'Risk paritesi (ERC)', minVar: 'Min varyans (LW)', cvar: 'Min CVaR %95', maksSharpe: 'Maks Sharpe (büzülmeli)' };

function riskliAlt(X, nakit) {
  const idx = []; for (let j = 0; j < X[0].length; j++) if (j !== nakit) idx.push(j);
  return { idx, Xr: X.map(x => idx.map(j => x[j])) };
}
function genislet(n, idx, wr) { const w = new Float64Array(n); idx.forEach((j, k) => { w[j] = wr[k]; }); return w; }

function ercCCD(S, { iter = 10000, tol = 1e-13 } = {}) {
  const n = S.length, b = 1 / n; const y = Float64Array.from({ length: n }, (_, i) => 1 / Math.sqrt(S[i][i]));
  for (let k = 0; k < iter; k++) {
    let deg = 0;
    for (let i = 0; i < n; i++) {
      let c = 0; for (let j = 0; j < n; j++) if (j !== i) c += S[i][j] * y[j];
      const yeni = (-c + Math.sqrt(c * c + 4 * S[i][i] * b)) / (2 * S[i][i]);
      deg = Math.max(deg, Math.abs(yeni - y[i]) / y[i]); y[i] = yeni;
    }
    if (deg < tol) break;
  }
  const s = y.reduce((p, q) => p + q, 0); return y.map(v => v / s);
}
function ercSapma(S) {
  const n = S.length;
  const f = (w) => { const q = matVec(S, w), v = nokta(w, q); let s = 0; for (let i = 0; i < n; i++) s += (w[i] * q[i] / v - 1 / n) ** 2; return s; };
  const g = (w) => {
    const q = matVec(S, w), v = nokta(w, q), c = Float64Array.from(w, (x, i) => x * q[i]);
    const d = Float64Array.from(c, x => x / v - 1 / n); const dc = nokta(d, c);
    const dw = Float64Array.from(d, (x, i) => x * w[i]); const Sdw = matVec(S, dw);
    return Float64Array.from(w, (_, k) => 2 * (d[k] * q[k] / v + Sdw[k] / v - 2 * q[k] * dc / (v * v)));
  };
  return { f, g };
}

function agirlikHesapla(yontem, X, { hi, nakit = -1, lo = null, gruplar = null }) {
  // L2 genişletmesi: alt sınır ya da grup kısıtı varsa genel yol (bölüm 8). Yoksa aşağıdaki ESKİ yol birebir.
  if ((lo && lo.some(x => x > 0)) || (gruplar && gruplar.length)) return agirlikGenel(yontem, X, { hi, nakit, lo, gruplar });
  const n = X[0].length;
  const hiR = Float64Array.from(hi, (h, j) => (j === nakit ? 0 : h));
  if (yontem === 'esit') return { w: suDoldur(new Float64Array(n).fill(1), hi) };
  if (yontem === 'tersVol') {
    const S = kovaryans(X);
    return { w: suDoldur(Float64Array.from({ length: n }, (_, j) => (j === nakit || S[j][j] <= 0 ? 0 : 1 / Math.sqrt(S[j][j]))), hi) };
  }
  if (yontem === 'erc') {
    const { idx, Xr } = riskliAlt(X, nakit); const S = ledoitWolf(Xr).S; const h = idx.map(j => hi[j]);
    const w0 = ercCCD(S);
    if (w0.every((x, k) => x <= h[k] + 1e-12)) return { w: genislet(n, idx, w0) };
    const { f, g } = ercSapma(S);
    const wr = igd(f, g, w0, v => kutuSimpleksIzdusum(v, h), { iter: 5000, L0: 1 });
    return { w: genislet(n, idx, wr), not: 'tavan bağladı' };
  }
  if (yontem === 'minVar') {
    const { idx, Xr } = riskliAlt(X, nakit); const Sr = ledoitWolf(Xr).S;
    const S = Array.from({ length: n }, () => new Float64Array(n));
    idx.forEach((a, i) => idx.forEach((b, j) => { S[a][b] = Sr[i][j]; }));
    const f = w => nokta(w, matVec(S, w)), g = w => matVec(S, w).map(x => 2 * x);
    let L0 = 0; for (let i = 0; i < n; i++) L0 = Math.max(L0, 2 * S[i][i] * n);
    return { w: igd(f, g, suDoldur(new Float64Array(n).fill(1), hi), v => kutuSimpleksIzdusum(v, hi), { iter: 5000, L0: L0 || 1 }) };
  }
  if (yontem === 'cvar') return { w: minCVaRLP(X, hi) };
  if (yontem === 'maksSharpe') {
    const { idx, Xr } = riskliAlt(X, nakit); const S = ledoitWolf(Xr).S, h = idx.map(j => hi[j]);
    const mu = ortalama(Xr).map(x => 0.5 * x);
    // Uygun küme üzerinde max μ'w (açgözlü: en yüksek μ'den başlayarak tavana doldur). ≤ 0 → Sharpe ≤ 0 → min varyans.
    const greedy = new Float64Array(h.length); { let kalan = 1; for (const k of [...mu.keys()].sort((a, b) => mu[b] - mu[a])) { greedy[k] = Math.min(h[k], kalan); kalan -= greedy[k]; } }
    if (nokta(mu, greedy) <= 0) return { ...agirlikHesapla('minVar', X, { hi, nakit }), not: 'μ≤0 → minVar' };
    const f = w => -nokta(mu, w) / Math.sqrt(nokta(w, matVec(S, w)));
    const g = w => { const q = matVec(S, w), v = nokta(w, q), m = nokta(mu, w), s = Math.sqrt(v); return Float64Array.from(w, (_, k) => -(mu[k] / s - m * q[k] / (s * v))); };
    // Sharpe μ'w > 0 bölgesinde yarı-içbükey → yerel en iyi = genel en iyi. İki başlangıç (eşit, açgözlü); iyisi.
    const p = kutuSimpleksIzdusum(new Float64Array(h.length).fill(1 / h.length), h);
    let en = null;
    for (const w0 of [p, greedy]) { if (nokta(mu, w0) <= 0) continue; const w = igd(f, g, w0, v => kutuSimpleksIzdusum(v, h), { iter: 5000, L0: 1 }); if (!en || f(w) < f(en)) en = w; }
    return { w: genislet(n, idx, en) };
  }
  throw new Error('bilinmeyen yöntem: ' + yontem);
}


/**
 * Yoğun tablolu iki aşamalı simpleks (min c'x, Ax = b, x ≥ 0, b ≥ 0). taban: her satırın birim sütunu (başlangıç tabanı);
 * yapay: yapay değişkenlerin sütun indeksleri (1. aşamada en küçüklenir, sonra atılır). Dantzig kuralı; 50 dejenere adımdan
 * sonra Bland kuralı (döngü önleme).
 */
function simpleks(A, b, c, taban, yapay = []) {
  const m = A.length, n = c.length, E = 1e-11;
  const T = A.map((r, i) => { const o = new Float64Array(n + 1); o.set(r); o[n] = b[i]; return o; });
  const B = taban.slice();
  const pivot = (r, j) => {
    const R = T[r], p = R[j]; for (let k = 0; k <= n; k++) R[k] /= p;
    for (let i = 0; i < m; i++) { if (i === r) continue; const Ti = T[i], f = Ti[j]; if (f === 0) continue; for (let k = 0; k <= n; k++) Ti[k] -= f * R[k]; }
    B[r] = j;
  };
  const coz = (maliyet, yasak) => {
    let dejenere = 0;
    for (let it = 0; it < 50000; it++) {
      const cB = B.map(j => maliyet[j]);
      let giren = -1, enIyi = -E;
      for (let j = 0; j < n; j++) {
        if (yasak.has(j)) continue;
        let z = maliyet[j]; for (let i = 0; i < m; i++) if (cB[i]) z -= cB[i] * T[i][j];
        if (dejenere > 50) { if (z < -E) { giren = j; break; } } else if (z < enIyi) { enIyi = z; giren = j; }
      }
      if (giren < 0) return true;
      let r = -1, oran = Infinity;
      for (let i = 0; i < m; i++) { const a = T[i][giren]; if (a > E) { const q = T[i][n] / a; if (q < oran - 1e-14 || (Math.abs(q - oran) <= 1e-14 && B[i] < B[r])) { oran = q; r = i; } } }
      if (r < 0) throw new Error('simpleks: sınırsız');
      dejenere = oran < 1e-14 ? dejenere + 1 : 0;
      pivot(r, giren);
    }
    throw new Error('simpleks: yineleme sınırı');
  };
  const yasak = new Set();
  if (yapay.length) {
    const c1 = new Float64Array(n); for (const j of yapay) c1[j] = 1; coz(c1, yasak);
    for (const j of yapay) yasak.add(j);
    for (let i = 0; i < m; i++) if (yasak.has(B[i])) { let j = 0; while (j < n && (yasak.has(j) || Math.abs(T[i][j]) < E)) j++; if (j < n) pivot(i, j); }
  }
  coz(c, yasak);
  const x = new Float64Array(n); for (let i = 0; i < m; i++) x[B[i]] = T[i][n];
  return x;
}

/** Min CVaR_α (Rockafellar–Uryasev LP, tam çözüm): min t + Σu/((1−α)T), u_s ≥ −R_s·w − t, u ≥ 0, Σw = 1, 0 ≤ w ≤ hi. */
function minCVaRLP(X, hi, alfa = 0.95) {
  const Ts = X.length, n = X[0].length, k = (1 - alfa) * Ts;
  const N = 2 * n + 2 + 2 * Ts + 1, m = Ts + n + 1;
  const iTp = 2 * n, iTm = 2 * n + 1, iU = 2 * n + 2, iV = 2 * n + 2 + Ts, iA = N - 1;
  const A = Array.from({ length: m }, () => new Float64Array(N)), b = new Float64Array(m), taban = [];
  for (let s = 0; s < Ts; s++) { const R = A[s]; for (let i = 0; i < n; i++) R[i] = -X[s][i]; R[iTp] = -1; R[iTm] = 1; R[iU + s] = -1; R[iV + s] = 1; taban.push(iV + s); }
  for (let i = 0; i < n; i++) { A[Ts + i][i] = 1; A[Ts + i][n + i] = 1; b[Ts + i] = hi[i]; taban.push(n + i); }
  for (let i = 0; i < n; i++) A[Ts + n][i] = 1; A[Ts + n][iA] = 1; b[Ts + n] = 1; taban.push(iA);
  const c = new Float64Array(N); c[iTp] = 1; c[iTm] = -1; for (let s = 0; s < Ts; s++) c[iU + s] = 1 / k;
  const x = simpleks(A, b, c, taban, [iA]);
  const w = Float64Array.from(x.subarray(0, n), v => Math.max(0, v)); const t = w.reduce((p, q) => p + q, 0);
  return w.map(v => v / t);
}

/** Yumuşatılmış RU (izdüşümlü gradyan) — yalnız öz testte LP ile çapraz denetim için. */
function minCVaR(X, hi, alfa = 0.95) {
  const T = X.length, n = X[0].length, k = (1 - alfa) * T;
  const projW = v => { const w = kutuSimpleksIzdusum(v.subarray(0, n), hi); const o = new Float64Array(n + 1); o.set(w); o[n] = v[n]; return o; };
  const sp = x => (x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x)));
  const sig = x => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));
  const tam = w => cvar(X.map(x => -nokta(x, w)), alfa);
  let w = suDoldur(new Float64Array(n).fill(1), hi);
  const z0 = new Float64Array(n + 1); z0.set(w);
  { const L = X.map(x => -nokta(x, w)).sort((a, b) => b - a); z0[n] = L[Math.min(L.length - 1, Math.floor(k))]; }
  let z = z0, enW = w, enC = tam(w);
  for (const tau of [1e-3, 1e-4, 1e-5, 1e-6]) {
    const f = v => { let s = 0; for (const x of X) s += tau * sp((-nokta(x, v) - v[n]) / tau); return v[n] + s / k; };
    const g = v => {
      const o = new Float64Array(n + 1); let st = 0;
      for (const x of X) { const p = sig((-nokta(x, v) - v[n]) / tau); st += p; for (let i = 0; i < n; i++) o[i] -= p * x[i]; }
      for (let i = 0; i < n; i++) o[i] /= k; o[n] = 1 - st / k; return o;
    };
    z = igd(f, g, z, projW, { iter: 4000, L0: 1 / tau });
    const c = tam(z.subarray(0, n)); if (c < enC) { enC = c; enW = Float64Array.from(z.subarray(0, n)); }
  }
  return enW;
}

// ═══ 5. TAKVİM YARDIMCILARI ══════════════════════════════════════════════════
function ayEkle(t, k) { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1); }
function ayBaslari(takvim) { const o = []; for (let i = 0; i < takvim.length; i++) if (i === 0 || new Date(takvim[i]).getUTCMonth() !== new Date(takvim[i - 1]).getUTCMonth()) o.push(i); return o; }
const pazartesi = t => t - ((new Date(t).getUTCDay() + 6) % 7) * GUN;

/** [a, b) aralığındaki TAM haftaların (5 Pzt–Cum günü takvimde ve aralıkta) bileşik getirileri. */
function haftalikMatris(takvim, getiri, kollar, a, b) {
  const gruplar = new Map();
  for (let i = 0; i < takvim.length; i++) {
    const t = takvim[i]; if (t < a) continue; if (t >= b) break;
    const p = pazartesi(t); if (!gruplar.has(p)) gruplar.set(p, []); gruplar.get(p).push(i);
  }
  const X = [], haftalar = [];
  for (const [p, idx] of gruplar) {
    if (idx.length !== 5 || p < a || p + 4 * GUN >= b) continue;
    const satir = kollar.map(k => { const r = getiri[k]; let v = 1; for (const i of idx) v *= 1 + r[i]; return v - 1; });
    X.push(satir); haftalar.push(p);
  }
  return { X, haftalar };
}

// ═══ 6. WALK-FORWARD MOTORU ══════════════════════════════════════════════════
function walkForward({ takvim, getiri, kollar, yontem, tavan, oosBas, bitIdx = takvim.length - 1, pencereAy = 36,
  bant = 0.05, ceyrek = [0, 3, 6, 9], maliyet = 0.003, nakit = 'NAKIT_USD', sabit = null,
  taban = null, gruplar = null, uygunluk = 'pencere', maliyetFn = null, gunlukBant = false }) {
  const n = kollar.length;
  const R = kollar.map(k => getiri[k]);
  const basliklar = ayBaslari(takvim).filter(i => takvim[i] >= oosBas && i <= bitIdx);
  if (!basliklar.length) throw new Error('OOS ay başı yok');
  const d0 = basliklar[0];
  const hedefHesapla = (i) => {
    const M = Date.UTC(new Date(takvim[i]).getUTCFullYear(), new Date(takvim[i]).getUTCMonth(), 1);
    const a = ayEkle(M, -pencereAy);
    const uygun = [];
    for (let k = 0; k < n; k++) {
      let tamam = true;
      for (let j = 0; j < takvim.length && takvim[j] < M; j++) { if (takvim[j] < a) continue; if (!Number.isFinite(R[k][j])) { tamam = false; break; } }
      // Pencere takvimin başından önce başlıyorsa da uygun değil (36 ay yok).
      if (takvim[0] > a) tamam = false;
      // L2: uygunluk 'veri' → yalnız 'bundan sonra verisi var mı' (sabit ağırlık / kırpılmış dönem; pencere aranmaz)
      if (uygunluk === 'veri') { const j = Math.min(i + 1, bitIdx); tamam = Number.isFinite(R[k][j]); }
      if (tamam) uygun.push(k);
    }
    const w = new Float64Array(n); let not = null;
    if (sabit) {
      let s = 0; for (const k of uygun) s += sabit[kollar[k]] || 0;
      for (const k of uygun) w[k] = (sabit[kollar[k]] || 0) / (s || 1);
    } else {
      const uK = uygun.map(k => kollar[k]);
      const { X } = haftalikMatris(takvim, getiri, uK, a, M);
      const hi = Float64Array.from(uK, k => (tavan[k] != null ? tavan[k] : 0.6));
      const kisit = (taban || (gruplar && gruplar.length)) ? kisitEsle(uK, taban, gruplar) : null;
      const o = kisit ? agirlikKisitli(yontem, X, { hi, nakit: uK.indexOf(nakit), ...kisit }) : agirlikHesapla(yontem, X, { hi, nakit: uK.indexOf(nakit) });
      uygun.forEach((k, j) => { w[k] = o.w[j]; }); not = o.not || null;
    }
    return { M, w, uygun: uygun.map(k => kollar[k]), not };
  };
  // Ön hesap: önbellekte uygunluk taraması pahalı değil (ayda bir).
  const egri = [], ts = [], r = [], x = [];
  const aylar = [];
  let h = new Float64Array(n), V = 1, maliyetToplam = 0, devirToplam = 0;
  const agToplam = new Float64Array(n); let agGun = 0;
  let sonHedef = null;
  const basSet = new Set(basliklar);
  const bantIslemleri = [];
  for (let d = d0; d <= bitIdx; d++) {
    if (d > d0) {
      const wOnce = Float64Array.from(h, v => v / V); const xk = new Float64Array(n);
      let Vy = 0;
      for (let k = 0; k < n; k++) { const rk = h[k] ? R[k][d] : 0; if (h[k] && !Number.isFinite(rk)) throw new Error(`eldeki kolun getirisi yok: ${kollar[k]} ${new Date(takvim[d]).toISOString()}`); h[k] *= 1 + rk; xk[k] = wOnce[k] * rk; Vy += h[k]; }
      for (let k = 0; k < n; k++) agToplam[k] += wOnce[k]; agGun++;
      r.push(Vy / V - 1); ts.push(takvim[d]); x.push(xk); V = Vy;
    }
    if (basSet.has(d)) {
      const H = hedefHesapla(d); sonHedef = H;
      const onceki = Float64Array.from(h, v => v / V);
      let sapma = 0; for (let k = 0; k < n; k++) sapma = Math.max(sapma, Math.abs(onceki[k] - H.w[k]));
      const ilk = d === d0;
      const islem = ilk || ceyrek.includes(new Date(takvim[d]).getUTCMonth()) || sapma > bant;
      let c = 0, devir = 0;
      if (islem) {
        if (!ilk) {
          for (let k = 0; k < n; k++) devir += Math.abs(H.w[k] * V - h[k]);
          c = maliyetFn ? maliyetFn(Float64Array.from(h, (v, k) => H.w[k] * V - v), V) : maliyet * devir;
        }
        // Maliyet sonrası tutar: V' = V − c (devir V'ye göre küçük fark — birinci dereceden yaklaşım, öz testte sınırı yazılı)
        const Vs = V - c; h = Float64Array.from(H.w, w => w * Vs);
        maliyetToplam += c / V; devirToplam += devir / V; V = Vs;
        if (r.length) r[r.length - 1] = (1 + r[r.length - 1]) * (Vs / (Vs + c)) - 1;
      }
      aylar.push({ ay: new Date(H.M).toISOString().slice(0, 7), hedef: Object.fromEntries(kollar.map((k, j) => [k, H.w[j]])),
        onceki: Object.fromEntries(kollar.map((k, j) => [k, onceki[j]])), islem, maliyet: islem ? c / (V + c) : 0, sapma, uygun: H.uygun, not: H.not });
    } else if (gunlukBant && sonHedef && d > d0 && Number.isFinite(bant)) {
      // Günlük bant denetimi: son hedefe göre sapma > bant → bu kapanışta tam dengele (maliyet ay başı işlemiyle aynı kural).
      let sapma = 0; for (let k = 0; k < n; k++) sapma = Math.max(sapma, Math.abs(h[k] / V - sonHedef.w[k]));
      if (sapma > bant) {
        let devir = 0; for (let k = 0; k < n; k++) devir += Math.abs(sonHedef.w[k] * V - h[k]);
        const c = maliyetFn ? maliyetFn(Float64Array.from(h, (v, k) => sonHedef.w[k] * V - v), V) : maliyet * devir;
        const Vs = V - c; h = Float64Array.from(sonHedef.w, w => w * Vs);
        maliyetToplam += c / V; devirToplam += devir / V; V = Vs;
        if (r.length) r[r.length - 1] = (1 + r[r.length - 1]) * (Vs / (Vs + c)) - 1;
        bantIslemleri.push({ time: takvim[d], sapma, maliyet: c / (V + c) });
      }
    }
    egri.push({ time: takvim[d], oz: V });
  }
  // Egri ilk gün (yerleşim kapanışı) 1; günlük r egriyle tutarlı (maliyet işlem gününün getirisine işlenmiş).
  return {
    egri, gunluk: { ts, r, x }, aylar, maliyetToplam, devirToplam, kollar, ...(gunlukBant ? { bantIslemleri } : {}),
    ortAgirlik: Object.fromEntries(kollar.map((k, j) => [k, agGun ? agToplam[j] / agGun : 0])),
    sonHedef: sonHedef ? { ay: new Date(sonHedef.M).toISOString().slice(0, 7), w: Object.fromEntries(kollar.map((k, j) => [k, sonHedef.w[j]])), uygun: sonHedef.uygun } : null,
  };
}

// ═══ 7. ÖLÇÜLER ══════════════════════════════════════════════════════════════
/** egri [{time, oz}] → dilim [bas, bit): dilimden önceki son kapanıştan başlar (nasdaq.metrik ile aynı). */
function dilim(egri, bas = -Infinity, bit = Infinity) {
  let i0 = egri.findIndex(x => x.time >= bas); if (i0 < 0) return []; if (i0 > 0) i0--;
  return egri.slice(i0).filter(x => x.time < bit);
}
function olcu(egri, { bas = -Infinity, bit = Infinity, yillik = 261 } = {}) {
  const e = dilim(egri, bas, bit); if (e.length < 20) return null;
  const r = e.slice(1).map((x, i) => x.oz / e[i].oz - 1);
  const o = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - o) ** 2, 0) / (r.length - 1));
  const asagi = Math.sqrt(r.reduce((a, b) => a + Math.min(b, 0) ** 2, 0) / r.length);
  let tepe = e[0].oz, dd = 0, ddT = null;
  for (const x of e) { if (x.oz > tepe) tepe = x.oz; const d = 1 - x.oz / tepe; if (d > dd) { dd = d; ddT = x.time; } }
  const yil = (e[e.length - 1].time - e[0].time) / (365.25 * GUN);
  const top = e[e.length - 1].oz / e[0].oz - 1;
  // Yıllar ve aylar (dönem sonu seviyelerinden)
  const donem = (fmt) => { const m = new Map(); let onceki = e[0].oz; let anahtar0 = null;
    for (const x of e.slice(1)) { const k = fmt(x.time); if (!m.has(k)) m.set(k, { b: onceki, gun: 0 }); const v = m.get(k); v.s = x.oz; v.gun++; onceki = x.oz; anahtar0 = anahtar0 || k; }
    return [...m].map(([k, v]) => ({ k, g: v.s / v.b - 1, gun: v.gun })); };
  const yillar = donem(t => new Date(t).getUTCFullYear()).map(v => ({ yil: v.k, getiri: v.g, gun: v.gun, kismi: v.gun < 250 }));
  const aylar = donem(t => new Date(t).toISOString().slice(0, 7));
  const tamYil = yillar.filter(y => !y.kismi);
  const enKotuYil = (tamYil.length ? tamYil : yillar).reduce((a, b) => (b.getiri < a.getiri ? b : a));
  const enKotuAy = aylar.reduce((a, b) => (b.g < a.g ? b : a));
  return {
    cagr: top > -1 ? Math.pow(1 + top, 1 / yil) - 1 : -1, maxDD: dd, maxDDTarih: ddT ? new Date(ddT).toISOString().slice(0, 10) : null,
    sharpe: sd > 0 ? o / sd * Math.sqrt(yillik) : 0, sortino: asagi > 0 ? o / asagi * Math.sqrt(yillik) : 0, vol: sd * Math.sqrt(yillik),
    enKotuYil: { yil: enKotuYil.yil, getiri: enKotuYil.getiri, kismi: enKotuYil.kismi }, enKotuAy: { ay: enKotuAy.k, getiri: enKotuAy.g },
    cvarGun: -cvar(r.map(v => -v), 0.95), cvarAy: -cvar(aylar.map(a => -a.g), 0.95),
    yillar, bas: new Date(e[0].time).toISOString().slice(0, 10), bit: new Date(e[e.length - 1].time).toISOString().slice(0, 10), gun: r.length, yilSayisi: yil,
  };
}
function riskKatkisi(sonuc, bas = -Infinity, bit = Infinity) {
  const { ts, x } = sonuc.gunluk, n = sonuc.kollar.length;
  const hafta = new Map();
  for (let i = 0; i < ts.length; i++) { if (ts[i] < bas || ts[i] >= bit) continue; const p = pazartesi(ts[i]); if (!hafta.has(p)) hafta.set(p, new Float64Array(n)); const h = hafta.get(p); for (let k = 0; k < n; k++) h[k] += x[i][k]; }
  const H = [...hafta.values()]; if (H.length < 10) return null;
  const P = H.map(h => h.reduce((a, b) => a + b, 0));
  const mp = P.reduce((a, b) => a + b, 0) / P.length; const vp = P.reduce((a, b) => a + (b - mp) ** 2, 0);
  const o = {};
  for (let k = 0; k < n; k++) { const mk = H.reduce((a, h) => a + h[k], 0) / H.length; let c = 0; H.forEach((h, i) => { c += (h[k] - mk) * (P[i] - mp); }); o[sonuc.kollar[k]] = vp > 0 ? c / vp : 0; }
  return o;
}
function bootstrapAralik(r, { b = 20, N = 2000, tohum = 7, yillik = 261 } = {}) {
  const O = require('../risk/olcum');
  const k = O.duraganBootstrap(r, { b, N, H: r.length, tohum, olc: (yol) => {
    let v = 1, tepe = 1, dd = 0; for (const x of yol) { v *= 1 + x; if (v > tepe) tepe = v; dd = Math.max(dd, 1 - v / tepe); }
    return [Math.pow(v, yillik / yol.length) - 1, dd]; } });
  const yuzde = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const c = k.map(z => z[0]), d = k.map(z => z[1]);
  return { cagr: [yuzde(c, 0.05), yuzde(c, 0.5), yuzde(c, 0.95)], maxDD: [yuzde(d, 0.05), yuzde(d, 0.5), yuzde(d, 0.95)], N, b };
}

// ═══ 8. GENEL KISITLAR (L2 — portföy karar motoru; lib/portfoy/motor.js) ═══════
// Kol başına alt sınır (lo) ve GRUP kısıtları: gruplar = [{ idx: [kol indeksleri], max?, min? }] (Σ_{i∈g} w_i ≤ max, ≥ min).
// Gruplar örtüşebilir. Alt sınır/grup yoksa yukarıdaki eski yollar BİREBİR çalışır (geriye uyum; 47 eski test).
//   kutuSimpleksTam(v, lo, hi)          → argmin ||w − v||², Σw = 1, lo ≤ w ≤ hi (kırılma noktaları sıralanarak TAM)
//   kisitliIzdusum(v, {lo, hi, gruplar}) → kutu + simpleks + grup yarı-uzaylarının kesişimine izdüşüm (Dykstra; son adım
//                                          kutu-simpleks → Σw = 1 ve kutu TAM, grup ihlali ≤ 1e-10)
//   kisitUygun(w, k, tol)               → ihlal yoksa true
//   kisitLP(k, { X?, mu? })              → uygun nokta (X verilirse min CVaR %95, mu verilirse max μ'w) | null (uygun küme boş)
//   agirlikKisitli(yontem, X, k)        → agirlikHesapla + gevşetme zinciri (uygun küme boşsa): (1) alt sınırlar düşer,
//                                          (2) nakit kolu tavanı 1 (kalan nakitte), (3) tüm kısıtlar düşer; not alanında yazar.
//   kisitEsle(kollar, taban, gruplar)   → walkForward içi: {kol: lo} ve [{kollar, max, min}] → indeksli { lo, gruplar }
// Yöntemlerin genel yolu: eşit / ters-vol = eski hedef (su doldurma) → genel izdüşüm (en yakın uygun nokta); min varyans =
// izdüşümlü gradyan (genel izdüşüm); CVaR = LP'ye grup satırları; ERC ve maks Sharpe yalnız riskli kollarda (nakit dışarıda,
// nakit alt sınırı bu iki yöntemde uygulanmaz — not), maks Sharpe başlangıcı LP ile max μ'w.
function kutuSimpleksTam(v, lo, hi) {
  const n = v.length;
  const top = (tau) => { let s = 0; for (let i = 0; i < n; i++) s += Math.min(hi[i], Math.max(lo[i], v[i] - tau)); return s; };
  const b = []; for (let i = 0; i < n; i++) b.push(v[i] - hi[i], v[i] - lo[i]);
  b.sort((p, q) => p - q);
  // top(τ) azalan, parça parça doğrusal. top(b[0]) = Σhi ≥ 1 ≥ Σlo = top(b[son]) (uygun kutu varsayımı).
  let tau;
  if (top(b[0]) <= 1) tau = b[0];
  else if (top(b[b.length - 1]) >= 1) tau = b[b.length - 1];
  else {
    let a = 0, z = b.length - 1;
    while (z - a > 1) { const m = (a + z) >> 1; if (top(b[m]) > 1) a = m; else z = m; }
    const fa = top(b[a]), fz = top(b[z]);
    tau = fa === fz ? b[a] : b[a] + (fa - 1) * (b[z] - b[a]) / (fa - fz);
  }
  return Float64Array.from(v, (x, i) => Math.min(hi[i], Math.max(lo[i], x - tau)));
}
function grupToplam(w, idx) { let s = 0; for (const i of idx) s += w[i]; return s; }
/** TEK grup yarı-uzayı + kutu + simpleks: TAM izdüşüm (L4 hızlandırma). KKT: w_i = clip(v_i − τ − yon·λ·a_i), λ ≥ 0; sabit λ için τ
 *  kutuSimpleksTam'dan gelir, grup toplamı λ'da monoton → λ ikiye bölmeyle. Dykstra (2000 tur × her igd adımı) tek grup
 *  "TL ≤ %15" ile risk paritesini 150 ms'den 12 sn'ye çıkarıyordu; sonuç aynı nokta (scripts/portfoy-motor-selftest.js, 300 vaka). */
function tekGrupIzdusum(v, lo, hi, h) {
  const n = v.length, a = new Uint8Array(n); for (const i of h.idx) a[i] = 1;
  const w = lam => kutuSimpleksTam(Float64Array.from(v, (x, i) => x - h.yon * lam * a[i]), lo, hi);
  const ihlal = x => h.yon * (grupToplam(x, h.idx) - h.sinir);   // > 0 → kısıt ihlal
  const w0 = w(0);
  if (ihlal(w0) <= 0) return w0;
  let ust = 1, wu = w(ust);
  for (let k = 0; k < 80 && ihlal(wu) > 0; k++) { ust *= 2; wu = w(ust); }
  let alt = 0;
  for (let k = 0; k < 200 && ust - alt > 1e-15 * Math.max(1, ust); k++) { const m = (alt + ust) / 2; if (ihlal(w(m)) > 0) alt = m; else ust = m; }
  return w(ust);
}
let dykstraZorla = false;   // öz test: aynı vakayı Dykstra ile çözüp tam yolla kıyaslamak için (_dykstraZorla)
function kisitliIzdusum(v, { lo, hi, gruplar = [] }, { dongu = 2000, tol = 1e-12 } = {}) {
  const n = v.length; lo = lo || new Float64Array(n);
  const yari = [];
  for (const g of gruplar || []) {
    if (g.max != null && g.max < 1 - 1e-15) yari.push({ idx: g.idx, sinir: g.max, yon: 1 });
    if (g.min != null && g.min > 1e-15) yari.push({ idx: g.idx, sinir: g.min, yon: -1 });
  }
  if (!yari.length) return kutuSimpleksTam(v, lo, hi);
  if (yari.length === 1 && !dykstraZorla) return tekGrupIzdusum(v, lo, hi, yari[0]);
  // Kümeler: her grup kısıtı bir yarı-uzay; en sonda kutu-simpleks. Dykstra düzeltme vektörleri p_j.
  let x = Float64Array.from(v);
  const p = yari.map(() => new Float64Array(n)), p0 = new Float64Array(n);
  for (let d = 0; d < dongu; d++) {
    let deg = 0;
    for (let j = 0; j < yari.length; j++) {
      const h = yari[j];
      const y = Float64Array.from(x, (xi, i) => xi + p[j][i]);
      const s = grupToplam(y, h.idx);
      const z = Float64Array.from(y);
      if (h.yon * (s - h.sinir) > 0) { const k = (s - h.sinir) / h.idx.length; for (const i of h.idx) z[i] -= k; }
      for (let i = 0; i < n; i++) { p[j][i] = y[i] - z[i]; deg = Math.max(deg, Math.abs(z[i] - x[i])); }
      x = z;
    }
    const y = Float64Array.from(x, (xi, i) => xi + p0[i]);
    const z = kutuSimpleksTam(y, lo, hi);
    for (let i = 0; i < n; i++) { p0[i] = y[i] - z[i]; deg = Math.max(deg, Math.abs(z[i] - x[i])); }
    x = z;
    if (deg < tol) break;
  }
  return x;
}
function kisitUygun(w, { lo, hi, gruplar = [] }, tol = 1e-7) {
  let s = 0;
  for (let i = 0; i < w.length; i++) { s += w[i]; if (w[i] < (lo ? lo[i] : 0) - tol || w[i] > hi[i] + tol) return false; }
  if (Math.abs(s - 1) > tol) return false;
  for (const g of gruplar || []) { const t = grupToplam(w, g.idx); if ((g.max != null && t > g.max + tol) || (g.min != null && t < g.min - tol)) return false; }
  return true;
}
/** Genel LP: değişken y = w − lo ≥ 0. Satırlar: kutu (y + s = hi − lo), toplam (Σy + a = 1 − Σlo), grup üst (Σy + s = max − Σlo),
 *  grup alt (Σy − e + a = min − Σlo), CVaR senaryoları (X verilirse; sağ taraf negatifse satır −1 ile çarpılır, taban u_s olur). */
function kisitLP({ lo, hi, gruplar = [] }, { X = null, mu = null, alfa = 0.95 } = {}) {
  const n = hi.length; lo = lo || new Float64Array(n);
  const Lsum = lo.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) if (hi[i] < lo[i] - 1e-12) return null;
  if (Lsum > 1 + 1e-12) return null;
  const ust = [], alt = [];
  for (const g of gruplar || []) {
    const gl = grupToplam(lo, g.idx);
    if (g.max != null) { if (g.max < gl - 1e-12) return null; ust.push({ idx: g.idx, b: Math.max(0, g.max - gl) }); }
    if (g.min != null && g.min - gl > 1e-12) alt.push({ idx: g.idx, b: g.min - gl });
  }
  const Ts = X ? X.length : 0;
  // Sütunlar: y(n) | kutu artığı(n) | grup üst artığı | grup alt fazlası | yapay (toplam + grup alt) | CVaR: t+, t−, u(Ts), v(Ts)
  const iS = n, iGu = 2 * n, iGa = iGu + ust.length, iA = iGa + alt.length, nA = 1 + alt.length, iT = iA + nA, iU = iT + 2, iV = iU + Ts;
  const N = X ? iV + Ts : iA + nA;
  const A = [], b = [], taban = [], yapay = [];
  const satir = () => new Float64Array(N);
  for (let i = 0; i < n; i++) { const r = satir(); r[i] = 1; r[iS + i] = 1; A.push(r); b.push(hi[i] - lo[i]); taban.push(iS + i); }
  { const r = satir(); for (let i = 0; i < n; i++) r[i] = 1; r[iA] = 1; A.push(r); b.push(1 - Lsum); taban.push(iA); yapay.push(iA); }
  ust.forEach((g, j) => { const r = satir(); for (const i of g.idx) r[i] = 1; r[iGu + j] = 1; A.push(r); b.push(g.b); taban.push(iGu + j); });
  alt.forEach((g, j) => { const r = satir(); for (const i of g.idx) r[i] = 1; r[iGa + j] = -1; r[iA + 1 + j] = 1; A.push(r); b.push(g.b); taban.push(iA + 1 + j); yapay.push(iA + 1 + j); });
  const c = new Float64Array(N);
  if (X) {
    const k = (1 - alfa) * Ts;
    for (let s = 0; s < Ts; s++) {
      const r = satir(); let bs = 0; for (let i = 0; i < n; i++) { r[i] = -X[s][i]; bs += X[s][i] * lo[i]; }
      r[iT] = -1; r[iT + 1] = 1; r[iU + s] = -1; r[iV + s] = 1;
      if (bs >= 0) { A.push(r); b.push(bs); taban.push(iV + s); } else { A.push(r.map(x => -x)); b.push(-bs); taban.push(iU + s); }
    }
    c[iT] = 1; c[iT + 1] = -1; for (let s = 0; s < Ts; s++) c[iU + s] = 1 / k;
  } else if (mu) for (let i = 0; i < n; i++) c[i] = -mu[i];
  let x;
  try { x = simpleks(A, b, c, taban, yapay); } catch (e) { return null; }
  const w = Float64Array.from({ length: n }, (_, i) => lo[i] + Math.max(0, x[i]));
  return kisitUygun(w, { lo, hi, gruplar }, 1e-7) ? w : null;
}
function altKisit(k, idx) {
  const yeni = new Map(idx.map((j, a) => [j, a]));
  return { lo: Float64Array.from(idx, j => (k.lo ? k.lo[j] : 0)), hi: Float64Array.from(idx, j => k.hi[j]),
    gruplar: (k.gruplar || []).map(g => ({ ...g, idx: g.idx.filter(j => yeni.has(j)).map(j => yeni.get(j)) })).filter(g => g.idx.length) };
}
function agirlikGenel(yontem, X, { hi, nakit = -1, lo = null, gruplar = [] }) {
  const n = X[0].length; lo = lo ? Float64Array.from(lo) : new Float64Array(n); hi = Float64Array.from(hi);
  const K = { lo, hi, gruplar: gruplar || [] };
  if (!kisitLP(K)) { const e = new Error('kısıtlar sağlanamıyor (uygun ağırlık yok)'); e.kod = 'UYGUN_YOK'; throw e; }
  const proj = v => kisitliIzdusum(v, K);
  if (yontem === 'esit' || yontem === 'tersVol') {
    let a;
    if (yontem === 'esit') a = new Float64Array(n).fill(1);
    else { const S = kovaryans(X); a = Float64Array.from({ length: n }, (_, j) => (j === nakit || S[j][j] <= 0 ? 0 : 1 / Math.sqrt(S[j][j]))); }
    let w0; try { w0 = suDoldur(a, hi); } catch (e) { const t = a.reduce((p, q) => p + q, 0) || 1; w0 = a.map(x => x / t); }
    return { w: proj(w0) };
  }
  if (yontem === 'minVar') {
    const riskli = []; for (let j = 0; j < n; j++) if (j !== nakit) riskli.push(j);
    const Sr = ledoitWolf(X.map(x => riskli.map(j => x[j]))).S;
    const S = Array.from({ length: n }, () => new Float64Array(n));
    riskli.forEach((a, i) => riskli.forEach((c, j) => { S[a][c] = Sr[i][j]; }));
    const f = w => nokta(w, matVec(S, w)), g = w => matVec(S, w).map(x => 2 * x);
    let L0 = 0; for (let i = 0; i < n; i++) L0 = Math.max(L0, 2 * S[i][i] * n);
    return { w: igd(f, g, proj(new Float64Array(n).fill(1 / n)), proj, { iter: 3000, L0: L0 || 1 }) };
  }
  if (yontem === 'cvar') { const w = kisitLP(K, { X }); if (!w) throw new Error('CVaR LP çözülemedi'); return { w }; }
  if (yontem === 'erc' || yontem === 'maksSharpe') {
    const idx = []; for (let j = 0; j < n; j++) if (j !== nakit) idx.push(j);
    const KR = altKisit(K, idx);
    const notlar = []; if (nakit >= 0 && lo[nakit] > 0) notlar.push('nakit alt sınırı bu yöntemde uygulanmadı');
    if (!kisitLP(KR)) return { ...agirlikGenel('minVar', X, { hi, nakit, lo, gruplar }), not: 'riskli kollarla kısıt sağlanamadı → minVar' };
    const Xr = X.map(x => idx.map(j => x[j])); const S = ledoitWolf(Xr).S; const projR = v => kisitliIzdusum(v, KR);
    if (yontem === 'erc') {
      const w0 = ercCCD(S);
      if (kisitUygun(w0, KR, 1e-12)) return { w: genislet(n, idx, w0), not: notlar.join('; ') || undefined };
      const { f, g } = ercSapma(S);
      const wr = igd(f, g, projR(w0), projR, { iter: 3000, L0: 1 });
      return { w: genislet(n, idx, wr), not: ['kısıt bağladı', ...notlar].join('; ') };
    }
    const mu = ortalama(Xr).map(x => 0.5 * x);
    const lpBas = kisitLP(KR, { mu });
    if (!lpBas || nokta(mu, lpBas) <= 0) return { ...agirlikGenel('minVar', X, { hi, nakit, lo, gruplar }), not: 'μ≤0 → minVar' };
    const f = w => -nokta(mu, w) / Math.sqrt(nokta(w, matVec(S, w)));
    const g = w => { const q = matVec(S, w), v = nokta(w, q), m = nokta(mu, w), s = Math.sqrt(v); return Float64Array.from(w, (_, k) => -(mu[k] / s - m * q[k] / (s * v))); };
    let en = null;
    for (const w0 of [projR(new Float64Array(idx.length).fill(1 / idx.length)), lpBas]) { if (nokta(mu, w0) <= 0) continue; const w = igd(f, g, w0, projR, { iter: 3000, L0: 1 }); if (!en || f(w) < f(en)) en = w; }
    return { w: genislet(n, idx, en), not: notlar.join('; ') || undefined };
  }
  throw new Error('bilinmeyen yöntem: ' + yontem);
}
function agirlikKisitli(yontem, X, { hi, nakit = -1, lo = null, gruplar = [] }) {
  const n = hi.length;
  const dene = (k, not) => {
    try { const o = agirlikHesapla(yontem, X, { nakit, ...k }); return { ...o, not: [not, o.not].filter(Boolean).join('; ') || null }; }
    catch (e) { if (e.kod === 'UYGUN_YOK' || /tavanların toplamı/.test(e.message)) return null; throw e; }
  };
  let o = dene({ hi, lo, gruplar }, null); if (o) return o;
  const gMax = (gruplar || []).filter(g => g.max != null).map(g => ({ idx: g.idx, max: g.max }));
  o = dene({ hi, lo: null, gruplar: gMax }, 'alt sınırlar gevşetildi (uygun varlık yetersiz)'); if (o) return o;
  if (nakit >= 0) {
    const h2 = Float64Array.from(hi); h2[nakit] = 1;
    o = dene({ hi: h2, lo: null, gruplar: gMax.filter(g => !g.idx.includes(nakit)) }, 'kısıtlar tutmadı → kalan nakitte'); if (o) return o;
  }
  return dene({ hi: new Float64Array(n).fill(1), lo: null, gruplar: [] }, 'kısıtlar uygulanamadı (uygun varlık yetersiz) — kısıtsız');
}
function kisitEsle(kollar, taban, gruplar) {
  const ix = new Map(kollar.map((k, i) => [k, i]));
  const lo = taban ? Float64Array.from(kollar, k => taban[k] || 0) : null;
  const g = (gruplar || []).map(x => ({ ad: x.ad, idx: x.kollar.filter(k => ix.has(k)).map(k => ix.get(k)), max: x.max, min: x.min })).filter(x => x.idx.length);
  return { lo, gruplar: g };
}

module.exports = {
  GUN, YONTEMLER, YONTEM_ADI,
  kovaryans, ledoitWolf, cvar, kutuSimpleksIzdusum, suDoldur, igd, ercCCD, ercSapma, agirlikHesapla, minCVaR, minCVaRLP, simpleks,
  ayEkle, ayBaslari, pazartesi, haftalikMatris, walkForward, dilim, olcu, riskKatkisi, bootstrapAralik, matVec, nokta,
  kutuSimpleksTam, kisitliIzdusum, _dykstraZorla: x => { dykstraZorla = !!x; }, kisitUygun, kisitLP, agirlikGenel, agirlikKisitli, kisitEsle,
};
