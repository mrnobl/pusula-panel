/**
 * İçe aktarıcıların ortak yardımcıları (sürüm 64.7) — saf.
 *   zamanCoz(s, ofsetDk)   "2024-01-15 10:30:00" · "2024.01.15 10:30" · "24-01-15 10:30:00" (iki haneli yıl) · "2024/01/15T10:30:00Z" ·
 *                          epoch ms/sn → UTC ms. Saat dilimi yazmıyorsa metin `ofsetDk` dakikalık yerel saat sayılır (varsayılan 0 = UTC).
 *   baslikHaritasi(satir, adaylar)  başlık hücreleri → { alan: indis } (baslikNorm ile; ilk eşleşen)
 *   icerikKimligi(parcalar, sayac)  kimliksiz satırlar için kararlı kimlik: sha1(alanlar) + aynı içerikte kaçıncı satır
 */
'use strict';
const crypto = require('crypto');
const MT = require('../metin');

function zamanCoz(girdi, ofsetDk = 0) {
  if (girdi == null) return null;
  if (typeof girdi === 'number') return girdi > 1e12 ? girdi : girdi > 1e9 ? girdi * 1000 : null;
  const s = String(girdi).trim();
  if (/^\d{10,13}$/.test(s)) return Number(s) > 1e12 ? Number(s) : Number(s) * 1000;
  const m = /^(\d{2,4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3}))?)?)?\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (!m) return null;
  let y = +m[1];
  if (m[1].length === 2) y += 2000;
  const t = Date.UTC(y, +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), m[7] ? +m[7].padEnd(3, '0') : 0);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  if (m[8]) {
    if (/^(Z|UTC|GMT)$/i.test(m[8])) return t;
    const o = /([+-])(\d{2}):?(\d{2})/.exec(m[8]);
    return t - (o[1] === '-' ? -1 : 1) * (+o[2] * 60 + +o[3]) * 60000;
  }
  return t - ofsetDk * 60000;
}

/** Başlıktaki saat dilimi: "Date(UTC)" → 0, "Time(UTC+8)" → 480, "Time (UTC+03:00)" → 180; yoksa null. */
function baslikOfseti(s) {
  const m = /(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i.exec(String(s || ''));
  if (m) return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0));
  return /\b(UTC|GMT)\b/i.test(String(s || '')) ? 0 : null;
}

function baslikHaritasi(satir, adaylar) {
  const norm = satir.map(h => MT.baslikNorm(h));
  const out = {};
  for (const [alan, liste] of Object.entries(adaylar)) {
    for (const a of liste) {
      const i = norm.findIndex(h => (a instanceof RegExp ? a.test(h) : h === a));
      if (i >= 0) { out[alan] = i; break; }
    }
  }
  return out;
}

function icerikKimligi(parcalar, sayac) {
  const ozet = crypto.createHash('sha1').update(parcalar.map(x => String(x == null ? '' : x)).join('|')).digest('hex').slice(0, 16);
  const n = (sayac.get(ozet) || 0) + 1;
  sayac.set(ozet, n);
  return `h:${ozet}#${n}`;
}

/** Satırı başlıklarla nesneye (ham alan için). */
const satirNesne = (baslik, satir) => Object.fromEntries(baslik.map((b, i) => [b || `c${i}`, satir[i] == null ? '' : satir[i]]));

module.exports = { zamanCoz, baslikOfseti, baslikHaritasi, icerikKimligi, satirNesne };
