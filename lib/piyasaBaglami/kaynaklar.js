'use strict';
/**
 * PİYASA BAĞLAMI — AĞ KAYNAKLARI (73.9). Yalnız herkese açık, ücretsiz, anahtarsız uçlar; kişisel bilgi gönderilmez
 * (User-Agent "Pusula/<sürüm>"). Deribit'e BAĞLANILMAZ (Türkiye'den kapalı). Binance istekleri BinanceKota'dan geçer
 * (canlı botla ortak IP bütçesi, ortak 418/429 beklemesi). Diğer host'larda 429/418 → Http host beklemesi (lib/ileriKayit/kaynaklar).
 * Her kaynak `async (ctx) → veri` (küçük, ayrıştırılmış; ham sayfa saklanmaz). ctx = { http, kota(), uyu, simdi, dizin }.
 *
 * Saf ayrıştırıcılar (öz testli): fomcTakvimCoz, fredTakvimCoz, fedRssCoz, fedKararCoz, kesir.
 */
const M = require('../makroVeri');
const { binance } = require('../ileriKayit/kaynaklar');

const GUN = 864e5;
const gunStr = (t) => new Date(t).toISOString().slice(0, 10);
const AYLAR = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
const ayNo = (ad) => { const s = String(ad || '').trim(); const x = Object.entries(AYLAR).find(([k]) => k.slice(0, 3) === s.slice(0, 3)); return x ? x[1] : null; };
const pad = (n) => String(n).padStart(2, '0');

/** FRED serileri (Piyasa bağlamı makro kartları + olay sonuçları). */
const FRED_SERILER = Object.freeze({
  WALCL: 'Fed bilançosu (haftalık, milyon $)', WTREGEN: 'Hazine genel hesabı TGA (haftalık, milyon $)', RRPONTSYD: 'Gecelik ters repo (günlük, milyar $)',
  BAA10Y: "Moody's Baa − 10 yıl (kredi spreadi, puan)", CPIAUCSL: 'ABD TÜFE (aylık endeks, mevsimsellikten arındırılmış)', DFEDTARU: 'Fed politika faizi üst sınır', DFEDTARL: 'Fed politika faizi alt sınır',
});

async function metin(ctx, url, o = {}) { return (await ctx.http.istek(url, { ...o, metinIsle: (r) => r.text() })).veri; }

// ── FRED ─────────────────────────────────────────────────────────────────────
async function fred(ctx, { seriler = Object.keys(FRED_SERILER), yil = 3 } = {}) {
  const bas = gunStr(ctx.simdi() - yil * 365 * GUN);
  const out = {}, hatalar = [];
  for (const id of seriler) {
    try { out[id] = M.fredSayisal(M.fredCsvCoz(await metin(ctx, M.fredUrl(id, bas)))); }
    catch (e) { hatalar.push(`${id}: ${String(e.message).slice(0, 120)}`); if (/hız sınırı|beklemesi/.test(e.message)) break; }
    await ctx.uyu(1200);
  }
  if (!Object.keys(out).length) throw new Error(hatalar[0] || 'FRED: veri yok');
  return { seriler: out, hatalar };
}

// ── CFTC COT ─────────────────────────────────────────────────────────────────
async function cftc(ctx) {
  const out = {};
  for (const [ad, kod] of Object.entries(M.CFTC_KODLAR)) {
    const j = (await ctx.http.istek(M.cftcUrl(kod, { limit: 60, sira: 'DESC' }))).veri;
    if (!Array.isArray(j)) throw new Error(`CFTC ${kod}: beklenmeyen yanıt`);
    out[ad] = j;
    await ctx.uyu(1500);
  }
  return out;
}

// ── Coinbase primi (saatlik) ─────────────────────────────────────────────────
async function coinbase(ctx) {
  const mum = async (urun) => {
    const j = (await ctx.http.istek(M.coinbaseMumUrl(urun, 3600))).veri;
    if (!Array.isArray(j)) throw new Error(`Coinbase ${urun}: beklenmeyen yanıt`);
    return j.map(x => [x[0] * 1000, Number(x[4])]).filter(x => x[1] > 0).sort((a, b) => a[0] - b[0]);
  };
  const cb = await mum('BTC-USD');
  await ctx.uyu(800);
  const usdt = await mum('USDT-USD');
  const bn = await binance(ctx, ctx.kota(), 'spot', 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=300');
  return { cb, usdt, bn: (Array.isArray(bn) ? bn : []).map(x => [Number(x[0]), Number(x[4])]) };
}

// ── Binance vadeli: funding (tümü) + çeyreklik baz ────────────────────────────
async function binanceVadeli(ctx) {
  const kota = ctx.kota();
  const prim = await binance(ctx, kota, 'perp', 'https://fapi.binance.com/fapi/v1/premiumIndex');
  const baz = {};
  for (const pair of ['BTCUSDT', 'ETHUSDT']) {
    try { baz[pair] = await binance(ctx, kota, 'perp', `https://fapi.binance.com/futures/data/basis?pair=${pair}&contractType=CURRENT_QUARTER&period=1h&limit=168`); }
    catch (e) { baz[pair] = { hata: String(e.message).slice(0, 120) }; }
  }
  return { prim: (Array.isArray(prim) ? prim : []).map(x => ({ symbol: x.symbol, lastFundingRate: x.lastFundingRate, markPrice: x.markPrice, indexPrice: x.indexPrice, nextFundingTime: x.nextFundingTime })), baz };
}

// ── Korku-açgözlülük (alternative.me) ────────────────────────────────────────
async function korku(ctx) {
  const j = (await ctx.http.istek('https://api.alternative.me/fng/?limit=60&format=json')).veri;
  if (!j || !Array.isArray(j.data)) throw new Error('alternative.me: beklenmeyen yanıt');
  return j.data.map(x => ({ value: x.value, value_classification: x.value_classification, timestamp: x.timestamp }));
}

// ── Stablecoin arzı (DefiLlama) ──────────────────────────────────────────────
async function stablecoin(ctx) {
  const j = (await ctx.http.istek('https://stablecoins.llama.fi/stablecoincharts/all', { zamanAsimiMs: 60000 })).veri;
  if (!Array.isArray(j)) throw new Error('DefiLlama stablecoin: beklenmeyen yanıt');
  return j.slice(-420).map(x => ({ d: gunStr(Number(x.date) * 1000), v: Number(x.totalCirculatingUSD && x.totalCirculatingUSD.peggedUSD) })).filter(x => x.v > 0);
}

// ── MVRV (Coin Metrics Community, CC BY-NC 4.0) ──────────────────────────────
async function mvrv(ctx) {
  const bas = gunStr(ctx.simdi() - 400 * GUN);
  const j = (await ctx.http.istek(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur&frequency=1d&start_time=${bas}&page_size=1000`, { zamanAsimiMs: 60000 })).veri;
  if (!j || !Array.isArray(j.data)) throw new Error('Coin Metrics: beklenmeyen yanıt');
  return j.data.map(x => ({ d: String(x.time).slice(0, 10), v: Number(x.CapMVRVCur) })).filter(x => Number.isFinite(x.v));
}

// ── SEK=X (sentetik dolar endeksinin tek eksik kuru; diğerleri sunucunun Yahoo portföy serilerinde) ──
/**
 * Saf: Yahoo v8 chart yanıtı → [{ t (borsa yerel takvim günü, UTC 00:00 ms), c }] — lib/portfoy/indir.js yahooDonustur ile aynı gün kuralı
 * (gmtoffset; aynı güne düşen ikinci satır öncekinin yerine geçer).
 */
function yahooGunleri(j) {
  const x = j && j.chart && j.chart.result && j.chart.result[0];
  if (!x || !Array.isArray(x.timestamp)) return [];
  const q = (x.indicators && x.indicators.quote && x.indicators.quote[0]) || {};
  const ofset = x.meta && x.meta.gmtoffset != null ? x.meta.gmtoffset : 0;
  const out = [];
  for (let i = 0; i < x.timestamp.length; i++) {
    const c = q.close && q.close[i];
    if (!(c > 0)) continue;
    const d = new Date((x.timestamp[i] + ofset) * 1000);
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (out.length && out[out.length - 1].t === t) out[out.length - 1] = { t, c }; else out.push({ t, c });
  }
  return out;
}
async function sek(ctx) {
  const j = (await ctx.http.istek('https://query1.finance.yahoo.com/v8/finance/chart/SEK%3DX?range=2y&interval=1d')).veri;
  const gunler = yahooGunleri(j);
  if (gunler.length < 30) throw new Error('Yahoo SEK=X: beklenmeyen yanıt (gün yok)');
  const fs = require('fs');
  const path = require('path');
  const f = path.join(ctx.dizin('yahoo'), 'SEK_X.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify({ sembol: 'SEK=X', kaynak: 'Yahoo Finance v8 chart', indirme: new Date(ctx.simdi()).toISOString(), gunler }));
  fs.renameSync(f + '.tmp', f);
  return { son: gunStr(gunler[gunler.length - 1].t), gun: gunler.length };
}

// ── FOMC takvimi (federalreserve.gov) ────────────────────────────────────────
/** Saf: fomccalendars.htm → planlı toplantıların son günü (karar günü). scripts/qqq-ay-donumu.js fomcIndir ile aynı kalıp. */
function fomcTakvimCoz(h) {
  const out = [];
  const bol = String(h || '').split(/(\d{4}) FOMC Meetings/);
  for (let k = 1; k < bol.length; k += 2) {
    const yil = +bol[k];
    const re = /fomc-meeting__month[^>]*><strong>([^<]+)<\/strong><\/div>\s*<div class="fomc-meeting__date[^>]*>([^<]+)<\/div>/g;
    let m;
    while ((m = re.exec(bol[k + 1]))) {
      const ayAd = m[1].trim(), gun = m[2].trim();
      if (/unscheduled|notation|conference|cancel/i.test(gun + ayAd)) continue;
      const sonAy = ayAd.split('/').map(x => x.trim()).pop();
      const a = ayNo(sonAy), g = +(gun.replace(/\*/g, '').replace(/\(.*\)/, '').trim().split('-').pop());
      if (!a || !g) continue;
      out.push({ gun: `${yil}-${pad(a)}-${pad(g)}`, sep: /\*/.test(gun) });
    }
  }
  const tek = new Map(out.map(x => [x.gun, x]));
  return [...tek.values()].sort((a, b) => (a.gun < b.gun ? -1 : 1));
}
async function fomc(ctx) {
  const l = fomcTakvimCoz(await metin(ctx, 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', { zamanAsimiMs: 60000 }));
  if (!l.length) throw new Error('FOMC takvimi ayrıştırılamadı (sayfa biçimi değişmiş olabilir)');
  return l;
}

// ── ABD TÜFE takvimi (FRED yayın takvimi, rid=10; BLS sayfası otomatik isteği 403 ile reddediyor) ──
/** Saf: FRED releases/calendar sayfası → [{ gun, saat (America/Chicago 'HH:MM') }]. */
function fredTakvimCoz(h) {
  const out = [];
  const re = /font-weight: bold;">\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})\s*<\/span>[\s\S]{0,600}?(\d{1,2}):(\d{2})\s*(am|pm)/g;
  let m;
  while ((m = re.exec(String(h || '')))) {
    const a = AYLAR[m[1]]; if (!a) continue;
    let s = +m[4] % 12; if (m[6] === 'pm') s += 12;
    out.push({ gun: `${m[3]}-${pad(a)}-${pad(+m[2])}`, saat: `${pad(s)}:${m[5]}` });
  }
  return out;
}
async function abdTufe(ctx) {
  const y = new Date(ctx.simdi()).getUTCFullYear();
  const out = [];
  for (const yil of [y, y + 1]) {
    try { out.push(...fredTakvimCoz(await metin(ctx, `https://fred.stlouisfed.org/releases/calendar?rid=10&y=${yil}`, { zamanAsimiMs: 60000 }))); }
    catch (e) { if (yil === y) throw e; }
    await ctx.uyu(1500);
  }
  if (!out.length) throw new Error('FRED TÜFE takvimi ayrıştırılamadı (sayfa biçimi değişmiş olabilir)');
  return [...new Map(out.map(x => [x.gun, x])).values()].sort((a, b) => (a.gun < b.gun ? -1 : 1));
}

// ── FOMC kararı (Fed para politikası RSS + açıklama sayfası) ──────────────────
/** Saf: RSS → [{ baslik, link, zaman }] (yalnız "FOMC statement"). */
function fedRssCoz(xml) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  const al = (s, ad) => { const x = new RegExp(`<${ad}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${ad}>`).exec(s); return x ? x[1].trim() : null; };
  while ((m = re.exec(String(xml || '')))) {
    const baslik = al(m[1], 'title'), link = al(m[1], 'link'), z = Date.parse(al(m[1], 'pubDate') || '');
    if (baslik && /FOMC statement/i.test(baslik) && /^https:\/\/www\.federalreserve\.gov\//.test(link || '')) out.push({ baslik, link, zaman: Number.isFinite(z) ? z : null });
  }
  return out;
}
/** Saf: "3-3/4" → 3,75 · "1/4" → 0,25 · "4" → 4. */
function kesir(s) {
  const t = String(s || '').trim();
  let m = /^(\d+)-(\d+)\/(\d+)$/.exec(t); if (m) return +m[1] + +m[2] / +m[3];
  m = /^(\d+)\/(\d+)$/.exec(t); if (m) return +m[1] / +m[2];
  m = /^(\d+(?:\.\d+)?)$/.exec(t); return m ? +m[1] : null;
}
/** Saf: FOMC açıklama sayfası → { yon: 'sabit'|'artirdi'|'indirdi', adim (puan), alt, ust } | null. */
function fedKararCoz(html) {
  const t = String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const m = /decided to (maintain|raise|lower) the target range for the federal funds rate (?:at|by ([\d/-]+) percentage points? to) ([\d/-]+) to ([\d/-]+) percent/i.exec(t);
  if (!m) return null;
  const alt = kesir(m[3]), ust = kesir(m[4]);
  if (alt == null || ust == null) return null;
  return { yon: m[1].toLowerCase() === 'maintain' ? 'sabit' : m[1].toLowerCase() === 'raise' ? 'artirdi' : 'indirdi', adim: m[2] ? kesir(m[2]) : 0, alt, ust };
}
/** O günün (UTC) FOMC açıklamasını arar; bulursa kararı ayrıştırır. */
async function fedKarar(ctx, gun) {
  const l = fedRssCoz(await metin(ctx, 'https://www.federalreserve.gov/feeds/press_monetary.xml'));
  const x = l.find(i => (i.zaman && gunStr(i.zaman) === gun) || i.link.includes(`monetary${gun.replace(/-/g, '')}`));
  if (!x) return null;
  await ctx.uyu(1000);
  const k = fedKararCoz(await metin(ctx, x.link));
  return { gun, link: x.link, zaman: x.zaman, karar: k };
}

module.exports = { FRED_SERILER, fred, cftc, coinbase, binanceVadeli, korku, stablecoin, mvrv, sek, yahooGunleri, fomc, fomcTakvimCoz, abdTufe, fredTakvimCoz, fedRssCoz, kesir, fedKararCoz, fedKarar };
