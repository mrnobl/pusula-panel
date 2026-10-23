/**
 * İLERİ GÖLGE TESTİ — 2 haftalık kesitsel momentum kolu (A6-M, geçmiş deneme 566, "zayıf KABUL") + Kairos'a %8,2 bindirme
 * · deneme 971 · PLAN-ILERI-MOMENTUM.md. EMİR YOK, PARA YOK, ANAHTAR YOK: yalnız herkese açık veriyle kâğıt kayıt.
 * lib/live, lib/risk, engine, exchange'e DOKUNMAZ.
 *
 * KURAL: lib/research/a6Momentum.js (geçmiş testle AYNI işlevler: evren30Kur, a6KararKur(14, 2, momentum), lsSim). Burada yalnız
 * VERİ YOLU var — geçmiş test data/market.db'yi (Binance USDⓈ-M perp günlük + funding) okur; ileri gölge aynı biçimi Binance genel
 * API'sinden kurar (anahtarsız):
 *   · Sembol evreni: /fapi/v1/exchangeInfo — contractType PERPETUAL, quoteAsset USDT (TradFi ve sabit coin hariç; pitVeri ile aynı
 *     süzgeç). Listeden çıkanlar (SETTLING) delist gününe kadar dahil; görülen her sembol `semboller.json`da kalır.
 *   · Mum: /fapi/v1/klines 1d (yalnız kapanmış), VERI_BAS'tan; funding: /fapi/v1/fundingRate (yalnız seçilen semboller).
 * BİNDİRME: Kairos günlük getirisi (sunucunun Kairos simülasyonu, data/ileri/bindirme-golge.jsonl `hucum.C0`) + M × kol getirisi;
 *   M = 0,082 (geçmiş testin m'si: 0,5 × σ_kol / σ_A6M, geliştirme dönemi — sabit).
 *
 * VERİ (data/ileri/momentum/, git dışı): semboller.json · mum/<SEMBOL>.json · fon/<SEMBOL>.json · kayit.jsonl (YALNIZ EKLENİR: secim ·
 *   gun · dur) · son.json (özet; panel bunu okur). Her çalışmada ısınmadan (2026-10-19) bütün günler yeniden hesaplanır; kayıtlı
 *   satırın sonucu değişirse UYARI (`degisen`), kayıt değişmez. Ara rapor YALNIZ BETİMLEYİCİ; `hukum()` 2027-10-25 öncesi karar vermez.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const I = require('./bollingerIzleme');
const A6 = require('../research/a6Momentum');

const DENEME = 971;
const GECMIS_DENEME = 566;
const PLAN = 'PLAN-ILERI-MOMENTUM.md';
const ISINMA = '2026-10-19';            // ilk ts günü (ilk karar 2026-10-18 Pazar kapanışı) — iki dilim 2026-10-25'te dolar
const BAS = '2026-10-26';               // ilk ölçüm günü (tam portföy; karar 2026-10-25 Pazar)
const VERI_BAS = '2026-05-29';          // mum geçmişi başlangıcı (≥ 90 mum + 30 g hacim penceresi)
const ARA_KONTROL = '2027-04-26';
const KARAR = '2027-10-25';
const KARAR_ERTELEME = '2028-10-23';
const EN_AZ_GUN = 300;                  // Kairos satırıyla eşleşmiş kesin gün
const M = 0.082;
const V1 = Object.freeze({ kolDD: -0.50 });
const V2 = Object.freeze({ puan: 0.03 });
const GECIKME_TOLERANS = 3;             // bu kadar gün geride kalan (seçilmemiş) sembol günün kesinleşmesini bekletmez
const GUN = 864e5;
const STABIL = /^(USDC|BUSD|TUSD|FDUSD|USDP|DAI|UST|USTC|EUR|GBP|AEUR|PAX|USDE|RLUSD|USD1|BFUSD)\//;   // lib/research/pitVeri ile aynı

const gn = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / GUN);
const gs = (g) => new Date(g * GUN).toISOString().slice(0, 10);
const sha = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);
const okuJ = (p, v = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return v; } };
function yazJ(p, o) { fs.mkdirSync(path.dirname(p), { recursive: true }); const t = `${p}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o), 'utf8'); fs.renameSync(t, p); }
async function havuzla(l, n, fn) { const out = new Array(l.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, l.length) }, async () => { while (i < l.length) { const k = i++; out[k] = await fn(l[k], k); } })); return out; }

const dosyalar = (dizin = I.VARSAYILAN_DIZIN) => {
  const k = path.join(dizin, 'momentum');
  return { kok: k, semboller: path.join(k, 'semboller.json'), mum: path.join(k, 'mum'), fon: path.join(k, 'fon'), kayit: path.join(k, 'kayit.jsonl'), son: path.join(k, 'son.json'), golge: I.dosyalar(dizin).golge };
};
const anahtar = (base) => `${base}/USDT:USDT`;
/** pitVeri süzgeci: sabit coin ve TradFi hariç. */
function evrendeMi(base) {
  const s = anahtar(base);
  if (STABIL.test(s)) return false;
  try { return !require('../veri/tradfi').tradfiMi(s); } catch { return true; }
}

/* ═══════════ AĞ (Binance genel API, anahtarsız) ═══════════ */
function gercekAg({ fetchFn = fetch } = {}) {
  const FAPI = 'https://fapi.binance.com';
  let agirlik = 0;
  const bekle = (ms) => new Promise(r => setTimeout(r, ms));
  const yavas = async () => { if (agirlik > 1500) { await bekle(30e3); agirlik = 0; } else await bekle(80); };
  const al = async (u) => {
    await yavas();
    const r = await I.tekrarla(async () => { const x = await fetchFn(u, { headers: { 'User-Agent': 'pusula-ileri-momentum/1.0', Accept: 'application/json' } }); if (x.status === 429 || x.status === 418 || x.status >= 500) throw new Error(`HTTP ${x.status}`); return x; });
    agirlik = +(r.headers.get('x-mbx-used-weight-1m') || 0) || agirlik;
    const metin = await r.text();
    return { durum: r.status, metin };
  };
  return {
    async exchangeInfo() {
      const r = await al(`${FAPI}/fapi/v1/exchangeInfo`);
      if (r.durum !== 200) throw new Error(`exchangeInfo HTTP ${r.durum}`);
      return JSON.parse(r.metin).symbols.filter(x => x.contractType === 'PERPETUAL' && x.quoteAsset === 'USDT')
        .map(x => ({ ham: x.symbol, base: x.baseAsset, durum: x.status, onboard: +x.onboardDate || null, delivery: +x.deliveryDate || null }));
    },
    /** → { gecersiz: true } | { satirlar: [[t, o, h, l, c, v]] } */
    async mum(ham, bas, limit = 200) {
      const r = await al(`${FAPI}/fapi/v1/klines?symbol=${ham}&interval=1d&startTime=${bas}&limit=${limit}`);
      if (r.durum === 400) { let j = {}; try { j = JSON.parse(r.metin); } catch { /* */ } if (j.code === -1121) return { gecersiz: true }; throw new Error(`${ham} mum HTTP 400 ${j.code || ''}`); }
      if (r.durum !== 200) throw new Error(`${ham} mum HTTP ${r.durum}`);
      return { satirlar: JSON.parse(r.metin).map(k => [+k[0], +k[1], +k[2], +k[3], +k[4], +k[5]]) };
    },
    /** → [[t, oran]] (bas ≤ t < bit) */
    async funding(ham, bas, bit) {
      const out = []; let t = bas;
      for (let i = 0; i < 20; i++) {
        const r = await al(`${FAPI}/fapi/v1/fundingRate?symbol=${ham}&startTime=${t}&endTime=${bit - 1}&limit=1000`);
        if (r.durum === 400) return out;
        if (r.durum !== 200) throw new Error(`${ham} funding HTTP ${r.durum}`);
        const l = JSON.parse(r.metin).map(x => [+x.fundingTime, +x.fundingRate]);
        out.push(...l);
        if (l.length < 1000) break;
        t = l[l.length - 1][0] + 1;
      }
      return out;
    },
  };
}

/* ═══════════ ÖNBELLEK ═══════════ */
/** Mum önbelleği: kapsam (gün no) < Y ise son mumdan 2 gün geri indirilir. Ağ hatası fırlatır. */
async function mumGuncelle(F, ag, ham, Y, simdi) {
  const yol = path.join(F.mum, ham + '.json');
  const o = okuJ(yol) || { ham, satirlar: [], kapsam: null, gecersiz: false };
  if (o.gecersiz || (o.kapsam != null && o.kapsam >= Y)) return o;
  const h = new Map(o.satirlar.map(r => [r[0], r]));
  let bas = o.satirlar.length ? o.satirlar[o.satirlar.length - 1][0] - 2 * GUN : gn(VERI_BAS) * GUN;
  for (let i = 0; i < 10; i++) {
    const r = await ag.mum(ham, bas, 200);
    if (r.gecersiz) { o.gecersiz = true; break; }
    const kap = r.satirlar.filter(k => k[0] + GUN <= simdi);
    for (const k of kap) h.set(k[0], k);
    if (r.satirlar.length < 200 || !kap.length) break;
    bas = kap[kap.length - 1][0] + GUN;
  }
  o.satirlar = [...h.values()].sort((a, b) => a[0] - b[0]);
  o.kapsam = Y;
  yazJ(yol, o);
  return o;
}
/** Funding önbelleği [bas, bit) kapsayana kadar. */
async function fonGuncelle(F, ag, ham, bas, bit) {
  const yol = path.join(F.fon, ham + '.json');
  const o = okuJ(yol) || { ham, satirlar: [], bas: null, kapsam: null };
  if (o.bas != null && o.bas <= bas && o.kapsam >= bit) return o;
  const bas2 = o.bas != null && o.bas <= bas ? Math.max(bas, o.kapsam - GUN) : bas;
  const l = await ag.funding(ham, bas2, bit);
  const h = new Map(o.satirlar.map(r => [r[0], r])); for (const r of l) h.set(r[0], r);
  o.satirlar = [...h.values()].sort((a, b) => a[0] - b[0]);
  o.bas = o.bas != null ? Math.min(o.bas, bas) : bas;
  o.kapsam = Math.max(o.kapsam || 0, bit);
  yazJ(yol, o);
  return o;
}

/* ═══════════ SAF HESAPLAR ═══════════ */
/**
 * Saf: önbellekten pitVeri biçimi seri. mumlar: Map(base → [[t,o,h,l,c,v]]), fonlar: Map(base → [[t, oran]]), sonGun dahil (gün no).
 * pitVeri gibi: < 30 mumlu sembol atılır; funding günü = UTC gün (toplam).
 */
function seriKur(mumlar, fonlar, sonGun) {
  const seri = new Map();
  for (const base of [...mumlar.keys()].sort()) {
    const m = mumlar.get(base).filter(r => r[0] < (sonGun + 1) * GUN).map(r => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] }));
    if (m.length < 30) continue;
    const fon = new Map();
    for (const [t, rate] of fonlar.get(base) || []) { if (t >= (sonGun + 1) * GUN) continue; const g = Math.floor(t / GUN) * GUN; fon.set(g, (fon.get(g) || 0) + rate); }
    seri.set(anahtar(base), { m, indeks: new Map(m.map((x, i) => [x.time, i])), fon });
  }
  return seri;
}
/** Saf: kural koşusu (ısınmadan T'ye). → { ts, sim, secimler } */
function kos(seri, T, { isinma = ISINMA } = {}) {
  const ts = []; for (let g = gn(isinma); g <= T; g++) ts.push(g * GUN);
  if (!ts.length) return { ts, sim: null, secimler: [] };
  const ev = A6.evren30Kur(seri);
  const { karar, secimler } = A6.a6KararKur(seri, ev, A6.A6M.n, A6.A6M.tutHafta, A6.A6M.ters);
  const sim = A6.lsSim({ seri, ts, karar, mal: A6.MAL });
  return { ts, sim, secimler, evren: ev };
}
const kisa = (s) => String(s).replace(/\/USDT:USDT$/, '');
const yuv = (x, b = 10) => (Number.isFinite(x) ? Math.round(x * 10 ** b) / 10 ** b : null);

function maxDD(E) { let tepe = -Infinity, m = 0; for (const e of E) { if (e > tepe) tepe = e; m = Math.min(m, e / tepe - 1); } return m; }
function korelasyon(a, b) {
  const n = Math.min(a.length, b.length); if (n < 3) return null;
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
}
const zincir = (l) => { const o = [1]; for (const r of l) o.push(o[o.length - 1] * (1 + r)); return o; };
function sharpe(r) { if (r.length < 3) return null; const o = r.reduce((a, b) => a + b, 0) / r.length; const sd = Math.sqrt(r.reduce((a, b) => a + (b - o) ** 2, 0) / (r.length - 1)); return sd > 0 ? o / sd * Math.sqrt(365) : null; }

/**
 * Saf: ölçüm (gün satırları + Kairos haritası). Kairos satırı eksik ilk günde birleşim durur.
 * → { gun, kol: { toplam, mdd, sharpe }, birlikte, kairos, fark, kor, seri }
 */
function olc(gunler, hucum, { kadar = null } = {}) {
  const l = gunler.filter(x => !kadar || x.gun <= kadar).sort((a, b) => (a.gun < b.gun ? -1 : 1));
  const rK = l.map(x => x.r);
  const EK = zincir(rK);
  const rH = [], rC = [], rK2 = [], g = []; let eksik = null;
  for (const x of l) { const h = hucum.get(x.gun); if (!Number.isFinite(h)) { eksik = x.gun; break; } rH.push(h); rK2.push(x.r); rC.push(h + M * x.r); g.push(x.gun); }
  const EH = zincir(rH), EC = zincir(rC);
  return {
    gun: l.length, eslesen: g.length, eksikKairos: eksik, sonGun: l.length ? l[l.length - 1].gun : null,
    kol: { toplam: EK[EK.length - 1] - 1, mdd: maxDD(EK), sharpe: sharpe(rK) },
    birlikte: g.length ? { toplam: EC[EC.length - 1] - 1, mdd: maxDD(EC) } : null,
    kairos: g.length ? { toplam: EH[EH.length - 1] - 1, mdd: maxDD(EH) } : null,
    fark: g.length ? { getiri: EC[EC.length - 1] - EH[EH.length - 1], mdd: maxDD(EC) - maxDD(EH) } : null,
    kor: korelasyon(rK2, rH),
    seri: l.map((x, i) => ({ gun: x.gun, E: EK[i + 1] })),
  };
}
/** Saf: vazgeçme (ön kayıt §5) — her kesin gün sonu itibarıyla. */
function vazgecmeBul(gunler, hucum) {
  const l = gunler.slice().sort((a, b) => (a.gun < b.gun ? -1 : 1));
  for (let i = 0; i < l.length; i++) {
    const o = olc(l.slice(0, i + 1), hucum);
    if (o.kol.mdd <= V1.kolDD) return { kural: 'V1', gun: l[i].gun, kolMdd: o.kol.mdd };
    if (o.fark && o.eslesen === i + 1 && o.fark.mdd < -V2.puan) return { kural: 'V2', gun: l[i].gun, birlikteMdd: o.birlikte.mdd, kairosMdd: o.kairos.mdd };
  }
  return null;
}
function araRapor(gunler, hucum, { bugun }) {
  const o = olc(gunler, hucum);
  const kararTarihi = bugun >= KARAR && o.eslesen < EN_AZ_GUN ? KARAR_ERTELEME : KARAR;
  return { deneme: DENEME, gecmisDeneme: GECMIS_DENEME, plan: PLAN, baslangic: BAS, araKontrol: ARA_KONTROL, kararTarihi, kararErteleme: KARAR_ERTELEME, enAzGun: EN_AZ_GUN, M,
    kalanGun: Math.round((Date.parse(`${kararTarihi}T00:00:00Z`) - Date.parse(`${bugun}T00:00:00Z`)) / GUN), ...o, not: 'Ara rapor — hüküm değil.' };
}
/** Karar (ön kayıt §4): K1 kol Sharpe > 0,5 · K2 birlikte ≥ Kairos · K3 birlikte DD ≤ Kairos DD + 2 puan · K4 ρ < 0,3. */
function hukum(gunler, hucum, { bugun }) {
  if (bugun < KARAR) return { durum: 'bekliyor', metin: `henüz karar zamanı değil (${KARAR})` };
  const o1 = olc(gunler, hucum, { kadar: KARAR });
  if (o1.eslesen < EN_AZ_GUN && bugun < KARAR_ERTELEME) return { durum: 'ertelendi', metin: `${o1.eslesen} gün < ${EN_AZ_GUN} — karar ${KARAR_ERTELEME}`, olcu: o1 };
  const o = o1.eslesen < EN_AZ_GUN ? olc(gunler, hucum, { kadar: KARAR_ERTELEME }) : o1;
  const k = { K1: o.kol.sharpe != null && o.kol.sharpe > 0.5, K2: !!o.fark && o.fark.getiri >= 0, K3: !!o.fark && o.fark.mdd >= -0.02, K4: o.kor != null && o.kor < 0.3 };
  const sonuc = Object.values(k).every(Boolean) ? 'küçük bindirme adayı (kullanıcı kararı)'
    : (o.kol.sharpe != null && o.kol.sharpe <= 0) || (o.fark && o.fark.getiri < -0.02) ? 'RED' : 'belirsiz, bir yıl daha';
  return { durum: 'karar', tarih: o1.eslesen < EN_AZ_GUN ? KARAR_ERTELEME : KARAR, sonuc, kriter: k, olcu: o, not: 'Aday olmak canlıya bağlanmak değildir: entegre çapraz marj + tasfiye denetimi ve kullanıcı onayı gerekir.' };
}

/* ═══════════ ÇALIŞTIR ═══════════ */
async function calistir({ simdi = Date.now(), dizin = I.VARSAYILAN_DIZIN, ag = null, log = () => {}, sonAn = Infinity, esZaman = 4, isinma = ISINMA, bas = BAS } = {}) {
  const F = dosyalar(dizin);
  return I.kilitle(dizin, async () => {
    const t0 = Date.now();
    const A = ag || gercekAg();
    const sure = () => Date.now() < sonAn;
    const Y = Math.floor((simdi - 15 * 60e3) / GUN) - 1;      // son kapanmış gün (00:15 UTC payı)
    const eksik = [], notlar = [];
    const kaynak = { exchangeInfo: null, mum: { istenen: 0, alinan: 0, hata: [] }, funding: { istenen: 0, alinan: 0, hata: [] } };
    // 1. semboller (birleşim; görülen hiçbir sembol silinmez)
    const sb = okuJ(F.semboller) || { liste: [] };
    const SM = new Map(sb.liste.map(x => [x.ham, x]));
    try {
      const l = await A.exchangeInfo();
      for (const x of l) SM.set(x.ham, { ...(SM.get(x.ham) || {}), ...x, sonGorulme: new Date(simdi).toISOString() });
      kaynak.exchangeInfo = 'ok';
      yazJ(F.semboller, { zaman: new Date(simdi).toISOString(), liste: [...SM.values()].sort((a, b) => (a.ham < b.ham ? -1 : 1)) });
    } catch (e) { kaynak.exchangeInfo = `hata: ${e.message}`; if (!SM.size) eksik.push({ seri: 'momentum:exchangeInfo', neden: e.message }); }
    const veriBasMs = gn(VERI_BAS) * GUN;
    const U = [...SM.values()].filter(x => evrendeMi(x.base) && (!x.onboard || x.onboard <= (Y + 1) * GUN) && (x.durum === 'TRADING' || !x.delivery || x.delivery >= veriBasMs));
    // 2. mumlar
    let butceDoldu = false;
    const mumO = await havuzla(U, esZaman, async (x) => {
      const eski = okuJ(path.join(F.mum, x.ham + '.json'));
      if (eski && (eski.gecersiz || eski.kapsam >= Y)) return eski;
      if (!sure()) { butceDoldu = true; return eski; }
      kaynak.mum.istenen++;
      try { const o = await mumGuncelle(F, A, x.ham, Y, simdi); kaynak.mum.alinan++; return o; } catch (e) { kaynak.mum.hata.push(`${x.ham}: ${e.message}`); return eski; }
    });
    if (butceDoldu) eksik.push({ seri: 'momentum:sure', neden: 'süre bütçesi doldu — kalan semboller sonraki çalışmada' });
    const mumlar = new Map(); const kapsamlar = new Map();
    U.forEach((x, i) => { const o = mumO[i]; if (o && o.satirlar && o.satirlar.length) mumlar.set(x.base, o.satirlar); kapsamlar.set(x.base, o ? (o.gecersiz ? Infinity : (o.kapsam == null ? -Infinity : o.kapsam)) : -Infinity); });
    // 3. kesin gün T: son seçimdeki semboller beklenir; diğerleri en çok GECIKME_TOLERANS gün geride kalabilir
    const kayit0 = I.satirlariOku(F.kayit);
    const sonSecim = kayit0.filter(x => x.tur === 'secim').pop();
    const tutulan = new Set(sonSecim ? [...sonSecim.long, ...sonSecim.short].map(x => x[0]) : []);
    let T = Y;
    const geride = [];
    for (const [base, k] of kapsamlar) {
      if (k >= Y) continue;
      if (tutulan.has(base) || k < Y - GECIKME_TOLERANS) { if (tutulan.has(base)) T = Math.min(T, k); else geride.push(base); }
      else T = Math.min(T, k);
    }
    if (geride.length) notlar.push(`${geride.length} sembolün mumu ${GECIKME_TOLERANS}+ gün geride (evrenden düşmüş sayılır): ${geride.slice(0, 5).join(', ')}`);
    // 4. ilk koşu (funding'siz) → seçilen semboller → funding
    const seri0 = seriKur(mumlar, new Map(), T);
    const k0 = kos(seri0, T, { isinma });
    const secilen = new Map();
    for (const s of k0.secimler) for (const [sym] of [...s.long, ...s.short]) { const b = kisa(sym); if (!secilen.has(b) || secilen.get(b) > s.t) secilen.set(b, s.t); }
    const fonlar = new Map();
    const hamOf = new Map(U.map(x => [x.base, x.ham]));
    const fonBit = Math.min(simdi, (T + 1) * GUN);
    for (const [b, t] of secilen) {
      const ham = hamOf.get(b) || `${b}USDT`;
      const eski = okuJ(path.join(F.fon, ham + '.json'));
      let o = eski;
      if (!(eski && eski.bas != null && eski.bas <= t + GUN && eski.kapsam >= fonBit)) {
        if (!sure()) { butceDoldu = true; }
        else { kaynak.funding.istenen++; try { o = await fonGuncelle(F, A, ham, t + GUN, fonBit); kaynak.funding.alinan++; } catch (e) { kaynak.funding.hata.push(`${ham}: ${e.message}`); } }
      }
      if (!(o && o.kapsam >= fonBit)) { const kg = o && o.kapsam ? Math.floor(o.kapsam / GUN) - 1 : gn(isinma) - 1; T = Math.min(T, kg); eksik.push({ seri: `momentum:funding:${ham}`, neden: 'funding eksik' }); }
      if (o) fonlar.set(b, o.satirlar);
    }
    // 5. asıl koşu
    const seri = seriKur(mumlar, fonlar, T);
    const k = kos(seri, T, { isinma });
    const gunSat = [], secimSat = [];
    if (k.sim) {
      k.ts.forEach((t, i) => {
        const gun = gs(t / GUN); if (gun < bas) return;
        const x = { gun, r: yuv(k.sim.r[i]), gunIci: yuv(k.sim.gi[i]), fon: yuv(k.sim.rFon[i]), maliyet: yuv(k.sim.rMal[i]), long: yuv(k.sim.longR[i]), short: yuv(k.sim.shortR[i]) };
        x.imza = sha([x.gun, x.r, x.fon, x.maliyet]);
        gunSat.push(x);
      });
      for (const s of k.secimler) {
        const x = { t: gs(s.t / GUN), gecerli: s.gecerli, long: s.long.map(([a, g]) => [kisa(a), yuv(g, 6)]), short: s.short.map(([a, g]) => [kisa(a), yuv(g, 6)]), evren: k.evren(s.t).map(kisa) };
        x.imza = sha([x.t, x.long, x.short]);
        secimSat.push(x);
      }
    }
    // 6. kayıt
    const durK = kayit0.find(x => x.tur === 'dur') || null;
    const GK = new Map(kayit0.filter(x => x.tur === 'gun').map(x => [x.gun, x]));
    const SK = new Map(kayit0.filter(x => x.tur === 'secim').map(x => [x.t, x]));
    const yeni = [], degisen = [];
    const zaman = new Date(simdi).toISOString();
    for (const x of secimSat) {
      const e = SK.get(x.t);
      if (e) { if (e.imza !== x.imza) degisen.push({ tur: 'secim', t: x.t }); continue; }
      if (durK && x.t > durK.gun) continue;
      const sat = { tur: 'secim', ...x, kayitZamani: zaman, gecikmeli: gs(Y) > gs(gn(x.t) + 1) };
      yeni.push(sat); SK.set(x.t, sat);
    }
    for (const x of gunSat) {
      const e = GK.get(x.gun);
      if (e) { if (e.imza !== x.imza) degisen.push({ tur: 'gun', gun: x.gun, kayit: e.r, yeniden: x.r }); continue; }
      if (durK && x.gun > durK.gun) continue;
      const sat = { tur: 'gun', ...x, kayitZamani: zaman, gecikmeli: Y > gn(x.gun) + 1 };
      yeni.push(sat); GK.set(x.gun, sat);
    }
    const hucum = new Map(I.satirlariOku(F.golge).map(x => [x.gun, x.hucum && x.hucum.C0]));
    const gunler = [...GK.values()].filter(x => !durK || x.gun <= durK.gun).sort((a, b) => (a.gun < b.gun ? -1 : 1));
    let dur = durK;
    if (!dur) { const v = vazgecmeBul(gunler, hucum); if (v) { dur = { tur: 'dur', ...v, kayitZamani: zaman }; yeni.push(dur); log('WARN', `Momentum gölgesi DURDU (${v.kural}, ${v.gun})`); } }
    I.ekle(F.kayit, yeni);
    const gunlerD = gunler.filter(x => !dur || x.gun <= dur.gun);
    const bugun = gs(Math.floor(simdi / GUN));
    const sonS = [...SK.values()].sort((a, b) => (a.t < b.t ? -1 : 1)).slice(-2);
    const ozet = { zaman, deneme: DENEME, plan: PLAN, sureMs: Date.now() - t0, sonKapanmis: gs(Y), kesinGun: T >= gn(bas) ? gs(T) : null, yeniSatir: yeni.length,
      evrenSembol: U.length, mumSembol: mumlar.size, takvim: { isinma, bas, araKontrol: ARA_KONTROL, karar: KARAR, erteleme: KARAR_ERTELEME },
      rapor: araRapor(gunlerD, hucum, { bugun }), hukum: hukum(gunlerD, hucum, { bugun }),
      sepet: sonS.map(s => ({ t: s.t, long: s.long, short: s.short, gecerli: s.gecerli })),
      dur: dur ? { kural: dur.kural, gun: dur.gun } : null, kaynak, eksik, notlar, degisen };
    yazJ(F.son, ozet);
    if (degisen.length) log('WARN', `Momentum gölgesi: ${degisen.length} kayıtlı satırın yeniden hesabı farklı — kayıt DEĞİŞMEDİ`);
    return ozet;
  });
}

/** GET /api/ileri/momentum: yalnız son.json (ağ yok, yazmaz). */
/** `ILERI_GOLGE_DIZIN` yalnız kılavuz ekran görüntüleri içindir (örnek kayıt, scripts/ileri-golge-ornek.js); tanımsızken gerçek kayıt. */
function panelVerisi({ dizin = process.env.ILERI_GOLGE_DIZIN || I.VARSAYILAN_DIZIN } = {}) {
  const s = okuJ(dosyalar(dizin).son);
  return { success: true, ozet: s, takvim: { isinma: ISINMA, bas: BAS, araKontrol: ARA_KONTROL, karar: KARAR, erteleme: KARAR_ERTELEME, enAzGun: EN_AZ_GUN }, deneme: DENEME, gecmisDeneme: GECMIS_DENEME, plan: PLAN, M };
}

module.exports = {
  DENEME, GECMIS_DENEME, PLAN, ISINMA, BAS, VERI_BAS, ARA_KONTROL, KARAR, KARAR_ERTELEME, EN_AZ_GUN, M, V1, V2, STABIL,
  gn, gs, dosyalar, evrendeMi, gercekAg, mumGuncelle, fonGuncelle, seriKur, kos, olc, vazgecmeBul, araRapor, hukum, calistir, panelVerisi, maxDD, korelasyon, sharpe,
};
