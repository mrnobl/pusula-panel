/**
 * İLERİ VERİ GÖLGE İZLEYİCİ — Hücum / Denge BTC ayağı 3d adayı (PLAN-GOLGE-3D.md "ÖN KAYIT", deneme 635).
 * EMİR YOK, PARA YOK: yalnız karar kaydı + türetilmiş gölge getirisi. lib/live ve lib/risk'e DOKUNMAZ
 * (lib/risk/olcum yalnız okunur: durağan bootstrap).
 *
 * SİSTEMLER (ön kayıt §1): T = günlük O-GC E100 F50/S200 c1 (taban, bugünkü canlı kural) · A = 3d E15 F10/S150 c1 faz 0
 * (hüküm) · Y = 1d E50 F75/S400 c2 (yedek, ayrı hüküm) · A1 / A2 = A'nın faz 1 (Binance 3d mumu) / faz 2 sürümü (bilgi).
 * Kural (PLAN-ZAMAN-DILIMI-PARAM §1, scripts/zaman-dilimi-param.js `durumDizi` ile birebir — öz test):
 *   LONG AÇ = son c barın her birinde kapanış > SMA(E) VE SMA(F) > SMA(S); LONG KAPAT = son c barın her birinde kapanış < SMA(E).
 * 3d barlar günlük mumlardan: kova başı gün no = floor((g − faz) / 3) · 3 + faz (g = UTC gün / 86 400 000); yalnız TAM kapanmış
 * (son günü verideki son güne ≤) bar karar verir; aradaki günlerde son kapanmış barın kararı sürer.
 *
 * KAYIT `data/ileri/zaman-dilimi-kayit.jsonl` — YALNIZ EKLENİR, anahtar kararGunu (ilk 2026-10-07):
 *   { kararGunu, kapanis, oncekiGun, oncekiKapanis, kararlar: {T,A,A1,A2,Y}, bar3d: {A,A1,A2: o günün sonunda kapanan bar mı},
 *     sonBar3d: {A,A1,A2: son kapanmış 3d barın son günü}, kaynak, kayitZamani, gecikmeliKayit }
 *   Karar seri kararGunu'ne KESİLEREK hesaplanır (ileriye bakma yok). Getiri / rapor kayıttan yeniden üretilir.
 * GÖLGE GETİRİ (ön kayıt §2; bollingerIzleme.golgeSatiri ile aynı model): gün D, w = D−1 kararı, w0 = D−2 kararı
 *   (ilk günde w0 = w: pozisyon devralınır, maliyet yok);
 *   Hücum = w·r − |w − w0|·%0,12 + kol ; Denge = 0,5·w·r − 0,5·|w − w0|·%0,12 + kol ; kol = bindirme-golge.jsonl `kol.getiri`
 *   (yoksa 0, sayılır).
 * Ara rapor YALNIZ BETİMLEYİCİ; `hukum()` 2027-10-07 öncesi "henüz hüküm zamanı değil".
 */
const fs = require('fs');
const path = require('path');
const I = require('./bollingerIzleme');

const GUN = 864e5;
const BAS_KARAR = '2026-10-07';
const BAS_GETIRI = '2026-10-08';
const HUKUM_A = '2027-10-07';
const HUKUM_B = '2028-10-07';
const SPOT_MALIYET = 0.0012;
const OLAY_GUN = 60;
const TESTERE_GUN = 14;
const BOOT = { b: 20, N: 2000, tohum: 99 };
const T_ZAYIF = 1.0, T_GUCLU = 2.24;
const DENEME = 635;

const SISTEMLER = Object.freeze([
  { id: 'T', ad: 'Taban — günlük E100 F50/S200 c1', P: 1, faz: 0, E: 100, F: 50, S: 200, c: 1, rol: 'taban' },
  { id: 'A', ad: '3d E15 F10/S150 c1 (faz 0)', P: 3, faz: 0, E: 15, F: 10, S: 150, c: 1, rol: 'aday' },
  { id: 'Y', ad: 'Yedek — 1d E50 F75/S400 c2', P: 1, faz: 0, E: 50, F: 75, S: 400, c: 2, rol: 'yedek' },
  { id: 'A1', ad: '3d E15 F10/S150 c1 faz 1 (Binance 3d mumu)', P: 3, faz: 1, E: 15, F: 10, S: 150, c: 1, rol: 'bilgi' },
  { id: 'A2', ad: '3d E15 F10/S150 c1 faz 2', P: 3, faz: 2, E: 15, F: 10, S: 150, c: 1, rol: 'bilgi' },
].map(Object.freeze));
const ADAYLAR = ['A', 'Y'];
/** Ön kayıt §6: V1 eşiği (Hücum kümülatif log fark), V2 (MaxDD). */
const VAZGEC = Object.freeze({ V1: { A: -0.18, Y: -0.23 }, V2_mutlak: 0.356, V2_fark: 0.05 });

const gunNo = (g) => Math.floor(Date.parse(`${g}T00:00:00Z`) / GUN);
const gunStr = (n) => new Date(n * GUN).toISOString().slice(0, 10);

// ═══ 1. SİNYAL (saf) ═══════════════════════════════════════════════════════
/** Günlük [[gün, kapanış]] → dilim barları [{son: gün (barın son günü), c}]. P = 1 ise aynen. Yalnız tam kapanmış barlar. */
function barlar(gunluk, P, faz = 0) {
  if (P === 1) return gunluk.map(([g, c]) => ({ son: g, c }));
  if (!gunluk.length) return [];
  const out = [];
  let a = null;
  for (const [g, c] of gunluk) {
    const n = gunNo(g), k = Math.floor((n - faz) / P) * P + faz;
    if (!a || a.k !== k) { if (a) out.push(a); a = { k, son: g, c }; } else { a.son = g; a.c = c; }
  }
  if (a) out.push(a);
  const sonGun = gunNo(gunluk[gunluk.length - 1][0]);
  return out.filter(b => b.k + P - 1 <= sonGun).map(b => ({ son: gunStr(b.k + P - 1), c: b.c }));
}

/** SMA dizisi (pencere toplamı her adımda baştan — zaman-dilimi-param smaDizi ile aynı sayısal yol). */
function smaDizi(k, n) {
  const o = new Array(k.length).fill(null);
  for (let j = n - 1; j < k.length; j++) { let s = 0; for (let i = j - n + 1; i <= j; i++) s += k[i]; o[j] = s / n; }
  return o;
}

/** O-GC(E,F,S,c) durum dizisi — scripts/zaman-dilimi-param.js durumDizi ile birebir (GC'li). */
function durumDizi(kap, { E, F, S, c }) {
  const sE = smaDizi(kap, E), sF = smaDizi(kap, F), sS = smaDizi(kap, S);
  const n = kap.length, d = new Array(n).fill(0);
  const hazir = (i) => i >= 0 && sE[i] != null && sF[i] != null && sS[i] != null;
  let ic = false;
  for (let j = 0; j < n; j++) {
    let tum = true;
    for (let q = 0; q < c; q++) if (!hazir(j - q)) { tum = false; break; }
    if (tum) {
      let ok = true;
      if (!ic) { for (let q = 0; q < c; q++) if (!(kap[j - q] > sE[j - q] && sF[j - q] > sS[j - q])) { ok = false; break; } if (ok) ic = true; }
      else { for (let q = 0; q < c; q++) if (!(kap[j - q] < sE[j - q])) { ok = false; break; } if (ok) ic = false; }
    }
    d[j] = ic ? 1 : 0;
  }
  return { durum: d, sE, sF, sS };
}

/**
 * Seri D'ye kesilmiş (son eleman D) günlük veriden bir sistemin D kapanışındaki kararı.
 * @returns { w, sonBar (son kapanmış barın son günü), barKapandi (D'de bar kapandı mı), sma: {E,F,S}, kapanis (bar) }
 */
function sistemKarari(gunluk, sis) {
  const b = barlar(gunluk, sis.P, sis.faz);
  if (!b.length) return { w: 0, sonBar: null, barKapandi: false, sma: null };
  const kap = b.map(x => x.c);
  const { durum, sE, sF, sS } = durumDizi(kap, sis);
  const i = b.length - 1, D = gunluk[gunluk.length - 1][0];
  const r = (x) => (x == null ? null : Math.round(x * 100) / 100);
  return { w: durum[i], sonBar: b[i].son, barKapandi: b[i].son === D, sma: { E: r(sE[i]), F: r(sF[i]), S: r(sS[i]) }, barKapanis: kap[i] };
}

/** Bütün sistemlerin tam seri üzerindeki günlük karar dizisi (her gün için seri o güne kesilmiş gibi — nedensel). Öz test için. */
function kararDizisi(gunluk, sis) {
  const b = barlar(gunluk, sis.P, sis.faz);
  const { durum } = durumDizi(b.map(x => x.c), sis);
  const out = new Map();
  let j = -1;
  for (const [g] of gunluk) {
    while (j + 1 < b.length && b[j + 1].son <= g) j++;
    out.set(g, j < 0 ? 0 : durum[j]);
  }
  return out;
}

// ═══ 2. KAYIT SATIRLARI (saf) ═══════════════════════════════════════════════
/** Eklenecek satırlar: her eksik (gün ≥ bas) için seri o GÜNE kesilerek. */
function kararSatirlari(veri, mevcut, { simdi, bas = BAS_KARAR } = {}) {
  const s = veri.seri, out = [];
  const sonIdx = s.length - 1;
  for (let i = 1; i <= sonIdx; i++) {
    const g = s[i][0];
    if (g < bas || mevcut.has(g)) continue;
    const kes = s.slice(0, i + 1);
    const kararlar = {}, bar3d = {}, sonBar3d = {}, sma = {};
    for (const sis of SISTEMLER) {
      const k = sistemKarari(kes, sis);
      kararlar[sis.id] = k.w; sma[sis.id] = k.sma;
      if (sis.P === 3) { bar3d[sis.id] = k.barKapandi; sonBar3d[sis.id] = k.sonBar; }
    }
    out.push({ kararGunu: g, kapanis: s[i][1], oncekiGun: s[i - 1][0], oncekiKapanis: s[i - 1][1], kararlar, bar3d, sonBar3d, sma,
      kaynak: veri.kaynak || null, kayitZamani: new Date(simdi).toISOString(), gecikmeliKayit: i < sonIdx });
  }
  return out;
}

// ═══ 3. TÜRETME + METRİK (saf) ══════════════════════════════════════════════
/**
 * Kayıt + gölge satırları → gün gün getiriler. Gün D (≥ BAS_GETIRI) için kayıtta D satırı ve önceki gün (D.oncekiGun) satırı gerekir.
 * @returns [{ gun, rBtc, kol, kolVar, w: {id}, hucum: {id}, denge: {id} }]
 */
function turet(kayit, golge = []) {
  const K = new Map(kayit.map(x => [x.kararGunu, x]));
  const kol = new Map(golge.filter(x => x && x.gun && x.kol && Number.isFinite(x.kol.getiri)).map(x => [x.gun, x.kol.getiri]));
  const out = [];
  for (const D of [...K.keys()].sort()) {
    if (D < BAS_GETIRI) continue;
    const r = K.get(D), p = K.get(r.oncekiGun);
    if (!p) continue;                                            // boşluk (önceki gün kaydı yok) — atlanır
    const pp = K.get(p.oncekiGun);
    const rBtc = r.kapanis / r.oncekiKapanis - 1;
    const kolVar = kol.has(D), k = kolVar ? kol.get(D) : 0;
    const sat = { gun: D, rBtc, kol: k, kolVar, w: {}, hucum: {}, denge: {} };
    for (const sis of SISTEMLER) {
      const w = p.kararlar[sis.id], w0 = pp ? pp.kararlar[sis.id] : w;   // ilk gün devralınır
      sat.w[sis.id] = w;
      sat.hucum[sis.id] = w * rBtc - Math.abs(w - w0) * SPOT_MALIYET + k;
      sat.denge[sis.id] = 0.5 * w * rBtc - 0.5 * Math.abs(w - w0) * SPOT_MALIYET + k;
    }
    out.push(sat);
  }
  return out;
}

function egriOlcu(r) {
  let e = 1, tepe = 1, dd = 0;
  for (const x of r) { e *= 1 + x; if (e > tepe) tepe = e; dd = Math.max(dd, 1 - e / tepe); }
  const n = r.length;
  const cagr = n ? Math.pow(Math.max(e, 1e-12), 365.25 / n) - 1 : null;
  const o = n ? r.reduce((a, b) => a + b, 0) / n : 0;
  const s = n > 1 ? Math.sqrt(r.reduce((a, b) => a + (b - o) ** 2, 0) / (n - 1)) : 0;
  return { getiri: e - 1, cagr, maxDD: dd, sharpe: n >= 20 && s > 0 ? o / s * Math.sqrt(365) : null, calmar: dd > 0 && cagr != null ? cagr / dd : null };
}

/** Günlük w dizisinden işlemler (devralınan açık pozisyonun girişi ilk gün). */
function islemler(gunler, w) {
  const out = []; let gir = null;
  gunler.forEach((g, i) => {
    if (w[i] === 1 && gir == null) gir = g;
    else if (w[i] === 0 && gir != null) { out.push({ gir, cik: g, gun: gunNo(g) - gunNo(gir), acik: false }); gir = null; }
  });
  if (gir != null) out.push({ gir, cik: null, gun: gunler.length ? gunNo(gunler[gunler.length - 1]) + 1 - gunNo(gir) : 0, acik: true });
  return out;
}

/** Eşli fark ortalamasının durağan blok bootstrap t'si (araştırmadaki bootT ile aynı). n < 30 → null. */
function bootT(d) {
  if (d.length < 30) return null;
  const O = require('../risk/olcum');
  const o = d.reduce((a, b) => a + b, 0) / d.length;
  const k = O.duraganBootstrap(d, { b: BOOT.b, N: BOOT.N, H: d.length, tohum: BOOT.tohum, olc: (y) => y.reduce((a, b) => a + b, 0) / y.length });
  const m = k.reduce((a, b) => a + b, 0) / k.length;
  const se = Math.sqrt(k.reduce((a, b) => a + (b - m) ** 2, 0) / (k.length - 1));
  return se > 0 ? o / se : 0;
}

/** Bir aday için T ile eşli betimleyici ölçüler (ara rapor ve hüküm aynı sayıları kullanır). */
function eslikOlcu(T, id) {
  const gunler = T.map(x => x.gun);
  const sis = {};
  for (const s of [id, 'T']) {
    const w = T.map(x => x.w[s]);
    const isl = islemler(gunler, w);
    const kapali = isl.filter(x => !x.acik);
    sis[s] = { hucum: egriOlcu(T.map(x => x.hucum[s])), denge: egriOlcu(T.map(x => x.denge[s])), islem: isl.length,
      testere: kapali.filter(x => x.gun <= TESTERE_GUN).length, sonKarar: w.length ? w[w.length - 1] : null };
  }
  const dH = T.map(x => Math.log(1 + x.hucum[id]) - Math.log(1 + x.hucum.T));
  const dD = T.map(x => Math.log(1 + x.denge[id]) - Math.log(1 + x.denge.T));
  const farkliGun = T.filter(x => x.w[id] !== x.w.T).length;
  const top = (a) => a.reduce((x, y) => x + y, 0);
  // V1/V2 — önceden yazılmış izleme kuralları (her an): kümülatif farkın EN DÜŞÜK değeri de raporlanır
  let c = 0, enDusuk = 0; for (const x of dH) { c += x; enDusuk = Math.min(enDusuk, c); }
  const V1 = VAZGEC.V1[id] != null && enDusuk < VAZGEC.V1[id];
  const V2 = sis[id].hucum.maxDD > VAZGEC.V2_mutlak && sis[id].hucum.maxDD > sis.T.hucum.maxDD + VAZGEC.V2_fark;
  return { aday: id, gun: T.length, farkliGun, olaySarti: farkliGun >= OLAY_GUN, sumH: top(dH), sumD: top(dD), enDusukSumH: enDusuk,
    bootT: bootT(dH), aday_: sis[id], taban: sis.T, vazgec: { V1, V2, esikV1: VAZGEC.V1[id] ?? null, durum: V1 || V2 ? 'vazgeçildi' : 'izleniyor' } };
}

/** Ara rapor — YALNIZ BETİMLEYİCİ (hüküm alanı yok). */
function araRapor(kayit, golge = [], { bugun = new Date().toISOString().slice(0, 10) } = {}) {
  const T = turet(kayit, golge);
  const son = kayit.length ? [...kayit].sort((a, b) => (a.kararGunu < b.kararGunu ? -1 : 1))[kayit.length - 1] : null;
  const bilgi = {};
  for (const id of ['A1', 'A2']) bilgi[id] = { hucum: egriOlcu(T.map(x => x.hucum[id])), farkliGun: T.filter(x => x.w[id] !== x.w.T).length };
  const kalan = Math.round((Date.parse(`${HUKUM_A}T00:00:00Z`) - Date.parse(`${bugun}T00:00:00Z`)) / GUN);
  return {
    deneme: DENEME, plan: 'PLAN-GOLGE-3D.md', baslangic: BAS_GETIRI, hukumTarihi: HUKUM_A, kesinHukum: HUKUM_B, kalanGun: kalan,
    satirSayisi: kayit.length, gecikmeliSatir: kayit.filter(x => x.gecikmeliKayit).length, sonKararGunu: son ? son.kararGunu : null,
    sonKararlar: son ? son.kararlar : null, sonBar3d: son ? son.sonBar3d : null,
    gecenGun: T.length, kolEksikGun: T.filter(x => !x.kolVar).length, ilk: T.length ? T[0].gun : null, sonGun: T.length ? T[T.length - 1].gun : null,
    btcAlTut: egriOlcu(T.map(x => x.rBtc)),
    adaylar: Object.fromEntries(ADAYLAR.map(id => [id, eslikOlcu(T, id)])),
    bilgi,
    not: 'Ara rapor — hüküm değil (PLAN-GOLGE-3D §7). V1/V2 önceden yazılmış izleme kuralıdır.',
  };
}

/** Panel için kısa özet (İleri test → Hücum/Denge kartı satırı) — betimleyici, hüküm yok. */
function panelOzet(kayit, golge = [], o = {}) {
  const r = araRapor(kayit, golge, o);
  const k = (id) => { const m = r.adaylar[id]; return { farkliGun: m.farkliGun, sumH: m.sumH, sumD: m.sumD, durum: m.vazgec.durum, sonKarar: r.sonKararlar ? r.sonKararlar[id] : null }; };
  return { deneme: r.deneme, gecenGun: r.gecenGun, ilk: r.ilk, sonKararGunu: r.sonKararGunu, tabanSonKarar: r.sonKararlar ? r.sonKararlar.T : null,
    A: k('A'), Y: k('Y'), olayGun: OLAY_GUN, hukumTarihi: r.hukumTarihi, kesinHukum: r.kesinHukum, kalanGun: r.kalanGun, seri: birikimSerisi(kayit, golge, 'A') };
}
/** 63.1 (panel grafiği): günlüğe göre birikimli Hücum farkı (log puan), gün gün — sumH'nin seyri; yalnız betimleyici. */
function birikimSerisi(kayit, golge, id) {
  let c = 0;
  return turet(kayit, golge).map(x => { c += Math.log(1 + x.hucum[id]) - Math.log(1 + x.hucum.T); return { gun: x.gun, fark: c }; });
}

/** Hüküm (ön kayıt §3–§5). Tarihten önce çağrılırsa hüküm vermez. */
function hukum(kayit, golge = [], { bugun = new Date().toISOString().slice(0, 10) } = {}) {
  if (bugun < HUKUM_A) return { durum: 'bekliyor', metin: `henüz hüküm zamanı değil (${HUKUM_A})` };
  const T = turet(kayit, golge).filter(x => x.gun <= (bugun < HUKUM_B ? HUKUM_A : HUKUM_B));
  const kesin = bugun >= HUKUM_B;
  const sonuc = {};
  for (const id of ADAYLAR) {
    const m = eslikOlcu(T, id);
    if (m.vazgec.durum === 'vazgeçildi') { sonuc[id] = { hukum: 'vazgeçildi — günlük kalır', m }; continue; }
    if (!m.olaySarti) { sonuc[id] = { hukum: kesin ? 'sonuçsuz — günlük kalır, izleme kapanır' : `ertelendi (${HUKUM_B})`, m }; continue; }
    const a = m.aday_, t = m.taban;
    const calA = a.hucum.maxDD > 0 ? a.hucum.calmar : null, calT = t.hucum.maxDD > 0 ? t.hucum.calmar : null;
    const G = {
      G1: m.sumH > 0 && m.sumD > 0,
      G2: a.hucum.maxDD <= t.hucum.maxDD + 0.02 && a.denge.maxDD <= t.denge.maxDD + 0.02,
      G3: calA != null && calT != null ? calA >= calT : a.hucum.cagr >= t.hucum.cagr,
      G4: m.bootT != null && m.bootT >= T_ZAYIF,
      G5: a.testere <= t.testere + 2,
    };
    const hepsi = Object.values(G).every(Boolean);
    sonuc[id] = { G, m, hukum: !hepsi ? 'günlük kalır' : m.bootT >= T_GUCLU ? 'geçiş önerilir — güçlü' : 'geçiş önerilir — zayıf' };
  }
  const gecer = (id) => sonuc[id] && sonuc[id].hukum.startsWith('geçiş');
  let oneri = 'günlük kalır';
  if (gecer('A') && !(gecer('Y') && sonuc.Y.hukum.endsWith('güçlü') && sonuc.A.hukum.endsWith('zayıf'))) oneri = 'A';
  else if (gecer('Y')) oneri = 'Y';
  return { durum: kesin ? 'kesin' : 'hüküm', tarih: bugun, adaylar: sonuc, oneri,
    not: 'Geçiş önerisi canlıya otomatik geçiş değildir: kullanıcı onayı + ayrı canlı plan gerekir (PLAN-GOLGE-3D §5).' };
}

// ═══ 4. ÇALIŞTIR ════════════════════════════════════════════════════════════
const dosyalar = (dizin = I.VARSAYILAN_DIZIN) => ({
  kayit: path.join(dizin, 'zaman-dilimi-kayit.jsonl'),
  golge: path.join(dizin, 'bindirme-golge.jsonl'),
  getiri: path.join(dizin, 'zaman-dilimi-getiri.json'),
  son: path.join(dizin, 'zaman-dilimi-son.json'),
});

/**
 * Bir çalışma: BTC perp 1d indir → kayıt ekle → türetilmiş getiri + ara rapor dosyası. Idempotent.
 * @param o.indir (simdi) → { seri: [[gün, kapanış]], kaynak } (test için)
 */
async function calistir({ simdi = Date.now(), dizin = I.VARSAYILAN_DIZIN, indir = null } = {}) {
  const F = dosyalar(dizin);
  return I.kilitle(dizin, async () => {
    const t0 = Date.now();
    const v = indir ? await indir(simdi) : await I.btcIndir(simdi);
    const mevcutSat = I.satirlariOku(F.kayit);
    const yeni = kararSatirlari(v, new Set(mevcutSat.map(x => x.kararGunu)), { simdi });
    I.ekle(F.kayit, yeni);
    const kayit = [...mevcutSat, ...yeni];
    const golge = I.satirlariOku(F.golge);
    const bugun = new Date(simdi).toISOString().slice(0, 10);
    const turev = { uretim: new Date(simdi).toISOString(), not: 'TÜRETİLMİŞ — zaman-dilimi-kayit.jsonl + bindirme-golge.jsonl (kol) dosyalarından yeniden üretilir; elle düzenlemeyin',
      gunler: turet(kayit, golge), rapor: araRapor(kayit, golge, { bugun }) };
    fs.writeFileSync(F.getiri + '.tmp', JSON.stringify(turev), 'utf8');
    fs.renameSync(F.getiri + '.tmp', F.getiri);
    const ozet = { zaman: new Date(simdi).toISOString(), sureMs: Date.now() - t0, yeniSatir: yeni.length, gecikmeliSatir: yeni.filter(x => x.gecikmeliKayit).length,
      sonKapanmis: v.seri.length ? v.seri[v.seri.length - 1][0] : null, satirSayisi: kayit.length };
    fs.writeFileSync(F.son + '.tmp', JSON.stringify(ozet, null, 2), 'utf8');
    fs.renameSync(F.son + '.tmp', F.son);
    return ozet;
  });
}

module.exports = {
  SISTEMLER, ADAYLAR, VAZGEC, BAS_KARAR, BAS_GETIRI, HUKUM_A, HUKUM_B, OLAY_GUN, TESTERE_GUN, T_ZAYIF, T_GUCLU, DENEME, SPOT_MALIYET,
  barlar, smaDizi, durumDizi, sistemKarari, kararDizisi, kararSatirlari, turet, egriOlcu, islemler, bootT, eslikOlcu, araRapor, panelOzet, hukum,
  dosyalar, calistir, gunNo,
};
