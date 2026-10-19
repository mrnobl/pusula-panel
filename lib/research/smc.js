'use strict';
/**
 * SMART MONEY CONCEPTS — LuxAlgo Pine göstergesinin mantığının JS çevirisi (saf fonksiyonlar, G/Ç yok).
 * ═══════════════════════════════════════════════════════════════════════════
 * LİSANS: Özgün gösterge "Smart Money Concepts [LuxAlgo]" © LuxAlgo, Creative Commons
 * Attribution-NonCommercial-ShareAlike 4.0 (CC BY-NC-SA 4.0) — https://creativecommons.org/licenses/by-nc-sa/4.0/
 * Bu dosya o mantığın uyarlamasıdır; aynı lisansla, YALNIZ kişisel / ticari olmayan araştırma kullanımı içindir.
 * Ticari üründe (ücretli bot, satılan sinyal vb.) kullanılamaz.
 *
 * Çevrilen parçalar (varsayılan girdilerle; çizim kodu yok, yalnız durum ve olaylar):
 *   - ATR200 = ta.atr(200) (RMA, ilk değer ilk 200 TR'nin ortalaması). Yüksek oynaklık mumu: high−low ≥ 2·ATR200
 *     → parsedHigh = low, parsedLow = high (ters); aksi hâlde high/low.
 *   - leg(size): newLegHigh = high[size] > ta.highest(size) → leg = BEARISH(0); else newLegLow = low[size] < ta.lowest(size)
 *     → leg = BULLISH(1). ta.change(leg) = +1 → pivot LOW = low[size]; −1 → pivot HIGH = high[size]. Pivot `size` mum
 *     gecikmeyle (o barda) onaylanır, lookahead yok. Salınım 50, iç (internal) 5, EQH/EQL 3.
 *   - Salınım pivotu trailing extremes'i sıfırlar (top/bottom = pivot seviyesi); her bar top = max(high, top), bottom = min(low, bottom).
 *   - EQH/EQL: size-3 pivotta |önceki aynı tür pivot − yeni| < 0,1·ATR200.
 *   - Yapı (displayStructure): ta.crossover(close, pivotHigh.currentLevel) ve !crossed (iç yapıda ayrıca
 *     internalHigh.currentLevel != swingHigh.currentLevel; confluence filtresi kapalı) → trend BEARISH ise CHoCH, değilse BOS;
 *     trend = BULLISH, crossed = true, OB saklanır. Aşağı tersi.
 *   - Order block: bullish kırılımda parsedLows.slice(pivot.barIndex, bar_index) içindeki en küçük (ilk görülen) → OB =
 *     [parsedHigh, parsedLow] o mumun; bearish: parsedHighs içinde en büyük. slice ŞİMDİKİ BARI KAPSAMAZ (Pine array.slice).
 *     Dizi en çok 100 (unshift + pop). Mitigation High/Low: bearish OB high > OB üstü, bullish OB low < OB altı → silinir.
 *   - FVG (grafik zaman dilimi): barDelta% = (close[1]−open[1])/(open[1]·100); eşik = ta.cum(|barDelta%|)/bar_index·2;
 *     bullish: low > high[2] ve close[1] > high[2] ve barDelta% > eşik → kutu [high[2], low]; bearish tersi → [high, low[2]].
 *     Bullish FVG low < alt kenar (high[2]); bearish FVG high > üst kenar (low[2]) olunca silinir.
 *   - Premium/discount: trailing top/bottom; premium üst %5, discount alt %5, denge %47,5–%52,5.
 *     Strong High = salınım trendi BEARISH iken tepe (aksi Weak), Strong Low = BULLISH iken dip.
 *
 * Bar içi sıra (Lux ana gövdesi): ATR + parse → trailing güncelle → FVG sil → yapı(50) → yapı(5) → yapı(3, EQ) →
 *   iç yapı kırılımı → salınım yapı kırılımı → iç OB sil → salınım OB sil → yeni FVG.
 * ta.crossover(x, y) burada x > y ve x[1] ≤ y[1] olarak alınır (y[1] = önceki barın çağrısındaki seviye).
 */

const BULLISH = 1, BEARISH = -1;          // trend bias
const LEG_BULL = 1, LEG_BEAR = 0;         // leg değerleri
const VARSAYILAN = { salinim: 50, ic: 5, eq: 3, eqEsik: 0.1, atrUzunluk: 200, obAzami: 100 };

function yeniPivot() { return { currentLevel: NaN, lastLevel: NaN, crossed: false, barIndex: -1, onceki: NaN }; }

/**
 * @param {{O:ArrayLike<number>,H:ArrayLike<number>,L:ArrayLike<number>,C:ArrayLike<number>,n?:number}} B
 * @param {object} [ops] VARSAYILAN üzerine
 * @returns durum dizileri + olay listeleri (indeksler bar sırasıdır)
 */
function smcHesapla(B, ops = {}) {
  const P = { ...VARSAYILAN, ...ops };
  const n = B.n ?? B.C.length;
  const { O, H, L, C } = B;
  const atr = new Float64Array(n).fill(NaN);
  const pH = new Float64Array(n), pL = new Float64Array(n);
  const durum = {
    salBias: new Int8Array(n), icBias: new Int8Array(n),
    salTepe: new Float64Array(n), salDip: new Float64Array(n), icTepe: new Float64Array(n), icDip: new Float64Array(n),
    trTop: new Float64Array(n), trBot: new Float64Array(n),
  };
  const yapi = [];   // {i, kapsam:'ic'|'sal', etiket:'BOS'|'CHoCH', yon, seviye, pivotIdx, ob}
  const obler = [];  // {id, kapsam, yon, ust, alt, obIdx, olusum, silinme, atildi}
  const fvgler = []; // {yon, ust, alt, olusum, silinme}
  const eqler = [];  // {i, tur:'EQH'|'EQL', seviye, onceki, pivotIdx, oncekiIdx}
  const pivotlar = { sal: [], ic: [], eq: [] }; // {i (onay), tur:'H'|'L', seviye, pivotIdx}

  const sal = { tepe: yeniPivot(), dip: yeniPivot(), leg: 0, legOnce: null, trend: 0 };
  const ic = { tepe: yeniPivot(), dip: yeniPivot(), leg: 0, legOnce: null, trend: 0 };
  const eq = { tepe: yeniPivot(), dip: yeniPivot(), leg: 0, legOnce: null };
  const tr = { top: NaN, bot: NaN };
  const obAktif = { ic: [], sal: [] };
  let fvgAktif = [];
  let trToplam = 0, rma = NaN, cumDelta = 0, obId = 0;

  function legHesapla(st, size, i) {
    if (i >= size) {
      let hh = -Infinity, ll = Infinity;
      for (let k = i - size + 1; k <= i; k++) { if (H[k] > hh) hh = H[k]; if (L[k] < ll) ll = L[k]; }
      if (H[i - size] > hh) st.leg = LEG_BEAR;
      else if (L[i - size] < ll) st.leg = LEG_BULL;
    }
    const degisim = st.legOnce === null ? 0 : st.leg - st.legOnce; // ta.change: ilk barda na → yok
    st.legOnce = st.leg;
    return degisim;
  }

  function yapiGuncelle(st, size, i, tur) { // getCurrentStructure
    const d = legHesapla(st, size, i);
    if (d === 0) return;
    if (d === 1) { // bullish leg başladı → pivot LOW
      const p = st.dip, sev = L[i - size];
      if (tur === 'eq' && Number.isFinite(p.currentLevel) && Math.abs(p.currentLevel - sev) < P.eqEsik * atr[i]) {
        eqler.push({ i, tur: 'EQL', seviye: sev, onceki: p.currentLevel, pivotIdx: i - size, oncekiIdx: p.barIndex });
      }
      p.lastLevel = p.currentLevel; p.currentLevel = sev; p.crossed = false; p.barIndex = i - size;
      pivotlar[tur].push({ i, tur: 'L', seviye: sev, pivotIdx: i - size });
      if (tur === 'sal') tr.bot = sev;
    } else { // −1 → pivot HIGH
      const p = st.tepe, sev = H[i - size];
      if (tur === 'eq' && Number.isFinite(p.currentLevel) && Math.abs(p.currentLevel - sev) < P.eqEsik * atr[i]) {
        eqler.push({ i, tur: 'EQH', seviye: sev, onceki: p.currentLevel, pivotIdx: i - size, oncekiIdx: p.barIndex });
      }
      p.lastLevel = p.currentLevel; p.currentLevel = sev; p.crossed = false; p.barIndex = i - size;
      pivotlar[tur].push({ i, tur: 'H', seviye: sev, pivotIdx: i - size });
      if (tur === 'sal') tr.top = sev;
    }
  }

  function obSakla(p, kapsam, yon, i) { // storeOrdeBlock
    if (p.barIndex < 0) return null;
    let idx = p.barIndex;
    if (yon === BEARISH) { for (let k = p.barIndex; k < i; k++) if (pH[k] > pH[idx]) idx = k; }
    else { for (let k = p.barIndex; k < i; k++) if (pL[k] < pL[idx]) idx = k; }
    const ob = { id: obId++, kapsam, yon, ust: pH[idx], alt: pL[idx], obIdx: idx, olusum: i, silinme: -1, atildi: -1 };
    const dz = obAktif[kapsam];
    dz.unshift(ob);
    if (dz.length > P.obAzami) { const at = dz.pop(); at.atildi = i; }
    obler.push(ob);
    return ob;
  }

  function kirilim(st, kapsam, i) { // displayStructure
    // yukarı
    let p = st.tepe;
    let ek = kapsam === 'ic' ? p.currentLevel !== sal.tepe.currentLevel : true;
    let kesti = C[i] > p.currentLevel && i > 0 && C[i - 1] <= p.onceki;
    if (kesti && !p.crossed && ek) {
      const etiket = st.trend === BEARISH ? 'CHoCH' : 'BOS';
      p.crossed = true; st.trend = BULLISH;
      const ob = obSakla(p, kapsam, BULLISH, i);
      yapi.push({ i, kapsam, etiket, yon: BULLISH, seviye: p.currentLevel, pivotIdx: p.barIndex, ob });
    }
    p.onceki = p.currentLevel;
    // aşağı
    p = st.dip;
    ek = kapsam === 'ic' ? p.currentLevel !== sal.dip.currentLevel : true;
    kesti = C[i] < p.currentLevel && i > 0 && C[i - 1] >= p.onceki;
    if (kesti && !p.crossed && ek) {
      const etiket = st.trend === BULLISH ? 'CHoCH' : 'BOS';
      p.crossed = true; st.trend = BEARISH;
      const ob = obSakla(p, kapsam, BEARISH, i);
      yapi.push({ i, kapsam, etiket, yon: BEARISH, seviye: p.currentLevel, pivotIdx: p.barIndex, ob });
    }
    p.onceki = p.currentLevel;
  }

  function obSil(kapsam, i) { // deleteOrderBlocks (High/Low kaynağı)
    const dz = obAktif[kapsam];
    for (let k = dz.length - 1; k >= 0; k--) {
      const ob = dz[k];
      if ((ob.yon === BEARISH && H[i] > ob.ust) || (ob.yon === BULLISH && L[i] < ob.alt)) { ob.silinme = i; dz.splice(k, 1); }
    }
  }

  for (let i = 0; i < n; i++) {
    // ATR200 (RMA, ta.tr(true))
    const trv = i === 0 ? H[i] - L[i] : Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1]));
    if (i < P.atrUzunluk) { trToplam += trv; if (i === P.atrUzunluk - 1) rma = trToplam / P.atrUzunluk; }
    else rma = (rma * (P.atrUzunluk - 1) + trv) / P.atrUzunluk;
    atr[i] = rma;
    const yuksekOyn = Number.isFinite(rma) && (H[i] - L[i]) >= 2 * rma;
    pH[i] = yuksekOyn ? L[i] : H[i]; pL[i] = yuksekOyn ? H[i] : L[i];

    // trailing extremes (na ise na kalır)
    tr.top = Math.max(H[i], tr.top); tr.bot = Math.min(L[i], tr.bot);

    // FVG sil
    if (fvgAktif.length) {
      fvgAktif = fvgAktif.filter(f => {
        const sil = (f.yon === BULLISH && L[i] < f.alt) || (f.yon === BEARISH && H[i] > f.ust);
        if (sil) f.silinme = i; return !sil;
      });
    }

    yapiGuncelle(sal, P.salinim, i, 'sal');
    yapiGuncelle(ic, P.ic, i, 'ic');
    yapiGuncelle(eq, P.eq, i, 'eq');
    kirilim(ic, 'ic', i);
    kirilim(sal, 'sal', i);
    obSil('ic', i); obSil('sal', i);

    // FVG oluştur
    if (i >= 2) {
      const bd = (C[i - 1] - O[i - 1]) / (O[i - 1] * 100);
      cumDelta += Math.abs(bd);
      const esik = cumDelta / i * 2;
      if (L[i] > H[i - 2] && C[i - 1] > H[i - 2] && bd > esik) {
        const f = { yon: BULLISH, ust: L[i], alt: H[i - 2], olusum: i, silinme: -1, bd, esik }; fvgAktif.unshift(f); fvgler.push(f);
      } else if (H[i] < L[i - 2] && C[i - 1] < L[i - 2] && -bd > esik) {
        const f = { yon: BEARISH, ust: L[i - 2], alt: H[i], olusum: i, silinme: -1, bd, esik }; fvgAktif.unshift(f); fvgler.push(f);
      }
    } else if (i === 1) {
      cumDelta += Math.abs((C[0] - O[0]) / (O[0] * 100));
    }

    durum.salBias[i] = sal.trend; durum.icBias[i] = ic.trend;
    durum.salTepe[i] = sal.tepe.currentLevel; durum.salDip[i] = sal.dip.currentLevel;
    durum.icTepe[i] = ic.tepe.currentLevel; durum.icDip[i] = ic.dip.currentLevel;
    durum.trTop[i] = tr.top; durum.trBot[i] = tr.bot;
  }
  return { atr, pH, pL, durum, yapi, obler, fvgler, eqler, pivotlar, parametre: P };
}

/** Premium/discount bölgesi: 'premium' | 'discount' | 'denge' | 'ust' (denge–premium arası) | 'alt' | null. */
function bolge(fiyat, top, bot) {
  if (!(Number.isFinite(top) && Number.isFinite(bot)) || top <= bot) return null;
  const x = (fiyat - bot) / (top - bot);
  if (x >= 0.95) return 'premium';
  if (x <= 0.05) return 'discount';
  if (x >= 0.475 && x <= 0.525) return 'denge';
  return x > 0.5 ? 'ust' : 'alt';
}
/** Göreli konum (0 = trailing dip, 1 = tepe). */
function konum(fiyat, top, bot) { return (Number.isFinite(top) && Number.isFinite(bot) && top > bot) ? (fiyat - bot) / (top - bot) : NaN; }
/** Strong/Weak etiketi (Lux): tepe salınım trendi BEARISH iken Strong; dip BULLISH iken Strong. */
function gucEtiketi(salBias) { return { tepe: salBias === BEARISH ? 'Strong High' : 'Weak High', dip: salBias === BULLISH ? 'Strong Low' : 'Weak Low' }; }

module.exports = { smcHesapla, bolge, konum, gucEtiketi, BULLISH, BEARISH, VARSAYILAN };
