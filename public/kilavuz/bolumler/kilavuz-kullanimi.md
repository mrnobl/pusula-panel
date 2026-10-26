# Kılavuzu kullanmak {#kilavuz-kullanimi}

## Ne işe yarar {#ne-ise-yarar}

Bu kılavuz panelin içindedir ve panelle birlikte güncellenir. Her ekranın ne işe yaradığını, adım adım görevleri, alanların anlamını, uyarıları ve sık sorulanları anlatır; ekran görüntülerinde tıklanacak yerler **numaralı kırmızı kutularla** işaretlidir.

## Ne zaman kullanılır {#ne-zaman}

Bir ekranda ne yapacağınızı bilmediğinizde, bir terimi anlamadığınızda ya da yeni sürümde neyin değiştiğini merak ettiğinizde.

## Ekran {#ekran}

![Kılavuz — masaüstü](ekran:kilavuz-1400)

![Kılavuz — telefon](ekran:kilavuz-390)

## Nasıl açılır {#nasil-acilir}

- **Üst çubuktan (her ekranda):** sağ üstteki **?** düğmesi, o an açık ekranın bölümünü açar (Portföy'de Portföyüm açıksa [Portföyüm](#/kilavuz/portfoyum)). Yanındaki **Kur** düğmesi [kur çeviriciyi](#/kilavuz/kur-cevirici) açar.
- **Menüden:** masaüstünde sol menüde **Bilgi › Kılavuz**; telefonda alt çubuktaki **Menü › Bilgi › Kılavuz**.
- **Ekranın başlığından:** her ekranın başlığının yanındaki **? Kılavuz** o ekranın bölümünü açar.
- **Bağlantıyla:** `#/kilavuz/botlar/acil-fren` gibi adresler doğrudan bir başlığa gider; yer imi olarak saklanabilir.

## Arama ve içindekiler {#arama}

- **Arama** kutusuna en az iki harf yazın; bütün bölümlerde aranır (büyük/küçük harf ve ı/i, ş/s farkı önemsiz). Sonuca tıklayınca ilgili başlık açılır. **Esc** aramayı temizler.
- **İçindekiler** masaüstünde solda durur; telefonda **İçindekiler** düğmesiyle açılır.
- Bölümün sonundaki düğmeler: **… ekranına git**, önceki / sonraki bölüm.
- Ekran görüntüsüne tıklayınca tam boyutu yeni sekmede açılır. Görüntünün altındaki numaralı liste, kutulardaki numaraların anlamıdır.

## Kılavuz ile Pusula Kursu farkı {#kurs-farki}

Kılavuz bir **başvuru kaynağıdır**: "bu düğme ne yapar, bu alan ne demek" sorusuna cevap verir; ihtiyaç olunca açılıp okunur. **Pusula Kursu** ise ([Bilgi › Pusula Kursu](#/kurs)) paneli baştan sona **kendi elinizle deneyerek** öğrenmek için sıralı görevlerdir: her görevde amaç, ön koşul, adımlar, doğru gittiyse ne göreceğiniz ve olmadıysa en olası nedenler ile çözüm adımları yazar; sonda gerçekçi sorun senaryoları vardır. Kursun her görevi ilgili kılavuz başlığına bağlantı verir. Ayrıntı: [Pusula Kursu](#/kilavuz/pusula-kursu).

## Kılavuz nasıl güncel kalır {#guncel}

Kılavuz depoda `public/kilavuz/` altında durur (bölüm başına bir Markdown dosyası + ekran görüntüleri). Panelde bir ekran eklendiğinde, çıkarıldığında ya da değiştiğinde:

1. İlgili bölüm güncellenir.
2. `npm run kilavuz:ekran` ekran görüntülerini yeniden üretir (yalnız değişen ekranlarınkini).
3. `npm test` içindeki kılavuz testi şunlarda **kırmızı** olur: bölümü olmayan ekran ya da menü öğesi, panelde artık bulunmayan bir işaret seçicisi, ekranı değişmiş ama görüntüsü yenilenmemiş (bayat) bölüm, eksik görüntü dosyası, kırık iç bağlantı, panel sürümüyle uyuşmayan sürüm notu.

Test yeşil olmadan değişiklik işlenmez; bu yüzden kılavuzda gördüğünüz ekran, paneldeki ekrandır.

## Uyarılar ve ne yapmalı {#uyarilar}

- **"Ekran görüntüsü henüz üretilmedi"** kutusu: geliştirme tarafında `npm run kilavuz:ekran` koşulmamış; içerik yine okunabilir.
- Görüntülerdeki rakamlar **örnek veridir** (araştırma modundaki geliştirme bilgisayarından); anahtarlar, bakiyeler ve jetonlar maskelenmiştir. Kendi değerleriniz panelin kendisindedir.
