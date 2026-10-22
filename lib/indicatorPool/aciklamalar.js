/**
 * GÖSTERGE HAVUZU — sade Türkçe açıklamalar ve parametre etiketleri (B-33, panel 61.1).
 * ═══════════════════════════════════════════════════════════════════════════
 * Gösterge sayfası (`indicators.html`) alan adlarını İngilizce kod adıyla gösteriyordu (`period`, `source = close`,
 * `value · fiyat · line · hizalı seri`) ve göstergenin ne olduğu / nasıl okunacağı yazmıyordu. Bu dosya YALNIZ
 * sunumdur: hesaplamaya, ısınmaya, hizalamaya dokunmaz (sözleşme kuralları `contract.js`'te).
 *
 *   ACIKLAMA[key] = { ne, okuma }     ne = gösterge nedir · okuma = grafikte nasıl okunur
 *   PARAM_AD[ad]  = 'Türkçe etiket'   parametre kod adı → ekranda görünen ad (kod adı ipucunda kalır)
 *   GRUP_AD[grup] = 'Türkçe grup adı'
 *
 * `registry.describe()` bunları `aciklama`, `grupAd` ve her parametrenin `etiket` alanına koyar.
 * Yeni gösterge eklenince buraya da satır eklenir — `scripts/panel-arastirma-b-testi.js` her kayıtlı göstergenin
 * açıklaması ve her parametresinin Türkçe etiketi olduğunu denetler.
 */
'use strict';

const GRUP_AD = Object.freeze({
  'hareketli-ortalama': 'Hareketli ortalamalar',
  hacim: 'Hacim',
  fiyat: 'Fiyat dönüşümü',
  momentum: 'Momentum (hız)',
  volatilite: 'Oynaklık',
  yapi: 'Piyasa yapısı',
  ict: 'ICT / akıllı para kavramları',
  coklu: 'Çok sembollü (sembolleri karşılaştırır)',
  bot: 'Botlar (grafikte bot ne gördü)'
});

const ORT = (ad, fark) => ({
  ne: `${ad}: son N mumun kapanış ortalaması${fark ? ` — ${fark}` : ''}.`,
  okuma: 'Fiyat çizginin üstündeyse yükseliş eğilimi, altındaysa düşüş eğilimi. Kısa ortalama uzunu yukarı keserse yükseliş işareti sayılır; tek başına al-sat kuralı değildir.'
});

const ACIKLAMA = Object.freeze({
  ema: ORT('Üssel hareketli ortalama (EMA)', 'son mumlara daha çok ağırlık verir, SMA\'dan hızlı döner'),
  sma: ORT('Basit hareketli ortalama (SMA)', 'her mum eşit ağırlıklı'),
  wma: ORT('Ağırlıklı hareketli ortalama (WMA)', 'ağırlık doğrusal azalır'),
  wema: ORT('Wilder ortalaması (WEMA)', 'RSI ve ATR\'nin kullandığı yavaş üssel ortalama'),
  hma: ORT('Hull ortalaması', 'gecikmeyi azaltmak için ağırlıklı ortalamaların farkından kurulur'),
  dema: ORT('Çift üssel ortalama (DEMA)', 'EMA\'nın EMA\'sıyla gecikmeyi düşürür; ısınması iki kat uzun'),
  vwma: ORT('Hacim ağırlıklı ortalama (VWMA)', 'hacmi yüksek mumlar daha çok sayılır'),
  alma: ORT('Arnaud Legoux ortalaması (ALMA)', 'Gauss ağırlıklı, hem pürüzsüz hem az gecikmeli'),
  t3: ORT('Tillson T3', 'altı kat üssel düzeltme; çok pürüzsüz'),
  vwap_cumulative: { ne: 'Kümülatif VWAP: verinin başından beri hacim ağırlıklı ortalama fiyat (oturum sıfırlaması yok).', okuma: 'Fiyat üstündeyse alıcılar ortalamada kârda. Gün içi kullanım için Dönemsel VWAP daha uygundur.' },
  heikin_ashi: { ne: 'Heikin Ashi: mumları önceki mumla ortalayarak yumuşatan mum dönüşümü.', okuma: 'Art arda gövdesi dolu ve alt fitili olmayan mumlar güçlü eğilim; renk değişimi eğilim zayıflaması. Fiyatlar gerçek işlem fiyatı değildir.' },
  rsi: { ne: 'Göreli güç endeksi (RSI): son N mumda yükselişlerin düşüşlere oranı, 0–100 arası.', okuma: '70 üstü aşırı alım, 30 altı aşırı satım bölgesi sayılır; güçlü eğilimde uzun süre bu bölgelerde kalabilir.' },
  macd: { ne: 'MACD: hızlı ve yavaş EMA farkı, onun sinyal çizgisi ve aradaki sütun (histogram).', okuma: 'MACD sinyal çizgisini yukarı keserse momentum yukarı döner; sütunlar sıfırın üstünde büyüyorsa yükseliş hızlanıyor.' },
  williams_r: { ne: 'Williams %R: kapanışın son N mumun aralığındaki yeri, −100 ile 0 arası.', okuma: '−20 üstü aşırı alım, −80 altı aşırı satım.' },
  aroon: { ne: 'Aroon: son N mumda en yüksek ve en düşük noktanın ne kadar yakın zamanda oluştuğu (0–100).', okuma: 'Yukarı çizgi aşağıdakinin üstündeyse yeni tepeler daha taze → yükseliş eğilimi.' },
  stochastic: { ne: 'Stokastik: kapanışın son N mumun en yüksek–en düşük aralığındaki yeri (%K) ve ortalaması (%D).', okuma: '80 üstü aşırı alım, 20 altı aşırı satım; %K\'nın %D\'yi kesmesi dönüş işareti sayılır.' },
  cci: { ne: 'Emtia kanal endeksi (CCI): tipik fiyatın ortalamasından sapması, ortalama sapmaya bölünmüş.', okuma: '+100 üstü güçlü yukarı, −100 altı güçlü aşağı hareket.' },
  atr: { ne: 'Ortalama gerçek aralık (ATR): bir mumun ortalama hareket genişliği (boşluklar dahil). Yön söylemez.', okuma: 'Yüksek ATR = oynak piyasa. Stop ve pozisyon büyüklüğü genelde ATR katıyla ayarlanır; "pct" fiyatın yüzdesi olarak.' },
  adx: { ne: 'ADX: eğilimin gücü (yönü değil) ve yön göstergeleri +DI / −DI.', okuma: 'ADX 25 üstü belirgin eğilim, 20 altı yatay piyasa. +DI −DI\'nin üstündeyse yön yukarı.' },
  bollinger: { ne: 'Bollinger bantları: N mumluk ortalama ± k standart sapma.', okuma: 'Bantlar daralınca sert hareket yaklaşabilir; fiyatın üst banda değmesi tek başına sat işareti değildir. %B fiyatın bant içindeki yeri (0 alt, 1 üst).' },
  keltner: { ne: 'Keltner kanalı: EMA ± ATR katı.', okuma: 'Kanal dışına kapanış güçlü hareket; Bollinger bantları Keltner\'in içine girerse sıkışma.' },
  donchian: { ne: 'Donchian kanalı: son N mumun en yüksek ve en düşük fiyatı.', okuma: 'Üst kanalın kırılması kırılım (trend takibi) girişidir; Kairos/Tao\'nun Kalkan kolu bu ailedendir.' },
  market_regime: { ne: 'Piyasa rejimi: ADX ve oynaklık oranından "eğilimli / yatay / çok oynak" etiketi.', okuma: 'Strateji seçimi için bağlam: eğilimli rejimde trend takibi, yatayda ortalamaya dönüş daha uygundur.' },
  swings: { ne: 'Salınım noktaları: fiyatın yerel tepe ve dipleri (ATR eşiği ya da sağ/sol mum sayısıyla).', okuma: 'Tepe ve dip oluştuğu anda değil, ONAYLANDIĞI mumda bilinir — grafikte geriye dönük çizilir, işlem anında görünmez.' },
  structure_state: { ne: 'Yapı durumu: salınımlara göre yükselen/düşen yapı, yapı kırılımı (BOS) ve karakter değişimi (CHoCH).', okuma: 'BOS = mevcut yönde yeni tepe/dip; CHoCH = ters yönde ilk kırılım (eğilim dönüyor olabilir).' },
  vwap_period: { ne: 'Dönemsel VWAP: gün / hafta / ay başında sıfırlanan hacim ağırlıklı ortalama fiyat ve hacim ağırlıklı sapma bantları.', okuma: 'Fiyat VWAP üstünde = dönemin ortalama alıcısı kârda. Bantlar ±1/2/3 σ; önceki dönemin kapanış VWAP\'ı yatay referanstır.' },
  vwap_anchored: { ne: 'Çapalı VWAP: seçilen bir noktadan (salınım dibi, tarih, N mum önce) başlayan hacim ağırlıklı ortalama.', okuma: 'O noktadan beri alanların ortalama maliyeti; fiyat bu çizgiye dönünce destek/direnç gibi davranabilir.' },
  period_levels: { ne: 'Dönem seviyeleri: önceki gün/hafta/ayın en yüksek, en düşük, açılış ve kapanışı (PDH/PDL).', okuma: 'Önceki dönemin tepe ve dipleri sık izlenen destek-direnç seviyeleridir.' },
  session_levels: { ne: 'Seans seviyeleri: Londra / New York / Asya seansının açılış, en yüksek ve en düşük fiyatı.', okuma: 'Seans tepesi/dibi kırılımları ve önceki seansın uçları gün içi referanstır.' },
  sr_zones: { ne: 'Destek-direnç bölgeleri: birden çok salınımın kümelendiği fiyat aralıkları, dokunuş/hacim/yakınlıkla puanlı.', okuma: 'Fiyatın altındaki en yakın bölge destek, üstündeki direnç; mesafe ATR cinsinden.' },
  ranges: { ne: 'Konsolidasyon kutuları: fiyatın ATR katı genişlikte bir aralıkta en az N mum kaldığı dönemler.', okuma: 'Kutu içi yatay piyasa; kutudan kapanışla çıkış kırılım adayıdır.' },
  range_tool: { ne: 'Range yapısı: salınımlardan kurulan aralık, orta seviye (EQ) ve sapma sınırları.', okuma: 'Fiyat sapma bölgesine taşıp içeri dönerse ortalamaya dönüş adayı; araştırmada bu aile RED çıktı.' },
  volume_profile: { ne: 'Hacim profili (sabit aralık): seçilen aralıkta hangi fiyatta ne kadar işlem yapıldığı.', okuma: 'POC en çok işlem gören fiyat; değer alanı (VAH–VAL) hacmin %70\'i; yüksek hacimli düğümler (HVN) mıknatıs, düşük (LVN) hızlı geçilen bölge.' },
  displacement: { ne: 'Displacement (enerjili hareket): gövdesi büyük, ATR katını aşan güçlü mum.', okuma: 'FVG ve Order Block\'un ön koşulu; tek başına yön sinyali değildir.' },
  order_block: { ne: 'Order Block: güçlü hareketten hemen önceki son ters renkli mum bölgesi.', okuma: 'Fiyat bu bölgeye döndüğünde tepki verebilir; bölge içinden kapanışla geçilirse "kullanılmış" sayılır.' },
  fvg: { ne: 'Fair Value Gap (FVG, dengesizlik boşluğu): üç mumluk harekette 1. ve 3. mumun fitilleri arasında kalan boşluk.', okuma: 'Fiyat boşluğa dönüp doldurabilir; dolan boşluk listeden düşer.' },
  ifvg: { ne: 'Inversion FVG: kapanışla tersine geçilen FVG; eski destek direnç olur (ya da tersi).', okuma: 'Ters dönen boşluğa geri test, yeni yönde tepki bölgesi olarak izlenir.' },
  bpr: { ne: 'Balanced Price Range: ters yönlü iki FVG\'nin üst üste bindiği bölge.', okuma: 'İki taraflı dengesizliğin kesişimi; güçlü tepki bölgesi adayı.' },
  breaker_block: { ne: 'Breaker Block: yapı kırılımıyla geçersizleşen Order Block\'un ters rolde kullanılması.', okuma: 'Kırılan eski bölge geri testte ters yönde destek/direnç olabilir.' },
  mitigation_block: { ne: 'Mitigation Block: fiyatın kısmen içine girip tepki verdiği Order Block.', okuma: 'Bölgeye ne kadar derin girildiği (penetrasyon) gücü hakkında bilgi verir.' },
  liquidity_pools: { ne: 'Likidite havuzları: eşit tepeler (EQH) ve eşit dipler (EQL) — stop emirlerinin biriktiği düşünülen seviyeler.', okuma: 'Fiyat bu seviyelerin ötesine geçip stopları tetikleyebilir (süpürme).' },
  liquidity_sweep: { ne: 'Likidite süpürmesi: fiyatın bir havuz seviyesini kısa süre aşıp geri dönmesi.', okuma: 'Aşıp geri dönüş ters yönde hareket adayıdır; kabul (kapanışla kalma) olursa kırılımdır.' },
  dealing_range: { ne: 'Dealing range: son salınım tepe ve dibi arasındaki aralık; üst yarı "premium", alt yarı "discount".', okuma: 'ICT yaklaşımında alım discount\'ta, satış premium\'da aranır; orta çizgi denge.' },
  ote: { ne: 'OTE (optimal giriş bölgesi): son hareketin %62–%79 geri çekilme aralığı.', okuma: 'Eğilim yönünde geri çekilmede giriş bölgesi adayı; %70,5 "tatlı nokta".' },
  killzones: { ne: 'Killzone pencereleri: Londra, New York açılışı gibi yüksek hacimli saat aralıkları.', okuma: 'Gün içi hareketin çoğu bu pencerelerde olur; pencere içi tepe/dip referans alınır. Araştırmada bu aile rafa kalktı.' },
  rvol: { ne: 'Göreli hacim (RVOL): bugünkü hacmin olağan hacme oranı.', okuma: '1 = olağan, 2 = iki kat hacim. Yüksek RVOL hareketin arkasında ilgi olduğunu gösterir.' },
  mfi: { ne: 'Para akışı endeksi (MFI): hacim ağırlıklı RSI, 0–100.', okuma: '80 üstü aşırı alım, 20 altı aşırı satım.' },
  obv: { ne: 'Denge hacmi (OBV): yükselen mumda hacmi ekleyen, düşende çıkaran birikimli seri.', okuma: 'Fiyat yatayken OBV yükseliyorsa birikim olabilir; fiyatla ters giderse uyuşmazlık.' },
  cmf: { ne: 'Chaikin para akışı (CMF): N mumda kapanışın aralıktaki yerine göre hacim akışı, −1 ile +1 arası.', okuma: 'Sıfır üstü alım baskısı, altı satış baskısı.' },
  correlation_rolling: { ne: 'Kayan korelasyon: seçilen sembollerin getirilerinin ana sembolle son N mumdaki ilişkisi (−1 … +1).', okuma: '+1 birlikte hareket, 0 ilişkisiz, −1 ters. Çeşitlendirme için düşük korelasyon aranır.' },
  beta_rolling: { ne: 'Kayan beta: ana sembol %1 oynayınca diğerinin ortalama ne kadar oynadığı.', okuma: 'Beta 2 = iki kat oynak; beta < 1 = daha sakin.' },
  correlation_matrix: { ne: 'Korelasyon matrisi: bütün sembol çiftlerinin korelasyonu ve yüksek korelasyonlu kümeler.', okuma: 'Aynı kümedeki semboller birlikte düşer; portföyde çeşitlendirme sağlamazlar.' },
  smt_divergence: { ne: 'SMT uyuşmazlığı: normalde birlikte hareket eden iki sembolden biri yeni tepe/dip yaparken diğerinin yapmaması.', okuma: 'Uyuşmazlık zayıflayan hareket işareti sayılır; tek başına sinyal değildir.' }
});

const PARAM_AD = Object.freeze({
  period: 'Dönem (mum sayısı)', source: 'Fiyat kaynağı', offset: 'Kaydırma', sigma: 'Sigma (pürüzsüzlük)', volumeFactor: 'Hacim çarpanı',
  fast: 'Hızlı dönem', slow: 'Yavaş dönem', signal: 'Sinyal dönemi', signalPeriod: 'Sinyal dönemi', stdDev: 'Standart sapma katı',
  atrPeriod: 'ATR dönemi', multiplier: 'Çarpan', excludeCurrent: 'Son mumu dahil etme', adxPeriod: 'ADX dönemi', trendAdx: 'Eğilim için ADX eşiği',
  highVolRatio: 'Yüksek oynaklık oranı', method: 'Yöntem', lookback: 'Geriye bakış (mum)', atrMultiple: 'ATR katı', useClose: 'Kapanışla kır',
  anchor: 'Dönem', band1: '1. bant (σ)', band2: '2. bant (σ)', band3: '3. bant (σ)', mode: 'Kip', anchorTime: 'Çapa zamanı',
  barsAgo: 'Kaç mum önce', volumeLookback: 'Hacim için geriye bakış', swingMethod: 'Salınım yöntemi', swingAtrMultiple: 'Salınım ATR katı',
  swingLookback: 'Salınım geriye bakış', session: 'Seans', startUtc: 'Başlangıç (UTC)', endUtc: 'Bitiş (UTC)', clusterAtr: 'Kümeleme genişliği (ATR)',
  breakAtr: 'Kırılma payı (ATR)', minTouches: 'En az dokunuş', maxZones: 'En çok bölge', maxIdleBars: 'En uzun bekleme (mum)', touchWeight: 'Dokunuş ağırlığı',
  volumeWeight: 'Hacim ağırlığı', recencyWeight: 'Yakınlık ağırlığı', ageHalfLife: 'Yaş yarı ömrü (mum)', widthAtr: 'Genişlik (ATR)', minBars: 'En az mum',
  thresholdMode: 'Eşik kipi', thresholdPct: 'Eşik (%)', thresholdAbs: 'Eşik (mutlak)', autoLookback: 'Otomatik eşik geriye bakış', autoMultiple: 'Otomatik eşik katı',
  requireLaterConfirm: 'Sonraki onayı bekle', eqLevel: 'Orta seviye (EQ)', devHigh: 'Üst sapma oranı', devLow: 'Alt sapma oranı', lockOn: 'Kilit ölçütü',
  violationOn: 'İhlal ölçütü', returnInto: 'Geri dönüş hedefi', deathGraceBars: 'Ölüm toleransı (mum)', redraw: 'Yeniden çiz', redrawWindowBars: 'Yeniden çizim penceresi (mum)',
  redrawMaxWidth: 'Yeniden çizim en çok genişlik', redrawMaxCount: 'Yeniden çizim en çok sayı', rescaleOnRevive: 'Dirilişte yeniden ölçekle', rescaleSides: 'Ölçeklenecek taraf',
  rescaleRelock: 'Ölçekleyince yeniden kilitle', maxRanges: 'En çok aralık', bars: 'Mum sayısı', startTime: 'Başlangıç zamanı', endTime: 'Bitiş zamanı', bins: 'Fiyat dilimi sayısı',
  valueAreaPct: 'Değer alanı (%)', hvnMultiple: 'Yüksek hacim düğümü katı', lvnMultiple: 'Düşük hacim düğümü katı', rangeWidthAtr: 'Aralık genişliği (ATR)', rangeMinBars: 'Aralık en az mum',
  rangeMaxStaleBars: 'Aralık en uzun bayatlık (mum)', minBodyRatio: 'En az gövde oranı', volumeMultiple: 'Hacim katı', dispAtrMultiple: 'Enerjili mum ATR katı',
  dispMinBodyRatio: 'Enerjili mum gövde oranı', useBody: 'Gövdeyi kullan (fitil değil)', mitigation: 'Kullanılma ölçütü', minGapAtr: 'En küçük boşluk (ATR)',
  requireDisplacement: 'Enerjili mum şart', requireMidClose: 'Orta mum kapanış şartı', minGapPct: 'En küçük boşluk (%)', fill: 'Dolma ölçütü', maxActive: 'En çok açık bölge',
  maxAgeBars: 'En çok yaş (mum)', maxPairDistance: 'Eşleşme en çok uzaklık (mum)', obLookback: 'Order Block geriye bakış', requireStructureWithin: 'Yapı kırılımı en geç (mum)',
  minPenetration: 'En az giriş derinliği', tolAtr: 'Eşitlik toleransı (ATR)', minPoints: 'En az nokta', maxSpanBars: 'En uzun yayılım (mum)', confirmWithin: 'Onay süresi (mum)',
  acceptAtr: 'Kabul payı (ATR)', minPenetrationAtr: 'En az aşma (ATR)', maxPenetrationAtr: 'En çok aşma (ATR)', boundary: 'Sınır', equilibriumBand: 'Denge bandı',
  minWidthAtr: 'En az genişlik (ATR)', maxAnchors: 'En çok çapa', zoneStart: 'Bölge başlangıcı', zoneEnd: 'Bölge sonu', sweetSpot: 'Tatlı nokta',
  invalidateBeyond: 'Geçersizlik seviyesi', touchWithWick: 'Fitille dokunma sayılsın', alignWithStructure: 'Yapıyla aynı yönde olsun', maxLegs: 'En çok bacak',
  zones: 'Pencereler', nyOffsetHours: 'New York saat farkı', customWindows: 'Özel pencereler', days: 'Gün sayısı', stat: 'İstatistik', minSamples: 'En az örnek',
  slopePeriod: 'Eğim dönemi', base: 'Ana sembol', returns: 'Getiri türü', minPeriods: 'En az dönem', threshold: 'Eşik', maxPairs: 'En çok çift',
  minCorrelation: 'En az korelasyon', correlationPeriod: 'Korelasyon dönemi', maxPairingBars: 'Eşleşme en çok mum', minDivergencePct: 'En az uyuşmazlık (%)'
});

/** Seçenek değerlerinin Türkçesi (ekranda; gönderilen değer aynı kalır). */
const DEGER_AD = Object.freeze({
  close: 'kapanış', open: 'açılış', high: 'en yüksek', low: 'en düşük', hl2: '(yüksek+düşük)/2', hlc3: '(y+d+k)/3', ohlc4: '(a+y+d+k)/4',
  daily: 'günlük', weekly: 'haftalık', monthly: 'aylık', quarterly: 'çeyreklik', yearly: 'yıllık', atr: 'ATR', pivot: 'pivot', auto: 'otomatik',
  london: 'Londra', newyork: 'New York', asia: 'Asya', londonClose: 'Londra kapanışı', log: 'logaritmik', simple: 'basit', median: 'medyan', mean: 'ortalama',
  rolling: 'kayan', both: 'iki taraf', through: 'içinden geçince', touch: 'dokununca', extreme: 'uç nokta', swingLow: 'salınım dibi', swingHigh: 'salınım tepesi',
  time: 'zaman', bars: 'mum sayısı', range: 'aralık'
});

/** Çizim türü / panel Türkçesi (çıktı tablosu). */
const CIZIM_AD = Object.freeze({ line: 'çizgi', markers: 'işaret', histogram: 'sütun', boxes: 'kutu', box: 'kutu', levels: 'seviye', level: 'seviye', zones: 'bölge', area: 'alan', band: 'bant' });
const TUR_AD = Object.freeze({ series: 'seri', levels: 'seviyeler', zones: 'bölgeler', events: 'olaylar' });

function aciklama(key) { return ACIKLAMA[key] || null; }
function paramEtiket(ad, spec) { return PARAM_AD[ad] || (spec && spec.label) || ad; }

module.exports = { ACIKLAMA, PARAM_AD, GRUP_AD, DEGER_AD, CIZIM_AD, TUR_AD, aciklama, paramEtiket };
