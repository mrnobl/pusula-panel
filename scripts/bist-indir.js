#!/usr/bin/env node
/**
 * BIST VERİ İNDİRİCİ — PLAN-BIST.md.
 *   node scripts/bist-indir.js            # hepsini indir (var olanı yeniler)
 *   node scripts/bist-indir.js --denetle  # yalnız veri kalitesi raporu
 *   node scripts/bist-indir.js TRMET.IS   # yalnız verilen semboller
 *
 * Kaynak: Yahoo Finance chart API (v8), günlük OHLCV + adjclose + temettü + bölünme.
 * Çıktı: data/bist/<SEMBOL>.json  { sembol, kaynak, indirme, gunler:[{t,o,h,l,c,ac,v}], temettu, bolunme }
 *   t = gün (UTC gece yarısı, ms), c = ham kapanış, ac = düzeltilmiş kapanış
 *   (bölünme + temettü). o/h/l HAM; simülasyon düzeltme oranını (ac/c) o/h/l'ye uygular.
 *
 * EVREN ADAYLARI: güncel BIST 30 (2026-07-01 → 09-30 dönemi) + 2012'den beri
 * BIST 30'da bulunduğu bilinen/olası eski üyeler (bellekten derlendi, eksik olabilir —
 * Borsa İstanbul'un tam dönemsel üye arşivine ulaşılamadı). Ölçümde evren AY BAŞINDA
 * yalnız geçmiş veriyle (3 aylık medyan TL işlem hacmi top-30) seçilir.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const DIR = yollar.veri('bist');

const GUNCEL = ['AEFES','AKBNK','ASELS','ASTOR','BIMAS','DSTKF','EKGYO','ENKAI','EREGL','FROTO','GARAN','GUBRF','ISCTR','KCHOL','KRDMD','MGROS','PETKM','PGSUS','SAHOL','SASA','SISE','TAVHL','TCELL','THYAO','TOASO','TRALT','TTKOM','TUPRS','VAKBN','YKBNK'];
const ESKI = ['ARCLK','KOZAL','KOZAA','TKFEN','SODA','TRKCM','ANACM','HALKB','ULKER','DOHOL','ENJSA','VESTL','OTKAR','CCOLA','AKSEN','ODAS','ALARK','OYAKC','HEKTS','ISDMR','BRSAN','CIMSA','KONTR','SMRTG','ALFAS','AKSA','TSKB','DOAS','IPEKE','TTRAK','ZOREN','ASYAB','AGHOL','SKBNK','ALBRK','ECILC','AKENR','GOZDE','TRGYO','GSDHO','NETAS','KARSN','YAZIC','BAGFS','ISGYO','MPARK','CWENE','EUPWR','GESAN','KTLEV','REEDR','TURSG','ISMEN','BRYAT','ENERY','CANTE','MAVI','TABGD','BTCIM','OBAMS','PASEU','GRSEL','KLRHO','RALYH','EFORC','MIATK','SELEC','LOGO','TATGD','TRMET','TRENJ'];
const DIGER = ['XU030.IS', 'XU100.IS', 'USDTRY=X', 'BTC-USD'];

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' };
const GUN = 864e5;

async function getir(y) {
  const p1 = Date.UTC(2005, 0, 1) / 1000, p2 = Math.floor(Date.now() / 1000);
  for (const host of ['query1', 'query2']) {
    for (let deneme = 0; deneme < 3; deneme++) {
      try {
        const u = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?period1=${p1}&period2=${p2}&interval=1d&events=div%2Csplit`;
        const r = await fetch(u, { headers: UA });
        if (r.status === 404) return null;
        if (!r.ok) { await new Promise(s => setTimeout(s, 1500 * (deneme + 1))); continue; }
        const j = await r.json();
        const x = j.chart && j.chart.result && j.chart.result[0];
        if (!x || !x.timestamp) return null;
        return x;
      } catch (e) { await new Promise(s => setTimeout(s, 1500)); }
    }
  }
  return null;
}

function donustur(sembol, x) {
  const q = x.indicators.quote[0], ac = (x.indicators.adjclose && x.indicators.adjclose[0].adjclose) || q.close;
  const gunler = [];
  for (let i = 0; i < x.timestamp.length; i++) {
    const c = q.close[i];
    if (c == null) continue;
    // Gün: İstanbul (UTC+3) takvim günü → UTC gece yarısı.
    const d = new Date((x.timestamp[i] + 3 * 3600) * 1000);
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const satir = { t, o: q.open[i], h: q.high[i], l: q.low[i], c, ac: ac[i], v: q.volume[i] };
    if (gunler.length && gunler[gunler.length - 1].t === t) gunler[gunler.length - 1] = satir; else gunler.push(satir);
  }
  const ev = x.events || {};
  return {
    sembol, kaynak: 'Yahoo Finance v8 chart', indirme: new Date().toISOString(),
    para: x.meta && x.meta.currency, gunler,
    temettu: Object.values(ev.dividends || {}).map(d => ({ t: d.date * 1000, miktar: d.amount })).sort((a, b) => a.t - b.t),
    bolunme: Object.values(ev.splits || {}).map(d => ({ t: d.date * 1000, oran: d.splitRatio })).sort((a, b) => a.t - b.t),
  };
}

/** Veri kalitesi: boş/sıfır, %50+ tek gün sıçrama (düzeltilmiş seride), yinelenen gün. */
function denetle(v) {
  const g = v.gunler, sorun = [];
  let sifir = 0, ohlcBos = 0, hacimSifir = 0;
  for (let i = 0; i < g.length; i++) {
    const x = g[i];
    if (!(x.c > 0) || !(x.ac > 0)) sifir++;
    if (x.o == null || x.h == null || x.l == null || !(x.o > 0)) ohlcBos++;
    if (!x.v) hacimSifir++;
    if (i && g[i - 1].ac > 0 && x.ac > 0) {
      const r = x.ac / g[i - 1].ac - 1;
      if (Math.abs(r) >= 0.5 || r <= -0.34) sorun.push({ t: new Date(x.t).toISOString().slice(0, 10), r: +(r * 100).toFixed(1) });
    }
  }
  return { gun: g.length, ilk: g.length ? new Date(g[0].t).toISOString().slice(0, 10) : null, son: g.length ? new Date(g[g.length - 1].t).toISOString().slice(0, 10) : null, sifir, ohlcBos, hacimSifir, sicrama: sorun };
}

async function main() {
  const sadeceDenetle = process.argv.includes('--denetle');
  let tum = [...GUNCEL.map(s => s + '.IS'), ...ESKI.map(s => s + '.IS'), ...DIGER];
  const sec = process.argv.slice(2).filter(a => !a.startsWith('--'));   // yalnız bu semboller
  if (sec.length) tum = tum.filter(y => sec.includes(y));
  const rapor = {};
  for (const y of tum) {
    const dosya = path.join(DIR, y.replace(/[^A-Z0-9.]/gi, '_') + '.json');
    let v;
    if (sadeceDenetle) { if (!fs.existsSync(dosya)) continue; v = JSON.parse(fs.readFileSync(dosya, 'utf8')); }
    else {
      const x = await getir(y);
      if (!x) { console.log(`  ✗ ${y.padEnd(10)} Yahoo'da yok`); rapor[y] = { yok: true }; continue; }
      v = donustur(y, x);
      fs.writeFileSync(dosya, JSON.stringify(v));
      await new Promise(s => setTimeout(s, 400));
    }
    const d = denetle(v); rapor[y] = d;
    console.log(`  ${y.padEnd(10)} ${d.gun} gün ${d.ilk} → ${d.son} · sıfır ${d.sifir} · OHLC boş ${d.ohlcBos} · hacim 0 ${d.hacimSifir} · sıçrama ${d.sicrama.length ? d.sicrama.map(s => `${s.t} ${s.r}%`).join(', ') : '—'}`);
  }
  fs.writeFileSync(path.join(DIR, '_denetim.json'), JSON.stringify({ tarih: new Date().toISOString(), guncel: GUNCEL, eski: ESKI, rapor }, null, 1));
}

if (require.main === module) main();
module.exports = { GUNCEL, ESKI, DIR, donustur };   // 73.1: donustur ileri temettü gölgesi de kullanır (tek yer)
