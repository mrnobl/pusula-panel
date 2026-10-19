/**
 * PORTFÖY KARAR MOTORU — ortak yardımcılar (yollar, tarih, disk önbelleği, atomik yazım).
 *
 * Yollar `ortam({ veriKok })` ile değiştirilebilir (öz test geçici klasörde indirme hata yollarını sınar).
 * Varsayılan veri kökü: Pusula veri yeri (lib/yollar.js; eski kurulumda <proje>/data). veriKok verilirse (test) düz klasör.
 */
const fs = require('fs');
const path = require('path');
const veriYollari = require('../yollar');

const GUN = 864e5;
const PROJE = path.join(__dirname, '..', '..');

const _ortam = { veriKok: null,   // null = Pusula veri yeri (lib/yollar.js); test geçici düz klasör verir
  fetch: (...a) => globalThis.fetch(...a), simdi: () => Date.now(), bekle: ms => new Promise(r => setTimeout(r, ms)),
  // Yahoo dizin önceliği: güncellenmiş kopya (data/portfoy/yahoo) önce. Araştırma dosyalarıyla birebir kıyas için ['nasdaq', 'gercek-varlik', 'yahoo'].
  yahooOncelik: ['yahoo', 'nasdaq', 'gercek-varlik'] };
/** Ortamı değiştir (yalnız test / araç). Döndürür: önceki ortam (geri yüklemek için). */
function ortam(yeni) {
  const eski = { ..._ortam };
  if (yeni) Object.assign(_ortam, yeni);
  return eski;
}

/** Veri kökü altındaki göreli yol: varsayılan ortamda lib/yollar.js (tür alt klasörleri), testte düz veriKok. */
const vy = (...p) => (_ortam.veriKok ? path.join(_ortam.veriKok, ...p) : veriYollari.veri(...p));
function yollar() {
  const P = vy('portfoy');
  return {
    veriYolu: vy,
    nasdaq: vy('nasdaq'),
    gercekVarlik: vy('gercek-varlik'),
    gercek: vy('gercek'),
    portfoy: P,
    yahoo: path.join(P, 'yahoo'),               // L1 indirmeleri + güncellenmiş Yahoo serileri (öncelikli kaynak)
    yahooBist: path.join(P, 'yahoo-bist'),      // tasarımcı BIST havuzu + XU030 (orkestratör 'yahoo-bist'; katalogda listelenmez)
    tefasFon: path.join(P, 'tefas'),            // portfoyVeri'nin fon dosyaları (temsilciler + adaylar)
    tefasEk: path.join(P, 'tefas-ek'),          // L1 ile ham aylardan kurulan ek fonlar
    tefasHam: path.join(P, 'tefas-ham'),
    tefasKatalog: path.join(P, 'tefas-katalog.json'),
    tefasTemsilci: path.join(P, 'tefas-temsilci.json'),
    evds: path.join(P, 'evds-mevduat.json'),
    usdtry: path.join(P, 'USDTRY_X.json'),
    tufe: path.join(P, 'tufe.json'),
    onbellek: path.join(P, 'onbellek'),
    katalogOnbellek: path.join(P, 'onbellek', 'katalog.json'),
    seviyeOnbellek: path.join(P, 'onbellek', 'seviye'),
    marketDb: vy('market.db'),
    arastirma: vy('arastirma'),
  };
}

const tarihT = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const tStr = t => new Date(t).toISOString().slice(0, 10);
const ayAnahtar = t => new Date(t).toISOString().slice(0, 7);
const bugunT = () => { const d = new Date(_ortam.simdi()); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };

/** Yahoo dosya adı (nasdaq-indir ile aynı kural): ^ = vb. → '_'. */
const yahooDosyaAdi = s => String(s).replace(/[^A-Z0-9.]/gi, '_') + '.json';

function jsonOku(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
/** Atomik yazım: geçici dosya + yeniden adlandırma (yarım dosya kalmaz). */
function jsonYaz(p, veri, girinti) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const gecici = p + '.' + process.pid + '.tmp';
  fs.writeFileSync(gecici, JSON.stringify(veri, null, girinti));
  fs.renameSync(gecici, p);
}
/** Dosya imzası (önbellek geçerliliği): yoksa null. */
function imza(p) {
  try { const s = fs.statSync(p); return `${Math.round(s.mtimeMs)}:${s.size}`; } catch (e) { return null; }
}

/** Basit sınırlı bellek önbelleği (en eski kullanılan atılır). */
class Bellek {
  constructor(sinir = 400) { this.sinir = sinir; this.m = new Map(); }
  al(k) { if (!this.m.has(k)) return undefined; const v = this.m.get(k); this.m.delete(k); this.m.set(k, v); return v; }
  koy(k, v) { this.m.set(k, v); if (this.m.size > this.sinir) this.m.delete(this.m.keys().next().value); return v; }
  temizle(onEk) { if (onEk == null) this.m.clear(); else for (const k of [...this.m.keys()]) if (k.startsWith(onEk)) this.m.delete(k); }
}

module.exports = { GUN, PROJE, ortam, ortamAl: () => _ortam, yollar, tarihT, tStr, ayAnahtar, bugunT, yahooDosyaAdi, jsonOku, jsonYaz, imza, Bellek };
