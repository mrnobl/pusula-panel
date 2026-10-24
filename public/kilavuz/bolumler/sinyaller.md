# Sinyaller {#sinyaller}

## Ne işe yarar {#ne-ise-yarar}

"Bugün sistem ne diyor, ne zaman fikir değiştirebilir?" (63.3'ten beri). Botların ve model portföylerin **bugün uyguladığı kurallar** tek tabloda; her satırda kuralın bugünkü kararı, karara ne kadar uzak olduğu, sıradaki karar günü ve kuralı kimin uyguladığı. Sayfa **yalnız okur**: hiçbir emir vermez, ayar değiştirmez.

| Kural | Bugün ne diyor | Karara uzaklık | Kim uyguluyor |
|---|---|---|---|
| **BTC trendi** | yükselişte (BTC tut) / düşüşte (nakitte bekle) | içerideyken kapanışın 100 günlük ortalamaya uzaklığı (ortalamanın altına inerse çıkar); dışarıdayken girmek için eksik koşul | Kairos, Tao |
| **Coin sepeti trendi** | 15 coinden kaçı trendde (en az bir Donchian penceresi açık) | en yakın iki çıkış (kapanışın pencere stopuna uzaklığı) | Kairos, Tao |
| **Nasdaq momentum (M10)** | elde tutulan 10 hisse | sıradaki ay sonu kararında çıkacak / girecek hisseler; değişiklik yoksa 10. ile 11. sıranın farkı | Nova |
| **Dengeleme bandı** | dengede / bant dışında | Kairos payı ve banda kalan puan (%40–60 dışına çıkınca 50/50'ye dönülür) | Simurg |
| **BIST momentum (M10)** — gri | aynı kural, BIST'te | sıradaki kararın **tahmini** (evren karar günü yeniden hesaplanır) | Lydia (kâğıt model, canlıya alınmaz) |

"Karara uzaklık" çubuğu kısaldıkça kural fikir değiştirmeye yaklaşır; %3'ten yakınsa sarı yazılır.

Kripto kuralları botların **kendi kural koduyla** (BTC: 50/100/200 günlük ortalama kuralı; coin sepeti: 9 pencereli Donchian) Binance günlük verisinden hesaplanır; hisse kuralları Portföy › Model portföyler'deki sıradaki karar önizlemesinden okunur.

## Ne zaman kullanılır {#ne-zaman}

- "Bot bugün neden BTC tutuyor, ne olursa satar?" sorusunda.
- Ay sonu yaklaşırken: Nova ve Lydia'da hangi hisse çıkıp hangisi girecek.
- Bir gölge kural (İleri test) bugün uygulanan kuraldan farklı bir şey söylüyorsa görmek için.

## Ekran {#ekran}

![Sinyaller](ekran:sinyaller-1400)

## Bölümler {#bolumler}

- **Uygulanan kurallar** — yukarıdaki tablo.

![Coin sepeti coin coin ve Nova sınırı (katlı, açılmış)](ekran:sinyaller-ayrinti-1400)

- **Coin sepeti — coin coin** (katlı): her coin için açık pencere sayısı (9 üzerinden), en yakın çıkış ve en yakın giriş (kapalı pencerenin kırılım seviyesine uzaklık; eksi = altında). Bir pencerenin kapanması coinin payını 1/9 azaltır, coin bütünüyle satılmaz. Yıllık oynaklık %130'un üstündeyse yeni pencere açılmaz (not sütununda yazar). Liste o ayın 30 günlük ortalama işlem hacmine göre ilk 15 coindir (botun evren kuralı).
- **Nova — sıralamanın sınırı** (katlı): 8.–13. sıradaki hisseler ve çıkacak / girecek olanlar, 12 aylık getirileriyle. Sıralama geçmiş ay sonu kapanışlarıyla yapıldığından karar gününden önce de kesine yakındır.
- **Gölge kurallar** — yalnız izlenen, **uygulanmayan** kurallar: Bollinger'li kural, 3 günlük karar, yatay piyasa filtresi. "Bugün ne derdi" ve uygulanan kurala göre farkı (farklıysa sarı). Ayrıntı ve grafikler: [İleri test](#/kilavuz/ileri-test).

## Uyarılar ve ne yapmalı {#uyarilar}

- Sayfa bir **durum göstergesidir**, işlem önerisi değildir; kararı botlar ve modeller kendi takvimlerinde verir.
- Kripto değerleri son **kapanmış** günün verisiyledir; veri bayatsa [Veri](#/kilavuz/veri) ekranından güncelleyin. Hesap ilk açılışta birkaç saniye sürer, sonra 30 dakika bellekte tutulur.
- Bu bilgisayardaki satırlar araştırma kopyasıdır; botun kendi durumu [Botlar](#/kilavuz/botlar) ekranındadır. Coin sepeti listesi botun ay başında borsadan kurduğu listeyle aynı kuralla hesaplanır.
- Gölge kurallarda ara raporda hüküm verilmez.
- Funding, stablecoin arzı ve MVRV gibi göstergeler bilerek yoktur: testlerinde elendiler ve karar vermiyorlar. Bilgi olarak (karar kuralı olmadan) [Piyasa bağlamı](#/kilavuz/piyasa-baglami) sayfasındadırlar.
- **Gösterge havuzu** 63.3'te buradan **Araştırma › Strateji testi › Gösterge havuzu ↗**'ya taşındı ([Gösterge havuzu](#/kilavuz/gosterge-havuzu)).
