# Dikkat listesi {#dikkat-listesi}

## Ne işe yarar {#ne-ise-yarar}

Sunucu her gece yüzlerce coini **kendiliğinden** tarar: Binance'teki coinler ve beş DEX ağında (Solana, Base, Ethereum, BSC, Arbitrum) yeni bulunanlar. Her coinde **16 kural** denetlenir; birincil 13 kuraldan biri tutan coin **dikkat listesine** (KAÇIN) girer. İzleme listesine coin eklemeniz gerekmez.

Kurallardan örnekler: satış engelli sözleşme (honeypot), yeni token basma yetkisi, sahip yetkisiyle değiştirilebilen vergi, kilitsiz likidite + genç coin, art arda paralı tanıtım, arzın yarısından çoğu 10 cüzdanda, 6 aydır güncellenmeyen kod deposu, bir günde %30 likidite çekilmesi, büyük cüzdanın payını boşaltması, holder sayısının düşmesi, likidite kilidinin bitmesi, token'la aynı günlerde alınmış alan adı.

**Alım/satım sinyali değildir.** Hiçbir bota, portföye ya da emre bağlı değildir.

Listenin öbür yarısı [İzle listesi](#/kilavuz/izle-listesi)'dir: hiçbir kuralı tutmayan, kategorisinde ücretine göre ucuz ve holder sayısı artan coinler.

## Hangi coinler taranır {#evren}

Coinler iki yoldan bulunur:

- **Borsa (CEX):** Binance spot ya da vadeli (USDⓈ-M) piyasasında işlem gören USDT paritesi olan her coin.
- **DEX:** Solana, Base, Ethereum, BSC ve Arbitrum ağlarında her gün şu listelerde görünen coinler: GeckoTerminal trend ve yeni havuzlar, DexScreener profil ve tanıtım (boost) listeleri, CoinGecko trend listesi, DefiLlama protokolleri. Binance'te de işlem gören bir coin "borsa" sayılır.

Taranan coinin şu şartları sağlaması gerekir:

| Şart | Borsa coini | DEX coini |
|---|---|---|
| Sınıf | Stablecoin, wrapped/köprülenmiş (WBTC, WETH…), likit staking (stETH…), kaldıraçlı (UP/DOWN, 3L/3S…), tokenize hisse ve altın/fiat bağlı coin **alınmaz** | Aynı |
| Yaş | Binance'te en az 14 gündür görülüyor | İlk DEX çifti en az 14 gün önce açılmış (daha genç coin 30 güne kadar hatırlanır, yaşı dolunca girer) |
| Geçmiş | En az 3 kayıt günü | En az 3 kayıt günü |
| Hacim | Son 7 kayıt gününün ortanca 24 saatlik Binance hacmi ≥ eşik | DEX hacminin 7 günlük ortancası ≥ eşik |
| Likidite | — | DEX likiditesi ≥ eşik |

**Eşikler:** ilk 30 resmî kayıt günü boyunca taban değer kullanılır: borsa için 100 bin $, DEX için 50 bin $. 30. kayıt gününden sonraki ilk gece koşusu eşiği **kendiliğinden** ve bir kez, kesin bir kuralla sabitler (elle bir şey yapılmaz): ilk 30 kayıt gününde günde ortalama en çok 200 coin kalacak en küçük değer seçilir ve kayda (zincire) yazılır. Bu kural ücretsiz veri kotası ve gece taramasının süresi düşünülerek yazıldı. Fiyat ya da getiri hesaba katılmaz. Bu eşikler sonradan değişmez.

Listeye giren ya da kontrol olarak seçilen coin, şartlardan düşse de 90 gün izlenmeye devam eder.

## Bir coin listeye nasıl girer {#kurallar}

Her gece her coin için 16 kural denetlenir. **Birincil 13 kuraldan biri** "doğru" çıkarsa coin o gün dikkat listesindedir (KAÇIN). Kural kodları ekrandaki rozetlerdir.

| Kod | Kural | Ne zaman tutar | Kaynak | Listeye sokar mı |
|---|---|---|---|---|
| K1 | Satış engelli sözleşme (honeypot) | Sözleşme satışı engelliyor ya da tamamının satılmasına izin vermiyor | GoPlus (EVM ağları) | Evet |
| K2 | Rug | RugCheck coini "rugged" işaretlemiş | RugCheck (Solana) | Hayır, bilgi |
| K3 | Mint yetkisi | Yeni token basılabiliyor (Solana'da mint yetkisi açık) | GoPlus / RugCheck | Evet |
| K4 | Sahip yetkisi + değişebilir vergi | Sahip sözleşmeyi geri alabiliyor, gizli sahip var ya da bakiyeleri değiştirebiliyor; **ve** alım-satım vergisi sonradan değiştirilebiliyor (ikisi birden) | GoPlus | Evet |
| K5 | Kilitsiz likidite + genç coin | Kilitli ya da yakılmış likidite payı %50'nin altında **ve** ilk çift 90 günden yeni | GoPlus / RugCheck + DexScreener | Evet |
| K6 | Büyük token açılımı (unlock) | Önümüzdeki 30 günde dolaşımdaki arzın %5'i açılacak | Elle girilir | Hayır, bilgi |
| K7 | Paralı tanıtım dalgası | Son 7 kayıt gününün en az 3'ünde DexScreener'da aktif boost ya da onaylı ödenmiş reklam | DexScreener | Evet |
| K8 | Az cüzdanda yoğunlaşma | Sözleşme, kilit, yakma ve etiketli (bilinen) adresler çıkarıldıktan sonra ilk 10 cüzdan arzın %50'sinden fazlasını tutuyor. Etiketsiz borsa cüzdanı kişisel cüzdan gibi görünebilir | GoPlus / RugCheck | Evet |
| K9 | Ölü kod deposu | Projenin GitHub'daki en yeni güncellemesi 180 günden eski | GitHub (DefiLlama kaydından) | Evet |
| K10 | Veri kayboldu | Art arda 2 kayıt gününde hiçbir kaynakta fiyat ve hacim yok | Borsa / DexScreener / CoinGecko | Hayır, bilgi |
| K11 | Likidite çekilmesi | DEX likiditesi önceki kayıt gününe göre %30 ya da daha fazla düştü; yalnız iki günde de görülen çiftler karşılaştırılır, ortak çiftler likiditenin yarısından azını taşıyorsa ölçülmez (kural-v1.1) | DexScreener | Evet |
| K12 | Büyük cüzdan boşaltması | Önceki gün ilk 10'da olan bir kişisel cüzdanın payı en az 2 puan azaldı | GoPlus / RugCheck | Evet |
| K13 | Holder düşüşü | Holder sayısı önceki kayıt gününe göre %5 ya da daha fazla azaldı (iki gün aynı kaynakla) | GoPlus / RugCheck / GeckoTerminal | Evet |
| K14 | Likidite kilidi bitiyor | Likidite kilidinin bitmesine 30 gün ya da daha az kaldı | GoPlus / RugCheck | Evet |
| K15 | Kilitli likidite azaldı | Kilitli likidite payı önceki güne göre 20 puan ya da daha fazla düştü (Solana'da aynı pazar, kural-v1.1) | GoPlus / RugCheck | Evet |
| K16 | Yeni alan adı | Projenin sitesi ilk DEX çiftinden en çok 30 gün önce ya da sonra kaydedilmiş | RDAP + DexScreener | Evet |

**Bilgi rozetleri** listeye sokmaz, yalnız ayrıntıda görünür: K2, K6, K10, ayrıca kara liste/dondurma yetkisi, tek başına değişebilir vergi, tek başına sahip yetkisi ve ilk 10 payının bir günde ±5 puan oynaması. K2 ve K10 çöküşün kendisini ölçtüğü için listeye sokmaz; aksi hâlde test kendi sonucunu tahmin ederdi.

**Bir kuralın dört sonucu olabilir:**

- **doğru:** kural tuttu.
- **yanlış:** kural tutmadı.
- **bilinmiyor:** kaynağa soruldu ama cevap gelmedi (hata ya da kota). Bilinmiyor oranı hükümde izlenir.
- **uygulanmaz:** kural bu coine yapısal olarak uymuyor. Örnekler: Solana coininde EVM kuralı, sözleşmesi olmayan kendi zincirli coin (ör. TAO), sitesi ya da kod deposu olmayan proje, ilk gün olduğu için önceki gün yok.

**Yetersiz veri:** coinin ağına uygun güvenlik kaynağı o gün cevap vermediyse (EVM'de GoPlus, Solana'da RugCheck) coin listeye alınmaz. Başka bir kural tutsa da durum aynıdır; coin ayrı sayılır. Böylece "veri yok" ile "temiz" karışmaz.

**Yeni giren:** önceki kayıt gününde listede olmayıp bugün giren coin. Takip ve kontrol seçimi yalnız yeni girişte açılır. Aynı coin, önceki 90 günlük takibi bitmeden yeniden "olay" sayılmaz.

Kurallar ve eşikler **kural-v1** olarak ölçüm başlamadan önce kayda geçti (deneme 780). Tarama ayarlarındaki eşikleri değiştirmek bu listeyi **etkilemez**. O eşikler yalnız Coin tarama ekranındaki kırmızı bayraklar içindir.

## Ne zaman kullanılır {#ne-zaman}

- Bir coine girmeden önce "bu coin dikkat listesinde mi, hangi kural tuttu?" diye bakmak için.
- Listeye bugün yeni giren coinleri görmek için (Telegram mesajı da gelir).
- Birkaç ay sonra, listenin ve her kuralın gerçekten işe yarayıp yaramadığını karneden okumak için.

## Kendimizi denetleme {#denetleme}

Listenin işe yarayıp yaramadığı ölçülür:

1. Bir coin listeye **yeni girdiği gün** "olay" kaydı açılır.
2. Aynı gün, aynı türden (Binance / DEX) ve aynı likidite diliminden **3 rastgele kontrol coini** seçilir. Seçim tohumludur: aynı gün her zaman aynı coinler seçilir.
3. Hepsi **90 gün** izlenir. Coin evrenden çıksa da izleme sürer.
4. **Çöküş:** fiyat işaret gününün %20'sine iner (%80+ düşüş), Binance'ten delist olur ya da DEX likiditesi 1 000 
5. **Karne:** listedeki coinlerin çöküş oranı kontrol grubunun oranıyla karşılaştırılır. Liste işe yarıyorsa listedekilerin oranı belirgin biçimde yüksek olmalı.

**Karne neden 0 gösteriyor?** Bir coinin sonucu ancak 90 günü dolunca (ya da daha önce çökünce) belli olur. Bu yüzden ilk pencereler kapanana kadar "90 günü dolan", "Çöken" ve "Çöküş oranı" sütunları 0 kalır; bu bir arıza değildir. Değerlendirme (t0) başlamadan sayfa karneyi **Ön izleme (ısınma)** görünümüyle açar ve kaç coinin izlendiğini, ilk 90 günü dolacak pencerenin tarihini yazar.

**Kapı karnesi** hangi kuralın işe yaradığını gösterir. Her kural için listeye soktuğu coin sayısı, 90 günü dolan, çöken, isabet ve yanlış alarm oranı yer alır. "Gözden geçirme" sütununda **ayırt etmiyor** yazıyorsa, o kuralın 90 günü dolan en az 20 coininde çöküş oranı kontrolden yüksek değildir. Böyle bir kural yeni sürümde (kural-v2) değiştirilmeye ya da çıkarılmaya adaydır.

**Kurallar nasıl değişir:** mevcut kural (kural-v1) ölçüm başlamadan önce kayda geçti ve değiştirilmez. Değişiklik **yeni sürüm** olarak eskisinin yanında çalışır, eski kayıtlar silinmez; yeni sürüm de kendi 90 günlük takibiyle sınanır. Böylece "sonuca bakıp kuralı ayarlama" yanılgısına düşülmez.

## Isınma ve hüküm {#isinma}

- **Isınma:** coin evreninin hacim/likidite eşikleri ilk **30 resmî kayıt gününden** sonra bir kez sabitlenir. O güne kadar liste ve takip **ön izlemedir**. Karnede "Ön izleme (ısınma)" düğmesiyle görülür, ön kayıtlı değerlendirmeye girmez.
- **Değerlendirme başlangıcı (t0):** eşik kaydında yazar: 30. kayıt gününden sonraki 2. gün. Kapsam t0'dan sonraki 26 haftanın olaylarıdır.
- **Hüküm günü:** t0 + 286 gün. Hüküm o günün gece koşusunda bir kez hesaplanıp kayda yazılır; ekran bu kaydı gösterir. Ara raporda hüküm yoktur.
- **KABUL:** listedekilerin çöküş oranı kontrolden yüksek ve %90 güven aralığı sıfırın üstünde. Aksi hâlde RED. Olay sayısı 30'un altında ya da çöküş sayısı 5'in altındaysa SONUÇSUZ.
- **Bilinmiyor oranı:** veri kaynakları cevap vermediğinde kural "bilinmiyor" sayılır. Bu oran 2 ay üst üste %30'u geçerse sonuç SONUÇSUZ olur.

## Ekran {#ekran}

![Dikkat listesi](ekran:dikkat-listesi-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Resmî / Deneme kaydı | Resmî kayıt sunucunun gece görevidir (her gece 03:30); deneme kaydı bir bilgisayarda elle çalıştırılan koşudur. Geliştirme bilgisayarı sunucuya bağlıysa liste, karne ve İZLE sunucudan okunur |
| KAÇIN | O gün listede olan / incelenen coin sayısı |
| Bugün yeni giren | Önceki kayıt gününde listede değildi, bugün girdi (takip bu coinler için açılır) |
| Yetersiz veri | Güvenlik kaynağı (GoPlus / RugCheck) o gün cevap vermedi; coin listeye alınmaz, kontrol olarak da seçilmez |
| Takipteki olay | 90 günlük izlemesi süren olaylar |
| Coin ara | Sembolün bir kısmını yazın (ör. PEPE): coin seçili filtrede (KAÇIN / yeni / yetersiz veri) varsa satırı görünür, yoksa "bu listede yok" yazar |
| Tümünü göster | Liste uzunsa ilk 25 satır görünür (bugün yeni girenler önce); düğme hepsini açar |
| Doğru çıkan kapılar | Coini listeye sokan kurallar, en tehlikeliden en hafife sıralı. Rozet rengi tehlikeyi gösterir: kırmızı en yüksek, turuncudan sarıya doğru azalır. Kodun üstüne gelince kuralın tam cümlesi, satırın üstüne gelince o günkü gerekçesi görünür |
| K kodları ne anlama geliyor? | Listenin altındaki açılır sözlük: 16 kuralın hepsi, tehlike sırasıyla ve renkleriyle |
| Takip | Coin bir olayın ya da kontrolün penceresindeyse olay numarası |
| Ayrıntı | Son 30 kayıt günü, kural geçmişi, takip pencereleri (başlangıç fiyatı, en düşük seviye, sonuç) |

## Uyarılar ve ne yapmalı {#uyarilar}

| Görünen | Anlamı | Ne yapmalı |
|---|---|---|
| "Isınma dönemi" şeridi | Evren eşikleri henüz sabitlenmedi (30 kayıt günü dolmadı) | Bekleyin; eşikler kendiliğinden sabitlenir, liste o güne kadar ön izlemedir |
| "Deneme kaydı gösteriliyor" | Resmî kayıt yok; deneme koşusu görünüyor. Geliştirme bilgisayarında gece görevi kurulu değildir, liste orada kendiliğinden yenilenmez | Sunucu bağlantısı kuruluysa liste sunucudan gelir; sunucuda da deneme görünüyorsa gece görevi henüz resmî kayıt yazmamıştır |
| "Son resmî kayıt günü … gün önce" | Gece görevi bir günden fazladır yeni kayıt yazmadı | Sunucuda Sistem › Kurulum denetimi'nde "PusulaDikkatArsiv" görevine bakın; kırmızıysa Onar |
| "Sunucuya şu an ulaşılamıyor" | Sunucu kapalı ya da bağlantı yok; son okunan sunucu verisi gösteriliyor | Sunucu açılınca kendiliğinden düzelir |
| "Son günün dikkat hesabı başarısız oldu" | Gece koşusunda dikkat adımı hata verdi; arşiv kaydı yine de alındı | Bir sonraki gece kendiliğinden yeniden hesaplanır; sürerse Claude'a hata metnini gösterin |
| Yetersiz veri sayısı yüksek | GoPlus / RugCheck o gün çoğu coinde cevap vermedi | Tek gün sorun değil; 2 ay üst üste %30'u geçerse sonuç SONUÇSUZ olur (Ön kayıt ve hüküm katı) |

## Telegram {#telegram}

Listeye yeni giren coinler günde bir mesajla Telegram'a gider: yalnız coin adı ve kural kodu. Varsayılan olarak açıktır; [Tarama ayarları](#/kilavuz/tarama-ayarlari) › Otomatik güncelleme ve bildirim bölümünden kapatılabilir. Mesaj hiçbir değerlendirmeyi etkilemez.

## Sık sorulanlar {#sss}

**Listede çok büyük coinler de var (ör. mint yetkisi).** Kurallar coinin büyüklüğüne bakmaz. Büyük projelerde mint yetkisi olağandır; bu yüzden listedeki her coin "sorunlu" demek değildir. Hangi kuralın gerçekten işe yaradığını kapı karnesi gösterir.

**Neden hemen sonuç yok?** Bir coinin çöküp çökmediği ancak 90 gün sonra bilinir. İlk karne satırları ısınmanın 90. gününde dolmaya başlar.
ın altına düşer, veya fiyat/hacim 14 gün boyunca kaybolur. DexScreener'ın coinin çiftini bulamadığı gün tek başına çöküş sayılmaz; 14 gün sürerse sayılır (çöküş günü ilk gün).
5. **Karne:** listedeki coinlerin çöküş oranı kontrol grubunun oranıyla karşılaştırılır. Liste işe yarıyorsa listedekilerin oranı belirgin biçimde yüksek olmalı.

**Kapı karnesi** hangi kuralın işe yaradığını gösterir. Her kural için listeye soktuğu coin sayısı, 90 günü dolan, çöken, isabet ve yanlış alarm oranı yer alır. "Gözden geçirme" sütununda **ayırt etmiyor** yazıyorsa, o kuralın 90 günü dolan en az 20 coininde çöküş oranı kontrolden yüksek değildir. Böyle bir kural yeni sürümde (kural-v2) değiştirilmeye ya da çıkarılmaya adaydır.

**Kurallar nasıl değişir:** mevcut kural (kural-v1) ölçüm başlamadan önce kayda geçti ve değiştirilmez. Değişiklik **yeni sürüm** olarak eskisinin yanında çalışır, eski kayıtlar silinmez; yeni sürüm de kendi 90 günlük takibiyle sınanır. Böylece "sonuca bakıp kuralı ayarlama" yanılgısına düşülmez.

## Isınma ve hüküm {#isinma}

- **Isınma:** coin evreninin hacim/likidite eşikleri ilk **30 resmî kayıt gününden** sonra bir kez sabitlenir. O güne kadar liste ve takip **ön izlemedir**. Karnede "Ön izleme (ısınma)" düğmesiyle görülür, ön kayıtlı değerlendirmeye girmez.
- **Değerlendirme başlangıcı (t0):** eşik kaydında yazar: 30. kayıt gününden sonraki 2. gün. Kapsam t0'dan sonraki 26 haftanın olaylarıdır.
- **Hüküm günü:** t0 + 286 gün. Hüküm o günün gece koşusunda bir kez hesaplanıp kayda yazılır; ekran bu kaydı gösterir. Ara raporda hüküm yoktur.
- **KABUL:** listedekilerin çöküş oranı kontrolden yüksek ve %90 güven aralığı sıfırın üstünde. Aksi hâlde RED. Olay sayısı 30'un altında ya da çöküş sayısı 5'in altındaysa SONUÇSUZ.
- **Bilinmiyor oranı:** veri kaynakları cevap vermediğinde kural "bilinmiyor" sayılır. Bu oran 2 ay üst üste %30'u geçerse sonuç SONUÇSUZ olur.

## Ekran {#ekran}

![Dikkat listesi](ekran:dikkat-listesi-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Resmî / Deneme kaydı | Resmî kayıt sunucunun gece görevidir; deneme kaydı bu bilgisayarda elle çalıştırılan koşudur |
| KAÇIN | O gün listede olan / incelenen coin sayısı |
| Bugün yeni giren | Önceki kayıt gününde listede değildi, bugün girdi (takip bu coinler için açılır) |
| Yetersiz veri | Güvenlik kaynağı (GoPlus / RugCheck) o gün cevap vermedi; coin listeye alınmaz, kontrol olarak da seçilmez |
| Takipteki olay | 90 günlük izlemesi süren olaylar |
| Coin ara | Sembolün bir kısmını yazın (ör. PEPE): coin seçili filtrede (KAÇIN / yeni / yetersiz veri) varsa satırı görünür, yoksa "bu listede yok" yazar |
| Tümünü göster | Liste uzunsa ilk 25 satır görünür (bugün yeni girenler önce); düğme hepsini açar |
| Doğru çıkan kapılar | Coini listeye sokan kurallar (kodun üstüne gelince adı, satırın üstüne gelince gerekçesi) |
| Takip | Coin bir olayın ya da kontrolün penceresindeyse olay numarası |
| Ayrıntı | Son 30 kayıt günü, kural geçmişi, takip pencereleri (başlangıç fiyatı, en düşük seviye, sonuç) |

## Uyarılar ve ne yapmalı {#uyarilar}

| Görünen | Anlamı | Ne yapmalı |
|---|---|---|
| "Isınma dönemi" şeridi | Evren eşikleri henüz sabitlenmedi | Bekleyin; liste ön izlemedir |
| "Deneme kaydı gösteriliyor" | Bu bilgisayardaki deneme koşusu görünüyor | Resmî kaydı görmek için üstteki seçiciden "Resmî kayıt"ı seçin (sunucuda) |
| "Son günün dikkat hesabı başarısız oldu" | Gece koşusunda dikkat adımı hata verdi; arşiv kaydı yine de alındı | Bir sonraki gece kendiliğinden yeniden hesaplanır; sürerse Claude'a hata metnini gösterin |
| Yetersiz veri sayısı yüksek | GoPlus / RugCheck o gün çoğu coinde cevap vermedi | Tek gün sorun değil; 2 ay üst üste %30'u geçerse sonuç SONUÇSUZ olur (Ön kayıt ve hüküm katı) |

## Telegram {#telegram}

Listeye yeni giren coinler günde bir mesajla Telegram'a gider: yalnız coin adı ve kural kodu. Varsayılan olarak açıktır; [Tarama ayarları](#/kilavuz/tarama-ayarlari) › Otomatik güncelleme ve bildirim bölümünden kapatılabilir. Mesaj hiçbir değerlendirmeyi etkilemez.

## Sık sorulanlar {#sss}

**Listede çok büyük coinler de var (ör. mint yetkisi).** Kurallar coinin büyüklüğüne bakmaz. Büyük projelerde mint yetkisi olağandır; bu yüzden listedeki her coin "sorunlu" demek değildir. Hangi kuralın gerçekten işe yaradığını kapı karnesi gösterir.

**Neden hemen sonuç yok?** Bir coinin çöküp çökmediği ancak 90 gün sonra bilinir. İlk karne satırları ısınmanın 90. gününde dolmaya başlar.
