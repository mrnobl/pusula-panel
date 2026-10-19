# İşlem defteri {#islem-defterim}

**Portföy › İşlem defteri** bütün işlem geçmişlerinin tek sayfasıdır. Sayfanın üstündeki **Kaynak** seçicisi üç defter arasında geçer (veriler ayrı kalır, aynı para iki kez sayılmaz):

| Kaynak | Ne |
|---|---|
| **Kripto / FX** (varsayılan) | Senin **kendi** kripto ve FX işlemlerin: OKX ve Binance (salt okuma bağlantısıyla her gün kendiliğinden ya da dosyayla) ve MetaTrader 4/5 — kârı, ücreti, fonlaması, aylık sonucu ve grafikleriyle. Bu bölümün geri kalanı bu defteri anlatır (eski adı "İşlem defterim") |
| **Yatırım (Portföyüm)** | Hesaplar'a girdiğin işlemlerin defteri: süzgeç, iptal, CSV dışa aktarma ([İşlem defteri › Yatırım](#/kilavuz/portfoyum/islem-defteri)) |
| **Bot** | Botların (Hücum, Denge) borsadaki hesaplarında yapılan bütün işlemlerin **dökümü (CSV)**: hesap, kimin yaptığı (Hücum / Denge / Elle / Acil fren) ve tarih aralığı seçilip indirilir. Son 30 günün tablosu ve açık pozisyonlar botun kendi sayfasında: **Botlar › Hücum › İşlemler**, **Denge › İşlemler**, **Hücum › Hesap** (düğmeleri kartta) |

Telegram'a hiçbir şey gitmez. Kripto borsalarının (Binance, OKX) **bakiyesi** salt okuma anahtarıyla okunup Pano toplamına eklenir ([Pano](#/kilavuz/portfoy/pano)).

## Ne işe yarar {#ne-ise-yarar}

- **Hepsi bir arada:** OKX ve Binance (dosya ya da salt okuma bağlantısı) ve MetaTrader raporları aynı ekranda, dolar cinsinden.
- **Gerçek sonuç:** gerçekleşen kâr − ücretler + fonlama + swap = **net kâr/zarar**. Para yatırma/çekme sonucu değiştirmez.
- **Grafikler:** birikimli net kâr/zarar, tepeden düşüş, aylık çubuklar ve yıl × ay tablosu; sembole tıklayınca fiyat grafiği üstünde alım ▲ / satım ▼ işaretlerin.
- **İstatistik:** sembol başına işlem sayısı, kazanma oranı, ortalama kazanç/kayıp, kâr faktörü, işlem başı ortalama, en büyük kayıp; uzun ↔ kısa ayrımı; MetaTrader'da tutma süresi.
- **Kayıt hiç bozulmaz:** satırlar yalnız eklenir; yanlış yükleme **Geri al** ile etkisiz olur (silinmez).

## Ne zaman kullanılır {#ne-zaman}

- İlk kurulumda bir kez: hesapları aç, eski dosyaları yükle (Binance geçmişi, OKX'in son bir yılı, MetaTrader raporu).
- Sonra: OKX ya da Binance salt okuma anahtarı kayıtlıysa her gün kendiliğinden güncellenir — Binance'ten bir daha dosya indirmen gerekmez; anahtar yoksa ayda bir dosya yükle. MetaTrader'da işlem yaptıkça raporu yeniden kaydedip yükle — eski satırlar **çift sayılmaz**, yalnız yeniler eklenir.
- "Bu ay işlemlerim kazandırdı mı, ücrete ne ödedim, hangi coinde/paritede kaybediyorum?" sorusunda.

## Ekran {#ekran}

![Portföy › İşlem defteri › Kripto / FX — sayılar, birikimli kâr/zarar, aylık sonuç](ekran:islem-defterim-1400)

Yukarıdan aşağıya:

1. **Kaynak** seçici (Kripto / FX · Yatırım · Bot), **Hesap** seçici (Bütün hesaplar ya da tek hesap), **Yenile**. Tutarları gizlemek için üst çubuktaki **Gizli** ([Görünüm](#/kilavuz/portfoy/gorunum)).
2. **Sayılar:** net kâr/zarar · gerçekleşen kâr · ücret/komisyon · fonlama + swap · işlem sayısı ve kazanma oranı · kâr faktörü ve işlem başı ortalama · en derin düşüş · para girişi/çıkışı (performansa girmez). Altında ek ölçütler ([Ek ölçütler](#/kilavuz/islem-defterim/ek-olcutler)).
3. **Birikimli kâr/zarar** grafiği (para hareketi biliniyorsa **Bakiye** düğmesi de çıkar) ve altında **tepeden düşüş**.
4. **Aylık kâr/zarar:** çubuklar + yıl × ay tablosu (işlemin kapandığı aya göre).
5. **Sembollere göre** tablo — sütun başlığına tıklayıp sırala; **sembolün adına tıkla**: fiyat grafiği ve işlemlerin.
6. **Uzun / kısa** tablosu ve MetaTrader **tutma süresi** (ortalama, ortanca, en kısa/uzun, kazanan/kaybedenlerde).
7. **İşlemler** listesi: süzgeç (sembol, tarih, yön, tür, kaynak), sayfa sayfa; satırdaki **İptal** o tek satırı etkisiz yapar.
8. **Hesaplar** (hesap aç, kapat; MetaTrader için sunucu saati — sabit fark ya da otomatik yaz/kış; OKX ve Binance için salt okuma anahtarı ve **Şimdi eşitle**), **Dosya yükle** (önizleme → Kaydet) ve **Yükleme geçmişi** (Geri al).

![Sembol tablosu, fiyat grafiği ve işlem listesi](ekran:islem-defterim-sembol-1400)

![Dosya yükleme önizlemesi ve yükleme geçmişi](ekran:islem-defterim-yukle-1400)

![İşlem defteri telefonda (yalnız izlenir)](ekran:islem-defterim-390)

### Ek ölçütler ve işlem skoru {#ek-olcutler}

Sayıların altındaki **yeni** göstergeler:

| Gösterge | Ne söyler |
|---|---|
| **Gün kazanma %** | İşlem yaptığın günlerin kaçı kârla kapandı (kârlı gün / işlem günü) |
| **Ücret ÷ brüt kâr** | Komisyonun kârın ne kadarını yediği |
| **Seriler** | En uzun kazanç ve kayıp serisi (işlem sayısı), şu anki seri |
| **Toparlanma faktörü** | Net kâr/zarar ÷ en derin düşüş — düşüşün kaç katını geri kazandın |
| **İşlem skoru** | 0–100; altı eksenin ağırlıklı ortalaması (TradeZella ağırlıkları) |
| **Gün × saat ısı haritası** | Haftanın günü × 4 saatlik dilim (yerel saat) net kâr/zarar: hangi gün ve saatte kaybediyorsun? |

İşlem skorunun eksenleri ve ağırlıkları:

| Eksen | Ağırlık | 100 puan |
|---|---|---|
| Kâr faktörü | %25 | 2,6 ve üstü |
| Ort. kazanç / kayıp | %20 | 2,6 ve üstü |
| Düşüş | %20 | düşüş yok (düşüş, yatırılan paranın ya da brüt kârın yarısına ulaşınca 0) |
| Kazanma % | %15 | %60 ve üstü |
| Toparlanma | %10 | toparlanma faktörü 3 ve üstü |
| Tutarlılık | %10 | kâr tek bir güne dayanmıyor (en iyi günün net kâra payı ne kadar küçükse o kadar yüksek) |

Veri yetmeyen eksen ağırlıktan düşer.

**Kayıtların tek yeri sunucudur.** Telefondan yalnız bakılır. Geliştirme bilgisayarı kayıtları sunucudan okur; **yazma jetonu** kuruluysa ([Kurulum › Adım 25](#/kilavuz/kurulum/adim-25)) orada yaptığın hesap, yükleme, geri alma ve iptal **sunucuya gönderilir** — bant "Değişiklikler sunucuya gönderilir" der. Yazma jetonu yoksa bant nasıl açılacağını yazar ve düğmeler kapalıdır.

### Geliştirme bilgisayarından yazmak: sunucu kapalıysa kuyruk {#ev-kuyruk}

- Sunucu kapalıyken (ya da Tailscale bağlı değilken) yaptığın değişiklik **kuyruğa** girer: "Sunucu kapalı: N değişiklik kuyrukta" bandı ve altındaki **Kuyruk** bölümü (zaman, ne yapıldığı, durum). Sunucu açılınca **aynı sırayla** kendiliğinden gönderilir (her dakika ve her yeni değişiklikten sonra); **Şimdi gönder** hemen dener. Kuyrukta bekleyen varken yeni değişiklik de sıraya girer, öne geçmez.
- Sunucunun kabul etmediği bir değişiklik (ör. aynı adla ikinci hesap) silinmez: Kuyruk'ta **"kabul edilmedi"** ve sunucunun nedeniyle kalır; **Kuyruktan çıkar** ile kaldırıp doğrusunu yeniden girersin. Bekleyen (henüz gönderilmemiş) değişiklik sıra bozulmasın diye çıkarılmaz.
- **Önizleme** sunucu açıkken sunucuda yapılır (gerçek çift sayıları). Sunucu kapalıysa dosya geliştirme bilgisayarında okunur ve önizleme "Sunucu kapalı — çift denetimi sunucu açılınca yapılır; satır sayıları değişebilir" uyarısıyla gelir; **Kaydet** kuyruğa girer, sunucu açılınca sunucuda zaten olan satırlar yine eklenmez.
- Bağlantı koptuğu için aynı değişiklik iki kez gönderilirse sunucu ikincisini **uygulamaz** (her değişikliğin kimliği vardır).
- **OKX ve Binance:** geliştirme bilgisayarının **kendi** salt okuma anahtarı olur (aynı Read-izin denetimi; anahtar o bilgisayarda kalır, sunucuya gitmez). Orada **Şimdi eşitle** borsadan çeker ve satırları sunucuya gönderir (sunucu kapalıysa kuyruk); sunucu çiftleri atlar. Binance spot tam taraması geliştirme bilgisayarında her **Şimdi eşitle**'de kaldığı yerden sürer (kartta "devam etmek için yeniden Şimdi eşitle"). **Her gün kendiliğinden eşitleme yalnız sunucuda** (sunucuda da anahtar kayıtlıysa) — geliştirme bilgisayarında yalnız elle.

## Adım adım {#adim-adim}

### OKX'ten salt okuma API anahtarı nasıl alınır (yalnız Read izni) {#okx-anahtar}

İsteğe bağlıdır; yalnız dosya yükleyerek de kullanabilirsin. Anahtar varsa OKX son 3 ayın işlemlerini ve fonlamasını her gün kendiliğinden verir.

1. OKX web sitesinde oturum aç → sağ üstte profil simgesi → **API** (ya da "API yönetimi").
2. **API anahtarı oluştur** (Create API key) → amaç olarak **API trading** seçili kalabilir.
3. Ad ver (ör. "Pusula salt okuma"). **Passphrase** belirle ve bir yere not et — OKX bunu sonra göstermez. Passphrase'te yalnız İngilizce harf, rakam ve klavye işaretleri kullan (Türkçe harf ya da satır sonu içeren parola Pusula'da kabul edilmez).
4. **İzinler:** yalnız **Read** (Okuma) işaretli olsun. **Trade** ve **Withdraw** işaretli OLMASIN. Pusula Trade, Withdraw ya da tanımadığı başka bir izni olan anahtarı **reddeder** ve kaydetmez (yalnız "read_only" kabul edilir).
5. IP kısıtı isteğe bağlı (sunucunun sabit IP'si yoksa boş bırak).
6. OKX'in gösterdiği **API Key** ve **Secret Key**'i kopyala (Secret bir kez gösterilir).
7. Sunucuda Pusula'yı aç → **Portföy › İşlem defteri** (Kaynak: Kripto / FX) → Hesaplar → OKX hesabının kartında API Key, Secret Key, Passphrase → **Anahtarı dene ve kaydet**. Pusula önce OKX'e "bu anahtarın izinleri ne?" diye sorar; yalnız okuma ise kaydeder ve kartta **"Salt okuma anahtarı kayıtlı ✓ · izinler: read_only"** yazar. OKX izinleri bildirmezse "yalnız okuma izinli olduğunu doğruladım" kutusu istenir.
8. **Şimdi eşitle** ile ilk eşitlemeyi yap. Sonra her gün kendiliğinden (sunucu açıkken). Her eşitleme kaldığı yerden devam eder: yalnız yeni satırlar istenir; çok satırlı hesapta bir eşitlemede bitmeyen kısım sonrakinde gelir (kartta yazar).
9. Eşitleme, işlemlerin yanında OKX'in **teslim**, **tasfiye (liquidation)** ve **ADL** kâr/zararını, tasfiye ücretini ve **faiz** kesintisini de alır. Pusula'nın tanımadığı bir hareket türü gelirse kartta "işlenmeyen hareket türleri atlandı: tür … (adet)" yazar — o satırlar performansa girmez.

Anahtar `data/secrets.json` içinde durur; panele, telefona, Telegram'a hiç gitmez. Vazgeçersen kartta **Anahtarı sil**, OKX'te de anahtarı sil.

### Binance'ten salt okuma API anahtarı nasıl alınır (yalnız "Okumayı etkinleştir") {#binance-anahtar}

İsteğe bağlıdır ama önerilir: anahtar kayıtlıysa Binance'teki **spot işlemlerinin bütün geçmişi**, vadeli işlemlerin ve fonlaman her gün kendiliğinden gelir — Binance'ten dosya indirmen gerekmez. Bu anahtar **botun anahtarından ayrıdır** (botun Binance bağlantısına dokunulmaz).

1. Binance web sitesinde oturum aç → sağ üstte profil simgesi → **Hesap → API Yönetimi** (API Management).
2. **API oluştur** (Create API) → anahtar türü **Sistem tarafından oluşturulan** (System generated) → ad ver (ör. "Pusula salt okuma") → güvenlik doğrulaması.
3. **İzinler:** yalnız **Okumayı etkinleştir** (Enable Reading) işaretli kalsın. **Spot ve marjin işlemi**, **Vadeli işlemler** (Enable Futures), **Marjin**, **Çekimleri etkinleştir**, **Evrensel aktarım**, **Opsiyon** ve diğerleri işaretli OLMASIN. Pusula önce Binance'e "bu anahtarın izinleri ne?" diye sorar (`apiRestrictions`); okuma dışında **herhangi bir izin** açıksa — Binance'in ileride ekleyeceği tanımadığı bir izin dahil — anahtarı **reddeder ve kaydetmez**.
4. **IP kısıtı önerilir:** "Yalnızca güvenilir IP'lere erişimi kısıtla" seçip sunucunun dış IP adresini yaz (sunucunun IP'si sabit değilse kısıtsız bırakabilirsin — anahtar zaten yalnız okur). IP kısıtı açıksa kartta "izinler: okuma, IP kısıtlı" yazar.
5. Binance'in gösterdiği **API Key** ve **Secret Key**'i kopyala (Secret bir kez gösterilir).
6. Sunucuda Pusula'yı aç → **Portföy › İşlem defteri** (Kaynak: Kripto / FX) → Hesaplar → Binance hesabının kartında **API Key**, **Secret Key** → **Anahtarı dene ve kaydet**. Yalnız okuma ise kaydeder ve kartta **"Salt okuma anahtarı kayıtlı ✓ · izinler: okuma"** yazar.
7. Kayıtta Pusula vadeli okumayı da bir kez dener ve kartta yazar: **"vadeli okuma: Binance kabul etti ✓"** ya da **"vadeli okuma için Binance bu anahtarı kabul etmedi: …"** (Binance'in cevabıyla). Binance'in salt okuma anahtarıyla vadeli geçmişi verip vermediği belgede açık değil; vermezse spot yine eşitlenir, vadeli geçmiş dosyayla yüklenir — vadeli izni AÇMA.
8. **Şimdi eşitle** ile ilk eşitlemeyi yap. İlk eşitleme birkaç dakika sürebilir:
   - **Vadeli:** son 6 ayın işlemleri (kârı ve ücretiyle) ve son 3 ayın fonlama / aktarım / gerçekleşen kâr hareketleri. Daha eskisi (ör. 2021–2026 dosyaların) dosyadan kalır; aynı işlem iki kez sayılmaz.
   - **Spot:** Binance hangi coinlerde işlem yaptığını söylemediği için Pusula ilk seferde bütün çiftleri tek tek sorar (USDT, USDC, FDUSD, BTC, BNB, TRY ile işlem gören ~1 600 çift). Bu, Binance'in dakikalık sınırına uymak için **birkaç eşitlemeye bölünür**; kartta **"spot tam tarama: 412 / 1630 çift"** gibi ilerleme yazar. Sunucu her saat kaldığı yerden sürdürür (yaklaşık 4–5 saatte biter); hemen istersen **Şimdi eşitle (taramaya devam)**'a birkaç kez bas. Bittikten sonra yalnız işlem yaptığın ve bakiyen olan çiftler sorulur; 30 günde bir tam tarama yenilenir.
9. Sonra her gün kendiliğinden (sunucu açıkken). Her eşitleme kaldığı yerden devam eder.

Anahtar `data/secrets.json` içinde (OKX anahtarının yanında) durur; panele, telefona, Telegram'a, günlüğe hiç gitmez. Vazgeçersen kartta **Anahtarı sil**, Binance'te de anahtarı sil.

### OKX ve Binance dosyası nasıl indirilir {#csv-indir}

**OKX** (son 3 aydan eskisi için gerekli; 1 yıla kadar):

1. OKX → **Varlıklar (Assets) → Emir merkezi (Order center)** → **Emir geçmişi (Order history)**.
2. **İndir (Download)** → rapor türü **Trading history** (işlem geçmişi), biçim **CSV**, tarih aralığını seç.
3. Hazırlanınca indirme bağlantısını aç (bağlantı 1 saat geçerli). İnen CSV'yi Pusula'da OKX hesabına yükle.

**Binance** (salt okuma anahtarı varsa gerekmez; anahtarsız kullanım, API'nin vermediği eski vadeli dönem ya da artık listede olmayan — delist — spot çiftler için):

1. Binance → **Emirler (Orders)** → **Spot emri** → **İşlem geçmişi (Trade History)** → **Dışa aktar (Export)** → tarih aralığı (bir dosyada en çok 1 yıl kadar).
2. Vadeli işlemler için: **Emirler → Vadeli (USDⓈ-M)** → **İşlem geçmişi (Trade History)** → Dışa aktar; ayrıca **İşlem hareketleri (Transaction History)** → Dışa aktar (fonlama, gerçekleşen kâr, aktarımlar buradan gelir).
3. Binance dosyayı **Excel (XLSX)** olarak verirse: Excel'de aç → **Farklı kaydet → CSV UTF-8 (virgülle ayrılmış)** → o CSV'yi yükle. (Pusula XLSX okumaz; uyarı verir.)
4. Aynı dönemin "Trade History" ve "Transaction History" dosyalarını birlikte yüklemek güvenlidir: aynı saniyedeki **kâr (REALIZED_PNL)** ve **komisyon (COMMISSION)** satırları işlemle aynı şey sayılır, **iki kez sayılmaz**. Tasfiye ücreti (LIQUIDATION_FEE, INSURANCE_CLEAR) ve iadeler işlemle aynı saniyede olsa da ayrıca sayılır.

### MetaTrader 4 / 5'ten rapor nasıl kaydedilir {#mt-rapor}

**MetaTrader 4:** Terminal penceresi → **Hesap Geçmişi (Account History)** sekmesi → sağ tık → **Tüm geçmiş (All History)** → yeniden sağ tık → **Ayrıntılı Rapor Olarak Kaydet (Save as Detailed Report)** → `statement.htm` dosyasını Pusula'da MT4 hesabına yükle.

**MetaTrader 5:** Araç kutusu → **Geçmiş (History)** sekmesi → sağ tık → dönem **Tüm geçmiş** → sağ tık → **Rapor → HTML** (ya da "Rapor → Genel bakış" ekranından HTML olarak kaydet) → `ReportHistory-<hesap>.html` dosyasını MT5 hesabına yükle.

Pusula raporun **Kapanmış işlemler / Positions** tablosunu ve **balance/credit** (para yatırma, çekme, kredi) satırlarını alır; açık işlemler ve bekleyen emirler alınmaz. Raporu her güncellediğinde yeniden yükleyebilirsin: aynı bilet (ticket/position) numarası ikinci kez eklenmez.

### Sunucu saat farkı (MetaTrader) {#sunucu-saati}

MetaTrader raporundaki saatler **aracı kurumun sunucu saatidir**, UTC değil. Çoğu aracı kurum kışın **UTC+2**, yazın **UTC+3** kullanır (gece yarısı = New York 17:00); bazıları UTC ya da başka bir fark kullanır. Pusula saatleri dosyadaki gibi saklar ve hesabın **Sunucu saati** ayarını okurken uygular:

- Hesaplar › MetaTrader hesabının kartında **Sunucu saati** seçimi:
  - **Sabit fark** (varsayılan): yanındaki **Sabit fark (saat)** kutusuna yazdığın fark her işleme uygulanır → ör. `2` ya da `3` → **Kaydet**.
  - **Otomatik: kışın +2, ABD yaz saatinde +3**: çoğu aracı kurumun kuralı. ABD yaz saati dönemi (Mart'ın 2. pazarı – Kasım'ın 1. pazarı) içindeki işlemlere +3, dışındakilere +2 uygulanır; yaz/kış geçişinde ayarı değiştirmen gerekmez. Sabit fark kutusu bu seçimde kullanılmaz.
- Varsayılan sabit **0**'dır ve ekranda "sunucu saat farkı 0 kabul ediliyor" uyarısı çıkar (Otomatik seçilince uyarı kalkar). Farkı bilmiyorsan: MetaTrader'daki "Piyasa Gözlemi" saatine bak, bilgisayarının UTC saatiyle karşılaştır.
- Fark yalnız saatleri kaydırır; kâr/zarar değişmez, ama gün ve ay sınırına yakın işlemler yanlış güne/aya düşebilir.

### Yanlış yüklemeyi geri alma {#geri-alma}

- **Yükleme geçmişi** tablosunda o satırın **Geri al** düğmesi: o yüklemenin bütün satırları etkisiz olur. Satırlar silinmez (ters kayıt); geri alma kendisi geri alınamaz, ama doğru dosyayı yeniden yükleyebilirsin.
- Tek bir yanlış satır için: **İşlemler** listesinde o satırın **İptal** düğmesi.
- Geri aldığın ya da iptal ettiğin satırlar **kendiliğinden geri gelmez**: OKX günlük eşitlemesi onları yeniden eklemez; aynı dosyayı yeniden yüklersen önizlemede "… satır daha önce geri alınmış ya da iptal edilmiş — eklenmeyecek" yazar. Bilerek geri istiyorsan önizlemedeki **"Daha önce geri aldığım / iptal ettiğim … satırı bilerek yeniden ekle"** kutusunu işaretle (önizleme yenilenir), sonra **Kaydet**.
- **OKX dosyasını** geri alınca o hesabın OKX eşitlemesi bir sonraki sefer son 3 ayı **baştan tarar** (kartta yazar): dosyayla çift olduğu için atlanan işlemler bağlantıdan yeniden gelir.
- **Binance dosyasını** geri alınca da aynı: sonraki eşitleme vadelide 6 ayı, spotta bilinen çiftleri baştan tarar. Geri alma yalnız o dosyadan gelen satırları etkisiz yapar; aynı işlem bağlantıdan yeniden gelebilir. Tek satırı **İptal** edersen o işlem hiçbir kaynaktan geri gelmez.
- Yanlış hesaba yükleme çoğu zaman engellenir: dosya türü hesabın türüne uymuyorsa (ör. OKX dosyası MetaTrader hesabına) Pusula yüklemez; MetaTrader raporunun para birimi hesabınkinden farklıysa önizlemede uyarır.

## Alanlar {#alanlar}

| Alan | Ne demek |
|---|---|
| **Gerçekleşen kâr** | Spot'ta **FIFO** (ilk alınan ilk satılır): satış fiyatı − o lotun alış fiyatı. Vadeli işlemde borsanın bildirdiği gerçekleşen kâr (OKX "PnL", Binance "Realized Profit"). MetaTrader'da işlemin "Profit"i. |
| **Ücret / komisyon** | Her işlemin ücreti (baz coinle ödenen ücret o günün fiyatıyla dolara çevrilir) + MetaTrader komisyon ve vergi. OKX'in iade ettiği (maker rebate) ücret eksi ücret sayılır. |
| **Fonlama + swap** | Vadeli işlemlerin fonlama ödemesi/geliri (+ aldın, − ödedin) ve MetaTrader'ın gecelik swap'ı. |
| **Net kâr/zarar** | Gerçekleşen − ücret + fonlama + swap. |
| **İşlem** | İstatistikte bir "kapanış": spot'ta eşlenen satış, vadelide kârı olan dolum, MetaTrader'da kapanan pozisyon. Vadeli işlemde açılış ücreti işlem sayısına değil toplam ücrete girer. |
| **Kazanma oranı · kâr faktörü · işlem başı** | Kârla kapanan işlemlerin payı · kazançlar toplamı ÷ kayıplar toplamı (kayıp yoksa ∞) · işlem başına ortalama net. |
| **En derin düşüş** | Birikimli net kâr/zararın en yüksek noktasından en çok ne kadar geri gittiği (dolar). |
| **Para girişi / çıkışı** | Dosyada ya da OKX'te bulunan para yatırma/çekme/aktarma ve MetaTrader balance/credit satırları. Performansa girmez; yalnız Bakiye grafiğinde. |
| **Çift** | Daha önce kaydedilmiş satır (aynı işlem kimliği; kimliksiz dosyalarda aynı içerik). OKX dosyası ile OKX bağlantısı aynı işlemi verirse o da çift sayılır: spot'ta aynı saniye (±2 sn), aynı yön, miktar ve fiyat; vadelide miktar birimi farklı olabildiği için (bağlantı sözleşme adedi verir) aynı saniye, yön, fiyat ve kâr. **Binance:** vadeli dosyanın "Trade ID"si ve hareket dosyasının "Transaction ID"si bağlantıdakiyle aynı numaradır → birebir çift; spot dosyasında kimlik olmadığı için aynı saniye (±2 sn), yön, miktar ve fiyat. Her eski satır en çok bir yeni satırı örter. |
| **Geri alınmış / iptal (bastırılan)** | Daha önce etkisiz yaptığın satır. Yeniden yüklemede ve OKX eşitlemesinde eklenmez; önizlemede ayrıca sayılır. |

## Uyarılar ve ne yapmalı {#uyarilar}

- **"Alışı kayıtta olmayan satış"**: spot'ta sattığın coinin alışı yüklenen dosyalarda yok (eski dönem ya da başka borsadan gelmiş). O kısmın kârı hesaplanmaz. Eski dosyaları da yükle; coin başka yerden geldiyse önemseme.
- **"Dolara çevrilemeyen tutar"**: o para biriminin (ör. JPY hesap, nadir bir coinle ödenen ücret) o günkü kuru bu bilgisayarın diskinde yok. O satırlar toplama girmez. Tek hesapta hesap para birimi çevrilemiyorsa hesap kendi para biriminde gösterilir.
- **"Vadeli dolumda kaynak gerçekleşen kârı vermedi"**: Binance vadeli dosyasında "Realized Profit" sütunu yoksa aynı dönemin **Transaction History** dosyasını da yükle.
- **"Sunucu saat farkı 0"**: MetaTrader hesabının ayarını düzelt (yukarıda).
- **OKX bağlantısı yalnız son 3 ayı verir.** Daha eskisini OKX dosyasıyla yükle. "Son hata" satırında "IP adresi beyaz listede değil", "Passphrase yanlış" gibi OKX cevabı yazar.
- **Binance bağlantısı:** vadelide son 6 ayın işlemleri, son 3 ayın fonlama/hareketleri; spotta bütün geçmiş (artık listede olmayan — delist — çiftler hariç: onlar için spot dosyası). "Bu anahtarın izinleri: … KAYDEDİLMEDİ" → anahtarda okuma dışında bir izin açık; Binance'te yalnız okuma izinli yeni anahtar oluştur. "kod -2015" → anahtar yanlış ya da IP kısıtı bu bilgisayarın IP'sini içermiyor. "kod -1021" → bilgisayarın saati çok kaymış (Pusula düzeltmeye çalışır; sürerse Windows saatini eşitle).
- **"vadeli okuma için Binance bu anahtarı kabul etmedi"**: Binance salt okuma anahtarıyla vadeli geçmişi vermedi. Spot eşitlenmeye devam eder; vadeli için Trade History + Transaction History dosyalarını yükle. Vadeli işlem iznini açma — Pusula o anahtarı reddeder.
- **"Binance'in işlenmeyen hareket türleri atlandı"**: tanınmayan vadeli hareket türü (ör. bonus). Performansa girmez.
- **Fiyat grafiği çıkmıyorsa**: o sembolün günlük fiyatı bu bilgisayarda yok (kripto için Binance günlük mumu; FX için USD, EUR, GBP, JPY, CHF, CAD, SEK, TRY çiftlerinin günlük kuru). CFD'ler (endeks, petrol) için ücretsiz seri yok — grafik çizilmez, kârı yine hesaplanır.
- **Dosya en çok 7 MB.** Daha büyükse dönemi bölüp ayrı ayrı yükle (çift satırlar zaten atlanır).
- OKX ve Binance dosyalarındaki saat sütunu saat dilimi yazmıyorsa UTC sayılır; önizlemedeki tarih aralığına bak.
- **"Vadeli satırların miktar birimi sözleşme (Cont) değil"**: OKX dosyası vadeli miktarı coin ya da USDT olarak yazmış; bağlantı sözleşme adedi verir. Kâr hesabı etkilenmez; yalnız listedeki miktarlar farklı birimde görünür.
- Dosyadaki **kullanıcı kimliği** (OKX "User ID") ve MetaTrader hesap numarası saklanmaz; yalnız son 3 hanesi.
