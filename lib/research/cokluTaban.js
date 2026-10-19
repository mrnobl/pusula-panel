/**
 * ÇOKLU TABAN — PLAN-COKLU-TABAN.md (ön kayıt 3b1cbca, denemeler 887–896). ARAŞTIRMA / ÖLÇÜM MODÜLÜ.
 *
 * Hücum/Denge'nin BTC teminatı yerine bir TABAN SEPETİ: her üye coin spot tutulur (teminat h 0,95), içerideyken
 * payı p × taban ağırlığı, rejim dışında USDT. Simülasyonun kendisi `bindirme.simule({ taban })` (aynı hesap, aynı kol).
 * Bu modül yalnız şunları kurar:
 *   · ADAYLAR (PLAN §3, sabit — değiştirilmez)
 *   · tabanAgirlik(): t günü hedef ağırlıkları (Map sembol → p × baz × rejim), rejim t−1 kapanışındaki O-GC kararı
 *   · sepetAlTut(): taban al-tut kıyası (aylık yenilenen / dengelenen sepet)
 *   · donemOlc(): bir dönem penceresinde bütün ölçüm (adaylar × p, Hücum/Denge-BTC, kıyaslar, bootstrap, §8 raporları)
 *   · kesimDenetle(): yüklenen verinin hiçbir parçası kesim gününe (dahil) ulaşmıyor mu — HOLDOUT KORUMASI
 *
 * Ortam (bindirme/pitVeri modül yüklenirken okur): VERI_KESIM, MARKET_DB, ONBELLEK_DOSYA, FUNDING_SABIT, GOMLEK_BAS.
 */
const path = require('path');
const B = require('./bindirme');
const V = require('./pitVeri');

const GUN = 864e5;
const HOLDOUT_BAS = Date.UTC(2024, 0, 1);
const ms = (s) => Date.parse(s + 'T00:00:00Z');
const gun = (t) => new Date(t).toISOString().slice(0, 10);
const sym = (b) => b + '/USDT:USDT';
const BTC = sym('BTC'), ETH = sym('ETH');

/** PLAN §3 — 5 aday × p ∈ {1, 0,5}. */
const ADAYLAR = Object.freeze([
  Object.freeze({ kod: 'A1', tip: 'sabit', uyeler: [[BTC, 0.5], [ETH, 0.5]], rejim: 'kendi', no: { 1: 887, 0.5: 888 }, teyit: false, tabanKiyas: 'BTC+ETH 50/50' }),
  Object.freeze({ kod: 'A2', tip: 'sabit', uyeler: [[ETH, 1]], rejim: 'BTC', no: { 1: 889, 0.5: 890 }, teyit: true, tabanKiyas: 'ETH' }),
  Object.freeze({ kod: 'A3', tip: 'sabit', uyeler: [[BTC, 0.5], [ETH, 0.5]], rejim: 'BTC', no: { 1: 891, 0.5: 892 }, teyit: true, tabanKiyas: 'BTC+ETH 50/50' }),
  Object.freeze({ kod: 'B1', tip: 'pit', K: 3, rejim: 'kendi', no: { 1: 893, 0.5: 894 }, teyit: false, tabanKiyas: 'PIT ilk 3' }),
  Object.freeze({ kod: 'B2', tip: 'pit', K: 5, rejim: 'kendi', no: { 1: 895, 0.5: 896 }, teyit: false, tabanKiyas: 'PIT ilk 5' }),
]);
const P_DEGERLERI = Object.freeze([1, 0.5]);
/** PLAN §6 eşikleri (değişmez). */
const ESIK = Object.freeze({ dd: 0.05, P: 0.70, gunIci: { 1: -0.35, 0.5: -0.25 }, holmAlfa: 0.30, aile: 10 });

// ═══ 1. TABAN AĞIRLIKLARI ═════════════════════════════════════════════════════
/** Sembolün kendi O-GC'si: t günü = t'den önceki son barın (t−1) kapanışındaki karar; t'de bar yoksa 0. */
function rejimFn(seri, s) {
  const x = seri.get(s);
  if (!x) return () => 0;
  const og = B.ogcDurum(x.m.map(b => b.close));
  return (t) => { const i = x.indeks.get(t); return i != null && i >= 1 ? og.durum[i - 1] : 0; };
}

/** Ay başı üyeler [[sembol, baz ağırlık]]. PIT: evren (hacme göre sıralı) ilk K, eşit 1/K (eksik üye → o pay USDT). */
function uyeler(aday, ay, evren) {
  if (aday.tip === 'sabit') return aday.uyeler;
  const l = evren.get(ay) || [];
  return l.slice(0, aday.K).map(s => [s, 1 / aday.K]);
}

/**
 * @returns { agirlik(t) → Map(sembol → w > 0), rejimler: Map(sembol → fn) }
 *   w = p × baz × rejim(t); rejim = aday.rejim === 'BTC' ? BTC'nin O-GC'si : üyenin kendi O-GC'si.
 */
function tabanAgirlik({ seri, aday, p, evren }) {
  const rj = new Map();
  const R = (s) => { if (!rj.has(s)) rj.set(s, rejimFn(seri, s)); return rj.get(s); };
  const agirlik = (t) => {
    const o = new Map();
    for (const [s, baz] of uyeler(aday, V.ayBasi(t), evren)) {
      const r = aday.rejim === 'BTC' ? R(BTC)(t) : R(s)(t);
      if (r) o.set(s, p * baz);
    }
    return o;
  };
  return { agirlik, rejimler: rj };
}

// ═══ 2. KIYASLAR ══════════════════════════════════════════════════════════════
/** Tek coin al-tut (gomlek-kol.js alTut ile aynı): ilk gün açılışta %0,1 komisyonla alım, kapanışlarla değerleme. */
function alTut(seri, s, gunler) {
  const x = seri.get(s);
  const b0 = x.m[x.indeks.get(gunler[0])];
  if (!b0) throw new Error(`${s}: al-tut ilk gününde bar yok`);
  const adet = 1 / (b0.open * 1.001);
  return [{ time: gunler[0] - GUN, oz: 1 }, ...gunler.map(t => { const i = x.indeks.get(t); if (i == null) throw new Error(`${s}: ${gun(t)} bar yok`); return { time: t, oz: adet * x.m[i].close }; })];
}

/**
 * Sepet al-tut (taban al-tut kıyası, PLAN §5.2): her ay başı (ve ilk gün) açılışta üyelere baz ağırlıkla yeniden dağıtılır;
 * ilk gün %0,1 giriş komisyonu, ay başı dengesi MALİYETSİZ (EK-1: kıyas lehine, muhafazakâr). Barı olmayan üye o gün son
 * kapanıştan nakde çevrilir ve ay sonuna kadar dışarıda (§1 delist kuralının kıyas karşılığı); eksik üyenin payı nakit.
 */
function sepetAlTut(seri, uyeFn, gunler, { giris = 0.001 } = {}) {
  const bar = (s, t) => { const x = seri.get(s); const i = x && x.indeks.get(t); return i == null ? null : x.m[i]; };
  let nakit = 1; let q = new Map(); const sonKap = new Map(); const dusen = new Set(); let ayOnce = null;
  const egri = [{ time: gunler[0] - GUN, oz: 1 }];
  gunler.forEach((t, k) => {
    const ay = V.ayBasi(t);
    if (ay !== ayOnce) dusen.clear();
    for (const [s, a] of q) if (a && !bar(s, t)) { nakit += a * sonKap.get(s); q.set(s, 0); dusen.add(s); }
    if (k === 0 || ay !== ayOnce) {
      let Vo = nakit; for (const [s, a] of q) if (a) Vo += a * bar(s, t).open;
      const yeni = new Map(); let harcanan = 0;
      for (const [s, baz] of uyeFn(t)) {
        const b = bar(s, t); if (!b || dusen.has(s)) { dusen.add(s); continue; }
        yeni.set(s, baz * Vo / (b.open * (k === 0 ? 1 + giris : 1))); harcanan += baz * Vo;
      }
      q = yeni; nakit = Vo - harcanan;
    }
    ayOnce = ay;
    let Vc = nakit;
    for (const [s, a] of q) { if (!a) continue; const b = bar(s, t); Vc += a * b.close; sonKap.set(s, b.close); }
    egri.push({ time: t, oz: Vc });
  });
  return egri;
}

// ═══ 3. METRİKLER ═════════════════════════════════════════════════════════════
const getiri = (e) => e.slice(1).map((x, i) => x.oz / e[i].oz - 1);
/** Eğriyi [bas, bit] getiri günlerine kes, bas−1 günü 1'e normalleştir (gomlek-kol.js kes ile aynı). */
function kes(egri, bas, bit) {
  const x = egri.filter(p => p.time >= bas - GUN && p.time <= bit);
  return x.map(p => ({ time: p.time, oz: p.oz / x[0].oz }));
}
function olc(e, { gunluk = null, tasfiye = null, ref = {} } = {}) {
  const S = require('./portfoySim');
  const M = S.metrik(e);
  const r = getiri(e);
  const o = { cagr: M.cagr, sharpe: M.sharpe, maxDD: M.maxDD, vol: M.vol, toplam: M.toplam, enKotuGunKapanis: Math.min(...r), yillik: B.yillik(e) };
  if (gunluk) {
    let mn = 0, mt = null;
    for (const g of gunluk) if (g.t > e[0].time && g.t <= e[e.length - 1].time && g.gunIci < mn) { mn = g.gunIci; mt = g.t; }
    o.enKotuGunIci = mn; o.enKotuGunIciT = mt ? gun(mt) : null;
  }
  if (tasfiye) o.tasfiye = tasfiye.filter(t => t > e[0].time && t <= e[e.length - 1].time).map(gun);
  for (const [ad, re] of Object.entries(ref)) {
    if (re.length !== e.length || re.some((x, i) => x.time !== e[i].time)) throw new Error(`bootstrap hizası bozuk (${ad})`);
    o['P_' + ad] = B.bootstrapP(r, getiri(re));
  }
  return o;
}

const korelasyon = (a, b) => {
  const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : null;
};
const medyan = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

// ═══ 4. HOLDOUT KORUMASI ══════════════════════════════════════════════════════
/** VERI_KESIM (ISO) → ms; tanımsız → null. */
function kesimMs() { return V.kesimMs(); }

/**
 * Yüklenen verinin HİÇBİR parçası kesim gününe ulaşmıyor: seri barları, funding günleri, kol önbelleği (Donchian eğrisi /
 * olayları, DCA segment g / oz / olaylar), simülasyon takvimi. İhlalde hata fırlatır (ölçüm başlamaz).
 */
function kesimDenetle(v, kesim) {
  if (!Number.isFinite(kesim)) throw new Error('kesim tanımsız');
  const ihlal = [];
  for (const [s, x] of v.seri) {
    if (x.m.length && x.m[x.m.length - 1].time >= kesim) ihlal.push(`${s} bar ${gun(x.m[x.m.length - 1].time)}`);
    for (const t of x.fon.keys()) if (t >= kesim) { ihlal.push(`${s} funding ${gun(t)}`); break; }
  }
  const harita = [['don.egri', v.don.egri], ['don.olaylar', v.don.olaylar], ...v.segler.flatMap((sg, i) => [[`seg${i}.g`, sg.g], [`seg${i}.oz`, sg.oz], [`seg${i}.olaylar`, sg.olaylar]])];
  for (const [ad, m] of harita) for (const t of m.keys()) if (t >= kesim) { ihlal.push(`${ad} ${gun(t)}`); break; }
  if (v.ts.length && v.ts[v.ts.length - 1] >= kesim) ihlal.push(`takvim ${gun(v.ts[v.ts.length - 1])}`);
  if (ihlal.length) throw new Error(`HOLDOUT KORUMASI: kesim ${gun(kesim)} sonrası veri yüklü (${ihlal.length}): ${ihlal.slice(0, 5).join('; ')}`);
  return { kesim: gun(kesim), seri: v.seri.size, sonGun: gun(v.ts[v.ts.length - 1]) };
}

// ═══ 5. DÖNEM ÖLÇÜMÜ ══════════════════════════════════════════════════════════
/**
 * Bir dönem penceresinde tüm ölçüm (işçi sürecinde; ortam bindirme/pitVeri'yi yapılandırmış olmalı).
 * @param pencere { bas, bit } ISO — getiri günleri (her iki uç dahil)
 * @param kesim   ms | null — null değilse kesimDenetle zorunlu ve pencere bit < kesim
 * @param evrenBas ms — PIT evren aylarının başlangıcı
 * @param ekPencereler { ad: { bas, bit } } — aynı simülasyondan ek pencereler (holdout koşucusu: P tam + holdout)
 */
function donemOlc({ pencere, kesim = null, evrenBas, ekPencereler = {}, adaylar = ADAYLAR }) {
  const t0 = Date.now();
  const v = B.veriYukle();
  const koruma = kesim != null ? kesimDenetle(v, kesim) : null;
  const pencereler = { ana: pencere, ...ekPencereler };
  for (const [ad, pc] of Object.entries(pencereler)) if (kesim != null && ms(pc.bit) >= kesim) throw new Error(`HOLDOUT KORUMASI: pencere ${ad} bit ${pc.bit} ≥ kesim ${gun(kesim)}`);
  const evren = V.evrenKur(5, evrenBas);
  for (const a of [...evren.keys()]) if (kesim != null && a >= kesim) evren.delete(a);
  const { seri, ts } = v;

  // ── Simülasyonlar (tam takvim, pencereler sonra kesilir) ──
  const sim = {};
  const kayit = (ad, E) => { sim[ad] = { egri: E.egri, gunluk: E.gunluk, tasfiye: E.st.tasfiye.map(x => x.t), st: { ucret: E.st.ucret, spotUcret: E.st.spotUcret, fon: E.st.fon, enDusukTampon: E.st.enDusukTampon, bitti: E.st.bitti }, tabanIslemler: E.tabanIslemler || null }; };
  kayit('hucum', B.simule({ btcPay: 1 }));
  kayit('denge', B.simule({ btcPay: 0.5 }));
  kayit('kol', B.simule({ btcVar: false }));
  // Eşdeğerlik: taban = yalnız BTC (kendi O-GC'si) → Hücum/Denge ile BİREBİR (taban kod yolunun sağlaması)
  const btcAday = { kod: 'BTC', tip: 'sabit', uyeler: [[BTC, 1]], rejim: 'kendi' };
  const esdeger = {};
  for (const p of P_DEGERLERI) {
    const E = B.simule({ btcVar: false, taban: tabanAgirlik({ seri, aday: btcAday, p, evren }) });
    const ref = sim[p === 1 ? 'hucum' : 'denge'];
    const ayni = JSON.stringify(E.egri) === JSON.stringify(ref.egri) && JSON.stringify(E.gunluk.map(g => [g.t, g.gk, g.gunIci])) === JSON.stringify(ref.gunluk.map(g => [g.t, g.gk, g.gunIci]));
    let maks = 0; E.egri.forEach((x, i) => { maks = Math.max(maks, Math.abs(x.oz / ref.egri[i].oz - 1)); });
    esdeger['p' + p] = { birebir: ayni, enBuyukGoreliFark: maks };
  }
  const rejimGun = {};
  for (const a of adaylar) for (const p of P_DEGERLERI) {
    const T = tabanAgirlik({ seri, aday: a, p, evren });
    kayit(`${a.kod}_${p}`, B.simule({ btcVar: false, taban: T }));
    if (p === 1) {
      kayit(`${a.kod}_taban`, B.simule({ btcVar: false, m: 0, taban: T }));   // yalnız taban (kolsuz) — §8 korelasyon
      rejimGun[a.kod] = T;
    }
  }

  // ── Pencere ölçümü ──
  const sonuc = {};
  for (const [pad, pc] of Object.entries(pencereler)) {
    const bas = ms(pc.bas), bit = ms(pc.bit);
    const gunler = ts.filter(t => t >= bas && t <= bit);
    if (!gunler.length) throw new Error(`pencere ${pad} boş`);
    const kesintisiz = gunler.every((t, i) => !i || t - gunler[i - 1] === GUN);
    const ref = { btc: alTut(seri, BTC, gunler) };
    const kiyas = { btc: ref.btc, eth: alTut(seri, ETH, gunler), '5050': sepetAlTut(seri, () => [[BTC, 0.5], [ETH, 0.5]], gunler) };
    for (const K of [3, 5]) kiyas['pit' + K] = sepetAlTut(seri, (t) => uyeler({ tip: 'pit', K }, V.ayBasi(t), evren), gunler);
    const tabanRef = (a) => (a.kod === 'A2' ? 'eth' : a.tip === 'pit' ? 'pit' + a.K : '5050');
    const kesE = (ad) => { const e = kes(sim[ad].egri, gunler[0], gunler[gunler.length - 1]); if (e.length !== gunler.length + 1) throw new Error(`${ad}: eğri pencereyle hizalı değil`); return e; };
    const o = { donem: { bas: gun(gunler[0]), bit: gun(gunler[gunler.length - 1]), gun: gunler.length, kesintisiz }, kiyas: {}, ref: {}, aday: {} };
    for (const [k, e] of Object.entries(kiyas)) o.kiyas[k] = olc(e);
    const hE = { 1: kesE('hucum'), 0.5: kesE('denge') };
    o.ref.hucum = olc(hE[1], { gunluk: sim.hucum.gunluk, tasfiye: sim.hucum.tasfiye, ref: { btc: ref.btc } });
    o.ref.denge = olc(hE[0.5], { gunluk: sim.denge.gunluk, tasfiye: sim.denge.tasfiye, ref: { btc: ref.btc } });
    o.ref.kol = olc(kesE('kol'), { gunluk: sim.kol.gunluk });
    for (const a of adaylar) for (const p of P_DEGERLERI) {
      const ad = `${a.kod}_${p}`, e = kesE(ad), x = sim[ad];
      const m = olc(e, { gunluk: x.gunluk, tasfiye: x.tasfiye, ref: { btc: ref.btc, taban: kiyas[tabanRef(a)], hucum: hE[p] } });
      m.no = a.no[p]; m.tabanKiyas = tabanRef(a);
      const g0 = gunler[0], g1 = gunler[gunler.length - 1];
      const isl = (x.tabanIslemler || []).filter(q => q.t >= g0 && q.t <= g1);
      m.tabanIslem = { adet: isl.length, barsiz: isl.filter(q => q.sebep === 'barsız gün').map(q => `${gun(q.t)} ${q.s.split('/')[0]}`) };
      const fonGun = x.gunluk.filter(g => g.t >= g0 && g.t <= g1);
      m.maliyetTamTakvim = { funding: x.st.fon, kolUcret: x.st.ucret, spotUcret: x.st.spotUcret, sonOzsermaye: x.egri[x.egri.length - 1].oz };
      m.ortTabanPay = fonGun.length ? fonGun.reduce((s, g) => s + (g.tabanPay || 0), 0) / fonGun.length : null;
      o.aday[ad] = m;
    }
    // §8: taban–kol korelasyonu, BTC < −%5 günleri, rejimde içeride gün (coin başına), BTC–ETH 90 g korelasyonu
    const rKol = getiri(kesE('kol')), rBtc = getiri(ref.btc), rEth = getiri(kiyas.eth);
    o.bilgi = { tabanKolKor: {}, btcSert: { gun: rBtc.filter(x => x < -0.05).length, kol: null, taban: {} }, rejimIcerideGun: {}, btcEth90: null };
    const sert = rBtc.map((x, i) => (x < -0.05 ? i : -1)).filter(i => i >= 0);
    const ort = (r) => (sert.length ? sert.reduce((s, i) => s + r[i], 0) / sert.length : null);
    o.bilgi.btcSert.kol = ort(rKol);
    for (const a of adaylar) {
      const rT = getiri(kesE(`${a.kod}_taban`));
      o.bilgi.tabanKolKor[a.kod] = korelasyon(rT, rKol);
      o.bilgi.btcSert.taban[a.kod] = ort(rT);
      const T = rejimGun[a.kod]; const say = {};
      for (const t of gunler) for (const s of T.agirlik(t).keys()) say[s.split('/')[0]] = (say[s.split('/')[0]] || 0) + 1;
      o.bilgi.rejimIcerideGun[a.kod] = say;
    }
    const k90 = []; for (let i = 90; i <= rBtc.length; i++) k90.push(korelasyon(rBtc.slice(i - 90, i), rEth.slice(i - 90, i)));
    o.bilgi.btcEth90 = k90.length ? { min: Math.min(...k90), medyan: medyan(k90), maks: Math.max(...k90) } : null;
    o.bilgi.sepet = {};
    for (const a of adaylar.filter(x => x.tip === 'pit')) {
      const aylar = [...evren.keys()].filter(ay => ay >= V.ayBasi(gunler[0]) && ay <= gunler[gunler.length - 1]);
      o.bilgi.sepet[a.kod] = aylar.map(ay => [gun(ay).slice(0, 7), uyeler(a, ay, evren).map(([s]) => s.split('/')[0])]);
    }
    sonuc[pad] = o;
  }
  return { koruma, esdeger, takvim: { bas: gun(ts[0]), bit: gun(ts[ts.length - 1]), gun: ts.length }, pencereler: sonuc, sureSn: (Date.now() - t0) / 1000,
    hamEgri: Object.fromEntries(Object.keys(sim).map(k => [k, sim[k].egri.map(x => [x.time, x.oz])])) };
}

// ═══ 6. HOLM (PLAN §6) ════════════════════════════════════════════════════════
/** Holm adım-aşağı: P'ler büyükten küçüğe; i. sıradaki (0 tabanlı) eşik 1 − α/(n − i); ilk düşüşten sonra hepsi düşer. */
function holm(liste, { alfa = ESIK.holmAlfa, n = ESIK.aile } = {}) {
  const s = [...liste].sort((a, b) => b.P - a.P);
  let dur = false;
  return s.map((x, i) => { const esik = 1 - alfa / (n - i); const gecer = !dur && x.P >= esik; if (!gecer) dur = true; return { ...x, sira: i + 1, esik, gecer }; });
}

module.exports = { ADAYLAR, P_DEGERLERI, ESIK, HOLDOUT_BAS, tabanAgirlik, rejimFn, uyeler, alTut, sepetAlTut, kes, olc, getiri, korelasyon, medyan, kesimMs, kesimDenetle, donemOlc, holm, BTC, ETH, GUN, ms, gun };
