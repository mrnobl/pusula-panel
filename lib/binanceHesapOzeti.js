/**
 * BINANCE BAKİYE KIRILIMI (64.5, 64.6) — Botlar › Hücum "Binance bakiyesi" + İşlemler paneli (açık pozisyonlar / bekleyen emirler).
 * YALNIZ OKUMA; emir vermez, botun kararına girmez.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Kullanıcı (2026-10-15): Binance "Avbl 4.888,84 USDT" ↔ Pusula "Hesap değeri 4.949 USDT" farkı. İkisi de doğru, farklı şeyler:
 *   Hesap değeri = Marj bakiyesi (Margin Balance) = cüzdan + gerçekleşmemiş K/Z
 *   Avbl (Available Balance) = Marj bakiyesi − toplam başlangıç teminatı (totalInitialMargin = pozisyon + açık emir teminatı)
 *   4.888,84 + 58,52 (8 pozisyonun teminatı) + 1,43 (XRP alış limitinin teminatı) = 4.948,79 ≈ 4.949
 * Paneldeki "Kullanılabilir", Binance'in `availableBalance` alanının KENDİSİDİR (hesaplanmaz). Denklem yalnız açıklama/denetim:
 * Binance alanları aynı anda hesaplanmadığı için kuruş farkları olur → tolerans max(0,50 $, marj bakiyesinin %0,01'i) (64.6;
 * 64.5'teki 0,01 $ eşiği "EŞLEŞMİYOR fark −0,11" yanlış alarmı verdi).
 *
 * 64.6 TEMİNAT: pozisyonun teminatı (Binance Positions "Margin") = `positionInitialMargin`. `initialMargin` o sembolün AÇIK EMİR
 * teminatını da içerir (XRP: 2,86 + alış limitinin 1,43 = 4,29 — 64.5 hatası). Kaldıraç HESAPLANMAZ: Binance'in `leverage` alanı
 * (/fapi/v2/account positions ya da positionRisk v2; ikisinde de yoksa /fapi/v1/symbolConfig).
 *
 * Saf fonksiyonlar (`ozetle`) + borsadan okuma (`oku`). Yanıtta API anahtarı / imza / ham gövde YOK — yalnız sayılar.
 */
'use strict';

const sayi = (x) => { const v = +x; return Number.isFinite(v) ? v : null; };
/** Kuruş eşiği (marj ↔ cüzdan + K/Z denetimi). */
const ESIK = 0.01;
/** Avbl özdeşliği toleransı: Binance alanları farklı anlarda hesaplanır. */
const tolerans = (marj) => Math.max(0.5, Math.abs(marj || 0) * 1e-4);

/** Binance arayüzündeki adlarıyla bakiye alanları (sıra = panelde gösterim sırası). */
const ALANLAR = [
  ['cuzdan', 'totalWalletBalance', 'Cüzdan bakiyesi', 'Wallet Balance'],
  ['gerceklesmemis', 'totalUnrealizedProfit', 'Gerçekleşmemiş K/Z', 'Unrealized PNL'],
  ['marj', 'totalMarginBalance', 'Marj bakiyesi = Hesap değeri', 'Margin Balance'],
  ['pozisyonTeminati', 'totalPositionInitialMargin', 'Pozisyon teminatı', 'Position Initial Margin'],
  ['emirTeminati', 'totalOpenOrderInitialMargin', 'Açık emir teminatı', 'Open Order Initial Margin'],
  ['toplamTeminat', 'totalInitialMargin', 'Toplam başlangıç teminatı', 'Total Initial Margin'],
  ['kullanilabilir', 'availableBalance', 'Kullanılabilir', 'Avbl / Available Balance'],
];

const bizimMi = (id) => /^ag-/.test(String(id || ''));
/** Binance kimliği → ccxt sembolü ('1000PEPEUSDT' → '1000PEPE/USDT:USDT'); `cevir` verilirse o (pazar tablosu). */
const sembolVarsayilan = (id) => { const m = /^(.+?)(USDT|USDC)$/.exec(String(id || '')); return m ? `${m[1]}/${m[2]}:${m[2]}` : String(id || ''); };

/**
 * @param {object} hesap    GET /fapi/v2|v3/account gövdesi (v2 positions: positionInitialMargin + leverage)
 * @param {object[]} risk   GET /fapi/v2|v3/positionRisk gövdesi (işaret fiyatı, başabaş, likidasyon)
 * @param {object[]} acik   GET /fapi/v1/openOrders gövdesi (temel emirler)
 * @param {object[]|null} algo GET /fapi/v1/openAlgoOrders gövdesi (koşullu: stop/TP) — okunamadıysa null
 * @param {{ kaldiraclar?: Object<string,number>, sembol?: (id:string)=>string }} ek  symbolConfig kaldıraçları, sembol çevirici
 */
function ozetle(hesap, risk, acik, algo, ek = {}) {
  const h = hesap || {};
  const sem = typeof ek.sembol === 'function' ? ek.sembol : sembolVarsayilan;
  const bakiye = {};
  for (const [k, alan] of ALANLAR) bakiye[k] = sayi(h[alan]);
  if (bakiye.toplamTeminat == null && bakiye.pozisyonTeminati != null && bakiye.emirTeminati != null) bakiye.toplamTeminat = bakiye.pozisyonTeminati + bakiye.emirTeminati;
  bakiye.cekilebilir = sayi(h.maxWithdrawAmount);
  bakiye.bakimTeminati = sayi(h.totalMaintMargin);

  // Özdeşlik (denetim; panel Avbl'yi hesaplamaz): Kullanılabilir ≈ Marj bakiyesi − toplam başlangıç teminatı
  const { marj, toplamTeminat: tt, kullanilabilir: av, cuzdan, gerceklesmemis: up } = bakiye;
  let kimlik = null;
  if ([marj, tt, av].every(v => v != null)) {
    const hesaplanan = marj - tt;
    const fark = av - hesaplanan;
    const tol = tolerans(marj);
    kimlik = { hesaplanan, fark, tolerans: tol, eslesiyor: Math.abs(fark) <= tol };
  }
  const marjKimlik = cuzdan != null && up != null && marj != null ? { fark: marj - (cuzdan + up), eslesiyor: Math.abs(marj - (cuzdan + up)) <= tolerans(marj) } : null;

  // Pozisyonlar: hesap.positions (positionInitialMargin, leverage) + positionRisk (işaret fiyatı, başabaş, likidasyon)
  const anahtar = (p) => `${p.symbol}|${p.positionSide || 'BOTH'}`;
  const riskM = new Map((Array.isArray(risk) ? risk : []).map(p => [anahtar(p), p]));
  const kaynak = Array.isArray(h.positions) && h.positions.length ? h.positions : (Array.isArray(risk) ? risk : []);
  const kaldiraclar = ek.kaldiraclar || {};
  const pozisyonlar = [];
  for (const p of kaynak) {
    const r = riskM.get(anahtar(p)) || {};
    const miktar = sayi(p.positionAmt ?? r.positionAmt);
    if (!miktar) continue;
    const mark = sayi(r.markPrice ?? p.markPrice);
    const nominal = sayi(r.notional ?? p.notional) ?? (mark != null ? miktar * mark : null);
    const kz = sayi(p.unrealizedProfit ?? r.unRealizedProfit ?? r.unrealizedProfit);
    const izole = String(r.marginType || '').toLowerCase() === 'isolated' || p.isolated === true || (sayi(r.isolatedWallet ?? p.isolatedWallet) || 0) > 0;
    // Binance Positions "Margin": çaprazda positionInitialMargin (initialMargin DEĞİL — o açık emir teminatını da içerir); izolede isolatedMargin.
    let teminat = sayi(p.positionInitialMargin ?? r.positionInitialMargin);
    if (teminat == null) {
      const im = sayi(p.initialMargin ?? r.initialMargin), oim = sayi(p.openOrderInitialMargin ?? r.openOrderInitialMargin);
      teminat = im != null ? im - (oim || 0) : null;
    }
    if (izole) teminat = sayi(r.isolatedMargin ?? p.isolatedWallet) ?? teminat;
    const kaldirac = sayi(p.leverage ?? r.leverage ?? kaldiraclar[p.symbol]);
    pozisyonlar.push({
      symbol: p.symbol, sembol: sem(p.symbol), yon: miktar < 0 ? 'SHORT' : 'LONG', miktar, giris: sayi(p.entryPrice ?? r.entryPrice),
      basabas: sayi(r.breakEvenPrice ?? p.breakEvenPrice) || null, mark, likidasyon: sayi(r.liquidationPrice) || null, kz,
      roi: kz != null && teminat > 0 ? kz / teminat : null, teminat, kaldirac, nominal: nominal != null ? Math.abs(nominal) : null, marjTipi: izole ? 'izole' : 'çapraz',
    });
  }
  pozisyonlar.sort((a, b) => (b.teminat || 0) - (a.teminat || 0));
  const pozTeminatToplam = pozisyonlar.reduce((a, p) => a + (p.teminat || 0), 0);

  const temel = (Array.isArray(acik) ? acik : []).map(o => ({
    tur: 'temel', symbol: o.symbol, sembol: sem(o.symbol), side: String(o.side || '').toLowerCase(), tip: o.type || o.origType || null, fiyat: sayi(o.price) || null,
    tetik: sayi(o.stopPrice) || null, miktar: sayi(o.origQty), dolan: sayi(o.executedQty), reduceOnly: !!o.reduceOnly || !!o.closePosition,
    zaman: sayi(o.time ?? o.updateTime), kimlik: o.clientOrderId || null, bizim: bizimMi(o.clientOrderId), tif: o.timeInForce || null,
  }));
  const kosullu = algo == null ? null : (Array.isArray(algo) ? algo : (algo.orders || [])).map(o => ({
    tur: 'koşullu', symbol: o.symbol, sembol: sem(o.symbol), side: String(o.side || '').toLowerCase(), tip: o.orderType || o.type || o.algoType || null, fiyat: sayi(o.price) || null,
    tetik: sayi(o.triggerPrice ?? o.stopPrice) || null, miktar: o.closePosition ? null : sayi(o.quantity ?? o.origQty), dolan: null,
    reduceOnly: !!o.reduceOnly || !!o.closePosition, tumPozisyon: !!o.closePosition, calismaTipi: o.workingType || null,
    zaman: sayi(o.createTime ?? o.time ?? o.updateTime), kimlik: o.clientAlgoId ?? o.clientOrderId ?? null, bizim: bizimMi(o.clientAlgoId ?? o.clientOrderId), tif: o.timeInForce || null,
  }));

  return { bakiye, kimlik, marjKimlik, pozisyonlar, pozTeminatToplam, emirler: { temel, kosullu }, esik: ESIK };
}

/** ccxt örtük uçları; yoksa (kâğıt borsa) null. */
function binanceMi(borsa) {
  return !!borsa && typeof borsa.fapiPrivateV2GetAccount === 'function' && typeof borsa.fapiPrivateGetOpenOrders === 'function';
}

/**
 * Borsadan okur (4–5 GET). `istek(fn)` yürütücünün hız/geri çekilme kapısı (y.borsaIstegi) — 418/429'da bot da korunur.
 * Hesap v2 önce (positions: positionInitialMargin + leverage), positionRisk v3 önce (işaret fiyatı, başabaş). Kaldıraç ikisinde de
 * yoksa /fapi/v1/symbolConfig. Koşullu emir listesi okunamazsa kosullu = null + uyarı; kırılım yine döner.
 */
async function oku(borsa, istek = (fn) => fn()) {
  if (!binanceMi(borsa)) throw new Error('Binance hesabı değil (kâğıt hesap) — Binance bakiye kırılımı yok');
  const dene = async (a, b) => { try { return await istek(a); } catch (e) { if (!b) throw e; return istek(b); } };
  const v3 = (ad) => (typeof borsa[ad] === 'function' ? () => borsa[ad]() : null);
  const [hesap, risk, acik] = await Promise.all([
    dene(() => borsa.fapiPrivateV2GetAccount(), v3('fapiPrivateV3GetAccount')),
    v3('fapiPrivateV3GetPositionRisk') ? dene(v3('fapiPrivateV3GetPositionRisk'), () => borsa.fapiPrivateV2GetPositionRisk()) : istek(() => borsa.fapiPrivateV2GetPositionRisk()),
    istek(() => borsa.fapiPrivateGetOpenOrders()),
  ]);
  let algo = null, algoHata = null;
  if (typeof borsa.fapiPrivateGetOpenAlgoOrders === 'function') {
    try { algo = await istek(() => borsa.fapiPrivateGetOpenAlgoOrders()); } catch (e) { algoHata = String(e && e.message || e).slice(0, 160); }
  } else algoHata = 'ccxt sürümünde koşullu emir listesi yok';
  // Kaldıraç: hesap/risk satırında yoksa symbolConfig (Binance'in kendi ayarı; hesaplanmaz)
  let kaldiraclar = {};
  const acikPoz = (Array.isArray(hesap && hesap.positions) ? hesap.positions : []).filter(p => +p.positionAmt);
  const riskKal = new Set((Array.isArray(risk) ? risk : []).filter(r => r.leverage != null).map(r => r.symbol));
  if (acikPoz.some(p => p.leverage == null && !riskKal.has(p.symbol)) && typeof borsa.fapiPrivateGetSymbolConfig === 'function') {
    try { for (const c of (await istek(() => borsa.fapiPrivateGetSymbolConfig())) || []) if (c && c.symbol) kaldiraclar[c.symbol] = +c.leverage; } catch { kaldiraclar = {}; }
  }
  const sembol = (id) => { try { const m = borsa.markets_by_id && borsa.markets_by_id[id]; const x = Array.isArray(m) ? m.find(y => y.linear !== false) || m[0] : m; return (x && x.symbol) || sembolVarsayilan(id); } catch { return sembolVarsayilan(id); } };
  return { ...ozetle(hesap, risk, acik, algo, { kaldiraclar, sembol }), algoHata };
}

module.exports = { ozetle, oku, binanceMi, ALANLAR, ESIK, tolerans, sembolVarsayilan };
