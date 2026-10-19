/**
 * İŞLEM DEFTERİ — FİYAT KAYNAKLARI (sürüm 64.7). AĞA ÇIKMAZ: yalnız diskte zaten olan seriler okunur.
 *   · Fiat kurları: Portföyüm kur serileri (data/portfoy Yahoo USDTRY=X / EURUSD=X / GBPUSD=X + kurlar.json önbelleği —
 *     lib/portfoyum/fiyat.js kurSerileri) ve FRED günlük kurları (data/fx/seri/fred_DEX*.json — scripts/fx-indir.js; JPY, CHF,
 *     CAD, SEK ve EUR/GBP yedeği).
 *   · Kripto: market.db Binance günlük mumları (lib/candleStore.js; spot X/USDT, vadeli X/USDT:USDT).
 * olustur({ mumDeposu, fxDizin, kurSerileri }) → { usd(para, ms), seri(sembol, piyasa, bas, bit) }
 *   usd: 1 birim paranın o günkü (ya da önceki en yakın, ≤ 7 gün) dolar değeri; yoksa null.
 *   seri: fiyat grafiği için günlük kapanış [{ t, v }] + kaynak adı; yoksa { seri: [], not }.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const M = require('./model');

const GUN = 864e5;
const YAS_TAVAN = 7 * GUN;
/** FRED: dosya adı + 1 birimin USD değerine çevirme (DEXUSEU = USD/EUR doğrudan; DEXJPUS = JPY/USD → ters). */
const FRED = { EUR: ['fred_DEXUSEU', false], GBP: ['fred_DEXUSUK', false], JPY: ['fred_DEXJPUS', true], CHF: ['fred_DEXSZUS', true], CAD: ['fred_DEXCAUS', true], SEK: ['fred_DEXSDUS', true] };

function oncekiNokta(seri, t) {
  let lo = 0, hi = seri.length - 1, sonuc = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (seri[m][0] <= t) { sonuc = seri[m]; lo = m + 1; } else hi = m - 1; }
  return sonuc;
}

function olustur(ops = {}) {
  const fxDizin = ops.fxDizin || yollar.veri('fx', 'seri');
  const fredOnbellek = new Map();
  const mumOnbellek = new Map();
  let kurlar = null;
  const kurAl = () => {
    if (kurlar) return kurlar;
    try { kurlar = typeof ops.kurSerileri === 'function' ? ops.kurSerileri() : null; } catch (e) { kurlar = null; }
    return kurlar || (kurlar = {});
  };

  function fred(para) {
    if (fredOnbellek.has(para)) return fredOnbellek.get(para);
    const t = FRED[para];
    let s = [];
    if (t) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(fxDizin, `${t[0]}.json`), 'utf8'));
        s = (j.gozlem || []).filter(x => x && typeof x[1] === 'number' && x[1] > 0).map(([g, v]) => [Date.parse(g + 'T00:00:00Z'), t[1] ? 1 / v : v]);
      } catch (e) { s = []; }
    }
    fredOnbellek.set(para, s);
    return s;
  }

  function mumlar(sembol, piyasa) {
    const a = `${piyasa}|${sembol}`;
    if (mumOnbellek.has(a)) return mumOnbellek.get(a);
    let s = [];
    try {
      if (ops.mumDeposu) s = ops.mumDeposu.getCandlesRange(sembol, '1d', 0, Date.now() + GUN, { venue: 'binance', market: piyasa === 'vadeli' ? 'perp' : 'spot' }).map(m => [m.time, m.close]);
    } catch (e) { s = []; }
    mumOnbellek.set(a, s);
    return s;
  }

  function usd(para, t) {
    const p = String(para || '').toUpperCase();
    if (!p) return null;
    if (M.dolarGibiMi(p)) return 1;
    if (!Number.isFinite(t)) return null;
    const k = kurAl();
    if (p === 'TRY' || p === 'EUR' || p === 'GBP') {
      const s = k[p];
      if (s && s.length) { const n = oncekiNokta(s, t); if (n && t - n[0] <= YAS_TAVAN) return p === 'TRY' ? 1 / n[1] : n[1]; }
    }
    if (FRED[p]) { const n = oncekiNokta(fred(p), t); if (n && t - n[0] <= YAS_TAVAN) return n[1]; }
    if (M.FIAT.has(p)) return null;
    // kripto: Binance günlük kapanış (önce spot X/USDT, yoksa vadeli)
    for (const [s, pz] of [[`${p}/USDT`, 'spot'], [`${p}/USDT:USDT`, 'vadeli']]) {
      const n = oncekiNokta(mumlar(s, pz), t);
      if (n && t - n[0] <= YAS_TAVAN) return n[1];
    }
    return null;
  }

  /** 1 birim döviz → USD serisi (USD = 1). */
  function fiatUsdSeri(p) {
    if (p === 'USD') return null;
    const k = kurAl();
    if ((p === 'EUR' || p === 'GBP') && k[p] && k[p].length) return k[p].map(x => [x[0], x[1]]);
    if (p === 'TRY' && k.TRY && k.TRY.length) return k.TRY.map(x => [x[0], 1 / x[1]]);
    const f = fred(p);
    return f.length ? f : [];
  }

  /** Fiyat grafiği serisi. */
  function seri(sembol, piyasa, bas, bit) {
    const aralik = (l) => l.filter(([t]) => t >= bas && t <= bit).map(([t, v]) => ({ t, v }));
    if (piyasa === 'fx') {
      const s = String(sembol || '');
      const a = s.slice(0, 3), b = s.slice(3, 6);
      const sa = fiatUsdSeri(a), sb = fiatUsdSeri(b);
      if ((a !== 'USD' && !(sa && sa.length)) || (b !== 'USD' && !(sb && sb.length)) || a === b) return { seri: [], not: `${s}: diskte bu dövizin günlük kuru yok (yalnız USD, EUR, GBP, JPY, CHF, CAD, SEK, TRY çiftleri çizilir)` };
      const taban = (sa && sa.length ? sa : sb).filter(([t]) => t >= bas && t <= bit);
      const out = [];
      for (const [t] of taban) {
        const va = a === 'USD' ? 1 : (oncekiNokta(sa, t) || [])[1];
        const vb = b === 'USD' ? 1 : (oncekiNokta(sb, t) || [])[1];
        if (va && vb) out.push({ t, v: va / vb });
      }
      return { seri: out, kaynak: 'günlük kur (FRED / Yahoo; New York öğle) — gün içi giriş seviyeleri çizgide görünmez' };
    }
    if (piyasa === 'cfd') return { seri: [], not: `${sembol}: bu CFD için ücretsiz günlük fiyat serisi projede yok — grafik çizilmez` };
    const ana = String(sembol || '').split(':')[0];
    const adaylar = piyasa === 'vadeli' && /:USDT$/.test(sembol) ? [[sembol, 'vadeli'], [ana, 'spot']] : [[ana, 'spot'], [`${ana}:${ana.split('/')[1]}`, 'vadeli']];
    for (const [s, pz] of adaylar) {
      const l = aralik(mumlar(s, pz));
      if (l.length >= 2) return { seri: l, kaynak: `Binance ${pz === 'vadeli' ? 'vadeli' : 'spot'} günlük kapanış (${s}, market.db)` };
    }
    return { seri: [], not: `${sembol}: bu bilgisayarda bu coinin Binance günlük mumu yok (Araştırma › Veri ve izleme listesi'nden 1d indirilebilir) — grafik çizilmez` };
  }

  return { usd, seri, _fred: fred };
}

module.exports = { olustur, oncekiNokta, FRED };
