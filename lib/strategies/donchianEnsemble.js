/**
 * DONCHIAN TOPLULUĞU — günlük trend takibi, oynaklık hedefli.
 *
 * Kaynak: Zarattini, Pagani & Barbon (2025). Kurallar ikincil özetten
 * alındı (asıl makaleye erişilemedi); kaynak DIŞI iki varsayım aşağıda
 * işaretli. Parametreler kaynaktan SABİT — arama yapılmadı.
 *
 * Neden bu strateji: grid/DCA'nın maliyet imzası (deal başı ~%0,36)
 * kısa vadeli ters dönüşün brüt büyüklüğünün çok üstünde (kanıt araştırması,
 * PLAN-GECE.md F1). Günlük trend modeli ayda birkaç kez işlem yapar; maliyet
 * yapısal olarak küçük kalır.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SÖZLEŞME — saf fonksiyonlar, durum dışarıda
 * ═══════════════════════════════════════════════════════════════════════════
 * Backtest ve canlı AYNI kodu kullanır: `adim(durum, kapanislar)` bir günlük
 * kapanış geldiğinde çağrılır ve yeni durumu + hedef maruziyeti döndürür.
 * Canlı yürütücü hedef maruziyeti borsadaki gerçek pozisyonla karşılaştırıp
 * farkı emre çevirir (ideal-vs-gerçek döngüsü). Durum JSON'a yazılabilir —
 * yeniden başlatmada kaldığı yerden devam eder.
 *
 * Kurallar (her alt model N için):
 *   giriş : kapanış > önceki N günün en yüksek kapanışı (bugün hariç)
 *   stop  : max(önceki stop, (son N kapanışın en yükseği + en düşüğü) / 2)
 *           — pencere bugünü İÇERİR
 *   çıkış : kapanış < stop
 * Toplam: maruziyet = (açık alt model / alt model sayısı) × (hedefVol / σ),
 *         kaldıraç tavanıyla sınırlı.
 */

const VARSAYILAN = Object.freeze({
  pencereler: [5, 10, 20, 30, 60, 90, 150, 250, 360],
  hedefVol: 0.25,          // yıllık
  volPencere: 30,          // gün — KAYNAK DIŞI varsayım
  yillikGun: 365,          // kripto 7/24
  kaldiracTavani: 2,
  esik: 0.10,              // maruziyet değişimi bunun altındaysa işlem yok — KAYNAK DIŞI
  // H2 (referans/ANALIZ-DONCHIAN-KAYIP.md, ön-kayıtlı, holdout teyitli): yıllık σ30
  // bunun üstündeyken YENİ alt model açılmaz (açık olanlar stop'una kadar kalır).
  // null = kapalı (kaynak davranışı). KAYNAK DIŞI. VARSAYILAN 1,3: PLAN-ADAYLAR.md 3. ölçüm
  // (B Sharpe 1,41 → 1,50, A CAGR %48,7 → %49,6, ikisinde de DD düştü).
  girisVolTavani: 1.3,
});

function ayarKur(ayar = {}) {
  const a = { ...VARSAYILAN, ...ayar };
  if (!Array.isArray(a.pencereler) || !a.pencereler.length) throw new Error('pencereler boş');
  if (!(a.hedefVol > 0) || !(a.kaldiracTavani > 0)) throw new Error('hedefVol ve kaldiracTavani pozitif olmalı');
  return a;
}

/** Gereken en az geçmiş (gün): en uzun pencere + 1 ve vol penceresi + 1. */
function isinma(ayar) {
  const a = ayarKur(ayar);
  return Math.max(Math.max(...a.pencereler) + 1, a.volPencere + 1);
}

function yeniDurum(ayar) {
  const a = ayarKur(ayar);
  return { altlar: a.pencereler.map(N => ({ N, acik: false, stop: null })), maruziyet: 0 };
}

/** Son `n` kapanışın getirilerinin yıllık std'si. */
function yillikVol(kapanislar, n, yillikGun) {
  const son = kapanislar.length - 1;
  if (son < n) return null;
  const r = [];
  for (let i = son - n + 1; i <= son; i++) r.push(kapanislar[i] / kapanislar[i - 1] - 1);
  const ort = r.reduce((s, x) => s + x, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - ort) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v) * Math.sqrt(yillikGun);
}

function enYuksekEnDusuk(kapanislar, bas, bit) {
  let y = -Infinity, d = Infinity;
  for (let i = bas; i <= bit; i++) { const c = kapanislar[i]; if (c > y) y = c; if (c < d) d = c; }
  return { y, d };
}

/**
 * Bir günlük kapanış işlendi. `kapanislar` bugünü SON eleman olarak içerir.
 * @returns {{ durum, maruziyet, acikSayisi, vol, hamMaruziyet, islemGerekli }}
 *   maruziyet: hedef (özsermayenin katı olarak nominal), eşik uygulanmış
 */
function adim(durumGirdi, kapanislar, ayar) {
  const a = ayarKur(ayar);
  const t = kapanislar.length - 1;
  if (t < isinma(a) - 1) {
    return { durum: durumGirdi, maruziyet: 0, acikSayisi: 0, vol: null, hamMaruziyet: 0, islemGerekli: false, isiniyor: true };
  }
  const c = kapanislar[t];
  const altlar = durumGirdi.altlar.map(x => ({ ...x }));
  const vol = yillikVol(kapanislar, a.volPencere, a.yillikGun);
  const girisYasak = a.girisVolTavani != null && vol > a.girisVolTavani;

  for (const alt of altlar) {
    const { N } = alt;
    const pencere = enYuksekEnDusuk(kapanislar, t - N + 1, t);
    const orta = (pencere.y + pencere.d) / 2;
    if (alt.acik) {
      alt.stop = Math.max(alt.stop, orta);
      if (c < alt.stop) { alt.acik = false; alt.stop = null; }
    } else {
      const onceki = enYuksekEnDusuk(kapanislar, t - N, t - 1);
      if (c > onceki.y && !girisYasak) { alt.acik = true; alt.stop = orta; }
    }
  }

  const acikSayisi = altlar.filter(x => x.acik).length;
  const olcek = vol > 0 ? a.hedefVol / vol : 0;
  const hamMaruziyet = Math.min(a.kaldiracTavani, (acikSayisi / altlar.length) * olcek);

  // Eşik: küçük değişimlerde mevcut maruziyet korunur. Sıfıra iniş ve sıfırdan
  // çıkış her zaman uygulanır — trendden tamamen çıkmak eşiğe takılmamalı.
  const onceki = durumGirdi.maruziyet || 0;
  const tamCikisGiris = (hamMaruziyet === 0) !== (onceki === 0);
  const islemGerekli = tamCikisGiris || Math.abs(hamMaruziyet - onceki) >= a.esik;
  const maruziyet = islemGerekli ? hamMaruziyet : onceki;

  return { durum: { altlar, maruziyet }, maruziyet, acikSayisi, vol, hamMaruziyet, islemGerekli, isiniyor: false };
}

module.exports = { VARSAYILAN, ayarKur, isinma, yeniDurum, adim, yillikVol };
