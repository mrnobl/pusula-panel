const { register } = require('../registry');
const { clean } = require('../contract');

/**
 * Dealing range (premium/discount) ve OTE (optimal trade entry).
 *
 * İkisi de "fiyat pahalı mı ucuz mu" sorusunu yanıtlar ama FARKLI ölçeklerde,
 * ve bu ayrım karıştırılırsa ikisi de işe yaramaz:
 *
 *   dealing_range → GEÇERLİ ARALIK içinde neredeyiz. Aralığın üst yarısı
 *     premium (satış bölgesi), alt yarısı discount (alım bölgesi), ortası
 *     equilibrium. Bağlam verir, tetik vermez.
 *
 *   ote → SON İTİCİ BACAĞIN %62–79 düzeltme bölgesi. Bacağa özeldir, bacak
 *     geçersizleşince biter. Giriş bölgesidir.
 *
 * Ortak temelleri `swings`: ikisi de onaylanmış salınım noktalarından kurulur,
 * yani bir seviye ancak BİLİNEBİLDİĞİ bardan itibaren kullanılır.
 */

/**
 * Salınım noktalarından bacak listesi kurar. Bacak = ardışık ZIT iki uç.
 *
 * ÖNEMLİ — burada bir kez yanlış yazıldı ve lookahead testi yakaladı:
 * `pivot` yöntemi arka arkaya iki zirve üretebiliyor. İlk sürüm bunları
 * "daha uç olan kalsın" diye tekilleştiriyordu; ama daha uç nokta SONRADAN
 * geldiği için geçmişteki bacak geriye dönük siliniyordu — 249. barda var olan
 * OTE bölgesi, seri sonuna kadar hesaplanınca yok oluyordu.
 *
 * Doğrusu nedensel kurulum: noktalar ONAY sırasıyla yürünür ve aynı tipten
 * daha uç bir nokta geldiğinde eski bacak silinmez, YENİ bir bacak doğar
 * (aynı başlangıç, yeni uç, yeni `knownAt`). Böylece her bacak, bilindiği
 * bardan itibaren geçerlidir ve geçmiş asla değişmez.
 */
function buildLegs(points, zoneSeviyeleri) {
  const sirali = points.slice().sort((a, b) => (a.confirmedAt - b.confirmedAt) || (a.index - b.index));
  const bacaklar = [];

  let bacakBasi = null;   // aktif bacağın başlangıç ucu (zıt tip)
  let sonUc = null;       // en son onaylanan uç

  for (const pt of sirali) {
    if (sonUc === null) { sonUc = pt; continue; }

    if (pt.type !== sonUc.type) {
      bacakBasi = sonUc;
      sonUc = pt;
    } else {
      // Aynı taraf: yalnızca daha uç nokta bacağı uzatır, aksi hâlde atlanır.
      const dahaUc = pt.type === 'high' ? (pt.price > sonUc.price) : (pt.price < sonUc.price);
      if (!dahaUc) continue;
      sonUc = pt;
    }

    if (!bacakBasi) continue;
    const boy = Math.abs(sonUc.price - bacakBasi.price);
    if (!(boy > 0)) continue;

    bacaklar.push(zoneSeviyeleri({
      origin: bacakBasi,
      extreme: sonUc,
      length: boy,
      direction: sonUc.type === 'high' ? 1 : -1,   // dip→zirve = boğa bacağı
      knownAt: pt.confirmedAt
    }));
  }

  return bacaklar;
}

register({
  key: 'dealing_range',
  label: 'Dealing Range (Premium/Discount)',
  group: 'ict',
  kind: 'zones',
  outputs: [
    'anchors',
    'high', 'low', 'equilibrium', 'position',
    'inPremium', 'inDiscount', 'widthAtr'
  ],
  seriesOutputs: ['high', 'low', 'equilibrium', 'position', 'inPremium', 'inDiscount', 'widthAtr'],
  // Aralık, ilk zıt salınım çifti onaylanana kadar YOKTUR. Bu ısınma eksikliği
  // değil, o barın gerçeği — o yüzden süreklilik beklenmez.
  sparseOutputs: ['high', 'low', 'equilibrium', 'position', 'inPremium', 'inDiscount', 'widthAtr'],
  dependsOn: ['swings', 'atr'],
  params: {
    swingMethod: { type: 'enum', values: ['atr', 'pivot'], default: 'atr' },
    swingAtrMultiple: { type: 'number', default: 2.0, min: 0.1 },
    swingLookback: { type: 'number', default: 5, min: 1 },
    atrPeriod: { type: 'number', default: 14, min: 1 },
    // 'extreme': fiyat sınırı aşarsa sınır fiyatı takip eder (koşan uç) —
    //   `position` her zaman 0–1 arasında kalır.
    // 'swing'  : sınırlar yalnızca onaylanmış salınım fiyatlarıdır; kırılımda
    //   `position` 1'i aşar veya 0'ın altına iner (bilgi olarak taşınır).
    boundary: { type: 'enum', values: ['extreme', 'swing'], default: 'extreme' },
    // Equilibrium çevresinde nötr bant (0 = saf ICT tanımı, %50 keskin sınır).
    equilibriumBand: { type: 'number', default: 0, min: 0, max: 0.4 },
    // Aralık bu kadar ATR'den darsa premium/discount ayrımı gürültüdür.
    minWidthAtr: { type: 'number', default: 0.5, min: 0 },
    maxAnchors: { type: 'number', default: 40, min: 1 }
  },
  warmup: (p) => Math.max(p.atrPeriod + 10, 60),
  note: '`position` 0 = aralık dibi (discount ucu), 1 = tepesi (premium ucu). `boundary:extreme` fiyatı her zaman aralık içinde tutar; `swing` modunda 1 üstü / 0 altı değerler kırılımı gösterir.',
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const atr = ctx.computeOne('atr', { period: p.atrPeriod }).value;
    const sw = ctx.computeOne('swings', {
      method: p.swingMethod,
      atrMultiple: p.swingAtrMultiple,
      lookback: p.swingLookback,
      atrPeriod: p.atrPeriod
    });

    const high = new Array(n).fill(null);
    const low = new Array(n).fill(null);
    const equilibrium = new Array(n).fill(null);
    const position = new Array(n).fill(null);
    const inPremium = new Array(n).fill(null);
    const inDiscount = new Array(n).fill(null);
    const widthAtr = new Array(n).fill(null);
    const anchors = [];

    let ustIndex = null;
    let altIndex = null;
    let ustFiyat = null;
    let altFiyat = null;
    let kosanUst = null;
    let kosanAlt = null;
    let sonImza = null;

    for (let i = 0; i < n; i++) {
      const c = candles[i];

      // Yeni bir salınım onaylandıysa o taraf yeniden çapalanır ve koşan uç
      // sıfırlanır. İndeksle karşılaştırılır: iki farklı salınımın fiyatı
      // tesadüfen eşit olabilir.
      if (sw.lastHighIndex[i] !== ustIndex) {
        ustIndex = sw.lastHighIndex[i];
        ustFiyat = sw.lastHigh[i];
        kosanUst = ustFiyat;
      }
      if (sw.lastLowIndex[i] !== altIndex) {
        altIndex = sw.lastLowIndex[i];
        altFiyat = sw.lastLow[i];
        kosanAlt = altFiyat;
      }

      if (kosanUst !== null && c.high > kosanUst) kosanUst = c.high;
      if (kosanAlt !== null && c.low < kosanAlt) kosanAlt = c.low;

      if (ustFiyat === null || altFiyat === null) continue;

      const ust = p.boundary === 'extreme' ? kosanUst : ustFiyat;
      const alt = p.boundary === 'extreme' ? kosanAlt : altFiyat;
      const boy = ust - alt;
      if (!(boy > 0)) continue;

      const a = atr[i];
      const genislikAtr = Number.isFinite(a) && a > 0 ? boy / a : null;
      // Fazla dar aralıkta premium/discount ayrımı anlamsız — hiç üretme.
      if (genislikAtr !== null && genislikAtr < p.minWidthAtr) continue;

      const orta = (ust + alt) / 2;
      const konum = (c.close - alt) / boy;

      high[i] = ust;
      low[i] = alt;
      equilibrium[i] = orta;
      position[i] = konum;
      widthAtr[i] = genislikAtr;
      inPremium[i] = konum > 0.5 + p.equilibriumBand ? 1 : 0;
      inDiscount[i] = konum < 0.5 - p.equilibriumBand ? 1 : 0;

      // Çapa değişimi kaydı — aralığın ne zaman yeniden kurulduğu görünsün.
      const imza = `${ustIndex}|${altIndex}`;
      if (imza !== sonImza) {
        sonImza = imza;
        anchors.push({
          from: i,
          time: c.time,
          highIndex: ustIndex,
          lowIndex: altIndex,
          high: ustFiyat,
          low: altFiyat,
          equilibrium: (ustFiyat + altFiyat) / 2,
          widthAtr: Number.isFinite(a) && a > 0 ? (ustFiyat - altFiyat) / a : null
        });
      }
    }

    return {
      anchors: anchors.sort((x, y) => y.from - x.from).slice(0, Math.floor(p.maxAnchors)),
      high: clean(high, n),
      low: clean(low, n),
      equilibrium: clean(equilibrium, n),
      position: clean(position, n),
      inPremium: clean(inPremium, n),
      inDiscount: clean(inDiscount, n),
      widthAtr: clean(widthAtr, n)
    };
  }
});

/**
 * OTE — Optimal Trade Entry.
 *
 * Son itici bacağın %62–79 düzeltme bölgesi. Boğa bacağında (dip → zirve)
 * bölge zirveden aşağı ölçülür; ayı bacağında dipten yukarı.
 *
 * BACAK NE ZAMAN BİLİNİR: iki ucu da ONAYLANDIĞINDA (`knownAt`). Bacağın
 * zirvesi 40. barda oluşup 47. barda onaylanıyorsa, OTE seviyeleri 47'den
 * itibaren vardır. Bunu yapmamak, düzeltmenin nereye kadar geleceğini
 * düzeltme başlamadan bilmek olurdu — bu havuzdaki en klasik sızıntı.
 *
 * BACAK NE ZAMAN BİTER: fiyat bacağın başlangıcını geçerse (düzeltme
 * `invalidateBeyond`'u aşar) bacak geçersizdir; ya da yeni bir bacak onaylanır.
 * Düzeltmenin NEGATİF olması bacağın uzadığı anlamına gelir (fiyat yeni uç
 * yaptı) — geçersizlik değildir, yeni salınım onaylanana kadar beklenir.
 */
register({
  key: 'ote',
  label: 'OTE (Optimal Trade Entry)',
  group: 'ict',
  kind: 'zones',
  outputs: [
    'legs',
    'direction', 'retracement', 'inOte',
    'zoneHigh', 'zoneLow', 'sweetSpot'
  ],
  seriesOutputs: ['direction', 'retracement', 'inOte', 'zoneHigh', 'zoneLow', 'sweetSpot'],
  // `inOte` aktif bacak yokken 0'dır (OTE'de değiliz — bu bir bilgi).
  // Diğerleri bacak yokken gerçekten yoktur.
  sparseOutputs: ['direction', 'retracement', 'zoneHigh', 'zoneLow', 'sweetSpot'],
  dependsOn: ['swings'],
  params: {
    swingMethod: { type: 'enum', values: ['atr', 'pivot'], default: 'atr' },
    swingAtrMultiple: { type: 'number', default: 2.0, min: 0.1 },
    swingLookback: { type: 'number', default: 5, min: 1 },
    atrPeriod: { type: 'number', default: 14, min: 1 },
    // Bölge sınırları — klasik ICT: 0.62 / 0.705 / 0.79
    zoneStart: { type: 'number', default: 0.62, min: 0.1, max: 0.99 },
    zoneEnd: { type: 'number', default: 0.79, min: 0.1, max: 1.5 },
    sweetSpot: { type: 'number', default: 0.705, min: 0.1, max: 1.5 },
    // Düzeltme bunu aşarsa bacak geçersiz (1.0 = bacağın başlangıcı).
    invalidateBeyond: { type: 'number', default: 1.0, min: 0.5 },
    // Bölgeye giriş fitille mi sayılsın, kapanışla mı.
    touchWithWick: { type: 'boolean', default: true },
    // Bacak yönü yapı yönüyle uyuşmuyorsa atlanır (ICT: trend yönünde OTE).
    alignWithStructure: { type: 'boolean', default: false },
    maxLegs: { type: 'number', default: 40, min: 1 }
  },
  warmup: (p) => (p.swingMethod === 'pivot' ? p.swingLookback * 4 : p.atrPeriod + 30),
  note: 'Bacak İKİ UCU DA onaylandığında bilinir (`knownAt`). `retracement` negatifse bacak uzuyor demektir (fiyat yeni uç yaptı), geçersizlik değildir.',
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const sw = ctx.computeOne('swings', {
      method: p.swingMethod,
      atrMultiple: p.swingAtrMultiple,
      lookback: p.swingLookback,
      atrPeriod: p.atrPeriod
    });
    const st = p.alignWithStructure
      ? ctx.computeOne('structure_state', {
        method: p.swingMethod,
        atrMultiple: p.swingAtrMultiple,
        lookback: p.swingLookback,
        atrPeriod: p.atrPeriod
      })
      : null;

    let sonrakiId = 1;
    const bacaklar = buildLegs(sw.points, ({ origin, extreme, length, direction, knownAt }) => {
      // Boğa bacağında düzeltme AŞAĞI ölçülür, ayı bacağında yukarı.
      const seviye = (oran) => direction === 1 ? (extreme.price - oran * length) : (extreme.price + oran * length);
      return {
        id: sonrakiId++,
        direction,
        originIndex: origin.index,
        originPrice: origin.price,
        extremeIndex: extreme.index,
        extremePrice: extreme.price,
        length,
        knownAt,
        zoneStartPrice: seviye(p.zoneStart),
        zoneEndPrice: seviye(p.zoneEnd),
        sweetSpotPrice: seviye(p.sweetSpot),
        deepestRetracement: null,
        enteredOteAt: null,
        reachedSweetAt: null,
        invalidatedAt: null,
        endedAt: null
      };
    }).filter(b => b.knownAt < n);

    const direction = new Array(n).fill(null);
    const retracement = new Array(n).fill(null);
    const inOte = new Array(n).fill(null);
    const zoneHigh = new Array(n).fill(null);
    const zoneLow = new Array(n).fill(null);
    const sweetSpot = new Array(n).fill(null);

    let bi = 0;
    let aktif = null;

    for (let i = 0; i < n; i++) {
      const c = candles[i];

      // Bu barda bilinir hale gelen bacaklar sırayla devralır; sonuncusu aktif.
      while (bi < bacaklar.length && bacaklar[bi].knownAt <= i) {
        const yeni = bacaklar[bi];
        bi++;
        if (p.alignWithStructure && st && st.state[i] !== yeni.direction) continue;
        if (aktif && aktif.endedAt === null) aktif.endedAt = i;
        aktif = yeni;
      }

      inOte[i] = 0;
      if (!aktif || i < aktif.knownAt || aktif.invalidatedAt !== null) continue;

      const yon = aktif.direction;
      const oran = yon === 1
        ? (aktif.extremePrice - c.close) / aktif.length
        : (c.close - aktif.extremePrice) / aktif.length;

      // Bacağın başlangıcı geçildi → bacak bitti.
      if (oran > p.invalidateBeyond) {
        aktif.invalidatedAt = i;
        aktif.endedAt = i;
        continue;
      }

      const ust = Math.max(aktif.zoneStartPrice, aktif.zoneEndPrice);
      const alt = Math.min(aktif.zoneStartPrice, aktif.zoneEndPrice);

      const icinde = p.touchWithWick
        ? (c.low <= ust && c.high >= alt)
        : (c.close <= ust && c.close >= alt);

      if (aktif.deepestRetracement === null || oran > aktif.deepestRetracement) {
        aktif.deepestRetracement = oran;
      }
      if (icinde && aktif.enteredOteAt === null) aktif.enteredOteAt = i;
      if (aktif.reachedSweetAt === null) {
        const ulasti = p.touchWithWick
          ? (yon === 1 ? c.low <= aktif.sweetSpotPrice : c.high >= aktif.sweetSpotPrice)
          : (yon === 1 ? c.close <= aktif.sweetSpotPrice : c.close >= aktif.sweetSpotPrice);
        if (ulasti) aktif.reachedSweetAt = i;
      }

      direction[i] = yon;
      retracement[i] = oran;
      inOte[i] = icinde ? 1 : 0;
      zoneHigh[i] = ust;
      zoneLow[i] = alt;
      sweetSpot[i] = aktif.sweetSpotPrice;
    }

    const sonIndex = n - 1;
    return {
      legs: bacaklar
        .map(b => ({
          id: b.id,
          direction: b.direction === 1 ? 'bullish' : 'bearish',
          originIndex: b.originIndex,
          originPrice: b.originPrice,
          extremeIndex: b.extremeIndex,
          extremePrice: b.extremePrice,
          length: b.length,
          knownAt: b.knownAt,
          confirmDelay: b.knownAt - b.extremeIndex,
          zoneHigh: Math.max(b.zoneStartPrice, b.zoneEndPrice),
          zoneLow: Math.min(b.zoneStartPrice, b.zoneEndPrice),
          sweetSpot: b.sweetSpotPrice,
          deepestRetracement: b.deepestRetracement,
          enteredOteAt: b.enteredOteAt,
          reachedSweetAt: b.reachedSweetAt,
          invalidatedAt: b.invalidatedAt,
          endedAt: b.endedAt,
          active: b.endedAt === null && b.invalidatedAt === null,
          ageBars: sonIndex - b.knownAt
        }))
        .sort((x, y) => y.knownAt - x.knownAt)
        .slice(0, Math.floor(p.maxLegs)),
      direction: clean(direction, n),
      retracement: clean(retracement, n),
      inOte: clean(inOte, n),
      zoneHigh: clean(zoneHigh, n),
      zoneLow: clean(zoneLow, n),
      sweetSpot: clean(sweetSpot, n)
    };
  }
});
