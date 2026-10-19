const { register } = require('../registry');
const { clean } = require('../contract');

/**
 * Piyasa yapısı: salınım noktaları ve yapı durumu (BOS / CHoCH).
 *
 * ICT/SMC yapılarının neredeyse tamamı bunlara dayanır — order block "BOS'tan
 * önceki son ters mum", breaker "BOS'ta başarısız olan OB" demek. Tanımları
 * yapı durumunu bilmeden yazılamaz, bu yüzden havuzda ilk sırada geliyorlar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * İLERİYE BAKMA (LOOKAHEAD) KORUMASI — bu dosyanın en kritik kısmı
 * ─────────────────────────────────────────────────────────────────────────
 * Bir salınım zirvesi `index` barında OLUŞUR ama ancak `confirmedAt` barında
 * BİLİNİR (pivotta lookback kadar sonra, ATR modunda fiyat yeterince geri
 * çekilince). Türetilmiş seriler `confirmedAt`'e göre doldurulur.
 *
 * Bu ayrım yapılmazsa backtest, o an bilinemeyecek bir zirveyi kullanır ve
 * sonuç sistematik olarak iyimser çıkar — CLAUDE.md'de "look-ahead bias"
 * diye geçen tuzak tam olarak budur.
 */

/** Salınım etiketi: önceki aynı tip noktaya göre HH/HL/LH/LL. */
function labelSwing(type, price, prevSameType) {
  if (!Number.isFinite(prevSameType)) return type === 'high' ? 'H' : 'L';
  if (type === 'high') return price > prevSameType ? 'HH' : 'LH';
  return price > prevSameType ? 'HL' : 'LL';
}

/**
 * Pivot (fraktal) yöntemi: bir bar, her iki yanındaki `lookback` bardan
 * yüksekse salınım zirvesidir. Onay `lookback` bar gecikir.
 */
function pivotSwings(candles, lookback) {
  const points = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let yuksekMi = true;
    let dusukMu = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) yuksekMi = false;
      if (candles[j].low <= candles[i].low) dusukMu = false;
      if (!yuksekMi && !dusukMu) break;
    }
    // Onay barı: sağdaki lookback bar tamamlandığında bilinir.
    if (yuksekMi) points.push({ index: i, type: 'high', price: candles[i].high, confirmedAt: i + lookback });
    if (dusukMu) points.push({ index: i, type: 'low', price: candles[i].low, confirmedAt: i + lookback });
  }
  return points.sort((a, b) => a.index - b.index);
}

/**
 * ATR yöntemi (ZigZag mantığı): uç noktadan `atrMultiple × ATR` kadar geri
 * çekilme olunca salınım onaylanır. Volatiliteye uyum sağladığı için farklı
 * fiyat seviyelerindeki varlıklarda aynı davranır — sabit yüzde eşiği bu
 * depoda iki kez soruna yol açmıştı.
 */
function atrSwings(candles, atrSeries, atrMultiple) {
  const points = [];
  if (!candles.length) return points;

  // Tepe ve dip adayları AYNI ANDA izlenir. Tek bir "uç fiyat" değişkeni
  // kullanmak, yön henüz belirlenmemişken her barda yüksek ve düşük arasında
  // gidip gelmesine yol açıyordu — yön hiç belirlenemiyor, eşik hiç
  // aşılamıyor ve gösterge sessizce sıfır nokta üretiyordu.
  // Tepe ve dip adayları ayrı izlenir. `null` = izleme henüz başlamadı;
  // bir pivot onaylandıktan sonra karşı uç ancak BİR SONRAKİ bardan itibaren
  // aday olabilir. Bu sentinel olmadan, pivot mevcut barda onaylandığında
  // karşı uç da aynı bara düşüyor ve aynı indekste hem zirve hem dip
  // oluşuyordu — "dalga" ölçümünü 0 bara indiren dejenere durum buydu.
  let maxIndex = 0;
  let maxPrice = candles[0].high;
  let minIndex = 0;
  let minPrice = candles[0].low;
  let bacak = 0; // 0 belirsiz, 1 yukarı bacak, -1 aşağı bacak

  for (let i = 1; i < candles.length; i++) {
    const atr = atrSeries[i];
    if (!Number.isFinite(atr) || atr <= 0) continue;
    const esik = atr * atrMultiple;
    const c = candles[i];

    // Askıdaki izlemeler bu bardan başlatılır.
    if (maxIndex === null) { maxIndex = i; maxPrice = c.high; }
    if (minIndex === null) { minIndex = i; minPrice = c.low; }

    if (c.high > maxPrice) { maxPrice = c.high; maxIndex = i; }
    if (c.low < minPrice) { minPrice = c.low; minIndex = i; }

    if (bacak >= 0 && maxIndex !== null && (maxPrice - c.low) >= esik) {
      points.push({ index: maxIndex, type: 'high', price: maxPrice, confirmedAt: i });
      bacak = -1;

      // Dip araması zirveden SONRAKİ barlarda yapılır.
      if (maxIndex + 1 <= i) {
        minIndex = maxIndex + 1;
        minPrice = candles[minIndex].low;
        for (let j = minIndex; j <= i; j++) {
          if (candles[j].low < minPrice) { minPrice = candles[j].low; minIndex = j; }
        }
      } else {
        minIndex = null; // zirve bu bardaydı: dip en erken sonraki barda
      }
      maxIndex = null;

    } else if (bacak <= 0 && minIndex !== null && (c.high - minPrice) >= esik) {
      points.push({ index: minIndex, type: 'low', price: minPrice, confirmedAt: i });
      bacak = 1;

      if (minIndex + 1 <= i) {
        maxIndex = minIndex + 1;
        maxPrice = candles[maxIndex].high;
        for (let j = maxIndex; j <= i; j++) {
          if (candles[j].high > maxPrice) { maxPrice = candles[j].high; maxIndex = j; }
        }
      } else {
        maxIndex = null;
      }
      minIndex = null;
    }
  }

  // Aynı tipin arka arkaya gelmesini önle (ZigZag tekil olmalı).
  const temiz = [];
  for (const p of points.sort((a, b) => a.index - b.index)) {
    const son = temiz[temiz.length - 1];
    if (son && son.type === p.type) {
      const dahaUc = p.type === 'high' ? (p.price > son.price) : (p.price < son.price);
      if (dahaUc) temiz[temiz.length - 1] = p;
      continue;
    }
    temiz.push(p);
  }
  return temiz;
}

register({
  key: 'swings',
  label: 'Salınım Noktaları',
  group: 'yapi',
  kind: 'events',
  outputs: ['points', 'lastHigh', 'lastLow', 'lastHighIndex', 'lastLowIndex'],
  // Bu dördü hizalı seri olmak zorunda; `points` olay listesi.
  seriesOutputs: ['lastHigh', 'lastLow', 'lastHighIndex', 'lastLowIndex'],
  params: {
    method: { type: 'enum', values: ['atr', 'pivot'], default: 'atr' },
    lookback: { type: 'number', default: 5, min: 1 },
    atrMultiple: { type: 'number', default: 2.0, min: 0.1 },
    atrPeriod: { type: 'number', default: 14, min: 1 }
  },
  warmup: (p) => (p.method === 'pivot' ? p.lookback * 2 + 1 : p.atrPeriod + 10),
  note: 'Seriler ONAY barından itibaren doldurulur — salınımın oluştuğu bardan değil. İleriye bakmayı önleyen şey budur.',
  compute: (candles, p, ctx) => {
    const n = candles.length;

    let points;
    if (p.method === 'pivot') {
      points = pivotSwings(candles, Math.max(1, Math.floor(p.lookback)));
    } else {
      const atr = ctx.computeOne('atr', { period: p.atrPeriod }).value;
      points = atrSwings(candles, atr, p.atrMultiple);
    }

    // Etiketleme (HH/HL/LH/LL)
    let sonZirve = null;
    let sonDip = null;
    for (const pt of points) {
      if (pt.type === 'high') {
        pt.label = labelSwing('high', pt.price, sonZirve);
        sonZirve = pt.price;
      } else {
        pt.label = labelSwing('low', pt.price, sonDip);
        sonDip = pt.price;
      }
      pt.time = candles[pt.index] ? candles[pt.index].time : null;
    }

    // Türetilmiş seriler: her barda, O BARA KADAR ONAYLANMIŞ son salınım.
    const lastHigh = new Array(n).fill(null);
    const lastLow = new Array(n).fill(null);
    const lastHighIndex = new Array(n).fill(null);
    const lastLowIndex = new Array(n).fill(null);

    const zirveler = points.filter(x => x.type === 'high').sort((a, b) => a.confirmedAt - b.confirmedAt);
    const dipler = points.filter(x => x.type === 'low').sort((a, b) => a.confirmedAt - b.confirmedAt);

    let zi = 0;
    let di = 0;
    let aktifZirve = null;
    let aktifDip = null;

    for (let i = 0; i < n; i++) {
      while (zi < zirveler.length && zirveler[zi].confirmedAt <= i) { aktifZirve = zirveler[zi]; zi++; }
      while (di < dipler.length && dipler[di].confirmedAt <= i) { aktifDip = dipler[di]; di++; }

      if (aktifZirve) { lastHigh[i] = aktifZirve.price; lastHighIndex[i] = aktifZirve.index; }
      if (aktifDip) { lastLow[i] = aktifDip.price; lastLowIndex[i] = aktifDip.index; }
    }

    return {
      points,
      lastHigh: clean(lastHigh, n),
      lastLow: clean(lastLow, n),
      lastHighIndex: clean(lastHighIndex, n),
      lastLowIndex: clean(lastLowIndex, n)
    };
  }
});

/**
 * Yapı durumu: BOS ve CHoCH.
 *
 * Tanımlar (ICT/SMC yaygın kullanımı, hepsi ayarlanabilir):
 *   Boğa yapısında  → son salınım ZİRVESİ kırılırsa  BOS  (devam)
 *                   → son salınım DİBİ kırılırsa     CHoCH (dönüş, ayıya geçer)
 *   Ayı yapısında   → son salınım DİBİ kırılırsa     BOS  (devam)
 *                   → son salınım ZİRVESİ kırılırsa  CHoCH (dönüş, boğaya geçer)
 *
 * `useClose` açıkken kırılım kapanışla doğrulanır (varsayılan) — fitil
 * kırılımları likidite süpürmesidir, yapı kırılımı değil. Bu ayrım
 * `liquidity_sweep` göstergesinin de temeli olacak.
 */
register({
  key: 'structure_state',
  label: 'Yapı Durumu (BOS/CHoCH)',
  group: 'yapi',
  kind: 'events',
  outputs: ['state', 'bos', 'choch', 'events'],
  seriesOutputs: ['state', 'bos', 'choch'],
  // bos/choch olay işaretçisi: yalnızca kırılım barlarında değer taşır.
  sparseOutputs: ['bos', 'choch'],
  dependsOn: ['swings'],
  params: {
    method: { type: 'enum', values: ['atr', 'pivot'], default: 'atr' },
    lookback: { type: 'number', default: 5, min: 1 },
    atrMultiple: { type: 'number', default: 2.0, min: 0.1 },
    atrPeriod: { type: 'number', default: 14, min: 1 },
    useClose: { type: 'boolean', default: true }
  },
  warmup: (p) => (p.method === 'pivot' ? p.lookback * 4 : p.atrPeriod + 30),
  note: 'state: 1 boğa, -1 ayı, 0 belirsiz. bos/choch serileri olay barında 1/-1 taşır, diğer barlarda null.',
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const sw = ctx.computeOne('swings', {
      method: p.method, lookback: p.lookback, atrMultiple: p.atrMultiple, atrPeriod: p.atrPeriod
    });

    const state = new Array(n).fill(null);
    const bos = new Array(n).fill(null);
    const choch = new Array(n).fill(null);
    const events = [];

    let durum = 0;
    // Kırılan seviye tekrar tekrar tetiklenmesin diye son kullanılan seviyeler tutulur.
    let kirilanZirve = null;
    let kirilanDip = null;

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const ustSeviye = sw.lastHigh[i];
      const altSeviye = sw.lastLow[i];

      const ustFiyat = p.useClose ? c.close : c.high;
      const altFiyat = p.useClose ? c.close : c.low;

      const ustKirildi = Number.isFinite(ustSeviye) && ustFiyat > ustSeviye && kirilanZirve !== ustSeviye;
      const altKirildi = Number.isFinite(altSeviye) && altFiyat < altSeviye && kirilanDip !== altSeviye;

      if (ustKirildi) {
        kirilanZirve = ustSeviye;
        if (durum === 1) {
          bos[i] = 1;
          events.push({ index: i, time: c.time, type: 'BOS', direction: 'bullish', level: ustSeviye });
        } else {
          // Ayıdan veya belirsizden boğaya geçiş
          const tip = durum === -1 ? 'CHoCH' : 'BOS';
          if (tip === 'CHoCH') choch[i] = 1; else bos[i] = 1;
          events.push({ index: i, time: c.time, type: tip, direction: 'bullish', level: ustSeviye });
          durum = 1;
        }
      } else if (altKirildi) {
        kirilanDip = altSeviye;
        if (durum === -1) {
          bos[i] = -1;
          events.push({ index: i, time: c.time, type: 'BOS', direction: 'bearish', level: altSeviye });
        } else {
          const tip = durum === 1 ? 'CHoCH' : 'BOS';
          if (tip === 'CHoCH') choch[i] = -1; else bos[i] = -1;
          events.push({ index: i, time: c.time, type: tip, direction: 'bearish', level: altSeviye });
          durum = -1;
        }
      }

      state[i] = durum;
    }

    return { state: clean(state, n), bos: clean(bos, n), choch: clean(choch, n), events };
  }
});
