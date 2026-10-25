'use strict';
/**
 * OKX BAĞDAŞTIRICISI (A2 / 5. faz parça 1 — TASARIM-MAKINE-HESAP-BOT §7.3). ccxt `okx` (kurulu ccxt@4.5.89; yeni paket yok).
 *
 * `hazir: false` — bot kaydı OKX hesabına BAĞLANAMAZ (botYonetimi `borsalar.baglanmaEngeli`). Bu parçada yalnız kod + sahte borsa
 * testleri (scripts/borsa-arayuz-selftest.js, scripts/hata-matrisi-okx-selftest.js); OKX'e gerçek istek atılmadı. Gerçek para yolu
 * KAPALI: `kur` yalnız demo (`testnet` = OKX simüle işlem, `x-simulated-trading: 1`) kurar.
 * Parça 2 (§7.5): OKX demo botu KÂĞITTA — `pazarIstemcisi` (anahtarsız pazar kuralları, KagitBorsa pazarKaynagi), `fundingOranlari`
 * (öz denetim), `durum` ("OKX demo: hazırlık — henüz bağlanamaz"). hazir:false KALIR; demo hesapta salt okuma ölçümü ve hazir:true
 * kullanıcı OKX demo anahtarını girdikten sonra ayrı adım (scripts/okx-demo-bot-selftest.js).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * YÜZEY: canlı kod OKX'i bilmez — bağdaştırıcı "Binance dilini" konuşan bir yüzey üretir
 * ═══════════════════════════════════════════════════════════════════════════
 * Yürütücü, felaket stopu, Kalkan, marj izleme ve DCA bugün Binance'in dilini konuşur (baz miktar, `ag-<bot>-<gün>-<sayaç>`,
 * `STOP_MARKET` + `closePosition`, `info.totalMaintMargin`, `setMarginMode`). `kur` ccxt.okx nesnesini bir Proxy ile sarar; çeviri
 * yalnız SINIRDA yapılır, canlı kodda borsa adı geçen tek satır eklenmez:
 *   · MİKTAR: OKX'te ccxt `amount` KONTRATTIR (BTC-USDT-SWAP ctVal 0,01 BTC). Yüzeyin `markets`ı baz birimdedir (adım = lotSz × ctVal,
 *     sınırlar × ctVal, contractSize 1; asıl değer `kontratBoyu`). createOrder baz → kontrat (adıma AŞAĞI), emir/pozisyon cevapları
 *     kontrat → baz. En olası hata 100 kat büyük emirdir: tavanlar baz × fiyat (USDT) üzerinden kalır, sahte OKX ctVal 0,01 ile sınar.
 *   · KİMLİK: clOrdId yalnız harf/rakam, ≤ 32. `ag-dc-20261025-000042` ↔ `agdc20261025000042` (tiresiz, tersinir). Defter, günlük,
 *     işlem geçmişi Binance biçimini görmeye devam eder. Biçime uymayan kimlik İSTEK ATILMADAN InvalidOrder (kesin gönderilmedi).
 *   · KORUMA EMRİ: `STOP_MARKET` + `closePosition` → algo `ordType: conditional`, `slTriggerPx`, `slOrdPx -1`, `slTriggerPxType mark`,
 *     `closeFraction '1'` + `reduceOnly`; miktarlıysa `sz` (kontrat). `trigger: true` sorgu/liste/iptal → algo uçları (`algoClOrdId`).
 *   · CEVAP: OKX emir/iptal cevabı yalnız onaydır (durum yok). Yüzey aynı clOrdId ile BİR KEZ sorgular ve tam emri döndürür (Binance
 *     RESULT gibi); sorgu başarısızsa onay döner → yürütücü bunu "belirsiz" sayar ve kendi sorgusuyla çözer (çift emir yok).
 *   · HATA: ccxt okx eşlemesi korunur; yalnız eşlemenin YANLIŞ sınıfladığı kodlar düzeltilir (50061 alt hesap hız sınırı ExchangeError →
 *     RateLimitExceeded). Ölçüm tablosu scripts/hata-matrisi-okx-selftest.js A katmanında sabitlendi.
 *   · HESAP KİPİ: tek para birimi marjı (acctLv 2) + `net_mode` ZORUNLU; uymuyorsa bağlanmaz, kipi kendiliğinden DEĞİŞTİRMEZ.
 *     Anahtarda `withdraw` izni varsa (demo dahil) bağlanmaz.
 *   · Desteklenmeyen (bu parçada): hedge kipi, spot, aktarım (sapi karşılığı), ilk 100'den fazla sayfa × 10.
 */
const ccxt = require('ccxt');
const { adimaYuvarla, ondalik } = require('../onKontrol');

const ORTAMLAR = new Set(['testnet']);

// ── Emir kimliği ────────────────────────────────────────────────────────────
const IC = /^ag-([a-z0-9]{1,8})-(\d{8})-(\d{6})$/;        // emirKimligi.uret (Binance biçimi, sayaç 6 hane)
const DESEN = /^ag([a-z0-9]{1,8})(\d{8})(\d{6})$/;        // OKX clOrdId biçimi (tiresiz); bot etiketi sondaki 14 haneden ayrılır
const OKX_KURAL = /^[A-Za-z0-9]{1,32}$/;

function gunEtiketi(zaman = Date.now()) { return new Date(zaman).toISOString().slice(0, 10).replace(/-/g, ''); }

const emirKimligi = Object.freeze({
  desen: DESEN,
  /** OKX biçiminde yeni kimlik: ag<bot><yyyymmdd><sayac6>. */
  uret(bot, sayac, zaman) {
    if (!/^[a-z0-9]{1,8}$/.test(bot)) throw new Error(`bot etiketi geçersiz: ${bot}`);
    if (!Number.isInteger(sayac) || sayac < 0 || sayac > 999999) throw new Error(`sayaç geçersiz (OKX biçimi 6 hane): ${sayac}`);
    const id = `ag${bot}${gunEtiketi(zaman)}${String(sayac).padStart(6, '0')}`;
    if (!OKX_KURAL.test(id) || !DESEN.test(id)) throw new Error(`clOrdId OKX kuralına uymuyor: ${id}`);
    return id;
  },
  bizimMi(id) { return typeof id === 'string' && DESEN.test(id); },
  /** İç (defter) kimliği → OKX clOrdId. Uymayan kimlik → null (çağıran isteği atmaz). */
  borsaya(ic) {
    if (typeof ic !== 'string') return null;
    const m = IC.exec(ic);
    if (m) return `ag${m[1]}${m[2]}${m[3]}`;
    return null;
  },
  /** OKX clOrdId → iç kimlik (bizim değilse olduğu gibi; boşsa undefined). */
  bizden(id) {
    if (typeof id !== 'string' || !id) return undefined;
    const m = DESEN.exec(id);
    return m ? `ag-${m[1]}-${m[2]}-${m[3]}` : id;
  },
});

// ── Miktar (baz ↔ kontrat) ──────────────────────────────────────────────────
const temiz = (x) => (Number.isFinite(x) ? +x.toFixed(12) : x);
const kontratBoyu = (m) => (m && m.contract && +m.contractSize > 0 ? +m.contractSize : 1);

const miktar = Object.freeze({
  /** Baz miktar → kontrat (lotSz'ye AŞAĞI; yukarı yuvarlamak tavan/bakiye aşımı demek). `market` ccxt.okx'in ASIL pazarı. */
  bazdan(market, q) {
    if (q == null || !Number.isFinite(+q)) return q;
    const ct = kontratBoyu(market);
    const lot = market && market.precision && +market.precision.amount;
    const k = +q / ct;
    return lot > 0 ? adimaYuvarla(k, lot, 'asagi') : temiz(k);
  },
  /** Kontrat → baz miktar. */
  baza(market, kontrat) {
    if (kontrat == null || kontrat === '' || !Number.isFinite(+kontrat)) return kontrat;
    return temiz(+kontrat * kontratBoyu(market));
  },
});

/** Yüzey pazarı: baz birimde adım/sınırlar (onKontrol, piyasaDilimleri, KucukSermaye, Kalkan bunları baz sanar). */
function yuzeyPazari(m) {
  if (!m || !m.contract || !(+m.contractSize > 0)) return m;
  const ct = +m.contractSize;
  const x = (v) => (v == null || !Number.isFinite(+v) ? v : temiz(+v * ct));
  const lot = m.precision && m.precision.amount;
  const lim = m.limits || {};
  const info = m.info || {};
  const adim = lot > 0 ? +(lot * ct).toFixed(Math.min(16, ondalik(lot) + ondalik(ct))) : lot;
  return {
    ...m,
    contractSize: 1,
    kontratBoyu: ct,
    precision: { ...m.precision, amount: adim },
    limits: {
      ...lim,
      amount: { ...(lim.amount || {}), min: x(lim.amount && lim.amount.min), max: x(lim.amount && lim.amount.max) },
      market: { min: x(lim.amount && lim.amount.min), max: x(info.maxMktSz) },
    },
  };
}

function filtreler(market) {
  if (!market) return null;
  const lim = market.limits || {};
  return {
    adim: (market.precision && market.precision.amount) || null,
    tick: (market.precision && market.precision.price) || null,
    minMiktar: (lim.amount && lim.amount.min) || null,
    minNominal: (lim.cost && lim.cost.min) || null,
    piyasaMax: (lim.market && lim.market.max) || (lim.amount && lim.amount.max) || null,
    // OKX fiyat sınırı dinamik (/public/price-limit) → ön kontrol bandı atlar, borsa reddeder (51006 → InvalidOrder → RED).
    fiyatBandi: null,
    kontratBoyu: market.kontratBoyu || kontratBoyu(market),
  };
}

// ── Hata ────────────────────────────────────────────────────────────────────
/** ccxt okx eşlemesinin bizim sınıflamamıza göre YANLIŞ olduğu kodlar (ölçüldü, ccxt 4.5.89). */
const DUZELT = Object.freeze({
  50061: ccxt.RateLimitExceeded,     // "Sub-account rate limit exceeded" → ccxt ExchangeError (BELIRSIZ olurdu; doğrusu HIZ)
});
const KOD_RE = /"sCode"\s*:\s*"(\d+)"|"code"\s*:\s*"(\d+)"/g;

function okxKodlari(msj) {
  const l = [];
  for (const m of String(msj || '').matchAll(KOD_RE)) { const k = m[1] || m[2]; if (k && k !== '0' && k !== '1' && k !== '2') l.push(k); }
  return l;
}

/** Gövdesiz HTTP 429: ccxt okx'te httpExceptions boş → ExchangeNotAvailable (BELIRSIZ olurdu; doğrusu HIZ — geri çekilme + sorgu). */
const HTTP_429 = /^okx \S+ \S+ 429\b/;
// Sınırda hata düzeltmesi: yalnız HTTP 429 + DUZELT tablosu; diğer her hata aynen (ccxt sınıfı korunur).

function hataNormal(e) {
  if (!e || typeof e !== 'object' || !(e instanceof ccxt.BaseError)) return e;
  const yeni = (S, kod) => { const y = new S(e.message); if (e.yanitBasliklari) y.yanitBasliklari = e.yanitBasliklari; y.okxKod = kod; return y; };
  if (HTTP_429.test(String(e.message || '')) && !(e instanceof ccxt.RateLimitExceeded) && !(e instanceof ccxt.DDoSProtection)) return yeni(ccxt.RateLimitExceeded, 'HTTP429');
  for (const k of okxKodlari(e.message)) {
    const S = DUZELT[k];
    if (S && !(e instanceof S)) return yeni(S, k);
  }
  return e;
}

let _genelSinif = null;
function hataSinifi(e) {
  if (!_genelSinif) _genelSinif = require('../yurutucu').hataSinifi;
  return _genelSinif(hataNormal(e));
}

// ── Yüzey ───────────────────────────────────────────────────────────────────
const ISTEK_ADI = /^(fetch|create|cancel|edit|set|load|private|public)/;
const ALGO_DURUM = { live: 'NEW', effective: 'TRIGGERED', partially_effective: 'TRIGGERED', canceled: 'CANCELED', order_failed: 'EXPIRED', pause: 'NEW' };

function yuzey(h) {
  let pazarKaynak = null, pazarlar = null;
  let config = null, configZaman = 0;
  const ham = (symbol) => (h.markets && h.markets[symbol]) || null;

  const kapsa = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { throw hataNormal(e); } };

  /** OKX emri → Binance dilinde emir (baz miktar, iç kimlik, algo alanları). */
  function cevir(o) {
    if (!o || typeof o !== 'object') return o;
    const m = ham(o.symbol);
    const info = o.info || {};
    const algo = info.algoId != null && info.algoId !== '';
    const out = { ...o,
      amount: miktar.baza(m, o.amount), filled: miktar.baza(m, o.filled), remaining: miktar.baza(m, o.remaining),
      // Algo emirde ccxt clientOrderId'yi clOrdId'den okur (ccxt imzası oraya aracı kimliği ekler) — bizimki algoClOrdId.
      clientOrderId: emirKimligi.bizden(algo ? (info.algoClOrdId || undefined) : o.clientOrderId) };
    if (algo) {
      out.triggerPrice = o.triggerPrice ?? o.stopLossPrice ?? null;
      out.closePosition = String(info.closeFraction || '') === '1';
      out.info = { ...info, algoStatus: ALGO_DURUM[info.state] || String(info.state || '').toUpperCase() || undefined };
    }
    return out;
  }

  function okxId(ic) {
    const id = emirKimligi.borsaya(ic);
    if (!id) throw new ccxt.InvalidOrder(`okx: emir kimliği OKX biçimine çevrilemedi (${ic}) — istek atılmadı`);
    return id;
  }

  async function hesapAyari(taze = false) {
    if (!taze && config && Date.now() - configZaman < 60e3) return config;
    const r = await h.privateGetAccountConfig();
    const d = r && Array.isArray(r.data) ? r.data[0] : null;
    if (!d || typeof d !== 'object') throw new ccxt.BadResponse(`okx account/config geçersiz cevap: ${JSON.stringify(r).slice(0, 120)}`);
    config = d; configZaman = Date.now();
    return d;
  }

  async function emirSorgu(symbol, clOrdId) {
    try { const o = await h.fetchOrder(undefined, symbol, { clOrdId }); return o && o.id != null ? o : null; } catch { return null; }
  }

  async function stopKoy(symbol, side, amount, params) {
    const p = { ...params };
    if (p.positionSide || p.hedged) throw new ccxt.NotSupported('okx: hedge (long/short) kipi desteklenmiyor — hesap net_mode olmalı; istek atılmadı');
    if (!(+p.triggerPrice > 0)) throw new ccxt.InvalidOrder('okx: koruma emrinde tetik fiyatı yok — istek atılmadı');
    const q = { stopLossPrice: p.triggerPrice, slTriggerPxType: p.workingType === 'MARK_PRICE' ? 'mark' : 'last', tdMode: 'cross', reduceOnly: true };
    if (p.clientOrderId) q.algoClOrdId = okxId(p.clientOrderId);
    let k;
    if (p.closePosition) q.closeFraction = '1';
    else {
      k = miktar.bazdan(ham(symbol), amount);
      if (!(k > 0)) throw new ccxt.InvalidOrder(`okx: koruma miktarı ${amount} kontrata çevrilemedi — istek atılmadı`);
    }
    const ack = await h.createOrder(symbol, 'market', side, k, undefined, q);
    // Onay (algoId) yeter: felaket stopu yalnız kimliğe bakar; durum sonraki listede/sorguda okunur (uydurulmaz).
    return cevir({ ...ack, info: { ...((ack && ack.info) || {}), algoClOrdId: q.algoClOrdId, closeFraction: q.closeFraction } });
  }

  const ozel = {
    loadMarkets: kapsa(async (...a) => { await h.loadMarkets(...a); return yz.markets; }),

    createOrder: kapsa(async (symbol, type, side, amount, price, params = {}) => {
      if (type === 'STOP_MARKET') return stopKoy(symbol, side, amount, params);
      const p = { ...params };
      if (p.positionSide || p.hedged) throw new ccxt.NotSupported('okx: hedge (long/short) kipi desteklenmiyor — hesap net_mode olmalı; istek atılmadı');
      if (type !== 'market' && type !== 'limit') throw new ccxt.NotSupported(`okx: emir türü ${type} bu yüzeyde yok — istek atılmadı`);
      const q = { tdMode: 'cross' };
      if (p.clientOrderId) q.clOrdId = okxId(p.clientOrderId);
      if (p.reduceOnly) q.reduceOnly = true;
      const k = miktar.bazdan(ham(symbol), amount);
      if (!(k > 0)) throw new ccxt.InvalidOrder(`okx: miktar ${amount} kontrata çevrilemedi (kontrat boyu ${kontratBoyu(ham(symbol))}) — istek atılmadı`);
      const ack = await h.createOrder(symbol, type, side, k, type === 'limit' ? price : undefined, q);
      // OKX cevabı yalnız onay: tam emir aynı clOrdId ile bir kez sorgulanır; olmazsa onay döner (yürütücü belirsiz sayar, kendisi sorgular).
      if (q.clOrdId && ack && ack.id != null) { const o = await emirSorgu(symbol, q.clOrdId); if (o) return cevir(o); }
      return cevir(ack);
    }),

    fetchOrder: kapsa(async (id, symbol, params = {}) => {
      const p = { ...params };
      if (p.clientOrderId) p.clientOrderId = okxId(p.clientOrderId);
      return cevir(await h.fetchOrder(id, symbol, p));
    }),

    fetchOpenOrders: kapsa(async (symbol, since, limit, params = {}) => {
      const p = { ...params };
      const trig = p.trigger === true || p.stop === true;
      delete p.trigger; delete p.stop;
      const q = { instType: 'SWAP', ...(trig ? { ordType: 'conditional' } : {}), ...p };
      const hepsi = [];
      for (let sayfa = 0; ; sayfa++) {
        const l = await h.fetchOpenOrders(symbol, undefined, 100, q);
        if (!Array.isArray(l)) return l;              // bozuk cevap: yürütücü kendi denetimiyle reddeder
        hepsi.push(...l);
        if (l.length < 100) break;
        // Eksik liste ile mutabakat yapılmaz (kapalı-başarısız): en çok 10 sayfa.
        if (sayfa >= 9) throw new ccxt.BadResponse('okx: açık emir listesi 1000\'i aştı — eksik liste ile mutabakat yapılmaz');
        q.after = l[l.length - 1].id;
      }
      return hepsi.map(cevir);
    }),

    cancelOrder: kapsa(async (id, symbol, params = {}) => {
      const p = { ...params };
      if (p.trigger === true || p.stop === true) return cevir(await h.cancelOrder(id, symbol, { trigger: true }));
      const q = {};
      if (p.clientOrderId) q.clOrdId = okxId(p.clientOrderId);
      const ack = await h.cancelOrder(q.clOrdId ? undefined : id, symbol, q);
      const o = q.clOrdId ? await emirSorgu(symbol, q.clOrdId)
        : await (async () => { try { return await h.fetchOrder(id, symbol); } catch { return null; } })();
      return cevir(o || ack);
    }),

    fetchPositions: kapsa(async (symbols, params = {}) => {
      const l = await h.fetchPositions(symbols, { instType: 'SWAP', ...params });
      if (!Array.isArray(l)) return l;
      return l.map(p => { const m = ham(p.symbol); return { ...p, contracts: miktar.baza(m, p.contracts), contractSize: 1, kontratBoyu: kontratBoyu(m) }; });
    }),

    fetchBalance: kapsa(async (params = {}) => {
      const r = await h.fetchBalance(params);
      if (!r || typeof r !== 'object') return r;
      const d0 = r.info && Array.isArray(r.info.data) ? r.info.data[0] : null;
      if (!d0 || !Array.isArray(d0.details)) throw new ccxt.BadResponse(`okx fetchBalance: hesap ayrıntısı yok — ${JSON.stringify(r.info).slice(0, 80)}`);
      // marjIzleme: hesap marj oranı = bakım marjı / marj bakiyesi (Binance info.totalMaintMargin / totalMarginBalance).
      // OKX tek para birimi marjı: USDT ayrıntısı mmr (bakım marjı) / eq (özsermaye). Demo'da ilk bağlantıda doğrulanacak (açık soru).
      const d = r.info && Array.isArray(r.info.data) && r.info.data[0] && Array.isArray(r.info.data[0].details)
        ? r.info.data[0].details.find(x => x && x.ccy === 'USDT') : null;
      if (d && Number.isFinite(+d.mmr) && d.mmr !== '' && Number.isFinite(+d.eq) && d.eq !== '') {
        return { ...r, info: { ...r.info, totalMaintMargin: String(d.mmr), totalMarginBalance: String(d.eq) } };
      }
      return r;
    }),

    fetchPositionMode: kapsa(async () => {
      const d = await hesapAyari();
      return { info: d, hedged: d.posMode === 'long_short_mode' };
    }),

    setLeverage: kapsa(async (leverage, symbol, params = {}) => {
      const r = await h.setLeverage(leverage, symbol, { mgnMode: 'cross', ...params });
      const d = r && Array.isArray(r.data) ? r.data[0] : null;
      return { info: r, leverage: d && d.lever != null ? +d.lever : (r && r.leverage != null ? +r.leverage : null), marginMode: d ? d.mgnMode : null };
    }),

    /** OKX'te marj kipi emir başınadır (tdMode cross her emirde gider) → istek yok. Yalnız 'cross' kabul. */
    setMarginMode: kapsa(async (mode) => {
      if (mode !== 'cross') throw new ccxt.NotSupported(`okx: yalnız çapraz marj (cross) — istenen ${mode}`);
      return { info: { not: 'okx: marj kipi emir başına tdMode cross ile verilir; istek atılmadı' }, marginMode: 'cross' };
    }),
  };

  const yz = new Proxy(h, {
    get(hedef, ad) {
      if (ad === 'markets') {
        if (hedef.markets !== pazarKaynak) {
          pazarKaynak = hedef.markets;
          pazarlar = pazarKaynak ? Object.fromEntries(Object.entries(pazarKaynak).map(([s, m]) => [s, yuzeyPazari(m)])) : pazarKaynak;
        }
        return pazarlar;
      }
      if (ad === '__okx') return hedef;
      if (ad === '__yuzey') return 'okx';
      if (ad === '__hesapAyari') return hesapAyari;
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
 * @param o { ortam: 'testnet' (yalnız demo), apiKey, apiSecret, parola, ccxtSinifi (test) }
 * @returns Binance dilinde yüzey (Proxy). Asıl ccxt nesnesi `__okx`.
 */
function kur({ ortam, apiKey, apiSecret, parola, ccxtSinifi } = {}) {
  if (ortam === 'live') throw new Error('OKX gerçek para ortamı bu sürümde KAPALI (yalnız demo; A2 parça 1) — bağlanılmadı');
  if (!ORTAMLAR.has(ortam)) throw new Error(`OKX ortamı testnet (demo) olmalı, "${ortam}" değil`);
  if (!apiKey || !apiSecret || !parola) throw new Error('OKX demo için API anahtarı, secret ve parola (passphrase) gerekli');
  const Sinif = ccxtSinifi || ccxt.okx;
  const h = new Sinif({
    apiKey, secret: apiSecret, password: parola,
    enableRateLimit: true,
    options: {
      adjustForTimeDifference: true,
      defaultType: 'swap',
      fetchMarkets: { types: ['swap'] },       // yalnız USDT swap (spot/opsiyon pazarları yüklenmez)
      createOrder: 'privatePostTradeOrder',      // tek emir ucu (toplu uç yerine; cevap ve hata biçimi aynı)
    },
  });
  // KAPALI-BAŞARISIZ GÖVDE (ölçüldü, hata-matrisi-okx C): ccxt okx 200 + boş / bozuk gövdede hata ATMAZ, boş yapı döndürür
  // (pozisyon [] , açık emir [], USDT'siz bakiye) — mutabakat "pozisyon yok" sanıp AKTIF olurdu. Her 2xx cevap OKX zarfı
  // `{ code, data: [...] }` taşımalı; değilse BadResponse (BELIRSIZ → sorgu / DURDURULDU). Binance'te aynı durum TypeError'dı.
  const asilHata = h.handleErrors;
  h.handleErrors = function (kod, sebep, url, yontem, basliklar, govde, cevap, ...ek) {
    const r = asilHata.call(this, kod, sebep, url, yontem, basliklar, govde, cevap, ...ek);
    if (+kod >= 200 && +kod < 300) {
      if (!cevap || typeof cevap !== 'object' || Array.isArray(cevap)) throw new ccxt.BadResponse(`okx ${yontem} ${url} ${kod} boş/bozuk gövde: ${String(govde == null ? '' : govde).slice(0, 80)}`);
      if (String(cevap.code) === '0' && !Array.isArray(cevap.data)) throw new ccxt.BadResponse(`okx ${yontem} ${url} ${kod} gövdede data dizisi yok: ${String(govde).slice(0, 80)}`);
    }
    return r;
  };
  if (typeof h.setSandboxMode !== 'function') throw new Error('ccxt sürümü OKX demo (sandbox) desteklemiyor');
  h.setSandboxMode(true);                        // x-simulated-trading: 1
  h.__ortam = ortam;
  return yuzey(h);
}

/** Kâğıt pazar listesinde en az bu kadar USDT lineer swap olmalı — boş/eksik liste evreni "OKX'te yok" diye sıfırlamasın. */
const PAZAR_EN_AZ = 20;

/**
 * A2 parça 2 (§7.5): KÂĞIT OKX botunun PAZAR KURALLARI — anahtarsız ccxt.okx (yalnız genel `public/instruments`; emir/bakiye ucu
 * YOK, demo başlığı da yok: kurallar canlı pazarınki, kâğıt hesap onları taklit eder). Dönen nesne YALNIZ `loadMarkets` + `markets`
 * taşır (yüzey pazarları: baz birim, contractSize 1, `kontratBoyu`) — başka yöntemi yoktur, bu nesneyle emir isteği atılamaz.
 * KagitBorsa `pazarKaynagi` olarak alır; mum / ticker / mark Binance'ten (karar verisi gölgeyle aynı).
 * KAPALI-BAŞARISIZ: USDT lineer swap sayısı PAZAR_EN_AZ'dan azsa BadResponse (eksik liste evrendeki her coini "OKX'te yok" yapardı).
 * @param o.ccxtSinifi test için sahte sınıf (OKX'e gerçek istek atmadan)
 */
function pazarIstemcisi({ ccxtSinifi } = {}) {
  const Sinif = ccxtSinifi || ccxt.okx;
  const h = new Sinif({ enableRateLimit: true, options: { defaultType: 'swap', fetchMarkets: { types: ['swap'] } } });
  const yz = yuzey(h);
  return Object.freeze({
    kimlik: 'okx',
    async loadMarkets() {
      const m = await yz.loadMarkets();
      const n = Object.values(m || {}).filter(x => x && x.swap && x.linear && x.quote === 'USDT').length;
      if (n < PAZAR_EN_AZ) throw new ccxt.BadResponse(`okx: pazar listesi eksik (${n} USDT swap < ${PAZAR_EN_AZ}) — kâğıt borsa kurulmadı`);
      return m;
    },
    get markets() { return yz.markets; },
  });
}

/**
 * A2 parça 2: öz denetim "Funding aşırılığı" — OKX botunun açık pozisyonlu sembollerinin funding oranı (salt okuma, sembol başına
 * `public/funding-rate`). Binance'te bu işlev YOK: öz denetim Binance için tek istekli genel premiumIndex okumasını kullanır (birebir).
 * @returns {{ oranlar: { BTCUSDT: 0.0001, … }, hatalar: string[] }}
 */
async function fundingOranlari(b, semboller = []) {
  const oranlar = {}, hatalar = [];
  for (const s of [...new Set(semboller)].slice(0, 40)) {
    try {
      const r = await b.fetchFundingRate(s);
      const v = r ? +r.fundingRate : NaN;
      if (Number.isFinite(v)) oranlar[String(s).split(':')[0].replace('/', '')] = v;
    } catch (e) { hatalar.push(`${s}: ${String(e && e.message).slice(0, 60)}`); }
  }
  return { oranlar, hatalar };
}

/** Yalnız demo: canlı izin kapısı bu sürümde yok (kur zaten reddeder). */
async function canliIzinDenetle() {
  throw new Error('OKX gerçek para ortamı bu sürümde KAPALI — bağlanılmadı');
}

/** account/config `perm` (read_only,trade,withdraw) + `ip`. → { cekme, vadeli, spot, aktarim, ipKisit } */
async function izinler(b) {
  const d = await b.__hesapAyari(true);
  const perm = String(d.perm || '').split(',').map(s => s.trim()).filter(Boolean);
  return { cekme: perm.includes('withdraw'), vadeli: perm.includes('trade'), spot: perm.includes('trade'), aktarim: null,
    ipKisit: typeof d.ip === 'string' ? d.ip.trim() !== '' : null };
}

/**
 * Bağlanırken hesap kipi (yürütücü `baglan`, pozisyon modundan önce): acctLv 2 (tek para birimi marjı) + net_mode + withdraw yok.
 * Uymuyorsa bağlanmaz — kip kendiliğinden DEĞİŞTİRİLMEZ (kullanıcı OKX ayarlarından değiştirir).
 */
async function hesapKipiDenetle(b) {
  const d = await b.__hesapAyari(true);
  const perm = String(d.perm || '').split(',').map(s => s.trim());
  if (perm.includes('withdraw')) throw new Error('OKX API anahtarında PARA ÇEKME (withdraw) izni açık — OKX API ayarlarından kapatın; bağlanılmadı');
  if (String(d.acctLv) !== '2') throw new Error(`OKX hesap kipi "tek para birimi marjı" (acctLv 2) olmalı — bulunan acctLv ${d.acctLv}; kip kendiliğinden değiştirilmez, OKX › Ayarlar › Hesap kipinden değiştirin; bağlanılmadı`);
  if (d.posMode !== 'net_mode') throw new Error(`OKX pozisyon kipi "tek yön" (net_mode) olmalı — bulunan ${d.posMode}; kip kendiliğinden değiştirilmez; bağlanılmadı`);
  return { acctLv: String(d.acctLv), posMode: d.posMode, perm: perm.filter(Boolean) };
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

/** Ortak koruma emri çağrısı — Binance ile AYNI kanonik çağrı; yüzey OKX algo emrine çevirir. */
const korumaEmri = Object.freeze({
  async koy(b, symbol, side, tetik, { tam = true, miktar: q = null, id } = {}) {
    const params = { clientOrderId: id, triggerPrice: tetik, workingType: 'MARK_PRICE', priceProtect: true };
    if (tam) params.closePosition = true; else params.reduceOnly = true;
    return b.createOrder(symbol, 'STOP_MARKET', side, tam ? undefined : q, undefined, params);
  },
  oku(b, symbol) { return b.fetchOpenOrders(symbol, undefined, undefined, { trigger: true }); },
  iptal(b, symbol, borsaId) { return b.cancelOrder(borsaId, symbol, { trigger: true }); },
});

/** Funding (salt okuma): GET /api/v5/account/bills type 8 (son 7 gün; daha eskisi bills-archive — sonraki parça). */
async function gelir(b, { tur = 'funding', bas, bit } = {}) {
  if (tur !== 'funding') throw new Error(`gelir türü desteklenmiyor: ${tur}`);
  const p = { instType: 'SWAP', type: '8', limit: '100' };
  if (bas != null) p.begin = String(Math.floor(bas));
  if (bit != null) p.end = String(Math.floor(bit));
  const r = await b.privateGetAccountBills(p);
  const l = r && Array.isArray(r.data) ? r.data : [];
  return l.map(x => ({ zaman: +x.ts || null, tutar: +x.balChg || 0, symbol: b.safeSymbol ? b.safeSymbol(x.instId) : x.instId, para: x.ccy || 'USDT', kimlik: x.billId != null ? String(x.billId) : null }));
}

/** Zorla kapanışlar (salt okuma): GET /api/v5/trade/orders-history, kategori tam/kısmi likidasyon + ADL (son 7 gün). */
async function zorlaKapanislar(b, basMs) {
  if (!b || b.kagit || typeof b.privateGetTradeOrdersHistory !== 'function') return null;
  const r = await b.privateGetTradeOrdersHistory({ instType: 'SWAP', begin: String(Math.floor(basMs)), limit: '100' });
  const l = r && Array.isArray(r.data) ? r.data : [];
  return l.filter(x => /liquidation|adl/i.test(String(x.category || ''))).map(x => {
    const symbol = b.safeSymbol ? b.safeSymbol(x.instId) : x.instId;
    const m = b.__okx && b.__okx.markets ? b.__okx.markets[symbol] : null;
    return { id: String(x.ordId), symbol, tur: /adl/i.test(x.category) ? 'ADL' : 'LIQUIDATION', side: x.side,
      miktar: miktar.baza(m, +x.accFillSz || +x.sz || 0), fiyat: +x.avgPx || +x.px || 0, zaman: +x.uTime || +x.cTime || null };
  });
}

module.exports = Object.freeze({
  kimlik: 'okx',
  ad: 'OKX',
  hazir: false,                                   // 7.4/7.8: hazir:true ancak 7c'de, matris tam geçtiği commit'te
  sinaniyor: true,                                // matris zincirde koşar (hazir olmasa da)
  // A2 parça 2: panelde ve bağlama reddinde görünen hazırlık durumu (hazir:true olduğu commit'te kalkar)
  durum: 'OKX demo: hazırlık — henüz bağlanamaz',
  matris: 'scripts/hata-matrisi-okx-selftest.js',
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
  HTTP_429,
});
