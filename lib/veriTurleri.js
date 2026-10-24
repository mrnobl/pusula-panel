/**
 * VERİ TÜRLERİ — TEK TABLO (68.0, PLAN-TASIMA §2 / F1)
 * ═══════════════════════════════════════════════════════════════════════════
 * Veri kökündeki (bugün `data/`) HER parça tam olarak bir türdedir. Tür; yeni düzende alt klasörü (lib/yollar.js),
 * taşıma dosyasına / dağıtıma / araştırma eklentisine girip girmeyeceğini (F3–F5) belirler.
 *
 *   KISISEL    kullanıcının kendi kayıtları: portföy, işlem defteri, bot durumları, ileri test, ayarlar   → taşıma dosyası
 *   GIZLI      anahtarlar, jetonlar, PIN özeti                                                        → taşıma dosyası (şifreli)
 *   ARASTIRMA  araştırma çalışmaları ve YENİDEN ÜRETİLEMEYEN araştırma kayıtları (asla önbellek sayılmaz) → yalnız eklenti
 *   ONBELLEK   yeniden indirilebilen piyasa verisi (mumlar, fiyat serileri)                            → hiçbir pakete girmez
 *   MAKINE     bu bilgisayara özel: süreç kimliği, günlükler, görev çıktıları, makine bayrağı           → hiçbir pakete girmez
 *
 * Eşleme: desen = parça adı (ilk yol parçası). Desen, adın kendisini VE `ad.` ile başlayan yan dosyaları (ad.tmp,
 * ad.yedek, ad.bozuk-…bak, ad-<pid>.tmp değil) kapsar; `*` joker. Bilinmeyen parça → tur() null: envanter testi
 * (scripts/veri-yolu-selftest.js) kodda kullanılan ve bu bilgisayardaki her parçanın türlü olduğunu denetler.
 * Yeni bir data parçası ekleyen kod BU TABLOYA da satır ekler.
 */
'use strict';

const TURLER = ['KISISEL', 'GIZLI', 'ARASTIRMA', 'ONBELLEK', 'MAKINE'];
const KLASOR = { KISISEL: 'kisisel', GIZLI: 'gizli', ARASTIRMA: 'arastirma', ONBELLEK: 'onbellek', MAKINE: 'makine' };
const AD = { KISISEL: 'Kişisel', GIZLI: 'Gizli', ARASTIRMA: 'Araştırma', ONBELLEK: 'Önbellek', MAKINE: 'Bu bilgisayara özel' };
/** Tabloda olmayan bir parça yeni düzende nereye yazılır: KİŞİSEL (taşıma dosyasına girer — kaybolmaz). */
const BILINMEYEN_TUR = 'KISISEL';

/** [desen, tür, açıklama] — sıra önemli değil; bir ad iki desene uyarsa ilk satır kazanır (test çakışmayı da denetler). */
const TABLO = [
  // ── KİŞİSEL ──
  ['ayarlar.json', 'KISISEL', 'kullanıcı ayarları (varsayılandan farkı; 68.0 — eski config.json yerine)'],
  ['live', 'KISISEL', 'canlı/demo bot durumları, emir defteri, hesap işlemleri, alarmlar, canlı onay'],
  ['ileri', 'KISISEL', 'ileri (gölge) test kayıtları — 2027/2028 hükmünün tek kaynağı'],
  ['tasarimci', 'KISISEL', 'model portföy kâğıt hesabı, dolumlar, günlük'],
  ['portfoyum', 'KISISEL', 'Portföyüm kayıtları (yalnız eklenir)'],
  ['islem-defteri', 'KISISEL', 'İşlem defterim kayıtları ve eşitleme imleçleri'],
  ['tarama', 'KISISEL', 'Dikkat listesi günlük tarama arşivi + tarama ayarları (geriye dönük üretilemez)'],
  ['dikkat', 'KISISEL', 'Dikkat envanteri ve kota kayıtları'],
  ['pine', 'KISISEL', 'kullanıcının kaydettiği Pine betikleri'],
  ['gunluk', 'KISISEL', 'kalıcı günlük (gün gün jsonl)'],
  ['raporlar', 'KISISEL', 'üretilen raporlar'],
  ['kurulum.json', 'KISISEL', 'kurulum sihirbazı onayları'],
  ['bildirim-ayar.json', 'KISISEL', 'bildirim tercihleri'],
  ['bildirim-gecmis.jsonl', 'KISISEL', 'bildirim geçmişi'],
  ['bildirim-bekleyen.jsonl', 'KISISEL', '73.5 sessiz saatte bekletilen bildirimlerin özeti (sessiz saat bitince tek mesaj, sonra boşalır)'],
  ['bildirim-uretici.json', 'MAKINE', '73.5 bildirim üreticilerinin durumu (makine nabızları, görülen KAP bildirimleri, son fiyat/anahtar/gölge gönderimi) — yalnız sunucu'],
  ['piyasa-bildirim.json', 'MAKINE', '73.9 piyasa takvimi bildiriminin durumu (gönderilen hafta, hatırlatılan / sonucu gönderilen olaylar) — yalnız sunucu'],
  ['piyasa-olaylar.json', 'KISISEL', '73.9 Piyasa bağlamı takvimine elle eklenen olaylar (coin kilit açılımı vb.; otomatik ücretsiz kaynak yok)'],
  ['risk-durum.json', 'KISISEL', 'risk yöneticisi durumu'],
  ['trades.json', 'KISISEL', 'kâğıt motoru işlemleri'],
  ['orders.json', 'KISISEL', 'kâğıt motoru emirleri'],
  ['wallet.json', 'KISISEL', 'kâğıt cüzdan'],
  ['balance_history.json', 'KISISEL', 'kâğıt bakiye geçmişi'],
  ['equity_history.json', 'KISISEL', 'özsermaye geçmişi'],
  ['telegram-son-ozet.json', 'KISISEL', 'son portföy özeti (Telegram tekrarını önler)'],
  ['telegram-kuyruk.jsonl', 'KISISEL', 'gönderilmemiş Telegram mesajları'],
  ['ev-kuyruk.jsonl', 'KISISEL', 'sunucuya henüz ulaşmamış yazmalar (geliştirme bilgisayarı)'],
  // ── GİZLİ ──
  ['secrets.json', 'GIZLI', 'API anahtarları, Telegram jetonu, panel jetonu, sağlık adresleri'],
  ['telefon-jeton.json', 'GIZLI', 'telefon kademesi jetonu'],
  ['yerel-sistem-jeton.json', 'GIZLI', 'yerel sistem jetonu (güncelleyicinin yeniden başlatma isteği, açılışta yenilenir)'],
  ['acil-pin.json', 'GIZLI', 'acil durdurma PIN özeti'],
  ['acil-pin-deneme.json', 'MAKINE', 'acil PIN yanlış deneme sayacı ve 1 dk kilit bitişi (bu bilgisayarın; PIN yok)'],
  ['ev-baglanti.json', 'GIZLI', 'sunucu bağlantısı (adres + jetonlar)'],
  ['yedek-sifre.json', 'GIZLI', 'USB yedeğinin (.pusula) gizli kısmını şifreleyen yedek şifresi (68.1)'],
  ['gelistirme-jeton.json', 'GIZLI', 'geliştirme yazma jetonu özeti (sunucu)'],
  ['anahtar-bekleyen.json', 'GIZLI', 'sunucuya henüz gönderilmemiş anahtar değişiklikleri (73.0 Ayarlar › Anahtarlar, araştırma kopyası; PIN yok)'],
  // ── ARAŞTIRMA (yeniden üretilemeyen kayıtlar dahil — asla önbellek değil) ──
  ['arastirma', 'ARASTIRMA', 'araştırma çıktıları, ön kayıt sonuçları, kol önbellekleri'],
  ['ileriye-kayit', 'ARASTIRMA', 'ileriye kayıt (73.3): Binance pozisyon istatistikleri, opsiyon strike OI, Hyperliquid büyük hesaplar, emir defteri derinliği, tasfiye akışı — geriye dönük indirilemez ham kayıt (lib/ileriKayit)'],
  ['gomlek', 'ARASTIRMA', 'gömlek testleri (spot 1d veritabanı, işçi sonuçları)'],
  ['kavram', 'ARASTIRMA', 'kavram testleri'],
  ['kitap', 'ARASTIRMA', 'Pusula Kitabı veri paketi'],
  ['b1-kisit', 'ARASTIRMA', 'deneme 860'],
  ['bist-yenmek', 'ARASTIRMA', 'BIST al-tut yenme denemeleri'],
  ['qqq-yenmek', 'ARASTIRMA', 'QQQ al-tut yenme denemeleri'],
  ['buffett', 'ARASTIRMA', 'Buffett tarzı değer yatırımı (950–952): S&P 500 PIT üyelik, SEC EDGAR XBRL olguları, Yahoo serileri, ölçüm çıktıları'],
  ['nasdaq-kol3', 'ARASTIRMA', 'Nasdaq kol 3 denemesi'],
  ['nasdaq-zaman-dilimi', 'ARASTIRMA', 'Nasdaq zaman dilimi denemesi girdisi'],
  ['btc-tarih', 'ARASTIRMA', 'BTC tarih paketi'],
  ['coklu-taban', 'ARASTIRMA', 'çoklu taban denemesi'],
  ['dikkat-ls', 'ARASTIRMA', 'Dikkat long/short araştırması (GitHub sinyal arşivi)'],
  ['gercek', 'ARASTIRMA', 'GERÇEK-Mİ H1 araştırması ve kaynak serileri'],
  ['hucum-varlik', 'ARASTIRMA', 'Kairos varlık genişlemesi (eski adı Hücum)'],
  ['incele', 'ARASTIRMA', 'grafik inceleme dışa aktarımları'],
  ['midas-maliyet', 'ARASTIRMA', 'Midas maliyet ölçümü'],
  ['temmuz-listesi', 'ARASTIRMA', 'Temmuz listesi analizi'],
  ['portfoy-lab', 'ARASTIRMA', 'portföy laboratuvarı denemeleri ve karar günlüğü'],
  ['oi', 'ARASTIRMA', 'açık pozisyon (OI) araştırma verisi'],
  ['pump', 'ARASTIRMA', 'pump araştırması verisi'],
  ['korku-dca', 'ARASTIRMA', 'korku-açgözlülük ters DCA (908): F&G dökümü + arşiv PIT karşılaştırması'],
  ['sinyal', 'ARASTIRMA', 'sinyal H2 verisi (ilk indirme SHA ile mühürlü)'],
  ['bacak-etiketleri.json', 'ARASTIRMA', 'elle etiketlenmiş bacaklar (MTF çapa ölçümü)'],
  ['motor-mutabakat*', 'ARASTIRMA', 'motor mutabakat tabanı ve yedekleri'],
  ['arastirma-eklentisi.json', 'ARASTIRMA', 'araştırma eklentisi yükleme işareti (68.1 — menü görünürlüğü)'],
  // ── ÖNBELLEK (yeniden indirilir) ──
  ['market.db', 'ONBELLEK', 'mum veritabanı (SQLite; -wal, -shm yan dosyaları dahil)'],
  ['market.db-*', 'ONBELLEK', 'SQLite yan dosyaları'],
  ['candles_cache.json', 'ONBELLEK', 'eski mum önbelleği'],
  ['veri-durum.json', 'ONBELLEK', 'veri orkestratörü durumu'],
  ['piyasa-baglami', 'ONBELLEK', '73.9 Piyasa bağlamı: ücretsiz kaynakların son yanıtları (ham/), türetilmiş kartlar (turev/), durum + IV/çarpıklık günlük serisi (ileriye kayıttan yeniden üretilebilir)'],
  ['portfoy', 'ONBELLEK', 'portföy fiyat serileri (Yahoo, TEFAS, EVDS)'],
  ['nasdaq', 'ONBELLEK', 'Nasdaq fiyat serileri ve üyelik'],
  ['bist', 'ONBELLEK', 'BIST günlük fiyat serileri'],
  ['bist-1s', 'ONBELLEK', 'BIST saatlik fiyat serileri'],
  ['bist-temettu', 'ONBELLEK', 'BIST temettü / fiyat indirmeleri'],
  ['bist-hafif', 'ONBELLEK', 'BIST 100 vekili aday kümesinin son ~100 günü (73.7, lib/bistHafif.js — sunucuda günde bir İş Yatırım HisseTekil; bilanço bildirimi evreni)'],
  ['bist-temel', 'ONBELLEK', 'BIST temel analiz (788–790, 913–929): KAP toplu mali tablo arşivleri, İş Yatırım fiyat/döviz pozisyonu (yeniden indirilebilir; ölçüm girdileri SHA ile kayıtlı; Buffett ajanı salt okur)'],
  ['gercek-varlik', 'ONBELLEK', 'gerçek varlık fiyat serileri'],
  ['binance-tradfi', 'ONBELLEK', 'Binance TradFi sözleşme serileri'],
  ['okx-arsiv', 'ONBELLEK', 'OKX genel arşivi (allswap 1 dk mum + funding, günlük zip) — yeni listeleme long (909–912) doğrulama A'],
  ['fx', 'ONBELLEK', 'FRED döviz serileri'],
  // ── MAKİNEYE ÖZEL ──
  ['makine.json', 'MAKINE', 'makine bayrağı (araştırma modu)'],
  ['pusula.pid', 'MAKINE', 'çalışan denetleyici + sunucu PID kaydı'],
  ['pusula-durduruldu.txt', 'MAKINE', 'bilerek durduruldu işareti (bekçi)'],
  ['son-kapanis.json', 'MAKINE', '73.6 son temiz kapanış işareti (planlı açılış sayımı)'],
  ['donma.json', 'MAKINE', '73.6 donma bekçisinin son yeniden başlatma kaydı'],
  ['denetleyici.json', 'MAKINE', 'denetleyici yeniden deneme durumu'],
  ['supervisor.log', 'MAKINE', 'denetleyici günlüğü'],
  ['sunucu-konsol.log', 'MAKINE', 'sunucu konsol çıktısı'],
  ['*-gorev.log', 'MAKINE', 'zamanlanmış görev çıktıları'],
  ['gorevler', 'MAKINE', 'zamanlanmış görev komut dosyaları'],
  ['guncelleme.json', 'MAKINE', 'otomatik güncelleme durumu'],
  ['guncelleme.log', 'MAKINE', 'otomatik güncelleme günlüğü'],
  ['guncelleme.kilit', 'MAKINE', 'güncelleme kilidi'],
  ['oz-denetim', 'MAKINE', 'öz denetim (69.1): son sonuçlar, onarım sayaçları, olaylar, açılışlar'],
  ['imza-izinli', 'MAKINE', 'güncelleme imza doğrulaması (69.6): izinli SSH açık anahtarları (allowed_signers) — depo dışında, yalnız bu sunucu'],
  ['yedek-usb.log', 'MAKINE', 'USB yedek günlüğü'],
  ['kur.log', 'MAKINE', 'kurulum adımı günlüğü (scripts/kur.js, 68.3)'],
  ['yedek-ayar.json', 'MAKINE', 'yedek hedef klasörü (bu bilgisayarın sürücüsü)'],
  ['telegram-offset.json', 'MAKINE', 'Telegram yoklama imleci'],
  ['dis-ip.json', 'MAKINE', 'dış IP izleyici'],
  ['ev-istekler.json', 'MAKINE', 'sunucuda geliştirme yazmalarının tekrar defteri'],
  ['logs.json', 'MAKINE', 'panel olay günlüğü'],
  ['temiz-kapanis', 'MAKINE', 'öz test: temiz kapanış işareti'],
  ['veri-tasi.log', 'MAKINE', 'veri taşıma günlüğü'],
  ['tasima', 'MAKINE', 'oluşturulan / yüklenen taşıma dosyaları ve içe aktarma geçici klasörleri (68.1)'],
  ['tasima-bekliyor.json', 'MAKINE', 'taşıma sonrası "mutabakat bekliyor" işareti — botlar kendiliğinden başlamaz (68.1)'],
  ['onceki-*', 'MAKINE', 'içe aktarmadan önce bu bilgisayarda olan veri ("yedekleyip değiştir", 68.1)'],
];

function desenRe(d) {
  const kac = d.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${kac}(\\..*)?$`, 'i');
}
const DERLI = TABLO.map(([d, t, a]) => ({ desen: d, tur: t, aciklama: a, re: desenRe(d) }));

/** Parça adı (ilk yol parçası) → tür | null. */
function tur(ad) {
  const a = String(ad || '').split(/[\\/]/)[0];
  if (!a) return null;
  const s = DERLI.find(x => x.re.test(a));
  return s ? s.tur : null;
}
/** Parça adına uyan satır (açıklama için) | null. */
function satir(ad) { const a = String(ad || '').split(/[\\/]/)[0]; return DERLI.find(x => x.re.test(a)) || null; }
/** Tür → yeni düzendeki alt klasör adı. */
function klasor(t) { if (!KLASOR[t]) throw new Error(`bilinmeyen veri türü: ${t}`); return KLASOR[t]; }

module.exports = { TURLER, KLASOR, AD, TABLO, BILINMEYEN_TUR, tur, satir, klasor, desenRe };
