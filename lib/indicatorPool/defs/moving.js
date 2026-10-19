const ti = require('technicalindicators');
const { register } = require('../registry');
const { clean, splitAndPad, pluck } = require('../contract');

/**
 * Hareketli ortalamalar ve türevleri.
 *
 * Hepsi `technicalindicators` çıktısını hizalayarak sarar — kütüphane ısınma
 * dönemini atlayıp kısa dizi döner, havuz sözleşmesi ise mum sayısıyla birebir
 * uzunluk ister.
 */

/** Kaynak seri seçimi; ICT/hacim göstergeleri de aynı adlandırmayı kullanacak. */
function sourceSeries(candles, source = 'close') {
  switch (source) {
    case 'open': return pluck(candles, 'open');
    case 'high': return pluck(candles, 'high');
    case 'low': return pluck(candles, 'low');
    case 'hl2': return candles.map(c => (c.high + c.low) / 2);
    case 'hlc3': return candles.map(c => (c.high + c.low + c.close) / 3);
    case 'ohlc4': return candles.map(c => (c.open + c.high + c.low + c.close) / 4);
    case 'close':
    default: return pluck(candles, 'close');
  }
}

const SOURCE_PARAM = {
  type: 'enum',
  values: ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'],
  default: 'close'
};

/**
 * Basit sarmalayıcı üreticisi: tek seri döndüren göstergeler için.
 *
 * `warmup` geçilebilir olmalı — zincirlenmiş göstergelerde ısınma periyodun
 * katıdır. DEMA (EMA'nın EMA'sı) 2× periyot ister; tek tip `period` bildirimi
 * sözleşme testinden geçmedi.
 */
function simpleMa(key, label, calc, extraParams = {}, warmupFn = null) {
  register({
    key,
    label,
    group: 'hareketli-ortalama',
    kind: 'series',
    outputs: ['value'],
    params: { period: { type: 'number', default: 20, min: 1 }, source: SOURCE_PARAM, ...extraParams },
    warmup: warmupFn || ((p) => p.period),
    compute: (candles, p) => {
      const values = sourceSeries(candles, p.source);
      let res = [];
      try {
        res = calc(values, p, candles);
      } catch (e) {
        res = [];
      }
      return { value: clean(res, candles.length) };
    }
  });
}

simpleMa('ema', 'EMA', (v, p) => ti.EMA.calculate({ period: p.period, values: v }));
simpleMa('sma', 'SMA', (v, p) => ti.SMA.calculate({ period: p.period, values: v }));
simpleMa('wma', 'WMA', (v, p) => ti.WMA.calculate({ period: p.period, values: v }));
simpleMa('wema', 'WEMA', (v, p) => ti.WEMA.calculate({ period: p.period, values: v }));

// HMA: kütüphanede yok, WMA'lardan türetilir (Hull formülü).
simpleMa('hma', 'Hull MA', (v, p) => {
  const half = Math.max(1, Math.round(p.period / 2));
  const sqrt = Math.max(1, Math.round(Math.sqrt(p.period)));
  const wmaHalf = ti.WMA.calculate({ period: half, values: v });
  const wmaFull = ti.WMA.calculate({ period: p.period, values: v });
  // İki seri farklı uzunlukta biter; sondan hizalanır.
  const n = Math.min(wmaHalf.length, wmaFull.length);
  const raw = [];
  for (let i = 0; i < n; i++) {
    raw.push(2 * wmaHalf[wmaHalf.length - n + i] - wmaFull[wmaFull.length - n + i]);
  }
  return ti.WMA.calculate({ period: sqrt, values: raw });
}, {}, (p) => p.period + Math.round(Math.sqrt(p.period)));

// DEMA ısınması 2× periyot: ikinci EMA, birincinin çıktısı üzerinde çalışır.
simpleMa('dema', 'DEMA', (v, p) => {
  const e1 = ti.EMA.calculate({ period: p.period, values: v });
  const e2 = ti.EMA.calculate({ period: p.period, values: e1 });
  const n = Math.min(e1.length, e2.length);
  const out = [];
  for (let i = 0; i < n; i++) out.push(2 * e1[e1.length - n + i] - e2[e2.length - n + i]);
  return out;
}, {}, (p) => p.period * 2);

// HMA'nın son yumuşatması sqrt(periyot) kadar ek bar ister.


simpleMa('vwma', 'Hacim Ağırlıklı MA', (v, p, candles) => {
  const vol = pluck(candles, 'volume');
  const out = [];
  for (let i = p.period - 1; i < v.length; i++) {
    let pv = 0;
    let sv = 0;
    for (let j = i - p.period + 1; j <= i; j++) {
      const w = Number.isFinite(vol[j]) ? vol[j] : 0;
      pv += v[j] * w;
      sv += w;
    }
    out.push(sv > 0 ? pv / sv : v[i]);
  }
  return out;
});

/**
 * ALMA (Arnaud Legoux MA). Kütüphanede yok; TSS stratejisi buna bağlı olduğu
 * için birebir aynı formülle taşındı.
 */
register({
  key: 'alma',
  label: 'ALMA',
  group: 'hareketli-ortalama',
  kind: 'series',
  outputs: ['value'],
  params: {
    period: { type: 'number', default: 9, min: 2 },
    offset: { type: 'number', default: 0.85, min: 0, max: 1 },
    sigma: { type: 'number', default: 6, min: 0.1 },
    source: SOURCE_PARAM
  },
  warmup: (p) => p.period,
  compute: (candles, p) => {
    const v = sourceSeries(candles, p.source);
    const period = Math.max(2, Math.floor(p.period));
    const m = p.offset * (period - 1);
    const s = period / p.sigma;
    const out = [];

    for (let i = period - 1; i < v.length; i++) {
      let norm = 0;
      let sum = 0;
      for (let j = 0; j < period; j++) {
        const w = Math.exp(-((j - m) * (j - m)) / (2 * s * s));
        norm += w;
        sum += v[i - (period - 1) + j] * w;
      }
      out.push(norm > 0 ? sum / norm : v[i]);
    }
    return { value: clean(out, candles.length) };
  }
});

/**
 * T3 (Tillson). Altı kademeli EMA yumuşatması.
 */
register({
  key: 't3',
  label: 'T3 (Tillson)',
  group: 'hareketli-ortalama',
  kind: 'series',
  outputs: ['value'],
  params: {
    period: { type: 'number', default: 5, min: 1 },
    volumeFactor: { type: 'number', default: 0.7, min: 0, max: 1 },
    source: SOURCE_PARAM
  },
  warmup: (p) => p.period * 6,
  compute: (candles, p) => {
    const v = sourceSeries(candles, p.source);
    const ema = (arr, period) => ti.EMA.calculate({ period, values: arr });
    try {
      const e1 = ema(v, p.period);
      const e2 = ema(e1, p.period);
      const e3 = ema(e2, p.period);
      const e4 = ema(e3, p.period);
      const e5 = ema(e4, p.period);
      const e6 = ema(e5, p.period);

      const a = p.volumeFactor;
      const c1 = -a * a * a;
      const c2 = 3 * a * a + 3 * a * a * a;
      const c3 = -6 * a * a - 3 * a - 3 * a * a * a;
      const c4 = 1 + 3 * a + a * a * a + 3 * a * a;

      const n = e6.length;
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push(
          c1 * e6[i] +
          c2 * e5[e5.length - n + i] +
          c3 * e4[e4.length - n + i] +
          c4 * e3[e3.length - n + i]
        );
      }
      return { value: clean(out, candles.length) };
    } catch (e) {
      return { value: clean([], candles.length) };
    }
  }
});

/**
 * Kümülatif VWAP — dizinin başından itibaren, oturum sıfırlaması YOK.
 * Dönemsel (günlük/haftalık/…) VWAP ayrı bir gösterge olarak `volume`
 * grubunda gelecek; bu, eski `calculateVWAP` davranışının karşılığıdır.
 */
register({
  key: 'vwap_cumulative',
  label: 'Kümülatif VWAP',
  group: 'hacim',
  kind: 'series',
  outputs: ['value'],
  // `value` çift anlamlı bir ad (rsi.value osilatör, bu fiyat) ve grup
  // varsayılanı 'hacim' → osilatör paneli. Açıkça bildirilmeli.
  render: { value: { pane: 'price' } },
  params: {},
  warmup: 0,
  note: 'Dizinin başından kümülatif; dönem sıfırlaması yok. Oturum bazlı için vwap_period kullanın.',
  compute: (candles) => {
    let pv = 0;
    let vol = 0;
    const out = candles.map(c => {
      const typical = (c.high + c.low + c.close) / 3;
      const v = Number.isFinite(c.volume) ? c.volume : 0;
      pv += typical * v;
      vol += v;
      return vol > 0 ? pv / vol : typical;
    });
    return { value: clean(out, candles.length) };
  }
});

/** Heikin Ashi mumları — ayrı bir seri seti olarak. */
register({
  key: 'heikin_ashi',
  label: 'Heikin Ashi',
  group: 'fiyat',
  kind: 'series',
  outputs: ['haOpen', 'haHigh', 'haLow', 'haClose'],
  params: {},
  warmup: 1,
  compute: (candles) => {
    const haOpen = [];
    const haClose = [];
    const haHigh = [];
    const haLow = [];

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const close = (c.open + c.high + c.low + c.close) / 4;
      const open = i === 0 ? (c.open + c.close) / 2 : (haOpen[i - 1] + haClose[i - 1]) / 2;
      haClose.push(close);
      haOpen.push(open);
      haHigh.push(Math.max(c.high, open, close));
      haLow.push(Math.min(c.low, open, close));
    }

    const n = candles.length;
    return {
      haOpen: clean(haOpen, n),
      haHigh: clean(haHigh, n),
      haLow: clean(haLow, n),
      haClose: clean(haClose, n)
    };
  }
});

module.exports = { sourceSeries, SOURCE_PARAM, splitAndPad };
