/**
 * SÖZLÜK — ekrandaki teknik terimlerin sade açıklaması (PLAN-PANEL-PUSULA §2, P2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "İç adlar sade dile; her teknik terimde küçük '?' açıklaması (sözlük tek
 * dosyada)." Botların iç adları (ENGEL, Kuru, Kalkan kolu, Hücum-S, O-GC,
 * PAPER, Kill-Switch) ekranda sade Türkçe yazılır; terimin yanındaki "?"
 * bu dosyadaki açıklamayı gösterir. Açıklama başka yerde YAZILMAZ — yeni bir
 * terim gerekiyorsa buraya eklenir.
 *
 *   AG.sozluk.metin(anahtar)  → açıklama metni (yoksa '')
 *   AG.sozluk.yardim(anahtar) → küçük "?" öğesi: üzerine gelince / odaklanınca
 *                               açıklama (title + aria-label), tıklayınca terimin
 *                               YANINDA açıklama balonu (Esc / dışarı tıklama kapatır).
 */
(function (global) {
  'use strict';
  const AG = global.AG || (global.AG = {});

  const TERIMLER = {
    durduruldu: 'Bot kendini durdurdu ve yeni emir vermiyor. Nedeni incelenip "Engeli kaldır" ile onaylanmadan yeniden işlem yapmaz (iç adı: ENGEL).',
    kagit: 'Kâğıt mod: gerçek emir yok; bot kendi sanal hesabında işlem yapar (eski adı: PAPER).',
    demo: 'Demo mod: Binance Demo Trading hesabında gerçek borsa akışıyla, sahte parayla işlem.',
    gercekPara: 'Canlı hesap modu: bot Binance canlı hesabında emir verir. Yalnız tüm şartlar sağlanınca seçilebilir (en erken 5 Ocak 2027, G1–G9 yazılı onayı, sermaye üst sınırı); %40 hesap kaybında bot kendini acil durdurur.',
    gercekPara: 'Canlı hesap modu: bot Binance canlı hesabında emir verir. Yalnız tüm şartlar sağlanınca seçilebilir (en erken 5 Ocak 2027, G1–G9 yazılı onayı, sermaye üst sınırı); %40 hesap kaybında bot kendini acil durdurur.',
    acilFren: 'Acil fren: botun bütün emirleri iptal edilir ve açık pozisyonları piyasa fiyatından kapanır (eski adı: Kill-Switch). Geri alınamaz.',
    felaketStopu: 'Koruma stopu (eski adı felaket stopu): borsada bekleyen, fiyat çok sert düşerse pozisyonu kapatan satış emri (ATR katı uzaklıkta). Yalnız demo/canlı hesapta konur.',
    hesapDegeri: 'Hesap değeri = Binance "Margin Balance" (marj bakiyesi): cüzdan bakiyesi + açık pozisyonların gerçekleşmemiş kâr/zararı. Binance\'in emir kutusundaki "Avbl" (kullanılabilir) bundan pozisyon teminatı ve açık emir teminatı düşülmüş hâlidir; bu yüzden hep biraz küçüktür.',
    tif: 'Süre (TIF, time in force): emrin ne kadar geçerli kalacağı. GTC = iptal edilene kadar geçerli; Binance "Open Orders" tablosundaki TIF sütunu.',
    binanceBakiye: 'Binance\'in kendi hesap alanları (cüzdan, gerçekleşmemiş K/Z = Unrealized PNL, marj bakiyesi, pozisyon teminatı, açık emir teminatı, toplam başlangıç teminatı, Avbl), Binance ekranındaki adlarıyla. Kullanılabilir, Binance\'in Avbl sayısının kendisidir; altındaki denklem (Marj bakiyesi − toplam başlangıç teminatı) yalnız denetimdir — alanlar farklı anlarda hesaplandığı için 0,50 $\'a kadar fark olağan. Pozisyonlar, emirler ve işlem geçmişi grafiğin altındaki İşlemler panelinde. Sayfa açıkken 12 sn\'de bir yenilenir.',
    marj: 'Teminat durumu (marj): vadeli işlemde borsanın istediği teminatın hesap değerine oranı. %50 üstü dikkat, %80 üstü tehlike; %100 olursa borsa pozisyonları kapatır.',
    btcRejimi: 'BTC trendi: BTC fiyatı uzun dönem ortalamalarının üstündeyse trend yükselişte (BTC tutulur), altındaysa düşüşte (nakitte, USDT\'de beklenir).',
    kolPay: 'Coin sepeti (eski adı kol): BTC dışındaki 15 coin. İki yarısı var: trend takibi (Donchian — fiyat son 20 günün zirvesini aşınca alır) ve kademeli alım (DCA — düştükçe parça parça alır); burada ikisine ayrılan paylar yazar.',
    golge: 'Simülasyon (eski adı gölge): aynı kurallarla, emir göndermeden aynı günlerde hesaplanan "olması gereken" sonuç. Gerçek sonuç simülasyondan %5\'ten fazla ayrılırsa bot kendini durdurur.',
    kuru: 'Deneme hesabı: bugünkü kararı emir vermeden hesaplar ve gösterir (iç adı: Kuru).',
    mutabakat: 'Borsayla karşılaştır: botun kayıtlarındaki pozisyon ve emirleri borsadakilerle karşılaştırır; uyuşmazlık varsa bot durur.',
    kucukSermaye: 'Küçük hesap kipi (Kairos-S, eski adı Hücum-S): sermaye 5000 $\'ın altındayken yalnız borsanın asgari emir tutarını geçebilen coinlerle işlem yapılır.',
    hedefSapma: 'Hedeften sapma: bir varlığın gerçek payı ile hedef payı arasındaki en büyük fark. Bant aşılırsa dengeleme önerilir.',
    dengeleme: 'Dengeleme: varlıkların paylarını hedefe döndürmek için yapılan alım-satım. Sıklık ve bant Portföy ekranında seçilir.',
    elleTutar: 'Portföy tutarları elle girilir: gerçek adetler Portföy › Portföyüm\'de, modele ayrılan tutar Portföy › Bu ay\'da. Borsadan ya da aracı kurumdan otomatik okunmaz.',
    kalp: 'Son çalışma: botun günlük işinin en son ne zaman koştuğu. 26 saati geçerse bot gecikmiş sayılır.',
    // Borsa hesapları (P3, 62.7)
    kaynak: 'Kimin: pozisyonu ya da emri kimin açtığı — Kairos / Tao (portföy botları), Elle (Arşiv › Elle emir\'den ya da borsa arayüzünden), Kâğıt test (Arşiv › Kâğıt test motoru), Acil fren.',
    isaretFiyati: 'İşaret fiyatı: borsanın kâr-zarar ve tasfiye hesabında kullandığı adil fiyat (son işlem fiyatından biraz farklı olabilir; iç adı: mark).',
    likidasyon: 'Tasfiye fiyatı: fiyat buraya gelirse borsa pozisyonu zorla kapatır (likidasyon). İşaret fiyatına %5\'ten yakınsa kırmızı görünür. Kâğıt hesapta hesaplanmaz.',
    korumaEmri: 'Koruma stopu: pozisyonu sert bir düşüşte kapatmak için borsada bekleyen satış emri (eski adı felaket stopu). "Yerinde" = borsada bekliyor; vadeli pozisyonda "yok" korumasız demektir. "Bilerek stopsuz" = Kairos demoda BTC ayağı karar gereği stopsuz bırakılır (eksik sayılmaz). Fiyat tasfiye (zorla kapanma) seviyesine %10\'dan yakınsa satırda "zorla kapanmaya yakın" yazar.',
    gerceklesmemis: 'Gerçekleşmemiş K/Z: açık pozisyonun şu anki işaret fiyatına göre kârı ya da zararı; pozisyon kapanınca gerçekleşir.',
    saatFarki: 'Saat farkı: bu bilgisayarın saati ile borsa saati arasındaki fark. 1 saniyeyi aşarsa borsa imzalı istekleri reddedebilir; Windows saatini eşitleyin.',
    fonlama: 'Fonlama (funding): vadeli işlemlerde 8 saatte bir long ile short arasında ödenen ücret. Artı = alındı, eksi = ödendi.',
    elleEmir: 'Elle emir: botlardan bağımsız, Arşiv › Elle emir bölümündeki demo hesap bağlantısından tek emir. Önce önizleme yapılır; gönder düğmesi yalnız geçerli önizlemeden sonra açılır.',
    // Araştırma + İleri test (P4)
    altut: 'Al-tut farkı: stratejinin getirisi ile aynı dönemde sembolü başta alıp hiç satmamanın getirisi arasındaki fark (yüzde puan). Eksi = al-tut daha iyiydi.',
    sharpe: 'Sharpe: getirinin oynaklığa oranı (yıllık). 1 civarı iyi, 2 üstü çok iyi sayılır; kısa dönemde çok gürültülüdür.',
    bootstrapBant: 'Olası sıralamalar bandı: aynı getiriler başka bir sırayla gelseydi özsermaye nerede olurdu (blok bootstrap, %5–%95). Bant genişse sonuç şansa/sıraya çok bağlıdır.',
    walkForward: 'Walk-forward: veri kayan pencerelere bölünür; her pencerede bulunan en iyi ayar, hiç görmediği sonraki dilimde denenir. Aşırı uyumu (geçmişe uydurmayı) yakalar.',
    kagitTest: 'Kâğıt test: strateji canlı fiyatlarla, sanal (kâğıt) hesapta çalışır; borsaya emir gitmez. Gerçek botlar (Kairos/Tao) bundan ayrıdır.',
    kagitRisk: 'Kâğıt test risk ayarları: yalnız kâğıt test botlarına uygulanır (pozisyon büyüklüğü, stop, düşüş freni). Kairos/Tao botlarını etkilemez.',
    pineBirebir: 'Pine farkı: TradingView emri bir sonraki barın açılışında doldurur, panel motoru sinyal barının kapanışında. İşlem sayısı aynı kalır, tarihler bir bar kayabilir.',
    bollingerKiyas: 'Mevcut / Bollinger’li: aynı trend kuralının bugünkü hâli ile Bollinger düşüş azaltıcısı eklenmiş hâli, aynı günlerde yan yana izlenir. Soldaki sayı mevcut kural, sağdaki Bollinger’li kural.',
    araRapor: 'Ara rapor: ölçüm sürerken yalnız durumu betimler. Ön-kayıt gereği ara raporda hüküm verilmez, kurala dokunulmaz.',
    hukumTarihi: 'Karar günü (eski adı hüküm tarihi): ön-kayıtta yazılan, kararın verileceği gün. Bu tarihten önce sonuç "geçti/kaldı" diye yorumlanmaz.',
    golgeMaxdd: 'Simülasyonun en derin düşüşü: botun araştırma modeline göre "olması gereken" eğrisinin (eski adı gölge) ileri dönemdeki en derin düşüşü. Uyarı eşiği aşılırsa nedeni incelenir; alarm eşiği aşılırsa model geçersiz sayılır.',
    demoKabul: 'Demo kabul protokolü: demo hesapta botun söylediğini yapıp yapmadığını ölçen, önceden yazılmış ölçütler. Getiri karar ölçütü değildir.',
    uygulamaSapma: 'Uygulama sapması: 30 günlük gerçek sonuç ile simülasyon (model) sonucu arasındaki fark. %3 altı normal, %3–5 incelenmeli, %5 üstü bot durur.',
    // Coin tarama + liste kaydı (60.3)
    kirmiziBayrak: 'Kırmızı bayrak: zincir üstü / piyasa verisinde "şuna bak" işareti (ör. likidite düştü, ilk 10 payı oynadı, mint yetkisi var). Alım/satım sinyali DEĞİLDİR, puan da değildir; eşikler başlangıç değeri, ön kayıt değil. Coin başına yok sayılabilir (Tarama ayarları).',
    ilk10Ayik: 'İlk 10 payı: en büyük 10 holder\'ın arzdaki payı. Ham = olduğu gibi; ayıklanmış = sözleşme, kilitli, etiketli (borsa/LP) ve yakma adresleri çıkarılmış. Etiketsiz borsa cüzdanları ayıklanmışta kalır — kaba bir ölçüdür.',
    listeZinciri: 'Kayıt zinciri: her liste kaydı bir öncekinin SHA-256 özetini taşır. Bir kaydı sonradan değiştirmek ya da silmek zinciri bozar ve burada görünür. Düzeltme ancak yeni bir "düzeltme kaydı" ile yapılır.',
    listeDegerlendirme: 'Değerlendirme betimleyicidir: tek liste × tek dönem şanstan ayrılamaz. Giriş = başlangıç gününün açılışı (liste o gün girildiyse kayıttaki fiyat), ücret/kayma yok. Seçilen − elenen farkı ancak elenenler de kaydedildiyse ölçülür.',
    kirpikOrtalama: 'Kırpılmış ortalama: her getiri piyasa evreninin %1–%99 aralığına kırpılıp ortalanır (piyasa yoksa grubun %10–%90\'ı). Birkaç %1 000\'lik uç coin ortalamayı sürüklemesin diye medyanla birlikte verilir.',
    // Portföy tasarımcısı + model izleme (60.9)
    modelPortfoy: 'Model portföy: kuralları önceden dondurulmuş, kendi hesabına dokunmadan "bugünden itibaren" takip edilen sanal portföy (Simurg: %50 QQQ + %50 Kairos, Nova: Nasdaq Momentum 10, Lydia: BIST Momentum 10). Kararlar ay sonunda otomatik alınır; gerçek hesabınızdaki emirleri siz girersiniz.',
    kararGunu: 'Karar günü / uygulama günü: liste ayın son işlem günü KAPANIŞ fiyatlarıyla hesaplanır ve dondurulur; model ertesi işlem günü AÇILIŞINDA uygular. ABD kararı Türkiye saatiyle gece çıkar, emir ertesi gün 17:30 (1 Kasım 2026 – 14 Mart 2027 kış saati), sonra 16:30 sonra girilir.',
    h1: 'H1: hisse tarafı kabul ölçütü — en büyük düşüş kıyas endeksinden en fazla 5 puan derin olabilir. Sonuçlar GÖRÜLDÜKTEN sonra konduğu için bu kabuller seçim yanlılığı taşır; ileri dönem 12–24 ay görülmeden yorum yapılmaz.',
    cekirdekUydu: 'Çekirdek-uydu: portföyün büyük, sakin bir "çekirdeği" (ör. QQQ endeks fonu) ile daha riskli bir "uydusu" (ör. Kairos botu) ayrı hesaplarda tutulur ve belirli aralıkla hedef paylara dengelenir.',
    endeksNav: 'Endeks (100 taban): model portföyün değeri başlangıçta 100 kabul edilir; 112 = başlangıçtan %12 kazanç. Gerçek tutar yalnız sunucuda, siz girerseniz görünür (git\'e ve Telegram\'a gitmez).',
    emirListesi: 'Emir listesi (Bu ay): Portföyüm\'deki gerçek adetlerinizi modelin bu ayki hedefine götüren al/sat önerisi. Hedef tutar = model sermayesi × ağırlık; tam adet (kesirli hisse varsayılmaz), kalan tutar nakitte kalır; tahmini fiyat son kapanış. Önce satış, sonra alış. Emri aracı kurumda siz girersiniz; "Uyguladım" Portföyüm\'e tek onayla kaydeder, "Geri al" ters kayıt yazar.',
    modelSermayesi: 'Model sermayesi: bir modele ayırdığınız GERÇEK tutar (Nova ve Simurg dolar, Lydia TL). Emir listesinin hedef tutarı buradan gelir. Yalnız bu bilgisayarda saklanır; git\'e ve Telegram\'a gitmez.',
    bantDengeleme: 'Bant dengelemesi (Simurg, sürüm 2): Kairos kolunun payı %40–%60 aralığında kaldıkça hiçbir şey yapılmaz; dışına çıkınca (QQQ işlem günü kapanışında denetlenir) tam 50/50\'ye dönülür. 2018–2026 ölçümünde 13 aktarım (aylık kuralda 105), Sharpe ve düşüş aylıkla eşit (deneme 851).',
    momentum: 'Kesitsel momentum (12-1): her ay, son 12 ayda en çok yükselen hisseleri alır — son ay hariç tutulur (kısa vadeli geri dönüş etkisini dışlamak için). Jegadeesh & Titman 1993.',
    pit: 'Nokta-zamanlı (PIT) evren: her ay yalnız O GÜN endekste olan hisseler aday sayılır. Bugünkü listeyi geçmişe uygulamak, sonradan batanları dışarıda bırakıp sonucu şişirir (hayatta kalma yanlılığı).',
    bindirme: 'Bindirme (portable alpha / overlay): ana varlığın (ör. BTC ya da QQQ) tamamı tutulurken teminatın üstüne ikinci bir getiri kaynağı (ör. Kalkan kolu ×3) eklenir; kaldıraç ve marj riski taşır.',

    // ── Panel denetimi B (61.1): portföy ve finans terimleri ──────────────
    brut: 'BRÜT (brüt) faiz oranı: bankanın ilan ettiği, vergi (stopaj) kesilmeden önceki yıllık faiz oranı. Hesaba geçen NET faiz = brüt faiz − stopaj.',
    stopaj: 'Stopaj: faiz gelirinden kaynakta kesilen vergi; oranı banka dekontunda yazar. Brüt faiz × stopaj oranı kadar kesilir.',
    mwr: 'MWR (para ağırlıklı getiri): ne zaman ne kadar para koyduğunuzu da hesaba katan getiri (iç verim oranı). Düşüşten önce büyük para koyduysanız zaman ağırlıklı getiriden kötü çıkar.',
    twr: "TWR (zaman ağırlıklı getiri): para yatırma ve çekmenin etkisini ayıklayan getiri. Her para girişi/çıkışı arasında dönem getirisi hesaplanıp çarpılır; böylece \"ne kadar para koydum\" değil \"yatırımlar ne yaptı\" ölçülür. Örnek: 1000 $ %10 kazandı, sonra 1000 $ daha yatırdınız ve fiyatlar değişmedi → TWR yine %10.",
    fifo: "FIFO (ilk giren ilk çıkar): satışta önce en eski alımların satıldığı varsayılır; gerçekleşen kâr/zarar bu sırayla hesaplanır. Örnek: 10 adet 100 $'dan, sonra 10 adet 120 $'dan aldınız; 10 adetlik satışın maliyeti 100 $ sayılır.",
    etf: "ETF (borsada işlem gören fon): bir endeksi ya da varlık sepetini izleyen, hisse gibi alınıp satılan fon. Örnek: QQQ Nasdaq-100'ü izler; tek alımla 100 şirkete yayılırsınız.",
    tefas: "TEFAS: Türkiye'deki yatırım fonlarının alınıp satıldığı ortak platform. Fon fiyatları günde bir kez açıklanır. Örnek: Portföyüm TEFAS fon fiyatını ücretsiz kaynaktan günlük yeniler.",
    midas: "Midas: ABD ve Borsa İstanbul hisselerinin alınabildiği aracı kurum uygulaması. Pusula Midas'a bağlanmaz; emirleri siz girersiniz, sonucu \"Uyguladım\" ile kaydedersiniz. Örnek: Bu ay listesindeki 3 alış emrini Midas'ta girip gerçekleşen fiyatlarla \"Uyguladım\" demek.",
    qqq: "QQQ: Nasdaq-100 endeksini izleyen ETF (ABD'nin en büyük 100 teknoloji ağırlıklı şirketi). Simurg modelinin çekirdeği ve Nasdaq stratejilerinin kıyasıdır. Örnek: Simurg'da paranın yarısı QQQ'da, yarısı Kairos botunda durur.",
    ief: "IEF: 7–10 yıl vadeli ABD devlet tahvillerini izleyen ETF. Portföyde düşük riskli, hisselerle çoğu zaman ters yönde hareket eden parça olarak kullanılır. Örnek: 2022 dışındaki çoğu hisse düşüşünde IEF yükseldi.",
    shy: "SHY: 1–3 yıl vadeli ABD devlet tahvili ETF'si; nakde yakın, çok düşük oynaklık. Laboratuvarda \"nakit\" yerine kullanılabilir. Örnek: %60 QQQ + %40 SHY = hisse riskinin yarıdan fazlası nakde yakın tutulur.",
    gld: "GLD: altın fiyatını izleyen ETF. Örnek: hisse ve tahvil birlikte düştüğünde portföyü dengeleyebilir; kendi başına faiz ya da temettü üretmez.",
    xu030: "XU030 (BIST 30): Borsa İstanbul'un en büyük 30 hissesinin endeksi; Lydia'nın (BIST Momentum 10) kıyası. Laboratuvar kataloğunda yoksa yerine XU100 vekil olarak kullanılır. Örnek: model %25, XU030 %18 kazandıysa model 7 puan önde.",
    xu100: "XU100 (BIST 100): Borsa İstanbul'un en büyük 100 hissesinin endeksi. XU030 verisi olmayan yerde vekil (yerine geçen) kıyas olarak kullanılır. Örnek: Laboratuvarda XU030 seçilemiyorsa XU100.IS kullanılır.",
    ewBist30: "EW-BIST30 (eşit ağırlıklı BIST 30): BIST 30 hisselerinin her birine eşit para konmuş sanal sepet. Endeksten farkı: büyük şirketler ağır basmaz; momentumun \"hisse seçmeden\" alınacak sonuca göre ne kattığını gösterir. Örnek: 30 hisseye 10 000 ₺'lik eşit paylar.",
    tbill: "T-bill: 3 aylık ABD hazine bonosu; dolar için \"risksiz faiz\" sayılır. \"T-bill fazlası\" = stratejinin getirisinden bu faizin çıkarılmış hâli. Örnek: strateji %9, T-bill %4 → fazla %5.",
    tufe: "TÜFE ve reel getiri: TÜFE tüketici fiyat endeksidir (enflasyon). Reel getiri = enflasyondan arındırılmış getiri. Örnek: TL'de %40 kazandınız, enflasyon %35 → reel getiri yaklaşık %3,7.",
    reelGetiri: "Reel getiri: enflasyondan arındırılmış getiri; paranın gerçek alım gücündeki değişim. Örnek: %40 nominal kazanç, %35 enflasyon → reel ≈ %3,7 (1,40 ÷ 1,35 − 1).",
    korelasyon: "Korelasyon: iki varlığın birlikte hareket etme derecesi, −1 ile +1 arası. +1 = hep aynı yönde, 0 = ilişkisiz, −1 = hep ters yönde. Örnek: QQQ ile Kairos arasındaki korelasyon düşükse birlikte tutmak düşüşleri yumuşatır.",
    cvar: "CVaR (koşullu riske maruz değer): en kötü %5'lik günlerin ortalama kaybı. Ağırlık yöntemi olarak: kötü günlerdeki ortalama kaybı en aza indiren dağılım. Örnek: CVaR %4 = en kötü 20 günden birinde ortalama %4 kayıp.",
    riskParitesi: "Risk paritesi: her varlığın portföy riskine EŞİT katkı yapacağı ağırlıklar. Oynak varlığa az, sakin varlığa çok para konur. Örnek: tahvil hisseden 3 kat sakinse tahvile yaklaşık 3 kat para.",
    tersOynaklik: "Ters oynaklık: her varlığın ağırlığı oynaklığıyla ters orantılı. Risk paritesinin basit hâli (varlıklar arası ilişkiye bakmaz). Örnek: %20 oynak hisse ile %10 oynak tahvil → tahvile 2 kat ağırlık.",
    enDusukVaryans: "En düşük varyans: geçmiş oynaklık ve korelasyonlara göre toplam dalgalanması en küçük olan dağılım. Getiriyi hesaba katmaz; çoğu zaman en sakin varlıklara yığılır. Örnek: hisse, tahvil ve altından tahvile %70'in üstünde pay verebilir.",
    inSample: "Geçmişe bakarak (in-sample): ayarların seçildiği verinin kendisinde ölçmek. Sonuç iyimserdir, çünkü kural o veriye göre seçildi. Güvenilir ölçü görülmemiş veridir (holdout / walk-forward). Örnek: 2018–2024'te seçilen ayar aynı dönemde %30 getirir ama 2025'te %5 getirebilir.",
    vekil: "Vekil (proxy): asıl verisi olmayan bir varlığın yerine kullanılan, ona çok benzeyen seri. Örnek: XU030 verisi olmayan yerde XU100; vekil sonucu yaklaşık okunur.",
    pKiyas: "P(kıyastan iyi): stratejinin kıyasını (ör. QQQ al-tut) yenme olasılığı; geçmiş getirilerin yeniden örneklenmesiyle (bootstrap) hesaplanır. 0,50 = yazı-tura; 0,90 üstü güçlü. Örnek: 0,61 = 100 olası gelecekten 61'inde kıyastan iyi.",
    cagr: "CAGR (yıllık bileşik getiri): dönemin toplam getirisini \"her yıl aynı oranda büyüseydi\" yıllık orana çevirir. Örnek: 3 yılda 100 → 172,8 ise CAGR %20.",
    maxdd: "En büyük düşüş (MaxDD): değerin bir tepeden sonraki en derin düşüşü; \"en kötü anda ne kadar geride kaldım\". Örnek: 120'den 84'e inip sonra toparlandıysa MaxDD %30.",
    holdout: "Holdout (saklı veri) ve geliştirme dönemi: kurallar geliştirme döneminde seçilir; holdout en sonda, aday başına BİR KEZ açılır. \"Geliştirme CAGR\" iyimser, \"Holdout CAGR\" daha dürüst ölçüdür. Örnek: 2018–2023 geliştirme, 2024–2026 holdout.",
    kiyas: "Kıyas: bir stratejinin yenmesi gereken basit seçenek (ör. QQQ ya da BTC al-tut, XU030). Kıyası yenmeyen strateji, emek ve risk karşılığı fazladan bir şey vermiyor demektir. Örnek: Nova'nın (Nasdaq Momentum 10) kıyası QQQ al-tut'tur.",
    bolunme: "Bölünme (split): şirketin hisse sayısını çoğaltıp fiyatı aynı oranda düşürmesi; değer değişmez. Örnek: 1'e 4 bölünmede 10 adet × 400 $ → 40 adet × 100 $. Portföyüm'de \"Bölünme\" işlemiyle girilir.",
    acilisBakiyesi: "Açılış bakiyesi: Portföyüm'e başlarken bir hesaptaki mevcut adet ve nakdi tek kayıtla girmek (geçmiş işlemleri tek tek yazmadan). Örnek: 1 Ekim'de 12 adet QQQ ve 350 $ nakit.",
    gerceklesenKz: "Gerçekleşen K/Z: satılarak kesinleşmiş kâr ya da zarar. Elde tutulan varlığın kâğıt üstündeki kârı \"gerçekleşmemiş\"tir. Örnek: 100 $'a aldığınızı 130 $'a sattınız → 30 $ gerçekleşen kâr.",
    sabitleme: "Sabitleme: bir modelin kurallarının (ağırlıklar, dengeleme, sürüm) ileri izlemeden önce dosyada dondurulması. Sonradan değiştirilemez; değişiklik ancak yeni sürüm olarak yazılır. Örnek: Simurg'un sürüm 2 kuralı (bant ±10 puan) ilk ileri günden önce sabitlendi.",
    laboratuvar: "Laboratuvar: varlık kataloğundan portföy kurup geçmişte deneyen araştırma bölümü (Portföy › Laboratuvar). Gerçek emir üretmez; gerçek portföy için tek uygulama yeri Portföy › Bu ay'dır. Örnek: %60 QQQ + %40 IEF'i 2008'den bugüne deneyip krizlerdeki düşüşüne bakmak.",
    varyasyon: "Varyasyon: aynı portföyün küçük farklarla (ağırlık, dengeleme sıklığı, bant) birlikte denenen kopyaları. Sonuç ayarlara çok duyarlıysa kırılgandır. Her varyasyon deneme sayacına girer. Örnek: aynı portföyü aylık, üç aylık ve ±5 puan bantla dengelemek = 3 varyasyon.",
    krizDonemi: "Kriz dönemi: 2008, 2020 Mart, 2022 gibi sert düşüş aralıkları. Simülasyon her kriz için o aralıktaki getiri ve düşüşü ayrıca gösterir. Örnek: 2022'de QQQ yaklaşık −%33.",
    uygulamaFarki: "Uygulama farkı: model portföyün getirisi ile sizin gerçek portföyünüzün (Portföyüm) aynı dönemdeki getirisi arasındaki fark (puan). Dolum fiyatı, tam adet yuvarlaması, ücret ve atlanan işlemlerden doğar. Örnek: model %3,0, gerçek %2,2 → fark −0,8 puan.",
    kolKatkisi: "Kol katkısı: toplam getirinin hangi koldan (QQQ, Kairos ya da tek tek hisseler) geldiği; kolun ağırlığı × kolun getirisi. Örnek: %50 ağırlıklı QQQ %4 kazandı → katkı 2 puan.",
    carino: "Carino bağlama: günlük ya da aylık katkıları çok dönemde toplarken bileşik getiri farkını düzelten yöntem; böylece kol katkılarının toplamı toplam getiriye tam eşit çıkar. Örnek: QQQ 6 puan + Kairos 9 puan katkı = toplam %15 getiri (düzeltmesiz toplam %14,6 ya da %15,4 çıkabilirdi).",
    olculmemis: "Ölçülmemiş birleşim: kabul edilmiş bir şablonla birebir aynı olmayan tasarım. Geçmiş simülasyonu yalnız bilgi verir; ön kayıtlı testten geçmediği için kabul DEĞİLDİR ve gerçek emir listesi açılmaz. Örnek: %60 QQQ + %40 Kairos, kabul edilmiş %50/%50 şablonundan farklı olduğu için ölçülmemiştir.",
    kendiTasarim: "Kendi tasarımınız: Tasarımcı kurucusunda kaydedip izlemeye aldığınız birleşim. Model izleme'de \"ölçülmemiş\" etiketiyle 100 tabanlı izlenir; deneme sayacına girmez, emir listesi açılmaz; en çok 3 tane. Örnek: %70 QQQ + %30 Kairos'u kaydedip izlemeye alırsanız bir sonraki karar gününden itibaren 100'den başlar.",
    tasarimSurumu: "Tasarım sürümü ve yürürlük: kayıtlı tasarım yerinde değişmez; değişiklik yeni sürüm olarak eklenir ve bir sonraki karar gününden itibaren geçerli olur. Önceki günler eski sürümle hesaplanmış olarak kalır. Örnek: 15 Ekim'de ağırlığı değiştirirseniz sürüm 2, ay sonundaki karar gününde yürürlüğe girer.",
    gunIciSira: "Aynı gün sırası: aynı gün birden çok işlem varsa hangisinin önce sayılacağı (küçük sayı önce). Örnek: aynı gün önce sattınız, parasıyla aldınız → satış 1, alış 2; böylece nakit yersiz yere eksiye düşmez.",
    enBuyukKalan: "En büyük kalan yuvarlaması: tam adet alımda her hisse önce aşağı yuvarlanır, kalan nakitle kesir payı en büyük hisselerden birer adet daha alınır (nakdi aşmadan). Model tam yatırımlı olduğundan nakitte kalan pay küçülür. Örnek: 3000 $'lık payla 1581 $'lık hisseden 1 adet alınır; kalan nakit en çok yaklaşan hisseye birer adet daha olarak dağıtılır.",
    hucumSenaryo: "Kairos serisi senaryosu: Kairos'un geçmişi tek bir ölçümdür; risk üç biçimde denenir: ölçülen (iyimser), getirisi yarıya indirilmiş, ve BTC al-tut ile değiştirilmiş (kötümser). Karar için kötümser senaryoda da kabul edilebilir olmalı. Örnek: ölçülende düşüş %25, BTC al-tut senaryosunda %45 ise karar %45'e göre verilir.",
    eksikVeri: "Eksik veri: bazı varlıkların geçmişi daha kısaysa ne yapılacağı. \"Kırp\" = hepsinin verisinin olduğu ortak başlangıçtan başla; \"sonradan katıl\" = varlık, verisi başladığı gün portföye girer. Örnek: bir ETF 2012'de başladıysa \"kırp\" bütün portföyü 2012'den başlatır.",
    sha256: "SHA-256 özeti: bir dosyanın parmak izi. Dosyada tek harf değişse özet tamamen değişir; böylece kaydın sonradan değiştirilmediği doğrulanır. Zincirde her kayıt bir öncekinin özetini taşır. Örnek: Ekim raporunun özeti a3f9… ise dosya değişirse özet bambaşka çıkar ve zincir \"bozuk\" görünür.",
    tlGetirisi: "TL getirisi: getirinin Türk lirası cinsinden hesabı (BIST modelleri). Dolarla karşılaştırmak için kur değişimi de hesaba katılmalı. Örnek: TL'de %30 kazanç, dolar TL karşısında %20 değer kazandıysa dolar cinsinden ≈ %8.",
    dsr: "DSR (düzeltilmiş Sharpe): çok sayıda deneme yapıldığında şansla çıkan yüksek Sharpe'ı düzelten ölçü; deneme sayısı arttıkça düşer. Örnek: 800 denemeden en iyisinin Sharpe'ı 1,4 olsa da DSR çok daha düşük çıkabilir.",

    // ── Araştırma: göstergeler ve backtest ──────────────────────────────
    ema: "EMA (üssel hareketli ortalama): son fiyatlara daha çok ağırlık veren ortalama; SMA'dan daha hızlı döner. Örnek: EMA 20 son 20 mumu, yenilere ağırlık vererek ortalar.",
    sma: "SMA (basit hareketli ortalama): son N kapanışın düz ortalaması. Örnek: SMA 100 = son 100 günün ortalaması; fiyat bunun altına inince trend zayıf sayılır.",
    vwap: "VWAP (hacim ağırlıklı ortalama fiyat): dönem içinde işlem gören her fiyatın hacmiyle ağırlıklandırılmış ortalaması; gün/hafta başında sıfırlanır. Fiyat VWAP üstündeyse alıcılar baskın sayılır. Örnek: günlük VWAP 60 000 $, fiyat 61 000 $ → fiyat ortalamanın üstünde.",
    rsi: "RSI (göreli güç endeksi): son yükselişlerin düşüşlere oranından 0–100 arası değer. 70 üstü \"aşırı alım\", 30 altı \"aşırı satım\" diye okunur. Örnek: RSI-7 = son 7 mum.",
    fvg: "FVG (adil değer boşluğu): üç mumluk hızlı harekette ilk ve üçüncü mumun fitillerinin örtüşmediği boşluk. Fiyat sonradan bu boşluğu doldurmaya dönebilir. Örnek: 1. mumun tepesi 100, 3. mumun dibi 104 → 100–104 arası boşluk.",
    orderBlock: "Order block (emir bloğu): sert bir hareketten hemen önceki son ters yönlü mumun bölgesi; büyük emirlerin girdiği yer olduğu varsayılır ve destek/direnç gibi okunur. Örnek: sert yükselişten önceki son kırmızı mumun 98–100 aralığı.",
    atr: "ATR (ortalama gerçek aralık): bir mumun tipik oynaklığı (yüksek − düşük, boşluklar dahil). Stop mesafesi için kullanılır. Örnek: ATR 1500 $ ise 2 ATR stop ≈ 3000 $ aşağıda.",
    bollinger: "Bollinger bantları: hareketli ortalamanın iki yanında, standart sapmanın katı kadar uzaklıkta iki bant. Bant genişliği oynaklığı gösterir; fiyat banda değince aşırı uzama sayılabilir. Örnek: SMA 20 ± 2 standart sapma.",
    gosterge: "Gösterge: fiyat ve hacimden hesaplanan seri (ortalama, RSI, bant…). Gösterge havuzundaki her gösterge geleceği görmeden hesaplanır ve ilk mumlarda ısınma süresi boyunca boştur. Örnek: SMA 200 ilk 199 mumda boş, 200. mumdan itibaren dolu.",
    wfe: "WFE (walk-forward verimi): görülmemiş test dilimindeki yıllık getirinin, ayarın seçildiği eğitim dilimindeki yıllık getiriye oranı. 1'e yakın = ayar yeni veride de tutuyor; 0,5'in altı = geçmişe uydurma şüphesi. Örnek: eğitimde %20, testte %12 → WFE 0,6.",
    isinma: "Isınma dönemi: göstergenin hesaplanabilmesi için gereken ilk mumlar (ör. SMA 200 için 200 gün). Bu dönemde strateji işlem yapmaz. Örnek: 3 yıllık backtestte ilk 200 gün gri gölgeyle gösterilir.",
    optimizasyon: "Parametre taraması (optimizasyon): bir stratejinin ayarlarını birçok değerle deneyip en iyisini bulmak. En iyi nokta çoğu zaman şanstır; komşu değerler de iyiyse (plato) daha güvenilir. Her deneme sayaca girer. Örnek: SMA periyodunu 50–200 arasında 10'ar denemek = 16 deneme.",
    zamanDilimi: "Zaman dilimi: bir mumun kapsadığı süre. 5m = 5 dakika, 1h = 1 saat, 4h = 4 saat, 1d = 1 gün. Kairos ve Tao günlük (1d) kurallardır; 5 dakikada denemek anlamsız ve yavaştır. Örnek: 3 yıl günlük mum ≈ 1 100 mum; 5 dakikalıkta ≈ 315 000 mum.",
    mum: "Mum: bir zaman diliminin açılış, en yüksek, en düşük ve kapanış fiyatı (ve hacmi). Örnek: günlük mum = o günün dört fiyatı.",
    backtest: "Backtest: bir kuralı geçmiş veride çalıştırmak. Ücret ve kayma dahil edilir; ama geçmiş geleceği garanti etmez, sonuç iyimser olabilir. Örnek: Kairos'u 2023–2026 günlük mumlarda çalıştırıp özsermaye eğrisine bakmak.",

    // ── Coin tarama ve veri kaynakları ────────────────────────────────────
    cex: "CEX (merkezî borsa): Binance gibi bir şirketin işlettiği borsa; paranız borsanın cüzdanındadır. Örnek: bir token Binance'te listelenince CEX listelemesi var sayılır.",
    dex: "DEX (merkeziyetsiz borsa): akıllı sözleşmeyle çalışan, cüzdandan doğrudan işlem yapılan borsa (Uniswap, PancakeSwap). Fiyat likidite havuzlarından oluşur. Örnek: yeni bir token önce Uniswap'te işlem görür.",
    evm: "EVM: Ethereum ve onunla uyumlu zincirlerin (BNB Chain, Base, Arbitrum…) ortak çalışma ortamı; bu zincirlerde aynı sorgular çalışır. Örnek: aynı sözleşme adresi biçimi (0x…) Ethereum ve Base'de geçerlidir.",
    rpc: "RPC: zincirden veri okumak için bağlanılan sunucu adresi. Ücretsiz RPC'ler istek sınırı koyar; bozulursa sahip/yetki bilgisi alınamaz. Örnek: dakikada 25 istek sınırlı ücretsiz BNB Chain RPC'si.",
    tos: "ToS (kullanım şartları): bir veri kaynağının izin verdiği kullanım. Kazımayı yasaklayan kaynak (ör. Etherscan) Pusula'da kullanılmaz. Örnek: CoinGecko verisi en çok 24 saat önbellekte tutulur.",
    kota: "Kota: bir kaynağın belli sürede izin verdiği istek sayısı (ör. dakikada 30, ayda 10 000). Kota dolunca kaynak geçici olarak cevap vermez; sonraki taramada yeniden denenir. Örnek: dakikada 30 istek sınırlı kaynakta 40 coini taramak iki dakika sürer.",
    envanter: "Envanter: kullanılan bütün veri kaynaklarının listesi — ne verdiği, ücretsiz kotası, kullanım şartı, bozulursa neyin kaybolacağı. Örnek: Veri ekranındaki dikkat listesi kaynak tablosu.",
    manifest: "Manifest: günlük arşivdeki dosyaların listesi ve her birinin özeti (SHA-256); arşivin eksiksiz ve değişmemiş olduğunu doğrulamaya yarar. Örnek: 2026-10-10 arşivinde 37 dosya ve her birinin özeti.",
    mvrv: "MVRV: piyasa değerinin \"gerçekleşmiş değere\" (coinlerin en son el değiştirdiği fiyatlarla toplam değeri) oranı. Yüksek MVRV = sahiplerin çoğu kârda, satış baskısı artabilir. Örnek: MVRV 3 = piyasa değeri sahiplerin maliyetinin 3 katı.",
    sopr: "SOPR: o gün harcanan coinlerin satış fiyatının alış fiyatına oranı. 1'in üstü = satanlar kârda, altı = zararına satıyorlar. Örnek: SOPR 1,05 = ortalama satış %5 kârla.",
    tvl: "TVL (kilitli toplam değer): bir protokolün akıllı sözleşmelerine yatırılmış varlıkların dolar değeri. Hızla düşen TVL kullanıcıların çıktığını gösterebilir. Örnek: TVL bir haftada 50 milyon $'dan 10 milyon $'a indiyse likidite çekiliyor.",
    // 73.9 Piyasa bağlamı (yalnız bilgi kartları)
    gex: "GEX (gamma maruziyeti): opsiyon piyasa yapıcılarının fiyat %1 oynayınca yapmaları beklenen alım-satımın dolar karşılığı (varsayım: alımlarda uzun, satımlarda kısa gamma). Artı GEX oynaklığı bastırıcı, eksi GEX büyütücü diye okunur. Örnek: −11 milyon $ = %1 düşüşte piyasa yapıcılar yaklaşık 11 milyon $ satar.",
    maxPain: "Max pain: bir vadede opsiyon alıcılarına ödenecek toplam iç değeri en aza indiren kullanım fiyatı. Örnek: BTC vadesinde max pain 80.000 = fiyat vadede 80.000 olsaydı alıcılar en az kazanırdı.",
    iv: "IV (örtük oynaklık): opsiyon fiyatından geri hesaplanan, piyasanın beklediği yıllık oynaklık. IV sırası son bir yılın en düşüğü ile en yükseği arasındaki yeridir (0–100). Örnek: IV %45 = piyasa bir yıllık ±%45 oynama bekliyor.",
    carpiklik: "25Δ çarpıklık: delta −0,25 satım opsiyonunun IV'si ile delta +0,25 alım opsiyonunun IV'si arasındaki fark (puan). Artı = düşüşe karşı koruma daha pahalı. Örnek: +4,6 puan = satım IV'si alımınkinden 4,6 puan yüksek.",
    oi: "OI (açık pozisyon): vadeli işlemlerde kapatılmamış sözleşmelerin toplam değeri. z-skoru, bugünkü OI'nin son 30 günün ortalamasından kaç standart sapma uzakta olduğudur. Örnek: z = 2 → OI son ayın olağan aralığının üstünde.",
    cvd: "CVD (birikimli hacim farkı): piyasa emriyle alanların hacmi eksi piyasa emriyle satanların hacmi, toplanarak. Taker al/sat oranı aynı bilginin oranı. Örnek: 7 günde +197 BTC = alıcı tarafı piyasa emri daha çok.",
    sec: "SEC: ABD Sermaye Piyasası Kurulu (Securities and Exchange Commission). Şirketler önemli olayları 8-K, çeyrek sonuçlarını 10-Q, yıllık raporu 10-K formuyla EDGAR sisteminde yayımlar. Örnek: finans direktörü istifası 8-K ile bildirilir.",
    fomc: "FOMC: ABD Merkez Bankası'nın (Fed) faiz kararı veren kurulu; yılda 8 planlı toplantı. Karar New York saatiyle 14:00'te açıklanır. Örnek: \"politika faizi %3,75–4,00 aralığında sabit\".",
    cot: "COT: ABD vadeli piyasa düzenleyicisinin (CFTC) her cuma yayımladığı, salı günkü pozisyonları gösteren rapor. Kaldıraçlı fonlar = hedge fonları ve benzerleri. Örnek: CME Bitcoin'de kaldıraçlı fonlar net −4.900 kontrat (short).",
    dxy: "DXY (dolar endeksi): doların euro, yen, sterlin, Kanada doları, İsveç kronu ve İsviçre frangına karşı ağırlıklı değeri. Pusula ICE formülüyle altı kurdan kendisi hesaplar (sentetik). Örnek: 102 → 100'e göre dolar biraz güçlü.",
    netLikidite: "Net likidite: Fed bilançosu − Hazine'nin Fed'deki hesabı (TGA) − gecelik ters repo. Piyasadaki dolar bolluğunun kaba ölçüsü (haftalık). Örnek: 13 haftada −130 milyar $ = likidite daralıyor.",
    stablecoin: "Stablecoin: değeri dolara (ya da başka bir paraya) sabitlenmiş token, ör. USDT, USDC. Botlar trend kapalıyken USDT'de bekler. Örnek: 1 USDT ≈ 1 $.",
    unlock: "Unlock (kilit açılımı): kurucu/yatırımcı payı olarak kilitli tutulan tokenların takvime göre serbest kalması. Büyük açılım satış baskısı getirebilir. Örnek: dolaşımdaki arzın %10'u kadar token gelecek hafta açılacaksa fiyat baskı altında kalabilir.",
    honeypot: "Honeypot: alınabilen ama satılamayan (ya da satışta ağır vergi kesilen) tuzak token. Tarama bu işareti sözleşmeyi denetleyen ücretsiz kaynaktan alır. Örnek: alış vergisi %0, satış vergisi %99 olan token.",
    rdap: "RDAP: alan adının kayıt tarihi ve sahiplik bilgisini veren resmî sorgu (WHOIS'in yenisi). Coin tarama alan adının token'dan önce mi sonra mı alındığına buradan bakar. Örnek: token 1 Mart'ta, alan adı 20 Şubat'ta alınmış → 9 gün önce.",
    goplus: "GoPlus: token sözleşmesinin güvenliğini (mint yetkisi, honeypot, vergi, sahip yetkileri) ücretsiz denetleyen kaynak. Örnek: \"sahip yeni token basabilir\" işareti GoPlus'tan gelir.",
    rugcheck: "RugCheck: Solana tokenlarının risklerini (yetkiler, likidite kilidi, yoğunlaşma) ücretsiz denetleyen kaynak. Örnek: \"mint yetkisi kapatılmamış\" uyarısı.",
    hizSiniri: "İstek sınırı (HTTP 429): kaynak kısa sürede çok istek aldığı için geçici olarak cevap vermiyor. Hata değil; bir sonraki taramada kendiliğinden yeniden denenir. Örnek: \"GeckoTerminal istek sınırına takıldı (429) — bir sonraki taramada yeniden denenir\".",
    alanAdi: "Alan adı bayrağı: projenin web sitesi token'dan en çok 30 gün ÖNCE alınmışsa kırmızı bayrak (aceleyle kurulmuş proje işareti). Token'dan SONRA alınmışsa yalnız bilgi — çoğu proje önce token, sonra site açar. Örnek: token 1 Mart, alan adı 25 Şubat → kırmızı bayrak; alan adı 12 Mart → yalnız bilgi.",
    mintYetkisi: "Mint yetkisi: sözleşme sahibinin istediği zaman yeni token basabilmesi; arzı sulandırma riski. Örnek: sahip bir gecede arzı ikiye katlarsa elinizdeki payın değeri yarıya iner.",
    lpKilidi: "LP kilidi: DEX likiditesinin belirli bir süre çekilemez hâle getirilmesi. Kilitsiz likidite bir anda çekilebilir (rug pull). Örnek: likidite 2027'ye kadar kilitli = o tarihe kadar çekilemez.",

    // ── Bölüm A ekranları: bot ve borsa terimleri ───────────────────────
    testnet: "Testnet: Binance'in sahte parayla çalışan deneme ortamının eski adı. Panelde bunun yerine \"demo hesap\" denir (Binance Demo Trading); ikisi de canlı hesap kullanmaz. Örnek: eski ekranlardaki \"Testnet API Key\" = demo hesap anahtarı.",
    p95p99: "Uyarı eşiği / alarm eşiği (eski adı p95 / p99): geçmiş simülasyonlarda görülen değerlerin %95'inin / %99'unun altında kaldığı sınır. Örnek: alarm eşiği %34 ise simülasyonların yalnız %1'inde düşüş %34'ü aştı; ileri testte aşılırsa model şüpheli sayılır.",
    veto: "Yatay piyasa filtresi (eski adı range vetosu, D3): fiyat yatay bantta iken trend girişini engelleyen ek kural. İleri testte yan deneme olarak izlenir; kaç gün engellediği ve günlük kurala göre farkı sayılır.",
    cbdr: "CBDR (merkez bankası saatlerindeki dar aralık): EUR/USD'de önceki iş gününün New York 14:00–20:00 arasındaki mum gövdelerinin en yüksek ve en düşüğü. İleri testteki model, ertesi sabah Londra açılışında (NY 02:00–04:00) fiyat bu aralığın bir aralık boyu dışına taşarsa ters yönde işleme girer. Örnek: aralık 1,1650–1,1670 (20 pip), satış gününde satış limiti 1,1690.",
    rBirimi: "R (risk birimi): bir işlemin kârı ya da zararı, stop mesafesine bölünerek. +1R = stopa kadar olan mesafe kadar kazanç, −1R = stop olmuş tam kayıp. Örnek: stop 30 pip uzakta, işlem 15 pip kârla kapandı → +0,5R. Ortalama R sıfırın üstündeyse model maliyet sonrası kazandırıyor demektir.",
    ucGunlukAday: "3 günlük karar (yan deneme): bot kararını her gün değil 3 günde bir verseydi ne olurdu — günlük kurala göre birikimli fark izlenir. Artı = 3 günlük daha iyi. Karar günü gelmeden yorum yok.",
    dca: "DCA (kademeli alım): fiyat düştükçe önceden belirlenmiş adımlarda ek alım yapıp ortalama maliyeti düşürmek. Örnek: 100 $'dan al, %5 düşünce bir daha, %10'da bir daha.",
    donchian: "Donchian kanalı: son N günün en yüksek ve en düşük fiyatından çizilen kanal. Üst sınırı kırınca al, alt sınırı kırınca çık — klasik trend takibi. Örnek: Donchian 20 = fiyat son 20 günün zirvesini geçince alış.",
    long: "Long / short: long = fiyat yükselince kazanan (alış) pozisyon; short = fiyat düşünce kazanan (açığa satış) pozisyon. Kairos ve Tao yalnız long çalışır. Örnek: 100 $'dan long, fiyat 110 $ → %10 kâr; short olsaydı %10 zarar.",
    tp: "TP (kâr al): pozisyonu belirli kârda kendiliğinden kapatan emir. Örnek: 100 $'dan alım, TP %5 → 105 $'da satış.",
    nominal: "Nominal (pozisyon büyüklüğü): pozisyonun toplam değeri, kaldıraç dahil. Örnek: 1000 $ teminat × 3 kaldıraç → 3000 $ nominal. Kâr/zarar nominale göre oluşur.",
    reduceOnly: "Yalnız azalt (reduceOnly): emrin yalnız mevcut pozisyonu küçültebileceği, asla yeni ya da ters pozisyon açamayacağı işaret. Kapatma ve stop emirlerinde güvenlik için kullanılır. Örnek: 0,1 BTC long varken 0,2 BTC'lik yalnız-azalt satış emri yalnız 0,1 BTC kapatır, short açmaz.",
    pozisyonModu: "Pozisyon modu: vadelide tek yön (bir sembolde tek net pozisyon) ya da iki yön (aynı anda long ve short ayrı ayrı). Botlar tek yön kullanır. Örnek: tek yönde BTC'de 0,1 long varken 0,1 satış pozisyonu kapatır; iki yönde ayrı bir short açar.",
    canliEmirKilidi: "Canlı emir kilidi: canlı hesaba emir göndermeyi kapatan güvenlik kilidi. Kilit açılmadan panel gerçek borsaya emir gönderemez. Örnek: canlı hesap şartları (2027-01-05 en erken) sağlanmadan kilit açılmaz.",
    tavan: "Tavan: tek emir ya da günlük toplam için konmuş en yüksek tutar. Tavanı aşan emir gönderilmez; yanlışlıkla verilen büyük emri önler. Örnek: tek emir tavanı 500 $ ise 600 $'lık emir reddedilir.",
    spot: "Spot: varlığın kendisini alıp satmak (kaldıraçsız). Aldığınız BTC hesabınızda durur. Örnek: 0,01 BTC spot alım = cüzdanınızda 0,01 BTC.",
    vadeli: "Vadeli işlem: varlığın kendisi yerine fiyatına dayalı sözleşme; kaldıraç ve short mümkündür, tasfiye riski vardır. Örnek: 100 $ teminatla ×3 kaldıraçlı 300 $'lık BTC pozisyonu.",
    perpetual: "Perpetual (vadesiz vadeli, perp): vade tarihi olmayan vadeli sözleşme; fiyatı spota fonlama (funding) ödemeleriyle bağlı tutulur. Örnek: BTCUSDT perp — vadesi yok, 8 saatte bir fonlama ödenir ya da alınır.",
    kaldirac: "Kaldıraç: teminatın katı kadar pozisyon açmak. Örnek: × 3 kaldıraçla %10 düşüş teminatta %30 kayıp demektir; kâr da zarar da büyür.",
    healthchecks: "Sağlık sinyali (healthchecks): bot her çalıştığında ücretsiz izleme servisine \"yaşıyorum\" der. Period = beklenen aralık, Grace = gecikmeye tanınan ek süre; ikisi aşılırsa uyarı gelir. Örnek: Period 1 gün, Grace 2 saat → bot 26 saat sinyal vermezse uyarı.",
    chatId: "Chat id: Telegram'da mesajların gideceği sohbetin numarası. Gizli bilgi sayılmaz ama panelde maskeli gösterilir. Örnek: 12••••89 biçiminde görünür.",
    c0: "C0 (ideal gölge): botun ücret ve kayma dahil ama gecikmesiz, kusursuz uygulanmış hâli. Gerçek sonuç bununla karşılaştırılır. Örnek: C0 %5, gerçek %4,6 → uygulama kaybı 0,4 puan.",
    btcAyagi: "BTC ayağı: Kairos/Tao'nun BTC tutan kısmı. Demo hesapta vadeli (perp) long olarak tutulur; canlı hesapta spot BTC teminat olarak kullanılır — sonuç küçük farklarla aynıdır. Örnek: Kairos trend açıkken BTC ayağı hesabın %100'ü.",
    botAdlari: 'Bot adları (72.0): Kairos (eski adı Hücum) · Tao (Denge) · Nova (QQQ M10) · Lydia (BIST M10) · Simurg (837). Yalnız görünen ad değişti; adresler ve kayıtlar aynı. Adın üzerine gelince anlamı görünür.',
    demoGercekFark: "Demo ↔ gerçek borsa farkı: demo hesap gerçek borsa akışını kullanır ama dolumlar, likidite, fonlama ve bazı kurallar gerçekte farklı olabilir. Demo sonucu canlı hesabın küçük ölçekli provasıdır, garantisi değil. Örnek: demoda tam dolan bir emir gerçekte kısmen dolabilir."
  };

  function metin(anahtar) { return TERIMLER[anahtar] || ''; }

  /* ── Açıklama balonu (61.1, panel denetimi A-40 / B-35) ──────────────────
   * Eskiden "?" açıklamayı sağ altta geçici bildirim olarak gösteriyordu;
   * terimden uzakta çıkıp kayboluyordu. Şimdi balon TERİMİN YANINDA açılır:
   * tıkla/dokun → açılır, tekrar tıkla / Esc / dışarı tıkla / kaydır → kapanır;
   * aynı anda tek balon.
   *
   * Konum için inline stil YAZILMAZ (panel kuralı). Balon "?" düğmesinin
   * içine eklenir ve `position: fixed` + `top/left: auto` ile "durağan
   * konumunda" (düğmenin hemen altında, düğmeye ortalı) durur; fixed olduğu
   * için kaydırılabilir tablo kaplarında kırpılmaz. Ekrandan taşarsa yalnız
   * SINIF eklenir: `--sag` (sağ kenara 16 px), `--sol` (sol kenara 16 px),
   * `--yukari` (düğmenin üstüne). Genişlik CSS'te en çok ekran − 32 px.
   * DOM yoksa (eski ortam / test taklidi) bildirimle gösterilir.
   */
  let acik = null;          // { dugme, balon }
  let belgeBagli = false;
  let sayac = 0;

  function icinde(kap, hedef) { return !!(kap && hedef && typeof kap.contains === 'function' && kap.contains(hedef)); }

  function kapat(odakGeri) {
    if (!acik) return false;
    const { dugme, balon } = acik;
    acik = null;
    if (balon.parentNode && balon.parentNode.removeChild) balon.parentNode.removeChild(balon);
    dugme.setAttribute('aria-expanded', 'false');
    if (dugme.removeAttribute) dugme.removeAttribute('aria-describedby');
    if (odakGeri && typeof dugme.focus === 'function') dugme.focus();
    return true;
  }

  function belgeyeBagla() {
    if (belgeBagli || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    belgeBagli = true;
    document.addEventListener('keydown', (e) => {
      if (!acik || !e || (e.key !== 'Escape' && e.key !== 'Esc')) return;
      if (e.preventDefault) e.preventDefault();
      kapat(true);
    });
    // Yakalama evresinde: düğmenin kendi tıklaması (aç/kapa) ve balonun içi hariç her tıklama kapatır.
    document.addEventListener('click', (e) => { if (acik && !icinde(acik.dugme, e && e.target)) kapat(false); }, true);
    document.addEventListener('scroll', (e) => { if (acik && !icinde(acik.balon, e && e.target)) kapat(false); }, true);
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('resize', () => kapat(false));
      global.addEventListener('hashchange', () => kapat(false));
    }
  }

  function yerlestir(balon) {
    if (typeof balon.getBoundingClientRect !== 'function' || !balon.classList) return;
    const de = (typeof document !== 'undefined' && document.documentElement) || {};
    const gen = global.innerWidth || de.clientWidth || 0;
    const yuk = global.innerHeight || de.clientHeight || 0;
    if (!gen || !yuk) return;
    const r = balon.getBoundingClientRect();
    if (r.right > gen - 8) balon.classList.add('yardim-balon--sag');
    else if (r.left < 8) balon.classList.add('yardim-balon--sol');
    if (r.bottom > yuk - 8 && r.top - r.height - 32 > 8) balon.classList.add('yardim-balon--yukari');
  }

  function ac(dugme, m) {
    kapat(false);
    belgeyeBagla();
    const id = `yardim-balon-${++sayac}`;
    const balon = AG.dom.el('span', { class: 'yardim-balon', role: 'tooltip', id, text: m });
    dugme.appendChild(balon);
    dugme.setAttribute('aria-expanded', 'true');
    dugme.setAttribute('aria-describedby', id);
    acik = { dugme, balon };
    yerlestir(balon);
    return balon;
  }

  /** "?" tıklaması: açık balon bu düğmenindeyse kapatır, değilse açar. Balonun içine tıklamak bir şey yapmaz. */
  function tikla(dugme, m, e) {
    if (e) {
      if (e.preventDefault) e.preventDefault();
      // Tablo başlığında sıralamayı, kartta katı açıp kapamayı tetiklemesin.
      if (e.stopPropagation) e.stopPropagation();
      if (acik && acik.dugme === dugme && icinde(acik.balon, e.target)) return;
    }
    if (acik && acik.dugme === dugme) { kapat(false); return; }
    if (typeof document === 'undefined' || !AG.dom || typeof dugme.appendChild !== 'function') {
      if (AG.bildir) AG.bildir(m, 'bilgi');
      return;
    }
    ac(dugme, m);
  }

  /** Küçük "?" — klavyeyle odaklanabilir; açıklama title + aria-label'da, tıklayınca terimin yanında balonda. */
  function yardim(anahtar) {
    const m = metin(anahtar);
    if (!m || !AG.dom) return null;
    const d = AG.dom.el('button', {
      type: 'button', class: 'yardim-isareti', title: m, 'aria-label': `Açıklama: ${m}`, 'aria-expanded': 'false', text: '?'
    });
    d.addEventListener('click', (e) => tikla(d, m, e));
    return d;
  }

  /**
   * İşaretlemedeki statik "?" düğmeleri (`<button class="yardim-isareti" data-sozluk="anahtar">`)
   * açıklamayı buradan alır — metin HTML'e ikinci kez yazılmaz.
   */
  function bagla(kok) {
    if (!kok || !kok.querySelectorAll) return 0;
    let n = 0;
    kok.querySelectorAll('[data-sozluk]').forEach(d => {
      if (d.__sozlukBagli) return;
      const m = metin(d.getAttribute('data-sozluk'));
      if (!m) return;
      d.__sozlukBagli = true;
      d.setAttribute('title', m);
      d.setAttribute('aria-label', `Açıklama: ${m}`);
      d.setAttribute('aria-expanded', 'false');
      d.addEventListener('click', (e) => tikla(d, m, e));
      n++;
    });
    return n;
  }

  /** Açık balonu kapatır (sayfa değişiminde ya da testte). Kapattıysa true. */
  function balonuKapat() { return kapat(false); }
  /** Açık balon (yoksa null) — test ve ekran görüntüsü üreticisi için. */
  function acikBalon() { return acik ? acik.balon : null; }


  /* ── BOT ADLARI (72.0, kullanıcı kararı 2026-10-22) ──────────────────────
   * Botların EKRANDA görünen adları tek yerde. Ad KİMLİKTEN türetilir (hucum, denge, m-qqq-m10,
   * m-bist-m10, m-837): sunucu eski sürümdeyse yanıtındaki ad metni ("Hücum") gösterilmez.
   * İç kimlikler, adresler (#/botlar/hucum), API yolları ve JSON alanları değişmedi.
   * Sunucu tarafındaki eşi lib/botAdlari.js (aynı tablo; scripts/panel-botlar-testi.js eşitliği denetler).
   *
   *   AG.botAd.ad(k) 'Kairos' · alt(k) kısa alt yazı · anlam(k) tek satır anlam · tam(k) 'Kairos · …'
   *   AG.botAd.eski(k) eski ad · cevir(metin) serbest metindeki eski adları yenisine çevirir
   *   AG.botAd.oge(k, { alt }) ad (+ alt yazı) span'ı; üzerine gelince / dokununca anlam (title)
   */
  const BOTLAR = Object.freeze({
    hucum: Object.freeze({ ad: 'Kairos', eski: 'Hücum', alt: 'BTC trendi + coin sepeti',
      anlam: 'Kairos: "doğru an"ın tanrısı — kırılımı geçerken yakalayan bot.' }),
    denge: Object.freeze({ ad: 'Tao', eski: 'Denge', alt: 'yarı BTC + coin sepeti, sakin',
      anlam: 'Tao: "yol" — inişle çıkışın dengesi.' }),
    'm-qqq-m10': Object.freeze({ ad: 'Nova', eski: 'QQQ M10', alt: 'Nasdaq Momentum 10',
      anlam: 'Nova: gökte birden parlayan yeni yıldız — teknoloji.' }),
    'm-bist-m10': Object.freeze({ ad: 'Lydia', eski: 'BIST M10', alt: 'BIST Momentum 10',
      anlam: 'Lydia: dünyada ilk parayı basan Anadolu krallığı.' }),
    'm-837': Object.freeze({ ad: 'Simurg', eski: '837', alt: '%50 QQQ + %50 Kairos',
      anlam: 'Simurg: iki diyarı birleştiren efsanevi kuş — iki piyasayı birleştiren bot.' })
  });
  const BOT_TAKMA = Object.freeze({
    'strateji:hucum': 'hucum', 'b-hucum': 'hucum', 't-hucum': 'hucum', 'hucum-demo': 'hucum',
    'strateji:denge': 'denge', 'b-denge': 'denge',
    'qqq-m10': 'm-qqq-m10', 'strateji:qqq-m10': 'm-qqq-m10', 't-830': 'm-qqq-m10', nasdaq: 'm-qqq-m10', qqq: 'm-qqq-m10', n10: 'm-qqq-m10',
    'bist-m10': 'm-bist-m10', 'strateji:bist-m10': 'm-bist-m10', 't-840': 'm-bist-m10', bist: 'm-bist-m10', b10: 'm-bist-m10',
    't-837': 'm-837', q837: 'm-837', 837: 'm-837'
  });
  function botKimlik(k) {
    if (k == null) return null;
    const s = String(k);
    return BOTLAR[s] ? s : (BOT_TAKMA[s] || null);
  }
  const botAlan = (k, alan) => { const id = botKimlik(k); return id ? BOTLAR[id][alan] : null; };
  const KAIROS_EK = { un: 'un', a: 'a', da: 'ta', dan: 'tan', u: 'u', daki: 'taki', la: 'la', dur: 'tur' };
  const TAO_EK = { nin: 'nun', ye: 'ya', de: 'da', den: 'dan', yi: 'yu', deki: 'daki', yle: 'yla', dir: 'dur' };
  const HARF = 'A-Za-zÇĞİÖŞÜçğıöşü';
  const RE_TAO_EK = new RegExp(`(?<![${HARF}])Denge'(deki|den|de|nin|ye|yi|yle|dir)(?![a-zçğıöşü])`, 'g');
  const RE_TAO = new RegExp(`(?<![${HARF}])Denge(?![${HARF}'])`, 'g');
  const RE_TAO_B = new RegExp(`(?<![${HARF}])DENGE(?![${HARF}])`, 'g');
  /** Serbest metindeki eski adlar → yeni (lib/botAdlari.js cevir ile aynı kurallar). Yeni adlı metin değişmez. */
  function botCevir(metin) {
    if (typeof metin !== 'string' || !metin) return metin;
    let s = metin;
    s = s.replace(/837 · %50 QQQ \+ %50 Hücum/g, () => 'Simurg · %50 QQQ + %50 Kairos');
    s = s.replace(/837 · QQQ \+ Hücum/g, () => 'Simurg · QQQ + Kairos');
    s = s.replace(/Hücum'(daki|dan|da|un|u|a|la|dur)(?![a-zçğıöşü])/g, (_, e) => `Kairos'${KAIROS_EK[e]}`);
    s = s.replace(/HÜCUM/g, () => 'KAIROS');
    s = s.replace(/Hücum/g, () => 'Kairos');
    s = s.replace(RE_TAO_EK, (_, e) => `Tao'${TAO_EK[e]}`);
    s = s.replace(RE_TAO, () => 'Tao');
    s = s.replace(RE_TAO_B, () => 'TAO');
    s = s.replace(/QQQ M10/g, () => 'Nova');
    s = s.replace(/BIST M10/g, () => 'Lydia');
    s = s.replace(/Nasdaq M10/g, () => 'Nova');
    return s;
  }
  /** Ad (+ isteğe bağlı alt yazı) öğesi; title = anlam (üzerine gelince / uzun dokununca). */
  function botOge(k, o) {
    const id = botKimlik(k);
    if (!id || !AG.dom) return null;
    const b = BOTLAR[id];
    const ic = [AG.dom.el('span', { class: 'bot-ad', text: b.ad })];
    if (o && o.alt) ic.push(AG.dom.el('span', { class: 'bot-ad-alt', text: ` · ${b.alt}` }));
    return AG.dom.el('span', { class: 'bot-ad-kap', title: b.anlam }, ic);
  }
  /**
   * 74.5 (A1 2b): KULLANICININ OLUŞTURDUĞU botlar — tabloda olmayan kimliğin görünen adı sunucunun /api/botlar `adGorunen`'inden
   * (`kaydet(liste)`; Botlar sayfası listeyi her yüklediğinde). Tablodaki kimlikler/takmalar ezilmez (lib/botAdlari.js kaydet ile aynı kural).
   */
  const BOT_EK = Object.create(null);
  function botKaydet(liste) {
    for (const b of (Array.isArray(liste) ? liste : [])) {
      const k = String((b && b.kimlik) || '');
      if (!/^[a-z][a-z0-9]{1,15}$/.test(k) || botKimlik(k) || typeof b.adGorunen !== 'string' || !b.adGorunen.trim()) continue;
      BOT_EK[k] = b.adGorunen.trim().slice(0, 24);
    }
  }
  const botEkAd = (k) => (k != null && Object.prototype.hasOwnProperty.call(BOT_EK, String(k)) ? BOT_EK[String(k)] : null);
  AG.botAd = {
    BOTLAR, TAKMA: BOT_TAKMA, SIRA: Object.freeze(Object.keys(BOTLAR)), kimlik: botKimlik,
    ad: k => botAlan(k, 'ad') || botEkAd(k), alt: k => botAlan(k, 'alt'), anlam: k => botAlan(k, 'anlam'), eski: k => botAlan(k, 'eski'),
    tam: k => { const id = botKimlik(k); return id ? `${BOTLAR[id].ad} · ${BOTLAR[id].alt}` : botEkAd(k); },
    cevir: botCevir, oge: botOge, kaydet: botKaydet,
    /** Bot nesnesi ({ ad, adGorunen }) → görünen ad: kimlikten; tanınmazsa (74.5) kayıtlı yeni bot adı, sonra sunucunun metni çevrilerek. */
    gorunen: b => (b ? (botAlan(b.ad, 'ad') || botEkAd(b.ad) || botCevir(b.adGorunen) || b.ad || '') : '')
  };

  AG.sozluk = { TERIMLER, metin, yardim, bagla, balonuKapat, acikBalon };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.sozluk;
})(typeof window !== 'undefined' ? window : globalThis);
