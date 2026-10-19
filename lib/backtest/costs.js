/**
 * MALİYET VE DEĞERLEME — motorun para matematiği (`PLAN-MOTOR.md` §4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Komisyon, giriş maliyeti, kapanış kârı, kapanışta dönen nakit, pozisyonun
 * anlık değeri, likidasyon fiyatı ve finansman payı. Hepsi `run` içinde
 * kapanış (closure) olarak duruyordu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NEDEN AYRI DOSYA
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. **Sessiz hatanın en pahalı olduğu yer burası.** Bu formüllerdeki bir
 *    işaret hatası sonucu yine üretir; yalnızca yanlış üretir. Bu depoda iki
 *    kez oldu: `cost`a çıplak marj yazmak giriş komisyonunu İKİ KEZ düşürdü
 *    (perp long getirisi %38.3 yerine %35.9 çıktı), ve kısmi çıkışta yön
 *    sabit `long` yazıldığı için short beklentisi yanlış hesaplandı.
 *    Ayrı dosya = ayrı test = sayıların tek tek doğrulanabilmesi.
 *
 * 2. **Tanım sırası kırılgandı.** `kapanisKar` gibi fonksiyonlar `takerFee`
 *    ve `perpetual` değişkenlerinden ÖNCE tanımlanıyor, onları kapanışla
 *    yakalıyordu. Çalışıyordu çünkü çağrılma anı sonraydı; ama tanımı bir
 *    satır yukarı almak sessizce `undefined` ile hesap yaptırırdı.
 *
 * Fabrika, koşunun sabitlerini bir kez alır ve fonksiyonları döndürür —
 * böylece hem sıra bağımlılığı kalkar hem her koşu kendi ücretleriyle
 * çalışır.
 */

const { izoleLikidasyon } = require('../exchangeRules/hesap');

/**
 * @param {object} kurulum
 *   feePct     spot komisyon oranı (0.001 = %0.1)
 *   takerFee   vadeli taker oranı; kontrat özelliklerinden gelir
 *   perpetual  vadeli koşu mu
 *   kademeler  bakım marjı kademeleri (`lib/venues.js`)
 *   bakimMarji (kademeler, nominal) → bakım marjı
 *   likidasyonModeli 'eski' (varsayılan) | 'binance' — bkz. `likidasyonFiyati`
 */
const LIKIDASYON_MODELLERI = ['eski', 'binance'];

function hesapKur(kurulum) {
  const k = kurulum || {};
  const feePct = Number.isFinite(k.feePct) ? k.feePct : 0;
  const takerFee = Number.isFinite(k.takerFee) ? k.takerFee : feePct;
  const perpetual = k.perpetual === true;
  const kademeler = k.kademeler || null;
  const bakimMarji = typeof k.bakimMarji === 'function' ? k.bakimMarji : () => 0;
  const likidasyonModeli = k.likidasyonModeli === undefined || k.likidasyonModeli === null ? 'eski' : k.likidasyonModeli;
  if (!LIKIDASYON_MODELLERI.includes(likidasyonModeli)) {
    throw new Error(`likidasyonModeli bilinmiyor: "${likidasyonModeli}" (${LIKIDASYON_MODELLERI.join(' | ')})`);
  }

  /** Satıştan elde edilen NET tutar — komisyon düşülmüş. */
  const netProceeds = (qty, price) => qty * price * (1 - feePct);

  /**
   * Bir lotun gerçek maliyeti: fiyat + alış komisyonu.
   *
   * Giriş komisyonu işlem kârına yansıtılmazsa işlem bazlı kâr ile sermaye
   * değişimi birbirini tutmaz — rapor "kâr ettim" derken bakiye düşer.
   */
  const entryCost = (qty, price) => qty * price * (1 + feePct);

  /**
   * Kapanış kârı.
   *
   * VADELİ: iki yön de MARJ esaslıdır. Kaldıraçlı long'da spot formülü
   * (`netProceeds − cost`) yanlış sonuç verir; orada `cost` marjdır,
   * pozisyonun nominali değil.
   *
   * SHORT (spot/1x perp): ayrılan sermaye marj olarak kilitlenir, kâr-zarar
   * ters yönde hesaplanır ve kapanışta marj + P&L geri döner.
   *
   * Long spotta bu, eskiden beri kullanılan `netProceeds − cost` ile birebir
   * aynı sayıyı verir; mevcut ölçümler bu yüzden değişmez.
   */
  const kapanisKar = (pos, exitPrice, oran = 1) => {
    const qty = pos.amount * oran;
    if (pos.perp) {
      const yon = pos.side === 'short' ? -1 : 1;
      const cikisKomisyon = qty * exitPrice * takerFee;
      return yon * (exitPrice - pos.entryPrice) * qty - (pos.entryFee || 0) * oran - cikisKomisyon;
    }
    if (pos.side === 'short') {
      const cikisKomisyon = qty * exitPrice * feePct;
      return (pos.entryPrice - exitPrice) * qty - (pos.entryFee || 0) * oran - cikisKomisyon;
    }
    return netProceeds(qty, exitPrice) - pos.cost * oran;
  };

  /** Kapanışta kasaya dönen nakit. */
  const kapanisNakit = (pos, exitPrice, oran = 1) => {
    if (pos.perp || pos.side === 'short') return pos.cost * oran + kapanisKar(pos, exitPrice, oran);
    return netProceeds(pos.amount * oran, exitPrice);
  };

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * TEK BİR LOTUN KAPANIŞI — ORTALAMADAN DEĞİL, LOTUN KENDİ FİYATINDAN
   * ═══════════════════════════════════════════════════════════════════════
   * `kapanisKar(pos, fiyat, oran)` pozisyonun ORTALAMA girişini kullanır ve
   * "pozisyonun %30'unu kapat" için doğrudur. Ama "90'dan alınan lotu kapat"
   * için YANLIŞ sayı üretir: 90 ve 50'den alınmış bir pozisyonda ortalama
   * 70'tir, oysa kapanan lot 90'dan alınmıştır ve zararı ortalamanınkinden
   * çok daha büyüktür.
   *
   * Toplam nakit iki yolda da tutar — fark RAPORLANAN işlem kârındadır. Ve
   * "en zararlıdan başlayarak kapat" kuralının tamamı o rapora dayanır: hangi
   * lotun ne kadar zarar ettiği bilinmezse kural ölçülemez.
   *
   * SÖZLEŞME: `Σ lot.cost === pos.cost` ve `Σ lot.amount === pos.amount`.
   * Lotlar açılışta bu iki alanı taşıyarak kaydedilir; taşımayan bir lot
   * maliyeti sıfır sayılır ve kârı olduğundan büyük görünürdü.
   */
  const lotKapanisKar = (pos, lot, exitPrice) => {
    const qty = lot.amount;
    const lotFee = lot.entryFee || 0;
    if (pos.perp) {
      const yon = pos.side === 'short' ? -1 : 1;
      return yon * (exitPrice - lot.price) * qty - lotFee - qty * exitPrice * takerFee;
    }
    if (pos.side === 'short') {
      return (lot.price - exitPrice) * qty - lotFee - qty * exitPrice * feePct;
    }
    return netProceeds(qty, exitPrice) - (lot.cost || 0);
  };

  /** Bir lot kapanınca kasaya dönen nakit. */
  const lotKapanisNakit = (pos, lot, exitPrice) => {
    if (pos.perp || pos.side === 'short') return (lot.cost || 0) + lotKapanisKar(pos, lot, exitPrice);
    return netProceeds(lot.amount, exitPrice);
  };

  /** Pozisyonun anlık değeri: spotta mal değeri, vadelide marj + gerçekleşmemiş P&L. */
  const markDeger = (pos, px) => {
    if (!pos) return 0;
    if (pos.perp) {
      const yon = pos.side === 'short' ? -1 : 1;
      return pos.cost + yon * (px - pos.entryPrice) * pos.amount - (pos.entryFee || 0);
    }
    if (pos.side === 'short') {
      return pos.cost + (pos.entryPrice - px) * pos.amount - (pos.entryFee || 0);
    }
    return pos.amount * px;
  };

  /**
   * LİKİDASYON FİYATI — izole marj.
   *
   * Pozisyonun özkaynağı bakım marjının altına düştüğü fiyat:
   *   long : entry − (marj − bakımMarjı) / miktar
   *   short: entry + (marj − bakımMarjı) / miktar
   *
   * Marjdan giriş komisyonu düşülür (borsa da düşer). Bakım marjı nominale
   * göre KADEMELİ hesaplanır — büyük pozisyonda oran artar.
   *
   * Spot koşuda `null` döner: likidasyon diye bir şey yoktur ve bir sayı
   * döndürmek motoru olmayan bir riski ölçmeye zorlardı.
   *
   * ── likidasyonModeli: 'binance' ───────────────────────────────────────
   * Binance'in resmi izole formülü (`lib/exchangeRules` → `izoleLikidasyon`):
   *   long : (Q·EP − WB − cum) / (Q·(1 − MMR))
   *   short: (Q·EP + WB + cum) / (Q·(1 + MMR))
   * WB = marj (komisyon nakitten ayrıca çekildi, marjdan bir daha düşülmez),
   * bakım marjı LİKİDASYON fiyatındaki nominalle (formülün içinde). Eski
   * modele göre long likidasyonu biraz AŞAĞI, short'u biraz YUKARI taşır —
   * yani daha az likidasyon. MOTOR SONUÇLARINI DEĞİŞTİRDİĞİ için varsayılan
   * DEĞİL; `strategyConfig.likidasyonModeli = 'binance'` ile açılır.
   */
  const likidasyonFiyati = (kisa, entryPrice, amount, marj, girisKomisyon) => {
    if (!perpetual) return null;
    if (likidasyonModeli === 'binance') {
      const { fiyat } = izoleLikidasyon({
        yon: kisa ? 'short' : 'long', miktar: amount, girisFiyati: entryPrice,
        izoleCuzdan: marj, kademeler, markFiyati: entryPrice
      });
      return fiyat > 0 ? fiyat : (kisa ? Infinity : 0);
    }
    const nominal = amount * entryPrice;
    const bakim = bakimMarji(kademeler, nominal);
    const kullanilabilir = marj - girisKomisyon - bakim;
    const mesafe = kullanilabilir / amount;
    const fiyat = kisa ? entryPrice + mesafe : entryPrice - mesafe;
    return fiyat > 0 ? fiyat : (kisa ? Infinity : 0);
  };

  /**
   * Kapanışta işleme yazılacak finansman payı.
   *
   * ⚠ Bu fonksiyon POZİSYONU DEĞİŞTİRİR: ödenmiş finansmandan alınan payı
   * düşer. Sebebi kısmi çıkış: oransal pay gider, kalan pozisyon kalanı
   * taşır. Düşülmezse aynı finansman iki işleme birden yazılır ve işlem
   * bazlı beklenti ile sermaye değişimi birbirini tutmaz.
   */
  const fonlamaPayi = (pos, oran = 1) => {
    const pay = (pos.fundingPaid || 0) * oran;
    pos.fundingPaid = (pos.fundingPaid || 0) - pay;
    return pay;
  };

  return {
    feePct, takerFee, perpetual, likidasyonModeli,
    netProceeds, entryCost, kapanisKar, kapanisNakit, markDeger,
    lotKapanisKar, lotKapanisNakit,
    likidasyonFiyati, fonlamaPayi
  };
}

module.exports = { hesapKur, LIKIDASYON_MODELLERI };
