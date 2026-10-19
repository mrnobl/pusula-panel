const { register } = require('../registry');
const { clean } = require('../contract');

/**
 * ICT temel taşları: displacement ve order block.
 *
 * DISPLACEMENT neden önce geliyor: FVG'nin tanımı üç mumluk bir boşluktur ve
 * öylece bakıldığında piyasada sürekli bulunur — çoğu gürültüdür. Gerçek
 * FVG'yi ayıran şey, boşluğu yaratan hareketin ENERJİLİ olmasıdır. Aynı şey
 * order block için de geçerli: "hareketten önceki son ters mum" tanımı,
 * hareketin ne olduğu tanımlanmadan yazılamaz.
 *
 * Bu yüzden displacement bu havuzda FVG ve OB'nin ortak ön koşulu.
 */

register({
  key: 'displacement',
  label: 'Displacement (Enerjili Hareket)',
  group: 'ict',
  kind: 'events',
  outputs: ['bullish', 'bearish', 'strength', 'bodyRatio', 'events'],
  seriesOutputs: ['bullish', 'bearish', 'strength', 'bodyRatio'],
  // bullish/bearish yalnızca olay barlarında değer taşır.
  sparseOutputs: ['bullish', 'bearish'],
  dependsOn: ['atr'],
  params: {
    atrPeriod: { type: 'number', default: 14, min: 1 },
    // Mum aralığı bu kadar ATR'yi aşmalı.
    atrMultiple: { type: 'number', default: 1.5, min: 0.1 },
    // Gövde / toplam aralık oranı: kararsız (doji benzeri) mumları eler.
    minBodyRatio: { type: 'number', default: 0.5, min: 0, max: 1 },
    // Hacim filtresi: 0 = kapalı. Açıkken hacim ortalamanın bu katı olmalı.
    volumeMultiple: { type: 'number', default: 0, min: 0 },
    volumeLookback: { type: 'number', default: 20, min: 2 }
  },
  warmup: (p) => Math.max(p.atrPeriod + 1, p.volumeLookback),
  note: '`strength` her bar için aralık/ATR oranıdır (süreklidir). `bullish`/`bearish` yalnızca eşiği geçen barlarda 1 taşır.',
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const atr = ctx.computeOne('atr', { period: p.atrPeriod }).value;

    const bullish = new Array(n).fill(null);
    const bearish = new Array(n).fill(null);
    const strength = new Array(n).fill(null);
    const bodyRatio = new Array(n).fill(null);
    const events = [];

    // Hacim ortalaması için koşan toplam
    let hacimToplam = 0;
    const pencere = Math.max(2, Math.floor(p.volumeLookback));

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const v = Number.isFinite(c.volume) ? c.volume : 0;
      hacimToplam += v;
      if (i >= pencere) hacimToplam -= (Number.isFinite(candles[i - pencere].volume) ? candles[i - pencere].volume : 0);
      const ortHacim = i >= pencere - 1 ? hacimToplam / pencere : null;

      const a = atr[i];
      const aralik = c.high - c.low;
      const govde = Math.abs(c.close - c.open);

      if (aralik > 0) bodyRatio[i] = govde / aralik;
      if (!Number.isFinite(a) || a <= 0 || aralik <= 0) continue;

      strength[i] = aralik / a;

      const aralikTamam = (aralik / a) >= p.atrMultiple;
      const govdeTamam = (govde / aralik) >= p.minBodyRatio;
      const hacimTamam = p.volumeMultiple <= 0 || (ortHacim !== null && v >= ortHacim * p.volumeMultiple);

      if (aralikTamam && govdeTamam && hacimTamam) {
        const yon = c.close > c.open ? 1 : (c.close < c.open ? -1 : 0);
        if (yon === 1) {
          bullish[i] = 1;
          events.push({ index: i, time: c.time, direction: 'bullish', strength: aralik / a, bodyRatio: govde / aralik });
        } else if (yon === -1) {
          bearish[i] = 1;
          events.push({ index: i, time: c.time, direction: 'bearish', strength: aralik / a, bodyRatio: govde / aralik });
        }
      }
    }

    return {
      bullish: clean(bullish, n),
      bearish: clean(bearish, n),
      strength: clean(strength, n),
      bodyRatio: clean(bodyRatio, n),
      events
    };
  }
});

/**
 * Order Block.
 *
 * Tanım: enerjili hareketten (displacement) ÖNCEKİ son ters yönlü mum.
 *   Boğa OB → yukarı displacement'tan önceki son düşüş mumu
 *   Ayı OB  → aşağı displacement'tan önceki son yükseliş mumu
 *
 * İLERİYE BAKMA: OB, mumun kendisinde değil, DISPLACEMENT barında bilinir.
 * Bölge geriye dönük işaretlenir ama `confirmedAt` displacement barıdır ve
 * türetilmiş seriler ona göre doldurulur. Aksi halde "hareketten önce nereden
 * dönüleceğini bilmek" olurdu.
 *
 * `useBody` — ICT kaynakları bölünmüş: kimi mumun tamamını (high-low), kimi
 * yalnızca gövdesini kullanır. İkisi de destekleniyor, varsayılan tam mum.
 */
register({
  key: 'order_block',
  label: 'Order Block',
  group: 'ict',
  kind: 'zones',
  outputs: ['blocks', 'activeBullish', 'activeBearish', 'nearestBullish', 'nearestBearish', 'inBlock'],
  seriesOutputs: ['activeBullish', 'activeBearish', 'nearestBullish', 'nearestBearish', 'inBlock'],
  sparseOutputs: ['nearestBullish', 'nearestBearish'],
  dependsOn: ['displacement', 'atr'],
  params: {
    atrPeriod: { type: 'number', default: 14, min: 1 },
    dispAtrMultiple: { type: 'number', default: 1.5, min: 0.1 },
    dispMinBodyRatio: { type: 'number', default: 0.5, min: 0, max: 1 },
    // Displacement'tan kaç bar geriye kadar ters mum aranır.
    lookback: { type: 'number', default: 5, min: 1 },
    useBody: { type: 'boolean', default: false },
    // 'touch' = fiyat bölgeye değdi, 'close' = bölge içinde kapandı,
    // 'through' = bölgenin tamamen ötesine geçildi (geçersiz olur)
    mitigation: { type: 'enum', values: ['touch', 'close', 'through'], default: 'through' }
  },
  warmup: (p) => p.atrPeriod + p.lookback + 2,
  note: 'OB, displacement barında ONAYLANIR — kendi barında değil. `mitigation:through` bölge tamamen geçilene kadar aktif tutar (ICT varsayılanı).',
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const disp = ctx.computeOne('displacement', {
      atrPeriod: p.atrPeriod,
      atrMultiple: p.dispAtrMultiple,
      minBodyRatio: p.dispMinBodyRatio
    });

    // Displacement barından geriye giderek son ters mumu bul.
    const bloklar = [];
    let sonrakiId = 1;
    // Ardışık displacement barları aynı ters muma işaret edebilir; aynı mum
    // aynı bloktur. Tekilleştirilmezse aynı bölge birden çok kez sayılır ve
    // sayılar şişer (gerçek veride aynı bölge iki kez raporlanıyordu).
    const gorulen = new Set();

    for (const ev of disp.events) {
      const i = ev.index;
      const bogaMi = ev.direction === 'bullish';
      let obIndex = null;

      for (let j = i - 1; j >= Math.max(0, i - p.lookback); j--) {
        const m = candles[j];
        const dususMumu = m.close < m.open;
        const yukselisMumu = m.close > m.open;
        if ((bogaMi && dususMumu) || (!bogaMi && yukselisMumu)) { obIndex = j; break; }
      }
      if (obIndex === null) continue;

      // Aynı mum + aynı yön daha önce blok oldu ise atlanır; ilk onay geçerli.
      const anahtar = `${obIndex}|${bogaMi ? 'b' : 'a'}`;
      if (gorulen.has(anahtar)) continue;
      gorulen.add(anahtar);

      const m = candles[obIndex];
      const ust = p.useBody ? Math.max(m.open, m.close) : m.high;
      const alt = p.useBody ? Math.min(m.open, m.close) : m.low;
      if (!(ust > alt)) continue;

      bloklar.push({
        id: sonrakiId++,
        index: obIndex,
        time: m.time,
        confirmedAt: i,          // displacement barı — burada bilinir
        direction: bogaMi ? 'bullish' : 'bearish',
        high: ust,
        low: alt,
        touches: 0,
        firstTouchAt: null,
        mitigatedAt: null,
        displacementStrength: ev.strength
      });
    }

    bloklar.sort((a, b) => a.confirmedAt - b.confirmedAt);

    const activeBullish = new Array(n).fill(null);
    const activeBearish = new Array(n).fill(null);
    const nearestBullish = new Array(n).fill(null);
    const nearestBearish = new Array(n).fill(null);
    const inBlock = new Array(n).fill(null);

    let bi = 0;
    const aktif = [];

    for (let i = 0; i < n; i++) {
      const c = candles[i];

      // Bu barda ONAYLANAN bloklar devreye girer.
      while (bi < bloklar.length && bloklar[bi].confirmedAt <= i) { aktif.push(bloklar[bi]); bi++; }

      let bogaSayi = 0;
      let ayiSayi = 0;
      let enYakinBoga = null;
      let enYakinAyi = null;
      let icinde = 0;

      for (const b of aktif) {
        if (b.mitigatedAt !== null) continue;

        const degdi = c.low <= b.high && c.high >= b.low;
        if (degdi) {
          b.touches += 1;
          if (b.firstTouchAt === null) b.firstTouchAt = i;
          icinde = 1;
        }

        // Mitigasyon: seçilen moda göre bölge tüketilmiş sayılır.
        let tuketildi = false;
        if (p.mitigation === 'touch') tuketildi = degdi;
        else if (p.mitigation === 'close') tuketildi = c.close <= b.high && c.close >= b.low;
        else tuketildi = b.direction === 'bullish' ? (c.close < b.low) : (c.close > b.high);

        if (tuketildi) { b.mitigatedAt = i; continue; }

        if (b.direction === 'bullish') {
          bogaSayi++;
          if (b.high <= c.close && (enYakinBoga === null || b.high > enYakinBoga)) enYakinBoga = b.high;
        } else {
          ayiSayi++;
          if (b.low >= c.close && (enYakinAyi === null || b.low < enYakinAyi)) enYakinAyi = b.low;
        }
      }

      activeBullish[i] = bogaSayi;
      activeBearish[i] = ayiSayi;
      nearestBullish[i] = enYakinBoga;
      nearestBearish[i] = enYakinAyi;
      inBlock[i] = icinde;
    }

    const sonIndex = n - 1;
    const rapor = bloklar
      .map(b => ({
        id: b.id,
        direction: b.direction,
        high: b.high,
        low: b.low,
        index: b.index,
        time: b.time,
        confirmedAt: b.confirmedAt,
        confirmDelay: b.confirmedAt - b.index,
        touches: b.touches,
        firstTouchAt: b.firstTouchAt,
        mitigatedAt: b.mitigatedAt,
        active: b.mitigatedAt === null,
        ageBars: sonIndex - b.confirmedAt,
        displacementStrength: b.displacementStrength
      }))
      // TÜM bloklar raporlanır (mitige olanlar dahil): `breaker_block` ve
      // `mitigation_block` başarısız olmuş blokları görmek zorunda.
      // `fvg`'nin `gaps` çıktısıyla aynı ilke.
      .sort((a, b) => b.confirmedAt - a.confirmedAt);

    return {
      blocks: rapor,
      activeBullish: clean(activeBullish, n),
      activeBearish: clean(activeBearish, n),
      nearestBullish: clean(nearestBullish, n),
      nearestBearish: clean(nearestBearish, n),
      inBlock: clean(inBlock, n)
    };
  }
});
