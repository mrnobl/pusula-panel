# Sık sorulanlar {#sss}

## Ekrandaki küçük "?" ne işe yarar? {#soru-isareti}

Terimin ne demek olduğunu açıklar. **"?"e tıklayın ya da dokunun: açıklama terimin hemen yanında küçük bir balonda açılır** ve siz kapatana kadar açık kalır. Kapatmak için aynı "?"e yeniden dokunun, **Esc**'ye basın ya da sayfada başka bir yere tıklayın; sayfayı kaydırınca da kapanır. Aynı anda tek balon açık olur. Masaüstünde fareyi "?" üstünde bekletmek de kısa açıklamayı gösterir. Klavyeyle **Tab** ile "?"e gelip **Enter** ile açabilirsiniz.

## Bir kısaltmayı (TWR, CVaR, XU030, DEX…) anlamadım {#kisaltma}

Ekranda yanında "?" varsa ona dokunun. Yoksa [Sözlük](#/kilavuz/sozluk) bölümünün sonundaki **Panelin ? açıklamaları** listesine bakın: panelde kullanılan bütün terimler (portföy, araştırma, coin tarama, bot ve borsa) orada sade Türkçe tanım ve örnekle yazılıdır. Kılavuz aramasına kısaltmayı yazmak da tanımı bulur.

## "?" açıklaması ile kılavuzdaki tanım farklı olabilir mi? {#tek-kaynak}

Hayır. Ekrandaki "?" balonları ile Sözlük'ün **Panelin ? açıklamaları** listesi aynı kaynaktan gelir; bir terim düzeltilince ikisi birlikte değişir.

## Pusula canlı hesapla işlem yapıyor mu? {#gercek-para}

Hayır. Botlar **kâğıt** (sanal hesap) ya da **demo** (Binance Demo Trading, sahte para) modunda çalışır. Canlı (canlı hesap) mod bilinçli olarak kapalıdır; açılması önce demo kabul protokolünün tamamlanmasını gerektirir ([İleri test](#/kilavuz/ileri-test)).

## "Araştırma modu" ne demek, neden düğmeler gri? {#arastirma-modu}

Bot sunucuda çalışır. Geliştirme bilgisayarında panel **araştırma modunda** açılır: Telegram kapalı, hiçbir bot başlamaz, bot/borsa/emir düğmeleri kilitli. Backtest, portföy laboratuvarı ve okuma ekranları çalışır. Bu bir hata değildir; aynı botun iki bilgisayarda çalışmasını ve Telegram çakışmasını önler.

## Turuncu "eski sürüm" bandı çıkıyor {#eski-surum}

Tarayıcı eski dosyaları gösteriyor: **Ctrl+F5**. Sürmezse sunucu eski kodu çalıştırıyordur — yeniden başlatın: masaüstünde **Pusula'yı durdur** → **Pusula** ([Kurulum › Adım 10](#/kilavuz/kurulum/adim-10)).

## Bot "Durduruldu — onay bekliyor" diyor {#durduruldu}

Bot kendini korumak için durdu (borsa ile kayıtlar uyuşmuyor ya da gerçek sonuç modelden %5'ten fazla ayrıldı). Nedeni kartta yazar: [Botlar › Durduruldu bandı](#/kilavuz/botlar/durduruldu).

## Bilgisayar kapalı kaldı, ne olur? {#bilgisayar-kapali}

Sunucu açılınca bot kaçırılan günleri sayar, **geçmiş günlerin emirlerini vermez**, yalnız bugünkü hedefe gider; kaçırılan gün sayısı ve gölge farkı satırda ve Telegram'da raporlanır. 26 saatten uzun kapalı kaldıysa açılışta Telegram uyarısı gider. Otomatik başlatma açılışta kurulduysa (Kurulum Adım 11) bot elektrik kesintisinden sonra kimse oturum açmasa da başlar; yalnız oturumda başlayan eski kurulumda başlamaz: [Kurulum › Bilinen risk](#/kilavuz/kurulum/bilinen-risk).

## Kırmızı bayrak "sat" demek mi? {#kirmizi-bayrak}

Hayır. Coin taramadaki kırmızı bayrak yalnız "şuna bak" işaretidir; alım/satım sinyali ya da puan değildir ([Coin tarama](#/kilavuz/coin-tarama/bayraklar)).

## Bir listeyi yanlış girdim, silebilir miyim? {#liste-sil}

Hayır, kayıt değiştirilemez ve silinemez; **Düzeltme ekle** ile düzeltme kaydı eklenir ([Listeler › Düzeltme](#/kilavuz/listeler/duzeltme)).

## Listeleri neden yalnız sunucudan girmeliyim? {#liste-ev}

Her kayıt bir öncekinin özetini taşır. İki bilgisayarda ayrı ayrı liste girilirse iki farklı zincir oluşur ve birleştirilirken çelişki çıkar.

## Telefondan bot durdurabilir miyim? {#telefon-durdur}

Telefondan **Durdur / Başlat yoktur**; telefon her ekranı izler ve botu yalnız **acil durdurabilir**: botun Genel görünümünde (bot çalışırken üst çubukta da) kırmızı **Acil durdur** → **acil PIN** + **DURDUR**. Acil durdurma bütün pozisyonları kapatır ve demo / canlı hesapta geri alınamaz. Eski `--tam` (tam erişim) seçeneği 60.5'te kaldırıldı. Ayrıntı: [Telefondan açmak](#/kilavuz/telefon/acil-pin).

## Model portföy canlı hesapla mı işlem yapıyor? {#model-portfoy}

Hayır. Üç model portföy (Simurg, Nova, Lydia) **sanaldır**: ay sonu kararları otomatik alınır, model uygulama günü açılışında sanal olarak doldurulur ve 100 tabanlı endeksle izlenir. Gerçek hesabınızdaki emirleri aracı kurumda siz girersiniz; portföy kayıtlarınızdaki adetlere göre hazırlanan emir listesi **Portföy › Modeller**'de modelin **Bu ay** kartındadır ([Portföy tasarımcısı](#/kilavuz/tasarimci)). Panel hiçbir aracı kuruma emir göndermez.

## Bu ay listesini uyguladım, portföyüme tek tek mi gireceğim? {#uyguladim}

Hayır. Emirleri aracı kurumda girdikten sonra **Portföy › Modeller › (model) › Bu ay › Uyguladım…**: satırlar önceden dolu gelir, gerçekleşen adet / fiyat / ücreti düzeltip **Önizle**, sonra **Onayla** dersiniz; hepsi portföy kayıtlarına tek seferde yazılır. Yanlış olursa **Geri al** ters kayıt yazar ([ayrıntı](#/kilavuz/tasarimci)).

## Emir listesinde neden kesirli adet yok? {#kesirli}

Midas'ta ABD hisselerinde kesirli alım doğrulanmadığı için liste **tam adet** üretir; hedefin artan kısmı nakitte kalır ve "Tam adet … nakitte kalır" diye yazar. Kesirli alımı doğrularsanız **Model sermayesi** formundaki ayarı açın.

## Simurg'da neden her ay aktarım yok? {#bant}

Simurg sürüm 2'den beri **bant kuralıyla** dengelenir: Kairos payı %40–%60 aralığındayken hiçbir şey yapılmaz; dışına çıkınca tam 50/50'ye dönülür. Ölçümde bu, 8 yılda 13 aktarım demek (aylık kuralda 105) — Sharpe ve düşüş aynı ([Bu ay](#/kilavuz/tasarimci/bu-ay)).

## "Ölçülmemiş birleşim — simülasyon, kabul değil" ne demek? {#olculmemis}

Kurucuda kabul edilmiş bir şablonun (837, 830, 840, 847, Kairos) kolları, ağırlıkları ya da aylık dengelemesi değiştiyse o birleşim için ön kayıtlı bir ölçüm yoktur. Risk özeti yine hesaplanır ama bu bir kabul değil, yalnız simülasyondur.

## Model portföylerin canlı grafiği neden boş? {#model-bos}

Model portföyler **2026-10-12 açılışında** başlar; ilk değer o gün kapanıştan sonra yazılır ve canlı çizgi ikinci işlem gününden sonra görünür. O zamana kadar Model portföyler kartında **Geçmiş — backtest** grafiğine bakın. Geliştirme bilgisayarında kayıtlar "deneme" etiketlidir; resmî kayıt sunucudadır.

## Portföy tutarlarım neden otomatik gelmiyor? {#tutar-otomatik}

Banka ve aracı kurum (Midas vb.) hesaplarındaki tutarlar bilinçli olarak elle girilir (birden çok kurum, otomatik okuma yok). Binance ve OKX bakiyeleri ise İşlem defterinde salt okuma anahtarı girildiyse Portföy toplamına kendiliğinden katılır. Bot hesapları ayrıdır — botun **Hesap** görünümünde ([Bot hesabı](#/kilavuz/hesaplar)) — ve portföy toplamına katılmaz.

## "Ara rapor — hüküm değil" ne demek? {#ara-rapor}

İleri test sürerken sayılar yalnız betimlenir; ön kayıt gereği hüküm tarihinden önce "geçti/kaldı" kararı verilmez ([İleri test](#/kilavuz/ileri-test)).

## Ekran görüntülerindeki rakamlar benim mi? {#ornek-veri}

Hayır. Kılavuz görüntüleri geliştirme bilgisayarında araştırma modunda, örnek portföy verisiyle alınır; anahtar, bakiye ve jetonlar maskelenir.

## Kılavuz ile panel farklı görünüyor {#kilavuz-farkli}

Olmamalı: ekran değişince kılavuz testi görüntüyü bayat sayar ve güncelleme yapılmadan değişiklik işlenmez. Yine de fark görürseniz sürümü kontrol edin (Ctrl+F5) ve geliştirme sohbetine bildirin.
