'use strict';
/**
 * SAHTE BYBIT v5 SUNUCUSU (A2 / 5. faz — OKX sahtesinin eşi, lib/live/sahteBorsalar/okx.js). Ağ YOK.
 *
 * Gerçek ccxt `bybit` sınıfı bu sunucuya `fetchImplementation` ile bağlanır: ccxt'nin kendi imzası, parametre dönüşümü ve hata eşlemesi
 * (handleErrors) aynen çalışır; yalnız HTTP katmanı sahtedir. Durumlu: emir defteri (normal + koşullu, aynı defter — Bybit'te olduğu
 * gibi), tek yön pozisyon (baz miktar, işaretli), bakiye (UTA), sunucu saati, hesap bilgisi (account/info), anahtar bilgisi (query-api).
 *
 * Bybit'e özgü kurallar (belgelenmiş davranış; gerçek demo hesapta hazir:true adımında doğrulanacak):
 *   · cevap HTTP 200 + `retCode` (0 başarı) + `result`; IP hız sınırı HTTP 403 (gövdesiz)
 *   · orderLinkId harf/rakam/-/_, ≤ 36 → değilse 10001; yinelenen orderLinkId → 110072
 *   · `qty` BAZ miktar; qtyStep katı ve ≥ minOrderQty → değilse 10001; piyasa emri ≤ maxMktOrderQty
 *   · `qty "0"` yalnız reduceOnly + closeOnTrigger koşullu emirde (tetiklenince tüm pozisyonu kapatır)
 *   · koşullu emir: triggerDirection 1 (yükselirken) tetik > mark, 2 (düşerken) tetik < mark → değilse 110092 / 110093
 *   · özel uçlarda imza başlıkları (X-BAPI-API-KEY / -SIGN / -TIMESTAMP / -RECV-WINDOW); zaman damgası penceresi:
 *     sunucu − recvWindow ≤ ts < sunucu + 1000 → değilse 10002
 *   · demo anahtarı yalnız api-demo.bybit.com'da geçer (başka host → 10003)
 *   · reduceOnly emir pozisyonu azaltmıyorsa 110017; olmayan emir iptali 110001; kaldıraç aynıysa 110043
 *   · hedge kipinde (ayar posMode 'hedge') positionIdx 0 → 10001 (position idx not match position mode)
 * Arıza enjeksiyonu (`ariza`): { yol: 'POST /v5/order/create', durum, govde, basliklar, isle (işle, sonra arıza), firlat: 'TypeError' }.
 * `gorunmez`: sonraki N emir sorgusu emir varken de boş liste (zaman aşımından sonra geç görünme).
 */

const PAZARLAR = [
  { symbol: 'BTCUSDT', baseCoin: 'BTC', qtyStep: '0.001', minOrderQty: '0.001', maxOrderQty: '1190', maxMktOrderQty: '120', tickSize: '0.10', minNotionalValue: '5' },
  { symbol: 'ETHUSDT', baseCoin: 'ETH', qtyStep: '0.01', minOrderQty: '0.01', maxOrderQty: '7240', maxMktOrderQty: '1000', tickSize: '0.01', minNotionalValue: '5' },
];
const ON_PIYASA = [{ symbol: 'YENIUSDT', baseCoin: 'YENI', qtyStep: '1', minOrderQty: '1', maxOrderQty: '100000', maxMktOrderQty: '10000', tickSize: '0.0001', minNotionalValue: '5' }];

const ondalik = (s) => { const t = String(s); const i = t.indexOf('.'); return i < 0 ? 0 : t.length - i - 1; };
const katMi = (x, adim) => { const n = x / adim; return Math.abs(n - Math.round(n)) < 1e-9; };
const evet = (v) => v === true || v === 'true';

class SahteBybit {
  constructor(opts = {}) {
    this.kayma = 0;                    // sunucu saati − yerel saat (ms)
    this.mark = { BTCUSDT: 100000, ETHUSDT: 4000, ...(opts.mark || {}) };
    this.pozisyon = {};                // symbol → işaretli BAZ miktar (tek yön)
    this.emirler = [];                 // normal + koşullu
    this.sira = 7000;
    this.ariza = [];
    this.istekler = [];                // 'GET /v5/...'
    this.kayit = [];                   // { yol, host, sorgu, govde } — çağrı izi (parametre düzeyinde)
    this.gorunmez = 0;
    this.bakiye = opts.bakiye != null ? +opts.bakiye : 1000;
    this.hesap = { unifiedMarginStatus: 5, marginMode: 'REGULAR_MARGIN', isMasterTrader: false, spotHedgingStatus: 'OFF', updatedTime: '1697078946000', dcpStatus: 'OFF', timeWindow: 10, smpGroup: 0, ...(opts.hesap || {}) };
    this.api = { id: '13770661', note: 'pusula-demo', apiKey: 'bybit-demo-anahtar', readOnly: 0, secret: '',
      permissions: { ContractTrade: ['Order', 'Position'], Spot: ['SpotTrade'], Wallet: ['AccountTransfer'], Options: [], Derivatives: [], CopyTrading: [], BlockTrade: [], Exchange: [], NFT: [], Affiliate: [] },
      ips: ['*'], type: 1, deadlineDay: 83, expiredAt: '', createdAt: '2026-10-01T00:00:00Z', unified: 0, uta: 1, userID: 24600000, inviterID: 0, vipLevel: 'No VIP',
      mktMakerLevel: '0', affiliateID: 0, rsaPublicKey: '', isMaster: true, parentUid: '0', ...(opts.api || {}) };
    this.posMode = opts.posMode || 'oneway';
    this.demoHost = opts.demoHost || 'api-demo.bybit.com';
    this.demoBekle = opts.demoBekle !== false;
    this.kaldirac = {};
    this.islemKaydi = opts.islemKaydi || [];    // account/transaction-log satırları
    this.gecmis = opts.gecmis || [];            // order/history'ye eklenen hazır satırlar (likidasyon/ADL)
    this.pazarlar = opts.pazarlar || PAZARLAR;
    this.fetch = this.fetch.bind(this);
  }

  sunucuSaati() { return Date.now() + this.kayma; }
  pazar(symbol) { return this.pazarlar.find(p => p.symbol === symbol) || null; }
  say(yol) { return this.istekler.filter(x => x === yol).length; }

  _cevap(durum, govde, basliklar = {}) {
    const g = govde === '' || govde == null ? null : (typeof govde === 'string' ? govde : JSON.stringify(govde));
    return new Response(g, { status: durum, headers: { 'content-type': 'application/json', ...basliklar } });
  }
  _tamam(result) { return this._cevap(200, { retCode: 0, retMsg: 'OK', result, retExtInfo: {}, time: this.sunucuSaati() }); }
  _hata(kod, msg, durum = 200) { return this._cevap(durum, { retCode: kod, retMsg: msg, result: {}, retExtInfo: {}, time: this.sunucuSaati() }); }

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
    this.kayit.push({ yol, host: u.host, sorgu, govde });

    const ar = this.ariza.findIndex(a => a.yol === yol);
    const a = ar >= 0 ? this.ariza.splice(ar, 1)[0] : null;
    if (a && !a.isle) return this._ariza(a);
    if (yol === 'GET /v5/market/time') { const t = this.sunucuSaati(); return this._tamam({ timeSecond: String(Math.floor(t / 1000)), timeNano: `${t}000000` }); }
    if (yol === 'GET /v5/market/instruments-info') return this._pazarlar(sorgu);

    if (u.pathname.startsWith('/v5/') && !u.pathname.startsWith('/v5/market/')) {
      if (!bas['x-bapi-api-key'] || !bas['x-bapi-sign'] || !bas['x-bapi-timestamp'] || !bas['x-bapi-recv-window']) return this._hata(10003, 'API key is invalid.');
      if (this.demoBekle && u.host !== this.demoHost) return this._hata(10003, 'API key is invalid.');
      const ts = +bas['x-bapi-timestamp'], rw = +bas['x-bapi-recv-window'], s = this.sunucuSaati();
      if (!Number.isFinite(ts) || !(ts >= s - rw && ts < s + 1000)) return this._hata(10002, `invalid request, please check your server timestamp or recv_window param. req_timestamp[${ts}],server_timestamp[${s}],recv_window[${rw}]`);
    }
    const cevap = this._isle(yontem, u.pathname, sorgu, govde);
    if (a) return this._ariza(a);              // işlendi, cevap kayboldu/bozuk
    return cevap;
  }

  _ariza(a) {
    if (a.firlat === 'TypeError') throw new TypeError('fetch failed');
    return this._cevap(a.durum, a.govde, a.basliklar);
  }

  _pazarJson(p, durum = 'Trading') {
    return { symbol: p.symbol, contractType: 'LinearPerpetual', status: durum, baseCoin: p.baseCoin, quoteCoin: 'USDT', launchTime: '1585526400000', deliveryTime: '0',
      deliveryFeeRate: '', priceScale: String(ondalik(p.tickSize)), leverageFilter: { minLeverage: '1', maxLeverage: '100.00', leverageStep: '0.01' },
      priceFilter: { minPrice: '0.10', maxPrice: '1999999.80', tickSize: p.tickSize },
      lotSizeFilter: { maxOrderQty: p.maxOrderQty, minOrderQty: p.minOrderQty, qtyStep: p.qtyStep, postOnlyMaxOrderQty: p.maxOrderQty, maxMktOrderQty: p.maxMktOrderQty, minNotionalValue: p.minNotionalValue },
      unifiedMarginTrade: true, fundingInterval: 480, settleCoin: 'USDT', copyTrading: 'both', upperFundingRate: '0.005', lowerFundingRate: '-0.005', isPreListing: durum === 'PreLaunch' };
  }

  _pazarlar(q) {
    if (q.category !== 'linear') return this._tamam({ category: q.category, list: [], nextPageCursor: '' });
    if (q.status === 'PreLaunch') return this._tamam({ category: 'linear', list: ON_PIYASA.map(p => this._pazarJson(p, 'PreLaunch')), nextPageCursor: '' });
    return this._tamam({ category: 'linear', list: this.pazarlar.map(p => this._pazarJson(p)), nextPageCursor: '' });
  }

  _emirJson(o) {
    return { orderId: o.orderId, orderLinkId: o.orderLinkId || '', blockTradeId: '', symbol: o.symbol, price: o.price ? String(o.price) : '0', qty: String(o.qty),
      side: o.side, isLeverage: '', positionIdx: 0, orderStatus: o.orderStatus, createType: o.createType || 'CreateByUser', cancelType: 'UNKNOWN', rejectReason: 'EC_NoError',
      avgPrice: o.dolan ? String(o.ort) : '', leavesQty: String(o.orderStatus === 'New' || o.orderStatus === 'Untriggered' ? o.qty - o.dolan : 0), leavesValue: '0',
      cumExecQty: String(o.dolan), cumExecValue: String(o.dolan * o.ort), cumExecFee: String(o.dolan * o.ort * 0.00055), timeInForce: o.orderType === 'Market' ? 'IOC' : 'GTC',
      orderType: o.orderType, stopOrderType: o.sartli ? 'Stop' : '', orderIv: '', marketUnit: '', triggerPrice: o.sartli ? String(o.triggerPrice) : '',
      takeProfit: '', stopLoss: '', tpslMode: '', ocoTriggerBy: '', tpLimitPrice: '', slLimitPrice: '', tpTriggerBy: '', slTriggerBy: '',
      triggerDirection: o.sartli ? o.triggerDirection : 0, triggerBy: o.sartli ? o.triggerBy : '', lastPriceOnCreated: String(this.mark[o.symbol] || ''),
      basePrice: '', reduceOnly: !!o.reduceOnly, closeOnTrigger: !!o.closeOnTrigger, placeType: '', smpType: 'None', smpGroup: 0, smpOrderId: '',
      createdTime: String(o.zaman), updatedTime: String(o.zaman) };
  }

  _pozEkle(symbol, q) { const p = this.pazar(symbol); this.pozisyon[symbol] = +(((this.pozisyon[symbol] || 0) + q)).toFixed(p ? ondalik(p.qtyStep) + 2 : 8); if (Math.abs(this.pozisyon[symbol]) < 1e-12) delete this.pozisyon[symbol]; }

  _pozSatir(symbol, n, idx = 0) {
    const m = this.mark[symbol];
    return { positionIdx: idx, riskId: 1, riskLimitValue: '2000000', symbol, side: n > 0 ? 'Buy' : n < 0 ? 'Sell' : '', size: String(Math.abs(n)), avgPrice: String(m),
      positionValue: String(Math.abs(n) * m), tradeMode: 0, autoAddMargin: 0, positionStatus: 'Normal', leverage: String(this.kaldirac[symbol] || 10), markPrice: String(m),
      liqPrice: n ? String(n > 0 ? m * 0.5 : m * 1.5) : '', bustPrice: '', positionIM: '0', positionMM: String(Math.abs(n) * m * 0.005), positionBalance: '0',
      tpslMode: 'Full', takeProfit: '0', stopLoss: '0', trailingStop: '0', sessionAvgPrice: '', delta: '', gamma: '', vega: '', theta: '', unrealisedPnl: '0',
      curRealisedPnl: '0', cumRealisedPnl: '0', adlRankIndicator: n ? 2 : 0, isReduceOnly: false, mmrSysUpdatedTime: '', leverageSysUpdatedTime: '',
      createdTime: '1676538056258', updatedTime: String(this.sunucuSaati()), seq: 1 };
  }

  _sayfa(l, q, sinir) {
    const limit = Math.min(+(q.limit || sinir), sinir);
    const bas = q.cursor ? +q.cursor : 0;
    const dilim = l.slice(bas, bas + limit);
    return { list: dilim, nextPageCursor: bas + limit < l.length ? String(bas + limit) : '' };
  }

  _filtre(o, f) { return !f || (f === 'StopOrder' ? o.sartli : f === 'Order' ? !o.sartli : true); }

  _isle(yontem, yol, q, g) {
    const k = `${yontem} ${yol}`;
    switch (k) {
      case 'GET /v5/account/info': return this._tamam({ ...this.hesap });
      case 'GET /v5/user/query-api': return this._tamam({ ...this.api });
      case 'GET /v5/account/wallet-balance': {
        if (q.accountType !== 'UNIFIED') return this._hata(10001, 'accountType only support UNIFIED.');
        const mm = Object.entries(this.pozisyon).reduce((t, [s, n]) => t + Math.abs(n) * this.mark[s] * 0.005, 0);
        const b = String(this.bakiye);
        return this._tamam({ list: [{ accountType: 'UNIFIED', accountIMRate: '0', accountMMRate: this.bakiye > 0 ? String(mm / this.bakiye) : '0', totalEquity: b, totalWalletBalance: b,
          totalMarginBalance: b, totalAvailableBalance: b, totalPerpUPL: '0', totalInitialMargin: '0', totalMaintenanceMargin: String(mm), accountLTV: '0',
          coin: [{ coin: 'USDT', equity: b, usdValue: b, walletBalance: b, free: '', locked: '0', spotHedgingQty: '0', borrowAmount: '0', availableToWithdraw: '',
            accruedInterest: '0', totalOrderIM: '0', totalPositionIM: '0', totalPositionMM: String(mm), unrealisedPnl: '0', cumRealisedPnl: '0', bonus: '0', marginCollateral: true, collateralSwitch: true }] }] });
      }
      case 'GET /v5/position/list': {
        if (q.category !== 'linear') return this._hata(10001, 'params error: category');
        let l;
        if (q.symbol) {
          if (!this.pazar(q.symbol)) return this._hata(10001, 'params error: symbol invalid');
          const n = this.pozisyon[q.symbol] || 0;
          l = this.posMode === 'hedge' ? [this._pozSatir(q.symbol, n > 0 ? n : 0, 1), this._pozSatir(q.symbol, n < 0 ? n : 0, 2)] : [this._pozSatir(q.symbol, n)];
        } else {
          if (q.settleCoin !== 'USDT') return this._hata(10001, 'params error: symbol or settleCoin is required');
          l = Object.entries(this.pozisyon).map(([s, n]) => this._pozSatir(s, n, this.posMode === 'hedge' ? (n > 0 ? 1 : 2) : 0));
        }
        return this._tamam({ category: 'linear', ...this._sayfa(l, q, 200) });
      }
      case 'GET /v5/market/tickers': {
        if (q.category !== 'linear') return this._hata(10001, 'params error: category');
        const l = this.pazarlar.filter(p => !q.symbol || p.symbol === q.symbol).map(p => ({ symbol: p.symbol, lastPrice: String(this.mark[p.symbol]), indexPrice: String(this.mark[p.symbol]),
          markPrice: String(this.mark[p.symbol]), prevPrice24h: '', price24hPcnt: '0', highPrice24h: '', lowPrice24h: '', prevPrice1h: '', openInterest: '1000',
          openInterestValue: '', turnover24h: '1000000', volume24h: '10', fundingRate: p.symbol === 'BTCUSDT' ? '0.0001' : '-0.0002', nextFundingTime: '1700000000000',
          predictedDeliveryPrice: '', basisRate: '', deliveryFeeRate: '', deliveryTime: '0', ask1Size: '1', bid1Price: '', ask1Price: '', bid1Size: '1', basis: '' }));
        return this._tamam({ category: 'linear', list: l });
      }
      case 'POST /v5/position/set-leverage': {
        if (!g || g.category !== 'linear' || !this.pazar(g.symbol)) return this._hata(10001, 'params error');
        if (String(g.buyLeverage) !== String(g.sellLeverage)) return this._hata(10001, 'buy leverage must equal sell leverage in one-way mode');
        if (this.kaldirac[g.symbol] === +g.buyLeverage) return this._hata(110043, 'Set leverage not modified');
        this.kaldirac[g.symbol] = +g.buyLeverage;
        return this._tamam({});
      }
      case 'POST /v5/order/create': return this._emirKoy(g);
      case 'GET /v5/order/realtime': {
        if (q.category !== 'linear') return this._hata(10001, 'params error: category');
        if (q.orderLinkId || q.orderId) {
          const o = this.emirler.find(x => this._filtre(x, q.orderFilter) && ((q.orderLinkId && x.orderLinkId === q.orderLinkId) || (q.orderId && x.orderId === q.orderId)));
          if (o && this.gorunmez > 0) { this.gorunmez--; return this._tamam({ category: 'linear', list: [], nextPageCursor: '' }); }
          return this._tamam({ category: 'linear', list: o ? [this._emirJson(o)] : [], nextPageCursor: '' });
        }
        if (!q.symbol && q.settleCoin !== 'USDT') return this._hata(10001, 'params error: symbol or settleCoin is required');
        const l = this.emirler.filter(o => (o.orderStatus === 'New' || o.orderStatus === 'PartiallyFilled' || o.orderStatus === 'Untriggered') && this._filtre(o, q.orderFilter))
          .filter(o => !q.symbol || o.symbol === q.symbol).sort((x, y) => +y.orderId - +x.orderId).map(o => this._emirJson(o));
        return this._tamam({ category: 'linear', ...this._sayfa(l, q, 50) });
      }
      case 'GET /v5/order/history': {
        if (q.category !== 'linear') return this._hata(10001, 'params error: category');
        if (q.orderLinkId || q.orderId) {
          const o = this.emirler.find(x => this._filtre(x, q.orderFilter) && ((q.orderLinkId && x.orderLinkId === q.orderLinkId) || (q.orderId && x.orderId === q.orderId)));
          if (o && this.gorunmez > 0) { this.gorunmez--; return this._tamam({ category: 'linear', list: [], nextPageCursor: '' }); }
          return this._tamam({ category: 'linear', list: o ? [this._emirJson(o)] : [], nextPageCursor: '' });
        }
        const l = [...this.emirler.filter(o => !['New', 'PartiallyFilled', 'Untriggered'].includes(o.orderStatus)).map(o => this._emirJson(o)), ...this.gecmis]
          .filter(o => !q.symbol || o.symbol === q.symbol).filter(o => !q.startTime || +o.updatedTime >= +q.startTime).sort((x, y) => +y.updatedTime - +x.updatedTime);
        return this._tamam({ category: 'linear', ...this._sayfa(l, q, 50) });
      }
      case 'POST /v5/order/cancel': {
        if (!g || g.category !== 'linear') return this._hata(10001, 'params error: category');
        const o = this.emirler.find(x => x.symbol === g.symbol && ((g.orderLinkId && x.orderLinkId === g.orderLinkId) || (g.orderId && x.orderId === g.orderId)));
        if (!o || !['New', 'PartiallyFilled', 'Untriggered'].includes(o.orderStatus)) return this._hata(110001, 'Order does not exist.');
        o.orderStatus = o.sartli ? 'Deactivated' : 'Cancelled';
        return this._tamam({ orderId: o.orderId, orderLinkId: o.orderLinkId });
      }
      case 'GET /v5/account/transaction-log': return this._tamam({ list: this.islemKaydi.filter(b => !q.type || b.type === q.type).filter(b => !q.startTime || +b.transactionTime >= +q.startTime), nextPageCursor: '' });
      default: return this._hata(10017, `sahte bybit: ${k} yok`, 404);
    }
  }

  _emirKoy(g) {
    if (!g || typeof g !== 'object' || Array.isArray(g)) return this._hata(10001, 'params error: body');
    if (g.category !== 'linear') return this._hata(10001, 'params error: category');
    const p = this.pazar(g.symbol);
    if (!p) return this._hata(10001, 'params error: symbol invalid');
    if (g.orderLinkId != null && !/^[A-Za-z0-9_-]{1,36}$/.test(String(g.orderLinkId))) return this._hata(10001, 'params error: orderLinkId invalid');
    if (g.orderLinkId && this.emirler.some(o => o.orderLinkId === g.orderLinkId)) return this._hata(110072, 'OrderLinkedID is duplicate');
    if (g.side !== 'Buy' && g.side !== 'Sell') return this._hata(10001, 'params error: side invalid');
    if (g.orderType !== 'Market' && g.orderType !== 'Limit') return this._hata(10001, 'params error: orderType invalid');
    if (this.posMode === 'hedge' ? !(+g.positionIdx === 1 || +g.positionIdx === 2) : !(g.positionIdx == null || +g.positionIdx === 0)) return this._hata(10001, 'position idx not match position mode');
    const ro = evet(g.reduceOnly), cot = evet(g.closeOnTrigger);
    const sartli = g.triggerPrice != null && g.triggerPrice !== '';
    const qty = +g.qty;
    const tumu = sartli && String(g.qty) === '0' && ro && cot;
    if (!tumu && (!(qty > 0) || !katMi(qty, +p.qtyStep) || qty < +p.minOrderQty)) return this._hata(10001, `Qty invalid (qtyStep ${p.qtyStep}, minOrderQty ${p.minOrderQty})`);
    if (g.orderType === 'Market' && qty > +p.maxMktOrderQty) return this._hata(10001, `The number of contracts exceeds maximum limit allowed: too large (maxMktOrderQty ${p.maxMktOrderQty})`);
    if (g.orderType === 'Limit' && (!(+g.price > 0) || !katMi(+g.price, +p.tickSize))) return this._hata(10001, 'params error: price invalid');
    const n = this.pozisyon[g.symbol] || 0;
    const o = { orderId: String(++this.sira), orderLinkId: g.orderLinkId || '', symbol: g.symbol, side: g.side, orderType: g.orderType, qty: tumu ? 0 : qty,
      price: g.orderType === 'Limit' ? +g.price : null, dolan: 0, ort: 0, orderStatus: 'New', reduceOnly: ro, closeOnTrigger: cot, zaman: this.sunucuSaati(), sartli };
    if (sartli) {
      const t = +g.triggerPrice, yon = +g.triggerDirection, mk = this.mark[g.symbol];
      if (!(t > 0) || !katMi(t, +p.tickSize)) return this._hata(10001, 'params error: triggerPrice invalid');
      if (yon !== 1 && yon !== 2) return this._hata(10001, 'params error: triggerDirection invalid');
      if (yon === 1 && !(t > mk)) return this._hata(110092, `expect Rising, but trigger_price[${t}] <= current[${mk}]`);
      if (yon === 2 && !(t < mk)) return this._hata(110093, `expect Falling, but trigger_price[${t}] >= current[${mk}]`);
      Object.assign(o, { triggerPrice: t, triggerDirection: yon, triggerBy: g.triggerBy || 'LastPrice', orderStatus: 'Untriggered' });
      this.emirler.push(o);
      return this._tamam({ orderId: o.orderId, orderLinkId: o.orderLinkId });
    }
    if (ro && !((g.side === 'Sell' && n > 0) || (g.side === 'Buy' && n < 0))) return this._hata(110017, 'Reduce-only rule not satisfied');
    if (g.orderType === 'Market') {
      const q = ro ? Math.min(qty, Math.abs(n)) : qty;
      o.dolan = q; o.ort = this.mark[g.symbol]; o.orderStatus = 'Filled';
      this._pozEkle(g.symbol, g.side === 'Buy' ? q : -q);
      this.bakiye -= q * o.ort * 0.00055;
    }
    this.emirler.push(o);
    return this._tamam({ orderId: o.orderId, orderLinkId: o.orderLinkId });
  }

  /** Test yardımcısı: koşullu emri tetikle (pozisyon kapanır / azalır). */
  tetikle(orderId) {
    const o = this.emirler.find(a => a.orderId === orderId && a.sartli && a.orderStatus === 'Untriggered');
    if (!o) return false;
    const n = this.pozisyon[o.symbol] || 0;
    const q = o.qty === 0 ? Math.abs(n) : Math.min(o.qty, Math.abs(n));
    this._pozEkle(o.symbol, o.side === 'Buy' ? q : -q);
    o.dolan = q; o.ort = this.mark[o.symbol]; o.orderStatus = 'Filled';
    return true;
  }

  /** Test yardımcısı: borsaya elle (yabancı) emir koy. */
  yabanciEmirKoy(symbol = 'BTCUSDT') {
    const o = { orderId: String(++this.sira), orderLinkId: '', symbol, side: 'Buy', orderType: 'Limit', qty: 0.001, price: 90000, dolan: 0, ort: 0, orderStatus: 'New', reduceOnly: false, closeOnTrigger: false, zaman: this.sunucuSaati(), sartli: false };
    this.emirler.push(o);
    return o;
  }
}

module.exports = { SahteBybit, PAZARLAR };
