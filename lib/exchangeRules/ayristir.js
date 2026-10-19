/**
 * HAM BORSA JSON'U → `kurallar` NESNESİ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Üç kaynak, üç ayrı uç (hepsi Binance USDⓈ-M):
 *   GET /fapi/v1/exchangeInfo     anahtarsız  → filtreler (tick, step, min nominal…)
 *   GET /fapi/v1/fundingInfo      anahtarsız  → funding aralığı + tavan/taban
 *   GET /fapi/v1/leverageBracket  ANAHTARLI   → bakım marjı kademeleri (mmr + cum)
 *
 * Ölçülmüş tuzaklar (araştırma raporu, 2026-10-06):
 *   · `pricePrecision` tickSize ile UYUŞMUYOR (659 sembolün 559'unda). Hiçbir
 *     hesapta kullanılmaz; yalnızca -1111 uyarısı için saklanır.
 *   · exchangeInfo'da `fundingIntervalHours` YOK; aralık fundingInfo'da.
 *     Listede olmayan sembol 8 saat varsayılır ve `aralikKaynak: 'varsayim'`.
 *   · Demo ile prod filtreleri FARKLI (BTC step 0.0001 / 0.001): `ortam`
 *     kuralların parçasıdır, önbellek anahtarına girmelidir.
 *   · Kademe tablosu anahtar ister. Anahtarsız durumda YEDEK tablo döner ve
 *     `kademeKaynak: 'varsayim'` olarak işaretlenir — sessizce yaklaşık bir
 *     tabloya düşmek, likidasyon sayısının yalan söylemesinin en kısa yoludur.
 */

/**
 * Anahtarsız durumda kullanılan YEDEK kademe tablosu (`lib/venues.js` ile aynı
 * sayılar). Kasıtlı olarak kötümser: bakım marjı gerçeğinden yüksekse
 * likidasyon daha erken hesaplanır. `cum` sınırlardan türetilir (süreklilik).
 */
const YEDEK_KADEMELER_HAM = [
  { maxNotional: 50000, maintenanceMarginRate: 0.005, maxLeverage: 100 },
  { maxNotional: 500000, maintenanceMarginRate: 0.01, maxLeverage: 50 },
  { maxNotional: 3000000, maintenanceMarginRate: 0.025, maxLeverage: 20 },
  { maxNotional: 15000000, maintenanceMarginRate: 0.05, maxLeverage: 10 },
  { maxNotional: 50000000, maintenanceMarginRate: 0.10, maxLeverage: 5 },
  { maxNotional: Number.MAX_SAFE_INTEGER, maintenanceMarginRate: 0.25, maxLeverage: 2 }
];

const VARSAYILAN_FUNDING_SAAT = 8;

/** 'BTC/USDT:USDT', 'btcusdt', 'BTC/USDT' → 'BTCUSDT'. */
function sembolKimligi(sembol) {
  return String(sembol || '').split(':')[0].replace(/[/\-_]/g, '').toUpperCase();
}

const sayi = (x) => (x === undefined || x === null || x === '' ? null : Number(x));

/**
 * exchangeInfo içindeki TEK sembol nesnesinden filtre kuralları.
 * Sayılar hem sayı hem METİN olarak tutulur: yuvarlama ondalık metinden
 * yapılır ("0.10" iki hane, 0.1 tek hane — fark -1111'de önemli).
 */
function sembolKuralAyristir(s, ortam = 'prod') {
  if (!s || !Array.isArray(s.filters)) throw new Error('exchangeInfo sembol nesnesi bekleniyordu');
  const f = {};
  for (const x of s.filters) f[x.filterType] = x;
  const fiyat = f.PRICE_FILTER || {};
  const lot = f.LOT_SIZE || {};
  const mlot = f.MARKET_LOT_SIZE || lot;
  const pct = f.PERCENT_PRICE || {};
  return {
    sembol: s.symbol,
    ortam,
    durum: s.status || null,
    kontratTipi: s.contractType || null,
    marjVarligi: s.marginAsset || s.quoteAsset || null,
    tickSize: String(fiyat.tickSize ?? '0'),
    minPrice: String(fiyat.minPrice ?? '0'),
    maxPrice: String(fiyat.maxPrice ?? '0'),
    stepSize: String(lot.stepSize ?? '0'),
    minQty: String(lot.minQty ?? '0'),
    maxQty: String(lot.maxQty ?? '0'),
    mktStepSize: String(mlot.stepSize ?? lot.stepSize ?? '0'),
    mktMinQty: String(mlot.minQty ?? lot.minQty ?? '0'),
    mktMaxQty: String(mlot.maxQty ?? lot.maxQty ?? '0'),
    minNotional: sayi(f.MIN_NOTIONAL && (f.MIN_NOTIONAL.notional ?? f.MIN_NOTIONAL.minNotional)) ?? 0,
    pctUp: sayi(pct.multiplierUp),
    pctDown: sayi(pct.multiplierDown),
    maxNumOrders: sayi(f.MAX_NUM_ORDERS && f.MAX_NUM_ORDERS.limit),
    maxNumAlgoOrders: sayi(f.MAX_NUM_ALGO_ORDERS && f.MAX_NUM_ALGO_ORDERS.limit),
    triggerProtect: sayi(s.triggerProtect),
    liquidationFee: sayi(s.liquidationFee),
    marketTakeBound: sayi(s.marketTakeBound),
    orderTypes: Array.isArray(s.orderTypes) ? s.orderTypes.slice() : null,
    timeInForce: Array.isArray(s.timeInForce) ? s.timeInForce.slice() : null,
    // Yalnızca -1111 uyarısı için; HESAPTA KULLANILMAZ (tickSize ile uyuşmuyor).
    pricePrecision: sayi(s.pricePrecision),
    quantityPrecision: sayi(s.quantityPrecision)
  };
}

/** exchangeInfo yanıtının tamamı → { BTCUSDT: kural, … }. */
function exchangeInfoAyristir(ham, ortam = 'prod') {
  const liste = ham && Array.isArray(ham.symbols) ? ham.symbols : (Array.isArray(ham) ? ham : []);
  const out = {};
  for (const s of liste) {
    if (!s || !s.symbol || !Array.isArray(s.filters)) continue;
    out[s.symbol] = sembolKuralAyristir(s, ortam);
  }
  return out;
}

/** fundingInfo yanıtı → { BTCUSDT: { aralikSaat, tavan, taban } }. */
function fundingInfoAyristir(ham) {
  const out = {};
  for (const x of (Array.isArray(ham) ? ham : [])) {
    if (!x || !x.symbol) continue;
    out[x.symbol] = {
      aralikSaat: sayi(x.fundingIntervalHours) || VARSAYILAN_FUNDING_SAAT,
      tavan: sayi(x.adjustedFundingRateCap),
      taban: sayi(x.adjustedFundingRateFloor)
    };
  }
  return out;
}

/**
 * Kademe listesini tek biçime çevirir:
 *   [{ kademe, minNominal, maxNominal, mmr, cum, maxKaldirac, cumKaynak }]
 *
 * Kabul edilen girdiler:
 *   · ham leverageBracket öğesinin `brackets` dizisi
 *     ({bracket, initialLeverage, notionalCap, notionalFloor, maintMarginRatio, cum})
 *   · ccxt `fetchMarketLeverageTiers` çıktısı ({minNotional, maxNotional,
 *     maintenanceMarginRate, maxLeverage, info:{cum}})
 *   · `lib/venues.js` biçimi ({maxNotional, maintenanceMarginRate, maxLeverage, cum?})
 *
 * `cum` borsadan geliyorsa DOĞRUDAN kullanılır (`cumKaynak: 'borsa'`). Gelmiyorsa
 * sürekliliği sağlayan değer türetilir: cum_i = cum_{i−1} + taban_i × (mmr_i − mmr_{i−1}).
 */
function kademeNormalize(liste) {
  if (!Array.isArray(liste) || !liste.length) return [];
  const ara = liste.map((t, i) => {
    const info = t.info || {};
    const mmr = sayi(t.maintMarginRatio ?? t.maintenanceMarginRate ?? t.mmr ?? info.maintMarginRatio);
    const maxN = sayi(t.notionalCap ?? t.maxNotional ?? t.maxNominal ?? info.notionalCap);
    const minN = sayi(t.notionalFloor ?? t.minNotional ?? t.minNominal ?? info.notionalFloor);
    const cum = sayi(t.cum ?? info.cum);
    return {
      kademe: sayi(t.bracket ?? t.tier ?? t.kademe ?? info.bracket) ?? (i + 1),
      minNominal: minN,
      maxNominal: maxN === null ? Number.MAX_SAFE_INTEGER : maxN,
      mmr,
      cum: Number.isFinite(cum) ? cum : null,
      maxKaldirac: sayi(t.initialLeverage ?? t.maxLeverage ?? t.maxKaldirac ?? info.initialLeverage)
    };
  }).filter(t => Number.isFinite(t.mmr)).sort((a, b) => a.maxNominal - b.maxNominal);

  let oncekiCum = 0, oncekiMmr = null, oncekiMax = 0;
  return ara.map((t, i) => {
    const minNominal = Number.isFinite(t.minNominal) ? t.minNominal : (i === 0 ? 0 : oncekiMax);
    let cum = t.cum, cumKaynak = 'borsa';
    if (cum === null) {
      cum = i === 0 ? 0 : oncekiCum + minNominal * (t.mmr - oncekiMmr);
      cumKaynak = 'turetildi';
    }
    oncekiCum = cum; oncekiMmr = t.mmr; oncekiMax = t.maxNominal;
    return { kademe: t.kademe, minNominal, maxNominal: t.maxNominal, mmr: t.mmr, cum, maxKaldirac: t.maxKaldirac, cumKaynak };
  });
}

/**
 * leverageBracket yanıtı → { BTCUSDT: { kademeler, notionalCoef } }.
 * Uç `symbol` verilince tek nesne, verilmeyince dizi döndürür; ikisi de kabul.
 */
function kademeAyristir(ham) {
  const liste = Array.isArray(ham) ? ham : (ham ? [ham] : []);
  const out = {};
  for (const x of liste) {
    if (!x || !x.symbol || !Array.isArray(x.brackets)) continue;
    out[x.symbol] = { kademeler: kademeNormalize(x.brackets), notionalCoef: sayi(x.notionalCoef) };
  }
  return out;
}

const YEDEK_KADEMELER = kademeNormalize(YEDEK_KADEMELER_HAM);

/**
 * Üç ham yanıttan modülün beklediği `kurallar` nesnesi.
 *
 * @returns {{ ortam, semboller: { [sym]: SembolKurali } }}
 *   SembolKurali = sembolKuralAyristir alanları +
 *     funding: { aralikSaat, aralikKaynak:'fundingInfo'|'varsayim', tavan, taban }
 *     kademeler, kademeKaynak:'borsa'|'varsayim', notionalCoef
 */
function kurallarKur({ exchangeInfo, fundingInfo, leverageBracket, ortam = 'prod' } = {}) {
  const filtre = exchangeInfoAyristir(exchangeInfo, ortam);
  const fon = fundingInfoAyristir(fundingInfo);
  const kad = kademeAyristir(leverageBracket);
  const semboller = {};
  for (const [sym, k] of Object.entries(filtre)) {
    const f = fon[sym];
    const kd = kad[sym];
    semboller[sym] = {
      ...k,
      funding: f
        ? { aralikSaat: f.aralikSaat, aralikKaynak: 'fundingInfo', tavan: f.tavan, taban: f.taban }
        : { aralikSaat: VARSAYILAN_FUNDING_SAAT, aralikKaynak: 'varsayim', tavan: null, taban: null },
      kademeler: kd && kd.kademeler.length ? kd.kademeler : YEDEK_KADEMELER,
      kademeKaynak: kd && kd.kademeler.length ? 'borsa' : 'varsayim',
      notionalCoef: kd ? kd.notionalCoef : null
    };
  }
  return { ortam, semboller };
}

/**
 * `kurallar` içinden tek sembolün kuralı. Zaten sembol kuralı verilmişse
 * (tickSize alanı varsa) aynen döner.
 */
function sembolKurali(kurallar, sembol) {
  if (!kurallar) return null;
  if (kurallar.tickSize !== undefined) return kurallar;
  const s = kurallar.semboller || kurallar;
  return s[sembolKimligi(sembol)] || null;
}

module.exports = {
  YEDEK_KADEMELER, YEDEK_KADEMELER_HAM, VARSAYILAN_FUNDING_SAAT,
  sembolKimligi, sembolKuralAyristir, exchangeInfoAyristir, fundingInfoAyristir,
  kademeNormalize, kademeAyristir, kurallarKur, sembolKurali
};
