#!/usr/bin/env node
/**
 * DİKKAT L/S — PLAN-DIKKAT-LS.md (ön kayıt 40a4326) ölçüm betiği. Piyasa-nötr (dolar + BTC-beta) L/S ve olay kolları.
 *
 *   node scripts/dikkat-ls.js veri            # = dikkat-ls-veri.js kimlik + seri (fiyat okumaz)
 *   node scripts/dikkat-ls.js tablo           # = dikkat-ls-veri.js tablo (fiyatsız, ayrı commit)
 *   node scripts/dikkat-ls.js gel [--kol N]   # Yol A geliştirme (yön süzgeci + rapor); holdout'a DOKUNMAZ
 *   node scripts/dikkat-ls.js hold --ac <no>  # kol başına BİR KEZ holdout (kayitlar/dikkat-ls/acilan.json; ikinci açılış reddedilir)
 *   node scripts/dikkat-ls.js holm-a          # A parçası Holm'u, yedi p belli olunca (ya da 2027-03-31'den sonra 787 p = 1) BİR KEZ
 *   node scripts/dikkat-ls.js b               # Yol B — §3.3 mührü (t0 + 375 g ve 780/781/782 hükümleri) sağlanmadan REDDEDER
 *   node scripts/dikkat-ls.js selftest        # = scripts/dikkat-ls-selftest.js
 *
 * Bilgi zamanı (§1.1): fiyat/hacim/beta F−1 kapanışına kadar (olay kollarında giriş günü), temel veriler F−2'de biten pencereler.
 * Veri yükleyici her şeyi `son` (dışlayıcı gün) ÖNCESİYLE sınırlar; öz test kesim sonrası veriyi BOZARAK sonucun değişmediğini kanıtlar.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DV = require('./dikkat-ls-veri.js');
const OL = require('../lib/risk/olcum.js');

const ROOT = path.join(__dirname, '..');
const GUN = 864e5;
const gn = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / GUN);   // gün numarası
const gs = (g) => new Date(g * GUN).toISOString().slice(0, 10);
const KAYIT = process.env.DLS_KAYIT || DV.KAYIT;
const DIZIN = DV.DIZIN;

/* ═══════════ SABİTLER (ön kayıt) ═══════════ */
const TAKER = 0.0005;
const BTC = 'BTC';
const ENDEKS = new Set(['BTCDOM', 'DEFI', 'FOOTBALL', 'BLUEBIRD']);
const KOLLAR = {
  874: { tip: 'olay', ad: 'A1 Monitoring Tag SHORT', kaynak: 'mt' },
  785: { tip: 'ls', ad: 'A2 P/F', sinyal: 'pf', yuksekLong: false },
  786: { tip: 'ls', ad: 'A2 P/S', sinyal: 'ps', yuksekLong: false },
  875: { tip: 'ls', ad: 'A2 ücret 30 g büyümesi', sinyal: 'ucret', yuksekLong: true },
  876: { tip: 'ls', ad: 'A2 TVL 30 g değişimi', sinyal: 'tvl', yuksekLong: true },
  877: { tip: 'olay', ad: 'A3 hack sonrası SHORT', kaynak: 'hack' },
  787: { tip: 'ls', ad: 'A4 GitHub 90 g commit/katkıcı', sinyal: 'github', yuksekLong: true },
};
const A_KOLLAR = [874, 785, 786, 875, 876, 877, 787];
const ALFA = 0.05, ALFA_A = 0.05 * 7 / 11, ALFA_B = 0.05 * 4 / 11;
const SON_787 = gn('2027-03-31');
const aylar = (bas, son) => { const o = []; let d = new Date(bas * GUN); while (Math.floor(d.getTime() / GUN) <= son) { o.push(Math.floor(d.getTime() / GUN)); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); } return o; };
const DONEM = {
  ls: {
    gel: { F: aylar(gn('2021-03-01'), gn('2023-12-01')), son: gn('2023-12-31') },
    hold: { F: aylar(gn('2024-01-01'), gn('2026-09-01')), son: gn('2026-09-30') },
  },
  874: { gel: { olayBas: gn('2023-07-26'), olaySon: gn('2023-12-31'), bas: gn('2023-07-26'), son: gn('2023-12-31') },
    hold: { olayBas: gn('2024-01-01'), olaySon: gn('2026-08-31'), bas: gn('2024-01-01'), son: gn('2026-09-30') } },
  877: { gel: { olayBas: gn('2021-01-01'), olaySon: gn('2023-12-31'), bas: gn('2021-01-01'), son: gn('2023-12-31') },
    hold: { olayBas: gn('2024-01-01'), olaySon: gn('2026-08-31'), bas: gn('2024-01-01'), son: gn('2026-09-30') } },
};
const donem = (kol, tur) => (KOLLAR[kol].tip === 'ls' ? DONEM.ls[tur] : DONEM[kol][tur]);
/** Veri kesimi (dışlayıcı gün): dönem sonu + 1. */
const kesim = (kol, tur) => donem(kol, tur).son + 1;

/* ═══════════ YARDIMCILAR ═══════════ */
const ort = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = ort(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
function medyan(a) { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
function yuzdelikSira(a, q) { const s = a.slice().sort((x, y) => x - y); const h = (s.length - 1) * q, i = Math.floor(h); return s[i] + (h - i) * ((s[i + 1] ?? s[i]) - s[i]); }
/** Kayma dilimi (§1.6) — 30 g medyan USDT hacmi. 1 M $ altı (yalnız çıkış günü) 50 bp. */
const kademe = (med) => (med >= 100e6 ? 0.0002 : med >= 20e6 ? 0.0005 : med >= 5e6 ? 0.001 : med >= 1e6 ? 0.002 : 0.005);
/** Blume küçültmesi + [0; 3] (§1.5). */
const kucult = (b) => Math.min(3, Math.max(0, 0.67 * b + 0.33));

/* ═══════════ VERİ KATMANI ═══════════ */
/** Seri erişimleri (V: { gun0, seri: Map(ham → {c,h,l,v}) }). Eksik = NaN. */
function satir(V, ham, g) { const s = V.seri.get(ham); const i = g - V.gun0; if (!s || i < 0 || i >= s.c.length || !(s.c[i] > 0)) return null; return { c: s.c[i], h: s.h[i], l: s.l[i], v: s.v[i] }; }
function hacimli(V, ham, g) { const r = satir(V, ham, g); return !!(r && r.v > 0); }
function usdHacim(V, ham, g) { const r = satir(V, ham, g); return r && r.v > 0 ? r.v * r.c : 0; }
/** gSon dahil son 30 takvim gününün USDT hacmi medyanı (eksik/hacimsiz gün = 0). */
function med30(V, ham, gSon) { const a = []; for (let g = gSon - 29; g <= gSon; g++) a.push(usdHacim(V, ham, g)); return medyan(a); }
/** Son geçerli kapanış ≤ g (bayat satır/eksik → önceki). */
function sonKapanis(V, ham, g) { for (let k = g; k >= g - 400; k--) { const r = satir(V, ham, k); if (r && r.v > 0) return r.c; } return NaN; }
/** Koşular (§1.2): hacimli günler; ardışık iki hacimli gün arasında ≥ 30 g boşluk → yeni koşu. */
function kosular(V, ham) {
  V._kosu = V._kosu || new Map();
  if (V._kosu.has(ham)) return V._kosu.get(ham);
  const s = V.seri.get(ham), out = [];
  if (s) { let bas = null, onceki = null; for (let i = 0; i < s.c.length; i++) { if (!(s.v[i] > 0 && s.c[i] > 0)) continue; const g = V.gun0 + i; if (onceki == null || g - onceki - 1 >= 30) { if (bas != null) out.push({ bas, son: onceki }); bas = g; } onceki = g; } if (bas != null) out.push({ bas, son: onceki }); }
  V._kosu.set(ham, out);
  return out;
}
/** g gününü (ya da öncesindeki son hacimli günü) içeren koşu → { bas, no }. */
function kosu(V, ham, g) { const K = kosular(V, ham); let r = null; for (let i = 0; i < K.length; i++) { if (K[i].bas <= g) r = { bas: K[i].bas, no: i }; else break; } return r; }
/** β_s (§1.5): gSon ile biten 60 günlük log getiri, BTC perp'e EKK; < 40 ortak hacimli gün → β̂ = 1. */
function beta(V, ham, gSon) {
  const x = [], y = [];
  for (let g = gSon - 59; g <= gSon; g++) {
    const a = satir(V, ham, g), a0 = satir(V, ham, g - 1), b = satir(V, BTC, g), b0 = satir(V, BTC, g - 1);
    if (!(a && a0 && a.v > 0 && a0.v > 0 && b && b0)) continue;
    y.push(Math.log(a.c / a0.c)); x.push(Math.log(b.c / b0.c));
  }
  let bh = 1;
  if (x.length >= 40) { const mx = ort(x), my = ort(y); let sxy = 0, sxx = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; } if (sxx > 0) bh = sxy / sxx; }
  return { ham: bh, s: kucult(bh), n: x.length };
}
/** Funding ödemeleri g günü içinde, (tGiris, tCikis) açık aralıkta (§1.6). Zaman damgası en yakın dakikaya yuvarlanır. */
function fundingGun(V, ham, g, tGiris, tCikis) {
  const f = V.fon(ham); if (!f || !f.t.length) return { oranlar: [], kayit: false };
  const a = g * GUN, b = (g + 1) * GUN;
  let lo = 0, hi = f.t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (f.t[m] < a) lo = m + 1; else hi = m; }
  const out = []; let kayit = false;
  for (let i = lo; i < f.t.length && f.t[i] < b; i++) { kayit = true; if (f.t[i] > tGiris && f.t[i] < tCikis) out.push(f.r[i]); }
  return { oranlar: out, kayit };
}
/** Hariç (§1.1) — HEAD listeleriyle. → neden | null. */
function haricYap(H, stabilTaban, stabilCg = new Set(), geckoIdOf = () => null) {
  const kald = H.HARIC_V1.kaldiracSonek;
  return (ham, tabanlar) => {
    const { taban } = DV.perpTaban(ham);
    if (ham === BTC) return 'btc';
    if (H.STABIL.test(ham + '/')) return 'stabil';
    if (H.HARIC_V1.stablecoin.includes(taban)) return 'stabil';
    { const g = geckoIdOf(ham); if (g ? stabilCg.has(g) : stabilTaban.has(taban)) return 'stabil'; }   // EK-1 (c) 3: eşlemeli anahtar gecko_id ile, eşlemesiz taban ile
    if (H.HARIC_V1.emtiaFiat.includes(taban) || /^(XAU|XAG|XPT|XPD)$/.test(taban)) return 'emtia-fiat';
    if (ENDEKS.has(ham)) return 'endeks';
    if (H.tradfi.has(ham)) return 'tradfi';
    if (H.HARIC_V1.wrapped.includes(taban)) return 'wrapped';
    if (H.HARIC_V1.lst.includes(taban)) return 'lst';
    for (const s of kald) if (taban.length > s.length + 1 && taban.endsWith(s) && tabanlar && tabanlar.has(taban.slice(0, -s.length))) return 'kaldiracli';
    return null;
  };
}

/** EK-1 (c) 2: örtü dosyası tablolar.json `ortu` SHA'sıyla tutmalı; kayıtsız ya da farklıysa DUR. */
function ortuDenetle(T, ham, yol) {
  const h = T.ortu && T.ortu[ham];
  if (!h) throw new Error(`örtü dosyası tablolar.json'da kayıtlı değil: ${ham} — DUR`);
  if (DV.sha(fs.readFileSync(yol)) !== h) throw new Error(`örtü SHA tutmuyor: ${ham} — DUR`);
}
/** Tablolar: SHA denetimi (§1.10 madde 1) → içerik. */
function tablolarOku() {
  const T = JSON.parse(fs.readFileSync(path.join(KAYIT, 'tablolar.json'), 'utf8'));
  const out = {};
  for (const [ad, h] of Object.entries(T.tablolar)) {
    const b = fs.readFileSync(path.join(KAYIT, ad));
    if (DV.sha(b) !== h) throw new Error(`tablo SHA tutmuyor: ${ad} — DUR (§1.10)`);
    out[ad] = JSON.parse(b.toString('utf8'));
  }
  for (const [rel, h] of Object.entries(T.haric)) if (DV.HARIC_SHA[rel] !== h) throw new Error('hariç SHA tablosu betikle uyuşmuyor: ' + rel);
  DV.haricKumeleri();   // git'teki HEAD içerikleri sabit SHA'yla bulunmazsa durur
  for (const ham of Object.keys(T.ortu || {})) if (!fs.existsSync(path.join(DIZIN, 'ortu', ham + '.json'))) throw new Error(`kayıtlı örtü dosyası yok: ${ham} — DUR`);
  return { T, ...out };
}

/** Gerçek veri. son = dışlayıcı gün numarası; tüm seriler < son. */
function gercekVeri(son, { semboller: sadece } = {}) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(process.env.DLS_DB || path.join(ROOT, 'data', 'market.db'), { readOnly: true });
  const TB = tablolarOku();
  const H = DV.haricKumeleri();
  const gun0 = gn('2019-09-01'), n = son - gun0;
  const semb = db.prepare("SELECT DISTINCT symbol FROM candles WHERE venue='binance' AND market='perp' AND timeframe='1d'").all().map(r => r.symbol).filter(s => /^[A-Z0-9]+\/USDT:USDT$/.test(s)).map(s => s.split('/')[0]).sort();
  const st = db.prepare("SELECT time, high, low, close, volume FROM candles WHERE venue='binance' AND market='perp' AND timeframe='1d' AND symbol=? AND time < ? ORDER BY time");
  const seri = new Map();
  let ortuSay = 0;
  for (const ham of semb) {
    if (sadece && !sadece.has(ham) && ham !== BTC) continue;
    const c = new Float64Array(n).fill(NaN), h = new Float64Array(n).fill(NaN), l = new Float64Array(n).fill(NaN), v = new Float64Array(n).fill(NaN);
    for (const r of st.iterate(ham + '/USDT:USDT', son * GUN)) { const i = Math.floor(r.time / GUN) - gun0; if (i < 0 || i >= n) continue; c[i] = r.close; h[i] = r.high; l[i] = r.low; v[i] = r.volume; }
    const op = path.join(DIZIN, 'ortu', ham + '.json');
    if (fs.existsSync(op)) ortuDenetle(TB.T, ham, op);   // EK-1 (c) 2: çok sembollü boşluk günleri örtüsü (yalnız market.db'de satır yoksa)
    if (fs.existsSync(op)) for (const r of JSON.parse(fs.readFileSync(op, 'utf8')).satirlar) { if (r[0] >= son * GUN) continue; const i = Math.floor(r[0] / GUN) - gun0; if (i < 0 || i >= n || c[i] > 0) continue; c[i] = r[4]; h[i] = r[2]; l[i] = r[3]; v[i] = r[5]; ortuSay++; }
    seri.set(ham, { c, h, l, v });
  }
  const fst = db.prepare("SELECT time, rate FROM funding WHERE venue='binance' AND market='perp' AND symbol=? AND time < ? ORDER BY time");
  const fonC = new Map();
  const fon = (ham) => {
    if (fonC.has(ham)) return fonC.get(ham);
    const rows = fst.all(ham + '/USDT:USDT', son * GUN);
    const t = new Float64Array(rows.length), r = new Float64Array(rows.length);
    rows.forEach((x, i) => { t[i] = Math.round(x.time / 60e3) * 60e3; r[i] = x.rate; });
    const o = { t, r }; fonC.set(ham, o); return o;
  };
  const irx = JSON.parse(fs.readFileSync(process.env.DLS_IRX || path.join(ROOT, 'data', 'portfoy', 'yahoo', '_IRX.json'), 'utf8')).gunler
    .filter(q => q.c != null && q.c >= 0 && q.t < son * GUN).map(q => [Math.floor(q.t / GUN), q.c / 100]).sort((a, b) => a[0] - b[0]);
  const y = yYap(irx);
  const temelC = new Map();
  const temel = (e) => {
    const k = e.geckoId; if (temelC.has(k)) return temelC.get(k);
    const o = temelYukle(e, son); temelC.set(k, o); return o;
  };
  const E = TB['eslesme.json'];
  const stabilTaban = new Set(E.stabilTabanlar || []);
  const tabanlar = new Set(semb.map(s => DV.perpTaban(s).taban));
  const esMap = new Map(E.satirlar.map(r => [r.ham, r]));
  const geckoIdOf = (ham) => { const r = esMap.get(ham); return r && r.geckoId && (r.durum === 'gecerli' || r.cmDenetim === 'red') ? r.geckoId : null; };
  const hf = haricYap(H, stabilTaban, new Set(E.stabilGeckoIdler || []), geckoIdOf);
  const delist = new Map();
  for (const d of TB['k161-perp-delist.json'].duyurular) if (d.tau < son * GUN) for (const p of d.perpler) { const ham = p.replace(/USDT$/, ''); if (!delist.has(ham)) delist.set(ham, []); delist.get(ham).push(d.tau); }
  return {
    gun0, son, semboller: [...seri.keys()], seri, fon, y, temel,
    eslesme: new Map(E.satirlar.map(r => [r.ham, r])),
    delist, mt: TB['a1-monitoring-tag.json'].olaylar.filter(o => o.olay && o.tau < son * GUN), hack: TB['a3-hack.json'].satirlar.filter(h => gn(h.D) < son),
    haric: (ham) => hf(ham, tabanlar), tablolar: TB.T, ortuSay,
    tradfiSupheli: (ham) => /^(SPX|NDX|DJI|DAX|NIKKEI|US500|US100|US30)/.test(ham) || ['B', 'X', 'ON'].some(e => ham.endsWith(e) && ham.length > e.length + 1 && H.tradfi.has(ham.slice(0, -e.length))),
    github: null,
  };
}
function yYap(irx) {
  const t = irx.map(x => x[0]);
  const cache = new Map();
  return (g) => { if (cache.has(g)) return cache.get(g); let lo = 0, hi = t.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (t[m] <= g - 1) { r = m; lo = m + 1; } else hi = m - 1; } const v = r >= 0 ? irx[r][1] / 365 : 0; cache.set(g, v); return v; };
}
/** DefiLlama ücret/gelir/TVL + CM (önbellekten), son'dan önceki günler. */
function temelYukle(e, son) {
  const sl = e.birim.tip === 'toplam' ? e.birim.sluglar : [e.birim.slug];
  const oku = (rel) => { const p = path.join(DV.HAM, rel); if (!fs.existsSync(p)) return null; const j = JSON.parse(fs.readFileSync(p, 'utf8')); return j.yok ? null : j; };
  const topla = (tip) => {
    const m = new Map(); let var_ = false;
    for (const s of sl) { const j = oku(`seri/llama-${tip}/${s}.json`); if (!j) continue; var_ = true; for (const [ts, v] of j.chart) { const g = Math.floor(ts * 1000 / GUN); if (g >= son || !Number.isFinite(+v)) continue; m.set(g, (m.get(g) || 0) + +v); } }
    return var_ ? m : null;
  };
  const tvl = new Map(); let tvlBas = null, tvlVar = false;
  for (const s of sl) { const j = oku(`seri/llama-tvl/${s}.json`); if (!j) continue; tvlVar = true; for (const [ts, v] of j.tvl) { const g = Math.floor(ts * 1000 / GUN); if (tvlBas == null || g < tvlBas) tvlBas = g; if (g >= son || !Number.isFinite(+v)) continue; tvl.set(g, (tvl.get(g) || 0) + +v); } }
  let cm = null;
  if (e.cm) { const j = oku(`seri/cm/${e.cm}.json`); if (j) { cm = new Map(); for (const [t, v] of j.seri) { const g = Math.floor(t / GUN); if (g < son && Number.isFinite(v)) cm.set(g, v); } } }
  return { fee: topla('dailyFees'), rev: topla('dailyRevenue'), tvl: tvlVar ? tvl : null, tvlBas, cm };
}

/* ═══════════ EVREN + SİNYAL ═══════════ */
/** §1.1: F'de evrende mi (bilgi günü d = F−1; olaylarda d = giriş günü, yaşRef = d). */
function evrendeMi(V, ham, d, esik, yasRef) {
  const n = V.haric(ham); if (n) return { ok: false, neden: 'haric:' + n };
  if (!hacimli(V, ham, d)) { const bilinen = kosular(V, ham).filter(k => k.bas <= d); return { ok: false, neden: !bilinen.length ? 'henuz-listelenmemis' : 'delist-edilmis/hacimsiz' }; }   // etiket yalnız d'ye kadar bilinen koşulardan
  const k = kosu(V, ham, d);
  if (!k || k.bas > yasRef - 60) return { ok: false, neden: 'yas' };
  const m = med30(V, ham, d);
  if (!(m >= esik)) return { ok: false, neden: 'likidite' };
  return { ok: true, med: m, kosu: k };
}
function pencereTop(map, a, b) { let s = 0, eksik = 0; for (let g = a; g <= b; g++) { const v = map.get(g); if (v === undefined) eksik++; else s += v; } return { s, eksik }; }
function tvlDeger(map, g) { for (let k = g; k >= g - 3; k--) { const v = map.get(k); if (v !== undefined) return v; } return undefined; }
/** Kol sinyali (§2.2, §2.4) → sayı | { yok: neden }. */
function sinyal(V, kol, ham, F, ayar, kos) {
  const e = V.eslesme.get(ham);
  if (!e || e.durum !== 'gecerli') return { yok: 'eslesme' };
  if (kos.no !== 0) return { yok: 'yeniden-kullanim' };
  if (ayar.zayifHaric && e.zayif) return { yok: 'zayif' };
  if (ayar.cmYokHaric && e.cmDenetim === 'cm-yok') return { yok: 'cm-yok-haric' };
  const K = KOLLAR[kol];
  if (K.sinyal === 'github') return { yok: 'jeton-yok' };
  const T = V.temel(e);
  if (!birimBiliniyor(e, F)) return { yok: 'listedAt' };
  if (ayar.adaptor && !ayar.adaptor(e, F, K.sinyal)) return { yok: 'adaptor' };
  if (K.sinyal === 'pf' || K.sinyal === 'ps') {
    const m = K.sinyal === 'pf' ? T.fee : T.rev; if (!m) return { yok: 'seri-yok' };
    const w = pencereTop(m, F - 31, F - 2); if (w.eksik > 5) return { yok: 'eksik-gun' };
    if (!(w.s > 0)) return { yok: 'ucret<=0' };
    const cm = T.cm && T.cm.get(F - 2); if (!(cm > 0)) return { yok: 'cm-yok' };
    return cm / (w.s * 365 / 30);
  }
  if (K.sinyal === 'ucret') {
    if (!T.fee) return { yok: 'seri-yok' };
    const a = pencereTop(T.fee, F - 31, F - 2), b = pencereTop(T.fee, F - 61, F - 32);
    if (a.eksik > 5 || b.eksik > 5) return { yok: 'eksik-gun' };
    if (!(a.s > 0 && b.s > 0)) return { yok: 'ucret<=0' };
    return Math.log(a.s / b.s);
  }
  if (K.sinyal === 'tvl') {
    if (!T.tvl) return { yok: 'seri-yok' };
    const a = tvlDeger(T.tvl, F - 2), b = tvlDeger(T.tvl, F - 32);
    if (!(a > 0 && b > 0)) return { yok: 'tvl-yok' };
    return Math.log(a / b);
  }
  throw new Error('bilinmeyen sinyal');
}
/**
 * EK-1 (a) §2.2: birim F'de bilinir ⇔ üyelerinden EN AZ BİRİ için (listedAt ≤ F − 60 g) ya da (listedAt yok ve o üyenin TVL serisi
 * ≤ 2020-12-31'de başlıyor).
 */
function birimBiliniyor(e, F) {
  return (e.uyeler || []).some(u => (u.listedAt != null ? u.listedAt * 1000 <= (F - 60) * GUN : (u.tvlBas != null && gn(u.tvlBas) <= gn('2020-12-31'))));
}
/** N → bacak sayısı (§1.3). */
const bacak = (N) => (N >= 25 ? Math.floor(N / 5) : N >= 9 ? Math.floor(N / 3) : 0);
/** Sıralama: sinyal (yön), eşitlikte sembol alfabetik. → { long, short } */
function bacaklar(liste, n, yuksekLong) {
  const art = liste.slice().sort((a, b) => a.s - b.s || (a.ham < b.ham ? -1 : a.ham > b.ham ? 1 : 0));
  const dus = liste.slice().sort((a, b) => b.s - a.s || (a.ham < b.ham ? -1 : a.ham > b.ham ? 1 : 0));
  return yuksekLong ? { long: dus.slice(0, n), short: art.slice(0, n) } : { long: art.slice(0, n), short: dus.slice(0, n) };
}
/** Delist duyurusu (bu koşuda, yürütme gününden önceki bir günde) var mı? */
function delistSonrasi(V, ham, kosuBas, yurutmeGun) { const a = V.delist.get(ham); if (!a) return false; return a.some(t => t >= kosuBas * GUN && Math.floor(t / GUN) < yurutmeGun); }

/* ═══════════ L/S SİMÜLASYONU (§1.3, §1.6–§1.8) ═══════════ */
function lsKos(V, kol, Fler, gSon, ayar = {}) {
  const kc = ayar.kaymaCarpan || 1;
  const kayit = [];
  let E = 1;
  const S = { evrenAd: new Set(), aylar: [], bosAy: 0, pozAy: 0, tasfiye: 0, delist: 0, delistPnl: 0, funding: 0, maliyet: 0, fonEksikGun: 0, kapasite: [], devir: [], kayip: {}, karakter: [], acAyniGun: 0 };
  let oncekiW = new Map();
  for (let k = 0; k < Fler.length; k++) {
    const F = Fler[k], Fn = k + 1 < Fler.length ? Fler[k + 1] : gSon + 1, d = F - 1;
    const liste = [];
    let evrenSay = 0;
    const kr = ayar.karar ? { F: gs(F), E, evren: [] } : null;   // karar kaydı (kesme testi)
    for (const ham of V.semboller) {
      if (ham === BTC) continue;
      const ev = evrendeMi(V, ham, d, 5e6, F); if (!ev.ok) continue;
      evrenSay++; S.evrenAd.add(ham);
      const s = sinyal(V, kol, ham, F, ayar, ev.kosu);
      if (kr) kr.evren.push([ham, ev.med, typeof s === 'number' ? s : s.yok]);
      if (typeof s !== 'number' || !Number.isFinite(s)) { S.kayip[s.yok] = (S.kayip[s.yok] || 0) + 1; continue; }
      liste.push({ ham, s, med: ev.med, kosuBas: ev.kosu.bas });
    }
    const N = liste.length, n = bacak(N);
    const ay = { F: gs(F), evren: evrenSay, N, n };
    S.aylar.push(ay);
    if (!n) {
      if (kr) { kr.n = 0; ayar.karar.push(kr); }
      if (ayar.kararDur === F) return { kayit, S };
      S.bosAy++;
      for (let g = F; g < Fn; g++) { const y = V.y(g); E *= 1 + y; kayit.push({ g, E, y, acik: 0 }); }
      oncekiW = new Map();
      continue;
    }
    S.pozAy++;
    const { long, short } = bacaklar(liste, n, KOLLAR[kol].yuksekLong);
    const w = Math.min(1 / n, 0.10);
    const poz = [];
    for (const [yon, grup] of [[1, long], [-1, short]]) for (const x of grup) {
      const P0 = satir(V, x.ham, d).c, b = beta(V, x.ham, d);
      poz.push({ ham: x.ham, yon, q: yon * w * E / P0, P: P0, P0, kay: kc * kademe(x.med), med: x.med, beta: b.s, kosuBas: x.kosuBas, acik: true, pnl: 0 });
    }
    const bL = ort(poz.filter(p => p.yon > 0).map(p => p.beta)), bS = ort(poz.filter(p => p.yon < 0).map(p => p.beta));
    const Hn = -(bL - bS) * n * w * E, Pb = satir(V, BTC, d).c;
    const btc = { ham: BTC, q: Hn / Pb, P: Pb, kay: kc * 0.0002, acik: true, btc: true };
    const G = 2 * n * w + Math.abs(Hn) / E, m = Math.min(1, G / 2);
    if (kr) { Object.assign(kr, { n, w, long: long.map(x => x.ham), short: short.map(x => x.ham), poz: poz.map(p => [p.ham, p.q, p.P0, p.beta, p.kay, p.med]), Hn, Pb, m }); ayar.karar.push(kr); }
    if (ayar.kararDur === F) return { kayit, S };
    let B = m * E, nakit = (1 - m) * E;
    let maliyet = 0;
    for (const p of poz) maliyet += Math.abs(p.q * p.P) * (TAKER + p.kay);
    maliyet += Math.abs(Hn) * (TAKER + btc.kay);
    // kapasite (§7): bacak coin'lerinin 30 g medyan hacminin %1'i
    S.kapasite.push(Math.min(...poz.map(p => 0.01 * p.med / w)));
    // devir (§7): aylık Σ|Δw|/2
    const yeniW = new Map(poz.map(p => [p.ham, p.yon * w]));
    let dv = 0; for (const [h, x] of yeniW) dv += Math.abs(x - (oncekiW.get(h) || 0)); for (const [h, x] of oncekiW) if (!yeniW.has(h)) dv += Math.abs(x);
    S.devir.push(dv / 2); oncekiW = yeniW;
    if (ayar.karakter) S.karakter.push(ayar.karakter(V, F, poz));
    // F günü mumu yok / hacim 0 → F−1 kapanışından aç-kapa (iki yön maliyet; çıkış kayması §1.6 hacimsiz gün kuralı)
    for (const p of poz) if (!hacimli(V, p.ham, F)) {
      maliyet += Math.abs(p.q * p.P) * (TAKER + Math.max(p.kay, kc * kademe(med30(V, p.ham, F)), kc * 0.005));
      p.acik = false; S.acAyniGun++; S.delist++;
    }
    B -= maliyet; S.maliyet += maliyet;
    let tasfiye = false;
    const tG = F * GUN, tC = Fn * GUN;
    for (let g = F; g < Fn; g++) {
      let gunPnl = 0, gunFon = 0, gunMal = 0;
      const acik = [...poz.filter(p => p.acik), ...(btc.acik ? [btc] : [])];
      if (!tasfiye && acik.length) {
        // §1.8 çapraz marj tasfiyesi: gün içi en kötü (short yüksek, long düşük), aynı anda
        let enKotu = B, gerek = 0;
        for (const p of acik) {
          const r = satir(V, p.ham, g); const pw = r && r.v > 0 ? (p.q > 0 ? r.l : r.h) : p.P;
          enKotu += p.q * (pw - p.P); gerek += (p.btc ? 0.005 : 0.05) * Math.abs(p.q * pw);
        }
        if (enKotu < gerek) { tasfiye = true; S.tasfiye++; B = 0; for (const p of acik) p.acik = false; }
      }
      if (!tasfiye) {
        for (const p of acik) {
          if (!p.btc && !hacimli(V, p.ham, g)) {   // §1.2 hacimsiz ilk gün: P_{t−1}'den kapanır, yeniden açılmaz
            const c = Math.abs(p.q * p.P) * (TAKER + Math.max(p.kay, kc * kademe(med30(V, p.ham, g)), kc * 0.005));
            gunMal += c; p.acik = false; S.delist++; S.delistPnl += p.pnl - c;
            continue;
          }
          const fr = fundingGun(V, p.ham, g, tG, tC);
          if (!fr.kayit && !p.btc) S.fonEksikGun++;
          if (fr.oranlar.length) { const Cd = sonKapanis(V, p.ham, g - 1); for (const r of fr.oranlar) { const x = -p.q * r * Cd; gunFon += x; if (!p.btc) p.pnl += x; } }
          const c = satir(V, p.ham, g).c;
          const x = p.q * (c - p.P); gunPnl += x; if (!p.btc) p.pnl += x; p.P = c;
        }
        if (g === Fn - 1) {   // çıkış: bir sonraki F açılışı (= bu kapanış)
          for (const p of [...poz.filter(q => q.acik), ...(btc.acik ? [btc] : [])]) {
            let kay = p.kay;
            if (!p.btc && delistSonrasi(V, p.ham, p.kosuBas, g)) kay = Math.max(p.kay, kc * kademe(med30(V, p.ham, g)), kc * 0.005);
            const c = Math.abs(p.q * p.P) * (TAKER + kay); gunMal += c; if (!p.btc) p.pnl -= c;
            p.acik = false;
          }
        }
        B += gunPnl + gunFon - gunMal;
        S.funding += gunFon; S.maliyet += gunMal;
      }
      const y = V.y(g);
      nakit += (ayar.tumFaiz ? (B + nakit) : nakit) * y;
      E = B + nakit;
      kayit.push({ g, E, y, acik: 1 });
    }
  }
  return { kayit, S };
}

/* ═══════════ OLAY SİMÜLASYONU (§1.4, §2.1, §2.3) ═══════════ */
/**
 * adaylar: [{ kimlik, gGiris, perpler: [ham...], ek? }] — giriş gününe göre. Uygunluk giriş günü (§1.1 1 M $, yaş ≥ 60 g).
 * ek(V, ham, g) → neden | null (kola özgü ek şart: A1 delist duyurusu, A3 yeniden kullanım).
 */
function olayKos(V, adaylar, gBas, gSon, ayar = {}) {
  const kc = ayar.kaymaCarpan || 1;
  const kayit = [];
  let E = 1;
  const S = { olay: 0, uygun: 0, giris: 0, atlandiYer: 0, acikVar: 0, uygunsuz: {}, tasfiye: 0, delist: 0, delistPnl: 0, funding: 0, maliyet: 0, fonEksikGun: 0, kapasite: [], cikis: {}, donemSonuAcik: 0, girisDisi: 0, cokPerp: 0 };
  const acik = [];
  const gunluk = new Map();
  for (const a of adaylar) { if (a.gGiris < gBas || a.gGiris > gSon) { S.girisDisi++; continue; } if (!gunluk.has(a.gGiris)) gunluk.set(a.gGiris, []); gunluk.get(a.gGiris).push(a); }
  for (let g = gBas; g <= gSon; g++) {
    let gunPnl = 0, gunFon = 0, gunMal = 0;
    const mBas = Math.min(1, acik.reduce((s, p) => s + p.mPay, 0));
    for (const p of acik.slice()) {
      const kapat = (neden, kay) => {
        // coin bacağı (tasfiye değilse maliyetli kapanış) + kendi BTC korunması
        if (neden !== 'tasfiye') { const c = Math.abs(p.q * p.P) * (TAKER + kay); gunMal += c; p.pnl -= c; }
        const rb = satir(V, BTC, g); if (rb) { gunPnl += p.qb * (rb.c - p.Pb); p.Pb = rb.c; }
        gunMal += Math.abs(p.qb * p.Pb) * (TAKER + kc * 0.0002);
        S.cikis[neden] = (S.cikis[neden] || 0) + 1;
        acik.splice(acik.indexOf(p), 1);
      };
      const r = satir(V, p.ham, g);
      const fonla = () => {
        for (const [ham, q, isBtc] of [[p.ham, p.q, false], [BTC, p.qb, true]]) {
          const fr = fundingGun(V, ham, g, p.tG, p.tC);
          if (!fr.kayit && !isBtc) S.fonEksikGun++;
          if (fr.oranlar.length) { const Cd = sonKapanis(V, ham, g - 1); for (const x of fr.oranlar) { const v = -q * x * Cd; gunFon += v; if (!isBtc) { p.pnl += v; p.marj += v; } } }
        }
      };
      if (!(r && r.v > 0)) {   // §1.2 hacimsiz ilk gün
        fonla();
        const kay = Math.max(p.kay, kc * kademe(med30(V, p.ham, g)), kc * 0.005);
        S.delist++; kapat('hacimsiz', kay); S.delistPnl += p.pnl; continue;
      }
      if (p.q < 0 && r.h >= p.P0 * 1.90) {   // §1.8 yalıtılmış 1× short tasfiyesi: teminatıyla sıfırlanır
        fonla();
        const kayip = -(p.teminat + p.marj); gunPnl += kayip; p.pnl += kayip; S.tasfiye++;
        kapat('tasfiye', 0); continue;
      }
      fonla();
      gunPnl += p.q * (r.c - p.P); p.pnl += p.q * (r.c - p.P); p.marj += p.q * (r.c - p.P); p.P = r.c;
      const rb = satir(V, BTC, g); gunPnl += p.qb * (rb.c - p.Pb); p.Pb = rb.c;
      if (g === p.gCikis) {
        const kay = delistSonrasi(V, p.ham, p.kosuBas, g) ? Math.max(p.kay, kc * kademe(med30(V, p.ham, g)), kc * 0.005) : p.kay;
        const c = Math.abs(p.q * p.P) * (TAKER + kay); gunMal += c; p.pnl -= c;
        gunMal += Math.abs(p.qb * p.Pb) * (TAKER + kc * 0.0002);
        S.cikis['30g'] = (S.cikis['30g'] || 0) + 1;
        acik.splice(acik.indexOf(p), 1);
      }
    }
    const y = V.y(g);
    const faiz = (ayar.tumFaiz ? 1 : 1 - mBas) * E * y;
    E = E + gunPnl + gunFon - gunMal + faiz;
    S.funding += gunFon; S.maliyet += gunMal;
    // yeni girişler (bu günün kapanışı)
    const yeni = [];
    const kr = ayar.karar && gunluk.has(g) ? { g: gs(g), E, adaylar: [], girisler: [] } : null;   // karar kaydı (kesme testi)
    for (const a of gunluk.get(g) || []) {
      S.olay++;
      const uy = [];
      const nedenler = [];
      const ka = kr ? { kimlik: a.kimlik, nedenler, uy } : null; if (ka) kr.adaylar.push(ka);
      for (const ham of a.perpler) {
        const ev = evrendeMi(V, ham, g, 1e6, g);
        if (!ev.ok) { nedenler.push(ev.neden); continue; }
        const ek = a.ek ? a.ek(V, ham, g, ev.kosu) : null;
        if (ek) { nedenler.push(ek); continue; }
        uy.push({ ham, med: ev.med, kosu: ev.kosu });
      }
      if (!uy.length) { const nd = nedenler[0] || 'perp-yok'; S.uygunsuz[nd] = (S.uygunsuz[nd] || 0) + 1; continue; }
      if (uy.length > 1) S.cokPerp++;
      uy.sort((x, z) => z.med - x.med || (x.ham < z.ham ? -1 : 1));
      const sec = uy[0];
      if (acik.some(p => p.ham === sec.ham) || yeni.some(x => x.ham === sec.ham)) { S.acikVar++; continue; }
      S.uygun++;
      yeni.push({ ...sec, a });
    }
    if (yeni.length) {
      const bos = 1 - acik.reduce((s, p) => s + p.w, 0);
      if (bos <= 1e-12) S.atlandiYer += yeni.length;
      else {
        const w = Math.min(0.10, bos / yeni.length);
        const Eg = E;
        for (const x of yeni) {
          const r = satir(V, x.ham, g), rb = satir(V, BTC, g), b = beta(V, x.ham, g);
          const kay = kc * kademe(x.med);
          const p = { ham: x.ham, kimlik: x.a.kimlik, w, q: -w * Eg / r.c, P: r.c, P0: r.c, qb: b.s * w * Eg / rb.c, Pb: rb.c, kay, gGiris: g, gCikis: g + 30,
            tG: (g + 1) * GUN, tC: (g + 31) * GUN, teminat: w * Eg, mPay: w + b.s * w, pnl: 0, marj: 0, kosuBas: x.kosu.bas, beta: b.s };
          const c = w * Eg * (TAKER + kay) + b.s * w * Eg * (TAKER + kc * 0.0002);
          E -= c; S.maliyet += c; p.pnl -= w * Eg * (TAKER + kay);
          S.giris++; S.kapasite.push(0.01 * x.med / w);
          acik.push(p);
          if (ayar.iz) ayar.iz.push({ kimlik: x.a.kimlik, ham: x.ham, giris: gs(g), w, beta: b.s });
          if (kr) kr.girisler.push([x.ham, w, p.q, p.P0, p.qb, p.Pb, b.s, kay, x.med]);
        }
      }
    }
    if (kr) { kr.adaylar = kr.adaylar.map(x => ({ kimlik: x.kimlik, nedenler: x.nedenler.slice(), uy: x.uy.map(u => [u.ham, u.med, u.kosu.bas]) })); kr.E2 = E; ayar.karar.push(kr); }
    // zero-vol çıkışta erken kapanan pozisyonun tC'si gerçek çıkıştır (funding o güne kadar sayıldı)
    kayit.push({ g, E, y, acik: acik.length });
  }
  S.donemSonuAcik = acik.length;
  return { kayit, S };
}
/** Kol → olay adayları (tablolardan). */
function olayAdaylari(V, kol, olayBas, olaySon, { girisKaydir = 2 } = {}) {
  if (kol === 874) {
    return V.mt.filter(o => { const g = gn(o.gun); return g >= olayBas && g <= olaySon; }).map(o => ({
      kimlik: `${o.sembol}@${o.utc}`, gGiris: gn(o.gun), perpler: o.perpler.map(p => p.split('/')[0]),
      ek: (V2, ham, g, k) => ((o.oncekiPerpDelist || []).some(x => x.perp === ham && x.tau >= k.bas * GUN) ? 'delist-duyurusu' : null),   // EK-1 (b): yalnız bu koşudaki duyuru
    }));
  }
  if (kol === 877) {
    return V.hack.filter(h => { const g = gn(h.D); return g >= olayBas && g <= olaySon && h.perpler.length; }).map(h => ({
      kimlik: `${h.ad}@${h.D}`, gGiris: gn(h.D) + girisKaydir, perpler: h.perpler.map(p => p.split('/')[0]), zayif: h.zayif,
      ek: (V2, ham, g, k) => (k.no !== 0 ? 'yeniden-kullanim' : null),
    }));
  }
  throw new Error('olay kolu değil: ' + kol);
}

/* ═══════════ ÖLÇÜLER (§4) ═══════════ */
function seriler(kayit) {
  const r = [], y = [], d = [], E = [1];
  let once = 1;
  for (const x of kayit) { const rt = x.E / once - 1; r.push(rt); y.push(x.y); d.push(Math.log1p(rt) - Math.log1p(x.y)); E.push(x.E); once = x.E; }
  return { r, y, d, E };
}
function maxDD(E) { let tepe = -Infinity, m = 0; for (const e of E) { if (e > tepe) tepe = e; m = Math.min(m, e / tepe - 1); } return m; }
/** Durağan blok bootstrap (§4 ölçüt 1/5): ortalama blok 90 g, N 2000, tohum = deneme no, H = T. */
function bootstrap(d, tohum, N = 2000) {
  const mu = OL.duraganBootstrap(d, { b: 90, N, H: d.length, tohum, olc: (yol) => 365 * ort(yol) });
  const alt = yuzdelikSira(mu, 0.05), ust = yuzdelikSira(mu, 0.95);
  const p = (1 + mu.filter(x => x <= 0).length) / (N + 1);
  return { alt, ust, p };
}
function olc(kayit, deneme, { boot = true, yalnizOlay = false } = {}) {
  const { r, y, d, E } = seriler(kayit);
  const T = d.length;
  if (T < 2) return { T };
  const cagr = Math.pow(E[E.length - 1], 365 / T) - 1;
  const nakitC = Math.pow(y.reduce((a, b) => a * (1 + b), 1), 365 / T) - 1;
  const sh = sd(d) > 0 ? ort(d) / sd(d) * Math.sqrt(365) : 0;
  const yil = {}; kayit.forEach((x, i) => { const a = gs(x.g).slice(0, 4); yil[a] = (yil[a] || 0) + d[i]; });
  const out = { T, bas: gs(kayit[0].g), son: gs(kayit[T - 1].g), cagr, nakitCagr: nakitC, fark: cagr - nakitC, mu: 365 * ort(d), sharpe: sh, maxDD: maxDD(E),
    yilSd: Object.fromEntries(Object.entries(yil).map(([a, v]) => [a, +v.toFixed(5)])), artiYil: Object.values(yil).filter(v => v > 0).length, yilSay: Object.keys(yil).length };
  if (boot) { const b = bootstrap(d, deneme); out.bootAlt = b.alt; out.bootUst = b.ust; out.p = b.p; }
  if (T > 30 && sd(d) > 0) { const N = require('../lib/research/nasdaq.js'); const s = Math.sqrt(1 / (T - 1) / 2); out.dsr = N.dsr(d, [-s, s], defterTavan()); }
  if (yalnizOlay) { const dd = d.filter((_, i) => kayit[i].acik > 0); out.olayliGun = dd.length; out.sharpeOlayli = dd.length > 2 && sd(dd) > 0 ? ort(dd) / sd(dd) * Math.sqrt(365) : null; }
  return out;
}
function defterTavan() { try { const D = require('../lib/defter'); return Math.max(874, D.ozet(D.oku().kayitlar).toplam); } catch { return 883; } }

/* ═══════════ §7 KONTROLLER (bilgi) ═══════════ */
/** Faktör getirileri (maliyetsiz, aylık kuruluş, aynı evren): BTC fazla, boyut, 14 g mom, 12-1 mom, yaş. → Map(g → [..]) */
function faktorler(V, Fler, gSon, esik) {
  const out = new Map();
  for (let k = 0; k < Fler.length; k++) {
    const F = Fler[k], Fn = k + 1 < Fler.length ? Fler[k + 1] : gSon + 1, d = F - 1;
    const ev = [];
    for (const ham of V.semboller) {
      if (ham === BTC) continue;
      const e = evrendeMi(V, ham, d, esik, F); if (!e.ok) continue;
      const c = satir(V, ham, d).c, c14 = sonKapanis(V, ham, d - 14), c30 = sonKapanis(V, ham, d - 30), c365 = sonKapanis(V, ham, d - 365);
      ev.push({ ham, boy: e.med, m14: c14 > 0 ? c / c14 - 1 : null, m121: c30 > 0 && c365 > 0 && e.kosu.bas <= d - 365 ? c30 / c365 - 1 : null, yas: d - e.kosu.bas });
    }
    const uc = (alan, yuksek) => { const L = ev.filter(x => x[alan] != null).sort((a, b) => a[alan] - b[alan] || (a.ham < b.ham ? -1 : 1)); const n = Math.floor(L.length / 5); if (n < 1) return null; const al = L.slice(0, n).map(x => x.ham), ust = L.slice(-n).map(x => x.ham); return yuksek ? [ust, al] : [al, ust]; };
    const tan = { boy: uc('boy', false), m14: uc('m14', true), m121: uc('m121', true), yas: uc('yas', false) };   // [long, short]
    const durum = {}; for (const [a, v] of Object.entries(tan)) durum[a] = v ? v.map(gr => new Map(gr.map(h => [h, true]))) : null;
    for (let g = F; g < Fn; g++) {
      const rb = satir(V, BTC, g), rb0 = satir(V, BTC, g - 1);
      const row = [rb && rb0 ? Math.log(rb.c / rb0.c) - Math.log1p(V.y(g)) : 0];
      for (const a of ['boy', 'm14', 'm121', 'yas']) {
        const dz = durum[a]; if (!dz) { row.push(0); continue; }
        const gr = dz.map(m => { const rr = []; for (const h of m.keys()) { if (!m.get(h)) continue; const r1 = satir(V, h, g), r0 = satir(V, h, g - 1); if (!(r1 && r1.v > 0)) { m.set(h, false); continue; } if (r0 && r0.c > 0) rr.push(r1.c / r0.c - 1); } return rr.length ? ort(rr) : 0; });
        row.push(gr[0] - gr[1]);
      }
      out.set(g, row);
    }
  }
  return out;
}
/** EKK + Newey–West (30 gecikme) t. */
function ekkNW(y, X, L = 30) {
  const n = y.length, k = X[0].length;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0)), Xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b]; }
  const inv = tersMatris(XtX); if (!inv) return null;
  const b = inv.map(r => r.reduce((s, v, j) => s + v * Xty[j], 0));
  const e = y.map((v, i) => v - X[i].reduce((s, x, j) => s + x * b[j], 0));
  const S = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let l = 0; l <= L; l++) {
    const wl = l === 0 ? 1 : 1 - l / (L + 1);
    for (let t = l; t < n; t++) for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) { const v = wl * e[t] * e[t - l] * X[t][a] * X[t - l][c]; S[a][c] += v; if (l > 0) S[c][a] += v; }
  }
  const V = carp(carp(inv, S), inv);
  const my = ort(y), sst = y.reduce((s, v) => s + (v - my) ** 2, 0), sse = e.reduce((s, v) => s + v * v, 0);
  return { b, t: b.map((v, i) => v / Math.sqrt(Math.max(V[i][i], 1e-300))), R2: 1 - sse / sst };
}
function carp(A, B) { return A.map(r => B[0].map((_, j) => r.reduce((s, v, i) => s + v * B[i][j], 0))); }
function tersMatris(M) {
  const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    if (Math.abs(A[p][i]) < 1e-14) return null;
    [A[i], A[p]] = [A[p], A[i]];
    const v = A[i][i]; for (let j = 0; j < 2 * n; j++) A[i][j] /= v;
    for (let r = 0; r < n; r++) if (r !== i) { const f = A[r][i]; for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[i][j]; }
  }
  return A.map(r => r.slice(n));
}
function faktorYukleme(kayit, F) {
  const { d } = seriler(kayit);
  const y = [], X = [];
  kayit.forEach((x, i) => { const f = F.get(x.g); if (f) { y.push(d[i]); X.push([1, ...f]); } });
  if (y.length < 60) return null;
  const r = ekkNW(y, X); if (!r) return null;
  const ad = ['sabit', 'BTC', 'boyut', 'mom14', 'mom12-1', 'yas'];
  return { n: y.length, R2: r.R2, katsayi: Object.fromEntries(ad.map((a, i) => [a, { b: r.b[i], t: r.t[i] }])) };
}
/** Karakteristik yüzdelikleri (§7): bacak coin'lerinin evren içindeki boyut, 14 g momentum, yaş yüzdeliği. */
function karakterOlc(V, F, poz) {
  const d = F - 1, ev = [];
  for (const ham of V.semboller) { if (ham === BTC) continue; const e = evrendeMi(V, ham, d, 5e6, F); if (!e.ok) continue; const c = satir(V, ham, d).c, c14 = sonKapanis(V, ham, d - 14); ev.push({ ham, boy: e.med, m14: c14 > 0 ? c / c14 - 1 : 0, yas: d - e.kosu.bas }); }
  const yuz = (alan, ham) => { const s = ev.map(x => x[alan]).sort((a, b) => a - b); const v = ev.find(x => x.ham === ham)[alan]; const lo = s.indexOf(v), hi = s.lastIndexOf(v); return s.length > 1 ? ((lo + hi) / 2) / (s.length - 1) : 0.5; };
  const o = {};
  for (const [ad, yon] of [['long', 1], ['short', -1]]) { const g = poz.filter(p => p.yon === yon); o[ad] = Object.fromEntries(['boy', 'm14', 'yas'].map(a => [a, ort(g.map(p => yuz(a, p.ham)))])); }
  return o;
}

/* ═══════════ KOŞU ═══════════ */
function kolKos(V, kol, tur, { boot = true, bilgi = true } = {}) {
  const K = KOLLAR[kol], D = donem(kol, tur);
  const out = { kol, ad: K.ad, tur };
  if (K.sinyal === 'github' && !githubJeton()) return { ...out, durum: 'jeton yok', not: 'data/secrets.json github.token yok — 787 atlandı (§2.4; son tarih 2027-03-31, o güne kadar ölçülmezse p = 1)' };
  if (K.tip === 'ls') {
    const R = lsKos(V, kol, D.F, D.son, { karakter: bilgi ? karakterOlc : null });
    out.ana = olc(R.kayit, kol, { boot });
    out.tradfiSupheli = [...R.S.evrenAd].filter(h => V.tradfiSupheli && V.tradfiSupheli(h)).sort();
    out.sayac = sayacOzet(R.S, 'ls');
    if (bilgi) {
      out.bilgi = {
        kayma2: ozetM(olc(lsKos(V, kol, D.F, D.son, { kaymaCarpan: 2 }).kayit, kol, { boot: false })),
        tumFaiz: ozetM(olc(lsKos(V, kol, D.F, D.son, { tumFaiz: true }).kayit, kol, { boot: false })),
        zayifHaric: ozetM(olc(lsKos(V, kol, D.F, D.son, { zayifHaric: true }).kayit, kol, { boot: false })),
        cmYokHaric: ozetM(olc(lsKos(V, kol, D.F, D.son, { cmYokHaric: true }).kayit, kol, { boot: false })),
        adaptor: 'yapılmadı (DefiLlama adaptör deposu git geçmişi indirilmedi; §2.2 duyarlılık satırı)',
      };
      const Fk = faktorler(V, D.F, D.son, 5e6);
      out.bilgi.faktor = faktorYukleme(R.kayit, Fk);
      out.bilgi.karakter = karakterOrt(R.S.karakter);
    }
  } else {
    const ad = olayAdaylari(V, kol, D.olayBas, D.olaySon);
    const iz = [];
    const R = olayKos(V, ad, D.bas, D.son, { iz });
    out.ana = olc(R.kayit, kol, { boot, yalnizOlay: true });
    out.sayac = sayacOzet(R.S, 'olay');
    out.girisler = iz;
    if (bilgi) {
      out.bilgi = {
        kayma2: ozetM(olc(olayKos(V, ad, D.bas, D.son, { kaymaCarpan: 2 }).kayit, kol, { boot: false })),
        tumFaiz: ozetM(olc(olayKos(V, ad, D.bas, D.son, { tumFaiz: true }).kayit, kol, { boot: false })),
      };
      if (kol === 877) {
        out.bilgi.zayifHaric = ozetM(olc(olayKos(V, ad.filter(a => !a.zayif), D.bas, D.son).kayit, kol, { boot: false }));
        for (const kd of [1, 5]) out.bilgi['giris_D+' + kd] = ozetM(olc(olayKos(V, olayAdaylari(V, kol, D.olayBas, D.olaySon, { girisKaydir: kd }), D.bas, D.son).kayit, kol, { boot: false }));
      }
      const Fk = faktorler(V, aylar(Math.floor(D.bas / 1) - (new Date(D.bas * GUN).getUTCDate() - 1), D.son), D.son, 1e6);
      out.bilgi.faktor = faktorYukleme(R.kayit, Fk);
    }
  }
  return out;
}
function karakterOrt(L) { if (!L.length) return null; const o = {}; for (const b of ['long', 'short']) { o[b] = {}; for (const a of ['boy', 'm14', 'yas']) o[b][a] = ort(L.map(x => x[b][a])); } return o; }
function ozetM(m) { return { fark: m.fark, cagr: m.cagr, sharpe: m.sharpe, maxDD: m.maxDD, artiYil: m.artiYil }; }
function sayacOzet(S, tip) {
  const o = { ...S };
  o.kapasiteMedyan = S.kapasite.length ? medyan(S.kapasite) : null; delete o.kapasite;
  if (S.evrenAd) { o.evrenAdSay = S.evrenAd.size; delete o.evrenAd; }
  if (tip === 'ls') { o.devirOrt = S.devir.length ? ort(S.devir) : null; delete o.devir; delete o.karakter; o.aylar = S.aylar; }
  return o;
}
function githubJeton() { try { const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'secrets.json'), 'utf8').replace(/^﻿/, '')); return !!(j.github && j.github.token); } catch { return false; } }

/** Geliştirme kararı (§1.9 yön süzgeci + §6 asgari). */
function gelKarari(kol, R) {
  const K = KOLLAR[kol];
  if (R.durum === 'jeton yok') return { holdout: 'açılmaz (jeton yok)', p1: 'jeton gelene / 2027-03-31’e kadar bekler' };
  if (K.tip === 'ls') {
    const poz = R.sayac.pozAy, sh = R.ana.sharpe;
    // EK-1 (c) 7: iki kapı ayrı yazılır; biri tutmazsa holdout açılmaz, Holm'da p = 1
    const s6 = { gecti: poz >= 18, metin: `§6 asgari örneklem: pozisyonlu kuruluş ayı ${poz} / 34 ${poz >= 18 ? '≥' : '<'} 18${poz >= 18 ? '' : ' → SONUÇSUZ'}` };
    const s19 = { gecti: sh > 0, metin: `§1.9 yön süzgeci: geliştirme fazla getiri Sharpe ${sh.toFixed(3)} ${sh > 0 ? '> 0' : '≤ 0 → RED'}` };
    if (s6.gecti && s19.gecti) return { holdout: 'açılabilir', s6, s19, neden: s6.metin + ' · ' + s19.metin };
    const hukum = [!s6.gecti ? 'SONUÇSUZ (§6)' : null, !s19.gecti ? 'RED (§1.9 yön süzgeci)' : null].filter(Boolean).join(' · ');
    return { holdout: 'açılmaz', hukum, s6, s19, neden: s6.metin + ' · ' + s19.metin, p: 1 };
  }
  return { holdout: 'açılabilir', neden: 'olay kolunda geliştirme süzgeci yok (§1.9)' };
}

const yol = { gel: () => path.join(KAYIT, 'gel.json'), acilan: () => path.join(KAYIT, 'acilan.json'), hold: (k) => path.join(KAYIT, `hold-${k}.json`), holm: () => path.join(KAYIT, 'holm-a.json') };
const okuJ = (p, v = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return v; } };
function yazJ(p, o) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p + '.tmp', JSON.stringify(o, null, 1) + '\n'); fs.renameSync(p + '.tmp', p); }

function gelKos(liste = A_KOLLAR) {
  const out = okuJ(yol.gel(), null) || { onKayit: DV.ONKAYIT, kollar: {} };
  out.tarih = new Date().toISOString();
  const V = gercekVeri(gn('2024-01-01'));
  out.tablolarSha = V.tablolar.tablolar;
  for (const kol of liste) {
    if (kesim(kol, 'gel') !== V.son) throw new Error('kesim uyuşmazlığı');
    const t0 = Date.now();
    const R = kolKos(V, kol, 'gel');
    R.karar = gelKarari(kol, R);
    R.sureSn = (Date.now() - t0) / 1000;
    out.kollar[kol] = R;
    yazdir(R);
  }
  yazJ(yol.gel(), out);
  return out;
}
function holdKos(kol) {
  if (!KOLLAR[kol]) throw new Error('bilinmeyen kol: ' + kol);
  const A = okuJ(yol.acilan(), {});
  if (A[kol]) throw new Error(`holdout ZATEN AÇILDI (${A[kol].acilis}) — ikinci açılış reddedildi`);
  const G = okuJ(yol.gel()); if (!G || !G.kollar[kol]) throw new Error('önce gel');
  if (G.kollar[kol].karar.holdout !== 'açılabilir') throw new Error('holdout açılmaz: ' + (G.kollar[kol].karar.neden || G.kollar[kol].karar.holdout));
  A[kol] = { acilis: new Date().toISOString(), durum: 'açılıyor' }; yazJ(yol.acilan(), A);   // kalıcı kilit önce
  const V = gercekVeri(gn('2026-10-01'));
  const R = kolKos(V, kol, 'hold');
  R.olcut = olcutler(kol, R);
  yazJ(yol.hold(kol), R);
  A[kol].durum = 'açıldı'; yazJ(yol.acilan(), A);
  yazdir(R);
  return R;
}
/** §4 ölçütleri 1–4 + §6 asgari (Holm ayrı). */
function olcutler(kol, R) {
  const m = R.ana, K = KOLLAR[kol];
  let asgari;
  if (K.tip === 'ls') asgari = R.sayac.pozAy >= 24;
  else asgari = R.sayac.uygun >= (kol === 874 ? 20 : 15);
  const yil = ['2024', '2025', '2026'].filter(a => (m.yilSd[a] || 0) > 0).length;
  return { 1: m.fark > 0 && m.bootAlt > 0, 2: m.sharpe >= 0.5, 3: -m.maxDD <= 0.25, 4: yil >= 2, asgari, p: m.p };
}
/** Holm, ağırlıklı bölüşüm + grafik aktarım (§5). pler: { kol: p } (eksik/açılmamış = 1). */
function holmA(pler, alfa = ALFA_A) {
  const L = Object.entries(pler).map(([k, p]) => ({ k: +k, p: p == null ? 1 : p })).sort((a, b) => a.p - b.p || a.k - b.k);
  const m = L.length, out = {}; let dur = false;
  L.forEach((x, i) => { const es = alfa / (m - i); const ok = !dur && x.p <= es; if (!ok) dur = true; out[x.k] = { p: x.p, esik: es, red: ok }; });
  const hepsi = L.every(x => out[x.k].red);
  return { sonuc: out, alfaB: hepsi ? ALFA : ALFA_B, aktarim: hepsi };
}
function holmAKos(bugun = Math.floor(Date.now() / GUN)) {
  if (fs.existsSync(yol.holm())) throw new Error('A Holm\'u ZATEN yapıldı — ikinci kez yapılmaz');
  const G = okuJ(yol.gel()); if (!G) throw new Error('önce gel');
  const pler = {}, bekleyen = [];
  for (const k of A_KOLLAR) {
    const g = G.kollar[k];
    if (!g) { bekleyen.push(k + ' (gel yok)'); continue; }
    if (g.karar.p === 1) { pler[k] = 1; continue; }
    if (g.durum === 'jeton yok') { if (bugun > SON_787) { pler[k] = 1; continue; } bekleyen.push('787 (jeton yok; son tarih 2027-03-31)'); continue; }
    const h = okuJ(yol.hold(k));
    if (!h) { bekleyen.push(k + ' (holdout açılmadı)'); continue; }
    const o = h.olcut; pler[k] = o.asgari ? o.p : 1;
  }
  if (bekleyen.length) throw new Error('A Holm\'u için p bekleniyor: ' + bekleyen.join(', '));
  const H = holmA(pler);
  const out = { tarih: new Date().toISOString(), pler, holm: H, karar: {} };
  for (const k of A_KOLLAR) {
    const h = okuJ(yol.hold(k));
    if (!h) { out.karar[k] = G.kollar[k].karar.hukum || 'SONUÇSUZ'; continue; }
    const o = h.olcut;
    out.karar[k] = !o.asgari ? 'SONUÇSUZ' : (o[1] && o[2] && o[3] && o[4] && H.sonuc[k].red) ? 'KABUL' : 'RED';
  }
  yazJ(yol.holm(), out);
  console.log(JSON.stringify(out, null, 1));
  return out;
}

/* ═══════════ YOL B MÜHRÜ (§3.3) ═══════════ */
/** Mühür denetimi: t0 (evren/esik-v1.json) + 375 g, son çıkış + 7 g, 780/781/782 hüküm dosyaları zincirde. → { acik, neden } */
function bMuhur(kok = process.env.DLS_TARAMA || path.join(ROOT, 'data', 'tarama'), bugun = Math.floor(Date.now() / GUN)) {
  const esik = okuJ(path.join(kok, 'evren', 'esik-v1.json'));
  if (!esik || !esik.t0) return { acik: false, neden: 't0 yok (evren/esik-v1.json zincirde değil)' };
  const t0 = gn(String(esik.t0).slice(0, 10));
  const man = fs.existsSync(path.join(kok, 'arsiv', 'manifest.jsonl')) ? fs.readFileSync(path.join(kok, 'arsiv', 'manifest.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
  const dosyaVar = (ad) => man.some(k => (k.dosyalar || []).some(d => String(d.yol || '').endsWith('/' + ad)));
  const gunler = [...new Set(man.filter(k => k.tur === 'gun' && k.gun).map(k => gn(k.gun)))].sort((a, b) => a - b);
  const gk = []; for (let k = 0; k < 12; k++) { const h = t0 + 30 * k; const g = gunler.find(x => x >= h); gk.push(g ?? null); }
  const sonCikis = gk[11] != null ? gk[11] + 30 : null;
  const olcumGunu = Math.max(t0 + 375, sonCikis != null ? sonCikis + 7 : Infinity);
  if (!(bugun >= olcumGunu)) return { acik: false, neden: `ölçüm günü gelmedi: bugün ${gs(bugun)} < ${Number.isFinite(olcumGunu) ? gs(olcumGunu) : 'max(t0 + 375 g, son çıkış + 7 g) (12. pencere henüz yok)'}`, t0: gs(t0) };
  if (!dosyaVar('dikkat-hukum.json')) return { acik: false, neden: '780 hükmü (dikkat-hukum.json) zincirde yok' };
  if (!dosyaVar('izle-hukum.json')) return { acik: false, neden: '781/782 hükmü (izle-hukum.json) zincirde yok' };
  return { acik: true, t0: gs(t0), olcumGunu: gs(olcumGunu) };
}
function bKos(opts) {
  const m = bMuhur(opts && opts.kok, opts && opts.bugun);
  if (!m.acik) throw new Error('Yol B MÜHÜRLÜ (§3.3): ' + m.neden);
  throw new Error('Yol B ölçümü mühür açıldıktan sonra evdeki resmî arşivle koşulur; bu betik sürümü B muhasebesini §1.4 olay motoruyla (olayKos, long kolları için yön genellemesi) çalıştırmak üzere güncellenmeli — ön kayıt dışı seçim yapmamak için burada durur.');
}

/* ═══════════ ÇIKTI ═══════════ */
const f = (x, n = 3) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(n));
function yazdir(R) {
  console.log(`\n═══ ${R.kol} ${R.ad} — ${R.tur === 'gel' ? 'GELİŞTİRME' : 'HOLDOUT'} ═══`);
  if (R.durum) { console.log(R.durum + ' — ' + R.not); return; }
  const m = R.ana;
  console.log(`${m.bas} → ${m.son} (T ${m.T}) · CAGR ${f(100 * m.cagr, 2)} % · nakit ${f(100 * m.nakitCagr, 2)} % · fazla ${f(100 * m.fark, 2)} puan · μ ${f(100 * m.mu, 2)} % [boot %90: ${f(100 * m.bootAlt, 2)}; ${f(100 * m.bootUst, 2)}] p ${f(m.p, 4)} · Sharpe ${f(m.sharpe)} · MaxDD ${f(100 * m.maxDD, 2)} % · artı yıl ${m.artiYil}/${m.yilSay} ${JSON.stringify(m.yilSd)}${m.sharpeOlayli != null ? ` · olaylı gün ${m.olayliGun}, olaylı Sharpe ${f(m.sharpeOlayli)}` : ''} · DSR ${f(m.dsr)}`);
  const S = R.sayac;
  if (S.aylar) console.log(`aylar: pozisyonlu ${S.pozAy}, boş ${S.bosAy} · N ort ${f(ort(S.aylar.map(a => a.N)), 1)} (min ${Math.min(...S.aylar.map(a => a.N))}, maks ${Math.max(...S.aylar.map(a => a.N))}) · tasfiye ${S.tasfiye} · hacimsiz çıkış ${S.delist} (kâr/zarar ${f(S.delistPnl, 4)}) · funding ${f(S.funding, 4)} · maliyet ${f(S.maliyet, 4)} · funding kaydı yok ${S.fonEksikGun} poz-gün · devir ${f(S.devirOrt)} · kapasite ${f(S.kapasiteMedyan / 1e6, 2)} M$ · kayıplar ${JSON.stringify(S.kayip)}`);
  else console.log(`olay ${S.olay} · uygun ${S.uygun} · giriş ${S.giris} · yer yok ${S.atlandiYer} · açık var ${S.acikVar} · uygunsuz ${JSON.stringify(S.uygunsuz)} · çıkış ${JSON.stringify(S.cikis)} · tasfiye ${S.tasfiye} · hacimsiz ${S.delist} · dönem sonu açık ${S.donemSonuAcik} · funding ${f(S.funding, 4)} · maliyet ${f(S.maliyet, 4)} · kapasite ${f(S.kapasiteMedyan / 1e6, 2)} M$`);
  if (R.bilgi) console.log('bilgi', JSON.stringify(R.bilgi, (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v)));
  if (R.karar) console.log('→ ' + JSON.stringify(R.karar));
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const calistir = async () => {
    if (a[0] === 'veri') { await DV.kimlik(); await DV.seri(); return; }
    if (a[0] === 'tablo') { DV.tablo(); return; }
    if (a[0] === 'gel') { gelKos(a.includes('--kol') ? [+a[a.indexOf('--kol') + 1]] : undefined); return; }
    if (a[0] === 'hold') { if (!a.includes('--ac')) throw new Error('holdout yalnız --ac <no> ile açılır'); holdKos(+a[a.indexOf('--ac') + 1]); return; }
    if (a[0] === 'holm-a') { holmAKos(); return; }
    if (a[0] === 'b') { bKos(); return; }
    if (a[0] === 'selftest') { require('./dikkat-ls-selftest.js'); return; }
    console.log('kullanım: veri | tablo | gel [--kol N] | hold --ac <no> | holm-a | b | selftest');
  };
  calistir().catch(e => { console.error('✗ ' + e.message); process.exitCode = 1; });
}
module.exports = { birimBiliniyor, KOLLAR, DONEM, A_KOLLAR, ALFA_A, ALFA_B, kademe, kucult, beta, med30, kosular, kosu, evrendeMi, sinyal, bacak, bacaklar, lsKos, olayKos, olayAdaylari,
  olc, bootstrap, holmA, bMuhur, bKos, fundingGun, haricYap, satir, hacimli, seriler, maxDD, gelKarari, olcutler, yYap, gn, gs, GUN, delistSonrasi, ekkNW, kolKos, gercekVeri, holmAKos, holdKos };
