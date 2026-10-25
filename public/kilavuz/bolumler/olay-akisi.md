# Olay akışı {#olay-akisi}

## Ne işe yarar {#ne-ise-yarar}

"Ne zaman ne oldu?" sorusunun tek çizelgesi. Pusula'nın farklı yerlerde tuttuğu kayıtlar burada **tek sırada**, en yeni üstte görünür:

- **Emir** — botun borsaya verdiği emrin sonucu (doldu · borsa reddetti · sonucu belirsiz). Miktar yazılmaz; sembol, yön, tür ve fiyat yazılır.
- **Başlat / Durdur** — bot başlatıldı, durduruldu, acil durdurma.
- **Uyarı** — bot kendini durdurdu (ENGEL), güvenli kip, ENGEL'in kalkması, sorun aracı, acil durdurma denemesi.
- **Sorun** — öz denetimin sarıya / kırmızıya dönmesi, düzelmesi, kendi kendine onarım.
- **Bildirim** — Telegram'a (ve ntfy'a) giden her mesaj: gönderildi mi, sessiz saatte mi bekledi, tür kapalı mıydı.
- **Ayar** — her ayar değişikliği (eski → yeni; anahtarlar ve tutarlar "•••"). Ayrıntı ve geri alma [Ayar geçmişi](#/kilavuz/ayarlar)'nde.
- **Güncelleme** — yeni sürüm onay bekledi, kuruldu, geri alındı.
- **Makine** — Pusula açıldı (planlı ya da beklenmedik), makine sessiz kaldı / geri geldi.
- **Karar** — model portföylerin (Nova, Lydia, Simurg) ay sonu kararı.

Eşlenmiş başka bir Pusula makinesi varsa ([Makineler](#/kilavuz/ayarlar)) onun olayları da aynı çizelgeye girer; geliştirme bilgisayarında sunucunun olayları bu bilgisayarınkilerle birleşir. Olaylar **1 yıl** saklanır. Sayfa **yalnız okur** — buradan hiçbir şey değişmez.

## Ne zaman kullanılır {#ne-zaman}

- Bir bildirim geldi; öncesinde ve sonrasında ne olduğunu sırasıyla görmek için (ör. "ENGEL'den önce hangi emir reddedildi?").
- "Geçen ay şu ayarı ne zaman değiştirmiştim, o gün bot ne yaptı?" gibi sorular için.
- Haftalık karnede "bu hafta N uyarı" yazıyorsa hangi uyarılar olduğunu görmek için (süzgeç: Önem › Uyarı ve alarm).

## Ekran {#ekran}

![Sistem › Olay akışı](ekran:olaylar-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Tür | Yukarıdaki türlerden biri. Altındaki düğmeler tür başına sayıyı gösterir; tıklayınca yalnız o tür, yeniden tıklayınca hepsi |
| Bot | Olay bir bota aitse (Kairos, Tao, oluşturduğunuz botlar, model portföyler) |
| Makine | Birden çok makine görünüyorsa çıkar: olay hangi bilgisayarda oldu |
| Önem | **Hepsi** · **Uyarı ve alarm** · **Yalnız alarm**. Alarm satırları kırmızı |
| Zaman | Bugün · son 3 / 7 / 30 / 90 gün · son 1 yıl |
| Ara | Olayın metninde arar |
| Daha eski olaylar | Bir seferde 200 olay gelir; düğme sıradaki 200'ü ekler |

## Uyarılar ve ne yapmalı {#uyarilar}

- Olay akışı kayıtları **kopyalar**, kaynaklara dokunmaz: Pusula her 10 dakikada bir (ve sayfa açılınca) günlüklerden, bildirim geçmişinden, ayar geçmişinden, botların emir defterinden yeni satırları okur. Bu yüzden bir olay sayfada en geç 10 dakika sonra görünür; sayfayı açmak hemen okutur.
- İlk açılışta geçmiş de doldurulur — ama yalnız kaynağın hâlâ tuttuğu kadarı (günlükler 30 gün, bildirim geçmişi son 1000 mesaj). Bundan sonrası 1 yıl kalır; 13 aydan eski ay dosyaları kendiliğinden silinir (yalnız olay akışının kendi klasöründe — kaynak kayıtlar etkilenmez).
- Eş makineye ulaşılamazsa başlığın yanında "okunamadı" yazar; o makinenin olayları o an listede yoktur, makine geri gelince görünür.
- Tutarlar (miktar, bakiye, sermaye) bu sayfaya **yazılmaz** — eş makineye ve telefona da gittiği için. Tutarlı ayrıntı için ilgili ekrana bakın (Botlar › İşlemler, Ayar geçmişi).
- Kayıtlar `veri/olaylar/` altında ay ay JSON satırlarıdır (taşıma dosyasına ve yedeğe girer).
