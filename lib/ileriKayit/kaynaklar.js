'use strict';
/**
 * İLERİYE KAYIT — REST KAYITÇILARI (73.3). KARAR VERMEZ, emir yok, anahtar yok: yalnız herkese açık uçlardan ham veri.
 * ═══════════════════════════════════════════════════════════════════════════
 * Her kayıtçı `async (ctx) → { satir, ayrinti, hatalar }`. ctx = { http (Http), kota() (BinanceKota benzeri: istek(market, ex,
 * fn)), depo, ad, imlec (kalıcı nesne — durum.json'da), simdi, uyu, ayar, log }. Satırlar alt adım bitince hemen yazılır
 * (yarıda kesilen koşu yazdığını kaybetmez).
 *
 * Satır biçimi (hepsi): { kaynak, uc, zaman (alınış, ISO), ...anahtar alanlar, ham: <kaynağın döndürdüğü nesne, olduğu gibi> }
 *
 * HIZ SINIRLARI: Binance istekleri BinanceKota'dan geçer (IP ağırlık bütçesi canlı botla ORTAK; 418/429 → kalıcı ortak
 * bekleme, veri orkestratörü ve coin tarama da uyar). Diğer borsalarda istekler arası bekleme + 429/418'de o koşu durur ve
 * Retry-After (yoksa 10 dk; 418 → 2 sa) boyunca o host'a istek atılmaz. Engel aşma YOK; Deribit'e bağlanılmaz.
 */

const FAPI = 'https://fapi.binance.com';
const SAPI = 'https://api.binance.com';
const EAPI = 'https://eapi.binance.com';
const OKX = 'https://www.okx.com';
const BYBIT = 'https://api.bybit.com';
const HL_INFO = 'https://api.hyperliquid.xyz/info';
const HL_LIDER = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const UA = 'Pusula-ileriye-kayit/73.3 (+yerel arastirma)';
const SAAT = 3600e3;
const GUN = 24 * SAAT;
const gunStr = (t) => new Date(t).toISOString().slice(0, 10);

// ═══ HTTP ════════════════════════════════════════════════════════════════
class HttpHata extends Error {
  constructor(mesaj, { durum = 0, retryAfter = null, basliklar = null, host = null } = {}) {
    super(mesaj); this.durum = durum; this.retryAfter = retryAfter; this.basliklar = basliklar; this.host = host;
  }
}

/**
 * Küçük HTTP istemcisi (yerleşik fetch; testte sahte). Host bekleme defteri: 429/418 → `bekleme[host] = bitiş ms`;
 * bekleme sürerken o host'a istek atılmaz (HttpHata 'beklemede').
 */
class Http {
  constructor({ fetch: f, simdi, zamanAsimiMs = 25000, bekleme } = {}) {
    this.fetch = f || ((...a) => globalThis.fetch(...a));
    this.simdi = simdi || (() => Date.now());
    this.zamanAsimiMs = zamanAsimiMs;
    this.bekleme = bekleme || {};           // { host: bitisMs } — çağıran kalıcı tutar
    this.sayac = { istek: 0, hata: 0 };
  }
  hostBeklemede(host) { const b = this.bekleme[host]; return b && b > this.simdi() ? b : null; }
  /**
   * @param url
   * @param o { yontem, govde (nesne → JSON), zamanAsimiMs, metinIsle(okuyucu) → değer (akışla okuma; JSON ayrıştırılmaz) }
   * @returns {{ durum, veri, basliklar: { get(ad) } }}
   */
  async istek(url, o = {}) {
    const host = new URL(url).host;
    const b = this.hostBeklemede(host);
    if (b) throw new HttpHata(`${host} hız sınırı beklemesi ${new Date(b).toISOString()}'e kadar — istek atılmadı`, { host, durum: 0 });
    const ac = new AbortController();
    const zaman = setTimeout(() => ac.abort(), o.zamanAsimiMs || this.zamanAsimiMs);
    this.sayac.istek++;
    try {
      const basliklar = { accept: 'application/json', 'user-agent': UA };
      if (o.govde !== undefined) basliklar['content-type'] = 'application/json';
      const r = await this.fetch(url, { method: o.yontem || (o.govde !== undefined ? 'POST' : 'GET'), headers: basliklar, body: o.govde !== undefined ? JSON.stringify(o.govde) : undefined, signal: ac.signal });
      const h = { get: (ad) => (r.headers && typeof r.headers.get === 'function' ? r.headers.get(ad) : null) };
      if (r.status === 429 || r.status === 418) {
        const ra = Number(h.get('retry-after'));
        const sure = Number.isFinite(ra) && ra > 0 ? ra * 1000 : r.status === 418 ? 2 * SAAT : 10 * 60e3;
        this.bekleme[host] = this.simdi() + sure;
        try { if (r.body && r.body.cancel) await r.body.cancel(); } catch { /* */ }
        throw new HttpHata(`HTTP ${r.status} (${host} hız sınırı) — ${Math.round(sure / 60e3)} dk istek yok`, { durum: r.status, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : null, basliklar: h, host });
      }
      if (o.metinIsle && r.status < 400) return { durum: r.status, veri: await o.metinIsle(r), basliklar: h };
      const metin = await r.text();
      if (r.status >= 400) throw new HttpHata(`HTTP ${r.status} ${host}: ${metin.slice(0, 160)}`, { durum: r.status, basliklar: h, host });
      let veri;
      try { veri = metin === '' ? null : JSON.parse(metin); } catch { throw new HttpHata(`HTTP ${r.status} ${host}: JSON değil`, { durum: r.status, basliklar: h, host }); }
      return { durum: r.status, veri, basliklar: h };
    } catch (e) {
      this.sayac.hata++;
      if (e instanceof HttpHata) throw e;
      const zamanAsimi = e && (e.name === 'AbortError' || /abort/i.test(e.message || ''));
      throw new HttpHata(zamanAsimi ? `${host}: zaman aşımı` : `${host}: ağ hatası: ${String((e && e.message) || e).slice(0, 120)}`, { host });
    } finally { clearTimeout(zaman); }
  }
}

/** Binance isteği: BinanceKota'dan geçir (ağırlık başlığı + 418/429 ortak bekleme). */
async function binance(ctx, kota, market, url) {
  const ex = { last_response_headers: {} };
  return kota.istek(market, ex, async () => {
    try {
      const r = await ctx.http.istek(url);
      ex.last_response_headers = { 'x-mbx-used-weight-1m': r.basliklar.get('x-mbx-used-weight-1m') };
      return r.veri;
    } catch (e) {
      if (e.basliklar) ex.last_response_headers = { 'x-mbx-used-weight-1m': e.basliklar.get('x-mbx-used-weight-1m'), 'retry-after': e.basliklar.get('retry-after') };
      throw e;
    }
  });
}

const kisaHata = (e) => String((e && e.message) || e).slice(0, 200);
/** Hız sınırı / bekleme hatası mı (o borsada koşuyu durdurmak için). */
const hizHatasi = (e) => /\b(418|429)\b|hız sınırı|beklemesi|istek tavanı|ağırlık bütçesi/i.test(String((e && e.message) || e));

// ═══ 1. BINANCE VADELİ POZİSYON İSTATİSTİKLERİ ═══════════════════════════════
/** Uç adı → kısa ad. Hepsi yalnız son 30 gün; period=1h; limit ≤ 500. */
const POZ_UCLAR = ['openInterestHist', 'topLongShortPositionRatio', 'topLongShortAccountRatio', 'globalLongShortAccountRatio', 'takerlongshortRatio'];
/** Sabit likit çekirdek (her gün aynı — seriler kesintisiz). Borsada işlem görmeyen otomatik düşer. */
const CEKIRDEK = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT', 'LINKUSDT', 'AVAXUSDT', 'SUIUSDT',
  'LTCUSDT', 'BCHUSDT', 'TRXUSDT', 'DOTUSDT', 'HYPEUSDT', 'NEARUSDT', 'AAVEUSDT', 'UNIUSDT', '1000PEPEUSDT', 'TONUSDT'];

/**
 * Günlük evren: çekirdek (işlem görenler) + günün en yüksek hacimli USDT perpetual'larından (yalnız kripto: underlyingType COIN,
 * TradFi / endeks hariç) çekirdekte olmayan ilk `ekSayi`. UTC gününde bir kez belirlenir, imleçte saklanır.
 */
async function evrenBul(ctx, kota, { ekSayi = 10 } = {}) {
  const im = ctx.imlec;
  const bugun = gunStr(ctx.simdi());
  if (im.evren && im.evren.gun === bugun && Array.isArray(im.evren.semboller) && im.evren.semboller.length) return im.evren.semboller;
  try {
    const bilgi = await binance(ctx, kota, 'perp', `${FAPI}/fapi/v1/exchangeInfo`);
    const uygun = new Set((bilgi.symbols || []).filter(s => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING' && s.underlyingType === 'COIN').map(s => s.symbol));
    const ticker = await binance(ctx, kota, 'perp', `${FAPI}/fapi/v1/ticker/24hr`);
    const cekirdek = CEKIRDEK.filter(s => uygun.has(s));
    const ek = (Array.isArray(ticker) ? ticker : []).filter(t => uygun.has(t.symbol) && !cekirdek.includes(t.symbol))
      .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume)).slice(0, ekSayi).map(t => t.symbol);
    im.evren = { gun: bugun, semboller: [...cekirdek, ...ek], cekirdek: cekirdek.length };
    return im.evren.semboller;
  } catch (e) {
    if (hizHatasi(e)) throw e;
    // Evren okunamadı: dünkü evren, o da yoksa çekirdek.
    return (im.evren && im.evren.semboller && im.evren.semboller.length) ? im.evren.semboller : CEKIRDEK.slice();
  }
}

async function pozisyon(ctx) {
  const kota = ctx.kota();
  const im = ctx.imlec;
  im.son = im.son || {};
  const simdi = ctx.simdi();
  const semboller = await evrenBul(ctx, kota, { ekSayi: (ctx.ayar && ctx.ayar.pozisyonEkSayi) || 10 });
  const enEski = simdi - 29.5 * GUN;             // uç yalnız son 30 günü verir; ilk koşu 30 günü geriye doldurur
  let satir = 0, istek = 0, geriDoldurma = 0;
  const hatalar = [];
  for (const uc of POZ_UCLAR) {
    for (const s of semboller) {
      const anahtar = `${uc}|${s}`;
      let son = Number(im.son[anahtar]) || 0;
      if (!son) geriDoldurma++;
      let bas = Math.max(son + 1, enEski);
      try {
        for (let sayfa = 0; sayfa < 3; sayfa++) {
          if (bas > simdi) break;
          // YALNIZ startTime verilirse uç EN SON 500 kaydı döndürür (2026-10-24 ölçüldü) → pencere hep startTime + endTime.
          const bit = Math.min(bas + 499 * SAAT, simdi);
          // eslint-disable-next-line no-await-in-loop
          const l = await binance(ctx, kota, 'perp', `${FAPI}/futures/data/${uc}?symbol=${s}&period=1h&limit=500&startTime=${bas}&endTime=${bit}`);
          istek++;
          const yeni = (Array.isArray(l) ? l : []).filter(x => Number(x.timestamp) > son).sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
          if (yeni.length) {
            const zaman = new Date(ctx.simdi()).toISOString();
            satir += ctx.depo.ekle(ctx.ad, yeni.map(x => ({ kaynak: 'binance', uc: `/futures/data/${uc}`, zaman, sembol: s, periyot: '1h', ham: x })));
            son = Number(yeni[yeni.length - 1].timestamp);
            im.son[anahtar] = son;
          }
          bas = Math.max(son + 1, bit + 1);
        }
      } catch (e) {
        hatalar.push(`${uc} ${s}: ${kisaHata(e)}`);
        if (hizHatasi(e)) return { satir, hatalar, durdu: true, ayrinti: { istek, sembol: semboller.length, geriDoldurma, kota: kota.ozet ? kota.ozet() : null } };
      }
    }
  }
  return { satir, hatalar, ayrinti: { istek, sembol: semboller.length, geriDoldurma, kota: kota.ozet ? kota.ozet() : null } };
}

// ═══ 2. OPSİYON AÇIK POZİSYONU (strike bazında anlık görüntü) ══════════════════
const AY = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
/** OKX 'BTC-USD-270326-90000-C' · Binance 'BTC-261225-85000-C' · Bybit 'BTC-13NOV26-90000-C-USDT' → { vade, strike, tip } */
function opsiyonCoz(sembol) {
  const p = String(sembol || '').split('-');
  let m;
  for (let i = 1; i < p.length - 2; i++) {
    const v = p[i];
    if ((m = /^(\d{2})(\d{2})(\d{2})$/.exec(v))) return { vade: `20${m[1]}-${m[2]}-${m[3]}`, strike: Number(p[i + 1]), tip: p[i + 2] };
    if ((m = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(v)) && AY[m[2]]) return { vade: `20${m[3]}-${AY[m[2]]}-${m[1].padStart(2, '0')}`, strike: Number(p[i + 1]), tip: p[i + 2] };
  }
  return { vade: null, strike: null, tip: null };
}

async function okxOpsiyon(ctx, coin) {
  const aile = `${coin}-USD`;
  const ozet = (await ctx.http.istek(`${OKX}/api/v5/public/opt-summary?instFamily=${aile}`)).veri;
  await ctx.uyu(300);
  const oi = (await ctx.http.istek(`${OKX}/api/v5/public/open-interest?instType=OPTION&instFamily=${aile}`)).veri;
  await ctx.uyu(300);
  const mark = (await ctx.http.istek(`${OKX}/api/v5/public/mark-price?instType=OPTION&instFamily=${aile}`)).veri;
  for (const [ad, j] of [['opt-summary', ozet], ['open-interest', oi], ['mark-price', mark]]) if (!j || String(j.code) !== '0') throw new Error(`OKX ${ad}: code ${j && j.code} ${j && j.msg ? j.msg : ''}`);
  const oiH = new Map((oi.data || []).map(x => [x.instId, x]));
  const markH = new Map((mark.data || []).map(x => [x.instId, x]));
  const zaman = new Date(ctx.simdi()).toISOString();
  return (ozet.data || []).map(x => ({ kaynak: 'okx', uc: '/api/v5/public/opt-summary + open-interest + mark-price', zaman, alt: coin, sembol: x.instId, ...opsiyonCoz(x.instId),
    ham: { ozet: x, oi: oiH.get(x.instId) || null, mark: markH.get(x.instId) || null } }));
}

async function bybitOpsiyon(ctx, coin) {
  const t = (await ctx.http.istek(`${BYBIT}/v5/market/tickers?category=option&baseCoin=${coin}`)).veri;
  if (!t || t.retCode !== 0) throw new Error(`Bybit tickers: retCode ${t && t.retCode} ${t && t.retMsg ? t.retMsg : ''}`);
  await ctx.uyu(200);
  let hv = null;
  try { hv = (await ctx.http.istek(`${BYBIT}/v5/market/historical-volatility?category=option&baseCoin=${coin}`)).veri; } catch (e) { if (hizHatasi(e)) throw e; hv = null; }
  const zaman = new Date(ctx.simdi()).toISOString();
  const satirlar = ((t.result && t.result.list) || []).map(x => ({ kaynak: 'bybit', uc: '/v5/market/tickers?category=option', zaman, alt: coin, sembol: x.symbol, ...opsiyonCoz(x.symbol), ham: x }));
  const hvl = hv && hv.retCode === 0 && Array.isArray(hv.result) ? hv.result : [];
  if (hvl.length) satirlar.push({ kaynak: 'bybit', uc: '/v5/market/historical-volatility', zaman, alt: coin, tur: 'tarihsel-oynaklik', ham: hvl });
  return { satirlar, hvBos: !hvl.length };
}

/** Binance opsiyon (eapi): tüm mark (tek istek, BTC + ETH süzülür) + vade başına açık pozisyon. */
async function binanceOpsiyon(ctx, kota, coinler) {
  const mark = await binance(ctx, kota, 'eapi', `${EAPI}/eapi/v1/mark`);
  const out = [];
  for (const coin of coinler) {
    const l = (Array.isArray(mark) ? mark : []).filter(x => String(x.symbol).startsWith(`${coin}-`));
    const vadeler = [...new Set(l.map(x => String(x.symbol).split('-')[1]).filter(v => /^\d{6}$/.test(v)))].sort();
    const oiH = new Map();
    for (const v of vadeler) {
      // eslint-disable-next-line no-await-in-loop
      const oi = await binance(ctx, kota, 'eapi', `${EAPI}/eapi/v1/openInterest?underlyingAsset=${coin}&expiration=${v}`);
      for (const x of Array.isArray(oi) ? oi : []) oiH.set(x.symbol, x);
    }
    const zaman = new Date(ctx.simdi()).toISOString();
    for (const x of l) out.push({ kaynak: 'binance', uc: '/eapi/v1/mark + /eapi/v1/openInterest', zaman, alt: coin, sembol: x.symbol, ...opsiyonCoz(x.symbol), ham: { mark: x, oi: oiH.get(x.symbol) || null } });
  }
  return out;
}

async function opsiyon(ctx) {
  const coinler = (ctx.ayar && ctx.ayar.opsiyonCoinler) || ['BTC', 'ETH'];
  let satir = 0;
  const hatalar = [];
  const sayim = {};
  const yaz = (borsa, coin, l) => { sayim[`${borsa}-${coin}`] = l.length; satir += ctx.depo.ekle(ctx.ad, l); };
  for (const coin of coinler) {
    try { yaz('okx', coin, await okxOpsiyon(ctx, coin)); } catch (e) { hatalar.push(`OKX ${coin}: ${kisaHata(e)}`); }
    await ctx.uyu(500);
    try { const b = await bybitOpsiyon(ctx, coin); yaz('bybit', coin, b.satirlar); if (b.hvBos) sayim[`bybit-hv-${coin}`] = 'boş'; } catch (e) { hatalar.push(`Bybit ${coin}: ${kisaHata(e)}`); }
    await ctx.uyu(500);
  }
  try {
    const l = await binanceOpsiyon(ctx, ctx.kota(), coinler);
    for (const coin of coinler) sayim[`binance-${coin}`] = l.filter(x => x.alt === coin).length;
    satir += ctx.depo.ekle(ctx.ad, l);
  } catch (e) { hatalar.push(`Binance opsiyon: ${kisaHata(e)}`); }
  return { satir, hatalar, ayrinti: { sayim } };
}

// ═══ 3. HYPERLIQUID BÜYÜK HESAPLAR ══════════════════════════════════════════════
const LIDER_RE = /"ethAddress"\s*:\s*"(0x[0-9a-fA-F]{40})"\s*,\s*"accountValue"\s*:\s*"(-?[0-9.eE+]+)"/g;
/**
 * Liderlik tablosu (~40 MB JSON) belleğe ayrıştırılmadan AKIŞLA taranır: yalnız (adres, hesap değeri) çiftleri, en büyük N tutulur.
 * @returns {{ toplam, ilk: [{ adres, hesapDegeri }] }}
 */
function liderTarayici(N) {
  let tampon = '', toplam = 0;
  const ilk = [];               // azalan sıralı, en çok N
  const ekle = (adres, deger) => {
    toplam++;
    if (ilk.length >= N && deger <= ilk[ilk.length - 1].hesapDegeri) return;
    let i = ilk.length;
    while (i > 0 && ilk[i - 1].hesapDegeri < deger) i--;
    ilk.splice(i, 0, { adres: adres.toLowerCase(), hesapDegeri: deger });
    if (ilk.length > N) ilk.pop();
  };
  return {
    parca(metin) {
      tampon += metin;
      let m, sonIdx = 0;
      LIDER_RE.lastIndex = 0;
      while ((m = LIDER_RE.exec(tampon))) { const v = Number(m[2]); if (Number.isFinite(v)) ekle(m[1], v); sonIdx = LIDER_RE.lastIndex; }
      tampon = tampon.slice(Math.max(sonIdx, tampon.length - 400));
    },
    sonuc: () => ({ toplam, ilk }),
  };
}

async function liderlik(ctx, N) {
  const r = await ctx.http.istek(HL_LIDER, {
    zamanAsimiMs: 180000,
    metinIsle: async (yanit) => {
      const t = liderTarayici(N);
      if (yanit.body && typeof yanit.body.getReader === 'function') {
        const okuyucu = yanit.body.getReader();
        const coz = new TextDecoder();
        for (;;) {
          // eslint-disable-next-line no-await-in-loop
          const { done, value } = await okuyucu.read();
          if (done) break;
          t.parca(coz.decode(value, { stream: true }));
        }
        t.parca(coz.decode());
      } else t.parca(await yanit.text());
      return t.sonuc();
    },
  });
  return r.veri;
}

async function hyperliquid(ctx) {
  const N = (ctx.ayar && ctx.ayar.hyperliquidN) || 100;
  const im = ctx.imlec;
  const bugun = gunStr(ctx.simdi());
  let satir = 0;
  const hatalar = [];
  if (im.liderGun !== bugun || !Array.isArray(im.adresler) || !im.adresler.length) {
    try {
      const l = await liderlik(ctx, N);
      if (!l.ilk.length) throw new Error('liderlik tablosunda adres bulunamadı (biçim değişmiş olabilir)');
      im.adresler = l.ilk.map(x => x.adres);
      im.liderGun = bugun;
      satir += ctx.depo.ekle(ctx.ad, [{ kaynak: 'hyperliquid', uc: 'stats-data.hyperliquid.xyz/Mainnet/leaderboard', zaman: new Date(ctx.simdi()).toISOString(), tur: 'liderlik', toplamHesap: l.toplam, ham: l.ilk }]);
    } catch (e) {
      hatalar.push(`liderlik: ${kisaHata(e)}`);
      if (hizHatasi(e) || !Array.isArray(im.adresler) || !im.adresler.length) return { satir, hatalar, durdu: true };
    }
  }
  let tampon = [], ok = 0;
  for (let i = 0; i < im.adresler.length; i++) {
    const adres = im.adresler[i];
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await ctx.http.istek(HL_INFO, { govde: { type: 'clearinghouseState', user: adres } });
      tampon.push({ kaynak: 'hyperliquid', uc: '/info clearinghouseState', zaman: new Date(ctx.simdi()).toISOString(), adres, sira: i + 1, ham: r.veri });
      ok++;
    } catch (e) {
      hatalar.push(`${adres.slice(0, 10)}…: ${kisaHata(e)}`);
      if (hizHatasi(e)) break;
    }
    if (tampon.length >= 20) { satir += ctx.depo.ekle(ctx.ad, tampon); tampon = []; }
    // eslint-disable-next-line no-await-in-loop
    await ctx.uyu(400);       // ağırlık 2/istek, sınır 1200/dk/IP → ~300/dk'nın altında
  }
  satir += ctx.depo.ekle(ctx.ad, tampon);
  return { satir, hatalar: hatalar.slice(0, 10), ayrinti: { adres: im.adresler.length, ok, liderGun: im.liderGun } };
}

// ═══ 4. EMİR DEFTERİ DERİNLİĞİ VE MAKAS ══════════════════════════════════════════
const DERINLIK_SEMBOL = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT'];
const BANTLAR = [0.001, 0.005, 0.01];

/** Saf: emir defterinden en iyi fiyatlar, makas ve ±%0,1/%0,5/%1 derinlik (baz ve USDT). Defter bandı kapsamıyorsa null. */
function derinlikOzeti(defter) {
  const bids = (defter.bids || []).map(([p, q]) => [Number(p), Number(q)]).filter(([p, q]) => p > 0 && q >= 0);
  const asks = (defter.asks || []).map(([p, q]) => [Number(p), Number(q)]).filter(([p, q]) => p > 0 && q >= 0);
  if (!bids.length || !asks.length) return null;
  const alis = bids[0][0], satis = asks[0][0], orta = (alis + satis) / 2;
  const kapsamAlis = 1 - bids[bids.length - 1][0] / orta;
  const kapsamSatis = asks[asks.length - 1][0] / orta - 1;
  const derinlik = {};
  for (const b of BANTLAR) {
    const al = bids.filter(([p]) => p >= orta * (1 - b));
    const sat = asks.filter(([p]) => p <= orta * (1 + b));
    derinlik[String(b * 100)] = {
      alisBaz: kapsamAlis >= b ? al.reduce((s, [, q]) => s + q, 0) : null,
      alisUsd: kapsamAlis >= b ? al.reduce((s, [p, q]) => s + p * q, 0) : null,
      satisBaz: kapsamSatis >= b ? sat.reduce((s, [, q]) => s + q, 0) : null,
      satisUsd: kapsamSatis >= b ? sat.reduce((s, [p, q]) => s + p * q, 0) : null,
    };
  }
  return { enIyiAlis: alis, enIyiSatis: satis, orta, makasBp: (satis - alis) / orta * 1e4, derinlik,
    kapsamYuzde: { alis: kapsamAlis * 100, satis: kapsamSatis * 100 }, seviye: { alis: bids.length, satis: asks.length } };
}

async function derinlik(ctx) {
  const kota = ctx.kota();
  const semboller = (ctx.ayar && ctx.ayar.derinlikSemboller) || DERINLIK_SEMBOL;
  let satir = 0;
  const hatalar = [];
  const tampon = [];
  for (const s of semboller) {
    for (const [piyasa, url, limit] of [
      ['spot', `${SAPI}/api/v3/depth`, ['BTCUSDT', 'ETHUSDT'].includes(s) ? 5000 : 1000],   // spot 5000 seviye ağırlık 250 (BTC/ETH ±%1'e yetsin)
      ['perp', `${FAPI}/fapi/v1/depth`, 1000],                                                // vadeli en çok 1000 (ağırlık 20)
    ]) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const d = await binance(ctx, kota, piyasa, `${url}?symbol=${s}&limit=${limit}`);
        const o = derinlikOzeti(d || {});
        if (!o) throw new Error('boş defter');
        tampon.push({ kaynak: 'binance', uc: piyasa === 'spot' ? '/api/v3/depth' : '/fapi/v1/depth', zaman: new Date(ctx.simdi()).toISOString(), piyasa, sembol: s, limit, ...o,
          ham: { lastUpdateId: d.lastUpdateId, E: d.E, T: d.T, bids20: (d.bids || []).slice(0, 20), asks20: (d.asks || []).slice(0, 20) } });
      } catch (e) {
        hatalar.push(`${piyasa} ${s}: ${kisaHata(e)}`);
        if (hizHatasi(e)) { satir += ctx.depo.ekle(ctx.ad, tampon); return { satir, hatalar, durdu: true }; }
      }
    }
  }
  satir += ctx.depo.ekle(ctx.ad, tampon);
  return { satir, hatalar, ayrinti: { sembol: semboller.length, kota: kota.ozet ? kota.ozet() : null } };
}

module.exports = {
  Http, HttpHata, binance, hizHatasi,
  pozisyon, evrenBul, POZ_UCLAR, CEKIRDEK,
  opsiyon, opsiyonCoz, okxOpsiyon, bybitOpsiyon, binanceOpsiyon,
  hyperliquid, liderTarayici, liderlik,
  derinlik, derinlikOzeti, DERINLIK_SEMBOL,
  UC: { FAPI, SAPI, EAPI, OKX, BYBIT, HL_INFO, HL_LIDER },
};
