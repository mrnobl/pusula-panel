# Sunucuya kurulum — Pusula C:\Pusula {#kurulum}

Bu kılavuz botun çalıştığı **sunucuyu** yeni standarda taşır: proje iki bilgisayarda da **aynı yerde, `C:\Pusula`** klasöründe durur; masaüstünde iki kısayol olur (**Pusula** ve **Pusula'yı durdur**); bilgisayar açılınca bot **kimse oturum açmasa da** kendiliğinden başlar. Eski klasör silinmez, yedek olarak kalır; ne zaman silineceğine siz karar verirsiniz (Adım 21).

Her adımda üç şey var: **Yap** (komut), **Kontrol** (nasıl anlarım), **Sorun olursa**. Komutlar **PowerShell** içindir (Başlat → "PowerShell" yazın). Yönetici gereken adımlar ayrıca belirtilmiştir. Bir adımda takılırsanız **ekranın görüntüsünü** (Windows tuşu + Shift + S) geliştirme sohbetine gönderin ve sonraki adıma geçmeyin.

> **Uyarı:** Bu taşımada canlı bot kodu (`lib/live`, `lib/risk`) değişmedi; değişen yalnız klasörün yeri, başlatma/durdurma ve otomatik başlatma. Bot Adım 2'den Adım 10'a kadar (yaklaşık 20–40 dakika; `market.db` kopyası uzun sürer) duracak — günlük çalışma saati (UTC gün kapanışından ~2 dk sonra, Türkiye saatiyle 03:02 civarı) dışında yapın.

## Özet sıra {#ozet-sira}

**Bu gece (sırayla, hepsi):**

1. [Eski klasörü bul, bekleyen liste kayıtlarını gönder](#/kilavuz/kurulum/adim-1)
2. [Botu durdur](#/kilavuz/kurulum/adim-2)
3. [Eski klasörün yedeğini al](#/kilavuz/kurulum/adim-3)
4. [Kodu `C:\Pusula`ya indir (`git clone`)](#/kilavuz/kurulum/adim-4)
5. [Veri ve ayar dosyalarını taşı](#/kilavuz/kurulum/adim-5)
6. [Paketleri kur (`npm install`)](#/kilavuz/kurulum/adim-6)
7. [Eski otomatik başlatma görevini kaldır](#/kilavuz/kurulum/adim-7)
8. [Acil PIN](#/kilavuz/kurulum/adim-8)
9. [Masaüstü kısayolları](#/kilavuz/kurulum/adim-9)
10. [Başlat, sürümü doğrula, durdurmayı dene](#/kilavuz/kurulum/adim-10)
11. [Otomatik başlatma: oturum açılmadan (PusulaBot)](#/kilavuz/kurulum/adim-11)
12. [Dikkat listesi günlük kayıt görevi](#/kilavuz/kurulum/adim-12)
13. [Botların sağlığı](#/kilavuz/kurulum/adim-13)
14. [Gölge izleyiciler ve coin tarama ilk çalışma](#/kilavuz/kurulum/adim-14)
15. [Telegram ve healthchecks](#/kilavuz/kurulum/adim-15)
16. [Demo modunu ve felaket stopunu doğrula](#/kilavuz/kurulum/adim-16)
17. [Telefondan erişim: Tailscale + jeton + acil denemesi](#/kilavuz/kurulum/adim-17)

**Sonra (acelesi yok):**

18. [BFUSD oran tablosu (bekleyen adım)](#/kilavuz/kurulum/adim-18)
19. [Liste girişleri yalnız sunucudan + git'e işleme](#/kilavuz/kurulum/adim-19)
20. [Otomatik yedek (PusulaYedek, her gün 05:30)](#/kilavuz/kurulum/adim-20)
21. [Yeniden başlatma denemesi ve eski klasör (karar sizin)](#/kilavuz/kurulum/adim-21)
22. [Otomatik güncelleme (PusulaGuncelle, her gün 12:00)](#/kilavuz/kurulum/adim-22)
23. [Geliştirme bilgisayarı sunucudaki botu canlı görsün (sunucu bağlantısı)](#/kilavuz/kurulum/adim-23)
24. [Canlı hesaptan önce: bilgisayar ayarları (uyku, güncelleme, izinler)](#/kilavuz/kurulum/adim-24)
25. [Geliştirme bilgisayarından Portföyüm ve İşlem defterim'e yazmak (yazma jetonu)](#/kilavuz/kurulum/adim-25)
26. [Veri klasörünü programdan ayırmak (isteğe bağlı — 68.0)](#/kilavuz/kurulum/adim-26)

Sonda: [Bilinen risk — oturum açılmazsa bot başlamaz](#/kilavuz/kurulum/bilinen-risk) ve [Sorun giderme](#/kilavuz/kurulum/sorun-giderme).

## 1. Eski klasörü bul, bekleyen liste kayıtlarını gönder {#adim-1}

**Yap:** PowerShell'i açın ve Pusula'nın **şu anki** (eski) klasörüne geçin. Klasör adı sunucuda farklı olabilir; içinde `server.js` ve `package.json` olan klasördür. Sonra yerini bir değişkene kaydedin:

```powershell
cd "C:\Users\<kullanıcı>\...\trade-bot"
$eski = (Get-Location).Path
$eski
git status
```

> **Önemli:** Bu PowerShell penceresini **Adım 6'nın sonuna kadar kapatmayın** — `$eski` değişkeni Adım 3 ve 5'te kullanılıyor. Kapanırsa yeniden açıp yukarıdaki `cd` ve `$eski = (Get-Location).Path` satırlarını tekrar yazın.

`git status` çıktısında `kayitlar/listeler/` altında yeni (kırmızı) dosya varsa, taşımadan önce git'e gönderin:

```powershell
git pull
git add kayitlar/listeler
git commit -m "liste kaydı"
git push
```

**Kontrol:** `$eski` eski klasörün yolunu yazar. `git status` ilk satırı `On branch main`; eski sürümlerde `modified: config.json` görmek normaldir (sunucudaki ayarlar — Adım 5'te taşınacak; 77.x'ten sonra `config.json` depoda izlenmez, bu satır görünmez). `kayitlar/listeler` artık listelenmiyor.

**Sorun olursa:**
- `git` tanınmıyorsa Git for Windows kurulu değildir: https://git-scm.com/download/win kurun, PowerShell'i kapatıp açın.
- `On branch main` değil de başka bir dal yazıyorsa: `git switch main`.
- `git push` reddedilirse ya da giriş isterse: tarayıcıda açılan GitHub penceresinden giriş yapın; olmazsa bu adımı atlayın — Adım 5 kayıtları dosya olarak da taşır.

## 2. Botu durdur {#adim-2}

Önce hangi adla kurulu olduğuna bakın (eski ad `AntigravityTradeBot`, yeni ad `PusulaBot`):

```powershell
Get-ScheduledTask -TaskName PusulaBot, AntigravityTradeBot -ErrorAction SilentlyContinue | Select-Object TaskName, State
```

**Yap:** Listelenen her görevi durdurun:

```powershell
Stop-ScheduledTask -TaskName PusulaBot -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName AntigravityTradeBot -ErrorAction SilentlyContinue
```

Siyah bir denetleyici penceresi (`scripts\start-bot.cmd`) açıksa onu da kapatın.

**Kontrol:** Sunucu artık dinlememeli:

```powershell
netstat -ano | findstr :3000
```

Çıktı boş olmalı (ya da yalnız `TIME_WAIT` satırları).

**Sorun olursa:** Hâlâ `LISTENING` satırı varsa en sağdaki sayı sürecin numarasıdır (PID). Yalnız O süreci kapatın:

```powershell
taskkill /PID <numara> /F
```

> **Tehlike:** `taskkill /IM node.exe` gibi toplu kapatma KULLANMAYIN — bilgisayardaki başka Node programlarını da kapatır.

## 3. Eski klasörün yedeğini al {#adim-3}

`data/` klasörü git'te **yoktur** (botun defteri, emir kayıtları, ileri test kayıtları, coin tarama kaydı, API anahtarları burada). Eski klasör zaten yerinde kalacak; bu ek kopya harici diskte, ucuz bir sigortadır. Bot durduğu için kopya tutarlıdır.

**Yap** (hâlâ eski klasördesiniz; hedefi kendi harici diskinize göre değiştirin, `E:` örnektir):

```powershell
$t = Get-Date -Format yyyy-MM-dd
robocopy data "E:\PusulaYedek\$t\data" /E /XF market.db market.db-shm market.db-wal *.kilit /R:1 /W:1 /NFL /NDL /NP
if (Test-Path config.json) { Copy-Item config.json "E:\PusulaYedek\$t\config.json" }
```

**Kontrol:** robocopy'nin son tablosunda `FAILED` sütunu 0 olmalı. robocopy çıkış kodu 0–7 başarıdır (1 = dosya kopyalandı); 8 ve üstü hatadır: `$LASTEXITCODE` yazıp bakabilirsiniz.

**Sorun olursa:** Harici disk yoksa aynı komutu bilgisayarın başka bir sürücüsüne (ör. `D:\PusulaYedek`) yapın. `market.db` (1 GB üstü) bilerek dışarıda: eski klasörde duruyor ve borsadan yeniden indirilebilir. Düzenli yedek için [Adım 20](#/kilavuz/kurulum/adim-20).

## 4. Kodu `C:\Pusula`ya indir (`git clone`) {#adim-4}

**Yap** (aynı pencerede):

```powershell
git clone https://github.com/mrnobl/pusula-panel.git C:\Pusula
cd C:\Pusula
git log -1 --format="%h %ad %s" --date=short
```

Depo özeldir: GitHub giriş penceresi açılırsa giriş yapın.

**Kontrol:** Tarih **2026-10-09 ya da sonrası** ve şu iki satır `True` yazar:

```powershell
Test-Path C:\Pusula\Pusula-Baslat.cmd
Test-Path C:\Pusula\scripts\kisayol-kur.ps1
```

Bundan sonra güncellemeler hep bu klasörde alınır: `cd C:\Pusula` ve `git pull`.

**Sorun olursa:**
- *"destination path 'C:\Pusula' already exists"*: daha önceki bir denemeden kalmıştır. İçine bakın (`Get-ChildItem C:\Pusula`); silmeden adını değiştirip tekrar deneyin: `Rename-Item C:\Pusula C:\Pusula-deneme` ve yukarıdaki komutlar.
- *"Authentication failed"*: GitHub girişi gerekiyor; açılan tarayıcı penceresinden giriş yapın.

## 5. Veri ve ayar dosyalarını taşı {#adim-5}

Git'te olmayan her şey eski klasörden kopyalanır: `data\` (botun defteri, ileri test, tarama, `secrets.json` = API anahtarları ve Telegram jetonu, `telefon-jeton.json`, `acil-pin.json`, `market.db`), varsa kökteki eski `config.json` (eski kurulumda sunucudaki ayarlar: bot modları; yeni düzende ayarlar `data\ayarlar.json`'dadır ve `data\` ile gelir), varsa `.env`, ve henüz git'e gitmemiş liste kayıtları.

**Yap** (aynı pencerede; `market.db` büyük olduğu için birkaç dakika sürebilir):

```powershell
robocopy "$eski\data" C:\Pusula\data /E /XF *.kilit pusula.pid /R:1 /W:1 /NFL /NDL /NP
if (Test-Path "$eski\config.json") { Copy-Item "$eski\config.json" C:\Pusula\config.json -Force }
if (Test-Path "$eski\.env") { Copy-Item "$eski\.env" C:\Pusula\.env }
robocopy "$eski\kayitlar" C:\Pusula\kayitlar /E /XC /XN /XO /R:1 /W:1 /NFL /NDL /NP
```

Son satır yalnız `C:\Pusula`da **olmayan** kayıt dosyalarını ekler; var olanlara dokunmaz.

**Kontrol:**

```powershell
Test-Path C:\Pusula\data\secrets.json
Test-Path C:\Pusula\data\live
Test-Path C:\Pusula\data\makine.json
git -C C:\Pusula status --short
```

İlk ikisi `True`, üçüncüsü **`False`** olmalı (`makine.json` yalnız geliştirme bilgisayarında bulunur ve sunucuyu araştırma modunda açar — sunucuda olmamalı). `git status --short` boş olmalı (77.x öncesi bir sürümdeyseniz ` M config.json` satırı da normaldir).

**Sorun olursa:** robocopy çıkış kodu 8 ve üstüyse (`$LASTEXITCODE`) disk dolu ya da dosya açık olabilir: Adım 2'deki `netstat` boş mu bakın, komutu tekrarlayın. `makine.json` `True` çıkarsa silin: `Remove-Item C:\Pusula\data\makine.json`.

## 6. Paketleri kur (`npm install`) {#adim-6}

**Yap:**

```powershell
cd C:\Pusula
npm install
```

**Kontrol:**

```powershell
npm ls qrcode-terminal
```

`qrcode-terminal@0.12.0` yazmalı.

**Sorun olursa:** `npm` tanınmıyorsa Node.js kurulu değildir (https://nodejs.org, LTS), kurup PowerShell'i kapatıp açın. İnternet hatası verirse bir dakika sonra tekrar deneyin.

İsteğe bağlı hızlı denetim (her biri birkaç saniye; sonunda `0 kaldı` görmelisiniz):

```powershell
npm run test:baslat
npm run test:kilavuz
npm run test:telefon
npm run test:tarama
npm run test:felaket
```

## 7. Eski otomatik başlatma görevini kaldır {#adim-7}

Eski görev (`PusulaBot` ya da `AntigravityTradeBot`) **eski klasörü** gösteriyor; açılışta eski kodu başlatmasın diye kaldırılır.

**Yap (YÖNETİCİ olarak):** Başlat → "PowerShell" → sağ tık → **Yönetici olarak çalıştır**:

```powershell
cd C:\Pusula
powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Remove
```

Betik her eski görevin gösterdiği yeri yazar, durdurur ve kaldırır ("Eski adlı görev kaldırıldı" / "Otomatik başlatma kaldırıldı").

**Kontrol:**

```powershell
Get-ScheduledTask -TaskName PusulaBot, AntigravityTradeBot -ErrorAction SilentlyContinue
netstat -ano | findstr :3000
```

İkisi de **boş** çıkmalı. Bu yönetici penceresini Adım 11 için açık bırakabilirsiniz.

**Sorun olursa:** Görev hâlâ listeleniyorsa: `Unregister-ScheduledTask -TaskName PusulaBot -Confirm:$false` (ve aynısı `AntigravityTradeBot` için). `netstat` `LISTENING` gösteriyorsa Adım 2'deki "Sorun olursa".

## 8. Acil PIN {#adim-8}

Telefondan **acil durdurma** için 6–12 haneli PIN (panel jetonundan ayrı, kimseyle paylaşmayın). Eski klasörde daha önce belirlediyseniz Adım 5 onu taşıdı; yine de bu komutla yenisini belirleyebilirsiniz.

**Yap** (normal PowerShell, `C:\Pusula`da):

```powershell
npm run acil-pin
```

**Kontrol:** "✓ Acil PIN kaydedildi" benzeri bir satır. Sunucu açılınca Adım 10'da `acilPin` alanında `tanimli = True` görünür.

**Sorun olursa:** "Tahmin edilebilir PIN" → tekrar ya da ardışık rakam kullanmayın. "İki PIN aynı değil" → yeniden çalıştırın.

## 9. Masaüstü kısayolları {#adim-9}

**Yap:**

```powershell
cd C:\Pusula
powershell -ExecutionPolicy Bypass -File scripts\kisayol-kur.ps1
```

**Kontrol:** Masaüstünde rüzgâr gülü simgeli iki kısayol: **Pusula** (başlatır ve paneli açar) ve **Pusula'yı durdur**. Eski klasörü gösteren eski kısayollarınız varsa onları silebilirsiniz.

**Sorun olursa:** Simge görünmüyorsa masaüstünde boş bir yere sağ tık → **Yenile**. Kısayolları kaldırmak için aynı komutun sonuna ` -Kaldir` ekleyin.

## 10. Başlat, sürümü doğrula, durdurmayı dene {#adim-10}

**Yap:** Masaüstünde **Pusula**ya çift tıklayın. Siyah bir pencere "Sunucu baslatiliyor..." yazar, noktalar ilerler; sunucu açılınca pencere kapanır ve panel **kendi penceresinde** (uygulama gibi, Edge ile) açılır.

**Kontrol** (PowerShell'de):

```powershell
Invoke-RestMethod http://localhost:3000/api/health | Select-Object status, appVersion, arastirmaModu, acilPin
Get-Content C:\Pusula\data\pusula.pid
```

`appVersion` **60.7 ya da daha yeni**, `arastirmaModu` **False** olmalı (sunucuda araştırma modu KAPALI; bot burada çalışır). `pusula.pid` iki numara gösterir (denetleyici ve sunucu) — Durdur yalnız bu numaraları kapatır.

Panelde:
- Başlıkta **Pusula** ve rüzgâr gülü; sol menüde **Bilgi › Kılavuz** (altında **Pusula Kursu**).
- Ana sayfada **"bu sürümde yeni"** kartı (bir kez görünür; "Tamam, gördüm" kapatır).
- Başlıkta "Araştırma modu" rozeti **olmamalı**.

**Durdurmayı deneyin:** **Pusula'yı durdur**a çift tıklayın. Bot çalışıyorsa ya da açık pozisyon varsa pencere "DİKKAT" yazıp sorar; deneme olduğu için **E** yazıp Enter'a basın (açık pozisyonlar borsada kalır, kapanmaz). "Pusula durduruldu (kayitlar diske yazildi)" görünmeli. Sonra `netstat -ano | findstr :3000` boş çıkmalı. Pusula'yı **kapalı** bırakın; Adım 11 görevle başlatacak.

**Sorun olursa:**
- Siyah pencere "Pusula baslatilamadi" derse altındaki açıklamayı okuyun (Node.js / `npm install` eksikliği orada yazar); pencerenin ekran görüntüsünü gönderin. Sunucunun kendi mesajları: `Get-Content C:\Pusula\data\sunucu-konsol.log -Tail 30`.
- Turuncu "eski sürüm" bandı: **Ctrl+F5**.
- `status` "degraded" (HTTP 503) yazıyorsa panel yine açılır; Ana sayfadaki **Sistem** kartına ve **Yapman gerekenler**e bakın.
- `arastirmaModu` **True** ise `C:\Pusula\data\makine.json` vardır: Pusula'yı durdurun, dosyayı silin (`Remove-Item C:\Pusula\data\makine.json`), yeniden başlatın.

## 11. Otomatik başlatma: oturum açılmadan (PusulaBot) {#adim-11}

Görev, kısayolla **aynı** başlatmayı kullanır ve bilgisayar açılınca (1 dk sonra) **kimse oturum açmasa da** Pusula'yı başlatır. Bunun için Windows parolanızı **bir kez** ister; parola Windows Görev Zamanlayıcı'da saklanır, hiçbir dosyaya yazılmaz.

**Yap (YÖNETİCİ olarak):** Adım 7'deki yönetici penceresinde (kapattıysanız yeniden açın):

```powershell
cd C:\Pusula
powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
```

Betik ne yapacağını Türkçe anlatır, sonra bir parola penceresi açar: kullanıcı adı hazır yazılıdır; **Windows parolanızı** girin. Bilgisayara **PIN** ile giriyorsanız PIN'i DEĞİL, Microsoft hesabınızın parolasını (e-posta ile girdiğiniz hesap) yazın. "Otomatik baslatma kuruldu" görünmeli. Sonra hemen başlatın:

```powershell
Start-ScheduledTask -TaskName PusulaBot
```

**Kontrol** (20–30 saniye bekleyin):

```powershell
Get-ScheduledTask -TaskName PusulaBot | Select-Object TaskName, State
(Get-ScheduledTask -TaskName PusulaBot).Triggers | Select-Object CimClass
Invoke-RestMethod http://localhost:3000/api/health | Select-Object status, appVersion, arastirmaModu
```

`State` **Running**; tetikleyici `MSFT_TaskBootTrigger` (açılışta); `appVersion` yine 60.7 ya da yenisi. Masaüstündeki **Pusula**ya tıklayınca artık "Pusula zaten calisiyor" der ve yalnız paneli açar.

> **Not:** Görev, oturumunuzdan ayrı (görünmez) çalışır. Bu yüzden görevle başlamış Pusula'yı **Pusula'yı durdur** ile kapatınca pencere "zorla kapatildi" diyebilir — normaldir; bot durumu her işlemde zaten diske yazılır. Bilgisayar yeniden açılınca görev yine başlatır.

**Sorun olursa:**
- "Görev kurulamadı … parola yanlış": büyük olasılıkla PIN yazıldı; komutu tekrar çalıştırıp Microsoft hesabı parolasını yazın.
- Parolayla olmuyorsa eski davranışla kurun (yalnız oturum açınca başlar; [bilinen risk](#/kilavuz/kurulum/bilinen-risk) geçerli olur): `powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Tetik Oturum`
- `State` Running ama health cevap vermiyorsa: `Get-Content C:\Pusula\data\sunucu-konsol.log -Tail 30` ve `Get-Content C:\Pusula\data\supervisor.log -Tail 10` çıktılarının ekran görüntüsünü gönderin.
- Windows parolanızı ileride değiştirirseniz bu adımı tekrarlayın (eski parolayla görev başlamaz).

> **Not:** Ad değişikliği (AntigravityTradeBot → PusulaBot) yalnız görevin adını ve mesaj imzasını ("🧭 Pusula") değiştirdi. Emir kimliği öneki (`ag-`), `data/` altındaki bot durumu, `config.json`, Telegram jetonu ve sohbet kimliği aynı kaldı; botun kâğıt/demo durumu korunur.

## 12. Dikkat listesi günlük kayıt görevi {#adim-12}

Dikkat listesinin günlük kaydı **bu bilgisayarda, bu gece resmî olarak başlar** (resmî arşiv yalnız sunucuda birikir; geliştirme bilgisayarına kurulmaz). Görev her gece Türkiye saatiyle **03:30**'da (00:30 UTC) çalışır, bilgisayar uykudaysa uyandırır.

**Yap** (normal PowerShell yeterli):

```powershell
cd C:\Pusula
powershell -ExecutionPolicy Bypass -File scripts\install-dikkat-gorev.ps1
```

Adım 11'deki gibi bir parola penceresi açılır: yine **Windows parolanız** (PIN değil). Parolasız seçenek (yalnız oturum açıkken çalışır): komutun sonuna ` -Oturum` ekleyin.

**Kontrol:** "Kuruldu (oturum acilmasa da, uyandir): PusulaDikkatArsiv" yazar; durumu görmek için:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-dikkat-gorev.ps1 -Durum
```

Yarın sabah `data\tarama\gunluk-gorev.log` dosyasında bu gecenin satırı olmalı.

**Önemli:** bu bilgisayarda **elle deneme ya da `--resmi` koşusu yapmayın** (`npm run tarama:gunluk …` komutunu elle çalıştırmayın). İlk resmî kaydı görev gece atar; manifestte o gün "başlangıç" olarak işaretlenir. Elle bir koşu ilk günü ve kota hakkını (ör. BGeometrics günde 1 istek) tüketir.

Kurulum betiği ayrıca üç uyarı yazar: parola **Windows hesap parolası** olmalı (PIN / Windows Hello değil); hesabın "toplu iş olarak oturum aç" hakkı yoksa kayıt reddedilir (o zaman ` -Oturum` ile kurun); Güç Seçenekleri'nde **"Uyandırma zamanlayıcılarına izin ver"** etkin olmalı. Kayıt başarısız olursa var olan görev değişmez.

**Sorun olursa:** "dosya bulunamadı" derse betik depoya sonradan eklenmiştir: `git pull` yapıp tekrar deneyin. Yine yoksa bu adımı atlayın ve geliştirme sohbetine "install-dikkat-gorev.ps1 yok" yazın — diğer adımlara devam edebilirsiniz.

## 13. Botların sağlığı {#adim-13}

**Yap:** Panelde **Botlar** ekranını açın ([Botlar bölümü](#/kilavuz/botlar)).

**Kontrol:**
- Kairos ve Tao kartlarında mod (**kâğıt** ya da **demo**) beklediğiniz gibi (eski klasördeki gibi; ayarlar `data\ayarlar.json` ya da eski kurulumda `config.json` ile taşındı).
- **Son çalışma** 26 saatten yeni (bot kapalı kaldıysa bir sonraki günlük çalışmadan sonra düzelir; kaçırılan günler sayılır ama geçmiş günlerin emirleri verilmez).
- Kırmızı **"Durduruldu — onay bekliyor"** bandı yok.

**Sorun olursa:** Kırmızı bant varsa nedenini okuyun; borsayla uyuşmazlıkta banttaki **Borsayla karşılaştır**, nedeni anladıysanız **Engeli kaldır**. Ayrıntı: [Botlar › Durduruldu bandı](#/kilavuz/botlar/durduruldu). Mod beklediğinizden farklıysa ayar dosyası (`data\ayarlar.json`, eski kurulumda kökteki `config.json`) taşınmamış olabilir: Adım 5.

## 14. Gölge izleyiciler ve coin tarama ilk çalışma {#adim-14}

Bunlar kendiliğinden çalışır; burada yalnız ilk çalışmayı doğrularsınız.

- **Gölge izleyiciler** (Bollinger, Kairos/Tao gölge, 3 günlük aday): sunucu açıldıktan ~1 dakika sonra ve her gün 00:15 UTC sonrası çalışır. **Kontrol:** **İleri test** ekranında kartlarda "son çalışma" bugünün tarihi ([İleri test](#/kilavuz/ileri-test)). Komut satırından: `npm run ileri:rapor` ve `npm run golge3d:rapor`.
- **Coin tarama:** **Araştırma › Coin tarama** ekranını açın; son tarama 20 saatten eskiyse arka planda başlar (~1 dk, ilerleme çubuğu görünür). **Kontrol:** "Son başarılı tarama" birkaç dakika önce; komut satırından `npm run tarama -- --durum`.
- **Listeler:** **Araştırma › Coin tarama › Listeler**: zincir göstergesi **"zincir sağlam"** ve en az 1 kayıt (Temmuz listesi `kayitlar/listeler/`den kendiliğinden içe alınır).
- **Portföy tasarımcısı (model portföy; resmî kayıt yalnız bu bilgisayarda):** bir kez veri hazırlığı gerekir. **Yap:** Pusula'yı durdurun, sonra `cd C:\Pusula`, `git pull`, `npm run tasarimci:hazirla` (Nasdaq + BIST verisi ve Nasdaq-100 üyeliği; ilk sefer ~10 dk) ve Pusula'yı yeniden başlatın. Sunucu model portföyü her 30 dakikada kendisi ilerletir (ilk uygulama günü 2026-10-12). **Kontrol:** `npm run tasarimci:tik` çıktısında "makine sunucu" yazmalı ("DENEME" yazmamalı) ve 2026-09-30 kararları için uyarı olmamalı; tarayıcıda `http://localhost:3000/api/tasarimci/durum` açılıyor. **Sorun olursa:** "veri yok" diyorsa `npm run tasarimci:hazirla` çıktısındaki HATA satırını geliştirme sohbetine iletin. Model portföyün gerçek tutarı (isteğe bağlı) yalnız bu bilgisayarda `data\tasarimci\sermaye.json` dosyasında durur; git'e ve Telegram'a gitmez.

**Sorun olursa:** İleri test kartında "izleyici hata verdi" → internet bağlantısı; 15 dk sonra kendisi yeniden dener. Coin taramada "kısmi" normaldir (bir kaynak cevap vermemiş olabilir). Asıl kayıt **sunucuda** birikmelidir. Eski kayıtlar görünmüyorsa `data\` taşınmamış olabilir: Adım 5.

## 15. Telegram ve healthchecks {#adim-15}

Telegram bildirimleri ve komutları YALNIZ sunucuda açık olmalı (geliştirme bilgisayarı araştırma modunda Telegram'ı kapatır; aynı jetonu iki bilgisayar dinlerse komutlar çakışır).

**Yap:** **Ayarlar › Bildirimler › Telegram** → **Test mesajı gönder** ([Ayarlar › Bildirimler › Telegram](#/kilavuz/ayarlar/telegram)).

**Kontrol:** Telefona "Pusula Test Bildirimi" gelir. Telegram'da bota `/durum` yazın → bot durumunu cevaplar.

**Sorun olursa:** Token/chat id yoksa `data\secrets.json` taşınmamıştır (Adım 5); ya da kurulum: [Ayarlar › Bildirimler › Telegram](#/kilavuz/ayarlar/telegram). Komutlara cevap gelmiyorsa geliştirme bilgisayarında araştırma modu DIŞINDA bir sunucu açık kalmış olabilir (409 çakışması) — onu kapatın.

**Healthchecks (isteğe bağlı ama önerilir):** **Ayarlar › Bildirimler › Sağlık sinyali**: healthchecks.io'daki adresleri girin — Kairos, Tao (68.8: her bot kendi check'i; Tao'nunki boşsa Tao sinyal göndermez) ve sunucu kalp atışı — **Test**. **Kontrol:** healthchecks.io panelinde kontrollerin hepsi yeşil "up". Bilgisayar kapanır ya da bot durursa size e-posta/Telegram gelir. **61.8:** sunucu sinyali artık saatte bir gider — healthchecks.io'da sunucu kontrolünün **Period**unu 1 saat, **Grace**ini 1 saat yapın (bot kontrolü günlük kalır). Telegram'a gidemeyen uyarılar (internet yokken) artık kaybolmaz: internet gelince "[gecikmeli, saat]" önekiyle gönderilir. Sunucunun internetinin dış IP adresi değişirse Telegram haber verir (canlı hesapta Binance API IP kısıtını güncellemek için).

## 16. Demo modunu ve felaket stopunu doğrula {#adim-16}

Koruma stopu (eski adı felaket stopu — borsada bekleyen koruma emri) yalnız **demo** modunda borsaya konur ve **henüz gerçek demo hesapta doğrulanmadı**. Kairos demo moddaysa bu kontrolü bir kez yapın.

**Ön koşul:** Ayarlar › Borsa'da demo API anahtarı kayıtlı ve Ayarlar › Botlar'da Kairos'un hesap türü **demo**. Değilse: [Sık görevler › Botu demo modunda başlatmak](#/kilavuz/gorevler/demo-baslat).

**Kontrol:**
1. **Botlar** → Kairos sekmesi → katlı **Botun künyesi** → **Koruma stopu** satırı: açık pozisyon varsa **"N pozisyon korunuyor"** (satırın üstüne gelince sembol ve stop fiyatı görünür). Pozisyon yoksa "açık pozisyon yok".
2. **Borsa hesapları** → Binance demo sekmesi → **Her pozisyonun koruma stopu var** kutusu yeşil, pozisyon tablosunda **Koruma stopu** her satırda "yerinde" olmalı.
3. Binance web → Futures → **Demo Trading** → **Open Orders** → koşullu emirler: her pozisyon için bir **Stop Market** (Close Position) görünmeli, fiyatı paneldekiyle aynı.
4. Telegram'da "felaket stopu konamadı" alarmı gelmemiş olmalı.

**Sorun olursa:** "konamadı" ya da Binance'te emir yoksa panel ekranını ve Telegram mesajını geliştirme sohbetine iletin (algoOrder yolu, −4120/−4130 kodları). Bot bu durumda durmaz; yalnız korumasızdır.

> **Uyarı:** Ayarlar › Botlar › Kontroller'deki **"Acil freni dene"** demo hesaptaki TÜM pozisyonları kapatır. Acil durdurma yolunu sınamak için kullanışlıdır ama yalnız buna razıysanız basın.

## 17. Telefondan erişim: Tailscale + jeton + acil denemesi {#adim-17}

Telefondan panel **yalnız izler ve acil durdurur** (60.5): bot başlatma/durdurma, ayar, emir telefondan yapılamaz. Hepsi ücretsiz. Acil PIN'i Adım 8'de belirlediniz.

**Yap — dışarıdan da erişim (Tailscale):**

1. tailscale.com/download → Windows → kurun, bir hesapla (ör. Google) giriş yapın (ücretsiz Personal plan).
2. Telefona Tailscale uygulamasını kurun, **aynı hesapla** giriş yapın, bağlantıyı açın.
3. Pusula çalışırken PowerShell'de:

```powershell
tailscale serve --bg 3000
tailscale serve status
```

   İlk seferde HTTPS'i etkinleştirmek için bağlantı verirse açıp onaylayın. `status`taki `https://<makine>.<ağ>.ts.net` adresini not edin. Bu ayar kalıcıdır; bilgisayar yeniden açılınca da geçerli.
4. Giriş karekodu (adresi kendinizinkiyle değiştirin):

```powershell
cd C:\Pusula
npm run telefon-jeton -- --adres https://<makine>.<ağ>.ts.net
```

   Telefonda (Tailscale açıkken) karekodu okutun. Sonra Chrome menüsü → **Ana ekrana ekle / Uygulamayı yükle**.

**Ya da — yalnız aynı Wi-Fi:** `npm run telefon` (köprü; karekod terminalde). İlk seferde güvenlik duvarı sorarsa **"Özel ağlar"** işaretli, **"Ortak ağlar"** işaretsiz → İzin ver. Wi-Fi ağı **Ortak** tanımlıysa yönetici PowerShell'de:

```powershell
Get-NetConnectionProfile
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
```

**Kontrol — demo'da acil denemesi:** Telefonda panel açılır, başlıkta **Telefon: izleme** rozeti; Botlar'da kartlarda yalnız kırmızı **Acil durdur**. Bot **demo** moddayken telefondan **Acil durdur** → PIN + DURDUR → "ACİL DURDURMA yapıldı" ve Telegram'a ALARM gelir; sonra masaüstü panelden **Borsayla karşılaştır** temiz, **Engeli kaldır** + **Başlat** (canlı hesap riski yok — yalnız demo'da deneyin).

**Sorun olursa:** "panel jetonu tanımlı değil" → `npm run telefon-jeton`; "acil PIN tanımlı değil" → `npm run acil-pin` (Adım 8); Tailscale adresi açılmıyor → telefonda Tailscale açık mı, `tailscale serve status` adresi gösteriyor mu. Ayrıntı: [Telefondan açmak](#/kilavuz/telefon).

## 18. BFUSD oran tablosu (bekleyen adım) {#adim-18}

Amaç: Kairos nakitteyken teminatı faiz getiren BFUSD'de tutmanın gerçekte ne kazandıracağını ölçmek. Bu adım **yalnız okur**: emir vermez, botu etkilemez, bir şey satın almaz.

**Yap:**
1. Binance (canlı hesap, demo değil) → API Yönetimi → yeni anahtar. Yetki olarak **yalnız "Okumayı etkinleştir"** (işlem/çekim yetkisi VERMEYİN).
2. `C:\Pusula`da:

```powershell
$env:BFUSD_KEY="<anahtar>"; $env:BFUSD_SECRET="<gizli anahtar>"; node scripts/bfusd-oran.js
```

**Kontrol:** Ekrana ay ay "ortalama yıllık oran" tablosu yazılır ve `data\arastirma\bfusd-oran.json` oluşur. Tabloyu (ya da dosyayı) geliştirme sohbetine yapıştırın.

**Sorun olursa:** "Satır gelmedi" ya da "region" hatası: BFUSD hesabınızda/bölgenizde açık değildir; bunu da iletin. İş bitince anahtarı Binance'ten silin; PowerShell penceresini kapatınca ortam değişkeni de gider (anahtar diske yazılmaz).

## 19. Liste girişleri yalnız sunucudan + git'e işleme {#adim-19}

Arkadaşınızın coin listelerini **yalnız sunucudaki panelden** girin (**Araştırma › Coin tarama › Listeler**, [Listeler bölümü](#/kilavuz/listeler)). İki bilgisayarda ayrı liste girilirse kayıt zincirinde çelişki çıkar.

Panel git komutu ÇALIŞTIRMAZ. Kalıcı tarih damgası için ara ara (ör. her yeni listeden sonra), `C:\Pusula`da:

```powershell
git pull
git add kayitlar/listeler
git commit -m "liste kaydı"
git push
```

**Kontrol:** `git status` temiz (77.x öncesi sürümde ` M config.json` satırı da olabilir); GitHub'da `kayitlar/listeler/` altında yeni `NNNN-<tarih>-<kaynak>.json`.

**Sorun olursa:** `git push` reddedilirse önce `git pull`, sonra yeniden `git push`. Yalnız `kayitlar/listeler` eklenir; başka dosya commit'lemeyin (ayarlarınız veri klasöründe, depoya girmez).

## 20. Otomatik yedek (PusulaYedek, her gün 05:30) {#adim-20}

61.8'den beri yeniden üretilemeyen veri **her gün kendiliğinden** tarihli bir klasöre kopyalanır ve kopya doğrulanır (`lib/yedek.js`). Kapsam:

| Klasör / dosya | İçerik |
|---|---|
| `data\live` | Botların defteri, emir kayıtları, işlem geçmişi (vergi kaydı `hesap-islemleri.jsonl`), durum dosyaları |
| `data\ileri` | İleri test (gölge) kayıtları — hüküm 2027-10-07'de bunlarla verilecek |
| `data\tarama`, `data\dikkat` | Günlük coin taraması ve dikkat listesi arşivi |
| `data\tasarimci`, `data\portfoyum`, `data\portfoy-lab` | Portföy kararları, sermaye, Uyguladım kayıtları, Portföyüm defteri |
| `data\ayarlar.json` (eski kurulumda kökteki `config.json`), `data\secrets.json` ve küçük ayar dosyaları | Ayarlar ve sırlar (bulut klasörüne yedeklenirken sırlar **kopyalanmaz**) |

Piyasa verisi (`market.db` ~1,2 GB, mum önbellekleri, araştırma çıktıları) yedeklenmez — yeniden indirilir. Bir kopya ~10 MB; son **14 gün** ve son **8 pazartesi** tutulur, eskiler silinir.

**Yap — bir kerelik:** önce hedefi seçin (ikinci disk ya da USB disk önerilir; aynı disk yalnız silinmeye karşı korur), sonra görevi kurun:

```powershell
cd C:\Pusula
npm run yedek -- --hedef E:\PusulaYedek
powershell -ExecutionPolicy Bypass -File scripts\install-yedek-gorev.ps1
```

(Görev Adım 11'deki gibi Windows parolanızı bir kez sorar; bilmiyorsanız sonuna ` -Oturum` ekleyin.)

**Kontrol:** ilk komut `yedek tamam: … dosya … → E:\PusulaYedek\AAAA-AA-GG` yazar. `npm run yedek -- --durum` kopyaları ve son yedeği listeler. Görev durumu: `powershell -ExecutionPolicy Bypass -File scripts\install-yedek-gorev.ps1 -Durum`.

**İsteğe bağlı — haftalık USB kopyası:** günlük yedeğin en son kopyası her Pazar 06:00'da USB belleğe (`F:\PusulaYedek\<tarih>`) alınır. API anahtarları, panel/telefon jetonu ve acil PIN özeti USB'ye **kopyalanmaz**. USB takılı değilse o hafta atlanır.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-yedek-usb-gorev.ps1 -Oturum
```

(USB başka bir harfteyse sonuna ` -Surucu G` ekleyin. Elle deneme: `powershell -ExecutionPolicy Bypass -File scripts\yedek-usb.ps1`; günlük `data\yedek-usb.log`.)

**Geri yükleme (tatbikat önerilir):** bir kopyayı önce **ayrı** bir klasöre açın — canlı `data` klasörüne dokunulmaz:

```powershell
npm run yedek -- --geri-yukle 2026-10-13 --dizin C:\Pusula-inceleme
```

Gerçekten geri yüklemek için **Pusula'yı durdur** → `C:\Pusula-inceleme\data` içinden gereken klasörleri `C:\Pusula\data`'ya kopyalayın → **Pusula**. Botlar açılışta borsayla mutabakat yapar; fark varsa ENGEL'de durur ve Telegram'dan söyler.

**İleriye kayıt (73.4):** aynı görev pazartesileri ham ileriye kayıt verisini de `E:PusulaYedekileriye-kayit-artimli` klasörüne **artımlı** ekler (yalnız yeni/değişen günlük dosyalar; hiçbir şey silinmez; ayda ~200 MB). Yeni görev kurmak gerekmez; hemen almak için `npm run yedek -- --ileri`. Ayrıntı: [Yedek ve taşıma › İleriye kayıt yedeği](#/kilavuz/yedek-tasima/ileriye-kayit-yedegi).

**Sorun olursa:** yedek başarısızsa Telegram "Pusula yedeği alınamadı" der (hedef disk takılı değil / dolu). Görevin çıktısı `data\yedek-gorev.log`. Disk 10 GB'ın altına inince sunucu ayrıca günde bir uyarır.

## 21. Yeniden başlatma denemesi ve eski klasör (karar sizin) {#adim-21}

**Yap — yeniden başlatma denemesi** (bu gece ya da ilk uygun anda; günlük çalışma saati 03:02 dışında):
1. Bilgisayarı yeniden başlatın ve **oturum açmayın** (giriş ekranında bırakın).
2. 3 dakika bekleyin; telefondan (Tailscale açık) Pusula'yı açın.

**Kontrol:** Telefonda panel açılır ve Botlar'da kartlar görünür — bot oturum açılmadan başlamış demektir. healthchecks kuruluysa iki kontrol yeşil kalır. Sonra oturum açın; masaüstündeki **Pusula** "zaten calisiyor" der.

**Sorun olursa:** Telefonda açılmıyorsa oturum açıp Adım 11'in Kontrol satırlarını çalıştırın ve çıktının ekran görüntüsünü gönderin.

**Eski klasör:** Eski klasör (Adım 1'deki `$eski`) şu an **yedek** olarak duruyor; artık hiçbir görev ya da kısayol onu kullanmıyor. Ne zaman silineceği **sizin kararınız** — her şeyin birkaç gün sorunsuz çalıştığını görmeden silmeyin; silmeden önce Adım 3'teki yedeğin yerinde olduğuna bakın.

## 22. Otomatik güncelleme (PusulaGuncelle, her gün 12:00) {#adim-22}

Geliştirme bilgisayarında yapılan her yeni sürüm GitHub'a gönderilir; sunucu onu **her gün 12:00'de kendisi** alır (karar 2026-10-13: "panel otomatik, bot onaylı"):

- **Belge ve görsel değişikliği** (kılavuz metinleri, ekran görüntüleri, araştırma kayıtları): kendiliğinden kurulur, Telegram "Pusula 6x.x kuruldu" der. 69.6'dan önce panel ve araştırma kodu da kendiliğinden kuruluyordu; artık **her kod değişikliği onay ister** ve sunucu yalnız imzalı kodu kurar ([Kod imzası](#/kilavuz/ayarlar/kod-imzasi)).
- **Bot kodu değişikliği** (canlı bot, risk, strateji, işlem motoru, borsa bağlantısı, Telegram uyarıları ya da paketler): **kurulmaz**. Telegram "kurulmayı bekliyor (onay)" der; panelde **Ayarlar › Güncelleme › Güncellemeyi kur** düğmesiyle siz kurarsınız (Ana sayfa Yapılacaklar'da da görünür).
- **Kendiliğinden durur, size bırakır:** sunucuda elle değiştirilmiş bir program dosyasına dokunan güncelleme; başlatma dosyaları (`start-bot.cmd`, `pusula-sunucu.ps1`, `Pusula-*.cmd` — çalışırken değiştirilemez); sunucuda GitHub'a gönderilmemiş liste kaydı varsa (önce Adım 19).
- **Güvenlik:** değişen dosyalarda sözdizimi denetimi; yeniden başlatmadan sonra panel yeni sürümle açılmazsa (3 dakika) ya da açıldıktan sonraki **8 dakika** içinde çökerse / önceden bağlı olan bot bağlanamazsa (61.8) **eski sürüme kendiliğinden döner** ve Telegram'dan haber verir. Gece 02:00–05:00 arası (botun günlük kararı, veri indirme) otomatik güncelleme yapılmaz; **onaylı kurulum ve yeniden başlatma da 02:50–04:30 arasında reddedilir** (61.8). Pusula kapanırken süren bot işini (en çok 2 dk) bekler.

**Yap — ilk kez (bir kerelik; bu sürüm kendiliğinden gelmez):** Pusula'yı durdurun, kodu alın, başlatın, görevi kurun:

```powershell
cd C:\Pusula
git pull
```

Sonra masaüstündeki **Pusula'yı durdur** ve **Pusula** (ya da `Stop-ScheduledTask -TaskName PusulaBot; Start-ScheduledTask -TaskName PusulaBot`). Ardından görevi kurun (Adım 11'deki gibi Windows parolanızı bir kez sorar; bilmiyorsanız sonuna ` -Oturum` ekleyin):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-guncelleme-gorev.ps1
node scripts\guncelle.js --kuru
```

**Kontrol:** Betik sonunda `Gorev: PusulaGuncelle  durum: Ready` ve `sonraki:` yarın 12:00. `--kuru` satırı `guncel` yazar (yeni sürüm yoksa). Panelde **Ayarlar › Güncelleme**: "Güncel ✓". İsterseniz oradaki **Şimdi kontrol et** ile hemen denetletebilirsiniz. Sunucunun başında değilken **telefondan** da yapılır (61.4): aynı ekranda düğmeye basın, **acil PIN** (Adım 8) ve **GÜNCELLE** yazın; onay bekleyen bot kodu güncellemesi de böyle kurulur.

**Sorun olursa:**
- `--kuru` "GitHub'a ulaşılamadı" derse: `git fetch` elle çalışıyor mu bakın (`git fetch origin main`); GitHub girişi isterse tarayıcıda açılan pencereden giriş yapın.
- "Elle bakılmalı: sunucuda değiştirilmiş dosyaya dokunuyor (…)": sunucuda elle değiştirilmiş dosya ezilmesin diye kurulmadı — geliştirme sohbetine haber verin.
- Ayarlarınız veri klasöründeki `ayarlar.json`'dadır; kökteki eski `config.json` o dosya varken okunmaz. Sunucuda değiştirilmiş `config.json`'a dokunan güncelleme bu yüzden durmaz: kurulurken (gerekirse önce ayarlarınız `ayarlar.json`'a alınır) eski dosyanın içeriği veri klasörüne `config.json.yedek-<zaman>` adıyla yedeklenir, dosya depodaki hâline döndürülür, sonra güncelleme kurulur (`guncelleme.log`'da üç satır). Ayarlar güvenceye alınamazsa "Elle bakılmalı: Ayarlar güvenceye alınamadı" der ve hiçbir şeyi değiştirmez — geliştirme sohbetine haber verin.
- Geçmiş: `Get-Content C:\Pusula\data\guncelleme.log -Tail 20`; görevin çıktısı `data\guncelleme-gorev.log`; görev durumu `powershell -ExecutionPolicy Bypass -File scripts\install-guncelleme-gorev.ps1 -Durum`.
- Kaldırmak için: aynı komutun sonuna ` -Kaldir`. Bu görev **geliştirme bilgisayarına kurulmaz** (betik reddeder).

### Güncelleme başarısız olursa — "Eski sürüm de açılmadı — elle bakın" {#guncelleme-kurtarma}

Telegram ya da **Ayarlar › Güncelleme** "kurulamadı — geri alındı" ve **"Eski sürüm de açılmadı — elle bakın"** derse Pusula kapalıdır; çoğunlukla paket klasörü (`node_modules`) yarım kalmıştır. 72.3'ten beri güncelleyici paketleri yalnız gerektiğinde ve **Pusula durmuşken** kurar, başarısızlıkta eski paket klasörünü geri koyar; yine de olursa sırayla, her satırda tek komut:

1. Masaüstündeki **Pusula'yı durdur** kısayoluna çift tıklayın (zaten kapalı diyebilir).
2. **Görev Yöneticisi** (Ctrl+Shift+Esc) › **Ayrıntılar**: listede `node.exe` kalmadığını görün. Kaldıysa 1. adımı bir kez daha yapın; yine kalırsa bilgisayarı yeniden başlatın (tek tek süreç kapatmayın).
3. Başlat menüsüne `cmd` yazıp **Komut İstemi**'ni açın.
4. `cd /d C:\Pusula`
5. `git log -1 --oneline` — hangi sürümün diskte olduğunu gösterir (ekran görüntüsünü geliştirme sohbetine gönderebilirsiniz).
6. `npm ci --no-audit --no-fund --ignore-scripts` — paketleri kilit dosyasından baştan kurar (1–3 dakika; sonunda `added … packages` yazar).
7. Masaüstündeki **Pusula** kısayoluna çift tıklayın.

**Kontrol:** panel açılır, **Ayarlar › Güncelleme** çalışan sürümü gösterir. 6. adım `EPERM` / "operation not permitted" derse Pusula ya da bir Node süreci hâlâ açıktır: 2. adıma dönün. Kesilen güncelleme silinmez; ertesi kontrolde (ya da **Şimdi kontrol et**) yeniden denenir.

## 23. Geliştirme bilgisayarı sunucudaki botu canlı görsün (sunucu bağlantısı) {#adim-23}

Bot sunucuda çalışır; geliştirme bilgisayarındaki panel kendi eski kopyasını gösteriyordu (61.7'den önce). **Sunucu bağlantısı** kurulunca geliştirme bilgisayarındaki panelin **bot, işlem, hesap işlemleri, ileri test** ekranları sunucudaki panelden **canlı ve yalnız okuma** ile gelir: veri kopyalanmaz, tutarlar Tailscale ağınızın dışına çıkmaz, sunucudaki panel bu bağlantıdan gelen hiçbir yazma isteğini kabul etmez (telefon kademesi; 64.8: ayrı yazma jetonuyla yalnız Portföyüm ve İşlem defterim kayıtları — [Adım 25](#/kilavuz/kurulum/adim-25)). Portföy tasarımcısı, backtest ve güncelleme ekranları yerel kalır.

**Ön koşul:** Adım 17 (sunucuda Tailscale + `tailscale serve --bg 3000` + `npm run telefon-jeton`) yapılmış olmalı.

**Yap — geliştirme bilgisayarında (sunucuda değil):**
1. Geliştirme bilgisayarına Tailscale kurun (ücretsiz, aynı hesapla giriş) — https://tailscale.com/download
2. Sunucuda jetonu görün: `cd C:Pusula` → `npm run telefon-jeton` (ekrandaki uzun "Panel jetonu"). Adres: sunucuda `tailscale serve status` çıktısındaki `https://….ts.net`.
3. Geliştirme bilgisayarında, proje klasöründe:

```powershell
npm run sunucu-baglanti -- --adres https://<sunucu>.<ag>.ts.net --jeton <jeton>
```

**Kontrol:** komut `✓ Sunucudaki panele ulaşıldı: sürüm 61.x · kademe telefon` yazar. Geliştirme bilgisayarındaki panelde üstteki sarı araştırma bandı "Bot ve işlem ekranları sunucudaki panelden canlı okunuyor" der; Botlar › İşlemler'de sunucudaki son işlemler (ör. bugünkü coin) görünür. Panelin yeniden başlatılması gerekmez.

**Sorun olursa:**
- "Sunucudaki panele ulaşılamadı … 10 sn": geliştirme bilgisayarında Tailscale açık mı; sunucu bilgisayar açık mı; sunucuda `tailscale serve status` adresi gösteriyor mu.
- "sunucudaki panel reddetti (403) — jeton": jeton yanlış ya da sunucuda yenilenmiş (`--yeni`) — 2. adımdaki jetonla komutu yeniden çalıştırın.
- Bant "bağlantı dosyası eski sürümün şifreli biçiminde" ya da "eksik ya da bozuk" diyorsa (71.1) dosya okunamıyor: 3. adımdaki komutu yeniden çalıştırın.
- Sunucu kapalıyken panel son okunan kopyayı gösterir; bant bunu söyler. Kapatmak için: `npm run sunucu-baglanti -- --sil`.
- Bu ayar **yalnız geliştirme bilgisayarında** çalışır (araştırma modu); sunucuda kurulsa da etkisizdir.

## 24. Canlı hesaptan önce: bilgisayar ayarları (uyku, güncelleme, izinler) {#adim-24}

Bot sunucu açık ve uyanıkken çalışır. Canlı hesaptan (en erken 5 Ocak 2027) **önce** bir kez yapın; demo döneminde yapmak da ölçümü korur (DENETIM-CANLI-ALTYAPI Y9, O6).

**Yap — yönetici PowerShell** (Başlat → "PowerShell" → sağ tık → Yönetici olarak çalıştır):

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /h off
```

(Uyku ve hazırda bekleme kapanır; `/h off` "Hızlı Başlatma"yı da kapatır — o açıkken "Kapat → Aç" aslında hazırda bekletmedir ve açılış görevi çalışmayabilir.)

**Yap — Ayarlar:**
- **Windows Update › Gelişmiş seçenekler › Etkin saatler:** elle, örneğin **02:00–20:00** (yeniden başlatma bu aralığın dışında olur; botun karar saati 03:02 bu aralığın içinde kalır).
- **Tailscale** (görev çubuğu simgesi) › Preferences › **Run unattended** işaretli (oturum açılmadan da telefondan erişim).
- **BIOS/UEFI:** "Restore on AC Power Loss" → **Power On** (elektrik gelince bilgisayar kendisi açılır; bkz. [Bilinen risk](#/kilavuz/kurulum/bilinen-risk)).

**Yap — bekçi görevi** (62.1): Pusula kendiliğinden kapanırsa 10 dakika içinde yeniden açılsın (Windows'un "yeniden dene" ayarı bu durumda çalışmaz). **Pusula'yı durdur** ile bilerek durdurduğunuzda açmaz; **Pusula** kısayolu bunu sıfırlar.

```powershell
cd C:\Pusula
powershell -ExecutionPolicy Bypass -File scripts\install-bekci-gorev.ps1
```

**Yap — klasör izinleri** (yönetici PowerShell): bilgisayardaki başka hesaplar `C:\Pusula\data\secrets.json`'u (API anahtarları) okuyamasın:

```powershell
icacls C:\Pusula /inheritance:r /grant:r "${env:USERDOMAIN}\${env:USERNAME}:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"
```

**Kontrol:** `powercfg /a` çıktısında "Hazırda Bekletme kullanılamıyor" ve "Hızlı Başlangıç kullanılamıyor"; `icacls C:\Pusula\data\secrets.json` yalnız sizi, SYSTEM ve Administrators'ı listeler. Pusula yine açılır (masaüstü **Pusula**).

**Sorun olursa:** `icacls` sonrası Pusula açılmıyorsa görev başka bir hesapla kuruluysa o hesap da eklenmelidir — geliştirme sohbetine `icacls C:\Pusula` çıktısını gönderin. Geri almak için: `icacls C:\Pusula /reset /T`.

## 25. Geliştirme bilgisayarından Portföyüm ve İşlem defterim'e yazmak (yazma jetonu) {#adim-25}

Portföyüm ve İşlem defterim kayıtlarının **tek yeri sunucudur** (64.8). Bu adımla geliştirme bilgisayarında girilen işlem, hesap, dosya yüklemesi ve OKX eşitlemesi **sunucudaki panele gönderilir**; sunucu kapalıysa geliştirme bilgisayarında **sırayla bekler** ve sunucu açılınca kendiliğinden gider. Yazma jetonu yalnız bu iki bölümün kayıtlarını yazar — bot, ayar, güncelleme, OKX anahtarı ve emir **değil**.

**Ön koşul:** Adım 23 (sunucu bağlantısı) yapılmış ve sunucuda 64.8 ya da yenisi kurulu olmalı (otomatik güncelleme ya da `git pull` + Pusula'yı yeniden başlatma).

**Yap — önce EVDEKİ bilgisayarda:**

```powershell
cd C:\Pusula
npm run gelistirme-jeton
```

Ekranda **bir kez** `npm run sunucu-baglanti -- --yazma-jeton …` satırı çıkar (sunucuda jetonun kendisi saklanmaz, yalnız özeti). O satırı kopyalayın.

**Sonra GELİŞTİRME bilgisayarında** (proje klasöründe), kopyaladığınız satırı çalıştırın:

```powershell
npm run sunucu-baglanti -- --yazma-jeton <jeton>
```

**Kontrol:** komut `✓ Sunucudaki panele ulaşıldı` ve `✓ Yazma jetonu sunucuda kabul edildi` yazar. Geliştirme bilgisayarındaki panelde Portföy › İşlem defterim ve Portföyüm'de "Değişiklikler sunucuya gönderilir" bandı görünür, kayıt düğmeleri açılır. Bu bilgisayarda daha önce girilmiş Portföyüm kayıtları varsa Portföyüm'ün üstünde **"Bu bilgisayardaki Portföyüm kayıtlarını sunucuya taşı"** kartı çıkar: önce **Sunucuyla karşılaştır**, listeye bakın, sonra **Onayla** (bir kez; dosya silinmez).

**Sorun olursa:**
- "Sunucudaki panel yazma kademesini tanımıyor": sunucuda 64.8 kurulu değil — sunucuda güncelleyip Pusula'yı yeniden başlatın.
- "Yazma jetonu reddedildi (403)": sunucuda jeton yenilenmiş (`--yeni`) ya da yanlış kopyalanmış — sunucuda `npm run gelistirme-jeton -- --yeni`, çıkan satırı burada yeniden çalıştırın.
- Bekleyen değişiklikler bandın altındaki **Kuyruk** bölümünde; **Şimdi gönder** hemen dener. Sunucunun kabul etmediği bir değişiklik silinmez, nedeniyle orada kalır (**Kuyruktan çıkar**).
- Kapatmak: geliştirme bilgisayarında `npm run sunucu-baglanti -- --yazma-sil` ya da sunucuda `npm run gelistirme-jeton -- --kapat` (okuma sürer).
- OKX: geliştirme bilgisayarının kendi salt okuma anahtarı olur (İşlem defterim › Hesaplar'da ayrıca kaydedilir); orada yalnız elle **Şimdi eşitle**. Her gün kendiliğinden eşitleme yalnız sunucuda, sunucuda da anahtar kayıtlıysa.

## 26. Veri klasörünü programdan ayırmak (isteğe bağlı — 68.0) {#adim-26}

68.0'dan beri Pusula verisini (portföy, bot kayıtları, anahtarlar, araştırma, fiyat önbelleği) program klasöründen **ayrı** bir yerde tutabilir — varsayılan `C:\Pusula-Veri`. Bu **kendiliğinden olmaz**: var olan kurulum (bu sunucu dahil) siz komutu vermedikçe eskisi gibi `C:\Pusula\data` klasörünü kullanır; 68.0 güncellemesi kurulsa da hiçbir dosya yer değiştirmez.

Ayrılınca veri türlerine göre beş alt klasöre dağılır: `kisisel` (portföy, bot durumları, ileri test, ayarlar), `gizli` (anahtarlar, jetonlar, PIN özeti), `arastirma` (araştırma çalışmaları), `onbellek` (yeniden indirilebilen fiyat verisi), `makine` (bu bilgisayara özel: PID kaydı, günlükler).

Ayarlar da ikiye ayrıldı: program varsayılanı `config.varsayilan.json` (depoda, kişisel değer yok) + sizin ayarınız `ayarlar.json` (veri klasöründe, yalnız varsayılandan farklı olanlar). `ayarlar.json` yoksa eski `config.json` okunur — davranış aynı (77.x'ten sonra `config.json` depoda değil: yeni kurulumda hiç yoktur, eski kurulumda güncelleme onu kaldırmadan önce ayarlarınızı `ayarlar.json`'a alır, değiştirilmişse içeriğini veri klasörüne `config.json.yedek-<zaman>` olarak yedekler); Ayarlar ekranında ilk kayıtta `ayarlar.json` oluşur, o andan sonra `config.json` okunmaz (elle değiştirilecek bir ayar varsa artık `ayarlar.json`'a yazılır).

**Önce deneyin** (hiçbir şey değişmez, yalnız plan yazar):

```powershell
cd C:\Pusula
npm run veri-tasi -- --deneme
```

Çıktıda tür başına parça, dosya ve MB sayısı ile hedef diskteki boş yer görünür. Pusula çalışıyorsa "Şu an gerçek taşıma REDDEDİLİR" der.

**Yap** (Pusula durdurulmuşken — masaüstünde **Pusula'yı durdur**):

```powershell
cd C:\Pusula
npm run veri-tasi
# başka bir yer için: npm run veri-tasi -- --hedef D:\PusulaVeri
```

Komut önce kopyalar, sonra her dosyanın boyutunu ve SHA-256 özetini eski dosyayla karşılaştırır, `config.json`'daki ayarlarınızı `kisisel\ayarlar.json`'a alır, en son program klasörüne `veri-yeri.json` yazar. Eski `data` klasörü **olduğu gibi kalır** (silinmez, adı değişmez).

**Kontrol:** masaüstünde **Pusula**ya tıklayın; portföy, botlar ve raporlar eskisi gibi görünmeli. `Test-Path C:\Pusula-Veri\kisisel\live` → `True`.

**Geri dönüş:** Pusula'yı durdurun, `Remove-Item C:\Pusula\veri-yeri.json` — program yeniden eski `data` klasörünü kullanır. Yeni yer sorunsuz çalıştıktan sonra eski `data` klasörünü silmek size kalmış.

**Sorun olursa:** komut "TAŞINMADI" derse hiçbir şey değişmemiştir; nedeni satırda yazar (Pusula çalışıyor, hedef klasör boş değil, diskte yer yok, doğrulama tutmadı). Zamanlanmış görevler (yedek, güncelleme, dikkat) veri yerini her çalışmada kendisi bulur; yeniden kurmak gerekmez.

## Bilinen risk — oturum açılmazsa bot başlamaz {#bilinen-risk}

Bu risk **Adım 11 varsayılan kurulumla (açılışta) kapandı**: `PusulaBot` görevi bilgisayar açılınca, kimse oturum açmasa da başlar. Risk yalnız şu durumlarda sürer:

- Görev `-Tetik Oturum` ile kurulduysa (parolasız seçenek): görev **kullanıcı oturum açtığında** başlar (`-AtLogOn` tetikleyicisi). Elektrik kesintisi ya da Windows güncellemesiyle bilgisayar yeniden başlarsa ve kimse oturum açmazsa **bot başlamaz**; Telegram da susar (healthchecks kuruluysa e-posta gelir).
- Windows parolası değiştiyse ve Adım 11 tekrarlanmadıysa: açılış görevi eski parolayla başlayamaz.

**Nasıl kontrol edilir:**

```powershell
(Get-ScheduledTask -TaskName PusulaBot).Triggers | Format-List *
```

`MSFT_TaskBootTrigger` → açılışta (risk yok). `MSFT_TaskLogonTrigger` → oturum açılışına bağlı (risk var).

**Oturum seçeneğinde geçici önlemler (birini seçin — kullanıcı kararı):**
- **Windows otomatik oturum açma:** `netplwiz` → "Kullanıcıların bu bilgisayarı kullanmak için bir kullanıcı adı ve parola girmesi gerekir" kutusunu kaldırın (Windows 11'de bu kutu görünmüyorsa Ayarlar → Hesaplar → Oturum açma seçenekleri → "Windows Hello oturum açmasını zorunlu kıl" kapatılır; ya da Microsoft'un Sysinternals **Autologon** aracı). Bedeli: bilgisayara fiziksel erişen herkes oturumu açık bulur.
- **BIOS/UEFI'de elektrik gelince açılma:** "Restore on AC Power Loss" / "AC Back" → **Power On**. Bilgisayar kesintiden sonra kendisi açılır; açılış göreviyle (ya da otomatik oturum açmayla) bot da başlar. Bu ayar açılış göreviyle birlikte de önerilir.

## Sorun giderme {#sorun-giderme}

| Belirti | Ne yapmalı |
|---|---|
| `localhost:3000` açılmıyor | Masaüstünde **Pusula**ya tıklayın, penceredeki açıklamayı okuyun; `Get-ScheduledTask -TaskName PusulaBot` durumu; `C:\Pusula\data\sunucu-konsol.log` ve `data\supervisor.log` son satırları |
| "Pusula baslatilamadi — Node.js bulunamadi" | https://nodejs.org (LTS) kurun, oturumu kapatıp açın |
| "Paketler kurulu degil" | `cd C:\Pusula` ve `npm install` (Adım 6) |
| **Pusula'yı durdur** "PID kaydi yok" diyor | Pusula kısayolla/görevle değil, elle (`node server.js`) açılmış ya da eski görev çalışıyor: elle açılan pencereyi kapatın; Adım 7 |
| Turuncu "eski sürüm" bandı | Ctrl+F5; sürmezse **Pusula'yı durdur** → **Pusula** |
| Panelde "Araştırma modu" rozeti (sunucuda) | Sunucuda olmamalı: `C:\Pusula\data\makine.json` vardır ya da sunucu `ARASTIRMA_MODU=1` ile başlatılmış. Dosyayı silin, **Pusula'yı durdur** → **Pusula** |
| Telegram komutları cevapsız | Başka bilgisayarda aynı jetonu dinleyen sunucu açık olabilir; Ayarlar → Test |
| Bot "Durduruldu — onay bekliyor" | [Botlar › Durduruldu bandı](#/kilavuz/botlar/durduruldu) |
| `git pull` çakışma | `C:\Pusula`da `git stash`, `git pull`, `git stash pop`; "CONFLICT" derse dosyaları silmeden `git status` çıktısını geliştirme sohbetine iletin |
| İki sunucu / iki denetleyici | Eski klasörü gösteren eski görev duruyor: Adım 7 |

Bu belge depoda `EVDE-GECIS-PUSULA.md` ve panelde **Kılavuz › Sunucuya kurulum** olarak aynıdır (`npm run kilavuz:esitle` kopyalar; kılavuz testi farkı yakalar).
