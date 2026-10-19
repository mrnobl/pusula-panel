/**
 * COIN TARAMA — merkezi borsa fiyatları (anahtarsız genel uçlar): anlık ticker, günlük açılış, sembol çözümleme.
 *
 *   kaynak = { borsa: 'binance'|'bybit'|'okx'|'gate', piyasa: 'spot'|'perp', sembol }   (perp yalnız Binance)
 *
 * BINANCE: canlı bot aynı IP'den gider → her Binance isteği veri orkestratörünün `BinanceKota`sından geçer (ağırlık
 * başlığı okunur, 418/429 → kalıcı bekleme yazılır ve o koşuda Binance'e başka istek atılmaz; Binance isteği burada
 * YENİDEN DENENMEZ). Kota verilmezse (test, CLI) yalnız istemcinin host aralığı uygulanır.
 *
 * GÜNLÜK AÇILIŞ ÖNBELLEĞİ: geçmiş bir günün açılışı değişmez → `data/tarama/fiyat-onbellek.json`a yazılır (bugün yazılmaz).
 * Dış veri yalnız sayı olarak okunur.
 */
'use strict';
const { jsonOku, atomikYaz, sayi, gunMs, gunStr } = require('./ortak');

const ARA = { binance: 300, bybit: 300, okx: 300, gate: 300 };
const KAYNAK_ADI = (k) => `${k.borsa}-${k.piyasa}`;

class FiyatKaynagi {
  /**
   * @param o { http: Istemci, kota: () => BinanceKota | null, onbellekDosya, simdi }
   */
  constructor({ http, kota, onbellekDosya, simdi } = {}) {
    this.http = http;
    this.kotaFn = kota || (() => null);
    this._kota = undefined;
    this.onbellekDosya = onbellekDosya || null;
    this.simdi = simdi || (() => Date.now());
    this._onb = null;
    this._perpBilgi = null;
    this._spotDurum = new Map();
  }

  kota() { if (this._kota === undefined) this._kota = this.kotaFn() || null; return this._kota; }

  /** Binance isteği: kota → tek deneme; 418/429 → kota beklemesi (KotaHatasi fırlar). Diğer borsalar: istemci yeniden dener. */
  async _istek(borsa, piyasa, url) {
    if (borsa !== 'binance') return this.http.json(url, { host: borsa, araMs: ARA[borsa] });
    const kota = this.kota();
    const market = piyasa === 'perp' ? 'perp' : 'spot';
    const cagir = async () => {
      const r = await this.http.json(url, { host: `binance-${market}`, araMs: ARA.binance, denemeler: 1,
        basliklarCb: (h) => { if (kota) kota.agirlikYaz(market, h('x-mbx-used-weight-1m')); } });
      if (r.hiz) { const e = new Error(`HTTP ${r.durum} ${url.replace(/\?.*$/, '')}`); e.retryAfter = r.retryAfter; throw e; }
      return r;
    };
    if (!kota) {
      try { return await cagir(); } catch (e) { return { ok: false, durum: 429, hata: e.message, hiz: true }; }
    }
    return kota.istek(market, null, cagir);   // KotaHatasi yukarı çıkar: çağıran Binance'i bu koşuda bırakır
  }

  _onbellek() { if (!this._onb) this._onb = (this.onbellekDosya && jsonOku(this.onbellekDosya, null)) || { surum: 1, acilis: {} }; return this._onb; }
  _onbYaz() { if (this.onbellekDosya && this._onb) { try { atomikYaz(this.onbellekDosya, JSON.stringify(this._onb)); } catch { /* önbellek yazılamadı: önemsiz */ } } }

  /** Anlık: { ok, fiyat, hacim24 (quote, USDT), kaynak } */
  async anlik(k) {
    const s = encodeURIComponent(k.sembol);
    let r, fiyat = null, hacim = null;
    if (k.borsa === 'binance') {
      r = await this._istek('binance', k.piyasa, k.piyasa === 'perp' ? `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${s}` : `https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`);
      if (r.ok && r.veri) { fiyat = sayi(r.veri.lastPrice); hacim = sayi(r.veri.quoteVolume); }
    } else if (k.borsa === 'bybit') {
      r = await this._istek('bybit', 'spot', `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${s}`);
      const x = r.ok && r.veri && r.veri.result && Array.isArray(r.veri.result.list) ? r.veri.result.list[0] : null;
      if (x) { fiyat = sayi(x.lastPrice); hacim = sayi(x.turnover24h); }
    } else if (k.borsa === 'okx') {
      r = await this._istek('okx', 'spot', `https://www.okx.com/api/v5/market/ticker?instId=${s}`);
      const x = r.ok && r.veri && Array.isArray(r.veri.data) ? r.veri.data[0] : null;
      if (x) { fiyat = sayi(x.last); hacim = sayi(x.volCcy24h); }
    } else if (k.borsa === 'gate') {
      r = await this._istek('gate', 'spot', `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${s}`);
      const x = r.ok && Array.isArray(r.veri) ? r.veri[0] : null;
      if (x) { fiyat = sayi(x.last); hacim = sayi(x.quote_volume); }
    } else return { ok: false, hata: `bilinmeyen borsa ${k.borsa}` };
    // 400/404: borsa yanıt verdi ama sembol yok (listeden çıkmış / hiç olmamış) → BOŞ (kaybolma izi), hata değil.
    if (!r.ok && (r.durum === 400 || r.durum === 404)) return { ok: false, bos: true, hata: `borsa sembolü tanımıyor (HTTP ${r.durum}; listeden çıkmış olabilir)`, durum: r.durum };
    if (!r.ok) return { ok: false, hata: r.hata, durum: r.durum };
    if (!(fiyat > 0)) return { ok: false, bos: true, hata: 'borsa fiyat vermedi (sembol yok / işlem görmüyor)' };
    return { ok: true, fiyat, hacim24: hacim, kaynak: KAYNAK_ADI(k), sembol: k.sembol, ms: r.ms };
  }

  /** Günün (UTC) açılış fiyatı ve o günün quote hacmi. Geçmiş gün önbelleklenir. */
  async gunAcilis(k, gun, { onbellek: onbKullan = true } = {}) {
    const anahtar = `${KAYNAK_ADI(k)}:${k.sembol}:${gun}`;
    const onb = this._onbellek();
    if (onbKullan && onb.acilis[anahtar]) return { ok: true, ...onb.acilis[anahtar], onbellek: true };
    const t = gunMs(gun);
    if (!Number.isFinite(t)) return { ok: false, hata: 'geçersiz gün' };
    const s = encodeURIComponent(k.sembol);
    let r, satir = null;
    if (k.borsa === 'binance') {
      r = await this._istek('binance', k.piyasa, `${k.piyasa === 'perp' ? 'https://fapi.binance.com/fapi/v1/klines' : 'https://api.binance.com/api/v3/klines'}?symbol=${s}&interval=1d&startTime=${t}&limit=1`);
      const x = r.ok && Array.isArray(r.veri) ? r.veri[0] : null;
      if (x && Number(x[0]) === t) satir = { fiyat: sayi(x[1]), kapanis: sayi(x[4]), hacim: sayi(x[7]) };
    } else if (k.borsa === 'bybit') {
      r = await this._istek('bybit', 'spot', `https://api.bybit.com/v5/market/kline?category=spot&symbol=${s}&interval=D&start=${t}&end=${t + 864e5 - 1}&limit=1`);
      const l = r.ok && r.veri && r.veri.result && Array.isArray(r.veri.result.list) ? r.veri.result.list : [];
      const x = l.find(y => Number(y[0]) === t);
      if (x) satir = { fiyat: sayi(x[1]), kapanis: sayi(x[4]), hacim: sayi(x[6]) };
    } else if (k.borsa === 'okx') {
      r = await this._istek('okx', 'spot', `https://www.okx.com/api/v5/market/history-candles?instId=${s}&bar=1Dutc&after=${t + 864e5}&limit=1`);
      const l = r.ok && r.veri && Array.isArray(r.veri.data) ? r.veri.data : [];
      const x = l.find(y => Number(y[0]) === t);
      if (x) satir = { fiyat: sayi(x[1]), kapanis: sayi(x[4]), hacim: sayi(x[7]) };
    } else if (k.borsa === 'gate') {
      r = await this._istek('gate', 'spot', `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${s}&interval=1d&from=${t / 1000}&to=${t / 1000}`);
      const l = r.ok && Array.isArray(r.veri) ? r.veri : [];
      const x = l.find(y => Number(y[0]) * 1000 === t);
      if (x) satir = { fiyat: sayi(x[5]), kapanis: sayi(x[2]), hacim: sayi(x[1]) };
    } else return { ok: false, hata: `bilinmeyen borsa ${k.borsa}` };
    if (!r.ok) return { ok: false, hata: r.hata, durum: r.durum };
    if (!satir || !(satir.fiyat > 0)) return { ok: false, bos: true, hata: `${gun} günü mumu yok (o tarihte listelenmemiş olabilir)` };
    const sonuc = { fiyat: satir.fiyat, kapanis: satir.kapanis, hacim: satir.hacim, kaynak: KAYNAK_ADI(k), sembol: k.sembol };
    if (onbKullan && gun < gunStr(this.simdi())) { onb.acilis[anahtar] = sonuc; this._onbYaz(); }
    return { ok: true, ...sonuc };
  }

  /** Binance USDⓈ-M exchangeInfo (koşu başına bir kez; ağırlık 1). */
  async perpBilgi() {
    if (this._perpBilgi) return this._perpBilgi;
    const r = await this._istek('binance', 'perp', 'https://fapi.binance.com/fapi/v1/exchangeInfo');
    if (!r.ok || !r.veri || !Array.isArray(r.veri.symbols)) throw new Error(`Binance perp listesi alınamadı: ${r.hata || 'boş yanıt'}`);
    this._perpBilgi = r.veri.symbols.map(x => ({ sembol: String(x.symbol), durum: String(x.status), tur: String(x.contractType), quote: String(x.quoteAsset), taban: String(x.baseAsset), alt: String(x.underlyingType || ''), liste: sayi(x.onboardDate) }));
    return this._perpBilgi;
  }

  async _spotIslemde(sembol) {
    if (this._spotDurum.has(sembol)) return this._spotDurum.get(sembol);
    const r = await this._istek('binance', 'spot', `https://api.binance.com/api/v3/exchangeInfo?symbol=${encodeURIComponent(sembol)}`);
    const v = !!(r.ok && r.veri && Array.isArray(r.veri.symbols) && r.veri.symbols[0] && r.veri.symbols[0].status === 'TRADING');
    this._spotDurum.set(sembol, v);
    return v;
  }

  /**
   * Sembolden fiyat kaynağı: Binance spot (İŞLEMDE) → Binance perp → Bybit → OKX → Gate. Bulunamazsa null.
   * Not: aynı sembol başka coin olabilir (LIT: Binance spot eski Litentry, BREAK → atlanır); eşleşme kayda yazılır.
   */
  async cozumle(taban) {
    const T = String(taban || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!T) return null;
    try { if (await this._spotIslemde(`${T}USDT`)) return { borsa: 'binance', piyasa: 'spot', sembol: `${T}USDT` }; } catch (e) { if (e && e.constructor && e.constructor.name === 'KotaHatasi') throw e; }
    try {
      const p = await this.perpBilgi();
      if (p.some(x => x.sembol === `${T}USDT` && x.durum === 'TRADING' && x.tur === 'PERPETUAL')) return { borsa: 'binance', piyasa: 'perp', sembol: `${T}USDT` };
    } catch (e) { if (e && e.constructor && e.constructor.name === 'KotaHatasi') throw e; }
    for (const k of [{ borsa: 'bybit', piyasa: 'spot', sembol: `${T}USDT` }, { borsa: 'okx', piyasa: 'spot', sembol: `${T}-USDT` }, { borsa: 'gate', piyasa: 'spot', sembol: `${T}_USDT` }]) {
      // eslint-disable-next-line no-await-in-loop
      const a = await this.anlik(k);
      if (a.ok) return k;
    }
    return null;
  }
}

module.exports = { FiyatKaynagi, KAYNAK_ADI };
