const { register } = require('../registry');
const { clean } = require('../contract');

/**
 * VWAP ailesi.
 *
 * Eski `calculateVWAP` dizinin başından kümülatifti — oturum sıfırlaması yoktu,
 * dolayısıyla "günlük VWAP" diye kullanılamıyordu. Buradaki üç gösterge o
 * boşluğu doldurur:
 *
 *   vwap_period    → gün/hafta/ay/çeyrek/yıl sınırlarında sıfırlanır (UTC)
 *   vwap_anchored  → belirli bir olaya çapalanır (tarih, swing, hacim zirvesi)
 *   (kümülatif olan `vwap_cumulative` adıyla moving.js'te kaldı)
 *
 * σ BANTLARI: VWAP tek başına bir çizgidir; bant onu işlem kuralına çevirir.
 * Sapma HACİM AĞIRLIKLI hesaplanır — basit standart sapma, VWAP'ın tanımıyla
 * tutarsız olurdu:
 *
 *   σ² = Σ(v·tp²)/Σv − VWAP²
 */

/** UTC dönem kimliği. Kripto 7/24 olduğu için borsa günü UTC 00:00 kabul edilir. */
function periodKey(time, anchor) {
  const d = new Date(time);
  const y = d.getUTCFullYear();

  switch (anchor) {
    case 'weekly': {
      // ISO hafta: pazartesi başlangıç.
      const gun = (d.getUTCDay() + 6) % 7;
      const pazartesi = Date.UTC(y, d.getUTCMonth(), d.getUTCDate() - gun);
      return `w:${pazartesi}`;
    }
    case 'monthly': return `m:${y}-${d.getUTCMonth()}`;
    case 'quarterly': return `q:${y}-${Math.floor(d.getUTCMonth() / 3)}`;
    case 'yearly': return `y:${y}`;
    case 'daily':
    default: return `d:${y}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  }
}

/** Tipik fiyat — VWAP'ın standart girdisi. */
const typicalPrice = (c) => (c.high + c.low + c.close) / 3;

register({
  key: 'vwap_period',
  label: 'Dönemsel VWAP',
  group: 'hacim',
  kind: 'series',
  outputs: ['vwap', 'upper1', 'lower1', 'upper2', 'lower2', 'upper3', 'lower3', 'prevClose', 'periodIndex'],
  params: {
    anchor: { type: 'enum', values: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'], default: 'daily' },
    band1: { type: 'number', default: 1, min: 0 },
    band2: { type: 'number', default: 2, min: 0 },
    band3: { type: 'number', default: 3, min: 0 }
  },
  warmup: 0,
  note: 'Dönem sınırları UTC. `prevClose` bir önceki dönemin KAPANIŞ VWAP değeridir ve yatay referans olarak taşınır. `periodIndex` dönem içindeki bar sırasıdır (0 = dönemin ilk barı).',
  compute: (candles, p) => {
    const n = candles.length;
    const vwap = new Array(n).fill(null);
    const prevClose = new Array(n).fill(null);
    const periodIndex = new Array(n).fill(null);
    const bandSeries = {
      upper1: new Array(n).fill(null), lower1: new Array(n).fill(null),
      upper2: new Array(n).fill(null), lower2: new Array(n).fill(null),
      upper3: new Array(n).fill(null), lower3: new Array(n).fill(null)
    };

    // Dönem kapanışları: her dönem bittiğinde son VWAP değeri kaydedilir.
    const closes = [];

    let aktifKey = null;
    let sumPV = 0;
    let sumV = 0;
    let sumPPV = 0;   // Σ v·tp²  → hacim ağırlıklı varyans için
    let barSira = 0;
    let oncekiKapanis = null;
    let donemBasi = null;

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const key = Number.isFinite(c.time) ? periodKey(c.time, p.anchor) : aktifKey;

      if (key !== aktifKey) {
        // Önceki dönem kapandı: son VWAP değerini kaydet.
        if (aktifKey !== null && sumV > 0) {
          const kapanisVwap = sumPV / sumV;
          closes.push({
            period: aktifKey,
            startTime: donemBasi,
            endTime: candles[i - 1] ? candles[i - 1].time : null,
            endIndex: i - 1,
            vwap: kapanisVwap
          });
          oncekiKapanis = kapanisVwap;
        }
        aktifKey = key;
        sumPV = 0; sumV = 0; sumPPV = 0; barSira = 0;
        donemBasi = c.time;
      }

      const tp = typicalPrice(c);
      const v = Number.isFinite(c.volume) ? c.volume : 0;

      // Hacimsiz bar (bazı borsalarda olur) VWAP'ı bozmasın: fiyat katkısı
      // ağırlıksız kalır, önceki değer korunur.
      sumPV += tp * v;
      sumV += v;
      sumPPV += tp * tp * v;

      if (sumV > 0) {
        const w = sumPV / sumV;
        vwap[i] = w;

        // Hacim ağırlıklı varyans; yuvarlama hatasından negatife düşebilir.
        const varyans = Math.max(0, (sumPPV / sumV) - (w * w));
        const sigma = Math.sqrt(varyans);

        bandSeries.upper1[i] = w + p.band1 * sigma;
        bandSeries.lower1[i] = w - p.band1 * sigma;
        bandSeries.upper2[i] = w + p.band2 * sigma;
        bandSeries.lower2[i] = w - p.band2 * sigma;
        bandSeries.upper3[i] = w + p.band3 * sigma;
        bandSeries.lower3[i] = w - p.band3 * sigma;
      }

      prevClose[i] = oncekiKapanis;
      periodIndex[i] = barSira;
      barSira++;
    }

    return {
      vwap: clean(vwap, n),
      upper1: clean(bandSeries.upper1, n),
      lower1: clean(bandSeries.lower1, n),
      upper2: clean(bandSeries.upper2, n),
      lower2: clean(bandSeries.lower2, n),
      upper3: clean(bandSeries.upper3, n),
      lower3: clean(bandSeries.lower3, n),
      prevClose: clean(prevClose, n),
      periodIndex: clean(periodIndex, n),
      // Sözleşme gereği seri olmayan ek bilgi `_extra` altında taşınır.
      _extra: { closes, anchor: p.anchor }
    };
  }
});

/**
 * Çapalı VWAP.
 *
 * Çapa modları:
 *   timestamp      → verilen zamandan itibaren (`anchorTime`)
 *   barsAgo        → son N bar önce (`barsAgo`)
 *   swingHigh/Low  → son ONAYLANMIŞ salınım noktasından itibaren
 *   highestVolume  → penceredeki en yüksek hacimli bardan itibaren
 *
 * Salınım çapalarında İLERİYE BAKMA riski var: zirve `index` barında oluşur
 * ama `confirmedAt` barında bilinir. Çapa yalnızca onay barından itibaren
 * geçerli sayılır — seri o bara kadar `null` kalır. Aksi halde geçmişe dönük
 * "mükemmel çapa" seçilmiş olur ve backtest iyimser çıkar.
 */
register({
  key: 'vwap_anchored',
  label: 'Çapalı VWAP',
  group: 'hacim',
  kind: 'series',
  outputs: ['vwap', 'upper1', 'lower1', 'upper2', 'lower2', 'anchorIndex'],
  params: {
    mode: { type: 'enum', values: ['swingLow', 'swingHigh', 'highestVolume', 'barsAgo', 'timestamp'], default: 'swingLow' },
    anchorTime: { type: 'number', default: 0 },
    barsAgo: { type: 'number', default: 100, min: 1 },
    volumeLookback: { type: 'number', default: 200, min: 5 },
    band1: { type: 'number', default: 1, min: 0 },
    band2: { type: 'number', default: 2, min: 0 },
    swingMethod: { type: 'enum', values: ['atr', 'pivot'], default: 'atr' },
    swingAtrMultiple: { type: 'number', default: 2.0, min: 0.1 },
    swingLookback: { type: 'number', default: 5, min: 1 }
  },
  warmup: (p) => (p.mode === 'swingLow' || p.mode === 'swingHigh' ? 40 : 0),
  dependsOn: ['swings'],
  note: 'Salınım çapalarında seri, salınımın ONAY barından itibaren dolar — oluşma barından değil.',
  compute: (candles, p, ctx) => {
    const n = candles.length;

    /**
     * Her bar için o barda GEÇERLİ olan çapa indeksi.
     * `null` = henüz çapa yok.
     */
    const anchorAt = new Array(n).fill(null);

    if (p.mode === 'timestamp') {
      const hedef = Number(p.anchorTime) || 0;
      let idx = candles.findIndex(c => Number(c.time) >= hedef);
      if (idx < 0) idx = null;
      for (let i = 0; i < n; i++) anchorAt[i] = (idx !== null && i >= idx) ? idx : null;

    } else if (p.mode === 'barsAgo') {
      const geri = Math.max(1, Math.floor(p.barsAgo));
      for (let i = 0; i < n; i++) anchorAt[i] = Math.max(0, i - geri);

    } else if (p.mode === 'highestVolume') {
      const pencere = Math.max(5, Math.floor(p.volumeLookback));
      for (let i = 0; i < n; i++) {
        const bas = Math.max(0, i - pencere + 1);
        let enIyi = bas;
        for (let j = bas; j <= i; j++) {
          if ((candles[j].volume || 0) > (candles[enIyi].volume || 0)) enIyi = j;
        }
        anchorAt[i] = enIyi;
      }

    } else {
      // Salınım çapası — onay barına saygı gösterilir.
      const tip = p.mode === 'swingHigh' ? 'high' : 'low';
      const sw = ctx.computeOne('swings', {
        method: p.swingMethod,
        atrMultiple: p.swingAtrMultiple,
        lookback: p.swingLookback
      });
      const noktalar = sw.points
        .filter(x => x.type === tip)
        .sort((a, b) => a.confirmedAt - b.confirmedAt);

      let k = 0;
      let aktif = null;
      for (let i = 0; i < n; i++) {
        while (k < noktalar.length && noktalar[k].confirmedAt <= i) { aktif = noktalar[k]; k++; }
        anchorAt[i] = aktif ? aktif.index : null;
      }
    }

    // VWAP'ı çapadan itibaren biriktir; çapa değişince sıfırlanıp yeniden kurulur.
    const vwap = new Array(n).fill(null);
    const upper1 = new Array(n).fill(null);
    const lower1 = new Array(n).fill(null);
    const upper2 = new Array(n).fill(null);
    const lower2 = new Array(n).fill(null);

    let mevcutCapa = null;
    let sumPV = 0;
    let sumV = 0;
    let sumPPV = 0;

    for (let i = 0; i < n; i++) {
      const capa = anchorAt[i];
      if (capa === null) continue;

      if (capa !== mevcutCapa) {
        // Çapa değişti: birikimler çapadan bu bara kadar yeniden kurulur.
        mevcutCapa = capa;
        sumPV = 0; sumV = 0; sumPPV = 0;
        for (let j = capa; j <= i; j++) {
          const tp = typicalPrice(candles[j]);
          const v = Number.isFinite(candles[j].volume) ? candles[j].volume : 0;
          sumPV += tp * v; sumV += v; sumPPV += tp * tp * v;
        }
      } else {
        const tp = typicalPrice(candles[i]);
        const v = Number.isFinite(candles[i].volume) ? candles[i].volume : 0;
        sumPV += tp * v; sumV += v; sumPPV += tp * tp * v;
      }

      if (sumV > 0) {
        const w = sumPV / sumV;
        const sigma = Math.sqrt(Math.max(0, (sumPPV / sumV) - w * w));
        vwap[i] = w;
        upper1[i] = w + p.band1 * sigma;
        lower1[i] = w - p.band1 * sigma;
        upper2[i] = w + p.band2 * sigma;
        lower2[i] = w - p.band2 * sigma;
      }
    }

    return {
      vwap: clean(vwap, n),
      upper1: clean(upper1, n),
      lower1: clean(lower1, n),
      upper2: clean(upper2, n),
      lower2: clean(lower2, n),
      anchorIndex: clean(anchorAt, n)
    };
  }
});

module.exports = { periodKey, typicalPrice };
