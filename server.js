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
const APP_VERSION = '77.5';

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
  // 75.1 (C1 parça 3): borsa yürütücüleri, bot yönetimi, bot uçları ve süreç modüllerinin okudukları; BOT_KAYIT yazımı (bot yönetimi kurar)
  borsa: () => BORSA, botYonetimi: () => BOTLAR, borsaModu: () => borsaModu, botKayitYaz: () => (k) => { BOT_KAYIT = k; },
  wss: () => wss, server: () => server, HOST: () => HOST, bildirimKurulum: () => BILDIRIM_KURULUM,
  // 75.2 (3a): makine eşlemesi (lib/makine/eslesme) — güvenlik katmanının makine kademesiyle AYNI örnek
  makineEslesme: () => MAKINE_ESLESME,
  // 75.3 (3b): makine modülü (yönetici kararı → Telegram yoklayıcısının engel kancası; B3 kademe kapısı)
  makine: () => MAKINE,
  // B2 + D2: olay akışı ve haftalık karne (bildirim üreticisi karneyi buradan alır — çağrı anında okunur)
  olayAkisi: () => OLAY_UCLARI,
  // A3 toplam risk (lib/sunucu/toplamRiskUclari.js) — bot kurulumu (kapı kancası) ve makine risk ucu çağrı anında okur
  toplamRisk: () => TOPLAM_RISK,
});

/**
 * C1 (75.0, TASARIM-MAKINE-HESAP-BOT §3 parça 2) AYAR DEPOSU — lib/sunucu/ayarDeposu.js: GİZLİ ANAHTARLAR config.json'da DURMAZ
 * (data/secrets.json — 69.4 sır kasası; Y5: "yok" ile "var ama bozuk" ayrı, bozuk/kilitliyse yazma reddi + açılış alarmı), etkin ayar
 * okuma/yazma (loadConfig / saveConfig / mergeConfig — 68.0 ayarlar katmanı, 74.7 bot kaydı yansıması, 74.2 ayar geçmişi), 68.8 bot başına
 * sağlık sırları, 69.3 sürüm izi (commitOku, ayarIzi). `config` değişkeni BURADA kalır. Sırlar dosyasının durumu AYAR_DEPOSU okuyucularında
 * (SIRLAR_BOZUK, SIRLAR_KILITLI, SIR_GECIS, KASA_GECIS). Yükleme sırası aynı: lib/guvenlik → lib/live/kaliciDosya → lib/sirKasasi → sır kasası geçişi.
 */
const guvenlikKur = require('./lib/guvenlik');
require('./lib/live/kaliciDosya');   // C1 (75.1): adı kullanan kod (dış IP izleyici) lib/sunucu/botYonetimi.js'te — yükleme sırası aynı
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
/**
 * 75.2 MAKİNE KADEMESİ (3. faz parça 3a, TASARIM-MAKINE-HESAP-BOT §4.2): eşlenmiş başka bir Pusula makinesi x-pusula-makine +
 * x-pusula-makine-jeton ile gelir; jeton <veri>/makine-jetonlari.json'daki özete karşı (lib/makine/eslesme). Yalnız MAKINE_IZINLI uçları
 * (lib/guvenlik.js). Uçlar ve nabız lib/sunucu/makineUclari.js'te (aşağıda, bildirim uçlarından sonra).
 */
const MAKINE_ESLESME = require('./lib/makine/eslesme').olustur();
const guvenlik = guvenlikKur.kur({
  dinlenen: HOST,
  jeton: guvenlikKur.geriDonusMu(HOST) ? '' : (process.env.PANEL_TOKEN || loadSecrets().panelToken || ''),
  jetonOku: guvenlikKur.jetonOkuyucu(__dirname),
  izinliHostlar: (process.env.PANEL_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean),
  // 64.8 geliştirme yazma kademesi: sunucuda `npm run gelistirme-jeton` (data/gelistirme-jeton.json yalnız SHA-256 özet). Araştırma
  // modundaki makine (geliştirme bilgisayarı) bu jetonu hiç kabul etmez — iletilen yazmayı yalnız sunucu alır.
  gelistirmeOzetOku: ARASTIRMA_MODU ? null : guvenlikKur.gelistirmeOzetOkuyucu(__dirname),
  gelistirmeKapali: ARASTIRMA_MODU,
  makineDogrula: (kimlik, jeton) => MAKINE_ESLESME.gelenDogru(kimlik, jeton)
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
const ARASTIRMA_KAPALI = /^\/api\/(exchange|kalkan|bindirme|botlar|bots|start|stop|position|hesap-islemleri|telegram|saglik|guncelleme|sistem|sermaye)(\/|$)/;
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
// 75.5 (3c) NÖBET KAPISI (lib/makine/nobet.js; lib/sunucu/makineUclari.js nobetKapisi): başka makineye taşınmış ya da taşınmakta olan bot
// burada başlamaz, çalışmaz, borsaya bağlanmaz, ayarı değişmez (durdur serbest); eşli sunucuda elle Başlat / Çalıştır taze nöbet denetiminden geçer.
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const m = guvenlikKur.yasakYolu(req.path).match(/^\/api\/bindirme\/([a-z][a-z0-9]{1,15})\/([a-z-]{2,24})$/);
  if (!m || m[2] === 'durdur') return next();
  let p;
  try { p = ctx.makine.nobetKapisi(m[1], m[2]); } catch { return next(); }
  Promise.resolve(p).then((e) => (e ? res.status(409).json({ success: false, kod: 'nobet', nobet: { kod: e.kod, makine: e.makine || null, nobet: e.nobet == null ? null : e.nobet }, error: e.metin }) : next()), () => next());
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
 * CANLI BORSA KATMANI (lib/live/) — paper motordan AYRI (Borsa sekmesinin elle bağlanan yürütücüsü + DonchianBot) ve B KALKAN (yalnız
 * kâğıt borsa) — lib/sunucu/borsaUclari.js yurutuculer() (C1 75.1); uçları aşağıda eski yerinde (BORSA_UCLARI.uclar()).
 */
const BORSA_UCLARI = require('./lib/sunucu/borsaUclari').olustur(ctx);   // C1 (75.1)
const BORSA = BORSA_UCLARI.yurutuculer();
const { canli, donchianBot, kalkanYurutucu, kalkanBot } = BORSA;   // taşıma kapısı (TASIMA.botlarCalisiyor) okur

/**
 * BOT YÖNETİMİ — HÜCUM / DENGE (Kairos/Tao, lib/live/bindirmeBot) + kullanıcının oluşturduğu botlar: bot kaydı (74.4, BOT_KAYIT buraya
 * ctx.botKayitYaz ile yazılır), göç, bindirmeAyar/gocBotAyarYaz (74.7 tek kaynak), gerçek para kapısı, sağlık sinyalleri, portföy
 * bildiricisi, açılış bağlanışı, bekçi, disk, dış IP, hesap bağlama, model örnekleri — lib/sunucu/botYonetimi.js kur() (C1 75.1).
 * Aşağıdaki adlar ctx okuyucularına ve taşıma kapısına (TASIMA.botlarCalisiyor) verilir; dizi/nesneler AYNI başvuru.
 */
const BOT_YONETIMI = require('./lib/sunucu/botYonetimi').olustur(ctx);   // C1 (75.1)
const BOTLAR = BOT_YONETIMI.kur();
const { STRATEJI_ADLAR, BINDIRME_ADLAR, botEtiketi, yeniBotMu, botHesapId, GOLGE_DOSYA, ikinciKanal, portfoyBildirici, saglikBotlar, saglikBot,
  saglikSunucu, veriKalitesiAyar, diskDurumu, bindirmeler, bindirmeAyar } = BOTLAR;

/* 74.4–74.6 BOT LİSTESİ VE YENİ BOT UÇLARI (/api/botlar*: liste, şablonlar, hesaplar, yeni kâğıt bot / model örneği, hesap bağlama,
 * sermaye, arşiv, geri getir) — lib/sunucu/botUclari.js botlarUclari(); bindirme uçları aşağıda eski yerinde. */
const BOT_UCLARI = require('./lib/sunucu/botUclari').olustur(ctx);   // C1 (75.1)
BOT_UCLARI.botlarUclari();

/* Panelin borsa modu rozeti (borsaModu), motor TICK yayını (engine.onTickCallback), WebSocket ilk durum, ensureEngineRunning —
 * lib/sunucu/botYonetimi.js motor(). */
const { borsaModu, ensureEngineRunning } = BOT_YONETIMI.motor();   // C1 (75.1)

/* SÜREÇ (kapanış, son kapanış işareti) — lib/sunucu/surec.js. Burada KURULUR (güncelleme uçları ve öz denetim shutdown /
 * sonKapanisPlanliMi okur); dinleme ve process olayları dosyanın sonunda, eski yerinde SUREC.baslat(). */
const SUREC = require('./lib/sunucu/surec').olustur(ctx);   // C1 (75.1)
const { shutdown, sonKapanisPlanliMi } = SUREC;

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

/* BORSA (canlı / testnet) /api/exchange/* + B KALKAN (yalnız kâğıt borsa) /api/kalkan/* — lib/sunucu/borsaUclari.js uclar(). */
BORSA_UCLARI.uclar();   // C1 (75.1)

/* HÜCUM / DENGE (bindirme) uçları /api/bindirme/*, HESAP İŞLEMLERİ (/api/hesap-islemleri*, 15 dk eşitleme), HESAPLAR (/api/hesaplar*),
 * /api/bindirme/:ad/grafik, /api/bindirme-telegram — lib/sunucu/botUclari.js bindirmeUclari(). */
BOT_UCLARI.bindirmeUclari();   // C1 (75.1)

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
/* 75.2 (3a) MAKİNELER: kimlik, eşleme, nabız (POST /api/makine/nabiz — makine kademesi), B1 pano (salt okuma); 75.3 (3b) yönetici makine + B3 kademe — lib/sunucu/makineUclari.js. */
const MAKINE = require('./lib/sunucu/makineUclari').kur(ctx);
/* A3 TOPLAM RİSK (bütün hesaplar): ölçüm + kayıt + uyarı, GET /api/toplam-risk, POST /api/toplam-risk/{esikler,kip}; sınır kipinde kapı kancası — lib/sunucu/toplamRiskUclari.js. */
const TOPLAM_RISK = require('./lib/sunucu/toplamRiskUclari').kur(ctx);

/* PORTFÖYÜM (lib/portfoyum), İŞLEM DEFTERİ (lib/islemDefteri), 73.0 AYARLAR › ANAHTARLAR (lib/anahtarlar) — lib/sunucu/kisiselUclar.js portfoyUclari(). */
const { portfoyum, islemDefteri, anahtarlar } = KISISEL_UCLAR.portfoyUclari();   // C1 (75.0)
anahtarYonlendirici = anahtarlar.router;
/* B2 OLAY AKIŞI (GET /api/olaylar — eşler + sunucu birleşik, GET /api/makine/olaylar) + D2 HAFTALIK KARNE (GET /api/karne) — lib/sunucu/olayUclari.js;
 * kaynaklara yazma kancası YOK (toplayıcı mevcut kayıtları okur), bot kodu değişmez. */
const OLAY_UCLARI = require('./lib/sunucu/olayUclari').kur(ctx);
/* D3 TATBİKAT SİHİRBAZI (Sistem › Tatbikatlar; GET /api/tatbikat, POST /api/tatbikat/{baslat,adim,kaydet,iptal,otomatik}) — lib/sunucu/tatbikatUclari.js;
 * sihirbaz emir vermez, bot ayarı değiştirmez, süreç kapatmaz — kullanıcının yaptığını kayıtlardan doğrular. */
require('./lib/sunucu/tatbikatUclari').kur(ctx);
/* A4 SERMAYE DAĞITIMI + ONAYLI ALT HESAPLAR ARASI AKTARIM (Botlar › Sermaye dağıtımı; GET /api/sermaye/dagitim, POST /api/sermaye/{dagitim/ayar,aktar/onizle,aktar,aktar/sorgula})
 * — lib/sunucu/sermayeUclari.js; otomatik aktarım YOK, dış adrese çekme YOK, canlı hesap kapısı varsayılan KAPALI (prova kipi sahte borsada). */
require('./lib/sunucu/sermayeUclari').kur(ctx);

BILDIRIM_KURULUM.ureticiler();   // C1 (75.0): 73.5 bildirim üreticileri, 73.9 piyasa bildirimi, 73.7 BIST hafif fiyat (yalnız sunucu) — lib/sunucu/bildirimKurulum.js
KISISEL_UCLAR.tasarimciUclari();   // C1 (75.0): işlem defteri eşitlemesi, PORTFÖY TASARIMCISI (lib/tasarimci), 74.2 AYAR GEÇMİŞİ uçları — lib/sunucu/kisiselUclar.js

ARASTIRMA_UCLARI.isUclari();   // C1 (74.8): /api/veri/kapsam·indir, /api/backtest/is, /api/is/*, /api/strateji/*, backtest/scan-watchlist, strategy-scan — lib/sunucu/arastirmaUclari.js

SAGLIK_UCLARI.testUclari();   // C1 (75.0): POST /api/saglik/test, GET /api/saglik/durum, sunucu kalp atışı (healthchecksSunucuUrl) — lib/sunucu/saglikUclari.js

/** TELEGRAM KOMUTLARI + 74.0 MENÜ (YALNIZ OKUMA) ve POST /api/telegram/test — ayrıntı lib/sunucu/bildirimKurulum.js telegram(). */
const { telegramYoklayici } = BILDIRIM_KURULUM.telegram();   // C1 (75.0)

/* SÜREÇ — HTTP dinleme (EADDRINUSE), donma bekçisi, açılış işleri, kapanış (Y8), son kapanış işareti, SIGINT/SIGTERM/SIGHUP,
 * unhandledRejection, uncaughtException — lib/sunucu/surec.js baslat(); ESKİ YERİNDE, dosyanın en sonunda (sıra aynı). */
SUREC.baslat();   // C1 (75.1)
