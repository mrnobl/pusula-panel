const { register } = require('../registry');
const { clean } = require('../contract');

/**
 * Çok sembollü göstergeler: korelasyon ve beta.
 *
 * Bunlar havuzun ilk `multi: true` göstergeleri — girdileri tek bir mum dizisi
 * değil, sembol → mum dizisi haritası. `pool.computeMulti()` haritayı önce
 * ORTAK ZAMAN EKSENİNE indirger (zaman damgalarının kesişimi); farklı
 * uzunlukta ya da boşluklu seriler karşılaştırılamaz, indeks indeks
 * hizalanmamış iki seriyi korele etmek sessizce anlamsız sayı üretir.
 *
 * NEDEN ÖNEMLİ: risk tarafındaki `risk.clusters` haritası ELLE yazılmış.
 * "MATIC ile ATOM aynı kümede" bir varsayım; `correlation_matrix` bunu ölçer
 * ve aynı biçimde bir küme haritası üretir — varsayımın yerine veri koyar.
 *
 * ÇIKTI TİPİ NEDEN 'levels': çıktı hem hizalı seriler (`average`) hem sembol
 * haritası (`pairs`) taşıyor. Sözleşmede `kind:'series'` TÜM çıktıların hizalı
 * seri olmasını şart koşar; hizalı olanlar bu yüzden `seriesOutputs` ile
 * işaretleniyor (`swings`'in `kind:'events'` olup seri üretmesiyle aynı çözüm).
 */

/** Getiri serisi. İlk bar `null` — öncesi yok. */
function returnsOf(candles, mode) {
  const n = candles.length;
  const r = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const p0 = candles[i - 1] ? candles[i - 1].close : null;
    const p1 = candles[i] ? candles[i].close : null;
    if (!(p0 > 0) || !(p1 > 0)) continue;
    r[i] = mode === 'pct' ? (p1 - p0) / p0 : Math.log(p1 / p0);
  }
  return r;
}

/**
 * Kayan pencerede Pearson korelasyonu ve beta'yı birlikte üretir — ikisi de
 * aynı toplamlardan çıkar, iki kez dolaşmanın anlamı yok.
 * beta = cov(y,x) / var(x)  (x = referans/baz)
 */
function rollingStats(x, y, period, minPeriods) {
  const n = x.length;
  const corr = new Array(n).fill(null);
  const beta = new Array(n).fill(null);

  const buf = [];
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0, cnt = 0;

  for (let i = 0; i < n; i++) {
    const a = x[i];
    const b = y[i];
    const gecerli = Number.isFinite(a) && Number.isFinite(b);
    buf.push(gecerli ? [a, b] : null);
    if (gecerli) { sx += a; sy += b; sxy += a * b; sxx += a * a; syy += b * b; cnt++; }

    if (buf.length > period) {
      const eski = buf.shift();
      if (eski) {
        sx -= eski[0]; sy -= eski[1];
        sxy -= eski[0] * eski[1];
        sxx -= eski[0] * eski[0];
        syy -= eski[1] * eski[1];
        cnt--;
      }
    }

    if (cnt < Math.max(2, minPeriods)) continue;

    const cov = sxy - (sx * sy) / cnt;
    const vx = sxx - (sx * sx) / cnt;
    const vy = syy - (sy * sy) / cnt;

    if (vx > 0 && vy > 0) {
      // Yuvarlama 1.0000000002 üretebiliyor; korelasyon tanımı gereği [-1,1].
      corr[i] = Math.max(-1, Math.min(1, cov / Math.sqrt(vx * vy)));
    }
    if (vx > 0) beta[i] = cov / vx;
  }

  return { corr, beta };
}

/** Tek seferlik (snapshot) Pearson — matris için. */
function pearson(x, y) {
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0, n = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i];
    const b = y[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    sx += a; sy += b; sxy += a * b; sxx += a * a; syy += b * b; n++;
  }
  if (n < 2) return null;
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (!(vx > 0) || !(vy > 0)) return null;
  return Math.max(-1, Math.min(1, cov / Math.sqrt(vx * vy)));
}

const BASE_PARAMS = {
  base: { type: 'string', default: null },
  period: { type: 'number', default: 50, min: 5 },
  returns: { type: 'enum', values: ['log', 'pct'], default: 'log' },
  minPeriods: { type: 'number', default: 0, min: 0 }
};

/** Baz sembolü seçer: verilmemişse haritanın ilk sembolü. */
function bazSec(aligned, istenen) {
  const semboller = Object.keys(aligned);
  if (istenen && semboller.includes(istenen)) return istenen;
  return semboller[0] || null;
}

register({
  key: 'correlation_rolling',
  label: 'Kayan Korelasyon',
  group: 'coklu',
  kind: 'levels',
  multi: true,
  outputs: ['pairs', 'average', 'spread', 'info'],
  seriesOutputs: ['average', 'spread'],
  params: BASE_PARAMS,
  warmup: (p) => p.period + 1,
  note: 'Baz sembol ile diğerlerinin kayan Pearson korelasyonu (log getiriler). `average` ortalama korelasyon, `spread` en yüksek ile en düşük çiftin farkı — hepsi 1\'e yaklaşıyorsa çeşitlendirme bitmiş demektir.',
  compute: (aligned, p) => {
    const semboller = Object.keys(aligned);
    const baz = bazSec(aligned, p.base);
    const n = baz ? aligned[baz].length : 0;

    const pairs = {};
    const average = new Array(n).fill(null);
    const spread = new Array(n).fill(null);

    if (!baz || semboller.length < 2) {
      return {
        pairs,
        average: clean(average, n),
        spread: clean(spread, n),
        info: { base: baz, period: p.period, symbols: semboller, pairCount: 0 }
      };
    }

    const bazGetiri = returnsOf(aligned[baz], p.returns);
    const digerler = semboller.filter(s => s !== baz);

    for (const sym of digerler) {
      const { corr } = rollingStats(bazGetiri, returnsOf(aligned[sym], p.returns), p.period, p.minPeriods || p.period);
      pairs[sym] = clean(corr, n);
    }

    for (let i = 0; i < n; i++) {
      const degerler = digerler.map(s => pairs[s][i]).filter(Number.isFinite);
      if (!degerler.length) continue;
      average[i] = degerler.reduce((a, b) => a + b, 0) / degerler.length;
      spread[i] = Math.max(...degerler) - Math.min(...degerler);
    }

    return {
      pairs,
      average: clean(average, n),
      spread: clean(spread, n),
      info: { base: baz, period: p.period, symbols: semboller, pairCount: digerler.length }
    };
  }
});

register({
  key: 'beta_rolling',
  label: 'Kayan Beta',
  group: 'coklu',
  kind: 'levels',
  multi: true,
  outputs: ['pairs', 'average', 'info'],
  seriesOutputs: ['average'],
  params: BASE_PARAMS,
  warmup: (p) => p.period + 1,
  note: 'beta = cov(sembol, baz) / var(baz). 1 = bazla aynı genlikte hareket, 2 = iki katı. Korelasyondan farkı: korelasyon yönün ne kadar birlikte olduğunu, beta hareketin ne kadar BÜYÜK olduğunu ölçer — pozisyon boyutu için asıl gereken bu.',
  compute: (aligned, p) => {
    const semboller = Object.keys(aligned);
    const baz = bazSec(aligned, p.base);
    const n = baz ? aligned[baz].length : 0;

    const pairs = {};
    const average = new Array(n).fill(null);

    if (!baz || semboller.length < 2) {
      return { pairs, average: clean(average, n), info: { base: baz, period: p.period, pairCount: 0 } };
    }

    const bazGetiri = returnsOf(aligned[baz], p.returns);
    const digerler = semboller.filter(s => s !== baz);

    for (const sym of digerler) {
      const { beta } = rollingStats(bazGetiri, returnsOf(aligned[sym], p.returns), p.period, p.minPeriods || p.period);
      pairs[sym] = clean(beta, n);
    }

    for (let i = 0; i < n; i++) {
      const degerler = digerler.map(s => pairs[s][i]).filter(Number.isFinite);
      if (degerler.length) average[i] = degerler.reduce((a, b) => a + b, 0) / degerler.length;
    }

    return {
      pairs,
      average: clean(average, n),
      info: { base: baz, period: p.period, symbols: semboller, pairCount: digerler.length }
    };
  }
});

/**
 * Korelasyon matrisi ve ondan türetilen kümeler.
 *
 * KÜMELEME TAM BAĞLANTILIDIR (complete linkage): bir sembol kümeye ancak
 * kümedeki HER ÜYEYLE eşiği aşan korelasyonu varsa girer. Tek bağlantı
 * (herhangi bir üyeyle eşiği aşmak) kriptoda işe yaramaz — her şey BTC
 * üzerinden zincirlenir ve 16 sembol tek kümede toplanır. Zincirleme
 * (chaining) bu yöntemin bilinen hatası ve burada gerçekten olur.
 *
 * Çıktı `clusters`, `config.risk.clusters` ile AYNI biçimdedir (isim → sembol
 * listesi), böylece ölçülen küme haritası elle yazılanın yerine konabilir.
 */
register({
  key: 'correlation_matrix',
  label: 'Korelasyon Matrisi',
  group: 'coklu',
  kind: 'levels',
  multi: true,
  outputs: ['matrix', 'symbols', 'clusters', 'strongestPairs', 'averageCorrelation', 'info'],
  params: {
    // Matris bir anlık görüntüdür; kayan korelasyondan daha uzun pencere ister.
    period: { type: 'number', default: 200, min: 10 },
    returns: { type: 'enum', values: ['log', 'pct'], default: 'log' },
    threshold: { type: 'number', default: 0.7, min: -1, max: 1 },
    maxPairs: { type: 'number', default: 15, min: 1 }
  },
  warmup: (p) => p.period + 1,
  note: 'Son `period` barın anlık görüntüsü. `clusters` TAM BAĞLANTILI kümelemeden çıkar (tek bağlantı kriptoda her şeyi tek kümede birleştirir) ve `config.risk.clusters` biçimindedir.',
  compute: (aligned, p) => {
    const semboller = Object.keys(aligned);
    const pencere = Math.floor(p.period);

    // Son `period` getiri: matris "şu anki" ilişkiyi anlatır.
    const getiriler = {};
    for (const s of semboller) {
      const tam = returnsOf(aligned[s], p.returns);
      getiriler[s] = tam.slice(Math.max(0, tam.length - pencere));
    }

    const matrix = {};
    const ciftler = [];
    for (const a of semboller) {
      matrix[a] = {};
      for (const b of semboller) {
        if (a === b) { matrix[a][b] = 1; continue; }
        if (matrix[b] && Number.isFinite(matrix[b][a])) { matrix[a][b] = matrix[b][a]; continue; }
        const r = pearson(getiriler[a], getiriler[b]);
        matrix[a][b] = r;
        if (r !== null) ciftler.push({ a, b, correlation: r });
      }
    }

    // Ortalama korelasyon: köşegen hariç, her çift bir kez.
    const ortalama = ciftler.length
      ? ciftler.reduce((acc, c) => acc + c.correlation, 0) / ciftler.length
      : null;

    // ── Tam bağlantılı kümeleme ──────────────────────────────────────────
    const kalan = new Set(semboller);
    const clusters = {};
    const kumeListesi = [];

    const ortKor = (sym, kume) => {
      const d = kume.map(k => matrix[sym][k]).filter(Number.isFinite);
      return d.length ? d.reduce((a, b) => a + b, 0) / d.length : -1;
    };

    while (kalan.size) {
      // Çekirdek: kalanlar içinde diğerleriyle ortalama korelasyonu en yüksek olan.
      let cekirdek = null;
      let enIyi = -Infinity;
      for (const s of kalan) {
        const d = Array.from(kalan).filter(x => x !== s).map(x => matrix[s][x]).filter(Number.isFinite);
        const ort = d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0;
        if (ort > enIyi) { enIyi = ort; cekirdek = s; }
      }

      const kume = [cekirdek];
      kalan.delete(cekirdek);

      // Adaylar korelasyonu yüksekten düşüğe denenir; her biri TÜM üyelerle
      // eşiği aşmalı.
      const adaylar = Array.from(kalan).sort((x, y) => (matrix[cekirdek][y] || -1) - (matrix[cekirdek][x] || -1));
      for (const aday of adaylar) {
        const uyar = kume.every(u => Number.isFinite(matrix[aday][u]) && matrix[aday][u] >= p.threshold);
        if (uyar) { kume.push(aday); kalan.delete(aday); }
      }

      kumeListesi.push(kume);
    }

    for (const kume of kumeListesi) {
      // Küme adı: merkezdeki sembolün baz varlığı — isimler benzersiz olur.
      const merkez = kume.slice().sort((x, y) => ortKor(y, kume) - ortKor(x, kume))[0];
      const ad = `${String(merkez).split('/')[0]} kümesi`;
      clusters[ad] = kume;
    }

    return {
      matrix,
      symbols: semboller,
      clusters,
      strongestPairs: ciftler
        .sort((x, y) => y.correlation - x.correlation)
        .slice(0, Math.floor(p.maxPairs)),
      averageCorrelation: ortalama,
      info: {
        period: pencere,
        threshold: p.threshold,
        clusterCount: kumeListesi.length,
        // Kaç getiri örneğiyle hesaplandı — kısa örneklemde matris gürültüdür.
        sampleSize: semboller.length ? getiriler[semboller[0]].filter(Number.isFinite).length : 0
      }
    };
  }
});
