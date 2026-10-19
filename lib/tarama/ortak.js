/**
 * COIN TARAMA — ortak yardımcılar (dosya yolları, atomik yazım, yalnız eklenen JSONL, kanonik JSON + SHA-256).
 *
 * Bu modül ağ kullanmaz. `lib/live` ve `lib/risk`e dokunmaz; canlı bot kararlarını etkilemez.
 * Dizin: `data/tarama/` (git dışı). Testler `TARAMA_DIZIN` ile geçici dizin verir.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const crypto = require('crypto');

const KOK = path.join(__dirname, '..', '..');
const GUN_MS = 864e5;

function dizinler(o = {}) {
  const dizin = o.dizin || process.env.TARAMA_DIZIN || yollar.veri('tarama');
  const disa = o.disaDizin || process.env.LISTE_DISA_DIZIN || path.join(KOK, 'kayitlar', 'listeler');
  return {
    dizin,
    disa,
    ayarlar: path.join(dizin, 'ayarlar.json'),
    denetim: path.join(dizin, 'denetim.jsonl'),
    anlikDizin: path.join(dizin, 'anlik'),
    taramalar: path.join(dizin, 'taramalar.jsonl'),
    durum: path.join(dizin, 'durum.json'),
    ozet: path.join(dizin, 'ozet.json'),
    kilit: path.join(dizin, 'tarama.kilit'),
    listeler: path.join(dizin, 'listeler.jsonl'),
    piyasaDizin: path.join(dizin, 'piyasa'),
    fiyatOnbellek: path.join(dizin, 'fiyat-onbellek.json'),
    rdapBootstrap: path.join(dizin, 'rdap-bootstrap.json'),
  };
}

function klasor(p) { fs.mkdirSync(p, { recursive: true }); }

/** Atomik yazım: geçici dosya + rename (yarım dosya kalmaz). */
function atomikYaz(dosya, icerik) {
  klasor(path.dirname(dosya));
  const gecici = `${dosya}.${process.pid}.tmp`;
  fs.writeFileSync(gecici, typeof icerik === 'string' ? icerik : JSON.stringify(icerik, null, 2), 'utf8');
  fs.renameSync(gecici, dosya);
}

function jsonOku(dosya, yedek = null) {
  try { return JSON.parse(fs.readFileSync(dosya, 'utf8')); } catch { return yedek; }
}

/** YALNIZ EKLE: tek satır JSON + '\n'. Var olan satırlara asla dokunulmaz. */
function satirEkle(dosya, nesne) {
  klasor(path.dirname(dosya));
  fs.appendFileSync(dosya, JSON.stringify(nesne) + '\n', 'utf8');
}

/** JSONL okuma; bozuk satır atlanır ve sayılır (dosyaya dokunulmaz). */
function satirlariOku(dosya) {
  const out = []; let bozuk = 0;
  let metin = '';
  try { metin = fs.readFileSync(dosya, 'utf8'); } catch { return { satirlar: out, bozuk }; }
  for (const s of metin.split('\n')) {
    if (!s.trim()) continue;
    try { out.push(JSON.parse(s)); } catch { bozuk++; }
  }
  return { satirlar: out, bozuk };
}

/** Kanonik JSON: anahtarlar sıralı, boşluksuz — aynı içerik her zaman aynı metin (özet için). */
function kanonik(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x === undefined ? null : x);
  if (Array.isArray(x)) return '[' + x.map(kanonik).join(',') + ']';
  return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + kanonik(x[k])).join(',') + '}';
}
const sha256 = (metin) => crypto.createHash('sha256').update(String(metin), 'utf8').digest('hex');

const gunStr = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const gunMs = (g) => Date.parse(`${g}T00:00:00Z`);
const gecerliGun = (g) => typeof g === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g) && Number.isFinite(gunMs(g)) && gunStr(gunMs(g)) === g;

/** Dış kaynaktan gelen metin: tek satır, denetim karakteri yok, kısaltılmış. Hiçbir zaman yorumlanmaz/çalıştırılmaz. */
function temizMetin(x, uzunluk = 120) {
  if (x === null || x === undefined) return null;
  // eslint-disable-next-line no-control-regex
  return String(x).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, uzunluk);
}
/** Dış kaynaktan sayı: sonlu değilse null (0 UYDURULMAZ). */
function sayi(x) {
  if (x === null || x === undefined || x === '') return null;
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}
/** "0"/"1"/0/1/true → boolean | null. */
function bayrak01(x) {
  if (x === null || x === undefined || x === '') return null;
  if (x === true || x === 1 || x === '1') return true;
  if (x === false || x === 0 || x === '0') return false;
  return null;
}

const medyan = (a) => {
  const b = a.filter(v => Number.isFinite(v)).sort((x, y) => x - y);
  const n = b.length;
  if (!n) return null;
  return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
};
const ortalama = (a) => { const b = a.filter(v => Number.isFinite(v)); return b.length ? b.reduce((s, v) => s + v, 0) / b.length : null; };
/** Sıralı dizide yüzdelik (en yakın sıra; temmuz-listesi-analiz.js ile aynı: alt floor, üst ceil-1). */
function yuzdelikSinir(a, alt, ust) {
  const b = a.filter(v => Number.isFinite(v)).sort((x, y) => x - y);
  if (!b.length) return null;
  return [b[Math.floor(alt * b.length)], b[Math.max(0, Math.ceil(ust * b.length) - 1)]];
}
/** Kırpılmış (winsorize) ortalama: her değer [lo, hi] aralığına kırpılır, sonra ortalama. */
function kirpikOrtalama(a, lo, hi) {
  const b = a.filter(v => Number.isFinite(v));
  if (!b.length || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return ortalama(b.map(v => Math.min(hi, Math.max(lo, v))));
}

/** Süreç canlı mı (kilit bayatlığı için). */
function surecCanli(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

module.exports = {
  KOK, GUN_MS, dizinler, klasor, atomikYaz, jsonOku, satirEkle, satirlariOku, kanonik, sha256,
  gunStr, gunMs, gecerliGun, temizMetin, sayi, bayrak01, medyan, ortalama, yuzdelikSinir, kirpikOrtalama, surecCanli,
};
