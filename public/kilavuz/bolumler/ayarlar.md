# Ayarlar {#ayarlar}

## Ne işe yarar {#ne-ise-yarar}

Panelin ayarları **altı alt sayfada**; yan menüde Ayarlar'ın altında durur ve adres alt sayfayı taşır (ör. `#/ayarlar/guncelleme`):

| Alt sayfa | Adres | İçinde ne var |
|---|---|---|
| **Botlar (özet)** | `#/ayarlar/botlar` | iki botun **salt okunur** özeti; her satırda **Yönet →** botun Yönetim görünümünü açar |
| **Bildirimler** | `#/ayarlar/bildirimler` | Telegram'ın bugünkü durumu, Telegram komutları, Telegram ayarları, Sağlık sinyali |
| **Bağlantılar** | `#/ayarlar/borsa` | demo hesap API anahtarı, canlı hesap (kilitli) |
| **Bu bilgisayar** | `#/ayarlar/bilgisayar` | bu kopyanın rolü, acil PIN, telefon jetonu |
| **Güncelleme** | `#/ayarlar/guncelleme` | otomatik güncellemenin durumu, onay bekleyen kurulum |
| **Yedek ve taşıma** | `#/ayarlar/yedek` | taşıma dosyası, araştırma eklentisi, USB yedeği şifresi, eski yedekten geri yükleme — [ayrıntı](#/kilavuz/yedek-tasima) |

Ayarlar menüden açılınca **Botlar (özet)** ile başlar. **Piyasa verisi** ve **İzleme listesi** botları etkilemediği için Araştırma'dadır: [Veri ve izleme listesi](#/kilavuz/izleme).

## Ne zaman kullanılır {#ne-zaman}

- İlk kurulumda (Bildirimler: Telegram ve sağlık sinyali; Bağlantılar: demo API anahtarı).
- İki botun hesap türünü ve hesap değerini tek bakışta görmek için (Botlar özeti).
- Bot kodu güncellemesi onay beklerken (Ana sayfada Sistem kartının sürüm ışığı sarı: "onay bekliyor").

Botun hesap türünü değiştirmek, para kaydı, şimdi çalıştır ve kontroller artık **Botlar › <bot> › Yönetim**'de ([ayrıntı](#/kilavuz/botlar/ayarlar)).

## Ekran {#ekran}

![Ayarlar › Botlar (özet)](ekran:ayarlar-1400)

## Botlar (özet) {#botlar}

Salt okunur tablo: **Bot · Durum · Hesap türü · Küçük hesap kipi · Hesap değeri** ve **Yönet →**. Burada hiçbir şey değişmez; hesap türü, canlı hesap emir onayı, para yatırdım / çektim, küçük hesap kipi, şimdi çalıştır ve kontroller (deneme, borsayla karşılaştır, acil freni dene) botun kendi sayfasında: [Botlar › Yönetim](#/kilavuz/botlar/ayarlar).

## Bağlantılar {#borsa}

Bir kez yapılan borsa işleri (eski adı Ayarlar › Borsa): **Demo hesap API anahtarı** ve katlı **Canlı hesap** bölümü. Ayrıntı: [Bot hesabı › Ayarlar › Bağlantılar](#/kilavuz/hesaplar/anahtar). İşlem dökümü (CSV) buradan [Portföy › İşlem defteri](#/kilavuz/islem-defterim)'ne (kaynak **Bot**) taşındı.

## Bu bilgisayar {#bu-bilgisayar}

**Bu bilgisayar** alt sayfası, salt okunur: bu kopyanın **rolü** (sunucu ya da araştırma kopyası), bu oturum (masaüstü / telefon), **acil PIN** tanımlı mı / kilitli mi ve **telefon jetonu** tanımlı mı (değeri gösterilmez). Telegram komut yoklamasının durumu Bildirimler'de yazar. Her satırda nasıl yapılacağını anlatan kılavuz bağlantısı var; PIN ve jeton sunucuda `npm run acil-pin` / `npm run telefon-jeton` ile tanımlanır.

## Güncelleme {#guncelleme}

![Ayarlar › Güncelleme](ekran:ayarlar-guncelleme-1400)

**Güncelleme** alt sayfası (onay beklerken Ana sayfadaki Sistem kartının sürüm ışığı ve iş satırı doğrudan bu sayfayı açar): çalışan sürüm ve son kontrolün sonucu — **Güncel ✓**, **kuruldu** (otomatik ya da onayınızla), **kurulmayı bekliyor** (bot kodu değişti), **elle bakılmalı**, **geri alındı**. Sunucu her gün 12:00'de GitHub'daki yeni sürüme bakar: panel değişikliklerini kendisi kurar, bot kodu değiştiyse burada **Güncellemeyi kur** düğmesi çıkar (onay penceresi; Pusula ~30 sn yeniden başlar, açılmazsa eski sürüme döner). **Şimdi kontrol et** 12:00'yi beklemeden denetletir. **Telefonda da** çalışır (61.4): acil PIN ve onay için **GÜNCELLE** sorulur (acil durdurmayla aynı PIN, aynı yanlış deneme kilidi). Araştırma kopyasında düğme yoktur. Kurulum ve ayrıntı: [Otomatik güncelleme](#/kilavuz/kurulum/adim-22).

### Güncellemeyi adım adım izlemek {#guncelleme-izleme}

![Güncelleme sürerken: adımlar ve canlı günlük](ekran:ayarlar-guncelleme-izleme-1400)

**Şimdi kontrol et** ya da **Güncellemeyi kur**'a bastığınızda (ya da 12:00 görevi çalışırken sayfayı açtığınızda) kartın altında işlem baştan sona görünür:

- **Adımlar:** GitHub bağlantısı → değişikliklerin incelenmesi → yeni kodun indirilmesi → paketler → sözdizimi denetimi → **kuru deneme** (aşağıda) → Pusula'nın yeniden başlatılması → yeni sürümün açılışı → **kararlılık gözlemi** (8 dk boyunca 15 sn'de bir sağlık kontrolü; "12/32 kontrol · kalan ~5 dk" gibi). ✓ bitti, ◐ sürüyor, – atlandı (ör. paket değişikliği yok), ✗ hata; işlem bir adıma varmadan bittiyse (yeni sürüm yok, onay bekleniyor) kalan adımlar soluk görünür.
- **Çubuk ve süre:** ne kadarının bittiği, ne zaman başladığı, kaç dakikadır sürdüğü.
- **Günlük:** güncelleyicinin yazdığı her satır, saatiyle. Pusula yeniden başlarken panel birkaç saniye yanıt vermez — günlükte *"Panel yanıt vermiyor — bekleniyor…"* ve geri gelince *"Panel yeniden yanıt veriyor"* yazar; bu beklenen bir durumdur.
- **Bitince:** başlık sonucu söyler (**Kuruldu ✓**, **Güncel ✓**, **onayınız bekleniyor**, **eski sürüme dönüldü** …). Yeni sürüm kurulduysa sayfa 5 sn içinde kendiliğinden yeni panelle yenilenir. Son işlemin adımları ve günlüğü bir sonraki işleme kadar burada kalır.
- **Yarıda kaldı:** güncelleyici işlem bitmeden kapandıysa (ör. bilgisayar kapandı) bu yazar; **Şimdi kontrol et** ile yeniden başlatın.

İşlem sürerken düğmeler kapalıdır (aynı anda ikinci güncelleme başlamaz).

### Kuru deneme (bot kodu değişince) {#kuru-deneme}

Bot kodunu değiştiren bir güncelleme kurulmadan önce Pusula botların **bugünkü kararını** eski ve yeni kodla, **emir göndermeden** hesaplayıp karşılaştırır (1–3 dakika). Pusula bu sırada eski sürümle çalışmaya devam eder.

- **Kâğıt hesaptaki bot (Denge):** botun kayıtlarının kopyası ve borsanın açık piyasa verisiyle tam karar: trend rejimi, BTC hedefi ve yönü, kol evreni, risk kademesi, mutabakat.
- **Demo hesaptaki bot (Hücum):** demo hesaba bağlanılmaz (demo kabul); yalnız yeni kodun botun kayıtlarını sorunsuz açtığı denetlenir.
- **Karar aynı** → kurulum sürer.
- **Yeni kod hata verdi** → **kurulmaz**; kod eski sürüme döndürülür, Pusula yeniden başlamaz, Telegram'a haber gider.
- **Karar farklı** → **kurulmaz**; Durum satırı farkı ve kutu eski → yeni değerleri gösterir. Fark bekleniyorsa (ör. bir hata düzeltmesi — 69.0'daki "fiyat yok" düzeltmesi böyle görünürdü) **Farkı gördüm, yine de kur**; beklenmiyorsa kurmayın ve geliştirme sohbetine haber verin.
- İki sürüm de aynı hatayı veriyorsa (yeni kodun getirdiği değil) ya da deneme yapılamazsa (internet yok) kurulum uyarıyla sürer.

## Bildirimler {#bildirimler}

**Telegram** ve **Sağlık sinyali** aynı sayfada, alt alta. En üstte iki durum satırı: Telegram bağlı mı (günlük özet, işlem ve alarm bildirimleri gidiyor mu; araştırma kopyasında "bilinçli olarak kapalı") ve **Telegram komutları** yoklaması çalışıyor mu.

## Adım adım: Telegram bildirimlerini kurmak {#telegram}

![Telegram bildirimleri (token ve chat id görüntüde gizli)](ekran:ayarlar-telegram-1400)

1. Telegram'da **@BotFather** → `/newbot` → ad verin → size bir **token** verir.
2. Kendi botunuza Telegram'dan **/start** yazın (bot size ancak böyle yazabilir).
3. Chat id'nizi öğrenin: **@userinfobot**'a bir mesaj atın → `Id` satırı.
4. Bu ekranda **Bot token** ve **Chat ID** girin (alanların altında "Nasıl alınır?" bağlantısı bu bölüme getirir), **Etkinleştir** kutusunu işaretleyin → **Ayarları kaydet**. Hangi bildirimlerin gideceğini [Sistem › Bildirimler](#/kilavuz/bildirimler)'de seçin.
5. **Test mesajı gönder** → telefona "Pusula Test Bildirimi" gelmeli.

Kayıtlı chat id panelde **maskeli** görünür (ör. `12••••89`); alanı boş bırakırsanız kayıtlı değer değişmez. Komutlar bildirimler etkinken çalışır; etkinleştirince kendiliğinden başlar — sunucuyu yeniden başlatmak gerekmez.

Gelen mesajlar: günlük özet, işlemler, hata / uyuşmazlık / durdurma, "incele" bandı, kaçırılan günler, 26 saat çalışmama, ileri test "DUR" — türlerin listesi, aç/kapat ve son gönderilenler [Sistem › Bildirimler](#/kilavuz/bildirimler)'de. Telegram komutları **yalnız okur**: `/durum` `/pozisyonlar` `/ozet` `/saglik` `/yapilacaklar` (bot tarafındaki yapılacaklar; kişisel portföy tutarı gitmez) `/ileri` (ileri test durumu ve hüküm tarihleri) `/yardim` — emir veren ya da botu başlatan komut bilinçli olarak yoktur.

> **Uyarı:** Telegram'ı yalnız sunucuda açın. Aynı token'ı iki bilgisayar dinlerse komutlar çakışır (araştırma modunda Telegram zaten kapalıdır).

## Adım adım: sağlık sinyali (healthchecks.io) {#saglik}

![Sağlık sinyali (adresler görüntüde gizli)](ekran:ayarlar-saglik-1400)

1. healthchecks.io'da ücretsiz hesap açın ve kontrolleri oluşturun: **"Pusula Hücum"** (Period 1 gün, Grace 3 saat), **"Pusula Denge"** (aynı ayar — Denge çalışıyorsa) ve **"Pusula sunucu"** (Period 1 saat, Grace 1 saat). Ücretsiz plan bunlara yeter.
2. Ping adreslerini **Hücum ping URL'si**, **Denge ping URL'si** ve **Sunucu kalp atışı URL'si** alanlarına yazın, kaydedin, **Test sinyali gönder**. Test her adresi ayrı dener ve satır satır yazar (Hücum · Denge · Sunucu kalp atışı).
3. healthchecks.io'da kontrollerin hepsi "up" olmalı. Bir bot günlük çalışmasını yapmazsa ya da bilgisayar kapanırsa healthchecks size haber verir — Telegram'ın yetişemediği durumlar için "ölü adam anahtarı".

Formun altındaki durum satırı her botu ayrı gösterir: adres kayıtlı mı ve **son ping** ne zaman gitti (gönderildi / GÖNDERİLEMEDİ), ayrıca sunucu kalp atışı.

**Her bot kendi check'ine (68.8):** 68.8'e kadar Hücum ve Denge **aynı** adrese sinyal gönderiyordu; biri durduğunda öbürünün başarılı sinyali check'i "up" tuttuğu için durma fark edilmiyordu. Artık Hücum eski alanı (**Hücum ping URL'si**) kullanır, Denge **kendi** adresini. **Denge'nin adresi boşsa Denge hiç sinyal göndermez** — Hücum'un check'ine de göndermez; yani Denge'yi izlemek için healthchecks.io'da **ikinci bir ücretsiz check** açıp adresini girmeniz gerekir. Aynı adres iki alana yazılamaz (panel ve sunucu reddeder): her bot ve sunucu kalp atışı ayrı check olmalı — sunucu açık ama bir bot durmuşsa yalnız o botun kontrolü düşer.

## Uyarılar ve ne yapmalı {#uyarilar}

- Bot token ve healthchecks adresleri (Denge'ninki dahil) **sırdır**: `data/secrets.json`'a yazılır, panelde gösterilmez, `config.json` / `ayarlar.json`'a girmez.
- **Chat id** gizli bilgi sayılmaz: `config.json`'da durur, ama panelde **maskeli** gösterilir.
- **Canlı hesap izni** (`canliIzin`) ve canlı / Kalkan emir-sermaye tavanları (`canli`, `kalkan`) bu ekrandan ya da panelin herhangi bir kaydından **değiştirilemez**: sunucu bu alanları her kayıtta yok sayar. Yalnız sunucuda ayar dosyası elle düzenlenerek açılır: veri klasöründeki `ayarlar.json` (68.0 öncesinden kalan, henüz ayar kaydı yapılmamış kurulumda kökteki `config.json`); değişiklik Pusula yeniden başlayınca geçerli olur (bkz. [Bot hesabı](#/kilavuz/hesaplar/anahtar)).
- **Araştırma kopyasında** (bot sunucudayken bu bilgisayarda) bu ekrandaki **bütün kayıtlar kilitlidir** (Araştırma'daki piyasa verisi ve izleme listesi de): Telegram "Ayarları kaydet" ve test, sağlık sinyali kaydet/kaldır/test; sunucu da reddeder. Telegram bu bilgisayarda bilinçli kapalıdır ve bu kapalılık `config.json`'a asla yazılmaz — sunucudaki ayar korunur.
- Telefondan bu ekran yalnız okunur; kayıt düğmeleri kilitlidir.
