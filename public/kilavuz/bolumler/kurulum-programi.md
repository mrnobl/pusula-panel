# Kurulum programı (yeni bilgisayar) {#kurulum-programi}

## Ne işe yarar {#ne-ise-yarar}

Pusula'yı yeni bir Windows bilgisayara **tek dosyayla** kurar: `Pusula-Kurulum-<sürüm>.exe`. İçinde her şey hazırdır — Pusula'nın kendisi, taşınabilir Node.js, Git (güncellemeler için) ve gerekli paketler. Bilgisayara ayrıca bir şey kurman gerekmez, **yönetici izni istemez**.

Yeni kurulum **bomboş** açılır: önceden yüklü fiyat, grafik ya da araştırma çalışması yoktur; fiyatlar ihtiyaç olunca (bot çalışınca, grafik açılınca) indirilir. Yalnız **botlarımızın gerçekleşmiş sonuçları** gelir ([Botlar](#/kilavuz/botlar/bot-performansi)).

## Adım adım {#adimlar}

1. `Pusula-Kurulum-<sürüm>.exe` dosyasını indir ve çift tıkla.
2. Windows **"Windows bilgisayarınızı korudu"** (SmartScreen) mavi penceresini gösterirse: **Ek bilgi** › **Yine de çalıştır**. Program imzasız olduğu için bu uyarı çıkar; dosyanın doğru olduğunu yanında gelen `.sha256` özetiyle karşılaştırabilirsin (PowerShell: `Get-FileHash Pusula-Kurulum-<sürüm>.exe`).
3. Kurulum klasörü: `%LOCALAPPDATA%\Programs\Pusula` (değiştirmene gerek yok). **İleri** › **Kur**.
4. Kurulumun sonunda Pusula kendini hazırlar (bir iki dakika): zamanlanmış görevler, masaüstü ve Başlat menüsü kısayolu, veri klasörü, telefon jetonu, uyku ayarı, güncelleme deposu.
5. Son ekranda **"Pusula'yı başlat ve kurulum sihirbazını aç"** işaretliyken **Son**. Tarayıcıda [kurulum sihirbazı](#/kilavuz/kurulum-sihirbazi) açılır: **Yeni kurulum** ya da **Başka bilgisayardan taşı**.

Sihirbaz dışında elle yapacağın bir adım yoktur; sihirbaz yalnız senin girmen gereken bilgileri sorar (Binance anahtarı, Telegram, acil PIN, telefondan erişim). Taşıma dosyan varsa bunlar da dosyadan gelir.

## Verilerin nerede {#veri-yeri}

Program ile verin **ayrı** klasörlerdedir:

| Ne | Nerede |
|---|---|
| Program | `%LOCALAPPDATA%\Programs\Pusula` |
| Verin (portföy, bot kayıtları, ayarlar, şifreli anahtarlar) | `C:\Pusula-Veri` — içinde `kisisel`, `gizli`, `arastirma`, `onbellek`, `makine` |

Veri klasörü görünür bir yerdedir; yedek almak için bu klasörü ya da [taşıma dosyasını](#/kilavuz/yedek-tasima) kullan.

## Kurulumun yaptıkları {#ne-kurar}

- **Görevler** (Windows Görev Zamanlayıcı, oturum açıkken): otomatik açılış (PusulaBot), bekçi (PusulaBekci — Pusula kapanırsa yeniden açar), coin tarama günlük arşivi (PusulaDikkatArsiv), otomatik güncelleme (PusulaGuncelle, 12:00), günlük yedek (PusulaYedek). Sunucu kurulumunda (`/ROL=sunucu`) ayrıca haftalık USB yedeği (PusulaYedekUSB).
- **Kısayollar**: masaüstü ve Başlat menüsünde "Pusula" ile "Pusula'yı durdur".
- **Uyku**: prize bağlıyken bilgisayar uykuya geçmez (botlar uykuda çalışmaz). Bu ayar değişmezse [Kurulum denetimi](#/kilavuz/kurulum-denetimi) uyarır.
- **Güncelleme**: program klasörü Git ile güncellenir (Ayarlar › Güncelleme). Bot kodunu değiştiren güncelleme onayın olmadan kurulmaz.

Görevler "oturum açıkken" kurulur (parola sorulmaz). Bilgisayar açılınca **oturum açılmasa da** başlasın istersen ilgili görevi Windows parolanla yeniden kur — [Sunucuya kurulum](#/kilavuz/kurulum) bölümündeki komutlar.

Kurulum tekrar çalıştırılabilir: `npm run kur` eksik olanı tamamlar, var olana dokunmaz (`npm run kur -- --kuru` yalnız ne yapacağını yazar).

## Kaldırma {#kaldirma}

Denetim Masası › Programlar (ya da Ayarlar › Uygulamalar) › **Pusula** › Kaldır. Pusula durdurulur, görevler ve kısayollar silinir, program klasörü silinir.

**Verilerin SİLİNMEZ** — kaldırıcı sonunda bunu ve veri klasörünün yerini söyler. Yeniden kurarsan Pusula aynı klasörü kullanır. Gerçekten silmek istersen `C:\Pusula-Veri` klasörünü kendin sil.

## Bir şey ters giderse {#sorun}

Sistem › [Kurulum denetimi](#/kilavuz/kurulum-denetimi) her parçayı yeşil / kırmızı gösterir; kırmızı satırdaki **Onar** o adımı yeniden kurar. Kurulum günlüğü: `C:\Pusula-Veri\makine\kur.log`.
