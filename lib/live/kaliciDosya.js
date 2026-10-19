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
 *                         dosya yok              → { veri: null, bozuk: null }
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

function metinYaz(dosya, metin) {
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  const gecici = `${dosya}.tmp`;
  const fd = fs.openSync(gecici, 'w');
  try { fs.writeSync(fd, metin, null, 'utf8'); fsyncDosya(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(gecici, dosya);
  dizinFsync(path.dirname(dosya));
}

/** Atomik + fsync'li yazım; mevcut dosya geçerliyse önce `.yedek`e alınır (son iyi kopya). */
function yaz(dosya, nesne) {
  const metin = JSON.stringify(nesne, null, 2);
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

/** @returns {{ veri: object|null, bozuk: string|null }} */
function oku(dosya, simdi = Date.now) {
  if (!fs.existsSync(dosya)) return { veri: null, bozuk: null };
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
      // Denetim 61.8 #6: ana dosya onarılır — yoksa her açılışta yeniden "bozuk" (ENGEL + alarm + yeni .bak) olurdu.
      try { metinYaz(dosya, yedekMetin); yedekNot += ' ve dosya onarıldı'; } catch (e) { yedekNot += ` (onarılamadı: ${e.message})`; }
    }
  } catch (e) { yedekNot = `son iyi kopya da bozuk (${e.message.slice(0, 60)})`; }
  return { veri, bozuk: `${path.basename(dosya)} bozuk (${String(hata.message).slice(0, 80)}) — ${yedekNot}; bozuk dosya ${path.basename(bak)}` };
}

/** Yalnız eklenen günlük satırı: yaz + fsync (gönderimden önce diske). */
function satirEkle(dosya, satir) {
  const fd = fs.openSync(dosya, 'a');
  try { fs.writeSync(fd, satir.endsWith('\n') ? satir : `${satir}\n`, null, 'utf8'); fsyncDosya(fd); } finally { fs.closeSync(fd); }
}

module.exports = { yaz, oku, satirEkle, gecerliMi };
