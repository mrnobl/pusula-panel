const ti = require('technicalindicators');

/**
 * Enterprise Technical Indicators Library
 */
class Indicators {
  /**
   * Helper to pad indicator arrays at the beginning with null so array.length === targetLength
   */
  static padArray(arr, targetLength) {
    if (!arr) arr = [];
    if (arr.length >= targetLength) return arr;
    const padCount = targetLength - arr.length;
    const padding = new Array(padCount).fill(null);
    return padding.concat(arr);
  }

  /**
   * Calculates Exponential Moving Average (EMA)
   */
  static calculateEMA(closePrices, period) {
    if (!closePrices || closePrices.length < period) return new Array(closePrices ? closePrices.length : 0).fill(null);
    let res = [];
    try {
      res = ti.EMA.calculate({ period, values: closePrices });
    } catch (e) {
      res = this._fallbackEMA(closePrices, period);
    }
    return this.padArray(res, closePrices.length);
  }

  /**
   * Calculates Simple Moving Average (SMA)
   */
  static calculateSMA(values, period) {
    if (!values || values.length < period) return new Array(values ? values.length : 0).fill(null);
    let res = [];
    try {
      res = ti.SMA.calculate({ period, values });
    } catch (e) {
      let sma = [];
      for (let i = period - 1; i < values.length; i++) {
        const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        sma.push(sum / period);
      }
      res = sma;
    }
    return this.padArray(res, values.length);
  }

  /**
   * Calculates Relative Strength Index (RSI)
   */
  static calculateRSI(closePrices, period = 14) {
    if (!closePrices || closePrices.length < period + 1) return new Array(closePrices ? closePrices.length : 0).fill(null);
    let res = [];
    try {
      res = ti.RSI.calculate({ period, values: closePrices });
    } catch (e) {
      res = this._fallbackRSI(closePrices, period);
    }
    return this.padArray(res, closePrices.length);
  }

  /**
   * Calculates Moving Average Convergence Divergence (MACD)
   */
  static calculateMACD(closePrices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!closePrices || closePrices.length < slowPeriod + signalPeriod) return [];
    try {
      const res = ti.MACD.calculate({
        values: closePrices,
        fastPeriod,
        slowPeriod,
        signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });
      return this.padArray(res, closePrices.length);
    } catch (e) {
      return [];
    }
  }

  /**
   * Calculates Weighted Moving Average (WMA)
   */
  static calculateWMA(values, period) {
    if (!values || values.length < period) return new Array(values ? values.length : 0).fill(null);
    let res = [];
    try {
      res = ti.WMA.calculate({ period, values });
    } catch (e) {
      let wma = [];
      const weightSum = (period * (period + 1)) / 2;
      for (let i = period - 1; i < values.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += values[i - period + 1 + j] * (j + 1);
        }
        wma.push(sum / weightSum);
      }
      res = wma;
    }
    return this.padArray(res, values.length);
  }

  /**
   * Calculates Hull Moving Average (HMA)
   */
  static calculateHMA(values, period) {
    if (!values || values.length < period) return new Array(values ? values.length : 0).fill(null);
    const halfLen = Math.max(1, Math.floor(period / 2));
    const sqrtLen = Math.max(1, Math.floor(Math.sqrt(period)));
    const wmaHalf = this.calculateWMA(values, halfLen);
    const wmaFull = this.calculateWMA(values, period);
    
    let diffSeries = [];
    for (let i = 0; i < values.length; i++) {
      if (wmaHalf[i] === null || wmaFull[i] === null) {
        diffSeries.push(null);
      } else {
        diffSeries.push(2 * wmaHalf[i] - wmaFull[i]);
      }
    }
    const validDiffs = diffSeries.filter(v => v !== null);
    const hmaValid = this.calculateWMA(validDiffs, sqrtLen);
    return this.padArray(hmaValid, values.length);
  }

  /**
   * Calculates Double Exponential Moving Average (DEMA)
   */
  static calculateDEMA(values, period) {
    const e1 = this.calculateEMA(values, period);
    if (!e1 || e1.length === 0) return new Array(values ? values.length : 0).fill(null);
    const validE1 = e1.filter(v => v !== null);
    const e2 = this.calculateEMA(validE1, period);
    
    let demaValid = [];
    const offset = validE1.length - e2.length;
    for (let i = 0; i < e2.length; i++) {
      if (e2[i] === null) demaValid.push(null);
      else demaValid.push(2 * validE1[i + offset] - e2[i]);
    }
    return this.padArray(demaValid, values.length);
  }

  /**
   * Calculates Volume Weighted Moving Average (VWMA)
   */
  static calculateVWMA(ohlcv, period) {
    if (!ohlcv || ohlcv.length < period) return new Array(ohlcv ? ohlcv.length : 0).fill(null);
    const pv = ohlcv.map(c => c.close * (c.volume || 1));
    const v = ohlcv.map(c => c.volume || 1);
    const smaPV = this.calculateSMA(pv, period);
    const smaV = this.calculateSMA(v, period);
    let vwma = [];
    for (let i = 0; i < ohlcv.length; i++) {
      if (smaPV[i] === null || smaV[i] === null) {
        vwma.push(null);
      } else {
        vwma.push(smaV[i] === 0 ? ohlcv[i].close : smaPV[i] / smaV[i]);
      }
    }
    return this.padArray(vwma, ohlcv.length);
  }

  /**
   * Calculates Volume Weighted Average Price (VWAP)
   */
  static calculateVWAP(ohlcv) {
    if (!ohlcv || ohlcv.length === 0) return [];
    let cumulativePV = 0;
    let cumulativeVol = 0;
    let vwap = [];
    for (let i = 0; i < ohlcv.length; i++) {
      const tp = (ohlcv[i].high + ohlcv[i].low + ohlcv[i].close) / 3;
      const vol = ohlcv[i].volume || 1;
      cumulativePV += tp * vol;
      cumulativeVol += vol;
      vwap.push(cumulativeVol === 0 ? ohlcv[i].close : cumulativePV / cumulativeVol);
    }
    return vwap;
  }

  /**
   * Calculates Tillson T3 Moving Average
   */
  static calculateT3(values, period, b = 0.7) {
    const e1 = this.calculateEMA(values, period);
    if (!e1 || e1.length === 0) return new Array(values ? values.length : 0).fill(null);
    
    // Cascading EMAs over non-null values
    const cleanSeries = (arr) => arr.filter(v => v !== null);
    const e2 = this.calculateEMA(cleanSeries(e1), period);
    const e3 = this.calculateEMA(cleanSeries(e2), period);
    const e4 = this.calculateEMA(cleanSeries(e3), period);
    const e5 = this.calculateEMA(cleanSeries(e4), period);
    const e6 = this.calculateEMA(cleanSeries(e5), period);

    const c1 = -b * b * b;
    const c2 = 3 * b * b + 3 * b * b * b;
    const c3 = -6 * b * b - 3 * b - 3 * b * b * b;
    const c4 = 1 + 3 * b + b * b * b + 3 * b * b;

    const v3 = cleanSeries(e3);
    const v4 = cleanSeries(e4);
    const v5 = cleanSeries(e5);
    const v6 = cleanSeries(e6);

    let t3Valid = [];
    const off5 = v5.length - v6.length;
    const off4 = v4.length - v6.length;
    const off3 = v3.length - v6.length;

    for (let i = 0; i < v6.length; i++) {
      const val = c1 * v6[i] + c2 * v5[i + off5] + c3 * v4[i + off4] + c4 * v3[i + off3];
      t3Valid.push(val);
    }
    return this.padArray(t3Valid, values.length);
  }

  /**
   * Calculates Arnaud Legoux Moving Average (ALMA)
   */
  static calculateALMA(values, length = 5, offset = 0.5, sigma = 1.0) {
    if (!values || values.length < length) return new Array(values ? values.length : 0).fill(null);
    let alma = [];
    const m = offset * (length - 1);
    const s = length / Math.max(0.001, sigma);
    let weights = [];
    let norm = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.exp(-1 * (i - m) * (i - m) / (2 * s * s));
      weights.push(w);
      norm += w;
    }
    for (let i = 0; i < values.length; i++) {
      if (i < length - 1) {
        alma.push(null);
        continue;
      }
      let sum = 0;
      for (let j = 0; j < length; j++) {
        sum += values[i - length + 1 + j] * weights[j];
      }
      alma.push(sum / (norm || 1));
    }
    return this.padArray(alma, values.length);
  }

  /**
   * Calculates Heikin-Ashi Open values
   */
  static calculateHeikinAshiOpen(ohlcv) {
    if (!ohlcv || ohlcv.length === 0) return [];
    let haOpens = [];
    let prevHaOpen = null;
    let prevHaClose = null;

    for (let i = 0; i < ohlcv.length; i++) {
      const c = ohlcv[i];
      const haClose = (c.open + c.high + c.low + c.close) / 4;
      let haOpen;
      if (prevHaOpen === null) {
        haOpen = (c.open + c.close) / 2;
      } else {
        haOpen = (prevHaOpen + prevHaClose) / 2;
      }
      haOpens.push(haOpen);
      prevHaOpen = haOpen;
      prevHaClose = haClose;
    }
    return haOpens;
  }

  /**
   * Master MA Calculator (EMA, HEMA, SMA, HMA, WMA, DEMA, VWMA, VWAP, T3, ALMA)
   */
  static getMA(type, period, ohlcv) {
    const closes = ohlcv.map(c => c.close);
    const maType = (type || 'EMA').toUpperCase();

    switch (maType) {
      case 'HEMA': {
        const haOpens = this.calculateHeikinAshiOpen(ohlcv);
        return this.calculateEMA(haOpens, period);
      }
      case 'SMA':
        return this.calculateSMA(closes, period);
      case 'HMA':
        return this.calculateHMA(closes, period);
      case 'WMA':
        return this.calculateWMA(closes, period);
      case 'DEMA':
        return this.calculateDEMA(closes, period);
      case 'VWMA':
        return this.calculateVWMA(ohlcv, period);
      case 'VWAP':
        return this.calculateVWAP(ohlcv);
      case 'T3':
        return this.calculateT3(closes, period);
      case 'ALMA':
        return this.calculateALMA(closes, period);
      case 'EMA':
      default:
        return this.calculateEMA(closes, period);
    }
  }

  /**
   * Calculates Average True Range (ATR)
   */
  static calculateATR(ohlcvData, period = 14) {
    if (!ohlcvData || ohlcvData.length < period) return new Array(ohlcvData ? ohlcvData.length : 0).fill(null);
    let res = [];
    try {
      const high = ohlcvData.map(c => c.high);
      const low = ohlcvData.map(c => c.low);
      const close = ohlcvData.map(c => c.close);
      res = ti.ATR.calculate({ period, high, low, close });
    } catch (e) {
      res = [];
    }
    return this.padArray(res, ohlcvData.length);
  }

  /**
   * Calculates Average Directional Index (ADX) for Market Regime Detection
   */
  static calculateADX(ohlcvData, period = 14) {
    if (!ohlcvData || ohlcvData.length < period * 2) return [];
    try {
      const high = ohlcvData.map(c => c.high);
      const low = ohlcvData.map(c => c.low);
      const close = ohlcvData.map(c => c.close);
      return ti.ADX.calculate({ period, high, low, close });
    } catch (e) {
      return [];
    }
  }

  /**
   * Detects current Market Regime (TRENDING, RANGING, HIGH_VOLATILITY)
   */
  static detectMarketRegime(ohlcvData) {
    if (!ohlcvData || ohlcvData.length < 30) {
      return { regime: 'RANGING', adx: 15, volatilityRatio: 1.0 };
    }

    const atrValues = this.calculateATR(ohlcvData, 14);
    const latestAtr = atrValues.length > 0 ? atrValues[atrValues.length - 1] : 0;
    const avgAtr = atrValues.length >= 10 ? atrValues.slice(-10).reduce((a, b) => a + b, 0) / 10 : latestAtr;

    const adxValues = this.calculateADX(ohlcvData, 14);
    const latestAdx = adxValues.length > 0 ? adxValues[adxValues.length - 1].adx : 20;

    const volatilityRatio = avgAtr > 0 ? latestAtr / avgAtr : 1.0;

    let regime = 'RANGING';
    if (volatilityRatio > 2.2) {
      regime = 'HIGH_VOLATILITY';
    } else if (latestAdx > 25) {
      regime = 'TRENDING';
    }

    return { regime, adx: +latestAdx.toFixed(1), atr: +latestAtr.toFixed(2), volatilityRatio: +volatilityRatio.toFixed(2) };
  }

  // --- Fallback Functions ---
  static _fallbackEMA(values, period) {
    const k = 2 / (period + 1);
    let emaArray = [values[0]];
    for (let i = 1; i < values.length; i++) {
      const ema = values[i] * k + emaArray[i - 1] * (1 - k);
      emaArray.push(ema);
    }
    return emaArray;
  }

  static _fallbackRSI(values, period = 14) {
    let rsiArray = [];
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = values[i] - values[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiArray.push(100 - (100 / (1 + rs)));

    for (let i = period + 1; i < values.length; i++) {
      const diff = values[i] - values[i - 1];
      const gain = diff >= 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsiArray.push(100 - (100 / (1 + rs)));
    }
    return rsiArray;
  }
}

module.exports = Indicators;

