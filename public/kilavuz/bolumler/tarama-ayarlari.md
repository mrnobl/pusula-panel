# Tarama ayarları {#tarama-ayarlari}

## Ne işe yarar {#ne-ise-yarar}

Coin taramasının ayarları: **izleme listesi** (coin ekle / düzelt / çıkar), **kaynaklar** (aç/kapa), **eşikler**, **aralıklar** (otomatik tarama 20 saat, gecikme uyarısı 36 saat), **Telegram** ve **denetim kaydı**. Her elle değişiklik kim/ne zaman/eski → yeni olarak denetim kaydına yazılır.

## Ne zaman kullanılır {#ne-zaman}

- Yeni bir coini izlemeye almak ya da yanlış eşleşen sözleşmeyi/ağı düzeltmek için.
- Bir coinde anlamsız bulduğunuz bayrağı yok saymak için.

## Ekran {#ekran}

![Tarama ayarları](ekran:tarama-ayarlari-1400)

## Adım adım: coin eklemek {#coin-ekle}

1. **Coin ekle**.
2. Sembol, ağ ve sözleşme adresi (Solana'da mint) yazın; borsada işlem görüyorsa borsa sembolü.
3. Kaydedin. Bir sonraki taramada coin tabloda görünür.

## Adım adım: düzeltmek ya da çıkarmak {#duzelt}

- **Düzelt**: sözleşme, ağ, borsa sembolü ya da "yok sayılacak bayraklar" (ör. büyük projelerde "mint yetkisi"). Coinin kimliği değişmez, geçmiş kayıtları korunur.
- **Çıkar** (onaylı): coin izlemeden çıkar; **geçmiş kayıtları silinmez** (özette "izlemede değil").

## Diğer ayarlar {#diger}

| Ayar | Anlamı |
|---|---|
| Kaynaklar | GoPlus, RugCheck, DexScreener, RDAP, borsa açık; CoinGecko **kapalı** gelir (koşulları verinin saklanmasını yasaklıyor). GeckoTerminal Coin taramadan çıkarıldı (her taramada istek sınırına takılıyordu) |
| Eşikler | Bayrakların sınırları (başlangıç değeri, ön kayıt değil) |
| Otomatik aralık / gecikme | 20 saat / 36 saat |
| Telegram | Uyarıları Telegram'a da gönder (kapalı gelir) |
| Dikkat listesi bildirimi | [Dikkat listesine](#/kilavuz/dikkat-listesi) yeni giren coinleri günde bir mesajla Telegram'a gönder: yalnız coin adı ve kural kodu (açık gelir) |
| Şimdi tara · Zinciri doğrula · Özeti yeniden üret | Başlıktaki düğmeler; "özeti yeniden üret" eşik değişince tabloyu ham kayıttan yeniden kurar |

## Uyarılar ve ne yapmalı {#uyarilar}

Eşikleri sonuca bakarak sık değiştirmek, bayrakları "istediğimiz gibi" göstermeye başlar. Değişiklikleri denetim kaydı tutar; birkaç ay birikmeden eşiklere dokunmamak önerilir.
