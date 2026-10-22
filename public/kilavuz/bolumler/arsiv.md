# Arşiv {#arsiv}

## Ne işe yarar {#ne-ise-yarar}

Artık kullanılmayan bölümler, geri dönmek gerekirse diye durur. Yan menüde Arşiv'in altında (66.0): **Genel · Kâğıt test · Kâğıt test riski · Emekli botlar**.

- **Genel:** **Eski stratejiler** (testte elenenler; tıklayınca Stratejiler'de ayrıntısı açılır), **Elle emir** (botlardan bağımsız tek emir, demo hesap) ve **İzleme listesi taraması** (izleme listesindeki sembollerde en iyi 5 stratejiyi tarar).
- **Emekli botlar:** **Donchian trend botu** (eski tek-varlık bot) ve **Kalkan botu** (ayrı bot olarak emekli; Kairos/Tao Kalkan kolunu içeriyor) — salt okunur kartlar.
- **Kâğıt test** ve **Kâğıt test riski** kendi bölümlerinde: [Kâğıt test](#/kilavuz/kagit-test) (kâğıt test hesabı da orada), [Kâğıt test riski](#/kilavuz/kagit-risk).

Pine ve Araştırma defteri artık Araştırma'da. Kod silinmedi.

## Ne zaman kullanılır {#ne-zaman}

Genelde kullanılmaz. Eski bir sonucu yeniden üretmek ya da karşılaştırmak için.

## Ekran {#ekran}

![Arşiv › Genel](ekran:arsiv-1400)

![Arşiv › Emekli botlar](ekran:arsiv-emekli-1400)

## Alanlar {#alanlar}

| Bölüm | Not |
|---|---|
| Eski stratejiler | Testte elenen stratejiler ve durum rozeti. Backtestte kıyas için Backtest › Gelişmiş › "Arşivdeki (elenen) stratejileri de göster" |
| Elle emir | Katlı: bağlantı kutusu (durum, emir üst sınırı, saat farkı) + form → sembol, yön, tür, miktar → **Önizle** → geçerliyse **Emri gönder** (demo hesap). Bot başlamadan önce elle açtığınız pozisyonu kapatın: bot tanımadığı pozisyonu görünce kendini durdurur |
| Donchian trend botu | **Salt okunur**: durum ve son hesap; **Kuru hesapla (emir vermez)** bugünkü hedefi gösterir (borsa bağlantısı ister). BTC al-tut'u yenemediği için **başlatılamaz**; bir şekilde çalışıyorsa yalnız **Botu durdur** görünür |
| Kalkan botu | **Salt okunur** kart (yalnız kâğıt): durum, özsermaye, son karar günü, sermaye tavanı. Başlatma düğmesi yok; çalışıyorsa yalnız **Durdur** |
| İzleme listesi taraması | Uzun sürebilir; sonuçlar tablo olarak gelir |

## Uyarılar ve ne yapmalı {#uyarilar}

> **Uyarı:** Arşivdeki bot güncel araştırmayla desteklenmiyor; gerçek sermaye kararı için kullanmayın.
