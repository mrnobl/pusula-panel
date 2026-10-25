# Ayarlar {#ayarlar}

## Ne işe yarar {#ne-ise-yarar}

Panelin ayarları **dokuz alt sayfada**; yan menüde Ayarlar'ın altında durur ve adres alt sayfayı taşır (ör. `#/ayarlar/guncelleme`):

| Alt sayfa | Adres | İçinde ne var |
|---|---|---|
| **Botlar (özet)** | `#/ayarlar/botlar` | iki botun **salt okunur** özeti; her satırda **Yönet →** botun Yönetim görünümünü açar |
| **Bildirimler** | `#/ayarlar/bildirimler` | Telegram'ın bugünkü durumu, Telegram komutları, Telegram ayarları, Sağlık sinyali |
| **Bağlantılar** | `#/ayarlar/borsa` | demo hesap API anahtarı, canlı hesap (kilitli) |
| **Anahtarlar** | `#/ayarlar/anahtarlar` | kayıtlı **bütün** anahtar ve jetonlar tek tabloda (maskeli), borsa hesabı ekle, sına, acil PIN'i değiştir — [ayrıntı](#/kilavuz/ayarlar/anahtarlar) |
| **Bu bilgisayar** | `#/ayarlar/bilgisayar` | bu kopyanın rolü, acil PIN, telefon jetonu |
| **Güncelleme** | `#/ayarlar/guncelleme` | otomatik güncellemenin durumu, onay bekleyen kurulum |
| **Yedek ve taşıma** | `#/ayarlar/yedek` | taşıma dosyası, araştırma eklentisi, USB yedeği şifresi, eski yedekten geri yükleme — [ayrıntı](#/kilavuz/yedek-tasima) |
| **Ayar geçmişi** | `#/ayarlar/gecmis` | her ayar değişikliği (ne zaman, hangi makine, nereden, eski → yeni) ve PIN'li **Geri al** — [ayrıntı](#/kilavuz/ayarlar/ayar-gecmisi) |
| **Makineler** | `#/ayarlar/makineler` | bu bilgisayarın makine kimliği, eşlenmiş Pusula makineleri (son görülme, sürüm, botlar, güncelleme, disk), PIN'li **eşleme** ve (75.3) Telegram'ı dinleyen **yönetici makine** — [ayrıntı](#/kilavuz/ayarlar/makineler) |

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

### Bot kayıtları (74.5) {#bot-kayitlari}

Özetin altındaki tablo her botun kaydını gösterir: **Bot · Kural · Hesap türü · Demo hesabı · Sermaye üst sınırı** ve işlem düğmesi. Buradan:

- **Yeni bot** kurulur (Kairos tipi ya da Tao tipi; her zaman kâğıt hesapta başlar, PIN istemez) — adım adım: [Yeni bot oluşturmak](#/kilavuz/botlar/yeni-bot).
- (74.6) **Model örneği** açılır: Nova, Lydia ya da Simurg'un ikinci kâğıt hesabı (aynı kararlar, ayrı sermaye; Lydia TL; başlangıç modelin ilk günü ya da yarın). Satırında yalnız **Kâğıt…** sermayesi, **Aç →** (kendi sayfası) ve **Arşivle…** vardır; demo hesabı ve demo sermayesi yoktur — [Model örnekleri](#/kilavuz/portfoy-botlari/model-ornegi).
- Yeni botun **demo hesabı** bağlanır (acil PIN; aynı hesabı aynı anda yalnız bir bot kullanır) — [Demo hesabına bağlamak](#/kilavuz/botlar/bot-hesap).
- **Sermaye üst sınırı** değişir (kâğıt: onay; demo artışı: acil PIN) — [Sermaye üst sınırı](#/kilavuz/botlar/bot-sermaye).
- Kâğıttaki durmuş yeni bot **arşivlenir** / arşivden **geri getirilir** (dosyalar silinmez) — [Arşivle ve geri getir](#/kilavuz/botlar/bot-arsiv).

Kairos ve Tao'nun hesapları sabittir (Binance demo / canlı anahtarı) ve arşivlenmezler. Telefonda ve araştırma kopyasında tablo salt okunur.

## Bağlantılar {#borsa}

Bir kez yapılan borsa işleri (eski adı Ayarlar › Borsa): **Demo hesap API anahtarı** ve katlı **Canlı hesap** bölümü. Ayrıntı: [Bot hesabı › Ayarlar › Bağlantılar](#/kilavuz/hesaplar/anahtar). İşlem dökümü (CSV) buradan [Portföy › İşlem defteri](#/kilavuz/islem-defterim)'ne (kaynak **Bot**) taşındı.

## Anahtarlar {#anahtarlar}

![Ayarlar › Anahtarlar (örnek değerlerle)](ekran:ayarlar-anahtarlar-1400)

**Anahtarlar** alt sayfası (73.0) panelin kayıtlı **bütün** gizli bilgilerini tek yerde gösterir. *API anahtarı*, bir programın sizin adınıza borsaya bağlanmasını sağlayan kullanıcı adı–şifre çiftidir (iki parça: **API anahtarı** ve **gizli anahtar / secret**; OKX'te üçüncü parça **parola / passphrase**). *Jeton* (token), bir servise girişte kullanılan uzun gizli metindir.

Beş grup:

| Grup | İçinde |
|---|---|
| **Borsa hesapları** | **Binance canlı (Kairos)** ve **Binance demo (Kairos)** — botların bugün kullandığı iki anahtar; sonradan eklediğiniz hesaplar (Binance, OKX, Bybit) |
| **İşlem defterim** | işlem geçmişini okumak için **yalnız okuma** izinli anahtarlar |
| **Yapay zekâ** (74.1) | **Gemini API anahtarı** — [Yapay zekâ notları](#/kilavuz/yapay-zeka-notlari) için Google AI Studio'nun **ücretsiz** anahtarı ([nasıl alınır](#/kilavuz/yapay-zeka-notlari/anahtar)); boşsa özellik "anahtar bekliyor". **Sına** Google'a yalnız model listesini sorar (kota harcamaz); günlük arka plan sınamasına girmez |
| **Bildirim** | Telegram bot jetonu, sağlık sinyali (healthchecks.io) adresleri, ikinci kanal |
| **Erişim** | acil PIN, panel ve telefon jetonu, sunucu bağlantısı, geliştirme yazma jetonu, yedek şifresi, GitHub jetonu |

Her satırda: **Ad** · **Kullanan** (hangi bot ya da özellik) · **Değer** (yalnız son 4 karakter, ör. `••••wxyz`; değerin tamamı **hiçbir zaman** gösterilmez, hiçbir yere yazılmaz) · **Makine** (sunucu mu, bu bilgisayar mı) · **Durum**:

- **Tamam** — kayıtlı ve bilinen bir sorun yok.
- **Bakılmalı** — kayıtlı ama bir şey eksik ya da son sınama başarısız; **kırmızı not**: anahtarda *para çekme izni* açık (borsada hemen kapatın).
- **Eksik** — gerekiyor ama yok (ör. Kairos demo hesapta ama demo anahtarı yok).
- **Boş** — girilmemiş ve şimdilik gerekmiyor.

### Değiştirmek, eklemek, silmek {#anahtar-degistir}

1. Satırda **Değiştir** → yeni değeri yazın → **Kaydet**. Borsa hesabı için grubun üstündeki **Hesap ekle**: ad, borsa (Binance / OKX / Bybit), tür (**demo** = sahte para, **canlı** = canlı hesap, borsadaki asıl paranız), isterseniz *alt hesap* adı (borsadaki ana hesabın altındaki ayrı hesap), API anahtarı, gizli anahtar, OKX'te parola.
2. Açılan pencerede **acil PIN**'i girin ve onaylayın. **Her** ekleme, değiştirme ve silme PIN ister — bu bilgisayarın masaüstü panelinde de. Yanlış PIN telefonla aynı sayaçtan düşer: 5 yanlışta **1 dakika** kilit.
3. Kaydedilen değer bir daha gösterilmez; satırda yalnız son 4 karakter kalır.

Botlar Faz 1'de **aynen** bugünkü iki anahtarı kullanır: "Binance canlı (Kairos)" / "Binance demo (Kairos)" satırında yaptığınız değişiklik, Bağlantılar sekmesindeki demo anahtarı formuyla **aynı yere** yazılır. Yeni eklenen hesaplar şimdilik hiçbir bota bağlı değildir (bot → hesap bağlantısı sonraki aşamada). İşlem defterim anahtarı da İşlem defterim ekranındakiyle aynı yoldan, aynı "yalnız okuma" denetimiyle kaydedilir.

Panelden **değişmeyenler** (yalnız durum + komut gösterilir): acil PIN'in kendisi (yalnız *değiştirme*, aşağıda), panel/telefon jetonu (`npm run telefon-jeton`), sunucu bağlantısı (`npm run sunucu-baglanti`), geliştirme yazma jetonu (`npm run gelistirme-jeton`), yedek şifresi (Yedek ve taşıma sekmesi), GitHub jetonu (`npm run github-jeton`). Bunları bilgisayar başında komutla değiştirmek, uzaktan ele geçirilmiş bir panelin kendi jetonunu koymasını engeller.

### Sına {#anahtar-sina}

**Sına** anahtarla borsaya **yalnız okuma** bağlantısı dener: bakiye okunur (kaç varlık, USDT toplamı) ve anahtarın izinleri sorulur (vadeli işlem, spot, **para çekme**, IP kısıtı). **Hiçbir emir gönderilmez, hiçbir şey değişmez.** Sonuç satıra "Son sınama …" olarak yazılır. Telegram için bot adı (getMe), sağlık sinyali için bir test sinyali gönderilir (Bildirimler'deki "Test sinyali gönder" ile aynı). Binance demo hesabında izin sorgusu yoktur (Binance desteklemiyor). 73.5'ten beri sunucu, kayıtlı borsa ve İşlem defterim anahtarlarını **her gün bir kez** aynı salt okuma sınamasından kendiliğinden geçirir; bağlanamayan ya da para çekme izni açık anahtar olursa [Anahtar sınaması başarısız](#/kilavuz/bildirimler/yeni) bildirimi gelir.

### Acil PIN'i değiştirmek {#pin-degistir}

**Erişim › Acil PIN › PIN'i değiştir**: şimdiki PIN + yeni PIN (iki kez, 6–12 rakam; 111111 / 123456 gibi tahmin edilebilir PIN kabul edilmez). Şimdiki PIN yanlışsa aynı deneme sayacından düşer.

> **Ortak PIN:** PIN bütün bilgisayarlarda aynıdır. Değiştirdiğinizde öbür bilgisayarlarda da aynı PIN'i girin (Faz 3'te kendiliğinden eşitlenecek). Geliştirme bilgisayarında değiştirince önce sunucuda, sonra o bilgisayarda değişir; biri başarısız olursa ekranda açıkça yazar ("PIN yalnız SUNUCUDA değişti …") — sessizce farklı kalmaz.
>
> **PIN'i unuttuysanız:** bilgisayar başında `npm run acil-pin` (eski PIN'i sormaz) ile yeni PIN belirleyin.

### Geliştirme bilgisayarında {#anahtar-gelistirme}

Bu bilgisayar araştırma kopyasıysa ekran **sunucudaki** anahtarları gösterir (yine yalnız son 4 karakter) ve değişiklik **sunucuya gönderilir**; PIN sunucuda doğrulanır. Altta **Bu bilgisayar** grubu bu bilgisayarın kendi kayıtlarını (sunucu bağlantısı, kendi acil PIN'i, kendi İşlem defterim anahtarı) gösterir. İşlem defterim anahtarları her bilgisayarın kendi panelinden kaydedilir.

**Sunucuya ulaşılamazsa** değişiklik bu bilgisayarda ayrı bir gizli dosyada bekler (PIN saklanmaz). Ekranda **"Sunucuya gönderilmeyi bekleyen N değişiklik"** bandı ve **Gönder** düğmesi çıkar — kendiliğinden gönderilmez; bağlantı gelince Gönder'e basın, PIN yeniden sorulur. Bekleyen bir değişiklikten **Vazgeç** ile vazgeçebilirsiniz. Sunucudaki değer siz yazdıktan **sonra** değiştiyse iki değer (yalnız son 4 karakterleri) yan yana gösterilir: **Benimki geçerli** ya da **Sunucudaki kalsın** seçip **Seçimlerle gönder**.

### Eski şifreli dosya {#eski-sifreli}

69.4–69.8 sürümleri sır dosyalarını Windows'un şifrelemesiyle saklıyordu; 70.0'dan beri bu şifreleme yok ve Pusula o eski dosyaları **açmaz** (açmaya çalışmak virüs koruması alarmı veriyordu). Böyle bir dosya kaldıysa sekmenin üstünde kırmızı bant çıkar: içindeki anahtarlar okunamıyor, değişiklik yapılamıyor. **Eski şifreli dosyayı kenara al** (PIN + onay) dosyayı **silmez**; aynı klasörde `secrets.json.eski-sifreli-<tarih>` adıyla kenara koyar. Sonra anahtarları bu ekrandan yeniden girin (telefon jetonu için `npm run telefon-jeton`).

Telefondan bu sekme **yalnız görüntülenir**; değişiklik düğmeleri yoktur, sunucu da reddeder.

## Ayar geçmişi {#ayar-gecmisi}

![Ayarlar › Ayar geçmişi (örnek kayıtlarla)](ekran:ayarlar-gecmis-1400)

**Ayar geçmişi** alt sayfası (74.2) panelin yazdığı **her ayar değişikliğini** listeler: Telegram ve kâğıt test risk ayarları, izleme listesi, bildirim türleri ve sessiz saat, model portföy ayarları (kesirli hisse, telefonda tutar gizleme …), anahtar eklendi / değişti / silindi bilgisi. Her satırda:

- **Zaman** ve **ayar** (okunur adı; altında teknik adı),
- **Eski → yeni** değer,
- **Kaynak**: *Panel* (bu bilgisayardaki panel), *Panel (geliştirme bilgisayarından)*, *Telegram* (ör. "1 saat sessize al"), *Araç*, *Sistem* (Pusula'nın kendisi); altında **makine** adı ve isteğin geldiği **uç**,
- **Geri al** düğmesi (uygunsa) ya da neden geri alınamadığı.

Üstteki süzgeçlerle **makine**, **tür** (Ayar · Bildirim · Model sermayesi · Anahtar) ve **tarih aralığı** seçilir.

**Sırlar kayda girmez.** API anahtarı, gizli anahtar, Telegram bot jetonu, sohbet kimliği, PIN, parola, sağlık sinyali adresi gibi değerler yerine **•••** yazılır (boşsa "(boş)"): yalnız *değişti* bilgisi kalır. Model sermayesi **tutarları** da yazılmaz. Bu satırlar geri alınamaz; değeri Ayarlar › Anahtarlar'dan yeniden girersiniz.

**Kayıt yalnız eklenir, silinmez.** Dosya veri klasöründe `ayar-gecmisi/kayit.jsonl`; 5 MB'ı ya da bir yılı geçince eski parça aynı klasörde ayrı bir dosyaya alınır (silinmez), ekran hepsini birlikte okur. Yedeğe ve taşıma dosyasına girer.

### Geri al {#ayar-geri-al}

1. Satırdaki **Geri al**'a basın. Pencerede "yeni → eski" yazar.
2. **Acil PIN**'i girin (telefondaki acil durdurmanın PIN'i; yanlış denemeler aynı sayaçta, 5 yanlışta 1 dk kilit).
3. Geri alma bir **güvenlik sınırını gevşetiyorsa** (ör. zarar sınırı büyüyor, günlük zarar sınırı ya da Telegram uyarıları kapanıyor, bir bildirim türü kapanıyor) düğme kırmızıdır ve ayrıca **GERİ AL** yazmanız istenir.
4. Değer, ayarı normalde kaydeden yolun **aynı denetimlerinden** geçer (ör. Telegram jeton biçimi, panel adresi, sessiz saat biçimi); geçmezse hiçbir şey değişmez ve nedeni yazar.
5. Geri alma da listeye **yeni bir satır** olarak eklenir ("geri alma" notuyla); geri alınan satırda "geri alındı" yazar.

Geri alınamayanlar: sırlar ve tutarlar; botun hesap türü, küçük sermaye seçimi, bot başlat/durdur gibi **kendi ekranında ek onayla** değişen ayarlar (o ekrandan geri çevirin); geçici sessiz (süreyle biter). Ayar o satırdan **sonra yeniden değiştiyse** geri alma reddedilir — önce sonraki değişikliği geri alın (sonraki değişiklik sessizce ezilmez).

Telefondan bu sekme **yalnız görüntülenir**. Araştırma kopyasında sunucunun ayar geçmişi de gelir ("sunucu" notlu satırlar); onlar sunucudaki panelden geri alınır.

## Makineler {#makineler}

![Ayarlar › Makineler (örnek makinelerle)](ekran:ayarlar-makineler-1400)

**Makineler** alt sayfası (75.2; 75.3'te yönetici makine; 75.5'te bot taşıma) Pusula'nın çalıştığı bilgisayarları bir arada gösterir. Tek bilgisayar kullanıyorsanız burada yapmanız gereken bir şey yok: eşlenmiş makine yokken Pusula **hiçbir yere istek göndermez**.

- **Bu bilgisayar:** adı, **makine kimliği** (`m-` ile başlayan 12 haneli kod; ilk açılışta bir kez üretilir, hiç değişmez — yeni bilgisayar yeni kimlik alır), rolü (**sunucu** ya da **geliştirme / araştırma bilgisayarı**), sürümü, Tailscale adresi, botları.
- **Eşlenmiş makineler** tablosu: her makinenin **durumu** (*Bağlı* · *Sessiz* — 15 dakikadan uzun ses yok · *Henüz görülmedi* · *Bu makineyi reddediyor* · *Sürüm uyumsuz*) ve son görülme zamanı, **sürümü** (bu bilgisayardan farklıysa yazar), **botları** (ad · hesap türü · çalışıyor / durmuş), **güncelleme** durumu ve **boş disk**. Satırdaki **Yönetici yap** (75.3, acil PIN) o makineyi Telegram'ı dinleyen makine yapar; **Kaldır** (acil PIN) o makinenin jetonunu siler. Yönetici makinenin satırında **Yönetici** rozeti, geçici dinleyen makinede **Komutları geçici dinliyor** rozeti görünür.
- **Şimdi yokla** eşlere hemen nabız yollar; kendiliğinden her **5 dakikada** bir yollanır. Sekmedeki ışık: yeşil hepsi bağlı, sarı sessiz makine var, kırmızı reddeden ya da sürümü uyumsuz makine var.

**Pano botlara dokunmaz.** Buradan eşleme, yönetici makine seçimi ve (75.5) **bot taşıma** yapılır. Eşlenmiş makine buradan yalnız **bot durumunu okuyabilir**, **nabız** gönderebilir ve sizin onu hedef seçtiğiniz bir taşımada **bot paketini teslim edebilir**: bot başlatamaz, durduramaz, emir veremez, ayar / anahtar değiştiremez, güncelleme kuramaz, yönetici seçemez, taşımayı kendisi başlatamaz, Portföyüm ve İşlem defterim'i okuyamaz.

- **Botu başka makineye taşı** kartı (yalnız eş varken): bu bilgisayardaki her bot için *taşınabilir mi* (değilse nedeni — canlı hesap, Kairos demo kabulü …), taşıma durumu (*taşınıyor*, *… makinesinde çalışır*, *… makinesinden geldi*, *son taşıma yapılamadı*) ve **hedef makine + Taşı** (onay penceresinde **TAŞI** yazılır, acil PIN). Sonucu belli olmayan taşımada **Yeniden denetle**. Ayrıntı ve adım adım: [Botu başka makineye taşımak](#/kilavuz/botlar/bot-tasima). Aynı bot iki makinede aynı anda çalışamaz: [nöbet kuralı](#/kilavuz/botlar/bot-nobet).

### Önce: Tailscale {#makine-tailscale}

Makineler birbirine yalnız **Tailscale** üzerinden bağlanır (ücretsiz; telefon için zaten kurulu olabilir — [Telefondan izleme](#/kilavuz/telefon)). Pusula Tailscale komutlarını **kendisi çalıştırmaz**; her bilgisayarda bir kez siz kurarsınız:

1. Tailscale'i kurun ve aynı hesapla oturum açın (iki bilgisayar aynı ağda görünmeli).
2. Her bilgisayarda Pusula'yı Tailscale'e açın — komut satırında bir kez: `tailscale serve --bg 3000`
3. Bilgisayarın adresini Tailscale yönetim sayfasından ya da `tailscale status` çıktısından alın: `https://<bilgisayar-adı>.<ağ-adı>.ts.net`

### İki makineyi eşlemek {#makine-esle}

1. **Kodu üretecek bilgisayarda** (örneğin sunucu) **Ayarlar › Makineler › 1. Bu bilgisayarda kod üret**: isterseniz bu bilgisayarın adresini yazın, **Kod üret**'e basın, acil PIN'i girin. Ekranda 8 grup × 4 rakamlık **eşleme kodu** çıkar; **10 dakika** geçerli ve **tek kullanımlıktır**.
2. **Öteki bilgisayarda** **2. Öteki bilgisayarın koduyla eşle**: birinci bilgisayarın **adresini**, **kodu** ve bu bilgisayarın **kendi adresini** yazın, **Eşle**'ye basın, acil PIN'i girin.
3. İki tarafın tablosunda da öteki makine görünür; birkaç saniye içinde durumu **Bağlı** olur. Her eşleme Telegram'a bir uyarı olarak da gider ("Makine eşlendi") — siz yapmadıysanız hemen **Kaldır**.

Kod yanlış girilirse eşleme olmaz; 5 yanlış denemede kod iptal edilir (yenisini üretin). Aynı makineyle yeniden eşlemek iki tarafın jetonlarını **yeniler** (jeton eskidiyse ya da bir taraf kaldırıldıysa bunu yapın).

### Yönetici makine: Telegram komutlarını kim dinler {#makine-yonetici}

Telegram komutlarını (`/durum`, `/menu`, `/teshis` …) aynı anda **yalnız bir makine** dinleyebilir: aynı Telegram botunu iki bilgisayar birlikte dinlerse Telegram birini keser (409 çakışması) ve komutlar yanıtsız kalabilir. Bu makineye **yönetici** denir. **Bildirimler** (işlem, uyarı, günlük özet) bundan etkilenmez — her makine kendi botları için göndermeye devam eder.

- **Seçmek:** Ayarlar › Makineler'de dinleyecek makinenin satırında (ya da "Bu bilgisayar" kartında) **Yönetici yap** → onay → acil PIN. Seçim öteki makinelere nabızla hemen iletilir; o an ulaşılamayan makine bir sonraki nabızda alır. İki ayrı bilgisayarda iki ayrı seçim yapılırsa **son yapılan** geçerli olur.
- **Kimler olabilir:** yalnız Telegram'ı kurulu olan **sunucu** makineleri. Geliştirme / araştırma bilgisayarı yönetici olamaz (orada Telegram zaten kapalıdır).
- **Seçim yapılmazsa:** dinleyebilen sunucular arasından biri kendiliğinden seçilir (kart "varsayılan" yazar). Tek sunucu + geliştirme bilgisayarı kullanıyorsanız yönetici zaten sunucudur; bir şey yapmanız gerekmez.
- **Kartta:** "Telegram komutları — yönetici makine" kartı yöneticiyi ve bu bilgisayarın durumunu yazar (*Yönetici — komutları bu bilgisayar dinliyor*, *Komutları yönetici makine dinliyor*, *Geçici devralma*, *Bekliyor — Telegram'ı başka bir makine dinliyor*).

**Yönetici kapanırsa — geçici devralma:** seçilen yönetici **30 dakika** boyunca nabız vermezse (kapalı, uykuda ya da bağlantısı kopuk) öbür sunucu komutları **geçici olarak** dinlemeye başlar ve Telegram'a yazar: *"Yönetici makine ulaşılamıyor — komutları geçici olarak bu makine dinliyor"*. Yönetici yeniden görüldüğünde geçici dinleyen makine **kendiliğinden bırakır** ve yine yazar: *"… geri geldi — Telegram komutlarını yine o dinliyor"*. Birden çok yedek sunucu varsa yalnız biri (sıradaki ilk) devralır.

**İki makine çalışıyor ama birbirini görmüyorsa** (ör. Tailscale bağlantısı koptu, internet var): yedek makine 30 dakika sonra devralmayı dener; yönetici de dinlediği için Telegram çakışma yanıtı verir. Geçici dinleyen makine bunu görünce **hemen geri çekilir**, Telegram'a bir kez yazar (*"Telegram'ı başka bir makine dinliyor — geçici devralma bırakıldı"*) ve en az 30 dakika (her denemede iki katı, en çok 4 saat) yeniden denemez. Böylece iki makine **sürekli birlikte dinlemez**; çakışma yalnız denemenin ilk birkaç saniyesindedir. Bağlantı gelince her şey kendiliğinden düzelir. Ne yapmalı: iki bilgisayarda Tailscale'in bağlı olduğuna bakın, Makineler'de **Şimdi yokla**.

**Sessiz makine uyarısı:** eşlenmiş bir **sunucu** 30 dakika nabız vermezse Telegram'a **tek uyarı** gider (*"Makine sessiz: …"*), yeniden görülünce **tek bilgi** (*"Makine yeniden görüldü: …"*). Geliştirme bilgisayarı için süre [Bildirimler](#/kilavuz/bildirimler)'deki **Makine sessiz** ayarındaki saattir (varsayılan 24 saat — dizüstü kapanınca uyarı gelmez). Uyarıyı yalnız o an Telegram'ı dinleyen makine yollar; sessiz olan yöneticiyse devralma mesajı uyarının yerine geçer. Bu tür Bildirimler'de **Makine sessiz** satırından kapatılabilir.

### Kademeli güncelleme {#makine-kademe}

Birden çok **sunucu** eşlenmişse yeni bir Pusula sürümü hepsine aynı anda kurulmaz: önce **bot çalıştırmayan** sunucu kurar ve **8 dakika** kararlı çalışır; ardından bot çalıştıran sunucular sırayla kurar. Bir sorun olursa önce botsuz makinede görülür, botların çalıştığı makine eski sürümde kalır.

- Sırası gelmeyen sunucuda [Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme) **"sırada bekliyor (kademeli güncelleme)"** der ve neyi beklediğini yazar (ör. *"Önce bot çalıştırmayan makine kurmalı ve 8 dk kararlı çalışmalı: YEDEK-PC (hedef sürüm kurulmadı)"*). Kod değişmez; sunucu **5 dakikada bir** yeniden bakar, sıra gelince kendiliğinden kurar.
- **Onaylı kurulumda** ("Güncellemeyi kur") onayınız korunur. Bot kodu değişen sürümde önce bot çalıştırmayan makinede de **Güncellemeyi kur** demeniz gerekir — orası kurmadan sıra gelmez.
- **Ulaşılamayan makine sırayı engellemez** (kapalı bir yedek yüzünden güncelleme takılmaz). Sıra 24 saatten uzun açılmazsa Telegram'a tek uyarı gider.
- Tek bilgisayarda ya da yalnız sunucu + geliştirme bilgisayarı varken **hiçbir şey değişmez**; geliştirme bilgisayarı sıraya girmez.

### Ne yapmalı {#makine-sorun}

| Görünen | Anlamı | Ne yapmalı |
|---|---|---|
| **Sessiz** | 15 dakikadan uzun süredir o makineden ses yok | Bilgisayar kapalı ya da uykuda olabilir; açıksa Tailscale bağlantısına ve Pusula'nın çalıştığına bakın |
| **Henüz görülmedi** | eşleme yapıldı ama hiç nabız alınmadı | **Şimdi yokla**; sürerse iki bilgisayarın adreslerini denetleyin |
| **Bu makineyi reddediyor** | o makine bu bilgisayarın jetonunu kabul etmiyor | Orada eşleme kaldırılmış ya da jeton yenilenmiş olabilir — iki makineyi **yeniden eşleyin** |
| **Sürüm uyumsuz** | iki makinenin sürümleri birbirini anlamıyor | İki makineyi de aynı sürüme güncelleyin (Ayarlar › Güncelleme) |
| sürüm satırında "yalnız okuma" | bir sürüm fark var | Görüntüleme çalışır; bot taşımak için iki makine aynı sürümde olmalı |
| Taşıma kartında **taşınıyor — sonuç belli değil** (sarı bant) | taşıma sırasında hedefe ulaşılamadı | Bot iki makinede de başlamaz; hedef açılınca **Yeniden denetle** |
| Telegram: **Bot açılışta başlamadı (nöbet denetimi)** | eşlenmiş sunuculara ulaşılamadı ya da bot başka makineye geçmiş | Eşlerin durumuna bakın; bot başka makinede çalışmıyorsa Botlar'dan elle **Başlat** — [nöbet](#/kilavuz/botlar/bot-nobet) |
| **Geçici devralma** (sarı bant) | yönetici 30 dakikadır görünmüyor; komutları bu bilgisayar dinliyor | Yönetici bilgisayarın açık olduğuna ve Tailscale'e bakın; geri gelince kendiliğinden düzelir |
| **Telegram'ı başka bir makine dinliyor (409)** | yönetici bu bilgisayardan görünmüyor ama çalışıyor | İki bilgisayarda Tailscale bağlantısına bakın, **Şimdi yokla** |
| Güncelleme **sırada bekliyor** | kademeli güncelleme: önce başka makine kurmalı | Bekleyin; bot kodu değiştiyse önce bot çalıştırmayan makinede **Güncellemeyi kur** |

Telefondan bu sekme **yalnız görüntülenir** (eşleme, kaldırma ve bot taşıma bilgisayardan). Makine jetonları veri klasöründe `makine-jetonlari.json` dosyasındadır (Anahtarlar gibi gizli; taşıma dosyasına şifreli girer), panelde hiç gösterilmez.

## Bu bilgisayar {#bu-bilgisayar}

**Bu bilgisayar** alt sayfası, salt okunur: bu kopyanın **rolü** (sunucu ya da araştırma kopyası), bu oturum (masaüstü / telefon), **acil PIN** tanımlı mı / kilitli mi ve **telefon jetonu** tanımlı mı (değeri gösterilmez). Telegram komut yoklamasının durumu Bildirimler'de yazar. Her satırda nasıl yapılacağını anlatan kılavuz bağlantısı var; PIN ve jeton sunucuda `npm run acil-pin` / `npm run telefon-jeton` ile tanımlanır.

## Güncelleme {#guncelleme}

![Ayarlar › Güncelleme](ekran:ayarlar-guncelleme-1400)

**Güncelleme** alt sayfası (onay beklerken Ana sayfadaki Sistem kartının sürüm ışığı ve iş satırı doğrudan bu sayfayı açar): çalışan sürüm ve son kontrolün sonucu — **Güncel ✓**, **kuruldu** (otomatik ya da onayınızla), **kurulmayı bekliyor** (bot kodu değişti), **elle bakılmalı**, **geri alındı**. Sunucu her gün 12:00'de GitHub'daki yeni sürüme bakar: panel değişikliklerini kendisi kurar, bot kodu değiştiyse burada **Güncellemeyi kur** düğmesi çıkar (onay penceresi; Pusula yeniden başlar — paket kurulumu varsa birkaç dakika sürer —, ardından 8 dk kararlılık gözlemi; açılmazsa eski sürüme döner). **Şimdi kontrol et** 12:00'yi beklemeden denetletir. **Telefonda da** çalışır (61.4): acil PIN ve onay için **GÜNCELLE** sorulur (acil durdurmayla aynı PIN, aynı yanlış deneme kilidi). Araştırma kopyasında düğme yoktur. Kurulum ve ayrıntı: [Otomatik güncelleme](#/kilavuz/kurulum/adim-22).

### Güncellemeyi adım adım izlemek {#guncelleme-izleme}

![Güncelleme sürerken: adımlar ve canlı günlük](ekran:ayarlar-guncelleme-izleme-1400)

**Şimdi kontrol et** ya da **Güncellemeyi kur**'a bastığınızda (ya da 12:00 görevi çalışırken sayfayı açtığınızda) kartın altında işlem baştan sona görünür:

- **Adımlar:** GitHub bağlantısı → değişikliklerin incelenmesi → (75.3, birden çok sunucu varsa) **kademeli güncelleme sırası** ([ayrıntı](#/kilavuz/ayarlar/makine-kademe)) → yeni kodun indirilmesi → paketler → sözdizimi denetimi → **kuru deneme** (aşağıda) → Pusula'nın yeniden başlatılması → yeni sürümün açılışı → **kararlılık gözlemi** (8 dk boyunca 15 sn'de bir sağlık kontrolü; "12/32 kontrol · kalan ~5 dk" gibi). ✓ bitti, ◐ sürüyor, – atlandı (ör. paket değişikliği yok), ✗ hata; işlem bir adıma varmadan bittiyse (yeni sürüm yok, onay bekleniyor) kalan adımlar soluk görünür.
- **Çubuk ve süre:** ne kadarının bittiği, ne zaman başladığı, kaç dakikadır sürdüğü.
- **Günlük:** güncelleyicinin yazdığı her satır, saatiyle. Pusula yeniden başlarken panel birkaç saniye yanıt vermez — günlükte *"Panel yanıt vermiyor — bekleniyor…"* ve geri gelince *"Panel yeniden yanıt veriyor"* yazar; bu beklenen bir durumdur.
- **Bitince:** başlık sonucu söyler (**Kuruldu ✓**, **Güncel ✓**, **onayınız bekleniyor**, **eski sürüme dönüldü** …). Yeni sürüm kurulduysa sayfa 5 sn içinde kendiliğinden yeni panelle yenilenir. Son işlemin adımları ve günlüğü bir sonraki işleme kadar burada kalır.
- **Yarıda kaldı:** güncelleyici işlem bitmeden kapandıysa (ör. bilgisayar kapandı) bu yazar; **Şimdi kontrol et** ile yeniden başlatın (73.6: düğme bu durumda da görünür). Güncelleyici paket kurulumu için Pusula'yı durdurduktan sonra kapanırsa, yanında açtığı **nöbetçi** bunu fark eder, Pusula'yı yeniden açar ve Telegram'a "güncelleme yarıda kaldı" yazar. Pusula yine de kapalıysa sunucuda masaüstündeki **Pusula** kısayoluna tıklayın.
- **Aynı sürüm iki kez geri alındıysa (73.6):** güncelleyici o sürümü her gün yeniden denemez; "elle bakılmalı — bu sürüm 2 kez kurulup geri alındı" der ve eski sürüm çalışmaya devam eder. **Güncellemeyi kur** ile siz yine kurabilirsiniz; yeni bir sürüm gelince otomatik deneme kendiliğinden sürer.
- **"Yeniden başlatma gerekli":** sarıysa eski Pusula çalışıyor, diskte yeni kod var — acil değil, uygun bir saatte **Yeniden başlat**. Kırmızıysa (*Pusula şu an KAPALI*) sunucuda Pusula kısayoluyla başlatın.
- **PowerShell yok (73.6):** güncelleyici Pusula'yı durdurmak ve yeniden başlatmak için Pusula'nın kendi uçlarını kullanır; Pusula kapalıysa yalnız `schtasks /run /tn PusulaBot` ile Görev Zamanlayıcı'ya başlatır. Arka planda PowerShell açılmaz.

İşlem sürerken düğmeler kapalıdır (aynı anda ikinci güncelleme başlamaz).

### Ne kendiliğinden kurulur (69.6) {#kendiliginden}

69.6'dan beri yalnız **belgeler ve görseller** (kılavuz metinleri, ekran görüntüleri, araştırma kayıtları) onaysız kurulur. Panel dahil **her kod değişikliği** **Güncellemeyi kur** onayı (ve PIN) ister: saldırı testi, "panel" sayılan dosyaların aslında sunucunun içinde çalıştığını gösterdi.

### Kod imzası {#kod-imzasi}

Sunucu yalnız sizin geliştirme bilgisayarınızda imzalanan kodu kurar; GitHub hesabı ele geçirilse bile imzasız kod sunucuya giremez. İmzasız ya da tanınmayan imzalı bir güncelleme gelirse **kurulmaz**, Telegram'a kritik uyarı gider, Sağlık kırmızıya döner.

1. **Geliştirme bilgisayarında** (bir kez): `npm run imza-kur` — imza anahtarı üretilir, geliştirme ve dağıtım depolarında imza açılır. Çıktıdaki `npm run imza-kur -- --sunucu "…"` satırını kopyalayın.
2. **Sunucuda** (bir kez): kopyaladığınız satırı çalıştırın, sonra `npm run imza-kur -- --sunucu-durum`. İzin dosyası kodun dışında (veri klasöründe) durur; gelen kod onu değiştiremez.
3. **GitHub'da** depo ayarlarında main dalı için **Require signed commits** kuralını açın.

Kurulmadan önce sunucu imzasız kodu da kurar; Sağlık bunu sarı gösterir. Not: GitHub web arayüzünde birleştirilen değişiklikler (ör. Dependabot) GitHub'ın imzasını taşır ve kurulmaz — birleştirme geliştirme bilgisayarında yapılır.

### Paketler (72.3) {#paketler}

Paket listesi (`package-lock.json` ya da `package.json`'daki bağımlılıklar) **gerçekten değiştiyse** güncelleyici önce Pusula'yı kendi durdurma yoluyla kapatır, eski paket klasörünü yedekler, paketleri kurar, sonra Pusula'yı başlatır; kurulum başarısız olursa yedeği geri koyup eski sürümü başlatır. `package.json`'da yalnız test satırları gibi betik satırları değiştiyse paket adımı **atlanır** ("paket değişikliği yok — yalnız betik satırları"). Yine de "Eski sürüm de açılmadı — elle bakın" görürseniz: [Güncelleme başarısız olursa](#/kilavuz/kurulum/guncelleme-kurtarma).

### Kuru deneme (bot kodu değişince) {#kuru-deneme}

Bot kodunu değiştiren bir güncelleme kurulmadan önce Pusula botların **bugünkü kararını** eski ve yeni kodla, **emir göndermeden** hesaplayıp karşılaştırır (1–3 dakika). Pusula bu sırada eski sürümle çalışmaya devam eder.

- **Kâğıt hesaptaki bot (Tao):** botun kayıtlarının kopyası ve borsanın açık piyasa verisiyle tam karar: trend rejimi, BTC hedefi ve yönü, kol evreni, risk kademesi, mutabakat.
- **Demo hesaptaki bot (Kairos):** demo hesaba bağlanılmaz (demo kabul); yalnız yeni kodun botun kayıtlarını sorunsuz açtığı denetlenir.
- **Karar aynı** → kurulum sürer.
- **Yeni kod hata verdi** → **kurulmaz**; kod eski sürüme döndürülür, Pusula yeniden başlamaz, Telegram'a haber gider.
- **Karar farklı** → **kurulmaz**; Durum satırı farkı ve kutu eski → yeni değerleri gösterir. Fark bekleniyorsa (ör. bir hata düzeltmesi — 69.0'daki "fiyat yok" düzeltmesi böyle görünürdü) **Farkı gördüm, yine de kur**; beklenmiyorsa kurmayın ve geliştirme sohbetine haber verin.
- İki sürüm de aynı hatayı veriyorsa (yeni kodun getirdiği değil) ya da deneme yapılamazsa (internet yok) kurulum uyarıyla sürer.
- **69.6:** kuru deneme imza denetiminden sonra ve **sırsız** çalışır: API anahtarları, Telegram jetonu görünmez; yalnız borsanın herkese açık verisine bağlanabilir, başka program başlatamaz.

## Bildirimler {#bildirimler}

**Telegram** ve **Sağlık sinyali** aynı sayfada, alt alta. En üstte iki durum satırı: Telegram bağlı mı (günlük özet, işlem ve alarm bildirimleri gidiyor mu; araştırma kopyasında "bilinçli olarak kapalı") ve **Telegram komutları** yoklaması çalışıyor mu. 73.6: yoklama hata veriyorsa satır kırmızı olur ve sebebi yazar — **409** = aynı Telegram botunu başka bir bilgisayar ya da program da yokluyor ([Sorun giderme › Telegram 409](#/kilavuz/sorun-giderme/telegram-409)), **401** = jeton geçersiz. Hangi bildirimin, hangi metinle ve kanalla (Telegram / ntfy) gideceği ve **sessiz saatler** [Sistem › Bildirimler](#/kilavuz/bildirimler)'de.

## Adım adım: Telegram bildirimlerini kurmak {#telegram}

![Telegram bildirimleri (token ve chat id görüntüde gizli)](ekran:ayarlar-telegram-1400)

1. Telegram'da **@BotFather** → `/newbot` → ad verin → size bir **token** verir.
2. Kendi botunuza Telegram'dan **/start** yazın (bot size ancak böyle yazabilir).
3. Chat id'nizi öğrenin: **@userinfobot**'a bir mesaj atın → `Id` satırı.
4. Bu ekranda **Bot token** ve **Chat ID** girin (alanların altında "Nasıl alınır?" bağlantısı bu bölüme getirir), **Etkinleştir** kutusunu işaretleyin → **Ayarları kaydet**. Hangi bildirimlerin gideceğini [Sistem › Bildirimler](#/kilavuz/bildirimler)'de seçin.
5. **Test mesajı gönder** → telefona "Pusula Test Bildirimi" gelmeli.

Kayıtlı chat id panelde **maskeli** görünür (ör. `12••••89`); alanı boş bırakırsanız kayıtlı değer değişmez. Komutlar bildirimler etkinken çalışır; etkinleştirince kendiliğinden başlar — sunucuyu yeniden başlatmak gerekmez.

Gelen mesajlar: günlük özet, işlemler, hata / uyuşmazlık / durdurma, "incele" bandı, kaçırılan günler, 26 saat çalışmama, ileri test "DUR" — türlerin listesi, aç/kapat ve son gönderilenler [Sistem › Bildirimler](#/kilavuz/bildirimler)'de. Telegram komutları **yalnız okur**: `/durum` `/pozisyonlar` `/ozet` `/saglik` `/teshis` (73.7: etkin sorunlar ve her biri için ilk iki adım — Sistem › Sorunlar ile aynı) `/yapilacaklar` (bot tarafındaki yapılacaklar; kişisel portföy tutarı gitmez) `/ileri` (ileri test durumu ve hüküm tarihleri) `/yardim` — emir veren ya da botu başlatan komut bilinçli olarak yoktur. 74.0: **/menu** düğmeli tek mesajlık menü açar (Botlar, Sorunlar, Portföy, İleri test, Piyasa, Bilanço, Güncelleme, Makineler, Bildirim ayarları) — bkz. [Telegram menüsü](#/kilavuz/telegram-menu). Telegram cevaplarında tutar (USD / TL) yoktur, yalnız yüzde. Komutların tam listesi formun altındaki notta ve Telegram'da "/" yazınca.

**Panel adresi (73.7, isteğe bağlı):** sunucunun Tailscale adresini (ör. `https://sunucu.agadi.ts.net`) girerseniz uyarı mesajlarının "Ne yapmalı" satırının sonundaki **Sorunlar** bağlantısı tıklanabilir olur (telefondan doğrudan [Sistem › Sorunlar](#/kilavuz/sorunlar) açılır). 74.0: aynı adres [Telegram menüsündeki](#/kilavuz/telegram-menu/yazma-yok) ↗ düğmelerinin (Panelde çöz, Panelde kur, Panelde aç) adresidir; boşsa bu düğmeler çıkmaz. Boşsa mesajda yalnız "Panel › Sorunlar" yazar. Sır değildir.

**Telegram'da tutarları gizle (74.1, varsayılan açık):** bildirim mesajlarındaki para tutarları ve işlem miktarları **•••** olarak gider; yüzde, kur, fiyat, saat, sembol görünür, kritik alarmların anlamı değişmez. Kutu değişince hemen kaydedilir ("Ayarları kaydet" gerekmez; geliştirme bilgisayarında sunucuya iletilir). Bilanço, piyasa olayları ve yapay zekâ notları kamuya açık bilgi olduğu için gizlenmez. Ayrıntı: [Bildirimler › Tutarlar](#/kilavuz/bildirimler/tutarlar).

> **Uyarı:** Telegram'ı yalnız sunucuda açın. Aynı token'ı iki bilgisayar dinlerse komutlar çakışır (araştırma modunda Telegram zaten kapalıdır).

## Adım adım: sağlık sinyali (healthchecks.io) {#saglik}

![Sağlık sinyali (adresler görüntüde gizli)](ekran:ayarlar-saglik-1400)

1. healthchecks.io'da ücretsiz hesap açın ve kontrolleri oluşturun: **"Pusula Kairos"** (Period 1 gün, Grace 3 saat), **"Pusula Tao"** (aynı ayar — Tao çalışıyorsa) ve **"Pusula sunucu"** (Period 1 saat, Grace 1 saat). Ücretsiz plan bunlara yeter.
2. Ping adreslerini **Kairos ping URL'si**, **Tao ping URL'si** ve **Sunucu kalp atışı URL'si** alanlarına yazın, kaydedin, **Test sinyali gönder**. Test her adresi ayrı dener ve satır satır yazar (Kairos · Tao · Sunucu kalp atışı).
3. healthchecks.io'da kontrollerin hepsi "up" olmalı. Bir bot günlük çalışmasını yapmazsa ya da bilgisayar kapanırsa healthchecks size haber verir — Telegram'ın yetişemediği durumlar için "ölü adam anahtarı".

Formun altındaki durum satırı her botu ayrı gösterir: adres kayıtlı mı ve **son ping** ne zaman gitti (gönderildi / GÖNDERİLEMEDİ), ayrıca sunucu kalp atışı.

**Her bot kendi check'ine (68.8):** 68.8'e kadar Kairos ve Tao **aynı** adrese sinyal gönderiyordu; biri durduğunda öbürünün başarılı sinyali check'i "up" tuttuğu için durma fark edilmiyordu. Artık Kairos eski alanı (**Kairos ping URL'si**) kullanır, Tao **kendi** adresini. **Tao'nun adresi boşsa Tao hiç sinyal göndermez** — Kairos'un check'ine de göndermez; yani Tao'yu izlemek için healthchecks.io'da **ikinci bir ücretsiz check** açıp adresini girmeniz gerekir. Aynı adres iki alana yazılamaz (panel ve sunucu reddeder): her bot ve sunucu kalp atışı ayrı check olmalı — sunucu açık ama bir bot durmuşsa yalnız o botun kontrolü düşer.

## Uyarılar ve ne yapmalı {#uyarilar}

- Bot token ve healthchecks adresleri (Tao'nunki dahil) **sırdır**: `data/secrets.json`'a yazılır, panelde gösterilmez, `config.json` / `ayarlar.json`'a girmez.
- **Chat id** gizli bilgi sayılmaz: `config.json`'da durur, ama panelde **maskeli** gösterilir.
- **Canlı hesap izni** (`canliIzin`) ve canlı / Kalkan emir-sermaye tavanları (`canli`, `kalkan`) bu ekrandan ya da panelin herhangi bir kaydından **değiştirilemez**: sunucu bu alanları her kayıtta yok sayar. Yalnız sunucuda ayar dosyası elle düzenlenerek açılır: veri klasöründeki `ayarlar.json` (68.0 öncesinden kalan, henüz ayar kaydı yapılmamış kurulumda kökteki `config.json`); değişiklik Pusula yeniden başlayınca geçerli olur (bkz. [Bot hesabı](#/kilavuz/hesaplar/anahtar)).
- **Araştırma kopyasında** (bot sunucudayken bu bilgisayarda) bu ekrandaki **bütün kayıtlar kilitlidir** (Araştırma'daki piyasa verisi ve izleme listesi de): Telegram "Ayarları kaydet" ve test, sağlık sinyali kaydet/kaldır/test; sunucu da reddeder. Telegram bu bilgisayarda bilinçli kapalıdır ve bu kapalılık `config.json`'a asla yazılmaz — sunucudaki ayar korunur.
- Telefondan bu ekran yalnız okunur; kayıt düğmeleri kilitlidir.
