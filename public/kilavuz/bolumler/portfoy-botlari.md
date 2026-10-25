# Portföy botları {#portfoy-botlari}

## Ne işe yarar {#ne-ise-yarar}

Model portföylerin **kâğıt hesapları** Kairos ve Tao gibi izlenen botlardır. Yan menüde **Botlar › Portföy botları** altında üç öğe — her biri **kendi sayfası**, sayfa içinde sekme yok. Açtığınız [model örnekleri](#/kilavuz/portfoy-botlari/model-ornegi) de aynı yerde, modelinin hemen altında bir kademe içeride ayrı öğe olarak listelenir:

| Menüde | Adres | Ne yapar | Kıyas (al-tut) |
|---|---|---|---|
| **Nova** | [#/botlar/m-qqq-m10](#/botlar/m-qqq-m10) | Nasdaq Momentum 10: her ayın son işlem günü Nasdaq-100'ün son 12 ayda (son ay hariç) en güçlü 10 hissesi, %10'ar; ertesi işlem günü açılışında alım-satım | QQQ al-tut |
| **Lydia** | [#/botlar/m-bist-m10](#/botlar/m-bist-m10) | BIST Momentum 10: aynı kural, aday havuzu son 3 ayda en çok işlem gören 30 hisse (TL) | BIST 30 (XU030) al-tut, TL |
| **Simurg · %50 QQQ + %50 Kairos** | [#/botlar/m-837](#/botlar/m-837) | Paranın yarısı QQQ, yarısı Kairos (simülasyon); Kairos payı %40–60 dışına çıkınca yarı yarıya dengelenir | QQQ al-tut |

Kâğıt hesap = botun **sanal hesabı** (canlı hesap değil): modelin ay sonu kararlarını gerçek açılış fiyatından uygular (**tam adet**; ABD'de kesirli hisse ayarı açıksa — 73.4'ten beri varsayılan — bölünmüş adet), Midas komisyonu öder (ABD emir başına 1,5 $, BIST yok), temettü alır, bölünmede adet değişir; nakde faiz yoktur. Yeni karar üretmez — kararlar modelinkiler. Telefondan da tam okunur ("tutarları gizle" açıksa tutarlar "—", grafik yüzde). Kendi gerçek hesabına uygulamak için emirler Portföy › [Modeller](#/kilavuz/model-portfoy) › Bu ay'da.

## Model örnekleri — ikinci kâğıt hesap (74.6) {#model-ornegi}

Bir modelin kararlarını **farklı bir sermayeyle** de izlemek isterseniz (ör. Nova'yı 5 000 $ ile: tam adet ve komisyon küçük hesapta ne kadar kaybettirir?) aynı modelden bir **örnek** açılır. Örnek, modelin **aynı aylık kararlarını** kullanır; **kâğıt hesabı ayrıdır** (kendi sermayesi, kendi işlemleri, kendi grafiği). Ana kâğıt hesap (yukarıdaki üç sayfa) değişmez.

1. **Ayarlar › Botlar › Bot kayıtları › Yeni bot**: **Kural** listesinden **Nova örneği** (USD), **Lydia örneği** (TL) ya da **Simurg örneği** (USD) seçin.
2. **Başlangıç**: **modelin ilk günü** (ana kâğıt hesapla aynı dönem — iki sermayeyi baştan karşılaştırmak için) ya da **yarından itibaren** (bugünden sonraki kararlarla, ileriye doğru).
3. **Kâğıt sermayesi** (modelin para biriminde; Lydia'da TL), **kimlik** (küçük harf/rakam, ilk iki harf her botta farklı; "nova" gibi bot adları kimlik olamaz) ve **görünen ad** (ör. "Nova-5k") → **Oluştur…** → onay. PIN istenmez.
4. Örnek hemen **yan menüde** görünür: Botlar › Portföy botları altında, modelinin (Nova / Lydia / Simurg) altında bir kademe içeride kendi adıyla (masaüstünde ve telefon menüsünde aynı). Arşivlenen örnek menüden düşer. İlk hesap tasarımcının **sonraki 30 dakikalık hesabında** yapılır. Örnek **kendi sayfasında** açılır (`#/botlar/<kimlik>`): bu sayfayla aynı düzen; başlıkta "Nova örneği" ve başlangıç rozeti, altında **"Nova kâğıt hesapları: Nova (ana) · Nova-5k"** geçiş satırı. Botlar › [Özet](#/kilavuz/botlar/ozet)'te, Ayarlar › Botlar özetinde ve Ana sayfanın "Portföy botları" satırında da görünür.

- **Yalnız kâğıt:** model örneği gerçek emir vermez; bu sürümde **borsa hesabı bağlanmaz, demo ya da canlı moda geçilmez** (denerseniz açık bir ret yanıtı gelir). Başlat/Durdur, acil fren ve sağlık sinyali yoktur — model botları gibi ay sonu kararıyla kendiliğinden işler.
- **Kurallar ana kâğıt hesapla aynı:** tam adet (ABD'de kesirli hisse ayarı Portföy › Modeller › Bu ay › Ayarlar'dan gelir), komisyon, temettü, bölünme. "Model ↔ kâğıt fark" örneğin başlangıcına göre hesaplanır.
- **Sermaye** Bot kayıtları tablosundaki **Kâğıt…** düğmesiyle değişir (onay); değişiklik kâğıt hesapta o gün **para yatırma / çekme** olarak işlenir, getiri bozulmaz.
- **Arşivle…** örneği listelerden kaldırır ve hesaplamayı durdurur; kaydı ve kâğıt hesap dosyaları silinmez, **Geri getir…** ile döner (kâğıt hesap baştan yeniden hesaplanır).
- Alım-satım olan her gün için Telegram'a örneğin kendi adıyla özet gider (tutar yok, yalnız emir sayısı ve yüzde); günlük/haftalık raporun "Portföy botları" bölümünde de yer alır.
- Örnek kaydı (`live/botlar/<kimlik>.json`) ve kâğıt hesabı (`tasarimci/ornekler/<kimlik>/`) **kişisel veridir**: yedeğe ve taşıma dosyasına girer.

## Ne zaman kullanılır {#ne-zaman}

- Aynı modeli iki farklı sermayeyle karşılaştırmak için: [model örneği](#/kilavuz/portfoy-botlari/model-ornegi).
- Ay sonu kararından sonra: bot neyi aldı, neyi alamadı (neden), neyi sattı.
- "Model ↔ kâğıt fark" büyüyorsa: tam adet ve komisyon ne kadar kaybettiriyor.
- Bir hissede ne zaman, kaça alıp satıldığını görmek için (hisse grafiği).

## Ekran {#ekran}

![Botlar › Nova](ekran:portfoy-botlari-1400)

Yukarıdan aşağıya:

1. **Başlık:** botun adı, "kâğıt hesap — canlı hesap değil", piyasa/para, kural düz Türkçe. Bu bilgisayar araştırma kopyasıysa "Resmî kayıt: sunucudaki panelden okundu" (aşağıda).
2. **Sayılar:** **Özsermaye** (altında yatırılan) · **Getiri** (başlangıç → son gün) · **Kıyas al-tut** aynı günlerde (bot kaç puan önde/geride) · **En derin düşüş** · **Model ↔ kâğıt fark** (model kesirli alır, nakde faiz verir; fark uygulama kaybıdır) · **İşlem · komisyon** ve **sıradaki karar** günü (Simurg'da "dengeleme her QQQ işlem günü denetlenir").
3. **Portföy değeri ve karar günleri:** kalın çizgi kâğıt hesap, kesikli çizgi kıyas (aynı başlangıç), dikey çizgiler karar uygulama günleri (Simurg'da yerleşim ve dengeleme günleri; ince çizgi Kairos kolu). İmleci bir günün üstüne getirince grafiğin altında o günün değeri ve — karar günüyse — kararın listesi yazar (alındı / elde kaldı / satıldı / alınamadı).
4. **Hisse grafiği — nerede aldı, nerede sattı:** üstte çipler — **● elde** olan hisseler ve **Geçmiştekiler** (alınıp satılmışlar). Seçili hissenin günlük kapanışı (kâğıt hesabın kullandığı ham fiyat) üstünde ▲ alış, ▼ satış; imleç işaretin üstündeyken adet, fiyat, komisyon ve hangi karar olduğu yazar. Simurg'da QQQ.
5. **Eldeki hisseler:** adet, **maliyet (komisyon dahil**, adet başına), son kapanış, değer, K/Z (yüzde ve tutar), pay; en altta **Nakit** (faizsiz). Simurg'da Kairos kolu satırı (simülasyon).
6. **Karar defteri:** en üstte **sıradaki karar** (tarih; aday havuzundan bugünkü veriyle girecek/çıkacak önizlemesi). Sonra her ay sonu kararı bir kart: karar günü → uygulama günü, listedeki her hisse sırası, **puanı (12-1 getiri)** ve sonucu:
   - **Alındı ✓** — adet ve fiyatla;
   - **Elde kaldı** — zaten eldeydi, tuttu (küçük ağırlık düzeltmesi yapılmaz);
   - **Bekliyor** — açılış fiyatı henüz gelmedi;
   - **Alınamadı** — nedeniyle: **tam adet yetmedi** (1 adedin fiyatı hissenin payından büyük), nakit yetmedi ya da o gün fiyat yok.
   Kartın altında o kararla **satılanlar**. **Bu günü grafikte göster** değer grafiğinde o günü vurgular ve grafiğe kaydırır. Simurg'da kartlar ilk yerleşim ve dengeleme günleridir (QQQ al/sat + Kairos kolu aktarımı).
7. **İşlem geçmişi:** tarih, işlem (AL · SAT · YATIR · Temettü · Bölünme · Aktarım), hisse, adet, fiyat, tutar, komisyon, **gerçekleşen K/Z** (satışta, ortalama maliyete göre, komisyon dahil), neden. **CSV indir** aynı tabloyu dosyaya yazar.

Telefonda bloklar alt alta dizilir; geniş tablolar kendi kutusunda yana kayar.

## Resmî kayıt sunucuda {#sunucu}

Bu sayfaların resmî kâğıt hesabı **sunucudaki** Pusula'dadır. Geliştirme (araştırma) bilgisayarında yalnız bu üç okuma ucu sunucudan okunur (Portföy laboratuvarı ve tasarımcı yerel kalır). Sunucu bu sürümden eskiyse sayfa **"Sunucu güncellenince görünür."** der — Ayarlar › Güncelleme ile sunucu güncellenince dolar; o zamana kadar Portföy › [Modeller](#/kilavuz/model-portfoy)'e bakın.

## Uyarılar {#uyarilar}

- **Canlı hesap değil:** emir gitmez; Midas'taki gerçek hesabın Portföy › Hesaplar'dadır.
- **Kısa dönem:** canlı takip 2026-10-12'de başladı; bu üç model geçmişteki çok sayıda deneme arasından seçildi (H1) — 12–24 ay görmeden "işe yarıyor" demek erken.
- **Tam adet:** küçük sermayede pahalı hisseler alınamaz ("tam adet yetmedi"); sermaye ya da kesirli hisse ayarı Portföy › Modeller › Bu ay › [Ayarlar](#/kilavuz/tasarimci/sermaye)'da. Sayfanın başında **"Sermaye tam adet için yetmiyor"** uyarısı çıkarsa (ABD botu, kesirli kapalı) yanındaki **Kesirli hisseyi aç** düğmesi ayarı onayla açar (telefonda yok; BIST'te kesirli hisse olmadığı için düğme de yok).
- **Ayar değişince:** Ayar değişince kâğıt hesap **baştan hesaplanır** (her 30 dakikalık hesapta geçmiş günler yeniden kurulur): geçmiş işlemler yeni ayarla yeniden yazılır ve bir kez **"geçmiş işlemler yeniden hesapta değişti (fiyat verisi revizyonu ya da ayar değişikliği)"** uyarısı çıkabilir — beklenen durumdur, bir sonraki hesapta kaybolur.
- Fiyat verisi revize edilirse geçmiş işlemler yeniden hesapta değişebilir; sayfanın üstünde uyarı çıkar.
