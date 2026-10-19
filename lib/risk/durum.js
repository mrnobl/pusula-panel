/**
 * KALICI RİSK DURUMU — `data/risk-durum.json`. ARASTIRMA-RISK.md §4.0, L5.5.
 *
 * Tepe özsermaye (HWM), gün/hafta/ay başı özsermaye ve KILL mandalı yeniden
 * başlatmayla SIFIRLANMAMALI: aksi halde süreç yeniden başlatılarak kill
 * atlatılabilirdi. Kill yalnız `killSifirla` ile (elle, panelden) açılır.
 *
 * `guncelle` saf: (durum, ozsermaye, simdi) → yeni durum. G/Ç `yukle`/`kaydet`.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');

const DOSYA = yollar.veri('risk-durum.json');
const GUN = 864e5;
const gunNo = (t) => Math.floor(t / GUN);
const haftaNo = (t) => Math.floor((t / GUN + 3) / 7);          // pazartesi başlangıçlı ISO hafta
const ayNo = (t) => { const d = new Date(t); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };

function bos() {
  return { surum: 1, hwm: null, ozsermaye: null, gunBasi: null, haftaBasi: null, ayBasi: null, gun: null, hafta: null, ay: null, kill: 0, killNedeni: null, killZamani: null, guncelleme: null };
}

/** Saf güncelleme: tepe, dönem başları; kill mandalı korunur. */
function guncelle(durum, ozsermaye, simdi = Date.now()) {
  const d = { ...bos(), ...durum };
  if (!(ozsermaye > 0)) return d;
  d.ozsermaye = ozsermaye;
  d.hwm = Math.max(d.hwm || 0, ozsermaye);
  if (d.gun !== gunNo(simdi)) { d.gun = gunNo(simdi); d.gunBasi = ozsermaye; }
  if (d.hafta !== haftaNo(simdi)) { d.hafta = haftaNo(simdi); d.haftaBasi = ozsermaye; }
  if (d.ay !== ayNo(simdi)) { d.ay = ayNo(simdi); d.ayBasi = ozsermaye; }
  d.guncelleme = simdi;
  return d;
}

/** riskUygula sonucundaki kill seviyesini mandala yaz. */
function killIsle(durum, sonuc, simdi = Date.now()) {
  if (sonuc && sonuc.kill > (durum.kill || 0)) return { ...durum, kill: sonuc.kill, killNedeni: sonuc.killNedeni, killZamani: simdi };
  return durum;
}

/** Elle sıfırlama: kill kalkar, HWM mevcut özsermayeye çekilir (yeni başlangıç). */
function killSifirla(durum) {
  return { ...durum, kill: 0, killNedeni: null, killZamani: null, hwm: durum.ozsermaye || durum.hwm };
}

/**
 * Y2 (61.7): bozuk dosya K3 mandalını ve HWM'yi SİLMEZ — son iyi kopyadan (.yedek) okunur. Yedek de yoksa boş durum
 * döner; bu durumda kalkanBot kurulumda `riskBozuk` yazar ve BindirmeBot ENGEL koyar (sessiz devam yok).
 */
function yukle(dosya = DOSYA) {
  for (const f of [dosya, `${dosya}.yedek`]) {
    try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (j && typeof j === 'object') return { ...bos(), ...j }; } catch { /* sonraki */ }
  }
  return bos();
}

function kaydet(durum, dosya = DOSYA) {
  require('../live/kaliciDosya').yaz(dosya, durum);   // atomik + fsync + son iyi kopya
}

module.exports = { bos, guncelle, killIsle, killSifirla, yukle, kaydet, DOSYA };
