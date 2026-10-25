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
 * ÇİFT YAZIM (2 sürüm, eski sürüme dönüş güvenli): config.bindirme.<ad> yazılmaya devam eder; kayıt `configtenEsitle` ile
 *   (server.js saveConfig sonunda — mod, küçük sermaye, kâğıt sıfırlama btcAyak, /api/config, ayar geçmişi geri alma, Telegram:
 *   hepsi aynı noktadan) güncellenir. config.bindirme ile kayıt AYRIŞIRSA (config.json elle düzenlendi — G9 canliSermayeTavani —
 *   ya da eski sürüme dönülüp geri gelindi) CONFIG KAZANIR: kayıt config'ten yenilenir, WARN + ayar geçmişi. Böylece bu
 *   sürümde botların gördüğü ayar YAPI GEREĞİ eskiyle aynıdır.
 * Kayıt okunamazsa (bozuk + .yedek yok) bot ENGELLENMEZ: eski yol (config) kullanılır, ERROR yazılır — kayıt bu dönemde aynadır.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const kaliciDosya = require('./live/kaliciDosya');
const { GOC_SABLON } = require('./botSablonlari');

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

/** Saf: kayıt doğrulaması → hata metni | null. Sır taşıyan kayıt reddedilir. */
function dogrula(k, { stratejiler = null } = {}) {
  if (!nesneMi(k)) return 'kayıt nesne değil';
  if (k.surum !== SURUM) return `kayıt sürümü ${k.surum} (beklenen ${SURUM})`;
  if (!KIMLIK_RE.test(String(k.kimlik || ''))) return `kimlik geçersiz: ${k.kimlik} (küçük harf/rakam, 2–16, harfle başlar, tire yok)`;
  if (YASAK.has(k.kimlik)) return `kimlik kullanılamaz: ${k.kimlik}`;
  if (k.motor !== 'bindirme') return `motor desteklenmiyor: ${k.motor}`;
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
  const a = eski ? ayar(eski) : {}, b = yeni ? ayar(yeni) : {};
  const l = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!derinEsit(a[k], b[k])) l.push({ yol: k, eski: a[k], yeni: b[k] });   // undefined = yok (ayar geçmişi eskiYok/yeniYok)
  return l;
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

  /** Config'ten kayda eşitle (çift yazım). Değişiklik yoksa yazmaz. */
  function esitle(ad, ham, neden) {
    const eski = kayitlar[ad];
    if (!eski) return false;
    if (esitMi(eski, ham)) return false;
    const yeni = hamdanKayit(ad, ham, { simdi: simdi(), onceki: eski });
    if (!esitMi(yeni, ham)) { eskiYol(ad, 'eşitleme doğrulaması tutmadı'); return false; }
    try { yaz(yeni); } catch (e) { eskiYol(ad, e.message, 'ERROR'); return false; }
    if (neden) log('WARN', `[BOT KAYDI] ${ad}: ${neden}`);
    gecmisYaz(ad, farklar(eski, yeni), neden || 'çift yazım');
    return true;
  }

  /** saveConfig sonrası: her kayıtlı iç ad için config.bindirme → kayıt. */
  function configtenEsitle(config, adlar = GOC_ADLAR) {
    const l = [];
    for (const ad of adlar) { try { if (esitle(ad, hamAyar(config, ad), null)) l.push(ad); } catch (e) { log('WARN', `[BOT KAYDI] ${ad}: eşitlenemedi: ${e.message}`); } }
    return l;
  }

  /** bindirmeAyar için: kayıt varsa VE config'le eşitse kayıt, değilse null (çağıran eski yolu kullanır). */
  function esitKayit(ad, ham) {
    const k = kayitlar[ad];
    return k && esitMi(k, ham) ? k : null;
  }

  function durum() { return Object.fromEntries(Object.entries(durumlar).map(([k, v]) => [k, { ...v }])); }

  return { gocEt, configtenEsitle, esitKayit, durum, kayit: (ad) => kayitlar[ad] || null, kayitlar: () => ({ ...kayitlar }), dizin };
}

module.exports = { olustur, hamAyar, sirsiz, sirlar, ayar, hamdanKayit, dogrula, farklar, derinEsit, kararli, ozet,
  SURUM, KIMLIK_RE, GOC_ADLAR, YASAK, VARSAYILAN, SIR_ALANLARI, BILINEN, SECIMLI, MODLAR, META };
