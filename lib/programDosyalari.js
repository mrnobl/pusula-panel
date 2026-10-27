'use strict';
/**
 * S-013 (2026-10-27) PROGRAM DOSYALARI VAR MI — antivirüs Pusula çalışırken bir dosyayı silerse / karantinaya alırsa Pusula
 * çalışmaya devam eder (modüller bellekte) ama bir sonraki yeniden başlatmada açılmaz (2026-10-21/22 Kaspersky olayı).
 * Öz denetim (lib/ozDenetim.js `program`) saatte bir bu listeye YALNIZ fs.existsSync ile bakar: dosya okunmaz, özet / tarama yok
 * (antivirüsü tetikleyecek davranış yok). Denetleyici (scripts/denetleyici-bekle.js) çökme döngüsü iletisinde aynı KRITIK listeyi kullanır.
 *
 * Liste: KRITIK (spec: server.js, package.json, başlatma betikleri) + açılışta var olan lib/live/*.js + bu süreçte yüklenmiş program
 * modülleri (require.cache: server.js, lib/, scripts/) + package.json bağımlılıklarının node_modules/<ad>/package.json'u. Bir dosya
 * yalnız açılışta VAR idiyse izlenir (dağıtımda hiç olmayan dosya için yanlış alarm yok). Kod Pusula açıldıktan sonra değiştiyse
 * (güncelleme indi, yeniden başlatma bekliyor — git HEAD ≠ açılıştaki HEAD) `kodDegisti` döner: eksik dosya güncellemeden olabilir.
 * Saf olmayan tek iş fs.existsSync / readdirSync / .git/HEAD okuması; alt süreç, ağ, yazma YOK.
 */
const fs = require('fs');
const path = require('path');

/** Antivirüs silerse Pusula'nın AÇILAMAYACAĞI dosyalar (kökten göreli). */
const KRITIK = ['server.js', 'package.json', 'package-lock.json', 'scripts/start-bot.cmd', 'scripts/denetleyici-bekle.js', 'scripts/pusula-sunucu.ps1',
  'lib/yollar.js', 'lib/database.js', 'lib/ozDenetim.js', 'lib/sorunlar.js', 'lib/guncelleme.js'];

const goreli = (kok, y) => path.relative(kok, y).replace(/\\/g, '/');
const varMi = (y) => { try { return fs.existsSync(y); } catch { return false; } };

/** git HEAD'in işaret ettiği commit (yalnız dosya okuma; okunamazsa null). Çalışma ağacı (.git dosyası) desteklenir. */
function headSha(kok) {
  try {
    let git = path.join(kok, '.git');
    if (fs.statSync(git).isFile()) { const m = /gitdir:\s*(.+)/.exec(fs.readFileSync(git, 'utf8')); if (!m) return null; git = path.resolve(kok, m[1].trim()); }
    const h = fs.readFileSync(path.join(git, 'HEAD'), 'utf8').trim();
    if (/^[0-9a-f]{40}$/.test(h)) return h;
    const ref = (/^ref:\s*(.+)$/.exec(h) || [])[1];
    if (!ref) return null;
    const ortak = fs.existsSync(path.join(git, 'commondir')) ? path.resolve(git, fs.readFileSync(path.join(git, 'commondir'), 'utf8').trim()) : git;
    for (const d of [git, ortak]) { const f = path.join(d, ref); if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim(); }
    const paket = path.join(ortak, 'packed-refs');
    if (fs.existsSync(paket)) { const s = fs.readFileSync(paket, 'utf8').split('\n').find(x => x.endsWith(` ${ref}`)); if (s) return s.slice(0, 40); }
    return null;
  } catch { return null; }
}

/** Saf: package.json bağımlılıkları → node_modules/<ad>/package.json göreli yolları. */
function paketYollari(kok) {
  try { const p = JSON.parse(fs.readFileSync(path.join(kok, 'package.json'), 'utf8')); return Object.keys(p.dependencies || {}).map(a => `node_modules/${a}/package.json`); } catch { return []; }
}

/**
 * İzleyici: açılışta (olustur çağrısında) var olan dosyaları kaydeder; `liste()` her çağrıda yüklenmiş modülleri de ekler.
 * @param o { kok, cache (require.cache), bas (açılıştaki HEAD; varsayılan şimdi okunan) }
 */
function olustur({ kok, cache = require.cache, bas = undefined } = {}) {
  const kokN = path.resolve(kok);
  const izlenen = new Map();   // göreli → mutlak
  const ekle = (rel) => { const y = path.join(kokN, rel); if (!izlenen.has(rel) && varMi(y)) izlenen.set(rel, y); };
  for (const r of KRITIK) ekle(r);
  try { for (const f of fs.readdirSync(path.join(kokN, 'lib', 'live'))) if (/\.js$/.test(f)) ekle(`lib/live/${f}`); } catch { /* */ }
  for (const r of paketYollari(kokN)) ekle(r);
  const acilisHead = bas !== undefined ? bas : headSha(kokN);
  const onbellektenEkle = () => {
    for (const f of Object.keys(cache || {})) {
      const r = goreli(kokN, path.resolve(f));
      if (r.startsWith('..') || path.isAbsolute(r) || /^node_modules\//.test(r)) continue;
      if (!/^(server\.js$|lib\/|scripts\/)/.test(r) || !/\.(js|json)$/.test(r)) continue;
      if (!izlenen.has(r)) izlenen.set(r, path.join(kokN, r));   // yüklenmiş = o an vardı
    }
  };
  return {
    /** { dosyalar: [{ ad, yol }], kodDegisti } */
    liste() {
      onbellektenEkle();
      const h = headSha(kokN);
      return { dosyalar: [...izlenen].map(([ad, yol]) => ({ ad, yol })), kodDegisti: !!(acilisHead && h && h !== acilisHead) };
    },
    acilisHead,
  };
}

/** Denetleyici için (Pusula açılamıyor): KRITIK + bağımlılık paketlerinden diskte OLMAYANLAR (yalnız existsSync). */
function eksikKritik(kok) {
  const kokN = path.resolve(kok);
  return [...KRITIK.filter(r => r !== 'scripts/pusula-sunucu.ps1' && r !== 'package-lock.json'), ...paketYollari(kokN)].filter(r => !varMi(path.join(kokN, r)));
}

module.exports = { KRITIK, headSha, paketYollari, olustur, eksikKritik };
