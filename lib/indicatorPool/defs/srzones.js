const { register } = require('../registry');
const { clean } = require('../contract');

/**
 * Destek-direnç bölgeleri.
 *
 * Tek bir salınım noktası bir seviye değildir; seviye, fiyatın DEFALARCA
 * tepki verdiği bir bölgedir. Bu gösterge salınım noktalarını ATR
 * toleransıyla kümeler ve her bölgeye dokunuş sayısı, yaş ve hacim verir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BÖLGE YAŞAM DÖNGÜSÜ — `zones` tipinin varlık sebebi
 * ─────────────────────────────────────────────────────────────────────────
 *   oluştu → test edildi (n kez) → kırıldı → ROL DEĞİŞTİRDİ (flip)
 *
 * Kırılan direnç destek olur; ICT'de bu "breaker" mantığının temelidir.
 * Bölge kırıldığında silinmez, `flip` olarak işaretlenip karşı tarafta
 * çalışmaya devam eder.
 *
 * İLERİYE BAKMA: bölgeler yalnızca O BARA KADAR ONAYLANMIŞ salınımlardan
 * kurulur. Türetilmiş seriler bar bar ilerleyerek üretilir; sonunda oluşan
 * bölge listesiyle geçmişi doldurmak, o an bilinmeyen bir seviyeyi kullanmak
 * olurdu.
 */

/** Güç puanı — ağırlıklar keyfîdir, bu yüzden ayarlanabilir ve raporlanır. */
function strengthOf(zone, barIndex, params) {
  const dokunus = zone.touches;
  const yas = barIndex - zone.createdAt;
  // Tazelik: eski bölgeler zamanla değer kaybeder ama sıfırlanmaz.
  const tazelik = 1 / (1 + Math.max(0, yas) / Math.max(1, params.ageHalfLife));
  const hacim = Math.log(1 + Math.max(0, zone.volume));
  return dokunus * params.touchWeight + hacim * params.volumeWeight + tazelik * params.recencyWeight;
}

register({
  key: 'sr_zones',
  label: 'Destek-Direnç Bölgeleri',
  group: 'yapi',
  kind: 'zones',
  outputs: [
    'zones',
    'nearestSupport', 'nearestResistance',
    'supportDistanceAtr', 'resistanceDistanceAtr',
    'inZone', 'activeZoneCount'
  ],
  seriesOutputs: [
    'nearestSupport', 'nearestResistance',
    'supportDistanceAtr', 'resistanceDistanceAtr',
    'inZone', 'activeZoneCount'
  ],
  // Bunlar koşullu boştur: fiyatın altında bölge yoksa `nearestSupport`
  // gerçekten yoktur. Isınma eksikliği değil, o barın gerçeği — süreklilik
  // beklenmez. `inZone` ve `activeZoneCount` ise ısınmadan sonra hep doludur.
  sparseOutputs: ['nearestSupport', 'nearestResistance', 'supportDistanceAtr', 'resistanceDistanceAtr'],
  dependsOn: ['swings', 'atr'],
  params: {
    swingMethod: { type: 'enum', values: ['atr', 'pivot'], default: 'atr' },
    swingAtrMultiple: { type: 'number', default: 2.0, min: 0.1 },
    swingLookback: { type: 'number', default: 5, min: 1 },
    atrPeriod: { type: 'number', default: 14, min: 1 },
    // Kümeleme toleransı: bu kadar ATR içindeki salınımlar aynı bölgedir.
    clusterAtr: { type: 'number', default: 0.5, min: 0.05 },
    // Kırılım: kapanış bölgenin bu kadar ATR ötesine geçerse bölge kırılır.
    breakAtr: { type: 'number', default: 0.5, min: 0 },
    minTouches: { type: 'number', default: 2, min: 1 },
    maxZones: { type: 'number', default: 30, min: 1 },
    // Uzun süre dokunulmayan bölge artık seviye değildir. Bu olmadan aktif
    // bölge sayısı sınırsız büyüyor ve "en yakın destek" gürültüye dönüşüyor.
    maxIdleBars: { type: 'number', default: 400, min: 10 },
    touchWeight: { type: 'number', default: 1.0 },
    volumeWeight: { type: 'number', default: 0.3 },
    recencyWeight: { type: 'number', default: 1.0 },
    ageHalfLife: { type: 'number', default: 300, min: 1 }
  },
  warmup: (p) => Math.max(p.atrPeriod + 10, 60),
  note: 'Bölgeler yalnızca onaylanmış salınımlardan kurulur. Kırılan bölge silinmez, `flip` olarak karşı tarafta yaşar. Güç puanı ağırlıkları keyfîdir ve ayarlanabilir — ölçüm hangisinin işe yaradığını söyleyecek.',
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const atr = ctx.computeOne('atr', { period: p.atrPeriod }).value;
    const sw = ctx.computeOne('swings', {
      method: p.swingMethod,
      atrMultiple: p.swingAtrMultiple,
      lookback: p.swingLookback
    });

    // Salınımları ONAY barına göre sırala — bölge kurulumu ileri yönde ilerler.
    const noktalar = sw.points.slice().sort((a, b) => a.confirmedAt - b.confirmedAt);
    let np = 0;

    const zones = [];
    let sonrakiId = 1;

    const nearestSupport = new Array(n).fill(null);
    const nearestResistance = new Array(n).fill(null);
    const supportDistanceAtr = new Array(n).fill(null);
    const resistanceDistanceAtr = new Array(n).fill(null);
    const inZone = new Array(n).fill(null);
    const activeZoneCount = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const a = atr[i];
      if (!Number.isFinite(a) || a <= 0) continue;

      const tolerans = a * p.clusterAtr;

      // 1) Bu barda ONAYLANAN salınımları bölgelere işle.
      while (np < noktalar.length && noktalar[np].confirmedAt <= i) {
        const pt = noktalar[np];
        np++;

        const mevcut = zones.find(z => Math.abs(z.center - pt.price) <= tolerans);
        if (mevcut) {
          mevcut.prices.push(pt.price);
          mevcut.center = mevcut.prices.reduce((x, y) => x + y, 0) / mevcut.prices.length;
          mevcut.low = Math.min(mevcut.low, pt.price);
          mevcut.high = Math.max(mevcut.high, pt.price);
          mevcut.touches += 1;
          mevcut.lastTouchAt = i;
          mevcut.volume += Number.isFinite(candles[pt.index].volume) ? candles[pt.index].volume : 0;
          if (pt.type === 'high' && mevcut.origin === 'low') mevcut.origin = 'both';
          if (pt.type === 'low' && mevcut.origin === 'high') mevcut.origin = 'both';
        } else {
          zones.push({
            id: sonrakiId++,
            center: pt.price,
            low: pt.price,
            high: pt.price,
            prices: [pt.price],
            origin: pt.type,          // 'high' | 'low' | 'both'
            touches: 1,
            createdAt: i,
            lastTouchAt: i,
            brokenAt: null,
            flipped: false,
            volume: Number.isFinite(candles[pt.index].volume) ? candles[pt.index].volume : 0
          });
        }
      }

      // 2) Kırılım kontrolü: kapanış bölgenin ötesine geçtiyse rol değişir.
      const kirilimPay = a * p.breakAtr;
      for (const z of zones) {
        if (z.brokenAt !== null) continue;
        const ustSinir = z.high + kirilimPay;
        const altSinir = z.low - kirilimPay;
        if (c.close > ustSinir && z.origin !== 'low') {
          z.brokenAt = i;
          z.flipped = true;      // direnç kırıldı → destek olarak yaşamaya devam
        } else if (c.close < altSinir && z.origin !== 'high') {
          z.brokenAt = i;
          z.flipped = true;      // destek kırıldı → direnç
        }
      }

      // 3) Türetilmiş seriler — yeterli dokunuşu olan VE hâlâ taze bölgeler.
      const gecerli = zones.filter(z =>
        z.touches >= p.minTouches && (i - z.lastTouchAt) <= p.maxIdleBars
      );
      activeZoneCount[i] = gecerli.length;

      let enYakinDestek = null;
      let enYakinDirenc = null;
      let icinde = 0;

      for (const z of gecerli) {
        if (c.close >= z.low && c.close <= z.high) icinde = 1;
        if (z.high < c.close) {
          if (enYakinDestek === null || z.high > enYakinDestek) enYakinDestek = z.high;
        } else if (z.low > c.close) {
          if (enYakinDirenc === null || z.low < enYakinDirenc) enYakinDirenc = z.low;
        } else {
          icinde = 1;
        }
      }

      inZone[i] = icinde;
      nearestSupport[i] = enYakinDestek;
      nearestResistance[i] = enYakinDirenc;
      supportDistanceAtr[i] = enYakinDestek !== null ? (c.close - enYakinDestek) / a : null;
      resistanceDistanceAtr[i] = enYakinDirenc !== null ? (enYakinDirenc - c.close) / a : null;
    }

    // Nihai bölge listesi: güç puanına göre sıralı, en güçlü `maxZones` tanesi.
    const sonIndex = n - 1;
    const sonFiyat = n > 0 ? candles[sonIndex].close : null;

    const rapor = zones
      .filter(z => z.touches >= p.minTouches && (sonIndex - z.lastTouchAt) <= p.maxIdleBars)
      .map(z => ({
        id: z.id,
        center: z.center,
        low: z.low,
        high: z.high,
        touches: z.touches,
        origin: z.origin,
        // Rol, kökene değil FİYATIN ŞU ANKİ YERİNE göre belirlenir — bir bölge
        // fiyatın altındaysa destek, üstündeyse dirençtir. Kökene bakmak,
        // ranging bir piyasada her şeyi "flip" göstermeye yol açıyordu.
        role: sonFiyat === null ? 'bilinmiyor'
          : (z.high < sonFiyat ? 'destek' : (z.low > sonFiyat ? 'direnç' : 'fiyat içinde')),
        createdAt: z.createdAt,
        createdTime: candles[z.createdAt] ? candles[z.createdAt].time : null,
        lastTouchAt: z.lastTouchAt,
        brokenAt: z.brokenAt,
        flipped: z.flipped,
        ageBars: sonIndex - z.createdAt,
        volume: z.volume,
        strength: strengthOf(z, sonIndex, p)
      }))
      .sort((x, y) => y.strength - x.strength)
      .slice(0, Math.floor(p.maxZones));

    return {
      zones: rapor,
      nearestSupport: clean(nearestSupport, n),
      nearestResistance: clean(nearestResistance, n),
      supportDistanceAtr: clean(supportDistanceAtr, n),
      resistanceDistanceAtr: clean(resistanceDistanceAtr, n),
      inZone: clean(inZone, n),
      activeZoneCount: clean(activeZoneCount, n)
    };
  }
});
