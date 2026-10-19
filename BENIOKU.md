# Pusula — kurulum

Pusula, **kendi bilgisayarınızda**, **kendi borsa hesabınızla** çalışan bir portföy ve bot panelidir. Anahtarlarınız, portföy
kayıtlarınız ve bildirim ayarlarınız yalnız sizin bilgisayarınızda durur; yazılımı geliştirenlere hiçbir şey gönderilmez.

> **Uyarı:** Pusula yatırım tavsiyesi değildir. Kripto ve hisse piyasalarında paranın tamamı kaybedilebilir. Panelin ilk
> açılışındaki kullanım şartlarını okuyup onaylamadan botlar başlatılamaz.

## Gerekenler

- Windows 10 / 11 (64 bit) bilgisayar — botlar çalışırken açık kalmalı
- Binance hesabı (önce **Demo Trading** — sanal para)

Node.js, Git ya da başka bir program kurmanız GEREKMEZ: kurulum programı hepsini içinde getirir.

## Kurulum (önerilen): indir → çalıştır

1. Bu deponun **Releases** sayfasından `Pusula-Kurulum-<sürüm>.exe` dosyasını indirin (yanındaki `.sha256` özetiyle
   karşılaştırabilirsiniz: PowerShell'de `Get-FileHash Pusula-Kurulum-<sürüm>.exe`).
2. Çift tıklayın. Windows **"Windows bilgisayarınızı korudu"** derse: **Ek bilgi** › **Yine de çalıştır** (program imzasız).
   **Yönetici izni istemez.**
3. **Kur** → bir iki dakika. Program `%LOCALAPPDATA%\Programs\Pusula`'ya, verileriniz ayrı bir klasöre (`C:\Pusula-Veri`) kurulur;
   zamanlanmış görevler (otomatik açılış, bekçi, güncelleme, yedek), masaüstü ve Başlat menüsü kısayolları, telefon jetonu ve uyku
   ayarı kendiliğinden yapılır.
4. Son ekranda **Pusula'yı başlat ve kurulum sihirbazını aç** → tarayıcıda **Kurulum sihirbazı**: **Yeni kurulum** (riskler ve
   kullanım şartları, Binance demo anahtarı, Telegram, telefondan erişim, acil durdurma, ilk deneme) ya da **Başka bilgisayardan
   taşı** (taşıma dosyanız varsa her şey dosyadan gelir).

Yeni kurulum bomboş açılır: önceden yüklü fiyat / grafik yoktur, ihtiyaç olunca indirilir. Yalnız geliştiricinin botlarının
**gerçekleşmiş sonuçları** (demo / kâğıt hesap, yüzde olarak) Botlar sayfasında görünür.

Bir şey eksik kaldıysa panelde **Sistem › Kurulum denetimi**: her parça yeşil / kırmızı, kırmızıda **Onar**.

**Kaldırma:** Ayarlar › Uygulamalar › Pusula › Kaldır. Program, görevler ve kısayollar silinir; **verileriniz silinmez**
(`C:\Pusula-Veri` yerinde kalır, yeniden kurarsanız aynısı kullanılır).

## Elle kurulum (gelişmiş)

Node.js LTS ve Git kurulu bir bilgisayarda:

1. `git clone https://github.com/mrnobl/pusula-panel.git C:\Pusula` ve `cd C:\Pusula`
2. `npm ci --omit=dev`
3. `npm run kur` — kurulum programının yaptığı her şeyi yapar (tekrar çalıştırılabilir; `npm run kur -- --kuru` yalnız ne
   yapacağını yazar). Kurulum işareti yazıldığı için veri `C:\Pusula-Veri`'ye gider (`--veri <klasör>` ile başka bir yer).
4. `Pusula-Baslat.cmd` → `http://localhost:3000` → Kurulum sihirbazı.

Ayrıntılı kılavuz panelde **Bilgi › Kılavuz**'dadır (Başlangıç › Kurulum programı).

## Güncelleme

Güncellemeler bu depodan gelir (Git). Panelde **Ayarlar › Güncelleme**; otomatik güncelleme görevi her gün 12:00'de bakar.
Bot kodunu değiştiren güncellemeler sizin onayınız olmadan kurulmaz.
