/**
 * Çizim bildirimi — bir göstergenin GRAFİKTE nasıl görüneceği.
 *
 * Havuz bugüne kadar yalnızca "değer doğru mu" sorusunu yanıtlıyordu; grafiğe
 * bağlanınca ikinci bir soru çıktı: bu çıktı NEREYE çizilir? EMA fiyat
 * ölçeğine, RSI 0–100 kendi paneline, order block kutu olarak, likidite
 * süpürmesi işaretçi olarak. Bu bilgi olmadan RSI fiyat paneline düşer ve
 * grafiği kullanılamaz hâle getirir — mum çubukları 60.000 civarındayken
 * 0–100 arası bir çizgi ekseni ezer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BİLDİRİM ÜÇ KADEMEDE ÇÖZÜLÜR
 * ─────────────────────────────────────────────────────────────────────────
 *   1. Tanımın kendi `render` haritası (en yüksek öncelik, kısmi olabilir)
 *   2. Çıktı ADINDAN çıkarım (`nearestSupport` fiyat, `activeBullish` sayaç)
 *   3. Grubun varsayılanı (hareketli-ortalama → fiyat, momentum → kendi paneli)
 *
 * 52 göstergeye tek tek `render` yazmak yerine bu sıra kuruldu: adlandırma
 * havuz genelinde tutarlı olduğu için çıkarım çoğunu doğru yakalıyor,
 * yakalayamadığı yerde tanım kendi bildirimini veriyor.
 *
 * DOĞRULAMASI TESTTE: `selftest` her fiyat panelli sayısal seriyi gerçek fiyat
 * aralığıyla karşılaştırır. Medyanı fiyatın 20 katından uzaksa bildirim
 * yanlıştır ve gösterge testten geçemez — sınıflandırmayı yazarın gözü değil
 * ölçüm belirler.
 */

/**
 * Kendi panelinde çizilmesi gereken çıktı adları (sayaç, oran, durum, indeks).
 *
 * `.*Index$` ve `.*Bars$` burada: bar indeksi ve bar sayısı fiyat gibi
 * görünebilir (ikisi de 0–600 aralığında) ama fiyatla hiçbir ilgisi yoktur.
 * Testin ölçek deneyi bu ikisini yakaladı.
 */
const OWN_PANE_NAME = /^(active[A-Z]|.*Count$|in[A-Z]|state$|bos$|choch$|bullish$|bearish$|strength$|bodyRatio$|position$|retracement$|penetration$|deepestPenetration$|sweepCount$|barsSince$|divergenceCount$|.*DistanceAtr$|widthAtr$|spreadAtr$|penetrationAtr$|zscore$|slope$|histogram$|.*Index$|.*Bars$|zoneId$|barsIn$|inOte$|spread$|average$|baseline$|direction$|inSession$|active$)/;

/**
 * Fiyat ölçeğinde çizilmesi gereken çıktı adları.
 * `upper1/lower2` gibi numaralı σ bantları da fiyat seviyesidir — ilk sürümde
 * `upper$` anchor'ı yüzünden kaçıyorlardı ve VWAP bantları osilatör paneline
 * düşüyordu.
 */
const PRICE_PANE_NAME = /^(nearest[A-Z]|zoneHigh$|zoneLow$|zoneOpen$|sweetSpot$|equilibrium$|level$|lastLevel$|last(High|Low)$|prev(High|Low|Open|Close)$|current(High|Low|Open)$|vwap$|prevClose$|upper\d*$|lower\d*$|middle$|basis$|high$|low$|poc$|va[hl]$|hvn$|lvn$|sessionOpen$)/;

/** Grup varsayılanları: çıkarım da tanım da bir şey söylemezse buraya düşülür. */
const GROUP_DEFAULT = {
  'hareketli-ortalama': 'price',
  'fiyat': 'price',
  'momentum': 'own',
  'volatilite': 'own',
  'hacim': 'own',
  'yapi': 'price',
  'ict': 'price',
  'coklu': 'own'
};

/**
 * Liste çıktıları (seri olmayan): göstergenin tipine göre çizim biçimi.
 *   zones  → kutu (order block, FVG, likidite havuzu)
 *   events → işaretçi (süpürme, displacement)
 *   levels → yatay seviye (hacim profili, dealing range çapaları)
 */
const KIND_LIST_AS = { zones: 'zones', events: 'markers', levels: 'levels', series: 'line' };

/**
 * Çizilmeyen çıktılar: parametre özeti, sembol listesi, korelasyon matrisi.
 * Bunlar veri değil METADATA — grafiğe konacak bir şeyleri yok, ama API'de
 * dururlar. `as:'none'` arayüzün onları seçenek olarak sunmasını engeller.
 */
const NON_DRAWABLE = /^(info|peers|windows|symbols|matrix|clusters|strongestPairs|pairs|totalVolume|range|averageCorrelation)$/;

/** İsimden pane çıkarımı; kararsızsa null döner. */
function paneFromName(name) {
  if (OWN_PANE_NAME.test(name)) return 'own';
  if (PRICE_PANE_NAME.test(name)) return 'price';
  return null;
}

/**
 * Bir tanımın TÜM çıktıları için çizim bildirimi üretir.
 * Dönen harita: { [outputName]: { pane, as, sparse, list } }
 */
function resolveRender(def) {
  const acik = def.render || {};
  const seriler = new Set(def.kind === 'series' ? def.outputs : (def.seriesOutputs || []));
  const seyrek = new Set(def.sparseOutputs || []);
  const grupVarsayilan = GROUP_DEFAULT[def.group] || 'own';

  const out = {};
  for (const name of def.outputs) {
    const ozel = acik[name] || {};
    const seri = seriler.has(name);

    const cizilmez = !seri && NON_DRAWABLE.test(name);

    let pane = ozel.pane;
    if (!pane) {
      // `value` gibi çift anlamlı adlar grup varsayılanına bırakılır:
      // ema.value fiyat, rsi.value osilatördür.
      const isimden = name === 'value' ? null : paneFromName(name);
      // Olay listeleri her zaman fiyat grafiğine işaretlenir — hangi grupta
      // olursa olsun bir olay "şu barda şu fiyatta" demektir.
      const olayListesi = !seri && def.kind === 'events' && name === 'events';
      pane = isimden || (olayListesi ? 'price' : null) || grupVarsayilan;
    }

    let as = ozel.as;
    if (!as) {
      if (cizilmez) as = 'none';
      else if (!seri) as = KIND_LIST_AS[def.kind] || 'levels';
      else if (seyrek.has(name)) as = 'markers';
      else as = 'line';
    }

    out[name] = {
      pane,
      as,
      series: seri,
      sparse: seyrek.has(name),
      // Osilatörlerde referans çizgileri (RSI 30/70 gibi) tanımdan gelir.
      guides: ozel.guides || null,
      precision: ozel.precision !== undefined ? ozel.precision : null,
      label: ozel.label || name
    };
  }

  return out;
}

module.exports = { resolveRender, GROUP_DEFAULT, OWN_PANE_NAME, PRICE_PANE_NAME };
