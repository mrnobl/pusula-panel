/**
 * İLERİ GÖLGE TESTİ — BIST nakit temettü ex-gün kuralı (T1, geçmiş deneme 585) · deneme 970 · PLAN-ILERI-TEMETTU.md.
 * EMİR YOK, PARA YOK, ANAHTAR YOK: yalnız herkese açık veriyle kâğıt kayıt. lib/live, lib/risk, engine, exchange'e DOKUNMAZ.
 *
 * KURAL: lib/research/bistTemettu.js (geçmiş testle AYNI işlevler — evren, olay getirisi, stopaj, likidite). Burada yalnız
 * VERİ YOLU ve ileri takvim var:
 *   · Fiyat: Yahoo v8 günlük (.IS, temettüye göre düzeltilmemiş kapanış/açılış; scripts/bist-indir.js donustur ile AYNI dönüşüm),
 *     USDTRY=X. Havuz geçmiş testinki (GUNCEL + ESKI).
 *   · İLERİ TEMETTÜ TAKVİMİ: İş Yatırım şirket kartı "Temettü" tablosu (duyurulmuş ileri tarihli dağıtımları da içerir; geçmiş testin
 *     birincil kaynağı) — her çalışmada evrendeki hisseler + bekleyen olaylar. Gözlemler `takvim.jsonl`ye YALNIZ EKLENİR (görülme
 *     zamanıyla). Bir olay ancak ex-günden önceki işlem günü 18:00 TSİ'den (kapanış seansı) ÖNCE takvimde görüldüyse "önceden
 *     bilinen" sayılır; sonradan görülenler kaydedilir ama ölçüme girmez (ileriye bakma yok).
 *   · D/P = brüt TL / İş Yatırım nominal kapanış (ex-günden önceki son gün; HisseTekil) — geçmiş testle aynı.
 * MALİYET: Midas BIST komisyonu 0; ANA model tek yön %0,10 (BSMV, borsa payı, seans fiyatı belirsizliği) + %0,05 kayma = %0,15
 *   → gidiş-dönüş %0,30. Geçmiş testin A (%0,01) ve B (%0,08) senaryoları yanında bilgi olarak yazılır.
 * UYGULANABİLİRLİK: kâğıtta d−1 kapanış seansı fiyatıyla alınır, d açılış seansı fiyatıyla satılır. Midas'ta açılış/kapanış seansı
 *   emri verilebildiği DOĞRULANMADI — kartta not olarak yazılır.
 *
 * VERİ (data/ileri/temettu/, git dışı): yahoo/<sembol>.json (önbellek) · nominal/<HİSSE>-<exGün>.json (bir kez) · takvim.jsonl ·
 *   kayit.jsonl (YALNIZ EKLENİR: olay · dur) · son.json (özet; panel bunu okur).
 * Her çalışmada kayıtlı olaylar yeniden hesaplanır; fark → UYARI (`degisen`), kayıt değişmez. Ara rapor YALNIZ BETİMLEYİCİ;
 * `hukum()` 2027-10-26 öncesi "henüz karar zamanı değil".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const I = require('./bollingerIzleme');
const K = require('../research/bistTemettu');

const DENEME = 970;
const GECMIS_DENEME = 585;
const PLAN = 'PLAN-ILERI-TEMETTU.md';
const BAS = '2026-10-26';              // ilk ex-günü (alış 2026-10-23 kapanışı)
const ARA_KONTROL = '2027-04-26';
const KARAR = '2027-10-26';
const KARAR_ERTELEME = '2028-10-26';
const EN_AZ_OLAY = 30;
const MALIYET_ANA = 0.0010 + 0.0005;   // tek yön: model %0,10 + kayma %0,05
const FAIZ = 0.37;                     // PPF iskontosu için politika faizi (ön kayıt sabiti; etkisi olay başına < %0,01)
const V1 = Object.freeze({ enAzOlay: 15, ortNet: -0.003 });
const V2 = Object.freeze({ dd: -0.10 });
const KESIM_UTC_SAAT = 15;             // d−1 18:00 TSİ = 15:00 UTC (kapanış seansı başlangıcı)
const GUN = 864e5;
const YAHOO_GERI_GUN = 800;
const YAHOO_TAZE_MS = 6 * 3600e3;      // önbellek bundan yeniyse yeniden indirilmez (sunucu aynı gün yeniden dener)
const ISY_TAZE_MS = 18 * 3600e3;       // şirket kartı en çok ~günde bir taranır
/** Sınırlı eşzamanlı çalıştırma (sıra korunur). */
async function havuzla(l, n, fn) { const out = new Array(l.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, l.length) }, async () => { while (i < l.length) { const k = i++; out[k] = await fn(l[k], k); } })); return out; }

const gs = (t) => new Date(t).toISOString().slice(0, 10);
const gt = (g) => Date.parse(`${g}T00:00:00Z`);
const tsiGun = (ms) => gs(ms + 3 * 3600e3);
const tsiSaat = (ms) => new Date(ms + 3 * 3600e3).getUTCHours();
const sha = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);
const okuJ = (p, v = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return v; } };
function yazJ(p, o) { fs.mkdirSync(path.dirname(p), { recursive: true }); const t = `${p}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o), 'utf8'); fs.renameSync(t, p); }

/** Havuz (geçmiş testle aynı). Tembel: bist-indir yalnız sabit listeler + donustur verir (yükleyince indirme yapmaz). */
const bistIndir = () => require('../../scripts/bist-indir');
const havuz = () => { const B = bistIndir(); return [...new Set([...B.GUNCEL, ...B.ESKI])]; };

const dosyalar = (dizin = I.VARSAYILAN_DIZIN) => {
  const k = path.join(dizin, 'temettu');
  return { kok: k, yahoo: path.join(k, 'yahoo'), nominal: path.join(k, 'nominal'), takvim: path.join(k, 'takvim.jsonl'), kayit: path.join(k, 'kayit.jsonl'), son: path.join(k, 'son.json') };
};

/* ═══════════ AĞ (herkese açık, anahtarsız) ═══════════ */
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' };
const trGun = (g) => g.split('-').reverse().join('-');
function gercekAg({ fetchFn = fetch } = {}) {
  const bekle = (ms) => new Promise(r => setTimeout(r, ms));
  return {
    /** Yahoo chart sonucu (x) | null (yok). Ağ hatası fırlatır. */
    async yahoo(y, simdi) {
      const p1 = Math.floor((simdi - YAHOO_GERI_GUN * GUN) / 1000), p2 = Math.floor(simdi / 1000) + 86400;
      return I.tekrarla(async () => {
        const r = await fetchFn(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?period1=${p1}&period2=${p2}&interval=1d&events=div%2Csplit`, { headers: UA });
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`${y}: HTTP ${r.status}`);
        const j = await r.json(); const x = j.chart && j.chart.result && j.chart.result[0];
        await bekle(250);
        return x && x.timestamp ? x : null;
      });
    },
    /** İş Yatırım şirket kartı HTML. */
    async isyKart(s) {
      return I.tekrarla(async () => {
        const r = await fetchFn(`https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${s}`, { headers: UA });
        if (!r.ok) throw new Error(`${s} şirket kartı HTTP ${r.status}`);
        const h = await r.text(); await bekle(400); return h;
      });
    },
    /** İş Yatırım HisseTekil nominal kapanış: [[gün, HG_KAPANIS]] (bas..bit). */
    async isyFiyat(s, bas, bit) {
      return I.tekrarla(async () => {
        const r = await fetchFn(`https://www.isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/Data.aspx/HisseTekil?hisse=${s}&startdate=${trGun(bas)}&enddate=${trGun(bit)}`, { headers: UA });
        if (!r.ok) throw new Error(`${s} HisseTekil HTTP ${r.status}`);
        const j = await r.json(); await bekle(300);
        return (j.value || []).map(x => { const [d, mo, y] = x.HGDG_TARIH.split('-'); return [`${y}-${mo}-${d}`, x.HG_KAPANIS]; }).filter(x => x[1] > 0);
      });
    },
  };
}

/* ═══════════ SAF HESAPLAR ═══════════ */
/** 2 iş günü (hafta içi) sonrası takvim günü farkı (PPF iskontosu; tatil ayrımı yok — ön kayıt). */
function odemeGunu(exGun) { let g = exGun, n = 0; while (n < K.T1.odemeGecikmeIsGunu) { g = gs(gt(g) + GUN); const h = new Date(gt(g)).getUTCDay(); if (h >= 1 && h <= 5) n++; } return g; }
const iskonto = (exGun, faiz = FAIZ) => 1 / (1 + K.ppfOran(faiz) * ((gt(odemeGunu(exGun)) - gt(exGun)) / GUN) / 365);

/**
 * Saf: Yahoo verisinden kural dünyası (geçmiş testin takvim / hizalama / evren işlevleriyle).
 * @param yahoo Map(hisse → donustur çıktısı) ; usd: donustur çıktısı (USDTRY=X) ; sonGun: dahil edilecek son gün (TSİ, 'YYYY-AA-GG')
 */
function dunyaKur(yahoo, usd, sonGun) {
  const sonVeri = gt(sonGun) + GUN;
  const hisse = new Map();
  for (const [s, v] of yahoo) { if (!v || !v.gunler) continue; const satir = K.satirHazirla(v.gunler, sonVeri); if (satir.length) hisse.set(s, satir); }
  const takvim = K.takvimKur(hisse.values());
  const H = [];
  for (const [s, satir] of hisse) { const { bar, sonIdx } = K.hizala(satir, takvim); H.push({ s, satir, bar, sonIdx }); }
  const Hm = new Map(H.map(h => [h.s, h]));
  const usdSira = (usd && usd.gunler ? usd.gunler : []).filter(x => x.c > 0 && x.t < sonVeri).sort((a, b) => a.t - b.t);
  const USD = new Float64Array(takvim.length); { let son = NaN, j = 0; for (let d = 0; d < takvim.length; d++) { while (j < usdSira.length && usdSira[j].t <= takvim[d]) son = usdSira[j++].c; USD[d] = son; } }
  const ayBasi = K.ayBasiDizisi(takvim);
  const onb = new Map();
  const sirali = (d) => { if (!onb.has(d)) onb.set(d, K.evrenSirali(H, takvim, d)); return onb.get(d); };
  const evren = (d, n = K.T1.evrenN) => (ayBasi[d] >= 0 ? sirali(ayBasi[d]).slice(0, n) : []);
  const gunIdx = new Map(takvim.map((t, i) => [gs(t), i]));
  return { takvim, H, Hm, USD, ayBasi, evren, gunIdx };
}

/** Takvim gözlemleri → (hisse|exGün) → gözlemler (görülme sırasıyla). */
function takvimHaritasi(gozlem) {
  const m = new Map();
  for (const x of gozlem) { const k = `${x.s}|${x.exGun}`; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  for (const l of m.values()) l.sort((a, b) => (a.gorulme < b.gorulme ? -1 : 1));
  return m;
}
/** Kesim anı: ex-günden önceki işlem günü 18:00 TSİ. */
const kesimAni = (cumGun) => gt(cumGun) + KESIM_UTC_SAAT * 3600e3;

/**
 * Saf: kesinleşmiş olaylar. Bir olay = evren(d−1) içindeki hissenin takvimdeki ex-günü d (d ≥ BAS, d günü satırı kapanmış).
 * nominal(s, exGun) → nominal kapanış | null (yoksa olay "bekliyor").
 * → { olaylar: [...], bekleyen: [...], atilan: [...] }
 */
function olaylariHesapla(W, harita, nominal, { bas = BAS, sonGun }) {
  const olaylar = [], bekleyen = [], atilan = [];
  const gece = new Map();
  for (const [k, l] of harita) {
    const [s, exGun] = k.split('|');
    if (exGun < bas || exGun > sonGun) continue;
    const d = W.gunIdx.get(exGun);
    if (d == null || d < 1) { atilan.push({ s, exGun, neden: 'ex-gün işlem günü değil' }); continue; }
    const cumGun = gs(W.takvim[d - 1]);
    const ev = W.evren(d - 1);
    if (!ev.includes(s)) continue;                         // evren dışı (bilgi değil)
    const h = W.Hm.get(s);
    const b = h && h.bar[d], cum = h && h.bar[d - 1];
    if (!b) { atilan.push({ s, exGun, neden: 'ex-gün hissede işlem yok' }); continue; }
    if (!cum) { atilan.push({ s, exGun, neden: 'önceki işlem günü hissede işlem yok' }); continue; }
    const once = l.filter(x => Date.parse(x.gorulme) < kesimAni(cumGun));
    const gecerli = once.length ? once[once.length - 1] : l[l.length - 1];
    const nom = nominal(s, exGun);
    if (nom == null) { bekleyen.push({ s, exGun, neden: 'nominal kapanış alınamadı' }); continue; }
    const dp = gecerli.brutTL / nom;
    if (!K.dpGecerli(dp)) { atilan.push({ s, exGun, neden: `D/P geçersiz (${dp})` }); continue; }
    const dpNet = dp * (1 - K.stopaj(W.takvim[d]));
    const isk = iskonto(exGun);
    const brut = K.t1Brut({ cumKapanis: cum.c, exAcilis: b.o, dpNet, iskonto: isk });
    const o = { s, exGun, cumGun, cumKapanis: cum.c, exAcilis: b.o, exKapanis: b.c, brutTL: gecerli.brutTL, nominal: nom, dp, dpNet, iskonto: isk, brut,
      net: { ana: K.t1Net(brut, MALIYET_ANA), A: K.t1Net(brut, K.MALIYET.A), B: K.t1Net(brut, K.MALIYET.B) },
      onceden: once.length > 0, ilkGorulme: l[0].gorulme, evrenSira: ev.indexOf(s) + 1, ciro: cum.ciro, usdtry: W.USD[d - 1], gunIci: b.c / b.o - 1, _d: d };
    olaylar.push(o);
    if (o.onceden) { if (!gece.has(d)) gece.set(d, []); gece.get(d).push(o); }
  }
  for (const [, a] of gece) { const w = 1 / a.length; for (const o of a) { o.w = w; o.likidite = K.likiditeTamam(W.Hm.get(o.s).bar[o._d - 1], w, W.USD[o._d - 1]); } }
  for (const o of olaylar) { if (!o.onceden) { o.w = 0; o.likidite = null; } delete o._d; o.imza = imza(o); }
  olaylar.sort((a, b) => (a.exGun < b.exGun ? -1 : a.exGun > b.exGun ? 1 : a.s < b.s ? -1 : 1));
  return { olaylar, bekleyen, atilan };
}
const IMZA = ['s', 'exGun', 'cumGun', 'cumKapanis', 'exAcilis', 'brutTL', 'nominal', 'dp', 'brut', 'onceden', 'w', 'likidite'];
const imza = (o) => sha(IMZA.map(k => (o[k] === undefined ? null : o[k])));

/** Saf: ölçüme giren olay (önceden bilinen ve likidite tamam). */
const sayilan = (o) => o.tur !== 'dur' && o.onceden && o.likidite === true;
function ist(r) {
  const n = r.length; if (!n) return { n: 0, ort: null, t: null, isabet: null };
  const o = r.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(r.reduce((a, b) => a + (b - o) ** 2, 0) / (n - 1)) : NaN;
  return { n, ort: o, t: sd > 0 ? o / (sd / Math.sqrt(n)) : null, isabet: r.filter(x => x > 0).length / n };
}
/** Saf: özet (ara rapor — yalnız betimleyici). */
function ozetle(olaylar, { kadar = null } = {}) {
  const l = olaylar.filter(o => !kadar || o.exGun <= kadar);
  const s = l.filter(sayilan);
  const gece = new Map(); for (const o of s) gece.set(o.exGun, (gece.get(o.exGun) || 0) + o.w * o.net.ana);
  let E = 1, tepe = 1, dd = 0; const seri = [];
  for (const g of [...gece.keys()].sort()) { E *= 1 + gece.get(g); tepe = Math.max(tepe, E); dd = Math.min(dd, E / tepe - 1); seri.push({ gun: g, E }); }
  return { olay: s.length, kayitli: l.length, sonradanGorulen: l.filter(o => !o.onceden).length, likiditeDisi: l.filter(o => o.onceden && o.likidite === false).length,
    ana: ist(s.map(o => o.net.ana)), A: ist(s.map(o => o.net.A)), B: ist(s.map(o => o.net.B)), brutOrt: ist(s.map(o => o.brut)).ort,
    gunIciOrt: ist(s.map(o => o.gunIci)).ort, gece: gece.size, toplam: E - 1, maxDD: dd, seri, son: s.length ? s[s.length - 1] : null };
}
/** Saf: vazgeçme kuralları (ön kayıt §5) — kayıt sırasıyla ilk tetiklendiği olay. */
function vazgecmeBul(olaylar) {
  const s = olaylar.filter(sayilan).sort((a, b) => (a.exGun < b.exGun ? -1 : 1));
  for (let i = 0; i < s.length; i++) {
    const o = ozetle(s.slice(0, i + 1));
    if (o.olay >= V1.enAzOlay && o.ana.ort <= V1.ortNet) return { kural: 'V1', exGun: s[i].exGun, ort: o.ana.ort, n: o.olay };
    if (o.maxDD <= V2.dd) return { kural: 'V2', exGun: s[i].exGun, dd: o.maxDD, n: o.olay };
  }
  return null;
}
function araRapor(olaylar, { bugun }) {
  const o = ozetle(olaylar);
  const kararTarihi = bugun >= KARAR && o.olay < EN_AZ_OLAY ? KARAR_ERTELEME : KARAR;
  return { deneme: DENEME, gecmisDeneme: GECMIS_DENEME, plan: PLAN, baslangic: BAS, araKontrol: ARA_KONTROL, kararTarihi, kararErteleme: KARAR_ERTELEME, enAzOlay: EN_AZ_OLAY,
    kalanGun: Math.round((gt(kararTarihi) - gt(bugun)) / GUN), maliyetAna: MALIYET_ANA, ...o, not: 'Ara rapor — hüküm değil. Karar günü gelmeden kural değişmez.' };
}
/** Karar (ön kayıt §4). */
function hukum(olaylar, { bugun }) {
  if (bugun < KARAR) return { durum: 'bekliyor', metin: `henüz karar zamanı değil (${KARAR})` };
  const o1 = ozetle(olaylar, { kadar: KARAR });
  if (o1.olay < EN_AZ_OLAY && bugun < KARAR_ERTELEME) return { durum: 'ertelendi', metin: `${o1.olay} olay < ${EN_AZ_OLAY} — karar ${KARAR_ERTELEME}`, olcu: o1 };
  const kadar = o1.olay < EN_AZ_OLAY ? KARAR_ERTELEME : KARAR;
  const o = ozetle(olaylar, { kadar });
  const a = o.ana;
  const sonuc = a.ort == null ? 'belirsiz, bir yıl daha' : a.ort <= 0 ? 'RED' : (a.t != null && a.t >= 1.5) ? 'izlemeye devam / küçük sermayeyle elle uygulama adayı' : 'belirsiz, bir yıl daha';
  return { durum: 'karar', tarih: kadar, sonuc, olcu: o, azOlay: o.olay < EN_AZ_OLAY, not: 'Aday olmak uygulamaya geçiş değildir: kullanıcı kararı, Midas seans emri teyidi ve ayrı plan gerekir.' };
}

/* ═══════════ ÇALIŞTIR ═══════════ */
/**
 * Bir çalışma: Yahoo (havuz + USDTRY) → evren → İş Yatırım takvimi (evren + bekleyenler) → takvim gözlemleri (yalnız eklenir) →
 * kesinleşen olaylar (nominal kapanış bir kez indirilir) → kayıt (yalnız eklenir) → vazgeçme → son.json. Idempotent.
 * @param o.ag ağ katmanı (test için sahte)
 */
async function calistir({ simdi = Date.now(), dizin = I.VARSAYILAN_DIZIN, ag = null, log = () => {}, bas = BAS, semboller = null, sonAn = Infinity, esZaman = 4 } = {}) {
  const F = dosyalar(dizin);
  return I.kilitle(dizin, async () => {
    const t0 = Date.now();
    const A = ag || gercekAg();
    const bugun = tsiGun(simdi);
    const sonGun = tsiSaat(simdi) >= 19 ? bugun : gs(gt(bugun) - GUN);    // bugünkü satır 19:00 TSİ'den sonra kapanmış sayılır
    const eksik = [], notlar = [];
    const kaynak = { yahoo: { istenen: 0, alinan: 0, hata: [] }, isyKart: { istenen: 0, alinan: 0, hata: [] }, isyFiyat: { istenen: 0, alinan: 0, hata: [] } };
    const { donustur } = bistIndir();
    // 1. Yahoo
    const yahoo = new Map();
    const liste = semboller || havuz();
    const sure = () => Date.now() < sonAn;
    let butceDoldu = false;
    const ySira = [...liste.map(s => `${s}.IS`), 'USDTRY=X'];
    const yOku = await havuzla(ySira, esZaman, async (y) => {
      const yol = path.join(F.yahoo, y.replace(/[^A-Z0-9.]/gi, '_') + '.json');
      const eski = okuJ(yol);
      if (eski && (eski.yok || (eski.indirmeMs && simdi - eski.indirmeMs < YAHOO_TAZE_MS && eski.indirmeMs <= simdi))) return eski.yok ? null : eski;
      if (!sure()) { butceDoldu = true; return eski && !eski.yok ? eski : null; }
      kaynak.yahoo.istenen++;
      try {
        const x = await A.yahoo(y, simdi);
        kaynak.yahoo.alinan++;
        if (!x) { yazJ(yol, { yok: true, indirmeMs: simdi }); return null; }
        const v = { ...donustur(y, x), indirmeMs: simdi }; yazJ(yol, v); return v;
      } catch (e) { kaynak.yahoo.hata.push(`${y}: ${e.message}`); return eski && !eski.yok ? eski : null; }
    });
    ySira.forEach((y, i) => { if (yOku[i]) yahoo.set(y, yOku[i]); });
    const usd = yahoo.get('USDTRY=X'); yahoo.delete('USDTRY=X');
    const hisseYahoo = new Map([...yahoo].map(([y, v]) => [y.replace(/\.IS$/, ''), v]));
    if (!usd) eksik.push({ seri: 'temettu:USDTRY', neden: 'USDTRY alınamadı' });
    const W = dunyaKur(hisseYahoo, usd, sonGun);
    const D = W.takvim.length;
    // 2. İş Yatırım takvimi: bugünün evreni (son günün ertesi için geçerli olan) + bekleyen olaylar
    const gozlem = I.satirlariOku(F.takvim);
    const harita0 = takvimHaritasi(gozlem);
    // Bugünün evreni: son işlem günü bu aydaysa önceki ay sonu (ayBasi), önceki aydaysa o gün (yeni ayın ilk kararı).
    const evNow = D ? (() => { const ayni = new Date(W.takvim[D - 1]).getUTCMonth() === new Date(gt(bugun)).getUTCMonth(); const sonAy = ayni ? W.ayBasi[D - 1] : D - 1; return sonAy >= 0 ? K.evrenSirali(W.H, W.takvim, sonAy).slice(0, K.T1.evrenN) : []; })() : [];
    const evOnceki = D ? W.evren(D - 1) : [];
    const bekleyenHisse = [...harita0.keys()].map(k => k.split('|')).filter(([, g]) => g >= gs(gt(bugun) - 10 * GUN)).map(([s]) => s);
    const tara = [...new Set([...evNow, ...evOnceki, ...bekleyenHisse])].sort();
    const sonGozlem = new Map(); for (const [k, l] of harita0) sonGozlem.set(k, l[l.length - 1]);
    const yeniGozlem = [];
    const sinir = gs(gt(bas) - 7 * GUN);
    const taramaYol = path.join(F.kok, 'isy-tarama.json');
    const taramaZaman = okuJ(taramaYol, {}) || {};
    const kartlar = await havuzla(tara, Math.max(1, esZaman >> 1), async (s) => {
      if (taramaZaman[s] && simdi - taramaZaman[s] < ISY_TAZE_MS && taramaZaman[s] <= simdi) return null;   // yakında tarandı
      if (!sure()) { butceDoldu = true; return null; }
      kaynak.isyKart.istenen++;
      try { const l = K.isyTemettuAyristir(await A.isyKart(s), s); kaynak.isyKart.alinan++; taramaZaman[s] = simdi; return l; }
      catch (e) { kaynak.isyKart.hata.push(`${s}: ${e.message}`); return null; }
    });
    yazJ(taramaYol, taramaZaman);
    for (let i = 0; i < tara.length; i++) {
      const s = tara[i], satirlar = kartlar[i];
      if (!satirlar) continue;
      for (const x of satirlar) {
        if (x.tarih < sinir) continue;
        const k = `${s}|${x.tarih}`, e = sonGozlem.get(k);
        if (e && e.brutTL === x.brutTL) continue;
        const g = { s, exGun: x.tarih, brutTL: x.brutTL, verim: x.verim, gorulme: new Date(simdi).toISOString() };
        yeniGozlem.push(g); sonGozlem.set(k, g);
      }
    }
    I.ekle(F.takvim, yeniGozlem);
    const harita = takvimHaritasi([...gozlem, ...yeniGozlem]);
    // 3. nominal kapanış (olay başına bir kez; ex-günden önceki son gün)
    const nomOnb = new Map();
    const nominalAl = async (s, exGun) => {
      const yol = path.join(F.nominal, `${s}-${exGun}.json`);
      const v = okuJ(yol); if (v && v.kapanis > 0) return v.kapanis;
      if (!sure()) { butceDoldu = true; return null; }
      kaynak.isyFiyat.istenen++;
      try {
        const l = (await A.isyFiyat(s, gs(gt(exGun) - 12 * GUN), exGun)).filter(x => x[0] < exGun).sort((a, b) => (a[0] < b[0] ? -1 : 1));
        kaynak.isyFiyat.alinan++;
        if (!l.length) return null;
        const son = l[l.length - 1];
        yazJ(yol, { s, exGun, gun: son[0], kapanis: son[1], kaynak: 'İş Yatırım HisseTekil HG_KAPANIS', indirme: new Date(simdi).toISOString() });
        return son[1];
      } catch (e) { kaynak.isyFiyat.hata.push(`${s} ${exGun}: ${e.message}`); return null; }
    };
    for (const [k] of harita) {
      const [s, exGun] = k.split('|');
      if (exGun < bas || exGun > sonGun) continue;
      const d = W.gunIdx.get(exGun); if (d == null || d < 1 || !W.evren(d - 1).includes(s)) continue;
      nomOnb.set(k, await nominalAl(s, exGun));
    }
    const R = olaylariHesapla(W, harita, (s, g) => { const v = nomOnb.get(`${s}|${g}`); return v == null ? null : v; }, { bas, sonGun });
    if (butceDoldu) eksik.push({ seri: 'temettu:sure', neden: 'süre bütçesi doldu — kalan indirmeler sonraki çalışmada' });
    for (const b of R.bekleyen) eksik.push({ seri: `temettu:${b.s}:${b.exGun}`, neden: b.neden });
    // 4. kayıt: yeni olaylar eklenir, kayıtlılar karşılaştırılır
    const mevcut = I.satirlariOku(F.kayit);
    const durK = mevcut.find(x => x.tur === 'dur') || null;
    const M = new Map(mevcut.filter(x => x.tur === 'olay').map(x => [`${x.s}|${x.exGun}`, x]));
    const yeni = [], degisen = [];
    for (const o of R.olaylar) {
      const k = `${o.s}|${o.exGun}`, e = M.get(k);
      if (e) { if (e.imza !== o.imza) degisen.push({ s: o.s, exGun: o.exGun, kayit: e.net && e.net.ana, yeniden: o.net.ana }); continue; }
      if (durK && o.exGun > durK.exGun) continue;
      const sat = { tur: 'olay', ...o, kayitZamani: new Date(simdi).toISOString(), gecikmeli: sonGun > o.exGun };
      yeni.push(sat); M.set(k, sat);
    }
    let dur = durK;
    const kayitOlay = [...M.values()];
    if (!dur) { const v = vazgecmeBul(kayitOlay); if (v) { dur = { tur: 'dur', ...v, kayitZamani: new Date(simdi).toISOString() }; yeni.push(dur); log('WARN', `Temettü gölgesi DURDU (${v.kural}, ${v.exGun})`); } }
    I.ekle(F.kayit, yeni);
    // 5. sıradaki olaylar (bugünün evreninde, ex-günü bugünden sonra)
    const siradaki = [];
    for (const [k, l] of harita) {
      const [s, exGun] = k.split('|'); if (exGun <= sonGun) continue;
      if (!evNow.includes(s)) continue;
      const x = l[l.length - 1], h = W.Hm.get(s), sonK = h && h.satir.length ? h.satir[h.satir.length - 1].c : null;
      let alGunu = gs(gt(exGun) - GUN); while ([0, 6].includes(new Date(gt(alGunu)).getUTCDay())) alGunu = gs(gt(alGunu) - GUN);
      siradaki.push({ s, exGun, alGunu, brutTL: x.brutTL, dpTahmin: sonK ? x.brutTL / sonK : null, ilkGorulme: l[0].gorulme });
    }
    siradaki.sort((a, b) => (a.exGun < b.exGun ? -1 : 1));
    const olayK = kayitOlay.filter(x => !dur || x.exGun <= dur.exGun);
    const ozet = { zaman: new Date(simdi).toISOString(), deneme: DENEME, plan: PLAN, sureMs: Date.now() - t0, sonGun, yeniSatir: yeni.length, takvimYeni: yeniGozlem.length,
      takvimHisse: tara.length, evren: evNow.length, sonTakvimGunu: D ? gs(W.takvim[D - 1]) : null,
      rapor: araRapor(olayK, { bugun }), hukum: hukum(olayK, { bugun }), siradaki: siradaki.slice(0, 20),
      sonOlaylar: olayK.slice(-12).map(o => ({ s: o.s, exGun: o.exGun, net: o.net, dp: o.dp, onceden: o.onceden, likidite: o.likidite })),
      dur: dur ? { kural: dur.kural, exGun: dur.exGun } : null, kaynak, eksik, notlar, degisen, atilan: R.atilan.slice(-20) };
    yazJ(F.son, ozet);
    if (degisen.length) log('WARN', `Temettü gölgesi: ${degisen.length} kayıtlı olayın yeniden hesabı farklı — kayıt DEĞİŞMEDİ`);
    return ozet;
  });
}

/** GET /api/ileri/temettu: yalnız son.json (ağ yok, yazmaz). */
/** `ILERI_GOLGE_DIZIN` yalnız kılavuz ekran görüntüleri içindir (örnek kayıt, scripts/ileri-golge-ornek.js); tanımsızken gerçek kayıt. */
function panelVerisi({ dizin = process.env.ILERI_GOLGE_DIZIN || I.VARSAYILAN_DIZIN } = {}) {
  const s = okuJ(dosyalar(dizin).son);
  return { success: true, ozet: s, takvim: { bas: BAS, araKontrol: ARA_KONTROL, karar: KARAR, erteleme: KARAR_ERTELEME, enAzOlay: EN_AZ_OLAY }, deneme: DENEME, gecmisDeneme: GECMIS_DENEME, plan: PLAN, maliyetAna: MALIYET_ANA };
}

module.exports = {
  DENEME, GECMIS_DENEME, PLAN, BAS, ARA_KONTROL, KARAR, KARAR_ERTELEME, EN_AZ_OLAY, MALIYET_ANA, FAIZ, V1, V2,
  dosyalar, gercekAg, odemeGunu, iskonto, dunyaKur, takvimHaritasi, kesimAni, olaylariHesapla, imza, ozetle, vazgecmeBul, araRapor, hukum, calistir, panelVerisi, tsiGun,
};
