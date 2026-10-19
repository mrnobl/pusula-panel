/**
 * PORTFÖY TASARIMCISI — MODEL PORTFÖY DEFTERİ. PLAN-PORTFOY-TASARIMCI.md (b) "Dondurma", (d) Veri.
 * Öz test: node scripts/tasarimci-selftest.js (G bölümü).
 *
 * Dizin: TASARIMCI_DIZIN ortam değişkeni, yoksa <proje>/data/tasarimci (git dışı). İçerik:
 *   kararlar.jsonl   ay sonu kararları (model + kararGunu başına BİR satır; girdi imzalı)
 *   dolumlar.jsonl   sanal dolumlar (uygulama günü açılışı; 837 ay sonu aktarımı)
 *   gunluk.jsonl     gün başına BİR satır (model + gun), DEĞİŞMEZ; her satır bir öncekinin SHA-256'sını taşır (zincir)
 *   emirler/YYYY-MM.json  bu ayın hedef listesi taslağı (F4 gerçek emir tablosunu dolduracak)
 *   durum.json       son tik özeti (uyarılar, veri notu, mutabakat) — her tikte yeniden yazılır (kayıt değil)
 *   sermaye.json     (isteğe bağlı, yalnız sunucu) gerçek sermaye tutarı — git'e, Telegram'a, kayitlar/'a GİTMEZ
 *   tik.kilit        süreçler arası kilit (sunucu zamanlayıcısı ile `npm run tasarimci:tik` aynı anda yazamaz)
 *
 * YALNIZ EKLENİR: jsonl dosyalarında satır silinmez/değişmez. Yazım ATOMİK (lib/portfoyum/depo.js deseni): tüm dosya + yeni
 * satırlar geçici dosyaya, fsync, rename — yarım satır kalmaz. Eklemeden önce dosyanın okunduğu andaki içerikle aynı olduğu
 * denetlenir (araya başka yazım girdiyse hata). Anahtar (model|gun ya da model|kararGunu) zaten varsa satır EKLENMEZ
 * (idempotent; ekle() eklenmeyenleri `atlanan` olarak döndürür).
 *
 * MAKİNE ETİKETİ: data/makine.json `arastirmaModu: true` → 'gelistirme' (bu makine), yoksa 'ev'. Geliştirme makinesinin her
 * kaydı `deneme: true` taşır — resmî kayıt yalnız sunucuda (PLAN (b)).
 *
 * API
 *   dizin(yeni?) · ortam({ dizin?, makine?, makineDosya? }) → önceki (test) · makine() → 'ev' | 'gelistirme' · yol(...p)
 *   oku(ad) → { satirlar, bozuk }   (ad: 'kararlar' | 'dolumlar' | 'gunluk')
 *   ekle(ad, satirlar, { anahtar }) → { eklenen, atlanan }   anahtar(satir) → metin; aynı anahtar varsa atlanır
 *   jsonOku(goreli) · jsonYaz(goreli, veri) (atomik)
 *   kilitle(f, { omurMs? }) → f()'in sonucu (async destekli); kilit alınamazsa hata (KilitHatasi)
 *   sha(nesne) → hex (anahtar sırası sabit JSON)   kanonik(nesne) → metin
 *   gunlukZinciriDogrula(satirlar) → { tamam, hatalar }
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const crypto = require('crypto');

const PROJE = path.join(__dirname, '..', '..');
let _dizin = null, _makine = null, _makineDosya = null;
function dizin(yeni) { if (yeni !== undefined) _dizin = yeni; return _dizin || process.env.TASARIMCI_DIZIN || yollar.veri('tasarimci'); }
function ortam(yeni) {
  const eski = { dizin: _dizin, makine: _makine, makineDosya: _makineDosya };
  if (yeni) { if ('dizin' in yeni) _dizin = yeni.dizin; if ('makine' in yeni) _makine = yeni.makine; if ('makineDosya' in yeni) _makineDosya = yeni.makineDosya; }
  return eski;
}
const yol = (...p) => path.join(dizin(), ...p);
const DOSYA = { kararlar: 'kararlar.jsonl', dolumlar: 'dolumlar.jsonl', gunluk: 'gunluk.jsonl' };

/** 'gelistirme' | 'ev' — data/makine.json arastirmaModu (yalnız geliştirme makinesinde bulunur). */
function makine() {
  if (_makine) return _makine;
  try { if (JSON.parse(fs.readFileSync(_makineDosya || yollar.veri('makine.json'), 'utf8')).arastirmaModu) return 'gelistirme'; } catch (e) { /* yok → ev */ }
  return 'ev';
}

function atomikYaz(dosya, metin) {
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  const gecici = `${dosya}.${process.pid}.${Date.now()}.tmp`;
  try {
    const fd = fs.openSync(gecici, 'w');
    try { fs.writeSync(fd, metin); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(gecici, dosya);
  } catch (e) { try { fs.unlinkSync(gecici); } catch (x) { /* yok */ } throw e; }
}

function hamOku(ad) {
  if (!DOSYA[ad]) throw new Error(`tasarimci/defter: bilinmeyen dosya '${ad}'`);
  try { return fs.readFileSync(yol(DOSYA[ad]), 'utf8'); } catch (e) { return ''; }
}
function cozumle(metin) {
  const satirlar = [], bozuk = [];
  metin.split('\n').forEach((s, i) => {
    if (!s.trim()) return;
    try { satirlar.push(JSON.parse(s)); } catch (e) { bozuk.push({ satir: i + 1, mesaj: `satır ${i + 1}: geçersiz JSON` }); }
  });
  return { satirlar, bozuk };
}
function oku(ad) { return cozumle(hamOku(ad)); }

/** Yalnız ekle; aynı anahtarlı satır varsa atla. */
function ekle(ad, yeniler, { anahtar }) {
  const eski = hamOku(ad), { satirlar, bozuk } = cozumle(eski);
  if (bozuk.length) throw new Error(`tasarimci/defter: ${DOSYA[ad]} bozuk (${bozuk[0].mesaj}) — elle onarın; yazım durduruldu`);
  const var_ = new Set(satirlar.map(anahtar));
  const eklenen = [], atlanan = [];
  for (const s of yeniler || []) { const k = anahtar(s); if (var_.has(k)) atlanan.push(s); else { var_.add(k); eklenen.push(s); } }
  if (!eklenen.length) return { eklenen, atlanan };
  if (hamOku(ad) !== eski) throw new Error(`tasarimci/defter: ${DOSYA[ad]} okunduktan sonra değişti — yazım durduruldu`);
  const on = eski && !eski.endsWith('\n') ? eski + '\n' : eski;
  atomikYaz(yol(DOSYA[ad]), on + eklenen.map(s => JSON.stringify(s)).join('\n') + '\n');
  return { eklenen, atlanan };
}

function jsonOku(goreli) { try { return JSON.parse(fs.readFileSync(yol(goreli), 'utf8')); } catch (e) { return null; } }
function jsonYaz(goreli, veri) { atomikYaz(yol(goreli), JSON.stringify(veri, null, 1) + '\n'); }

// ── Kilit ────────────────────────────────────────────────────────────────────
class KilitHatasi extends Error {}
function pidCanli(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
const KILIT = () => yol('tik.kilit');
const YAZILIYOR_MS = 30e3;   // orkestratör kilidiyle aynı pay: boş/yarım kilit 30 sn içinde "yazılıyor" sayılır
/** → null (kilit yok) | { pid, bas, bayat, yaziliyor?, ham } */
function kilitDurumu(omurMs = 30 * 60e3) {
  let ham;
  try { ham = fs.readFileSync(KILIT(), 'utf8'); } catch (e) { return null; }
  let k = null; try { k = JSON.parse(ham); } catch (e) { k = null; }
  if (!k || !Number.isInteger(k.pid)) {
    let yeni = false; try { yeni = Date.now() - fs.statSync(KILIT()).mtimeMs < YAZILIYOR_MS; } catch (e) { return null; }
    return { pid: null, bas: null, bayat: !yeni, yaziliyor: yeni, ham };
  }
  const yas = Date.now() - Date.parse(k.bas || 0);
  return { ...k, bayat: !(yas < omurMs) || !pidCanli(k.pid), ham };
}
/**
 * Kilit: 'wx' ile oluştur; varsa ve bayatsa (ölü pid / ömür aşımı / 30 sn'den eski bozuk dosya) DEVRAL — bayat dosya önce
 * benzersiz ada TAŞINIR ve içeriği bayat sanılanla aynı mı denetlenir (arada başka süreç taze kilit yazdıysa geri konur).
 * Aldıktan sonra dosya yeniden okunur; içerik bu sürecinki değilse kilit alınmamış sayılır.
 */
async function kilitle(f, { omurMs = 30 * 60e3 } = {}) {
  fs.mkdirSync(dizin(), { recursive: true });
  const benim = JSON.stringify({ pid: process.pid, bas: new Date().toISOString(), rastgele: crypto.randomBytes(6).toString('hex') });
  let alindi = false;
  for (let i = 0; i < 4 && !alindi; i++) {
    try {
      const fd = fs.openSync(KILIT(), 'wx');
      try { fs.writeSync(fd, benim); } finally { fs.closeSync(fd); }
      let geri = null; try { geri = fs.readFileSync(KILIT(), 'utf8'); } catch (e) { geri = null; }
      if (geri !== benim) throw new KilitHatasi('tasarımcı kilidi alındıktan hemen sonra başka süreçte görünüyor — yarış; sonraki tik yeniden dener');
      alindi = true;
    } catch (e) {
      if (e instanceof KilitHatasi) throw e;
      if (e.code !== 'EEXIST') throw e;
      const k = kilitDurumu(omurMs);
      if (!k) continue;   // arada silindi → yeniden dene
      if (k.yaziliyor) throw new KilitHatasi('tasarımcı kilidi şu an yazılıyor (başka süreç) — sonraki tik yeniden dener');
      if (!k.bayat) throw new KilitHatasi(`tasarımcı kilidi başka süreçte (pid ${k.pid}, ${k.bas}'den beri)`);
      const tasi = `${KILIT()}.bayat.${process.pid}.${Date.now()}`;
      try { fs.renameSync(KILIT(), tasi); } catch (x) { continue; }   // başkası taşıdı → yeniden dene
      let tasinan = null; try { tasinan = fs.readFileSync(tasi, 'utf8'); } catch (x) { tasinan = null; }
      if (tasinan !== k.ham) {
        try { fs.linkSync(tasi, KILIT()); } catch (x) { /* yerinde yeni kilit var */ }
        try { fs.unlinkSync(tasi); } catch (x) { /* yok */ }
        throw new KilitHatasi('tasarımcı kilidi devralınırken başka süreç taze kilit yazdı — yarış; sonraki tik yeniden dener');
      }
      try { fs.unlinkSync(tasi); } catch (x) { /* yok */ }
    }
  }
  if (!alindi) throw new KilitHatasi('tasarımcı kilidi alınamadı: ' + KILIT());
  try { return await f(); } finally {
    try { if (fs.readFileSync(KILIT(), 'utf8') === benim) fs.unlinkSync(KILIT()); } catch (e) { /* yok */ }
  }
}

// ── İmza ─────────────────────────────────────────────────────────────────────
function kanonik(x) {
  if (Array.isArray(x)) return '[' + x.map(kanonik).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => JSON.stringify(k) + ':' + kanonik(x[k])).join(',') + '}';
  return JSON.stringify(x === undefined ? null : x);
}
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : kanonik(x)).digest('hex');
/** gunluk satırları: her modelin satırları sırayla; sha = sha(satır − sha), onceki = aynı modelin bir önceki sha'sı. */
function gunlukZinciriDogrula(satirlar) {
  const son = new Map(), hatalar = [];
  for (const s of satirlar) {
    const { sha: imza, ...govde } = s;
    if (sha(govde) !== imza) hatalar.push(`${s.model} ${s.gun}: satır imzası tutmuyor`);
    const o = son.get(s.model) || null;
    if ((s.onceki || null) !== o) hatalar.push(`${s.model} ${s.gun}: zincir kopuk (önceki ${o ? o.slice(0, 8) : '—'} ≠ ${s.onceki ? s.onceki.slice(0, 8) : '—'})`);
    son.set(s.model, imza);
  }
  return { tamam: !hatalar.length, hatalar };
}

module.exports = { dizin, ortam, yol, makine, oku, ekle, jsonOku, jsonYaz, atomikYaz, kilitle, kilitDurumu, KilitHatasi, sha, kanonik, gunlukZinciriDogrula, DOSYA };
