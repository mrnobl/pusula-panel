#!/usr/bin/env node
/**
 * BIST HİSSE ≤ 1 HAFTA TUTUŞ — PLAN-BIST-HAFTALIK.md ön kaydı (deneme 585–590).
 *   node scripts/bist-haftalik.js --indir [isy|1s]   # İş Yatırım temettü + nominal fiyat, Yahoo 1 saatlik (son 730 g)
 *   node scripts/bist-haftalik.js --gelistirme      # yalnız 2012-01 → 2020-12 → data/arastirma/bist-haftalik-gelistirme.json
 *   node scripts/bist-haftalik.js                   # tüm dönem (holdout BİR KEZ) → data/arastirma/bist-haftalik.json
 *
 * Altyapı scripts/bist-strateji.js'ten kopya (o dosya yüklenince ölçüm koşturduğu için require edilmez):
 * takvim (≥3 hissede işlem), artefakt düzeltmesi (|r|>%25, ara ≤7 g), PIT likidite evreni (63 g medyan TL ciro),
 * USDTRY ileri taşıma, TCMB politika faizi, lib/risk/olcum.duraganBootstrap.
 *
 * Fiyat: Yahoo `c`/`o` = bölünmeye (ve Yahoo'nun bedelli düzeltmesine) göre ölçeklenmiş, temettüye göre DÜZELTİLMEMİŞ.
 * Temettü: D/P oranı olarak tutulur (ölçekten bağımsız). Birincil kaynak İş Yatırım (brüt TL / İşY nominal kapanış,
 * ex-günden önceki gün); Yahoo ile tarih çakışmasında Yahoo tarihi (hisse.net hak kullanım tarihleriyle 30/30 uyumlu).
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const ROOT = path.join(__dirname, '..');
const DIR = yollar.veri('bist');
const TDIR = yollar.veri('bist-temettu');
const SDIR = yollar.veri('bist-1s');
const ADIR = yollar.veri('arastirma');
const O = require(path.join(ROOT, 'lib', 'risk', 'olcum'));
const { GUNCEL, ESKI } = require('./bist-indir');

const GUN = 864e5;
const BAS = Date.UTC(2012, 0, 1), HOL = Date.UTC(2021, 0, 1);
const SON_VERI = Date.UTC(2026, 9, 6);          // 2026-10-06 satırı kısmi (indirme 14:09 TSİ) → hariç
const GELISTIRME = process.argv.includes('--gelistirme');
const SON = GELISTIRME ? HOL : SON_VERI;         // analiz bitişi (hariç)
const MALIYET = { A: 0.0001, B: 0.0008, C: 0.0025 };   // tek yön; §1.3 G-D %0,02 / %0,16 / %0,50
const PPF_MARJ = 0.01, PPF_STOPAJ = 0.15;
const SERMAYE_USD = 25000;                       // likidite tavanı için varsayım (ön kayıtta yok → sapma notu)
const LIK_ORAN = 0.01;
const stopaj = t => (t < Date.UTC(2024, 11, 22) ? 0.10 : 0.15);
const tarih = t => new Date(t).toISOString().slice(0, 10);
const yz = (x, b = 2) => (x == null || !isFinite(x) ? '—' : `%${(x * 100).toFixed(b)}`.replace('.', ','));
const sy = (x, b = 2) => (x == null || !isFinite(x) ? '—' : x.toFixed(b).replace('.', ','));

// ═════════════════════════════════════════════════════════════════════════════
// İNDİRME
// ═════════════════════════════════════════════════════════════════════════════
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' };
const bekle = ms => new Promise(r => setTimeout(r, ms));
async function indir(ne) {
  const semboller = fs.readdirSync(DIR).filter(f => f.endsWith('.IS.json') && !f.startsWith('XU')).map(f => f.replace('.IS.json', ''));
  if (!ne || ne === 'isy') {
    fs.mkdirSync(TDIR, { recursive: true });
    const tem = { kaynak: `İş Yatırım şirket kartı "Temettü" tablosu, ${tarih(Date.now())} çekildi`, alanlar: 'tarih = dağıtım (hak kullanım) tarihi; brutTL = hisse başı brüt nakit temettü, NOMİNAL; verim = İşY %', hisse: {} };
    const fiy = { kaynak: `İş Yatırım HisseTekil (Data.aspx), ${tarih(Date.now())} çekildi`, alanlar: 'g:[tarih, HG_KAPANIS nominal, HGDG_KAPANIS düzeltilmiş, HG_HACIM TL]', hisse: {} };
    for (const s of semboller) {
      const h = await (await fetch(`https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${s}`, { headers: UA })).text();
      const re = /<tr class="temettugercekvarrow \d+"><td>(\w+)<\/td><td class="text-right" data-order="(\d{8})">[^<]*<\/td><td class="text-right">([^<]*)<\/td><td class="text-right">([\d.,]+)<\/td>/g;
      const m0 = new Map(); let m;
      while ((m = re.exec(h))) {
        if (m[1] !== s) continue; const d = m[2], t = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
        m0.set(t, { tarih: t, brutTL: +m[4].replace(/\./g, '').replace(',', '.'), verim: +(m[3].replace(/\./g, '').replace(',', '.')) || null });
      }
      tem.hisse[s] = [...m0.values()].sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
      const j = await (await fetch(`https://www.isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/Data.aspx/HisseTekil?hisse=${s}&startdate=01-01-2011&enddate=${tarih(Date.now()).split('-').reverse().join('-')}`, { headers: UA })).json();
      fiy.hisse[s] = (j.value || []).map(x => { const [d, mo, y] = x.HGDG_TARIH.split('-'); return [`${y}-${mo}-${d}`, x.HG_KAPANIS, x.HGDG_KAPANIS, Math.round(x.HG_HACIM || 0)]; });
      console.log(`  ${s}: temettü ${tem.hisse[s].length}, fiyat ${fiy.hisse[s].length}`);
      await bekle(400);
    }
    fs.writeFileSync(path.join(TDIR, 'isyatirim-temettu.json'), JSON.stringify(tem));
    fs.writeFileSync(path.join(TDIR, 'isyatirim-fiyat.json'), JSON.stringify(fiy));
  }
  if (!ne || ne === '1s') {
    fs.mkdirSync(SDIR, { recursive: true });
    for (const y of [...semboller.map(s => s + '.IS'), 'XU030.IS']) {
      let x = null;
      for (let k = 0; k < 3 && !x; k++) {
        try {
          const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${y}?range=730d&interval=1h`, { headers: UA });
          if (r.ok) x = (await r.json()).chart.result[0];
        } catch (e) { /* tekrar */ }
        if (!x) await bekle(1500);
      }
      if (!x || !x.timestamp) { console.log(`  ✗ ${y}`); continue; }
      const q = x.indicators.quote[0];
      const out = { sembol: y, kaynak: 'Yahoo v8 chart 1h range=730d', indirme: new Date().toISOString(), t: [], o: [], c: [], v: [] };
      for (let i = 0; i < x.timestamp.length; i++) if (q.close[i] != null) { out.t.push(x.timestamp[i] * 1000); out.o.push(q.open[i]); out.c.push(q.close[i]); out.v.push(q.volume[i] || 0); }
      fs.writeFileSync(path.join(SDIR, y.replace(/[^A-Z0-9.]/gi, '_') + '.json'), JSON.stringify(out));
      console.log(`  ${y}: ${out.t.length} çubuk`);
      await bekle(300);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// VERİ
// ═════════════════════════════════════════════════════════════════════════════
const oku = ad => JSON.parse(fs.readFileSync(path.join(DIR, ad + '.json'), 'utf8'));
const duzeltmeler = [];
function hisseYukle(s) {
  const dosya = path.join(DIR, s + '.IS.json');
  if (!fs.existsSync(dosya)) return null;
  const v = JSON.parse(fs.readFileSync(dosya, 'utf8'));
  const g = v.gunler.filter(x => x.v > 0 && x.c > 0 && x.ac > 0 && x.o > 0 && x.t < SON_VERI);
  const satir = g.map(x => ({ t: x.t, o: x.o, c: x.c, ac: x.ac, v: x.v, ciro: x.c * x.v, dp: 0, dpNet: 0 }));
  // Artefakt (bist-strateji ile aynı ölçüt, düzeltilmiş kapanışta): o günün getirisi 0 → geçmiş ham fiyatlar ölçeklenir.
  for (let i = satir.length - 1; i >= 1; i--) {
    const r = satir[i].ac / satir[i - 1].ac - 1;
    if (Math.abs(r) > 0.25 && satir[i].t - satir[i - 1].t <= 7 * GUN) {
      const k = satir[i].c / satir[i - 1].c, ka = satir[i].ac / satir[i - 1].ac;
      for (let j = 0; j < i; j++) { satir[j].o *= k; satir[j].c *= k; satir[j].ac *= ka; }
      satir[i].artefakt = true;
      if (satir[i].t >= Date.UTC(2010, 0, 1)) duzeltmeler.push(`${s} ${tarih(satir[i].t)} ${yz(r, 1)}`);
    }
  }
  return { satir, ham: v };
}

const HAVUZ = [...new Set([...GUNCEL, ...ESKI])];
const hisse = new Map(), hamVeri = new Map();
for (const s of HAVUZ) { const x = hisseYukle(s); if (x && x.satir.length) { hisse.set(s, x.satir); hamVeri.set(s, x.ham); } }

// ── Temettü birleştirme (kural ölçümden ÖNCE sabitlendi; bkz. dönüş raporu) ──
const ISY_T = JSON.parse(fs.readFileSync(path.join(TDIR, 'isyatirim-temettu.json'), 'utf8')).hisse;
const ISY_F = JSON.parse(fs.readFileSync(path.join(TDIR, 'isyatirim-fiyat.json'), 'utf8')).hisse;
const temKayit = { olay: 0, ikisi: 0, tarihCakisma: [], tutarFark: [], yalnizYahoo: [], yalnizIsy: [], atilan: [] };
for (const [s, satir] of hisse) {
  const ham = hamVeri.get(s), idx = new Map(satir.map((x, i) => [tarih(x.t), i]));
  const nom = new Map((ISY_F[s] || []).filter(x => x[1] > 0).map(x => [x[0], x[1]]));
  const nomTar = [...nom.keys()].sort();
  const nomOnce = d => { let lo = 0, hi = nomTar.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (nomTar[m] < d) { r = nomTar[m]; lo = m + 1; } else hi = m - 1; } return r; };
  const Y = ham.temettu.filter(e => e.t >= Date.UTC(2011, 6, 1) && e.t < SON_VERI).map(e => ({ d: tarih(e.t + 3 * 3600e3), D: e.miktar }));
  const I = (ISY_T[s] || []).filter(e => e.tarih >= '2011-07-01' && tarih(SON_VERI) > e.tarih);
  const kul = new Set(), olaylar = [];
  for (const y of Y) {
    const j = I.findIndex((e, k) => !kul.has(k) && Math.abs(Date.parse(e.tarih) - Date.parse(y.d)) <= 6 * GUN);
    if (j >= 0) kul.add(j);
    olaylar.push({ y, i: j >= 0 ? I[j] : null });
  }
  I.forEach((e, k) => { if (!kul.has(k)) olaylar.push({ y: null, i: e }); });
  for (const { y, i } of olaylar) {
    const d = y ? y.d : i.tarih;                       // çakışmada Yahoo tarihi
    if (y && i && y.d !== i.tarih) temKayit.tarihCakisma.push(`${s} Y ${y.d} / İşY ${i.tarih}`);
    const k = idx.get(d);
    if (k == null || k < 1) { temKayit.atilan.push(`${s} ${d} (ex-gün işlem yok)`); continue; }
    let dpY = null, dpI = null;
    if (y) dpY = y.D / satir[k - 1].c;
    if (i) { const cn = nomOnce(i.tarih <= d ? i.tarih : d); if (cn && nom.get(cn) > 0) dpI = i.brutTL / nom.get(cn); }
    // Yahoo ham c artefakt düzeltmesiyle ölçeklendiyse dpY yanlış olur → yalnız İşY yoksa kullanılır.
    let dp = dpI != null ? dpI : dpY;
    if (y && i && dpI != null) { temKayit.ikisi++; if (Math.abs(dpY / dpI - 1) > 0.05) temKayit.tutarFark.push(`${s} ${d} D/P Yahoo ${yz(dpY)} İşY ${yz(dpI)}`); }
    if (y && !i) temKayit.yalnizYahoo.push(`${s} ${d} ${yz(dpY)}`);
    if (!y && i) temKayit.yalnizIsy.push(`${s} ${d} ${yz(dpI)}`);
    if (!(dp > 0) || dp > 0.30) { temKayit.atilan.push(`${s} ${d} D/P ${yz(dp)}`); continue; }
    satir[k].dp += dp; satir[k].dpNet += dp * (1 - stopaj(satir[k].t));
    temKayit.olay++;
  }
}

// ── Takvim, hizalama ─────────────────────────────────────────────────────────
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
  // Net toplam getiri endeksi (kendi satırlarında): TRI_k = TRI_{k-1} · (c_k/c_{k-1} + dpNet_k)
  const tri = new Float64Array(satir.length); tri[0] = 1;
  for (let i = 1; i < satir.length; i++) tri[i] = tri[i - 1] * (satir[i].c / satir[i - 1].c + satir[i].dpNet);
  H.set(s, { s, satir, bar, sonIdx, tri, kendiIdx: new Map(satir.map((x, i) => [x.t, i])) });
}
const triKap = (h, d) => (h.sonIdx[d] >= 0 ? h.tri[h.sonIdx[d]] : NaN);
/** d günü AÇILIŞINDA satış değeri (TRI ölçeğinde): önceki kapanış TRI × (o_d / c_önceki + dpNet_d). */
function triAcilis(h, d) {
  const b = h.bar[d]; if (!b) return NaN;
  const k = h.kendiIdx.get(b.t); if (k < 1) return NaN;
  return h.tri[k - 1] * (b.o / h.satir[k - 1].c + b.dpNet);
}

function seriHizala(ad, alan = 'c') {
  const v = oku(ad);
  const sirali = v.gunler.filter(x => x[alan] > 0 && x.t < SON_VERI).sort((a, b) => a.t - b.t);
  const out = new Float64Array(D); let son = NaN, j = 0; const var_ = new Uint8Array(D);
  for (let d = 0; d < D; d++) { while (j < sirali.length && sirali[j].t <= takvim[d]) { son = sirali[j][alan]; if (sirali[j].t === takvim[d]) var_[d] = 1; j++; } out[d] = son; }
  return { out, var_ };
}
const XU = seriHizala('XU030.IS'), XUo = seriHizala('XU030.IS', 'o');
const XU030 = XU.out, XU030_O = XUo.out;
const USD = seriHizala('USDTRY_X').out;
const faizSeri = JSON.parse(fs.readFileSync(path.join(DIR, 'tcmb-politika-faizi.json'), 'utf8')).seri;
const faiz = t => { let r = 0; for (const x of faizSeri) if (x.t <= t) r = x.oran; return r; };
const ppfOran = t => Math.max(0, faiz(t) - PPF_MARJ) * (1 - PPF_STOPAJ);
const ppfBuyume = (d0, d1) => 1 + ppfOran(takvim[d0]) * (takvim[d1] - takvim[d0]) / GUN / 365;

const d0 = takvim.findIndex(t => t >= BAS) - 1;      // 2011 son işlem günü
const dSon = takvim.findIndex(t => t >= SON) === -1 ? D - 1 : takvim.findIndex(t => t >= SON) - 1;

// ── Evren (PIT likidite vekili; bist-strateji.evrenLikidite, n parametreli) ──
function medyan(a) { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
const ayGecis = d => d === D - 1 || new Date(takvim[d + 1]).getUTCMonth() !== new Date(takvim[d]).getUTCMonth();
const evrenOnbellek = new Map();
function evrenSirali(d) {
  if (evrenOnbellek.has(d)) return evrenOnbellek.get(d);
  const aday = [];
  for (const h of H.values()) {
    const k = h.sonIdx[d];
    if (k < 251) continue;
    if (takvim[d] - h.satir[k].t > 10 * GUN) continue;
    const c = []; for (let i = Math.max(0, d - 62); i <= d; i++) c.push(h.bar[i] ? h.bar[i].ciro : 0);
    aday.push([h.s, medyan(c)]);
  }
  const r = aday.sort((a, b) => b[1] - a[1]).map(x => x[0]);
  evrenOnbellek.set(d, r); return r;
}
const ayBasi = []; { let son = -1; for (let d = 0; d < D; d++) { ayBasi[d] = son; if (ayGecis(d)) son = d; } }
/** d gününde geçerli evren: bir önceki ay sonu kapanışında seçilen (ay sonu günü dahil değil). */
const evren = (d, n) => (ayBasi[d] >= 0 ? evrenSirali(ayBasi[d]).slice(0, n) : []);
const haftaSonu = d => d === D - 1 || ((new Date(takvim[d + 1]).getUTCDay() + 6) % 7) <= ((new Date(takvim[d]).getUTCDay() + 6) % 7) || takvim[d + 1] - takvim[d] >= 7 * GUN;
const likiditeTamam = (b, w, d) => b && w * SERMAYE_USD * USD[d] <= LIK_ORAN * b.ciro;

// ═════════════════════════════════════════════════════════════════════════════
// BİNDİRME SİMÜLATÖRÜ (strateji + PPF) — pozisyon listesiyle
// poz: { s, g (giriş günü, kapanışta), x (çıkış günü), tip 'c'|'o', w (girişte özsermaye payı) }
// ═════════════════════════════════════════════════════════════════════════════
function simule(pozlar, maliyet, { faizli = true } = {}) {
  const giris = new Map(), cikisO = new Map(), cikisC = new Map();
  const ekle = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const p of pozlar) { if (p.g < d0 || p.x > dSon) continue; ekle(giris, p.g, p); ekle(p.tip === 'o' ? cikisO : cikisC, p.x, p); }
  let nakit = 1; const acik = new Set(); const egri = [];
  for (let d = d0; d <= dSon; d++) {
    if (d > d0) {
      if (faizli && nakit > 0) nakit *= ppfBuyume(d - 1, d);
      for (const p of cikisO.get(d) || []) {          // açılışta satış (o + temettü)
        const h = H.get(p.s), b = h.bar[d];
        const fiyat = b ? b.o : h.satir[h.sonIdx[d]].c;
        nakit += p.u * (fiyat * (1 - maliyet) + (b ? b.dpNet * h.satir[h.kendiIdx.get(b.t) - 1].c : 0));
        acik.delete(p);
      }
      for (const p of acik) {                          // tutulanlarda ex-gün temettüsü (net) nakde
        const h = H.get(p.s), b = h.bar[d];
        if (b && b.dpNet > 0) nakit += p.u * b.dpNet * h.satir[h.kendiIdx.get(b.t) - 1].c;
      }
      for (const p of cikisC.get(d) || []) {
        const h = H.get(p.s); nakit += p.u * h.satir[h.sonIdx[d]].c * (1 - maliyet); acik.delete(p);
      }
    }
    let oz = nakit; for (const p of acik) { const h = H.get(p.s); oz += p.u * h.satir[h.sonIdx[d]].c; }
    for (const p of giris.get(d) || []) {
      const h = H.get(p.s), c = h.bar[d].c, tutar = p.w * oz;
      p.u = tutar / (c * (1 + maliyet)); nakit -= tutar; acik.add(p);
    }
    let oz2 = nakit; for (const p of acik) { const h = H.get(p.s); oz2 += p.u * h.satir[h.sonIdx[d]].c; }
    egri.push({ time: takvim[d], v: oz2, usd: oz2 / USD[d], d });
  }
  return egri;
}
function ppfEgri(faizli = true) { const e = []; let v = 1; for (let d = d0; d <= dSon; d++) { if (d > d0 && faizli) v *= ppfBuyume(d - 1, d); e.push({ time: takvim[d], v, usd: v / USD[d], d }); } return e; }

function metrik(e, bas = -Infinity, bit = Infinity, alan = 'usd') {
  let i0 = e.findIndex(x => x.time >= bas); if (i0 < 0) return null; if (i0 > 0) i0--;
  const z = e.slice(i0).filter(x => x.time < bit); if (z.length < 3) return null;
  const r = z.slice(1).map((x, i) => x[alan] / z[i][alan] - 1);
  const o = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - o) ** 2, 0) / (r.length - 1));
  let tepe = z[0][alan], dd = 0;
  for (const x of z) { tepe = Math.max(tepe, x[alan]); dd = Math.max(dd, 1 - x[alan] / tepe); }
  const yil = (z[z.length - 1].time - z[0].time) / (365.25 * GUN), top = z[z.length - 1][alan] / z[0][alan] - 1;
  return { cagr: Math.pow(1 + top, 1 / yil) - 1, maxDD: dd, sharpe: sd > 0 ? o / sd * Math.sqrt(252) : 0, toplam: top };
}
function pUstun(e, kiyas) {
  const satir = e.slice(1).map((x, i) => [x.usd / e[i].usd - 1, kiyas[i + 1].usd / kiyas[i].usd - 1]);
  const k = O.duraganBootstrap(satir, { b: 20, N: 2000, H: satir.length, tohum: 99, olc: yol => { let x = 1, y = 1; for (const [p, q] of yol) { x *= 1 + p; y *= 1 + q; } return x > y ? 1 : 0; } });
  return k.reduce((s, x) => s + x, 0) / k.length;
}

// ── Olay istatistikleri ─────────────────────────────────────────────────────
function ist(r) {
  const n = r.length; if (!n) return { n: 0 };
  const o = r.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(r.reduce((a, b) => a + (b - o) ** 2, 0) / (n - 1)) : NaN;
  return { n, ort: o, t: sd > 0 ? o / (sd / Math.sqrt(n)) : NaN, isabet: r.filter(x => x > 0).length / n, medyan: medyan(r) };
}
/** olaylar: [{t (giriş zamanı), brut (maliyetsiz getiri), gd (G-D maliyet çarpanı: kaç tek yön)}] */
function olayOzet(olaylar, sen) {
  const m = MALIYET[sen];
  const net = o => o.brut - (o.yon || 2) * m;
  const tum = olaylar.map(net), gel = olaylar.filter(o => o.t < HOL).map(net), hol = olaylar.filter(o => o.t >= HOL).map(net);
  const yil = {};
  for (const o of olaylar) { const y = new Date(o.t).getUTCFullYear(); (yil[y] = yil[y] || []).push(net(o)); }
  const yilToplam = Object.fromEntries(Object.entries(yil).map(([y, a]) => [y, a.reduce((p, q) => p + q, 0)]));
  const yillar = Object.keys(yilToplam).filter(y => +y >= 2012 && +y <= 2026);
  const pozYil = yillar.filter(y => yilToplam[y] > 0).length;
  return { tum: ist(tum), gel: ist(gel), hol: ist(hol), yilToplam, pozYil, yilSay: yillar.length };
}

// ═════════════════════════════════════════════════════════════════════════════
// ADAYLAR
// ═════════════════════════════════════════════════════════════════════════════
const sonuc = { tarih: new Date().toISOString(), mod: GELISTIRME ? 'geliştirme (2012-01 → 2020-12)' : 'tüm dönem (holdout dahil)', donem: `${tarih(takvim[d0 + 1])} → ${tarih(takvim[dSon])}`, adaylar: {} };
const sayac_lik = {};

// ── T1 (585) temettü ex-gün ────────────────────────────────────────────────
function t1() {
  const olay = [], poz = [], teshis = [];
  let likDisi = 0, kumYok = 0;
  const gunMap = new Map();
  for (let d = d0 + 1; d <= dSon; d++) {
    const ev50 = evren(d - 1, 50), ev30 = new Set(evren(d - 1, 30));
    for (const s of ev50) {
      const h = H.get(s), b = h.bar[d];
      if (!b || !(b.dp > 0)) continue;
      if (!h.bar[d - 1]) { kumYok++; continue; }        // ex-günden önceki işlem günü hissede işlem yok
      const cum = h.bar[d - 1];
      if (!(takvim[d] >= BAS)) continue;
      const net = (b.o + b.dpNet * cum.c / (1 + 0) * (1 / ppfBuyume(d, Math.min(d + 2, D - 1)))) / cum.c - 1; // temettü 2 iş günü gecikmeli → PPF iskontosu
      const ol = { s, t: takvim[d - 1], ex: tarih(takvim[d]), brut: net, dp: b.dp, ilk30: ev30.has(s), gun: b.c / b.o - 1, xu: XU030_O[d] / XU030[d - 1] - 1, xuVar: XU.var_[d] && XUo.var_[d] };
      olay.push(ol);
      if (!gunMap.has(d)) gunMap.set(d, []); gunMap.get(d).push(ol);
    }
  }
  // Bindirme: o geceki tüm olaylara sermaye eşit bölünür (likidite tavanı aşan elenir).
  for (const [d, a] of gunMap) {
    const w = 1 / a.length;
    for (const ol of a) { if (!likiditeTamam(H.get(ol.s).bar[d - 1], w, d - 1)) { likDisi++; ol.likDisi = true; continue; } poz.push({ s: ol.s, g: d - 1, x: d, tip: 'o', w }); }
  }
  return { olay, poz, ek: { likiditeDisi: likDisi, cumGunuIslemYok: kumYok, olayGunu: gunMap.size } };
}

// ── T2 (586) ay dönümü ─────────────────────────────────────────────────────
function t2() {
  const olay = [], poz = [], xu = [], kalan = [];
  for (let d = d0; d <= dSon; d++) {
    if (!ayGecis(d)) continue;
    const x = d + 3; if (x > dSon) break;
    const ev = evrenSirali(d).slice(0, 30).filter(s => H.get(s).bar[d]);
    if (takvim[d + 1] < BAS) continue;
    const r = ev.map(s => { const h = H.get(s); return triKap(h, x) / triKap(h, d) - 1; });
    olay.push({ t: takvim[d], brut: r.reduce((a, b) => a + b, 0) / r.length, n: ev.length });
    for (const s of ev) if (likiditeTamam(H.get(s).bar[d], 1 / ev.length, d)) poz.push({ s, g: d, x, tip: 'c', w: 1 / ev.length }); else sayac_lik.T2 = (sayac_lik.T2 || 0) + 1;
    xu.push({ t: takvim[d], brut: XU030[x] / XU030[d] - 1 });
    // Ayın geri kalanı (3. gün kapanışı → sonraki ay sonu), aynı sepet — betimleyici
    let e = x; while (e < dSon && !ayGecis(e)) e++;
    if (ayGecis(e) && e > x) kalan.push({ t: takvim[x], brut: ev.reduce((a, s) => a + triKap(H.get(s), e) / triKap(H.get(s), x) - 1, 0) / ev.length, gun: e - x });
  }
  // Bayram öncesi: ≥2 hafta içi günün işlemsiz geçtiği kapanıştan önce [T−2 kapanış → T−1 kapanış]
  const bayram = [];
  for (let d = Math.max(d0 + 2, 2); d < dSon; d++) {
    let haftaIci = 0; for (let t = takvim[d] + GUN; t < takvim[d + 1]; t += GUN) { const g = new Date(t).getUTCDay(); if (g !== 0 && g !== 6) haftaIci++; }
    if (haftaIci < 2 || takvim[d] < BAS) continue;
    const ev = evren(d, 30).filter(s => H.get(s).bar[d] && H.get(s).bar[d - 1]);
    const r = ev.reduce((a, s) => a + triKap(H.get(s), d) / triKap(H.get(s), d - 1) - 1, 0) / ev.length;
    bayram.push({ t: takvim[d - 1], arife: tarih(takvim[d]), tatilGun: haftaIci, brut: r, xu: XU030[d] / XU030[d - 1] - 1 });
  }
  return { olay, poz, ek: { xu, kalan, bayram } };
}

// ── T3 (587 koşullu / 588 koşulsuz) haftalık ters dönüş ───────────────────
function t3secim(d, kosullu, fiyat5 = null) {
  if (kosullu && !(XU030[d] / XU030[d - 20] - 1 < 0)) return [];
  const xu5 = XU030[d] / XU030[d - 5] - 1;
  const sk = [];
  for (const s of evren(d, 50)) {
    const h = H.get(s); if (!h.bar[d] || h.sonIdx[d - 5] < 0) continue;
    const r5 = fiyat5 ? fiyat5(s, d) : triKap(h, d) / triKap(h, d - 5) - 1;
    if (!isFinite(r5)) continue;
    sk.push([s, r5 - xu5]);
  }
  return sk.sort((a, b) => a[1] - b[1]).slice(0, 5).map(x => x[0]);
}
function t5secim(d, hacim = null) {
  const sk = [];
  for (const s of evren(d, 50)) {
    const h = H.get(s); if (!h.bar[d] || h.sonIdx[d - 5] < 0 || d < 55) continue;
    let vh = 0, v50 = 0;
    for (let i = d - 4; i <= d; i++) vh += h.bar[i] ? h.bar[i].v : 0;
    if (hacim) vh = hacim(s, d, vh);
    for (let i = d - 54; i <= d - 5; i++) v50 += h.bar[i] ? h.bar[i].v : 0;
    const ort = v50 / 10; if (!(ort > 0) || vh == null) continue;
    const r5 = triKap(h, d) / triKap(h, d - 5) - 1;
    if (vh / ort >= 3 && Math.abs(r5) < 0.05) sk.push([s, vh / ort]);
  }
  return sk.sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
}
function haftalik(secici, ad) {
  const olay = [], poz = [];
  const hs = []; for (let d = d0; d <= dSon; d++) if (haftaSonu(d)) hs.push(d);
  for (let i = 0; i < hs.length - 1; i++) {
    const d = hs[i], x = hs[i + 1]; if (takvim[d] < BAS - 7 * GUN || d < 60) continue;
    if (x > dSon) break;
    const sec = secici(d); if (!sec.length) continue;
    const r = sec.map(s => triKap(H.get(s), x) / triKap(H.get(s), d) - 1);
    olay.push({ t: takvim[d], brut: r.reduce((a, b) => a + b, 0) / r.length, sec });
    for (const s of sec) if (likiditeTamam(H.get(s).bar[d], 0.2, d)) poz.push({ s, g: d, x, tip: 'c', w: 0.2 }); else sayac_lik[ad] = (sayac_lik[ad] || 0) + 1;
  }
  return { olay, poz, ek: { hafta: hs.length } };
}

// ── T4 (590) gece / gündüz ─────────────────────────────────────────────────
function t4() {
  const olay = [], poz = [], gece = {}, gunduz = {}, xuGece = {}, xuGunduz = {};
  const ekle = (m, y, r) => { (m[y] = m[y] || []).push(r); };
  for (let d = d0; d < dSon; d++) {
    const x = d + 1, y = new Date(takvim[x]).getUTCFullYear(); if (takvim[x] < BAS) continue;
    const ev = evren(d, 30).filter(s => H.get(s).bar[d] && H.get(s).bar[x]);
    if (!ev.length) continue;
    const rg = ev.map(s => triAcilis(H.get(s), x) / triKap(H.get(s), d) - 1);
    const rgun = ev.map(s => H.get(s).bar[x].c / H.get(s).bar[x].o - 1);
    const ort = a => a.reduce((p, q) => p + q, 0) / a.length;
    olay.push({ t: takvim[d], brut: ort(rg) });
    ekle(gece, y, ort(rg)); ekle(gunduz, y, ort(rgun));
    if (XU.var_[d] && XU.var_[x] && XUo.var_[x]) { ekle(xuGece, y, XU030_O[x] / XU030[d] - 1); ekle(xuGunduz, y, XU030[x] / XU030_O[x] - 1); }
    for (const s of ev) if (likiditeTamam(H.get(s).bar[d], 1 / ev.length, d)) poz.push({ s, g: d, x, tip: 'o', w: 1 / ev.length }); else sayac_lik.T4 = (sayac_lik.T4 || 0) + 1;
  }
  const yillik = m => Object.fromEntries(Object.entries(m).map(([y, a]) => [y, { n: a.length, ort: a.reduce((p, q) => p + q, 0) / a.length, top: a.reduce((p, q) => p * (1 + q), 1) - 1 }]));
  return { olay, poz, ek: { gece: yillik(gece), gunduz: yillik(gunduz), xuGece: yillik(xuGece), xuGunduz: yillik(xuGunduz) } };
}

// ── EW al-tut (bilgi): ay sonu → ay sonu, ilk-30, temettü net, A maliyeti ──
function ewAltutPoz() {
  const poz = []; let onceki = null;
  for (let d = d0; d <= dSon; d++) {
    if (!ayGecis(d) && d !== d0) continue;
    if (onceki != null) { const ev = evrenSirali(onceki).slice(0, 30).filter(s => H.get(s).bar[onceki]); for (const s of ev) poz.push({ s, g: onceki, x: d, tip: 'c', w: 1 / ev.length }); }
    onceki = d;
  }
  return poz;
}

// ═════════════════════════════════════════════════════════════════════════════
// KOŞU
// ═════════════════════════════════════════════════════════════════════════════
if (process.argv.includes('--indir')) { const i = process.argv.indexOf('--indir'); indir(process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null).then(() => console.log('bitti')); }
else kos();

function kos() {
  console.log(`BIST HAFTALIK — ${sonuc.mod}; analiz ${sonuc.donem}; ${hisse.size} hisse, takvim ${D} gün`);
  console.log(`Temettü birleştirme: ${temKayit.olay} olay (2011-07+), iki kaynakta ${temKayit.ikisi}; tarih çakışması ${temKayit.tarihCakisma.length} (Yahoo tarihi kullanıldı); D/P farkı >%5: ${temKayit.tutarFark.length} (İşY kullanıldı); yalnız Yahoo ${temKayit.yalnizYahoo.length}; yalnız İşY ${temKayit.yalnizIsy.length}; atılan ${temKayit.atilan.length}`);
  console.log(`Artefakt düzeltmeleri: ${duzeltmeler.join(' · ')}`);

  const ppf = ppfEgri(true), sifir = ppfEgri(false);
  const xuEgri = takvim.slice(d0, dSon + 1).map((t, j) => ({ time: t, v: XU030[d0 + j], usd: XU030[d0 + j] / USD[d0 + j] }));
  const ewE = simule(ewAltutPoz(), MALIYET.A, { faizli: true });
  const kiyas = { PPF: metrik(ppf), XU030: metrik(xuEgri), EW: metrik(ewE), PPF_gel: metrik(ppf, -Infinity, HOL), PPF_hol: metrik(ppf, HOL), XU030_gel: metrik(xuEgri, -Infinity, HOL), XU030_hol: metrik(xuEgri, HOL), EW_gel: metrik(ewE, -Infinity, HOL), EW_hol: metrik(ewE, HOL) };
  sonuc.kiyas = kiyas;

  const T1 = t1(), T2 = t2(), T3k = haftalik(d => t3secim(d, true), 'T3k'), T3s = haftalik(d => t3secim(d, false), 'T3s'), T5 = haftalik(d => t5secim(d), 'T5'), T4 = t4();
  const adaylar = [['T1', 585, 'Nakit temettü ex-gün (cum kapanış → ex açılış)', T1], ['T2', 586, 'Ay dönümü (son gün kapanış → 3. gün kapanış), EW ilk-30', T2],
    ['T3k', 587, 'Koşullu haftalık ters dönüş (XU030 20g<0), en kötü 5', T3k], ['T3s', 588, 'Koşulsuz haftalık ters dönüş, en kötü 5', T3s],
    ['T5', 589, 'Hacim primi 1 hafta (hacim ≥3×, |r|<%5), en çok 5', T5], ['T4', 590, 'Gece sepeti (kapanış → ertesi açılış), EW ilk-30', T4]];

  for (const [kod, no, ad, R] of adaylar) {
    const sen = {}; for (const k of ['A', 'B', 'C']) sen[k] = olayOzet(R.olay, k);
    const eA = simule(R.poz.map(p => ({ ...p })), MALIYET.A), eB = simule(R.poz.map(p => ({ ...p })), MALIYET.B), eA0 = simule(R.poz.map(p => ({ ...p })), MALIYET.A, { faizli: false });
    const mA = metrik(eA), mAg = metrik(eA, -Infinity, HOL), mAh = metrik(eA, HOL), mB = metrik(eB), mA0 = metrik(eA0), m0 = metrik(sifir);
    const P = pUstun(eA, ppf), PB = pUstun(eB, ppf);
    const a = sen.A, b = sen.B;
    const k1 = GELISTIRME ? null : a.hol.ort > 0 && a.hol.t > 2;
    const k2 = GELISTIRME ? null : a.gel.ort > 0 && a.hol.ort > 0;
    const k3 = mA.cagr > kiyas.PPF.cagr && P >= 0.80;
    const k4 = a.yilSay > 0 && a.pozYil / a.yilSay >= 0.70;
    const k5 = GELISTIRME ? null : b.hol.ort > 0 && b.hol.t > 2;
    const yalnizA = kod === 'T4';
    const kabul = [k1, k2, k3, k4, yalnizA ? true : k5];
    const maruz = R.poz.reduce((s, p) => s + (p.x - p.g) * p.w, 0) / (dSon - d0);
    sonuc.adaylar[kod] = {
      deneme: no, ad, olay: { A: sen.A, B: sen.B, C: sen.C }, ek: R.ek,
      usd: { A: { tum: mA, gel: mAg, hol: mAh, P }, B: { tum: mB, P: PB }, A_faizsiz: mA0, faizsizNakit: m0 },
      yilToplamA: a.yilToplam, maruziyetGunPay: maruz,
      kabul: { k1, k2, k3, k4, k5: yalnizA ? 'uygulanmaz (yalnız A)' : k5, gecti: GELISTIRME ? null : kabul.every(Boolean) },
    };
    const fmt = s => `n ${s.n} ort ${yz(s.ort, 3)} t ${sy(s.t)} isabet ${yz(s.isabet, 0)}`;
    console.log(`\n${'═'.repeat(120)}\n${kod} (${no}) ${ad}\n${'═'.repeat(120)}`);
    for (const k of ['A', 'B', 'C']) console.log(`  ${k}: tüm ${fmt(sen[k].tum)} | gel ${fmt(sen[k].gel)} | hold ${fmt(sen[k].hol)} | pozitif yıl ${sen[k].pozYil}/${sen[k].yilSay}`);
    console.log(`  USD strateji+PPF (A): CAGR ${yz(mA.cagr)} (gel ${yz(mAg.cagr)} · hold ${mAh ? yz(mAh.cagr) : '—'}) DD ${yz(mA.maxDD, 1)} Sh ${sy(mA.sharpe)} · P(>PPF) ${sy(P)} | B: CAGR ${yz(mB.cagr)} P ${sy(PB)} | yalnız PPF ${yz(kiyas.PPF.cagr)} | faizsiz: strateji ${yz(mA0.cagr)} vs nakit ${yz(m0.cagr)} | maruziyet ${yz(maruz, 1)}`);
    console.log(`  yıllık (A, olay net toplamı): ${Object.entries(a.yilToplam).map(([y, v]) => `${y} ${yz(v, 1)}`).join(' · ')}`);
    const f = x => (x == null ? '·' : x === true ? '✓' : x === false ? '✗' : '–');
    console.log(`  KABUL: (1) hold ort>0,t>2 ${f(k1)} (2) gel&hold>0 ${f(k2)} (3) USD>PPF,P≥0,80 ${f(k3)} (4) yıl≥%70 ${f(k4)} (5) B ${yalnizA ? '– (yalnız A)' : f(k5)} → ${GELISTIRME ? 'holdout bekleniyor' : kabul.every(Boolean) ? 'GEÇTİ' : 'RED'}`);
  }

  // ── T1 alt gruplar ve teşhis ──
  {
    const ol = T1.olay, net = o => o.brut - 2 * MALIYET.A;
    const dps = ol.map(o => o.dp).sort((a, b) => a - b), q1 = dps[Math.floor(dps.length / 3)], q2 = dps[Math.floor(2 * dps.length / 3)];
    const grup = { [`D/P alt (<${yz(q1)})`]: ol.filter(o => o.dp < q1), [`D/P orta`]: ol.filter(o => o.dp >= q1 && o.dp < q2), [`D/P üst (≥${yz(q2)})`]: ol.filter(o => o.dp >= q2), 'ilk-30 içi': ol.filter(o => o.ilk30), 'ilk-30 dışı (31–50)': ol.filter(o => !o.ilk30) };
    const ag = {};
    console.log('\n  T1 alt gruplar (A, yalnız rapor):');
    for (const [k, a] of Object.entries(grup)) { const g = ist(a.filter(o => o.t < HOL).map(net)), h = ist(a.filter(o => o.t >= HOL).map(net)), t = ist(a.map(net)); ag[k] = { tum: t, gel: g, hol: h }; console.log(`    ${k.padEnd(24)} tüm n ${t.n} ort ${yz(t.ort, 3)} t ${sy(t.t)} | gel n ${g.n} ${yz(g.ort, 3)} t ${sy(g.t)} | hold n ${h.n} ${h.n ? yz(h.ort, 3) : '—'} t ${sy(h.t)}`); }
    const gun = ist(ol.map(o => o.gun)), xu = ist(ol.filter(o => o.xuVar).map(o => o.xu));
    const fazla = ist(ol.filter(o => o.xuVar).map(o => o.brut - o.xu));
    // gün kümeli t (aynı gecenin olayları ortalanır)
    const km = new Map(); for (const o of ol) { if (!km.has(o.t)) km.set(o.t, []); km.get(o.t).push(net(o)); }
    const kum = ist([...km.values()].map(a => a.reduce((p, q) => p + q, 0) / a.length));
    const kumH = ist([...km.entries()].filter(([t]) => t >= HOL).map(([, a]) => a.reduce((p, q) => p + q, 0) / a.length));
    console.log(`    teşhis: ex-gün açılış→kapanış ort ${yz(gun.ort, 3)} t ${sy(gun.t)} · aynı gece XU030 ${yz(xu.ort, 3)} · T1 brüt − XU030 gece ${yz(fazla.ort, 3)} t ${sy(fazla.t)} · gün kümeli (A) tüm n ${kum.n} ${yz(kum.ort, 3)} t ${sy(kum.t)} / hold t ${sy(kumH.t)}`);
    sonuc.adaylar.T1.altGrup = ag; sonuc.adaylar.T1.teshis = { exGunAcilisKapanis: gun, ayniGeceXU030: xu, T1eksiXU030: fazla, gunKumeliA: kum, gunKumeliA_hol: kumH };
  }
  // ── T2 betimleyici ──
  {
    const e = T2.ek, xu = ist(e.xu.map(o => o.brut)), kal = ist(e.kalan.map(o => o.brut / o.gun * 3)), bay = ist(e.bayram.map(o => o.brut)), bayx = ist(e.bayram.map(o => o.xu));
    console.log(`\n  T2 betimleyici: XU030 aynı pencere ort ${yz(xu.ort, 3)} t ${sy(xu.t)} (n ${xu.n}) · sepet ayın geri kalanı (3 güne ölçekli) ${yz(kal.ort, 3)} · bayram öncesi [T−2→T−1] EW ${yz(bay.ort, 3)} t ${sy(bay.t)} n ${bay.n} / XU030 ${yz(bayx.ort, 3)} t ${sy(bayx.t)}`);
    console.log(`    bayram tarihleri (arife): ${e.bayram.map(b => b.arife).join(' ')}`);
    sonuc.adaylar.T2.betimleyici = { XU030ayniPencere: xu, ayinGeriKalani3gun: kal, bayramEW: bay, bayramXU030: bayx, bayramlar: e.bayram };
  }
  // ── T4 teşhis ──
  {
    const e = T4.ek; console.log('\n  T4 teşhis (yıl: EW ilk-30 gece / gündüz ort, XU030 gece / gündüz ort; %):');
    for (const y of Object.keys(e.gece)) console.log(`    ${y}: EW ${yz(e.gece[y].ort, 3)} / ${yz(e.gunduz[y].ort, 3)} · XU030 ${e.xuGece[y] ? yz(e.xuGece[y].ort, 3) : '—'} / ${e.xuGunduz[y] ? yz(e.xuGunduz[y].ort, 3) : '—'} (yıllık birikim EW gece ${yz(e.gece[y].top, 0)}, gündüz ${yz(e.gunduz[y].top, 0)})`);
  }
  console.log(`\n  Likidite tavanı (${SERMAYE_USD} USD sermaye, ≤%1 günlük TL hacim) dışında kalan pozisyon: ${JSON.stringify({ T1: T1.ek.likiditeDisi, ...sayac_lik })}`);
  console.log(`  Kıyas USD: PPF ${yz(kiyas.PPF.cagr)} (gel ${yz(kiyas.PPF_gel.cagr)} / hold ${kiyas.PPF_hol ? yz(kiyas.PPF_hol.cagr) : '—'}) · XU030 al-tut ${yz(kiyas.XU030.cagr)} DD ${yz(kiyas.XU030.maxDD, 1)} (hold ${kiyas.XU030_hol ? yz(kiyas.XU030_hol.cagr) : '—'}) · EW al-tut ${yz(kiyas.EW.cagr)} DD ${yz(kiyas.EW.maxDD, 1)} (hold ${kiyas.EW_hol ? yz(kiyas.EW_hol.cagr) : '—'})`);

  // ── 17:30 ↔ kapanış sıralama farkı (son 730 g, 1 saatlik) ──
  if (!GELISTIRME && fs.existsSync(SDIR)) sonuc.saat1730 = saat1730(T3k, T3s, T5);

  // ── Borsadan çıkanlar ──
  sonuc.yahoodaYok = HAVUZ.filter(s => !hisse.has(s));
  console.log(`\n  Yahoo'da olmayan (borsadan çıkan / kod değiştiren) havuz üyeleri: ${sonuc.yahoodaYok.join(' ')}`);
  sonuc.temettuBirlestirme = temKayit; sonuc.artefakt = duzeltmeler; sonuc.likiditeDisi = { T1: T1.ek.likiditeDisi, ...sayac_lik };
  sonuc.varsayim = { maliyetTekYon: MALIYET, ppf: `politika − %${PPF_MARJ * 100}, stopaj %${PPF_STOPAJ * 100}`, sermayeUSD: SERMAYE_USD, likiditeOran: LIK_ORAN, temettuStopaj: '%10 (<2024-12-22), %15' };
  fs.mkdirSync(ADIR, { recursive: true });
  const dosya = path.join(ADIR, GELISTIRME ? 'bist-haftalik-gelistirme.json' : 'bist-haftalik.json');
  fs.writeFileSync(dosya, JSON.stringify(sonuc, null, 1));
  console.log(`\nYazıldı: ${path.relative(ROOT, dosya)}`);
}

function saat1730(T3k, T3s, T5) {
  const saat = new Map();   // sembol → Map(gün t → {c1730, vKadar})
  for (const s of H.keys()) {
    const f = path.join(SDIR, s + '.IS.json'); if (!fs.existsSync(f)) continue;
    const v = JSON.parse(fs.readFileSync(f, 'utf8')); const m = new Map();
    for (let i = 0; i < v.t.length; i++) {
      const z = new Date(v.t[i] + 3 * 3600e3), gun = Date.UTC(z.getUTCFullYear(), z.getUTCMonth(), z.getUTCDate()), dk = z.getUTCHours() * 60 + z.getUTCMinutes();
      if (dk > 16 * 60 + 30) continue;                 // 16:30 çubuğunun kapanışı = 17:30 fiyatı
      const x = m.get(gun) || { c: null, v: 0, son: -1 };
      x.v += v.v[i]; if (dk >= x.son) { x.son = dk; x.c = v.c[i]; }
      m.set(gun, x);
    }
    saat.set(s, m);
  }
  const xf = path.join(SDIR, 'XU030.IS.json'); const xm = new Map();
  if (fs.existsSync(xf)) { const v = JSON.parse(fs.readFileSync(xf, 'utf8')); for (let i = 0; i < v.t.length; i++) { const z = new Date(v.t[i] + 3 * 3600e3), gun = Date.UTC(z.getUTCFullYear(), z.getUTCMonth(), z.getUTCDate()), dk = z.getUTCHours() * 60 + z.getUTCMinutes(); if (dk <= 16 * 60 + 30) { const x = xm.get(gun) || { son: -1 }; if (dk >= x.son) { x.son = dk; x.c = v.c[i]; } xm.set(gun, x); } } }
  const ilk = Math.min(...[...saat.values()].map(m => Math.min(...m.keys())));
  const sonuclar = {};
  for (const [kod, R, kos] of [['T3k', T3k, true], ['T3s', T3s, false], ['T5', T5, null]]) {
    let n = 0, ortak = 0, toplam = 0, farkR = []; const hs = [];
    for (let d = d0; d <= dSon; d++) if (haftaSonu(d)) hs.push(d);
    for (let i = 0; i < hs.length - 1; i++) {
      const d = hs[i], x = hs[i + 1]; if (takvim[d] < ilk + 7 * GUN) continue;
      const t = takvim[d]; if (!xm.has(t)) continue;
      const xuSaat = xm.get(t).c;
      let sec1730;
      if (kod === 'T5') sec1730 = t5secim(d, (s, dd, vh) => { const m = saat.get(s); if (!m || !m.has(t)) return null; return vh - H.get(s).bar[d].v + m.get(t).v; });
      else {
        // 17:30 fiyatıyla 5 g getirisi; XU030 da 17:30; koşul da 17:30 XU030 ile
        if (kos && !(xuSaat / XU030[d - 20] - 1 < 0)) sec1730 = [];
        else {
          const xu5 = xuSaat / XU030[d - 5] - 1;
          const sk = [];
          for (const s of evren(d, 50)) { const h = H.get(s), m = saat.get(s); if (!h.bar[d] || !m || !m.has(t) || h.sonIdx[d - 5] < 0) continue; const r5 = (triKap(h, d - 1) * (m.get(t).c / h.satir[h.sonIdx[d - 1]].c + h.bar[d].dpNet)) / triKap(h, d - 5) - 1; sk.push([s, r5 - xu5]); }
          sec1730 = sk.sort((a, b) => a[1] - b[1]).slice(0, 5).map(z => z[0]);
        }
      }
      const kap = R.olay.find(o => o.t === t); const secK = kap ? kap.sec : [];
      if (!secK.length && !sec1730.length) continue;
      n++; ortak += secK.filter(s => sec1730.includes(s)).length; toplam += Math.max(secK.length, sec1730.length);
      const getiri = sec => (sec.length ? sec.reduce((a, s) => a + triKap(H.get(s), x) / triKap(H.get(s), d) - 1, 0) / sec.length : 0);
      farkR.push(getiri(sec1730) - getiri(secK));
    }
    const f = ist(farkR);
    sonuclar[kod] = { hafta: n, ortakPay: toplam ? ortak / toplam : null, getiriFarki1730EksiKapanis: f };
    console.log(`  17:30 ↔ kapanış (${kod}, son ~730 g): ${n} hafta, seçim örtüşmesi ${yz(toplam ? ortak / toplam : NaN, 0)}, haftalık getiri farkı (17:30 seçimi − kapanış seçimi) ort ${yz(f.ort, 3)} t ${sy(f.t)}`);
  }
  return sonuclar;
}
