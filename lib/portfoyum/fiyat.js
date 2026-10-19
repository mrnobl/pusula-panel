/**
 * PORTFÖYÜM — FİYAT VE KUR (sürüm 60.8) — sıfır bütçe, hepsi ücretsiz kaynak
 * ═══════════════════════════════════════════════════════════════════════════
 * Değerleme DİSKTEKİ serilerden yapılır (hızlı, ağsız, tekrarlanabilir); ağ yalnız "Fiyatları yenile" ve kur çevirici
 * isteğinde kullanılır. Mevcut portföy laboratuvarı dosyaları YENİDEN KULLANILIR (ikinci indirici yok):
 *   yahoo   data/portfoy/yahoo/<SEMBOL>.json (lib/portfoy/indir.js yahooIndir — artımlı) > data/nasdaq > data/gercek-varlik.
 *           Fiyat = günlük KAPANIŞ `c` (temettüsüz; temettü işlem olarak girilir). Yahoo kapanışı BÖLÜNMEYE GÖRE geriye
 *           düzeltilmiştir; kullanıcının girdiği bölünme kayıtlarıyla bölünme öncesi fiyat gerçek fiyata geri çevrilir.
 *   tefas   data/portfoy/tefas | tefas-ek (lib/portfoy/kaynaklar.js tefasFonOku), TRY.
 *   binance data/market.db Binance günlük spot kapanışı (yoksa perp) + son fiyat önbelleği (data/portfoyum/fiyat-onbellek.json,
 *           GET api.binance.com/api/v3/ticker/price — açık uç, anahtarsız).
 *   altin   gram altın TL = GC=F kapanışı (USD/ons) × USD/TRY ÷ 31,1035.
 *   elle    yalnız elle fiyat kayıtları.
 * Her kaynağa ek olarak: elle fiyat kayıtları (aynı gün kaynağın önüne geçer) ve alış/satış işlem fiyatları (kaynakta o gün
 * veri yoksa nokta olarak).
 *
 * KUR: USD/TRY data/portfoy/USDTRY_X.json, EURUSD / GBPUSD / GC=F Yahoo dosyaları; kur çevirici önbelleği
 * (data/portfoyum/kurlar.json — Yahoo chart meta.regularMarketPrice + Binance BTCUSDT) bugünün noktası olarak eklenir.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('./model');

const ONS_GRAM = 31.1035;
const BAYAT_GUN = { yahoo: 5, tefas: 6, binance: 2, altin: 5, elle: 31, islem: 31 };
const KUR_SEMBOL = { TRY: 'USDTRY=X', EUR: 'EURUSD=X', GBP: 'GBPUSD=X', ALTIN: 'GC=F' };
const KUR_TAZE_MS = 10 * 60 * 1000;

const K = () => require('../portfoy/kaynaklar');
const PO = () => require('../portfoy/ortak');

/** Seri: artan [[gunMs, fiyat, kaynakEtiketi]]. */
function siraliBirlestir(...diziler) {
  const m = new Map();
  for (const d of diziler) for (const n of d || []) m.set(n[0], n);   // sonraki dizi aynı günü ezer
  return [...m.values()].sort((a, b) => a[0] - b[0]);
}

/** Yahoo dosyasından kapanış serisi (c; eski 'seri' biçiminde düzeltilmiş kapanış). */
function yahooSeri(sembol) {
  let b;
  try { b = K().yahooBul(sembol); } catch (e) { b = null; }
  if (!b) return { noktalar: [], para: null, dosya: null };
  let j;
  try { j = JSON.parse(fs.readFileSync(b.dosya, 'utf8')); } catch (e) { return { noktalar: [], para: null, dosya: b.dosya, hata: e.message }; }
  let noktalar;
  if (Array.isArray(j.gunler)) noktalar = j.gunler.filter(g => g.c > 0).map(g => [g.t, g.c, 'yahoo']);
  else if (Array.isArray(j.seri)) noktalar = j.seri.filter(x => x[1] > 0).map(([d, v]) => [M.gunMs(d), v, 'yahoo']);
  else noktalar = [];
  return { noktalar, para: j.para || null, dosya: b.dosya, indirme: j.indirme || null, bolunme: Array.isArray(j.bolunme) ? j.bolunme : [] };
}

function tefasSeri(kod) {
  let x = null;
  try { x = K().tefasFonOku(String(kod).toUpperCase()); } catch (e) { x = null; }
  return { noktalar: (x || []).map(g => [g.t, g.fiyat, 'tefas']), para: 'TRY' };
}

function binanceSeri(kod, onbellek) {
  const c = String(kod).toUpperCase().replace(/USDT$/, '');
  let satirlar = [];
  for (const [pazar, sembol] of [['spot', `${c}/USDT`], ['perp', `${c}/USDT:USDT`]]) {
    try { satirlar = K().KAYNAKLAR.kripto.seviye({ kimlik: 'kripto:' + c, ek: { pazar, sembol } }).satirlar; } catch (e) { satirlar = []; }
    if (satirlar.length) break;
  }
  const noktalar = satirlar.map(s => [s.t, s.v, 'binance']);
  const son = onbellek && onbellek[c];
  if (son && son.fiyat > 0 && son.zaman) noktalar.push([M.gunMs(M.yerelGun(Date.parse(son.zaman))), son.fiyat, 'binance']);
  return { noktalar: siraliBirlestir(noktalar), para: 'USD' };
}

/** Kur serileri (USD başına TRY; EUR/GBP için 1 birimin USD değeri; ALTIN ons USD). */
function kurSerileri(kurOnbellek) {
  const s = {};
  const oku = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
  const usdtry = oku(PO().yollar().usdtry);
  s.TRY = usdtry && Array.isArray(usdtry.gunler) ? usdtry.gunler.filter(g => g.c > 0).map(g => [g.t, g.c, 'yahoo']) : [];
  s.EUR = yahooSeri('EURUSD=X').noktalar;
  s.GBP = yahooSeri('GBPUSD=X').noktalar;
  s.ALTIN = yahooSeri('GC=F').noktalar;
  const k = kurOnbellek && kurOnbellek.kurlar;
  if (k) {
    const gun = (z) => M.gunMs(M.yerelGun(Date.parse(z)));
    for (const [ad, alan] of [['TRY', 'USDTRY'], ['EUR', 'EURUSD'], ['GBP', 'GBPUSD'], ['ALTIN', 'XAUUSD']]) {
      const x = k[alan];
      if (x && x.deger > 0 && x.zaman && x.canli) s[ad] = siraliBirlestir(s[ad], [[gun(x.zaman), x.deger, 'canli']]);
    }
  }
  return s;
}

/** Artan seride t'ye eşit ya da önceki son nokta (ikili arama). Yoksa null. */
function oncekiNokta(seri, t) {
  let lo = 0, hi = seri.length - 1, sonuc = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (seri[m][0] <= t) { sonuc = seri[m]; lo = m + 1; } else hi = m - 1; }
  return sonuc;
}

/** Kur: 1 birim `para`nın USD değeri t gününde. { deger, tarih, kaynak } | null. */
function usdDegeri(para, t, kurlar) {
  if (para === 'USD') return { deger: 1, tarih: null, kaynak: 'sabit' };
  const seri = kurlar[para];
  if (!seri || !seri.length) return null;
  // Kur serisi başlamadan önceki gün: GELECEKTEKİ ilk kur KULLANILMAZ (denetim 2026-10-09) → null (değer yok + uyarı).
  const n = oncekiNokta(seri, t);
  if (!n) return null;
  const d = para === 'TRY' ? 1 / n[1] : n[1];
  return { deger: d, tarih: M.msGun(n[0]), kaynak: n[2], yasGun: Math.round((t - n[0]) / 864e5) };
}
/** USD/TRY t gününde. */
function usdtry(t, kurlar) {
  const s = kurlar.TRY;
  if (!s || !s.length) return null;
  const n = oncekiNokta(s, t);
  if (!n) return null;
  return { deger: n[1], tarih: M.msGun(n[0]), kaynak: n[2], yasGun: Math.round((t - n[0]) / 864e5) };
}

/**
 * Varlığın fiyat serisi. Döndürür: { noktalar: [[t, fiyat, kaynak]], para, kaynak, uyari? }.
 *   v: varlık; elleFiyatlar: [{tarih, fiyat}]; islemFiyatlari: [{tarih, fiyat}]; bolunmeler: [{tarih, oran}] (yahoo düzeltmesi)
 */
function varlikSerisi(v, { elleFiyatlar = [], islemFiyatlari = [], bolunmeler = [], kurlar = {}, binanceOnbellek = null, ilkTarih = null } = {}) {
  let kaynakSeri = [], para = v.para, uyari = null, bolunmeUyari = null;
  if (v.kaynak === 'yahoo') {
    const y = yahooSeri(v.kod || v.sembol);
    kaynakSeri = y.noktalar;
    // Kaynak para birimi varlıktan farklıysa fiyat KULLANILMAZ (yanlış birimde değer üretmesin) ve uyarı her durumda.
    if (y.para && y.para !== v.para) { uyari = `Yahoo ${v.kod || v.sembol} fiyatı ${y.para}, varlık ${v.para} — para birimi uyuşmazlığı: kaynak fiyatı KULLANILMIYOR (varlığı doğru birimle yeniden ekleyin)`; kaynakSeri = []; }
    if (!y.dosya) uyari = `Yahoo dosyası yok (${v.kod || v.sembol}) — "Fiyatları yenile" ile indirin`;
    // Yahoo'da bölünme var ama kayıt yok → adet yanlış olabilir (bölünme kaydı ±5 gün içinde aranır).
    const ilkT = ilkTarih ? M.gunMs(ilkTarih) : null;
    const kayitli = bolunmeler.map(b => M.gunMs(b.tarih));
    const eksikBolunme = (y.bolunme || []).filter(b => (ilkT == null || b.t > ilkT) && !kayitli.some(t => Math.abs(t - b.t) <= 5 * 864e5));
    if (eksikBolunme.length) bolunmeUyari = `Yahoo'da ${eksikBolunme.map(b => `${M.msGun(b.t)} ${b.oran}`).join(', ')} bölünmesi var ama bölünme kaydı yok — adet ve maliyet yanlış olabilir ("Bölünme" işlemi girin)`;
    // Bölünme öncesi gerçek fiyat: Yahoo kapanışı sonraki bölünmelerin oranıyla çarpılır.
    const bl = bolunmeler.filter(b => b.oran > 0).map(b => [M.gunMs(b.tarih), b.oran]).sort((a, b) => a[0] - b[0]);
    if (bl.length) kaynakSeri = kaynakSeri.map(([t, f, k]) => { let c = 1; for (const [bt, o] of bl) if (bt > t) c *= o; return [t, f * c, k]; });
  } else if (v.kaynak === 'tefas') {
    kaynakSeri = tefasSeri(v.kod || v.sembol).noktalar;
    if (!kaynakSeri.length) uyari = `TEFAS fon dosyası yok (${v.kod || v.sembol}) — "Fiyatları yenile" ile indirin`;
  } else if (v.kaynak === 'binance') {
    kaynakSeri = binanceSeri(v.kod || v.sembol, binanceOnbellek).noktalar;
    if (!kaynakSeri.length) uyari = `Binance fiyatı yok (${v.kod || v.sembol}) — "Fiyatları yenile"`;
  } else if (v.kaynak === 'altin') {
    const g = kurlar.ALTIN || [], tr = kurlar.TRY || [];
    kaynakSeri = [];
    for (const n of g) { const k = oncekiNokta(tr, n[0]); if (k) kaynakSeri.push([n[0], n[1] * k[1] / ONS_GRAM, 'altin']); }
    if (!kaynakSeri.length) uyari = 'GC=F ya da USD/TRY verisi yok';
  }
  const islemN = islemFiyatlari.filter(x => x.fiyat > 0).map(x => [M.gunMs(x.tarih), x.fiyat, 'islem']);
  const elleN = elleFiyatlar.map(x => [M.gunMs(x.tarih), x.fiyat, 'elle']);
  // İşlem fiyatı yalnız kaynağın O GÜN verisi yoksa; elle fiyat her zaman önde.
  const kaynakGunleri = new Set(kaynakSeri.map(n => n[0]));
  const noktalar = siraliBirlestir(islemN.filter(n => !kaynakGunleri.has(n[0])), kaynakSeri, elleN);
  const kaynakSon = kaynakSeri.length ? kaynakSeri[kaynakSeri.length - 1][0] : null;
  return { noktalar, para, kaynak: v.kaynak, uyari, bolunmeUyari, kaynakSon };
}

/** Bir günün fiyatı + bayatlık. */
function fiyatTarihte(seri, t, bugunMs) {
  const n = oncekiNokta(seri.noktalar, t);
  if (!n) return null;
  const yas = Math.round(((bugunMs != null ? bugunMs : t) - n[0]) / 864e5);
  return { fiyat: n[1], tarih: M.msGun(n[0]), kaynak: n[2], yasGun: yas, bayat: yas > (BAYAT_GUN[n[2]] || 5) };
}

// ═══ KUR ÇEVİRİCİ ═══════════════════════════════════════════════════════════
/** Birimler: 1 birimin USD değeri. */
const BIRIMLER = {
  USD: { ad: 'ABD doları', simge: '$' }, TRY: { ad: 'Türk lirası', simge: '₺' }, EUR: { ad: 'Euro', simge: '€' },
  GBP: { ad: 'İngiliz sterlini', simge: '£' }, ALTIN_GR: { ad: 'Gram altın', simge: 'gr' }, BTC: { ad: 'Bitcoin', simge: '₿' }
};

/** Saf: miktar `kaynak` biriminden `hedef`e. degerler: { USD:1, TRY: x, … } (1 birimin USD değeri). */
function cevir(miktar, kaynak, hedef, degerler) {
  const a = degerler && degerler[kaynak], b = degerler && degerler[hedef];
  if (!(Number.isFinite(miktar) && a > 0 && b > 0)) return null;
  return miktar * a / b;
}

/** Kur önbelleğinden + disk serilerinden birim değerleri (USD) ve kaynak/saat bilgisi. */
function kurTablosu(kurOnbellek) {
  const s = kurSerileri(null);
  const son = (seri) => (seri && seri.length ? seri[seri.length - 1] : null);
  const k = (kurOnbellek && kurOnbellek.kurlar) || {};
  const sat = (alan, seri, ters, etiket) => {
    const c = k[alan];
    if (c && c.deger > 0) return { ham: c.deger, kaynak: c.kaynak, zaman: c.zaman, canli: !!c.canli };
    const n = son(seri);
    return n ? { ham: n[1], kaynak: `${etiket} — diskteki son günlük kapanış`, zaman: new Date(n[0]).toISOString(), canli: false, tarih: M.msGun(n[0]) } : null;
  };
  const tr = sat('USDTRY', s.TRY, false, 'Yahoo USDTRY=X');
  const eu = sat('EURUSD', s.EUR, false, 'Yahoo EURUSD=X');
  const gb = sat('GBPUSD', s.GBP, false, 'Yahoo GBPUSD=X');
  const au = sat('XAUUSD', s.ALTIN, false, 'Yahoo GC=F');
  const bt = k.BTCUSD && k.BTCUSD.deger > 0 ? { ham: k.BTCUSD.deger, kaynak: k.BTCUSD.kaynak, zaman: k.BTCUSD.zaman, canli: !!k.BTCUSD.canli } : (() => {
    const b = binanceSeri('BTC', null).noktalar; const n = son(b);
    return n ? { ham: n[1], kaynak: 'Binance BTC/USDT — diskteki son günlük kapanış', zaman: new Date(n[0]).toISOString(), canli: false } : null;
  })();
  const n = (x, b) => x.toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b });
  const degerler = { USD: 1 };
  const bilgi = { USD: { kaynak: 'sabit', zaman: null, gosterim: '1 USD' } };
  if (tr) { degerler.TRY = 1 / tr.ham; bilgi.TRY = { ...tr, gosterim: `1 USD = ${n(tr.ham, 4)} TRY` }; }
  if (eu) { degerler.EUR = eu.ham; bilgi.EUR = { ...eu, gosterim: `1 EUR = ${n(eu.ham, 4)} USD` }; }
  if (gb) { degerler.GBP = gb.ham; bilgi.GBP = { ...gb, gosterim: `1 GBP = ${n(gb.ham, 4)} USD` }; }
  if (au) { degerler.ALTIN_GR = au.ham / ONS_GRAM; bilgi.ALTIN_GR = { ...au, kaynak: `${au.kaynak} — 1 ons ${n(au.ham, 2)} USD ÷ 31,1035`, gosterim: `1 gr = ${n(au.ham / ONS_GRAM, 2)} USD` }; }
  if (bt) { degerler.BTC = bt.ham; bilgi.BTC = { ...bt, gosterim: `1 BTC = ${n(bt.ham, 0)} USD` }; }
  return { degerler, bilgi, birimler: BIRIMLER, uretim: new Date().toISOString() };
}

/** Yahoo son fiyatı (meta.regularMarketPrice). */
async function yahooSon(sembol, fetchFn) {
  const r = await fetchFn(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sembol)}?range=1d&interval=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Yahoo ${sembol}: HTTP ${r.status}`);
  const j = await r.json();
  const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!m || !(m.regularMarketPrice > 0)) throw new Error(`Yahoo ${sembol}: fiyat yok`);
  return { deger: m.regularMarketPrice, zaman: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : new Date().toISOString() };
}
/** Binance açık fiyat ucu (anahtarsız). */
async function binanceSon(sembol, fetchFn) {
  const r = await fetchFn(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(sembol)}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Binance ${sembol}: HTTP ${r.status}`);
  const j = await r.json();
  const f = Number(j && j.price);
  if (!(f > 0)) throw new Error(`Binance ${sembol}: fiyat yok`);
  return { deger: f, zaman: new Date().toISOString() };
}

/**
 * Kur önbelleğini tazeler (ağ). Başarısız kalem önbellekteki eski değerini korur. Döndürür: yeni önbellek nesnesi.
 *   ops.fetch (test), ops.zorla
 */
async function kurlariTazele(eski, ops = {}) {
  const fetchFn = ops.fetch || ((...a) => globalThis.fetch(...a));
  const simdi = ops.simdi ? ops.simdi() : Date.now();
  if (!ops.zorla && eski && eski.zaman && simdi - Date.parse(eski.zaman) < KUR_TAZE_MS) return eski;
  const kurlar = { ...((eski && eski.kurlar) || {}) };
  const hatalar = [];
  const isler = [
    ['USDTRY', () => yahooSon('USDTRY=X', fetchFn), 'Yahoo USDTRY=X'],
    ['EURUSD', () => yahooSon('EURUSD=X', fetchFn), 'Yahoo EURUSD=X'],
    ['GBPUSD', () => yahooSon('GBPUSD=X', fetchFn), 'Yahoo GBPUSD=X'],
    ['XAUUSD', () => yahooSon('GC=F', fetchFn), 'Yahoo GC=F (altın vadeli, ons)'],
    ['BTCUSD', () => binanceSon('BTCUSDT', fetchFn), 'Binance BTCUSDT']
  ];
  await Promise.all(isler.map(async ([ad, f, kaynak]) => {
    try { const x = await f(); kurlar[ad] = { deger: x.deger, zaman: x.zaman, kaynak, canli: true }; } catch (e) { hatalar.push(`${ad}: ${e.message}`); }
  }));
  return { zaman: new Date(simdi).toISOString(), kurlar, hatalar };
}

module.exports = {
  ONS_GRAM, BAYAT_GUN, KUR_SEMBOL, KUR_TAZE_MS, BIRIMLER,
  yahooSeri, tefasSeri, binanceSeri, kurSerileri, oncekiNokta, usdDegeri, usdtry, varlikSerisi, fiyatTarihte,
  cevir, kurTablosu, kurlariTazele, yahooSon, binanceSon, siraliBirlestir
};
