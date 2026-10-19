const { register } = require('../registry');
const { clean } = require('../contract');

/**
 * Likidite havuzları (EQH/EQL) ve likidite süpürmesi.
 *
 * Havuzdaki yapı göstergelerinin AMACI bunlar. `structure_state`'te fitil ile
 * kapanış ayrımı boşuna yapılmadı: fitille aşılıp kapanışla geri alınan bir
 * seviye yapı kırılımı değil, orada duran stopların toplanmasıdır. O ayrımın
 * karşılığı bu dosyada.
 *
 * TANIMLAR
 *   Likidite havuzu — aynı fiyat civarında birden çok salınım noktası.
 *     Eşit zirveler (EQH) → ÜSTLERİNDE alım stopları durur = buy-side likidite
 *     Eşit dipler  (EQL) → ALTLARINDA satım stopları durur = sell-side likidite
 *
 *   Süpürme — fiyatın havuzu fitille aşıp kapanışla geri dönmesi. Buy-side
 *     süpürülürse sonuç AYI yönlüdür (yukarıdaki stoplar toplandı, fiyat
 *     reddedildi); sell-side süpürülürse BOĞA yönlüdür.
 *
 * NEDEN İKİSİ AYRI GÖSTERGE: havuz, süpürme olmadan da bilgidir — fiyatın
 * nereye çekileceğini söyleyen bir hedeftir. Süpürme ise havuzun tüketildiği
 * andır. Birini diğerinin içine gömmek, "hedef" ile "tetik"i tek çıktıya
 * karıştırırdı.
 *
 * İLERİYE BAKMA: havuz, İKİNCİ salınım noktası ONAYLANDIĞINDA bilinir —
 * noktaların oluştuğu barda değil. Süpürme ise kapanışın geri döndüğü barda
 * bilinir, fitilin uzadığı barda değil. `points[].confirmedAt` bu yüzden
 * raporda taşınır: `liquidity_sweep` seviyeyi bardan bara YENİDEN kurar,
 * havuzun nihai seviyesini geçmişe uygulamaz.
 */

/** Havuzun `i`. barda geçerli seviyesi için zaman çizelgesi. */
function seviyeCizelgesi(havuz, minPoints) {
  const pts = havuz.points.slice().sort((a, b) => a.confirmedAt - b.confirmedAt);
  const segmentler = [];
  let uc = null;
  for (let k = 0; k < pts.length; k++) {
    uc = uc === null
      ? pts[k].price
      : (havuz.side === 'buy' ? Math.max(uc, pts[k].price) : Math.min(uc, pts[k].price));
    if (k + 1 >= minPoints) segmentler.push({ from: pts[k].confirmedAt, level: uc });
  }
  return segmentler;
}

register({
  key: 'liquidity_pools',
  label: 'Likidite Havuzları (EQH/EQL)',
  group: 'ict',
  kind: 'zones',
  outputs: [
    'pools',
    'activeBuySide', 'activeSellSide',
    'nearestBuySide', 'nearestSellSide',
    'buySideDistanceAtr', 'sellSideDistanceAtr'
  ],
  seriesOutputs: [
    'activeBuySide', 'activeSellSide',
    'nearestBuySide', 'nearestSellSide',
    'buySideDistanceAtr', 'sellSideDistanceAtr'
  ],
  // Fiyatın üstünde/altında havuz olmayabilir; bu ısınma eksikliği değil,
  // o barın gerçeğidir. Sayaçlar ise ısınmadan sonra hep doludur.
  sparseOutputs: ['nearestBuySide', 'nearestSellSide', 'buySideDistanceAtr', 'sellSideDistanceAtr'],
  dependsOn: ['swings', 'atr'],
  params: {
    swingMethod: { type: 'enum', values: ['atr', 'pivot'], default: 'atr' },
    swingAtrMultiple: { type: 'number', default: 2.0, min: 0.1 },
    swingLookback: { type: 'number', default: 5, min: 1 },
    atrPeriod: { type: 'number', default: 14, min: 1 },
    // "Eşit" ne kadar eşit: bu kadar ATR içindeki noktalar aynı havuzdur.
    // `sr_zones`'un 0.5'inden çok daha dar olmalı — orada amaç bölge kurmak,
    // burada amaç stopların GERÇEKTEN aynı yerde durduğu fiyatı bulmak.
    tolAtr: { type: 'number', default: 0.15, min: 0.01 },
    minPoints: { type: 'number', default: 2, min: 2 },
    // Birbirinden çok uzak iki zirve "eşit zirve" değildir; aralarında fiyat
    // çoktan başka yerlere gitmiştir.
    maxSpanBars: { type: 'number', default: 200, min: 0 },
    // Uzun süre büyümeyen havuz bayatlar (sr_zones'taki maxIdleBars ile aynı
    // gerekçe: aktif havuz sayısı sınırsız büyürse "en yakın hedef" gürültü olur).
    maxIdleBars: { type: 'number', default: 300, min: 10 }
  },
  warmup: (p) => Math.max(p.atrPeriod + 10, 60),
  note: 'Havuz İKİNCİ nokta onaylandığında doğar. Fiyat seviyeyi fitille aşarsa havuz ALINMIŞ sayılır (takenAt) ve seriden düşer — ama raporda kalır: `liquidity_sweep` alınmış havuzları görmek zorunda (order_block ile aynı ilke).',
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const atr = ctx.computeOne('atr', { period: p.atrPeriod }).value;
    const sw = ctx.computeOne('swings', {
      method: p.swingMethod,
      atrMultiple: p.swingAtrMultiple,
      lookback: p.swingLookback,
      atrPeriod: p.atrPeriod
    });

    const minNokta = Math.max(2, Math.floor(p.minPoints));
    const noktalar = sw.points.slice().sort((a, b) => a.confirmedAt - b.confirmedAt);
    let np = 0;

    const havuzlar = [];
    let sonrakiId = 1;

    const activeBuySide = new Array(n).fill(null);
    const activeSellSide = new Array(n).fill(null);
    const nearestBuySide = new Array(n).fill(null);
    const nearestSellSide = new Array(n).fill(null);
    const buySideDistanceAtr = new Array(n).fill(null);
    const sellSideDistanceAtr = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const a = atr[i];
      if (!Number.isFinite(a) || a <= 0) continue;

      const tolerans = a * p.tolAtr;

      // 1) Bu barda ONAYLANAN salınım noktalarını havuzlara işle.
      while (np < noktalar.length && noktalar[np].confirmedAt <= i) {
        const pt = noktalar[np];
        np++;
        const taraf = pt.type === 'high' ? 'buy' : 'sell';

        // En yakın uygun havuza katılır. `find` ile ilk eşleşmeyi almak,
        // iki havuz arasında kalan bir noktayı yanlış tarafa yazabilirdi.
        let aday = null;
        let adayFark = Infinity;
        for (const h of havuzlar) {
          if (h.side !== taraf || h.takenAt !== null) continue;
          if (p.maxSpanBars > 0 && (pt.index - h.firstIndex) > p.maxSpanBars) continue;
          const fark = Math.abs(h.level - pt.price);
          if (fark <= tolerans && fark < adayFark) { aday = h; adayFark = fark; }
        }

        const uye = { index: pt.index, price: pt.price, confirmedAt: pt.confirmedAt, time: pt.time };

        if (aday) {
          aday.points.push(uye);
          aday.level = taraf === 'buy' ? Math.max(aday.level, pt.price) : Math.min(aday.level, pt.price);
          aday.high = Math.max(aday.high, pt.price);
          aday.low = Math.min(aday.low, pt.price);
          aday.lastIndex = pt.index;
          aday.lastAddedAt = i;
          // Havuz, minNokta'ya ULAŞTIĞI barda bilinir hale gelir.
          if (aday.points.length === minNokta) {
            aday.createdAt = i;
            aday.createAtr = a;
          }
        } else {
          havuzlar.push({
            id: sonrakiId++,
            side: taraf,
            level: pt.price,
            high: pt.price,
            low: pt.price,
            points: [uye],
            firstIndex: pt.index,
            lastIndex: pt.index,
            lastAddedAt: i,
            createdAt: minNokta <= 1 ? i : null,
            createAtr: a,
            takenAt: null
          });
        }
      }

      // 2) Alınma: fiyat seviyeyi FİTİLLE aşarsa likidite tüketilmiştir.
      //    Kapanış aranmaz — stoplar fitille tetiklenir, kapanışı beklemez.
      for (const h of havuzlar) {
        if (h.takenAt !== null || h.createdAt === null || i < h.createdAt) continue;
        const asildi = h.side === 'buy' ? (c.high > h.level) : (c.low < h.level);
        if (asildi) h.takenAt = i;
      }

      // 3) Türetilmiş seriler — yalnızca bu bara kadar bilinen, alınmamış,
      //    bayatlamamış havuzlar.
      let buySayi = 0;
      let sellSayi = 0;
      let enYakinBuy = null;
      let enYakinSell = null;

      for (const h of havuzlar) {
        if (h.createdAt === null || i < h.createdAt) continue;
        if (h.takenAt !== null) continue;
        if ((i - h.lastAddedAt) > p.maxIdleBars) continue;

        if (h.side === 'buy') {
          buySayi++;
          if (h.level >= c.close && (enYakinBuy === null || h.level < enYakinBuy)) enYakinBuy = h.level;
        } else {
          sellSayi++;
          if (h.level <= c.close && (enYakinSell === null || h.level > enYakinSell)) enYakinSell = h.level;
        }
      }

      activeBuySide[i] = buySayi;
      activeSellSide[i] = sellSayi;
      nearestBuySide[i] = enYakinBuy;
      nearestSellSide[i] = enYakinSell;
      buySideDistanceAtr[i] = enYakinBuy !== null ? (enYakinBuy - c.close) / a : null;
      sellSideDistanceAtr[i] = enYakinSell !== null ? (c.close - enYakinSell) / a : null;
    }

    const sonIndex = n - 1;
    // TÜM havuzlar raporlanır (alınmış olanlar dahil): süpürme göstergesi
    // tam olarak alınmış havuzlara bakar.
    const rapor = havuzlar
      .filter(h => h.createdAt !== null)
      .map(h => ({
        id: h.id,
        side: h.side,
        level: h.level,
        high: h.high,
        low: h.low,
        count: h.points.length,
        points: h.points,
        firstIndex: h.firstIndex,
        lastIndex: h.lastIndex,
        createdAt: h.createdAt,
        createdTime: candles[h.createdAt] ? candles[h.createdAt].time : null,
        lastAddedAt: h.lastAddedAt,
        takenAt: h.takenAt,
        active: h.takenAt === null && (sonIndex - h.lastAddedAt) <= p.maxIdleBars,
        spanBars: h.lastIndex - h.firstIndex,
        ageBars: sonIndex - h.createdAt,
        // Havuzun ne kadar "eşit" olduğu — 0'a yakın = kusursuz EQH/EQL.
        spreadAtr: h.createAtr > 0 ? (h.high - h.low) / h.createAtr : null
      }))
      .sort((a, b) => b.createdAt - a.createdAt);

    return {
      pools: rapor,
      activeBuySide: clean(activeBuySide, n),
      activeSellSide: clean(activeSellSide, n),
      nearestBuySide: clean(nearestBuySide, n),
      nearestSellSide: clean(nearestSellSide, n),
      buySideDistanceAtr: clean(buySideDistanceAtr, n),
      sellSideDistanceAtr: clean(sellSideDistanceAtr, n)
    };
  }
});

/**
 * Likidite süpürmesi (stop avı / liquidity grab).
 *
 * AŞAMALAR
 *   1. DELME   — fiyat likidite seviyesini fitille aşar (bar `index`)
 *   2. GERİ DÖNÜŞ — kapanış seviyenin içine döner (bar `confirmedAt`)
 *   3. Süpürme burada BİLİNİR; öncesinde bilinemez, çünkü fitilin uzadığı
 *      anda bunun kabul mü red mi olacağı belli değildir.
 *
 * KABUL İLE REDDİN AYRIMI bu göstergenin tamamıdır. Aynı fitil:
 *   kapanış geri döndüyse → süpürme (ters yön sinyali)
 *   kapanış ötede kaldıysa → gerçek kırılım (`structure_state` işi)
 * `acceptAtr` bu sınırı çizer: kapanış seviyenin bu kadar ATR ötesine geçerse
 * bekleyen delme iptal edilir, süpürme sayılmaz.
 *
 * `confirmWithin` çok barlı yanlış kırılımlara izin verir (0 = yalnızca aynı
 * bar, en katı ICT okuması).
 */
register({
  key: 'liquidity_sweep',
  label: 'Likidite Süpürmesi',
  group: 'ict',
  kind: 'events',
  outputs: ['events', 'bullish', 'bearish', 'penetrationAtr', 'sweepCount', 'barsSince', 'lastLevel'],
  seriesOutputs: ['bullish', 'bearish', 'penetrationAtr', 'sweepCount', 'barsSince', 'lastLevel'],
  // Olay işaretçileri; `sweepCount` sürekli (0'dan başlar), `barsSince` ilk
  // süpürmeden önce yoktur.
  sparseOutputs: ['bullish', 'bearish', 'penetrationAtr', 'barsSince', 'lastLevel'],
  dependsOn: ['liquidity_pools', 'swings', 'atr'],
  params: {
    // Hangi seviyeler likidite sayılır: havuzlar (EQH/EQL), tekil salınımlar,
    // ya da ikisi. Tekil salınım da likidittir — çift dip aramaya gerek yok.
    source: { type: 'enum', values: ['pools', 'swings', 'both'], default: 'both' },
    atrPeriod: { type: 'number', default: 14, min: 1 },
    swingMethod: { type: 'enum', values: ['atr', 'pivot'], default: 'atr' },
    swingAtrMultiple: { type: 'number', default: 2.0, min: 0.1 },
    swingLookback: { type: 'number', default: 5, min: 1 },
    tolAtr: { type: 'number', default: 0.15, min: 0.01 },
    minPoints: { type: 'number', default: 2, min: 2 },
    maxSpanBars: { type: 'number', default: 200, min: 0 },
    maxIdleBars: { type: 'number', default: 300, min: 10 },
    // Geri dönüş kaç bar içinde olmalı. 0 = aynı barda kapanış geri dönmeli.
    confirmWithin: { type: 'number', default: 1, min: 0 },
    // Kapanış seviyenin bu kadar ATR ötesine geçerse artık süpürme değil,
    // kabul edilmiş kırılımdır.
    acceptAtr: { type: 'number', default: 0.5, min: 0 },
    // Çok sığ delmeler gürültüdür (seviyeye değip geçen fitil).
    minPenetrationAtr: { type: 'number', default: 0.05, min: 0 },
    // Çok derin delme süpürme değil, geri çekilmeli bir kırılımdır.
    maxPenetrationAtr: { type: 'number', default: 3.0, min: 0.1 }
  },
  warmup: (p) => Math.max(p.atrPeriod + 10, 60) + p.confirmWithin,
  note: 'Süpürme, kapanışın GERİ DÖNDÜĞÜ barda bilinir. `bullish` sell-side süpürmesini (dipler alındı → yukarı red), `bearish` buy-side süpürmesini işaretler.',
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const atr = ctx.computeOne('atr', { period: p.atrPeriod }).value;

    const havuzKullan = p.source !== 'swings';
    const salinimKullan = p.source !== 'pools';

    const lp = havuzKullan ? ctx.computeOne('liquidity_pools', {
      swingMethod: p.swingMethod,
      swingAtrMultiple: p.swingAtrMultiple,
      swingLookback: p.swingLookback,
      atrPeriod: p.atrPeriod,
      tolAtr: p.tolAtr,
      minPoints: p.minPoints,
      maxSpanBars: p.maxSpanBars,
      maxIdleBars: p.maxIdleBars
    }) : null;

    const sw = salinimKullan ? ctx.computeOne('swings', {
      method: p.swingMethod,
      atrMultiple: p.swingAtrMultiple,
      lookback: p.swingLookback,
      atrPeriod: p.atrPeriod
    }) : null;

    const pencere = Math.max(0, Math.floor(p.confirmWithin));

    // ── 1) DELME olaylarını topla ────────────────────────────────────────
    // Her kayıt: { index, side, level, kaynak, poolId }
    const delmeler = [];

    if (lp) {
      for (const h of lp.pools) {
        if (h.takenAt === null) continue;             // henüz alınmamış havuz
        const segmentler = seviyeCizelgesi(h, Math.max(2, Math.floor(p.minPoints)));
        let seviye = null;
        for (const s of segmentler) {
          if (s.from <= h.takenAt) seviye = s.level; else break;
        }
        if (seviye === null) continue;
        delmeler.push({
          index: h.takenAt,
          side: h.side,
          level: seviye,
          kaynak: 'pool',
          poolId: h.id,
          poolCount: h.count
        });
      }
    }

    if (sw) {
      // Tekil salınım seviyeleri: aynı seviye tekrar tekrar tetiklenmesin diye
      // en son delinen değer tutulur (`structure_state`'teki ile aynı çözüm).
      let delinenZirve = null;
      let delinenDip = null;
      for (let i = 0; i < n; i++) {
        const c = candles[i];
        const ust = sw.lastHigh[i];
        const alt = sw.lastLow[i];
        if (Number.isFinite(ust) && c.high > ust && delinenZirve !== ust) {
          delinenZirve = ust;
          delmeler.push({ index: i, side: 'buy', level: ust, kaynak: 'swing', poolId: null, poolCount: 1 });
        }
        if (Number.isFinite(alt) && c.low < alt && delinenDip !== alt) {
          delinenDip = alt;
          delmeler.push({ index: i, side: 'sell', level: alt, kaynak: 'swing', poolId: null, poolCount: 1 });
        }
      }
    }

    // Aynı bar + aynı taraf iki kez sayılmasın; havuz kaynağı tercih edilir
    // (daha zengin bilgi taşır: kaç noktalı havuz olduğu).
    const tekil = new Map();
    for (const d of delmeler) {
      const anahtar = `${d.index}|${d.side}`;
      const mevcut = tekil.get(anahtar);
      if (!mevcut || (mevcut.kaynak === 'swing' && d.kaynak === 'pool')) tekil.set(anahtar, d);
    }
    const sirali = Array.from(tekil.values()).sort((a, b) => a.index - b.index);

    // ── 2) Her delmeyi geri dönüş penceresinde sına ──────────────────────
    const events = [];

    for (const d of sirali) {
      const a0 = atr[d.index];
      if (!Number.isFinite(a0) || a0 <= 0) continue;

      let enDerin = 0;
      let onay = null;
      let iptal = false;

      for (let j = d.index; j <= Math.min(n - 1, d.index + pencere); j++) {
        const c = candles[j];
        const derinlik = d.side === 'buy' ? (c.high - d.level) : (d.level - c.low);
        if (derinlik > enDerin) enDerin = derinlik;

        // Kabul: kapanış seviyenin belirgin ötesinde → kırılım, süpürme değil.
        const kabulSiniri = a0 * p.acceptAtr;
        const kabul = d.side === 'buy'
          ? (c.close > d.level + kabulSiniri)
          : (c.close < d.level - kabulSiniri);
        if (kabul) { iptal = true; break; }

        // Geri dönüş: kapanış seviyenin içine döndü.
        const geriDondu = d.side === 'buy' ? (c.close < d.level) : (c.close > d.level);
        if (geriDondu) { onay = j; break; }
      }

      if (iptal || onay === null) continue;

      const derinlikAtr = enDerin / a0;
      if (derinlikAtr < p.minPenetrationAtr) continue;
      if (derinlikAtr > p.maxPenetrationAtr) continue;

      events.push({
        index: d.index,                 // fitilin seviyeyi aştığı bar
        time: candles[d.index].time,
        confirmedAt: onay,              // kapanışın geri döndüğü bar — burada bilinir
        confirmDelay: onay - d.index,
        side: d.side,                   // hangi likidite alındı
        direction: d.side === 'buy' ? 'bearish' : 'bullish',
        level: d.level,
        penetrationAtr: derinlikAtr,
        source: d.kaynak,
        poolId: d.poolId,
        poolCount: d.poolCount
      });
    }

    events.sort((a, b) => a.confirmedAt - b.confirmedAt);

    // ── 3) Seriler — hepsi ONAY barından itibaren ────────────────────────
    const bullish = new Array(n).fill(null);
    const bearish = new Array(n).fill(null);
    const penetrationAtr = new Array(n).fill(null);
    const sweepCount = new Array(n).fill(null);
    const barsSince = new Array(n).fill(null);
    const lastLevel = new Array(n).fill(null);

    let ei = 0;
    let sayac = 0;
    let sonOnay = null;
    let sonSeviye = null;

    for (let i = 0; i < n; i++) {
      while (ei < events.length && events[ei].confirmedAt <= i) {
        const ev = events[ei];
        ei++;
        sayac++;
        sonOnay = ev.confirmedAt;
        sonSeviye = ev.level;
        if (ev.direction === 'bullish') bullish[ev.confirmedAt] = 1;
        else bearish[ev.confirmedAt] = 1;
        // Aynı barda iki olay varsa daha derin olan raporlanır.
        const mevcut = penetrationAtr[ev.confirmedAt];
        if (mevcut === null || ev.penetrationAtr > mevcut) penetrationAtr[ev.confirmedAt] = ev.penetrationAtr;
      }

      sweepCount[i] = sayac;
      barsSince[i] = sonOnay === null ? null : (i - sonOnay);
      lastLevel[i] = sonSeviye;
    }

    return {
      events,
      bullish: clean(bullish, n),
      bearish: clean(bearish, n),
      penetrationAtr: clean(penetrationAtr, n),
      sweepCount: clean(sweepCount, n),
      barsSince: clean(barsSince, n),
      lastLevel: clean(lastLevel, n)
    };
  }
});
