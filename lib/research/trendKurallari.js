/**
 * DONDURULMUŞ TREND AYAĞI KURALLARI — PLAN-GERCEK-MI.md (ölçümden önce, 2026-10-06).
 * Bu dosyadaki kurallar ve parametreler DEĞİŞTİRİLMEZ; tüm "gerçek mi" testleri bunu kullanır.
 *
 * durumlar(kapanislar, ad) → Int8Array: d[j] = 1 ise j günü KAPANIŞINDA "long olmalı" kararı.
 * Uygulama: j+1 günü getirisine d[j] uygulanır (ileriye bakma yok; yalnız 0..j kullanılır).
 */
const ADAYLAR = Object.freeze({
  C0: { ad: 'C0 mevcut O-GC', giris: 'sma100', cikis: 'sma100', onay: 1 },
  C1: { ad: 'C1 Bollinger B-G 50/1,5', giris: 'bb50_1.5', cikis: 'sma50', onay: 1 },
  C2: { ad: 'C2 A2 iki kapanış', giris: 'sma100', cikis: 'sma100', onay: 2 },
  C3: { ad: 'C3 Bollinger + iki kapanış', giris: 'bb50_1.5', cikis: 'sma50', onay: 2 },
  // Plato bilgisi (karar dışı):
  C1a: { ad: 'C1a B-G 50/1,0 (komşu)', giris: 'bb50_1', cikis: 'sma50', onay: 1 },
  C1b: { ad: 'C1b B-G 50/2,0 (komşu)', giris: 'bb50_2', cikis: 'sma50', onay: 1 }
});

function onekler(k) {
  const p = [0], p2 = [0];
  for (const c of k) { p.push(p[p.length - 1] + c); p2.push(p2[p2.length - 1] + c * c); }
  const sma = (j, n) => (j < n - 1 ? null : (p[j + 1] - p[j + 1 - n]) / n);
  const sd = (j, n) => { if (j < n - 1) return null; const o = sma(j, n); return Math.sqrt(Math.max(0, (p2[j + 1] - p2[j + 1 - n]) / n - o * o)); };
  return { sma, sd };
}

/** j kapanışında giriş/çıkış şartı (onaysız, tek gün). null = ısınma. */
function sartlar(k, j, kural, f) {
  const a = f.sma(j, 50), b = f.sma(j, 200);
  if (a == null || b == null || f.sma(j, 100) == null) return null;
  const c = k[j];
  let giris;
  if (kural.giris === 'sma100') giris = c > f.sma(j, 100);
  else { const m = Number(kural.giris.split('_')[1]); giris = c > a + m * f.sd(j, 50); }
  giris = giris && a > b;
  const cikis = kural.cikis === 'sma100' ? c < f.sma(j, 100) : c < a;
  return { giris, cikis };
}

function durumlar(kapanislar, ad) {
  const kural = ADAYLAR[ad]; if (!kural) throw new Error(`bilinmeyen aday: ${ad}`);
  const f = onekler(kapanislar), d = new Int8Array(kapanislar.length);
  let ic = false, gSay = 0, cSay = 0;
  for (let j = 0; j < kapanislar.length; j++) {
    const s = sartlar(kapanislar, j, kural, f);
    if (!s) { d[j] = 0; gSay = cSay = 0; continue; }
    gSay = s.giris ? gSay + 1 : 0;
    cSay = s.cikis ? cSay + 1 : 0;
    if (!ic && gSay >= kural.onay) ic = true;
    else if (ic && cSay >= kural.onay) ic = false;
    d[j] = ic ? 1 : 0;
  }
  return d;
}

/**
 * Trend ayağı günlük getirileri: r[j] = d[j−1] · (k[j]/k[j−1] − 1) − |d[j−1] − d[j−2]| · maliyet.
 * j = 0 için 0. Pozisyon yokken nakit getirisi 0.
 */
function getiriler(kapanislar, d, maliyet = 0.0012) {
  const r = new Float64Array(kapanislar.length);
  for (let j = 1; j < kapanislar.length; j++) {
    const w = d[j - 1], w0 = j >= 2 ? d[j - 2] : 0;
    r[j] = w * (kapanislar[j] / kapanislar[j - 1] - 1) - Math.abs(w - w0) * maliyet;
  }
  return r;
}

module.exports = { ADAYLAR, durumlar, getiriler };
