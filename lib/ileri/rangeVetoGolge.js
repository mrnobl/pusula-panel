/**
 * İLERİ VERİ GÖLGE İZLEYİCİ — Hücum / Denge BTC ayağı D3 range vetosu (PLAN-GOLGE-D3.md "ÖN KAYIT", deneme 764).
 * EMİR YOK, PARA YOK: yalnız karar kaydı + türetilmiş gölge getirisi. lib/live ve lib/risk'e DOKUNMAZ
 * (lib/risk/olcum yalnız okunur: durağan bootstrap, zamanDilimiGolge.bootT üzerinden).
 *
 * SİSTEMLER (ön kayıt §1): T = günlük O-GC E100 F50/S200 c1 (taban, bugünkü canlı kural; zamanDilimiGolge T ile aynı) ·
 * D3 = T + yalnız GİRİŞ vetosu: pozisyon yokken giriş şartı sağlansa bile VR(4, 240) < 1 VE ER(10) < 0,30 ise LONG AÇ yok;
 * çıkış T ile aynı. Kural scripts/range-filtre.js (`durumlar`, `D3`, `vrDizi`, `erDizi`) ile birebir — öz test
 * (scripts/range-veto-golge-selftest.js).
 *
 * KAYIT `data/ileri/range-veto-kayit.jsonl` — YALNIZ EKLENİR, anahtar kararGunu (ilk 2026-10-09):
 *   { kararGunu, kapanis, oncekiGun, oncekiKapanis, kararlar: {T, D3}, giris (T'nin giriş şartı), vr, er, veto, vetolandi
 *     (D3 bugün vetoyla nakitte kaldı), sma, kaynak, kayitZamani, gecikmeliKayit }
 *   Karar seri kararGunu'ne KESİLEREK hesaplanır (ileriye bakma yok). Getiri / rapor kayıttan yeniden üretilir.
 * GÖLGE GETİRİ: zamanDilimiGolge.turet ile aynı model (Hücum = w·r − |Δw|·%0,12 + kol; Denge = 0,5·…).
 * Ara rapor YALNIZ BETİMLEYİCİ; `hukum()` 2027-10-09 öncesi "henüz hüküm zamanı değil".
 */
const fs = require('fs');
const path = require('path');
const I = require('./bollingerIzleme');
const Z = require('./zamanDilimiGolge');

const GUN = 864e5;
const BAS_KARAR = '2026-10-09';
const BAS_GETIRI = '2026-10-10';
const HUKUM_A = '2027-10-09';
const HUKUM_B = '2028-10-09';
const SPOT_MALIYET = 0.0012;
const OLAY = Object.freeze({ farkliGun: 10, vetoOlayi: 2 });
const TESTERE_GUN = 14;
const T_ZAYIF = 1.0, T_GUCLU = 1.96;
const DENEME = 764;
/** Ön kayıt §6. */
const VAZGEC = Object.freeze({ V1: -0.10, V2_mutlak: 0.358, V2_fark: 0.03 });
const KURAL = Object.freeze({ E: 100, F: 50, S: 200, VR_Q: 4, VR_L: 240, ER_N: 10, VR_ESIK: 1, ER_ESIK: 0.30 });
const SISTEMLER = Object.freeze([
  Object.freeze({ id: 'T', ad: 'Taban — günlük O-GC E100 F50/S200', rol: 'taban' }),
  Object.freeze({ id: 'D3', ad: 'D3 — taban + range vetosu (VR(4,240) < 1 ve ER(10) < 0,30 iken yeni giriş yok)', rol: 'aday' }),
]);

// ═══ 1. SİNYAL (saf) ═══════════════════════════════════════════════════════
/** Kaufman ER(n) — scripts/range-filtre.js erDizi ile birebir. */
function erDizi(c, n) {
  const o = new Array(c.length).fill(null);
  for (let j = n; j < c.length; j++) {
    let y = 0; for (let i = j - n + 1; i <= j; i++) y += Math.abs(c[i] - c[i - 1]);
    o[j] = y > 0 ? Math.abs(c[j] - c[j - n]) / y : 0;
  }
  return o;
}

/** Lo–MacKinlay VR(q) son L log getiriden — scripts/range-filtre.js vrDizi ile birebir. */
function vrDizi(c, q = KURAL.VR_Q, L = KURAL.VR_L) {
  const r = c.map((x, i) => (i ? Math.log(x / c[i - 1]) : null)), o = new Array(c.length).fill(null);
  for (let j = L; j < c.length; j++) {
    const a = r.slice(j - L + 1, j + 1), mu = a.reduce((s, x) => s + x, 0) / L;
    const v1 = a.reduce((s, x) => s + (x - mu) ** 2, 0) / (L - 1);
    let vq = 0, n = 0; for (let k = q - 1; k < L; k++) { let s = 0; for (let t = k - q + 1; t <= k; t++) s += a[t]; vq += (s - q * mu) ** 2; n++; }
    vq /= (n - 1);
    o[j] = v1 > 0 ? vq / (q * v1) : null;
  }
  return o;
}

/** VR'yi yalnız j ≥ bas için hesaplar (kesme hesabı hızlı olsun; değerler vrDizi ile aynı). */
function vrSon(c, j, q = KURAL.VR_Q, L = KURAL.VR_L) {
  if (j < L) return null;
  const a = []; for (let i = j - L + 1; i <= j; i++) a.push(Math.log(c[i] / c[i - 1]));
  const mu = a.reduce((s, x) => s + x, 0) / L;
  const v1 = a.reduce((s, x) => s + (x - mu) ** 2, 0) / (L - 1);
  let vq = 0, n = 0; for (let k = q - 1; k < L; k++) { let s = 0; for (let t = k - q + 1; t <= k; t++) s += a[t]; vq += (s - q * mu) ** 2; n++; }
  vq /= (n - 1);
  return v1 > 0 ? vq / (q * v1) : null;
}

/** Veto dizisi: 1 = range (VR < 1 VE ER(10) < 0,30). */
function vetoDizi(c) {
  const vr = vrDizi(c), er = erDizi(c, KURAL.ER_N);
  return { veto: c.map((_, j) => (vr[j] != null && er[j] != null && vr[j] < KURAL.VR_ESIK && er[j] < KURAL.ER_ESIK ? 1 : 0)), vr, er };
}

/**
 * T ve D3 durum dizileri — range-filtre.js `durumlar` (O-GC giriş/çıkış, SMA200 hazır değilse 0) ile birebir.
 * SMA'lar zamanDilimiGolge.smaDizi (pencere toplamı her adımda baştan).
 */
function durumlar(c, veto) {
  const S50 = Z.smaDizi(c, KURAL.F), S100 = Z.smaDizi(c, KURAL.E), S200 = Z.smaDizi(c, KURAL.S);
  const kos = (v) => {
    const d = new Array(c.length).fill(0), vetolandi = new Array(c.length).fill(0); let acik = false;
    for (let j = 0; j < c.length; j++) {
      if (S200[j] == null) continue;
      if (!acik) {
        const sart = c[j] > S100[j] && S50[j] > S200[j];
        if (sart && v && v[j] === 1) vetolandi[j] = 1;
        else if (sart) acik = true;
      } else if (c[j] < S100[j]) acik = false;
      d[j] = acik ? 1 : 0;
    }
    return { d, vetolandi };
  };
  const t = kos(null), d3 = kos(veto);
  const giris = c.map((x, j) => (S200[j] == null ? 0 : x > S100[j] && S50[j] > S200[j] ? 1 : 0));
  return { T: t.d, D3: d3.d, vetolandi: d3.vetolandi, giris, S50, S100, S200 };
}

/** Seri D'ye kesilmiş [[gün, kapanış]] → D kapanışındaki kararlar. */
function sistemKarari(gunluk) {
  const c = gunluk.map(x => x[1]);
  const S50 = Z.smaDizi(c, KURAL.F), S100 = Z.smaDizi(c, KURAL.E), S200 = Z.smaDizi(c, KURAL.S);
  // veto dizisi tam (VR her gün) — kesmede de aynı; hız için VR'yi yalnız gerekli günlerde hesapla
  const er = erDizi(c, KURAL.ER_N);
  const veto = new Array(c.length).fill(0), vrSonDeger = { j: -1, v: null };
  for (let j = 0; j < c.length; j++) {
    if (S200[j] == null || er[j] == null || !(er[j] < KURAL.ER_ESIK)) continue;
    const v = vrSon(c, j); if (j === c.length - 1) { vrSonDeger.j = j; vrSonDeger.v = v; }
    if (v != null && v < KURAL.VR_ESIK) veto[j] = 1;
  }
  const d = durumlar(c, veto);
  const i = c.length - 1;
  const r = (x, b = 2) => (x == null ? null : Math.round(x * 10 ** b) / 10 ** b);
  return {
    T: d.T[i], D3: d.D3[i], giris: d.giris[i], veto: veto[i], vetolandi: d.vetolandi[i],
    vr: r(vrSonDeger.j === i ? vrSonDeger.v : vrSon(c, i), 4), er: r(er[i], 4),
    sma: { 50: r(S50[i]), 100: r(S100[i]), 200: r(S200[i]) },
  };
}

// ═══ 2. KAYIT SATIRLARI (saf) ═══════════════════════════════════════════════
function kararSatirlari(veri, mevcut, { simdi, bas = BAS_KARAR } = {}) {
  const s = veri.seri, out = [];
  for (let i = 1; i < s.length; i++) {
    const g = s[i][0];
    if (g < bas || mevcut.has(g)) continue;
    const k = sistemKarari(s.slice(0, i + 1));
    out.push({ kararGunu: g, kapanis: s[i][1], oncekiGun: s[i - 1][0], oncekiKapanis: s[i - 1][1],
      kararlar: { T: k.T, D3: k.D3 }, giris: k.giris, vr: k.vr, er: k.er, veto: k.veto, vetolandi: k.vetolandi, sma: k.sma,
      kaynak: veri.kaynak || null, kayitZamani: new Date(simdi).toISOString(), gecikmeliKayit: i < s.length - 1 });
  }
  return out;
}

// ═══ 3. TÜRETME + METRİK (saf) ══════════════════════════════════════════════
const sirali = (kayit) => [...kayit].sort((a, b) => (a.kararGunu < b.kararGunu ? -1 : 1));

function turet(kayit, golge = []) {
  const K = new Map(kayit.map(x => [x.kararGunu, x]));
  const kol = new Map(golge.filter(x => x && x.gun && x.kol && Number.isFinite(x.kol.getiri)).map(x => [x.gun, x.kol.getiri]));
  const out = [];
  for (const D of [...K.keys()].sort()) {
    if (D < BAS_GETIRI) continue;
    const r = K.get(D), p = K.get(r.oncekiGun);
    if (!p) continue;
    const pp = K.get(p.oncekiGun);
    const rBtc = r.kapanis / r.oncekiKapanis - 1;
    const kolVar = kol.has(D), k = kolVar ? kol.get(D) : 0;
    const sat = { gun: D, rBtc, kol: k, kolVar, w: {}, hucum: {}, denge: {} };
    for (const { id } of SISTEMLER) {
      const w = p.kararlar[id], w0 = pp ? pp.kararlar[id] : w;
      sat.w[id] = w;
      sat.hucum[id] = w * rBtc - Math.abs(w - w0) * SPOT_MALIYET + k;
      sat.denge[id] = 0.5 * w * rBtc - 0.5 * Math.abs(w - w0) * SPOT_MALIYET + k;
    }
    out.push(sat);
  }
  return out;
}

/**
 * Veto olayları (ön kayıt §3): D3 vetoyla nakitte kalırken T'nin LONG AÇ yaptığı/ alımda olduğu ardışık günler tek olay.
 * Her olay için T'nin o işleminin sonucu (önlenen / kaçırılan / sürüyor) — betimleyici.
 */
function vetoOlaylari(kayit) {
  const s = sirali(kayit).filter(x => x.kararGunu >= BAS_KARAR);
  const olaylar = [];
  let ac = null;
  s.forEach((x, i) => {
    const vetoGun = x.vetolandi === 1 && x.kararlar.T === 1 && x.kararlar.D3 === 0;
    if (vetoGun && !ac) ac = { ilk: x.kararGunu, i, son: x.kararGunu, gun: 1 };
    else if (vetoGun) { ac.son = x.kararGunu; ac.gun++; }
    if (ac && (!vetoGun || i === s.length - 1)) { olaylar.push(ac); ac = null; }
  });
  return olaylar.map(o => {
    // T'nin o işleminin girişi: olaydan geriye T = 1 olan ilk gün; çıkışı: olaydan ileri T = 0 olan ilk gün
    let g = o.i; while (g > 0 && s[g - 1].kararlar.T === 1) g--;
    let c = o.i; while (c < s.length && s[c].kararlar.T === 1) c++;
    const giris = s[g], cikis = c < s.length ? s[c] : null;
    const tLog = cikis ? Math.log(cikis.kapanis / giris.kapanis) : null;
    const sure = cikis ? Math.round((Date.parse(cikis.kararGunu) - Date.parse(giris.kararGunu)) / GUN) : null;
    const tur = !cikis ? 'sürüyor' : sure <= TESTERE_GUN && tLog < 0 ? 'önlenen' : sure > TESTERE_GUN ? 'kaçırılan (geç giriş)' : 'diğer';
    return { ilk: o.ilk, son: o.son, vetoGun: o.gun, tGiris: giris.kararGunu, tCikis: cikis ? cikis.kararGunu : null, tSure: sure, tLog, tur };
  });
}

function eslikOlcu(T) {
  const gunler = T.map(x => x.gun);
  const sis = {};
  for (const id of ['D3', 'T']) {
    const w = T.map(x => x.w[id]);
    const isl = Z.islemler(gunler, w);
    const kapali = isl.filter(x => !x.acik);
    sis[id] = { hucum: Z.egriOlcu(T.map(x => x.hucum[id])), denge: Z.egriOlcu(T.map(x => x.denge[id])), islem: isl.length,
      testere: kapali.filter(x => x.gun <= TESTERE_GUN).length, sonKarar: w.length ? w[w.length - 1] : null };
  }
  const dH = T.map(x => Math.log(1 + x.hucum.D3) - Math.log(1 + x.hucum.T));
  const dD = T.map(x => Math.log(1 + x.denge.D3) - Math.log(1 + x.denge.T));
  const top = (a) => a.reduce((x, y) => x + y, 0);
  let c = 0, enDusuk = 0; for (const x of dH) { c += x; enDusuk = Math.min(enDusuk, c); }
  const V1 = enDusuk < VAZGEC.V1;
  const V2 = sis.D3.hucum.maxDD > VAZGEC.V2_mutlak && sis.D3.hucum.maxDD > sis.T.hucum.maxDD + VAZGEC.V2_fark;
  return { gun: T.length, farkliGun: T.filter(x => x.w.D3 !== x.w.T).length, sumH: top(dH), sumD: top(dD), enDusukSumH: enDusuk,
    bootT: Z.bootT(dH), aday_: sis.D3, taban: sis.T, vazgec: { V1, V2, esikV1: VAZGEC.V1, durum: V1 || V2 ? 'vazgeçildi' : 'izleniyor' } };
}

function araRapor(kayit, golge = [], { bugun = new Date().toISOString().slice(0, 10) } = {}) {
  const T = turet(kayit, golge);
  const s = sirali(kayit), son = s.length ? s[s.length - 1] : null;
  const m = eslikOlcu(T);
  const olaylar = vetoOlaylari(kayit);
  const kalan = Math.round((Date.parse(`${HUKUM_A}T00:00:00Z`) - Date.parse(`${bugun}T00:00:00Z`)) / GUN);
  return {
    deneme: DENEME, plan: 'PLAN-GOLGE-D3.md', baslangic: BAS_GETIRI, hukumTarihi: HUKUM_A, kesinHukum: HUKUM_B, kalanGun: kalan,
    satirSayisi: kayit.length, gecikmeliSatir: kayit.filter(x => x.gecikmeliKayit).length,
    sonKararGunu: son ? son.kararGunu : null, sonKararlar: son ? son.kararlar : null,
    bugunVeto: son ? { veto: son.veto, vr: son.vr, er: son.er, giris: son.giris } : null,
    gecenGun: T.length, kolEksikGun: T.filter(x => !x.kolVar).length, ilk: T.length ? T[0].gun : null, sonGun: T.length ? T[T.length - 1].gun : null,
    btcAlTut: Z.egriOlcu(T.map(x => x.rBtc)),
    olcu: m, vetoOlaylari: olaylar,
    olaySarti: { farkliGun: m.farkliGun, vetoOlayi: olaylar.length, esik: OLAY, saglandi: m.farkliGun >= OLAY.farkliGun && olaylar.length >= OLAY.vetoOlayi },
    not: 'Ara rapor — hüküm değil (PLAN-GOLGE-D3 §7). V1/V2 önceden yazılmış izleme kuralıdır.',
  };
}

/** Panel için kısa özet (İleri test → Hücum/Denge kartı satırı) — betimleyici, hüküm yok. */
function panelOzet(kayit, golge = [], o = {}) {
  const r = araRapor(kayit, golge, o);
  return { deneme: r.deneme, gecenGun: r.gecenGun, ilk: r.ilk, sonKararGunu: r.sonKararGunu,
    sonKarar: r.sonKararlar ? r.sonKararlar.D3 : null, tabanSonKarar: r.sonKararlar ? r.sonKararlar.T : null,
    bugunVeto: r.bugunVeto ? r.bugunVeto.veto : null,
    sumH: r.olcu.sumH, sumD: r.olcu.sumD, farkliGun: r.olcu.farkliGun, vetoOlayi: r.vetoOlaylari.length, olay: OLAY,
    durum: r.olcu.vazgec.durum, hukumTarihi: r.hukumTarihi, kesinHukum: r.kesinHukum, kalanGun: r.kalanGun, seri: birikimSerisi(kayit, golge) };
}
/** 63.1 (panel grafiği): günlüğe göre birikimli Hücum farkı (log puan), gün gün; yalnız betimleyici. */
function birikimSerisi(kayit, golge) {
  let c = 0;
  return turet(kayit, golge).map(x => { c += Math.log(1 + x.hucum.D3) - Math.log(1 + x.hucum.T); return { gun: x.gun, fark: c }; });
}

/** Hüküm (ön kayıt §3–§6). Tarihten önce çağrılırsa hüküm vermez. */
function hukum(kayit, golge = [], { bugun = new Date().toISOString().slice(0, 10) } = {}) {
  if (bugun < HUKUM_A) return { durum: 'bekliyor', metin: `henüz hüküm zamanı değil (${HUKUM_A})` };
  const kesin = bugun >= HUKUM_B;
  const sinir = kesin ? HUKUM_B : HUKUM_A;
  const k = kayit.filter(x => x.kararGunu <= sinir);
  const T = turet(k, golge);
  const m = eslikOlcu(T), olay = vetoOlaylari(k);
  if (m.vazgec.durum === 'vazgeçildi') return { durum: 'hüküm', hukum: 'vazgeçildi — taban kalır', m };
  if (!(m.farkliGun >= OLAY.farkliGun && olay.length >= OLAY.vetoOlayi)) return { durum: kesin ? 'kesin' : 'ertelendi', hukum: kesin ? 'sonuçsuz — taban kalır, izleme kapanır' : `ertelendi (${HUKUM_B})`, m, olay };
  const a = m.aday_, t = m.taban;
  const G = {
    G1: m.sumH > 0 && m.sumD > 0,
    G2: a.hucum.maxDD <= t.hucum.maxDD + 0.02 && a.denge.maxDD <= t.denge.maxDD + 0.02,
    G3: a.testere <= t.testere,
    G4: m.bootT != null && m.bootT >= T_ZAYIF,
  };
  const hepsi = Object.values(G).every(Boolean);
  return { durum: kesin ? 'kesin' : 'hüküm', tarih: bugun, G, m, olay,
    hukum: !hepsi ? 'taban kalır' : m.bootT >= T_GUCLU ? 'canlıya önerilir — güçlü' : 'canlıya önerilir — zayıf',
    not: 'Canlıya önerilir otomatik geçiş değildir: kullanıcı onayı + ayrı canlı plan gerekir (PLAN-GOLGE-D3 §5).' };
}

// ═══ 4. ÇALIŞTIR ════════════════════════════════════════════════════════════
const dosyalar = (dizin = I.VARSAYILAN_DIZIN) => ({
  kayit: path.join(dizin, 'range-veto-kayit.jsonl'),
  golge: path.join(dizin, 'bindirme-golge.jsonl'),
  getiri: path.join(dizin, 'range-veto-getiri.json'),
  son: path.join(dizin, 'range-veto-son.json'),
});

/** Bir çalışma: BTC perp 1d indir (ya da verilen seri) → kayıt ekle → türetilmiş getiri + ara rapor. Idempotent. */
async function calistir({ simdi = Date.now(), dizin = I.VARSAYILAN_DIZIN, indir = null, veri = null } = {}) {
  const F = dosyalar(dizin);
  return I.kilitle(dizin, async () => {
    const t0 = Date.now();
    const v = veri || (indir ? await indir(simdi) : await I.btcIndir(simdi));
    const mevcutSat = I.satirlariOku(F.kayit);
    const yeni = kararSatirlari(v, new Set(mevcutSat.map(x => x.kararGunu)), { simdi });
    I.ekle(F.kayit, yeni);
    const kayit = [...mevcutSat, ...yeni];
    const golge = I.satirlariOku(F.golge);
    const bugun = new Date(simdi).toISOString().slice(0, 10);
    const turev = { uretim: new Date(simdi).toISOString(), not: 'TÜRETİLMİŞ — range-veto-kayit.jsonl + bindirme-golge.jsonl (kol) dosyalarından yeniden üretilir; elle düzenlemeyin',
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
  SISTEMLER, KURAL, VAZGEC, OLAY, BAS_KARAR, BAS_GETIRI, HUKUM_A, HUKUM_B, TESTERE_GUN, T_ZAYIF, T_GUCLU, DENEME, SPOT_MALIYET,
  erDizi, vrDizi, vrSon, vetoDizi, durumlar, sistemKarari, kararSatirlari, turet, vetoOlaylari, eslikOlcu, araRapor, panelOzet, hukum,
  dosyalar, calistir,
};
