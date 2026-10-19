/**
 * PORTFÖY TASARIMCISI F5 — MODEL ↔ GERÇEK: gerçek seri (TWR), uygulama farkı ayrıştırması, kol katkısı (Carino), aylık tablo,
 * aylık dışa aktarım listesi + SHA-256 zinciri. DENETIM-PANEL-B.md "F5 için önerilen tasarım", PLAN-PORTFOY-TASARIMCI.md (c) C6.
 * Öz test: node scripts/tasarimci-fark-selftest.js
 *
 * SAF KISIM (dosya okumaz, yazmaz; girdiler enjekte edilir — test edilir):
 *   gercekSeri(id, girdi) → { ilkGun, sonGun, gunler: [{ gun, deger, akis, r, endeks, bilesen, pnl, nakitPay, eksik }], bilesenAd, uyarilar } | null
 *       Gerçek kol = YALNIZ bu modelin "Uyguladım" kayıtları (tasarimci.model etiketi, iptal edilmemiş) + modele ayrılan nakit
 *       (+ 837'de Binance hesabının TAMAMI — emirler.js ile aynı tanım: Binance hesabının değeri = Hücum kolu).
 *       Nakit: ilk Uyguladım gününün başında model sermayesi (M10: sermaye × model endeksi / 100 — Ö8; 837: sermaye) — sermaye
 *       girilmemişse ilk gün alışları kadar. Alış nakitten düşer, satış ekler, ücret düşer, Tasarımcı aktarımı nakitten Binance
 *       hesabına geçer (iç akış). Nakit eksiye düşerse açık DIŞARIDAN para girişi sayılır (dış akış, nakit 0'da kalır).
 *       Binance hesabına Tasarımcı dışı yatırma/çekme/transfer dış akıştır. İlk gün: taban = sermaye + Binance'in önceki günkü değeri.
 *       TWR: r_t = Σ_bileşen K/Z_t / V_{t−1}, K/Z = V_t − V_{t−1} − iç akış − dış akış; endeks ilk Uyguladım gününden ÖNCE 100.
 *   farkAyristir({ gercek, modelSatirlar, modelDolumlar, kayitlar, atlandi, ay?, sembolBul, usd }) → ay (ya da başlangıçtan) için
 *       fark = gerçek getiri − model getirisi (aynı aralık) ve bileşenleri; TOPLAMLARI FARKA EŞİT:
 *         dolum  (a) Σ (model dolum fiyatı − gerçek fiyat) × adet (alış; satışta ters) / taban — dolum fiyatı + zamanlama
 *         nakit  (b) Σ_gün nakit payı(t−1) × (0 − model günlük getirisi) — tam adet yuvarlamasıyla nakitte kalan pay
 *         ucret  (c) −gerçek ücretler / taban + model maliyetleri (kayma, aktarım) / model tabanı
 *         uygulanmayan (d) ay atlandıysa / bu ay hiç Uyguladım yoksa (model işlem yaptıysa) fark − (a + b + c); gerçek seri hiç
 *                yoksa farkın tamamı
 *         kalan  (e) geri kalan (zamanlama, kur, kısmi uygulama, fiyat kaynağı farkı)
 *   modelKatki(id, modelSatirlar, modelDolumlar, { bas, bit }) → { getiri, katki: { kol|hisse: pay }, gunluk } (Carino bağlamalı)
 *   gercekKatki(gercek, { bas, bit }) → aynı biçim (bileşen: hisse / nakit / Binance hesabı)
 *   carino(gunluk [{ r, c: { k: v } }]) → { toplam, katki } — Σ katki = toplam getiri (çok dönemli bağlama, Carino 1999)
 *   aylikTablo({ modelSatirlar, kiyaslar: { id: satirlar }, gercek, farklar, bugun, baslangic }) → { satirlar, yillar }
 *   zincirDenetle(dosyalar [{ ay, icerik }]) → [{ ay, sha, tamam, hatalar }]
 *   disariCsv(kayit, { gercek? }) → metin (gun, seri, endeks, endeksTl [+ gercekEndeks, gercekDegerUSD])
 *
 * OKUYAN KISIM (dosya YAZMAZ):
 *   baglamKur({ bugun }) → Portföyüm (lib/portfoyum depo.yukle + degerleme.seriler) bağlamı: fiyat, usd, hesapDeger, hesapDisAkis
 *   modelGercek(id, { bugun, sermaye, modelSatirlar, B? }) → gercekSeri sonucu (Portföyüm'den)
 *   disariListe(dizin) · disariOku(dizin, ay)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const GUN = 864e5;
const EPS = 1e-9;
const gunMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const msGun = (t) => new Date(t).toISOString().slice(0, 10);
const oncekiGun = (g) => msGun(gunMs(g) - GUN);
const ayOf = (g) => String(g || '').slice(0, 7);
const ayBasi = (ay) => `${ay}-01`;
const aySonu = (ay) => msGun(Date.UTC(+ay.slice(0, 4), +ay.slice(5, 7), 1) - GUN);
const sonrakiAy = (ay) => msGun(Date.UTC(+ay.slice(0, 4), +ay.slice(5, 7), 1)).slice(0, 7);
const SIRA_ISLEM = { sat: 0, transfer: 1, al: 2 };
const sembolSade = (s) => String(s || '').toUpperCase().replace(/\.IS$/, '');

// ═══ CARINO ═════════════════════════════════════════════════════════════════
const kFak = (r) => (Math.abs(r) < 1e-12 ? 1 : Math.log(1 + r) / r);
/** Carino bağlama: günlük katkılar (Σ c_t = r_t) → dönem katkıları, Σ = (Π(1+r_t) − 1). */
function carino(gunluk) {
  let L = 1;
  for (const g of gunluk) L *= 1 + g.r;
  const R = L - 1, K = kFak(R);
  const katki = {};
  for (const g of gunluk) {
    const k = kFak(g.r) / K;
    for (const [ad, v] of Object.entries(g.c || {})) katki[ad] = (katki[ad] || 0) + k * v;
  }
  return { toplam: R, katki };
}

// ═══ GERÇEK SERİ ════════════════════════════════════════════════════════════
/** Gün içi sıra: gunIciSira varsa o, yoksa paket sırası sat → transfer → al; eşitlikte sira. */
function islemSirala(l) {
  return l.slice().sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0)
    || ((Number.isFinite(a.gunIciSira) ? a.gunIciSira : (SIRA_ISLEM[a.islem] + 1) * 100) - (Number.isFinite(b.gunIciSira) ? b.gunIciSira : (SIRA_ISLEM[b.islem] + 1) * 100))
    || ((a.sira || 0) - (b.sira || 0)));
}

/**
 * girdi: { kayitlar, bolunmeler?, fiyat(varlik, gun) → { fiyat, para } | null, usd(tutar, para, gun) → number | null,
 *          hesapDeger?(hesap, gun) → USD | null, hesapDisAkis?(hesap, gun) → USD, butunHesaplar?: [hesap], sermaye?: { tutar, para },
 *          nakitPara: 'USD' | 'TRY', bugun, ad?: { varlik: sembol } }
 */
function gercekSeri(id, girdi) {
  const kayitlar = islemSirala((girdi.kayitlar || []).filter(k => ['al', 'sat', 'transfer'].includes(k.islem)));
  if (!kayitlar.length) return null;
  const { fiyat, usd, bugun } = girdi;
  const hesapDeger = girdi.hesapDeger || (() => 0), hesapDisAkis = girdi.hesapDisAkis || (() => 0);
  const butun = new Set(girdi.butunHesaplar || []);
  const nakitPara = girdi.nakitPara || 'USD';
  const ad = girdi.ad || {};
  const d0 = kayitlar[0].tarih;
  const gunKayit = new Map();
  for (const k of kayitlar) { if (!gunKayit.has(k.tarih)) gunKayit.set(k.tarih, []); gunKayit.get(k.tarih).push(k); }
  const bol = new Map();
  for (const b of girdi.bolunmeler || []) { if (!bol.has(b.tarih)) bol.set(b.tarih, []); bol.get(b.tarih).push(b); }
  const uyarilar = [];
  const birim = new Map();          // varlik → adet
  const sonFiyat = new Map();       // varlik → { fiyat, para } (fiyat serisi yoksa son işlem fiyatı)
  const bilesenAd = { nakit: 'Nakit' };
  let nakit = 0;
  const onceki = new Map();         // bileşen → USD değer (dün)
  const uyariBir = new Set();
  const uyar = (m) => { if (!uyariBir.has(m)) { uyariBir.add(m); uyarilar.push(m); } };

  // İlk günün başı: sermaye nakdi + bütün hesapların önceki günkü değeri (dış akış: taban)
  let ilkTaban = 0;
  const sermaye = girdi.sermaye && girdi.sermaye.tutar > 0 ? girdi.sermaye : null;
  if (sermaye) {
    nakit = sermaye.tutar;
    const u = usd(nakit, nakitPara, d0);
    if (u == null) uyar(`${nakitPara} kuru yok (${d0}) — nakit değerlenemedi`);
    onceki.set('nakit', u || 0); ilkTaban += u || 0;
  } else { onceki.set('nakit', 0); uyar('Model sermayesi girilmemiş: nakit tabanı ilk gün alışları kadar sayıldı'); }
  for (const h of butun) {
    const v = hesapDeger(h, oncekiGun(d0));
    const k = `hesap:${h}`; bilesenAd[k] = ad[k] || 'Binance hesabı';
    onceki.set(k, v || 0); ilkTaban += v || 0;
  }

  const gunler = [];
  let endeks = 100;
  for (let t = gunMs(d0), t1 = gunMs(bugun); t <= t1; t += GUN) {
    const g = msGun(t);
    const ic = new Map();   // bileşen → iç akış (USD, bugün)
    const icEkle = (k, v) => ic.set(k, (ic.get(k) || 0) + v);
    let akis = 0;           // dış akış (gün sonu)
    let ucretUSD = 0;
    for (const b of bol.get(g) || []) if (birim.has(b.varlik) && b.oran > 0) birim.set(b.varlik, birim.get(b.varlik) * b.oran);
    for (const k of gunKayit.get(g) || []) {
      if (k.islem === 'al' || k.islem === 'sat') {
        const isaret = k.islem === 'al' ? 1 : -1, adet = +k.adet || 0, f = +k.fiyat || 0, uc = +k.ucret || 0;
        const v = `h:${k.varlik}`; bilesenAd[v] = ad[k.varlik] || k.varlik;
        birim.set(k.varlik, (birim.get(k.varlik) || 0) + isaret * adet);
        const para = k.para || (fiyat(k.varlik, g) || {}).para || nakitPara;
        sonFiyat.set(k.varlik, { fiyat: f, para });
        const A = usd(adet * f, para, g);
        if (A == null) { uyar(`${para} kuru yok (${g})`); continue; }
        icEkle(v, isaret * A); icEkle('nakit', -isaret * A);
        // Nakit hesap para biriminde (varlık parası nakit parasıyla aynı varsayılır: M10 USD hisse / BIST TRY hisse)
        nakit += -isaret * adet * f - uc;
        const ucU = usd(uc, para, g); ucretUSD += ucU || 0;
      } else if (k.islem === 'transfer') {
        const T = +k.tutar || 0, para = k.para || 'USD', TU = usd(T, para, g);
        if (TU == null) { uyar(`${para} kuru yok (${g})`); continue; }
        if (butun.has(k.hedefHesap) && !butun.has(k.hesap)) { nakit -= T; icEkle('nakit', -TU); icEkle(`hesap:${k.hedefHesap}`, TU); }
        else if (butun.has(k.hesap) && !butun.has(k.hedefHesap)) { nakit += T; icEkle('nakit', TU); icEkle(`hesap:${k.hesap}`, -TU); }
      }
    }
    // Nakit eksiye düştüyse açık dışarıdan girmiş sayılır (ilk gün: tabana)
    let enjeksiyon = 0;
    if (nakit < -EPS) {
      const u = usd(-nakit, nakitPara, g);
      enjeksiyon = u || 0; nakit = 0;
      if (g !== d0) uyar('Modele ayrılan nakit yetmedi; eksik tutar dışarıdan para girişi sayıldı');
    }
    for (const h of butun) akis += hesapDisAkis(h, g) || 0;
    // Değerler
    const bilesen = {};
    let eksik = false;
    for (const [v, n] of birim) {
      const k = `h:${v}`;
      if (Math.abs(n) < EPS) { bilesen[k] = 0; continue; }
      let f = fiyat(v, g); if (!f) f = sonFiyat.get(v) || null;
      const u = f ? usd(n * f.fiyat, f.para, g) : null;
      if (u == null) { eksik = true; bilesen[k] = onceki.get(k) || 0; uyar(`${bilesenAd[k]} ${g}: fiyat/kur yok — önceki değer kullanıldı`); continue; }
      bilesen[k] = u;
    }
    const nu = usd(nakit, nakitPara, g);
    if (nu == null) { eksik = true; bilesen.nakit = onceki.get('nakit') || 0; } else bilesen.nakit = nu;
    for (const h of butun) { const v = hesapDeger(h, g); const k = `hesap:${h}`; if (v == null) { eksik = true; bilesen[k] = onceki.get(k) || 0; } else bilesen[k] = v; }
    // K/Z ve TWR
    const ilk = g === d0;
    const disNakit = ilk ? 0 : enjeksiyon;
    let taban = 0;
    for (const v of onceki.values()) taban += v;
    if (ilk) taban = ilkTaban + enjeksiyon;
    const pnl = {};
    let topPnl = 0;
    const tum = new Set([...Object.keys(bilesen), ...onceki.keys()]);
    for (const k of tum) {
      const dis = k === 'nakit' ? (ilk ? enjeksiyon : disNakit) : k.startsWith('hesap:') ? (hesapDisAkis(k.slice(6), g) || 0) : 0;
      const p = (bilesen[k] || 0) - (onceki.get(k) || 0) - (ic.get(k) || 0) - dis;
      pnl[k] = p; topPnl += p;
    }
    const r = taban > EPS ? topPnl / taban : 0;
    endeks *= 1 + r;
    const deger = Object.values(bilesen).reduce((a, x) => a + x, 0);
    // Nakit payı: bugünkü işlemlerden SONRA nakitte kalan (tam adet yuvarlaması, satılıp alınmayan) / gün tabanı
    const nakitPay = taban > EPS ? Math.max(0, bilesen.nakit) / taban : 0;
    gunler.push({ gun: g, deger, akis: akis + disNakit + (ilk ? ilkTaban + enjeksiyon : 0), r, endeks, bilesen, pnl, nakitPay, ucretUSD, eksik, taban });
    onceki.clear(); for (const [k, v] of Object.entries(bilesen)) onceki.set(k, v);
  }
  return { id, ilkGun: d0, sonGun: gunler.length ? gunler[gunler.length - 1].gun : d0, gunler, bilesenAd, uyarilar };
}

/** Gerçek endeks g gününde (g < ilkGun → 100; g > son → son). */
function gercekEndeks(gercek, g) {
  if (!gercek || g < gercek.ilkGun) return 100;
  let e = 100;
  for (const x of gercek.gunler) { if (x.gun > g) break; e = x.endeks; }
  return e;
}
/** Model endeksi g gününde (g dahil son satır; yoksa 100). */
function modelEndeks(satirlar, g, alan = 'endeks') {
  let e = 100;
  for (const s of satirlar) { if (s.gun > g) break; if (Number.isFinite(s[alan])) e = s[alan]; }
  return e;
}

// ═══ FARK AYRIŞTIRMASI ══════════════════════════════════════════════════════
/**
 * ay: 'YYYY-MM' ya da null (başlangıçtan). Aralık: bas = max(ay başı, ilk Uyguladım günü, model başlangıcı), bit = min(ay sonu,
 * model son günü, gerçek son günü). Model getirisi E(bit)/E(bas−1), gerçek I(bit)/I(bas−1).
 */
function farkAyristir({ gercek, modelSatirlar = [], modelDolumlar = [], kayitlar = [], atlandi = false, ay = null, usd = () => null, sembolBul = (k) => k.varlik, bugun = null, baslangic = null }) {
  const st = modelSatirlar.filter(s => Number.isFinite(s.endeks));
  const modelIlk = st.length ? st[0].gun : null, modelSon = st.length ? st[st.length - 1].gun : null;
  const out = { ay, bas: null, bit: null, modelGetiri: null, gercekGetiri: null, fark: null,
    bilesenler: { dolum: 0, nakit: 0, ucret: 0, uygulanmayan: 0, kalan: 0 }, notlar: [] };
  if (!modelSon) { out.notlar.push('model serisi henüz yok'); return out; }
  let bas = ay ? ayBasi(ay) : (baslangic || modelIlk);
  let bit = ay ? aySonu(ay) : (bugun || modelSon);
  if (gercek && gercek.ilkGun > bas && (!ay || ayOf(gercek.ilkGun) === ay)) bas = gercek.ilkGun;
  if (bas < modelIlk) bas = modelIlk;
  if (bit > modelSon) bit = modelSon;
  if (gercek && gercek.sonGun < bit && gercek.sonGun >= bas) bit = gercek.sonGun;
  if (bit < bas) { out.notlar.push('bu aralıkta model günü yok'); return out; }
  out.bas = bas; out.bit = bit;
  const E0 = modelEndeks(st, oncekiGun(bas)), E1 = modelEndeks(st, bit);
  out.modelGetiri = E1 / E0 - 1;
  const gercekVar = !!(gercek && gercek.ilkGun <= bit);
  if (!gercekVar) {
    out.gercekGetiri = null;
    out.fark = -out.modelGetiri;
    out.bilesenler.uygulanmayan = out.fark;
    out.notlar.push(gercek ? 'gerçek seri bu aralıktan sonra başlıyor' : 'Gerçek karşılaştırma ilk Uyguladım kaydından sonra başlar — fark = modelin tamamı (uygulanmadı)');
    return out;
  }
  const I0 = gercekEndeks(gercek, oncekiGun(bas)), I1 = gercekEndeks(gercek, bit);
  out.gercekGetiri = I1 / I0 - 1;
  out.fark = out.gercekGetiri - out.modelGetiri;
  const gIc = gercek.gunler.filter(x => x.gun >= bas && x.gun <= bit);
  const V0 = gIc.length ? gIc[0].taban : 0;
  // (a) dolum fiyatı
  const icKayit = kayitlar.filter(k => (k.islem === 'al' || k.islem === 'sat') && k.tarih >= bas && k.tarih <= bit);
  let dolum = 0, ucretGercek = 0;
  for (const k of icKayit) {
    const s = sembolSade(sembolBul(k));
    const md = modelDolumlar.filter(d => sembolSade(d.s) === s && (d.yon === k.islem || (k.islem === 'sat' && d.yon === 'nakde')) && d.gun <= k.tarih && ayOf(d.gun) === ayOf(k.tarih) && Number.isFinite(d.fiyat)).pop();
    const para = k.para || 'USD';
    if (md) {
      const fark = (md.fiyat - (+k.fiyat || 0)) * (+k.adet || 0) * (k.islem === 'al' ? 1 : -1);
      const u = usd(fark, para, k.tarih); if (u != null) dolum += u;
    }
    const uc = usd(+k.ucret || 0, para, k.tarih); if (uc != null) ucretGercek += uc;
  }
  const B = (x) => (V0 > EPS ? x / V0 : 0);
  out.bilesenler.dolum = B(dolum);
  // (b) nakit payı × (0 − model günlük getirisi)
  const mr = new Map(st.map((s, i) => [s.gun, (i ? s.endeks / st[i - 1].endeks : s.endeks / 100) - 1]));
  let nakitB = 0;
  for (const x of gIc) { const r = mr.get(x.gun); if (Number.isFinite(r)) nakitB += x.nakitPay * (0 - r); }
  out.bilesenler.nakit = nakitB;
  // (c) ücret: gerçek ücret (−) + model maliyeti (+, model getirisinden zaten düşülmüştü)
  const mMaliyet = modelDolumlar.filter(d => d.gun >= bas && d.gun <= bit && Number.isFinite(d.maliyet)).reduce((a, d) => a + d.maliyet, 0);
  out.bilesenler.ucret = -B(ucretGercek) + (E0 > EPS ? mMaliyet / E0 : 0);
  // (d) uygulanmayan / atlanan
  const modelIslem = modelDolumlar.some(d => d.gun >= bas && d.gun <= bit && d.yon !== 'aktarim' && d.s !== 'aktarim');
  const ayKayit = kayitlar.some(k => k.tarih >= bas && k.tarih <= bit);
  const b = out.bilesenler;
  if (atlandi || (ay && modelIslem && !ayKayit)) {
    b.uygulanmayan = out.fark - (b.dolum + b.nakit + b.ucret);
    out.notlar.push(atlandi ? 'bu ay atlandı' : 'model bu ay işlem yaptı, gerçekte Uyguladım kaydı yok');
  }
  b.kalan = out.fark - (b.dolum + b.nakit + b.ucret + b.uygulanmayan);
  return out;
}

// ═══ KOL KATKISI ═════════════════════════════════════════════════════════════
/**
 * Model günlük katkıları. M10 / BIST: hisse başına K/Z_t = poz_t − poz_{t−1} − açılış alımı (dolum yeniDeger − oncekiDeger);
 * nakit = faiz − maliyet; taban = nakit_{t−1} + Σ poz_{t−1} (BIST: TL). 837: QQQ (çekirdek), Hücum (uydu), dengeleme maliyeti.
 */
function modelGunlukKatki(id, satirlar, dolumlar) {
  const out = [];
  const dg = new Map();
  for (const d of dolumlar || []) { if (!dg.has(d.gun)) dg.set(d.gun, []); dg.get(d.gun).push(d); }
  let prev = null;
  for (const s of satirlar) {
    if (id === 'm-837') {
      const w = { cekirdek: 0.5, uydu: 0.5 };
      const Qp = prev ? prev.kollar.cekirdek : 100 * w.cekirdek, Hp = prev ? prev.kollar.uydu : 100 * w.uydu;
      const once = s.kollarOnce || s.kollar;
      const taban = Qp + Hp;
      const c = { cekirdek: (once.cekirdek - Qp) / taban, uydu: (once.uydu - Hp) / taban };
      const den = (s.kollar.cekirdek + s.kollar.uydu) - (once.cekirdek + once.uydu);
      if (Math.abs(den) > 1e-15) c.dengeleme = den / taban;
      out.push({ gun: s.gun, r: (s.kollar.cekirdek + s.kollar.uydu) / taban - 1, c });
    } else {
      const pp = prev ? prev.poz || {} : {}, pn = prev ? prev.nakit : 100;
      const taban = pn + Object.values(pp).reduce((a, x) => a + x, 0);
      const ozNow = s.nakit + Object.values(s.poz || {}).reduce((a, x) => a + x, 0);
      const c = {};
      let alim = 0;
      const net = new Map();
      for (const d of dg.get(s.gun) || []) { const n = (d.yeniDeger || 0) - (d.oncekiDeger || 0); net.set(d.s, (net.get(d.s) || 0) + n); alim += n; }
      for (const k of new Set([...Object.keys(pp), ...Object.keys(s.poz || {})])) c[k] = (((s.poz || {})[k] || 0) - (pp[k] || 0) - (net.get(k) || 0)) / taban;
      c.nakit = ((s.nakit - pn) + alim) / taban;
      out.push({ gun: s.gun, r: ozNow / taban - 1, c });
    }
    prev = s;
  }
  return out;
}
function araliktaKatki(gunluk, bas, bit) {
  const l = gunluk.filter(x => (!bas || x.gun >= bas) && (!bit || x.gun <= bit));
  return { ...carino(l), gun: l.length };
}
function modelKatki(id, satirlar, dolumlar, { bas = null, bit = null } = {}) { return araliktaKatki(modelGunlukKatki(id, satirlar, dolumlar), bas, bit); }
function gercekKatki(gercek, { bas = null, bit = null } = {}) {
  if (!gercek) return null;
  const gunluk = gercek.gunler.map(x => ({ gun: x.gun, r: x.r, c: x.taban > EPS ? Object.fromEntries(Object.entries(x.pnl).map(([k, v]) => [k, v / x.taban])) : {} }));
  return araliktaKatki(gunluk, bas, bit);
}
/** Katkı nesnesi → sıralı liste + en çok katkı veren / götüren 3 (hisse düzeyi). */
function katkiOzet(katki, adlar = {}) {
  const l = Object.entries(katki || {}).map(([k, v]) => ({ anahtar: k, ad: adlar[k] || k, katki: v })).sort((a, b) => b.katki - a.katki);
  const hisse = l.filter(x => !['nakit', 'dengeleme'].includes(x.anahtar) && !x.anahtar.startsWith('hesap:'));
  return { liste: l, enIyi: hisse.filter(x => x.katki > 0).slice(0, 3), enKotu: hisse.filter(x => x.katki < 0).slice(-3).reverse() };
}

// ═══ AYLIK TABLO ════════════════════════════════════════════════════════════
function seriAyGetiri(satirlar, ay, alan = 'endeks') {
  const st = (satirlar || []).filter(s => Number.isFinite(s[alan]));
  if (!st.length || st[0].gun > aySonu(ay) || st[st.length - 1].gun < ayBasi(ay)) return null;
  return modelEndeks(st, aySonu(ay), alan) / modelEndeks(st, oncekiGun(ayBasi(ay)), alan) - 1;
}
function gercekAyGetiri(gercek, ay) {
  if (!gercek || gercek.ilkGun > aySonu(ay) || gercek.sonGun < ayBasi(ay)) return null;
  return gercekEndeks(gercek, aySonu(ay)) / gercekEndeks(gercek, oncekiGun(ayBasi(ay))) - 1;
}
/** satır = ay; sütun = model, gerçek, fark (aynı aralık), kıyaslar; yıl toplamı satırı (bileşik). */
function aylikTablo({ modelSatirlar = [], kiyaslar = {}, gercek = null, farklar = {}, bugun, baslangic = '2026-10-12' }) {
  const satirlar = [];
  const sonAy = ayOf(bugun);
  for (let ay = ayOf(baslangic); ay <= sonAy; ay = sonrakiAy(ay)) {
    const kiy = Object.fromEntries(Object.entries(kiyaslar).map(([k, s]) => [k, seriAyGetiri(s, ay)]));
    const f = farklar[ay];
    satirlar.push({ ay, model: seriAyGetiri(modelSatirlar, ay), gercek: gercekAyGetiri(gercek, ay), fark: f && Number.isFinite(f.fark) && f.gercekGetiri != null ? f.fark : null, kiyas: kiy });
  }
  const bilesik = (l) => { const v = l.filter(Number.isFinite); return v.length ? v.reduce((a, x) => a * (1 + x), 1) - 1 : null; };
  const yillar = [...new Set(satirlar.map(s => s.ay.slice(0, 4)))].map(y => {
    const l = satirlar.filter(s => s.ay.startsWith(y));
    const model = bilesik(l.map(s => s.model)), gercekY = bilesik(l.map(s => s.gercek));
    return { yil: y, model, gercek: gercekY, fark: gercekY != null && model != null ? gercekY - model : null,
      kiyas: Object.fromEntries(Object.keys(kiyaslar).map(k => [k, bilesik(l.map(s => s.kiyas[k]))])) };
  });
  return { satirlar, yillar };
}

// ═══ DIŞA AKTARIM ═══════════════════════════════════════════════════════════
/**
 * Aylık dosyaların SHA-256 zinciri: her dosyanın sha'sı kendi gövdesinden, `onceki` bir önceki dosyanın sha'sı.
 * İlk dosyanın `onceki`si boş olmalı; doluysa daha eski ay(lar) eksik → "zincirin başı eksik" (denetim 61.1 D2).
 */
function zincirDenetle(dosyalar, shaF) {
  const sha = shaF || require('./defter').sha;
  const out = [];
  let onceki = null;
  const sirali = dosyalar.slice().sort((a, b) => (a.ay < b.ay ? -1 : 1));
  sirali.forEach((d, i) => {
    const hatalar = [];
    const j = d.icerik;
    if (!j || typeof j !== 'object') { out.push({ ay: d.ay, sha: null, tamam: false, hatalar: ['dosya okunamadı (geçersiz JSON)'] }); onceki = null; return; }
    const { sha: kayitli, ...govde } = j;
    const hesap = sha(govde);
    if (kayitli !== hesap) hatalar.push('içerik değişmiş: kayıtlı SHA-256 içerikle tutmuyor');
    if (i === 0 && j.onceki != null) hatalar.push('zincirin başı eksik: ilk dosya daha önceki bir aya bağlı (eski ay dosyaları silinmiş ya da taşınmış olabilir)');
    if (i > 0 && (j.onceki || null) !== onceki) hatalar.push('zincir kopuk: önceki ayın özeti tutmuyor');
    if (j.ay && j.ay !== d.ay) hatalar.push(`dosya adı ${d.ay} ama içerik ${j.ay}`);
    out.push({ ay: d.ay, sha: kayitli || null, tamam: !hatalar.length, hatalar, deneme: !!j.deneme, makine: j.makine || null, uretim: j.uretim || null });
    onceki = kayitli || null;
  });
  return out;
}
const csvHucre = (v) => (v == null ? '' : /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
/** Aylık dosya → CSV (virgüllü ayraç, nokta ondalık; ilk satır başlık). gercek: { id: gercekSeri } → gerçek endeks + değer. */
function disariCsv(kayit, { gercek = null } = {}) {
  const bas = ['gun', 'seri', 'endeks', 'endeksTl', ...(gercek ? ['gercekEndeks', 'gercekDegerUSD'] : [])];
  const l = [bas.join(',')];
  for (const [id, s] of Object.entries((kayit && kayit.seriler) || {})) {
    const tl = new Map((s.gunlerTl || []).map(([g, v]) => [g, v]));
    const gs = gercek && gercek[id];
    const gm = gs ? new Map(gs.gunler.map(x => [x.gun, x])) : null;
    for (const [g, e] of s.gunler || []) {
      const gx = gm ? gm.get(g) : null;
      l.push([g, id, e, tl.has(g) ? tl.get(g) : '', ...(gercek ? [gx ? +gx.endeks.toPrecision(12) : '', gx ? Math.round(gx.deger * 100) / 100 : ''] : [])].map(csvHucre).join(','));
    }
  }
  return l.join('\n') + '\n';
}

// ═══ OKUYAN KISIM ════════════════════════════════════════════════════════════
/** Portföyüm bağlamı (YALNIZ okur): fiyat/kur serileri, hesap değeri, hesap dış akışı, tasarımcı kayıtları. */
function baglamKur({ bugun } = {}) {
  const depo = require('../portfoyum/depo'), G = require('../portfoyum/degerleme'), F = require('../portfoyum/fiyat'), PM = require('../portfoyum/model');
  const { adetTarihte } = require('../portfoyum/muhasebe');
  const g = bugun || PM.yerelGun();
  const r = depo.yukle({ bugun: g });
  const S = G.seriler(r.D, { kurOnbellek: depo.jsonOku('kurlar.json'), binanceOnbellek: (depo.jsonOku('fiyat-onbellek.json') || {}).fiyatlar || {} });
  const D = r.D, muh = r.muh;
  const fiyat = (varlik, gun) => {
    const v = D.varliklar.get(varlik), s = S.seri.get(varlik);
    const n = s ? F.oncekiNokta(s.noktalar, PM.gunMs(gun)) : null;
    return n && v ? { fiyat: n[1], para: v.para } : null;
  };
  const usd = (tutar, para, gun) => { if (!tutar) return 0; const c = G.cevirTarihte(tutar, para, PM.gunMs(gun), S.kurlar); return c.usd; };
  const hesapCift = new Map();
  for (const c of muh.ciftler.values()) { if (!hesapCift.has(c.hesap)) hesapCift.set(c.hesap, []); hesapCift.get(c.hesap).push(c); }
  const hesapDeger = (h, gun) => {
    let t = 0;
    for (const c of hesapCift.get(h) || []) {
      const a = adetTarihte(c, gun);
      if (Math.abs(a) < EPS) continue;
      if (c.nakit) { const u = usd(a, c.para, gun); if (u == null) return null; t += u; continue; }
      const f = fiyat(c.varlik, gun); if (!f) return null;
      const u = usd(a * f.fiyat, f.para, gun); if (u == null) return null; t += u;
    }
    return t;
  };
  const tasarimciKayitlari = (id) => r.kayitlar.filter(k => k.tur === 'islem' && k.tasarimci && k.tasarimci.model === id && !D.iptalEdilen.has(k.id))
    .map(k => { const n = D.islemler.find(x => x.id === k.id) || k; return { ...n, tasarimci: k.tasarimci }; });
  /** Bütün hesabın dış akışı (USD, gün sonu): yatırma/çekme, açılış, bu modelin Tasarımcı kaydı OLMAYAN transferler. */
  const hesapDisAkisKur = (id) => { const etiketliIdler = new Set(tasarimciKayitlari(id).map(k => k.id)); return (h, gun) => {
    let t = 0;
    for (const x of D.islemler) {
      if (x.tarih !== gun || (x.hesap !== h && x.hedefHesap !== h)) continue;
      const etiketli = etiketliIdler.has(x.id);
      const deger = () => (x.varlik ? (() => { const f = fiyat(x.varlik, gun); return f ? usd((+x.adet || 0) * f.fiyat, f.para, gun) || 0 : 0; })() : usd(+x.tutar || 0, x.para || 'USD', gun) || 0);
      if (x.islem === 'yatir' && x.hesap === h) t += deger();
      else if (x.islem === 'cek' && x.hesap === h) t -= deger();
      else if (x.islem === 'acilis' && x.hesap === h) t += x.varlik ? deger() : usd(+x.tutar || +x.adet || 0, x.para || 'USD', gun) || 0;
      else if (x.islem === 'transfer' && !etiketli) { if (x.hedefHesap === h && x.hesap !== h) t += deger(); else if (x.hesap === h && x.hedefHesap !== h) t -= deger(); }
    }
    return t;
  }; };
  return { D, muh, S, bugun: g, kayitlar: r.kayitlar, fiyat, usd, hesapDeger, hesapDisAkisKur, tasarimciKayitlari, hatalar: r.hatalar };
}

/** Modelin gerçek serisi (Portföyüm'den). sermaye: sermaye.json girişi { tutar, para } | null. */
function modelGercek(id, { bugun, sermaye = null, modelSatirlar = [], B = null } = {}) {
  const b = B || baglamKur({ bugun });
  const kayitlar = b.tasarimciKayitlari(id);
  if (!kayitlar.length) return { gercek: null, kayitlar, B: b };
  const d0 = islemSirala(kayitlar)[0].tarih;
  const butun = new Set();
  if (id === 'm-837') {
    for (const k of kayitlar) if (k.islem === 'transfer') for (const h of [k.hesap, k.hedefHesap]) { const hs = b.D.hesaplar.get(h); if (hs && hs.hesapTuru === 'binance') butun.add(h); }
  }
  let sm = null;
  if (sermaye && sermaye.tutar > 0) {
    if (id === 'm-837') sm = { tutar: sermaye.tutar, para: 'USD' };
    else { const alan = id === 'm-bist-m10' ? 'endeksTl' : 'endeks'; sm = { tutar: sermaye.tutar * modelEndeks(modelSatirlar, oncekiGun(d0), alan) / 100, para: sermaye.para || (id === 'm-bist-m10' ? 'TRY' : 'USD') }; }
  }
  const ad = {};
  for (const k of kayitlar) if (k.varlik) { const v = b.D.varliklar.get(k.varlik); if (v) ad[k.varlik] = v.sembol; }
  for (const h of butun) { const hs = b.D.hesaplar.get(h); ad[`hesap:${h}`] = hs ? hs.ad : 'Binance hesabı'; }
  const bolunmeler = b.D.islemler.filter(x => x.islem === 'bolunme').map(x => ({ tarih: x.tarih, varlik: x.varlik, oran: +x.oran }));
  const gercek = gercekSeri(id, { kayitlar, bolunmeler, fiyat: b.fiyat, usd: b.usd, hesapDeger: b.hesapDeger, hesapDisAkis: b.hesapDisAkisKur(id),
    butunHesaplar: [...butun], sermaye: sm, nakitPara: id === 'm-bist-m10' ? 'TRY' : 'USD', bugun: b.bugun, ad });
  return { gercek, kayitlar, B: b, ilkGun: d0 };
}

function disariListe(dizin) {
  let dosyalar = [];
  try { dosyalar = fs.readdirSync(dizin).filter(f => /^\d{4}-\d{2}\.json$/.test(f)); } catch (e) { return []; }
  const l = dosyalar.map(f => { let icerik = null; try { icerik = JSON.parse(fs.readFileSync(path.join(dizin, f), 'utf8')); } catch (e) { icerik = null; } return { ay: f.slice(0, 7), icerik, bayt: (() => { try { return fs.statSync(path.join(dizin, f)).size; } catch (e) { return null; } })() }; });
  const z = zincirDenetle(l);
  return z.map(x => ({ ...x, bayt: (l.find(d => d.ay === x.ay) || {}).bayt || null }));
}
function disariOku(dizin, ay) {
  if (!/^\d{4}-\d{2}$/.test(ay)) return null;
  try { return fs.readFileSync(path.join(dizin, `${ay}.json`), 'utf8'); } catch (e) { return null; }
}

module.exports = { gercekSeri, gercekEndeks, modelEndeks, farkAyristir, modelGunlukKatki, modelKatki, gercekKatki, katkiOzet, carino,
  aylikTablo, seriAyGetiri, gercekAyGetiri, zincirDenetle, disariCsv, baglamKur, modelGercek, disariListe, disariOku, islemSirala, sembolSade,
  _ic: { ayBasi, aySonu, sonrakiAy, oncekiGun } };
