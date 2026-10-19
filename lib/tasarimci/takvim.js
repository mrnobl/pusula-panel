/**
 * PORTFÖY TASARIMCISI — BORSA İŞLEM GÜNÜ TAKVİMİ (NYSE ve BIST, 2005–2030). PLAN-PORTFOY-TASARIMCI.md (d) `takvim`.
 * Öz test: node scripts/tasarimci-selftest.js (NYSE = ^GSPC günleri, BIST = data/bist işlem günleri; birebir).
 *
 * NEDEN: model portföy kararı "ayın son işlem günü kapanışı", uygulaması "ertesi işlem günü açılışı". Fiyat dosyası o güne
 * gelmeden (ör. ayın 30'u sabahı) "bugün ay sonu mu, yarın borsa açık mı" sorusu TAKVİMLE cevaplanır — veriden değil.
 * Ölçüm betikleri (qqq-momentum.js, bist-yenmek-momentum.js) takvimi veriden kurar; bu modül aynı günleri kuraldan üretir
 * ve öz test ikisinin 2005 → son veri günü birebir aynı olduğunu doğrular.
 *
 * API (t: UTC gece yarısı ms ya da 'YYYY-MM-DD'; borsa: 'NYSE' | 'BIST')
 *   islemGunuMu(t, borsa)            → bool
 *   islemGunleri(bas, son, borsa)    → [ms]  (bas ve son dahil)
 *   sonrakiIslemGunu(t, borsa)       → ms    (t'den SONRAKİ ilk işlem günü; t dahil değil)
 *   oncekiIslemGunu(t, borsa)        → ms    (t'den ÖNCEKİ son işlem günü)
 *   aySonuIslemGunu(ay, borsa)       → ms    (ay: 'YYYY-MM' ya da o aydan bir gün)
 *   aySonuMu(t, borsa)               → bool  (t işlem günü ve sonraki işlem günü başka ayda)
 *   sonrakiKararlar(n, borsa, { simdi }) → [{ ay, karar, uygulama }]  bugünden (dahil) itibaren n ay sonu kararı;
 *        karar = ayın son işlem günü (kapanış), uygulama = ertesi işlem günü (açılış). Tarihler 'YYYY-MM-DD'.
 *   tatiller(yil, borsa)             → [{ tarih, ad }]  (hafta içine düşen kapanışlar)
 *   KAPSAM { bas: 2005, son: 2030 }  — dışında hata atılır (kurallar daha eskiye/ileriye doğrulanmadı).
 *
 * NYSE KURALI: Yeni Yıl (Cumartesi → kapanış yok, Pazar → Pazartesi), MLK (Ocak 3. Pzt), Başkanlar (Şubat 3. Pzt), Kutsal
 *   Cuma (Paskalya − 2), Anma (Mayıs son Pzt), Juneteenth (2022+, 19 Haziran; Cmt → Cuma, Pzr → Pzt), Bağımsızlık (4 Temmuz,
 *   aynı kaydırma), İşçi (Eylül 1. Pzt), Şükran (Kasım 4. Per), Noel (25 Aralık, aynı kaydırma). Özel kapanışlar:
 *   2007-01-02 (Ford), 2012-10-29/30 (Sandy), 2018-12-05 (G. H. W. Bush), 2025-01-09 (Carter). Yarım günler işlem günüdür.
 * BIST KURALI: 1 Ocak, 23 Nisan, 1 Mayıs (2009+), 19 Mayıs, 15 Temmuz (2017+), 30 Ağustos, 29 Ekim; Ramazan Bayramı 3 gün,
 *   Kurban Bayramı 4 gün (Diyanet; tablo Intl islamic-umalqura ile üretildi, Türkiye ilanıyla farklı yıllar elle düzeltildi, 2005–2026 BIST verisiyle doğrulandı). Arife ve
 *   28 Ekim yarım gün → işlem günü. Veriden gözlenen ek kapanışlar EK_KAPALI_BIST'te (her biri gerekçeli).
 *   2027 Diyanet ilanıyla DOĞRULANDI (2026-10-13, B17: Ramazan 9–11 Mart, arife 8 Mart yarım gün; Kurban 16–19 Mayıs, arife 15 Mayıs
 *   Cumartesi). 2028–2030 hesaplanmış takvimdir — Diyanet her yıl ağustos civarı ilan edince doğrulanmalı (BİLİNEN SINIR).
 */
'use strict';

const GUN = 864e5;
const KAPSAM = Object.freeze({ bas: 2005, son: 2030 });
const pad = n => String(n).padStart(2, '0');
const iso = t => new Date(t).toISOString().slice(0, 10);
const U = (y, a, g) => Date.UTC(y, a - 1, g);
function ms(t) {
  if (typeof t === 'number') { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t)) return U(+t.slice(0, 4), +t.slice(5, 7), +t.slice(8, 10));
  if (t instanceof Date) return ms(t.getTime());
  throw new Error(`takvim: tarih anlaşılmadı (${t})`);
}
function borsaDenetle(b) { if (b !== 'NYSE' && b !== 'BIST') throw new Error(`takvim: borsa 'NYSE' | 'BIST' (verilen: ${b})`); }

// ═══ NYSE ════════════════════════════════════════════════════════════════════
/** Paskalya Pazarı (Gregoryen, anonim algoritma). */
function paskalya(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const ay = Math.floor((h + l - 7 * m + 114) / 31), gun = ((h + l - 7 * m + 114) % 31) + 1;
  return U(y, ay, gun);
}
/** ayın n. haftanın-günü (n = −1 → son). hg: 0 = Pazar. */
function nGun(y, a, hg, n) {
  if (n > 0) { const ilk = U(y, a, 1), fark = (hg - new Date(ilk).getUTCDay() + 7) % 7; return ilk + (fark + (n - 1) * 7) * GUN; }
  const son = U(y, a + 1, 1) - GUN, fark = (new Date(son).getUTCDay() - hg + 7) % 7; return son - fark * GUN;
}
/** Cumartesi → Cuma, Pazar → Pazartesi (NYSE Kural 7.2). */
function kaydir(t) { const hg = new Date(t).getUTCDay(); return hg === 6 ? t - GUN : hg === 0 ? t + GUN : t; }
const OZEL_NYSE = Object.freeze({
  '2007-01-02': 'Ulusal yas günü (G. Ford)',
  '2012-10-29': 'Sandy kasırgası', '2012-10-30': 'Sandy kasırgası',
  '2018-12-05': 'Ulusal yas günü (G. H. W. Bush)',
  '2025-01-09': 'Ulusal yas günü (J. Carter)',
});
function nyseTatil(y) {
  const l = [];
  const yy = U(y, 1, 1), hgYY = new Date(yy).getUTCDay();
  if (hgYY === 0) l.push([yy + GUN, 'Yeni Yıl (Pazartesi)']); else if (hgYY !== 6) l.push([yy, 'Yeni Yıl']);   // Cumartesi: Cuma 31 Aralık AÇIK
  l.push([nGun(y, 1, 1, 3), 'Martin Luther King Jr. Günü']);
  l.push([nGun(y, 2, 1, 3), 'Başkanlar Günü']);
  l.push([paskalya(y) - 2 * GUN, 'Kutsal Cuma']);
  l.push([nGun(y, 5, 1, -1), 'Anma Günü']);
  if (y >= 2022) l.push([kaydir(U(y, 6, 19)), 'Juneteenth']);
  l.push([kaydir(U(y, 7, 4)), 'Bağımsızlık Günü']);
  l.push([nGun(y, 9, 1, 1), 'İşçi Bayramı']);
  l.push([nGun(y, 11, 4, 4), 'Şükran Günü']);
  l.push([kaydir(U(y, 12, 25)), 'Noel']);
  for (const [g, ad] of Object.entries(OZEL_NYSE)) if (+g.slice(0, 4) === y) l.push([ms(g), ad]);
  return l;
}

// ═══ BIST ════════════════════════════════════════════════════════════════════
// Bayramın 1. günü (Diyanet). Intl 'islamic-umalqura' (1 Şevval / 10 Zilhicce) ile üretildi; Türkiye'nin ilan ettiği günden
// farklı olan yıllar (2005, 2007, 2008, 2012, 2015, 2016) elle düzeltildi; 2005–2026 BIST verisiyle doğrulandı (öz test).
const RAMAZAN = Object.freeze({ 2004: '2004-11-14', 2005: '2005-11-03', 2006: '2006-10-23', 2007: '2007-10-12', 2008: '2008-09-30', 2009: '2009-09-20', 2010: '2010-09-10',
  2011: '2011-08-30', 2012: '2012-08-19', 2013: '2013-08-08', 2014: '2014-07-28', 2015: '2015-07-17', 2016: '2016-07-05', 2017: '2017-06-25', 2018: '2018-06-15',
  2019: '2019-06-04', 2020: '2020-05-24', 2021: '2021-05-13', 2022: '2022-05-02', 2023: '2023-04-21', 2024: '2024-04-10', 2025: '2025-03-30', 2026: '2026-03-20',
  2027: '2027-03-09', 2028: '2028-02-26', 2029: '2029-02-14', 2030: '2030-02-04' });
const KURBAN = Object.freeze({ 2004: ['2004-02-01'], 2005: ['2005-01-20'], 2006: ['2006-01-10', '2006-12-31'], 2007: ['2007-12-20'], 2008: ['2008-12-08'], 2009: ['2009-11-27'],
  2010: ['2010-11-16'], 2011: ['2011-11-06'], 2012: ['2012-10-25'], 2013: ['2013-10-15'], 2014: ['2014-10-04'], 2015: ['2015-09-24'], 2016: ['2016-09-12'],
  2017: ['2017-09-01'], 2018: ['2018-08-21'], 2019: ['2019-08-11'], 2020: ['2020-07-31'], 2021: ['2021-07-20'], 2022: ['2022-07-09'], 2023: ['2023-06-28'],
  2024: ['2024-06-16'], 2025: ['2025-06-06'], 2026: ['2026-05-27'], 2027: ['2027-05-16'], 2028: ['2028-05-05'], 2029: ['2029-04-24'], 2030: ['2030-04-13'] });
/** Veriden gözlenen, kurala uymayan ek kapanışlar (tarih → neden). Öz test bunları da doğrular. */
const VERI_YOK = 'Yahoo verisinde hiçbir havuz hissesinde çubuk yok — gerçek kapanış doğrulanamadı; veri takvimiyle birebir için kapalı';
const EK_KAPALI_BIST = Object.freeze({
  '2005-01-24': 'Kurban Bayramı ek tatil (veriden)',
  '2006-10-09': VERI_YOK,
  '2007-01-04': 'Kurban Bayramı ek tatil (veriden)',
  '2007-01-30': VERI_YOK,
  '2007-05-01': VERI_YOK,
  '2007-10-15': 'Ramazan Bayramı ek tatil (veriden)', '2007-10-16': 'Ramazan Bayramı ek tatil (veriden)',
  '2012-10-24': 'Kurban Bayramı arifesi tam gün kapalı (veriden)',
  '2016-01-22': VERI_YOK,
  '2023-02-09': '6 Şubat depremleri — işlem durduruldu', '2023-02-10': '6 Şubat depremleri — işlem durduruldu',
  '2023-02-13': '6 Şubat depremleri — işlem durduruldu', '2023-02-14': '6 Şubat depremleri — işlem durduruldu',
  '2024-04-09': "Ramazan Bayramı arifesi (yarım gün); Yahoo'da yalnız 1 hissede çubuk → veri takvimi (≥ 3 hisse) bu günü saymıyor",
});
/** Veriden gözlenen, kurala göre tatil olduğu hâlde işlem yapılan günler (tarih → neden). */
const EK_ACIK_BIST = Object.freeze({});
function bistTatil(y) {
  const l = [];
  const ekle = (t, ad) => l.push([t, ad]);
  ekle(U(y, 1, 1), 'Yılbaşı');
  ekle(U(y, 4, 23), 'Ulusal Egemenlik ve Çocuk Bayramı');
  if (y >= 2010) ekle(U(y, 5, 1), 'Emek ve Dayanışma Günü');   // 2009-05-01 BIST açıktı (veri: 63 hisse)
  ekle(U(y, 5, 19), 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı');
  if (y >= 2017) ekle(U(y, 7, 15), 'Demokrasi ve Millî Birlik Günü');
  ekle(U(y, 8, 30), 'Zafer Bayramı');
  ekle(U(y, 10, 29), 'Cumhuriyet Bayramı');
  // Bayramlar: önceki yılın sonundan taşan günler de (ör. Kurban 2006-12-31 → 2007-01-03) bu yıla düşer.
  for (const yy of [y - 1, y]) {
    if (RAMAZAN[yy]) for (let i = 0; i < 3; i++) ekle(ms(RAMAZAN[yy]) + i * GUN, `Ramazan Bayramı ${i + 1}. gün`);
    for (const k of KURBAN[yy] || []) for (let i = 0; i < 4; i++) ekle(ms(k) + i * GUN, `Kurban Bayramı ${i + 1}. gün`);
  }
  for (const [g, ad] of Object.entries(EK_KAPALI_BIST)) if (+g.slice(0, 4) === y) ekle(ms(g), ad);
  return l.filter(([t]) => new Date(t).getUTCFullYear() === y);
}

// ═══ ORTAK ═══════════════════════════════════════════════════════════════════
const _tatil = { NYSE: new Map(), BIST: new Map() };
function tatilHaritasi(y, borsa) {
  borsaDenetle(borsa);
  if (y < KAPSAM.bas - 1 || y > KAPSAM.son + 1) throw new Error(`takvim: ${y} kapsam dışında (${KAPSAM.bas}–${KAPSAM.son})`);
  const m = _tatil[borsa];
  if (!m.has(y)) {
    const h = new Map();
    for (const [t, ad] of (borsa === 'NYSE' ? nyseTatil(y) : bistTatil(y))) if (!h.has(t)) h.set(t, ad);
    if (borsa === 'BIST') for (const g of Object.keys(EK_ACIK_BIST)) if (+g.slice(0, 4) === y) h.delete(ms(g));
    m.set(y, h);
  }
  return m.get(y);
}
function islemGunuMu(t, borsa) {
  const x = ms(t), hg = new Date(x).getUTCDay();
  if (hg === 0 || hg === 6) return false;
  return !tatilHaritasi(new Date(x).getUTCFullYear(), borsa).has(x);
}
function islemGunleri(bas, son, borsa) {
  const a = ms(bas), b = ms(son), out = [];
  for (let t = a; t <= b; t += GUN) if (islemGunuMu(t, borsa)) out.push(t);
  return out;
}
function sonrakiIslemGunu(t, borsa) { let x = ms(t) + GUN; for (let i = 0; i < 20; i++, x += GUN) if (islemGunuMu(x, borsa)) return x; throw new Error('takvim: 20 günde işlem günü yok'); }
function oncekiIslemGunu(t, borsa) { let x = ms(t) - GUN; for (let i = 0; i < 20; i++, x -= GUN) if (islemGunuMu(x, borsa)) return x; throw new Error('takvim: 20 günde işlem günü yok'); }
function aySonuIslemGunu(ay, borsa) {
  const s = typeof ay === 'string' && /^\d{4}-\d{2}$/.test(ay) ? ay : iso(ms(ay)).slice(0, 7);
  const sonGun = U(+s.slice(0, 4), +s.slice(5, 7) + 1, 1) - GUN;
  return islemGunuMu(sonGun, borsa) ? sonGun : oncekiIslemGunu(sonGun, borsa);
}
function aySonuMu(t, borsa) {
  const x = ms(t);
  if (!islemGunuMu(x, borsa)) return false;
  return new Date(sonrakiIslemGunu(x, borsa)).getUTCMonth() !== new Date(x).getUTCMonth();
}
function sonrakiKararlar(n = 3, borsa = 'NYSE', { simdi = Date.now() } = {}) {
  const out = [];
  let d = new Date(ms(simdi)), y = d.getUTCFullYear(), a = d.getUTCMonth() + 1;
  while (out.length < n) {
    const ay = `${y}-${pad(a)}`, k = aySonuIslemGunu(ay, borsa);
    if (k >= ms(simdi)) out.push({ ay, karar: iso(k), uygulama: iso(sonrakiIslemGunu(k, borsa)) });
    if (++a > 12) { a = 1; y++; }
  }
  return out;
}
function tatiller(y, borsa) {
  return [...tatilHaritasi(y, borsa)].filter(([t]) => { const hg = new Date(t).getUTCDay(); return hg !== 0 && hg !== 6; })
    .sort((a, b) => a[0] - b[0]).map(([t, ad]) => ({ tarih: iso(t), ad }));
}

module.exports = {
  KAPSAM, GUN, ms, iso,
  islemGunuMu, islemGunleri, sonrakiIslemGunu, oncekiIslemGunu, aySonuIslemGunu, aySonuMu, sonrakiKararlar, tatiller,
  _ic: { paskalya, nGun, OZEL_NYSE, RAMAZAN, KURBAN, EK_KAPALI_BIST, EK_ACIK_BIST },
};
