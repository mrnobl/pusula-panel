/**
 * C1 (75.0, TASARIM-MAKINE-HESAP-BOT §3 parça 2) — server.js'ten taşındı, davranış AYNI.
 * AYAR DEPOSU: gizli anahtarlar (data/secrets.json — sır kasası, Y5 bozuk/kilitli ayrımı), etkin ayar okuma/yazma
 * (loadConfig / saveConfig / mergeConfig — 68.0 lib/ayarlar.js katmanı, 74.7 bot kaydı yansıması, 74.2 ayar geçmişi),
 * bot başına sağlık sırları (68.8), sürüm izi yardımcıları (commitOku, ayarIzi — 69.3).
 * `config` değişkeni server.js'te KALIR (`let config = loadConfig()`); fonksiyonlar buradan gelir. Sırlar dosyasının durumu
 * (SIRLAR_BOZUK, SIRLAR_KILITLI, SIR_GECIS, KASA_GECIS) dönen nesnenin okuyucularıyla okunur; SIRLAR_KILITLI yalnız Anahtarlar'ın
 * "eski dosyayı kenara al" işlemi için yazılabilir (lib/sunucu/kisiselUclar.js kasaSonrasi).
 *
 * Bağlanma: server.js `AYAR_DEPOSU = require('./lib/sunucu/ayarDeposu').olustur(ctx)` — eski yerinde (sır kasası geçişi
 * `hepsiniGecir` aynı anda koşar). ctx: lib/sunucu/baglam.js (config, BOT_KAYIT, ARASTIRMA_MODU, AYAR_GECMISI, ayarGecmisiLib
 * kullanım anında okunur — saveConfig onlar kurulduktan sonra çağrılır).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const ayarlarLib = require('../ayarlar');
const guvenlikKur = require('../guvenlik');
const kaliciDosya = require('../live/kaliciDosya');
const sirKasasi = require('../sirKasasi');

function olustur(ctx) {
  const { kok } = ctx;
  const CONFIG_PATH = path.join(kok, 'config.json');   // ESKİ kurulumun ayar dosyası — yalnız ayarlar.json yokken okunur (lib/ayarlar.js)
  /**
   * GİZLİ ANAHTARLAR `config.json`'DA DURMAZ.
   *
   * `config.json` sürüm kontrolüne girecek (strateji parametreleri, bot tanımları
   * ve ölçüm ayarları orada). API anahtarı aynı dosyada kalırsa ilk dolduruşta
   * geçmişe yazılır ve geçmişten temizlemesi zordur. Bu yüzden anahtarlar
   * `data/secrets.json`'a ayrıldı — `data/` zaten izlenmiyor.
   *
   * Bellekteki `config` nesnesi anahtarları taşımaya devam eder; ayrım yalnızca
   * DİSKTE. Böylece motorun ve borsa katmanının kodu değişmiyor.
   */
  const SECRETS_PATH = yollar.veri('secrets.json');
  // testnet* : Binance demo trading anahtarları (prod anahtarı demo'da çalışmaz).
  // healthchecks* : healthchecks.io ping URL'leri — URL'yi bilen herkes "bot çalıştı" diyebilir, sırdır.
  //   healthchecksUrl        HÜCUM botunun günlük çalışması (start / başarı / fail) — 68.8'e kadar iki bot bu adresi paylaşıyordu
  //   healthchecksSunucuUrl  isteğe bağlı: sunucu kalp atışı (günde bir; bot çalışmasa da)
  //   bindirme.<ad>.healthchecksUrl  68.8: Denge (ve sonraki botlar) KENDİ check'i; yoksa o bot ping göndermez (ortak adrese düşmez).
  //                          Bellekte config'te; DİSKTE yalnız secrets.json `bindirmeSaglik: { <ad>: url }` (ayarlar.json'a yazılmaz).
  const SECRET_KEYS = ['apiKey', 'apiSecret', 'testnetApiKey', 'testnetApiSecret', 'healthchecksUrl', 'healthchecksSunucuUrl'];
  const SAGLIK_URL_KEYS = ['healthchecksUrl', 'healthchecksSunucuUrl'];
  /** 68.8: secrets.json bindirmeSaglik → config.bindirme.<ad>.healthchecksUrl (Hücum'unki eski healthchecksUrl; burada atlanır). */
  function botSaglikSirlariniYukle(cfg, gizli) {
    const bs = gizli && gizli.bindirmeSaglik && typeof gizli.bindirmeSaglik === 'object' ? gizli.bindirmeSaglik : {};
    for (const [ad, url] of Object.entries(bs)) {
      if (ad === 'hucum' || typeof url !== 'string' || !url) continue;
      cfg.bindirme = { ...(cfg.bindirme || {}), [ad]: { ...((cfg.bindirme || {})[ad] || {}), healthchecksUrl: url } };
    }
  }
  /** 68.8: config'ten çıkan kopyada bindirme.<ad>.healthchecksUrl silinir (disariConfig, saveConfig); kopya döner. */
  function botSaglikCikar(cfg, topla) {
    if (!cfg || !cfg.bindirme || typeof cfg.bindirme !== 'object') return cfg;
    const bindirme = {};
    for (const [ad, v] of Object.entries(cfg.bindirme)) {
      if (v && typeof v === 'object' && 'healthchecksUrl' in v) {
        const { healthchecksUrl, ...kalan } = v;
        if (topla && healthchecksUrl) topla(ad, healthchecksUrl);
        bindirme[ad] = kalan;
      } else bindirme[ad] = v;
    }
    return { ...cfg, bindirme };
  }
    // (C1: lib/guvenlik.js modül başında yüklenir — server.js aynı sırayla yükler)

  /**
   * Y5 (61.8, DENETIM-CANLI-ALTYAPI): sırlar dosyası "yok" ile "var ama bozuk" AYRI. Bozuksa son iyi kopyadan (.yedek)
   * okunur; o da yoksa SIRLAR_BOZUK — yazma REDDEDİLİR (panelden ilk kayıt anahtarları kalıcı silmesin) ve açılışta alarm.
   * Yazım lib/live/kaliciDosya.js (tmp + fsync + rename + .yedek).
   */
    // (C1: lib/live/kaliciDosya.js modül başında)
  /**
   * 69.4 SIR KASASI (lib/sirKasasi.js): secrets.json Windows'ta DPAPI ile şifreli (69.6: CurrentUser; eski LocalMachine zarfı
   * açılışta geçirilir). Açılışta düz dosya şifreliye çevrilir ve doğrulanır (tutmazsa düz kalır). Şifre ÇÖZÜLEMEZSE SIRLAR_KILITLI:
   * sırlar boş sayılır ama dosyanın üstüne ASLA yazılmaz (anahtarlar silinmesin) + açılışta alarm.
   * 69.6: telefon-jeton.json, ev-baglanti.json, yedek-sifre.json da kasada (KASA_DOSYALARI) — açılışta hepsi geçirilir.
   */
    // (C1: lib/sirKasasi.js modül başında)
  let SIRLAR_BOZUK = null, SIRLAR_KILITLI = null, SIR_GECIS = null, KASA_GECIS = {};
  try { KASA_GECIS = sirKasasi.hepsiniGecir((ad) => yollar.veri(ad)); SIR_GECIS = KASA_GECIS['secrets.json'] || null; } catch (e) { SIR_GECIS = { yapildi: false, neden: e.message }; }
  function loadSecrets() {
    if (!fs.existsSync(SECRETS_PATH)) return {};
    for (const f of [SECRETS_PATH, `${SECRETS_PATH}.yedek`]) {
      try { const j = sirKasasi.oku(f); if (j && typeof j === 'object') { if (f !== SECRETS_PATH && !SIRLAR_BOZUK) SIRLAR_BOZUK = 'data/secrets.json bozuk — son iyi kopyadan (.yedek) okundu'; return j; } }
      catch (e) { if (e instanceof sirKasasi.SirKilitliHatasi) { SIRLAR_KILITLI = `${e.message} — dosyaya dokunulmadı; sunucuyu başka bir bilgisayara taşıdıysanız anahtarları panelden yeniden girmeden önce dosyayı yedekleyip silin`; return {}; } }
    }
    SIRLAR_BOZUK = 'data/secrets.json bozuk ve son iyi kopya yok — API anahtarları, Telegram jetonu ve sağlık adresleri OKUNAMADI; panelden yeniden girin (dosya önce yedeklendi)';
    try { fs.copyFileSync(SECRETS_PATH, `${SECRETS_PATH}.bozuk-${Date.now()}.bak`); } catch { /* */ }
    return {};
  }

  function saveSecrets(gizli) {
    if (SIRLAR_KILITLI) throw new Error(`sırlar yazılmadı: ${SIRLAR_KILITLI}`);
    if (SIRLAR_BOZUK && !Object.keys(gizli || {}).length) throw new Error(`sırlar yazılmadı: ${SIRLAR_BOZUK}`);
    sirKasasi.yaz(SECRETS_PATH, gizli, kaliciDosya.yaz);
  }

  // Load Configuration
  function loadConfig() {
    try {
      // Varsayılan ⊕ kullanıcı (BOM'u lib/ayarlar.js temizler). Eski kurulumda kullanıcı katmanı config.json'un kendisi.
      const bilgi = ayarlarLib.okuBilgi();
      const cfg = bilgi.ayar;
      loadConfig._kaynak = bilgi.kaynak;
      if (bilgi.bozuk && !loadConfig._yedekten) {
        loadConfig._yedekten = `ayarlar.json bozuktu (${String(bilgi.bozuk).slice(0, 80)}) — son iyi kopyadan (.yedek) açıldı; son ayar değişikliğiniz kaybolmuş olabilir`;
        console.error(`⚠️  ${loadConfig._yedekten}`);
      }
      const gizli = loadSecrets();
      for (const k of SECRET_KEYS) {
        if (gizli[k]) cfg[k] = gizli[k];
      }
      /**
       * TELEGRAM BOT TOKEN'I DA SIRDIR. Önceden config.json'da düz metin
       * duruyordu; açılışta bir kez secrets.json'a taşınır ve dosyadan silinir.
       */
      const tg = cfg.telegram || {};
      if (tg.botToken && !(gizli.telegram && gizli.telegram.botToken)) {
        gizli.telegram = { ...(gizli.telegram || {}), botToken: tg.botToken };
        saveSecrets(gizli);
        if (bilgi.kaynak === 'eski-config') {
          const dosyadaki = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^﻿/, ''));
          dosyadaki.telegram = { ...dosyadaki.telegram, botToken: '' };
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(dosyadaki, null, 2), 'utf8');
        } else {
          ayarlarLib.yaz({ ...cfg, telegram: { ...tg, botToken: '' } });
        }
        console.log('🔒 Telegram bot token ayar dosyasından secrets.json\'a taşındı.');
      }
      if (gizli.telegram && gizli.telegram.botToken) {
        cfg.telegram = { ...(cfg.telegram || {}), botToken: gizli.telegram.botToken };
      }
      // 68.8 bot başına sağlık sinyali: diskte secrets.json bindirmeSaglik → bellekte config.bindirme.<ad>.healthchecksUrl
      botSaglikSirlariniYukle(cfg, gizli);
      return cfg;
    } catch (e) {
      // Y5: yarım kalmış config.json sonsuz çökme döngüsü yapıyordu — son iyi kopyadan (.yedek) açılır, açılışta alarm.
      // Denetim 61.8 #7: YALNIZ ayrıştırma hatasında (SyntaxError) — başka hata (ör. sır taşırken EPERM) sağlam ayarı ezmesin.
      const yedek = `${CONFIG_PATH}.yedek`;
      if (e instanceof SyntaxError && !loadConfig._yedekten && fs.existsSync(yedek)) {
        try {
          JSON.parse(fs.readFileSync(yedek, 'utf8').replace(/^\uFEFF/, ''));
          try { fs.copyFileSync(CONFIG_PATH, `${CONFIG_PATH}.bozuk-${Date.now()}.bak`); } catch { /* */ }
          fs.copyFileSync(yedek, CONFIG_PATH);
          loadConfig._yedekten = `config.json bozuktu (${e.message.slice(0, 80)}) — son iyi kopyadan (.yedek) açıldı; son ayar değişikliğiniz kaybolmuş olabilir`;
          console.error(`⚠️  ${loadConfig._yedekten}`);
          return loadConfig();
        } catch (e2) { console.error('config.json.yedek de okunamadı:', e2.message); }
      }
      console.error('Error loading config.json:', e.message);
      process.exit(1);
    }
  }

  // Sections whose contents must be merged rather than replaced. A client that
  // posts only the strategies its form knows about — or only the two parameters
  // it edits — would otherwise wipe everything it did not send out of config.json.
  const MERGE_SECTIONS = ['strategies', 'risk', 'telegram', 'paperWallet'];

  const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  // Bunlar isim alanı değil, tek parça değerdir: gönderilen harita eskisinin
  // yerine geçer. Birleştirilseydi bir kümeyi silmek imkânsız olurdu — panelden
  // kaldırılan küme config.json'da sonsuza kadar kalırdı.
  // `presets` de aynı sebeple burada: panelden silinen bir gösterge ayarı derin
  // birleştirmede config.json'da sonsuza kadar kalırdı.
  const REPLACE_KEYS = new Set(['clusters', 'presets']);

  /** Recursive merge for plain objects; arrays and scalars are replaced outright. */
  function deepMerge(current, patch) {
    if (!isPlainObject(current) || !isPlainObject(patch)) return patch;

    const out = { ...current };
    for (const [key, value] of Object.entries(patch)) {
      out[key] = (!REPLACE_KEYS.has(key) && isPlainObject(value) && isPlainObject(current[key]))
        ? deepMerge(current[key], value)
        : value;
    }
    return out;
  }

  function mergeConfig(current, patch) {
    const next = { ...current, ...patch };

    for (const section of MERGE_SECTIONS) {
      const incoming = patch ? patch[section] : undefined;
      if (isPlainObject(incoming)) {
        next[section] = deepMerge(current[section] || {}, incoming);
      }
    }

    return next;
  }

  function saveConfig(cfg) {
    // 74.7 TEK KAYNAK (TASARIM-MAKINE-HESAP-BOT §2.5/§2.11): Kairos/Tao'nun config.bindirme.<ad> bölümü bot kaydından (live/botlar/<ad>.json)
    // TEK YÖNLÜ türetilen GERİ DÖNÜŞ YANSIMASIDIR — her kayıtta kayıttan yeniden kurulur (eski sürüme dönülürse botlar aynı ayarla çalışır).
    // Yansıma kurulamazsa ayar YAZILMAZ (güvenli taraf: eski sürümün okuyacağı config.bindirme kayıttan geri kalmasın).
    if (ctx.BOT_KAYIT && cfg) {
      try { ctx.BOT_KAYIT.yansit(cfg); } catch (e) { throw new Error(`ayar kaydedilmedi: bot kaydının geri dönüş yansıması kurulamadı (${e.message})`); }
    }
    // Anahtarlar diske ayrı yazılır; `config.json` her zaman boş alanla kaydedilir.
    const gizli = loadSecrets();
    let degisti = false;
    // 68.8: bot başına sağlık adresi ayarlar dosyasına GİRMEZ — secrets.json bindirmeSaglik'e (sır).
    const temiz = botSaglikCikar({ ...cfg }, (ad, url) => {
      if (ad === 'hucum') return;
      const bs = gizli.bindirmeSaglik && typeof gizli.bindirmeSaglik === 'object' ? gizli.bindirmeSaglik : {};
      if (bs[ad] !== url) { gizli.bindirmeSaglik = { ...bs, [ad]: url }; degisti = true; }
    });

    for (const k of SECRET_KEYS) {
      if (temiz[k]) {
        if (gizli[k] !== temiz[k]) { gizli[k] = temiz[k]; degisti = true; }
      }
      temiz[k] = '';
    }
    if (temiz.telegram && temiz.telegram.botToken) {
      if (!gizli.telegram || gizli.telegram.botToken !== temiz.telegram.botToken) {
        gizli.telegram = { ...(gizli.telegram || {}), botToken: temiz.telegram.botToken };
        degisti = true;
      }
    }
    if (temiz.telegram) temiz.telegram = { ...temiz.telegram, botToken: '' };
    const sirDegisen = [];   // 74.2 ayar geçmişi: yalnız "değişti" bilgisi (değer yok)
    if (degisti) {
      const onceki = loadSecrets();
      for (const k of SECRET_KEYS) if ((onceki[k] || '') !== (gizli[k] || '')) sirDegisen.push({ yol: k, eski: onceki[k] || '', yeni: gizli[k] || '' });
      if (((onceki.telegram || {}).botToken || '') !== ((gizli.telegram || {}).botToken || '')) sirDegisen.push({ yol: 'telegram.botToken', eski: (onceki.telegram || {}).botToken || '', yeni: (gizli.telegram || {}).botToken || '' });
      for (const ad of new Set([...Object.keys(onceki.bindirmeSaglik || {}), ...Object.keys(gizli.bindirmeSaglik || {})])) {
        if ((onceki.bindirmeSaglik || {})[ad] !== (gizli.bindirmeSaglik || {})[ad]) sirDegisen.push({ yol: `bindirme.${ad}.healthchecksUrl`, eski: (onceki.bindirmeSaglik || {})[ad] || '', yeni: (gizli.bindirmeSaglik || {})[ad] || '' });
      }
      saveSecrets(gizli);
    }

    // ARAŞTIRMA MODU (denetim A-02): bellekte kapatılan Telegram ASLA kalıcı yazılmaz — diskteki açık/kapalı korunur.
    let yazilacak = temiz;
    if (ctx.ARASTIRMA_MODU) {
      let diskteki = null;
      try { diskteki = ayarlarLib.oku(); } catch { /* okunamadı: alan değişmez */ }
      yazilacak = guvenlikKur.arastirmaKayitDuzelt(temiz, diskteki);
    }
    let diskOnceki = null;
    try { diskOnceki = ayarlarLib.oku(); } catch { diskOnceki = null; }
    ayarlarLib.yaz(yazilacak);   // 68.0: <veri>/ayarlar.json, yalnız varsayılandan farklar (Y5: atomik + fsync + .yedek)
    // 74.2 ayar geçmişi: diskteki etkin ayar (sırsız) → yazılan; sırlar yalnız "değişti" (lib/ayarGecmisi süzer). Kayıt hatası ayarı durdurmaz.
    try {
      // 74.7: Kairos/Tao yansıma satırları (bindirme.hucum|denge.*) config satırı olarak YAZILMAZ — aynı değişiklik bot kaydı satırı (tur 'bot') olarak yazılır.
      const yansimaMi = (f) => { const m = /^bindirme\.([a-z][a-z0-9]{1,15})\./.exec(String(f.yol)); return !!(m && ctx.BOT_KAYIT && ctx.BOT_KAYIT.etkinKayit(m[1])); };
      const farklar = [...(diskOnceki ? ctx.ayarGecmisiLib.farkBul(diskOnceki, JSON.parse(JSON.stringify(yazilacak))).filter(f => !yansimaMi(f)) : []), ...sirDegisen];
      if (farklar.length) ctx.AYAR_GECMISI.kaydet({ tur: 'config', farklar });
    } catch (e) { console.error('ayar geçmişi:', e.message); }
  }
  function commitOku(kok) {
    try {
      const head = fs.readFileSync(path.join(kok, '.git', 'HEAD'), 'utf8').trim();
      if (/^[0-9a-f]{40}$/.test(head)) return head.slice(0, 7);
      const ref = (/^ref: (.+)$/.exec(head) || [])[1];
      if (!ref) return null;
      try { return fs.readFileSync(path.join(kok, '.git', ref), 'utf8').trim().slice(0, 7); } catch { /* packed */ }
      const p = fs.readFileSync(path.join(kok, '.git', 'packed-refs'), 'utf8').split('\n').find(l => l.endsWith(` ${ref}`));
      return p ? p.slice(0, 7) : null;
    } catch { return null; }
  }
  function ayarIzi() {
    try {
      const gizli = /key|secret|token|sifre|parola|pin|jeton|url/i;
      const temiz = JSON.parse(JSON.stringify(ctx.config, (k, v) => (k && gizli.test(k) ? undefined : v)));
      return require('crypto').createHash('sha256').update(JSON.stringify(temiz)).digest('hex').slice(0, 12);
    } catch { return null; }
  }

  return {
    CONFIG_PATH, SECRETS_PATH, SECRET_KEYS, SAGLIK_URL_KEYS, botSaglikSirlariniYukle, botSaglikCikar,
    loadSecrets, saveSecrets, loadConfig, MERGE_SECTIONS, REPLACE_KEYS, isPlainObject, deepMerge, mergeConfig, saveConfig,
    commitOku, ayarIzi,
    get SIRLAR_BOZUK() { return SIRLAR_BOZUK; },
    get SIRLAR_KILITLI() { return SIRLAR_KILITLI; },
    set SIRLAR_KILITLI(v) { SIRLAR_KILITLI = v; },
    get SIR_GECIS() { return SIR_GECIS; },
    get KASA_GECIS() { return KASA_GECIS; },
  };
}

module.exports = { olustur };
