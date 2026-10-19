/**
 * GÜNLÜK SEVİYELER — önceki UTC gününün VWAP'ı ve hacim profili POC'u.
 * PLAN-SEVIYE-KOMBO.md. Nedensel: bar i için d−1 gününün seviyesi verilir
 * (d = bar i'nin günü), yani gün kapanmadan seviye kullanılmaz.
 *
 * Seviye testi (`scripts/seviye-testi.js`) ile AYNI tanım: kova %0,1 (log),
 * mum hacmi high–low aralığına eşit dağıtılır.
 */
const GUN = 864e5;
const KOVA = Math.log(1.001);

/** Bir günün mumlarından { vwap, poc }. */
function gunSeviyesi(mumlar) {
  let pv = 0, v = 0; const h = new Map();
  for (const m of mumlar) {
    const hac = Number(m.volume) || 0;
    if (!(hac > 0) || !(m.low > 0)) continue;
    pv += (m.high + m.low + m.close) / 3 * hac; v += hac;
    const a = Math.floor(Math.log(m.low) / KOVA), b = Math.floor(Math.log(m.high) / KOVA);
    const pay = hac / (b - a + 1);
    for (let k = a; k <= b; k++) h.set(k, (h.get(k) || 0) + pay);
  }
  if (!v) return null;
  let poc = null;
  for (const [k, x] of h) if (poc == null || x > h.get(poc)) poc = k;
  return { vwap: pv / v, poc: Math.exp((poc + 0.5) * KOVA) };
}

/**
 * Mum dizisiyle hizalı önceki-gün seviyeleri.
 * @returns { vwap: number[], poc: number[], gunVwap: Map<gün başı, vwap> } (yoksa null)
 */
function oncekiGunSeviyeleri(mumlar) {
  const gunler = new Map();
  for (const m of mumlar) { const g = Math.floor(m.time / GUN) * GUN; if (!gunler.has(g)) gunler.set(g, []); gunler.get(g).push(m); }
  const sev = new Map();
  for (const [g, ms] of gunler) sev.set(g, gunSeviyesi(ms));
  const vwap = [], poc = [];
  for (const m of mumlar) {
    const s = sev.get(Math.floor(m.time / GUN) * GUN - GUN);
    vwap.push(s ? s.vwap : null); poc.push(s ? s.poc : null);
  }
  return { vwap, poc, gunVwap: new Map([...sev].map(([g, s]) => [g, s ? s.vwap : null])) };
}

module.exports = { gunSeviyesi, oncekiGunSeviyeleri, GUN };
