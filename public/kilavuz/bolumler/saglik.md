# Sağlık (öz denetim) {#saglik}

## Ne işe yarar {#ne-ise-yarar}

"Pusula'da bir şey ters gidiyor mu?" sorusunu Pusula kendine 5 dakikada bir sorar. 34 denetim beş grupta: **Pusula ve sunucu**, **Sunucu bilgisayarı**, **Borsa ve veri**, **Botlar ve pozisyonlar**, **Bildirimler**. Bulduğu her sorunu bu sayfada ve Telegram'da gösterir; güvenli işleri kendisi onarır. Disk, yedek, sunucu bilgisayarı ve borsa duyuruları saatte bir yoklanır.

Üç kademe var:

| Kademe | Ne yapar | Örnek |
|---|---|---|
| **Kendisi onarır** | Geri alınabilir, parayı etkilemeyen işler. Yaptığını kayda yazar | Sahipsiz güncelleme kilidini siler, disk dolarken eski günlükleri sıkıştırır, takılan botta Pusula'yı yeniden başlatır |
| **Korur, sonra sorar** | Tek koruyucu adım atar, ardından size bırakır | Tekrarlayan hatada botu **güvenli kipe** alır; para kaybettirebilecek bir sebepte botu **tamamen kapatır** |
| **Yalnız haber verir** | Karar sizde | Bilgisayar saati kayması, yedek, internet, marj, kaçan planlı işlem, Telegram |

**Para kararlarını hiçbir zaman kendisi vermez:** pozisyon kapatmaz, al-sat yapmaz, ayar ya da strateji değiştirmez. Kod hatalarını da onaramaz; fark eder, botu korur ve size düzgün bir özet verir.

Geliştirme bilgisayarında (sunucu bağlantısı kuruluysa) sayfa **sunucunun** öz denetimini gösterir; öz denetim yalnız sunucuda çalışır.

## Ne zaman kullanılır {#ne-zaman}

- Ana sayfadaki **Sistem sağlığı** kartında sarı ya da kırmızı bir satır gördüğünüzde.
- Menüde **Sağlık**'ın yanında renkli nokta çıktığında (sarı: uyarı, kırmızı: hata ya da kapalı bot).
- Telegram'da "Öz denetim: …" iletisi geldiğinde.

## Ekran {#ekran}

![Sistem › Sağlık: özet, güvenli kipteki bot, denetimler ve onarım kaydı](ekran:saglik-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Durum | Kaç denetimin tamam olduğu; sorun varsa kaç uyarı / hata |
| Son 24 saat | Kaç onarım yapıldı; onarılamayan varsa sayısı. Aynı onarım **günde en çok 5 kez** denenir, sonra size bırakılır |
| Botlar | Hangi bot çalışıyor, hangisi güvenli kipte ya da tamamen kapalı |
| Son yoklama | Son yoklamanın saati ve sonrakinin. **Şimdi yokla** hemen yoklar |
| Bot kartı | Yalnız güvenli kipteki ya da kapalı bot için çıkar: sebep, **Sebebi okudum ve düzelttim** kutusu ve **Botu yeniden aç** / **Güvenli kipi kaldır** düğmesi. Kutu işaretlenmeden düğme çalışmaz |
| Denetim satırı | Nokta (yeşil tamam · sarı uyarı · kırmızı hata · gri ölçülemedi), denetimin adı, kademesi, son sonuç ve varsa son onarım. Sorunlu satırlar grubun üstünde durur. 73.7: her satırın altında **Sorun olursa / Ne yapmalı** satırı (Pusula ne yapar, siz ne yaparsınız) ve [Sorun giderme](#/kilavuz/sorun-giderme) bağlantısı; sorunlu satırda [Sorunlar](#/kilavuz/sorunlar) sayfasındaki adımlara bağlantı |
| Veri kalitesi | 74.3: kip rozeti (**İzleme kipi** / **Etkin kip**), izleme başlangıcı ve bulgu sayıları, bot başına son günlük çalışmanın sonucu, 30 günlük sayaç ve son bulgular; **Etkin kipe geç** / **İzleme kipine dön** düğmesi (yalnız sunucu bilgisayarında). Ayrıntı aşağıda: [Veri kalitesi](#/kilavuz/saglik/veri-kalitesi) |
| Olay raporları | Bot güvenli kipe girince ya da kapanınca yazılan "kara kutu" dosyaları; adına tıklayınca iner. **Şimdi rapor al** o anın raporunu elle yazar |
| Onarım ve olay kaydı | Son 30 gün: **ONARILDI**, **ONARILAMADI**, **GÜVENLİ KİP**, **TAMAMEN KAPANDI**, **UYARI**, **HATA**, **DÜZELDİ** |
| Bot ne zaman tamamen kapanır | Tam kapanma ve güvenli kip sebeplerinin listesi (aşağıda) |

## Güvenli kip {#guvenli-kip}

Sebep belirsiz ya da geçici olabilir; devam etmek risk büyütmesin diye bot **yeni işlem açmaz**. Açık pozisyonun stopu yerinde kalır, dakikalık koruma ve marj denetimi sürer. Bot "durdu" sayılmaz.

**Yalnız azaltan emir (69.5):** güvenli kipteyken borsa yürütücüsü de kilitlenir — pozisyonu büyüten hiçbir emir gönderilmez, dakikalık DCA denetimi dahil. Pozisyonu küçülten ve kapatan emirler, felaket stopları serbesttir. Pusula yeniden açılsa da kilit, botun kayıtlı güvenli kipinden geri konur. Reddedilen emir günlüğe sembol başına saatte bir yazılır.

- **Ne zaman:** aynı hata 30 dakikada 3 kez tekrarlanınca (21 Ekim'deki "fiyat yok" hatası gibi), borsanın fiyatı ikinci bir kaynaktan (OKX) %3'ten fazla saptığında, Binance bakım penceresinde ya da **24 saatte 2 felaket stopu tetiklendiğinde** (piyasa olağan dışı: 24 saat yeni işlem yok).
- **Ne zaman kalkar:** öz denetim koyduysa sebep geçince kendiliğinden: 60 dakika aynı hata tekrarlanmazsa, fiyat farkı %1'in altına inerse, bakım bittikten 15 dakika sonra, stop vuruşunda ilk vuruştan 24 saat sonra. İsterseniz Sağlık sayfasından ya da botun sayfasındaki sarı banttan **Güvenli kipi kaldır**.
- Kısa internet kesintilerinin ağ hataları (zaman aşımı, bağlantı koptu, 429 / 418 geri çekilme) tekrar sayılmaz; onları **Borsa bağlantısı** ve **İnternet** denetimleri izler.
- **Güvenli kipteyken alarm yağmuru yok (73.6):** günlük çalışma **ertelenir** ve size **tek bir bilgi iletisi** gelir ("günlük çalışma güvenli kip yüzünden ertelendi"); güvenli kip kalkınca bir de **"geçti"** iletisi. Eskiden 15 dakikada bir kırmızı "günlük çalışma yapılamadı" alarmı ve healthchecks "DOWN" e-postası geliyordu. Healthchecks'e güvenli kipte hiç sinyal gitmez; güvenli kip bir günden uzun sürerse healthchecks kendi süresinde haber verir. Ana sayfadaki "26 saattir çalışmadı" satırı güvenli kipte geçen süreyi **saymaz**.
- **Borsa verisi şüpheliyse (veri kapısı):** mum bayat ya da anlamsız sıçrama varsa bot o gün karar vermez ve 15 dakika sonra yeniden dener. Bu bir **uyarıdır** (alarm değil); 2 saatten uzun sürerse geliştirme sohbetine yazın.

## Veri kalitesi {#veri-kalitesi}

74.3'ten beri botun günlük kararının **girdileri** karar anından önce tek kapıdan geçer (yukarıdaki veri kapısı aynen önce çalışır):

| Denetim | Ne zaman | Hafif | Ağır |
|---|---|---|---|
| İki kaynak | Karardan önce | Binance vadeli ile Binance **spot** BTC günlük kapanışı %1,5'ten fazla farklı · spot okunamadı | %3'ten fazla farklı |
| Mark fiyatı | Karardan önce | Son kapanıştan %20'den fazla uzak | Sıfır ya da geçersiz |
| Hesap | Karardan önce | Özsermaye önceki çalışmaya göre ±%30 değişti, para yatırma/çekme kaydı yok | Bakiye geçersiz (sayı değil / negatif) |
| Coin evreni | Karardan sonra | Bu ay güncellenemedi (eski evren) | Boş ya da beklenenin yarısından az |
| Kol mumları | Karardan sonra | Evrenin %30'undan fazlası veri kapısından geçemedi (o coinler zaten atlanır) | — |
| Funding | Karardan sonra (demo) | Okunamadı | — (hiçbir zaman ağır değil) |

- **İzleme kipi (varsayılan):** her şey yalnız **kaydedilir** (bot klasöründe `veri-kalitesi.jsonl`, yalnız eklenir, yedeğe girer); kararlar **değişmez**. Kart izleme başlangıcını ve bulgu sayılarını gösterir; 7 gün dolunca "etkin kipe geçmek ister misiniz" der. **Kendiliğinden geçmez** — karar sizin.
- **Etkin kip:** karardan önceki bir denetimde **ağır** bulgu olursa bot o günkü kararı erteler ve **güvenli kipe** girer (yeni işlem yok, stoplar borsada, tek bilgi iletisi). 15 dakikada bir yeniden denetler; veri temizlenince kendiliğinden çıkar ve "geçti" iletisi gelir. Karardan sonraki denetimler yalnız kayıttır.
- **Demo kabul botu (Kairos)** 2026-12-09 sonuna kadar kip ne olursa olsun yalnız haber alır.
- İkinci kaynak (Binance spot) okunamazsa bu yalnız **hafif** bulgudur; karar hiçbir zaman bu yüzden engellenmez. Binance hız sınırı beklemesi varsa istek atılmaz.
- **Kip değiştirmek:** Sağlık › Veri kalitesi › **Etkin kipe geç** / **İzleme kipine dön** → onay. Yalnız sunucu bilgisayarındaki panelden; telefonda ve geliştirme bilgisayarında yalnız görüntüleme. İzleme kipine dönünce veri kalitesinin koyduğu güvenli kip hemen kalkar. Değişiklik Ayar geçmişine de yazılır.
- Bulgu çıkınca ne yapılır: [Sorun giderme › Veri kalitesi bulgusu](#/kilavuz/sorun-giderme/veri-kalitesi).

## Sunucu bilgisayarı {#sunucu-bilgisayari}

Pusula'yı en çok Windows durdurur. Bu grup saatte bir yalnız **okur**, hiçbir ayarı değiştirmez:

| Denetim | Sarı / kırmızı ne zaman | Ne yapmalı |
|---|---|---|
| Windows yeniden başlatması | Güncelleme yeniden başlatma bekliyor. Windows **etkin saatler** dışında kendiliğinden yeniden başlatır; 03:02'deki günlük çalışma bu aralığın dışındaysa gece yeniden başlatabilir | Yeniden başlatmayı gündüz uygun bir saatte elle yapın. Kalıcı çözüm: sunucuda **yönetici** PowerShell'de `powershell -ExecutionPolicy Bypass -File scripts\windows-etkin-saat.ps1` — etkin saatleri **21:00–15:00** sabitler (03:02 ve 12:00 güncellemesi korunur; Windows yalnız 15:00–21:00 arasında yeniden başlatabilir). Durum: aynı komut `-Durum` ile |
| Uyku ve hazırda bekleme | Prize takılıyken bilgisayar boşta uyuyor ya da hazırda bekliyor | Denetim Masası › Güç Seçenekleri › "Bilgisayarı uyku moduna geçir": **Asla** (prizdeyken) |

## ADL, likidasyon ve funding {#adl-funding}

- **ADL ve likidasyon:** borsa bir pozisyonu zorla kapatırsa (ADL — sigorta fonu yetmeyince kârlı pozisyonların otomatik azaltılması — ya da likidasyon) son 24 saat içinde fark edilir: kırmızı satır, ACİL Telegram iletisi ve olay raporu. Diğer bacak korumasız kalmış olabilir; mutabakat botu zaten durdurur (ENGEL). Binance'te açık pozisyonları ve stopları kontrol edin.
- **Funding aşırılığı:** açık pozisyonu olan bir sembolde funding (vadeli işlemde long ile short tarafın 8 saatte bir birbirine ödediği ücret) 8 saatte %0,1'i (yıllık ≈ %110) aşarsa sarı, %0,3'ü aşarsa kırmızı. Kalabalık pozisyon işaretidir; yalnız haber verilir, strateji kararı değişmez.

## Borsa bakımı ve delist {#borsa-takvimi}

Pusula Binance'in ücretsiz, anahtarsız duyurularını saatte bir okur:

- **Borsa bakımı:** vadeli işlem ya da sistem bakımı duyurusunun saat aralığında (10 dakika önce … 15 dakika sonra) botlar **güvenli kipe** girer, bakım bitince kendiliğinden çıkar. Binance sistem durumu "bakım" derse de aynı. 48 saat içindeki bir bakım 03:02 çalışmasıyla çakışıyorsa önceden sarı uyarı gelir. Cüzdan, ağ yükseltmesi, hisse işlemleri gibi duyurular botları etkilemez, sayılmaz.
- **Delist:** botların evrenindeki bir vadeli sözleşme ya da coin borsadan çıkarılacaksa tarihiyle **haber** verir. Evreni değiştirmez; evren seçimi stratejinin işidir.

## Canlı ↔ gölge kayması ve işlem maliyeti {#sapma-maliyet}

İki **haber** denetimi (bota dokunmaz):

- **Canlı ↔ gölge kayması:** botun gerçekleşen günlük getirisi ile aynı günün ideal gölgesi arasındaki fark CUSUM ile izlenir (günde 5 baz puan tolerans; birikim 1,5 puanı aşınca sarı). 30 günlük %3 (incele) / %5 (ENGEL) bandından önce, küçük ama sürekli sapmayı yakalar. "İYİ" ya da "KÖTÜ" yönünü yazar.
- **İşlem maliyeti:** son 30 günün piyasa dolumlarında emir anındaki fiyattan kayma + 5 baz puan ücret, backtestin varsaydığı 7 baz puanın 2 katını aşarsa (en az 10 dolum) sarı: backtest sonuçları gerçekte bu kadar iyi olmayabilir. Kâğıt hesap ölçülmez (dolum sanal). Demo hesabın ayrıntılı maliyet ölçümü demo kabul raporundadır (U4, U5).

## Olay raporları (kara kutu) {#kara-kutu}

Bir bot güvenli kipe girince ya da tamamen kapanınca (öz denetim koysa da, botun kendi ENGEL'i olsa da) Pusula o anın raporunu yazar: botun ve borsa bağlantısının durumu, son 30 dakikanın günlüğü, sorunlu denetimler, son olaylar, son güncelleme. Telegram iletisinde raporun adı yazar. Sorunu geliştirme sohbetinde incelerken bu dosyayı verin; günlüğü elle kopyalamaya gerek kalmaz.

- Rapor **sır içermez**: API anahtarı, Telegram jetonu ve sağlık sinyali adresi yazılmaz.
- En çok 200 rapor tutulur; eskiler silinir. Yeri: `data/oz-denetim/kara-kutu/`.
- **Şimdi rapor al:** bir şey tuhaf göründüğünde o anın raporunu elle yazar.

## Tam kapanma {#tam-kapanma}

Devam etmek **para kaybettirebilecekse** bot tamamen durur ve siz açana kadar kapalı kalır. Bu, botun bildiğiniz **ENGEL**'idir: diske yazılır, Pusula yeniden başlasa, güncellense ya da bekçi açsa da bot kapalı kalır.

| Sebep | Neden para kaybettirebilir |
|---|---|
| Mutabakat farkı | Borsadaki pozisyon ya da bakiye botun kaydından farklı; bot yanlış miktarla alıp satabilir |
| Koruma stopu kurulamadı | Felaket stopu art arda 3 denetimde kurulamadı; pozisyon korumasız |
| Bozuk bot kaydı | Durum dosyası bozuk açıldı; son sağlam kopya borsayla karşılaştırılana kadar bot kapalı |
| Emirler art arda reddediliyor | **Borsa** emri 30 dakikada 3 kez gerçek bir sebeple reddetti: teminat ya da bakiye yetmedi (-2019, -2010) veya Pusula kurala uymayan istek yolladı (-1111 ondalık …). 73.6: Telegram ve olay metni koda göre ne yapacağınızı söyler. **Sayılmayanlar:** borsaya hiç gitmeyen ön kontrol retleri (asgari tutar altı -4164/-4003, fiyat bandı -4131, sıfır miktar -1013) — bunlar sık tekrarlarsa yalnız güvenli kip sayacına girer. Aynı ret günlükte iki satır yazsa da (yürütücü + DCA) **bir** kez sayılır |
| Beklenmeyen emir ya da dolum | Botun göndermediği bir emir dolmuş; mutabakat yakalar |
| Bot döngüsü tekrar tekrar çöküyor | Dakikalık döngü 30 dakikada 3 kez hata verdi (73.6: internet / borsa bağlantı hataları sayılmaz) |
| Emir freni | Risk artıran emirler 24 saatte 600'ü, 10 dakikada 150'yi ya da 24 saatte sermaye tavanının 20 katını aştı — kaçak bir döngü (Knight Capital 2012 tipi kaza). Azaltan emirler ve stoplar serbest kalır |
| API anahtarının yetkisi değişti | Para çekme izni açılırsa ya da IP kısıtı kalkarsa. **Günde bir denetleniyor ama şimdilik yalnız haber** (aşağıda: API anahtarları) — botu kapatmaya bağlanması canlı hesaba geçmeden ayrıca kararlaştırılacak |

- **Açık pozisyona dokunulmaz;** borsadaki stoplar yerinde kalır. Pozisyonu kapatmak da bir al-sat kararıdır ve kötü bir fiyattan zarar yazdırabilir.
- **Yeniden açmak:** sebebi inceleyin, düzeltin; Sağlık sayfasında **Sebebi okudum ve düzelttim** kutusunu işaretleyip **Botu yeniden aç**. Kayıt farkından kapanmışsa düğme **Borsayla karşılaştır** olur: karşılaştırma temiz çıkınca bot açılır. Aynı sebeple ikinci kez kapanırsa da her seferinde açabilirsiniz. **73.6:** açtığınız anda öz denetimin sayaçları sıfırlanır — bot yalnız açtıktan **sonraki yeni** olaylarla yeniden kapanabilir (eskiden 5 dakika sonra eski satırlarla yeniden kapanıyordu). Yeniden kapanırsa Telegram 6 saatlik tekrar kısıtına takılmaz: "açtığınız bot yeniden kapandı — sebep: …" iletisi her zaman gelir.
- Zarar sınırları (en büyük düşüş kill-switch'i, günlük zarar limiti, felaket stopu) ayrıca ve aynen çalışır; tam kapanma zarara değil **sebebe** bakar.

## Demo kabul süresi {#demo-kabul}

Demo kipindeki bota (Kairos) öz denetim **9 Aralık 2026 sonuna kadar hiçbir şey yapmaz**: güvenli kip, tam kapanma ve o bot için yeniden başlatma yok, yalnız haber verir. Demo kabul ölçümü bozulmasın diye. Sonra aynı kurallar Kairos'a da uygulanır.

## Yeniden başlatma {#yeniden-baslatma}

- **Pusula çökerse** bekçi onu her seferinde yeniden açar (sınır yok). Günde 5'ten çok **beklenmedik biçimde** açıldıysa **Pusula süreci** kırmızıya döner ve Telegram'a yazar. 73.6: planlı yeniden başlatmalar (güncelleme, panelden yeniden başlatma, Pusula'yı durdur → Pusula) bu sayıya girmez; ayrıntıda "(+ N planlı)" diye ayrı yazılır.
- **Pusula donarsa** (süreç açık ama yanıt vermiyor, 73.6): Pusula'nın içindeki **donma bekçisi** 10 dakika boyunca kendi sağlık adresinden yanıt alamazsa **yalnız kendi sürecini** kapatır; denetleyici 10 saniye sonra yeniden açar. Başka hiçbir program kapatılmaz. Yalnız Pusula kısayolu / PusulaBot göreviyle başlatıldıysa çalışır.
- **Bir bot takılırsa** (işi 30 dakikadan uzun sürüyor) Pusula hemen yeniden başlatılır; açılıştan sonraki ilk 15 dakikada yapılmaz.
- **Bellek şişerse** (1 GB üstü ya da 24 saatte 2 katı) Pusula yalnız **sessiz saatte** yeniden başlatılır: hiçbir botun işi sürmüyorken ve 02:30–04:30 dışında (03:02'deki günlük çalışma ve 02:50–04:30 güncelleme penceresi).
- Yeniden başlatma yalnız Pusula denetleyiciyle (Pusula kısayolu / PusulaBot görevi) başlatıldıysa yapılır; yoksa yalnız haber verilir.

## Telegram {#telegram}

- **Belirti ve neden ayrımı:** denetimlerin bir kısmı "belirti"dir — bir şeyin şu an bozuk olduğunu söyler (botun döngüsü, borsa bağlantısı, mutabakat, koruma stopu, marj, ADL, kaçan işlem, güç, disk sağlığı, Telegram'ın kendisi…). Belirti sarıya ya da kırmızıya dönünce **anında** ileti gider. Geri kalanlar "neden"dir (bekleyen Windows yeniden başlatması, yedek yaşı, paket taraması, Node desteği, saat farkı…): sarıları yalnız panelde ve 21:00 akşam özetinde görünür, **kırmızıya dönerlerse** anında gider. Böylece telefon yalnız gerçekten bakmanız gereken şeyde çalar.
- Aynı durum 6 saatte bir tekrarlanır. Güvenli kip ve tam kapanmada ayrı, kırmızı ileti.
- Düzelen sorunlar ve yapılan onarımlar **21:00 akşam özetinde** gelir: denetim sayıları, günün onarımları, açık sorunlar, disk, bellek, saat farkı.
- İnternet 10 dakikadan uzun kesilip gelince "kesinti X dk sürdü" bilgisi gider.

## İkinci uyarı kanalı {#ikinci-kanal}

Telegram tek kanal olursa, Telegram düştüğünde (ya da jeton geçersizleşince) hiçbir uyarı gelmez. Sağlık sayfasındaki **İkinci uyarı kanalı** kartında iki ücretsiz önlem var:

- **ntfy:** ACİL uyarılar (alarm) her zaman, diğerleri Telegram gönderilemediğinde ntfy ile telefona da gelir. Telefona **ntfy** uygulamasını kurun (ücretsiz, hesap gerekmez), tahmin edilemeyecek bir konu adı seçin (ör. `pusula-7k2q9x4mzt`; konuyu bilen herkes iletileri görebilir), uygulamada bu konuya abone olun, aynı adı karta yazıp **Kaydet**, sonra **ntfy'a deneme gönder**.
- **İkinci ölü adam:** healthchecks'ten bağımsız ikinci bir izleyici. Örneğin Better Stack'in ücretsiz planında bir "heartbeat" açıp adresini karta yazın; Pusula her 5 dakikada bir o adrese haber verir, gelmezse Better Stack sizi e-postayla / uygulamasıyla uyarır. Adres mevcut healthchecks adreslerinden farklı olmalı.
- SMS ve telefon araması ücretli planlarda olduğu için önerilmez.

## API anahtarları {#sir-kasasi}

API anahtarları, Telegram jetonu ve sağlık adresleri `secrets.json` dosyasında **düz** durur (69.0'daki gibi). 69.4–69.8 arasında bu dosya Windows'un şifrelemesiyle korunuyordu; Pusula bunun için arka planda PowerShell açıyordu ve 21–22 Ekim'de sunucudaki Kaspersky bu davranışı virüs sanıp Pusula'yı sildi. **70.0'da şifreleme kodu tamamen çıkarıldı.**

- **Koruma anahtarın kendisinde:** Binance anahtarında **para çekme izni kapalı** ve canlı hesapta **IP kısıtı zorunlu** — dosya kopyalansa bile anahtar başka bir yerden kullanılamaz, para çekilemez.
- **API anahtarı yetkisi (günde bir):** her kayıtlı borsa hesabı ve İşlem defterim anahtarı yalnız okunarak sınanır (Ayarlar › Anahtarlar › Sına ile aynı kod, emir yok). Para çekme izni **açıksa kırmızı**, Sorunlar sayfasında kart ve Telegram'a bir uyarı; canlı hesapta IP kısıtı yoksa ya da defter anahtarı salt okuma değilse **sarı**; okunamazsa **bilinmiyor**. Yalnız haber verir, botu durdurmaz. Ne yapmalı: Kılavuz › Sorun giderme › API anahtarında para çekme izni açık.
- **Şifreli kalmış dosya:** o sürümlerde şifrelenmiş bir dosyayı Pusula çözmeye çalışmaz; Sağlık kırmızı gösterir. Çözümü: masaüstüne verilen **Pusula-69.0** paketindeki `scripts\sir-coz.ps1` (bir kez, Pusula'yı çalıştıran kullanıcıyla), sonra Pusula'yı yeniden başlatın.

## Saldırılara karşı korumalar {#guvenlik}

69.6'da Pusula'ya dört yönden saldırı testi yapıldı (panel, sırlar ve bilgisayar, güncelleme zinciri, para mantığı) ve bulunan açıklar kapatıldı:

- **Masaüstünde de PIN:** sunucudaki panelde tehlikeli işlemler acil durdurma PIN'ini ister: taşıma paketi oluşturma / indirme / yükleme, API anahtarlarını ve ayarları kaydetme, engeli ve güvenli kipi kaldırma, hesap türü ve canlı onay, canlı emir kilidi, kâğıt hesabı sıfırlama, para yatırma/çekme kaydı, güncellemeyi kurma, yeniden başlatma, geçmişi silme. Doğru PIN 10 dakika geçerlidir (Pusula yeniden başlayınca yeniden sorulur). **Acil durdurma, botu durdurma ve pozisyon kapatma PIN istemez** — risk azaltan işlem hiç engellenmez. 1 dakikada 5 yanlış PIN telefonu da masaüstünü de 1 dakika kilitler ve Telegram'a uyarı gider. PIN panelden belirlenemez (kötü bir program kendi PIN'ini koyamasın diye): sunucuda bir kez `npm run acil-pin`.
- **Yabancı siteler paneli kullanamaz:** isteği gönderen sayfanın adresi panelin kendi adresiyle birebir aynı olmalı; başka bir sitenin (başka bir Tailscale adresi dahil) gizlice "acil kapat", "engeli kaldır" gibi istek göndermesi ve canlı yayını okuması kapalı. Panel başka bir sitede görünmez çerçeveye de konamaz.
- **Taşıma paketi haberi:** her taşıma paketi oluşturulduğunda Telegram'a haber gelir. Siz yapmadıysanız API anahtarlarını hemen yenileyin.
- **Yalnız imzalı kod kurulur:** sunucu, geliştirme bilgisayarında imzalanmamış güncellemeyi kurmaz; Telegram'a kritik uyarı gider. Kurulum bir kerelik: [Kod imzası](#/kilavuz/ayarlar/kod-imzasi).
- **Antivirüse uyum (70.0; 73.6'da tamamlandı):** Pusula arka planda **hiç PowerShell açmaz** — 73.6'dan beri Kurulum denetimi sayfası (görevleri `schtasks` ile salt okur, kısayolu dosyadan okur) ve otomatik güncelleyici (Pusula'nın kendi durdurma / yeniden başlatma uçları, kapalıysa `schtasks /run PusulaBot`) dahil; antivirüs ürünlerini, güvenlik duvarını, açık portları, pili ve olay günlüğünü sorgulamaz. Bu ölçümler (Virüs koruması, Dış erişim, Güç ve beklenmeyen kapanma, disk sağlığı) kaldırıldı: arka planda bunları soran bir program antivirüse virüs gibi görünüyordu. Antivirüsün açık olduğunu ve güvenlik duvarını Windows Güvenliği'nden elle kontrol edin.

## Paket güvenliği ve Node desteği {#paket-guvenligi}

- **Paket güvenliği:** günde bir `npm audit` (ücretsiz) yapılır; yüksek açık sarı, kritik açık kırmızı. Düzeltme geliştirme tarafında yapılır ve güncellemeyle gelir. 2025'te popüler npm paketlerine kripto işlemlerini hedefleyen zararlı kod eklenmişti; bu yüzden paketler tam sürüme sabitlidir, sunucu yalnız kilit dosyasındaki sürümleri kurar (`npm ci`), kurulum betikleri çalıştırılmaz ve yeni sürümler en az 7 gün beklemeden önerilmez. Bot kodu güncellemesinde paket değişikliği varsa onay ekranı hangi paketin hangi sürümden hangisine geçtiğini gösterir.
- **Node.js desteği:** çalışan Node sürümünün güvenlik desteğinin bitmesine 6 aydan az kaldıysa sarı, bittiyse kırmızı.

## Uyarılar ve ne yapmalı {#uyarilar}

- **Bilgisayar saati:** Windows › Ayarlar › Saat ve dil › Tarih ve saat › **Şimdi eşitle**. 1 saniyeden büyük fark borsanın emirleri reddetmesine yol açabilir.
- **Yedek alınıyor (sarı):** [Yedek ve taşıma](#/kilavuz/yedek-tasima) — hedef disk takılı mı, görev çalışıyor mu.
- **Kaçan planlı işlem:** satırda nedeni yazar (bot kapalı, güvenli kipte, son hata). Pusula kaçırılan işlemi kendisi yapmaz; bot sonraki çalışmada bugünkü hedefe gider.
- **Takılı kilit:** güncelleme yarıda kalmışsa [Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme-izleme) "yarıda kaldı" der; **Şimdi kontrol et** (73.6: düğme bu durumda görünür).
- **Sağlık sinyali "adres yok" (sarı, 73.6):** sunucu sinyali (healthchecks) kurulmamış — sunucu elektrik kesintisinde ya da çöküşte sessizce kapanırsa sizi uyaracak dış bir sinyal yok. [Sunucuya kurulum](#/kilavuz/kurulum) › Sağlık sinyali adımı (ücretsiz).
- **Bot kartı sorunları (73.8):** pozisyon uyuşmazlığı, felaket stopu / ADL sonrası kayıt farkı, K3 zarar sınırı, %5 sapma ENGEL'i ve kabul bekleyen yatırma için çözüm aracı Sistem › Sorunlar kartındadır (önizleme → acil PIN + onay). Ayrıntı: [Sorun giderme › Sorun araçları](#/kilavuz/sorun-giderme/sorun-araclari).
- **Telegram "komutlara cevap verilemiyor" (sarı, 73.6):** bkz. [Sorun giderme › Telegram 409](#/kilavuz/sorun-giderme/telegram-409).
- Belirti → anlam → adımlar biçiminde tüm durumlar: [Sorun giderme](#/kilavuz/sorun-giderme).
- Kayıtlar `data/oz-denetim/` altında (git dışı): `durum.json`, `olaylar.jsonl`, `acilislar.jsonl`. Sıkıştırılan eski günlükler `data/gunluk/*.jsonl.gz` olarak kalır; hiçbir şey silinmez.
