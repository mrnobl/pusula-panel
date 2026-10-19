/**
 * SAHTE BORSA — ccxt `binanceusdm`in yürütücünün kullandığı alt kümesi.
 *
 * Testler ağa çıkmadan canlı yürütücünün bütün yollarını sınar: dolum, red,
 * zaman aşımı (emir GİTTİ ama cevap gelmedi / hiç gitmedi), yeniden başlatma,
 * yabancı emir. Hatalar `hataPlani` ile enjekte edilir.
 *
 * hataPlani girdisi (M3 hata matrisi): { metot, hata?, cevap?, gitti?, basliklar? }
 *   hata      atılacak hata (ccxt sınıfı ya da herhangi bir Error)
 *   cevap     hata yerine DÖNDÜRÜLECEK bozuk gövde ({} / null / '') — 200 + boş cevap
 *   gitti     createOrder/cancelOrder: işlem borsada GERÇEKLEŞİR, sonra hata/cevap gelir
 *   basliklar `last_response_headers` (ör. { 'Retry-After': '7' }) — ccxt'nin yaptığı gibi
 * `gorunmez`: sonraki N fetchOrder, emir borsada olsa bile OrderNotFound verir
 * (Binance'te zaman aşımından hemen sonra emrin sorguda henüz görünmemesi).
 *
 * Pazar filtreleri Binance prod BTCUSDT'nin 2026-10-06 değerleri
 * (tick 0.10, adım 0.001, min nominal 50, piyasa emri en çok 120).
 */
const ccxt = require('ccxt');

function btcPazari() {
  return {
    id: 'BTCUSDT', symbol: 'BTC/USDT:USDT', base: 'BTC', quote: 'USDT', settle: 'USDT',
    type: 'swap', swap: true, linear: true, contract: true, contractSize: 1,
    taker: 0.0005, maker: 0.0002,
    precision: { price: 0.1, amount: 0.001 },
    limits: { amount: { min: 0.001, max: 1000 }, market: { min: 0.001, max: 120 }, cost: { min: 50 }, price: { min: 261.1 } },
    info: { filters: [{ filterType: 'PERCENT_PRICE', multiplierUp: '1.0500', multiplierDown: '0.9500' }] },
  };
}

class SahteBorsa {
  constructor(opts = {}) {
    this.opts = opts;
    this.markets = {};
    this.mark = 100000;
    this.bakiye = 1000;
    this.pozisyon = 0;                 // net, BTC (one-way)
    this.emirler = new Map();          // id → emir
    this.sira = 0;
    this.hataPlani = [];               // { metot, hata, gitti? }
    this.cagri = [];
    this.gorunmez = 0;
    this.last_response_headers = undefined;
    this.izinler = { enableWithdrawals: false, enableFutures: true, ipRestrict: true };
    this.hedged = false;
    this.__demo = false;
    SahteBorsa.son = this;
  }

  _hata(metot) {
    this.cagri.push(metot);
    const i = this.hataPlani.findIndex(h => h.metot === metot);
    if (i < 0) return null;
    const h = this.hataPlani.splice(i, 1)[0];
    this.last_response_headers = h.basliklar;
    return h;
  }

  /** Plan girdisini uygular: `cevap` varsa onu döndürür ({ cevap }), yoksa hatayı atar. */
  _uygula(h) {
    if ('cevap' in h) return { cevap: h.cevap };
    throw h.hata;
  }

  /** ccxt `loadTimeDifference`: sunucu saatine göre farkı yeniden ölçer. */
  async loadTimeDifference() {
    const h = this._hata('loadTimeDifference'); if (h) return this._uygula(h).cevap;
    this.saatOlcumSay = (this.saatOlcumSay || 0) + 1;
    return 0;
  }

  enableDemoTrading(v) { this.__demo = !!v; }
  async loadMarkets() { this._hata('loadMarkets'); this.markets = { 'BTC/USDT:USDT': btcPazari() }; return this.markets; }
  async sapiGetAccountApiRestrictions() { const h = this._hata('sapi'); if (h) throw h.hata; return { ...this.izinler }; }
  async fetchPositionMode() { return { hedged: this.hedged }; }
  async fetchMarkPrice() { return { markPrice: this.mark }; }

  /** Günlük mum dizisi: `this.gunluk` ([ [t,o,h,l,c,v], ... ]). Son eleman oluşmakta olabilir. */
  async fetchOHLCV(symbol, tf, since, limit) {
    this._hata('fetchOHLCV');
    return (this.gunluk || []).filter(m => since == null || m[0] >= since).slice(-(limit || 1000));
  }

  async fetchBalance() {
    const h = this._hata('fetchBalance'); if (h) return this._uygula(h).cevap;
    return { total: { USDT: this.bakiye }, free: { USDT: this.bakiye }, used: { USDT: 0 } };
  }

  async fetchPositions(semboller) {
    const h = this._hata('fetchPositions'); if (h) return this._uygula(h).cevap;
    if (!this.pozisyon) return [];
    return [{ symbol: 'BTC/USDT:USDT', side: this.pozisyon > 0 ? 'long' : 'short', contracts: Math.abs(this.pozisyon),
      entryPrice: this.mark, markPrice: this.mark, liquidationPrice: null, leverage: 1, marginMode: 'isolated',
      unrealizedPnl: 0, notional: Math.abs(this.pozisyon) * this.mark }];
  }

  async fetchOpenOrders() {
    const h = this._hata('fetchOpenOrders'); if (h) return this._uygula(h).cevap;
    return [...this.emirler.values()].filter(o => o.status === 'open').map(o => ({ ...o }));
  }

  _bul(id, params = {}) {
    const cid = params.clientOrderId || params.origClientOrderId;
    for (const o of this.emirler.values()) if ((cid && o.clientOrderId === cid) || (id && o.id === id)) return o;
    return null;
  }

  async fetchOrder(id, symbol, params = {}) {
    const h = this._hata('fetchOrder'); if (h) return this._uygula(h).cevap;
    const o = this._bul(id, params);
    if (o && this.gorunmez > 0) { this.gorunmez--; throw new ccxt.OrderNotFound('Order does not exist'); }
    if (!o) throw new ccxt.OrderNotFound('Order does not exist');
    return { ...o };
  }

  async createOrder(symbol, type, side, amount, price, params = {}) {
    const h = this._hata('createOrder');
    if (h && !h.gitti) return this._uygula(h).cevap;
    if (params.clientOrderId && this._bul(null, params) && this._bul(null, params).status === 'open') {
      throw new ccxt.InvalidOrder('-4015 Client order id is not valid (duplicate)');
    }
    if (this.hedged && params.reduceOnly) throw new ccxt.InvalidOrder('-1106 reduceonly not required in hedge mode');
    if (params.reduceOnly) {
      const azaltir = (side === 'sell' && this.pozisyon > 0) || (side === 'buy' && this.pozisyon < 0);
      if (!azaltir) throw new ccxt.InvalidOrder('-2022 ReduceOnly Order is rejected');
    }
    const o = { id: String(++this.sira), clientOrderId: params.clientOrderId, symbol, type, side, amount,
      price: price ?? null, filled: 0, average: null, status: 'open', timestamp: Date.now() };
    if (type === 'market') {
      o.filled = amount; o.average = this.mark; o.status = 'closed';
      this.pozisyon = +(this.pozisyon + (side === 'buy' ? amount : -amount)).toFixed(8);
      this.bakiye -= amount * this.mark * 0.0005;
    }
    this.emirler.set(o.id, o);
    if (h && h.gitti) return this._uygula(h).cevap;     // emir borsaya ULAŞTI ama cevap kayboldu
    return { ...o };
  }

  async cancelOrder(id, symbol, params = {}) {
    const h = this._hata('cancelOrder');
    if (h && !h.gitti) return this._uygula(h).cevap;
    const o = this._bul(id, params);
    if (!o) throw new ccxt.OrderNotFound('Unknown order');
    o.status = 'canceled';
    if (h && h.gitti) return this._uygula(h).cevap;     // iptal GERÇEKLEŞTİ ama cevap kayboldu
    return { ...o };
  }

  /** Test yardımcısı: borsaya elle (yabancı) emir koy. */
  yabanciEmirKoy() {
    const o = { id: String(++this.sira), clientOrderId: 'web_elle_123', symbol: 'BTC/USDT:USDT', type: 'limit',
      side: 'buy', amount: 0.001, price: 90000, filled: 0, status: 'open', timestamp: Date.now() };
    this.emirler.set(o.id, o);
    return o;
  }
}

module.exports = { SahteBorsa, btcPazari };
