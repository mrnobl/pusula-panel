const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const yollar = require('./lib/yollar');
const fs = require('fs');

const db = require('./lib/database');
// Günlükler (lib/gunluk.js): açılıştan itibaren her db.addLog satırı kalıcı ve tek biçimli kayda da düşer. Uçlar aşağıda.
const GUNLUK = require('./lib/gunluk').olustur();
db.gunlukBagla(GUNLUK);
const TradingEngine = require('./lib/engine');
const { computeDrawdownStats } = require('./lib/drawdownStats');
const { runScan: runStrategyScan } = require('./lib/strategyScanner');
const strategyCatalog = require('./lib/strategies/catalog');
const pineStore = require('./lib/pine/store');
const { inspect: pineInspect } = require('./lib/pine/inspect');
const venues = require('./lib/venues');

const Backtester = require('./lib/backtester');
const { ADAYLAR } = require('./lib/research/adaylar');
const donchianPortfoy = require('./lib/research/donchianPortfoy');
const kitapOlcum = require('./lib/research/kitapOlcum');

const CONFIG_PATH = path.join(__dirname, 'config.json');   // ESKİ kurulumun ayar dosyası — yalnız ayarlar.json yokken okunur (lib/ayarlar.js)
/**
 * 68.0 AYARLAR (lib/ayarlar.js, PLAN-TASIMA F1): etkin ayar = config.varsayilan.json (depoda, kişisel değer yok) ⊕
 * <veri>/ayarlar.json (yalnız farklar). ayarlar.json yoksa eski config.json kullanıcı katmanıdır — var olan kurulumda
 * davranış AYNI; ayarlar.json ilk kayıtta oluşur, o andan sonra config.json okunmaz.
 */
const ayarlarLib = require('./lib/ayarlar');
// D5 (62.1): mum deposu node:sqlite ister (Node ≥ 22.13). Eski Node'da anlaşılmaz bir hatayla çökme döngüsü yerine açık mesaj.
{
  const [ana, ara] = process.versions.node.split('.').map(Number);
  if (ana < 22 || (ana === 22 && ara < 13)) {
    console.error(`⛔ Node.js ${process.versions.node} çok eski — Pusula Node 22.13 ya da üstünü ister (https://nodejs.org, LTS). Kurup Pusula'yı yeniden başlatın.`);
    process.exit(2);
  }
}
// Strateji listesi tek kaynaktan: `lib/strategies/catalog.js`. Elle tutulan
// liste `regime_trend`'i içermiyordu — motorda ve backtester'da tanımlı olan
// strateji `/api/bots/run` tarafından "bilinmeyen" sayılıyor, yani hiç
// çalıştırılamıyordu.
const KNOWN_STRATEGIES = strategyCatalog.keys();
const KNOWN_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

// Bumped whenever public/app.js changes. The client reports the version it was
// built with; a mismatch means the browser is running cached UI code against a
// newer server, which silently reintroduces already-fixed bugs. Keep in sync
// with APP_VERSION in public/app.js.
const APP_VERSION = '73.6';

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
const guvenlikKur = require('./lib/guvenlik');

/**
 * Y5 (61.8, DENETIM-CANLI-ALTYAPI): sırlar dosyası "yok" ile "var ama bozuk" AYRI. Bozuksa son iyi kopyadan (.yedek)
 * okunur; o da yoksa SIRLAR_BOZUK — yazma REDDEDİLİR (panelden ilk kayıt anahtarları kalıcı silmesin) ve açılışta alarm.
 * Yazım lib/live/kaliciDosya.js (tmp + fsync + rename + .yedek).
 */
const kaliciDosya = require('./lib/live/kaliciDosya');
/**
 * 69.4 SIR KASASI (lib/sirKasasi.js): secrets.json Windows'ta DPAPI ile şifreli (69.6: CurrentUser; eski LocalMachine zarfı
 * açılışta geçirilir). Açılışta düz dosya şifreliye çevrilir ve doğrulanır (tutmazsa düz kalır). Şifre ÇÖZÜLEMEZSE SIRLAR_KILITLI:
 * sırlar boş sayılır ama dosyanın üstüne ASLA yazılmaz (anahtarlar silinmesin) + açılışta alarm.
 * 69.6: telefon-jeton.json, ev-baglanti.json, yedek-sifre.json da kasada (KASA_DOSYALARI) — açılışta hepsi geçirilir.
 */
const sirKasasi = require('./lib/sirKasasi');
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
  if (degisti) saveSecrets(gizli);

  // ARAŞTIRMA MODU (denetim A-02): bellekte kapatılan Telegram ASLA kalıcı yazılmaz — diskteki açık/kapalı korunur.
  let yazilacak = temiz;
  if (ARASTIRMA_MODU) {
    let diskteki = null;
    try { diskteki = ayarlarLib.oku(); } catch { /* okunamadı: alan değişmez */ }
    yazilacak = guvenlikKur.arastirmaKayitDuzelt(temiz, diskteki);
  }
  ayarlarLib.yaz(yazilacak);   // 68.0: <veri>/ayarlar.json, yalnız varsayılandan farklar (Y5: atomik + fsync + .yedek)
}

let config = loadConfig();
/**
 * ARAŞTIRMA MODU (`ARASTIRMA_MODU=1`): bot BAŞKA makinede çalışırken bu makinede paneli yalnız
 * araştırma/simülasyon için açmak (2026-10-07). Telegram yoklama ve gönderimi KAPALI (aynı bot jetonunu iki
 * sunucu dinlerse çakışır, komutlara çift cevap gider), hiçbir bot açılışta başlamaz, bot/borsa/emir uçlarına
 * POST reddedilir. Okuma uçları, backtest ve portföy laboratuvarı çalışır.
 */
const ARASTIRMA_MODU = process.env.ARASTIRMA_MODU === '1';
/**
 * 69.3 SÜRÜM İZİ (Knight 2012 dersi: "o an hangi kod çalışıyordu?"): açılıştaki git commit'i + etkin ayarların parmak izi
 * (sırlar hariç, sha256 ilk 12). /api/health, günlük satırları (v), kara kutu ve öz denetim gösterir.
 */
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
const COMMIT = commitOku(__dirname);
GUNLUK.surumAyarla(`${APP_VERSION}${COMMIT ? `@${COMMIT}` : ''}`);
function ayarIzi() {
  try {
    const gizli = /key|secret|token|sifre|parola|pin|jeton|url/i;
    const temiz = JSON.parse(JSON.stringify(config, (k, v) => (k && gizli.test(k) ? undefined : v)));
    return require('crypto').createHash('sha256').update(JSON.stringify(temiz)).digest('hex').slice(0, 12);
  } catch { return null; }
}
if (ARASTIRMA_MODU && config.telegram) config.telegram = { ...config.telegram, enabled: false };
const app = express();
const server = http.createServer(app);

/**
 * GÜVENLİK (lib/guvenlik.js) — canlı moda geçmenin ön koşulu.
 * Varsayılan yalnız 127.0.0.1; başka adrese açılırsa panel jetonu zorunlu.
 * Host/Origin denetimi tarayıcı üzerinden gelen istekleri (CSRF, DNS
 * rebinding) keser. Statik dosyalar dahil HER istek denetlenir.
 *
 * TELEFON KADEMESİ (60.5, PLAN-UYGULAMA-YOL-HARITASI.md §0 K2): bu bilgisayardan gelmeyen her istek (Tailscale
 * serve, telefon köprüsü, ağa açık dinleme) yalnız izler + acil durdurur; acil uçları ACİL PIN + "DURDUR" ister
 * (lib/acilPin.js, aşağıda express.json'dan sonra). Yerel dinlemede telefon kademesinin jetonu data/ dosyalarından
 * okunur (guvenlik.jetonOkuyucu: PANEL_TOKEN → secrets.json panelToken → telefon-jeton.json; `npm run telefon-jeton`).
 */
const HOST = process.env.HOST || '127.0.0.1';
const guvenlik = guvenlikKur.kur({
  dinlenen: HOST,
  jeton: guvenlikKur.geriDonusMu(HOST) ? '' : (process.env.PANEL_TOKEN || loadSecrets().panelToken || ''),
  jetonOku: guvenlikKur.jetonOkuyucu(__dirname),
  izinliHostlar: (process.env.PANEL_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean),
  // 64.8 geliştirme yazma kademesi: sunucuda `npm run gelistirme-jeton` (data/gelistirme-jeton.json yalnız SHA-256 özet). Araştırma
  // modundaki makine (geliştirme bilgisayarı) bu jetonu hiç kabul etmez — iletilen yazmayı yalnız sunucu alır.
  gelistirmeOzetOku: ARASTIRMA_MODU ? null : guvenlikKur.gelistirmeOzetOkuyucu(__dirname),
  gelistirmeKapali: ARASTIRMA_MODU
});
const acilPin = require('./lib/acilPin').olustur({
  // Kilit uyarısı Telegram'a (portfoyBildirici aşağıda tanımlanır; çağrı anında hazırdır).
  uyari: (metin) => portfoyBildirici.gonder('alarm', 'PIN kilitlendi (yanlış denemeler)', [metin], { anahtar: 'acil-pin-kilit' })
});
const wss = new WebSocket.Server({ server, verifyClient: guvenlik.wsDogrula });

/** Panele ve WebSocket'e giden config: sırlar çıkarılmış. */
const disariConfig = () => {
  const d = guvenlikKur.disariVer(botSaglikCikar(config), SECRET_KEYS);
  const tg = config.telegram || {};
  d.sirlar.telegramBotToken = !!tg.botToken;
  // 68.8: bot başına sağlık sinyali — yalnız "kayıtlı mı" (Hücum = eski healthchecksUrl).
  const { botUrl } = require('./lib/saglikSinyali');
  d.sirlar.botSaglik = Object.fromEntries([...new Set(['hucum', 'denge', ...Object.keys(config.bindirme || {})])].map(ad => [ad, !!botUrl(config, ad)]));
  // Karar Ö18 / denetim A-04: chat id gizli bilgi sayılmaz (config.json'da durur) ama panelde MASKELİ ("12••••89").
  d.sirlar.telegramChatId = !!tg.chatId;
  if (d.telegram) d.telegram = { ...d.telegram, botToken: '', chatId: guvenlikKur.chatIdMaskele(tg.chatId) };
  return d;
};

app.use(guvenlik.middleware);
// Araştırma modunda botu başlatan, borsaya bağlanan ya da emir veren POST'lar kapalı (yukarıdaki ARASTIRMA_MODU).
// (paper motoru start/stop/bots, borsa, kalkan, bindirme, pozisyon kapatma, hesap senkronu, Telegram ve healthchecks testleri)
// 61.3: otomatik güncelleme ve yeniden başlatma da kapalı (geliştirme bilgisayarı güncellemelerin KAYNAĞI, hedefi değil).
const ARASTIRMA_KAPALI = /^\/api\/(exchange|kalkan|bindirme|bots|start|stop|position|hesap-islemleri|telegram|saglik|guncelleme|sistem)(\/|$)/;
// Denetim 61.1 O3: Express yönlendirmesi harf duyarsız ve sondaki eğik çizgiyi yok sayar — desen normalleşmiş yola uygulanır.
app.use((req, res, next) => {
  if (ARASTIRMA_MODU && req.method !== 'GET' && ARASTIRMA_KAPALI.test(guvenlikKur.yasakYolu(req.path))) {
    return res.status(403).json({ success: false, error: 'Araştırma modu: bu makinede bot/borsa/emir işlemleri kapalı (bot başka makinede çalışıyor).' });
  }
  next();
});
/*
 * 69.6 YEREL PIN (lib/yerelPin.js, güvenlik testi K1/YÜKSEK-1): masaüstü panelde de tehlikeli işlemler (taşıma paketi, anahtarlar,
 * engel / güvenli kip kaldırma, canlı kilit, mod, güncelleme onayı, sıfırlama, yeniden başlatma) acil PIN'i ister; doğru PIN 10 dk
 * oturum. Risk azaltan işlemler (acil, durdur) PIN istemez. Araştırma modunda kapalı; PUSULA_YEREL_PIN=0 yalnız uçtan uca testler için.
 */
const yerelPin = require('./lib/yerelPin').olustur({
  acilPin, kok: __dirname, etkin: !ARASTIRMA_MODU && process.env.PUSULA_YEREL_PIN !== '0', log: (lv, msg) => db.addLog(lv, msg)
});
app.use(yerelPin.middleware);
// 61.7: araştırma modunda bot/işlem okuma uçları sunucudaki panelden (Tailscale, salt okuma) — lib/evOkuma.js.
const EV_BAGLANTI_ETKIN = ARASTIRMA_MODU && process.env.EV_OKUMA !== '0';   // EV_OKUMA=0: kılavuz görüntüleri (scripts/kilavuz-ekran.js)
const evYazmaLib = require('./lib/evYazma');
/**
 * 64.8 EVDEN YAZMA + KUYRUK (lib/evYazma.js): geliştirme bilgisayarında İşlem defterim ve Portföyüm yazmaları sunucudaki panele iletilir;
 * sunucu kapalıysa data/ev-kuyruk.jsonl'de sırayla bekler (60 sn'de bir + her yazmadan sonra + "Şimdi gönder"). Sunucuda etkisiz.
 */
const evYazma = evYazmaLib.gelistirme({
  kok: __dirname, etkin: EV_BAGLANTI_ETKIN, log: (lv, msg) => db.addLog(lv, msg),
  yerelOnizle: (yol, govde) => islemDefteri.yerelOnizle(govde),
  sonuc: evYazmaSonucu
});
/**
 * Kuyruktan (ya da doğrudan) giden yazmanın sonucu: Portföyüm taşıma bayrağı; F7 (denetim): OKX imleci — sunucuda bir OKX dosyası geri
 * alındıysa (okxTamTarama) ya da bu bilgisayarın OKX satırları sunucuda reddedildi / kuyruktan çıkarıldıysa bu bilgisayarın imleci de
 * "3 ayı baştan tara" işaretlenir (yoksa o satırlar bir daha gönderilmezdi).
 */
function evYazmaSonucu(kayit, tur, govde) {
  if (kayit.etiket === 'portfoyum-tasima' && tur !== 'cikar') {
    portfoyumTasimaBayragi(tur === 'tamam' ? { durum: 'tamam', zaman: new Date().toISOString(), eklenen: govde && govde.eklenenSayi } : { durum: 'hata', zaman: new Date().toISOString(), hata: kayit.sonHata || (govde && govde.error) || null });
  }
  if (kayit.etiket === 'portfoyum-tasima' && tur === 'cikar') { const b = portfoyumTasimaBayragi(); if (b && b.durum !== 'tamam') portfoyumTasimaBayragi({ durum: 'hata', zaman: new Date().toISOString(), hata: 'kuyruktan çıkarıldı' }); }
  const yol = String(kayit.yol || '');
  if (/^\/api\/islem-defteri\/yukleme\/[^/]+\/geri-al$/.test(yol) && tur === 'tamam' && govde && govde.okxTamTarama && govde.hesap) islemDefteri.okxTamTaramaIsaretle(govde.hesap);
  if (yol === '/api/islem-defteri/okx/kayitlar' && (tur === 'red' || tur === 'cikar') && kayit.hesap) islemDefteri.okxTamTaramaIsaretle(kayit.hesap);
  // 65.0: aynısı Binance için (dosya geri alındı ya da bu bilgisayarın Binance satırları sunucuda reddedildi → sonraki eşitleme baştan)
  if (/^\/api\/islem-defteri\/yukleme\/[^/]+\/geri-al$/.test(yol) && tur === 'tamam' && govde && govde.binanceTamTarama && govde.hesap) islemDefteri.binanceTamTaramaIsaretle(govde.hesap);
  if (yol === '/api/islem-defteri/binance/kayitlar' && (tur === 'red' || tur === 'cikar') && kayit.hesap) islemDefteri.binanceTamTaramaIsaretle(kayit.hesap);
  // 73.4: model sermayesi / kesirli hisse ayarı sunucuda kabul edildi → bu bilgisayarın sermaye.json'u da sunucunun hâline (yerel "Bu ay" + kâğıt hesap)
  if (yol === '/api/tasarimci/sermaye' && tur === 'tamam' && govde && govde.success && govde.sermaye) {
    try { require('./lib/tasarimci/api').yerelSermayeYansit(govde.sermaye); } catch (e) { db.addLog('WARN', `🧭 Sunucudaki sermaye ayarı bu bilgisayara yansıtılamadı: ${e.message}`); }
  }
}
/** Sunucudan okunan /ozet yanıtlarına bu bilgisayarın yazma/kuyruk durumu (ve İşlem defterim'de bu bilgisayarın OKX anahtar durumu). */
function evYanitiTamamla(yol, g) {
  const b = evYazma.bilgi();
  const ozet = { acik: !!b.yazmaKurulu, ev: true, neden: b.yazmaKurulu ? null : evYazmaLib.NASIL_ACILIR };
  const kuyruk = { bekleyen: b.bekleyen, hata: b.hata, sonHata: b.sonHata, sonHataZaman: b.sonHataZaman, sonBasari: b.sonBasari, kafaReddi: b.kafaReddi, bozuk: b.bozuk,
    ogeler: b.ogeler.filter(x => x.durum !== 'gonderildi' && (yol.includes('islem-defteri') ? /islem-defteri/.test(x.yol) : /portfoyum/.test(x.yol))).map(x => ({ id: x.id, ozet: x.ozet, durum: x.durum, zaman: x.zaman, sonHata: x.sonHata })) };
  if (yol === '/api/islem-defteri/ozet') { islemDefteri.evOzetiTamamla(g); g.yazma = ozet; g.evYazma = kuyruk; }
  else if (yol === '/api/portfoyum/ozet') { g.yazma = ozet; g.evYazma = kuyruk; }
}
const evOkuma = require('./lib/evOkuma').olustur({ kok: __dirname, etkin: EV_BAGLANTI_ETKIN, donustur: evYanitiTamamla });
app.get('/api/ev-baglanti', (req, res) => res.json({ success: true, ...evOkuma.bilgi() }));
app.use(evOkuma.middleware);
app.use(express.json({ limit: '10mb' }));
/*
 * KURULUM SİHİRBAZI (lib/kurulum.js, PLAN-PANEL-2): yeni kurulumda riskler + kullanım şartları onaylanmadan bot başlatılamaz
 * ve hesap türü değiştirilemez (POST /api/bindirme/:ad/baslat|mod → 403). Mevcut kurulum (data/secrets.json var) etkilenmez.
 * GET /api/kurulum · POST /api/kurulum/onay · POST /api/kurulum/tamam.
 */
const tasimaLib = require('./lib/tasima');
const KURULUM = require('./lib/kurulum').olustur({ kok: __dirname, tasima: () => tasimaLib.bekleyenOku() });
/*
 * 68.1 TAŞIMA DOSYASI / ARAŞTIRMA EKLENTİSİ (lib/tasima.js, lib/tasimaApi.js — PLAN-TASIMA F3). Uçlar yalnız YEREL kademede ve yalnız
 * kullanıcının açık isteğiyle çalışır; var olan kurulumda hiçbir şey kendiliğinden değişmez. İçe aktarmadan sonra
 * <veri>/tasima-bekliyor.json (MAKİNE): botlar açılışta BAŞLAMAZ, başlatma/çalıştırma ilk temiz mutabakata kadar 409 (aşağıda).
 * Araştırma eklentisi yokken (yeni boş kurulum; eski data/ düzeni hep "var" sayılır) araştırma uçları "eklenti yüklü değil".
 */
const TASIMA = require('./lib/tasimaApi').olustur({
  surum: APP_VERSION, log: (lv, msg) => db.addLog(lv, msg),
  // 69.6: taşıma paketi çözülmüş sırları taşır — her oluşturma Telegram'a (siz yapmadıysanız hemen anahtarları yenileyin).
  bildir: (tur, ad, boyut, gizli) => portfoyBildirici.gonder('uyari', `${tur === 'tasima' ? 'Taşıma paketi' : 'Araştırma eklentisi'} oluşturuldu`,
    [`${ad} (${(boyut / 1048576).toFixed(1)} MB)${gizli ? ' — API anahtarları ve jetonlar içinde (şifreli)' : ''}`,
      'Bunu siz yapmadıysanız: Binance API anahtarlarını ve Telegram jetonunu hemen yenileyin, Sağlık sayfasına bakın.'], { anahtar: `tasima-olustur:${ad}` }),
  botlarCalisiyor: () => [
    ...BINDIRME_ADLAR.filter(ad => bindirmeler[ad] && (bindirmeler[ad].bot.zamanlayici || bindirmeler[ad].y.borsa) && bindirmeler[ad].bot.durum.calisiyor),
    ...(kalkanBot.durum.calisiyor && kalkanYurutucu.borsa ? ['kalkan'] : []), ...(donchianBot.durum.calisiyor && canli.borsa ? ['donchian'] : [])],
  // Denetleyiciyle çalışıyorsa temiz kapan (kod 75) → 10 sn sonra yeni dosyalarla açılır; değilse kullanıcı yeniden açar.
  yenidenBaslat: () => { if (!process.env.PUSULA_KONSOL_GUNLUGU) return false; setTimeout(() => shutdown('taşıma sonrası yeniden başlatma', 75), 800); return true; }
});
app.use(TASIMA.sonrasiKapisi);
app.use(KURULUM.engel);
app.use(require('./lib/kurulum').router(KURULUM, { log: (lv, msg) => db.addLog(lv, msg) }));
app.use(TASIMA.arastirmaKapisi);
app.use(TASIMA.router);
/*
 * 68.3 KURULUM DENETİMİ (lib/kurulumDenetimi.js, PLAN-TASIMA F4): görevler, kısayollar, uyku, veri yeri, Git, sürüm, jeton — salt
 * okunur yoklama (GET /api/kurulum-denetimi). "Onar" (POST …/onar { adim }) yalnız açık tıklamayla ve yalnız YEREL kademede
 * scripts/kur.js --adim <ad> çalıştırır; var olan kurulumda kendiliğinden hiçbir şey değişmez.
 */
app.use(require('./lib/kurulumDenetimi').router({ port: process.env.PORT || 3000, log: (lv, msg) => db.addLog(lv, msg) }));
// Taşıma sonrası: bot başlatma / günlük çalıştırma ilk TEMİZ borsa mutabakatına kadar kapalı (mutabakat uçları işareti kaldırır).
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const y = guvenlikKur.yasakYolu(req.path);
  let bot = null, m;
  if ((m = y.match(/^\/api\/bindirme\/([^/]+)\/(baslat|calistir)$/))) bot = m[1];
  else if (/^\/api\/kalkan\/(baslat|calistir)$/.test(y)) bot = 'kalkan';
  else if (y === '/api/exchange/bot' && req.body && ['baslat', 'simdi'].includes(req.body.eylem)) bot = 'donchian';
  if (bot && tasimaLib.botBekliyor(bot)) {
    return res.status(409).json({ success: false, kod: 'mutabakat-bekliyor', error: 'Bu bilgisayara taşıma dosyasıyla gelindi: bot ilk temiz borsa mutabakatından önce başlamaz. Önce "Mutabakat" (borsayla karşılaştır), temiz çıkınca "Başlat".' });
  }
  next();
});
// F10b (denetim 64.8): gövde ayrıştırma hatası (bozuk JSON, 10 MB üstü) geliştirme kademesine JSON döner — geliştirme bilgisayarı
// kaydı "hata" yapar (HTML 400 yanıtı kuyruğu sonsuza dek bekletirdi). Diğer kademeler Express'in varsayılan davranışında.
app.use((err, req, res, next) => {
  if (req.kademe === 'gelistirme') return res.status(err.status || err.statusCode || 400).json({ success: false, error: `istek gövdesi okunamadı: ${err.type || err.message}` });
  next(err);
});
// Araştırma modunda Ayarlar ekranının yazdıkları (Telegram, piyasa verisi, izleme listesi, API anahtarları, sağlık
// sinyali URL'leri) config.json'a / secrets.json'a YAZILMAZ — 403 (denetim A-02; lib/guvenlik.js arastirmaAyarRed).
app.use((req, res, next) => {
  const red = ARASTIRMA_MODU ? guvenlikKur.arastirmaAyarRed(req.method, req.path, req.body) : null;
  if (red) return res.status(403).json({ success: false, arastirma: true, error: red });
  next();
});
// 64.8 EVDE: geliştirme kademesinden gelen yazmaların istek defteri (aynı x-istek-kimligi ikinci kez uygulanmaz; data/ev-istekler.json).
// F5: yanıt defteri yazılamadan süreç düştüyse tekrar gelen kimlik kayıt dosyalarındaki `istek` alanından tanınır (iş ikinci kez yapılmaz).
if (!ARASTIRMA_MODU) app.use(evYazmaLib.istekDefteri({ dosya: yollar.veri('ev-istekler.json'),
  kayitAra: (kimlik) => require('./lib/islemDefteri/depo').oku().kayitlar.some(k => k.istek === kimlik) || require('./lib/portfoyum/depo').oku().kayitlar.some(k => k.istek === kimlik) }).middleware);
// Geliştirme bilgisayarı yazma jetonunu dener (ev-baglanti betiği): sunucuda kademe 'gelistirme' ise jeton doğru.
app.get('/api/ev-yazma/dene', (req, res) => res.json({ success: true, surum: APP_VERSION, kademe: req.kademe, gelistirme: req.kademe === 'gelistirme', arastirma: ARASTIRMA_MODU }));
// 73.0 Ayarlar › Anahtarlar (lib/anahtarlar.js): evYazma ara katmanından ÖNCE — anahtar yazmaları kuyruğa (ev-kuyruk.jsonl) GİRMEZ;
// araştırma kopyasında kendisi iletir ya da GİZLİ bekleyen dosyasına alır. Yönlendirici aşağıda (İşlem defterim kurulduktan sonra) kurulur.
let anahtarYonlendirici = null;
app.use((req, res, next) => (anahtarYonlendirici ? anahtarYonlendirici(req, res, next) : next()));
// 64.8 GELİŞTİRME BİLGİSAYARINDA: İşlem defterim + Portföyüm yazmaları sunucuya (ya da kuyruğa). Yazma jetonu yoksa ve sunucu okuma kuruluysa 403 + nasıl açılır.
app.use(evYazma.middleware);
if (EV_BAGLANTI_ETKIN) {
  // Model portföylerin "Uyguladım" / hedef aktarımı yerel Portföyüm'e yazar; Portföyüm artık evde → bu bilgisayarda kapalı (sunucudaki panelden).
  app.use((req, res, next) => {
    if (req.method !== 'GET' && evOkuma.ayar() && /^\/api\/tasarimci\/(emirler\/[^/]+\/(uygula|geri-al)|hedef-aktar)$/.test(guvenlikKur.yasakYolu(req.path))) {
      return res.status(409).json({ success: false, arastirma: true, error: 'Portföyüm sunucuda tutulur — "Uyguladım", uygulamayı geri alma ve hedef aktarımı sunucudaki panelden yapılır.' });
    }
    next();
  });
}
/** Kuyruk (yalnız bu bilgisayar; sunucuya iletilmez). */
app.get('/api/ev-kuyruk', (req, res) => res.json({ success: true, ...evYazma.bilgi() }));
app.post('/api/ev-kuyruk/gonder', async (req, res) => {
  try { const o = await evYazma.bosalt(); res.json({ success: true, ...o, ...evYazma.bilgi() }); } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post('/api/ev-kuyruk/:id/cikar', (req, res) => {
  const r = evYazma.cikar(String(req.params.id || ''));
  res.status(r.success ? 200 : r.kod || 400).json(r);
});
/** 64.8 Portföyüm bir kezlik taşıma (geliştirme bilgisayarı → ev). Yerel dosya silinmez; data/portfoyum/eve-tasindi.json bayrağı. */
function portfoyumTasimaBayragi(yeni) {
  const d = require('./lib/portfoyum/depo');
  if (yeni === undefined) return d.jsonOku('eve-tasindi.json');
  d.jsonYaz('eve-tasindi.json', yeni);
  return yeni;
}
app.get('/api/ev-tasima/portfoyum', (req, res) => {
  try {
    const yerel = require('./lib/portfoyum/depo').oku().kayitlar;
    const b = portfoyumTasimaBayragi();
    const bilgi = evYazma.bilgi();
    res.json({ success: true, etkin: !!(EV_BAGLANTI_ETKIN && bilgi.kurulu), yazmaKurulu: bilgi.yazmaKurulu, yerelKayit: yerel.length, bayrak: b || null,
      gerekli: !!(EV_BAGLANTI_ETKIN && bilgi.kurulu && yerel.length && (!b || b.durum === 'hata')) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
let tasimaSuruyor = false;   // F8: çift tıklama
async function portfoyumTasi(onizle, yeniden) {
  if (!onizle) {
    const b = portfoyumTasimaBayragi();
    if (b && (b.durum === 'tamam' || b.durum === 'kuyrukta') && yeniden !== true) {
      return { durum: 409, govde: { success: false, kod: 'tasindi', error: b.durum === 'tamam' ? 'Bu bilgisayardaki kayıtlar zaten sunucuya taşındı.' : 'Taşıma zaten kuyrukta — sunucu açılınca gönderilir.' } };
    }
    if (tasimaSuruyor) return { durum: 409, govde: { success: false, kod: 'suruyor', error: 'Taşıma şu an gönderiliyor.' } };
  }
  tasimaSuruyor = !onizle || tasimaSuruyor;
  try { return await portfoyumTasiIc(onizle); } finally { if (!onizle) tasimaSuruyor = false; }
}
async function portfoyumTasiIc(onizle) {
  const yerel = require('./lib/portfoyum/depo').oku();
  if (yerel.bozuk.length) return { durum: 409, govde: { success: false, error: 'bu bilgisayardaki kayit.jsonl bozuk — taşınamaz' } };
  if (!yerel.kayitlar.length) return { durum: 400, govde: { success: false, error: 'bu bilgisayarda Portföyüm kaydı yok' } };
  const r = await evYazma.yaz('POST', '/api/portfoyum/tasima', { kayitlar: yerel.kayitlar, onizle }, { kuyruk: !onizle, etiket: onizle ? null : 'portfoyum-tasima' });
  if (r.tur === 'kurulu-degil') return { durum: 403, govde: { success: false, error: evYazmaLib.NASIL_ACILIR } };
  if (r.tur === 'ulasilamadi') return { durum: 503, govde: { success: false, evKapali: true, error: `Önizleme için sunucu açık olmalı (hangi kaydın sunucuda zaten olduğunu sunucu söyler). ${r.hata || ''}`.trim() } };
  if (r.tur === 'kuyrukta') { portfoyumTasimaBayragi({ durum: 'kuyrukta', zaman: new Date().toISOString(), kimlik: r.kayit.id }); return { durum: 202, govde: { success: true, kuyrukta: true, mesaj: 'Sunucu kapalı — taşıma kuyruğa alındı; sunucu açılınca gönderilir (sunucu o an yeniden karşılaştırır, çift eklemez).' } }; }
  if (r.tur === 'tamam' && !onizle) portfoyumTasimaBayragi({ durum: 'tamam', zaman: new Date().toISOString(), eklenen: r.govde.eklenenSayi });
  return { durum: r.durum, govde: r.govde };
}
app.post('/api/ev-tasima/portfoyum/onizle', async (req, res) => { try { const r = await portfoyumTasi(true); res.status(r.durum).json(r.govde); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
app.post('/api/ev-tasima/portfoyum/onayla', async (req, res) => { try { const r = await portfoyumTasi(false, !!(req.body && req.body.yeniden === true)); res.status(r.durum).json(r.govde); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
if (EV_BAGLANTI_ETKIN) evYazma.baslat();
// Telefon kademesindeki acil durdurma: ACİL PIN + "DURDUR" (yerel/masaüstü acil davranışı değişmez).
app.use(acilPin.middleware);
// `etag:false, maxAge:0` left the browser with no validator at all, so it fell
// back to heuristic caching and kept serving a stale app.js after edits.
// `no-cache` + ETag means: always revalidate, 304 when unchanged.
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));

/**
 * İçe aktarılmış Pine betikleri MOTOR KURULMADAN ÖNCE yüklenir.
 *
 * SIRA KRİTİK, ve yanlış sırası ölçüldü: yükleme motordan SONRA yapılıyordu.
 * Motor `activeStrategy`yi kurulurken çözüyor; içe aktarılan bot o an
 * katalogda olmadığı için `catalog.create` "bilinmeyen strateji" atıyor ve
 * motor sessizce varsayılana düşüyordu. 2026-08-16 açılışında tam bu oldu:
 * aktif strateji `pine_dca_botu_3commas_tarzi` seçiliyken kağıt bot bütün gün
 * `range_mr` koştu. Log'da tek satır WARN vardı, panel doğru adı gösteriyordu.
 *
 * İkinci sebep: panel açılır açılmaz `/api/strategies` çağırıyor; katalog o
 * anda eksikse içe aktarılan botlar listede hiç görünmez.
 *
 * Derlenmeyen betik ATLANIR ve loglanır — sunucunun açılmaması ya da betiğin
 * sessizce kaybolması iki kötü seçenek.
 */
try {
  const pineYukleme = pineStore.yukle();
  if (pineYukleme.yuklendi.length) {
    db.addLog('INFO', `📥 ${pineYukleme.yuklendi.length} Pine betiği yüklendi: `
      + pineYukleme.yuklendi.map(x => x.etiket).join(', '));
  }
  for (const h of pineYukleme.hatalar) {
    db.addLog('WARN', `Pine betiği derlenmedi (${h.anahtar}): ${h.hata}`);
  }
} catch (err) {
  db.addLog('ERROR', `Pine deposu yüklenemedi: ${err.message}`);
}

// Initialize Core Trading Engine
const engine = new TradingEngine(config);
// Bildirim merkezi (lib/bildirimMerkezi.js, PLAN-PANEL-2): Telegram'a giden her mesaj türüne ayrılır, kapalı tür gönderilmez,
// her deneme kayda geçer. İlk açılışta eski config bayrakları (notifyTrades/Errors/Lifecycle) varsayılan.
// 73.5: tür başına kanal (ntfy = 69.4 ikinci kanal, sır kasasındaki konu), şablon, sessiz saat; geliştirme bilgisayarında ntfy da gitmez.
const BILDIRIM = require('./lib/bildirimMerkezi').olustur({ kok: __dirname,
  varsayilan: () => ({ islem: engine.telegram.notifyTrades, hata: engine.telegram.notifyErrors, yasam: engine.telegram.notifyLifecycle }),
  ntfyFn: () => { const k = ikinciKanal(); return k.konu ? { konu: k.konu } : null; },
  engelFn: () => TELEGRAM_GELISTIRME_ENGELI || (ARASTIRMA_MODU ? 'araştırma modu' : null) });
engine.telegram.merkezBagla(BILDIRIM);
// 67.5: geliştirme bilgisayarında (araştırma modu / data/makine.json / sunucu bağlantısı kurulu) Telegram yoklaması ve gönderimi
// kapalı — sunucudaki yoklamayla 409 çakışması olmasın. TELEGRAM_GELISTIRME=1 açıkça açar. Sunucuda davranış değişmez.
const TELEGRAM_GELISTIRME_ENGELI = require('./lib/telegram').gelistirmeEngeli({ env: process.env, kok: __dirname, arastirma: ARASTIRMA_MODU });
engine.telegram.gelistirmeEngeli = TELEGRAM_GELISTIRME_ENGELI;

// Broadcast state via WebSocket
function broadcast(type, data) {
  const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

/**
 * CANLI BORSA KATMANI (lib/live/) — paper motordan AYRI.
 * Bağlantı her zaman panelden elle kurulur; sunucu açılışta kendiliğinden
 * canlıya bağlanmaz. Canlı emir kilidi bellekte durur, yeniden başlatmada kapanır.
 */
const { CanliYurutucu } = require('./lib/live/yurutucu');
const { DonchianBot } = require('./lib/live/donchianBot');
const CANLI_DIZIN = yollar.veri('live');
const canliAyar = () => ({ maxEmirNominal: 200, maxPozisyonNominal: 500, sermayeTavani: 200, symbol: 'BTC/USDT:USDT', ...(config.canli || {}) });
const canli = new CanliYurutucu({
  dizin: CANLI_DIZIN,
  maxEmirNominal: canliAyar().maxEmirNominal,
  maxPozisyonNominal: canliAyar().maxPozisyonNominal,
  kaydet: (seviye, metin) => db.addLog(seviye, `[BORSA] ${metin}`)
});
const donchianBot = new DonchianBot(canli, {
  dizin: CANLI_DIZIN, symbol: canliAyar().symbol, semboller: canliAyar().semboller, sermayeTavani: canliAyar().sermayeTavani,
  kaydet: (seviye, metin) => db.addLog(seviye, `[DONCHIAN] ${metin}`)
});
if (donchianBot.durum.calisiyor && !ARASTIRMA_MODU && !tasimaLib.botBekliyor('donchian')) donchianBot.baslat();   // 68.1: taşıma sonrası mutabakat bekler   // bağlantı kurulana kadar boşta bekler

/**
 * B KALKAN (lib/live/kalkanBot.js) — YALNIZ KÂĞIT BORSA. Kendi yürütücüsü,
 * kendi defteri (data/live/kalkan/). Piyasa verisi Binance USDⓈ-M'den
 * ANAHTARSIZ okunur; emirler `KagitBorsa`da yaşar, borsaya hiçbir emir gitmez.
 * Testnet/canlıya bağlama yolu bilerek yok (PLAN-ADAYLAR: anahtar en son).
 */
const { KalkanBot } = require('./lib/live/kalkanBot');
const { KagitBorsa } = require('./lib/live/kagitBorsa');
const KALKAN_DIZIN = path.join(CANLI_DIZIN, 'kalkan');
const kalkanAyar = () => ({ sermayeTavani: 10000, kagitBakiye: 10000, k: 15, ...(config.kalkan || {}) });
const kalkanYurutucu = new CanliYurutucu({
  dizin: KALKAN_DIZIN,
  maxEmirNominal: kalkanAyar().sermayeTavani,
  maxPozisyonNominal: kalkanAyar().sermayeTavani,
  kaydet: (seviye, metin) => db.addLog(seviye, `[KALKAN-BORSA] ${metin}`)
});
const kalkanBot = new KalkanBot(kalkanYurutucu, {
  dizin: KALKAN_DIZIN, sermayeTavani: kalkanAyar().sermayeTavani, evren: { k: kalkanAyar().k },
  kaydet: (seviye, metin) => db.addLog(seviye, `[KALKAN] ${metin}`)
});
/** Kâğıt borsaya bağlanır (bir kez) ve kalkan mutabakatını koşar. */
async function kalkanBagla() {
  if (kalkanYurutucu.borsa) return kalkanYurutucu.ozet();
  const ccxt = require('ccxt');
  const veri = new ccxt.binanceusdm({ enableRateLimit: true });     // anahtarsız: yalnız piyasa verisi
  const borsa = new KagitBorsa({ veri, bakiye: kalkanAyar().kagitBakiye, dosya: path.join(KALKAN_DIZIN, 'kagit-borsa.json'), model: 'kotumser' });   // 69.5: yalnız yeni dosyada etkin
  const ozet = await kalkanYurutucu.baglanKagit(borsa);
  await kalkanBot.mutabakat();
  return ozet;
}
const kalkanKagitMi = () => { if (kalkanYurutucu.borsa && kalkanYurutucu.ortam !== 'kagit') throw new Error('kalkan yalnız kâğıt borsada çalışır'); };
if (kalkanBot.durum.calisiyor && !ARASTIRMA_MODU && !tasimaLib.botBekliyor('kalkan')) {
  kalkanBagla().then(() => kalkanBot.baslat())
    .catch(e => db.addLog('ERROR', `[KALKAN] açılışta kâğıt borsaya bağlanılamadı: ${e.message}`));
}

/**
 * HÜCUM / DENGE (lib/live/bindirmeBot.js) — iki mod, panelden seçilir:
 *   · kagit : O-GC BTC ayağı SPOT BTC (çoklu varlık modunun kâğıt karşılığı) + Kalkan kolu ×3,
 *             KagitBorsa (gerçek emir yok). Dizin data/live/<ad>/.
 *   · demo  : Binance DEMO TRADING hesabı (testnet anahtarı, Borsa sekmesi). BTC ayağı BTCUSDT
 *             perp LONG — DEMO YAKLAŞIMI, gerçekte spot teminat. Karar verisi prod'un anahtarsız
 *             genel uçlarından (gölgeyle aynı veri), emirler demo hesaba. Dizin data/live/<ad>-demo/.
 *   · canli : GERÇEK PARA (61.9, C1 — PLAN-GERCEK-PARA-2027.md). Yalnız lib/live/canliKapi.js kapısı açıkken (tarih ≥
 *             2027-01-05, G1–G9 yazılı onayı data/live/canli-kapilar.json, canliSermayeTavani ≤ onaylı üst sınır, live anahtar,
 *             healthchecks, tek bot). Kapı her bağlanışta (açılış dahil) yeniden denetlenir. BTC ayağı HER ZAMAN çoklu varlık
 *             ('coklu'); anahtar izinleri bağlanırken borsadan denetlenir (çekme kapalı, futures, spot, universal transfer, IP
 *             kısıtı). Mod geçişi "GERÇEK PARA" yazarak; emir onayı "CANLI" (kalıcı, K1). Hesap kesicisi %30/%40 (Ö6); ileri test
 *             DUR → acil. Dizin data/live/<ad>-canli/.
 *   · GERÇEK TASARIM kipi (PLAN-GERCEK-PARA-2027.md): config.bindirme.<ad>.btcAyak = 'coklu' → yalnız KÂĞIT modda
 *     BTC ayağı çoklu varlık akışıyla (spot alım → vadeliye aktarım, KagitBorsa taklidi). Varsayılan DEĞİŞMEZ (spot);
 *     demo'da sapi aktarımı olmadığı için yok sayılır (perp).
 * Tek demo hesap ⇒ aynı anda en çok BİR portföy botu demo modunda olabilir.
 * Ayar: config.bindirme.{hucum|denge} = { mod, sermayeTavani, kagitBakiye, k, demoSermayeTavani }.
 */
const { BindirmeBot } = require('./lib/live/bindirmeBot');
const isletim = require('./lib/live/isletim');
const bindirmeArastirma = require('./lib/research/bindirme');
const BINDIRME_ADLAR = Object.keys(bindirmeArastirma.STRATEJILER);   // ['hucum', 'denge']
const BINDIRME_MODLAR = ['kagit', 'demo', 'canli'];
const canliKapi = require('./lib/live/canliKapi');
const CANLI_KAPILAR_DOSYA = yollar.veri('live', 'canli-kapilar.json');
/** Gerçek para kapısı (lib/live/canliKapi.js) — her çağrıda dosyadan okunur; çalışan bot her günlük çalışmada sorar (kapiFn). */
function canliKapiDurum(ad) {
  let kapilar = null;
  try { kapilar = JSON.parse(fs.readFileSync(CANLI_KAPILAR_DOSYA, 'utf8')); } catch { /* yok/bozuk = onay yok */ }
  return canliKapi.denetle({ simdi: Date.now(), ad, tavan: bindirmeAyar(ad).canliSermayeTavani, kapilar,
    anahtarVar: !!(config.apiKey && config.apiSecret), saglikUrl: botSaglikUrl(config, ad), arastirma: ARASTIRMA_MODU,   // 68.8: o botun KENDİ adresi
    digerCanli: Object.values(bindirmeler).filter(b => b && b.mod === 'canli').map(b => b.ad) });
}
function canliKapiGerekli(ad) { const k = canliKapiDurum(ad); if (!k.izin) throw new Error(canliKapi.metin(k)); return k; }
/** Panelde görünen modlar: gerçek para yalnız kapı açıkken (ya da zaten o moddaysa — geri dönebilmek için). */
const gorunurModlar = (b) => BINDIRME_MODLAR.filter(m => m !== 'canli' || b.mod === 'canli' || canliKapiDurum(b.ad).izin);
const GOLGE_DOSYA = yollar.veri('ileri', 'bindirme-golge.jsonl');
/** 69.4 ikinci kanal (ntfy) ve ikinci ölü adam: secrets.json `ikinciKanal` { ntfyKonu, sinyalUrl } (sır — panelde maskeli). */
const ikinciKanal = () => { const k = (loadSecrets().ikinciKanal) || {}; return { konu: k.ntfyKonu || null, sinyalUrl: k.sinyalUrl || null }; };
// 73.5: Bildirici'nin kendi ntfy yayını (alarm her zaman) bildirim merkezinin az önce ntfy'a yolladığı aynı başlığı ikinci kez yollamasın
// (tür kanalı "ikisi" seçiliyse) — yalnız fetch sarılır; Bildirici kodu (lib/live/isletim.js) değişmedi.
const portfoyBildirici = new isletim.Bildirici(() => engine.telegram, { ikinciKanalFn: ikinciKanal, fetchFn: BILDIRIM.ntfyFetchSarmala(), ozetDosya: yollar.veri('telegram-son-ozet.json'),
  kuyrukDosya: ARASTIRMA_MODU ? null : yollar.veri('telegram-kuyruk.jsonl'),   // Y3: giden kutusu (5 dk'da bir boşaltılır)
  gunlukDosya: ARASTIRMA_MODU ? null : yollar.veri('live', 'alarmlar.jsonl') });   // PLAN-DEMO-KABUL I3: kalıcı bildirim günlüğü

/**
 * SAĞLIK SİNYALİ (healthchecks.io, lib/saglikSinyali.js). İKİ AYRI URL — bilinçli:
 *   · bot    : yalnız portföy botunun günlük çalışması pingler. Sunucu kalp atışı AYNI URL'ye
 *              gitseydi, sunucu açık ama bot durmuş/takılmışken check hiç düşmezdi (asıl yakalanacak durum).
 *   · sunucu : isteğe bağlı ikinci check; sunucu açıkken günde bir ping.
 * 68.8 BOT BAŞINA: her bot KENDİ check'ine (lib/saglikSinyali.js botUrl) — Hücum eski `healthchecksUrl` (geri uyum), Denge
 *   `bindirme.denge.healthchecksUrl`. Önceden iki bot aynı URL'ye ping atıyordu: biri durunca öbürünün başarı ping'i check'i
 *   "up" tutardı. Denge'nin adresi yoksa Denge ping GÖNDERMEZ (Hücum'unkine de). `saglikBot` = Hücum'unki (eski ad).
 */
const { SaglikSinyali, urlGecerli: saglikUrlGecerli, botUrl: botSaglikUrl } = require('./lib/saglikSinyali');
const saglikBotlar = Object.fromEntries(BINDIRME_ADLAR.map(ad => [ad, new SaglikSinyali({ ad: `sağlık sinyali (${bindirmeArastirma.STRATEJILER[ad].ad})`, urlFn: () => botSaglikUrl(config, ad), kaydet: (sv, m) => db.addLog(sv, `[SAĞLIK] ${m}`) })]));
const saglikBot = saglikBotlar.hucum;
const saglikSunucu = new SaglikSinyali({ ad: 'sağlık sinyali (sunucu)', urlFn: () => config.healthchecksSunucuUrl, kaydet: (sv, m) => db.addLog(sv, `[SAĞLIK] ${m}`) });
const bindirmeAyar = (ad) => ({ mod: 'kagit', sermayeTavani: 10000, kagitBakiye: 10000, k: 15, demoSermayeTavani: 1000, kucukSermaye: 'oto', ...(((config.bindirme || {})[ad]) || {}) });
const KUCUK_SECIMLER = { oto: 'oto', acik: true, kapali: false };
const KAGIT_AYAKLAR = ['spot', 'coklu'];   // 68.9: kâğıt hesapta BTC ayağı (sıfırlamayla seçilir; demo her zaman perp, canlı her zaman çoklu)
const bindirmeDizin = (ad, mod) => path.join(CANLI_DIZIN, mod === 'demo' ? `${ad}-demo` : mod === 'canli' ? `${ad}-canli` : ad);
const bindirmeler = {};
const ACILIS_DENEME_DK = [1, 2, 5, 10, 30];
const ACILIS_ALARM_MS = 15 * 60000;

/** BTC ayağı biçimi: demo → perp (her zaman); kâğıt → 'spot', yalnız config btcAyak 'coklu' ise çoklu varlık taklidi. */
function btcAyakSec(a, mod, ad) {
  if (mod === 'canli') return 'coklu';   // gerçek tasarım: spot BTC vadeli teminat (PLAN-GERCEK-PARA-2027 §0)
  if (mod === 'demo') {
    if (a.btcAyak === 'coklu') db.addLog('WARN', `[BİNDİRME] ${ad}: btcAyak 'coklu' demo'da kullanılamaz (Binance Demo'da sapi aktarımı yok) — perp`);
    return 'perp';
  }
  return a.btcAyak === 'coklu' ? 'coklu' : 'spot';
}

function bindirmeKur(ad, mod) {
  if (!BINDIRME_MODLAR.includes(mod)) throw new Error(`mod kagit | demo | canli olmalı ("${mod}")`);
  const a = bindirmeAyar(ad);
  const dizin = bindirmeDizin(ad, mod);
  const canliMi = mod === 'canli';
  const etiket = bindirmeArastirma.STRATEJILER[ad].ad.toLocaleUpperCase('tr-TR') + (mod === 'demo' ? '·DEMO' : '');
  const kaydet = (seviye, metin) => db.addLog(seviye, `[${etiket}] ${metin}`);
  const tavan = mod === 'demo' ? a.demoSermayeTavani : canliMi ? (+a.canliSermayeTavani || 0) : a.sermayeTavani;
  // Kol ×3: sembol başı nominal özsermayenin 1,8 katına çıkabilir → tavanlar 3 × sermaye tavanı.
  const btcAyak = btcAyakSec(a, mod, ad);
  const y = new CanliYurutucu({ dizin, maxEmirNominal: 3 * tavan, maxPozisyonNominal: 3 * tavan, cokluVarlik: btcAyak === 'coklu', kaydet: (s, m) => kaydet(s, `borsa: ${m}`) });
  const bot = new BindirmeBot(y, { ad, dizin, sermayeTavani: tavan, evren: { k: a.k }, kaydet, mod,
    btcAyak, bildirici: portfoyBildirici, golgeDosya: GOLGE_DOSYA, saglik: saglikBotlar[ad],   // 68.8: bot başına check (Hücum: saglikBot)
    kucukSermaye: a.kucukSermaye === true || a.kucukSermaye === false ? a.kucukSermaye : 'oto',
    tavanAkis: a.tavanAkis !== false,   // 69.3: yatırma/çekme sermaye tavanını izler (canlıda onaylı üst sınırla)
    hesapKesicisi: canliMi ? { uyari: 0.30, acil: 0.40 } : null,   // Ö6: yalnız gerçek parada
    kapiFn: canliMi ? () => canliKapiDurum(ad) : null });            // denetim #2: kapı çalışırken de denetlenir
  /** @param o.mutabakatsiz Y4 (61.7): acil durdurma için yalnız bağlan — kol mutabakatı (ve hatası) acili engellemez. */
  const bagla = async (o = {}) => {
    if (y.borsa) return y.ozet();
    const ccxt = require('ccxt');
    const veri = new ccxt.binanceusdm({ enableRateLimit: true });   // anahtarsız: yalnız piyasa verisi
    let ozet;
    if (canliMi) {
      // C1: kapı HER bağlanışta yeniden denetlenir (açılışta da). Denetim #1: ACİL bağlanışı (mutabakatsiz) hariç — kapı kapansa da
      // açık pozisyon kapatılabilmeli; acil zaten ELLE durdurur ve kalıcı emir onayını kaldırır.
      if (!o.mutabakatsiz) canliKapiGerekli(ad);
      ozet = await y.baglan({ ortam: 'live', apiKey: config.apiKey, apiSecret: config.apiSecret });
    } else if (mod === 'demo') {
      if (!config.testnetApiKey || !config.testnetApiSecret) throw new Error('Demo anahtarı yok — Borsa sekmesi → API anahtarları → Testnet Key/Secret girin');
      ozet = await y.baglan({ ortam: 'testnet', apiKey: config.testnetApiKey, apiSecret: config.testnetApiSecret, veri });
    } else {
      // 69.5: yeni kâğıt hesap kötümser modelle açılır (stoplar tetiklenir, piyasa emri kaymalı); var olan dosya kendi modelinde kalır.
      const borsa = new KagitBorsa({ veri, bakiye: a.kagitBakiye, dosya: path.join(dizin, 'kagit-borsa.json'), model: 'kotumser' });
      ozet = await y.baglanKagit(borsa);
    }
    if (!o.mutabakatsiz) await bot.mutabakat();
    return ozet;
  };
  return { ad, mod, dizin, y, bot, bagla };
}

for (const ad of BINDIRME_ADLAR) {
  let mod = bindirmeAyar(ad).mod;
  if (!BINDIRME_MODLAR.includes(mod)) { db.addLog('WARN', `[BİNDİRME] ${ad}: geçersiz mod "${mod}" — kâğıt kullanılıyor`); mod = 'kagit'; }
  const b = bindirmeler[ad] = bindirmeKur(ad, mod);
  if (b.bot.durum.calisiyor && !ARASTIRMA_MODU && !tasimaLib.botBekliyor(ad)) acilisBaglan(ad, b);   // 68.1: taşıma sonrası mutabakat bekler
  else if (b.bot.durum.calisiyor && tasimaLib.botBekliyor(ad)) db.addLog('WARN', `[${ad}] taşıma dosyasıyla gelindi — bot kendiliğinden başlamadı; önce mutabakat, sonra Başlat`);
}
/**
 * Y1 (61.8, DENETIM-CANLI-ALTYAPI): açılışta internet/DNS henüz yoksa bot bir daha denenmiyordu (panelden "Başlat"a kadar ölü).
 * Artık 1 · 2 · 5 · 10 · 30 dk (sonra 30 dk'da bir) yeniden denenir; ALARM ilk hatada değil, 15 dk süren başarısızlıkta
 * (internet o sırada gelmiş olur), bir kez. Bağlanınca alarm gitmişse "bağlantı kuruldu" bilgisi. Kullanıcı elle bağlarsa/durdurursa biter.
 */
function acilisBaglan(ad, b, deneme = 0, ilk = null) {
  const etiket = b.mod === 'demo' ? 'demo hesaba' : b.mod === 'canli' ? 'GERÇEK hesaba' : 'kâğıt borsaya';
  // bagla() borsa nesnesi zaten varsa erken döner (mutabakatsız) — önceki denemede mutabakat düştüyse burada yeniden yapılır.
  const baglan = () => (b.y.borsa ? b.bot.mutabakat() : b.bagla());
  baglan().then(() => {
    b.bot.baslat();
    if (deneme > 0) {
      db.addLog('SUCCESS', `[${ad}] açılış bağlantısı ${deneme + 1}. denemede kuruldu`);
      if (b._acilisAlarm) portfoyBildirici.gonder('bilgi', `${b.bot.adGorunen}: bağlantı kuruldu`, [`Açılışta ${Math.round((Date.now() - ilk) / 60000)} dk bağlanılamamıştı; ${deneme + 1}. denemede bağlandı, bot çalışıyor.`]);
    }
  }).catch(e => {
    const bas = ilk || Date.now();
    db.addLog('ERROR', `[${ad}] açılışta ${etiket} bağlanılamadı (deneme ${deneme + 1}): ${e.message}`);
    if (!b._acilisAlarm && Date.now() - bas >= ACILIS_ALARM_MS) {
      b._acilisAlarm = true;
      portfoyBildirici.gonder('alarm', `${bindirmeArastirma.STRATEJILER[ad].ad}: açılışta bağlanılamadı`, [e.message, `${Math.round((Date.now() - bas) / 60000)} dakikadır deneniyor; denemeler sürüyor (en çok 30 dk arayla).`]);
    }
    const bekle = ACILIS_DENEME_DK[Math.min(deneme, ACILIS_DENEME_DK.length - 1)] * 60000;
    setTimeout(() => {
      // Denetim 61.8 #1: borsa nesnesi kurulup MUTABAKAT hata verdiyse de yeniden dene (y.borsa dolu olabilir) —
      // yalnız bot başlatıldıysa (zamanlayıcı kurulu: elle Başlat ya da önceki deneme) dur.
      if (bindirmeler[ad] !== b || !b.bot.durum.calisiyor || b.bot.zamanlayici) return;
      acilisBaglan(ad, b, deneme + 1, bas);
    }, bekle).unref();
  });
}
// Sunucu açılınca: çalışması gereken bot 26 saattir çalışmadıysa Telegram uyarısı (kapalı kalma).
setTimeout(() => {
  for (const ad of BINDIRME_ADLAR) {
    const b = bindirmeler[ad];
    const k = isletim.kalpDurumu(isletim.kalpOku(b.dizin));
    if (b.bot.durum.calisiyor && k.var && k.gecikti) {
      db.addLog('WARN', `[${ad}] ${isletim.KALP_ESIK_SAAT} saattir çalışmadı (${k.metin}) — kaçırılan günler bugünkü hedefle telafi edilecek`);
      portfoyBildirici.gonder('alarm', `${b.bot.adGorunen}: bot ${isletim.KALP_ESIK_SAAT} saattir çalışmadı`, [k.metin, 'Sunucu yeni açıldı. Bot yalnız bugünkü hedefe gidecek; kaçırılan günler ve gölgeye göre farkı raporlanacak.']);
    }
  }
}, 45 * 1000).unref();

// O5 (61.7): saatlik süreç içi bekçi — kalp 26 saati aştıysa ya da bir işlem 30 dk'dan uzun sürüyorsa (takılma) Telegram alarmı.
// Aynı sorun 6 saatte bir tekrarlanır (Bildirici anahtar kısıtı). Araştırma modunda (bot başka makinede) çalışmaz.
if (!ARASTIRMA_MODU) {
  setInterval(() => {
    for (const ad of BINDIRME_ADLAR) {
      const b = bindirmeler[ad];
      let sorunlar = [];
      try { sorunlar = b.bot.bekci(); } catch (e) { sorunlar = [{ anahtar: 'bekci', metin: `bekçi denetimi yapılamadı: ${e.message}` }]; }
      for (const s of sorunlar) {
        db.addLog('WARN', `[${ad}] bekçi: ${s.metin}`);
        portfoyBildirici.gonder('alarm', `${b.bot.adGorunen}: bekçi uyarısı`, [s.metin], { anahtar: `bekci:${ad}:${s.anahtar}` });
      }
    }
  }, 3600e3).unref();
}

/** O7: boş disk alanı (veri dizininin sürücüsü). */
function diskDurumu() {
  try { const st = fs.statfsSync(__dirname); return { bosGB: +((st.bavail * st.bsize) / 1e9).toFixed(1) }; } catch (e) { return { hata: e.message }; }
}
const DISK_UYARI_GB = 10;

/**
 * Y10 (61.8): DIŞ IP İZLEYİCİ — sunucunun internetinin IP'si değişince (modem yeniden başlaması) Binance API IP kısıtı anahtarı
 * reddeder. Saatte bir ücretsiz api.ipify.org'dan okunur (yalnız IP döner), data/dis-ip.json'a yazılır; değişince Telegram.
 */
const DIS_IP_DOSYA = yollar.veri('dis-ip.json');
async function disIpDenetle() {
  let ip;
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(10000) });
    ip = String(((await r.json()) || {}).ip || '');
  } catch { return null; }   // ağ yok — bir sonraki saatte
  if (!/^[0-9a-f.:]{3,45}$/i.test(ip)) return null;
  let eski = null;
  try { eski = JSON.parse(fs.readFileSync(DIS_IP_DOSYA, 'utf8')); } catch { /* ilk kez */ }
  if (eski && eski.ip === ip) return { ip, degisti: false };
  try { kaliciDosya.yaz(DIS_IP_DOSYA, { ip, zaman: new Date().toISOString(), onceki: eski ? eski.ip : null }); } catch { /* */ }
  if (eski && eski.ip) {
    db.addLog('WARN', `[İŞLETİM] dış IP değişti: ${eski.ip} → ${ip}`);
    portfoyBildirici.gonder('alarm', 'Sunucunun internetinin dış IP adresi değişti', [`${eski.ip} → ${ip}`,
      'Binance API anahtarında IP kısıtı varsa yeni adresi ekleyin (Binance → API Management → Edit restrictions); yoksa borsa istekleri reddedilir.'], { anahtar: `dis-ip:${ip}` });
  }
  return { ip, degisti: !!eski };
}

if (!ARASTIRMA_MODU) {
  // Açılış: bozuk ayar/sır dosyası kurtarıldıysa (Y5) alarm (Telegram ayarı bu sırada okunmuş olur).
  setTimeout(() => {
    if (SIR_GECIS && SIR_GECIS.yapildi) db.addLog('SUCCESS', `[İŞLETİM] sır dosyası şifrelendi (Windows DPAPI, yalnız bu bilgisayardaki bu Windows kullanıcısı çözer)${SIR_GECIS.neden ? ` — ${SIR_GECIS.neden}` : ''}`);
    for (const [ad, g] of Object.entries(KASA_GECIS || {})) if (ad !== 'secrets.json' && g && g.yapildi) db.addLog('SUCCESS', `[İŞLETİM] ${ad} sır kasasına alındı${g.neden ? ` — ${g.neden}` : ''}`);
    else if (SIR_GECIS && /doğrulanamadı/.test(SIR_GECIS.neden || '')) db.addLog('ERROR', `[İŞLETİM] ${SIR_GECIS.neden}`);
    for (const m of [loadConfig._yedekten, SIRLAR_BOZUK, SIRLAR_KILITLI].filter(Boolean)) {
      db.addLog('ERROR', `[İŞLETİM] ${m}`);
      portfoyBildirici.gonder('alarm', 'Ayar dosyası bozuk açıldı', [m], { anahtar: `ayar-bozuk:${m.slice(0, 30)}` });
    }
  }, 30 * 1000).unref();
  setInterval(() => { portfoyBildirici.kuyruguGonder().catch(() => null); }, 5 * 60000).unref();   // Y3
  setTimeout(() => { portfoyBildirici.kuyruguGonder().catch(() => null); }, 90 * 1000).unref();
  const saatlik = () => {
    disIpDenetle().catch(() => null);
    const d = diskDurumu();
    if (d.bosGB != null && d.bosGB < DISK_UYARI_GB) {
      portfoyBildirici.gonder('uyari', 'Disk dolmak üzere', [`Boş alan ${d.bosGB} GB (< ${DISK_UYARI_GB} GB). Disk dolarsa bot durum dosyalarını yazamaz.`], { anahtar: 'disk-dolu', kisitMs: 24 * 3600e3 });
    }
  };
  setTimeout(saatlik, 2 * 60000).unref();
  setInterval(saatlik, 3600e3).unref();
}

/** `:ad` → bot kaydı; bilinmeyen ad 404. */
function bindirmeBul(req, res) {
  const b = bindirmeler[req.params.ad];
  if (!b) { res.status(404).json({ success: false, error: `bilinmeyen strateji: ${req.params.ad} (hucum | denge)` }); return null; }
  return b;
}
/** Demo hesabı tek: başka bir portföy botu ya da Borsa sekmesinin Donchian botu aynı hesapta çalışmasın. */
function bindirmeDemoCakisma(b) {
  // C1 denetim notu (62.1): Borsa sekmesinin eski yürütücüsü (canliIzin) gerçek hesaba bağlıyken portföy botu gerçek parada
  // başlatılamaz/çalıştırılamaz — aynı anahtarla iki yürütücü aynı hesabı yönetir, mutabakat ve K-TEK bozulur.
  if (b.mod === 'canli' && canli.borsa && canli.ortam === 'live') throw new Error('Borsa sekmesinde gerçek hesaba ayrı bir bağlantı açık — önce onu kesin (aynı hesapta iki yürütücü olmaz)');
  if (b.mod !== 'demo') return;
  for (const ad of BINDIRME_ADLAR) if (ad !== b.ad && bindirmeler[ad].mod === 'demo') throw new Error(`${bindirmeler[ad].bot.adGorunen} zaten demo modunda — tek demo hesapta iki portföy botu mutabakatı bozar`);
  if (canli.ortam === 'testnet' && donchianBot.durum.calisiyor) throw new Error('Borsa sekmesindeki Donchian botu demo hesapta çalışıyor — önce onu durdurun');
}

/** Panelin mod rozeti: paper motor mu, testnet mi, canlı mı. */
const borsaModu = () => (canli.borsa ? canli.ortam : 'paper');

engine.onTickCallback = (state) => {
  broadcast('TICK', { ...state, exchangeMode: borsaModu() });
  broadcast('STATS', db.getStats());
  broadcast('LOGS', db.getLogs(20));
};

// WebSocket Connection Handler
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'INIT', data: { ...engine.getState(), exchangeMode: borsaModu() }, stats: db.getStats(), logs: db.getLogs(50) }));
});

// --- REST API Endpoints ---

/**
 * Adding a symbol to activeSymbols does nothing while the engine loop is
 * stopped — the UI would report "bot started" and no tick would ever run.
 * Every start path goes through here so the loop is guaranteed to be live,
 * and any refusal (kill-switch) is reported instead of swallowed.
 */
function ensureEngineRunning() {
  if (engine.isRunning) return { running: true };
  try {
    engine.start();
    return { running: true, justStarted: true };
  } catch (err) {
    return { running: false, error: err.message };
  }
}

/**
 * OTOMATİK GÜNCELLEME (61.3; lib/guncelleme.js, scripts/guncelle.js, görev PusulaGuncelle 12:00). Panel: Ayarlar › Bu bilgisayar.
 *   GET  /api/guncelleme/durum    data/guncelleme.json + bu sunucunun sürümü (telefonda da okunur)
 *   POST /api/guncelleme/kontrol  güncelleyiciyi şimdi çalıştır (arka planda, ayrı süreç)
 *   POST /api/guncelleme/uygula {hedef}  bot kodu değişen güncellemeyi ONAYLA ve kur — yalnız bekleyen hedef commit
 *   POST /api/sistem/yeniden-baslat  temiz kapan (kod 75) → denetleyici 10 sn sonra yeni kodla açar; yalnız denetleyiciyle
 *        (Pusula kısayolu / PusulaBot görevi: PUSULA_KONSOL_GUNLUGU) başlatılmışsa — yoksa süreç geri gelmezdi.
 * POST'lar telefonda (lib/guvenlik.js beyaz liste) ve araştırma modunda (ARASTIRMA_KAPALI) 403.
 */
const guncelleme = require('./lib/guncelleme');
function guncelleyiciBaslat(args) {
  require('child_process').spawn(process.execPath, [path.join(__dirname, 'scripts', 'guncelle.js'), ...args],
    { cwd: __dirname, detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
app.get('/api/guncelleme/durum', (req, res) => {
  const d = guncelleme.durumOku(__dirname);
  // 69.0: işlem bitmeden kilit kalkmışsa güncelleyici süreç yarıda ölmüş — panel "sürüyor" deyip sonsuza dek beklemesin.
  if (d.islem && !d.islem.bitti && !guncelleme.kilitVar(__dirname)) d.islem = { ...d.islem, yarida: true };
  res.json({ success: true, ...d, adimTanim: guncelleme.ADIMLAR, calisanSurum: APP_VERSION, gelistirme: ARASTIRMA_MODU, denetleyici: !!process.env.PUSULA_KONSOL_GUNLUGU });
});
app.post('/api/guncelleme/kontrol', (req, res) => {
  guncelleyiciBaslat([]);
  res.status(202).json({ success: true, basladi: true });
});
/**
 * Y8 (61.8): botun günlük kararı UTC 00:02 (TR 03:02); veri indirmesi ve yeniden denemeler bu çevrede. Bu pencerede
 * (UTC 23:50–01:30) yeniden başlatma ve onaylı kurulum REDDEDİLİR — günlük çalışma emirlerin ortasında kesilmesin.
 */
function kararPenceresinde(simdi = Date.now()) {
  const d = new Date(simdi), dk = d.getUTCHours() * 60 + d.getUTCMinutes();
  return dk >= 23 * 60 + 50 || dk < 90;
}
const KARAR_PENCERESI_METNI = 'Botun günlük karar saati (TR 02:50–04:30) — bu aralıkta güncelleme kurulmaz ve Pusula yeniden başlatılmaz. 04:30\'dan sonra yeniden deneyin.';
app.post('/api/guncelleme/uygula', (req, res) => {
  if (kararPenceresinde()) return res.status(409).json({ success: false, error: KARAR_PENCERESI_METNI });
  const d = guncelleme.durumOku(__dirname);
  const hedef = String((req.body && req.body.hedef) || '');
  if (d.durum !== 'onay' || !d.hedef || hedef !== d.hedef) return res.status(409).json({ success: false, error: 'Onay bekleyen bu güncelleme artık yok (yeni sürüm gelmiş ya da kurulmuş olabilir). Sayfayı yenileyin.' });
  // 69.2: kuru denemede karar farkı çıktıysa kurulum ancak "Farkı gördüm, yine de kur" ile (aynı commit için) sürer.
  const farkOnay = !!(req.body && req.body.kuruFarkOnay) && !!(d.kuruFark && d.kuruFark.hedef === d.hedef);
  guncelleyiciBaslat(['--onayla', d.hedef, ...(farkOnay ? ['--kuru-fark-onay'] : [])]);
  res.status(202).json({ success: true, basladi: true, kuruFarkOnay: farkOnay });
});
/** 69.2 KURU DENEME: güncelleyicinin (scripts/guncelle.js) bot listesi — yalnız bu bilgisayardan (yollar sunucu içi bilgi). */
app.get('/api/guncelleme/kuru-bilgi', (req, res) => {
  if ((req.kademe || 'yerel') !== 'yerel') return res.status(403).json({ success: false, error: 'yalnız sunucunun kendisinden' });
  res.json({ success: true, botlar: BINDIRME_ADLAR.map(ad => bindirmeler[ad]).filter(Boolean).map(b => {
    const a = bindirmeAyar(b.ad);
    return { ad: b.ad, adGorunen: b.bot.adGorunen, mod: b.mod, dizin: b.dizin, btcAyak: b.bot.ayar.btcAyak, sermayeTavani: b.bot.ayar.sermayeTavani,
      k: a.k, kagitBakiye: a.kagitBakiye, kucukSermaye: b.bot.ayar.kucukSermaye, calisiyor: !!b.bot.durum.calisiyor };
  }) });
});
app.post('/api/sistem/yeniden-baslat', (req, res) => {
  if (!process.env.PUSULA_KONSOL_GUNLUGU) return res.status(409).json({ success: false, error: 'Pusula denetleyiciyle (kısayol / PusulaBot görevi) başlatılmamış: kapanırsa geri açılmaz.' });
  if (kararPenceresinde()) return res.status(409).json({ success: false, error: KARAR_PENCERESI_METNI });
  res.status(202).json({ success: true });
  db.addLog('INFO', '🔄 Güncelleme: sunucu yeniden başlatılıyor (denetleyici 10 sn sonra açar)');
  setTimeout(() => shutdown('güncelleme sonrası yeniden başlatma', 75), 300);
});
/**
 * 73.6 (S01): POST /api/sistem/durdur — güncelleyicinin paket kurulumu için Pusula'yı DURDURMASI (eskiden arka planda
 * `powershell -ExecutionPolicy Bypass -File pusula-sunucu.ps1 -Islem Durdur` açılıyordu; antivirüs tetikleyicisi).
 * Pusula-Durdur'un yaptığının aynısı, PowerShell'siz: "bilerek durduruldu" işareti (bekçi açmasın; içerikte "guncelleme pid=…"
 * — güncelleyici yarıda ölürse nöbetçisi bu işareti tanıyıp Pusula'yı yeniden açar, S04), PID kaydı silinir (PusulaBot
 * görevi "kendiliğinden kapandı" sanıp yeniden denemesin), sonra temiz kapanış (çıkış 0 → denetleyici de kapanır).
 * Yalnız denetleyiciyle başlatılmışsa ve karar penceresi dışında; yerel PIN kapısının arkasında (betik sistem jetonuyla geçer).
 */
app.post('/api/sistem/durdur', (req, res) => {
  if (!process.env.PUSULA_KONSOL_GUNLUGU) return res.status(409).json({ success: false, error: 'Pusula denetleyiciyle (kısayol / PusulaBot görevi) başlatılmamış: bu yoldan durdurulmaz.' });
  if (kararPenceresinde()) return res.status(409).json({ success: false, error: KARAR_PENCERESI_METNI });
  const pid = Math.max(0, parseInt((req.body && req.body.pid) || 0, 10) || 0);
  try { fs.writeFileSync(yollar.veri('pusula-durduruldu.txt'), `guncelleme pid=${pid} ${new Date().toISOString()}\r\n`, 'ascii'); }
  catch (e) { return res.status(500).json({ success: false, error: `durdurma işareti yazılamadı: ${e.message}` }); }
  try { fs.unlinkSync(yollar.veri('pusula.pid')); } catch (e) { /* yok */ }
  res.status(202).json({ success: true });
  db.addLog('INFO', '⏸️ Güncelleme: paket kurulumu için Pusula durduruluyor (güncelleyici bitince yeniden açar)');
  setTimeout(() => shutdown('güncelleme: paket kurulumu için durdurma', 0), 300);
});

// Lightweight liveness probe for supervisors / uptime monitors.
/**
 * ÖZ DENETİM (69.1, lib/ozDenetim.js, PLAN-OZ-DENETIM.md) — 5 dk'da bir 19 denetim; güvenli onarım, güvenli kip, tam kapanma
 * (= bot ENGEL'i). Panel: Sistem › Sağlık (#/saglik) + ana sayfa "Sistem sağlığı" kartı. Demo kipindeki bota (demo kabul,
 * 2026-12-09'a kadar) hiçbir şey yapmaz — yalnız haber. Araştırma modunda ÇALIŞMAZ (botlar sunucuda; panel sunucunun
 * /api/saglik/oz yanıtını okur — lib/evOkuma.js EV_YOLU).
 *   GET  /api/saglik/oz                         anlık görüntü + son 30 günün olayları
 *   POST /api/saglik/oz/yokla                   şimdi yokla
 *   POST /api/saglik/oz/:ad/guvenli-kip-kaldir  güvenli kipi elle kaldır (tam kapanma: /api/bindirme/:ad/engel-kaldir)
 *   69.2: POST /api/saglik/kara-kutu/:ad (olay raporu şimdi; ad = bot ya da "sistem") · GET /api/saglik/kara-kutu/dosya/:dosya (indir)
 *         bağdaştırıcı + bilgisayar (lib/sunucuBilgisayari.js) + borsaTakvimi (lib/borsaTakvimi.js) + karaKutuVeri.
 */
const { OzDenetim } = require('./lib/ozDenetim');
async function ozAgOlc() {
  const al = async (url, o = {}) => { const bas = Date.now(); const r = await fetch(url, { signal: AbortSignal.timeout(8000), ...o }); return { r, sure: Date.now() - bas }; };
  const sonuc = { binance: false, github: false, saatFarkMs: null, gecikmeMs: null, fiyat: {} };
  await Promise.all([
    (async () => {
      try {
        const { r, sure } = await al('https://fapi.binance.com/fapi/v1/time');
        const j = await r.json();
        if (Number.isFinite(j.serverTime)) { sonuc.binance = true; sonuc.gecikmeMs = sure; sonuc.saatFarkMs = Date.now() - sure / 2 - j.serverTime; }
      } catch { /* ulaşılamadı */ }
      try { const { r } = await al('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'); const j = await r.json(); const f = +j.markPrice; if (f > 0) { sonuc.fiyat.binance = f; sonuc.binance = true; } } catch { /* */ }
    })(),
    (async () => { try { const { r } = await al('https://github.com', { method: 'HEAD' }); sonuc.github = r.status < 500; } catch { /* */ } })(),
    (async () => {
      try { const { r } = await al('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT'); const j = await r.json(); const f = +(j.data && j.data[0] && j.data[0].last); if (f > 0) { sonuc.fiyat.ikinci = f; sonuc.fiyat.ikinciAd = 'OKX'; } } catch { /* */ }
    })(),
  ]);
  return sonuc;
}
const KILIT_YOLU = () => yollar.programVeri(__dirname, 'guncelleme.kilit');
const ozCalistir = (komut, args, o = {}) => new Promise((coz) => {
  require('child_process').execFile(komut, args, { timeout: o.sure || 20000, windowsHide: true, encoding: 'utf8', maxBuffer: 4 << 20 },
    (e, out, err) => coz({ kod: e ? (Number.isInteger(e.code) ? e.code : 1) : 0, cikti: `${out || ''}${err || ''}` }));
});
/** 69.2 kara kutu: o anın sunucu tarafı (bot ve yürütücü özeti, son 30 dk günlük, güncelleme). Sır yok (özetlerde anahtar bulunmaz). */
function ozKaraKutuVeri(b, o = {}) {
  const guvenli = (fn) => { try { return fn(); } catch (e) { return { hata: e.message }; } };
  const simdi = Date.now(), sinir = simdi - (o.gunlukMs || 30 * 60000);
  const gunluk = [];
  for (const g of [...new Set([new Date(sinir).toISOString().slice(0, 10), new Date(simdi).toISOString().slice(0, 10)])]) {
    let metin = '';
    try { metin = fs.readFileSync(yollar.veri('gunluk', `${g}.jsonl`), 'utf8'); } catch { continue; }
    for (const satir of metin.split('\n')) {
      if (!satir.trim()) continue;
      let x; try { x = JSON.parse(satir); } catch { continue; }
      const t = Date.parse(x.t || x.zaman);
      if (t >= sinir) gunluk.push({ t: x.t || x.zaman, s: x.s || x.seviye, m: String(x.m || x.mesaj || '').slice(0, 600) });
    }
  }
  return {
    surum: APP_VERSION, commit: COMMIT, ayarIzi: ayarIzi(), sistem: { bellekMB: Math.round(process.memoryUsage().rss / 1048576), acikSn: Math.round(process.uptime()), disk: diskDurumu() },
    botOzet: b ? guvenli(() => b.bot.ozet()) : null, yurutucu: b ? guvenli(() => b.y.ozet()) : null,
    kolEngel: b && b.bot.kol && b.bot.kol.durum ? b.bot.kol.durum.engel || null : null,
    guncelleme: guvenli(() => { const d = guncelleme.durumOku(__dirname); return { durum: d.durum, kurulu: d.kurulu || null, kontrol: d.kontrol || null, neden: d.neden || null, kuruDeneme: d.kuruDeneme || null }; }),
    gunluk: gunluk.slice(-400),
  };
}
const ozDenetim = new OzDenetim({
  dizin: yollar.veri('oz-denetim'), bildirici: portfoyBildirici, kaydet: (sv, m) => db.addLog(sv, m),
  ctx: {
    botlar: () => BINDIRME_ADLAR.map(ad => bindirmeler[ad]).filter(Boolean).map(b => ({ ad: b.ad, mod: b.mod, adGorunen: b.bot.adGorunen, dizin: b.dizin,
      etiket: bindirmeArastirma.STRATEJILER[b.ad].ad.toLocaleUpperCase('tr-TR') + (b.mod === 'demo' ? '·DEMO' : ''), bot: b.bot, y: b.y })),
    disk: () => { try { const st = fs.statfsSync(__dirname); return { bosGB: +((st.bavail * st.bsize) / 1e9).toFixed(1), toplamGB: +((st.blocks * st.bsize) / 1e9).toFixed(1) }; } catch (e) { return { hata: e.message }; } },
    bellekMB: () => Math.round(process.memoryUsage().rss / 1048576),
    denetleyici: () => { try { return JSON.parse(fs.readFileSync(yollar.veri('denetleyici.json'), 'utf8')); } catch { return null; } },
    denetleyiciVar: () => !!process.env.PUSULA_KONSOL_GUNLUGU,
    kilit: () => {
      let st; try { st = fs.statSync(KILIT_YOLU()); } catch { return null; }
      let pid = null, yasiyor = false;
      try { pid = parseInt(fs.readFileSync(KILIT_YOLU(), 'utf8'), 10); if (pid > 0) { process.kill(pid, 0); yasiyor = true; } } catch (e) { yasiyor = !!(e && e.code === 'EPERM'); }
      return { zaman: st.mtimeMs, pid, yasiyor };
    },
    kilitSil: () => { fs.rmSync(KILIT_YOLU(), { force: true }); db.addLog('WARN', '[ÖZ DENETİM] sahipsiz güncelleme kilidi silindi'); return true; },
    ayarBozuk: () => [loadConfig._yedekten, SIRLAR_BOZUK, SIRLAR_KILITLI],
    sirKasasi: () => ({ sifreli: sirKasasi.sifreliMi(SECRETS_PATH), etkin: sirKasasi.etkinMi(), kilitli: SIRLAR_KILITLI, var: fs.existsSync(SECRETS_PATH),
      // 69.6: kapsam (CurrentUser beklenir), düz kip (PUSULA_SIR_DUZ=1) ve diğer kasa dosyaları (düz kalan var mı)
      kapsam: sirKasasi.kapsamOku(SECRETS_PATH), duzKip: sirKasasi.duzKipMi(),
      duzKalan: sirKasasi.KASA_DOSYALARI.filter(ad => ad !== 'secrets.json' && fs.existsSync(yollar.veri(ad)) && !sirKasasi.sifreliMi(yollar.veri(ad))) }),
    yedek: () => { try { return JSON.parse(fs.readFileSync(yollar.veri('yedek-ayar.json'), 'utf8')); } catch { return null; } },
    guncelleme: () => { const d = guncelleme.durumOku(__dirname); return { durum: d.durum, mesaj: d.neden, calisan: APP_VERSION, commit: COMMIT, ayarIzi: ayarIzi(), yarida: !!(d.islem && !d.islem.bitti && !guncelleme.kilitVar(__dirname)),
      // 69.6 imza: son kontrolün sonucu; yoksa imza dosyası var mı
      imza: (d.imza && d.imza.durum && d.imza.durum !== 'atlandi') ? d.imza.durum : (fs.existsSync(guncelleme.imzaDosyasi(__dirname)) ? 'kurulu' : 'kurulmadi') }; },
    telegram: () => ({ ...portfoyBildirici.durum(), gecmis: portfoyBildirici.gecmis, kuyruk: portfoyBildirici._kuyrukOku().length,
      komut: (() => { try { return telegramYoklayici.durum(); } catch { return null; } })() }),   // 73.6 (S05) komut yoklaması
    sinyal: () => [...BINDIRME_ADLAR.map(ad => ({ ad: bindirmeArastirma.STRATEJILER[ad].ad, ...saglikBotlar[ad].durum() })), { ad: 'sunucu', sunucu: true, ...saglikSunucu.durum() }],
    kalp: (b) => isletim.kalpOku(b.dizin),
    gunlukDizin: () => yollar.veri('gunluk'),
    ag: ozAgOlc,
    // 69.6: güvenlik ölçümü de (antivirüs, güvenlik duvarı, port, RDP, Pusula klasör izinleri)
    bilgisayar: () => require('./lib/sunucuBilgisayari').olc(ozCalistir, process.platform),
    borsaTakvimi: () => require('./lib/borsaTakvimi').getir(fetch),
    // 69.3 funding: tek istek, tüm semboller (anahtarsız) → { oranlar: { ETHUSDT: 0.0001, … } }
    funding: async () => {
      const r = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex', { signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const l = await r.json();
      const oranlar = {};
      for (const x of Array.isArray(l) ? l : []) { const v = +x.lastFundingRate; if (x.symbol && Number.isFinite(v)) oranlar[x.symbol] = v; }
      return { oranlar };
    },
    karaKutuVeri: ozKaraKutuVeri,
    // 69.4 npm audit (günde bir; ücretsiz kayıt hizmeti) — çalışan Node'un yanındaki npm
    npmAudit: () => new Promise((coz) => {
      const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
      if (!fs.existsSync(cli)) return coz({ hata: 'npm bulunamadı' });
      require('child_process').execFile(process.execPath, [cli, 'audit', '--omit=dev', '--json'], { cwd: __dirname, timeout: 90000, windowsHide: true, maxBuffer: 32 << 20 }, (e, out) => {
        try { const j = JSON.parse(out); coz({ acik: (j.metadata && j.metadata.vulnerabilities) || {}, paketler: Object.entries(j.vulnerabilities || {}).filter(([, v]) => ['high', 'critical'].includes(v.severity)).map(([k, v]) => `${k} (${v.severity === 'critical' ? 'kritik' : 'yüksek'})`) }); }
        catch { coz({ hata: e ? e.message : 'çıktı okunamadı' }); }
      });
    }),
    // 69.4 ikinci ölü adam (Better Stack ücretsiz heartbeat ya da başka bir healthchecks hesabı): 5 dk'da bir GET
    ikinciSinyal: async () => {
      const u = ikinciKanal().sinyalUrl;
      if (!u || ARASTIRMA_MODU) return { atlandi: true };
      const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
      return { ok: r.ok, hata: r.ok ? null : `HTTP ${r.status}` };
    },
    yenidenBaslat: (sebep) => {
      if (!process.env.PUSULA_KONSOL_GUNLUGU) throw new Error('Pusula denetleyicisiz başlatılmış — kapanırsa geri açılmaz');
      db.addLog('WARN', `🔄 ${sebep} — Pusula yeniden başlatılıyor (denetleyici birkaç saniye sonra açar)`);
      setTimeout(() => shutdown(sebep, 75), 1500).unref();
      return true;
    },
  },
});
if (!ARASTIRMA_MODU) {
  const asilAddLog = db.addLog.bind(db);
  db.addLog = (seviye, mesaj) => { asilAddLog(seviye, mesaj); try { ozDenetim.gunlukGozle(seviye, mesaj); } catch { /* gözlem işi durdurmaz */ } };
  // 73.6 (S12): önceki süreç TEMİZ kapandıysa (güncelleme / panelden yeniden başlatma / Pusula'yı durdur — kapat() işareti) açılış planlıdır.
  ozDenetim.acilisKaydet({ planli: sonKapanisPlanliMi() });
  ozDenetim.baslat();
}
app.get('/api/saglik/oz', (req, res) => {
  res.json({ success: true, calisiyor: !ARASTIRMA_MODU, ...ozDenetim.goruntu(), olaylar: ozDenetim.olaylar(30), karaKutular: ozDenetim.karaKutular(30) });
});
/** 69.4 İkinci uyarı kanalı: GET durum (maskeli) · POST kaydet { ntfyKonu, sinyalUrl } · POST /dene (ntfy'a deneme iletisi). */
app.get('/api/saglik/ikinci-kanal', (req, res) => {
  const k = ikinciKanal();
  const maske = (s) => (s ? `${String(s).slice(0, 4)}…${String(s).slice(-3)}` : null);
  res.json({ success: true, ntfy: { ayarli: !!k.konu, maske: maske(k.konu) }, sinyal: { ayarli: !!k.sinyalUrl, maske: k.sinyalUrl ? String(k.sinyalUrl).replace(/^(https?:\/\/[^/]+\/).*$/, '$1…') : null },
    son: (portfoyBildirici.ikinciGecmis || []).slice(-5) });
});
app.post('/api/saglik/ikinci-kanal', (req, res) => {
  if (ARASTIRMA_MODU) return res.status(409).json({ success: false, error: 'İkinci kanal sunucuda ayarlanır — bu bilgisayar geliştirme kopyası.' });
  const g = req.body || {};
  const k = { ...((loadSecrets().ikinciKanal) || {}) };
  if ('ntfyKonu' in g) {
    const v = String(g.ntfyKonu || '').trim();
    if (v && !/^[A-Za-z0-9_-]{12,64}$/.test(v)) return res.status(400).json({ success: false, error: 'ntfy konusu 12–64 harf/rakam/-/_ olmalı (tahmin edilemeyecek uzunlukta seçin; konuyu bilen herkes iletileri görebilir).' });
    if (v) k.ntfyKonu = v; else delete k.ntfyKonu;
  }
  if ('sinyalUrl' in g) {
    const v = String(g.sinyalUrl || '').trim();
    if (v && !/^https:\/\/[^\s]{8,300}$/.test(v)) return res.status(400).json({ success: false, error: 'ikinci ölü adam adresi https:// ile başlamalı (Better Stack heartbeat ya da healthchecks ping adresi).' });
    if (v && [config.healthchecksUrl, config.healthchecksSunucuUrl].includes(v)) return res.status(400).json({ success: false, error: 'ikinci ölü adam, mevcut healthchecks adreslerinden FARKLI olmalı (bağımsız ikinci izleyici).' });
    if (v) k.sinyalUrl = v; else delete k.sinyalUrl;
  }
  try { const s = loadSecrets(); if (Object.keys(k).length) s.ikinciKanal = k; else delete s.ikinciKanal; saveSecrets(s); }
  catch (e) { return res.status(500).json({ success: false, error: e.message }); }
  db.addLog('INFO', `[İŞLETİM] ikinci uyarı kanalı güncellendi: ntfy ${k.ntfyKonu ? 'ayarlı' : 'yok'} · ikinci ölü adam ${k.sinyalUrl ? 'ayarlı' : 'yok'}`);
  res.json({ success: true });
});
app.post('/api/saglik/ikinci-kanal/dene', async (req, res) => {
  const r = await portfoyBildirici._ikinci('uyari', 'deneme iletisi', ['Bu ileti Telegram\'dan bağımsız ikinci kanaldan (ntfy) geldi. Telegram düşerse ACİL uyarılar buradan da gelir.']);
  if (r.atlandi) return res.status(400).json({ success: false, error: 'ntfy konusu ayarlı değil' });
  res.status(r.ok ? 200 : 502).json({ success: !!r.ok, error: r.ok ? null : `ntfy'a gönderilemedi: ${r.hata}` });
});

app.post('/api/saglik/kara-kutu/:ad', (req, res) => {
  if (ARASTIRMA_MODU) return res.status(409).json({ success: false, error: 'Olay raporu sunucuda yazılır — bu bilgisayar geliştirme kopyası.' });
  const b = req.params.ad === 'sistem' ? null : bindirmeler[req.params.ad];
  if (req.params.ad !== 'sistem' && !b) return res.status(404).json({ success: false, error: `bilinmeyen bot: ${req.params.ad}` });
  const dosya = ozDenetim.karaKutu(b ? { ad: b.ad, adGorunen: b.bot.adGorunen, mod: b.mod, bot: b.bot, y: b.y } : null, 'elle', 'panelden elle istendi');
  if (!dosya) return res.status(500).json({ success: false, error: 'rapor yazılamadı' });
  res.json({ success: true, dosya, karaKutular: ozDenetim.karaKutular(30) });
});
app.get('/api/saglik/kara-kutu/dosya/:dosya', (req, res) => {
  const y = ozDenetim.karaKutuYolu(req.params.dosya);
  if (!y) return res.status(404).json({ success: false, error: 'rapor bulunamadı' });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(y)}"`);
  res.send(fs.readFileSync(y, 'utf8'));
});
app.post('/api/saglik/oz/yokla', async (req, res) => {
  if (ARASTIRMA_MODU) return res.status(409).json({ success: false, error: 'Öz denetim sunucuda çalışır — bu bilgisayar geliştirme kopyası.' });
  try { await ozDenetim.yokla({ zorla: true }); res.json({ success: true, ...ozDenetim.goruntu(), olaylar: ozDenetim.olaylar(30) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post('/api/saglik/oz/:ad/guvenli-kip-kaldir', (req, res) => {
  const b = bindirmeler[req.params.ad];
  if (!b) return res.status(404).json({ success: false, error: `bilinmeyen bot: ${req.params.ad}` });
  const g = b.bot.guvenliKipKaldir();
  if (g) { try { ozDenetim.onayVerildi(b.ad); } catch { /* */ } }   // 73.6 (Y-02): sayaçlar bu andan sonrasını sayar
  res.json({ success: true, kaldirilan: g, bot: b.bot.ozet() });
});

app.get('/api/health', (req, res) => {
  const bots = engine.getBots();
  const risk = engine.riskManager.getStatus();
  const stale = engine.lastState
    ? (Date.now() - (engine.lastTickAt || 0)) > 60000
    : true;

  const healthy = engine.isRunning && !risk.killSwitchTriggered && !(bots.length > 0 && stale);

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    appVersion: APP_VERSION, commit: COMMIT, ayarIzi: ayarIzi(),
    // Panel başlığındaki "Araştırma modu" rozeti ve devre dışı bot/borsa/emir düğmeleri (public/js/pages/kabuk.js).
    arastirmaModu: ARASTIRMA_MODU,
    // 68.1 (PLAN-TASIMA F3): araştırma eklentisi yoksa panel Araştırma menüsünü gizler; taşıma sonrası botlar mutabakat bekler.
    arastirmaEklentisi: tasimaLib.eklentiDurumu().yuklu,
    tasimaBekliyor: !!tasimaLib.bekleyenOku(),
    // Y7 (61.8): güncelleyicinin kararlılık penceresi — güncellemeden önce bağlı olan bot sonra da bağlı olmalı.
    bindirme: BINDIRME_ADLAR.map(ad => { const b = bindirmeler[ad]; return b ? { ad, mod: b.mod, calisiyor: !!b.bot.durum.calisiyor, bagli: !!b.y.borsa } : { ad }; }),
    // O7 (61.8): boş disk (GB) — 10 GB altında günlük Telegram uyarısı.
    disk: diskDurumu(),
    // 61.7: araştırma modunda bot/işlem ekranlarının kaynağı (sunucudaki panel mi, yerel eski kopya mı) — jeton dönmez.
    evBaglanti: ARASTIRMA_MODU ? evOkuma.bilgi() : null,
    // Telefon kademesi (60.5): panel yazma düğmelerini kilitler, bot kartında PIN'li "Acil durdur" (js/pages/kabuk.js, botlar.js).
    kademe: req.kademe || 'yerel',
    acilPin: (({ tanimli, kilitli, kalanHak }) => ({ tanimli, kilitli, kalanHak }))(acilPin.durum()),
    // Ayarlar › Bu bilgisayar (denetim A-18): telefon jetonu tanımlı mı (değeri DEĞİL).
    telefonJeton: !!guvenlik.jetonVar(),
    uptimeSec: Math.round(process.uptime()),
    engineRunning: engine.isRunning,
    bots: bots.length,
    lastTickAgoSec: engine.lastTickAt ? Math.round((Date.now() - engine.lastTickAt) / 1000) : null,
    killSwitch: risk.killSwitchTriggered,
    memoryMB: Math.round(process.memoryUsage().rss / 1048576)
  });
});

// Bot State & Status
app.get('/api/status', (req, res) => {
  res.json({
    appVersion: APP_VERSION,
    isRunning: engine.isRunning,
    state: engine.getState(),
    stats: db.getStats()
  });
});

/**
 * Gösterge havuzu kataloğu — grafik katmanının ve gösterge sayfasının kaynağı.
 *
 * Parametreler tipli döndüğü için form OTOMATİK üretilir: 52 göstergeye elle
 * form yazmak sürdürülemez. `render` her çıktının nereye çizileceğini söyler
 * (fiyat paneli / kendi paneli, çizgi / işaretçi / kutu / seviye).
 */
app.get('/api/indicators', (req, res) => {
  const pool = require('./lib/indicatorPool');
  const defs = pool.describe();

  // BOTLAR DA GÖSTERGE OLARAK LİSTELENİR (`bot:` öneki).
  //
  // Amaç grafikte "bot ne gördü ve ne yaptı"yı doğrudan görebilmek: kendi
  // stopu, kendi bantları, girdiği yerler ve GİRMEDİĞİ yerler (yutulan
  // sinyaller). Ayrı bir arayüz yazmak yerine gösterge katmanına takılıyor —
  // form üretimi, çizim, panel ve işaretçi veri yolu zaten hazır.
  const botDefs = strategyCatalog.describe().map(s => ({
    key: `bot:${s.key}`,
    label: `Bot: ${s.label}`,
    group: 'bot',
    kind: 'events',
    multi: false,
    outputs: ['stop', 'bbUpper', 'bbLower', 'direction', 'z',
      'entries', 'ladderTp', 'extremeExit', 'stopExit', 'trendExit', 'exits', 'blocked'],
    seriesOutputs: ['stop', 'bbUpper', 'bbLower', 'direction', 'z'],
    sparseOutputs: [],
    params: s.params,
    dependsOn: [],
    warmup: 0,
    render: {
      stop: { pane: 'price', as: 'line', series: true, sparse: false, label: 'Takip eden stop' },
      bbUpper: { pane: 'price', as: 'line', series: true, sparse: false, label: 'BB üst' },
      bbLower: { pane: 'price', as: 'line', series: true, sparse: false, label: 'BB alt' },
      direction: { pane: 'own', as: 'line', series: true, sparse: false, label: 'Yön (1/-1)' },
      z: { pane: 'own', as: 'line', series: true, sparse: false, label: 'Sapma (z)' },
      entries: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Girişler ▲' },
      ladderTp: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Kademeli TP ■ (üst band)' },
      extremeExit: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Ekstrem sapma çıkışı ●' },
      stopExit: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Stop / breakeven ▼' },
      trendExit: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Trend dönüşü ▼' },
      exits: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Diğer çıkışlar ▼' },
      blocked: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Girilmeyen sinyaller ○' }
    },
    note: `${s.note || ''} — Grafikte: stop ve bantlar çizgi, girişler/çıkışlar ok, yutulan sinyaller içi boş daire.`.trim()
  }));

  res.json({
    success: true,
    count: defs.length + botDefs.length,
    groups: { ...pool.groups(), bot: botDefs.map(b => b.key) },
    indicators: [...defs, ...botDefs]
  });
});

/**
 * Bir botu grafik katmanı için "gösterge" haline getirir.
 *
 * Backtester'ı iz açık koşturur ve iki şeyi birden döndürür:
 *   · bar bazlı seriler — stratejinin O BARDA GÖRDÜĞÜ kendi değerleri
 *   · işaretçiler — girişler, çıkışlar ve GİRİLMEYEN sinyaller
 *
 * Sonuncusu asıl istenen: "burada neden girmedi" sorusu grafikte, gerekçesiyle
 * birlikte görünüyor. Sinyal izi tablosu aynı bilgiyi veriyordu ama barla
 * eşleştirmek gözle mümkün değildi.
 */
function runBotOverlay(strategyKey, params, candles, timeframe) {
  const taban = (config.strategies && config.strategies[strategyKey]) || {};
  const stratConfig = { ...taban, ...params, marketType: config.marketType || 'spot' };

  const res = Backtester.run(strategyKey, stratConfig, candles, 10000, timeframe, {
    trace: true,
    traceBars: true
  });

  const n = candles.length;
  const seri = (ad) => {
    const out = new Array(n).fill(null);
    for (const b of (res.trace.bars || [])) {
      const v = b[ad];
      if (Number.isFinite(v)) out[b.i] = v;
    }
    return out;
  };

  // İşaretler GERÇEK İŞLEMLERDEN türetilir, yalnızca strateji sinyallerinden
  // değil: stop ve breakeven çıkışları risk yöneticisinden gelir ve sinyal
  // izinde HİÇ görünmez. Sadece izi kullanmak, grafikte "pozisyon nasıl
  // kapandı" sorusunu cevapsız bırakıyordu.
  const zamanIndeks = new Map();
  candles.forEach((c, i) => zamanIndeks.set(c.time, i));
  const barIndeksi = (isoZaman) => {
    const ms = Date.parse(isoZaman);
    if (!Number.isFinite(ms)) return null;
    if (zamanIndeks.has(ms)) return zamanIndeks.get(ms);
    // Zaman damgası tam oturmazsa en yakın barı bul.
    let en = null, enFark = Infinity;
    for (const [t, i] of zamanIndeks) {
      const f = Math.abs(t - ms);
      if (f < enFark) { enFark = f; en = i; }
    }
    return en;
  };

  const islemler = res.trades || [];
  const isaretle = (filtre, tip, shape, direction) => islemler.filter(filtre).map(t => {
    const alim = String(t.type) === 'BUY';
    const idx = barIndeksi(alim ? t.entryTime : t.exitTime);
    return idx === null ? null : {
      index: idx,
      confirmedAt: idx,
      direction,
      type: tip,
      shape,
      price: alim ? t.entryPrice : t.exitPrice,
      profitUSDT: t.profitUSDT,
      reason: t.reason
    };
  }).filter(Boolean);

  // Kapanış etiketi yön duyarlı: long SELL, short COVER.
  const kapanis = (t) => /^(SELL|COVER)/.test(String(t.type));
  const sebep = (re) => (t) => kapanis(t) && re.test(t.reason || '');

  return {
    stop: seri('stop'),
    bbUpper: seri('bbUpper'),
    bbLower: seri('bbLower'),
    direction: seri('dir'),
    z: seri('z'),
    entries: isaretle(t => String(t.type) === 'BUY' || String(t.type) === 'SHORT', 'GİRİŞ', 'arrowUp', 'bullish'),
    // Kademeli TP'nin kendi işareti var: nihai çıkışla aynı oku kullanmak
    // ikisini ayırt edilemez kılıyordu (kullanıcı "kademeli satış yerleri
    // görünmüyor" derken tam olarak bunu görüyordu).
    ladderTp: isaretle(sebep(/Kademeli TP/), 'KADEMELİ TP', 'square', 'bearish'),
    extremeExit: isaretle(sebep(/Ekstrem/), 'EKSTREM', 'circle', 'bearish'),
    stopExit: isaretle(sebep(/STOP|Stop|Breakeven|BREAKEVEN/), 'STOP', 'arrowDown', 'bearish'),
    trendExit: isaretle(sebep(/trend dönüşü/), 'TREND DÖNÜŞÜ', 'arrowDown', 'bearish'),
    exits: isaretle(
      t => kapanis(t)
        && !/Kademeli TP|Ekstrem|STOP|Stop|Breakeven|BREAKEVEN|trend dönüşü/.test(t.reason || ''),
      'ÇIKIŞ', 'arrowDown', 'bearish'
    ),
    blocked: (res.trace.signals || []).filter(s => !s.executed).map(s => ({
      index: s.index, confirmedAt: s.index, direction: s.action === 'BUY' ? 'bullish' : 'bearish',
      type: 'GİRİLMEDİ', shape: 'circle', reason: s.reason, blockedBy: s.blockedBy || null
    })),
    _meta: {
      key: `bot:${strategyKey}`,
      params: stratConfig,
      warmup: (res.warmup && res.warmup.bars) || 0,
      trades: res.totalTrades,
      // İşaret eşlemesi tanısı: işaretler boş çıkarsa sebebi burada görünür
      // (işlem yok mu, zaman damgası bara oturmuyor mu).
      markerDebug: {
        tradeRecords: islemler.length,
        firstType: islemler[0] ? String(islemler[0].type) : null,
        firstTime: islemler[0] ? (islemler[0].entryTime || islemler[0].exitTime) : null,
        firstIndex: islemler[0] ? barIndeksi(islemler[0].entryTime || islemler[0].exitTime) : null,
        candleTimeSample: candles[0] ? candles[0].time : null
      },
      returnPct: res.totalReturnPct,
      signals: res.trace.totalSignals,
      blockedReasons: res.trace.blocked,
      warmupWarning: (res.warmup && res.warmup.warning) || null
    }
  };
}

/**
 * Gösterge hesabı — mumlarla BİRLİKTE.
 *
 * Mumları ve serileri iki ayrı istekte çekmek indeks kayması riski yaratır:
 * arada yeni bir mum kapanırsa grafik bir bara, seri başka bara oturur ve
 * havuzun tüm hizalama disiplini boşa gider. Bu yüzden tek yanıt.
 *
 * Bir gösterge hata verirse yalnızca o spec `error` ile döner; bozuk bir
 * parametre yüzünden grafiğin tamamı boş kalmaz.
 */
/**
 * Grafik mumları. Bot vadeli işlem görür: 1000PEPE/USDT gibi semboller spotta YOK (yalnız USDT-M perp).
 * Spot boş dönerse aynı sembolün perp karşılığından (X/USDT:USDT) çizilir — işlem panelinde PEPE grafiği boş kalıyordu.
 */
async function mumGetir(symbol, timeframe, limit) {
  const m = await engine.exchange.fetchOHLCV(symbol, timeframe, limit);
  if ((m && m.length) || !/^[A-Z0-9]+\/USDT$/.test(symbol)) return m;
  return engine.exchange.fetchOHLCV(`${symbol}:USDT`, timeframe, limit);
}

app.post('/api/indicators/compute', async (req, res) => {
  try {
    const pool = require('./lib/indicatorPool');

    const symbol = req.body.symbol || config.symbol || 'BTC/USDT';
    const timeframe = KNOWN_TIMEFRAMES.includes(req.body.timeframe) ? req.body.timeframe : (config.timeframe || '1h');
    const limit = Math.min(Math.max(parseInt(req.body.limit) || 500, 30), 5000);
    const specs = Array.isArray(req.body.specs) ? req.body.specs : [];

    const candles = await mumGetir(symbol, timeframe, limit);
    if (!candles || candles.length === 0) {
      return res.status(503).json({ success: false, error: `${symbol} (${timeframe}) için mum verisi alınamadı.` });
    }

    const results = {};
    for (const spec of specs) {
      if (!spec || !spec.key) continue;
      const id = spec.id || spec.key;
      try {
        // `bot:` önekli anahtarlar havuza değil STRATEJİ koşucusuna gider.
        if (String(spec.key).startsWith('bot:')) {
          results[id] = runBotOverlay(String(spec.key).slice(4), spec.params || {}, candles, timeframe);
          continue;
        }
        const out = pool.computeOne(candles, spec.key, spec.params || {});
        // `_meta` hesap bağlamını taşır (ısınma, çözülmüş parametreler) —
        // grafik ısınma barlarını boş bırakmak için buna bakar.
        results[id] = out;
      } catch (err) {
        results[id] = { error: err.message, _meta: { key: spec.key, params: spec.params || {} } };
      }
    }

    res.json({ success: true, symbol, timeframe, count: candles.length, candles, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Çok sembollü hesap (korelasyon, beta, SMT). Ortak zaman ekseni ve elenen
 * semboller yanıtta bildirilir — bir sembolün bayat önbelleği yüzünden sessiz
 * boş sonuç dönmesi bu katmanda bir kez yaşandı, görünür olmalı.
 */
app.post('/api/indicators/compute-multi', async (req, res) => {
  try {
    const pool = require('./lib/indicatorPool');

    const timeframe = KNOWN_TIMEFRAMES.includes(req.body.timeframe) ? req.body.timeframe : (config.timeframe || '1h');
    const limit = Math.min(Math.max(parseInt(req.body.limit) || 500, 30), 5000);
    const symbols = Array.isArray(req.body.symbols) && req.body.symbols.length
      ? req.body.symbols
      : (config.watchlist || []).slice(0, 4);
    const specs = Array.isArray(req.body.specs) ? req.body.specs : [];

    if (symbols.length < 2) {
      return res.status(400).json({ success: false, error: 'Çok sembollü hesap için en az iki sembol gerekir.' });
    }

    const seriesMap = {};
    for (const sym of symbols) {
      const c = db.getCandleCache(sym, timeframe, limit);
      if (c && c.length >= 30) seriesMap[sym] = c;
    }

    const out = pool.computeMulti(seriesMap, specs.map(s => ({ key: s.key, params: s.params || {}, as: s.id || s.key })));
    res.json({ success: true, timeframe, symbols: out._symbols, times: out._times, dropped: out._dropped, limitedBy: out._limitedBy, results: out });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Panelin Stratejiler listesindeki ölçüm rozeti: `lib/research/adaylar.js`
 * kaydından. Donchian'ın katalog anahtarı `donchian_trend`, ölçüm kaydı
 * `donchian_portfoy` (canlıda koşan portföy modu). Kaydı olmayan strateji
 * 'ÖLÇÜLMEDİ'.
 */
const ADAY_KATALOG = { donchian_portfoy: 'donchian_trend' };
function olcumDurumu(key) {
  const aday = ADAYLAR.find(a => (ADAY_KATALOG[a.anahtar] || a.anahtar) === key);
  return aday ? aday.durum : 'ÖLÇÜLMEDİ';
}

/**
 * Strateji kataloğu. Panel listeleri buradan kurulur — üç ayrı `<select>`
 * elle tutuluyordu ve üçü de birbirinden farklıydı (hiçbirinde `regime_trend`
 * yoktu). `archived: true` olanlar eski 7 strateji: silinmiyorlar, kontrol
 * grubu olarak kalıyorlar; panelde ayrı grupta listelenir.
 */
app.get('/api/strategies', (req, res) => {
  res.json({
    success: true,
    strategies: strategyCatalog.describe().map(s => ({ ...s, durum: olcumDurumu(s.key) })),
    active: strategyCatalog.activeKeys(),
    archived: strategyCatalog.archivedKeys()
  });
});

/**
 * Bir stratejinin KAYDEDİLMİŞ ayarları. Kayıt yoksa boş nesne.
 *
 * `config.strategies` bir stratejinin VAR OLUP OLMADIĞININ kaydı değildir,
 * yalnızca kullanıcının değiştirdiği ayarlardır. Yeni içe aktarılan bir
 * Pine botunun burada kaydı olmaz ve olmaması normaldir — strateji kendi
 * varsayılanlarını kullanır. Varlık sorusunun tek cevabı `strategyCatalog`.
 */
function ayarlariAl(anahtar) {
  return (config.strategies && config.strategies[anahtar]) || {};
}

/**
 * Optimizasyon planı: hangi parametreler aranabilir, hangileri arandı, kaç
 * kombinasyon eder. Panel bunu göstermezse kullanıcı "optimize ettim" der
 * ama neyin arandığını bilmez — 14 parametreli bir botta 4'ünün arandığını
 * bilmemek sonucu yanlış okutur.
 */
function optimizasyonPlani(anahtar, baseConfig) {
  const kayit = strategyCatalog.get(anahtar);
  const Sinif = kayit && kayit.Class;
  if (Sinif && typeof Sinif.optimizePlan === 'function') {
    try { return Sinif.optimizePlan(baseConfig); } catch (err) { return null; }
  }
  // Elle yazılmış stratejiler ızgaralarını kendileri bildirir.
  const izgara = Sinif && Sinif.optimizeGrid;
  if (!izgara) return { izgara: {}, secilen: [], aday: [], toplam: 0 };
  const duz = typeof izgara === 'function' ? (izgara(baseConfig) || {}) : izgara;
  const anahtarlar = Object.keys(duz);
  return {
    izgara: duz,
    secilen: anahtarlar,
    aday: anahtarlar,
    toplam: anahtarlar.reduce((a, k) => a * (Array.isArray(duz[k]) ? duz[k].length : 1), 1)
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * PINE İÇE AKTARMA
 *
 * `/inspect` KAYDETMEDEN önce raporlar: hangi parametreler bulundu, hangi
 * satırlar çevrilemiyor. Kullanıcı "kaydet" demeden neyin çalışmayacağını
 * görmeli — yarısı çevrilmiş bir strateji doğru görünen yanlış sayı üretir.
 * ───────────────────────────────────────────────────────────────────────── */
app.post('/api/pine/inspect', (req, res) => {
  try {
    const { kaynak } = req.body || {};
    if (typeof kaynak !== 'string' || !kaynak.trim()) {
      return res.status(400).json({ success: false, error: 'Betik boş' });
    }
    const bilgi = pineInspect(kaynak);
    // `agac` yanıta konmaz: büyüktür ve panelde işi yoktur.
    const { agac, ...ozet } = bilgi;
    void agac;
    res.json({
      success: true,
      bilgi: ozet,
      derlenir: bilgi.tur === 'strategy' && bilgi.desteklenmeyen.length === 0
    });
  } catch (err) {
    // Ayrıştırma hatası bir SONUÇTUR, sunucu hatası değil: satır numarasıyla
    // birlikte 200 döner ki panel onu form hatası gibi gösterebilsin.
    res.json({ success: true, bilgi: null, derlenir: false, ayristirmaHatasi: err.message });
  }
});

app.get('/api/pine', (req, res) => {
  try {
    res.json({ success: true, betikler: pineStore.listele() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/pine/:anahtar', (req, res) => {
  let kaynak;
  try { kaynak = pineStore.kaynakOku(req.params.anahtar); } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  if (kaynak === null) return res.status(404).json({ success: false, error: 'Betik bulunamadı' });
  res.json({ success: true, anahtar: req.params.anahtar, kaynak });
});

app.post('/api/pine/save', (req, res) => {
  try {
    const { kaynak, anahtar } = req.body || {};
    const r = pineStore.kaydet(kaynak, { anahtar });
    db.addLog('SUCCESS', `📥 Pine betiği ${r.guncelleme ? 'güncellendi' : 'kaydedildi'}: ${r.etiket} (${r.anahtar}, ${r.parametre} parametre)`);
    res.json({ success: true, ...r });
  } catch (err) {
    db.addLog('WARN', `Pine betiği kaydedilemedi: ${err.message}`);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/pine/:anahtar', (req, res) => {
  try {
    const anahtar = req.params.anahtar;
    // Silinen strateji çalışan bir bota bağlıysa önce onu durdur — yoksa
    // motor her tikte "bilinmeyen strateji" ile çakılırdı.
    const durdurulan = engine.stopBotsByStrategy ? engine.stopBotsByStrategy(anahtar) : 0;
    const vardi = pineStore.sil(anahtar);
    if (!vardi) return res.status(404).json({ success: false, error: 'Betik bulunamadı' });
    db.addLog('INFO', `🗑️ Pine betiği silindi: ${anahtar}${durdurulan ? ` (${durdurulan} bot durduruldu)` : ''}`);
    res.json({ success: true, anahtar, durdurulanBot: durdurulan });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── BORSA (canlı / testnet) ────────────────────────────────────────────────
const borsaHata = (res, err, kod = 400) => res.status(kod).json({ success: false, error: err.message || String(err) });

app.get('/api/exchange/status', (req, res) => {
  res.json({ success: true, exchangeMode: borsaModu(), yurutucu: canli.ozet(), bot: donchianBot.ozet(),
    anahtarlar: { live: !!(config.apiKey && config.apiSecret), testnet: !!(config.testnetApiKey && config.testnetApiSecret) },
    canliIzin: config.canliIzin === true });
});

/**
 * GERÇEK PARA KAPALI (karar Ö16, denetim A-01): canlı (live) bağlantı yalnız config.json'da `canliIzin: true` iken
 * kurulur — PLAN-GERCEK-PARA-2027 G1–G9 sağlanmadan ve kullanıcı bu bayrağı bilinçli açmadan tek tıkla gerçek paraya
 * bağlanılmasın. Bilinmeyen ortam adı da reddedilir (önceden "testnet" dışındaki her değer canlı anahtarı kullanıyordu).
 */
app.post('/api/exchange/connect', async (req, res) => {
  const { ortam, onay } = req.body || {};
  try {
    if (ortam !== 'testnet' && ortam !== 'live') throw new Error('ortam "testnet" (demo hesap) ya da "live" olmalı');
    if (ortam === 'live' && config.canliIzin !== true) {
      return res.status(403).json({ success: false, error: 'Gerçek para modu bilinçli olarak kapalı (PLAN-GERCEK-PARA-2027: G1–G9 şartları sağlanınca açılır).' });
    }
    if (ortam === 'live' && onay !== 'CANLI') throw new Error('canlı bağlantı için onay metni "CANLI" gerekli');
    // 62.1: portföy botu gerçek paradayken aynı hesaba ikinci yürütücü bağlanmaz; demo hesapta da aynısı (D6).
    const ayniHesap = BINDIRME_ADLAR.map(ad => bindirmeler[ad]).find(b => b && ((ortam === 'live' && b.mod === 'canli') || (ortam === 'testnet' && b.mod === 'demo' && b.bot.durum.calisiyor)));
    if (ayniHesap) throw new Error(`${ayniHesap.bot.adGorunen} bu hesapta (${ortam === 'live' ? 'gerçek para' : 'demo'}) çalışıyor — aynı hesaba ikinci bağlantı açılmaz`);
    const anahtar = ortam === 'testnet'
      ? { apiKey: config.testnetApiKey, apiSecret: config.testnetApiSecret }
      : { apiKey: config.apiKey, apiSecret: config.apiSecret };
    const ozet = await canli.baglan({ ortam, ...anahtar });
    broadcast('EXCHANGE', ozet);
    res.json({ success: true, yurutucu: ozet });
  } catch (err) { borsaHata(res, err); }
});

app.post('/api/exchange/disconnect', (req, res) => {
  canli.baglantiyiKes();
  broadcast('EXCHANGE', canli.ozet());
  res.json({ success: true });
});

app.post('/api/exchange/arm', (req, res) => {
  try {
    if (req.body && req.body.kapat) canli.kilitKapat(); else canli.kilitAc(req.body && req.body.onay);
    broadcast('EXCHANGE', canli.ozet());
    res.json({ success: true, yurutucu: canli.ozet() });
  } catch (err) { borsaHata(res, err); }
});

app.post('/api/exchange/reconcile', async (req, res) => {
  try { const m = await canli.mutabakat(); if (m && !m.hata && !(m.cozulemeyen || []).length) tasimaLib.mutabakatTemiz('donchian'); res.json({ success: true, mutabakat: m, yurutucu: canli.ozet() }); }
  catch (err) { borsaHata(res, err); }
});

app.get('/api/exchange/account', async (req, res) => {
  try { res.json({ success: true, hesap: await canli.hesap() }); } catch (err) { borsaHata(res, err); }
});

/** Panelden gelen emir gövdesini sıkı biçimde okur — fazladan alan taşınmaz. */
function emirGovdesi(b = {}) {
  const e = {
    symbol: String(b.symbol || ''), side: b.side, type: b.type,
    amount: Number(b.amount), reduceOnly: b.reduceOnly === true, bot: 'pnl'
  };
  if (b.type === 'limit') e.price = Number(b.price);
  if (!canli.borsa || !canli.borsa.markets[e.symbol]) throw new Error(`sembol bilinmiyor: ${e.symbol}`);
  return e;
}

app.post('/api/exchange/preview', async (req, res) => {
  try { res.json({ success: true, onizleme: await canli.onizle(emirGovdesi(req.body)) }); }
  catch (err) { borsaHata(res, err); }
});

app.post('/api/exchange/order', async (req, res) => {
  try {
    const r = await canli.emirGonder(emirGovdesi(req.body));
    broadcast('EXCHANGE', canli.ozet());
    res.status(r.basarili ? 200 : 400).json({ success: r.basarili, error: r.sebep || null, sonuc: r });
  } catch (err) { borsaHata(res, err); }
});

app.post('/api/exchange/cancel', async (req, res) => {
  try { const k = await canli.iptal(String((req.body || {}).clientOrderId || '')); res.json({ success: true, emir: k }); }
  catch (err) { borsaHata(res, err); }
});

app.post('/api/exchange/kill', async (req, res) => {
  try {
    donchianBot.durdur();
    const rapor = await canli.acilDurdur('panel');
    broadcast('EXCHANGE', canli.ozet());
    res.json({ success: true, rapor });
  } catch (err) { borsaHata(res, err, 500); }
});

app.post('/api/exchange/bot', async (req, res) => {
  const { eylem } = req.body || {};
  try {
    // Denetim D6 (62.1): Borsa sekmesinin Donchian botu, aynı hesabı kullanan portföy botuyla birlikte çalışamaz (ters yön
    // bindirmeDemoCakisma'da vardı): demo hesapta Hücum demo'dayken, gerçek hesapta Hücum gerçek paradayken başlatma/çalıştırma reddedilir.
    if (eylem === 'baslat' || eylem === 'simdi') {
      const ayni = BINDIRME_ADLAR.map(ad => bindirmeler[ad]).find(b => b && ((canli.ortam === 'testnet' && b.mod === 'demo') || (canli.ortam === 'live' && b.mod === 'canli')));
      if (ayni) throw new Error(`${ayni.bot.adGorunen} aynı hesapta (${ayni.mod === 'demo' ? 'demo' : 'gerçek'}) çalışıyor — iki bot aynı hesapta mutabakatı bozar`);
    }
    if (eylem === 'baslat') donchianBot.baslat();
    else if (eylem === 'durdur') donchianBot.durdur();
    else if (eylem === 'kuru') return res.json({ success: true, rapor: await donchianBot.calistir({ kuru: true }) });
    else if (eylem === 'simdi') return res.json({ success: true, rapor: await donchianBot.calistir({ kuru: false }) });
    else throw new Error('eylem: baslat | durdur | kuru | simdi');
    res.json({ success: true, bot: donchianBot.ozet() });
  } catch (err) { borsaHata(res, err); }
});

// ── B KALKAN (yalnız kâğıt borsa) ──────────────────────────────────────────
app.get('/api/kalkan/durum', async (req, res) => {
  try {
    const hesap = kalkanYurutucu.borsa ? await kalkanYurutucu.hesap().catch(e => ({ hata: e.message })) : null;
    res.json({ success: true, kalkan: kalkanBot.ozet(), yurutucu: kalkanYurutucu.borsa ? kalkanYurutucu.ozet() : { durum: 'BAGLI_DEGIL' }, hesap });
  } catch (err) { borsaHata(res, err); }
});

app.post('/api/kalkan/baslat', async (req, res) => {
  try {
    await kalkanBagla(); kalkanKagitMi();
    kalkanBot.baslat();
    res.json({ success: true, kalkan: kalkanBot.ozet() });
  } catch (err) { borsaHata(res, err); }
});

app.post('/api/kalkan/durdur', (req, res) => {
  kalkanBot.durdur();
  res.json({ success: true, kalkan: kalkanBot.ozet() });
});

/** Kuru çalıştırma: hesap + plan, emir YOK, durum yazılmaz. */
app.post('/api/kalkan/kuru', async (req, res) => {
  try { await kalkanBagla(); kalkanKagitMi(); res.json({ success: true, rapor: await kalkanBot.calistir({ kuru: true }) }); }
  catch (err) { borsaHata(res, err); }
});

/** Günlük çalışmayı şimdi koş — kâğıt borsada (gerçek emir yok). */
app.post('/api/kalkan/calistir', async (req, res) => {
  try { await kalkanBagla(); kalkanKagitMi(); res.json({ success: true, rapor: await kalkanBot.calistir({ kuru: false }) }); }
  catch (err) { borsaHata(res, err); }
});

app.post('/api/kalkan/mutabakat', async (req, res) => {
  try { await kalkanBagla(); await kalkanYurutucu.mutabakat(); const m = await kalkanBot.mutabakat(); if (m && !m.engel) tasimaLib.mutabakatTemiz('kalkan'); res.json({ success: true, mutabakat: m, kalkan: kalkanBot.ozet() }); }
  catch (err) { borsaHata(res, err); }
});

app.post('/api/kalkan/acil', async (req, res) => {
  try { await kalkanBagla(); kalkanKagitMi(); res.json({ success: true, rapor: await kalkanBot.acilDurdur('panel'), kalkan: kalkanBot.ozet() }); }
  catch (err) { borsaHata(res, err, 500); }
});

// ── HÜCUM / DENGE (bindirme) ───────────────────────────────────────────────
/**
 * Ölçüm (lib/research/bindirme.js): iki strateji + yalnız BTC ayağı + kol + BTC al-tut.
 * İlk çağrıda hesaplanır (~5–8 sn, olay döngüsünü tutar) ve bellekte saklanır;
 * `?yenile=1` yeniden hesaplar. Veri yoksa 503.
 */
let bindirmeOlcumOnbellek = null;
function bindirmeOlcumKur() {
  const A = bindirmeArastirma;
  const out = { zaman: Date.now(), stratejiler: {}, ortak: null };
  for (const ad of BINDIRME_ADLAR) {
    const t = A.STRATEJILER[ad];
    const s = A.bindirmeSonuc({ btcPay: t.btcPay, bootstrap: true });
    out.stratejiler[ad] = { ad: t.ad, aciklama: t.aciklama, btcPay: t.btcPay, kayit: t.kayit, egri: s.egri, metrik: s.metrik, yillik: s.yillik.strateji, btcIslemler: s.btcIslemler, marj: s.marj };
    if (!out.ortak) {
      out.ortak = { donem: s.donem, icerideGun: s.icerideGun, btcAyagi: s.btcAyagi, kol: s.kol, alTut: s.alTut,
        metrikBtcAyagi: s.metrikBtcAyagi, metrikKol: s.metrikKol, metrikAlTut: s.metrikAlTut, alTutKayit: A.AL_TUT_KAYIT,
        yillik: { btcAyagi: s.yillik.btcAyagi, kol: s.yillik.kol, alTut: s.yillik.alTut },
        gecisler: s.gecisler, btcAyagiIslemler: s.btcAyagiIslemler };
    }
  }
  return out;
}
app.get('/api/bindirme/olcum', (req, res) => {
  try {
    if (!bindirmeArastirma.veriVarMi()) return res.status(503).json({ success: false, error: 'Ölçüm verisi yok: data/market.db ve data/arastirma/capraz-marj-onbellek.json gerekli (ONBELLEK=1 node scripts/capraz-marj-sim.js)' });
    if (!bindirmeOlcumOnbellek || req.query.yenile) bindirmeOlcumOnbellek = bindirmeOlcumKur();
    res.json({ success: true, olcum: bindirmeOlcumOnbellek });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/bindirme/:ad/durum', async (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    let hesap = null, btc = null;
    if (b.y.borsa) {
      hesap = await b.y.hesap().catch(e => ({ hata: e.message }));
      try { const q = await b.bot.btcMiktari(); const f = q !== 0 ? await b.bot._btcFiyat() : null; btc = { miktar: q, fiyat: f, deger: q * (f || 0), ayak: b.bot.ayar.btcAyak }; } catch (e) { btc = { hata: e.message }; }
    }
    const kapi = canliKapiDurum(b.ad);
    res.json({ success: true, mod: b.mod, modlar: gorunurModlar(b), canliKapi: { izin: kapi.izin, eksikler: kapi.eksikler, enErken: canliKapi.CANLI_EN_ERKEN, ustSinir: kapi.ustSinir }, demoAnahtar: !!(config.testnetApiKey && config.testnetApiSecret),
      bot: b.bot.ozet(), yurutucu: b.y.borsa ? b.y.ozet() : { durum: 'BAGLI_DEGIL' }, hesap, btc });
  } catch (err) { borsaHata(res, err); }
});

/**
 * BINANCE BAKİYE KIRILIMI (64.5, YALNIZ OKUMA) — Botlar › Hücum "Binance bakiyesi": cüzdan, gerçekleşmemiş K/Z, marj bakiyesi
 * (= hesap değeri), pozisyon teminatı, emir teminatı, kullanılabilir (Binance "Avbl") + özdeşlik denetimi; pozisyonlar işaret
 * fiyatıyla, açık emirler (temel + koşullu). lib/binanceHesapOzeti.js. Panel açıkken ~12 sn'de bir sorulur → 10 sn önbellek
 * (4 GET, yürütücünün hız kapısından). Bağlı değilse (araştırma kopyası / bot bağlanmamış) Binance'e GİDİLMEZ; son kayıtlı
 * hesap değeri döner. Telefon kademesi: GET serbest; araştırma kopyası: lib/evOkuma EV_YOLU (/api/bindirme/…) sunucudan okur.
 */
const binanceHesapOzeti = require('./lib/binanceHesapOzeti');
const binanceBakiyeOnbellek = {};
app.get('/api/bindirme/:ad/binance-bakiye', async (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    const son = (() => { try { const l = b.bot.ozsermayeOku(); const x = l[l.length - 1]; return x ? { gun: x.gun, zaman: x.zaman || null, ozsermaye: x.ozsermaye } : null; } catch { return null; } })();
    const temel = { success: true, ad: b.ad, mod: b.mod, arastirma: ARASTIRMA_MODU, sermayeTavani: b.bot.ayar.sermayeTavani, sonKayit: son };
    if (!b.y.borsa) {
      return res.json({ ...temel, bagli: false, neden: ARASTIRMA_MODU
        ? 'Bu bilgisayar araştırma kopyası — Binance\'e bağlanılmaz (bot sunucuda çalışır). Sunucu bağlantısı kuruluysa bu bilgi sunucudaki panelden okunur.'
        : 'Bot borsaya bağlı değil (durdurulmuş ya da kâğıt hesap) — Binance bakiyesi okunmuyor.' });
    }
    if (!binanceHesapOzeti.binanceMi(b.y.borsa)) return res.json({ ...temel, bagli: true, binance: false, neden: 'Kâğıt hesap — Binance bakiye kırılımı yok (sanal bakiye).' });
    const o = binanceBakiyeOnbellek[b.ad];
    let veri;
    if (o && o.dizin === b.dizin && Date.now() - o.zaman < 10000) veri = o.veri;
    else {
      const istek = (fn) => (typeof b.y.borsaIstegi === 'function' ? b.y.borsaIstegi(fn) : fn());
      veri = { zaman: Date.now(), ortam: b.y.ortam, ...(await binanceHesapOzeti.oku(b.y.borsa, istek)) };
      binanceBakiyeOnbellek[b.ad] = { zaman: veri.zaman, dizin: b.dizin, veri };
    }
    res.json({ ...temel, bagli: true, binance: true, ...veri });
  } catch (err) { borsaHata(res, err); }
});

/** Mod seçimi: kagit | demo. Bot çalışırken değişmez; canlı bu sürümde YOK. */
app.post('/api/bindirme/:ad/mod', async (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    const mod = String((req.body || {}).mod || '');
    if (!BINDIRME_MODLAR.includes(mod)) throw new Error(`mod kagit | demo | canli olmalı`);
    if (mod === b.mod) return res.json({ success: true, mod });
    if (mod === 'canli') {
      canliKapiGerekli(b.ad);
      if (String((req.body || {}).onay || '').trim().toLocaleUpperCase('tr-TR') !== 'GERÇEK PARA') throw new Error('gerçek paraya geçiş onayı: "GERÇEK PARA" yazılmalı');
    }
    if (b.mod === 'canli') {
      // Denetim #4: gerçek hesapta açık pozisyon/emir kalırken çıkılırsa acil durdurma o hesaba artık ulaşmaz — önce acil.
      try { await b.bagla({ mutabakatsiz: true }); } catch (e) { if (!b.y.borsa) throw new Error(`gerçek hesap okunamadı (${e.message}) — moddan çıkılmadı`); }
      const istek = (fn) => (typeof b.y.borsaIstegi === 'function' ? b.y.borsaIstegi(fn) : fn());
      const [poz, emir] = await Promise.all([istek(() => b.y.borsa.fetchPositions()), istek(() => b.y.borsa.fetchOpenOrders())]);
      const acikPoz = (poz || []).filter(p => Math.abs(+p.contracts || 0) > 0);
      const btcQ = await b.bot.btcMiktari().catch(() => 0);
      if (acikPoz.length || (emir || []).length || btcQ > 0) throw new Error(`gerçek hesapta açık pozisyon/emir ya da BTC var (${acikPoz.length} pozisyon, ${(emir || []).length} emir, BTC ${btcQ}) — önce Acil fren, sonra moddan çıkın`);
      b.y._onayKaldir('gerçek para modundan çıkıldı');   // yeniden girişte "CANLI" yeniden istenir
    }
    if (b.bot.durum.calisiyor) throw new Error('önce botu durdurun (mod çalışırken değişmez)');
    const yeni = bindirmeKur(b.ad, mod);
    bindirmeDemoCakisma(yeni);
    if (b.y.borsa) b.y.baglantiyiKes();
    if (b.bot.zamanlayici) b.bot.durdur();
    bindirmeler[b.ad] = yeni;
    const onceki = (config.bindirme || {})[b.ad] || {};
    config.bindirme = { ...(config.bindirme || {}), [b.ad]: { ...onceki, mod } };
    saveConfig(config);
    db.addLog(mod === 'canli' ? 'WARN' : 'INFO', `[${b.ad}] mod: ${mod === 'demo' ? 'DEMO hesap (BTC ayağı perp LONG — demo yaklaşımı)' : mod === 'canli' ? '⚠ GERÇEK PARA (çoklu varlık; kapı açık)' : 'kâğıt'}`);
    if (mod === 'canli') portfoyBildirici.gonder('alarm', `${yeni.bot.adGorunen}: GERÇEK PARA moduna geçildi`, ['Bot henüz başlamadı: emir onayı (CANLI) ve Başlat gerekir. Siz değilseniz hemen moda geri dönün.'], { anahtar: `canli-mod:${Date.now()}` });
    res.json({ success: true, mod });
  } catch (err) { borsaHata(res, err); }
});

/**
 * Küçük sermaye (Hücum-S) seçimi: oto (sermaye < 5000 $ iken açık) | acik | kapali.
 * Kural PLAN-SERMAYE-1000.md §3 (lib/live/kucukSermaye.js); bot çalışırken değişmez.
 */
app.post('/api/bindirme/:ad/kucuk-sermaye', (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    const anahtar = String((req.body || {}).secim || '');
    if (!(anahtar in KUCUK_SECIMLER)) throw new Error('secim: oto | acik | kapali');
    if (b.bot.durum.calisiyor) throw new Error('önce botu durdurun');
    const v = KUCUK_SECIMLER[anahtar];
    b.bot.ayar.kucukSermaye = v; b.bot.kol.ayar.kucukSermaye = v;
    const onceki = (config.bindirme || {})[b.ad] || {};
    config.bindirme = { ...(config.bindirme || {}), [b.ad]: { ...onceki, kucukSermaye: v } };
    saveConfig(config);
    db.addLog('INFO', `[${b.ad}] küçük sermaye (Kairos-S): ${anahtar}`);
    res.json({ success: true, secim: anahtar, bot: b.bot.ozet() });
  } catch (err) { borsaHata(res, err); }
});

/**
 * 68.8 KÂĞIT HESABI SIFIRLA (TEMİZ BAŞLA) — lib/live/kagitSifirla.js. Yalnız kâğıt modda ve bot durmuşken (yoksa 409); gövde
 * { onay: 'SIFIRLA' }. Botun dizini (data/live/<ad>) SİLİNMEZ: `<ad>-onceki-<UTC zaman>` yedeğine taşınır; bot taze durumla yeniden
 * kurulur (sermaye = kagitBakiye; son gün yok → ilk çalışmada kaçırılan gün telafisi yok). Demo / canlı dizinine dokunmaz.
 * 68.9 (G7, PLAN-GERCEK-PARA-2027 §1): isteğe bağlı { btcAyak: 'spot' | 'coklu' } — BTC ayağı biçimi YALNIZ sıfırlamayla değişir
 * (spot ↔ çoklu varlık durumu birbirine taşınmaz); config.bindirme.<ad>.btcAyak yazılır, bot o biçimle taze kurulur.
 */
const kagitSifirlaLib = require('./lib/live/kagitSifirla');
app.post('/api/bindirme/:ad/kagit-sifirla', (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    const durum = { ad: b.bot.adGorunen || b.ad, mod: b.mod, calisiyor: !!b.bot.durum.calisiyor, dizin: b.dizin, kok: CANLI_DIZIN };
    const e = kagitSifirlaLib.engel(durum);
    if (e) return res.status(409).json({ success: false, error: e });
    if (String((req.body || {}).onay || '').trim().toLocaleUpperCase('tr-TR') !== kagitSifirlaLib.ONAY) return res.status(400).json({ success: false, error: 'onay eksik: gövdede { onay: "SIFIRLA" } olmalı' });
    const yeniAyak = (req.body || {}).btcAyak;
    if (yeniAyak != null && !KAGIT_AYAKLAR.includes(yeniAyak)) return res.status(400).json({ success: false, error: `btcAyak ${KAGIT_AYAKLAR.join(' | ')} olmalı` });
    if (b.y.borsa) b.y.baglantiyiKes();
    if (b.bot.zamanlayici) b.bot.durdur();
    const r = kagitSifirlaLib.sifirla({ ...durum, simdi: Date.now() });
    if (yeniAyak != null) {
      const onceki = (config.bindirme || {})[b.ad] || {};
      config.bindirme = { ...(config.bindirme || {}), [b.ad]: { ...onceki, btcAyak: yeniAyak } };
      saveConfig(config);
    }
    bindirmeler[b.ad] = bindirmeKur(b.ad, 'kagit');
    const yedekAd = r.yedek ? path.basename(r.yedek) : null;
    db.addLog('WARN', `[${b.ad}] kâğıt hesap sıfırlandı (temiz başlangıç, sermaye ${bindirmeAyar(b.ad).kagitBakiye} USDT · BTC ayağı ${bindirmeler[b.ad].bot.ayar.btcAyak === 'coklu' ? 'çoklu varlık' : 'spot'})${yedekAd ? ` — eski kayıtlar data/live/${yedekAd}` : ''}`);
    res.json({ success: true, yedek: yedekAd, sermaye: bindirmeAyar(b.ad).kagitBakiye, btcAyak: bindirmeler[b.ad].bot.ayar.btcAyak, bot: bindirmeler[b.ad].bot.ozet() });
  } catch (err) {
    if (err && err.kod === 409) return res.status(409).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: `kâğıt hesap sıfırlanamadı (bot olduğu gibi kaldı): ${err.message}` });
  }
});

app.post('/api/bindirme/:ad/baslat', async (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    bindirmeDemoCakisma(b);
    if (b.mod === 'canli') canliKapiGerekli(b.ad);
    await b.bagla();
    if (b.mod === 'canli' && !b.y.kilitAcik) throw new Error('gerçek para emir onayı verilmedi — kartta "Gerçek para emir onayı" (CANLI yazarak)');
    b.bot.baslat(); res.json({ success: true, bot: b.bot.ozet() });
  }
  catch (err) { borsaHata(res, err); }
});

/** O3 (62.1): para yatırma/çekme kaydı — { tutar: +/− USDT, not?, onay: 'KAYIT' }. Para taşımaz; ölçüm tabanlarını kaydırır.
 *  69.6: onay metni, tutar sınırı ve büyük kayıtta borsadaki özsermayeyle tutarlılık botta denetlenir (400). */
app.post('/api/bindirme/:ad/sermaye-akisi', async (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    const g = req.body || {};
    const k = await b.bot.sermayeDegisikligi(g.tutar, g.not, { onay: g.onay });
    portfoyBildirici.gonder('bilgi', `${b.bot.adGorunen}: ${k.tutar > 0 ? 'para yatırma' : 'para çekme'} kaydedildi`, ['Bot bu hareketi getiri saymaz (gölge karşılaştırması ve risk tepesi kaydırıldı).']);
    res.json({ success: true, kayit: k, bot: b.bot.ozet() });
  } catch (err) { borsaHata(res, err); }
});

/** C1/K1: gerçek para emir onayı (kalıcı, onaylanan tavanlarla) ya da geri alma ({ kapat: true }). Yalnız canli modda. */
app.post('/api/bindirme/:ad/canli-onay', async (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    if (b.mod !== 'canli') throw new Error('emir onayı yalnız gerçek para modunda');
    if ((req.body || {}).kapat) {
      if (b.y.borsa) b.y.kilitKapat(); else b.y._onayKaldir('panelden kapatıldı (bağlı değil)');
      return res.json({ success: true, bot: b.bot.ozet(), yurutucu: b.y.borsa ? b.y.ozet() : null });
    }
    canliKapiGerekli(b.ad);
    await b.bagla();
    b.y.kilitAc(String((req.body || {}).onay || '').trim().toUpperCase());
    portfoyBildirici.gonder('alarm', `${b.bot.adGorunen}: GERÇEK PARA emir onayı verildi`, [`Tavan: emir ${b.y.ayar.maxEmirNominal} / sembol ${b.y.ayar.maxPozisyonNominal} USDT. Siz değilseniz hemen acil durdurun.`], { anahtar: `canli-onay:${Date.now()}` });
    res.json({ success: true, bot: b.bot.ozet(), yurutucu: b.y.ozet() });
  } catch (err) { borsaHata(res, err); }
});

app.post('/api/bindirme/:ad/durdur', (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  b.bot.durdur();
  res.json({ success: true, bot: b.bot.ozet() });
});

/** Kuru çalıştırma: hesap + plan, emir YOK, durum (sonW, evren, risk) yazılmaz. */
app.post('/api/bindirme/:ad/kuru', async (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try { await b.bagla(); res.json({ success: true, rapor: await b.bot.calistir({ kuru: true }) }); }
  catch (err) { borsaHata(res, err); }
});

/** Günlük çalışmayı şimdi koş: önce mutabakat (uyuşmazlık → ENGEL), sonra emirler (kâğıt ya da demo). */
app.post('/api/bindirme/:ad/calistir', async (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    // Y1 (61.7): süren çalışma varken ikinci tetikleme reddedilir (bot içi kilit zaten sıraya sokar; kullanıcıya açık söylenir).
    if (b.bot.calismaSuruyor()) return res.status(409).json({ success: false, error: 'Bir çalışma zaten sürüyor (zamanlanmış ya da başka bir sekmeden) — bitince sonuç kartta görünür.' });
    bindirmeDemoCakisma(b); await b.bagla();
    const r = await b.bot.gunlukCalisma();
    if (r && r.engel) throw new Error(`ENGEL: ${r.engel}`);
    res.json({ success: true, rapor: r });
  } catch (err) { borsaHata(res, err); }
});

app.post('/api/bindirme/:ad/mutabakat', async (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    await b.bagla(); await b.y.mutabakat();
    const m = await b.bot.mutabakat();
    if (!m.engel) tasimaLib.mutabakatTemiz(b.ad);   // 68.1: taşıma sonrası ilk temiz mutabakat → Başlat açılır
    if (m.engel) portfoyBildirici.gonder('alarm', `${b.bot.adGorunen}: mutabakat uyuşmazlığı`, [m.engel], { anahtar: `mutabakat:${b.ad}` });
    res.json({ success: true, mutabakat: m, bot: b.bot.ozet() });
  }
  catch (err) { borsaHata(res, err); }
});

/** Uygulama sapması ENGEL'ini elle kaldır (pozisyon uyuşmazlığı engeli yalnız temiz mutabakatla kalkar). */
app.post('/api/bindirme/:ad/engel-kaldir', (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  const kaldirilan = b.bot.engelKaldir();
  try { ozDenetim.onayVerildi(b.ad); } catch { /* */ }   // 73.6 (Y-02): öz denetim sayaçları bu andan sonrasını sayar
  res.json({ success: true, kaldirilan, bot: b.bot.ozet() });
});

app.post('/api/bindirme/:ad/acil', async (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    // Y4 (61.7): acil, tam bağlantı + mutabakat istemez. Bağlanırken açılış mutabakatı hata verse bile borsa nesnesi
    // kurulduysa acil yine denenir (yürütücünün acilDurdur'u kendi okumalarını yapar). Hiç bağlanamazsa hata döner.
    try { await b.bagla({ mutabakatsiz: true }); } catch (e) {
      if (!b.y.borsa) throw e;
      db.addLog('WARN', `[ACİL] ${b.ad}: bağlantı sırasında mutabakat hatası (${e.message}) — acil yine uygulanıyor`);
    }
    res.json({ success: true, rapor: await b.bot.acilDurdur('panel'), bot: b.bot.ozet() });
  }
  catch (err) { borsaHata(res, err, 500); }
});

/** ACİL DURDURMAYI DENE (yalnız demo): küçük uzak limit emir → acil durdurma → doğrulama → mutabakat. */
app.post('/api/bindirme/:ad/acil-dene', async (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    if (b.mod !== 'demo') throw new Error('acil durdurma denemesi yalnız demo modunda (kâğıtta "Acil" düğmesi zaten gerçek borsaya dokunmaz)');
    bindirmeDemoCakisma(b); await b.bagla();
    const r = await b.bot.acilDene();
    res.status(r.basarili ? 200 : 500).json({ success: r.basarili, error: r.basarili ? null : 'acil durdurma denemesi başarısız — ayrıntı sonuçta', sonuc: r, bot: b.bot.ozet() });
  } catch (err) { borsaHata(res, err, 500); }
});

/**
 * İŞLEMLER / GRAFİK (panel: Canlı İzleme → portföy botu ayrıntısı). Borsa çağrıları önbellekli:
 *   · canlı görünüm (pozisyon + açık emir): bot başına 15 sn
 *   · fetchMyTrades mutabakatı: 5 dk (IslemGecmisi kendi sınırı)
 *   · günlük mumlar: sembol başına 10 dk
 * Bot bağlı değilse borsaya bağlanılmaz (yalnız kayıtlı geçmiş gösterilir).
 */
const { grafikIsaretleri, grafikIslemleri, ozsermayeKarsilastir } = require('./lib/live/islemGecmisi');
const bindirmeGorunumOnbellek = {};
const bindirmeMumOnbellek = new Map();
let bindirmeVeriIstemcisi = null;

app.get('/api/bindirme/:ad/islemler', async (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    b.bot.islemGecmisiGuncelle();
    let canli = null, canliHata = null;
    if (b.y.borsa) {
      const o = bindirmeGorunumOnbellek[b.ad];
      if (o && o.dizin === b.dizin && Date.now() - o.zaman < 15000) canli = o.veri;
      else {
        try { canli = await b.bot.canliGorunum(); bindirmeGorunumOnbellek[b.ad] = { zaman: Date.now(), dizin: b.dizin, veri: canli }; }
        catch (e) { canliHata = e.message; }
      }
      // Borsa işlem kayıtlarıyla tamamla (gerçek fiyat/ücret); en çok 5 dk'da bir.
      await b.bot.gecmis.borsaMutabakat(b.y.borsa, b.y.defter).catch(() => null);
    }
    const q = req.query || {};
    const gs = q.grafikSembol ? String(q.grafikSembol) : null;
    const satirlar = b.bot.gecmis.satirlar();
    res.json({ success: true, mod: b.mod, bagli: !!b.y.borsa, canli, canliHata, hesap: bindirmeHesapAdi(b),
      // Botun işlem gördüğü semboller (grafik hızlı geçiş düğmeleri) ve gösterilen sembolün işaretleri
      islemSembolleri: [...new Set(satirlar.map(x => String(x.symbol).replace(' (spot)', '').split(':')[0]))].sort(),
      isaretler: gs ? grafikIsaretleri(satirlar, gs) : [],
      gecmis: b.bot.gecmis.liste({ symbol: q.sembol || null, kol: q.kol || null, sayfa: q.sayfa, boyut: q.boyut, bas: tarihBas(q.bas), bit: tarihBit(q.bit) }) });
  } catch (err) { borsaHata(res, err, 500); }
});

/**
 * HESAP İŞLEMLERİ (lib/live/hesapIslemleri.js) — bağlı her hesabın (demo/canlı; kâğıt botların kendi
 * kâğıt borsası) TÜM dolumları + funding, data/live/hesap-islemleri.jsonl (yalnız ekle).
 * Açılıştan 2 dk sonra (sunucu kapalıyken oluşan boşluk doldurulur) ve 15 dk'da bir eşitlenir.
 */
const { HesapIslemleri } = require('./lib/live/hesapIslemleri');
const hesapIslemleri = new HesapIslemleri(path.join(CANLI_DIZIN, 'hesap-islemleri.jsonl'), { kaydet: (sv, m) => db.addLog(sv, `[HESAP] ${m}`) });
const tarihBas = (g) => (/^\d{4}-\d{2}-\d{2}$/.test(String(g || '')) ? Date.parse(`${g}T00:00:00Z`) : null);
const tarihBit = (g) => (/^\d{4}-\d{2}-\d{2}$/.test(String(g || '')) ? Date.parse(`${g}T23:59:59.999Z`) : null);
function bindirmeHesapAdi(b) { return b.y.borsa ? (b.y.ortam === 'kagit' ? `kagit-${b.ad}` : b.y.ortam) : (b.mod === 'demo' ? 'testnet' : `kagit-${b.ad}`); }

/** Bağlı yürütücüler → hesap grupları (aynı hesabı paylaşan defterler birlikte sınıflanır). */
function hesapGruplari() {
  const g = new Map();
  const ekle = (hesap, y, kaynak, spot = null) => {
    if (!y || !y.borsa) return;
    // Yürütücünün geri çekilme kapısından (F2): 418 ban'da fetchMyTrades/funding/fetchOrder atılmaz.
    if (!g.has(hesap)) g.set(hesap, { hesap, borsa: (typeof y.kapiliBorsa === 'function' && y.kapiliBorsa()) || y.borsa, defterler: [] });
    g.get(hesap).defterler.push({ kaynak, defter: y.defter });
    if (spot) g.get(hesap).spot = spot;   // D5 (62.2): çoklu varlık — spot BTC, aktarım, otomatik çevrim de kayda
  };
  for (const ad of BINDIRME_ADLAR) { const b = bindirmeler[ad]; ekle(bindirmeHesapAdi(b), b.y, ad, b.bot.ayar.btcAyak === 'coklu' ? { varlik: b.bot.ayar.varlik || 'BTC' } : null); }
  if (canli.borsa) ekle(canli.ortam === 'kagit' ? 'kagit-borsa' : canli.ortam, canli, 'donchianBot');
  return [...g.values()];
}
async function hesapSenkron() {
  const sonuc = [];
  for (const grup of hesapGruplari()) {
    try { sonuc.push(await hesapIslemleri.senkron(grup)); } catch (e) { sonuc.push({ hesap: grup.hesap, hata: e.message }); }
  }
  return sonuc;
}
setTimeout(() => { hesapSenkron().catch(() => null); }, 2 * 60 * 1000).unref();
setInterval(() => { hesapSenkron().catch(() => null); }, 15 * 60 * 1000).unref();

const hesapSuzgec = (q = {}) => ({ hesap: q.hesap || null, bas: tarihBas(q.bas), bit: tarihBit(q.bit), symbol: q.sembol || null, kaynak: q.kaynak || null, tur: q.tur || null, sayfa: q.sayfa, boyut: q.boyut });
app.get('/api/hesap-islemleri', (req, res) => {
  try { res.json({ success: true, ...hesapIslemleri.liste(hesapSuzgec(req.query)) }); } catch (err) { borsaHata(res, err, 500); }
});
app.post('/api/hesap-islemleri/senkron', async (req, res) => {
  try { res.json({ success: true, sonuc: await hesapSenkron() }); } catch (err) { borsaHata(res, err, 500); }
});
/** CSV dışa aktarma — panel bağlantısı (aynı sunucu, indirme). Süzgeçler sorgudan. */
app.get('/api/hesap-islemleri.csv', (req, res) => {
  try {
    const f = hesapSuzgec(req.query);
    const ad = `hesap-islemleri${f.hesap ? '-' + String(f.hesap).replace(/[^a-z0-9-]/gi, '') : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${ad}"`);
    res.send(hesapIslemleri.csv(f));
  } catch (err) { borsaHata(res, err, 500); }
});

/**
 * HESAPLAR (Pusula P3, lib/hesaplar.js) — SALT OKUMA birleşik görünüm: bağlı her hesap (Hesaplar ekranının elle
 * bağlantısı, Hücum/Denge, Kalkan) + kâğıt işlem motoru → tek pozisyon listesi, tek emir/işlem listesi.
 * Emir vermez, durum yazmaz; GET olduğu için araştırma modunda da açık. Borsa okuması hesap başına 15 sn önbellekli.
 */
const { HesaplarGorunum, gunAraligi } = require('./lib/hesaplar');
const anahtarMaske = (k) => (k ? { kayitli: true, son4: String(k).slice(-4) } : { kayitli: false, son4: null });
const hesaplarGorunum = new HesaplarGorunum({
  yurutuculer: () => {
    const l = [];
    if (canli.borsa) l.push({ kaynak: 'elle', hesap: canli.ortam === 'kagit' ? 'kagit-borsa' : canli.ortam, y: canli });
    for (const ad of BINDIRME_ADLAR) { const b = bindirmeler[ad]; l.push({ kaynak: ad, hesap: bindirmeHesapAdi(b), y: b.y, bot: b.bot }); }
    if (kalkanYurutucu.borsa) l.push({ kaynak: 'kalkan', hesap: 'kagit-kalkan', y: kalkanYurutucu });
    return l;
  },
  kagitMotor: () => {
    const b = engine.exchange.getBalances();
    return { positions: b.positions || [], tickerMap: (engine.lastState && engine.lastState.tickerMap) || {}, orders: db.getOrders(500), trades: db.getTrades(500),
      calisiyor: !!engine.isRunning && engine.getBots().length > 0, bakiye: { toplam: engine.getTotalEquity(), serbest: (b.balances && b.balances.USDT) || 0, kullanilan: null } };
  },
  hesapIslemleri,
  // Anahtarın kendisi panele GİTMEZ: yalnız kayıtlı mı + API Key'in son 4 hanesi (secret hiç).
  anahtarlar: () => ({ testnet: anahtarMaske(config.testnetApiSecret && config.testnetApiKey), live: anahtarMaske(config.apiSecret && config.apiKey) })
});
// Tarih süzgeci tarayıcının gününe göre (tz = getTimezoneOffset; tablo zamanı yerel saatle yazıyor).
const hesaplarSuzgec = (q = {}) => ({ durum: q.durum || '', hesap: q.hesap || null, kaynak: q.kaynak || null, symbol: q.sembol || null, ...gunAraligi(q.bas, q.bit, q.tz), sayfa: q.sayfa, boyut: q.boyut });
app.get('/api/hesaplar', async (req, res) => {
  try { res.json({ success: true, ...(await hesaplarGorunum.anlik({ zorla: !!(req.query || {}).yenile })) }); } catch (err) { borsaHata(res, err, 500); }
});
app.get('/api/hesaplar/islemler', async (req, res) => {
  try { res.json({ success: true, ...(await hesaplarGorunum.islemler(hesaplarSuzgec(req.query))) }); } catch (err) { borsaHata(res, err, 500); }
});
app.get('/api/hesaplar/islemler.csv', async (req, res) => {
  try {
    const metin = await hesaplarGorunum.csv(hesaplarSuzgec(req.query));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hesaplar-emir-islem-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(metin);
  } catch (err) { borsaHata(res, err, 500); }
});

app.get('/api/bindirme/:ad/grafik', async (req, res) => {
  const b = bindirmeBul(req, res); if (!b) return;
  try {
    b.bot.islemGecmisiGuncelle();
    const satirlar = b.bot.gecmis.satirlar();
    const semboller = [...new Set(satirlar.map(x => String(x.symbol).replace(' (spot)', '').split(':')[0]))].sort();
    let sembol = String((req.query || {}).sembol || '') || semboller[0] || 'BTC/USDT';
    sembol = sembol.split(':')[0];
    const perp = `${sembol}:USDT`;
    const anahtar = perp;
    let mumlar = null, mumHata = null;
    const o = bindirmeMumOnbellek.get(anahtar);
    if ((req.query || {}).mumsuz) mumlar = [];                      // panel Performans sekmesi: mum gerekmez
    else if (o && Date.now() - o.zaman < 10 * 60000) mumlar = o.mumlar;
    else {
      try {
        let istemci = b.y.borsa;
        if (!istemci) { if (!bindirmeVeriIstemcisi) { const ccxt = require('ccxt'); bindirmeVeriIstemcisi = new ccxt.binanceusdm({ enableRateLimit: true }); } istemci = bindirmeVeriIstemcisi; }
        const ham = await istemci.fetchOHLCV(perp, '1d', undefined, 300);
        mumlar = ham.map(m => ({ t: m[0], o: m[1], h: m[2], l: m[3], c: m[4] }));
        bindirmeMumOnbellek.set(anahtar, { zaman: Date.now(), mumlar });
      } catch (e) { mumHata = e.message; }
    }
    const golge = isletim.golgeOku(GOLGE_DOSYA);
    res.json({ success: true, sembol, semboller, mumlar: mumlar || [], mumHata,
      isaretler: grafikIsaretleri(satirlar, sembol),
      islemler: grafikIslemleri(satirlar),   // 71.0: Botlar › Genel takvim + getiri grafiği noktaları (tüm semboller)
      ozsermaye: ozsermayeKarsilastir(b.bot.ozsermayeOku(), golge, b.ad, b.bot.durum.sermayeAkislari) });
  } catch (err) { borsaHata(res, err, 500); }
});

/** Portföy botlarının Telegram durumu (panel "Telegram bağlı değil" satırı). */
app.get('/api/bindirme-telegram', (req, res) => {
  res.json({ success: true, telegram: portfoyBildirici.durum(), son: portfoyBildirici.gecmis.slice(-10) });
});

// ── İLERİ VERİ GÖLGE İZLEYİCİ — Bollinger düşüş azaltıcı (PLAN-ILERI-BOLLINGER.md) ──
/**
 * Emir YOK. Her gün 00:15 UTC sonrası ilk tikte ve açılışta bir kez `scripts/ileri-izle.js`
 * ALT SÜREÇTE koşar (kol modeli DCA backtest'i olay döngüsünü bloklamasın; çökme sunucuyu
 * etkilemesin). Kayıt yalnız eklenir (lib/ileri/bollingerIzleme.js); betikle aynı anda koşarsa
 * kilit dosyası sıraya sokar. Ağ hatasında 15 dk sonra yeniden dener; seri/gölge eksikse
 * aynı gün 30 dk arayla en çok 3 kez daha.
 */
const ileriIzleme = require('./lib/ileri/bollingerIzleme');
const ileriRapor = require('./lib/ileri/bollingerRapor');
const zamanDilimiGolge = require('./lib/ileri/zamanDilimiGolge');   // 3d gölge (PLAN-GOLGE-3D, 635) — ileri-izle.js içinde yazılır
const rangeVetoGolge = require('./lib/ileri/rangeVetoGolge');       // D3 range vetosu gölgesi (PLAN-GOLGE-D3, 764) — aynı betikte yazılır
const ileriIs = { calisiyor: false, sonGun: null, gunDeneme: 0, sonDeneme: 0, sonHata: null, eksikVar: false };
let ileriRaporOnbellek = null;
const ileriDakika = (t) => { const d = new Date(t); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
function ileriCalistir(neden) {
  if (ileriIs.calisiyor) return;
  ileriIs.calisiyor = true; ileriIs.sonDeneme = Date.now();
  const bas = Date.now(), gun = new Date(bas).toISOString().slice(0, 10);
  const gunlukMu = ileriDakika(bas) >= 15;          // 00:00–00:15 arası açılış koşusu günlük işi saymaz
  require('child_process').execFile(process.execPath, [path.join(__dirname, 'scripts', 'ileri-izle.js'), '--json'],
    { cwd: __dirname, timeout: 15 * 60 * 1000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      ileriIs.calisiyor = false;
      if (err) {
        ileriIs.sonHata = `${err.message.split('\n')[0]}${stderr ? ' · ' + String(stderr).trim().split('\n').slice(-1)[0] : ''}`;
        db.addLog('WARN', `[İLERİ] izleme çalışmadı (${neden}): ${ileriIs.sonHata} — 15 dk sonra yeniden denenecek`);
        return;
      }
      try {
        const o = JSON.parse(stdout);
        ileriIs.sonHata = null;
        if (gunlukMu) {
          if (ileriIs.sonGun !== gun) { ileriIs.sonGun = gun; ileriIs.gunDeneme = 0; }
          ileriIs.gunDeneme++;
          ileriIs.eksikVar = o.eksik.length > 0 || !!o.golgeHata;
        }
        ileriRaporOnbellek = null;
        db.addLog(o.eksik.length || o.golgeHata ? 'WARN' : 'INFO', `[İLERİ] Bollinger ileri kayıt (${neden}): +${o.yeniSatir} satır${o.gecikmeliSatir ? ` (${o.gecikmeliSatir} gecikmeli)` : ''}, gölge +${o.golgeYeni}, ${o.kaydedilenSeri}/37 seri${o.eksik.length ? ` · indirilemeyen: ${o.eksik.map(e => e.seri).join(', ')}` : ''}${o.golgeHata ? ` · gölge hatası: ${o.golgeHata}` : ''} (${(o.sureMs / 1000).toFixed(0)} sn)`);
        // PLAN-ILERI-HUCUM-DENGE A: gölge ileri MaxDD > p99 → "DUR" (yalnız gösterge + alarm; kural değişmez).
        const golge = isletim.golgeOku(GOLGE_DOSYA);
        for (const ad of BINDIRME_ADLAR) {
          const md = isletim.golgeModelDurumu(golge, ad);
          if (md.durum === 'DUR' || md.durum === 'uyari') {
            db.addLog(md.durum === 'DUR' ? 'ERROR' : 'WARN', `[İLERİ] ${bindirmeArastirma.STRATEJILER[ad].ad} gölge: ${md.metin}`);
            portfoyBildirici.gonder(md.durum === 'DUR' ? 'alarm' : 'uyari', `${bindirmeArastirma.STRATEJILER[ad].ad} ileri veri: ${md.durum === 'DUR' ? 'DUR' : 'uyarı'}`, [md.metin], { anahtar: `model:${ad}:${md.durum}`, kisitMs: 24 * 3600e3 });
            // C1 (PLAN-GERCEK-PARA-2027 §7): gerçek parada ileri test DUR → acil durdurma + ENGEL (yeniden değerlendirme).
            const bc = bindirmeler[ad];
            if (md.durum === 'DUR' && bc && bc.mod === 'canli' && !(bc.bot.durum.engel || '').startsWith('ileri test DUR')) {
              const engelYaz = () => { bc.bot.durum.engel = `ileri test DUR — yeniden değerlendirme gerekli: ${md.metin}`; bc.bot._yaz(); };
              Promise.resolve(bc.y.borsa ? null : bc.bagla({ mutabakatsiz: true }))
                .then(() => bc.bot.acilDurdur(`ileri test DUR: ${md.metin}`)).then(engelYaz)
                .catch(e => { engelYaz(); portfoyBildirici.gonder('alarm', `${bc.bot.adGorunen}: DUR acil durdurması BAŞARISIZ`, [e.message, 'Binance arayüzünden elle kapatın (PLAN-GERCEK-PARA-2027 §7)']); });
            }
          }
        }
      } catch (e) { ileriIs.sonHata = `çıktı okunamadı: ${e.message}`; }
    });
}
function ileriTik() {
  if (ileriIs.calisiyor) return;
  const simdi = Date.now();
  const gun = new Date(simdi).toISOString().slice(0, 10);
  if (ileriDakika(simdi) < 15) return;
  if (ileriIs.sonGun !== gun) {
    if (ileriIs.sonHata && simdi - ileriIs.sonDeneme < 15 * 60 * 1000) return;
    return ileriCalistir('günlük');
  }
  if (ileriIs.eksikVar && ileriIs.gunDeneme < 4 && simdi - ileriIs.sonDeneme >= 30 * 60 * 1000) ileriCalistir('eksik tamamlama');
}
setTimeout(() => ileriCalistir('açılış'), 60 * 1000).unref();
setInterval(ileriTik, 5 * 60 * 1000).unref();

/**
 * İLERİ TEST › DEMO KABUL — ara durum (SALT OKUMA, Pusula P4). PLAN-DEMO-KABUL.md ölçütlerinin bugünkü
 * durumu (gün sayacı, aşama tarihleri, betimleyici getiri/MaxDD, 63 g bandı, uygulama bandı); HÜKÜM YAZMAZ.
 * Hücum/Denge gölge kontrol noktaları (90/182/365 g, PLAN-ILERI-HUCUM-DENGE A) da buradan.
 */
const demoKabulOzet = require('./lib/ileri/demoKabulOzet');
app.get('/api/ileri/kabul', (req, res) => {
  try {
    const HD = require('./lib/ileri/hucumDengeEsikleri');
    const ilk = '2026-10-07';   // ilk ileri gün (PLAN-ILERI-HUCUM-DENGE; gölge izleyicinin başlangıcı)
    const kontrol = HD.UFUKLAR.map(g => ({ gun: g, tarih: new Date(Date.parse(ilk + 'T00:00:00Z') + g * 864e5).toISOString().slice(0, 10) }));
    // Denetim A-17: Hücum-S (1000 $) dondurulmuş MaxDD eşikleri (deneme 861, karar Ö9 / G3b) — ayrı gölge yok, Hücum gölgesine uygulanır.
    const hucumS = { plan: HD.PLANLAR.hucumS, bantlar: HD.UFUKLAR.map(u => ({ ufuk: u, p95: HD.DAGILIM.hucumS[u].maxdd.p95, p99: HD.DAGILIM.hucumS[u].maxdd.p99 })) };
    res.json({ success: true, demo: demoKabulOzet.ozet(), hucumDenge: { ilk, kontrol, plan: HD.PLAN, hucumS } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/ileri/bollinger', (req, res) => {
  try {
    const F = ileriIzleme.dosyalar();
    const ZF = zamanDilimiGolge.dosyalar();
    const RF = rangeVetoGolge.dosyalar();
    const imza = [F.kayit, F.golge, ZF.kayit, RF.kayit].map(f => (fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0)).join('|') + '|' + new Date().toISOString().slice(0, 10);
    if (!ileriRaporOnbellek || ileriRaporOnbellek.imza !== imza) {
      const kayit = ileriIzleme.satirlariOku(F.kayit), golge = ileriIzleme.satirlariOku(F.golge);
      const h = ileriRapor.hukum(kayit);
      ileriRaporOnbellek = { imza, rapor: ileriRapor.araRapor(kayit, golge),
        hukum: { durum: h.durum, mesaj: h.mesaj || null, hukum: h.durum === 'hukum' ? h.hukum : null, tarih: h.tarih || null, sonrakiTarih: h.sonrakiTarih || null } };
      try { ileriRaporOnbellek.zamanDilimi = zamanDilimiGolge.panelOzet(ileriIzleme.satirlariOku(ZF.kayit), golge); } catch (e) { ileriRaporOnbellek.zamanDilimi = { hata: e.message }; }
      try { ileriRaporOnbellek.rangeVeto = rangeVetoGolge.panelOzet(ileriIzleme.satirlariOku(RF.kayit), golge); } catch (e) { ileriRaporOnbellek.rangeVeto = { hata: e.message }; }
    }
    let son = null;
    try { son = JSON.parse(fs.readFileSync(F.son, 'utf8')); } catch { /* henüz çalışmadı */ }
    res.json({ success: true, rapor: ileriRaporOnbellek.rapor, hukum: ileriRaporOnbellek.hukum, zamanDilimi: ileriRaporOnbellek.zamanDilimi || null, rangeVeto: ileriRaporOnbellek.rangeVeto || null,
      izleyici: { calisiyor: ileriIs.calisiyor, sonHata: ileriIs.sonHata,
        sonCalisma: son && { zaman: son.zaman, yeniSatir: son.yeniSatir, golgeYeni: son.golgeYeni, golgeHata: son.golgeHata, eksik: son.eksik } } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Config GET & POST
app.get('/api/config', (req, res) => {
  res.json(disariConfig());
});

/**
 * SIRLAR YALNIZ YAZILIR. Okuma ucu yok — panel yalnızca "tanımlı mı"
 * bilgisini görür (`config.sirlar`). Boş değer anahtarı SİLER.
 */
/**
 * 73.0: /api/secrets çekirdeği — Ayarlar › Anahtarlar (lib/anahtarlar.js) da AYNI yolu kullanır (iki yer tutarlı kalsın).
 * Döndürür { durum, govde } (yanıtta sır yok). Sırlar kilitli/bozuksa yazmaz, 409 döner.
 */
function sirlariUygula(govde0) {
  const govde = govde0 && typeof govde0 === 'object' ? govde0 : {};
  if (SIRLAR_KILITLI) return { durum: 409, govde: { success: false, kilitli: true, error: `Sırlar yazılmadı: ${SIRLAR_KILITLI}` } };
  const gizli = loadSecrets();
  const red = (durum, error) => ({ durum, govde: { success: false, error } });
  // Önce HEPSİ doğrulanır: biri geçersizse hiçbiri yazılmaz (yarım kayıt olmasın).
  for (const k of SECRET_KEYS) {
    if (!(k in govde)) continue;
    const v = typeof govde[k] === 'string' ? govde[k].trim() : '';
    if (!v) continue;
    if (SAGLIK_URL_KEYS.includes(k)) {
      if (!saglikUrlGecerli(v)) return red(400, `${k} geçersiz — healthchecks ping URL'sini olduğu gibi yapıştırın (https://hc-ping.com/...)`);
    } else if (!/^[A-Za-z0-9]{16,128}$/.test(v)) {
      return red(400, `${k} biçimi geçersiz (16–128 harf/rakam)`);
    }
  }
  // 68.8: bot başına sağlık adresi { botSaglik: { denge: url | '' } } — Hücum'unki healthchecksUrl (geri uyum).
  const botGovde = govde.botSaglik && typeof govde.botSaglik === 'object' && !Array.isArray(govde.botSaglik) ? govde.botSaglik : null;
  if (botGovde) {
    for (const [ad, v] of Object.entries(botGovde)) {
      if (!BINDIRME_ADLAR.includes(ad) || ad === 'hucum') return red(400, `botSaglik.${ad}: bilinmeyen bot (Kairos'un adresi healthchecksUrl alanında)`);
      const u = typeof v === 'string' ? v.trim() : '';
      if (u && !saglikUrlGecerli(u)) return red(400, `${bindirmeArastirma.STRATEJILER[ad].ad} ping URL'si geçersiz — healthchecks ping URL'sini olduğu gibi yapıştırın (https://hc-ping.com/...)`);
    }
  }
  {
    // Kayıttan SONRAKİ adresler birbirinden farklı olmalı: her bot ve sunucu kalp atışı AYRI check (aynı URL bir botun durmasını gizler).
    const yeni = (k, eski) => (k in govde ? (typeof govde[k] === 'string' ? govde[k].trim() : '') : eski);
    const sonra = [[bindirmeArastirma.STRATEJILER.hucum.ad, yeni('healthchecksUrl', config.healthchecksUrl || '')], ['sunucu kalp atışı', yeni('healthchecksSunucuUrl', config.healthchecksSunucuUrl || '')],
      ...BINDIRME_ADLAR.filter(a => a !== 'hucum').map(a => [bindirmeArastirma.STRATEJILER[a].ad, botGovde && a in botGovde ? (typeof botGovde[a] === 'string' ? botGovde[a].trim() : '') : botSaglikUrl(config, a)])].filter(([, u]) => u);
    for (let i = 0; i < sonra.length; i++) for (let j = i + 1; j < sonra.length; j++) {
      if (sonra[i][1] === sonra[j][1]) return red(400, `${sonra[i][0]} ile ${sonra[j][0]} aynı ping URL'si olamaz — her bot (ve sunucu kalp atışı) healthchecks.io'da ayrı bir check olmalı; aynı adres bir botun durmasını gizler.`);
    }
  }
  const degisen = [];
  const bellek = [];   // 73.0: bellekteki config diske yazıldıktan SONRA değişir (yazılamazsa bellek de eski kalır)
  for (const k of SECRET_KEYS) {
    if (!(k in govde)) continue;
    const v = typeof govde[k] === 'string' ? govde[k].trim() : '';
    if (v) gizli[k] = v; else delete gizli[k];
    bellek.push(() => { config[k] = v; });
    degisen.push(k);
  }
  if (botGovde) {
    for (const [ad, v] of Object.entries(botGovde)) {
      const u = typeof v === 'string' ? v.trim() : '';
      const bs = { ...(gizli.bindirmeSaglik && typeof gizli.bindirmeSaglik === 'object' ? gizli.bindirmeSaglik : {}) };
      if (u) bs[ad] = u; else delete bs[ad];
      if (Object.keys(bs).length) gizli.bindirmeSaglik = bs; else delete gizli.bindirmeSaglik;
      bellek.push(() => {
        const onceki = { ...(((config.bindirme || {})[ad]) || {}) };
        if (u) onceki.healthchecksUrl = u; else delete onceki.healthchecksUrl;
        config.bindirme = { ...(config.bindirme || {}), [ad]: onceki };
      });
      degisen.push(`botSaglik.${ad}`);
    }
  }
  try { saveSecrets(gizli); } catch (e) { return red(409, e.message); }
  for (const f of bellek) f();
  engine.updateConfig(config);
  // Değer DEĞİL yalnız hangi alanın değiştiği loglanır.
  const saglikDegisti = degisen.some(k => SAGLIK_URL_KEYS.includes(k) || k.startsWith('botSaglik.'));
  const anahtarDegisti = degisen.some(k => !SAGLIK_URL_KEYS.includes(k) && !k.startsWith('botSaglik.'));
  if (anahtarDegisti) db.addLog('INFO', 'Borsa API anahtarları güncellendi.');
  if (saglikDegisti) db.addLog('INFO', `Sağlık sinyali (healthchecks) ayarı güncellendi: ${BINDIRME_ADLAR.map(a => `${bindirmeArastirma.STRATEJILER[a].ad} ${saglikBotlar[a].ayarli() ? 'ayarlı' : 'yok'}`).join(' · ')} · sunucu ${saglikSunucu.ayarli() ? 'ayarlı' : 'yok'}.`);
  return { durum: 200, govde: { success: true, sirlar: disariConfig().sirlar, degisen } };
}

app.post('/api/secrets', (req, res) => { const r = sirlariUygula(req.body || {}); res.status(r.durum).json(r.govde); });

app.post('/api/config', (req, res) => {
  // Maskeli ya da boş chat id geri gelirse (panel maskeli gösterir) kayıtlı değer korunur (Ö18 / A-04).
  const govde = req.body && req.body.telegram ? { ...req.body, telegram: guvenlikKur.chatIdYamaTemizle(req.body.telegram) } : req.body;
  config = mergeConfig(config, guvenlikKur.yamaTemizle(govde, SECRET_KEYS));
  botSaglikSirlariniYukle(config, loadSecrets());   // 68.8: yama bindirme bölümünü değiştirse de bot sağlık adresleri (sır) bellekte kalır
  saveConfig(config);
  engine.updateConfig(config);
  db.addLog('INFO', 'Sistem ve strateji parametreleri güncellendi.');
  broadcast('CONFIG_UPDATED', disariConfig());
  res.json({ success: true, config: disariConfig() });
});

// Custom Candle Import Endpoint (CSV/JSON upload)
app.post('/api/candles/import', (req, res) => {
  try {
    const { symbol, timeframe, candles } = req.body;
    if (!symbol || !candles || !Array.isArray(candles)) {
      return res.status(400).json({ success: false, error: 'Gereksiz veya eksik veri formatı' });
    }
    const count = engine.exchange.importCustomCandles(symbol, timeframe || '1h', candles);
    res.json({ success: true, count, message: `${count} mum verisi başarıyla yüklendi ve önbelleğe alındı` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Chart candles for the live monitor — serves the same cached/refreshed OHLCV the engine trades on
app.get('/api/candles', async (req, res) => {
  try {
    const symbol = req.query.symbol || config.symbol || 'BTC/USDT';
    const timeframe = req.query.timeframe || config.timeframe || '1h';
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 300, 30), 5000);

    const candles = await mumGetir(symbol, timeframe, limit);
    if (!candles || candles.length === 0) {
      return res.status(503).json({ success: false, error: `${symbol} (${timeframe}) için mum verisi alınamadı.` });
    }

    res.json({ success: true, symbol, timeframe, count: candles.length, candles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Watchlist Management & Multi-Timeframe Candle Preloading Endpoints ---

app.get('/api/watchlist', (req, res) => {
  const tf = req.query.timeframe || config.timeframe || '1h';
  const watchlist = config.watchlist || ["BTC/USDT", "ETH/USDT", "SOL/USDT", "AVAX/USDT", "XRP/USDT", "BNB/USDT", "LINK/USDT"];
  const detailedWatchlist = watchlist.map(sym => {
    const stats = db.getCandleCacheStats(sym, tf);
    return {
      symbol: sym,
      timeframe: tf,
      cachedCandles: stats ? stats.count : 0,
      lastFetched: stats ? stats.lastFetched : null
    };
  });
  res.json({ success: true, timeframe: tf, watchlist: detailedWatchlist });
});

app.post('/api/watchlist/add', async (req, res) => {
  try {
    let { symbol, timeframe } = req.body;
    if (!symbol) return res.status(400).json({ success: false, error: 'Sembol belirtilmedi' });

    symbol = symbol.trim().toUpperCase();
    if (!symbol.includes('/')) symbol = `${symbol}/USDT`;
    const tf = timeframe || '1h';

    if (!/^[A-Z0-9]{2,15}\/[A-Z0-9]{2,10}$/.test(symbol)) {
      return res.status(400).json({ success: false, error: `Geçersiz sembol biçimi: ${symbol} (örnek: SOL/USDT)` });
    }

    let watchlist = config.watchlist || [];
    if (!watchlist.includes(symbol)) {
      // Verify the pair actually trades before adding it — otherwise the entry
      // sits in the list forever returning no candles.
      const ticker = await engine.exchange.fetchTicker(symbol);
      if (!ticker || !ticker.last) {
        return res.status(400).json({ success: false, error: `${symbol} borsada bulunamadı veya fiyat alınamadı.` });
      }

      watchlist.push(symbol);
      config.watchlist = watchlist;
      saveConfig(config);
      engine.updateConfig(config);
      db.addLog('INFO', `İzleme Listesine Yeni Varlık Eklendi: ${symbol}`);

      // Background preload candles for newly added symbol across main timeframes
      engine.exchange.fetchOHLCV(symbol, tf, 500).catch(() => {});
      engine.exchange.fetchOHLCV(symbol, '4h', 500).catch(() => {});
    }

    res.json({ success: true, watchlist: config.watchlist });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/watchlist/remove', (req, res) => {
  try {
    let { symbol } = req.body;
    if (!symbol) return res.status(400).json({ success: false, error: 'Sembol belirtilmedi' });

    let watchlist = config.watchlist || [];
    config.watchlist = watchlist.filter(s => s !== symbol);
    saveConfig(config);
    engine.updateConfig(config);
    db.addLog('INFO', `İzleme Listesinden Varlık Çıkarıldı: ${symbol}`);

    res.json({ success: true, watchlist: config.watchlist });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/watchlist/preload', async (req, res) => {
  try {
    const { timeframe } = req.body;
    const tf = timeframe || config.timeframe || '1h';
    const watchlist = config.watchlist || [];
    
    // Preload requested timeframe
    await engine.exchange.preloadWatchlistCandles(watchlist, tf, 500);
    res.json({ success: true, message: `İzleme listesindeki varlıkların (${tf}) fiyat geçmişi önbelleğe yükleniyor` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bot Control: Start / Stop / Reset Kill-Switch
app.post('/api/start', (req, res) => {
  try {
    engine.start();
    res.json({ success: true, isRunning: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message, isRunning: false });
  }
});

app.post('/api/stop', (req, res) => {
  engine.stop();
  res.json({ success: true, isRunning: false });
});

app.post('/api/reset-kill-switch', (req, res) => {
  engine.resetKillSwitch();

  // The kill-switch stops the engine loop; without a start button in the
  // header, resetting has to bring the bots back up too.
  const eng = engine.getBots().length > 0 ? ensureEngineRunning() : { running: engine.isRunning };

  res.json({
    success: true,
    isRunning: eng.running,
    message: 'Kill-Switch sıfırlandı',
    warning: eng.error || null
  });
});

/**
 * Günlük zarar limitini gün bitmeden elle kaldırır. Kill-switch'ten farklı
 * olarak motoru durdurmadığı için yeniden başlatmaya gerek yoktur.
 */
app.post('/api/risk/reset-daily', (req, res) => {
  engine.riskManager.resetDailyHalt();
  res.json({
    success: true,
    daily: engine.riskManager.getDailyStatus(),
    message: 'Günlük zarar limiti sıfırlandı'
  });
});

/**
 * Drawdown ve toparlanma metrikleri. Sualtı eğrisi 240 noktaya indirildiği için
 * bile olsa her tick WebSocket'ten göndermek israf — panel bunu ayrı ve daha
 * seyrek çeker.
 *
 * `range`: kaç saatlik pencere (0 = tüm geçmiş).
 */
app.get('/api/risk/drawdown', (req, res) => {
  const hours = Math.max(0, parseInt(req.query.hours) || 0);
  const series = db.getEquityHistory(hours ? hours * 3600 * 1000 : 0);
  const stats = computeDrawdownStats(series, { underwaterPoints: 240 });

  res.json({
    success: true,
    hours,
    sampleSeconds: config.risk?.equitySampleSeconds || 60,
    ...stats
  });
});

/**
 * Korelasyondan küme haritası önerir — UYGULAMAZ.
 *
 * `risk.clusters` bugüne kadar elle yazılıyordu ve ölçüm bunun veriyle
 * uyuşmadığını gösterdi (tematik grupların iç korelasyonu 0.37–0.51, rastgele
 * iki varlığın ortalaması 0.48; gerçek grup BTC-ETH-SOL-XRP-LINK). Bu uç nokta
 * ölçülen haritayı `config.risk.clusters` biçiminde üretir, mevcut haritayla
 * yan yana koyar ve orada durur: risk parametresini değiştirmek kullanıcının
 * kararıdır, panel önce karşılaştırmayı gösterir.
 *
 * Mumlar YALNIZCA ÖNBELLEKTEN okunur — 16 sembol için borsaya gitmek hem yavaş
 * hem rate-limit riski; motor zaten watchlist'in önbelleğini taze tutuyor.
 */
app.post('/api/risk/cluster-scan', (req, res) => {
  try {
    const pool = require('./lib/indicatorPool');

    const timeframe = KNOWN_TIMEFRAMES.includes(req.body.timeframe) ? req.body.timeframe : (config.timeframe || '1h');
    const period = Math.min(Math.max(parseInt(req.body.period) || 500, 30), 5000);
    const threshold = Math.min(Math.max(parseFloat(req.body.threshold) ?? 0.7, -1), 1);
    const minBars = Math.min(Math.max(parseInt(req.body.minBars) || 200, 30), 5000);

    const symbols = Array.isArray(req.body.symbols) && req.body.symbols.length
      ? req.body.symbols
      : (config.watchlist || []);

    if (symbols.length < 2) {
      return res.status(400).json({ success: false, error: 'Küme taraması için en az iki sembol gerekir.' });
    }

    const seriesMap = {};
    const skipped = [];
    for (const sym of symbols) {
      const candles = db.getCandleCache(sym, timeframe, period + 50);
      if (!candles || candles.length < minBars) {
        skipped.push({ symbol: sym, bars: candles ? candles.length : 0, reason: `önbellekte ${minBars} bardan az veri` });
        continue;
      }
      seriesMap[sym] = candles;
    }

    if (Object.keys(seriesMap).length < 2) {
      return res.status(400).json({
        success: false,
        error: `Yeterli önbellek verisi olan sembol sayısı iki'den az (${timeframe}). Watchlist önyüklemesi yapın.`,
        skipped
      });
    }

    const out = pool.computeMulti(seriesMap, [
      { key: 'correlation_matrix', params: { period, threshold } }
    ]);
    const matris = out.correlation_matrix;

    // Ölçülemeyen semboller (bayat önbellek, eksik veri) TEKİL küme olarak
    // öneriye eklenir. Dışarıda bırakılsalardı riskManager hepsini tek bir
    // "Sınıflandırılmamış" kovaya atardı — ölçülmemiş olmak, birlikte hareket
    // ettikleri anlamına gelmez ve tek tavana bağlamak yanlış olurdu.
    const olculmeyen = [
      ...skipped.map(s => s.symbol),
      ...(out._dropped || []).map(d => d.symbol)
    ];
    const proposed = { ...matris.clusters };
    for (const sym of olculmeyen) {
      proposed[`${String(sym).split('/')[0]} (ölçülmedi)`] = [sym];
    }

    // Mevcut haritanın her kümesi için iç korelasyon: kullanıcının öneriyi
    // körlemesine kabul etmesi değil, farkı görmesi amaçlanıyor.
    const ortalamaKor = matris.averageCorrelation;
    const current = Object.entries(config.risk?.clusters || {}).map(([name, syms]) => {
      const uyeler = (Array.isArray(syms) ? syms : []).filter(s => matris.matrix[s]);
      const ciftler = [];
      for (let i = 0; i < uyeler.length; i++) {
        for (let j = i + 1; j < uyeler.length; j++) {
          const v = matris.matrix[uyeler[i]][uyeler[j]];
          if (Number.isFinite(v)) ciftler.push(v);
        }
      }
      const ic = ciftler.length ? ciftler.reduce((a, b) => a + b, 0) / ciftler.length : null;
      return {
        name,
        symbols: syms,
        measuredSymbols: uyeler.length,
        internalCorrelation: ic,
        // Taban ortalamanın altındaki küme, "birlikte düşerler" varsayımını
        // taşımıyor demektir — asıl bakılacak sayı bu fark.
        vsBaseline: ic === null || ortalamaKor === null ? null : ic - ortalamaKor
      };
    });

    res.json({
      success: true,
      timeframe,
      period,
      threshold,
      bars: out._times.length,
      sampleSize: matris.info.sampleSize,
      limitedBy: out._limitedBy || null,
      averageCorrelation: ortalamaKor,
      proposed,
      current,
      strongestPairs: matris.strongestPairs,
      skipped,
      dropped: out._dropped || []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trades & Logs
app.get('/api/trades', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
  const symbol = req.query.symbol;

  let trades = db.getTrades(500);
  if (symbol) {
    const clean = symbol.replace('/', '').toUpperCase();
    trades = trades.filter(t => (t.symbol || '').replace('/', '').toUpperCase() === clean);
  }

  res.json(trades.slice(0, limit));
});

app.get('/api/orders', (req, res) => {
  res.json(db.getOrders(100));
});

app.get('/api/balance-history', (req, res) => {
  res.json(db.getBalanceHistory(100));
});

app.get('/api/logs', (req, res) => {
  res.json(db.getLogs(100));
});

app.post('/api/position/close', async (req, res) => {
  try {
    const { symbol } = req.body;
    const targetSymbol = symbol || config.symbol;
    const balances = engine.exchange.getBalances();
    const targetClean = targetSymbol.replace('/', '').toUpperCase();
    const pos = balances.positions.find(p => p.symbol.replace('/', '').toUpperCase() === targetClean);

    if (!pos) {
      return res.status(400).json({ success: false, error: 'Kapatılacak açık pozisyon bulunamadı.' });
    }

    // Trigger 60s manual cooldown so strategy doesn't immediately re-buy on next tick
    engine.riskManager.triggerManualCooldown(60000);

    const ticker = await engine.exchange.fetchTicker(pos.symbol);
    if (!ticker || !ticker.last) {
      return res.status(503).json({ success: false, error: `${pos.symbol} için güncel fiyat alınamadı, pozisyon kapatılamadı. Lütfen tekrar deneyin.` });
    }

    const order = await engine.executeTrade('SELL', pos.symbol, pos.amount, ticker.last, 'Manuel Pozisyon Kapatma (Kullanıcı Talebi)');

    db.addLog('SUCCESS', `✖️ Manuel Pozisyon Kapatıldı: ${pos.symbol} ($${ticker.last})`);

    res.json({ success: true, message: `${pos.symbol} pozisyonu piyasa fiyatından kapatıldı.`, order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Manual paper-wallet adjustment (deposit / withdraw / set).
 * Open positions are untouched — only free cash changes.
 */
app.post('/api/wallet/balance', (req, res) => {
  try {
    const { mode, amount } = req.body;
    const value = Number(amount);

    if (!Number.isFinite(value)) {
      return res.status(400).json({ success: false, error: 'Geçerli bir tutar giriniz.' });
    }
    if (!['set', 'deposit', 'withdraw'].includes(mode)) {
      return res.status(400).json({ success: false, error: 'Geçersiz işlem tipi.' });
    }
    if (value < 0) {
      return res.status(400).json({ success: false, error: 'Tutar negatif olamaz.' });
    }

    const current = engine.exchange.paperBalances.USDT || 0;
    let next;
    if (mode === 'set') next = value;
    else if (mode === 'deposit') next = current + value;
    else next = current - value;

    if (next < 0) {
      return res.status(400).json({ success: false, error: `Yetersiz bakiye: mevcut $${current.toFixed(2)}, çekilmek istenen $${value.toFixed(2)}` });
    }

    engine.exchange.setCashBalance(next);

    const label = mode === 'set' ? 'Bakiye Ayarlandı' : (mode === 'deposit' ? 'Bakiye Eklendi' : 'Bakiye Çekildi');
    db.addBalanceEntry({
      prevBalance: +current.toFixed(2),
      newBalance: +next.toFixed(2),
      pnl: 0,
      details: `Manuel ${label.toLowerCase()} (kullanıcı işlemi)`
    });
    db.addLog('INFO', `💰 ${label}: $${current.toFixed(2)} → $${next.toFixed(2)}`);

    // Re-baseline the drawdown peak, otherwise a withdrawal reads as a loss and
    // can trip the kill-switch.
    const equity = engine.getTotalEquity();
    engine.riskManager.rebasePeak(equity);

    res.json({
      success: true,
      balance: next,
      equity,
      message: `${label}: $${next.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/clear-history', (req, res) => {
  db.clearHistory();
  res.json({ success: true });
});

app.post('/api/reset-all', (req, res) => {
  try {
    engine.resetAllData();
    res.json({ success: true, message: 'Tüm işlem geçmişi temizlendi ve bakiye $10.000.00 sıfırlandı.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * The one and only way to start bots: strategy + timeframe + symbols applied
 * together in a single transaction, so a half-applied configuration (old
 * strategy, new symbols) can never run.
 *
 * Starting a bot ADDS it — bots already running keep their own strategy and
 * timeframe. Re-running an asset reconfigures just that one.
 */
app.post('/api/bots/run', (req, res) => {
  try {
    const { strategy, timeframe, symbols } = req.body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ success: false, error: 'En az bir varlık seçilmelidir.' });
    }
    if (!KNOWN_STRATEGIES.includes(strategy)) {
      return res.status(400).json({ success: false, error: `Bilinmeyen strateji: ${strategy}` });
    }
    if (!KNOWN_TIMEFRAMES.includes(timeframe)) {
      return res.status(400).json({ success: false, error: `Geçersiz zaman dilimi: ${timeframe}` });
    }
    // Hücum / Denge portföy botudur (BTC ayağı + 15 coinlik Kalkan kolu ×3): motorun
    // sembol başına bot akışında yalnız BTC ayağı koşardı ve "bot çalışıyor" yanılgısı
    // doğardı. Kâğıt bot Canlı İzleme → "Portföy botları" alanından yönetilir.
    const katalogKaydi = strategyCatalog.get(strategy);
    if (katalogKaydi && katalogKaydi.portfoy) {
      return res.status(400).json({ success: false, error: `${katalogKaydi.label}: portföy botudur — Canlı İzleme → "Portföy botları (kâğıt)" alanından başlatın. Backtest sekmesinde strateji olarak seçilebilir.` });
    }

    const watchlist = config.watchlist || [];
    const unknown = symbols.filter(s => !watchlist.includes(s));
    if (unknown.length > 0) {
      return res.status(400).json({ success: false, error: `İzleme listesinde olmayan varlık: ${unknown.join(', ')}` });
    }

    const started = Array.from(new Set(symbols));

    // A bot is (symbol, strategy, timeframe). Adding BTC/15m next to BTC/1h
    // creates a second bot; re-running the exact same triple just refreshes it.
    config.bots = engine.getBots();

    const newBots = [];
    for (const symbol of started) {
      const id = TradingEngine.makeBotId(symbol, strategy, timeframe);
      if (!config.bots.some(b => b.id === id)) {
        config.bots.push({ id, symbol, strategy, timeframe });
        newBots.push(id);
      }
    }

    config.activeSymbols = Array.from(new Set(config.bots.map(b => b.symbol)));
    delete config.botConfigs;   // legacy one-bot-per-symbol map
    delete config.symbolConfigs; // legacy hidden overrides

    // Panel defaults for the next run
    config.activeStrategy = strategy;
    config.timeframe = timeframe;
    config.symbol = started[0];

    saveConfig(config);
    engine.updateConfig(config);

    const eng = ensureEngineRunning();
    if (!eng.running) {
      return res.status(409).json({ success: false, error: eng.error || 'Motor başlatılamadı.' });
    }

    const stratName = (config.strategies[strategy] && config.strategies[strategy].name) || strategy;
    const verb = newBots.length > 0 ? 'Başlatıldı' : 'Zaten Çalışıyor';
    db.addLog('SUCCESS', `⚡ Bot ${verb} — ${stratName} (${timeframe}): ${started.join(', ')} | Toplam Bot: ${config.bots.length}`);

    res.json({
      success: true,
      isRunning: true,
      strategy,
      strategyName: stratName,
      timeframe,
      startedSymbols: started,
      newBotCount: newBots.length,
      bots: config.bots,
      activeSymbols: config.activeSymbols
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


/** Stops every bot at once. Open positions are left untouched. */
app.post('/api/bots/stop-all', (req, res) => {
  try {
    const count = engine.getBots().length;
    config.bots = [];
    config.activeSymbols = [];
    delete config.botConfigs;

    saveConfig(config);
    engine.updateConfig(config);

    db.addLog('WARN', `⛔ Tüm Botlar Durduruldu (${count} bot).`);
    res.json({ success: true, stopped: count, bots: [], activeSymbols: [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Stops one bot by id. Other bots on the same asset keep running. */
app.post('/api/bots/stop', (req, res) => {
  try {
    const { botId } = req.body;
    if (!botId) return res.status(400).json({ success: false, error: 'Bot kimliği belirtilmedi' });

    const before = engine.getBots();
    const target = before.find(b => b.id === botId);
    if (!target) return res.status(404).json({ success: false, error: 'Bot bulunamadı' });

    config.bots = before.filter(b => b.id !== botId);
    config.activeSymbols = Array.from(new Set(config.bots.map(b => b.symbol)));
    delete config.botConfigs;

    saveConfig(config);
    engine.updateConfig(config);

    db.addLog('WARN', `⛔ Bot Durduruldu — ${target.symbol} ${target.strategy} (${target.timeframe}) | Kalan Bot: ${config.bots.length}`);
    res.json({ success: true, bots: config.bots, activeSymbols: config.activeSymbols });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Backtest Single Run Endpoint
app.post('/api/backtest', async (req, res) => {
  try {
    const { strategyName, symbol, timeframe, candlesCount, initialCapital, customConfig } = req.body;
    const targetSymbol = symbol || config.symbol;
    const tf = timeframe || '1h';
    const limit = parseInt(candlesCount) || 500;
    const stratKey = strategyName || config.activeStrategy;
    let stratConfig = customConfig || config.strategies[stratKey] || {};

    /**
     * VADELİ BACKTEST: kontrat özellikleri ve gerçek funding serisi motora
     * DIŞARIDAN verilmek zorunda — backtester sembolü bilmez (`'BACKTEST'` ile
     * çalışır). Panelden piyasa tipi "perpetual" seçildiğinde burada hazırlanır,
     * yoksa vadeli koşu sessizce sabit funding varsayımına ve yedek marj
     * kademelerine düşer.
     */
    if (venues.normalizeMarket(config.marketType) === 'perp' && String(config.marketType) !== 'spot') {
      try {
        const ek = await Backtester.perpConfig(targetSymbol, { venue: config.exchange }, {
          apiKey: config.apiKey, apiSecret: config.apiSecret
        });
        stratConfig = { ...stratConfig, ...ek, leverage: Math.max(1, Math.min(100, Number(config.leverage) || 1)) };
        if (!ek.fundingSeries.length) {
          db.addLog('WARN', `${targetSymbol} için depoda funding geçmişi yok — sabit varsayım kullanılacak. (Vadeli sekmesinden çekilebilir.)`);
        }
      } catch (e) {
        db.addLog('WARN', `Vadeli kurulum hazırlanamadı (${e.message}); spot varsayımlarıyla koşuluyor.`);
      }
    }

    db.addLog('INFO', `Backtest Başlatılıyor: ${stratKey} (${targetSymbol}, ${tf}, ${limit} Mum)`);

    const ohlcv = await engine.exchange.fetchOHLCV(targetSymbol, tf, limit);
    // Sinyal izi varsayılan AÇIK: tek koşuluk backtestte maliyeti düşük ve
    // "strateji doğru al-sat yapıyor mu" sorusunun tek kaynağı bu.
    // Optimizasyon/tarama gibi yüzlerce koşu yapan yollar izi istemez.
    const trace = req.body.trace !== false;
    const result = Backtester.run(stratKey, stratConfig, ohlcv, parseFloat(initialCapital) || 10000.0, tf, { trace });

    // The result travels to panels that do not know which form produced it, so
    // it carries its own market context for the price chart.
    result.symbol = targetSymbol;
    result.timeframe = tf;
    result.candleCount = ohlcv.length;

    db.addLog('SUCCESS', `Backtest Tamamlandı! Kâr: %${result.totalReturnPct} | WinRate: %${result.winRatePct} | Sharpe: ${result.sharpeRatio}`);
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * VADELİ: kayıtlı borsalar ve kontrat özellikleri.
 *
 * `tiersSource` alanı kritik: `'varsayim'` dönüyorsa likidasyon fiyatı
 * yaklaşıktır (Binance kaldıraç kademelerini anahtarsız vermiyor) ve panelde
 * bunun görünmesi gerekir.
 */
app.get('/api/venues', async (req, res) => {
  try {
    const liste = venues.listVenues();
    const symbol = req.query.symbol;
    let specs = null;
    if (symbol) {
      specs = await venues.contractSpecs(
        req.query.venue || config.exchange, 'perp', symbol,
        { apiKey: config.apiKey, apiSecret: config.apiSecret }
      );
    }
    res.json({ success: true, venues: liste, specs });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/** Tarihsel funding oranlarını borsadan çeker ve depoya yazar. */
app.post('/api/funding/fetch', async (req, res) => {
  try {
    const symbol = req.body.symbol || config.symbol;
    const venue = (req.body.venue || config.exchange || 'binance').toLowerCase();
    const kayitlar = await venues.fetchFundingHistory(venue, symbol, undefined, {
      apiKey: config.apiKey, apiSecret: config.apiSecret
    });
    const n = db.saveFundingHistory(symbol, kayitlar, { venue, market: 'perp' });
    const stats = db.getFundingStats(symbol, { venue, market: 'perp' });
    db.addLog('SUCCESS', `💰 ${symbol} funding geçmişi güncellendi: ${n} kayıt (${venue}).`);
    res.json({ success: true, saved: n, stats });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/** Depodaki funding durumu (panelde "veri var mı" göstergesi). */
app.get('/api/funding/stats', (req, res) => {
  try {
    const symbol = req.query.symbol || config.symbol;
    const venue = (req.query.venue || config.exchange || 'binance').toLowerCase();
    res.json({ success: true, stats: db.getFundingStats(symbol, { venue, market: 'perp' }) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Automated Strategy Parameter Grid Search & Optimizer Endpoint for single asset
app.post('/api/backtest/optimize', async (req, res) => {
  try {
    const { strategyName, symbol, timeframe, candlesCount, initialCapital, optimizeParams } = req.body;
    const targetSymbol = symbol || config.symbol;
    const tf = timeframe || '1h';
    const limit = parseInt(candlesCount) || 500;
    const stratKey = strategyName || config.activeStrategy;
    if (!strategyCatalog.has(stratKey)) {
      return res.status(400).json({ success: false, error: `Bilinmeyen strateji: ${stratKey}` });
    }
    const baseConfig = { ...ayarlariAl(stratKey) };
    // Kullanıcı hangi parametrelerin aranacağını seçebilir; seçmezse strateji
    // kendi varsayılan seçimini yapar.
    if (Array.isArray(optimizeParams) && optimizeParams.length) baseConfig.__optimizeParams = optimizeParams;

    db.addLog('INFO', `⚡ PARAMETRE OPTİMİZATÖRÜ BAŞLATILDI: ${stratKey} (${targetSymbol}, ${tf}, ${limit} Mum)...`);

    const ohlcv = await engine.exchange.fetchOHLCV(targetSymbol, tf, limit);
    const optimizationResult = Backtester.optimizeParameters(stratKey, baseConfig, ohlcv, parseFloat(initialCapital) || 10000.0, tf);
    optimizationResult.plan = optimizasyonPlani(stratKey, baseConfig);

    db.addLog('SUCCESS', `🎯 OPTİMİZASYON TAMAMLANDI! ${optimizationResult.testedPermutations} Kombinasyon Test Edildi.`);
    res.json({ success: true, optimizationResult });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Panel bu ucu KULLANMIYOR (panel `/api/backtest/is` iş akışında). Kalma sebebi:
// `scripts/pine-uc-testi.js` eski senkron yolu da sınıyor. (Pusula P4: iş parçacığı
// lib/backtest/isci.js içe aktarılan Pine'ı da koşar — kaynak iş verisinde gider.)
// Walk-forward: kayan pencere, %70 eğitim / %30 test (`lib/backtest/optimize.js`)
app.post('/api/backtest/walk-forward', async (req, res) => {
  try {
    const { strategyName, symbol, timeframe, candlesCount, initialCapital, optimizeParams, katSayisi } = req.body;
    const targetSymbol = symbol || config.symbol;
    const tf = timeframe || '1h';
    const limit = parseInt(candlesCount) || 500;
    const stratKey = strategyName || config.activeStrategy;
    if (!strategyCatalog.has(stratKey)) {
      return res.status(400).json({ success: false, error: `Bilinmeyen strateji: ${stratKey}` });
    }
    const baseConfig = { ...ayarlariAl(stratKey) };
    if (Array.isArray(optimizeParams) && optimizeParams.length) baseConfig.__optimizeParams = optimizeParams;

    db.addLog('INFO', `🧪 Walk-forward başladı: ${stratKey} (${targetSymbol}, ${tf}, ${limit} mum)`);

    const ohlcv = await engine.exchange.fetchOHLCV(targetSymbol, tf, limit);
    const walkForwardResult = Backtester.runWalkForward(stratKey, baseConfig, ohlcv, parseFloat(initialCapital) || 10000.0, tf, { katSayisi });
    walkForwardResult.plan = optimizasyonPlani(stratKey, baseConfig);
    walkForwardResult.symbol = targetSymbol;
    walkForwardResult.timeframe = tf;

    db.addLog('SUCCESS', `✅ Walk-forward bitti: WFE ${walkForwardResult.wfe == null ? '—' : '%' + walkForwardResult.wfe} · ${walkForwardResult.overfittingStatus}`);
    res.json({ success: true, walkForwardResult });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * STRATEJİ ARAŞTIRMASI — ölçülmüş adaylar (`lib/research/adaylar.js`) ve
 * yeniden ölçüm. Ölçüm `data/market.db`deki 4h perp mumlarından ve funding
 * kayıtlarından yapılır (ağ yok); veri `scripts/vadeli-veri-cek.js` ile tazelenir.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TARİH ARALIKLI BACKTEST — veri indirme + iş parçacığında koşu (2026-10-06)
 * ═══════════════════════════════════════════════════════════════════════════
 * Eski `/api/backtest` "son N mum" alıyor (en çok 5000) ve senkron koşuyordu.
 * Yeni akış: panel [bas, bit] + piyasa + borsa seçer → eksik mumlar (vadelide
 * funding de) indirilir → koşu `worker_threads` içinde → sonuç seyreltilmiş
 * rapor. Panelin borsa/piyasa seçimi CANLI AYARA YAZILMAZ — eski form
 * backtest borsasını değiştirince botun borsasını da sessizce değiştiriyordu.
 */
const aralikVeri = require('./lib/veri/aralik');
const { Isler } = require('./lib/isler');
const isler = new Isler((tur, veri) => broadcast(tur, veri));

/**
 * PORTFÖY LABORATUVARI (lib/portfoy/api.js, 2026-10-07): katalog, seri, simülasyon / varyasyon (iş parçacığında, aynı iş
 * kuyruğu), uygulama planı, karar günlüğü, kayıtlı portföyler. Araştırma modunda da açık (ARASTIRMA_KAPALI'ya takılmaz).
 * Veri güncellemesi artık VERİ ORKESTRATÖRÜNDE (aşağıda).
 */
const portfoyLab = require('./lib/portfoy/api');
app.use(portfoyLab.router({ isler, log: (lv, msg) => db.addLog(lv, msg) }));

/**
 * VERİ ORKESTRATÖRÜ (lib/veri/orkestrator.js, 2026-10-07): tüm veri kaynakları tek kayıt defterinde (Binance günlük +
 * PIT arşivi + TradFi listesi, Yahoo, TEFAS, EVDS, TÜFE, USD/TRY, kol önbelleği, portföy kataloğu). Açılıştan ~2 dk sonra
 * bayat olanlar, her gece 04:30 sonrası (eski portföy zamanlayıcısının YERİNE — tek zamanlayıcı), simülasyon / backtest
 * bayat seriye dokununca arka planda (talep), panelden ya da `npm run veri:guncelle` ile elle. Canlı botun kendi borsa
 * okumalarına dokunmaz. Uçlar GET /api/veri/durum, POST /api/veri/guncelle (araştırma modunda da açık).
 * VERI_ORKESTRATOR=0 (ya da eski PORTFOY_GUNCELLEME=0) zamanlayıcıyı ve talep tetiğini kapatır.
 */
const veriOrkestrator = require('./lib/veri/orkestrator');
const veriOrk = veriOrkestrator.varsayilan({ log: (lv, msg) => db.addLog(lv, msg) });
// O10 (62.0): gece veri güncellemesi günde 3 kez başarısızsa Telegram uyarısı.
veriOrk.alarm = (baslik, satirlar) => portfoyBildirici.gonder('uyari', baslik, satirlar, { anahtar: 'veri-gece', kisitMs: 20 * 3600e3 });
veriOrkestrator.hariciBagla('ileri-bollinger', () => ({ calisiyor: ileriIs.calisiyor, sonHata: ileriIs.sonHata }));
app.use(veriOrk.router());
veriOrk.zamanlayiciBaslat();

/**
 * COIN TARAMA + LİSTE KAYDI (lib/tarama, sürüm 60.3): ileriye dönük günlük zincir üstü tarama (GoPlus / RugCheck /
 * DexScreener / RDAP / borsa fiyatı → data/tarama, yalnız eklenir) ve arkadaşın coin listelerinin SHA-256 zincirli
 * kaydı (data/tarama/listeler.jsonl + kayitlar/listeler/ dışa aktarımı). ALIM/SATIM YAPMAZ; lib/live ve lib/risk'e
 * dokunmaz. Panel açılınca (POST /api/tarama/otomatik) ve 10 dk'lık zamanlayıcıyla son başarılı tarama `otomatikSaat`ten
 * (varsayılan 20 sa) eskiyse arka planda koşar; aynı anda iki koşu yok (dosya kilidi). Telegram yalnız tarama
 * ayarlarından açılırsa (varsayılan kapalı), Bildirici'nin tekrar kısıtıyla. Binance istekleri orkestratörün kota
 * sayacından ve ortak 418/429 beklemesinden geçer. Uçlar araştırma modunda da açık (bot/borsa/emir değil). TARAMA=0
 * zamanlayıcıyı kapatır.
 */
const taramaSistemi = require('./lib/tarama').kur({
  log: (lv, msg) => db.addLog(lv, msg),
  bildirici: portfoyBildirici,
  kota: () => new veriOrkestrator.BinanceKota({ bekleme: veriOrk.binanceBeklemeErisimi('coin tarama') }),
});
app.use(taramaSistemi.router());
veriOrkestrator.hariciBagla('coin-tarama', () => taramaSistemi.hariciDurum());
try { taramaSistemi.zincirTazele(); } catch (e) { db.addLog('WARN', `📋 Liste kayıt zinciri okunamadı: ${e.message}`); }
taramaSistemi.zamanlayiciBaslat();
// İLERİYE KAYIT (73.3, lib/ileriKayit): ham piyasa verisi kayıtçıları — karar/emir yok; araştırma kopyasında çalışmaz. GET /api/ileri-kayit/durum.
require('./lib/ileriKayit').kur({ app, log: (lv, msg) => db.addLog(lv, msg), ozDenetim, binanceBekleme: veriOrk.binanceBeklemeErisimi('ileriye kayıt') });

/**
 * ARAŞTIRMA DEFTERİ (lib/defter.js, sürüm 60.6, PLAN-DIKKAT-LISTESI §5 Ş1): deneme sayacının kanonik kaydı
 * `kayitlar/denemeler.jsonl` (DEFTER_DOSYA ile değişir). GET /api/defter = kayıtlar + özet + denetim hataları;
 * POST /api/defter YALNIZ yeni kayıt ekler (çakışma/boşluk reddi, geçici dosya + rename). Düzeltme/silme ucu yok.
 * Sunucu git çalıştırmaz. Telefon kademesinde POST lib/guvenlik.js'te 403 (beyaz listede değil). Araştırma modunda açık.
 */
app.use(require('./lib/defter').router({ log: (lv, msg) => db.addLog(lv, msg) }));

/*
 * GÜNLÜKLER (lib/gunluk.js, PLAN-PANEL-2): db.addLog'a düşen her satır ayrıca data/gunluk/<gün>.jsonl'e tek biçimle yazılır
 * (zaman · seviye · kaynak · bot · mesaj; 30 gün). GET /api/gunluk (süz + son 24 s özeti), GET /api/gunluk.csv. Salt okuma.
 */
app.use(require('./lib/gunluk').router(GUNLUK));
// Bildirim merkezi uçları: GET /api/bildirim (katalog + son gönderilenler + Telegram durumu), POST /api/bildirim/ayar { tur, acik }.
// 73.5: + POST /api/bildirim/{tur,sessiz,uretici,onizle}; GET'e üretici durumu (makine nabızları, son KAP/fiyat/anahtar denetimi).
let bildirimUreticileri = null;
app.use(require('./lib/bildirimMerkezi').router(BILDIRIM, { durum: () => portfoyBildirici.durum(), ek: () => (bildirimUreticileri ? bildirimUreticileri.durum() : { arastirma: ARASTIRMA_MODU }), log: (lv, msg) => db.addLog(lv, msg) }));
/**
 * 73.5 MAKİNE NABZI: araştırma kopyası (sunucu bağlantısı kurulu) 10 dk'da bir GET /api/makine/nabiz — başlık x-pusula-makine (bilgisayar
 * adı), x-pusula-surum. Yalnız sunucuda ve jetonla gelen istekte (telefon / geliştirme kademesi) kaydedilir; yerel istek ve başlıksız
 * istek kayıt yazmaz. Yanıtta sır yok.
 */
app.get('/api/makine/nabiz', (req, res) => {
  const ad = String(req.headers['x-pusula-makine'] || '');
  const kaydedildi = !!(bildirimUreticileri && ad && req.kademe && req.kademe !== 'yerel' && bildirimUreticileri.nabizKaydet(ad, { surum: req.headers['x-pusula-surum'], tur: 'arastirma' }));
  res.json({ success: true, kaydedildi, surum: APP_VERSION });
});

/*
 * RAPOR MOTORU (lib/rapor.js, PLAN-PANEL-2): her gün 09:00'dan sonra dünün günlük raporu; son biten haftanın, ayın ve (ocakta) yılın raporu (67.5)
 * (botlar: değer değişimi, işlemler, ücret · model emirleri · portföy botlarının tercihleri). Girdi sunucunun kendi uçlarından
 * (127.0.0.1); arşiv data/raporlar/; Telegram'a 📋 özeti (bildirim merkezi türü "rapor"). Araştırma kopyasında zamanlayıcı yok.
 * GET /api/rapor/liste · GET /api/rapor?tur=&bas= · POST /api/rapor/olustur { tur, gun, telegram }.
 */
const RAPOR = require('./lib/rapor').olusturucu({ kok: __dirname, port: process.env.PORT || 3000, log: (lv, msg) => db.addLog(lv, msg),
  gonder: (metin) => engine.telegram.sendMessageDetailed(metin) });
app.use(require('./lib/rapor').router(RAPOR));
if (!ARASTIRMA_MODU && process.env.RAPOR !== '0') RAPOR.baslat();

/**
 * PORTFÖYÜM (lib/portfoyum, sürüm 60.8, PLAN-PORTFOYUM §0): gerçek portföyün ELLE kaydı — kurum/hesap/varlık, açılış
 * bakiyesi, işlem defteri (yalnız eklenir; iptal = ters kayıt), değerleme (kendi para biriminde maliyet/K-Z; toplam USD ve
 * TL), TWR getiri, hedef dağılım, kur çevirici. Veri data/portfoyum/ (git dışı). Harcama'ya dokunmaz, borsa bakiyesi
 * okumaz, emir vermez. GET'ler telefonda da açık; POST/PUT telefon kademesinde lib/guvenlik.js 403 (beyaz listede değil).
 * Günlük anlık görüntü: panel açılınca (GET /api/portfoyum/ozet) + saatlik zamanlayıcı (PORTFOYUM_ANLIK=0 kapatır).
 */
const portfoyum = require('./lib/portfoyum/api').kur({ log: (lv, msg) => db.addLog(lv, msg) });
app.use(portfoyum.router);
if (process.env.PORTFOYUM_ANLIK !== '0') setInterval(() => { try { portfoyum.anlikTazele(); } catch (e) { db.addLog('WARN', `Portföyüm anlık görüntü: ${e.message}`); } }, 60 * 60 * 1000).unref();

/**
 * İŞLEM DEFTERİ (lib/islemDefteri, 64.7): kullanıcının KENDİ kripto/FX işlemleri (OKX, Binance geçmişi, MetaTrader 4/5) —
 * Portföy › İşlem defterim. Botlardan ve Portföyüm'den ayrı. Veri data/islem-defteri/ (git dışı, yalnız eklenir). GET'ler
 * telefonda da açık (ve geliştirme bilgisayarında lib/evOkuma.js ile sunucudan okunur); POST'lar telefonda 403 (lib/guvenlik.js),
 * araştırma modunda 403 (kayıtlar evde). OKX salt okuma anahtarı data/secrets.json `islemDefteri.okx` altında — panele/yanıta
 * hiç dönmez; trade/withdraw izinli anahtar reddedilir. Günlük OKX eşitlemesi yalnız sunucuda (araştırma modunda kapalı;
 * ISLEM_DEFTERI_ESITLE=0 kapatır). Emir yok, Telegram yok (K6).
 * 65.0: Binance salt okuma eşitlemesi (lib/islemDefteri/binanceApi.js) aynı yolla — anahtar `islemDefteri.binance` altında (bot anahtarlarından
 * AYRI; apiRestrictions'ta yalnız okuma açık değilse reddedilir), aynı saatlik zamanlayıcı (gunlukEsitle: OKX + Binance; spot tam tarama
 * bitene kadar her saat kaldığı yerden).
 * 64.8: geliştirme bilgisayarında (sunucu bağlantısı + yazma jetonu) yazmalar sunucuya iletilir/kuyruğa girer (lib/evYazma.js, yukarıda);
 * OKX anahtarı o bilgisayarın kendi secrets.json'unda, "Şimdi eşitle" yalnız elle (otomatik günlük eşitleme yalnız evde).
 */
const islemDefteri = require('./lib/islemDefteri/api').kur({
  log: (lv, msg) => db.addLog(lv, msg), arastirma: ARASTIRMA_MODU, mumDeposu: db.candleStore,
  kurSerileri: () => require('./lib/portfoyum/fiyat').kurSerileri(require('./lib/portfoyum/depo').jsonOku('kurlar.json')),
  sirlar: { oku: () => loadSecrets().islemDefteri || {}, yaz: (ns) => { const g = loadSecrets(); g.islemDefteri = ns; saveSecrets(g); } },
  // 64.8: geliştirme bilgisayarında OKX anahtarı burada; hesaplar sunucudaki listeden, eşitleme sonucu sunucuya (ya da kuyruğa)
  ev: EV_BAGLANTI_ETKIN ? {
    kurulu: () => !!evOkuma.ayar(),
    hesap: async (id) => { const r = await evOkuma.jsonGetir('/api/islem-defteri/ozet'); return (r && r.govde && Array.isArray(r.govde.hesaplar) && r.govde.hesaplar.find(h => h.id === id)) || null; },
    gonder: (yol, govde) => evYazma.yaz('POST', yol, govde)
  } : null
});
app.use(islemDefteri.router);

/**
 * 73.0 AYARLAR › ANAHTARLAR (lib/anahtarlar.js, Faz 1 "makine × hesap × bot"): kayıtlı bütün sırlar maskeli tek tabloda; ekle / değiştir /
 * sil ACİL PIN + onay; salt okuma sınama (lib/anahtarSinama.js, emir yok); araştırma kopyasında sunucudaki liste + iletme + GİZLİ bekleyen
 * dosyası; eski şifreli sır dosyasını silmeden kenara alma; acil PIN değiştirme. Botların çalışma şekli değişmez: sabit Binance satırları
 * eski alanlara yazar (sirlariUygula = /api/secrets), İşlem defterim anahtarları islemDefteri.anahtarIslemleri ile.
 */
const anahtarlar = require('./lib/anahtarlar').olustur({
  arastirma: ARASTIRMA_MODU,
  sir: { oku: loadSecrets, yaz: saveSecrets, kilit: () => SIRLAR_KILITLI },
  acilPin, veri: (ad) => yollar.veri(ad), log: (lv, msg) => db.addLog(lv, msg),
  bilgi: () => ({
    botlar: BINDIRME_ADLAR.map(ad => ({ kimlik: ad, ad: require('./lib/botAdlari').ad(ad) || ad, mod: bindirmeler[ad] ? bindirmeler[ad].mod : null })),
    telegramAcik: !!(config.telegram && config.telegram.enabled), panelJetonuEnv: (process.env.PANEL_TOKEN || '').length >= 24,
    gelistirmeJetonu: fs.existsSync(guvenlikKur.gelistirmeJetonYolu(__dirname))
  }),
  sirlariUygula,
  telegramUygula: (jeton) => {
    if (SIRLAR_KILITLI) return { durum: 409, govde: { success: false, kilitli: true, error: `Sırlar yazılmadı: ${SIRLAR_KILITLI}` } };
    const gizli = loadSecrets();
    const tg = { ...(gizli.telegram || {}) };
    if (jeton) tg.botToken = jeton; else delete tg.botToken;
    if (Object.keys(tg).length) gizli.telegram = tg; else delete gizli.telegram;
    try { saveSecrets(gizli); } catch (e) { return { durum: 409, govde: { success: false, error: e.message } }; }
    config.telegram = { ...(config.telegram || {}), botToken: jeton || '' };
    engine.updateConfig(config);
    broadcast('CONFIG_UPDATED', disariConfig());
    return { durum: 200, govde: { success: true } };
  },
  defter: islemDefteri.anahtarIslemleri,
  sina: {
    borsa: (h) => require('./lib/anahtarSinama').borsaSina(h),
    defter: (borsa, a) => require('./lib/anahtarSinama').defterSina(borsa, a),
    telegram: (t) => require('./lib/anahtarSinama').telegramSina(t),
    saglik: async (alt) => { const s = alt === 'sunucu' ? saglikSunucu : saglikBotlar[alt]; if (!s) return { ok: false, hata: 'bilinmeyen bot' }; const r = await s.ping('basari'); return { ok: !!r.ok, hata: r.ok ? null : (r.hata || 'gönderilemedi') }; }
  },
  ev: EV_BAGLANTI_ETKIN ? {
    kurulu: () => !!evOkuma.ayar(), yazmaKurulu: () => evYazma.yazmaAyari(), adres: () => (evOkuma.ayar() || {}).adres || null,
    oku: (yol) => evOkuma.jsonGetir(yol), yaz: (yol, govde) => evYazma.yaz('POST', yol, govde, { kuyruk: false })
  } : null,
  kasaSonrasi: (ad) => { if (ad === 'secrets.json') { SIRLAR_KILITLI = null; db.addLog('INFO', 'secrets.json kenara alındı — sırlar artık panelden yeniden girilebilir.'); } }
});
anahtarYonlendirici = anahtarlar.router;

/*
 * 73.5 BİLDİRİM ÜRETİCİLERİ (lib/bildirimUreticileri.js): bilanço (KAP), makine sessiz, gölge testler haftalık özeti, anahtar sınaması
 * (salt okuma, günde bir), sert fiyat hareketi. YALNIZ SUNUCU — araştırma kopyasında kurulmaz (Telegram yalnız sunucudan). Karar/emir yok.
 */
function bistKodlari() {
  const s = new Set();
  try {   // Lydia (BIST M10) kâğıt hesabının açık pozisyonları
    const j = JSON.parse(fs.readFileSync(yollar.veri('tasarimci', 'kagit.json'), 'utf8'));
    for (const p of (((j.modeller || {})['m-bist-m10'] || {}).pozisyonlar || [])) if (p && p.s && Number(p.adet) > 0) s.add(String(p.s));
  } catch { /* kâğıt hesap yok */ }
  try {   // Portföyüm: TRY hisse varlıkları (adet > 0)
    const { D, muh } = require('./lib/portfoyum/depo').yukle();
    for (const c of muh.ciftler.values()) {
      if (c.nakit || !(c.ana && c.ana.adet > 1e-9)) continue;
      const v = D.varliklar.get(c.varlik);
      if (v && v.sinif === 'hisse' && v.para === 'TRY') s.add(String(v.kod || v.sembol).replace(/\.IS$/i, ''));
    }
  } catch { /* Portföyüm yok */ }
  return [...s];
}
// Geliştirme bilgisayarında (TELEGRAM_GELISTIRME_ENGELI: data/makine.json, sunucu bağlantısı) da kurulmaz — öz testlerin açtığı sunucular dahil.
if (!ARASTIRMA_MODU && !TELEGRAM_GELISTIRME_ENGELI) {
  bildirimUreticileri = require('./lib/bildirimUreticileri').olustur({
    durumDosya: yollar.veri('bildirim-uretici.json'), merkez: BILDIRIM,
    gonder: (tur, parcalar, degiskenler) => engine.telegram.sendMessageDetailed(require('./lib/bildirimMetinleri').varsayilanKur({ zaman: require('./lib/bildirimMetinleri').kisaZaman(), ...parcalar }), { tur, parcalar, degiskenler }),
    log: (lv, msg) => db.addLog(lv, msg),
    kaynaklar: { bistKodlari, golgeSatirlari: () => require('./lib/golgeOzet').satirlar(), anahtarSina: () => anahtarlar.otoSina() },
  });
}
if (!ARASTIRMA_MODU && process.env.ISLEM_DEFTERI_ESITLE !== '0') {
  const idEsitle = () => { islemDefteri.gunlukEsitle().catch(e => db.addLog('WARN', `İşlem defteri OKX/Binance eşitleme: ${e.message}`)); };
  setTimeout(idEsitle, 3 * 60 * 1000).unref();
  setInterval(idEsitle, 60 * 60 * 1000).unref();
}

/**
 * PORTFÖY TASARIMCISI F2 (lib/tasarimci, PLAN-PORTFOY-TASARIMCI.md): model portföy NAV motoru (m-837, m-qqq-m10, m-bist-m10
 * + kıyaslar), yalnız eklenen defter data/tasarimci/{kararlar,dolumlar,gunluk}.jsonl, 30 dk zamanlayıcı (veri talebi
 * süreç içi, ağır hesap ALT SÜREÇTE scripts/tasarimci-tik.js; TASARIMCI=0 kapatır). GET /api/tasarimci/* telefonda da açık
 * ve dosya yazmaz; POST /api/tasarimci/yenile telefon kademesinde lib/guvenlik.js 403. Araştırma modunda da açık (kayıtlar
 * `deneme: true`). Emir vermez, borsaya bağlanmaz, Telegram'a bir şey yollamaz.
 */
const tasarimciZaman = require('./lib/tasarimci/zamanlayici').kur({ log: (lv, msg) => db.addLog(lv, msg), veriOrk,
  // O10 (62.0): ardışık tik hatası Telegram'a (araştırma modunda Telegram zaten kapalı).
  alarm: (baslik, satirlar) => portfoyBildirici.gonder(/yeniden çalışıyor/.test(baslik) ? 'bilgi' : 'uyari', baslik, satirlar, { anahtar: `tasarimci:${baslik}` }) });
app.use(require('./lib/tasarimci/api').router({ zamanlayici: tasarimciZaman, log: (lv, msg) => db.addLog(lv, msg) }));
tasarimciZaman.baslat();

/** İstekten veri kaynağı: borsa, piyasa, sembol, dilim, [bas, bit] (ms). */
function kaynakOku(g) {
  const tf = g.timeframe || g.tf || '1h';
  aralikVeri.tfMs(tf);   // desteklenmeyen dilimde hata atar
  const market = venues.normalizeMarket(g.market || g.marketType || 'spot');
  const bas = g.bas != null && g.bas !== '' ? Date.parse(g.bas) : 0;
  const bit = g.bit != null && g.bit !== '' ? Date.parse(g.bit) + (String(g.bit).length <= 10 ? 864e5 - 1 : 0) : Date.now();
  if (!Number.isFinite(bas) || !Number.isFinite(bit)) throw new Error('Tarih okunamadı (YYYY-AA-GG bekleniyor)');
  if (bit <= bas) throw new Error('Bitiş tarihi başlangıçtan sonra olmalı');
  return { venue: String(g.venue || g.exchange || 'binance').toLowerCase(), market, sembol: g.symbol || config.symbol, tf, bas, bit };
}

/** Vadelide funding geçmişini aralığın başından itibaren tamamlar. */
async function fundingTamamla(k) {
  if (k.market !== 'perp') return 0;
  const ds = aralikVeri.depoSembolu(k.sembol, k.market);
  const st = db.candleStore.fundingStats(ds, { venue: k.venue, market: 'perp' }) || {};
  const ilk = st.firstTime || st.ilk || null, son = st.lastTime || st.son || null;
  let since = null;
  if (!ilk || ilk > k.bas + 864e5) since = Math.max(k.bas, Date.UTC(2019, 0, 1));
  else if (!son || son < Date.now() - 9 * 3600e3) since = son + 1;
  if (since == null) return 0;
  const kayitlar = await venues.fetchFundingHistory(k.venue, ds, since);
  if (kayitlar.length) db.candleStore.saveFunding(ds, kayitlar, { venue: k.venue, market: 'perp' });
  return kayitlar.length;
}

app.get('/api/veri/kapsam', async (req, res) => {
  try {
    const k = kaynakOku(req.query);
    let ilk = null;
    try { ilk = await aralikVeri.ilkMum(k.venue, k.market, k.sembol, k.tf); } catch (e) { /* ağ yoksa depoyla yetin */ }
    const kap = aralikVeri.kapsam(db.candleStore, { ...k, ilk });
    const depo = db.candleStore.stats(kap.depoSembolu, k.tf, { venue: k.venue, market: k.market });
    res.json({ success: true, ilk, kapsam: kap, depo });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/veri/indir', async (req, res) => {
  let k;
  try { k = kaynakOku(req.body || {}); } catch (err) { return res.status(400).json({ success: false, error: err.message }); }
  const is = isler.yeni('indir', `${k.venue} ${k.market} ${k.sembol} ${k.tf}`);
  res.json({ success: true, is: isler.ozet(is) });
  try {
    const r = await aralikVeri.indir(db.candleStore, { ...k,
      ilerleme: (p) => isler.guncelle(is, p.yuzde / 100 * 0.95, `${p.indirilen.toLocaleString('tr-TR')} / ${p.toplam.toLocaleString('tr-TR')} mum`),
      iptal: () => is.iptal });
    const f = await fundingTamamla(k);
    db.addLog('SUCCESS', `📥 Veri indirildi: ${k.sembol} ${k.tf} ${k.market} · ${r.indirilen} mum, ${r.istek} istek, ${(r.sure / 1000).toFixed(0)} sn${f ? ` · ${f} funding` : ''}`);
    isler.bitir(is, { indirilen: r.indirilen, istek: r.istek, sure: r.sure, funding: f, kapsam: r.kapsam });
  } catch (err) {
    isler.hata(is, err.message);
  }
});

/**
 * Backtest / optimizasyon / walk-forward işi. Gövde:
 * { tur: 'tek'|'optimize'|'walkforward', strategyName, symbol, timeframe,
 *   market, venue, leverage, bas, bit, initialCapital, customConfig,
 *   optimizeParams, katSayisi }
 */
app.post('/api/backtest/is', async (req, res) => {
  const g = req.body || {};
  let k;
  try {
    k = kaynakOku(g);
    if (g.tur !== 'tarama' && !strategyCatalog.has(g.strategyName)) throw new Error(`Bilinmeyen strateji: ${g.strategyName}`);
  } catch (err) { return res.status(400).json({ success: false, error: err.message }); }

  // İZLEME LİSTESİ TARAMASI: her varlığın aralığı tamamlanır, sonra tek iş parçacığı.
  if (g.tur === 'tarama') {
    const liste = (config.watchlist || []).map(x => (typeof x === 'string' ? x : x.symbol)).filter(Boolean);
    if (!liste.length) return res.status(400).json({ success: false, error: 'İzleme listesi boş' });
    const is = isler.yeni('tarama', `${liste.length} varlık · ${k.tf} ${k.market}`);
    res.json({ success: true, is: isler.ozet(is) });
    try {
      const kaynaklar = liste.map(sembol => ({ ...k, sembol }));
      for (let i = 0; i < kaynaklar.length; i++) {
        if (is.iptal) return;
        const kk = kaynaklar[i];
        isler.guncelle(is, i / kaynaklar.length * 0.3, `Veri: ${kk.sembol}`);
        try { await aralikVeri.indir(db.candleStore, { ...kk, iptal: () => is.iptal }); }
        catch (e) { db.addLog('WARN', `Tarama verisi indirilemedi (${kk.sembol}): ${e.message}`); }
      }
      const ayarlar = {};
      for (const s of strategyCatalog.keys()) ayarlar[s] = ayarlariAl(s);
      const m = await isler.isciCalistir(is, { tur: 'tarama', kaynaklar, ayarlar, sermaye: g.initialCapital, stratejiler: g.stratejiler }, (lv, msg) => db.addLog(lv, msg));
      db.addLog('SUCCESS', `🏆 Tarama bitti: ${m.sonuc.opportunityCount} aday, sıralama örneklem dışından`);
      isler.bitir(is, m.sonuc);
    } catch (err) { isler.hata(is, err.message); }
    return;
  }
  const tur = ['tek', 'optimize', 'walkforward'].includes(g.tur) ? g.tur : 'tek';
  const is = isler.yeni(tur, `${g.strategyName} · ${k.sembol} ${k.tf} ${k.market}`);
  res.json({ success: true, is: isler.ozet(is) });

  try {
    // 1. Veri: eksik varsa indir (vadelide funding de).
    const ilk = await aralikVeri.ilkMum(k.venue, k.market, k.sembol, k.tf).catch(() => null);
    const kap = aralikVeri.kapsam(db.candleStore, { ...k, ilk });
    if (!kap.tam) {
      isler.guncelle(is, 0, `Eksik ${kap.eksikMum.toLocaleString('tr-TR')} mum indiriliyor`);
      await aralikVeri.indir(db.candleStore, { ...k,
        ilerleme: (p) => isler.guncelle(is, p.yuzde / 100 * 0.4, `Veri indiriliyor: ${p.indirilen.toLocaleString('tr-TR')} / ${p.toplam.toLocaleString('tr-TR')} mum`),
        iptal: () => is.iptal });
    }
    if (is.iptal) return;
    await fundingTamamla(k).catch(e => db.addLog('WARN', `Funding indirilemedi: ${e.message}`));

    // 2. Ayar: kayıtlı + panelden gelen. Vadeli kurulum yalnız BU koşuya.
    let ayar = { ...ayarlariAl(g.strategyName), ...(g.customConfig || {}) };
    if (Array.isArray(g.optimizeParams) && g.optimizeParams.length) ayar.__optimizeParams = g.optimizeParams;
    let komisyonPct = null;
    if (k.market === 'perp') {
      const ds = aralikVeri.depoSembolu(k.sembol, k.market);
      const ek = await Backtester.perpConfig(ds, { venue: k.venue }, { apiKey: config.apiKey, apiSecret: config.apiSecret });
      // Yalnız aralığın funding'i — tüm geçmişi iş parçacığına kopyalamaya gerek yok.
      ek.fundingSeries = ek.fundingSeries.filter(f => f.time >= kap.bas - 864e5 && f.time <= kap.bit + 864e5);
      ayar = { ...ayar, ...ek, leverage: Math.max(1, Math.min(100, Number(g.leverage) || 1)) };
      komisyonPct = ek.feePct;
      if (!ek.fundingSeries.length) db.addLog('WARN', `${ds}: aralıkta funding kaydı yok — sabit varsayım kullanılacak.`);
    } else {
      ayar.marketType = 'spot';
    }

    // Hücum / Denge "botun tamamı" kutusu kol önbelleğinden gelir: bayatsa arka planda tazelenir (koşu BEKLEMEZ, eldeki
    // veriyle koşar), kutuya "veri X tarihine kadar; güncelleme sürüyor" notu düşülür (lib/veri/orkestrator.js talep).
    const vtBindirme = (g.strategyName === 'hucum' || g.strategyName === 'denge') ? veriOrk.talep(['kol-onbellegi'], { neden: `talep: backtest ${g.strategyName}` }) : null;

    // 3. Koşu — iş parçacığında.
    isler.guncelle(is, 0.42, 'Simülasyon başlıyor');
    // İçe aktarılan Pine: kaynağı iş verisinde gider (isci.js pineKaydet) — iş parçacığı depoya bağlı kalmaz.
    const pineIs = String(g.strategyName).startsWith(pineStore.ONEK) ? { anahtar: g.strategyName, kaynak: pineStore.kaynakOku(g.strategyName) } : null;
    const m = await isler.isciCalistir(is, {
      tur, strateji: g.strategyName, ayar, sermaye: g.initialCapital, pine: pineIs,
      kaynak: k, secenek: { katSayisi: g.katSayisi },
      baglam: { symbol: k.sembol, market: k.market, venue: k.venue, komisyonPct }
    }, (lv, msg) => db.addLog(lv, msg));
    const sonuc = m.sonuc;
    if (vtBindirme && vtBindirme.veriNotu && sonuc && sonuc.bindirmeEk && sonuc.bindirmeEk.kapsam) (sonuc.bindirmeEk.kapsam.not = sonuc.bindirmeEk.kapsam.not || []).push(vtBindirme.veriNotu);
    if (tur === 'tek') {
      if (komisyonPct != null && sonuc.varsayimlar) sonuc.varsayimlar.komisyonPct = komisyonPct;
      sonuc.isId = is.id;
      db.addLog('SUCCESS', `Backtest bitti: ${g.strategyName} ${k.sembol} ${k.tf} · ${sonuc.candleCount} mum · %${sonuc.totalReturnPct} · ${sonuc.totalTrades} işlem`);
    } else if (tur === 'optimize') {
      sonuc.plan = optimizasyonPlani(g.strategyName, ayar);
    } else {
      sonuc.plan = optimizasyonPlani(g.strategyName, ayar);
      sonuc.symbol = k.sembol; sonuc.timeframe = k.tf;
    }
    isler.bitir(is, sonuc, { tumIslemler: m.tumIslemler || null });
  } catch (err) {
    db.addLog('ERROR', `İş başarısız (${is.aciklama}): ${err.message}`);
    isler.hata(is, err.message);
  }
});

app.get('/api/is', (req, res) => res.json({ success: true, isler: isler.liste() }));

app.get('/api/is/:id', (req, res) => {
  const is = isler.al(req.params.id);
  if (!is) return res.status(404).json({ success: false, error: 'İş bulunamadı (sunucu yeniden başlamış olabilir)' });
  res.json({ success: true, is: isler.ozet(is), sonuc: is.durum === 'bitti' ? is.sonuc : null });
});

app.post('/api/is/:id/iptal', (req, res) => {
  res.json({ success: isler.iptalEt(req.params.id) });
});

/** İşlem listesinin TAMAMI (panel kırpılmış listeyi görür). */
app.get('/api/is/:id/islemler.csv', (req, res) => {
  const is = isler.al(req.params.id);
  if (!is || !is.sonuc) return res.status(404).type('text/plain').send('İş bulunamadı');
  const liste = (is.ek && is.ek.tumIslemler) || is.sonuc.trades || [];
  const alanlar = ['id', 'type', 'direction', 'entryTime', 'exitTime', 'entryPrice', 'exitPrice', 'amount', 'profitUSDT', 'profitPct', 'barsInTrade', 'kademe', 'reason'];
  const kacis = (v) => { if (v == null) return ''; const s = String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const satirlar = [alanlar.join(';'), ...liste.map(t => alanlar.map(a => kacis(t[a])).join(';'))];
  res.setHeader('Content-Disposition', `attachment; filename="islemler-${is.id}.csv"`);
  res.type('text/csv; charset=utf-8').send('﻿' + satirlar.join('\n'));
});

app.get('/api/strateji/adaylar', (req, res) => {
  res.json({ success: true, adaylar: ADAYLAR });
});

app.post('/api/strateji/olc', (req, res) => {
  try {
    const { anahtar, semboller } = req.body || {};
    const aday = ADAYLAR.find(a => a.anahtar === anahtar);
    if (!aday || !aday.olcum) throw new Error(`Yeniden ölçülebilir aday değil: ${anahtar}`);
    if (aday.olcum.tur === 'kitap') {
      // Kitap stratejisi: motorla 15 varlık + Donchian'la korelasyon.
      const donchianEgri = donchianPortfoy.olc()._ham.S.egri;
      const { _egri, ...ham } = kitapOlcum.olc(aday.olcum.strateji, { donchianEgri });
      const sonuc = { tur: 'kitap', ...ham };
      db.addLog('INFO', `🔬 ${aday.ad}: ${sonuc.karar} · Sharpe ${sonuc.metrik.sharpe}`);
      return res.json({ success: true, sonuc });
    }
    const liste = Array.isArray(semboller) && semboller.length ? semboller : (aday.olcum.semboller || donchianPortfoy.VARSAYILAN_VARLIKLAR);
    const { _ham, ...sonuc } = donchianPortfoy.olc(liste);
    db.addLog('INFO', `🔬 ${aday.ad}: ${sonuc.karar} · Sharpe ${sonuc.metrik.strateji.sharpe} · veri ${sonuc.veriSonGun}`);
    res.json({ success: true, sonuc });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Panel bu ucu KULLANMIYOR (panel `/api/backtest/is` iş akışında). Kalma sebebi:
// `scripts/pine-uc-testi.js` eski senkron yolu da sınıyor. (Pusula P4: iş parçacığı
// lib/backtest/isci.js içe aktarılan Pine'ı da koşar — kaynak iş verisinde gider.)
// Multi-Asset Watchlist Scanner Endpoint (USES CUSTOM WATCHLIST & FAST CANDLE CACHE)
app.post('/api/backtest/scan-watchlist', async (req, res) => {
  try {
    const { timeframe, candlesCount, initialCapital } = req.body;
    const watchlist = config.watchlist || ["BTC/USDT", "ETH/USDT", "SOL/USDT", "AVAX/USDT", "XRP/USDT", "BNB/USDT", "LINK/USDT"];
    const tf = timeframe || '1h';
    const limit = parseInt(candlesCount) || 500;

    const fetchCandlesFn = async (sym, timeframe, limit) => {
      try {
        return await engine.exchange.fetchOHLCV(sym, timeframe, limit);
      } catch (err) {
        return [];
      }
    };

    /**
     * Strateji haritası KATALOGDAN kurulur. `config.strategies` yalnızca
     * kaydedilmiş AYARLARI taşır; içe aktarılan Pine botlarının ayar kaydı
     * kullanıcı bir şey değiştirene kadar yoktur ve tarama onları sessizce
     * atlıyordu — strateji karşılaştırma taramasındaki hatanın aynısı.
     */
    const taranacak = {};
    for (const k of strategyCatalog.keys()) {
      taranacak[k] = { ...ayarlariAl(k), marketType: config.marketType || 'spot' };
    }

    const scanResults = await Backtester.scanWatchlist(watchlist, taranacak, fetchCandlesFn, tf, limit, parseFloat(initialCapital) || 10000.0);

    db.addLog('SUCCESS', `🏆 ÖZEL İZLEME LİSTESİ TARAMASI TAMAMLANDI! En İyi 5 Portföy Fırsatı Belirlendi.`);
    res.json({ success: true, scanResults });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Strateji karşılaştırma taraması. Aynı ızgarada tüm stratejileri koşturup
 * tutar ağırlıklı beklenti ve brüt edge üretir.
 *
 * Tarama dakikalar sürebildiği için ilerleme WebSocket'ten yayınlanır; istek
 * diğer backtest uçlarıyla aynı desende senkron kalır.
 */
app.post('/api/strategy-scan', async (req, res) => {
  try {
    const { strategyKeys, symbols, timeframe, candlesCount, initialCapital } = req.body || {};

    /**
     * GEÇERLİ STRATEJİ LİSTESİ KATALOGDAN GELİR, `config.strategies`TEN DEĞİL.
     *
     * `config.strategies` KAYDEDİLMİŞ AYARLARDIR; bir stratejinin var olup
     * olmadığının kaydı değildir. İçe aktarılan Pine botları katalogda vardır
     * ama kullanıcı ayarlarını değiştirene kadar config'de KAYDI YOKTUR.
     * Süzgeç config'e bakınca yeni eklenen bot sessizce eleniyordu ve panel
     * "karşılaştırılacak strateji yok" diyordu — kullanıcı kutuyu işaretlemiş
     * olmasına rağmen.
     *
     * Bu, kataloğun var oluş sebebi olan hatanın aynısı: listeyi ikinci bir
     * yerde tutmak. Ayarlar config'den okunmaya devam eder, VARLIK sorusunun
     * tek cevabı katalogdur.
     */
    const allKeys = strategyCatalog.keys();
    const keys = (Array.isArray(strategyKeys) && strategyKeys.length)
      ? strategyKeys.filter(k => strategyCatalog.has(k))
      : allKeys;

    if (!keys.length) {
      return res.status(400).json({
        success: false,
        error: Array.isArray(strategyKeys) && strategyKeys.length
          ? `Seçilen stratejiler katalogda bulunamadı: ${strategyKeys.join(', ')}`
          : 'Katalogda strateji yok'
      });
    }

    const targetSymbols = (Array.isArray(symbols) && symbols.length)
      ? symbols
      : (config.activeSymbols || config.watchlist || ['BTC/USDT']).slice(0, 4);

    // Motorla aynı enjeksiyon: strateji piyasa tipini config'inden okur.
    const selected = {};
    keys.forEach(k => {
      // Ayar YOKSA boş nesne: strateji kendi varsayılanlarını kullanır.
      // (Yeni içe aktarılan botların config kaydı henüz olmayabilir.)
      const kayitli = (config.strategies && config.strategies[k]) || {};
      selected[k] = { ...kayitli, marketType: config.marketType || 'spot' };
    });

    const tf = timeframe || '1h';
    const limit = parseInt(candlesCount) || 5000;

    db.addLog('INFO', `🔬 STRATEJİ TARAMASI BAŞLADI: ${keys.length} strateji × ${targetSymbols.length} varlık (${tf}, ${limit} mum)`);

    const scan = await runStrategyScan({
      strategies: selected,
      symbols: targetSymbols,
      timeframe: tf,
      candlesCount: limit,
      initialCapital: parseFloat(initialCapital) || 10000.0,
      fetchCandles: async (sym, timeframe2, limit2) => {
        try {
          return await engine.exchange.fetchOHLCV(sym, timeframe2, limit2);
        } catch (err) {
          db.addLog('WARN', `[${sym}] Tarama için mum alınamadı: ${err.message}`);
          return [];
        }
      },
      onProgress: (p) => broadcast('STRATEGY_SCAN_PROGRESS', p)
    });

    const s = scan.summary;
    db.addLog('SUCCESS', `🔬 TARAMA TAMAMLANDI: ${s.tested} strateji, ${s.totalTrades} işlem. Beklentisi pozitif: ${s.profitable}, brüt edge'i olan: ${s.withGrossEdge}.`);
    broadcast('STRATEGY_SCAN_DONE', { summary: s });

    res.json({ success: true, scan });
  } catch (err) {
    db.addLog('ERROR', `Strateji taraması başarısız: ${err.message}`);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * SAĞLIK SİNYALİ TESTİ — ayarlı her URL'ye bir başarı ping'i (gövdesiz GET). healthchecks'te check
 * "up" olur; URL yanlışsa (404) burada görünür. Yanıtta URL YOK, yalnız sonuç.
 */
app.post('/api/saglik/test', async (req, res) => {
  // 68.8: her botun KENDİ check'i ayrı denenir (sonuc.botlar.<ad>); sonuc.bot = Hücum (eski panel / geri uyum).
  const tek = async (s) => { if (!s.ayarli()) return { ayarli: false }; const r = await s.ping('basari'); return { ayarli: true, ok: r.ok, hata: r.hata || null, deneme: r.deneme }; };
  const botlar = {};
  for (const ad of BINDIRME_ADLAR) botlar[ad] = await tek(saglikBotlar[ad]);
  const sonuc = { bot: botlar.hucum, botlar, sunucu: await tek(saglikSunucu) };
  const hepsi = [...BINDIRME_ADLAR.map(a => [bindirmeArastirma.STRATEJILER[a].ad, botlar[a]]), ['sunucu', sonuc.sunucu]];
  const herhangi = hepsi.some(([, x]) => x.ayarli);
  const hepsiOk = hepsi.every(([, x]) => !x.ayarli || x.ok);
  if (herhangi) db.addLog(hepsiOk ? 'SUCCESS' : 'WARN', `Sağlık sinyali testi: ${hepsi.map(([a, x]) => `${a} ${x.ayarli ? (x.ok ? 'gönderildi' : `başarısız (${x.hata})`) : 'ayarlı değil'}`).join(' · ')}`);
  res.status(!herhangi ? 400 : 200).json({ success: herhangi && hepsiOk, sonuc,
    error: !herhangi ? 'Ping URL\'si girilmemiş (Ayarlar → Sağlık sinyali).' : (hepsiOk ? null : 'En az bir ping gönderilemedi — URL\'yi ve internet bağlantısını kontrol edin.') });
});

app.get('/api/saglik/durum', (req, res) => {
  res.json({ success: true, bot: saglikBot.durum(), botlar: Object.fromEntries(BINDIRME_ADLAR.map(a => [a, { ad: bindirmeArastirma.STRATEJILER[a].ad, ...saglikBotlar[a].durum() }])),
    sunucu: saglikSunucu.durum(), telegramKomut: telegramYoklayici.durum() });
});

/**
 * SUNUCU KALP ATIŞI (healthchecksSunucuUrl ayarlıysa): açılıştan 1 dk sonra, sonra her 10 dk'da
 * bakılır — son BAŞARILI ping 1 saatten eskiyse bir ping. Ağ hatası 10 dk sonra yeniden denenir.
 */
// O9 (61.8): 23 saat → 1 saat — sunucu ölümü bir gün sonra değil ~2 saatte fark edilir (healthchecks period 1 sa, tolerans 1 sa).
const SUNUCU_PING_ARALIK = 3600e3;
let sunucuPingMesgul = false;
async function sunucuKalpAtisi() {
  // Araştırma modunda ping YOK: başka makinedeki gerçek sunucu çökmüşken buradan giden ping onu "yaşıyor" gösterirdi.
  if (ARASTIRMA_MODU || sunucuPingMesgul || !saglikSunucu.ayarli()) return;
  if (saglikSunucu.sonBasari && Date.now() - saglikSunucu.sonBasari < SUNUCU_PING_ARALIK) return;
  sunucuPingMesgul = true;
  try { await saglikSunucu.ping('basari'); } finally { sunucuPingMesgul = false; }
}
setTimeout(() => { sunucuKalpAtisi(); }, 60 * 1000).unref();
setInterval(() => { sunucuKalpAtisi(); }, 10 * 60 * 1000).unref();

/**
 * TELEGRAM KOMUTLARI (lib/telegramKomut.js) — YALNIZ OKUMA: /durum /pozisyonlar /ozet /saglik /yardim.
 * Emir veren / botu başlatan-durduran komut BİLİNÇLİ OLARAK YOK. Yalnız Ayarlar'daki chat id'den gelen
 * mesaja cevap verilir. Telegram kapalıyken yoklama ağ isteği yapmaz (30 sn'de bir ayara bakar).
 */
const { TelegramYoklayici } = require('./lib/telegram');
const { komutIsleyici } = require('./lib/telegramKomut');
const SUNUCU_BASLANGIC = Date.now();
const telegramYoklayici = new TelegramYoklayici({
  notifierFn: () => engine.telegram,
  offsetDosya: yollar.veri('telegram-offset.json'),
  kaydet: (sv, m) => db.addLog(sv, `[TELEGRAM] ${m}`),
  engel: () => TELEGRAM_GELISTIRME_ENGELI,
  isleyici: komutIsleyici({
    surum: APP_VERSION, baslangic: SUNUCU_BASLANGIC,
    portfoyBotlari: () => BINDIRME_ADLAR.map(ad => bindirmeler[ad]),
    bildirici: portfoyBildirici,
    get yoklayici() { return telegramYoklayici; },
    saglik: { bot: saglikBot, botlar: saglikBotlar, sunucu: saglikSunucu },   // 68.8: bot başına check
    // /ileri (denetim A-20): ileri test ara durumu — /api/ileri/kabul ile aynı kaynaklar, hüküm yazmaz.
    ileri: () => {
      const HD = require('./lib/ileri/hucumDengeEsikleri');
      const ilk = '2026-10-07';
      return { demo: demoKabulOzet.ozet(), bollingerHukum: '2027-10-07 (düşüş olayı yoksa 2028-10-07)',
        kontrol: HD.UFUKLAR.map(g => ({ gun: g, tarih: new Date(Date.parse(ilk + 'T00:00:00Z') + g * 864e5).toISOString().slice(0, 10) })) };
    },
  }),
});

// Test Telegram Endpoint
app.post('/api/telegram/test', async (req, res) => {
  try {
    const result = await engine.telegram.sendMessageDetailed(
      '<b>🔔 Pusula Test Bildirimi</b>\n\nTelegram entegrasyonu başarıyla çalışıyor! 🚀'
    );

    if (result.ok) {
      db.addLog('SUCCESS', 'Telegram test mesajı başarıyla gönderildi.');
      return res.json({ success: true, message: 'Test mesajı gönderildi' });
    }

    db.addLog('WARN', `Telegram test mesajı gönderilemedi: ${result.error}`);
    res.status(400).json({ success: false, error: result.error });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start HTTP Server
const PORT = process.env.PORT || 3000;
// O1 (61.8): port doluysa (eski Pusula açık) açık mesaj + çıkış 2 — eskiden yakalanmayan hata Telegram'a "Bot çöktü" yolluyordu.
server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    console.error(`⛔ Port ${PORT} kullanımda — başka bir Pusula zaten çalışıyor olabilir. Önce onu kapatın (masaüstü: "Pusula'yı durdur").`);
    try { db.addLog('ERROR', `Port ${PORT} kullanımda — ikinci sunucu açılmadı`); db.flush(); } catch { /* */ }
    process.exit(2);
  }
  throw e;
});
// 73.6 (S03): donma bekçisi — iş parçacığı kendi sağlık ucunu yoklar; 10 dk yanıt yoksa YALNIZ kendi PID'ini kapatır (denetleyici açar).
let donmaBekcisi = null;
server.listen(PORT, HOST, () => {
  try { donmaBekcisi = require('./lib/donmaBekcisi').baslat({ port: PORT, dosya: yollar.veri('donma.json') }); } catch (e) { console.error('donma bekçisi başlatılamadı:', e.message); }
  console.log(`====================================================`);
  console.log(`🧭 Pusula sunucusu çalışıyor: ${HOST}:${PORT}`);
  if (!guvenlik.yerel) console.log('🔒 Ağa açık dinleme: panel jetonu zorunlu (tarayıcıda giriş sayfası → oturum çerezi; betikte x-panel-token).');
  console.log(`🌐 Dashboard: http://${guvenlik.yerel ? 'localhost' : HOST}:${PORT}`);
  console.log(`====================================================`);
  db.addLog('INFO', `Sunucu port ${PORT} üzerinde başlatıldı.`);
  if (ARASTIRMA_MODU) console.log('🔬 ARAŞTIRMA MODU: Telegram kapalı, botlar başlamaz, bot/borsa/emir POST uçları kapalı.');
  else telegramYoklayici.baslat();
  // 73.5: bildirim üreticileri + sessiz saat özeti (dakikada bir; sessiz saat bitince bekleyenler TEK mesaj) — yalnız sunucu.
  if (bildirimUreticileri) {
    bildirimUreticileri.baslat();
    const sessizT = setInterval(() => { BILDIRIM.sessizBosalt({ telegram: (m) => (engine.telegram.enabled && engine.telegram.botToken && engine.telegram.chatId ? engine.telegram._gonderHam(m) : Promise.resolve({ ok: true })) }).catch(() => null); }, 60 * 1000);
    if (sessizT.unref) sessizT.unref();
  }
  // 73.5: araştırma kopyası sunucuya 10 dk'da bir "buradayım" der (Bildirimler › Makine sessiz). Yalnız sunucu bağlantısı kuruluysa.
  if (ARASTIRMA_MODU) {
    const nabiz = async () => {
      const a = evOkuma.ayar();
      if (!a) return;
      try { await fetch(`${a.adres}/api/makine/nabiz`, { headers: { 'x-panel-token': a.jeton, 'x-pusula-makine': require('os').hostname().slice(0, 40), 'x-pusula-surum': APP_VERSION }, signal: AbortSignal.timeout(10000), redirect: 'error' }); } catch { /* sunucu kapalı: sonraki tur */ }
    };
    const nabizT = setInterval(nabiz, 10 * 60 * 1000);
    if (nabizT.unref) nabizT.unref();
    setTimeout(() => nabiz(), 30 * 1000).unref();
  }
  
  // Preload historical candles for configured watchlist on boot.
  // 68.3 (PLAN-TASIMA K6/F5): YENİ veri düzeninde (kurulum programıyla kurulmuş boş kurulum) açılışta mum indirilmez — ilk açılışta
  // önceden yüklü fiyat/grafik yok, ihtiyaç olunca (bot çalışınca, grafik açılınca) indirilir. ESKİ düzen (bugünkü kurulumlar) aynen.
  if (config.watchlist && config.watchlist.length > 0 && yollar.bilgi().duzen !== 'yeni') {
    engine.exchange.preloadWatchlistCandles(config.watchlist, '1h', 500);
    engine.exchange.preloadWatchlistCandles(config.watchlist, '4h', 500);
  }

  // start() throws while the kill-switch is latched. Unguarded, that took the
  // whole process down on boot and left the dashboard unreachable — exactly
  // when the user needs it to reset the kill-switch.
  const boot = ensureEngineRunning();
  if (!boot.running) {
    db.addLog('ERROR', `Motor başlatılamadı: ${boot.error} — panelden Kill-Switch'i sıfırlayın.`);
    console.error(`⚠️  Motor başlatılamadı: ${boot.error}`);
    console.error('   Panelden "Kill-Switch Sıfırla" ile devam edebilirsiniz.');

    engine.telegram.notify('critical', 'Motor Başlatılamadı', [
      `<b>Sebep:</b> ${boot.error}`,
      'Sunucu ayakta ama botlar çalışmıyor. Panelden Kill-Switch sıfırlanmalı.'
    ], { key: 'bootfail', throttleMs: 30 * 60 * 1000 });
  } else {
    engine.telegram.notify('lifecycle', 'Bot Sunucusu Başlatıldı', [
      `<b>Çalışan bot:</b> ${engine.getBots().length}`,
      `<b>Mod:</b> ${(config.mode || 'paper').toUpperCase()}`,
      `<b>Port:</b> ${PORT}`
    ], { key: 'boot', throttleMs: 60 * 1000 });
  }
});

// --- Process resilience ------------------------------------------------------
// Without these a single unhandled promise rejection kills the whole bot, and a
// restart loses whatever was still sitting in a debounced write.

let shuttingDown = false;

/**
 * Y8 (61.8): kapanışta portföy botlarının dakikalık zamanlayıcıları DONDURULUR (durum dosyasında "çalışıyor" kalır —
 * açılışta yeniden başlar) ve süren iş (günlük çalışma, DCA senkronu, felaket stopu denetimi) en çok KAPANIS_BEKLE_MS
 * beklenir; böylece yeniden başlatma emirlerin ortasında kesmez. Çökme (uncaughtException) beklemez.
 */
const KAPANIS_BEKLE_MS = 120 * 1000;
function botlarMesgul() {
  return Object.values(bindirmeler).filter(b => b && (b.bot.mesgul || (typeof b.bot.calismaSuruyor === 'function' && b.bot.calismaSuruyor()))).map(b => b.ad);
}
function shutdown(reason, exitCode = 0, { bekleme = true } = {}) {
  if (shuttingDown) return;
  shuttingDown = true;
  try { if (donmaBekcisi) donmaBekcisi.durdur(); } catch { /* */ }
  for (const b of Object.values(bindirmeler)) {
    if (b && b.bot.zamanlayici) { clearInterval(b.bot.zamanlayici); b.bot.zamanlayici = null; }
  }
  const mesgul = bekleme ? botlarMesgul() : [];
  if (mesgul.length) {
    console.log(`\n⏳ Kapatma bekliyor: ${mesgul.join(', ')} işini bitiriyor (en çok ${KAPANIS_BEKLE_MS / 1000} sn)...`);
    const bas = Date.now();
    const t = setInterval(() => {
      if (!botlarMesgul().length || Date.now() - bas > KAPANIS_BEKLE_MS) { clearInterval(t); kapat(reason, exitCode); }
    }, 500);
    return;
  }
  kapat(reason, exitCode);
}
/** 73.6 (S12): temiz kapanış işareti — sonraki açılış "planlı" sayılır (öz denetimin günlük açılış sayacına girmez). */
const SON_KAPANIS = () => yollar.veri('son-kapanis.json');
function sonKapanisPlanliMi(simdi = Date.now()) {
  let k = null;
  try { k = JSON.parse(fs.readFileSync(SON_KAPANIS(), 'utf8')); } catch { return false; }
  try { fs.unlinkSync(SON_KAPANIS()); } catch { /* */ }
  return !!k && [0, 75].includes(k.kod) && Number.isFinite(k.zaman) && simdi - k.zaman >= 0 && simdi - k.zaman < 30 * 60e3;
}
function kapat(reason, exitCode) {
  console.log(`\n⏹️  Kapatılıyor (${reason})...`);
  try { fs.writeFileSync(SON_KAPANIS(), JSON.stringify({ zaman: Date.now(), kod: exitCode, neden: String(reason).slice(0, 120) }), 'utf8'); } catch { /* */ }
  try {
    telegramYoklayici.durdur();
    engine.stop();
    db.addLog('WARN', `Sunucu kapatılıyor: ${reason}`);
    db.flush();
    console.log('   Durum diske yazıldı.');
  } catch (err) {
    console.error('   Kapanış sırasında hata:', err.message);
  }

  server.close(() => process.exit(exitCode));
  // Bir bağlantı takılırsa süreci yine de bırak
  setTimeout(() => process.exit(exitCode), 3000).unref();
}

['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(sig => {
  process.on(sig, () => shutdown(sig));
});

// A rejected promise nobody awaited is usually a missed .catch on a network
// call — log it, keep trading.
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('⚠️  Yakalanmamış promise hatası:', msg);
  db.addLog('ERROR', `Yakalanmamış promise hatası: ${msg}`);

  engine.telegram.notify('error', 'Yakalanmamış Promise Hatası', [
    `<code>${msg}</code>`,
    'Bot çalışmaya devam ediyor, ancak loglar incelenmeli.'
  ], { key: 'unhandled:' + msg.slice(0, 40), throttleMs: 30 * 60 * 1000 });
});

// An uncaught exception leaves the process in an unknown state — persist what we
// can, tell the supervisor to restart us, and exit.
process.on('uncaughtException', (err) => {
  console.error('💥 Yakalanmamış hata:', err);
  try {
    db.addLog('ERROR', `KRİTİK: Yakalanmamış hata — ${err.message}`);
    engine.telegram.notify('critical', 'Bot Çöktü — Yeniden Başlatılıyor', [
      `<code>${err.message}</code>`,
      'Süreç güvenli şekilde kapatıldı. Süreç yöneticisi botu yeniden başlatacak.'
    ], { key: 'crash', throttleMs: 5 * 60 * 1000 });
  } catch (_) { /* bildirim başarısız olsa da kapanmaya devam */ }

  shutdown('uncaughtException', 1, { bekleme: false });
});
