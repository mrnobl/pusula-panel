'use strict';
/**
 * PİYASA BAĞLAMI — İLERİYE KAYIT OKUYUCUSU (73.9). lib/ileriKayit'in günlük dosyalarını (<kök>/<kayıtçı>/<gün>.jsonl, geçmiş günler
 * .jsonl.gz) SATIR SATIR akışla okur — dosya belleğe bütün alınmaz (opsiyon günü onlarca MB olabilir). Yazmaz; kayıtçıya dokunmaz.
 * Satırlar önce ucuz metin süzgecinden geçer (ön süzgeç), yalnız eşleşenler JSON.parse edilir. Bozuk / yarım satır atlanır.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

const gunStr = (t) => new Date(t).toISOString().slice(0, 10);

/** Bir günün dosyası (düz varsa o, yoksa .gz) ya da null. */
function gunDosyasi(kok, kayitci, gun) {
  const f = path.join(kok, kayitci, `${gun}.jsonl`);
  if (fs.existsSync(f)) return { f, gz: false };
  if (fs.existsSync(f + '.gz')) return { f: f + '.gz', gz: true };
  return null;
}

/** Kayıtçının dosyası olan günler (eskiden yeniye). */
function gunler(kok, kayitci) {
  try { return [...new Set(fs.readdirSync(path.join(kok, kayitci)).map(a => (/^(\d{4}-\d{2}-\d{2})\.jsonl(\.gz)?$/.exec(a) || [])[1]).filter(Boolean))].sort(); } catch { return []; }
}

/**
 * Bir günün satırlarını akışla gezer. onSatir(nesne) her eşleşen satır için. onSuzgec(metin) → bool (isteğe bağlı ön süzgeç).
 * @returns {Promise<{ okunan, eslesen }>}
 */
async function gunGez(kok, kayitci, gun, { onSuzgec = null, onSatir }) {
  const d = gunDosyasi(kok, kayitci, gun);
  if (!d) return { okunan: 0, eslesen: 0 };
  let akis = fs.createReadStream(d.f);
  if (d.gz) akis = akis.pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: akis, crlfDelay: Infinity });
  let okunan = 0, eslesen = 0;
  try {
    for await (const s of rl) {
      okunan++;
      if (!s || (onSuzgec && !onSuzgec(s))) continue;
      let x; try { x = JSON.parse(s); } catch { continue; }
      eslesen++;
      onSatir(x);
    }
  } catch (e) {
    // Bozuk .gz (yarım yazım): o güne kadar okunanlar geçerli
  } finally { rl.close(); if (akis.destroy) akis.destroy(); }
  return { okunan, eslesen };
}

/**
 * Son anlık görüntü (opsiyon): bugünün (yoksa dünün) dosyasından, (kaynak, alt) başına EN SON `zaman` grubunun satırları.
 * Opsiyon kayıtçısı bir koşuda borsa+coin başına tek zaman damgası yazar.
 * @returns {Promise<{ gun, satirlar: [], zaman: { 'okx|BTC': iso } } | null>}
 */
async function sonGoruntu(kok, kayitci, simdi, { gunGeri = 2, onSuzgec = null } = {}) {
  for (let i = 0; i < gunGeri; i++) {
    const gun = gunStr(simdi - i * 864e5);
    if (!gunDosyasi(kok, kayitci, gun)) continue;
    const grup = new Map();   // anahtar → { zaman, satirlar }
    await gunGez(kok, kayitci, gun, { onSuzgec, onSatir: (x) => {
      if (!x || !x.zaman) return;
      const k = `${x.kaynak}|${x.alt || ''}`;
      const g = grup.get(k);
      if (!g || x.zaman > g.zaman) grup.set(k, { zaman: x.zaman, satirlar: [x] });
      else if (x.zaman === g.zaman) g.satirlar.push(x);
    } });
    if (!grup.size) continue;
    const satirlar = [], zaman = {};
    for (const [k, g] of grup) { satirlar.push(...g.satirlar); zaman[k] = g.zaman; }
    return { gun, satirlar, zaman };
  }
  return null;
}

/** Son n günün eşleşen satırları (pozisyon istatistikleri gibi küçük süzülmüş kümeler için). */
async function sonGunler(kok, kayitci, simdi, n, { onSuzgec = null, donustur = (x) => x } = {}) {
  const out = [];
  const sinir = gunStr(simdi - (n - 1) * 864e5);
  for (const gun of gunler(kok, kayitci).filter(g => g >= sinir)) {
    // eslint-disable-next-line no-await-in-loop
    await gunGez(kok, kayitci, gun, { onSuzgec, onSatir: (x) => { const y = donustur(x); if (y) out.push(y); } });
  }
  return out;
}

module.exports = { gunDosyasi, gunler, gunGez, sonGoruntu, sonGunler };
