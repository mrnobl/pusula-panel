const BaseStrategy = require('./baseStrategy');
const pool = require('../indicatorPool');

/**
 * Yapı Kapılı OTE — gösterge havuzu üzerine kurulan ilk strateji.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN BU İSKELET — hepsi ölçümden, hiçbiri tercihten
 * ─────────────────────────────────────────────────────────────────────────
 * Depoda ölçülmüş İKİ pozitif bulgu var, ikisi de burada kullanılıyor:
 *
 *   OTE (itici bacağın %62–79 düzeltmesi): brüt edge 1h +%0.195, 4h +%0.289.
 *   Depodaki dokuz stratejinin hepsinden iyi — GİRİŞ YERİ bu.
 *
 *   EQH/EQL likidite süpürmesi: 5 barda %74 isabet, +%0.55 (n=19, ince).
 *   Giriş KALİTE FİLTRESİ olarak opsiyonel; iki hâli de ölçülecek.
 *
 * Ve bir kesin negatif: sigmoid TS flip'i giriş olarak brüt edge ≈ 0 ve dört
 * zaman diliminde örneklem dışında çöktü. Bu yüzden yön kapısı flip'ten değil
 * YAPIDAN (BOS/CHoCH) geliyor.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * KADEMELİ ÇIKIŞ NEDEN R KATINA BAĞLI, BANDA DEĞİL
 * ─────────────────────────────────────────────────────────────────────────
 * `sigmoid_bb`'de kademeli TP isabeti %35.7'den %55.2'ye çıkardı ama tutar
 * ağırlıklı beklentiyi DÜZELTMEDİ (−1.77 → −2.01). Mekanizma: kâr KISMİ
 * boyutta alınıyor, zarar TAM boyutta ediliyor. Çözüm dilimleri küçültmek
 * değil, koşucunun büyük hareketi yakalaması. Bu yüzden:
 *   · dilimler R katında (1R, 2R) — sabit ve hesaplanabilir
 *   · koşucu %40 ve yapı ters dönene kadar taşınıyor
 *   · bant hedefi kullanılmıyor: 4h'te band ortalama %2.35 uzakta ve trend
 *     güçlüyken fiyat bandı yürür, erken çıkarırdı
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HIZLI HAREKETLERDEN KORUNMA — dört ayrı fren
 * ─────────────────────────────────────────────────────────────────────────
 *   1. Displacement barında giriş yok — enerjili mumda girmek hareketin
 *      sonuna binmektir.
 *   2. Stop süpürme fitilinin ötesinde — gürültü stopu almaz.
 *   3. RVOL kapısı (timeOfDay modu) — hacim normalin N katıysa haber/likidasyon
 *      var demektir. Saat etkisini nötrleyen mod şart: düz RVOL her gün NY
 *      açılışında alarm veriyor (ölçüldü: saat yanlılığı 2.98×).
 *   4. Volatilite bandı — ATR% tarihsel aralığın dışındaysa giriş kapalı.
 *
 * HAVUZ KULLANIMI: `prepare()` ile tüm seri bir kez hesaplanır. Bu ileriye
 * bakma DEĞİLDİR; havuzun lookahead testi, `i`. bardaki değerin seri `i`.
 * barda kesilse de aynı çıktığını kanıtlıyor. Kullanılan göstergelerin hepsi
 * o testten geçmiş: swings, structure_state, ote, liquidity_sweep,
 * displacement, atr.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * v2 — SHORT TARAFI (yalnızca perpetual)
 * ─────────────────────────────────────────────────────────────────────────
 * v1 bilerek long-only'di; long tarafı kill kriterinden geçince short eklendi.
 * Tasarım kuralı: iki yön AYNI kapılardan geçer (`girisDene`), yalnızca
 * eşiklerin işareti döner. Short'a özel gevşetilmiş bir kapı YOK — olsaydı
 * iki tarafı karşılaştırmak anlamsız olurdu, çünkü fark stratejiden mi
 * kapıdan mı gelir bilinemezdi.
 *
 * Ayna alınanlar: yön (yapı ayı), bacak (bearish), OTE bölgesi (yukarı
 * düzeltme), süpürme (bearish), stop (bacağın/süpürmenin ÜSTÜ), R katları,
 * koşucu trailing (en düşükten yukarı), CHoCH'ta tam kapanış.
 *
 * Spotta short üretilmez; `marketType: 'perpetual'` şart. Perpetual koşuda
 * backtester finansmanı bar bar MALİYET olarak düşer (iki yönde de gider
 * yazılır — bkz. `lib/backtester.js`).
 */
class StructureOteStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('Yapı Kapılı OTE', config);
    this.hazir = null;
  }

  cfg() {
    const c = this.config || {};
    return {
      // Yapı ve salınım
      swingMethod: c.swingMethod || 'atr',
      swingAtrMultiple: +c.swingAtrMultiple || 2.0,
      swingLookback: +c.swingLookback || 5,
      atrPeriod: +c.atrPeriod || 14,
      confirmBars: c.confirmBars !== undefined ? +c.confirmBars : 2,

      // OTE bölgesi
      oteStart: c.oteStart !== undefined ? +c.oteStart : 0.62,
      oteEnd: c.oteEnd !== undefined ? +c.oteEnd : 0.79,

      // Likidite süpürmesi filtresi (opsiyonel — iki hâli de ölçülecek)
      requireSweep: c.requireSweep === true,
      sweepLookback: c.sweepLookback !== undefined ? +c.sweepLookback : 5,

      // Hızlı hareket frenleri
      blockOnDisplacement: c.blockOnDisplacement !== false,
      dispAtrMultiple: c.dispAtrMultiple !== undefined ? +c.dispAtrMultiple : 1.5,
      rvolMax: c.rvolMax !== undefined ? +c.rvolMax : 3.0,
      atrMinPct: c.atrMinPct !== undefined ? +c.atrMinPct : 0.3,
      atrMaxPct: c.atrMaxPct !== undefined ? +c.atrMaxPct : 8.0,

      // Risk ve çıkış
      stopBufferAtr: c.stopBufferAtr !== undefined ? +c.stopBufferAtr : 0.25,
      tp1R: c.tp1R !== undefined ? +c.tp1R : 1.0,
      tp1Pct: c.tp1Pct !== undefined ? +c.tp1Pct : 0.30,
      tp2R: c.tp2R !== undefined ? +c.tp2R : 2.0,
      tp2Pct: c.tp2Pct !== undefined ? +c.tp2Pct : 0.30,
      trailAtrMult: c.trailAtrMult !== undefined ? +c.trailAtrMult : 2.5,
      breakevenAfterTp1: c.breakevenAfterTp1 !== false,

      // Maliyet kapısı — deponun bir numaralı katili
      feePct: c.feePct !== undefined ? +c.feePct : 0.15,
      minCostMultiple: c.minCostMultiple !== undefined ? +c.minCostMultiple : 4.0,

      // Yön anahtarları. Ölçüm için ayrı ayrı kapatılabilir olmaları şart:
      // "short katkı veriyor mu" sorusu ancak long-only / short-only / ikisi
      // koşuları yan yana konunca cevaplanır.
      //
      // SHORT VARSAYILAN OLARAK KAPALI — ÖLÇÜLDÜ VE KALDI. 1d, 8 varlık,
      // sabit varsayılan: short-only beklenti yalnızca 2/8 varlıkta pozitif,
      // long+short yalnızca 1/8 varlıkta long-only'yi geçti. Kill kriteri
      // (≥6/8 ve ≥6/8) karşılanmadı. Açan bilerek açsın.
      allowLong: c.allowLong !== false,
      allowShort: c.allowShort === true,

      allocationPct: +c.allocationPct || 20.0,
      hardTakeProfitPct: c.hardTakeProfitPct !== undefined ? +c.hardTakeProfitPct : 50.0,
      marketType: c.marketType || 'spot'
    };
  }

  /** Havuz göstergelerini tüm seride bir kez hesaplar (bkz. sınıf notu). */
  prepare(candles) {
    if (!Array.isArray(candles) || candles.length < 60) { this.hazir = null; return; }
    const p = this.cfg();

    const swingParams = {
      method: p.swingMethod,
      atrMultiple: p.swingAtrMultiple,
      lookback: p.swingLookback,
      atrPeriod: p.atrPeriod
    };

    try {
      const ind = pool.compute(candles, [
        { key: 'atr', params: { period: p.atrPeriod } },
        { key: 'swings', params: swingParams },
        { key: 'structure_state', params: { ...swingParams, useClose: true } },
        // `maxLegs` YÜKSEK olmalı: gösterge varsayılanı 40 ve raporu en son
        // 40 bacakla sınırlıyor. Panelde makul (son kurulumlar görünsün) ama
        // strateji tüm seriyi tarıyor — 3284 barlık testte bacaklar yalnızca
        // serinin sonunda var oluyor, geçmişin tamamında "aktif bacak yok"
        // çıkıyordu. İşlem sayısının tek haneli kalmasının gerçek sebebi buydu.
        { key: 'ote', params: { ...swingParams, zoneStart: p.oteStart, zoneEnd: p.oteEnd, maxLegs: 100000 } },
        { key: 'displacement', params: { atrPeriod: p.atrPeriod, atrMultiple: p.dispAtrMultiple } },
        { key: 'liquidity_sweep', params: { ...swingParams, source: 'both' } },
        { key: 'rvol', params: { mode: 'timeOfDay', period: 20, days: 20 } }
      ]);

      const zamanIndeks = new Map();
      candles.forEach((c, i) => zamanIndeks.set(c.time, i));

      // Süpürmeleri onay barına göre indeksle: bir barda birden çok süpürme
      // olabilir, en derini tutulur.
      const supurme = new Array(candles.length).fill(null);
      for (const ev of (ind.liquidity_sweep.events || [])) {
        const i = ev.confirmedAt;
        if (!Number.isFinite(i) || i >= candles.length) continue;
        if (!supurme[i] || ev.penetrationAtr > supurme[i].penetrationAtr) supurme[i] = ev;
      }

      this.hazir = { ind, zamanIndeks, supurme, n: candles.length };
    } catch (err) {
      this.hazir = null;
    }
  }

  /** Bu barın indeksi; hazırlık yoksa pencereden hesaplanır. */
  indeksBul(candles) {
    const son = candles[candles.length - 1];
    if (this.hazir && this.hazir.zamanIndeks.has(son.time)) {
      return this.hazir.zamanIndeks.get(son.time);
    }
    return null;
  }

  /**
   * Verilen yöndeki EN SON bacağı bulur.
   *
   * İLK SÜRÜMDEKİ HATA: yönden bağımsız olarak en son bacak alınıp sonra
   * "boğa mı" diye bakılıyordu. Oysa bacaklar zorunlu olarak alternatiftir:
   * fiyat yeni zirve yapıp geri çekilirken, bu geri çekilme AYI bacağı olarak
   * onaylanır ve "en son bacak" olur. Yani OTE'sini ölçmek istediğimiz boğa
   * bacağı tam da düzeltme sırasında listeden düşüyordu.
   *
   * Ölçüldü: yapının boğa olduğu ~1774 barın 1500'ünde (%85) "aktif boğa
   * bacağı yok" deniyordu — sebebi buydu, salınım hassasiyeti değil.
   */
  static aktifBacak(legs, i, yon = 'bullish') {
    let aktif = null;
    for (const b of legs) {
      if (b.direction !== yon) continue;
      if (b.knownAt > i) continue;
      if (b.invalidatedAt !== null && i >= b.invalidatedAt) continue;
      if (!aktif || b.knownAt > aktif.knownAt) aktif = b;
    }
    return aktif;
  }

  evaluate(ohlcv, ticker, positions) {
    const p = this.cfg();
    if (!Array.isArray(ohlcv) || ohlcv.length < 60) {
      return { action: 'HOLD', reason: 'Yetersiz mum verisi' };
    }

    // Canlı motorda `prepare` çağrılmaz; pencere üzerinde hesaplanır.
    // Havuzun kendi önbelleği tekrar eden tick'leri ucuzlatır.
    if (!this.hazir || !this.hazir.zamanIndeks.has(ohlcv[ohlcv.length - 1].time)) {
      this.prepare(ohlcv);
    }
    if (!this.hazir) return { action: 'HOLD', reason: 'Göstergeler hazırlanamadı' };

    const i = this.indeksBul(ohlcv);
    if (i === null) return { action: 'HOLD', reason: 'Bar indeksi çözülemedi' };

    const { ind, supurme } = this.hazir;
    const son = ohlcv[ohlcv.length - 1];
    const fiyat = (ticker && ticker.last) || son.close;

    const atr = ind.atr.value[i];
    const durum = ind.structure_state.state[i];
    const choch = ind.structure_state.choch[i];
    const rvol = ind.rvol.value[i];
    const dispBull = ind.displacement.bullish[i];
    const dispBear = ind.displacement.bearish[i];

    const gostergeler = {
      yapi: durum,
      atr: Number.isFinite(atr) ? +atr.toFixed(6) : null,
      atrPct: Number.isFinite(atr) && fiyat > 0 ? +((atr / fiyat) * 100).toFixed(3) : null,
      rvol: Number.isFinite(rvol) ? +rvol.toFixed(2) : null,
      ote: null,
      retracement: Number.isFinite(ind.ote.retracement[i]) ? +ind.ote.retracement[i].toFixed(3) : null
    };

    if (!Number.isFinite(atr) || atr <= 0) {
      return { action: 'HOLD', reason: 'Isınma (ATR bekleniyor)', indicators: gostergeler };
    }

    const acik = (positions || []).filter(x => x && x.amount > 0);
    const komisyonGidisDonus = p.feePct * 2;

    // ── POZİSYON VARKEN ──────────────────────────────────────────────────
    if (acik.length) {
      // Yön pozisyonun kendisinden okunur; strateji durumu tutmaz.
      const kisa = acik[0].side === 'short';
      const miktar = acik.reduce((a, x) => a + x.amount, 0);
      const giris = acik.reduce((a, x) => a + x.amount * x.entryPrice, 0) / miktar;
      const stopMesafe = acik[0].stopPct ? (giris * acik[0].stopPct / 100) : (atr * 1.5);
      // R short'ta ters işaretli: kâr fiyat DÜŞÜNCE oluşur.
      const R = stopMesafe > 0 ? ((kisa ? giris - fiyat : fiyat - giris) / stopMesafe) : 0;
      // Kâr yüzdesi de yön duyarlı — mesajlarda ve breakeven'da kullanılır.
      const karPct = kisa ? ((giris - fiyat) / giris) * 100 : ((fiyat - giris) / giris) * 100;

      if (!this.islem || this.islem.giris !== +giris.toFixed(8)) {
        // `uc`: long'da görülen EN YÜKSEK, short'ta EN DÜŞÜK fiyat.
        this.islem = { giris: +giris.toFixed(8), tp1: false, tp2: false, uc: fiyat };
      }
      if (kisa ? fiyat < this.islem.uc : fiyat > this.islem.uc) this.islem.uc = fiyat;

      gostergeler.R = +R.toFixed(2);
      gostergeler.yon = kisa ? 'short' : 'long';

      // Koşucu için ATR trailing — her barda gönderilir, yalnızca sıkılaşır.
      // Short'ta trailing stop uçtan YUKARI kurulur.
      const trail = kisa
        ? this.islem.uc + p.trailAtrMult * atr
        : this.islem.uc - p.trailAtrMult * atr;
      const takip = this.islem.tp1 && p.breakevenAfterTp1
        ? (kisa ? Math.min(trail, giris) : Math.max(trail, giris))  // TP1 sonrası breakeven'ı geçmez
        : trail;

      // 1) Yapı ters döndü → koşucuyu da kapat.
      if (kisa ? (durum === 1 || choch === 1) : (durum === -1 || choch === -1)) {
        return {
          action: 'SELL', closeAll: true, updateStop: takip,
          reason: `Yapı ters döndü (CHoCH) — pozisyon kapatılıyor`,
          indicators: gostergeler
        };
      }

      // 2) TP1 — 1R'de %30, stop breakeven'a.
      if (!this.islem.tp1 && R >= p.tp1R) {
        this.islem.tp1 = true;
        const beStop = p.breakevenAfterTp1
          ? (kisa ? Math.min(takip, giris) : Math.max(takip, giris))
          : takip;
        return {
          action: 'SELL', partialPct: Math.min(0.95, p.tp1Pct), updateStop: beStop,
          reason: `TP1 ${p.tp1R}R (%${karPct.toFixed(2)}) — %${(p.tp1Pct * 100).toFixed(0)} alındı, stop breakeven`,
          indicators: gostergeler
        };
      }

      // 3) TP2 — 2R'de %30. Dilim ORİJİNALE göre; motor kalandan keser.
      if (this.islem.tp1 && !this.islem.tp2 && R >= p.tp2R) {
        this.islem.tp2 = true;
        const kalanOran = 1 - p.tp1Pct;
        const partial = kalanOran > 0 ? Math.min(0.95, p.tp2Pct / kalanOran) : 0.95;
        return {
          action: 'SELL', partialPct: partial, updateStop: takip,
          reason: `TP2 ${p.tp2R}R (%${karPct.toFixed(2)}) — %${(p.tp2Pct * 100).toFixed(0)} alındı`,
          indicators: gostergeler
        };
      }

      const kalan = 1 - (this.islem.tp1 ? p.tp1Pct : 0) - (this.islem.tp2 ? p.tp2Pct : 0);
      return {
        action: 'HOLD', updateStop: takip,
        reason: `Koşucu taşınıyor (%${(kalan * 100).toFixed(0)}, ${R.toFixed(2)}R, trail $${takip.toFixed(4)})`,
        indicators: gostergeler
      };
    }

    this.islem = null;

    // ── GİRİŞ TARAFI ─────────────────────────────────────────────────────
    // Yönü yapı seçer; hangi yönlerin açık olduğunu piyasa tipi ve anahtarlar.
    const perp = p.marketType === 'perpetual';
    const ctx = { p, ind, supurme, i, son, fiyat, atr, rvol, dispBull, dispBear, komisyonGidisDonus, gostergeler };

    if (durum === 1) {
      if (!p.allowLong) {
        return { action: 'HOLD', reason: 'Long yönü kapalı (allowLong)', indicators: gostergeler };
      }
      return this.girisDene(1, ctx);
    }

    if (durum === -1) {
      if (!perp) {
        return { action: 'HOLD', reason: 'Yapı ayı yönünde — spotta short yok', indicators: gostergeler };
      }
      if (!p.allowShort) {
        return { action: 'HOLD', reason: 'Short yönü kapalı (allowShort)', indicators: gostergeler };
      }
      return this.girisDene(-1, ctx);
    }

    return { action: 'HOLD', reason: 'Yapı yönü belirsiz', indicators: gostergeler };
  }

  /**
   * Tek yönlü giriş kurulumu. `yon`: 1 long, -1 short.
   *
   * İKİ YÖN AYNI KAPILARDAN GEÇER. Bu bilinçli: short tarafına özel gevşetilmiş
   * bir eşik konsaydı, iki yönün beklentisi arasındaki farkın stratejiden mi
   * kapıdan mı geldiği ölçülemezdi. Yalnızca işaretler döner:
   *   · bacak yönü        bullish ↔ bearish
   *   · bölge şartı       fitil aşağıdan ↔ yukarıdan değer
   *   · bacak geçersizliği kapanış origin'in altı ↔ üstü
   *   · süpürme yönü      bullish ↔ bearish
   *   · stop              origin/süpürmenin ALTI ↔ ÜSTÜ
   */
  girisDene(yon, ctx) {
    const { p, ind, supurme, i, son, fiyat, atr, rvol, dispBull, dispBear, komisyonGidisDonus, gostergeler } = ctx;
    const uzun = yon === 1;
    const HOLD = (reason) => ({ action: 'HOLD', reason, indicators: gostergeler });

    // Yön TEYİTLİ mi: son `confirmBars` bar boyunca aynı yön.
    for (let k = 0; k < p.confirmBars; k++) {
      if (ind.structure_state.state[i - k] !== yon) {
        return HOLD(`Yapı teyidi yetersiz (${p.confirmBars} bar isteniyor)`);
      }
    }

    // OTE bölgesi — bacak SEÇİMİ ve bölge kontrolü burada yapılır.
    //
    // `ind.ote.inOte` kullanılmıyor: o gösterge de "en son bacak"a bakıyor ve
    // düzeltme sırasında aktif bacak ters yöne dönüyor. Yön filtreli bacağı
    // kendimiz seçip bölgeyi kendimiz ölçüyoruz.
    const bacak = StructureOteStrategy.aktifBacak(ind.ote.legs || [], i, uzun ? 'bullish' : 'bearish');
    if (!bacak) return HOLD(`Aktif ${uzun ? 'boğa' : 'ayı'} bacağı yok`);
    gostergeler.ote = `${bacak.zoneLow.toFixed(2)}–${bacak.zoneHigh.toFixed(2)}`;

    // Bacağın başlangıcı kırıldıysa kurulum ölmüştür.
    if (uzun ? son.close < bacak.originPrice : son.close > bacak.originPrice) {
      return HOLD('Bacak başlangıcı kırıldı — kurulum geçersiz');
    }

    // Fitille bölgeye girmek yeterli; kapanış bölgenin dışında kalabilir.
    const bolgede = uzun
      ? (son.low <= bacak.zoneHigh && son.close >= bacak.zoneLow)
      : (son.high >= bacak.zoneLow && son.close <= bacak.zoneHigh);
    if (!bolgede) {
      const ret = bacak.length > 0
        ? (uzun ? (bacak.extremePrice - son.close) : (son.close - bacak.extremePrice)) / bacak.length
        : 0;
      gostergeler.retracement = +ret.toFixed(3);
      return HOLD(`Fiyat OTE bölgesinde değil (düzeltme ${(ret * 100).toFixed(0)}%)`);
    }

    // ── Hızlı hareket frenleri ── (yönden bağımsız: her iki yönde de
    // displacement barına binmek hareketin sonuna binmektir)
    if (p.blockOnDisplacement && (dispBull === 1 || dispBear === 1)) {
      return HOLD('Displacement barı — giriş bekletildi');
    }
    if (p.rvolMax > 0 && Number.isFinite(rvol) && rvol > p.rvolMax) {
      return HOLD(`RVOL ${rvol.toFixed(2)} > ${p.rvolMax} — olağandışı hacim, giriş yok`);
    }
    const atrPct = (atr / fiyat) * 100;
    if (atrPct < p.atrMinPct || atrPct > p.atrMaxPct) {
      return HOLD(`ATR %${atrPct.toFixed(2)} bandın dışında (${p.atrMinPct}–${p.atrMaxPct})`);
    }

    // ── Likidite süpürmesi (opsiyonel kalite filtresi) ──
    const supYon = uzun ? 'bullish' : 'bearish';
    let sup = null;
    for (let k = 0; k <= p.sweepLookback && i - k >= 0; k++) {
      const s = supurme[i - k];
      if (s && s.direction === supYon) { sup = s; break; }
    }
    if (p.requireSweep && !sup) return HOLD('Süpürme şartı sağlanmadı');

    // ── Stop: süpürme fitilinin ötesi, yoksa bacak başlangıcının ötesi ──
    const tampon = (sup && Number.isFinite(sup.level))
      ? (sup.penetrationAtr * atr) + (p.stopBufferAtr * atr)
      : (p.stopBufferAtr * atr);
    const dayanak = (sup && Number.isFinite(sup.level)) ? sup.level : bacak.originPrice;
    const stopSeviye = uzun ? dayanak - tampon : dayanak + tampon;

    if (!(stopSeviye > 0) || (uzun ? stopSeviye >= fiyat : stopSeviye <= fiyat)) {
      return HOLD('Stop seviyesi geçersiz');
    }

    const stopMesafePct = (Math.abs(fiyat - stopSeviye) / fiyat) * 100;

    // ── Maliyet kapısı: TP1'e mesafe komisyonun N katı olmalı ──
    const tp1MesafePct = stopMesafePct * p.tp1R;
    if (tp1MesafePct < komisyonGidisDonus * p.minCostMultiple) {
      return HOLD(`TP1 mesafesi maliyeti karşılamıyor (%${tp1MesafePct.toFixed(2)} < %${(komisyonGidisDonus * p.minCostMultiple).toFixed(2)})`);
    }

    gostergeler.yon = uzun ? 'long' : 'short';

    return {
      action: uzun ? 'BUY' : 'SHORT',
      allocationPct: p.allocationPct,
      stopLossPct: +stopMesafePct.toFixed(4),
      takeProfitPct: p.hardTakeProfitPct,
      slLevel: +stopSeviye.toFixed(6),
      reason: `OTE ${uzun ? 'long' : 'short'} girişi${sup ? ' + süpürme' : ''} — bacak ${bacak.originPrice.toFixed(2)}→${bacak.extremePrice.toFixed(2)}, `
        + `stop $${stopSeviye.toFixed(4)} (%${stopMesafePct.toFixed(2)}), TP1 ${p.tp1R}R`,
      indicators: gostergeler
    };
  }
}

/** Isınma: en uzun bağımlılık `rvol` gün örneklemesi ve swings ısınmasıdır. */
StructureOteStrategy.warmupBars = (cfg = {}) =>
  Math.max(+cfg.atrPeriod || 14, 60) + 60;

StructureOteStrategy.configWarnings = (cfg = {}) => {
  const u = [];
  const tp = (+cfg.tp1Pct || 0.30) + (+cfg.tp2Pct || 0.30);
  if (tp >= 1) u.push(`TP dilimleri toplamı ${tp.toFixed(2)} — koşucu kalmıyor; asıl kâr koşucudan bekleniyor.`);
  if ((+cfg.tp2R || 2) <= (+cfg.tp1R || 1)) u.push('TP2 hedefi TP1\'den büyük olmalı.');
  if ((+cfg.minCostMultiple || 4) < 2) u.push('Maliyet kapısı 2\'nin altında: komisyonun altındaki hedefler işleme dönüşür.');
  if (cfg.allowShort === true && (cfg.marketType || 'spot') !== 'perpetual') {
    u.push('Short yönü açık ama piyasa spot: short sinyali üretilmez.');
  }
  if (cfg.allowShort === true) {
    u.push('Short tarafı kill kriterinden GEÇEMEDİ (2/8 varlıkta pozitif). Ölçülmüş negatif bir yönü açıyorsun.');
  }
  if (cfg.allowLong === false && cfg.allowShort === false) u.push('Her iki yön de kapalı — strateji hiç işlem açmaz.');
  return u;
};

StructureOteStrategy.paramSchema = {
  swingMethod: { type: 'enum', values: ['atr', 'pivot'], default: 'atr', label: 'Salınım yöntemi', group: 'Yapı' },
  swingAtrMultiple: { type: 'number', default: 2.0, min: 0.5, max: 6, step: 0.1, label: 'Salınım ATR çarpanı', group: 'Yapı' },
  atrPeriod: { type: 'number', default: 14, min: 2, max: 100, step: 1, label: 'ATR periyodu', group: 'Yapı' },
  confirmBars: { type: 'number', default: 2, min: 1, max: 10, step: 1, label: 'Yön teyit barı', group: 'Yapı', description: 'Yapı bu kadar bar üst üste aynı yönde olmalı.' },

  oteStart: { type: 'number', default: 0.62, min: 0.3, max: 0.9, step: 0.01, label: 'OTE başı', group: 'Giriş' },
  oteEnd: { type: 'number', default: 0.79, min: 0.4, max: 1.0, step: 0.01, label: 'OTE sonu', group: 'Giriş' },
  requireSweep: { type: 'boolean', default: false, label: 'Likidite süpürmesi şart', group: 'Giriş', description: 'Açıkken işlem sayısı düşer, kalite artar. İki hâli de ölçülmeli.' },
  sweepLookback: { type: 'number', default: 5, min: 0, max: 30, step: 1, label: 'Süpürme geçerlilik barı', group: 'Giriş' },
  allocationPct: { type: 'number', default: 20, min: 1, max: 100, step: 1, label: 'Pozisyon büyüklüğü (% nakit)', group: 'Giriş' },
  allowLong: { type: 'boolean', default: true, label: 'Long yönü açık', group: 'Giriş' },
  allowShort: { type: 'boolean', default: false, label: 'Short yönü açık', group: 'Giriş', description: 'ÖLÇÜLDÜ VE KALDI: 1d/8 varlıkta short-only beklenti 2/8 pozitif, long+short 1/8 varlıkta long-only\'yi geçti. Yalnızca perpetual piyasada işler.' },

  blockOnDisplacement: { type: 'boolean', default: true, label: 'Displacement barında girme', group: 'Hızlı Hareket Frenleri' },
  dispAtrMultiple: { type: 'number', default: 1.5, min: 0.5, max: 5, step: 0.1, label: 'Displacement eşiği (ATR)', group: 'Hızlı Hareket Frenleri' },
  rvolMax: { type: 'number', default: 3.0, min: 0, max: 20, step: 0.5, label: 'Maks RVOL', group: 'Hızlı Hareket Frenleri', description: '0 = kapalı. Saat etkisi nötrlenmiş (timeOfDay) hacim ölçüsü.' },
  atrMinPct: { type: 'number', default: 0.3, min: 0, max: 10, step: 0.1, label: 'Min ATR (%)', group: 'Hızlı Hareket Frenleri' },
  atrMaxPct: { type: 'number', default: 8.0, min: 1, max: 50, step: 0.5, label: 'Maks ATR (%)', group: 'Hızlı Hareket Frenleri' },

  stopBufferAtr: { type: 'number', default: 0.25, min: 0, max: 2, step: 0.05, label: 'Stop tamponu (ATR)', group: 'Çıkış' },
  tp1R: { type: 'number', default: 1.0, min: 0.3, max: 5, step: 0.1, label: 'TP1 hedefi (R)', group: 'Çıkış' },
  tp1Pct: { type: 'number', default: 0.30, min: 0, max: 0.8, step: 0.05, label: 'TP1 oranı', group: 'Çıkış' },
  tp2R: { type: 'number', default: 2.0, min: 0.5, max: 10, step: 0.1, label: 'TP2 hedefi (R)', group: 'Çıkış' },
  tp2Pct: { type: 'number', default: 0.30, min: 0, max: 0.8, step: 0.05, label: 'TP2 oranı', group: 'Çıkış' },
  trailAtrMult: { type: 'number', default: 2.5, min: 0.5, max: 10, step: 0.1, label: 'Koşucu trailing (ATR)', group: 'Çıkış' },
  breakevenAfterTp1: { type: 'boolean', default: true, label: 'TP1 sonrası breakeven', group: 'Çıkış' },
  minCostMultiple: { type: 'number', default: 4.0, min: 0, max: 20, step: 0.5, label: 'Maliyet kapısı (komisyon katı)', group: 'Çıkış' },
  feePct: { type: 'number', default: 0.15, min: 0, max: 1, step: 0.01, label: 'Tek yön komisyon (%)', group: 'Çıkış' },
  hardTakeProfitPct: { type: 'number', default: 50, min: 1, max: 300, step: 5, label: 'Yedek sabit TP (%)', group: 'Çıkış' }
};

StructureOteStrategy.optimizeGrid = {
  confirmBars: [1, 2, 3],
  swingAtrMultiple: [1.5, 2.0, 3.0],
  requireSweep: [false, true],
  tp1R: [1.0, 1.5],
  tp2R: [2.0, 3.0],
  trailAtrMult: [1.5, 2.5, 4.0],
  minCostMultiple: [2.0, 4.0]
};

module.exports = StructureOteStrategy;
