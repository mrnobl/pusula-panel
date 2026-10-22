/**
 * KAİROS BTC AĞIRLIĞI DEĞİŞTİRİCİLERİ — ortak ölçüm araçları. ARAŞTIRMA / ÖLÇÜM MODÜLÜ (canlıya bağlı DEĞİL).
 * Kullananlar: scripts/mvrv-btc.js (PLAN-MVRV-BTC.md, 903–904), scripts/oi-cokusu.js (PLAN-OI-COKUSU.md, 907).
 *
 * Kairos (iç kimlik `hucum`) = O-GC içindeyken %100 BTC teminat + Kalkan kolu ×3 (`bindirme.simule({ btcPay: 1 })`).
 * Adaylar BTC ağırlığını GÜN GÜN değiştirir: `bindirme.simule({ btcVar: false, taban })` tek üyeli (yalnız BTC) taban sepetiyle
 * koşulur — bu kod yolu PLAN-COKLU-TABAN EK-1/EK-2'de Hücum ile BİREBİR doğrulandı (BTC-tek taban = Hücum) ve burada her koşuda
 * yeniden sağlanır (`esdegerlik`). bindirme.js / cokluTaban.js / pitVeri.js DEĞİŞTİRİLMEDİ.
 *
 * Ağırlık fonksiyonu agirlik(t) → [0, 1]: t GÜNÜ açılışında uygulanacak BTC payı (karar t−1 kapanışında; Kairos'un O-GC'si
 * `rejim(t)` = t−1 kapanışındaki karar, cokluTaban.rejimFn). Rejim dışı pay USDT (getiri 0).
 *
 * Dönemler ve holdout koruması (cokluTaban/coklu-taban.js deseni): her dönem ayrı İŞÇİ sürecinde, VERI_KESIM ile (pitVeri barları
 * ve funding'i SQL'de `time < kesim` okur), kol önbelleği AYNI kesimle market.db'den yeniden kurulur; kesimDenetle yüklenen her
 * parçayı denetler. Geliştirme işçileri kesim ≤ 2024-01-01 olmadan koşmaz.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const yollar = require('../yollar');
const B = require('./bindirme');
const C = require('./cokluTaban');
const O = require('../risk/olcum');

const ROOT = path.join(__dirname, '..', '..');
const GUN = 864e5;
const ms = (s) => Date.parse(s + 'T00:00:00Z');
const gun = (t) => new Date(t).toISOString().slice(0, 10);
const HOLDOUT_BAS = '2024-01-01';
/** Stres (PLAN-MVRV §2, PLAN-OI §2): geçiş (spot) maliyeti ×2 = %0,24 ve kayma ×2 (kol: taker %0,05 + kayma %0,04). */
const STRES = Object.freeze({ maliyet: 0.0005 + 2 * 0.0002, spotMal: 2 * 0.0012 });

/** Tam Kairos dönemleri. S: spot vekil (PLAN-COKLU-TABAN S ayarı); P: perp geliştirme; H: holdout (tam takvim 2020-09-04 →). */
const DONEM = Object.freeze({
  S: { env: { MARKET_DB: 'data/gomlek/spot-1d.db', FUNDING_SABIT: '0.0001', GOMLEK_BAS: '2017-10-01', VERI_KESIM: '2020-09-03', ONBELLEK_DOSYA: 'kairos-agirlik-spot-dev.json' },
    pencere: { bas: '2018-01-01', bit: '2020-09-02' } },
  P: { env: { VERI_KESIM: HOLDOUT_BAS, ONBELLEK_DOSYA: 'kairos-agirlik-perp-dev.json' }, pencere: { bas: '2020-09-04', bit: '2023-12-31' } },
  H: { env: { VERI_KESIM: '2026-10-01', ONBELLEK_DOSYA: 'kairos-agirlik-perp-hol.json' }, pencere: { bas: HOLDOUT_BAS, bit: '2026-09-30' } },
});
const ENV_TEMIZ = ['MARKET_DB', 'FUNDING_SABIT', 'GOMLEK_BAS', 'ONBELLEK', 'ONBELLEK_DOSYA', 'SADECE_ONBELLEK', 'TEMINAT', 'REJIM', 'REJIM_DOSYA', 'OGC_PARAM',
  'TEMINAT_H', 'TEMINAT_FON_YILLIK', 'TEMINAT_MMR', 'EK_SERI', 'EVREN_HARIC', 'EVREN_K', 'EVREN_MIN_YAS', 'KOL_DOSYA', 'VERI_KESIM', 'VERI_BOZ', 'GIRIS_YASAK', 'SERMAYE', 'KADEME', 'BANT',
  'KA_KIP', 'KA_BOZ', 'KA_VARYANT', 'KA_KILIT'];
function ortam(ek) { const e = { ...process.env }; for (const k of ENV_TEMIZ) delete e[k]; return { ...e, ...ek }; }

/** Geliştirme kesimi zorunlu ve holdout başından sonra olamaz. */
function devKesimDenetle(env) {
  const k = env.VERI_KESIM;
  if (!k || !Number.isFinite(ms(k))) throw new Error('HOLDOUT KORUMASI: VERI_KESIM tanımsız — geliştirme ölçümü kesimsiz koşamaz');
  if (ms(k) > ms(HOLDOUT_BAS)) throw new Error(`HOLDOUT KORUMASI: VERI_KESIM ${k} > ${HOLDOUT_BAS}`);
  return ms(k);
}

/** Kol önbelleğini verilen kesimle market.db'den yeniden kur (data/arastirma/<ONBELLEK_DOSYA>). */
function onbellekKur(env) {
  const f = yollar.veri('arastirma', env.ONBELLEK_DOSYA);
  if (fs.existsSync(f)) fs.unlinkSync(f);
  const t0 = Date.now();
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'capraz-marj-sim.js')], { env: ortam({ ...env, ONBELLEK: '1', SADECE_ONBELLEK: '1', KOL_DOSYA: 'kairos-agirlik-yok.json' }), maxBuffer: 1 << 26, cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  return (Date.now() - t0) / 1000;
}

// ═══ SİMÜLASYON ═══════════════════════════════════════════════════════════════
/** Kairos'un rejimi: t günü = t−1 kapanışındaki O-GC kararı (bindirme wMap ile aynı). */
function rejim(v) { return C.rejimFn(v.seri, B.BTC); }

/** Aday: BTC ağırlığı agirlik(t) (0 → USDT). stres → STRES maliyetleri. */
function adaySim(agirlik, { stres = false } = {}) {
  const taban = { agirlik: (t) => { const w = agirlik(t); return w > 0 ? new Map([[B.BTC, w]]) : new Map(); } };
  return B.simule({ btcVar: false, taban, ...(stres ? STRES : {}) });
}
/** Kairos (ölçülen sistem, eski kod yolu). */
function kairosSim({ stres = false } = {}) { return B.simule({ btcPay: 1, ...(stres ? STRES : {}) }); }

/** taban kod yolu = Kairos BİREBİR mi (m ≡ 1). */
function esdegerlik(v, K) {
  const r = rejim(v);
  const E = adaySim((t) => r(t));
  const ayni = JSON.stringify(E.egri) === JSON.stringify(K.egri) && JSON.stringify(E.gunluk.map(g => [g.t, g.gk, g.gunIci])) === JSON.stringify(K.gunluk.map(g => [g.t, g.gk, g.gunIci]));
  let maks = 0; E.egri.forEach((x, i) => { maks = Math.max(maks, Math.abs(x.oz / K.egri[i].oz - 1)); });
  return { birebir: ayni, enBuyukGoreliFark: maks };
}

// ═══ ÖLÇÜM ════════════════════════════════════════════════════════════════════
const getiri = (e) => e.slice(1).map((x, i) => x.oz / e[i].oz - 1);
/** Bir simülasyonun pencere ölçüsü (cokluTaban.olc + Calmar). */
function pencereOlc(E, gunler) {
  const e = C.kes(E.egri, gunler[0], gunler[gunler.length - 1]);
  if (e.length !== gunler.length + 1) throw new Error('eğri pencereyle hizalı değil');
  const m = C.olc(e, { gunluk: E.gunluk, tasfiye: E.st.tasfiye.map(x => x.t) });
  m.calmar = m.maxDD > 0 ? m.cagr / m.maxDD : null;
  delete m.yillik; m.yillik = B.yillik(e);
  return { m, e };
}
/** BTC al-tut (ilk gün açılışta %0,1 giriş). */
function alTutOlc(v, gunler) {
  const e = C.alTut(v.seri, B.BTC, gunler);
  const m = C.olc(e); m.calmar = m.maxDD > 0 ? m.cagr / m.maxDD : null; m.yillik = B.yillik(e);
  return { m, e };
}

/** Yol üstünde CAGR ve Calmar (bootstrap için). */
function yolOlc(r) {
  let a = 1, tepe = 1, dd = 0;
  for (const x of r) { a *= 1 + x; if (a > tepe) tepe = a; dd = Math.max(dd, 1 - a / tepe); }
  const cagr = a > 0 ? Math.pow(a, 365.25 / r.length) - 1 : -1;
  return { cagr, calmar: dd > 0 ? cagr / dd : (cagr > 0 ? Infinity : 0) };
}
/**
 * Eşli durağan bootstrap P(ölçü(aday) > ölçü(taban)) — ortalama blok 20 g, N 2000, tohum verilir (deneme no).
 * @param alan 'cagr' | 'calmar'
 */
function bootP(eA, eK, alan, tohum, { N = 2000 } = {}) {
  const rA = getiri(eA), rK = getiri(eK);
  if (rA.length !== rK.length) throw new Error('bootstrap hizası bozuk');
  const satir = rA.map((x, i) => [x, rK[i]]);
  const k = O.duraganBootstrap(satir, { b: 20, N, H: satir.length, tohum, olc: (yol) => (yolOlc(yol.map(p => p[0]))[alan] > yolOlc(yol.map(p => p[1]))[alan] ? 1 : 0) });
  return k.reduce((x, y) => x + y, 0) / k.length;
}

/**
 * Aday ağırlığının tabandan farklı olduğu günler ve bölümler (PLAN-FUNDING-OI §5 deseni): ardışık farklı gün koşuları; aralarında
 * < 5 gün boşluk olan koşular TEK bölüm sayılır (bölümler ≥ 5 g aralıklı).
 */
function farkOlc(gunler, wA, wK, { aralik = 5 } = {}) {
  const fark = gunler.filter(t => Math.abs(wA(t) - wK(t)) > 1e-12);
  const bolum = [];
  for (const t of fark) {
    const s = bolum[bolum.length - 1];
    if (s && (t - s.bit) / GUN - 1 < aralik) { s.bit = t; s.gun++; } else bolum.push({ bas: t, bit: t, gun: 1 });
  }
  return { gun: fark.length, bolum: bolum.length, bolumler: bolum.map(b => ({ bas: gun(b.bas), bit: gun(b.bit), gun: b.gun })) };
}

/** Ağırlık değişimi sayısı ve ortalama BTC ağırlığı (bilgi). */
function agirlikOzet(gunler, w) {
  let deg = 0, top = 0;
  gunler.forEach((t, i) => { top += w(t); if (i && Math.abs(w(t) - w(gunler[i - 1])) > 1e-12) deg++; });
  return { degisim: deg, ortalama: top / gunler.length };
}

// ═══ HOLDOUT KİLİDİ VE DONDURMA ═══════════════════════════════════════════════
function blobSha(g) { return execFileSync('git', ['hash-object', path.join(ROOT, g)], { cwd: ROOT, encoding: 'utf8' }).trim(); }
function dondur(dosya, liste) {
  const o = { olusturuldu: new Date().toISOString(), not: 'git hash-object blob SHA-1; holdout açılışı her birini denetler', dosyalar: Object.fromEntries(liste.map(g => [g, blobSha(g)])) };
  fs.writeFileSync(dosya, JSON.stringify(o, null, 1) + '\n');
  return o;
}
function dondurmaDenetle(dosya) {
  if (!fs.existsSync(dosya)) throw new Error('dondurma.json yok — holdout açılmaz');
  const D = JSON.parse(fs.readFileSync(dosya, 'utf8'));
  const fark = Object.entries(D.dosyalar).filter(([g, s]) => blobSha(g) !== s).map(([g]) => g);
  if (fark.length) throw new Error('DONMUŞ DOSYA DEĞİŞMİŞ: ' + fark.join(', '));
  return D;
}
/** Kilit: wx ile tek sefer; varsa açılış REDDEDİLİR (hata olsa da kilit kalır). */
function kilitAl(dosya, bilgi) {
  if (fs.existsSync(dosya)) { const k = JSON.parse(fs.readFileSync(dosya, 'utf8')); throw new Error(`holdout ZATEN AÇILDI (${k.acilis}, durum ${k.durum}) — ikinci açılış reddedildi`); }
  fs.writeFileSync(dosya, JSON.stringify({ acilis: new Date().toISOString(), durum: 'aciliyor', ...bilgi }, null, 1) + '\n', { flag: 'wx' });
  return (durum, ek = {}) => { const k = JSON.parse(fs.readFileSync(dosya, 'utf8')); fs.writeFileSync(dosya, JSON.stringify({ ...k, durum, guncelleme: new Date().toISOString(), ...ek }, null, 1) + '\n'); };
}

/** Holm adım-aşağı (PLAN-MVRV §5): P büyükten küçüğe; i. sıra eşiği 1 − α/(n − i); ilk düşüşten sonra hepsi düşer. */
function holm(liste, { alfa = 0.30, n = liste.length } = {}) {
  const s = [...liste].sort((a, b) => b.P - a.P);
  let dur = false;
  return s.map((x, i) => { const esik = 1 - alfa / (n - i); const gecer = !dur && x.P >= esik; if (!gecer) dur = true; return { ...x, sira: i + 1, esik, gecer }; });
}

const yz = (x, b = 1) => (x == null || !Number.isFinite(x) ? '—' : `%${(x * 100).toFixed(b)}`.replace('.', ','));
const v2 = (x) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(2).replace('.', ','));

module.exports = { GUN, ms, gun, HOLDOUT_BAS, STRES, DONEM, ENV_TEMIZ, ortam, devKesimDenetle, onbellekKur, rejim, adaySim, kairosSim, esdegerlik,
  getiri, pencereOlc, alTutOlc, yolOlc, bootP, farkOlc, agirlikOzet, blobSha, dondur, dondurmaDenetle, kilitAl, holm, yz, v2 };
