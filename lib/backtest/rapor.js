/**
 * BACKTEST RAPORU — motor sonucunu panele gidecek biçime çevirir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN (2026-10-06)
 * ─────────────────────────────────────────────────────────────────────────
 * Motor bar başına ~140 bayt dizi döndürüyor (equityCurve + analytics.series
 * + marginSeries). 1m'de yıllarca koşu 500 MB+ JSON eder; V8'in metin sınırı
 * ~512 MB, tarayıcıda Chart.js nokta başına ~100 bayt meta tutar. Bu modül:
 *
 *   · METRİKLERE DOKUNMAZ — hepsi motorda tam çözünürlükte hesaplandı.
 *   · Bar başına dizileri en çok `maxNokta` noktaya indirir: her kovadan en
 *     düşük ve en yüksek özsermaye barı tutulur (tepe ve dip kaybolmaz),
 *     ilk ve son bar her zaman kalır. Tüm diziler AYNI indekslerle seyrelir.
 *   · Fiyat grafiği için mumları ≤ 5000 bara toplar (otomatik üst dilim) —
 *     panel eskiden ayrı istekle SON 5000 mumu çiziyordu, backtestin
 *     dönemini değil.
 *   · Aylık / yıllık getiri tablosunu tam çözünürlükten üretir.
 *   · Düşüş serisini "özsermaye − koşan tepe" olarak yeniden kurar; motorun
 *     `drawdown` serisi bar içi `close − low` idi (tepeden düşüş değil).
 *   · Varsayımları (komisyon, piyasa, kaldıraç, ısınma) sonuca yazar.
 */
const { FEE_PCT } = require('./constants');
const { TF_MS } = require('../veri/aralik');

const GRAFIK_DILIMLERI = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '3d', '1w'];

/** Kova başına min+max özsermaye indeksleri; sıralı, tekrarsız. */
function seyreltmeIndeksleri(degerler, maxNokta) {
  const n = degerler.length;
  if (n <= maxNokta) return null;
  const kova = Math.ceil(n / Math.floor(maxNokta / 2));
  const set = new Set([0, n - 1]);
  for (let b = 0; b < n; b += kova) {
    let iMin = b, iMax = b;
    const son = Math.min(n, b + kova);
    for (let i = b; i < son; i++) {
      if (degerler[i] < degerler[iMin]) iMin = i;
      if (degerler[i] > degerler[iMax]) iMax = i;
    }
    set.add(iMin); set.add(iMax);
  }
  return [...set].sort((a, b) => a - b);
}

const sec = (dizi, idx) => (Array.isArray(dizi) && idx ? idx.map(i => dizi[i]) : dizi);

/** Mumları ≤ hedefBar olacak en küçük dilime toplar. */
function fiyatGrafigi(mumlar, tf, hedefBar = 5000) {
  if (!mumlar || !mumlar.length) return { tf, mumlar: [] };
  const tabanMs = TF_MS[tf] || 0;
  const aralik = mumlar[mumlar.length - 1].time - mumlar[0].time;
  let secilen = tf, ms = tabanMs;
  for (const d of GRAFIK_DILIMLERI) {
    const dm = TF_MS[d];
    if (dm < tabanMs) continue;
    secilen = d; ms = dm;
    if (aralik / dm + 1 <= hedefBar) break;
  }
  const cikis = [];
  let kova = null;
  for (const m of mumlar) {
    const k = Math.floor(m.time / ms) * ms;
    if (!kova || kova.t !== k) {
      if (kova) cikis.push(kova);
      kova = { t: k, o: m.open, h: m.high, l: m.low, c: m.close };
    } else {
      if (m.high > kova.h) kova.h = m.high;
      if (m.low < kova.l) kova.l = m.low;
      kova.c = m.close;
    }
  }
  if (kova) cikis.push(kova);
  return { tf: secilen, tabanTf: tf, mumlar: cikis.map(x => ({ time: Math.floor(x.t / 1000), open: x.o, high: x.h, low: x.l, close: x.c })) };
}

/** Ay sonu özsermayesinden aylık getiri; yıl satırları ve yıllık toplam. */
function aylikGetiriler(egri) {
  const aylar = new Map();
  let ilk = null;
  for (const p of egri) {
    const z = Date.parse(p.time);
    if (!Number.isFinite(z)) continue;
    if (ilk == null) ilk = p.value;
    const d = new Date(z);
    aylar.set(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, p.value);
  }
  const yillar = new Map();
  let onceki = ilk;
  for (const [ay, deger] of aylar) {
    const yil = ay.slice(0, 4), a = +ay.slice(5);
    if (!yillar.has(yil)) yillar.set(yil, { yil: +yil, aylar: Array(12).fill(null), bas: onceki, son: deger });
    const y = yillar.get(yil);
    y.aylar[a - 1] = onceki > 0 ? +((deger / onceki - 1) * 100).toFixed(2) : null;
    y.son = deger;
    onceki = deger;
  }
  return [...yillar.values()].map(y => ({ yil: y.yil, aylar: y.aylar, toplam: y.bas > 0 ? +((y.son / y.bas - 1) * 100).toFixed(2) : null }));
}

/**
 * @param result  Backtester.run çıktısı (yerinde DEĞİŞTİRİLİR ve döndürülür)
 * @param mumlar  koşunun mumları
 * @param baglam  { symbol, timeframe, market, venue, leverage, bas, bit, maxNokta, maxIslem }
 */
function hazirla(result, mumlar, baglam = {}) {
  const maxNokta = baglam.maxNokta || 3000;
  const maxIslem = baglam.maxIslem || 20000;
  const egri = result.equityCurve || [];

  // 1. Tam çözünürlükten türetilenler (seyreltmeden ÖNCE).
  result.aylikGetiriler = aylikGetiriler(egri);
  const seri = result.analytics && result.analytics.series;
  if (seri && Array.isArray(seri.equity)) {
    let tepe = -Infinity, dip = Infinity;
    seri.drawdown = seri.equity.map(v => { tepe = Math.max(tepe, v); return +(v - tepe).toFixed(2); });
    seri.runUp = seri.equity.map(v => { dip = Math.min(dip, v); return +(v - dip).toFixed(2); });
    seri.anlam = { drawdown: 'özsermaye − koşan tepe (≤ 0)', runUp: 'özsermaye − koşan dip (≥ 0)' };
  }

  // 2. Seyreltme — tüm bar dizileri aynı indekslerle.
  const idx = seyreltmeIndeksleri(egri.map(p => p.value), maxNokta);
  if (idx) {
    result.equityCurve = sec(egri, idx);
    if (seri) {
      const n = seri.equity ? seri.equity.length : 0;
      // analytics.series eğriyle aynı barlardan (30. bardan) kurulur; uzunluk
      // tutmuyorsa kendi değerleri üzerinden ayrı seyreltilir.
      const sIdx = n === egri.length ? idx : seyreltmeIndeksleri(seri.equity || [], maxNokta);
      for (const k of ['time', 'equity', 'cumulativePnl', 'buyHold', 'runUp', 'drawdown']) seri[k] = sec(seri[k], sIdx);
      const cap = result.analytics.capital;
      if (cap && Array.isArray(cap.marginSeries) && cap.marginSeries.length === n) cap.marginSeries = sec(cap.marginSeries, sIdx);
    }
  }
  result.seyreltme = { tamBar: egri.length, gonderilen: result.equityCurve.length, yontem: idx ? 'kova başına en düşük + en yüksek özsermaye' : 'yok' };

  // 3. Fiyat grafiği — backtestin KENDİ dönemi.
  result.fiyat = fiyatGrafigi(mumlar, baglam.timeframe || result.timeframe);

  // 4. İşlem listesi — çok büyükse baş ve son; tamamı CSV ucundan.
  const islemSay = (result.trades || []).length;
  if (islemSay > maxIslem) {
    const yarim = Math.floor(maxIslem / 2);
    result.trades = [...result.trades.slice(0, yarim), ...result.trades.slice(-yarim)];
    result.islemlerKirpildi = { toplam: islemSay, gonderilen: result.trades.length };
  }
  if ((result.deals || []).length > maxIslem) {
    const yarim = Math.floor(maxIslem / 2);
    result.deals = [...result.deals.slice(0, yarim), ...result.deals.slice(-yarim)];
  }

  // 5. Vadeli iç verisi ayar alanına sızmasın (funding serisi binlerce satır).
  if (result.strategyConfig) {
    // Piyasa/kaldıraç/komisyon da bu KOŞUNUN bağlamıdır; "bota yükle" bunları
    // stratejinin kalıcı ayarına yazmamalı (eskiden `marketType:'perpetual'`
    // ve tüm funding serisi config.json'a yerleşiyordu).
    const { fundingSeries, contractSpecs, marginTiers, marketType, leverage, feePct, __optimizeParams, ...kalan } = result.strategyConfig;
    result.strategyConfig = kalan;
  }

  // 6. Varsayımlar — rapor hangi koşullarla ölçüldüğünü SÖYLEMELİ.
  const ilkM = mumlar && mumlar.length ? mumlar[0].time : null;
  const sonM = mumlar && mumlar.length ? mumlar[mumlar.length - 1].time : null;
  result.varsayimlar = {
    borsa: baglam.venue || 'binance',
    piyasa: baglam.market || 'spot',
    kaldirac: result.leverage || 1,
    komisyonPct: baglam.komisyonPct != null ? baglam.komisyonPct : +(FEE_PCT * 100).toFixed(3),
    komisyonNotu: (baglam.market === 'perp')
      ? 'Vadeli: borsanın taker ücreti (kontrat özelliklerinden) + funding.'
      : `Spot: tek yön %${(FEE_PCT * 100).toFixed(2)} (komisyon + kayma tek sayı).`,
    funding: result.fundingSource || null,
    isinmaBar: result.warmup ? result.warmup.bars : 30,
    dolum: 'Sinyal barının kapanışında; limit emir fiyata dokununca.',
    bas: ilkM ? new Date(ilkM).toISOString() : null,
    bit: sonM ? new Date(sonM).toISOString() : null,
    mumSayisi: mumlar ? mumlar.length : 0
  };

  // 7. Kriz dönemleri — ana grafiğin altın gölgeleri (Pusula §4a/4 grafik dili). TEK KAYNAK
  // portföy laboratuvarının stres listesi (lib/portfoy/motor.js STRES_DONEMLERI); yalnız koşu
  // aralığıyla kesişenler. TL krizleri (kod "-TL") kripto/hisse backtestinde anlamsız → dışarıda.
  result.krizDonemleri = krizDonemleri(ilkM, sonM);
  return result;
}

/** [bas, bit] (ms) ile kesişen stres dönemleri: { kod, ad, bas, bit } (ISO gün). */
function krizDonemleri(bas, bit) {
  if (!Number.isFinite(bas) || !Number.isFinite(bit)) return [];
  let liste = [];
  try { liste = require('../portfoy/motor').STRES_DONEMLERI || []; } catch (e) { return []; }
  return liste
    .filter(d => !/-TL$/.test(d.kod))
    .filter(d => Date.parse(d.bit) + 864e5 > bas && Date.parse(d.bas) < bit)
    .map(d => ({ kod: d.kod, ad: d.ad, bas: d.bas, bit: d.bit }));
}

module.exports = { hazirla, seyreltmeIndeksleri, fiyatGrafigi, aylikGetiriler, krizDonemleri };
