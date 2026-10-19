/**
 * ARAŞTIRMA DEFTERİ — deneme sayacının kanonik kaydı (sürüm 60.6, PLAN-DIKKAT-LISTESI.md §5 Ş1).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   kayitlar/denemeler.jsonl — her satır bir kayıt (bir deneme ya da ardışık deneme ARALIĞI):
 *   { aralik:[ilk,son], aile:"kebab-id", aileAd, baslik, hipotez, tarih:"YYYY-MM-DD"|null, plan:"PLAN-X.md"|null,
 *     onKayitCommit|null, sonucCommit|null, holdout:"acildi"|"acilmadi"|"yok"|"bekliyor",
 *     durum:"RED"|"KABUL"|"GOLGE"|"BOS"|"BELGESIZ"|"BILGI"|"ACIK", sonuc, neden|null, hukumTarihi|null, kaynak }
 *
 * NEDEN: 773 deneme CLAUDE.md'nin "Deneme sayacı" paragrafında düz metindi; paralel işler numara aralığını elle ayırıyordu
 * ("774–779 boş") ve çakışma ancak gözle yakalanıyordu. Burada çakışma, boşluk ve biçim KODLA denetlenir; yeni deneme
 * numarasını `sonrakiBos()` (npm run defter:sonraki) verir.
 *
 *   const D = require('./lib/defter');
 *   D.oku(dosya?)                    → { dosya, var, kayitlar }   (geçersiz JSON satırı kayitlar içinde `_gecersiz` taşır)
 *   D.denetle(kayitlar, { ust? })    → hatalar [{ satir, kod, mesaj }]   (ust varsayılan: en yüksek numara)
 *   D.ozet(kayitlar, { bugun? })     → toplam (BOS OLMAYAN en yüksek numara), ayrilmisBos, durumlar (NUMARA sayısıyla), aileler,
 *                                      yaklasanlar, sonrakiBos
 *   D.sonrakiBos(kayitlar)           → TÜM kayıtların (BOS dahil) en yüksek numarası + 1 — ayrılmış boş aralıkların sonrası
 *   D.uyarilar(kayitlar)             → hata olmayan eksikler (KABUL'de sonucCommit yok)
 *   D.ekle(kayit, { dosya? })        → doğrular, çakışmayı / boşluk açmayı reddeder, geçici dosya + rename ile yazar
 *   D.router({ dosya?, log? })       → GET /api/defter, POST /api/defter (yalnız yeni kayıt ekler)
 *
 * Sunucu git ÇALIŞTIRMAZ: commit alanları kullanıcının/ajanın yazdığı METİNdir. Kayıt düzeltme/silme ucu YOK — yanlış
 * kayıt dosyada elle (git ile izlenerek) düzeltilir. Telefon kademesinde POST lib/guvenlik.js tarafından 403 alır
 * (beyaz listede değil; scripts/defter-selftest.js sınar). lib/live, lib/risk ve canlı bot koduna dokunmaz.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const VARSAYILAN_DOSYA = path.join(KOK, 'kayitlar', 'denemeler.jsonl');
const dosyaYolu = (d) => d || process.env.DEFTER_DOSYA || VARSAYILAN_DOSYA;

const DURUMLAR = ['RED', 'KABUL', 'GOLGE', 'BOS', 'BELGESIZ', 'BILGI', 'ACIK'];
const HOLDOUT = ['acildi', 'acilmadi', 'yok', 'bekliyor'];
/** Sözleşmenin tüm alanları (sıra = dosyaya yazım sırası). */
const ALANLAR = ['aralik', 'aile', 'aileAd', 'baslik', 'hipotez', 'tarih', 'plan', 'onKayitCommit', 'sonucCommit',
  'holdout', 'durum', 'sonuc', 'neden', 'hukumTarihi', 'kaynak'];
/** null olabilen alanlar; diğerleri zorunlu. */
const BOS_OLABILIR = new Set(['tarih', 'plan', 'onKayitCommit', 'sonucCommit', 'neden', 'hukumTarihi']);
/** Zorunlu ve boş metin olamayan alanlar (hipotez/sonuç/aileAd boş metin olabilir: BOS / BELGESIZ aralıkları). */
const DOLU_OLMALI = new Set(['aile', 'baslik', 'kaynak']);
const METIN_SINIRI = 4000;
const GOVDE_SINIRI = 64 * 1024;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GUN = /^\d{4}-\d{2}-\d{2}$/;

class DefterHatasi extends Error {
  constructor(mesaj, durum = 400, hatalar = null) { super(mesaj); this.durum = durum; this.hatalar = hatalar; }
}

function gecerliGun(s) {
  if (typeof s !== 'string' || !GUN.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}
const bugunStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const gunFarki = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

/** Metin → kayıtlar. Her kayda `_satir` (1 tabanlı) yazılır; ayrıştırılamayan satır `{ _satir, _gecersiz, _ham }`. */
function ayristir(metin) {
  const out = [];
  String(metin || '').replace(/^﻿/, '').split(/\r?\n/).forEach((ham, i) => {
    if (!ham.trim()) return;
    try {
      const k = JSON.parse(ham);
      if (!k || typeof k !== 'object' || Array.isArray(k)) throw new Error('satır bir JSON nesnesi değil');
      out.push({ ...k, _satir: i + 1 });
    } catch (e) {
      out.push({ _satir: i + 1, _gecersiz: e.message, _ham: ham.slice(0, 200) });
    }
  });
  return out;
}

function oku(dosya) {
  const d = dosyaYolu(dosya);
  if (!fs.existsSync(d)) return { dosya: d, var: false, kayitlar: [] };
  return { dosya: d, var: true, kayitlar: ayristir(fs.readFileSync(d, 'utf8')) };
}

const gecerliler = (kayitlar) => (kayitlar || []).filter(k => k && !k._gecersiz && aralikGecerli(k.aralik));
function aralikGecerli(a) {
  return Array.isArray(a) && a.length === 2 && a.every(x => Number.isSafeInteger(x) && x >= 1) && a[0] <= a[1];
}
const uzunluk = (k) => k.aralik[1] - k.aralik[0] + 1;
const etiket = (k) => (k.aralik[0] === k.aralik[1] ? `#${k.aralik[0]}` : `#${k.aralik[0]}–${k.aralik[1]}`);

/** Tek kaydın alan denetimi (çakışma/boşluk hariç). @returns [{ kod, mesaj }] */
function kayitDenetle(k) {
  const h = [];
  const ekle = (kod, mesaj) => h.push({ kod, mesaj });
  for (const a of ALANLAR) {
    if (!(a in k)) { ekle('eksik', `"${a}" alanı yok`); continue; }
    const v = k[a];
    if (v === null) { if (!BOS_OLABILIR.has(a)) ekle('eksik', `"${a}" boş (null) olamaz`); continue; }
    if (a === 'aralik') continue;
    if (typeof v !== 'string') { ekle('tur', `"${a}" metin olmalı`); continue; }
    if (DOLU_OLMALI.has(a) && !v.trim()) ekle('eksik', `"${a}" boş metin olamaz`);
    if (v.length > METIN_SINIRI) ekle('uzun', `"${a}" ${METIN_SINIRI} karakterden uzun`);
  }
  for (const a of Object.keys(k)) if (!a.startsWith('_') && !ALANLAR.includes(a)) ekle('bilinmeyen', `bilinmeyen alan "${a}"`);
  const a = k.aralik;
  if ('aralik' in k && a !== null) {
    if (!Array.isArray(a) || a.length !== 2 || !a.every(x => Number.isSafeInteger(x) && x >= 1)) ekle('aralik', 'aralik [ilk, son] iki pozitif (güvenli) tam sayı olmalı');
    else if (a[0] > a[1]) ekle('aralik', `aralık ilk > son (${a[0]} > ${a[1]})`);
  }
  if (typeof k.aile === 'string' && k.aile && !KEBAB.test(k.aile)) ekle('aile', `aile kimliği küçük harf kebab-id olmalı ("${k.aile}")`);
  if (typeof k.durum === 'string' && !DURUMLAR.includes(k.durum)) ekle('enum', `durum "${k.durum}" geçersiz (${DURUMLAR.join('/')})`);
  if (typeof k.holdout === 'string' && !HOLDOUT.includes(k.holdout)) ekle('enum', `holdout "${k.holdout}" geçersiz (${HOLDOUT.join('/')})`);
  for (const t of ['tarih', 'hukumTarihi']) if (typeof k[t] === 'string' && !gecerliGun(k[t])) ekle('tarih', `${t} "${k[t]}" YYYY-AA-GG biçiminde geçerli bir gün değil`);
  if (typeof k.plan === 'string' && !/\.md\b/i.test(k.plan)) ekle('plan', `plan bir .md dosya adı içermeli ("${k.plan.slice(0, 80)}")`);
  if (k.durum === 'GOLGE' && k.hukumTarihi == null) ekle('tutarlilik', 'GOLGE kaydında hukumTarihi zorunlu');
  if (k.holdout === 'bekliyor' && DURUMLAR.includes(k.durum) && k.durum !== 'GOLGE' && k.durum !== 'ACIK') ekle('tutarlilik', `holdout "bekliyor" yalnız GOLGE/ACIK kayıtta olur (durum ${k.durum})`);
  return h;
}

/** Tek kaydın UYARILARI (hata değil; eski kayıtlarda bilgi eksik olabilir). @returns [{ kod, mesaj }] */
function kayitUyar(k) {
  const u = [];
  if (k.durum === 'KABUL' && k.sonucCommit == null) u.push({ kod: 'sonucCommit', mesaj: 'KABUL kaydında sonucCommit yok' });
  return u;
}

/** Tüm dosyanın uyarıları. @returns [{ satir, kod, mesaj }] */
function uyarilar(kayitlar) {
  const out = [];
  for (const k of kayitlar || []) {
    if (!k || k._gecersiz) continue;
    for (const x of kayitUyar(k)) out.push({ satir: k._satir || null, ...x, mesaj: `${aralikGecerli(k.aralik) ? etiket(k) + ': ' : ''}${x.mesaj}` });
  }
  return out;
}

/** Aralık çakışmaları (sıralı süpürme). @returns [{ a, b }] */
function cakismalar(kayitlar) {
  const l = gecerliler(kayitlar).slice().sort((x, y) => x.aralik[0] - y.aralik[0] || x.aralik[1] - y.aralik[1]);
  const out = [];
  let enUzak = null;   // şu ana kadar en sağa uzanan kayıt
  for (const k of l) {
    if (enUzak && k.aralik[0] <= enUzak.aralik[1]) out.push({ a: enUzak, b: k });
    if (!enUzak || k.aralik[1] > enUzak.aralik[1]) enUzak = k;
  }
  return out;
}

/** 1..ust arasında hiçbir kaydın kapsamadığı numara aralıkları. @returns [[ilk, son]] */
function bosluklar(kayitlar, ust) {
  const l = gecerliler(kayitlar).slice().sort((x, y) => x.aralik[0] - y.aralik[0]);
  const out = [];
  let sonraki = 1;
  for (const k of l) {
    if (k.aralik[0] > sonraki) out.push([sonraki, Math.min(k.aralik[0] - 1, ust)]);
    sonraki = Math.max(sonraki, k.aralik[1] + 1);
    if (sonraki > ust) break;
  }
  if (sonraki <= ust) out.push([sonraki, ust]);
  return out.filter(([a, b]) => a <= b && a <= ust);
}

const enYuksek = (kayitlar) => gecerliler(kayitlar).reduce((m, k) => Math.max(m, k.aralik[1]), 0);
/** BOS OLMAYAN en yüksek numara = gerçek deneme sayısı (CLAUDE.md "Güncel: **N**" bununla karşılaştırılır). */
const enYuksekDeneme = (kayitlar) => gecerliler(kayitlar).filter(k => k.durum !== 'BOS').reduce((m, k) => Math.max(m, k.aralik[1]), 0);
/** Son denemeden sonra önceden ayrılmış BOS aralıkları (ör. [[774, 779]]). */
function ayrilmisBos(kayitlar) {
  const t = enYuksekDeneme(kayitlar);
  return gecerliler(kayitlar).filter(k => k.durum === 'BOS' && k.aralik[0] > t).map(k => [k.aralik[0], k.aralik[1]]).sort((a, b) => a[0] - b[0]);
}
/** ekle(): bir kayıt sonraki boş numaradan en çok bu kadar ileri uzanabilir (yazım hatası "7740" gibi). */
const AZAMI_ILERI = 100;

/**
 * Tüm dosyanın denetimi. @param {object} o  { ust }: boşluk denetiminin üst sınırı (varsayılan en yüksek numara).
 * @returns [{ satir, kod, mesaj }]  — kod: json · eksik · tur · uzun · bilinmeyen · aralik · aile · enum · tarih · plan · cakisma · bosluk
 */
function denetle(kayitlar, o = {}) {
  const hatalar = [];
  for (const k of kayitlar || []) {
    if (k._gecersiz) { hatalar.push({ satir: k._satir || null, kod: 'json', mesaj: `geçersiz JSON satırı: ${k._gecersiz}` }); continue; }
    for (const h of kayitDenetle(k)) hatalar.push({ satir: k._satir || null, ...h, mesaj: `${aralikGecerli(k.aralik) ? etiket(k) + ': ' : ''}${h.mesaj}` });
  }
  for (const { a, b } of cakismalar(kayitlar)) {
    hatalar.push({ satir: b._satir || null, kod: 'cakisma', mesaj: `${etiket(b)} (satır ${b._satir || '?'}) ${etiket(a)} (satır ${a._satir || '?'}) ile ÇAKIŞIYOR` });
  }
  const ust = Number.isInteger(o.ust) && o.ust > 0 ? o.ust : enYuksek(kayitlar);
  for (const [x, y] of bosluklar(kayitlar, ust)) {
    hatalar.push({ satir: null, kod: 'bosluk', mesaj: `${x === y ? `#${x}` : `#${x}–${y}`} hiçbir kayıtta yok (BOŞLUK; kullanılmayan numaralar durum "BOS" ile kaydedilir)` });
  }
  return hatalar;
}

/** Yeni deneme numarası: tüm kayıtların (BOS dahil — ayrılmış aralıkların SONRASI) en yüksek numarası + 1. */
function sonrakiBos(kayitlar) { return enYuksek(kayitlar) + 1; }

/**
 * Özet. Durum ve aile sayıları NUMARA sayısıyladır (aralık uzunluğu kadar): 740–759 tek satır ama 20 deneme.
 * @param {object} o  { bugun: 'YYYY-MM-DD' } (kalan gün hesabı; varsayılan yerel bugün)
 */
function ozet(kayitlar, o = {}) {
  const bugun = o.bugun && gecerliGun(o.bugun) ? o.bugun : bugunStr();
  const l = gecerliler(kayitlar);
  const durumlar = Object.create(null);
  for (const d of DURUMLAR) durumlar[d] = 0;
  const aileHarita = new Map();
  for (const k of l) {
    const n = uzunluk(k);
    if (typeof k.durum === 'string' && Object.hasOwn(durumlar, k.durum)) durumlar[k.durum] += n;
    const anahtar = typeof k.aile === 'string' && k.aile ? k.aile : '?';
    const a = aileHarita.get(anahtar) || { aile: anahtar, aileAd: '', adet: 0, kayit: 0, durumlar: Object.create(null) };
    a.adet += n; a.kayit += 1;
    if (!a.aileAd && typeof k.aileAd === 'string' && k.aileAd) a.aileAd = k.aileAd;
    const dk = String(k.durum);
    a.durumlar[dk] = (Object.hasOwn(a.durumlar, dk) ? a.durumlar[dk] : 0) + n;
    aileHarita.set(anahtar, a);
  }
  const aileler = [...aileHarita.values()].sort((x, y) => y.adet - x.adet || x.aile.localeCompare(y.aile, 'tr'));
  const yaklasanlar = l.filter(k => (k.durum === 'GOLGE' || k.durum === 'ACIK') && gecerliGun(k.hukumTarihi))
    .map(k => ({ aralik: k.aralik, aile: k.aile, aileAd: k.aileAd, baslik: k.baslik, durum: k.durum, hukumTarihi: k.hukumTarihi, kalanGun: gunFarki(bugun, k.hukumTarihi) }))
    .sort((x, y) => x.hukumTarihi.localeCompare(y.hukumTarihi) || x.aralik[0] - y.aralik[0]);
  const hukumsuz = l.filter(k => (k.durum === 'GOLGE' || k.durum === 'ACIK') && !gecerliGun(k.hukumTarihi)).map(k => k.aralik);
  return { toplam: enYuksekDeneme(kayitlar), enYuksekNumara: enYuksek(kayitlar), ayrilmisBos: ayrilmisBos(kayitlar), kayitSayisi: l.length, durumlar, aileler, yaklasanlar, hukumsuz, sonrakiBos: sonrakiBos(kayitlar), bugun };
}

/* ── Yazım ─────────────────────────────────────────────────────────────── */

/** Gelen gövdeden sözleşme alanlarını alır (sıra sabit; metinler kırpılır; boş isteğe bağlı alan → null). */
function normalle(g) {
  const k = {};
  const b = g && typeof g === 'object' ? g : {};
  for (const a of ALANLAR) {
    let v = b[a];
    if (a === 'aralik') {
      if (Array.isArray(v)) v = v.map(x => (typeof x === 'string' && /^\d+$/.test(x.trim()) ? Number(x) : x));
      k[a] = v === undefined ? null : v;
      continue;
    }
    if (typeof v === 'string') v = v.trim();
    if ((v === '' || v === undefined) && BOS_OLABILIR.has(a)) v = null;
    k[a] = v === undefined ? null : v;
  }
  return k;
}

/** Geçici dosya + fsync + rename (Windows'ta virüs tarayıcı kısa süre kilitleyebilir: birkaç deneme). */
function atomikYaz(dosya, metin) {
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  const gecici = `${dosya}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(gecici, 'w');
  try { fs.writeSync(fd, metin, null, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  let son = null;
  for (let i = 0; i < 5; i++) {
    try { fs.renameSync(gecici, dosya); return; } catch (e) {
      son = e;
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) break;
      const bitis = Date.now() + 40 * (i + 1); while (Date.now() < bitis) { /* kısa bekleme */ }
    }
  }
  try { fs.unlinkSync(gecici); } catch (e) { /* yok */ }
  throw son;
}

/**
 * Yeni kayıt ekler. Reddeder: alan hatası (400), geçersiz satırlı dosya (409 — çakışma denetimi güvenilmez),
 * mevcut bir aralıkla çakışma (409), en yüksek numara + 1'den sonra başlayıp BOŞLUK açma (400).
 * Boşluk doldurma (ilk ≤ en yüksek, çakışmasız) serbesttir.
 * @returns {{ kayit, sonrakiBos }}
 */
function ekle(govde, o = {}) {
  const d = oku(o.dosya);
  const k = normalle(govde);
  const alanHata = kayitDenetle(k);
  if (alanHata.length) throw new DefterHatasi(`Kayıt geçersiz: ${alanHata.map(h => h.mesaj).join('; ')}`, 400, alanHata);
  const bozuk = d.kayitlar.filter(x => x._gecersiz);
  if (bozuk.length) throw new DefterHatasi(`Defter dosyasında ${bozuk.length} geçersiz satır var (satır ${bozuk.map(x => x._satir).join(', ')}); önce dosya düzeltilmeli.`, 409);
  const cak = gecerliler(d.kayitlar).filter(x => k.aralik[0] <= x.aralik[1] && x.aralik[0] <= k.aralik[1]);
  if (cak.length) throw new DefterHatasi(`${etiket(k)} mevcut kayıtla ÇAKIŞIYOR: ${cak.map(x => `${etiket(x)} ${x.baslik || ''}`.trim()).join(' · ')}. Sonraki boş numara ${sonrakiBos(d.kayitlar)}.`, 409);
  const sonraki = sonrakiBos(d.kayitlar);
  if (k.aralik[0] > sonraki) throw new DefterHatasi(`${etiket(k)} boşluk açar (#${sonraki}–${k.aralik[0] - 1} kayıtsız kalır). Sonraki boş numara ${sonraki}; kullanılmayacak numaralar "BOS" kaydıyla ayrılır.`, 400);
  if (k.aralik[1] > sonraki + AZAMI_ILERI) throw new DefterHatasi(`${etiket(k)} çok ileri: son numara sonraki boş numaradan (${sonraki}) en çok ${AZAMI_ILERI} fazla olabilir.`, 400);
  let metin = d.var ? fs.readFileSync(d.dosya, 'utf8') : '';
  if (metin && !metin.endsWith('\n')) metin += '\n';
  atomikYaz(d.dosya, metin + JSON.stringify(k) + '\n');
  return { kayit: k, sonrakiBos: Math.max(sonraki, k.aralik[1] + 1) };
}

/** CLAUDE.md "Deneme sayacı" paragrafındaki "Güncel: **N**" sayısı (yoksa null). */
function claudeSayaci(metin) {
  const m = String(metin || '').match(/Güncel:\s*\*\*(\d+)\*\*/);
  return m ? Number(m[1]) : null;
}

/** Tam görünüm: kayıtlar + özet + denetim (GET /api/defter ve CLI aynı işi yapar). */
/** Plan belgesinde anılan betikler — anlatının "nerede" satırı (önbellekli; sunucu ömrü boyunca). */
let betikler = null;

function gorunum(o = {}) {
  const d = oku(o.dosya);
  // PLAN-PANEL-2 §2: her kayda okunur anlatı (lib/defterAnlati.js) — dosyaya yazılmaz, her okumada türetilir.
  const ANL = require('./defterAnlati');
  if (!betikler) betikler = ANL.betikBulucu(KOK);
  const bugun = o.bugun && gecerliGun(o.bugun) ? o.bugun : bugunStr();
  return {
    dosya: path.relative(KOK, d.dosya).replace(/\\/g, '/'),
    var: d.var,
    kayitlar: d.kayitlar.map(k => (k && !k._gecersiz ? { ...k, anlati: ANL.anlati(k, { bugun, betikler }) } : k)),
    ozet: ozet(d.kayitlar, { bugun: o.bugun }),
    hatalar: d.var ? denetle(d.kayitlar) : [{ satir: null, kod: 'dosya', mesaj: `${path.relative(KOK, d.dosya).replace(/\\/g, '/')} yok — defter henüz aktarılmadı` }],
    uyarilar: d.var ? uyarilar(d.kayitlar) : [],
    durumlar: DURUMLAR, holdoutlar: HOLDOUT,
  };
}

function router(o = {}) {
  const express = require('express');
  const r = express.Router();
  const json = express.json({ limit: GOVDE_SINIRI });
  const log = o.log || (() => {});
  r.get('/api/defter', (req, res) => {
    try { res.json({ success: true, ...gorunum({ dosya: o.dosya }) }); } catch (e) {
      log('WARN', `📒 Defter okunamadı: ${e.message}`);
      res.status(500).json({ success: false, error: String(e.message).slice(0, 400) });
    }
  });
  r.post('/api/defter', json, (req, res) => {
    // server.js'teki genel express.json (10 mb) bu yönlendiriciden ÖNCE çalışır; 64 kb sınırı burada ayrıca uygulanır.
    const uzun = Number(req.headers['content-length']) > GOVDE_SINIRI || Buffer.byteLength(JSON.stringify(req.body == null ? null : req.body), 'utf8') > GOVDE_SINIRI;
    if (uzun) return res.status(413).json({ success: false, error: `Gövde çok büyük (en çok ${GOVDE_SINIRI / 1024} kb).` });
    try {
      const s = ekle(req.body, { dosya: o.dosya });
      log('INFO', `📒 Defter: ${etiket(s.kayit)} eklendi (${s.kayit.durum}, ${s.kayit.aile}) — git'e işlemek kullanıcının elinde`);
      res.json({ success: true, ...s });
    } catch (e) {
      const kullanici = e instanceof DefterHatasi;
      if (!kullanici) log('WARN', `📒 Defter yazılamadı: ${e.message}`);
      res.status(kullanici ? e.durum : 500).json({ success: false, error: String(e.message).slice(0, 600), hatalar: (e.hatalar || null) });
    }
  });
  return r;
}

module.exports = {
  oku, ayristir, denetle, uyarilar, kayitUyar, ozet, sonrakiBos, ayrilmisBos, enYuksekDeneme, AZAMI_ILERI, GOVDE_SINIRI, ekle, gorunum, router, normalle, kayitDenetle, cakismalar, bosluklar, atomikYaz,
  claudeSayaci, gecerliGun, DefterHatasi, DURUMLAR, HOLDOUT, ALANLAR, VARSAYILAN_DOSYA,
};
