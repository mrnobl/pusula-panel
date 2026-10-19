const { register } = require('../registry');
const { clean } = require('../contract');

/**
 * SMT Divergence (Smart Money Technique).
 *
 * Fikir: birlikte hareket etmesi beklenen iki varlıktan biri yeni zirve
 * yaparken diğeri yapamıyorsa, hareket "gerçek" değildir — biri likidite
 * almaya gitmiş, diğeri gidememiştir. ICT'de bu, dönüşün en erken
 * işaretlerinden biri sayılır.
 *
 * BU GÖSTERGE KORELASYONA BAĞLIDIR — ve bu bir süs değil, tanımın parçası:
 * "birlikte hareket etmesi beklenen" şartı sağlanmadan uyuşmazlık bilgi
 * taşımaz. TRX ile BTC'nin salınımları zaten korele değil (ölçüldü: 0.29),
 * aralarındaki her ayrışma gürültüdür. `minCorrelation` bu kapıyı tutar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * İLERİYE BAKMA
 * ─────────────────────────────────────────────────────────────────────────
 * Uyuşmazlık iki salınımın KARŞILAŞTIRILMASIDIR ve ancak ikisi de onaylandığı
 * barda bilinir. Referansın zirvesi 40. barda oluşup 47'de onaylanıyor, eşin
 * zirvesi 42'de oluşup 45'te onaylanıyorsa olay 47. bara yazılır — 40'a değil.
 * Bu ayrım yapılmazsa gösterge "dönüşü tepe noktasında haber veren" bir şeye
 * benzer ve backtest inanılmaz görünür.
 */

/** Bir salınım listesini onay sırasına göre indeksler. */
function sonOnaylanan(points, tip, barIndex) {
  let son = null;
  for (const p of points) {
    if (p.type !== tip) continue;
    if (p.confirmedAt > barIndex) continue;
    if (!son || p.confirmedAt > son.confirmedAt) son = p;
  }
  return son;
}

register({
  key: 'smt_divergence',
  label: 'SMT Uyuşmazlığı',
  group: 'coklu',
  kind: 'events',
  multi: true,
  outputs: ['events', 'bullish', 'bearish', 'divergenceCount', 'barsSince', 'peers', 'info'],
  seriesOutputs: ['bullish', 'bearish', 'divergenceCount', 'barsSince'],
  sparseOutputs: ['bullish', 'bearish', 'barsSince'],
  dependsOn: ['swings', 'correlation_rolling'],
  params: {
    base: { type: 'string', default: null },
    swingMethod: { type: 'enum', values: ['atr', 'pivot'], default: 'atr' },
    swingAtrMultiple: { type: 'number', default: 2.0, min: 0.1 },
    swingLookback: { type: 'number', default: 5, min: 1 },
    atrPeriod: { type: 'number', default: 14, min: 1 },
    // Korelasyon kapısı: bu eşiğin altındaki eşte uyuşmazlık aranmaz.
    minCorrelation: { type: 'number', default: 0.5, min: -1, max: 1 },
    correlationPeriod: { type: 'number', default: 100, min: 10 },
    // İki salınımın "aynı salınım" sayılması için indeks yakınlığı.
    maxPairingBars: { type: 'number', default: 10, min: 1 },
    // Uyuşmazlığın anlamlı sayılması için gereken en küçük fark (yüzde).
    minDivergencePct: { type: 'number', default: 0.1, min: 0 }
  },
  warmup: (p) => Math.max(p.correlationPeriod, p.atrPeriod + 30),
  note: 'Olay, İKİ salınımın da onaylandığı barda doğar. `bullish`: referans daha düşük dip yaparken eş yapamadı (satış tükenişi). `bearish`: referans daha yüksek zirve yaparken eş yapamadı.',
  compute: (aligned, p, times) => {
    const semboller = Object.keys(aligned);
    const baz = (p.base && semboller.includes(p.base)) ? p.base : semboller[0];
    const n = times ? times.length : (baz ? aligned[baz].length : 0);

    const bullish = new Array(n).fill(null);
    const bearish = new Array(n).fill(null);
    const divergenceCount = new Array(n).fill(null);
    const barsSince = new Array(n).fill(null);
    const events = [];
    // `peers`, `pairs` DEĞİL: havuzda `pairs` "sembol → hizalı seri" demek
    // (correlation_rolling, beta_rolling) ve selftest bunu şart koşuyor.
    // Buradaki eş başına SAYAÇ özeti, o sözleşmeyi taşımıyor.
    const peers = {};

    const digerler = semboller.filter(s => s !== baz);
    if (!baz || !digerler.length) {
      return {
        events,
        bullish: clean(bullish, n),
        bearish: clean(bearish, n),
        divergenceCount: clean(divergenceCount.fill(0), n),
        barsSince: clean(barsSince, n),
        peers,
        info: { base: baz, pairCount: 0, symbols: semboller }
      };
    }

    // Çok sembollü göstergeler havuzun tek sembollü önbelleğini kullanamaz
    // (girdi bir harita), o yüzden salınımlar burada doğrudan hesaplanır.
    const pool = require('../index');
    const swingParams = {
      method: p.swingMethod,
      atrMultiple: p.swingAtrMultiple,
      lookback: p.swingLookback,
      atrPeriod: p.atrPeriod
    };

    const salinimlar = {};
    for (const sym of semboller) {
      salinimlar[sym] = pool.computeOne(aligned[sym], 'swings', swingParams).points;
    }

    // Korelasyon kapısı: eş, referansla yeterince birlikte hareket ediyor mu?
    const kor = pool.computeMulti(aligned, [{
      key: 'correlation_rolling',
      params: { base: baz, period: p.correlationPeriod }
    }], { dropNonOverlapping: false }).correlation_rolling;

    const bazNoktalar = salinimlar[baz];

    for (const es of digerler) {
      peers[es] = { bullish: 0, bearish: 0, blockedByCorrelation: 0 };

      for (const bp of bazNoktalar) {
        // Referans salınımı bu barda onaylandı; eşin AYNI salınımı da
        // onaylanmış olmalı — olay ikisinin GEÇ olanında bilinir.
        const onceki = sonOnaylanan(bazNoktalar, bp.type, bp.confirmedAt - 1);
        if (!onceki) continue;

        // Eşteki karşılık: indeksçe en yakın aynı tip salınım.
        const adaylar = salinimlar[es].filter(x => x.type === bp.type && Math.abs(x.index - bp.index) <= p.maxPairingBars);
        if (!adaylar.length) continue;
        const esSon = adaylar.reduce((a, b) => (Math.abs(a.index - bp.index) <= Math.abs(b.index - bp.index) ? a : b));

        const esOncekiAdaylar = salinimlar[es].filter(x =>
          x.type === bp.type && Math.abs(x.index - onceki.index) <= p.maxPairingBars);
        if (!esOncekiAdaylar.length) continue;
        const esOnceki = esOncekiAdaylar.reduce((a, b) => (Math.abs(a.index - onceki.index) <= Math.abs(b.index - onceki.index) ? a : b));
        if (esSon.index === esOnceki.index) continue;

        // Olay barı: dört salınımın en geç ONAYLANANI.
        const onayBar = Math.max(bp.confirmedAt, onceki.confirmedAt, esSon.confirmedAt, esOnceki.confirmedAt);
        if (!(onayBar >= 0 && onayBar < n)) continue;

        const korDeger = kor.pairs[es] ? kor.pairs[es][onayBar] : null;
        if (!Number.isFinite(korDeger) || korDeger < p.minCorrelation) {
          peers[es].blockedByCorrelation++;
          continue;
        }

        // Yönler: referans yeni uç yaptı mı, eş yaptı mı?
        const bazFark = (bp.price - onceki.price) / onceki.price * 100;
        const esFark = (esSon.price - esOnceki.price) / esOnceki.price * 100;
        if (Math.abs(bazFark - esFark) < p.minDivergencePct) continue;

        let yon = null;
        if (bp.type === 'high') {
          // Ayı SMT: referans daha yüksek zirve, eş daha düşük zirve.
          if (bazFark > 0 && esFark < 0) yon = 'bearish';
          else if (bazFark < 0 && esFark > 0) yon = 'bearish';
        } else {
          // Boğa SMT: referans daha düşük dip, eş daha yüksek dip.
          if (bazFark < 0 && esFark > 0) yon = 'bullish';
          else if (bazFark > 0 && esFark < 0) yon = 'bullish';
        }
        if (!yon) continue;

        events.push({
          index: bp.index,
          confirmedAt: onayBar,
          confirmDelay: onayBar - bp.index,
          time: times ? times[bp.index] : null,
          type: bp.type,
          direction: yon,
          base: baz,
          peer: es,
          basePrice: bp.price,
          basePrevPrice: onceki.price,
          peerPrice: esSon.price,
          peerPrevPrice: esOnceki.price,
          baseChangePct: bazFark,
          peerChangePct: esFark,
          gapPct: bazFark - esFark,
          correlation: korDeger
        });
        peers[es][yon]++;
      }
    }

    // Aynı bar + aynı yön + aynı eş iki kez yazılmasın.
    const gorulen = new Set();
    const tekil = [];
    for (const ev of events.sort((a, b) => a.confirmedAt - b.confirmedAt)) {
      const anahtar = `${ev.confirmedAt}|${ev.peer}|${ev.direction}`;
      if (gorulen.has(anahtar)) continue;
      gorulen.add(anahtar);
      tekil.push(ev);
    }

    let ei = 0;
    let sayac = 0;
    let sonOnay = null;
    for (let i = 0; i < n; i++) {
      while (ei < tekil.length && tekil[ei].confirmedAt <= i) {
        const ev = tekil[ei];
        ei++;
        sayac++;
        sonOnay = ev.confirmedAt;
        if (ev.direction === 'bullish') bullish[ev.confirmedAt] = 1;
        else bearish[ev.confirmedAt] = 1;
      }
      divergenceCount[i] = sayac;
      barsSince[i] = sonOnay === null ? null : i - sonOnay;
    }

    return {
      events: tekil,
      bullish: clean(bullish, n),
      bearish: clean(bearish, n),
      divergenceCount: clean(divergenceCount, n),
      barsSince: clean(barsSince, n),
      peers,
      info: { base: baz, pairCount: digerler.length, symbols: semboller, minCorrelation: p.minCorrelation }
    };
  }
});
