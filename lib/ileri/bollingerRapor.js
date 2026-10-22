/**
 * İLERİ VERİ RAPORU — Bollinger "düşüş azaltıcı" (PLAN-ILERI-BOLLINGER.md, ÖN-KAYIT; birebir).
 *
 * Girdi YALNIZ kayıt satırlarıdır (bollinger-kayit.jsonl); getiriler buradan TÜRETİLİR (yeniden
 * üretilebilir). Ara rapor yalnız BETİMLEYİCİDİR — hüküm vermez. Hüküm `hukum()` ile ve yalnız
 * ön-kayıtlı tarihlerde hesaplanır; erken çağrılırsa "henüz hüküm zamanı değil" döner.
 *
 * TÜRETME (trendKurallari.getiriler ile aynı formül, ileri döneme uyarlanmış):
 *   gün r (kararGunu D) için önceki satır p (kararGunu = r.oncekiGun):
 *     g = r.kapanis / r.oncekiKapanis − 1                 (ikisi de AYNI anlık veriden)
 *     getiri_C = p[C] · g − |p[C] − pp[C]| · %0,12        (pp = p'den önceki satır)
 *   İlk karardan önce NAKİT varsayılır (pp yoksa 0): ileri portföy 2026-10-07'de nakitten başlar —
 *   ilk gün LONG ise giriş maliyeti ve bir LONG AÇ sayılır. Arada satır eksikse (p yok) o gün
 *   "boşluk" sayılır ve atlanır; pp eksikse (p ilk satır değil) maliyet yazılmaz.
 *   Al-tut: g (maliyetsiz, H2 ile aynı).
 * METRİK (H2 ile aynı): Sharpe = ort/σ(popülasyon)·√A (A: kripto ve BTC 365, diğerleri 252;
 *   σ = 0 → 0), MaxDD özsermaye eğrisinden (pozitif büyüklük), işlem = LONG AÇ (0→1) sayısı.
 *   Beraberlik |Δ| < 1e-9 "daha iyi değil" sayılır ve n'de kalır. İşaret testi tek taraflı binom.
 *
 * KRİTERLER — ön-kayıttaki metinde açık bırakılan iki noktanın YORUMU (kod sabiti, değişmez):
 *   · "Seri" kümesi 37 seridir (BTC dahil): Kriter 1 "seri sayısı" der ve düşüş olayı da 37 seri
 *     üzerinden tanımlıdır. Kriter 3 "varlıklar genelinde" medyanı da aynı 37 seri üzerinden
 *     (ileri dönemde en az bir getiri günü olan, eksik olmayan seriler) alınır.
 *   · "Eksik" seri: hiç getiri günü yok ya da son kaydı değerlendirme tarihinden 30 günden eski
 *     (kaynaktan kesilmiş) → kriterlerin dışında kalır ve raporda listelenir.
 */
const I = require('./bollingerIzleme');

const HUKUM_A = '2027-10-07';   // 12 ay — düşüş olayı şartıyla
const HUKUM_B = '2028-10-07';   // 24 ay — kesin
const MALIYET = 0.0012;
const ESIK = 1e-9;
const DD_OLAY = 0.15, OLAY_SERI = 8;
const BAYAT_GUN = 30;
const ADAYLAR = ['C0', 'C1', 'C3'];

const gunFark = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const bugunStr = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const yillik = (seri) => (I.SINIF.get(seri) === 'kripto' ? 365 : 252);

/** Kayıt satırları → seri başına türetilmiş günlük getiriler. */
function turet(satirlar) {
  const gruplar = new Map();
  for (const x of satirlar) {
    if (!gruplar.has(x.seri)) gruplar.set(x.seri, new Map());
    const m = gruplar.get(x.seri);
    if (!m.has(x.kararGunu)) m.set(x.kararGunu, x);             // aynı anahtar ikinci kez gelirse İLKİ geçerli
  }
  const out = {};
  for (const [seri, m] of gruplar) {
    const gunler = [...m.keys()].sort();
    const ilk = gunler[0];
    const gunluk = [];
    let bosluk = 0;
    for (const D of gunler) {
      const r = m.get(D);
      if (D === ilk) continue;
      const p = m.get(r.oncekiGun);
      if (!p) { bosluk++; continue; }
      const pp = m.get(p.oncekiGun);
      const g = r.kapanis / r.oncekiKapanis - 1;
      const gun = { gun: D, karar: p.kararGunu, AT: g, w: {}, acilis: {} };
      for (const c of ADAYLAR) {
        const w = p[c], w0 = pp ? pp[c] : (p.kararGunu === ilk ? 0 : w);
        gun[c] = w * g - Math.abs(w - w0) * MALIYET;
        gun.w[c] = w;
        gun.acilis[c] = w === 1 && w0 === 0 ? 1 : 0;
      }
      gunluk.push(gun);
    }
    const son = m.get(gunler[gunler.length - 1]);
    out[seri] = { seri, ilkKararGunu: ilk, sonKararGunu: son.kararGunu, sonKarar: { C0: son.C0, C1: son.C1, C3: son.C3 }, kayit: gunler.length, bosluk, gunluk };
  }
  return out;
}

function metrik(r, A) {
  let n = 0, top = 0, top2 = 0, oz = 1, tepe = 1, dd = 0;
  for (const x of r) {
    n++; top += x; top2 += x * x; oz *= 1 + x;
    if (oz > tepe) tepe = oz; const d = 1 - oz / tepe; if (d > dd) dd = d;
  }
  if (!n) return { n: 0, getiri: 0, maxdd: 0, sharpe: 0 };
  const ort = top / n, sd = Math.sqrt(Math.max(0, top2 / n - ort * ort));
  return { n, getiri: oz - 1, maxdd: dd, sharpe: sd > 1e-15 ? (ort / sd) * Math.sqrt(A) : 0 };
}

function binomUst(k, n) { // P(X ≥ k), X ~ Bin(n, 0,5)
  let p = 0; for (let i = k; i <= n; i++) { let c = 1; for (let t = 0; t < i; t++) c = (c * (n - t)) / (t + 1); p += c; }
  return n ? p / Math.pow(2, n) : 1;
}
const medyan = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

/**
 * Seri başına ileri dönem metrikleri, [BAS_GETIRI, bitis] getiri günleri.
 * @returns [{ seri, ad, sinif, gun, eksik, eksikNeden, sonKararGunu, sonKarar, m: {C0, C1, C3, AT} (+ islem) }]
 */
function seriMetrikleri(turev, bitis) {
  const out = [];
  for (const [seri, ad, sinif] of I.SERILER) {
    const t = turev[seri];
    const gunler = t ? t.gunluk.filter(g => g.gun >= I.BAS_GETIRI && g.gun <= bitis) : [];
    let eksikNeden = null;
    if (!t) eksikNeden = 'kayıt yok';
    else if (!gunler.length) eksikNeden = 'ileri dönemde getiri günü yok';
    else if (gunFark(t.gunluk.filter(g => g.gun <= bitis).slice(-1)[0].gun, bitis) > BAYAT_GUN) eksikNeden = `son kayıt ${BAYAT_GUN} günden eski (kaynak kesilmiş)`;
    const A = yillik(seri);
    const m = {};
    for (const c of [...ADAYLAR, 'AT']) m[c] = metrik(gunler.map(g => g[c]), A);
    for (const c of ADAYLAR) m[c].islem = gunler.reduce((s, g) => s + g.acilis[c], 0);
    m.AT.islem = gunler.length ? 1 : 0;
    out.push({ seri, ad, sinif, gun: gunler.length, eksik: !!eksikNeden, eksikNeden, sonKararGunu: t ? t.sonKararGunu : null, sonKarar: t ? t.sonKarar : null, bosluk: t ? t.bosluk : 0, m });
  }
  return out;
}

/** Düşüş olayı: al-tut MaxDD ≥ %15 olan seri sayısı ≥ 8. */
function dususOlayi(sm) {
  const seriler = sm.filter(s => !s.eksik && s.m.AT.maxdd >= DD_OLAY - ESIK).map(s => s.seri);
  return { sayi: seriler.length, esikSeri: OLAY_SERI, ddEsik: DD_OLAY, olay: seriler.length >= OLAY_SERI, seriler };
}

/** Ön-kayıtlı üç kriterin değerleri (betimleyici — çağıran hüküm zamanı değilse yorumlamaz). */
function kriterler(sm) {
  const gecerli = sm.filter(s => !s.eksik);
  const uygun = gecerli.filter(s => s.m.C0.islem >= 1 && s.m.C1.islem >= 1);
  const k = uygun.filter(s => s.m.C1.maxdd < s.m.C0.maxdd - ESIK).length, n = uygun.length;
  const p = binomUst(k, n);
  const k1 = { n, k, oran: n ? k / n : null, p, gecer: n > 0 && k / n > 0.5 && p < 0.05, seriler: uygun.map(s => s.seri) };
  const b = sm.find(s => s.seri === I.BTC_SERI);
  const k2 = b && !b.eksik ? { mevcut: true, ddC0: b.m.C0.maxdd, ddC1: b.m.C1.maxdd, gecer: b.m.C1.maxdd <= b.m.C0.maxdd + ESIK } : { mevcut: false, gecer: null };
  const farklar = gecerli.map(s => s.m.C1.sharpe - s.m.C0.sharpe);
  const med = medyan(farklar);
  const k3 = { n: farklar.length, medyanDSharpe: med, esik: -0.20, gecer: med != null && med >= -0.20 };
  return { k1, k2, k3 };
}

function hukumMetni(kr) {
  if (kr.k1.gecer && kr.k3.gecer) return 'Bollinger düşüş azaltıcı olarak DOĞRULANDI (Kairos/Tao\'ya düşüş azaltıcı seçenek olarak eklenmesi önerilir)';
  if (!kr.k1.gecer) return 'doğrulanmadı';
  return 'düşüşü azaltıyor ama bedeli fazla';
}

function degerlendir(satirlar, bitis) {
  const sm = seriMetrikleri(turet(satirlar), bitis);
  return { bitis, seriler: sm, dusus: dususOlayi(sm), kriter: kriterler(sm) };
}

/**
 * HÜKÜM — yalnız ön-kayıtlı tarihlerde. `bugun` < 2027-10-07 → "henüz hüküm zamanı değil".
 * 12. ayda düşüş olayı yoksa 24. aya ertelenir; 24. ayda olay şartı aranmaz.
 */
function hukum(satirlar, bugun = bugunStr()) {
  if (bugun < HUKUM_A) return { durum: 'henuz', mesaj: 'henüz hüküm zamanı değil', sonrakiTarih: HUKUM_A, kalanGun: gunFark(bugun, HUKUM_A) };
  const a = degerlendir(satirlar, HUKUM_A);
  if (a.dusus.olay) return { durum: 'hukum', tarih: HUKUM_A, kol: 'a (12 ay + düşüş olayı)', hukum: hukumMetni(a.kriter), ...a };
  if (bugun < HUKUM_B) return { durum: 'ertelendi', mesaj: `12. ayda düşüş olayı yok (${a.dusus.sayi}/${OLAY_SERI} seri) — hüküm 24. aya ertelendi (sonuçsuz)`, sonrakiTarih: HUKUM_B, kalanGun: gunFark(bugun, HUKUM_B), dusus: a.dusus };
  const b = degerlendir(satirlar, HUKUM_B);
  return { durum: 'hukum', tarih: HUKUM_B, kol: 'b (24 ay, kesin)', hukum: hukumMetni(b.kriter), ...b };
}

/**
 * 63.1 (panel İleri test grafikleri): günlük getirilerden "o güne kadarki en derin düşüş" serisi — yalnız betimleyici,
 * hükümde kullanılmaz (metrik() ile aynı tanım: 1 − özsermaye / tepe).
 */
function ddSerisi(getiriler) {
  let oz = 1, tepe = 1, dd = 0;
  return getiriler.map(r => { oz *= 1 + (Number.isFinite(r) ? r : 0); if (oz > tepe) tepe = oz; dd = Math.max(dd, 1 - oz / tepe); return dd; });
}

/** Gölge (bilgi): Hücum / Denge × C0 / C1 / C3 ileri dönem metrikleri. */
function golgeOzet(golge, bitis) {
  const g = [...new Map(golge.map(x => [x.gun, x])).values()].filter(x => x.gun <= bitis).sort((a, b) => (a.gun < b.gun ? -1 : 1));
  const o = { gun: g.length, ilk: g.length ? g[0].gun : null, son: g.length ? g[g.length - 1].gun : null };
  for (const ad of ['hucum', 'denge']) { o[ad] = {}; for (const c of ADAYLAR) o[ad][c] = metrik(g.map(x => x[ad][c]), 365); }
  o.kol = metrik(g.map(x => x.kol.getiri), 365);
  // 63.1: panel grafiği — çalışan kural (C0) için günlük en derin düşüş.
  const ddH = ddSerisi(g.map(x => x.hucum.C0)), ddD = ddSerisi(g.map(x => x.denge.C0));
  o.seri = g.map((x, i) => ({ gun: x.gun, hucum: ddH[i], denge: ddD[i] }));
  // PLAN-ILERI-HUCUM-DENGE.md A: çalışan kural (C0) gölge ileri MaxDD'si, en yakın ufkun p95/p99'una göre
  // (yalnız gösterge + alarm; "DUR" kural değiştirmez). Eşiklerin tek kaynağı hucumDengeEsikleri.js.
  const HD = require('./hucumDengeEsikleri');
  // Hücum-S (PLAN-ILERI-HUCUM-S.md, deneme 861): ayrı Hücum-S gölgesi yok → Hücum C0 gölgesine Hücum-S bantları (tutucu).
  o.model = g.length ? { hucum: HD.modelDurumu('hucum', g.length, o.hucum.C0.maxdd), denge: HD.modelDurumu('denge', g.length, o.denge.C0.maxdd),
    hucumS: { ...HD.modelDurumu('hucumS', g.length, o.hucum.C0.maxdd), golge: 'hucum C0', plan: HD.PLANLAR.hucumS }, plan: HD.PLAN } : null;
  return o;
}

/** ARA RAPOR — yalnız betimleyici; hüküm içermez. */
function araRapor(satirlar, golge = [], bugun = bugunStr()) {
  const bitis = bugun;
  const d = degerlendir(satirlar, bitis);
  const sonraki = bugun < HUKUM_A ? HUKUM_A : HUKUM_B;
  const gecerli = d.seriler.filter(s => !s.eksik);
  const kiyas = { c1Dusuk: 0, c0Dusuk: 0, esit: 0, n: gecerli.length };
  for (const s of gecerli) {
    const f = s.m.C1.maxdd - s.m.C0.maxdd;
    if (f < -ESIK) kiyas.c1Dusuk++; else if (f > ESIK) kiyas.c0Dusuk++; else kiyas.esit++;
  }
  const btc = d.seriler.find(s => s.seri === I.BTC_SERI);
  // 63.1: panel grafiği — BTC'de mevcut kural (C0) ve Bollinger'li kural (C1) için günlük en derin düşüş.
  const btcGunluk = ((turet(satirlar)[I.BTC_SERI] || {}).gunluk || []).filter(x => x.gun <= bitis);
  const dd0 = ddSerisi(btcGunluk.map(x => x.C0)), dd1 = ddSerisi(btcGunluk.map(x => x.C1));
  const btcSeri = btcGunluk.map((x, i) => ({ gun: x.gun, C0: dd0[i], C1: dd1[i] }));
  const kayitliSeri = new Set(satirlar.map(x => x.seri));
  return {
    uyari: 'ARA RAPOR — HÜKÜM DEĞİL. Ön-kayıt (PLAN-ILERI-BOLLINGER.md): ara raporlarda hüküm verilmez, kurala dokunulmaz; erken bakıp karar değiştirmek yasak.',
    baslangic: I.BAS_GETIRI, ilkKararGunu: I.BAS_KARAR, bugun,
    gecenGun: Math.max(0, gunFark(I.BAS_GETIRI, bugun)),
    hukumTarihleri: { a: HUKUM_A, b: HUKUM_B }, sonrakiHukumTarihi: sonraki, kalanGun: gunFark(bugun, sonraki),
    satirSayisi: satirlar.length, kayitliSeri: kayitliSeri.size, toplamSeri: I.SERILER.length,
    sonKararGunu: satirlar.reduce((m, x) => (x.kararGunu > m ? x.kararGunu : m), ''),
    gecikmeliSatir: satirlar.filter(x => x.gecikmeliKayit).length,
    eksik: d.seriler.filter(s => s.eksik).map(s => ({ seri: s.seri, neden: s.eksikNeden })),
    dusus: d.dusus,
    kiyas,
    btc: btc ? { gun: btc.gun, C0: btc.m.C0, C1: btc.m.C1, C3: btc.m.C3, AT: btc.m.AT, sonKarar: btc.sonKarar, sonKararGunu: btc.sonKararGunu, seri: btcSeri } : null,
    kriterDurumu: { not: 'O ANKİ değerler — yalnız betimleyici, hüküm değil', ...d.kriter },
    seriler: d.seriler,
    golge: golgeOzet(golge, bitis),
  };
}

module.exports = { ddSerisi, HUKUM_A, HUKUM_B, DD_OLAY, OLAY_SERI, turet, metrik, binomUst, medyan, seriMetrikleri, dususOlayi, kriterler, hukum, hukumMetni, araRapor, degerlendir, golgeOzet };
