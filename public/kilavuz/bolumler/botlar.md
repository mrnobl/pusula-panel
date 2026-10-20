# Botlar {#botlar}

## Ne işe yarar {#ne-ise-yarar}

"Bot ne yapıyor, ne kadar kazandı?" sorusunun ekranı. Bot yan menüden seçilir — **Botlar › Hücum** ya da **Botlar › Denge** — ve her botun dört görünümü vardır (adres görünümü taşır, ör. `#/botlar/hucum/hesap`):

| Görünüm | İçinde ne var |
|---|---|
| **Genel** | durum, kural, **Durdur / Başlat** ve **Acil fren**, sayılar, grafik, paranın nerede durduğu, aylık getiri, künye |
| **Hesap** | botun borsadaki hesabı: bağlantı sağlığı, bakiye, pozisyonlar, emirler, geçmiş ([Bot hesabı](#/kilavuz/hesaplar)) ve **Binance bakiyesi** kartı |
| **İşlemler** | coin grafiği + açık pozisyonlar · bekleyen emirler · işlem geçmişi · dağılım geçmişi |
| **Yönetim** | hesap türü, para kaydı, küçük hesap kipi, şimdi çalıştır, kontroller ve (Hücum'da) demo kabul süreci |

İki bot:

- **Hücum** — BTC trendi yükselişteyken BTC tutar (düşüşe dönünce nakde geçer); yanında 15 coinlik **coin sepeti**nde trend takibi ve kademeli alım (×3). Getiri öncelikli.
- **Denge** — Hücum'un sakin hâli: BTC oranı en çok %50 + aynı coin sepeti. Gün içi riski daha düşük.

Yan menüde Hücum ve Denge'nin altında **Portföy botları** ara başlığıyla üç bot daha durur: **QQQ M10**, **BIST M10**, **837 · QQQ + Hücum** — model portföylerin kâğıt hesapları, her biri kendi sayfasında ([Portföy botları](#/kilavuz/portfoy-botlari)). Bu sayfa Hücum ve Denge'yi anlatır.

Botlar günde bir kez, UTC gün kapanışından ~2 dakika sonra (Türkiye saatiyle 03:00 civarı) çalışır: önce kayıtlarını borsayla karşılaştırır, sonra yalnız **bugünkü hedefe** gider.

## Ne zaman kullanılır {#ne-zaman}

- Sabah: bot gece ne yaptı, ne kadar kazandı, bir sorun var mı.
- Ana sayfada bot sağlığı sarı/kırmızıysa.
- Botu durdurmak / başlatmak ya da acil freni çekmek için (Genel). Hesap türü, para yatırma kaydı ve kontroller botun [Yönetim](#/kilavuz/botlar/ayarlar) görünümünde.

## Ekran {#ekran}

![Botlar › Hücum › Genel](ekran:botlar-1400)

Üstte dört görünüm düğmesi (**Genel · Hesap · İşlemler · Yönetim**). Hangi botun açık olduğu yan menüde ve sayfanın kırıntısında yazar; son seçilen bot hatırlanır. **Genel** görünümü yukarıdan aşağıya:

1. **Başlık:** botun adı, büyük durum rozeti, hesap türü (kâğıt / Binance demo / CANLI HESAP), kuralı tek cümle ve **Son karar** satırı (ör. "13 Ekim: BTC değişmedi · BTC trendi yükselişte — BTC tutuluyor"). Sağda yalnız **Durdur / Başlat** ve kırmızı **Acil fren**.
2. **Sayılar:** **hesap değeri** (altında Binance "Avbl") · **başlangıçtan** getiri · aynı dönemde **BTC al-tut** · **simülasyona göre** (30 gün) · **en derin düşüş** · **BTC trendi** (yükselişte / düşüşte).
3. **Grafik:** **Canlı** (botun değeri, aynı kurallarla hesaplanan simülasyon ve BTC al-tut; başlangıç 1) ↔ **Geçmiş — backtest** (kuralın 2020'den beri nasıl davranırdığı, aylık, başlangıç 100, BTC al-tut ile; iyimser — gelecekte aynısı olmayabilir). Kayıt 20 günden azken ekran Geçmiş ile açılır.
4. **Para nerede duruyor?** BTC / coin sepeti / nakit (hesap değerine oranla; coin sepeti ×3 kaldıraçlı nominal) ve yanında **coin bazında kâr / zarar** çubukları (açık pozisyonların girişten bugüne).
5. **Aylık getiri** tablosu (yıl yıl, ay ay; yıl toplamı).
6. Katlı **Botun künyesi:** son çalışma, coin sepeti payları, koruma stopu, teminat durumu, açık pozisyon, küçük hesap kipi, hesap koruması (canlı hesapta), demo/gerçek farkı.

**Hesap** görünümü: botun borsadaki hesabı (bağlantı sağlığı, bakiye, açık pozisyonlar, bekleyen emirler, geçmiş işlemler — [Bot hesabı](#/kilavuz/hesaplar)) ve altında **Binance bakiyesi** kartı: Binance'in kendi hesap alanları, Binance'teki adlarıyla ([aşağıda](#/kilavuz/botlar/binance-bakiyesi)).

![Botlar › Hücum › Hesap (bakiyeler görüntüde maskeli)](ekran:hesaplar-1400)

**İşlemler** görünümü: **Coin grafiği — <bot>** — yalnız o botun işlem yaptığı coinler (● = açık pozisyon); ▲ alış, ▼ satış / kâr al, ● kademeli alım; kesikli çizgi = bekleyen emir. Zaman dilimi (varsayılan 1d) ve mum sayısı seçilir. Altında **İşlemler** paneli ([ayrıntı](#/kilavuz/botlar/islemler)): Açık pozisyonlar · Bekleyen emirler · İşlem geçmişi · Pozisyon büyüklüğü. Bir satıra tıklamak grafikte o coine ve mumuna gider.

![Botlar › Hücum › İşlemler](ekran:botlar-islemler-1400)

**Pozisyon büyüklüğü** sekmesi (67.5'e kadar adı "Dağılım geçmişi"): her bölümün (BTC · trend takibi · kademeli alım) **açık pozisyon büyüklüğü** USDT olarak, gün gün. **Kâr/zarar değildir** — kademeli alım fiyat düştükçe ek alım yaptığı için alanı büyür; bu büyüme kazanç demek değildir. Grafiğin altında her bölümün son değeri ve dönem başına göre değişimi yazar. Kâr/zarar için Genel görünümdeki grafik ve "coin bazında kâr / zarar" çubukları.

![Pozisyon büyüklüğü — her bölümün açık pozisyonu (USDT)](ekran:botlar-pozisyon-buyuklugu-1400)

**BTC ayağı bilerek stopsuz (Hücum demo):** Hücum'un BTC ayağı koruma stopundan **bilerek** hariç tutulur (kullanıcı kararı 2026-10-07; trend ayağı kendi kuralıyla çıkar). Hesap görünümünde BTC pozisyonunun koruma sütununda **bilerek stopsuz** rozeti görünür ve bu pozisyon "Koruma stopu eksik" uyarısına sayılmaz. BTC pozisyonunda trend takibi kolunun da payı varsa o pay için koruma stopu yine beklenir.

**Yönetim** görünümü: [aşağıda](#/kilavuz/botlar/ayarlar).

![Botlar — telefon](ekran:botlar-390)

## Botlarımızın gerçekleşmiş sonuçları {#bot-performansi}

Yeni kurulumda Botlar sayfasının en üstünde (ve Ana sayfada kısa hâliyle) **Botlarımızın gerçekleşmiş sonuçları** kartı durur: kullanacağın botların, Pusula'yı geliştirenin **kendi hesaplarındaki** sonuçları.

- **Hücum / Denge**: Binance **Demo Trading** (sanal para) hesabındaki değer eğrisi, gün gün; aynı dönemde **BTC al-tut** kıyası (kesikli çizgi), getiri, en derin düşüş, işlem sayısı. Henüz demo hesapta çalışmayan bot için "gerçekleşmiş sonuç yok" yazar.
- **Model portföyler** (Nasdaq Momentum 10, BIST Momentum 10, %50 QQQ + %50 Hücum): kâğıt hesap endeksi (gerçek fiyatlarla, emir yok) ve kıyasları (QQQ al-tut, BTC al-tut …).

Her şey **yüzde / endekstir** (başlangıç = 100): bakiye, tutar, coin miktarı, emir kimliği ya da anahtar içermez. Backtest ve araştırma sonucu girmez — yalnız gerçekleşmiş demo / kâğıt sonuçları. Veri her sürümle yenilenir; kartta kaynak, tarih aralığı ve **"geçmiş sonuç geleceği göstermez"** notu vardır.

Kendi botların çalıştıkça sonuçların bot sayfasında görünür; kendi verisi olan kurulumda bu kart kapalı (tek satır) durur, tıklayınca açılır.

![Botlarımızın gerçekleşmiş sonuçları](ekran:bot-performans-1400)

## Binance bakiyesi — Avbl neden hesap değerinden küçük? {#binance-bakiyesi}

Binance emir kutusunda **Avbl** (kullanılabilir) yazan sayı ile Pusula'daki **Hesap değeri** farklıdır; ikisi de doğrudur, farklı şeyleri gösterir. Botlar › Hücum › **Hesap** görünümündeki **Binance bakiyesi** kartı yalnız bakiye dökümüdür: Binance'in kendi alanları, Binance ekranındaki adlarıyla (sayfa açıkken 12 sn'de bir yenilenir). **Paneldeki Kullanılabilir, Binance'in Avbl sayısının kendisidir** — Pusula onu hesaplamaz, Binance'ten okur.

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

Demo hesapta ~5.000 $ var, Hücum-S ise 1.000 $ sermaye tavanıyla çalışıyor. Bu durumda grafik, **Başlangıçtan** ve **En derin düşüş** botun **kendi sermayesi** üstünden hesaplanır: **bot değeri = 1.000 $ + (bugünkü hesap değeri − ilk gün hesap değeri)** (hesapta yalnız bot işlem yapar). Hesabın tamamına bölmek kâr/zararı beş kat küçültürdü; tavana kırpmak ise eğriyi düz 1,00 yapardı (64.5'ten önceki hata). Başlangıçtan kutusunda "bot sermayesi 1.000 $ (tavan) — hesap 4.949 $" yazar; grafikteki çizginin adı **Bot değeri (1.000 $ tavan)**. Botun Yönetim görünümünden kaydedilen para yatırma/çekme bot değerinden düşülür (yatırılan para kâr sayılmaz).

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

![Botlar › Hücum › Yönetim](ekran:botlar-eylem-1400)

Genel görünümde yalnız Durdur/Başlat ve Acil fren durur. Geri kalanı botun **Yönetim** görünümünde (`#/botlar/<bot>/yonetim`), yalnız seçili bot için:

| Satır | Ne yapar |
|---|---|
| Hesap türü | kâğıt ↔ demo (↔ CANLI HESAP, yalnız şartlar sağlanınca; altında neyin eksik olduğu yazar). Yalnız bot durmuşken değişir |
| Canlı hesap emir onayı | Yalnız canlı hesapta: **CANLI** yazarak verilir, kalıcıdır; "Emir onayını kaldır" kaldırır ([ayrıntı](#/kilavuz/botlar/gercek-para)) |
| Para yatırdım / çektim | Demo/canlı hesaba para ekleyip çektikten sonra tutarı (+/−) kaydedin: bot bunu kazanç/kayıp saymaz, gereksiz durdurma olmaz. Parayı taşımaz |
| Küçük hesap kipi | otomatik (< 5000 $) / açık / kapalı. Yalnız bot durmuşken değişir |
| BTC ayağı (kâğıt) | Yalnız **kâğıt hesapta**: **spot** (varsayılan) ya da **çoklu varlık (canlı tasarımı)**. Değiştirmek kâğıt hesabı sıfırlar (onaylı); bot durmuşken açık ([aşağıda](#/kilavuz/botlar/btc-ayagi)) |
| Bugünün kararını şimdi uygula | **Şimdi çalıştır** (onaylı) |
| Kâğıt hesabı sıfırla | Yalnız **kâğıt hesapta**: **Kâğıt hesabı sıfırla (temiz başla)…** — bot durmuşken açık ([aşağıda](#/kilavuz/botlar/kagit-sifirla)) |
| Kontroller | **Deneme (emirsiz)** bugünkü kararı emir vermeden gösterir · **Borsayla karşılaştır** · **Acil freni dene** (yalnız durmuş demo bot: dolmayacak küçük bir emir koyup acil freni sınar — demo hesaptaki TÜM pozisyonlar kapanır) |

### Kâğıt hesabı sıfırla (temiz başla) {#kagit-sifirla}

Kâğıt hesaptaki bir botu (ör. Denge) sıfırdan başlatmak için: önce **Durdur**, sonra Yönetim'de **Kâğıt hesabı sıfırla (temiz başla)…** ve onay. Bot yeni bir kâğıt hesapla başlar: sermaye ayarlardaki kâğıt bakiyesi (`kagitBakiye`, varsayılan 10.000 USDT), pozisyon ve işlem geçmişi boş. **İlk çalışmada geçmiş günler telafi edilmez** — bot bugünkü hedefe gider ve oradan devam eder.

- **Eski kayıtlar silinmez:** botun klasörü `data/live/<bot>-onceki-<tarih saat>` yedeğine taşınır (ör. `denge-onceki-20261020T083005Z`); istenirse oradan incelenir. Bildirim yedek klasörünün adını yazar.
- **Yalnız kâğıt hesap:** düğme demo ve canlı hesapta görünmez; sunucu da reddeder ("… kâğıt hesapta değil") — demo hesaptaki Hücum'un kayıtlarına (`hucum-demo`, demo kabul testi) dokunulamaz.
- **Bot çalışırken** düğme pasiftir ("Önce botu durdurun"); sıfırladıktan sonra **Başlat**.
- Telefondan ve araştırma kopyasından yapılamaz (yalnız sunucudaki masaüstü panel).

### BTC ayağı: spot ya da çoklu varlık {#btc-ayagi}

![Botlar › Denge › Yönetim: BTC ayağı (kâğıt)](ekran:botlar-denge-yonetim-1400)

Botun BTC payı kâğıt hesapta iki biçimde tutulabilir:

- **spot** (varsayılan): BTC doğrudan alınır, tutulur.
- **çoklu varlık (canlı tasarımı):** canlı hesapta kullanılacak biçim — BTC spotta alınır ve vadeli cüzdana **teminat** olarak aktarılır (Binance çoklu varlık modu; teminat BTC değerinin %95'i sayılır). Kâğıt hesapta bu akış taklit edilir: alım, aktarım, satış, iade, borsayla karşılaştırma her gün aynı adımlarla çalışır.

Canlı hesaba geçiş şartlarından **G7**, çoklu varlık akışının kâğıt hesapta **en az 14 gün** sorunsuz çalışmasını ister. Hücum demo kabul testinde olduğu için (demo hesapta BTC ayağı her zaman perp) bu deneme kâğıt hesaptaki bot (Denge) ile yapılır: önce **Durdur**, Yönetim'de **BTC ayağı (kâğıt)** → **çoklu varlık**, onay, sonra **Başlat**.

- Biçim değişince kâğıt hesap **sıfırlanmak zorunda** (iki biçimin kayıtları birbirine taşınmaz); eski kayıtlar [sıfırlamadaki gibi](#/kilavuz/botlar/kagit-sifirla) yedek klasöre taşınır.
- Demo hesapta bu satır görünmez (demo: perp); canlı hesap her zaman çoklu varlıkla çalışır.
- Telefondan ve araştırma kopyasından yapılamaz.

Hücum'un Yönetim görünümünün altında **Demo kabul süreci** kartı da durur (aynı kart [İleri test](#/kilavuz/ileri-test)'te). İki botun salt okunur özeti (durum, hesap türü, küçük hesap kipi, hesap değeri) **Ayarlar › Botlar (özet)**'te; her satırdaki **Yönet →** buraya getirir.

## Adım adım: botu demo modunda başlatmak {#demo-baslat}

Canlı hesap yoktur; demo hesap Binance'in sahte paralı ortamıdır.

1. Önce demo API anahtarını girin: [Ayarlar › Bağlantılar](#/kilavuz/hesaplar/anahtar).
2. Hesaplarda elle açılmış demo pozisyon varsa kapatın — bot tanımadığı pozisyonu görünce kendini durdurur (bilinçli güvenlik).
3. **Botlar › Hücum › Yönetim**'de **Hesap türü**nü **demo** yapın ve onaylayın. Aynı anda yalnız **bir** bot demo'da olabilir.
4. **Deneme (emirsiz)** ile bugünkü planı görün.
5. İsterseniz **Acil freni dene** — sonucu "önce 1 emir → sonra 0 emir / 0 pozisyon · borsayla uyumlu" olmalı.
6. **Botlar › Hücum › Genel**'de **Başlat**. Bot her gün kendiliğinden çalışır; hemen çalıştırmak için Yönetim › **Şimdi çalıştır**.
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
3. Botun bütün emirleri iptal edilir, açık pozisyonları piyasa fiyatından kapanır, bot **Durduruldu** olur.
4. Sonuç Telegram'a da gelir. Yeniden başlatmak için nedenini anlayın, sonra **Engeli kaldır** + **Başlat**.

> **Tehlike:** Acil fren geri alınamaz. Fiyat sert hareket ederken piyasa emri kötü fiyattan dolabilir. Yalnız gerçekten durdurmanız gerekiyorsa kullanın; sadece yeni emir vermesin istiyorsanız **Durdur** yeterlidir.

Bu bilgisayar araştırma modundaysa acil fren de kilitlidir — acil durumda sunucudaki paneli ya da telefonu kullanın.

**Telefondan (60.5):** telefonda Durdur/Başlat yoktur; yalnız kırmızı **Acil durdur** vardır. Basınca **acil PIN** ve **DURDUR** yazmanız istenir; ikisi doğru olmadan düğme açılmaz. PIN sunucuda `npm run acil-pin` ile belirlenir (tanımlı değilse telefondan acil durdurma kapalıdır). 15 dakikada 5 yanlış PIN → kilit + Telegram uyarısı. Ayrıntı: [Telefondan açmak](#/kilavuz/telefon/acil-pin).

## Durduruldu bandı {#durduruldu}

Bot kendini durdurduysa başlığın altında kırmızı bant ve sade bir neden görünür. Bot bu durumda yeni emir vermez (acil fren yine çalışır). İki ana neden:

1. **Borsa ile kayıtlar uyuşmuyor** (elle emir mi verdiniz?): nedeni bulun, düzeltin, banttaki **Borsayla karşılaştır** → temizse bot devam eder.
2. **30 günde gerçek sonuç simülasyondan %5'ten fazla ayrıldı:** [İleri test](#/kilavuz/ileri-test) ekranında inceleyin, sonra **Engeli kaldır** (onaylı).

## Hisse yapıları {#hisse-yapilari}

Üç model portföyün (Nasdaq Momentum 10, BIST Momentum 10, %50 QQQ + %50 Hücum) sanal hesapları Botlar sayfasında değil, **Portföy › Modeller**'de (model seçiciyle) ([Model portföyler](#/kilavuz/model-portfoy)).

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

## Araştırma kopyası ve telefon {#arastirma-telefon}

- Bu bilgisayar araştırma kopyasıysa başlığın altında gri **"Bu bilgisayardaki eski kayıt — asıl durum sunucudaki panelde"** notu çıkar; Telegram satırı "bu bilgisayarda bilinçli olarak kapalı" der (kurulum talimatı değil). Grafik düğmeleri (Canlı / Geçmiş) araştırma modunda da çalışır.
- Telefonda acil PIN tanımlı değilse kırmızı **Acil durdur** baştan pasiftir ve kartta nedeni yazar ("sunucuda: npm run acil-pin"). Yönetim görünümü telefonda yalnız bir not gösterir ("Bot ayarları yalnız sunucudaki panelden değişir").
- Demo hesapta BTC vadeli işlemde alım (LONG) olarak tutulur; canlı hesapta spot BTC olur (künyede "Demo / gerçek farkı").
- İşlem tablolarında miktar ve fiyat Türkçe biçimde (`0,0116`, `85.502,10`); grafik ekseni de öyle.
