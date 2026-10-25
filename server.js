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
// C1 (74.8): adı olmayan require'ları kullanan uçlar lib/sunucu/{arastirmaUclari,kagitMotorUclari}.js'e taşındı; modüller
// burada açılışta yine AYNI SIRADA yüklenir (davranış ve yükleme sırası değişmesin diye — modüller aynı önbellek nesnesini alır).
require('./lib/drawdownStats');
require('./lib/strategyScanner');
const strategyCatalog = require('./lib/strategies/catalog');
const pineStore = require('./lib/pine/store');
require('./lib/pine/inspect');
require('./lib/venues');

require('./lib/backtester');
require('./lib/research/adaylar');
require('./lib/research/donchianPortfoy');
require('./lib/research/kitapOlcum');

/**
 * 68.0 AYARLAR (lib/ayarlar.js, PLAN-TASIMA F1): etkin ayar = config.varsayilan.json (depoda, kişisel değer yok) ⊕
 * <veri>/ayarlar.json (yalnız farklar). ayarlar.json yoksa eski config.json kullanıcı katmanıdır — var olan kurulumda
 * davranış AYNI; ayarlar.json ilk kayıtta oluşur, o andan sonra config.json okunmaz.
 */
require('./lib/ayarlar');   // C1 (75.0): adı kullanan kod lib/sunucu/ayarDeposu.js + kisiselUclar.js'te — yükleme sırası aynı
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
const APP_VERSION = '75.0';

/**
 * C1 (74.8, TASARIM-MAKINE-HESAP-BOT §3) SUNUCU BAĞLAMI — server.js'ten bölünen lib/sunucu/* modüllerinin ortak bağlamı.
 * Her alan bir OKUYUCU: modül değeri kullanım anında okur (`let config` hep güncel; sonra tanımlanan değişkenler sorun değil;
 * nesneler aynı başvuru). Modül grupları server.js'teki ESKİ YERLERİNDE bağlanır → Express uç/ara katman sırası aynı
 * (scripts/sunucu-uc-envanteri-selftest.js). Tanımsız alan okunursa hata atar (lib/sunucu/baglam.js).
 * 75.0 (parça 2): bağlam AYAR DEPOSUNDAN ÖNCE kurulur (ayar deposu config, BOT_KAYIT, ARASTIRMA_MODU, ayar geçmişini kullanım anında okur).
 * Alanlar modülden modüle verilen server.js nesneleridir; yenileri eklenince BURAYA okuyucu olarak eklenir.
 */
const ctx = require('./lib/sunucu/baglam').olustur({
  kok: () => __dirname, app: () => app, APP_VERSION: () => APP_VERSION, ARASTIRMA_MODU: () => ARASTIRMA_MODU,
  config: () => config, configYaz: () => (c) => { config = c; }, saveConfig: () => saveConfig, engine: () => engine, broadcast: () => broadcast,
  ensureEngineRunning: () => ensureEngineRunning, shutdown: () => shutdown,
  KNOWN_STRATEGIES: () => KNOWN_STRATEGIES, KNOWN_TIMEFRAMES: () => KNOWN_TIMEFRAMES,
  BINDIRME_ADLAR: () => BINDIRME_ADLAR, bindirmeler: () => bindirmeler, bindirmeAyar: () => bindirmeAyar,
  isler: () => isler, veriOrk: () => veriOrk, mumGetir: () => ARASTIRMA_UCLARI.mumGetir,
  // 75.0 (C1 parça 2): ayar deposu ve sağlık / sorun / bildirim / ileri / ayar / kişisel uç modüllerinin okudukları
  ayar: () => AYAR_DEPOSU, BOT_KAYIT: () => BOT_KAYIT, AYAR_GECMISI: () => AYAR_GECMISI, ayarGecmisiLib: () => ayarGecmisiLib, COMMIT: () => COMMIT, GUNLUK: () => GUNLUK,
  guvenlik: () => guvenlik, acilPin: () => acilPin, evOkuma: () => evOkuma, evYazma: () => evYazma, EV_BAGLANTI_ETKIN: () => EV_BAGLANTI_ETKIN, disariConfig: () => disariConfig,
  STRATEJI_ADLAR: () => STRATEJI_ADLAR, botEtiketi: () => botEtiketi, GOLGE_DOSYA: () => GOLGE_DOSYA, ikinciKanal: () => ikinciKanal, portfoyBildirici: () => portfoyBildirici,
  saglikBotlar: () => saglikBotlar, saglikBot: () => saglikBot, saglikSunucu: () => saglikSunucu, veriKalitesiAyar: () => veriKalitesiAyar, diskDurumu: () => diskDurumu,
  yeniBotMu: () => yeniBotMu, botHesapId: () => botHesapId, sonKapanisPlanliMi: () => sonKapanisPlanliMi,
  ozDenetim: () => ozDenetim, ileriIs: () => ileriIs, demoKabulOzet: () => demoKabulOzet, SORUN: () => SORUN, sorunlarHesapla: () => sorunlarHesapla, bilinenSirlar: () => bilinenSirlar,
  BILDIRIM: () => BILDIRIM, TELEGRAM_GELISTIRME_ENGELI: () => TELEGRAM_GELISTIRME_ENGELI, telegramYoklayici: () => telegramYoklayici,
  piyasaBaglami: () => piyasaBaglami, yapayZeka: () => yapayZeka, portfoyum: () => portfoyum, islemDefteri: () => islemDefteri, anahtarlar: () => anahtarlar,
  sirlariUygula: () => sirlariUygula, configUygula: () => configUygula,
});

/**
 * C1 (75.0, TASARIM-MAKINE-HESAP-BOT §3 parça 2) AYAR DEPOSU — lib/sunucu/ayarDeposu.js: GİZLİ ANAHTARLAR config.json'da DURMAZ
 * (data/secrets.json — 69.4 sır kasası; Y5: "yok" ile "var ama bozuk" ayrı, bozuk/kilitliyse yazma reddi + açılış alarmı), etkin ayar
 * okuma/yazma (loadConfig / saveConfig / mergeConfig — 68.0 ayarlar katmanı, 74.7 bot kaydı yansıması, 74.2 ayar geçmişi), 68.8 bot başına
 * sağlık sırları, 69.3 sürüm izi (commitOku, ayarIzi). `config` değişkeni BURADA kalır. Sırlar dosyasının durumu AYAR_DEPOSU okuyucularında
 * (SIRLAR_BOZUK, SIRLAR_KILITLI, SIR_GECIS, KASA_GECIS). Yükleme sırası aynı: lib/guvenlik → lib/live/kaliciDosya → lib/sirKasasi → sır kasası geçişi.
 */
const guvenlikKur = require('./lib/guvenlik');
const kaliciDosya = require('./lib/live/kaliciDosya');
const AYAR_DEPOSU = require('./lib/sunucu/ayarDeposu').olustur(ctx);
const { SECRET_KEYS, botSaglikCikar, loadSecrets, loadConfig, saveConfig, commitOku } = AYAR_DEPOSU;
/** 74.4 bot kaydı deposu (lib/botKayit.js) — bindirme botlarının tanımından önce kurulur; saveConfig ondan önce çağrılırsa yansıma atlanır (74.7). */
let BOT_KAYIT = null;

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
 * (commitOku, ayarIzi: lib/sunucu/ayarDeposu.js — C1 75.0)
 */
const COMMIT = commitOku(__dirname);
GUNLUK.surumAyarla(`${APP_VERSION}${COMMIT ? `@${COMMIT}` : ''}`);
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
/**
 * 74.2 AYAR GEÇMİŞİ (C2, lib/ayarGecmisi.js): panelin yazdığı her ayar değişikliği (config, bildirim, model sermayesi ayarları, anahtar
 * "değişti" bilgisi) <veri>/ayar-gecmisi/kayit.jsonl'e YALNIZ EKLENİR — kim/ne zaman/makine/uç/eski → yeni; sırlar "•••".
 * Bağlam (kaynak, uç) express.json'dan sonraki ara katmanla; Telegram'dan gelen yazma baglamla({ kaynak: 'telegram' }).
 * GET /api/ayar-gecmisi (araştırma kopyasında sunucunun kaydı da lib/evOkuma jsonGetir ile birleşir) · POST /api/ayar-gecmisi/geri-al
 * (yalnız bilgisayardan, acil PIN; gevşetme "GERİ AL"; aynı doğrulama yolu). Bot kodu (lib/live) değişmez.
 */
const ayarGecmisiLib = require('./lib/ayarGecmisi');
const AYAR_GECMISI = ayarGecmisiLib.olustur({ dizin: yollar.veri('ayar-gecmisi'), acilPin, makine: { rol: ARASTIRMA_MODU ? 'arastirma' : 'sunucu' },
  log: (lv, msg) => { try { db.addLog(lv, msg); } catch { console.log(msg); } } });
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
const ARASTIRMA_KAPALI = /^\/api\/(exchange|kalkan|bindirme|botlar|bots|start|stop|position|hesap-islemleri|telegram|saglik|guncelleme|sistem)(\/|$)/;
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
app.use(AYAR_GECMISI.middleware);   // 74.2: isteğin kaynağı/ucu ayar geçmişi bağlamına (gövde ayrıştırıldıktan SONRA — bağlam kaybolmasın)
// 74.2: Ayarlar › Anahtarlar yazmaları (borsa hesapları, defter anahtarları, PIN değişimi …) ayar geçmişine YALNIZ "değişti" olarak (değer asla).
// Sabit Binance satırları ve sağlık adresleri sirlariUygula'da zaten yazılır (aynı istekte ikinci satır yok). Araştırma kopyasında sunucu yazar.
const ANAHTAR_YAZMA = /^\/api\/anahtarlar\/(hesap|degistir|sil|eski-kenara-al|pin-degistir)$/;
app.use((req, res, next) => {
  if (ARASTIRMA_MODU || req.method !== 'POST' || !ANAHTAR_YAZMA.test(guvenlikKur.yasakYolu(req.path))) return next();
  const islem = guvenlikKur.yasakYolu(req.path).split('/').pop();
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const kimlik = typeof b.kimlik === 'string' && /^[a-z0-9:_.-]{1,80}$/i.test(b.kimlik) ? b.kimlik : islem === 'hesap' ? 'yeni-hesap' : islem === 'pin-degistir' ? 'acil-pin' : islem === 'eski-kenara-al' ? `dosya:${String(b.dosya || '').replace(/[^a-z.-]/gi, '').slice(0, 40)}` : islem;
  const st = req.ayarBaglam;
  res.on('finish', () => {
    if (res.statusCode !== 200 || (st && st.kayit > 0)) return;
    AYAR_GECMISI.kaydet({ tur: 'anahtar', kaynak: (st && st.kaynak) || 'panel', uc: `POST ${req.path}`, kademe: req.kademe || 'yerel',
      farklar: [{ yol: `anahtar.${kimlik}`, eski: islem === 'hesap' ? '' : 'var', yeni: islem === 'sil' || islem === 'eski-kenara-al' ? '' : 'var' }],
      gizliYol: () => true });
  });
  next();
});
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
/* Bildirim merkezi (lib/bildirimMerkezi.js, PLAN-PANEL-2; 73.5 kanal/şablon/sessiz saat; 74.2 ayar geçmişi) + Telegram geliştirme engeli (67.5) —
 * lib/sunucu/bildirimKurulum.js; dört grup eski yerlerinde (merkez · uçlar · üreticiler · Telegram komutları). */
const BILDIRIM_KURULUM = require('./lib/sunucu/bildirimKurulum').olustur(ctx);   // C1 (75.0)
const { BILDIRIM, TELEGRAM_GELISTIRME_ENGELI } = BILDIRIM_KURULUM.merkez();

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
/** Strateji (model) adları — Kairos/Tao iç adları ['hucum', 'denge']; gölge ve ölçüm döngüleri BUNU kullanır. */
const STRATEJI_ADLAR = Object.freeze(Object.keys(bindirmeArastirma.STRATEJILER));
/**
 * Çalışan bot kimlikleri. 74.5 (A1 2b): DİNAMİK — Kairos/Tao + kullanıcının oluşturduğu botlar (live/botlar); yeni bot eklenince
 * push, arşivlenince çıkarılır. Dizi NESNESİ hiç değişmez: her tüketici (öz denetim, bekçi, rapor, Telegram, sağlık, taşıma, anahtarlar)
 * listeyi çağrı anında bu diziden okur (getter) — önbelleğe alan yok.
 */
const BINDIRME_ADLAR = [...STRATEJI_ADLAR];
/** Görünen ad: Kairos/Tao → strateji adı (eskisiyle aynı); yeni bot → kaydın adı (lib/botAdlari EK), yoksa kimlik. */
const botEtiketi = (ad) => (STRATEJI_ADLAR.includes(ad) ? bindirmeArastirma.STRATEJILER[ad].ad : (require('./lib/botAdlari').ad(ad) || ad));
/** 74.5: kullanıcının oluşturduğu bot mu (Kairos/Tao değil). */
const yeniBotMu = (ad) => !STRATEJI_ADLAR.includes(ad);
const YENI_CANLI_RED = require('./lib/sunucu/botFabrikasi').YENI_CANLI_RED;
const BINDIRME_MODLAR = ['kagit', 'demo', 'canli'];
const canliKapi = require('./lib/live/canliKapi');
const CANLI_KAPILAR_DOSYA = yollar.veri('live', 'canli-kapilar.json');
/** Gerçek para kapısı (lib/live/canliKapi.js) — her çağrıda dosyadan okunur; çalışan bot her günlük çalışmada sorar (kapiFn). */
function canliKapiDurum(ad) {
  // 74.5: yeni botlar için gerçek para TAMAMEN kapalı (5. faza kadar) — kapı dosyası okunmaz bile.
  if (yeniBotMu(ad)) return { izin: false, yeniBot: true, eksikler: [{ kod: 'yeni-bot', metin: YENI_CANLI_RED }], ustSinir: 0 };
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
const { SaglikSinyali, botUrl: botSaglikUrl } = require('./lib/saglikSinyali');   // C1 (75.0): urlGecerli → lib/sunucu/ayarUclari.js
const saglikBotlar = Object.fromEntries(BINDIRME_ADLAR.map(ad => [ad, new SaglikSinyali({ ad: `sağlık sinyali (${botEtiketi(ad)})`, urlFn: () => botSaglikUrl(config, ad), kaydet: (sv, m) => db.addLog(sv, `[SAĞLIK] ${m}`) })]));
const saglikBot = saglikBotlar.hucum;
const saglikSunucu = new SaglikSinyali({ ad: 'sağlık sinyali (sunucu)', urlFn: () => config.healthchecksSunucuUrl, kaydet: (sv, m) => db.addLog(sv, `[SAĞLIK] ${m}`) });
/**
 * 74.4 BOT KAYDI (A1 + 2. faz parça 2a, lib/botKayit.js — TASARIM-MAKINE-HESAP-BOT §2): her bot için <veri>/live/botlar/<ad>.json
 * (sır yok; hesap Anahtarlar kimliğiyle). Açılışta Kairos/Tao config.bindirme'den göç eder (doğrulama tutmazsa göç YOK, eski yol + WARN).
 * 74.7 TEK KAYNAK (§2.5/§2.11 — çift yazım kaldırıldı): Kairos/Tao ayarı yalnız KAYDA yazılır (gocBotAyarYaz → BOT_KAYIT.ayarYaz);
 * config.bindirme.<ad> kayıttan tek yönlü türetilen GERİ DÖNÜŞ YANSIMASIDIR (saveConfig başında BOT_KAYIT.yansit) — eski sürüme
 * (74.3 / 74.4–74.6) dönülürse botlar aynı ayarla çalışır. Açılışta ikisi ayrışmışsa (eski sürümde/elle değişti) config kazanır (içe alma).
 * bindirmeAyar = etkin kayıt → botKayit.ayar (+ bellekteki sır); kayıt kullanılamıyorsa eski yol (config.bindirme tek kaynak).
 * Dizinler, hesap adı, sağlık adresi, gölge DEĞİŞMEZ.
 */
const botKayitLib = require('./lib/botKayit');
const botFabrikasi = require('./lib/sunucu/botFabrikasi');
const botSablonlari = require('./lib/botSablonlari');
BOT_KAYIT = botKayitLib.olustur({ dizin: yollar.veri('live', 'botlar'), stratejiler: bindirmeArastirma.STRATEJILER,
  log: (lv, m) => db.addLog(lv, m),
  gecmis: ({ kimlik, farklar, neden }) => AYAR_GECMISI.kaydet({ tur: 'bot', farklar: farklar.map(f => ({ ...f, yol: `${kimlik}.${f.yol}` })), ...(neden === 'göç' ? { kaynak: 'sistem', uc: 'açılış göçü' } : {}) }) });
/** Eski yol (74.3'e kadar tek yol): varsayılanlar ⊕ config.bindirme.<ad> — lib/botKayit.hamAyar birebir. */
const bindirmeAyarEski = (ad) => botKayitLib.hamAyar(config, ad);
function bindirmeAyar(ad) {
  // 74.5: kullanıcının oluşturduğu bot — kayıt TEK kaynak (config.bindirme'de tanımı yok).
  if (BOT_KAYIT && BOT_KAYIT.yeniMi && BOT_KAYIT.yeniMi(ad)) { const y = BOT_KAYIT.kayit(ad); if (!y) throw new Error(`bot kaydı yok: ${ad}`); return botKayitLib.ayar(y); }
  const ham = bindirmeAyarEski(ad);
  const k = BOT_KAYIT ? BOT_KAYIT.etkinKayit(ad) : null;   // 74.7: kayıt tek kaynak (config'le karşılaştırılmaz; config onun yansıması)
  return k ? { ...botKayitLib.ayar(k), ...botKayitLib.sirlar(ham) } : ham;
}
/**
 * 74.7 TEK KAYNAK: Kairos/Tao ayar değişikliği (mod, küçük sermaye, btcAyak, sermaye üst sınırı, /api/config yaması). Etkin kayıt varsa
 * YALNIZ kayda yazılır; yansıma saveConfig'te kayıttan türer (önce ayarlar.json, sonra kayıt dosyası — lib/botKayit ayarYaz). Kayıt
 * kullanılamıyorsa (bozuk/geçersiz — eski yol) config.bindirme tek kaynaktır (74.3 yolu). Döndürür true (değişti) | false.
 */
function gocBotAyarYaz(ad, alanlar, neden) {
  if (BOT_KAYIT && BOT_KAYIT.etkinKayit(ad)) {
    return !!BOT_KAYIT.ayarYaz(ad, { ...botKayitLib.sirsiz(bindirmeAyar(ad)), ...alanlar }, neden, { once: () => saveConfig(config) });
  }
  const onceki = (config.bindirme || {})[ad] || {};
  config.bindirme = { ...(config.bindirme || {}), [ad]: { ...onceki, ...alanlar } };
  saveConfig(config);
  return true;
}
/**
 * 74.3 VERİ KALİTESİ KAPISI (D4, lib/live/veriKalitesi.js): config.veriKalitesi = { kip ('izleme' varsayılan | 'etkin'), izlemeBas (ISO | null), esikler }.
 * İkinci kaynak Binance SPOT günlük kapanış (anahtarsız; 418/429 beklemesi veri orkestratörüyle ORTAK — veriOrk aşağıda tanımlı, yalnız
 * çağrı anında okunur). Kip yalnız POST /api/veri-kalitesi/kip ile (bu bilgisayar + onay) değişir; kendiliğinden geçiş YOK.
 */
const VeriKalitesi = require('./lib/live/veriKalitesi');
function veriKalitesiAyar() {
  const v = (config && config.veriKalitesi) || {};
  const bas = v.izlemeBas == null ? NaN : (typeof v.izlemeBas === 'number' ? v.izlemeBas : Date.parse(v.izlemeBas));
  return { kip: VeriKalitesi.KIPLER.includes(v.kip) ? v.kip : 'izleme', izlemeBas: Number.isFinite(bas) && bas > 0 ? bas : null, esikler: VeriKalitesi.esikBirlestir(v.esikler) };
}
const veriKalitesiSpot = VeriKalitesi.spotOkuyucu({
  fetchFn: (...a) => fetch(...a),
  bekleme: {
    oku: () => { try { return veriOrk.binanceBekleme(); } catch { return null; } },
    yaz: (x) => { try { veriOrk.binanceBeklemeErisimi('veri kalitesi').yaz(x); } catch { /* orkestratör yoksa bekleme yalnız bu istekte */ } },
  },
  zamanAsimiMs: VeriKalitesi.ESIKLER.zamanAsimiMs,
});
const KUCUK_SECIMLER = { oto: 'oto', acik: true, kapali: false };
const KAGIT_AYAKLAR = ['spot', 'coklu'];   // 68.9: kâğıt hesapta BTC ayağı (sıfırlamayla seçilir; demo her zaman perp, canlı her zaman çoklu)
const bindirmeDizin = (ad, mod) => path.join(CANLI_DIZIN, mod === 'demo' ? `${ad}-demo` : mod === 'canli' ? `${ad}-canli` : ad);
const bindirmeler = {};
const ACILIS_DENEME_DK = [1, 2, 5, 10, 30];
const ACILIS_ALARM_MS = 15 * 60000;

/**
 * 74.4 (C1 ilk parça): bindirmeKur'un argüman üretimi SAF fabrikada (lib/sunucu/botFabrikasi.js — btcAyakSec, tavan, yürütücü ve bot
 * ayarı). Yan etkili parçalar burada (ortam): günlük, bildirici, bot başına sağlık sinyali (68.8: saglik: saglikBotlar[ad]), veri kalitesi
 * kapısı (74.3), gerçek para kapısı (denetim #2). Eski kodla derin eşitlik: scripts/bot-kayit-selftest.js.
 */
const FABRIKA_ORTAM = {
  dizin: (ad, mod) => bindirmeDizin(ad, mod),
  log: (seviye, metin) => db.addLog(seviye, metin),
  bildirici: portfoyBildirici,
  golgeDosya: GOLGE_DOSYA,
  saglik: (ad) => saglikBotlar[ad],
  veriKapisi: ({ dizin, kaydet }) => new VeriKalitesi.VeriKapisi({ dizin, kipFn: () => veriKalitesiAyar().kip, esikFn: () => veriKalitesiAyar().esikler, ikinciKaynak: veriKalitesiSpot, varlik: 'BTC', kaydet }),
  kapiFn: (ad) => () => canliKapiDurum(ad),
};

function bindirmeKur(ad, mod) {
  if (!BINDIRME_MODLAR.includes(mod)) throw new Error(`mod kagit | demo | canli olmalı ("${mod}")`);
  // 74.4/74.7: etkin kayıt varsa kayıttan (tek kaynak), yoksa eski yoldan (config.bindirme) — ikisi de aynı fabrikadan geçer.
  const ham = bindirmeAyarEski(ad);
  // 74.5: kullanıcının oluşturduğu bot → yalnız kayıttan (sır yok; canlı fabrikada reddedilir).
  const yeniKayit = yeniBotMu(ad) ? (BOT_KAYIT && BOT_KAYIT.kayit(ad)) : null;
  if (yeniBotMu(ad) && !yeniKayit) throw new Error(`bot kaydı yok: ${ad}`);
  const kayit = BOT_KAYIT ? BOT_KAYIT.etkinKayit(ad) : null;
  const r = yeniKayit ? botFabrikasi.argumanlar(yeniKayit, mod, FABRIKA_ORTAM, {})
    : kayit ? botFabrikasi.argumanlar(kayit, mod, FABRIKA_ORTAM, botKayitLib.sirlar(ham)) : botFabrikasi.argumanlarAyardan(ham, ad, mod, FABRIKA_ORTAM);
  const { dizin, canliMi, ayar: a } = r;
  const y = new CanliYurutucu(r.yurutucu);
  const bot = new BindirmeBot(y, r.bot);
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
    } else if (mod === 'demo' && yeniKayit) {
      // 74.5: yeni bot — bağlı demo hesabın anahtarı (Anahtarlar kimliğiyle; bağlanış anında güncel kayıttan, a4 yeniden denetlenir).
      const an = yeniBotAnahtari(ad, 'demo');
      ozet = await y.baglan({ ortam: 'testnet', apiKey: an.apiKey, apiSecret: an.apiSecret, veri });
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

// 74.4 A1 göçü (a2): Kairos/Tao tanımı config.bindirme'den live/botlar/<ad>.json'a (doğrulama tutmazsa göç yok, eski yol + WARN).
try { BOT_KAYIT.gocEt(config, BINDIRME_ADLAR); } catch (e) { db.addLog('ERROR', `[BOT KAYDI] göç yapılamadı: ${e.message} — eski yol (config.bindirme)`); }
for (const ad of BINDIRME_ADLAR) {
  let mod = bindirmeAyar(ad).mod;
  if (!BINDIRME_MODLAR.includes(mod)) { db.addLog('WARN', `[BİNDİRME] ${ad}: geçersiz mod "${mod}" — kâğıt kullanılıyor`); mod = 'kagit'; }
  const b = bindirmeler[ad] = bindirmeKur(ad, mod);
  if (b.bot.durum.calisiyor && !ARASTIRMA_MODU && !tasimaLib.botBekliyor(ad)) acilisBaglan(ad, b);   // 68.1: taşıma sonrası mutabakat bekler
  else if (b.bot.durum.calisiyor && tasimaLib.botBekliyor(ad)) db.addLog('WARN', `[${ad}] taşıma dosyasıyla gelindi — bot kendiliğinden başlamadı; önce mutabakat, sonra Başlat`);
}

/**
 * 74.5 (A1 + 2. faz parça 2b — TASARIM-MAKINE-HESAP-BOT §2.6–2.10): KULLANICININ OLUŞTURDUĞU BOTLAR. Kayıt TEK kaynak (live/botlar/<kimlik>.json);
 * açılışta (göçten sonra) yüklenir, panelden (POST /api/botlar) çalışma zamanında eklenir. Her tüketici listeyi BINDIRME_ADLAR / bindirmeler /
 * saglikBotlar'dan çağrı anında okur. Kurallar: a6 her zaman kâğıtta başlar; a3 yalnız Kairos/Tao kuralı; a4 aynı borsa hesabına ikinci bot
 * yok (kâğıt hariç); a5 sermaye sabit üst sınır (USD, bakiye azsa bakiye — Ecap = min(E, tavan) bot içinde); CANLI YOK (5. faza kadar);
 * demo yalnız Binance demo hesabıyla (A2'ye kadar). Kairos/Tao'nun yolu (74.7: kayıt tek kaynak + config.bindirme geri dönüş yansıması) ayrı.
 */
const anahtarlarLib = require('./lib/anahtarlar');
/** Bot nesnesi → şu an kullandığı borsa hesabı kimliği (kâğıtta null). Kairos/Tao her zaman sabit hesaplar (eski anahtar alanları). */
function botHesapId(b) {
  if (!b || b.mod === 'kagit') return null;
  if (!yeniBotMu(b.ad)) return b.mod === 'demo' ? 'binance-demo' : 'binance-canli';
  const k = BOT_KAYIT && BOT_KAYIT.kayit(b.ad);
  return (k && k.hesap && k.hesap[b.mod]) || null;
}
/** Anahtarlar hesabı (sır DAHİL — yalnız sunucu içinde; dışarı verilmez). Bilinmeyen → null. */
function hesapBilgisi(id) {
  const s = anahtarlarLib.SABIT[id];
  if (s) return { id, ad: s.ad, borsa: 'binance', tur: s.tur, sabit: true, apiKey: config[s.key] || '', apiSecret: config[s.secret] || '' };
  const h = ((loadSecrets() || {}).borsaHesaplari || {})[id];
  if (!h || typeof h !== 'object') return null;
  return { id, ad: String(h.ad || id).slice(0, 40), borsa: h.borsa || null, tur: h.tur || null, sabit: false, altHesap: h.altHesap || null, apiKey: h.apiKey || '', apiSecret: h.apiSecret || '' };
}
/** Hesap bu moda bağlanabilir mi → engel metni | null (A2'ye kadar yalnız Binance; tür moda uymalı; canlı yeni botlara kapalı). */
function hesapUygunMu(h, mod) {
  if (mod === 'canli') return YENI_CANLI_RED;
  if (!h) return 'hesap Anahtarlar\'da bulunamadı (silinmiş olabilir)';
  if (h.borsa !== 'binance') return 'bu sürümde yalnız Binance hesapları bağlanır (OKX/Bybit 5. fazda)';
  if (h.tur !== mod) return `hesap türü "${h.tur === 'canli' ? 'canlı' : h.tur || '?'}" — ${mod} moduna yalnız ${mod} hesabı bağlanır`;
  if (!h.apiKey || !h.apiSecret) return 'hesabın API anahtarı eksik (Ayarlar › Anahtarlar)';
  return null;
}
/** a4: başka bir bot (kâğıt dışı) ya da Borsa sekmesinin eski yürütücüsü bu hesabı kullanıyor mu → engel metni | null. */
function hesapCakismasi(ad, mod, hesapId) {
  if (mod === 'kagit' || !hesapId) return null;
  for (const x of BINDIRME_ADLAR) {
    if (x === ad) continue;
    const o = bindirmeler[x];
    if (o && o.mod !== 'kagit' && botHesapId(o) === hesapId) return `${o.bot.adGorunen} bu hesabı ${o.mod === 'demo' ? 'demo' : 'gerçek para'} modunda kullanıyor — aynı borsa hesabına ikinci bot bağlanamaz (her bot kendi hesabı / alt hesabı)`;
  }
  if (hesapId === 'binance-demo' && canli.borsa && canli.ortam === 'testnet') return 'Borsa sekmesinde demo hesaba ayrı bir bağlantı açık — önce onu kesin (aynı hesapta iki yürütücü olmaz)';
  if (hesapId === 'binance-canli' && canli.borsa && canli.ortam === 'live') return 'Borsa sekmesinde gerçek hesaba ayrı bir bağlantı açık — önce onu kesin';
  return null;
}
/** Yeni botun bağlanış anahtarı (yalnız demo). */
function yeniBotAnahtari(ad, mod) {
  if (mod !== 'demo') throw new Error(YENI_CANLI_RED);
  const k = BOT_KAYIT && BOT_KAYIT.kayit(ad);
  const id = k && k.hesap ? k.hesap.demo : null;
  if (!id) throw new Error(`${botEtiketi(ad)}: demo hesabı bağlı değil — Ayarlar › Botlar › Hesap (acil PIN)`);
  const h = hesapBilgisi(id);
  const u = hesapUygunMu(h, 'demo');
  if (u) throw new Error(`${botEtiketi(ad)}: ${u}`);
  const c = hesapCakismasi(ad, 'demo', id);
  if (c) throw new Error(c);
  return { apiKey: h.apiKey, apiSecret: h.apiSecret };
}
/** Yeni botu çalışma zamanı listelerine ekler (açılışta ve POST /api/botlar). Sağlık sinyali adresi secrets'tan (bindirmeSaglik). */
function botEkle(k, { acilis = false } = {}) {
  const kayit = BOT_KAYIT.kayit(k);
  if (!kayit) throw new Error(`bot kaydı yok: ${k}`);
  require('./lib/botAdlari').kaydet(k, kayit.adGorunen || k);
  if (!saglikBotlar[k]) saglikBotlar[k] = new SaglikSinyali({ ad: `sağlık sinyali (${botEtiketi(k)})`, urlFn: () => botSaglikUrl(config, k), kaydet: (sv, m) => db.addLog(sv, `[SAĞLIK] ${m}`) });
  let mod = kayit.mod;
  if (mod === 'canli' || !BINDIRME_MODLAR.includes(mod)) { db.addLog('ERROR', `[BOT KAYDI] ${k}: mod "${mod}" yeni botta kullanılamaz — kâğıt`); mod = 'kagit'; }
  const b = bindirmeler[k] = bindirmeKur(k, mod);
  if (!BINDIRME_ADLAR.includes(k)) BINDIRME_ADLAR.push(k);
  if (acilis && b.bot.durum.calisiyor && !ARASTIRMA_MODU && !tasimaLib.botBekliyor(k)) acilisBaglan(k, b);
  else if (acilis && b.bot.durum.calisiyor && tasimaLib.botBekliyor(k)) db.addLog('WARN', `[${k}] taşıma dosyasıyla gelindi — bot kendiliğinden başlamadı; önce mutabakat, sonra Başlat`);
  return b;
}
/** Botu çalışma zamanı listelerinden çıkarır (arşiv). Dosyalar ve bot dizini olduğu gibi kalır. */
function botCikar(k) {
  const b = bindirmeler[k];
  if (b) { try { if (b.bot.zamanlayici) b.bot.durdur(); } catch { /* */ } try { if (b.y.borsa) b.y.baglantiyiKes(); } catch { /* */ } }
  delete bindirmeler[k];
  delete saglikBotlar[k];
  const i = BINDIRME_ADLAR.indexOf(k);
  if (i >= 0) BINDIRME_ADLAR.splice(i, 1);
}
try {
  for (const k of BOT_KAYIT.yukle()) {
    try { botEkle(k, { acilis: true }); } catch (e) { db.addLog('ERROR', `[BOT KAYDI] ${k}: yüklenemedi — ${e.message}`); }
  }
  for (const [k, x] of Object.entries(BOT_KAYIT.arsivliler())) require('./lib/botAdlari').kaydet(k, x.adGorunen || k);   // geçmiş satırlarında ad
} catch (e) { db.addLog('ERROR', `[BOT KAYDI] yeni botlar yüklenemedi: ${e.message}`); }
/**
 * 74.6 (A1 + 2. faz parça 2c — TASARIM-MAKINE-HESAP-BOT §2.6 "Model şablonları"): MODEL ÖRNEKLERİ (Nova / Lydia / Simurg'un ikinci
 * kâğıt hesabı). Bot kaydı (live/botlar/<kimlik>.json, motor 'model') TEK KAYNAK; tasarımcı tarafına yansıması
 * <tasarimci>/ornekler/<kimlik>/sermaye.json (lib/tasarimci/ornekler.js yansit) — tasarımcı tiki (alt süreç) yalnız onu okur ve
 * ornekler/<kimlik>/kagit.json'u yazar. Model örneği BİNDİRME BOTU DEĞİLDİR: BINDIRME_ADLAR / bindirmeler / sağlık sinyali / öz denetim /
 * veri kalitesi / emir uçlarında YOK (model botları da oralarda yok); görüldüğü yerler model botlarıyla aynı: Botlar › portföy botu sayfası,
 * Botlar › Özet, rapor (kâğıt hesaplar), Telegram kâğıt hesap alım-satım özeti. Demo/canlı ve borsa hesabı bu sürümde YOK (açık ret).
 */
const ORNEKLER_LIB = require('./lib/tasarimci/ornekler');
const tasarimciDefter = require('./lib/tasarimci/defter');
const modelOrnegiMi = (k) => !!(BOT_KAYIT && botKayitLib.modelMi(BOT_KAYIT.kayit(k) || BOT_KAYIT.arsivKayit(k)));
/** Kayıt → tasarımcı yansıması (sermaye.json). Hata yutulmaz (çağıran karar verir). */
const ornekYansit = (kayit) => ORNEKLER_LIB.yansit(tasarimciDefter, kayit);
try {
  for (const x of [...Object.values(BOT_KAYIT.modelKayitlari()), ...Object.values(BOT_KAYIT.arsivliler()).filter(botKayitLib.modelMi)]) {
    require('./lib/botAdlari').kaydet(x.kimlik, x.adGorunen || x.kimlik);
    try { if (ornekYansit(x)) db.addLog('INFO', `[BOT KAYDI] ${x.adGorunen} (${x.kimlik}): model örneğinin tasarımcı yansıması kayıttan yenilendi`); }
    catch (e) { db.addLog('ERROR', `[BOT KAYDI] ${x.kimlik}: model örneği yansıtılamadı — ${e.message}`); }
  }
} catch (e) { db.addLog('ERROR', `[BOT KAYDI] model örnekleri yüklenemedi: ${e.message}`); }
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
      portfoyBildirici.gonder('alarm', `${botEtiketi(ad)}: açılışta bağlanılamadı`, [e.message, `${Math.round((Date.now() - bas) / 60000)} dakikadır deneniyor; denemeler sürüyor (en çok 30 dk arayla).`]);
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
    if (AYAR_DEPOSU.SIR_GECIS && AYAR_DEPOSU.SIR_GECIS.yapildi) db.addLog('SUCCESS', `[İŞLETİM] sır dosyası şifrelendi (Windows DPAPI, yalnız bu bilgisayardaki bu Windows kullanıcısı çözer)${AYAR_DEPOSU.SIR_GECIS.neden ? ` — ${AYAR_DEPOSU.SIR_GECIS.neden}` : ''}`);
    for (const [ad, g] of Object.entries(AYAR_DEPOSU.KASA_GECIS || {})) if (ad !== 'secrets.json' && g && g.yapildi) db.addLog('SUCCESS', `[İŞLETİM] ${ad} sır kasasına alındı${g.neden ? ` — ${g.neden}` : ''}`);
    else if (AYAR_DEPOSU.SIR_GECIS && /doğrulanamadı/.test(AYAR_DEPOSU.SIR_GECIS.neden || '')) db.addLog('ERROR', `[İŞLETİM] ${AYAR_DEPOSU.SIR_GECIS.neden}`);
    for (const m of [loadConfig._yedekten, AYAR_DEPOSU.SIRLAR_BOZUK, AYAR_DEPOSU.SIRLAR_KILITLI].filter(Boolean)) {
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
  // 74.6: model örneği bindirme botu değil — demo/canlı, başlat/durdur, acil fren yok (kâğıt hesap tasarımcı tikinde hesaplanır)
  if (!b && modelOrnegiMi(String(req.params.ad || ''))) { res.status(409).json({ success: false, modelOrnegi: true, error: `${botEtiketi(req.params.ad)}: ${botKayitLib.MODEL_ORNEK_RED}. Kâğıt hesabı Botlar sayfasında (#/botlar/${req.params.ad}).` }); return null; }
  if (!b) { res.status(404).json({ success: false, error: `bilinmeyen bot: ${req.params.ad} (${BINDIRME_ADLAR.join(' | ')})` }); return null; }
  return b;
}
/** Demo hesabı tek: başka bir portföy botu ya da Borsa sekmesinin Donchian botu aynı hesapta çalışmasın. */
function bindirmeDemoCakisma(b) {
  // C1 denetim notu (62.1): Borsa sekmesinin eski yürütücüsü (canliIzin) gerçek hesaba bağlıyken portföy botu gerçek parada
  // başlatılamaz/çalıştırılamaz — aynı anahtarla iki yürütücü aynı hesabı yönetir, mutabakat ve K-TEK bozulur.
  if (b.mod === 'canli' && canli.borsa && canli.ortam === 'live') throw new Error('Borsa sekmesinde gerçek hesaba ayrı bir bağlantı açık — önce onu kesin (aynı hesapta iki yürütücü olmaz)');
  if (b.mod !== 'demo') return;
  // 74.5 (a4): çakışma HESAP bazında — Kairos/Tao ikisi de sabit 'binance-demo' kullandığı için onlarda davranış aynı; başka demo hesaba
  // bağlı yeni bot bu kuralla Kairos'u engellemez (ayrı hesap).
  const hid = botHesapId(b);
  if (!hid) throw new Error(`${b.bot.adGorunen}: demo hesabı bağlı değil — Ayarlar › Botlar › Hesap`);
  for (const ad of BINDIRME_ADLAR) if (ad !== b.ad && bindirmeler[ad].mod === 'demo' && botHesapId(bindirmeler[ad]) === hid) throw new Error(`${bindirmeler[ad].bot.adGorunen} zaten demo modunda — tek demo hesapta iki portföy botu mutabakatı bozar`);
  if (hid === 'binance-demo' && canli.ortam === 'testnet' && donchianBot.durum.calisiyor) throw new Error('Borsa sekmesindeki Donchian botu demo hesapta çalışıyor — önce onu durdurun');
  // §2.10: aynı hesapta iki botun emir kimliği öneki (bd + ilk 2 harf) aynı olamaz (a4 zaten engeller; kimlik kuralı da — üçüncü savunma).
  for (const ad of BINDIRME_ADLAR) if (ad !== b.ad && bindirmeler[ad].mod !== 'kagit' && botHesapId(bindirmeler[ad]) === hid && ad.slice(0, 2) === b.ad.slice(0, 2)) throw new Error(`${bindirmeler[ad].bot.adGorunen} ile emir kimliği öneki (bd${ad.slice(0, 2)}) aynı hesapta çakışıyor`);
}

/**
 * 74.4 (A1 2a) GET /api/botlar — bot listesi kayıttan (live/botlar/<kimlik>.json; göç olmadıysa eski yol). Panel Botlar listesi bunu
 * okur. Görünen ad: botAdlari (kimlikten) → kaydın adGorunen'i → strateji adı. Yalnız okuma (telefon + araştırma kopyası EV_YOLU ile
 * sunucudan). Sır yok; bot yazma uçları (/api/bindirme/:ad/*) aynen. Yeni bot oluşturma 2b'de.
 */
/**
 * 74.5 (A1 2b): yeni botlar da listede (yeni: true); ?arsiv=1 arşivdekileri de verir (arsiv: { zaman }). Her satırda kıyas notu
 * (yeni Kairos tipi bot: ENGEL eşiği hucum.C0'a göre, kâğıtta yalnız uyarı; küçük sermaye açıksa Kairos-S gölgesi 972 bilgi olarak).
 */
function botSatiri(ad, k, b, durumlar) {
  const botAdlari = require('./lib/botAdlari');
  const strateji = (k && k.strateji) || ad;
  const st = bindirmeArastirma.STRATEJILER[strateji] || {};
  const sablonAd = (k && k.sablon) || botSablonlari.GOC_SABLON[ad] || null;
  const sb = sablonAd ? botSablonlari.sablon(sablonAd) : null;
  const yeni = yeniBotMu(ad);
  const mod = b ? b.mod : (k ? k.mod : null);
  let kiyas = null;
  if (yeni && k) {
    const tavan = mod === 'demo' ? k.sermaye.demo : k.sermaye.kagit;
    const kucukAcik = k.kucukSermaye === true || (k.kucukSermaye === 'oto' && +tavan < 5000);
    let hucumS = null;
    if (strateji === 'hucum' && kucukAcik) {
      try { const p = require('./lib/ileri/hucumSGolge').panelVerisi(); hucumS = { deneme: p.deneme, son: (p.ozet && p.ozet.rapor && p.ozet.rapor.son) || null, uc: '/api/ileri/hucum-s' }; }
      catch { hucumS = { deneme: 972, son: null, uc: '/api/ileri/hucum-s' }; }
    }
    kiyas = { model: `${strateji}.C0`, metin: `kıyas: ${botEtiketi(strateji)} modeli (${strateji}.C0) — ENGEL eşiği buna göre${mod === 'kagit' ? '; kâğıtta sapma yalnız uyarı' : ''}`,
      engelYalnizUyari: mod === 'kagit', kucukSermayeAcik: kucukAcik, hucumS };
  }
  const hesapAdi = (id) => { if (!id) return null; const h = hesapBilgisi(id); return h ? h.ad : `${id} (Anahtarlar'da yok)`; };
  return { kimlik: ad, adGorunen: botAdlari.ad(ad) || (k && k.adGorunen) || st.ad || ad, motor: 'bindirme', strateji, sablon: sablonAd,
    aciklama: (sb && sb.aciklama) || st.aciklama || null, mod, calisiyor: !!(b && b.bot.durum.calisiyor),
    kayit: durumlar[ad] || { durum: 'eski-yol', neden: 'kayıt yüklenmedi' }, hesap: k ? { ...k.hesap } : null, sermaye: k ? { ...k.sermaye } : null,
    makine: k ? k.makine : null,
    // 74.5
    yeni, arsiv: (k && k.arsiv) || null, kucukSermaye: k ? k.kucukSermaye : null,
    hesapAdlari: k && yeni ? { demo: hesapAdi(k.hesap.demo), canli: null } : null,
    arsivlenebilir: yeni && !!b && b.mod === 'kagit' && !b.bot.durum.calisiyor,
    canliKapali: yeni, kiyas, olusturma: (k && k.olusturma) || null };
}
function botListesi({ arsiv = false } = {}) {
  const durumlar = BOT_KAYIT ? BOT_KAYIT.durum() : {};
  const l = BINDIRME_ADLAR.map(ad => botSatiri(ad, BOT_KAYIT ? BOT_KAYIT.kayit(ad) : null, bindirmeler[ad], durumlar));
  if (arsiv && BOT_KAYIT) for (const [ad, k] of Object.entries(BOT_KAYIT.arsivliler())) if (!botKayitLib.modelMi(k)) l.push(botSatiri(ad, k, null, durumlar));
  return l;
}
/** 74.6: model örneği satırı (GET /api/botlar `ornekler`; `botlar` dizisi geriye uyum için YALNIZ bindirme botları). */
function ornekSatiri(k, durumlar = {}) {
  const sb = botSablonlari.sablon(k.sablon) || {};
  const BA = require('./lib/botAdlari');
  return { kimlik: k.kimlik, adGorunen: k.adGorunen || k.kimlik, motor: 'model', model: k.model, modelAd: BA.ad(k.model) || k.model, sablon: k.sablon,
    aciklama: sb.aciklama || null, mod: 'kagit', calisiyor: false, para: k.para || 'USD', sermaye: { ...k.sermaye }, baslangic: k.baslangic || null,
    kayit: durumlar[k.kimlik] || { durum: k.arsiv ? 'arsiv' : 'kayit', neden: null }, hesap: { ...k.hesap }, makine: k.makine || null,
    yeni: true, arsiv: k.arsiv || null, arsivlenebilir: !k.arsiv, canliKapali: true, demoKapali: true, olusturma: k.olusturma || null, href: `#/botlar/${k.kimlik}` };
}
function ornekListesi({ arsiv = false } = {}) {
  if (!BOT_KAYIT) return [];
  const durumlar = BOT_KAYIT.durum();
  const l = Object.values(BOT_KAYIT.modelKayitlari()).map(k => ornekSatiri(k, durumlar));
  if (arsiv) for (const k of Object.values(BOT_KAYIT.arsivliler())) if (botKayitLib.modelMi(k)) l.push(ornekSatiri(k, durumlar));
  return l;
}
app.get('/api/botlar', (req, res) => {
  try { const arsiv = String((req.query || {}).arsiv || '') === '1'; res.json({ success: true, surum: botKayitLib.SURUM, kaynak: 'kayit', botlar: botListesi({ arsiv }), ornekler: ornekListesi({ arsiv }) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/botlar/sablonlar', (req, res) => res.json({ success: true, sablonlar: botSablonlari.liste(), olusturma: true,
  sinirlar: { sermayeEnAz: botKayitLib.SERMAYE_EN_AZ, sermayeEnCok: botKayitLib.SERMAYE_EN_COK, kimlik: '2–16 küçük harf/rakam, harfle başlar; ilk iki harf her botta farklı' } }));
/** 74.5: bağlanabilir borsa hesapları (Anahtarlar) — SIR YOK (yalnız ad, borsa, tür, anahtar var mı, kim kullanıyor). */
app.get('/api/botlar/hesaplar', (req, res) => {
  try {
    const sir = loadSecrets() || {};
    const idler = [...Object.keys(anahtarlarLib.SABIT), ...Object.keys(sir.borsaHesaplari || {}).filter(id => /^[a-z0-9][a-z0-9-]{1,31}$/.test(id) && !anahtarlarLib.SABIT[id])];
    const hesaplar = idler.map(id => {
      const h = hesapBilgisi(id);
      const kullanan = BINDIRME_ADLAR.map(ad => bindirmeler[ad]).filter(b => b && botHesapId(b) === id).map(b => ({ kimlik: b.ad, ad: b.bot.adGorunen, mod: b.mod }));
      const bagli = Object.values(BOT_KAYIT ? BOT_KAYIT.kayitlar() : {}).filter(k => yeniBotMu(k.kimlik) && k.hesap && (k.hesap.demo === id || k.hesap.canli === id)).map(k => ({ kimlik: k.kimlik, ad: k.adGorunen || k.kimlik }));
      const neden = hesapUygunMu(h, h && h.tur === 'canli' ? 'canli' : 'demo');
      return { id, ad: h ? h.ad : id, borsa: h ? h.borsa : null, tur: h ? h.tur : null, sabit: !!(h && h.sabit), altHesap: (h && h.altHesap) || null,
        anahtarVar: !!(h && h.apiKey && h.apiSecret), kullanan, bagli, demoyaUygun: !neden && !!h && h.tur === 'demo', neden };
    });
    res.json({ success: true, hesaplar });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

/* ── 74.5 YAZMA UÇLARI (yalnız sunucu bilgisayarındaki panel: telefon salt okuma, geliştirme kademesine eklenmedi, araştırmada 403) ── */
const botYerelDegil = (req, res) => {
  if ((req.kademe || 'yerel') !== 'yerel') { res.status(403).json({ success: false, error: 'Botlar yalnız sunucu bilgisayarındaki panelden yönetilir (telefon izler, geliştirme bilgisayarı yazamaz).' }); return true; }
  if (ARASTIRMA_MODU) { res.status(409).json({ success: false, error: 'Bu bilgisayar araştırma kopyası — botlar sunucuda oluşturulur ve yönetilir.' }); return true; }
  return false;
};
/** Acil PIN + onay (anahtarlar.js deseni: yanlış 400, tanımsız 428, kilit 429). null = geçti. */
function botPinKapisi(g) {
  if (g.onay !== true) return { durum: 400, govde: { success: false, error: 'Onay gerekli.' } };
  const r = acilPin.pinDogrula(String(g.pin == null ? '' : g.pin).trim());
  if (r.ok) return null;
  if (r.tanimli === false) return { durum: 428, govde: { success: false, pinTanimsiz: true, error: 'Acil PIN bu bilgisayarda tanımlı değil — önce bilgisayar başında `npm run acil-pin` ile PIN belirleyin.' } };
  return { durum: r.durum === 429 ? 429 : 400, govde: { success: false, pinHatali: true, error: r.hata } };
}
const botHata = (res, e) => res.status(e && [400, 404, 409].includes(e.kod) ? e.kod : 500).json({ success: false, error: e ? e.message : 'bilinmeyen hata' });
/** Kullanılan görünen adlar (yeni botun adı bunlardan farklı olmalı): tablo adları + eski adlar + bütün kayıtlar (arşiv dahil). */
function doluAdlar() {
  const BA = require('./lib/botAdlari');
  const l = [];
  for (const id of BA.SIRA) l.push(BA.ad(id), BA.eski(id));
  for (const k of Object.values({ ...(BOT_KAYIT ? BOT_KAYIT.kayitlar() : {}), ...(BOT_KAYIT ? BOT_KAYIT.arsivliler() : {}) })) if (k.adGorunen) l.push(k.adGorunen);
  return l.filter(Boolean);
}
/** POST /api/botlar — şablondan YENİ KÂĞIT bot (PIN yok, onay var — kâğıt, para riski yok). */
app.post('/api/botlar', (req, res) => {
  if (botYerelDegil(req, res)) return;
  const g = req.body || {};
  if (g.onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
  try {
    const BA = require('./lib/botAdlari');
    const sb0 = botSablonlari.sablon(String(g.sablon || ''));
    if (sb0 && sb0.motor === 'model' && (g.hesap != null || (g.mod != null && g.mod !== 'kagit'))) return res.status(409).json({ success: false, error: botKayitLib.MODEL_ORNEK_RED });
    const kayit = BOT_KAYIT.yeni({ sablon: g.sablon, kimlik: g.kimlik, adGorunen: g.adGorunen, sermaye: g.sermaye, kucukSermaye: g.kucukSermaye, ...(sb0 && sb0.motor === 'model' ? { baslangic: g.baslangic } : {}) },
      { dolu: doluAdlar(), takma: (k) => !!BA.kimlik(k) });
    if (botKayitLib.modelMi(kayit)) {
      // 74.6: model örneği — bindirme botu KURULMAZ; tasarımcı yansıması yazılır (kâğıt hesap tasarımcının sonraki tikinde)
      try { ornekYansit(kayit); }
      catch (e) { try { BOT_KAYIT.arsivle(kayit.kimlik, `kurulamadı: ${e.message}`); } catch { /* */ } throw Object.assign(new Error(`model örneği kurulamadı (kayıt arşive alındı): ${e.message}`), { kod: 500 }); }
      BA.kaydet(kayit.kimlik, kayit.adGorunen);
      const modelAd = BA.ad(kayit.model) || kayit.model, birim = kayit.para === 'TRY' ? 'TL' : 'USD';
      db.addLog('INFO', `[BOTLAR] yeni model örneği: ${kayit.adGorunen} (${kayit.kimlik}, ${modelAd} örneği, kâğıt sermayesi ${kayit.sermaye.kagit} ${birim}, başlangıç ${kayit.baslangic || 'modelin ilk günü'}) — kâğıt hesap tasarımcının sonraki tikinde`);
      portfoyBildirici.gonder('bilgi', `Yeni model örneği: ${kayit.adGorunen}`, [`${modelAd} modelinin ikinci kâğıt hesabı (aynı kararlar, ayrı sermaye; gerçek emir yok).`, 'Siz oluşturmadıysanız: Ayarlar › Botlar › Arşivle.']);
      return res.json({ success: true, bot: ornekSatiri(kayit, BOT_KAYIT.durum()) });
    }
    try { botEkle(kayit.kimlik); }
    catch (e) { try { BOT_KAYIT.arsivle(kayit.kimlik, `kurulamadı: ${e.message}`); } catch { /* */ } throw Object.assign(new Error(`bot kurulamadı (kayıt arşive alındı): ${e.message}`), { kod: 500 }); }
    db.addLog('INFO', `[BOTLAR] yeni kâğıt bot: ${kayit.adGorunen} (${kayit.kimlik}, ${botSablonlari.sablon(kayit.sablon).ad || kayit.sablon}, üst sınır ${kayit.sermaye.kagit} USD) — durmuş; Başlat ile çalışır`);
    portfoyBildirici.gonder('bilgi', `Yeni kâğıt bot: ${kayit.adGorunen}`, [`Şablon: ${botSablonlari.sablon(kayit.sablon).ad || kayit.sablon}. Kâğıt hesap (gerçek emir yok), henüz başlatılmadı.`, 'Siz oluşturmadıysanız: Ayarlar › Botlar › Arşivle.']);
    res.json({ success: true, bot: botSatiri(kayit.kimlik, BOT_KAYIT.kayit(kayit.kimlik), bindirmeler[kayit.kimlik], BOT_KAYIT.durum()) });
  } catch (e) { botHata(res, e); }
});
/** Yeni bot uçlarının ortak girişi: bilinmeyen 404; Kairos/Tao bu uçlarda değişmez (409) — `goc` true ise Kairos/Tao da kabul. */
function yeniBotBul(req, res, { goc = false } = {}) {
  const k = String(req.params.k || '');
  if (!goc && !yeniBotMu(k) && BINDIRME_ADLAR.includes(k)) { res.status(409).json({ success: false, error: `${botEtiketi(k)} sabit hesaplarını ve kendi ayar yolunu kullanır — bu işlem yalnız sizin oluşturduğunuz botlarda` }); return null; }
  const b = bindirmeler[k];
  if (!b) { res.status(404).json({ success: false, error: BOT_KAYIT && BOT_KAYIT.arsivKayit(k) ? 'bot arşivde — önce geri getirin' : `bilinmeyen bot: ${k}` }); return null; }
  return b;
}
/** POST /api/botlar/:k/hesap { mod: 'demo', hesap: <Anahtarlar kimliği> | null, pin, onay: true } — acil PIN + onay. */
app.post('/api/botlar/:k/hesap', (req, res) => {
  if (botYerelDegil(req, res)) return;
  if (modelOrnegiMi(String(req.params.k || ''))) return res.status(409).json({ success: false, error: botKayitLib.MODEL_ORNEK_RED });   // 74.6
  const b = yeniBotBul(req, res); if (!b) return;
  const g = req.body || {};
  const mod = String(g.mod || '');
  if (mod === 'canli') return res.status(409).json({ success: false, error: YENI_CANLI_RED });
  if (mod !== 'demo') return res.status(400).json({ success: false, error: 'mod "demo" olmalı (kâğıt hesap borsa hesabı istemez)' });
  const id = g.hesap == null || g.hesap === '' ? null : String(g.hesap);
  if (id !== null && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) return res.status(400).json({ success: false, error: 'hesap kimliği geçersiz' });
  if (b.mod === mod) return res.status(409).json({ success: false, error: `${b.bot.adGorunen} şu an ${mod} modunda — hesap çalışırken değişmez; önce kâğıda dönün` });
  let h = null;
  if (id) {
    h = hesapBilgisi(id);
    const u = hesapUygunMu(h, mod);
    if (u) return res.status(400).json({ success: false, error: u });
  }
  const pk = botPinKapisi(g);
  if (pk) return res.status(pk.durum).json(pk.govde);
  try {
    if (id) { const c = hesapCakismasi(b.ad, mod, id); if (c) return res.status(409).json({ success: false, error: c }); }
    const yeni = BOT_KAYIT.guncelle(b.ad, (c) => { c.hesap = { ...(c.hesap || {}), [mod]: id }; }, id ? 'hesap bağlandı' : 'hesap bağı kaldırıldı');
    db.addLog('INFO', `[BOTLAR] ${b.bot.adGorunen}: ${mod} hesabı ${id ? `→ ${h.ad} (${id})` : 'bağı kaldırıldı'}`);
    const baskasi = id ? Object.values(BOT_KAYIT.kayitlar()).filter(x => x.kimlik !== b.ad && x.hesap && x.hesap[mod] === id).map(x => x.adGorunen || x.kimlik) : [];
    res.json({ success: true, hesap: { ...yeni.hesap }, uyari: baskasi.length ? `${baskasi.join(', ')} de bu hesaba bağlı — aynı anda yalnız biri ${mod} modunda olabilir (a4).` : null,
      bot: botSatiri(b.ad, yeni, bindirmeler[b.ad], BOT_KAYIT.durum()) });
  } catch (e) { botHata(res, e); }
});
/**
 * POST /api/botlar/:k/sermaye { mod: 'kagit' | 'demo', tutar (USD), pin?, onay: true } — a5 sermaye üst sınırı. Kâğıtta onay; demoda ARTIŞ acil PIN
 * ister (azaltma risk düşürür). Bot durmuşken. Kairos/Tao da (74.7: kayda — gocBotAyarYaz); Kairos demo kabulü süresince Kairos demo sınırı
 * değişmez. Gerçek para üst sınırı bu uçtan değişmez (canlı kapısı + onaylı üst sınır).
 */
app.post('/api/botlar/:k/sermaye', (req, res) => {
  if (botYerelDegil(req, res)) return;
  if (modelOrnegiMi(String(req.params.k || ''))) return ornekSermaye(req, res);   // 74.6
  const b = yeniBotBul(req, res, { goc: true }); if (!b) return;
  const g = req.body || {};
  const mod = String(g.mod || '');
  if (mod === 'canli') return res.status(409).json({ success: false, error: yeniBotMu(b.ad) ? YENI_CANLI_RED : 'Gerçek para üst sınırı bu ekrandan değişmez — canlı kapısı ve onaylı üst sınır (PLAN-GERCEK-PARA-2027).' });
  if (!['kagit', 'demo'].includes(mod)) return res.status(400).json({ success: false, error: 'mod kagit | demo olmalı' });
  if (g.onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
  const tutar = typeof g.tutar === 'string' && /^\d+(\.\d{1,2})?$/.test(g.tutar.trim()) ? +g.tutar.trim() : g.tutar;
  const sh = botKayitLib.sermayeHatasi(tutar);
  if (sh) return res.status(400).json({ success: false, error: sh });
  if (b.bot.durum.calisiyor || b.bot.mesgul) return res.status(409).json({ success: false, error: 'önce botu durdurun (sermaye üst sınırı bot çalışırken değişmez)' });
  if (b.ad === 'hucum' && mod === 'demo' && Date.now() < VeriKalitesi.KORUMA_BITIS) return res.status(409).json({ success: false, error: `Kairos demo kabulü ${new Date(VeriKalitesi.KORUMA_BITIS).toISOString().slice(0, 10)} sonuna kadar sürüyor — Kairos'un demo sermaye sınırı bu süre içinde değişmez.` });
  const a = bindirmeAyar(b.ad);
  const simdiki = mod === 'demo' ? +a.demoSermayeTavani : +a.sermayeTavani;
  const t = Math.round(tutar * 100) / 100;
  if (t === simdiki) return res.json({ success: true, degismedi: true, tutar: t });
  if (mod === 'demo' && t > simdiki) { const pk = botPinKapisi(g); if (pk) return res.status(pk.durum).json(pk.govde); }
  try {
    if (yeniBotMu(b.ad)) {
      const kagitDosyaVar = fs.existsSync(path.join(bindirmeDizin(b.ad, 'kagit'), 'kagit-borsa.json'));
      BOT_KAYIT.guncelle(b.ad, (c) => { c.sermaye = { ...c.sermaye, [mod]: t }; if (mod === 'kagit' && !kagitDosyaVar) c.kagitBakiye = t; }, 'sermaye üst sınırı');
    } else {
      gocBotAyarYaz(b.ad, { [mod === 'demo' ? 'demoSermayeTavani' : 'sermayeTavani']: t }, 'sermaye üst sınırı');   // 74.7: kayda (tek kaynak)
    }
    if (b.mod === mod) {
      if (b.y.borsa) b.y.baglantiyiKes();
      if (b.bot.zamanlayici) b.bot.durdur();
      bindirmeler[b.ad] = bindirmeKur(b.ad, mod);
    }
    db.addLog('INFO', `[BOTLAR] ${b.bot.adGorunen}: ${mod === 'demo' ? 'demo' : 'kâğıt'} sermaye üst sınırı ${simdiki} → ${t} USD`);
    res.json({ success: true, mod, eski: simdiki, tutar: t });
  } catch (e) { botHata(res, e); }
});
/**
 * 74.6: model örneğinin kâğıt sermayesi { mod: 'kagit', tutar, onay: true } — PIN yok (kâğıt). Kâğıt hesap değişikliği o gün para
 * yatırma/çekme olarak işler (lib/tasarimci/kagit.js tikHesapla: getiri bozulmaz). demo/canlı 409.
 */
function ornekSermaye(req, res) {
  const k = String(req.params.k || ''), g = req.body || {};
  const kayit = BOT_KAYIT.kayit(k);
  if (!kayit) return res.status(404).json({ success: false, error: 'model örneği arşivde — önce geri getirin' });
  if (String(g.mod || '') !== 'kagit') return res.status(409).json({ success: false, error: botKayitLib.MODEL_ORNEK_RED });
  if (g.onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
  const tutar = typeof g.tutar === 'string' && /^\d+(\.\d{1,2})?$/.test(g.tutar.trim()) ? +g.tutar.trim() : g.tutar;
  const sh = botKayitLib.sermayeHatasi(tutar);
  if (sh) return res.status(400).json({ success: false, error: kayit.para === 'TRY' ? sh.replace(/USD/g, 'TL') : sh });
  const t = Math.round(tutar * 100) / 100, eski = kayit.sermaye.kagit;
  if (t === eski) return res.json({ success: true, degismedi: true, tutar: t });
  try {
    const yeni = BOT_KAYIT.guncelle(k, (c) => { c.sermaye = { ...c.sermaye, kagit: t }; }, 'kâğıt sermayesi');
    ornekYansit(yeni);
    db.addLog('INFO', `[BOTLAR] ${kayit.adGorunen}: model örneğinin kâğıt sermayesi ${eski} → ${t} ${kayit.para === 'TRY' ? 'TL' : 'USD'} (kâğıt hesapta bugün para ${t > eski ? 'yatırma' : 'çekme'} olarak işlenir)`);
    res.json({ success: true, mod: 'kagit', eski, tutar: t, para: kayit.para || 'USD' });
  } catch (e) { botHata(res, e); }
}
/** POST /api/botlar/:k/arsivle { onay: true } — yalnız kâğıtta ve durmuş yeni bot; dosyalar SİLİNMEZ (kayıtta arsiv, bot dizini yerinde). */
app.post('/api/botlar/:k/arsivle', (req, res) => {
  if (botYerelDegil(req, res)) return;
  if (!yeniBotMu(String(req.params.k || ''))) return res.status(409).json({ success: false, error: 'Kairos ve Tao arşivlenemez' });
  if (modelOrnegiMi(String(req.params.k || ''))) {
    // 74.6: model örneği — kayıtta arsiv + yansımada arsiv (tasarımcı hesaplamaz); kâğıt hesap dosyaları SİLİNMEZ
    if ((req.body || {}).onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
    try {
      const k = String(req.params.k), ad = botEtiketi(k);
      const x = BOT_KAYIT.arsivle(k, 'panel');
      ornekYansit(x);
      db.addLog('INFO', `[BOTLAR] ${ad} (${k}) model örneği arşivlendi — kayıt ve kâğıt hesap dosyaları silinmedi (tasarimci/ornekler/${k}); geri getirilebilir`);
      return res.json({ success: true, arsiv: true });
    } catch (e) { return botHata(res, e); }
  }
  const b = yeniBotBul(req, res); if (!b) return;
  if ((req.body || {}).onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
  if (b.mod !== 'kagit') return res.status(409).json({ success: false, error: 'yalnız kâğıt moddaki bot arşivlenir — önce kâğıda dönün' });
  if (b.bot.durum.calisiyor || b.bot.mesgul || (typeof b.bot.calismaSuruyor === 'function' && b.bot.calismaSuruyor())) return res.status(409).json({ success: false, error: 'önce botu durdurun' });
  try {
    const ad = b.bot.adGorunen;
    BOT_KAYIT.arsivle(b.ad, 'panel');
    botCikar(b.ad);
    db.addLog('INFO', `[BOTLAR] ${ad} (${b.ad}) arşivlendi — kayıt ve kâğıt hesap dosyaları silinmedi (data/live/${b.ad}); geri getirilebilir`);
    res.json({ success: true, arsiv: true });
  } catch (e) { botHata(res, e); }
});
/** POST /api/botlar/:k/geri-getir { onay: true } — arşivden kâğıtta geri getirir (durmuş). */
app.post('/api/botlar/:k/geri-getir', (req, res) => {
  if (botYerelDegil(req, res)) return;
  const k = String(req.params.k || '');
  if ((req.body || {}).onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
  try {
    const x = BOT_KAYIT.geriGetir(k);
    if (botKayitLib.modelMi(x)) {   // 74.6: model örneği — yansıma güncellenir, bindirme botu kurulmaz
      ornekYansit(x);
      require('./lib/botAdlari').kaydet(k, x.adGorunen || k);
      db.addLog('INFO', `[BOTLAR] ${botEtiketi(k)} (${k}) model örneği arşivden geri getirildi — kâğıt hesap sonraki tikte yeniden hesaplanır`);
      return res.json({ success: true, bot: ornekSatiri(x, BOT_KAYIT.durum()) });
    }
    botEkle(k);
    db.addLog('INFO', `[BOTLAR] ${botEtiketi(k)} (${k}) arşivden geri getirildi (kâğıt, durmuş)`);
    res.json({ success: true, bot: botSatiri(k, BOT_KAYIT.kayit(k), bindirmeler[k], BOT_KAYIT.durum()) });
  } catch (e) { botHata(res, e); }
});

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

/** OTOMATİK GÜNCELLEME (61.3) uçları — ayrıntı ve uç listesi lib/sunucu/guncellemeUclari.js başlığında. */
require('./lib/guncelleme');   // C1 (75.0): adı kullanan kod (öz denetim, sorun merkezi, Telegram) lib/sunucu/*'te — yükleme sırası aynı
const GUNCELLEME_UCLARI = require('./lib/sunucu/guncellemeUclari');   // C1 (74.8): /api/guncelleme/*, /api/sistem/* (yeniden başlat, durdur)
GUNCELLEME_UCLARI.kur(ctx);

/** ÖZ DENETİM (69.1), ikinci uyarı kanalı, kara kutu, 74.3 VERİ KALİTESİ uçları — ayrıntı ve uç listesi lib/sunucu/saglikUclari.js başlığında. */
const SAGLIK_UCLARI = require('./lib/sunucu/saglikUclari').olustur(ctx);   // C1 (75.0): üç grup, eski yerlerinde (öz denetim · health/status · test/kalp atışı)
const { ozDenetim } = SAGLIK_UCLARI.ozDenetimUclari();

/** 73.7 SORUN MERKEZİ (/api/sorunlar*) + 73.8 SORUN ARAÇLARI (/api/sorun-arac/*) — ayrıntı lib/sunucu/sorunUclari.js başlığında. */
const { SORUN, sorunlarHesapla, bilinenSirlar } = require('./lib/sunucu/sorunUclari').kur(ctx);   // C1 (75.0)

SAGLIK_UCLARI.durumUclari();   // C1 (75.0): GET /api/health, GET /api/status — lib/sunucu/saglikUclari.js

/* C1 (74.8): gösterge havuzu (/api/indicators*), strateji kataloğu (/api/strategies), Pine içe aktarma (/api/pine*) ve backtest/iş/strateji
 * araştırma uçları lib/sunucu/arastirmaUclari.js'te; her grup server.js'teki ESKİ YERİNDE bağlanır (Express uç sırası aynı kalır). */
const ARASTIRMA_UCLARI = require('./lib/sunucu/arastirmaUclari').olustur(ctx);
ARASTIRMA_UCLARI.gostergeUclari();

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
    // 74.5: yalnız AYNI hesabı (sabit Binance demo / canlı anahtarı) kullanan bot sayılır — başka demo hesaba bağlı yeni bot çakışmaz.
    const ayniHesap = BINDIRME_ADLAR.map(ad => bindirmeler[ad]).find(b => b && botHesapId(b) === (ortam === 'live' ? 'binance-canli' : 'binance-demo') && ((ortam === 'live' && b.mod === 'canli') || (ortam === 'testnet' && b.mod === 'demo' && b.bot.durum.calisiyor)));
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
      const ayni = BINDIRME_ADLAR.map(ad => bindirmeler[ad]).find(b => b && botHesapId(b) === (canli.ortam === 'live' ? 'binance-canli' : 'binance-demo') && ((canli.ortam === 'testnet' && b.mod === 'demo') || (canli.ortam === 'live' && b.mod === 'canli')));   // 74.5: hesap bazında
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
  for (const ad of STRATEJI_ADLAR) {   // 74.5: ölçüm strateji başına (yeni botlar aynı kuralı paylaşır)
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
    if (yeniBotMu(b.ad)) {
      // 74.5: yeni bot — canlı TAMAMEN kapalı; demo yalnız bağlı Binance demo hesabıyla ve a4 temizse (PIN: masaüstünde yerel PIN kapısı).
      if (mod === 'canli') return res.status(409).json({ success: false, error: YENI_CANLI_RED });
      if (mod === 'demo') {
        const id = ((BOT_KAYIT.kayit(b.ad) || {}).hesap || {}).demo;
        if (!id) return res.status(409).json({ success: false, error: `${b.bot.adGorunen}: demo hesabı bağlı değil — önce Ayarlar › Botlar › Hesap (acil PIN)` });
        const u = hesapUygunMu(hesapBilgisi(id), 'demo');
        if (u) return res.status(409).json({ success: false, error: u });
        const c = hesapCakismasi(b.ad, 'demo', id);
        if (c) return res.status(409).json({ success: false, error: c });
      }
    }
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
    if (yeniBotMu(b.ad)) BOT_KAYIT.guncelle(b.ad, (c) => { c.mod = mod; }, 'mod');   // 74.5: yeni bot — kayıt tek kaynak
    else gocBotAyarYaz(b.ad, { mod }, 'mod');   // 74.7: Kairos/Tao — kayda (tek kaynak); config.bindirme yansıması saveConfig'te
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
    if (yeniBotMu(b.ad)) BOT_KAYIT.guncelle(b.ad, (c) => { c.kucukSermaye = v; }, 'küçük sermaye');   // 74.5: yeni bot — kayıt tek kaynak
    else gocBotAyarYaz(b.ad, { kucukSermaye: v }, 'küçük sermaye');   // 74.7: kayda (tek kaynak)
    db.addLog('INFO', `[${b.ad}] küçük sermaye (Kairos-S): ${anahtar}`);
    res.json({ success: true, secim: anahtar, bot: b.bot.ozet() });
  } catch (err) { borsaHata(res, err); }
});

/**
 * 68.8 KÂĞIT HESABI SIFIRLA (TEMİZ BAŞLA) — lib/live/kagitSifirla.js. Yalnız kâğıt modda ve bot durmuşken (yoksa 409); gövde
 * { onay: 'SIFIRLA' }. Botun dizini (data/live/<ad>) SİLİNMEZ: `<ad>-onceki-<UTC zaman>` yedeğine taşınır; bot taze durumla yeniden
 * kurulur (sermaye = kagitBakiye; son gün yok → ilk çalışmada kaçırılan gün telafisi yok). Demo / canlı dizinine dokunmaz.
 * 68.9 (G7, PLAN-GERCEK-PARA-2027 §1): isteğe bağlı { btcAyak: 'spot' | 'coklu' } — BTC ayağı biçimi YALNIZ sıfırlamayla değişir
 * (spot ↔ çoklu varlık durumu birbirine taşınmaz); bot kaydına btcAyak yazılır (74.7; config.bindirme yansıması), bot o biçimle taze kurulur.
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
    if (yeniAyak != null && yeniBotMu(b.ad)) BOT_KAYIT.guncelle(b.ad, (c) => { c.btcAyak = yeniAyak; }, 'BTC ayağı (kâğıt sıfırlama)');   // 74.5
    else if (yeniAyak != null) gocBotAyarYaz(b.ad, { btcAyak: yeniAyak }, 'BTC ayağı (kâğıt sıfırlama)');   // 74.7: kayda (tek kaynak)
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
/** 74.5: yeni bot Anahtarlar'daki AYRI bir demo hesaba bağlıysa o hesabın adıyla (demo-<kimlik>) — Kairos'un "testnet" defteriyle karışmasın. */
function bindirmeHesapAdi(b) { const hid = yeniBotMu(b.ad) ? botHesapId(b) : null; if (hid && !anahtarlarLib.SABIT[hid]) return `demo-${hid}`; return b.y.borsa ? (b.y.ortam === 'kagit' ? `kagit-${b.ad}` : b.y.ortam) : (b.mod === 'demo' ? 'testnet' : `kagit-${b.ad}`); }

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

// ── İLERİ VERİ GÖLGE İZLEYİCİ (Bollinger, PLAN-ILERI-BOLLINGER) + İLERİ TEST uçları (/api/ileri/kabul, /api/ileri/bollinger) ──
const { ileriIs, demoKabulOzet } = require('./lib/sunucu/ileriUclari').kur(ctx);   // C1 (75.0): lib/sunucu/ileriUclari.js

/** AYAR UÇLARI — GET /api/config, POST /api/secrets (sirlariUygula), POST /api/config (configUygula); ayrıntı lib/sunucu/ayarUclari.js başlığında. */
const { sirlariUygula, configUygula } = require('./lib/sunucu/ayarUclari').kur(ctx);   // C1 (75.0)

require('./lib/sunucu/kagitMotorUclari').kur(ctx);   // C1 (74.8): mum, izleme listesi, start/stop, kill-switch, risk, işlemler, cüzdan, sıfırlama, /api/bots/* — lib/sunucu/kagitMotorUclari.js

ARASTIRMA_UCLARI.backtestUclari();   // C1 (74.8): /api/backtest, venues, funding, backtest/optimize, walk-forward — lib/sunucu/arastirmaUclari.js

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
require('./lib/veri/aralik');   // C1 (74.8): kullanan uçlar lib/sunucu/arastirmaUclari.js isUclari() — yükleme sırası aynı
const { Isler } = require('./lib/isler');
const isler = new Isler((tur, veri) => broadcast(tur, veri));

/* PORTFÖY LABORATUVARI, VERİ ORKESTRATÖRÜ, coin tarama, ileriye kayıt, piyasa bağlamı, yapay zekâ notları, araştırma defteri, günlükler —
 * lib/sunucu/kisiselUclar.js laboratuvarUclari(); diğer iki grup aşağıda eski yerlerinde (Express uç ve zamanlayıcı sırası aynı). */
const KISISEL_UCLAR = require('./lib/sunucu/kisiselUclar').olustur(ctx);   // C1 (75.0)
const { veriOrk, piyasaBaglami, yapayZeka } = KISISEL_UCLAR.laboratuvarUclari();
BILDIRIM_KURULUM.uclar();   // C1 (75.0): /api/bildirim*, GET /api/makine/nabiz, rapor motoru (/api/rapor*) — lib/sunucu/bildirimKurulum.js

/* PORTFÖYÜM (lib/portfoyum), İŞLEM DEFTERİ (lib/islemDefteri), 73.0 AYARLAR › ANAHTARLAR (lib/anahtarlar) — lib/sunucu/kisiselUclar.js portfoyUclari(). */
const { portfoyum, islemDefteri, anahtarlar } = KISISEL_UCLAR.portfoyUclari();   // C1 (75.0)
anahtarYonlendirici = anahtarlar.router;

BILDIRIM_KURULUM.ureticiler();   // C1 (75.0): 73.5 bildirim üreticileri, 73.9 piyasa bildirimi, 73.7 BIST hafif fiyat (yalnız sunucu) — lib/sunucu/bildirimKurulum.js
KISISEL_UCLAR.tasarimciUclari();   // C1 (75.0): işlem defteri eşitlemesi, PORTFÖY TASARIMCISI (lib/tasarimci), 74.2 AYAR GEÇMİŞİ uçları — lib/sunucu/kisiselUclar.js

ARASTIRMA_UCLARI.isUclari();   // C1 (74.8): /api/veri/kapsam·indir, /api/backtest/is, /api/is/*, /api/strateji/*, backtest/scan-watchlist, strategy-scan — lib/sunucu/arastirmaUclari.js

SAGLIK_UCLARI.testUclari();   // C1 (75.0): POST /api/saglik/test, GET /api/saglik/durum, sunucu kalp atışı (healthchecksSunucuUrl) — lib/sunucu/saglikUclari.js

/** TELEGRAM KOMUTLARI + 74.0 MENÜ (YALNIZ OKUMA) ve POST /api/telegram/test — ayrıntı lib/sunucu/bildirimKurulum.js telegram(). */
const { telegramYoklayici } = BILDIRIM_KURULUM.telegram();   // C1 (75.0)

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
  if (BILDIRIM_KURULUM.bildirimUreticileri) {
    BILDIRIM_KURULUM.bildirimUreticileri.baslat();
    if (BILDIRIM_KURULUM.piyasaBildirim) BILDIRIM_KURULUM.piyasaBildirim.baslat();
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
