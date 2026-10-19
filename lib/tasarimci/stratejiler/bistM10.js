/**
 * BIST MOMENTUM 10 (840, model m-bist-m10) — CANLI ÇEKİRDEK. PLAN-PORTFOY-TASARIMCI.md (F6 kolu F1'e çekildi), t1-s1.json.
 * Mutabakat: node scripts/tasarimci-mutabakat.js (2012 → her ay sonu listesi scripts/bist-yenmek-momentum.js ile birebir).
 *
 * KURAL (scripts/bist-yenmek-momentum.js veri yükleme + PIT evren + `secim` + `kararM10` + `simule` BİREBİR; betik değişmedi):
 *   Havuz = scripts/bist-indir.js GUNCEL + ESKI (.IS). Satırlar v > 0, c > 0, ac > 0, o > 0; o × (ac/c), c = ac; ≤ 7 günde
 *   |getiri| > %25 sıçrama öncesi geçmişe çarpan (bölünme/bedelsiz düzeltmesi, bist-strateji.js ile aynı). Takvim = en az 3
 *   havuz hissesinin çubuğu olan günler. PIT evren (her karar günü): ≥ 252 kendi çubuğu, son çubuk ≤ 10 gün önce, son 63
 *   takvim gününün (çubuksuz gün 0) medyan TL cirosu ile ilk 30. Ay sonu kapanışında evren içinde 12-1 getirisi en yüksek 10,
 *   her biri 1/10; ertesi işlem günü açılışında; maliyet komisyon+BSMV %0,10 + kayma %0,05 tek yön; nakit TCMB politika
 *   faizi, borç politika + %5 (d−1 oranı × takvim günü / 365, açılış işlemlerinden sonra). Ölçüm USD = TL / USDTRY.
 *
 * CANLI FARK (yalnız takvim): son veri gününün ay sonu olup olmadığı takvim.js'ten (BIST) okunur (ölçüm betiği son günü
 * her zaman ay geçişi sayar ama orada karar vermez). Geçmişte takvim.js = veri takvimi (öz test).
 *
 * API
 *   hazirla({ sonT? }) → D        secim(D, d) · ayGecis(D, d) · evrenLikidite(D, d) · kararM10(D, { kayit })
 *   simule(D, strateji, { nakitFaiz, borcFaiz, dSon }) · kos(D, { dSon? }) → { m10: { r, kayit, usd, tl } }
 *   metrik(e, bas, bit) (alan v) · olc(usdEgri) → { gel, hol, tum } (geliştirme < 2021-01-01 ≤ holdout)
 *   hedef(D, kararGunu) → { kararGunu, uygulamaGunu, liste, agirlik, veriTam, evren, aday, xuTam, eksikVeri }  (veriTam: XU030 o günü tam
 *        kapanmış mı; eksikVeri: karar günü çubuğu olup tamlığı kanıtlanamayan .IS hisseleri — evren cirosu yarım günle olurdu)
 */
'use strict';
const path = require('path');
const V = require('../veri');
const T = require('../takvim');

const GUN = 864e5;
const BAS = Date.UTC(2012, 0, 1), HOL = Date.UTC(2021, 0, 1);
const KOMISYON = 0.001, KAYMA = 0.0005, KREDI_EK = 0.05, K = 10;
const tarih = t => new Date(t).toISOString().slice(0, 10);
const ayNo = t => { const x = new Date(t); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };
function havuz() { const { GUNCEL, ESKI } = require(path.join(__dirname, '..', '..', '..', 'scripts', 'bist-indir')); return [...new Set([...GUNCEL, ...ESKI])]; }
function medyan(a) { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
function sonOnce(satir, T_) { let lo = 0, hi = satir.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (satir[m].t <= T_) { r = m; lo = m + 1; } else hi = m - 1; } return r; }

function hisseYukle(s, sonT, duzeltmeler) {
  const y = s + '.IS';
  if (!V.seriVarMi(y)) return null;
  const g = V.ham(y).gunler.filter(x => x.t <= sonT && x.v > 0 && x.c > 0 && x.ac > 0 && x.o > 0);
  const satir = g.map(x => { const k = x.ac / x.c; return { t: x.t, o: x.o * k, c: x.ac, ham: x.c, ciro: x.c * x.v }; });
  for (let i = satir.length - 1; i >= 1; i--) {
    const r = satir[i].c / satir[i - 1].c - 1;
    if (Math.abs(r) > 0.25 && satir[i].t - satir[i - 1].t <= 7 * GUN) {
      const k = satir[i].c / satir[i - 1].c;
      for (let j = 0; j < i; j++) { satir[j].o *= k; satir[j].c *= k; }
      if (satir[i].t >= Date.UTC(2010, 0, 1)) duzeltmeler.push(`${s} ${tarih(satir[i].t)} ${(r * 100).toFixed(1)}%`);
    }
  }
  return satir;
}

function hazirla({ sonT = Infinity } = {}) {
  const duzeltmeler = [], hisse = new Map();
  for (const s of havuz()) { const x = hisseYukle(s, sonT, duzeltmeler); if (x && x.length) hisse.set(s, x); }
  const sayac = new Map();
  for (const x of hisse.values()) for (const b of x) sayac.set(b.t, (sayac.get(b.t) || 0) + 1);
  const takvim = [...sayac.entries()].filter(([, n]) => n >= 3).map(([t]) => t).sort((a, b) => a - b);
  const D = takvim.length;
  const H = new Map();
  for (const [s, satir] of hisse) {
    const bar = new Array(D).fill(null), sonIdx = new Int32Array(D).fill(-1);
    let k = -1, j = 0;
    for (let d = 0; d < D; d++) { while (j < satir.length && satir[j].t <= takvim[d]) { if (satir[j].t === takvim[d]) bar[d] = satir[j]; k = j; j++; } sonIdx[d] = k; }
    H.set(s, { s, satir, bar, sonIdx });
  }
  const hizala = gunler => { const out = new Float64Array(D); let son = NaN; const sirali = gunler.filter(x => x.c > 0 && x.t <= sonT).sort((a, b) => a.t - b.t); let j = 0; for (let d = 0; d < D; d++) { while (j < sirali.length && sirali[j].t <= takvim[d]) { son = sirali[j].c; j++; } out[d] = son; } return out; };
  const XU030 = hizala(V.ham('XU030.IS').gunler);
  const USD = hizala(V.usdtry());
  const F = V.tcmbFaiz(), faizSeri = F.seri;
  const faiz = t => { let r = 0; for (const x of faizSeri) if (x.t <= t) r = x.oran; return r; };
  const aySon = new Map(); for (let d = 0; d < D; d++) aySon.set(ayNo(takvim[d]), d);
  const d0 = takvim.findIndex(t => t >= BAS) - 1;
  return { takvim, D, H, XU030, USD, faiz, faizBilgi: F, aySon, d0, duzeltmeler, hisseSay: hisse.size };
}

const kapanis = (h, d) => (h.sonIdx[d] >= 0 ? h.satir[h.sonIdx[d]].c : NaN);
function ayGecis(X, d) {
  if (d < X.D - 1) return new Date(X.takvim[d + 1]).getUTCMonth() !== new Date(X.takvim[d]).getUTCMonth();
  return T.aySonuMu(X.takvim[d], 'BIST');
}
function evrenLikidite(X, d) {
  const aday = [];
  for (const h of X.H.values()) {
    const k = h.sonIdx[d];
    if (k < 251) continue;
    if (X.takvim[d] - h.satir[k].t > 10 * GUN) continue;
    const c = []; for (let i = Math.max(0, d - 62); i <= d; i++) c.push(h.bar[i] ? h.bar[i].ciro : 0);
    aday.push([h.s, medyan(c)]);
  }
  return aday.sort((a, b) => b[1] - a[1]).slice(0, 30).map(x => x[0]);
}
function secim(X, d, evrenF = evrenLikidite, { ay = null } = {}) {
  const m = ay != null ? ay : ayNo(X.takvim[d]);   // ay: aday havuzu önizlemesi (m10.js secim ile aynı)
  const Tm = i => X.takvim[X.aySon.get(i)];
  const ev = evrenF(X, d), puan = [];
  if (X.aySon.has(m - 13)) for (const s of ev) {
    const st = X.H.get(s).satir;
    if (st[0].t > Tm(m - 13)) continue;
    const j1 = sonOnce(st, Tm(m - 1)), j12 = sonOnce(st, Tm(m - 12));
    if (j1 < 0 || j12 < 0 || st[j1].t <= Tm(m - 2) || st[j12].t <= Tm(m - 13)) continue;
    puan.push({ s, p: st[j1].c / st[j12].c - 1 });
  }
  puan.sort((a, b) => b.p - a.p || (a.s < b.s ? -1 : 1));
  return { liste: puan.slice(0, K), aday: puan.length, evren: ev.length, tum: puan, evrenListe: ev };
}
const sifirla = (ctx, tut) => { const o = {}; for (const s of ctx.poz.keys()) if (!tut.includes(s)) o[s] = 0; return o; };
function kararM10(X, { kayit = null } = {}) {
  return (d, ctx) => {
    if (!ayGecis(X, d)) return null;
    const sec = secim(X, d).liste.map(x => x.s);
    if (kayit) kayit.push({ t: X.takvim[d], sec, kapali: false });
    const o = sifirla(ctx, sec);
    for (const s of sec) o[s] = 1 / K;
    return Object.keys(o).length ? o : null;
  };
}

function simule(X, strateji, { nakitFaiz = true, borcFaiz = true, dSon = X.D - 1 } = {}) {
  const { takvim, H, d0, faiz } = X;
  let nakit = 1; const poz = new Map(), bekleyen = new Map();
  let islem = 0, ucret = 0, finans = 0, finansOran = 0, nakitKazanc = 0;
  const egri = [], adet = [], brut = [], devir = new Map();
  const ctx = { poz };
  for (let d = d0; d <= dSon; d++) {
    if (d > d0) {
      let oz = nakit;
      for (const [s, u] of poz) { const h = H.get(s); oz += u * (h.bar[d] ? h.bar[d].o : kapanis(h, d - 1)); }
      const ay = ayNo(takvim[d]);
      for (const [s, w] of [...bekleyen]) {
        const h = H.get(s), b = h.bar[d];
        if (!b) continue;
        bekleyen.delete(s);
        const mevcut = poz.get(s) || 0, istenen = w * oz / b.o, fark = istenen - mevcut;
        if (Math.abs(fark * b.o) < 1e-9) continue;
        const fiyat = b.o * (1 + Math.sign(fark) * KAYMA);
        const c = Math.abs(fark) * fiyat * KOMISYON + Math.abs(fark) * b.o * KAYMA;
        nakit -= fark * fiyat + Math.abs(fark) * fiyat * KOMISYON;
        ucret += c; islem++;
        devir.set(ay, (devir.get(ay) || 0) + Math.abs(fark) * b.o / oz);
        if (istenen * b.o < 1e-9) poz.delete(s); else poz.set(s, istenen);
      }
      const gun = (takvim[d] - takvim[d - 1]) / GUN, r = faiz(takvim[d - 1]);
      if (nakit > 0 && nakitFaiz) { const f = nakit * r * gun / 365; nakit += f; nakitKazanc += f; }
      else if (nakit < 0 && borcFaiz) {
        const f = -nakit * (r + KREDI_EK) * gun / 365; nakit -= f; finans += f;
        const o2 = egri[egri.length - 1].oz; if (o2 > 0) finansOran += f / o2;
      }
    }
    let oz = nakit, br = 0;
    for (const [s, u] of poz) { const c = kapanis(H.get(s), d); oz += u * c; br += u * c; }
    egri.push({ time: takvim[d], oz, d }); adet.push(poz.size); brut.push(oz > 0 ? br / oz : 0);
    if (oz <= 0) break;
    ctx.oz = oz;
    if (d < dSon) { const k = strateji(d, ctx); if (k) for (const [s, w] of Object.entries(k)) bekleyen.set(s, w); }
  }
  return { egri, adet, brut, devir, islem, ucret, finans, finansOran, nakitKazanc };
}

function metrik(e, bas = -Infinity, bit = Infinity, yillik = 252) {
  let i0 = e.findIndex(x => x.time >= bas); if (i0 < 0) return null; if (i0 > 0) i0--;
  const z = e.slice(i0).filter(x => x.time < bit);
  const r = z.slice(1).map((x, i) => x.v / z[i].v - 1);
  const o = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - o) ** 2, 0) / (r.length - 1));
  let tepe = z[0].v, dd = 0;
  for (const x of z) { tepe = Math.max(tepe, x.v); dd = Math.max(dd, 1 - x.v / tepe); }
  const yil = (z[z.length - 1].time - z[0].time) / (365.25 * GUN);
  const top = z[z.length - 1].v / z[0].v - 1;
  return { cagr: top > -1 ? Math.pow(1 + top, 1 / yil) - 1 : -1, maxDD: dd, sharpe: sd > 0 ? o / sd * Math.sqrt(yillik) : 0, toplam: top };
}
const tlEgri = r => r.egri.map(x => ({ time: x.time, v: x.oz }));
const usdEgri = (X, r) => r.egri.map(x => ({ time: x.time, v: x.oz / X.USD[x.d] }));
const olc = e => ({ gel: metrik(e, -Infinity, HOL), hol: metrik(e, HOL), tum: metrik(e) });
function kos(X, { dSon = X.D - 1 } = {}) {
  const kayit = [];
  const r = simule(X, kararM10(X, { kayit }), { dSon });
  return { m10: { r, kayit, usd: usdEgri(X, r), tl: tlEgri(r) } };
}
function hedef(X, kararGunu) {
  const t = T.ms(kararGunu), d = X.takvim.indexOf(t);
  if (!T.aySonuMu(t, 'BIST')) throw new Error(`bistM10: ${tarih(t)} BIST ay sonu işlem günü değil`);
  if (d < 0) throw new Error(`bistM10: ${tarih(t)} için fiyat verisi yok (son gün ${tarih(X.takvim[X.D - 1])})`);
  const s = secim(X, d);
  const tam = V.sonTamGun('XU030.IS', 'BIST');
  // Karar günü çubuğu var ama TAM olduğu kanıtlanamayan hisseler (dosya yayından önce indirildi): evren cirosu ve son fiyat
  // yarım günle hesaplanmış olur. Burada yalnız listelenir; karar verip vermemeyi çağıran seçer (model.js: bekletir).
  const yarim = [];
  for (const [s2, h] of X.H) if (h.bar[d]) { const z = V.sonTamGun(s2 + '.IS', 'BIST'); if (!z || z < tarih(t)) yarim.push(s2); }
  return { kararGunu: tarih(t), uygulamaGunu: tarih(T.sonrakiIslemGunu(t, 'BIST')), liste: s.liste, agirlik: Object.fromEntries(s.liste.map(x => [x.s, 1 / K])),
    veriTam: !!tam && tam >= tarih(t), evren: s.evren, aday: s.aday, xuTam: tam || null,
    eksikVeri: yarim.sort().map(x => ({ s: x, neden: `${tarih(t)} çubuğu tam değil (yayından önce indirildi)` })) };
}

module.exports = { BAS, HOL, K, KOMISYON, KAYMA, havuz, hazirla, ayGecis, evrenLikidite, secim, kararM10, simule, metrik, tlEgri, usdEgri, olc, kos, hedef };
