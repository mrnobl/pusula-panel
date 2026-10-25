'use strict';
/**
 * ÖZ DENETİM (69.1, PLAN-OZ-DENETIM.md) — Pusula'nın kendini 5 dk'da bir yoklaması, güvenli onarım, güvenli kip, tam kapanma.
 *
 * Kademe (kullanıcı kararı 2026-10-21, taslak 1–3):
 *   onar  — geri alınabilir, parayı etkilemeyen iş (kilit sil, eski günlüğü sıkıştır, sessiz saatte yeniden başlat …)
 *   koru  — tek koruyucu adım, sonra kullanıcıya bırakır (güvenli kip; para kaybettirebilecek sebepte TAM KAPANMA)
 *   haber — yalnız haber (saat, yedek, internet, mutabakat, marj, kaçan işlem, Telegram, sağlık sinyali)
 *
 * GÜVENLİ KİP: bot `durum.guvenliKip` — günlük çalışma yapılmaz (yeni işlem yok), dakikalık stop/koruma denetimi sürer.
 *   Öz denetimin koyduğu güvenli kip sebep geçince kendiliğinden kalkar; kullanıcı Sağlık sayfasından da kaldırabilir.
 * TAM KAPANMA = botun mevcut ENGEL'i (`durum.engel`, diske yazılır, yalnız kullanıcı "Engeli kaldır" ile açar). Bekçi,
 *   güncelleme, yeniden başlatma açamaz. Açık pozisyona dokunulmaz; borsadaki stoplar (felaket stopu) yerinde kalır.
 * DEMO KABUL (2026-12-09'a kadar): demo kipindeki bota (Hücum) öz denetim HİÇBİR ŞEY yapmaz — yalnız haber.
 * PARA KARARI YOK: pozisyon kapatma, al-sat, ayar/strateji değişikliği bu modülde yoktur. Kod hatası onarılmaz, raporlanır.
 *
 * 69.2: KARA KUTU — bot güvenli kipe girince / kapanınca (öz denetim ya da botun kendi ENGEL'i) o anın raporu
 *   <dizin>/kara-kutu/<zaman>-<bot>-<kaynak>.json: bot özeti, yürütücü, koruma, son 30 dk günlük, denetim sonuçları, güncelleme.
 *   SUNUCU BİLGİSAYARI (lib/sunucuBilgisayari.js) — Windows yeniden başlatması / etkin saatler, uyku, güç. BORSA TAKVİMİ
 *   (lib/borsaTakvimi.js) — Binance bakım duyurusu penceresinde güvenli kip; botların evrenindeki delist duyurusu haber.
 * Kalıcı: <dizin>/durum.json (son sonuçlar, onarım sayaçları, akşam özeti günü) · <dizin>/olaylar.jsonl (yalnız ekle,
 *   panel son 30 günü gösterir) · <dizin>/acilislar.jsonl (Pusula açılışları; günde 5'i geçince kırmızı).
 * Sunucuya bağımlılık `ctx` ile verilir (server.js ozDenetimKur) — öz test sahte ctx ile koşar (scripts/oz-denetim-selftest.js).
 */
const fs = require('fs');
const istatistik = require('./istatistik');   // 69.5 CUSUM
const H = require('./hataSozlugu');            // 73.6 emir reddi sınıflandırıcısı (Y-01 / Y-07)
const path = require('path');
const zlib = require('zlib');

const DK = 60000;
const SAAT = 60 * DK;
const GUN = 24 * SAAT;
const TR = 3 * SAAT;                       // Türkiye UTC+3 (yaz saati yok)

const AYAR = {
  aralikMs: 5 * DK,                        // yoklama
  yavasAralikMs: SAAT,                     // disk + yedek
  tekrarPencereMs: 30 * DK, tekrarEsik: 3, // aynı hata 30 dk'da 3 kez → güvenli kip
  tekrarKalkMs: 60 * DK,                   // güvenli kip (tekrar) — 60 dk tekrar yoksa kalkar
  onarimGunluk: 5,                         // aynı onarım günde en çok 5 kez
  acilisGunluk: 5,                         // Pusula günde 5'ten çok açıldıysa kırmızı (yeniden açma SINIRSIZ — bekçi)
  bellekMB: 1024, bellekKat: 2,
  diskOran: 0.10, diskGB: 5, gunlukSikistirGun: 30,
  saatFarkMs: 1000,
  fiyatTazeMs: 10 * DK, fiyatSapma: 0.03, fiyatSapmaKalk: 0.01,
  kacanDk: 15,                             // planlı günlük çalışma 00:02 UTC (03:02 TR) + 15 dk
  yedekSaat: 26,
  ileriYedekGun: 8,                        // 73.4 ileriye kayıt artımlı yedeği haftada bir (pazartesi) + 1 gün pay
  sinyalSaat: 2,
  stopHataArdisik: 3,                      // koruma stopu art arda 3 denetimde kurulamadı → tam kapanma
  stopVurusEsik: 2, stopVurusPencereMs: 24 * SAAT,   // 69.5 24 saatte 2 felaket stopu tetiklendi → güvenli kip (24 saat dolunca kalkar)
  emirRetEsik: 3,                          // emir retleri 30 dk'da 3 → tam kapanma
  tikHataEsik: 3,                          // bot döngüsü 30 dk'da 3 kez hata → tam kapanma
  ilkBeklemeMs: 15 * DK,                   // açılıştan 15 dk içinde yeniden başlatma yok (döngü olmasın)
  demoKorumaBitis: Date.parse('2026-12-09T21:00:00Z'),   // 2026-12-10 00:00 TR — demo kabul bitişi
  olaySakla: 30 * GUN,
  bakimOnceMs: 10 * DK, bakimSonraMs: 15 * DK, bakimUyariMs: 48 * SAAT,   // 69.2 borsa bakımı
  karaKutuTavan: 200, karaKutuGunlukMs: 30 * DK,                          // 69.2 kara kutu
  olayGun: 7,                                                             // 69.2 beklenmeyen kapanma penceresi
  paketAralikMs: GUN,                                                     // 69.4 npm audit günde bir
  yetkiTazeMs: GUN,                                                       // C5 API anahtarı yetkisi: saklı sınama 24 saatten eskiyse yeniden (SALT OKUMA)
  nodeUyariGun: 180,                                                      // 69.4 Node ömür sonuna 6 ay
  fundingUyari: 0.001, fundingHata: 0.003,                                 // 69.3 8 saatlik funding oranı |r|
  zorlaPencereMs: 24 * SAAT,                                              // 69.3 ADL/likidasyon geriye bakış
  sapmaK: 0.0005, sapmaH: 0.015,                                          // 69.5 CUSUM: günde 5 bp tolerans, 1,5 puan birikimde uyarı
  maliyetVarsayim: 7, maliyetKat: 2, maliyetEnAz: 10, maliyetPencereMs: 30 * GUN,   // 69.5 backtest 5 bp ücret + 2 bp kayma
};

/** Denetim tanımları (panel aynı listeyi gösterir). kademe: onar | koru | haber. */
const DENETIMLER = [
  { kimlik: 'surec', grup: 'sunucu', ad: 'Pusula süreci ayakta', kademe: 'onar', olcut: 'Panel 2 dk yanıt vermiyor; günde 5\'ten çok yeniden açıldı', nasil: 'Bekçi Pusula\'yı yeniden açar (sınırsız); günde 5\'i geçince kırmızı + Telegram.' },
  { kimlik: 'donma', grup: 'sunucu', ad: 'Bot döngüsü dönüyor', kademe: 'onar', olcut: 'Botun işi 30 dk\'dan uzun sürüyor ya da döngü 30 dk\'da 3 kez hata verdi', nasil: 'Takılan bot için Pusula yeniden başlatılır; döngü tekrar tekrar hata verirse bot tamamen kapanır.' },
  { kimlik: 'bellek', grup: 'sunucu', ad: 'Bellek kullanımı', kademe: 'onar', olcut: '1 GB üstü ya da 24 saatte 2 katı', nasil: 'Sessiz saatte Pusula yeniden başlatılır (çalışma sürmüyorken, 02:30–04:30 dışında).' },
  { kimlik: 'disk', grup: 'sunucu', ad: 'Disk alanı', kademe: 'onar', olcut: 'Boş yer %10 ya da 5 GB altında', nasil: '30 günden eski günlükler sıkıştırılır; hiçbir şey silinmez.' },
  { kimlik: 'paket', grup: 'sunucu', ad: 'Paket güvenliği', kademe: 'haber', olcut: 'npm güvenlik taramasında yüksek ya da kritik açık', nasil: 'Günde bir "npm audit"; düzeltme geliştirme tarafında yapılır (güncellemeyle gelir).' },
  { kimlik: 'node', grup: 'sunucu', ad: 'Node.js desteği', kademe: 'haber', olcut: 'Çalışan Node sürümünün güvenlik desteği 6 aydan kısa sürede bitiyor', nasil: 'Yalnız haber: yükseltmeyi geliştirme sohbetinde planlayın (kendiniz yükseltmeyin). Kılavuz › Sorun giderme › Node.js desteği.' },
  { kimlik: 'saat', grup: 'sunucu', ad: 'Bilgisayar saati', kademe: 'haber', olcut: 'Borsa saatiyle fark 1 sn üstü', nasil: 'Windows saat eşitlemesini açmanızı söyler.' },
  { kimlik: 'sir', grup: 'sunucu', ad: 'API anahtarları', kademe: 'haber', olcut: 'Anahtar dosyası okunamıyor ya da eski sürümde şifrelenmiş kalmış', nasil: 'Şifreleme yok (70.0, antivirüs uyumu); koruma çekim izni kapalı ve IP kısıtlı borsa anahtarı. Eski şifreli dosya Pusula-69.0 paketindeki scripts\\sir-coz.ps1 ile bir kez çözülür.' },
  { kimlik: 'kilit', grup: 'sunucu', ad: 'Takılı kilit dosyası', kademe: 'onar', olcut: 'Güncelleme kilidi var, sahibi çalışmıyor', nasil: 'Sahipsiz kilit silinir.' },
  { kimlik: 'dosya', grup: 'sunucu', ad: 'Kayıt dosyaları okunuyor', kademe: 'onar', olcut: 'Ayar ya da bot dosyası bozuk açıldı', nasil: 'Son sağlam kopyadan açılır; bot kaydıysa bot borsayla karşılaştırılana kadar kapalı kalır.' },
  { kimlik: 'yedek', grup: 'sunucu', ad: 'Yedek alınıyor', kademe: 'haber', olcut: 'Son yedek 26 saatten eski ya da başarısız; ileriye kayıt haftalık yedeği 8 günden eski ya da başarısız', nasil: 'Yalnız haber: yedek diski (USB) takılı ve boş yeri var mı bakın; sonraki 05:30 yedeğinde düzelir. ENOSPC = hedef disk dolu.' },
  { kimlik: 'uzak', grup: 'sunucu', ad: 'Şifreli uzak yedek', kademe: 'haber', olcut: 'Uzak yedek kurulmamış, başarısız ya da 26 saatten eski', nasil: 'Kurulum: Kılavuz › Yedek ve taşıma › Şifreli uzak yedek (restic + rclone, ücretsiz).' },
  { kimlik: 'kopya', grup: 'sunucu', ad: 'Eş makine kopyası', kademe: 'haber', olcut: 'Eşlenmiş bir SUNUCUNUN saat başı kopyası 2 saatten eski ya da alınamıyor (eş kapalı, yedek şifresi yok / iki bilgisayarda farklı, sürüm uyumsuz); 76.7: kopya kapsamı 64 MB sınırına yaklaştı (≥ %80) ya da aştı', nasil: 'Yalnız haber: Ayarlar › Makineler › Eş kopyaları kartında nedenini okuyun; eş açık ve Tailscale bağlıysa "Şimdi kopya al". Yedek şifresi iki bilgisayarda AYNI olmalı (Ayarlar › Yedek & taşıma).' },
  { kimlik: 'guncel', grup: 'sunucu', ad: 'Son güncelleme', kademe: 'haber', olcut: 'Son kurulum geri alındı ya da yarıda kaldı', nasil: 'Adımları Ayarlar › Güncelleme gösterir.' },
  { kimlik: 'wyb', grup: 'bilgisayar', ad: 'Windows yeniden başlatması', kademe: 'haber', olcut: 'Güncelleme yeniden başlatma bekliyor ve 03:02 etkin saatlerin dışında', nasil: 'Etkin saatleri 03:02\'yi kapsayacak biçimde ayarlamanızı ya da yeniden başlatmayı gündüz elle yapmanızı söyler.' },
  { kimlik: 'uyku', grup: 'bilgisayar', ad: 'Uyku ve hazırda bekleme', kademe: 'haber', olcut: 'Prize takılıyken bilgisayar boşta uyuyor ya da hazırda bekliyor', nasil: 'Güç ayarlarında "Asla" seçmenizi söyler (uyuyan bilgisayarda Pusula çalışmaz).' },
  { kimlik: 'baglanti', grup: 'borsa', ad: 'Borsa bağlantısı', kademe: 'onar', olcut: 'Bot borsaya bağlı değil ya da borsa yürütücüsü durdu', nasil: 'Bağlantı 1, 2, 5, 10, 30 dk arayla yeniden denenir; geri çekilme bitince yürütücü kendisi açılır.' },
  { kimlik: 'fiyat', grup: 'borsa', ad: 'Fiyat tazeliği', kademe: 'koru', olcut: 'Borsa fiyatı 10 dk okunamadı ya da ikinci kaynaktan %3\'ten fazla sapıyor', nasil: 'Her yoklamada yeniden çekilir; sapma varsa botlar güvenli kipe girer, sapma %1\'in altına inince çıkar.' },
  { kimlik: 'veri', grup: 'borsa', ad: 'Veri kalitesi', kademe: 'koru', olcut: 'Günlük kararın girdilerinde bulgu: iki kaynak (vadeli ↔ spot) kapanış farkı %1,5 / %3, mark fiyatı, hesap, coin evreni, kol mumları', nasil: 'İzleme kipinde (varsayılan) yalnız kaydeder, karar engellenmez. Etkin kipte ağır bulguda bot güvenli kipe girer, veri temizlenince kendiliğinden çıkar. Demo kabul botu yalnız haber alır. Kip: Sağlık › Veri kalitesi.' },
  { kimlik: 'bakim', grup: 'borsa', ad: 'Borsa bakımı', kademe: 'koru', olcut: 'Binance vadeli işlem / sistem bakımı duyurusu ya da sistem durumu "bakım"', nasil: 'Bakım penceresinde (10 dk önce … 15 dk sonra) botlar güvenli kipe girer, sonra kendiliğinden çıkar; 48 saat içindeki bakım önceden haber verilir.' },
  { kimlik: 'yetki', grup: 'borsa', ad: 'API anahtarı yetkisi', kademe: 'haber', olcut: 'Bir borsa anahtarında PARA ÇEKME izni açık (kırmızı) · canlı hesapta IP kısıtı yok ya da İşlem defterim anahtarı salt okuma değil (sarı) · izinler okunamadı (bilinmiyor)', nasil: 'Günde bir SALT OKUMA sınaması (Ayarlar › Anahtarlar › Sına ile aynı kod; emir yok). Yalnız haber: botu durdurmaz. Para çekme iznini borsanın API yönetiminde kapatın, sonra Anahtarlar › Sına.' },
  { kimlik: 'delist', grup: 'borsa', ad: 'Delist duyuruları', kademe: 'haber', olcut: 'Botların evrenindeki bir vadeli sözleşme ya da coin borsadan çıkarılacak', nasil: 'Tarihiyle haber verir; evreni değiştirmez (evren seçimi stratejinin işi).' },
  { kimlik: 'kayitci', grup: 'borsa', ad: 'İleriye veri kaydı', kademe: 'haber', olcut: 'Bir ileriye kayıtçı (pozisyon istatistikleri, opsiyon, Hyperliquid, derinlik, tasfiye) 6 saatten uzun süredir yazmıyor', nasil: 'Kayıtçı kendisi yeniden dener; hangi kaynağın düştüğünü Veri › İleriye kayıt gösterir. Botları etkilemez (yalnız ham veri).' },
  { kimlik: 'internet', grup: 'borsa', ad: 'İnternet', kademe: 'haber', olcut: 'Borsa ve GitHub\'a ulaşılamıyor', nasil: 'İnternet gelince kesintinin ne kadar sürdüğünü yazar.' },
  { kimlik: 'mutabakat', grup: 'bot', ad: 'Mutabakat', kademe: 'koru', olcut: 'Borsadaki pozisyon ya da bakiye botun kaydından farklı', nasil: 'Bot tamamen kapanır (ENGEL). Pozisyon uyuşmazlığı "Engeli kaldır" ile KALKMAZ: farkı inceleyin, sonra "Borsayla karşılaştır" deyin — temiz çıkınca bot kendisi açılır.' },
  { kimlik: 'stop', grup: 'bot', ad: 'Koruma stopu', kademe: 'koru', olcut: 'Felaket stopu denetiminde hata · 24 saatte 2 stop vuruşu', nasil: 'Stop her denetimde yeniden kurulur; art arda 3 denetimde kurulamazsa bot tamamen kapanır. 24 saatte 2 felaket stopu tetiklenirse bot güvenli kipe girer, son vuruştan 24 saat sonra kendiliğinden çıkar.' },
  { kimlik: 'marj', grup: 'bot', ad: 'Marj oranı', kademe: 'haber', olcut: 'Marj uyarı ya da alarm eşiğinde', nasil: 'Bot kendiliğinden DURMAZ — karar sizin: uyarıda genellikle beklemek yeterli; alarmda Durdur ya da gerçek tehlikede Acil durdur (Botlar › Hesap görünümü).' },
  { kimlik: 'zorla', grup: 'bot', ad: 'ADL ve likidasyon', kademe: 'haber', olcut: 'Borsa son 24 saatte bir pozisyonu zorla kapattı (ADL ya da likidasyon)', nasil: 'ACİL haber; kalan bacak korumasız olabilir — mutabakat botu durdurur, pozisyonları Binance\'te kontrol edin.' },
  { kimlik: 'funding', grup: 'bot', ad: 'Funding aşırılığı', kademe: 'haber', olcut: 'Açık pozisyonlu sembolde funding 8 saatte %0,1\'i aşıyor (yıllık ≈ %110)', nasil: 'Kalabalık pozisyon işareti; yalnız haber (strateji kararı değişmez).' },
  { kimlik: 'sapma', grup: 'bot', ad: 'Canlı ↔ gölge kayması', kademe: 'haber', olcut: 'Gerçekleşen − gölge farkında kalıcı kayma (CUSUM: günde 5 bp tolerans, 1,5 puan birikim)', nasil: '30 günlük %3/%5 bandından önce, küçük ama sürekli sapmayı haber verir; bot kararı değişmez.' },
  { kimlik: 'maliyet', grup: 'bot', ad: 'İşlem maliyeti', kademe: 'haber', olcut: 'Piyasa emri kayması + ücret, backtest varsayımının (7 bp) 2 katını aşıyor (30 gün, en az 10 dolum)', nasil: 'Backtest sonuçları gerçekte bu kadar iyi olmayabilir; yalnız haber. Kâğıt hesap ölçülmez (sanal dolum).' },
  { kimlik: 'toplamRisk', grup: 'bot', ad: 'Bütün hesapların toplam riski', kademe: 'haber', olcut: 'Hesap türü başına (kâğıt / demo / canlı hesap) brüt kaldıraç, net BTC payı, tek coin payı ya da felaket kaybı eşiği aştı; eşin risk verisi 6 saatten eski', nasil: 'İzleme kipinde (ilk 14 gün, varsayılan) yalnız panelde haber — Telegram yok, hiçbir emir engellenmez. Sınır kipinde (siz eşikleri onaylayınca) yalnız canlı hesapta sınırı aşacak büyüten emir verilmez; azaltan emirler ve stoplar serbest; kâğıt ve demo yalnız izlenir. Demo kabul botu borsadan ek okuma yapılmadan son kaydından ölçülür. Sistem › Sağlık › Toplam risk.' },
  { kimlik: 'tekrar', grup: 'bot', ad: 'Tekrarlayan hata', kademe: 'koru', olcut: 'Aynı hata 30 dk\'da 3 kez · borsa emri 30 dk\'da 3 kez reddetti (teminat / bakiye / kod hatası sınıfı)', nasil: 'Bot güvenli kipe girer (yeni işlem yok, stop korunur); borsa emirleri gerçek bir sebeple reddediyorsa tamamen kapanır. Borsaya gitmeyen ön kontrol retleri (asgari tutar, fiyat bandı) kapatmaz.' },
  { kimlik: 'kacan', grup: 'bot', ad: 'Kaçan planlı işlem', kademe: 'haber', olcut: 'Günlük çalışma 03:02\'den 15 dk sonra hâlâ yapılmadı', nasil: 'Kaçırılanı kendisi yapmaz; nedenini yazar.' },
  { kimlik: 'telegram', grup: 'bildirim', ad: 'Telegram ulaşıyor', kademe: 'haber', olcut: 'Son gönderim başarısız, Telegram bağlı değil ya da komut yoklaması hata veriyor (409 / 401)', nasil: '409: aynı Telegram botunu başka bir bilgisayar ya da program da yokluyor (taşımadan sonra eski bilgisayar açık kalmış olabilir) — o bilgisayarda Pusula\'yı durdurun. 401: jeton geçersiz — Ayarlar › Bildirimler.' },
  { kimlik: 'sinyal', grup: 'bildirim', ad: 'Sağlık sinyali', kademe: 'haber', olcut: 'Son ping başarısız, sunucu sinyali 2 saatten eski ya da sunucu sinyali adresi hiç girilmemiş', nasil: 'Adres yoksa sunucu sessizce kapanırsa kimse uyarmaz: Kılavuz › Kurulum › Sağlık sinyali (healthchecks, ücretsiz).' },
];
/**
 * 69.4 BELİRTİ / NEDEN (Google SRE: uyarı belirtiye bağlanır, nedenler panoda durur). Belirti denetimleri sarıya dönünce de
 * anında Telegram'a gider; neden denetimleri yalnız KIRMIZIYA dönünce — sarıları panelde ve 21:00 akşam özetinde.
 */
/** 73.7 zararsız güvenli kip kaynakları (tek bilgi + geçti) ve kendiliğinden geçen sarı belirtiler. */
const ZARARSIZ_GK = new Set(['bakim', 'fiyat', 'stopVurus']);
const GECICI_SARI = new Set(['internet', 'fiyat', 'bakim', 'baglanti', 'veri']);   // 74.3: veri kalitesinin hafif bulgusu bir sonraki çalışmada geçer
const BELIRTI = new Set(['disk', 'surec', 'donma', 'baglanti', 'fiyat', 'veri', 'internet', 'bakim','mutabakat', 'stop', 'marj', 'zorla', 'tekrar', 'kacan', 'telegram']);
for (const d of DENETIMLER) d.belirti = BELIRTI.has(d.kimlik);
const GRUPLAR = [['sunucu', 'Pusula ve sunucu'], ['bilgisayar', 'Sunucu bilgisayarı'], ['borsa', 'Borsa ve veri'], ['bot', 'Botlar ve pozisyonlar'], ['bildirim', 'Bildirimler']];

/** Tam kapanma / güvenli kip tetikleri (taslak 3 — hepsi kullanıcının onayladığı öneriler). */
const TETIKLER = [
  { kimlik: 'mutabakat', ad: 'Mutabakat farkı', sonuc: 'tam', not: 'mevcut ENGEL' },
  { kimlik: 'stop', ad: 'Koruma stopu kurulamadı', sonuc: 'tam' },
  { kimlik: 'stopVurus', ad: '24 saatte 2 felaket stopu tetiklendi', sonuc: 'guvenli', not: 'piyasa anormal: 24 saat yeni işlem yok, sonra kendiliğinden çıkar' },
  { kimlik: 'dosya', ad: 'Bozuk bot kaydı borsayla uyuşmuyor', sonuc: 'tam', not: 'mevcut ENGEL' },
  { kimlik: 'emirRet', ad: 'Emirler art arda reddediliyor', sonuc: 'tam' },
  { kimlik: 'fren', ad: 'Emir freni (24 saatte 600 emir · 10 dakikada 150 · 20 × sermaye tavanı nominal)', sonuc: 'tam', not: 'yürütücüde; azaltan emir ve stoplar serbest' },
  { kimlik: 'ciftEmir', ad: 'Beklenmeyen emir ya da dolum', sonuc: 'tam', not: 'mutabakat yakalar (mevcut ENGEL)' },
  { kimlik: 'cokme', ad: 'Bot döngüsü tekrar tekrar çöküyor', sonuc: 'tam' },
  { kimlik: 'yetki', ad: 'API anahtarının yetkisi değişti', sonuc: 'tam', not: 'C5: günde bir denetleniyor (Sağlık › API anahtarı yetkisi) ama şimdilik YALNIZ HABER (kırmızı + Telegram); tam kapanmaya bağlanması canlı hesaba geçmeden ayrıca kararlaştırılacak' },
  { kimlik: 'fiyatSapma', ad: 'Fiyat ikinci kaynaktan çok farklı', sonuc: 'guvenli' },
  { kimlik: 'veri', ad: 'Veri kalitesinde ağır bulgu (yalnız etkin kipte)', sonuc: 'guvenli', not: '74.3: izleme kipinde (varsayılan) yalnız kayıt; demo kabul botu yalnız haber; veri temizlenince kendiliğinden çıkar' },
  { kimlik: 'tekrar', ad: 'Diğer tekrarlayan hatalar', sonuc: 'guvenli' },
  { kimlik: 'bakim', ad: 'Borsa bakım penceresi', sonuc: 'guvenli', not: 'pencere bitince kendiliğinden çıkar' },
  { kimlik: 'guncelleme', ad: 'Güncellemeden hemen sonra bot hatası', sonuc: 'guvenli', not: 'tekrarlayan hata olarak yakalanır; kararlılık gözlemi eski sürüme döner' },
];

/** 69.4 Node.js LTS ömür sonları (nodejs/Release). Bilinmeyen sürüm → uyarı yok (tamam + not). */
const NODE_OMUR = { 18: '2025-04-30', 20: '2026-04-30', 22: '2027-04-30', 24: '2028-04-30', 26: '2029-04-30' };
const SIRA = { tamam: 0, kapali: 0, bilinmiyor: 1, uyari: 2, hata: 3 };
const enKotu = (l) => l.reduce((a, d) => (SIRA[d] > SIRA[a] ? d : a), 'tamam');
const trGun = (ms) => new Date(ms + TR).toISOString().slice(0, 10);
const trSaatDk = (ms) => { const d = new Date(ms + TR); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const utcGun = (ms) => new Date(ms).toISOString().slice(0, 10);
const trSaatDkMetin = (ms) => { const d = new Date(ms + TR); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const dkMetin = (ms) => (ms < SAAT ? `${Math.max(1, Math.round(ms / DK))} dk` : ms < 3 * SAAT ? `${(Math.round(ms / SAAT * 2) / 2).toString().replace('.', ',')} saat` : ms < 2 * GUN ? `${Math.round(ms / SAAT)} saat` : `${Math.round(ms / GUN)} gün`);

/**
 * Sessiz saat (S6): çalışma sürmüyor, TR 02:30–04:30 dışında (planlı 03:02 ±30 dk + 02:50–04:30 güncelleme penceresi).
 * @param mesgul bir bot işi sürüyor mu
 */
function sessizSaat(simdi, mesgul) {
  if (mesgul) return false;
  const dk = trSaatDk(simdi);
  return !(dk >= 150 && dk < 270);
}

/** Günlük satırından tekrar anahtarı: bot etiketi ayrı, sayılar/kimlikler '#'. */
function tekrarAnahtari(mesaj) {
  return String(mesaj).replace(/^\[[^\]]+\]\s*/, '').replace(/0x[0-9a-f]+/gi, '#').replace(/\d+([.,]\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 140);
}
/** Emir reddi (Binance -2019 marj yetersiz, -2010 yeni emir reddi, -1111 hassasiyet, -4164 asgari nominal, -1013 filtre …). */
const EMIR_RET = /(-2019|-2010|-1111|-4164|-1013|-4003|-4131|Margin is insufficient|insufficient balance|yetersiz bakiye|geçersiz miktar|emir reddedildi)/i;
/**
 * 2026-10-24 (Tao yanlış TAM KAPANMA): borsanın asgari emir kuralı (-4164 nominal / -4003 miktar) küçük kol farklarında BEKLENEN bir
 * ön kontrol sonucudur — emir borsaya hiç gitmez ve Kalkan bunu "verilmeyen küçük emir" sayar (kalkanBot ASGARI_KOD). Yalnız bu kodları
 * taşıyan satır emir reddi sayılmaz; başka bir ret kodu da varsa sayılır.
 */
const ASGARI_RET = /-4164|-4003/;
const EMIR_RET_ASIL = /(-2019|-2010|-1111|-1013|-4131|Margin is insufficient|insufficient balance|yetersiz bakiye|geçersiz miktar|emir reddedildi)/i;
const emirRetMi = (m) => EMIR_RET.test(m) && !(ASGARI_RET.test(m) && !EMIR_RET_ASIL.test(m));
/** Kendi döngüsünü besleyen satırlar tekrar sayılmaz (ENGELLİ / güvenli kip / para akışı durdurması her 15 dk yazılır). */
const TEKRAR_DISI = /ENGELLİ|GÜVENLİ KİP|AZALTMA|\[ÖZ DENETİM\]|günlük çalışma yapılamadı|para akışı onayı bekleniyor/;
/** Ağ hataları tekrar sayılmaz — bağlantı/internet denetimi ve yürütücünün geri çekilmesi (418/429) izler; kısa kesinti güvenli kip açmasın. */
const AG_HATASI = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|RequestTimeout|NetworkError|ExchangeNotAvailable|zaman aşımı|timed? ?out|GERI_CEKILME|geri çekilme|\b(418|429|502|503|504)\b/i;

class OzDenetim {
  /**
   * @param o.dizin  kalıcı kayıt dizini (data/oz-denetim)
   * @param o.ctx    sunucu bağdaştırıcısı — bkz. server.js ozDenetimKur (her alan isteğe bağlı; yoksa denetim 'bilinmiyor')
   * @param o.bildirici isletim.Bildirici benzeri { gonder(tur, baslik, satirlar, secenek) }
   * @param o.kaydet (seviye, metin) günlük
   */
  constructor({ dizin, ctx = {}, bildirici = null, kaydet = () => {}, ayar = {}, simdi = () => Date.now() } = {}) {
    this.dizin = dizin;
    this.ctx = ctx;
    this.bildirici = bildirici;
    this.kaydet = (sv, m) => { try { kaydet(sv, `[ÖZ DENETİM] ${m}`); } catch { /* */ } };
    this.ayar = { ...AYAR, ...ayar };
    this.simdi = simdi;
    this.sonuclar = {};          // kimlik → { durum, ayrinti, botlar, zaman, onarim }
    this.durumDosya = dizin ? path.join(dizin, 'durum.json') : null;
    this.kayit = { sayac: {}, ozetGun: null, stopHata: {}, kesintiBas: null, yavasSon: 0, oncekiDurum: {}, botIz: {}, bildirilenBakim: {}, zorlaBilinen: [] };
    if (this.durumDosya) { try { this.kayit = { ...this.kayit, ...JSON.parse(fs.readFileSync(this.durumDosya, 'utf8')) }; } catch { /* ilk kez */ } }
    this.tekrarlar = {};         // bot → anahtar → [zaman]
    this.tekrarOrnek = {};       // bot → anahtar → son özgün satır (panelde görünen)
    this.emirRetler = {};        // bot → [zaman]
    this.bellekOrnek = [];       // [{zaman, mb}] saatlik
    this.acilis = simdi();
    this.mesgul = false;
    this.sonYoklama = null;
    this._bilgisayar = null;     // 69.2 saatlik ölçüm (lib/sunucuBilgisayari.js)
    this._takvim = null;         // 69.2 saatlik duyurular (lib/borsaTakvimi.js)
    this.zamanlayici = null;
  }

  // ── kalıcılık ──
  _yaz() {
    if (!this.durumDosya) return;
    try {
      fs.mkdirSync(this.dizin, { recursive: true });
      const g = `${this.durumDosya}.tmp`;
      fs.writeFileSync(g, JSON.stringify({ ...this.kayit, sonuclar: this.sonuclar, sonYoklama: this.sonYoklama }, null, 2), 'utf8');
      fs.renameSync(g, this.durumDosya);
    } catch (e) { this.kaydet('WARN', `durum yazılamadı: ${e.message}`); }
  }
  _olay(o) {
    const satir = { zaman: this.simdi(), ...o };
    if (!this.dizin) return satir;
    try { fs.mkdirSync(this.dizin, { recursive: true }); fs.appendFileSync(path.join(this.dizin, 'olaylar.jsonl'), JSON.stringify(satir) + '\n', 'utf8'); } catch { /* */ }
    return satir;
  }
  olaylar(gun = 30, tavan = 300) {
    if (!this.dizin) return [];
    const sinir = this.simdi() - gun * GUN;
    let l = [];
    try { l = fs.readFileSync(path.join(this.dizin, 'olaylar.jsonl'), 'utf8').split('\n').filter(Boolean).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(x => x && x.zaman >= sinir); } catch { /* yok */ }
    return l.slice(-tavan).reverse();
  }

  /**
   * Açılışta bir kez (server): açılışı kaydeder. 73.6 (S12): `planli` = önceki süreç TEMİZ kapandı (güncelleme / panelden yeniden
   * başlatma / Pusula'yı durdur — server.js son kapanış işareti). Planlı açılışlar "günde 5'ten çok" sayacına girmez.
   * Satır biçimi: eski kayıt = yalnız zaman (sayı), yeni = {"z":…,"p":1}. @returns bugünkü (TR) PLANSIZ açılış sayısı
   */
  acilisKaydet({ planli = false } = {}) {
    if (!this.dizin) return 0;
    const dosya = path.join(this.dizin, 'acilislar.jsonl');
    let l = [];
    try { l = fs.readFileSync(dosya, 'utf8').split('\n').filter(Boolean); } catch { /* ilk */ }
    l.push(planli ? JSON.stringify({ z: this.acilis, p: 1 }) : String(this.acilis));
    l = l.slice(-200);
    try { fs.mkdirSync(this.dizin, { recursive: true }); fs.writeFileSync(dosya, l.join('\n') + '\n', 'utf8'); } catch { /* */ }
    return this._acilislar(trGun(this.acilis)).plansiz;
  }
  /** Saf okuma: bir TR gününün açılışları → { toplam, plansiz, planli }. */
  _acilislar(gun) {
    let l = [];
    try { l = fs.readFileSync(path.join(this.dizin, 'acilislar.jsonl'), 'utf8').split('\n').filter(Boolean); } catch { return { toplam: 1, plansiz: 1, planli: 0 }; }
    const k = l.map(s => { if (s[0] === '{') { try { const j = JSON.parse(s); return { z: +j.z, p: !!j.p }; } catch { return null; } } const z = Number(s); return Number.isFinite(z) ? { z, p: false } : null; })
      .filter(x => x && trGun(x.z) === gun);
    const planli = k.filter(x => x.p).length;
    return { toplam: k.length, plansiz: k.length - planli, planli };
  }
  /** Bugünkü PLANSIZ açılış sayısı (eski davranış: planlı ayrımı yokken hepsi). */
  bugunAcilis() {
    if (!this.dizin) return 1;
    return this._acilislar(trGun(this.simdi())).plansiz;
  }

  /**
   * 73.6 (Y-02) KULLANICI ONAYI — "Botu yeniden aç" / "Engeli kaldır" / "Güvenli kipi kaldır" (server.js uçları çağırır).
   * O ana kadarki sayaçlar (emir reddi, tekrarlayan hata, stop ardışık, döngü hatası) silinir: bot açıldıktan sonra yalnız YENİ
   * olaylar sayılır (eskiden 5 dk sonraki yoklama aynı eski satırlarla botu yeniden kapatıyordu). Onay zamanı diske yazılır;
   * bu bot 6 saat içinde yeniden kapanırsa Telegram tekrar kısıtı atlanır ("açtığınız bot yeniden kapandı").
   * Güvenlik gevşemez: yeni olay aynı eşiklerle yine kapatır.
   */
  onayVerildi(ad, simdi = this.simdi()) {
    if (!ad) return false;
    this.emirRetler[ad] = [];
    this.tekrarlar[ad] = {};
    this.tekrarOrnek[ad] = {};
    const sh = this.kayit.stopHata[ad];
    if (sh) this.kayit.stopHata[ad] = { ...sh, ardisik: 0 };
    this.kayit.onay = { ...(this.kayit.onay || {}), [ad]: simdi };
    this._olay({ kimlik: 'onay', tur: 'onay', bot: ad, metin: 'kullanıcı botu açtı — sayaçlar bu andan sonrasını sayar' });
    this._yaz();
    return true;
  }
  _onayZamani(ad) { return ((this.kayit.onay || {})[ad]) || 0; }

  // ── günlük gözlemi (tekrarlayan hata, emir reddi) ──
  /** server db.addLog her satırda çağırır. Yalnız WARN/ERROR ve bir bot etiketiyle başlayan satırlar sayılır. */
  gunlukGozle(seviye, mesaj) {
    if (seviye !== 'WARN' && seviye !== 'ERROR') return;
    const m = String(mesaj || '');
    if (TEKRAR_DISI.test(m)) return;
    const bot = this._etikettenBot(m);
    if (!bot) return;
    const z = this.simdi();
    const p = this.ayar.tekrarPencereMs;
    // 73.6 (Y-01 / Y-07): emir reddi YALNIZ yürütücünün borsa satırından sayılır (bot katmanının kopya satırı sayılmaz) ve yalnız
    // dikkat / kod-hatası sınıfındaki BORSA retleri (ön kontrol — borsaya gitmeyen — retleri zararsız; tekrar sayacı izler).
    const er = H.emirRetSatiri(m);
    if (er && er.tamKapanma) {
      const l = (this.emirRetler[bot] = (this.emirRetler[bot] || []).filter(t => z - t.zaman < p));
      l.push({ zaman: z, kod: er.kod, sinif: er.sinif, metin: m.replace(/^\[[^\]]+\]\s*/, '').slice(0, 200) });
    }
    if (AG_HATASI.test(m)) return;
    const a = tekrarAnahtari(m);
    const b = (this.tekrarlar[bot] = this.tekrarlar[bot] || {});
    const l = (b[a] = (b[a] || []).filter(t => z - t < Math.max(p, this.ayar.tekrarKalkMs)));
    l.push(z);
    (this.tekrarOrnek[bot] = this.tekrarOrnek[bot] || {})[a] = m.replace(/^\[[^\]]+\]\s*/, '').slice(0, 200);
    const anahtarlar = Object.keys(b);
    if (anahtarlar.length > 200) for (const k of anahtarlar.slice(0, anahtarlar.length - 200)) { delete b[k]; delete this.tekrarOrnek[bot][k]; }
  }
  _etikettenBot(m) {
    const e = /^\[([^\]]+)\]/.exec(m);
    if (!e) return null;
    const etiket = e[1].toLocaleUpperCase('tr-TR');
    const b = this._botlar().find(x => x.etiket && etiket === String(x.etiket).toLocaleUpperCase('tr-TR'));
    return b ? b.ad : null;
  }
  _tekrarlayan(bot, simdi) {
    const b = this.tekrarlar[bot] || {};
    const out = [];
    for (const [a, l] of Object.entries(b)) {
      const n = l.filter(t => simdi - t < this.ayar.tekrarPencereMs).length;
      if (n >= this.ayar.tekrarEsik) out.push({ anahtar: a, adet: n, ornek: ((this.tekrarOrnek[bot] || {})[a]) || a });
    }
    return out.sort((x, y) => y.adet - x.adet);
  }
  _sonTekrar(bot) { let s = 0; for (const l of Object.values(this.tekrarlar[bot] || {})) for (const t of l) if (t > s) s = t; return s; }

  // ── yardımcılar ──
  _botlar() { try { return (this.ctx.botlar && this.ctx.botlar()) || []; } catch { return []; } }
  /** Demo kabul süresince demo bota öz denetim hiçbir şey yapmaz. */
  dokunulmaz(b, simdi = this.simdi()) { return !!b && b.mod === 'demo' && simdi < this.ayar.demoKorumaBitis; }
  _onarimHakki(kimlik, simdi) {
    const g = trGun(simdi);
    const s = this.kayit.sayac[kimlik];
    return !s || s.gun !== g || s.adet < this.ayar.onarimGunluk;
  }
  _onarimSay(kimlik, simdi) {
    const g = trGun(simdi);
    const s = this.kayit.sayac[kimlik];
    this.kayit.sayac[kimlik] = s && s.gun === g ? { gun: g, adet: s.adet + 1 } : { gun: g, adet: 1 };
  }
  _mesgulMu() { return this._botlar().some(b => b.bot && (b.bot._calisma || b.bot.mesgul)); }
  async _bildir(tur, baslik, satirlar, anahtar, kisitMs) {
    if (!this.bildirici) return null;
    try { return await this.bildirici.gonder(tur, `Öz denetim: ${baslik}`, satirlar, anahtar ? { anahtar: `oz:${anahtar}`, kisitMs } : {}); } catch { return null; }
  }

  // ── bot eylemleri (koru kademesi) ──
  /**
   * 73.7: `o.kalkis` tahmini kalkış (ms) · `o.ayrinti` Sorun merkezi "Neyi saydı?" satırları. ZARARSIZ kendiliğinden geçen kaynaklarda
   * (bakım, fiyat sapması, 24 saatte 2 stop vuruşu — kullanıcı kararı "tek bilgi + geçti") Telegram'a TEK BİLGİ iletisi gider ve botun
   * güvenli kipine `bildirildi` işareti konur: günlük çalışma ertelenince bot ikinci bir "ertelendi" iletisi atmaz; kalkınca bot
   * "güvenli kip geçti" iletisini atar (lib/live/bindirmeBot.js guvenliKipKaldir — bot kodu DEĞİŞMEDİ). Tekrarlayan hata (dikkat) alarm kalır.
   */
  _guvenliKip(b, kaynak, metin, o = {}) {
    if (this.dokunulmaz(b) || !b.bot || typeof b.bot.guvenliKipKoy !== 'function') return false;
    if (b.bot.durum.engel || b.bot.durum.guvenliKip) return false;
    if (!b.bot.guvenliKipKoy(`oz:${kaynak}`, metin)) return false;
    this._turBildirdi = true;
    const simdi = this.simdi();
    this.kayit.gkAyrinti = { ...(this.kayit.gkAyrinti || {}), [b.ad]: { kaynak, zaman: simdi, metin: String(metin).slice(0, 300), satirlar: (o.ayrinti || []).slice(-10).map(x => String(x).slice(0, 240)), kalkis: Number.isFinite(o.kalkis) ? o.kalkis : null } };
    const kk = this.karaKutu(b, kaynak, metin);
    this._olay({ kimlik: kaynak, tur: 'guvenli-kip', bot: b.ad, metin, karaKutu: kk });
    this.kaydet('WARN', `${b.adGorunen}: GÜVENLİ KİP — ${metin}`);
    const yeniden = this._yenidenKapanma(b.ad);
    const zararsiz = ZARARSIZ_GK.has(kaynak) && !yeniden;
    const kalkis = Number.isFinite(o.kalkis) ? `Tahmini kalkış: ${trSaatDkMetin(o.kalkis)} (TR).` : null;
    if (zararsiz) {
      try { const g = b.bot.durum.guvenliKip; if (g && !g.bildirildi) g.bildirildi = simdi; } catch { /* işaret konamazsa bot kendi bilgisini atar */ }
      this._bildir('bilgi', `${b.adGorunen} güvenli kipte — kendiliğinden geçecek`, [metin, kalkis, 'Zararsız, koruma amaçlı: yeni işlem açılmıyor, açık pozisyonların stopu borsada. Dokunmayın; sebep geçince kendiliğinden kalkar ve "güvenli kip geçti" iletisi gelir.', kk ? `Olay raporu: ${kk} (Sağlık › Olay raporları)` : null], `gk:${b.ad}:${kaynak}`);
    } else {
      this._bildir('alarm', yeniden ? `${b.adGorunen}: açtığınız bot yeniden güvenli kipe girdi` : `${b.adGorunen} güvenli kipte`, [yeniden ? `Açtığınız bot yeniden güvenli kipe girdi — sebep: ${metin}` : metin, kalkis, 'Yeni işlem açılmayacak; açık pozisyonun stopu yerinde. Sebep geçince kendiliğinden çıkar; Sağlık sayfasından da kaldırabilirsiniz.', kk ? `Olay raporu: ${kk} (Sağlık › Olay raporları)` : null], yeniden ? `gk:${b.ad}:${kaynak}:${this._onayZamani(b.ad)}` : `gk:${b.ad}:${kaynak}`);
    }
    this._izYaz(b);
    return true;
  }
  /** Bu bot kullanıcı onayından sonraki 6 saat içinde mi kapanıyor (Y-02)? */
  _yenidenKapanma(ad, simdi = this.simdi()) { const z = this._onayZamani(ad); return !!z && simdi - z >= 0 && simdi - z < 6 * SAAT; }
  _guvenliKipKaldir(b, kaynak, neden) {
    const g = b.bot && b.bot.durum.guvenliKip;
    if (!g || g.kaynak !== `oz:${kaynak}` || typeof b.bot.guvenliKipKaldir !== 'function') return false;
    b.bot.guvenliKipKaldir(`oz:${kaynak}`);
    this._olay({ kimlik: kaynak, tur: 'guvenli-kip-kalkti', bot: b.ad, metin: neden });
    this.kaydet('INFO', `${b.adGorunen}: güvenli kip kendiliğinden kalktı — ${neden}`);
    return true;
  }
  /** 73.7: `ayrinti` = kapanmaya yol açan satırlar (emir retleri {zaman,kod,sinif,metin} · döngü hataları · stop hatası) → Sorun merkezi "Neyi saydı?". */
  _tamKapanma(b, kaynak, metin, ayrinti = []) {
    if (this.dokunulmaz(b) || !b.bot || typeof b.bot.engelKoy !== 'function') return false;
    if (b.bot.durum.engel) return false;
    const tam = `öz denetim: ${metin}`;
    if (!b.bot.engelKoy(`oz:${kaynak}`, tam)) return false;
    this._turBildirdi = true;
    this.kayit.tkAyrinti = { ...(this.kayit.tkAyrinti || {}), [b.ad]: { kaynak, zaman: this.simdi(), metin: String(metin).slice(0, 300),
      satirlar: (ayrinti || []).slice(-10).map(x => (x && typeof x === 'object' ? { zaman: x.zaman || null, kod: x.kod || null, sinif: x.sinif || null, metin: String(x.metin || '').slice(0, 240) } : String(x).slice(0, 240))) } };
    const kk = this.karaKutu(b, kaynak, metin);
    this._olay({ kimlik: kaynak, tur: 'tam-kapanma', bot: b.ad, metin, karaKutu: kk });
    this.kaydet('ERROR', `${b.adGorunen}: TAM KAPANMA — ${metin}`);
    // 73.6 (Y-02): kullanıcı açtıktan sonra 6 saat içinde yeniden kapanırsa Telegram tekrar kısıtı ATLANIR (anahtar onay zamanına bağlı).
    const yeniden = this._yenidenKapanma(b.ad);
    this._bildir('alarm', yeniden ? `${b.adGorunen}: açtığınız bot YENİDEN KAPANDI` : `${b.adGorunen} TAMAMEN KAPANDI`, [yeniden ? `Açtığınız bot yeniden kapandı — sebep: ${metin} (açtıktan sonraki YENİ olaylar sayıldı).` : metin, 'Bot siz açana kadar çalışmayacak (Pusula yeniden başlasa da). Açık pozisyona dokunulmadı; borsadaki stoplar yerinde.',
      'Sebebi inceleyip Sağlık sayfasından "Botu yeniden aç" deyin.', kk ? `Olay raporu: ${kk} (Sağlık › Olay raporları)` : null], yeniden ? `tk:${b.ad}:${kaynak}:${this._onayZamani(b.ad)}` : `tk:${b.ad}:${kaynak}`);
    this._izYaz(b);
    return true;
  }

  // ── denetimler ──
  /** Her denetim { durum, ayrinti, botlar?, onarim? } döndürür. Sorun yoksa 'tamam'. */
  async _yokla(kimlik, simdi, yavas) {
    const c = this.ctx;
    const A = this.ayar;
    const botlar = this._botlar().filter(b => b.bot && b.bot.durum && b.bot.durum.calisiyor);
    const botSatir = (fn) => {
      const out = {};
      for (const b of botlar) { try { out[b.ad] = { ad: b.adGorunen, mod: b.mod, ...fn(b) }; } catch (e) { out[b.ad] = { ad: b.adGorunen, mod: b.mod, durum: 'bilinmiyor', ayrinti: e.message }; } }
      return out;
    };
    const botOzet = (out, bosMetin) => {
      const l = Object.values(out);
      if (!l.length) return { durum: 'tamam', ayrinti: bosMetin || 'çalışan bot yok' };
      const d = enKotu(l.map(x => x.durum));
      const sorunlu = l.filter(x => SIRA[x.durum] >= 2);
      return { durum: d, ayrinti: (sorunlu.length ? sorunlu : l).map(x => `${x.ad}: ${x.ayrinti}`).join(' · '), botlar: out };
    };

    switch (kimlik) {
      case 'surec': {
        const ac = this.dizin ? this._acilislar(trGun(simdi)) : { plansiz: 1, planli: 0 };
        const n = ac.plansiz;
        const planliEk = ac.planli ? ` (+ ${ac.planli} planlı: güncelleme / yeniden başlatma)` : '';
        const dt = c.denetleyici ? c.denetleyici() : null;
        const ardisik = dt && dt.ardisik ? dt.ardisik : 0;
        const acik = dkMetin(simdi - this.acilis);
        // 70.1: sayaç yalnız Pusula KAPANINCA güncellenir (scripts/denetleyici-bekle.js). Bu açılış 2 dakikayı geçtiyse
        // (denetleyicinin "hızlı kapanma" sınırı) sayaç bu açılıştan ÖNCEKİ kapanmaları gösterir — şu anki sorun değil.
        const gecmis = ardisik >= 3 && simdi - this.acilis > 2 * DK && !(dt.sonCikisZaman > this.acilis);
        if (gecmis) return { durum: 'tamam', ayrinti: `${acik} süredir açık · bugün ${n} açılış${planliEk} · bu açılıştan önce ${ardisik} kez üst üste hızlı kapanma olmuştu (geçti)` };
        if (ardisik >= 3) return { durum: 'hata', ayrinti: `Pusula ${ardisik} kez üst üste açılıp hemen kapandı · bugün ${n} açılış${planliEk}` };
        if (n > A.acilisGunluk) return { durum: 'hata', ayrinti: `bugün ${n} kez beklenmedik biçimde açıldı (günde ${A.acilisGunluk}'ten çok)${planliEk} · ${acik} süredir açık` };
        return { durum: 'tamam', ayrinti: `${acik} süredir açık · bugün ${n} açılış${planliEk}${c.denetleyiciVar && !c.denetleyiciVar() ? ' · denetleyicisiz başlatıldı (çökerse bekçi açar)' : ''}` };
      }
      case 'donma': {
        const out = botSatir((b) => {
          const s = typeof b.bot.bekci === 'function' ? b.bot.bekci(simdi).filter(x => x.anahtar === 'mesgul' || x.anahtar === 'calisma') : [];
          // 73.6 (Y-13 / Y-02): ağ hatası döngü çökmesi sayılmaz (bağlantı / internet denetimleri izler); kullanıcı açtıktan sonrası sayılır.
          const onayZ = this._onayZamani(b.ad);
          const th = (typeof b.bot.tikHatalari === 'function' ? b.bot.tikHatalari(simdi, A.tekrarPencereMs) : [])
            .filter(x => !AG_HATASI.test(String(x.metin || '')) && !(x.zaman <= onayZ));
          if (th.length >= A.tikHataEsik) return { durum: 'hata', ayrinti: `döngü 30 dk'da ${th.length} kez hata verdi (son: ${String(th[th.length - 1].metin).slice(0, 90)})`, cokme: th };
          if (s.length) return { durum: 'hata', ayrinti: s.map(x => x.metin).join(' · '), takildi: true };
          return { durum: 'tamam', ayrinti: 'dönüyor' };
        });
        return botOzet(out);
      }
      case 'bellek': {
        const mb = c.bellekMB ? c.bellekMB() : null;
        if (!Number.isFinite(mb)) return { durum: 'bilinmiyor', ayrinti: 'okunamadı' };
        const son = this.bellekOrnek[this.bellekOrnek.length - 1];
        if (!son || simdi - son.zaman >= SAAT) { this.bellekOrnek.push({ zaman: simdi, mb }); this.bellekOrnek = this.bellekOrnek.filter(x => simdi - x.zaman <= 25 * SAAT); }
        const once = this.bellekOrnek.find(x => simdi - x.zaman >= 23 * SAAT);
        if (mb > A.bellekMB) return { durum: 'uyari', ayrinti: `${mb} MB (> ${A.bellekMB} MB)` };
        if (once && mb > A.bellekKat * once.mb && mb > 300) return { durum: 'uyari', ayrinti: `${mb} MB — 24 saatte ${(mb / once.mb).toFixed(1).replace('.', ',')} katı (${once.mb} MB)` };
        return { durum: 'tamam', ayrinti: `${mb} MB` };
      }
      case 'disk': {
        if (!yavas && this.sonuclar.disk) return null;   // saatte bir
        const d = c.disk ? c.disk() : null;
        if (!d || d.hata || !Number.isFinite(d.bosGB)) return { durum: 'bilinmiyor', ayrinti: (d && d.hata) || 'okunamadı' };
        const oran = d.toplamGB > 0 ? d.bosGB / d.toplamGB : null;
        const metin = `boş ${String(d.bosGB).replace('.', ',')} GB${oran != null ? ` (%${Math.round(oran * 100)})` : ''}`;
        // 69.4 disk sağlığı (saatlik bilgisayar ölçümünden): Healthy dışı → hata
        const dsk = ((this._bilgisayar && this._bilgisayar.diskler) || []).filter(x => x.saglik && x.saglik !== 'Healthy');
        if (dsk.length) return { durum: 'hata', ayrinti: `${metin} · DİSK SAĞLIĞI: ${dsk.map(x => `${x.ad} ${x.saglik}/${x.durum}`).join(', ')} — yedeğin taze olduğundan emin olun, diski değiştirmeyi planlayın` };
        const saglik = ((this._bilgisayar && this._bilgisayar.diskler) || []).length ? ` · disk sağlığı iyi (${this._bilgisayar.diskler.length})` : '';
        if (d.bosGB < A.diskGB || (oran != null && oran < A.diskOran)) return { durum: 'uyari', ayrinti: metin + saglik };
        return { durum: 'tamam', ayrinti: metin + saglik };
      }
      case 'saat':
      case 'internet':
      case 'fiyat': {
        const ag = this._agSonuc;
        if (!ag) return { durum: 'bilinmiyor', ayrinti: 'henüz ölçülmedi' };
        if (kimlik === 'internet') {
          if (!ag.binance && !ag.github) return { durum: 'uyari', ayrinti: `borsaya ve GitHub'a ulaşılamıyor${this.kayit.kesintiBas ? ` · ${dkMetin(simdi - this.kayit.kesintiBas)} süredir` : ''}` };
          if (!ag.binance) return { durum: 'uyari', ayrinti: 'borsaya ulaşılamıyor (GitHub açık)' };
          return { durum: 'tamam', ayrinti: `bağlı · borsa ${ag.gecikmeMs} ms` };
        }
        if (kimlik === 'saat') {
          if (!Number.isFinite(ag.saatFarkMs)) return { durum: 'bilinmiyor', ayrinti: 'borsa saati okunamadı' };
          const f = Math.abs(ag.saatFarkMs);
          const metin = `borsa saatiyle fark ${(ag.saatFarkMs / 1000).toFixed(1).replace('.', ',')} sn`;
          return f > A.saatFarkMs ? { durum: 'uyari', ayrinti: `${metin} — Ayarlar › Saat ve dil › "Saati şimdi eşitle"` } : { durum: 'tamam', ayrinti: metin };
        }
        // fiyat
        const f = ag.fiyat || {};
        if (!(f.binance > 0)) {
          const yas = this.kayit.fiyatSon ? simdi - this.kayit.fiyatSon : null;
          if (yas == null || yas >= A.fiyatTazeMs) return { durum: 'uyari', ayrinti: `borsa fiyatı ${yas == null ? 'okunamadı' : `${dkMetin(yas)} süredir okunamıyor`} — her yoklamada yeniden deneniyor` };
          return { durum: 'tamam', ayrinti: `son okuma ${dkMetin(yas)} önce` };
        }
        this.kayit.fiyatSon = simdi;
        if (f.ikinci > 0) {
          const sapma = Math.abs(f.binance / f.ikinci - 1);
          const metin = `BTC ${Math.round(f.binance).toLocaleString('tr-TR')} $ · ikinci kaynak (${f.ikinciAd}) farkı %${(sapma * 100).toFixed(2).replace('.', ',')}`;
          return sapma > A.fiyatSapma ? { durum: 'hata', ayrinti: metin, sapma } : { durum: 'tamam', ayrinti: metin, sapma };
        }
        return { durum: 'tamam', ayrinti: `BTC ${Math.round(f.binance).toLocaleString('tr-TR')} $ · ikinci kaynak okunamadı` };
      }
      case 'paket': {
        if (!c.npmAudit) return { durum: 'bilinmiyor', ayrinti: 'ölçülmüyor' };
        const son = this.kayit.paketSon;
        if (!son || simdi - son.zaman >= A.paketAralikMs) {
          let r; try { r = await c.npmAudit(); } catch (e) { r = { hata: e.message }; }
          this.kayit.paketSon = { zaman: simdi, ...r };
        }
        const p = this.kayit.paketSon;
        if (p.hata) return { durum: 'bilinmiyor', ayrinti: `npm audit yapılamadı: ${String(p.hata).slice(0, 100)}` };
        const v = p.acik || {};
        const metin = `kritik ${v.critical || 0} · yüksek ${v.high || 0} · orta ${v.moderate || 0}${(p.paketler || []).length ? ` (${p.paketler.slice(0, 4).join(', ')})` : ''} · ${dkMetin(simdi - p.zaman)} önce`;
        if (v.critical > 0) return { durum: 'hata', ayrinti: metin };
        if (v.high > 0) return { durum: 'uyari', ayrinti: metin };
        return { durum: 'tamam', ayrinti: metin };
      }
      case 'node': {
        const surum = (c.nodeSurum ? c.nodeSurum() : process.version) || '';
        const ana = +String(surum).replace(/^v/, '').split('.')[0];
        const bitis = NODE_OMUR[ana];
        if (!bitis) return { durum: 'tamam', ayrinti: `Node ${surum} (ömür sonu tablosunda yok)` };
        const kalan = Math.round((Date.parse(`${bitis}T00:00:00Z`) - simdi) / GUN);
        if (kalan < 0) return { durum: 'hata', ayrinti: `Node ${surum} desteği ${bitis}'te BİTTİ — güvenlik düzeltmesi gelmiyor` };
        if (kalan < A.nodeUyariGun) return { durum: 'uyari', ayrinti: `Node ${surum} desteği ${kalan} gün sonra bitiyor (${bitis}) — yeni LTS'e geçiş planlanmalı` };
        return { durum: 'tamam', ayrinti: `Node ${surum} · destek ${bitis}'e kadar` };
      }
      case 'sir': {
        const k = c.sirKasasi ? c.sirKasasi() : null;
        if (!k) return { durum: 'bilinmiyor', ayrinti: 'okunamadı' };
        if (k.kilitli) return { durum: 'hata', ayrinti: String(k.kilitli).slice(0, 200) };
        if (!k.var) return { durum: 'tamam', ayrinti: 'sır dosyası yok (anahtar girilmemiş)' };
        // 70.0: şifreleme yok (Kaspersky 2026-10-21/22) — koruma anahtarın kendisinde: çekim izni kapalı, canlıda IP kısıtı zorunlu.
        return { durum: 'tamam', ayrinti: 'anahtar dosyası okunuyor · koruma: çekim izni kapalı ve IP kısıtlı borsa anahtarı' };
      }
      case 'kilit': {
        const k = c.kilit ? c.kilit() : null;
        if (!k) return { durum: 'tamam', ayrinti: 'kilit yok' };
        if (k.yasiyor) return { durum: 'tamam', ayrinti: 'güncelleme sürüyor' };
        if (simdi - k.zaman < 30 * DK) return { durum: 'tamam', ayrinti: `kilit ${dkMetin(simdi - k.zaman)} önce alındı` };
        return { durum: 'uyari', ayrinti: `güncelleme kilidi ${dkMetin(simdi - k.zaman)} süredir duruyor, sahibi (pid ${k.pid || '?'}) çalışmıyor`, sahipsiz: true };
      }
      case 'dosya': {
        const ayarB = (c.ayarBozuk ? c.ayarBozuk() : []).filter(Boolean);
        const out = botSatir((b) => (b.bot.bozuk || /durum dosyası bozuk/.test(String(b.bot.durum.engel || ''))
          ? { durum: 'hata', ayrinti: 'durum dosyası bozuk açıldı — son sağlam kopyadan; bot borsayla karşılaştırılana kadar kapalı (ENGEL)' }
          : { durum: 'tamam', ayrinti: 'okunuyor' }));
        const bo = botOzet(out, 'okunuyor');
        if (ayarB.length) return { durum: 'hata', ayrinti: [...ayarB, ...(bo.durum !== 'tamam' ? [bo.ayrinti] : [])].join(' · '), botlar: out };
        return bo.durum === 'tamam' ? { durum: 'tamam', ayrinti: 'ayar ve bot dosyaları okunuyor', botlar: out } : bo;
      }
      case 'yedek': {
        if (!yavas && this.sonuclar.yedek) return null;
        const y = c.yedek ? c.yedek() : null;
        if (!y || !y.son) return { durum: 'uyari', ayrinti: 'henüz yedek alınmamış (Ayarlar › Yedek ve taşıma)' };
        const z = Date.parse(y.son.zaman);
        if (y.son.hata) return { durum: 'uyari', ayrinti: `son yedek başarısız: ${String(y.son.hata).slice(0, 120)}` };
        if (!Number.isFinite(z) || simdi - z > A.yedekSaat * SAAT) return { durum: 'uyari', ayrinti: `son yedek ${Number.isFinite(z) ? dkMetin(simdi - z) + ' önce' : 'okunamadı'}` };
        // 73.4: ileriye kayıt haftalık artımlı yedeği (scripts/yedek.js yazar; alan yoksa henüz çalışmadı — sessiz)
        const ik = y.ileriyeKayit;
        if (ik && ik.hata) return { durum: 'uyari', ayrinti: `günlük yedek tamam; ileriye kayıt haftalık yedeği başarısız: ${String(ik.hata).slice(0, 120)}` };
        const zi = ik ? Date.parse(ik.zaman) : NaN;
        if (ik && (!Number.isFinite(zi) || simdi - zi > A.ileriYedekGun * 24 * SAAT)) return { durum: 'uyari', ayrinti: `günlük yedek tamam; ileriye kayıt haftalık yedeği ${Number.isFinite(zi) ? dkMetin(simdi - zi) + ' önce' : 'okunamadı'} (haftada bir beklenir)` };
        return { durum: 'tamam', ayrinti: `son yedek ${dkMetin(simdi - z)} önce · ${y.son.dosya || '?'} dosya${ik ? ` · ileriye kayıt ${dkMetin(simdi - zi)} önce (${ik.dosya != null ? ik.dosya : '?'} dosya, ${((ik.toplamBayt || 0) / 1e6).toFixed(0)} MB)` : ''}` };
      }
      case 'uzak': {
        if (!yavas && this.sonuclar.uzak) return null;
        const y = c.yedek ? c.yedek() : null;
        const u = y && y.uzak;
        if (!u || !u.depo) return { durum: 'uyari', ayrinti: 'kurulmamış — sunucu çalınır / yanar / diski bozulursa yerel kopyalar da gider (Kılavuz › Yedek ve taşıma › Şifreli uzak yedek)' };
        if (!u.son) return { durum: 'uyari', ayrinti: `${u.depo} · henüz gönderilmedi (npm run uzak-yedek -- --simdi)` };
        const z = Date.parse(u.son.zaman);
        if (!u.son.ok) return { durum: 'uyari', ayrinti: `son gönderim başarısız: ${String(u.son.hata || '').slice(0, 140)}` };
        if (!Number.isFinite(z) || simdi - z > A.yedekSaat * SAAT) return { durum: 'uyari', ayrinti: `son gönderim ${Number.isFinite(z) ? dkMetin(simdi - z) + ' önce' : 'okunamadı'}` };
        if (u.sonBakim && !u.sonBakim.ok) return { durum: 'uyari', ayrinti: `haftalık bakım (forget/check) başarısız: ${String(u.sonBakim.hata || '').slice(0, 120)}` };
        return { durum: 'tamam', ayrinti: `${u.depo} · son gönderim ${dkMetin(simdi - z)} önce${u.son.snapshot ? ` (${u.son.snapshot})` : ''}` };
      }
      case 'kopya': {
        // 4. faz (4a): eşlenmiş sunucuların saat başı kopyası (lib/makine/kopya.js denetimSonucu); ctx.kopya yoksa (eski kurulum / öz test) eş yok sayılır
        const k = c.kopya ? c.kopya() : null;
        if (!k) return { durum: 'tamam', ayrinti: 'eşlenmiş sunucu yok — kopya gerekmez' };
        return { durum: k.durum, ayrinti: k.ayrinti };
      }
      case 'guncel': {
        const g = c.guncelleme ? c.guncelleme() : null;
        if (!g) return { durum: 'bilinmiyor', ayrinti: 'okunamadı' };
        if (g.yarida) return { durum: 'uyari', ayrinti: 'son güncelleme yarıda kaldı (güncelleyici süreç kapandı) — Ayarlar › Güncelleme › "Şimdi kontrol et" yeniden dener' };
        if (g.durum === 'geri-alindi') return { durum: 'uyari', ayrinti: `son kurulum geri alındı: ${String(g.mesaj || '').slice(0, 140)}` };
        // 69.6: imzasız kod geldi (kurulmadı) ya da imza doğrulaması kurulmamış (geçiş dönemi).
        if (g.imza === 'gecersiz' || g.imza === 'hata') return { durum: 'hata', ayrinti: `gelen kod imza doğrulamasından geçmedi — kurulmadı: ${String(g.mesaj || '').slice(0, 160)}` };
        if (g.imza === 'kurulmadi' && g.durum !== 'gelistirme') return { durum: 'uyari', ayrinti: `kod imza doğrulaması kurulmamış — güncellemeler imzasız da kurulur. Kurulum: Kılavuz › Güncelleme (npm run imza-kur) · ${g.durum || '—'} · ${g.calisan || '?'}` };
        return { durum: 'tamam', ayrinti: `${g.durum || '—'} · çalışan sürüm ${g.calisan || '?'}${g.commit ? ` (${g.commit})` : ''}${g.ayarIzi ? ` · ayar izi ${g.ayarIzi}` : ''}` };
      }
      case 'baglanti': {
        const out = botSatir((b) => {
          if (!b.y || !b.y.borsa) return { durum: 'hata', ayrinti: 'borsaya bağlı değil — bağlantı yeniden deneniyor' };
          if (b.y.durum === 'DURDURULDU') {
            const kendi = b.y.durmaTuru === 'GERI_CEKILME' || b.y.durmaTuru === 'BELIRSIZ';
            return { durum: kendi ? 'uyari' : 'hata', ayrinti: `yürütücü durdu [${b.y.durmaTuru || '?'}]${kendi ? ' — süre bitince kendisi açılır' : ' — elle müdahale gerekir'}` };
          }
          return { durum: 'tamam', ayrinti: 'bağlı' };
        });
        return botOzet(out);
      }
      case 'mutabakat': {
        const out = botSatir((b) => {
          const e = b.bot.durum.engel || (b.bot.kol && b.bot.kol.durum && b.bot.kol.durum.engel);
          if (e) return { durum: 'hata', ayrinti: `TAMAMEN KAPALI (ENGEL): ${String(e).slice(0, 160)}`, engel: true };
          return { durum: 'tamam', ayrinti: 'kayıt borsayla uyuşuyor' };
        });
        return botOzet(out);
      }
      case 'stop': {
        const out = botSatir((b) => {
          const k = b.bot.koruma;
          if (!k || typeof k.aktif !== 'function' || !k.aktif()) return { durum: 'tamam', ayrinti: 'felaket stopu kapalı' };
          const sd = k.durum && k.durum.sonDenetim;
          const hatalar = (sd && sd.hatalar) || [];
          const kayit = this.kayit.stopHata[b.ad] || { zaman: null, ardisik: 0 };
          if (sd && sd.zaman !== kayit.zaman) this.kayit.stopHata[b.ad] = { zaman: sd.zaman, ardisik: hatalar.length ? kayit.ardisik + 1 : 0 };
          const ardisik = (this.kayit.stopHata[b.ad] || kayit).ardisik;
          const n = Object.keys((k.durum && k.durum.stoplar) || {}).length;
          const vurusL = ((k.durum && k.durum.olaylar) || []).filter(o => o.tur === 'tetiklendi' && simdi - o.zaman < A.stopVurusPencereMs);
          const vurus = vurusL.length;
          const sonVurus = vurusL.length ? Math.max(...vurusL.map(o => +o.zaman).filter(Number.isFinite)) : null;
          if (!hatalar.length && vurus >= A.stopVurusEsik) return { durum: 'uyari', ayrinti: `24 saatte ${vurus} felaket stopu tetiklendi — yeni işlem açılmıyor`, ardisik, vurus, sonVurus };
          if (hatalar.length) return { durum: ardisik >= A.stopHataArdisik ? 'hata' : 'uyari', ayrinti: `stop kurulamadı (${ardisik}. denetim): ${hatalar.slice(0, 2).map(String).join(' · ').slice(0, 160)}`, ardisik };
          return { durum: 'tamam', ayrinti: n ? `${n} pozisyonun stopu borsada` : 'pozisyon yok', vurus };
        });
        return botOzet(out);
      }
      case 'marj': {
        const out = botSatir((b) => {
          const m = b.bot.durum.sonMarj;
          if (!m) return { durum: 'bilinmiyor', ayrinti: 'henüz ölçülmedi' };
          if (m.hata) return { durum: 'uyari', ayrinti: `okunamadı: ${String(m.hata).slice(0, 100)}` };
          const oran = Number.isFinite(m.oran) ? `marj oranı %${(m.oran * 100).toFixed(1).replace('.', ',')}` : 'marj';
          if (m.seviye === 'alarm') return { durum: 'hata', ayrinti: `${oran} · ${(m.uyarilar || []).join(' · ')}` };
          if (m.seviye === 'uyari') return { durum: 'uyari', ayrinti: `${oran} · ${(m.uyarilar || []).join(' · ')}` };
          return { durum: 'tamam', ayrinti: oran };
        });
        return botOzet(out);
      }
      case 'tekrar': {
        const out = botSatir((b) => {
          const t = this._tekrarlayan(b.ad, simdi);
          const retler = (this.emirRetler[b.ad] || []).filter(x => simdi - x.zaman < A.tekrarPencereMs);
          const ret = retler.length;
          if (ret >= A.emirRetEsik) return { durum: 'hata', ayrinti: `borsa emirleri 30 dk'da ${ret} kez reddetti (${H.retOzeti(retler).metin.slice(0, 120)})`, emirRet: ret, retler };
          if (t.length) return { durum: 'uyari', ayrinti: `aynı hata 30 dk'da ${t[0].adet} kez: ${t[0].ornek.slice(0, 130)}`, tekrar: t[0] };
          const gk = b.bot.durum.guvenliKip;
          if (gk) return { durum: 'uyari', ayrinti: `güvenli kipte: ${String(gk.metin || '').slice(0, 120)}` };
          return { durum: 'tamam', ayrinti: 'tekrarlayan hata yok' };
        });
        return botOzet(out);
      }
      case 'kacan': {
        const out = botSatir((b) => {
          if (!b.y || !b.y.borsa) return { durum: 'tamam', ayrinti: 'borsaya bağlı değil (bağlantı denetimine bakın)' };
          const gunIci = simdi % GUN;
          const dun = utcGun(simdi - GUN);
          if (gunIci < (2 + A.kacanDk) * DK || b.bot.durum.sonGun === dun) return { durum: 'tamam', ayrinti: `son günlük çalışma ${b.bot.durum.sonGun || '—'}` };
          const k = typeof c.kalp === 'function' ? c.kalp(b) : null;
          const neden = b.bot.durum.engel ? 'bot ENGELLİ' : b.bot.durum.guvenliKip ? 'bot güvenli kipte' : k && k.hata ? String(k.hata).slice(0, 120) : 'nedeni günlükte';
          return { durum: 'uyari', ayrinti: `bugünkü çalışma 03:02'de yapılmadı — ${neden}` };
        });
        return botOzet(out);
      }
      case 'telegram': {
        const t = c.telegram ? c.telegram() : null;
        if (!t) return { durum: 'bilinmiyor', ayrinti: 'okunamadı' };
        if (!t.bagli) return { durum: 'uyari', ayrinti: t.neden || 'Telegram bağlı değil' };
        const son = (t.gecmis || []).filter(x => !x.atlandi && !x.kisitlandi).slice(-1)[0];
        if (son && son.ok === false) return { durum: 'hata', ayrinti: `son gönderim başarısız: ${String(son.hata || '').slice(0, 100)}${t.kuyruk ? ` · ${t.kuyruk} ileti bekliyor` : ''}` };
        if (t.kuyruk) return { durum: 'uyari', ayrinti: `${t.kuyruk} ileti giden kutusunda bekliyor` };
        // 73.6 (S05): komut yoklaması (getUpdates) hata veriyorsa "tamam" denmez — 409 = başka bilgisayar/program aynı botu yokluyor.
        const ky = t.komut && t.komut.calisiyor && t.komut.sonHata ? t.komut.sonHata : null;
        if (ky) return { durum: 'uyari', ayrinti: `gönderim çalışıyor ama komutlara cevap verilemiyor: ${komutHataMetni(ky.metin)}` };
        return { durum: 'tamam', ayrinti: son ? `son gönderim ${dkMetin(simdi - son.zaman)} önce` : 'bağlı' };
      }
      case 'sinyal': {
        const s = c.sinyal ? c.sinyal() : null;
        if (!s) return { durum: 'bilinmiyor', ayrinti: 'okunamadı' };
        const l = [];
        let d = 'tamam';
        for (const x of s) {
          // 73.6 (S21): SUNUCU sinyali adresi yoksa "tamam" denmez — ölü adam anahtarı kurulmamış (sunucu sessizce kapanırsa uyaran yok).
          if (!x.ayarli) { if (x.sunucu) { d = enKotu([d, 'uyari']); l.push(`${x.ad}: adres yok — sunucu kapanırsa sizi uyaracak dış sinyal kurulmamış (Kılavuz › Kurulum › Sağlık sinyali)`); } else l.push(`${x.ad}: adres yok`); continue; }
          if (x.son && x.son.ok === false) { d = enKotu([d, 'uyari']); l.push(`${x.ad}: son ping başarısız`); continue; }
          if (x.sunucu && x.sonBasari && simdi - x.sonBasari > A.sinyalSaat * SAAT) { d = enKotu([d, 'uyari']); l.push(`${x.ad}: son ping ${dkMetin(simdi - x.sonBasari)} önce`); continue; }
          l.push(`${x.ad}: ${x.sonBasari ? `son ping ${dkMetin(simdi - x.sonBasari)} önce` : 'henüz ping yok'}`);
        }
        const ik = this._ikinciSinyal;
        if (ik && !ik.atlandi) { if (ik.ok) l.push('ikinci ölü adam: tamam'); else { d = enKotu([d, 'uyari']); l.push(`ikinci ölü adam ping'i başarısız: ${String(ik.hata || '').slice(0, 60)}`); } }
        return { durum: d, ayrinti: l.join(' · ') || 'ayarlı sinyal yok' };
      }
      case 'wyb':
      case 'uyku': {
        const p = this._bilgisayar;
        if (!p) return { durum: 'bilinmiyor', ayrinti: 'henüz ölçülmedi (saatte bir)' };
        if (p.desteklenmiyor) return { durum: 'tamam', ayrinti: `${p.platform}: Windows denetimi uygulanmaz` };
        if (p.hata) return { durum: 'bilinmiyor', ayrinti: `ölçülemedi: ${String(p.hata).slice(0, 100)}` };
        const SB = require('./sunucuBilgisayari');
        if (kimlik === 'wyb') {
          const e = p.etkin;
          const kapsar = e ? SB.etkinSaatte(e.bas, e.bit, 3) : null;
          const es = e ? `etkin saatler ${String(e.bas).padStart(2, '0')}:00–${String(e.bit).padStart(2, '0')}:00${e.ilke ? ' (ilkeyle sabit)' : ''}` : 'etkin saatler okunamadı';
          if (p.yenidenBaslatma && p.yenidenBaslatma.bekliyor) {
            if (kapsar === false) return { durum: 'uyari', ayrinti: `Windows yeniden başlatma bekliyor (${p.yenidenBaslatma.kaynak.join(', ')}); ${es} — 03:02 bunun dışında, Windows gece yeniden başlatabilir. Gündüz elle yeniden başlatın; kalıcı çözüm: sunucuda yönetici PowerShell ile scripts\\windows-etkin-saat.ps1 (etkin saatleri 21:00–15:00 sabitler).` };
            return { durum: 'uyari', ayrinti: `Windows yeniden başlatma bekliyor (${p.yenidenBaslatma.kaynak.join(', ')}); ${es} (03:02 korunuyor) — uygun bir gündüz saatinde elle yeniden başlatın.` };
          }
          return { durum: 'tamam', ayrinti: `bekleyen yeniden başlatma yok · ${es}${kapsar === false ? ' (03:02 dışında — güncelleme gelirse gece yeniden başlatabilir; scripts\\windows-etkin-saat.ps1 ile sabitleyin)' : ''}` };
        }
        if (kimlik === 'uyku') {
          const u = p.uyku && p.uyku.ac, h = p.hazirda && p.hazirda.ac;
          if (u == null && h == null) return { durum: 'bilinmiyor', ayrinti: 'güç ayarı okunamadı' };
          const l = [];
          if (u > 0) l.push(`${Math.round(u / 60)} dk boşta kalınca uyuyor`);
          if (h > 0) l.push(`${Math.round(h / 60)} dk sonra hazırda bekliyor`);
          if (l.length) return { durum: 'uyari', ayrinti: `prize takılıyken ${l.join(', ')} — uyuyan bilgisayarda Pusula çalışmaz. Denetim Masası › Güç Seçenekleri › "Asla".` };
          return { durum: 'tamam', ayrinti: 'prize takılıyken uyku ve hazırda bekleme kapalı' };
        }
      }
      case 'zorla': {
        const out = {};
        for (const b of botlar) {
          const ad = { ad: b.adGorunen, mod: b.mod };
          if (!b.y || !b.y.borsa || typeof b.bot.zorlaKapananlar !== 'function') { out[b.ad] = { ...ad, durum: 'tamam', ayrinti: 'borsaya bağlı değil' }; continue; }
          let l;
          try { l = await b.bot.zorlaKapananlar(simdi - A.zorlaPencereMs); } catch (e) { out[b.ad] = { ...ad, durum: 'bilinmiyor', ayrinti: `okunamadı: ${String(e.message).slice(0, 80)}` }; continue; }
          if (l == null) { out[b.ad] = { ...ad, durum: 'tamam', ayrinti: 'kâğıt hesap (zorla kapanma yok)' }; continue; }
          if (!l.length) { out[b.ad] = { ...ad, durum: 'tamam', ayrinti: 'son 24 saatte zorla kapanan pozisyon yok' }; continue; }
          const yeni = l.filter(x => !(this.kayit.zorlaBilinen || []).includes(`${b.ad}:${x.id}`));
          out[b.ad] = { ...ad, durum: 'hata', ayrinti: l.slice(0, 3).map(x => `${x.tur === 'ADL' ? 'ADL' : 'LİKİDASYON'}: ${x.symbol} ${x.side} ${x.miktar} @ ${x.fiyat}`).join(' · '), yeniZorla: yeni };
        }
        return botOzet(out);
      }
      case 'sapma': {
        const out = botSatir((b) => {
          const f = (b.bot.durum.golgeFarklar || []).filter(x => Number.isFinite(x.fark) && x.gun > 0);
          if (f.length < 3) return { durum: 'tamam', ayrinti: `gölge karşılaştırması ${f.length} aralık — erken` };
          // Aralık farkı gün başına dağıtılır (kaçırılan günler tek aralıkta gelir).
          const x = f.flatMap(a => Array(a.gun).fill(a.fark / a.gun));
          const c = istatistik.cusum(x, { hedef: 0, k: A.sapmaK, h: A.sapmaH });
          const p = (v) => `${(v * 100).toFixed(2).replace('.', ',')} puan`;
          if (c.alarm) return { durum: 'uyari', ayrinti: `gerçekleşen gölgeden kalıcı olarak ${c.alarm === 'ust' ? 'İYİ' : 'KÖTÜ'} (CUSUM ${p(Math.max(c.ust, c.alt))}, ${x.length} gün)`, cusum: { ust: c.ust, alt: c.alt } };
          return { durum: 'tamam', ayrinti: `${x.length} gün · CUSUM +${p(c.ust)} / −${p(c.alt)}`, cusum: { ust: c.ust, alt: c.alt } };
        });
        return botOzet(out);
      }
      case 'toplamRisk': {
        // A3 (lib/toplamRisk.js): yalnız haber — kapı yürütücüde (sınır kipinde); öz denetim hiçbir şey koymaz.
        const t = c.toplamRisk ? c.toplamRisk() : null;
        if (!t) return { durum: 'bilinmiyor', ayrinti: 'ölçülmüyor' };
        if (!t.calisiyor) return { durum: 'tamam', ayrinti: 'geliştirme kopyası — ölçüm sunucuda' };
        if (!t.son) return { durum: 'bilinmiyor', ayrinti: 'henüz ölçülmedi (açılıştan 2 dk sonra, sonra saatte bir)' };
        const kip = t.kip === 'sinir' ? 'sınır kipi' : 'izleme kipi — emir engellenmez';
        const sorun = [...(t.asim || []).map(a => a.metin), ...(t.esUyarilari || [])];
        if (t.esikBozuk) sorun.unshift('sınır kipi istendi ama onaylı eşik okunamadı — izleme kipinde çalışıyor');
        if (sorun.length) return { durum: 'uyari', ayrinti: `${sorun.slice(0, 3).join(' · ').slice(0, 300)} (${kip})`, asim: (t.asim || []).length };
        const om = (t.olculemeyen || []).length ? ` · ölçülemeyen ${t.olculemeyen.length} bot (${t.olculemeyen.map(x => x.kimlik).join(', ').slice(0, 80)})` : '';
        return { durum: 'tamam', ayrinti: `eşikler aşılmadı (${kip})${om}` };
      }
      case 'maliyet': {
        const out = botSatir((b) => {
          const y = b.bot.y;
          if (!y || !y.defter || (y.borsa && y.borsa.kagit)) return { durum: 'tamam', ayrinti: 'kâğıt hesap — ölçülmez' };
          const l = y.defter.sonEmirler(2000).filter(e => e.type === 'market' && +e.dolan > 0 && +e.ortFiyat > 0 && +e.refMark > 0 && simdi - (e.olusturma || 0) < A.maliyetPencereMs);
          if (!l.length) return { durum: 'tamam', ayrinti: 'son 30 günde piyasa dolumu yok' };
          let w = 0, t = 0;
          for (const e of l) { const n = +e.dolan * +e.ortFiyat; const k = (e.side === 'buy' ? 1 : -1) * (+e.ortFiyat - +e.refMark) / +e.refMark * 1e4; w += n; t += n * k; }
          const kayma = t / w, toplam = kayma + 5;   // taker ücreti 5 bp (VIP0); gerçek ücret demo kabul U5'te ölçülür
          const m = `${l.length} dolum · kayma ${kayma.toFixed(1).replace('.', ',')} bp + ücret 5 bp = ${toplam.toFixed(1).replace('.', ',')} bp (varsayım ${A.maliyetVarsayim})`;
          if (l.length >= A.maliyetEnAz && toplam > A.maliyetVarsayim * A.maliyetKat) return { durum: 'uyari', ayrinti: `${m} — backtest maliyeti az tahmin ediyor`, bp: toplam };
          return { durum: 'tamam', ayrinti: m, bp: toplam };
        });
        return botOzet(out);
      }
      case 'funding': {
        const fr = this._funding;
        if (!fr) return { durum: 'bilinmiyor', ayrinti: 'henüz okunmadı (saatte bir)' };
        if (fr.hata) return { durum: 'bilinmiyor', ayrinti: `okunamadı: ${String(fr.hata).slice(0, 100)}` };
        const out = botSatir((b) => {
          const s = new Set(Object.keys((b.bot.koruma && b.bot.koruma.durum && b.bot.koruma.durum.stoplar) || {}));
          if (b.bot.ayar && b.bot.ayar.btcAyak === 'perp' && b.bot.btcSembol) s.add(b.bot.btcSembol);
          // A2 parça 2: botun bağdaştırıcısı kendi funding oranlarını veriyorsa (OKX demo — bindirmeBot.fundingOranlari) onlar; yoksa genel okuma (Binance, birebir)
          const fb = (this._fundingBorsa && this._fundingBorsa[b.ad]) || fr;
          const l = [...s].map(x => { const k = String(x).split(':')[0].replace('/', ''); return { s: k, r: fb.oranlar ? fb.oranlar[k] : undefined }; }).filter(x => Number.isFinite(x.r)).sort((a, c) => Math.abs(c.r) - Math.abs(a.r));
          if (!l.length) return { durum: 'tamam', ayrinti: 'açık pozisyon yok' };
          const y = (r) => `%${(r * 100).toFixed(3).replace('.', ',')}`;
          const en = l[0];
          if (Math.abs(en.r) >= A.fundingHata) return { durum: 'hata', ayrinti: `${en.s} funding ${y(en.r)} / 8 sa (yıllık ≈ %${Math.round(Math.abs(en.r) * 3 * 365 * 100)}) — aşırı kalabalık pozisyon` };
          if (Math.abs(en.r) >= A.fundingUyari) return { durum: 'uyari', ayrinti: `${en.s} funding ${y(en.r)} / 8 sa (yıllık ≈ %${Math.round(Math.abs(en.r) * 3 * 365 * 100)})` };
          return { durum: 'tamam', ayrinti: `${l.length} sembol · en yüksek ${en.s} ${y(en.r)} / 8 sa` };
        });
        return botOzet(out, 'açık pozisyon yok');
      }
      case 'veri': {
        // 74.3 D4 (lib/live/veriKalitesi.js): botun kendi kapısının son çalışma kaydı — öz denetim burada hiçbir şey KOYMAZ / KALDIRMAZ
        // (güvenli kipi bot koyar ve kaldırır). Sarı = hafif bulgu (tek bilgi), kırmızı = ağır bulgu ya da veri güvenli kipi.
        const out = botSatir((b) => {
          const vk = b.bot.ayar && b.bot.ayar.veriKalitesi;
          if (!vk || typeof vk.durum !== 'function') return { durum: 'tamam', ayrinti: 'veri kalitesi kapısı bağlı değil' };
          const d = vk.durum({ mod: b.mod });
          const gk = b.bot.durum.guvenliKip;
          const kipNot = d.dokunulmaz ? 'demo kabul — yalnız haber' : d.etkin ? 'etkin kip' : 'izleme kipi — karar engellenmedi';
          if (gk && gk.kaynak === 'veri') return { durum: 'hata', ayrinti: `güvenli kipte (veri temizlenince kendiliğinden çıkar): ${String(gk.metin).replace(/^veri kalitesi: /, '').slice(0, 200)}`, gk: true };
          if (d.acik) return { durum: d.acik.agirlik === 'agir' ? 'hata' : 'uyari', ayrinti: `${d.acik.agirlik === 'agir' ? 'AĞIR' : 'hafif'} bulgu (${kipNot}): ${String(d.acik.metin).slice(0, 220)}`, agirlik: d.acik.agirlik };
          const s = d.sayac30 || {};
          return { durum: 'tamam', ayrinti: d.son ? `son çalışma temiz · 30 gün: ${s.calisma || 0} çalışma, ${s.hafif || 0} hafif, ${s.agir || 0} ağır (${d.kip === 'etkin' ? 'etkin' : 'izleme'} kipi)` : `henüz günlük çalışma kaydı yok (${d.kip === 'etkin' ? 'etkin' : 'izleme'} kipi)` };
        });
        return botOzet(out);
      }
      case 'bakim': {
        const t = this._takvim;
        if (!t) return { durum: 'bilinmiyor', ayrinti: 'henüz okunmadı (saatte bir)' };
        if (t.hata) return { durum: 'bilinmiyor', ayrinti: `duyurular okunamadı: ${String(t.hata).slice(0, 100)}` };
        if (t.sistem && t.sistem.status === 1) return { durum: 'hata', ayrinti: 'Binance sistem durumu: BAKIMDA', aktif: { baslik: 'Binance sistem durumu: bakım', bit: null } };
        const l = (t.bakimlar || []).filter(x => Number.isFinite(x.bas));
        const aktif = l.find(x => simdi >= x.bas - A.bakimOnceMs && simdi <= x.bit + A.bakimSonraMs);
        const tr = (ms) => new Date(ms + TR).toISOString().slice(5, 16).replace('T', ' ').replace('-', '.');
        if (aktif) return { durum: 'uyari', ayrinti: `bakım sürüyor: ${aktif.baslik.slice(0, 100)} (${tr(aktif.bas)}–${tr(aktif.bit).slice(6)} TR)`, aktif };
        const yakin = l.filter(x => x.bas > simdi && x.bas - simdi <= A.bakimUyariMs).sort((a, b) => a.bas - b.bas)[0];
        if (yakin) {
          const gunluk = (() => { for (let g = Math.floor(yakin.bas / GUN) * GUN; g <= yakin.bit; g += GUN) { const c = g + 2 * DK; if (c >= yakin.bas - A.bakimOnceMs && c <= yakin.bit + A.bakimSonraMs) return true; } return false; })();
          return { durum: gunluk ? 'uyari' : 'tamam', ayrinti: `yaklaşan bakım ${tr(yakin.bas)}–${tr(yakin.bit).slice(6)} TR: ${yakin.baslik.slice(0, 90)}${gunluk ? ' — 03:02 çalışmasıyla çakışıyor; o sırada botlar güvenli kipte olacak' : ''}`, yakin };
        }
        const cozulmeyen = (t.bakimlar || []).filter(x => !Number.isFinite(x.bas));
        return { durum: 'tamam', ayrinti: `sistem normal${cozulmeyen.length ? ` · saat aralığı okunamayan ${cozulmeyen.length} bakım duyurusu: ${cozulmeyen[0].baslik.slice(0, 70)}` : ' · yaklaşan vadeli işlem bakımı yok'}` };
      }
      case 'yetki': {
        // C5: borsa anahtarlarının izinleri — SALT OKUMA (lib/anahtarlar.js yetkiDenetimi → anahtarSinama). Yalnız haber; hiçbir bota dokunmaz.
        if (!c.anahtarYetki) return { durum: 'bilinmiyor', ayrinti: 'ölçülmüyor' };
        let l;
        try { l = await c.anahtarYetki({ tazeMs: A.yetkiTazeMs }); } catch (e) { return { durum: 'bilinmiyor', ayrinti: `izinler okunamadı: ${String(e.message || e).slice(0, 100)}` }; }
        return yetkiDegerlendir(l, simdi);
      }
      case 'kayitci': {
        // 73.3 ileriye kayıt (lib/ileriKayit): yalnız haber — kaçan kayıt geriye doldurulamaz; botlar etkilenmez.
        const k = c.kayitci ? c.kayitci() : null;
        if (!k) return { durum: 'bilinmiyor', ayrinti: 'ölçülmüyor' };
        if (!k.calisiyor) return { durum: 'tamam', ayrinti: k.neden || 'kayıtçılar kapalı' };
        const gec = k.gecikenler || [];
        if (gec.length) {
          const metin = gec.map(g => `${g.kisaAd}: ${g.saat != null ? `${String(g.saat).replace('.', ',')} saattir yazmıyor` : 'henüz hiç yazmadı'}${g.hata ? ` (${String(g.hata).slice(0, 80)})` : ''}`).join(' · ');
          return { durum: 'uyari', ayrinti: `${metin} — Veri › İleriye kayıt` };
        }
        const h = (k.hatali || []).length ? ` · son denemede hata: ${k.hatali.map(x => x.kisaAd).join(', ')} (yeniden denenecek)` : '';
        return { durum: 'tamam', ayrinti: `${k.toplam} kayıtçı yazıyor${h}` };
      }
      case 'delist': {
        const t = this._takvim;
        if (!t) return { durum: 'bilinmiyor', ayrinti: 'henüz okunmadı (saatte bir)' };
        if (t.hata) return { durum: 'bilinmiyor', ayrinti: `duyurular okunamadı: ${String(t.hata).slice(0, 100)}` };
        const BT = require('./borsaTakvimi');
        const out = botSatir((b) => {
          let s = [];
          try { s = b.bot.kol && b.bot.kol.evren && typeof b.bot.kol.evren.semboller === 'function' ? b.bot.kol.evren.semboller() : []; } catch { s = []; }
          if (b.bot.btcSembol) s = [...s, b.bot.btcSembol];
          const e = BT.delistEslestir(t.delistler, s);
          if (e.length) return { durum: 'uyari', ayrinti: e.map(x => `${x.sembol} ${x.tur === 'vadeli' ? 'vadeli sözleşmesi' : 'spot listesi'} ${x.tarih || ''} kapanıyor`).join(' · ') };
          return { durum: 'tamam', ayrinti: `evrendeki ${s.length} sembolde delist yok` };
        });
        const o = botOzet(out);
        if (o.durum === 'tamam') o.ayrinti = `son 30 günde ${(t.delistler || []).length} delist duyurusu; botların evreninde yok`;
        return o;
      }
      default: return { durum: 'bilinmiyor', ayrinti: 'tanımsız denetim' };
    }
  }

  /** 69.2 saatlik ölçümler: sunucu bilgisayarı + borsa duyuruları (hata yutulur; denetim 'bilinmiyor' der). */
  async _yavasOlc() {
    if (this.ctx.bilgisayar) { try { this._bilgisayar = await this.ctx.bilgisayar(); } catch (e) { this._bilgisayar = { hata: e.message }; } }
    if (this.ctx.borsaTakvimi) { try { this._takvim = await this.ctx.borsaTakvimi(); } catch (e) { this._takvim = { hata: e.message }; } }
    if (this.ctx.funding) { try { this._funding = await this.ctx.funding(); } catch (e) { this._funding = { hata: e.message }; } }
    // A2 parça 2: Binance dışı bağdaştırıcıya bağlı botların funding oranı o borsadan (yalnız fundingOranlari tanımlayan bot; Binance botunda istek yok)
    const fb = {};
    for (const b of this._botlar()) {
      if (!b.bot || typeof b.bot.fundingOranlari !== 'function' || !b.y || !b.y.borsa || b.y.borsa.kagit || !b.y.bd || b.y.bd.kimlik === 'binance') continue;
      try { const r = await b.bot.fundingOranlari(); if (r && r.oranlar) fb[b.ad] = r; } catch { /* genel okumaya düşer */ }
    }
    this._fundingBorsa = fb;
  }

  /** Ağ ölçümü (internet, saat, fiyat) — tek seferde. */
  async _agOlc(simdi) {
    const c = this.ctx;
    let r = { binance: false, github: false, saatFarkMs: null, gecikmeMs: null, fiyat: {} };
    try { r = { ...r, ...((c.ag && await c.ag()) || {}) }; } catch { /* hepsi false */ }
    const kopuk = !r.binance && !r.github;
    if (kopuk && !this.kayit.kesintiBas) this.kayit.kesintiBas = simdi;
    else if (!kopuk && this.kayit.kesintiBas) {
      const sure = simdi - this.kayit.kesintiBas;
      this.kayit.kesintiBas = null;
      this._olay({ kimlik: 'internet', tur: 'duzeldi', metin: `internet kesintisi ${dkMetin(sure)} sürdü` });
      const gb = this.kayit.geciciBildirilen || {};
      if (sure >= 10 * DK || gb.internet) this._bildir('bilgi', 'internet geri geldi', [`Kesinti ${dkMetin(sure)} sürdü.`]);
      if (gb.internet) delete gb.internet;
    }
    this._agSonuc = r;
    return r;
  }

  /** Onarım ve koru kademesi eylemleri — sonuca `onarim` ekler. */
  async _eylem(tanim, s, simdi) {
    const c = this.ctx;
    const A = this.ayar;
    const k = tanim.kimlik;
    const onar = async (metin, fn) => {
      if (!this._onarimHakki(k, simdi)) { s.onarim = { zaman: simdi, basari: false, metin: `günlük onarım sınırı (${A.onarimGunluk}) doldu — size bırakıldı` }; return false; }
      this._onarimSay(k, simdi);
      let ok = false, hata = null;
      try { ok = (await fn()) !== false; } catch (e) { hata = e.message; }
      s.onarim = { zaman: simdi, basari: ok, metin: ok ? metin : `${metin} — olmadı${hata ? `: ${hata}` : ''}` };
      this._olay({ kimlik: k, tur: ok ? 'onarildi' : 'onarilamadi', metin: s.onarim.metin });
      this.kaydet(ok ? 'INFO' : 'WARN', `${tanim.ad}: ${s.onarim.metin}`);
      return ok;
    };
    const botlar = this._botlar();
    const bul = (ad) => botlar.find(b => b.ad === ad);

    if (k === 'kilit' && s.sahipsiz && c.kilitSil) await onar('sahipsiz güncelleme kilidi silindi', () => c.kilitSil());
    else if (k === 'disk' && s.durum === 'uyari') await onar(`${A.gunlukSikistirGun} günden eski günlükler sıkıştırıldı`, () => {
      const n = this.gunlukSikistir();
      if (!n.adet) throw new Error('sıkıştırılacak eski günlük yok');
      return true;
    });
    else if (k === 'bellek' && s.durum === 'uyari' && c.yenidenBaslat) {
      if (simdi - this.acilis < A.ilkBeklemeMs) s.ayrinti += ' · yeni açıldı, bekleniyor';
      else if (!sessizSaat(simdi, this._mesgulMu())) s.ayrinti += ' · sessiz saatte yeniden başlatılacak';
      else await onar('sessiz saatte Pusula yeniden başlatıldı', () => c.yenidenBaslat(`öz denetim: bellek ${s.ayrinti}`));
    } else if (k === 'donma') {
      for (const [ad, x] of Object.entries(s.botlar || {})) {
        const b = bul(ad);
        if (!b) continue;
        if (x.cokme) {
          if (this._tamKapanma(b, 'cokme', `bot döngüsü 30 dk'da ${x.cokme.length} kez hata verdi (son: ${String(x.cokme[x.cokme.length - 1].metin).slice(0, 120)})`, x.cokme)) x.ayrinti += ' → TAMAMEN KAPANDI';
          else if (this.dokunulmaz(b)) x.ayrinti += ' · demo kabul süresince yalnız haber';
        } else if (x.takildi) {
          if (this.dokunulmaz(b)) { x.ayrinti += ' · demo kabul süresince yalnız haber'; continue; }
          if (!c.yenidenBaslat) continue;
          if (simdi - this.acilis < A.ilkBeklemeMs) { x.ayrinti += ' · yeni açıldı, bekleniyor'; continue; }
          await onar(`${b.adGorunen} takıldı — Pusula yeniden başlatıldı`, () => c.yenidenBaslat(`öz denetim: ${b.adGorunen} takıldı (${x.ayrinti})`));
          break;
        }
      }
    } else if (k === 'fiyat') {
      for (const b of botlar.filter(b => b.bot && b.bot.durum && b.bot.durum.calisiyor)) {
        if (s.durum === 'hata' && Number.isFinite(s.sapma)) this._guvenliKip(b, 'fiyat', `fiyat iki kaynakta %${(s.sapma * 100).toFixed(1).replace('.', ',')} farklı — bozuk veriyle işlem açılmasın`, { ayrinti: [s.ayrinti] });
        else if (Number.isFinite(s.sapma) && s.sapma < A.fiyatSapmaKalk) this._guvenliKipKaldir(b, 'fiyat', 'fiyat kaynakları yeniden uyuşuyor');
      }
    } else if (k === 'bakim') {
      for (const b of botlar.filter(b => b.bot && b.bot.durum && b.bot.durum.calisiyor)) {
        if (s.aktif) this._guvenliKip(b, 'bakim', `Binance bakımı: ${String(s.aktif.baslik).slice(0, 140)}`, { kalkis: Number.isFinite(s.aktif.bit) ? s.aktif.bit + A.bakimSonraMs : null, ayrinti: [s.ayrinti] });
        else this._guvenliKipKaldir(b, 'bakim', 'borsa bakımı bitti');
      }
      if (s.yakin && s.durum === 'uyari' && !this.kayit.bildirilenBakim[s.yakin.kod || s.yakin.baslik]) {
        this.kayit.bildirilenBakim[s.yakin.kod || s.yakin.baslik] = simdi;
      }
    } else if (k === 'zorla') {
      for (const [ad, x] of Object.entries(s.botlar || {})) {
        for (const z of x.yeniZorla || []) {
          this.kayit.zorlaBilinen = [...(this.kayit.zorlaBilinen || []), `${ad}:${z.id}`].slice(-200);
          const b = bul(ad);
          const metin = `${z.tur === 'ADL' ? 'ADL (otomatik pozisyon azaltma)' : 'LİKİDASYON'}: ${z.symbol} ${z.side} ${z.miktar} @ ${z.fiyat}`;
          const kk = b ? this.karaKutu(b, z.tur === 'ADL' ? 'adl' : 'likidasyon', metin) : null;
          this._olay({ kimlik: 'zorla', tur: 'hata', bot: ad, metin, karaKutu: kk });
          this._bildir('alarm', `${(b && b.adGorunen) || ad}: borsa pozisyonu ZORLA KAPATTI`, [metin,
            'Diğer bacaklar korumasız kalmış olabilir. Mutabakat botu durdurur (ENGEL); Binance\'te açık pozisyonları ve stopları kontrol edin.',
            kk ? `Olay raporu: ${kk}` : null], `zorla:${ad}:${z.id}`);
          this._turBildirdi = true;
        }
      }
    } else if (k === 'stop') {
      for (const [ad, x] of Object.entries(s.botlar || {})) {
        const b = bul(ad);
        if (b && x.ardisik >= A.stopHataArdisik && this._tamKapanma(b, 'stop', `koruma stopu art arda ${x.ardisik} denetimde kurulamadı`, [x.ayrinti])) x.ayrinti += ' → TAMAMEN KAPANDI';
        else if (b && x.ardisik >= A.stopHataArdisik && this.dokunulmaz(b)) x.ayrinti += ' · demo kabul süresince yalnız haber';
        else if (b && x.vurus >= A.stopVurusEsik) {
          if (this._guvenliKip(b, 'stopVurus', `24 saatte ${x.vurus} felaket stopu tetiklendi — piyasa anormal, 24 saat yeni işlem yok`, { kalkis: Number.isFinite(x.sonVurus) ? x.sonVurus + A.stopVurusPencereMs : null })) x.ayrinti += ' → güvenli kip';
          else if (this.dokunulmaz(b)) x.ayrinti += ' · demo kabul süresince yalnız haber';
        } else if (b && Number.isFinite(x.vurus) && x.vurus < A.stopVurusEsik) this._guvenliKipKaldir(b, 'stopVurus', 'son 24 saatte ikinci stop vuruşu yok');
      }
    } else if (k === 'tekrar') {
      for (const b of botlar.filter(b => b.bot && b.bot.durum && b.bot.durum.calisiyor)) {
        const x = (s.botlar || {})[b.ad];
        if (!x) continue;
        if (x.emirRet && this._tamKapanma(b, 'emirRet', (() => { const o = H.retOzeti(x.retler); return `borsa emirleri 30 dk'da ${x.emirRet} kez reddetti (${o.metin}) — ${o.neYapmali}`; })(), x.retler)) x.ayrinti += ' → TAMAMEN KAPANDI';
        else if (x.tekrar && this._guvenliKip(b, 'tekrar', `aynı hata 30 dk'da ${x.tekrar.adet} kez: ${x.tekrar.ornek.slice(0, 160)}`, { kalkis: simdi + A.tekrarKalkMs, ayrinti: [`${x.tekrar.adet} kez / 30 dk · ${x.tekrar.ornek}`] })) x.ayrinti += ' → güvenli kip';
        else if ((x.emirRet || x.tekrar) && this.dokunulmaz(b)) x.ayrinti += ' · demo kabul süresince yalnız haber';
        else if (!x.tekrar && !x.emirRet && simdi - this._sonTekrar(b.ad) >= A.tekrarKalkMs) {
          if (this._guvenliKipKaldir(b, 'tekrar', `${dkMetin(A.tekrarKalkMs)} boyunca aynı hata tekrarlamadı`)) x.ayrinti = 'tekrarlayan hata yok (güvenli kip kalktı)';
        }
      }
      s.durum = enKotu(Object.values(s.botlar || {}).map(x => x.durum));
      s.ayrinti = Object.values(s.botlar || {}).filter(x => SIRA[x.durum] >= 2).map(x => `${x.ad}: ${x.ayrinti}`).join(' · ') || 'tekrarlayan hata yok';
    }
  }

  // ── 69.2 KARA KUTU ──
  _karaDizin() { return this.dizin ? path.join(this.dizin, 'kara-kutu') : null; }
  /** Botun ENGEL / güvenli kip izini kaydeder (başka bir kural koyduğunda kara kutu için fark edilir). */
  _izYaz(b) {
    const d = b.bot && b.bot.durum;
    if (!d) return;
    const kolE = b.bot.kol && b.bot.kol.durum ? b.bot.kol.durum.engel : null;
    this.kayit.botIz[b.ad] = { engel: d.engel || kolE || null, gk: d.guvenliKip ? d.guvenliKip.metin : null };
  }
  /**
   * O anın raporu (JSON). Sırlar yazılmaz: bot/yürütücü özetinde anahtar yok; metin ayrıca süzülür (Telegram jetonu, ping adresi).
   * @returns dosya adı | null
   */
  karaKutu(b, kaynak, metin) {
    const dz = this._karaDizin();
    if (!dz) return null;
    const z = this.simdi();
    const iso = new Date(z + TR).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const ad = `${iso}-${String(b ? b.ad : 'sistem').replace(/[^a-z0-9]/gi, '')}-${String(kaynak || 'elle').replace(/[^a-z0-9]/gi, '').slice(0, 20)}.json`;
    let veri = {};
    try { veri = (this.ctx.karaKutuVeri && this.ctx.karaKutuVeri(b, { gunlukMs: this.ayar.karaKutuGunlukMs })) || {}; } catch (e) { veri = { hata: `rapor verisi toplanamadı: ${e.message}` }; }
    const rapor = { tur: 'pusula-kara-kutu', surum: 1, zaman: new Date(z).toISOString(), bot: b ? { ad: b.ad, adGorunen: b.adGorunen, mod: b.mod } : null, kaynak, metin,
      denetimler: this.goruntu().denetimler.filter(d => d.durum !== 'tamam').map(d => ({ kimlik: d.kimlik, ad: d.ad, durum: d.durum, ayrinti: d.ayrinti })),
      sonOlaylar: this.olaylar(1, 30), ...veri };
    let govde = JSON.stringify(rapor, null, 1);
    govde = govde.replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[token]').replace(/https?:\/\/hc-ping\.com\/[^\s"]+/gi, 'hc-ping.com/[…]');
    try {
      fs.mkdirSync(dz, { recursive: true });
      fs.writeFileSync(path.join(dz, ad), govde, 'utf8');
      const l = fs.readdirSync(dz).filter(x => x.endsWith('.json')).sort();
      for (const x of l.slice(0, Math.max(0, l.length - this.ayar.karaKutuTavan))) fs.rmSync(path.join(dz, x), { force: true });
    } catch (e) { this.kaydet('WARN', `kara kutu yazılamadı: ${e.message}`); return null; }
    this.kaydet('INFO', `olay raporu yazıldı: ${ad}`);
    return ad;
  }
  /** Son olay raporları (yeniden eskiye). */
  karaKutular(tavan = 50) {
    const dz = this._karaDizin();
    if (!dz || !fs.existsSync(dz)) return [];
    return fs.readdirSync(dz).filter(x => /^[0-9-]+-[a-z0-9]+-[a-z0-9]+\.json$/i.test(x)).sort().reverse().slice(0, tavan).map(x => {
      const m = /^(\d{8}-\d{6})-([a-z0-9]+)-([a-z0-9]+)\.json$/i.exec(x) || [];
      let bayt = null; try { bayt = fs.statSync(path.join(dz, x)).size; } catch { /* */ }
      const t = m[1] ? Date.parse(`${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}T${m[1].slice(9, 11)}:${m[1].slice(11, 13)}:${m[1].slice(13, 15)}+03:00`) : null;
      return { dosya: x, zaman: t, bot: m[2] || null, kaynak: m[3] || null, bayt };
    });
  }
  /** Rapor dosyasının tam yolu (ad doğrulanır — dizin dışına çıkılamaz). */
  karaKutuYolu(ad) {
    const dz = this._karaDizin();
    if (!dz || !/^[0-9-]+-[a-z0-9]+-[a-z0-9]+\.json$/i.test(String(ad || ''))) return null;
    const y = path.join(dz, ad);
    return fs.existsSync(y) ? y : null;
  }

  /** 30 günden eski günlük dosyalarını (data/gunluk/*.jsonl) .gz'ye sıkıştırır; özgün dosya ancak .gz doğrulanınca kalkar. */
  gunlukSikistir() {
    const dizin = this.ctx.gunlukDizin ? this.ctx.gunlukDizin() : null;
    if (!dizin || !fs.existsSync(dizin)) return { adet: 0, kazanc: 0 };
    const sinir = new Date(this.simdi() - this.ayar.gunlukSikistirGun * GUN).toISOString().slice(0, 10);
    let adet = 0, kazanc = 0;
    for (const f of fs.readdirSync(dizin)) {
      if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) || f.slice(0, 10) >= sinir) continue;
      const kaynak = path.join(dizin, f);
      const hedef = `${kaynak}.gz`;
      if (fs.existsSync(hedef)) continue;
      const ham = fs.readFileSync(kaynak);
      const gz = zlib.gzipSync(ham, { level: 9 });
      fs.writeFileSync(hedef, gz);
      if (!zlib.gunzipSync(fs.readFileSync(hedef)).equals(ham)) { fs.rmSync(hedef, { force: true }); continue; }
      fs.rmSync(kaynak);
      adet++; kazanc += ham.length - gz.length;
    }
    return { adet, kazanc };
  }

  /** Bir yoklama turu. @returns anlık görüntü */
  async yokla({ zorla = false } = {}) {
    if (this.mesgul) return this.goruntu();
    this.mesgul = true;
    const simdi = this.simdi();
    try {
      const yavas = zorla || simdi - (this.kayit.yavasSon || 0) >= this.ayar.yavasAralikMs;
      if (yavas) this.kayit.yavasSon = simdi;
      await this._agOlc(simdi);
      if (yavas) await this._yavasOlc(simdi);
      // 69.4 ikinci ölü adam: her yoklamada ping (denetimlerden ÖNCE — sonucu aynı turda görünsün)
      if (this.ctx.ikinciSinyal) { try { this._ikinciSinyal = await this.ctx.ikinciSinyal(); } catch (e) { this._ikinciSinyal = { ok: false, hata: e.message }; } }
      for (const b of this._botlar()) {
        if (!b.bot || !b.bot.durum) continue;
        const once = this.kayit.botIz[b.ad] || { engel: null, gk: null };
        this._izYaz(b);
        const simd = this.kayit.botIz[b.ad];
        if (simd.engel && simd.engel !== once.engel) { const kk = this.karaKutu(b, 'engel', simd.engel); this._olay({ kimlik: 'mutabakat', tur: 'kara-kutu', bot: b.ad, metin: `bot ENGEL koydu: ${String(simd.engel).slice(0, 160)}`, karaKutu: kk }); }
        else if (simd.gk && simd.gk !== once.gk) { const kk = this.karaKutu(b, 'guvenlikip', simd.gk); this._olay({ kimlik: 'tekrar', tur: 'kara-kutu', bot: b.ad, metin: `güvenli kip: ${String(simd.gk).slice(0, 160)}`, karaKutu: kk }); }
      }
      for (const t of DENETIMLER) {
        let s;
        try { s = await this._yokla(t.kimlik, simdi, yavas); } catch (e) { s = { durum: 'bilinmiyor', ayrinti: `denetim yapılamadı: ${e.message}` }; }
        if (s === null) continue;                       // yavaş denetim bu tur atlandı — önceki sonuç kalır
        s.zaman = simdi;
        this._turBildirdi = false;
        try { await this._eylem(t, s, simdi); } catch (e) { this.kaydet('WARN', `${t.ad}: eylem hatası ${e.message}`); }
        const onceki = this.kayit.oncekiDurum[t.kimlik] || 'tamam';
        if (!s.onarim && this.sonuclar[t.kimlik] && this.sonuclar[t.kimlik].onarim && simdi - this.sonuclar[t.kimlik].onarim.zaman < GUN) s.sonOnarim = this.sonuclar[t.kimlik].onarim;
        else if (s.onarim) s.sonOnarim = s.onarim;
        this.sonuclar[t.kimlik] = s;
        this._gecis(t, onceki, s, simdi);
        this.kayit.oncekiDurum[t.kimlik] = s.durum;
      }
      await this._aksamOzeti(simdi);
      this.sonYoklama = simdi;
      this._yaz();
      return this.goruntu();
    } finally { this.mesgul = false; }
  }

  /** Durum geçişi: sarı/kırmızıya geçince Telegram (anında); düzelince olay (akşam özetinde). */
  _gecis(t, onceki, s, simdi) {
    const yeni = s.durum;
    if (yeni === onceki || yeni === 'bilinmiyor') return;
    if (SIRA[yeni] >= 2 && SIRA[yeni] > SIRA[onceki]) {
      this._olay({ kimlik: t.kimlik, tur: yeni, metin: s.ayrinti });
      const satirlar = [s.ayrinti];
      if (s.onarim) satirlar.push(s.onarim.basari ? `Onarıldı: ${s.onarim.metin}` : `Onarılamadı: ${s.onarim.metin}`);
      else if (t.kademe === 'haber') satirlar.push('Pusula bunu kendisi düzeltmez; bakmanız gerekiyor.');
      if (this._turBildirdi) return;                    // güvenli kip / tam kapanma iletisi zaten gitti
      if (!t.belirti && yeni !== 'hata') return;        // 69.4: neden denetiminin sarısı yalnız panelde + akşam özetinde
      // 73.7 (kullanıcı kararı "tek bilgi + geçti"): zararsız, kendiliğinden geçen sarılar uyarı değil TEK BİLGİ; düzelince "geçti".
      if (yeni === 'uyari' && GECICI_SARI.has(t.kimlik)) {
        this.kayit.geciciBildirilen = { ...(this.kayit.geciciBildirilen || {}), [t.kimlik]: simdi };
        this._bildir('bilgi', `${t.ad}: kendiliğinden geçecek`, [s.ayrinti, 'Zararsız — dokunmayın. Geçince "geçti" iletisi gelir.'], `${t.kimlik}:gecici`);
        return;
      }
      this._bildir(yeni === 'hata' ? 'alarm' : 'uyari', t.ad, satirlar, `${t.kimlik}:${yeni}`);
    } else if (SIRA[yeni] < 2 && SIRA[onceki] >= 2 && t.kimlik !== 'internet') {
      this._olay({ kimlik: t.kimlik, tur: 'duzeldi', metin: s.ayrinti });
      const gb = this.kayit.geciciBildirilen || {};
      if (gb[t.kimlik]) { const bas = gb[t.kimlik]; delete gb[t.kimlik]; this._bildir('bilgi', `${t.ad}: geçti`, [s.ayrinti, `${dkMetin(simdi - bas)} sürdü.`]); }
    }
  }

  /** 21:00 TR akşam özeti (günde bir): sayılar, bugünkü onarımlar, açık sorunlar. */
  async _aksamOzeti(simdi) {
    const g = trGun(simdi);
    if (trSaatDk(simdi) < 21 * 60 || this.kayit.ozetGun === g) return;
    this.kayit.ozetGun = g;
    const o = this.goruntu();
    const bugun = this.olaylar(1).filter(x => trGun(x.zaman) === g);
    const onarim = bugun.filter(x => x.tur === 'onarildi');
    const satir = [`${o.ozet.toplam} denetim · ${o.ozet.tamam} tamam · ${o.ozet.uyari} uyarı · ${o.ozet.hata} hata`];
    if (onarim.length) satir.push(`Bugün ${onarim.length} onarım: ${onarim.slice(0, 6).map(x => x.metin).join(' · ')}`);
    else satir.push('Bugün onarım gerekmedi.');
    const acik = o.denetimler.filter(d => SIRA[d.durum] >= 2);
    if (acik.length) satir.push(`Açık: ${acik.map(d => `${d.ad} (${d.ayrinti.slice(0, 80)})`).join(' · ')}`);
    for (const b of o.botlar) if (b.engel || b.guvenliKip) satir.push(`${b.ad}: ${b.engel ? 'TAMAMEN KAPALI' : 'güvenli kipte'}`);
    const r = (n) => (this.sonuclar[n] ? this.sonuclar[n].ayrinti : '—');
    satir.push(`Disk: ${r('disk')} · bellek ${r('bellek')} · ${r('saat')}`);
    await this._bildir('ozet', 'akşam özeti', satir);
  }

  /**
   * 73.7 SORUN MERKEZİ OKUYUCUSU (saf okuma — hiçbir şeyi değiştirmez): lib/sorunlar.js'in kartlarına giren iç veriler —
   * bot başına sayılan emir retleri, tekrarlayan satırlar, son tekrar ve son stop vuruşu (tahmini kalkış), tam kapanma / güvenli
   * kip ayrıntısı ("Neyi saydı?"), onay zamanı, demo kabul; bakım penceresi ve fiyat farkı.
   */
  sorunVerisi(simdi = this.simdi()) {
    const botlar = {};
    for (const b of this._botlar()) {
      let vurus = [];
      try { vurus = (((b.bot && b.bot.koruma && b.bot.koruma.durum && b.bot.koruma.durum.olaylar) || []).filter(o => o.tur === 'tetiklendi').map(o => +o.zaman).filter(Number.isFinite)); } catch { vurus = []; }
      botlar[b.ad] = {
        emirRetler: (this.emirRetler[b.ad] || []).filter(x => simdi - x.zaman < this.ayar.tekrarPencereMs).slice(-10),
        tekrarlar: this._tekrarlayan(b.ad, simdi).slice(0, 3), sonTekrar: this._sonTekrar(b.ad) || null,
        stopSonVurus: vurus.length ? Math.max(...vurus) : null, stopHata: this.kayit.stopHata[b.ad] || null,
        tk: (this.kayit.tkAyrinti || {})[b.ad] || null, gk: (this.kayit.gkAyrinti || {})[b.ad] || null,
        onay: this._onayZamani(b.ad) || null, dokunulmaz: this.dokunulmaz(b, simdi),
      };
    }
    const bk = this.sonuclar.bakim || {}, f = this.sonuclar.fiyat || {};
    return { botlar, bakimAktif: bk.aktif || null, bakimYakin: bk.yakin || null, fiyatSapma: Number.isFinite(f.sapma) ? f.sapma : null, kesintiBas: this.kayit.kesintiBas || null,
      ayar: { tekrarKalkMs: this.ayar.tekrarKalkMs, stopVurusPencereMs: this.ayar.stopVurusPencereMs, bakimSonraMs: this.ayar.bakimSonraMs, fiyatSapmaKalk: this.ayar.fiyatSapmaKalk } };
  }

  /** Panel / API için anlık görüntü. */
  goruntu() {
    const denetimler = DENETIMLER.map(t => {
      const s = this.sonuclar[t.kimlik] || { durum: 'bilinmiyor', ayrinti: 'henüz yoklanmadı' };
      return { ...t, durum: s.durum, ayrinti: s.ayrinti, zaman: s.zaman || null, onarim: s.sonOnarim || null,
        botlar: s.botlar ? Object.fromEntries(Object.entries(s.botlar).map(([a, x]) => [a, { ad: x.ad, mod: x.mod, durum: x.durum, ayrinti: x.ayrinti }])) : null,
        ...(Array.isArray(s.hesaplar) ? { hesaplar: s.hesaplar } : {}) };   // C5 yetki: hesap başına satır (sır yok)
    });
    const say = (d) => denetimler.filter(x => (d === 'tamam' ? SIRA[x.durum] === 0 : x.durum === d)).length;
    const botlar = this._botlar().map(b => ({ ad: b.ad, adGorunen: b.adGorunen, mod: b.mod, calisiyor: !!(b.bot && b.bot.durum && b.bot.durum.calisiyor),
      engel: (b.bot && (b.bot.durum.engel || (b.bot.kol && b.bot.kol.durum && b.bot.kol.durum.engel))) || null,
      bindirmeEngel: (b.bot && b.bot.durum.engel) || null, kolEngel: (b.bot && b.bot.kol && b.bot.kol.durum && b.bot.kol.durum.engel) || null,
      guvenliKip: (b.bot && b.bot.durum.guvenliKip) || null, dokunulmaz: this.dokunulmaz(b) }));
    const g = trGun(this.simdi());
    const onarimBugun = Object.entries(this.kayit.sayac).filter(([, s]) => s.gun === g).reduce((a, [, s]) => a + s.adet, 0);
    return {
      ozet: { toplam: denetimler.length, tamam: say('tamam'), uyari: say('uyari'), hata: say('hata'), bilinmiyor: say('bilinmiyor'),
        durum: enKotu(denetimler.map(x => x.durum === 'bilinmiyor' ? 'tamam' : x.durum)), sonYoklama: this.sonYoklama,
        sonraki: this.sonYoklama ? this.sonYoklama + this.ayar.aralikMs : null, onarimBugun, onarimSiniri: this.ayar.onarimGunluk },
      gruplar: GRUPLAR.map(([kimlik, ad]) => ({ kimlik, ad })), denetimler, botlar, tetikler: TETIKLER,
      demoKorumaBitis: new Date(this.ayar.demoKorumaBitis).toISOString(),
    };
  }

  baslat() {
    if (this.zamanlayici) return;
    setTimeout(() => { this.yokla().catch(e => this.kaydet('WARN', `yoklama: ${e.message}`)); }, 90 * 1000).unref();
    this.zamanlayici = setInterval(() => { this.yokla().catch(e => this.kaydet('WARN', `yoklama: ${e.message}`)); }, this.ayar.aralikMs);
    if (this.zamanlayici.unref) this.zamanlayici.unref();
  }
  durdur() { if (this.zamanlayici) { clearInterval(this.zamanlayici); this.zamanlayici = null; } }
}

/** Saf (S05): Telegram komut yoklaması hata metni → sade açıklama. */
/**
 * C5 SAF: API anahtarı yetki satırları → denetim sonucu. Girdi lib/anahtarlar.js yetkiDenetimi satırları (değer / anahtar YOK).
 *   canlı (ya da İşlem defterim) anahtarında para çekme izni AÇIK → hata · demo hesapta açık → uyarı (gerçek para yok)
 *   canlı borsa hesabında IP kısıtı yok → uyarı (sarı bilgi) · defter anahtarı salt okuma değil → uyarı
 *   sınama başarısız / canlıda izin okunamadı → bilinmiyor · demo hesapta izin bilgisi yok → tamam (Binance demo sorgu desteklemiyor)
 */
function yetkiDegerlendir(l, simdi = Date.now()) {
  if (!Array.isArray(l) || !l.length) return { durum: 'tamam', ayrinti: 'sınanacak borsa anahtarı yok', hesaplar: [] };
  const hesaplar = l.map((h) => {
    const ad = String(h.ad || h.kimlik || '?').slice(0, 60);
    const demo = h.tur === 'demo', defter = h.grup === 'defter';
    const yas = Number.isFinite(h.zaman) ? ` · sınama ${dkMetin(Math.max(0, simdi - h.zaman))} önce` : '';
    const r = (durum, metin, ek = {}) => ({ kimlik: String(h.kimlik || '').slice(0, 80), ad, tur: demo ? 'demo' : 'canli', grup: defter ? 'defter' : 'borsa', durum, ayrinti: `${metin}${yas}`, ...ek });
    if (!h.ok) return r('bilinmiyor', `izinler okunamadı (${String(h.hata || 'bilinmeyen hata').slice(0, 120)})`);
    if (h.cekmeIzni === true) return demo ? r('uyari', 'demo hesapta PARA ÇEKME izni açık — gerçek para yok ama kapatın', { cekme: true })
      : r('hata', 'PARA ÇEKME İZNİ AÇIK — borsanın API yönetiminde hemen kapatın', { cekme: true });
    if (h.cekmeIzni == null) return demo ? r('tamam', 'demo hesap — borsa izin bilgisi vermiyor (gerçek para yok)') : r('bilinmiyor', 'para çekme izni okunamadı (borsa izin bilgisi vermedi)');
    if (defter && h.saltOkuma === false) return r('uyari', 'para çekme kapalı · anahtar SALT OKUMA DEĞİL — İşlem defterim yalnız okuma izinli anahtar ister', { saltOkumaDegil: true });
    const ipYok = h.ipKisitli === false || (Array.isArray(h.uyarilar) && h.uyarilar.some(u => /IP kısıtı yok/i.test(String(u))));
    if (!demo && !defter && ipYok) return r('uyari', 'para çekme kapalı · IP kısıtı YOK — canlı hesapta zorunlu (borsa › API yönetimi › IP kısıtı)', { ipYok: true });
    return r('tamam', `para çekme kapalı${h.ipKisitli === true ? ' · IP kısıtlı' : ''}${defter && h.saltOkuma ? ' · salt okuma' : ''}`);
  });
  const durum = enKotu(hesaplar.map(x => x.durum));
  const sorunlu = hesaplar.filter(x => SIRA[x.durum] >= 1);
  const ayrinti = sorunlu.length ? sorunlu.map(x => `${x.ad}: ${x.ayrinti}`).join(' · ')
    : `${hesaplar.length} anahtar · hepsinde para çekme kapalı`;
  return { durum, ayrinti: ayrinti.slice(0, 900), hesaplar };
}

function komutHataMetni(m) {
  const s = String(m || '');
  if (/409|çakışma|conflict/i.test(s)) return '409 — aynı Telegram botunu başka bir bilgisayar ya da program da yokluyor (taşımadan sonra eski bilgisayar açık kalmış olabilir; o bilgisayarda Pusula\'yı durdurun)';
  if (/401|unauthorized|token/i.test(s)) return '401 — Telegram jetonu geçersiz (Ayarlar › Bildirimler › jetonu yeniden girin)';
  return s.slice(0, 120);
}

module.exports = { OzDenetim, DENETIMLER, GRUPLAR, TETIKLER, AYAR, sessizSaat, tekrarAnahtari, EMIR_RET, emirRetMi, AG_HATASI, trGun, enKotu, komutHataMetni, yetkiDegerlendir };
