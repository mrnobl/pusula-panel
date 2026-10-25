'use strict';
/**
 * A4 — SAHTE AKTARIM BORSASI (öz test + panelin "prova" kipi). Ağ YOK, para YOK: bellekte bakiye tablosu.
 * Binance (apiRestrictions, sub-account universalTransfer + sorgu, asset/transfer + sorgu) ve OKX (account/config, asset/transfer +
 * transfer-state) yüzeyinin aktarım için gereken kısmı. Gerçek borsa gibi: alt hesap yalnız `altlar` listesindeyse kabul edilir (dış
 * adres yok), bakiye yetmezse InsufficientFunds, aynı clientTranId ikinci kez gelirse DuplicateOrderId (çift aktarım yok).
 * Hata enjeksiyonu: `hata[yontem] = { ad: 'RequestTimeout', gitti: true|false }` (gitti: aktarım borsada OLDU ama cevap gelmedi).
 *
 * Bakiye anahtarı: `${adres || 'ana'}:${cuzdan}` (cuzdan: spot | vadeli). Çağrı izi: `cagrilar` [{ yontem, params }].
 */

class SahteHata extends Error {
  constructor(ad, mesaj) { super(mesaj || ad); this.name = ad; }
}

const BIN_CUZDAN = { SPOT: 'spot', USDT_FUTURE: 'vadeli' };
const OKX_CUZDAN = { 6: 'spot', 18: 'vadeli' };

class SahteAktarimBorsa {
  /**
   * @param o.borsa 'binance' | 'okx'
   * @param o.izin { cekme, ic, evrensel, islem } (Binance alan adlarına çevrilir)
   * @param o.altlar alt hesap adresleri (e-posta / alt hesap adı)
   * @param o.bakiyeler { 'ana:spot': 1000, 'a@b.c:vadeli': 500 }
   */
  constructor(o = {}) {
    this.borsa = o.borsa || 'binance';
    this.izin = { cekme: false, ic: true, evrensel: true, islem: false, ...(o.izin || {}) };
    this.altlar = new Set(o.altlar || []);
    this.bakiye = { ...(o.bakiyeler || {}) };
    this.hata = {};
    this.cagrilar = [];
    this.aktarimlar = [];   // { tranId, clientTranId, kaynak, hedef, amount, z, tip }
    this.sayac = 1000;
    this.zaman = o.zaman || (() => Date.now());
  }
  _iz(yontem, params) { this.cagrilar.push({ yontem, params: JSON.parse(JSON.stringify(params || {})) }); }
  _enj(yontem) {
    const h = this.hata[yontem];
    if (!h) return null;
    if (!h.kalici) delete this.hata[yontem];
    return h;
  }
  _tasi(kaynak, hedef, amount, ck, tip) {
    const m = Math.round(Number(amount) * 100) / 100;
    if (!(m > 0)) throw new SahteHata('BadRequest', 'amount geçersiz');
    for (const a of [kaynak, hedef]) { const ad = a.split(':')[0]; if (ad !== 'ana' && !this.altlar.has(ad)) throw new SahteHata('BadRequest', `alt hesap değil: ${ad}`); }
    if (ck && this.aktarimlar.some(x => x.clientTranId === ck)) throw new SahteHata('DuplicateOrderId', 'clientTranId zaten kullanıldı');
    if ((this.bakiye[kaynak] || 0) + 1e-9 < m) throw new SahteHata('InsufficientFunds', 'bakiye yetersiz');
    this.bakiye[kaynak] = Math.round(((this.bakiye[kaynak] || 0) - m) * 100) / 100;
    this.bakiye[hedef] = Math.round(((this.bakiye[hedef] || 0) + m) * 100) / 100;
    const x = { tranId: ++this.sayac, clientTranId: ck || null, kaynak, hedef, amount: m, z: this.zaman(), tip };
    this.aktarimlar.push(x);
    return x;
  }
  _calistir(yontem, params, fn) {
    this._iz(yontem, params);
    const h = this._enj(yontem);
    if (h && !h.gitti) throw new SahteHata(h.ad || 'RequestTimeout', h.mesaj || `${yontem} zaman aşımı`);
    const r = fn();
    if (h && h.gitti) throw new SahteHata(h.ad || 'RequestTimeout', h.mesaj || `${yontem} zaman aşımı (borsada oldu)`);
    return r;
  }

  // ── Binance ──
  async sapiGetAccountApiRestrictions(p) {
    return this._calistir('sapiGetAccountApiRestrictions', p, () => ({ enableWithdrawals: !!this.izin.cekme, enableInternalTransfer: !!this.izin.ic,
      permitsUniversalTransfer: !!this.izin.evrensel, enableFutures: !!this.izin.islem, enableSpotAndMarginTrading: false, ipRestrict: true, enableReading: true }));
  }
  async sapiPostSubAccountUniversalTransfer(p = {}) {
    return this._calistir('sapiPostSubAccountUniversalTransfer', p, () => {
      if (p.asset !== 'USDT') throw new SahteHata('BadRequest', 'yalnız USDT');
      const k = `${p.fromEmail || 'ana'}:${BIN_CUZDAN[p.fromAccountType]}`, h = `${p.toEmail || 'ana'}:${BIN_CUZDAN[p.toAccountType]}`;
      if (!BIN_CUZDAN[p.fromAccountType] || !BIN_CUZDAN[p.toAccountType]) throw new SahteHata('BadRequest', 'hesap türü');
      if (!p.fromEmail && !p.toEmail) throw new SahteHata('BadRequest', 'fromEmail ve toEmail ikisi birden boş olamaz');
      const x = this._tasi(k, h, p.amount, p.clientTranId, 'evrensel');
      return { tranId: x.tranId, clientTranId: x.clientTranId };
    });
  }
  async sapiGetSubAccountUniversalTransfer(p = {}) {
    return this._calistir('sapiGetSubAccountUniversalTransfer', p, () => ({
      result: this.aktarimlar.filter(x => x.tip === 'evrensel' && (!p.clientTranId || x.clientTranId === p.clientTranId))
        .map(x => ({ tranId: x.tranId, clientTranId: x.clientTranId, asset: 'USDT', amount: x.amount.toFixed(2), status: 'SUCCESS', createTimeStamp: x.z })),
      totalCount: 0 }));
  }
  async sapiPostAssetTransfer(p = {}) {
    return this._calistir('sapiPostAssetTransfer', p, () => {
      const yon = { MAIN_UMFUTURE: ['ana:spot', 'ana:vadeli'], UMFUTURE_MAIN: ['ana:vadeli', 'ana:spot'] }[p.type];
      if (!yon) throw new SahteHata('BadRequest', 'type');
      const x = this._tasi(yon[0], yon[1], p.amount, null, p.type);
      return { tranId: x.tranId };
    });
  }
  async sapiGetAssetTransfer(p = {}) {
    return this._calistir('sapiGetAssetTransfer', p, () => ({ total: 0, rows: this.aktarimlar.filter(x => x.tip === p.type && (!p.startTime || x.z >= p.startTime))
      .map(x => ({ asset: 'USDT', amount: x.amount.toFixed(2), type: x.tip, status: 'CONFIRMED', tranId: x.tranId, timestamp: x.z })) }));
  }

  // ── OKX ──
  async privateGetAccountConfig(p) {
    return this._calistir('privateGetAccountConfig', p, () => ({ code: '0', data: [{ perm: ['read_only', this.izin.ic ? 'trade' : null, this.izin.cekme ? 'withdraw' : null].filter(Boolean).join(',') }] }));
  }
  async privatePostAssetTransfer(p = {}) {
    return this._calistir('privatePostAssetTransfer', p, () => {
      const k = `${p.type === '2' ? p.subAcct : 'ana'}:${OKX_CUZDAN[p.from]}`, h = `${p.type === '1' ? p.subAcct : 'ana'}:${OKX_CUZDAN[p.to]}`;
      const x = this._tasi(k, h, p.amt, p.clientId, `okx${p.type}`);
      return { code: '0', msg: '', data: [{ transId: String(x.tranId), clientId: x.clientTranId, ccy: 'USDT', amt: p.amt }] };
    });
  }
  async privateGetAssetTransferState(p = {}) {
    return this._calistir('privateGetAssetTransferState', p, () => {
      const x = this.aktarimlar.find(a => a.clientTranId === p.clientId);
      return { code: '0', data: x ? [{ transId: String(x.tranId), clientId: x.clientTranId, state: 'success', amt: x.amount.toFixed(2) }] : [] };
    });
  }
}

module.exports = { SahteAktarimBorsa, SahteHata };
