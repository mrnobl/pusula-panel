'use strict';
/**
 * PUSULA DOKTORU — ONARIM MOTORU DURUMU (F2): <veri>/doktor/motor.json — kip, gölge başlangıcı, kural aç/kapa, KALICI sayaçlar
 * (yeniden başlatmada sıfırlanmaz). Atomik yazım (tmp + rename). Dosya yoksa / bozuksa varsayılan: kip GÖLGE, gölge şimdi başlar
 * (kullanıcı kararı 2026-10-27). Bozuk dosya etkin kipe ASLA düşmez: okunamayan kip gölge sayılır (güvenli yön).
 * Başka hiçbir dosyaya yazılmaz.
 */
const fs = require('fs');
const path = require('path');
const O = require('./onarim');

function varsayilanYol() { return require('../yollar').veri('doktor', 'motor.json'); }

function varsayilan(simdi = Date.now()) {
  return { surum: 1, kip: 'golge', kipZaman: simdi, kipKaynak: 'ilk kurulum (varsayılan gölge)', golgeBas: simdi, golgeHatirlatildi: false,
    kurallar: Object.fromEntries(O.KURALLAR.map(r => [r.kimlik, { acik: r.varsayilan }])), sayac: { golge: {}, etkin: {} } };
}

/** Saf: okunan nesneyi doğrular / tamamlar. Etkin kip yalnız açıkça 'etkin' yazıyorsa; başka her şey gölge. */
function duzelt(j, simdi = Date.now()) {
  const v = varsayilan(simdi);
  if (!j || typeof j !== 'object') return { ...v, bozukOkundu: !!j };
  const kip = O.KIPLER.includes(j.kip) ? j.kip : 'golge';
  const kurallar = {};
  for (const r of O.KURALLAR) { const x = j.kurallar && j.kurallar[r.kimlik]; kurallar[r.kimlik] = { acik: x && typeof x.acik === 'boolean' ? x.acik : r.varsayilan, ...(x && x.zaman ? { zaman: x.zaman } : {}) }; }
  const sayac = { golge: {}, etkin: {} };
  for (const k of ['golge', 'etkin']) {
    const s = j.sayac && j.sayac[k];
    if (s && typeof s === 'object') for (const [a, x] of Object.entries(s)) if (x && typeof x === 'object') sayac[k][a] = { ...O.yeniSayac(), ...x, denemeler: Array.isArray(x.denemeler) ? x.denemeler.filter(Number.isFinite) : [] };
  }
  return { surum: 1, kip, kipZaman: Number.isFinite(j.kipZaman) ? j.kipZaman : simdi, kipKaynak: j.kipKaynak || null,
    golgeBas: Number.isFinite(j.golgeBas) ? j.golgeBas : (kip === 'golge' ? simdi : null), golgeHatirlatildi: !!j.golgeHatirlatildi, kurallar, sayac };
}

function oku(dosya = varsayilanYol(), simdi = Date.now()) {
  let j = null;
  try { j = JSON.parse(fs.readFileSync(dosya, 'utf8')); } catch (e) { if (e && e.code !== 'ENOENT') j = 'bozuk'; }
  return duzelt(j === 'bozuk' ? true : j, simdi);
}

/** @returns true | false (yazılamadı — motor bellekte sürer, bir sonraki turda yeniden yazar) */
function yaz(d, dosya = varsayilanYol()) {
  try {
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
    const g = `${dosya}.${process.pid}.tmp`;
    fs.writeFileSync(g, JSON.stringify(d, null, 1), 'utf8');
    fs.renameSync(g, dosya);
    return true;
  } catch { return false; }
}

module.exports = { oku, yaz, duzelt, varsayilan, varsayilanYol };
