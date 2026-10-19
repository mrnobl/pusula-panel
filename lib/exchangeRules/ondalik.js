/**
 * ONDALIK GÜVENLİ ADIM ARİTMETİĞİ — tick/step yuvarlaması ve "katı mı" sorusu
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Binance fiyatı ve miktarı ONDALIK METİN olarak okur ve kurala uymayanı
 * reddeder (-4014 tick katı değil, -4023 step katı değil, -1111 hassasiyet).
 * Kayan noktada `85741.6 / 0.1` 857415.99999… çıkar; `Math.floor` ile
 * yuvarlamak bir tick AŞAĞI kaydırır. Bu yüzden burada sayılar ondalık
 * gösterimlerinden (JS'in en kısa gidiş-dönüş metni: `String(x)`) BigInt'e
 * çevrilir ve bölme tamsayıda yapılır.
 *
 * Kayan nokta GÜRÜLTÜSÜ için tek tolerans: değer bir sonraki katın 1e-9 oranı
 * kadar altındaysa (ör. 0.0029999999999999996, adım 0.001) o kata eşit sayılır.
 * Bu YALNIZCA yuvarlamada uygulanır; `katMi` doğrulaması tam ondalıktır, çünkü
 * borsa da gönderilen metni tam okur.
 */

/** Sayıyı ya da ondalık metni { n: BigInt, s: ölçek } biçimine çevirir: değer = n / 10^s. */
function ayristir(x) {
  if (typeof x === 'bigint') return { n: x, s: 0 };
  let m = typeof x === 'number' ? String(x) : String(x).trim();
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(m)) throw new Error(`ondalık değil: ${x}`);
  let us = 0;
  const e = m.toLowerCase().indexOf('e');
  if (e >= 0) { us = parseInt(m.slice(e + 1), 10); m = m.slice(0, e); }
  let isaret = 1n;
  if (m[0] === '-') { isaret = -1n; m = m.slice(1); } else if (m[0] === '+') m = m.slice(1);
  const nokta = m.indexOf('.');
  let tam = m, kesir = '';
  if (nokta >= 0) { tam = m.slice(0, nokta); kesir = m.slice(nokta + 1); }
  let s = kesir.length - us;
  let n = BigInt((tam + kesir) || '0');
  if (s < 0) { n *= 10n ** BigInt(-s); s = 0; }
  return { n: n * isaret, s };
}

/** { n, s } → JS sayısı (ondalık metin üzerinden; ikili gürültü üretmez). */
function sayiya({ n, s }) {
  const neg = n < 0n;
  let t = (neg ? -n : n).toString();
  if (s > 0) {
    if (t.length <= s) t = '0'.repeat(s - t.length + 1) + t;
    t = t.slice(0, t.length - s) + '.' + t.slice(t.length - s);
  }
  return Number((neg ? '-' : '') + t);
}

function hizala(a, b) {
  const s = Math.max(a.s, b.s);
  return [a.n * 10n ** BigInt(s - a.s), b.n * 10n ** BigInt(s - b.s), s];
}

/** Ondalık hane sayısı ("0.10" → 2, 0.001 → 3, "1" → 0). Metin verilirse sondaki sıfırlar SAYILIR. */
function haneSayisi(x) {
  return Math.max(0, ayristir(x).s);
}

/** Anlamlı ondalık hane sayısı (sondaki sıfırlar atılır): 0.10 → 1. */
function anlamliHane(x) {
  let { n, s } = ayristir(x);
  while (s > 0 && n % 10n === 0n) { n /= 10n; s--; }
  return s;
}

/**
 * Değeri `adim`ın katına yuvarlar; kat sayımı `taban`dan başlar
 * (Binance: `(fiyat − minPrice) % tickSize == 0`).
 *
 * @param yon 'asagi' (−∞'a), 'yukari' (+∞'a), 'yakin' (en yakın, yarım yukarı)
 */
function adimaYuvarla(deger, adim, yon = 'asagi', taban = 0) {
  if (!(Number(adim) > 0)) return Number(deger);
  const d = ayristir(deger), a = ayristir(adim), t = ayristir(taban || 0);
  const s = Math.max(d.s, a.s, t.s);
  const olc = (x) => x.n * 10n ** BigInt(s - x.s);
  const V = olc(d) - olc(t);
  const A = olc(a);
  let q = V / A;                 // BigInt bölme sıfıra doğru keser
  let r = V % A;
  if (r < 0n) { q -= 1n; r += A; } // tabana (−∞'a) çevir: 0 ≤ r < A
  // Kayan nokta gürültüsü: bir sonraki kata 1e-9·A'dan yakınsa o kattır.
  if (r > 0n && (A - r) * 1000000000n <= A) { q += 1n; r = 0n; }
  if (r > 0n) {
    if (yon === 'yukari') q += 1n;
    else if (yon === 'yakin') { if (2n * r >= A) q += 1n; }
    else if (yon !== 'asagi') throw new Error(`yuvarlama yönü bilinmiyor: ${yon}`);
  }
  return sayiya({ n: q * A + olc(t), s });
}

/** Değer `taban`dan başlayarak `adim`ın tam katı mı? (tam ondalık, tolerans yok) */
function katMi(deger, adim, taban = 0) {
  if (!(Number(adim) > 0)) return true;
  const d = ayristir(deger), a = ayristir(adim), t = ayristir(taban || 0);
  const s = Math.max(d.s, a.s, t.s);
  const olc = (x) => x.n * 10n ** BigInt(s - x.s);
  return (olc(d) - olc(t)) % olc(a) === 0n;
}

/** Ondalık güvenli çarpım (a × b), sonuç JS sayısı. */
function carp(a, b) {
  const x = ayristir(a), y = ayristir(b);
  return sayiya({ n: x.n * y.n, s: x.s + y.s });
}

/** Ondalık güvenli karşılaştırma: −1, 0, 1. */
function karsilastir(a, b) {
  const [x, y] = hizala(ayristir(a), ayristir(b));
  return x < y ? -1 : (x > y ? 1 : 0);
}

module.exports = { ayristir, sayiya, haneSayisi, anlamliHane, adimaYuvarla, katMi, carp, karsilastir };
