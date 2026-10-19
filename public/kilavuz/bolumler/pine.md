# Pine betikleri {#pine}

> **Not:** Pine **Araştırma › Pine**'da (yeni panel; bir ara Arşiv'deydi, eski `#/arsiv/pine` adresi buraya açılır).

## Ne işe yarar {#ne-ise-yarar}

TradingView'de bulduğunuz bir **Pine Script** stratejisini panelde denemek: yapıştır → **Denetle** → **Kaydet** → **Backtest'te dene** / **Kâğıt testte dene**. Kaydedilen betik Stratejiler listesinde aday olarak görünür.

## Ne zaman kullanılır {#ne-zaman}

Bir betik bulduğunuzda, "bu panelde çalışır mı, geçmişte ne yapardı?" sorusu için.

## Ekran {#ekran}

![Pine betikleri](ekran:pine-1400)

## Adım adım: betik denemek {#betik-denemek}

1. **+ Yeni** ile boş betik açın; TradingView'deki betiği **Betik** kutusuna yapıştırın.
2. **Denetle**: desteklenmeyen her yapı **satır numarasıyla** listelenir. Hiçbir şey kaydedilmez.
3. Hata yoksa **Kaydet** (derlenmeyen betik kaydedilmez). Betik soldaki **Kayıtlı betikler** listesine girer ve stratejilerde "Pine" rozetiyle görünür.
4. **Backtest'te dene** ya da **Kâğıt testte dene** — ilgili ekran betik seçili açılır.

## Denetim raporu {#rapor}

| Satır | Anlamı |
|---|---|
| Kırmızı (hata) | Bu yapı desteklenmiyor; betik çalışmaz. Satırı değiştirin ya da betiği bırakın |
| Sarı (uyarı) | Çalışır ama TradingView'den farklı davranabilir (ör. dolum zamanı) |

> **Uyarı:** Panelin motoru emri sinyal barının **kapanışında** doldurur, TradingView ise **sonraki barın açılışında**. İşlem sayısı aynı kalır, tarihler bir bar kayabilir. Boyut, sermaye ve komisyon panelden gelir (betikteki değil).

## Sık sorulanlar {#sss}

**Betikte `strategy.exit` yoksa stop var mı?** Hayır; panel kendi stopunu eklemez (TradingView gibi).

**Göstergeler (indicator) çalışır mı?** Yalnız strateji (`strategy(...)`) betikleri işlem üretir.

## Uyarılar ve ne yapmalı {#uyarilar}

- **Denetim kırmızı satır verdi:** betik bu panelde çalışmaz; satırı değiştirin ya da başka betik deneyin. Panel desteklenmeyen yapıyı sessizce atlamaz — bu bilinçli.
- **Backtest "Pine çalışma hatası (bar …)":** betik belirli bir barda hata verdi; denetimden geçse de veriyle çalışırken bozulabilir. Hata mesajındaki tarihe bakın.
- Kaydedilen betik Stratejiler listesinde **Pine** rozetiyle görünür.
