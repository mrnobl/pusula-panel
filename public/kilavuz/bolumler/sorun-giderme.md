# Sorun giderme {#sorun-giderme}

Ekranda ya da Telegram'da bir uyarı gördüğünüzde buradan bakın. Çoğu zaman bu sayfayı açmanız bile gerekmez: **Sistem › Sorunlar** sayfası o an etkin her sorunu aynı kartla gösterir ve kartın **Kılavuz** düğmesi sizi doğrudan buradaki başlığa getirir.

Her durum aynı sırayla anlatılır: **Belirti** (ne görüyorsunuz) → **Anlamı** (zararsız, dikkat ya da tehlike) → **Kendiliğinden geçer mi** → **Adımlar** → **Sohbete yazın** (ne zaman geliştirme sohbetine yazmalı). Sohbete yazarken Sorunlar sayfasındaki **Sohbete gönder** düğmesini kullanın: sürüm, etkin sorunlar, son olay raporunun özeti, son 30 dakikanın uyarı / hata satırları ve botların durumu panoya kopyalanır; anahtar, jeton, chat id, sağlık adresi ve e-posta silinmiştir.

> Kartlarda "müdahale bekliyor" (kırmızı) sizin bir adım atmanız gerektiği; "dikkat" (sarı) bakmanızın iyi olacağı; "kendiliğinden geçecek" (mavi) **dokunmamanız** gerektiği anlamına gelir. Mavi kartlarda çoğu zaman tahmini kalkış saati de yazar.

## Sorunlar sayfası ve /teshis {#sorunlar-sayfasi}

- **Sistem › Sorunlar** (yan menüde, sayı rozetiyle): etkin sorunlar en ciddisi üstte. Sorun yoksa yalnız **Her şey yolunda · son denetim N dk önce** yazar. Ayrıntı: [Sorunlar sayfası](#/kilavuz/sorunlar).
- Her sayfanın üstünde (başlık çubuğunda) küçük rozet: kırmızı / sarı / mavi sayılar. Tıklayınca Sorunlar açılır. Sorun yoksa görünmez.
- Ana sayfada üstte bant: yalnız müdahale bekleyen ya da dikkat isteyen sorun varken.
- Telefonda sayfa salt okunurdur; yalnız telefondan yapılabilen işlemler (acil durdurma, güncellemeyi kurmaya gitmek) görünür.
- Geliştirme bilgisayarında sunucunun sorunları gösterilir; bu bilgisayarın kendi sorunları (sunucu bağlantısı, yazma kuyruğu) **bu bilgisayar** etiketiyle ayrıca çıkar.
- Uzaktayken Telegram'a **/teshis** yazın: etkin sorunlar ve her biri için ilk iki adım gelir (yalnız Ayarlar'daki Chat ID'den gelen mesaja cevap verilir; komut yalnız okur).
- Telegram'daki uyarıların "Ne yapmalı" satırı aynı kartın 2–3 kısa adımını ve **Sorunlar** bağlantısını taşır. Bağlantının tıklanabilir olması için **Ayarlar › Bildirimler › Panel adresi**'ne sunucunun Tailscale adresini girin (boşsa mesajda "Panel › Sorunlar" yazar).

## Botlar durdu (onayınızı bekliyor) {#botlar-durdu}

### Bot durdu — onayınızı bekliyor {#bot-durdu}

**Belirti:** Ana sayfada kırmızı "X durdu — onayınızı bekliyor"; Telegram'da "X TAMAMEN KAPANDI". **Anlamı:** dikkat — devam etmek para kaybettirebilecek bir sebep görüldü; bot siz açana kadar kapalı. Açık pozisyonlar ve borsadaki stoplar yerinde. **Kendiliğinden geçer mi:** hayır.

**Adımlar:** Sorunlar sayfasındaki kart sebebe göre adımları yazar (aşağıdaki başlıklar). Açtıktan sonra sayaçlar sıfırlanır; bot yalnız **yeni** bir olayla yeniden kapanır. Telegram "açtığınız bot yeniden kapandı" derse bu gerçek bir tekrardır — **Sohbete yazın**.

### Emirler borsada reddedildi {#emir-reddi}

**Belirti:** "X durdu: emirler borsada reddedildi". **Anlamı:** dikkat — borsa emirleri gerçek bir sebeple reddetti. Kartın **Neyi saydı?** bölümü kapanmaya yol açan satırları, ret kodlarını ve sade açıklamalarını gösterir. Borsaya hiç gitmeyen küçük emirler (asgari tutar altı -4164 / -4003, fiyat bandı -4131) botu kapatmaz. **Kendiliğinden geçer mi:** hayır.

**Adımlar:**

1. Ret kodlarına bakın.
2. **-2019 / -2010** (teminat / bakiye): Binance'te elle çekim ya da işlem yaptıysanız sebep budur; Botlar › Hesap görünümünde teminatı kontrol edin.
3. **Kod hatası** (-1111, -1100, -4015 …): botu açmayın — **Sohbete gönder**.
4. Sebebi giderdiyseniz **Borsayla karşılaştır** → temizse **Sebebi okudum** → **Botu yeniden aç**.

**Sohbete yazın:** kod hatası sınıfında ret varsa ya da açtıktan sonra yeniden kapanırsa.

### Koruma stopu kurulamıyor {#stop-kurulamadi}

**Belirti:** "koruma stopu kurulamıyor" (kırmızı) ya da "bu denetimde kurulamadı" (sarı). **Anlamı:** tehlike — açık pozisyon korumasız olabilir. Stop her saatlik denetimde yeniden kurulur; art arda 3 denetimde kurulamazsa bot durur. **Kendiliğinden geçer mi:** sarıysa sonraki denetimde olabilir; kırmızıysa hayır.

**Adımlar:** Binance › Açık emirler › Koşullu emirler'de o coinin STOP_MARKET emrine bakın. Hata **-2021** ise fiyat zaten stop seviyesinin ötesinde: pozisyonu kendiniz değerlendirin. **-4130** ise borsada başka bir kapatma stopu var: fazlasını silin. **Sohbete yazın:** her zaman (kırmızıda).

### Bot döngüsü tekrar tekrar hata verdi {#dongu-coktu}

**Belirti:** "bot döngüsü 30 dk'da 3 kez hata verdi". **Anlamı:** dikkat — çoğu zaman kod ya da kalıcı okuma sorunu (ağ hataları sayılmaz). **Adımlar:** kartın son hata satırını okuyun; "fiyat yok / undefined / Cannot read" ise botu açmayın ve **Sohbete yazın**; "veri kapısı" ise 1 saat bekleyip açın.

### Emir freni {#emir-freni}

**Belirti:** "EMİR FRENİ — bot durdu". **Anlamı:** dikkat — kısa sürede beklenmeyen kadar çok emir (kaçak döngü olabilir); azaltan emirler ve stoplar serbest. **Adımlar:** Botlar › İşlemler › Bekleyen emirler'de aynı coinde onlarca emir varsa açmayın, **Acil durdur** ve sohbete yazın; açıklanabilir tek seferlik bir sebepse **Botu yeniden aç**.

### Durum dosyası bozuk açıldı {#durum-dosyasi}

**Belirti:** "durum dosyası bozuk açıldı". **Anlamı:** dikkat (elektrik kesintisi, disk). Son sağlam kopyadan açıldı. **Adımlar:** **Borsayla karşılaştır** → temizse **Botu yeniden aç**; uyuşmazlık çıkarsa [pozisyon uyuşmazlığı](#/kilavuz/sorun-giderme/pozisyon-uyusmazligi).

### Uygulama sapması — ENGEL tekrar geliyor {#uygulama-sapmasi}

**Belirti:** "gerçek sonuç simülasyondan %5'ten fazla ayrıldı" (kırmızı) ya da "%3 bandı" (sarı). **Anlamı:** para kaybı demek değil; 30 günde gerçek ile ideal arasında fark birikti (kaçırılan gün, kayma, funding). **Kendiliğinden geçer mi:** hayır; **Engeli kaldır** tek başına yetmeyebilir — 30 günlük pencere değişmediği için aynı gün yeniden gelebilir. **Adımlar:** İleri test › Kairos / Tao'da farkın tek bir güne mi yoksa her güne mi yayıldığına bakın; tek güne yığılmışsa (kaçırılan gün) bekleyip açabilirsiniz; her gün küçük farksa **Sohbete yazın**. "Farkı kabul et" aracı 73.8'de gelecek.

### Hesap kesicisi {#hesap-kesicisi}

**Belirti:** "hesap kesicisi — her şey kapatıldı". **Anlamı:** tehlike — başlangıçtan kayıp sınırına ulaşıldı, bot pozisyonları kapattı. **Adımlar:** Binance'te pozisyonların kapandığını doğrulayın; yeniden açmak yeni bir para kararıdır — önce sohbette değerlendirin.

### Pozisyon uyuşmazlığı {#pozisyon-uyusmazligi}

**Belirti:** "borsadaki pozisyonlar botun kayıtlarıyla uyuşmuyor". Kartın **Neyi saydı?** tablosu coin başına borsadaki miktarı, trend kolu ve kademeli alım kayıtlarını ve farkı gösterir. **Anlamı:** dikkat — elle işlem, gecikmeli dolum, ADL / likidasyon ya da stop tetiklenmesi. **Kendiliğinden geçer mi:** borsayla karşılaştırma temiz çıkınca kendisi açılır.

**Adımlar:** son 5 dakikada emir verildiyse 2 dakika bekleyip **Borsayla karşılaştır**; Binance'te elle işlem yaptıysanız geri alıp karşılaştırın; hiçbiri değilse **Sohbete gönder**. **Engeli kaldır**'a basmayın — bu engeli yalnız temiz karşılaştırma kaldırır.

### Felaket stopu çalıştı, kayıtlar uyuşmuyor {#felaket-stopu}

**Belirti:** Telegram "felaket stopu tetiklendi", ardından pozisyon uyuşmazlığı. **Anlamı:** koruma çalıştı, zarar sınırlandı; ama botun defteri pozisyonu hâlâ açık sanıyor. **Adımlar:** panik satış yapmayın; Binance'te o coinde pozisyon kaldı mı bakın; sıfırsa "Kaydı borsaya eşitle" aracı 73.8'de gelecek — o zamana kadar **Sohbete yazın**. **Acil fren**'e basmayın: kalan her şeyi kapatır.

### Çoklu varlık (BTC teminat) denetimi {#coklu-varlik}

**Belirti:** "çoklu varlık modu KAPALI", "spot cüzdanda botun olmayan bakiye", "vadeli BTC ≠ beklenen". **Anlamı:** dikkat — elle aktarım, yatırma ya da satış. **Adımlar:** bakiye sizin yatırmanızsa **Engeli kaldır** kabul eder; mod kapalıysa Binance › Vadeli › Ayarlar'da çoklu varlık modunu açın; aktarım farkını bilmiyorsanız sohbete yazın.

### Para yatırma kabulünüzü bekliyor {#yatirma-kabul}

**Belirti:** "spot cüzdana para yatırıldı — kabul bekliyor". **Anlamı:** zararsız. **Adımlar:** yatırma sizinse **Sebebi okudum** → **Yatırmayı kabul et (Engeli kaldır)**; değilse Binance hesabınızı kontrol edin ve sohbete yazın.

### İleri test DUR {#ileri-dur}

**Belirti:** "modelin düşüş sınırı aşıldı". **Anlamı:** dikkat — model beklendiği gibi davranmıyor olabilir. **Adımlar:** İleri test › Kairos / Tao'da en derin düşüş satırına bakın; alarmda botu **Durdur** (acil değil) ve sohbette değerlendirin.

### Canlı hesap kapısı kapandı {#gercek-para-kapisi}

**Belirti:** "canlı hesap kapısı kapandı — günlük çalışma yapılmadı". **Anlamı:** canlı hesap şartlarından biri eksik; risk artıran emir verilmiyor. **Adımlar:** Ayarlar › Botlar › Canlı hesap bölümünde eksik şartı tamamlayın.

### Canlı hesapta emir onayı kapalı {#canli-onay}

**Belirti:** canlı botta "emir onayı kapalı". **Anlamı:** bot çalışıyor görünür ama emir vermez (onay bir elle durdurmadan sonra düşer). **Adımlar:** Ayarlar › Botlar › Canlı hesap emir onayı › CANLI.

## Güvenli kip ve kendiliğinden geçenler {#kendiliginden-gecenler}

### Güvenli kip — günlük çalışma ertelendi {#guvenli-kip}

**Belirti:** Telegram'da tek bilgi iletisi "X güvenli kipte — kendiliğinden geçecek"; Sorunlar'da mavi kart ve tahmini kalkış saati. **Anlamı:** zararsız / koruyucu — bakım, fiyat kaynakları arasında fark ya da 24 saatte 2 stop vuruşu yüzünden yeni işlem açılmıyor. Stoplar yerinde. Bu sırada kırmızı alarm gitmez, healthchecks "çalışmadı" demez. **Kendiliğinden geçer mi:** evet — bakımda bitişten 15 dk sonra; fiyat farkında fark %1'in altına inince; stop vuruşunda son vuruştan 24 saat sonra. Kalkınca "güvenli kip geçti" iletisi gelir, ertelenen çalışma birkaç dakika içinde yapılır.

**Adımlar:** dokunmayın. Tahmini saatten 1 saat sonra hâlâ sürüyorsa Sağlık › **Şimdi yokla**, sonra sohbete yazın.

### Güvenli kip — aynı hata tekrar ediyor {#guvenli-kip-tekrar}

**Belirti:** "aynı hata 30 dk'da 3 kez". **Anlamı:** dikkat. **Kendiliğinden geçer mi:** 60 dakika aynı hata gelmezse kalkar; hata "fiyat yok / undefined / Cannot read" gibi bir kod hatasıysa kalkmaz (kart bunu "büyük olasılıkla HAYIR" diye yazar). **Adımlar:** kartın tekrarlayan satırını okuyun; kod hatasıysa **Sohbete yazın**. Demo kabul süresince Kairos'ta öz denetim yalnız haber verir.

### Borsa verisi şüpheli (veri kapısı) {#veri-kapisi}

**Belirti:** "günlük çalışma ertelendi — borsa verisi şüpheli". **Anlamı:** zararsız. **Adımlar:** dokunmayın; 15 dakikada bir kendisi dener. 2 saatten uzun sürerse sohbete yazın.

### Borsa beklemesi (hız sınırı / geçici IP yasağı) {#borsa-beklemesi}

**Belirti:** "yürütücü durdu [GERI_CEKILME]". **Anlamı:** zararsız — süre bitene kadar bot borsaya istek atmıyor; stoplar borsada. **Kendiliğinden geçer mi:** evet, kartta bitiş saati yazar. **Adımlar:** paneli yenilemeyin, düğmelere tekrar tekrar basmayın — 418 yasağını uzatır.

### Bir emrin sonucu belirsiz {#emir-belirsiz}

**Belirti:** "yürütücü durdu [BELIRSIZ]". **Anlamı:** zararsız — emir gitmiş olabilir, Pusula aynı kimlikle soruyor. **Adımlar:** dokunmayın; 1 saati geçerse **Borsayla karşılaştır**.

### Yürütücü durdu (elle müdahale) {#yurutucu-durdu}

**Belirti:** "borsaya emir göndermeyi durdurdu". **Anlamı:** dikkat — bir emrin sonucu çözülemedi ya da API anahtarı reddedildi. **Adımlar:** sebep "çözülemedi" ise Binance'te o emri (ag- ile başlar) arayın, 5 dk sonra **Borsayla karşılaştır**; "-2015 / -2014 / izin" ise Binance › API Management'ı kontrol edin, Ayarlar › Anahtarlar › **Sına**.

### Borsaya bağlı değil {#baglanti}

**Belirti:** "borsaya bağlı değil — yeniden deneniyor". **Kendiliğinden geçer mi:** bağlantı 1, 2, 5, 10, 30 dk arayla yeniden denenir. **Adımlar:** interneti kontrol edin; 30 dakikayı geçerse Ayarlar › Anahtarlar › **Sına**.

### Bot 26 saattir çalışmadı {#bot-calismadi}

**Belirti:** "X 26 saattir başarılı çalışmadı". Bot durmuşsa ya da güvenli kipteyse bu satır çıkmaz (sebebi o kart). **Adımlar:** Sistem › Günlükler'de son hataya bakın; sunucu açık mı, Pusula çalışıyor mu kontrol edin.

### Bugünkü çalışma yapılmadı {#kacan-calisma}

**Belirti:** "bugünkü çalışma 03:02'de yapılmadı". **Anlamı:** bot kaçırılanı kendisi yapmaz; bir sonraki çalışmada bugünkü hedefe gider. Sunucu kapalı kaldıysa bir şey yapmayın; sık oluyorsa uyku / güç ayarına bakın.

### Botun işi takıldı / Pusula dondu {#donma}

**Belirti:** "botun işi takıldı" ya da "Pusula dondu ve kendini yeniden açtı"; panel açılmıyor, telefonda "Sunucuya ulaşılamıyor". **Anlamı:** donma bekçisi sağlık ucundan 10 dakika yanıt alamazsa **yalnız kendi sürecini** kapatır; denetleyici 10 sn sonra açar. **Adımlar:** 15 dakika bekleyin. Hâlâ açılmıyorsa sunucuda **Pusula'yı durdur** → **Pusula**. Görev Yöneticisi'nden node.exe süreçlerini toplu kapatmayın.

## Risk ve haber kartları {#risk-haber}

### Zarar sınırı (K3) çekildi {#zarar-siniri}

**Belirti:** "zarar sınırı (K3) çekildi — bot nakitte bekliyor"; bot sayfasında son karar satırı "riski düşürüldü". **Anlamı:** dikkat — strateji tepeden düşüş sınırına çarptı; arıza değil, bot nakitte bekliyor. **Adımlar:** yeniden açmak bir strateji kararıdır — sohbette değerlendirin. "Zarar sınırını sıfırla" aracı 73.8'de gelecek.

### Marj uyarısı {#marj}

**Belirti:** "teminat (marj) uyarısı / ALARM". **Anlamı:** tehlike — fiyat ters giderse likidasyon riski artar. Bot kendiliğinden **durmaz**. **Adımlar:** Botlar › Hesap görünümünde teminat oranına bakın; uyarıda çoğu zaman beklemek yeterli; alarmda **Durdur** ya da gerçek tehlikede **Acil durdur** — karar sizin.

### Borsa pozisyonu zorla kapattı (ADL / likidasyon) {#adl-likidasyon}

**Belirti:** "borsa pozisyonu ZORLA KAPATTI". **Anlamı:** tehlike — kalan bacaklar korumasız olabilir. **Adımlar:** Binance'te açık pozisyonları ve stopları kontrol edin; sohbete yazın.

### Funding yüksek {#funding}

Yalnız bilgi: açık pozisyonlu coinde funding yüksek (kalabalık pozisyon işareti). Bot kararı değişmez; dokunmayın.

### Gerçek sonuç gölgeden kalıcı olarak ayrılıyor {#golge-kaymasi}

Yalnız bilgi (CUSUM): küçük ama sürekli fark birikti. "İYİ (lehte)" ise bir şey yapmayın; "KÖTÜ" ise bu hafta İleri test sayfasına bakın.

### İşlem maliyeti {#islem-maliyeti}

Yalnız bilgi: piyasa emri kayması + ücret backtest varsayımının 2 katı. Backtest sonuçları gerçekte bu kadar iyi olmayabilir.

### Delist {#delist}

**Belirti:** "evrendeki bir coin borsadan çıkarılıyor". Evren ayın 1'inde yenilenir. Bu coinde açık pozisyon varsa delist tarihinden önce ne olacağını sohbete sorun.

### Taşımadan sonra mutabakat bekliyor {#tasima-sonrasi}

**Belirti:** "taşımadan sonra botlar borsayla karşılaştırılmayı bekliyor". **Adımlar:** eski bilgisayarda **Pusula'yı durdur**; Botlar › Yönetim › **Borsayla karşılaştır**, temiz çıkınca **Başlat**.

## Güncelleme {#guncelleme-sorunlari}

### Onayınızı bekleyen güncelleme {#guncelleme-onay}

**Belirti:** "Onayınızı bekleyen güncelleme: 73.x". **Anlamı:** zararsız — kurulana kadar eski sürüm çalışır. **Adımlar:** sürüm notunu okuyun; uygun bir saatte (02:50–04:30 dışında) Ayarlar › Güncelleme › **Güncellemeyi kur** — telefondan da (acil PIN + GÜNCELLE). Kuru denemede karar farkı çıktıysa ve sürüm notu bunu söylemiyorsa sohbete sorun.

### Güncelleme yarıda kaldı {#guncelleme-yarida}

**Belirti:** "kurulumu yarıda kaldı". **Anlamı:** dikkat — güncelleyici bitmeden kapandı; paket kurulumu için Pusula'yı durdurmuşsa nöbetçisi yeniden açar. **Adımlar:** panel açılıyorsa **Şimdi kontrol et**; açılmıyorsa sunucuda **Pusula** kısayolu, olmazsa [Sunucuya kurulum › Güncelleme başarısız olursa](#/kilavuz/kurulum). `node_modules.yedek-*` klasörlerini silmeyin.

### Güncelleme: elle bakılmalı {#guncelleme-elle}

**Belirti:** "Güncelleme kendiliğinden kurulamadı — elle bakılmalı". **Anlamı:** çalışan sürüm sağlam. **Adımlar:** Ayarlar › Güncelleme'deki nedeni okuyun. "gönderilmemiş commit": sunucuda `git pull` sonra `git push`. "değişmiş dosya / dal / merge": dokunmayın, `git status` çıktısını sohbete gönderin. "başlatma dosyaları": **Pusula'yı durdur** → `git pull` → **Pusula**. `git reset` / `git checkout` ile kendiniz geri almayın.

### İmzasız kod geldi {#guncelleme-imzasiz}

**Anlamı:** tehlike — gelen kod imza doğrulamasından geçmedi, **kurulmadı**. **Adımlar:** kodu siz göndermediyseniz GitHub parolanızı ve jetonlarınızı değiştirin; hemen sohbete yazın.

### Güncelleme: aynı sürüm geri alındı {#guncelleme-geri-alindi}

**Belirti:** "kurulamadı, eski sürüme dönüldü" ya da "bu sürüm 2 kez kurulup geri alındı". **Anlamı:** zararsız-dikkat; eski sürüm çalışıyor. **Adımlar:** geri alma nedenini sohbete gönderin. Düzeltilmiş sürüm gelince kendiliğinden kurulur.

### "Yeniden başlatma gerekli" {#yeniden-baslatma-gerekli}

**Anlamı:** sarı = eski Pusula çalışıyor, yeni kod diskte (zararsız). Kırmızı "Pusula KAPALI kaldı" = tehlike. **Adımlar:** kırmızıysa sunucuda **Pusula** kısayolu; sarıysa uygun bir saatte **Yeniden başlat** (02:50–04:30 arasında yapmayın).

### GitHub'a ulaşılamadı {#github}

**Belirti:** Telegram'da tek bilgi "Güncellemeler denetlenemiyor"; ulaşılınca "GitHub'a yeniden ulaşıldı (geçti)". **Anlamı:** zararsız; çalışan sürüm etkilenmez. **Kendiliğinden geçer mi:** internet gelince bir sonraki denemede (12:00). **Adımlar:** birkaç gün sürerse sunucuda `cd /d C:\Pusula` → `git fetch origin main`; giriş isterse tarayıcıdan GitHub'a giriş yapın.

### Kod imzası kurulmamış {#imza-kurulmamis}

**Anlamı:** dikkat — güncellemeler imzasız da kurulur. **Adımlar:** sunucuda bir kez `npm run imza-kur`.

## Telegram ve sinyaller {#telegram-sinyal}

### Telegram 409 — iki bilgisayar aynı botu yokluyor {#telegram-409}

**Belirti:** Ayarlar › Bu bilgisayar'da "Telegram komutları: HATA 409"; `/durum` cevapsız ya da iki cevap. **Anlamı:** dikkat — aynı jetonu başka bir bilgisayar (çoğu zaman taşımadan sonra açık kalan eski bilgisayar) kullanıyor; iki bilgisayarda bot da çalışıyorsa çift emir riski. **Adımlar:** eski bilgisayarda **Pusula'yı durdur**; orada Görev Zamanlayıcı'da **PusulaBot** ve **PusulaBekci**'yi devre dışı bırakın; Telegram'a `/durum` yazın — tek cevap gelmeli. **401** görüyorsanız [jeton geçersiz](#/kilavuz/sorun-giderme/telegram-gonderim).

### Telegram'a ileti gönderilemiyor {#telegram-gonderim}

**Anlamı:** tehlike — uyarılar size ulaşmıyor olabilir (jeton 401, Chat ID, bot engellendi). **Adımlar:** Telegram'da bota `/start` yazın, engellediyseniz kaldırın; sunucuda Ayarlar › Bildirimler › **Test mesajı gönder**; jeton değiştiyse yeniden girin. İkinci uyarı kanalı (ntfy) kurulu değilse Sistem › Sağlık'tan kurun.

### İletiler giden kutusunda bekliyor {#telegram-kuyruk}

Zararsız: internet / Telegram geçici olarak ulaşılamadı; iletiler "[gecikmeli]" önekiyle sırayla gidecek. Dokunmayın.

### Sağlık sinyali {#saglik-sinyali}

**Belirti:** "sunucu: adres yok" (sarı) ya da "son ping başarısız". **Anlamı:** adres yoksa sunucu sessizce kapanırsa (elektrik, çökme) sizi dışarıdan uyaracak kimse yok. **Adımlar:** healthchecks.io'da ücretsiz bir check açın, ping adresini Ayarlar › Bildirimler › Sağlık sinyali › Sunucu alanına girin. Ping başarısızsa çoğu zaman internettir.

## Sunucu ve bilgisayar {#sunucu-bilgisayar}

### Sunucu sessiz / ulaşılamıyor {#sunucu-sessiz}

**Belirti:** healthchecks / Better Stack "down" e-postası, telefonda "Sunucuya ulaşılamıyor — son görülen", geliştirme bilgisayarında "Sunucuya ulaşılamıyor — gösterilen, son okunan kopya", Telegram susmuş. **Anlamı:** botlar karar veremiyor olabilir; pozisyonlar ve felaket stopları **borsada** durur — acil bir şey yapmanız gerekmez.

**Karar ağacı:**

1. **Telefonda Tailscale** uygulamasında sunucu "Connected" mı? Değilse sunucu kapalı, uykuda ya da internetsiz → 2. Bağlıysa → 3.
2. **Elektrik / internet:** sunucunun bulunduğu yerde elektrik kesildi mi, modem çalışıyor mu? (orada birinden bakmasını isteyin). Elektrik geldiyse bilgisayar kendiliğinden açılmayabilir: güç düğmesine basılmalı. Pusula oturum açılmasa da PusulaBot göreviyle açılır — açılmıyorsa [parola değişmiş olabilir](#/kilavuz/sorun-giderme/parola).
3. **Panel telefondan açılıyor mu?** Açılıyorsa Sorunlar sayfasına bakın (sorun orada yazar). Açılmıyorsa → 4.
4. **Windows güncellemesi / yeniden başlatma:** bilgisayar gece yeniden başladıysa Pusula birkaç dakika içinde kendiliğinden açılır; 15 dakika bekleyin. Sık oluyorsa [Windows yeniden başlatması](#/kilavuz/sorun-giderme/windows-yeniden-baslatma).
5. **Donma:** sunucu açık ama panel yanıtsızsa donma bekçisi 10–15 dakikada Pusula'yı yeniden açar ([donma](#/kilavuz/sorun-giderme/donma)).
6. **Antivirüs:** Pusula açılıp hemen kapanıyorsa ya da hiç açılmıyorsa [antivirüs karantinası](#/kilavuz/sorun-giderme/antivirus) ya da [çökme döngüsü](#/kilavuz/sorun-giderme/cokme-dongusu).
7. **Sunucu başına geçince:** masaüstündeki **Pusula**'ya tıklayın; açılmazsa `data\sunucu-konsol.log` son satırlarını sohbete gönderin.

Sunucu dönünce bot kaçırılan günleri kendisi sayar; geçmiş günlerin emirlerini vermez, bugünkü hedefe gider.

### Uzaktayken neler yapılabilir / yapılamaz {#uzaktan}

| İş | Telefondan | Geliştirme bilgisayarından | Yalnız sunucu başında |
|---|---|---|---|
| Durumu, Sorunlar'ı, Sağlık'ı, günlükleri okumak | Evet | Evet (sunucudan okunur) | — |
| Telegram **/teshis**, **/durum** | Evet | — | — |
| Botu **acil durdurmak** | Evet (acil PIN + DURDUR) | Hayır | Evet |
| Onaylı **güncellemeyi kurmak** | Evet (acil PIN + GÜNCELLE) | Hayır | Evet |
| İşlem defterim / Portföyüm kaydı, API anahtarı | Hayır | Evet (yazma jetonu, kuyruk) | Evet |
| **Botu yeniden aç**, Engeli kaldır, güvenli kipi kaldır, Borsayla karşılaştır | Hayır | Hayır | Evet |
| Telegram jetonu / Chat ID, sağlık adresleri, acil PIN | Hayır | Hayır | Evet |
| `git pull`, görev kurma, Windows / güç / saat ayarı | Hayır | Hayır | Evet |
| Pusula kapalıyken açmak | Hayır | Hayır | Evet (Pusula kısayolu) |
| Dış IP değişince Binance'e eklemek | Evet (Binance uygulaması) | Evet | — |

### Antivirüs Pusula'yı sildi ya da karantinaya aldı {#antivirus}

**Belirti:** Pusula açılıp hemen kapanıyor ("Cannot find module"), dosyalar eksik, Kaspersky bildirimi. **Anlamı:** tehlike — Pusula kapalı. Pusula arka planda PowerShell açmaz (73.6) — bu tür yanlış alarmları azaltır ama tamamen önlemez. **Adımlar:**

1. Kaspersky › Karantina: `C:\Pusula` altındaki dosyaları **geri yükleyin**.
2. Kaspersky › Ayarlar › Tehditler ve istisnalar: `C:\Pusula` klasörü ve `node.exe` için istisna ekleyin.
3. Komut İstemi'nde `cd /d C:\Pusula` → `git status`: "deleted" satırı kalmamalı.
4. Masaüstündeki **Pusula**'ya tıklayın.

`git checkout` / `git reset` ile kendiniz geri almayın; önce karantinadan geri yükleyin. Kaspersky raporunu sohbete gönderin.

### Windows parolası değişti, görevler çalışmıyor {#parola}

**Belirti:** elektrik kesintisinden sonra Pusula açılmıyor; yedek ve güncelleme durmuş; Kurulum denetiminde görev sonucu `0x8007052E`. **Anlamı:** tehlike — parolayla kaydedilmiş görevler (PusulaBot, Bekçi, Yedek, Güncelle) parola değişince çalışmaz. **Adımlar:** Sistem › Kurulum denetimi › **Onar** ile gösterilen komutları sunucuda çalıştırın (görevleri yeni parolayla yeniden kurar); bilgisayara PIN ile giriyorsanız PIN değil hesap parolası istenir; sonra bilgisayarı bir kez yeniden başlatıp Pusula'nın kendiliğinden açıldığını görün.

### Çökme döngüsü {#cokme-dongusu}

**Belirti:** Telegram "Pusula açılamıyor — çökme döngüsü"; Sağlık "N kez üst üste açılıp hemen kapandı". **Adımlar:** sunucuda `data\sunucu-konsol.log` son satırları: "Port 3000 kullanımda" → **Pusula'yı durdur** → **Pusula**; "Node.js … çok eski" → [Node](#/kilavuz/sorun-giderme/node); "config.json" → [ayar dosyası](#/kilavuz/sorun-giderme/ayar-bozuk); "Cannot find module" → [antivirüs](#/kilavuz/sorun-giderme/antivirus); başka bir şey → son satırları sohbete gönderin.

### "Pusula süreci: bugün N kez açıldı" {#acilis-sayaci}

Yalnız **beklenmedik** açılışlar sayılır (güncelleme ve sizin yeniden başlatmalarınız "(+ N planlı)" yazar). Günde 5'ten çok = Pusula çöküyor: konsol günlüğünün son satırlarını sohbete gönderin. Gece yarısı sıfırlanır.

### Denetleyicisiz başlatıldı {#denetleyicisiz}

Pusula masaüstü kısayolu dışında açılmış; çökerse yalnız bekçi açar, güncelleme yeniden başlatamaz. Uygun bir saatte **Pusula'yı durdur** → **Pusula** kısayolu.

### Disk alanı {#disk}

**Adımlar:** güvenle silinebilir: güncelleme "kuruldu" dedikten sonra `node_modules.yedek-*` klasörleri, Yedek ve taşıma › eski taşıma dosyaları. `data\live`, `ileri`, `ileriye-kayit`, `tarama` klasörlerine dokunmayın. Disk sağlığı kötüyse yedeğin taze olduğundan emin olup diski değiştirmeyi planlayın.

### Bellek {#bellek}

Zararsız: öz denetim sessiz saatte (çalışma sürmüyorken, 02:30–04:30 dışında) Pusula'yı yeniden başlatır. Her gün tekrar ederse sohbete yazın.

### Yedek {#yedek}

**Adımlar:** USB / ikinci disk takılı mı; "ENOSPC" = yedek diski dolu; Ayarlar › Yedek ve taşıma'da son yedeğin durumu. Uzak yedek kurulmamışsa: Kılavuz › Yedek ve taşıma › Şifreli uzak yedek (ücretsiz).

### Windows yeniden başlatması {#windows-yeniden-baslatma}

Windows güncellemesi yeniden başlatma bekliyor; gece yeniden başlatırsa 03:02 çalışması kaçabilir. Uygun bir gündüz saatinde elle yeniden başlatın; kalıcı çözüm sunucuda yönetici olarak `scripts\windows-etkin-saat.ps1`.

### Uyku ve hazırda bekleme {#uyku}

Uyuyan bilgisayarda Pusula çalışmaz: Denetim Masası › Güç Seçenekleri › uyku ve hazırda bekleme → **Asla** (prize takılıyken).

### Bilgisayar saati {#saat-farki}

Borsa saatiyle fark 1 sn'yi geçerse emirler reddedilebilir (-1021): Windows › Saat ve dil › **Saati şimdi eşitle**.

### Saat dilimi {#saat-dilimi}

Sunucunun saat dilimi İstanbul değilse zamanlanmış görevler kayar: Windows › Saat ve dil › Saat dilimi → (UTC+03:00) İstanbul.

### Node.js desteği {#node}

Destek bitince güvenlik düzeltmesi gelmez. Yükseltmeyi kendiniz yapmayın; sohbette planlayın (Pusula'yı durdur → yeni LTS → `npm ci --ignore-scripts` → Pusula).

### Paket güvenliği {#paket-guvenligi}

Yalnız bilgi: düzeltme geliştirme tarafında yapılır, güncellemeyle gelir. `npm install` / `npm audit fix` çalıştırmayın.

### API anahtarları okunamıyor (eski şifreli dosya) {#sir-dosyasi}

Pusula-69.0 paketi duruyorsa onun `scripts\sir-coz.ps1` betiğini Pusula'yı çalıştıran kullanıcıyla bir kez çalıştırın; paket yoksa `secrets.json`'u kenara kopyalayıp silin, anahtarları ve Telegram jetonunu panelden yeniden girin.

### Ayar dosyası bozuk açıldı {#ayar-bozuk}

Son sağlam kopyadan açıldı; son ayar değişikliğiniz kaybolmuş olabilir: yeniden girin. Bozuk dosya `.bozuk-*.bak` olarak saklandı; tekrar ederse (disk sorunu olabilir) sohbete yazın.

### Sahipsiz güncelleme kilidi {#kilit}

Zararsız: öz denetim sahipsiz kilidi sonraki yoklamada siler.

### Kurulum denetimi "kontrol edilemedi" {#kurulum-denetimi}

Pusula arka planda PowerShell açmaz; görevleri yalnız `schtasks` ile okur. Satırdaki komutu bu bilgisayarda **Komut İstemi**'ne (cmd) yapıştırıp çalıştırın, sonra sayfayı yenileyin.

### Acil PIN {#acil-pin}

PIN tanımlı değilse telefondan acil durdurma kapalı: sunucuda bir kez `npm run acil-pin`. Çok sayıda yanlış denemede kısa süre kilitlenir; siz denemediyseniz PIN'i değiştirin.

## Veri ve kayıtçılar {#veri-sorunlari}

### İnternet kesildi {#internet}

Telegram'da tek bilgi "İnternet: kendiliğinden geçecek"; geri gelince "internet geri geldi — kesinti N dk sürdü". Pozisyonlar ve stoplar borsada. Modemi kontrol edin.

### Veri kaynağı / Binance beklemesi {#veri-kaynagi}

Zararsız: kaynak geçici hata verdi ya da Binance "yavaşla" dedi; bekleme bitince ya da sonraki denemede kendiliğinden geçer. Veri güncellemesini elle zorlamayın. 3 gün üst üste sürerse sohbete yazın.

### Veri "güncel" ama coin evreni kısmi {#kismi-evren}

Tasarım gereği: aylık arşiv ay bitince, sonraki ayın 2'sinde gelir; o güne kadar yalnız izlenen semboller günlük güncellenir. Bir şey yapmayın.

### İleriye veri kaydı yazmıyor {#ileriye-kayit}

Yalnız ham araştırma verisi; botları etkilemez. Kayıtçı 20 dk sonra kendisi yeniden dener; hangi kaynağın düştüğü Veri › İleriye kayıt'ta. Kaçan saatler geriye doldurulamaz.

### İleri test izleyicisi çalışmadı {#ileri-izleyici}

Gölge test kayıtları bu denemede yazılmadı (bilgisayar meşgul ya da ağ); 15 dakika sonra yeniden denenir. Gün boyu sürerse sohbete yazın.

### Ana sayfada "Son 24 saatte N hata" {#gunluk-hata}

Öz denetim sorun görmüyorsa yalnız bilgi (tek tük ağ / kaynak hatası). Merak ederseniz Günlükler'de okuyun.

## Geliştirme bilgisayarı (araştırma kopyası) {#arastirma-kopyasi}

### Sunucu bağlantısı {#sunucu-baglantisi}

**Belirti:** "bu bilgisayar" etiketli kartlar: "Sunucu bu bilgisayarın jetonunu reddediyor (401 / 403)", "Sunucu bağlantı ayarı okunamıyor", "yazmalar kuyrukta". **Adımlar:** jeton reddinde sunucuda `npm run telefon-jeton` (okuma) ya da `npm run gelistirme-jeton -- --yeni` (yazma), sonra bu bilgisayarda `npm run sunucu-baglanti -- --adres … --jeton …`. Kuyruktaki yazmalar sunucuya ulaşınca kendiliğinden gönderilir. Sunucuya hiç ulaşılamıyorsa [Sunucu sessiz](#/kilavuz/sorun-giderme/sunucu-sessiz).

## Tanınmayan sorun {#taninmayan}

Pusula bir durumu görüyor ama Sorun merkezi henüz açıklamasını bilmiyor (yeni bir denetim, bilinmeyen bir durdurma metni). Kart ham metni gösterir. Ne olduğunu bilmeden botu açmayın / kapatmayın; **Sohbete gönder** ile geliştirme sohbetine iletin — bu durum için açıklama eklenecek.
