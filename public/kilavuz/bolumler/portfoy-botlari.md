# Portföy botları {#portfoy-botlari}

## Ne işe yarar {#ne-ise-yarar}

Model portföylerin **kâğıt hesapları** Kairos ve Tao gibi izlenen botlardır. Yan menüde **Botlar › Portföy botları** altında üç öğe — her biri **kendi sayfası**, sayfa içinde sekme yok:

| Menüde | Adres | Ne yapar | Kıyas (al-tut) |
|---|---|---|---|
| **Nova** | [#/botlar/m-qqq-m10](#/botlar/m-qqq-m10) | Nasdaq Momentum 10: her ayın son işlem günü Nasdaq-100'ün son 12 ayda (son ay hariç) en güçlü 10 hissesi, %10'ar; ertesi işlem günü açılışında alım-satım | QQQ al-tut |
| **Lydia** | [#/botlar/m-bist-m10](#/botlar/m-bist-m10) | BIST Momentum 10: aynı kural, aday havuzu son 3 ayda en çok işlem gören 30 hisse (TL) | BIST 30 (XU030) al-tut, TL |
| **Simurg · %50 QQQ + %50 Kairos** | [#/botlar/m-837](#/botlar/m-837) | Paranın yarısı QQQ, yarısı Kairos (simülasyon); Kairos payı %40–60 dışına çıkınca yarı yarıya dengelenir | QQQ al-tut |

Kâğıt hesap = botun **sanal hesabı** (canlı hesap değil): modelin ay sonu kararlarını gerçek açılış fiyatından **tam adet** uygular, Midas komisyonu öder (ABD emir başına 1,5 $, BIST yok), temettü alır, bölünmede adet değişir; nakde faiz yoktur. Yeni karar üretmez — kararlar modelinkiler. Telefondan da tam okunur ("tutarları gizle" açıksa tutarlar "—", grafik yüzde). Kendi gerçek hesabına uygulamak için emirler Portföy › [Modeller](#/kilavuz/model-portfoy) › Bu ay'da.

## Ne zaman kullanılır {#ne-zaman}

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
- **Tam adet:** küçük sermayede pahalı hisseler alınamaz ("tam adet yetmedi"); sermaye ya da kesirli hisse ayarı Portföy › Modeller › Bu ay › [Ayarlar](#/kilavuz/tasarimci/sermaye)'da.
- Fiyat verisi revize edilirse geçmiş işlemler yeniden hesapta değişebilir; sayfanın üstünde uyarı çıkar.
