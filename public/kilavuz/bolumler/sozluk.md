# Sözlük {#sozluk}

Panelde ve kılavuzda geçen terimlerin sade açıklaması. Panelin kendi **?** açıklamaları en altta, aynı kaynaktan (her eklenen terim burada da görünür; örnekli tam tanım oradadır).

> **İpucu:** Panelde bir terimin yanındaki küçük **?** işaretine tıklayın ya da dokunun: açıklama terimin hemen yanında bir balonda açılır. Aynı **?**'e yeniden dokunmak, **Esc** ya da sayfada başka bir yere tıklamak balonu kapatır.

## Getiri ve risk ölçüleri {#olculer}

| Terim | Anlamı |
|---|---|
| CAGR | Yıllık bileşik getiri: dönemin toplam getirisini "her yıl aynı oranda büyüseydi" yıllık orana çevirir |
| MaxDD (en büyük düşüş) | Özsermayenin bir tepeden sonraki en derin düşüşü (%); "en kötü anda ne kadar kaybettim" |
| Sharpe | Getirinin oynaklığa oranı (yıllık). 1 civarı iyi, 2 üstü çok iyi; kısa dönemde gürültülüdür |
| DSR (düzeltilmiş Sharpe) | Çok sayıda deneme yapıldığında şansla çıkan iyi Sharpe'ı düzelten ölçü; deneme sayısı arttıkça düşer |
| Al-tut | Sembolü dönem başında alıp hiç satmamak; her stratejinin geçmesi gereken taban |
| Kâr faktörü | Kazanan işlemlerin toplamı / kaybedenlerin toplamı; 1'in altı zarar |
| Beklenti | İşlem başına ortalama sonuç |
| Oynaklık (volatilite) | Getirilerin ne kadar dalgalandığı; yıllık standart sapma |
| ATR | Ortalama gerçek aralık: bir mumun tipik oynaklığı; stop mesafesi için kullanılır |

## Ölçüm yöntemi {#yontem}

| Terim | Anlamı |
|---|---|
| Backtest | Kuralı geçmiş veride çalıştırmak |
| Holdout (saklı veri) | Geliştirmede hiç bakılmayan, en sonda bir kez açılan veri dilimi; geçmişe uydurmayı yakalar |
| Walk-forward | Kayan pencerelerde: her pencerede seçilen ayar bir sonraki görülmemiş dilimde denenir |
| Ön kayıt | Ölçümden ÖNCE kuralların, ölçütlerin ve karar kuralının yazılması; sonuca bakıp kural değiştirmeyi önler |
| Deneme sayacı | Bugüne kadar sınanan stratejilerin sayısı; çoklu karşılaştırma düzeltmesi için |
| Geçmişe uydurma (aşırı uyum) | Kuralı geçmiş veriye o kadar uydurmak ki gelecekte işe yaramaz |
| Olası sıralamalar bandı | Aynı getiriler başka bir sırayla gelseydi özsermayenin olası aralığı (%5–%95) |
| İleri test | Kuralların backtestte görmediği yeni günlerde izlenmesi |
| Gölge | Botun aynı günlerde araştırma modeline göre "olması gereken" sonucu |
| Ara rapor | İleri test sürerken yalnız betimleme; hüküm verilmez |
| Hüküm tarihi | Ön kayıtta yazılan karar günü |
| Kırpılmış ortalama | Uç değerler kırpılarak alınan ortalama (birkaç dev getiri sonucu sürüklemesin) |

## Bot ve borsa {#bot-borsa}

| Terim | Anlamı |
|---|---|
| Kairos / Tao | İki kripto botu (eski adları Hücum / Denge): BTC trend kuralı + 15 coinlik Kalkan kolu ×3; Kairos trendde %100 BTC, Tao %50. Kairos: "doğru an"ın tanrısı; Tao: "yol", inişle çıkışın dengesi |
| Nova / Lydia | Model portföy botları (eski adları QQQ M10 / BIST M10): Nasdaq Momentum 10 ve BIST Momentum 10 — her ay en güçlü 10 hisse. Nova: birden parlayan yeni yıldız; Lydia: ilk parayı basan Anadolu krallığı |
| Simurg | %50 QQQ + %50 Kairos model portföy botu (eski adı 837 · QQQ + Hücum; araştırmadaki deneme numarası 837). İki diyarı birleştiren efsanevi kuş — iki piyasayı birleştiren bot |
| BTC trend kuralı (O-GC) | BTC uzun dönem ortalamalarının üstündeyse BTC tutulur, altındaysa USDT'de beklenir |
| Testere | Fiyat ortalamanın etrafında gidip gelirken trend kuralının sık sık girip çıkması ve her seferinde küçük zarar yazması |
| Kalkan kolu | BTC dışındaki 15 coinde Donchian (trend takibi) + DCA (kademeli alım) bacakları |
| DCA | Kademeli alım: fiyat düştükçe ek alım yapıp ortalama maliyeti düşürmek |
| Donchian | Son N günün en yüksek/en düşük kanalına dayalı trend takibi |
| Kâğıt | Sanal hesap; borsaya emir gitmez |
| Demo | Binance Demo Trading: gerçek borsa akışı, sahte para |
| Acil fren | Bütün emirleri iptal edip pozisyonları piyasadan kapatma (eski adı Kill-Switch) |
| Felaket stopu | Borsada bekleyen, sert düşüşte pozisyonu kapatan koruma emri |
| Mutabakat | Botun kayıtlarını borsadaki gerçek pozisyon/emirlerle karşılaştırmak |
| Durduruldu (ENGEL) | Botun kendini durdurması; onaylanmadan yeniden işlem yapmaz |
| Kuru (deneme hesabı) | Bugünkü kararı emir vermeden hesaplamak |
| Marj oranı | Bakım marjının hesap değerine oranı; %100 olursa borsa pozisyonları kapatır |
| Likidasyon (tasfiye) | Borsanın pozisyonu zorla kapattığı fiyat |
| Funding (fonlama) | Vadelide 8 saatte bir long ile short arasında ödenen ücret |
| Perp | Vadesiz vadeli işlem sözleşmesi (USDⓈ-M) |
| İşaret fiyatı (mark) | Borsanın K/Z ve tasfiye hesabında kullandığı adil fiyat |

## Portföy tasarımcısı ve model portföy {#tasarimci}

| Terim | Anlamı |
|---|---|
| Kesitsel momentum (12-1) | Her ay, son 12 ayda en çok yükselen hisseleri seçmek; son ay hariç tutulur (kısa vadeli geri dönüş etkisini dışlamak için). Nova ve Lydia (Nasdaq / BIST Momentum 10) böyle çalışır |
| Çekirdek-uydu | Portföyün sakin bir "çekirdeği" (ör. QQQ) ile riskli bir "uydusu" (ör. Kairos botu) ayrı hesaplarda tutulur, belirli aralıkla hedef paylara dengelenir (Simurg) |
| Nokta-zamanlı (PIT) evren | Her ay yalnız O GÜN endekste olan hisseler aday sayılır; bugünkü listeyi geçmişe uygulamak sonradan batanları dışarıda bırakıp sonucu şişirir (hayatta kalma yanlılığı) |
| Endeks (100 taban, NAV) | Model portföyün değeri başlangıçta 100 kabul edilir; 112 = başlangıçtan %12 kazanç. Gerçek tutar yalnız sunucuda |
| H1 | Hisse tarafı kabul ölçütü: en büyük düşüş kıyastan en fazla 5 puan derin olabilir. Sonuçlar görüldükten SONRA kondu; bu kabuller seçim yanlılığı taşır |
| Bindirme (portable alpha / overlay) | Ana varlığın tamamı tutulurken teminatın üstüne ikinci bir getiri kaynağı eklemek (ör. BTC + Kalkan kolu ×3); kaldıraç ve marj riski taşır |
| Karar günü / uygulama günü | Liste ayın son işlem günü kapanışıyla hesaplanıp dondurulur; ertesi işlem günü açılışında uygulanır |
| Ölçülmemiş birleşim | Kabul edilmiş şablonun dışına çıkan kurucu tasarımı: simülasyon, kabul değil |

## Gerçek portföy ve uygulama {#gercek-portfoy}

| Terim | Anlamı |
|---|---|
| TWR (zaman ağırlıklı getiri) | Para yatırma/çekmenin etkisini ayıklayan getiri: "yatırımlar ne yaptı" |
| FIFO | Satışta önce en eski alımın satıldığı varsayımı; gerçekleşen K/Z böyle hesaplanır |
| Bu hesapta zaten olanlar (ilk kurulum kaydı) | Pusula'yı ilk kurarken bir hesapta zaten olan adedi ve nakdi geçmiş işlemleri yazmadan bir kez girmek; yeni alım için kullanılmaz (alış kasadan düşer) |
| Gerçekleşen K/Z | Satılarak kesinleşmiş kâr ya da zarar |
| Bölünme (split) | Hisse sayısı artar, fiyat aynı oranda düşer; değer değişmez |
| Aynı gün sırası | Aynı gün birden çok işlem varsa hangisinin önce sayılacağı (önce satış, sonra alış) |
| En büyük kalan yuvarlaması | Tam adet alımda kalan nakitle kesir payı en büyük hisselerden birer adet daha almak |
| Uygulama farkı | Model getirisi ile gerçek portföy getirisi arasındaki fark (puan) |
| Kol katkısı · Carino | Toplam getirinin hangi koldan geldiği; Carino çok dönemde katkıların toplamını toplam getiriye eşitler |
| Kendi tasarımınız | Kurucuda kaydedip izlemeye aldığınız ölçülmemiş birleşim; emir listesi açılmaz, en çok 3 |
| Tasarım sürümü · yürürlük | Kayıtlı tasarım değişmez; yeni sürüm bir sonraki karar gününde yürürlüğe girer |
| SHA-256 | Dosyanın parmak izi; tek harf değişse özet değişir, zincir bozuk görünür |
| ETF | Endeksi izleyen, hisse gibi alınıp satılan fon (QQQ, IEF, SHY, GLD) |
| QQQ · IEF · SHY · GLD | Nasdaq-100 · 7–10 yıl ABD tahvili · 1–3 yıl ABD tahvili · altın ETF'leri |
| TEFAS · Midas | Türkiye yatırım fonu platformu · ABD ve BIST hisseleri için aracı kurum uygulaması |
| XU030 · XU100 · EW-BIST30 | BIST 30 · BIST 100 endeksi · BIST 30 hisselerine eşit para konmuş sanal sepet |
| T-bill · T-bill fazlası | 3 aylık ABD hazine bonosu (risksiz faiz) · getirinin bu faizi aşan kısmı |
| TÜFE · reel getiri | Enflasyon endeksi · enflasyondan arındırılmış getiri |
| TL getirisi | Getirinin Türk lirası cinsinden hesabı; dolarla kıyaslarken kur değişimi hesaba katılır |
| Kıyas · P(kıyastan iyi) | Yenilmesi gereken basit seçenek · onu yenme olasılığı (0,50 = yazı-tura) |

## Laboratuvar ve risk {#laboratuvar}

| Terim | Anlamı |
|---|---|
| Laboratuvar | Varlık portföyü kurup geçmişte deneyen araştırma bölümü; gerçek emir üretmez |
| Varyasyon | Aynı portföyün küçük farklarla birlikte denenen kopyaları; her biri deneme sayacına girer |
| Korelasyon | İki varlığın birlikte hareketi, −1 ile +1 arası |
| CVaR | En kötü %5'lik günlerin ortalama kaybı |
| Risk paritesi · ters oynaklık · en düşük varyans | Ağırlık yöntemleri: eşit risk katkısı · oynaklığa ters oranlı · en az toplam dalgalanma |
| Geçmişe bakarak (in-sample) | Ayarın seçildiği veride ölçmek; sonuç iyimserdir |
| Vekil (proxy) | Verisi olmayan varlığın yerine kullanılan benzer seri (XU030 yerine XU100) |
| Eksik veri: kırp / sonradan katıl | Ortak başlangıçtan başla / varlık verisi başlayınca portföye girer |
| Kairos serisi senaryosu | Ölçülen · yarıya indirilmiş · BTC al-tut ile değiştirilmiş (kötümser) |
| Kriz dönemi | 2008, 2020 Mart, 2022 gibi sert düşüş aralıkları |
| Sabitleme | Model kurallarının ileri izlemeden önce dondurulması |
| p95 / p99 | Simülasyonların %95'inin / %99'unun altında kaldığı eşik |
| WFE (walk-forward verimi) | Test dilimi getirisinin eğitim dilimi getirisine oranı; 1'e yakın iyi |

## Göstergeler ve borsa {#gostergeler}

| Terim | Anlamı |
|---|---|
| SMA · EMA | Basit · üssel hareketli ortalama |
| RSI | Göreli güç endeksi (0–100); 70 üstü aşırı alım, 30 altı aşırı satım |
| VWAP | Hacim ağırlıklı ortalama fiyat |
| Bollinger bantları | Ortalamanın iki yanında standart sapma katı uzaklıkta bantlar |
| FVG · order block | Adil değer boşluğu · sert hareketten önceki son ters mum bölgesi |
| Isınma dönemi | Göstergenin hesaplanabilmesi için gereken ilk mumlar |
| Zaman dilimi · mum | 5m / 1h / 4h / 1d · bir dilimin açılış, en yüksek, en düşük, kapanış fiyatı |
| Parametre taraması | Ayarları çok değerle deneyip en iyisini bulmak; en iyi nokta çoğu zaman şanstır |
| Spot · vadeli · perpetual | Varlığın kendisi · fiyata dayalı sözleşme · vadesiz vadeli sözleşme |
| Kaldıraç · nominal | Teminatın katı kadar pozisyon · pozisyonun kaldıraç dahil toplam değeri |
| Long · short · TP | Yükselişte kazanan · düşüşte kazanan pozisyon · kâr al emri |
| Yalnız azalt (reduceOnly) | Emir yalnız mevcut pozisyonu küçültür, yeni pozisyon açamaz |
| Pozisyon modu | Vadelide tek yön ya da iki yön (long ve short ayrı) |
| Canlı emir kilidi · tavan | Canlı hesaba emir göndermeyi kapatan kilit · tek emir/günlük en yüksek tutar |
| Testnet | Binance deneme ortamının eski adı; panelde "demo hesap" denir |
| Veto | Bir kuralın başka bir kuralın işlemini engellemesi (ör. range vetosu) |
| C0 (ideal gölge) | Botun kusursuz uygulanmış hâli; gerçek sonuç bununla karşılaştırılır |
| Sağlık sinyali (Period / Grace) | Bot "yaşıyorum" sinyali · beklenen aralık / gecikmeye tanınan ek süre |
| Chat id | Telegram sohbet numarası; panelde maskeli |
| Demo ↔ gerçek borsa farkı | Demo dolum, likidite ve fonlamada gerçekten farklı olabilir; provadır, garanti değil |

## Coin tarama ve listeler {#tarama}

| Terim | Anlamı |
|---|---|
| Kırmızı bayrak | "Şuna bak" işareti (likidite düştü, mint yetkisi var…); alım/satım sinyali değil |
| İlk 10 payı | En büyük 10 cüzdanın arzdaki payı; "ayıklanmış" = sözleşme, kilitli, borsa/LP ve yakma adresleri çıkarılmış |
| Mint yetkisi | Sözleşme sahibinin yeni token basabilmesi |
| LP kilidi | DEX likiditesinin belirli bir süre çekilemez hâle getirilmesi |
| Kayıt zinciri | Her liste kaydının bir öncekinin SHA-256 özetini taşıması; sonradan değişiklik zinciri bozar |
| PIT (nokta-zamanlı) | O gün gerçekten bilinen veriyle hesap (sonradan delist olanlar dahil) |
| Alan adı bayrağı | Site token'dan en çok 30 gün ÖNCE alınmışsa kırmızı bayrak; SONRA alınmışsa yalnız bilgi |
| CEX · DEX | Merkezî borsa (Binance) · akıllı sözleşmeyle çalışan merkeziyetsiz borsa (Uniswap) |
| EVM · RPC | Ethereum uyumlu zincirlerin ortak ortamı · zincirden veri okunan sunucu adresi |
| Stablecoin | Değeri dolara sabitlenmiş token (USDT, USDC) |
| Honeypot | Alınabilen ama satılamayan tuzak token |
| Unlock (kilit açılımı) | Kilitli kurucu/yatırımcı tokenlarının takvimle serbest kalması |
| TVL · MVRV · SOPR | Protokolde kilitli toplam değer · piyasa değeri / gerçekleşmiş değer · satış fiyatı / alış fiyatı |
| RDAP · GoPlus · RugCheck | Alan adı kayıt sorgusu · EVM token güvenlik denetimi · Solana token risk denetimi (ücretsiz) |
| ToS · kota | Kaynağın kullanım şartları · belli sürede izin verilen istek sayısı |
| İstek sınırı (HTTP 429) | Kaynak geçici olarak cevap vermiyor; sonraki taramada kendiliğinden yeniden denenir |
| Envanter · manifest | Veri kaynaklarının listesi · arşivdeki dosyaların listesi ve özetleri |
| ICT | Inner Circle Trader: fiyatın likidite, boşluk (FVG) ve emir bloklarına göre hareket ettiğini savunan bir işlem okulu; kavramları ve modelleri Kitapçık › ICT modelleri'nde |
| CBDR | Merkez bankası saatlerindeki dar aralık: EUR/USD'de önceki iş günü New York 14:00–20:00 mum gövdelerinin aralığı; İleri test › EUR/USD CBDR kartındaki modelin dayanağı |
| R (risk birimi) | Bir işlemin sonucu, stop mesafesine bölünerek: +1R = stop mesafesi kadar kazanç, −1R = stop olmuş tam kayıp |
| DXY | ABD doları endeksi: doların altı büyük para birimine (EUR, JPY, GBP, CAD, SEK, CHF) karşı değeri; forex paritelerinin ortak yönünü gösterir |

## Panelin ? açıklamaları {#panel}

::sozluk-paneli::
