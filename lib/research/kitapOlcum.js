/**
 * KİTAP STRATEJİLERİ — portföy ölçümü (PLAN-KITAP-STRATEJI.md).
 *
 * Her strateji 15 varlıkta motorla (`Backtester.run`) ayrı ayrı koşar:
 * Binance USDⓈ-M perp günlük mumlar, 1x, taker %0,05, gerçek funding.
 * Portföy birleştirme stratejinin boyutlama türüne göre:
 *   · 'portfoyRiski' (Clenow): boyut zaten "portföy × risk / σ" — kitapta her
 *     pozisyon TÜM portföy üzerinden boyutlanır. Portföy kârı = varlık
 *     kârlarının TOPLAMI.
 *   · 'sermayePayi' (Connors): boyut nakdin yüzdesi → eşit ağırlık,
 *     portföy = varlık özsermayelerinin ORTALAMASI.
 * Betik (`scripts/kitap-stratejileri-olcum.js`) ve panel aynı modülü kullanır.
 */
const B = require('../backtester');
const G = require('../backtest/gunluk');
const catalog = require('../strategies/catalog');
const { VARSAYILAN_VARLIKLAR } = require('./donchianPortfoy');

const BAS = Date.UTC(2020, 8, 3);       // Donchian portföy ölçümüyle aynı başlangıç
const SERMAYE = 10000;

function metrik(egri) {
  if (egri.length < 30) return null;
  const r = [];
  for (let i = 1; i < egri.length; i++) r.push(egri[i].oz / egri[i - 1].oz - 1);
  const ort = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - ort) ** 2, 0) / (r.length - 1));
  let tepe = egri[0].oz, dd = 0;
  for (const x of egri) { tepe = Math.max(tepe, x.oz); dd = Math.max(dd, 1 - x.oz / tepe); }
  const yil = (egri[egri.length - 1].time - egri[0].time) / (365.25 * 864e5);
  const toplam = egri[egri.length - 1].oz / egri[0].oz - 1;
  return { sharpe: sd > 0 ? ort / sd * Math.sqrt(365) : 0, cagr: toplam > -1 ? Math.pow(1 + toplam, 1 / yil) - 1 : -1, maxDD: dd, toplam, getiriler: r };
}

function korelasyon(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 30) return null;
  let sa = 0, sb = 0; for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let c = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return va > 0 && vb > 0 ? c / Math.sqrt(va * vb) : null;
}

/** Bir strateji × bir varlık: günlük özsermaye haritası ve özet. */
function varlikKos(anahtar, sembol, ayarEk = {}) {
  const { mumlar } = G.gunlukMumlar(sembol);
  if (mumlar.length < 400) return null;
  const f = G.fundingGunluk(sembol);
  const fundingSeries = [...f.gunluk.entries()].map(([time, rate]) => ({ time, rate }));
  const r = B.run(anahtar, {
    marketType: 'perpetual', leverage: 1, contractSpecs: { taker: 0.0005, maker: 0.0002 }, fundingSeries, ...ayarEk
  }, mumlar.map(m => ({ ...m, volume: 0 })), SERMAYE, '1d', { trace: false });
  const gun = new Map();
  for (const p of r.equityCurve) gun.set(Math.floor(Date.parse(p.time) / 864e5) * 864e5, p.value);
  return { sembol, gun, islem: r.totalTrades, getiri: r.totalReturnPct, maxDD: r.maxDrawdownPct, likidasyon: r.liquidations || 0 };
}

/**
 * @param anahtar katalog anahtarı
 * @param secenek { semboller, donchianGetirileri (korelasyon için) }
 */
function olc(anahtar, secenek = {}) {
  const kayit = catalog.get(anahtar);
  if (!kayit) throw new Error(`Bilinmeyen strateji: ${anahtar}`);
  const boyutlama = kayit.Class.boyutlama || 'sermayePayi';
  const semboller = secenek.semboller || VARSAYILAN_VARLIKLAR;
  const kosular = semboller.map(s => varlikKos(anahtar, s, secenek.ayar)).filter(Boolean);
  if (!kosular.length) throw new Error('Ölçüm verisi yok (4h perp mumları)');

  // Ortak takvim: BAS'tan son güne. Varlık henüz yoksa / ısınmadaysa düz SERMAYE.
  const gunler = [...new Set(kosular.flatMap(k => [...k.gun.keys()]))].filter(t => t >= BAS).sort((a, b) => a - b);
  const sonDeger = new Map(kosular.map(k => [k.sembol, SERMAYE]));
  const basDeger = new Map();
  const egri = [];
  for (const t of gunler) {
    let toplamKar = 0, ortalama = 0;
    for (const k of kosular) {
      if (k.gun.has(t)) sonDeger.set(k.sembol, k.gun.get(t));
      if (!basDeger.has(k.sembol) && k.gun.has(t)) basDeger.set(k.sembol, k.gun.get(t));
      // Varlığın BAS'tan önceki kârı ölçüme girmez: başlangıca göre değişim.
      const b = basDeger.get(k.sembol) || SERMAYE;
      const v = sonDeger.get(k.sembol);
      toplamKar += v - b;
      ortalama += (v / b) * SERMAYE;
    }
    const oz = boyutlama === 'portfoyRiski' ? SERMAYE + toplamKar : ortalama / kosular.length;
    egri.push({ time: t, oz });
  }
  const m = metrik(egri);

  // Varlık başına net (BAS sonrası).
  const varliklar = kosular.map(k => {
    const b = basDeger.get(k.sembol) || SERMAYE;
    return { sembol: k.sembol, getiri: (sonDeger.get(k.sembol) / b - 1), islem: k.islem, likidasyon: k.likidasyon };
  });
  const pozitif = varliklar.filter(v => v.getiri > 0).length;
  const islem = kosular.reduce((t, k) => t + k.islem, 0);

  // Yıllık kâr payı.
  const yillar = new Map();
  let onceki = egri[0].oz;
  for (const p of egri) {
    const y = new Date(p.time).getUTCFullYear();
    if (!yillar.has(y)) yillar.set(y, { bas: onceki, son: p.oz });
    yillar.get(y).son = p.oz; onceki = p.oz;
  }
  const yillik = [...yillar.entries()].map(([yil, v]) => ({ yil, getiri: v.son / v.bas - 1, kar: v.son - v.bas }));
  const toplamKar = egri[egri.length - 1].oz - egri[0].oz;
  const enBuyuk = yillik.reduce((a, b) => (b.kar > a.kar ? b : a));
  const tekYilPay = toplamKar > 0 ? enBuyuk.kar / toplamKar : null;

  let kor = null;
  if (secenek.donchianEgri) {
    const dm = new Map(secenek.donchianEgri.map(x => [x.time, x.oz]));
    const a = [], b = [];
    for (let i = 1; i < egri.length; i++) {
      const t0 = egri[i - 1].time, t1 = egri[i].time;
      if (dm.has(t0) && dm.has(t1)) { a.push(egri[i].oz / egri[i - 1].oz - 1); b.push(dm.get(t1) / dm.get(t0) - 1); }
    }
    kor = korelasyon(a, b);
  }

  const kriterler = [
    { no: 1, ad: 'Portföy net Sharpe ≥ 0,5', deger: m.sharpe, gecti: m.sharpe >= 0.5, sonuc: 'ÖLDÜR' },
    { no: 2, ad: 'En büyük düşüş ≤ %35', deger: m.maxDD, gecti: m.maxDD <= 0.35, sonuc: 'ÖLDÜR' },
    { no: 3, ad: '15 varlığın en az 8\'i net pozitif', deger: pozitif, gecti: pozitif >= 8, sonuc: 'ÖLDÜR' },
    { no: 4, ad: 'Toplam işlem ≥ 60', deger: islem, gecti: islem >= 60, sonuc: 'BEKLET' },
    { no: 5, ad: `Tek yıl net kârın ≤ %50'si (${enBuyuk.yil})`, deger: tekYilPay, gecti: !(tekYilPay > 0.5), sonuc: 'BEKLET' }
  ];
  const olumcul = kriterler.some(k => k.sonuc === 'ÖLDÜR' && !k.gecti);
  const beklet = kriterler.some(k => k.sonuc === 'BEKLET' && !k.gecti);
  const yuv = (x, b = 4) => (x == null ? null : +x.toFixed(b));
  return {
    anahtar, ad: kayit.label, boyutlama,
    donem: { bas: new Date(egri[0].time).toISOString().slice(0, 10), bit: new Date(egri[egri.length - 1].time).toISOString().slice(0, 10) },
    metrik: { sharpe: yuv(m.sharpe, 2), cagr: yuv(m.cagr), maxDD: yuv(m.maxDD), toplam: yuv(m.toplam) },
    islem, pozitifVarlik: pozitif, varlikSayisi: kosular.length,
    varliklar: varliklar.map(v => ({ ...v, getiri: yuv(v.getiri) })),
    yillik: yillik.map(y => ({ yil: y.yil, getiri: yuv(y.getiri) })),
    donchianKorelasyon: yuv(kor, 2),
    kriterler: kriterler.map(k => ({ ...k, deger: typeof k.deger === 'number' ? yuv(k.deger) : k.deger })),
    karar: olumcul ? 'ÖLDÜ' : (beklet ? 'BEKLET' : 'GEÇTİ'),
    // Tam günlük eğri — birleşik portföy ölçümü için (panel seyreltilmişini kullanır).
    _egri: egri,
    egri: egri.filter((_, i) => i % 7 === 0 || i === egri.length - 1).map(x => ({ t: new Date(x.time).toISOString().slice(0, 10), oz: +(x.oz / SERMAYE).toFixed(4) }))
  };
}

module.exports = { olc, BAS };
