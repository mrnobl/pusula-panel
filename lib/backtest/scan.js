/**
 * İZLEME LİSTESİ TARAMASI — çoklu varlık, çoklu strateji
 *
 * Simülasyondan ayrı dosyada (`PLAN-MOTOR.md` M-6): tarama, koşucuyu ve
 * optimizatörü ÇAĞIRIR ama ikisinin de içini bilmez.
 *
 * Koşucu (`B`) ve optimizatör argüman olarak alınır, `require` ile
 * içeriden çağrılmaz — ters yönde bir `require` dairesel bağımlılık kurar.
 */
const catalog = require('../strategies/catalog');
const { optimizeParameters } = require('./optimize');

async function scanWatchlist(B, watchlist = [], baseConfig = {}, exchangeOrFn, timeframe = '1h', candlesCount = 500, initialCapital = 10000.0) {
  if (!watchlist || watchlist.length === 0) {
    throw new Error('İzleme listesi boş.');
  }

  /**
   * TARANACAK STRATEJİLER KATALOGDAN GELİR.
   *
   * Burada YEDİ ANAHTARLIK GÖMÜLÜ BİR LİSTE vardı:
   *   ['dca', 'smc_dca', 'rsi_macd', 'grid', 'breakout_atr', 'bj_bot', 'tss_strat']
   * Bu yedi strateji 2026-08-14 arşiv temizliğinde SİLİNDİ. Katalogda
   * olmayan anahtar `create()` içinde hata atıyor, hata aşağıdaki
   * `catch` tarafından yutuluyordu — yani izleme listesi taraması o
   * tarihten beri HER KULLANICI İÇİN BOŞ dönüyordu ve bunu hiçbir yerde
   * söylemiyordu. Panelde "En iyi 5 fırsat" düğmesi çalışıyor görünüp
   * hiçbir şey bulmuyordu.
   *
   * Aynı hastalığın bir başka nüshası: strateji listesinin kod içinde
   * ikinci kez tutulması. Tek kaynak katalogdur.
   */
  const strategiesToTest = (baseConfig && Object.keys(baseConfig).length)
    ? Object.keys(baseConfig).filter(k => catalog.has(k))
    : catalog.keys();
  if (!strategiesToTest.length) throw new Error('Taranacak strateji yok (katalog boş).');

  const allOpportunities = [];
  // Yutulan hatalar sayılır: "hiçbir fırsat yok" ile "her koşu çöktü"
  // birbirinden ayırt edilebilmeli.
  let hataliKosu = 0;

  const scanPromises = watchlist.map(async (symbolItem) => {
    const symbol = typeof symbolItem === 'string' ? symbolItem : symbolItem.symbol;
    let ohlcv = [];
    try {
      if (typeof exchangeOrFn === 'function') {
        ohlcv = await exchangeOrFn(symbol, timeframe, candlesCount);
      } else if (exchangeOrFn && typeof exchangeOrFn.fetchOHLCV === 'function') {
        ohlcv = await exchangeOrFn.fetchOHLCV(symbol, timeframe, candlesCount);
      }
    } catch (err) {
      return;
    }

    if (!ohlcv || ohlcv.length < 30) return;

    for (let stratKey of strategiesToTest) {
      try {
        const stratConfig = baseConfig ? (baseConfig[stratKey] || {}) : {};
        const opt = optimizeParameters(B, stratKey, stratConfig, ohlcv, initialCapital, timeframe);
        if (opt.bestMetrics && opt.bestMetrics.totalTrades > 0) {
          const kayit = catalog.get(stratKey);
          allOpportunities.push({
            symbol,
            strategyKey: stratKey,
            // Etiket KATALOGDAN. Gömülü ad haritası, listeyi ikinci kez
            // tutmanın bir başka biçimiydi ve silinen stratejilerin adlarını
            // taşımaya devam ediyordu.
            strategyName: (kayit && kayit.label) || stratKey,
            timeframe,
            config: opt.bestConfig,
            metrics: opt.bestMetrics
          });
        }
      } catch (e) {
        hataliKosu++;
      }
    }
  });

  await Promise.all(scanPromises);

  allOpportunities.sort((a, b) => b.metrics.score - a.metrics.score);

  return {
    scannedCount: watchlist.length,
    // Künye: "fırsat yok" ile "her koşu çöktü" ayırt edilebilsin.
    strategiesTested: strategiesToTest,
    opportunityCount: allOpportunities.length,
    failedRuns: hataliKosu,
    top5Opportunities: allOpportunities.slice(0, 5)
  };
}

module.exports = { scanWatchlist };
