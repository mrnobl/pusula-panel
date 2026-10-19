#!/usr/bin/env node
/**
 * NASDAQ ERİŞİM TARAMASI — PLAN-NASDAQ.md "Erişim (uygulanabilirlik)" bölümü.
 *   node scripts/nasdaq-erisim.js
 *
 * YALNIZ HERKESE AÇIK (anahtarsız) uçlar okunur; emir, hesap, imza YOK.
 * lib/live/ ve config.json'a dokunmaz.
 *
 * Ne yapar:
 *  1. Binance USDⓈ-M exchangeInfo → contractType TRADIFI_PERPETUAL (veya altTür "TradFi") sözleşmeler;
 *     24 saatlik ticker (hacim), premiumIndex (son fonlama), fundingInfo (fonlama aralığı/tavanı).
 *  2. Güncel Nasdaq-100 listesi (api.nasdaq.com) ile kesişim → hangi NDX hissesinin Binance perp'i var.
 *  3. Fonlama geçmişi (QQQ, SPY, NVDA, AAPL, TQQQ, MSFT): toplam ve yıllığa çevrilmiş long maliyeti.
 *  4. QQQUSDT perp ile Yahoo QQQ kapanışı (ABD 16:00 ET'ye denk gelen saatlik mum kapanışı) karşılaştırması:
 *     prim, günlük getiri korelasyonu, izleme hatası.
 *  5. Diğer borsalarda Nasdaq endeks/QQQ perp'i (Bybit, Bitget, OKX, Gate, Kraken Futures, Hyperliquid HIP-3):
 *     var mı, azami kaldıraç, 24 saatlik hacim.
 *  6. Canlı evren (lib/live/evren.js perpMi süzgeci) açısından: 24 saatlik hacimde ilk 15 USDT perp'in kaçı TradFi?
 *
 * Çıktı: referans/binance-tradfi-semboller.json  +  ekrana özet.
 */
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const CIKTI = path.join(KOK, 'referans', 'binance-tradfi-semboller.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36', Accept: 'application/json' };
const FAPI = 'https://fapi.binance.com';
const GUN = 864e5;
// lib/live/evren.js STABIL ile aynı desen (oradan import etmiyoruz: lib/live'a bağımlılık istemiyoruz)
const STABIL = /^(USDC|BUSD|TUSD|FDUSD|USDP|DAI|UST|USTC|EUR|GBP|AEUR|PAX|USDE|RLUSD|USD1|BFUSD)$/;

async function al(url, secenek = {}) {
  const r = await fetch(url, { headers: UA, ...secenek });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
const yuvarla = (x, b = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** b) / 10 ** b);

async function ndxListesi() {
  try {
    const j = await al('https://api.nasdaq.com/api/quote/list-type/nasdaq100');
    return { tarih: j.data.date || null, semboller: j.data.data.rows.map(r => r.symbol.replace('.', '')) };
  } catch (e) {
    return { tarih: null, semboller: [], hata: e.message };
  }
}

async function fonlamaOzeti(sembol) {
  const a = await al(`${FAPI}/fapi/v1/fundingRate?symbol=${sembol}&limit=1000`);
  if (!a.length) return null;
  const r = a.map(x => +x.fundingRate);
  const top = r.reduce((p, c) => p + c, 0);
  const gun = (a.at(-1).fundingTime - a[0].fundingTime) / GUN;
  return {
    kayit: a.length,
    bas: new Date(a[0].fundingTime).toISOString().slice(0, 10),
    son: new Date(a.at(-1).fundingTime).toISOString().slice(0, 10),
    toplamYuzde: yuvarla(top * 100, 3),
    yillikLongMaliyetYuzde: yuvarla((top / gun) * 365 * 100, 2),
    sifirOrani: yuvarla(r.filter(x => x === 0).length / r.length, 2),
  };
}

async function qqqIzleme() {
  // Yahoo QQQ günlük kapanış (ham close) — son 1 yıl
  const y = (await al('https://query1.finance.yahoo.com/v8/finance/chart/QQQ?range=1y&interval=1d')).chart.result[0];
  // Binance QQQUSDT saatlik mum: 2 × 1500
  const son = await al(`${FAPI}/fapi/v1/klines?symbol=QQQUSDT&interval=1h&limit=1500`);
  const once = await al(`${FAPI}/fapi/v1/klines?symbol=QQQUSDT&interval=1h&limit=1500&endTime=${son[0][0] - 1}`);
  const saat = new Map([...once, ...son].map(k => [k[0], +k[4]]));
  const satir = [];
  y.timestamp.forEach((ts, i) => {
    const c = y.indicators.quote[0].close[i];
    if (c == null) return;
    const d = new Date(ts * 1000);
    const gun = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    // ABD kapanışı 16:00 ET: yaz saatinde 20:00 UTC, kışın 21:00 UTC. Basitleştirme: Nisan–Ekim yaz saati
    // (Mart ve Kasım'ın ilk haftaları yanlış eşlenebilir; bu dönemde perp verisi zaten Nisan'dan başlıyor).
    const ay = d.getUTCMonth();
    const kapanisUTC = ay >= 3 && ay <= 9 ? 20 : 21;
    const p = saat.get(gun + (kapanisUTC - 1) * 3600e3); // [kapanış-1s, kapanış) mumunun kapanışı
    if (p) satir.push({ t: new Date(gun).toISOString().slice(0, 10), q: c, p });
  });
  if (satir.length < 20) return { not: 'yeterli eşleşen gün yok', gun: satir.length };
  const prim = satir.map(s => s.p / s.q - 1);
  const ort = prim.reduce((a, b) => a + b, 0) / prim.length;
  const sd = Math.sqrt(prim.reduce((a, b) => a + (b - ort) ** 2, 0) / prim.length);
  const rq = [], rp = [];
  for (let i = 1; i < satir.length; i++) { rq.push(Math.log(satir[i].q / satir[i - 1].q)); rp.push(Math.log(satir[i].p / satir[i - 1].p)); }
  const mq = rq.reduce((a, b) => a + b) / rq.length, mp = rp.reduce((a, b) => a + b) / rp.length;
  let kov = 0, vq = 0, vp = 0;
  rq.forEach((_, i) => { kov += (rq[i] - mq) * (rp[i] - mp); vq += (rq[i] - mq) ** 2; vp += (rp[i] - mp) ** 2; });
  const iz = Math.sqrt(rq.reduce((a, _, i) => a + (rp[i] - rq[i]) ** 2, 0) / rq.length);
  return {
    gun: satir.length, bas: satir[0].t, son: satir.at(-1).t,
    primOrtYuzde: yuvarla(ort * 100, 3), primSdYuzde: yuvarla(sd * 100, 3),
    primMinYuzde: yuvarla(Math.min(...prim) * 100, 3), primMaxYuzde: yuvarla(Math.max(...prim) * 100, 3),
    gunlukGetiriKorelasyonu: yuvarla(kov / Math.sqrt(vq * vp), 4),
    gunlukIzlemeHatasiYuzde: yuvarla(iz * 100, 3),
  };
}

async function digerBorsalar() {
  const s = {};
  const dene = async (ad, f) => { try { s[ad] = await f(); } catch (e) { s[ad] = { hata: e.message }; } };
  await dene('bybit', async () => {
    const l = (await al('https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000')).result.list;
    const q = l.find(x => x.symbol === 'QQQUSDT');
    const t = (await al('https://api.bybit.com/v5/market/tickers?category=linear&symbol=QQQUSDT')).result.list[0];
    return { hisseVeEtfPerpSayisi: l.filter(x => x.symbolType === 'stock' || x.symbolType === 'ETF').length,
      nasdaq: [{ sembol: 'QQQUSDT', azamiKaldirac: +q.leverageFilter.maxLeverage, fonlamaDk: +q.fundingInterval, hacim24sUSD: Math.round(+t.turnover24h) }] };
  });
  await dene('bitget', async () => {
    const l = (await al('https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES')).data;
    const out = [];
    for (const sm of ['NDX100USDT', 'QQQUSDT']) {
      const c = l.find(x => x.symbol === sm); if (!c) continue;
      const t = (await al(`https://api.bitget.com/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=${sm}`)).data[0];
      out.push({ sembol: sm, azamiKaldirac: +c.maxLever, fonlamaSaat: +c.fundInterval, hacim24sUSD: Math.round(+t.usdtVolume) });
    }
    return { rwaPerpSayisi: l.filter(x => x.isRwa === 'YES').length, nasdaq: out };
  });
  await dene('okx', async () => {
    const l = (await al('https://www.okx.com/api/v5/public/instruments?instType=SWAP')).data;
    const q = l.find(x => x.instId === 'QQQ-USDT-SWAP');
    const t = (await al('https://www.okx.com/api/v5/market/ticker?instId=QQQ-USDT-SWAP')).data[0];
    return { hissePerpSayisi_instCategory3: l.filter(x => x.instCategory === '3').length,
      nasdaq: q ? [{ sembol: q.instId, azamiKaldirac: +q.lever, listeleme: new Date(+q.listTime).toISOString().slice(0, 10), hacim24sUSD: Math.round(+t.volCcy24h * +t.last) }] : [] };
  });
  await dene('gate', async () => {
    const l = await al('https://api.gateio.ws/api/v4/futures/usdt/contracts');
    const out = [];
    for (const sm of ['NAS100_USDT', 'QQQ_USDT']) {
      const c = l.find(x => x.name === sm); if (!c) continue;
      const t = (await al(`https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${sm}`))[0];
      out.push({ sembol: sm, azamiKaldirac: +c.leverage_max, fonlamaSaat: +c.funding_interval / 3600, hacim24sUSD: Math.round(+(t.volume_24h_quote || t.volume_24h_settle)) });
    }
    return { nasdaq: out };
  });
  await dene('krakenFutures', async () => {
    const t = (await al('https://futures.kraken.com/derivatives/api/v3/tickers/PF_US100USD')).ticker;
    return { nasdaq: [{ sembol: 'PF_US100USD', hacim24sUSD: Math.round(+t.volumeQuote) }] };
  });
  await dene('hyperliquidHip3', async () => {
    const [m, c] = await al('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }) });
    const i = m.universe.findIndex(u => u.name === 'xyz:XYZ100');
    return { xyzPiyasaSayisi: m.universe.filter(u => !u.isDelisted).length,
      nasdaq: i < 0 ? [] : [{ sembol: 'xyz:XYZ100', azamiKaldirac: m.universe[i].maxLeverage, fonlamaSaat: 1, hacim24sUSD: Math.round(+c[i].dayNtlVlm) }] };
  });
  return s;
}

async function main() {
  const simdi = new Date();
  const ex = await al(`${FAPI}/fapi/v1/exchangeInfo`);
  const tick = new Map((await al(`${FAPI}/fapi/v1/ticker/24hr`)).map(t => [t.symbol, t]));
  const prem = new Map((await al(`${FAPI}/fapi/v1/premiumIndex`)).map(p => [p.symbol, p]));
  const finfo = new Map((await al(`${FAPI}/fapi/v1/fundingInfo`)).map(f => [f.symbol, f]));
  const ndx = await ndxListesi();
  const ndxSet = new Set(ndx.semboller);

  const tradfiMi = s => s.contractType === 'TRADIFI_PERPETUAL' || (s.underlyingSubType || []).includes('TradFi');
  const liste = ex.symbols.filter(tradfiMi).map(s => {
    const t = tick.get(s.symbol) || {};
    const f = finfo.get(s.symbol) || {};
    const lot = (s.filters || []).find(x => x.filterType === 'MIN_NOTIONAL') || {};
    return {
      sembol: s.symbol, taban: s.baseAsset, kotasyon: s.quoteAsset,
      sozlesmeTuru: s.contractType, dayanakTuru: s.underlyingType, altTur: s.underlyingSubType,
      durum: s.status, listeleme: new Date(s.onboardDate).toISOString().slice(0, 10),
      azamiKaldirac: +s.requiredMarginPercent > 0 ? Math.round(100 / +s.requiredMarginPercent) : null,
      bakimMarjiYuzde: +s.maintMarginPercent,
      asgariEmirUSDT: lot.notional ? +lot.notional : null,
      fonlamaAraligiSaat: f.fundingIntervalHours ?? 8, fonlamaTavaniYuzde: f.adjustedFundingRateCap ? +f.adjustedFundingRateCap * 100 : null,
      sonFonlama: prem.get(s.symbol) ? +prem.get(s.symbol).lastFundingRate : null,
      hacim24sUSDT: Math.round(+t.quoteVolume || 0),
      nasdaq100Uyesi: s.underlyingType === 'EQUITY' ? ndxSet.has(s.baseAsset) : false,
    };
  }).sort((a, b) => b.hacim24sUSDT - a.hacim24sUSDT);

  const fonlama = {};
  for (const sm of ['QQQUSDT', 'SPYUSDT', 'TQQQUSDT', 'NVDAUSDT', 'AAPLUSDT', 'MSFTUSDT']) {
    try { fonlama[sm] = await fonlamaOzeti(sm); } catch (e) { fonlama[sm] = { hata: e.message }; }
  }
  let izleme; try { izleme = await qqqIzleme(); } catch (e) { izleme = { hata: e.message }; }

  // Canlı evren riski: evren.js perpMi = USDT lineer swap; TradFi'yi AYIRMIYOR (ccxt 4.5.71'de TradFi pazarları swap/linear görünür)
  const usdtPerp = ex.symbols.filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING' && /PERPETUAL/.test(s.contractType) && !STABIL.test(s.baseAsset))
    .map(s => ({ s: s.symbol, tf: tradfiMi(s), v: +(tick.get(s.symbol) || {}).quoteVolume || 0 }))
    .sort((a, b) => b.v - a.v);
  const ilk15 = usdtPerp.slice(0, 15);

  const ndxOlan = liste.filter(x => x.nasdaq100Uyesi);
  const cikti = {
    olusturma: simdi.toISOString(),
    kaynak: 'Binance USDⓈ-M herkese açık uçlar: /fapi/v1/exchangeInfo, /ticker/24hr, /premiumIndex, /fundingInfo, /fundingRate, /klines; Nasdaq-100 listesi api.nasdaq.com; QQQ kapanışı Yahoo v8 chart',
    betik: 'node scripts/nasdaq-erisim.js',
    notlar: [
      'TradFi sözleşmeleri Nest Exchange Limited (ADGM/FSRA) üzerinden sunuluyor; işlemden önce "TradFi-Perps agreement" imzası gerekiyor (POST /fapi/v1/stock/contract). Türkiye yerleşiklerine açık olup olmadığı DOĞRULANAMADI.',
      'Hepsi 2026\'da listelendi: geçmiş veri birkaç ay. Backtest dayanak seriyle (QQQ/hisse) yapılmalı; perp fonlaması ve primi ayrıca modellenmeli.',
      'azamiKaldirac = 100 / requiredMarginPercent (exchangeInfo); gerçek kademeli sınır hesap anahtarıyla leverageBracket ucundan okunur — bu betik anahtarsız.',
      'nasdaq100Uyesi: güncel listeye göre (nokta-zamanlı DEĞİL).',
    ],
    ozet: {
      tradfiToplam: liste.length,
      turSayilari: liste.reduce((a, x) => { a[x.dayanakTuru] = (a[x.dayanakTuru] || 0) + 1; return a; }, {}),
      nasdaq100Listesi: { tarih: ndx.tarih, uyeSayisi: ndx.semboller.length, hata: ndx.hata },
      nasdaq100UyesiPerpSayisi: new Set(ndxOlan.map(x => x.taban)).size, // tekil hisse (SPCXUSDT + SPCXUSD1 tek sayılır)
      nasdaq100UyesiPerpler: [...new Set(ndxOlan.map(x => x.taban))],
      endeksVeEtf: liste.filter(x => /^(QQQ|TQQQ|SQQQ|SPY|IWM|SMH|SOXL|SOXS)USDT$/.test(x.sembol)).map(x => ({ sembol: x.sembol, hacim24sUSDT: x.hacim24sUSDT, listeleme: x.listeleme })),
      fonlamaGecmisi: fonlama,
      qqqPerpIzleme: izleme,
      canliEvrenRiski: { ilk15: ilk15.map(x => x.s + (x.tf ? '*' : '')), tradfiSayisi: ilk15.filter(x => x.tf).length, not: '* = TradFi. lib/live/evren.js perpMi süzgeci bunları ayırmıyor.' },
    },
    digerBorsalar: await digerBorsalar(),
    semboller: liste,
  };
  fs.writeFileSync(CIKTI, JSON.stringify(cikti, null, 1) + '\n', 'utf8');
  const o = cikti.ozet;
  console.log(`TradFi perp: ${o.tradfiToplam}  türler: ${JSON.stringify(o.turSayilari)}`);
  console.log(`Nasdaq-100 listesi: ${o.nasdaq100Listesi.uyeSayisi} üye (${o.nasdaq100Listesi.tarih}); Binance perp'i olan: ${o.nasdaq100UyesiPerpSayisi}`);
  console.log(`  ${o.nasdaq100UyesiPerpler.join(' ')}`);
  console.log('Endeks/ETF perp:', o.endeksVeEtf.map(x => `${x.sembol} $${(x.hacim24sUSDT / 1e6).toFixed(1)}M (${x.listeleme})`).join(' | '));
  console.log('Fonlama (long yıllık maliyet %):', Object.entries(o.fonlamaGecmisi).map(([k, v]) => `${k} ${v && v.yillikLongMaliyetYuzde} [${v && v.bas}→${v && v.son}, sıfır oranı ${v && v.sifirOrani}]`).join(' | '));
  console.log('QQQ perp izleme:', JSON.stringify(o.qqqPerpIzleme));
  console.log(`Canlı evren riski: 24s hacimde ilk 15 USDT perp'in ${o.canliEvrenRiski.tradfiSayisi}'i TradFi → ${o.canliEvrenRiski.ilk15.join(' ')}`);
  console.log('Diğer borsalar:', JSON.stringify(cikti.digerBorsalar));
  console.log(`Yazıldı: ${path.relative(KOK, CIKTI)}`);
}

main().catch(e => { console.error('HATA', e); process.exit(1); });
