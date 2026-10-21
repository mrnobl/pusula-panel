/**
 * 69.5 İSTATİSTİK — araştırma disiplini ve canlı izleme için küçük, bağımlılıksız ölçüler.
 *
 *   psr(r, sr0)                 Probabilistic Sharpe (Bailey & López de Prado 2012): gerçek Sharpe > sr0 olasılığı;
 *                               çarpıklık ve basıklık düzeltmeli. r: dönem getirileri (günlük), sr0: aynı dönem biriminde.
 *   minTRL(r, sr0, guven)       Minimum Track Record Length: PSR ≥ guven için gereken gözlem sayısı (gün).
 *   beklenenMaxSharpe(N, v)     N bağımsız denemenin en iyisinin şansla beklenen Sharpe'ı (DSR eşiği; v = denemelerin Sharpe varyansı).
 *   dsr(r, srListe, N)          Deflated Sharpe — lib/research/nasdaq.js ile AYNI formül (oradan alınır, burada çoğaltılmaz).
 *   pbo(M, { S })               Probability of Backtest Overfitting, CSCV (Bailey, Borwein, López de Prado, Zhu 2015).
 *                               M: T satır × N aday getiri matrisi. S eşit bloğa bölünür; her C(S, S/2) bölmede içeride en iyi
 *                               adayın dışarıdaki göreli sırası ölçülür; PBO = dışarıda medyanın altında kalma oranı.
 *   cusum(x, { hedef, k, h })   İki yönlü Page CUSUM: ortalamadan kalıcı küçük kaymayı erken yakalar. Alarm: S⁺ ya da S⁻ > h.
 *
 * Kullanım: scripts/istatistik.js (komut satırı), lib/ozDenetim.js 'sapma' denetimi (canlı ↔ gölge CUSUM).
 */
const { dsr } = require('./research/nasdaq');

const ort = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function anlar(r) {
  const T = r.length, o = ort(r);
  const s = Math.sqrt(r.reduce((a, b) => a + (b - o) ** 2, 0) / (T - 1));
  const sk = s > 0 ? r.reduce((a, b) => a + ((b - o) / s) ** 3, 0) / T : 0;
  const ku = s > 0 ? r.reduce((a, b) => a + ((b - o) / s) ** 4, 0) / T : 3;
  return { T, o, s, sr: s > 0 ? o / s : 0, sk, ku };
}

// Standart normal: dağılım ve ters (Acklam). nasdaq.js'teki ile aynı yaklaşımlar.
function ncdf(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)), y = 1 - 0.3989423 * Math.exp(-x * x / 2) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x >= 0 ? y : 1 - y; }
function ndtri(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = Math.min(p, 1 - p);
  let x;
  if (q > 0.02425) { const u = q - 0.5, r = u * u; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * u / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); return p > 0.5 ? -x : x; }
  const u = Math.sqrt(-2 * Math.log(q));
  x = (((((c[0] * u + c[1]) * u + c[2]) * u + c[3]) * u + c[4]) * u + c[5]) / ((((d[0] * u + d[1]) * u + d[2]) * u + d[3]) * u + 1);
  return p < 0.5 ? x : -x;
}

/** PSR: P(gerçek SR > sr0). */
function psr(r, sr0 = 0) {
  if (!Array.isArray(r) || r.length < 3) return null;
  const { T, sr, sk, ku } = anlar(r);
  const pay = 1 - sk * sr + (ku - 1) / 4 * sr * sr;
  if (!(pay > 0)) return null;
  return ncdf((sr - sr0) * Math.sqrt(T - 1) / Math.sqrt(pay));
}

/** MinTRL: PSR(sr0) ≥ guven için gereken gözlem sayısı. Sharpe ≤ sr0 ise Infinity. */
function minTRL(r, sr0 = 0, guven = 0.95) {
  if (!Array.isArray(r) || r.length < 3) return null;
  const { sr, sk, ku } = anlar(r);
  if (!(sr > sr0)) return Infinity;
  const z = ndtri(guven);
  return 1 + (1 - sk * sr + (ku - 1) / 4 * sr * sr) * (z / (sr - sr0)) ** 2;
}

/** N denemenin en iyisinin şansla beklenen Sharpe'ı (yanlış keşif eşiği). v: denemelerin Sharpe varyansı. */
function beklenenMaxSharpe(N, v) {
  if (!(N >= 2) || !(v >= 0)) return null;
  const g = 0.5772156649;
  return Math.sqrt(v) * ((1 - g) * ndtri(1 - 1 / N) + g * ndtri(1 - 1 / (N * Math.E)));
}

function kombinasyonlar(n, k) {
  const out = [], yol = [];
  (function git(i) { if (yol.length === k) { out.push(yol.slice()); return; } for (let j = i; j < n; j++) { yol.push(j); git(j + 1); yol.pop(); } })(0);
  return out;
}

/**
 * PBO (CSCV). @param M T×N matris (satır: dönem, sütun: aday). @param S blok sayısı (çift; C(S,S/2) bölme).
 * @param olc blok getirilerinden başarım ölçüsü (varsayılan Sharpe).
 * @returns {{ pbo, bolme, logitler, medyanLogit }} | null
 */
function pbo(M, { S = 16, olc = null } = {}) {
  if (!Array.isArray(M) || M.length < S * 2 || !Array.isArray(M[0]) || M[0].length < 2 || S % 2) return null;
  const T = M.length, N = M[0].length, boy = Math.floor(T / S);
  const olcum = olc || ((satirlar, j) => { const r = satirlar.map(x => x[j]); const a = anlar(r); return a.sr; });
  const bloklar = Array.from({ length: S }, (_, i) => M.slice(i * boy, (i + 1) * boy));
  const logitler = [];
  for (const ic of kombinasyonlar(S, S / 2)) {
    const icSet = new Set(ic);
    const icS = ic.flatMap(i => bloklar[i]);
    const disS = bloklar.flatMap((b, i) => (icSet.has(i) ? [] : b));
    const icO = Array.from({ length: N }, (_, j) => olcum(icS, j));
    const disO = Array.from({ length: N }, (_, j) => olcum(disS, j));
    let en = 0; for (let j = 1; j < N; j++) if (icO[j] > icO[en]) en = j;
    const sira = disO.filter(x => x < disO[en]).length + 1;          // 1 = en kötü … N = en iyi
    const w = sira / (N + 1);
    logitler.push(Math.log(w / (1 - w)));
  }
  const sirali = logitler.slice().sort((a, b) => a - b);
  return { pbo: logitler.filter(l => l <= 0).length / logitler.length, bolme: logitler.length, medyanLogit: sirali[Math.floor(sirali.length / 2)], logitler };
}

/**
 * İki yönlü Page CUSUM. x: gözlemler; hedef: beklenen ortalama; k: tolerans (gürültü payı); h: alarm eşiği.
 * @returns {{ ust, alt, alarm: 'ust'|'alt'|null, alarmIndeks, seri: [{ ust, alt }] }}
 */
function cusum(x, { hedef = 0, k = 0, h = Infinity } = {}) {
  let ust = 0, alt = 0, alarm = null, alarmIndeks = null;
  const seri = [];
  x.forEach((v, i) => {
    if (!Number.isFinite(v)) { seri.push({ ust, alt }); return; }
    ust = Math.max(0, ust + (v - hedef) - k);
    alt = Math.max(0, alt - (v - hedef) - k);
    if (!alarm && (ust > h || alt > h)) { alarm = ust > h ? 'ust' : 'alt'; alarmIndeks = i; }
    seri.push({ ust, alt });
  });
  return { ust, alt, alarm, alarmIndeks, seri };
}

module.exports = { psr, minTRL, beklenenMaxSharpe, dsr, pbo, cusum, anlar, ncdf, ndtri, kombinasyonlar };
