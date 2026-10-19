const { register } = require('../registry');
const { clean } = require('../contract');

/**
 * Konsolidasyon (range) tespiti.
 *
 * Bir "range yapısı", fiyatın belirli bir bant içinde sıkıştığı bar dizisidir.
 * Hacim profilinin aralık kaynaklarından biri budur ve kırılım stratejilerinin
 * de referansıdır: kutu belli olmadan kırılım tanımlanamaz.
 *
 * Genişlik eşiği ATR cinsinden — sabit yüzde kullanmak farklı fiyat
 * seviyelerindeki varlıklarda farklı davranırdı.
 *
 * İLERİYE BAKMA: bir kutu ancak KAPANDIĞINDA (fiyat dışına çıktığında) tam
 * olarak bilinir. Türetilmiş seriler, o bara kadar kapanmış kutulara ve
 * hâlâ süren kutunun O BARA KADARKİ sınırlarına bakar.
 */

register({
  key: 'ranges',
  label: 'Konsolidasyon Kutuları',
  group: 'yapi',
  kind: 'zones',
  outputs: ['boxes', 'inRange', 'rangeHigh', 'rangeLow', 'rangeBars'],
  seriesOutputs: ['inRange', 'rangeHigh', 'rangeLow', 'rangeBars'],
  // Kutu dışındayken bu seriler boştur — koşullu boşluk, ısınma eksikliği değil.
  sparseOutputs: ['rangeHigh', 'rangeLow', 'rangeBars'],
  dependsOn: ['atr'],
  params: {
    atrPeriod: { type: 'number', default: 14, min: 1 },
    // Kutu genişliği bu kadar ATR'yi aşmamalı.
    widthAtr: { type: 'number', default: 2.5, min: 0.2 },
    minBars: { type: 'number', default: 10, min: 3 }
  },
  warmup: (p) => p.atrPeriod + p.minBars,
  note: '`rangeHigh/Low` süren kutunun O BARA KADARKİ sınırlarıdır — kutunun nihai sınırları değil. `boxes` kapanmış ve süren tüm kutuları taşır.',
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const atr = ctx.computeOne('atr', { period: p.atrPeriod }).value;

    const boxes = [];
    const inRange = new Array(n).fill(null);
    const rangeHigh = new Array(n).fill(null);
    const rangeLow = new Array(n).fill(null);
    const rangeBars = new Array(n).fill(null);

    let bas = null;
    let yuksek = null;
    let dusuk = null;

    const kutuyuKapat = (bitis) => {
      if (bas === null) return;
      const barSayisi = bitis - bas + 1;
      if (barSayisi >= p.minBars) {
        boxes.push({
          startIndex: bas,
          endIndex: bitis,
          startTime: candles[bas].time,
          endTime: candles[bitis].time,
          high: yuksek,
          low: dusuk,
          bars: barSayisi,
          width: yuksek - dusuk,
          open: true
        });
      }
      bas = null; yuksek = null; dusuk = null;
    };

    for (let i = 0; i < n; i++) {
      const a = atr[i];
      const c = candles[i];
      if (!Number.isFinite(a) || a <= 0) continue;

      const esik = a * p.widthAtr;

      if (bas === null) {
        bas = i; yuksek = c.high; dusuk = c.low;
      } else {
        const yeniY = Math.max(yuksek, c.high);
        const yeniD = Math.min(dusuk, c.low);
        if ((yeniY - yeniD) <= esik) {
          yuksek = yeniY; dusuk = yeniD;
        } else {
          // Bant aşıldı: kutu bir önceki barda kapandı, yenisi burada başlar.
          kutuyuKapat(i - 1);
          bas = i; yuksek = c.high; dusuk = c.low;
        }
      }

      const barSayisi = i - bas + 1;
      const gecerli = barSayisi >= p.minBars;
      inRange[i] = gecerli ? 1 : 0;
      // Süren kutunun O ANA KADARKİ sınırları; nihai sınırlar değil.
      rangeHigh[i] = gecerli ? yuksek : null;
      rangeLow[i] = gecerli ? dusuk : null;
      rangeBars[i] = gecerli ? barSayisi : null;
    }

    kutuyuKapat(n - 1);
    // Son kutu hariç hepsi kapanmıştır.
    boxes.forEach((b, idx) => { b.open = (idx === boxes.length - 1) && b.endIndex === n - 1; });

    return {
      boxes,
      inRange: clean(inRange, n),
      rangeHigh: clean(rangeHigh, n),
      rangeLow: clean(rangeLow, n),
      rangeBars: clean(rangeBars, n)
    };
  }
});
