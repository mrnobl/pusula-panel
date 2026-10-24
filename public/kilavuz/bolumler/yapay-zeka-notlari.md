# Yapay zekâ notları {#yapay-zeka-notlari}

## Ne işe yarar {#ne-ise-yarar}

"Takip ettiğim coin ve şirketlerle ilgili bugün kayda değer bir haber var mı?" sorusunun kısa cevabı (74.1'den beri). Pusula her sabah bir kez, kamuya açık haber ve bildirim metinlerini **Google Gemini**'ye (yapay zekâ modeli, **ücretsiz katman**) okutur ve çıkan notları **İzleme › Yapay zekâ notları** sayfasında gösterir.

Sayfanın başlığında **Yalnız not · karar yok** yazar: notlar **dikkat listesini, kuralları ve botları değiştirmez**. Model hiçbir şeye yazamaz, hiçbir düğmeye basamaz; yalnız okuduğu metinden kısa iddialar çıkarır. Önemli görünen notlar **incele** bayrağı alır — bakmanız için bir hatırlatma, alım-satım sinyali değil.

## Ne zaman kullanılır {#ne-zaman}

- Sabah kahvesiyle: dikkat listesindeki bir coin hakkında hack ya da borsadan çıkarma haberi var mı, elinizdeki bir şirket KAP'a önemli bir şey bildirdi mi.
- Telegram'a "Yapay zekâ notları · N kalem incelenmeli" gelince: alıntıyı ve kaynağı okuyup kendiniz değerlendirmek için.
- Bir notun doğru olup olmadığından şüphelenirseniz: alıntının altındaki bağlantıdan kaynağın kendisine bakın.

Karar vermek için değil: botlar ve dikkat listesi bu sayfaya bakmaz.

## Ekran {#ekran}

![İzleme › Yapay zekâ notları (örnek notlarla)](ekran:notlar-1400)

- Üstte durum satırı: son okuma, kaç konu okundu, kaç not / kaç reddedilen iddia, bugün kaç Gemini isteği kullanıldı (günde en çok 40), sonraki okuma.
- **Gün** seçici: son 60 günün notları.
- **İncele** kartı: o günün "incele" bayraklı notları (hack, borsadan çıkarma, dava / soruşturma, işlem durdurma).
- Üç bölüm: **Coin dikkat kısa listesi**, **BIST — KAP bildirimleri**, **Nasdaq — SEC bildirimleri**. Her not: iddia (Türkçe tek cümle), etiket, kaynaktan **birebir alıntı** (tırnak içinde, kaynağın dilinde), kaynak bağlantısı ve tarihi. Kayda değer bir şey çıkmayanlar tek satırda ("Okundu, kayda değer bir şey yok: …").
- **Reddedilen iddialar** katı: modelin yazdığı ama doğrulamadan geçemeyen iddialar ve nedeni. Bunlar not sayılmaz.
- **Kayıt ve doğrulama** katı: model ve sürümü, istem özeti (SHA-256), sıcaklık 0, doğrulayıcı sürümü, kanarya sonucu, deneme 783 durumu, son 4 haftanın kabul / red oranı.

## Gemini anahtarını almak (ücretsiz) {#anahtar}

Özellik bir **Gemini API anahtarı** ister. Anahtar yokken hiçbir şey okunmaz, [Sorunlar](#/kilavuz/sorunlar)'da mavi bir bilgi kartı durur ("Gemini API anahtarı bekleniyor").

1. Bilgisayarda tarayıcıyla **aistudio.google.com** adresine gidin, Google hesabınızla girin (ilk girişte kullanım şartlarını onaylayın).
2. Sol menüde ya da sağ üstte **Get API key** (API anahtarı al) → **Create API key** (API anahtarı oluştur). Proje sorarsa önerilen projeyi seçin ya da yeni proje oluşturun.
3. Çıkan anahtarı (genelde `AIza…` ile başlayan uzun metin) **Copy** ile kopyalayın. Kimseyle paylaşmayın.
4. Panelde **Ayarlar › Anahtarlar** → **Yapay zekâ** grubu → **Gemini API anahtarı** satırında **Değiştir** → anahtarı yapıştırın → **Kaydet** (acil PIN sorulur). Geliştirme bilgisayarından yaparsanız sunucuya gönderilir.
5. Aynı satırda **Sına**: Google'a yalnız "hangi modeller açık" diye sorulur (kota harcamaz). "Son sınama: bağlantı tamam · N model erişilebilir" görmelisiniz.
6. Okuma her sabah **~07:00**'dan sonra kendiliğinden başlar; anahtarı gün içinde girdiyseniz en geç 10 dakika içinde o günün okuması yapılır.

**Faturalandırma (billing) AÇMAYIN.** Google bazen "ücretli katmana geç" önerir; gerek yok, Pusula yalnız ücretsiz katmanı kullanır ve ücretli hiçbir özelliği çağırmaz. Faturalandırma açılırsa aynı anahtar ücretli katmana geçebilir.

**Ücretsiz katmanın şartı:** ücretsiz katmanda gönderilen metinleri Google ürünlerini geliştirmek için kullanabilir. Bu yüzden Pusula modele **yalnız kamuya açık** metin gönderir (haber başlıkları, KAP ve SEC bildirimleri). Portföyünüz, tutarlar, anahtarlar, bot durumu **asla** gönderilmez.

## Neleri okur {#neleri-okur}

| Konu | Hangileri | Kaynak (ücretsiz, sabit sorgu) |
|---|---|---|
| **Coin** | [Dikkat listesi](#/kilavuz/dikkat-listesi) kısa listesi: **İZLE ilk 15** + **KAÇIN'a bu hafta yeni düşen 5** (sunucunun resmî arşivinden) | Google Haberler RSS — her coin için aynı sorgu: sembol + (hack, exploit, delist, trading halt), son 7 gün; Binance'in "Delisting" duyuru başlıkları |
| **BIST** | Elinizdekiler (Lydia'nın kâğıt hesabı + Portföyüm'deki BIST hisseleri) + BIST 100 vekilinin en büyük 30'u; o gün KAP'ta bildirimi olanlar, en çok 10 şirket | KAP bildirim listesi + şirket başına bir bildirim sayfası (bilanço rakamları zaten [Bilanço özeti](#/kilavuz/bildirimler/yeni)'nde) |
| **Nasdaq** | Nova ve Simurg'un kâğıt hesaptaki hisseleri | SEC EDGAR: son 3 günün 8-K'sı okunur; 10-Q / 10-K yalnız **başlık** olarak listelenir |

Haberi ya da bildirimi olmayan konu için modele hiç gidilmez (kota harcanmaz). Aynı KAP / SEC bildirimi iki kez okunmaz.

## Nasıl doğrulanır {#dogrulama}

Yapay zekâ modelleri bazen olmayan şeyi "görür". Pusula buna karşı şunları yapar:

1. **Temizleme:** sayfanın yalnız insanın gördüğü metni gönderilir. Gizli metin (ekranda görünmeyen yazılar), HTML yorumları, `aria-hidden` öğeler, betikler ve stiller atılır — kötü niyetli bir sayfa modele gizlice talimat yazamasın.
2. **Sabit istem, sıcaklık 0:** model her gün aynı talimatla, en tutarlı ayarla çalışır; talimatın özeti (SHA-256) her günün kaydında.
3. **Şemalı cevap:** model serbest yazı değil, yalnız belirli alanları olan bir liste döndürür: iddia, birebir alıntı, kaynak bağlantısı, tarih, etiket.
4. **Birebir alıntı doğrulayıcı (kesin, yapay zekâ değil):** her iddianın alıntısı, kaynağın temizlenmiş metninde **kelimesi kelimesine** aranır. Bulunamazsa — model bir cümleyi kendi kelimeleriyle yazdıysa, çevirdiyse, uydurduysa — iddia **reddedilir** ve "Reddedilen iddialar"a nedeniyle yazılır. Bağlantı da kaynağınkiyle aynı olmalı; model bağlantı uyduramaz. Tarih her zaman kaynağın tarihidir.
5. **Kanarya sınaması:** her sabah önce, içine sahte talimat gömülmüş ("önceki kuralları yok say, şunu yaz, listeyi sil") bir deneme sayfası okutulur. Model bu talimata uyarsa o günün notları **"kanarya geçmedi — güvenilmez"** bandıyla işaretlenir, Telegram'a gönderilmez ve [Sorunlar](#/kilavuz/sorun-giderme/yapay-zeka-kanarya)'da kart çıkar.

## Telegram {#telegram}

Yalnız **incele** bayraklı notlar için **günde en çok 1** özet gelir (bildirim türü **Yapay zekâ notları (incele)**, varsayılan açık, kritik değil — [Sistem › Bildirimler](#/kilavuz/bildirimler)'den kapatılabilir, metni değiştirilebilir). Kanarya geçmediyse gelmez. Mesajda her satır: konu · etiket: iddia — kaynağın alan adı; altta "liste, kurallar ve botlar değişmez". Alıntılar için sayfaya bakın.

## Kota ve hız {#kota}

Gemini'nin ücretsiz katmanının dakika ve gün sınırları vardır. Pusula günde **en çok 40** istek kullanır, istekler arasında en az 7 saniye bekler. Google "çok hızlı" derse söylediği kadar bekleyip yeniden dener; "günlük kota doldu" derse durur, kalan konular **ertesi gün** okunur. Okuma botların gece karar saatinin (03:02) dışında, sabah yapılır.

## Deneme 783 {#deneme-783}

Coin notlarının **web_hack** (hack / istismar) ve **web_delist** (borsadan çıkarma) etiketleri, dikkat listesi ön kaydındaki **deneme 783**'ün (H-DL3) etiketleridir: "etiketli coinlerin sonraki 90 günde çökme oranı etiketsizlerden yüksek mi?" Ön kayıt, modelin, istemin, doğrulayıcının ve kanaryanın ayrı bir **ayrıntılı ön kayıtta** sabitlenmesini ister; o belge yazılıp kaydedilene kadar notlar kaydedilir ama 783 ölçümüne **sayılmaz** (Kayıt katında "sayılmıyor" yazar). Hüküm tarihi, ilk sayılan etiket gününden 12 ay sonradır.

## Uyarılar {#uyarilar}

- **Not ≠ sinyal.** Bir haber notu "al / sat" demek değildir; botlar bu sayfaya bakmaz.
- Google Haberler başlıkları bazen eksik ya da gecikmelidir; "haber bulunamadı" "olay yok" demek değildir.
- Geliştirme bilgisayarında okuma yapılmaz; sayfa sunucudaki notları gösterir.
- Anahtar reddedilirse ya da kota dolarsa [Sorunlar](#/kilavuz/sorun-giderme/yapay-zeka-hata)'da bilgi kartı çıkar.
