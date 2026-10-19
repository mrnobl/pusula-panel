/**
 * KÜÇÜK SERMAYE (S) UYARLAMASI — "Hücum-S" ön-kayıtlı tanımın CANLI karşılığı.
 * Kaynak: PLAN-SERMAYE-1000.md bölüm 3 (deneme 554) ve `scripts/sermaye-1000.js` (BİREBİR kural;
 * tanım burada DEĞİŞTİRİLMEZ, yalnız uygulanır). Sermaye < 5000 $ iken önerilir: 1000 $'da değişmemiş
 * Hücum kolun ~%60'ını yürütebilir (asgari nominal / miktar adımı), Hücum-S BTC kriterlerini geçer.
 *
 * (a) UYGUN SEMBOL — her ay başında, F = özsermaye (bot sermayesi):
 *     L = max{ g ∈ {5, 20, 50, 100, 150} : g ≤ F / 100 }   (F < 500 → hiçbiri)
 *     s uygun ⇔ minEtkin(s) ≤ L,  minEtkin(s) = max(MIN_NOTIONAL(s), minQty(s) × önceki ay son kapanış)
 *     Donchian: evren ∩ uygun, 1/N kalanlar üzerinden. DCA: yalnız uygun segmentler; bütçe
 *     3 × F × w_DCA / N_uygun_aktif. Ters-vol ağırlığı temel bileşenlerden (değişmez).
 * (b) DCA MERDİVENİ — SO sayısı n ∈ {6 … 0}; BO payı = 0,8847 × 100 / (100 + 140 × Σ_{i<n} 1,5^i),
 *     SO = 1,4 × BO, diğer oranlar aynı. n = BO ≥ 1,5 × minEtkin olan EN BÜYÜK n; n = 0 bile
 *     sağlamıyorsa segment o ay kol dışı (bütçe kalanlara; TEK geçişte yeniden hesap). n yalnız o
 *     sembolde açık DCA pozisyonu yokken değişir.
 * Filtreler İŞLEM BORSASINDAN okunur (demo'nun exchangeInfo'su prod'dan farklı olabilir — bindirme
 * raporu ikisini yan yana verir). Pazarda filtre yoksa betikteki gibi 5 USDT, adımsız varsayılır.
 */
const L_IZGARA = Object.freeze([5, 20, 50, 100, 150]);
const OTO_ESIK = 5000;
const GUN = 864e5;

const Lsec = (F) => { let L = null; for (const g of L_IZGARA) if (g <= F / 100) L = g; return L; };
const BO_PAY = (n) => 0.8847 * 100 / (100 + 140 * Array.from({ length: n }, (_, i) => Math.pow(1.5, i)).reduce((a, b) => a + b, 0));

/** Pazardan filtre: MIN_NOTIONAL ve (piyasa emri) minQty. */
function filtre(market) {
  const l = (market && market.limits) || {};
  const minN = l.cost && Number.isFinite(+l.cost.min) && l.cost.min != null ? +l.cost.min : null;
  const minQty = (l.market && +l.market.min) || (l.amount && +l.amount.min) || 0;
  if (minN == null) return { minN: 5, minQty: 0, adim: 0, bilinen: false };
  return { minN, minQty, adim: (market.precision && +market.precision.amount) || 0, bilinen: true };
}

/** Önceki ayın son kapanışı (ay başından önceki en son mum; 5 güne kadar geriye). */
function oncekiAyKapanis(mumlar, ayBasiMs) {
  if (!mumlar || !mumlar.length) return null;
  for (let i = mumlar.length - 1; i >= 0; i--) {
    const t = mumlar[i].time;
    if (t < ayBasiMs) return t >= ayBasiMs - 5 * GUN ? mumlar[i].close : null;
  }
  return null;
}

/** minEtkin = max(MIN_NOTIONAL, minQty × önceki ay son kapanış). */
function minEtkin(market, kapanis) {
  const f = filtre(market);
  return { ...f, kapanis, deger: Math.max(f.minN, kapanis != null ? f.minQty * kapanis : 0) };
}

/**
 * DCA n seçimi — betikteki `nSec` + tek geçiş eleme.
 * @param adaylar sembol listesi (uygun ve aktif)
 * @param me (s) → minEtkin değeri
 * @param kolButce DCA kolunun toplam bütçesi (3 × F × w_DCA)
 * @returns Map(s → n) — yalnız seçilenler (n ≥ 0)
 */
function nSecTum(adaylar, me, kolButce) {
  const nSec = (s, N) => { const butce = kolButce / N; for (let n = 6; n >= 0; n--) if (BO_PAY(n) * butce >= 1.5 * me(s)) return n; return null; };
  let sec = new Map(adaylar.map(s => [s, nSec(s, adaylar.length)]));
  const kalan = adaylar.filter(s => sec.get(s) != null);
  if (kalan.length < adaylar.length) sec = new Map(kalan.map(s => [s, nSec(s, kalan.length)]));
  for (const [s, n] of [...sec]) if (n == null) sec.delete(s);
  return sec;
}

/** S açık mı: true / false / 'oto' (özsermaye < 5000 $). */
function etkinMi(secim, F) {
  if (secim === true) return true;
  if (secim === false || secim == null) return false;
  return F < OTO_ESIK;
}

/** DCA strateji ayarı n'e göre (n = 6 → değişmemiş B Kalkan oranları). */
function dcaAyariN(sermaye, n, strateji = {}) {
  const bo = sermaye * BO_PAY(n);
  return { ...strateji, orderSizeType: 'Fixed', baseOrder: bo, safeOrder: bo * 1.4, maxSafeOrder: n };
}

module.exports = { L_IZGARA, OTO_ESIK, Lsec, BO_PAY, filtre, oncekiAyKapanis, minEtkin, nSecTum, etkinMi, dcaAyariN };
