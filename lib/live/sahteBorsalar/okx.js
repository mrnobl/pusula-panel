'use strict';
/**
 * SAHTE OKX v5 SUNUCUSU (A2 / 5. faz parça 1 — TASARIM-MAKINE-HESAP-BOT §7.4). Ağ YOK.
 *
 * Gerçek ccxt `okx` sınıfı bu sunucuya `fetchImplementation` ile bağlanır (sahte fapi deseni, scripts/hata-matrisi-selftest.js B):
 * ccxt'nin kendi imzası, parametre dönüşümü ve hata eşlemesi (handleErrors) aynen çalışır; yalnız HTTP katmanı sahtedir.
 * Durumlu: emir defteri (normal + algo/koşullu), net pozisyon (KONTRAT, işaretli), bakiye, sunucu saati, hesap ayarı.
 *
 * OKX'e özgü kurallar (belgelenmiş davranış; gerçek demo hesapta 7c'de doğrulanacak):
 *   · cevap HTTP 200 + `code` ('0' başarı) — emir/iptal hatası `code: '1'` + `data[].sCode`
 *   · clOrdId / algoClOrdId yalnız harf-rakam, ≤ 32 → değilse 51000
 *   · `sz` KONTRAT (BTC-USDT-SWAP ctVal 0,01); lotSz katı ve ≥ minSz olmalı → 51121
 *   · özel uçlarda imza başlıkları + `x-simulated-trading: 1` (demo); zaman damgası ±30 sn → 50102
 *   · yinelenen clOrdId → 51016; yalnız-azaltan emir pozisyonu azaltmıyorsa → 51169; olmayan emir sorgusu → 51603;
 *     iptal: yok 51400, iptal edilmiş 51401, dolmuş 51402
 * Arıza enjeksiyonu (`ariza`): { yol: 'POST /api/v5/trade/order', durum, govde, basliklar, isle (işle, sonra arıza), firlat: 'TypeError' }.
 * `gorunmez`: sonraki N emir sorgusu emir varken de 51603 (zaman aşımından sonra geç görünme).
 */

const PAZARLAR = [
  { instId: 'BTC-USDT-SWAP', uly: 'BTC-USDT', ctVal: '0.01', lotSz: '0.01', minSz: '0.01', tickSz: '0.1', maxMktSz: '12000', maxLmtSz: '100000000' },
  { instId: 'ETH-USDT-SWAP', uly: 'ETH-USDT', ctVal: '0.1', lotSz: '0.01', minSz: '0.01', tickSz: '0.01', maxMktSz: '10000', maxLmtSz: '100000000' },
];

const ondalik = (s) => { const t = String(s); const i = t.indexOf('.'); return i < 0 ? 0 : t.length - i - 1; };
const katMi = (x, adim) => { const n = x / adim; return Math.abs(n - Math.round(n)) < 1e-9; };

class SahteOkx {
  constructor(opts = {}) {
    this.kayma = 0;                    // sunucu saati − yerel saat (ms)
    this.mark = { 'BTC-USDT-SWAP': 100000, 'ETH-USDT-SWAP': 4000, ...(opts.mark || {}) };
    this.pozisyon = {};                // instId → işaretli KONTRAT (net_mode)
    this.emirler = [];                 // normal emirler
    this.algolar = [];                 // koşullu (algo) emirler
    this.sira = 7000;
    this.ariza = [];
    this.istekler = [];                // 'GET /api/v5/...'
    this.kayit = [];                   // { yol, sorgu, govde, demo } — çağrı izi (parametre düzeyinde)
    this.gorunmez = 0;
    this.bakiye = opts.bakiye != null ? +opts.bakiye : 1000;
    this.config = { uid: '44400001', acctLv: '2', posMode: 'net_mode', perm: 'read_only,trade', ip: '', autoLoan: false, level: 'Lv1', ...(opts.config || {}) };
    this.demoBekle = opts.demoBekle !== false;
    this.kaldirac = {};
    this.faturalar = opts.faturalar || [];      // account/bills satırları
    this.gecmis = opts.gecmis || [];            // trade/orders-history satırları
    this.fetch = this.fetch.bind(this);
  }

  sunucuSaati() { return Date.now() + this.kayma; }
  pazar(instId) { return PAZARLAR.find(p => p.instId === instId) || null; }
  say(yol) { return this.istekler.filter(x => x === yol).length; }

  _cevap(durum, govde, basliklar = {}) {
    const g = govde === '' || govde == null ? null : (typeof govde === 'string' ? govde : JSON.stringify(govde));
    return new Response(g, { status: durum, headers: { 'content-type': 'application/json', ...basliklar } });
  }
  _tamam(data) { return this._cevap(200, { code: '0', data, msg: '' }); }
  _hata(kod, msg, durum = 200) { return this._cevap(durum, { code: String(kod), data: [], msg }); }
  /** Emir/iptal ucu hatası: code '1' + data[].sCode (OKX biçimi). */
  _sHata(kod, msg, ek = {}) { return this._cevap(200, { code: '1', data: [{ sCode: String(kod), sMsg: msg, ...ek }], msg: '' }); }

  async fetch(url, params = {}) {
    const u = new URL(url);
    const yontem = String(params.method || 'GET').toUpperCase();
    const yol = `${yontem} ${u.pathname}`;
    this.istekler.push(yol);
    const sorgu = Object.fromEntries(new URLSearchParams(u.search));
    let govde = null;
    if (params.body) { try { govde = JSON.parse(String(params.body)); } catch { govde = String(params.body); } }
    const bas = {};
    for (const [k, v] of Object.entries(params.headers || {})) bas[k.toLowerCase()] = v;
    this.kayit.push({ yol, sorgu, govde, demo: bas['x-simulated-trading'] || null });

    if (yol === 'GET /api/v5/public/time') return this._tamam([{ ts: String(this.sunucuSaati()) }]);
    if (yol === 'GET /api/v5/public/instruments') {
      if (sorgu.instType !== 'SWAP') return this._tamam([]);
      return this._tamam(PAZARLAR.map(p => ({ instType: 'SWAP', instId: p.instId, uly: p.uly, instFamily: p.uly, baseCcy: '', quoteCcy: '', settleCcy: 'USDT',
        ctVal: p.ctVal, ctMult: '1', ctValCcy: p.uly.split('-')[0], ctType: 'linear', lever: '100', tickSz: p.tickSz, lotSz: p.lotSz, minSz: p.minSz,
        maxLmtSz: p.maxLmtSz, maxMktSz: p.maxMktSz, state: 'live', listTime: '1611916828000', expTime: '', alias: '', optType: '', stk: '' })));
    }

    const ar = this.ariza.findIndex(a => a.yol === yol);
    const a = ar >= 0 ? this.ariza.splice(ar, 1)[0] : null;
    if (a && !a.isle) return this._ariza(a);

    if (u.pathname.startsWith('/api/v5/') && !u.pathname.startsWith('/api/v5/public/') && !u.pathname.startsWith('/api/v5/market/')) {
      if (!bas['ok-access-key'] || !bas['ok-access-sign'] || !bas['ok-access-passphrase'] || !bas['ok-access-timestamp']) return this._hata(50103, 'Request header OK-ACCESS-KEY can not be empty.', 401);
      if (this.demoBekle && bas['x-simulated-trading'] !== '1') return this._hata(50101, 'APIKey does not match current environment.', 401);
      const ts = Date.parse(bas['ok-access-timestamp']);
      if (!Number.isFinite(ts) || Math.abs(ts - this.sunucuSaati()) > 30000) return this._hata(50102, 'Timestamp request expired', 401);
    }
    const cevap = this._isle(yontem, u.pathname, sorgu, govde);
    if (a) return this._ariza(a);              // işlendi, cevap kayboldu/bozuk
    return cevap;
  }

  _ariza(a) {
    if (a.firlat === 'TypeError') throw new TypeError('fetch failed');
    return this._cevap(a.durum, a.govde, a.basliklar);
  }

  _emirJson(o) {
    return { instType: 'SWAP', instId: o.instId, ordId: o.ordId, clOrdId: o.clOrdId || '', tag: '', px: o.px ? String(o.px) : '', sz: String(o.sz),
      ordType: o.ordType, side: o.side, posSide: 'net', tdMode: 'cross', accFillSz: String(o.dolan), fillPx: o.dolan ? String(o.ort) : '',
      avgPx: o.dolan ? String(o.ort) : '', state: o.state, lever: '20', fee: o.dolan ? String(-(o.dolan * o.ort * 0.0005 * +this.pazar(o.instId).ctVal)) : '0',
      feeCcy: 'USDT', reduceOnly: o.reduceOnly ? 'true' : 'false', cTime: String(o.zaman), uTime: String(o.zaman), fillTime: o.dolan ? String(o.zaman) : '', category: 'normal' };
  }

  _algoJson(o) {
    return { instType: 'SWAP', instId: o.instId, algoId: o.algoId, algoClOrdId: o.algoClOrdId || '', clOrdId: o.clOrdId || '', ordType: 'conditional',
      side: o.side, posSide: 'net', tdMode: 'cross', sz: o.sz != null ? String(o.sz) : '', closeFraction: o.closeFraction || '', reduceOnly: 'true',
      slTriggerPx: String(o.slTriggerPx), slOrdPx: '-1', slTriggerPxType: o.slTriggerPxType || 'last', triggerPx: '', tpTriggerPx: '', tpOrdPx: '',
      state: o.state, cTime: String(o.zaman), uTime: String(o.zaman), actualSz: '', actualPx: '', lever: '20' };
  }

  _pozEkle(instId, kontrat) { this.pozisyon[instId] = +(((this.pozisyon[instId] || 0) + kontrat)).toFixed(8); if (this.pozisyon[instId] === 0) delete this.pozisyon[instId]; }

  _isle(yontem, yol, q, g) {
    const k = `${yontem} ${yol}`;
    switch (k) {
      case 'GET /api/v5/account/config': return this._tamam([{ ...this.config }]);
      case 'GET /api/v5/account/balance': {
        const mmr = Object.entries(this.pozisyon).reduce((t, [id, n]) => t + Math.abs(n) * +this.pazar(id).ctVal * this.mark[id] * 0.004, 0);
        return this._tamam([{ totalEq: String(this.bakiye), uTime: String(this.sunucuSaati()), adjEq: '', mmr: '', imr: '',
          details: [{ ccy: 'USDT', eq: String(this.bakiye), availEq: String(this.bakiye), availBal: String(this.bakiye), frozenBal: '0', cashBal: String(this.bakiye),
            mmr: String(mmr), imr: '0', mgnRatio: mmr > 0 ? String(this.bakiye / mmr) : '', upl: '0' }] }]);
      }
      case 'GET /api/v5/account/positions': {
        const filtre = q.instId ? q.instId.split(',') : null;
        return this._tamam(Object.entries(this.pozisyon).filter(([id]) => !filtre || filtre.includes(id)).map(([id, n]) => ({
          instType: 'SWAP', instId: id, mgnMode: 'cross', posSide: 'net', pos: String(n), posCcy: '', avgPx: String(this.mark[id]), markPx: String(this.mark[id]),
          liqPx: '', lever: '20', notionalUsd: String(Math.abs(n) * +this.pazar(id).ctVal * this.mark[id]), upl: '0', uplRatio: '0', imr: '0', mmr: '0', margin: '',
          ccy: 'USDT', posId: `p${id}`, cTime: '1', uTime: '1', adl: '1' })));
      }
      case 'GET /api/v5/public/mark-price': return this._tamam([{ instType: 'SWAP', instId: q.instId, markPx: String(this.mark[q.instId]), ts: String(this.sunucuSaati()) }]);
      case 'POST /api/v5/account/set-leverage': {
        if (g.mgnMode !== 'cross') return this._hata(51000, 'Parameter mgnMode error');
        this.kaldirac[g.instId] = +g.lever;
        return this._tamam([{ instId: g.instId, lever: String(g.lever), mgnMode: g.mgnMode, posSide: g.posSide || 'net' }]);
      }
      case 'POST /api/v5/trade/order': return this._emirKoy(g);
      case 'GET /api/v5/trade/order': {
        const o = this.emirler.find(x => (q.clOrdId && x.clOrdId === q.clOrdId) || (q.ordId && x.ordId === q.ordId));
        if (o && this.gorunmez > 0) { this.gorunmez--; return this._hata(51603, 'Order does not exist'); }
        return o ? this._tamam([this._emirJson(o)]) : this._hata(51603, 'Order does not exist');
      }
      case 'GET /api/v5/trade/orders-pending': {
        let l = this.emirler.filter(o => o.state === 'live' || o.state === 'partially_filled').filter(o => !q.instId || o.instId === q.instId)
          .sort((x, y) => +y.ordId - +x.ordId);
        if (q.after) l = l.filter(o => +o.ordId < +q.after);
        return this._tamam(l.slice(0, +(q.limit || 100)).map(o => this._emirJson(o)));
      }
      case 'POST /api/v5/trade/cancel-order': {
        const o = this.emirler.find(x => (g.clOrdId && x.clOrdId === g.clOrdId) || (g.ordId && x.ordId === g.ordId));
        if (!o) return this._sHata(51400, 'Order cancellation failed as the order does not exist', { ordId: g.ordId || '', clOrdId: g.clOrdId || '' });
        if (o.state === 'canceled') return this._sHata(51401, 'Order cancellation failed as the order has been canceled', { ordId: o.ordId, clOrdId: o.clOrdId });
        if (o.state === 'filled') return this._sHata(51402, 'Order cancellation failed as the order has been completed', { ordId: o.ordId, clOrdId: o.clOrdId });
        o.state = 'canceled';
        return this._tamam([{ ordId: o.ordId, clOrdId: o.clOrdId, sCode: '0', sMsg: '' }]);
      }
      case 'POST /api/v5/trade/order-algo': return this._algoKoy(g);
      case 'GET /api/v5/trade/order-algo': {
        const o = this.algolar.find(x => (q.algoClOrdId && x.algoClOrdId === q.algoClOrdId) || (q.algoId && x.algoId === q.algoId));
        return o ? this._tamam([this._algoJson(o)]) : this._hata(51603, 'Order does not exist');
      }
      case 'GET /api/v5/trade/orders-algo-pending': {
        if (!q.ordType) return this._hata(51000, 'Parameter ordType error');
        let l = this.algolar.filter(o => o.state === 'live' && q.ordType.split(',').includes('conditional')).filter(o => !q.instId || o.instId === q.instId)
          .sort((x, y) => +y.algoId - +x.algoId);
        if (q.after) l = l.filter(o => +o.algoId < +q.after);
        return this._tamam(l.slice(0, +(q.limit || 100)).map(o => this._algoJson(o)));
      }
      case 'POST /api/v5/trade/cancel-algos': {
        const l = Array.isArray(g) ? g : [g];
        const out = [];
        for (const x of l) {
          const o = this.algolar.find(a => a.algoId === x.algoId && a.instId === x.instId);
          if (!o || o.state !== 'live') return this._sHata(51603, 'Order does not exist', { algoId: x.algoId });
          o.state = 'canceled';
          out.push({ algoId: o.algoId, sCode: '0', sMsg: '' });
        }
        return this._tamam(out);
      }
      case 'GET /api/v5/account/bills': return this._tamam(this.faturalar.filter(b => !q.type || b.type === q.type).filter(b => !q.begin || +b.ts >= +q.begin));
      case 'GET /api/v5/trade/orders-history': return this._tamam(this.gecmis.filter(b => !q.begin || +b.uTime >= +q.begin));
      default: return this._hata(50000, `sahte okx: ${k} yok`, 404);
    }
  }

  _emirKoy(g) {
    if (!g || typeof g !== 'object' || Array.isArray(g)) return this._hata(50000, 'Body can not be empty');
    const p = this.pazar(g.instId);
    if (!p) return this._sHata(51001, 'Instrument ID does not exist');
    if (g.clOrdId != null && !/^[A-Za-z0-9]{1,32}$/.test(String(g.clOrdId))) return this._sHata(51000, 'Parameter clOrdId error', { clOrdId: String(g.clOrdId) });
    if (g.clOrdId && this.emirler.some(o => o.clOrdId === g.clOrdId)) return this._sHata(51016, 'Duplicated clOrdId', { clOrdId: g.clOrdId });
    if (g.tdMode !== 'cross') return this._sHata(51000, 'Parameter tdMode error', { clOrdId: g.clOrdId || '' });
    const sz = +g.sz;
    if (!(sz > 0) || !katMi(sz, +p.lotSz) || sz < +p.minSz) return this._sHata(51121, `Order quantity must be a multiple of the lot size (${p.lotSz})`, { clOrdId: g.clOrdId || '' });
    if (g.ordType === 'market' && sz > +p.maxMktSz) return this._sHata(51202, 'Market order amount exceeds the maximum amount', { clOrdId: g.clOrdId || '' });
    const n = this.pozisyon[g.instId] || 0;
    const ro = g.reduceOnly === true || g.reduceOnly === 'true';
    if (ro && !((g.side === 'sell' && n > 0) || (g.side === 'buy' && n < 0))) return this._sHata(51169, "Order failed because you don't have any positions in this direction for this contract to reduce or close.", { clOrdId: g.clOrdId || '' });
    if (g.ordType === 'limit' && !(+g.px > 0)) return this._sHata(51000, 'Parameter px error', { clOrdId: g.clOrdId || '' });
    const o = { ordId: String(++this.sira), clOrdId: g.clOrdId || '', instId: g.instId, side: g.side, ordType: g.ordType, sz: +sz.toFixed(ondalik(p.lotSz)),
      px: g.ordType === 'limit' ? +g.px : null, dolan: 0, ort: 0, state: 'live', reduceOnly: ro, zaman: this.sunucuSaati() };
    if (g.ordType === 'market') {
      const q = ro ? Math.min(sz, Math.abs(n)) : sz;
      o.dolan = q; o.ort = this.mark[g.instId]; o.state = 'filled';
      this._pozEkle(g.instId, g.side === 'buy' ? q : -q);
      this.bakiye -= q * +p.ctVal * o.ort * 0.0005;
    }
    this.emirler.push(o);
    return this._tamam([{ clOrdId: o.clOrdId, ordId: o.ordId, tag: '', ts: String(o.zaman), sCode: '0', sMsg: 'Order placed' }]);
  }

  _algoKoy(g) {
    if (!g || typeof g !== 'object' || Array.isArray(g)) return this._hata(50000, 'Body can not be empty');
    const p = this.pazar(g.instId);
    if (!p) return this._sHata(51001, 'Instrument ID does not exist');
    if (g.ordType !== 'conditional') return this._sHata(51000, 'Parameter ordType error');
    if (g.algoClOrdId != null && !/^[A-Za-z0-9]{1,32}$/.test(String(g.algoClOrdId))) return this._sHata(51000, 'Parameter algoClOrdId error');
    if (g.algoClOrdId && this.algolar.some(o => o.algoClOrdId === g.algoClOrdId)) return this._sHata(51016, 'Duplicated algoClOrdId');
    if (g.tdMode !== 'cross') return this._sHata(51000, 'Parameter tdMode error');
    if (!(+g.slTriggerPx > 0) || String(g.slOrdPx) !== '-1') return this._sHata(51000, 'Parameter slTriggerPx error');
    const kesir = g.closeFraction != null && g.closeFraction !== '';
    if (kesir && !(g.reduceOnly === true || g.reduceOnly === 'true')) return this._sHata(51328, 'closeFraction is only available for reduceOnly orders');
    if (kesir && g.sz != null && g.sz !== '') return this._sHata(51000, 'Parameter sz error (closeFraction ile sz verilmez)');
    if (!kesir && (!(+g.sz > 0) || !katMi(+g.sz, +p.lotSz))) return this._sHata(51121, `Order quantity must be a multiple of the lot size (${p.lotSz})`);
    const o = { algoId: String(++this.sira), algoClOrdId: g.algoClOrdId || '', clOrdId: g.clOrdId || '', instId: g.instId, side: g.side,
      sz: kesir ? null : +g.sz, closeFraction: kesir ? String(g.closeFraction) : '', slTriggerPx: +g.slTriggerPx, slTriggerPxType: g.slTriggerPxType || 'last',
      state: 'live', zaman: this.sunucuSaati() };
    this.algolar.push(o);
    return this._tamam([{ algoId: o.algoId, algoClOrdId: o.algoClOrdId, clOrdId: '', sCode: '0', sMsg: '', tag: '' }]);
  }

  /** Test yardımcısı: koşullu emri tetikle (pozisyon kapanır / azalır). */
  tetikle(algoId) {
    const o = this.algolar.find(a => a.algoId === algoId && a.state === 'live');
    if (!o) return false;
    const n = this.pozisyon[o.instId] || 0;
    const q = o.closeFraction ? Math.abs(n) : Math.min(o.sz, Math.abs(n));
    this._pozEkle(o.instId, o.side === 'buy' ? q : -q);
    o.state = 'effective';
    return true;
  }

  /** Test yardımcısı: borsaya elle (yabancı) emir koy. */
  yabanciEmirKoy(instId = 'BTC-USDT-SWAP') {
    const o = { ordId: String(++this.sira), clOrdId: '', instId, side: 'buy', ordType: 'limit', sz: 1, px: 90000, dolan: 0, ort: 0, state: 'live', reduceOnly: false, zaman: this.sunucuSaati() };
    this.emirler.push(o);
    return o;
  }
}

module.exports = { SahteOkx, PAZARLAR };
