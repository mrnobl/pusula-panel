/**
 * PORTFÖY TASARIMCISI — CANLI NOKTA-ZAMANLI (PIT) NASDAQ-100 ÜYELİĞİ. PLAN-PORTFOY-TASARIMCI.md (d) `uyelik`, olgu 2.
 * Öz test: node scripts/tasarimci-selftest.js (ağsız: data/nasdaq/_wiki önbelleği sahte Wikipedia olarak sunulur).
 *
 * Tarihsel aylar data/nasdaq/uyelik.json'dan (scripts/nasdaq-indir.js, ölçüm girdisi — DEĞİŞTİRİLMEZ). Yeni aylar için
 * Wikipedia'dan AYNI ayrıştırıcılarla (nasdaq-indir.js module.exports: guncelListe, degisimTablosu, duzeltmeUygula, anahtar)
 * bugünkü listeden geriye yürünür ve ayın 1'i 00:00 itibarıyla üyelik bulunur (ay içi ekleme ertesi ay → ileriye bakma yok).
 * Sonuç data/tasarimci/uyelik/YYYY-MM.json'a BİR KEZ yazılır ve Wikipedia sürüm kimlikleriyle (revid) dondurulur — sonradan
 * Wikipedia düzeltilse de o ayın kararı değişmez. Dosya varsa ağa çıkılmaz, üzerine yazılmaz.
 *
 * API
 *   uyeler(t, { gecerliler = true }) → [anahtar]  t'nin AYININ üyeleri (nasdaqVeri.uyeler ile aynı sözleşme). Kaynak sırası
 *        (veri.js 'canli' kipi): anlık görüntü → tarihsel → (ay en son eldeki aydan sonraysa) EN SON AY (bayat). İlk aydan
 *        önce (2004-12) boş liste. 'arastirma' kipinde yalnız tarihsel (qqq-momentum.js ile birebir).
 *   uyelerDurum(t) → { ay, kullanilanAy, kaynak: 'anlik'|'tarihsel'|'yok', bayat, uyari, uyeler }
 *   anlikGoruntuAl(ay, { fetch?, simdi?, makine?, bekle? }) async → { durum: 'var'|'yazildi'|'hata', kayit?, hata?, uyari? }
 *        ay ≤ bu ay olmalı. Hata (ağ, ayrıştırma, 90–110 dışı üye sayısı) → hiçbir şey yazılmaz; uyeler() bayat fallback'e düşer.
 *   anlikKur(guncelWiki, degisimWiki, ay, { meta? }) → kayıt (SAF; ağsız test ve mutabakat için)
 *   anlikOku(ay) · anlikAylar() · tarihselAylar() · onbellekTemizle()
 *
 * GEÇERSİZ ANAHTAR: tarihsel aylarda uyelik-meta.json `gecersiz` aralıkları (ticker'ı başka şirket almış / veri yok). Anlık
 * görüntüde: o aya düşen aralıklar + meta'nın son ayında hâlâ süren aralıklar taşınır; meta'da hiç görülmemiş yeni anahtarlar
 * `yeniAnahtarlar` alanında listelenir (ad denetimi yapılmadı — ticker yeniden kullanımı riski, elle bakılmalı).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const V = require('./veri');

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WUA = { 'User-Agent': 'trade-bot-arastirma/1.0 (kisisel arastirma; Node fetch)' };
const SAYFA_GUNCEL = 'List of NASDAQ-100 companies', SAYFA_DEGISIM = 'Historical components of the Nasdaq-100';
const ayAnahtar = t => new Date(typeof t === 'string' ? Date.parse(t.length === 7 ? t + '-01' : t) : t).toISOString().slice(0, 7);
const ayBasT = ay => Date.UTC(+ay.slice(0, 4), +ay.slice(5, 7) - 1, 1);
const NI = () => require('../../scripts/nasdaq-indir');

const dizin = () => path.join(V.dizinler().tasarimci, 'uyelik');
let _tar = null, _meta = null, _anlik = new Map(), _anlikListe = null, _kok = null;
function onbellekTemizle() { _tar = null; _meta = null; _anlik = new Map(); _anlikListe = null; }
/** veri.js ortamı (veriKok) değiştiyse önbellekleri düşür (test / mutabakat geçici kökle çalışır). */
function kokDenetle() { const k = V.ortamAl().veriKok; if (k !== _kok) { onbellekTemizle(); _kok = k; } }

function tarihsel() {
  kokDenetle();
  if (!_tar) {
    const p = path.join(V.dizinler().nasdaq, 'uyelik.json');
    _tar = fs.existsSync(p) ? new Map(Object.entries(JSON.parse(fs.readFileSync(p, 'utf8'))).sort((a, b) => (a[0] < b[0] ? -1 : 1))) : new Map();
  }
  return _tar;
}
function meta() {
  kokDenetle();
  if (!_meta) { const p = path.join(V.dizinler().nasdaq, 'uyelik-meta.json'); _meta = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { gecersiz: [], araliklar: {} }; }
  return _meta;
}
const tarihselAylar = () => [...tarihsel().keys()];
function anlikAylar() {
  kokDenetle();
  if (!_anlikListe) _anlikListe = fs.existsSync(dizin()) ? fs.readdirSync(dizin()).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 7)).sort() : [];
  return _anlikListe;
}
function anlikOku(ay) {
  kokDenetle();
  if (!_anlik.has(ay)) { const p = path.join(dizin(), ay + '.json'); _anlik.set(ay, fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null); }
  return _anlik.get(ay);
}
const gecersizTarihsel = (s, ay) => (meta().gecersiz || []).some(g => g.anahtar === s && ay >= g.aralik[0] && ay <= g.aralik[1]);

function uyelerDurum(t) {
  const ay = ayAnahtar(t), canli = V.ortamAl().oncelik !== 'arastirma';
  const tar = tarihsel(), tAy = tarihselAylar();
  const anlik = canli ? anlikAylar() : [];
  const listeAl = (a, kaynak) => {
    if (kaynak === 'anlik') { const k = anlikOku(a); return { ham: k.uyeler, gecersiz: new Set(k.gecersiz || []) }; }
    return { ham: tar.get(a), gecersiz: null };
  };
  let kaynak = null, kAy = ay;
  if (anlik.includes(ay)) kaynak = 'anlik';
  else if (tar.has(ay)) kaynak = 'tarihsel';
  else {
    const ilk = [tAy[0], anlik[0]].filter(Boolean).sort()[0];
    if (!ilk || ay < ilk) return { ay, kullanilanAy: null, kaynak: 'yok', bayat: false, uyari: null, ham: [], gecersiz: new Set() };
    const sonA = anlik[anlik.length - 1], sonT = tAy[tAy.length - 1];
    kAy = [sonA, sonT].filter(Boolean).sort().pop();
    kaynak = kAy === sonA ? 'anlik' : 'tarihsel';
  }
  const l = listeAl(kAy, kaynak), bayat = kAy !== ay;
  return { ay, kullanilanAy: kAy, kaynak, bayat, uyari: bayat ? `Nasdaq-100 üyeliği bayat: ${ay} anlık görüntüsü yok, ${kAy} listesi kullanıldı (Wikipedia'ya erişilemedi mi?)` : null, ...l };
}
function uyeler(t, { gecerliler = true } = {}) {
  const d = uyelerDurum(t);
  if (!d.ham || !d.ham.length) return [];
  if (gecerliler === false) return [...d.ham];
  if (d.kaynak === 'anlik') return d.ham.filter(s => !d.gecersiz.has(s));
  return d.ham.filter(s => !gecersizTarihsel(s, d.kullanilanAy));
}

/** SAF: Wikipedia wikitext'lerinden ayın 1'i 00:00 PIT üyeliği. guncelWiki/degisimWiki: { revid, wikitext }. */
function anlikKur(guncelWiki, degisimWiki, ay, { meta: M = meta() } = {}) {
  const ni = NI();
  const guncel = ni.guncelListe(guncelWiki.wikitext);
  const degisim = ni.degisimTablosu(degisimWiki.wikitext);
  const duzeltmeler = ni.duzeltmeUygula(degisim);
  let kume = new Set(guncel.map(x => ni.anahtar(x.ticker)));
  const durumlar = [{ t: Infinity, kume: new Set(kume) }], uyumsuz = [];
  for (const c of degisim) {
    for (const a of c.ekle) { const k = ni.anahtar(a, c.t, c.ekleAd); if (!kume.has(k)) uyumsuz.push({ tarih: new Date(c.t).toISOString().slice(0, 10), tur: 'eklenen yok', ticker: a }); kume.delete(k); }
    for (const r of c.cikar) { const k = ni.anahtar(r, c.t, c.cikarAd); if (kume.has(k)) uyumsuz.push({ tarih: new Date(c.t).toISOString().slice(0, 10), tur: 'çıkarılan zaten var', ticker: r }); kume.add(k); }
    durumlar.push({ t: c.t, kume: new Set(kume) });
  }
  const t = ayBasT(ay);
  let k = durumlar[0].kume; for (let i = 1; i < durumlar.length; i++) { if (durumlar[i].t > t) k = durumlar[i].kume; else break; }
  const liste = [...k].sort();
  // Geçersiz: o aya düşen meta aralıkları + meta'nın son ayında hâlâ süren aralıklar.
  const metaSon = Object.values(M.araliklar || {}).flat().reduce((m, a) => (a[1] > m ? a[1] : m), '');
  const gecersiz = [...new Set((M.gecersiz || []).filter(g => liste.includes(g.anahtar) && ((ay >= g.aralik[0] && ay <= g.aralik[1]) || (metaSon && g.aralik[1] >= metaSon && ay > metaSon))).map(g => g.anahtar))].sort();
  const bilinen = new Set(Object.keys(M.araliklar || {}));
  const sonSatir = degisim.length ? degisim[0] : null;
  return {
    surum: 1, ay, yontem: 'lib/tasarimci/uyelik.js anlikKur — nasdaq-indir.js ayrıştırıcıları; bugünkü liste + değişim tablosu geri yürüyüş, ay başı 00:00',
    kaynak: { guncel: { sayfa: SAYFA_GUNCEL, revid: guncelWiki.revid, n: guncel.length }, degisim: { sayfa: SAYFA_DEGISIM, revid: degisimWiki.revid, satir: degisim.length,
      sonSatir: sonSatir ? { tarih: new Date(sonSatir.t).toISOString().slice(0, 10), ekle: sonSatir.ekle, cikar: sonSatir.cikar } : null } },
    uyeSay: liste.length, uyeler: liste, gecersiz, yeniAnahtarlar: liste.filter(s => !bilinen.has(s)),
    uyumsuz, duzeltmeler: duzeltmeler.map(d => ({ tarih: d.tarih, durum: d.durum })),
  };
}

async function wikiParse(baslik, fetchF, bekle) {
  const u = WIKI_API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', action: 'parse', page: baslik, prop: 'wikitext|revid', redirects: '1' });
  let son = null;
  for (let d = 0; d < 3; d++) {
    try {
      const r = await fetchF(u, { headers: WUA, signal: AbortSignal.timeout(60000) });
      const metin = await r.text();
      if (r.ok && metin.startsWith('{')) { const j = JSON.parse(metin); if (j.parse && j.parse.wikitext) return { revid: j.parse.revid, wikitext: j.parse.wikitext }; son = 'parse yok'; }
      else son = 'HTTP ' + r.status;
    } catch (e) { son = e.message; }
    await bekle(1500 * (d + 1));
  }
  throw new Error(`Wikipedia '${baslik}' alınamadı (${son})`);
}

async function anlikGoruntuAl(ay, { fetch: fetchF = (...a) => globalThis.fetch(...a), simdi = Date.now(), makine = null, bekle = ms => new Promise(z => setTimeout(z, ms)) } = {}) {
  if (!/^\d{4}-\d{2}$/.test(ay)) throw new Error(`uyelik: ay 'YYYY-MM' (verilen: ${ay})`);
  if (ay > ayAnahtar(simdi)) throw new Error(`uyelik: ${ay} henüz başlamadı — gelecek ayın anlık görüntüsü alınamaz`);
  const p = path.join(dizin(), ay + '.json');
  if (fs.existsSync(p)) return { durum: 'var', kayit: JSON.parse(fs.readFileSync(p, 'utf8')) };
  let kayit;
  try {
    const g = await wikiParse(SAYFA_GUNCEL, fetchF, bekle);
    const h = await wikiParse(SAYFA_DEGISIM, fetchF, bekle);
    kayit = anlikKur(g, h, ay);
    if (kayit.uyeSay < 90 || kayit.uyeSay > 110) throw new Error(`üye sayısı ${kayit.uyeSay} (90–110 dışı) — ayrıştırma bozuk olabilir, yazılmadı`);
  } catch (e) {
    const d = uyelerDurum(ayBasT(ay));
    return { durum: 'hata', hata: e.message, uyari: `Wikipedia'ya erişilemedi / ayrıştırılamadı: ${e.message}. ${d.kullanilanAy ? d.kullanilanAy + ' listesi kullanılacak (bayat)' : 'üyelik yok'}` };
  }
  kayit.uretim = new Date(simdi).toISOString();
  if (makine) kayit.makine = makine;
  fs.mkdirSync(dizin(), { recursive: true });
  if (fs.existsSync(p)) return { durum: 'var', kayit: JSON.parse(fs.readFileSync(p, 'utf8')) };   // eşzamanlı yazım
  const gecici = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(gecici, JSON.stringify(kayit, null, 1));
  fs.renameSync(gecici, p);
  _anlik.delete(ay); _anlikListe = null;
  return { durum: 'yazildi', kayit };
}

module.exports = { uyeler, uyelerDurum, anlikGoruntuAl, anlikKur, anlikOku, anlikAylar, tarihselAylar, onbellekTemizle, ayAnahtar, dizin, SAYFA_GUNCEL, SAYFA_DEGISIM };
