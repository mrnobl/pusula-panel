# Sağlık (öz denetim) {#saglik}

## Ne işe yarar {#ne-ise-yarar}

"Pusula'da bir şey ters gidiyor mu?" sorusunu Pusula kendine 5 dakikada bir sorar. 19 denetim dört grupta: **Pusula ve sunucu**, **Borsa ve veri**, **Botlar ve pozisyonlar**, **Bildirimler**. Bulduğu her sorunu bu sayfada ve Telegram'da gösterir; güvenli işleri kendisi onarır. Disk ve yedek saatte bir yoklanır.

Üç kademe var:

| Kademe | Ne yapar | Örnek |
|---|---|---|
| **Kendisi onarır** | Geri alınabilir, parayı etkilemeyen işler. Yaptığını kayda yazar | Sahipsiz güncelleme kilidini siler, disk dolarken eski günlükleri sıkıştırır, takılan botta Pusula'yı yeniden başlatır |
| **Korur, sonra sorar** | Tek koruyucu adım atar, ardından size bırakır | Tekrarlayan hatada botu **güvenli kipe** alır; para kaybettirebilecek bir sebepte botu **tamamen kapatır** |
| **Yalnız haber verir** | Karar sizde | Bilgisayar saati kayması, yedek, internet, marj, kaçan planlı işlem, Telegram |

**Para kararlarını hiçbir zaman kendisi vermez:** pozisyon kapatmaz, al-sat yapmaz, ayar ya da strateji değiştirmez. Kod hatalarını da onaramaz; fark eder, botu korur ve size düzgün bir özet verir.

Geliştirme bilgisayarında (sunucu bağlantısı kuruluysa) sayfa **sunucunun** öz denetimini gösterir; öz denetim yalnız sunucuda çalışır.

## Ne zaman kullanılır {#ne-zaman}

- Ana sayfadaki **Sistem sağlığı** kartında sarı ya da kırmızı bir satır gördüğünüzde.
- Menüde **Sağlık**'ın yanında renkli nokta çıktığında (sarı: uyarı, kırmızı: hata ya da kapalı bot).
- Telegram'da "Öz denetim: …" iletisi geldiğinde.

## Ekran {#ekran}

![Sistem › Sağlık: özet, güvenli kipteki bot, denetimler ve onarım kaydı](ekran:saglik-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Durum | Kaç denetimin tamam olduğu; sorun varsa kaç uyarı / hata |
| Son 24 saat | Kaç onarım yapıldı; onarılamayan varsa sayısı. Aynı onarım **günde en çok 5 kez** denenir, sonra size bırakılır |
| Botlar | Hangi bot çalışıyor, hangisi güvenli kipte ya da tamamen kapalı |
| Son yoklama | Son yoklamanın saati ve sonrakinin. **Şimdi yokla** hemen yoklar |
| Bot kartı | Yalnız güvenli kipteki ya da kapalı bot için çıkar: sebep, **Sebebi okudum ve düzelttim** kutusu ve **Botu yeniden aç** / **Güvenli kipi kaldır** düğmesi. Kutu işaretlenmeden düğme çalışmaz |
| Denetim satırı | Nokta (yeşil tamam · sarı uyarı · kırmızı hata · gri ölçülemedi), denetimin adı, kademesi, son sonuç ve varsa son onarım. Sorunlu satırlar grubun üstünde durur |
| Onarım ve olay kaydı | Son 30 gün: **ONARILDI**, **ONARILAMADI**, **GÜVENLİ KİP**, **TAMAMEN KAPANDI**, **UYARI**, **HATA**, **DÜZELDİ** |
| Bot ne zaman tamamen kapanır | Tam kapanma ve güvenli kip sebeplerinin listesi (aşağıda) |

## Güvenli kip {#guvenli-kip}

Sebep belirsiz ya da geçici olabilir; devam etmek risk büyütmesin diye bot **yeni işlem açmaz**. Açık pozisyonun stopu yerinde kalır, dakikalık koruma ve marj denetimi sürer. Bot "durdu" sayılmaz.

- **Ne zaman:** aynı hata 30 dakikada 3 kez tekrarlanınca (21 Ekim'deki "fiyat yok" hatası gibi) ya da borsanın fiyatı ikinci bir kaynaktan (OKX) %3'ten fazla saptığında.
- **Ne zaman kalkar:** öz denetim koyduysa sebep geçince kendiliğinden: 60 dakika aynı hata tekrarlanmazsa, fiyat farkı %1'in altına inerse. İsterseniz Sağlık sayfasından ya da botun sayfasındaki sarı banttan **Güvenli kipi kaldır**.
- Kısa internet kesintilerinin ağ hataları (zaman aşımı, bağlantı koptu, 429 / 418 geri çekilme) tekrar sayılmaz; onları **Borsa bağlantısı** ve **İnternet** denetimleri izler.

## Tam kapanma {#tam-kapanma}

Devam etmek **para kaybettirebilecekse** bot tamamen durur ve siz açana kadar kapalı kalır. Bu, botun bildiğiniz **ENGEL**'idir: diske yazılır, Pusula yeniden başlasa, güncellense ya da bekçi açsa da bot kapalı kalır.

| Sebep | Neden para kaybettirebilir |
|---|---|
| Mutabakat farkı | Borsadaki pozisyon ya da bakiye botun kaydından farklı; bot yanlış miktarla alıp satabilir |
| Koruma stopu kurulamadı | Felaket stopu art arda 3 denetimde kurulamadı; pozisyon korumasız |
| Bozuk bot kaydı | Durum dosyası bozuk açıldı; son sağlam kopya borsayla karşılaştırılana kadar bot kapalı |
| Emirler art arda reddediliyor | "Margin is insufficient", geçersiz miktar gibi retler 30 dakikada 3 kez; miktar ya da bakiye hesabı bozuk olabilir |
| Beklenmeyen emir ya da dolum | Botun göndermediği bir emir dolmuş; mutabakat yakalar |
| Bot döngüsü tekrar tekrar çöküyor | Dakikalık döngü 30 dakikada 3 kez hata verdi |
| API anahtarının yetkisi değişti | Para çekme izni açılırsa ya da IP kısıtı kalkarsa. **Henüz denetlenmiyor** — canlı hesaba geçmeden eklenecek |

- **Açık pozisyona dokunulmaz;** borsadaki stoplar yerinde kalır. Pozisyonu kapatmak da bir al-sat kararıdır ve kötü bir fiyattan zarar yazdırabilir.
- **Yeniden açmak:** sebebi inceleyin, düzeltin; Sağlık sayfasında **Sebebi okudum ve düzelttim** kutusunu işaretleyip **Botu yeniden aç**. Kayıt farkından kapanmışsa düğme **Borsayla karşılaştır** olur: karşılaştırma temiz çıkınca bot açılır. Aynı sebeple ikinci kez kapanırsa da her seferinde açabilirsiniz.
- Zarar sınırları (en büyük düşüş kill-switch'i, günlük zarar limiti, felaket stopu) ayrıca ve aynen çalışır; tam kapanma zarara değil **sebebe** bakar.

## Demo kabul süresi {#demo-kabul}

Demo kipindeki bota (Hücum) öz denetim **9 Aralık 2026 sonuna kadar hiçbir şey yapmaz**: güvenli kip, tam kapanma ve o bot için yeniden başlatma yok, yalnız haber verir. Demo kabul ölçümü bozulmasın diye. Sonra aynı kurallar Hücum'a da uygulanır.

## Yeniden başlatma {#yeniden-baslatma}

- **Pusula çökerse** bekçi onu her seferinde yeniden açar (sınır yok). Günde 5'ten çok açıldıysa **Pusula süreci** kırmızıya döner ve Telegram'a yazar.
- **Bir bot takılırsa** (işi 30 dakikadan uzun sürüyor) Pusula hemen yeniden başlatılır; açılıştan sonraki ilk 15 dakikada yapılmaz.
- **Bellek şişerse** (1 GB üstü ya da 24 saatte 2 katı) Pusula yalnız **sessiz saatte** yeniden başlatılır: hiçbir botun işi sürmüyorken ve 02:30–04:30 dışında (03:02'deki günlük çalışma ve 02:50–04:30 güncelleme penceresi).
- Yeniden başlatma yalnız Pusula denetleyiciyle (Pusula kısayolu / PusulaBot görevi) başlatıldıysa yapılır; yoksa yalnız haber verilir.

## Telegram {#telegram}

- Bir denetim **sarıya ya da kırmızıya dönünce** anında ileti gider (aynı durum 6 saatte bir tekrarlanır). Güvenli kip ve tam kapanmada ayrı, kırmızı ileti.
- Düzelen sorunlar ve yapılan onarımlar **21:00 akşam özetinde** gelir: denetim sayıları, günün onarımları, açık sorunlar, disk, bellek, saat farkı.
- İnternet 10 dakikadan uzun kesilip gelince "kesinti X dk sürdü" bilgisi gider.

## Uyarılar ve ne yapmalı {#uyarilar}

- **Bilgisayar saati:** Windows › Ayarlar › Saat ve dil › Tarih ve saat › **Şimdi eşitle**. 1 saniyeden büyük fark borsanın emirleri reddetmesine yol açabilir.
- **Yedek alınıyor (sarı):** [Yedek ve taşıma](#/kilavuz/yedek-tasima) — hedef disk takılı mı, görev çalışıyor mu.
- **Kaçan planlı işlem:** satırda nedeni yazar (bot kapalı, güvenli kipte, son hata). Pusula kaçırılan işlemi kendisi yapmaz; bot sonraki çalışmada bugünkü hedefe gider.
- **Takılı kilit:** güncelleme yarıda kalmışsa [Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme) "yarıda kaldı" der; **Şimdi kontrol et**.
- Kayıtlar `data/oz-denetim/` altında (git dışı): `durum.json`, `olaylar.jsonl`, `acilislar.jsonl`. Sıkıştırılan eski günlükler `data/gunluk/*.jsonl.gz` olarak kalır; hiçbir şey silinmez.
