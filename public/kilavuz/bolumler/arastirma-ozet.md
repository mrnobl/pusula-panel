# Araştırma özeti {#arastirma-ozet}

## Ne işe yarar {#ne-ise-yarar}

"Araştırma nerede duruyor?" sorusunun tek ekranlık cevabı. Araştırma menüsü bu sayfayla açılır (66.0). Bilgi [Araştırma defteri](#/kilavuz/defter)'nden gelir; sayfa yalnız okur, hiçbir şey yazmaz.

- **Dört sayı:** toplam deneme (en yüksek numara ve kayıt sayısı) · **Kabul** (ileri teste ya da kullanıma geçen) · **Red** (kenar bulunamayan) · **Süren** (gölge + açık; kaçının hüküm günü belli olduğu).
- **Hükmü yaklaşanlar:** gölge ve açık denemeler hüküm gününe göre sıralı, kalan gün sayısıyla. Sağ üstte [İleri test](#/kilavuz/ileri-test) bağlantısı.
- **En çok denenen aileler:** hangi fikir ailesinde kaç deneme yapıldığı.
- **Son kayıtlar:** deftere en son yazılan denemeler ve durumları. Sağ üstte Araştırma defteri bağlantısı.
- En altta Stratejiler, Backtest, Portföy laboratuvarı ve Kitapçık'a kısa yollar.

## Ne zaman kullanılır {#ne-zaman}

- Haftada bir: yaklaşan hüküm günü var mı, araştırma hangi ailede yoğunlaştı.
- Yeni bir deneme düşünmeden önce: o aile zaten çok mu denendi?

## Ekran {#ekran}

![Araştırma › Özet](ekran:arastirma-ozet-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Toplam deneme | Defterdeki en yüksek kullanılmış numara; altında kayıt (satır) sayısı — bir satır bir numara aralığını anlatabilir |
| Kabul / Red | Bu durumdaki numaraların sayısı (aralıklar uzunluğu kadar sayılır) |
| Süren (gölge + açık) | Hâlâ ölçülen denemeler; hüküm günü yazılı olanlar "Hükmü yaklaşanlar" tablosundadır |
| Durum rozeti | **KABUL** yeşil · **RED** kırmızı · **gölge** mor · **açık** sarı · **bilgi** mavi |
| Kalan | Hüküm gününe kalan gün |

## Uyarılar ve ne yapmalı {#uyarilar}

- **"Defter henüz aktarılmadı"**: `kayitlar/denemeler.jsonl` bu bilgisayarda yok ya da okunamadı — [Araştırma defteri](#/kilavuz/defter)'ndeki uyarıya bakın.
- Sayılar hüküm değildir: süren bir denemenin hüküm gününden önce "geçti / kaldı" diye okunmaması gerekir.
