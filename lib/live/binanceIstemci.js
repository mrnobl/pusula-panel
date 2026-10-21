/**
 * BINANCE USDⓈ-M İSTEMCİSİ — ccxt `binanceusdm` kurulumu, iki ortam.
 *
 *   testnet : Binance "demo trading" (demo-fapi.binance.com). Gerçek para yok.
 *             Anahtar demo hesabın API Management sayfasından alınır, prod
 *             anahtarı burada ÇALIŞMAZ. Fiyat, funding ve filtreler prod'dan
 *             FARKLIDIR (ör. BTC adım 0.0001 vs 0.001) — kurallar her ortamda
 *             borsadan okunur, sabit yazılmaz.
 *   live    : prod (fapi.binance.com). Gerçek para.
 *
 * ccxt notları (araştırma: PLAN-GECE.md F1):
 *   · vadelide `setSandboxMode(true)` artık imzalı isteklerde hata atıyor;
 *     doğrusu `enableDemoTrading(true)`.
 *   · saat farkı düzeltmesi varsayılan KAPALI → -1021 riski; açılıyor.
 *   · STOP/TP/TRAILING emirlerini ccxt (4.5.71, 4.5.89 de) kendisi `/fapi/v1/algoOrder`a
 *     yönlendiriyor (2025-12-09'dan beri zorunlu).
 */
const ccxt = require('ccxt');

const ORTAMLAR = new Set(['testnet', 'live']);

function kur({ ortam, apiKey, apiSecret, ccxtSinifi } = {}) {
  if (!ORTAMLAR.has(ortam)) throw new Error(`ortam testnet | live olmalı, "${ortam}" değil`);
  if (!apiKey || !apiSecret) throw new Error(`${ortam} için API anahtarı/secret tanımlı değil`);
  const Sinif = ccxtSinifi || ccxt.binanceusdm;
  const b = new Sinif({
    apiKey, secret: apiSecret,
    enableRateLimit: true,                  // ccxt kendi ağırlık sınırlayıcısı
    options: {
      adjustForTimeDifference: true,
      recvWindow: 10000,
      defaultType: 'future',
      warnOnFetchOpenOrdersWithoutSymbol: false,
    },
  });
  if (ortam === 'testnet') {
    if (typeof b.enableDemoTrading !== 'function') throw new Error('ccxt sürümü demo trading desteklemiyor');
    b.enableDemoTrading(true);
  }
  b.__ortam = ortam;
  return b;
}

/**
 * Para çekme izni AÇIK anahtarla canlıya bağlanılmaz. Demo ortamında
 * `sapi` yok → sorgu yapılamaz, `null` döner (testnette kabul edilir).
 * @returns {{ enableWithdrawals, enableFutures, ipRestrict, enableSpotAndMarginTrading, permitsUniversalTransfer } | null}
 */
async function anahtarIzinleri(borsa) {
  if (borsa.__ortam !== 'live') return null;
  const r = await borsa.sapiGetAccountApiRestrictions();
  return {
    enableWithdrawals: r.enableWithdrawals === true || r.enableWithdrawals === 'true',
    enableFutures: r.enableFutures === true || r.enableFutures === 'true',
    ipRestrict: r.ipRestrict === true || r.ipRestrict === 'true',
    // Çoklu varlık (gerçek tasarım, lib/live/cokluVarlik.js) için ayrıca gerekir: spot alım/satım + spot ↔ vadeli aktarım.
    enableSpotAndMarginTrading: r.enableSpotAndMarginTrading === true || r.enableSpotAndMarginTrading === 'true',
    permitsUniversalTransfer: r.permitsUniversalTransfer === true || r.permitsUniversalTransfer === 'true',
  };
}

/**
 * VERİ AYRIMI (Hücum/Denge demo): karar verisi (günlük mumlar, evren hacimleri) PROD'un
 * anahtarsız genel uçlarından, emir/bakiye/pozisyon/mark DEMO hesaptan. Gerekçe: demo'nun
 * mum ve hacimleri prod'dan farklı olabilir; kararlar gölge izleyiciyle (prod verisi) aynı
 * veriden çıkmalı ki "gerçekleşen − gölge" farkı yalnız uygulamayı ölçsün.
 * Yalnız `fetchOHLCV` ve `fetchTickers` yönlendirilir; geri kalan her şey işlem borsasınındır.
 */
const VERI_METOTLARI = new Set(['fetchOHLCV', 'fetchTickers']);
function veriAyir(islem, veri) {
  if (!veri) return islem;
  return new Proxy(islem, {
    get(hedef, ad, alici) {
      // Veri borsası (prod) — evren adaylarını iki borsada da bulunanlarla sınırlamak için.
      // Demo, prod'da listeden çıkmış sembolleri (ör. SXP) hâlâ listeliyor; prod'a bu
      // sembolle fetchTickers sorulursa ccxt tüm çağrıyı reddeder (2026-10-06, ilk demo oturumu).
      if (ad === '__veri') return veri;
      if (VERI_METOTLARI.has(ad) && typeof veri[ad] === 'function') return veri[ad].bind(veri);
      const v = Reflect.get(hedef, ad, alici);
      return typeof v === 'function' ? v.bind(hedef) : v;
    },
    set(hedef, ad, deger) { hedef[ad] = deger; return true; },
  });
}

module.exports = { kur, anahtarIzinleri, veriAyir, ORTAMLAR, VERI_METOTLARI };
