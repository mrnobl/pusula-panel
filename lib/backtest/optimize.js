/**
 * PARAMETRE OPTİMİZASYONU VE WALK-FORWARD
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN SİMÜLASYONDAN AYRI DOSYADA
 * ─────────────────────────────────────────────────────────────────────────
 * `PLAN-MOTOR.md` M-6: koşu, optimizasyon ve walk-forward 1777 satırlık tek
 * dosyadaydı. Simülasyonu değiştirmek optimizasyonu, optimizasyonu
 * değiştirmek walk-forward'ı riske atıyordu. Üçü de aynı `run()`'ı ÇAĞIRIR
 * ama hiçbiri onun içini bilmez — yani ayrılabilirlerdi ve ayrıldılar.
 *
 * Buradaki işlevler koşucuyu (`B`) ARGÜMAN olarak alır, `require` ile
 * içeriden çağırmaz. Sebep: `backtester.js` bu modülü zaten yüklüyor;
 * ters yönde bir `require` dairesel bağımlılık kurardı ve Node'un o durumda
 * döndürdüğü yarı dolu nesne sessizce `undefined` metotlar verirdi.
 */
const db = require('../database');
const catalog = require('../strategies/catalog');

/**
 * Bir stratejinin optimizasyon ızgarası.
 *
 * Strateji sınıfı `static optimizeGrid(baseConfig, ctx)` ya da düz bir
 * `static optimizeGrid = { param: [değerler] }` bildirebilir. `ctx.rangePct`
 * verinin fiyat aralığını taşır — eşikleri veriye uyarlamak isteyen
 * stratejiler (eski `rsi_macd` bunu yapıyordu) kullanabilir.
 */
function optimizeGridFor(strategyName, baseConfig, ctx = {}) {
  const entry = catalog.get(strategyName);
  const Sinif = entry && entry.Class;
  const grid = Sinif && Sinif.optimizeGrid;
  if (!grid) return {};
  try {
    return typeof grid === 'function' ? (grid(baseConfig, ctx) || {}) : grid;
  } catch (err) {
    return {};
  }
}

/**
 * Izgarayı gezip en iyi bileşimi arar.
 *
 * ⚠ Bu, "en iyi satır"ı bir GEREKÇE saymaz; yalnızca sıralamayı üretir.
 * Bu depoda bir değerin benimsenmesi için boyutun ayrıştırıcı olması ve
 * değerin tek varlıkta değil dışarıda da geçmesi şartı var
 * (`PLAN-RANGE-VPFR.md` §11 md.3).
 */
function optimizeParameters(B, strategyName, baseConfig, ohlcvData, initialCapital = 10000.0, timeframe = '1h', secenek = {}) {
  // Tarama gibi çok koşulu yollar kombinasyon tavanını düşürebilir (varsayılan 150).
  const TAVAN = Math.max(1, parseInt(secenek.maxKombinasyon, 10) || 150);
  if (!ohlcvData || ohlcvData.length < 50) {
    throw new Error('Parametre optimizasyonu için en az 50 mumluk veri gereklidir.');
  }

  const permutations = [];
  const prices = ohlcvData.map(c => c.close);
  // Döngüyle: yayılım (`Math.max(...)`) uzun seride yığın taşırır.
  let maxP = -Infinity, minP = Infinity;
  for (const p of prices) { if (p > maxP) maxP = p; if (p < minP) minP = p; }
  const rangePct = ((maxP - minP) / Math.max(minP, 1)) * 100;

  // ─────────────────────────────────────────────────────────────────────
  // Parametre ızgarası STRATEJİNİN KENDİSİNDEN gelir.
  //
  // Buradaki eski yapı, her strateji için elle yazılmış iç içe döngülerden
  // oluşan 200 satırlık bir if/else zinciriydi — strateji listesinin altı
  // yerde tutulmasıyla aynı hata. Zincirdeki yedi anahtarın hepsi arşive
  // taşındığında zincir tamamen ölü koda dönüştü.
  //
  // Artık strateji sınıfı `static optimizeGrid` ile hangi parametrenin hangi
  // değerlerle denenebileceğini bildirir; permütasyonlar buradan üretilir.
  // Yeni bir strateji yazan kişinin optimizatöre dokunması gerekmez.
  // ─────────────────────────────────────────────────────────────────────
  const grid = optimizeGridFor(strategyName, baseConfig, { rangePct });
  const gridKeys = Object.keys(grid);

  if (gridKeys.length) {
    // Kartezyen çarpım; kombinasyon sayısı patlarsa aşağıdaki örnekleme
    // zaten 150'ye indiriyor.
    let birikim = [{ ...baseConfig }];
    for (const anahtar of gridKeys) {
      const degerler = grid[anahtar];
      if (!Array.isArray(degerler) || !degerler.length) continue;
      const sonraki = [];
      for (const taban of birikim) {
        for (const deger of degerler) sonraki.push({ ...taban, [anahtar]: deger });
      }
      birikim = sonraki;
      // Ara patlamayı sınırla: 20.000 kombinasyonun ötesi zaten örnekleniyor.
      if (birikim.length > 20000) break;
    }
    permutations.push(...birikim);
  } else {
    // Izgara bildirmeyen strateji: yalnızca mevcut ayarıyla koşar. Sessizce
    // boş dönmek "optimizasyon çalıştı ama hiçbir şey bulamadı" gibi okunurdu.
    permutations.push({ ...baseConfig });
  }

  // Uniform Stratified Sampling across full parameter spectrum
  const sampledConfigs = [];
  const totalPerms = permutations.length;

  if (totalPerms <= TAVAN) {
    sampledConfigs.push(...permutations);
  } else {
    const step = Math.floor(totalPerms / TAVAN);
    for (let i = 0; i < TAVAN; i++) {
      const idx = Math.min(i * step, totalPerms - 1);
      sampledConfigs.push(permutations[idx]);
    }
  }

  const results = [];

  for (let cfg of sampledConfigs) {
    try {
      const res = B.run(strategyName, cfg, ohlcvData, initialCapital, timeframe);
      let score = 0;
      if (res.totalTrades > 0) {
        score = +( (res.totalReturnPct * 15.0) + (res.sharpeRatio * 8.0) + (res.winRatePct * 0.3) + (res.profitFactor * 3.0) - (res.maxDrawdownPct * 4.0) ).toFixed(2);
      } else {
        score = -999;
      }

      results.push({
        config: cfg,
        totalReturnPct: res.totalReturnPct,
        winRatePct: res.winRatePct,
        totalTrades: res.totalTrades,
        maxDrawdownPct: res.maxDrawdownPct,
        sharpeRatio: res.sharpeRatio,
        profitFactor: res.profitFactor,
        expectancy: res.expectancy,
        score
      });
    } catch (err) {
      // Skip invalid config
    }
  }

  results.sort((a, b) => b.score - a.score);
  const bestResult = results.length > 0 ? results[0] : null;

  return {
    strategyName,
    testedPermutations: results.length,
    bestConfig: bestResult ? bestResult.config : baseConfig,
    bestMetrics: bestResult,
    rankings: results.slice(0, 10)
  };
}

/**
 * WALK-FORWARD — kayan pencere, %70 eğitim / %30 test.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN YENİDEN YAZILDI (2026-10-06)
 * ─────────────────────────────────────────────────────────────────────────
 * Eski sürüm adı "walk-forward" olan TEK bir bölmeydi ve dört hata taşıyordu:
 *
 *  1. Verim oranı TOPLAM getirileri bölüyordu. Test dilimi eğitimin 3/7'si
 *     uzunlukta olduğu için kusursuz bir strateji bile ~%43 verim alıp
 *     "YÜKSEK RİSK" damgası yiyordu. Artık getiriler bar başına normalize
 *     edilir (Pardo'nun WFE tanımı: yıllıklandırılmış test / eğitim).
 *  2. Test dilimi göstergeleri SOĞUK başlatıyordu — 200 barlık bir
 *     ortalama testin ilk 200 barında sinyal üretmiyordu. Artık test
 *     diliminin önüne eğitimden ısınma barları konur ve o barlarda giriş
 *     motor tarafından kapatılır (`options.girisBasi`), kâr sızmaz.
 *  3. Eğitim zarardaysa oran sessizce Sharpe oranına dönüyordu; iki farklı
 *     ölçü aynı sütunda görünüyordu. Artık "eğitimde kâr yok" ayrı sonuçtur.
 *  4. Tek bölme şansa açıktır. Kitap sentezi §3 (Pardo, Pruitt): kayan
 *     pencere + kabul karnesi. Son %30 `kat` parçaya bölünür; her kat kendi
 *     önündeki %70 uzunluğundaki pencerede optimize edilip görmediği
 *     dilimde test edilir. `kat = 1` eski tek bölmenin düzeltilmiş hâlidir.
 *
 * Kabul karnesi (Pruitt, KITAP-SENTEZI.md §3):
 *   · WFE ≥ %50 · kârlı kat ≥ %50 · tek kat toplam test kârının ≤ %50'si
 *   · birleşik test getirisi > 0
 */
const { barsPerYear } = require('../backtestStats');

const WF_EGITIM_ORANI = 0.70;
const WF_EN_AZ_TEST = 50;        // bar — bundan kısa test dilimi kat sayısını düşürür
const WF_ESIK = { wfe: 50, karliKat: 50, tekKatPay: 50 };

/** Bar başına log getiri — farklı uzunluktaki dilimleri karşılaştırılabilir kılar. */
function barBasinaGetiri(getiriPct, bar) {
  if (!(bar > 0)) return null;
  const oran = 1 + getiriPct / 100;
  return (oran > 0 ? Math.log(oran) : Math.log(1e-6)) / bar;
}

const yillikla = (g, tf) => (g == null ? null : +((Math.exp(g * barsPerYear(tf)) - 1) * 100).toFixed(2));

/** Strateji sınıfının bildirdiği ısınma (bar); bildirmezse null. */
function isinmaBari(strategyName, cfg) {
  try {
    const Sinif = catalog.get(strategyName) && catalog.get(strategyName).Class;
    const wb = Sinif && Sinif.warmupBars;
    const bar = typeof wb === 'function' ? wb(cfg) : +wb;
    return Number.isFinite(bar) && bar > 0 ? Math.round(bar) : null;
  } catch (e) { return null; }
}

/** Ayarın yalnız optimize edilen anahtarları — katlar arası kararlılık için. */
function ayarImzasi(cfg, anahtarlar) {
  const o = {};
  for (const k of anahtarlar) o[k] = cfg[k];
  return JSON.stringify(o);
}

function runWalkForward(B, strategyName, baseConfig, ohlcvData, initialCapital = 10000.0, timeframe = '1h', secenek = {}) {
  if (!ohlcvData || ohlcvData.length < 100) {
    throw new Error('Walk-forward için en az 100 mumluk veri gereklidir.');
  }

  const N = ohlcvData.length;
  const egitimUzunluk = Math.floor(N * WF_EGITIM_ORANI);
  const testToplam = N - egitimUzunluk;
  const istenenKat = Math.max(1, Math.min(10, parseInt(secenek.katSayisi, 10) || 4));
  const kat = Math.max(1, Math.min(istenenKat, Math.floor(testToplam / WF_EN_AZ_TEST)));
  const testUzunluk = Math.floor(testToplam / kat);
  const uyarilar = [];
  if (kat < istenenKat) {
    uyarilar.push(`${istenenKat} kat istendi, ${kat} kat koşuldu: her test dilimi en az ${WF_EN_AZ_TEST} bar olmalı. Mum sayısını artırın.`);
  }

  const isinma = isinmaBari(strategyName, baseConfig);
  if (isinma && isinma > egitimUzunluk * 0.5) {
    uyarilar.push(`Strateji ${isinma} bar ısınma istiyor; eğitim penceresi ${egitimUzunluk} bar. Eğitimin büyük kısmı ısınmada geçiyor.`);
  }

  db.addLog('INFO', `🧪 Walk-forward: ${N} mum · ${kat} kat · eğitim penceresi ${egitimUzunluk} · test ${testToplam} mum`);

  const optimizeAnahtarlar = Object.keys(optimizeGridFor(strategyName, baseConfig, {}));
  const katlar = [];
  const disGetiriler = [];        // birleşik test Sharpe'ı için bar getirileri
  let toplamPermutasyon = 0;

  for (let k = 0; k < kat; k++) {
    const testBas = egitimUzunluk + k * testUzunluk;
    const testBit = k === kat - 1 ? N : testBas + testUzunluk;
    const egitimDilim = ohlcvData.slice(testBas - egitimUzunluk, testBas);

    // 1. Optimizasyon YALNIZCA bu katın eğitim penceresinde.
    const opt = optimizeParameters(B, strategyName, baseConfig, egitimDilim, initialCapital, timeframe);
    toplamPermutasyon += opt.testedPermutations;
    const cfg = opt.bestConfig;
    const ic = B.run(strategyName, cfg, egitimDilim, initialCapital, timeframe);

    // 2. Aynı ayar, görmediği dilimde — önünde ısınma barları, o barlarda giriş kapalı.
    const onek = Math.min(testBas, Math.max(30, isinma || 100));
    const dis = B.run(strategyName, cfg, ohlcvData.slice(testBas - onek, testBit), initialCapital, timeframe, { girisBasi: onek });

    // Motorun eğrisi 30. bardan başlar: eğri[j] ↔ bar 30 + j.
    const egri = (dis.equityCurve || []).slice(Math.max(0, onek - 30 - 1)).map(x => x.value);
    for (let j = 1; j < egri.length; j++) if (egri[j - 1] > 0) disGetiriler.push(egri[j] / egri[j - 1] - 1);

    const icBar = egitimDilim.length - 30;
    const disBar = testBit - testBas;
    const gIc = barBasinaGetiri(ic.totalReturnPct, icBar);
    const gDis = barBasinaGetiri(dis.totalReturnPct, disBar);

    katlar.push({
      kat: k + 1,
      egitim: { bas: B.parseSafeTimestamp(egitimDilim[0]), bit: B.parseSafeTimestamp(egitimDilim[egitimDilim.length - 1]), mum: egitimDilim.length },
      test: { bas: B.parseSafeTimestamp(ohlcvData[testBas]), bit: B.parseSafeTimestamp(ohlcvData[testBit - 1]), mum: disBar },
      ayar: Object.fromEntries(optimizeAnahtarlar.map(a => [a, cfg[a]])),
      egitimGetiri: ic.totalReturnPct,
      egitimYillik: yillikla(gIc, timeframe),
      egitimIslem: ic.totalTrades,
      testGetiri: dis.totalReturnPct,
      testYillik: yillikla(gDis, timeframe),
      testIslem: dis.totalTrades,
      testKazanmaPct: dis.winRatePct,
      testMaxDD: dis.maxDrawdownPct,
      wfe: gIc != null && gIc > 0 && gDis != null ? +((gDis / gIc) * 100).toFixed(1) : null,
      _gIc: gIc, _imza: ayarImzasi(cfg, optimizeAnahtarlar)
    });
  }

  // ── Birleşik sonuç ───────────────────────────────────────────────────────
  const disBarToplam = katlar.reduce((t, x) => t + x.test.mum, 0);
  const birlesikDis = (katlar.reduce((c, x) => c * (1 + x.testGetiri / 100), 1) - 1) * 100;
  const gDisToplam = barBasinaGetiri(birlesikDis, disBarToplam);
  const gIcOrt = katlar.reduce((t, x) => t + x._gIc, 0) / kat;
  const wfe = gIcOrt > 0 && gDisToplam != null ? +((gDisToplam / gIcOrt) * 100).toFixed(1) : null;

  const karliKatPct = +(katlar.filter(x => x.testGetiri > 0).length / kat * 100).toFixed(0);
  const karToplam = katlar.reduce((t, x) => t + x.testGetiri, 0);
  const enBuyukPay = kat > 1 && karToplam > 0
    ? +(Math.max(...katlar.map(x => x.testGetiri)) / karToplam * 100).toFixed(0) : null;
  const testIslem = katlar.reduce((t, x) => t + x.testIslem, 0);
  if (testIslem < 30) uyarilar.push(`Test dilimlerinde toplam ${testIslem} işlem var — 30'un altında sonuç istatistiksel olarak zayıf.`);
  const farkliAyar = new Set(katlar.map(x => x._imza)).size;
  if (kat > 1 && optimizeAnahtarlar.length && farkliAyar === kat) {
    uyarilar.push(`Her kat farklı bir "en iyi" ayar seçti (${farkliAyar}/${kat}) — parametre kararsız, optimum gürültü olabilir.`);
  }

  const kriterler = [
    { ad: 'Walk-forward verimi (WFE)', deger: wfe, esik: `≥ %${WF_ESIK.wfe}`, gecti: wfe != null && wfe >= WF_ESIK.wfe },
    { ad: 'Kârlı test dilimi', deger: karliKatPct, esik: `≥ %${WF_ESIK.karliKat}`, gecti: karliKatPct >= WF_ESIK.karliKat },
    { ad: 'Tek dilimin kârdaki payı', deger: enBuyukPay, esik: `≤ %${WF_ESIK.tekKatPay}`,
      gecti: kat > 1 ? (enBuyukPay != null && enBuyukPay <= WF_ESIK.tekKatPay) : null,
      not: kat === 1 ? 'tek katta ölçülemez' : (karToplam <= 0 ? 'toplam test kârı yok' : null) },
    { ad: 'Birleşik test getirisi', deger: +birlesikDis.toFixed(2), esik: '> %0', gecti: birlesikDis > 0 }
  ];

  let overfittingStatus, statusColor;
  const kalan = kriterler.filter(x => x.gecti === false).length;
  if (!(gIcOrt > 0)) {
    overfittingStatus = 'EĞİTİMDE KÂR YOK — optimizasyon kârlı ayar bulamadı';
    statusColor = 'var(--accent-danger)';
  } else if (kalan === 0) {
    overfittingStatus = 'GEÇTİ — aşırı uyum işareti yok';
    statusColor = 'var(--accent-success)';
  } else if (birlesikDis <= 0 || (wfe != null && wfe < 25)) {
    overfittingStatus = 'KALDI — eğitimdeki kâr testte tekrarlanmadı';
    statusColor = 'var(--accent-danger)';
  } else {
    overfittingStatus = `SINIRDA — ${kalan} kriter geçmedi`;
    statusColor = 'var(--accent-warning)';
  }

  // Birleşik test Sharpe'ı: katların test bar getirileri uç uca.
  let disSharpe = null;
  if (disGetiriler.length > 2) {
    const ort = disGetiriler.reduce((t, x) => t + x, 0) / disGetiriler.length;
    const sd = Math.sqrt(disGetiriler.reduce((t, x) => t + (x - ort) ** 2, 0) / (disGetiriler.length - 1));
    disSharpe = sd > 0 ? +(ort / sd * Math.sqrt(barsPerYear(timeframe))).toFixed(2) : 0;
  }
  const ortalama = (alan) => +(katlar.reduce((t, x) => t + (x[alan] || 0), 0) / kat).toFixed(2);

  return {
    strategyName,
    yontem: kat > 1 ? 'kayan-pencere' : 'tek-bolme',
    katSayisi: kat,
    istenenKat,
    isinmaBar: isinma,
    totalCandles: N,
    inSampleCount: egitimUzunluk,
    outOfSampleCount: testToplam,
    testedPermutations: toplamPermutasyon,
    bestConfig: katlar[kat - 1] ? { ...baseConfig, ...katlar[kat - 1].ayar } : baseConfig,
    katlar: katlar.map(({ _gIc, _imza, ...x }) => x),
    farkliAyarSayisi: farkliAyar,
    inSampleMetrics: {
      totalReturnPct: ortalama('egitimGetiri'),
      annualizedPct: yillikla(gIcOrt, timeframe),
      totalTrades: katlar.reduce((t, x) => t + x.egitimIslem, 0)
    },
    outOfSampleMetrics: {
      totalReturnPct: +birlesikDis.toFixed(2),
      annualizedPct: yillikla(gDisToplam, timeframe),
      sharpeRatio: disSharpe,
      maxDrawdownPct: Math.max(...katlar.map(x => x.testMaxDD || 0)),
      totalTrades: testIslem
    },
    efficiencyRatio: wfe == null ? 0 : wfe,
    wfe,
    kriterler,
    uyarilar,
    overfittingStatus,
    statusColor
  };
}

module.exports = { optimizeGridFor, optimizeParameters, runWalkForward, isinmaBari };
