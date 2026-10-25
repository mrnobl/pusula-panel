'use strict';
/**
 * BYBIT BAĞDAŞTIRICISI (A2 / 5. faz — TASARIM-MAKINE-HESAP-BOT §7.7 "Bybit: aynı kalıp"). ccxt `bybit` (kurulu ccxt@4.5.89; yeni paket yok).
 *
 * `hazir: false` — bot kaydı Bybit hesabına BAĞLANAMAZ (botYonetimi `borsalar.baglanmaEngeli`). Bu parçada yalnız kod + sahte Bybit v5
 * testleri (scripts/hata-matrisi-bybit-selftest.js, scripts/bybit-demo-bot-selftest.js); Bybit'e GERÇEK İSTEK ATILMADI. Canlı hesap
 * yolu KAPALI: `kur` yalnız demo (`testnet` = Bybit Demo Trading, api-demo.bybit.com) kurar. Demo hesapta salt okuma ölçümü ve
 * hazir:true, kullanıcı Bybit demo anahtarını girdikten sonra ayrı adım.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * YÜZEY: canlı kod Bybit'i bilmez — bağdaştırıcı "Binance dilini" konuşan bir yüzey üretir (OKX ile aynı kalıp)
 * ═══════════════════════════════════════════════════════════════════════════
 * Yürütücü, felaket stopu, Kalkan, marj izleme ve DCA Binance'in dilini konuşur (baz miktar, `ag-<bot>-<gün>-<sayaç>`,
 * `STOP_MARKET` + `closePosition`, `info.totalMaintMargin`, `setMarginMode`). `kur` ccxt.bybit nesnesini bir Proxy ile sarar; emir,
 * pozisyon, bakiye ve hesap okumaları doğrudan v5 uçlarına gider (ccxt'nin yüksek düzey yöntemleri UTA'da araya `isUnifiedEnabled`
 * okuması ve "acknowledged" uyarıları koyuyor — yüzey bunları atlar, cevabı ccxt'nin kendi `parseOrder` / `parsePosition` /
 * `parseBalance`ı ile çözer; hata eşlemesi ccxt'nin `handleErrors`ı):
 *   · MİKTAR: Bybit USDT lineer sözleşmede ccxt `amount` = BAZ miktar (contractSize 1). Çeviri yine sınırda yapılır (baz → adıma
 *     AŞAĞI) — sözleşme boyu bir gün 1'den farklı gelirse aynı kod çevirir (`kontratBoyu`). Piyasa emri sınırı `maxMktOrderQty`
 *     → `limits.market.max` (yürütücü dilimler). Ön piyasa (PreLaunch) sözleşmeleri yüzey pazarlarında YOK ("Bybit'te yok").
 *   · KİMLİK: orderLinkId harf/rakam/-/_, ≤ 36 → Binance biçimi `ag-dc-20261025-000042` OLDUĞU GİBİ geçer (çeviri yok, tersinir).
 *     Kurala uymayan kimlik İSTEK ATILMADAN InvalidOrder (kesin gönderilmedi).
 *   · KORUMA EMRİ: `STOP_MARKET` + `closePosition` → koşullu piyasa emri: `triggerPrice`, `triggerDirection` (satış 2 = düşerken,
 *     alış 1 = yükselirken), `triggerBy MarkPrice`, `reduceOnly` + `closeOnTrigger`, tam pozisyonda `qty "0"` (Bybit: tüm pozisyonu
 *     kapatır), miktarlıysa `qty`. `trigger: true` sorgu/liste → `orderFilter StopOrder`.
 *   · CEVAP: Bybit emir/iptal cevabı yalnız onaydır ({orderId, orderLinkId}). Yüzey aynı orderLinkId ile BİR KEZ sorgular (önce
 *     realtime, yoksa history) ve tam emri döndürür; sorgu başarısızsa onay döner → yürütücü "belirsiz" sayar, kendi sorgusuyla çözer.
 *   · ZARF (kapalı-başarısız): her 2xx cevap `{ retCode, result: {...} }` taşımalı; liste uçlarında `result.list` dizi olmalı —
 *     değilse BadResponse (BELIRSIZ). ccxt bybit boş/bozuk gövdede boş yapı döndürürdü (pozisyon [] → mutabakat "pozisyon yok").
 *   · HATA: ccxt bybit eşlemesi korunur; yalnız eşlemenin YANLIŞ sınıfladığı kodlar düzeltilir (10429 "frequency protection"
 *     ExchangeError → RateLimitExceeded; 110072 yinelenen orderLinkId / 10014 yinelenen istek RED → BELIRSIZ: emir borsada var). Gövdesiz HTTP 403 (Bybit IP hız sınırı) ccxt'de zaten RateLimitExceeded. Ölçüm tablosu
 *     scripts/hata-matrisi-bybit-selftest.js A katmanında sabitlendi.
 *   · HESAP KİPİ: Birleşik İşlem Hesabı (UTA, unifiedMarginStatus ≥ 3) + çapraz marj (REGULAR_MARGIN; izole/portföy marjı değil) +
 *     tek yön (One-Way, positionIdx 0) ZORUNLU; anahtarda para çekme izni varsa, salt okumaysa ya da vadeli işlem izni yoksa
 *     bağlanmaz. Kip kendiliğinden DEĞİŞTİRİLMEZ. Her emir `positionIdx 0` gönderir → hedge kipindeki sembolde borsa reddeder (RED).
 *   · Desteklenmeyen (bu parçada): hedge kipi, spot, aktarım, 1000'den fazla açık emir (20 sayfa × 50).
 */
const ccxt = require('ccxt');
const { adimaYuvarla, ondalik } = require('../onKontrol');
const kimlikMod = require('../emirKimligi');

const ORTAMLAR = new Set(['testnet']);
const KATEGORI = 'linear';

// ── Emir kimliği ────────────────────────────────────────────────────────────
const BYBIT_KURAL = /^[A-Za-z0-9_-]{1,36}$/;

const emirKimligi = Object.freeze({
  desen: BYBIT_KURAL,
  /** Binance biçimi (emirKimligi.uret) — Bybit kuralına da uyar; uymazsa (olmamalı) hata. */
  uret(bot, sayac, zaman) {
    const id = kimlikMod.uret(bot, sayac, zaman);
    if (!BYBIT_KURAL.test(id)) throw new Error(`orderLinkId Bybit kuralına uymuyor: ${id}`);
    return id;
  },
  bizimMi: kimlikMod.bizimMi,
  /** İç (defter) kimliği → Bybit orderLinkId (aynısı). Kurala uymayan kimlik → null (çağıran isteği atmaz). */
  borsaya(ic) { return typeof ic === 'string' && BYBIT_KURAL.test(ic) ? ic : null; },
  /** Bybit orderLinkId → iç kimlik (aynısı; boşsa undefined). */
  bizden(id) { return typeof id === 'string' && id ? id : undefined; },
});

// ── Miktar (baz ↔ sözleşme) ─────────────────────────────────────────────────
const temiz = (x) => (Number.isFinite(x) ? +x.toFixed(12) : x);
const kontratBoyu = (m) => (m && m.contract && +m.contractSize > 0 ? +m.contractSize : 1);

const miktar = Object.freeze({
  /** Baz miktar → ccxt miktarı (qtyStep'e AŞAĞI; yukarı yuvarlamak tavan/bakiye aşımı demek). `market` ccxt.bybit'in ASIL pazarı. */
  bazdan(market, q) {
    if (q == null || !Number.isFinite(+q)) return q;
    const ct = kontratBoyu(market);
    const lot = market && market.precision && +market.precision.amount;
    const k = +q / ct;
    return lot > 0 ? adimaYuvarla(k, lot, 'asagi') : temiz(k);
  },
  /** ccxt miktarı → baz miktar. */
  baza(market, kontrat) {
    if (kontrat == null || kontrat === '' || !Number.isFinite(+kontrat)) return kontrat;
    return temiz(+kontrat * kontratBoyu(market));
  },
});

/** Yüzey pazarı: baz birimde adım/sınırlar + piyasa emri sınırı (maxMktOrderQty). Asıl pazar değişmez. */
function yuzeyPazari(m) {
  if (!m || !m.contract) return m;
  const ct = kontratBoyu(m);
  const x = (v) => (v == null || v === '' || !Number.isFinite(+v) ? (v === '' ? undefined : v) : temiz(+v * ct));
  const lot = m.precision && m.precision.amount;
  const lim = m.limits || {};
  const ls = (m.info && m.info.lotSizeFilter) || {};
  const adim = lot > 0 ? +(lot * ct).toFixed(Math.min(16, ondalik(lot) + ondalik(ct))) : lot;
  return {
    ...m,
    contractSize: 1,
    kontratBoyu: ct,
    precision: { ...m.precision, amount: adim },
    limits: {
      ...lim,
      amount: { ...(lim.amount || {}), min: x(lim.amount && lim.amount.min), max: x(lim.amount && lim.amount.max) },
      market: { min: x(lim.amount && lim.amount.min), max: x(ls.maxMktOrderQty) },
    },
  };
}

/** Yüzeyde görünen pazar mı: USDT lineer sürekli sözleşme, ön piyasa (PreLaunch) değil. */
const yuzeydeMi = (m) => !!m && m.swap === true && m.linear === true && !(m.info && String(m.info.status) === 'PreLaunch');

function filtreler(market) {
  if (!market) return null;
  const lim = market.limits || {};
  return {
    adim: (market.precision && market.precision.amount) || null,
    tick: (market.precision && market.precision.price) || null,
    minMiktar: (lim.amount && lim.amount.min) || null,
    minNominal: (lim.cost && lim.cost.min) || null,
    piyasaMax: (lim.market && lim.market.max) || (lim.amount && lim.amount.max) || null,
    // Bybit fiyat sınırı dinamik (son fiyat ± oran, sembole göre) → ön kontrol bandı atlar, borsa reddeder (110003/110094 → RED).
    fiyatBandi: null,
    kontratBoyu: market.kontratBoyu || kontratBoyu(market),
  };
}

// ── Hata ────────────────────────────────────────────────────────────────────
/** ccxt bybit eşlemesinin bizim sınıflamamıza göre YANLIŞ olduğu kodlar (ölçüldü, ccxt 4.5.89). */
const DUZELT = Object.freeze({
  10429: ccxt.RateLimitExceeded,     // "System has frequency protection" → ccxt ExchangeError (BELIRSIZ olurdu; doğrusu HIZ)
  // Yinelenen kimlik / yinelenen istek: o orderLinkId'de emir borsada VAR (ya da ilk istek işleniyor) — ccxt InvalidOrder / BadRequest
  // (RED) yazardı; RED yazılan emir borsada olmamalı (değişmez 1). BELIRSIZ → yürütücü aynı kimlikle sorgular, borsadakini bulur.
  110072: ccxt.ExchangeError,        // "OrderLinkedID is duplicate" → ccxt InvalidOrder
  10014: ccxt.ExchangeError,         // "Request is duplicate" → ccxt BadRequest
});
const KOD_RE = /"ret_?[cC]ode"\s*:\s*"?(-?\d+)"?/g;

function bybitKodlari(msj) {
  const l = [];
  for (const m of String(msj || '').matchAll(KOD_RE)) if (m[1] && m[1] !== '0') l.push(m[1]);
  return l;
}

/** Sınırda hata düzeltmesi: yalnız DUZELT tablosu; diğer her hata aynen (ccxt sınıfı korunur). */
function hataNormal(e) {
  if (!e || typeof e !== 'object' || !(e instanceof ccxt.BaseError)) return e;
  for (const k of bybitKodlari(e.message)) {
    const S = DUZELT[k];
    if (S && Object.getPrototypeOf(e) !== S.prototype) { const y = new S(e.message); if (e.yanitBasliklari) y.yanitBasliklari = e.yanitBasliklari; y.bybitKod = k; return y; }
  }
  return e;
}

let _genelSinif = null;
function hataSinifi(e) {
  if (!_genelSinif) _genelSinif = require('../yurutucu').hataSinifi;
  return _genelSinif(hataNormal(e));
}

/** Liste dönmesi gereken v5 uçları: `result.list` dizi değilse cevap eksik sayılır. */
const LISTE_UC = /\/v5\/(position\/list|order\/realtime|order\/history|account\/wallet-balance|account\/transaction-log|market\/instruments-info|market\/tickers)\b/;

/**
 * KAPALI-BAŞARISIZ GÖVDE: ccxt bybit 200 + boş/bozuk gövdede hata atmaz (yanıt string/undefined döner, `result` yoksa boş yapı).
 * Her 2xx cevap Bybit zarfı `{ retCode, result: {...} }` taşımalı, liste uçlarında `result.list` dizi — değilse BadResponse.
 * Bozuk olmayan hata gövdesi (retCode ≠ 0) ccxt'nin kendi eşlemesine gider.
 */
function zarfDenetimi(h) {
  const asil = h.handleErrors;
  h.handleErrors = function (kod, sebep, url, yontem, basliklar, govde, cevap, ...ek) {
    const k2 = +kod >= 200 && +kod < 300;
    const kisa = String(govde == null ? '' : govde).slice(0, 80);
    if (k2) {
      if (!cevap || typeof cevap !== 'object' || Array.isArray(cevap)) throw new ccxt.BadResponse(`bybit ${yontem} ${url} ${kod} boş/bozuk gövde: ${kisa}`);
      if (cevap.retCode === undefined && cevap.ret_code === undefined) throw new ccxt.BadResponse(`bybit ${yontem} ${url} ${kod} gövdede retCode yok: ${kisa}`);
    }
    const r = asil.call(this, kod, sebep, url, yontem, basliklar, govde, cevap, ...ek);
    if (k2) {
      const s = cevap.result;
      if (!s || typeof s !== 'object' || Array.isArray(s)) throw new ccxt.BadResponse(`bybit ${yontem} ${url} ${kod} gövdede result yok: ${kisa}`);
      if (LISTE_UC.test(String(url)) && !Array.isArray(s.list)) throw new ccxt.BadResponse(`bybit ${yontem} ${url} ${kod} gövdede list dizisi yok: ${kisa}`);
    }
    return r;
  };
}

// ── Yüzey ───────────────────────────────────────────────────────────────────
const ISTEK_ADI = /^(fetch|create|cancel|edit|set|load|private|public)/;
// Koşullu emir durumu → Binance algoStatus dili (KorumaEmri._stopSorgu / _emirDurumu bunu okur).
const SARTLI_DURUM = { Untriggered: 'NEW', New: 'NEW', Triggered: 'TRIGGERED', PartiallyFilled: 'TRIGGERED', Filled: 'TRIGGERED',
  Cancelled: 'CANCELED', Deactivated: 'CANCELED', Rejected: 'EXPIRED' };
const SARTLI_CCXT = { NEW: 'open', TRIGGERED: 'closed', CANCELED: 'canceled', EXPIRED: 'rejected' };
const SAYFA_EMIR = 50, SAYFA_EN_COK = 20;

function yuzey(h) {
  let pazarKaynak = null, pazarlar = null;
  let bilgi = null, bilgiZaman = 0;
  const ham = (symbol) => (h.markets && h.markets[symbol]) || null;
  const idden = (id) => { try { return h.safeMarket(id, undefined, undefined, 'swap'); } catch { return undefined; } };

  const kapsa = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { throw hataNormal(e); } };

  function pazar(symbol) {
    const m = ham(symbol);
    if (!m) throw new ccxt.BadSymbol(`bybit: ${symbol} pazarı yok — istek atılmadı`);
    return m;
  }

  /** Bybit emri (ham) → Binance dilinde emir (baz miktar, iç kimlik, koşullu emir alanları). */
  function cevir(x) {
    if (!x || typeof x !== 'object') return x;
    const m = idden(x.symbol);
    const o = h.parseOrder({ tpslMode: '', ...x }, m && m.symbol ? m : undefined);
    const sartli = String(x.stopOrderType || '') !== '' || (+x.triggerPrice > 0 && x.orderType === 'Market' && (x.reduceOnly === true || x.reduceOnly === 'true'));
    const pm = m && m.symbol ? ham(m.symbol) : null;
    const out = { ...o, amount: miktar.baza(pm, o.amount), filled: miktar.baza(pm, o.filled), remaining: miktar.baza(pm, o.remaining),
      clientOrderId: emirKimligi.bizden(o.clientOrderId) };
    if (sartli) {
      const d = SARTLI_DURUM[x.orderStatus] || (x.orderStatus ? String(x.orderStatus).toUpperCase() : undefined);
      out.triggerPrice = o.triggerPrice ?? (+x.triggerPrice || null);
      out.closePosition = (x.closeOnTrigger === true || x.closeOnTrigger === 'true') && !(+x.qty > 0);
      if (d && SARTLI_CCXT[d]) out.status = SARTLI_CCXT[d];
      out.info = { ...(o.info || x), algoStatus: d };
    }
    return out;
  }

  function bybitId(ic) {
    const id = emirKimligi.borsaya(ic);
    if (!id) throw new ccxt.InvalidOrder(`bybit: emir kimliği Bybit biçimine uymuyor (${ic}) — istek atılmadı`);
    return id;
  }

  /** account/info + user/query-api (60 sn önbellek). */
  async function hesapBilgisi(taze = false) {
    if (!taze && bilgi && Date.now() - bilgiZaman < 60e3) return bilgi;
    const ri = await h.privateGetV5AccountInfo();
    const ra = await h.privateGetV5UserQueryApi();
    const hesap = ri && ri.result, api = ra && ra.result;
    if (!hesap || typeof hesap !== 'object' || hesap.unifiedMarginStatus == null) throw new ccxt.BadResponse(`bybit account/info geçersiz cevap: ${JSON.stringify(ri).slice(0, 120)}`);
    if (!api || typeof api !== 'object' || !api.permissions || typeof api.permissions !== 'object') throw new ccxt.BadResponse(`bybit user/query-api geçersiz cevap: ${JSON.stringify(ra).slice(0, 120)}`);
    bilgi = { hesap, api }; bilgiZaman = Date.now();
    return bilgi;
  }

  /** Tek emir: önce realtime (açık + son emirler), yoksa history. Yoksa OrderNotFound. */
  async function emirBul(symbol, anahtar, sartli) {
    const m = pazar(symbol);
    const q = { category: KATEGORI, symbol: m.id, ...anahtar, orderFilter: sartli ? 'StopOrder' : 'Order' };
    let l = (await h.privateGetV5OrderRealtime(q)).result.list;
    if (!l.length) l = (await h.privateGetV5OrderHistory(q)).result.list;
    if (!l.length) throw new ccxt.OrderNotFound(`bybit: emir yok (${anahtar.orderLinkId || anahtar.orderId}) — Order does not exist`);
    return cevir(l[0]);
  }

  async function emirSorgu(symbol, orderLinkId, sartli) {
    try { const o = await emirBul(symbol, { orderLinkId }, sartli); return o && o.id != null ? o : null; } catch { return null; }
  }

  const ack = (r) => (r && r.result && typeof r.result === 'object' ? r.result : {});

  async function stopKoy(symbol, side, amount, params) {
    const p = { ...params };
    if (p.positionSide || p.hedged) throw new ccxt.NotSupported('bybit: hedge (long/short) kipi desteklenmiyor — hesap tek yön (One-Way) olmalı; istek atılmadı');
    if (!(+p.triggerPrice > 0)) throw new ccxt.InvalidOrder('bybit: koruma emrinde tetik fiyatı yok — istek atılmadı');
    if (side !== 'buy' && side !== 'sell') throw new ccxt.InvalidOrder(`bybit: koruma emrinde yön ${side} — istek atılmadı`);
    const m = pazar(symbol);
    const q = { category: KATEGORI, symbol: m.id, side: side === 'buy' ? 'Buy' : 'Sell', orderType: 'Market', positionIdx: 0,
      triggerPrice: h.priceToPrecision(symbol, p.triggerPrice), triggerDirection: side === 'sell' ? 2 : 1,
      triggerBy: p.workingType === 'MARK_PRICE' ? 'MarkPrice' : 'LastPrice', reduceOnly: true, closeOnTrigger: true };
    if (p.clientOrderId) q.orderLinkId = bybitId(p.clientOrderId);
    if (p.closePosition) q.qty = '0';
    else {
      const k = miktar.bazdan(m, amount);
      if (!(k > 0)) throw new ccxt.InvalidOrder(`bybit: koruma miktarı ${amount} çevrilemedi — istek atılmadı`);
      q.qty = h.amountToPrecision(symbol, k);
    }
    const a = ack(await h.privatePostV5OrderCreate(q));
    // Onay (orderId) yeter: felaket stopu yalnız kimliğe bakar; durum sonraki listede/sorguda okunur (uydurulmaz).
    return cevir({ ...a, symbol: m.id, side: q.side, orderType: 'Market', qty: q.qty, triggerPrice: q.triggerPrice, triggerDirection: q.triggerDirection,
      stopOrderType: 'Stop', reduceOnly: true, closeOnTrigger: true, orderLinkId: a.orderLinkId || q.orderLinkId || '' });
  }

  /** Sayfalı liste (cursor): en çok `enCok` sayfa; dolarsa BadResponse (eksik liste ile mutabakat yapılmaz). */
  async function sayfali(fn, q, enCok, ad) {
    const hepsi = [];
    const s = { ...q };
    for (let sayfa = 0; ; sayfa++) {
      const r = (await fn(s)).result;
      hepsi.push(...r.list);
      const c = r.nextPageCursor;
      if (!c || !r.list.length) break;
      if (sayfa >= enCok - 1) throw new ccxt.BadResponse(`bybit: ${ad} listesi ${enCok} sayfayı aştı — eksik liste ile mutabakat yapılmaz`);
      s.cursor = c;
    }
    return hepsi;
  }

  const ozel = {
    loadMarkets: kapsa(async (...a) => { await h.loadMarkets(...a); return yz.markets; }),

    createOrder: kapsa(async (symbol, type, side, amount, price, params = {}) => {
      if (type === 'STOP_MARKET') return stopKoy(symbol, side, amount, params);
      const p = { ...params };
      if (p.positionSide || p.hedged) throw new ccxt.NotSupported('bybit: hedge (long/short) kipi desteklenmiyor — hesap tek yön (One-Way) olmalı; istek atılmadı');
      if (type !== 'market' && type !== 'limit') throw new ccxt.NotSupported(`bybit: emir türü ${type} bu yüzeyde yok — istek atılmadı`);
      if (side !== 'buy' && side !== 'sell') throw new ccxt.InvalidOrder(`bybit: yön ${side} — istek atılmadı`);
      const m = pazar(symbol);
      const k = miktar.bazdan(m, amount);
      if (!(k > 0)) throw new ccxt.InvalidOrder(`bybit: miktar ${amount} çevrilemedi (adım ${m.precision && m.precision.amount}) — istek atılmadı`);
      const q = { category: KATEGORI, symbol: m.id, side: side === 'buy' ? 'Buy' : 'Sell', orderType: type === 'market' ? 'Market' : 'Limit',
        qty: h.amountToPrecision(symbol, k), positionIdx: 0 };
      if (type === 'limit') {
        if (!(+price > 0)) throw new ccxt.InvalidOrder('bybit: limit emirde fiyat yok — istek atılmadı');
        q.price = h.priceToPrecision(symbol, price); q.timeInForce = 'GTC';
      }
      if (p.clientOrderId) q.orderLinkId = bybitId(p.clientOrderId);
      if (p.reduceOnly) q.reduceOnly = true;
      const a = ack(await h.privatePostV5OrderCreate(q));
      // Bybit cevabı yalnız onay: tam emir aynı orderLinkId ile bir kez sorgulanır; olmazsa onay döner (yürütücü belirsiz sayar, kendisi sorgular).
      if (q.orderLinkId && a.orderId != null && a.orderId !== '') { const o = await emirSorgu(symbol, q.orderLinkId, false); if (o) return o; }
      return cevir({ ...a, symbol: m.id });
    }),

    fetchOrder: kapsa(async (id, symbol, params = {}) => {
      const p = { ...params };
      const sartli = p.trigger === true || p.stop === true;
      const anahtar = p.clientOrderId ? { orderLinkId: bybitId(p.clientOrderId) } : { orderId: id };
      if (!anahtar.orderLinkId && (anahtar.orderId == null || anahtar.orderId === '')) throw new ccxt.ArgumentsRequired('bybit: emir sorgusunda kimlik yok — istek atılmadı');
      return emirBul(symbol, anahtar, sartli);
    }),

    fetchOpenOrders: kapsa(async (symbol, since, limit, params = {}) => {
      const p = { ...params };
      const sartli = p.trigger === true || p.stop === true;
      const q = { category: KATEGORI, ...(symbol ? { symbol: pazar(symbol).id } : { settleCoin: 'USDT' }), orderFilter: sartli ? 'StopOrder' : 'Order', limit: SAYFA_EMIR };
      const l = await sayfali((x) => h.privateGetV5OrderRealtime(x), q, SAYFA_EN_COK, 'açık emir');
      return l.map(cevir);
    }),

    fetchClosedOrders: kapsa(async (symbol, since, limit, params = {}) => {
      const q = { category: KATEGORI, symbol: pazar(symbol).id, limit: SAYFA_EMIR, ...(Number.isFinite(+since) && +since > 0 ? { startTime: Math.floor(+since) } : {}) };
      const hepsi = [];
      for (let sayfa = 0; sayfa < 10; sayfa++) {
        const r = (await h.privateGetV5OrderHistory(q)).result;
        hepsi.push(...r.list);
        if (!r.nextPageCursor || !r.list.length) break;
        q.cursor = r.nextPageCursor;
      }
      return hepsi.map(cevir).filter(o => o.status !== 'open');
    }),

    cancelOrder: kapsa(async (id, symbol, params = {}) => {
      const p = { ...params };
      const sartli = p.trigger === true || p.stop === true;
      const m = pazar(symbol);
      const q = { category: KATEGORI, symbol: m.id };
      if (p.clientOrderId) q.orderLinkId = bybitId(p.clientOrderId);
      else if (id != null && id !== '') q.orderId = String(id);
      else throw new ccxt.ArgumentsRequired('bybit: iptalde kimlik yok — istek atılmadı');
      const a = ack(await h.privatePostV5OrderCancel(q));
      let o = null;
      try { o = await emirBul(symbol, q.orderLinkId ? { orderLinkId: q.orderLinkId } : { orderId: q.orderId }, sartli); } catch { o = null; }
      return o || cevir({ ...a, symbol: m.id });
    }),

    fetchPositions: kapsa(async (symbols, params = {}) => {
      const liste = Array.isArray(symbols) ? symbols : symbols ? [symbols] : null;
      const q = { category: KATEGORI, limit: 200, ...(liste && liste.length === 1 ? { symbol: pazar(liste[0]).id } : { settleCoin: 'USDT' }), ...params };
      const l = await sayfali((x) => h.privateGetV5PositionList(x), q, 5, 'pozisyon');
      const out = l.map(x => {
        const mm = idden(x.symbol);
        const pz = h.parsePosition(x, mm && mm.symbol ? mm : undefined);
        const m = pz.symbol ? ham(pz.symbol) : null;
        return { ...pz, contracts: miktar.baza(m, pz.contracts), contractSize: 1, kontratBoyu: kontratBoyu(m) };
      });
      return liste && liste.length > 1 ? out.filter(x => liste.includes(x.symbol)) : out;
    }),

    fetchBalance: kapsa(async () => {
      const r = await h.privateGetV5AccountWalletBalance({ accountType: 'UNIFIED' });
      const u = r.result.list.find(x => x && x.accountType === 'UNIFIED');
      if (!u) throw new ccxt.BadResponse(`bybit fetchBalance: UNIFIED hesap satırı yok — ${JSON.stringify(r.result).slice(0, 80)}`);
      const b = h.parseBalance(r);
      // marjIzleme: hesap marj oranı = bakım marjı / marj bakiyesi (Binance info.totalMaintMargin / totalMarginBalance).
      // Bybit UTA: totalMaintenanceMargin / totalMarginBalance (USD cinsinden, hesap düzeyi). Demo'da ilk bağlantıda doğrulanacak.
      const mm = u.totalMaintenanceMargin, mb = u.totalMarginBalance;
      if (mm !== '' && mm != null && Number.isFinite(+mm) && mb !== '' && mb != null && Number.isFinite(+mb)) {
        return { ...b, info: { ...r, totalMaintMargin: String(mm), totalMarginBalance: String(mb) } };
      }
      return b;
    }),

    fetchMarkPrice: kapsa(async (symbol) => {
      const m = pazar(symbol);
      const r = await h.publicGetV5MarketTickers({ category: KATEGORI, symbol: m.id });
      const x = r.result.list.find(t => t && t.symbol === m.id);
      if (!x || !(+x.markPrice > 0)) throw new ccxt.BadResponse(`bybit: ${symbol} mark fiyatı yok`);
      return { symbol, markPrice: +x.markPrice, indexPrice: +x.indexPrice || undefined, timestamp: +r.time || undefined, info: x };
    }),

    fetchPositionMode: kapsa(async () => {
      const s = ham('BTC/USDT:USDT') ? 'BTC/USDT:USDT' : Object.keys(yz.markets || {})[0];
      if (!s) throw new ccxt.BadResponse('bybit: pozisyon kipi okunamadı (pazar yok)');
      const l = (await h.privateGetV5PositionList({ category: KATEGORI, symbol: pazar(s).id })).result.list;
      if (!l.length) throw new ccxt.BadResponse(`bybit: pozisyon kipi okunamadı (${s} satırı yok)`);
      return { info: l, hedged: l.some(x => String(x.positionIdx) !== '0') };
    }),

    setLeverage: kapsa(async (leverage, symbol) => {
      const m = pazar(symbol);
      const k = String(leverage);
      try {
        const r = await h.privatePostV5PositionSetLeverage({ category: KATEGORI, symbol: m.id, buyLeverage: k, sellLeverage: k });
        return { info: r, leverage: +leverage, marginMode: 'cross' };
      } catch (e) {
        // 110043 "Set leverage not modified": kaldıraç zaten istenen değerde — başarı (Binance'te aynı istek sessizce geçer).
        if (e instanceof ccxt.BaseError && bybitKodlari(e.message).includes('110043')) return { info: { not: 'bybit: kaldıraç zaten aynı (110043)' }, leverage: +leverage, marginMode: 'cross' };
        throw e;
      }
    }),

    /** Bybit UTA'da marj kipi HESAP düzeyindedir (REGULAR_MARGIN = çapraz; bağlanırken denetlendi) → istek yok. Yalnız 'cross' kabul. */
    setMarginMode: kapsa(async (mode) => {
      if (mode !== 'cross') throw new ccxt.NotSupported(`bybit: yalnız çapraz marj (cross) — istenen ${mode}`);
      return { info: { not: 'bybit: marj kipi hesap düzeyinde (REGULAR_MARGIN); istek atılmadı' }, marginMode: 'cross' };
    }),
  };

  const yz = new Proxy(h, {
    get(hedef, ad) {
      if (ad === 'markets') {
        if (hedef.markets !== pazarKaynak) {
          pazarKaynak = hedef.markets;
          pazarlar = pazarKaynak ? Object.fromEntries(Object.entries(pazarKaynak).filter(([, m]) => yuzeydeMi(m)).map(([s, m]) => [s, yuzeyPazari(m)])) : pazarKaynak;
        }
        return pazarlar;
      }
      if (ad === '__bybit') return hedef;
      if (ad === '__yuzey') return 'bybit';
      if (ad === '__hesapBilgisi') return hesapBilgisi;
      if (Object.prototype.hasOwnProperty.call(ozel, ad)) return ozel[ad];
      const v = hedef[ad];
      if (typeof v !== 'function') return v;
      if (typeof ad === 'string' && ISTEK_ADI.test(ad)) {
        return (...a) => {
          try { const r = v.apply(hedef, a); return r && typeof r.then === 'function' ? r.catch((e) => { throw hataNormal(e); }) : r; }
          catch (e) { throw hataNormal(e); }
        };
      }
      return v.bind(hedef);
    },
    set(hedef, ad, deger) { hedef[ad] = deger; return true; },
  });
  return yz;
}

// ── Bağdaştırıcı işlevleri ─────────────────────────────────────────────────
/**
 * @param o { ortam: 'testnet' (yalnız demo), apiKey, apiSecret, ccxtSinifi (test) } — parola yok sayılır (Bybit'te passphrase yok)
 * @returns Binance dilinde yüzey (Proxy). Asıl ccxt nesnesi `__bybit`.
 */
function kur({ ortam, apiKey, apiSecret, ccxtSinifi } = {}) {
  if (ortam === 'live') throw new Error('Bybit canlı hesap ortamı bu sürümde KAPALI (yalnız demo; A2) — bağlanılmadı');
  if (!ORTAMLAR.has(ortam)) throw new Error(`Bybit ortamı testnet (demo) olmalı, "${ortam}" değil`);
  if (!apiKey || !apiSecret) throw new Error('Bybit demo için API anahtarı ve secret gerekli');
  const Sinif = ccxtSinifi || ccxt.bybit;
  const h = new Sinif({
    apiKey, secret: apiSecret,
    enableRateLimit: true,
    options: {
      adjustForTimeDifference: true,
      defaultType: 'swap', defaultSubType: 'linear', defaultSettle: 'USDT',
      fetchMarkets: { types: ['linear'] },       // yalnız USDT/USDC lineer sözleşmeler (spot/opsiyon/ters pazarlar yüklenmez)
    },
  });
  zarfDenetimi(h);
  if (typeof h.enableDemoTrading !== 'function') throw new Error('ccxt sürümü Bybit demo (Demo Trading) desteklemiyor');
  h.enableDemoTrading(true);                       // api-demo.bybit.com
  h.__ortam = ortam;
  return yuzey(h);
}

/** Kâğıt pazar listesinde en az bu kadar USDT lineer sürekli sözleşme olmalı — boş/eksik liste evreni "Bybit'te yok" diye sıfırlamasın. */
const PAZAR_EN_AZ = 20;

/**
 * KÂĞIT BYBIT botunun PAZAR KURALLARI — anahtarsız ccxt.bybit (yalnız genel `/v5/market/instruments-info`, api.bybit.com; emir/bakiye
 * ucu YOK, demo da yok: kurallar canlı pazarınki, kâğıt hesap onları taklit eder). Dönen nesne YALNIZ `loadMarkets` + `markets`
 * taşır (yüzey pazarları: baz birim, contractSize 1, `kontratBoyu`, ön piyasa yok) — bu nesneyle emir isteği atılamaz.
 * KagitBorsa `pazarKaynagi` olarak alır; mum / ticker / mark Binance'ten (karar verisi gölgeyle aynı).
 * KAPALI-BAŞARISIZ: USDT lineer swap sayısı PAZAR_EN_AZ'dan azsa BadResponse.
 * @param o.ccxtSinifi test için sahte sınıf (Bybit'e gerçek istek atmadan)
 */
function pazarIstemcisi({ ccxtSinifi } = {}) {
  const Sinif = ccxtSinifi || ccxt.bybit;
  const h = new Sinif({ enableRateLimit: true, options: { defaultType: 'swap', defaultSubType: 'linear', fetchMarkets: { types: ['linear'] } } });
  if (typeof h.handleErrors === 'function') zarfDenetimi(h);
  const yz = yuzey(h);
  return Object.freeze({
    kimlik: 'bybit',
    async loadMarkets() {
      const m = await yz.loadMarkets();
      const n = Object.values(m || {}).filter(x => x && x.swap && x.linear && x.quote === 'USDT').length;
      if (n < PAZAR_EN_AZ) throw new ccxt.BadResponse(`bybit: pazar listesi eksik (${n} USDT swap < ${PAZAR_EN_AZ}) — kâğıt borsa kurulmadı`);
      return m;
    },
    get markets() { return yz.markets; },
  });
}

/**
 * Öz denetim "Funding aşırılığı" — Bybit botunun sembollerinin funding oranı (salt okuma, TEK istek: `/v5/market/tickers?category=linear`).
 * Binance'te bu işlev YOK (öz denetim Binance için genel premiumIndex okumasını kullanır, birebir).
 * @returns {{ oranlar: { BTCUSDT: 0.0001, … }, hatalar: string[] }}
 */
async function fundingOranlari(b, semboller = []) {
  const oranlar = {}, hatalar = [];
  const istenen = [...new Set(semboller)].slice(0, 40);
  if (!istenen.length) return { oranlar, hatalar };
  let l;
  try {
    const r = await b.publicGetV5MarketTickers({ category: KATEGORI });
    l = r && r.result && Array.isArray(r.result.list) ? r.result.list : null;
    if (!l) throw new Error('tickers listesi yok');
  } catch (e) { return { oranlar, hatalar: istenen.map(s => `${s}: ${String(e && e.message).slice(0, 60)}`) }; }
  const harita = new Map(l.map(x => [x.symbol, x]));
  for (const s of istenen) {
    const id = String(s).split(':')[0].replace('/', '');
    const x = harita.get(id);
    const v = x && x.fundingRate !== '' ? +x.fundingRate : NaN;
    if (Number.isFinite(v)) oranlar[id] = v; else hatalar.push(`${s}: funding oranı yok`);
  }
  return { oranlar, hatalar };
}

/** Yalnız demo: canlı izin kapısı bu sürümde yok (kur zaten reddeder). */
async function canliIzinDenetle() {
  throw new Error('Bybit canlı hesap ortamı bu sürümde KAPALI — bağlanılmadı');
}

/** query-api izinleri düz liste: ['ContractTrade:Order', 'Wallet:Withdraw', …] */
const izinListesi = (api) => Object.entries((api && api.permissions) || {}).flatMap(([g, l]) => (Array.isArray(l) ? l.map(x => `${g}:${x}`) : []));
const ipVar = (api) => (Array.isArray(api && api.ips) ? api.ips.filter(x => x && x !== '*').length > 0 : null);

/** user/query-api → { cekme, vadeli, spot, aktarim, ipKisit } */
async function izinler(b) {
  const { api } = await b.__hesapBilgisi(true);
  const l = izinListesi(api);
  const ro = String(api.readOnly) === '1';
  return { cekme: l.some(x => /withdraw/i.test(x)), vadeli: !ro && l.includes('ContractTrade:Order') && l.includes('ContractTrade:Position'),
    spot: !ro && l.includes('Spot:SpotTrade'), aktarim: l.includes('Wallet:AccountTransfer'), ipKisit: ipVar(api) };
}

/**
 * Bağlanırken hesap kipi (yürütücü `baglan`, pozisyon modundan önce): para çekme izni yok + işlem izni var + UTA + çapraz marj + tek yön.
 * Uymuyorsa bağlanmaz — kip kendiliğinden DEĞİŞTİRİLMEZ (kullanıcı Bybit ayarlarından değiştirir).
 */
async function hesapKipiDenetle(b) {
  let bilgi;
  try { bilgi = await b.__hesapBilgisi(true); } catch (e) {
    throw new Error(`Bybit hesap bilgisi okunamadı (${String(e && e.message).slice(0, 120)}) — hesap kipi doğrulanamadan bağlanılmaz`);
  }
  const { hesap, api } = bilgi;
  const l = izinListesi(api);
  if (l.some(x => /withdraw/i.test(x))) throw new Error('Bybit API anahtarında PARA ÇEKME (Withdraw) izni açık — Bybit API ayarlarından kapatın; bağlanılmadı');
  if (String(api.readOnly) === '1') throw new Error('Bybit API anahtarı salt okuma (Read-Only) — bot emir veremez; "Read-Write" + Contract › Orders/Positions izniyle yeni anahtar oluşturun; bağlanılmadı');
  if (!l.includes('ContractTrade:Order') || !l.includes('ContractTrade:Position')) throw new Error('Bybit API anahtarında vadeli işlem izni (Contract › Orders + Positions) yok; bağlanılmadı');
  const durum = +hesap.unifiedMarginStatus;
  if (!(durum >= 3)) throw new Error(`Bybit hesabı Birleşik İşlem Hesabı (UTA) olmalı — bulunan unifiedMarginStatus ${hesap.unifiedMarginStatus} (klasik hesap); hesap kendiliğinden yükseltilmez; bağlanılmadı`);
  if (String(hesap.marginMode) !== 'REGULAR_MARGIN') throw new Error(`Bybit marj kipi "çapraz" (Cross Margin / REGULAR_MARGIN) olmalı — bulunan ${hesap.marginMode}; kip kendiliğinden değiştirilmez, Bybit › Varlıklar › Birleşik İşlem Hesabı › Marj kipinden değiştirin; bağlanılmadı`);
  const mod = await b.fetchPositionMode();
  if (mod.hedged) throw new Error('Bybit pozisyon kipi "tek yön" (One-Way) olmalı — bulunan hedge (Hedge Mode); kip kendiliğinden değiştirilmez; bağlanılmadı');
  return { unifiedMarginStatus: durum, marginMode: hesap.marginMode, posMode: 'oneway', izinler: l };
}

async function pozisyonModu(b) {
  const mod = await b.fetchPositionMode(undefined).catch(() => null);
  return mod && mod.hedged ? 'hedge' : 'oneway';
}

async function kaldiracHazirla(b, symbol, { kaldirac = 20, marj = 'cross' } = {}) {
  await b.setMarginMode(marj, symbol);
  const r = await b.setLeverage(kaldirac, symbol);
  return { kaldirac: r && r.leverage != null ? +r.leverage : null };
}

/** Ortak koruma emri çağrısı — Binance ile AYNI kanonik çağrı; yüzey Bybit koşullu emrine çevirir. */
const korumaEmri = Object.freeze({
  async koy(b, symbol, side, tetik, { tam = true, miktar: q = null, id } = {}) {
    const params = { clientOrderId: id, triggerPrice: tetik, workingType: 'MARK_PRICE', priceProtect: true };
    if (tam) params.closePosition = true; else params.reduceOnly = true;
    return b.createOrder(symbol, 'STOP_MARKET', side, tam ? undefined : q, undefined, params);
  },
  oku(b, symbol) { return b.fetchOpenOrders(symbol, undefined, undefined, { trigger: true }); },
  iptal(b, symbol, borsaId) { return b.cancelOrder(borsaId, symbol, { trigger: true }); },
});

/** Funding (salt okuma): GET /v5/account/transaction-log type SETTLEMENT (UTA; en çok 7 günlük pencere). tutar = bakiye değişimi (change). */
async function gelir(b, { tur = 'funding', bas, bit } = {}) {
  if (tur !== 'funding') throw new Error(`gelir türü desteklenmiyor: ${tur}`);
  if (!b || typeof b.privateGetV5AccountTransactionLog !== 'function') return null;
  const p = { accountType: 'UNIFIED', category: KATEGORI, type: 'SETTLEMENT', limit: '50' };
  if (bas != null) p.startTime = String(Math.floor(bas));
  if (bit != null) p.endTime = String(Math.floor(bit));
  const r = await b.privateGetV5AccountTransactionLog(p);
  const l = r && r.result && Array.isArray(r.result.list) ? r.result.list : [];
  return l.map(x => ({ zaman: +x.transactionTime || null, tutar: +x.change || 0, symbol: b.safeSymbol ? b.safeSymbol(x.symbol, undefined, undefined, 'swap') : x.symbol,
    para: x.currency || 'USDT', kimlik: x.id != null ? String(x.id) : null }));
}

/** Zorla kapanışlar (salt okuma): GET /v5/order/history — createType likidasyon (CreateByLiq / TakeOver) + ADL (son 7 gün). */
async function zorlaKapanislar(b, basMs) {
  if (!b || b.kagit || typeof b.privateGetV5OrderHistory !== 'function') return null;
  const r = await b.privateGetV5OrderHistory({ category: KATEGORI, settleCoin: 'USDT', startTime: String(Math.floor(basMs)), limit: '50' });
  const l = r && r.result && Array.isArray(r.result.list) ? r.result.list : [];
  return l.filter(x => /Liq|TakeOver|Adl/i.test(String(x.createType || ''))).map(x => {
    const symbol = b.safeSymbol ? b.safeSymbol(x.symbol, undefined, undefined, 'swap') : x.symbol;
    const m = b.__bybit && b.__bybit.markets ? b.__bybit.markets[symbol] : null;
    return { id: String(x.orderId), symbol, tur: /Adl/i.test(x.createType) ? 'ADL' : 'LIQUIDATION', side: String(x.side || '').toLowerCase(),
      miktar: miktar.baza(m, +x.cumExecQty || +x.qty || 0), fiyat: +x.avgPrice || +x.price || 0, zaman: +x.updatedTime || +x.createdTime || null };
  });
}

module.exports = Object.freeze({
  kimlik: 'bybit',
  ad: 'Bybit',
  hazir: false,                                   // 7.4: hazir:true ancak demo hesapta ölçüm + matris tam geçtiği commit'te
  sinaniyor: true,                                // matris zincirde koşar (hazir olmasa da)
  durum: 'Bybit demo: hazırlık — henüz bağlanamaz',
  matris: 'scripts/hata-matrisi-bybit-selftest.js',
  ortamlar: ORTAMLAR,
  kur,
  pazarIstemcisi,
  fundingOranlari,
  PAZAR_EN_AZ,
  canliIzinDenetle,
  izinler,
  hesapKipiDenetle,
  pozisyonModu,
  emirKimligi,
  miktar,
  filtreler,
  yuzeyPazari,
  kaldiracHazirla,
  korumaEmri,
  gelir,
  zorlaKapanislar,
  hataSinifi,
  hataNormal,
  DUZELT,
});
