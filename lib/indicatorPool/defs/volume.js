const ti = require('technicalindicators');
const { register } = require('../registry');
const { clean, pluck } = require('../contract');

/**
 * Hacim göstergeleri: RVOL, MFI, OBV, CMF.
 *
 * Hacim bu havuzda zaten iki yerde kullanılıyordu (`vwma`, `volume_profile`)
 * ama "bu bardaki hacim normal mi" sorusunu yanıtlayan bir gösterge yoktu —
 * `displacement`'ın hacim filtresi bunu kendi içinde, basit ortalamayla
 * yapıyordu.
 */

/** Medyan — hacim dağılımı ağır kuyrukludur, ortalama tek bir spike'la kayar. */
function medyan(list) {
  if (!list.length) return null;
  const s = list.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const ortalama = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

/** Mum süresi: ardışık zaman farklarının medyanı (tek bir boşluk yanıltmasın). */
function barSuresi(candles) {
  const farklar = [];
  for (let i = 1; i < candles.length && farklar.length < 200; i++) {
    const d = candles[i].time - candles[i - 1].time;
    if (Number.isFinite(d) && d > 0) farklar.push(d);
  }
  return medyan(farklar) || null;
}

/**
 * RVOL — Göreli Hacim.
 *
 * `timeOfDay` MODU NEDEN VAR: killzone ölçümü (CLAUDE.md) gösterdi ki BTC'de
 * 09:00–10:00 NY saatlerinin hacmi günlük ortalamanın 1.7–1.8 katı, 16:00'nın
 * ise 0.65 katı. Düz kayan ortalamayla hesaplanan RVOL bu yüzden HER GÜN aynı
 * saatlerde "olağanüstü hacim" der — ölçtüğü şey haberler değil, saattir.
 * `timeOfDay` modu tabanı aynı saat diliminin geçmiş günlerinden alır, böylece
 * "bu Salı 09:00, diğer 09:00'lara göre nasıl?" sorusu sorulur.
 */
register({
  key: 'rvol',
  label: 'Göreli Hacim (RVOL)',
  group: 'hacim',
  kind: 'series',
  outputs: ['value', 'baseline', 'zscore'],
  params: {
    mode: { type: 'enum', values: ['rolling', 'timeOfDay'], default: 'rolling' },
    // rolling: kaç bar geriye bakılır. timeOfDay: kaç geçmiş gün örneklenir.
    period: { type: 'number', default: 20, min: 2 },
    days: { type: 'number', default: 20, min: 2 },
    stat: { type: 'enum', values: ['median', 'mean'], default: 'median' },
    // timeOfDay modunda bu kadar geçmiş örnek yoksa rolling tabana düşülür.
    minSamples: { type: 'number', default: 3, min: 1 }
  },
  warmup: (p) => p.period + 1,
  note: 'Taban HER ZAMAN önceki barlardan hesaplanır, bu bar hariç — aksi hâlde gösterge kendini ölçerdi. `timeOfDay` modu saat etkisini nötrler; kripto 7/24 ama hacmi kesinlikle saate bağlı.',
  compute: (candles, p) => {
    const n = candles.length;
    const hacim = candles.map(c => (Number.isFinite(c.volume) ? c.volume : 0));
    const value = new Array(n).fill(null);
    const baseline = new Array(n).fill(null);
    const zscore = new Array(n).fill(null);

    const pencere = Math.max(2, Math.floor(p.period));
    const ozet = p.stat === 'mean' ? ortalama : medyan;

    // timeOfDay: gün içi dilim → geçmiş hacimler
    const sureMs = p.mode === 'timeOfDay' ? barSuresi(candles) : null;
    const dilimGecmisi = new Map();

    for (let i = 0; i < n; i++) {
      // Kayan taban: bu bar HARİÇ son `pencere` bar.
      const bas = Math.max(0, i - pencere);
      const kayanOrnek = hacim.slice(bas, i);

      let ornek = kayanOrnek;

      if (p.mode === 'timeOfDay' && sureMs && Number.isFinite(candles[i].time)) {
        const dilim = Math.floor((candles[i].time % 86400000) / sureMs);
        const gecmis = dilimGecmisi.get(dilim) || [];
        if (gecmis.length >= p.minSamples) {
          ornek = gecmis.slice(-Math.floor(p.days));
        }
        // Bu barın hacmi ancak KULLANILDIKTAN SONRA geçmişe eklenir.
        gecmis.push(hacim[i]);
        dilimGecmisi.set(dilim, gecmis);
      }

      if (ornek.length < 2) continue;

      const taban = ozet(ornek);
      if (!Number.isFinite(taban) || taban <= 0) continue;

      baseline[i] = taban;
      value[i] = hacim[i] / taban;

      const ort = ortalama(ornek);
      const varyans = ornek.reduce((a, v) => a + (v - ort) * (v - ort), 0) / ornek.length;
      const sapma = Math.sqrt(varyans);
      zscore[i] = sapma > 0 ? (hacim[i] - ort) / sapma : null;
    }

    return {
      value: clean(value, n),
      baseline: clean(baseline, n),
      zscore: clean(zscore, n)
    };
  }
});

register({
  key: 'mfi',
  label: 'Money Flow Index (MFI)',
  group: 'hacim',
  kind: 'series',
  outputs: ['value'],
  params: { period: { type: 'number', default: 14, min: 2 } },
  warmup: (p) => p.period + 1,
  note: 'Hacim ağırlıklı RSI: tipik fiyat yükselirken akan hacim pozitif, düşerken negatif sayılır. 80 üstü aşırı alım, 20 altı aşırı satım kabul edilir.',
  compute: (candles, p) => {
    let res = [];
    try {
      res = ti.MFI.calculate({
        high: pluck(candles, 'high'),
        low: pluck(candles, 'low'),
        close: pluck(candles, 'close'),
        volume: candles.map(c => (Number.isFinite(c.volume) ? c.volume : 0)),
        period: Math.floor(p.period)
      });
    } catch (e) { res = []; }
    return { value: clean(res, candles.length) };
  }
});

/**
 * OBV — On Balance Volume.
 *
 * DİKKAT: OBV'nin MUTLAK DEĞERİ anlamsızdır — dizinin başladığı yere göre
 * kayar. Motor her tick son N mumu geçirdiği için pencere kaydıkça aynı barın
 * OBV'si başka bir sayı olur. Yalnızca ŞEKLİ bilgi taşır.
 *
 * Ölçüldü (BTC 1h, 2000 mum vs son 1500 mum, aynı barlar karşılaştırıldı):
 *   value / signal → tamamen kayar, eşikle kıyaslanamaz
 *   slope          → 50 bar sonra fark 1e-11 (yerel pencere, kaymaz)
 *   histogram      → EMA hafızası üstel eriyor: 50 barda %8.5, 100 barda %0.7,
 *                    200 barda 4e-8. Yani yaklaşık 200 bar geçmişle güvenli.
 */
register({
  key: 'obv',
  label: 'On Balance Volume (OBV)',
  group: 'hacim',
  kind: 'series',
  outputs: ['value', 'signal', 'histogram', 'slope'],
  params: {
    signalPeriod: { type: 'number', default: 20, min: 2 },
    slopePeriod: { type: 'number', default: 10, min: 1 },
    // Eğimin normalleştiricisi YEREL olmalı: dizinin başından itibaren
    // ortalama hacim kullanılsaydı, motor pencereyi kaydırdıkça aynı barın
    // eğimi değişirdi — göstergenin kaçınmaya çalıştığı hatanın aynısı.
    volumeLookback: { type: 'number', default: 50, min: 2 }
  },
  warmup: (p) => p.signalPeriod + 1,
  note: 'Mutlak seviye dizinin başlangıcına bağlıdır, eşikle kıyaslanamaz. `slope` yereldir (50 bar sonra pencereden bağımsız), `histogram` üstel yakınsar (~200 bar geçmişle güvenli). Strateji `value`\'yu eşikle kıyaslıyorsa hata yapıyordur.',
  compute: (candles, p) => {
    const n = candles.length;
    let res = [];
    try {
      res = ti.OBV.calculate({
        close: pluck(candles, 'close'),
        volume: candles.map(c => (Number.isFinite(c.volume) ? c.volume : 0))
      });
    } catch (e) { res = []; }

    const value = clean(res, n);

    let sig = [];
    try {
      const gecerli = value.filter(v => v !== null);
      sig = ti.EMA.calculate({ period: Math.floor(p.signalPeriod), values: gecerli });
    } catch (e) { sig = []; }
    const signal = clean(sig, n);

    const histogram = new Array(n).fill(null);
    const slope = new Array(n).fill(null);
    const sp = Math.max(1, Math.floor(p.slopePeriod));

    // Eğim yerel ortalama hacme bölünür: "bar başına kaç bar-hacmi birikim".
    const vl = Math.max(2, Math.floor(p.volumeLookback));
    let hacimToplam = 0;
    for (let i = 0; i < n; i++) {
      hacimToplam += Number.isFinite(candles[i].volume) ? candles[i].volume : 0;
      if (i >= vl) hacimToplam -= Number.isFinite(candles[i - vl].volume) ? candles[i - vl].volume : 0;
      const ortHacim = hacimToplam / Math.min(i + 1, vl);

      if (value[i] !== null && signal[i] !== null) histogram[i] = value[i] - signal[i];
      if (i >= sp && value[i] !== null && value[i - sp] !== null && ortHacim > 0) {
        slope[i] = (value[i] - value[i - sp]) / sp / ortHacim;
      }
    }

    return {
      value,
      signal,
      histogram: clean(histogram, n),
      slope: clean(slope, n)
    };
  }
});

/**
 * CMF — Chaikin Money Flow.
 *
 * Kütüphanede yok, elle yazıldı. Mum içi konum ağırlığı:
 *   çarpan = ((kapanış − düşük) − (yüksek − kapanış)) / (yüksek − düşük)
 * Kapanış barın tepesindeyse +1, dibindeyse −1. CMF bu çarpanla ağırlıklı
 * hacmin, toplam hacme oranıdır — −1 ile +1 arasında.
 *
 * MFI ile farkı: MFI tipik fiyatın BİR ÖNCEKİ bara göre yönüne bakar (barlar
 * arası), CMF barın KENDİ İÇİNDEKİ kapanış konumuna (bar içi). İkisi aynı şeyi
 * ölçmez ve sık sık ters yönde işaret verirler.
 */
register({
  key: 'cmf',
  label: 'Chaikin Money Flow (CMF)',
  group: 'hacim',
  kind: 'series',
  outputs: ['value', 'moneyFlowVolume'],
  params: { period: { type: 'number', default: 20, min: 2 } },
  warmup: (p) => p.period,
  note: 'Doji ve fitilsiz barlarda (yüksek = düşük) çarpan 0 alınır — sıfıra bölme yerine "bilgi yok" doğru cevap.',
  compute: (candles, p) => {
    const n = candles.length;
    const pencere = Math.max(2, Math.floor(p.period));

    const mfv = new Array(n).fill(null);
    const value = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const aralik = c.high - c.low;
      const v = Number.isFinite(c.volume) ? c.volume : 0;
      const carpan = aralik > 0 ? ((c.close - c.low) - (c.high - c.close)) / aralik : 0;
      mfv[i] = carpan * v;
    }

    let mfvToplam = 0;
    let hacimToplam = 0;
    for (let i = 0; i < n; i++) {
      const v = Number.isFinite(candles[i].volume) ? candles[i].volume : 0;
      mfvToplam += mfv[i];
      hacimToplam += v;
      if (i >= pencere) {
        mfvToplam -= mfv[i - pencere];
        hacimToplam -= Number.isFinite(candles[i - pencere].volume) ? candles[i - pencere].volume : 0;
      }
      if (i >= pencere - 1 && hacimToplam > 0) value[i] = mfvToplam / hacimToplam;
    }

    return {
      value: clean(value, n),
      moneyFlowVolume: clean(mfv, n)
    };
  }
});
