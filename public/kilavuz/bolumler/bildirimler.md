# Bildirimler {#bildirimler}

## Ne işe yarar {#ne-ise-yarar}

"Telefonuma hangi bildirimler, hangi metinle, hangi kanaldan gelsin?" Telegram'a (ve isterseniz ntfy'a) giden her bildirim türü tek listede: ne zaman geldiği, önemi, en son ne zaman gönderildiği ve **açık / kapalı** düğmesi. Her türün **Düzenle** düğmesi kanalı, sessiz saat davranışını ve **metni** açar; metni yazarken yanında **önizleme** görünür. Sağda **son gönderilenler**: her mesajın türü, başlığı ve sonucu.

Telegram bağlantısının kendisi (bot token, chat id, etkinleştirme) [Ayarlar › Bildirimler](#/kilavuz/ayarlar/bildirimler)'de, ntfy konusu [Sağlık › İkinci uyarı kanalı](#/kilavuz/saglik)'nda; bu sayfa **hangi** bildirimin **nasıl** gideceğini yönetir.

## Ne zaman kullanılır {#ne-zaman}

- Çok mesaj geliyorsa: örneğin her işlem bildirimini kapatıp yalnız günlük özeti açık bırakmak, ya da gece için **sessiz saat** koymak.
- Bir mesajı kendi diliniz ve düzeninizle almak için: türün metnini değiştirin.
- Önemli bir uyarıyı Telegram'ın yanında **ntfy**'dan da (ayrı bir telefon bildirimi) almak için: kanalı "Telegram + ntfy" yapın.
- Bir bildirimin gelip gelmediğini kontrol etmek için: son gönderilenler listesinde sonucu yazar. Telegram'ı yeni kurduğunuzda **Deneme mesajı gönder**.

## Ekran {#ekran}

![Sistem › Bildirimler — Düzenle açık: kanal, metin, önizleme](ekran:bildirim-1400)

## Türler {#turler}

| Tür | Ne zaman gelir |
|---|---|
| **Acil durum** (kritik) | Acil durdurma, bot tamamen kapandı, borsa pozisyonu zorla kapattı, çalışmada hata, bot saatlerdir çalışmadı, çökme, kurulamayan güncelleme |
| **Koruma stopu** (kritik) | Felaket stopu konamadı, borsada görünmüyor (kayboldu), güncellenemedi ya da çalıştı |
| **Bot ENGEL / güvenli kip / emir freni** (kritik) | Bot yeni emir vermiyor: ENGEL (uygulama sapması, pozisyon uyuşmazlığı), emir freni, güvenli kip, yürütücü durdu, mutabakat uyuşmazlığı, hesap kesicisi |
| **Güvenlik** (kritik) | PIN kilidi (yanlış denemeler), canlı hesaba geçiş / canlı emir onayı, sunucunun dış IP adresi değişti, ayar dosyası bozuk açıldı, sunucudaki `.git/config` değişti |
| İşlem yapıldı | Bot bir coin aldığında ya da sattığında |
| Günlük bot özeti | Botun her günkü çalışmasından sonra: karar, hesap değeri, koruma stopu |
| Başlatma / durdurma | Sunucu ya da bot başladığında, bağlantı kurulduğunda, piyasa verisi geri geldiğinde |
| Uyarı ve hata | Borsaya ya da veriye ulaşılamadı, disk dolmak üzere gibi dikkat isteyen durumlar |
| Günlük / haftalık rapor | Her sabah günlük rapor özeti, pazartesi haftalık özet; ayın 1'i aylık, 1 Ocak yıllık özet |
| Model uygulama günü | Model portföylerin alım-satım listesi (kâğıt hesap) hazır olduğunda |
| **Bilanço özeti** (yeni) | Günde en çok 2 özet: BIST 100 + elinizdeki hisselerden o gün bilanço açıklayanlar — bkz. [yeni bildirimler](#/kilavuz/bildirimler/yeni) |
| **Piyasa takvimi** (73.9) | Pazartesi sabahı haftanın olayları tek mesaj (FOMC, TÜFE, BIST bilanço son günleri, elle eklenen kilit açılımları) + her olaydan bir gün önce hatırlatma — bkz. [Piyasa bağlamı](#/kilavuz/piyasa-baglami/telegram) |
| **Olay sonucu** (73.9) | Olay açıklanınca sonuç: FOMC kararı, açıklanan TÜFE (yalnız rakam) |
| Coin tarama / Dikkat listesi | Kaçın / izle listesine yeni coin girdiğinde |
| İleri test | Bir ileri test uyarı ya da alarm eşiğini aştığında, uygulama sapması, demo kabul notları |
| **Gölge testler haftalık özeti** (yeni) | Pazartesi sabahı tek mesaj: gölgelerin getiri rakamları (🧪 GÖLGE TESTİ — parasız, emirsiz) |
| **Anahtar sınaması başarısız** (yeni) | Günlük salt okuma sınamasında bir anahtar bağlanamadıysa ya da para çekme izni açıksa |
| **Makine sessiz** (yeni) | Sunucu uzun süre kapalı kaldıysa (açılışta) ya da araştırma kopyası uzun süre görünmediyse |
| **Sert fiyat hareketi** (yeni) | BTC (ya da seçtiğiniz semboller) kısa sürede eşikten fazla oynadığında |
| Güncelleme | Yeni sürüm onay bekliyor, elle bakılmalı ya da GitHub'a ulaşılamıyor |
| Yedek | Otomatik yedek alınamadığında |
| Diğer | Yukarıdakilere girmeyen mesajlar |

Tür, mesajın başlığından kendiliğinden anlaşılır (ör. 🚨 ile başlayan, koruma stopu ya da ENGEL geçmeyen mesaj acil durumdur); yeni türleri Pusula türüyle birlikte gönderir. İnternet kesintisinden sonra **gecikmeli** gelen mesaj da kendi türünde sayılır. İlk açılışta eski Ayarlar'daki "Kritik olaylar · Hatalar · Başlatma / durdurma · Her işlem" seçimleriniz başlangıç değeri olarak alınır; yeni türler açık başlar.

## Mesajların biçimi {#bicim}

Varsayılan metinde her bildirim aynı biçimde gelir: **bot · ne oldu** başlığı, bir iki sade cümle, uyarı ve acil mesajlarda **Ne yapmalı:** satırı (nereye bakılacağı ya da bir şey yapmana gerek olmadığı) ve kısa saat ("Pusula · 19 Eki 03:02"). Sayılar Türkçe yazılır (4.999,29 USDT); iç terimler ve belge adları çıkarılır. Hesap türü yalnız canlı hesapta başlıkta görünür ("Kairos (canlı)"). Bu biçimi tür başına [değiştirebilirsiniz](#/kilavuz/bildirimler/metin).

## Kritik bildirimler {#kritik}

**Acil durum, Koruma stopu, Bot ENGEL / güvenli kip / emir freni** ve **Güvenlik** kritik türlerdir:

- **Kapatılamaz** — açık / kapalı düğmesi kilitli.
- **Sessiz saati deler** — gece de hemen gelir.
- Kanalda **Telegram her zaman** vardır: "Telegram" ya da "Telegram + ntfy" seçilebilir, yalnız ntfy seçilemez. (Bot alarmları ntfy kuruluysa zaten ntfy'a da gider — 69.4 ikinci kanal; bu değişmedi.)
- Yalnız **metni** değiştirilebilir; metni boşaltırsanız bugünkü varsayılan metne döner.

## Metni düzenlemek {#metin}

1. Türün satırındaki **Düzenle**'ye basın.
2. **Metin** kutusuna kendi düzeninizi yazın. Süslü parantezli **değişkenler** mesajın o anki değeriyle dolar; kutunun altındaki düğmelerle imleç yerine eklenir. Her türde: `{simge}` (🚨 ⚠️ 📊 …), `{baslik}` (bot · ne oldu), `{govde}` (açıklama satırları), `{ne_yapmali}`, `{zaman}`, `{bot}`, `{mesaj}` (bugünkü mesajın tamamı). Yeni türlerin kendi değişkenleri de var (ör. sert fiyat hareketinde `{sembol}`, `{degisim}`, `{fiyat}`, `{pencere}`; bilanço özetinde `{saat}`, `{sayi}`, `{eldeki}` (📌 satırları), `{liste}` (en dikkat çekenler), `{daha}`, `{not}`; gölge özetinde `{hafta}`, `{etiket}`, `{liste}`, `{hukum}`).
3. Sağdaki **önizleme** örnek bir mesajla anında güncellenir.
4. **Metni kaydet**. Bugünkü metne dönmek için **Varsayılana dön** (ya da kutuyu boşaltıp kaydedin).

Kurallar:

- İçindeki değişkenlerin **hepsi boş** kalan satır mesajdan düşer (ör. "Ne yapmalı" önerisi olmayan mesajda o satır görünmez).
- Kalın / italik için yalnız `<b>…</b>`, `<i>…</i>`, `<u>…</u>`, `<s>…</s>`, `<code>…</code>`; kapanmamış etiket kaydedilmez. Başka `<`, `>`, `&` düz yazı olarak gider.
- **Bilinmeyen değişken** (yanlış yazılmış, ör. `{fiyatt}`) önizlemede kırmızı işaretlenir; düzeltilene kadar o tür **bugünkü varsayılan metinle** gider — boş yer bırakılmaz. Telegram düzenlenmiş metni reddederse aynı bildirim varsayılan metinle bir kez daha gönderilir; bildirim kaybolmaz.
- Varsayılan (boş) metin, 73.4'teki mesajın **aynısıdır**.
- Telefonda metin yalnız görüntülenir; düzenleme bilgisayardaki panelden (geliştirme bilgisayarından yapılan değişiklik sunucuya iletilir — bildirimleri sunucu gönderir).

## Kanal: Telegram, ntfy ya da ikisi {#kanal}

Her türün **Kanal** seçimi: **Telegram** (varsayılan), **ntfy** ya da **Telegram + ntfy**. ntfy, ücretsiz ve hesapsız ikinci telefon bildirimidir; konusu [Sağlık › İkinci uyarı kanalı](#/kilavuz/saglik)'nda kurulur. ntfy kurulu değilken ntfy seçilen tür **Telegram'dan** gider (kaybolmaz). Bot alarmları için Telegram + ntfy seçildiğinde ntfy'a tek mesaj gider (aynı uyarı iki kez gelmez).

## Sessiz saatler {#sessiz}

Sayfanın üstündeki **Sessiz saatler** kartında başlangıç ve bitiş (İstanbul saati, ör. 23:00 – 08:00; gece yarısını aşabilir) ve **Sessiz saatleri kullan**. Varsayılan kapalıdır. Açıkken bu saatlerde gelen bildirim, türünün **Sessiz saatte** seçimine göre:

- **bekletilsin, sonra özet** (varsayılan) — sessiz saat bitince bekleyenlerin hepsi **tek bir özet mesajı** olarak gelir (her birinin saati, türü, başlığı ve ilk satırı). Sunucu kapanıp açılsa da bekleyenler kaybolmaz.
- **gönderilmesin** — hiç gönderilmez; son gönderilenler listesinde "sessiz saat — düşürüldü" diye görünür.
- **yine de gönderilsin** — bu tür için sessiz saat yok sayılır.

Kritik türler her zaman hemen gelir.

## Yeni bildirimler {#yeni}

Hepsi **yalnız sunucuda** üretilir (araştırma kopyasında çalışmaz), hiçbiri emir vermez ya da bir ayarı değiştirmez; ücretli kaynak yoktur. Sayfanın altındaki **Yeni bildirimlerin ayarı** kartında ayarlanır ve son durumları yazar (bilanço için: hangi şirketler — yalnız elimdekiler / elimdekiler + BIST 100 / tüm BIST —, en çok 2 mesaj saati, satır sayısı 3–15; piyasa takvimi için pazartesi mesaj saati ve bir gün önce hatırlatma saati).

- **Bilanço özeti** — tek tek mesaj yerine **günde en çok 2 özet** (varsayılan **13:00** ve **20:30**; o arada bilanço açıklanmadıysa mesaj gelmez). Hangi şirketler: varsayılan **elinizdekiler + BIST 100**. Elinizdekiler = **Lydia**'nın (BIST Momentum 10) kâğıt hesaptaki hisseleri + **Portföyüm**'deki BIST (TL) hisseleriniz. BIST 100, Borsa İstanbul'un resmî üye listesi açık kaynakta olmadığı için **vekildir**: BIST temel çalışmasının ölçütleriyle (son 63 günün halka açık piyasa değeri + işlem hacmi süzgeci) o günün en büyük 100 şirketi; resmî endeksle büyük ölçüde örtüşür, birebir değildir. Ayarla "yalnız elimdekiler" ya da "tüm BIST" de seçilebilir.
  Sunucu 08:00–23:00 arası yaklaşık **90 dakikada bir** KAP'ın (Kamuyu Aydınlatma Platformu, resmî ve ücretsiz) listesine bakar, yeni **finansal raporların** tablosundan **ana ortaklık net kârını** ve (varsa) **satışları** okur, mesaj saatinde özetler. Mesajda:
  - **📌 elinizdekiler her zaman** ve en üstte: "📌 THYAO · 3Ç net kâr … — elinizde: Lydia (BIST M10)" (ya da Portföyüm; satır sınırına sayılmaz, rakam okunamasa da yazılır);
  - sonra **en dikkat çekenler** (varsayılan toplam 8 satır): zarardan kâra, kârdan zarara, geçen yılın aynı çeyreğine göre en büyük artış ve en büyük düşüş — artı ve eksi taraf sırayla; satış değişimi okunabildiyse satırın sonunda;
  - "**N şirket daha açıkladı.**" tek satır; en altta **TMS 29** notu (rakamlar enflasyon düzeltmeli; geçen yılın rakamı bugünkü alım gücüne taşınmış).
  Yorum ve alım-satım önerisi **yoktur**, yalnız rakam ve yön. Çeyrek = 3 aylık sütun (1. çeyrekte dönemin kendisi); 3 aylık sütun yoksa yıllık / dönem toplamı yazılır. KAP'a düşük hızla gidilir: istekler arası en az **20 saniye**, bir turda en çok **15** rapor sayfası (kalanlar sonraki tura); KAP hata verirse ya da "çok istek" (429) derse **6 saat** beklenir. Aynı KAP bildirimi iki kez işlenmez; akşam mesajından sonra gelen bilanço ertesi günün öğle özetine kalır.
- **Makine sessiz** — sunucu her 5 dakikada bir "nabız" yazar; Pusula açılırken son nabız **30 dakikadan** eskiyse "Sunucu bir süre sessiz kaldı" gelir (elektrik, Windows güncellemesi, uyku). Sunucu bağlantısı kurulu **araştırma kopyası** her 10 dakikada bir sunucuya görünür; **24 saat** görünmezse bir kez, yeniden görününce bir kez bildirim gelir. Sunucunun kendisi kapalıyken uyarıyı Telegram veremez — o iş [sağlık sinyalinin](#/kilavuz/ayarlar/saglik) (healthchecks). Eşikler ayarlanabilir. İleride birden çok sunucu makinesi olunca aynı düzen onlara da genişler.
- **Gölge testler haftalık özeti** — her **pazartesi 09:00**'dan sonra tek mesaj. Başlıkta ve ilk satırda açıkça: "**🧪 GÖLGE TESTİ — para yok, emir yok; ara sonuçtur, hüküm değildir**" (en yakın hüküm tarihiyle); her satır da "🧪 GÖLGE ·" ile başlar. Gölge başına tek satır, yalnız sayılar: **başlangıçtan bu yana getiri**, **son 7 gün**, aynı dönemde gölgenin kendi ön kaydındaki **kıyas** (Kairos / Tao gölgesinde BTC al-tut; Kairos-S, 876 ve momentumda Kairos; Bollinger'de mevcut kural + al-tut; 3 günlük mum ve D3 vetoda "aday − taban" farkı puan olarak; CBDR'de R birimi), **işlem / olay / gün** sayısı, varsa **bant** (gölge MaxDD'si p95 bandının içinde mi) ve satır sonunda **hüküm / kontrol tarihi**. Henüz başlamamış gölge "henüz başlamadı (başlangıç …)" yazar; 3 günden eski veri "… gündür yeni veri yok" diye işaretlenir. Sayılar İleri test sayfasıyla **aynı kaynaktan** gelir (ayrı hesap yok). "İyi / kötü gidiyor" gibi yorum ve hüküm **yazılmaz** — kararlar yalnız ön kayıtlı tarihlerde, İleri test sayfasında. (Demo kabul gölge değildir — demo hesapta emir verir — bu özette yer almaz; kendi bildirimleri "İleri test" türündedir.)
- **Anahtar sınaması başarısız** — her gün **06:15**'ten sonra bir kez, kayıtlı borsa ve İşlem defterim anahtarları [Ayarlar › Anahtarlar](#/kilavuz/ayarlar/anahtarlar)'daki **Sına** ile aynı **salt okuma** denemesinden geçer (emir yok). Bağlanamayan anahtar ya da **para çekme izni açık** anahtar varsa bildirim gelir; sonuç Anahtarlar'da "Son sınama" olarak da görünür. Telegram jetonu ve sağlık adresleri bu günlük sınamaya girmez.
- **Piyasa takvimi** (73.9) — her **pazartesi 09:00**'dan sonra haftanın olayları **tek mesaj** (FOMC faiz kararı, Türkiye ve ABD TÜFE, BIST bilanço son günleri, elle eklenen coin kilit açılımları; o hafta olay yoksa mesaj gelmez) ve her olaydan **bir gün önce 18:00**'den sonra "⏰ Yarın: …" hatırlatması (olay başına bir kez). İki saat de bu kartta ayarlanır (06:00–23:00). Takvimin kaynakları ve "tahmini" olanlar: [Piyasa bağlamı › Olay takvimi](#/kilavuz/piyasa-baglami/takvim).
- **Olay sonucu** (73.9) — olay açıklanınca **sonuç**, olay başına bir kez: FOMC kararı (federalreserve.gov açıklamasından, birkaç dakika içinde: "Fed politika faizini %3,75–4,00 aralığında sabit bıraktı."), ABD TÜFE (FRED, açıklamadan sonraki 15 dakika içinde) ve Türkiye TÜFE (EVDS, veri orkestratörü güncelleyince): aylık ve yıllık değişim. Yalnız rakam; yorum ve öneri yok. **Bilanço sonuçları bu türde gelmez** — Bilanço özeti zaten gönderiyor (aynı şey iki kez gelmez). Sunucu 3 günden uzun kapalı kaldıysa eski olayların sonucu sonradan gönderilmez.
- **Sert fiyat hareketi** — varsayılan **BTCUSDT**, **60 dakikada ±%5**: son fiyat, son 60 dakikanın en düşük (yükselişte) ya da en yüksek (düşüşte) kapanışından eşik kadar uzaklaşınca. Aynı sembol ve yön için **6 saatte bir**. Semboller (en çok 10, Binance spot adıyla, ör. ETHUSDT), eşik, süre ve tekrar süresi ayarlanabilir. Yalnız bilgidir; botlar kendi kurallarıyla çalışır.

## Uyarılar ve ne yapmalı {#uyarilar}

- **Kapalı tür** gönderilmez ama kaybolmaz: son gönderilenler listesinde "kapalı olduğu için gönderilmedi" diye görünür, ayrıca [Günlükler](#/kilavuz/gunluk)'de de iz bırakır.
- **Geliştirme bilgisayarında hiçbir şey gitmiyor:** bilinçli. Sunucuya bağlı geliştirme kopyası (araştırma modu, `data/makine.json` ya da sunucu bağlantısı kurulu) Telegram'ı yoklamaz, Telegram'a ve ntfy'a mesaj göndermez — aynı bot jetonunu iki bilgisayar yoklarsa Telegram "409 çakışma" verir. Bildirimleri sunucu gönderir; bu sayfa geliştirme bilgisayarında sunucunun ayarlarını gösterir ve değişiklikleri sunucuya iletir (sunucu kapalıysa "sunucu açıkken kaydedilir" der).
- **"Gönderilemedi":** Telegram'a ulaşılamadı; bot bildirimleri giden kutusunda bekler ve internet dönünce sırayla gönderilir.
- Telefondan açıldığında sayfa yalnız görüntülenir.
- Aynı uyarı tekrarlanırsa belli aralıklarla bir kez gönderilir; tekrar eden hata sohbeti doldurmaz.
