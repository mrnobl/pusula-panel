/**
 * PANEL GÜVENLİĞİ — canlı moda geçmenin ön koşulu.
 *
 * Proje yerelde tek kullanıcılı kâğıt bot olarak çalışırken güvenlik bilinçli
 * olarak sona bırakılmıştı. Gerçek borsa anahtarı girildiği anda üç açık
 * gerçek risk oluyor:
 *
 *   1. SIR SIZINTISI. `GET /api/config` bellekteki config'i olduğu gibi
 *      döndürüyordu — anahtarlar dahil. Aynı nesne WebSocket'ten de yayınlanıyordu.
 *   2. TARAYICI ÜZERİNDEN SALDIRI. Sunucu yalnız yerelde dinlese bile, kullanıcının
 *      açtığı herhangi bir site tarayıcıya `http://localhost:3000/api/...` isteği
 *      attırabilir. DNS rebinding ile cevabı da okuyabilir. Host ve Origin
 *      başlıklarını denetlemek ikisini de keser.
 *   3. AĞA AÇIK DİNLEME. `server.listen(PORT)` tüm arayüzlerde dinler; aynı
 *      ağdaki herkes paneli açıp emir verebilirdi.
 *
 * Kural: varsayılan `127.0.0.1`. Başka bir adrese bağlanılırsa (VPS, telefon için
 * yerel ağ) panel jetonu ZORUNLU olur ve sunucu jetonsuz açılmaz.
 *
 * TARAYICIDAN JETON (2026-10-08, sürüm 60.2): ağa açık dinlemede jeton yalnız
 * `x-panel-token` başlığıyla kabul ediliyordu; telefon tarayıcısı bu başlığı
 * gönderemez (sayfa, betikler, CSS ve WebSocket tarayıcının kendi istekleri) →
 * panel telefonda HİÇ açılmıyordu (index.html bile 403). Çözüm OTURUM ÇEREZİ:
 *   · Jetonsuz SAYFA isteğine (GET, HTML) 401 + kendi içinde (dış dosyasız) GİRİŞ
 *     SAYFASI döner. Sayfa jetonu adresin `#jeton=…` parçasından (parça sunucuya
 *     hiç gitmez) ya da elle girilen kutudan alır, adresi HEMEN temizler
 *     (`history.replaceState`) ve `POST /api/giris`e yollar.
 *   · Doğru jetona `pusula_oturum` çerezi verilir: değeri jetonun KENDİSİ DEĞİL,
 *     HMAC-SHA256(jeton) — HttpOnly (sayfa betiği okuyamaz), SameSite=Lax (başka
 *     siteden POST/fetch/WebSocket isteğine eklenmez), 30 gün. Jeton değişince
 *     bütün çerezler kendiliğinden geçersiz olur.
 *   · Host/Origin denetimi jetondan ÖNCE ve AYNEN çalışır; giriş ucu da ondan geçer.
 *     Yanlış jetona IP başına 10 dakikada 10 deneme hakkı (jeton 192 bit; sınır
 *     yalnız günlüğü/işlemciyi korumak için).
 *   · WebSocket aynı çerezle doğrulanır (tarayıcı yükseltme isteğine çerezi ekler).
 * Yerel dinlemede (127.0.0.1) hiçbiri devreye girmez: jeton istenmez.
 */
const crypto = require('crypto');
const yollar = require('./yollar');

const GERI_DONUS = new Set(['127.0.0.1', '::1', 'localhost']);
const OTURUM_CEREZI = 'pusula_oturum';
const OTURUM_SURE_SN = 30 * 24 * 3600;
const GIRIS_YOLU = '/api/giris';
const GIRIS_HAK = 10;
const GIRIS_PENCERE_MS = 10 * 60 * 1000;
/**
 * Tailscale serve adları (`<makine>.<ağ>.ts.net`): HOST başlığında izinli; bu adlardan gelen istek telefon kademesidir (jeton zorunlu).
 * 69.6 (güvenlik testi YÜKSEK-1): Origin artık yalnız izinli bir ad olması yetmez — isteğin Host'uyla AYNI köken olmalı
 * (ad + port). Önce herhangi bir `*.ts.net` sitesi (saldırganın ücretsiz Tailscale Funnel sayfası) 127.0.0.1'e gövdesiz POST
 * atıp "yerel" sayılıyordu; `localhost:5173` gibi başka yerel portlar da öyle.
 */
const IZINLI_SON_EKLER = ['.ts.net'];
/** 69.6 bütün cevaplara: çerçeveye yalnız kendi kökeni (index.html kendi sayfasını çerçeveler), MIME koklama yok, yönlendiren yok. */
const GUVENLIK_BASLIKLARI = {
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "frame-ancestors 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
/** 69.6: tarayıcının Sec-Fetch-Site değeri; bu ikisi dışındaki YAZMA isteği yerel sayılmaz (başka siteden tetiklenmiş). */
const AYNI_SITE = new Set(['same-origin', 'none']);
/** Vekil (proxy) başlıkları: biri varsa istek 127.0.0.1'den gelse de "yerel" sayılmaz. */
const VEKIL_BASLIKLARI = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip',
  'tailscale-user-login', 'tailscale-user-name', 'tailscale-funnel-request'];
const OKUMA_YONTEMLERI = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Telefon kademesinde izinli TEK yazma: acil durdurma uçları (lib/acilPin.js PIN + "DURDUR" ister). */
const TELEFON_YAZMA = require('./acilPin').TELEFON_PIN_YOLU;   // acil durdurma + (61.3) güncelleme — ikisi de PIN'li

/**
 * GELİŞTİRME YAZMA KADEMESİ (64.8, kullanıcı kararı 2026-10-16 "sunucu tek kaynak + kuyruk"): geliştirme bilgisayarı kişisel
 * kayıtları (İşlem defterim, Portföyüm) sunucudaki panele yazar. Telefon kademesindeki bir istek (panel jetonu doğru) AYRICA
 * `x-gelistirme-token` başlığı taşıyor ve bu başlık sunucuda `npm run gelistirme-jeton` ile üretilen jetonun SHA-256 özetine
 * eşitse (zaman sabit karşılaştırma) YALNIZ aşağıdaki uçlara yazabilir — `req.kademe = 'gelistirme'`. Geri kalan her şey
 * telefon kademesiyle AYNI (GET dışı 403). OKX anahtar/eşitleme uçları, bot, ayar, güncelleme, sistem, emir uçları listede
 * YOK (geliştirme bilgisayarı OKX'e kendi anahtarıyla gider, sonucu /okx/kayitlar ile yollar; 65.0 Binance aynı: /binance/kayitlar —
 * Binance anahtar/eşitleme uçları da listede YOK).
 * Sunucu araştırma modundaysa (yani o makine aslında geliştirme bilgisayarıysa) jeton hiç kabul edilmez.
 * Bu liste İKİ TARAFIN tek kaynağıdır: lib/evYazma.js geliştirme bilgisayarında hangi isteği sunucuya ileteceğini buradan seçer.
 */
const KIMLIK_PARCA = '[a-z0-9_.-]{1,48}';
const GELISTIRME_YAZMA = [
  ['GET', /^\/api\/ev-yazma\/dene$/],
  ['POST', /^\/api\/islem-defteri\/(hesap|onizle|yukle|okx\/kayitlar|binance\/kayitlar)$/],
  ['POST', new RegExp(`^/api/islem-defteri/(hesap/${KIMLIK_PARCA}|yukleme/${KIMLIK_PARCA}/geri-al|kayit/${KIMLIK_PARCA}/iptal)$`)],
  ['POST', /^\/api\/portfoyum\/(kurum|hesap|varlik|islem|fiyat|hedef|portfoy|csv\/onizle|csv\/ice-aktar|fiyat-yenile|hizli-ekle|hizli-duzenle|plan-kaydet|tasima)$/],
  // Yeni panel F3: hesabı portföye bağla (portfoy) ve toplam kapsamı (kapsam)
  ['POST', new RegExp(`^/api/portfoyum/(hesap/${KIMLIK_PARCA}/(kapat|faiz|portfoy|kapsam)|kayit/${KIMLIK_PARCA}/iptal)$`)],
  ['PUT', new RegExp(`^/api/portfoyum/(kurum|hesap|varlik|portfoy)/${KIMLIK_PARCA}$`)],
  // 73.0 Ayarlar › Anahtarlar: borsa hesabı ekle/değiştir/sil, salt okuma sınama, acil PIN değiştir — gövdede PIN, SUNUCU doğrular
  // (lib/anahtarlar.js). Eski şifreli dosyayı kenara alma ve bekleyenler listede YOK (o bilgisayarın kendi işi).
  ['POST', /^\/api\/anahtarlar\/(hesap|degistir|sil|sina|pin-degistir)$/],
  // 73.4 model portföy sermayesi / kesirli hisse ayarı (resmî kâğıt hesap sunucuda): gövde SUNUCUNUN aynı doğrulamasından geçer
  // (lib/tasarimci/api.js POST /sermaye — bilinmeyen model / geçersiz tutar / üstel yazım 400, 10 kat değişim ve silme 409 onay
  // sorusu, bilinmeyen alan yok sayılır). Kuyruğa girmez (lib/evYazma ucTanimi). Uygula / geri al / hedef aktarımı listede YOK.
  ['POST', /^\/api\/tasarimci\/sermaye$/],
  // 73.5 Sistem › Bildirimler: tür aç/kapat, metin şablonu, kanal, sessiz saat, üretici ayarı — bildirimleri SUNUCU gönderir, ayar
  // onun dosyasında (data/bildirim-ayar.json, sır değil). Gövde sunucunun aynı doğrulamasından geçer (kritik tür kapatılamaz 400).
  // Kuyruğa girmez (lib/evYazma ucTanimi). Önizleme (/onizle) yan etkisiz — iletilmez, bu bilgisayarda hesaplanır.
  ['POST', /^\/api\/bildirim\/(ayar|tur|sessiz|uretici|genel|gecici-bitir)$/],   // 74.1: + genel (tutarları gizle), gecici-bitir
  // 73.8 Sorun araçları (lib/sorunAraclari.js): kayıt eşitleme / zarar sınırı / sapma / yatırma kabulü — gövdede PIN + onay + önizleme
  // parmak izi; SUNUCU doğrular (409: durum değişti). Kuyruğa GİRMEZ (lib/evYazma ucTanimi — PIN'li gövde diske yazılmaz).
  ['POST', require('./acilPin').SORUN_ARAC_YOLU]
];
const GELISTIRME_BASLIK = 'x-gelistirme-token';

/**
 * MAKİNE KADEMESİ (75.2, 3. faz parça 3a — TASARIM-MAKINE-HESAP-BOT §4.2, PLAN f5): eşlenmiş başka bir Pusula makinesi
 * `x-pusula-makine: <kimlik>` + `x-pusula-makine-jeton: <jeton>` başlıklarıyla gelir. Jeton, eşlemede BU makinenin ürettiği jetonun
 * <veri>/makine-jetonlari.json'daki SHA-256 özetiyle zaman sabit karşılaştırılır (lib/makine/eslesme.js gelenDogru). Doğruysa
 * `req.kademe = 'makine'` ve YALNIZ aşağıdaki uçlar: sunucu okumaları (lib/evOkuma.js EV_YOLU — geliştirme bilgisayarının sunucudan
 * okuduğu salt okuma listesinin bot/sağlık alt kümesi — aşağıda MAKINE_OKUMA), GET /api/makine/kimlik ve POST /api/makine/nabiz. BOT BAŞLATMA/DURDURMA, EMİR, AYAR, ANAHTAR,
 * GÜNCELLEME VE TAŞIMA UÇLARI LİSTEDE YOK (3a). Başlık VARSA karar burada verilir (yerel bağlantıdan gelse bile yerel kademeye düşmez):
 * kimlik/jeton eksik 401, yanlış 403 (IP başına 10 dk'da 10 yanlış → 429), liste dışı uç 403. Telefon ve geliştirme kademeleri değişmez.
 * 3b'de yeni uç eklenmedi (yönetici kaydı nabız özetinde). 75.5 (3c): YALNIZ bot taşıma protokolünün iki ucu — POST /api/makine/tasima/
 * hazirlik (ön denetim) ve POST /api/makine/tasima/al (paket; hedef doğrular, yerleştirir, botu BAŞLATMAZ). Taşımayı BAŞLATAN uç
 * (POST /api/makine/tasi) yalnız yerel kademe + yerel PIN; bot başlatma/durdurma, emir, ayar, anahtar, güncelleme yine listede YOK.
 * 4. faz (4a): YALNIZ saat başı kopyanın iki SALT OKUMA ucu — GET /api/makine/kopya/manifest ve POST /api/makine/kopya/paket (şifreli).
 */
const MAKINE_BASLIK = 'x-pusula-makine';
const MAKINE_JETON_BASLIK = 'x-pusula-makine-jeton';
/**
 * KARAR (75.2): makine kademesinin okuması EV_YOLU'nun BOT / SAĞLIK alt kümesidir (bot durumu, işlemleri, bot listesi, Kalkan, sağlık,
 * sorunlar, veri kalitesi). Kişisel finans okumaları (Portföyüm, İşlem defterim, model portföyler, günlük, raporlar, hesap dökümleri)
 * makineye AÇIK DEĞİL — o uçların "telefonda tutarları gizle" kuralı yalnız telefon kademesini tanıyor; eş makine onları görmesin.
 * Hem bu desene hem EV_YOLU'na uyan yol geçer (alt küme garantisi).
 */
const MAKINE_OKUMA = /^\/api\/(bindirme(\/|$)|botlar(\/(sablonlar|hesaplar))?$|kalkan\/durum$|exchange\/status$|saglik\/(durum|oz)$|sorunlar$|veri-kalitesi$)/;
const MAKINE_IZINLI = [
  ['GET', { test: (y) => require('./evOkuma').EV_YOLU.test(y) && MAKINE_OKUMA.test(y) }],
  ['GET', /^\/api\/makine\/kimlik$/],
  // B2 (TASARIM-MAKINE-HESAP-BOT §8.1): eşin olay akışı — yalnız o makinenin satırları (tutar yok, sırlar zaten "•••"), salt okuma
  ['GET', /^\/api\/makine\/olaylar$/],
  // 75.9 (3c-2): eşin haftalık karne satırları — yalnız o makinenin botları, yüzde / puan (tutar yok), salt okuma (lib/sunucu/olayUclari.js)
  ['GET', /^\/api\/makine\/karne$/],
  ['POST', /^\/api\/makine\/nabiz$/],
  ['POST', /^\/api\/makine\/tasima\/(hazirlik|al)$/],   // 75.5 (3c) bot taşıma protokolü (lib/makine/botTasima.js)
  ['GET', /^\/api\/makine\/risk$/],   // A3 (TASARIM-MAKINE-HESAP-BOT §6.3): eşin botlarının toplam risk satırları — salt okuma, sır yok
  // 4. faz (4a) saat başı karşılıklı kopya (lib/makine/kopya.js): SALT OKUMA — manifest + istenen dosyaların yedek şifresiyle şifreli
  // paketi (POST yalnız istenen yol listesi uzun olabildiği için; uç hiçbir şey yazmaz). Uç ayrıca yalnız SUNUCU eşine verir.
  ['GET', /^\/api\/makine\/kopya\/manifest$/],
  ['POST', /^\/api\/makine\/kopya\/paket$/]
];
/** Eşleme isteği (lib/makine/api.js): panel jetonu İSTEMEYEN tek yol — tek kullanımlık kodu uç doğrular, IP başına 10 dk'da 5 deneme. */
const ESLE_YOLU = '/api/makine/esle';

/** Saf: makine kademesinde izinli mi (yöntem + O3 izin normali; yüzde kodu, ters eğik çizgi, "..", "//" asla). */
function makineIzinliMi(method, yol) {
  const m = String(method || '').toUpperCase();
  const y = izinYolu(yol);
  if (/%|\\|\/\/|\.\./.test(y)) return false;
  return MAKINE_IZINLI.some(([mm, d]) => mm === m && d.test(y));
}

/** Saf: geliştirme yazma kademesinde izinli mi (yöntem + O3 izin normali; yüzde kodu, "..", "//" asla). */
function gelistirmeIzinliMi(method, yol) {
  const m = String(method || '').toUpperCase();
  const y = izinYolu(yol);
  if (/%|\\|\/\/|\.\./.test(y)) return false;
  return GELISTIRME_YAZMA.some(([gm, d]) => gm === m && d.test(y));
}

/** Geliştirme jetonunun özeti (hex SHA-256). Sunucuda dosyada YALNIZ bu özet durur; jeton bir kez ekrana yazılır. */
function gelistirmeOzeti(jeton) { return crypto.createHash('sha256').update(String(jeton || ''), 'utf8').digest('hex'); }
/** Verilen jeton saklı özete eşit mi (özetler zaman sabit karşılaştırılır). Özet yoksa / jeton kısa ise false. */
function gelistirmeJetonuDogru(verilen, ozet) {
  if (!ozet || !/^[0-9a-f]{64}$/.test(String(ozet)) || typeof verilen !== 'string' || verilen.length < 32 || verilen.length > 256) return false;
  return esitMi(gelistirmeOzeti(verilen), ozet);
}
function gelistirmeJetonYolu(kok) { return yollar.programVeri(kok, 'gelistirme-jeton.json'); }
/** data/gelistirme-jeton.json `ozet`'inin önbellekli okuyucusu (yeni/kapatılan jeton en geç `sureMs` içinde geçerli). */
function gelistirmeOzetOkuyucu(kok, sureMs = 5000) {
  let son = 0, deger = '';
  return () => {
    const t = Date.now();
    if (t - son > sureMs) {
      son = t;
      try { const j = JSON.parse(require('fs').readFileSync(gelistirmeJetonYolu(kok), 'utf8').replace(/^﻿/, '')); deger = /^[0-9a-f]{64}$/.test(String(j.ozet || '')) ? j.ozet : ''; } catch { deger = ''; }
    }
    return deger;
  };
}

/**
 * Araştırma modunda (ve salt okunur telefon köprüsünde) kapalı POST uçları: botu başlatan,
 * borsaya bağlanan ya da emir veren her şey (paper motoru start/stop/bots, borsa, kalkan,
 * bindirme, pozisyon kapatma, hesap senkronu, Telegram ve healthchecks testleri) + 61.3 güncelleme kurma ve sunucuyu
 * yeniden başlatma (/api/guncelleme, /api/sistem).
 */
const BOT_EMIR_UCLARI = /^\/api\/(exchange|kalkan|bindirme|botlar|bots|start|stop|position|hesap-islemleri|telegram|saglik|guncelleme|sistem)(\/|$)/;

/**
 * ARAŞTIRMA MODUNDA AYAR YAZMA (panel denetimi A-02, 2026-10-11). Araştırma modunda sunucu bellekte
 * `telegram.enabled=false` yapar; Ayarlar ekranından bir kayıt bu değeri config.json'a kalıcı yazarsa ve config
 * sunucuya taşınırsa Telegram sessizce kapanırdı. Bu yüzden araştırma modunda Ayarlar ekranının yazdığı
 * her şey 403: sırlar (API anahtarları, healthchecks), izleme listesi ekle/çıkar ve `/api/config`'e gelen
 * Telegram / piyasa verisi / izleme listesi alanları. (Araştırma araçlarının ayarları — kâğıt test riski,
 * strateji parametreleri, gösterge düzeni — açık kalır; onların kaydında da Telegram açık/kapalı diskteki
 * değerle yazılır: `arastirmaKayitDuzelt`.)
 */
const ARASTIRMA_AYAR_UCLARI = /^\/api\/(secrets|watchlist\/(add|remove))\/?$/;
const ARASTIRMA_AYAR_ALANLARI = ['telegram', 'exchange', 'marketType', 'leverage', 'watchlist'];
const ARASTIRMA_AYAR_MESAJI = 'Araştırma modu: bu bilgisayarda ayarlar kaydedilmez (Telegram, piyasa verisi, izleme listesi, API anahtarları ve sağlık sinyali sunucudaki panelden değiştirilir).';

/** Saf: Telegram chat id'yi maskeler ("123456789" → "12•••••89"); boşsa ''. Karar Ö18 (panelde maskeli). */
function chatIdMaskele(c) {
  const s = String(c == null ? '' : c).trim();
  if (!s) return '';
  if (s.length <= 4) return '•'.repeat(s.length);
  return `${s.slice(0, 2)}${'•'.repeat(s.length - 4)}${s.slice(-2)}`;
}
/** Saf: panelden gelen Telegram yamasında maskeli ya da boş chat id YAZILMAZ (kayıtlı değer korunur). */
function chatIdYamaTemizle(tg) {
  if (!tg || typeof tg !== 'object') return tg;
  const out = { ...tg };
  if ('chatId' in out && (typeof out.chatId !== 'string' || !out.chatId.trim() || out.chatId.includes('•'))) delete out.chatId;
  else if ('chatId' in out) out.chatId = out.chatId.trim();
  return out;
}

/**
 * Panelden (`POST /api/config`) yazılamayan üst düzey config alanları (denetim 61.1 O1). `canliIzin` gerçek para
 * kapısıdır (Ö16); `canli` ve `kalkan` canlı/kalkan emir ve sermaye tavanlarıdır — üçü de yalnız config.json elle
 * düzenlenerek açılır/değişir. `__proto__`/`constructor`/`prototype`: derin birleştirmede prototip kirlenmesi.
 */
const PROTOTIP_ALANLARI = ['__proto__', 'constructor', 'prototype'];
const PANELDEN_YAZILMAZ = ['canliIzin', 'canli', 'kalkan', 'toplamRisk', ...PROTOTIP_ALANLARI];   // A3: toplam risk kipi/sınırları yalnız kendi uçlarından (14 gün + PIN + onay)

/** Saf: nesne/dizi kopyası, her derinlikte `__proto__`/`constructor`/`prototype` anahtarları atılmış. */
function prototipsiz(v, derinlik = 0) {
  if (!v || typeof v !== 'object' || derinlik > 20) return v;
  if (Array.isArray(v)) return v.map(x => prototipsiz(x, derinlik + 1));
  const out = {};
  for (const [k, x] of Object.entries(v)) if (!PROTOTIP_ALANLARI.includes(k)) out[k] = prototipsiz(x, derinlik + 1);
  return out;
}

/**
 * Saf (denetim 61.1 O3): YASAK listeleri için yol normali. Express yönlendirmesi harf duyarsız ve sondaki eğik
 * çizgiyi yok sayar; "/API/EXCHANGE/CONNECT" ya da "/api/exchange/connect/" yasağı delmesin diye denetim bu
 * biçim üzerinden yapılır: sorgu atılır, yüzde kodları çözülür (%2F → /), ters eğik çizgi → /, ardışık eğik
 * çizgiler teke iner, sondaki eğik çizgi atılır, küçük harf. Daha GENİŞ eşleşir — yasak için güvenli yön.
 */
function yasakYolu(yol) {
  let y = String(yol == null ? '' : yol).split('?')[0];
  for (let i = 0; i < 3; i++) {
    let c;
    try { c = decodeURIComponent(y); } catch { break; }
    if (c === y) break;
    y = c;
  }
  y = y.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
  if (y.length > 1) y = y.replace(/\/+$/, '');
  return y || '/';
}

/**
 * Saf (O3): İZİN listeleri (telefon beyaz listesi) için yol normali — yalnız Express'in de eşit saydığı farklar:
 * küçük harf + sondaki TEK eğik çizgi. Yüzde kodu çözülmez, çift eğik çizgi birleştirilmez (Express onları aynı
 * yola yönlendirmez; izin listesinde genişlemek güvensiz yön olurdu).
 */
function izinYolu(yol) {
  let y = String(yol == null ? '' : yol).split('?')[0].toLowerCase();
  if (y.length > 1 && y.endsWith('/')) y = y.slice(0, -1);
  return y;
}

/** Saf: araştırma modunda bot/borsa/emir POST'u mu (server.js ARASTIRMA_KAPALI = BOT_EMIR_UCLARI; O3 normaliyle). */
function botEmirYoluMu(yol) {
  return BOT_EMIR_UCLARI.test(yasakYolu(yol));
}

/** Saf: araştırma modunda bu istek ayar yazıyorsa ret mesajı, değilse null. */
function arastirmaAyarRed(method, yol, govde) {
  const m = String(method || '').toUpperCase();
  if (OKUMA_YONTEMLERI.has(m)) return null;
  const y = yasakYolu(yol);
  if (ARASTIRMA_AYAR_UCLARI.test(y)) return ARASTIRMA_AYAR_MESAJI;
  if (/^\/api\/config\/?$/.test(y) && govde && typeof govde === 'object' && ARASTIRMA_AYAR_ALANLARI.some(k => k in govde)) return ARASTIRMA_AYAR_MESAJI;
  return null;
}

/**
 * Saf: araştırma modunda diske yazılacak config'teki `telegram.enabled`'ı DİSKTEKİ değere geri koyar
 * (bellekteki kapalılık asla kalıcı yazılmaz). `diskteki` okunamadıysa alan hiç değiştirilmez.
 */
function arastirmaKayitDuzelt(yazilacak, diskteki) {
  if (!yazilacak || !yazilacak.telegram || !diskteki || typeof diskteki !== 'object') return yazilacak;
  const dt = diskteki.telegram;
  const out = { ...yazilacak, telegram: { ...yazilacak.telegram } };
  if (dt && typeof dt === 'object' && 'enabled' in dt) out.telegram.enabled = dt.enabled;
  else delete out.telegram.enabled;
  return out;
}

/** Sırların config'ten çıkarılmış kopyası + "tanımlı mı" bilgisi. */
function disariVer(cfg, sirAnahtarlari) {
  const kopya = { ...cfg };
  const tanimli = {};
  for (const k of sirAnahtarlari) {
    tanimli[k] = typeof kopya[k] === 'string' && kopya[k].length > 0;
    delete kopya[k];
  }
  kopya.sirlar = tanimli;
  return kopya;
}

/**
 * Panelden gelen config yaması sırlara dokunamaz. Panel config'i GET ile
 * sırsız alıp geri POST ettiğinde boş alanlar bellekteki anahtarı silerdi.
 * Sırlar yalnız `/api/secrets` ile yazılır.
 */
/** Boş jeton = "değişmedi" (geçerli); dolu jeton BotFather biçiminde olmalı (rakamlar:harf-rakam, en az 20 karakter). */
function telegramJetonGecerli(j) {
  const t = j == null ? '' : String(j).trim();
  return t === '' || /^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(t);
}

function yamaTemizle(yama, sirAnahtarlari) {
  if (!yama || typeof yama !== 'object') return yama;
  const temiz = { ...yama };
  for (const k of sirAnahtarlari) delete temiz[k];
  delete temiz.sirlar;
  // Denetim 61.1 O1: gerçek para izni ve canlı/kalkan risk tavanları panel API'sinden YAZILMAZ — yalnız config.json
  // elle düzenlenerek değişir (Ö16). Prototip alanları her derinlikte düşer (derin birleştirmede kirlenme).
  for (const k of PANELDEN_YAZILMAZ) delete temiz[k];
  // C1 denetim #5: portföy botunun modu (gerçek paraya geçiş yalnız /api/bindirme/:ad/mod + "GERÇEK PARA") ve canlı sermaye tavanı
  // (G9 — yalnız config.json elle) panel ayar yamasıyla değişmez. 68.8: botun sağlık ping adresi (sır) de — yalnız /api/secrets botSaglik.
  if (temiz.bindirme && typeof temiz.bindirme === 'object') {
    temiz.bindirme = { ...temiz.bindirme };
    for (const [ad, v] of Object.entries(temiz.bindirme)) {
      if (v && typeof v === 'object') { const x = { ...v }; delete x.mod; delete x.canliSermayeTavani; delete x.healthchecksUrl; temiz.bindirme[ad] = x; }
    }
  }
  for (const [k, v] of Object.entries(temiz)) if (v && typeof v === 'object') temiz[k] = prototipsiz(v);
  // Panel token'ı hiç görmez; boş gönderilen alan "değişmedi" demektir.
  if (temiz.telegram && typeof temiz.telegram === 'object' && !temiz.telegram.botToken) {
    temiz.telegram = { ...temiz.telegram };
    delete temiz.telegram.botToken;
  }
  return temiz;
}

function geriDonusMu(host) {
  return GERI_DONUS.has(String(host || '').replace(/^\[|\]$/g, ''));
}

/** 69.6 `Host` başlığından port ("localhost:3000" → "3000", "[::1]:3000" → "3000", port yoksa ''). */
function hostPortu(baslik) {
  const h = String(baslik || '').trim().toLowerCase();
  const m = h.startsWith('[') ? /^\[[^\]]*\](?::(\d+))?$/.exec(h) : /^[^:]*(?::(\d+))?$/.exec(h);
  return m && m[1] ? m[1] : '';
}

/**
 * 69.6 Saf: Origin, isteğin Host'uyla aynı köken mi (ad aynı; Host'ta port varsa Origin'in etkin portu da aynı).
 * Tarayıcı Origin'i sayfanın adresinden, Host'u istek adresinden yazar — kendi sayfamızın isteğinde ikisi hep aynıdır.
 */
function ayniKokenMi(host, origin) {
  let o;
  try { o = new URL(origin); } catch { return false; }
  const oAd = o.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (oAd !== hostAdi(host)) return false;
  const hp = hostPortu(host);
  const op = o.port || (o.protocol === 'https:' ? '443' : o.protocol === 'http:' ? '80' : '');
  return !hp || hp === op;
}

/** `Host` başlığından ad kısmı ("localhost:3000" → "localhost", "[::1]:3000" → "::1"). */
function hostAdi(baslik) {
  const h = String(baslik || '').trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(1, h.indexOf(']'));
  return h.split(':')[0];
}

/** `Cookie` başlığından tek çerez (yoksa ''). */
function cerezOku(baslik, ad) {
  for (const parca of String(baslik || '').split(';')) {
    const i = parca.indexOf('=');
    if (i < 0) continue;
    if (parca.slice(0, i).trim() === ad) {
      try { return decodeURIComponent(parca.slice(i + 1).trim()); } catch { return ''; }
    }
  }
  return '';
}

/**
 * Jetondan türetilen oturum değeri — çerez jetonun kendisini taşımaz. D4 (62.2): değer ZAMAN DAMGALI
 * (`<sn>.<HMAC(jeton, "pusula-oturum-v2|<sn>")>`): sunucu süreyi kendisi denetler (OTURUM_SURE_SN); kopyalanan çerez
 * jeton yenilenmese de 30 gün sonra geçersiz. Eski (v1, damgasız) çerezler geçersizdir — telefonda bir kez yeniden giriş.
 */
function oturumDegeri(jeton, zamanSn = Math.floor(Date.now() / 1000)) {
  const z = Math.floor(+zamanSn);
  return `${z}.${crypto.createHmac('sha256', String(jeton)).update(`pusula-oturum-v2|${z}`).digest('hex')}`;
}

/** D4: çerez imzası doğru VE süresi dolmamış mı (gelecekten en çok 5 dk saat farkı). */
function oturumGecerli(verilen, jeton, simdiMs = Date.now()) {
  const m = /^(\d{9,11})\.([0-9a-f]{64})$/.exec(String(verilen || ''));
  if (!m || !jeton) return false;
  const z = +m[1], simdiSn = Math.floor(simdiMs / 1000);
  if (z > simdiSn + 300 || simdiSn - z > OTURUM_SURE_SN) return false;
  return esitMi(verilen, oturumDegeri(jeton, z));
}

function esitMi(verilen, beklenen) {
  const a = Buffer.from(String(verilen || ''));
  const b = Buffer.from(String(beklenen));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Kendi içinde giriş sayfası: dış dosya yok (jetonsuz istekte CSS/JS de 403 alır). */
function girisSayfasi() {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<link rel="icon" href="data:,">
<title>Pusula · giriş</title>
<style>
:root{--zemin:#F5F3EE;--yuzey:#FFFFFF;--kenar:#E2DED5;--metin:#1B2430;--ikincil:#5E6673;--vurgu:#1F6F63;--dugme-metin:#FFFFFF;--negatif:#B4432F}
@media (prefers-color-scheme:dark){:root{--zemin:#12171D;--yuzey:#1B2229;--kenar:#2E3741;--metin:#E8E6E1;--ikincil:#A9B0BA;--vurgu:#4FB3A3;--dugme-metin:#0B1512;--negatif:#F08A75}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--zemin);color:var(--metin);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{width:100%;max-width:420px;background:var(--yuzey);border:1px solid var(--kenar);border-radius:12px;padding:24px}
h1{margin:0 0 8px;font-size:22px}
p{margin:0 0 16px;color:var(--ikincil)}
label{display:block;font-weight:600;margin-bottom:6px}
input{width:100%;min-height:44px;padding:10px 12px;font-size:16px;border:1px solid var(--kenar);border-radius:8px;background:var(--zemin);color:var(--metin)}
button{width:100%;min-height:48px;margin-top:12px;font-size:16px;font-weight:600;border:0;border-radius:8px;background:var(--vurgu);color:var(--dugme-metin);cursor:pointer}
#durum{min-height:24px;margin:12px 0 0;color:var(--negatif)}
</style></head>
<body><main>
<h1>Pusula</h1>
<p>Bu panel yerel ağa açık; girmek için panel jetonu gerekiyor. Jeton, sunucuyu başlattığınız bilgisayarın
terminalinde yazıyor (karekod ya da <code>#jeton=</code> ile biten adres).</p>
<form id="f" autocomplete="off">
<label for="j">Panel jetonu</label>
<input id="j" name="j" type="password" autocapitalize="off" spellcheck="false" required>
<button type="submit">Giriş</button>
</form>
<p id="durum" role="alert"></p>
</main>
<script>
(function(){
  var durum=document.getElementById('durum');
  function gonder(j){
    durum.textContent='';
    fetch('${GIRIS_YOLU}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jeton:j}),credentials:'same-origin'})
      .then(function(r){return r.json().then(function(v){return {ok:r.ok,v:v};});})
      .then(function(s){ if(s.ok&&s.v.success){location.replace('/');} else {durum.textContent=(s.v&&s.v.error)||'Jeton kabul edilmedi.';} })
      .catch(function(){durum.textContent='Sunucuya ulaşılamadı.';});
  }
  // Karekod adresi: parça (#jeton=…) sunucuya gitmez; okunur, adresten HEMEN silinir, giriş ucuna gider.
  // Giriş sayfası açıkken adres yalnız parçası değişerek açılırsa (sayfa yeniden yüklenmez) hashchange.
  function parcadan(){
    var m=location.hash.match(/(?:^#|&)jeton=([^&]+)/);
    if(!m) return;
    try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
    var j; try{j=decodeURIComponent(m[1]);}catch(e){j=m[1];}
    gonder(j);
  }
  parcadan();
  window.addEventListener('hashchange',parcadan);
  document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();gonder(document.getElementById('j').value.trim());});
})();
</script>
</body></html>`;
}

/**
 * @param {object} ayar
 *   dinlenen       sunucunun bağlandığı adres
 *   izinliHostlar  ek izinli host adları (VPS alan adı vb.); "*.alan" son ek kalıbı da olur
 *   jeton          panel jetonu; dinlenen geri dönüş değilse zorunlu
 *   jetonOku       () → güncel jeton (yerel dinlemede telefon kademesi için; jetonOkuyucu ile dosyadan, önbellekli)
 *   gelistirmeOzetOku () → 64.8 geliştirme yazma jetonunun SHA-256 özeti (gelistirmeOzetOkuyucu; yoksa '')
 *   gelistirmeKapali  true → bu bilgisayar araştırma modunda: x-gelistirme-token taşıyan her istek 403
 *   makineDogrula  (kimlik, jeton) → bool — 75.2 makine kademesi (lib/makine/eslesme gelenDogru); yoksa makine başlıklı her istek 403
 */
function kur(ayar = {}) {
  const dinlenen = ayar.dinlenen || '127.0.0.1';
  const yerel = geriDonusMu(dinlenen);
  const sabitJeton = ayar.jeton || '';
  if (!yerel && sabitJeton.length < 24) {
    throw new Error(`Sunucu ${dinlenen} adresine açılıyor ama panel jetonu yok/kısa — `
      + 'data/secrets.json içine panelToken (≥24 karakter) yazın ya da HOST=127.0.0.1 kullanın.');
  }
  const ekHostlar = (ayar.izinliHostlar || []).map(s => s.toLowerCase());
  const izinli = new Set([...GERI_DONUS, ...ekHostlar.filter(h => !h.startsWith('*.'))]);
  const sonEkler = [...IZINLI_SON_EKLER, ...ekHostlar.filter(h => h.startsWith('*.')).map(h => h.slice(1))];
  if (!yerel) izinli.add(hostAdi(dinlenen));
  const hostIzinli = (h) => izinli.has(h) || sonEkler.some(e => h.length > e.length && h.endsWith(e));

  /** Güncel jeton: ağa açık dinlemede sabit; yerel dinlemede (Tailscale serve arkası) dosyadan okunur. */
  const guncelJeton = () => {
    if (sabitJeton) return sabitJeton;
    try { const j = typeof ayar.jetonOku === 'function' ? ayar.jetonOku() : ''; return typeof j === 'string' && j.length >= 24 ? j : ''; }
    catch { return ''; }
  };
  const jetonDogru = (verilen) => { const j = guncelJeton(); return !!j && !!verilen && esitMi(verilen, j); };
  const oturumDogru = (verilen) => { const j = guncelJeton(); return !!j && !!verilen && oturumGecerli(verilen, j); };

  /**
   * KADEME (60.5): "yerel" (bu bilgisayardaki masaüstü panel — tam yetki) ya da "telefon" (izleme + acil durdurma).
   * Yerel ancak: sunucu yerel dinliyor VE Host geri dönüş adı VE bağlantı geri dönüş adresinden VE vekil (proxy)
   * başlığı YOK. `tailscale serve` ve telefon köprüsü isteği 127.0.0.1'den iletir ama X-Forwarded-For /
   * Tailscale-User-* ekler → telefon. Ağa açık dinlemede (köprü, VPS) her istek telefon kademesidir.
   */
  function kademe(req) {
    if (!yerel || !req || !req.headers) return 'telefon';
    if (!GERI_DONUS.has(hostAdi(req.headers.host))) return 'telefon';
    const uzak = req.socket && req.socket.remoteAddress;
    if (uzak && !geriDonusAdresiMi(uzak)) return 'telefon';
    if (VEKIL_BASLIKLARI.some(b => req.headers[b] !== undefined)) return 'telefon';
    // 69.6: başka kökenden (Origin ≠ Host) ya da başka siteden tetiklenmiş yazma isteği masaüstü panel değildir.
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && !ayniKokenMi(req.headers.host, origin)) return 'telefon';
    const sfs = req.headers['sec-fetch-site'];
    if (sfs !== undefined && !OKUMA_YONTEMLERI.has(String(req.method || 'GET').toUpperCase()) && !AYNI_SITE.has(String(sfs).toLowerCase())) return 'telefon';
    return 'yerel';
  }

  /** Host + Origin (jetondan bağımsız). @returns {string|null} red sebebi */
  function kokenDenetle({ host, origin, method }) {
    if (!hostIzinli(hostAdi(host))) return `host reddedildi: ${host}`;
    // Origin varsa aynı izinli host'tan gelmeli. Tarayıcı dışı istemciler
    // (curl, betik) Origin göndermez; onlar yerel dinlemede serbest.
    if (origin && origin !== 'null') {
      let o;
      try { o = new URL(origin); } catch { return `origin bozuk: ${origin}`; }
      if (!hostIzinli(o.hostname.replace(/^\[|\]$/g, '').toLowerCase())) return `origin reddedildi: ${origin}`;
      if (!ayniKokenMi(host, origin)) return `origin reddedildi (başka köken): ${origin}`;
    } else if (origin === 'null' && method && method !== 'GET' && method !== 'HEAD') {
      return 'origin null (sandbox/dosya) — durum değiştiren istek reddedildi';
    }
    return null;
  }

  /**
   * Tek karar noktası — HTTP ve WebSocket aynı kuralı kullanır.
   * Jeton `x-panel-token` başlığından (betik/curl) YA DA oturum çerezinden (tarayıcı).
   * `telefon: true` → yerel dinlemede de jeton zorunlu (vekil arkası istek).
   * @returns {string|null} red sebebi, ya da null (geçer)
   */
  function denetle({ host, origin, method, verilenJeton, verilenOturum, telefon }) {
    const koken = kokenDenetle({ host, origin, method });
    if (koken) return koken;
    if ((!yerel || telefon) && !jetonDogru(verilenJeton) && !oturumDogru(verilenOturum)) {
      return guncelJeton() ? 'panel jetonu eksik/yanlış' : 'panel jetonu tanımlı değil (sunucuda: npm run telefon-jeton)';
    }
    return null;
  }

  /* ── Giriş ucu ─────────────────────────────────────────────────────────── */
  const yanlislar = new Map();   // ip → [zaman damgaları]
  function yanlisSay(ip) {
    const simdi = Date.now();
    const l = (yanlislar.get(ip) || []).filter(t => simdi - t < GIRIS_PENCERE_MS);
    if (yanlislar.size > 1000) yanlislar.clear();   // bellek tavanı
    yanlislar.set(ip, l);
    return l;
  }

  function jsonYaz(res, durum, govde, ekBaslik) {
    res.statusCode = durum;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (ekBaslik) for (const [k, v] of Object.entries(ekBaslik)) res.setHeader(k, v);
    res.end(JSON.stringify(govde));
  }

  function girisIsle(req, res) {
    // Vekil arkasında bağlantı hep 127.0.0.1: sayaç vekilin bildirdiği istemci adresine göre.
    const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '?').split(',')[0].trim();
    if (yanlisSay(ip).length >= GIRIS_HAK) {
      return jsonYaz(res, 429, { success: false, error: 'Çok fazla yanlış deneme — 10 dakika sonra yeniden deneyin.' });
    }
    let govde = '';
    let asti = false;
    req.setEncoding('utf8');
    req.on('data', (p) => {
      if (asti) return;
      govde += p;
      if (govde.length > 2048) { asti = true; jsonYaz(res, 413, { success: false, error: 'İstek çok büyük.' }); }
    });
    req.on('end', () => {
      if (asti) return;
      let verilen = '';
      try { verilen = String((JSON.parse(govde || '{}') || {}).jeton || ''); } catch { /* boş */ }
      const j = guncelJeton();
      if (!j || !esitMi(verilen, j)) {
        yanlisSay(ip).push(Date.now());
        return jsonYaz(res, 403, { success: false, error: 'Jeton yanlış.' });
      }
      yanlislar.delete(ip);
      const guvenli = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' ? '; Secure' : '';
      jsonYaz(res, 200, { success: true }, {
        'Set-Cookie': `${OTURUM_CEREZI}=${oturumDegeri(j)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${OTURUM_SURE_SN}${guvenli}`
      });
    });
  }

  /** Jetonsuz isteğe giriş sayfası mı (tarayıcı gezinmesi), JSON 403 mü? */
  /* ── 75.2 Makine kademesi ─────────────────────────────────────────────── */
  const makineYanlislar = new Map();   // ip → [zaman damgaları]
  function makineYanlisSay(ip) {
    const simdi = Date.now();
    const l = (makineYanlislar.get(ip) || []).filter(t => simdi - t < GIRIS_PENCERE_MS);
    if (makineYanlislar.size > 1000) makineYanlislar.clear();
    makineYanlislar.set(ip, l);
    return l;
  }
  function makineIsle(req, res, next) {
    const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '?').split(',')[0].trim();
    if (makineYanlisSay(ip).length >= GIRIS_HAK) return jsonYaz(res, 429, { success: false, kademe: 'makine', error: 'Çok fazla yanlış makine jetonu — 10 dakika sonra yeniden deneyin.' });
    const kimlik = String(req.headers[MAKINE_BASLIK] || '');
    const jeton = req.headers[MAKINE_JETON_BASLIK];
    if (!kimlik || typeof jeton !== 'string' || !jeton) return jsonYaz(res, 401, { success: false, kademe: 'makine', error: 'Makine kimliği ya da jetonu eksik.' });
    let dogru = false;
    try { dogru = typeof ayar.makineDogrula === 'function' && ayar.makineDogrula(kimlik, jeton) === true; } catch { dogru = false; }
    if (!dogru) {
      makineYanlisSay(ip).push(Date.now());
      return jsonYaz(res, 403, { success: false, kademe: 'makine', error: 'Makine jetonu yanlış ya da bu makine eşlenmemiş (Ayarlar › Makineler\'den yeniden eşleyin).' });
    }
    let yol = '/';
    try { yol = new URL(req.url, 'http://x').pathname; } catch { /* kök */ }
    const ham = hamYol(req.url);
    if (hamYolSupheli(ham, yol)) return jsonYaz(res, 403, { success: false, kademe: 'makine', error: 'Erişim reddedildi (yol biçimi geçersiz: ters eğik çizgi, "..", "//" ya da yüzde kodu)' });
    if (!makineIzinliMi(req.method, ham)) {
      return jsonYaz(res, 403, { success: false, kademe: 'makine', error: `Başka makineden yalnız durum okuma ve nabız kabul edilir — bu işlem (${req.method} ${yol}) o bilgisayarın kendi panelinden yapılır.` });
    }
    makineYanlislar.delete(ip);
    req.kademe = 'makine';
    req.makineKimlik = kimlik;
    return next();
  }

  function sayfaIstegiMi(req, yol) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    if (yol.startsWith('/api/')) return false;
    if (yol === '/' || /\.html?$/i.test(yol)) return true;
    return /text\/html/.test(String(req.headers.accept || '')) && !/\.[a-z0-9]+$/i.test(yol);
  }

  /**
   * Express ara katmanı — ham Node `req/res` ile de çalışır (telefon köprüsü).
   * `req.kademe` = 'yerel' | 'telefon' yazar (server.js acil PIN kapısı ve /api/health okur).
   * Telefon kademesi: jeton/çerez zorunlu; GET/HEAD/OPTIONS serbest; yazma YALNIZ acil uçları (+ giriş ucu).
   */
  function middleware(req, res, next) {
    for (const [k, v] of Object.entries(GUVENLIK_BASLIKLARI)) res.setHeader(k, v);   // 69.6
    const koken = kokenDenetle({ host: req.headers.host, origin: req.headers.origin, method: req.method });
    if (koken) return jsonYaz(res, 403, { success: false, error: `Erişim reddedildi (${koken})` });
    // 75.2: makine jetonu başlığı VARSA karar makine kademesinde verilir (yerel bağlantıdan gelse de yerel tam yetkiye düşmez).
    if (req.headers[MAKINE_JETON_BASLIK] !== undefined) return makineIsle(req, res, next);
    const kd = kademe(req);
    req.kademe = kd;
    if (kd === 'yerel') return next();
    let yol = '/';
    try { yol = new URL(req.url, 'http://x').pathname; } catch { /* kök */ }
    // 75.2: kodlu eşleme isteği panel jetonu istemez (karşı makinede bu panelin jetonu yok) — yalnız bu TEK yol, yalnız POST, ham yol
    // birebir; kodu ve deneme sınırını lib/makine/api.js denetler. Geri kalan her şey aşağıdaki kurallarla aynı.
    if (req.method === 'POST' && yol === ESLE_YOLU && hamYol(req.url) === ESLE_YOLU) return next();
    if (!guncelJeton()) {
      return jsonYaz(res, 403, { success: false, error: 'Telefondan erişim kapalı: panel jetonu tanımlı değil. Sunucuda: npm run telefon-jeton' });
    }
    if (yol === GIRIS_YOLU && req.method === 'POST') return girisIsle(req, res);
    if (!jetonDogru(req.headers['x-panel-token']) && !oturumDogru(cerezOku(req.headers.cookie, OTURUM_CEREZI))) {
      if (sayfaIstegiMi(req, yol)) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.end(req.method === 'HEAD' ? '' : girisSayfasi());
      }
      return jsonYaz(res, 403, { success: false, error: 'Erişim reddedildi (panel jetonu eksik/yanlış)' });
    }
    // 64.8 geliştirme yazma kademesi: başlık VARSA karar burada verilir (yanlış jeton / liste dışı uç → 403; telefon yoluna düşmez).
    // Denetim 64.8 F1: Express HAM yol üzerinden yönlendirir; beyaz liste de ham yola uygulanır. Ham yol normalleşmişinden farklıysa
    // (ters eğik çizgi, "..", "//", yüzde kodu) yazma isteği reddedilir — "/api/bindirme/x\..\..\islem-defteri\hesap/baslat" deliği.
    const ham = hamYol(req.url);
    const supheli = hamYolSupheli(ham, yol);
    if (req.headers[GELISTIRME_BASLIK] !== undefined) {
      if (supheli) return jsonYaz(res, 403, { success: false, kademe: 'gelistirme', error: 'Erişim reddedildi (yol biçimi geçersiz: ters eğik çizgi, "..", "//" ya da yüzde kodu)' });
      if (ayar.gelistirmeKapali) {
        return jsonYaz(res, 403, { success: false, kademe: 'gelistirme', error: 'Bu bilgisayar araştırma modunda — geliştirme bilgisayarından gelen yazma kabul edilmez (yazma jetonu yalnız sunucuda geçerli).' });
      }
      let ozet = '';
      try { ozet = typeof ayar.gelistirmeOzetOku === 'function' ? ayar.gelistirmeOzetOku() : ''; } catch { ozet = ''; }
      if (!gelistirmeJetonuDogru(req.headers[GELISTIRME_BASLIK], ozet)) {
        return jsonYaz(res, 403, { success: false, kademe: 'gelistirme', error: ozet ? 'Geliştirme yazma jetonu yanlış (sunucuda `npm run gelistirme-jeton -- --yeni` ile yenilendiyse bu bilgisayarda da yeniden kaydedin).' : 'Geliştirme yazma jetonu sunucuda tanımlı değil (sunucuda: npm run gelistirme-jeton).' });
      }
      if (!gelistirmeIzinliMi(req.method, ham)) {
        return jsonYaz(res, 403, { success: false, kademe: 'gelistirme', error: `Geliştirme bilgisayarından yalnız İşlem defterim, Portföyüm, anahtar, model sermayesi ve bildirim ayarları yazılır — bu işlem (${req.method} ${yol}) sunucudaki panelden yapılır.` });
      }
      req.kademe = 'gelistirme';
      return next();
    }
    if (!OKUMA_YONTEMLERI.has(String(req.method || '').toUpperCase()) && supheli) {
      return jsonYaz(res, 403, { success: false, kademe: 'telefon', error: 'Erişim reddedildi (yol biçimi geçersiz: ters eğik çizgi, "..", "//" ya da yüzde kodu)' });
    }
    if (!telefonIzinliMi(req.method, ham)) {
      return jsonYaz(res, 403, { success: false, kademe: 'telefon',
        error: `Telefondan yalnız izleme, acil durdurma ve güncelleme yapılır — bu işlem (${req.method} ${yol}) sunucudaki panelden yapılır.` });
    }
    next();
  }

  /** `ws` kütüphanesinin `verifyClient` imzası. Jeton sorgu parametresinden ya da oturum çerezinden. */
  function wsDogrula(bilgi) {
    let verilenJeton = '';
    try { verilenJeton = new URL(bilgi.req.url, 'http://x').searchParams.get('token') || ''; } catch { /* boş */ }
    // Telefon köprüsü arka sunucuya jetonu başlıkla iletir (kullanıcının çerezi arkaya gitmez).
    if (!verilenJeton) verilenJeton = String(bilgi.req.headers['x-panel-token'] || '');
    return !denetle({
      host: bilgi.req.headers.host, origin: bilgi.origin, method: 'GET', verilenJeton,
      verilenOturum: cerezOku(bilgi.req.headers.cookie, OTURUM_CEREZI),
      telefon: kademe(bilgi.req) === 'telefon'
    });
  }

  return { denetle, kokenDenetle, middleware, wsDogrula, kademe, yerel, dinlenen, jetonVar: () => !!guncelJeton() };
}

/** Saf (F1): isteğin HAM yolu (sorgu atılmış; Express bu yolla yönlendirir). */
function hamYol(url) { return String(url == null ? '' : url).split('?')[0].split('#')[0]; }
/** Saf (F1): ham yol normalleşmişinden farklı ya da ters eğik çizgi / yüzde kodu / nokta bölümü / çift eğik çizgi içeriyor mu. */
function hamYolSupheli(ham, normal) {
  return ham !== normal || /[\\%]|\/\.\.?(\/|$)|\/\//.test(ham);
}

/** Telefon kademesinde izinli mi: okuma serbest; yazma yalnız acil durdurma uçları. */
function telefonIzinliMi(method, yol) {
  const m = String(method || '').toUpperCase();
  if (OKUMA_YONTEMLERI.has(m)) return true;
  // O3: Express harf duyarsız + sondaki / serbest; beyaz liste aynı normalle (acilPin kapısı da: PIN atlanmasın).
  return m === 'POST' && TELEFON_YAZMA.test(izinYolu(yol));
}

function geriDonusAdresiMi(adres) {
  const a = String(adres || '').replace(/^::ffff:/i, '');
  return a === '::1' || /^127\./.test(a);
}

/**
 * Panel jetonu kaynakları (sunucu ve telefon betikleri AYNI sırayı kullanır): PANEL_TOKEN ortam değişkeni →
 * data/secrets.json `panelToken` → data/telefon-jeton.json `jeton`. Bulamazsa null (üretmez).
 */
function jetonBul(kok, env = process.env) {
  const fs = require('fs');
  const path = require('path');
  const oku = (d) => { try { return JSON.parse(fs.readFileSync(d, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
  if ((env.PANEL_TOKEN || '').length >= 24) return { jeton: env.PANEL_TOKEN, kaynak: 'PANEL_TOKEN ortam değişkeni' };
  const sir = require('./sirKasasi').okuGuvenli(yollar.programVeri(kok, 'secrets.json'), null);   // 69.4 DPAPI
  if (sir && typeof sir.panelToken === 'string' && sir.panelToken.length >= 24) return { jeton: sir.panelToken, kaynak: 'data/secrets.json (panelToken)' };
  const k = require('./sirKasasi').okuGuvenli(yollar.programVeri(kok, 'telefon-jeton.json'), null);   // 69.6 sır kasası
  if (k && typeof k.jeton === 'string' && k.jeton.length >= 24) return { jeton: k.jeton, kaynak: 'data/telefon-jeton.json' };
  return null;
}

/** jetonBul'un önbellekli okuyucusu — her istekte dosya okunmasın; yeni jeton en geç `sureMs` içinde geçerli olur. */
function jetonOkuyucu(kok, env = process.env, sureMs = 5000) {
  let son = 0, deger = '';
  return () => {
    const t = Date.now();
    if (t - son > sureMs) { son = t; const b = jetonBul(kok, env); deger = b ? b.jeton : ''; }
    return deger;
  };
}

function yeniJeton() { return crypto.randomBytes(24).toString('hex'); }

module.exports = {
  kur, disariVer, yamaTemizle, telegramJetonGecerli, geriDonusMu, geriDonusAdresiMi, hostAdi, yeniJeton, cerezOku, oturumDegeri, oturumGecerli, OTURUM_SURE_SN, girisSayfasi,
  telefonIzinliMi, yasakYolu, izinYolu, hamYol, hamYolSupheli, gelistirmeIzinliMi, gelistirmeOzeti, gelistirmeJetonuDogru, gelistirmeJetonYolu, gelistirmeOzetOkuyucu, GELISTIRME_YAZMA, GELISTIRME_BASLIK, botEmirYoluMu, prototipsiz, PANELDEN_YAZILMAZ, jetonBul, jetonOkuyucu, arastirmaAyarRed, arastirmaKayitDuzelt, chatIdMaskele, chatIdYamaTemizle,
  ARASTIRMA_AYAR_UCLARI, ARASTIRMA_AYAR_ALANLARI, OTURUM_CEREZI, GIRIS_YOLU, BOT_EMIR_UCLARI, VEKIL_BASLIKLARI, IZINLI_SON_EKLER,
  GUVENLIK_BASLIKLARI, ayniKokenMi, hostPortu,
  MAKINE_BASLIK, MAKINE_JETON_BASLIK, MAKINE_IZINLI, MAKINE_OKUMA, ESLE_YOLU, makineIzinliMi
};
