# Onarım Rehberi {#onarim-rehberi}

## Ne işe yarar {#ne-ise-yarar}

Onarım Rehberi panelin içindedir: sol menüde **Bilgi › Onarım Rehberi** (Pusula Kursu'nun altında); **Sistem › Sorunlar** ve **Sistem › Sağlık** sayfalarının üstündeki **Onarım Rehberi'nde ara** bağlantısı da onu açar. Pusula'da, sunucuda ya da borsada bir şey ters gittiğinde **yazılım bilgisi gerekmeden** ne yapacağınızı adım adım söyler. Kılavuzun [Sorun giderme](#/kilavuz/sorun-giderme) bölümü aynı durumları başvuru biçiminde anlatır; rehber ise gördüğünüz mesajdan yola çıkar ve her durumda kimin çözebileceğini söyler.

| Kısım | İçinde ne var |
|---|---|
| **Arama kutusu** | Gördüğünüz mesajın bir parçasını yazın (Telegram iletisi, Sorunlar kartı, ekrandaki yazı): ilgili durumlar en uygunu üstte olmak üzere çıkar. Uzun bir iletiyi olduğu gibi yapıştırabilirsiniz. Altındaki düğmeler kartları kimin çözebileceğine göre süzer. |
| **Önce bunu yapın** | Beş adımlık genel teşhis: Sağlık, Sorunlar, Telegram (/durum, /teshis), teşhis paketini kopyalamak (**Sohbete gönder**) ve Pusula Doktoru (Pusula 78.1 ile gelecek). |
| **Asla yapmayın** | Ölçümü ya da kurulumu bozan işler: Kairos'ta acil durdurma / engel kaldırma, anahtar ve PIN'i bir yere yazmak, veri klasörünü silmek, Pusula görevlerini silmek, node.exe'leri toplu kapatmak … |
| **Komut satırı nasıl açılır** | Bazı durumlar tek satırlık bir komutla çözülür: Komut İstemi'ni açmak, Pusula klasörüne geçmek, komutu yapıştırmak. |
| **Konular** | 12 konu altında 115 durum: elektrik ve internet, Pusula programı, güncelleme, borsa ve stoplar, botlar, eş makine, bildirimler, telefon, piyasa verisi, yedek, yapay zekâ notları, güvenlik. |
| **Bilinen boşluklar** | Pusula'nın sizi **uyarmayabileceği** durumlar ve bunlar için ara sıra kendiniz neye bakmanız gerektiği. |

## Ne zaman kullanılır {#ne-zaman}

- Telegram'dan bir uyarı geldiğinde ya da Sorunlar sayfasında kırmızı / sarı bir kart gördüğünüzde: kartın başlığını ya da iletinin bir parçasını rehberde arayın.
- Pusula açılmıyorsa ya da panel yüklenmiyorsa: rehber tek dosyadır ve Pusula'ya gerek duymaz. Sunucuda Dosya Gezgini › Pusula klasörü › public › rehber › **onarim-rehberi.html** dosyasına çift tıklayın (tarayıcıda açılır; panel bağlantıları o an çalışmaz, adımlar ve komutlar çalışır). Geliştirme bilgisayarındaki panelde de aynı rehber vardır.
- Bir geliştiriciye ya da yapay zekâ yardımcısına yazmadan önce: kartın **Geliştiriciye iletin** metni sorunlu parçayı ve ne yapılması gerektiğini hazır yazar.

## Ekran {#ekran}

![Onarım Rehberi](ekran:rehber-1400)

1. **Yeni sekmede aç** — rehberi panelsiz, tam ekran ayrı sekmede açar.
2. **Rehber** — panelin içinde; üstte arama kutusu, solda içindekiler (konular ve bilinen boşluklar).

Telefonda aynı ekran; içindekiler üstteki **İçindekiler** düğmesiyle açılır:

![Onarım Rehberi telefonda](ekran:rehber-390)

## Bir kart nasıl okunur {#kart}

Her durum aynı sırayla yazılır:

- **Ne görürsünüz** — Telegram, Sorunlar ya da ekrandaki metin.
- **Ciddi mi** — para ya da pozisyon etkisi. Rozet: *Ciddi* (para / pozisyon riski), *Dikkat* (işlem kaçabilir ya da bot durur), *Hafif* (bilgi).
- **Kendiliğinden düzelir mi** — beklemek yeter mi.
- **Kim çözebilir** — rozet: **Siz çözebilirsiniz** (yalnız panel, Windows ya da borsa sitesinde tıklama), **Kısmen** (tek satırlık bir komut ya da sizin vereceğiniz bir karar), **Geliştirici gerekir** (kalıcı çözüm kod değişikliği ister).
- **Ne yapılır** — menü yolu ve düğme adlarıyla adımlar. Komut gereken adımlar ayrı bir kutudadır: tam komut, **Kopyala** düğmesi ve nerede çalıştırılacağı (sunucuda / yönetici olarak / geliştirme bilgisayarında).
- **Olmazsa** — adımlar işe yaramazsa sonraki adım.
- **O zamana kadar güvende kalmak için** — geliştirici beklenirken riski artırmayan adımlar (botu açmamak, stopları borsada izlemek …).
- **Geliştiriciye iletin** — kopyalanabilir tek metin: durum, sorunlu parça, ne bozuk, ne yapılmalı. Yanına Sorunlar sayfasındaki **Sohbete gönder** ile alınan teşhis paketini ekleyin.
- **Doğrulanmadı** — adımın bir kısmı gerçek bir olayda denenmediyse kartta ne olduğu yazar. **Pusula uyarmayabilir** rozeti, Pusula'nın bu durumu size kendiliğinden haber vermeyebileceğini söyler.

## Uyarılar ve ne yapmalı {#uyarilar}

- Rehber **yalnız yol gösterir**: kendisi hiçbir emir vermez, ayar değiştirmez, komut çalıştırmaz. Rehberdeki bağlantılar paneldeki ilgili ekranı ya da kılavuz başlığını açar; işlemi siz yaparsınız.
- Bir düğme adı panelde farklı görünüyorsa (yeni bir sürümde değişmiş olabilir) kılavuzdaki ilgili bölüm esastır.
- Komut kutularındaki satırları değiştirmeden kullanın; yalnız `<…>` ile gösterilen yerlere kendi değerinizi yazın. Hata çıkarsa tekrar tekrar denemeyin, ekran görüntüsünü geliştiriciye iletin.
- Anahtar, PIN ve jetonları geliştiriciye iletilen metne eklemeyin; teşhis paketi bunları zaten siler.
