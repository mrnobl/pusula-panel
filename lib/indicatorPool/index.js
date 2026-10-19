const registry = require('./registry');
const { isCandleArray, validateOutput } = require('./contract');

// Tanımlar kayıt olsun diye yüklenir; sıralama önemsiz.
require('./defs/moving');
require('./defs/momentum');
require('./defs/volatility');
require('./defs/structure');
require('./defs/vwap');
require('./defs/levels');
require('./defs/srzones');
require('./defs/ranges');
require('./defs/range-tool');
require('./defs/volumeprofile');
require('./defs/ict-base');
require('./defs/ict-fvg');
require('./defs/ict-breaker');
require('./defs/ict-liquidity');
require('./defs/ict-range');
require('./defs/killzones');
require('./defs/volume');
require('./defs/correlation');
require('./defs/smt');

/**
 * Gösterge havuzu — genel API.
 *
 * Neden toplu API: 16 bot × 8 strateji aynı EMA'yı her tick yeniden
 * hesaplıyordu. Havuz aynı (gösterge + parametre + seri) üçlüsünü bir kez
 * hesaplayıp paylaşır.
 */

const CACHE_LIMIT = 400;
const cache = new Map();

/**
 * Seri parmak izi: son mumun zamanı + uzunluk + son kapanış.
 * Tam içerik karşılaştırması pahalı; bu üçlü pratikte yeterli ayırt edici,
 * çünkü mum dizileri yalnızca sona ekleyerek büyür.
 */
/**
 * Önbellek parmak izi.
 *
 * HACİM DE DAHİL. Eskiden değildi: `uzunluk:ilkZaman:sonZaman:sonKapanış`.
 * Aynı uzunlukta, aynı zaman damgalarına ve aynı son kapanışa sahip ama
 * HACİMLERİ farklı iki mum dizisi aynı parmak izini üretiyor ve havuz
 * ikincisine birincinin sonucunu döndürüyordu. Hacme bağlı göstergelerin
 * hepsi etkilenirdi: `volume_profile`, `obv`, `cmf`, `mfi`, `rvol`, `vwap`.
 *
 * Pratikte ne zaman olur: borsalar son barın hacmini kapanış değişmeden
 * güncelleyebilir; ya da bir ölçüm hacmi kasten değiştirip karşılaştırma yapar.
 * İkisinde de eski sonuç sessizce geri gelirdi.
 *
 * NASIL YAKALANDI: hacim yerine sabit 1 konan bir kopya üzerinde POC ölçüldü.
 * Düzeltmeden önce 376 range'in HEPSİNDE sonuç birebir aynıydı (fark 0.000);
 * düzeltmeden sonra %66–73'ünde aynı, geri kalanında farklı çıktı. Kalan
 * eşitlik gerçek: POC bin merkezine yuvarlanıyor ve iki ağırlıklandırmada da
 * çoğu zaman aynı bin kazanıyor. Yani hem önbellek çakışması hem de doğal
 * eşitlik vardı; ilki düzeltildi, ikincisi göstergenin doğası.
 *
 * (Ara teşhiste tek bir vakaya bakıp "çakışma yok" sonucuna varılmıştı — o vaka
 * doğal eşitliklerden biriydi. Tek örnekle önbellek davranışı sınanmaz.)
 *
 * Hacim TOPLAMI kullanılıyor (örnekleme değil): birkaç noktadan örnek almak
 * aradaki barların değişmesini kaçırırdı. Maliyeti O(n), gösterge hesabının
 * yanında ihmal edilebilir.
 */
function fingerprint(candles) {
  const n = candles.length;
  if (!n) return 'bos';
  const son = candles[n - 1];
  const ilk = candles[0];
  let hacimToplam = 0;
  for (let i = 0; i < n; i++) {
    const v = candles[i].volume;
    if (Number.isFinite(v)) hacimToplam += v;
  }
  return `${n}:${ilk.time || 0}:${son.time || 0}:${son.close}:${hacimToplam}`;
}

function cacheKey(key, params, fp) {
  return `${key}|${JSON.stringify(params)}|${fp}`;
}

function remember(k, value) {
  cache.set(k, value);
  if (cache.size > CACHE_LIMIT) {
    // En eski kayıt atılır (Map ekleme sırasını korur).
    cache.delete(cache.keys().next().value);
  }
  return value;
}

/**
 * Tek gösterge hesaplar.
 * @param {Array} candles  {time,open,high,low,close,volume} dizisi
 * @param {string} key     kayıtlı gösterge anahtarı
 * @param {object} params  gösterge parametreleri (eksikler varsayılana düşer)
 */
function computeOne(candles, key, params = {}) {
  const def = registry.get(key);
  if (!def) throw new Error(`Bilinmeyen gösterge: ${key}`);
  if (!isCandleArray(candles)) throw new Error(`'${key}' için geçersiz mum dizisi`);

  const resolved = registry.resolveParams(def, params);
  const ck = cacheKey(key, resolved, fingerprint(candles));
  if (cache.has(ck)) return cache.get(ck);

  // Bağımlı göstergeler (structure_state → swings) havuzu bağlamdan çağırır.
  // Doğrudan `require` etselerdi döngüsel bağımlılık olurdu; ayrıca bu yol
  // önbelleği paylaştığı için bağımlılık iki kez hesaplanmaz.
  const ctx = { computeOne: (k, p) => computeOne(candles, k, p) };
  const result = def.compute(candles, resolved, ctx) || {};

  // Sözleşme çıktıda da doğrulanır: bozuk bir gösterge sessizce dolaşmasın.
  const hatalar = validateOutput(def, result, candles.length);
  if (hatalar.length) throw new Error(`Gösterge çıktısı sözleşmeye uymuyor — ${hatalar.join('; ')}`);

  const enriched = {
    ...result,
    _meta: {
      key,
      kind: def.kind,
      params: resolved,
      warmup: registry.warmupOf(def, resolved),
      candles: candles.length
    }
  };

  return remember(ck, enriched);
}

/**
 * Toplu hesap. Strateji ihtiyacını bildirir, tek çağrıda alır:
 *
 *   const ind = pool.compute(candles, [
 *     { key:'ema', params:{ period:21 }, as:'emaFast' },
 *     { key:'atr', params:{ period:14 } }
 *   ]);
 *   ind.emaFast.value[i]   ind.atr.pct[i]
 *
 * `as` verilmezse gösterge anahtarı kullanılır.
 */
function compute(candles, specs = []) {
  const out = {};
  for (const spec of specs) {
    if (!spec || !spec.key) continue;
    const ad = spec.as || spec.key;
    out[ad] = computeOne(candles, spec.key, spec.params || {});
  }
  return out;
}

/**
 * Isınma kontrolü: verilen spec listesi için gereken en uzun ısınma.
 * Strateji, elindeki mum sayısı bunun altındaysa hiç hesap yapmadan
 * bekleyebilir — `null` görüp tahmin etmek yerine.
 */
function requiredWarmup(specs = []) {
  let max = 0;
  for (const spec of specs) {
    const def = registry.get(spec.key);
    if (!def) continue;
    const resolved = registry.resolveParams(def, spec.params || {});
    max = Math.max(max, registry.warmupOf(def, resolved));
  }
  return max;
}

/**
 * Çok sembollü giriş için ortak zaman ekseni. Korelasyon ve SMT gibi
 * göstergeler farklı uzunlukta/boşluklu serileri karşılaştıramaz; burada
 * ortak zaman damgalarının KESİŞİMİ alınıp her sembol yeniden indekslenir.
 *
 * BAYAT SEMBOL SORUNU — bu sessiz hata gerçekten yaşandı: `config.watchlist`
 * 16 sembol içeriyor ama MATIC/USDT'nin önbelleği 2024-09'da bitmişti (borsa
 * POL'e geçtiği için güncellenemiyor). Tek bir kesişmeyen sembol, 16 sembollük
 * kesişimi BOŞA düşürüyor ve her çok sembollü gösterge sessizce boş seri
 * döndürüyordu — hata yok, uyarı yok, sadece boş sonuç.
 *
 * Çözüm: referans pencereyle hiç örtüşmeyen semboller ELENİR ve elendikleri
 * `dropped` ile bildirilir. Eleme eşiği `minOverlapRatio` ile açılabilir
 * (0 = yalnızca hiç örtüşmeyeni at). Kısa ama geçerli geçmişi olan sembolü
 * kendiliğinden atmak da yanlış olurdu — o yüzden varsayılan 0.
 */
function alignSeries(seriesMap, options = {}) {
  const dropNonOverlapping = options.dropNonOverlapping !== false;
  const minOverlapRatio = Number.isFinite(options.minOverlapRatio) ? options.minOverlapRatio : 0;

  const tumSemboller = Object.keys(seriesMap);
  if (!tumSemboller.length) return { times: [], aligned: {}, coverage: {}, dropped: [] };

  const araliklar = {};
  for (const sym of tumSemboller) {
    const liste = (seriesMap[sym] || []).filter(c => c && Number.isFinite(c.time));
    araliklar[sym] = liste.length
      ? { first: liste[0].time, last: liste[liste.length - 1].time, bars: liste.length }
      : { first: null, last: null, bars: 0 };
  }

  // Referans pencere: başlangıçların ve bitişlerin MEDYANI. Ortalama, tek bir
  // bayat sembolle sürüklenirdi; medyan çoğunluğun penceresini verir.
  const medyan = (arr) => {
    const s = arr.filter(Number.isFinite).sort((a, b) => a - b);
    return s.length ? s[s.length >> 1] : null;
  };
  const refBas = medyan(tumSemboller.map(s => araliklar[s].first));
  const refBit = medyan(tumSemboller.map(s => araliklar[s].last));
  const refBoy = (refBas !== null && refBit !== null) ? Math.max(1, refBit - refBas) : 1;

  const dropped = [];
  let symbols = tumSemboller;

  if (dropNonOverlapping && refBas !== null) {
    symbols = [];
    for (const sym of tumSemboller) {
      const a = araliklar[sym];
      const ortusme = (a.first === null) ? 0 : Math.max(0, Math.min(a.last, refBit) - Math.max(a.first, refBas));
      const oran = ortusme / refBoy;
      if (a.bars === 0 || oran <= minOverlapRatio) {
        dropped.push({ symbol: sym, reason: a.bars === 0 ? 'veri yok' : 'referans pencereyle örtüşmüyor', overlapRatio: oran, ...a });
      } else {
        symbols.push(sym);
      }
    }
  }

  if (!symbols.length) return { times: [], aligned: {}, coverage: araliklar, dropped };

  const indexes = {};
  for (const sym of symbols) {
    const m = new Map();
    for (const c of (seriesMap[sym] || [])) {
      if (Number.isFinite(c.time)) m.set(c.time, c);
    }
    indexes[sym] = m;
  }

  // Kesişim: en kısa seriden başlayıp diğerlerinde de var olanları tutar.
  const shortest = symbols.reduce((a, b) => (indexes[a].size <= indexes[b].size ? a : b));
  const times = Array.from(indexes[shortest].keys())
    .filter(t => symbols.every(s => indexes[s].has(t)))
    .sort((a, b) => a - b);

  const aligned = {};
  const coverage = {};
  for (const sym of symbols) {
    aligned[sym] = times.map(t => indexes[sym].get(t));
    coverage[sym] = { ...araliklar[sym], used: times.length };
  }

  return { times, aligned, coverage, dropped, limitedBy: shortest };
}

/**
 * Çok sembollü hesap. `kind:'multi'` göstergeler (korelasyon, SMT) buradan
 * çalışır; giriş önce ortak zaman eksenine hizalanır.
 */
function computeMulti(seriesMap, specs = [], options = {}) {
  const { times, aligned, coverage, dropped, limitedBy } = alignSeries(seriesMap, options);
  const semboller = Object.keys(aligned);

  // Boş kesişim sessizce geçilmez: her gösterge boş seri döndürür ve sonuç
  // "korelasyon yok" gibi okunur. Hangi sembolün nereyi kapsadığı yazılır.
  if (!times.length && Object.keys(seriesMap).length > 1) {
    const rapor = Object.entries(coverage)
      .map(([s, a]) => `${s}: ${a.bars} bar${a.first ? ` (${new Date(a.first).toISOString().slice(0, 10)} → ${new Date(a.last).toISOString().slice(0, 10)})` : ''}`)
      .join(', ');
    throw new Error(
      `Çok sembollü hesap için ortak zaman ekseni boş. Semboller kesişmiyor — ${rapor}`
      + (dropped.length ? ` · elenen: ${dropped.map(d => d.symbol).join(', ')}` : '')
    );
  }

  const out = { _times: times, _symbols: semboller, _coverage: coverage, _dropped: dropped, _limitedBy: limitedBy };

  for (const spec of specs) {
    if (!spec || !spec.key) continue;
    const def = registry.get(spec.key);
    if (!def) throw new Error(`Bilinmeyen gösterge: ${spec.key}`);
    if (def.multi !== true) throw new Error(`'${spec.key}' çok sembollü değil; compute() kullanın`);

    const resolved = registry.resolveParams(def, spec.params || {});
    const result = def.compute(aligned, resolved, times) || {};

    // Sözleşme burada da geçerli. Bu doğrulama bir süre YOKTU: tek sembollü
    // yol `computeOne` içinde kontrol edilirken çok sembollü yol denetimsizdi,
    // yani hizasız bir seri sessizce dolaşabilirdi.
    const hatalar = validateOutput(def, result, times.length);
    if (hatalar.length) throw new Error(`Çok sembollü gösterge çıktısı sözleşmeye uymuyor — ${hatalar.join('; ')}`);

    out[spec.as || spec.key] = result;
  }

  return out;
}

/** Havuzda ne var — panel ve keşif için. */
const describe = () => registry.describe();
const list = () => registry.keys();
const groups = () => {
  const g = {};
  for (const d of registry.all()) {
    if (!g[d.group]) g[d.group] = [];
    g[d.group].push(d.key);
  }
  return g;
};

const clearCache = () => cache.clear();
const cacheSize = () => cache.size;

module.exports = {
  compute,
  computeOne,
  computeMulti,
  alignSeries,
  requiredWarmup,
  describe,
  list,
  groups,
  clearCache,
  cacheSize,
  registry
};
