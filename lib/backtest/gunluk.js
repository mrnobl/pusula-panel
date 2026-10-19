/**
 * GÜNLÜK SERİ YARDIMCILARI — hedef-maruziyet stratejilerinin ölçümü için.
 *
 * `scripts/donchian-olcum.js` (tek varlık) ve `scripts/donchian-portfoy.js`
 * (çok varlık) aynı veriyi ve aynı metrikleri kullanır; iki kopya bu depoda
 * daha önce sessizce ayrıştı (bkz. PLAN-MOTOR M5, `htfTopla`).
 */
const path = require('path');
const yollar = require('../yollar');
const { DatabaseSync } = require('node:sqlite');

const GUN = 86400000;
let _db = null;
const db = () => (_db || (_db = new DatabaseSync(yollar.veri('market.db'), { readOnly: true })));

const perpSembol = (s) => (s.includes(':') ? s : `${s}:${s.split('/')[1]}`);

/** 4 saatlik perp mumlarından TAM günler (6 mum). */
function gunlukMumlar(sembol) {
  const perp = perpSembol(sembol);
  const satir = db().prepare(`SELECT time, open, high, low, close FROM candles
    WHERE venue='binance' AND market='perp' AND symbol=? AND timeframe='4h' ORDER BY time`).all(perp);
  const gunler = new Map();
  for (const m of satir) {
    const g = Math.floor(m.time / GUN) * GUN;
    if (!gunler.has(g)) gunler.set(g, []);
    gunler.get(g).push(m);
  }
  const mumlar = [];
  for (const [g, ms] of [...gunler.entries()].sort((a, b) => a[0] - b[0])) {
    if (ms.length !== 6) continue;
    mumlar.push({ time: g, open: ms[0].open, close: ms[5].close,
      high: Math.max(...ms.map(x => x.high)), low: Math.min(...ms.map(x => x.low)) });
  }
  let bosluk = 0;
  for (let i = 1; i < mumlar.length; i++) if (mumlar[i].time - mumlar[i - 1].time !== GUN) bosluk++;
  return { sembol: perp, mumlar, bosluk };
}

/** Gün başına toplam funding oranı (long pozitif oranda öder). */
function fundingGunluk(sembol) {
  const f = db().prepare(`SELECT time, rate FROM funding WHERE venue='binance' AND market='perp' AND symbol=? ORDER BY time`).all(perpSembol(sembol));
  const gunluk = new Map();
  for (const x of f) {
    const g = Math.floor(x.time / GUN) * GUN;
    gunluk.set(g, (gunluk.get(g) || 0) + x.rate);
  }
  return { gunluk, ilk: f.length ? f[0].time : null, adet: f.length };
}

/** Özsermaye eğrisinden Sharpe (365), CAGR, MaxDD; `dilim` = [bas, bit). */
function metrik(egri, dilim) {
  const e = dilim ? egri.filter(x => x.time >= dilim[0] && x.time < dilim[1]) : egri;
  if (e.length < 30) return null;
  const r = [];
  for (let i = 1; i < e.length; i++) r.push(e[i].oz / e[i - 1].oz - 1);
  const ort = r.reduce((s, x) => s + x, 0) / r.length;
  const sd = Math.sqrt(r.reduce((s, x) => s + (x - ort) ** 2, 0) / (r.length - 1));
  let tepe = e[0].oz, dd = 0;
  for (const x of e) { tepe = Math.max(tepe, x.oz); dd = Math.max(dd, 1 - x.oz / tepe); }
  const yil = (e[e.length - 1].time - e[0].time) / (365 * GUN);
  const toplam = e[e.length - 1].oz / e[0].oz - 1;
  return { sharpe: sd > 0 ? ort / sd * Math.sqrt(365) : 0, cagr: Math.pow(1 + toplam, 1 / yil) - 1, maxDD: dd, toplam, yil };
}

/** Takvim yılı getirileri ve kârları (yıl başı = önceki yıl sonu). */
function yillik(egri) {
  const y = new Map();
  for (const x of egri) {
    const yil = new Date(x.time).getUTCFullYear();
    if (!y.has(yil)) y.set(yil, { bas: x.oz, son: x.oz });
    y.get(yil).son = x.oz;
  }
  const sonuc = [];
  let onceki = null;
  for (const yil of [...y.keys()].sort()) {
    const bas = onceki ?? y.get(yil).bas;
    sonuc.push({ yil, getiri: y.get(yil).son / bas - 1, kar: y.get(yil).son - bas });
    onceki = y.get(yil).son;
  }
  return sonuc;
}

module.exports = { GUN, perpSembol, gunlukMumlar, fundingGunluk, metrik, yillik };
