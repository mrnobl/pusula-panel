# Veri {#veri}

## Ne işe yarar {#ne-ise-yarar}

"Verilerim güncel mi, bir kaynak bozulursa ne etkilenir?" (63.2'den beri):

Yan menüde Veri'nin altında üç sayfa var (66.0): **Kaynaklar** (aşağıdaki özet ve gruplar) · **Coin tarama kaynakları** ([aşağıda](#/kilavuz/veri/dikkat-kaynaklari)) · **Günlük arşiv** ([aşağıda](#/kilavuz/veri/gunluk-arsiv)).

- **Kaynaklar sayfasının üstünde üç büyük durum:** Bot ve portföy verisi (ör. "15 / 15 güncel") · Coin tarama kaynakları ("18 / 19 çalışıyor") · Günlük arşiv ("zincir sağlam"). Sorun varsa sarı / kırmızı.
- **Kullanana göre katlı gruplar:** **Botlar** (Binance günlük, PIT arşivi, TradFi listesi, coin sepeti önbelleği) · **Portföy ve modeller** (USD/TRY, TEFAS, Yahoo Nasdaq, Yahoo BIST, Yahoo kıyas serileri, TÜFE, TL mevduat) · **Araştırma** (Yahoo portföy ekleri, portföy kataloğu, ileri test izleyicisi, coin tarama) · **Coin tarama kaynakları** · **Günlük arşiv**. Sorunsuz grup kapalı gelir (yalnız özet satırı), sorunlu grup açık.
- Her satırda **Kim kullanıyor** etiketleri (Hücum, Denge, Portföyüm, Nasdaq M10, BIST M10, Laboratuvar…): bir kaynak bozulursa neyin etkileneceği görünür. Kaynaklar kendiliğinden tazelenir; satırdaki **Güncelle** ya da altta **Bayatları güncelle** ile elle de güncellenir.

## Ne zaman kullanılır {#ne-zaman}

- Ana sayfa "veri kaynağı bayat / hata" dediğinde.
- Bir simülasyonun hangi tarihe kadar veriyle koştuğunu merak ettiğinizde.
- Coin tarama / dikkat listesinde bir bayrak "veri yok" ya da "bilinmiyor" dediğinde: hangi kaynağın düştüğünü ve neyi etkilediğini görmek için.

## Ekran {#ekran}

![Veri › Kaynaklar — özet ve gruplar](ekran:veri-1400)

![Veri › Coin tarama kaynakları](ekran:veri-dikkat-1400)

![Veri › Günlük arşiv](ekran:veri-arsiv-1400)

## Kaynaklar {#kaynaklar}

| Kaynak | Ne zaman tazelenir |
|---|---|
| Binance market veritabanı (perp + spot günlük + funding) | her gün 00:30 UTC |
| Binance PIT arşivi (delist dahil) | ayda bir |
| Binance TradFi listesi | haftalık |
| USD/TRY, TCMB mevduat, TÜFE, TEFAS | iş günü akşamı / Cuma / ayın 3'ü |
| Yahoo (ABD ETF, Nasdaq, portföy varlıkları) | iş günü New York kapanışından sonra |
| Coin sepeti önbelleği (eski adı kol önbelleği), katalog önbelleği | bağlı kaynak değişince |
| Coin tarama, ileri test izleyicisi | kendi zamanlamaları (yalnız durum) |

## Coin tarama kaynakları {#dikkat-kaynaklari}

Ekranda kaynakların görevleri sade adlarla yazılır (63.2): BAĞLAM → **piyasa havası**, EVREN keşfi → **yeni coin bulma**, KAÇIN kapısı → **uzak dur kontrolü**, İZLE temel → **temel değer göstergeleri**, ÖLÜ protokol izi → **batmış proje kaydı**, D6 / D9 / F4 → **araştırma testi verisi**, CEX / DEX → **merkezi / merkeziyetsiz borsa**. Yedeği olan kaynakta "Bozulursa" sütunu gri **yedek var — kayıp yok** yazar; turuncu yalnız gerçekten bir işaret kaybolacaksa.


Dikkat listesi (KAÇIN / İZLE) için kullanılan ücretsiz kaynaklar: Coin Metrics, DefiLlama (ücret/gelir, TVL, stablecoin), GeckoTerminal, DexScreener, CoinGecko, Snapshot, Binance/Bybit/OKX, Tokenomist, GitHub, BGeometrics, Bitview, GoPlus, RugCheck, İş Yatırım, TCMB EVDS3; ayrıca anahtar gerektiren RPC'ler (Alchemy, QuickNode, Etherscan — sınanmaz).

Tablo varsayılan olarak **sade üç sütundur** (61.1); teknik ayrıntı altta katlıdır. Tablonun üstündeki **Terimler** satırında CEX, DEX, EVM, RPC, kota, ToS ve envanter için "?" açıklaması vardır.

| Sütun | Anlamı |
|---|---|
| Kaynak | ad ve ne için kullanıldığı |
| Çalışıyor mu | son sınamanın rozeti (**çalışıyor**, **kısmi**, **çalışmıyor**, **anahtar gerekli**) ve son 30 günün tek cümlelik özeti (isteklerin ne kadarı yanıtlandı ya da kaç günün kaçında çalıştı; "veri yok" cevabı da başarıdır) |
| Bozulursa ne kaybolur | bu kaynak düşerse hiç üretilemeyecek işaretler (turuncu); yedek kaynağı olan ya da henüz kullanılmayan kaynakta gri "yedek var — kayıp yok" |

**Teknik ayrıntı** katı (tıklayınca açılır) eski dört sütunlu tabloyu gösterir: HTTP kodu ve gecikme, anahtar gerekip gerekmediği, belgelenmiş kota ve günlük kullanım, son yanıttaki "kalan" başlığı, başka kaynakla süren bayraklar ("yedekle sürer"), "planlı" kapılar; satırın üzerine gelince kullanım koşulları / lisans notu.

Tarihler bu ekranın her yerinde aynı biçimdedir: gün **07.10.2026**, zaman **07.10.2026 17:27**.

- **Envanter** elle ya da zamanlanmış görevle koşar: `node scripts/dikkat-f0-envanter.js` (her uca bir istek; sonuç `data/dikkat/`). `--md` özet tabloyu `referans/DIKKAT-KAYNAK-ENVANTERI.md` dosyasına da yazar.
- **Anahtar gerekli** bir hata değildir: kaynak anahtarsız denenmiş, beklenen 401/403 alınmıştır. Panel hiçbir anahtar istemez.
- **Tokenomist** sayfaları otomatik erişimi yasaklar; unlock bilgisi elle girilir (betik sayfaları çekmez).

## Günlük arşiv {#gunluk-arsiv}

Dikkat listesinin **ileriye dönük ham kaydı** (F1; liste üretmez). Her gece aday evren (Binance CEX kanadı + sol/base/eth/bsc/arbitrum DEX kanadı; **giren ve elenen her token nedeniyle**), izlenen her token için kaynak başına ham görüntü (GoPlus, RugCheck, DexScreener, GeckoTerminal, DefiLlama, CoinGecko, GitHub, Snapshot) ve bağlam serileri (Coin Metrics, BGeometrics, Bitview, DefiLlama stablecoin) kaydedilir; günün dosyaları SHA-256 manifest zinciriyle mühürlenir. Kart: son kayıt günü, kesintisiz gün sayısı (hedef 7), boşluk günleri, zincir sağlam mı ve son koşunun kaynak başına **ok / boş / hata / kota / uygulanmaz** sayıları.

- **Resmî kayıt** sunucuda Görev Zamanlayıcı ile gece 00:30 UTC'de koşar (`scripts/install-dikkat-gorev.ps1`; komut `npm run tarama:gunluk -- --neden zamanlanmis --resmi`). İlk resmî gün "başlangıç" olarak işaretlenir; kaçan gün sonradan doldurulamaz, "boşluk" satırı yazılır.
- **Deneme** koşuları (`npm run tarama:gunluk -- --neden elle`) ayrı dizine yazılır ve resmî sayaçlara girmez.
- **Hata**, **kota** (GitHub gibi bütçeli kaynaklarda "ertelendi") ve **belirsiz** (Binance tabanının CoinGecko eşlemesi tek anlamlı değil) "bilinmiyor" sayılır; **uygulanmaz** (ağa uygun değil, eşleme ya da repo yok — eşleme kaynağı o gün çalıştıysa) hesaba girmez — ön kaydın payda kuralı.
- Evren eşikleri henüz yok: 30 resmî kayıt gününden sonra bir kez, önceden yazılmış kuralla sabitlenir (`npm run evren:esik`; daha önce reddeder).

## Adım adım: elle güncellemek {#guncelle}

1. Satırdaki **Güncelle** (tek kaynak) ya da en alttaki **Bayatları güncelle**.
2. İş arka planda çalışır; bitince durum "güncel" olur.

## Kaynak hatası bildirimleri {#kaynak-bildirimleri}

Coin taramasında bir kaynak hata verirse (ör. "GeckoTerminal: 2/14 coinde veri alınamadı — istek sınırına takıldı (429) — bir sonraki taramada yeniden denenir") sağ altta **balon yalnız Coin tarama ve Veri ekranında** çıkar; diğer ekranlarda (Portföy, Ana sayfa…) içeriği kapatmasın diye yalnız menüdeki sayı rozeti artar. Bu ekranlardan birini açtığınızda bekleyen uyarı bir kez balon olur. "429" kaynağın istek sınırı demektir; bir şey yapmanız gerekmez.

## Uyarılar ve ne yapmalı {#uyarilar}

- **Bayat:** çoğu gece kendiliğinden düzelir (hafta sonu ve tatillerde yeni veri yayımlanmaz — bu bayat sayılmaz).
- **Hata:** ağ ya da kaynak sorunu; 2 saat sonra yeniden dener (günde ≤ 3).
- **Dikkat kaynağı "çalışmıyor":** bir gün düşmesi önemli değil; 30 g başarı oranı düşüyorsa "Bozulursa üretilemez" sütunundaki bayraklar o günlerde "bilinmiyor" olur. Ön kayda göre bir aile 2 ay üst üste günlerin ≥ %30'unda veri alamazsa ilgili hipotez "veri yetersiz" ile kapanır.
- **Binance beklemesi:** Binance istek sınırına yaklaşıldı; canlı botu korumak için veri indirmesi bekler. Kendiliğinden geçer — elle zorlamayın.
