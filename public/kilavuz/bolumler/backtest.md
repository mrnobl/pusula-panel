# Backtest {#backtest}

## Ne işe yarar {#ne-ise-yarar}

Bir stratejiyi geçmiş veride çalıştırıp "bu fikir işe yarar mıydı?" sorusunu ölçer. Form sadedir (62.9): **Strateji · Coin · Zaman dilimi · Tarih aralığı** ve **Backtest çalıştır**. Borsa, piyasa, başlangıç sermayesi, test türü (**Tek koşu** / **Walk-forward** / **Optimizasyon**) ve arşivdeki stratejiler katlı **Gelişmiş** bölümündedir. Emir vermez.

## Ne zaman kullanılır {#ne-zaman}

- Yeni bir stratejiyi ya da Pine betiğini ilk kez denerken.
- Bir parametrenin sonucu nasıl değiştirdiğini görmek için.
- Hücum / Denge'nin geçmiş davranışına bakmak için (strateji "Hücum"/"Denge", 1 gün).

## Ekran {#ekran}

![Backtest ayarları](ekran:backtest-1400)

![Backtest sonucu](ekran:backtest-sonuc-1400)

## Adım adım: ilk backtest {#ilk-backtest}

1. **Strateji**, **Coin** ve **Zaman dilimi** seçin (strateji listesi: çalışan botlar · adaylar · geçti, kullanılmıyor). Kuralı gün cinsinden yazılmış bir strateji (Hücum, Denge, Donchian, kitap stratejileri) seçince zaman dilimi **kendiliğinden 1 gün** olur ve altında kısa bir not çıkar; sonra başka bir dilim seçerseniz "bu strateji yalnız 1 gün mumla anlamlı" uyarısı görünür (koşu engellenmez ama sonuç anlamsızdır ve iş çok uzun sürer).
2. **Tarih aralığı**: kısayollar (Tümü · 5 yıl · 3 yıl · 1 yıl · 6 ay · 1 ay · 1 hafta) ya da tarihleri elle girin. **Veri kapsamı** kutusu borsadaki ilk mumu, mum sayısını ve tahmini süreyi gösterir.
3. Gerekirse **Gelişmiş**'i açın: borsa, piyasa (spot / vadeli + kaldıraç), **başlangıç sermayesi** (varsayılan 10.000 USDT), test türü.
4. **Backtest çalıştır**. İlerleme çubuğu çıkar; **İptal** ile durdurulabilir.
5. Sonuç sağda: beş ana sayı ve ana grafik.

## Sonuç alanları {#sonuc}

| Alan | Anlamı |
|---|---|
| Getiri | Dönemin toplam getirisi (net, komisyon dahil) |
| Al-tut'a göre | Stratejinin getirisi − aynı dönemde sembolü alıp tutmanın getirisi (puan). Eksi = al-tut daha iyiydi |
| Sharpe | Getirinin oynaklığa oranı (yıllık); 1 civarı iyi, kısa dönemde gürültülü |
| En büyük düşüş | Tepeden en derin düşüş (MaxDD) |
| İşlem + kazanma | İşlem sayısı ve kazanan işlem oranı |
| Botun tamamı (yalnız Hücum/Denge) | Sonucun EN ÜSTÜNDE dört büyük sayı: botun TAMAMI (BTC ayağı + Kalkan kolu ×3, 15 coin) aynı tarih aralığında — yıllık bileşik (CAGR), toplam getiri ve al-tut farkı, en büyük düşüş, Sharpe. **Asıl sonuç budur.** Altındaki açılır kutuda eğri ve yıllık tablo. Onların altındaki beş sayı ve ana grafik yalnız **BTC ayağıdır** (botun BTC işlemleri, kol hariç) — "Hücum kaybettiriyor" sanılmasın diye ayrı etiketlidir |
| Ana grafik | Özsermaye (kalın), "aynı getiriler başka sırayla" bandı (%5–%95), al-tut (gri), kriz dönemleri (altın gölge), **ısınma dönemi (gri gölge: göstergeler doluyor, işlem yok)**, altta düşüş. Dikey eksen Türkçe kısaltmayla: "30 bin $", "1,2 mn $" |
| Ayrıntılı analiz | Kâr faktörü, beklenti, varsayımlar, kâr yapısı, fiyat grafiği ve işlemler, düşüş dönemleri |
| İşlem listesi | Tür ve sebep Türkçe: "Satış — uzun kapandı", "Uzun pozisyon kapandı: kapanış SMA100 altında (…)"; yüzdeler virgüllü ("−%4,50"). CSV dosyası motorun ham kaydını taşır |
| Test edilen ayarlar | Parametreleri değiştirip **Yeniden test et**; beğendiğinizi **Bu ayarları bota yükle** (kâğıt test botuna) |

## Walk-forward ve optimizasyon {#wf-opt}

**Gelişmiş** bölümündeki test türü düğmelerinden seçilir (Tek koşu · Walk-forward · Optimizasyon); seçince formun altındaki düğme ve sağdaki sonuç alanı o türe geçer.

- **Walk-forward:** veri kayan pencerelere bölünür; her pencerede bulunan en iyi ayar bir sonraki görülmemiş dilimde denenir. Geçmişe uydurmayı yakalar.
- **Optimizasyon:** "Aranacak parametreler" kutularından seçtiğiniz parametrelerin ızgarasını tarar; en iyi 10 ayar tabloda. Kutular **seçili stratejinin kendi parametreleridir** ve strateji değişince yeniden çizilir.

> **Uyarı:** Optimizasyonun en iyi sonucu neredeyse her zaman iyimserdir (çoklu deneme). Kararı walk-forward ve ileri test sonucuna göre verin.

## Uyarılar ve ne yapmalı {#uyarilar}

- **"Likidasyon" uyarısı** (vadeli, yüksek kaldıraç): sonuç stratejiyi değil kaldıracı ölçüyor; kaldıracı düşürün.
- **"motorla birebir değil" (Pine):** TradingView emri sonraki barın açılışında, panel sinyal barının kapanışında doldurur; tarihler bir bar kayabilir.
- **Aynı adlı iki içe aktarılan Pine botu** listede anahtarı ve içe aktarma günüyle ayrılır (ör. "… (pine_x_2 · içe aktarma 2026-10-09)"); gereksiz olanı Pine ekranından silin.
- **Uzun aralık + küçük zaman dilimi** çok mum demektir; veri indirme ve süre artar (Veri kapsamı kutusunda tahmin).
- **Isınma aralığın içinden yenir:** Hücum/Denge 200 günlük ortalamayı kullanır; "1 yıl" seçilirse ilk 200 gün ısınmadır ve yalnız ~5 ay ölçülür, CAGR bu kısa dönemden yıllıklandığı için abartılı görünür. Hücum/Denge için en az **3 yıl** seçin; kutu kısa ölçümde bunu ayrıca yazar.
