# Veri ve izleme listesi {#izleme}

## Ne işe yarar {#ne-ise-yarar}

**Araştırma › Strateji testi › Veri ve izleme listesi** (63.0'a kadar Ayarlar'daydı). Aynı alt menünün sonundaki **Gösterge havuzu ↗** ayrı sayfayı açar (63.3). İki ayar, ikisi de **botları etkilemez**:

- **Piyasa verisi:** borsa ve piyasa tipi (spot / vadeli, kaldıraç) — yalnız Kâğıt test motoru ve Botlar ekranındaki canlı grafiğin mum kaynağı. **Kairos ve Tao her zaman Binance'te çalışır**; Backtest kendi borsa seçimini kullanır.
- **İzleme listesi:** backtest, grafik ve izleme listesi taramasında kullanılan semboller.

## Ne zaman kullanılır {#ne-zaman}

- Backtestte ya da coin taramasında yeni bir sembol kullanmadan önce (listeye ekleyin).
- Botlar ekranındaki canlı grafiğin borsasını değiştirmek için.

## Ekran {#ekran}

![Veri ve izleme listesi](ekran:izleme-1400)

## Alanlar {#alanlar}

- Vadelide **kaldıraç** yazarken panel motorun gerçek kuralını gösterir: likidasyon ≈ %(100 / kaldıraç − 0,5) uzakta; stop bundan genişse giriş reddedilir. 20x ve üstünde "çoğu strateji hiç işlem açamaz" uyarısı çıkar.
- **İzleme listesi:** sembol yazıp **Listeye ekle**; ✖ ile çıkarın (onay sorar). Rozet seçili zaman dilimindeki mum önbelleğini gösterir. **Fiyat geçmişini önceden yükle** o zaman dilimindeki mumları indirir (backtest eksik mumu kendisi de indirir).

## Uyarılar {#uyarilar}

- Araştırma kopyasında kayıt düğmeleri kilitlidir (sunucu da reddeder); ayarlar sunucuda değiştirilir.
