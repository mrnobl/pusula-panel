/**
 * Backtest analytics.
 *
 * Every number here is derived from the raw simulation output — the closed
 * trades, the per-bar equity series (close plus intrabar high/low) and the
 * buy-and-hold benchmark series. Nothing is estimated or carried over from the
 * summary metrics, so each figure can be traced back to the bars that produced it.
 *
 * The simulated account is long-only spot with no leverage. Metrics that only
 * exist for margin accounts (margin calls, liquidations) are reported as such
 * rather than filled with placeholder numbers.
 */

/**
 * Yıllık bar sayısı — TEK kaynak `constants.getCandlesPerYear`. Burada ayrı
 * bir tablo vardı ve 2h/6h/8h/12h/3d/1w'yi bilmiyordu: bilinmeyen dilim
 * sessizce 60 dakikaya düşüyor, haftalıkta Sharpe ~13 kat çıkıyordu.
 */
const { getCandlesPerYear } = require('./backtest/constants');
const barsPerYear = (timeframe) => getCandlesPerYear(timeframe);

/**
 * En büyük / en küçük — TEK GEÇİŞ. `Math.max(...dizi)` V8'de ~120 bin
 * elemanın üstünde "Maximum call stack size exceeded" atar; yıllarca 1m/15m
 * backtestinde analitik bu yüzden çöküyordu (2026-10-06).
 */
const enBuyuk = (arr) => { let m = -Infinity; for (const x of arr) if (x > m) m = x; return m; };

/**
 * SHARPE / SORTINO — GÜNLÜK GETİRİLERDEN, ×√365.
 *
 * Eskiden bar getirisi ×√(yıllık bar) idi: 1m'de çarpan √525600 ≈ 725 ve
 * pozisyonsuz barların sıfırları + mikroyapı gürültüsü oranı şişiriyordu;
 * aynı strateji 1h ile 1m'de farklı Sharpe alıyordu. Kripto 7/24 olduğu
 * için yıl 365 gün. Gün = UTC günü, günün SON özsermayesi.
 *
 * Günlükten büyük dilimde (3d, 1w) bar getirisi ×√(yıllık bar) kullanılır;
 * günlük toplama orada anlamsız. 3 günden az veride 0 döner.
 * Örneklem standart sapması (n−1).
 */
function gunlukOranlar(zamanlar, degerler, timeframe) {
  let r = [];
  if (barsPerYear(timeframe) < 365) {
    for (let i = 1; i < degerler.length; i++) if (degerler[i - 1] > 0) r.push(degerler[i] / degerler[i - 1] - 1);
    const f = Math.sqrt(barsPerYear(timeframe));
    return oranlar(r, f);
  }
  const gunSonu = [];
  let sonGun = null;
  for (let i = 0; i < degerler.length; i++) {
    const z = typeof zamanlar[i] === 'number' ? zamanlar[i] : Date.parse(zamanlar[i]);
    if (!Number.isFinite(z)) continue;
    const g = Math.floor(z / 864e5);
    if (g !== sonGun) { gunSonu.push(degerler[i]); sonGun = g; } else gunSonu[gunSonu.length - 1] = degerler[i];
  }
  for (let i = 1; i < gunSonu.length; i++) if (gunSonu[i - 1] > 0) r.push(gunSonu[i] / gunSonu[i - 1] - 1);
  return oranlar(r, Math.sqrt(365));
}

function oranlar(r, f) {
  if (r.length < 3) return { sharpe: 0, sortino: 0, gun: r.length };
  const ort = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - ort) ** 2, 0) / (r.length - 1));
  const asagi = Math.sqrt(r.reduce((a, b) => a + Math.min(0, b) ** 2, 0) / r.length);
  return { sharpe: sd > 0 ? ort / sd * f : 0, sortino: asagi > 0 ? ort / asagi * f : 0, gun: r.length };
}
const enKucuk = (arr) => { let m = Infinity; for (const x of arr) if (x < m) m = x; return m; };

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const mean = (arr) => (arr.length ? sum(arr) / arr.length : 0);
const round = (n, d = 2) => {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
};

/** Standard deviation (population). */
function stdDev(arr) {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(v => (v - m) ** 2)));
}

/** Downside deviation — only negative deviations count (Sortino denominator). */
function downsideDeviation(arr, target = 0) {
  if (arr.length === 0) return 0;
  const below = arr.map(v => Math.min(0, v - target) ** 2);
  return Math.sqrt(mean(below));
}

/**
 * Peak-to-trough episodes over an equity series.
 * `pick` selects which price of the bar to use, so the same walk yields both
 * close-to-close and intrabar figures.
 */
function findExcursions(series, pickHigh, pickLow) {
  const runUps = [];
  const drawdowns = [];
  if (series.length === 0) return { runUps, drawdowns };

  let peak = pickHigh(series[0]);
  let peakIdx = 0;
  let trough = pickLow(series[0]);
  let troughIdx = 0;

  for (let i = 1; i < series.length; i++) {
    const hi = pickHigh(series[i]);
    const lo = pickLow(series[i]);

    if (hi > peak) {
      // New high closes the drawdown that started at the previous peak.
      if (trough < peak) {
        drawdowns.push({
          amount: peak - trough,
          pct: peak > 0 ? ((peak - trough) / peak) * 100 : 0,
          bars: Math.max(1, troughIdx - peakIdx),
          startIndex: peakIdx,
          endIndex: troughIdx
        });
      }
      peak = hi;
      peakIdx = i;
      trough = lo;
      troughIdx = i;
    } else if (lo < trough) {
      trough = lo;
      troughIdx = i;
    }
  }

  // Whatever is still open at the end counts as the current excursion.
  if (trough < peak) {
    drawdowns.push({
      amount: peak - trough,
      pct: peak > 0 ? ((peak - trough) / peak) * 100 : 0,
      bars: Math.max(1, troughIdx - peakIdx),
      startIndex: peakIdx,
      endIndex: troughIdx,
      current: true
    });
  }

  // Run-ups are the mirror image: trough to the following peak.
  let low = pickLow(series[0]);
  let lowIdx = 0;
  let high = pickHigh(series[0]);
  let highIdx = 0;

  for (let i = 1; i < series.length; i++) {
    const hi = pickHigh(series[i]);
    const lo = pickLow(series[i]);

    if (lo < low) {
      if (high > low) {
        runUps.push({
          amount: high - low,
          pct: low > 0 ? ((high - low) / low) * 100 : 0,
          bars: Math.max(1, highIdx - lowIdx),
          startIndex: lowIdx,
          endIndex: highIdx
        });
      }
      low = lo;
      lowIdx = i;
      high = hi;
      highIdx = i;
    } else if (hi > high) {
      high = hi;
      highIdx = i;
    }
  }

  if (high > low) {
    runUps.push({
      amount: high - low,
      pct: low > 0 ? ((high - low) / low) * 100 : 0,
      bars: Math.max(1, highIdx - lowIdx),
      startIndex: lowIdx,
      endIndex: highIdx,
      current: true
    });
  }

  return { runUps, drawdowns };
}

/** Tukey outliers: beyond 1.5 × IQR from the quartiles. */
function findOutliers(values) {
  if (values.length < 4) return { indices: [], count: 0, amount: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => {
    const pos = (sorted.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined
      ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
      : sorted[base];
  };

  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;

  const indices = [];
  values.forEach((v, i) => { if (v < lo || v > hi) indices.push(i); });

  return {
    indices,
    count: indices.length,
    amount: sum(indices.map(i => values[i]))
  };
}

/** Buckets trade returns into fixed % bins for the distribution histogram. */
function buildReturnHistogram(returnsPct) {
  const edges = [-15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15];
  const bins = [];

  for (let i = 0; i < edges.length - 1; i++) {
    bins.push({ from: edges[i], to: edges[i + 1], count: 0, label: `${edges[i]}% – ${edges[i + 1]}%` });
  }
  const under = { from: -Infinity, to: -15, count: 0, label: '< -15%' };
  const over = { from: 15, to: Infinity, count: 0, label: '> +15%' };

  returnsPct.forEach(r => {
    if (r < -15) { under.count++; return; }
    if (r > 15) { over.count++; return; }
    const idx = bins.findIndex(b => r >= b.from && r < b.to);
    if (idx >= 0) bins[idx].count++;
    else bins[bins.length - 1].count++; // exactly +15%
  });

  return [under, ...bins, over];
}

/**
 * @param {Object} input
 * @param {Array}  input.closedTrades  completed round trips
 * @param {Array}  input.equitySeries  per bar: {close, high, low, deployed}
 * @param {Array}  input.buyHoldSeries per bar: {value}
 */
function computeAnalytics(input) {
  const {
    closedTrades = [],
    equitySeries = [],
    buyHoldSeries = [],
    initialCapital = 10000,
    finalEquity = initialCapital,
    openPnl = 0,
    openTrade = null,
    totalCommission = 0,
    maxCapitalDeployed = 0,
    avgCapitalDeployed = 0,
    timeframe = '1h'
  } = input;

  // ---- Realised results -----------------------------------------------------
  const winners = closedTrades.filter(t => t.profitUSDT > 0);
  const losers = closedTrades.filter(t => t.profitUSDT < 0);
  const breakevens = closedTrades.filter(t => t.profitUSDT === 0);

  const grossProfit = sum(winners.map(t => t.profitUSDT));
  const grossLoss = Math.abs(sum(losers.map(t => t.profitUSDT)));
  const netPnl = sum(closedTrades.map(t => t.profitUSDT));
  const totalPnl = netPnl + openPnl;

  const winRate = closedTrades.length > 0 ? (winners.length / closedTrades.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

  const avgProfit = winners.length > 0 ? grossProfit / winners.length : 0;
  const avgLoss = losers.length > 0 ? grossLoss / losers.length : 0;
  const avgPnl = closedTrades.length > 0 ? netPnl / closedTrades.length : 0;
  const expectancy = closedTrades.length > 0
    ? (winRate / 100) * avgProfit - (1 - winRate / 100) * avgLoss
    : 0;

  const largestProfit = winners.length > 0 ? enBuyuk(winners.map(t => t.profitUSDT)) : 0;
  const largestLoss = losers.length > 0 ? enKucuk(losers.map(t => t.profitUSDT)) : 0;
  const largestProfitTrade = winners.find(t => t.profitUSDT === largestProfit) || null;
  const largestLossTrade = losers.find(t => t.profitUSDT === largestLoss) || null;

  const barsAll = closedTrades.map(t => t.barsInTrade || 0);
  const barsWin = winners.map(t => t.barsInTrade || 0);
  const barsLoss = losers.map(t => t.barsInTrade || 0);

  const outliers = findOutliers(closedTrades.map(t => t.profitUSDT));

  // ---- Equity excursions ----------------------------------------------------
  const closeWalk = findExcursions(equitySeries, s => s.close, s => s.close);
  const intrabarWalk = findExcursions(equitySeries, s => s.high, s => s.low);

  const maxDD = (list) => (list.length ? enBuyuk(list.map(d => d.amount)) : 0);
  const maxDDPct = (list) => (list.length ? enBuyuk(list.map(d => d.pct)) : 0);
  const maxRU = (list) => (list.length ? enBuyuk(list.map(d => d.amount)) : 0);

  const maxDrawdownClose = maxDD(closeWalk.drawdowns);
  const maxDrawdownIntrabar = maxDD(intrabarWalk.drawdowns);
  const maxRunUpClose = maxRU(closeWalk.runUps);
  const maxRunUpIntrabar = maxRU(intrabarWalk.runUps);
  const currentDrawdown = closeWalk.drawdowns.find(d => d.current);

  // ---- Benchmark ------------------------------------------------------------
  const bhStart = buyHoldSeries.length ? buyHoldSeries[0].value : initialCapital;
  const bhEnd = buyHoldSeries.length ? buyHoldSeries[buyHoldSeries.length - 1].value : initialCapital;
  const buyHoldPnl = bhEnd - initialCapital;
  const buyHoldPct = initialCapital > 0 ? (buyHoldPnl / initialCapital) * 100 : 0;

  const strategyPctSeries = equitySeries.map(s => ((s.close - initialCapital) / initialCapital) * 100);
  const buyHoldPctSeries = buyHoldSeries.map(s => ((s.value - initialCapital) / initialCapital) * 100);

  const totalPnlPct = initialCapital > 0 ? (totalPnl / initialCapital) * 100 : 0;
  const alphaPct = totalPnlPct - buyHoldPct;
  const alphaAbs = totalPnl - buyHoldPnl;

  // ---- Risk-adjusted --------------------------------------------------------
  const barReturns = [];
  for (let i = 1; i < equitySeries.length; i++) {
    const prev = equitySeries[i - 1].close;
    if (prev > 0) barReturns.push((equitySeries[i].close - prev) / prev);
  }

  // Sharpe / Sortino GÜNLÜK getirilerden (bkz. `gunlukOranlar`).
  const { sharpe, sortino } = gunlukOranlar(equitySeries.map(s => s.time), equitySeries.map(s => s.close), timeframe);

  // ---- Capital efficiency ---------------------------------------------------
  // Yıl TAKVİMDEN: bar sayısından hesaplamak borsa kesintisi ya da veri
  // boşluğu olan seride CAGR'ı bozuyordu. Zaman okunamazsa eski yola düşer.
  const ilkZ = equitySeries.length ? Date.parse(equitySeries[0].time) : NaN;
  const sonZ = equitySeries.length ? Date.parse(equitySeries[equitySeries.length - 1].time) : NaN;
  const years = Number.isFinite(ilkZ) && Number.isFinite(sonZ) && sonZ > ilkZ
    ? (sonZ - ilkZ) / (365.25 * 864e5)
    : (equitySeries.length > 0 ? equitySeries.length / barsPerYear(timeframe) : 0);

  // Annualising a very short sample produces absurd numbers (a 5-bar test can
  // extrapolate to 1e74%). Below roughly a month of data CAGR is not reported
  // at all rather than shown as a meaningless figure.
  const MIN_YEARS_FOR_CAGR = 30 / 365;
  const cagr = (years >= MIN_YEARS_FOR_CAGR && initialCapital > 0 && finalEquity > 0)
    ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100
    : null;

  // Capital that must be on hand: the most ever committed plus the deepest
  // intrabar equity decline the strategy had to sit through.
  const requiredAccountSize = maxCapitalDeployed + maxDrawdownIntrabar;
  const returnOnInitial = initialCapital > 0 ? (totalPnl / initialCapital) * 100 : 0;
  const returnOnRequired = requiredAccountSize > 0 ? (totalPnl / requiredAccountSize) * 100 : 0;
  const netPnlVsLargestLoss = largestLoss !== 0 ? (netPnl / Math.abs(largestLoss)) * 100 : 0;
  const returnOfMaxDrawdown = maxDrawdownIntrabar > 0 ? totalPnl / maxDrawdownIntrabar : 0;

  const marginSeries = equitySeries.map(s => (s.close > 0 ? (s.deployed / s.close) * 100 : 0));

  return {
    // Key stats
    key: {
      totalPnl: round(totalPnl),
      totalPnlPct: round(totalPnlPct),
      maxDrawdown: round(maxDrawdownIntrabar),
      maxDrawdownPct: round(maxDDPct(intrabarWalk.drawdowns)),
      winRate: round(winRate),
      winners: winners.length,
      totalTrades: closedTrades.length,
      profitFactor: Number.isFinite(profitFactor) ? round(profitFactor) : null
    },

    // Section 2 — return details
    returns: {
      openPnl: round(openPnl),
      expectancy: round(expectancy),
      alphaPct: round(alphaPct),
      alphaAbs: round(alphaAbs),
      sharpe: round(sharpe),
      sortino: round(sortino),
      profitStructure: {
        grossProfit: round(grossProfit),
        openPnl: round(openPnl),
        grossLoss: round(-grossLoss),
        commission: round(-totalCommission),
        totalPnl: round(totalPnl)
      },
      benchmarkRange: {
        strategy: {
          max: round(strategyPctSeries.length ? enBuyuk(strategyPctSeries) : 0),
          current: round(totalPnlPct),
          min: round(strategyPctSeries.length ? enKucuk(strategyPctSeries) : 0)
        },
        buyHold: {
          max: round(buyHoldPctSeries.length ? enBuyuk(buyHoldPctSeries) : 0),
          current: round(buyHoldPct),
          min: round(buyHoldPctSeries.length ? enKucuk(buyHoldPctSeries) : 0)
        }
      },
      earnings: {
        initialCapital: round(initialCapital),
        openPnl: round(openPnl),
        netPnl: round(netPnl),
        grossProfit: round(grossProfit),
        grossLoss: round(-grossLoss),
        profitFactor: Number.isFinite(profitFactor) ? round(profitFactor) : null,
        commission: round(totalCommission),
        expectancy: round(expectancy)
      },
      benchmarking: {
        buyHoldPnl: round(buyHoldPnl),
        buyHoldPct: round(buyHoldPct),
        alphaAbs: round(alphaAbs),
        alphaPct: round(alphaPct)
      }
    },

    // Section 3 — trade analysis
    trades: {
      avgPnl: round(avgPnl),
      avgBars: round(mean(barsAll), 1),
      largestProfit: round(largestProfit),
      largestLoss: round(largestLoss),
      histogram: buildReturnHistogram(closedTrades.map(t => t.profitPct || 0)),
      avgProfitPct: round(mean(winners.map(t => t.profitPct || 0))),
      avgLossPct: round(mean(losers.map(t => t.profitPct || 0))),
      distribution: {
        total: closedTrades.length,
        winners: winners.length,
        losers: losers.length,
        breakevens: breakevens.length
      },
      detail: {
        totalTrades: closedTrades.length,
        openTrades: openTrade ? 1 : 0,
        winners: winners.length,
        losers: losers.length,
        winRate: round(winRate),
        avgPnl: round(avgPnl),
        avgProfit: round(avgProfit),
        avgLoss: round(-avgLoss),
        profitLossRatio: avgLoss > 0 ? round(avgProfit / avgLoss) : null,
        largestProfit: round(largestProfit),
        largestProfitPct: largestProfitTrade ? round(largestProfitTrade.profitPct) : 0,
        largestProfitShare: grossProfit > 0 ? round((largestProfit / grossProfit) * 100) : 0,
        largestLoss: round(largestLoss),
        largestLossPct: largestLossTrade ? round(largestLossTrade.profitPct) : 0,
        largestLossShare: grossLoss > 0 ? round((Math.abs(largestLoss) / grossLoss) * 100) : 0,
        outlierCount: outliers.count,
        outlierAmount: round(outliers.amount),
        avgBarsAll: round(mean(barsAll), 1),
        avgBarsWinners: round(mean(barsWin), 1),
        avgBarsLosers: round(mean(barsLoss), 1)
      }
    },

    // Section 4 — run-ups and drawdowns
    excursions: {
      avgRunUpDuration: round(mean(closeWalk.runUps.map(r => r.bars)), 1),
      avgDrawdownDuration: round(mean(closeWalk.drawdowns.map(d => d.bars)), 1),
      maxDrawdownPctOfInitial: initialCapital > 0 ? round((maxDrawdownIntrabar / initialCapital) * 100) : 0,
      returnOfMaxDrawdown: round(returnOfMaxDrawdown),
      bars: {
        runUp: round(maxRunUpIntrabar),
        drawdown: round(maxDrawdownIntrabar),
        currentDrawdown: round(currentDrawdown ? currentDrawdown.amount : 0)
      },
      comparison: {
        runUpMax: round(maxRU(intrabarWalk.runUps)),
        runUpAvg: round(mean(intrabarWalk.runUps.map(r => r.amount))),
        drawdownMax: round(maxDrawdownIntrabar),
        drawdownAvg: round(mean(intrabarWalk.drawdowns.map(d => d.amount))),
        drawdownCurrent: round(currentDrawdown ? currentDrawdown.amount : 0)
      },
      runUpTable: {
        avgDuration: round(mean(closeWalk.runUps.map(r => r.bars)), 1),
        avgRunUp: round(mean(closeWalk.runUps.map(r => r.amount))),
        maxRunUpClose: round(maxRunUpClose),
        maxRunUpIntrabar: round(maxRunUpIntrabar),
        maxRunUpPctOfInitial: initialCapital > 0 ? round((maxRunUpIntrabar / initialCapital) * 100) : 0
      },
      drawdownTable: {
        avgDuration: round(mean(closeWalk.drawdowns.map(d => d.bars)), 1),
        avgDrawdown: round(mean(closeWalk.drawdowns.map(d => d.amount))),
        maxDrawdownClose: round(maxDrawdownClose),
        maxDrawdownIntrabar: round(maxDrawdownIntrabar),
        maxDrawdownPctOfInitial: initialCapital > 0 ? round((maxDrawdownIntrabar / initialCapital) * 100) : 0,
        returnOfMaxDrawdown: round(returnOfMaxDrawdown)
      }
    },

    // Section 5 — capital efficiency
    capital: {
      cagr: cagr === null ? null : round(cagr),
      cagrNote: cagr === null ? `Yıllıklandırma için en az 30 günlük veri gerekir (mevcut: ${round(years * 365, 1)} gün)` : null,
      coveredDays: round(years * 365, 1),
      requiredAccountSize: round(requiredAccountSize),
      returnOnInitial: round(returnOnInitial),
      returnOnRequired: round(returnOnRequired),
      netPnlVsLargestLoss: round(netPnlVsLargestLoss),
      marginCalls: 0,
      usage: {
        avgMarginUsed: round(avgCapitalDeployed),
        maxMarginUsed: round(maxCapitalDeployed),
        marginEfficiency: maxCapitalDeployed > 0 ? round(totalPnl / maxCapitalDeployed, 4) : 0,
        marginCalls: 0,
        liquidatedVolume: 0,
        largestLiquidation: 0
      },
      marginSeries: marginSeries.map(v => round(v)),
      // Spot, cash-funded: there is no borrowing, so these are structurally zero
      // rather than "not measured".
      leverage: 'Kaldıraçsız spot (1:1)'
    },

    // Series for the charts
    series: {
      time: equitySeries.map(s => s.time),
      equity: equitySeries.map(s => round(s.close)),
      cumulativePnl: equitySeries.map(s => round(s.close - initialCapital)),
      buyHold: buyHoldSeries.map(s => round(s.value - initialCapital)),
      runUp: equitySeries.map(s => round(s.high - s.close)),
      drawdown: equitySeries.map(s => round(s.close - s.low))
    }
  };
}

module.exports = { computeAnalytics, barsPerYear, gunlukOranlar };
