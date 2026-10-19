# Gösterge havuzu {#gosterge-havuzu}

## Ne işe yarar {#ne-ise-yarar}

Panelin bütün göstergeleri (53 gösterge, 8 grup) tek sayfada: her birinin **ne olduğu**, **grafikte nasıl okunduğu**, hangi ayarları olduğu ve gerçek fiyat verisinde nasıl göründüğü. Botlar da ayrı bir grupta listelenir ("grafikte bot ne gördü": stopu, bantları, girdiği ve girmediği yerler). Sayfa ayrı bir sayfa olarak açılır: **Araştırma › Strateji testi › Gösterge havuzu ↗** (63.3'e kadar Sinyaller ekranındaydı), Backtest'teki "Gösterge havuzu ↗" bağlantısı ya da tarayıcıda `/indicators.html`. Sayfanın üstündeki **← Pusula** düğmesi Araştırma › Stratejiler'e döner.

Bu sayfa **araştırma aracıdır**: göstergeler alım-satım kararı vermez. Botların kullandığı kurallar ve sonuçları Stratejiler ile Backtest ekranlarındadır.

## Ne zaman kullanılır {#ne-zaman}

- Bir ekranda geçen gösterge adını (EMA, RSI, VWAP, FVG, Order Block…) merak ettiğinizde: sayfanın solundaki arama kutusuna yazın.
- Bir göstergenin ayarını değiştirip (ör. RSI dönemi 14 → 7) gerçek veride nasıl değiştiğini görmek istediğinizde.
- Bir botun grafikte "ne gördüğünü" (stop çizgisi, girişler, yutulan sinyaller) incelemek istediğinizde: **Botlar** grubundan seçin.

## Ekran {#ekran}

![Gösterge havuzu](ekran:gosterge-havuzu-1400)

| Alan | Anlamı |
|---|---|
| Gösterge ara | Ad, grup ve açıklama içinde arar (ör. "likidite", "ortalama") |
| Gruplar | Hareketli ortalamalar · Hacim · Fiyat dönüşümü · Momentum (hız) · Oynaklık · Piyasa yapısı · ICT / akıllı para kavramları · Çok sembollü; parantezdeki sayı gruptaki gösterge sayısıdır. ⚯ işaretli göstergeler birden çok sembolü karşılaştırır, grafik önizlemesi yoktur |
| Başlık satırı | Grup · tür (seri, seviyeler, bölgeler, olaylar) · **ısınma**: ilk kaç mumda değer üretilmez |
| Nedir / Nasıl okunur | Göstergenin sade tanımı ve grafikte okunuşu |
| Çıktılar tablosu | Her çıktının adı, nerede çizildiği (fiyat grafiği ya da kendi paneli), çizim türü (çizgi, işaret, kutu…) ve değer türü (her mumda değer · ara sıra değer (olay) · liste) |
| Parametreler | Türkçe adlarıyla; üzerine gelince kod adı (ör. "Dönem (mum sayısı)" = `period`). Seçenekler Türkçe (kapanış, günlük, Londra…) |
| Çizilecek çıktılar | Hangi çıktı grafikte görünsün ve rengi |
| Sembol · Zaman dilimi · Mum sayısı · Hesapla | Önizlemenin verisi; **Hesapla** grafiği çizer |
| Ayarı kaydet | Bu göstergenin parametrelerini adlandırarak bu tarayıcıda saklar |

## Adım adım: bir göstergeyi denemek {#adim-adim}

1. Soldan bir gösterge seçin (ör. Momentum › RSI).
2. "Nedir / Nasıl okunur" satırlarını okuyun.
3. Parametreyi değiştirin (ör. Dönem 14 → 7), sembol ve zaman dilimini seçin.
4. **Hesapla**. Grafik ve altında son değerler görünür.

## Uyarılar ve ne yapmalı {#uyarilar}

- **Isınma:** göstergenin ilk N mumu boştur (ör. 200 günlük ortalama ilk 200 günde değer üretmez). Bu kasıtlıdır; boş yer "0" gibi okunmaz.
- **Salınım noktaları ve yapı** (tepe/dip, BOS/CHoCH, FVG…) oluştukları mumda değil **onaylandıkları** mumda bilinir; grafikte geriye dönük çizilir. Geçmişe bakıp "burada dönmüş" demek, o anda bilinmeyen bilgiyi kullanmaktır.
- **"Aşırı alım / aşırı satım"** tek başına al-sat kuralı değildir; güçlü eğilimde gösterge uzun süre bu bölgede kalabilir.
- Botlar grubundaki aynı adlı iki içe aktarılan Pine botu, anahtarı ve içe aktarma günüyle ayrılır.
- Terimlerin kısa tanımları [Sözlük](#/kilavuz/sozluk) bölümündedir.
