/**
 * BIST T1 — NAKİT TEMETTÜ EX-GÜN KURALI (deneme 585, PLAN-BIST-HAFTALIK.md) — TEK YER.
 * ═══════════════════════════════════════════════════════════════════════════
 * Geçmiş test (scripts/bist-haftalik.js) ve ileri gölge (lib/ileri/temettuGolge.js, deneme 970, PLAN-ILERI-TEMETTU.md)
 * kuralı BURADAN alır; hiçbiri kendi kopyasını tutmaz. 73.1'de betikten AYNEN çıkarıldı (işlem sırası korunarak; geçmiş test
 * çıktısı bit bit aynı — scripts/ileri-temettu-selftest.js §1 ve 73.1 eşdeğerlik koşusu).
 *
 * KURAL (ön kayıt 585):
 *   · Evren: PIT likidite vekili — her ay, bir önceki ay sonu kapanışında 63 işlem günü medyan TL cirosuna (kapanış × adet;
 *     o gün işlem yoksa 0) göre ilk 50 (≥ 252 günlük geçmiş, son işlemi ≤ 10 gün önce). Ay sonu günü dahil değil.
 *   · Olay: evrendeki hissenin ex-günü d (nakit temettü, 0 < D/P ≤ %30). d−1 hissede işlem günü olmalı.
 *   · İşlem: d−1 KAPANIŞTA al, d AÇILIŞTA sat (bir gece). Getiri = (açılış_d + net temettü × iskonto) / kapanış_{d−1} − 1;
 *     net temettü = D/P × (1 − stopaj) × kapanış_{d−1}; temettü 2 iş günü gecikmeli → PPF iskontosu.
 *   · Stopaj %15 (22.12.2024 öncesi %10).
 *   · Bindirme: aynı gecenin olaylarına sermaye EŞİT bölünür; pozisyon ≤ hissenin d−1 TL cirosunun %1'i (25 bin $ varsayımı).
 *   · Maliyet tek yön (geçmiş test senaryoları): A %0,01 (Midas, seans emri) · B %0,08 · C %0,25.
 * Saf işlevler; dosya / ağ yok.
 */
'use strict';

const GUN = 864e5;
const T1 = Object.freeze({ evrenN: 50, dpUst: 0.30, sermayeUsd: 25000, likOran: 0.01, gecmisGun: 251, sonIslemGun: 10, ciroPencere: 63, odemeGecikmeIsGunu: 2 });
/** Geçmiş testin maliyet senaryoları (tek yön; §1.3 gidiş-dönüş %0,02 / %0,16 / %0,50). */
const MALIYET = Object.freeze({ A: 0.0001, B: 0.0008, C: 0.0025 });
const PPF = Object.freeze({ marj: 0.01, stopaj: 0.15 });

/** Temettü stopajı (ex-gün zamanına göre). */
const stopaj = (t) => (t < Date.UTC(2024, 11, 22) ? 0.10 : 0.15);

function medyan(a) { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }

/**
 * Yahoo günlük satırları → kural satırları (geçmiş testin hisseYukle'si): v, c, ac, o > 0 ve t < sonVeri; ciro = c × v.
 * Artefakt (düzeltilmiş kapanışta |r| > %25 ve ara ≤ 7 g): o günün getirisi 0 sayılır → önceki ham fiyatlar ölçeklenir.
 * `duzeltme(satir, r)` her artefakt için çağrılır (rapor).
 */
function satirHazirla(gunler, sonVeri, { duzeltme = null } = {}) {
  const g = gunler.filter(x => x.v > 0 && x.c > 0 && x.ac > 0 && x.o > 0 && x.t < sonVeri);
  const satir = g.map(x => ({ t: x.t, o: x.o, c: x.c, ac: x.ac, v: x.v, ciro: x.c * x.v, dp: 0, dpNet: 0 }));
  for (let i = satir.length - 1; i >= 1; i--) {
    const r = satir[i].ac / satir[i - 1].ac - 1;
    if (Math.abs(r) > 0.25 && satir[i].t - satir[i - 1].t <= 7 * GUN) {
      const k = satir[i].c / satir[i - 1].c, ka = satir[i].ac / satir[i - 1].ac;
      for (let j = 0; j < i; j++) { satir[j].o *= k; satir[j].c *= k; satir[j].ac *= ka; }
      satir[i].artefakt = true;
      if (duzeltme) duzeltme(satir[i], r);
    }
  }
  return satir;
}

/**
 * İş Yatırım şirket kartı "Temettü" tablosu (temettugercekvarrow satırları) → [{ tarih (dağıtım = hak kullanım günü), brutTL, verim }].
 * Geçmiş testin indirme düzenli ifadesi; tablo DUYURULMUŞ ileri tarihli dağıtımları da içerir (2026-10-07 çekiminde 5 ileri tarih).
 */
function isyTemettuAyristir(html, s) {
  const re = /<tr class="temettugercekvarrow \d+"><td>(\w+)<\/td><td class="text-right" data-order="(\d{8})">[^<]*<\/td><td class="text-right">([^<]*)<\/td><td class="text-right">([\d.,]+)<\/td>/g;
  const m0 = new Map(); let m;
  while ((m = re.exec(html))) {
    if (m[1] !== s) continue; const d = m[2], t = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
    m0.set(t, { tarih: t, brutTL: +m[4].replace(/\./g, '').replace(',', '.'), verim: +(m[3].replace(/\./g, '').replace(',', '.')) || null });
  }
  return [...m0.values()].sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
}

/** D/P geçerli mi (0 < D/P ≤ %30; değilse olay atılır). */
const dpGecerli = (dp) => dp > 0 && !(dp > T1.dpUst);

/**
 * Bir hissenin satırlarını ortak takvime hizalar.
 * @param satir [{ t, ... }] (t artan)  @param takvim [t] (artan)
 * @returns { bar: Array(D) (o gün satır | null), sonIdx: Int32Array(D) (o güne kadarki son satırın indisi, yoksa −1) }
 */
function hizala(satir, takvim) {
  const D = takvim.length;
  const bar = new Array(D).fill(null), sonIdx = new Int32Array(D).fill(-1);
  let k = -1, j = 0;
  for (let d = 0; d < D; d++) {
    while (j < satir.length && satir[j].t <= takvim[d]) { if (satir[j].t === takvim[d]) bar[d] = satir[j]; k = j; j++; }
    sonIdx[d] = k;
  }
  return { bar, sonIdx };
}

/** Takvim: en az 3 hissede işlem olan günler. `satirlar`: hisse başına satır dizileri. */
function takvimKur(satirlar) {
  const sayac = new Map();
  for (const x of satirlar) for (const b of x) sayac.set(b.t, (sayac.get(b.t) || 0) + 1);
  return [...sayac.entries()].filter(([, n]) => n >= 3).map(([t]) => t).sort((a, b) => a - b);
}

/**
 * d gününde (kapanışında) likidite sırası: 63 g medyan TL ciro, büyükten küçüğe. `H`: { s, satir, bar, sonIdx } yinelenebiliri
 * (sıra bağları için girdi sırası korunur).
 */
function evrenSirali(H, takvim, d) {
  const aday = [];
  for (const h of H) {
    const k = h.sonIdx[d];
    if (k < T1.gecmisGun) continue;
    if (takvim[d] - h.satir[k].t > T1.sonIslemGun * GUN) continue;
    const c = []; for (let i = Math.max(0, d - (T1.ciroPencere - 1)); i <= d; i++) c.push(h.bar[i] ? h.bar[i].ciro : 0);
    aday.push([h.s, medyan(c)]);
  }
  return aday.sort((a, b) => b[1] - a[1]).map(x => x[0]);
}

/** Ay geçişi: d ayın son işlem günü mü (takvim sonu da sayılır). */
const ayGecis = (takvim, d) => d === takvim.length - 1 || new Date(takvim[d + 1]).getUTCMonth() !== new Date(takvim[d]).getUTCMonth();
/** ayBasi[d] = d'den ÖNCEKİ son ay sonu günü (yoksa −1). Evren(d) = evrenSirali(ayBasi[d]). */
function ayBasiDizisi(takvim) {
  const out = []; let son = -1;
  for (let d = 0; d < takvim.length; d++) { out[d] = son; if (ayGecis(takvim, d)) son = d; }
  return out;
}

/** Olayın brüt (maliyetsiz) getirisi — işlem sırası geçmiş testle aynı (bit bit). iskonto = 1 / PPF büyümesi (2 iş günü). */
function t1Brut({ cumKapanis, exAcilis, dpNet, iskonto }) {
  return (exAcilis + dpNet * cumKapanis / (1 + 0) * iskonto) / cumKapanis - 1;
}
/** Net = brüt − 2 × tek yön maliyet (olayOzet ile aynı). */
const t1Net = (brut, tekYon) => brut - 2 * tekYon;

/** Likidite tavanı: pozisyon (w × sermaye $ × USDTRY) ≤ cironun %1'i. */
const likiditeTamam = (b, w, usdtry, { sermayeUsd = T1.sermayeUsd, likOran = T1.likOran } = {}) => !!b && w * sermayeUsd * usdtry <= likOran * b.ciro;

/** PPF yıllık oranı (politika faizi − %1, stopaj sonrası). */
const ppfOran = (faiz) => Math.max(0, faiz - PPF.marj) * (1 - PPF.stopaj);

module.exports = { GUN, T1, MALIYET, PPF, stopaj, medyan, satirHazirla, isyTemettuAyristir, dpGecerli, hizala, takvimKur, evrenSirali, ayGecis, ayBasiDizisi, t1Brut, t1Net, likiditeTamam, ppfOran };
