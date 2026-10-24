# Piyasa bağlamı {#piyasa-baglami}

## Ne işe yarar {#ne-ise-yarar}

"Bu hafta piyasada ne var, genel hava nasıl?" sorusunun cevabı (73.9'dan beri). Sayfanın başlığında **Karar kuralı yok · bilgi** yazar: buradaki **hiçbir gösterge botların kararına girmez**, sayfa emir vermez, ayar değiştirmez. Botlar kendi kurallarıyla çalışır ([Sinyaller](#/kilavuz/sinyaller)).

Kartlar yedi grupta:

| Grup | Kartlar |
|---|---|
| **Olay takvimi** | önümüzdeki 3 hafta: FOMC faiz kararı, TÜFE (Türkiye ve ABD), BIST bilanço son günleri, elle eklenen coin kilit açılımları; geçen 2 haftanın açıklanan sonuçları |
| **Makro pano** | net likidite, kısa vadeli faiz (^IRX) ve Fed politika faizi, sentetik dolar endeksi, USD/TRY, enflasyon, stablecoin arzı, BTC MVRV, kredi spreadi, COT (CME Bitcoin, Nasdaq-100) |
| **Opsiyon** | BTC ve ETH: gamma maruziyeti (GEX), max pain, ~30 günlük örtük oynaklık (IV), 25Δ çarpıklık, IV ve çarpıklık sırası, put/call |
| **Pozisyonlanma** | funding, açık pozisyon (OI) ve z-skoru, büyük hesapların long/short oranı, Hyperliquid'in en büyük 100 hesabı |
| **Akış** | taker al/sat oranı ve CVD, Coinbase primi, çeyreklik vadeli baz |
| **Duygu ve genişlik** | korku-açgözlülük, alt sezonu endeksi, RSI haritası |
| **Protokol kartı** | DefiLlama: son 30 günün ücreti en yüksek protokoller — gelir, TVL, piyasa değeri, P/F, P/S |

Pusula'da **strateji olarak sınanıp geçmeyen** göstergelerin kartının altında küçük bir not vardır: "bu gösterge strateji olarak sınandı, geçmedi: deneme N" (ör. net likidite 980, Coinbase primi 983, alt sezonu 984, kredi spreadi 985, stablecoin 773, korku-açgözlülük 908, MVRV 903). IV sırası ve çarpıklık için ön kayıt açıktır (986–987, sonuç bekleniyor).

Ana sayfada küçük bir **Bu hafta** kartı da vardır: bu haftanın olayları ve açıklananların sonucu, altta **Piyasa bağlamı →**.

## Ne zaman kullanılır {#ne-zaman}

- Haftaya başlarken: hangi gün FOMC, TÜFE, bilanço son günü var.
- Büyük bir hareket olduğunda "piyasada ne oluyor" diye bakmak için (funding, açık pozisyon, opsiyon, korku-açgözlülük).
- Bir olayın sonucunu görmek için (FOMC kararı, açıklanan TÜFE).

Karar vermek için değil: botların ne yapacağı bu sayfaya bağlı değildir.

## Ekran {#ekran}

![Piyasa bağlamı — takvim ve makro pano](ekran:piyasa-1400)

![Piyasa bağlamı — opsiyon ve pozisyonlanma](ekran:piyasa-winc-1400)

Her kartta: başlık, değerler (çoğunda küçük bir çizgi grafik), altta **kaynak · güncelleme sıklığı · veri zamanı**, sınandıysa deneme notu. Sayfanın en altındaki **Kaynaklar ve güncelleme sıklığı** katı her kaynağın son başarılı alınışını ve son hatasını gösterir.

## Kart durumları: bayat ve veri yok {#durumlar}

- **Bayat** (sarı rozet): kartın son verisi beklenenden eski. Değerler **soluk** gösterilir ve üstte "bayat — son veri ‹tarih› — ‹neden›" yazar (ör. kaynak hata verdi, kaynak yeni veri yayımlamadı, ABD hükümet kapanmasında CFTC raporu gecikti). Eski bir değer hiçbir zaman güncel gibi gösterilmez.
- **Veri yok** (kesikli çerçeve): kartın verisi hiç alınamadı; yalnız neden yazar (ilk toplama bekleniyor, kaynak hatası, ileriye kayıt henüz yazmadı, araştırma kopyası…).
- **Veri birikiyor: N gün**: IV ve çarpıklık sırası bir yıllık geçmiş ister; bu veri geriye dönük indirilemediği için 73.3'ten beri sunucuda birikir. 365 gün dolana kadar sıra hesaplanmaz, yalnız biriken gün sayısı yazar. OI z-skoru da en az 7 günlük saatlik veri ister.

## Kaynaklar ve güncelleme sıklığı {#kaynaklar}

Hepsi **ücretsiz ve anahtarsızdır**; istekler "Pusula/‹sürüm›" kimliğiyle gider, kişisel bilgi gönderilmez. Toplayıcı **yalnız sunucuda** çalışır; geliştirme bilgisayarındaki sayfa sunucunun verisini gösterir (sunucu bağlantısı kurulu değilse kartlar "veri yok — araştırma kopyası" der). Botların karar penceresinde (UTC 23:50–01:30, TR 02:50–04:30) ve 15 dakika öncesinde **hiç ağ isteği atılmaz**; Binance istekleri botla ortak istek bütçesinden geçer.

| Kart | Kaynak | Sıklık |
|---|---|---|
| Net likidite | FRED: Fed bilançosu (WALCL), Hazine hesabı (WTREGEN), ters repo (RRPONTSYD) | 6 saatte bir bakılır; veri haftalık (perşembe) |
| Faiz | Yahoo ^IRX (sunucunun portföy serisi) + FRED politika faizi (DFEDTARU/L) | iş günü |
| Dolar endeksi | Yahoo EURUSD, USDJPY, GBPUSD, USDCAD, USDCHF (sunucu) + SEK=X (12 saatte bir) | iş günü |
| USD/TRY | Yahoo USDTRY=X (veri orkestratörü) | iş günü |
| Enflasyon | ABD: FRED CPIAUCSL (BLS) · Türkiye: TCMB EVDS (TÜİK) | aylık |
| Stablecoin arzı | DefiLlama stablecoincharts | 12 saatte bir |
| MVRV | Coin Metrics Community | 12 saatte bir |
| Kredi spreadi | FRED BAA10Y (Moody's Baa − 10 yıllık hazine) | iş günü |
| COT | CFTC Traders in Financial Futures (CME Bitcoin 133741, Nasdaq-100 E-mini 209742) | 12 saatte bir; rapor haftalık |
| Opsiyon | sunucunun ileriye kaydı: OKX + Bybit + Binance opsiyon zinciri | 4 saatte bir görüntü |
| OI, long/short, taker, CVD | ileriye kayıt: Binance vadeli istatistikleri (1 saatlik) | 3 saatte bir |
| Hyperliquid | ileriye kayıt: liderlik tablosu + en büyük 100 hesabın pozisyonları | saatte bir |
| Funding, baz | Binance premiumIndex (tüm USDT perp) + çeyreklik vadeli bazı | saatte bir |
| Coinbase primi | Coinbase BTC-USD ve USDT-USD, Binance BTCUSDT (saatlik) | saatte bir |
| Korku-açgözlülük | alternative.me | 6 saatte bir; veri günlük |
| Alt sezonu, RSI | market.db Binance günlük mumları (veri orkestratörü) | günde bir |
| Protokol kartı | DefiLlama — coin taramasının gece arşivi | günde bir |
| Takvim | federalreserve.gov FOMC takvimi; FRED yayın takvimi (ABD TÜFE); TÜİK kuralı; SPK süreleri | haftada bir |

Sunucuda bir kaynak uzun süre alınamazsa [Sorunlar](#/kilavuz/sorunlar)'da mavi bir bilgi kartı çıkar ([ne yapmalı](#/kilavuz/sorun-giderme/piyasa-baglami-kaynak)). Kaynaklar [Veri › Coin tarama kaynakları](#/kilavuz/veri) envanterinde de günde bir yoklanır.

## Hesaplar nasıl yapılır {#hesaplar}

- **Net likidite** = Fed bilançosu − Hazine'nin Fed'deki hesabı − 1000 × gecelik ters repo (milyar $ → milyon $). Çarşamba verisi; ters repo o gün ya da en çok 7 gün öncesi.
- **Sentetik dolar endeksi** = 50,14348112 × EURUSD^−0,576 × USDJPY^0,136 × GBPUSD^−0,119 × USDCAD^0,091 × USDSEK^0,042 × USDCHF^0,036 (ICE formülü). Altı kurdan biri eksikse **değer üretilmez** (eksik kurla yaklaşık değer gösterilmez).
- **COT endeksi**: kaldıraçlı fonların net pozisyonu / açık pozisyonun son 52 rapordaki yeri (0 = en düşük, 100 = en yüksek; en az 26 rapor).
- **GEX** = Σ işaret × gamma × açık pozisyon (coin) × spot² × 0,01 — fiyat %1 oynayınca opsiyon piyasa yapıcılarının yapması beklenen alım-satımın dolar karşılığı. **İşaret bir varsayımdır**: müşterilerin alım opsiyonu sattığı, satım opsiyonu aldığı kabul edilir (piyasa yapıcı alımda uzun, satımda kısa gamma). Gerçek yönler açık veride yoktur. Gamma ve delta üç borsada da aynı Black-Scholes formülüyle Pusula'da hesaplanır (borsaların kendi greek birimleri farklı).
- **Max pain**: o vadede alıcılara ödenecek toplam iç değeri en aza indiren kullanım fiyatı (en yakın iki vade + açık pozisyonu en büyük vade).
- **ATM IV ve 25Δ çarpıklık**: 30 güne en yakın vade (7 günden kısa vadeler hariç), açık pozisyonu en büyük borsanın zinciri. Çarpıklık = delta −0,25 satımın IV'si − delta +0,25 alımın IV'si (puan); artı = düşüşe karşı koruma daha pahalı.
- **IV sırası** = (bugün − son 1 yılın en düşüğü) / (en yüksek − en düşük); 365 gün dolmadan hesaplanmaz.
- **OI z-skoru**: son 30 günün saatlik açık pozisyonuna göre bugünkü değer. **CVD**: Σ (piyasa emriyle alım − satım) hacmi, coin cinsinden.
- **Coinbase primi** = Coinbase BTC-USD / (Binance BTCUSDT × Coinbase USDT-USD) − 1.
- **Alt sezonu**: son 30 günün dolar hacmine göre ilk 30 altcoinin (BTC, stablecoin ve hisse/emtia vadelileri hariç) kaçının 90 günlük getirisi BTC'ninkini geçmiş (0–100; ≥ 75 alt sezonu, ≤ 25 BTC sezonu).
- **P/F ve P/S**: piyasa değeri / (30 günlük ücret ya da gelir × 365/30). DefiLlama'da piyasa değeri yoksa —.

## Olay takvimi {#takvim}

- **FOMC**: federalreserve.gov takvimi (sunucu haftada bir tazeler; okunamazsa depodaki liste kullanılır). Açıklama New York saatiyle 14:00 — TR'de yaz saatinde 21:00, kışın 22:00. Karar açıklanınca sonuç Fed'in açıklama sayfasından okunur (yedek: ertesi gün FRED politika faizi).
- **ABD TÜFE**: BLS'nin takvimi (FRED yayın takvimi üzerinden; BLS'nin kendi sayfası otomatik isteği kabul etmiyor). Açıklama 08:30 New York (TR 15:30 / 16:30). Açıklanınca FRED'den aylık ve yıllık değişim okunur.
- **Türkiye TÜFE — tahmini**: TÜİK ayın 3'ünde 10:00'da açıklar; 3'ü hafta sonuna denk gelirse pazartesi. Resmî takvim otomatik okunmadığı için kartta "(tahmini)" yazar; bayram kaydırması olabilir. Sonuç EVDS'den (veri orkestratörü, açıklamadan sonra 11:00 civarı).
- **BIST bilanço son günleri — tahmini**: SPK'nın yasal süreleri (3 ve 9 aylık 30 gün, konsolide 40; 6 aylık 50 / 60; yıllık 60 / 70). Açıklanan bilançoların özeti ayrı bildirimdir ([Bilanço özeti](#/kilavuz/bildirimler/yeni)).
- **Coin kilit açılımları**: otomatik **ücretsiz kaynak yok** (Tokenomist otomatik erişimi yasaklıyor, API ücretli; DefiLlama'nın kilit verisi ücretli). Yalnız elle eklenenler görünür — aşağıya bakın.

### Elle olay eklemek {#elle-olay}

Sunucuda veri klasöründe `piyasa-olaylar.json` dosyası (yoksa oluşturun) — her satır bir olay:

```
[
  { "gun": "2026-11-12", "saat": "14:00", "baslik": "ARB kilit açılımı (dolaşımın %2'si)", "tur": "kilit" },
  { "gun": "2026-11-20", "baslik": "Bir başka olay", "tur": "diger", "not": "kısa açıklama" }
]
```

`gun` YYYY-AA-GG (İstanbul günü), `saat` isteğe bağlı (SS:DD, İstanbul), `tur` "kilit" ya da "diger". Geçersiz satır atlanır. Dosya bir sonraki sayfa yenilemesinde okunur; Telegram hatırlatması da bu olaylara gelir.

## Telegram {#telegram}

İki bildirim türü ([Bildirimler](#/kilavuz/bildirimler/yeni)), aç/kapat, metin, kanal ve sessiz saat oradan:

- **Piyasa takvimi** — pazartesi **09:00**'dan sonra haftanın olayları **tek mesaj** (bu hafta olay yoksa mesaj gelmez) + her olaydan **bir gün önce 18:00**'den sonra "Yarın: …" hatırlatması. Saatler ayarlanabilir.
- **Olay sonucu** — olay açıklanınca **sonuç**: FOMC kararı ("Fed politika faizini %3,75–4,00 aralığında sabit bıraktı."), açıklanan TÜFE (aylık ve yıllık değişim). Yalnız rakam, yorum ve öneri yok. Bilanço sonuçları burada **yoktur** — onlar Bilanço özeti bildiriminde (aynı şey iki kez gelmez). Sunucu 3 günden uzun kapalı kaldıysa eski olayların sonucu sonradan gönderilmez.

## Uyarılar ve ne yapmalı {#uyarilar}

- Bu sayfa bir **bilgi panosudur**; alım-satım önerisi değildir. Kartlardaki "artı / eksi", "alt sezonu", "aşırı korku" gibi ifadeler göstergenin kendi tanımıdır, yorum değildir.
- Bir kart **bayat** ya da **veri yok** diyorsa çoğu zaman bir şey yapmanız gerekmez: toplayıcı kendisi yeniden dener. Bir haftadan uzun sürerse kaynak adresi değişmiş olabilir — sohbete yazın.
- Geliştirme bilgisayarında kartlar sunucudan gelir; sunucuya ulaşılamazsa son alınan kopya gösterilir ve üstte "sunucuya ulaşılamadı — son kopya ‹zaman›" yazar.
- Opsiyon, OI ve Hyperliquid kartları sunucunun **ileriye kaydına** bağlıdır ([Veri › İleriye kayıt](#/kilavuz/veri)); kayıtçı yazmazsa bu kartlar bayatlar.
- Türkiye TÜFE ve bilanço son günleri **tahminidir** (kurala göre); resmî takvim değişirse kayabilir.
