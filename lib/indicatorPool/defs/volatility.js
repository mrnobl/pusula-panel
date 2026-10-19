const ti = require('technicalindicators');
const { register } = require('../registry');
const { clean, splitAndPad, pluck } = require('../contract');
const { sourceSeries, SOURCE_PARAM } = require('./moving');

/** Volatilite, bantlar ve trend gücü. */

register({
  key: 'atr',
  label: 'ATR',
  group: 'volatilite',
  kind: 'series',
  outputs: ['value', 'pct'],
  params: { period: { type: 'number', default: 14, min: 1 } },
  warmup: (p) => p.period + 1,
  note: '`pct` = ATR / kapanış × 100. Fiyat büyüklüğünden bağımsız karşılaştırma için; ham `value` asla yuvarlanmaz.',
  compute: (candles, p) => {
    let res = [];
    try {
      res = ti.ATR.calculate({
        period: p.period,
        high: pluck(candles, 'high'),
        low: pluck(candles, 'low'),
        close: pluck(candles, 'close')
      });
    } catch (e) { res = []; }

    const value = clean(res, candles.length);
    // ATR yüzdesi burada üretilir ki her strateji aynı bölmeyi tekrar yazmasın.
    const pct = value.map((v, i) => {
      const close = candles[i] ? candles[i].close : null;
      return (Number.isFinite(v) && Number.isFinite(close) && close > 0) ? (v / close) * 100 : null;
    });
    return { value, pct };
  }
});

/**
 * ADX — eski katmanda hizasız dönüyordu (200 mum için 173 değer). Burada
 * dolgulanarak sözleşmeye uydurulur; havuzu yazmanın ilk somut sebebi buydu.
 */
register({
  key: 'adx',
  label: 'ADX',
  group: 'volatilite',
  kind: 'series',
  outputs: ['adx', 'pdi', 'mdi'],
  params: { period: { type: 'number', default: 14, min: 2 } },
  warmup: (p) => p.period * 2,
  note: 'Eski `calculateADX` hizasız dönüyordu; burada mum sayısına dolgulanır.',
  compute: (candles, p) => {
    let res = [];
    try {
      res = ti.ADX.calculate({
        period: p.period,
        high: pluck(candles, 'high'),
        low: pluck(candles, 'low'),
        close: pluck(candles, 'close')
      });
    } catch (e) { res = []; }
    const split = splitAndPad(res, ['adx', 'pdi', 'mdi'], candles.length);
    return { adx: split.adx, pdi: split.pdi, mdi: split.mdi };
  }
});

/**
 * Bollinger Bantları.
 *
 * Kütüphane `middle/upper/lower/pb` verir ama BANT GENİŞLİĞİ vermez —
 * sıkışma (squeeze) tespitinde asıl kullanılan odur, burada eklenir.
 * `bandwidth` = (üst − alt) / orta × 100.
 */
register({
  key: 'bollinger',
  label: 'Bollinger Bantları',
  group: 'volatilite',
  kind: 'series',
  outputs: ['middle', 'upper', 'lower', 'bandwidth', 'percentB'],
  params: {
    period: { type: 'number', default: 20, min: 2 },
    stdDev: { type: 'number', default: 2, min: 0.1 },
    source: SOURCE_PARAM
  },
  warmup: (p) => p.period,
  note: '`bandwidth` kütüphanede yok, burada hesaplanır: sıkışma/genişleme rejimi bununla ölçülür.',
  compute: (candles, p) => {
    const v = sourceSeries(candles, p.source);
    let res = [];
    try {
      res = ti.BollingerBands.calculate({ period: p.period, stdDev: p.stdDev, values: v });
    } catch (e) { res = []; }

    const split = splitAndPad(res, ['middle', 'upper', 'lower', 'pb'], candles.length);
    const bandwidth = split.middle.map((m, i) => {
      const u = split.upper[i];
      const l = split.lower[i];
      return (Number.isFinite(m) && m !== 0 && Number.isFinite(u) && Number.isFinite(l))
        ? ((u - l) / m) * 100
        : null;
    });

    return {
      middle: split.middle,
      upper: split.upper,
      lower: split.lower,
      bandwidth,
      percentB: split.pb
    };
  }
});

register({
  key: 'keltner',
  label: 'Keltner Kanalı',
  group: 'volatilite',
  kind: 'series',
  outputs: ['middle', 'upper', 'lower'],
  params: {
    period: { type: 'number', default: 20, min: 2 },
    atrPeriod: { type: 'number', default: 10, min: 1 },
    multiplier: { type: 'number', default: 2, min: 0.1 }
  },
  warmup: (p) => Math.max(p.period, p.atrPeriod) + 1,
  compute: (candles, p) => {
    let res = [];
    try {
      res = ti.KeltnerChannels.calculate({
        maPeriod: p.period,
        atrPeriod: p.atrPeriod,
        multiplier: p.multiplier,
        useSMA: false,
        high: pluck(candles, 'high'),
        low: pluck(candles, 'low'),
        close: pluck(candles, 'close')
      });
    } catch (e) { res = []; }
    const split = splitAndPad(res, ['middle', 'upper', 'lower'], candles.length);
    return { middle: split.middle, upper: split.upper, lower: split.lower };
  }
});

/**
 * Donchian kanalı — kütüphanede yok, elle yazıldı.
 * Kırılım mantığının temeli: son N barın en yüksek/en düşüğü.
 */
register({
  key: 'donchian',
  label: 'Donchian Kanalı',
  group: 'volatilite',
  kind: 'series',
  outputs: ['upper', 'lower', 'middle'],
  params: {
    period: { type: 'number', default: 20, min: 2 },
    excludeCurrent: { type: 'boolean', default: true }
  },
  warmup: (p) => p.period,
  note: '`excludeCurrent` açıkken mevcut bar hariç tutulur — kırılım testinde barın kendisi kanala dahil edilirse kırılım asla tespit edilemez.',
  compute: (candles, p) => {
    const period = Math.max(2, Math.floor(p.period));
    const highs = pluck(candles, 'high');
    const lows = pluck(candles, 'low');
    const shift = p.excludeCurrent ? 1 : 0;

    const upper = [];
    const lower = [];
    const middle = [];

    for (let i = 0; i < candles.length; i++) {
      const end = i - shift;
      const start = end - period + 1;
      if (start < 0) { upper.push(null); lower.push(null); middle.push(null); continue; }

      let hi = -Infinity;
      let lo = Infinity;
      for (let j = start; j <= end; j++) {
        if (highs[j] > hi) hi = highs[j];
        if (lows[j] < lo) lo = lows[j];
      }
      upper.push(hi);
      lower.push(lo);
      middle.push((hi + lo) / 2);
    }

    const n = candles.length;
    return { upper: clean(upper, n), lower: clean(lower, n), middle: clean(middle, n) };
  }
});

/**
 * Piyasa rejimi — eski `detectMarketRegime`'in havuz karşılığı.
 * Farkı: ATR ham kalır (eskisi `toFixed(2)` ile düşük fiyatlı varlıklarda
 * 0'a düşürüyordu) ve çıktı seri olarak, her bar için üretilir.
 */
register({
  key: 'market_regime',
  label: 'Piyasa Rejimi',
  group: 'volatilite',
  kind: 'series',
  outputs: ['regime', 'adx', 'atrPct', 'volatilityRatio'],
  params: {
    adxPeriod: { type: 'number', default: 14, min: 2 },
    atrPeriod: { type: 'number', default: 14, min: 1 },
    trendAdx: { type: 'number', default: 25 },
    highVolRatio: { type: 'number', default: 2.2 }
  },
  warmup: (p) => Math.max(p.adxPeriod * 2, p.atrPeriod + 10),
  note: 'ATR yuvarlanmaz. Eski sürüm 2 basamağa yuvarlayıp DOGE gibi düşük fiyatlı varlıklarda 0 üretiyordu.',
  compute: (candles, p) => {
    const n = candles.length;
    let atrRaw = [];
    let adxRaw = [];
    try {
      atrRaw = ti.ATR.calculate({ period: p.atrPeriod, high: pluck(candles, 'high'), low: pluck(candles, 'low'), close: pluck(candles, 'close') });
      adxRaw = ti.ADX.calculate({ period: p.adxPeriod, high: pluck(candles, 'high'), low: pluck(candles, 'low'), close: pluck(candles, 'close') });
    } catch (e) { /* boş seriyle devam */ }

    const atr = clean(atrRaw, n);
    const adx = splitAndPad(adxRaw, ['adx'], n).adx;

    const atrPct = [];
    const volRatio = [];
    const regime = [];

    for (let i = 0; i < n; i++) {
      const a = atr[i];
      const close = candles[i].close;
      atrPct.push((Number.isFinite(a) && close > 0) ? (a / close) * 100 : null);

      // Son 10 ATR ortalamasına göre volatilite oranı
      let ratio = null;
      if (Number.isFinite(a) && i >= 9) {
        let sum = 0;
        let cnt = 0;
        for (let j = i - 9; j <= i; j++) {
          if (Number.isFinite(atr[j])) { sum += atr[j]; cnt++; }
        }
        const avg = cnt > 0 ? sum / cnt : 0;
        ratio = avg > 0 ? a / avg : null;
      }
      volRatio.push(ratio);

      // Rejim sayısal kodlanır: seriler sayı taşır (sözleşme gereği).
      // 0 = YATAY, 1 = TRENDLİ, 2 = YÜKSEK VOLATİLİTE
      let kod = null;
      if (Number.isFinite(adx[i])) {
        kod = 0;
        if (Number.isFinite(ratio) && ratio > p.highVolRatio) kod = 2;
        else if (adx[i] > p.trendAdx) kod = 1;
      }
      regime.push(kod);
    }

    return { regime: clean(regime, n), adx, atrPct: clean(atrPct, n), volatilityRatio: clean(volRatio, n) };
  }
});

/** Rejim kodlarının okunabilir karşılığı; panel ve loglar için. */
const REGIME_LABELS = { 0: 'YATAY', 1: 'TRENDLİ', 2: 'YÜKSEK VOLATİLİTE' };

module.exports = { REGIME_LABELS };
