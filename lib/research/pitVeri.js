/**
 * NOKTA-ZAMANLI (PIT) VERİ — Binance USDⓈ-M perp günlük arşivi (listeden
 * çıkanlar DAHİL, `scripts/arsiv-indir.js`). PLAN-HAYATTA-KALMA.md kuralı:
 * her ay başı, o güne kadarki son 30 günün ortalama USDT hacmine göre ilk K.
 *
 * Tüm veri bir kez yüklenir ve önbellekte tutulur.
 */
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { tradfiMi } = require('../veri/tradfi');

const GUN = 864e5;
const STABIL = /^(USDC|BUSD|TUSD|FDUSD|USDP|DAI|UST|USTC|EUR|GBP|AEUR|PAX|USDE|RLUSD|USD1|BFUSD)\//;
let _onbellek = null;

/**
 * VERI_KESIM (ISO gün, PLAN-COKLU-TABAN holdout koruması): tanımlıysa barlar ve funding SQL'de `time < kesim` ile okunur —
 * kesim günü ve sonrası belleğe hiç girmez. Tanımsızken (varsayılan) sorgular ve davranış BİREBİR eskisi.
 */
function kesimMs() {
  const k = process.env.VERI_KESIM;
  if (k == null || k === '') return null;
  const t = Date.parse(k + 'T00:00:00Z');
  if (!Number.isFinite(t)) throw new Error(`VERI_KESIM geçersiz: ${k}`);
  return t;
}
/**
 * VERI_BOZ (ISO gün, yalnız bakmama testi): bu günden itibaren barlar ve funding SENTETİK değerlerle değiştirilir (sembol başına
 * tohumlu rastgele yürüyüş, gerçek değerlerden bağımsız). Bozma tarihinden önceki her sonuç aynı kalmalı (nedensellik).
 */
function bozMs() {
  const k = process.env.VERI_BOZ;
  if (k == null || k === '') return null;
  const t = Date.parse(k + 'T00:00:00Z');
  if (!Number.isFinite(t)) throw new Error(`VERI_BOZ geçersiz: ${k}`);
  return t;
}
function bozRastgele(s) {
  let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  let x = h >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
function barBoz(s, m) {
  const B = bozMs(); if (B == null) return m;
  const R = bozRastgele(s);
  let onceki = null;
  return m.map(b => {
    if (b.time < B) { onceki = b.close; return b; }
    const o = onceki != null ? onceki : 1;
    const c = o * Math.exp(0.08 * (R() - 0.5));
    onceki = c;
    return { time: b.time, open: o, high: Math.max(o, c) * (1 + 0.03 * R()), low: Math.min(o, c) * (1 - 0.03 * R()), close: c, volume: (1e5 + 1e8 * R()) / c };
  });
}
function fonBoz(s, satirlar) {
  const B = bozMs(); if (B == null) return satirlar;
  const R = bozRastgele('fon:' + s);
  return satirlar.map(f => (f.time < B ? f : { time: f.time, rate: 0.002 * (R() - 0.5) }));
}
/** capraz-marj-sim.js ham funding sorgusu için: kesim SQL'de, BOZ sonra. Varsayılanda eski sorgu. */
function fonSorgu(db) {
  const K = kesimMs();
  const st = K == null
    ? db.prepare(`SELECT time, rate FROM funding WHERE venue='binance' AND market='perp' AND symbol=? ORDER BY time`)
    : db.prepare(`SELECT time, rate FROM funding WHERE venue='binance' AND market='perp' AND symbol=? AND time < ? ORDER BY time`);
  return { all: (s) => fonBoz(s, K == null ? st.all(s) : st.all(s, K)) };
}

function yukle() {
  if (_onbellek) return _onbellek;
  // MARKET_DB (PLAN-GOMLEK G2): veritabanı yolu (kökten göreli ya da mutlak); varsayılan data/market.db.
  const ROOT = path.join(__dirname, '..', '..');
  const db = new DatabaseSync(process.env.MARKET_DB ? path.resolve(ROOT, process.env.MARKET_DB) : path.join(ROOT, 'data', 'market.db'), { readOnly: true });
  // FUNDING_SABIT (8 saatlik oran, PLAN-GOMLEK G2): tanımlıysa her barın günü için funding = 3 × oran (DB okunmaz).
  const SABIT = process.env.FUNDING_SABIT != null && process.env.FUNDING_SABIT !== '' ? Number(process.env.FUNDING_SABIT) : null;
  const semboller = db.prepare(`SELECT DISTINCT symbol FROM candles WHERE venue='binance' AND market='perp' AND timeframe='1d'`).all().map(r => r.symbol).filter(s => !STABIL.test(s) && !tradfiMi(s));   // TradFi hariç (lib/veri/tradfi.js)
  const mumOku = db.prepare(`SELECT time, open, high, low, close, volume FROM candles WHERE venue='binance' AND market='perp' AND timeframe='1d' AND symbol=? ORDER BY time`);
  const fonOku = db.prepare(`SELECT time, rate FROM funding WHERE venue='binance' AND market='perp' AND symbol=? ORDER BY time`);
  // VERI_KESIM / VERI_BOZ (PLAN-COKLU-TABAN): tanımsızken yukarıdaki sorgular aynen kullanılır.
  const KES = kesimMs();
  const mumOkuK = KES == null ? null : db.prepare(`SELECT time, open, high, low, close, volume FROM candles WHERE venue='binance' AND market='perp' AND timeframe='1d' AND symbol=? AND time < ? ORDER BY time`);
  const fonOkuK = KES == null ? null : db.prepare(`SELECT time, rate FROM funding WHERE venue='binance' AND market='perp' AND symbol=? AND time < ? ORDER BY time`);
  const BOZ = bozMs() != null;
  const seri = new Map();
  for (const s of semboller) {
    const m = KES == null ? (BOZ ? barBoz(s, mumOku.all(s)) : mumOku.all(s)) : barBoz(s, mumOkuK.all(s, KES));
    if (m.length < 30) continue;
    const indeks = new Map(m.map((x, i) => [x.time, i]));
    const fon = new Map();
    if (SABIT != null) for (const x of m) fon.set(Math.floor(x.time / GUN) * GUN, 3 * SABIT);
    else for (const f of (KES == null ? (BOZ ? fonBoz(s, fonOku.all(s)) : fonOku.all(s)) : fonBoz(s, fonOkuK.all(s, KES)))) { const g = Math.floor(f.time / GUN) * GUN; fon.set(g, (fon.get(g) || 0) + f.rate); }
    seri.set(s, { m, indeks, fon });
  }
  // EK_SERI (PLAN-HUCUM-VARLIK 807–814): <json yolu> { sembol: [{time,open,high,low,close,volume}] } — seri haritasına
  // DOĞRUDAN eklenir (STABIL/tradfiMi süzgecinden geçmez), funding 0. Tanımsızken hiçbir şey değişmez.
  if (process.env.EK_SERI) {
    const ek = JSON.parse(require('fs').readFileSync(path.resolve(ROOT, process.env.EK_SERI), 'utf8'));
    for (const [s, m0] of Object.entries(ek)) { const m = KES == null ? m0 : m0.filter(x => x.time < KES); seri.set(s, { m, indeks: new Map(m.map((x, i) => [x.time, i])), fon: new Map() }); }
  }
  _onbellek = { seri, takvim: [...new Set([...seri.values()].flatMap(x => x.m.map(y => y.time)))].sort((a, b) => a - b) };
  return _onbellek;
}

/** Ay başı → ilk K sembol (son 30 günün ortalama USDT hacmi, ≥ 30 gün geçmiş). */
function evrenKur(K = 15, bas = Date.UTC(2020, 8, 1)) {
  const { seri } = yukle();
  const evren = new Map();
  for (let d = new Date(bas); d.getTime() < Date.now(); d.setUTCMonth(d.getUTCMonth() + 1)) {
    const ay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const puan = [];
    for (const [s, { m, indeks }] of seri) {
      const son = indeks.get(ay - GUN);
      if (son == null || son < 29) continue;
      let t = 0; for (let j = son - 29; j <= son; j++) t += m[j].volume * m[j].close;
      puan.push([s, t / 30]);
    }
    puan.sort((a, b) => b[1] - a[1]);
    evren.set(ay, puan.slice(0, K).map(x => x[0]));
  }
  return evren;
}

const ayBasi = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };

/** Süreç önbelleğini düşür (market.db güncellendi — lib/veri/orkestrator.js çağırır). */
function onbellekTemizle() { _onbellek = null; }

module.exports = { yukle, evrenKur, ayBasi, GUN, onbellekTemizle, kesimMs, bozMs, fonSorgu };
