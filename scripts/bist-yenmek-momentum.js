#!/usr/bin/env node
/**
 * BIST'TE ENDEKSİ YENMEK — 840 B-M10 · 841 B-M10-F · 843 B-LRS-2 M10
 * PLAN-BIST-YENMEK.md (ön kayıt 68a7a56, ölçümden önce). Parametre ARANMAZ; tek sürüm.
 * QQQ karşılıkları: scripts/qqq-momentum.js (830 / 831 / 833) — seçim, Faber, LRS mantığı birebir.
 *
 *   node scripts/bist-yenmek-momentum.js gel   # GELİŞTİRME koşusu (simülasyon 2020-12-31'de kesilir; holdout görülmez) — serbest
 *   node scripts/bist-yenmek-momentum.js tam   # TAM koşu (holdout okunur) — aday başına BİR KEZ; data/bist-yenmek/momentum-holdout-log.json,
 *                                              #   önceki 'tam' varsa REDDEDER (--zorla ile koşar, tekrar loglanır)
 * Çıktı (tam): data/bist-yenmek/momentum-sonuc.json + momentum-cikti.md
 *
 * ALTYAPI: scripts/bist-strateji.js require edilemez (yüklenince tüm ölçümü koşup yazdırıyor) → veri yükleme, temizlik,
 *   takvim, hizalama, PIT evren, EW al-tut, simülatör, metrik, bootstrap BİREBİR kopyalandı (kaynak satırları aşağıda).
 *   Simülatöre eklenen tek şey: nakit < 0 iken kredili işlem finansmanı + devir/adet/brüt kaydı.
 *
 * ORTAK TANIMLAR
 *   · Simülasyon TL; USD eğrisi = TL özsermaye / USDTRY kapanışı (ileri taşınmış).
 *   · Karar kapanışta, uygulama ertesi işlem günü AÇILIŞINDA; maliyet komisyon+BSMV %0,10 + kayma %0,05 tek yön
 *     (bist-strateji.js ile aynı: fiyat = açılış × (1 ± kayma), komisyon bu fiyat üzerinden).
 *   · Nakit (> 0) TCMB politika faizi; borç (nakit < 0) politika + %5 yıllık. Oran d−1 gününün oranı, süre takvim günü
 *     (t_d − t_{d−1}) / 365, uygulama d günü açılış işlemlerinden SONRAKİ nakde — bist-strateji.js B2f zamanlamasıyla AYNI.
 *     Hepsi long → nakit = özsermaye × (1 − brüt): borç = (brüt − 1)+ × özsermaye.
 *   · Kıyaslar: XU030 al-tut (fiyat endeksi / USDTRY, maliyetsiz) ve EW BIST30 al-tut (PLAN-BIST tanımı: PIT evren 1/n,
 *     aylık, temettü + maliyet dahil, nakit faizsiz ve borç faizsiz — yeniden üretim için birebir).
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const ROOT = path.join(__dirname, '..');
const DIR = yollar.veri('bist');
const OUT = yollar.veri('bist-yenmek');
const LOG = path.join(OUT, 'momentum-holdout-log.json');
const O = require(path.join(ROOT, 'lib', 'risk', 'olcum'));
const N = require(path.join(ROOT, 'lib', 'research', 'nasdaq'));   // yalnız dsr / gunlukSharpe (salt okuma)
const { GUNCEL, ESKI } = require('./bist-indir');

const GUN = 864e5;
const BAS = Date.UTC(2012, 0, 1), HOL = Date.UTC(2021, 0, 1);
const KOMISYON = 0.001, KAYMA = 0.0005, KREDI_EK = 0.05, K = 10;
const yz = (x, b = 1) => (x == null || !isFinite(x) ? '—' : `%${(x * 100).toFixed(b)}`.replace('.', ','));
const sy = (x, b = 2) => (x == null || !isFinite(x) ? '—' : x.toFixed(b).replace('.', ','));
const pp = (x, n = 1) => (x == null || !isFinite(x) ? '—' : (x >= 0 ? '+' : '') + (x * 100).toFixed(n).replace('.', ','));
const tarih = t => new Date(t).toISOString().slice(0, 10);

// ── Veri (bist-strateji.js satır 30–92 birebir) ─────────────────────────────
const oku = ad => JSON.parse(fs.readFileSync(path.join(DIR, ad + '.json'), 'utf8'));
const duzeltmeler = [];
function hisseYukle(s) {
  const dosya = path.join(DIR, s + '.IS.json');
  if (!fs.existsSync(dosya)) return null;
  const v = JSON.parse(fs.readFileSync(dosya, 'utf8'));
  const g = v.gunler.filter(x => x.v > 0 && x.c > 0 && x.ac > 0 && x.o > 0);
  const satir = g.map(x => { const k = x.ac / x.c; return { t: x.t, o: x.o * k, c: x.ac, ham: x.c, ciro: x.c * x.v }; });
  for (let i = satir.length - 1; i >= 1; i--) {
    const r = satir[i].c / satir[i - 1].c - 1;
    if (Math.abs(r) > 0.25 && satir[i].t - satir[i - 1].t <= 7 * GUN) {
      const k = satir[i].c / satir[i - 1].c;
      for (let j = 0; j < i; j++) { satir[j].o *= k; satir[j].c *= k; }
      if (satir[i].t >= Date.UTC(2010, 0, 1)) duzeltmeler.push(`${s} ${tarih(satir[i].t)} ${yz(r)}`);
    }
  }
  return satir;
}
const HAVUZ = [...new Set([...GUNCEL, ...ESKI])];
const hisse = new Map();
for (const s of HAVUZ) { const x = hisseYukle(s); if (x && x.length) hisse.set(s, x); }
const sayac = new Map();
for (const x of hisse.values()) for (const b of x) sayac.set(b.t, (sayac.get(b.t) || 0) + 1);
const takvim = [...sayac.entries()].filter(([, n]) => n >= 3).map(([t]) => t).sort((a, b) => a - b);
const D = takvim.length;
const H = new Map();
for (const [s, satir] of hisse) {
  const bar = new Array(D).fill(null), sonIdx = new Int32Array(D).fill(-1);
  let k = -1, j = 0;
  for (let d = 0; d < D; d++) {
    while (j < satir.length && satir[j].t <= takvim[d]) { if (satir[j].t === takvim[d]) bar[d] = satir[j]; k = j; j++; }
    sonIdx[d] = k;
  }
  H.set(s, { s, satir, bar, sonIdx });
}
function seriHizala(ad, alan = 'c') {
  const v = oku(ad);
  const out = new Float64Array(D); let son = NaN;
  const sirali = v.gunler.filter(x => x[alan] > 0).sort((a, b) => a.t - b.t); let j = 0;
  for (let d = 0; d < D; d++) { while (j < sirali.length && sirali[j].t <= takvim[d]) { son = sirali[j][alan]; j++; } out[d] = son; }
  return { out };
}
const XU030 = seriHizala('XU030.IS').out;
const USD = seriHizala('USDTRY_X').out;
const faizJ = oku('tcmb-politika-faizi'), faizSeri = faizJ.seri;
const faiz = t => { let r = 0; for (const x of faizSeri) if (x.t <= t) r = x.oran; return r; };

// ── Yardımcılar (bist-strateji.js satır 95–118 birebir) ──────────────────────
const ayGecis = d => d === D - 1 || new Date(takvim[d + 1]).getUTCMonth() !== new Date(takvim[d]).getUTCMonth();
const sma = (dizi, d, n) => { if (d < n - 1) return NaN; let s = 0; for (let i = d - n + 1; i <= d; i++) s += dizi[i]; return s / n; };
const kapanis = (h, d) => (h.sonIdx[d] >= 0 ? h.satir[h.sonIdx[d]].c : NaN);
function medyan(a) { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
function evrenLikidite(d) {
  const aday = [];
  for (const h of H.values()) {
    const k = h.sonIdx[d];
    if (k < 251) continue;
    if (takvim[d] - h.satir[k].t > 10 * GUN) continue;
    const c = []; for (let i = Math.max(0, d - 62); i <= d; i++) c.push(h.bar[i] ? h.bar[i].ciro : 0);
    aday.push([h.s, medyan(c)]);
  }
  return aday.sort((a, b) => b[1] - a[1]).slice(0, 30).map(x => x[0]);
}
function evrenBugunku(d) {
  return GUNCEL.filter(s => H.has(s) && H.get(s).sonIdx[d] >= 251 && takvim[d] - H.get(s).satir[H.get(s).sonIdx[d]].t <= 10 * GUN);
}
// Ay sonu işlem günleri (takvim üzerinde). ayNo = yıl*12 + ay.
const ayNo = t => { const x = new Date(t); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };
const aySon = new Map(); for (let d = 0; d < D; d++) aySon.set(ayNo(takvim[d]), d);
function sonOnce(satir, T) { let lo = 0, hi = satir.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (satir[m].t <= T) { r = m; lo = m + 1; } else hi = m - 1; } return r; }
const d0 = takvim.findIndex(t => t >= BAS) - 1;   // 2011 son işlem günü kapanışında ilk karar (bist-strateji.js ile aynı)

// ── Simülatör (bist-strateji.js satır 132–167 + finansman/kayıt) ─────────────
function simule(strateji, { nakitFaiz = true, borcFaiz = true, dSon = D - 1 } = {}) {
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
const sifirla = (ctx, tut) => { const o = {}; for (const s of ctx.poz.keys()) if (!tut.includes(s)) o[s] = 0; return o; };
// EW al-tut (bist-strateji.js satır 172–179 birebir)
function ewAltut(evrenF) {
  return (d, ctx) => {
    if (!ayGecis(d)) return null;
    const ev = evrenF(d); const o = sifirla(ctx, ev);
    for (const s of ev) o[s] = 1 / ev.length;
    return o;
  };
}

// ── M10 seçimi (qqq-momentum.js secim() karşılığı) ──────────────────────────
/** d (ay sonu) kapanışında evren içinde 12-1 getiri (t−12 ay sonu → t−1 ay sonu kapanışı, düzeltilmiş) en yüksek 10.
 *  ≥ 13 ay geçmiş: ilk çubuk ≤ t−13. ayın son işlem günü; t−12 ve t−1 kapanışları kendi aylarında bir çubuk. */
function secim(d, evrenF) {
  const m = ayNo(takvim[d]);
  const T = i => takvim[aySon.get(i)];
  const ev = evrenF(d), puan = [];
  if (aySon.has(m - 13)) for (const s of ev) {
    const st = H.get(s).satir;
    if (st[0].t > T(m - 13)) continue;
    const j1 = sonOnce(st, T(m - 1)), j12 = sonOnce(st, T(m - 12));
    if (j1 < 0 || j12 < 0 || st[j1].t <= T(m - 2) || st[j12].t <= T(m - 13)) continue;
    puan.push({ s, p: st[j1].c / st[j12].c - 1 });
  }
  puan.sort((a, b) => b.p - a.p || (a.s < b.s ? -1 : 1));
  return { liste: puan.slice(0, K), aday: puan.length, evren: ev.length };
}
function faberAcik(d) {   // ay sonu XU030 ≥ son 10 ay sonu ortalaması (o ay dahil) → açık
  const m = ayNo(takvim[d]), c = [XU030[d]];
  for (let i = 1; i < 10; i++) c.push(XU030[aySon.get(m - i)]);
  const ort = c.reduce((a, b) => a + b, 0) / 10;
  return { acik: !(c[0] < ort), kapanis: c[0], ort10: ort };
}
function kararM10(evrenF, { faber = false, carpan = 1, kayit = null } = {}) {
  return (d, ctx) => {
    if (!ayGecis(d)) return null;
    let sec = secim(d, evrenF).liste.map(x => x.s), kapali = false;
    if (faber && !faberAcik(d).acik) { sec = []; kapali = true; }
    if (kayit) kayit.push({ t: takvim[d], sec, kapali });
    const o = sifirla(ctx, sec);
    for (const s of sec) o[s] = carpan / K;
    return Object.keys(o).length ? o : null;
  };
}
function kararLrs(evrenF, { carpan = 2, kayit = null } = {}) {
  let sepet = [], acikOnce = false;
  return (d, ctx) => {
    const ay = ayGecis(d);
    if (ay) sepet = secim(d, evrenF).liste.map(x => x.s);
    const acik = XU030[d] > sma(XU030, d, 200);
    let o = {};
    if (acik && (ay || !acikOnce)) { o = sifirla(ctx, sepet); for (const s of sepet) o[s] = carpan / K; }
    else if (!acik) for (const s of ctx.poz.keys()) o[s] = 0;
    if (kayit && ay) kayit.push({ t: takvim[d], sec: sepet, kapali: !acik });
    acikOnce = acik;
    return Object.keys(o).length ? o : null;
  };
}
const ADAYLAR = [
  { no: 840, ad: 'B-M10', kur: (ev, k) => kararM10(ev, { kayit: k }) },
  { no: 841, ad: 'B-M10-F (Faber 10 ay)', kur: (ev, k) => kararM10(ev, { faber: true, kayit: k }) },
  { no: 843, ad: 'B-LRS-2 M10 (×2, XU030 > SMA200)', kur: (ev, k) => kararLrs(ev, { kayit: k }) },
];

// ── Metrikler (bist-strateji.js satır 236–267 birebir; v alanı) ──────────────
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
function yillikGetiri(e) {
  const out = {}; let onceki = e[0];
  for (let i = 1; i < e.length; i++) {
    const y = new Date(e[i].time).getUTCFullYear();
    if (i === e.length - 1 || new Date(e[i + 1].time).getUTCFullYear() !== y) { out[y] = e[i].v / onceki.v - 1; onceki = e[i]; }
  }
  return out;
}
const tlEgri = r => r.egri.map(x => ({ time: x.time, v: x.oz }));
const usdEgri = r => r.egri.map(x => ({ time: x.time, v: x.oz / USD[x.d] }));
const getiriMap = e => new Map(e.slice(1).map((x, i) => [x.time, x.v / e[i].v - 1]));
function pUstun(e, kiyas) {
  const a = getiriMap(e), b = getiriMap(kiyas);
  const satir = [...a.keys()].filter(t => b.has(t)).map(t => [a.get(t), b.get(t)]);
  const k = O.duraganBootstrap(satir, { b: 20, N: 2000, H: satir.length, tohum: 99, olc: yol => { let x = 1, y = 1; for (const [p, q] of yol) { x *= 1 + p; y *= 1 + q; } return x > y ? 1 : 0; } });
  return k.reduce((s, x) => s + x, 0) / k.length;
}
const endeksEgri = (seri, kur, dSon = D - 1) => takvim.slice(d0, dSon + 1).map((t, j) => ({ time: t, v: seri[d0 + j] / (kur ? USD[d0 + j] : 1) }));

function bilgiler(r, kayit, bas = -Infinity, bit = Infinity) {
  const i = r.egri.map((x, k) => k).filter(k => k > 0 && r.egri[k].time >= bas && r.egri[k].time < bit);
  const ortHisse = i.reduce((a, k) => a + r.adet[k], 0) / i.length;
  const piyasada = i.filter(k => r.adet[k] > 0).length / i.length;
  const ortBrut = i.reduce((a, k) => a + r.brut[k], 0) / i.length;
  const aylar = [...new Set(i.map(k => ayNo(r.egri[k].time)))];
  const devir = aylar.reduce((a, m) => a + (r.devir.get(m) || 0), 0) / aylar.length;
  let deg = 0, n = 0;
  for (let k = 1; k < kayit.length; k++) { if (kayit[k].t < bas || kayit[k].t >= bit) continue; const a = kayit[k - 1].kapali ? [] : kayit[k - 1].sec, b = kayit[k].kapali ? [] : kayit[k].sec; deg += b.filter(s => !a.includes(s)).length; n++; }
  const yil = (r.egri[r.egri.length - 1].time - r.egri[0].time) / (365.25 * GUN);
  return { ortHisse, piyasadaPay: piyasada, ortBrut, aylikDevir: devir, aylikYeniIsim: n ? deg / n : null, islem: r.islem,
    ucretTL: r.ucret, finansmanTL: r.finans, finansmanYillikOz: r.finansOran / yil, nakitFaiziTL: r.nakitKazanc };
}

// ── Kontrol: PLAN-BIST SONUÇ kıyasları ──────────────────────────────────────
const BEKLENEN = { xu: { cagr: -0.002, gel: -0.041, hol: 0.061, dd: 0.782 }, ew: { cagr: 0.040, gel: 0.040, hol: 0.041, dd: 0.611 } };
function kontrol(xuU, ewU) {
  const sat = [['XU030 al-tut', xuU, BEKLENEN.xu], ['EW BIST30 al-tut', ewU, BEKLENEN.ew]];
  const out = []; let ok = true;
  for (const [ad, e, b] of sat) {
    const m = metrik(e), g = metrik(e, -Infinity, HOL), h = metrik(e, HOL);
    const v = { cagr: m.cagr, gel: g.cagr, hol: h.cagr, dd: m.maxDD };
    for (const k of Object.keys(b)) if (Math.abs(v[k] - b[k]) > 0.0005 + 1e-9) ok = false;   // PLAN-BIST 1 ondalık yuvarlama
    out.push({ ad, beklenen: b, olculen: v });
    console.log(`KONTROL ${ad.padEnd(18)} CAGR ${yz(v.cagr)} (PLAN ${yz(b.cagr)}) gel ${yz(v.gel)} (${yz(b.gel)}) hol ${yz(v.hol)} (${yz(b.hol)}) DD ${yz(v.dd)} (${yz(b.dd)})`);
  }
  if (!ok) { console.error('KONTROL TUTMADI — dur.'); process.exit(3); }
  return out;
}

// ═══ ANA ════════════════════════════════════════════════════════════════════
function ana() {
  const kip = process.argv[2] || 'gel';
  if (!['gel', 'tam'].includes(kip)) throw new Error('kip: gel | tam');
  fs.mkdirSync(OUT, { recursive: true });
  const dGelSon = takvim.findIndex(t => t >= HOL) - 1;   // 2020-12-31
  console.log(`Veri: ${hisse.size} hisse (havuz ${HAVUZ.length}), takvim ${tarih(takvim[0])} → ${tarih(takvim[D - 1])}; ilk karar ${tarih(takvim[d0])}; faiz serisi son kayıt ${faizSeri[faizSeri.length - 1].tarih} %${(faizSeri[faizSeri.length - 1].oran * 100).toFixed(1)}`);

  // 0. Kontrol (kıyaslar, tüm dönem — PLAN-BIST'te zaten yayımlanmış rakamlar; aday holdout'u değil)
  const XU_U = endeksEgri(XU030, true), XU_T = endeksEgri(XU030, false);
  const EWr = simule(ewAltut(evrenLikidite), { nakitFaiz: false, borcFaiz: false });
  const EW_U = usdEgri(EWr), EW_T = tlEgri(EWr);
  const kon = kontrol(XU_U, EW_U);

  // 1. GELİŞTİRME (simülasyon 2020-12-31 kapanışında kesilir)
  const xuGel = metrik(XU_U, -Infinity, HOL), ewGel = metrik(EW_U, -Infinity, HOL);
  const G = ADAYLAR.map(a => { const kayit = []; const r = simule(a.kur(evrenLikidite, kayit), { dSon: dGelSon }); return { ...a, r, kayit, usd: usdEgri(r) }; });
  console.log(`\nGELİŞTİRME ${tarih(takvim[d0])} → ${tarih(takvim[dGelSon])} (USD) · XU030 ${yz(xuGel.cagr)} DD ${yz(xuGel.maxDD)} · EW ${yz(ewGel.cagr)} DD ${yz(ewGel.maxDD)}`);
  for (const x of G) {
    const m = metrik(x.usd), b = bilgiler(x.r, x.kayit);
    console.log(`${x.no} ${x.ad.padEnd(34)} CAGR ${yz(m.cagr)} DD ${yz(m.maxDD)} Sh ${sy(m.sharpe)} · ort hisse ${sy(b.ortHisse, 1)} piyasada ${yz(b.piyasadaPay, 0)} brüt ${sy(b.ortBrut)} devir/ay ${yz(b.aylikDevir, 0)} yeni isim/ay ${sy(b.aylikYeniIsim, 1)}`);
  }
  if (kip === 'gel') {
    const kk = G[0].kayit; console.log('840 ilk karar', tarih(kk[0].t), kk[0].sec.join(' '), '· son', tarih(kk[kk.length - 1].t), kk[kk.length - 1].sec.join(' '));
    const say = new Map(); for (const k of kk) for (const s of k.sec) say.set(s, (say.get(s) || 0) + 1);
    console.log('840 en sık seçilen (ay):', [...say].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([s, n]) => s + ' ' + n).join(', '));
    console.log('(holdout okunmadı)');
    return;
  }

  // 2. TAM KOŞU — holdout BİR KEZ
  const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : [];
  const onceki = log.filter(x => x.kip === 'tam');
  if (onceki.length && !process.argv.includes('--zorla')) { console.error(`HOLDOUT ZATEN OKUNDU (${onceki.map(x => x.zaman).join(', ')}) — tekrar için --zorla (loglanır)`); process.exit(2); }
  log.push({ kip: 'tam', zaman: new Date().toISOString(), adaylar: ADAYLAR.map(a => a.no), tekrar: onceki.length, pid: process.pid });
  fs.writeFileSync(LOG, JSON.stringify(log, null, 1));

  const xu = { gel: xuGel, hol: metrik(XU_U, HOL), tum: metrik(XU_U) };
  const ew = { gel: ewGel, hol: metrik(EW_U, HOL), tum: metrik(EW_U) };
  const xuT = { gel: metrik(XU_T, -Infinity, HOL), hol: metrik(XU_T, HOL), tum: metrik(XU_T) };
  const ewT = { gel: metrik(EW_T, -Infinity, HOL), hol: metrik(EW_T, HOL), tum: metrik(EW_T) };
  const ddTavan = xu.tum.maxDD + 0.05;
  const kos = (evrenF, sec = {}) => ADAYLAR.map(a => { const kayit = []; const r = simule(a.kur(evrenF, kayit), sec); return { ...a, r, kayit, usd: usdEgri(r), tl: tlEgri(r) }; });
  const T = kos(evrenLikidite), S0 = kos(evrenLikidite, { nakitFaiz: false }), YB = kos(evrenBugunku);
  const EWb = simule(ewAltut(evrenBugunku), { nakitFaiz: false, borcFaiz: false }), EWb_U = usdEgri(EWb);

  // QQQ ve BTC al-tut (USD, bilgi)
  const qqq = JSON.parse(fs.readFileSync(yollar.veri('nasdaq', 'QQQ.json'), 'utf8')).gunler.filter(x => x.ac > 0 && x.t <= takvim[D - 1]);
  const qIlk = qqq.findIndex(x => x.t >= BAS) - 1;
  const QQ = qqq.slice(qIlk).map(x => ({ time: x.t, v: x.ac }));
  const btcHam = oku('BTC_USD').gunler.filter(x => x.c > 0 && x.t <= takvim[D - 1]);
  const BT = btcHam.map(x => ({ time: x.t, v: x.c })), btcBas = BT[0].time;
  const qqqM = { gel: metrik(QQ, -Infinity, HOL), hol: metrik(QQ, HOL), tum: metrik(QQ), kaynak: 'data/nasdaq/QQQ.json adjclose (temettülü), ' + tarih(QQ[0].time) + ' →' };
  const btcM = { bas: tarih(btcBas), gelBtc: metrik(BT, -Infinity, HOL, 365), hol: metrik(BT, HOL, Infinity, 365), tum: metrik(BT, -Infinity, Infinity, 365), kaynak: 'data/bist/BTC_USD.json (Yahoo BTC-USD), Sharpe √365' };

  const dilimler = [['2018', Date.UTC(2018, 0, 1), Date.UTC(2019, 0, 1)], ['2021–23', Date.UTC(2021, 0, 1), Date.UTC(2024, 0, 1)]];
  const dilimOlc = e => Object.fromEntries(dilimler.map(([k, a, b]) => { const m = metrik(e, a, b); return [k, { toplam: m.toplam, maxDD: m.maxDD }]; }));
  const rDevler = G.map(x => { const e = x.usd; return e.slice(1).map((y, i) => y.v / e[i].v - 1); });
  const srListe = rDevler.map(r => N.gunlukSharpe(r));
  const xuYil = yillikGetiri(XU_U), ewYil = yillikGetiri(EW_U);

  const satirlar = T.map((x, i) => {
    const e = x.usd, gel = metrik(e, -Infinity, HOL), hol = metrik(e, HOL), tum = metrik(e);
    const gelDev = metrik(G[i].usd), tutarli = Math.abs(gelDev.cagr - gel.cagr) < 1e-12 && Math.abs(gelDev.maxDD - gel.maxDD) < 1e-12;
    const P = pUstun(e, XU_U), Pew = pUstun(e, EW_U);
    const k1 = gelDev.cagr > xu.gel.cagr && gelDev.cagr > ew.gel.cagr;
    const k2 = hol.cagr > xu.hol.cagr && hol.cagr > ew.hol.cagr;
    const k3 = tum.maxDD <= ddTavan, k4 = P >= 0.70;
    const gecti = k1 && k2 && k3 && k4;
    const tl = { gel: metrik(x.tl, -Infinity, HOL), hol: metrik(x.tl, HOL), tum: metrik(x.tl) };
    const s0 = S0[i].usd, s0m = { gel: metrik(s0, -Infinity, HOL), hol: metrik(s0, HOL), tum: metrik(s0), P: pUstun(s0, XU_U) };
    s0m.kriter = { k1: s0m.gel.cagr > xu.gel.cagr && s0m.gel.cagr > ew.gel.cagr, k2: s0m.hol.cagr > xu.hol.cagr && s0m.hol.cagr > ew.hol.cagr, k3: s0m.tum.maxDD <= ddTavan, k4: s0m.P >= 0.7 };
    const yb = YB[i].usd, ybm = { gel: metrik(yb, -Infinity, HOL), hol: metrik(yb, HOL), tum: metrik(yb) };
    const btcP = metrik(e, btcBas);
    const yil = yillikGetiri(e);
    return {
      no: x.no, ad: x.ad, gel: gelDev, gelTamKosu: gel, gelTutarli: tutarli, hol, tum, P, Pew,
      kriter: { k1, k2, k3, k4 }, gecti, hukum: gecti ? 'KABUL' : 'RED',
      fark: { gelXU: gelDev.cagr - xu.gel.cagr, gelEW: gelDev.cagr - ew.gel.cagr, holXU: hol.cagr - xu.hol.cagr, holEW: hol.cagr - ew.hol.cagr, dd: tum.maxDD - xu.tum.maxDD },
      yillik: yil, dilim: dilimOlc(e), tl, nakit0: s0m,
      bugunkuListe: { ...ybm, farkTum: ybm.tum.cagr - tum.cagr, farkGel: ybm.gel.cagr - gel.cagr, farkHol: ybm.hol.cagr - hol.cagr },
      bilgi: { tum: bilgiler(x.r, x.kayit), gel: bilgiler(x.r, x.kayit, -Infinity, HOL), hol: bilgiler(x.r, x.kayit, HOL) },
      dsr847: N.dsr(rDevler[i], srListe, 847), srGunlukGel: srListe[i],
      btcPencere: { bas: tarih(btcBas), cagr: btcP.cagr, maxDD: btcP.maxDD, sharpe: btcP.sharpe },
    };
  });

  // Son ay sonu M10 listesi (veri sonundan önceki son tam ay sonu)
  let dAy = D - 2; while (dAy > 0 && !ayGecis(dAy)) dAy--;
  const son = secim(dAy, evrenLikidite), fb = faberAcik(dAy);
  const lrsSon = { tarih: tarih(takvim[D - 1]), kapanis: XU030[D - 1], sma200: sma(XU030, D - 1, 200) }; lrsSon.acik = lrsSon.kapanis > lrsSon.sma200;
  const sonBugun = secim(dAy, evrenBugunku);

  const sonuc = {
    plan: 'PLAN-BIST-YENMEK.md (ön kayıt 68a7a56)', betik: 'scripts/bist-yenmek-momentum.js', uretim: new Date().toISOString(),
    donem: { bas: tarih(takvim[d0]), holdout: '2021-01-01', son: tarih(takvim[D - 1]) },
    faiz: { kaynak: faizJ.kaynak, not: faizJ.not, sonKayit: faizSeri[faizSeri.length - 1] },
    kontrol: kon, duzeltmeler,
    xu030: { ...xu, ddTavan, yillik: xuYil, dilim: dilimOlc(XU_U), tl: xuT, btcPencere: metrik(XU_U, btcBas) },
    ewBist30: { ...ew, yillik: ewYil, dilim: dilimOlc(EW_U), tl: ewT, Pxu: pUstun(EW_U, XU_U), bugunkuListe: { tum: metrik(EWb_U), gel: metrik(EWb_U, -Infinity, HOL), hol: metrik(EWb_U, HOL) }, btcPencere: metrik(EW_U, btcBas) },
    qqqAlTut: { ...qqqM, btcPencere: metrik(QQ, btcBas) }, btcAlTut: btcM,
    adaylar: satirlar,
    sonAyM10: { kararGunu: tarih(takvim[dAy]), evren: son.evren, aday: son.aday, liste: son.liste, bugunkuListeEvreni: sonBugun.liste, faber: fb, lrs: lrsSon },
    holdoutLog: log,
  };
  fs.writeFileSync(path.join(OUT, 'momentum-sonuc.json'), JSON.stringify(sonuc, null, 1));
  const md = rapor(sonuc);
  fs.writeFileSync(path.join(OUT, 'momentum-cikti.md'), md);
  console.log(md);
}

function rapor(R) {
  const L = [], p = s => L.push(s), X = R.xu030, E = R.ewBist30, ok = b => (b ? '✓' : '✗');
  p(`# BIST'te endeksi yenmek — 840 B-M10 · 841 B-M10-F · 843 B-LRS-2 M10 (ölçüm, USD)`);
  p(``);
  p(`Ön kayıt ${R.plan}. Betik \`${R.betik}\`. Dönem ${R.donem.bas} kapanışı → ${R.donem.son}; geliştirme → 2020-12-31, holdout ${R.donem.holdout} →. Simülasyon TL, USD = TL / USDTRY. Nakit TCMB politika faizi, kredi politika + %5 (takvim günü/365). Maliyet %0,15 tek yön.`);
  p(``);
  p(`## Kontrol — PLAN-BIST SONUÇ kıyasları yeniden üretildi`);
  p(`| | CAGR | gel | hol | MaxDD |`); p(`|---|---|---|---|---|`);
  for (const k of R.kontrol) p(`| ${k.ad} (ölçülen / PLAN-BIST) | ${yz(k.olculen.cagr)} / ${yz(k.beklenen.cagr)} | ${yz(k.olculen.gel)} / ${yz(k.beklenen.gel)} | ${yz(k.olculen.hol)} / ${yz(k.beklenen.hol)} | ${yz(k.olculen.dd)} / ${yz(k.beklenen.dd)} |`);
  p(``);
  p(`## Kabul tablosu (USD)`);
  p(`Kriterler: 1 gel CAGR > XU030 ve > EW · 2 hol CAGR > XU030 ve > EW · 3 tüm MaxDD ≤ XU030 MaxDD + 5 puan (${yz(R.xu030.ddTavan)}) · 4 P(> XU030) ≥ 0,70.`);
  p(`| # | aday | gel CAGR | hol CAGR | tüm CAGR | MaxDD | Sharpe | P(>XU030) | P(>EW) | 1 2 3 4 | hüküm |`);
  p(`|---|---|---|---|---|---|---|---|---|---|---|`);
  p(`| — | XU030 al-tut (fiyat) | ${yz(X.gel.cagr)} | ${yz(X.hol.cagr)} | ${yz(X.tum.cagr)} | ${yz(X.tum.maxDD)} | ${sy(X.tum.sharpe)} | — | — | — | kıyas |`);
  p(`| — | EW BIST30 al-tut | ${yz(E.gel.cagr)} | ${yz(E.hol.cagr)} | ${yz(E.tum.cagr)} | ${yz(E.tum.maxDD)} | ${sy(E.tum.sharpe)} | ${sy(E.Pxu)} | — | — | kıyas |`);
  for (const x of R.adaylar) p(`| ${x.no} | ${x.ad} | ${yz(x.gel.cagr)} | ${yz(x.hol.cagr)} | ${yz(x.tum.cagr)} | ${yz(x.tum.maxDD)} | ${sy(x.tum.sharpe)} | ${sy(x.P)} | ${sy(x.Pew)} | ${ok(x.kriter.k1)} ${ok(x.kriter.k2)} ${ok(x.kriter.k3)} ${ok(x.kriter.k4)} | **${x.hukum}** |`);
  p(`Farklar (yıllık puan): ${R.adaylar.map(x => `${x.no} gel XU ${pp(x.fark.gelXU)} / EW ${pp(x.fark.gelEW)}, hol XU ${pp(x.fark.holXU)} / EW ${pp(x.fark.holEW)}, DD ${pp(x.fark.dd)}`).join(' · ')}.`);
  p(`Geliştirme metrikleri 2020-12-31'de kesilen ayrı koşudan; tam koşuyla birebir aynı: ${R.adaylar.every(x => x.gelTutarli) ? 'evet' : 'HAYIR'}.`);
  p(``);
  p(`## Bilgi (hükmü bağlamaz)`);
  p(`| # | Sharpe gel / hol | 2018 (DD) | 2021–23 (DD) | ort. hisse | piyasada | ort. brüt | aylık devir | yeni isim/ay | işlem | finansman yıllık (özsermaye %) | DSR(847) |`);
  p(`|---|---|---|---|---|---|---|---|---|---|---|---|`);
  p(`| XU030 | ${sy(X.gel.sharpe)} / ${sy(X.hol.sharpe)} | ${yz(X.dilim['2018'].toplam)} (${yz(X.dilim['2018'].maxDD, 0)}) | ${yz(X.dilim['2021–23'].toplam)} (${yz(X.dilim['2021–23'].maxDD, 0)}) | — | %100 | 1,00 | — | — | — | — | — |`);
  p(`| EW | ${sy(E.gel.sharpe)} / ${sy(E.hol.sharpe)} | ${yz(E.dilim['2018'].toplam)} (${yz(E.dilim['2018'].maxDD, 0)}) | ${yz(E.dilim['2021–23'].toplam)} (${yz(E.dilim['2021–23'].maxDD, 0)}) | ~30 | %100 | 1,00 | — | — | — | — | — |`);
  for (const x of R.adaylar) { const b = x.bilgi.tum, d = x.dilim; p(`| ${x.no} | ${sy(x.gel.sharpe)} / ${sy(x.hol.sharpe)} | ${yz(d['2018'].toplam)} (${yz(d['2018'].maxDD, 0)}) | ${yz(d['2021–23'].toplam)} (${yz(d['2021–23'].maxDD, 0)}) | ${sy(b.ortHisse, 1)} | ${yz(b.piyasadaPay, 0)} | ${sy(b.ortBrut)} | ${yz(b.aylikDevir, 0)} | ${sy(b.aylikYeniIsim, 1)} | ${b.islem} | ${yz(b.finansmanYillikOz, 2)} | ${sy(x.dsr847)} |`); }
  p(`2021–23 toplam getiri (3 yıl birikimli). Aylık devir = ay içinde el değiştiren nominal / açılış özsermayesi (alım + satım). DSR: N = 847, σ(SR) yalnız bu 3 adayın günlük geliştirme Sharpe'larından → KABA.`);
  p(``);
  p(`### TL bazında (bilgi — enflasyonla şişik)`);
  p(`| | gel CAGR | hol CAGR | tüm CAGR | MaxDD |`); p(`|---|---|---|---|---|`);
  p(`| XU030 | ${yz(X.tl.gel.cagr)} | ${yz(X.tl.hol.cagr)} | ${yz(X.tl.tum.cagr)} | ${yz(X.tl.tum.maxDD)} |`);
  p(`| EW | ${yz(E.tl.gel.cagr)} | ${yz(E.tl.hol.cagr)} | ${yz(E.tl.tum.cagr)} | ${yz(E.tl.tum.maxDD)} |`);
  for (const x of R.adaylar) p(`| ${x.no} | ${yz(x.tl.gel.cagr)} | ${yz(x.tl.hol.cagr)} | ${yz(x.tl.tum.cagr)} | ${yz(x.tl.tum.maxDD)} |`);
  p(``);
  p(`### Nakit 0 duyarlılığı (USD; boşta nakit faiz kazanmaz, borç yine politika + %5)`);
  p(`| # | gel | hol | tüm | MaxDD | P(>XU030) | 1 2 3 4 |`); p(`|---|---|---|---|---|---|---|`);
  for (const x of R.adaylar) { const s = x.nakit0; p(`| ${x.no} | ${yz(s.gel.cagr)} | ${yz(s.hol.cagr)} | ${yz(s.tum.cagr)} | ${yz(s.tum.maxDD)} | ${sy(s.P)} | ${ok(s.kriter.k1)} ${ok(s.kriter.k2)} ${ok(s.kriter.k3)} ${ok(s.kriter.k4)} |`); }
  p(``);
  p(`### Bugünkü BIST 30 listesi evreni (hayatta kalma yanlısı, USD)`);
  p(`| | gel | hol | tüm | MaxDD | tüm fark (yanlı − PIT) |`); p(`|---|---|---|---|---|---|`);
  p(`| EW | ${yz(E.bugunkuListe.gel.cagr)} | ${yz(E.bugunkuListe.hol.cagr)} | ${yz(E.bugunkuListe.tum.cagr)} | ${yz(E.bugunkuListe.tum.maxDD)} | ${pp(E.bugunkuListe.tum.cagr - E.tum.cagr)} |`);
  for (const x of R.adaylar) { const y = x.bugunkuListe; p(`| ${x.no} | ${yz(y.gel.cagr)} | ${yz(y.hol.cagr)} | ${yz(y.tum.cagr)} | ${yz(y.tum.maxDD)} | ${pp(y.farkTum)} |`); }
  p(``);
  const Q = R.qqqAlTut, B = R.btcAlTut;
  p(`### QQQ ve BTC al-tut (USD, bilgi)`);
  p(`QQQ (${Q.kaynak}): gel ${yz(Q.gel.cagr)} · hol ${yz(Q.hol.cagr)} · tüm ${yz(Q.tum.cagr)} · DD ${yz(Q.tum.maxDD)} · Sh ${sy(Q.tum.sharpe)}.`);
  p(`BTC (${B.kaynak}, ${B.bas} →): ${B.bas} → 2020 ${yz(B.gelBtc.cagr)} · hol ${yz(B.hol.cagr)} (DD ${yz(B.hol.maxDD)}) · tüm ${yz(B.tum.cagr)} · DD ${yz(B.tum.maxDD)} · Sh ${sy(B.tum.sharpe)}.`);
  p(`BTC penceresinde (${B.bas} →): QQQ ${yz(Q.btcPencere.cagr)} / DD ${yz(Q.btcPencere.maxDD)}; XU030 ${yz(X.btcPencere.cagr)} / ${yz(X.btcPencere.maxDD)}; EW ${yz(E.btcPencere.cagr)} / ${yz(E.btcPencere.maxDD)}; ${R.adaylar.map(x => `${x.no} ${yz(x.btcPencere.cagr)} / ${yz(x.btcPencere.maxDD)}`).join('; ')}.`);
  p(``);
  p(`### Yıllık getiriler (USD)`);
  const yillar = Object.keys(X.yillik);
  p(`| yıl | XU030 | EW | ${R.adaylar.map(x => x.no).join(' | ')} |`); p(`|---|---|---|${R.adaylar.map(() => '---').join('|')}|`);
  for (const y of yillar) p(`| ${y} | ${yz(X.yillik[y])} | ${yz(E.yillik[y])} | ${R.adaylar.map(x => yz(x.yillik[y])).join(' | ')} |`);
  p(``);
  const S = R.sonAyM10;
  p(`## Son ay sonu M10 listesi (karar ${S.kararGunu} kapanışı; evren ${S.evren}, uygun aday ${S.aday})`);
  p(`| # | sembol | 12-1 getiri (TL, düzeltilmiş) |`); p(`|---|---|---|`);
  S.liste.forEach((x, i) => p(`| ${i + 1} | ${x.s} | ${yz(x.p)} |`));
  p(`Bugünkü liste evreniyle aynı gün: ${S.bugunkuListeEvreni.map(x => x.s).join(' ')}.`);
  p(`Faber (841): XU030 ay sonu ${sy(S.faber.kapanis, 0)} vs 10 ay ort. ${sy(S.faber.ort10, 0)} → ${S.faber.acik ? 'AÇIK (M10)' : 'KAPALI (nakit)'}. LRS (843) ${S.lrs.tarih}: XU030 ${sy(S.lrs.kapanis, 0)} vs SMA200 ${sy(S.lrs.sma200, 0)} → ${S.lrs.acik ? 'AÇIK (×2)' : 'KAPALI'}. (Liste yalnız bilgi; kabul ürünü değildir — hiçbir aday geçmediyse.)`);
  p(``);
  p(`## Yorumlar (ön kayıtta açık olmayan noktalar, temkinli seçim)`);
  p(`1. 12-1 = t−12 ay sonu → t−1 ay sonu düzeltilmiş kapanışı (TL). "≥ 13 ay geçmiş" = ilk çubuk t−13. ayın son işlem gününde ya da önce; t−12 ve t−1 kapanışları kendi aylarında olmalı (qqq-momentum.js ile aynı). Aday ayrıca PIT evrende (≥ 252 işlem günü, son 10 günde işlem, 63 gün medyan ciro top-30). < 10 uygun aday olursa kalan pay nakit.`);
  p(`2. Faiz zamanlaması bist-strateji.js B2f ile aynı: d−1 oranı × takvim günü / 365, d açılış işlemlerinden sonraki nakde. Kredi faizi aynı formülle (politika + %5) negatif nakde. Faiz serisi ${R.faiz.sonKayit.tarih} %${(R.faiz.sonKayit.oran * 100).toFixed(1)} ile bitiyor → sonrası ileri taşındı; stopajsız → nakit getirisi üst sınır. 2016-11 → 2018-05 fiili fonlama politika faizinin üstündeydi (kaynak notu) → o dönem kredi maliyeti eksik tahmin.`);
  p(`3. 841 Faber: o ayın kapanışı dahil son 10 ay sonu XU030 ortalaması; kapanış < ortalama → ertesi ay tamamen nakit. 843: XU030 gün sonu > SMA200 (o gün dahil, ileri taşınmış takvim serisi; bist-strateji B3 ile aynı) iken M10 sepeti her biri 2/10; sepet ay sonunda seçilir, filtre açılınca o ayın sepeti alınır, ay içinde dengeleme yok (qqq-momentum 833 ile aynı); filtre kapanınca ertesi açılışta tamamen nakit.`);
  p(`4. EW BIST30 kıyası PLAN-BIST tanımıyla (nakit/borç faizsiz) — yeniden üretim için; temettü dahil olduğundan XU030'dan sert kıyas.`);
  p(`5. Nakit 0 duyarlılığında borç faizi korunur (temkinli). Bugünkü liste farkı yalnız bilgi. QQQ temettülü (adjclose), XU030 temettüsüz.`);
  p(`6. Kabul eşitsizlikleri: getiri kriterleri katı ">" (ön kayıt), DD "≤".`);
  p(``);
  p(`## Holdout logu`);
  for (const x of R.holdoutLog) p(`- ${x.kip} ${x.zaman} adaylar ${x.adaylar.join(', ')} (tekrar ${x.tekrar})`);
  return L.join('\n') + '\n';
}

ana();
