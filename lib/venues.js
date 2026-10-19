const ccxt = require('ccxt');
const borsaKurallari = require('./exchangeRules');

/**
 * Borsa (venue) katmanı — spot ve vadeli (perpetual) için tek arayüz.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN AYRI BİR KATMAN
 * ─────────────────────────────────────────────────────────────────────────
 * ccxt zaten borsaları soyutluyor; buranın işi ccxt'yi sarmalamak DEĞİL,
 * vadeli işlem için gereken ve borsadan borsaya değişen üç şeyi tek yerde
 * toplamak:
 *
 *   1. Hangi ccxt kimliği hangi piyasa tipine karşılık geliyor
 *      (Binance'te vadeli AYRI bir sınıf: `binanceusdm`; Bybit'te aynı sınıf
 *      `defaultType` ile ayrılıyor).
 *   2. Kontrat özellikleri: komisyon, min nominal, miktar adımı, maks kaldıraç.
 *   3. **Bakım marjı kademeleri** — likidasyon fiyatının tek girdisi.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ÖLÇÜLEN KISIT: KADEMELER HER BORSADA PUBLIC DEĞİL (2026-08-14 test edildi)
 * ─────────────────────────────────────────────────────────────────────────
 *   Bybit      → `fetchMarketLeverageTiers` PUBLIC çalışıyor. BTC/USDT:USDT
 *                için 35 kademe, ilk kademe MMR %0.5 (≤$2M nominal), maks 100x.
 *   Binance    → `fetchMarketLeverageTiers` API ANAHTARI İSTİYOR. Anahtarsız
 *                yalnızca sembol düzeyinde tek bir `maintMarginPercent` (%2.5)
 *                geliyor ki bu kademeli tabloyu temsil etmiyor.
 *
 * Sonuç ve kural: **likidasyon modeli anahtarsız Binance'te YAKLAŞIKTIR.**
 * Bu durumda yedek tablo kullanılır ve `specs.tiersSource` alanı `'varsayim'`
 * döner — motor bu bayrağı raporlamak zorunda. Kesin likidasyon ölçümü için
 * ya Bybit kullanılır ya da Binance API anahtarı girilir. Sessizce yaklaşık
 * bir tabloya düşmek, backtest'in yalan söylemesinin en kolay yoludur.
 */

const VENUES = {
  binance: {
    label: 'Binance',
    ccxtId: { spot: 'binance', perp: 'binanceusdm' },
    defaultType: { spot: 'spot', perp: 'swap' },
    // Kademeler yalnızca kimlik doğrulamayla; bkz. dosya başı notu.
    tiersPublic: false,
    fundingIntervalHours: 8
  },
  bybit: {
    label: 'Bybit',
    ccxtId: { spot: 'bybit', perp: 'bybit' },
    defaultType: { spot: 'spot', perp: 'swap' },
    tiersPublic: true,
    fundingIntervalHours: 8
  }
};

/**
 * Kademe verisi alınamadığında kullanılan YEDEK tablo.
 *
 * Bu tablo bir tahmindir ve kasıtlı olarak KÖTÜMSER tarafta tutulmuştur
 * (bakım marjı gerçeğinden yüksekse likidasyon daha erken hesaplanır, yani
 * backtest daha kötü sonuç verir). İyimser tarafta hatalı bir tablo,
 * gerçekte likide olmuş bir pozisyonu hayatta göstererek sonucu şişirirdi.
 */
const YEDEK_KADEMELER = [
  { maxNotional: 50000, maintenanceMarginRate: 0.005, maxLeverage: 100 },
  { maxNotional: 500000, maintenanceMarginRate: 0.01, maxLeverage: 50 },
  { maxNotional: 3000000, maintenanceMarginRate: 0.025, maxLeverage: 20 },
  { maxNotional: 15000000, maintenanceMarginRate: 0.05, maxLeverage: 10 },
  { maxNotional: 50000000, maintenanceMarginRate: 0.10, maxLeverage: 5 },
  { maxNotional: Number.MAX_SAFE_INTEGER, maintenanceMarginRate: 0.25, maxLeverage: 2 }
];

const istemciler = new Map();
const specsCache = new Map();
// Binance fundingInfo (anahtarsız, tüm semboller tek çağrıda) — ortam başına bir kez.
const fundingInfoCache = new Map();

/**
 * Binance funding aralığı SEMBOL BAŞINA: 1, 4 ya da 8 saat. exchangeInfo'da bu
 * alan YOK (2026-10-06 ölçümü: ccxt `m.info.fundingIntervalHours` hep boştu ve
 * her şey 8 saate düşüyordu; 467 sembol aslında 4 saat). Kaynak
 * `GET /fapi/v1/fundingInfo`. Alınamazsa null döner, çağıran 8 saat yedeğine
 * düşer ve bunu `fundingIntervalSource: 'varsayim'` ile bildirir.
 */
async function binanceFundingInfo(ex, ortam) {
  if (fundingInfoCache.has(ortam)) return fundingInfoCache.get(ortam);
  let tablo = null;
  try {
    if (typeof ex.fapiPublicGetFundingInfo === 'function') {
      tablo = borsaKurallari.fundingInfoAyristir(await ex.fapiPublicGetFundingInfo());
    }
  } catch (e) {
    tablo = null;
  }
  if (tablo) fundingInfoCache.set(ortam, tablo);
  return tablo;
}

function normalizeMarket(market) {
  const m = String(market || 'spot').toLowerCase();
  if (m === 'perpetual' || m === 'swap' || m === 'future' || m === 'futures' || m === 'perp') return 'perp';
  return 'spot';
}

function venueTanim(venue) {
  const v = String(venue || 'binance').toLowerCase();
  return VENUES[v] ? { key: v, ...VENUES[v] } : { key: 'binance', ...VENUES.binance };
}

/** Kayıtlı borsalar — panel seçicisi bunu kullanır. */
function listVenues() {
  return Object.entries(VENUES).map(([key, v]) => ({
    key,
    label: v.label,
    markets: Object.keys(v.ccxtId),
    tiersPublic: v.tiersPublic
  }));
}

/**
 * ccxt istemcisi. Borsa+piyasa tipi başına tek örnek tutulur: `loadMarkets()`
 * pahalı bir çağrı ve her istekte yeni istemci kurmak hız sınırına takılmanın
 * en kısa yolu.
 */
function client(venue = 'binance', market = 'spot', kimlik = {}) {
  const tanim = venueTanim(venue);
  const piyasa = normalizeMarket(market);
  const anahtar = `${tanim.key}:${piyasa}:${kimlik.apiKey ? 'auth' : 'public'}`;

  if (istemciler.has(anahtar)) return istemciler.get(anahtar);

  const id = tanim.ccxtId[piyasa] || tanim.ccxtId.spot;
  const Sinif = ccxt[id];
  if (!Sinif) throw new Error(`ccxt borsa sınıfı bulunamadı: ${id}`);

  const ex = new Sinif({
    apiKey: kimlik.apiKey || '',
    secret: kimlik.apiSecret || '',
    enableRateLimit: true,
    timeout: 25000,
    options: {
      defaultType: tanim.defaultType[piyasa] || 'spot',
      warnOnFetchOHLCVLimitArgument: false
    }
  });

  istemciler.set(anahtar, ex);
  return ex;
}

/**
 * Kontrat özellikleri: komisyon, min nominal, adım, kaldıraç ve **bakım marjı
 * kademeleri**. Kademeler alınamazsa yedek tabloya düşer ve bunu bildirir.
 */
async function contractSpecs(venue, market, symbol, kimlik = {}) {
  const tanim = venueTanim(venue);
  const piyasa = normalizeMarket(market);
  // Ortam anahtarın parçası: demo ve prod filtreleri FARKLI (BTC step 0.0001 / 0.001).
  const ortam = kimlik.ortam || 'prod';
  const anahtar = `${tanim.key}:${piyasa}:${ortam}:${symbol}`;
  if (specsCache.has(anahtar)) return specsCache.get(anahtar);

  const ex = client(tanim.key, piyasa, kimlik);
  await ex.loadMarkets();
  const m = ex.market(symbol);

  let tiers = null;
  let tiersSource = 'varsayim';
  if (piyasa === 'perp') {
    try {
      const ham = await ex.fetchMarketLeverageTiers(symbol);
      if (Array.isArray(ham) && ham.length) {
        tiers = ham
          .map(t => ({
            maxNotional: Number(t.maxNotional) || Number.MAX_SAFE_INTEGER,
            maintenanceMarginRate: Number(t.maintenanceMarginRate),
            maxLeverage: Number(t.maxLeverage) || 1,
            // Borsanın verdiği bakım indirimi (Binance `info.cum`, Bybit'te yok).
            // Varsa `tierFor` onu DOĞRUDAN kullanır; türetme yalnızca yedektir.
            ...(t.info && t.info.cum !== undefined && Number.isFinite(Number(t.info.cum))
              ? { cum: Number(t.info.cum) } : {})
          }))
          .filter(t => Number.isFinite(t.maintenanceMarginRate))
          .sort((a, b) => a.maxNotional - b.maxNotional);
        tiersSource = 'borsa';
      }
    } catch (e) {
      // Binance anahtarsız buraya düşer; kasıtlı olarak sessiz DEĞİL —
      // `tiersSource` alanı çağırana durumu bildirir.
      tiers = null;
    }
  }

  if (!tiers || !tiers.length) tiers = YEDEK_KADEMELER;

  // Binance vadeli: ham filtreler (tick, step, MARKET_LOT_SIZE, PERCENT_PRICE…)
  // ve sembolün funding aralığı. Kurallar emir doğrulaması ve miktar
  // yuvarlaması için `lib/exchangeRules` biçiminde tutulur.
  let kurallar = null;
  let fundingIntervalHours = Number(m.info && m.info.fundingIntervalHours) || null;
  let fundingIntervalSource = fundingIntervalHours ? 'borsa' : 'varsayim';
  let fundingCap = null, fundingFloor = null;
  if (piyasa === 'perp' && tanim.key === 'binance' && m.info && Array.isArray(m.info.filters)) {
    try { kurallar = borsaKurallari.sembolKuralAyristir(m.info, ortam); } catch (e) { kurallar = null; }
    const fon = await binanceFundingInfo(ex, ortam);
    const kayit = fon && fon[m.id];
    if (kayit) {
      fundingIntervalHours = kayit.aralikSaat;
      fundingIntervalSource = 'fundingInfo';
      fundingCap = kayit.tavan;
      fundingFloor = kayit.taban;
    }
  }
  if (!fundingIntervalHours) fundingIntervalHours = tanim.fundingIntervalHours;

  const specs = {
    venue: tanim.key,
    market: piyasa,
    symbol,
    ccxtId: tanim.ccxtId[piyasa],
    taker: Number.isFinite(m.taker) ? m.taker : 0.0006,
    maker: Number.isFinite(m.maker) ? m.maker : 0.0002,
    amountStep: (m.precision && m.precision.amount) || null,
    minNotional: (m.limits && m.limits.cost && m.limits.cost.min) || null,
    maxLeverage: (m.limits && m.limits.leverage && m.limits.leverage.max)
      || Math.max(...tiers.map(t => t.maxLeverage)),
    fundingIntervalHours,
    // 'fundingInfo' | 'borsa' | 'varsayim' (8 saat yedeği — sembol listede yoksa ya da uç alınamadıysa)
    fundingIntervalSource,
    fundingCap,
    fundingFloor,
    // Binance ham filtreleri (`lib/exchangeRules` sembol kuralı); diğer borsalarda null.
    kurallar,
    tiers,
    tiersSource
  };

  specsCache.set(anahtar, specs);
  return specs;
}

/**
 * Nominal büyüklüğe düşen bakım marjı kademesi.
 *
 * Binance/Bybit modeli: bakım marjı = nominal × MMR − indirim (`cum`).
 * Kademe borsanın verdiği `cum`u taşıyorsa (Binance leverageBracket) o
 * DOĞRUDAN kullanılır. Taşımıyorsa (Bybit, yedek tablo) kademe sınırlarından
 * türetilir; bu, kademe geçişlerinde sürekli (sıçramasız) bir bakım marjı
 * verir — borsanın yaptığı da budur. İkisi `notionalFloor` = önceki
 * `notionalCap` olduğu sürece aynı sonucu verir.
 */
function tierFor(tiers, notional) {
  const liste = tiers && tiers.length ? tiers : YEDEK_KADEMELER;
  let indirim = 0;
  for (let i = 0; i < liste.length; i++) {
    const t = liste[i];
    if (notional <= t.maxNotional || i === liste.length - 1) {
      return { ...t, indirim: Number.isFinite(t.cum) ? t.cum : indirim };
    }
    const sonraki = liste[i + 1];
    // Kademe geçişinde süreklilik: bir üst kademenin daha yüksek oranı, alt
    // kademede zaten ödenmiş farkı geri verir.
    indirim += t.maxNotional * (sonraki.maintenanceMarginRate - t.maintenanceMarginRate);
  }
  return { ...liste[liste.length - 1], indirim };
}

/** Verilen nominal için bakım marjı (USDT). */
function maintenanceMargin(tiers, notional) {
  const t = tierFor(tiers, notional);
  return Math.max(0, notional * t.maintenanceMarginRate - t.indirim);
}

/**
 * Tarihsel funding oranları. ccxt sayfalama yapar; `since`den bugüne kadar
 * yürüyerek toplar.
 */
async function fetchFundingHistory(venue, symbol, since = undefined, kimlik = {}) {
  const ex = client(venue, 'perp', kimlik);
  const hepsi = [];
  let guard = 0;

  // `since` VERİLMEZSE borsa EN YENİ sayfayı döndürür; oradan ileri yürümek
  // hemen boş sayfaya çarpar (ölçüldü: 9 yıl yerine 2 ay geldi). Bu yüzden
  // varsayılan başlangıç geriye alınır ve ileri doğru sayfalanır.
  const VARSAYILAN_GERI = 6 * 365 * 24 * 60 * 60 * 1000;   // ~6 yıl
  let imlec = Number.isFinite(since) ? since : Date.now() - VARSAYILAN_GERI;

  while (guard < 400) {
    guard++;
    let sayfa;
    try {
      sayfa = await ex.fetchFundingRateHistory(symbol, imlec, 200);
    } catch (e) {
      break;
    }
    if (!sayfa || sayfa.length === 0) break;

    for (const f of sayfa) {
      const t = Number(f.timestamp);
      const r = Number(f.fundingRate);
      if (Number.isFinite(t) && Number.isFinite(r)) hepsi.push({ time: t, rate: r });
    }

    const sonZaman = Number(sayfa[sayfa.length - 1].timestamp);
    // İlerleme yoksa dur: aynı sayfayı tekrar tekrar çekmek sonsuz döngüdür.
    if (!Number.isFinite(sonZaman) || sonZaman <= imlec) break;
    imlec = sonZaman + 1;
    if (sonZaman >= Date.now() - 60 * 60 * 1000) break;   // bugüne geldik
  }

  // Zaman sıralı ve tekilleştirilmiş.
  const harita = new Map();
  for (const f of hepsi) harita.set(f.time, f.rate);
  return Array.from(harita.entries())
    .map(([time, rate]) => ({ time, rate }))
    .sort((a, b) => a.time - b.time);
}

module.exports = {
  VENUES,
  YEDEK_KADEMELER,
  listVenues,
  venueTanim,
  normalizeMarket,
  client,
  contractSpecs,
  tierFor,
  maintenanceMargin,
  fetchFundingHistory
};
