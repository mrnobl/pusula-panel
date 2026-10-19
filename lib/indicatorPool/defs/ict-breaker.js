const { register } = require('../registry');
const { clean } = require('../contract');

/**
 * Breaker Block ve Mitigation Block — ikisi de order block'un durumları.
 *
 * ICT kaynakları bu iki terimde özellikle bölünmüş. Burada seçilen tanımlar
 * açıkça yazılı ve parametreyle değiştirilebilir; amaç "doğru tanım" tartışması
 * yerine "bu parametreyi değiştir" tartışması olabilmesi.
 *
 * BREAKER BLOCK — BAŞARISIZ olmuş order block:
 *   1. OB oluşur
 *   2. Fiyat OB'yi ihlal eder (karşı kenarın ötesinde kapanış)
 *   3. (opsiyonel) İhlal yönünde yapı kırılımı teyit eder
 *   4. Bölge YÖN DEĞİŞTİREREK çalışmaya devam eder
 *   Boğa OB kırılırsa → ayı breaker (direnç)
 *
 * MITIGATION BLOCK — test edilmiş ama HÂLÂ AYAKTA order block:
 *   Fiyat bölgeye geri dönmüş, dengesizliği kısmen kapatmış, ama karşı kenarı
 *   geçmemiştir. Breaker'ın tersi: biri başarısız, diğeri sınanıp tutmuş.
 *   `penetration` bölgeye ne kadar girildiğini (0–1) verir.
 */

register({
  key: 'breaker_block',
  label: 'Breaker Block',
  group: 'ict',
  kind: 'zones',
  outputs: ['breakers', 'activeBullish', 'activeBearish', 'nearestBullish', 'nearestBearish', 'inBreaker'],
  seriesOutputs: ['activeBullish', 'activeBearish', 'nearestBullish', 'nearestBearish', 'inBreaker'],
  sparseOutputs: ['nearestBullish', 'nearestBearish'],
  dependsOn: ['order_block', 'structure_state'],
  params: {
    atrPeriod: { type: 'number', default: 14, min: 1 },
    dispAtrMultiple: { type: 'number', default: 1.5, min: 0.1 },
    obLookback: { type: 'number', default: 5, min: 1 },
    useBody: { type: 'boolean', default: false },
    // Yapı kırılımı teyidi: ihlalden sonra bu kadar bar içinde aynı yönde
    // BOS/CHoCH olmalı. 0 = teyit aranmaz (daha gevşek tanım).
    requireStructureWithin: { type: 'number', default: 10, min: 0 },
    swingMethod: { type: 'enum', values: ['atr', 'pivot'], default: 'atr' },
    swingAtrMultiple: { type: 'number', default: 2.0, min: 0.1 },
    maxAgeBars: { type: 'number', default: 300, min: 0 },
    maxActive: { type: 'number', default: 12, min: 1 }
  },
  warmup: (p) => p.atrPeriod + p.obLookback + 30,
  note: 'Breaker, OB\'nin İHLAL EDİLDİĞİ barda doğar — kendi barında değil. `requireStructureWithin` ile yapı teyidi istenebilir (0 = kapalı).',
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const ob = ctx.computeOne('order_block', {
      atrPeriod: p.atrPeriod,
      dispAtrMultiple: p.dispAtrMultiple,
      lookback: p.obLookback,
      useBody: p.useBody,
      mitigation: 'through'
    });

    const st = p.requireStructureWithin > 0
      ? ctx.computeOne('structure_state', { method: p.swingMethod, atrMultiple: p.swingAtrMultiple })
      : null;

    const breakers = [];

    for (const b of ob.blocks) {
      if (b.mitigatedAt === null) continue;   // ihlal edilmemiş, breaker değil

      // Yön ters çevrilir: kırılan boğa OB'si artık direnç.
      const yeniYon = b.direction === 'bullish' ? 'bearish' : 'bullish';

      // Yapı teyidi: ihlalden sonra aynı yönde bir kırılım olmalı.
      if (st) {
        const hedefYon = yeniYon === 'bullish' ? 1 : -1;
        let teyit = false;
        for (const ev of st.events) {
          if (ev.index < b.mitigatedAt) continue;
          if (ev.index > b.mitigatedAt + p.requireStructureWithin) break;
          if ((ev.direction === 'bullish' ? 1 : -1) === hedefYon) { teyit = true; break; }
        }
        if (!teyit) continue;
      }

      breakers.push({
        id: b.id,
        direction: yeniYon,
        sourceDirection: b.direction,
        low: b.low,
        high: b.high,
        sourceIndex: b.index,
        bornAt: b.mitigatedAt,        // ihlal barı — breaker burada bilinir
        touches: 0,
        invalidatedAt: null
      });
    }

    breakers.sort((a, b) => a.bornAt - b.bornAt);

    const activeBullish = new Array(n).fill(null);
    const activeBearish = new Array(n).fill(null);
    const nearestBullish = new Array(n).fill(null);
    const nearestBearish = new Array(n).fill(null);
    const inBreaker = new Array(n).fill(null);

    let bi = 0;
    const aktif = [];

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      while (bi < breakers.length && breakers[bi].bornAt <= i) { aktif.push(breakers[bi]); bi++; }

      let boga = 0;
      let ayi = 0;
      let enYakinBoga = null;
      let enYakinAyi = null;
      let icinde = 0;

      for (const z of aktif) {
        if (z.invalidatedAt !== null) continue;
        if (p.maxAgeBars > 0 && (i - z.bornAt) > p.maxAgeBars) { z.invalidatedAt = i; continue; }

        if (i > z.bornAt && c.low <= z.high && c.high >= z.low) { z.touches += 1; icinde = 1; }

        // Breaker da kırılabilir: yeni yönünün aksine kapanış onu bitirir.
        const kirildi = z.direction === 'bullish' ? (c.close < z.low) : (c.close > z.high);
        if (i > z.bornAt && kirildi) { z.invalidatedAt = i; continue; }

        if (z.direction === 'bullish') {
          boga++;
          if (z.high <= c.close && (enYakinBoga === null || z.high > enYakinBoga)) enYakinBoga = z.high;
        } else {
          ayi++;
          if (z.low >= c.close && (enYakinAyi === null || z.low < enYakinAyi)) enYakinAyi = z.low;
        }
      }

      activeBullish[i] = boga;
      activeBearish[i] = ayi;
      nearestBullish[i] = enYakinBoga;
      nearestBearish[i] = enYakinAyi;
      inBreaker[i] = icinde;
    }

    const sonIndex = n - 1;
    return {
      breakers: breakers
        .filter(z => z.invalidatedAt === null)
        .map(z => ({ ...z, active: true, ageBars: sonIndex - z.bornAt }))
        .sort((a, b) => b.bornAt - a.bornAt)
        .slice(0, Math.floor(p.maxActive)),
      activeBullish: clean(activeBullish, n),
      activeBearish: clean(activeBearish, n),
      nearestBullish: clean(nearestBullish, n),
      nearestBearish: clean(nearestBearish, n),
      inBreaker: clean(inBreaker, n)
    };
  }
});

register({
  key: 'mitigation_block',
  label: 'Mitigation Block',
  group: 'ict',
  kind: 'zones',
  outputs: ['blocks', 'activeBullish', 'activeBearish', 'deepestPenetration', 'inMitigation'],
  seriesOutputs: ['activeBullish', 'activeBearish', 'deepestPenetration', 'inMitigation'],
  sparseOutputs: ['deepestPenetration'],
  dependsOn: ['order_block'],
  params: {
    atrPeriod: { type: 'number', default: 14, min: 1 },
    dispAtrMultiple: { type: 'number', default: 1.5, min: 0.1 },
    obLookback: { type: 'number', default: 5, min: 1 },
    useBody: { type: 'boolean', default: false },
    // Bölgeye en az bu kadar (0–1) girilmiş olmalı ki "mitige edilmiş" sayılsın.
    minPenetration: { type: 'number', default: 0.2, min: 0, max: 1 },
    maxAgeBars: { type: 'number', default: 300, min: 0 },
    maxActive: { type: 'number', default: 12, min: 1 }
  },
  warmup: (p) => p.atrPeriod + p.obLookback + 5,
  note: 'Test edilmiş ama HÂLÂ AYAKTA order block. `penetration` bölgeye girilen derinlik (0–1); karşı kenar geçilirse blok breaker olur, buradan düşer.',
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const ob = ctx.computeOne('order_block', {
      atrPeriod: p.atrPeriod,
      dispAtrMultiple: p.dispAtrMultiple,
      lookback: p.obLookback,
      useBody: p.useBody,
      mitigation: 'through'
    });

    // Kaynak bloklar: onay barına göre sıralı, tüm bloklar.
    const kaynak = ob.blocks.slice().sort((a, b) => a.confirmedAt - b.confirmedAt).map(b => ({
      id: b.id,
      direction: b.direction,
      low: b.low,
      high: b.high,
      index: b.index,
      confirmedAt: b.confirmedAt,
      mitigatedAt: b.mitigatedAt,
      penetration: 0,
      firstMitigatedAt: null
    }));

    const activeBullish = new Array(n).fill(null);
    const activeBearish = new Array(n).fill(null);
    const deepestPenetration = new Array(n).fill(null);
    const inMitigation = new Array(n).fill(null);

    let ki = 0;
    const aktif = [];

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      while (ki < kaynak.length && kaynak[ki].confirmedAt <= i) { aktif.push(kaynak[ki]); ki++; }

      let boga = 0;
      let ayi = 0;
      let enDerin = null;
      let icinde = 0;

      for (const b of aktif) {
        // Karşı kenar geçildiyse blok artık breaker'dır, burada sayılmaz.
        if (b.mitigatedAt !== null && i >= b.mitigatedAt) continue;
        if (p.maxAgeBars > 0 && (i - b.confirmedAt) > p.maxAgeBars) continue;
        if (i <= b.confirmedAt) continue;

        const yukseklik = b.high - b.low;
        if (!(yukseklik > 0)) continue;

        // Bölgeye ne kadar girildi (0 = değmedi, 1 = karşı kenara ulaştı).
        let derinlik = 0;
        if (b.direction === 'bullish' && c.low < b.high) {
          derinlik = Math.min(1, (b.high - Math.max(c.low, b.low)) / yukseklik);
        } else if (b.direction === 'bearish' && c.high > b.low) {
          derinlik = Math.min(1, (Math.min(c.high, b.high) - b.low) / yukseklik);
        }

        if (derinlik > b.penetration) b.penetration = derinlik;
        if (derinlik > 0) {
          icinde = 1;
          if (b.firstMitigatedAt === null && derinlik >= p.minPenetration) b.firstMitigatedAt = i;
        }

        if (b.penetration >= p.minPenetration) {
          if (b.direction === 'bullish') boga++; else ayi++;
          if (enDerin === null || b.penetration > enDerin) enDerin = b.penetration;
        }
      }

      activeBullish[i] = boga;
      activeBearish[i] = ayi;
      deepestPenetration[i] = enDerin;
      inMitigation[i] = icinde;
    }

    const sonIndex = n - 1;
    return {
      blocks: kaynak
        .filter(b => b.mitigatedAt === null && b.penetration >= p.minPenetration)
        .map(b => ({
          id: b.id,
          direction: b.direction,
          low: b.low,
          high: b.high,
          index: b.index,
          confirmedAt: b.confirmedAt,
          firstMitigatedAt: b.firstMitigatedAt,
          penetration: b.penetration,
          ageBars: sonIndex - b.confirmedAt,
          active: true
        }))
        .sort((a, b) => b.confirmedAt - a.confirmedAt)
        .slice(0, Math.floor(p.maxActive)),
      activeBullish: clean(activeBullish, n),
      activeBearish: clean(activeBearish, n),
      deepestPenetration: clean(deepestPenetration, n),
      inMitigation: clean(inMitigation, n)
    };
  }
});
