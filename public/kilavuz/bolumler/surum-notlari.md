# Sürüm notları {#surum-notlari}

Her sürümde panelde ne değişti. Yeni bir sürüm geldiğinde Ana sayfada bir kez **"bu sürümde yeni"** kartı çıkar.

## 77.3 — Kılavuz görüntüleri ve sözlük (2026-10-26) {#s77-3}
- **Kılavuz:** gece kalitesi düşürülen ekran görüntüleri yeniden net; kılavuz görüntülerinin toplam sınırı 8 MB'tan 10 MB'a çıktı.
- **Sözlük:** FX, MT, XLSX, TCMB, EVDS, TÜİK, HHI ve PATH kısaltmalarının üzerine gelince açıklama çıkar.
- Güncelleme sunucuda **onaylı** kurulur ([Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme)) — sürüm numarası ve panel dosyaları değişti; bot kodu aynı, kuru denemede bütün botların kararı birebir aynı çıkar.

## 77.2 — Bybit hazırlığı (2026-10-26) {#s77-2}
- **Bybit hazırlığı:** yeni bot formunda Borsa seçiminde Bybit ve "Kairos tipi — Bybit (demo hazırlığı)" şablonu. Bybit botu kâğıt hesapta Bybit'in pazar kurallarıyla çalışır (karar verisi Binance'ten, evren Binance ∩ Bybit; Bybit'te olmayan coin nakitte, Botlar kartında "Bybit'te yok — nakitte"). Bybit demo hesabı Anahtarlar'a eklenip sınanabilir ama bota henüz bağlanamaz ("Bybit demo: hazırlık — henüz bağlanamaz"); canlı hesap yok. Güncellemenin kuru denemesi Bybit botunu da dener. Kairos, Tao ve OKX botu değişmedi.
- **Kılavuz:** Ayarlar › Makineler ve Anahtarlar görüntüleri yenilendi; para hareketi onayı [Botlar](#/kilavuz/botlar) ve [Sorunlar](#/kilavuz/sorunlar) bölümlerinde, aktarım hesap türü Anahtarlar'da anlatılıyor; eski menü yolları ve denetim sayısı düzeltildi.
- Güncelleme sunucuda **onaylı** kurulur ([Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme)): borsa bağdaştırıcılarına dokunuldu; kuru deneme Bybit botunu da dener.

## 77.1 — DCA emri ikinci kez gönderilmez (2026-10-26) {#s77-1}
- **Bot güvenliği:** bot yeniden başlarken borsada az önce dolmuş ama borsanın sorgusunda henüz görünmeyen bir DCA emri artık "gönderilmemiş" sayılıp ikinci kez gönderilmiyor. Bot birkaç dakika bekler, borsaya yeniden sorar; emir görünürse dolumu işler, görünmezse eskisi gibi yeniden kuyruğa alır. Bu bekleme kendiliğinden çözülür, elle bir şey yapmanız gerekmez.
- Güncelleme sunucuda **onaylı** kurulur ([Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme)): botların mutabakat koduna dokunuldu; kuru denemede bütün botların kararları birebir aynı çıktı.

## 77.0 — Sermaye dağıtımı (2026-10-26) {#s77-0}
```

## 76.9 — Yeni hisse alımı: kasadan düşer; izleme listesi (2026-10-26) {#s76-9}
> **Kullanıcı geri bildirimi:** "Varlık ekle" ile girilen yeni alım kasadan düşmüyor, hesap "ekstra para koymuşum gibi" görünüyordu; kasa bir denemede 100'e inmişti. Akış baştan kuruldu (taslak onaylı).

**Hesap kartı.** Üstte **Hesap toplamı** ve **Kasa (nakit)**; düğmeler **Al · Sat · Para yatır · Para çek · Temettü**. Her biri kartın içinde tek bir **işlem kartı** açar: **1 Hangi hisse** (ara) → **2 Ne kadar** (**Adet** ya da **Tutar** — son seçtiğin hatırlanır; gerçekleşen fiyat, komisyon (yoksa 0), tarih; canlı özet: adet × fiyat, komisyon, kasadan düşecek, kasa şimdi → sonra) → **3 Kontrol et** → **Kaydet** → makbuz (✓ ve **Geri al**).

**Alış her zaman kasadan düşer.** Kasa yetmezse sarı bant: *"Kasada X var, bu alım Y. Z eksik."* ve **Bu alım için kasaya önce para yatırdım** kutusu (tutarı düzenlenebilir). İşaretlemezsen alım kaydedilmez — kasa eksiye düşemez; işaretlersen para yatırma + alış birlikte yazılır. Satışta elde olandan fazlası satılamaz. Eski "Olmadan kaydet" (kasayı sessizce eksiye düşüren) seçeneği kaldırıldı.

**İzleme listesi** (Hesaplar): **Hisse ara ve listeye ekle** → **+ Ekle**; satırda son fiyat, günlük değişim, **Al**, **Çıkar**. Kasaya ve hesap toplamına etkisi yoktur.

**Bu hesapta zaten olanlar (Pusula'yı ilk kurarken bir kez).** Eski "Varlık ekle" yalnız ilk kurulum içindir; nakit bakiyesi ikinci kez girilemez (para yatırma / çekme girin). Hesap kartındaki **İşlemler** listesi her satırın kasa etkisini gösterir; kasadan düşmemiş hisse kaydında **kasadan düşmedi — yeni alımsa düzeltin** rozeti ve **Bunu alışa çevir** (yanlış kayıt ters kayıtla iptal, aynı adet ve fiyatla alış yazılır, tutar kasadan düşer). Örnek: 677 $ kasa + yanlışlıkla "zaten vardı" diye girilen 49 × 2,03 $ MRT → toplam ~776 $ görünüyordu; **Bunu alışa çevir** sonrası kasa ~577,53 $, toplam ~677 $. "Açılış bakiyesi" terimi panelden kalktı.

## 76.8 — Geri dönüş tatbikatı (2026-10-26) {#s76-8}
> **Geri dönüş tatbikatı (Sistem › Tatbikatlar):** Pusula ayda bir (ayın ilk pazarı 11:00) "bu bilgisayar bozulsa bot geri gelir mi?" diye kendini sınar: son günlük yedeği ve eşlenmiş sunucunun kopyasını dosya dosya doğrular, şifreli anahtar dosyasının yedek şifresiyle açılabildiğini yalnız bellekte dener, her botu geçici bir klasöre geri yükleyip emir göndermeden kuru çalıştırır, sonra klasörü siler. Hiçbir bot başlatılmaz, gerçek dosyalara dokunulmaz. Sonuç sayfada, Telegram'da ve Sağlık'ta (yeni denetim "Geri dönüş tatbikatı", yalnız haber). "Şimdi çalıştır" ile hemen de yapılabilir. Kairos demo kabulü bitene kadar ve canlı hesap kapsam dışı.

## 76.7 — Tatbikat ekleri, SAHİPLEN'de ikinci PIN, OKX'te yok satırı, kopya boyutu uyarısı (2026-10-25) {#s76-7}
**Tatbikatlar.** Yeni **prova 8 — karar saatinde internet kesintisi**: gece 02:55'te interneti kesip 03:45'te açarsınız; Pusula kesintinin
botun 03:02 çalışmasını kapsadığını, botun durmadığını, bağlantı dönünce günlük çalışmayı bir kez yaptığını, çift emir olmadığını ve
mutabakatın temiz olduğunu kayıtlardan denetler (demo kabulünün parçası değildir; Kairos demo kabulü sürerken başlatılamaz).
**Prova 1**'e bir adım eklendi: Pusula'yı (ya da sunucuyu) kapatıp **telefondaki Binance uygulamasından** felaket stoplarının borsada
durduğunu görürsünüz, sonra Pusula'yı açıp stop iptaline geçersiniz. **Kâğıt botlarda** sonuç ayrıca botun klasöründeki ayrı bir prova
günlüğüne yazılır (Kairos demo kabul prova günlüğü değişmedi). Geliştirme bilgisayarı artık **sunucunun** tatbikat durumunu salt okuma
gösterir. Aylık otomatik denetim acil durdurmayı **denemez**, yalnız son denemenin kaydını yazar.

**Devralma.** Borsadaki emirleri deftere alan **SAHİPLEN** onayı PIN'i yeniden ister — Devral'da girdiğiniz PIN yetmez.

**OKX botu.** OKX'te işlem görmeyen evren coinleri Botlar'da OKX botunun kartında ayrı satırda görünür: **OKX'te yok — nakitte**.
Bunun için Telegram'a bildirim gitmez. Güncellemenin kuru denemesi kâğıttaki OKX botunu da dener (OKX'in herkese açık verisiyle).

**Eş kopyası.** Bir makinenin kopyası 64 MB sınırına yaklaşınca (%80) ya da aşınca Sağlık'ta "Eş makine kopyası" sarı yanar
(yalnız haber; Telegram'a anında gitmez).

## 76.6 — Tatbikatlar: provaları Pusula yönetir (2026-10-25) {#s76-6}
**Tatbikatlar (yeni):** Sistem › Tatbikatlar. Provaları artık Pusula kendisi yönetiyor: felaket stopu kaybolması, Pusula çökmesi, 30 dakikalık
internet kesintisi, 26 saatlik kapanış, acil durdurma denemesi, mutabakat ve botu başka makineye taşıma. Pusula önce hazır olup olmadığını denetler,
size adım adım ne yapacağınızı söyler, sonra kayıtlardan kendisi bakar (uyarı geldi mi, Telegram'a gitti mi, ne kadar sürdü, mutabakat temiz mi) ve
geçti / geçmedi" önerir. Kairos demo kabulünün bekleyen provaları (1–4) hazır; sonuç demo kabul prova günlüğüne kendiliğinden eklenir.
Pusula burada hiçbir emir vermez, botu durdurmaz, programı kapatmaz — adımları siz yaparsınız. Ayın ilk pazarı 11:30'da ayrıca kısa bir
otomatik denetim (yalnız okuma) yapılır ve sonucu Telegram'a gelir.

## 76.5 — Bozulan makinenin botlarını devralmak (2026-10-25) {#s76-5}
Bir sunucu kalıcı olarak giderse öbür sunucu onun botunu son eş kopyasından devralabilir (Ayarlar › Makineler › Devral — 30 dakikadan uzun sessiz makineden, PIN ve DEVRAL ile; bot kendiliğinden başlamaz). Demo botta borsadaki bilinmeyen emirleri görüp onaylarsınız. Eski makine geri gelirse botu başlatmaz; çalışır hâlde gelirse ilk nabızda durdurur. Canlı hesap botu ve Kairos demo kabulü devralınamaz. Eşleme kaldırılınca o makinenin kopyası silinir.

## 76.4 — Para çıkışı "Bu ben değilim" ve giriş hatırlatması (2026-10-25) {#s76-4}
**"Bu ben değilim".** Onay bekleyen bir para çıkışını siz yapmadıysanız Sorunlar'daki kartta artık ikinci bir araç var: **Bu ben
değilim — reddet** (acil PIN + **BEN DEĞİLİM**). Bot durmuş kalır, hareket "reddedildi — güvenlik" olarak işaretlenir ve hesaplara
katılmaz; Telegram'a "Hesabınızdan sizin yapmadığınız para çıkışı var — borsa hesabınızı ve API anahtarlarınızı hemen kontrol edin"
alarmı gider ve Sorunlar'da kırmızı kart kalır. Hareketin sizin olduğunu sonradan anlarsanız **Hareket benimmiş — onayla** ile bot
yeniden çalışır.

**Giriş hatırlatması.** Onay bekleyen para girişi için Telegram'a günde bir hatırlatma gelir (tutar yazılmaz).

**Kairos demo.** 2026-12-10'dan sonra para akışı onayı Kairos demo botta da geçerli olur (kabul süresince yalnız haber).
Bkz. [Para hareketi onayınızı bekliyor](#/kilavuz/sorun-giderme/para-akisi-onay).

## 76.3 — OKX demo botu hazırlığı (2026-10-25) {#s76-3}
**OKX botu hazırlığı (kâğıtta).** Ayarlar › Botlar'da yeni bot kurarken artık borsa seçilebiliyor (Binance ya da OKX); listede "Kairos
tipi — OKX (demo hazırlığı)" şablonu da var. OKX botu kâğıt hesapta OKX'in pazar kurallarıyla çalışır; kararlarını Kairos'la aynı
Binance verisinden verir. Ayın 15 coinlik evreninden OKX'te olmayan bir coin olursa o coinin payı nakitte kalır ("OKX'te yok").
OKX demo hesabını Anahtarlar'a ekleyebilirsiniz ama bu sürümde bota bağlanamaz — ekranda "OKX demo: hazırlık — henüz bağlanamaz" yazar.
Kairos, Tao ve Binance botlarının davranışı değişmedi.

## 76.2 — Para girişi ve çıkışı onay ister (2026-10-25) {#s76-2}
- **Para giriş/çıkışı artık onayınızı istiyor.** Bot borsadaki her para hareketini kendisi görür. Sizin kaydınız olmadan para çıkarsa
  bot yeni işlem açmayı durdurur (açık pozisyonların stopu yerinde kalır) ve Telegram'a alarm gelir; Panel › Sorunlar › "Para hareketini
  onayla" (PIN + ONAY, telefondan da) ile onaylayınca bot yeni bakiyeyle sürer. Para girişinde bot durmaz ama onaylayana kadar o parayı
  hesaba katmaz. Çekimden önce (ya da hemen sonra) bot sayfasında "Para yatırdım / çektim" ile kaydederseniz bot durmaz. Kairos demo
  kabulü süresince (2026-12-09'a kadar) yalnız haber verilir.

## 76.1 — Eş makine kopyası (2026-10-25) {#s76-1}
**Eş makine kopyası (saat başı).** İki sunucu eşlediyseniz artık her biri **her saatin 20. dakikasında** öbürünün bot verisinin (bot durumları, emir defterleri, bot kayıtları, hesap işlemleri, ayarlar) bir kopyasını alır — bir bilgisayar bozulursa öbüründe en çok bir saatlik kopya kalır. Kopya **yedek şifresiyle şifreli** gider (iki bilgisayarda aynı yedek şifresi gerekir); demo hesap anahtarı kopyada ayrıca şifreli durur ve açılmaz; **canlı hesap ve Kairos demo kabulünün anahtarı kopyaya hiç girmez**. Kopya botlara dokunmaz. Durum: **Ayarlar › Makineler › Eş kopyaları** (son kopyanın yaşı, dosya sayısı, "Şimdi kopya al"). Sağlık'ta yeni satır **Eş makine kopyası**: kopya 2 saatten eskiyse sarı (yalnız haber). Geliştirme bilgisayarı kopya almaz. Tek bilgisayar kullanıyorsanız hiçbir şey değişmez. *(Devralma — kapanan makinenin botunu kopyadan almak — sonraki sürümde.)*

## 76.0 — Bütün hesapların toplam riski (2026-10-25) {#s76-0}
- **Yeni: [Sistem › Sağlık › Toplam risk](#/kilavuz/saglik/toplam-risk).** Bütün botların borsa hesapları birlikte ölçülür (yalnız okuma; demo kabul botu Kairos borsaya ek istek atılmadan son kaydından): **brüt kaldıraç**, **net BTC payı**, **tek coin payı** (BTC dışındaki en büyük coin, bütün hesaplarda) ve **felaket kaybı** (bütün felaket stopları tetiklenseydi; stopsuz kısımda %30 düşüş). Kâğıt, demo ve canlı hesap ayrı hesaplanır. Eşlenmiş başka bir sunucu varsa onun botları da girer.
- **İlk 14 gün yalnız izleme:** ölçüm saatte bir kaydedilir; öneri eşiği (4× · %120 · %35 · %25) aşılınca yalnız panelde **uyarı** görünür — Telegram'a ileti gitmez. **Hiçbir emir engellenmez.**
- 14 gün dolunca kart her değerin orta / %95 / en yüksek değerini gösterir; sınırları **siz** yazıp **Sınırları onayla** (PIN) dersiniz. Sınır kipinde sınır yalnız **canlı hesaba** uygulanır (kâğıt ve demo yalnız izlenir): aşacak **büyüten** emir verilmez, BTC ayağı artırılmaz, Telegram gelir; azaltan emirler, felaket stopları ve acil durdurma her zaman serbest. **İzleme kipine dön** PIN istemez, hemen geçerli. Pusula kendiliğinden kip değiştirmez.
- Demo kabul botu (Kairos) 2026-12-09 sonuna kadar yalnız haber alır; ölçümü için borsaya ek istek atılmaz.
- Ana sayfa › Sistem sağlığı'nda yeni ışık **Toplam risk**; Sağlık'ta yeni denetim satırı **Bütün hesapların toplam riski** (yalnız haber) — öz denetim artık 35 denetim. Sorun giderme: [Toplam risk eşiği aşıldı](#/kilavuz/sorun-giderme/toplam-risk).
- **Telegram sadeleşti:** pazartesi eski 📋 haftalık rapor mesajı artık gelmez — yerini [Haftalık karne](#/kilavuz/raporlar/karne) aldı (haftalık rapor yine hazırlanır, Raporlar'da okunur). Para çekme izni açık bir anahtar için Sağlık'taki **API anahtarı yetkisi** alarmı gittiyse sabah 06:15 [anahtar sınaması](#/kilavuz/bildirimler) bildirimi aynı satırı tekrarlamaz (tek ileti).
- Güncelleme sunucuda **onaylı** kurulur ([Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme)): botların emir kapısına (yalnız sınır kipinde takılan) bir kanca eklendi; izleme kipinde davranış birebir aynı.

## 75.9 — Başka makinelerdeki botlar, Telegram'da yönetici, karnede eşler (2026-10-25) {#s75-9}
- **Yeni: [Botlar › Özet › Başka makinelerdeki botlar](#/kilavuz/botlar/baska-makine).** Eşlenmiş sunucu varsa o makinelerde çalışan botlar (taşıdıklarınız dahil) ayrı bir kartta: makine, hesap türü, durum, son nabız ve **o makinede aç ↗**. Yalnız okuma — Başlat / Durdur botun çalıştığı makinenin panelinde. Başka makineye taşınan botun bu bilgisayardaki eski kopyasının kartında "Bu bot artık … makinesinde çalışıyor" bandı çıkar.
- **[Telegram › Makineler](#/kilavuz/telegram-menu):** hangi makinenin yönetici olduğu, komutları **şu an kimin dinlediği** (geçici devralma dahil, başladığı saatle) ve eşlerin son nabzı. Telegram'dan yazma yine yok.
- **[Haftalık karne](#/kilavuz/raporlar/karne)** artık eşlenmiş sunucuların botlarını da sayar — makine başına ayrı bölüm; o an ulaşılamayan makine "okunamadı" diye yazılır. Eşten yalnız yüzdeler gelir.
- Eşlenmiş makine yoksa hiçbir şey değişmez. Botların karar kodu değişmedi. Güncelleme sunucuda **onaylı** kurulur ([Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme) › "Güncellemeyi kur"); karnede eşin botlarını görmek için iki sunucu da 75.9'da olmalı.

## 75.8 — Ortak borsa arayüzü, OKX hazırlığı (2026-10-25) {#s75-8}
- Botların borsayla konuşan parçası ortak bir arayüze taşındı; Binance
davranışı bit bit aynı (75.4'ün çağrı iziyle, kuru denemeyle ve 120 günlük yeniden oynatmayla doğrulandı). OKX için bağdaştırıcı ve
sahte OKX'le tam hata matrisi yazıldı; OKX henüz **bağlanamaz** (hazır değil) — demo hesap bağlama ve OKX demo botu sonraki sürümde.
Canlı hesap yolu kapalı. Panelde görünen değişiklik yok. Güncelleme onaylı.

## 75.7 — Olay akışı ve haftalık karne (2026-10-25) {#s75-7}
- **Yeni sayfa: Sistem › Olay akışı.** Bütün olaylar tek çizelgede, en yeni üstte: botun emirleri (doldu / reddedildi), başlatma ve durdurma, ENGEL ve güvenli kip, öz denetim sorunları, giden bildirimler, ayar değişiklikleri, güncellemeler, Pusula'nın açılışları, model portföylerin ay sonu kararları. Süzgeç: tür, bot, makine, önem, tarih, arama. Eşlenmiş başka makine varsa onun olayları da aynı çizelgede; geliştirme bilgisayarında sunucunun olayları da görünür. **1 yıl saklanır.** Yalnız okuma; tutarlar yazılmaz.
- **Yeni: Haftalık karne.** Raporlar sayfasının en üstünde: geçen haftanın (pazartesi–pazar) her bot için getirisi, aynı haftada BTC ve BTC'ye fark, hafta içi en büyük düşüş, işlem sayısı; Portföyüm ve model portföyler; sorunlar; Kairos demo kabulü ve gölge testler (hüküm değil). Haftalar arasında gezilebilir, süren hafta önizlenir.
- **Telegram: pazartesi sabahı TEK mesaj** — haftalık karne (yalnız yüzdeler). Eski "Gölge testler haftalık özeti" artık bu mesajın içinde, ayrıca gelmez; onun aç/kapa, kanal ve sessiz saat ayarı karneye taşındı (Bildirimler › "Haftalık karne").

## 75.6 — API anahtarı yetkisi Sağlık'ta (2026-10-25) {#s75-6}
- Sağlık sayfasına yeni denetim: **API anahtarı yetkisi**. Pusula günde bir kez her borsa anahtarının izinlerini yalnız okuyarak sınar (Anahtarlar › Sına ile aynı; emir yok). Para çekme izni açıksa kırmızı olur, Sorunlar sayfasında kart çıkar ve Telegram'a bir uyarı gelir. Canlı hesapta IP kısıtı yoksa sarı bilgi verir. Botları durdurmaz.
- Düzeltme: Ayarlar › Anahtarlar'da "Binance canlı / demo (Kairos)" satırlarının son sınama sonucu artık görünüyor.

## 75.5 — Botu başka makineye taşımak, nöbet (2026-10-25) {#s75-5}

- **Yeni: [botu başka makineye taşı](#/kilavuz/botlar/bot-tasima).** Eşlenmiş iki **sunucu** arasında bir kâğıt ya da demo botu taşırsınız: **Ayarlar › Makineler › Botu başka makineye taşı** — yalnız botun bulunduğu bilgisayardan, **TAŞI** yazıp acil PIN. Bot burada durur (açık pozisyonlara, emirlere ve felaket stoplarına dokunulmaz), verisi öteki makineye gider. Demo botun hesap anahtarı **yedek şifresiyle şifreli** gider (iki bilgisayarda aynı yedek şifresi). Hedefte bot **kendiliğinden başlamaz**: önce Mutabakat, temizse Başlat.
- **Taşınmaz:** canlı hesap botu, **Kairos** (demo kabulü 2026-12-09'a kadar), model örnekleri.
- **[Nöbet](#/kilavuz/botlar/bot-nobet):** aynı bot iki makinede aynı anda çalışamaz. Taşınan botun eski kopyası salt okunurdur (Başlat, Çalıştır, Acil … reddedilir; Durdur serbest). Eşlenmiş sunucu varken açılışta botlar önce eşlere sorulur; eşlere ulaşılamazsa bot **kendiliğinden başlamaz** ve Telegram'a haber gelir — bot başka yerde çalışmıyorsa elle Başlat. Kairos demo kabulü süresince bu kural Kairos için yalnız haber verir. Tek bilgisayarda hiçbir şey değişmez.
- **Yarıda kalan taşıma:** hedef reddederse ya da paket bozuk gelirse hiçbir şey değişmez; bir makine kapanırsa yapılanlar geri alınır ya da sonuç açılışta kendiliğinden tamamlanır; sonucu belli değilse bot **iki makinede de başlamaz** ve kartta **Yeniden denetle** çıkar.
- Botların karar kodu değişmedi (kuru deneme: Kairos kâğıt, Kairos demo, Tao kâğıt — üçü de aynı). Sunucu programı değiştiği için güncelleme sunucuda **onaylı** kurulur ([Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme) › "Güncellemeyi kur"). Botu taşımak için iki sunucu da 75.5'te olmalı.

## 75.4 — Planlı kapanış doğru tanınıyor (2026-10-25) {#s75-4}

- **Düzeltme:** planlı kapanış (Pusula'yı durdur, güncelleme sonrası yeniden başlatma, düzgün kapatma) artık doğru tanınıyor. [Sağlık](#/kilavuz/saglik)'taki beklenmedik kapanış (günlük açılış) sayacı bundan sonra doğru sayar: planlı açılışlar ayrı gösterilir, "günde 5'ten çok" uyarısına girmez.
- Botların kodu ve kararları değişmedi (kuru deneme: Kairos kâğıt, Kairos demo, Tao kâğıt — üçü de aynı). Sunucu programı değiştiği için güncelleme sunucuda **onaylı** kurulur ([Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme) › "Güncellemeyi kur").

## 75.3 — Yönetici makine, geçici devralma, kademeli güncelleme (2026-10-25) {#s75-3}

- **Yeni: [yönetici makine](#/kilavuz/ayarlar/makine-yonetici).** Telegram komutlarını (`/durum`, `/menu` …) tek bir makine dinler; iki makine aynı anda dinlerse Telegram çakışır. **Ayarlar › Makineler › Yönetici yap** (acil PIN) ile hangisinin dinleyeceğini siz seçersiniz; seçim öteki makinelere kendiliğinden iletilir. Seçim yapılmazsa dinleyebilen sunucular arasından biri kendiliğinden seçilir. Bildirimleri her makine kendi botları için göndermeye devam eder.
- **Geçici devralma:** seçilen yönetici **30 dakika** ulaşılamazsa öbür sunucu komutları geçici olarak dinler ve Telegram'a yazar; yönetici geri gelince bırakır ve yine yazar. İki makine çalışıyor ama birbirini göremiyorsa (ör. Tailscale koptu) geçici dinleyen makine Telegram'ın çakışma yanıtını görünce **hemen geri çekilir** ve bir kez haber verir — iki makine sürekli birlikte dinlemez.
- **Sessiz makine uyarısı:** eşlenmiş bir sunucu 30 dakika nabız vermezse Telegram'a **tek uyarı**, geri gelince **tek bilgi** (geliştirme bilgisayarı için [Bildirimler](#/kilavuz/bildirimler)'deki "Makine sessiz" süresi, varsayılan 24 saat). Uyarıyı yalnız o an Telegram'ı dinleyen makine yollar.
- **[Kademeli güncelleme](#/kilavuz/ayarlar/makine-kademe):** birden çok sunucu varsa yeni sürümü önce **bot çalıştırmayan** makine kurar ve 8 dakika kararlı çalışır; sonra bot çalıştıranlar sırayla. Sırası gelmeyen sunucuda [Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme) "sırada bekliyor" der, 5 dakikada bir yeniden dener; onayınız korunur. Tek bilgisayarda hiçbir şey değişmez.
- Botların kodu ve kararları değişmedi (kuru deneme: Kairos kâğıt, Kairos demo, Tao kâğıt — üçü de aynı). Sunucu programı değiştiği için güncelleme sunucuda **onaylı** kurulur ([Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme) › "Güncellemeyi kur").

## 75.2 — Makineler: makine kimliği, eşleme, nabız ve Makineler panosu (2026-10-25) {#s75-2}

- **Yeni: [Ayarlar › Makineler](#/kilavuz/ayarlar/makineler).** Her Pusula kendine bir **makine kimliği** verir (ilk açılışta bir kez). İki bilgisayar (örneğin sunucu ve geliştirme bilgisayarı) Tailscale üzerinden bir kez **eşlenir**: birinde 10 dakikalık tek kullanımlık kod üretilir, ötekinde o kod yazılır; iki işlem de **acil PIN** ister ve Telegram'a "Makine eşlendi" uyarısı gider.
- Eşlenen makineler **5 dakikada bir** birbirine **nabız** gönderir (sürüm, botlar, güncelleme durumu, boş disk). Pano her makinenin **son görülme** zamanını, sürüm uyumunu ve botlarını gösterir; sekmedeki ışık sessiz ya da reddeden makineyi haber verir.
- **Pano yalnız görüntüler.** Eşlenen makine yalnız bot durumunu okuyabilir ve nabız gönderebilir; bot başlatamaz, emir veremez, ayar / anahtar değiştiremez, Portföyüm'ü okuyamaz. Eşlenmiş makine yokken Pusula **hiçbir yere istek göndermez**. Yönetici makine seçimi ve botu başka makineye taşıma sonraki sürümlerde.
- Botların kodu ve kararları değişmedi (kuru deneme: Kairos kâğıt, Kairos demo, Tao kâğıt — üçü de aynı). Sunucu programı değiştiği için güncelleme sunucuda **onaylı** kurulur ([Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme) › "Güncellemeyi kur").

## 75.1 — İç düzenleme: sunucu programının bölünmesi tamamlandı (2026-10-25) {#s75-1}

- **Görünür değişiklik yok.** Sunucu programının parçalara bölünmesinin son adımı: **bot yönetimi** (Kairos, Tao ve sizin oluşturduğunuz botlar — bot kaydı, açılışta bağlanma, bekçi, sağlık sinyali), **Botlar** ve **bot** uçları (başlat, durdur, mod, kâğıt hesabı sıfırla, acil fren, işlemler, grafik), **Borsa hesapları**, hesap işlemleri, **Kalkan** ile sunucunun **açılış ve kapanış** işleri ayrı dosyalara taşındı.
- Panelin bütün düğmeleri, yanıtları, yetki kuralları (PIN, acil PIN, telefon, geliştirme bilgisayarı, araştırma kopyası) ve sıraları **aynı**; bunu uç listesinin birebir karşılaştırması, eski ve yeni sürümün yan yana yanıt karşılaştırması ve güvenlik testleri doğruluyor. **Botların kodu ve kararları değişmedi** (kuru deneme: Kairos kâğıt, Kairos demo, Tao kâğıt — üçü de aynı).
- Sunucu programı değiştiği için güncelleme sunucuda **onaylı** kurulur ([Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme) › "Güncellemeyi kur").

## 75.0 — İç düzenleme: sunucu programının bölünmesi sürüyor (2026-10-25) {#s75-0}

- **Görünür değişiklik yok.** Sunucu programının en büyük dosyasının parçalara bölünmesinin ikinci adımı: **ayar ve gizli anahtar saklama**, **Ayarlar** uçları, **Sağlık** (öz denetim, ikinci uyarı kanalı, olay raporu, veri kalitesi, sağlık sinyali), **Sorun merkezi** ve sorun araçları, **bildirimler** ve **Telegram komutları**, **ileri test** ile **Portföyüm**, **İşlem defterim**, **Anahtarlar**, portföy tasarımcısı ve **ayar geçmişi** uçları ayrı dosyalara taşındı.
- Panelin bütün düğmeleri, yanıtları, yetki kuralları (telefon, geliştirme bilgisayarı, araştırma kopyası) ve sıraları **aynı**; bunu uç listesinin birebir karşılaştırması, eski ve yeni sürümün yan yana yanıt karşılaştırması ve güvenlik testleri doğruluyor. **Botların kodu ve kararları değişmedi.**
- Sunucu programı değiştiği için güncelleme sunucuda **onaylı** kurulur ([Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme) › "Güncellemeyi kur").

## 74.9 — İleri test: Kairos 10× gölge hesabı (2026-10-25) {#s74-9}

- **Yeni: [Kairos 10× gölge hesabı](#/kilavuz/ileri-test/kairos-10x)** (İleri test › Kairos 10× gölge). Kairos demo botunun demo kabul başlangıcından (7 Ekim 2026) bu yana yaptığı **gerçek işlemler** kâğıt üstünde kopyalanır: BTC ayağı aynen, Donchian + DCA kolu **3× yerine 10×** (miktar, ücret ve funding 10/3 büyür), aynı başlangıç sermayesi. **Emir yok, para yok** — gölge Kairos'un dosyalarını yalnız okur; demo kabul testi ve Kairos'un kararları etkilenmez.
- Kartta **karşılaştırma tablosu** (Kairos 3× gerçek demo / 10× gölge / BTC al-tut: getiri, en büyük düşüş, en kötü gün içi, en düşük marj tamponu, tasfiye), **güncel fiyatla anlık** satır ve iki grafik (birikimli getiri, marj tamponu).
- **Marj tamponu** (marj bakiyesi ÷ bakım marjı, gün içinin en kötü anında) 2'nin altına inerse kartta **bilgi** notu (Telegram'a gitmez); 1'in altına inerse gölge **"tasfiye oldu"** diye işaretlenir ve araştırma simülatörüyle aynı kuralla kalan parayla sürer.
- **Mutabakat:** kol 3× alınırsa hesap Kairos'un gerçek değerini birebir verir. Botların kodu değişmedi. Sunucu programı değiştiği için güncelleme sunucuda **onaylı** kurulur (Ayarlar › Güncelleme › "Güncellemeyi kur").

## 74.8 — İç düzenleme: sunucu programı parçalara bölünmeye başladı (2026-10-25) {#s74-8}

- **Görünür değişiklik yok.** Sunucu programının en büyük dosyası, bakımı kolaylaşsın diye birkaç sürümde parçalara bölünüyor. Bu sürümde **güncelleme** uçları, **araştırma** uçları (gösterge, strateji listesi, Pine içe aktarma, backtest, tarama, veri indirme) ve eski **kâğıt motor** uçları ayrı dosyalara taşındı.
- Panelin bütün düğmeleri, yanıtları, yetki kuralları (telefon, geliştirme bilgisayarı, araştırma kopyası) ve sıraları **aynı**; bunu uç listesinin birebir karşılaştırması ve güvenlik testleri doğruluyor. **Botların kodu ve kararları değişmedi.**
- Sunucu programı değiştiği için güncelleme sunucuda **onaylı** kurulur ([Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme) › "Güncellemeyi kur").

## 74.7 — Bot kaydı tek kaynak: Kairos ve Tao ayarı yalnız kayda yazılır (2026-10-25) {#s74-7}

- **Kairos ve Tao'nun ayarının tek kaynağı artık [bot kaydı](#/kilavuz/botlar/bot-kaydi).** Mod, küçük sermaye, sermaye üst sınırı ve kâğıt sıfırlamadaki BTC ayağı yalnız kayda yazılır; iki yere ayrı ayrı yazma kalktı. Eski ayar dosyasındaki bölüm kayıttan kendiliğinden kopyalanır (**geri dönüş kopyası**): panelden eski bir sürüme dönülse de botlar aynı ayarla çalışır.
- Eski sürüme dönüp orada ayar değiştirirseniz ya da ayar dosyasını elle düzenlerseniz, açılışta **ayar dosyası kazanır** (eskisi gibi) ve kayıt düzeltilir.
- [Ayar geçmişi](#/kilavuz/ayarlar/ayar-gecmisi)'nde Kairos/Tao değişikliği artık **bir kez** görünür (Bot kaydı türüyle); aynı değişikliğin ayar dosyası satırı ayrıca yazılmaz.
- Ayar yaması (POST /api/config) Kairos/Tao alanlarını kayda alan alan yazar; Tao'nun ve modların üstüne yazmaz. Kairos'un demo sermaye sınırı bu yoldan da demo kabulü süresince değişmez.
- **Kararlar ve davranış aynı** (eski ve yeni kodla kuru deneme birebir; bot kodu değişmedi). Güncelleme sunucuda kendiliğinden kurulur.

## 74.6 — Model örnekleri: Nova, Lydia, Simurg için ikinci kâğıt hesap (2026-10-25) {#s74-6}

- **Yeni: [Model örnekleri](#/kilavuz/portfoy-botlari/model-ornegi)** — Ayarlar › Botlar › Bot kayıtları › Yeni bot listesinde **Nova örneği** (USD), **Lydia örneği** (TL) ve **Simurg örneği** (USD). Örnek modelin **aynı kararlarını** kullanır, **kâğıt hesabı ayrıdır** (kendi sermayesi, işlemleri, grafiği). Başlangıç: modelin ilk günü (ana kâğıt hesapla aynı dönem) ya da yarından itibaren. PIN istemez, onay ister.
- Örnek **yan menüde ayrı öğe** (Botlar › Portföy botları, modelinin altında; arşivlenince düşer) ve **kendi sayfasında** (#/botlar/<kimlik>) portföy botları gibi görünür; Botlar › Özet'te, Ayarlar › Botlar özetinde, Ana sayfada, raporda ve Telegram'ın kâğıt hesap alım-satım özetinde de. Portföy botu sayfasının başlığında "bu modelin kâğıt hesapları" geçiş satırı.
- **Yalnız kâğıt:** model örneğine bu sürümde borsa hesabı bağlanmaz, demo ya da canlı moda geçilmez (açık ret). Kâğıt sermayesi Bot kayıtları'ndan değişir (o gün para yatırma/çekme olarak işlenir); arşivle / geri getir dosyaları silmez.
- Ana kâğıt hesaplar (Nova, Lydia, Simurg) ve Kairos / Tao **aynı**: kâğıt hesap kodu örnek verilmediğinde eskisiyle birebir çalışır (eski ve yeni kodla aynı girdiler — sonuç ve yazılan dosyalar aynı).
- Bot adları (kairos, tao, nova, lydia, simurg) artık yeni botun kimliği olamaz (ör. "nova2" olur).

## 74.5 — Panelden yeni bot (kâğıt), hesap bağlama, sermaye üst sınırı, arşiv (2026-10-25) {#s74-5}

- **Yeni: [Yeni bot oluşturmak](#/kilavuz/botlar/yeni-bot)** — Ayarlar › Botlar › **Bot kayıtları**. Yalnız sınanmış kurallar: **Kairos tipi** (küçük sermaye kuralı Kairos-S seçenek olarak) ya da **Tao tipi**. Yeni bot her zaman **kâğıt hesapta** ve durmuş başlar (gerçek emir yok); PIN istemez, onay ister. Botlar sayfasında, Ana sayfada, öz denetimde, raporda, Telegram'da ve Hesaplar'da kendi adıyla görünür.
- **Demo hesabı bağlama** (acil PIN): Anahtarlar'daki bir **Binance demo** hesabı bota bağlanır, sonra bot demo moda geçebilir. **Aynı borsa hesabını aynı anda yalnız bir bot kullanır** (kâğıt botlar hariç) — Kairos'un demo hesabı başka bota bağlanamaz. Bota bağlı hesap Anahtarlar'dan silinmez; Anahtarlar'daki "kullanan" sütunu artık bağlı botları gösterir.
- **Sermaye üst sınırı** her bot ve mod için (USD): bot bu tutardan fazlasını kullanmaz, hesapta daha az varsa hesaptakini. Kâğıt: onay; demo sınırını artırmak: acil PIN. Kairos'un demo sınırı demo kabulü süresince değişmez.
- **Arşivle / geri getir:** kâğıttaki durmuş yeni bot listelerden kalkar; kaydı ve dosyaları silinmez, geri getirilebilir. Kairos ve Tao arşivlenmez.
- **Canlı hesap 5. faza kadar yalnız Kairos ve Tao'da:** yeni bot canlı moda geçemez, canlı hesaba bağlanamaz.
- Yeni Kairos tipi botun gölge kıyası Kairos modeli (hucum.C0): kâğıtta sapma botu durdurmaz, yalnız uyarı; kartta "kıyas: Kairos modeli" notu.
- **Kairos ve Tao'nun davranışı ve sayıları aynı** (eski ve yeni kodla kuru deneme birebir). Bot kodu değiştiği için güncelleme sunucuda **onaylı** kurulur (Ayarlar › Güncelleme › "Güncellemeyi kur").

## 74.4 — Bot kaydı: her bot için ayrı dosya (2026-10-25) {#s74-4}

- **Yeni: [Bot kaydı](#/kilavuz/botlar/bot-kaydi).** Kairos ve Tao'nun tanımı artık kendi dosyalarında (`live/botlar/hucum.json`, `live/botlar/denge.json`): kural, mod, mod başına sermaye üst sınırı, kâğıt bakiyesi, coin sepeti, küçük sermaye, BTC ayağı ve bağlı borsa hesabı (Anahtarlar'daki hesap adıyla). **Kayıtta sır yok** — anahtarlar ve sağlık adresi yerinde.
- **İlk açılışta kendiliğinden geçiş:** ayarlar eski yerinden kayda geçirilir; kayıttan üretilen ayar eskisiyle birebir aynı değilse geçirilmez, botlar eski yoldan çalışır ve uyarı yazılır.
- **Botlar sayfasındaki bot listesi** artık kayıtlardan geliyor (görünüm aynı). Değişiklikler hem kayda hem eski ayar dosyasına yazılır — eski sürüme dönmek güvenli. [Ayar geçmişi](#/kilavuz/ayarlar/ayar-gecmisi)'nde yeni tür: **Bot kaydı**.
- **Davranış aynı:** iç adlar, bot klasörleri, demo hesabı, sağlık adresi, gölge karşılaştırması ve kararlar değişmedi; eski ve yeni kodla kuru deneme ve 120 günlük geçmiş yeniden oynatma birebir aynı çıktı. Kairos'un demo kabulü (2026-12-09) sürüyor.
- Panelden yeni bot kurmak sonraki sürümde. Bot kodu değiştiği için güncelleme sunucuda **onaylı** kurulur (Ayarlar › Güncelleme › "Güncellemeyi kur").

## 74.3 — Veri kalitesi kapısı (2026-10-25) {#s74-3}

- **Yeni: [Sistem › Sağlık › Veri kalitesi](#/kilavuz/saglik/veri-kalitesi).** Botun günlük kararından önce girdileri tek kapıdan geçer: **vadeli ↔ spot BTC günlük kapanışı** (iki kaynak, ikisi de Binance; fark %1,5 hafif, %3 ağır), mark fiyatı, hesap bakiyesi; karardan sonra coin evreni, kol coinlerinin mumları ve funding. Her günlük çalışma bot klasöründe `veri-kalitesi.jsonl` dosyasına bir satır yazar (yalnız eklenir, yedeğe girer).
- **İlk kip İZLEME (7 gün gözlem):** bulgular yalnız kaydedilir, botların kararı **değişmez**. Kart izleme başlangıcını ve şimdiye kadarki bulgu sayılarını gösterir; 7 gün dolunca "etkin kipe geçmek ister misiniz" der — **Pusula kendiliğinden geçmez**. **Etkin kipte** ağır bulguda bot o günkü kararı erteler ve güvenli kipe girer (yeni işlem yok, stoplar borsada); bot 15 dakikada bir yeniden denetler, veri temizlenince kendiliğinden çıkar.
- **Demo kabul botu (Kairos)** 2026-12-09 sonuna kadar her kipte **yalnız haber** alır. İkinci kaynak okunamazsa yalnız hafif bulgu — karar asla engellenmez. Funding hiçbir zaman ağır değildir.
- Sağlık'ta yeni denetim satırı **Veri kalitesi** (sarı: hafif bulgu, tek bilgi iletisi; kırmızı: ağır bulgu ya da veri güvenli kipi); Sorunlar'da [bulgu kartı ve adımlar](#/kilavuz/sorun-giderme/veri-kalitesi). Kip değişikliği yalnız sunucu bilgisayarındaki panelden, onayla; telefonda yalnız görüntüleme. Araştırma kopyası sunucunun durumunu gösterir.
- Mevcut veri kapısı (bayat mum, boşluk, anlamsız sıçrama) aynen çalışıyor. Bot kodu değiştiği için güncelleme sunucuda **onaylı** kurulur (Ayarlar › Güncelleme › "Güncellemeyi kur").

## 74.2 — Ayar geçmişi ve geri alma (2026-10-25) {#s74-2}

- **Yeni alt sayfa: [Ayarlar › Ayar geçmişi](#/kilavuz/ayarlar/ayar-gecmisi).** Panelin yazdığı her ayar değişikliği tek listede: ne zaman, hangi makinede, nereden (panel, Telegram, araç, sistem), hangi ayar, **eski → yeni**. Süzgeç: makine, tür, tarih.
- **Sırlar kayda girmez:** anahtar, jeton, PIN, parola, sağlık adresi yerine **•••** — yalnız "değişti" bilgisi. Model sermayesi tutarları da yazılmaz.
- **Geri al:** tek bir değişiklik eski değerine döner — yalnız bilgisayardan, **acil PIN** ile; güvenlik sınırını gevşeten geri alma ayrıca **GERİ AL** yazdırır. Değer normal kaydın aynı denetimlerinden geçer; geri alma da yeni bir satır olarak yazılır. Ayar sonradan yeniden değiştiyse eski satır geri alınamaz.
- Kayıt yalnız eklenir (5 MB / 1 yıl dolunca eski parça ayrı dosyaya, silinmez); yedeğe ve taşıma dosyasına girer. Telefonda yalnız görüntüleme. Araştırma kopyasında sunucunun kaydı da gösterilir.
- Botların karar ve emir kodu değişmedi. Sunucu dosyaları değiştiği için güncelleme sunucuda **onaylı** kurulur (Ayarlar › Güncelleme › "Güncellemeyi kur").

## 74.1 — Yapay zekâ notları ve Telegram'da tutarlar gizli (2026-10-25) {#s74-1}

- **Yeni sayfa: [İzleme › Yapay zekâ notları](#/kilavuz/yapay-zeka-notlari).** Başlığında **Yalnız not · karar yok**. Sunucu her sabah ~07:00'dan sonra bir kez, kamuya açık metinleri Google Gemini'ye (**ücretsiz katman**) okutur: coin dikkat listesinin kısa listesi (İZLE ilk 15 + KAÇIN'a bu hafta yeni düşen 5; Google Haberler ve Binance delist duyuruları), elinizdeki ve BIST 100'deki şirketlerin KAP bildirimleri, Nova / Simurg hisselerinin SEC bildirimleri (8-K okunur, 10-Q / 10-K başlık).
- **Her not doğrulanmış:** iddia + kaynaktan **kelimesi kelimesine alıntı** + kaynak bağlantısı ve tarihi. Alıntısı kaynakta birebir geçmeyen, bağlantısı uydurulan iddia **reddedilir** ve ayrı katta nedeniyle gösterilir. Sayfa metni modele gitmeden temizlenir (gizli yazılar, yorumlar, betikler atılır). Her sabah önce **kanarya** sınaması: içine sahte talimat gömülmüş bir sayfa; model uyarsa o günün notları "güvenilmez" işaretlenir.
- Notlar dikkat listesini, kuralları ve botları **değiştirmez**; model hiçbir şeye yazamaz. Önemli görünen notlar **incele** bayrağı alır; Telegram'a yalnız bunlar için **günde en çok 1** özet gelir (yeni bildirim türü **Yapay zekâ notları (incele)**, kapatılabilir).
- **Gemini anahtarı:** Ayarlar › Anahtarlar'da yeni **Yapay zekâ** grubu › **Gemini API anahtarı** ([ücretsiz, adım adım](#/kilavuz/yapay-zeka-notlari/anahtar): aistudio.google.com › Get API key; **faturalandırma açmayın**). **Sına** yalnız model listesini sorar. Anahtar yokken hiçbir şey okunmaz, Sorunlar'da mavi bilgi kartı durur. Günde en çok 40 istek; ücretsiz kota dolarsa ertesi gün devam.
- **Telegram'da tutarlar gizli (bildirimler de):** günlük özet, işlem ve alarm mesajlarındaki para tutarları ve işlem miktarları **•••** — yüzde, kur, fiyat, saat, sembol görünür; kritik alarmların anlamı değişmez. Ayarlar › Bildirimler › **Telegram'da tutarları gizle** (varsayılan açık). Bilanço, piyasa olayları ve yapay zekâ notları kamuya açık bilgi olduğu için gizlenmez. [Ayrıntı](#/kilavuz/bildirimler/tutarlar).
- **Geçici sessiz panelde:** Telegram'dan "1 saat sessize al" denmişse Sistem › Bildirimler › Sessiz saatler kartında görünür; **Erken bitir** ile hemen kalkar (bekleyenler tek özet gelir).
- Ayarlar › Bildirimler'deki komut notu güncellendi: **/menu** ve 74.0'ın yeni komutları.
- Botların karar ve emir kodu değişmedi. Sunucu dosyaları değiştiği için güncelleme sunucuda **onaylı** kurulur (Ayarlar › Güncelleme › "Güncellemeyi kur").

## 74.0 — Telegram menüsü (2026-10-24) {#s74-0}

- **[Telegram menüsü](#/kilavuz/telegram-menu):** Telegram'a **/menu** yazın — tek mesaj açılır, düğmelere bastıkça **aynı mesaj** güncellenir (sohbet dolmaz). Ekranlar: **Botlar** (bot başına kart, ayrıntı, pozisyonlar) · **Sorunlar** (Sorunlar sayfasının kartları: adımlar, "Neyi saydı?") · **Portföy** · **İleri test** (başında "🧪 GÖLGE TESTİ — emir yok; ara sonuç, hüküm değil", gölge getirileri, hüküm takvimi) · **Piyasa** (bu hafta + makro) · **Bilanço** (son özet) · **Güncelleme** · **Makineler** · **Bildirim ayarları** · **Komutlar**. Her ekranda **◀ Menü**.
- **Telegram'ın komut listesi:** sohbette "/" yazınca ya da sol alttaki **Menü** düğmesinde bütün komutlar açıklamalarıyla çıkar. Yeni kısa yollar: `/botlar` `/sorunlar` `/portfoy` `/piyasa` `/bilanco` `/guncelleme` `/makineler`; `/start` menüyü açar. Eski komutlar aynen çalışır.
- **Telegram'dan yine yazma yok:** güncellemeyi kurmak, botu yeniden açmak gibi işlerde düğme **paneli açar** (↗; doğru sayfa: Sorunlar, Botlar › o bot, Ayarlar › Güncelleme, Bildirimler), işlem orada acil PIN ile. Düğmeler için Ayarlar › Bildirimler › **Panel adresi** gerekir; boşsa mesajda yalnız yol yazar.
- **Tek istisna — 🔕 1 saat sessize al:** kritik olmayan bildirimler bir saat bekler, süre bitince tek özet gelir. Acil durum, koruma stopu, ENGEL / güvenli kip / emir freni ve güvenlik uyarıları susmaz.
- **Bildirimlere düğme:** alarm ve uyarı mesajlarının altında **Ayrıntı** (o sorunun adımları), **Panelde çöz ↗**, kritik olmayanlarda **1 saat sessize al**.
- **Tutarlar gizli:** Telegram'daki menüde ve komut cevaplarında USD / TL tutarı ve coin miktarı yok, yalnız yüzde (`/durum` sermaye satırı, `/pozisyonlar` nominal ve kâr / zarar tutarı yüzdeye döndü, `/ozet`'te tutar "•••").
- Güvenlik: düğmelere yalnız kayıtlı chat id basabilir; düğme verisi imzalıdır (taklit ya da bilinmeyen veri hiçbir şey yaptırmaz); yalnız en son menü mesajının düğmeleri çalışır, eskisi "süresi doldu, /menu" der; art arda hızlı basışa hız sınırı.
- Botların karar ve emir kodu değişmedi. Telegram gönderim ve yoklama dosyası (lib/telegram.js) değiştiği için güncelleme sunucuda **onaylı** kurulur (Ayarlar › Güncelleme › "Güncellemeyi kur").

## 73.9 — Piyasa bağlamı ve WinC panosu (2026-10-24) {#s73-9}

- **Yeni sayfa: [İzleme › Piyasa bağlamı](#/kilavuz/piyasa-baglami).** Başlığında **Karar kuralı yok · bilgi**: buradaki hiçbir gösterge botların kararına girmez, sayfa emir vermez. Yedi grup: **olay takvimi** (FOMC faiz kararı, Türkiye ve ABD TÜFE, BIST bilanço son günleri, elle eklenen coin kilit açılımları; geçen iki haftanın açıklanan sonuçları) · **makro pano** (net likidite, ^IRX ve Fed politika faizi, sentetik dolar endeksi, USD/TRY, enflasyon, stablecoin arzı, MVRV, kredi spreadi, COT — CME Bitcoin ve Nasdaq-100) · **opsiyon** (BTC ve ETH: gamma maruziyeti, max pain, ~30 günlük örtük oynaklık, 25Δ çarpıklık, put/call — sunucunun 73.3 ileriye kaydından; OKX + Bybit + Binance) · **pozisyonlanma** (funding, açık pozisyon ve z-skoru, büyük hesap long/short, Hyperliquid'in en büyük 100 hesabı) · **akış** (taker al/sat ve CVD, Coinbase primi, çeyreklik vadeli baz) · **duygu ve genişlik** (korku-açgözlülük, alt sezonu, RSI haritası) · **protokol kartı** (DefiLlama ücret, gelir, TVL, P/F, P/S).
- **Her kart dürüst:** kaynak, güncelleme sıklığı ve veri zamanı yazar; verisi eskidiyse **bayat** (değerler soluk, "son veri … — neden"), hiç yoksa **veri yok — neden**. IV ve çarpıklık sırası bir yıllık veri ister: dolana kadar "veri birikiyor: N gün". Pusula'da strateji olarak sınanıp geçmeyen göstergelerde "bu gösterge strateji olarak sınandı, geçmedi: deneme N" notu.
- **Ana sayfa › Bu hafta:** haftanın olayları ve açıklananların sonucu, altta Piyasa bağlamı bağlantısı.
- **Telegram:** iki yeni tür ([Bildirimler](#/kilavuz/bildirimler/yeni)) — **Piyasa takvimi** (pazartesi 09:00 sonrası haftanın olayları tek mesaj + olaydan bir gün önce 18:00 sonrası hatırlatma; saatler ayarlanabilir) ve **Olay sonucu** (FOMC kararı, açıklanan TÜFE; yalnız rakam). Bilanço sonuçları zaten Bilanço özetinde — iki kez gelmez.
- Kaynakların hepsi ücretsiz ve anahtarsız (FRED, CFTC, Coinbase, Binance, alternative.me, DefiLlama, Coin Metrics, federalreserve.gov); toplayıcı yalnız sunucuda çalışır, botların karar penceresinde ağ isteği atmaz. Geliştirme bilgisayarı sunucunun verisini gösterir. Bir kaynak uzun süre alınamazsa Sorunlar'da bilgi kartı.
- Botların karar ve emir kodu değişmedi. Bildirim merkezi ve sunucuya yeni bir toplayıcı eklendiği için güncelleme sunucuda **onaylı** kurulur (Ayarlar › Güncelleme › "Güncellemeyi kur").

## 73.8 — Sorun araçları: hiçbir düğmenin çözemediği durumlar (2026-10-24) {#s73-8}

- **[Sorun araçları](#/kilavuz/sorun-giderme/sorun-araclari):** Sorunlar kartında önce **önizleme** (şimdi / sonra, uyarılar), sonra **acil PIN + onay kelimesi**. Önizlemeden sonra durum değiştiyse hiçbir şey uygulanmaz, yeni önizleme gelir. Telefondan da kullanılır; geliştirme bilgisayarından sunucuya iletilir. Araçlar **borsaya emir göndermez**; her uygulama günlüğe, botun olay kaydına ve Telegram'a (bilgi) yazılır.
- **Kaydı borsaya eşitle** (felaket stopu / ADL / likidasyon sonrası): tek coinin trend kolu ve kademeli alım kaydı borsadaki nete çekilir; sonra **Borsayla karşılaştır** temiz çıkınca kol engeli kalkar. Elle işlem, büyüyen pozisyon ya da belirsiz emirde uygulanmaz ve nedenini yazar.
- **Zarar sınırı (K3):** artık kartta görünür, çekildiği an Telegram'a bir kez alarm gider; **Zarar sınırını sıfırla** (PIN + SIFIRLA) mandalı kaldırır, yeni tepe bugünkü değer olur. Bu bir strateji kararıdır; sıfırlarsanız bot yeniden risk alır.
- **%5 uygulama sapması — Farkı kabul et:** bandın hangi günlerden geldiğini gösteren döküm; kabul edilen günler banda sayılmaz (kayıt silinmez), ENGEL kalkar ve aynı gün yeniden gelmez. Demo kabul ölçümü etkilenmez.
- **Pozisyon uyuşmazlığı açıklayıcısı:** "Neyi saydı?" tablosu coin başına borsa / bot kaydı / fark / son emirler / son dolum / stop-ADL olayı ve olası neden.
- **Emir freni dökümü:** fren sebebi, şu anki sayım ve son 24 saatin emirleri coin ve kol başına. Dökümde dolmadan iptal edilen emirler ayrıca sayılır; fren kapısının kendisi değişmedi (iptal edilen emirler nominale bugünkü gibi sayılır — gevşetmek sizin kararınıza bırakıldı).
- **Yatırmayı kabul et** ayrı düğme (yalnız yatırmayı kabul eder; engel ve fren kalkmaz). Çoklu varlık engellerinde alt türe göre 2–3 adım ve doğru düğme.
- **Kurulum denetimi:** görev sonuç kodlarının sade açıklaması (0x8007052E = Windows parolası değişti) ve kendiniz çalıştıracağınız tek komutluk düzeltme. **Taşıma sihirbazı:** "Eski bilgisayarda Pusula'yı durdurdum" onayı olmadan taşımaz.
- **Rozet:** başlık rozeti yalnız müdahale ve dikkat sayar; kendiliğinden geçecek ve bilgi kartları yalnız sayfada.
- Botların karar ve emir gönderme kodu değişmedi. Kayıt / engel / risk durumunu değiştiren araçlar ve emir freni sayımı canlı koda dokunduğu için sunucuda **onaylı** kurulur (Ayarlar › Güncelleme › "Güncellemeyi kur").

## 73.7 — Sorun merkezi, teşhis paketi ve Telegram /teshis (2026-10-24) {#s73-7}

- **Yeni sayfa: [Sistem › Sorunlar](#/kilavuz/sorunlar).** O an etkin her sorun tek kart: **ne oldu · ciddi mi** (zararsız / dikkat / tehlike ve nedeni) **· kendiliğinden geçer mi** (geçecekse tahmini kalkış saati: bakım bitişi + 15 dk, son tekrar + 60 dk, son stop vuruşu + 24 sa, borsa beklemesinin bitişi …) **· ne yapmalı** (2–5 adım) **· dokunmayın**. Botlar, güvenli kip, borsa bağlantısı, güncelleme, Telegram, sağlık sinyali, veri kaynakları, ileri test izleyicisi, ileriye kayıt, yedek, disk, sunucu bilgisayarı — hepsi aynı biçimde. Pusula'nın tanımadığı bir durum da sessiz kalmaz: "Tanınmayan sorun — sohbete gönderin" kartı çıkar. Sorun yoksa yalnız **Her şey yolunda · son denetim N dk önce**.
- **Rozet ve bant:** her sayfanın üstünde küçük rozet (kırmızı müdahale bekliyor · sarı dikkat · mavi kendiliğinden geçecek), yan menüde Sorunlar sayısı; ana sayfada yalnız müdahale / dikkat varken bant.
- **"Neyi saydı?":** botu durduran satırlar (zaman, ret kodu, sade açıklama), tekrarlayan hata satırı, pozisyon uyuşmazlığında coin başına borsa / kayıt farkı tablosu. Kartlarda yalnız var olan düğmeler (Borsayla karşılaştır, Botu yeniden aç, Güvenli kipi kaldır, Acil durdur, ilgili sayfa); "Kaydı borsaya eşitle", "Zarar sınırını sıfırla", "Farkı kabul et" 73.8'de gelecek (şimdilik kapalı düğme).
- **[Sohbete gönder](#/kilavuz/sorunlar/teshis):** tek düğme; sürüm / commit, makine rolü, etkin sorunlar, son olay raporunun özeti, botların durumu, sayaçlar ve son 30 dakikanın uyarı / hata satırları panoya. Anahtar, jeton, chat id, sağlık adresi ve e-posta silinir; paket 12 000 karakteri geçmez.
- **Telegram:** yeni **/teshis** komutu (etkin sorunlar + ilk iki adım; yalnız okur). Alarm ve uyarıların "Ne yapmalı" satırı ilgili sorunun 2–3 kısa adımını ve **Sorunlar** bağlantısını taşır — bağlantı için Ayarlar › Bildirimler › **Panel adresi** (isteğe bağlı). Kendi metin şablonlarınız aynen uygulanır ({ne_yapmali} bu metni taşır).
- **Tek bilgi + "geçti":** zararsız, kendiliğinden geçen durumlar artık uyarı değil tek bilgi iletisi; geçince "geçti" iletisi: güvenli kip (bakım, fiyat farkı, 24 saatte 2 stop vuruşu — tahmini kalkış saatiyle), internet kesintisi, fiyat okunamaması, borsa beklemesi, GitHub'a ulaşılamaması.
- **Sağlık:** her denetimin altında "ne yapmalı" satırı ve [Sorun giderme](#/kilavuz/sorun-giderme) bağlantısı.
- **Bilanço özeti sunucuda BIST 100 ile:** sunucu günde bir (07:00 sonrası, botun karar saatinde değil) yaklaşık 160 büyük hissenin son ~100 gününü düşük hızda indirir; BIST 100 (yaklaşık) liste bundan kurulur. Hata / hız sınırında 6 saat bekler.
- **Kılavuz:** [Sorun giderme](#/kilavuz/sorun-giderme) tamamlandı — her durum için belirti → anlam → kendiliğinden geçer mi → adımlar → ne zaman sohbete yazmalı; [Sunucu sessiz](#/kilavuz/sorun-giderme/sunucu-sessiz) karar ağacı (elektrik, internet, Windows yeniden başlatması, donma, antivirüs, parola); [uzaktayken neler yapılabilir](#/kilavuz/sorun-giderme/uzaktan) tablosu.
- Botların karar ve emir kodu değişmedi. Telegram gönderim kapısı, öz denetim ve güncelleyici değiştiği için sunucuda **onaylı** kurulur (Ayarlar › Güncelleme › "Güncellemeyi kur").

## 73.6 — Güvenlik ve yanlış alarmlar (2026-10-24) {#s73-6}

- **Bilanço özeti:** tek tek mesaj yerine günde en çok 2 özet (13:00 ve 20:30; bilanço yoksa mesaj yok). Kapsam BIST 100 (piyasa değeri ve hacimle kurulan yaklaşık liste; sunucuda bu veri yoksa ~30 hisselik yedek liste, panel bunu "yedek liste" diye gösterir) + elinizdekiler. Elinizdekiler her zaman en üstte "📌 elinizde — Lydia (BIST M10) / Portföyüm" etiketiyle; diğerlerinden en dikkat çeken net kâr değişimleri (zarardan kâra, kârdan zarara, en büyük artış/düşüş, satış), sonra "N şirket daha". Yorum yok. Ayar: hangi şirketler, mesaj saatleri, satır sayısı. [Ayrıntı](#/kilavuz/bildirimler).
- **Gölge testler haftalık özeti getiri rakamlarıyla:** başlangıçtan ve son 7 gün, aynı dönemde kıyas, işlem sayısı, bant, hüküm tarihi. Başlıkta ve her satırda açıkça "🧪 GÖLGE TESTİ — emir yok; ara sonuçtur, hüküm değildir". Sayılar İleri test ekranıyla aynı kaynaktan.
- **Pusula arka planda hiç PowerShell açmıyor — Kurulum denetimi ve otomatik güncelleme dahil.** Kurulum denetimi görevleri Windows'un salt okuyan `schtasks` aracıyla, kısayolu dosyanın kendisinden okur; görev / kısayol onarımında **Onar** çalıştıracağınız komutu gösterir. Güncelleyici Pusula'yı kendi uçlarıyla durdurur ve yeniden başlatır (kapalıysa `schtasks /run PusulaBot`). 21–22 Ekim'de antivirüs tam bu davranış yüzünden Pusula'yı silmişti. [Ayrıntı](#/kilavuz/kurulum-denetimi).
- **Emir reddi bir kez sayılır ve koda göre sınıflanır:** aynı ret günlükte iki satır yazsa da bir kez sayılır; botu kapatan yalnız borsanın gerçek bir sebeple reddettiği emirler (teminat / bakiye yetmedi, kod hatası). Borsaya gitmeyen küçük emirler (asgari tutar altı, fiyat bandı) botu kapatmaz. Telegram metni koda göre ne yapacağınızı söyler. [Ayrıntı](#/kilavuz/saglik/tam-kapanma).
- **Açtığınız bot eski kayıtlarla yeniden kapanmaz:** "Botu yeniden aç" / "Engeli kaldır" / "Güvenli kipi kaldır" deyince öz denetim yalnız sonraki yeni olayları sayar; yine kapanırsa Telegram 6 saat beklemeden "açtığınız bot yeniden kapandı — sebep: …" yazar.
- **Güvenli kipte alarm yağmuru yok:** günlük çalışma ertelenir, **tek bilgi** iletisi ve kalkınca **"geçti"** iletisi gelir; healthchecks'e "başarısız" gitmez; "26 saattir çalışmadı" güvenli kipte geçen süreyi saymaz. Borsa verisi şüpheliyse (veri kapısı) alarm yerine uyarı. Bağlantı hataları "döngü çöktü" sayılmaz. [Ayrıntı](#/kilavuz/saglik/guvenli-kip).
- **Güncelleme:** yarıda kalınca **Şimdi kontrol et** görünür; güncelleyici paket kurulumu sırasında kapanırsa nöbetçisi Pusula'yı yeniden açar. Aynı sürüm iki kez geri alınırsa her gün yeniden denenmez ("elle bakılmalı"). "Yeniden başlatma gerekli" yalnız Pusula kapalıysa kırmızı. Onay iletisi doğru menüyü söyler ve telefondan da kurulabildiğini yazar. [Ayrıntı](#/kilavuz/ayarlar/guncelleme-izleme).
- **Donma bekçisi:** Pusula açık ama 10 dakika yanıt vermezse yalnız kendi sürecini kapatır, denetleyici yeniden açar.
- **Yanlış "tamam"lar ve çelişik kırmızılar düzeldi:** Telegram komut yoklaması 409/401 verirse görünür; sunucu sağlık sinyali adresi yoksa sarı; planlı yeniden başlatmalar "bugün N kez açıldı" sayısına girmez; tek tük günlük hatası öz denetim yeşilken ana sayfayı kırmızı yapmaz; geliştirme bilgisayarında Sistem kartı ışıklarının kaynağı (sunucu / bu bilgisayar) yazar; ay ortasında coin evreninin kısmi olduğu söylenir; .git/config uyarısı yalnız kod çalıştırabilen ayarlarda gelir.
- Ana sayfada duran bot tek adla ("durdu — onayınızı bekliyor") ve tek yerle (Sağlık kartı) gösterilir.
- **Yeni kılavuz bölümü: [Sorun giderme](#/kilavuz/sorun-giderme)** — belirti → anlam → adımlar. Taşıma bölümüne "eski bilgisayarı durdurun" adımı eklendi; kılavuz artık her yerde `npm ci` der.
- Bu sürüm botların kodunda yalnız bildirim / sağlık sinyali sınıfını değiştirir (karar ve emir aynı); sunucuda **onaylı** kurulur (Ayarlar › Güncelleme › "Güncellemeyi kur").

## 73.5 — Bildirimleri düzenleme ve beş yeni bildirim (2026-10-24) {#s73-5}

- **[Sistem › Bildirimler](#/kilavuz/bildirimler)'de her türün Düzenle düğmesi:** **metni** kendiniz yazın (süslü parantezli değişkenlerle: `{baslik}`, `{govde}`, `{bot}`, `{fiyat}` …), yanında **önizleme**; **kanal** seçin (Telegram, ntfy ya da ikisi). Metni boş bırakırsanız mesaj bugünkü gibi gelir — siz değiştirmedikçe hiçbir bildirimin metni değişmedi, hepsi açık kaldı.
- **Sessiz saatler** (varsayılan kapalı): ör. 23:00–08:00 arası gelen bildirim türüne göre bekletilip sessiz saat bitince **tek özet** olarak gelir ya da hiç gönderilmez. [Ayrıntı](#/kilavuz/bildirimler/sessiz).
- **Kritik bildirimler kapatılamaz ve sessiz saati deler:** Acil durum, **Koruma stopu** (felaket stopu konamadı / kayboldu …), **Bot ENGEL / güvenli kip / emir freni**, **Güvenlik** (PIN kilidi, canlı hesaba geçiş, IP değişimi …). Önceden tek "Acil durum" satırındaydılar; şimdi dört ayrı satır. Yalnız metinleri değişebilir. [Ayrıntı](#/kilavuz/bildirimler/kritik).
- **Beş yeni bildirim** (yalnız sunucu üretir, hiçbiri emir vermez): **Bilanço açıklandı** (Lydia ve Portföyüm BIST hisseleriniz; KAP'tan net kâr ve geçen yılın aynı dönemi), **Makine sessiz** (sunucu uzun kapalı kaldıysa açılışta; araştırma kopyası 24 saat görünmezse), **Gölge testler haftalık özeti** (pazartesi sabahı tek mesaj, hüküm yok), **Anahtar sınaması başarısız** (günde bir salt okuma sınaması; para çekme izni açıksa da), **Sert fiyat hareketi** (BTC 1 saatte ±%5; sembol, eşik ve tekrar süresi ayarlanabilir). [Ayrıntı](#/kilavuz/bildirimler/yeni).
- İnternet kesintisinden sonra **gecikmeli** giden bir bildirim artık kendi türünde sayılır ve sade biçimde gelir (önceden "Diğer" sayılıyordu).
- Geliştirme bilgisayarından yapılan bildirim ayarı sunucuya iletilir (bildirimleri sunucu gönderir); telefonda sayfa yalnız görüntülenir.
- **Öz denetim düzeltmesi:** öz denetim artık küçük kol farklarının (borsanın asgari emir tutarının altında kalan, borsaya hiç gönderilmeyen) atlanmasını "emir reddi" saymıyor; Tao 24 Ekim'de bu yüzden yanlışlıkla durdurulmuştu.
- Bu sürüm Telegram gönderim kapısını (`lib/telegram.js`) değiştirdiği için sunucuda **onaylı** kurulur (Ayarlar › Güncelleme › "Güncellemeyi kur"); botların karar ve emir kodu değişmedi.

## 73.4 — İleriye kayıt yedeği, Nasdaq kesirli hisse (2026-10-24) {#s73-4}

- **İleriye kayıt verisi artık yedekleniyor.** Her pazartesi sabah günlük yedek görevi, ham kayıtların yalnız **yeni ve değişen** günlük dosyalarını yedek klasöründeki tek bir klasöre (`ileriye-kayit-artimli`) ekler; her hafta tam kopya alınmaz, disk dolmaz (yedekte ayda ~200 MB). Pazartesi kaçarsa ilk günlük yedekte alınır; 73.4'e geçince ilk günlük yedekte bir kez hemen alınır. Her dosya SHA-256 özetiyle doğrulanır. Ayrıntı: [Yedek ve taşıma › İleriye kayıt yedeği](#/kilavuz/yedek-tasima/ileriye-kayit-yedegi).
- Ham kayıtlar **süresiz** saklanır (saklama süresi ayarı boşsa hiçbir şey silinmez); kaynakta bir dosya silinse bile yedekte kalır. Yeni zamanlanmış görev kurmanız gerekmez.
- **Ayarlar › Yedek ve taşıma**'da yeni **Günlük yedek** kartı (hedef klasör, son günlük kopya, ileriye kayıt yedeği). Sağlık › **Yedek alınıyor** satırı ileriye kayıt yedeği 8 günden eskiyse ya da başarısızsa sarı olur. Komut satırı: `npm run yedek -- --durum` artık ileriye kayıt satırını da yazar.
- **Nasdaq kesirli hisse.** "Kesirli hisse alınabiliyor" ayarı ([Portföy › Modeller › Bu ay › Ayarlar](#/kilavuz/tasarimci/sermaye)) hiç kaydedilmediyse artık **açık** sayılır: ABD hisseleri (Nova ve Simurg'un QQQ ayağı) bölünerek alınır, BIST hep tam adet. Siz kapattıysanız kapalı kalır.
- **Hisse yapıları** ve **Portföy botları** sayfalarında "Sermaye tam adet için yetmiyor" uyarısının yanında **Kesirli hisseyi aç** düğmesi (onay ister, yalnız bu ayarı açar; telefonda yok; BIST'te yok). Ayar geliştirme bilgisayarından da sunucuya iletilir.
- Ayar değişince botun kâğıt hesabı baştan hesaplanır; bir kez **"geçmiş işlemler yeniden hesapta değişti"** uyarısı görebilirsiniz — beklenen durumdur.

## 73.3 — Veri › İleriye kayıt (2026-10-24) {#s73-3}

- **Yeni sayfa: [Veri › İleriye kayıt](#/kilavuz/veri/ileriye-kayit).** Sunucu bugünden itibaren, **geriye dönük indirilemeyen** ham piyasa verisini biriktiriyor: Binance vadeli **pozisyon istatistikleri** (açık pozisyon, büyük hesapların long/short oranı, taker al/sat — ilk çalışmada son 30 gün), BTC ve ETH **opsiyonlarının strike bazında açık pozisyonu** (OKX, Bybit, Binance), **Hyperliquid**'de hesap değeri en büyük 100 adresin pozisyonları, **emir defteri derinliği ve makas**, **gerçekleşen tasfiyeler** (canlı akış).
- Kayıtçılar **karar vermez, emir göndermez, anahtar kullanmaz**; yalnız ileride ön kayıtlı testler ve "Piyasa bağlamı" panosu için veri toplar. Botların gece karar penceresinde (02:50–04:30 TR) yeni indirme başlamaz; Binance istekleri botlarla ortak istek bütçesine uyar.
- Sayfada her kayıtçı için **son yazım**, **bugünkü satır**, **disk** ve aylık tahmin, **hata**. Bir kayıtçı **6 saatten uzun yazmazsa Sağlık sarı** olur (yalnız haber; botlar etkilenmez).
- Disk: sıkıştırılmış toplam **yaklaşık 200 MB / ay**. Ham veri silinmez; isterseniz ayarla saklama süresi verilebilir.
- Geliştirme bilgisayarında kayıtçılar çalışmaz (sunucu tek kaynak); sayfa sunucunun durumunu gösterir. Sunucuda ayrıca kurulacak bir şey yok — güncellemeyle gelir, Pusula yeniden başlayınca kendiliğinden çalışır.

## 73.2 — İleri test: Kairos-S gölgesi (2026-10-24) {#s73-2}

- **Yeni sayfa: [İleri test › Kairos-S gölgesi](#/kilavuz/ileri-test/hucum-s).** Canlı hesaba geçecek bot Kairos-S (Kairos'un 1000 $'lık küçük hesap hali) artık **kendi emirsiz gölgesiyle** her gün izleniyor. Canlı botun kullanacağı aynı kural çağrılır: BTC ayağı Kairos'la aynı, coin sepeti her ay başında 1000 $'a göre süzülür (en küçük emri verilemeyen coinler o ay dışarıda), DCA kademe sayısı küçültülür. Emir yok, para yok.
- Kartta **Kairos-S**, **Kairos simülasyonu** ve **BTC al-tut** yan yana; en derin düşüş, 1000 $ için önceden kayıtlı **uyarı / alarm eşiğiyle** karşılaştırılır. Bu ayın sepeti (alınabilen coinler, dışarıda kalanlar) ayrıntıda.
- Başlangıç 7 Ekim 2026 (Kairos simülasyonuyla aynı gün). Kontroller **5 Ocak 2027** (canlı hesap kapısıyla aynı gün), **7 Nisan 2027** ve **7 Ekim 2027** — Karar takviminde ve Genel bakış tablosunda. Kontroller arasında hüküm yok; alarm eşiği aşılırsa canlı hesap Kairos-S'le açılmaz.
- Kayıt sunucunun gece ileri test işiyle yazılır; sunucuda ayrıca kurulacak bir şey yok.
- **BIST temettü kartı — düzeltme:** 73.1 notunda "Midas'ta açılış/kapanış seansı emri verilebildiği doğrulanmadı" yazıyordu. Siz 24 Ekim 2026'da **doğruladınız**; kart ve kılavuz buna göre güncellendi. Maliyet modeli (tek yön %0,10 + %0,05 kayma) sizin onayınızla aynen kaldı; kural ve karar ölçütü değişmedi.

## 73.1 — İleri test: BIST temettü ve 2 haftalık momentum (2026-10-23) {#s73-1}

- **Yeni sayfa: [İleri test › BIST temettü](#/kilavuz/ileri-test/temettu).** Geçmiş testte beş ölçütün hepsini sağlayan BIST temettü kuralı artık **kâğıtta** izleniyor: nakit temettünün hak kullanım gününden önceki işlem günü kapanışta al, hak kullanım günü açılışta sat. Emir yok, para yok. Takvim İş Yatırım şirket kartlarındaki duyurulmuş temettülerden okunur; yalnız önceden görülen olaylar sayılır. İlk hak kullanım günü 26 Ekim 2026, karar **26 Ekim 2027**.
- Maliyet: Midas komisyonu 0; model tek yön %0,10 + %0,05 kayma. **Midas'ta açılış/kapanış seansı emri verilebildiği doğrulanmadı** — kartta yazılı.
- **Yeni sayfa: [İleri test › 2 haftalık momentum](#/kilavuz/ileri-test/momentum).** Her pazar son 14 günün en çok yükselen 6 coini alınır, en çok düşen 6 coini açığa satılır, iki hafta tutulur; Kairos'a %8,2 payla eklenmiş hali yalnız Kairos'la yan yana izlenir. Emir yok. Karar **25 Ekim 2027**.
- Genel bakıştaki **Testler** tablosu ve **Karar takvimi** iki yeni testi gösterir. Kayıtlar sunucunun gece ileri test işiyle yazılır; sunucuda ayrıca kurulacak bir şey yok.
- **Bot emir güvenliği (çökme tatbikatında bulunan iki hata düzeltildi):** borsa cevabı kaybolduğunda ve emir birkaç saniye görünmediğinde bot artık emri "gönderilmedi" saymıyor — emir belirsiz kalır, bot yeni pozisyon açmaz ve birkaç dakika içinde borsaya yeniden sorup doğru sonucu deftere yazar. Çoklu varlık (spot BTC) akışında aynı durumda emir yeniden gönderilmez; olası çift alım engellendi.
- Elektrik kesintisinde emir defterinin son satırı yarım kalırsa sonraki kayıtlar artık kaybolmuyor; emir numarası hiçbir koşulda geriye gitmiyor, aynı emir kimliği iki kez kullanılamıyor.

## 73.0 — Ayarlar › Anahtarlar (2026-10-23) {#s73-0}

- **Yeni sekme: [Ayarlar › Anahtarlar](#/kilavuz/ayarlar/anahtarlar).** Panelin kayıtlı bütün anahtar, jeton ve şifreleri tek tabloda, dört grupta: **Borsa hesapları**, **İşlem defterim** (yalnız okuma anahtarları), **Bildirim** (Telegram jetonu, sağlık sinyali adresleri) ve **Erişim** (acil PIN, telefon jetonu, sunucu bağlantısı …). Her satırda kim kullanıyor, hangi bilgisayarda duruyor ve durumu (**Tamam · Bakılmalı · Eksik · Boş**) yazar. Değerin **yalnız son 4 karakteri** görünür; tamamı hiçbir zaman gösterilmez.
- **Borsa hesabı ekle:** Binance, OKX ya da Bybit; demo ya da canlı; isterseniz alt hesap adı. Bugünkü iki anahtar "Binance canlı (Kairos)" ve "Binance demo (Kairos)" satırları olarak görünür — botlar aynen bunları kullanmaya devam eder. Yeni eklenen hesaplar bir sonraki aşamada botlara bağlanacak.
- **Her değişiklik acil PIN ister** (ekle, değiştir, sil) — bu bilgisayarın masaüstü panelinde de. Telefondan bu sekme yalnız görüntülenir.
- **Sına:** anahtarla borsaya **yalnız okuma** bağlantısı denenir (bakiye ve izinler; emir gönderilmez). Anahtarda **para çekme izni** açıksa satır kırmızı uyarı verir.
- **Acil PIN:** 5 yanlış denemede kilit artık **1 dakika** (önce 15 dakikaydı). PIN Anahtarlar sekmesinden değiştirilebilir (eski PIN + yeni PIN iki kez). PIN bütün bilgisayarlarda aynıdır; unutursanız bilgisayar başında `npm run acil-pin`.
- **Geliştirme bilgisayarında** sunucudaki anahtarlar görünür ve değişiklik sunucuya gider. Sunucuya ulaşılamazsa değişiklik bu bilgisayarda bekler; ekranda "Sunucuya gönderilmeyi bekleyen N değişiklik" ve **Gönder** çıkar. Sunucudaki değer o arada değiştiyse ikisi yan yana gösterilir, hangisinin geçerli olacağını siz seçersiniz.
- **Eski şifreli sır dosyası** (69.x'ten kalan, Pusula'nın açamadığı) bu sekmede açıkça görünür; **Eski şifreli dosyayı kenara al** dosyayı silmeden başka bir adla kenara koyar, sonra anahtarları yeniden girersiniz.

## 72.3 — Güncelleme sırasında paket kurulumu düzeltildi (2026-10-22) {#s72-3}

- **Ne oldu:** 71.0 → 72.2 güncellemesinde paket listesi aslında değişmemişti (yalnız test satırları eklenmişti), ama güncelleyici paketleri yine baştan kurmaya çalıştı — hem de Pusula çalışırken. Windows, çalışan Pusula'nın kullandığı paket dosyalarını kilitli tuttuğu için kurulum "izin yok" hatasıyla yarıda kaldı; eski sürüme dönerken de aynı hata çıktı ve Pusula kapandı.
- **Artık:** paketler yalnız paket listesi **gerçekten** değiştiyse kurulur; yalnız test satırları değiştiyse bu adım atlanır ("paket değişikliği yok — yalnız betik satırları").
- Paket kurmak gerekiyorsa sıra: **Pusula durdurulur → eski paket klasörü yedeklenir → paketler kurulur → Pusula başlatılır.** Kurulum başarısız olursa yedek geri konur ve eski sürüm başlatılır; Pusula durdurulamazsa paketlere hiç dokunulmaz.
- Yine de "Eski sürüm de açılmadı — elle bakın" görürseniz adım adım kurtarma: [Güncelleme başarısız olursa](#/kilavuz/kurulum/guncelleme-kurtarma) ([Ayarlar › Güncelleme › Paketler](#/kilavuz/ayarlar/paketler)).

## 72.2 — Pusula Kitabı yalnız kendi kurulumunuzda (2026-10-22) {#s72-2}

- **Pusula Kitabı herkese açık dağıtımdan çıkarıldı:** kitap botların test sonuçlarını içerir; araştırma kitapçıkları gibi yalnız kendi kurulumunuzda (araştırma paketiyle) bulunur.
- Kendi kurulumunuzda **Bilgi › Pusula Kitabı** aynen görünür ([Pusula Kitabı](#/kilavuz/pusula-kitabi)).
- Araştırma paketi olmayan kurulumda menü öğesi Kitapçık gibi gizlenir; adresle açılırsa ana sayfaya döner. Kitap dosyası yoksa ekran boş kalmaz, "bu kurulumda yok" açıklaması çıkar.

## 72.1 — Pusula Kitabı panelde: Bilgi › Pusula Kitabı (2026-10-22) {#s72-1}

- **Bilgi › Pusula Kitabı** (Kılavuz'un hemen altında): Pusula'nın kendi kitabı panelin içinde — Pusula nedir, güvenlik, botlar (Kairos, Tao, Nova, Lydia, Simurg), testler ve sözlük ([Pusula Kitabı](#/kilavuz/pusula-kitabi)).
- **Her kurulumda görünür:** araştırma eklentisi yüklü olmayan kurulumda Kitapçık gizlenir, Pusula Kitabı gizlenmez.
- Kitap panelin açık/koyu temasıyla açılır; **Yeni sekmede aç** ile panelsiz, tam ekran okunur. Yalnız bu ekran açılınca yüklenir (yaklaşık 1 MB).
- [Kitapçık](#/kilavuz/kitapcik) listesine de son satır olarak eklendi.

## 72.0 — Botların yeni adları: Kairos, Tao, Nova, Lydia, Simurg (2026-10-22) {#s72-0}

- **Yalnız görünen ad değişti:** Hücum → **Kairos**, Denge → **Tao**, QQQ M10 → **Nova**, BIST M10 → **Lydia**, 837 → **Simurg** (küçük hesap kipi Hücum-S → **Kairos-S**). Adresler (`#/botlar/hucum` …), kayıtlar, hesaplar ve ayarlar aynı; eski yer imleri çalışır.
- **Ad + alt yazı + anlam:** bot sayfalarının başlığında adın yanında kısa alt yazı (ör. **Kairos · BTC trendi + coin sepeti**, **Simurg · %50 QQQ + %50 Kairos**); adın üzerine gelince (telefonda uzun dokununca) anlamı görünür. Beş adın anlamı ve eski adları: [Bot adları](#/kilavuz/botlar/bot-adlari).
- **Her yerde aynı ad:** yan menü, Ana sayfa, Botlar, Portföy › Modeller, Tasarımcı, İleri test, Sinyaller, Veri, Ayarlar, Sağlık, Raporlar ve Telegram mesajları. Ad botun kimliğinden üretilir; sunucu eski sürümdeyken gönderdiği eski ad ("Hücum") ekranda yeni adla görünür.
- Araştırma arşivi, ön kayıt belgeleri ve eski sürüm notları tarihsel kayıt olarak eski adlarla kalır; Kitapçık'ın başında geçiş notu var.

## 71.1 — Sunucu bağlantı dosyası okunamazsa uyarı (2026-10-22) {#s71-1}

- **Geliştirme bilgisayarı, araştırma bandı:** sunucu bağlantı dosyası (`dataev-baglanti.json`) varsa ama okunamıyorsa bant bunu açıkça yazar: **eski sürümün şifreli biçiminde** (69.x; 70.0 şifre çözmüyor) ya da **eksik / bozuk** (adres https değil, jeton kısa). Eskiden panel bu durumda sessizce bu bilgisayardaki eski kopyaya düşüyor, bot grafikleri boş görünüyordu. Çözüm: bağlantıyı yeniden kurun ([Kurulum, adım 23](#/kilavuz/kurulum/adim-23)).

## 71.0 — Botların gerçek sonucu: günlük defter ve Botlar › Özet (2026-10-22) {#s71-0}

- **Botlar › <bot> › Genel › günlük defter:** başlangıçtan getiri ve BTC al-tut farkı (puan), sekiz kutu (kazanan gün, ortalama / en iyi / en kötü gün, en derin düşüş, işlem, ücret, gerçekleşen K/Z), **kim kazandırdı** (BTC ayağı · coin sepeti; Donchian / DCA gerçekleşen K/Z), **takvim** (her günün sonucu; güne dokununca o günün işlemleri).
- **Getiri eğrisi:** botun gerçek sonucu + BTC al-tut; **% getiri ↔ $ değer** düğmesi; **işlem olan günler nokta** (dokununca takvimde o gün). Simülasyon çizgisi kaldırıldı ("Simülasyona göre" kutusu duruyor).
- Bot sayfası **her zaman gerçek sonuçla** açılır (eskiden kayıt 20 günden azken backtest açılıyordu); backtest **Geçmiş — backtest** düğmesinde.
- **Botlar › Özet** (Botlar'a tıklayınca açılır): her bot kart + karşılaştırma tablosu (Hücum, Denge ve portföy botları: getiri, kıyas, fark, en derin düşüş, işlem).

## 70.1 — Sağlık sayfasında eski kapanma sayacı (2026-10-22) {#s70-1}

- **Pusula süreci ayakta:** açılıştan ÖNCEKİ hızlı kapanmalar (ör. antivirüsün dosya sildiği gece) Pusula sağlıklı çalışırken kırmızı görünmez; "bu açılıştan önce … olmuştu (geçti)" diye yazılır.
- "API anahtarları şifreli" satırının adı **API anahtarları** oldu (şifreleme 70.0'da kaldırıldı).

## 70.0 — 69.1–69.9 bir arada, antivirüse uyumlu (2026-10-22) {#s70-0}

21–22 Ekim'de sunucudaki Kaspersky, Pusula'nın arka planda PowerShell açmasını virüs sandı ve dosyalarını sildi; sunucu 69.0'a döndürüldü. 70.0, 69.1–69.9'un bütün işlerini (öz denetim, kuru deneme, emir freni, sürpriz sermaye, masaüstü PIN, kod imzası, para güvenliği, ccxt güvenlik güncellemesi …) **antivirüsü kızdıran kodlar olmadan** bir araya getirir:

- **Şifreleme kodu tamamen çıkarıldı;** anahtarlar düz dosyada, koruma çekim izni kapalı ve IP kısıtlı anahtar ([API anahtarları](#/kilavuz/saglik/sir-kasasi)).
- **Arka planda PowerShell yok:** pil, beklenmeyen kapanma, disk sağlığı, antivirüs, güvenlik duvarı ve port sorguları kaldırıldı; öz denetim 31 denetim.
- **Klasör izni betiği kaldırıldı** (dosya izinlerini değiştiriyordu).

## 69.9 — Pusula arka planda PowerShell açmıyor (antivirüs) (2026-10-22) {#s69-9}

- **Kaspersky sorunu kökten:** Pusula artık arka planda hiç PowerShell açmıyor. API anahtarı şifrelemesi (69.4) kapatıldı; anahtarlar 69.0'daki gibi düz durur — koruma, çekim izni kapalı ve IP kısıtlı anahtar ([API anahtarları](#/kilavuz/saglik/sir-kasasi)).
- Şifreli kalmış anahtar dosyası bir kez `scripts\sir-coz.ps1` ile düz hâle getirilir.
- Pil, beklenmeyen kapanma ve disk sağlığı denetimleri kapalı.

## 69.8 — Antivirüs uyumu, güncellemenin takılmaması (2026-10-22) {#s69-8}

- **Antivirüs yanlış alarmı giderildi:** 21 Ekim'de sunucudaki Kaspersky Pusula'yı virüs sanıp durdurdu. Pusula artık saatte bir antivirüs ürünlerini, güvenlik duvarını ve açık portları sormuyor; Sağlık sayfasında bu iki madde **kapalı** görünür, elle kontrol edilir.
- **Güncelleme kendi izine takılmaz:** eski sürümün paket kurulumunda değiştirdiği paket listesi güncellemeyi artık "elle bakılmalı" diye durdurmaz; güncelleyici onu kendisi geri alır. Sizin ayar dosyalarınıza yine dokunulmaz.

## 69.7 — Borsa kütüphanesi güvenlik güncellemesi, örnek ad (2026-10-21) {#s69-7}

- **Borsa kütüphanesi (ccxt) 4.5.89:** içindeki ağ paketinin (undici) yüksek önemli güvenlik açığı kapandı; paket taramasında açık kalmadı. Binance hata eşlemesinin bütün hücreleri ve gerçek Binance yoklaması (prod + demo) yeni sürümle yeniden doğrulandı.
- **Kurulum programı derlemesi:** GitHub Actions eklentileri tam commit kimliğine sabitlendi (değiştirilmiş bir eklenti derlemeye giremez).
- Kılavuzdaki ve paneldeki örnek portföy adı **Fırat** oldu.

## 69.6 — Güvenlik sıkılaştırma: saldırı testi bulguları kapatıldı (2026-10-21) {#s69-6}

- **Masaüstünde de PIN:** tehlikeli işlemler (taşıma, anahtar kaydetme, engel kaldırma, canlı onay, güncelleme kurma …) acil durdurma PIN'ini ister; acil durdurma ve pozisyon kapatma istemez ([Saldırılara karşı korumalar](#/kilavuz/saglik/guvenlik)).
- **Yabancı siteler paneli kullanamaz;** panel başka sitede çerçeveye konamaz; taşıma paketi oluşturulunca Telegram'a haber.
- **Yalnız imzalı kod kurulur;** onaysız kurulum yalnız belge ve görseller; kuru deneme sırsız çalışır ([Kod imzası](#/kilavuz/ayarlar/kod-imzasi)).
- **Sırlar yalnız Pusula'yı çalıştıran kullanıcıda çözülür;** telefon jetonu, sunucu bağlantısı ve yedek şifresi de şifreli; klasör izinleri kısıtlı.
- **Para güvenliği:** fiyat yoksa büyüten emir yok; para kaydı KAYIT onayı ve tutar sınırıyla; spot yatırma kabul bekler; veri hatası pozisyon kapatmaz; canlıda IP kısıtı zorunlu ([Para güvenliği](#/kilavuz/botlar/para-guvenligi)).
- Öz denetim 34 denetim: **Virüs koruması** ve **Dış erişim ve izinler** eklendi.

## 69.5 — Güvenli kipte yalnız azaltan emir, stop vuruşu kilidi, kötümser kâğıt hesap, sapma ve maliyet izleme (2026-10-21) {#s69-5}

- **Güvenli kipte yalnız azaltan emir:** güvenli kipteyken borsa yürütücüsü pozisyonu büyüten hiçbir emri göndermez (dakikalık DCA dahil); küçülten emirler ve stoplar serbest ([Güvenli kip](#/kilavuz/saglik/guvenli-kip)).
- **Stop vuruşu kilidi:** 24 saatte 2 felaket stopu tetiklenirse bot 24 saat yeni işlem açmaz, sonra kendiliğinden döner.
- **Kötümser kâğıt hesap:** sıfırlamadan sonra açılan yeni kâğıt hesapta stoplar gerçekten tetiklenir ve dolumlar kaymalıdır; eski kâğıt hesap olduğu gibi kalır ([Kâğıt hesabı sıfırla](#/kilavuz/botlar/kagit-sifirla)).
- **Canlı ↔ gölge kayması ve işlem maliyeti** öz denetimde; öz denetim 32 denetim ([Sapma ve maliyet](#/kilavuz/saglik/sapma-maliyet)).
- **Araştırma istatistikleri:** `npm run istatistik` deneme sayacından şansla beklenen en iyi Sharpe'ı, `--seri` ile PSR ve gereken kayıt süresini (MinTRL), `--matris` ile aşırı uydurma olasılığını (PBO) verir.

## 69.4 — Anahtar şifreleme, ikinci uyarı kanalı, paket güvenliği, şifreli uzak yedek (2026-10-21) {#s69-4}

- **API anahtarları şifreli:** sır dosyası Windows DPAPI ile şifrelenir; yalnız bu bilgisayar çözer, kopyası sızarsa okunamaz ([API anahtarları](#/kilavuz/saglik/sir-kasasi)).
- **İkinci uyarı kanalı:** Telegram düşerse ACİL uyarılar ntfy ile telefona; healthchecks'ten bağımsız ikinci ölü adam ([İkinci uyarı kanalı](#/kilavuz/saglik/ikinci-kanal)).
- **Belirti / neden:** telefon yalnız belirtide (bir şey şu an bozuk) ya da kırmızıda çalar; nedenlerin sarısı panelde ve akşam özetinde.
- **Paket güvenliği:** paketler tam sürüme sabit, sunucuda yalnız kilit dosyası (`npm ci`), kurulum betikleri kapalı, Dependabot 7 gün beklemeyle; onay ekranında paket farkı; günde bir `npm audit`. İki alt paket açığı düzeltildi (proxy-addr, qs) ([Paket güvenliği](#/kilavuz/saglik/paket-guvenligi)).
- **Şifreli uzak yedek:** restic + rclone ile ücretsiz bulut hesabına parolalı yedek ([Şifreli uzak yedek](#/kilavuz/yedek-tasima/uzak-yedek)).
- **Disk sağlığı ve Node desteği** öz denetimde; öz denetim 30 denetim.

## 69.3 — Emir freni, sürpriz sermaye, veri kapısı, ADL ve funding uyarısı (2026-10-21) {#s69-3}

- **Emir freni:** risk artıran emirlerin toplamı 24 saat / 10 dakika pencerelerinde sınırlı; kaçak bir döngüde bot durur, yalnız siz açarsınız ([Emir freni](#/kilavuz/botlar/emir-freni)).
- **Sürpriz sermaye:** bot borsadaki yatırma ve çekmeyi kendisi fark eder; ölçümler bozulmaz, para o gün dağıtılır, sermaye tavanı izler (canlıda onaylı üst sınırla) ([Sürpriz sermaye](#/kilavuz/botlar/surpriz-sermaye)).
- **Veri kapısı:** eksik, bayat ya da anlamsız sıçramalı mumla karar verilmez.
- **ADL, likidasyon ve funding:** borsa bir pozisyonu zorla kapatırsa ACİL haber ve olay raporu; açık pozisyonda aşırı funding uyarısı ([ADL ve funding](#/kilavuz/saglik/adl-funding)).
- **Sürüm izi:** her günlük satırında çalışan kodun sürümü ve commit'i; ayar parmak izi sağlık ucunda ve olay raporlarında.
- **Windows etkin saatleri:** `scripts\windows-etkin-saat.ps1` (yönetici) etkin saatleri 21:00–15:00 sabitler; Sağlık sayfası ilkeyi okur.

## 69.2 — Kuru deneme, olay raporları, sunucu bilgisayarı, borsa bakımı ve delist (2026-10-21) {#s69-2}

- **Kuru deneme:** bot kodunu değiştiren güncelleme kurulmadan önce botların bugünkü kararı eski ve yeni kodla, emir göndermeden karşılaştırılır. Yeni kod hata verirse kurulmaz; karar farklıysa siz "Farkı gördüm, yine de kur" diyene kadar kurulmaz ([Kuru deneme](#/kilavuz/ayarlar/kuru-deneme)). Hücum'un demo hesabına bağlanılmaz.
- **Olay raporları (kara kutu):** bot güvenli kipe girince ya da kapanınca o anın raporu yazılır; Sağlık sayfasından indirilir, sır içermez ([Olay raporları](#/kilavuz/saglik/kara-kutu)).
- **Sunucu bilgisayarı:** bekleyen Windows yeniden başlatması ve 03:02'nin etkin saatlerin dışında kalması, uyku / hazırda bekleme, pilden çalışma ve beklenmeyen kapanmalar ([Sunucu bilgisayarı](#/kilavuz/saglik/sunucu-bilgisayari)).
- **Borsa bakımı ve delist:** Binance bakım penceresinde botlar güvenli kipe girer, sonra çıkar; botların evrenindeki delist duyurusu tarihiyle haber verilir ([Borsa takvimi](#/kilavuz/saglik/borsa-takvimi)).
- Öz denetim artık 24 denetim, beş grup.

## 69.1 — Öz denetim: Pusula kendini yokluyor, güvenli onarım, güvenli kip, tam kapanma (2026-10-21) {#s69-1}

- **Yeni sayfa — Sistem › Sağlık:** Pusula kendini 5 dakikada bir 19 denetimle yoklar (sunucu, borsa ve veri, botlar, bildirimler). Güvenli işleri kendisi onarır (sahipsiz kilit, disk dolarken eski günlükleri sıkıştırma, takılan botta yeniden başlatma; bellek şişmesinde yalnız sessiz saatte). Aynı onarım günde en çok 5 kez denenir ([Sağlık](#/kilavuz/saglik)).
- **Güvenli kip:** aynı hata 30 dakikada 3 kez tekrarlanırsa ya da fiyat iki kaynakta %3'ten fazla farklıysa bot yeni işlem açmaz, stopu yerinde kalır; sebep geçince kendiliğinden çıkar. 21 Ekim'deki "fiyat yok" hatası bununla ilk tekrarda önünüze gelirdi.
- **Tam kapanma:** para kaybettirebilecek bir sebepte (mutabakat farkı, kurulamayan stop, art arda reddedilen emirler, tekrar tekrar çöken döngü…) bot tamamen kapanır ve siz "Sebebi okudum" deyip açana kadar kapalı kalır. Açık pozisyona dokunulmaz.
- **Hücum (demo kabul):** 9 Aralık sonuna kadar öz denetim Hücum'a hiçbir şey yapmaz, yalnız haber verir.
- **Ana sayfa:** "Sistem" kartı **Sistem sağlığı** oldu; öz denetimin sorunlu satırları en üstte. Menüde Sağlık'ın yanında sarı / kırmızı nokta. Botlar sayfasında güvenli kipteki bot için sarı bant.
- **Telegram:** uyarı ve hata anında; onarımlar 21:00 akşam özetinde.

## 69.0 — Güncellemeyi adım adım izleme, kâğıt çoklu varlık fiyat düzeltmesi (2026-10-21) {#s69-0}

- **Güncelleme ekranı:** Ayarlar › Güncelleme'de güncelleme baştan sona izlenir: adımlar (indirme, denetim, yeniden başlatma, açılış, kararlılık gözlemi), ilerleme çubuğu ve canlı günlük. Önceden ekran 5 dakika sonra izlemeyi bırakıyordu; kurulumdan sonraki 8 dakikalık kararlılık gözlemi sürerken "kuruluyor" yazısı takılı kalıyordu. Artık işlem bitene kadar izlenir, bitince yeni panel kendiliğinden yüklenir ([Güncellemeyi izlemek](#/kilavuz/ayarlar/guncelleme-izleme)).
- **Düzeltme (kâğıt hesap, çoklu varlık):** kâğıt hesap sıfırlandıktan sonra BTC fiyatı henüz okunmamış olduğundan çoklu varlık mutabakatı "Invalid symbol BTCUSDT (fiyat yok)" hatası veriyordu; ilk günlük alım da aynı hatayla düşerdi. Kâğıt borsa artık fiyatı her seferinde borsadan taze okur.
- **Düzeltme (güncelleyici):** kurulum geri alınırken güncelleme kilidi erken kalkıyordu; artık geri alma ve bildirim bitince kalkar.

## 68.9 — Kâğıt botta BTC ayağı seçimi (2026-10-21) {#s68-9}

- **BTC ayağı (kâğıt):** Botlar › bot › Yönetim'de, kâğıt hesaptaki bot için **spot** ya da **çoklu varlık (canlı tasarımı)** seçilebilir. Değiştirmek kâğıt hesabı onayla sıfırlar. Canlı hesaba geçiş şartı G7 (çoklu varlık en az 14 gün kâğıtta) bununla başlatılır ([BTC ayağı](#/kilavuz/botlar/btc-ayagi)).
- **Düzeltme (çoklu varlık):** satış spottaki BTC kalıntısından karşılandığında artan BTC artık hemen vadeli cüzdana (teminat) döner; önceden bir sonraki alımı bekliyordu. Demo hesaptaki Hücum'u etkilemez (demo perp kullanır).

## 68.8 — Portföy botları, bot başına sağlık sinyali, kâğıt hesabı sıfırlama (2026-10-20) {#s68-8}

- **Portföy botları:** Botlar menüsünde **QQQ M10**, **BIST M10** ve **837 · QQQ + Hücum** artık her biri kendi sayfasında. Sayfada özet ve kıyas (aynı günlerde al-tut), portföy değeri grafiği ve karar günleri, hisse grafiğinde **nerede aldı ▲ nerede sattı ▼**, eldeki hisseler, her ay sonu kararının ne aldığı / sattığı / neden alamadığı (**karar defteri**) ve işlem geçmişi var ([Portföy botları](#/kilavuz/portfoy-botlari)).
- **Sağlık sinyali bot başına:** Hücum ve Denge artık aynı healthchecks adresine ping atmaz. Hücum eski adresi kullanır; Denge için **Ayarlar › Bildirimler**'de ayrı bir adres girilir (girilmezse Denge ping atmaz). İki bot aynı adresi kullanamaz.
- **Kâğıt hesabı sıfırla:** Botlar › bot › Yönetim'de, bot **kâğıt** kipinde ve dururken **"Kâğıt hesabı sıfırla (temiz başla)"**. Eski kayıtlar silinmez, yedek klasöre taşınır; bot yapılandırılmış sanal sermayeyle sıfırdan başlar, kaçırılan günleri telafi etmez. Demo ve canlı hesaplarda çalışmaz.

## 68.7 — Kişiye göre portföy, Yatırım defterinde grafikler (2026-10-20) {#s68-7}

- **Hesaplar kişiye göre:** üstteki seçimde kim seçiliyse (Ben, ya da başka bir portföy sahibi) yalnız onun hesapları görünür; **Tümü** seçilince hesaplar kişi başlıkları altında gruplanır ([Portföyüm](#/kilavuz/portfoyum)).
- **Hedef dağılım tek yerde:** Hesaplar sayfasındaki hedef düzenleyici kaldırıldı (hangi kişi seçili olursa olsun Ben'in hedefini kaydediyordu); hedef **Hedefim** sayfasından, seçili kişiye göre düzenlenir. Hedefim'e **Varlık varlık gireyim** seçeneği ve sapma bandı ayarı eklendi; varlık düzeyinde hedef artık buradan girilir.
- **İşlem defteri › Yatırım:** kayıtlar seçili kişiye göre süzülür, hesap listesi yalnız o kişinin hesaplarını gösterir. Tablonun üstünde yeni kartlar: **gerçekleşen kâr/zarar** (birikimli çizgi, aylık çubuk, yıl × ay tablosu), **varlığa göre sonuç**, **temettü ve faiz geliri**, **alış / satış / para hareketi ve komisyon** ([İşlem defterim](#/kilavuz/islem-defterim)).
- **Rapor:** hesap listesi seçili kişinin hesaplarıyla sınırlı.
- **Borsa hesapları:** OKX / Binance / MT hesapları Ben'e aittir; başka bir kişi seçiliyken Kripto/FX bunu not olarak yazar.
- Portföy kartlarındaki "yeni" etiketleri kaldırıldı.

## 68.6 — Coin tarama uyarıları, Dikkat listesi sunucudan, renkli kural rozetleri (2026-10-20) {#s68-6}

- **Yanlış "likidite düştü" bayrakları:** DexScreener aynı coin için her sorguda farklı çiftler döndürüyordu; toplam likidite bu yüzden günden güne oynuyor (ör. 1,9 M $ → 95 bin $ → 149 M $) ve neredeyse her gün yeni bir "likidite düştü" ya da "kilitli LP azaldı" bayrağı çıkıyordu. Artık yalnız **iki günde de görülen aynı çiftler** (Solana'da kilitli LP için aynı pazar) karşılaştırılır; ortak çiftler likiditenin yarısından azını taşıyorsa o gün ölçülmez, bayrak çıkmaz ([Coin tarama](#/kilavuz/coin-tarama)).
- **Dikkat listesi kuralları sürüm 1.1:** aynı düzeltme K11 (likidite çekilmesi) ve K15 (kilitli likidite azaldı) için. Değişiklik ısınma döneminde, değerlendirme başlamadan yapıldı; ön kayıtta gerekçesiyle yazılı ([Dikkat listesi](#/kilavuz/dikkat-listesi/kurallar)).
- **GeckoTerminal Coin taramadan çıktı:** her taramada istek sınırına (429) takılıyor ve kalıcı "veri alınamadı" uyarısı bırakıyordu; zaten varsayılan olarak kapalıydı. Gece arşivindeki kullanımı değişmedi.
- **Dikkat listesi sunucudan:** geliştirme bilgisayarı sunucuya bağlıysa KAÇIN listesi, İZLE ve "Kendimizi denetleme" sunucunun resmî kaydından okunur. Ekran hangi kaydı gösterdiğini yazar; son resmî kayıt bir günden eskiyse gece görevini denetlemenizi söyler.
- **Kendimizi denetleme:** değerlendirme başlayana kadar karne **Ön izleme (ısınma)** görünümüyle açılır; sütunların neden 0 olduğu ve ilk 90 günü dolacak pencerenin tarihi yazar.
- **Renkli kural rozetleri:** K1–K16 rozetleri tehlikeye göre renklidir (kırmızı en yüksek, sarıya doğru azalır) ve en tehlikeliden en hafife sıralanır. Üstüne gelince kuralın tam cümlesi görünür; listenin altında açılır **"K kodları ne anlama geliyor?"** sözlüğü var.

## 68.5 — Yeni bilgisayara taşıma düzeltmesi (2026-10-20) {#s68-5}

- **Başka bilgisayardan taşı:** yeni kurulumda Pusula açılır açılmaz başlayan otomatik coin taraması yüzünden taşıma "bu bilgisayarda zaten kişisel veri var" diyerek reddediliyordu. Artık kurulumdan sonra kendiliğinden oluşan tarama kayıtları (tarama ayarı değiştirilmemişse ve kayıtlar 2 günden yeniyse) boş kurulum sayılır. Taşınan veride tarama kaydı varsa yerel olanlar silinmez, `makine\onceki-<zaman>` klasörüne ayrılır ([Yedek ve taşıma](#/kilavuz/yedek-tasima)).
- **Güncelleme:** paket kurulumu ve Git, Windows PATH ayarına bağlı kalmadan Pusula'nın kendi Node.js'i ve Git'iyle çalışır.

## 68.4 — Küçük açıklar: taşıma düğmesi, sabit Yıl sütunu, fiyat kodu, açılış notu (2026-10-20) {#s68-4}

- **Kurulum sihirbazı:** "Başka bilgisayardan taşı" yolunda alt çubuktaki **Devam et** artık görünmez — taşıma kendi düğmeleriyle (dosya seç → şifre → önizleme → yerine koy) ilerler. Hoş geldin adımında yeni not: adımların hiçbiri paneli kullanmak için zorunlu değil, sonra Ayarlar'dan ya da Bilgi › Kurulum sihirbazı'ndan yapılabilir; tek şart, bir botu başlatmadan önce riskleri ve kullanım şartlarını onaylamak ([Kurulum sihirbazı](#/kilavuz/kurulum-sihirbazi)).
- **Telefonda aylık getiri tabloları:** Pano'daki aylık getiri ısı haritası ve laboratuvarın "Aylık ve yıllık getiri" tablosu yana kaydırılınca **Yıl** sütunu solda sabit kalır.
- **Portföyüm › Fiyat kodu:** var olan bir varlığın Yahoo fiyat kodu (ör. yanlış girilmiş BIST kodu için THYAO.IS, ya da BRK-B) **Gelişmiş › Varlıklar › Fiyat kodunu değiştir** ile düzeltilir. Kod kaydedilmeden önce Yahoo'da denetlenir: bulunamazsa, para birimi varlığınkinden farklıysa ya da kod başka bir varlıkta kullanılıyorsa kaydedilmez. Görünen sembol, işlemler ve geçmiş aynı kalır; fiyat geçmişi yeni koddan indirilir ([Portföyüm](#/kilavuz/portfoyum)).
- **Portföyüm › Açılış notu:** Varlık ekle'de (her sekmede) ve listede **Düzenle**'de isteğe bağlı **Not** alanı. Not açılış kaydında saklanır, hesap kartındaki satırda soluk ve İşlem defterinin Not sütununda görünür. (67.4'te eski "Açılış bakiyesi" formu kalkarken bu alan da kaybolmuştu.)
- **Ayarlar › Bağlantılar › Canlı hesap:** izin yazısı eski "config.json canliIzin" yerine yeni düzeni anlatır: izin veri klasöründeki `ayarlar.json`'a elle yazılır, Ayarlar sayfasından açılıp kapanmaz ([Borsa hesapları](#/kilavuz/hesaplar)).

## 68.3 — Kurulum programı, kurulum denetimi, botlarımızın sonuçları (2026-10-20) {#s68-3}

- **Kurulum programı:** `Pusula-Kurulum-<sürüm>.exe` yeni bir Windows bilgisayara Pusula'yı tek dosyayla kurar — yönetici izni istemez; taşınabilir Node.js, Git ve paketler içinde. Kurulum görevleri, kısayolları, veri klasörünü (`C:Pusula-Veri`), telefon jetonunu ve uyku ayarını kendisi yapar; sonunda kurulum sihirbazı açılır. Kaldırınca **verilerin silinmez** ([Kurulum programı](#/kilavuz/kurulum-programi)).
- **Sistem › Kurulum denetimi:** görevler (son çalışmasıyla), kısayollar, veri yeri, güncelleme deposu, sürüm, telefon jetonu, uyku ayarı tek sayfada; kırmızı satırda **Onar** ([Kurulum denetimi](#/kilavuz/kurulum-denetimi)). Sayfa kendiliğinden hiçbir şey değiştirmez.
- **Botlarımızın gerçekleşmiş sonuçları:** yeni kurulumda Botlar sayfasında (ve Ana sayfada kısa) Hücum / Denge demo hesap eğrisi, BTC al-tut kıyası, en derin düşüş, işlem sayısı; model portföylerin kâğıt hesabı — yalnız yüzde / endeks ([Botlar](#/kilavuz/botlar/bot-performansi)).
- **Boş ilk açılış:** yeni kurulumda önceden yüklü fiyat / grafik yok, ihtiyaç olunca indirilir. Araştırma kitapçıkları ve araştırma verileri dağıtımda yok; araştırma eklentisiyle gelir. Bugünkü kurulumlarda (bu bilgisayar, sunucu) hiçbir şey değişmez.

## 68.2 — Hücum: yanlış durdurma düzeltildi (2026-10-20) {#s68-2}

- **Hücum:** aynı günlük çalışmada verilip birkaç saniye içinde dolan giriş (ya da kademe) emri, bot bunu henüz kaydına işlemeden kontrol yaptığı için "pozisyon uyuşmazlığı" sanılıp botu durduruyordu (18 Ekim HYPE). Artık kontrolden önce dolumlar borsadan okunur; fark görülürse en çok 2,5 saniye beklenip yeniden bakılır, fark sürerse bot yine durur. Açılıştaki karşılaştırma kayıtlarda "açılış" diye görünür. Bu bir bot kodu değişikliğidir: sunucuda Ayarlar › Güncelleme'de onay ister.

## 68.1 — Taşıma dosyası, araştırma eklentisi (2026-10-20) {#s68-1}

- **Taşıma dosyası:** Ayarlar › Yedek ve taşıma › **Taşıma dosyası oluştur**. Portföy, işlem defteri, bot kayıtları, ileri test kayıtları, raporlar ve ayarlar tek dosyaya girer; anahtarlar, jetonlar ve PIN senin şifrenle şifrelenir. **Araştırma verilerini de ekle** ve **Sunucu bağlantısını da taşı** varsayılan kapalı ([Yedek ve taşıma](#/kilavuz/yedek-tasima)).
- **Başka bilgisayardan taşı:** kurulum sihirbazının ilk adımında. Dosya → şifre → önizleme → taşı. Bu bilgisayarda zaten kişisel veri varsa üzerine yazılmaz. Taşınan botlar **kendiliğinden başlamaz**: önce Mutabakat, sonra Başlat ([Kurulum sihirbazı](#/kilavuz/kurulum-sihirbazi/tasi)).
- **Araştırma eklentisi:** araştırma verilerini ayrı bir dosyayla taşı. Eklentisi olmayan yeni kurulumda Araştırma menüsü görünmez. Bugünkü kurulumlarda (bu bilgisayar, sunucu) her şey yerinde.
- **USB yedeği:** yedek şifresini bir kez kaydedersen haftalık USB yedeği aynı biçimde `.pusula` dosyası yazar. Şifre kaydedilene kadar eskisi gibi sürer. Eski yedekler okunabilir kalır ([Eski yedekten geri yükleme](#/kilavuz/yedek-tasima/eski-yedek)).

## 68.0 — Veri yeri ayrıldı, taşıma komutu (2026-10-19) {#s68-0}

- **Var olan kurulumda hiçbir şey değişmez:** Pusula eskisi gibi `data` klasörünü kullanır (sunucu dahil). Veri yalnız siz komut verince taşınır.
- **Yeni komut `npm run veri-tasi`:** veriyi program klasörünün dışına (`C:\Pusula-Veri`, ya da `--hedef` ile seçtiğiniz yere) kopyalar, her dosyayı doğrular ve türlerine göre beş klasöre ayırır: kişisel, gizli, araştırma, önbellek, bu bilgisayara özel. Önce `--deneme` ile planı görün; Pusula çalışırken taşımaz. Eski `data` klasörü olduğu gibi kalır; geri dönüş için `veri-yeri.json` silinir ([Adım 26](#/kilavuz/kurulum/adim-26)).
- **Ayarlar ikiye ayrıldı:** program varsayılanı (`config.varsayilan.json`, kişisel bilgi yok) + sizin ayarınız (`ayarlar.json`, yalnız farklı olanlar). İlk ayar kaydına kadar eski `config.json` okunur — davranış aynı.

## 67.5 — Demo kabul sayımı, Hücum ekranı, aylık/yıllık rapor, laboratuvar (2026-10-19) {#s67-5}

- **Demo kabul raporu:** çökme sayımı düzeltildi — 1 dakika içindeki ardışık kapanmalar tek olay, oturum kapanırken programın açılamaması sayılmaz, Windows kapanışı / yeniden başlatma çökme değil ayrı bilgi satırı; verilmeyen küçük emir oranı yalnız sayının kaydedildiği günlerle; getiri / düşüş / oynaklık bandı botun kendi değerinden (eskiden hep 0 çıkıyordu). Kartta I2 / I3a / I8 satırlarının altında katlı **Ayrıntı**; I9 satırında bilinen model–canlı farkı notu. Eşikler değişmedi ([Demo kabul raporu](#/kilavuz/ileri-test/demo-rapor)).
- **Botlar › Hücum:** BTC ayağı koruma stopundan bilerek hariç (demo kararı) — artık "Koruma stopu eksik" denmez; pozisyon satırında **bilerek stopsuz** rozeti.
- **Botlar › Hücum › İşlemler:** "Dağılım geçmişi" → **Pozisyon büyüklüğü**: her bölümün açık pozisyon büyüklüğü (USDT), kâr/zarar değildir; altında bölüm başına son değer ve döneme göre değişim ([Botlar](#/kilavuz/botlar)).
- **Günlük › Raporlar:** **Aylık** (ayın 1'i, geçen ay) ve **Yıllık** (1 Ocak, geçen yıl) raporlar; özetleri Telegram'a gider. Kaçırılan dönem sonradan arşive yazılır ([Raporlar](#/kilavuz/raporlar)).
- **Telegram:** geliştirme bilgisayarı komut yoklaması ve gönderim yapmaz (sunucudaki yoklamayla çakışma — "409" — biter). Sunucuda değişiklik yok.
- **Portföy laboratuvarı:** "Olsaydı planı" kaldırıldı (eski adres Kurucu'ya; eski karar günlüğü Karşılaştır altında arşiv). Ana sekmeler **Kurucu · Sonuç · Karşılaştır**; Strateji karışımı ve Varyasyon **İleri araştırma ▾** katında. Kurucu'da katalogda olmayan hisse **Yahoo'da bul ve ekle** ([Laboratuvar](#/kilavuz/portfoy/sekmeler)).
- **Portföy › Hedefim › Planla:** **Bu dağılımı geçmişte dene** — planın hedef payları laboratuvarda geçmişte simüle edilir ([Adım adım](#/kilavuz/portfoy/tutarlari-girmek)).

## 67.4 — Pano okunur, Hesaplar sade: Yeni hesap, Varlık ekle (2026-10-19) {#s67-4}

- **Pano › Dağılım:** halkanın altında dilim listesi — her dilimde içindeki varlıklar bütün portföy içindeki paylarıyla (ör. "Hisse %10,8 — PYPL %4,1 · ASTS %3,2"); nakitte para birimleri; Sınıf / Hesap / Para'nın üçünde ([Dağılım](#/kilavuz/portfoy/dagilim)).
- **Pano › Değer · getiri:** her çizginin ucunda son değer (×4,16 ya da +%31,6) ve grafiğin altında seçili her kıyasın ne ölçtüğü — TL mevduat = TCMB 1 aya kadar vadeli ortalama faiz, stopaj sonrası, her ay yenilenir (üst sınır); BIST 30 temettü hariç; QQQ temettü dahil ([Kıyaslar](#/kilavuz/portfoy/kiyaslar)).
- **Pano › Aylık getiri:** hücrelerde yüzde, sonda **Yıl** sütunu; telefonda yana kaydırılır. **Bot hesapları** satırı Pano'dan kaldırıldı (botların parası Botlar sayfasında).
- **Hesaplar › Yeni hesap:** ayrı kart — kurum adıyla (yoksa kendiliğinden eklenir), hesap adı, tür, para birimi, isteğe bağlı vadeli mevduat; üst çubukta seçili portföye bağlanır ([Yeni hesap](#/kilavuz/portfoyum/yeni-hesap)).
- **Hesaplar › Varlık ekle:** "Hisse ekle" yerine sekmeli kart — Hisse / ETF · Fon (TEFAS) · Kripto · Altın (gram) · Nakit bakiyesi · Diğer (elle fiyat); yalnız var olan hesaba ekler, varlık yoksa arkada açar ve fiyatını indirir ([Varlık ekle](#/kilavuz/portfoyum/varlik-ekle)).
- **Hesap kartında:** **Vadeli mevduat** (faiz ayarının tek yeri; ayar varsa özeti ve Değiştir) ve **Fiyat gir / ⋯ › Fiyatı düzelt** (elle fiyat) ([Vadeli mevduat](#/kilavuz/portfoyum/mevduat-faizi), [Elle fiyat](#/kilavuz/portfoyum/elle-fiyat)).
- **Sadeleşenler:** "Tüm işlem türleri" → **Diğer işlemler: transfer, faiz, ücret, bölünme** (açılış bakiyesi Varlık ekle'de); işlem defteri katlı, varsayılan kapalı (başlıkta kayıt sayısı); Gelişmiş'te yalnız adlar ve hesap kapatma.

## 67.3 — Para ekle ve dağılımı değiştir, portföy adı (2026-10-19) {#s67-3}

- **Portföy › Hedefim › Para ekle ve dağılımı değiştir:** eklenecek parayı (₺ ya da $) ve her hissenin kuralını (**Sabit %** / **Oranını koru**) yaz; hangi hisseden kaç adet alıp satacağını hesaplar ([Para ekle](#/kilavuz/portfoy/para-ekle)).
- **Satışta elde kalacak adet:** satış gerekiyorsa ne kadar satılacağı ve **satıştan sonra elinde kaç adet kalması gerektiği** tabloda vurgulu, Yapılacaklar'da büyük yazılır; liste kopyalanabilir.
- **Aldım, işlemleri kaydet:** para yatırma + satışlar + alışlar seçili portföyün hesabına tek seferde yazılır (önce gerçek adet ve fiyat düzeltilebilir). **Vazgeç** hiçbir şey yazmaz.
- **Portföy botları ne tutuyor:** planlayıcının en altında botların bugünkü listesi; **+ Plana ekle** ile Sabit %5 gelir. Liste öneri değildir.
- **Portföy › Hesaplar:** portföylerin adı değiştirilebilir (**Adını değiştir**) ([Portföyler](#/kilavuz/portfoyum/portfoyler)).

## 67.2 — Portföyde alış tarihi (2026-10-19) {#s67-2}

- **Alış tarihi:** Hesaplar'da **Hisse ekle** formunda ve satırdaki **Düzenle**'de alış tarihi girilir ve değiştirilir; satırda varlık adının altında görünür ([Hisse ekle](#/kilavuz/portfoyum/hisse-ekle)).
- **Getiri alış fiyatından:** alış fiyatı girilmiş varlıkta Pano'daki getiri (Bu yıl, Başlangıçtan, grafik, aylık) alış fiyatından ölçülür; önceden alış gününün kapanışından başlıyordu ve yeni eklenen portföylerde 0 görünüyordu.

## 67.1 — Sade bildirimler, isteğe bağlı kurulum sihirbazı (2026-10-19) {#s67-1}

- **Telegram bildirimleri:** her mesaj **bot · ne oldu** başlığıyla, bir iki sade cümle; uyarı ve acil mesajlarda **Ne yapmalı:** satırı; Türkçe sayı, kısa saat; iç terim ve belge adı yok ([Bildirimler › Mesajların biçimi](#/kilavuz/bildirimler/bicim)).
- **Kurulum sihirbazı zorunlu değil:** kurulum tamamlanmadıysa her girişte üstte uyarı şeridi ("Kurulum sihirbazını aç" · "Şimdilik geç"). Riskler onaylanmadan bot başlatılamaz kuralı sürüyor.
- **Dağıtım:** araştırma kitapçıkları da pakette.

## 67.0 — Raporlar, bildirim merkezi, günlükler, kurulum sihirbazı (2026-10-19) {#s67-0}

- **Araştırma defteri:** her kayıt sade bir hikâye: **ne denendi → neyle kıyaslandı → ne çıktı → sonuç ve ders**, altında plan belgesi ve betikler ([Araştırma defteri](#/kilavuz/defter/okumak)). Hikâye kayıttaki metinden kendiliğinden üretilir, kısaltmalar açılır; teknik metin katlı. Bütün yazılar sola yaslı.
- **Günlük › Raporlar:** her sabah 09:00'dan sonra dünün günlük raporu, pazartesi geçen haftanın haftalık raporu: botların değer değişimi, işlemleri, ücret ve gerçekleşen kâr/zararı · model emirleri · portföy botlarının tercihleri. Özeti Telegram'a gider ([Raporlar](#/kilavuz/raporlar)).
- **Sistem › Bildirimler:** Telegram'a giden her bildirim türü tek listede: ne zaman gelir, önemi, son gönderim, aç/kapat; son gönderilenler ve sonucu. Acil durum kapatılamaz. Ayarlar'daki eski dört kutu kalktı ([Bildirimler](#/kilavuz/bildirimler)).
- **Sistem › Günlükler:** botların, verinin ve sunucunun her olayı tek biçimde (zaman · seviye · kaynak · ne oldu), 30 gün; süz, ara, CSV. Ana sayfanın Sistem kartında son 24 saatin günlük ışığı ([Günlükler](#/kilavuz/gunluk)).
- **Bilgi › Kurulum sihirbazı:** yeni bir kurulumda ilk açılışta riskler ve kullanım şartları onayı (onaysız bot başlatılamaz), Binance demo anahtarı, Telegram, telefon, acil durdurma ve ilk deneme ([Kurulum sihirbazı](#/kilavuz/kurulum-sihirbazi)). Mevcut kurulumlar sihirbazı görmez.

## 66.0 — Yeni panel (2026-10-19) {#s66-0}

- **Görünüm:** koyu tema varsayılan (açık tema sağ üstteki düğmeyle), mor vurgu; kazanç yeşili ve kayıp kırmızısı yalnız para için. Yan menü dört grupta, en çok iki seviye: **Günlük** (Ana sayfa, Portföy, Botlar) · **İzleme** (Sinyaller, İleri test) · **Araştırma** (Araştırma, Coin tarama) · **Sistem** (Veri, Ayarlar, Bilgi, Arşiv). Alt sayfalar adreste durur; eski adresler yeni yerlerine açılır.
- **Üst çubuk:** sayfa adı ve kırıntı, Kur, Kılavuz, tema; bot çalışırken **Acil durdur** (aynı onay ve PIN). Portföy sayfalarında **Ben / Fırat / Tümü** ve **$ / ₺ / Gizli** seçicisi — eski "Tutarları gizle" ve $/₺ düğmeleri kalktı. Telefonda alt çubuk **Ana · Portföy · Botlar · Sinyaller · Menü**.
- **Portföy:** [Pano](#/kilavuz/portfoy) (toplam, getiri, sağlık puanı, kıyaslı grafik, aylık ısı haritası, düşüş) · Hesaplar (hesap → portföy, toplama dahil mi) · Varlıklar · İşlem defteri (Kripto/FX · Yatırım · Bot kaynakları) · Hedefim (portföy başına hedef, modelden al) · Modeller · Takvim ve akış · Rapor (risk/getiri ölçütleri). Binance ve OKX bakiyeleri salt okumayla Pano toplamına girer; bot hesapları ayrı satır.
- **Botlar:** her botta **Genel · Hesap · İşlemler · Yönetim** ([Botlar](#/kilavuz/botlar)). Eski Borsa hesapları sayfası **Hesap**'ta (Binance bakiyesi kartıyla), Ayarlar › Botlar eylemleri ve demo kabul süreci **Yönetim**'de; Ayarlar'da yalnız salt okunur bot özeti. İşlem dökümü (CSV) Portföy › İşlem defteri › Bot'ta.
- **Ana sayfa:** Yapman gerekenler en üstte, sonra Portföyüm ve Sistem, sonra Botlar; "Bu sürümde yeni" ince bir şerit.
- **Araştırma:** yeni [Araştırma özeti](#/kilavuz/arastirma-ozet) (deneme sayıları, hükmü yaklaşanlar, aileler, son kayıtlar); Pine ve Araştırma defteri yeniden Araştırma'da. [İleri test](#/kilavuz/ileri-test) (Genel bakış + her test kendi sayfası), [Veri](#/kilavuz/veri) ve [Arşiv](#/kilavuz/arsiv) (Genel · Kâğıt test · Kâğıt test riski · Emekli botlar) alt sayfalara bölündü.
- **Sayı biçimi:** her yerde Türkçe — $1.234,56 ve %12,35.

## 65.0 — İşlem defterim: Binance salt okuma bağlantısı (2026-10-18) {#s65-0}

- **Portföy › İşlem defterim › Hesaplar:** Binance hesabının kartında **API Key** ve **Secret Key** alanları, **Anahtarı dene ve kaydet**, **Şimdi eşitle**, **Anahtarı sil** ([Binance anahtarı nasıl alınır](#/kilavuz/islem-defterim/binance-anahtar)). Anahtar kayıtlıysa spot işlemlerinin **bütün geçmişi**, vadeli işlemlerin (son 6 ay) ve fonlama / hareketlerin (son 3 ay) gelir; sonra her gün kendiliğinden (sunucuda). Binance'ten bir daha dosya indirmen gerekmez.
- **Yalnız okuma:** Pusula anahtarı kaydetmeden önce Binance'e izinlerini sorar; yalnız **Okumayı etkinleştir** açık olmalı. İşlem, vadeli, marjin, çekim, aktarım ya da tanımadığı herhangi bir izin açıksa anahtar **reddedilir ve kaydedilmez**. Bu anahtar botun anahtarından ayrıdır; panele, telefona, Telegram'a gitmez.
- **Vadeli okuma denemesi:** kayıtta Pusula vadeli geçmişi bir kez dener; kartta "vadeli okuma: Binance kabul etti ✓" ya da "vadeli okuma için Binance bu anahtarı kabul etmedi: …" yazar. Kabul etmezse spot yine eşitlenir, vadeli için dosya yüklenir.
- **Spot tam tarama:** Binance hangi coinlerde işlem yaptığını söylemediği için ilk seferde ~1 600 çift tek tek sorulur; Binance'in dakikalık sınırına uyulduğu için birkaç eşitlemeye bölünür ("spot tam tarama: 412 / 1630 çift"), sunucu her saat kaldığı yerden sürdürür.
- **Çift sayım yok:** daha önce yüklediğin Binance vadeli dosyalarındaki işlemler (Trade ID) ve hareketler (Transaction ID) bağlantıdan ikinci kez eklenmez; spot dosyasındaki işlemler aynı saniye, yön, miktar ve fiyattan tanınır.

## 64.9 — İleri test: 876 gölge kartı (Hücum %90 + TVL long/short %10) (2026-10-17) {#s64-9}

- **İleri test** sayfasında beşinci kart **876 gölge — Hücum %90 + TVL L/S %10** ([876 gölge kartı](#/kilavuz/ileri-test/g876)). Geçmiş testte yalnız en derin düşüş sınırını (%25) aştığı için elenen TVL long/short kuralı (876), **emirsiz gölge** olarak Hücum simülasyonuyla günlük %90 / %10 birleştirilip izlenir. Kural değişmedi.
- Kuruluşlar **1 Kasım** ve **1 Aralık 2026** (ayın 1'i, önceki günün kapanışıyla); **rapor günü 1 Ocak 2027**. Karar takviminde de görünür.
- Kartta: bu ayın sepeti (kaç long, kaç short), bu ay (876), başlangıçtan beri, birlikte − yalnız Hücum (puan), en derin düşüşler, **vazgeçme kuralı** (876'nın düşüşü −%20'ye ulaşırsa ya da birlikte düşüş Hücum'unkinden 3 puandan fazla kötüyse gölge durur ve rapor yazılır).
- **İki ay istatistiksel kanıt değildir:** rapor yalnız ne olduğunu anlatır; uzatma ya da canlı hesap kararı 1 Ocak 2027'de sizindir. Para yok, emir yok, borsa anahtarı yok.
- Kayıt sunucunun her gece çalışan ileri test işiyle yazılır; sunucuda ayrıca bir şey kurmanız gerekmez.

## 64.8 — Geliştirme bilgisayarından yazmak: sunucu tek kaynak + kuyruk (2026-10-16) {#s64-8}

- **Portföyüm ve İşlem defterim'in tek yeri sunucu.** Geliştirme bilgisayarı Portföyüm'ü de artık sunucudan okur (İşlem defterim 64.7'den beri). İki bilgisayar ayrı ayrı kayıt tutmaz.
- **Yazma jetonu** kuruluysa ([Kurulum › Adım 25](#/kilavuz/kurulum/adim-25): sunucuda `npm run gelistirme-jeton`, burada `npm run sunucu-baglanti -- --yazma-jeton …`) geliştirme bilgisayarında girilen işlem, hesap, dosya yükleme, geri alma ve iptal **sunucuya gönderilir**. Jeton yalnız bu iki bölümün kayıtlarını yazar — bot, ayar, güncelleme, OKX anahtarı, emir değil.
- **Sunucu kapalıysa kuyruk:** değişiklik geliştirme bilgisayarında sırayla bekler, sunucu açılınca aynı sırayla kendiliğinden gider ("Sunucu kapalı: N değişiklik kuyrukta" bandı, **Kuyruk** bölümü: **Şimdi gönder**, sunucunun kabul etmediğine **Kuyruktan çıkar**). Aynı değişiklik iki kez gelirse sunucu bir kez uygular ([İşlem defterim › kuyruk](#/kilavuz/islem-defterim/ev-kuyruk)).
- **OKX iki bilgisayarda:** her bilgisayar kendi salt okuma anahtarını kendisinde saklar. Geliştirme bilgisayarında **Şimdi eşitle** OKX'ten çeker, satırları sunucuya yollar (sunucu çiftleri atlar); her gün kendiliğinden eşitleme yalnız sunucuda.
- **Bir kezlik taşıma:** geliştirme bilgisayarında daha önce girilmiş Portföyüm kayıtları için "Bu bilgisayardaki Portföyüm kayıtlarını sunucuya taşı" kartı — önce kuru deneme (eklenecek / sunucuda zaten var / eklenemez), sonra onay. Dosya silinmez ([Portföyüm › geliştirme bilgisayarı](#/kilavuz/portfoyum/gelistirme-bilgisayari)).

## 64.7 — İşlem defterim: kendi kripto ve FX işlemlerin (2026-10-16) {#s64-7}

- **Portföy › İşlem defterim** (yeni sekme, Rapor'un yanında): OKX, Binance geçmişi ve MetaTrader 4/5 işlemlerin tek yerde, dolar cinsinden ([İşlem defterim](#/kilavuz/islem-defterim)). Botların işlemleri ve Portföyüm buna karışmaz.
- **Sonuç:** net kâr/zarar = gerçekleşen kâr (spot FIFO; vadeli ve FX borsanın/aracı kurumun kârı) − ücret + fonlama + swap. Para yatırma/çekme sonucu değiştirmez.
- **Grafikler ve tablolar:** birikimli kâr/zarar (ve bakiye), tepeden düşüş, aylık çubuklar + yıl × ay tablosu, sembol tablosu (işlem, kazanma oranı, ortalama kazanç/kayıp, kâr faktörü, işlem başı, en büyük kayıp, ücret, fonlama), uzun ↔ kısa, MetaTrader tutma süresi, süzgeçli işlem listesi. Sembole tıkla: fiyat grafiği üstünde alım ▲ / satım ▼.
- **Yükleme:** OKX "Trading history" CSV, Binance spot ve vadeli "Trade History" + vadeli "Transaction History" CSV, MetaTrader 4 "Detailed Statement" ve MetaTrader 5 "History" HTML raporu. Önce önizleme, sonra Kaydet; aynı satır iki kez eklenmez; **Geri al** bütün yüklemeyi etkisiz yapar (silmez). MetaTrader için hesap başına **sunucu saat farkı**.
- **OKX bağlantısı (isteğe bağlı):** yalnız **Read** izinli API anahtarı kabul edilir (Trade/Withdraw izinli anahtar reddedilir); her gün son 3 ay kendiliğinden eşitlenir. Anahtar ekrana bir daha gelmez.
- Yükleme ve ayarlar yalnız sunucudan; telefondan ve geliştirme bilgisayarından yalnız bakılır (kayıtlar sunucudan okunur).

## 64.6 — Pozisyon, emir ve geçmiş tek yerde; XRP teminatı düzeltildi (2026-10-16) {#s64-6}

- **Tek yer:** Botlar › Hücum › **Binance bakiyesi** artık yalnız bakiye dökümü (kalemler + denklem + eşleşme satırı). Pozisyonlar, bekleyen emirler ve işlem geçmişi yalnız grafiğin altındaki **İşlemler** panelinde ([İşlemler](#/kilavuz/botlar/islemler)).
- **İşlemler › Açık pozisyonlar** Binance "Positions" sütunlarıyla (Size, Entry, Break-even, Mark, Liq., Margin, PNL, ROI, kaldıraç); **Bekleyen emirler** Temel (Basic) ve Koşullu (Conditional) ayrı başlıkla; **İşlem geçmişi** Binance "Trade History" alanlarıyla (fiyat, miktar, ücret, rol Maker/Taker, gerçekleşen kâr). Eski kayıtların rol ve gerçekleşen kârı Binance'ten bir kez tamamlanır.
- **Düzeltme — XRP teminatı:** pozisyon teminatı 4,29 / 13x yerine Binance'teki gibi 2,86 / 20x (açık alış emrinin 1,43 teminatı pozisyona katılıyordu; kaldıraç artık Binance'in kendi alanı).
- **Düzeltme — yanlış "EŞLEŞMİYOR":** Kullanılabilir Binance'in Avbl sayısının kendisidir; denetim denklemi Binance'in toplam başlangıç teminatıyla kurulur ve birkaç kuruşluk zaman farkı (0,50 $'a kadar) "eşleşiyor" sayılır.
- **Düzeltme — işlem geçmişi:** 7 günden uzun işlem yapılmayan coinde sonraki işlemler borsadan hiç çekilmiyordu (Binance 7 günlük pencere sınırı); artık haftalık pencerelerle.

## 64.5 — Binance bakiyesi kuruşu kuruşuna, botun kendi getirisi (2026-10-15) {#s64-5}

- **Botlar › Hücum › Binance bakiyesi** (yeni bölüm): Binance'in kendi hesap alanları, Binance'teki adlarıyla — cüzdan bakiyesi (Wallet Balance), gerçekleşmemiş K/Z (Unrealized PNL), **marj bakiyesi = hesap değeri** (Margin Balance), pozisyon teminatı, açık emir teminatı ve **kullanılabilir (Avbl)**, altında denklem ve "Binance ile eşleşiyor" denetimi ([Binance bakiyesi](#/kilavuz/botlar/binance-bakiyesi)).
- **Hesap değeri ↔ Avbl farkı:** örnek 4.888,84 (Avbl) + 58,52 (8 pozisyonun teminatı) + 1,43 (XRP alış emrinin teminatı) = 4.948,79 → panelde 4.949. Hesap değeri kutusunun altında artık Avbl de yazar; Borsa hesapları'ndaki bakiye kutusunda da.
- **Botun kendi getirisi:** hesapta botun sermaye tavanından fazla para varken (demo hesap ~5.000 $, Hücum-S tavanı 1.000 $) grafik, **Başlangıçtan** ve **En derin düşüş** botun kendi sermayesi üstünden hesaplanır: bot değeri = tavan + (hesap değeri − ilk gün hesap değeri). Önceden bu durumda çizgi düz 1,00, getiri ve düşüş %0,0 kalıyordu. Kutuda "bot sermayesi 1.000 $ (tavan) — hesap 4.949 $" yazar.

## 64.4 — İleri test: demo kabul raporu panelde (2026-10-15) {#s64-4}

- **İleri test › Demo kabul** kartında yeni **Kabul raporu** bölümü: 20 ölçütün tablosu (değer · durum · kısa not), **Gün N / 63** ile 30. gün ara rapor ve 63. gün hüküm tarihleri, §8.2 kayıtlarının başladığı gün ve **prova günlüğü** durumu. Komut satırındaki demo kabul raporuyla aynı hesap; 63. güne kadar genel hüküm gösterilmez, ölçütler "… bandında" yazılır ([Demo kabul raporu](#/kilavuz/ileri-test/demo-rapor)).
- Rapor sunucudaki bot kayıtlarından dolar; geliştirme bilgisayarında "Gün 0 henüz yok" yazar. Maliyet ölçütünün (U4) referans fiyatları için sunucuda bir kez komut satırında `node scripts/demo-kabul-rapor.js --ag`.

## 64.3 — İzle listesi ve puan gölgesi (2026-10-15) {#s64-3}

- **Araştırma › Coin tarama › İzle** (yeni ekran): dikkat listesinde temiz, en az 3 veri ailesi olan, kendi kategorisinde kazandığı ücrete göre ucuz (P/F en düşük %20) ve holder sayısı 30 günde artan coinler — her gece en çok 15. Yanında sekiz ölçünün eşit ağırlıklı ortalamasıyla **puan listesi (gölge)**, girenler/çıkanlar ve ısınma dönemi için **ön izleme karnesi** ([İzle listesi](#/kilavuz/izle-listesi)).
- Listenin işe yarayıp yaramadığı önceden yazılmış kuralla ölçülür: 12 pencere, 1 000 rastgele sepet; sonuç hüküm gününe (t0 + 374 gün) kadar gösterilmez. İlk liste ≈ 30 kayıt günü sonra çıkar.
- Dikkat listesi coin ayrıntısı artık coinin İzle geçmişini de taşır (İzle sayfasındaki coin düğmesi).

## 64.2 — Portföy › Rapor ve otomatik mevduat faizi (2026-10-15) {#s64-2}

- **Portföy › Rapor** (yeni sekme, Portföyüm'ün yanında): seçtiğin ayın karnesi — ay başı → ay sonu değer, para girişi/çıkışı, piyasa etkisi, zaman ağırlıklı ve **para ağırlıklı** getiri, **TL enflasyon hariç** getiri (o ayın TÜFE'siyle); başlangıçtan para ağırlıklı ve reel getiri; ayın en çok kazandıran/kaybettiren varlıkları; **kötü senaryolar** (BTC −%50, Nasdaq −%30, altın −%20, dolar/TL +%30, 2022 tekrarı) iki yöntemle (doğrudan pay ↔ geçmiş ilişkiyle/beta); sınıflar arası **korelasyon** ısı tablosu ([Rapor](#/kilavuz/portfoyum-rapor)).
- **Vadeli mevduat faizi otomatik:** hesaba yıllık oran, vade, stopaj, vade başlangıcı ve "vade sonunda yenile" girersen her biten vadenin net faizi kendiliğinden eklenir (defterde "otomatik"); sildiğin bir daha eklenmez ([Mevduat faizi](#/kilavuz/portfoyum/mevduat-faizi)).

## 64.1 — Dikkat listesi: otomatik tarama ve kendini denetleme (2026-10-15) {#s64-1}

- **Araştırma › Coin tarama › Dikkat** (yeni ekran): sunucu her gece yüzlerce coini kendiliğinden tarar; 16 kuraldan biri tutan coin dikkat listesine girer. Listeye giren her coin ve aynı gün seçilen 3 rastgele kontrol coini 90 gün izlenir. **Karne**, listedekilerin kontrollere göre gerçekten daha çok çöküp çökmediğini ve hangi kuralın işe yaradığını gösterir ([Dikkat listesi](#/kilavuz/dikkat-listesi)).
- **Tarama ayarları:** dikkat listesine yeni giren coinler için Telegram bildirimi (varsayılan açık).

## 64.0 — Kitapçık: Strateji kitapları genişletildi (2026-10-15) {#s64-0}

- **Strateji kitapları** kitapçığına yeni bölümler: Anti ve A/D Market Buster, momentum hissesi açığa satışı, Kuepper trend ve ortalama sistemleri, Woods ve Bible'ın diğer formasyonları, Damir eğik çizgi ve değer alanı, Volman FPAS kurulumları, işlem yönetimi kuralları, günlük kayıp limiti ve Steenbarger'ın diğer hipotezleri ([Kitapçık](#/kilavuz/kitapcik)).

## 63.9 — Kitapçık: Strateji kitapları eklendi (2026-10-15) {#s63-9}

- **Kitapçık** listesine beşinci kitapçık: **Strateji kitapları** — Connors & Raschke, Kratter, Kuepper, price action kitapları, Volman ve psikoloji kitaplarının kuralları: anlatım ve 7 piyasada test ([Kitapçık](#/kilavuz/kitapcik)).

## 63.8 — Kitapçık: Grafik stilleri eklendi (2026-10-15) {#s63-8}

- **Kitapçık** listesine dördüncü kitapçık: **Grafik stilleri** — harmonik, Elliott, formasyonlar, mumlar, DeMark, Wyckoff, seviyeler ve trend göstergeleri: anlatım ve 7 piyasada test ([Kitapçık](#/kilavuz/kitapcik)).

## 63.7 — İleri test: EUR/USD CBDR gölge testi (2026-10-15) {#s63-7}

- **İleri test** ekranına dördüncü kart: **EUR/USD — CBDR ile Londra girişi**. ICT modelinin kuralı önceden kayda geçti; 15 Ekim 2026'dan itibaren her iş günü "olsaydı ne olurdu" kaydı tutulur, emir verilmez. Kartta işlem sayısı, ortalama R, sıradaki günün durumu (koşul sağlandı mı, limit seviyesi); grafiklerde birikimli R; takvimde ara kontrol (15 Nisan 2027) ve karar günü (15 Ekim 2027) ([İleri test](#/kilavuz/ileri-test/cbdr)).

## 63.6 — Kitapçık: ICT Kitabı eklendi (2026-10-15) {#s63-6}

- **Kitapçık** listesine **ICT Kitabı** (ikinci sırada): ICT'nin bütün kavramları ve 23 modeli kitap gibi; forex (DXY pariteleri) ve Nasdaq 100 üzerinde backtest ([Kitapçık](#/kilavuz/kitapcik)).

## 63.5 — Kitapçık: ICT modelleri eklendi (2026-10-15) {#s63-5}

- **Kitapçık** listesine ikinci kitapçık: **ICT modelleri** — ICT kavramları, 16 alım satım modeli, gerçek işlem grafikleri ve BTC / EUR/USD backtest sonuçları ([Kitapçık](#/kilavuz/kitapcik)).

## 63.4 — Kitapçık: bot stratejileri panelde (2026-10-15) {#s63-4}

- **Kitapçık** menüsü (telefonda Diğer): "Bot stratejileri" kitapçığı — elimizdeki her botun alım satım kuralı, grafikleri ve backtest sonucu ([Kitapçık](#/kilavuz/kitapcik)).
- Kitapçık panelin içinde ekran yüksekliğinde açılır, panelin temasını (açık/koyu) izler; **Yeni sekmede aç** ile ayrı sekmede okunur.

## 63.3 — Sinyaller: bugün sistem ne diyor (2026-10-14) {#s63-3}

Taslak sayfası üzerinden birlikte kararlaştırıldı ([Sinyaller](#/kilavuz/sinyaller)):
- **Uygulanan kurallar tek tabloda:** BTC trendi ve coin sepeti (Hücum, Denge), Nasdaq M10, %50 QQQ + %50 Hücum dengeleme bandı; BIST M10 gri satır (kâğıt model). Her satırda bugünkü karar, karara uzaklık çubuğu, sıradaki karar günü ve kim uyguladığı.
- **Katlı ayrıntılar:** coin sepeti coin coin (açık pencere, en yakın çıkış / giriş, oynaklık tavanı); Nasdaq M10 sıralamasının sınırı (8.–13. sıra, çıkacak / girecek).
- **Gölge kurallar:** Bollinger'li kural, 3 günlük karar, yatay piyasa filtresi — bugün ne derdi, uygulanan kurala göre farkı.
- Bilgi göstergeleri (funding, stablecoin, MVRV) bilerek yok. **Gösterge havuzu** Araştırma › Strateji testi alt menüsüne taşındı; "← Pusula" Araştırma'ya döner.

## 63.2 — Veri: özet + kullanana göre gruplar (2026-10-14) {#s63-2}

Taslak sayfası üzerinden birlikte kararlaştırıldı ([Veri](#/kilavuz/veri)):
- **Üç büyük durum:** bot ve portföy verisi (güncel / toplam) · coin tarama kaynakları (çalışan / toplam) · günlük arşiv (zincir sağlam mı).
- **Kullanana göre katlı gruplar:** Botlar · Portföy ve modeller · Araştırma · Coin tarama kaynakları · Günlük arşiv. Sorunsuz grup kapalı, sorunlu grup açık gelir.
- **Kim kullanıyor** etiketleri her kaynakta; eski adlar sade (kol önbelleği → coin sepeti önbelleği, Yahoo H2 serileri → Yahoo kıyas serileri).
- **Coin tarama kaynakları:** sade terimler (piyasa havası, yeni coin bulma, uzak dur kontrolü, temel değer göstergeleri, batmış proje kaydı…); yedeği olan satırda gri "yedek var — kayıp yok".

## 63.1 — İleri test: takvim, grafikler, sade kartlar (2026-10-14) {#s63-1}

Taslak sayfası üzerinden birlikte kararlaştırıldı ([İleri test](#/kilavuz/ileri-test)):
- **Ara rapor notu** sayfa başında bir kez (kartlardaki rozet kalktı).
- **Karar takvimi:** bugünden başlayarak bütün karar ve kontrol günleri tek çizelgede.
- **Grafikler** — her test kendi grafiği: Hücum ve Denge simülasyonunun en derin düşüşü (uyarı / alarm eşik çizgileriyle), Bollinger (BTC: mevcut ↔ Bollinger'li), yan denemeler (günlüğe göre fark), demo uygulama sapması (%3 / %5 çizgileri). Seriler izleyici kayıtlarından (7 Ekim 2026'dan).
- **Kartlar:** tek cümle, büyük durum, iki ana sayı, **karar günü**; geri kalanı katlı **Ayrıntı**. Demo kartındaki yol tarifi güncel (Ayarlar › Botlar → Botlar › Hücum › Başlat).
- **Sade terimler:** gölge → simülasyon, p95 / p99 → uyarı / alarm eşiği, D3 range vetosu → yatay piyasa filtresi, 3 günlük aday → 3 günlük karar, Hücum-S → 1000 $'lık Hücum, hüküm tarihi → karar günü.

## 63.0 — Ayarlar: beş sekme (2026-10-14) {#s63-0}

Taslak sayfası üzerinden birlikte kararlaştırıldı ([Ayarlar](#/kilavuz/ayarlar)). Sürüm 62.10 yerine 63.0 (sayısal karşılaştırmada 62.10 = 62.1 sayılırdı).
- **Beş sekme:** Botlar · **Bildirimler** (Telegram + Sağlık sinyali) · Borsa · Bu bilgisayar · **Güncelleme**. Açılış her zaman Botlar; adres sekmeyi taşır (`#/ayarlar/bildirimler`).
- **Güncelleme** kendi sekmesinde: onay beklerken sekmede "onay" rozeti; Ana sayfadaki "kurulmayı bekliyor" satırı ve Sistem ışığı doğrudan bu sekmeyi açar.
- **Piyasa verisi** ve **İzleme listesi** → [Araştırma › Strateji testi › Veri ve izleme listesi](#/kilavuz/izleme) (botları etkilemezler).
- **Bu bilgisayar** etiketleri tek satır; açıklamalar yerinde. Hesap türü açıklamasındaki kapı şartları "canlı hesap" diliyle.

## 62.9 — Araştırma: üç grup, sade backtest (2026-10-14) {#s62-9}

Taslak sayfası üzerinden birlikte kararlaştırıldı:
- **Üç grup:** [Strateji testi](#/kilavuz/stratejiler) (Stratejiler · Backtest) · [Portföy laboratuvarı](#/kilavuz/portfoy/sekmeler) · [Coin tarama](#/kilavuz/coin-tarama) (Tarama · Listeler · Ayarlar). Grup içi sekmeler ikinci satırda.
- **Arşiv'e taşınanlar:** Kâğıt test, Kâğıt test riski, Pine, Araştırma defteri (Arşiv'in üst menüsü). Eski `#/arastirma/…` adresleri yeni yerlerine açılır.
- **Stratejiler:** Çalışan botlar (Hücum, Denge) · Adaylar · katlı **Geçti, kullanılmıyor**. Elenenler [Arşiv › Eski stratejiler](#/kilavuz/arsiv)'de. "Kâğıt testte dene" ve "Pine'dan içe aktar" düğmeleri kalktı.
- **Backtest:** sade form — strateji, coin, zaman dilimi, tarih aralığı. Borsa, piyasa, sermaye, test türü (tek koşu / walk-forward / optimizasyon) ve "arşivdeki stratejileri de göster" **Gelişmiş** katında.
- **Portföy laboratuvarı** Araştırma içinde açılır (`#/arastirma/laboratuvar`); sol menüde Araştırma yanık kalır.
- **Coin tarama:** uyarılar tek satırlık katlı kutuda; açıklama tek satır.

## 62.8 — Ana sayfa: dört kart, önce Botlar (2026-10-14) {#s62-8}

Taslak sayfası üzerinden birlikte kararlaştırıldı ([Ana sayfa](#/kilavuz/ana)):
- **Botlar** kartı en üstte ve geniş: Hücum ve Denge yan yana — durum, hesap türü, hesap değeri, başlangıçtan getiri (aynı dönemde BTC), son karar, koruma stopu; durduysa **Ne yapmalı**.
- Altında yan yana **Portföyüm** (toplam, bu ay, ≈ TL), **Modeller** (tek satır + ışık), **Sistem** (veri · borsa hesapları · Pusula sürümü ışıkları). Grafik yok.
- **Yapman gerekenler** en altta: yalnız senin işlerin; aynı iş tek satır ve gecikme etiketi ("2 modelin bu ayki emirleri Midas'a girilmedi — 5 gün gecikti").
- Coin tarama notları, veri kaynağı hataları ve model verisi tazeliği ana sayfa listesinden çıktı (ilgili sayfada; Sistem kartında ışık).
- Sade terimler ana sayfada da: koruma stopu, teminat. Telefonda sıra: Botlar → Yapman gerekenler → Portföyüm → Modeller → Sistem.

## 62.7 — Borsa hesapları: sekme = hesap, Ayarlar › Borsa, "canlı hesap" (2026-10-14) {#s62-7}

Taslak sayfası üzerinden birlikte kararlaştırıldı ([Borsa hesapları](#/kilavuz/hesaplar)):
- **Ad:** Hesaplar → **Borsa hesapları** (Portföy › Hesaplarım ile karışmasın). Eski `#/hesaplar` adresi buraya açılır.
- **Sekme = hesap:** Binance demo · Denge kâğıt hesabı · **Canlı hesap** (2027'ye kadar kilitli bilgi sekmesi). Sekme adında bakiye ve sağlık ışığı.
- **Önce sağlık:** büyük durum rozeti (Bağlantı sağlıklı / Bot durdu / Okunamadı / Kayıtlar borsayla farklı / Saat kaymış / Koruma stopu eksik), sorun varsa **Ne oldu? / Ne yapmalı** bandı, dört sağlık kutusu.
- **Sayılar:** bakiye, açık pozisyon (şu anki K/Z), bekleyen emir (koruma stopu / kademe), bu ay ödenen ücret.
- **Ne var?** Açık pozisyonlar (Kimin, Şimdi, Şu an K/Z, Koruma stopu; tasfiyeye %10'dan yakınsa "zorla kapanmaya yakın"; bot satırı o botun Botlar sekmesini açar) · Bekleyen emirler (sade "Ne") · Geçmiş işlemler (son 30 gün).
- **Ayarlar › Borsa** ([ayrıntı](#/kilavuz/hesaplar/anahtar)): demo API anahtarı, **işlem dökümü (CSV)**, canlı hesap bölümü (katlı, pasif).
- **Arşiv:** eski kâğıt test hesabı (Kapat düğmeli) ve elle emir.
- **Telefon:** alt çubukta Hesaplar yerine **Hesaplarım** (Portföy › Hesaplarım); Borsa hesapları Diğer menüsünde.
- **Terim:** panelde ve kılavuzda "gerçek para" yerine **canlı hesap** (demo hesap ↔ canlı hesap).

## 62.6 — Botlar: sekme = bot, Ayarlar › Botlar, sade terimler (2026-10-14) {#s62-6}

Taslak sayfası üzerinden birlikte kararlaştırıldı ([Botlar](#/kilavuz/botlar)):
- **Sekme = bot:** Hücum ve Denge kendi sekmesinde, tam genişlik, kendi renginde; sekmede kısa durum.
- **Başlık:** büyük durum rozeti, hesap türü, kural tek cümle, **Son karar** satırı; sağda yalnız **Durdur/Başlat** ve **Acil fren**.
- **Önce getiri ve grafik:** hesap değeri, başlangıçtan, aynı dönemde BTC al-tut, simülasyona göre, en derin düşüş, BTC trendi; grafik **Canlı** (hesap · simülasyon · BTC) ↔ **Geçmiş — backtest** (2020'den, iyimser).
- **Para nerede duruyor?** (BTC / coin sepeti / nakit), **coin bazında kâr/zarar**, **aylık getiri**; künye katlı.
- **Coin grafiği** yalnız o botun coinleriyle (izleme listesi seçicisi gizli); altında o botun işlemleri. "Göstergeler" düğmesi kaldırıldı.
- **Ayarlar › Botlar** ([ayrıntı](#/kilavuz/botlar/ayarlar)): hesap türü, gerçek para emir onayı, para yatırdım/çektim, küçük hesap kipi, şimdi çalıştır, kontroller (deneme, borsayla karşılaştır, acil freni dene).
- **Sade terimler** ([liste](#/kilavuz/botlar/terimler)): özsermaye → hesap değeri, kol → coin sepeti, gölge → simülasyon, BTC payı → BTC oranı, trend açık/kapalı → yükselişte/düşüşte, felaket stopu → koruma stopu, marj → teminat, hesap kesicisi → hesap koruması, küçük sermaye → küçük hesap kipi. Ana sayfadaki bot şeridi de aynı dili kullanır.

## 62.5 — Hücum: -4067 yanlış alarmı (2026-10-14) {#s62-5}

**Hücum** (bot kodu → sunucuda **onayla** kurulur)
- 14 Ekim 03:03'teki "1000PEPE, ENA, HYPE, SOL, SUI, XRP, ZEC: marj kipi cross yapılamadı (-4067 … open orders)" uyarısı yanlış alarmdı: semboller zaten çapraz ×20 idi, Binance açık emir (felaket stopu / DCA) varken kip isteğine "zaten bu kipte" yerine -4067 döndürüyor.
- Artık bot önce mevcut kip ve kaldıracı **salt okur** (positionRisk); zaten çapraz ×20 olan sembole hiç istek atmaz. -4067 gelirse kipi yeniden okur: çaprazsa hata saymaz ve kaldıraç adımını atlamaz. Gerçekten "isolated" kalmış bir sembolde uyarı "açık emir varken kip değiştirilemez, şu anki kip isolated" diye anlaşılır gelir.
- Aynı uyarı her gece tekrar gelmez (hatasız tamamlanınca bir daha denenmez).

## 62.4 — Portföy: sekme = model, Portföyüm sayfası, Hesaplarım (2026-10-14) {#s62-4}

Taslak sayfası üzerinden birlikte kararlaştırıldı ([Portföy](#/kilavuz/portfoy)):
- **Sekmeler:** **Portföyüm** · **Nasdaq Momentum 10** · **BIST Momentum 10** · **%50 QQQ + %50 Hücum** · **Hesaplarım**. Her model kendi renginde; sekme adında o ayki açık iş sayısı.
- **Özet şeridi** her sekmenin üstünde: toplam portföy (**$ USD / ₺ TL** düğmesi), değer çizgisi, hedef → gerçek dağılım.
- **Portföyüm** ([ayrıntı](#/kilavuz/portfoyum)): şahsi portföyün model sayfasıyla aynı yapıda — başlangıçtan / bu yıl / bu ay getiri, QQQ aynı dönem, en derin düşüş, gerçekleşen K/Z + gelir, net yatırılan; **grafikte hesap düğmeleri** (her hesabın kendi performansı; hesaplar arası aktarım o hesap için para giriş/çıkışı sayılır), getiri ↔ değer, **6 kıyas** (QQQ, BIST 30, TL mevduat, dolar, TÜFE, BTC); varlık bazında kâr/zarar çubukları; bütün varlıklar (model etiketiyle); dağılım (sınıf + hesap, "hedef ve gerçek ne demek?"); **aylık getiri tablosu**; son işlemler. Hesaplarım'a girdiğin kayıtlardan (geçmiş tarihliler dahil) kendiliğinden hesaplanır.
- **Model sekmeleri** ([ayrıntı](#/kilavuz/model-portfoy)): yalnız botun sanal hesabı; sayıların altında **Bu ay** kartı (emirler + Uyguladım); grafik yanında hisse bazında kâr/zarar; elindekiler ve aday havuzu yan yana. Ayarlar ve ayrıntılı izleme model sekmelerinin altında.
- **Hesaplarım** ([ayrıntı](#/kilavuz/portfoyum/kayit)): hesap kartları; her kartın altında **+ işlem** (alış, satış, temettü, para yatırma/çekme, tarih geriye alınabilir); satırdaki **Sat** formu doldurur; üstte hisse/hesap ekle, geçmiş işlemleri içe aktar (CSV), işlem defteri, hedef dağılım.

## 62.3 — Portföy sade düzen: Portföyüm · Model portföyler · Bu ay yapılacaklar · Kayıt (2026-10-13) {#s62-3}

**Portföy** ([ayrıntı](#/kilavuz/portfoy)) — dört sekme, her biri tek bir soruya cevap:
- **Portföyüm** (varsayılan): yalnız bakılır — toplam, getiri, **değer grafiği** ve **dağılım halkası** yan yana, hesap hesap varlıklar. Form yok.
- **Model portföyler** ([ayrıntı](#/kilavuz/model-portfoy)): botların portföyü. Model seçici; **"Ne yapar?"** (kural, düz Türkçe); başlangıçtan getiri ve aynı dönemde kıyas; grafik **Canlı takip ↔ Geçmiş (backtest)** (Nasdaq M10 2004'ten, BIST M10 2012'den; kriz dönemleri; iyimser etiketli); **Şu an elde**; **Aday havuzu** — sıradaki karar bugün verilse hangi hisse kalır, çıkar, girer, kimler yedek ([ayrıntı](#/kilavuz/model-portfoy/aday-havuzu)); işlem geçmişi katlı. Eski "Model izleme" tablosu en altta katlı "Ayrıntılı izleme"de.
- **Bu ay yapılacaklar** ([ayrıntı](#/kilavuz/tasarimci/bu-ay)): kartlarda yalnız yapılacak emirler ve uyarılar; kararın künyesi katlı "Ayrıntı"da, emir sırası ve saatler katlı "Nasıl uygulanır?"da, Ayarlar en altta.
- **Kayıt** ([ayrıntı](#/kilavuz/portfoyum/kayit)): hisse ekle, işlem ekle, varlıkları düzelt, hesaplarım, işlem defteri, hedef dağılım, CSV, gelişmiş.
- **Laboratuvar** (Tasarımcı, Kurucu, Sonuç, Varyasyon, Karşılaştır, Uygulama planı) Portföy sekmelerinden çıktı: **Araştırma › Portföy laboratuvarı** ([ayrıntı](#/kilavuz/portfoy/sekmeler)).

**Botlar**
- Hisse modellerinin kâğıt hesap kartları Portföy › Model portföyler'e taşındı; Botlar yalnız Hücum ve Denge.

## 62.2 — 837 aktarım sırası, BIST 2027, vergi kaydı, oturum süresi (2026-10-13) {#s62-2}

**Portföy › Bu ay** ([ayrıntı](#/kilavuz/tasarimci))
- **%50 QQQ + %50 Hücum:** Binance'ten ABD hesabına aktarım gerekiyorsa QQQ alışı "aktarım ABD hesabına **ulaşınca** al" diye işaretli (para 1–3 iş günü yolda olabilir); ABD'den Binance'e aktarımda QQQ satışının parasının ertesi iş günü çekilebildiği yazılır.
- **Uyguladım:** aktarım satırında gönderilen ve **ulaşan** tutar ayrı; fark (banka/kur/P2P masrafı) Portföyüm'de masraf olarak düşer.
- **BIST 2027 tatilleri** Diyanet'in ilan ettiği takvimle doğrulandı (Ramazan Bayramı 9–11 Mart, Kurban Bayramı 16–19 Mayıs).

**Hücum (gerçek para için)** (bot kodu → sunucuda **onayla** kurulur)
- **Vergi kaydı:** gerçek parada spot BTC alım-satımları, spot ↔ vadeli aktarımlar ve Binance'in otomatik çevrimleri de hesap işlemleri kaydına ve CSV dışa aktarımına girer (mali müşavir için).

**Telefon**
- Oturum süresi artık sunucuda da denetlenir (30 gün; kopyalanan oturum süresiz çalışmaz). Bu sürümden sonra telefonda **bir kez yeniden giriş** gerekebilir (karekod / jeton).

## 62.1 — Demo ölçümü düzeltmeleri, para yatırma kaydı, transfer masrafı (2026-10-13) {#s62-1}

**Botlar** (bot kodu → sunucuda **onayla** kurulur)
- **Demo ölçümü:** demo hesapta botun sermaye tavanından fazla para varken BTC payı yanlış (ör. %20) hesaplanıyordu ve günlük sapma ölçümü bundan etkileniyordu — artık tavana göre. Günlük karar, bilgisayar saati ileri olsa da **kapanmamış mumla** verilmez (borsa saati kullanılır).
- **Para yatırdım / çektim** (Eylemler): demo ya da gerçek hesaba para ekleyip çektikten sonra tutarı yazın; bot bunu kazanç/kayıp saymaz, gereksiz ENGEL ya da risk kısıtı olmaz. Parayı taşımaz.
- Aynı hesapta iki bot çalışamaz (Borsa sekmesinin eski Donchian botu / ayrı bağlantı ile portföy botu). Piyasa emri borsadan "henüz dolmadı" dönerse kısa süre sonra yeniden sorulur; açık emir yanlışlıkla ikinci kez gönderilmez; acil satışla süren alım akışı çakışmaz.

**Portföyüm**
- **Ulaşan tutar:** hesaplar arası nakit transferde (ör. Midas → Binance) gönderilen ve hedefe ulaşan ayrı yazılır; masraf portföyden düşer ([ayrıntı](#/kilavuz/portfoyum)).

**Sunucu**
- **Bekçi görevi** (isteğe bağlı, [kurulum adım 24](#/kilavuz/kurulum/adim-24)): Pusula kendiliğinden kapanırsa 10 dakika içinde yeniden açar; "Pusula'yı durdur" ile bilerek durdurduysanız açmaz.
- Güncelleme gece penceresi saat diliminden bağımsız; güncelleyici GitHub girişi isterse beklemeden hata verir; Node.js çok eskiyse Pusula açık bir mesajla kapanır.

## 62.0 — İşletim: güvenli durdurma, çökme döngüsü, hata uyarıları (2026-10-13) {#s62-0}

**Sunucu** (başlatma dosyaları ve sunucu → sunucuda **onayla** kurulur; `start-bot.cmd` / `pusula-sunucu.ps1` çalışırken değiştirilemediği için kurulumdan sonra bir kez **Pusula'yı durdur** → **Pusula**)
- **Pusula'yı durdur** artık bot bir işin ortasındaysa (günlük çalışma, emir) **2 dakikaya kadar bekler**; eskiden 15 saniye sonra zorla kapatıyordu.
- **Pusula açılamıyorsa** (bozuk ayar, port dolu…) eskiden her 10 saniyede sonsuza dek deniyordu; artık 10 · 30 · 60 · 300 saniye arayla dener ve 5. denemede Telegram'a haber verir.
- **Hata uyarıları:** portföy tasarımcısı (Bu ay emir listesi, kâğıt hesaplar) üst üste 3 kez çalışamazsa ve gece veri güncellemesi günde 3 kez başarısız olursa Telegram uyarır.
- Açılıştaki veri indirmesi botun karar saatine (03:00 civarı) denk gelirse karar bitene kadar ertelenir. Telefondan acil PIN yanlış deneme sayacı yeniden başlatmada sıfırlanmaz.
- **Kurulum adım 24:** gerçek paradan önce uyku / hazırda bekleme kapatma, Windows güncelleme saatleri, Tailscale gözetimsiz kip, klasör izinleri ([ayrıntı](#/kilavuz/kurulum/adim-24)). Telefondan **Uyguladım** yapılamadığı kılavuza yazıldı.

## 61.9 — Gerçek para yolu (kapalı kapının arkasında) (2026-10-13) {#s61-9}

**Botlar** ([ayrıntı](#/kilavuz/botlar/gercek-para))
- Hücum için **gerçek para modu** yazıldı (Binance gerçek hesap, BTC ayağı spot BTC vadeli teminat). Mod listesinde **ancak bütün şartlar sağlanınca** görünür: tarih ≥ 5 Ocak 2027, sunucuda `npm run canli-kapilar` ile G1–G9 yazılı onayı ve sermaye üst sınırı (ilk en çok 1000 $), gerçek hesap anahtarı (para çekme kapalı, IP kısıtı açık), sağlık sinyali, tek bot. Şimdilik Eylemler menüsünde "Gerçek para: kapalı" ve eksik şartlar yazar.
- Geçiş **GERÇEK PARA** yazarak, emir onayı ayrıca **CANLI** yazarak; ikisi de Telegram alarmı. Telefondan yapılamaz (yalnız acil durdurma).
- **Hesap kesicisi:** başlangıçtan %30 kayıpta uyarı, **%40 kayıpta bot acil durdurulur** (karar Ö6). İleri test "DUR" derse de acil durdurulur.
- Kullanıcı onayıyla bağlandı (2026-10-13); ayrı bağımsız denetimden geçti (9 bulgu düzeltildi: kapı kapanınca çalışan bot durur, acil her durumda çalışır, gerçek paradan açık pozisyonla çıkılamaz).

## 61.8 — İşletim sağlamlığı: yedek, gecikmeli uyarı, yeniden bağlanma (2026-10-13) {#s61-8}

**Sunucu** (bot kodu ve sunucu → sunucuda **onayla** kurulur)
- **Otomatik yedek:** bot defteri, işlem geçmişi, ileri test, tarama, portföy kayıtları ve ayarlar her gün 05:30'da tarihli klasöre kopyalanır ve doğrulanır; 14 gün + 8 hafta saklanır. Bir kez hedef seçip görevi kurmanız gerekir ([Kurulum adım 20](#/kilavuz/kurulum/adim-20)).
- **Gidemeyen Telegram uyarısı kaybolmaz:** internet yokken düşen uyarı eskiden 6 saat susturuluyordu; artık bekletilir ve internet gelince "[gecikmeli, saat]" diye gönderilir.
- **Açılışta internet yoksa:** bot eskiden biri "Başlat" diyene kadar çalışmıyordu; artık 1-2-5-10-30 dakika arayla kendisi yeniden bağlanır, 15 dakika sürerse Telegram haber verir.
- **Ayar dosyası bozulursa:** elektrik kesintisinde yarım kalan `config.json` / `secrets.json` son iyi kopyadan açılır ve Telegram haber verir (eskiden sunucu hiç açılmıyor ya da anahtarlar sessizce kayboluyordu).
- **Güncelleme daha temkinli:** yeni sürüm açıldıktan sonra 8 dakika izlenir; çökerse ya da önceden bağlı bot bağlanamazsa eski sürüme döner. Botun karar saatinde (02:50–04:30) kurulum ve yeniden başlatma yapılmaz; Pusula kapanırken süren bot işini bekler.
- **Dış IP değişince** Telegram haber verir (gerçek parada Binance API IP kısıtı için). **Disk 10 GB'ın altına inince** günde bir uyarı. Sunucu sağlık sinyali saatte bir (healthchecks'te period 1 saat yapın). Olay günlüğü artık tarihli günlük dosyalarda 60 gün saklanır (`data\gunluk`).
- Port doluysa (ikinci Pusula) açık mesajla kapanır.

## 61.7 — Bot güvenliği, sunucudan okuma, vadeli grafik (2026-10-13) {#s61-7}

**Botlar › İşlemler**
- **Yalnız vadelide olan coinlerin grafiği:** bot 1000PEPE gibi spotta olmayan bir coinde işlem açınca grafik boş kalıyordu ("mum verisi alınamadı") — artık vadeli piyasanın mumlarıyla çizilir.

**Bu bilgisayar (geliştirme) ↔ sunucu** ([ayrıntı](#/kilavuz/kurulum/adim-23))
- Bot sunucuda çalıştığı için bu bilgisayardaki panel eski bir kopyayı gösteriyordu. **Sunucu bağlantısı** kurulunca bot, işlem, hesap işlemleri ve ileri test ekranları sunucudaki panelden **canlı ve yalnız okuma** ile gelir (Tailscale; veri kopyalanmaz, tutar dış servise gitmez). Sunucu kapalıysa son okunan gösterilir. Üstteki araştırma bandı kaynağı söyler.

**Hücum botu (demo ve ileride gerçek para)** — sunucuda **onayla** kurulur (bot kodu)
- **Demo ölçümünü bozan hata:** BTC farkı bir lot adımından küçükken "çalışmada hata" alarmı ve sağlık sinyalinde başarısız gidiyordu, ay başı dengesi her gün yeniden deneniyordu — artık "emir gerekmedi" sayılır.
- **Reddedilen emirler sessiz değil:** Donchian/DCA emri borsada ya da kapıda reddedilirse Telegram "çalışmada hata" alarmı ve sağlık sinyalinde başarısız; kapanış reddi ayrıca **KAPANIŞ REDDEDİLDİ** diye başlar. Asgari tutar altı küçük emirler hariç (onlar "Verilmeyen küçük emir" sayacında).
- **Aynı anda iki çalışma yok:** zamanlanmış çalışma sürerken "Şimdi çalıştır" ikinci kez BTC alıyordu — artık sıraya girer, panel "bir çalışma zaten sürüyor" der. Acil durdurma süren çalışmayı bekler, sonra kapatır.
- **Bozuk durum dosyası:** elektrik kesintisinde bozulan durum dosyası sessizce sıfırlanıyordu (risk kilidi ve engel siliniyordu) — artık son iyi kopyadan kurtarılır, bot **ENGEL**'e geçer ve alarm verir; borsayı inceleyip "Engeli kaldır" ile devam edersiniz. Dosyalar diske güvenli yazılır.
- **Acil durdurma** bağlantı sırasında mutabakat hata verse bile denenir.
- **Kaldıraç ve marj kipi:** her ay evrendeki her coinde çapraz marj ve ×20 kaldıraç ayarlanır ve doğrulanır; uymazsa alarm.
- **Saatlik bekçi:** 26 saattir başarılı çalışma yoksa ya da bir işlem 30 dakikadan uzun takılırsa Telegram alarmı (eskiden yalnız açılışta bakılıyordu).
- Gerçek para için: emir onayı yeniden başlatmada kaybolmaz (yalnız acil ve kesin hatada kalkar); risk azaltan emir onaysız da geçer.

## 61.6 — Canlı hazırlık denetimi düzeltmeleri (2026-10-13) {#s61-6}

**Portföy › Bu ay** ([ayrıntı](#/kilavuz/tasarimci))
- **Kesirli hisse yalnız ABD'de:** ayar açıkken BIST emirleri de kesirli çıkıyordu (Midas BIST'te kesirli almaz) — düzeltildi, BIST her zaman tam adet.
- **Komisyon listede:** her emrin tahmini komisyonu (ABD 1,5 $, BIST 0) nakit hesabına katılır, "Tahmini komisyon" satırı yazılır; **Uyguladım** formunda ücret alanı dolu gelir. Alışa sermayenin %0,5'i (açılış farkı tamponu) ve komisyon payı ayrılmaz — son emir Midas'ta parasızlıktan reddedilmez.
- **Küçük düzeltme yok:** listede kalan hissede fark sermayenin %2'sinden küçükse emir önerilmez (1,5 $ komisyon kazancı yerdi).
- **Sermaye başlangıç günü:** sermayeyi girdiğiniz gün o modelin başlangıcı; girilen tutar = o gün ayırdığınız para (eskiden 12 Ekim'den bu yana model getirisiyle çarpılıyordu).
- Eski ayın listesi yeni karar gelince **süresi geçti** (uygulanamaz); bölünme kaydı eksik hisse uygulanamaz; hesapta modelden fazla aynı hisse varsa uyarı; 837'de Binance bakiyesi 3 günden eskiyse uyarı; Nasdaq kararı verisi eksik hisse varken bir gün bekler.
- **Ana sayfa:** uygulama günü geçip emirler girilmediyse uyarı (3 gün sonra kırmızı); 837 Hücum payı bant dışına çıkınca uyarı.
- Emir saati: ABD açılışı 17:30 (14 Mart 2027'ye kadar), sonra 16:30. Kâğıt hesap Telegram özetinde tutar yok (yalnız yüzde).

**Ayarlar › Bu bilgisayar** ([ayrıntı](#/kilavuz/kurulum/adim-22))
- Otomatik güncelleme daha sıkı: yalnız panel, belge, tasarımcı/Portföyüm ve araştırma dosyaları onaysız kurulur; sunucu, güvenlik, güncelleyicinin kendisi ve bilinmeyen her yeni dosya **onay** ister. Sunucudaki ayar dosyasına dokunan güncellemenin gözden kaçabildiği bir hata düzeltildi.

## 61.5 — Midas gerçekleri: BIST komisyonsuz, ABD kesirli hisse (2026-10-13) {#s61-5}

- **BIST'te komisyon yok** (Midas): Hisse yapıları kâğıt hesabında BIST alım-satımları artık komisyonsuz (yalnız %0,05 kayma). ABD'de emir başına 1,5 $ sürüyor.
- **Kesirli ABD hissesi** (Midas veriyor): Portföy › Bu ay › Ayarlar › **"Kesirli hisse alınabiliyor"** işaretlenince Bu ay emir listesi ve kâğıt hesaplar (Nasdaq M10 ve %50 QQQ + %50 Hücum'un QQQ yarısı) kesirli adetle çalışır; pahalı hisseler de alınır, para nakitte beklemez. BIST her zaman tam adet. Bu ay ekranındaki açıklama ayara göre yazar.

## 61.4 — Hisse yapılarının kâğıt hesabı, telefondan güncelleme (2026-10-13) {#s61-4}

**Botlar › Hisse yapıları** ([ayrıntı](#/kilavuz/botlar/hisse-yapilari))
- **Nasdaq Momentum 10**, **BIST Momentum 10** ve **%50 QQQ + %50 Hücum** artık Hücum gibi kendi hesabıyla izlenir: Bu ay › Ayarlar'daki sermayeyle 12 Ekim'den başlar, modelin ay sonu kararlarını ertesi gün açılış fiyatından **tam adet** alıp satar (önce satış, sonra alış), **Midas komisyonu** (ABD: emir başına 1,5 $; BIST %0,10), temettü (stopajlı) ve bölünme işlenir.
- Kartta: özsermaye, başlangıçtan getiri, modele göre fark, nakit, komisyon · alım ▲ / satım ▼ işaretli grafik · elde tutulanlar (adet, maliyet, kâr/zarar) · **Neden bu hisseler?** (momentum sıralaması, giren/çıkan) · işlem geçmişi.
- Sermaye tam adete yetmiyorsa ("listedeki 10 hisseden 3'ü alınabildi") uyarı. Mevcut hissede özsermayenin %2'sinden küçük düzeltme yapılmaz (komisyon kazancı yerdi).
- Telefonda da görünür; "tutarları gizle" açıksa tutarlar gizlenir.

**Ayarlar › Bu bilgisayar** ([ayrıntı](#/kilavuz/kurulum/adim-22))
- **Telefondan güncelleme:** "Şimdi kontrol et" ve "Güncellemeyi kur" telefonda da çalışır — **acil PIN** + **GÜNCELLE** yazılarak (acil durdurmayla aynı PIN ve aynı yanlış deneme kilidi).

## 61.3 — Sunucu kendini günceller (2026-10-13) {#s61-3}

**Ayarlar › Bu bilgisayar** ([ayrıntı](#/kilavuz/kurulum/adim-22))
- Sunucu her gün **12:00**'de GitHub'daki yeni sürüme bakar (görev **PusulaGuncelle**, bir kez kurulur). **Panel ve araştırma** değişikliklerini kendisi kurar, Pusula ~30 sn yeniden başlar, Telegram "kuruldu" der.
- **Bot kodu** (canlı bot, risk, strateji, işlem motoru, borsa, Telegram uyarıları, paketler) değiştiyse **kurmaz**: Telegram haber verir; **Güncellemeyi kur** düğmesiyle siz kurarsınız. Ana sayfa Yapılacaklar'da da görünür.
- Yeni sürüm açılmazsa ya da sözdizimi hatası varsa **eski sürüme kendiliğinden döner**. Sunucudaki `config.json` ayarlarınıza ya da başlatma dosyalarına dokunan güncelleme, sunucuda gönderilmemiş liste kaydı varsa kurulmaz — "elle bakılmalı" der. Gece 02:00–05:00 arası güncelleme yapılmaz.
- Kartta çalışan sürüm, son kontrolün sonucu ve **Şimdi kontrol et**.

## 61.2 — Portföyüm: tek kutudan hisse ekleme (2026-10-12) {#s61-2}

**Portföy › Portföyüm** ([ayrıntı](#/kilavuz/portfoyum/hisse-ekle))
- Yeni **Hisse ekle** kutusu: sembolü (ya da şirket adını) yazıp **Bul** — ad, borsa, para birimi ve son fiyat Yahoo'dan gelir; BIST için `.IS` yazmak gerekmez. Hesabı seçin (ilk seferde kurum + hesap adı yazın), adet ve isterseniz ortalama alış fiyatı, **Ekle**. Kurum, hesap, varlık ve açılış kaydı arkada birlikte yazılır — ya hepsi ya hiçbiri.
- Hissenin para birimine uyan hesap kendiliğinden seçilir; aynı adlı kurum iki kez açılmaz; aynı hisse aynı hesaba iki kez eklenmez.
- **Varlıklarım** artık **hesaplara göre** gruplu: her hesabın başlığında kurum ve toplam değer, altında hisseleri. Satırda **Düzenle** (adet / alış fiyatı satır içinde; eski kayıt ters kayıtla iptal, yenisi yazılır) ve **Kaldır** (onaylı iptal).
- Ekran sırası: özet → Hisse ekle → Varlıklarım → dağılım → grafik → hesaplar → defter. Ayrıntılı formlar katlı: **İşlem ekle** (alış, satış, temettü…) ve **Gelişmiş** (kurum, hesap, varlık ayarları, elle fiyat).
- Yahoo'nun peni cinsinden (GBp) fiyatladığı hisseler sterlin sanılmaz, eklenemez diye uyarılır.

## 61.1 — Panel denetimi düzeltmeleri, model ↔ gerçek farkı, tasarım kaydı (2026-10-11) {#s61-1}

**Portföy**
- **Bu ay** ([ayrıntı](#/kilavuz/tasarimci/bu-ay)): üstte her model için tek satırlık **durum özeti** ("yapılacak: 3 emir", "sermaye girin", "bu ay tamam"); karar ve emir listesi **tek kartta** (telefonda işi bitmiş kartlar katlı); **Ayarlar** katı (sermaye, kesirli hisse, en küçük işlem, telefonda gizleme, Portföyüm hedefi); sermaye girilmemişse kart içinde sermaye kutusu; "Sıradaki kararlar" yalnız Tasarımcı'da.
- Tam adet emir listesinde **en büyük kalan yuvarlaması**: kalan nakitle kesir payı en büyük hisselere birer adet daha (nakdi aşmadan); örnek portföyde nakitte kalan %17'den birkaç yüz dolara indi. Model portföy değişmez.
- **Uyguladım önizlemesi**: toplam alış · satış · ücret ve hesap başına nakit önce → sonra; nakit eksiye düşüyorsa onay düğmesi gri "Nakit eksiye düşse de yaz". Bir modelin bütün satırları aynı nedenle uygulanamıyorsa neden bir kez yazılır.
- **Model sermayesi**: üstel yazım (1e9) reddedilir; on katından büyük / onda birinden küçük değişim ve kutuyu boşaltmak onay sorar. Portföyüm hedefi önizlemesinde TL sermayenin kurla dolar karşılığı. Açılış rehberinde her adım bir düğme.
- **Model izleme** ([ayrıntı](#/kilavuz/model-portfoy)): ilk "Uyguladım"dan itibaren **Gerçek (Portföyüm)** çizgisi (para giriş-çıkışından arındırılmış, TWR); **uygulama farkı** (bu ay / başlangıçtan) ve "Fark neden oldu" (dolum fiyatı, tam adet nakdi, ücret, uygulanmayan/atlanan, kalan — toplamı farka eşit); **kol katkısı** (Carino bağlamalı); **aylık tablo**; **aylık dışa aktarım** listesi (SHA-256 zincir durumu, JSON/CSV indir). Karar günlüğü tablosu artık taşmıyor; kıyaslar ayrı sütunlarda ("başlamadı").
- **Tasarımcı** ([ayrıntı](#/kilavuz/tasarimci)): strateji birleşimi **kaydedilir** — taslak, izlemeye al (yürürlük = sonraki karar günü), yeni sürüm, durdur; kayıtlar silinmez, her değişiklik yeni sürüm. Kendi tasarımlarınız Model izleme'de "ölçülmemiş — kabul değil" etiketiyle izlenir; emir listesi açılmaz, deneme sayacına girmez, en çok 3. 837 şablonu artık izlenen modelle aynı kural (bant ±10 puan, her işlem günü); "Hücum serisi" seçici ve üç senaryo tablosu; motor uyarıları sade dilde; ağırlık toplamı 100 değilse kullanılacak paylar yazar.
- **Tek uygulama yeri Bu ay**: Laboratuvar › Uygulama planı "araştırma — gerçek emir değil" etiketli; Portföyüm hedefine içe alma yalnız Bu ay'dan ("Laboratuvar kararından içe al" kaldırıldı). Ekranların başında "Bu ekran: … Değil: …" satırı. Laboratuvar kurucusunda kıyaslar adıyla seçilir, ayarların yanında "?".
- Alt sekme adreste durur (`#/portfoy/model`, `#/portfoy/plan`): yenileme, geri tuşu ve paylaşılan bağlantı aynı sekmeyi açar; telefonda açık sekme görünür alana kayar; "?" Kılavuz açık alt sekmenin başlığına gider.
- **Portföyüm** ([ayrıntı](#/kilavuz/portfoyum)): **Aynı gün sırası** (isteğe bağlı, küçük önce) ve defterde sıra rozeti; Uyguladım kayıtları satış → aktarım → alış sırasıyla; açılışı sonradan girerseniz "bu günün Tasarımcı kayıtları açılışa dahil mi, sonra mı?" sorusu (çift sayım yok); CSV'ye aynı gün sırası / açılış / kaynak sütunları (eski dosyalar okunur); işlem süzgecinde Durum (etkin / iptal / hepsi) ve Tasarımcı paket özetleri; yüzdeler tek biçimde ("−%4,0").

**Araştırma, veri, kılavuz**
- Backtest, defter, coin tarama, veri ve gösterge havuzu düzeltmeleri (strateji ↔ zaman dilimi, parametre listesi, Türkçe sayı ve sebep, Hücum'da botun tamamı öne çıkar; defter ilk 50 satır; alan adı bayrağı yalnız token'dan önce alınmışsa; kaynak hatası balonu yalnız ilgili ekranda; Veri ekranında tek tarih biçimi ve sade kaynak tablosu; gösterge açıklamaları ve yeni [Gösterge havuzu](#/kilavuz/gosterge-havuzu) bölümü).
- **"?" açıklaması** terimin yanında küçük bir balonda açılır (aynı "?", Esc ya da dışarı tıklamak kapatır); [sözlüğe](#/kilavuz/sozluk) 105 yeni terim.
**Botlar, Hesaplar, Ayarlar, İleri test, Arşiv, telefon (panel denetimi A)**
- **Araştırma kopyasında ayar kaydı kapalı** ([ayrıntı](#/kilavuz/ayarlar/uyarilar)): Telegram, piyasa verisi, izleme listesi, API anahtarları ve sağlık sinyali düğmeleri bu bilgisayarda kilitli; sunucu da reddeder. Bu bilgisayarda kapalı tutulan Telegram artık asla config.json'a "kapalı" diye yazılmaz (sunucudaki ayar korunur). Telefonda da aynı düğmeler kilitli.
- **Gerçek para yolu gizli** ([ayrıntı](#/kilavuz/hesaplar)): "CANLI bağlan" ve canlı anahtar alanları katlı **Gelişmiş — gerçek para** bölümünde ve pasif; sunucu, config.json'da bilinçli `canliIzin: true` yoksa canlı bağlantıyı reddeder. Elle emir bağlantısı kutusu Gelişmiş katına taşındı; satırlar sade adlı ("Emir üst sınırı", "Saat farkı (bilgisayar ↔ borsa)").
- **"Testnet" yerine "demo hesap"** (Hesaplar, Botlar, bot işlem geçmişi). Hesaplar'ın üst kutusu **Açık pozisyon K/Z (gerçekleşmemiş)** ve **Okunabilen hesap** (hangisi okunuyor yazar); her satırda aynı olan Tür/Durum sütunu gizlenir; telefonda işlem listesi son 30 gün ve ilk 5 kayıtla başlar ("Tümünü gör").
- **Botlar**: durmuş botta "BTC tutuluyor" ve kırmızı "26 saati geçti" yazılmaz (gri "… önce (bot durdu)"); süre gün/saat ("4 gün 10 saat önce"); son karar tarihle ("11 Ekim (bugün)") ve bu bilgisayarın saatine göre; araştırma kopyasında kartlarda "bu bilgisayardaki eski kayıt" notu ve Telegram satırı "bilinçli kapalı"; telefonda acil PIN tanımlı değilse "Acil durdur" baştan pasif ve nedeni yazılı; işlem miktarları ve grafik ekseni Türkçe sayı biçiminde.
- **İzleme listesi** ✖ artık onay soruyor ve daha büyük. **Kur çevirici**: "1.000" bin sayılır, eksi/sıfır reddedilir, Tab pencerede kalır, kaynak sade ("Yahoo Finance"), gram altın notu.
- **Ayarlar**: yeni **Bu bilgisayar** kartı (rol, acil PIN, telefon jetonu, Telegram komutları); Telegram token / chat id için "Nasıl alınır?"; **chat id maskeli** ("12••••89"; boş bırakılırsa değişmez); Piyasa verisi yalnız kâğıt test ve grafiği etkiler (Hücum/Denge hep Binance); Telegram komutları için yeniden başlatma gerekmez.
- **Telegram**: yeni salt okunur komutlar **/yapilacaklar** ve **/ileri**; cevaplarda iç terimler sade ("kendini durdurdu mu", "model alarmı").
- **İleri test**: her kartın başında tek cümle özet; **Hücum-S (1000 $) alarm eşiği** (90/182/365 g p99 %34,0 / %41,7 / %50,3); demo kabul protokolü başlamadıysa nedeni ve Botlar bağlantısı.
- **Arşiv**: Donchian botu salt okunur ("Botu başlat" yok); **Kalkan botu** salt okunur kartı; tarama düğmesi ikincil renk.
- **Telefon**: bantlar tek satır (dokununca açılır), telefonda araştırma bandı tekrar etmez; yeni sürüm kartı kısa; oturum süresi dolunca "yeniden giriş" bandı; ekran başlığındaki ikinci "? Kılavuz" çipi kaldırıldı (üst çubuktaki kalır).

**Denetim düzeltmeleri (bağımsız denetim, 2026-10-11)**
- **Gerçek para izni panelden açılamaz**: `canliIzin` ile canlı / Kalkan tavanları (`canli`, `kalkan`) ayar kaydında her zaman yok sayılır; yalnız `config.json` elle ([ayrıntı](#/kilavuz/ayarlar/uyarilar)).
- Araştırma kopyasındaki kapalı işlemler ve telefon izinleri adresin **büyük/küçük harfinden ve sondaki eğik çizgiden** bağımsız denetlenir (aynı işlem farklı yazımla kilidi aşamaz; telefondaki acil durdurma her yazımda PIN ister).
- **Eski Uyguladım kayıtları** (61.0) muhasebede 61.0'daki gibi sayılır — adet, maliyet ve uyarılar değişmez (karar Ö21). Açılışı sonradan girerken "dahil" cevabı yalnız o açılışın kalemine uygulanır; daha önce girilmiş açılışların bakiyesi değişmez ([ayrıntı](#/kilavuz/portfoyum)).
- Uyguladım önizlemesindeki nakit "sonra" emir listesiyle aynı yuvarlamayla (kuruş farkı yok); "satışı öne alın" ipucu yalnız o gün satış varsa. Sermaye onay sorusunda "30.000 $" biçimi.
- Model izleme dışa aktarımında ilk ay(lar) silinmişse "zincirin başı eksik"; kendi tasarımlarım kaydında baştan / aradan silinen satır yakalanır.
- Araştırma kopyasında ve telefonda kilitli bölümlerdeki **"?"** açıklamaları artık açılır.

## 61.0 — Bu ay: emir listesi ve "Uyguladım" (2026-10-11) {#s61-0}

- **Bu ay › Gerçek portföy emir listesi** ([ayrıntı](#/kilavuz/tasarimci/emirler)): Portföyüm'deki gerçek adetlerinizden bu ayın hedefine emir tablosu — hesap, sembol, yön (önce **sat**, sonra **al**), adet, tahmini fiyat (son kapanış), tutar, neden (listeden çıktı / girdi / ağırlığa dengeleme / ilk yerleşim). **Tam adet** (Midas'ta kesirli hisse varsayılmaz); kalan sapma ve nakit yetersizliği uyarısı; en küçük işlem eşiği.
- **Uyguladım** ([ayrıntı](#/kilavuz/tasarimci/uyguladim)): satırlar önceden dolu; adet, fiyat, ücret, tarih düzenlenir; **Önizle → Onayla** ile Portföyüm'e tek seferde al/sat kaydı (eksik hisse için varlık kaydı da). Kısmi uygulama, ikinci kez kaydetme reddi, **Geri al** (ters kayıt), **Bu ay atla** (nedenli).
- Hedef tabanı (Nasdaq / BIST M10) = sermaye × model endeksi ÷ 100; ay içinde hedef ilk uygulamada donar; kısmi dolumda kalan adet yeni satırla açık kalır; işlem tarihi uygulama günü ile bugün arasında; 837 ilk yerleşimi sermayeyle (Binance'teki eski para sayılmaz); Binance nakdi yetmeyen aktarım engellenir; aynı hesabı kullanan modellerin nakdi birlikte denetlenir; bayat fiyat uyarısı.
- **Model sermayesi** formu (yalnız bu bilgisayarda, git dışı) ve **Portföyüm hedefini güncelle** (sınıf ya da varlık düzeyi). Portföyüm boşsa açılış rehberi. Telefonda liste okunur, düğmeler gizli.
- **837 bant kuralı** (model sürüm 2, deneme 851): Hücum payı %40–%60 dışına çıkınca, QQQ işlem günü kapanışında tam 50/50; aylık dengeleme kalktı (ölçümde aktarım 105 → 13, Sharpe ve düşüş eşit). Bu ay, Tasarımcı ve katalog metinleri buna göre.

## 60.9 — Portföy tasarımcısı, Bu ay, Model izleme (2026-10-10) {#s60-9}

- **Portföy** alt sekmeleri yeniden düzenlendi: **Tasarımcı · Bu ay · Model izleme · Portföyüm · Laboratuvar ▸** ([Portföy](#/kilavuz/portfoy)). Ekran **Bu ay** ile açılır; Laboratuvar'ın beş sekmesi (Kurucu, Sonuç, Varyasyon, Karşılaştır, Uygulama planı) **Laboratuvar ▸** altında olduğu gibi duruyor.
- **Bu ay** ([ayrıntı](#/kilavuz/tasarimci/bu-ay)): üç model portföyün (837 %50 QQQ + %50 Hücum, Nasdaq Momentum 10, BIST Momentum 10) bu ayki kararları — karar ve uygulama günü, 10 hisselik listeler, eksik veri uyarıları, 837'nin 50/50 dengelemesi. Salt okunur; emir listesi F4 aşamasında.
- **Tasarımcı** ([ayrıntı](#/kilavuz/tasarimci)): strateji kataloğu (künye PLAN SONUÇ tablolarından birebir; kabul durumu, kırılganlık, "elle / otomatik — demo / uygulanamaz" rozetleri), karar takvimi, tasarım kurucu (şablonlar; şablon dışı "ölçülmemiş birleşim — simülasyon, kabul değil"), hedef dağılım halkası (kol / varlık) ve **risk özeti** (Laboratuvar motoru: birleşik eğri, düşüş, CAGR/MaxDD/Sharpe, korelasyon, stres dönemleri; dönem etiketi açık). Bu sürümde tasarım kaydedilmez.
- **Model izleme** ([ayrıntı](#/kilavuz/model-portfoy)): üç model + kıyaslar (QQQ, BTC, XU030, EW-BIST30) 100 tabanlı, başlangıçtan getiri, en büyük düşüş, dondurulmuş karar günlüğü, veri notları; 2026-10-12'den önce "başlıyor" boş durumu.
- **Ana sayfa › Portföy özeti** artık Portföyüm (toplam, ay getirisi, hedef bandı) ve model portföylerden gelir; yapılacaklarda "ay sonu liste hazır", "model verisi bayat", "kararda eksik veri".
- Her tasarımcı ekranında sabit uyarı: ileri dönem kısa, kabuller sonradan konmuş ölçütle (H1); 12–24 ay görmeden yorum yok. Sözlükte yeni terimler (kesitsel momentum, çekirdek-uydu, PIT, endeks, H1, bindirme).

## 60.8 — Portföyüm, kur çevirici, "?" kılavuz düğmesi (2026-10-09) {#s60-8}

- **Portföy › Portföyüm** ([Portföyüm](#/kilavuz/portfoyum)) — ilk alt sekme: gerçek portföyü ELLE kaydetme. Kurum, hesap (kapatılabilir, silinmez) ve varlık ekleme; **açılış bakiyesi** (tarih + adet + isteğe bağlı maliyet); alış, satış, temettü, faiz, para yatırma/çekme, transfer, bölünme, ücret. Açılıştan önceki tarihli işlemler açılışa dahil sayılır (çift sayım yok).
- Ana para birimi yok: maliyet ve K/Z varlığın kendi biriminde; toplam **USD ve TL**; gün / ay / yıl **zaman ağırlıklı getiri** ve en yüksekten düşüş; değer geçmişi grafiği; günlük anlık görüntü.
- Dağılım halkası (iç hedef, dış gerçek, sapma turuncu); **hedefi siz girersiniz** (sınıf ya da varlık, toplam %100), Laboratuvar kararından içe almak isteğe bağlı. Uygulama planında **Portföyüm'den doldur**.
- Kayıt silinmez: **İptal et** = ters kayıt. CSV dışa aktarım ve önizlemeli, hep-ya-hiç içe aktarım. **Tutarları gizle**. Telefondan yalnız görüntüleme.
- **Kur çevirici** ([Kur çevirici](#/kilavuz/kur-cevirici)): üst çubukta **Kur** — USD, TRY, EUR, GBP, gram altın, BTC; kaynak ve saatiyle (ücretsiz: Yahoo, Binance).
- Üst çubukta **?** Kılavuz düğmesi: her ekrandan o ekranın kılavuz bölümünü açar.

## 60.7 — Veri: dikkat listesi kaynakları (2026-10-09) {#s60-7}

- **Veri** ekranının altında yeni tablo **Dikkat listesi kaynakları** ([Veri](#/kilavuz/veri/dikkat-kaynaklari)): Coin Metrics, DefiLlama, GeckoTerminal, DexScreener, CoinGecko, Snapshot, Binance/Bybit/OKX, Tokenomist, GitHub, BGeometrics, Bitview, GoPlus, RugCheck, İş Yatırım, TCMB EVDS3 — son sınama (HTTP kodu, gecikme), son 30 gün başarı oranı, kota kullanımı ve ToS/lisans notu.
- **Bozulursa üretilemez** sütunu: kaynak düşerse hangi bayrak hiç üretilemez (örn. GoPlus → honeypot, sahip yetkisi; DexScreener → paralı tanıtım), hangisi başka kaynakla sürer.
- Envanter betiği `node scripts/dikkat-f0-envanter.js`: her uca bir istek, sonuç `data/dikkat/`. Anahtar gereken kaynaklar "anahtar gerekli" diye işaretlenir (hata sayılmaz). Ücretli hiçbir kaynak yok.
- **Dikkat listesi v1 ön kaydı** (`PLAN-DIKKAT-V1-ONKAYIT.md`, deneme 780–790) yazıldı ve deftere ACIK olarak girdi. Liste henüz üretilmiyor; bota/portföye bağlanmaz.

## 60.6 — Araştırma defteri (2026-10-09) {#s60-6}

- **Araştırma › Defter** ([Araştırma defteri](#/kilavuz/defter)): deneme sayacı artık `kayitlar/denemeler.jsonl` dosyasında. Her ön kayıtlı deneme (ya da ardışık deneme aralığı) bir numara, aile, hipotez, plan dosyası, commit, holdout, durum, sonuç ve hüküm tarihi taşır.
- Üstte sayaçlar (toplam deneme, RED / GÖLGE / KABUL / BOŞ / BELGESİZ — numara sayısıyla), **Hükmü yaklaşanlar** (kalan gün), **Aileler** (tıklayınca süzer), arama ve süzgeçler; satırı açınca tüm alanlar.
- Numara **çakışması** ve **boşluk** kodla denetlenir; hata varsa ekranın üstünde kırmızı bant. Komut satırı: `npm run defter`, `npm run defter:denetle`, `npm run defter:sonraki`.
- **Yeni kayıt** formu yalnız sunucuda (telefonda gizli; sunucu da reddeder). Panel kaydı düzeltmez/silmez, git çalıştırmaz.

## 60.5 — Telefon: izleme + acil durdurma (2026-10-09) {#s60-5}

- **Telefondan yalnız izleme ve acil durdurma.** Bu bilgisayardan gelmeyen her istek (Tailscale, `npm run telefon` köprüsü) "telefon" sayılır: her ekran görünür; bot başlatma/durdurma, ayar, emir, backtest kapalı (başlıkta **Telefon: izleme** rozeti ve açıklama bandı). Eski `--tam` (tam erişim) kaldırıldı.
- **Acil durdur** (Botlar, kırmızı): telefonda **acil PIN** ve **DURDUR** yazmayı ister. PIN yalnız sunucuda belirlenir: `npm run acil-pin`. 15 dakikada 5 yanlış PIN → kilit + Telegram uyarısı. Masaüstündeki acil fren değişmedi.
- **Dışarıdan güvenli erişim (ücretsiz):** Tailscale + `tailscale serve` ile `https://<makine>.<ağ>.ts.net`; giriş karekodu: `npm run telefon-jeton -- --adres https://…ts.net` ([Telefondan açmak](#/kilavuz/telefon)).
- **Uygulama olarak yükleme (PWA):** telefonda tarayıcı menüsünden "Ana ekrana ekle / Yükle". Sunucuya ulaşılamazsa üstte **"Sunucuya ulaşılamıyor — son görülen: …"** bandı; sayılar o andan kalmadır.
- Telegram komutları değişmedi (yalnız okuma; Telegram'dan acil durdurma yok).

## 60.4 — Panel içi kılavuz (2026-10-08) {#s60-4}

- **Kılavuz** ekranı: menüde (masaüstünde sol menünün en altında, telefonda **Diğer** içinde).
- Her ekranın başlığında **? Kılavuz** bağlantısı o ekranın bölümünü açar.
- Her ekran için: ne işe yarar, ne zaman kullanılır, adım adım görevler, alanların anlamı, uyarılar; tıklanacak yerleri **numaralı kutularla** gösteren ekran görüntüleri (masaüstü ve telefon).
- Arama, içindekiler, sık görevler, sık sorulanlar, sözlük ve **sunucuya kurulum** adımları (depoda `EVDE-GECIS-PUSULA.md` ile aynı).
- **Bu sürümde yeni** kartı (Ana sayfa).
- Ayarlar ekranına başlık eklendi.
- Kılavuz panelle birlikte güncel kalır: eksik bölüm, kaybolan seçici ya da bayat ekran görüntüsü testleri kırmızıya çevirir.

## 60.3 — Coin tarama ve liste kaydı (2026-10-08) {#s60-3}

- **Araştırma › Coin tarama**: izleme listesindeki coinler için günlük zincir üstü kayıt (borsa fiyatı, likidite, holder, ilk 10 payı, sözleşme yetkileri, paralı tanıtım, alan adı) ve kırmızı bayraklar.
- **Araştırma › Listeler**: arkadaşın listelerinin tarih damgalı, SHA-256 zincirli kaydı; düzeltme kaydı; değerlendirme (seçilen vs elenen, BTC, piyasa).
- **Araştırma › Tarama ayarları**: izleme listesi, kaynaklar, eşikler, Telegram, denetim kaydı.
- Panel açılınca otomatik tarama; uyarılar menü rozetinde ve Ana sayfa yapılacaklarında.

## 60.2 — Telefondan erişim (2026-10-08) {#s60-2}

- `npm run telefon`: karekodla telefondan açma; çalışan panele salt okunur köprü ya da araştırma sunucusu; giriş sayfası + 30 günlük oturum.
- Tablolarda sıralama (masaüstünde başlık, telefonda **Sırala** seçicisi).
- Tablette de tablolar karta döner; kelimeler ortasından bölünmez.

## 60.1 — Temizlik (2026-10-08) {#s60-1}

- Panel kodu parçalara ayrıldı (davranış aynı), ölü kod silindi. Boş bot listesi gerçek düğme adını söyler ("Kâğıt botları başlat").

## 60.0 — Mobil (2026-10-07) {#s60-0}

- Telefonda ferah görünüm: yazılar ≥ 15 px, dokunma hedefleri ≥ 44 px, alt gezinme çubuğu.
- Tablolar telefonda karta döner; tek tip ilerleme çubuğu ve hata kutusu ("Yeniden dene").

## Daha öncesi (59.6–59.9) {#oncesi}

- **59.9:** Araştırma (Stratejiler + Backtest alt sekmeleri, Kâğıt test), İleri test ekranı, Pine onarımı.
- **59.8:** Hesaplar: tek pozisyon ve tek emir/işlem tablosu.
- **59.7:** Ana sayfa (yapılacaklar, portföy özeti, bot sağlığı) ve bot kartları.
- **59.6:** Panelin adı **Pusula** oldu; yeni menü, adresle gezinme, araştırma modu.
