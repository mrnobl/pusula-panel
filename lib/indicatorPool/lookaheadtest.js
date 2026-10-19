/**
 * İleriye bakma (lookahead) testi.
 *
 * Kesin ölçüt: bir göstergenin `i`. bardaki değeri, seri `i`. barda kesilerek
 * hesaplandığında da AYNI çıkmalıdır. Farklıysa gösterge, o an bilinemeyecek
 * bir bilgiyi kullanıyordur ve onunla yapılan her backtest sistematik olarak
 * iyimserdir.
 *
 * Salınım noktaları bu tuzağın klasik yeridir: zirve `index` barında oluşur
 * ama `confirmedAt` barında bilinir. Seriyi `index`e göre doldurmak testi
 * anında düşürür.
 *
 * Çalıştırma:  node lib/indicatorPool/lookaheadtest.js
 */

const pool = require('./index');
const { makeCandles, mixCandles } = require('./selftest');

/** Test edilecek gösterge + hangi serilerinin geçmişe sadık kalması gerektiği. */
const HEDEFLER = [
  { key: 'swings', params: { method: 'atr' }, seriler: ['lastHigh', 'lastLow'] },
  { key: 'swings', params: { method: 'pivot', lookback: 5 }, seriler: ['lastHigh', 'lastLow'] },
  { key: 'structure_state', params: { method: 'atr' }, seriler: ['state'] },
  { key: 'structure_state', params: { method: 'pivot', lookback: 5 }, seriler: ['state'] },
  // Çapalı VWAP: salınım çapası geçmişe dönük "mükemmel çapa" seçme riskinin
  // tam olduğu yer — onay barına saygı gösteriliyor mu?
  { key: 'vwap_anchored', params: { mode: 'swingLow' }, seriler: ['vwap', 'anchorIndex'] },
  { key: 'vwap_anchored', params: { mode: 'swingHigh' }, seriler: ['vwap'] },
  { key: 'vwap_anchored', params: { mode: 'highestVolume', volumeLookback: 100 }, seriler: ['vwap'] },
  { key: 'vwap_anchored', params: { mode: 'barsAgo', barsAgo: 50 }, seriler: ['vwap'] },
  { key: 'vwap_period', params: { anchor: 'daily' }, seriler: ['vwap', 'prevClose'] },
  // Dönem/seans seviyeleri: `current*` serilerinin dönemin TAMAMINI değil,
  // o bara kadarki koşan değeri taşıdığı burada kanıtlanır.
  { key: 'period_levels', params: { anchor: 'daily' }, seriler: ['prevHigh', 'prevLow', 'currentHigh', 'currentLow'] },
  { key: 'period_levels', params: { anchor: 'weekly' }, seriler: ['prevHigh', 'currentHigh'] },
  { key: 'session_levels', params: { session: 'london' }, seriler: ['prevHigh', 'prevLow', 'currentHigh'] },
  // Bölgeler bar bar kurulur; sonda oluşan listeyle geçmişi doldurmak
  // sızıntı olurdu — bu test onu yakalar.
  { key: 'sr_zones', params: {}, seriler: ['activeZoneCount', 'nearestSupport', 'nearestResistance'] },
  // Order block geriye dönük işaretlenir ama displacement barında bilinir —
  // "hareketten önce nereden dönüleceğini bilmek" sızıntısı burada yakalanır.
  { key: 'displacement', params: {}, seriler: ['strength', 'bodyRatio'] },
  { key: 'order_block', params: {}, seriler: ['activeBullish', 'activeBearish', 'inBlock'] },
  { key: 'ranges', params: {}, seriler: ['inRange'] },
  // Range tool: aralığı serinin TAMAMINDAN hesaplayıp geçmişe yazmak, "tepe
  // daha oluşmadan tepeyi bilmek" demektir. Dört mod da ayrı sınanır.
  // Range yapısı: salınım tespiti (zigzag) + range doğumu/kilitlenmesi/ölümü.
  // Sızıntı riski üç yerde: (1) salınım ucunun onaylandığı bardan ÖNCE
  // bilinmesi, (2) ikinci seviyenin ileride ulaşacağı değeri baştan yazmak,
  // (3) ölüm barını geriye taşımak. Farklı eşik ve kilit kurallarıyla sınanır.
  // 'auto' eşik: son N barın MEDYAN aralığı — kayan pencere hesabı, klasik
  // sızıntı noktası. Pencere ileri kayarsa geçmişteki eşik geleceği görmüş olur.
  { key: 'range_tool', params: {}, seriler: ['rangeHigh', 'rangeLow', 'eq', 'devHigh', 'devLow', 'position', 'state', 'threshold'], enAz: { ranges: 2 } },
  { key: 'range_tool', params: { autoLookback: 30, autoMultiple: 2 }, seriler: ['threshold', 'rangeHigh', 'eq'], enAz: { ranges: 2 } },
  // `requireLaterConfirm`: onay bir bar geciker — gecikmeyi geriye taşımak
  // (yani ucu bilindiğinden önce kullanmak) tam da bu testin aradığı sızıntı.
  { key: 'range_tool', params: { requireLaterConfirm: true }, seriler: ['rangeHigh', 'rangeLow', 'eq', 'state'], enAz: { ranges: 2 } },
  // `lockOn: 'swing'`: ikinci seviye, zigzag onu onayladığında kilitlenir.
  // Onayı geriye taşımak (ucu bilinmeden kilitlemek) buradan yakalanır.
  { key: 'range_tool', params: { lockOn: 'swing' }, seriler: ['rangeHigh', 'rangeLow', 'eq', 'devHigh', 'devLow', 'state'], enAz: { ranges: 3 } },
  { key: 'range_tool', params: { thresholdMode: 'percent', thresholdPct: 3 }, seriler: ['rangeHigh', 'rangeLow', 'eq', 'devHigh', 'devLow', 'position', 'state'], enAz: { ranges: 3 } },
  { key: 'range_tool', params: { thresholdMode: 'percent', thresholdPct: 6, lockOn: 'close' }, seriler: ['rangeHigh', 'rangeLow', 'eq', 'devHigh', 'devLow'], enAz: { ranges: 2 } },
  { key: 'range_tool', params: { thresholdMode: 'absolute', thresholdAbs: 4, deathGraceBars: 3 }, seriler: ['rangeHigh', 'rangeLow', 'eq'], enAz: { ranges: 2 } },
  // `redraw`: ikinci seviye tarafından ihlal öldürmez, ASKIYA alır; range'e
  // dönüşte ikinci seviye YENİ UCA taşınır. Sızıntı riski burada yüksek —
  // yeni uç, ihlal ile dönüş ARASINDAKİ barlardan gelir ve onu dönüş barından
  // ÖNCE serilere yazmak tam olarak ileriye bakmaktır. İki tavan da (genişlik,
  // sayı) ölüm sebebi olduğundan ölüm barının yeri de kapsamda.
  { key: 'range_tool', params: { redraw: true }, seriler: ['rangeHigh', 'rangeLow', 'eq', 'devHigh', 'devLow', 'position', 'state'], enAz: { ranges: 2 } },
  { key: 'range_tool', params: { redraw: true, lockOn: 'close', redrawWindowBars: 20, redrawMaxWidth: 1.5, redrawMaxCount: 1 }, seriler: ['rangeHigh', 'rangeLow', 'eq', 'state'], enAz: { ranges: 2 } },
  // `rescaleOnRevive`: tölerans içinde dönen yapının ihlal edilen sınırı,
  // taşmanın ULAŞTIĞI UCA taşınır. Sızıntı riski aynı yerde: o uç, ihlal ile
  // dönüş arasındaki barlardan gelir; dönüş barından önce serilere yazmak
  // ileriye bakmadır. Çapa tarafının da taşındığı 'both' ayrıca sınanır.
  { key: 'range_tool', params: { rescaleOnRevive: true, deathGraceBars: 50 }, seriler: ['rangeHigh', 'rangeLow', 'eq', 'devHigh', 'devLow', 'position', 'state'], enAz: { ranges: 2 } },
  { key: 'range_tool', params: { rescaleOnRevive: true, rescaleSides: 'second', rescaleRelock: false, deathGraceBars: 30, lockOn: 'close' }, seriler: ['rangeHigh', 'rangeLow', 'eq', 'state'], enAz: { ranges: 2 } },
  // FVG üçüncü mumda bilinir; IFVG kaynağın DOLDUĞU barda doğar; BPR ikinci
  // FVG'nin barında. Üçü de geriye dönük işaretlendiği için sızıntı riski var.
  { key: 'fvg', params: {}, seriler: ['activeBullish', 'activeBearish', 'inGap'] },
  // LuxAlgo uyarlaması ayrı sınanır: "auto" eşik GENİŞLEYEN pencerede ortalama
  // mum aralığıdır ve bu tam olarak sızıntıya açık bir hesap türüdür — serinin
  // tamamından hesaplanırsa geçmişteki eşik geleceği görmüş olur.
  { key: 'fvg', params: { requireDisplacement: false, requireMidClose: true, thresholdMode: 'auto' }, seriler: ['activeBullish', 'activeBearish', 'inGap'] },
  { key: 'fvg', params: { requireDisplacement: false, requireMidClose: true, thresholdMode: 'pct', minGapPct: 0.05 }, seriler: ['activeBullish', 'activeBearish', 'inGap'] },
  { key: 'ifvg', params: {}, seriler: ['activeBullish', 'activeBearish'] },
  { key: 'bpr', params: {}, seriler: ['active'] },
  // Breaker OB'nin İHLAL barında doğar; mitigation bloğu ise ihlal edilmemiş
  // ama test edilmiş blokları sayar. İkisi de geriye dönük türetiliyor.
  { key: 'breaker_block', params: { requireStructureWithin: 0 }, seriler: ['activeBullish', 'activeBearish', 'inBreaker'] },
  { key: 'mitigation_block', params: {}, seriler: ['activeBullish', 'activeBearish', 'inMitigation'] },
  // Likidite havuzu İKİNCİ nokta onaylanınca doğar; süpürme ise kapanışın
  // geri döndüğü barda. `sweepCount` koşan sayaçtır — geriye dönük bir olay
  // eklenirse sayaç geçmişte de değişir, sızıntı anında görünür.
  // `sweepCount` her barda dolu bir sayaçtır: hiç olay yoksa da 400 geçerli
  // değer üretir ve "seri dolu mu" kontrolünü boşuna geçerdi. `enAz` bu yüzden
  // olay listesinin gerçekten dolduğunu ayrıca şart koşar.
  { key: 'liquidity_pools', params: {}, seriler: ['activeBuySide', 'activeSellSide'], enAz: { pools: 5 } },
  { key: 'liquidity_sweep', params: {}, seriler: ['sweepCount', 'barsSince'], enAz: { events: 5 } },
  { key: 'liquidity_sweep', params: { source: 'pools' }, seriler: ['sweepCount'], enAz: { events: 3 } },
  { key: 'liquidity_sweep', params: { confirmWithin: 0 }, seriler: ['sweepCount'], enAz: { events: 5 } },
  // Dealing range sınırları onaylanmış salınımlardan gelir; `extreme` modunda
  // koşan uç da yalnızca O BARA KADARKİ fiyatı görebilir.
  { key: 'dealing_range', params: {}, seriler: ['high', 'low', 'position'], enAz: { anchors: 5 } },
  { key: 'dealing_range', params: { boundary: 'swing' }, seriler: ['high', 'low', 'position'], enAz: { anchors: 5 } },
  // OTE bölgesi bacağın İKİ UCU DA onaylandığında bilinir. Düzeltmenin nereye
  // geleceğini düzeltme başlamadan bilmek bu havuzun en klasik sızıntısı olurdu.
  { key: 'ote', params: {}, seriler: ['zoneHigh', 'zoneLow', 'retracement', 'inOte'], enAz: { legs: 5 } },
  { key: 'ote', params: { swingMethod: 'pivot' }, seriler: ['zoneHigh', 'retracement'], enAz: { legs: 5 } },
  // Killzone'un `zoneHigh`/`zoneLow` serileri KOŞAN uçtur: pencerenin ilk
  // barında pencerenin tamamının zirvesini bilmek en büyük sızıntı türüdür
  // (`period_levels`'ta da aynı risk vardı).
  { key: 'killzones', params: {}, seriler: ['active', 'zoneHigh', 'zoneLow', 'prevHigh'], enAz: { sessions: 10 } },
  { key: 'killzones', params: { zones: ['asia', 'silverBullet'] }, seriler: ['active', 'zoneHigh', 'prevLow'], enAz: { sessions: 10 } },
  // RVOL tabanı bu bar HARİÇ geçmişten kurulur; `timeOfDay` modunda barın
  // hacmi dilim geçmişine ancak kullanıldıktan SONRA eklenmeli.
  { key: 'rvol', params: {}, seriler: ['value', 'baseline'] },
  { key: 'rvol', params: { mode: 'timeOfDay' }, seriler: ['value', 'baseline'] },
  { key: 'cmf', params: {}, seriler: ['value'] },
  { key: 'mfi', params: {}, seriler: ['value'] },
  // OBV'nin mutlak seviyesi dizi başlangıcına bağlı olduğu için `value`
  // kesme testine sokulmaz; `histogram` ve `slope` pencereden bağımsızdır.
  { key: 'obv', params: {}, seriler: ['histogram', 'slope'] },
  // Kontrol grubu: bunlar tanımı gereği geçmişe sadık olmalı.
  { key: 'ema', params: { period: 21 }, seriler: ['value'] },
  { key: 'atr', params: { period: 14 }, seriler: ['value'] },
  { key: 'adx', params: { period: 14 }, seriler: ['adx'] },
  { key: 'donchian', params: { period: 20 }, seriler: ['upper', 'lower'] },
  { key: 'aroon', params: { period: 14 }, seriler: ['up', 'down'] }
];

/**
 * Çok sembollü hedefler. Bunlar `computeOne` yolundan geçmiyor; kesme işlemi
 * TÜM sembollere aynı anda uygulanmalı — yoksa ortak zaman ekseni değişir ve
 * test kendi kurduğu tuzağa düşer.
 */
const COKLU_HEDEFLER = [
  { key: 'correlation_rolling', params: { base: 'AAA/USDT', period: 60 }, seriler: ['average', 'spread'], ciftler: ['BBB/USDT'] },
  { key: 'beta_rolling', params: { base: 'AAA/USDT', period: 60 }, seriler: ['average'], ciftler: ['BBB/USDT'] },
  // SMT dört salınımı karşılaştırır; olay hepsinin ONAYLANDIĞI barda doğar.
  // `divergenceCount` koşan sayaç: geriye dönük bir olay eklenirse geçmişteki
  // sayı da değişir ve sızıntı anında görünür.
  { key: 'smt_divergence', params: { base: 'AAA/USDT' }, seriler: ['divergenceCount'], karisim: true, enAz: { events: 3 } }
];

function esit(a, b) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 1e-9;
}

function run() {
  const candles = makeCandles(400);
  // Kesme noktaları: ısınmadan sonra, seri boyunca dağılmış.
  const kesmeler = [150, 200, 250, 300, 350];

  console.log(`İleriye bakma testi · ${candles.length} mum · kesme noktaları: ${kesmeler.join(', ')}\n`);

  let gecen = 0;
  let toplam = 0;
  const basarisiz = [];

  for (const hedef of HEDEFLER) {
    const ad = `${hedef.key}(${JSON.stringify(hedef.params)})`;
    const tam = pool.computeOne(candles, hedef.key, hedef.params);
    const sorunlar = [];

    // Boş seriyi boş seriyle karşılaştırmak her zaman "geçer" — testi
    // anlamsız kılar. `swings` bir ara sıfır nokta üretiyordu ve bu test
    // onu fark etmeden geçirmişti. Önce serinin dolu olduğu doğrulanır.
    for (const seriAdi of hedef.seriler) {
      const dolu = (tam[seriAdi] || []).filter(v => Number.isFinite(v)).length;
      if (dolu < 20) {
        sorunlar.push(`${seriAdi}: yalnızca ${dolu} geçerli değer — test anlamsız, gösterge üretmiyor olabilir`);
      }
    }

    // Koşan sayaç gibi "hep dolu" serilerde yukarıdaki kontrol yetmez: olay
    // hiç üretilmemişse seri sıfırlarla dolu olur ve karşılaştırma boşa çıkar.
    for (const [liste, enAz] of Object.entries(hedef.enAz || {})) {
      const adet = Array.isArray(tam[liste]) ? tam[liste].length : 0;
      if (adet < enAz) {
        sorunlar.push(`${liste}: ${adet} kayıt (en az ${enAz} bekleniyordu) — test anlamsız, gösterge üretmiyor olabilir`);
      }
    }

    for (const kesme of kesmeler) {
      const kesik = pool.computeOne(candles.slice(0, kesme), hedef.key, hedef.params);

      for (const seriAdi of hedef.seriler) {
        const tamSeri = tam[seriAdi];
        const kesikSeri = kesik[seriAdi];

        // Kesik serinin SON barı, tam serinin aynı barıyla eşleşmeli.
        const i = kesme - 1;
        if (!esit(tamSeri[i], kesikSeri[kesikSeri.length - 1])) {
          sorunlar.push(
            `${seriAdi}[${i}]: tam seride ${tamSeri[i]}, ${kesme} barda kesilince ${kesikSeri[kesikSeri.length - 1]}`
          );
        }
      }
    }

    toplam++;
    if (sorunlar.length) {
      basarisiz.push({ ad, sorunlar });
      console.log(`  ✗ ${ad}`);
      sorunlar.slice(0, 4).forEach(s => console.log(`      ${s}`));
      if (sorunlar.length > 4) console.log(`      ... ${sorunlar.length - 4} sorun daha`);
    } else {
      gecen++;
      console.log(`  ✓ ${ad}`);
    }
  }

  // ── Çok sembollü hedefler ────────────────────────────────────────────
  const A = makeCandles(400, 100, 20260812);
  const B = makeCandles(400, 30, 777001);
  const D = makeCandles(400, 5, 313131);

  for (const hedef of COKLU_HEDEFLER) {
    const ad = `${hedef.key}(${JSON.stringify(hedef.params)})`;
    // SMT bağımsız serilerde hiç olay üretmez (korelasyon kapısı) — testin
    // anlamlı olması için korele ama farklı bir eş gerekir.
    const harita = hedef.karisim
      ? { 'AAA/USDT': A, 'KARISIM/USDT': mixCandles(A, B, 0.8) }
      : { 'AAA/USDT': A, 'BBB/USDT': B, 'DDD/USDT': D };
    const tam = pool.computeMulti(harita, [{ key: hedef.key, params: hedef.params }])[hedef.key];
    const sorunlar = [];

    for (const seriAdi of hedef.seriler) {
      const dolu = (tam[seriAdi] || []).filter(v => Number.isFinite(v)).length;
      if (dolu < 20) sorunlar.push(`${seriAdi}: yalnızca ${dolu} geçerli değer — test anlamsız`);
    }

    for (const kesme of kesmeler) {
      const kesikHarita = {};
      for (const [sym, c] of Object.entries(harita)) kesikHarita[sym] = c.slice(0, kesme);
      const kesik = pool.computeMulti(kesikHarita, [{ key: hedef.key, params: hedef.params }])[hedef.key];

      const i = kesme - 1;
      for (const seriAdi of hedef.seriler) {
        if (!esit(tam[seriAdi][i], kesik[seriAdi][kesme - 1])) {
          sorunlar.push(`${seriAdi}[${i}]: tam ${tam[seriAdi][i]}, kesik ${kesik[seriAdi][kesme - 1]}`);
        }
      }
      for (const sym of (hedef.ciftler || [])) {
        if (!esit(tam.pairs[sym][i], kesik.pairs[sym][kesme - 1])) {
          sorunlar.push(`pairs['${sym}'][${i}]: tam ${tam.pairs[sym][i]}, kesik ${kesik.pairs[sym][kesme - 1]}`);
        }
      }
    }

    toplam++;
    if (sorunlar.length) {
      basarisiz.push({ ad, sorunlar });
      console.log(`  ✗ ${ad}`);
      sorunlar.slice(0, 4).forEach(s => console.log(`      ${s}`));
    } else {
      gecen++;
      console.log(`  ✓ ${ad}`);
    }
  }

  console.log('');
  console.log(`geçen: ${gecen}/${toplam}`);

  if (basarisiz.length) {
    console.log('');
    console.log('DİKKAT: geçmişe sadık olmayan bir gösterge, backtest sonucunu');
    console.log('sistematik olarak iyimser gösterir. Düzeltilmeden kullanılmamalı.');
  }

  return basarisiz.length === 0;
}

if (require.main === module) {
  process.exit(run() ? 0 : 1);
}

module.exports = { run };
