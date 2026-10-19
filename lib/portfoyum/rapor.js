/**
 * PORTFÖYÜM — PERFORMANS VE RİSK RAPORU (sürüm 64.2, PLAN-PORTFOYUM P6; Portföy › Rapor sekmesi, GET /api/portfoyum/rapor)
 * ═══════════════════════════════════════════════════════════════════════════
 * SAF modül: girdi = durum (D), muhasebe (muh), fiyat serileri (S), günlük değer serisi (degerleme.gunlukSeri), bugünkü
 * değerleme (degerle), TÜFE ve kıyas (faktör) serileri. Ağa çıkmaz, dosya okumaz/yazmaz. Telegram'a GİTMEZ (K6).
 *
 * FORMÜLLER
 *   Ay: V0 = önceki ayın son günü değeri (USD), V1 = ayın son günü (devam eden ayda bugün), A = ay içindeki dış akışlar
 *       (para yatırma +, çekme −, açılış bakiyesi ayni giriş +; o günün fiyat ve kuruyla — gunlukSeri akisUSD).
 *       Piyasa etkisi P = V1 − V0 − A  (tanım gereği V0 + A + P = V1, tam).
 *   Zaman ağırlıklı getiri (TWR) = endeks(V1 günü) / endeks(V0 günü) − 1 (degerleme.gunlukSeri; para giriş/çıkışı getiriyi bozmaz).
 *   Para ağırlıklı getiri (MWR) = akışların iç verim oranı (XIRR): −V0 (t0), −A_i (t_i), +V1 (t1) nakit akışlarını sıfırlayan
 *       yıllık r; dönem getirisi (1 + r)^(gün/365) − 1 (ay için YILLIĞA ÇEVRİLMEZ). Çözüm ln(1+r) uzayında: 0'dan dışa doğru
 *       tarama ile işaret değişimi bulunur, ikiye bölme (bisection) ile 1e-12'ye inilir — Newton'un ıraksaması sorunu yok.
 *   TL, enflasyon hariç (reel) = (1 + TWR_TL) / (TÜFE_ay / TÜFE_önceki ay) − 1. Başlangıçtan: TÜFE ay sonu değerleri arasında
 *       geometrik ara değer (lib/portfoy/seri.js reellestir ile aynı) — son yayımlanmış TÜFE ayının sonuna kadar.
 *   Katkı (varlık başına): V1_p − V0_p − N_p. N_p = ay içinde o kaleme giren net para: dış akış bacağı o günün fiyatıyla;
 *       alış/satışta varlık bacağı = nakit bacağının tersi (ücret varlığın katkısından düşer); temettü varlığa yazılır;
 *       hesaplar arası nakit transferinde gönderilen tutar (masraf hedef nakdin katkısı). Böylece Σ katkı = P; değerlenemeyen
 *       kalem varsa fark "Diğer" satırında görünür.
 *   Stres — doğrudan pay: senaryonun vurduğu kalemlerin USD değeri × şok (BTC −%50 → kripto sınıfı; Nasdaq −%30 → USD
 *       hisse / ETF; Altın −%20 → altın/emtia sınıfı; Dolar/TL +%30 → TRY cinsi her kalemin USD değeri ÷ 1,3).
 *   Stres — geçmiş ilişkiyle (beta): son 52 haftanın haftalık USD getirilerinde β = kov(kalem, faktör) / var(faktör); kayıp
 *       = değer × β × faktör şoku (−%100'de kesilir). Faktörün kendisi tam şoku alır. < 26 ortak hafta → "veri az";
 *       Denetim 64.2: anlamlılık süzgeci (|t| < 2 → β = 0) YALNIZ Dolar/TL faktöründe (oynaklığı çok düşük, gürültü β'sı
 *       saçma kâr/zarar üretir); BTC, Nasdaq, altın senaryolarında HAM β kullanılır (kayıp az gösterilmesin) ve |t| < 2
 *       kalemler "zayıf ilişki" diye işaretlenir.
 *       Dolar/TL faktörü TL'nin DOLAR DEĞERİDİR (1/USDTRY; şok 1/1,3 − 1 = −%23,1) — TL kalemleri β ≈ 1 çıkar.
 *   2022 tekrarı: her kalemin 2021-12-31 → 2022-12-31 USD getirisi; geçmişi yoksa sınıf vekili ("vekil").
 *   Korelasyon: sınıf haftalık getirisi = sınıf içindeki kalemlerin BUGÜNKÜ ağırlıklarıyla ağırlıklı ortalaması; son 52
 *       hafta; Pearson; < 26 ortak hafta → "veri az"; getirisi hiç oynamayan sınıf (USD nakit) → "sabit".
 */
'use strict';
const M = require('./model');
const F = require('./fiyat');
const { adetTarihte } = require('./muhasebe');

const GUN = 864e5;
const HAFTA = 7 * GUN;
const HAFTA_SAYISI = 52;
const EN_AZ_HAFTA = 26;
const BAYAT_NOKTA_GUN = 10;   // haftalık örneklemede bundan eski son fiyat "veri yok" sayılır
const AY_AD = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const ayAdi = (ay) => `${AY_AD[+ay.slice(5, 7) - 1]} ${ay.slice(0, 4)}`;
const ayinSonGunu = (ay) => M.msGun(Date.UTC(+ay.slice(0, 4), +ay.slice(5, 7), 0));
const oncekiGun = (g) => M.msGun(M.gunMs(g) - GUN);
const oncekiAy = (ay) => { const y = +ay.slice(0, 4), m = +ay.slice(5, 7); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
/** Geçerli ay anahtarı (YYYY-AA, ay 01–12). Denetim 64.2: 2026-13 reddedilir. */
const AY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const sonlu = (x) => typeof x === 'number' && Number.isFinite(x);

// ═══ PARA AĞIRLIKLI GETİRİ (XIRR) ═══════════════════════════════════════════
/**
 * XIRR: akislar [{ t (ms), tutar }] — yatırımcı gözüyle: yatırılan EKSİ, alınan / son değer ARTI (Excel XIRR ile aynı).
 * Döndürür: { yillik, x (= ln(1+yıllık)) } ya da null (çözüm yok: hep aynı işaret, tek akış…).
 * Kök seçimi: 0'a (r = 0) en yakın işaret değişimi — birden çok kök varsa en "makul" olan.
 */
function xirr(akislar) {
  const l = (akislar || []).filter(a => sonlu(a.t) && sonlu(a.tutar) && Math.abs(a.tutar) > 1e-12);
  if (l.length < 2 || !l.some(a => a.tutar > 0) || !l.some(a => a.tutar < 0)) return null;
  const t0 = Math.min(...l.map(a => a.t));
  const y = l.map(a => (a.t - t0) / (365 * GUN));
  const yMax = Math.max(...y);
  if (!(yMax > 0)) return null;
  // g(x) = Σ c_i e^(−x·y_i); |x·y| ≤ 700 (taşma yok). Denetim 64.2: üst sınır 60 kaldırıldı — kısa dönemde aşırı
  // kayıp/kazanç (1 günde −%20, 30 günde −%99,5) da çözülür; tarama 0'dan dışa GEOMETRİK adımla (yakında ince, uzakta kaba).
  const sinir = 700 / yMax;
  const g = (x) => { let s = 0; for (let i = 0; i < l.length; i++) s += l[i].tutar * Math.exp(-x * y[i]); return s; };
  const kok = (a, b) => {
    let ga = g(a);
    for (let i = 0; i < 200 && b - a > 1e-13; i++) { const m = (a + b) / 2, gm = g(m); if (gm === 0) return m; if ((gm > 0) === (ga > 0)) { a = m; ga = gm; } else b = m; }
    return (a + b) / 2;
  };
  const g0 = g(0);
  if (g0 === 0) return { yillik: 0, x: 0 };
  let onceki = 0;
  for (let x = 1e-4; onceki < sinir; x = Math.min(sinir, x * 1.02)) {
    if ((g(x) > 0) !== (g0 > 0)) { const k = kok(onceki, x); return { yillik: Math.expm1(k), x: k }; }
    if ((g(-x) > 0) !== (g0 > 0)) { const k = kok(-x, -onceki); return { yillik: Math.expm1(k), x: k }; }
    onceki = x;
  }
  return null;
}

/**
 * Dönem para ağırlıklı getirisi: V0 (t0), akışlar [{t, tutar (+ portföye giren)}], V1 (t1).
 * Döndürür: { donem, yillik, gun } ya da null.
 */
function mwr(V0, akislar, V1, t0, t1) {
  const n = [];
  if (Math.abs(V0) > 1e-9) n.push({ t: t0, tutar: -V0 });
  for (const a of akislar || []) if (Math.abs(a.tutar) > 1e-9) n.push({ t: a.t, tutar: -a.tutar });
  n.push({ t: t1, tutar: V1 });
  const gun = Math.round((t1 - t0) / GUN);
  if (!(gun > 0)) return null;
  const r = xirr(n);
  if (!r) return null;
  return { donem: Math.expm1(r.x * gun / 365), yillik: r.yillik, gun };
}

// ═══ TÜFE ═══════════════════════════════════════════════════════════════════
/** tufe: [{ ay: 'YYYY-AA', t (ayın son günü ms), deger }] artan. */
function tufeAyDegeri(tufe, ay) { const x = (tufe || []).find(a => a.ay === ay); return x ? x.deger : null; }
/** Geometrik ara değer (ay sonu noktaları arasında). Aralık dışı → null. */
function tufeTarihte(tufe, t) {
  if (!tufe || !tufe.length || t < tufe[0].t || t > tufe[tufe.length - 1].t) return null;
  let k = 0;
  while (k + 1 < tufe.length && tufe[k + 1].t <= t) k++;
  if (tufe[k].t === t || k + 1 >= tufe.length) return tufe[k].deger;
  const a = tufe[k], b = tufe[k + 1];
  return a.deger * Math.pow(b.deger / a.deger, (t - a.t) / (b.t - a.t));
}
/** TL getiriyi aylık TÜFE ile reelleştir. Döndürür: { deger, tufeAy, enflasyon, mesaj }. */
/* basGun (denetim 64.2): portföy ay ORTASINDA başladıysa enflasyon başlangıç gününden ay sonuna, TÜFE ay sonu değerleri
 * arasında geometrik ara değerle (Başlangıçtan hesabıyla aynı). */
function tlReelAy(twrTL, tufe, ay, bitti, basGun) {
  if (!sonlu(twrTL)) return { deger: null, mesaj: 'TL getirisi hesaplanamadı (eksik değer)' };
  if (!bitti) return { deger: null, mesaj: 'Ay bitmedi: bu ayın enflasyonu TÜİK açıklayınca (ertesi ayın 3\'ü) hesaplanır' };
  const a = tufeAyDegeri(tufe, ay);
  if (basGun && a != null) {
    const I0 = tufeTarihte(tufe, M.gunMs(basGun));
    if (I0 != null) {
      const e = a / I0 - 1;
      return { deger: (1 + twrTL) / (1 + e) - 1, tufeAy: ay, enflasyon: e, mesaj: `${ayAdi(ay)} TÜFE'si, ${basGun}'den ay sonuna (ara değerli): %${(e * 100).toFixed(2).replace('.', ',')}` };
    }
  }
  const o = tufeAyDegeri(tufe, oncekiAy(ay));
  if (a == null) return { deger: null, tufeAy: ay, mesaj: `${ayAdi(ay)} TÜFE'si henüz yayımlanmadı (TÜİK ertesi ayın 3'ünde açıklar) — tahmin yapılmadı` };
  if (o == null) return { deger: null, tufeAy: ay, mesaj: `${ayAdi(oncekiAy(ay))} TÜFE'si yok — aylık enflasyon hesaplanamadı` };
  const enf = a / o - 1;
  return { deger: (1 + twrTL) / (1 + enf) - 1, tufeAy: ay, enflasyon: enf, mesaj: `${ayAdi(ay)} TÜFE'si: aylık %${(enf * 100).toFixed(2).replace('.', ',')}` };
}

// ═══ DEĞERLEME YARDIMCILARI ═════════════════════════════════════════════════
function baglam(o) {
  const { D, muh, S } = o;
  const kurlar = S.kurlar;
  // Yeni panel F3: o.hesaplar (Set) = bir portföyün hesapları; o.hesap = tek hesap (62.4).
  const icinde = o.hesaplar ? (c) => o.hesaplar.has(c.hesap) : o.hesap ? (c) => c.hesap === o.hesap : () => true;
  /** Çiftin birim fiyatı (kendi para biriminde) t gününde — gunlukSeri ile aynı kural. */
  const birimFiyat = (c, t) => {
    if (c.nakit) return { fiyat: 1, para: c.para };
    const v = D.varliklar.get(c.varlik), s = S.seri.get(c.varlik);
    const n = s ? F.oncekiNokta(s.noktalar, t) : null;
    return n ? { fiyat: n[1], para: v.para } : null;
  };
  const usd = (tutar, para, t) => { const u = F.usdDegeri(para, t, kurlar); return u ? tutar * u.deger : null; };
  /** Çiftin gün sonu USD değeri (null = değerlenemedi). */
  const deger = (c, gun) => {
    const adet = adetTarihte(c, gun);
    if (Math.abs(adet) < 1e-12) return 0;
    const t = M.gunMs(gun), f = birimFiyat(c, t);
    if (!f) return null;
    return usd(adet * f.fiyat, f.para, t);
  };
  return { ...o, kurlar, icinde, birimFiyat, usd, deger };
}

/** Kalem anahtarı: varlık kimliği ya da nakit para birimi ('$TRY'). */
const kalemAnahtari = (c) => (c.nakit ? '$' + c.para : c.varlik);
const NAKIT_AD = { TRY: 'TL nakit', USD: 'Dolar nakit', EUR: 'Euro nakit', GBP: 'Sterlin nakit' };

// ═══ AYLIK RAPOR ════════════════════════════════════════════════════════════
/**
 * o: { D, muh, S, seri (gunlukSeri — aynı hesap süzgeciyle), bugun, ay ('YYYY-AA'), hesap?, tufe }
 * Döndürür: { ay, ad, bitti, bas, bit, V0, V1, fark, akis, akisAdet, piyasa, twrUSD, twrTL, mwr, tlReel, eksik, katkilar, digerKatki, mesaj? }
 */
function ayRaporu(o) {
  const B = baglam(o);
  const { D, muh, seri, bugun, ay } = B;
  const sonGun = ayinSonGunu(ay);
  const bas = `${ay}-01`, bit = sonGun < bugun ? sonGun : bugun;
  const bitti = sonGun < bugun;
  const t0Gun = oncekiGun(bas);
  const temel = { ay, ad: ayAdi(ay), bitti, bas, bit, t0Gun };
  if (!seri || !seri.length || bit < seri[0].tarih || bas > bugun) return { ...temel, bos: true, mesaj: 'Bu ayda portföy kaydı yok' };
  const satir = new Map(seri.map(x => [x.tarih, x]));
  const r0 = satir.get(t0Gun) || null, r1 = satir.get(bit);
  if (!r1) return { ...temel, bos: true, mesaj: 'Ay sonu değeri yok' };
  const pencere = seri.filter(x => x.tarih >= bas && x.tarih <= bit);
  const V0 = r0 ? r0.usd : 0, V1 = r1.usd;
  const akis = pencere.reduce((s, x) => s + x.akisUSD, 0);
  const piyasa = V1 - V0 - akis;
  const eksik = pencere.some(x => x.eksik) || !!(r0 && r0.eksik);
  const e0U = r0 ? r0.endeksUSD : 1, e0T = r0 ? r0.endeksTL : 1;
  const twrUSD = r1.endeksUSD / e0U - 1, twrTL = r1.endeksTL / e0T - 1;
  const t0 = M.gunMs(t0Gun), t1 = M.gunMs(bit);
  const akislar = pencere.filter(x => Math.abs(x.akisUSD) > 1e-9).map(x => ({ t: M.gunMs(x.tarih), tutar: x.akisUSD }));
  // V0 = 0 (portföy bu ay başladı): MWR ilk akış gününden başlar.
  const mwrBas = r0 && Math.abs(V0) > 1e-9 ? t0 : (akislar.length ? akislar[0].t : t0);
  const m = mwr(V0, akislar, V1, mwrBas, t1);
  const k = katkilar(B, t0Gun, bit, bas);
  const toplamKatki = k.satirlar.reduce((s, x) => s + x.katki, 0);
  const diger = piyasa - toplamKatki;
  return {
    ...temel, V0, V1, fark: V1 - V0, akis, akisAdet: k.disAkisAdet, piyasa, twrUSD, twrTL,
    mwr: m ? { donem: m.donem, gun: m.gun } : null,
    tlReel: tlReelAy(twrTL, o.tufe, ay, bitti, r0 ? null : pencere[0].tarih),
    eksik, katkilar: k.satirlar, digerKatki: Math.abs(diger) >= 0.005 ? diger : 0, degerlenemeyen: k.degerlenemeyen
  };
}

/**
 * Varlık başına katkı (USD): V1_p − V0_p − N_p (bkz. dosya başı). Döndürür: { satirlar: [{ anahtar, sembol, ad, katki, getiri,
 * V0, V1, net }], disAkisAdet, degerlenemeyen: [sembol] }.
 */
function katkilar(B, t0Gun, bit, bas) {
  const { D, muh, icinde, birimFiyat, usd, deger } = B;
  const ciftler = [...muh.ciftler.values()].filter(c => icinde(c));
  const N = new Map();
  const ekle = (anahtar, x) => { if (sonlu(x)) N.set(anahtar, (N.get(anahtar) || 0) + x); };
  const disIdler = new Set();
  const gunde = (tarih) => tarih >= bas && tarih <= bit;
  const legUSD = (anahtar, adet, tarih) => {
    const c = muh.ciftler.get(anahtar); if (!c) return null;
    const t = M.gunMs(tarih), f = birimFiyat(c, t);
    return f ? usd(adet * f.fiyat, f.para, t) : null;
  };
  // (1) dış akışlar (yatırma/çekme, açılış, karışık bacak)
  for (const a of muh.akislar) {
    const c = muh.ciftler.get(a.anahtar);
    if (!c || !icinde(c) || !gunde(a.tarih)) continue;
    // 67.2: birim maliyetli açılış alış fiyatından (degerleme.gunlukSeri ile aynı) — katkı alıştan ölçülür.
    ekle(a.anahtar, a.tur === 'acilis' && a.birimMaliyet != null && !c.nakit ? usd(a.adet * a.birimMaliyet, c.para, M.gunMs(a.tarih)) : legUSD(a.anahtar, a.adet, a.tarih));
    disIdler.add(a.id);
  }
  // (2) çok bacaklı işlemler (ana defter)
  const islemler = new Map(D.islemler.map(x => [x.id, x]));
  for (const b of muh.islemBacaklari || []) {
    if (!gunde(b.tarih)) continue;
    const ic = b.bacaklar.filter(x => { const c = muh.ciftler.get(x.anahtar); return c && icinde(c); });
    if (!ic.length) continue;
    if (ic.length < b.bacaklar.length) { for (const x of ic) ekle(x.anahtar, legUSD(x.anahtar, x.adet, b.tarih)); disIdler.add(b.id); continue; }
    const x = islemler.get(b.id);
    const nakit = b.bacaklar.filter(l => muh.ciftler.get(l.anahtar).nakit), varlik = b.bacaklar.filter(l => !muh.ciftler.get(l.anahtar).nakit);
    if (x && (x.islem === 'al' || x.islem === 'sat') && nakit.length === 1 && varlik.length === 1) {
      const n = legUSD(nakit[0].anahtar, nakit[0].adet, b.tarih);
      ekle(nakit[0].anahtar, n); ekle(varlik[0].anahtar, n == null ? null : -n);
    } else if (x && x.islem === 'transfer' && nakit.length === 2) {
      const kaynak = nakit.find(l => l.adet < 0) || nakit[0], hedef = nakit.find(l => l !== kaynak);
      const n = legUSD(kaynak.anahtar, kaynak.adet, b.tarih);
      ekle(kaynak.anahtar, n); ekle(hedef.anahtar, n == null ? null : -n);
    } else for (const l of b.bacaklar) ekle(l.anahtar, legUSD(l.anahtar, l.adet, b.tarih));
  }
  // (3) temettü: nakde giren net tutar varlığın katkısına yazılır
  for (const x of D.islemler) {
    if (x.islem !== 'temettu' || !gunde(x.tarih)) continue;
    const v = D.varliklar.get(x.varlik); if (!v) continue;
    const an = M.ciftAnahtari(x.hesap, x.para || v.para, true), aa = M.ciftAnahtari(x.hesap, x.varlik);
    const cn = muh.ciftler.get(an), ca = muh.ciftler.get(aa);
    if (!cn || !ca || !icinde(cn)) continue;
    if (cn.acilisTarihi && (x.tarih < cn.acilisTarihi || (x.tarih === cn.acilisTarihi && !x.acilisSonrasi))) continue;   // açılışa dahil (gölge)
    const n = legUSD(an, x.tutar - (x.vergi || 0), x.tarih);
    ekle(an, n); ekle(aa, n == null ? null : -n);
  }
  // Kalemlere topla
  const kalem = new Map();
  const degerlenemeyen = [];
  const t0 = M.gunMs(t0Gun), t1 = M.gunMs(bit);
  for (const c of ciftler) {
    const v0 = deger(c, t0Gun), v1 = deger(c, bit), n = N.get(c.anahtar) || 0;
    if (v0 === 0 && v1 === 0 && Math.abs(n) < 1e-9) continue;
    const a = kalemAnahtari(c);
    const v = c.nakit ? null : D.varliklar.get(c.varlik);
    if (v0 == null || v1 == null) { degerlenemeyen.push(v ? v.sembol : NAKIT_AD[c.para] || c.para); continue; }
    if (!kalem.has(a)) {
      // kalemin kendi USD getirisi (fiyat × kur, bu ay)
      let getiri = null;
      const f0 = birimFiyat(c, t0), f1 = birimFiyat(c, t1);
      if (f0 && f1) { const u0 = usd(f0.fiyat, f0.para, t0), u1 = usd(f1.fiyat, f1.para, t1); if (u0 > 0 && u1 != null) getiri = u1 / u0 - 1; }
      kalem.set(a, { anahtar: a, sembol: v ? v.sembol : NAKIT_AD[c.para] || c.para + ' nakit', ad: v ? v.ad : 'faiz, ücret ve kur etkisi', sinif: v ? v.sinif : (c.para === 'TRY' ? 'tl-nakit' : 'nakit'), nakit: c.nakit, getiri, katki: 0, V0: 0, V1: 0, net: 0 });
    }
    const k = kalem.get(a);
    k.V0 += v0; k.V1 += v1; k.net += n; k.katki += v1 - v0 - n;
  }
  const satirlar = [...kalem.values()].filter(k => Math.abs(k.katki) >= 0.005 || Math.abs(k.V1) > 0.005).sort((a, b) => b.katki - a.katki);
  return { satirlar, disAkisAdet: disIdler.size, degerlenemeyen: [...new Set(degerlenemeyen)] };
}

// ═══ BAŞLANGIÇTAN ═══════════════════════════════════════════════════════════
function baslangictan(o) {
  const { seri, tufe } = o;
  if (!seri || !seri.length) return null;
  const ilk = seri[0], son = seri[seri.length - 1];
  const t0 = M.gunMs(ilk.tarih), t1 = M.gunMs(son.tarih);
  const akislar = seri.filter(x => Math.abs(x.akisUSD) > 1e-9).map(x => ({ t: M.gunMs(x.tarih), tutar: x.akisUSD }));
  const m = mwr(0, akislar, son.usd, akislar.length ? akislar[0].t : t0, t1);
  const gun = Math.round((t1 - t0) / GUN);
  const yilDoldu = gun >= 365;
  // TL reel: son yayımlanmış TÜFE ayının sonuna kadar
  let tlReel = { deger: null, mesaj: 'TÜFE verisi yok' };
  if (tufe && tufe.length) {
    const tufeSon = tufe[tufe.length - 1];
    const bitT = Math.min(t1, tufeSon.t), bitGun = M.msGun(bitT);
    const r1 = seri.find(x => x.tarih === bitGun);
    const I0 = tufeTarihte(tufe, t0), I1 = tufeTarihte(tufe, bitT);
    if (bitT <= t0 || !r1 || I0 == null || I1 == null) tlReel = { deger: null, mesaj: `Portföy ${ilk.tarih}'de başladı; o günden sonra yayımlanmış TÜFE yok — reel getiri hesaplanamadı` };
    else {
      const tl = r1.endeksTL / ilk.endeksTL - 1;
      const d = (1 + tl) / (I1 / I0) - 1;
      tlReel = { deger: d, bit: bitGun, tufeAy: tufeSon.ay, tl, enflasyon: I1 / I0 - 1,
        mesaj: `${ilk.tarih} → ${bitGun} (${ayAdi(tufeSon.ay)} TÜFE'sine kadar; enflasyon %${((I1 / I0 - 1) * 100).toFixed(1).replace('.', ',')})` };
    }
  }
  return {
    bas: ilk.tarih, bit: son.tarih, gun, yilDoldu,
    mwr: m ? { donem: m.donem, yillik: yilDoldu ? m.yillik : null } : null,
    yillikMesaj: yilDoldu ? null : '1 yıl dolmadı, yıllığa çevrilmedi',
    twrUSD: son.endeksUSD / ilk.endeksUSD - 1, tlReel
  };
}

// ═══ HAFTALIK GETİRİLER ═════════════════════════════════════════════════════
/** Hafta ızgarası: bitis'ten geriye 52 hafta (53 nokta), artan. */
function haftaIzgarasi(bitisMs, n = HAFTA_SAYISI) { const l = []; for (let k = n; k >= 0; k--) l.push(bitisMs - k * HAFTA); return l; }
/** birim(t) → USD (null = yok) fonksiyonundan haftalık getiriler (n). */
function haftalikGetiri(birim, izgara) {
  const v = izgara.map(t => birim(t));
  const r = [];
  for (let k = 1; k < v.length; k++) r.push(sonlu(v[k]) && sonlu(v[k - 1]) && v[k - 1] > 0 ? v[k] / v[k - 1] - 1 : null);
  return r;
}
/** Seri [[t, fiyat]] + para → t'deki birim USD değeri (BAYAT_NOKTA_GUN'den eski nokta = yok). */
function birimUSD(noktalar, para, kurlar) {
  return (t) => {
    const n = noktalar ? F.oncekiNokta(noktalar, t) : null;
    if (!n || t - n[0] > BAYAT_NOKTA_GUN * GUN) return null;
    const u = F.usdDegeri(para, t, kurlar);
    if (!u || (para !== 'USD' && u.yasGun > BAYAT_NOKTA_GUN)) return null;
    return n[1] * u.deger;
  };
}
/** Ortak (ikisi de dolu) haftalar üzerinden β ve korelasyon. */
function ortak(a, b) {
  const x = [], y = [];
  for (let i = 0; i < a.length; i++) if (sonlu(a[i]) && sonlu(b[i])) { x.push(a[i]); y.push(b[i]); }
  const n = x.length;
  if (!n) return { n: 0 };
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return { n, sxy, sxx, syy };
}
/**
 * β (a'nın b'ye göre) — < EN_AZ_HAFTA → { deger: null, az: true }. İSTATİSTİKSEL ANLAM: ilişkinin t değeri
 * (t = r·√(n−2)/√(1−r²)) |t| < 2 ise (≈ %95 güvenle sıfırdan ayırt edilemiyor) β = 0 sayılır (anlamsiz: true, ham β saklanır).
 * Neden: dolar/TL gibi haftalık oynaklığı çok düşük faktörde gürültü β'yı ±2'ye taşıyor, %30 şokla çarpılınca saçma kâr/zarar çıkıyordu.
 */
const T_ESIK = 2;
function beta(a, b) {
  const o = ortak(a, b);
  if (o.n < EN_AZ_HAFTA) return { deger: null, hafta: o.n, az: true };
  if (!(o.syy > 1e-18)) return { deger: null, hafta: o.n, sabit: true };
  const ham = o.sxy / o.syy;
  if (!(o.sxx > 1e-18)) return { deger: 0, ham: 0, hafta: o.n, sabitKalem: true };   // kalem hiç oynamıyor (dolar nakit): β = 0, 'zayıf ilişki' değil
  const r = Math.max(-1, Math.min(1, o.sxy / Math.sqrt(o.sxx * o.syy)));
  const t = Math.abs(r) >= 1 ? Infinity : Math.abs(r) * Math.sqrt(o.n - 2) / Math.sqrt(1 - r * r);
  if (t < T_ESIK) return { deger: 0, ham, hafta: o.n, anlamsiz: true, t };
  return { deger: ham, ham, hafta: o.n, t };
}
/** Pearson korelasyonu — < EN_AZ_HAFTA → az; varyansı 0 → sabit. */
function korelasyon(a, b) {
  const o = ortak(a, b);
  if (o.n < EN_AZ_HAFTA) return { deger: null, hafta: o.n, az: true };
  if (!(o.sxx > 1e-18) || !(o.syy > 1e-18)) return { deger: null, hafta: o.n, sabit: true };
  return { deger: Math.max(-1, Math.min(1, o.sxy / Math.sqrt(o.sxx * o.syy))), hafta: o.n };
}

// ═══ KALEMLER (bugünkü portföy) ═════════════════════════════════════════════
/** Bugünkü değerlemeden kalemler: varlık (hesaplar toplanır) ve nakit para birimi. */
function kalemler(o) {
  const { D, deg, S, hesap, hesaplar } = o;
  const kurlar = S.kurlar;
  const m = new Map();
  const disarida = (h) => (hesaplar ? !hesaplar.has(h) : hesap ? h !== hesap : false);
  for (const p of deg.pozisyonlar) {
    if (disarida(p.hesap)) continue;
    if (Math.abs(p.adet) < 1e-12 || p.degerUSD == null) continue;
    const v = D.varliklar.get(p.varlik);
    const x = m.get(p.varlik) || { anahtar: p.varlik, sembol: p.sembol, ad: p.ad, sinif: p.sinif, para: p.para, kaynak: v.kaynak, kod: (v.kod || v.sembol || '').toUpperCase(), usd: 0, nakit: false,
      birim: birimUSD((S.seri.get(p.varlik) || {}).noktalar || [], p.para, kurlar) };
    x.usd += p.degerUSD; m.set(p.varlik, x);
  }
  for (const n of deg.nakitler) {
    if (disarida(n.hesap)) continue;
    if (n.degerUSD == null || Math.abs(n.tutar) < 1e-9) continue;
    const a = '$' + n.para;
    const x = m.get(a) || { anahtar: a, sembol: NAKIT_AD[n.para] || n.para + ' nakit', ad: NAKIT_AD[n.para] || n.para, sinif: n.sinif, para: n.para, kaynak: 'nakit', kod: n.para, usd: 0, nakit: true,
      birim: (t) => { const u = F.usdDegeri(n.para, t, kurlar); return u && (n.para === 'USD' || u.yasGun <= BAYAT_NOKTA_GUN) ? u.deger : null; } };
    x.usd += n.degerUSD; m.set(a, x);
  }
  return [...m.values()].filter(x => x.usd > 1e-9);
}

// ═══ STRES ══════════════════════════════════════════════════════════════════
const ABD_HISSE = new Set(['hisse-endeks', 'hisse']);
const SENARYOLAR = [
  { kimlik: 'btc', ad: 'BTC −%50', faktor: 'btc', sok: -0.5, vurur: (k) => k.sinif === 'kripto', not: 'kripto sınıfı' },
  { kimlik: 'nasdaq', ad: 'Nasdaq −%30', faktor: 'qqq', sok: -0.3, vurur: (k) => ABD_HISSE.has(k.sinif) && k.para === 'USD', not: 'dolar cinsi hisse ve endeks fonları (ETF)' },
  { kimlik: 'altin', ad: 'Altın −%20', faktor: 'altin', sok: -0.2, vurur: (k) => k.sinif === 'emtia', not: 'altın / emtia sınıfı' },
  { kimlik: 'dolar', ad: 'Dolar/TL +%30', faktor: 'tl', sok: 1 / 1.3 - 1, kurSok: 0.3, vurur: (k) => k.para === 'TRY', not: 'TL cinsi her kalem (dolar değeri ÷ 1,3)' },
  { kimlik: 'y2022', ad: '2022 tekrarı', not: 'her kalemin kendi 2022 dolar getirisi' }
];
/** Faktörün kendisi mi (tam şok)? */
function faktorKendisi(k, faktor) {
  if (faktor === 'btc') return (k.kaynak === 'binance' && k.kod.replace(/USDT$/, '') === 'BTC') || (k.kaynak === 'yahoo' && k.kod === 'BTC-USD');
  if (faktor === 'qqq') return k.kaynak === 'yahoo' && k.kod === 'QQQ';
  if (faktor === 'altin') return k.kaynak === 'yahoo' && (k.kod === 'GLD' || k.kod === 'GC=F');
  if (faktor === 'tl') return k.nakit && k.para === 'TRY';
  return false;
}
/** 2022 vekili (geçmişi olmayan kalem): sınıf / para birimine göre. */
function vekil2022(k) {
  if (k.sinif === 'kripto') return 'btc';
  if (ABD_HISSE.has(k.sinif)) return k.para === 'TRY' ? 'bist' : 'qqq';
  if (k.sinif === 'emtia') return 'altin';
  if (k.para === 'TRY') return 'tl';
  if (k.para === 'USD') return 'usd';
  return k.para === 'EUR' || k.para === 'GBP' ? 'kur:' + k.para : null;
}
const VEKIL_AD = { btc: 'BTC', qqq: 'QQQ', bist: 'BIST 30', altin: 'altın (GLD)', tl: 'TL', usd: 'dolar nakit', 'kur:EUR': 'Euro', 'kur:GBP': 'Sterlin' };
const Y21 = M.gunMs('2021-12-31'), Y22 = M.gunMs('2022-12-31');
const getiri2022 = (birim) => { const a = birim(Y21), b = birim(Y22); return sonlu(a) && sonlu(b) && a > 0 ? b / a - 1 : null; };

/**
 * o: { D, deg, S, hesap, bugun, faktorler: { btc, qqq, altin, tl, bist, usd, 'kur:EUR'… → birim(t) USD fonksiyonu } }
 * Döndürür: { toplamUSD, toplamTL, kur, senaryolar: [{ kimlik, ad, dogrudan: {usd, oran, tl, kalemler}, beta: {usd, oran, tl, eksik, kalemler}, vekiller }], notlar }
 */
function stres(o) {
  const K = kalemler(o);
  const toplamUSD = K.reduce((s, k) => s + k.usd, 0);
  const kur = o.deg.kur ? o.deg.kur.USDTRY : null;
  const bitis = M.gunMs(o.bugun);
  const iz = haftaIzgarasi(bitis);
  const fak = o.faktorler || {};
  const fGetiri = {};
  for (const f of ['btc', 'qqq', 'altin', 'tl']) fGetiri[f] = fak[f] ? haftalikGetiri(fak[f], iz) : null;
  const kGetiri = new Map(K.map(k => [k.anahtar, haftalikGetiri(k.birim, iz)]));
  const tlEtki = (dUSD, kurSok) => (kur && sonlu(dUSD) ? (toplamUSD + dUSD) * kur * (1 + (kurSok || 0)) - toplamUSD * kur : null);
  const senaryolar = SENARYOLAR.map(s => {
    if (s.kimlik === 'y2022') {
      let d = 0; const vekiller = [], eksik = [], kl = [];
      for (const k of K) {
        let r = getiri2022(k.birim), vk = null;
        if (r == null) { vk = vekil2022(k); r = vk && fak[vk] ? getiri2022(fak[vk]) : null; if (vk && r != null) vekiller.push({ sembol: k.sembol, vekil: VEKIL_AD[vk] || vk }); }
        if (r == null) { eksik.push(k.sembol); continue; }
        d += k.usd * r; kl.push({ sembol: k.sembol, usd: k.usd * r, oran: r, vekil: vk ? VEKIL_AD[vk] || vk : null });
      }
      return { kimlik: s.kimlik, ad: s.ad, not: s.not, dogrudan: { usd: d, oran: toplamUSD > 0 ? d / toplamUSD : null, tl: tlEtki(d), eksik, kalemler: kl.sort((a, b) => a.usd - b.usd).slice(0, 6) }, beta: null, vekiller };
    }
    let d = 0; const dk = [];
    for (const k of K) if (s.vurur(k)) { const x = k.usd * s.sok; d += x; dk.push({ sembol: k.sembol, usd: x }); }
    let b = 0; const bk = [], eksik = [];
    const fr = fGetiri[s.faktor];
    for (const k of K) {
      let etki, bilgi;
      if (faktorKendisi(k, s.faktor)) { etki = s.sok; bilgi = { beta: 1, kendisi: true }; }
      else {
        if (!fr) { eksik.push(k.sembol); continue; }
        const bt = beta(kGetiri.get(k.anahtar), fr);
        if (bt.deger == null) {
          if (!bt.sabit) { eksik.push(k.sembol); continue; }
          etki = 0; bilgi = { beta: 0, sabit: true };
        } else {
          const b0 = s.faktor === 'tl' ? bt.deger : bt.ham;   // süzgeç yalnız Dolar/TL'de
          etki = Math.max(-1, b0 * s.sok); bilgi = { beta: b0, ham: bt.ham, hafta: bt.hafta, anlamsiz: !!bt.anlamsiz, zayif: !!bt.anlamsiz };
        }
      }
      const x = k.usd * etki;
      b += x;
      bk.push({ sembol: k.sembol, ...bilgi, usd: x });
    }
    return {
      kimlik: s.kimlik, ad: s.ad, not: s.not, faktorYok: !fr,
      dogrudan: { usd: d, oran: toplamUSD > 0 ? d / toplamUSD : null, tl: tlEtki(d, s.kurSok), kalemler: dk.sort((a, c) => a.usd - c.usd).slice(0, 6) },
      beta: { usd: b, oran: toplamUSD > 0 ? b / toplamUSD : null, tl: tlEtki(b, s.kurSok), eksik, kalemler: bk.filter(x => sonlu(x.usd)).sort((a, c) => a.usd - c.usd).slice(0, 6),
        zayif: bk.filter(x => x.zayif).map(x => x.sembol), sifirlanan: s.faktor === 'tl' ? bk.filter(x => x.zayif).map(x => x.sembol) : [] }
    };
  });
  return { toplamUSD, toplamTL: kur ? toplamUSD * kur : null, kur, kalemSayisi: K.length, hafta: HAFTA_SAYISI, enAzHafta: EN_AZ_HAFTA, senaryolar };
}

// ═══ KORELASYON (sınıflar arası) ════════════════════════════════════════════
function sinifKorelasyonu(o) {
  const K = kalemler(o);
  const iz = haftaIzgarasi(M.gunMs(o.bugun));
  const siniflar = new Map();
  for (const k of K) {
    const s = siniflar.get(k.sinif) || { anahtar: k.sinif, ad: M.SINIFLAR[k.sinif] || k.sinif, usd: 0, uyeler: [] };
    s.usd += k.usd; s.uyeler.push({ w: k.usd, r: haftalikGetiri(k.birim, iz), sembol: k.sembol }); siniflar.set(k.sinif, s);
  }
  const l = [...siniflar.values()].sort((a, b) => b.usd - a.usd);
  for (const s of l) {
    s.getiri = iz.slice(1).map((_, i) => {
      let pay = 0, w = 0;
      for (const u of s.uyeler) if (sonlu(u.r[i])) { pay += u.w * u.r[i]; w += u.w; }
      return w > 0 ? pay / w : null;
    });
  }
  const matris = l.map(a => l.map(b => korelasyon(a.getiri, b.getiri)));
  return { siniflar: l.map(s => ({ anahtar: s.anahtar, ad: s.ad, usd: s.usd, uyeSayisi: s.uyeler.length })), matris, hafta: HAFTA_SAYISI, enAzHafta: EN_AZ_HAFTA,
    bas: M.msGun(iz[0]), bit: M.msGun(iz[iz.length - 1]) };
}

// ═══ AY LİSTESİ VE TOPLU RAPOR ══════════════════════════════════════════════
/** Seçilebilir aylar (yeniden eskiye): bu ay (devam ediyor) + seri başından bu yana biten aylar. */
function aylar(seri, bugun) {
  const buAy = bugun.slice(0, 7);
  if (!seri || !seri.length) return [{ ay: buAy, ad: ayAdi(buAy), devam: true }];
  const l = [];
  for (let a = buAy; a >= seri[0].tarih.slice(0, 7); a = oncekiAy(a)) l.push({ ay: a, ad: ayAdi(a), devam: a === buAy });
  return l;
}
/** Varsayılan ay: son BİTEN ay (seri o aya uzanıyorsa); yoksa bu ay. */
function varsayilanAy(seri, bugun) {
  const once = oncekiAy(bugun.slice(0, 7));
  return seri && seri.length && seri[0].tarih.slice(0, 7) <= once ? once : bugun.slice(0, 7);
}

/** Bütün rapor. o: { D, muh, S, seri, deg, bugun, ay?, hesap?, tufe, faktorler } */
function rapor(o) {
  const ay = o.ay && AY_RE.test(o.ay) ? o.ay : varsayilanAy(o.seri, o.bugun);
  return {
    ay, aylar: aylar(o.seri, o.bugun), hesap: o.hesap || null, bugun: o.bugun,
    aylik: ayRaporu({ ...o, ay }),
    baslangictan: baslangictan(o),
    stres: stres(o),
    korelasyon: sinifKorelasyonu(o),
    tufeSon: o.tufe && o.tufe.length ? o.tufe[o.tufe.length - 1].ay : null
  };
}

module.exports = {
  xirr, mwr, tufeTarihte, tlReelAy, ayRaporu, katkilar, baslangictan, haftaIzgarasi, haftalikGetiri, birimUSD, beta, korelasyon,
  kalemler, stres, sinifKorelasyonu, aylar, varsayilanAy, rapor, ayAdi, oncekiAy, SENARYOLAR, EN_AZ_HAFTA, HAFTA_SAYISI, T_ESIK, AY_RE
};
