/**
 * NASDAQ VERİ YÜKLEYİCİ — PLAN-NASDAQ.md ölçümlerinin ORTAK girdisi.
 * Veri: `node scripts/nasdaq-indir.js` → data/nasdaq/ (Yahoo v8 günlük + Wikipedia nokta-zamanlı üyelik).
 * Öz test: `node scripts/nasdaq-veri-selftest.js`
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * API
 * ═══════════════════════════════════════════════════════════════════════════
 * Seriler (sembol = Yahoo sembolü: 'QQQ', '^NDX', 'NQ=F', 'AAPL', …)
 *   seriVarMi(s)                 → bool
 *   seriOku(s)                   → ham dosya { sembol, ad, tur, gunler:[{t,o,h,l,c,ac,v}], temettu, bolunme } (önbellekli)
 *   duzeltilmis(s, ops)          → [{ t, o, h, l, c, ham, v, dolar, k }]  (önbellekli; döndürülen diziyi DEĞİŞTİRME)
 *        k = ac / c (temettü + bölünme düzeltme oranı); o,h,l = Yahoo × k; c = ac  → temettü dahil getiri.
 *        ham = Yahoo kapanışı (bölünmeye göre düzeltilmiş), dolar = ham × v ($ hacim).
 *        Atılan satırlar: c ≤ 0, ac ≤ 0. Açılış boş/≤0 ise o = önceki düzeltilmiş kapanış ve `ov: true`
 *        (o/h/l yoksa h = l = c için de aynı). ops.hacimSifirAt (vars. false): v = 0 satırları at.
 *   takvim(bas?, son?)           → number[]  NYSE işlem günleri (^GSPC günleri; UTC gece yarısı ms)
 *   hizala(satirlar, takvim)     → { bar, sonIdx }  bar[d] = o gün satır ya da null; sonIdx[d] = ≤ d son kendi satır indeksi (−1: yok)
 *
 * Endeks ayağı (ön-kayıt: "QQQ 1999-03'ten adjclose; öncesi ^NDX fiyat endeksi; al-tut aynı seri")
 *   ndxZinciri()                 → { satirlar:[{t,o,h,l,c,kaynak:'NDX'|'QQQ', ov?}], eklem, olcek, ndxIlk }
 *        eklem = QQQ'nun ilk günü. t < eklem: ^NDX OHLC × olcek, olcek = QQQ_düz.c(eklem) / NDX.c(eklem).
 *        t ≥ eklem: QQQ düzeltilmiş. NDX kısmı TEMETTÜSÜZ (yıllık ~%0,5–1 eksik) ve gider oranı yok — not edilir.
 *
 * Nokta-zamanlı Nasdaq-100 üyeliği (anahtar = veri sembolü; yeniden adlandırma eşlenmiş, ör. 2010 Priceline = 'BKNG')
 *   uyelik()                     → Map('YYYY-MM' → [anahtar])  ay başı 00:00 itibarıyla üyeler (ay içi ekleme ertesi ay)
 *   uyelikMeta()                 → uyelik-meta.json (güven etiketi, aralıklar, düzeltmeler, geçersiz aralıklar, doğrulama)
 *   uyeler(t, ops)               → t'nin AYININ üyeleri. ops.gecerliler (vars. true): verisi o aralıkta YANLIŞ şirkete
 *                                   ait/olmayan (uyelik-meta.gecersiz) anahtarları çıkar.
 *   guven(t)                     → 'degisim-tablosu' | 'wiki-anlik…' | null (2005 öncesi: üyelik YOK)
 *   evren(ayBasiT, K = 15, ops)  → [{ s, puan }]  "o ayın üyeleri içinden son 30 günün $ hacmine göre ilk K"
 *        puan = [A−30 g, A) takvim penceresindeki $ hacim toplamı / penceredeki NYSE işlem günü sayısı (eksik gün = 0).
 *        Şartlar (yalnız A'dan ÖNCEKİ veri): ≥ ops.minGecmis (30) kendi çubuğu, son çubuk A'dan en çok 10 gün önce.
 *        ops.pencereGun (30), ops.seriGetir (test için: s → düzeltilmiş satırlar).
 *   evrenKur(K, bas, son)        → Map(ayBasiT → [anahtar])  (bas/son ms; vars. 2005-01 → bugün)
 *
 * Yardımcılar: ayBasi(t), ayAnahtar(t), GUN, DIR, dosyaYolu(s)
 *
 * BİLİNEN SINIRLAR (ayrıntı: data/nasdaq/_denetim.json, uyelik-meta.json)
 *   · Üyelik 2005-01'den başlar; 2005-01 → 2007-01 Wikipedia makale anlık listeleri (düşük güven), 2007-02+ değişim tablosu
 *     (2008–2026 Şubat anlıklarıyla birebir doğrulandı; farklar: CMCSK 2014-12→2015-11, LVNTA 2014→2018 eksik).
 *   · Delist / satın alınan hisselerin çoğu Yahoo'da YOK → o aylarda evren yalnız verisi olanlardan seçilir
 *     (kalan hayatta kalma yanlılığı; aylık kapsama oranı _denetim.json'da). Seçilen hisse sonradan delist olursa
 *     verisi biter: simülatör son kapanışta nakde çevirmeli.
 *   · Yahoo o/h/l bölünmeye göre düzeltilmiş, temettüye göre değil → burada k ile düzeltilir.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');

const GUN = 864e5;
const DIR = yollar.veri('nasdaq');
const dosyaYolu = s => path.join(DIR, s.replace(/[^A-Z0-9.]/gi, '_') + '.json');
const ayAnahtar = t => new Date(t).toISOString().slice(0, 7);
const ayBasi = t => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const ayBasT = ay => Date.UTC(+ay.slice(0, 4), +ay.slice(5, 7) - 1, 1);

const _ham = new Map(), _duz = new Map();
let _takvim = null, _uyelik = null, _meta = null, _gecersiz = null, _zincir = null;

const seriVarMi = s => fs.existsSync(dosyaYolu(s));
function seriOku(s) {
  if (!_ham.has(s)) {
    if (!seriVarMi(s)) throw new Error(`nasdaqVeri: ${s} verisi yok (${dosyaYolu(s)}) — önce node scripts/nasdaq-indir.js`);
    _ham.set(s, JSON.parse(fs.readFileSync(dosyaYolu(s), 'utf8')));
  }
  return _ham.get(s);
}

function duzeltilmis(s, ops = {}) {
  const anahtar = s + (ops.hacimSifirAt ? '|v' : '');
  if (_duz.has(anahtar)) return _duz.get(anahtar);
  const out = [];
  for (const x of seriOku(s).gunler) {
    if (!(x.c > 0) || !(x.ac > 0)) continue;
    if (ops.hacimSifirAt && !(x.v > 0)) continue;
    const k = x.ac / x.c, onceki = out.length ? out[out.length - 1].c : null;
    const r = { t: x.t, o: x.o * k, h: x.h * k, l: x.l * k, c: x.ac, ham: x.c, v: x.v || 0, dolar: x.c * (x.v || 0), k };
    if (!(x.o > 0)) { r.o = onceki != null ? onceki : r.c; r.ov = true; }
    if (!(x.h > 0) || !(x.l > 0)) { r.h = Math.max(r.o, r.c); r.l = Math.min(r.o, r.c); r.ov = true; }
    out.push(r);
  }
  _duz.set(anahtar, out);
  return out;
}

function takvim(bas = -Infinity, son = Infinity) {
  if (!_takvim) _takvim = seriOku('^GSPC').gunler.filter(x => x.c > 0).map(x => x.t);
  return _takvim.filter(t => t >= bas && t <= son);
}

function hizala(satirlar, tk) {
  const D = tk.length, bar = new Array(D).fill(null), sonIdx = new Int32Array(D).fill(-1);
  let k = -1, j = 0;
  for (let d = 0; d < D; d++) {
    while (j < satirlar.length && satirlar[j].t <= tk[d]) { if (satirlar[j].t === tk[d]) bar[d] = satirlar[j]; k = j; j++; }
    sonIdx[d] = k;
  }
  return { bar, sonIdx };
}

function ndxZinciri() {
  if (_zincir) return _zincir;
  const q = duzeltilmis('QQQ'), n = duzeltilmis('^NDX');
  const eklem = q[0].t, nE = n.find(x => x.t === eklem);
  if (!nE) throw new Error('nasdaqVeri: ^NDX eklem gününde (QQQ ilk günü) veri yok');
  const olcek = q[0].c / nE.c;
  const satirlar = [];
  for (const x of n) {
    if (x.t >= eklem) break;
    const r = { t: x.t, o: x.o * olcek, h: x.h * olcek, l: x.l * olcek, c: x.c * olcek, kaynak: 'NDX' };
    if (x.ov) r.ov = true;
    satirlar.push(r);
  }
  for (const x of q) { const r = { t: x.t, o: x.o, h: x.h, l: x.l, c: x.c, kaynak: 'QQQ' }; if (x.ov) r.ov = true; satirlar.push(r); }
  _zincir = { satirlar, eklem, olcek, ndxIlk: n[0].t };
  return _zincir;
}

// ── Üyelik ──────────────────────────────────────────────────────────────────
function uyelik() {
  if (!_uyelik) _uyelik = new Map(Object.entries(JSON.parse(fs.readFileSync(path.join(DIR, 'uyelik.json'), 'utf8'))).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  return _uyelik;
}
function uyelikMeta() {
  if (!_meta) _meta = JSON.parse(fs.readFileSync(path.join(DIR, 'uyelik-meta.json'), 'utf8'));
  return _meta;
}
function gecersizMi(s, ay) {
  if (!_gecersiz) {
    _gecersiz = new Map();
    for (const g of uyelikMeta().gecersiz || []) { if (!_gecersiz.has(g.anahtar)) _gecersiz.set(g.anahtar, []); _gecersiz.get(g.anahtar).push(g.aralik); }
  }
  return (_gecersiz.get(s) || []).some(([a1, a2]) => ay >= a1 && ay <= a2);
}
function uyeler(t, ops = {}) {
  const ay = ayAnahtar(t), l = uyelik().get(ay);
  if (!l) return [];
  return ops.gecerliler === false ? [...l] : l.filter(s => !gecersizMi(s, ay));
}
const guven = t => (uyelikMeta().guven || {})[ayAnahtar(t)] || null;

/** Son 30 günün $ hacmine göre ilk K (yalnız A'dan önceki veri). */
function evren(A, K = 15, ops = {}) {
  const pencereGun = ops.pencereGun || 30, minGecmis = ops.minGecmis || 30;
  const getir = ops.seriGetir || (s => (seriVarMi(s) ? duzeltilmis(s) : null));
  const p0 = A - pencereGun * GUN;
  const islemGunu = takvim(p0, A - 1).length || 1;
  const puan = [];
  for (const s of uyeler(A)) {
    const x = getir(s);
    if (!x || !x.length) continue;
    // A'dan önceki son çubuk (ikili arama).
    let lo = 0, hi = x.length - 1, son = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (x[m].t < A) { son = m; lo = m + 1; } else hi = m - 1; }
    if (son < minGecmis - 1) continue;
    if (A - x[son].t > 10 * GUN) continue;
    let top = 0;
    for (let j = son; j >= 0 && x[j].t >= p0; j--) top += x[j].dolar;
    puan.push({ s, puan: top / islemGunu });
  }
  puan.sort((a, b) => b.puan - a.puan || (a.s < b.s ? -1 : 1));
  return puan.slice(0, K);
}

function evrenKur(K = 15, bas = Date.UTC(2005, 0, 1), son = Date.now()) {
  const out = new Map();
  for (const ay of uyelik().keys()) {
    const A = ayBasT(ay);
    if (A < bas || A > son) continue;
    out.set(A, evren(A, K).map(x => x.s));
  }
  return out;
}

module.exports = {
  GUN, DIR, dosyaYolu, ayAnahtar, ayBasi,
  seriVarMi, seriOku, duzeltilmis, takvim, hizala, ndxZinciri,
  uyelik, uyelikMeta, uyeler, guven, evren, evrenKur, gecersizMi,
};
