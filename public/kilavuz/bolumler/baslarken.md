# Başlarken {#baslarken}

Pusula; portföyünüzü, Kairos ve Tao botlarını (eski adları Hücum ve Denge) ve araştırmalarınızı tek yerden izlediğiniz paneldir. Bu kılavuz panelin içindedir ve panelle birlikte güncellenir: üst çubuktaki **? Kılavuz** düğmesi açık ekranın bölümünü açar.

## Ne işe yarar {#ne-ise-yarar}

- **Her gün bir bakış:** Ana sayfa "bugün bir şey yapmam gerekiyor mu?" sorusunu cevaplar (yapılacaklar, portföy özeti, sistem ışıkları, bot durumu).
- **Portföy:** Pano, Hesaplar, Varlıklar, İşlem defteri, Hedefim, Modeller, Takvim ve akış, Rapor — kendi paranızın tamamı.
- **Botları yönetmek:** Botlar › Kairos / Tao; her botun dört görünümü var — **Genel** (başlat, durdur, acil fren, sonuç), **Hesap** (borsadaki hesap: bakiye, pozisyonlar, emirler), **İşlemler** (grafik ve işlem kayıtları), **Yönetim** (hesap türü, kontroller).
- **Fikir denemek:** **Araştırma** (özet, stratejiler, backtest, Pine, portföy laboratuvarı, araştırma defteri) ve ayrı **Coin tarama** (tarama, kaçın / izle listeleri, listeler, ayarlar). Kâğıt test ve emekli botlar Arşiv'dedir.

> **Uyarı:** Pusula canlı hesapla işlem yapmaz. Botlar **kâğıt** (sanal hesap) ya da **demo** (Binance Demo Trading, sahte para) modunda çalışır. Canlı mod bilinçli olarak kapalıdır.

## Ekran haritası {#ekran-haritasi}

![Ana sayfa — masaüstü](ekran:ana-1400)

Masaüstünde (1024 px ve üstü) menü solda durur: dört grup (**Günlük · İzleme · Araştırma · Sistem**), en çok iki seviye; alt sayfa adreste yazar (ör. `#/portfoy/pano`, `#/botlar/hucum/yonetim`). Telefonda ve tablette ekranın altında çubuk vardır: **Ana · Portföy · Botlar · Sinyaller · Menü**. **Menü** yan menünün aynısını açar (kalan ekranlar ve bu kılavuz orada).

![Telefon — alt çubuk](ekran:ana-390)

![Telefon — Menü](ekran:diger-390)

| Grup › Menü | Cevapladığı soru | Kılavuz bölümü |
|---|---|---|
| Günlük › Ana sayfa | Her şey yolunda mı, bugün bir şey yapmam gerekiyor mu? | [Ana sayfa](#/kilavuz/ana) |
| Günlük › Portföy | Param ne durumda, hedefe göre nerede, ne alıp satmalıyım? | [Portföy](#/kilavuz/portfoy) |
| Günlük › Botlar | Bot ne yapıyor, borsadaki hesabında ne var? | [Botlar](#/kilavuz/botlar), [Bot hesabı](#/kilavuz/hesaplar) |
| İzleme › Sinyaller | Bugün hangi kural ne diyor, ne zaman fikir değiştirebilir? | [Sinyaller](#/kilavuz/sinyaller) |
| İzleme › İleri test | Canlı veride tutuyor mu? | [İleri test](#/kilavuz/ileri-test) |
| Araştırma › Araştırma | Bu fikir işe yarar mı? | [Stratejiler](#/kilavuz/stratejiler), [Backtest](#/kilavuz/backtest), [Araştırma defteri](#/kilavuz/defter) |
| Araştırma › Coin tarama | Bugün hangi coinlere dikkat? | [Coin tarama](#/kilavuz/coin-tarama) |
| Sistem › Veri | Veriler güncel mi? | [Veri](#/kilavuz/veri) |
| Sistem › Ayarlar | Telegram, sağlık sinyali, bağlantılar, güncelleme | [Ayarlar](#/kilavuz/ayarlar) |
| Sistem › Bilgi | Kılavuz, [Pusula Kursu](#/kilavuz/pusula-kursu) (paneli sıralı görevlerle uygulamalı öğrenme), Pusula Kitabı (Pusula, güvenlik, botlar, testler, sözlük) ve kitapçık (botlar nasıl alır, nasıl satar, geçmişte ne yaptı?) | [Kılavuzu kullanmak](#/kilavuz/kilavuz-kullanimi), [Pusula Kursu](#/kilavuz/pusula-kursu), [Pusula Kitabı](#/kilavuz/pusula-kitabi), [Kitapçık](#/kilavuz/kitapcik) |
| Sistem › Arşiv | Artık kullanılmayan bölümler (kâğıt test, emekli botlar) | [Arşiv](#/kilavuz/arsiv) |

## Ekranın üstündeki işaretler {#isaretler}

- **Araştırma modu** rozeti (turuncu) ve bandı: bu bilgisayarda bot, borsa ve emir düğmeleri kapalıdır; bot başka bir bilgisayarda (sunucuda) çalışır. Bu bir hata değildir. Ayrıntı: [Sık sorulanlar](#/kilavuz/sss/arastirma-modu).
- **Turuncu sürüm bandı** ("bu sayfa eski sürümü çalıştırıyor"): tarayıcı eski dosyaları gösteriyor. **Ctrl+F5** ile sayfayı yenileyin; sürmezse sunucuyu yeniden başlatın.
- **? işareti:** bir terimin yanındaki küçük soru işareti, terimin sade açıklamasını gösterir. Tümü [Sözlük](#/kilavuz/sozluk)'te.
- **Üst çubuk** (sağ üst): **Kur** (kur çevirici) · **? Kılavuz** · bot çalışırken kırmızı **Acil durdur** (onay ve PIN ister) · tema düğmesi (koyu varsayılan, açık tema da var). Portföy sayfalarında ayrıca **Ben / … / Tümü** ve **$ / ₺ / Gizli** seçicileri.
- Para ve sayılar Türkçe biçimdedir: `$1.234,56`, `%12,3`.

## İlk gün ne yapmalı {#ilk-gun}

1. Sunucuda kurulumu bitirin: [Sunucuya kurulum](#/kilavuz/kurulum).
2. Ana sayfadaki **Yapman gerekenler** listesini okuyun ve her satırın bağlantısına tıklayın.
3. Gerçek hesap ve varlıklarınızı **Portföy › Hesaplar**'a girin ([Portföy](#/kilavuz/portfoy)); model portföylerin bu ayki listesi Portföy › Modeller'deki **Bu ay** kartında.
4. Telegram bildirimlerini kurun: [Ayarlar › Bildirimler › Telegram](#/kilavuz/ayarlar/telegram).
5. Telefondan bakmak isterseniz: [Telefondan açmak](#/kilavuz/telefon).

> **İpucu:** Neyi nerede bulacağınızı bilmiyorsanız kılavuzun üstündeki arama kutusuna bir kelime yazın (ör. "acil", "demo", "liste").
