# Sorun giderme {#sorun-giderme}

Ekranda ya da Telegram'da bir uyarı gördüğünüzde buradan bakın. Her durum aynı sırayla anlatılır: **Belirti** (ne görüyorsunuz) → **Anlamı** (zararsız mı, dikkat mi, tehlike mi) → **Adımlar** (ne yapacaksınız; çoğu zaman "dokunmayın, kendiliğinden geçer"). Geliştirme sohbetine yazmanız gerekiyorsa adımlarda söylenir; yazarken **Sağlık › Olay raporları** sayfasındaki son dosyayı ekleyin (içinde anahtar ya da jeton yoktur).

> Bu bölüm 73.6'da başladı. 73.6'da düzeltilen durumlar aşağıda dolu; diğer başlıklar 73.7–73.8'de dolacak.

## Bot durdu — onayınızı bekliyor {#bot-durdu}

**Belirti:** Ana sayfada kırmızı "X durdu — onayınızı bekliyor"; Telegram'da "X TAMAMEN KAPANDI".

**Anlamı:** dikkat. Devam etmek para kaybettirebilecek bir sebep görüldü; bot siz açana kadar kapalı. Açık pozisyonlar ve borsadaki stoplar yerinde.

**Adımlar:**

1. **Sistem › Sağlık**'ta botun kartındaki sebebi okuyun.
2. Sebep **emir reddiyse** metin kodu ve ne yapacağınızı yazar: *-2019 / -2010* → hesapta teminat ya da bakiye yetmedi (Binance'te elle çekim / işlem yaptıysanız sebep bu); *-1111* gibi **kod hatası** → botu açmayın, geliştirme sohbetine olay raporuyla yazın. Borsaya gitmeyen küçük emirler (asgari tutar altı, fiyat bandı) artık botu kapatmaz.
3. Sebebi giderdiyseniz **Sebebi okudum ve düzelttim** → **Botu yeniden aç**. Kayıt farkından kapandıysa düğme **Borsayla karşılaştır** olur; temiz çıkınca bot kendisi açılır ("Engeli kaldır" bu durumu çözmez).
4. Açtıktan sonra sayaçlar sıfırlanır; bot yalnız **yeni** bir olayla yeniden kapanabilir. Yeniden kapanırsa Telegram "açtığınız bot yeniden kapandı" der — bu gerçek bir tekrardır, geliştirme sohbetine yazın.

## Güvenli kip — günlük çalışma ertelendi {#guvenli-kip}

**Belirti:** Telegram'da tek bilgi iletisi "günlük çalışma güvenli kip yüzünden ertelendi"; ana sayfada sarı "güvenli kipte".

**Anlamı:** zararsız / koruyucu. Bakım, fiyat kaynakları arasında fark, 24 saatte 2 stop vuruşu ya da tekrarlayan bir hata yüzünden bot yeni işlem açmıyor. Stoplar yerinde.

**Adımlar:**

1. Dokunmayın. Sebep geçince kendiliğinden kalkar ve size "güvenli kip geçti" iletisi gelir; ertelenen çalışma birkaç dakika içinde yapılır.
2. Kalkış: bakımda bitişten 15 dk sonra; fiyat farkında fark %1'in altına inince; stop vuruşunda 24 saat sonra; tekrarlayan hatada 60 dk tekrar olmayınca.
3. Tekrarlayan hata "fiyat yok / undefined / Cannot read" gibi bir kod hatasıysa kendiliğinden geçmez: geliştirme sohbetine yazın.

## Borsa verisi şüpheli (veri kapısı) {#veri-kapisi}

**Belirti:** Telegram'da sarı "günlük çalışma ertelendi — borsa verisi şüpheli".

**Anlamı:** zararsız / koruyucu. Günlük mum bayat ya da anlamsız bir sıçrama var; bozuk veriyle karar verilmesin diye bekleniyor.

**Adımlar:** dokunmayın; 15 dakikada bir kendisi yeniden dener. 2 saatten uzun sürerse geliştirme sohbetine yazın.

## Telegram 409 — iki bilgisayar aynı botu yokluyor {#telegram-409}

**Belirti:** Ayarlar › Bu bilgisayar'da "Telegram komutları: HATA 409"; Sağlık › Telegram sarı "komutlara cevap verilemiyor"; `/durum` yazınca cevap gelmiyor ya da iki cevap geliyor.

**Anlamı:** dikkat. Aynı Telegram jetonunu başka bir bilgisayar ya da program da kullanıyor (çoğu zaman taşımadan sonra açık kalan eski bilgisayar). İki bilgisayarda bot da çalışıyorsa çift emir riski vardır.

**Adımlar:**

1. Eski bilgisayarda masaüstündeki **Pusula'yı durdur**'a tıklayın.
2. Orada Görev Zamanlayıcı'da **PusulaBot** ve **PusulaBekci** görevlerini **Devre dışı bırak**.
3. Yeni bilgisayardan Telegram'a `/durum` yazın: tek cevap gelmeli. Birkaç dakika içinde satır yeşile döner.
4. **401** görüyorsanız jeton geçersiz: Ayarlar › Bildirimler › jetonu yeniden girin, **Test**.

## Güncelleme yarıda kaldı {#guncelleme-yarida}

**Belirti:** Ayarlar › Güncelleme "kurulumu yarıda kaldı"; Telegram'da "Pusula güncellemesi yarıda kaldı".

**Anlamı:** dikkat. Güncelleyici bitmeden kapandı. Paket kurulumu için Pusula'yı durdurmuşsa nöbetçisi Pusula'yı yeniden açar.

**Adımlar:**

1. Panel açılıyorsa **Şimdi kontrol et**.
2. Panel açılmıyorsa sunucuda masaüstündeki **Pusula** kısayoluna tıklayın; açılmazsa [Sunucuya kurulum › Güncelleme başarısız olursa](#/kilavuz/kurulum).
3. `node_modules.yedek-*` klasörlerini silmeyin — geri alma için gerekebilir.

## Güncelleme: aynı sürüm iki kez geri alındı {#guncelleme-geri-alindi}

**Belirti:** "Elle bakılmalı — bu sürüm 2 kez kurulup geri alındı".

**Anlamı:** zararsız-dikkat. Eski sürüm çalışıyor; yeni sürüm bu sunucuda kararlı açılmadı, her gün yeniden denenmesin diye otomatik deneme durdu.

**Adımlar:** Ayarlar › Güncelleme'deki geri alma nedenini geliştirme sohbetine gönderin. Düzeltilmiş sürüm gelince kendiliğinden kurulur; isterseniz **Güncellemeyi kur** ile yine deneyebilirsiniz.

## "Yeniden başlatma gerekli" {#yeniden-baslatma-gerekli}

**Belirti:** Ayarlar › Güncelleme'de sarı ya da kırmızı "yeniden başlatma gerekli".

**Anlamı:** sarı = eski Pusula çalışıyor, yeni kod diskte bekliyor (zararsız). Kırmızı "Pusula şu an KAPALI" = tehlike, botlar karar veremiyor.

**Adımlar:** kırmızıysa sunucuda **Pusula** kısayoluna tıklayın. Sarıysa uygun bir saatte **Yeniden başlat** (02:50–04:30 arasında yapmayın).

## "Pusula süreci: bugün N kez açıldı" {#acilis-sayaci}

**Belirti:** Sağlık › Pusula süreci kırmızı.

**Anlamı:** 73.6'dan beri yalnız **beklenmedik** açılışlar sayılır (güncelleme ve sizin yeniden başlatmalarınız ayrıca "(+ N planlı)" diye yazılır). Günde 5'ten çok beklenmedik açılış = Pusula çöküyor.

**Adımlar:** Sağlık › Olay kaydı'nda nedenlere bakın; konsol günlüğünün son satırlarını (`data\sunucu-konsol.log`) geliştirme sohbetine gönderin. Gece yarısı sayaç sıfırlanır.

## Pusula dondu (açık ama yanıt vermiyor) {#donma}

**Belirti:** panel açılmıyor, telefonda "Sunucuya ulaşılamıyor"; sunucu açık.

**Anlamı:** tehlike. 73.6'dan beri Pusula'nın donma bekçisi 10 dakika yanıt alamazsa **yalnız kendi sürecini** kapatır ve denetleyici onu 10 sn sonra açar.

**Adımlar:** 15 dakika bekleyin. Hâlâ açılmıyorsa sunucuda **Pusula'yı durdur** → **Pusula**. Görev Yöneticisi'nden node.exe süreçlerini toplu kapatmayın.

## Kurulum denetimi "kontrol edilemedi" {#kurulum-denetimi}

**Belirti:** Sistem › Kurulum denetimi'nde sarı "bu bilgisayarda kontrol edilemedi"; ya da **Onar** bir komut gösteriyor.

**Anlamı:** zararsız. Pusula arka planda PowerShell açmaz (antivirüs uyumu); görevleri yalnız `schtasks` ile okur, görev kurulumunu kendisi yapmaz.

**Adımlar:** satırdaki komutu bu bilgisayarda **Komut İstemi**'ne (cmd) yapıştırıp çalıştırın, sonra sayfayı yenileyin.

## Ana sayfada "Son 24 saatte N hata" {#gunluk-hata}

**Belirti:** Sistem kartında günlük ışığı.

**Anlamı:** öz denetim sorun görmüyorsa sarıdır (tek tük ağ hatası, kaynak hatası); öz denetimde de kırmızı varsa kırmızıdır.

**Adımlar:** ışığa tıklayıp Günlükler'de satırları okuyun. Sarıysa acil değil.

## Sağlık sinyali adresi yok {#saglik-sinyali}

**Belirti:** Sağlık › Sağlık sinyali sarı "sunucu: adres yok".

**Anlamı:** dikkat. Sunucu sessizce kapanırsa (elektrik, çökme) sizi dışarıdan uyaracak sinyal kurulmamış.

**Adımlar:** [Sunucuya kurulum](#/kilavuz/kurulum) › Sağlık sinyali adımı (healthchecks, ücretsiz) — adresi Ayarlar › Bildirimler › Sağlık sinyali'ne girin.

## Veri "güncel" ama coin evreni kısmi {#kismi-evren}

**Belirti:** Ana sayfada gri "Veri güncel · tam coin evreni … kadar".

**Anlamı:** zararsız, tasarım gereği. Tüm vadeli coinlerin aylık arşivi ay bitince, sonraki ayın 2'sinde 09:00'da gelir; o güne kadar yalnız izlenen semboller günlük güncellenir. Tam evren taramaları son günleri kısmi evrenle görür.

**Adımlar:** bir şey yapmayın; arşiv gelince satır yeşile döner.

## Henüz doldurulmayanlar (73.7–73.8) {#yakinda}

### Sunucu sessiz (healthchecks "down" e-postası) {#sunucu-sessiz}

73.7'de dolacak.

### Antivirüs Pusula'yı sildi ya da karantinaya aldı {#antivirus}

73.7'de dolacak.

### Windows parolası değişti, görevler çalışmıyor {#parola}

73.7'de dolacak.

### Çökme döngüsü {#cokme-dongusu}

73.7'de dolacak.

### Felaket stopu tetiklendi, kayıtlar uyuşmuyor {#felaket-stopu}

73.8'de dolacak.

### Zarar sınırı (K3) çekildi {#zarar-siniri}

73.8'de dolacak.

### Uygulama sapması ENGEL'i tekrar geliyor {#uygulama-sapmasi}

73.8'de dolacak.

### Emir freni {#emir-freni}

73.8'de dolacak.

### Marj uyarısı {#marj}

73.8'de dolacak.
