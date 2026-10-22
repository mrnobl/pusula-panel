# Bildirimler {#bildirimler}

## Ne işe yarar {#ne-ise-yarar}

"Telefonuma hangi bildirimler gelsin?" Telegram'a giden her bildirim türü tek listede: ne zaman geldiği, önemi, en son ne zaman gönderildiği ve **açık / kapalı** düğmesi. Sağda **son gönderilenler**: her mesajın türü, başlığı ve sonucu (gönderildi · kapalı olduğu için gönderilmedi · gönderilemedi).

Telegram bağlantısının kendisi (bot token, chat id, etkinleştirme, deneme mesajı) [Ayarlar › Bildirimler](#/kilavuz/ayarlar/bildirimler)'de; bu sayfa yalnız **hangi** bildirimin gideceğini yönetir.

## Ne zaman kullanılır {#ne-zaman}

- Çok mesaj geliyorsa: örneğin her işlem bildirimini kapatıp yalnız günlük özeti açık bırakmak için.
- Bir bildirimin gelip gelmediğini kontrol etmek için: son gönderilenler listesinde sonucu yazar.
- Telegram'ı yeni kurduğunuzda: **Deneme mesajı gönder** ile bağlantıyı sınamak için.

## Ekran {#ekran}

![Sistem › Bildirimler](ekran:bildirim-1400)

## Türler {#turler}

| Tür | Ne zaman gelir |
|---|---|
| Acil durum | Acil durdurma, bot durduruldu, koruma stopu konamadı, kayıt uyuşmazlığı, çökme, kurulamayan güncelleme. **Kapatılamaz** |
| İşlem yapıldı | Bot bir coin aldığında ya da sattığında |
| Günlük bot özeti | Botun her günkü çalışmasından sonra: karar, hesap değeri, koruma stopu |
| Başlatma / durdurma | Sunucu ya da bot başladığında, bağlantı kurulduğunda, piyasa verisi geri geldiğinde |
| Uyarı ve hata | Borsaya ya da veriye ulaşılamadı, disk dolmak üzere gibi dikkat isteyen durumlar |
| Günlük / haftalık rapor | Her sabah günlük rapor özeti, pazartesi haftalık özet; ayın 1'i aylık, 1 Ocak yıllık özet |
| Model uygulama günü | Model portföylerin alım-satım listesi (kâğıt hesap) hazır olduğunda |
| Coin tarama / Dikkat listesi | Kaçın / izle listesine yeni coin girdiğinde |
| İleri test | Bir ileri test uyarı ya da alarm eşiğini aştığında, uygulama sapması, demo kabul notları |
| Güncelleme | Yeni sürüm onay bekliyor, elle bakılmalı ya da GitHub'a ulaşılamıyor |
| Yedek | Otomatik yedek alınamadığında |
| Diğer | Yukarıdakilere girmeyen mesajlar |

Tür, mesajın başlığından kendiliğinden anlaşılır (ör. 🚨 ile başlayan her mesaj acil durumdur). İlk açılışta eski Ayarlar'daki "Kritik olaylar · Hatalar · Başlatma / durdurma · Her işlem" seçimleriniz başlangıç değeri olarak alınır.

## Mesajların biçimi {#bicim}

Her bildirim aynı biçimde gelir: **bot · ne oldu** başlığı, bir iki sade cümle, uyarı ve acil mesajlarda **Ne yapmalı:** satırı (nereye bakılacağı ya da bir şey yapmana gerek olmadığı) ve kısa saat ("Pusula · 19 Eki 03:02"). Sayılar Türkçe yazılır (4.999,29 USDT); iç terimler ve belge adları çıkarılır. Hesap türü yalnız canlı hesapta başlıkta görünür ("Kairos (canlı)"). Gece de beklemeden gönderilir.

## Uyarılar ve ne yapmalı {#uyarilar}

- **Kapalı tür** gönderilmez ama kaybolmaz: son gönderilenler listesinde "kapalı olduğu için gönderilmedi" diye görünür, ayrıca [Günlükler](#/kilavuz/gunluk)'de de iz bırakır.
- **Geliştirme bilgisayarında hiçbir şey gitmiyor:** bilinçli. Sunucuya bağlı geliştirme kopyası (araştırma modu, `data/makine.json` ya da sunucu bağlantısı kurulu) Telegram'ı yoklamaz ve mesaj göndermez — aynı bot jetonunu iki bilgisayar yoklarsa Telegram "409 çakışma" verir. Bildirimleri sunucu gönderir. (Deneme için yalnız `TELEGRAM_GELISTIRME=1` ile açılır.)
- **"Gönderilemedi":** Telegram'a ulaşılamadı; bot bildirimleri giden kutusunda bekler ve internet dönünce sırayla gönderilir.
- Telefondan açıldığında sayfa yalnız görüntülenir; aç/kapat sunucunun bilgisayarından yapılır.
- Aynı uyarı tekrarlanırsa belli aralıklarla bir kez gönderilir; tekrar eden hata sohbeti doldurmaz.
