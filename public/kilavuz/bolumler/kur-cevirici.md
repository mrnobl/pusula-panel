# Kur çevirici {#kur-cevirici}

Üst çubuktaki **Kur** düğmesi her ekrandan kur çeviriciyi açar (Esc ya da dışarı tıklama kapatır).

![Kur çevirici](ekran:kur-cevirici-1400)

## Nasıl kullanılır {#kullanim}

1. Miktarı Türkçe yazın: `1.000` = bin, `1.234,5` = bin iki yüz otuz dört buçuk; `1234.5` ve `0.25` de olur. Eksi ya da sıfır yazılırsa sonuç "—".
2. Kaynak ve hedef birimi seçin: **USD, TRY, EUR, GBP, gram altın, BTC**. **⇄** yer değiştirir.
3. Sonuç hemen yazılır; altta her kurun değeri, **kaynağı** ve **saati** listelenir.

## Kaynaklar {#kaynaklar}

| Kur | Kaynak (ücretsiz) |
|---|---|
| USD/TRY, EUR/USD, GBP/USD | Yahoo Finance (`USDTRY=X`, `EURUSD=X`, `GBPUSD=X`) |
| Gram altın | Yahoo `GC=F` (altın vadeli, ons) ÷ 31,1035 |
| BTC | Binance açık fiyat ucu (`BTCUSDT`) |

Kaynak satırları sade adla yazılır (Yahoo Finance, Binance). **Gram altın** uluslararası ons fiyatından (÷ 31,1035) hesaplanır; kuyumcu ve bankadaki gram altın fiyatı alış-satış farkı ve prim yüzünden farklıdır. Pencere açıkken Tab tuşu pencerenin içinde kalır, Esc kapatır.

Kurlar 10 dakika önbellekte tutulur; **Kurları yenile** hemen tazeler. İnternet yoksa diskteki son günlük kapanış kullanılır ve satır turuncu yazılır ("canlı değil").

## Uyarılar {#uyarilar}

- Kurlar bilgi amaçlıdır; banka/aracı kurum alış-satış makası dahil değildir.
- Portföy'deki TL ve USD toplamları (üst çubukta $ / ₺) aynı kurları (o günün kapanışı ya da son canlı kur) kullanır.
