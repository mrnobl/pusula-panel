# İzle listesi {#izle-listesi}

## Ne işe yarar {#ne-ise-yarar}

[Dikkat listesi](#/kilavuz/dikkat-listesi) "uzak dur" diyen yarıdır. İzle listesi öbür yarıdır: her gece taranan coinler arasından **bakmaya değer** olanları seçer. Bir coin şu üç şartı birden sağlarsa İzle listesine girer:

1. Dikkat listesinin hiçbir kuralı tutmuyor ve güvenlik verisi o gün geldi,
2. beş veri ailesinin en az üçünde verisi var,
3. kendi kategorisinde, kazandığı ücrete göre **ucuz** (P/F en düşük %20) **ve** holder (sahip) sayısı son 30 günde **artmış**.

Liste en çok **15** coindir. Yanında ikinci bir liste daha tutulur: **Puan listesi (gölge)**. Aynı adaylar sekiz ölçünün eşit ağırlıklı ortalamasıyla sıralanır. Bu liste yalnız kayda geçer, hiçbir karar ondan çıkmaz.

**Alım/satım sinyali değildir.** Hiçbir bota, portföye ya da emre bağlı değildir. Listenin işe yarayıp yaramadığı önceden yazılmış bir kuralla ölçülür (aşağıda); sonuç hüküm gününe kadar gösterilmez.

## Ne zaman kullanılır {#ne-zaman}

- Araştırmaya hangi coinlerden başlayacağınızı görmek için: kategorisinde ucuz ve kullanıcısı artan coinler.
- Bir coinin listeye ne zaman girip çıktığını takip etmek için (Girenler ve çıkanlar).
- Isınma döneminde ön izleme karnesine bakmak için. Bu karne değerlendirme dışıdır, hüküm değildir.

## Ölçütler {#olcutler}

### Şart 1 — Dikkat listesinde temiz {#sart-1}

Dikkat listesinin 16 kuralının (K1–K16) **hiçbiri** o gün "doğru" çıkmamalı. Bilgi kuralları da sayılır (K2 rug, K6 açılım, K10 veri kayboldu). Ayrıca coinin ağına uygun güvenlik kaynağı o gün **cevap vermiş** olmalı: Ethereum, Base, BSC, Arbitrum coinlerinde GoPlus, Solana coinlerinde RugCheck. Kaynak cevap vermediyse ya da coin hakkında kaydı yoksa "temiz" olduğu doğrulanamaz, coin aday olmaz. Sözleşmesi olmayan kendi zincirli borsa coinlerinde (ör. TAO) güvenlik kaynağı uygulanmaz; bu coinlerde yalnız "hiçbir kural tutmuyor" şartı aranır.

### Şart 2 — En az 3 veri ailesi {#sart-2}

| Aile | Verisi var sayılır, eğer |
|---|---|
| Temel | DefiLlama'da son 30 günlük ücret geliri sıfırdan büyük |
| Benimseme | Holder sayısının 30 günlük değişimi hesaplanabildi |
| Likidite / hacim | DEX likiditesi ya da 24 saatlik işlem hacmi sıfırdan büyük |
| Geliştirici | Projenin GitHub'daki en yeni güncelleme tarihi biliniyor |
| Dağılım | İlk 10 cüzdanın payı biliniyor (sözleşme, kilit, yakma ve bilinen adresler çıkarılmış) |

Eksik aile sıfır sayılmaz; yalnız sayılmaz. Beşten en az üçü gerekir.

### Şart 3 — Kategorisinde ucuz ve kullanıcısı artıyor {#sart-3}

**P/F (fiyat / ücret oranı)** = piyasa değeri ÷ yıllık ücret. Yıllık ücret, son 30 günün ücreti × 365/30'dur. Piyasa değeri CoinGecko'nun dolaşımdaki piyasa değeridir; yoksa DefiLlama'nınki kullanılır. Düşük P/F, coinin kazandığı ücrete göre ucuz olduğu anlamına gelir.

**Örnek:** piyasa değeri 50 milyon $, son 30 günde 200 bin $ ücret. Yıllık ücret = 200 bin × 365 / 30 ≈ 2,43 milyon $. P/F = 50 / 2,43 ≈ **20,5**. Aynı kategorideki (ör. "Dexes") başka bir coinin piyasa değeri 300 milyon $, 30 günlük ücreti 400 bin $ ise yıllık ücreti ≈ 4,87 milyon $, P/F ≈ 61,6 olur: ilk coin ücretine göre üç kat ucuzdur.

- Ücreti sıfır ya da DefiLlama kaydı olmayan coinin P/F'si **yoktur**; bu coin İzle'ye giremez.
- P/F'ler coinin **DefiLlama kategorisi** içinde sıralanır. **Yüzdelik** = sırası (en ucuz 0, en pahalı 1). Coin, kategorisinin en ucuz **%20**'sinde olmalı. Kategoride P/F'si olan coin sayısı **5'ten azsa** (ya da coinin kategorisi yoksa) sıralama bütün coinler arasında yapılır.
- **Holder 30 gün değişimi:** bugünkü holder sayısının 30 gün önceki sayıya oranı (logaritmik değişim). Sıfırdan büyük olmalı, yani holder sayısı **artmış** olmalı. 30 gün önceki gün kayıt yoksa en çok 3 gün daha eskiye bakılır; iki günün holder sayısı aynı kaynaktan gelmelidir. Yoksa değişim hesaplanmaz ve coin o gün İzle'ye giremez.

### Liste nasıl oluşur {#liste}

Üç şartı sağlayan coinler P/F yüzdeliğine göre en ucuzdan başlayarak sıralanır (eşitlikte sembol sırası) ve **ilk 15** alınır. Aday 15'ten azsa liste kısa kalır, doldurulmaz. Geçmiş 30 günlük fiyat değişimi (momentum) yalnız bilgi olarak saklanır; sıraya girmez.

**Girenler ve çıkanlar** bir önceki kayıt gününün listesine göre bulunur. Bir coinin o gün güvenlik verisi, holder sayısı ya da DefiLlama/piyasa değeri verisi gelmediyse durumu bilinmez: listede değildir ama "çıktı" da sayılmaz (**askıda**); son bilinen durumu korunur. Arşiv 30 günden gençken (holder değişimi hesaplanamazken) İzle durumu hiç bilinmez; bu yüzden listenin ilk dolduğu gün "taban" sayılır: o gün giren yazılmaz, ertesi günden itibaren sayılır. Önceki gün durumu bilinmeyen bir coin için daha eski bir güne bakılır (en çok 7 kayıt günü). Çizelgedeki **Girdiği gün** coinin listeye bu sefer girdiği gündür.

### Puan listesi (gölge) {#puan}

Şart 1 ve 2'yi sağlayan her coin için sekiz ölçü o günün adayları arasında 0–1 yüzdeliğe çevrilir (1 = en iyi). Ölçünün iyi yönü önceden yazıldı:

| Ölçü | İyi yön |
|---|---|
| P/F (piyasa değeri / yıllık ücret) | düşük |
| P/S (piyasa değeri / yıllık gelir) | düşük |
| Ücretin 30 günlük büyümesi | yüksek |
| TVL'nin (kilitli varlık) 30 günlük değişimi | yüksek |
| Holder sayısının 30 günlük değişimi | yüksek |
| İlk 10 cüzdanın payı (ayıklanmış) | düşük |
| DEX likiditesi / piyasa değeri | yüksek |
| Son kod güncellemesinin yaşı | düşük |

**Puan** = verisi olan ölçülerin yüzdelik ortalamasıdır. En az 3 ölçü gerekir. Ağırlık aranmaz, hiçbir zaman ayarlanmaz. En yüksek puanlı **15** coin puan listesidir. Bu liste ayrı bir deneme olarak kaydedilir (deneme 782). Puan listesi İzle'den iyi çıksa bile kendiliğinden kullanılmaya başlamaz; bunun için yeni bir ön kayıt gerekir.

## Nasıl değerlendirilir {#degerlendirme}

İzle listesinin işe yarayıp yaramadığı ölçüm başlamadan önce yazılmış bir kuralla sınanır (deneme 781; puan listesi 782):

1. **Pencereler:** değerlendirme başlangıcı (**t0**): ilk 30 kayıt günü dolunca, ertesi gece koşusu evren eşiklerini önceden yazılmış kuralla **kendiliğinden ve bir kez** hesaplayıp kayda geçirir; t0 = 30. kayıt gününden sonraki 2. gündür. t0, t0 + 30, t0 + 60 … günlerinin listeleri alınır: **12 pencere**. O gün kayıt yoksa sonraki ilk kayıt gününün listesi kullanılır. Her pencerenin coinleri 30 gün tutulur, sonra bırakılır. Günlük listeler birbirine çok benzediği için her gün ayrı sayılmaz; yalnız 30 günde bir alınan listeler sayılır.
2. **Getiri:** her coinin 30 günlük getirisi maliyet düşülerek hesaplanır. DEX'te alış ve satışta ayrı ayrı %1 kayma + %0,3 ücret, borsada %0,1 düşülür. Delist olan, DEX likiditesi 1 000 
3. **Ölçü (M):** her pencerede listedeki coinlerin ortanca getirisi bulunur. M, 12 pencerenin ortanca getirilerinin ortancasıdır.
4. **Rastgele sepetler:** her pencerede listedeki her coinin yerine aynı türden (borsa / DEX) ve aynı likidite diliminden, dikkat listesinde temiz rastgele bir coin konur. Bu **1 000 kez** tohumlu tekrarlanır; aynı tohum her zaman aynı sepeti verir. İzle'nin M'si bu 1 000 rastgele M'nin kaçından iyi, ona bakılır (p değeri).
5. **Çoklu test düzeltmesi (Holm):** İzle ve puan listesi aynı anda sınandığı için şans payı düzeltilir. Küçük olan p ≤ 0,025, diğeri ≤ 0,05 olmalıdır.
6. **KABUL:** Holm'dan geçen p **ve** İzle'nin M'si evren ortancasının M'sinden büyük **ve** "şart 1 + 2'yi sağlayıp P/F'si olan bütün adaylar" havuzunun M'sinden büyük. Biri tutmazsa **RED**. Liste boyu 5'ten kısa pencereler düşer. Hüküm günü hâlâ sonucu belli olmayan coini olan pencere de düşer (yarım ölçümle hesaba girmez). 5'ten az geçerli pencere kalırsa ya da P/F ve holder verilerinin **en az %30'u (≥ %30)** 2 takvim ayı üst üste alınamazsa sonuç **SONUÇSUZ** olur.
7. **Hüküm günü:** t0 + 374 gün (12 × 30 gün + 14 gün ölü coin payı + 7 gün veri gecikmesi). Hüküm o günün gece koşusunda **bir kez** hesaplanır ve kayda (zincire) yazılır; ekran bu kaydı gösterir, sonradan yeniden hesaplamaz. Yanında hüküm vermeyen bilgi kıyasları da yazılır: geçmiş 30 günlük getirisi benzer rastgele sepet (momentum), BTC, puan listesi − İzle farkı ve günlük listelerle duyarlılık.

### Performans neden gizli? {#gizli}

Ön kayıt 12 pencerenin hepsini **tek bakışta** test eder. Arada sonuca bakmak, kuralı sonuca göre değiştirme isteği doğurur ve testi geçersiz kılar. Bu yüzden hüküm gününe kadar ekranda liste ile rastgele sepetlerin getiri farkı ya da yüzdeliği **gösterilmez**. Görünenler yalnız pencere sayısı, liste boyları, girenler ve çıkanlardır.

### Ön izleme karnesi {#on-izleme}

Isınma döneminde (t0'dan önce) listeye **yeni giren** her coin, aynı gün aynı türden ve aynı likidite diliminden, o gün listede olmayan 3 rastgele kontrol coiniyle birlikte 30 gün izlenir. Karne şunları gösterir: listeye giren sayısı, 30 günü dolan sayısı, listenin ve kontrollerin ortanca getirisi, kendi kontrollerinin ortancasını geçen coinlerin payı. **Ön izleme (ısınma) — değerlendirme dışı, hüküm değil.** t0'dan sonra ön izlemeye yeni coin girmez. t0 belli olduktan sonra, 30 günü (+14 gün kayıp payı) t0'dan sonraya taşan girişlerin getirisi hüküm gününe kadar gösterilmez, yalnız sayılır: o günlerin fiyatları ön kayıtlı testin ilk penceresiyle örtüşür.

## Ekran {#ekran}

![İzle listesi](ekran:izle-listesi-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Resmî / Deneme kaydı | Resmî kayıt sunucunun gece görevidir; deneme kaydı bu bilgisayarda elle çalıştırılan koşudur |
| İZLE | Bugün listedeki coin sayısı (en çok 15) |
| Bugün giren / çıkan | Önceki kayıt gününün listesine göre |
| Aday havuzu | P/F'si olan aday / dikkat listesinde temiz ve en az 3 ailesi olan aday |
| Coin ara | Sembolün bir kısmı (ör. AAVE); iki listeyi de süzer |
| P/F | Piyasa değeri ÷ yıllık ücret; "×" kat demektir |
| Kategori yüzdeliği | Kategorisindeki sırası (%0 en ucuz). "(tüm)": kategoride 5'ten az coin vardı, bütün coinlerle sıralandı |
| Holder 30 g | Holder sayısının 30 günlük değişimi (yüzde) |
| Aile | Verisi olan aile sayısı (üstüne gelince adları) |
| Girdiği gün | Coinin listeye bu sefer girdiği gün |
| Coin (düğme) | Son kayıt günlerinde İzle ve puan sırası, havuzda olup olmadığı, P/F ve holder değişimi |
| Ön kayıt ve hüküm | Kural sürümü ve SHA, t0, hüküm günü, pencere tablosu (yalnız sayım) |

## Uyarılar ve ne yapmalı {#uyarilar}

| Görünen | Anlamı | Ne yapmalı |
|---|---|---|
| "Liste henüz boş: holder sayısının 30 günlük değişimi gerekiyor" | Arşivde 30 gün önceki kayıt yok | Bekleyin; ilk liste ≈ 30 kayıt günü sonra çıkar (ekranda en erken tarih yazar) |
| "KAÇIN temiz ve en az 3 ailede verisi olan token yok" | O gün veri kaynaklarının çoğu cevap vermedi | Tek gün sorun değil; sürerse Veri ekranında kaynak durumuna bakın |
| "Isınma dönemi" şeridi | Evren eşikleri henüz sabitlenmedi (30 kayıt günü dolmadı) | Bekleyin; eşikler kendiliğinden sabitlenir. Liste ön izlemedir |
| "Son günün İZLE hesabı başarısız oldu" | Gece koşusunda İZLE adımı hata verdi; arşiv ve dikkat listesi yine de kaydedildi | Bir sonraki gece kendiliğinden hesaplanır; sürerse Claude'a hata metnini gösterin |
| Askıda coinler | Güvenlik verisi bugün gelmedi | Bir şey yapmayın; veri gelince durum düzelir |

## Sık sorulanlar {#sss}

**Neden liste boş?** İlk liste için 30 gün önceki holder sayısı gerekir. Arşiv 30 günden gençken liste boş kalır; puan listesi ise ilk günden görünebilir, çünkü 30 günlük değişim isteyen ölçüler eksik sayılır.

**P/F'si olmayan coinler neden hiç girmiyor?** Ücret geliri DefiLlama'da görünmeyen coinin (çoğu meme coin) ücretine göre ucuz olup olmadığı ölçülemez. Bu bilinçli bir seçimdir: İzle yalnız gelir üreten protokollere bakar.

**Hüküm ne zaman?** t0 + 374 gün. t0, ilk 30 resmî kayıt gününden sonra gece koşusunun eşikleri kendiliğinden sabitlediği kayıtta yazar (30. kayıt günü + 2 gün).
ın altına inen ya da fiyatı 14 gün kaybolan coin **−%100** sayılır. Fiyat 14 gün içinde geri gelirse ölmüş sayılmaz. DexScreener'ın coinin çiftini bulamadığı gün de tek başına ölüm sayılmaz; 14 gün sürerse sayılır.
3. **Ölçü (M):** her pencerede listedeki coinlerin ortanca getirisi bulunur. M, 12 pencerenin ortanca getirilerinin ortancasıdır.
4. **Rastgele sepetler:** her pencerede listedeki her coinin yerine aynı türden (borsa / DEX) ve aynı likidite diliminden, dikkat listesinde temiz rastgele bir coin konur. Bu **1 000 kez** tohumlu tekrarlanır; aynı tohum her zaman aynı sepeti verir. İzle'nin M'si bu 1 000 rastgele M'nin kaçından iyi, ona bakılır (p değeri).
5. **Çoklu test düzeltmesi (Holm):** İzle ve puan listesi aynı anda sınandığı için şans payı düzeltilir. Küçük olan p ≤ 0,025, diğeri ≤ 0,05 olmalıdır.
6. **KABUL:** Holm'dan geçen p **ve** İzle'nin M'si evren ortancasının M'sinden büyük **ve** "şart 1 + 2'yi sağlayıp P/F'si olan bütün adaylar" havuzunun M'sinden büyük. Biri tutmazsa **RED**. Liste boyu 5'ten kısa pencereler düşer. 5'ten az geçerli pencere kalırsa ya da P/F ve holder verilerinin %30'undan fazlası 2 ay üst üste alınamazsa sonuç **SONUÇSUZ** olur.
7. **Hüküm günü:** t0 + 374 gün (12 × 30 gün + 14 gün ölü coin payı + 7 gün veri gecikmesi).

### Performans neden gizli? {#gizli}

Ön kayıt 12 pencerenin hepsini **tek bakışta** test eder. Arada sonuca bakmak, kuralı sonuca göre değiştirme isteği doğurur ve testi geçersiz kılar. Bu yüzden hüküm gününe kadar ekranda liste ile rastgele sepetlerin getiri farkı ya da yüzdeliği **gösterilmez**. Görünenler yalnız pencere sayısı, liste boyları, girenler ve çıkanlardır.

### Ön izleme karnesi {#on-izleme}

Isınma döneminde (t0'dan önce) listeye **yeni giren** her coin, aynı gün aynı türden ve aynı likidite diliminden, o gün listede olmayan 3 rastgele kontrol coiniyle birlikte 30 gün izlenir. Karne şunları gösterir: listeye giren sayısı, 30 günü dolan sayısı, listenin ve kontrollerin ortanca getirisi, kendi kontrollerinin ortancasını geçen coinlerin payı. Bu yalnız "çalışıyor mu" diye bakmak içindir: **ön izleme (ısınma) — değerlendirme dışı, hüküm değil.** t0'dan sonra ön izlemeye yeni coin girmez.

## Ekran {#ekran}

![İzle listesi](ekran:izle-listesi-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Resmî / Deneme kaydı | Resmî kayıt sunucunun gece görevidir; deneme kaydı bu bilgisayarda elle çalıştırılan koşudur |
| İZLE | Bugün listedeki coin sayısı (en çok 15) |
| Bugün giren / çıkan | Önceki kayıt gününün listesine göre |
| Aday havuzu | P/F'si olan aday / dikkat listesinde temiz ve en az 3 ailesi olan aday |
| Coin ara | Sembolün bir kısmı (ör. AAVE); iki listeyi de süzer |
| P/F | Piyasa değeri ÷ yıllık ücret; "×" kat demektir |
| Kategori yüzdeliği | Kategorisindeki sırası (%0 en ucuz). "(tüm)": kategoride 5'ten az coin vardı, bütün coinlerle sıralandı |
| Holder 30 g | Holder sayısının 30 günlük değişimi (yüzde) |
| Aile | Verisi olan aile sayısı (üstüne gelince adları) |
| Girdiği gün | Coinin listeye bu sefer girdiği gün |
| Coin (düğme) | Son kayıt günlerinde İzle ve puan sırası, havuzda olup olmadığı, P/F ve holder değişimi |
| Ön kayıt ve hüküm | Kural sürümü ve SHA, t0, hüküm günü, pencere tablosu (yalnız sayım) |

## Uyarılar ve ne yapmalı {#uyarilar}

| Görünen | Anlamı | Ne yapmalı |
|---|---|---|
| "Liste henüz boş: holder sayısının 30 günlük değişimi gerekiyor" | Arşivde 30 gün önceki kayıt yok | Bekleyin; ilk liste ≈ 30 kayıt günü sonra çıkar (ekranda en erken tarih yazar) |
| "KAÇIN temiz ve en az 3 ailede verisi olan token yok" | O gün veri kaynaklarının çoğu cevap vermedi | Tek gün sorun değil; sürerse Veri ekranında kaynak durumuna bakın |
| "Isınma dönemi" şeridi | Evren eşikleri henüz sabitlenmedi | Liste ön izlemedir, değerlendirmeye girmez |
| "Son günün İZLE hesabı başarısız oldu" | Gece koşusunda İZLE adımı hata verdi; arşiv ve dikkat listesi yine de kaydedildi | Bir sonraki gece kendiliğinden hesaplanır; sürerse Claude'a hata metnini gösterin |
| Askıda coinler | Güvenlik verisi bugün gelmedi | Bir şey yapmayın; veri gelince durum düzelir |

## Sık sorulanlar {#sss}

**Neden liste boş?** İlk liste için 30 gün önceki holder sayısı gerekir. Arşiv 30 günden gençken liste boş kalır; puan listesi ise ilk günden görünebilir, çünkü 30 günlük değişim isteyen ölçüler eksik sayılır.

**P/F'si olmayan coinler neden hiç girmiyor?** Ücret geliri DefiLlama'da görünmeyen coinin (çoğu meme coin) ücretine göre ucuz olup olmadığı ölçülemez. Bu bilinçli bir seçimdir: İzle yalnız gelir üreten protokollere bakar.

**Hüküm ne zaman?** t0 + 374 gün. t0 evren eşiklerinin sabitlendiği gündür (ilk 30 resmî kayıt gününden sonra).
