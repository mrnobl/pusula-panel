# Modeller (model portföyler) {#model-portfoy}

**Portföy › Modeller** üç model portföyü tek sayfada toplar; sayfanın üstündeki **model seçicisi** aralarında geçer: **Nasdaq Momentum 10** (mavi), **BIST Momentum 10** (kırmızı), **%50 QQQ + %50 Hücum** (mor). Seçili model adreste durur ([#/portfoy/nasdaq](#/portfoy/nasdaq), [#/portfoy/bist](#/portfoy/bist), [#/portfoy/q837](#/portfoy/q837)). Model sayfasındaki her rakam **botun kendi sanal hesabındandır** (kâğıt hesap, canlı hesap değil): bot kuralına göre hisse seçer ve alır-satar; 2026-10-12 açılışından beri gerçek fiyatlarla izlenir. Senin gerçek hesabın burada değil: [Pano](#/kilavuz/portfoy/pano) ve [Hesaplar](#/kilavuz/portfoyum/kayit). Ayın açık emirleri Ana sayfadaki **Yapman gerekenler**'de de yazar.

Aynı kâğıt hesaplar **Botlar › Portföy botları**'nda (QQQ M10 · BIST M10 · 837) bot gibi de izlenir — her biri kendi sayfasında: karar günleri grafikte, hisse grafiğinde nerede alıp sattığı, karar defteri (alındı / alınamadı ve nedeni) ve CSV'li işlem geçmişi ([Portföy botları](#/kilavuz/portfoy-botlari)).

## Ekran {#ekran}

![Modeller — Nasdaq Momentum 10 seçili](ekran:model-portfoy-1400)

Yukarıdan aşağıya:

1. **Başlık ve kural** (modelin renginde), düz Türkçe:
   - **Nasdaq Momentum 10:** her ayın son işlem günü Nasdaq-100 hisselerini son 12 ayda en çok yükselenden (son ay hariç) sıralar, en güçlü 10'unu eşit paylarla (%10'ar) tutar; düşen satılır, giren alınır (ertesi işlem günü açılışında).
   - **BIST Momentum 10:** aynı kural, ama aday havuzu Borsa İstanbul'da son 3 ayda en çok işlem gören 30 hisse.
   - **%50 QQQ + %50 Hücum:** yarısı QQQ'da, yarısı Hücum kripto botunda; Hücum payı %40'ın altına düşer ya da %60'ı geçerse yarı yarıya dengelenir. Hisse seçimi yok.
   Altında sıradaki karar günü (ör. "30 Ekim kapanışı → 2 Kasım açılışında alım-satım") yazar.
2. **Sayılar:** başlangıçtan getiri · **aynı dönemde kıyas** (QQQ al-tut ya da BIST 30; "hiçbir şey yapmasaydı") · en derin düşüş · değer · nakit.
3. **Bu ay** kartı: bu ayın kararını **kendi hesabına** uygulamak için girmen gereken emirler ve **Uyguladım** ([ayrıntı](#/kilavuz/tasarimci/bu-ay)).
4. **Grafik — iki görünüm** ve yanında **hisse bazında kâr / zarar** çubukları:
   - **Canlı takip:** kâğıt hesabın 2026-10-12'den beri değeri (başlangıç 100) ve kıyas çizgisi; ▲ alış, ▼ satış. İkinci işlem gününden sonra çizgi görünür.
   - **Geçmiş — backtest:** kuralın geçmişte nasıl davranırdığı (Nasdaq M10 2004'ten, BIST M10 2012'den; aylık, başlangıç 100), kıyasla birlikte; altın gölgeler kriz dönemleri, altta düşüş şeridi. **İyimserdir:** kural bugün bilinenle geçmişe uygulandı ve çok deneme arasından seçildi (H1) — gelecekte aynısı olmayabilir. %50 QQQ + %50 Hücum'un tek bir geçmiş eğrisi yoktur; iki yarısı (QQQ ve Hücum simülasyonu) ayrı çizilir.
   Canlı takipte 20 günden az veri varken ekran Geçmiş ile açılır.
5. **Botun elindekiler** (adet, ortalama maliyet, son fiyat, değer, kâr/zarar, pay) ve yanında **aday havuzu** (aşağıda).
6. **İşlem geçmişi** (katlı) ve kâğıt hesabın kuralları.
7. Hangi model seçili olursa olsun sayfanın altında ortak: **Ayarlar** (her modele ayırdığın sermaye, kesirli hisse, en küçük işlem, tutarları telefonda gizleme, Portföyüm hedefi — [ayrıntı](#/kilavuz/tasarimci/sermaye)) ve katlı **Ayrıntılı izleme**.

## Aday havuzu {#aday-havuzu}

![Aday havuzu — sıradaki karar bugün verilse](ekran:model-havuz-1400)

Nasdaq M10 ve BIST M10 kartında **"Aday havuzu — sıradaki karar bugün verilse"** tablosu, bir sonraki ay sonu kararının bugünkü veriyle önizlemesidir:

- Üstte tek cümle: **"30 Ekim kararında çıkacak: … · girecek: …"** (ya da "liste değişmiyor").
- **Sıra · Hisse · Son 12 ay getirisi (son ay hariç) · Durum.** İlk 10 sıra alınır.
- **Elde · kalıyor:** model bu hisseyi tutuyor ve ilk 10'da kalıyor.
- **Elde · çıkacak** (kırmızı satır): model tutuyor ama ilk 10'un dışına düştü — kararda satılır. Sıralamaya hiç girmiyorsa (evren/üyelik dışı ya da verisi eksik) sıra "—" ve nedeni yazar.
- **Girecek** (yeşil satır): ilk 10'da ama model tutmuyor — kararda alınır.
- **Yedek aday:** 11–15. sıra; ilk 10'dan biri düşerse yerine girecek olanlar.

Ne kadar kesin?
- **Nasdaq M10:** puanlar geçmiş ay sonu kapanışlarından hesaplanır (ör. 30 Ekim kararı için Eylül sonu ve geçen yılın Ekim sonu), bu yüzden karar gününe kadar neredeyse değişmez; liste yalnız Nasdaq-100 üyeliği değişirse ya da bir hissenin verisi kesilirse değişir.
- **BIST M10:** "en çok işlem gören 30 hisse" karar günü yeniden hesaplanır; kenardaki hisseler girip çıkabilir — tablo **tahmindir**.

Kesin karar ay sonu kapanışında kendiliğinden verilir ve dondurulur. Önizleme tasarımcı zamanlayıcısıyla (30 dakikada bir) yenilenir.

## BIST Momentum 10 {#bist}

![BIST Momentum 10 kâğıt hesabı](ekran:model-bist-1400)

BIST Momentum 10 TL hesaptır; kıyas **BIST 30 (XU030)**. Aday havuzu BIST için **tahmindir** (evren karar günü yeniden hesaplanır). Kâğıt hesabın kuralları kartın altında yazar: Midas BIST komisyonsuz, kayma %0,05, tam adet, temettü stopajı %15, nakde faiz yok; mevcut hissede küçük düzeltme yapılmaz.

- **Kâğıt hesabın sermayesi** "Modeller sayfasının altındaki Ayarlar"daki model sermayesidir (sunucuda). Kesirli hisse ayarı açıksa ABD hisseleri kesirli alınır; BIST her zaman tam adet.
- **"Sermaye tam adet için yetmiyor"** uyarısı: listedeki hisselerin bir kısmı alınamadı ve paranın %5'ten fazlası nakitte; sermaye ya da kesirli hisse kararı gerekir.
- Telefonda "tutarları gizle" açıksa tutarlar "—", grafik yüzde olarak görünür.

## Ayrıntılı izleme {#ayrintili}

![Ayrıntılı izleme: üç model yan yana](ekran:model-izleme-1400)

Sayfanın altındaki katlı **"Ayrıntılı izleme"** üç modeli yan yana gösterir (eskiden ayrı bir sekmeydi): model endeksi (100 taban; kesirli, faizli, sabit komisyonsuz ideal model — kâğıt hesaptan biraz farklıdır), başlangıçtan getiri, en büyük düşüş, BIST M10 için TL getirisi ve kıyasların (QQQ, BTC, XU030, EW-BIST30) aynı dönem getirisi; model başına grafik, [model ↔ gerçek](#/kilavuz/model-portfoy/fark), [aylık tablo](#/kilavuz/model-portfoy/aylik), **karar günlüğü** (dondurulmuş listeler, eksik veri, doğrulama, kayıt: "resmî (sunucu)" ya da "deneme") ve en altta [aylık dışa aktarım](#/kilavuz/model-portfoy/disari).

Kıyas çizgileri modelin işlem günlerine **tarihe göre ileri doldurulur**: NYSE, BIST ve kripto (her gün) takvimleri farklıdır; bir kıyasın o gün verisi yoksa önceki son değeri kullanılır, olmayan değer uydurulmaz.

### Henüz başlamadıysa {#bos}

Günlük kayıt boşken (2026-10-12 öncesi ya da geliştirme bilgisayarında) ayrıntılı izleme **"Model 2026-10-12 açılışında başlıyor; ilk değer o gün kapanıştan sonra"** der; kâğıt hesap kartında "Geçmiş" grafiği yine görünür.

## Model ↔ gerçek: uygulama farkı {#fark}

Modeller sayfasındaki "Bu ay" kartında **Uyguladım** dediğiniz andan itibaren ayrıntılı izlemede her modelin altında **"Model ↔ gerçek (Portföyüm)"** bölümü dolar.
O güne kadar bölüm "Gerçek karşılaştırma ilk Uyguladım kaydından sonra başlar" der.

- **Gerçek çizgi:** grafikte mavi kesikli **"Gerçek (Portföyüm)"** çizgisi. İlk Uyguladım gününden önce 100 kabul edilir;
  para yatırma/çekme getiriyi değiştirmez (zaman ağırlıklı getiri, TWR).
- **Gerçek kolun kapsamı:** yalnız o modelin Uyguladım kayıtları (hisseler) + modele ayırdığınız nakit (model sermayesi;
  Nasdaq/BIST M10'da model endeksiyle büyütülmüş hâli). 837'de ayrıca **Binance hesabının tamamı** (Hücum kolu). Elle
  girdiğiniz diğer işlemler bu karşılaştırmaya girmez.
- **Uygulama farkı:** gerçek getiri − model getirisi, aynı günlerde; "bu ay" ve "başlangıçtan". Eksi = gerçek portföy
  modelin gerisinde.
- **Fark neden oldu** (katlı tablo) — bileşenlerin toplamı farka eşittir:
  1. **Dolum fiyatı:** aracı kurumda modelin açılış fiyatından pahalı alıp ucuz sattığınız kısım (geç girilen emir dahil).
  2. **Nakitte kalan pay:** tam adet yuvarlaması (kesirli hisse yok) ya da alınmayan tutar nakitte kaldıkça kaçan getiri.
  3. **Ücret:** aracı kurum ücretleri (modelin kendi kayma maliyeti düşülmüş olarak).
  4. **Uygulanmayan / atlanan:** "Bu ay atla" dediğiniz ya da model işlem yaptığı hâlde hiç Uyguladım girmediğiniz ay.
  5. **Kalan:** ölçülemeyen kısım (zamanlama, kur, kısmi uygulama, fiyat kaynağı farkı).

## Kol katkısı {#katki}

Katlı **"Kol katkısı"** tablosu, getirinin hangi kalemden geldiğini puan olarak gösterir: 837'de QQQ (çekirdek), Hücum
(uydu) ve dengeleme maliyeti; Nasdaq/BIST M10'da hisse başına. Model ve gerçek yan yana. Günlük katkılar **Carino**
yöntemiyle bağlanır, böylece kalemlerin toplamı dönemin toplam getirisine eşittir. Altında en çok katkı veren ve
götüren üç hisse yazar. BIST M10'un model katkıları TL üzerindendir.

## Aylık tablo {#aylik}

Her model için ay ay: model getirisi, gerçek getiri, fark ve modelin kıyasları (QQQ, BTC, XU030, EW-BIST30); her yılın
sonunda **yıl toplamı** satırı (aylar bileşik). İlk ayda gerçek getiri ilk Uyguladım gününden başlar.

## Aylık dışa aktarım {#disari}

Ayrıntılı izlemenin en altındaki **Aylık dışa aktarım** listesi, tamamlanan her ay için yazılan dosyaları gösterir: ay, **SHA-256**
özeti (üstüne gelince tamamı) ve **zincir** durumu. Her dosya bir öncekinin özetini taşır; bir dosya sonradan değiştirilir
ya da araya dosya girerse satır kırmızı **"BOZUK"** olur ve listenin üstünde "Zincir BOZUK" yazar.

- **JSON / CSV:** dosyanın kendisi ve tablo hâli — yalnız 100 tabanlı endeks, kol getirileri, dondurulmuş listeler;
  **tutar yoktur**.
- **CSV + gerçek:** gerçek portföy endeksini ve değerini de ekler; yalnız bu bilgisayardaki panelden indirilir (telefonda
  görünmez), git'e gitmez.
- Resmî dosyalar sunucuda (`kayitlar/model-portfoy/`), bu bilgisayardakiler "deneme"dir
  (`data/tasarimci/disari/model-portfoy/`).

## Tutar {#tutar}

Ayrıntılı izleme yalnız 100 tabanlı endeksi gösterir. Model için gerçek bir tutar girdiyseniz (Modeller sayfasının altındaki Ayarlar; sunucuda `data\tasarimci\sermaye.json`) tutar sütunu ve kutusu da görünür; kâğıt hesap kartları bu sermayeyle hesaplanır. Tutar git'e, Telegram'a ve `kayitlar/`a gitmez.

## Ne işe yarar {#ne-ise-yarar}

Botların hisseyi neye göre seçtiğini, elinde ne tuttuğunu ve **bugünden sonra** ne yaptığını dürüstçe görmek. Geçmiş ölçümler çok denemeden seçildi; asıl sınav ileri dönemdir.

## Ne zaman kullanılır {#ne-zaman}

Haftada ya da ayda bir bakmak yeter; ay sonundan önce aday havuzuna bakıp neyin girip çıkacağını görebilirsiniz. Kısa dönem sonuçlarına göre strateji değiştirmeyin (12–24 ay).

## Uyarılar ve ne yapmalı {#uyarilar}

- **"Veri bayat: …":** son işlem gününün verisi gelmedi; o gün modele yazılmaz (eksik veride gün atlanır, sonra tamamlanır). [Veri](#/kilavuz/veri).
- **"Aday havuzu henüz hesaplanmadı":** tasarımcı zamanlayıcısı ilk tikini atmadı (panel açıldıktan birkaç dakika sonra dolar).
- **"bozuk defter satırı atlandı":** defter dosyası elle değiştirilmiş olabilir; geliştirme sohbetine bildirin.
- **Karar "deneme (gelistirme)":** bu bilgisayardaki koşu; resmî kayıt sunucudadır.
