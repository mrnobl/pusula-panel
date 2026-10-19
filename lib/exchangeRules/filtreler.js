/**
 * EMİR FİLTRELERİ — Binance'in reddedeceği her şeyi emir GİTMEDEN yakala
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Binance yuvarlamaz, REDDEDER (-4014, -4023, -4164…). ccxt yuvarlar ama
 * fiyatı EN YAKIN tick'e çeker; bir alış limitinin yukarı, bir stop'un ters
 * yöne kayması stratejinin istemediği bir şeydir. Bu yüzden yön burada
 * açıkça seçilir:
 *
 *   fiyat (LIMIT)     BUY → 'asagi'   SELL → 'yukari'   (daha iyi fiyat; dolum ihtimali biraz düşer)
 *   tetik (STOP*)     BUY → 'yukari'  SELL → 'asagi'    (stop girişten uzaklaşır, erken tetiklenmez)
 *   tetik (TAKE_PROFIT*) BUY → 'asagi' SELL → 'yukari'  (hedef uzaklaşır, erken tetiklenmez)
 *   miktar            daima 'asagi' (bakiyeyi aşmaz; ccxt TRUNCATE ile aynı)
 *
 * Kullanıcı tercihi `emir.yuvarlama = { fiyat, tetik }` ile ezilebilir.
 *
 * Kaynak: https://developers.binance.com/docs/derivatives/usds-margined-futures/common-definition
 */
const { adimaYuvarla, katMi, carp, anlamliHane } = require('./ondalik');
const { HATA, hata } = require('./hataKodlari');
const { sembolKurali } = require('./ayristir');

const PIYASA_TIPLERI = new Set(['MARKET', 'STOP_MARKET', 'TAKE_PROFIT_MARKET', 'TRAILING_STOP_MARKET']);
const FIYATLI_TIPLER = new Set(['LIMIT', 'STOP', 'TAKE_PROFIT']);
const TETIKLI_TIPLER = new Set(['STOP', 'STOP_MARKET', 'TAKE_PROFIT', 'TAKE_PROFIT_MARKET']);
const CLIENT_ID_DESEN = /^[.A-Z:/a-z0-9_-]{1,36}$/;

/** Emir nesnesini tek biçime getirir (Türkçe ya da Binance alan adları). */
function emirNormalize(e) {
  const x = e || {};
  const tip = String(x.tip ?? x.type ?? 'LIMIT').toUpperCase();
  const yon = String(x.yon ?? x.side ?? '').toUpperCase();
  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  return {
    sembol: x.sembol ?? x.symbol ?? null,
    tip,
    yon,
    fiyat: num(x.fiyat ?? x.price),
    miktar: num(x.miktar ?? x.quantity ?? x.amount),
    tetikFiyati: num(x.tetikFiyati ?? x.stopPrice ?? x.triggerPrice),
    reduceOnly: x.reduceOnly === true || x.reduceOnly === 'true',
    closePosition: x.closePosition === true || x.closePosition === 'true',
    positionSide: x.positionSide ? String(x.positionSide).toUpperCase() : null,
    timeInForce: x.timeInForce ? String(x.timeInForce).toUpperCase() : null,
    clientOrderId: x.clientOrderId ?? x.newClientOrderId ?? x.clientAlgoId ?? null,
    yuvarlama: x.yuvarlama || null
  };
}

/** Fiyatı tick katına yuvarlar. yon: 'asagi' | 'yukari' | 'yakin'. */
function fiyatYuvarla(kural, fiyat, yon = 'yakin') {
  return adimaYuvarla(fiyat, kural.tickSize, yon, kural.minPrice);
}

/** Miktarı step katına AŞAĞI yuvarlar; piyasa emrinde MARKET_LOT_SIZE adımı. */
function miktarYuvarla(kural, miktar, { piyasa = false } = {}) {
  const adim = piyasa ? kural.mktStepSize : kural.stepSize;
  const taban = piyasa ? kural.mktMinQty : kural.minQty;
  // Taban minQty'den sayılır (belge: (qty − minQty) % step == 0). minQty'nin
  // altında kalan değer tabana göre negatif olur; o durumda sıfırdan say ki
  // sonuç 0 ya da step katı çıksın (−4004 doğrulamada yakalanır).
  if (Number(miktar) < Number(taban)) return Math.max(0, adimaYuvarla(miktar, adim, 'asagi', 0));
  return adimaYuvarla(miktar, adim, 'asagi', taban);
}

/** Verilen fiyatta MIN_NOTIONAL ve minQty'yi karşılayan EN KÜÇÜK miktar (step katı, yukarı). */
function minMiktar(kural, fiyat, { piyasa = false } = {}) {
  const minQty = Number(piyasa ? kural.mktMinQty : kural.minQty);
  const adim = piyasa ? kural.mktStepSize : kural.stepSize;
  const gerek = Math.max(minQty, (kural.minNotional || 0) / Number(fiyat));
  return adimaYuvarla(gerek, adim, 'yukari', 0);
}

/** Varsayılan yuvarlama yönleri (dosya başındaki tablo). */
function varsayilanYonler(tip, yon) {
  const alis = yon === 'BUY';
  let tetik = alis ? 'yukari' : 'asagi';
  if (tip === 'TAKE_PROFIT' || tip === 'TAKE_PROFIT_MARKET') tetik = alis ? 'asagi' : 'yukari';
  return { fiyat: alis ? 'asagi' : 'yukari', tetik };
}

/** Bir emri kurallara karşı sınar; düzeltme YAPMAZ. */
function denetle(e, k, p) {
  const hatalar = [];
  const uyarilar = [];
  const piyasaTipi = PIYASA_TIPLERI.has(e.tip);

  // ── Kimlik ve tür ───────────────────────────────────────────────────────
  if (e.clientOrderId !== null && e.clientOrderId !== undefined) {
    const id = String(e.clientOrderId);
    if (id.length > 36) hatalar.push(hata(HATA.CLIENT_ID_UZUN, `clientOrderId ${id.length} karakter (en çok 36)`, 'clientOrderId'));
    else if (!CLIENT_ID_DESEN.test(id)) hatalar.push(hata(HATA.BILINMEYEN_KARAKTER, `clientOrderId ^[.A-Z:/a-z0-9_-]{1,36}$ desenine uymuyor: "${id}"`, 'clientOrderId'));
  }
  if (e.yon !== 'BUY' && e.yon !== 'SELL') hatalar.push(hata(HATA.GEREKSIZ_PARAMETRE, `yön BUY ya da SELL olmalı: "${e.yon}"`, 'yon'));
  if (k.orderTypes && !k.orderTypes.includes(e.tip)) hatalar.push(hata(HATA.GECERSIZ_EMIR_TIPI, `${k.sembol} için emir tipi yok: ${e.tip}`, 'tip'));
  if (e.timeInForce && k.timeInForce && !k.timeInForce.includes(e.timeInForce)
    && !(e.timeInForce === 'RPI')) hatalar.push(hata(HATA.GECERSIZ_TIF, `timeInForce desteklenmiyor: ${e.timeInForce}`, 'timeInForce'));

  // ── Pozisyon modu ───────────────────────────────────────────────────────
  if (p.hedgeModu === true) {
    if (e.positionSide !== 'LONG' && e.positionSide !== 'SHORT') hatalar.push(hata(HATA.POZISYON_TARAFI, 'Hedge modda positionSide LONG ya da SHORT olmalı', 'positionSide'));
    if (e.reduceOnly) hatalar.push(hata(HATA.GEREKSIZ_PARAMETRE, 'Hedge modda reduceOnly gönderilemez (kapatma: ters yön + aynı positionSide)', 'reduceOnly'));
  } else if (p.hedgeModu === false && e.positionSide && e.positionSide !== 'BOTH') {
    hatalar.push(hata(HATA.POZISYON_TARAFI, `One-way modda positionSide BOTH olmalı: ${e.positionSide}`, 'positionSide'));
  }

  // ── Miktar (LOT_SIZE / MARKET_LOT_SIZE) ─────────────────────────────────
  if (!e.closePosition) {
    const minQ = piyasaTipi ? k.mktMinQty : k.minQty;
    const maxQ = piyasaTipi ? k.mktMaxQty : k.maxQty;
    const adim = piyasaTipi ? k.mktStepSize : k.stepSize;
    const filtre = piyasaTipi ? 'MARKET_LOT_SIZE' : 'LOT_SIZE';
    if (!(e.miktar > 0)) hatalar.push(hata(HATA.MIKTAR_SIFIR, `miktar sıfır ya da negatif: ${e.miktar}`, 'miktar'));
    else {
      if (e.miktar < Number(minQ)) hatalar.push(hata(HATA.MIKTAR_MIN_ALTI, `miktar ${e.miktar} < ${filtre}.minQty ${minQ}`, 'miktar'));
      if (Number(maxQ) > 0 && e.miktar > Number(maxQ)) {
        const parca = Math.ceil(e.miktar / Number(maxQ));
        hatalar.push(hata(HATA.MIKTAR_MAKS_USTU, `miktar ${e.miktar} > ${filtre}.maxQty ${maxQ} (en az ${parca} emre bölünmeli)`, 'miktar'));
      }
      if (e.miktar >= Number(minQ) && !katMi(e.miktar, adim, minQ)) hatalar.push(hata(HATA.MIKTAR_STEP_DISI, `miktar ${e.miktar} ${filtre}.stepSize ${adim} katı değil`, 'miktar'));
      if (Number.isFinite(k.quantityPrecision) && anlamliHane(e.miktar) > k.quantityPrecision) {
        uyarilar.push(`miktarın ondalık hanesi quantityPrecision (${k.quantityPrecision}) üstünde — borsa -4023 yerine -1111 de döndürebilir`);
      }
    }
  }

  // ── Fiyat (PRICE_FILTER + PERCENT_PRICE) ────────────────────────────────
  if (FIYATLI_TIPLER.has(e.tip)) {
    if (!(e.fiyat > 0)) hatalar.push(hata(HATA.FIYAT_SIFIR, `fiyat sıfır ya da negatif: ${e.fiyat}`, 'fiyat'));
    else {
      if (Number(k.minPrice) > 0 && e.fiyat < Number(k.minPrice)) hatalar.push(hata(HATA.FIYAT_MIN_ALTI, `fiyat ${e.fiyat} < minPrice ${k.minPrice}`, 'fiyat'));
      if (Number(k.maxPrice) > 0 && e.fiyat > Number(k.maxPrice)) hatalar.push(hata(HATA.FIYAT_MAKS_USTU, `fiyat ${e.fiyat} > maxPrice ${k.maxPrice}`, 'fiyat'));
      if (!katMi(e.fiyat, k.tickSize, k.minPrice)) hatalar.push(hata(HATA.FIYAT_TICK_DISI, `fiyat ${e.fiyat} tickSize ${k.tickSize} katı değil`, 'fiyat'));
      const mark = Number(p.markFiyati);
      if (Number.isFinite(mark) && mark > 0 && k.pctUp && k.pctDown) {
        // Belge: BUY price <= mark × up, SELL price >= mark × down (dayanak MARK).
        if (e.yon === 'BUY' && e.fiyat > carp(mark, k.pctUp)) hatalar.push(hata(HATA.FIYAT_CARPAN_USTU, `BUY fiyat ${e.fiyat} > mark ${mark} × ${k.pctUp} = ${carp(mark, k.pctUp)}`, 'fiyat'));
        if (e.yon === 'SELL' && e.fiyat < carp(mark, k.pctDown)) hatalar.push(hata(HATA.FIYAT_CARPAN_ALTI, `SELL fiyat ${e.fiyat} < mark ${mark} × ${k.pctDown} = ${carp(mark, k.pctDown)}`, 'fiyat'));
      } else if (k.pctUp) {
        uyarilar.push('mark fiyatı verilmedi — PERCENT_PRICE denetlenemedi');
      }
    }
  }

  // ── Tetik fiyatı ────────────────────────────────────────────────────────
  if (TETIKLI_TIPLER.has(e.tip)) {
    const t = e.tetikFiyati;
    if (!(t > 0)) hatalar.push(hata(HATA.TETIK_SIFIR, `tetik fiyatı sıfır ya da yok: ${t}`, 'tetikFiyati'));
    else {
      if (Number(k.maxPrice) > 0 && t > Number(k.maxPrice)) hatalar.push(hata(HATA.TETIK_MAKS_USTU, `tetik ${t} > maxPrice ${k.maxPrice}`, 'tetikFiyati'));
      if (!katMi(t, k.tickSize, k.minPrice)) hatalar.push(hata(HATA.FIYAT_TICK_DISI, `tetik ${t} tickSize ${k.tickSize} katı değil`, 'tetikFiyati'));
      // Hemen tetiklenir mi? workingType varsayılanı CONTRACT_PRICE (son fiyat).
      const ref = Number(p.calismaFiyati ?? p.sonFiyat);
      if (Number.isFinite(ref) && ref > 0) {
        const stop = e.tip === 'STOP' || e.tip === 'STOP_MARKET';
        const hemen = stop
          ? (e.yon === 'BUY' ? ref >= t : ref <= t)
          : (e.yon === 'BUY' ? ref <= t : ref >= t);
        if (hemen) hatalar.push(hata(HATA.HEMEN_TETIKLENIR, `${e.tip} ${e.yon} tetik ${t}, güncel fiyat ${ref} — hemen tetiklenir`, 'tetikFiyati'));
      }
    }
  }

  // ── MIN_NOTIONAL (reduceOnly / closePosition muaf) ──────────────────────
  if (!e.reduceOnly && !e.closePosition && e.miktar > 0 && k.minNotional > 0) {
    let ref = null, refAd = '';
    if (FIYATLI_TIPLER.has(e.tip)) { ref = e.fiyat; refAd = 'fiyat'; }
    else if (e.tip === 'MARKET' || e.tip === 'TRAILING_STOP_MARKET') { ref = Number(p.markFiyati ?? p.sonFiyat); refAd = 'mark'; }
    else if (TETIKLI_TIPLER.has(e.tip)) { ref = e.tetikFiyati; refAd = 'tetik'; }
    if (Number.isFinite(ref) && ref > 0) {
      const nominal = carp(e.miktar, ref);
      if (nominal < k.minNotional) hatalar.push(hata(HATA.MIN_NOMINAL, `nominal ${nominal} (${refAd} × miktar) < MIN_NOTIONAL ${k.minNotional} (reduceOnly değilse)`, 'miktar'));
    } else {
      uyarilar.push('referans fiyat yok — MIN_NOTIONAL denetlenemedi');
    }
  }

  // ── Piyasa emri fiyat koruması (-4131) ──────────────────────────────────
  if (e.tip === 'MARKET' && k.pctUp && Number(p.markFiyati) > 0) {
    const mark = Number(p.markFiyati);
    if (e.yon === 'BUY' && Number(p.enIyiSatis) > carp(mark, k.pctUp)) hatalar.push(hata(HATA.PIYASA_FIYAT_KORUMASI, `en iyi satış ${p.enIyiSatis} PERCENT_PRICE üstünde`, 'tip'));
    if (e.yon === 'SELL' && Number(p.enIyiAlis) > 0 && Number(p.enIyiAlis) < carp(mark, k.pctDown)) hatalar.push(hata(HATA.PIYASA_FIYAT_KORUMASI, `en iyi alış ${p.enIyiAlis} PERCENT_PRICE altında`, 'tip'));
  }

  // ── Açık emir tavanı ────────────────────────────────────────────────────
  if (Number.isFinite(k.maxNumOrders) && Number.isFinite(Number(p.acikEmirSayisi)) && Number(p.acikEmirSayisi) >= k.maxNumOrders) {
    hatalar.push(hata(HATA.MAKS_ACIK_EMIR, `açık emir sayısı ${p.acikEmirSayisi} ≥ MAX_NUM_ORDERS ${k.maxNumOrders}`, 'sembol'));
  }

  return { hatalar, uyarilar };
}

/**
 * EMİR DOĞRULAMA — emir gönderilmeden önce Binance'in reddedeceği her şey.
 *
 * @param emir     { sembol, tip, yon, fiyat, miktar, tetikFiyati, reduceOnly,
 *                   closePosition, positionSide, timeInForce, clientOrderId,
 *                   yuvarlama?: { fiyat, tetik } }  (Binance adları da kabul:
 *                   symbol/type/side/price/quantity/stopPrice/newClientOrderId)
 * @param kurallar sembol kuralı ya da `kurallarKur` çıktısı (o zaman emir.sembol gerekir)
 * @param piyasa   { markFiyati, sonFiyat, calismaFiyati, enIyiAlis, enIyiSatis,
 *                   hedgeModu, acikEmirSayisi }  — hepsi isteğe bağlı
 * @returns { gecerli, hatalar[], uyarilar[], duzeltilmis, duzeltmeler[], duzeltmeHatalari[] }
 *   gecerli      : emir OLDUĞU GİBİ gönderilse kabul edilir mi
 *   duzeltilmis  : yuvarlanmış emir (Binance alan adlarıyla da: price/quantity/stopPrice)
 *                  — yuvarlama sonrası da geçersizse null, sebep duzeltmeHatalari'nda
 */
function emirDogrula(emir, kurallar, piyasa = {}) {
  const e = emirNormalize(emir);
  const k = sembolKurali(kurallar, e.sembol);
  if (!k) {
    return {
      gecerli: false, duzeltilmis: null, duzeltmeler: [], uyarilar: [], duzeltmeHatalari: [],
      hatalar: [{ kod: null, ad: 'KURAL_YOK', mesaj: `sembol kuralı bulunamadı: ${e.sembol}`, alan: 'sembol', kodDogrulandi: false }]
    };
  }
  const p = piyasa || {};
  const ilk = denetle(e, k, p);

  // ── Düzeltme: yalnızca yuvarlama; miktar ASLA büyütülmez ────────────────
  const yonler = { ...varsayilanYonler(e.tip, e.yon), ...(e.yuvarlama || {}) };
  const d = { ...e };
  const duzeltmeler = [];
  if (FIYATLI_TIPLER.has(e.tip) && e.fiyat > 0) {
    d.fiyat = fiyatYuvarla(k, e.fiyat, yonler.fiyat);
    if (d.fiyat !== e.fiyat) duzeltmeler.push(`fiyat ${e.fiyat} → ${d.fiyat} (${yonler.fiyat})`);
  }
  if (TETIKLI_TIPLER.has(e.tip) && e.tetikFiyati > 0) {
    d.tetikFiyati = fiyatYuvarla(k, e.tetikFiyati, yonler.tetik);
    if (d.tetikFiyati !== e.tetikFiyati) duzeltmeler.push(`tetik ${e.tetikFiyati} → ${d.tetikFiyati} (${yonler.tetik})`);
  }
  if (!e.closePosition && e.miktar > 0) {
    d.miktar = miktarYuvarla(k, e.miktar, { piyasa: PIYASA_TIPLERI.has(e.tip) });
    if (d.miktar !== e.miktar) duzeltmeler.push(`miktar ${e.miktar} → ${d.miktar} (aşağı)`);
  }
  const ikinci = ilk.hatalar.length ? denetle(d, k, p) : ilk;
  const duzeltilmis = ikinci.hatalar.length ? null : {
    sembol: k.sembol, tip: d.tip, yon: d.yon, fiyat: d.fiyat, miktar: d.miktar, tetikFiyati: d.tetikFiyati,
    reduceOnly: d.reduceOnly, closePosition: d.closePosition, positionSide: d.positionSide,
    timeInForce: d.timeInForce, clientOrderId: d.clientOrderId,
    // Binance alan adlarıyla da (ccxt/REST'e doğrudan geçirilebilsin):
    symbol: k.sembol, type: d.tip, side: d.yon, price: d.fiyat, quantity: d.miktar, stopPrice: d.tetikFiyati
  };

  return {
    gecerli: ilk.hatalar.length === 0,
    hatalar: ilk.hatalar,
    uyarilar: ilk.uyarilar,
    duzeltilmis,
    duzeltmeler,
    duzeltmeHatalari: ikinci === ilk ? [] : ikinci.hatalar
  };
}

/**
 * Deterministik clientOrderId: `^[.A-Z:/a-z0-9_-]{1,36}$` desenine uyar.
 * Aynı (botId, sıra) aynı kimliği üretir — 503 "bilinmeyen sonuç" sonrası
 * emir bu kimlikle sorgulanabilsin diye. Uzunsa botId kırpılır, sıra korunur.
 */
function clientOrderIdUret(botId, sira) {
  const temiz = String(botId || 'bot').replace(/[^.A-Z:/a-z0-9_-]/g, '_');
  const kuyruk = '-' + String(sira);
  if (kuyruk.length > 30) throw new Error('sıra numarası çok uzun');
  return temiz.slice(0, 36 - kuyruk.length) + kuyruk;
}

function clientOrderIdGecerliMi(id) {
  return typeof id === 'string' && CLIENT_ID_DESEN.test(id);
}

module.exports = {
  emirNormalize, fiyatYuvarla, miktarYuvarla, minMiktar, varsayilanYonler,
  emirDogrula, clientOrderIdUret, clientOrderIdGecerliMi,
  PIYASA_TIPLERI, FIYATLI_TIPLER, TETIKLI_TIPLER
};
