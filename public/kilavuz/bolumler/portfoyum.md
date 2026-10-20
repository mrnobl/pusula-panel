# Hesaplar ve kayıtlar (gerçek portföy) {#portfoyum}

Gerçek portföyünün bilgisi **Portföy › Hesaplar**'da girilir: kurumlar, hesaplar, varlıklar ve her işlem (alış, satış, temettü, para yatırma…). Buraya girdiğin her şey (geçmiş tarihli işlemler dahil) **Pano**, **Varlıklar**, **Hedefim**, **Takvim ve akış** ve **Rapor**'u kendiliğinden günceller ([Portföy](#/kilavuz/portfoy)). Panelde bu kayıtların adı **Portföyüm**'dür (ör. "Portföyüm'den doldur", İşlem defteri › "Yatırım (Portföyüm)").

> **Not:** Hesaplar'daki bakiyeler otomatik dolmaz; her şeyi sen girersin (kripto borsalarının bakiyesi ayrıca İşlem defteri'nden okunup Pano toplamına eklenir — [Pano](#/kilavuz/portfoy/pano)). Veriler yalnız sunucuda (`data/portfoyum/`, git dışı). Telefondan yalnız görüntülenir.

## Ekran {#ekran}

![Portföy › Hesaplar — portföyler, hesap kartları ve + işlem](ekran:kayit-1400)

Yukarıdan aşağıya: **Portföyler** kartı · üst düğmeler · katlı **Yeni hesap** · katlı **Varlık ekle** · **hesap kartları** · katlı **Diğer işlemler** · **Hedef dağılım** satırı (Hedefim'e bağlantı) · katlı **Geçmiş işlemleri içe aktar (CSV)** ve **Gelişmiş**.

Hesap kartları **üst çubukta seçili kişinin** hesaplarıdır (**Ben**, **Fırat**, …); **Tümü** seçiliyken bütün hesaplar kişi başlıkları (portföy adlarıyla) altında sıralanır. Seçim değişince kartlar hemen yenilenir. Hesabı başka kişiye bağlamak: [Portföyler](#/kilavuz/portfoyum/portfoyler). Yatırım işlem defteri [İşlem defteri › Yatırım](#/kilavuz/portfoyum/islem-defteri)'dadır. Kur çevirici üst çubuktaki **Kur** düğmesinde ([Kur çevirici](#/kilavuz/kur-cevirici)).

## Portföyler: kimin hesabı {#portfoyler}

Hesaplar sayfasının en üstündeki **Portföyler — kimin hesabı** kartı her hesabın hangi portföye ait olduğunu ve toplama girip girmediğini gösterir:

| Sütun | Ne yapılır |
|---|---|
| **Portföy** | Seçiciden hesabın portföyü (ör. **Ben**, **Anıl**). Değişiklik hemen kaydedilir; eski kayıtlar silinmez, yeni bir "hesap → portföy" kaydı eklenir. Yeni hesap varsayılan olarak **Ben**'e düşer |
| **Toplama dahil** | **dahil** / **dahil değil** düğmesi. Dahil olmayan hesap portföyde görünür ama toplama, getiriye ve dağılıma katılmaz |
| **Yeni portföy** | Ad yaz (ör. "Anıl") → **Portföy ekle**. Sonra hesapları seçiciden o portföye bağla |

![Portföyler — Adını değiştir (satır içi)](ekran:portfoy-ad-1400)

Kartın üstündeki **portföy listesinde** her portföyün değeri ve hesap sayısı görünür. **Adını değiştir** → satırda yeni adı yaz → **Kaydet** (ya da Enter); **Vazgeç** (ya da Esc) değiştirmeden kapatır. **Ben** dahil her portföyün adı değişebilir; başka bir portföyün adıyla aynı ad kabul edilmez. Ad değişince üst çubuktaki portföy seçicisi ve raporlar yeni adı gösterir; hesaplar, hedef ve geçmiş aynı kalır. Telefonda bu düğme gizlidir.

Üst çubuktaki **Ben / Anıl / … / Tümü** seçicisi bütün Portföy sayfalarını seçilen portföye göre gösterir ([Görünüm](#/kilavuz/portfoy/gorunum)). Adında "Anıl" geçen açık bir hesap hâlâ varsayılan portföydeyse (Ben) Pano'da **sahip önerisi** bandı ve Yapman gerekenler'de "taşı" satırı çıkar: "… başkasına aitse kendi portföyüne taşıyın".

## Hesaplar: bilgi girişi {#kayit}

**Portföy › Hesaplar** sırasıyla:

1. Üstte düğmeler: **+ Varlık ekle** · **+ Yeni hesap** · **Geçmiş işlemleri içe aktar (CSV)** · **İşlem defteri** · **Yenile** · **Fiyatları yenile** (her biri ilgili bölümü açıp oraya kaydırır).
2. Katlı **Yeni hesap** ve **Varlık ekle** ([ayrıntı](#/kilavuz/portfoyum/hisse-ekle)): önce hesap, sonra içindeki varlıklar ve nakit.
3. **Hesap kartları:** başlıkta hesap adı · kurum · tür · para birimi, sağda değer ve son kayıt günü (30 günden eskiyse turuncu). Tabloda hesabın varlıkları: model etiketi (varlık o modelin son karar listesinde: N10, B10, 837 = QQQ), adet, ortalama alış, son fiyat, değer, kâr/zarar ve düğmeler:
   - **Sat:** kartın altındaki işlem satırını o varlıkla ve adediyle doldurur; adedi/fiyatı düzeltip **Ekle**.
   - **Düzenle / Kaldır:** yalnız açılışla girilmiş (sonradan işlem görmemiş) varlıkta. Düzenle adet, alış fiyatı, **alış tarihini** ve **notu** satırda değiştirir (eski açılış ters kayıtla iptal, yenisi yazılır; notu boşaltırsan silinir); Kaldır onay sorar. Satırda varlık adının altında alış tarihi yazar.
   - **Fiyat gir** ya da **⋯ › Fiyatı düzelt:** elle fiyat ([ayrıntı](#/kilavuz/portfoyum/elle-fiyat)).
   - Banka / TL hesabında **Vadeli mevduat** (ya da ayar varsa özeti ve **Değiştir**): otomatik faiz ([ayrıntı](#/kilavuz/portfoyum/mevduat-faizi)).
4. Her kartın altında **+ işlem** satırı: **Alış, Satış, Temettü, Para yatırma, Para çekme**; varlık, adet, fiyat, ücret (ya da tutar), **tarih**. Geçmiş işlem için tarihi geriye al; Pano'daki grafik ve sayılar o günden itibaren yeniden hesaplanır.
5. Katlı **Diğer işlemler: transfer, faiz, ücret, bölünme** — hesaplar arası transfer (ulaşan tutar dahil), elle faiz, ücret / gider, bölünme ve **Aynı gün sırası**. Alış, satış, temettü, para giriş/çıkışı da burada seçilebilir ama kolay yolu hesap kartıdır; **açılış bakiyesi burada yoktur** (Varlık ekle'de).
6. **Hedef dağılım** satırı: hedef yalnız [Hedefim](#/kilavuz/portfoy/hedefim)'de, seçili kişi için düzenlenir (**Hedefi düzenle → Hedefim**). Katlı **Geçmiş işlemleri içe aktar (CSV)** ve **Gelişmiş** (kurum, hesap ve varlık **adları**, Yahoo varlıkta **fiyat kodu** ve **hesap kapatma**).

![Diğer işlemler: transfer, faiz, ücret, bölünme](ekran:portfoyum-form-1400)

Model portföylerin emirlerini uyguladıysan kayıtları tek tek girmen gerekmez: Modeller sayfasındaki **Bu ay › Uyguladım** hepsini tek onayla yazar.

## Yeni hesap ve Varlık ekle (en kolay yol) {#hisse-ekle}

### Yeni hesap {#yeni-hesap}

![Yeni hesap — kurum adıyla, isteğe bağlı vadeli mevduat](ekran:portfoyum-yeni-hesap-1400)

1. **Kurum:** aracı kurum, banka ya da borsanın adı (ör. Midas, Enpara). Daha önce yazdığın kurum listede çıkar; yeni bir adsa kurum kendiliğinden eklenir (aynı ad, büyük/küçük harf farkıyla bile, iki kez açılmaz).
2. **Hesap adı** (ör. ABD hisseleri, Vadeli TL), **Tür** (ABD aracı kurum, BIST aracı kurum, TR banka, fon hesabı, Binance / kripto, fiziki altın, nakit, diğer) ve **Para birimi** (hesabın ana birimi; mevduatta faiz bu birimde işler).
3. Tür **TR banka** ya da **Nakit**, veya para birimi **TRY** ise katlı **Vadeli mevduat mı?** kısmı görünür; doldurursan hesap faiz ayarıyla birlikte açılır ([Vadeli mevduat](#/kilavuz/portfoyum/mevduat-faizi)). Boş bırakabilirsin; sonra hesap kartından da eklenir.
4. **Hesabı aç.** Kurum, hesap ve (varsa) faiz ayarı tek seferde yazılır — ya hepsi ya hiçbiri. Hesap üst çubukta seçili portföye bağlanır ("Tümü" seçiliyse **Ben**); sonra [Portföyler](#/kilavuz/portfoyum/portfoyler) kartından taşınabilir. Ardından **Varlık ekle** açılır.

### Varlık ekle {#varlik-ekle}

![Varlık ekle — sembol bul, hesap seç, adet yaz](ekran:portfoyum-hizli-1400)

Elinde **zaten olan** varlığı ve nakdi buraya girersin: panel bunu **açılış bakiyesi** olarak yazar (alış tarihindeki gün sonu bakiyesi). Varlık her zaman **var olan bir hesaba** eklenir — hiç hesabın yoksa kart "önce bir hesap aç" der ve Yeni hesap'a götürür. Bundan sonraki alış, satış, temettü ve para giriş/çıkışı hesap kartındaki **+ işlem** satırındandır. Sekmeler:

| Sekme | Ne yazılır | Fiyat |
|---|---|---|
| **Hisse / ETF** | **Sembol** (`TSLA`, `PYPL`, `QQQ`) ya da şirket adı (`paypal`) → **Bul**. BIST için yalnız kod (`THYAO`); `.IS` kendiliğinden. Birden çok eşleşmede "Başka bir şey mi kastettin?" | Yahoo Finance (fiyat geçmişi indirilir) |
| **Fon (TEFAS)** | **Fon kodu** (`AFT`, `TTE`), pay adedi, ortalama birim fiyat (TRY). Kod yanlışsa eklenmez | TEFAS (fonun adı da gelir) |
| **Kripto** | **Coin** (`BTC`, `ETH`, `SOL`; `BTCUSDT` da olur), adet, ortalama alış (USD). Binance'te yoksa eklenmez | Binance |
| **Altın (gram)** | **Gram** ve ortalama gram fiyatı (TRY) — fiziki gram altın | Ons altın (GC=F) × USD/TRY ÷ 31,1035 |
| **Nakit bakiyesi** | **Para birimi** ve **tutar**. Bir hesapta her para birimi için tek nakit bakiyesi girilir; sonrası para yatırma / çekme | — |
| **Diğer (elle fiyat)** | Sembol, ad, sınıf, para birimi, adet, birim maliyet ve isteğe bağlı **güncel birim fiyat** (bugünün fiyatı olarak kaydedilir) — tahvil, özel fon, gayrimenkul gibi kaynağı olmayan varlık | Elle ([Fiyat gir](#/kilavuz/portfoyum/elle-fiyat)) |

Her sekmede: **Hesap** (sekmeye uyan hesap kendiliğinden önerilir: fon → fon hesabı, kripto → Binance, hissede para birimine ve borsaya uyan hesap; uyan hesap yoksa seçili hesaba eklenir ve bunu yazar), **Ortalama alış fiyatı** (boş kalırsa kâr/zarar hesaplanmaz; sonra **Düzenle** ile eklenir), **Alış tarihi** (varsayılan **dün**: getiri bu günden ölçülür; birkaç kez aldıysan ilk alış günü), isteğe bağlı **Not** (ör. "eski hesaptan aktarıldı" — açılış kaydında saklanır, hesap kartındaki satırda soluk ve İşlem defterinin **Not** sütununda görünür). **Ekle** → varlık hemen kendi hesabının kartında, Varlıklar'da ve Pano'da görünür; panelde yoksa varlık kaydı arkada açılır ve fiyat geçmişi indirilir.

![Varlık ekle › Fon (TEFAS) ve açılış kuralı](ekran:portfoyum-varlik-ekle-1400)

Alış fiyatı girildiyse getiri **alış fiyatından** ölçülür: Pano'daki "Başlangıçtan" ve "Bu yıl" kâr/zarar yüzdesiyle aynı yerden başlar. Alış fiyatı yoksa getiri alış gününün kapanışından başlar ([Açılış kuralı](#/kilavuz/portfoyum/acilis-kurali); kart altındaki **Bu kayıt nasıl sayılır?** katı aynı kuralı yazar). Bir varlık aynı hesaba iki kez eklenmez: "zaten var" der, **Düzenle** kullan. Alış günü o hesapta **Modeller › Bu ay › Uyguladım** kaydı varsa panel "açılışa dahil mi, sonra mı?" diye sorar; açılış öncesi işlemin nakit bacağı için "nakit açılışı ekle" önerisi gelir (eski açılış formundaki sorularla aynı).

Telefonda (dar pencerede) sekmeler alt alta sarılır:

![Varlık ekle telefonda](ekran:portfoyum-varlik-ekle-390)

## İlk kurulum — özet {#ilk-kurulum}

1. **Yeni hesap:** her aracı kurum / banka / borsa hesabın için bir kez (kurum adıyla).
2. **Varlık ekle:** her hesabın içindekileri — hisseler, fonlar, kripto, altın ve **nakit bakiyesi** (nakdi olmayan hesaba da 0 tutarlı nakit bakiyesi girmen önerilir: sonraki alışların parası oradan düşer).
3. Vadeli mevduatsa hesap kartında **Vadeli mevduat**.
4. Sonra her işlemi hesap kartının **+ işlem** satırından girersin; eski işlemleri de geriye tarihli girebilirsin ([Açılış kuralı](#/kilavuz/portfoyum/acilis-kurali)). Çok sayıda geçmiş işlem için **Geçmiş işlemleri içe aktar (CSV)**.

Eski (67.3 ve öncesi) **Gelişmiş › 1. Kurum, 2. Hesap, 3. Varlık, 4. Elle fiyat** ve **Mevduat faizi (otomatik)** formları 67.4'te kalktı: kurum ve hesap **Yeni hesap**'ta, varlık **Varlık ekle**'de (fiyat kaynağı olmayan varlık "Diğer" sekmesinde), mevduat faizi ve elle fiyat **hesap kartında**. Gelişmiş'te adlar ve hesap kapatma kaldı. 68.4'ten beri Yahoo kaynaklı varlığın fiyat kodu da burada düzeltilir: **Varlıklar** tablosunda **Fiyat kodunu değiştir** → yeni kodu yaz (ör. BIST için `THYAO.IS`, `BRK-B`) → **Kaydet**. Kod kaydedilmeden önce Yahoo'da denetlenir; bulunamazsa, para birimi varlığınkinden farklıysa ya da kod başka bir varlıkta kullanılıyorsa kaydedilmez. Görünen sembol, işlemler ve geçmiş aynı kalır; fiyat geçmişi yeni koddan indirilir. TEFAS / Binance kodu ya da para birimi yanlışsa varlığı doğru bilgiyle yeniden ekleyin.

## Vadeli mevduat: otomatik faiz {#mevduat-faizi}

![Hesap kartında vadeli mevduat — özet ve yeni ayar](ekran:portfoyum-mevduat-1400)

Vadeli TL (ya da döviz) mevduat hesabının faizini her vade sonunda elle girmen gerekmez (64.2). Ayarın **tek yeri hesap kartıdır** (67.4): banka / nakit türündeki ya da TRY hesabın kartında **Vadeli mevduat** düğmesi satır içi formu açar (yeni hesabı açarken **Yeni hesap** kartında da aynı alanlar var). Formun altındaki cümle: *"Bu oranla her vade sonunda faiz kendiliğinden deftere işlenir; Pano'daki değer buna göre artar. Oranı değiştirirsen yeni oran o günden başlar."*

| Alan | Ne yazılır |
|---|---|
| **Yıllık faiz oranı (%)** | Bankanın yazdığı yıllık **brüt** oran, ör. `42,5`. |
| **Vade (gün)** | Mevduatın kaç günlük bağlandığı, ör. `32`. |
| **Stopaj (%)** | Faizden kesilen vergi oranı (dekontta yazar), ör. `15`. Boş = 0. |
| **Vade başlangıcı** | İlk vadenin başladığı gün (Değiştir'de: **yeni oranın başladığı gün**). |
| **Vade sonunda yenile** | İşaretliyse vade bitince para faiziyle birlikte yeniden bağlanır (faiz faize işler). İşaretsizse yalnız ilk vadenin faizi eklenir, sonra para vadesiz kalır. |

Ayar kaydedildikten sonra kartta özeti yazar: oran, vade, stopaj, başlangıç, yenilenir mi, **sıradaki faiz** günü, **eklenen vade** sayısı ve varsa uyarılar; yanında **Değiştir** · **Faizi durdur** · **Ayarı iptal et**.

- Her vade bitince **net faiz** (brüt − stopaj) hesabın ana para birimindeki nakde kendiliğinden eklenir; işlem defterinde **Faiz** satırı **otomatik** rozetiyle görünür. Hesap: anapara × yıllık oran × vade günü ÷ 365.
- **Anapara**, vade boyunca hesaptaki **en düşük** nakittir: vade ortasında yatırdığın para o vadede faiz almaz, çektiğin para anaparadan düşer.
- Yalnız **biten** vadeler eklenir; ileriye faiz yazılmaz.
- Bir otomatik faiz yanlışsa defterde **İptal et**: silinir ve **bir daha eklenmez** (sonraki vadelerin anaparasına da girmez).
- Bir vadenin faizini **elle** de girdiysen (Diğer işlemler › Faiz, vade aralığında bir tarihle) o vadenin otomatik faizi **eklenmez** (iki kez sayılmaz) ve uyarı çıkar: "bu vadenin faizi elle girilmiş — otomatik faiz eklenmedi".
- Hesapta ayarın para biriminde nakit yoksa (ör. mevduat varlık olarak girildi ya da açılış yok) uyarı çıkar: "hesapta TL nakit yok — faiz işlenmiyor". Mevduatı o hesaba nakit olarak (Varlık ekle › Nakit bakiyesi ya da para yatırma) girin.
- **Ayarı iptal et** (sayfa içinde onay sorar) ayarı ters kayıtla geri alır; o ayardan gelen otomatik faizler kalkar, önceki ayar varsa o geçerli olur. Yeni ayarın başlangıcı geçerli ayarınkinden **daha erken** olamaz — panel "önce mevcut ayarı iptal edin" der.
- Oran değişti mi? **Değiştir** → yeni oranı ve başladığı günü yaz: eski ayar o gün biter (eskisinin başlangıç gününü yazarsan eskisini düzeltirsin). **Faizi durdur** bugünden sonra faiz işletmez; eklenmiş faizler kalır.
- Otomatik faizler CSV dışa aktarımına girmez (her açılışta ayardan yeniden hesaplanır; içe aktarılsaydı iki kez sayılırdı). Faiz getiri sayılır, para girişi değil.

## Elle fiyat {#elle-fiyat}

![Hesap kartında elle fiyat](ekran:portfoyum-elle-fiyat-1400)

Fiyat kaynağı olmayan (**Diğer** sekmesiyle eklenen), fiyatı hiç gelmemiş ya da fiyatı **bayat** varlığın satırında **Fiyat gir** düğmesi görünür. Diğer varlıklarda aynı form satırın **⋯** menüsündeki **Fiyatı düzelt** ile açılır. Formda **tarih** (varsayılan bugün) ve **birim fiyat** (varlığın kendi para biriminde) → **Kaydet**. Fiyat o günün fiyatı olarak kaydedilir ve o gün için Yahoo / TEFAS / Binance fiyatından önce gelir; sonraki günlerde kaynak fiyatı yine kullanılır. 31 günden eski elle fiyat bayat sayılır.

## Açılış kuralı (çift sayım yok) {#acilis-kurali}

Açılış bakiyesi, açılış gününün **SONUNDAKİ** bakiyedir. Aynı hesap ve aynı varlık (ya da para birimi) için açılış tarihinde ve öncesinde kaydedilen işlemler bu bakiyeye **dahil** sayılır: adedi ikinci kez değiştirmez; yalnız maliyet ve gerçekleşen K/Z geçmişinde kullanılır. Sonraki günlerin işlemleri açılış bakiyesinin üstüne eklenir.

- Açılışta birim maliyet girdiyseniz o kullanılır.
- Girmediyseniz ve açılış öncesi işlemler adedi **tam** açıklıyorsa maliyet o işlemlerden hesaplanır; açıklamıyorsa maliyet "bilinmiyor" görünür ve bir uyarı çıkar (eksik geçmiş işlem olabilir).
- Bir hesap+varlık için tek açılış olur. Değiştirmek için eskisini **İptal et** ile iptal edip yenisini girin.
- **Açılış gününe tarihli işlem** (açılışı girdikten sonra): panel sorar — **Açılıştan SONRA yapıldı** derseniz bakiyeye eklenir; **Açılışa DAHİL** derseniz bakiye değişmez (açılışı girerken o işlem zaten yapılmıştı). **Vazgeç**, Esc ya da pencereyi kapatmak hiçbir şey kaydetmez.
- **Açılışı sonradan girerseniz** ve o gün o hesapta **Modeller › Bu ay › Uyguladım** ile yazılmış kayıt varsa panel sorar: **"Bu günün Tasarımcı kayıtları açılışa dahil mi, sonra mı?"** — **Açılışa DAHİL** derseniz o alım/satımlar açılış bakiyesinin içinde sayılır (çift sayım yok), **Açılıştan SONRA** derseniz bakiyeye eklenir. Cevap açılış kaydına yazılır ve **yalnız o açılışın kalemine** (o hesap + varlık ya da o hesabın nakdi) uygulanır; Tasarımcı kayıtları ve o gün daha önce girilmiş açılışların bakiyesi değişmez. Aynı gün ikinci bir açılış (ör. nakit) girerseniz soru o kalem için yeniden gelir. 61.0 ile yazılmış eski Uyguladım kayıtları için soru gelmez: onlar 61.0'daki gibi kendi "açılıştan sonra" işaretleriyle sayılır (karar Ö21 — geçmiş sonuç değişmez).
- **Açılış öncesi bir işlemin nakit bacağı** (ör. eski bir alışın parası) o hesapta nakit açılışı yoksa bakiyeye yazılırdı. Panel bunu kaydetmeden önce sorar: **Nakit açılışı ekle ve kaydet** aynı tarihe 0 tutarlı nakit açılışı ekler (önerilen); **Nakit açılışı olmadan kaydet** nakit bacağını bakiyeye yazar; **Vazgeç** / Esc / pencereyi kapatmak hiçbir şey kaydetmez.

## Sayı yazımı {#sayi-yazimi}

Ondalık için **virgül** kullanın: `0,125` · `1234,5` · `1.234,56` (nokta binlik). Tek noktadan sonra tam üç hane belirsizdir: `2.000` "2 mi, 2000 mi?" bilinemez — panel reddeder ve virgül ister (`2` ya da `2000` yazın). `0.125` ve `1.5` gibi yazımlar ondalık kabul edilir. Virgül ayraçlı CSV'de (`,`) nokta her zaman ondalıktır.

## İşlem defteri (Yatırım) {#islem-defteri}

![İşlem defteri › Yatırım](ekran:portfoyum-defter-1400)

Hesaplar'a girdiğin işlemlerin defteri **Portföy › İşlem defteri** sayfasında, üstteki kaynak seçicide **Yatırım (Portföyüm)** seçilince görünür; burada **açıktır** (başlıkta kayıt sayısı). Hesaplar'daki **İşlem defteri** düğmesi oraya götürür ve kaydırır.

Defter **üst çubukta seçili kişiye** göredir: yalnız o kişinin hesaplarındaki işlemler; **Hesap** seçicide yalnız onun hesapları. İki kişi arasındaki transfer ikisinin defterinde de görünür. **Tümü** bütün hesapları gösterir. CSV dışa aktarma da aynı kişi ve süzgeçle. Kripto / FX ve Bot kaynakları için: [İşlem defteri](#/kilavuz/islem-defterim).

### Grafikler {#defter-grafik}

![İşlem defteri › Yatırım — gerçekleşen kâr/zarar ve aylık sonuç](ekran:portfoyum-defter-grafik-1400)

Defterin üstünde dört kart, seçili kişinin (defterde bir hesap ya da tarih aralığı seçtiysen yalnız onun) işlemlerinden:

| Kart | Ne gösterir |
|---|---|
| **Gerçekleşen kâr / zarar** | Satışlardan doğan kâr/zarar: birikimli çizgi, aylık çubuk ve yıl × ay tablosu; kapanan satış sayısı, kazanan / kaybeden. Satış başına **FIFO** (ilk alınan ilk satılır), satış ücreti düşülmüş — toplam Varlıklar'daki gerçekleşen kâr/zararla aynıdır |
| **Varlığa göre sonuç** | Her varlığın gerçekleşen kâr/zararı, temettüsü, alış / satış sayısı ve tutarı; birden çok hesapta **hesaba göre** tablo |
| **Temettü ve faiz geliri** | Aylık gelir çubukları; vergi / stopaj sonrası net, otomatik mevduat faizi dahil |
| **Alış / satış / para hareketi** | Aylık alış ↔ satış hacmi, para yatırma ↔ çekme ve ücretler (komisyon + ücret / gider) |

Tutarlar üst çubuktaki **$** ya da **₺** ile, işlem gününün kuruyla çevrilir; **Gizli**'de rakamlar **•••**, grafikler bulanık. Başka kişinin hesabıyla yapılan nakit transferi o kişi için para girişi / çıkışıdır; aynı kişinin hesapları arasındaki transfer sayılmaz. Bu bilgisayar sunucudan okuyorsa ve sunucu daha eski sürümdeyse kartların yerinde "Sunucu 68.7'ye güncellenince grafikler görünür" yazar; defter yine çalışır.

### Kayıtlar {#defter-kayitlar}

Türler: açılış · alış · satış · temettü/kupon · faiz · para yatırma · para çekme · hesaplar arası transfer · bölünme · ücret.

- **Nakit transferde ulaşan tutar (62.1):** hesaplar arası para transferinde (ör. Midas → Binance: banka, kur ya da P2P masrafı) **Tutar** gönderilen, **Ulaşan tutar** hedef hesaba gerçekten geçen paradır. Aradaki fark masraf olarak portföyden düşer (dış para çıkışı sayılmaz). Boş bırakırsanız gönderilenle aynı kabul edilir.
Her tutar kendi para biriminde; alış ücreti maliyete eklenir, satış ücreti satış gelirinden düşer. Bölünme bütün hesaplarda adedi oranla çarpar, birim maliyeti böler.

- **Otomatik faiz (64.2):** mevduat faizi ayarı olan hesapta biten vadelerin faizi **otomatik** rozetiyle listelenir ([Mevduat faizi](#/kilavuz/portfoyum/mevduat-faizi)); İptal et ile silinen bir daha eklenmez.
- **Silme yok:** yanlış işlem **İptal et** ile ters kayıtla iptal edilir — satır üstü çizili kalır, hesaplara katılmaz. Doğrusunu yeniden girin.
- **Süzgeç** (hesap, tür, varlık, tarih, **durum**) ve **CSV dışa aktar** (aynı süzgeçle; Excel'de açılır). **Durum** varsayılan **Etkin**: iptal edilmiş (ters kayıtlı) işlemler gizlidir; **İptal edilmiş** yalnız onları, **Hepsi** ikisini gösterir.
- **Aynı gün sırası:** aynı gün birden çok işlem girdiyseniz hangisinin önce yapıldığını **Diğer işlemler › Aynı gün sırası (isteğe bağlı)** katında 0–999 arası bir sayıyla belirtebilirsiniz (küçük önce). Boş bırakırsanız varsayılan sıra kullanılır: önce para girişleri ve temettü/faiz, sonra alış, transfer, satış, ücret, çekme; açılış bakiyesi her zaman gün sonudur. Satışın parasıyla aynı gün alım yaptıysanız satışa **100**, alışa **300** yazın — yoksa alış önce sayılıp yersiz "nakit eksiye düştü" uyarısı çıkabilir. Defterde aynı güne birden çok işlem düştüğünde tarih yanında **2/3** gibi küçük bir rozet o işlemin o günkü sırasını gösterir.
- **CSV içe aktar:** önce **Önizle** — her satır ve bütün dosya mevcut kayıtlarla birlikte denetlenir (bilinmeyen hesap/varlık, negatif adet, kapalı hesap, para birimi). Hata yoksa **İçe aktar** hepsini tek seferde ekler; biri bile hatalıysa hiçbiri.
  Sütunlar: `tarih;islem;hesap;varlik;adet;fiyat;tutar;para;ucret;vergi;hedefHesap;oran;birimMaliyet;gunIciSira;acilisSonrasi;kaynakKayit;not` (hesap = hesap adı, varlık = sembol). Son üçü isteğe bağlıdır: aynı gün sırası (boş = varsayılan), açılış günündeki işlem açılıştan sonra mı (**1**) açılışa dahil mi (**0**), kaynak (**tasarimci** ya da boş = elle). Bu sütunları taşımayan eski dosyalar aynen okunur; panelin dışa aktardığı dosya geri yüklendiğinde sıra ve açılış anlamı korunur.
  Panelin dışa aktardığı dosyada `durum` = **iptal** olan satırlar içe aktarımda **atlanır**. Mevcut bir kayıtla (ya da dosyadaki başka satırla) aynı tarih, tür, hesap, varlık ve adet/tutarı taşıyan satır önizlemede **"mükerrer olabilir"** diye turuncu görünür — iki kez girmemek için kontrol edin.

### "Uyguladım" kayıtları (Tasarımcı) {#uyguladim}

Modeller sayfasındaki **Bu ay** kartının emir listesini aracı kurumda uygulayıp **Uyguladım** dediğinizde ([ayrıntı](#/kilavuz/tasarimci/uyguladim)) panel al/sat (ve 837 için hesaplar arası transfer) kayıtlarını **tek onayla** bu deftere yazar:

- Kayıtlar her elle girilen işlem gibidir; aynı denetimden geçer (bilinmeyen hesap, eksi adet, kapalı hesap, gelecek tarih) ve hepsi birlikte yazılır — biri hatalıysa hiçbiri. Defterde not alanında **"Tasarımcı 2026-10 m-qqq-m10 — listeye girdi"** gibi bir açıklama ve kaynak **tasarimci** görünür.
- Listede olup kayıtlarında bulunmayan hisse için **varlık kaydı** aynı pakette eklenir (sınıf hisse, fiyat kaynağı Yahoo; BIST hisseleri `.IS` koduyla).
- Aynı gün içinde gerçek sıra **önce satış, sonra aktarım, sonra alış**tır: panel kayıtlara aynı gün sırası yazar (satış 100, aktarım 200, alış 300), böylece satışın parası alıştan önce sayılır ve yersiz "nakit eksiye düştü" uyarısı çıkmaz. Elle aynı gün girdiğiniz işlemler kendi sıralarına göre araya girer.
- Açılış gününe tarihli uygulamada işlemler **açılıştan sonra** sayılır (bakiyeye eklenir). Açılışı uygulamadan **sonra** girerseniz panel dahil mi / sonra mı diye sorar ([Açılış kuralı](#/kilavuz/portfoyum/acilis-kurali)).
- Defterde her uygulama tek satırlık özetle görünür (**"Tasarımcı 2026-10 Nasdaq M10 — 10 kayıt (etkin)"**); **Geri al** ile tamamı iptal edilen paket, Durum süzgeci iptalleri gösterirken tabloda tek satıra iner (**Kayıtları göster** ile açılır).
- Hisse sizde başka yazımla kayıtlıysa (ör. "ASELS.IS") yeni varlık açılmaz; işlem sizin varlığınıza yazılır.
- Yanlışsa ya **Modeller › Bu ay › Geri al** (o uygulamanın bütün kayıtları ters kayıtla iptal edilir) ya da burada tek satırı **İptal et**; iptal edilen satır Bu ay listesinde yeniden açılır.
- **Modeller › Ayarlar › Portföyüm hedefini güncelle**, modellerin hedefini Portföyüm'e yeni hedef kaydı olarak yazar (kaynak "tasarimci …"); öncekiler geçmişte kalır.

## Hedef dağılım {#hedef}

**Hedef ve gerçek ne demek?** Hedef, paranın sınıflara (hisse, altın, kripto, TL…) nasıl bölünmesini istediğin orandır — ör. %40 hisse, %25 altın. Gerçek, bugünkü fiyatlarla paranın fiilen nasıl bölündüğüdür. Fiyatlar oynadıkça gerçek hedeften uzaklaşır; fark bandı aşınca alım-satımla hedefe geri getirmek (dengeleme) riskini istediğin seviyede tutar. Bu bir getiri hedefi değildir, ne kadar kazandığını ölçmez — onu Pano'daki getiri sayıları ve grafik gösterir.

Hedef [Hedefim](#/kilavuz/portfoy/hedefim) sayfasında seçilir ve kaydedilir; üst çubukta seçili kişinin hedefidir (Ben ve Fırat ayrı), **Tümü**'de girilmez. Hesaplar'da yalnız **Hedefi düzenle → Hedefim** bağlantısı vardır. Eski hedefler geçmişte saklanır.

Model portföylerin (Nasdaq M10, BIST M10, %50 QQQ + %50 Hücum) hedefini Portföyüm'e almanın **tek yolu Modeller › Ayarlar › Portföyüm hedefini güncelle**'dir (önizlemeli). Laboratuvar kararından içe alma 61.1'de kaldırıldı — Laboratuvar araştırma içindir, gerçek emir ve hedef yalnız Modeller sayfasından gelir.

Laboratuvarın eski **Olsaydı planı** sekmesi ve **Portföyüm'den doldur** düğmesi 67.5'te kaldırıldı. Gerçek portföyün al/sat planı **Portföy › Hedefim › Planla**'dadır; o planı geçmişte denemek için **Bu dağılımı geçmişte dene**.

## Telefonda {#telefonda}

Telefonda bütün tablolar kart olur; kayıt formları ve düğmeler (Yeni hesap, Varlık ekle, + işlem, Vadeli mevduat, Fiyat gir) gizlidir (sunucu da reddeder). Pano'nun telefon görünümü: [Portföy › Telefonda](#/kilavuz/portfoy/telefonda).

## Geliştirme bilgisayarında: kayıtlar sunucuda {#gelistirme-bilgisayari}

64.8'den beri Portföyüm kayıtlarının **tek yeri sunucudur**. Geliştirme bilgisayarı (sunucu bağlantısı kuruluysa) Portföy sayfalarını, Rapor'u ve kur çeviriciyi **sunucudan okur**:

- **Yazma jetonu kuruluysa** ([Kurulum › Adım 25](#/kilavuz/kurulum/adim-25)) orada girdiğin işlem, hesap, varlık, hedef ve CSV içe aktarımı **sunucuya gönderilir**; bant "Değişiklikler sunucuya gönderilir" der. Sunucu kapalıysa değişiklik **kuyrukta** bekler ve sunucu açılınca aynı sırayla gider; bekleyenler ve sunucunun kabul etmedikleri bandın altındaki **Kuyruk** bölümündedir (**Şimdi gönder**, **Kuyruktan çıkar**). Ayrıntı: [İşlem defterim › kuyruk](#/kilavuz/islem-defterim/ev-kuyruk) (ikisi aynı kuyruğu kullanır).
- Sunucu kapalıyken CSV **önizlemesi** ve **Fiyatları yenile** yapılamaz (sunucu açıkken yeniden deneyin); toplamlar ve grafikler hep sunucunun hesabıdır.
- **Yazma jetonu yoksa** kayıt formları gizlidir; bant nasıl açılacağını yazar.
- **Bir kezlik taşıma:** geliştirme bilgisayarında daha önce girilmiş Portföyüm kayıtları varsa Hesaplar'ın üstünde **"Bu bilgisayardaki Portföyüm kayıtlarını sunucuya taşı"** kartı çıkar. **Sunucuyla karşılaştır (kuru deneme)** hangi kaydın ekleneceğini, hangisinin sunucuda **zaten olduğunu** (aynı tür, tarih, hesap, varlık, adet, fiyat… — kimlik ve kayıt saati sayılmaz), hangisinin eklenemeyeceğini (ör. sunucuda o hesap ve varlık için farklı bir açılış var) ve iptal edilmiş olduğu için taşınmayacağını listeler. **Onayla** ile eklenecekler sunucuya gider (sunucu kapalıysa kuyruğa; sunucu o anda yeniden karşılaştırır, çift eklemez). Bu bilgisayardaki dosya **silinmez**, "taşındı" diye işaretlenir ve kart bir daha çıkmaz.
- Modeller sayfasındaki **Uyguladım**, uygulamayı geri alma ve hedef aktarımı Portföyüm kayıtlarına yazdığı için geliştirme bilgisayarında kapalıdır — sunucudaki panelden yapılır.

## Uyarılar ve ne yapmalı {#uyarilar}

- **"negatif adet" hatası:** elde olandan fazla satış/transfer. Eksik alış ya da açılış kaydını girin; geriye tarihli bir kayıt sonraki bir satışı eksiye düşürüyorsa da reddedilir.
- **"nakit eksiye düştü" uyarısı:** para yatırma ya da nakit açılışı eksik olabilir (kayıt yine yapılır). Aynı gün bir satışın parasıyla alım yaptıysanız **Aynı gün sırası** ile satışı öne alın (satış 100, alış 300).
- **"fiyat yok" / "bayat":** **Fiyatları yenile**; kaynağı olmayan varlık için satırdaki **Fiyat gir** ([Elle fiyat](#/kilavuz/portfoyum/elle-fiyat); 31 günden eski elle fiyat bayat sayılır).
- **"Yahoo/TEFAS/Binance fiyatı yok — işlem fiyatı kullanılıyor":** otomatik kaynakta veri yok ya da eski; değer son alış/satış fiyatıyla hesaplanıyor. **Fiyatları yenile** ya da varlığın kaynak kodunu düzeltin (ör. BIST için `THYAO.IS`).
- **"para birimi uyuşmazlığı: kaynak fiyatı KULLANILMIYOR":** kaynağın fiyatı başka para biriminde (ör. EUR kotasyonlu sembol, USD varlık). Yanlış birimde değer üretmemek için o fiyat kullanılmaz; varlığı doğru para birimiyle yeniden ekleyin.
- **"… kuru yok — toplama katılmadı" / "Kur bayat":** o para birimindeki tutarlar USD/TL toplamına girmez ya da kur 5 günden eski; **Fiyatları yenile**. Kur serisinin başladığı günden önceki günler için sonraki bir kur KULLANILMAZ.
- **"Yahoo'da … bölünmesi var ama bölünme kaydı yok":** adet ve maliyet yanlış olabilir; o tarihli **Bölünme** işlemini girin.
- **"kapalı hesap":** kapanış tarihinden sonra işlem girilemez. Hesap silinmez, geçmişi görünür; yanlışlıkla kapattıysanız kapanış kaydı ters kayıtla iptal edilebilir.
- **Getiri neden değer grafiğinden farklı?** Değer çizgisi para yatırma/çekmeyi içerir; getiri (TWR) içermez. Pano grafiğinde **Getiri %** görünümü getiriyi, **Değer + yatırılan** değeri gösterir.
