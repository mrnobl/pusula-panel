'use strict';
/**
 * PUSULA DOKTORU — SİCİL (F1, 78.1): Doktor'un KENDİ bakım işlerinin kaydı — <veri>/doktor/sicil.jsonl (yalnız eklenir).
 * Satır: { z, is: 'D1'|'D2', sonuc, … } (tutar / sır yok). 90 günden eski satırlar dosya 1 MB'ı aşınca ayıklanır (atomik yeniden yazım).
 * Başka hiçbir modülün kaydına yazılmaz (K7: yeni yazma kancası yok — onarım günlüğü diğer kayıtları yalnız okur).
 */
const fs = require('fs');
const path = require('path');

const SAKLA_MS = 90 * 864e5;
const AYIKLA_BAYT = 1024 * 1024;

function varsayilanYol() { return require('../yollar').veri('doktor', 'sicil.jsonl'); }

/** Bir satır ekler; hata yutar (bakım işi kayıt yazılamadı diye durmaz). @returns satır | null */
function ekle(satir, dosya = varsayilanYol()) {
  try {
    const s = { z: Date.now(), ...satir };
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
    fs.appendFileSync(dosya, JSON.stringify(s) + '\n', 'utf8');
    return s;
  } catch { return null; }
}

/** Son `gun` günün satırları (eskiden yeniye). Okunamazsa []. */
function oku(gun = 30, dosya = varsayilanYol(), simdi = Date.now()) {
  const sinir = simdi - gun * 864e5;
  try {
    return fs.readFileSync(dosya, 'utf8').split('\n').filter(Boolean).map(x => { try { return JSON.parse(x); } catch { return null; } })
      .filter(x => x && Number.isFinite(x.z) && x.z >= sinir);
  } catch { return []; }
}

/** Dosya AYIKLA_BAYT'ı aştıysa 90 günden eskileri atar (tmp + rename). @returns atılan satır sayısı | 0 */
function ayikla(dosya = varsayilanYol(), simdi = Date.now()) {
  try {
    if (fs.statSync(dosya).size <= AYIKLA_BAYT) return 0;
    const satirlar = fs.readFileSync(dosya, 'utf8').split('\n').filter(Boolean);
    const kalan = satirlar.filter(x => { try { const j = JSON.parse(x); return Number.isFinite(j.z) && j.z >= simdi - SAKLA_MS; } catch { return false; } });
    const g = `${dosya}.${process.pid}.tmp`;
    fs.writeFileSync(g, kalan.length ? kalan.join('\n') + '\n' : '', 'utf8');
    fs.renameSync(g, dosya);
    return satirlar.length - kalan.length;
  } catch { return 0; }
}

module.exports = { ekle, oku, ayikla, varsayilanYol, SAKLA_MS };
