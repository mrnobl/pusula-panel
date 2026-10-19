/**
 * Strateji karşılaştırma tarayıcısı.
 *
 * Bir strateji × varlık ızgarasını backtest eder ve "bu strateji para kazanır
 * mı" sorusunu yanıtlayacak metrikleri üretir. Toplam getiriye bakmaz —
 * az işlemde toplam getiri şansla dolar, beklenti dolmaz.
 *
 * Ölçüm kararları, bu aracın yazılmasına yol açan yanlış okumalardan çıktı:
 *
 * 1. **Tutar ağırlıklı beklenti.** Eşit ağırlıklı yüzde ortalaması, pozisyon
 *    boyutu değişen stratejilerde yanıltır. SMC DCA'da güvenlik emirleri
 *    aleyhte harekette pozisyonu büyütüyor; eşit ağırlıklı bakınca beklenti
 *    +%0.41 görünüyordu, tutar ağırlıklı −%0.48'di (USDT'de zaten zarardaydı).
 *
 * 2. **Brüt edge.** Beklentiye komisyon geri eklenir. Böylece "işlem maliyeti
 *    yüzünden kaybediyor" ile "fiyat yönünü hiç bilmiyor" ayrılır. Brüt ≈ 0
 *    ise strateji yazı-tura atıyor demektir; komisyonu düşürmek kurtarmaz.
 *
 * 3. **Boyut sapması.** Kaybeden pozisyonların kazananlara oranı. 1'in belirgin
 *    üstü "küçük kazan / büyük kaybet" yapısıdır — yüksek kazanma oranıyla
 *    gizlenir.
 *
 * 4. **Çıkış sebebi kırılımı.** Bj Bot'un 43 çıkışının 27'si stop, 16'sı
 *    breakeven, sıfırı TP çıktı: kâr alma mantığı hiç çalışmıyordu. Bu, özet
 *    metriklerde görünmez.
 */

const Backtester = require('./backtester');

// lib/exchange.js ve lib/backtester.js ile aynı oran.
const FEE_PCT = 0.15;
const ROUND_TRIP_FEE_PCT = FEE_PCT * 2;

const round = (n, d = 4) => {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
};

/** Çıkış sebebini kabaca sınıflar; panelde kırılım olarak gösterilir. */
function classifyExit(reason) {
  const r = String(reason || '');
  if (/Breakeven/i.test(r)) return 'breakeven';
  if (/Kill-?Switch/i.test(r)) return 'killSwitch';
  if (/Stop.?Loss|STOP_LOSS/i.test(r)) return 'stop';
  if (/Trailing/i.test(r)) return 'trailing';
  if (/Take.?Profit|TAKE_PROFIT|Kısmi TP|Kâr Satışı/i.test(r)) return 'takeProfit';
  return 'strateji';
}

/**
 * Tek bir backtest sonucundan metrikleri çıkarır.
 * Ham `trades` dizisinden hesaplar; backtester'ın özet alanlarına güvenmez.
 */
function analyzeTrades(trades) {
  // Kapanış etiketi yön duyarlıdır: long'da SELL, short'ta COVER. Yalnızca
  // 'SELL' aramak, perpetual koşularda short işlemlerinin tamamını sayım
  // dışında bırakıyordu.
  const closed = (trades || []).filter(t => /^(SELL|COVER)/.test(String(t.type || '')));
  if (!closed.length) return null;

  const exits = { stop: 0, breakeven: 0, takeProfit: 0, trailing: 0, strateji: 0, killSwitch: 0 };

  let profitSum = 0;
  let notionalSum = 0;
  let winCount = 0, lossCount = 0;
  let winUsd = 0, lossUsd = 0;
  let winNotional = 0, lossNotional = 0;
  let counted = 0;

  for (const t of closed) {
    exits[classifyExit(t.reason)] += 1;

    const profit = Number(t.profitUSDT);
    const notional = Math.abs(Number(t.amount) * Number(t.entryPrice));
    if (!Number.isFinite(profit) || !Number.isFinite(notional) || notional <= 0) continue;

    counted += 1;
    profitSum += profit;
    notionalSum += notional;

    if (profit > 0) { winCount += 1; winUsd += profit; winNotional += notional; }
    else if (profit < 0) { lossCount += 1; lossUsd += profit; lossNotional += notional; }
  }

  if (!counted || notionalSum <= 0) return null;

  const decided = winCount + lossCount;
  const expectancyPct = (profitSum / notionalSum) * 100;
  const avgWinNotional = winCount ? winNotional / winCount : 0;
  const avgLossNotional = lossCount ? lossNotional / lossCount : 0;

  return {
    trades: closed.length,
    winRatePct: decided ? round((winCount / decided) * 100, 2) : 0,
    avgWinPct: winNotional > 0 ? round((winUsd / winNotional) * 100, 4) : 0,
    avgLossPct: lossNotional > 0 ? round((lossUsd / lossNotional) * 100, 4) : 0,
    expectancyPct: round(expectancyPct, 4),
    // Komisyon geri eklenmiş hâli: stratejinin fiyat yönünden kazandığı.
    grossEdgePct: round(expectancyPct + ROUND_TRIP_FEE_PCT, 4),
    profitUSDT: round(profitSum, 2),
    volumeUSDT: round(notionalSum, 2),
    sizeSkew: (avgWinNotional > 0 && avgLossNotional > 0) ? round(avgLossNotional / avgWinNotional, 2) : 1,
    exits
  };
}

/**
 * Yapılandırma uyarıları: mutlak fiyat ayarlarının test edilen varlığa uyup
 * uymadığı. Uyarı "sonuç geçersiz" demez — Grid gibi stratejiler uyumsuz
 * sınırı fark edip kendi kanalını çapalar. Söylediği şey, o ayarların bu
 * varlıkta yürürlükte olmadığıdır; sonucu ayarı değiştirerek düzeltmeye
 * çalışmadan önce bilinmesi gerekir.
 */
function configWarnings(strategyKey, strategyConfig, lastPrice) {
  const warnings = [];
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) return warnings;

  const bounds = [
    ['upperPrice', strategyConfig.upperPrice],
    ['lowerPrice', strategyConfig.lowerPrice],
    ['stopLossUpper', strategyConfig.stopLossUpper],
    ['stopLossLower', strategyConfig.stopLossLower]
  ];

  for (const [name, value] of bounds) {
    if (!Number.isFinite(value) || value <= 0) continue;
    const ratio = value / lastPrice;
    // Bir büyüklük mertebesinden fazla sapma, ayarın bu varlık için
    // yazılmadığını gösterir.
    if (ratio > 10 || ratio < 0.1) {
      warnings.push(`${name}=${value} bu varlığın fiyatına ($${lastPrice.toFixed(2)}) uymuyor, yürürlükte değil`);
    }
  }

  return warnings;
}

/**
 * Izgarayı çalıştırır.
 *
 * @param {object} opts
 *   strategies      : { key: config } — taranacak stratejiler
 *   symbols         : ['BTC/USDT', ...]
 *   timeframe       : '1h'
 *   candlesCount    : 5000
 *   initialCapital  : 10000
 *   fetchCandles    : async (symbol, timeframe, limit) => ohlcv
 *   onProgress      : ({ done, total, strategyKey, symbol }) => void
 */
async function runScan(opts = {}) {
  const {
    strategies = {},
    symbols = [],
    timeframe = '1h',
    candlesCount = 5000,
    initialCapital = 10000,
    fetchCandles,
    onProgress
  } = opts;

  const keys = Object.keys(strategies);
  if (!keys.length) throw new Error('Taranacak strateji yok.');
  if (!symbols.length) throw new Error('Taranacak varlık yok.');
  if (typeof fetchCandles !== 'function') throw new Error('fetchCandles verilmedi.');

  // Mum verisi varlık başına bir kez çekilir: ızgara aynı seriyi her strateji
  // için yeniden indirseydi tarama borsa limitine takılırdı.
  const candleCache = {};
  for (const symbol of symbols) {
    try {
      candleCache[symbol] = await fetchCandles(symbol, timeframe, candlesCount);
    } catch (err) {
      candleCache[symbol] = [];
    }
  }

  const total = keys.length * symbols.length;
  let done = 0;
  const rows = [];

  for (const key of keys) {
    const stratConfig = strategies[key] || {};

    const cells = [];
    const warnings = new Set();

    for (const symbol of symbols) {
      done += 1;
      if (typeof onProgress === 'function') {
        onProgress({ done, total, strategyKey: key, symbol });
      }

      const ohlcv = candleCache[symbol];
      if (!ohlcv || ohlcv.length < 60) continue;

      const lastPrice = ohlcv[ohlcv.length - 1].close;
      configWarnings(key, stratConfig, lastPrice).forEach(w => warnings.add(`${symbol}: ${w}`));

      let result;
      try {
        result = Backtester.run(key, stratConfig, ohlcv, initialCapital, timeframe);
      } catch (err) {
        continue;
      }

      const metrics = analyzeTrades(result.trades);
      if (!metrics) continue;

      cells.push({
        symbol,
        ...metrics,
        totalReturnPct: round(Number(result.totalReturnPct) || 0, 2),
        maxDrawdownPct: round(Number(result.maxDrawdownPct) || 0, 2)
      });
    }

    if (!cells.length) {
      rows.push({
        strategyKey: key,
        strategyName: stratConfig.name || key,
        tested: 0,
        warnings: Array.from(warnings),
        note: 'Hiç kapanan işlem üretmedi.'
      });
      continue;
    }

    // Toplulaştırma: yüzdeler hacimle, sayımlar toplanarak.
    const totalProfit = cells.reduce((a, c) => a + c.profitUSDT, 0);
    const totalVolume = cells.reduce((a, c) => a + c.volumeUSDT, 0);
    const totalTrades = cells.reduce((a, c) => a + c.trades, 0);
    const expectancyPct = totalVolume > 0 ? (totalProfit / totalVolume) * 100 : 0;

    const exits = { stop: 0, breakeven: 0, takeProfit: 0, trailing: 0, strateji: 0, killSwitch: 0 };
    cells.forEach(c => Object.keys(exits).forEach(k => { exits[k] += c.exits[k]; }));

    const mean = (pick) => cells.reduce((a, c) => a + pick(c), 0) / cells.length;

    rows.push({
      strategyKey: key,
      strategyName: stratConfig.name || key,
      tested: cells.length,
      trades: totalTrades,
      winRatePct: round(mean(c => c.winRatePct), 2),
      avgWinPct: round(mean(c => c.avgWinPct), 4),
      avgLossPct: round(mean(c => c.avgLossPct), 4),
      expectancyPct: round(expectancyPct, 4),
      grossEdgePct: round(expectancyPct + ROUND_TRIP_FEE_PCT, 4),
      profitUSDT: round(totalProfit, 2),
      volumeUSDT: round(totalVolume, 2),
      sizeSkew: round(mean(c => c.sizeSkew), 2),
      avgReturnPct: round(mean(c => c.totalReturnPct), 2),
      avgMaxDrawdownPct: round(mean(c => c.maxDrawdownPct), 2),
      exits,
      warnings: Array.from(warnings),
      cells
    });
  }

  rows.sort((a, b) => (b.expectancyPct ?? -999) - (a.expectancyPct ?? -999));

  const scored = rows.filter(r => r.tested > 0);
  return {
    timeframe,
    candlesCount,
    symbols,
    roundTripFeePct: ROUND_TRIP_FEE_PCT,
    strategyCount: keys.length,
    rows,
    summary: {
      profitable: scored.filter(r => r.expectancyPct > 0).length,
      withGrossEdge: scored.filter(r => r.grossEdgePct > 0.05).length,
      tested: scored.length,
      totalTrades: scored.reduce((a, r) => a + (r.trades || 0), 0),
      // Örneklem uyarısı: kurulum başına 30'un altındaki işlem sayısı,
      // sonucun şans mı edge mi olduğunu ayırt etmeye yetmez.
      thinSamples: scored.filter(r => (r.trades || 0) / Math.max(1, r.tested) < 30).map(r => r.strategyName)
    }
  };
}

module.exports = { runScan, analyzeTrades, classifyExit, ROUND_TRIP_FEE_PCT };
