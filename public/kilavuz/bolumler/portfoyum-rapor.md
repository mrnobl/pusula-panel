# Portföy › Rapor {#portfoyum-rapor}

**Portföy › Rapor** gerçek portföyünün (üst çubukta seçili portföy: Ben, Anıl … ya da Tümü — [Görünüm](#/kilavuz/portfoy/gorunum)) risk ölçütleri ve ay ay karnesidir. Üstte **risk ve getiri ölçütleri** portföyü QQQ ve BTC ile aynı dönemde karşılaştırır; altında karne: o ay ne oldu, para mı koydun yoksa piyasa mı kazandırdı, hangi varlık sürükledi, kötü bir günde ne kaybederdin ve varlık sınıfların birlikte mi hareket ediyor. Yalnız bakılır; hiçbir şeyi değiştirmez. Telefondan da aynı görünür. Telegram'a gitmez.

## Ne işe yarar {#ne-ise-yarar}

- **Risk ve getiri ölçütleri:** oynaklık, Sharpe, Sortino, Calmar, düşüş süresi, Ulcer, kazanan ay oranı, QQQ'ya göre yukarı/aşağı yakalama, yoğunlaşma, boşta nakit, ücret oranı, kur etkisi, gelecek gelir ([Ölçütler](#/kilavuz/portfoyum-rapor/olcutler)).
- **Ay sonu muhasebesi:** ay başı değer + para girişi/çıkışı + piyasa etkisi = ay sonu değer. Toplamın neden değiştiğini tek satırda görürsün.
- **İki getiri yan yana:** *zaman ağırlıklı* (yatırımların ne kadar iyi gitti) ve *para ağırlıklı* (senin paran ne kazandı — ne zaman ne kadar koyduğun da hesaba girer).
- **Enflasyon hariç TL getirisi:** TL'de kazandığın, o ayın TÜFE'si çıkarılınca gerçekte ne ediyor.
- **Kötü senaryolar:** BTC −%50, Nasdaq −%30, altın −%20, dolar/TL +%30 ve "2022 tekrarı" bugünkü portföyüne ne yapardı — iki yöntemle.
- **Korelasyon:** sınıfların (hisse, altın, kripto, TL…) son bir yılda birlikte mi inip çıktığı — çeşitlendirmenin gerçekten işe yarayıp yaramadığı.

## Ne zaman kullanılır {#ne-zaman}

- **Her ayın başında** (önceki ay kapanınca): ekran varsayılan olarak **son biten ayı** açar.
- Büyük bir alım/satımdan ya da para yatırmadan sonra, "bu ay kâr mı ettim yoksa sadece para mı koydum?" sorusunda.
- Hedef dağılımını değiştirmeden önce: kötü senaryo tablosu hangi kalemin seni en çok vuracağını gösterir.
- TÜİK ayın enflasyonunu her ayın 3'ünde açıklar; "TL, enflasyon hariç" kutusu o gün dolar.

## Ekran {#ekran}

![Portföy › Rapor — risk ve getiri ölçütleri](ekran:rapor-olcut-1400)

En üstte **Risk ve getiri ölçütleri** kartı ([Ölçütler](#/kilavuz/portfoyum-rapor/olcutler)). Altında karne:

![Rapor — ay, getiriler, etkileyenler, kötü senaryolar, korelasyon](ekran:portfoyum-rapor-1400)

1. **Ay** ve **Hesap** seçimi: son biten ay varsayılan; listede **"… — bu ay (devam ediyor)"** de vardır (bugüne kadar). Hesap seçersen her şey yalnız o hesap için hesaplanır (hesaplar arası aktarım o hesap için para girişi/çıkışı sayılır). **Yenile** yeniden hesaplar.
2. **Seçili ayın altı kutusu** (dolar): ay başı → ay sonu değer · para girişi/çıkışı · piyasa etkisi · zaman ağırlıklı getiri · para ağırlıklı getiri · TL, enflasyon hariç.
3. **Başlangıçtan:** para ağırlıklı getiri (1 yıl dolduysa yıllığı da), karşılaştırma için zaman ağırlıklı getiri ve TL, enflasyon hariç getiri.
4. **En çok etkileyenler:** ayın kazandıranları ve kaybettirenleri, her birinin dolar katkısı ve kendi fiyat getirisi.
5. **Kötü senaryolar** tablosu: senaryo · **Doğrudan pay** · **Geçmiş ilişkiyle (beta)** · çubuk (üstteki doğrudan pay, alttaki soluk olan beta; portföyün yüzdesi). Altında iki not: hangi senaryonun hangi kalemi vurduğu ve beta yönteminin sınırı.
6. **Korelasyon** ısı tablosu: sınıf × sınıf; yeşil artı (birlikte hareket), kırmızı eksi (ters hareket); koyuluk büyüklüğü gösterir.

Üst çubuktaki **Gizli** burada da tutarları gizler; **$ / ₺** seçimi ölçüt kartının birimini belirler.

![Rapor telefonda](ekran:portfoyum-rapor-390)

## Risk ve getiri ölçütleri {#olcutler}

Kart seçili portföy için ve seçili birimde ($ / ₺) hesaplanır; **QQQ** ve **BTC** sütunları aynı dönemin al-tut sonucudur.

| Ölçüt | Ne söyler |
|---|---|
| **Toplam getiri (TWR)** | Para giriş/çıkışından bağımsız getiri |
| **Yıllık getiri** | Seri en az 90 gün olunca yıllığa çevrilir |
| **Oynaklık (yıllık)** | Günlük getirilerin ne kadar sallandığı |
| **Sharpe · Sortino · Calmar** | Getiri ÷ toplam oynaklık (risksiz faiz 0) · getiri ÷ yalnız aşağı yönlü oynaklık · yıllık getiri ÷ en derin düşüş |
| **En derin düşüş · En uzun düşüş** | Tepeden dibe en büyük kayıp · tepeye dönmeden geçen en uzun süre |
| **Ulcer endeksi** | Düşüşlerin derinliği × süresi; küçük olması iyi |
| **Kazanan ay oranı · En iyi / kötü ay** | Tam ayların kaçı artıda kapandı; aylık tutarlılık |
| **Yukarı / aşağı yakalama (QQQ)** | QQQ yükselirken ve düşerken onun ne kadarını aldın (1'den büyük yukarı yakalama iyi, 1'den küçük aşağı yakalama iyi) |
| **Yoğunlaşma** | En büyük 3 varlığın payı · HHI (0'a yakın = dağınık, 1 = tek varlık) |
| **Boşta nakit** | Faizsiz nakdin portföye oranı |
| **Ücret / gider oranı** | Son 365 günün ücret + komisyonu ÷ portföy |
| **Kur etkisi** | TL getirisi − USD getirisi (başlangıçtan) — getirinin ne kadarı kurdan |
| **Gelecek gelir** | Sıradaki mevduat vadeleri |

Seri kısaysa ölçüt "—" yazar ve kartın altında nedeni yazar (ör. Sharpe ve oynaklık için en az 30 günlük seri gerekir).

## Alanlar {#alanlar}

| Alan | Ne demek |
|---|---|
| **Ay başı → ay sonu** | Önceki ayın son günü kapanıştaki toplam değer → bu ayın son günü (devam eden ayda bugün). Altında fark. Hepsi dolar; o günün fiyatı ve kuruyla. |
| **Para girişi / çıkışı** | Ay içinde dışarıdan koyduğun (+) ya da çektiğin (−) para; o ay girilen açılış bakiyesi de giriş sayılır. Alış, satış, temettü, faiz giriş değildir (para portföyün içinde yer değiştirir). |
| **Piyasa etkisi** | Fark − para girişi/çıkışı. Fiyat ve kur hareketi, temettü, faiz, ücretlerin toplamı. Ay başı + giriş + piyasa etkisi her zaman ay sonuna eşittir. |
| **Zaman ağırlıklı getiri** | Para yatırıp çekmenden etkilenmeyen getiri — "yatırımlarım ne kadar iyi gitti?". Fon yöneticileri bununla ölçülür; Pano'daki getiri sayıları da budur. |
| **Para ağırlıklı getiri** | Senin paranın getirisi (iç verim oranı): ne zaman ne kadar para koyduğun da hesaba girer. Düşüşten hemen önce büyük para koyduysan bu sayı zaman ağırlıklıdan kötü çıkar, dipte koyduysan iyi. Ay için **yıllığa çevrilmez** (o ayın kendi getirisidir). |
| **TL, enflasyon hariç** | TL zaman ağırlıklı getiri, o ayın TÜFE artışı çıkarılarak: (1 + TL getiri) ÷ (1 + aylık enflasyon) − 1. Kullanılan TÜFE ayı yazar. Portföy ay ortasında başladıysa enflasyon başlangıç gününden ay sonuna ara değerle hesaplanır (Başlangıçtan ile aynı yöntem). Ay bitmediyse ya da TÜİK henüz açıklamadıysa sayı yazılmaz, nedeni yazar (tahmin yapılmaz). |
| **Başlangıçtan — para ağırlıklı** | İlk kayıttan bugüne iç verim oranı (dönem getirisi). 365 gün dolduysa yıllığı da yazar; dolmadıysa "1 yıl dolmadı, yıllığa çevrilmedi". |
| **Başlangıçtan — TL, enflasyon hariç** | İlk kayıttan son yayımlanmış TÜFE ayının sonuna kadar TL getiri ÷ aynı dönemin enflasyonu. |
| **Katkı** | Kalemin ay sonu değeri − ay başı değeri − o ay ona koyduğun net para (alış +, satış −). Alış ücreti o kalemin katkısından düşer, temettü o kaleme yazılır. "TL nakit" / "Dolar nakit" satırı faiz, ücret ve kur etkisidir. Katkıların toplamı piyasa etkisidir. |
| **Kendi getirisi** | Kalemin o ayki dolar fiyat değişimi (ne kadar tuttuğundan bağımsız). |
| **Doğrudan pay** | Senaryonun vurduğu kalemler şok kadar düşer, gerisi yerinde kalır: **BTC −%50** → kripto sınıfı · **Nasdaq −%30** → dolar cinsi hisse ve endeks fonları (TEFAS fonları kayıtta "yabancı hisse" diye ayrılmadığı için dahil değil) · **Altın −%20** → altın/emtia sınıfı (gram altın dahil) · **Dolar/TL +%30** → TL cinsi her kalemin dolar değeri 1,3'e bölünür (−%23,1). Dolar/TL satırında **TL** etkisi de yazar: dolarla yaşayan kalemlerin TL değeri %30 artar. |
| **Geçmiş ilişkiyle (beta)** | Son 52 haftada kalemin haftalık dolar getirisi faktörle (BTC, QQQ, GLD, TL'nin dolar değeri) birlikte ne kadar oynadı: beta 1,5 = faktör %10 düşünce kalem ortalama %15 düşmüş. Kayıp = değer × beta × şok. Faktörün kendisi (BTC'nin kendisi, QQQ, GLD, TL nakit) tam şoku alır. İlişkisi istatistiksel olarak zayıf (tesadüf olabilecek) kalem hücrenin altında **"zayıf ilişki"** diye yazılır; BTC, Nasdaq ve altın senaryolarında kaybı yine sayılır (kayıp az gösterilmesin), yalnız **Dolar/TL**'de 0 sayılır — dolar/TL haftalık çok az oynadığı için zayıf bir ilişki %30 şokla çarpılınca saçma kâr/zarar çıkar. 26 haftadan kısa geçmişi olan kalem hesaplanmaz ve üstte uyarı çıkar. |
| **2022 tekrarı** | Her kalem kendi 2022 dolar getirisini yaşar (31.12.2021 → 31.12.2022). 2022 fiyatı olmayan kalem için sınıfının **vekili** kullanılır (kripto → BTC, dolar hisse/ETF → QQQ, BIST hissesi → BIST 30, altın → GLD, TL cinsi diğerleri → TL'nin dolar değeri) ve satırda "vekil" yazar. Bu satırda beta yoktur ("—"). **Sınırları:** vekil TL'nin dolar değeri olduğundan TL mevduat/nakit 2022'de aldığı faizi almaz (kaybı olduğundan fazla gösterir); dolar cinsi tahvil ve dolar nakit %0 sayılır (2022'deki tahvil kaybı görünmez). |
| **Korelasyon** | Son 1 yılın haftalık dolar getirilerinde iki sınıfın birlikte hareketi, −1 ile +1 arası. Sınıfın haftalık getirisi içindeki varlıkların bugünkü ağırlıklarıyla ortalamasıdır. **1'e yakın:** birlikte inip çıkar (çeşitlendirme yok); **0:** ilgisiz; **eksi:** biri düşerken öbürü tutar. "veri az" = 26 haftadan az ortak veri; "—" = getirisi hiç oynamayan sınıf (dolar nakit). |

## Uyarılar ve ne yapmalı {#uyarilar}

- **"zayıf ilişki"**: o kalemin faktörle geçmiş ilişkisi tesadüf olabilecek kadar zayıf; beta kaybı belirsizdir. Doğrudan pay sütununa da bakın.
- **Beta tahmin değildir.** Geçmiş bir yılın ortalama ilişkisidir; büyük çöküşlerde ilişkiler değişir (krizde neredeyse her şey birlikte düşer). İki yöntemi birlikte oku: doğrudan pay "yalnız vurulan kalem düşerse", beta "geçmişteki gibi birlikte düşerse".
- **"Geçmiş fiyatı 26 haftadan kısa"** uyarısı: o kalemin fiyat geçmişi diskte yok ya da kısa. **Fiyatları yenile** Yahoo/TEFAS geçmişini indirir (kıyas için QQQ ve GLD de indirilir). Yeni halka arz gibi gerçekten kısa geçmişli kalemde uyarı kalır.
- **"Bu ayın bazı günlerinde bir kalemin fiyatı ya da kuru yoktu"**: o kalem o gün toplama girmedi; rakamlar eksik olabilir. Fiyatları yenile; kaynağı olmayan kalem için elle fiyat gir.
- **Değerlenemeyen kalem** varsa katkı tablosunun altında "değerlenemeyen kalemler" farkı yazar (katkılar o kadar piyasa etkisinden ayrılır).
- **TÜFE yayımlanmadı:** ayın enflasyonunu TÜİK ertesi ayın 3'ünde açıklar; o güne kadar "TL, enflasyon hariç" boş kalır. Sunucu TÜFE dosyasını veri güncellemesiyle tazeler.
- **Para ağırlıklı getiri zaman ağırlıklıdan çok farklı:** hata değildir — büyük para girişinin zamanlaması etkiler. Hangisinin "doğru" olduğu sorduğun soruya bağlı (yukarıdaki Alanlar tablosu).
- **Mevduat faizi** otomatik eklendiyse (Hesaplar › hesap kartı › Vadeli mevduat) faiz "TL nakit" katkısında ve piyasa etkisinde görünür, para girişi sayılmaz ([Mevduat faizi](#/kilavuz/portfoyum/mevduat-faizi)).
