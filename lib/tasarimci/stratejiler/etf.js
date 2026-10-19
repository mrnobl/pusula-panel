/**
 * ETF / KIYAS YAPI TAŞLARI — QQQ al-tut, T-bill, XU030 (USD). PLAN-PORTFOY-TASARIMCI.md (b) kıyaslar, 837 çekirdek kolu.
 * Hepsi lib/tasarimci/veri.js'ten okur (canlı kip: orkestratör kopyası önce). Eğriler [{ time, oz }], taban 1.
 *
 *   qqq({ bas?, sonT?, kayma = 0.0005 }) → QQQ al-tut: bas'tan önceki son işlem günü kapanışında alım (kayma ödenir),
 *        düzeltilmiş kapanış (temettü dahil). NYSE işlem günleri. (qqq-momentum.js kararAlTut / qqq-cekirdek-uydu.js ile aynı tanım)
 *   kapanislar(sembol, { sonT? }) → [{ t, c }]  düzeltilmiş kapanış
 *   takvimGunuHizala(seri [{ t, c }], zt [ms]) → Float64Array  her takvim gününde o güne kadarki son kapanış (yoksa NaN)
 *   tbill({ bas?, sonT? }) → NYSE günlerinde 1 · Π(1 + IRX(d−1)/100/252) (qqq-momentum.js nakit tanımı)
 *   xu030Usd({ bas?, sonT? }) → XU030.IS kapanışı / USDTRY (ileri taşınmış), BIST veri günlerinde (fiyat endeksi, temettüsüz)
 */
'use strict';
const V = require('../veri');

const GUN = 864e5;
function kapanislar(sembol, { sonT = Infinity } = {}) { return V.duzeltilmis(sembol).filter(x => x.t <= sonT).map(x => ({ t: x.t, c: x.c })); }
function takvimGunuHizala(seri, zt) {
  const out = new Float64Array(zt.length); let j = 0, son = NaN;
  for (let i = 0; i < zt.length; i++) { while (j < seri.length && seri[j].t <= zt[i]) { son = seri[j].c; j++; } out[i] = son; }
  return out;
}
function qqq({ bas = -Infinity, sonT = Infinity, kayma = 0.0005 } = {}) {
  const q = kapanislar('QQQ', { sonT });
  let i0 = q.findIndex(x => x.t >= bas); if (i0 < 0) return []; if (i0 > 0) i0--;
  const z = q.slice(i0), c0 = z[0].c;
  return z.map((x, i) => ({ time: x.t, oz: i === 0 ? 1 - kayma : (1 - kayma) * x.c / c0 }));
}
function tbill({ bas = -Infinity, sonT = Infinity } = {}) {
  const tk = V.nyseGunleri().filter(t => t >= bas && t <= sonT), irx = V.irx();
  const out = []; let L = 1, j = -1;
  for (let d = 0; d < tk.length; d++) {
    if (d > 0) { while (j + 1 < irx.length && irx[j + 1].t <= tk[d - 1]) j++; L *= 1 + (j >= 0 ? irx[j].c : 0) / 100 / 252; }
    out.push({ time: tk[d], oz: L });
  }
  return out;
}
function xu030Usd({ bas = -Infinity, sonT = Infinity } = {}) {
  const x = V.ham('XU030.IS').gunler.filter(g => g.c > 0 && g.t >= bas && g.t <= sonT).sort((a, b) => a.t - b.t);
  const u = V.usdtry(); let j = -1, usd = NaN;
  const out = [];
  for (const g of x) { while (j + 1 < u.length && u[j + 1].t <= g.t) { j++; usd = u[j].c; } if (usd > 0) out.push({ time: g.t, oz: g.c / usd }); }
  if (!out.length) return out;
  const b0 = out[0].oz; return out.map(p => ({ time: p.time, oz: p.oz / b0 }));
}

module.exports = { qqq, tbill, xu030Usd, kapanislar, takvimGunuHizala, GUN };
