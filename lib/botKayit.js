'use strict';
/**
 * BOT KAYDI (74.4, A1 + 2. faz parça 2a — PLAN-MAKINE-HESAP-BOT §2 a1/a2, TASARIM-MAKINE-HESAP-BOT §2.2–2.5)
 * ═══════════════════════════════════════════════════════════════════════════
 * Her bot için AYRI dosya: <veri>/live/botlar/<kimlik>.json (yollar.veri ile; `live` KİŞİSEL → yedekte ve taşıma paketinde).
 * Kayıtta SIR YOK: sağlık ping adresi secrets.json'da kalır (bindirmeSaglik / healthchecksUrl); borsa anahtarı Anahtarlar
 * ekranındaki hesaba KİMLİKLE bağlanır (hesap.demo = 'binance-demo', hesap.canli = 'binance-canli').
 * Canlı küme DIŞINDA (server tarafı): lib/live/* bu dosyayı require etmez.
 *
 * KAIROS / TAO GÖÇÜ (a2, birebir): açılışta `gocEt` — her iç ad (hucum, denge) için kayıt yoksa
 *   1. ham = hamAyar(config, ad)  (eski server.js bindirmeAyar'ın AYNISI: varsayılanlar ⊕ config.bindirme.<ad>)
 *   2. kayda çevrilir (strateji = ad, şablon kairos/tao, hesap kimlikleri, sermaye {kagit, demo, canli}, bilinmeyen alanlar `ek`)
 *   3. DOĞRULAMA: ayar(kayit) DERİN EŞİT sirsiz(ham) — değilse göç YAPILMAZ, eski yol kullanılır, WARN.
 *   4. goc.ozet = sha256(sirsiz(ham)) ilk 16.
 * 74.7 TEK KAYNAK (TASARIM §2.5 "3. sürümde çift yazım kaldırılır", §2.11): Kairos/Tao ayarının TEK kaynağı bu kayıttır. Yazan
 *   bütün uçlar (mod, küçük sermaye, kâğıt sıfırlama btcAyak, sermaye üst sınırı, /api/config bindirme yaması) `ayarYaz` ile KAYDA
 *   yazar; config.bindirme.<ad> artık elle yazılmaz, kayıttan TEK YÖNLÜ türetilen GERİ DÖNÜŞ YANSIMASIDIR (`yansit`, server.js
 *   saveConfig başında). Yansıma değişmezi: hamAyar(config, ad) sırsız ≡ ayar(kayit) — eski sürüm (74.3: config.bindirme tek yol;
 *   74.4–74.6: "ayrışırsa config kazanır") kayıtla AYNI ayarı okur, hiçbir şeyi ezmez. Yazım sırası: bellekteki kayıt → yansıma
 *   ayarlar.json'a (saveConfig) → kayıt dosyası; kayıt dosyası yazılamazsa bellek ve yansıma geri çevrilir. Arada kesilirse açılışta
 *   config (yeni değer) kazanır → son değişiklik kaybolmaz.
 *   AÇILIŞ (gocEt, değişmedi): config.bindirme ile kayıt AYRIŞIRSA (eski sürüme dönülüp orada ayar değişti, config.json/ayarlar.json
 *   elle düzenlendi — G9 canliSermayeTavani — ya da yazım yarıda kesildi) CONFIG KAZANIR: kayıt config'ten yenilenir, WARN + ayar
 *   geçmişi. Bu tek yönlü bir İÇE ALMADIR (yalnız açılışta), çift yazım değil.
 * Kayıt okunamazsa (bozuk + .yedek yok) bot ENGELLENMEZ: eski yol (config.bindirme tek kaynak, 74.3 yolu) kullanılır, ERROR yazılır.
 *
 * 74.5 (parça 2b — TASARIM §2.6, kararlar §10/§11): KULLANICININ OLUŞTURDUĞU BOTLAR (kimlik ∉ GOC_ADLAR). Tek kaynak KAYITTIR
 *   (config.bindirme'ye yazılmaz, çift yazım yok). `yeni` her zaman mod 'kagit' (a6), yalnız kurulabilir şablonlar (kairos / tao /
 *   kairos-s, a3), hesap bağlı değil ({ demo: null, canli: null }). Kimlik kuralları (`kimlikHatasi`): KIMLIK_RE, YASAK, bot adı
 *   tablosundaki kimlik/takma adlar (lib/botAdlari), kalkan/donchian önekleri, AYNI İLK 2 HARF (clientOrderId öneki `bd`+2 ve çoklu
 *   varlık etiketi `cv`+2 — §2.10; arşivdekiler dahil, hiçbir zaman iki bot aynı öneki taşımaz).
 *   ARŞİV: dosya SİLİNMEZ, kayıtta `arsiv: { zaman, neden }`; arşivli bot yüklenmez, `geriGetir` ile döner. Bot dizini
 *   (data/live/<kimlik>) olduğu gibi kalır. Kairos/Tao arşivlenemez ve bu yoldan güncellenmez (74.7: onların yolu `ayarYaz`).
 *
 * 74.6 (parça 2c — TASARIM §2.6 "Model şablonları"): MODEL ÖRNEKLERİ (şablon nova / lydia / simurg → motor 'model', model
 *   m-qqq-m10 / m-bist-m10 / m-837). Aynı dosya düzeni (live/botlar/<kimlik>.json), aynı kimlik/ad kuralları, aynı arşiv. Kayıtta:
 *   model, para (USD | TRY — Lydia TL), sermaye.kagit (kâğıt hesabın başlangıç sermayesi, modelin para biriminde), baslangic
 *   ('YYYY-MM-DD' | null = modelin ilk günü). Her zaman mod 'kagit', hesap { demo: null, canli: null } (demo/canlı bu sürümde YOK —
 *   doğrulama reddeder). Strateji / bindirme alanı YOK. `yukle` yalnız bindirme kimliklerini döndürür (server bindirme botu kurar);
 *   model kayıtları kayitlar()'da (motor 'model') durur. Kâğıt hesabın kendisi lib/tasarimci/ornekler.js + kagit.js'te.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const kaliciDosya = require('./live/kaliciDosya');
const botSablonlari = require('./botSablonlari');
const { GOC_SABLON } = botSablonlari;

const SURUM = 1;
const KIMLIK_RE = /^[a-z][a-z0-9]{1,15}$/;
/** Göç edilen iç adlar (Kairos, Tao). Yeni bot oluşturma 2b'de. */
const GOC_ADLAR = Object.freeze(['hucum', 'denge']);
/** Kimlik olamayacak adlar: diğer yürütücüler, dizin adları, bot adı tablosu takmaları (2b doğrulaması da kullanır). */
const YASAK = new Set(['kalkan', 'donchian', 'botlar', 'canli', 'demo', 'kagit', 'sistem', 'sunucu', 'arsiv']);
/** Eski server.js bindirmeAyar varsayılanları — DEĞİŞMEZ (sıra dahil). */
const VARSAYILAN = Object.freeze({ mod: 'kagit', sermayeTavani: 10000, kagitBakiye: 10000, k: 15, demoSermayeTavani: 1000, kucukSermaye: 'oto' });
/** Kayda girmeyen sır alanları (bellekte config.bindirme.<ad>'da durabilir; diskte secrets.json). */
const SIR_ALANLARI = Object.freeze(['healthchecksUrl']);
/** Kaydın kendi alanlarıyla taşınan ayar anahtarları; gerisi `ek`. */
const BILINEN = Object.freeze(['mod', 'sermayeTavani', 'kagitBakiye', 'k', 'demoSermayeTavani', 'canliSermayeTavani', 'kucukSermaye', 'btcAyak', 'tavanAkis']);
/** İsteğe bağlı alanlar: kayıtta null = ayarda YOK (varsayılan davranış). Açık null'lı config göç edilmez (doğrulama tutmaz). */
const SECIMLI = Object.freeze(['canliSermayeTavani', 'btcAyak', 'tavanAkis']);
const MODLAR = Object.freeze(['kagit', 'demo', 'canli']);
const META = Object.freeze(['olusturma', 'degisme', 'goc']);
/** 74.5: yeni bot sınırları (a5: sermaye sabit üst sınır, USD). */
const SERMAYE_EN_AZ = 100;
const SERMAYE_EN_COK = 1e7;
/** Kimlik olamayacak önekler (diğer yürütücülerin dizin adları — taşıma paketinde `live/<ad>` önek eşlemesi). */
const YASAK_ONEK = Object.freeze(['kalkan', 'donchian']);
/** 74.6: yeni kimlik olamayacak görünen/şablon adları (Kairos, Tao, Nova, Lydia, Simurg). Doğrulamada YOK (var olan kayıt etkilenmez). */
const AD_KIMLIK_YASAK = Object.freeze(['kairos', 'tao', 'nova', 'lydia', 'simurg']);
/** clientOrderId / çoklu varlık etiketi öneki: kimliğin ilk 2 harfi (bindirmeBot `bd${ad.slice(0,2)}`, `cv${…}`). */
const onek = (k) => String(k || '').slice(0, 2);
/** Ayar geçmişinde ve farklarda izlenen meta alanları (ayar dışı). */
const META_IZLE = Object.freeze(['adGorunen', 'hesap.demo', 'hesap.canli', 'arsiv', 'sablon']);
/** 74.6: motorlar ve model örneği alanları. */
const MOTORLAR = Object.freeze(['bindirme', 'model']);
const MODEL_PARA = Object.freeze({ 'm-qqq-m10': 'USD', 'm-bist-m10': 'TRY', 'm-837': 'USD' });
const GUN_RE = /^\d{4}-\d{2}-\d{2}$/;
const modelMi = (k) => !!k && k.motor === 'model';
/** 74.6: model örneği demo/canlı reddi (tek metin — server ve panel). */
const MODEL_ORNEK_RED = 'model örnekleri yalnız kâğıt hesaptır — bu sürümde borsa hesabı bağlanmaz, demo ya da gerçek para moduna geçilmez';

const nesneMi = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Eski bindirmeAyar(ad) — birebir: { ...VARSAYILAN, ...config.bindirme[ad] }. */
function hamAyar(config, ad) {
  return { ...VARSAYILAN, ...((((config && config.bindirme) || {})[ad]) || {}) };
}
/** Sır alanları çıkarılmış kopya. */
function sirsiz(ham) {
  const o = { ...(ham || {}) };
  for (const k of SIR_ALANLARI) delete o[k];
  return o;
}
/** Sır alanları (ayar(kayit)'a geri eklenecekler). */
function sirlar(ham) {
  const o = {};
  for (const k of SIR_ALANLARI) if (ham && has(ham, k)) o[k] = ham[k];
  return o;
}

/** Derin eşitlik (anahtar sırası önemsiz; undefined alan = yok). */
function derinEsit(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => derinEsit(x, b[i]));
  const ka = Object.keys(a).filter(k => a[k] !== undefined).sort(), kb = Object.keys(b).filter(k => b[k] !== undefined).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && derinEsit(a[k], b[k]));
}
/** Kararlı JSON (anahtarlar sıralı) — özet için. */
function kararli(x) {
  if (Array.isArray(x)) return `[${x.map(kararli).join(',')}]`;
  if (nesneMi(x)) return `{${Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${kararli(x[k])}`).join(',')}}`;
  return JSON.stringify(x === undefined ? null : x);
}
const ozet = (ham) => crypto.createHash('sha256').update(kararli(sirsiz(ham))).digest('hex').slice(0, 16);

/**
 * Saf: kayıt → bugünkü bindirmeAyar biçiminde nesne (sırsız). Mod parametresi biçimi değiştirmez (bindirmeAyar moddan bağımsızdı).
 */
function ayar(kayit) {
  const s = kayit.sermaye || {};
  const o = { mod: kayit.mod, sermayeTavani: s.kagit, kagitBakiye: kayit.kagitBakiye, k: kayit.k, demoSermayeTavani: s.demo, kucukSermaye: kayit.kucukSermaye };
  if (s.canli != null) o.canliSermayeTavani = s.canli;
  if (kayit.btcAyak != null) o.btcAyak = kayit.btcAyak;
  if (kayit.tavanAkis != null) o.tavanAkis = kayit.tavanAkis;
  if (nesneMi(kayit.ek)) for (const [k, v] of Object.entries(kayit.ek)) if (!BILINEN.includes(k) && !SIR_ALANLARI.includes(k)) o[k] = v;
  return o;
}

/**
 * Saf (74.7): GERİ DÖNÜŞ YANSIMASI — config.bindirme.<ad> bölümünün kayıttan türetilmiş hâli. Değişmez:
 *   sirsiz(hamAyar({ bindirme: { [ad]: sonuç } }, ad)) DERİN EŞİT ayar(kayit)
 * yani eski sürümün bindirmeAyar'ı (74.3) ve göç denetimi (74.4–74.6 esitMi) kayıtla aynı ayarı görür. EN AZ DEĞİŞİKLİK: bugünkü
 * bölümün yalnız farklı alanları değişir (eşitse aynı içerik döner; varsayılana eşit ve bölümde olmayan alan eklenmez); sır alanları
 * (healthchecksUrl — bellekte) olduğu gibi kalır. Kopya döner, girdi değişmez.
 */
function yansimaBolumu(mevcut, kayit) {
  const m = nesneMi(mevcut) ? { ...mevcut } : {};
  const hedef = ayar(kayit);
  const birlesik = { ...VARSAYILAN, ...m };
  for (const k of new Set([...Object.keys(m), ...Object.keys(hedef)])) {
    if (SIR_ALANLARI.includes(k)) continue;
    if (hedef[k] === undefined) { delete m[k]; continue; }
    if (!derinEsit(birlesik[k], hedef[k])) m[k] = JSON.parse(JSON.stringify(hedef[k]));
  }
  // Güvence: en az değişiklik yolu değişmezi sağlamıyorsa (beklenmez) bölüm kayıttan TAM yazılır.
  if (!derinEsit(sirsiz({ ...VARSAYILAN, ...m }), hedef)) return { ...sirlar(m), ...JSON.parse(JSON.stringify(hedef)) };
  return m;
}

/**
 * Saf: ham (bindirmeAyar biçimi) → kayıt. `onceki` verilirse kimlik dışı meta (hesap, adGorunen, makine, nobet, olusturma, goc) korunur.
 */
function hamdanKayit(ad, ham0, { simdi = Date.now(), onceki = null } = {}) {
  const ham = sirsiz(ham0);
  const ek = {};
  for (const [k, v] of Object.entries(ham)) if (!BILINEN.includes(k)) ek[k] = v;
  const zaman = new Date(simdi).toISOString();
  const p = onceki || {};
  return {
    surum: SURUM,
    kimlik: ad,
    sablon: p.sablon || GOC_SABLON[ad] || null,
    motor: 'bindirme',
    strateji: p.strateji || ad,
    adGorunen: p.adGorunen == null ? null : p.adGorunen,
    mod: ham.mod,
    hesap: nesneMi(p.hesap) ? { ...p.hesap } : { demo: 'binance-demo', canli: 'binance-canli' },
    sermaye: { kagit: ham.sermayeTavani, demo: ham.demoSermayeTavani, canli: has(ham, 'canliSermayeTavani') ? ham.canliSermayeTavani : null },
    kagitBakiye: ham.kagitBakiye,
    k: ham.k,
    kucukSermaye: ham.kucukSermaye,
    btcAyak: has(ham, 'btcAyak') ? ham.btcAyak : null,
    tavanAkis: has(ham, 'tavanAkis') ? ham.tavanAkis : null,
    ...(Object.keys(ek).length ? { ek } : {}),
    makine: p.makine == null ? null : p.makine,
    nobet: Number.isFinite(p.nobet) ? p.nobet : 0,
    olusturma: p.olusturma || zaman,
    degisme: zaman,
    goc: p.goc || { kaynak: 'config.bindirme', zaman, ozet: ozet(ham) }
  };
}

/** Saf (74.6): model örneği kaydının ayar görünümü (ayar geçmişi farkları için; bindirme ayarı DEĞİL). */
function modelAyar(kayit) {
  const s = kayit.sermaye || {};
  return { mod: kayit.mod, model: kayit.model, sermaye: s.kagit, para: kayit.para || null, baslangic: kayit.baslangic || null };
}

/** Saf: kayıt doğrulaması → hata metni | null. Sır taşıyan kayıt reddedilir. */
function dogrula(k, { stratejiler = null } = {}) {
  if (!nesneMi(k)) return 'kayıt nesne değil';
  if (k.surum !== SURUM) return `kayıt sürümü ${k.surum} (beklenen ${SURUM})`;
  if (!KIMLIK_RE.test(String(k.kimlik || ''))) return `kimlik geçersiz: ${k.kimlik} (küçük harf/rakam, 2–16, harfle başlar, tire yok)`;
  if (YASAK.has(k.kimlik)) return `kimlik kullanılamaz: ${k.kimlik}`;
  if (!MOTORLAR.includes(k.motor)) return `motor desteklenmiyor: ${k.motor}`;
  if (k.motor === 'model') {
    // 74.6: model örneği — yalnız kâğıt, borsa hesabı yok, kimlik Kairos/Tao olamaz
    if (GOC_ADLAR.includes(k.kimlik)) return `kimlik kullanılamaz: ${k.kimlik}`;
    if (!has(MODEL_PARA, k.model)) return `bilinmeyen model: ${k.model}`;
    if (k.mod !== 'kagit') return MODEL_ORNEK_RED;
    if (!nesneMi(k.hesap) || Object.values(k.hesap).some(v => v != null)) return MODEL_ORNEK_RED;
    if (!nesneMi(k.sermaye) || typeof k.sermaye.kagit !== 'number' || !(k.sermaye.kagit > 0)) return 'model örneği: kâğıt sermayesi yok';
    if (k.baslangic != null && !GUN_RE.test(String(k.baslangic))) return 'model örneği: başlangıç günü YYYY-AA-GG olmalı';
    if (k.strateji != null) return 'model örneğinde strateji alanı olmaz';
    const metin = JSON.stringify(k);
    if (/"(healthchecksUrl|apiKey|apiSecret|testnetApiKey|testnetApiSecret|secret|token)"\s*:/i.test(metin) || /hc-ping\.com/i.test(metin)) return 'kayıtta sır olamaz';
    return null;
  }
  if (stratejiler && !has(stratejiler, k.strateji)) return `bilinmeyen strateji: ${k.strateji}`;
  if (!MODLAR.includes(k.mod)) return `mod kagit | demo | canli olmalı ("${k.mod}")`;
  if (!nesneMi(k.sermaye)) return 'sermaye alanı yok';
  if (!nesneMi(k.hesap)) return 'hesap alanı yok';
  for (const v of Object.values(k.hesap)) if (v != null && !/^[a-z0-9-]{2,40}$/.test(String(v))) return 'hesap kimliği geçersiz';
  const metin = JSON.stringify(k);
  if (/"(healthchecksUrl|apiKey|apiSecret|testnetApiKey|testnetApiSecret|secret|token)"\s*:/i.test(metin) || /hc-ping\.com/i.test(metin)) return 'kayıtta sır olamaz';
  return null;
}

/** Saf: kayıttaki ayar farkları (ayar geçmişi için) — [{ yol, eski, yeni }]. */
function farklar(eski, yeni) {
  const gor = (k) => (modelMi(k) ? modelAyar(k) : ayar(k));   // 74.6: model örneğinde bindirme ayarı yok
  const a = eski ? gor(eski) : {}, b = yeni ? gor(yeni) : {};
  const l = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!derinEsit(a[k], b[k])) l.push({ yol: k, eski: a[k], yeni: b[k] });   // undefined = yok (ayar geçmişi eskiYok/yeniYok)
  // 74.5: meta (görünen ad, hesap bağı, arşiv, şablon) — Kairos/Tao ayar yazımında (ayarYaz / açılış içe alması) hamdanKayit bunları korur → fark çıkmaz.
  const al = (k, yol) => { if (!k) return undefined; const [x, y] = yol.split('.'); const v = y ? (nesneMi(k[x]) ? k[x][y] : undefined) : k[x]; return v == null ? undefined : v; };
  for (const yol of META_IZLE) { const e = al(eski, yol), n = al(yeni, yol); if (!derinEsit(e, n)) l.push({ yol, eski: e, yeni: n }); }
  return l;
}

/** Saf (74.5): yeni bot kimliği hatası | null. `mevcut` = bütün kayıt kimlikleri (arşivdekiler ve Kairos/Tao dahil). */
function kimlikHatasi(kimlik, mevcut = [], { takma = null } = {}) {
  const k = String(kimlik == null ? '' : kimlik);
  if (!KIMLIK_RE.test(k)) return 'Kimlik 2–16 karakter: küçük harf ve rakam, harfle başlar (tire, boşluk, Türkçe harf yok). Ör. "kairos2".';
  if (YASAK.has(k) || GOC_ADLAR.includes(k)) return `"${k}" kimliği kullanılamaz (ayrılmış ad).`;
  // 74.6: botların görünen adları / şablon adları kimlik olamaz (yalnız YENİ kayıtta — var olan kayıt doğrulamasına girmez)
  if (AD_KIMLIK_YASAK.includes(k)) return `"${k}" bir botun ya da şablonun adı — kimlik olarak kullanılamaz (ör. "${k}2").`;
  if (YASAK_ONEK.some(o => k.startsWith(o))) return `Kimlik "${YASAK_ONEK.join('" ya da "')}" ile başlayamaz (diğer yürütücülerin klasör adı).`;
  if (typeof takma === 'function' && takma(k)) return `"${k}" bir botun ad tablosunda kayıtlı (Kairos, Tao, Nova, Lydia, Simurg ya da takma adları) — başka bir kimlik seçin.`;
  if (mevcut.includes(k)) return `"${k}" kimliğiyle bir bot zaten var (arşivdekiler dahil).`;
  const ayni = mevcut.find(m => onek(m) === onek(k));
  if (ayni) return `Kimliğin ilk iki harfi ("${onek(k)}") "${ayni}" botuyla aynı — borsa emir kimliği öneki çakışır. İlk iki harfi farklı bir kimlik seçin.`;
  return null;
}

/** Saf (74.5): görünen ad hatası | null. `dolu` = kullanılan görünen adlar (küçük harfle karşılaştırılır). */
function adHatasi(ad, dolu = []) {
  const a = String(ad == null ? '' : ad).trim();
  if (a.length < 2 || a.length > 24) return 'Görünen ad 2–24 karakter olmalı.';
  if (/[\u0000-\u001f\u007f<>"`]/.test(a)) return 'Görünen adda denetim karakteri, < > " ` olamaz.';
  const n = (x) => String(x || '').trim().toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');   // "KAIROS" → "kaıros" → "kairos"
  if (dolu.map(n).includes(n(a))) return `"${a}" adı başka bir botta kullanılıyor — başka bir ad seçin.`;
  return null;
}

/** Saf (74.5): sermaye üst sınırı (USD) hatası | null. */
function sermayeHatasi(t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return 'Sermaye üst sınırı bir sayı olmalı (USD).';
  if (t < SERMAYE_EN_AZ || t > SERMAYE_EN_COK) return `Sermaye üst sınırı ${SERMAYE_EN_AZ} – ${SERMAYE_EN_COK.toLocaleString('tr-TR')} USD arasında olmalı.`;
  return null;
}

/**
 * Saf (74.5): şablondan YENİ kayıt (a3 + a6). Döndürür { kayit } | { hata }.
 * @param g { sablon, kimlik, adGorunen, sermaye: { kagit } | sayı, kucukSermaye ('oto' | 'acik' | 'kapali'; yalnız Kairos tipi) }
 */
function yeniKayit(g = {}, { simdi = Date.now(), mevcut = [], dolu = [], takma = null, stratejiler = null } = {}) {
  const sablonAd = String(g.sablon || '');
  const sb = botSablonlari.sablon(sablonAd);
  if (!sb) return { hata: `bilinmeyen şablon: ${sablonAd}` };
  if (!sb.kurulabilir || !MOTORLAR.includes(sb.motor)) return { hata: `"${sablonAd}" şablonu bu sürümde kurulamaz.` };
  const kh = kimlikHatasi(g.kimlik, mevcut, { takma });
  if (kh) return { hata: kh };
  const ad = String(g.adGorunen == null ? '' : g.adGorunen).trim();
  const ah = adHatasi(ad, dolu);
  if (ah) return { hata: ah };
  const tutar = g.sermaye && typeof g.sermaye === 'object' ? g.sermaye.kagit : g.sermaye;
  if (sb.motor === 'model') return yeniModelKayit(g, sb, sablonAd, ad, tutar, { simdi });
  const sh = sermayeHatasi(tutar);
  if (sh) return { hata: `Kâğıt sermayesi: ${sh}` };
  const KS = { oto: 'oto', acik: true, kapali: false };
  let kucuk = 'oto';
  if (g.kucukSermaye != null && g.kucukSermaye !== '') {
    if (sb.strateji !== 'hucum') return { hata: 'Küçük sermaye seçeneği yalnız Kairos tipinde.' };
    if (!has(KS, g.kucukSermaye)) return { hata: 'kucukSermaye: oto | acik | kapali' };
    kucuk = KS[g.kucukSermaye];
  }
  if (has(sb.sabit, 'kucukSermaye')) kucuk = sb.sabit.kucukSermaye;
  const zaman = new Date(simdi).toISOString();
  const t = Math.round(tutar * 100) / 100;
  const kayit = {
    surum: SURUM, kimlik: String(g.kimlik), sablon: sablonAd, motor: 'bindirme', strateji: sb.strateji, adGorunen: ad,
    mod: 'kagit',                                         // a6: her zaman kâğıtta başlar
    hesap: { demo: null, canli: null },                   // bağlama POST /api/botlar/:k/hesap (PIN)
    sermaye: { kagit: t, demo: VARSAYILAN.demoSermayeTavani, canli: null },
    kagitBakiye: t, k: VARSAYILAN.k, kucukSermaye: kucuk, btcAyak: null, tavanAkis: null,
    makine: null, nobet: 0, olusturma: zaman, degisme: zaman, kaynak: 'panel'
  };
  const h = dogrula(kayit, { stratejiler });
  return h ? { hata: h } : { kayit };
}

/**
 * Saf (74.6): model örneği kaydı (a3 + a6: yalnız kâğıt). Sermaye modelin para biriminde (Lydia TL). g.baslangic: 'model' (varsayılan —
 * modelin ilk günü, ana kâğıt hesapla aynı dönem) | 'yarin' (oluşturma gününün ertesi günü) | 'YYYY-AA-GG' (bugünden önce olamaz).
 */
function yeniModelKayit(g, sb, sablonAd, ad, tutar, { simdi }) {
  if (g.kucukSermaye != null && g.kucukSermaye !== '') return { hata: 'Küçük sermaye seçeneği yalnız Kairos tipinde.' };
  const para = MODEL_PARA[sb.model];
  const sh = sermayeHatasi(tutar);
  if (sh) return { hata: `Kâğıt sermayesi: ${para === 'TRY' ? sh.replace(/USD/g, 'TL') : sh}` };
  const bugun = new Date(simdi).toISOString().slice(0, 10);
  let baslangic = null;
  const b = g.baslangic == null || g.baslangic === '' ? 'model' : String(g.baslangic);
  if (b === 'yarin') baslangic = new Date(Date.parse(`${bugun}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
  else if (GUN_RE.test(b)) { if (b < bugun) return { hata: 'Başlangıç günü bugünden önce olamaz (geçmişten başlatmak için "modelin ilk günü" seçin).' }; baslangic = b; }
  else if (b !== 'model') return { hata: 'baslangic: model | yarin | YYYY-AA-GG' };
  const zaman = new Date(simdi).toISOString();
  const t = Math.round(tutar * 100) / 100;
  const kayit = {
    surum: SURUM, kimlik: String(g.kimlik), sablon: sablonAd, motor: 'model', model: sb.model, adGorunen: ad,
    mod: 'kagit', hesap: { demo: null, canli: null }, sermaye: { kagit: t, demo: null, canli: null }, para, baslangic,
    makine: null, nobet: 0, olusturma: zaman, degisme: zaman, kaynak: 'panel'
  };
  const h = dogrula(kayit);
  return h ? { hata: h } : { kayit };
}

/**
 * Depo. @param o.dizin <veri>/live/botlar · o.log(seviye, metin) · o.gecmis({ kimlik, farklar, neden }) (ayar geçmişi; hata yutulur)
 *        o.stratejiler (STRATEJILER — doğrulama) · o.simdi
 */
function olustur({ dizin, log = () => {}, gecmis = () => {}, stratejiler = null, simdi = Date.now } = {}) {
  if (!dizin) throw new Error('botKayit: dizin gerekli');
  const kayitlar = {};   // kimlik → kayıt (doğrulanmış)
  const durumlar = {};   // kimlik → { durum: 'kayit' | 'eski-yol', neden }
  const dosya = (k) => path.join(dizin, `${k}.json`);
  const gecmisYaz = (kimlik, f, neden) => { if (f && f.length) { try { gecmis({ kimlik, farklar: f, neden }); } catch { /* ayar geçmişi kaydı yazanı durdurmaz */ } } };

  function oku(k) {
    const r = kaliciDosya.oku(dosya(k), simdi);
    if (r.bozuk) log(r.veri ? 'WARN' : 'ERROR', `[BOT KAYDI] ${r.bozuk}`);
    return r;
  }
  function yaz(k) {
    const h = dogrula(k, { stratejiler });
    if (h) throw new Error(`bot kaydı yazılmadı (${k && k.kimlik}): ${h}`);
    fs.mkdirSync(dizin, { recursive: true });
    kaliciDosya.yaz(dosya(k.kimlik), k);
    kayitlar[k.kimlik] = k;
  }
  const eskiYol = (ad, neden, seviye = 'WARN') => {
    delete kayitlar[ad];
    durumlar[ad] = { durum: 'eski-yol', neden };
    log(seviye, `[BOT KAYDI] ${ad}: ${neden} — eski yol (config.bindirme) kullanılıyor`);
  };

  /** Kayıt config'le aynı ayarı veriyor mu (sırsız). */
  const esitMi = (k, ham) => derinEsit(ayar(k), sirsiz(ham));

  /**
   * Açılış göçü + eşitleme. @param config bellekteki config · @param adlar iç adlar (varsayılan GOC_ADLAR)
   * Döndürür { [ad]: durum }.
   */
  function gocEt(config, adlar = GOC_ADLAR) {
    for (const ad of adlar) {
      try {
        const ham = hamAyar(config, ad);
        const r = oku(ad);
        if (r.veri) {
          const h = dogrula(r.veri, { stratejiler });
          if (h) { eskiYol(ad, `kayıt geçersiz (${h})`, 'ERROR'); continue; }
          kayitlar[ad] = r.veri;
          durumlar[ad] = { durum: 'kayit', neden: null };
          if (!esitMi(r.veri, ham)) esitle(ad, ham, 'açılışta config.bindirme ile ayrışmış (elle düzenleme ya da eski sürüm) — config kazandı');
          continue;
        }
        if (r.bozuk) { eskiYol(ad, 'kayıt okunamadı', 'ERROR'); continue; }
        // Yeni göç
        const k = hamdanKayit(ad, ham, { simdi: simdi() });
        const h = dogrula(k, { stratejiler });
        if (h) { eskiYol(ad, `göç yapılmadı: ${h}`); continue; }
        if (!esitMi(k, ham)) { eskiYol(ad, `göç yapılmadı: doğrulama tutmadı (kayıttan üretilen ayar ≠ config.bindirme.${ad})`); continue; }
        yaz(k);
        durumlar[ad] = { durum: 'kayit', neden: null };
        log('INFO', `[BOT KAYDI] ${ad}: config.bindirme'den kayda göç edildi (live/botlar/${ad}.json, özet ${k.goc.ozet}); davranış aynı`);
        // 74.4: göç ayarı DEĞİŞTİRMEZ (kayıt = config.bindirme birebir) → ayar geçmişine satır yazılmaz; iz sistem günlüğünde (yukarıdaki INFO).
        // Boş kurulumda ayar-gecmisi klasörü oluşmasın: taşıma hedefi 'dolu' sayılmasın (tasima-e2e).
      } catch (e) { eskiYol(ad, `göç hatası: ${e.message}`, 'ERROR'); }
    }
    return durum();
  }

  /** Config'ten kayda eşitle — 74.7: YALNIZ açılış içe alması (gocEt; config eski sürümde/elle değişmiş). Değişiklik yoksa yazmaz. */
  function esitle(ad, ham, neden) {
    const eski = kayitlar[ad];
    if (!eski) return false;
    if (esitMi(eski, ham)) return false;
    const yeni = hamdanKayit(ad, ham, { simdi: simdi(), onceki: eski });
    if (!esitMi(yeni, ham)) { eskiYol(ad, 'eşitleme doğrulaması tutmadı'); return false; }
    try { yaz(yeni); } catch (e) { eskiYol(ad, e.message, 'ERROR'); return false; }
    if (neden) log('WARN', `[BOT KAYDI] ${ad}: ${neden}`);
    gecmisYaz(ad, farklar(eski, yeni), neden || 'açılış içe alma');
    return true;
  }

  /** Kayıt config'le eşitse kayıt, değilse null (74.4–74.6 bindirmeAyar yolu; 74.7'de yalnız testler ve tanı). */
  function esitKayit(ad, ham) {
    const k = kayitlar[ad];
    return k && esitMi(k, ham) ? k : null;
  }

  /**
   * 74.7 TEK KAYNAK: Kairos/Tao'nun ETKİN kaydı (açılışta göç/içe alma tuttu, durum 'kayit') | null (eski yol: config.bindirme tek
   * kaynak — kayıt bozuk/geçersiz ya da doğrulama tutmadı). server.js bindirmeAyar / bindirmeKur bunu okur (config'le karşılaştırmaz).
   */
  function etkinKayit(ad) {
    if (!GOC_ADLAR.includes(ad)) return null;
    return durumlar[ad] && durumlar[ad].durum === 'kayit' && kayitlar[ad] ? kayitlar[ad] : null;
  }

  /**
   * 74.7: yazmadan doğrular → { eski, yeni } (değişiklik yoksa yeni = null) | throw (Türkçe, kod 400/409).
   * @param yeniHam bindirmeAyar biçiminde TAM ayar (sır alanları atılır)
   */
  function ayarHazirla(ad, yeniHam) {
    if (!GOC_ADLAR.includes(ad)) throw hata('ayarYaz yalnız Kairos/Tao içindir (yeni botlar guncelle ile)', 409);
    const eski = etkinKayit(ad);
    if (!eski) throw hata(`${ad}: bot kaydı kullanılamıyor (eski yol)`, 409);
    const ham = sirsiz(yeniHam);
    if (esitMi(eski, ham)) return { eski, yeni: null };
    const yeni = hamdanKayit(ad, ham, { simdi: simdi(), onceki: eski });
    const h = dogrula(yeni, { stratejiler });
    if (h) throw hata(`bot kaydı yazılmadı: ${h}`, 400);
    if (!esitMi(yeni, ham)) throw hata('bot kaydı doğrulaması tutmadı (ayar kayda birebir çevrilemedi) — değişiklik yazılmadı', 400);
    return { eski, yeni };
  }

  /**
   * 74.7 TEK KAYNAK: Kairos/Tao ayarını KAYDA yazar. Sıra: bellekteki kayıt → o.once() (server: saveConfig — yansıma kayıttan türeyip
   * ayarlar.json'a) → kayıt dosyası. once hata verirse bellek geri döner; kayıt dosyası yazılamazsa bellek geri döner ve once yeniden
   * çağrılır (yansıma eski kayda döner). Döndürür yeni kayıt | null (değişiklik yok — hiçbir şey yazılmaz).
   */
  function ayarYaz(ad, yeniHam, neden, o = {}) {
    const { eski, yeni } = ayarHazirla(ad, yeniHam);
    if (!yeni) return null;
    kayitlar[ad] = yeni;
    try { if (typeof o.once === 'function') o.once(); } catch (e) { kayitlar[ad] = eski; throw e; }
    try { fs.mkdirSync(dizin, { recursive: true }); kaliciDosya.yaz(dosya(ad), yeni); } catch (e) {
      kayitlar[ad] = eski;
      try { if (typeof o.once === 'function') o.once(); } catch (e2) { log('ERROR', `[BOT KAYDI] ${ad}: yansıma geri çevrilemedi: ${e2.message}`); }
      throw hata(`bot kaydı yazılamadı (${e.message}) — değişiklik geri çevrildi`, 500);
    }
    gecmisYaz(ad, farklar(eski, yeni), neden || 'panel');
    return yeni;
  }

  /**
   * 74.7 GERİ DÖNÜŞ YANSIMASI (tek yönlü: kayıt → config). Etkin kaydı olan her iç ad için config.bindirme.<ad> = yansimaBolumu(…).
   * config nesnesini YERİNDE değiştirir (yalnız bindirme alanı). Döndürür değişen adlar. Etkin kaydı olmayan (eski yol) ada dokunmaz.
   */
  function yansit(config, adlar = GOC_ADLAR) {
    const l = [];
    if (!config || typeof config !== 'object') return l;
    for (const ad of adlar) {
      const k = etkinKayit(ad);
      if (!k) continue;
      const mevcut = ((config.bindirme && typeof config.bindirme === 'object') ? config.bindirme : {})[ad];
      const yeni = yansimaBolumu(mevcut, k);
      if (nesneMi(mevcut) ? derinEsit(yeni, mevcut) : !Object.keys(yeni).length) continue;   // boş bölüm yaratılmaz
      config.bindirme = { ...((config.bindirme && typeof config.bindirme === 'object') ? config.bindirme : {}), [ad]: yeni };
      l.push(ad);
    }
    return l;
  }

  function durum() { return Object.fromEntries(Object.entries(durumlar).map(([k, v]) => [k, { ...v }])); }

  /* ── 74.5: kullanıcının oluşturduğu botlar (kayıt TEK kaynak) ── */
  const arsivli = {};   // kimlik → arşivli kayıt (yüklenmez)
  const yeniMi = (k) => !GOC_ADLAR.includes(k);
  const hata = (m, kod) => Object.assign(new Error(m), { kod });
  /** Diskteki bütün kayıt kimlikleri (arşivliler, okunamayanlar ve Kairos/Tao dahil) — kimlik/önek benzersizliği için. */
  function tumKimlikler() {
    let l = [];
    try { l = fs.readdirSync(dizin).filter(f => /^[a-z][a-z0-9]{1,15}\.json$/.test(f)).map(f => f.slice(0, -5)); } catch { /* dizin yok */ }
    return [...new Set([...GOC_ADLAR, ...l, ...Object.keys(kayitlar), ...Object.keys(arsivli)])];
  }
  /** Açılış: Kairos/Tao dışındaki kayıtları yükler. Bozuk/geçersiz kayıt YÜKLENMEZ (ERROR; dosya olduğu gibi kalır). Döndürür etkin kimlikler. */
  function yukle() {
    const l = [];
    for (const k of tumKimlikler().filter(yeniMi)) {
      if (kayitlar[k]) { l.push(k); continue; }
      if (arsivli[k]) continue;
      let r;
      try { r = oku(k); } catch (e) { log('ERROR', `[BOT KAYDI] ${k}: okunamadı (${e.message}) — bot yüklenmedi`); continue; }
      if (!r.veri) { if (r.bozuk) durumlar[k] = { durum: 'okunamadi', neden: r.bozuk }; continue; }
      const h = dogrula(r.veri, { stratejiler }) || (r.veri.kimlik !== k ? 'dosya adı ≠ kimlik' : null);
      if (h) { durumlar[k] = { durum: 'gecersiz', neden: h }; log('ERROR', `[BOT KAYDI] ${k}: kayıt geçersiz (${h}) — bot yüklenmedi, dosya olduğu gibi duruyor`); continue; }
      if (r.veri.arsiv) { arsivli[k] = r.veri; durumlar[k] = { durum: 'arsiv', neden: null }; continue; }
      kayitlar[k] = r.veri;
      durumlar[k] = { durum: 'kayit', neden: null };
      if (!modelMi(r.veri)) l.push(k);   // 74.6: model örneği bindirme botu değil — çağıran (server botEkle) onu kurmaz
    }
    return l;
  }
  /** Yeni bot (a6: kâğıt). @param o { dolu (görünen adlar), takma (kimlik → bot adı tablosunda mı) } → kayıt; hata → throw (Türkçe, kod 400/409). */
  function yeni(g, o = {}) {
    const r = yeniKayit(g, { simdi: simdi(), mevcut: tumKimlikler(), dolu: o.dolu || [], takma: o.takma || null, stratejiler });
    if (r.hata) throw hata(r.hata, 400);
    if (fs.existsSync(dosya(r.kayit.kimlik))) throw hata(`"${r.kayit.kimlik}" kimliğiyle bir kayıt dosyası zaten var`, 409);
    yaz(r.kayit);
    durumlar[r.kayit.kimlik] = { durum: 'kayit', neden: null };
    log('INFO', `[BOT KAYDI] yeni ${modelMi(r.kayit) ? 'model örneği' : 'bot'}: ${r.kayit.kimlik} ("${r.kayit.adGorunen}", şablon ${r.kayit.sablon}, kâğıt sermayesi ${r.kayit.sermaye.kagit} ${r.kayit.para || 'USD'}) — kâğıtta başladı`);
    gecmisYaz(r.kayit.kimlik, farklar(null, r.kayit), 'yeni bot');
    return r.kayit;
  }
  /** Yeni botun kaydını değiştirir (Kairos/Tao DEĞİL). degistir(kopya) kopyayı değiştirir. Döndürür yeni kayıt. */
  function guncelle(k, degistir, neden) {
    if (!yeniMi(k)) throw hata('Kairos/Tao kaydı bu yoldan değişmez (ayarYaz)', 409);
    const eski = kayitlar[k] || arsivli[k];
    if (!eski) throw hata(`bilinmeyen bot: ${k}`, 404);
    const kopya = JSON.parse(JSON.stringify(eski));
    degistir(kopya);
    // 74.6: motor ve tanım alanı (bindirme: strateji · model: model) değişmez
    Object.assign(kopya, { kimlik: k, surum: SURUM, motor: eski.motor, ...(modelMi(eski) ? { model: eski.model } : { strateji: eski.strateji }), olusturma: eski.olusturma, degisme: new Date(simdi()).toISOString() });
    yaz(kopya);   // doğrular, dosyaya yazar, kayitlar[k] = kopya
    if (kopya.arsiv) { delete kayitlar[k]; arsivli[k] = kopya; durumlar[k] = { durum: 'arsiv', neden: null }; }
    else { delete arsivli[k]; durumlar[k] = { durum: 'kayit', neden: null }; }
    gecmisYaz(k, farklar(eski, kopya), neden || 'panel');
    return kopya;
  }
  /** Arşivle: dosya SİLİNMEZ (kayıtta arsiv). Çağıran ayrıca botun durmuş olduğunu denetler. */
  function arsivle(k, neden = 'panel') {
    if (!yeniMi(k)) throw hata('Kairos ve Tao arşivlenemez', 409);
    const x = kayitlar[k];
    if (!x) throw hata(arsivli[k] ? 'bot zaten arşivde' : `bilinmeyen bot: ${k}`, arsivli[k] ? 409 : 404);
    if (x.mod !== 'kagit') throw hata('yalnız kâğıt moddaki bot arşivlenir — önce kâğıda dönün', 409);
    return guncelle(k, (c) => { c.arsiv = { zaman: new Date(simdi()).toISOString(), neden: String(neden).slice(0, 80) }; }, 'arşivlendi');
  }
  /** Arşivden geri getir (kâğıtta). Kimlik/önek zaten ayrılmış (arşivdekiler benzersizlikte sayılır). */
  function geriGetir(k) {
    if (!arsivli[k]) throw hata(kayitlar[k] ? 'bot arşivde değil' : `arşivde böyle bir bot yok: ${k}`, kayitlar[k] ? 409 : 404);
    return guncelle(k, (c) => { delete c.arsiv; c.mod = 'kagit'; }, 'arşivden geri getirildi');
  }

  /** 74.6: etkin model örnekleri (kimlik → kayıt). */
  const modelKayitlari = () => Object.fromEntries(Object.entries(kayitlar).filter(([, x]) => modelMi(x)));
  return { gocEt, esitKayit, etkinKayit, ayarHazirla, ayarYaz, yansit, durum, kayit: (ad) => kayitlar[ad] || null, kayitlar: () => ({ ...kayitlar }), dizin, modelKayitlari,
    yukle, yeni, guncelle, arsivle, geriGetir, tumKimlikler, yeniMi, arsivliler: () => ({ ...arsivli }), arsivKayit: (k) => arsivli[k] || null };
}

module.exports = { olustur, hamAyar, sirsiz, sirlar, ayar, yansimaBolumu, hamdanKayit, dogrula, farklar, derinEsit, kararli, ozet,
  kimlikHatasi, adHatasi, sermayeHatasi, yeniKayit, onek, modelMi, modelAyar, MOTORLAR, MODEL_PARA, MODEL_ORNEK_RED,
  SURUM, KIMLIK_RE, GOC_ADLAR, YASAK, YASAK_ONEK, VARSAYILAN, SIR_ALANLARI, BILINEN, SECIMLI, MODLAR, META, META_IZLE, SERMAYE_EN_AZ, SERMAYE_EN_COK };
