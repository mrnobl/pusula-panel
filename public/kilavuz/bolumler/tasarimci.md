# Bu ay kartı ve strateji karışımı {#tasarimci}

**Portföy › Modeller** sayfasındaki **Bu ay** kartı ve **Araştırma › Portföy laboratuvarı › Strateji karışımı** (eski adı "Tasarımcı"), ölçülmüş stratejileri tek yerde toplar ve "bugünden itibaren" takip edilen üç **model portföyün** bu ayki kararlarını gösterir. Model portföyler: **Simurg** · %50 QQQ + %50 Kairos (deneme 837), **Nova** · Nasdaq Momentum 10 (deneme 830) ve **Lydia** · BIST Momentum 10 (deneme 840). Kuralları 2026-10-10'da donduruldu (`kayitlar/tasarim/t1-s1.json`); 2026-10-11'de, ilk ileri günden önce, Simurg'un dengelemesi bant kuralına alındı (sürüm 2, `t1-s2.json`). İlk uygulama günü **2026-10-12**.

> **Uyarı:** İleri dönem kısa; kabuller sonradan konmuş ölçütle (H1) verildi; en az 12–24 ay görmeden yorum yok. Bu not Modeller sayfasının altında ve Laboratuvar › Strateji karışımı'nın başında durur.

## Bu ay kartı {#bu-ay}

![Bu ay kartı — Modeller, Nova seçili](ekran:buay-1400)

**Portföy › Modeller** sayfasında seçili modelin (Nova, Lydia, Simurg) sayılarının hemen altında **Bu ay** kartı durur: modelin bu ayki kararını **kendi hesabına** uygulamak için girmen gereken emirler. Gerçek portföye emir listesi ve **Uyguladım** yalnız buradadır (Laboratuvar yalnız araştırmadır); istersen aynı işlemleri Hesaplar'daki "+ işlem" ile tek tek de girebilirsin. Sekmenin adında açık iş sayısı yazar (ör. "10 iş"). **Telefondan** emir listesi görülür ama **Uyguladım** yapılamaz (telefon yalnız izler ve acil durdurur — bilinçli): Midas'ta emirleri telefondan girebilirsiniz, Uyguladım'ı sunucunun başına dönünce işaretleyin.

Kartta: başlıkta ay, durum rozeti ve **bu ay yapılacak iş** ("yapılacak: 3 emir — aracı kurumda girin, sonra Uyguladım", "yapılacak: model sermayesini girin", "bu ay tamam", "bu ay işlem gerekmiyor"); karar günü, model sermayesi, hesap; uyarılar (turuncu); emir tablosu; **Uyguladım…** / **Bu ay atla…**. Kararın künyesi (doğrulama, üyelik, hedef liste, Simurg bant bilgisi) ve bilgi notları kartın içinde katlı **"Ayrıntı"**dadır.

Modeller sayfasının altında (hangi model seçili olursa olsun) ortak olarak: hesap eksikse açılış rehberi ya da "açık hesap yok" notu, katlı **Ayarlar** (her modele ayırdığın sermaye, kesirli hisse, en küçük işlem, tutarları telefonda gizleme ve Portföyüm hedefi — [aşağıda](#/kilavuz/tasarimci/sermaye); hiç sermaye girilmemişse açık gelir) ve katlı Ayrıntılı izleme.

Kartın içinde (ve katlı Ayrıntı'da) kararın bilgileri:

- **Karar:** ayın son işlem günü kapanışı → ertesi işlem günü açılışı. ABD kararı Türkiye saatiyle gece çıkar; emir ertesi gün ABD açılışında girilir: 17:30 (1 Kasım 2026 – 14 Mart 2027 kış saati), sonra 16:30. BIST açılışı 10:00.
- **Emir listesi ve Midas komisyonu (61.6):** ABD'de emir başına 1,5 $, BIST'te komisyon yok. Liste her satırın tahmini komisyonunu nakit hesabına katar ve "Tahmini komisyon" satırı yazar; **Uyguladım** formunda ücret alanı bu tutarla dolu gelir (gerçek ücret farklıysa düzeltin). Alışa sermayenin tamamı ayrılmaz: %0,5 açılış tamponu + komisyon payı nakitte kalır (liste cuma kapanışıyla hesaplanır, emir pazartesi açılışta girilir). Listede kalan bir hissede küçük ağırlık düzeltmesi (fark < sermayenin %2'si) önerilmez. **Kesirli hisse** ayarı yalnız ABD hisselerini etkiler; BIST her zaman tam adet.
- **Sermaye başlangıç günü (61.6):** Modeller sayfasının altındaki Ayarlar'da bir modelin sermayesini girdiğiniz/değiştirdiğiniz gün o modelin başlangıç günü olur: girilen tutar = o gün modele ayırdığınız para; hedef tutar sonra modelin getirisiyle büyür. Yeni bir ay geldiğinde eski ayın listesi "süresi geçti" olur ve uygulanamaz. Uygulama günü geçtiği hâlde emirler girilmediyse Ana sayfa Yapılacaklar'da uyarı çıkar (3 gün sonra kırmızı).
- **Nova ve Lydia listeleri:** 10 hisse, her biri %10. Liste karar anında dondurulur, sonradan değişmez.
- **Eksik veri** uyarısı: bir hissenin fiyatı yoksa listede yazar (o pay nakitte kalır).
- **Simurg:** çekirdek QQQ %50 + uydu Kairos %50. **Bant kuralı:** Kairos payı %40–%60 aralığında kaldıkça hiçbir şey yapılmaz; her QQQ işlem günü kapanışında denetlenir, dışına çıkınca AYNI kapanışta tam 50/50'ye dönülür (hafta sonu aktarım yok; gerçek hesapta o gün kapanışa yakın ya da en geç ertesi açılışta uygulayın) (hesaplar arası aktarım %0,1 + kayma %0,05). 2018–2026 ölçümünde bu 13 aktarım demek (aylık kuralda 105); Sharpe ve düşüş aylıkla eşit (deneme 851, kural dosyası `kayitlar/tasarim/t1-s2.json`). İlk yerleşimden önce "Kairos payı ilk yerleşimden sonra hesaplanır" yazar. Son dengeleme olduysa önceki ağırlıklar ve aktarılan pay yazar.
- **Model portföy:** "uygulama günü açılışında sanal olarak uygulanacak / uygulandı". Bu, **sanal model portföy** içindir — gerçek hesabınıza emir gitmez.
- Model sermayesi girilmemişse kartın içinde **satır içi sermaye kutusu** çıkar; tutarı yazıp **Sermayeyi kaydet** ile emir listesi hemen hesaplanır.

### Gerçek portföy emir listesi {#emirler}

![Bu ay — gerçek portföy emir listesi](ekran:buay-emir-1400)

Kartın alt kısmında, [Portföyüm](#/kilavuz/portfoyum)'deki **gerçek adetlerinizi** bu ayın hedefine götüren emirler bir tabloda durur:

| Sütun | Anlamı |
|---|---|
| Hesap | Portföyüm'deki hesap (ABD aracı kurum, BIST aracı kurum, Binance). Aynı türden birden çok hesap varsa ilki seçilir; **Model sermayesi** formundan değiştirilir |
| Sembol · Yön | **SAT** önce, **AL** sonra; Simurg'da gerekirse **AKTAR** (hesaplar arası para aktarımı) satırı |
| Adet | **Tam adet** — kesirli hisse alınmaz. Önce her hisse için ⌊hedef tutar ÷ tahmini fiyat⌋; sonra **en büyük kalan yuvarlaması**: kalan nakitle, kesir payı en büyük hisselerden başlayarak birer adet daha alınır (nakdi aşmadan). Ek adet alan hisselerin "Neden" sütununda "+1 adet (en büyük kalan yuvarlaması)" yazar; geriye kalan küçük tutar nakitte kalır ("Tam adet alındığı için … nakitte kalır" uyarısı). Yuvarlama yalnız gerçek uygulamayı etkiler; model portföy değişmez |
| Tahmini fiyat | Son kapanış (Yahoo). Gerçekleşen fiyat farklı olur; Uyguladım formunda düzeltirsiniz |
| Tutar | Adet × tahmini fiyat (modelin para biriminde: Nova ve Simurg dolar, Lydia TL) |
| Neden | **listeden çıktı** (tamamını sat) · **listeye girdi** · **listede kaldı — %10 ağırlığa dengeleme** · **ilk yerleşim** · Simurg'da **bant aşıldı** |

- **Hedef tutar = hedef tabanı × ağırlık.** Nova ve Lydia'da hedef tabanı = **model sermayesi × (model endeksi ÷ 100)**: model kazandıkça taban büyür (kazanç yeniden yatırılır), kaybettikçe küçülür. Kartta "10.000 $ → hedef tabanı 10.300 $ (endeks 103,0)" gibi yazar; Tasarımcı kartındaki tutarla aynı tanımdır. Gerçek pozisyonlarınızın değeri bundan %5'ten fazla saparsa ayrı bir uyarı satırı çıkar (uygulama farkı).
- Modelin pozisyonu, hedef hesaptaki **listedeki ve önceki listedeki** hisselerdir (önceki = önceki karar + daha önce "Uyguladım"la kaydedilenler); hesaptaki diğer varlıklara (ör. GLD) dokunulmaz. Hisse Portföyüm'de "ASELS.IS" gibi başka bir yazımla kayıtlıysa da (aynı para birimi, sembol ya da Yahoo kodu) aynı hisse sayılır.
- **Ay içinde hedef donar:** ayın ilk "Uyguladım"ında o ayın hedef adetleri ve tahmini fiyatları dondurulur; sonraki fiyat oynamaları yeni satır açmaz. Bütün uygulamalar geri alınırsa dondurma da düşer.
- Son kapanışı **3 işlem gününden eski** hisse için "Bayat fiyat" uyarısı çıkar; adetleri aracı kurumdaki güncel fiyatla kontrol edin.
- **Simurg:** Binance hesabının tamamı Kairos kolu sayılır (bot kendi işini yapar). Kairos payı = Binance ÷ (QQQ + Binance). Bant içindeyse "bu ay QQQ işlemi ve aktarım YOK" yazar; dışındaysa güncel toplamın tam 50/50'si için QQQ al/sat ve **aktarım satırı** çıkar. **İlk yerleşim** (bu model için Portföyüm'de hiç iptal edilmemiş "Uyguladım" kaydı yokken) sermaye esas alınır: QQQ hedefi sermayenin %50'si, ABD → Binance aktarımı sermayenin %50'si. Binance hesabında önceden duran para modele **sayılmaz**; liste "Binance'te … $ var — modele dahil edilsin mi" diye yazar — dahil etmek için Uyguladım formunda aktarım tutarını azaltın ya da aktarımı uygulamayın. Bant dışındayken Simurg'un güncel toplamı girilen sermayeden %10'dan fazla farklıysa uyarı çıkar.
- Bir modelin bütün satırları aynı nedenle uygulanamıyorsa (ör. o türden hesap yok) neden tablonun üstünde **bir kez** yazar; satırlarda yalnız "uygulanamaz" görünür.
- **Binance → ABD aktarımı** Binance'teki USD nakdinden çıkar: nakit yetmiyorsa satır **uygulanamaz** görünür — önce Kairos kolundaki kripto satışını Portföyüm'e "Satış" olarak girin, sonra aktarımı kaydedin.
- **En küçük işlem** (varsayılan 10 $) altındaki farklar emir yazılmaz, "Eşik altı" notunda görünür.
- Nakit yetmiyorsa "nakit yetersiz" uyarısı çıkar: önce para yatırın ya da aktarın ve Portföyüm'e **Para yatırma** kaydı girin. Aynı ABD hesabını iki model (Nova ve Simurg) kullanıyorsa açık emirleri **birlikte** de denetlenir ("… BİRLİKTE nakdi …'ye düşürür").

### Uyguladım {#uyguladim}

![Uyguladım formu ve önizleme](ekran:buay-uygula-1400)

Emirleri aracı kurumda (Midas) girdikten sonra **Uyguladım…**:

1. Satırlar listeden **önceden dolu** gelir. Gerçekleşen **adet, fiyat, ücret** ve **işlem tarihini** düzeltin; uygulamadığınız satırın işaretini kaldırın (o satır listede açık kalır, sonra ayrıca uygulanır — **kısmi uygulama**). Bir emir **daha az adetle** dolduysa gerçekleşen adedi yazın: kalan adet listede **yeni bir satır** olarak açık kalır.
   İşlem tarihi bu ayın **uygulama gününden önce**, **bugünden sonra** ya da hesabın **açılışından önce** olamaz (panel reddeder).
2. **Önizle:** kayıtlar Portföyüm'ün denetiminden geçer (bilinmeyen hesap, eksi adet, kapalı hesap…), henüz **yazılmaz**. Yeni hisseler için varlık kaydı da önizlemede görünür. Önizlemenin başında **toplam alış · satış · ücret** ve her hesap için **nakit önce → sonra** satırı durur. Nakit eksiye düşüyorsa onay düğmesi gri **"Nakit eksiye düşse de yaz"** olur: önce Portföyüm'e para yatırma ya da satış kaydı girmeniz önerilir, yine de yazabilirsiniz.
3. **Onayla — … kaydı Portföyüm'e yaz:** hepsi **tek seferde** yazılır (biri hatalıysa hiçbiri). Kayıtlar Portföyüm'de "tasarimci" kaynağıyla görünür. Önizlemeden sonra bir rakamı değiştirirseniz Onayla düşer; yeniden önizleyin.

- Aynı satırı ikinci kez kaydetmek reddedilir (**"zaten uygulandı"**); aynı satır bir formda iki kez de gönderilemez. Uygulanan satırlar tabloda Portföyüm'e **kaydedilen** adet ve fiyatla "uygulandı ✓" yazar; model rozeti **kısmen uygulandı** / **uygulandı — Portföyüm'de** olur.
- **Geri al…** → **Ters kaydı yaz:** o uygulamanın bütün işlemleri Portföyüm'de ters kayıtla iptal edilir (kayıt silinmez, "iptal" görünür); satırlar yeniden açılır. Portföyüm'den tek bir işlemi iptal ederseniz yalnız o satır açılır.
- **Bu ay atla…:** nedenini yazıp o modeli bu ay uygulamazsınız (ör. aktarım yapılamadı). Uygulanmış kaydı olan modelde atlanamaz; **Atlamayı kaldır** ile geri alınır.

### Model sermayesi ve Portföyüm hedefi {#sermaye}

![Model sermayesi ve Portföyüm hedefi](ekran:buay-sermaye-1400)

Bu bölüm Bu ay ekranındaki katlı **Ayarlar** başlığının içindedir.

- **Model sermayesi:** her modele ayırdığınız gerçek tutar (Simurg ve Nova dolar, Lydia TL; ör. 30000 ya da 30.000). Yalnız bu bilgisayarda saklanır (`data\tasarimci\sermaye.json`); git'e, Telegram'a ve kayıtlara gitmez. Üstel yazım (1e9) kabul edilmez. Önceki değerin **10 katından büyük** ya da **onda birinden küçük** bir tutar ve kutuyu **boşaltmak** (sermayeyi silmek) onay sorar — yazım hatasına karşı. Aynı formda: **en küçük işlem** tutarı, **kesirli hisse** ayarı (Midas'ta kesirli alım doğrulanırsa açın; açıkken adet 6 haneye kadar kesirli olur) ve **tutarları telefonda gizle**.
- **Portföyüm hedefini güncelle:** modellerin hedefini sermayeleriyle ağırlıklı olarak Portföyüm › Hedef dağılım'a kaydeder (**Sınıf düzeyi**: hisse / ETF / kripto; **Varlık düzeyi**: her hisse ayrı, Kairos kolu Binance hesabının içeriğine göre). Önce **Önizle**, sonra **Onayla**. Önizleme TL sermayenin hangi kurla dolara çevrildiğini de yazar ("Lydia 300.000 ₺ ≈ 6.090 $ (USD/TRY 49,26, tarih)"). Hedef yalnız model kalemlerini kapsar; Portföyüm'deki diğer varlıklar hedef dışı görünür. Portföyüm hedefine modelden içe alma **yalnız buradan** yapılır.

### Portföyüm boşsa {#acilis-rehberi}

Portföyüm'de hiç hesap yoksa emir listesi yerine **açılış rehberi** çıkar: kurumlar (Midas, Binance) → hesaplar (ABD aracı kurum USD, BIST aracı kurum TRY, Binance USD) → açılış bakiyeleri → model sermayesi → Uyguladım. Her adımın yanındaki düğme ilgili yere götürür (**Kurum ekle**, **Hesap aç**, **Açılış bakiyesi gir** → Portföyüm; **Sermaye gir** → Ayarlar'daki sermaye formu). Bir hesap türü eksikse o modelin satırları "hesabı yok" uyarısıyla **uygulanamaz** görünür.

Bütün yazma düğmeleri (Uyguladım, atla, geri al, sermaye, hedef) **yalnız bu bilgisayardaki panelde** görünür; telefonda gizlidir ve sunucu da reddeder. Telefonda liste okunur; tutarlar Portföyüm'le aynı kuralla görünür ("tutarları telefonda gizle" işaretliyse gizlenir).

## Tasarımcı (laboratuvar) {#ekran}

![Strateji karışımı — laboratuvarın ilk sekmesi](ekran:tasarimci-1400)

Strateji karışımı bir araştırma aracıdır: **Araştırma › Portföy laboratuvarı** ile açılır (Laboratuvar'ın ilk sekmesi; adres `#/arastirma/laboratuvar/tasarimci`). Ölçülmüş stratejileri **kol düzeyinde** birleştirip dener: strateji kataloğu, kurucu, kayıtlı tasarımlar ve risk özeti.

Takip edilen üç modelin kartları ve karar takvimi burada **gösterilmez**: modellerin endeksi, getirisi, son kararı ve sıradaki karar günü (modelin başlığında ve Bu ay kartında) [Modeller](#/kilavuz/model-portfoy)'de.

### Strateji kataloğu {#katalog}

![Strateji kataloğu](ekran:tasarimci-katalog-1400)

Her kart bir ölçülmüş strateji ya da kıyas: sade açıklama, **künye** (geliştirme / holdout / tüm dönem CAGR, en büyük düşüş, P = kıyastan iyi olma olasılığı), aynı dönemin kıyası, PLAN belgesi ve deneme no, hesap türü, dengeleme, kırılganlık uyarıları. Rakamlar ölçülmez; PLAN belgelerinin SONUÇ tablolarından birebir alınır (bir test her rakamı PLAN satırıyla karşılaştırır).

| Rozet | Anlamı |
|---|---|
| KABUL (H1 — sonradan konmuş ölçüt) | Ölçüt sonuçlar görüldükten sonra kondu ([H1](#/kilavuz/sozluk/panel)); seçim yanlılığı taşır |
| KABUL — kırılgan | Ön kayıtla geçti ama tek hisseye / tek ayara bağlı (ör. Lydia'da KTLEV) |
| KABUL — −%35 eşiği kullanıcı kararı (deneme 444), katı Holm'da geçmez | Kairos: gün içi −%20 güvenlik ölçütü geçmedi, kullanıcı −%35 teorik sınırı onayladı; künye TradFi sızıntısı düzeltmesinden sonraki kayıttan (%73,0 / holdout %42,7 / DD %35,6 / P 0,89) |
| KABUL (ön kayıtla) · RED · ölçüm / bileşen · kıyas | Ön kayıtlı ölçütün sonucu; bileşen = tek başına kabul ölçümü yok (Kalkan) |
| elle | Emri aracı kurumda siz girersiniz |
| otomatik — demo bot | Bot kendi emrini verir (demo hesap) |
| uygulanamaz — yalnız izleme | Gerçekte kurulamaz (ör. 836 portföy marjı ≥ 110 000 $ ister) |

Süzgeçler: **İzlenen modeller · Yalnız katalog** (836, 847, Kairos/Tao/Kalkan, M2) **· Kıyaslar · RED adaylar · Tümü**. Kartta **Kurucuya ekle**, stratejiyi kurucuya kol olarak ekler.

### Tasarım kurucu ve hedef dağılım {#kurucu}

![Tasarım kurucu ve hedef dağılım halkası](ekran:tasarimci-kurucu-1400)

1. Bir **şablon** seçin (837, 830, 840, 847, Kairos tek başına) ya da kolları ve ağırlıkları kendiniz girin; **Dengeleme** kuralını seçin: Aylık (ay sonu tam) · **Bant ±10 puan (her işlem günü)** · Çeyreklik · Yıllık · Dengeleme yok.
2. Altındaki etiket söyler: kolları, ağırlıkları (± 0,5 puan) ve dengeleme kuralı kabul edilmiş bir şablonla aynıysa **kabul edilmiş şablon**; dışına çıkan her birleşim **ölçülmemiş birleşim — simülasyon, kabul değil**.
   - **837 şablonu (Simurg) izlenen modelle aynı kuraldır:** bant ±10 puan, her işlem günü denetim (Kairos payı %40–%60 dışına çıkınca tam 50/50). Aynı kolları **aylık** dengelemeyle kurarsanız "837'nin ESKİ kuralı (sürüm 1, aylık)" notu çıkar ve etiket "ölçülmemiş" olur.
3. Kurucuda Kairos ya da Tao varsa **Kairos serisi** seçilir: **Ölçülen (iyimser)** · **Fazla getirisi yarıya** · **BTC al-tut (kötümser)**. Risk özeti seçtiğiniz seriyle çizilir; üç senaryo ayrıca yan yana tabloda görünür.
4. Ağırlık toplamı 100 değilse toplam kırmızı yazar ve hangi paylarla hesaplanacağını söyler (ör. 60 + 50 → "oranlanarak %54,5 / %45,5 kullanılacak").
5. **Hedef dağılım** halkası: **Kol** düzeyi ya da **Varlık** düzeyi (Momentum kolları bu ayın 10 hissesine açılır; en fazla 7 dilim, küçükler "Diğer"de).
6. **Riski dene** (yalnız bu bilgisayarda): risk özetini hesaplar.
7. **Tasarım adı** + **Kaydet (taslak)**: birleşimi "Kayıtlı tasarımlarım" listesine kaydeder (aşağıda). Kurucu kayıtlı bir tasarıma bağlıysa altında yazar; izlenen bir tasarımda düğme **Yeni sürüm kaydet…** olur. **Ayrı tasarım olarak kaydet** bağlantıyı koparıp yeni kayıt açar.

> **Not:** Takip edilen üç model sabitlemeyle donmuştur; kurucu onları değiştirmez. Kurucu "dene + kaydet" içindir — gerçek portföye emir listesi ve **Uyguladım** yalnız **Bu ay**'dadır.

### Kayıtlı tasarımlarım {#kayitli}

Kurucudan kaydettiğiniz birleşimlerin listesi: ad, sürüm, durum (**taslak — izlenmiyor** · **izleniyor** · **durduruldu**), yürürlük günü, kollar ve dengeleme, etiket. Düğmeler: **Kurucuya yükle** · **İzlemeye al…** · **Durdur…** (yazma düğmeleri yalnız bu bilgisayarda).

- **Kayıt silinmez, değişmez:** her kaydetme, izlemeye alma, yeni sürüm ve durdurma **yeni bir sürüm satırı** olarak eklenir; önceki satırlar olduğu gibi kalır (her satır bir öncekinin özetini taşır, sonradan değiştirilirse görünür).
- **İzlemeye al…** onay ister ve yürürlük gününü yazar: **sonraki karar günü** (ayın son işlem günü kapanışı). Seri o kapanışta **100** ile başlar ve [Modeller › Ayrıntılı izleme](#/kilavuz/model-portfoy/ayrintili)'de "Kendi tasarımlarım" bölümünde görünür.
- **Yeni sürüm:** kurucuya yükleyip değiştirin, **Yeni sürüm kaydet…** deyin. Yeni kural da **sonraki karar gününde** yürürlüğe girer; o güne kadar seri eski sürümle sürer, geçmiş günler değişmez. İzleme başlayalı 12 ay olmadıysa "ileri dönem sıfırlanır" uyarısı çıkar.
- **Kurallar** (karar Ö14): kendi tasarımınız **ölçülmemiş — kabul değil** etiketini taşır (şablonla birebir olanlar hariç); **emir listesi açılmaz** (canlı hesap yalnız ölçülmüş modellerde); **deneme sayacına girmez** (araştırma değil izleme); aynı anda **en çok 3** tasarım izlenir.
- Bu bilgisayardaki kayıtlar "deneme" etiketlidir; resmî kayıt sunucuda tutulur.

### Risk özeti {#risk}

![Risk özeti — birleşik eğri, düşüş, stres](ekran:tasarimci-risk-1400)

Laboratuvar motoru, Laboratuvar'ın iş kuyruğunda (ilerleme çubuğu görünür) tasarımı simüle eder (Bant ±10 kuralı burada da her işlem günü denetlenir — izlenen Simurg ile aynı kural):

- **Dönem etiketi:** tüm kolların verisinin olduğu ORTAK dönem (ör. Kairos verisi 2020-09'da başladığı için Simurg burada 2020-09 → bugün). Geçmişe bakarak sabit ağırlık; maliyet %0,05 + hesaplar arası %0,1. Bu sonuç **katalogdaki ölçülmüş künyeyle birebir değildir**.
- CAGR, en büyük düşüş (dip tarihi), Sharpe (T-bill fazlası), oynaklık, en kötü yıl; kıyas tablosu (QQQ al-tut, BTC al-tut; BIST kollarında XU100 vekil).
- Ana grafik: tasarım kalın yeşil, olası sıralamalar bandı, kıyaslar gri, kriz dönemleri altın, altta düşüş şeridi.
- **Bootstrap en büyük düşüş** (%5 / ortanca / %95), **stres dönemleri** (2008, 2018 TL, 2020-03, 2021 TL, 2022, 2025-10-10; dönem dışıysa "dönem dışı"), **korelasyon** (haftalık, kol çiftleri), Kairos/Tao varsa **Kairos serisi senaryoları** tablosu (ölçülen · yarıya · BTC al-tut) ve motorun uyarıları (sade dille: ne yapmanız gerektiğini söyler).

Her deneme Laboratuvar'ın **tasarimci** oturumunun deneme sayacına eklenir.

## Ne işe yarar {#ne-ise-yarar}

Hangi stratejinin neden kabul edildiğini, ne kadar kırılgan olduğunu ve bu ay modelin ne yaptığını tek ekranda görmek; yeni bir birleşimi denemek ve beğendiğinizi kaydedip ileriye dönük izlemek (emir vermeden).

## Ne zaman kullanılır {#ne-zaman}

- Her ay sonu kararından sonra (ayın son işlem günü gecesi → ertesi gün): **Bu ay** emir listesini aracı kurumda uygulamak, sonra **Uyguladım** ile kayıtlarına (Portföyüm) yazmak.
- Simurg için ayda bir **Bu ay**'a bakmak yeter: bant aşılmadıkça aktarım yoktur.
- Bir birleşimi merak ettiğinizde: kurucuda deneyip risk özetine bakmak; isterseniz kaydedip izlemeye almak (en çok 3).

## Uyarılar ve ne yapmalı {#uyarilar}

- **"ölçülmemiş birleşim — simülasyon, kabul değil":** bu birleşim için ön kayıtlı ölçüm yok; sonucu karar gerekçesi yapmayın.
- **"Eksik veri: …"** (Bu ay): o hissenin fiyatı karar anında yoktu; Veri ekranından kaynağı kontrol edin.
- **"Veri bayat"** (katalog kartı): son işlem günü verisi gelmemiş; çoğu gece kendiliğinden düzelir ([Veri](#/kilavuz/veri)).
- **"Model sermayesi girilmedi":** emir listesi tutar olmadan hesaplanamaz; formu doldurun.
- **"… hesabı yok":** Hesaplar'da o türden açık hesap yok; satırlar uygulanamaz ([Hesaplar](#/kilavuz/portfoyum/kayit)).
- **"Tam adet … nakitte kalır":** kesirli hisse varsayılmadığı için hedefin bir kısmı nakitte kalır; normaldir.
- **"nakit yetersiz":** hesaptaki nakit alışlara yetmiyor; para yatırın ve Hesaplar'a kaydedin.
- **"zaten uygulandı" (Uyguladım):** o satır kayıtlarında (Portföyüm) var; düzeltmek için önce **Geri al**.
- **"önizlemeden sonra satırlar değişti":** yeniden **Önizle**'ye basın.
- **"Kairos/Tao serisi iyimser" (risk özeti):** ölçülen seri yüzlerce denemeden seçildi; **Kairos serisi: BTC al-tut (kötümser)** seçip yeniden deneyin, sonuç orada da kabul edilebilir olmalı.
- **"aynı anda en çok 3 kendi tasarım izlenir":** önce birini **Durdur…** ile durdurun.
- **"bu tasarım izleniyor — Yeni sürüm kullanın":** izlenen tasarım yerinde değişmez; **Yeni sürüm kaydet…** sonraki karar gününde yürürlüğe girer.
- **Riski dene telefonda görünmez:** telefon yalnız izler; işlem sunucudaki panelden yapılır.
- Bu bilgisayardaki kararlar "deneme" etiketlidir; **resmî kayıt yalnız sunucuda** tutulur ([Kurulum](#/kilavuz/kurulum)).
