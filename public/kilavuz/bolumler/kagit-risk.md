# Kâğıt test riski {#kagit-risk}

> **Not:** Kâğıt test riski **Arşiv › Kâğıt test riski**'nde; eski `#/arastirma/kagit-risk` adresi buraya açılır.

## Ne işe yarar {#ne-ise-yarar}

**Yalnız kâğıt test botlarının** risk kuralları: pozisyon büyüklüğü, stop/kâr al, volatiliteye göre stop (ATR), açık risk tavanı, düşüş merdiveni (sermaye kademeleri) ve acil fren. Hücum/Denge botlarını ETKİLEMEZ.

## Ne zaman kullanılır {#ne-zaman}

Kâğıt test botlarının ne kadar risk alacağını ayarlarken ya da kâğıt hesabın düşüşünü incelerken.

## Ekran {#ekran}

![Kâğıt test risk ayarları](ekran:kagit-risk-1400)

## Bölümler {#bolumler}

| Bölüm | Ne ayarlanır |
|---|---|
| Risk özeti | Kâğıt hesabın özsermayesi, düşüşü, açık riski |
| Pozisyon bazlı açık risk | Her açık pozisyonun stop'a kadar riski |
| Düşüş ve toparlanma | Düşüş/su altı grafiği (son 6 saat … tüm geçmiş) |
| Korelasyon kümeleri | Benzer hareket eden sembollerin toplam maruziyeti |
| Sermaye kademeleri (düşüş merdiveni) | Düşüş % → pozisyon çarpanı; "durdur" kutusu o kademede yeni girişi keser |
| Pozisyon çıkış kuralları | Stop %, kâr al %, iz süren stop |
| Pozisyon boyutu | İşlem başı risk, bot başı risk, en büyük pozisyon, en küçük emir |
| Volatiliteye göre stop (ATR) | ATR periyodu/çarpanı, alt-üst sınır, kâr/risk oranı |
| Açık risk tavanı | Tüm açık pozisyonların toplam riski |

## Adım adım: bir ayarı değiştirmek {#degistir}

1. Değeri yazın (ör. Stop % = 2).
2. Formun en altındaki **Risk ayarlarını kaydet** düğmesine basın; değişiklik çalışan kâğıt botlara bir sonraki tikte uygulanır.
3. Merdiveni bozduysanız **Varsayılan merdivene dön**.

## Uyarılar ve ne yapmalı {#uyarilar}

> **Not:** Risk ayarlarının TEK sahibi bu ekrandır; Stratejiler formu risk ayarına dokunmaz (iki form aynı alanı yazsaydı biri diğerini sessizce geri alırdı).

Vadeli (kaldıraçlı) kurulumda stop mesafesi likidasyon mesafesinin %80'inden genişse motor girişi reddeder — Araştırma › Strateji testi › Veri ve izleme listesi'ndeki kaldıraç notuna bakın.
