# İleri test {#ileri-test}

## Ne işe yarar {#ne-ise-yarar}

"Canlı veride tutuyor mu?" Kuralları önceden kayda geçirilmiş stratejilerin, backtestte görmediği **yeni günlerde** nasıl davrandığını izler. Emir vermez. İki soruya cevap verir: **her şey yolunda mı** (alarm var mı) ve **sıradaki karar ne zaman**.

Yan menüde İleri test'in altında sekiz sayfa var (66.0; 73.1'de BIST temettü ve 2 haftalık momentum, 73.2'de Kairos-S gölgesi eklendi):

| Sayfa | Ne var |
|---|---|
| **Genel bakış** | **Testler** tablosu (her test, durumu ve karar günü; ada tıklayınca kendi sayfası açılır) + **Karar takvimi** (bütün karar ve kontrol günleri, bugünden başlayarak) |
| **Kairos / Tao simülasyonu** | Simülasyon kartı ve en derin düşüş grafikleri, yan denemeler (3 günlük karar, yatay piyasa filtresi) |
| **Kairos-S gölgesi** | Canlı hesaba geçecek 1000 $'lık Kairos-S'in emirsiz günlük gölgesi: kart + iki grafik ([aşağıda](#/kilavuz/ileri-test/hucum-s)) |
| **Bollinger düşüş azaltıcı** | Bollinger kartı ve BTC en derin düşüş grafiği |
| **876 gölge** | Kairos %90 + TVL L/S %10 gölge kartı ([aşağıda](#/kilavuz/ileri-test/g876)) |
| **EUR/USD CBDR** | Londra girişi gölge kartı ve birikimli R grafiği ([aşağıda](#/kilavuz/ileri-test/cbdr)) |
| **BIST temettü** | Temettü hak kullanım gecesi kâğıt kartı ([aşağıda](#/kilavuz/ileri-test/temettu)) |
| **2 haftalık momentum** | Kairos + %8,2 momentum kolu kâğıt kartı ([aşağıda](#/kilavuz/ileri-test/momentum)) |

Sayfanın üstündeki **ara rapor notu** her yerde geçerli: karar günlerine kadar yalnız izlenir, hüküm verilmez, kurala dokunulmaz. Her kart tek cümle, büyük durum, iki ana sayı ve karar günü gösterir; ayrıntı katlıdır.

**Demo kabul süreci** (Kairos demo hesabı, kabul raporu) 66.0'dan beri botun kendi sayfasında: **Botlar › Kairos › Yönetim**. Genel bakıştaki Testler tablosunda satırı durur, tıklayınca oraya gider (aşağıda [Demo kabul raporu](#/kilavuz/ileri-test/demo-rapor)).

## Ne zaman kullanılır {#ne-zaman}

- Ayda bir göz atmak için.
- Ana sayfa "modelin düşüş sınırı aşıldı" ya da bot "simülasyondan fazla ayrıldı" dediğinde.

## Ekran {#ekran}

![İleri test › Genel bakış — testler tablosu ve karar takvimi](ekran:ileri-test-1400)

![İleri test › Kairos / Tao simülasyonu — kart ve grafikler](ekran:ileri-hucum-1400)

## Grafikler {#grafikler}

| Grafik | Ne gösterir |
|---|---|
| Kairos / Tao simülasyonu — en derin düşüş | Modelin "olması gereken" eğrisinin o güne kadarki en derin düşüşü; kesikli çizgiler **uyarı eşiği** (sarı) ve **alarm eşiği** (kırmızı). Çizgi ne kadar aşağıdaysa o kadar iyi |
| Bollinger — BTC en derin düşüş | BTC'de mevcut kural (gri) ile Bollinger'li kural (yeşil) aynı günlerde |
| Yan denemeler — günlüğe göre fark | **3 günlük karar** ve **yatay piyasa filtresi** denemelerinin günlük kurala göre birikimli farkı (puan); sıfırın üstü = günlükten iyi |
| Demo kabul — uygulama sapması | 30 günlük gerçek ↔ simülasyon farkı; kesikli çizgiler %3 (incele) ve %5 (sınır — bot durur). Bot başlayınca dolar |
| EUR/USD CBDR — birikimli R | Her işlemin sonucu (R) üst üste eklenir; sıfırın üstü = başlangıçtan beri maliyet sonrası artıda. İlk işlemle dolar |
| Kairos-S gölgesi — en derin düşüş | Kairos-S ve Kairos simülasyonunun o güne kadarki en derin düşüşü (renkler grafiğin altında); kesikli çizgiler 1000 $ için önceden kayıtlı **uyarı** ve **alarm eşiği** |
| Birikimli getiri — Kairos-S / Kairos / BTC al-tut | Üç eğrinin başlangıçtan beri birikimli getirisi, aynı günlerde (BTC gri; sıfırın üstü = artıda) |

Seriler izleyici kayıtlarından gün gün çizilir ve 7 Ekim 2026'dan başlar; ilk haftalarda kısa görünmeleri normaldir. Grafikler yalnız betimler, karara girmez.

## Kartlar ve alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Durum | Eşiğin altında · Uyarı eşiği aşıldı · Alarm eşiği aşıldı · Ölçüm sürüyor · İzleyici hata verdi · Protokol başlamadı |
| Karar günü (eski adı hüküm tarihi) | Kararın verileceği gün: Kairos/Tao 90 / 182 / 365. gün (5 Ocak · 7 Nisan · 7 Ekim 2027), Bollinger 7 Ekim 2027 (olay yoksa 2028), demo kabul Gün 0 + 63 |
| Mevcut / Bollinger'li | Soldaki sayı mevcut kural, sağdaki Bollinger eklenmiş kural |
| Simülasyonun en derin düşüşü | Model eğrisinin ileri dönemdeki en derin düşüşü (eski adı gölge MaxDD); **uyarı eşiği** (eski p95) aşılırsa neden incelenir, **alarm eşiği** (eski p99) aşılırsa model geçersiz sayılır |
| Ayrıntı (katlı) | Simülasyon günü, sonraki kontrol, **3 günlük karar** (eski adı 3 günlük aday), **yatay piyasa filtresi** (eski adı D3 range vetosu: VR < 1 ve son 10 gün verimliliği < 0,30 iken yeni giriş yok; karar için en az 2 filtre günü + 10 farklı gün; karar 9 Ekim 2027, olay yetmezse 2028), **1000 $'lık Kairos alarm eşiği** (eski adı Kairos-S: 90 / 182 / 365 gün %34,0 / %41,7 / %50,3 — tutucu olarak Kairos simülasyonuna da uygulanır; 73.2'den beri Kairos-S'in kendi gölgesi ayrı sayfada, [aşağıda](#/kilavuz/ileri-test/hucum-s)) |
| Uygulama sapması | 30 günlük gerçek − simülasyon farkı; %3 altı normal, %3–5 incele, %5 üstü bot durur |

## Demo kabul raporu {#demo-rapor}

**Demo kabul — Kairos demo hesabı** kartı (66.0'dan beri **Botlar › Kairos › Yönetim**'de) içinde **Kabul raporu** bölümü var. Komut satırındaki
`node scripts/demo-kabul-rapor.js` ile **aynı hesabı** yapar (kod tek yerde: panel kendi başına hesaplamaz); yalnız okur,
hiçbir dosya yazmaz, internete çıkmaz. Rapor demo botun **sunucudaki** kayıtlarından dolar — bu (geliştirme) bilgisayarında
"**Gün 0 henüz yok — demo bot sunucuda; rapor orada dolar**" yazması normaldir.

![Demo kabul kartı ve kabul raporu — masaüstü](ekran:ileri-demo-1400)

![Demo kabul kartı ve kabul raporu — telefonda](ekran:ileri-demo-390)

**Bölümün satırları:**

| Satır | Anlamı |
|---|---|
| Gün N / 63 | Gün 0'dan (ilk günlük çalışma, 7 Ekim 2026 ya da sonrası) bu yana geçen gün; yanında **30. gün ara rapor** ve **63. gün hüküm** tarihleri |
| §8.2 kayıtları | Botun 64.0'dan beri yazdığı ayrıntı kayıtlarının (mutabakat, teminat, koruma stopu, alarm) başladığı gün. Kayıt Gün 0'dan geç başladıysa ölçütlerin yanında "kapsam N g" yazar — öncesi ölçülemez |
| Prova günlüğü | Elle yaptığınız tatbikatların kaydı (aşağıda); kaç zorunlu provanın kayıtlı olduğu |
| Sağ üstteki yazı | 63. güne kadar **"Ara rapor — hüküm yok"**. 63. günden sonra genel hüküm: GEÇTİ · İNCELE · GEÇMEDİ |

**Ara rapor ve hüküm:** 63. günden önce rapor yalnız betimler. Ölçütlerin durumu "**geçti bandında**", "**incele
bandında**", "**geçmedi bandında**" diye yazılır — "şu an bu aralıkta" demektir, karar değildir; genel hüküm hiç
gösterilmez. 63. gün dolunca aynı tablo büyük harfle **GEÇTİ / İNCELE / GEÇMEDİ** yazar ve genel hüküm çıkar. Eşikler
önceden kayda geçirildi, değişmez. **ÖLÇÜLEMEDİ** = o ölçüt için yeterli kayıt yok (ör. hiç rejim geçişi olmadı) —
hükümde 126. güne uzatılır, yalnız o ölçüt için. Getiri ve Sharpe hükme girmez.

**Ölçütler (sade anlamı):**

| Kod | Ölçüt | Ne ölçer |
|---|---|---|
| U1 | Simülasyondan sapma (30 g) | Demo hesabın 30 günlük getirisi, aynı günlerin simülasyonundan ne kadar ayrıldı. %3'e kadar normal |
| U2 | Sapma, funding farkı çıkarılmış | U1'in demo hesaba özgü BTC funding farkı çıkarılmış hâli; %5'i aşarsa sorun |
| U3 | Günlük büyük sapma | Bir günde 2 puandan büyük, nedeni açıklanamayan sapma kaç gün oldu |
| U4 | İşlem maliyeti | Piyasa emirlerinin kayması + ücret (bp = on binde bir). Modelin varsaydığı 7 bp'nin 1,5 katına kadar normal; en az 30 dolum gerekir |
| U5 | Ücret | Ödenen komisyon / işlem tutarı |
| U6 | Botun olmayan coinde funding | Botun pozisyonu olmayan bir coinden funding satırı gelmiş mi (hesapta başka bir şey var demektir) |
| U8a · U8b | Rejim geçişi / ay başı maliyeti | BTC ayağının girip çıktığı günlerin ve ayın 1'inin maliyeti, diğer günlere göre kaç kat |
| I1 | Defter ↔ borsa tutarlılığı | Botun kaydı ile borsadaki emir/pozisyon uyuşuyor mu; sonucu belirsiz emir, çift emir var mı |
| I2 | Botun kendini durdurması | Prova dışı ENGEL (bot güvenlik için durdu) sayısı |
| I3a · I3b | Hata alarmları | Nedeni açıklanamayan / prova günlüğünde açıklanmış alarm sayısı |
| I4a · I4b · I4c | Koruma stopu | Açık pozisyonların kaçında borsada koruma stopu vardı; stop kendiliğinden kayboldu mu; tetiklendiyse pozisyon düzgün kapandı mı |
| I5 | En yüksek teminat oranı | Kullanılan teminatın en yüksek oranı (%50 uyarı, %80 alarm) |
| I6 | Kaçırılan gün | Günlük çalışmanın yapılmadığı gün sayısı (≤ 3 ve kesintisiz bir 30 günlük aralık) |
| I7 | Zamanında çalışma | Günlük çalışmanın 00:02–00:30 UTC (03:02–03:30 TR) arasında başladığı günlerin oranı |
| I8 | Çökme | Prova dışında programın beklenmedik kapanma sayısı. 1 dakika içindeki ardışık kapanmalar **tek olay**; oturum kapanırken programın hiç açılamaması (çıkış kodu −1073741205) **sayılmaz**; Windows kapanışı / yeniden başlatma (çıkış kodu 1073807364 ve ardından denetleyicinin yeniden açılması) çökme değil, ayrı bilgi satırıdır |
| I9 | Verilmeyen küçük emir | Tutarı borsanın en küçük emir sınırının altında kaldığı için verilemeyen emir oranı. Payda yalnız bu sayının kaydedildiği günlerin emirleri. Satırdaki sabit not: **bilinen model–canlı farkı** — model zorunlu olmayan yeniden ölçeklemeyi %10 bant içinde yapmaz, canlı bot yapar (kullanıcı kararı 2026-10-19: test süresince değiştirilmedi); oranın bir kısmı bu farktan. Eşik ve hüküm aynı |
| G1 | Getiri / düşüş bandı (ikincil) | Getiri, en derin düşüş ve oynaklık önceden hesaplanmış aralıkta mı; yalnız düşüş alarm eşiğini aşarsa hükmü bozar. Botun **kendi değerinden** ölçülür (Genel görünümdeki "Bot değeri" ile aynı: sermaye tavanı + hesaptaki değişim, kayıtlı para yatırma/çekme düşülür) |

**Ayrıntı (katlı):** I2 (botun kendini durdurması), I3a (alarmlar) ve I8 (çökme) satırlarının altında katlı **Ayrıntı** vardır: I2 için her olayın zamanı (Türkiye saati), kaynağı ve metni; I3a için alarm türleri ve her alarmın zamanı; I8 için her olayın zamanı, çıkış kodu ve sınıfı (**çökme** · **sistem kapanışı** · **sayılmayan**). Son 50 olay gösterilir.

**U4 "ÖLÇÜLEMEDİ — prod mum referansı yok":** maliyetin kayma kısmı, Binance'in gerçek (demo olmayan) günlük açılış
fiyatına göre hesaplanır. Panel internete çıkmaz; bu fiyatları **sunucuda komut satırında bir kez**
`node scripts/demo-kabul-rapor.js --ag` çalıştırarak indirin (önbelleğe yazılır: `data/arastirma/demo-kabul-ref.json`).
Sonra panel önbelleği kendisi kullanır. Tam raporu dosyaya da yazmak için aynı komutu `--ag` olmadan çalıştırın
(`data/arastirma/demo-kabul-rapor-<gün>.json`).

**Prova günlüğü nasıl doldurulur:** provalar (koruma stopu tatbikatı, çökme, internet kesintisi, bilgisayar kapalı,
63. günden **sonra** acil durdurma denemesi; isteğe bağlı mutabakat provası) elle yapılır ve günlüğe yazılır — prova
saatleri ölçümden çıkarılır.

1. Sunucuda proje klasöründe **Komut İstemi**'ni (cmd — PowerShell değil: PowerShell'in `>` yönlendirmesi dosyayı
   okunamayan kodlamayla yazar) açıp: `node scripts/demo-kabul-rapor.js --prova-sablon > data\live\hucum-demo\prova-gunlugu.json`
2. Dosyayı Not Defteri ile açın. `provalar` listesine her prova için bir satır: `no` (1–6), `bas` ve `bit` (ör. `2026-10-20T12:00:00+03:00`),
   `adimlar`, `gozlenen`, `sure`, `hukum` (`geçti` / `geçmedi`). Şablondaki örnek satırları kendi kayıtlarınızla değiştirin.
3. Nedeni bilinen dış olayları (internet kesintisi, borsa bakımı, elle müdahale) `aciklamalar` listesine yazın
   (`olcut`, `gun`, `neden`): o olay "açıklanamayan" sayılmaz. Yazılı neden analizi yapılan İNCELE'ler `incelemeler`e.
4. Kaydedin; panel bir dakika içinde "Prova günlüğü: N / 5 zorunlu prova kayıtlı" gösterir.

## EUR/USD CBDR kartı {#cbdr}

**CBDR** (merkez bankası saatlerindeki dar aralık) = önceki iş gününün New York 14:00–20:00 arasındaki mum gövdelerinin en yüksek ve en düşüğü. Model ertesi sabah Londra açılışında (NY 02:00–04:00) fiyat bu aralığın bir boy dışına taşarsa **ters yönde** limit emirle girer; stop son 5 günün ortalama günlük aralığının üçte biri kadar uzakta, hedef aralığın iki boy ötesinde, en geç NY 11:00'de kapanır. Gün dar ve Asya gecesi sakin değilse işlem yoktur. **Emir verilmez** — yalnız "bugün olsaydı ne olurdu" kaydı tutulur (veri Binance EURUSDT, EUR/USD'ye çok yakın).

![EUR/USD CBDR kartı — masaüstü](ekran:ileri-cbdr-1400)

![EUR/USD CBDR kartı — telefonda](ekran:ileri-cbdr-390)

| Alan | Anlamı |
|---|---|
| İşlem sayısı | 15 Ekim 2026'dan beri dolan işlemler (yılda ~30–40 beklenir; çoğu gün limit dolmaz ya da koşul sağlanmaz) |
| Ortalama R | İşlem başına kâr/zarar, stop mesafesi biriminde (**R**); maliyet düşülmüş. Altında isabet = kârla kapanan işlemlerin oranı |
| Sıradaki gün | Canlı: aralık oluşuyor · gece bekleniyor · **koşul sağlandı** (alış/satış limiti, stop mesafesi, hedef) · koşul sağlanmadı (neden) · işlem açık · limit dolmadı |
| Karar günü | 15 Ekim 2027 (o güne kadar 25 işlem yoksa 15 Nisan 2028); ara kontrol 15 Nisan 2027 — ara kontrolde hüküm yok |

Karar ölçütü önceden yazıldı ve değişmez: ortalama R sıfırın üstünde **ve** isabet en az %25 → izlemeye devam / küçük sermayeyle canlı adayı; ortalama R −0,10 ve altı → ret; arası → bir yıl daha izlenir. Kayıt her gün 00:15 UTC sonrası yazılır; bir günün sonucu sonradan yeniden hesapta değişirse kart **"Yeniden hesap farklı"** uyarısı verir (kayıt değişmez).

## 876 gölge kartı {#g876}

**Ne:** 876, Binance vadeli coinlerini her ayın 1'inde DefiLlama'daki **kilitli değerlerinin (TVL) son 30 günlük değişimine** göre sıralar: en çok artanlar **long**, en çok azalanlar **short**; iki taraf eşit tutarda ve BTC'nin etkisi BTC ile dengelenir (piyasa yönünden bağımsız olmaya çalışır), sepet ay boyu tutulur. Geçmiş testte (2024–2026) nakdin yılda ~47 puan üstünde kaldı ama **en derin düşüşü %30,3** ile önceden yazılmış %25 sınırını aştığı için **elendi**. Bu kararla değişmedi.

**Gölge:** sizin kararınızla (17 Ekim 2026) kural **emirsiz** olarak yeni günlerde izlenir ve Kairos simülasyonuyla her gün **%90 Kairos + %10 876** olarak birleştirilir. Para yok, emir yok, borsa anahtarı yok — yalnız herkese açık veri (Binance günlük mumlar ve funding, DefiLlama TVL). Kuruluşlar **1 Kasım** ve **1 Aralık 2026**; **rapor günü 1 Ocak 2027** (31 Aralık kapanışından sonra).

![876 gölge kartı — masaüstü](ekran:ileri-876-1400)

![876 gölge kartı — telefonda](ekran:ileri-876-390)

| Alan | Anlamı |
|---|---|
| Bu ayın sepeti | O ayın kuruluşunda kaç coin long, kaç coin short (ör. "6 long · 6 short"); altında kaç coinde sinyal olduğu. Sinyalli coin 9'dan azsa o ay **boş ay (nakit)** |
| Bu ay (876) | 876 sepetinin bu ayki getirisi. Son gün için "bugün kapatılsa (maliyet dahil)" yazar: açık pozisyonlar o kapanıştan maliyetiyle kapatılmış sayılır; ertesi gün kesinleşir |
| Birlikte − Kairos | %90 Kairos + %10 876 birleşiminin getirisi ile yalnız Kairos'un getirisi arasındaki fark (puan) |
| Başlangıçtan beri (876) | 31 Ekim 2026 kapanışından bu yana 876'nın getirisi ve en derin düşüşü |
| En derin düşüş — birlikte / Kairos | Aynı günlerde birleşimin ve yalnız Kairos'un en derin düşüşü |
| Vazgeçme kuralı | Önceden yazıldı: 876'nın en derin düşüşü **−%20**'ye ulaşırsa ya da birleşimin düşüşü Kairos'unkinden **3 puandan fazla** kötüyse gölge o gün durur ve rapor yazılır (kart "Durduruldu" der) |
| Rapor günü | 1 Ocak 2027 — rapor yalnız ne olduğunu anlatır: aylık getiriler, nakde göre fark, BTC ile birlikte hareket (korelasyon), birlikte ↔ Kairos, veri tamlığı |

**İki ay istatistiksel kanıt değildir.** Kartta ya da raporda "işe yarıyor / yaramıyor" denmez; sayılar kabul, ret ya da canlı hesap kararı değildir. 1 Ocak 2027'de uzatma ya da canlı hesap kararını siz verirsiniz.

Kayıt sunucunun her gece çalışan ileri test işiyle yazılır (sunucuda ayrıca kurulacak bir şey yok); bu bilgisayarda kart sunucudaki kaydı gösterir. Sunucu bu sürüme henüz güncellenmediyse kart "876 gölge özeti alınamadı" der — güncelleme kurulunca düzelir.

## Kairos-S gölgesi kartı {#hucum-s}

**Ne:** canlı hesaba (5 Ocak 2027 kapısı) geçecek bot **Kairos-S**: Kairos'un **1000 $'lık küçük hesap** hali. BTC ayağı Kairos'la aynı; coin sepeti her ay başında 1000 $'a göre süzülür — borsanın en küçük emri (asgari tutar, miktar adımı) bu hesapla verilemeyen coinler o ay **dışarıda** kalır (örneğin BTC ve ETH vadelisi), kalanlara eşit pay verilir, DCA kademe sayısı küçültülür. Bu sayfa, canlı botun kullanacağı aynı kodu çağırarak kuralın **her gün emirsiz** nasıl davrandığını gösterir; önceden yalnız Kairos simülasyonu izleniyordu.

**Gölge:** başlangıç **7 Ekim 2026** (Kairos simülasyonuyla aynı gün; 7–23 Ekim arası kural donmuşken geriye dolduruldu), emir yok, para yok, borsa anahtarı yok. Her gün **Kairos-S**, **Kairos simülasyonu** ve **BTC al-tut** yan yana. Eşikler önceden kayıtlı (deneme 861, 1000 $ serisi). Kontroller **5 Ocak 2027** (90. gün — canlı hesap kapısıyla aynı gün), **7 Nisan 2027** (182. gün), **7 Ekim 2027** (365. gün, BTC al-tut kıyası).

![Kairos-S gölgesi kartı — masaüstü](ekran:ileri-hucum-s-1400)

| Alan | Anlamı |
|---|---|
| Kairos-S gölgesi en derin düşüş | Gölgenin başlangıçtan beri en derin düşüşü; altında o ana en yakın ufkun (90 / 182 / 365 gün) **uyarı** ve **alarm eşiği** |
| Getiri — Kairos-S / Kairos / BTC | Üçünün aynı günlerdeki birikimli getirisi |
| Bu ayın sepeti (1000 $ kuralı) | Bu ay alınabilen coin sayısı / evren; özsermaye, en küçük emir sınırı, dışarıda kalanlar, DCA kademe sayısı |
| Kairos simülasyonu en derin düşüş (aynı eşik) | Aynı 1000 $ eşiği tutucu olarak Kairos simülasyonuna da uygulanır |
| BTC al-tut en derin düşüş | Kıyas için |
| Kontrol noktaları | Üç kontrolün durumu: bekliyor · tutarlı · uyarı · veri yetersiz |

Kontrol kuralı önceden yazıldı: 90 / 182 / 365. günde getiri alt sınırın üstünde **ve** en derin düşüş uyarı eşiğinin altında → **tutarlı**; değilse **uyarı** (neden aranır, kural değişmez). **Her an:** en derin düşüş alarm eşiğini aşarsa model geçersiz sayılır — canlı hesap Kairos-S'le açılmaz (çalışıyorsa durdurulur). Kairos-S ya da Kairos simülasyonundan biri alarmdaysa alarm sayılır. Kontroller arasında hüküm yok.

> **Not:** Bu gölge model düzeyindedir: emir yuvarlama ayrıca simüle edilmez; çekilebilir USDT sınırı ve "açık DCA varken kademe değişmez" kuralı hesabın durumunu ister, gölgede yoktur (geçmiş ölçümde etkisi yılda yaklaşık −0,3 puan). Bir günün Kairos simülasyonu ya da coin mumları eksikse o gün **yetersiz** sayılır ve sonraki çalışmada tamamlanır.

Kayıt sunucunun her gece çalışan ileri test işiyle yazılır (Kairos simülasyonundan hemen sonra; sunucuda ayrıca kurulacak bir şey yok). Sunucu bu sürüme henüz güncellenmediyse kart "Kairos-S gölgesi özeti alınamadı" der — güncelleme kurulunca düzelir.

## BIST temettü kartı {#temettu}

**Ne:** BIST'te nakit temettü dağıtan bir hisse, **hak kullanım günü** (temettünün fiyattan düştüğü gün) açılışta genellikle temettü kadar düşmez. Kural: hak kullanım gününden önceki işlem günü **kapanışta al**, hak kullanım günü **açılışta sat** — bir gece tutulur, temettü (%15 stopajla, 2 iş günü sonra) alınır. Evren: her ay, bir önceki ay sonundaki 63 günlük medyan TL cirosuna göre ilk 50 hisse. Geçmiş testte (deneme 585, 2012–2026) beş ölçütün hepsini sağladı; BIST rafa kaldırıldığı için benimsenmemişti.

**Gölge:** sizin kararınızla (23 Ekim 2026) kural **emirsiz, kâğıtta** izlenir. Para yok, emir yok. Temettü takvimi İş Yatırım şirket kartlarındaki **duyurulmuş** temettülerden okunur; bir olay ancak al gününden önce **18:00'den önce** takvimde görüldüyse sayılır (sonradan görülenler kayda yazılır ama sayılmaz). İlk hak kullanım günü **26 Ekim 2026**; ara kontrol **26 Nisan 2027**; **karar 26 Ekim 2027** (30 olay yoksa 2028).

![BIST temettü kartı — masaüstü](ekran:ileri-temettu-1400)

| Alan | Anlamı |
|---|---|
| Önceden bilinen olay | Sayılan olay sayısı (al gününden önce duyurulmuş, hacim sınırı içinde); altında gece sayısı ve sonradan görülenler |
| Olay başına ortalama (net) | Maliyet sonrası ortalama getiri. Ana maliyet: Midas komisyonu 0, model tek yön %0,10 + %0,05 kayma (gidiş-dönüş %0,30). Altında geçmiş testin Midas senaryosuyla (gidiş-dönüş %0,02) aynı ortalama |
| Sıradaki olay | Evrendeki en yakın duyurulmuş temettü: hangi gün kapanışta alınır, hangi gün açılışta satılır, brüt TL ve yaklaşık oranı |
| Birikimli (gece zinciri) | Aynı gecenin olaylarına eşit pay verilerek zincirlenen getiri ve en derin düşüşü |
| Vazgeçme kuralı | 15 olaydan sonra ortalama −%0,30 ve altı, ya da gece zinciri düşüşü −%10 → gölge durur |

> **Not:** Kâğıtta kapanış seansı ve açılış seansı fiyatı kullanılır. Midas'ta açılış/kapanış seansına emir verilebildiğini **siz doğruladınız (24 Ekim 2026)**; maliyet modeli (tek yön %0,10 + %0,05 kayma) de sizin onayınızla aynen kaldı. Kural ve karar ölçütü değişmedi.

Karar ölçütü önceden yazıldı: en az 30 olayda ortalama net sıfırın üstünde **ve** t ≥ 1,5 → izlemeye devam / küçük sermayeyle elle uygulama adayı; ortalama sıfır ve altı → ret; arası → bir yıl daha. Ayrıntıdaki "kaynak sağlığı" satırı son çalışmada Yahoo ve İş Yatırım'dan kaç isteğin başarılı olduğunu söyler.

## 2 haftalık momentum kartı {#momentum}

**Ne:** her **pazar** kapanışında Binance vadeli coinlerinden son 30 günün işlem hacmine göre ilk 30 alınır; son **14 günde en çok yükselen 6 coin alınır**, **en çok düşen 6 coin açığa satılır** (iki taraf eşit tutarda), **iki hafta** tutulur (her pazar sepetin yarısı yenilenir). Bu "kol" Kairos'a **%8,2** payla eklenir. Geçmiş testte (deneme 566) zayıf da olsa geçti ama kârın çoğu 2026 ve birkaç coin pompasından geldiği için "doğrulamadan canlıya bağlanmaz" denmişti.

**Gölge:** sizin kararınızla (23 Ekim 2026) kural **emirsiz, kâğıtta** izlenir; her gün **Kairos + %8,2 × kol** ile **yalnız Kairos** yan yana. Para yok, emir yok, borsa anahtarı yok (Binance herkese açık mum ve fonlama verisi). İlk ölçüm günü **26 Ekim 2026**; ara kontrol **26 Nisan 2027**; **karar 25 Ekim 2027** (300 gün yoksa 2028).

![2 haftalık momentum kartı — masaüstü](ekran:ileri-momentum-1400)

| Alan | Anlamı |
|---|---|
| Bu haftanın sepeti | Son pazar seçimi: alınan ve açığa satılan coinler |
| Kol (tek başına) | Kolun başlangıçtan beri getirisi, en derin düşüşü ve yıllık Sharpe'ı (yalnız betimleyici) |
| Birlikte − Kairos | Kairos + %8,2 kol ile yalnız Kairos arasındaki getiri farkı (puan) |
| En derin düşüş — birlikte / Kairos | Aynı günlerde iki eğrinin en derin düşüşü |
| Kairos ile ilişki | Günlük getirilerin korelasyonu (karar ölçütü 0,3'ün altı) |
| Vazgeçme kuralı | Kolun en derin düşüşü −%50'ye ulaşırsa ya da birlikte düşüş Kairos'unkinden 3 puandan fazla kötüyse gölge durur |

Karar ölçütü önceden yazıldı: kol Sharpe 0,5'in üstü, birlikte ≥ Kairos, birlikte düşüşü Kairos'unkinden en çok 2 puan kötü ve ilişki 0,3'ün altı → küçük bindirme adayı (karar sizin); kol Sharpe sıfır ve altı ya da birlikte Kairos'un 2 puan altında → ret; arası → bir yıl daha. Aday olmak canlıya bağlanmak değildir.

İki kartın kaydı da sunucunun her gece çalışan ileri test işiyle yazılır (sunucuda ayrıca kurulacak bir şey yok); bu bilgisayarda kartlar sunucudaki kaydı gösterir. Sunucu bu sürüme henüz güncellenmediyse kart "özeti alınamadı" der — güncelleme kurulunca düzelir.

## Uyarılar ve ne yapmalı {#uyarilar}

> **Uyarı:** Karar gününden önce sayıları "geçti/kaldı" diye yorumlamayın ve kuralı değiştirmeyin; bu, ölçümü geçersiz kılar.

- **Alarm eşiği aşıldı:** önceden kayda geçirilmiş izleme kuralı tetiklendi — botu durdurup durdurmamak sizin kararınız; kartın ayrıntısını okuyun.
- **Demo kabul "Protokol başlamadı":** sunucuda **Botlar › Kairos › Yönetim**'de hesap türü **demo**, sonra **Genel** görünümünde **Başlat**. İlk günlük çalışma Gün 0 olur.
- **"İzleyici hata verdi":** genelde internet; 15 dk sonra kendisi yeniden dener. Kalıcıysa sunucuda `npm run ileri:izle`.
- İzleyiciler sunucu açılışından 1 dk sonra ve her gün 00:15 UTC sonrası çalışır; kayıtlar `data/ileri/` altında (git dışı — [yedekleyin](#/kilavuz/kurulum/adim-20)).
- "Satır sonradan yazıldı" notu: izleyici o gün çalışmadıysa satır ertesi çalışmada tamamlanır; karar o günün verisiyle yazılır, değişmez.
