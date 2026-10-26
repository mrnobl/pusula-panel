# Botlar {#botlar}

## Ne işe yarar {#ne-ise-yarar}

"Bot ne yapıyor, ne kadar kazandı?" sorusunun ekranı. **Botlar**'a tıklayınca önce **Botlar › Özet** açılır: bütün botlar kart ve karşılaştırma tablosu olarak ([aşağıda](#/kilavuz/botlar/ozet)). Bir bot yan menüden ya da özetteki kartından seçilir — **Botlar › Kairos** ya da **Botlar › Tao** — ve her botun dört görünümü vardır (adres görünümü taşır, ör. `#/botlar/hucum/hesap`):

| Görünüm | İçinde ne var |
|---|---|
| **Genel** | durum, kural, **Durdur / Başlat** ve **Acil fren**, sayılar, **günlük defter** (özet, kim kazandırdı, takvim, getiri eğrisi), paranın nerede durduğu, aylık getiri, künye |
| **Hesap** | botun borsadaki hesabı: bağlantı sağlığı, bakiye, pozisyonlar, emirler, geçmiş ([Bot hesabı](#/kilavuz/hesaplar)) ve **Binance bakiyesi** kartı |
| **İşlemler** | coin grafiği + açık pozisyonlar · bekleyen emirler · işlem geçmişi · dağılım geçmişi |
| **Yönetim** | hesap türü, para kaydı, küçük hesap kipi, şimdi çalıştır, kontroller ve (Kairos'ta) demo kabul süreci |

İki bot:

- **Kairos** — BTC trendi yükselişteyken BTC tutar (düşüşe dönünce nakde geçer); yanında 15 coinlik **coin sepeti**nde trend takibi ve kademeli alım (×3). Getiri öncelikli.
- **Tao** — Kairos'un sakin hâli: BTC oranı en çok %50 + aynı coin sepeti. Gün içi riski daha düşük.

Yan menüde Kairos ve Tao'nun altında **Portföy botları** ara başlığıyla üç bot daha durur: **Nova**, **Lydia**, **Simurg · %50 QQQ + %50 Kairos** — model portföylerin kâğıt hesapları, her biri kendi sayfasında ([Portföy botları](#/kilavuz/portfoy-botlari)). Bu sayfa Kairos ve Tao'yu anlatır.

Botlar günde bir kez, UTC gün kapanışından ~2 dakika sonra (Türkiye saatiyle 03:00 civarı) çalışır: önce kayıtlarını borsayla karşılaştırır, sonra yalnız **bugünkü hedefe** gider.

## Bot adları {#bot-adlari}

72.0'dan beri botların ekranda görünen adları kısa birer addır; adın yanında ya da altında botun ne yaptığını söyleyen bir alt yazı durur. Adın üstüne gelince anlamı görünür.

| Ad | Alt yazı | Anlamı | Eski adı |
|---|---|---|---|
| **Kairos** | BTC trendi + coin sepeti | "Doğru an"ın tanrısı — kırılımı geçerken yakalayan bot | Hücum (küçük hesap kipi: Hücum-S → **Kairos-S**) |
| **Tao** | yarı BTC + coin sepeti, sakin | "Yol" — inişle çıkışın dengesi | Denge |
| **Nova** | Nasdaq Momentum 10 | Gökte birden parlayan yeni yıldız — teknoloji | QQQ M10 / Nasdaq M10 |
| **Lydia** | BIST Momentum 10 | Dünyada ilk parayı basan Anadolu krallığı | BIST M10 |
| **Simurg** | %50 QQQ + %50 Kairos | İki diyarı birleştiren efsanevi kuş — iki piyasayı birleştiren bot | 837 · QQQ + Hücum (%50 QQQ + %50 Hücum) |

**Yalnız görünen ad değişti.** Botların kuralları, adresleri (`#/botlar/hucum`, `#/botlar/denge`, `#/botlar/m-qqq-m10`, `#/botlar/m-bist-m10`, `#/botlar/m-837`), kayıtları, kâğıt/demo hesapları ve geçmişi aynıdır. Araştırma kayıtlarında geçen deneme numaraları (ör. **deneme 837**) da aynı kalır; eski sürüm notlarında ve eski kayıtlarda botlar eski adlarıyla geçer.

## Bot kaydı (her bot için ayrı dosya) {#bot-kaydi}

74.4'ten beri her botun tanımı kendi dosyasında durur: sunucunun veri klasöründe `live/botlar/hucum.json` (Kairos) ve `live/botlar/denge.json` (Tao). Botlar sayfasındaki bot listesi ve sekmeler bu kayıtlardan gelir.

- **Kayıtta neler var:** botun iç adı, hangi kuralla çalıştığı (Kairos ya da Tao kuralı), modu (kâğıt / demo / canlı), her mod için sermaye üst sınırı, kâğıt başlangıç bakiyesi, coin sepeti büyüklüğü, küçük sermaye seçimi, BTC ayağı ve hangi borsa hesabına bağlı olduğu (Ayarlar › Anahtarlar'daki hesabın **adıyla**: "Binance demo", "Binance canlı").
- **Kayıtta sır yok:** API anahtarı ve sağlık ping adresi kayda yazılmaz; ikisi de eskisi gibi şifreli anahtar dosyasında durur.
- **İlk açılışta kendiliğinden:** Pusula 74.4 ilk açıldığında Kairos ve Tao'nun ayarlarını eski yerinden (ayar dosyası) okuyup kayda geçirir. Geçirmeden önce kayıttan üretilen ayarın eskisiyle **birebir aynı** olduğunu denetler; tutmazsa kayda geçirmez, botlar eski yoldan çalışmaya devam eder ve günlüğe uyarı yazılır.
- **Botlar aynı:** iç adlar, bot klasörleri (`hucum`, `hucum-demo`, `denge` …), demo hesabı, sağlık ping adresi, gölge karşılaştırması ve botların kararları değişmedi. Kairos'un demo kabulü (2026-12-09) aynen sürüyor.
- **Tek kaynak kayıttır (74.7):** mod, küçük sermaye, sermaye üst sınırı, kâğıt sıfırlamadaki BTC ayağı gibi değişiklikler **yalnız kayda** yazılır; botlar ayarı kayıttan okur. Eski ayar dosyasındaki bölüm artık elle yazılmaz, kayıttan **kendiliğinden kopyalanır** (geri dönüş kopyası) — eski bir sürüme dönülse de botlar aynı ayarla çalışır.
- **Kayıt ile ayar dosyası farklıysa:** açılışta **ayar dosyası kazanır** ve kayıt ona göre düzeltilir (ör. eski sürüme dönüp orada ayar değiştirdiyseniz ya da ayar dosyasını elle düzenlediyseniz); günlüğe uyarı, Ayar geçmişi'ne satır yazılır. Bir değişiklik yazılırken Pusula kapanırsa da son değişiklik kaybolmaz.
- Kayıt değişiklikleri [Ayarlar › Ayar geçmişi](#/kilavuz/ayarlar/ayar-gecmisi)'nde **Bot kaydı** türüyle görünür (geri alma botun kendi ekranından). Kayıtlar yedeğe ve taşıma dosyasına girer.
- 74.5'ten beri panelden **yeni bot** kurulabilir: [Yeni bot oluşturmak](#/kilavuz/botlar/yeni-bot). Sizin oluşturduğunuz botun tek kaynağı kendi kaydıdır (eski ayar dosyasına yazılmaz).

## Yeni bot oluşturmak (kâğıt hesapta başlar) {#yeni-bot}

Yer: **Ayarlar › Botlar › Bot kayıtları**. Yalnız sınanmış kurallarla bot kurulur; yeni strateji yoktur.

1. **Kural** seçin: **Kairos tipi** (BTC trendi + coin sepeti) ya da **Tao tipi** (yarı BTC, sakin). (74.6: listede ayrıca **Nova / Lydia / Simurg örneği** var — model portföyün ikinci kâğıt hesabı; ayrıntı [Model örnekleri](#/kilavuz/portfoy-botlari/model-ornegi).) Kairos tipinde **küçük sermaye kuralı** (Kairos-S) seçilebilir: otomatik (5000 $ altında açık), açık ya da kapalı.
2. **Kâğıt sermayesi** (USD) girin: botun kâğıt hesabı bu bakiyeyle açılır ve bot bu tutardan fazlasını kullanmaz.
3. **Kimlik** girin: küçük harf ve rakam, 2–16 karakter (ör. `ares`). İlk iki harf her botta farklı olmalı (borsa emir kimliği botun ilk iki harfini taşır; Kairos `hu…`, Tao `de…` olduğu için bu iki başlangıç kullanılamaz). Kimlik sonradan değişmez.
4. **Görünen ad** girin (ör. "Ares"): ekranda ve Telegram'da bu ad görünür. Başka bir botun adı (Kairos, Tao, Nova, Lydia, Simurg …) verilemez.
5. **Oluştur…** → onay. PIN istenmez: bot **kâğıt hesapta** ve **durmuş** olarak eklenir, gerçek emir vermez. Botlar sayfasında kendi sekmesi çıkar; **Başlat** ile çalışır.

- **Gölge kıyası:** yeni bot kendi kuralının modeliyle (Kairos tipi → Kairos modeli `hucum.C0`, Tao tipi → `denge.C0`) karşılaştırılır; bot kartında "kıyas: Kairos modeli" notu görünür. Kâğıt hesapta sapma botu **durdurmaz**, yalnız uyarı gönderir (sermaye ve küçük sermaye kuralı farkı sapmayı büyütebilir). Küçük sermaye kuralı açıksa Kairos-S gölgesi (deneme 972) bilgi olarak İleri test'te.
- **Canlı hesap 5. faza kadar yalnız Kairos ve Tao'da.** Yeni bot canlı moda geçemez ve canlı hesaba bağlanamaz; denerseniz ret yanıtı gelir ("5. faza kadar yalnız mevcut botlarda").

### Demo hesabına bağlamak {#bot-hesap}

Yeni bot demo hesapta çalışacaksa önce bir **Binance demo** hesabı bağlanır: Bot kayıtları tablosunda **Demo hesabı** seçicisi (Ayarlar › Anahtarlar'daki Binance demo hesapları) → **acil PIN**. Sonra Botlar › <bot> › Yönetim › Hesap türü: **demo** (masaüstünde de PIN ister).

- **Aynı borsa hesabını aynı anda yalnız bir bot kullanır** (kâğıt botlar hariç). Kairos demo hesabını (Binance demo) kullanırken o hesap başka bota bağlanamaz; her yeni bot için Binance'te ayrı bir demo hesabı / alt hesap açıp Anahtarlar'a ekleyin.
- Bu sürümde yalnız **Binance** hesapları bağlanır (OKX ve Bybit hazırlıkta — bkz. [OKX botu](#/kilavuz/botlar/okx-bot), [Bybit botu](#/kilavuz/botlar/bybit-bot)). Hesap türü moda uymalı (demo hesabı demo moda); hesabın borsası botun borsasıyla aynı olmalı (Binance botuna OKX ya da Bybit hesabı, OKX / Bybit botuna başka borsanın hesabı bağlanmaz).
- Bot demo modundayken hesap değişmez; önce kâğıda dönün. Bota bağlı bir hesap Anahtarlar'dan silinmez (önce bağı kaldırın).

### OKX botu (demo hazırlığı) {#okx-bot}

Yeni bot formunda **Borsa** seçimi vardır: **Binance** (varsayılan) ya da **OKX**. Kısayol olarak **Kural** listesinde **Kairos tipi — OKX (demo hazırlığı)** şablonu da var (borsası OKX'e sabit). Borsa bot kurulduktan sonra değişmez.

- **Kâğıtta başlar:** OKX botu kâğıt hesapta **OKX'in pazar kurallarıyla** (miktar adımı, en küçük emir) çalışır; gerçek emir yoktur.
- **Karar verisi Binance'ten:** mumlar ve coin seçimi Binance'in herkese açık verisinden gelir — Kairos'un gölgesiyle aynı veri, aynı kural. Fark yalnız uygulamayı (OKX'te işlem) ölçer.
- **Evren = Binance ∩ OKX:** ay başında Binance'in 15 coinlik evreni seçilir; bu coinlerden OKX'te işlem görmeyen olursa onun hedefi **0** olur (o pay nakitte kalır) ve günlükte "OKX'te yok" yazar. Botlar sayfasında OKX botunun kartında bu coinler ayrı bir satırda görünür: **OKX'te yok — nakitte** (son karardan; karar yoksa "ilk karardan sonra görünür"). Bunun için **Telegram'a bildirim gitmez** — beklenen bir durumdur, hata değildir. Evrenin yarısından çoğu OKX'te görünmüyorsa (liste eksik okunduysa) bot o gün emir vermeden durur.
- **Durum: "OKX demo: hazırlık — henüz bağlanamaz".** OKX demo hesabını Anahtarlar'a ekleyebilirsiniz (hesap türü demo, parola alanı zorunlu); ama bu sürümde bota bağlanamaz, OKX botu demo moduna geçemez. Bağlantı, OKX demo hesabında salt okuma ölçümü yapıldıktan sonra ayrı bir sürümle açılacak.
- **Canlı hesap yok:** OKX botu canlı hesap moduna geçemez; OKX canlı hesap yolu kapalıdır.
- **Güncellemede kuru deneme:** güncelleyici kâğıttaki OKX botunu da eski ve yeni kodla emir göndermeden dener (OKX pazar kuralları anahtarsız okunur; Binance botları eskisi gibi).

### Bybit botu (demo hazırlığı) {#bybit-bot}

OKX botunun eşi. Yeni bot formunda **Borsa** seçiminde **Bybit** de vardır; kısayol olarak **Kural** listesinde **Kairos tipi — Bybit (demo hazırlığı)** şablonu (borsası Bybit'e sabit). Borsa bot kurulduktan sonra değişmez.

- **Kâğıtta başlar:** Bybit botu kâğıt hesapta **Bybit'in pazar kurallarıyla** (miktar adımı, en küçük emir, piyasa emri üst sınırı) çalışır; gerçek emir yoktur. Bybit'in henüz işlem görmeyen (ön piyasa) sözleşmeleri sayılmaz.
- **Karar verisi Binance'ten, evren = Binance ∩ Bybit:** OKX botundaki gibi. Bybit'te işlem görmeyen evren coininin hedefi **0** olur (pay nakitte) ve günlükte "Bybit'te yok" yazar; Botlar kartında **Bybit'te yok — nakitte** satırı görünür. Telegram'a bildirim gitmez. Evrenin yarısından çoğu Bybit'te görünmüyorsa bot o gün emir vermeden durur.
- **Durum: "Bybit demo: hazırlık — henüz bağlanamaz".** Bybit demo hesabını Anahtarlar'a ekleyebilirsiniz (borsa Bybit, hesap türü demo; parola yok) ve salt okuma sınayabilirsiniz; ama bu sürümde bota bağlanamaz, Bybit botu demo moduna geçemez. Bağlantı, Bybit demo hesabında salt okuma ölçümü yapıldıktan sonra ayrı bir sürümle açılacak.
- **Bağlantı açıldığında aranacak hesap kipi:** Bybit **Birleşik İşlem Hesabı** (UTA), **çapraz marj** (Cross Margin; izole ya da portföy marjı değil), **tek yön** pozisyon kipi (One-Way). API anahtarında **para çekme izni kapalı**, "Read-Write" ve Contract › Orders + Positions izni açık olmalı. Bunlardan biri uymazsa bot bağlanmaz; Pusula kipi kendiliğinden değiştirmez.
- **Canlı hesap yok:** Bybit botu canlı hesap moduna geçemez; Bybit canlı hesap yolu kapalıdır.
- **Güncellemede kuru deneme:** güncelleyici kâğıttaki Bybit botunu da eski ve yeni kodla emir göndermeden dener; bu koşuda yalnız Binance'in ve Bybit'in herkese açık adreslerine (api.bybit.com, api-demo.bybit.com) izin vardır.

### Sermaye üst sınırı {#bot-sermaye}

Her botun her mod için sabit bir üst sınırı vardır (USD): bot bu tutardan fazlasını kullanmaz, hesapta daha az para varsa hesaptakini kullanır. Bot kayıtları tablosunda **Kâğıt…** / **Demo…** ile değişir; bot durmuş olmalı. Kâğıt sınırı onayla, demo sınırını **artırmak** acil PIN ile. Kairos'un demo sınırı demo kabulü bitene kadar (2026-12-09) değişmez; canlı hesap sınırı bu ekrandan değişmez.

### Arşivle ve geri getir {#bot-arsiv}

Kullanmadığınız yeni botu **Arşivle…** ile listelerden kaldırırsınız: yalnız **kâğıt** moddaki ve **durmuş** bot arşivlenir (model örnekleri her zaman kâğıttadır; arşivlenince hesaplanmaz). Kaydı ve kâğıt hesap dosyaları **silinmez**; "Arşivdeki botlar" altında **Geri getir…** ile kâğıtta, durmuş olarak geri gelir. Arşivdeki botun kimliği ve görünen adı başka bota verilmez. Kairos ve Tao arşivlenemez.

Yeni bot, hesap bağlama, sermaye ve arşiv değişiklikleri [Ayar geçmişi](#/kilavuz/ayarlar/ayar-gecmisi)'nde **Bot kaydı** türüyle görünür. Kullanıcının oluşturduğu bot kaydı kişisel veridir: yedeğe ve taşıma dosyasına girer; taşıma sonrası diğer botlar gibi ilk borsa karşılaştırmasına kadar kendiliğinden başlamaz.

## Botu başka makineye taşımak (75.5) {#bot-tasima}

İki **sunucu** eşlenmişse ([Ayarlar › Makineler](#/kilavuz/ayarlar/makineler)) bir botu birinden ötekine taşıyabilirsiniz — örneğin yeni bir bilgisayar aldınız ya da botu daha sağlam çalışan makineye almak istiyorsunuz. Taşıma **Ayarlar › Makineler › Botu başka makineye taşı** kartından, **yalnız botun şu an bulunduğu bilgisayarın panelinden** yapılır (telefondan ve başka makineden yapılamaz).

**Neler taşınabilir:** kâğıt ve demo moddaki botlar (Kairos tipi, Tao tipi, sizin oluşturduğunuz botlar). **Taşınamaz:** canlı hesap botu; **Kairos — demo kabulü 2026-12-09'a kadar** (demo kabul klasörü `hucum-demo` botla birlikte gideceği için Kairos bu tarihe kadar hiçbir modda taşınmaz); model örnekleri (Nova / Lydia / Simurg kâğıt hesabı). Taşınamayan botun satırında nedeni yazar.

**Adım adım:**

1. Botun bulunduğu bilgisayarda **Ayarlar › Makineler** → "Botu başka makineye taşı" kartında botun satırında **hedef makineyi** seçin → **Taşı**.
2. Açılan pencerede ne olacağı yazar; onaylamak için **TAŞI** yazın, sonra **acil PIN**'i girin.
3. Pusula önce hedefe sorar ("alabilir misin?"). Hedef reddederse (ör. orada aynı bot çalışıyor, aynı emir önekini kullanan başka bot var, demo hesabının orada başka anahtarı kayıtlı) **hiçbir şey değişmez**, bot çalışmaya devam eder.
4. Hedef kabul ederse bot bu bilgisayarda **durdurulur** — açık pozisyonlara, borsadaki emirlere ve felaket stoplarına **dokunulmaz** — ve verisi hedefe gönderilir. Demo botta bağlı demo hesabının anahtarı da gider: **yedek şifresiyle şifrelenmiş** olarak (iki bilgisayarda [yedek şifresi](#/kilavuz/yedek-tasima) **aynı** olmalı; hedefte şifre yoksa ya da farklıysa taşıma reddedilir). Kâğıt botta hiçbir sır gönderilmez; sağlık sinyali adresi hedefte yeniden girilir.
5. Hedef her dosyayı doğrular, eski kopyasını silmeden kenara alır (`onceki-bot-…` klasörü), botu yerleştirir. **Bot hedefte kendiliğinden başlamaz:** hedefin Botlar sayfasında önce **Mutabakat** (borsayla karşılaştırma), temiz çıkınca **Başlat** — bunu siz yaparsınız.
6. İki tarafa da Telegram mesajı gider: "… artık … makinesinde" ve hedefte karşılaştırmanın sonucu.

**Taşındıktan sonra eski bilgisayarda** bot listede durur ama **salt okunurdur**: Başlat, Çalıştır, Mutabakat, Acil, hesap türü değişikliği … hepsi "bu bot … makinesine taşındı" diye reddedilir; yalnız Durdur serbesttir. [Sorunlar](#/kilavuz/sorunlar) sayfasındaki araçlar da (Kaydı borsaya eşitle, Zarar sınırını sıfırla, güvenli kip, para hareketi onayı … — telefondan da) PIN'den sonra aynı yanıtla reddedilir; önizlemeleri açılır. Sağlık sayfasındaki **Güvenli kipten çık** ve Botlar'daki hesap / sermaye / arşivle / geri getir de reddedilir. Botun kartının üstünde sarı bir bant "Bu bot artık … makinesinde çalışıyor" der (yanında **o makinede aç ↗**). Botun yeni yerdeki durumu [Botlar › Özet › Başka makinelerdeki botlar](#/kilavuz/botlar/baska-makine) kartında görünür. Eski bilgisayardaki dosyalar silinmez. **Geri getirmek** için aynı kartı yeni makinede kullanıp botu eski bilgisayara taşıyın (nöbet numarası bir artar).

### Nöbet: aynı bot iki makinede aynı anda çalışmaz {#bot-nobet}

Her botun kaydında **hangi makinede çalıştığı** ve bir **nöbet numarası** vardır; her taşımada numara bir artar. Kurallar:

- **Bot kaydı başka makineyi gösteriyorsa ya da taşıma sürüyorsa** bot o bilgisayarda başlamaz ve borsaya bağlanmaz (ağ bağlantısı gerekmez — bilgisayarlar birbirini görmese de geçerli).
- **Açılışta** eşlenmiş bir sunucu varsa, çalışması gereken her bot önce eşlere sorulur: bir eş o botun **daha yeni nöbetini** taşıyorsa bot başlamaz ve kayıt o makineye devredilir (ör. eski bir yedekten açılan bilgisayar). Eş aynı botu demo/canlıda **zaten çalıştırıyorsa** bot başlamaz (iki makine aynı kimlikle — aynı emir önekiyle — aynı hesaba emir göndermesin).
- **Eşlerin hiçbirine ulaşılamazsa** bot açılışta **kendiliğinden başlamaz** ve Telegram'a "Bot açılışta başlamadı (nöbet denetimi)" gelir. Bot başka makinede çalışmıyorsa Botlar sayfasından **elle Başlat** — elle Başlat'ı yalnız eşin olumlu bir çakışma bildirmesi durdurur. Eşlenmiş sunucu yoksa (tek bilgisayar ya da yalnız geliştirme bilgisayarı eşli) davranış eskisi gibidir.
- **Kairos demo kabulü süresince** (2026-12-09'a kadar) bu açılış kuralı Kairos için yalnız **haber** verir, Kairos yine başlar (kabul ölçümü kesilmesin). Kairos zaten taşınamadığı ve devralınamadığı için başka makinede sahibi olamaz.
- **Çalışırken de geçerli (4. faz):** bir eşin nabzında ya da nöbet bildiriminde botun **daha yeni nöbeti** görülürse (ör. bot, bu bilgisayar bozuk sanıldığı için başka makinede [devralındıysa](#/kilavuz/ayarlar/makine-devralma)) bot bu bilgisayarda **hemen durdurulur** — açık pozisyona ve emirlere dokunulmaz — ve kaydı yeni makineye devredilir; Telegram'a alarm gider. İki makine aynı botu ayrı ayrı aynı nöbetle devralmışsa biri (makine kimliği büyük olan) kalır, öbürü durur.

### Taşıma yarıda kalırsa {#bot-tasima-yarida}

| Durum | Ne olur | Ne yapmalı |
|---|---|---|
| Hedef reddetti / paket bozuk geldi | Hedefte hiçbir şey değişmez; bot bu bilgisayarda **durmuş** kalır ("Son taşıma yapılamadı: …") | Nedeni giderip yeniden **Taşı**, ya da Botlar sayfasından **Başlat** |
| Hedef yerleştirirken hata / hedef kapandı | Hedef yaptığı her adımı geri alır (kapandıysa açılışta) | Yukarıdaki gibi |
| Yanıt gelmedi (bağlantı koptu) | Pusula hedefe hemen sorar: bot oraya geçtiyse "taşındı", geçmediyse "yapılamadı" | — |
| Hedefe hiç ulaşılamıyor | Sonuç **belli değil**: bot **iki makinede de başlamaz**; kartta "Yeniden denetle" | Hedef açılınca **Yeniden denetle** (açılışta da kendiliğinden sorulur) |
| Bu bilgisayar taşıma sırasında kapandı | Açılışta hedefe sorulur, sonuç kendiliğinden tamamlanır | — |

Taşıma günlük karar penceresinde (UTC 23:50–01:30, TR 02:50–04:30) yapılmaz. Bot verisi en çok 64 MB olabilir (bugünkü botlar birkaç MB).

## Ne zaman kullanılır {#ne-zaman}

- Sabah: bot gece ne yaptı, ne kadar kazandı, bir sorun var mı.
- Ana sayfada bot sağlığı sarı/kırmızıysa.
- Botu durdurmak / başlatmak ya da acil freni çekmek için (Genel). Hesap türü, para yatırma kaydı ve kontroller botun [Yönetim](#/kilavuz/botlar/ayarlar) görünümünde.

## Ekran {#ekran}

![Botlar › Kairos › Genel](ekran:botlar-1400)

Üstte dört görünüm düğmesi (**Genel · Hesap · İşlemler · Yönetim**). Hangi botun açık olduğu yan menüde ve sayfanın kırıntısında yazar; son seçilen bot hatırlanır. **Genel** görünümü yukarıdan aşağıya:

1. **Başlık:** botun adı, büyük durum rozeti, hesap türü (kâğıt / Binance demo / CANLI HESAP), kuralı tek cümle ve **Son karar** satırı (ör. "13 Ekim: BTC değişmedi · BTC trendi yükselişte — BTC tutuluyor"). Sağda yalnız **Durdur / Başlat** ve kırmızı **Acil fren**.
2. **Sayılar:** **hesap değeri** (altında Binance "Avbl") · **başlangıçtan** getiri · aynı dönemde **BTC al-tut** · **simülasyona göre** (30 gün) · **en derin düşüş** · **BTC trendi** (yükselişte / düşüşte).
3. **Günlük defter** (71.0) — solda özet, sağda takvim ve eğri:
   - **Başlangıçtan bugüne** büyük getiri ve aynı dönemde **BTC al-tut**: bot BTC'nin kaç puan önünde ya da gerisinde.
   - Sekiz kutu: **kazanan gün** (ör. 6 / 11), **ortalama gün**, **en iyi gün**, **en kötü gün**, **en derin düşüş**, **işlem** sayısı, **ödenen ücret**, **gerçekleşen K/Z** (kapanan işlemler).
   - **Kim kazandırdı, kim kaybettirdi:** **BTC ayağı** (her gün tutulan BTC tutarı × BTC'nin o günkü değişimi) ve **coin sepeti** (kalan: Donchian + DCA, ücret ve fonlama dahil), botun sermayesine oranla puan. Altında Donchian ve DCA'nın **gerçekleşen** kâr/zararı (Binance "Realized Profit"; açık pozisyonlar dahil değil). Yaklaşık bir dökümdür — günlük ölçümlerden.
   - **Takvim:** her gün o günün sonucu; yeşil kazanan, kırmızı kaybeden gün, renk ne kadar koyuysa hareket o kadar büyük. Mor gün botun başladığı gün. **‹ ›** ile ay değişir. Bir güne dokununca altında o günün sonucu ve **işlemleri** açılır (saat, coin, AL/SAT, kol, miktar, fiyat, ücret, K/Z).
   - **Getiri eğrisi:** botun gerçek sonucu ve **BTC al-tut** (kesikli). **% getiri ↔ $ değer** düğmesiyle yüzde ya da dolar. **Noktalar işlem olan günlerdir**: üstüne gelince kaç işlem olduğu (ör. "Donchian 2 · DCA 1"), dokununca takvimde o gün açılır. **Geçmiş — backtest** düğmesi kuralın 2020'den beri nasıl davranırdığını gösterir (aylık, başlangıç 100; iyimser — gelecekte aynısı olmayabilir). Ekran her zaman **gerçek sonuçla** açılır, bot yeni olsa da.
   - **Gün** = botun ölçüm günü: bot her gün ~03:00'te hesap değerini yazar; bir günün sonucu bir önceki ölçümden o güne kadarki değişimdir. İlk ölçümden sonra ikinci günlük çalışmada sayılar dolar.
4. **Para nerede duruyor?** BTC / coin sepeti / nakit (hesap değerine oranla; coin sepeti ×3 kaldıraçlı nominal) ve yanında **coin bazında kâr / zarar** çubukları (açık pozisyonların girişten bugüne).
5. **Aylık getiri** tablosu (yıl yıl, ay ay; yıl toplamı).
6. Katlı **Botun künyesi:** son çalışma, coin sepeti payları, koruma stopu, teminat durumu, açık pozisyon, küçük hesap kipi, hesap koruması (canlı hesapta), demo/gerçek farkı.

**Hesap** görünümü: botun borsadaki hesabı (bağlantı sağlığı, bakiye, açık pozisyonlar, bekleyen emirler, geçmiş işlemler — [Bot hesabı](#/kilavuz/hesaplar)) ve altında **Binance bakiyesi** kartı: Binance'in kendi hesap alanları, Binance'teki adlarıyla ([aşağıda](#/kilavuz/botlar/binance-bakiyesi)).

![Botlar › Kairos › Hesap (bakiyeler görüntüde maskeli)](ekran:hesaplar-1400)

**İşlemler** görünümü: **Coin grafiği — <bot>** — yalnız o botun işlem yaptığı coinler (● = açık pozisyon); ▲ alış, ▼ satış / kâr al, ● kademeli alım; kesikli çizgi = bekleyen emir. Zaman dilimi (varsayılan 1d) ve mum sayısı seçilir. Altında **İşlemler** paneli ([ayrıntı](#/kilavuz/botlar/islemler)): Açık pozisyonlar · Bekleyen emirler · İşlem geçmişi · Pozisyon büyüklüğü. Bir satıra tıklamak grafikte o coine ve mumuna gider.

![Botlar › Kairos › İşlemler](ekran:botlar-islemler-1400)

**Pozisyon büyüklüğü** sekmesi (67.5'e kadar adı "Dağılım geçmişi"): her bölümün (BTC · trend takibi · kademeli alım) **açık pozisyon büyüklüğü** USDT olarak, gün gün. **Kâr/zarar değildir** — kademeli alım fiyat düştükçe ek alım yaptığı için alanı büyür; bu büyüme kazanç demek değildir. Grafiğin altında her bölümün son değeri ve dönem başına göre değişimi yazar. Kâr/zarar için Genel görünümdeki günlük defter (takvim, kim kazandırdı) ve "coin bazında kâr / zarar" çubukları.

![Pozisyon büyüklüğü — her bölümün açık pozisyonu (USDT)](ekran:botlar-pozisyon-buyuklugu-1400)

**BTC ayağı bilerek stopsuz (Kairos demo):** Kairos'un BTC ayağı koruma stopundan **bilerek** hariç tutulur (kullanıcı kararı 2026-10-07; trend ayağı kendi kuralıyla çıkar). Hesap görünümünde BTC pozisyonunun koruma sütununda **bilerek stopsuz** rozeti görünür ve bu pozisyon "Koruma stopu eksik" uyarısına sayılmaz. BTC pozisyonunda trend takibi kolunun da payı varsa o pay için koruma stopu yine beklenir.

**Yönetim** görünümü: [aşağıda](#/kilavuz/botlar/ayarlar).

![Botlar — telefon](ekran:botlar-390)

![Günlük defter — telefon: özet üstte, takvim ve eğri altta](ekran:botlar-defter-390)

## Botlar › Özet {#ozet}

**Botlar**'a tıklayınca (ya da yan menüde **Botlar › Özet**) bütün botlar tek sayfada:

- **Kartlar:** her bot için başlangıçtan getiri, kıyası (Kairos / Tao: BTC al-tut; portföy botları: kendi al-tut kıyası, ör. QQQ) ve kaç puan önde / geride; küçük eğri. Karta dokununca botun kendi sayfası açılır.
- **Karşılaştırma tablosu:** bot, tür (kripto / portföy), başlangıç, gün, getiri, kıyas ve kıyas getirisi, **fark (puan)**, en derin düşüş, işlem sayısı.

Kripto botları günlük ölçümle (~03:00), portföy botları kâğıt hesabın günlük değeriyle karşılaştırılır. Kısa kayıtta sayılar şansa çok bağlıdır; geçmiş sonuç geleceği göstermez.

![Botlar › Özet](ekran:botlar-ozet-1400)

### Başka makinelerdeki botlar (75.9) {#baska-makine}

[Ayarlar › Makineler](#/kilavuz/ayarlar/makineler)'de başka bir **sunucu** eşlenmişse, Botlar › Özet'in altında **Başka makinelerdeki botlar** kartı çıkar: o makinelerde çalışan botlar — [taşıdığınız](#/kilavuz/botlar/bot-tasima) botlar dahil. Eşlenmiş sunucu yoksa kart hiç görünmez.

| Sütun | Anlamı |
|---|---|
| Bot | Botun adı |
| Makine | Botun şu an bulunduğu (sahibi olan) makine |
| Hesap | kâğıt · demo · canlı hesap |
| Durum | çalışıyor · durmuş · yerleşiyor (taşıma sürüyor) · taşınıyor · taşındı — mutabakat ve Başlat bekliyor |
| Son nabız | O makineden son haber ne zaman geldi (5 dakikada bir). 15 dakikadan eskiyse "bilgi eski olabilir" |
| o makinede aç ↗ | Botun o makinedeki sayfasını yeni sekmede açar (makinenin adresi kayıtlıysa) |

- Kart **yalnız okur**: Başlat, Durdur, ayar düğmesi yoktur — işlemi botun çalıştığı makinenin panelinde yapın (bağlantı oraya götürür). Bilgi makinelerin birbirine yolladığı nabızdan gelir; ek bir bağlantı açılmaz.
- Bir bot yalnız **sahibi olan** makinenin satırında görünür; taşınmış botun eski kopyası listelenmez. Geliştirme / araştırma bilgisayarının botları listelenmez (orada bot çalışmaz).

## Botlarımızın gerçekleşmiş sonuçları {#bot-performansi}

Yeni kurulumda Botlar sayfasının en üstünde (ve Ana sayfada kısa hâliyle) **Botlarımızın gerçekleşmiş sonuçları** kartı durur: kullanacağın botların, Pusula'yı geliştirenin **kendi hesaplarındaki** sonuçları.

- **Kairos / Tao**: Binance **Demo Trading** (sanal para) hesabındaki değer eğrisi, gün gün; aynı dönemde **BTC al-tut** kıyası (kesikli çizgi), getiri, en derin düşüş, işlem sayısı. Henüz demo hesapta çalışmayan bot için "gerçekleşmiş sonuç yok" yazar.
- **Model portföyler** (Nova, Lydia, Simurg): kâğıt hesap endeksi (gerçek fiyatlarla, emir yok) ve kıyasları (QQQ al-tut, BTC al-tut …).

Her şey **yüzde / endekstir** (başlangıç = 100): bakiye, tutar, coin miktarı, emir kimliği ya da anahtar içermez. Backtest ve araştırma sonucu girmez — yalnız gerçekleşmiş demo / kâğıt sonuçları. Veri her sürümle yenilenir; kartta kaynak, tarih aralığı ve **"geçmiş sonuç geleceği göstermez"** notu vardır.

Kendi botların çalıştıkça sonuçların bot sayfasında görünür; kendi verisi olan kurulumda bu kart kapalı (tek satır) durur, tıklayınca açılır.

![Botlarımızın gerçekleşmiş sonuçları](ekran:bot-performans-1400)

## Binance bakiyesi — Avbl neden hesap değerinden küçük? {#binance-bakiyesi}

Binance emir kutusunda **Avbl** (kullanılabilir) yazan sayı ile Pusula'daki **Hesap değeri** farklıdır; ikisi de doğrudur, farklı şeyleri gösterir. Botlar › Kairos › **Hesap** görünümündeki **Binance bakiyesi** kartı yalnız bakiye dökümüdür: Binance'in kendi alanları, Binance ekranındaki adlarıyla (sayfa açıkken 12 sn'de bir yenilenir). **Paneldeki Kullanılabilir, Binance'in Avbl sayısının kendisidir** — Pusula onu hesaplamaz, Binance'ten okur.

| Ekranda | Binance'teki adı | Ne demek |
|---|---|---|
| Cüzdan bakiyesi | Wallet Balance | yatırılan para + gerçekleşen kâr/zarar − ücret ± fonlama |
| Gerçekleşmemiş K/Z | Unrealized PNL | açık pozisyonların şu anki kâr/zararı (işaret fiyatıyla) |
| **Marj bakiyesi = Hesap değeri** | Margin Balance | cüzdan + gerçekleşmemiş K/Z — Pusula'nın "Hesap değeri" budur |
| Pozisyon teminatı | Position Initial Margin | açık pozisyonlar için kilitli teminat (nominal ÷ kaldıraç; ×20'de nominalin %5'i) |
| Açık emir teminatı | Open Order Initial Margin | bekleyen, pozisyon büyüten emirler için ayrılan teminat (reduce-only satış ve koruma stopu teminat istemez) |
| Toplam başlangıç teminatı | Total Initial Margin | pozisyon teminatı + açık emir teminatı (Binance'in kendi toplamı) |
| **Kullanılabilir** | Avbl / Available Balance | yeni emir için serbest para |

**Kullanılabilir = Marj bakiyesi − Toplam başlangıç teminatı** (pozisyon + açık emir teminatı). Örnek (2026-10-15, demo hesap): Avbl **4.888,84** + 8 pozisyonun teminatı **58,52** (BTC 47,79 + SOL 4,29 + XRP 2,86 + HYPE 1,55 + ZEC 0,74 + PEPE 0,61 + SUI 0,39 + ENA 0,29) + XRP alış limitinin teminatı **1,43** (22,5 XRP × 1,275 ÷ 20) = **4.948,79** → panelde Hesap değeri **4.949**.

Denklemin altındaki satır yalnız bir denetimdir: Binance'in alanları aynı anda hesaplanmadığı için birkaç kuruşluk fark olağandır. Fark **0,50 $'dan** (büyük hesapta marj bakiyesinin %0,01'inden) küçükse yeşil **"Binance ile eşleşiyor (fark … — Binance alanları farklı anlarda hesaplanır)"**; büyükse kırmızı ve fark yazılır (o durumda geliştirme sohbetine haber verin).

Bu bilgisayar araştırma kopyasıysa Binance'e bağlanılmaz: bölüm bunu açıkça yazar ve bu bilgisayardaki son kaydı gösterir; sunucu bağlantısı kuruluysa sayılar sunucudaki panelden okunur ("Sunucudaki panelden okundu").

### Botun kendi getirisi (hesap tavandan büyükken) {#bot-sermayesi}

Demo hesapta ~5.000 $ var, Kairos-S ise 1.000 $ sermaye tavanıyla çalışıyor. Bu durumda grafik, **Başlangıçtan** ve **En derin düşüş** botun **kendi sermayesi** üstünden hesaplanır: **bot değeri = 1.000 $ + (bugünkü hesap değeri − ilk gün hesap değeri)** (hesapta yalnız bot işlem yapar). Hesabın tamamına bölmek kâr/zararı beş kat küçültürdü; tavana kırpmak ise eğriyi düz 1,00 yapardı (64.5'ten önceki hata). Başlangıçtan kutusunda "bot sermayesi 1.000 $ (tavan) — hesap 4.949 $" yazar; grafikteki çizginin adı **Bot değeri (1.000 $ tavan)**. Botun Yönetim görünümünden kaydedilen para yatırma/çekme bot değerinden düşülür (yatırılan para kâr sayılmaz).

## İşlemler: pozisyonlar, emirler, işlem geçmişi — tek yer {#islemler}

**İşlemler** görünümündeki (grafiğin altındaki) **İşlemler** paneli botun pozisyon, emir ve işlem kayıtlarının **tek** yeridir; demo/canlı hesapta sayılar doğrudan Binance'ten okunur (bakiye dökümüyle aynı kaynak):

- **Açık pozisyonlar** — Binance **Positions** sütunları: Sembol · kaldıraç (Binance'in kendi ayarı, ör. 20x), Miktar (Size), Giriş (Entry), Başabaş (Break-even), İşaret fiyatı (Mark), Likidasyon (Liq.; çaprazda çoğu zaman "—"), **Teminat (Margin)**, K/Z (PNL), ROI (= K/Z ÷ teminat) ve botun hangi bölümü (BTC / trend takibi / kademeli alım). Satıra tıklamak grafikte o coine gider.
- **Bekleyen emirler** — Binance **Open Orders** gibi iki başlık: **Temel (Basic)** (limit emirler) ve **Koşullu (Conditional)** (koruma stopları: "İşaret fiyat ≤ …", tüm pozisyon). Henüz Binance'e gönderilmemiş kademeli alım basamakları ayrı başlıkta ("Pusula'da bekleyen").
- **İşlem geçmişi** — Binance **Trade History** alanları: Zaman, Sembol, Yön, Fiyat, Miktar, Ücret, Rol (Maker/Taker), Gerçekleşen kâr; yanında botun bölümü ve sebebi. "borsa ✓" satırlar Binance'in işlem kaydının kendisidir. Bir emir dolduğu zamanda listelenir: Binance **Order History** emrin *verildiği* zamanı gösterir (ör. 9 Ekim 03:03'te verilen XRP 14,4 alış limiti 13 Ekim 03:33'te doldu → geçmişte 13 Ekim'de).

**Teminat neden açık emir teminatını içermez?** Binance'in pozisyon satırındaki "Margin" yalnız o pozisyonun teminatıdır (positionInitialMargin). Aynı coinde bekleyen pozisyon büyüten bir emir varsa onun teminatı ayrı tutulur. Örnek: XRP pozisyonu 42,7 XRP × 1,3439 ÷ 20 = **2,86**; bekleyen 22,5 XRP @ 1,275 alış limitinin teminatı **1,43**. 64.5 bu ikisini toplayıp **4,29** ve "13x" gösteriyordu; 64.6'dan beri 2,86 ve Binance'in kendi kaldıracı (20x).

## Sade terimler {#terimler}

| Ekranda | Eski adı | Ne demek |
|---|---|---|
| Hesap değeri | özsermaye | botun hesabındaki toplam para (pozisyonlar dahil) = Binance "Margin Balance"; Binance "Avbl" bundan teminatlar düşülmüş hâlidir |
| Coin sepeti | kol / Kalkan kolu | BTC dışındaki 15 coinde trend takibi + kademeli alım |
| Simülasyon / simülasyona göre | gölge | aynı kurallarla, emir göndermeden hesaplanan sonuç; gerçek sonuç %5'ten fazla ayrılırsa bot durur |
| BTC oranı | BTC payı | paranın BTC'de duran kısmı |
| BTC trendi yükselişte / düşüşte | trend açık / kapalı | yükselişte BTC tutulur, düşüşte nakde geçilir |
| Trend takibi | Donchian | fiyat son 20 günün zirvesini aşınca alır |
| Kademeli alım | DCA | düştükçe parça parça alır |
| Koruma stopu | felaket stopu | sert düşüşe karşı borsada bekleyen satış emri |
| Teminat durumu | marj | vadeli işlemde kullanılan teminatın oranı |
| Hesap koruması | hesap kesicisi | kayıp %30'da uyarır, %40'ta botu durdurur |
| Küçük hesap kipi | küçük sermaye | 5000 $ altında az coinle çalışır |
| Borsayla karşılaştır | mutabakat | botun kayıtları ile borsadaki pozisyonlar aynı mı |

Her terimin yanındaki **?** sade açıklamayı gösterir.

## Yönetim (eskiden Ayarlar › Botlar) {#ayarlar}

![Botlar › Kairos › Yönetim](ekran:botlar-eylem-1400)

Genel görünümde yalnız Durdur/Başlat ve Acil fren durur. Geri kalanı botun **Yönetim** görünümünde (`#/botlar/<bot>/yonetim`), yalnız seçili bot için:

| Satır | Ne yapar |
|---|---|
| Hesap türü | kâğıt ↔ demo (↔ CANLI HESAP, yalnız şartlar sağlanınca; altında neyin eksik olduğu yazar). Yalnız bot durmuşken değişir |
| Canlı hesap emir onayı | Yalnız canlı hesapta: **CANLI** yazarak verilir, kalıcıdır; "Emir onayını kaldır" kaldırır ([ayrıntı](#/kilavuz/botlar/gercek-para)) |
| Para yatırdım / çektim | Demo/canlı hesaba para ekleyip çektikten sonra tutarı (+/−) kaydedin: bot bunu kazanç/kayıp saymaz, gereksiz durdurma olmaz. Parayı taşımaz. 69.3'ten beri bot borsadaki yatırma/çekmeyi **kendisi de fark eder** ([Sürpriz sermaye](#/kilavuz/botlar/surpriz-sermaye)); 76.2'den beri algılanan hareket onayınızı bekler ve bu kayıt **ön onay** sayılır (72 saat içinde borsadaki eşleşen hareket onaylı işlenir, bot durmaz — [ayrıntı](#/kilavuz/sorun-giderme/para-akisi-onay)) |
| Küçük hesap kipi | otomatik (< 5000 $) / açık / kapalı. Yalnız bot durmuşken değişir |
| BTC ayağı (kâğıt) | Yalnız **kâğıt hesapta**: **spot** (varsayılan) ya da **çoklu varlık (canlı tasarımı)**. Değiştirmek kâğıt hesabı sıfırlar (onaylı); bot durmuşken açık ([aşağıda](#/kilavuz/botlar/btc-ayagi)) |
| Bugünün kararını şimdi uygula | **Şimdi çalıştır** (onaylı) |
| Kâğıt hesabı sıfırla | Yalnız **kâğıt hesapta**: **Kâğıt hesabı sıfırla (temiz başla)…** — bot durmuşken açık ([aşağıda](#/kilavuz/botlar/kagit-sifirla)) |
| Acil durdurmayı geri al (kâğıt) | Yalnız **kâğıt hesapta** ve son olay acil durdurmaysa görünür: **Önizle ve geri al…** — bot durmuşken açık ([aşağıda](#/kilavuz/botlar/kagit-geri-al)) |
| Kontroller | **Deneme (emirsiz)** bugünkü kararı emir vermeden gösterir · **Borsayla karşılaştır** · **Acil freni dene** (yalnız durmuş demo bot: dolmayacak küçük bir emir koyup acil freni sınar — demo hesaptaki TÜM pozisyonlar kapanır) |

### Kâğıt hesabı sıfırla (temiz başla) {#kagit-sifirla}

Kâğıt hesaptaki bir botu (ör. Tao) sıfırdan başlatmak için: önce **Durdur**, sonra Yönetim'de **Kâğıt hesabı sıfırla (temiz başla)…**, onay ve **acil PIN** (sunucu sıfırlamayı PIN'le korur; BTC ayağı değişikliği de aynı). Bot yeni bir kâğıt hesapla başlar: sermaye ayarlardaki kâğıt bakiyesi (`kagitBakiye`, varsayılan 10.000 USDT), pozisyon ve işlem geçmişi boş. **İlk çalışmada geçmiş günler telafi edilmez** — bot bugünkü hedefe gider ve oradan devam eder.

- **Eski kayıtlar silinmez:** botun klasörü `data/live/<bot>-onceki-<tarih saat>` yedeğine taşınır (ör. `denge-onceki-20261020T083005Z`); istenirse oradan incelenir. Bildirim yedek klasörünün adını yazar.
- **Yalnız kâğıt hesap:** düğme demo ve canlı hesapta görünmez; sunucu da reddeder ("… kâğıt hesapta değil") — demo hesaptaki Kairos'un kayıtlarına (`hucum-demo`, demo kabul testi) dokunulamaz.
- **Bot çalışırken** düğme pasiftir ("Önce botu durdurun"); sıfırladıktan sonra **Başlat**.
- Telefondan ve araştırma kopyasından yapılamaz (yalnız sunucudaki masaüstü panel).
- **Kötümser dolum (69.5):** sıfırlamadan sonra açılan yeni kâğıt hesap gerçeğe daha yakın çalışır — felaket stopu 1 dakikalık mumda tetiklenir ve tetik fiyatı ile kapanıştan **kötü olanından** 5 baz puan kaymayla dolar; piyasa emri 5 baz puan kaymayla dolar; stoplar diske yazılır. Sıfırlanmamış eski kâğıt hesap eski (iyimser) modelde kalır, böylece süren ölçüm (ör. Tao) ortasında kurallar değişmez.

### Acil durdurmayı geri al (kâğıt) {#kagit-geri-al}

Kâğıt hesapta acil fren denendiyse ya da yanlışlıkla basıldıysa bot, pozisyonlarını **kaldığı yerden** geri alabilir: acil öncesi hâl geri yüklenir, aradaki süre **geçmiş fiyatlarla** botun kendi koduyla simüle edilir (kâğıt borsanın dolum kuralları: kademeli alım basamakları, kâr al emirleri; arada karar saati geçtiyse o günün kararı) ve bot bugünkü hâlden devam eder. Acilin kapanış işlemleri ve ücretleri hiç olmamış sayılır.

1. Botu **Durdur** (çalışırken düğme pasiftir). Durmuşken geçen karar saatleri de simüle edilir.
2. Yönetim'de **Acil durdurmayı geri al (kâğıt)** → **Önizle ve geri al…**. Önizleme sunucuda birkaç dakika sürebilir; düğmede ilerleme yazar. Botun dosyalarına bu sırada dokunulmaz.
3. Önizlemeyi okuyun: kaynak (acil öncesi kayıt), acilin kapattıkları (giriş fiyatlarıyla), **acil anı doğrulaması** (simülasyonun o anki pozisyonları acilin kapattıklarıyla aynı mı), aradaki dolumlar ve kararlar, geri gelecek pozisyonlar, hesap değeri şimdi → sonra.
4. Doğruysa **GERIAL** yazıp onaylayın; acil PIN istenir. Önizleme 30 dakika geçerlidir.
5. Bot durmuş kalır: **Başlat**'a basın. Önizlemeden sonraki dakikaları kâğıt borsa kendisi tamamlar.

- **Kaynak:** 77.5'ten sonra kâğıt hesaptaki her acil durdurma, başlamadan önce botun dosyalarını `acil-oncesi/<zaman>/` klasörüne kopyalar; araç önce onu kullanır. Yoksa (77.5'ten önceki acil) **günlük yedek** (sabah 05:30, acilden önce alınmışsa) kullanılır. İkisi de yoksa ya da acil anı doğrulaması tutmazsa önizleme **nedenini yazar ve uygulanmaz**.
- **Yedek:** uygulamadan önce botun bütün dosyaları kendi klasöründe `geri-al-yedek/<zaman>/` altına kopyalanır. Uygulamadan sonra borsayla karşılaştırma temiz çıkmazsa eski hâl kendiliğinden geri yüklenir.
- **Yalnız kâğıt hesap:** demo ve canlı hesapta düğme yoktur, sunucu da reddeder. Kairos'ta bu sürümde kapalıdır (demo kabul süresi). Telefondan ve araştırma kopyasından yapılamaz.
- Acilden sonra bot yeniden işlem yaptıysa (günlük karar, yeni dolum) geri alma anlamsızdır; düğme görünmez.

### BTC ayağı: spot ya da çoklu varlık {#btc-ayagi}

![Botlar › Tao › Yönetim: BTC ayağı (kâğıt)](ekran:botlar-denge-yonetim-1400)

Botun BTC payı kâğıt hesapta iki biçimde tutulabilir:

- **spot** (varsayılan): BTC doğrudan alınır, tutulur.
- **çoklu varlık (canlı tasarımı):** canlı hesapta kullanılacak biçim — BTC spotta alınır ve vadeli cüzdana **teminat** olarak aktarılır (Binance çoklu varlık modu; teminat BTC değerinin %95'i sayılır). Kâğıt hesapta bu akış taklit edilir: alım, aktarım, satış, iade, borsayla karşılaştırma her gün aynı adımlarla çalışır.

Canlı hesaba geçiş şartlarından **G7**, çoklu varlık akışının kâğıt hesapta **en az 14 gün** sorunsuz çalışmasını ister. Kairos demo kabul testinde olduğu için (demo hesapta BTC ayağı her zaman perp) bu deneme kâğıt hesaptaki bot (Tao) ile yapılır: önce **Durdur**, Yönetim'de **BTC ayağı (kâğıt)** → **çoklu varlık**, onay, sonra **Başlat**.

- Biçim değişince kâğıt hesap **sıfırlanmak zorunda** (iki biçimin kayıtları birbirine taşınmaz); eski kayıtlar [sıfırlamadaki gibi](#/kilavuz/botlar/kagit-sifirla) yedek klasöre taşınır.
- Demo hesapta bu satır görünmez (demo: perp); canlı hesap her zaman çoklu varlıkla çalışır.
- Telefondan ve araştırma kopyasından yapılamaz.

Kairos'un Yönetim görünümünün altında **Demo kabul süreci** kartı da durur (aynı kart [İleri test](#/kilavuz/ileri-test)'te). İki botun salt okunur özeti (durum, hesap türü, küçük hesap kipi, hesap değeri) **Ayarlar › Botlar (özet)**'te; her satırdaki **Yönet →** buraya getirir.

## Adım adım: botu demo modunda başlatmak {#demo-baslat}

Canlı hesap yoktur; demo hesap Binance'in sahte paralı ortamıdır.

1. Önce demo API anahtarını girin: [Ayarlar › Bağlantılar](#/kilavuz/hesaplar/anahtar).
2. Hesaplarda elle açılmış demo pozisyon varsa kapatın — bot tanımadığı pozisyonu görünce kendini durdurur (bilinçli güvenlik).
3. **Botlar › Kairos › Yönetim**'de **Hesap türü**nü **demo** yapın ve onaylayın. Aynı anda yalnız **bir** bot demo'da olabilir.
4. **Deneme (emirsiz)** ile bugünkü planı görün.
5. İsterseniz **Acil freni dene** — sonucu "önce 1 emir → sonra 0 emir / 0 pozisyon · borsayla uyumlu" olmalı.
6. **Botlar › Kairos › Genel**'de **Başlat**. Bot her gün kendiliğinden çalışır; hemen çalıştırmak için Yönetim › **Şimdi çalıştır**.
7. Ertesi gün künyedeki **Son çalışma** ve **Koruma stopu** satırlarını kontrol edin ([Kurulum › Adım 16](#/kilavuz/kurulum/adim-16)).

## Canlı hesap modu {#gercek-para}

Bot Binance **gerçek** hesabınızda çalışır (BTC spot, vadeli hesapta teminat). Botun Yönetim görünümündeki hesap türü listesinde **ancak bütün şartlar sağlanınca** görünür; o zamana kadar listenin altındaki "Canlı hesap: kapalı" satırı neyin eksik olduğunu yazar:

- Tarih **5 Ocak 2027** ya da sonrası (90 günlük ileri test kontrol noktası).
- Sunucuda G1–G9 şartlarının yazılı onayı ve sermaye üst sınırı: `npm run canli-kapilar` (şartların anlamı proje belgelerinde, G1–G9). İlk üst sınır en çok **1000 $**; her artırma en çok iki katı.
- Ayarlardaki canlı sermaye tavanı (`canliSermayeTavani`) üst sınırı aşmıyor; canlı hesap API anahtarı girili (para çekme izni KAPALI, IP kısıtı AÇIK — bağlanırken borsadan denetlenir); sağlık sinyali (healthchecks) adresi girili; başka bot canlı hesapta değil.

**Adımlar:** Botlar › <bot> › Yönetim › **Hesap türü: CANLI HESAP** → **CANLI HESAP** yazın → **Canlı hesap emir onayı** → **CANLI** yazın → **Deneme (emirsiz)** → Genel › **Başlat**. Her geçiş ve onay Telegram'a alarm olarak gider (siz değilseniz hemen acil durdurun).

**Kendiliğinden durma (hesap koruması):** başlangıçtan **%30** kayıpta uyarı, **%40** kayıpta bot **acil durdurulur** ve onay bekler (karar Ö6). İleri test "DUR" derse de bot acil durdurulur. Emir onayı yeniden başlatmada kalkmaz; acil durdurma, kesin borsa hatası ya da "Emir onayını kaldır" kaldırır. Telefondan hesap türü değiştirilemez ve onay verilemez — yalnız acil durdurma.

## Adım adım: acil durdurma {#acil-fren}

1. Botun **Genel** görünümünde kırmızı **Acil fren** düğmesine basın (bot çalışırken üst çubuktaki **Acil durdur** da aynı düğmeye basar).
2. Onay penceresini okuyun ve onaylayın.
3. Botun bütün emirleri iptal edilir, açık pozisyonları piyasa fiyatından kapanır, bot **Durdu** olur. Acil fren **engel koymaz**: "Durduruldu — onay bekliyor" bandı ve **Engeli kaldır** çıkmaz (77.6'dan beri acilin kendi kayıt satırları öz denetimde güvenli kip de açmaz).
4. Sonuç Telegram'a da gelir. Yeniden başlatmak için nedenini anlayın, sonra **Başlat** yeter. **Kâğıt hesapta** acil yanlışlıkla basıldıysa önce Yönetim'de **Acil durdurmayı geri al (kâğıt)** › **Önizle ve geri al…** ile acil öncesi hâli geri getirin ([ayrıntı](#/kilavuz/botlar/kagit-geri-al)), sonra **Başlat**; arada **Şimdi çalıştır** ya da günlük çalışma olursa geri alma düğmesi kalkar.

> **Tehlike:** Demo ve canlı hesapta acil fren geri alınamaz (kâğıt hesapta 77.5'ten beri [geri alınabilir](#/kilavuz/botlar/kagit-geri-al)). Fiyat sert hareket ederken piyasa emri kötü fiyattan dolabilir. Yalnız gerçekten durdurmanız gerekiyorsa kullanın; sadece yeni emir vermesin istiyorsanız **Durdur** yeterlidir.

Bu bilgisayar araştırma modundaysa acil fren de kilitlidir — acil durumda sunucudaki paneli ya da telefonu kullanın.

**Telefondan (60.5):** telefonda Durdur/Başlat yoktur; yalnız kırmızı **Acil durdur** vardır. Basınca **acil PIN** ve **DURDUR** yazmanız istenir; ikisi doğru olmadan düğme açılmaz. PIN sunucuda `npm run acil-pin` ile belirlenir (tanımlı değilse telefondan acil durdurma kapalıdır). 1 dakikada 5 yanlış PIN → 1 dakika kilit + Telegram uyarısı. Ayrıntı: [Telefondan açmak](#/kilavuz/telefon/acil-pin).

## Durduruldu bandı {#durduruldu}

Bot kendini durdurduysa başlığın altında kırmızı bant ve sade bir neden görünür. Bot bu durumda yeni emir vermez (acil fren yine çalışır). Başlıca nedenler:

1. **Borsa ile kayıtlar uyuşmuyor** (elle emir mi verdiniz?): nedeni bulun, düzeltin, banttaki **Borsayla karşılaştır** → temizse bot devam eder.
2. **30 günde gerçek sonuç simülasyondan %5'ten fazla ayrıldı:** Engeli kaldır tek başına yetmez (aynı gün yeniden gelir). [Sorunlar](#/kilavuz/sorun-giderme/uygulama-sapmasi) kartındaki **Farkı kabul et** (73.8) bandın hangi günlerden geldiğini gösterir; kabul ederseniz (PIN + KABUL) o günler banda sayılmaz, kayıt silinmez.
3. **Felaket stopu / ADL / likidasyon sonrası uyuşmazlık** (73.8): Sorunlar kartında o coin için **Kaydı borsaya eşitle** (önizleme → PIN + ESITLE; emir gönderilmez), sonra **Borsayla karşılaştır**. Ayrıntı: [Sorun giderme](#/kilavuz/sorun-giderme/felaket-stopu).
4. **Zarar sınırı (K3) çekildi** (bot çalışıyor görünür ama nakitte kalır): çekildiği an Telegram'a bir kez yazılır; yeniden risk almak strateji kararıdır — Sorunlar kartındaki **Zarar sınırını sıfırla** (PIN + SIFIRLA; yeni tepe = bugünkü değer).
5. **Öz denetim botu tamamen kapattı** (69.1 — kurulamayan stop, art arda reddedilen emirler, tekrar tekrar çöken döngü): neden "öz denetim: …" diye başlar. İnceleyin, sonra **Engeli kaldır** ya da [Sağlık](#/kilavuz/saglik/tam-kapanma) sayfasında **Botu yeniden aç**.

**Sarı bant — güvenli kipte (69.1):** bot yeni işlem açmaz, açık pozisyonun stopu yerinde kalır. Öz denetim koyduysa sebep geçince kendiliğinden kalkar; banttaki **Güvenli kipi kaldır** ile de kaldırabilirsiniz; telefonda bantta **Güvenli kipten çık (PIN)…** çıkar ve Sorunlar sayfasının PIN'li aracına götürür ([Güvenli kip](#/kilavuz/saglik/guvenli-kip)).

## Sürpriz sermaye: yatırma ve çekmeyi bot kendisi fark eder {#surpriz-sermaye}

Sermaye artışları her ay ama tutarı belli olmadan yapılacağı için bot hazırlıklıdır:

> **76.2'den beri önce onay:** demo ve canlı hesaptaki botlarda algılanan her para girişi ve çıkışı **onayınızı bekler**; onaylanana kadar hesaba katılmaz, onaysız **çıkışta** bot durur (yalnız azaltan emir; koruma sürer). Onay Sorunlar kartında (**Para hareketini onayla**, PIN) ya da önceden **Para yatırdım / çektim** kaydıyla olur; aşağıdaki maddeler onaydan **sonra** geçerlidir. Siz yapmadığınız çıkış için **Bu ben değilim — reddet**. Kairos demo kabulü 2026-12-09'a kadar yalnız haber alır. Ayrıntı: [Para hareketi onayınızı bekliyor](#/kilavuz/sorun-giderme/para-akisi-onay).

- **Algılama:** her günlük çalışmadan (03:02) önce bot borsadaki yatırma / çekme / aktarım geçmişine bakar. Vadeli hesapta (demo) vadeli cüzdana giren-çıkan USDT; canlı tasarımda (spot BTC + vadeli) Binance yatırma ve çekme geçmişi (USDT; BTC güncel fiyatla). Bot ilk kez çalıştığında saymaya o andan başlar; eski hareketler "yeni para" sayılmaz.
- **Ölçüm bozulmaz:** algılanan tutar elle kaydedilmiş gibi işlenir — gölge sapma bandı, risk tepesi ve hesap kesicisi yanlış alarm vermez, yatırılan para kâr sayılmaz.
- **Para hemen çalışır:** yatırılan para o günkü çalışmada hedefe göre dağıtılır (BTC ayağında sebep **sermaye değişimi**; ay başını beklemez).
- **Sermaye tavanı izler:** yatırma tavanı aynı tutarda yükseltir, çekme düşürür (ayarlı tavanın altına inmez). **Canlı hesapta** tavan onay dosyasındaki üst sınırı (G9) asla aşmaz: aşacaksa tavan sınırda kalır, fazlası kullanılmaz ve Telegram "onaylı üst sınırı artırın" der. İstenmezse ayarda `tavanAkis: false`.
- Telegram'a "sermaye artışı / çekişi algılandı" iletisi gider. USDT ve BTC dışındaki coinler sermayeye sayılmaz (uyarı yazılır).
- **Spot cüzdana yatırma (çoklu varlık) kabul bekler:** Sorunlar kartındaki **Yatırmayı kabul et** (73.8; PIN + KABUL, telefondan da) yalnız yatırmayı kabul eder — engel, emir freni ve sapma bandı değişmez. Eskiden bu iş Engeli kaldır'la yapılırdı; o düğme yine durur ama hepsini birden kaldırır.

## Para güvenliği (69.6) {#para-guvenligi}

- **Fiyat okunamazsa** bot pozisyonu büyüten emir vermez; yalnız küçülten ve kapatan emirler geçer.
- **"Para yatırdım/çektim" kaydı** onay için **KAYIT** yazılmasını ister. Çekme özsermayeden, yatırma özsermayenin 3 katından büyük olamaz; özsermayenin %20'sini aşan bir tutar Binance bakiyesinde görünmüyorsa kayıt reddedilir. Çoğu zaman bu kayda gerek yoktur: bot vadeli cüzdana gelen aktarımı kendisi algılar ([Sürpriz sermaye](#/kilavuz/botlar/surpriz-sermaye)).
- **Spot cüzdana yatırma (çoklu varlık):** bot onu hemen sermayeye saymaz, **"kabul bekliyor"** uyarısı gelir. [Sorunlar](#/kilavuz/sorun-giderme/yatirma-kabul) kartındaki **Yatırmayı kabul et** (PIN + KABUL) ile kabul edince ölçüm ve tavan güncellenir (Engeli kaldır kullanmayın: engel, emir freni ve sapma bandını da birlikte kaldırır). Böylece kendi para eklemeniz sahte kayıp gibi görünüp acil durdurmayı tetiklemez.
- **Hesap kesicisi kör olmaz:** sermaye artınca birikmiş kayıp korunur, kesici sıfırdan ölçmeye başlamaz.
- **Bir coinin verisi okunamazsa ya da bozuksa** açık Donchian pozisyonu satılmaz, korunur; günlükte uyarı çıkar. Veri kapısı ani düşüşleri ve tutarsız mumları da yakalar (BTC'de günlük %60'tan büyük düşüş şüpheli veri sayılır).
- **Canlı hesapta IP kısıtı zorunlu:** API anahtarında "Restrict access to trusted IPs only" açık değilse (yalnız sunucunun IP'si) bot bağlanmaz.

## Emir freni ve veri kapısı {#emir-freni}

- **Emir freni:** borsaya giden risk artıran emirlerin **toplamı** sınırlıdır: 24 saatte 600 emir, 10 dakikada 150 emir, 24 saatte sermaye tavanının 20 katı nominal. Günde bir karar veren bot için çok geniştir; yalnız kaçak bir döngüyü yakalar. Aşılınca bot durur (ENGEL) ve Telegram'a "EMİR FRENİ" gider; azaltan emirler ve felaket stopları çalışmaya devam eder. Fren diske yazılır, yeniden başlatma ya da mutabakat kaldırmaz; günlüğü inceledikten sonra **Engeli kaldır**. Kâğıt hesapta uygulanmaz (sanal para).
- **Veri kapısı:** karar vermeden önce günlük mumlar denetlenir: son 30 günde boşluk, 2 günden eski son mum, son 3 günde sıfır hacim, anlamsız fiyat sıçraması (BTC'de günlük %50, coinlerde %300). BTC verisi geçmezse o çalışmada karar verilmez (15 dakika sonra yeniden denenir, Telegram'a hata gider); bir coinin verisi geçmezse yalnız o coin o gün atlanır.

## Hisse yapıları {#hisse-yapilari}

Üç model portföyün (Nova, Lydia, Simurg) sanal hesapları Botlar sayfasında değil, **Portföy › Modeller**'de (model seçiciyle) ([Model portföyler](#/kilavuz/model-portfoy)).

## Grafik ve işlemler {#grafik}

Coin grafiği (**İşlemler** görünümü) seçili botun coinleriyle çalışır (izleme listesi seçicisi yoktur; coin düğmeleri sembolü değiştirir). Zaman dilimi ve mum sayısı seçilir. "Göstergeler" düğmesi 62.6'da kaldırıldı (gösterge havuzu Araştırma › Gösterge havuzu'nda). İşlemler sekmeleri: **Açık pozisyonlar · Bekleyen emirler · İşlem geçmişi** (yalnız bot / tüm hesap, süzgeç, CSV) **· Dağılım geçmişi** (BTC · trend takibi · kademeli alım nominali zaman içinde). Tablolardaki **Bölüm** sütunu işlemin hangi kısma ait olduğunu yazar (BTC / trend takibi / kademeli alım).

## Uyarılar ve ne yapmalı {#uyarilar}

| Görülen | Ne yapmalı |
|---|---|
| Son çalışma 26 saati geçti (kırmızı; yalnız çalışan botta) | Sunucu açık mı, PusulaBot çalışıyor mu ([Kurulum](#/kilavuz/kurulum/adim-11)) |
| Koruma stopu: konamadı | Telegram mesajı + paneli geliştirme sohbetine iletin; bot durmaz ama korumasız |
| Koruma stopu: tetiklendi | Sert düşüşte koruma çalıştı; borsayla karşılaştırma uyuşmazlık verir — kararı siz verirsiniz |
| Teminat durumu: Dikkat / Tehlike | Likidasyona yaklaşılıyor; pozisyon ve koruma stopu botun **Hesap** görünümünde |
| "Telegram bağlı değil" | [Ayarlar › Bildirimler › Telegram](#/kilavuz/ayarlar/telegram) |
| Düğmeler gri | Bu bilgisayar araştırma modunda — bot sunucuda çalışır |
| Kâğıt hesapta acil fren yanlışlıkla / deneme için basıldı | Botu durdurun, Yönetim › **Acil durdurmayı geri al (kâğıt)** ([ayrıntı](#/kilavuz/botlar/kagit-geri-al)) |

## Araştırma kopyası ve telefon {#arastirma-telefon}

- Bu bilgisayar araştırma kopyasıysa başlığın altında gri **"Bu bilgisayardaki eski kayıt — asıl durum sunucudaki panelde"** notu çıkar; Telegram satırı "bu bilgisayarda bilinçli olarak kapalı" der (kurulum talimatı değil). Grafik düğmeleri (Canlı / Geçmiş) araştırma modunda da çalışır.
- Telefonda acil PIN tanımlı değilse kırmızı **Acil durdur** baştan pasiftir ve kartta nedeni yazar ("sunucuda: npm run acil-pin"). Yönetim görünümü telefonda yalnız bir not gösterir ("Bot ayarları yalnız sunucudaki panelden değişir").
- Demo hesapta BTC vadeli işlemde alım (LONG) olarak tutulur; canlı hesapta spot BTC olur (künyede "Demo / gerçek farkı").
- İşlem tablolarında miktar ve fiyat Türkçe biçimde (`0,0116`, `85.502,10`); grafik ekseni de öyle.
