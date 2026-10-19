const ti = require('technicalindicators');
const { register } = require('../registry');
const { clean, splitAndPad, pluck } = require('../contract');
const { sourceSeries, SOURCE_PARAM } = require('./moving');

/** Momentum ve osilatörler. */

register({
  key: 'rsi',
  label: 'RSI',
  group: 'momentum',
  kind: 'series',
  outputs: ['value'],
  params: { period: { type: 'number', default: 14, min: 2 }, source: SOURCE_PARAM },
  warmup: (p) => p.period + 1,
  compute: (candles, p) => {
    const v = sourceSeries(candles, p.source);
    let res = [];
    try { res = ti.RSI.calculate({ period: p.period, values: v }); } catch (e) { res = []; }
    return { value: clean(res, candles.length) };
  }
});

register({
  key: 'macd',
  label: 'MACD',
  group: 'momentum',
  kind: 'series',
  outputs: ['macd', 'signal', 'histogram'],
  params: {
    fast: { type: 'number', default: 12, min: 1 },
    slow: { type: 'number', default: 26, min: 2 },
    signal: { type: 'number', default: 9, min: 1 },
    source: SOURCE_PARAM
  },
  warmup: (p) => p.slow + p.signal,
  compute: (candles, p) => {
    const v = sourceSeries(candles, p.source);
    let res = [];
    try {
      res = ti.MACD.calculate({
        values: v,
        fastPeriod: p.fast,
        slowPeriod: p.slow,
        signalPeriod: p.signal,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });
    } catch (e) { res = []; }

    // Kütüphane alanı 'MACD' adıyla döner; havuz sözleşmesinde 'macd'.
    const split = splitAndPad(res, ['MACD', 'signal', 'histogram'], candles.length);
    return { macd: split.MACD, signal: split.signal, histogram: split.histogram };
  }
});

register({
  key: 'williams_r',
  label: 'Williams %R',
  group: 'momentum',
  kind: 'series',
  outputs: ['value'],
  params: { period: { type: 'number', default: 14, min: 2 } },
  warmup: (p) => p.period,
  note: '0 ile -100 arasında. -20 üstü aşırı alım, -80 altı aşırı satım kabul edilir.',
  compute: (candles, p) => {
    let res = [];
    try {
      res = ti.WilliamsR.calculate({
        period: p.period,
        high: pluck(candles, 'high'),
        low: pluck(candles, 'low'),
        close: pluck(candles, 'close')
      });
    } catch (e) { res = []; }
    return { value: clean(res, candles.length) };
  }
});

/**
 * Aroon — kütüphanede YOK, elle yazıldı.
 *
 * Aroon Up  = 100 × (periyot − son en yüksekten bu yana geçen bar) / periyot
 * Aroon Down= 100 × (periyot − son en düşükten bu yana geçen bar) / periyot
 *
 * Trendin YAŞINI ölçer, gücünü değil: ADX "ne kadar güçlü" derken Aroon
 * "en son ne zaman yeni uç yapıldı" der. İkisi birlikte trendin hem
 * kuvvetini hem tazeliğini verir.
 */
register({
  key: 'aroon',
  label: 'Aroon',
  group: 'momentum',
  kind: 'series',
  outputs: ['up', 'down', 'oscillator'],
  params: { period: { type: 'number', default: 14, min: 2 } },
  warmup: (p) => p.period,
  compute: (candles, p) => {
    const period = Math.max(2, Math.floor(p.period));
    const highs = pluck(candles, 'high');
    const lows = pluck(candles, 'low');

    const up = [];
    const down = [];
    const osc = [];

    for (let i = 0; i < candles.length; i++) {
      if (i < period) { up.push(null); down.push(null); osc.push(null); continue; }

      // Pencere son `period` barı kapsar (mevcut bar dahil).
      let highestIdx = i;
      let lowestIdx = i;
      for (let j = i - period; j <= i; j++) {
        if (highs[j] >= highs[highestIdx]) highestIdx = j;
        if (lows[j] <= lows[lowestIdx]) lowestIdx = j;
      }

      const barsSinceHigh = i - highestIdx;
      const barsSinceLow = i - lowestIdx;
      const u = (100 * (period - barsSinceHigh)) / period;
      const d = (100 * (period - barsSinceLow)) / period;

      up.push(u);
      down.push(d);
      osc.push(u - d);
    }

    const n = candles.length;
    return { up: clean(up, n), down: clean(down, n), oscillator: clean(osc, n) };
  }
});

register({
  key: 'stochastic',
  label: 'Stokastik',
  group: 'momentum',
  kind: 'series',
  outputs: ['k', 'd'],
  params: {
    period: { type: 'number', default: 14, min: 2 },
    signalPeriod: { type: 'number', default: 3, min: 1 }
  },
  warmup: (p) => p.period + p.signalPeriod,
  compute: (candles, p) => {
    let res = [];
    try {
      res = ti.Stochastic.calculate({
        period: p.period,
        signalPeriod: p.signalPeriod,
        high: pluck(candles, 'high'),
        low: pluck(candles, 'low'),
        close: pluck(candles, 'close')
      });
    } catch (e) { res = []; }
    const split = splitAndPad(res, ['k', 'd'], candles.length);
    return { k: split.k, d: split.d };
  }
});

register({
  key: 'cci',
  label: 'CCI',
  group: 'momentum',
  kind: 'series',
  outputs: ['value'],
  params: { period: { type: 'number', default: 20, min: 2 } },
  warmup: (p) => p.period,
  compute: (candles, p) => {
    let res = [];
    try {
      res = ti.CCI.calculate({
        period: p.period,
        high: pluck(candles, 'high'),
        low: pluck(candles, 'low'),
        close: pluck(candles, 'close')
      });
    } catch (e) { res = []; }
    return { value: clean(res, candles.length) };
  }
});
