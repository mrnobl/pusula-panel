/**
 * VERİ YOLU — TEK MODÜL (68.0, PLAN-TASIMA F2)
 * ═══════════════════════════════════════════════════════════════════════════
 * Pusula'nın bütün çalışma verisi (portföy, bot durumları, sırlar, araştırma, önbellek…) tek bir VERİ KÖKÜ altında
 * durur. Kod veri yolunu kendisi kurmaz (`path.join(__dirname, '..', 'data', …)` YOK — denetim testi
 * scripts/veri-yolu-selftest.js); her yer buradan sorar:
 *
 *   yollar.veri('live', 'hucum-demo')        → <kök>/live/hucum-demo            (ESKİ düzen)
 *                                             → <kök>/kisisel/live/hucum-demo    (YENİ düzen, tür alt klasörü)
 *   yollar.programVeri(kok, 'guncelleme.json') → başka bir program kopyasının (test, güncelleme deposu) verisi
 *   yollar.kok() · yollar.bilgi()             → veri kökü, düzen, nereden bulunduğu
 *
 * KÖK ÇÖZÜMÜ (sıra bağlayıcı):
 *   1. `PUSULA_VERI` ortam değişkeni (yalnız bu programın kendisi için; test kopyalarına sızmaz)
 *   2. program kökünde `veri-yeri.json` {"kok": "C:\\Pusula-Veri"} — `npm run veri-tasi` yazar; silinirse eskiye dönülür
 *   3. var olan `<program>/data` (ESKİ KURULUM — sunucu ve bu bilgisayar bugün böyle; davranış DEĞİŞMEZ)
 *   4. yeni kurulum varsayılanı `C:\Pusula-Veri` (K2) — 68.1: YALNIZ program kökünde kurulum işareti `PUSULA-KURULUM.json` varsa
 *      (F4 kurulum programı bırakır). İşaret yoksa (git çalışma kopyası, worktree, test kopyası, data/'sız klon) kök program içi
 *      `<program>/data` (ESKİ düzen, ilk yazımda oluşur) — hiçbir kopya sessizce C:\Pusula-Veri'ye yazmaz (2026-10-19: bir worktree
 *      testi orada yarım bir klasör bırakmıştı).
 *
 * DÜZEN: kökte `PUSULA-VERI.json` işareti varsa (ya da kök yok / boşsa) YENİ düzen: her parça türünün alt klasöründe
 * (`kisisel/`, `gizli/`, `arastirma/`, `onbellek/`, `makine/` — tür tablosu lib/veriTurleri.js). Yoksa ESKİ düzen: her şey
 * kökte, bugünkü `data/` ile birebir. Yol fonksiyonları ikisini de bilir; çağıran fark görmez.
 *
 * Program kökü dışındaki bir kopya için (`programVeri(kok)`), 1. ve 4. adım UYGULANMAZ: veri-yeri.json yoksa `<kok>/data`.
 * Böylece öz testlerin geçici kopyaları asla gerçek veri yerine yazmaz.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const turler = require('./veriTurleri');

const PROGRAM = path.resolve(__dirname, '..');
const VARSAYILAN_KOK = 'C:\\Pusula-Veri';
const ISARET = 'PUSULA-VERI.json';
const YER_DOSYASI = 'veri-yeri.json';
/** 68.1: gerçek (kurulum programıyla yapılmış) kurulumun işareti — yalnız bu varsa varsayılan kök C:\Pusula-Veri. */
const KURULUM_ISARETI = 'PUSULA-KURULUM.json';

const ayni = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function jsonOku(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return null; }
}

/** Bir kök dizinin düzeni: işaret varsa / yoksa ya da boşsa 'yeni', aksi 'eski'. */
function duzenBul(kok) {
  if (fs.existsSync(path.join(kok, ISARET))) return 'yeni';
  let icerik;
  try { icerik = fs.readdirSync(kok); } catch (e) { return 'yeni'; }
  // Yalnız tür klasörlerinden oluşan kök de yenidir (işaret silinmiş olsa bile).
  return icerik.every(a => turler.TURLER.some(t => turler.klasor(t) === a)) ? 'yeni' : 'eski';
}

/** Yeni düzende kök işaretini koy (bir kez; yazılamazsa sessiz — düzen yine tür klasörlerinden tanınır). */
const _isaretli = new Set();
function isaretKoy(c) {
  if (c.duzen !== 'yeni' || _isaretli.has(c.kok)) return;
  _isaretli.add(c.kok);
  try {
    const f = path.join(c.kok, ISARET);
    for (const t of turler.TURLER) fs.mkdirSync(path.join(c.kok, turler.klasor(t)), { recursive: true });   // kökteki dosyaların klasörü hep var
    if (!fs.existsSync(f)) {
      fs.writeFileSync(f, JSON.stringify({ pusulaVeri: 1, duzen: 'yeni', olusturma: new Date().toISOString(), not: 'Pusula veri klasörü. Alt klasörler: kisisel, gizli, arastirma, onbellek, makine.' }, null, 2));
    }
  } catch (e) { /* salt okunur ortam */ }
}

/**
 * Kök çözümü (saf değil: dosya sistemine bakar, hiçbir şey yazmaz).
 * @param {string} program  program kökü (varsayılan bu kopya)
 * @param {{ env?: object }} o
 * @returns {{ program, kok, duzen: 'eski'|'yeni', kaynak: 'ortam'|'veri-yeri.json'|'eski-data'|'varsayilan'|'kopya-data'|'program-data' }}
 */
function cozumle(program = PROGRAM, o = {}) {
  const env = o.env || process.env;
  const bu = ayni(program, PROGRAM);
  let kok = null, kaynak = null;
  if (bu && env.PUSULA_VERI) { kok = path.resolve(env.PUSULA_VERI); kaynak = 'ortam'; }
  if (!kok) {
    const y = jsonOku(path.join(program, YER_DOSYASI));
    if (y && typeof y.kok === 'string' && y.kok.trim()) { kok = path.resolve(program, y.kok.trim()); kaynak = YER_DOSYASI; }
  }
  if (!kok) {
    const eski = path.join(program, 'data');
    if (fs.existsSync(eski) || !bu) { kok = eski; kaynak = bu ? 'eski-data' : 'kopya-data'; }
  }
  if (!kok && fs.existsSync(path.join(program, KURULUM_ISARETI))) { kok = VARSAYILAN_KOK; kaynak = 'varsayilan'; }
  // 68.1: işaretsiz ve data/'sız (git çalışma kopyası, worktree, test) → program içi data/ (ESKİ düzen), C:\Pusula-Veri DEĞİL.
  if (!kok) { kok = path.join(program, 'data'); kaynak = 'program-data'; }
  // Kopya-data, eski-data ve program-data her zaman ESKİ düzendir (bugünkü data/ — işaret ancak taşımayla yeni köke yazılır).
  const duzen = (kaynak === 'eski-data' || kaynak === 'kopya-data' || kaynak === 'program-data') ? 'eski' : duzenBul(kok);
  return { program: path.resolve(program), kok, duzen, kaynak };
}

let _bu = null;
/** Bu programın çözümü (bir kez hesaplanır; süreç boyunca sabit — taşıma yalnız Pusula kapalıyken yapılır). */
function bilgi() { return _bu || (_bu = cozumle(PROGRAM)); }
/** Yalnız testler: önbelleği boşalt (ortam değişkeni / veri-yeri.json değiştikten sonra). */
function _sifirla() { _bu = null; }

/** Bir çözüme göre göreli parçaların mutlak yolu. İlk parça (ilk ayraca kadar) türü belirler. */
function yolKur(c, parcalar) {
  const p = parcalar.filter(x => x !== undefined && x !== null && x !== '').map(String);
  if (!p.length) return c.kok;
  if (c.duzen === 'eski') return path.join(c.kok, ...p);
  isaretKoy(c);
  const ilk = path.normalize(p[0]).split(/[\\/]/)[0];
  return path.join(c.kok, turler.klasor(turler.tur(ilk) || turler.BILINMEYEN_TUR), ...p);
}

/** Bu programın veri yolu: veri('live', 'x.json'). Parçasız çağrı veri kökünü verir (yalnız taşıma/tanılama için). */
function veri(...parcalar) { return yolKur(bilgi(), parcalar); }

/** Başka bir program kopyasının (kök `kok`) veri yolu. kok bu program ise veri() ile aynı. */
function programVeri(kok, ...parcalar) {
  if (!kok || ayni(kok, PROGRAM)) return veri(...parcalar);
  return yolKur(cozumle(kok), parcalar);
}

/**
 * Program köküne göreli bir yol yazısı (ortam değişkeni, betik sabiti: 'data/gomlek/spot-1d.db', 'kayitlar/x.json'):
 * 'data/…' ile başlıyorsa veri yerine (veri()), değilse program köküne çözülür; mutlak yol olduğu gibi döner.
 */
function goreli(yazi) {
  const y = String(yazi);
  if (path.isAbsolute(y)) return y;
  const p = path.normalize(y).split(/[\\/]/).filter(x => x && x !== '.');
  return p[0] === 'data' ? veri(...p.slice(1)) : path.join(PROGRAM, ...p);
}

/** Veri kökü (eski düzende data/ klasörü). */
function kok() { return bilgi().kok; }

/**
 * Bir program kopyasının veri kökündeki parça listesi — düzenden bağımsız: [{ ad, yol, tur }]. Yeni düzende tür alt
 * klasörlerinin İÇİ listelenir (klasörlerin kendisi parça değildir); işaret dosyası listelenmez.
 */
function parcalar(c = bilgi()) {
  const liste = [];
  const oku = (d) => { try { return fs.readdirSync(d); } catch (e) { return []; } };
  if (c.duzen === 'eski') {
    for (const ad of oku(c.kok)) liste.push({ ad, yol: path.join(c.kok, ad), tur: turler.tur(ad) });
  } else {
    for (const t of turler.TURLER) for (const ad of oku(path.join(c.kok, turler.klasor(t)))) liste.push({ ad, yol: path.join(c.kok, turler.klasor(t), ad), tur: turler.tur(ad), klasorTuru: t });
  }
  return liste;
}

/**
 * MÜHÜRLÜ KOD KÖPRÜSÜ: SHA ile dondurulmuş araştırma/gölge kodu (scripts/dikkat-ls.js, scripts/dikkat-ls-veri.js,
 * lib/research/pitVeri.js — lib/ileri/golge876.js KOD_SHA, scripts/dikkat-ls-veri.js HARIC_SHA) DEĞİŞTİRİLEMEZ; veri yolunu
 * kendisi kurar ama ortam değişkeniyle yol almayı bilir. YENİ düzende bu değişkenler (boşsa) veri yerine çevrilir; ESKİ
 * düzende hiçbir şey yapılmaz (davranış birebir aynı). Modül yüklenirken bir kez çalışır.
 */
const MUHURLU_ORTAM = { DLS_DB: ['market.db'], DLS_IRX: ['portfoy', 'yahoo', '_IRX.json'], DLS_TARAMA: ['tarama'], DLS_DIZIN: ['arastirma', 'dikkat-ls'], MARKET_DB: ['market.db'] };
function muhurluKoprusu(env = process.env, c = bilgi()) {
  if (c.duzen !== 'yeni') return [];
  const kurulan = [];
  for (const [ad, p] of Object.entries(MUHURLU_ORTAM)) if (!env[ad]) { env[ad] = yolKur(c, p); kurulan.push(ad); }
  // Betiklerin verdiği göreli 'data/…' değerleri (MARKET_DB=data/gomlek/spot-1d.db) mühürlü kod program köküne çözer → mutlak.
  for (const ad of [...Object.keys(MUHURLU_ORTAM), 'REJIM_DOSYA', 'EK_SERI']) {
    const v = env[ad];
    if (v && !path.isAbsolute(v) && path.normalize(v).split(/[\\/]/)[0] === 'data') { env[ad] = yolKur(c, path.normalize(v).split(/[\\/]/).slice(1)); kurulan.push(ad); }
  }
  return kurulan;
}
try { muhurluKoprusu(); } catch (e) { /* çözüm hatası: yol çağrıları ayrıca hata verir */ }

module.exports = { muhurluKoprusu, MUHURLU_ORTAM, veri, programVeri, goreli, kok, bilgi, cozumle, duzenBul, parcalar, yolKur, _sifirla, PROGRAM, VARSAYILAN_KOK, ISARET, YER_DOSYASI, KURULUM_ISARETI };
