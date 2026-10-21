# Yedek ve taşıma {#yedek-tasima}

## Ne işe yarar {#ne-ise-yarar}

Pusula'yı **başka bir bilgisayara taşımak** ya da **tam yedek** almak için tek bir dosya: **taşıma dosyası** (`.pusula`). Yeni bilgisayarda kurulum sihirbazının ilk adımında **Başka bilgisayardan taşı** ile açarsın; portföyün, işlem defterin, bot kayıtların, ileri test kayıtların, raporların ve ayarların kendiliğinden yerine konur. Yerin: **Ayarlar › Yedek ve taşıma** (`#/ayarlar/yedek`).

| Ne girer | Nasıl |
|---|---|
| **Kişisel** — portföy, işlem defteri, bot durumları ve emir defterleri, ileri test kayıtları, model portföy kâğıt hesabı, Dikkat listesi, günlükler, raporlar, kurulum onayı | düz (dosya başına özetle doğrulanır) |
| **Ayarlar** — yalnız varsayılandan farklı olanların | düz; içinde anahtar yok |
| **Gizli** — API anahtarları, Telegram jetonu, panel jetonu, telefon jetonu, acil PIN özeti, yedek şifresi | **şifreli** (senin şifrenle) |
| **Sunucu bağlantısı** | yalnız "Sunucu bağlantısını da taşı" işaretliyse, şifreli |
| **Araştırma verileri** | yalnız "Araştırma verilerini de ekle" işaretliyse |

**Hiç girmeyenler:** fiyat ve mum önbelleği (yeni bilgisayar kendisi indirir) ve bu bilgisayara özel dosyalar (günlük dosyaları, süreç kaydı, makine ayarı).

## Ne zaman kullanılır {#ne-zaman}

- Yeni bir bilgisayara geçerken (eski bilgisayarda oluştur, yenisinde sihirbazdan aç).
- Bilgisayar bozulursa geri kurmak için (haftalık USB yedeği de aynı biçimde).
- Araştırma çalışmalarını başka bilgisayarında da görmek için (ayrı **araştırma eklentisi**).

## Ekran {#ekran}

![Ayarlar › Yedek ve taşıma](ekran:yedek-tasima-1400)

## Taşıma dosyası oluşturmak {#olustur}

1. **Ayarlar › Yedek ve taşıma**'yı aç.
2. **Şifre**yi iki kez yaz (en az 8 karakter). Gizli bilgiler bu şifreyle şifrelenir.
3. Kutular varsayılan **işaretsiz**:
   - **Araştırma verilerini de ekle** — araştırma senindir, taşıma dosyasına girmez; işaretlersen dosya büyür (yanında tahmini boyut yazar).
   - **Sunucu bağlantısını da taşı** — işaretlersen yeni bilgisayar açılır açılmaz sunucundaki panele bağlanır. Yanlışlıkla başka birine verilen dosya sunucuna erişim vermesin diye kapalıdır.
4. **Taşıma dosyası oluştur** — ilerleme çubuğu dolar; dosya **Oluşturulan dosyalar** listesinde çıkar.
5. **İndir** ile al, USB belleğe ya da güvendiğin bir yere kopyala.

Komut satırı karşılığı: `npm run tasima-olustur -- --sifre-dosyasi C:\sifre.txt` (şifre dosyasının ilk satırı; işin bitince sil). Şifre verilmezse dosyaya gizli bilgiler **girmez** ve bu açıkça yazılır.

## Şifre {#sifre}

> **Uyarı:** Şifreyi unutursan dosyadaki gizli bilgiler (anahtarlar, jetonlar, PIN) **açılamaz** — kimse kurtaramaz. Kişisel kayıtlar yine açılır; anahtarları yeni bilgisayarda yeniden girersin.

- Şifre dosyada hiçbir biçimde (özeti bile) durmaz. Yanlış şifre ya da dosyada tek bir bozuk bayt varsa açma reddedilir ve **hiçbir şey değişmez**.
- Dosyayı ve şifreyi aynı yerde saklama.

## İçe aktarma (yeni bilgisayarda) {#ice-aktarma}

1. Yeni bilgisayarda Pusula'yı aç; **Bilgi › Kurulum sihirbazı** → ilk adımda **Başka bilgisayardan taşı**.
2. Dosyayı seç ya da bu bilgisayardaki tam yolunu yaz (büyük dosyada yükleme beklemez) → **Dosyayı aç**. Dosyanın hangi bilgisayardan, hangi tarihte ve hangi Pusula sürümünden geldiği şifresiz okunur.
3. Şifreyi yaz → **Doğrula ve önizle**: her dosyanın özeti tek tek denetlenir; ne geleceğini ve ne kadar olduğunu görürsün. Henüz hiçbir şey değişmemiştir.
4. **Bu bilgisayara taşı**. Sonra Pusula'yı kapatıp yeniden aç (denetleyiciyle çalışıyorsa kendisi yeniden başlar).

**Kurallar:**

- Bu bilgisayarda zaten kişisel veri varsa **üzerine yazılmaz** — taşıma reddedilir. İstersen **Var olanı yedekleyip değiştir**: var olan veri silinmez, veri klasöründe `makine/onceki-<zaman>` altına taşınır.
- **Botlar kendiliğinden başlamaz.** Bot kayıtları gelir ama her bot için önce **Botlar › <bot> › Yönetim › Mutabakat** (borsayla karşılaştırma), temiz çıkınca **Başlat**. O zamana kadar panelin üstünde uyarı şeridi durur.
- Kurulum onayın dosyadan gelir; kullanım şartlarının metni değiştiyse sihirbaz yeniden onay ister.
- Komut satırı karşılığı (Pusula **kapalıyken**): `npm run tasima-ice-aktar -- --dosya D:\pusula.pusula --sifre-dosyasi C:\sifre.txt`.

## Araştırma eklentisi {#eklenti}

Araştırma verilerin (deneme sonuçları, araştırma kayıtları, kitapçıklar) senindir; taşıma dosyasına varsayılan olarak girmez ve kimseyle paylaşılmaz. Başka bilgisayarında da görmek istersen:

1. Bu bilgisayarda **Araştırma eklentisi oluştur** (şifre isteğe bağlı; şifreliyse dosya adları da görünmez) → `.pusula-arastirma` dosyasını indir.
2. Diğer bilgisayarda **Ayarlar › Yedek ve taşıma › Eklenti yükle**.

Eklenti var olan araştırma verilerinin **üzerine yazmaz**: aynı dosya atlanır, farklı olan "çakışma" diye raporlanır. **Eklenti yüklü değilse Araştırma menüsü görünmez** (Araştırma özeti, Stratejiler, Backtest, Pine, Portföy laboratuvarı, Araştırma defteri ve Kitapçık); bu ekranların kılavuz bölümleri de içindekilerde çıkmaz. Daha önce kurulmuş Pusula'larda (eski `data` klasörü) Araştırma her zaman görünür.

## USB yedeği {#usb-yedegi}

Haftalık USB yedeği (Pazar 06:00, USB takılıysa) **taşıma dosyasıyla aynı biçimde** `PusulaYedek\pusula-yedek-<tarih>.pusula` yazar; son 8 kopya kalır. Gizli bilgiler, **Yedek şifresi** bir kez kaydedildiyse o şifreyle şifreli girer; kaydedilmediyse **girmez** ve yedek günlüğü bunu açıkça yazar.

Daha önce kurulmuş bir Pusula'da yedek şifresi kaydedilene kadar USB yedeği eski biçimde (klasör kopyası, sırlar hariç) sürer — yani güncelleme kendiliğinden hiçbir şeyi değiştirmez.

Geri kurmak: yeni bilgisayarda kurulum sihirbazı → **Başka bilgisayardan taşı** → USB'deki `.pusula` dosyasının yolunu yaz → yedek şifresi.

## Şifreli uzak yedek {#uzak-yedek}

Yerel yedek ve USB, sunucu çalınır, yanar ya da diski bozulursa kopyayla birlikte gidebilir. **Şifreli uzak yedek** günlük yerel kopyayı ücretsiz bir bulut hesabına (Google Drive, OneDrive …) **parolayla şifreleyerek** gönderir: bulut sağlayıcısı içeriği göremez. Araçlar ücretsiz ve açık kaynak: **restic** (şifreli yedek) ve **rclone** (bulut bağlantısı).

**Kurulum (sunucuda, bir kez):**
1. PowerShell'de: `winget install restic.restic rclone.rclone` (pencereyi kapatıp yeniden açın).
2. `rclone config` → **n** (yeni) → ad: `gdrive` → depolama: **Google Drive** → soruları varsayılanla geçin → tarayıcıda Google hesabınızla izin verin.
3. Pusula klasöründe: `npm run uzak-yedek -- --kur --depo rclone:gdrive:PusulaYedek` → bir **parola** sorulur (en az 12 karakter). Parola sır kasasına (şifreli) yazılır ve bulutta depo açılır.
4. **Parolayı Pusula'dan bağımsız iki yerde saklayın** (ücretsiz bir parola yöneticisi + kâğıt). Parola kaybolursa buluttaki yedek **açılamaz**.
5. İlk gönderim: `npm run uzak-yedek -- --simdi`. Sonra günlük yedek görevi (05:30) her gün kendiliğinden gönderir.

- Saklama yerel düzenle aynıdır: son 14 gün + 8 hafta. Haftada bir eski kopyalar temizlenir ve depo bütünlük denetiminden geçer (`restic check`).
- Durum: `npm run uzak-yedek -- --durum` (son gönderim, buluttaki kopyalar) ve Sağlık sayfasındaki **Şifreli uzak yedek** satırı (26 saatten eskiyse sarı).
- Başarısızlık yerel yedeği bozmaz; Telegram'a "Pusula uzak yedeği başarısız" gider.
- Geri dönüş: `restic -r rclone:gdrive:PusulaYedek restore latest --target C:\Pusula-geri` (parola sorulur), sonra gereken dosyaları elle kopyalayın.

## Eski yedekten geri yükleme {#eski-yedek}

68.1'den önceki günlük ve USB yedekleri tarihli **klasörlerdir** (içinde `yedek-manifest.json` ve `data\…`). Okunabilir kalırlar:

1. Pusula'yı durdur.
2. `npm run yedek -- --geri-yukle 2026-10-13 --dizin C:\Pusula-inceleme` — yedeği doğrular (her dosyanın özeti) ve **ayrı** bir klasöre açar; canlı veriye dokunmaz.
3. Gereken dosyaları açılan klasörün `data\` altından veri klasörüne elle kopyala, Pusula'yı başlat.

USB'deki eski klasör yedeğinde sırlar yoktur (anahtarlar, jetonlar); onları yeniden girersin.

## Uyarılar ve ne yapmalı {#uyarilar}

- Taşıma ve yedek işlemleri **yalnız bu bilgisayardaki panelden** yapılır; telefondan kapalıdır (indirme dahil).
- İçe aktarmadan sonra Pusula yeniden açılana kadar panel başka bir işlem kabul etmez — eski bellek yeni dosyaların üzerine yazmasın diye.
- "Dosya doğrulanamadı" görürsen dosya bozuk ya da yarım kopyalanmıştır: yeniden kopyala ya da yeniden oluştur. Hiçbir şey değişmemiştir.
- Taşıma dosyaları veri klasöründe `makine\tasima` altında birikir; işin bitince **Sil** ile temizle.
