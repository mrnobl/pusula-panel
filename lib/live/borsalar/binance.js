'use strict';
/**
 * BİNANCE BAĞDAŞTIRICISI (A2 / 5. faz parça 1 — TASARIM-MAKINE-HESAP-BOT §7.2).
 *
 * Bugünkü çağrıların AYNISINI sarar; yeni davranış yok. Yürütücü yüzeyi (`kur`ın döndürdüğü nesne) ccxt `binanceusdm`in
 * kendisidir — dönüşüm yok, çünkü canlı kodun (yürütücü, felaket stopu, Kalkan, marj izleme, DCA) bugünkü "dili" zaten
 * Binance'in dilidir: baz miktar, `ag-<bot>-<gün>-<sayaç>` kimliği, `STOP_MARKET` + `closePosition`, `info.filters`.
 * Başka borsalar (okx.js) bu dili konuşan bir YÜZEY üretir; canlı kod borsa adını bilmez.
 *
 * Kanıt (birebir): scripts/borsa-cagri-izi-selftest.js — 5103cf1 (75.4) koduyla kaydedilmiş çağrı izi (yöntem + argüman +
 * günlük satırları) ile bugünkü kodun izi eşit olmalı. Bu dosyadaki işlevlerin metinleri eski yerlerinden (yurutucu.baglan,
 * korumaEmri._koy, kalkanBot.kaldiracHazirla, bindirmeBot.zorlaKapananlar) taşındı/yansıtıldı; değiştirmeyin, önce izi yenileyin.
 */
const istemci = require('../binanceIstemci');
const kimlik = require('../emirKimligi');

/** Kesin red kodları ve bulunamadı metni korumaEmri ile aynı (orada tanımlı; buradaki yalnız arayüz işlevleri içindir). */
let _hataSinifi = null;
function hataSinifi(e) {
  // Döngüsel require yok: yürütücü bu modülü yükler; hata sınıflaması yürütücüde (tek kaynak, hata-matrisi A katmanı).
  if (!_hataSinifi) _hataSinifi = require('../yurutucu').hataSinifi;
  return _hataSinifi(e);
}

/** 7.1: canlıya bağlanırken izin kapısı — metinler yurutucu.baglan'ın 75.4 metinleri (birebir). @returns ham izin nesnesi */
async function canliIzinDenetle(b, { cokluVarlik = false } = {}) {
  let iz;
  try { iz = await istemci.anahtarIzinleri(b); } catch (e) {
    throw new Error(`API anahtarı izinleri okunamadı (${e.message}) — canlıya bağlanılmadı`);
  }
  if (iz.enableWithdrawals) throw new Error('API anahtarında PARA ÇEKME izni açık — Binance API Management\'tan kapatın; bağlanılmadı');
  if (!iz.enableFutures) throw new Error('API anahtarında Futures izni kapalı');
  // 69.6 (kullanıcı kararı): canlıda BÜTÜN botlarda IP kısıtı zorunlu — çalınan anahtar başka yerden kullanılamasın.
  if (!iz.ipRestrict) throw new Error('API anahtarında IP kısıtı yok — Binance API Management\'ta "Restrict access to trusted IPs only" açın (yalnız sunucunun IP\'si); canlıya bağlanılmadı');
  // Çoklu varlık (BTC spot teminat — lib/live/cokluVarlik.js) için ek izinler ZORUNLU (PLAN-GERCEK-PARA-2027.md §4).
  if (cokluVarlik) {
    if (!iz.enableSpotAndMarginTrading) throw new Error('çoklu varlık: API anahtarında "Enable Spot & Margin Trading" kapalı (spot BTC alım/satımı gerekir); bağlanılmadı');
    if (!iz.permitsUniversalTransfer) throw new Error('çoklu varlık: API anahtarında "Permits Universal Transfer" kapalı (spot ↔ USDⓈ-M aktarımı gerekir); bağlanılmadı');
  }
  return iz;
}

/** Ortak biçim: { cekme, vadeli, spot, aktarim, ipKisit } | null (demo'da sapi yok). */
async function izinler(b) {
  const iz = await istemci.anahtarIzinleri(b);
  if (!iz) return null;
  return { cekme: iz.enableWithdrawals, vadeli: iz.enableFutures, spot: iz.enableSpotAndMarginTrading, aktarim: iz.permitsUniversalTransfer, ipKisit: iz.ipRestrict };
}

/** yurutucu.baglan'ın 75.4 satırı: hata → one-way (okunamazsa varsayılan). */
async function pozisyonModu(b) {
  const mod = await b.fetchPositionMode(undefined).catch(() => null);
  return mod && mod.hedged ? 'hedge' : 'oneway';
}

/** Binance'te ccxt miktarı = baz miktar (contractSize 1). */
const miktar = Object.freeze({
  bazdan: (market, q) => q,
  baza: (market, kontrat) => kontrat,
});

/** Ön kontrolün okuduğu kurallar, ortak biçimde (onKontrol bugün market'i doğrudan okur — bu yalnız arayüz/rapor içindir). */
function filtreler(market) {
  if (!market) return null;
  const lim = market.limits || {};
  const pp = ((market.info && market.info.filters) || []).find(f => f.filterType === 'PERCENT_PRICE');
  return {
    adim: (market.precision && market.precision.amount) || null,
    tick: (market.precision && market.precision.price) || null,
    minMiktar: (lim.amount && lim.amount.min) || null,
    minNominal: (lim.cost && lim.cost.min) || null,
    piyasaMax: (lim.market && lim.market.max) || (lim.amount && lim.amount.max) || null,
    fiyatBandi: pp ? { yukari: +pp.multiplierUp, asagi: +pp.multiplierDown } : null,
  };
}

/** kalkanBot.kaldiracHazirla'nın istek çifti (kip, sonra kaldıraç) — tek sembol. */
async function kaldiracHazirla(b, symbol, { kaldirac = 20, marj = 'cross' } = {}) {
  if (typeof b.setMarginMode === 'function') {
    try { await b.setMarginMode(marj, symbol); } catch (e) { if (!/-4046|-4059|No need to change/i.test(String(e && e.message))) throw e; }   // kalkanBot DEGISIKLIK_YOK
  }
  const r = await b.setLeverage(kaldirac, symbol);
  return { kaldirac: r ? +(r.leverage ?? (r.info && r.info.leverage)) || null : null };
}

/** korumaEmri._koy'un 75.4 çağrısı (birebir parametreler). `tam` → closePosition; değilse reduceOnly miktarlı. */
const korumaEmri = Object.freeze({
  async koy(b, symbol, side, tetik, { tam = true, miktar: q = null, id, hedge = false } = {}) {
    const params = { clientOrderId: id, triggerPrice: tetik, workingType: 'MARK_PRICE', priceProtect: true };
    if (hedge) params.positionSide = side === 'sell' ? 'LONG' : 'SHORT';
    if (tam) params.closePosition = true;
    else if (!hedge) params.reduceOnly = true;
    return b.createOrder(symbol, 'STOP_MARKET', side, tam ? undefined : q, undefined, params);
  },
  oku(b, symbol) { return b.fetchOpenOrders(symbol, undefined, undefined, { trigger: true }); },
  iptal(b, symbol, borsaId) { return b.cancelOrder(borsaId, symbol, { trigger: true }); },
});

/** Funding geliri (salt okuma): GET /fapi/v1/income incomeType=FUNDING_FEE. → [{ zaman, tutar, symbol, para }] */
async function gelir(b, { tur = 'funding', bas, bit } = {}) {
  if (tur !== 'funding') throw new Error(`gelir türü desteklenmiyor: ${tur}`);
  if (!b || typeof b.fapiPrivateGetIncome !== 'function') return null;
  const p = { incomeType: 'FUNDING_FEE', limit: 1000 };
  if (bas != null) p.startTime = Math.floor(bas);
  if (bit != null) p.endTime = Math.floor(bit);
  const l = await b.fapiPrivateGetIncome(p);
  return (Array.isArray(l) ? l : []).map(x => ({ zaman: +x.time || null, tutar: +x.income || 0, symbol: x.symbol || null, para: x.asset || 'USDT', kimlik: x.tranId != null ? String(x.tranId) : null }));
}

/** bindirmeBot.zorlaKapananlar'ın 75.4 eşlemesi: GET /fapi/v1/forceOrders. null → desteklenmiyor. */
async function zorlaKapanislar(b, basMs) {
  if (!b || b.kagit || typeof b.fapiPrivateGetForceOrders !== 'function') return null;
  const l = await b.fapiPrivateGetForceOrders({ startTime: Math.floor(basMs), limit: 100 });
  return (Array.isArray(l) ? l : []).map(x => ({ id: String(x.orderId || x.clientOrderId || `${x.symbol}:${x.updateTime || x.time}`), symbol: x.symbol,
    tur: x.autoCloseType || (/^adl/i.test(String(x.clientOrderId || '')) ? 'ADL' : 'LIQUIDATION'), side: x.side, miktar: +x.executedQty || +x.origQty || 0,
    fiyat: +x.avgPrice || +x.price || 0, zaman: +x.updateTime || +x.time || null }));
}

module.exports = Object.freeze({
  kimlik: 'binance',
  ad: 'Binance',
  hazir: true,
  // 7.4 kapısı: hazir:true bağdaştırıcının tam hata matrisi bu dosyadadır ve npm test zincirindedir (borsa-arayuz-selftest denetler).
  matris: 'scripts/hata-matrisi-selftest.js',
  ortamlar: istemci.ORTAMLAR,
  kur: (o) => istemci.kur(o),            // { ortam, apiKey, apiSecret, ccxtSinifi } — parola yok sayılır
  veriAyir: istemci.veriAyir,
  canliIzinDenetle,
  izinler,
  pozisyonModu,
  emirKimligi: Object.freeze({ uret: kimlik.uret, bizimMi: kimlik.bizimMi, desen: kimlik.DESEN, borsaya: (id) => id, bizden: (id) => id }),
  miktar,
  filtreler,
  kaldiracHazirla,
  korumaEmri,
  gelir,
  zorlaKapanislar,
  hataSinifi,
});
