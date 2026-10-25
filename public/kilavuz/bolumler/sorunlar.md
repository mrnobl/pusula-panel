# Sorunlar (Sorun merkezi) {#sorunlar}

## Ne işe yarar {#ne-ise-yarar}

"Bir şey ters mi gidiyor, ben ne yapmalıyım?" sorusunun tek cevabı. Pusula o an bildiği bütün sorunları — botların durması, güvenli kip, borsa bağlantısı, güncelleme, Telegram, sağlık sinyali, veri kaynakları, yedek, disk, sunucu bilgisayarı ve diğerleri — **aynı biçimde** tek sayfada gösterir. Ekrana bakıp "neler oluyor?" diye beklemenize gerek kalmaz: sorun yoksa sayfa yalnız **Her şey yolunda · son denetim N dk önce** der; sorun varsa ne yapacağınızı söyler.

Her kart aynı beş soruyu cevaplar:

| Soru | Kartta |
|---|---|
| **Ne oldu** | Sade açıklama (botun durma sebebi, hata metni, saat) |
| **Ciddi mi** | Zararsız · Dikkat · Tehlike — ve nedeni |
| **Kendiliğinden geçer mi** | Evet / hayır; geçecekse **tahmini kalkış saati** (bakım bitişi + 15 dk, son tekrar + 60 dk, son stop vuruşu + 24 sa, borsa beklemesinin bitişi …) |
| **Ne yapmalı** | 2–5 adım |
| **Dokunmayın** | Durumu kötüleştirecek şey (ör. borsa beklemesinde düğmelere tekrar tekrar basmak) |

Ayrıca: **Neyi saydı?** (botu durduran satırlar, ret kodlarının sade açıklaması, coin başına borsa / kayıt farkı), **eylem düğmeleri** (Borsayla karşılaştır, Botu yeniden aç, Güvenli kipi kaldır, Acil durdur, ilgili sayfa), **Kılavuz** (bu kılavuzdaki [Sorun giderme](#/kilavuz/sorun-giderme) başlığı) ve **Ne zaman geliştirme sohbetine yazmalı**.

## Ne zaman kullanılır {#ne-zaman}

- Başlık çubuğundaki küçük rozet ya da yan menüde **Sorunlar**'ın yanında sayı göründüğünde (kırmızı: müdahale bekliyor · sarı: dikkat). 73.8'den beri rozet yalnız bu ikisini sayar; kendiliğinden geçecek ve bilgi kartları yalnız sayfada görünür.
- Ana sayfanın üstünde sorun bandı çıktığında (yalnız müdahale ya da dikkat varken).
- Telegram'daki bir uyarının sonundaki **Sorunlar** bağlantısına tıkladığınızda.
- Geliştirme sohbetine bir sorun anlatacağınızda: **Sohbete gönder**.

## Ekran {#ekran}

![Sistem › Sorunlar: müdahale bekleyen, dikkat ve kendiliğinden geçecek örnek kartlar (gerçek veri değil)](ekran:sorunlar-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Üst satır | Kaç sorun hangi ciddiyette; son öz denetimin ne zaman yapıldığı. **Sohbete gönder (teşhis paketi)** ve **Yenile** |
| Kart rengi | Sol kenar: kırmızı müdahale bekliyor · sarı dikkat · mavi kendiliğinden geçecek ya da bilgi |
| Tahmini saat | Mavi rozet ("~04:15"): sorunun kendiliğinden kalkması beklenen saat |
| Sebebi okudum | Botu açan / güvenli kipi kaldıran düğmeler bu kutu işaretlenmeden çalışmaz (Sağlık sayfasındaki gibi) |
| Sorun araçları (73.8) | **Kaydı borsaya eşitle**, **Zarar sınırını sıfırla**, **Farkı kabul et**, **Yatırmayı kabul et**: önce önizleme kartın altında açılır (şimdi / sonra, uyarılar); uygulanabilirse **Acil PIN** ve onay kelimesi (ESITLE / SIFIRLA / KABUL) ile **Uygula**. Arada durum değiştiyse hiçbir şey uygulanmaz, yeni önizleme gelir. Emir gönderilmez |
| Para hareketi araçları (76.2, 76.4) | Borsada algılanan para girişi / çıkışı onayınızı bekliyorsa kartta **Para hareketini onayla** (PIN + **ONAY**); siz yapmadığınız çıkış için **Bu ben değilim — reddet** (PIN + **BEN DEĞİLİM**: bot durmuş kalır, Telegram'a güvenlik alarmı gider, kırmızı kart kalır); reddedilen hareket sonradan sizinse **Hareket benimmiş — onayla**. Telefondan da yapılır, Telegram'dan yapılmaz — ayrıntı: [Para hareketi onayınızı bekliyor](#/kilavuz/sorun-giderme/para-akisi-onay) |
| bu bilgisayar | Geliştirme bilgisayarında, sunucunun değil bu bilgisayarın sorunu (sunucu bağlantısı, yazma kuyruğu) |

## Sohbete gönder (teşhis paketi) {#teshis}

Tek düğme; panoya şunları kopyalar: sürüm ve commit, makine rolü (sunucu / araştırma kopyası), etkin sorunların kart metinleri, son olay raporunun özeti, botların durum özeti, ilgili sayaçlar (emir reddi, tekrarlayan hata, stop, açılış, güncelleme, Telegram kuyruğu) ve son 30 dakikanın uyarı / hata satırları (bot etiketli). **Sır içermez:** API anahtarları, Telegram jetonu, chat id, sağlık sinyali adresleri, e-posta adresleri ve uzun anahtar benzeri dizgiler silinir; paket 12 000 karakteri geçmez. Kartın kendi **Sohbete gönder** düğmesi aynı paketi o kart başta olacak şekilde kopyalar. Tarayıcı panoya izin vermezse metin seçili bir kutuda açılır.

## Telefonda ve geliştirme bilgisayarında {#telefon}

- **Telefon:** yalnız telefondan yapılabilen işlemler görünür: Acil durdur (acil PIN ile), ilgili sayfaya gitmek, güncellemeyi kurmaya gitmek ve **sorun araçları** (acil PIN + onay kelimesi). Diğer düğmeler için kart "sunucudaki panelde" der.
- **Geliştirme bilgisayarı:** kartlar sunucudan okunur (sunucuya ulaşılamıyorsa son okunan kopya, üstte not). Bu bilgisayarın kendi sorunları **bu bilgisayar** etiketiyle eklenir. Bot / borsa düğmeleri burada kapalıdır; sorun araçları ise sunucuya iletilir (yazma jetonu kuruluysa; kuyruğa girmez — sunucu kapalıysa yapılmaz).
- **Telegram /teshis:** etkin sorunlar ve her biri için ilk iki adım (yalnız okuma).

## Uyarılar {#uyarilar}

- Sayfa hiçbir şeyi kendiliğinden değiştirmez; düğmeler var olan işlemleri (Sağlık ve Botlar sayfalarındakilerin aynısı) ya da önizlemeli, PIN'li sorun araçlarını çağırır.
- Kartlar en çok 30 saniyelik önbellekten gelir; **Yenile** hemen tazeler. Rozet her sayfada 5 dakikada bir tazelenir.
- "Tanınmayan sorun" kartı Pusula'nın gördüğü ama henüz açıklayamadığı bir durumdur — **Sohbete gönder** ile iletin.
- Kendiliğinden geçecek kartlarda tahmini saat bir tahmindir; geçmezse kart "kısa süre içinde … kalkmazsa Sağlık › Şimdi yokla" der.
