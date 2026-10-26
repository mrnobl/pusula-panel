'use strict';
/**
 * KALICI DOSYA (61.7, denetim Y2) — bot durum dosyaları için elektrik kesintisine dayanıklı yazma ve KAPALI-BAŞARISIZ okuma.
 *
 * Sorun: durum dosyaları `writeFileSync(tmp) → renameSync` ile yazılıyordu, fsync YOKTU; elektrik kesilirse NTFS yeni dosyayı
 * boş/sıfırlarla bırakabilir. Okurken bozuk dosya sessizce "varsayılan"a dönüyordu → risk K3 mandalı, HWM, uygulama sapması
 * ENGEL'i silinip bot işlem yapmaya devam ediyordu.
 *
 *   yaz(dosya, nesne)  → tmp'ye yaz + fsync → rename → (mümkünse dizin fsync) · önceki iyi kopya `<dosya>.yedek`
 *   oku(dosya)         → { veri, bozuk }:
 *                         dosya da .yedek de yok → { veri: null, bozuk: null }   (ilk kurulum)
 *                         dosya yok + .yedek var → { veri: yedek, bozuk: '… yoktu — .yedek'ten kurtarıldı' }  (A-03; ana dosya geri yazılır)
 *                         okunur                 → { veri, bozuk: null }
 *                         bozuk + .yedek okunur  → { veri: yedek, bozuk: 'açıklama' }  (bozuk dosya .bozuk-<zaman>.bak'a kopyalanır)
 *                         bozuk + yedek de yok   → { veri: null, bozuk: 'açıklama' }
 *   Çağıran `bozuk` doluysa ENGEL koyar + alarm verir (sessiz sıfırlama YOK). Kurtarılan yedek veri yine kullanılır (K3 mandalı geri gelir).
 *   satirEkle(dosya, satir) → appendFile + fsync (emir defteri: gönderimden ÖNCE diske — WAL'ın amacı).
 */
const fs = require('fs');
const path = require('path');

function fsyncDosya(fd) { try { fs.fsyncSync(fd); } catch { /* bazı dosya sistemleri desteklemez */ } }

function dizinFsync(dizin) {
  // Windows'ta dizin açılamaz (EISDIR/EPERM) — dosya fsync'i orada en iyi çabadır.
  let fd = null;
  try { fd = fs.openSync(dizin, 'r'); fs.fsyncSync(fd); } catch { /* desteklenmiyor */ } finally { if (fd != null) try { fs.closeSync(fd); } catch { /* */ } }
}

// A-02 (78.x): Windows'ta antivirüs / arama dizinleyicisi / yedek kopyası hedefi o an açık tutabilir → rename EPERM/EBUSY/EACCES.
// Tek denemede istisna bot döngüsünde "tik hatası" sayılır (30 dk'da 3 → öz denetim tam kapanma). Kısa artan beklemeyle
// en çok 5 deneme (toplam ≈ 750 ms; lib/defter.js atomikYaz ve lib/evYazma.js ile aynı yaklaşım). Geçici dosya adı süreç + sayaçla
// benzersiz (sunucu ile betik aynı dosyaya yazarsa birbirinin geçicisini ezmez); hata olursa geçici dosya silinir.
const KILIT_KODLARI = ['EPERM', 'EBUSY', 'EACCES'];
const BEKLEMELER = [50, 100, 200, 400];   // 5 deneme arası 4 bekleme (ms)
let geciciSayac = 0;
const bekle = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { const b = Date.now() + ms; while (Date.now() < b) { /* */ } } };

function metinYaz(dosya, metin) {
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  const gecici = `${dosya}.${process.pid}.${++geciciSayac}.tmp`;
  try {
    const fd = fs.openSync(gecici, 'w');
    try { fs.writeSync(fd, metin, null, 'utf8'); fsyncDosya(fd); } finally { fs.closeSync(fd); }
    for (let i = 0; ; i++) {
      try { fs.renameSync(gecici, dosya); break; } catch (e) {
        if (i >= BEKLEMELER.length || !KILIT_KODLARI.includes(e && e.code)) throw e;
        bekle(BEKLEMELER[i]);
      }
    }
  } catch (e) {
    try { fs.rmSync(gecici, { force: true }); } catch { /* yok */ }
    throw e;
  }
  dizinFsync(path.dirname(dosya));
}

/**
 * Atomik + fsync'li yazım; mevcut dosya geçerliyse önce `.yedek`e alınır (son iyi kopya).
 * @param secenek.girinti JSON girintisi (varsayılan 2; 0 → tek satır — kâğıt borsa dosyası eski biçimiyle aynı kalsın)
 */
function yaz(dosya, nesne, secenek = {}) {
  const girinti = secenek && Number.isInteger(secenek.girinti) ? secenek.girinti : 2;
  const metin = girinti ? JSON.stringify(nesne, null, girinti) : JSON.stringify(nesne);
  try {
    if (fs.existsSync(dosya)) {
      const eski = fs.readFileSync(dosya, 'utf8');
      if (gecerliMi(eski)) metinYaz(`${dosya}.yedek`, eski);
    }
  } catch { /* yedek alınamadı — ana yazım yine yapılır */ }
  metinYaz(dosya, metin);
}

function gecerliMi(metin) {
  if (!metin || !metin.trim() || /^\0+$/.test(metin)) return false;
  try { const j = JSON.parse(metin.replace(/^﻿/, '')); return !!j && typeof j === 'object'; } catch { return false; }
}

function ayristir(metin) {
  if (!metin || !metin.trim()) throw new Error('dosya boş');
  if (/\0/.test(metin)) throw new Error('dosyada sıfır baytlar var (yarım yazım)');
  const j = JSON.parse(metin.replace(/^﻿/, ''));
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('beklenen nesne değil');
  return j;
}

/** Ana dosyayı son iyi kopyadan geri yazar; döndürür açıklama eki. */
function onar(dosya, yedekMetin) {
  // Denetim 61.8 #6: ana dosya onarılır — yoksa her açılışta yeniden "bozuk" (ENGEL + alarm + yeni .bak) olurdu.
  try { metinYaz(dosya, yedekMetin); return ' ve dosya onarıldı'; } catch (e) { return ` (onarılamadı: ${e.message})`; }
}

/** @returns {{ veri: object|null, bozuk: string|null }} */
function oku(dosya, simdi = Date.now) {
  if (!fs.existsSync(dosya)) {
    // A-03 (78.x): ana dosya YOK ama son iyi kopya (.yedek) VAR → sessiz "ilk kurulum" değil (antivirüs karantinası, elle silme,
    // yanlış taşıma). Yedekten açılır, ana dosya geri yazılır ve `bozuk` dolar → çağıran bozuk-dosya yolunun aynısını izler
    // (bot ENGEL + alarm; engeli kaldırmak kullanıcıda). Hiç dosya yoksa davranış eskisi gibi (ilk kurulum).
    const yedek = `${dosya}.yedek`;
    if (!fs.existsSync(yedek)) return { veri: null, bozuk: null };
    const ad = path.basename(dosya);
    let yedekMetin;
    try { yedekMetin = fs.readFileSync(yedek, 'utf8'); return { veri: ayristir(yedekMetin), bozuk: `${ad} yoktu — son iyi kopyadan (.yedek) kurtarıldı${onar(dosya, yedekMetin)}` }; } catch (e) {
      if (yedekMetin === undefined && e && e.code === 'ENOENT') return { veri: null, bozuk: null };   // yarış: yedek de az önce kalktı
      return { veri: null, bozuk: `${ad} yoktu — son iyi kopya (.yedek) de okunamadı (${String(e.message).slice(0, 60)})` };
    }
  }
  let hata;
  try { return { veri: ayristir(fs.readFileSync(dosya, 'utf8')), bozuk: null }; } catch (e) { hata = e; }
  const bak = `${dosya}.bozuk-${simdi()}.bak`;
  try { fs.copyFileSync(dosya, bak); } catch { /* yedek alınamadı */ }
  let veri = null, yedekNot = 'son iyi kopya (.yedek) YOK';
  try {
    if (fs.existsSync(`${dosya}.yedek`)) {
      const yedekMetin = fs.readFileSync(`${dosya}.yedek`, 'utf8');
      veri = ayristir(yedekMetin);
      yedekNot = 'son iyi kopyadan (.yedek) kurtarıldı';
      yedekNot += onar(dosya, yedekMetin);
    }
  } catch (e) { yedekNot = `son iyi kopya da bozuk (${e.message.slice(0, 60)})`; }
  return { veri, bozuk: `${path.basename(dosya)} bozuk (${String(hata.message).slice(0, 80)}) — ${yedekNot}; bozuk dosya ${path.basename(bak)}` };
}

/** Dosya boş değil ve son baytı satır sonu değilse true (elektrik kesintisinde yarım kalmış son satır). */
function yarimSonMu(dosya) {
  let fd = null;
  try {
    const boy = fs.statSync(dosya).size;
    if (!boy) return false;
    const b = Buffer.alloc(1);
    fd = fs.openSync(dosya, 'r');
    fs.readSync(fd, b, 0, 1, boy - 1);
    return b[0] !== 0x0a;
  } catch { return false; } finally { if (fd != null) try { fs.closeSync(fd); } catch { /* */ } }
}

/**
 * Yalnız eklenen günlük satırı: yaz + fsync (gönderimden önce diske).
 * M4-2 (PLAN-TEST Dalga 2): son satır yarım kaldıysa önce satır sonu yazılır — yeni kayıt yarım satıra yapışıp okunamaz
 * hâle gelmez; yarım satır tek başına kalır, okuyucu onu bozuk satır olarak atlar (ve bildirir).
 */
function satirEkle(dosya, satir) {
  const on = yarimSonMu(dosya) ? '\n' : '';
  const fd = fs.openSync(dosya, 'a');
  try { fs.writeSync(fd, on + (satir.endsWith('\n') ? satir : `${satir}\n`), null, 'utf8'); fsyncDosya(fd); } finally { fs.closeSync(fd); }
}

module.exports = { yaz, oku, satirEkle, gecerliMi };
