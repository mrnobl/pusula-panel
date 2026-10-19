const BaseStrategy = require('./baseStrategy');
const pool = require('../indicatorPool');

/**
 * Range İçi Ortalamaya Dönüş.
 *
 * Plan: `PLAN-RANGE-BOT.md`. Yapı `range_tool` göstergesinden gelir
 * (`PLAN-RANGE.md`), bu strateji yalnızca onu TİCARETE çevirir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SİLSİLE (kullanıcı tarifi, 2026-08-14)
 * ─────────────────────────────────────────────────────────────────────────
 *   1. KURULUM      Salınım dibi + tepesi oluştu, fiyat EQ'ya geldi → range
 *                   KİLİTLENDİ. Öncesinde işlem yok.
 *   2. SİLAHLANMA   Fiyat bir sapma bölgesine taştı ve orada EN AZ BİR MUM
 *                   KAPANDI, ardından range'e geri döndü.
 *   3. GİRİŞ        O sınıra LİMİT emir yazılır (short için `rangeHigh`).
 *                   Fiyat seviyeye gelirse dolar; gelmezse işlem olmaz.
 *   4. STOP         Sapma sınırı (short için `devHigh`).
 *   5. HEDEF        Karşı sınır (short için `rangeLow`), EQ'da kısmi kâr.
 *   6. TEKRAR       Stop olduktan sonra fiyat range'e girerse ve range hâlâ
 *                   aktifse yeniden silahlanılır. Range pasifleşene kadar
 *                   silsile devam eder.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN LİMİT — ÖLÇÜLMÜŞ SEBEP
 * ─────────────────────────────────────────────────────────────────────────
 * İlk sürüm dönüş barının KAPANIŞINDA piyasa emriyle giriyordu. Ölçüldü: o
 * kapanış sınırın ortalama 0.1R içinde oluyor ve mesafeler bozuluyordu —
 * stop 0.377R yerine 0.47R, hedef 1.0R yerine 0.90R, yani R/R 2.65 yerine 1.87.
 * Sonuç: 1h'te sinyallerin %57.3'ü stop'a değmeden EQ'ya ulaşmasına rağmen
 * beklenti komisyon kadar eksideydi (+0.029R kazanç, −0.032R maliyet).
 *
 * Sınırdan limit girişle aynı isabet oranında aritmetik şöyle olur:
 *   0.573 × 0.5R − 0.427 × 0.377R = +0.125R  (komisyon öncesi)
 * Ama limit, teyit beklemeden dolduğu için isabet oranı DEĞİŞİR — bu bir
 * varsayım değil, ölçülecek bir hipotezdir.
 *
 * R = rangeHigh − rangeLow. Limit girişte risk 0.377R, ödül 1.0R → R/R ≈ 2.65.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ÜÇ KURAL VE GEREKÇELERİ
 * ─────────────────────────────────────────────────────────────────────────
 * 1. YALNIZCA KİLİTLİ RANGE. `forming` durumundaki bir range'in ikinci
 *    seviyesi hâlâ büyüyor; EQ ve hedef işlem sürerken kayardı. Ölçülen
 *    sonucu yorumlamak imkânsız hâle gelirdi.
 *
 * 2. RANGE ÖLÜRSE POZİSYON KAPANIR. İşlemin dayanağı yapının kendisidir;
 *    yapı geçersizleşince pozisyonu tutmak bahis olur.
 *
 * 3. MALİYET KAPISI. Deponun bir numaralı katili maliyet: EQ'ya mesafe
 *    (0.5R) gidiş-dönüş komisyonun en az `minCostMultiple` katı olmalı.
 *    Dar range'lerde işlem açılmaz.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HAVUZ KULLANIMI
 * ─────────────────────────────────────────────────────────────────────────
 * `prepare()` ile `range_tool` TÜM seride bir kez hesaplanır. Bu ileriye bakma
 * DEĞİLDİR: `range_tool` lookahead testinden geçiyor (beş ayrı parametre
 * kombinasyonuyla), yani `i`. bardaki değeri seri `i`'de kesilse de aynıdır.
 */
class RangeMeanReversionStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('Range İçi Ortalamaya Dönüş', config);
    this.hazir = null;
    this.islem = null;
    // Silahlanma durumu: { rangeId, yon, tasti }. Fiyat sapma bölgesinde
    // kapandığında kurulur, range değişince/ölünce sıfırlanır.
    this.silah = null;
  }

  cfg() {
    const c = this.config || {};
    return {
      // ── Range yapısı (range_tool'a aynen geçer) ──
      thresholdMode: c.thresholdMode || 'auto',
      thresholdPct: c.thresholdPct !== undefined ? +c.thresholdPct : 2.0,
      thresholdAbs: c.thresholdAbs !== undefined ? +c.thresholdAbs : 0,
      autoLookback: +c.autoLookback || 100,
      autoMultiple: c.autoMultiple !== undefined ? +c.autoMultiple : 3.0,
      requireLaterConfirm: c.requireLaterConfirm === true,
      lockOn: c.lockOn || 'swing',
      violationOn: c.violationOn || 'close',
      returnInto: c.returnInto || 'range',
      deathGraceBars: +c.deathGraceBars || 5,
      eqLevel: c.eqLevel !== undefined ? +c.eqLevel : 0.5,
      devHigh: c.devHigh !== undefined ? +c.devHigh : 1.377,
      devLow: c.devLow !== undefined ? +c.devLow : 0.377,

      /**
       * YENİDEN ÇİZİM (bkz. `range_tool` sınıf notu) — varsayılan KAPALI.
       *
       * İkinci seviye tarafından ihlal öldürmez, askıya alır; range'e dönüşte
       * ikinci seviye yeni uca taşınır ve yapı yeniden kilitlenmeyi bekler.
       * Kapalı bırakılmasının sebebi tekrarlanabilirlik: 2026-08-14 ölçümleri
       * bu davranış olmadan çıktı ve karşılaştırma tabanı odur.
       */
      redraw: c.redraw === true,
      redrawWindowBars: +c.redrawWindowBars || 50,
      redrawMaxWidth: c.redrawMaxWidth !== undefined ? +c.redrawMaxWidth : 2.0,
      redrawMaxCount: c.redrawMaxCount !== undefined ? +c.redrawMaxCount : 2,

      /**
       * ÖLÜM DÖŞEĞİNDEN KALKAN RANGE YENİDEN ÖLÇEKLENSİN Mİ (varsayılan KAPALI)
       *
       * `deathGraceBars` içinde dönen yapı eski sınırlarıyla yaşamaya devam
       * ediyordu; açıkken ihlal edilen sınır taşmanın ucuna taşınır.
       * `redrawMaxWidth` / `redrawMaxCount` bütçesini `redraw` ile PAYLAŞIR.
       */
      rescaleOnRevive: c.rescaleOnRevive === true,
      rescaleSides: c.rescaleSides === 'second' ? 'second' : 'both',
      rescaleRelock: c.rescaleRelock !== false,

      // ── İşlem kuralları ──
      // Stop tamponu: sapma sınırının BİR MİKTAR ötesi. Kullanıcı "töleransımız
      // olabilir, sonuçlara göre bakarız" dedi; 0 ile başlanıyor.
      stopBufferPct: c.stopBufferPct !== undefined ? +c.stopBufferPct : 0,
      /**
       * Stop tamponu R CİNSİNDEN — sapma sınırının ne kadar DIŞINA taşınacağı.
       *
       * Fiyat yüzdesi ölçeğe bağlıdır (BTC'de %0.5 başka, ADA'da başka anlama
       * gelir); range genişliği R ise yapının kendi ölçüsüdür. `stopBufferR: 0.2`
       * demek "sapma sınırının 0.2 range genişliği kadar ötesi" demektir.
       *
       * Amaç: stop olduktan SONRA fiyatın range'e geri dönüşünü kaçırmamak.
       * Bedeli R/R'nin düşmesi — hangisinin ağır bastığı ÖLÇÜLECEK.
       */
      stopBufferR: c.stopBufferR !== undefined ? +c.stopBufferR : 0,
      eqPartialPct: c.eqPartialPct !== undefined ? +c.eqPartialPct : 0.50,
      breakevenAfterEq: c.breakevenAfterEq !== false,
      closeOnRangeDeath: c.closeOnRangeDeath !== false,

      // ── Maliyet ──
      feePct: c.feePct !== undefined ? +c.feePct : 0.06,
      minCostMultiple: c.minCostMultiple !== undefined ? +c.minCostMultiple : 4.0,

      /**
       * PREMISE — ölçüm için iki yön:
       *   'reversion' : sapmadan DÖNÜŞ ticareti (asıl tasarım)
       *   'breakout'  : sapmadan DEVAM ticareti (ters premise)
       *
       * Simetrik kurulmuştur ki fark premise'ten gelsin, kurulumdan değil:
       * ikisinde de risk 0.377R, ödül 1.0R → R/R 2.65.
       *
       * Kırılımda `closeOnRangeDeath` KAPALI olmalı — range'in ölmesi zaten
       * beklenen sonuçtur, pozisyonu o yüzden kapatmak fikri kendi ayağından
       * vurur.
       */
      mode: c.mode === 'breakout' ? 'breakout' : 'reversion',
      breakoutTargetR: c.breakoutTargetR !== undefined ? +c.breakoutTargetR : 1.0,

      allocationPct: +c.allocationPct || 20.0,
      marketType: c.marketType || 'perpetual',
      allowLong: c.allowLong !== false,
      allowShort: c.allowShort !== false
    };
  }

  /** Range yapısını tüm seride bir kez hesaplar (bkz. sınıf notu). */
  prepare(candles) {
    if (!Array.isArray(candles) || candles.length < 60) { this.hazir = null; return; }
    const p = this.cfg();

    try {
      const rt = pool.computeOne(candles, 'range_tool', {
        thresholdMode: p.thresholdMode,
        thresholdPct: p.thresholdPct,
        thresholdAbs: p.thresholdAbs,
        autoLookback: p.autoLookback,
        autoMultiple: p.autoMultiple,
        requireLaterConfirm: p.requireLaterConfirm,
        lockOn: p.lockOn,
        violationOn: p.violationOn,
        returnInto: p.returnInto,
        deathGraceBars: p.deathGraceBars,
        eqLevel: p.eqLevel,
        devHigh: p.devHigh,
        devLow: p.devLow,
        redraw: p.redraw,
        redrawWindowBars: p.redrawWindowBars,
        redrawMaxWidth: p.redrawMaxWidth,
        redrawMaxCount: p.redrawMaxCount,
        rescaleOnRevive: p.rescaleOnRevive,
        rescaleSides: p.rescaleSides,
        rescaleRelock: p.rescaleRelock,
        maxRanges: 100000
      });

      // Hangi barda hangi range aktif — pozisyonun bağlı olduğu yapıyı
      // izlemek için gerekli. Seriler yalnızca seviyeleri verir, KİMLİĞİ vermez;
      // kimlik olmadan "range değişti mi" sorusu yanıtlanamaz.
      const n = candles.length;
      const rangeIdAt = new Array(n).fill(null);
      for (const r of rt.ranges) {
        const bit = r.endIndex === null ? n - 1 : r.endIndex;
        for (let i = r.startIndex; i <= bit && i < n; i++) rangeIdAt[i] = r.id;
      }

      const zamanIndeks = new Map();
      candles.forEach((c, i) => zamanIndeks.set(c.time, i));

      this.hazir = { rt, rangeIdAt, zamanIndeks, n };
    } catch (err) {
      this.hazir = null;
    }
  }

  indeksBul(candles) {
    const son = candles[candles.length - 1];
    if (this.hazir && this.hazir.zamanIndeks.has(son.time)) return this.hazir.zamanIndeks.get(son.time);
    return null;
  }

  evaluate(ohlcv, ticker, positions) {
    const p = this.cfg();
    if (!Array.isArray(ohlcv) || ohlcv.length < 60) {
      return { action: 'HOLD', reason: 'Yetersiz mum verisi' };
    }

    if (!this.hazir || !this.hazir.zamanIndeks.has(ohlcv[ohlcv.length - 1].time)) {
      this.prepare(ohlcv);
    }
    if (!this.hazir) return { action: 'HOLD', reason: 'Range yapısı hazırlanamadı' };

    const i = this.indeksBul(ohlcv);
    if (i === null || i < 1) return { action: 'HOLD', reason: 'Bar indeksi çözülemedi' };

    const { rt, rangeIdAt } = this.hazir;
    const son = ohlcv[ohlcv.length - 1];
    const onceki = ohlcv[ohlcv.length - 2];
    const fiyat = (ticker && ticker.last) || son.close;

    const rl = rt.rangeLow[i];
    const rh = rt.rangeHigh[i];
    const eq = rt.eq[i];
    const dl = rt.devLow[i];
    const dh = rt.devHigh[i];
    const durum = rt.state[i];          // 0 yok · 1 forming · 2 locked · 3 violated
    const rangeId = rangeIdAt[i];

    const gostergeler = {
      rangeId: rangeId,
      durum: durum,
      rangeLow: Number.isFinite(rl) ? +rl.toFixed(6) : null,
      rangeHigh: Number.isFinite(rh) ? +rh.toFixed(6) : null,
      eq: Number.isFinite(eq) ? +eq.toFixed(6) : null,
      konum: Number.isFinite(rt.position[i]) ? +rt.position[i].toFixed(3) : null
    };

    const acik = (positions || []).filter(x => x && x.amount > 0);
    const komisyonGidisDonus = p.feePct * 2;

    // ── POZİSYON VARKEN ────────────────────────────────────────────────────
    if (acik.length) {
      const kisa = acik[0].side === 'short';
      const miktar = acik.reduce((a, x) => a + x.amount, 0);
      const giris = acik.reduce((a, x) => a + x.amount * x.entryPrice, 0) / miktar;

      if (!this.islem || this.islem.giris !== +giris.toFixed(8)) {
        this.islem = { giris: +giris.toFixed(8), rangeId, eqAlindi: false };
      }
      gostergeler.yon = kisa ? 'short' : 'long';

      // 1) Yapı öldü ya da değişti → çık.
      const yapiGitti = rangeId === null || (this.islem.rangeId !== null && rangeId !== this.islem.rangeId);
      if (p.closeOnRangeDeath && yapiGitti) {
        return {
          action: 'SELL', closeAll: true,
          reason: 'Range yapısı geçersizleşti — pozisyon kapatılıyor',
          indicators: gostergeler
        };
      }

      /**
       * 2) EQ kısmi kâr — bir kez.
       *
       * `eqPartialPct === 0` ise sinyal HİÇ üretilmez. Üretilseydi backtester
       * `partialPct: 0`'ı "kısmi değil" sayıp pozisyonun TAMAMINI kapatırdı —
       * yani "kısmi kâr kapalı" ayarı sessizce "EQ'da tam çıkış"a dönüşürdü.
       * Bu hata bir ölçüm turunu geçersiz kıldı (kırılım koşularının 366-447
       * işlemi hedefe değil EQ'ya gidip kapanmıştı).
       */
      if (p.eqPartialPct > 0 && !this.islem.eqAlindi && Number.isFinite(eq)) {
        const ulasti = kisa ? fiyat <= eq : fiyat >= eq;
        if (ulasti) {
          this.islem.eqAlindi = true;
          const karPct = kisa ? ((giris - fiyat) / giris) * 100 : ((fiyat - giris) / giris) * 100;
          return {
            action: 'SELL',
            partialPct: Math.min(0.95, p.eqPartialPct),
            // Stop girişe taşınır: kullanıcı "kademelerden sonra stopu girişe
            // yaklaştıralım" dedi. Tek kademe ile başlanıyor.
            updateStop: p.breakevenAfterEq ? giris : undefined,
            reason: `EQ kâr alma (%${karPct.toFixed(2)}) — %${(p.eqPartialPct * 100).toFixed(0)} alındı`
              + (p.breakevenAfterEq ? ', stop breakeven' : ''),
            indicators: gostergeler
          };
        }
      }

      return {
        action: 'HOLD',
        reason: `Pozisyon taşınıyor (${kisa ? 'short' : 'long'}, hedef `
          + `$${(kisa ? rl : rh) ? (kisa ? rl : rh).toFixed(4) : '—'})`,
        indicators: gostergeler
      };
    }

    this.islem = null;

    // ── SİLAHLANMA VE LİMİT EMİR ───────────────────────────────────────────
    if (rangeId === null || !Number.isFinite(rl) || !Number.isFinite(rh) || !(rh > rl)) {
      this.silah = null;
      return { action: 'HOLD', reason: 'Aktif range yok', indicators: gostergeler };
    }

    /**
     * DÖNÜŞ modunda yalnızca KİLİTLİ (2) range kabul edilir; `violated` (3)
     * edilmez, çünkü yapı ölüm sürecine girmişken dönüş beklemek dayanağı
     * çökmekte olan bir seviyeye güvenmektir.
     *
     * KIRILIM modunda `violated` DA kabul edilir — hatta beklenen durum odur:
     * sapma sınırı kırıldığı BARDA range zaten `violated`a geçer. İlk sürümde
     * bu şart kırılım sinyalinin tamamını eliyordu (0 işlem üretiyordu).
     */
    const durumUygun = p.mode === 'breakout' ? (durum === 2 || durum === 3) : (durum === 2);
    if (!durumUygun) {
      this.silah = null;
      return {
        action: 'HOLD',
        reason: durum === 1 ? 'Range henüz kilitlenmedi' : (durum === 3 ? 'Range ihlal edildi (ölüm süresi işliyor)' : 'Range kilitli değil'),
        indicators: gostergeler
      };
    }

    // Range değiştiyse silah sıfırlanır — eski yapının silahı yeni yapıda
    // ateşlenemez.
    if (!this.silah || this.silah.rangeId !== rangeId) this.silah = null;

    const R0 = rh - rl;

    /**
     * ── TERS PREMISE: KIRILIM ──
     * Fiyat sapma sınırını KAPANIŞLA aşarsa o yönde devam edeceği varsayılır.
     * Giriş kırılım barının kapanışında (piyasa), stop range sınırına geri,
     * hedef `breakoutTargetR` kadar ileri.
     */
    if (p.mode === 'breakout') {
      const yukariKirilim = son.close > dh;
      const asagiKirilim = son.close < dl;
      if (!yukariKirilim && !asagiKirilim) {
        return { action: 'HOLD', reason: 'Sapma sınırı kırılmadı', indicators: gostergeler };
      }

      const kisaK = asagiKirilim;
      if (kisaK && !p.allowShort) return { action: 'HOLD', reason: 'Short yönü kapalı', indicators: gostergeler };
      if (!kisaK && !p.allowLong) return { action: 'HOLD', reason: 'Long yönü kapalı', indicators: gostergeler };
      if (kisaK && p.marketType !== 'perpetual') {
        return { action: 'HOLD', reason: 'Short yalnızca vadeli piyasada', indicators: gostergeler };
      }

      // Stop: range sınırına geri (dönüş kurulumunun aynadaki karşılığı)
      const stopK = kisaK ? rl : rh;
      const hedefK = kisaK ? (fiyat - p.breakoutTargetR * R0) : (fiyat + p.breakoutTargetR * R0);
      if (!Number.isFinite(stopK) || (kisaK ? stopK <= fiyat : stopK >= fiyat)) {
        return { action: 'HOLD', reason: 'Kırılım stop seviyesi geçersiz', indicators: gostergeler };
      }

      const stopPctK = (Math.abs(fiyat - stopK) / fiyat) * 100;
      const hedefPctK = (Math.abs(hedefK - fiyat) / fiyat) * 100;
      const eqMesafeK = (Math.abs(eq - fiyat) / fiyat) * 100;
      if (eqMesafeK < komisyonGidisDonus * p.minCostMultiple) {
        return { action: 'HOLD', reason: 'Maliyet kapısı (kırılım)', indicators: gostergeler };
      }

      gostergeler.yon = kisaK ? 'short' : 'long';
      gostergeler.R = +R0.toFixed(6);

      return {
        action: kisaK ? 'SHORT' : 'BUY',
        allocationPct: p.allocationPct,
        stopLossPct: +stopPctK.toFixed(4),
        takeProfitPct: +hedefPctK.toFixed(4),
        slLevel: +stopK.toFixed(6),
        reason: `KIRILIM ${kisaK ? 'SHORT' : 'LONG'} — sapma sınırı aşıldı, `
          + `stop $${stopK.toFixed(4)} (%${stopPctK.toFixed(2)}), hedef $${hedefK.toFixed(4)} (%${hedefPctK.toFixed(2)})`,
        indicators: gostergeler
      };
    }

    /**
     * SİLAHLANMA. İki aşama:
     *   a) fiyat sapma bölgesinde KAPANIR   → `tasti` işaretlenir
     *   b) sonra range'e geri döner (kapanış içeride) → limit emir masaya konur
     * Kullanıcı tarifi: "deviasyon bölgesine sarktı, orada 1 mum kapandı,
     * sonra range içerisine girdi."
     */
    const kapanisIcerde = son.close >= rl && son.close <= rh;
    const ustSapmada = son.close > rh;
    const altSapmada = son.close < rl;

    if (ustSapmada || altSapmada) {
      this.silah = { rangeId, yon: ustSapmada ? 'short' : 'long', tasti: true, hazir: false };
      return {
        action: 'HOLD',
        reason: `Sapma bölgesinde kapanış (${ustSapmada ? 'üst' : 'alt'}) — dönüş bekleniyor`,
        indicators: gostergeler
      };
    }

    if (!this.silah || !this.silah.tasti) {
      return { action: 'HOLD', reason: 'Sapma bölgesinde kapanış yok — silahlanmadı', indicators: gostergeler };
    }
    if (!kapanisIcerde) {
      return { action: 'HOLD', reason: 'Kapanış range dışında', indicators: gostergeler };
    }

    // Buraya gelindiyse: sapmada kapanış olmuş VE fiyat range'e dönmüş.
    const kisa = this.silah.yon === 'short';
    if (kisa && !p.allowShort) return { action: 'HOLD', reason: 'Short yönü kapalı', indicators: gostergeler };
    if (!kisa && !p.allowLong) return { action: 'HOLD', reason: 'Long yönü kapalı', indicators: gostergeler };
    if (kisa && p.marketType !== 'perpetual') {
      return { action: 'HOLD', reason: 'Short yalnızca vadeli piyasada', indicators: gostergeler };
    }

    const R = rh - rl;

    // LİMİT SEVİYESİ: girilecek sınırın kendisi.
    const limitSeviye = kisa ? rh : rl;

    // Stop: sapma sınırının ötesi (+ tampon). İki tampon toplanır: fiyat
    // yüzdesi ve R cinsinden pay.
    const tampon = limitSeviye * (p.stopBufferPct / 100) + R * p.stopBufferR;
    const stopSeviye = kisa ? (dh + tampon) : (dl - tampon);
    const hedef = kisa ? rl : rh;

    if (!Number.isFinite(stopSeviye) || !Number.isFinite(hedef)) {
      return { action: 'HOLD', reason: 'Seviyeler geçersiz', indicators: gostergeler };
    }

    // Mesafeler LİMİT FİYATINA göre hesaplanır — güncel fiyata göre değil.
    // Emir o seviyeden dolacağı için stop/hedef yüzdeleri de oradan ölçülmeli;
    // güncel fiyattan ölçmek, emir dolduğunda yanlış stop yüzdesi yazardı.
    const stopMesafePct = (Math.abs(limitSeviye - stopSeviye) / limitSeviye) * 100;
    const hedefMesafePct = (Math.abs(hedef - limitSeviye) / limitSeviye) * 100;

    // Maliyet kapısı: EQ'ya mesafe komisyonun N katı olmalı.
    const eqMesafePct = (Math.abs(eq - limitSeviye) / limitSeviye) * 100;
    if (eqMesafePct < komisyonGidisDonus * p.minCostMultiple) {
      return {
        action: 'HOLD',
        reason: `EQ mesafesi maliyeti karşılamıyor (%${eqMesafePct.toFixed(3)} < %${(komisyonGidisDonus * p.minCostMultiple).toFixed(3)})`,
        indicators: gostergeler
      };
    }

    gostergeler.R = +R.toFixed(6);
    gostergeler.yon = kisa ? 'short' : 'long';
    gostergeler.limit = +limitSeviye.toFixed(6);

    /**
     * LİMİT emir HER BARDA yeniden bildirilir.
     *
     * Backtester bekleyen emri her bar sıfırlayıp bildirimle yeniden kurar;
     * yani koşul bozulduğu anda (range öldü, kilit gitti, fiyat sapmaya taştı)
     * emir kendiliğinden iptal olur. Ayrı bir iptal sinyaline gerek yok ve
     * "koşulu bozulan emir masada kaldı" hatası imkânsız hâle gelir.
     */
    return {
      action: 'LIMIT',
      side: kisa ? 'short' : 'long',
      limitPrice: +limitSeviye.toFixed(6),
      allocationPct: p.allocationPct,
      stopLossPct: +stopMesafePct.toFixed(4),
      takeProfitPct: +hedefMesafePct.toFixed(4),
      slLevel: +stopSeviye.toFixed(6),
      reason: `${kisa ? 'SHORT' : 'LONG'} limit @${limitSeviye.toFixed(4)} — `
        + `stop $${stopSeviye.toFixed(4)} (%${stopMesafePct.toFixed(2)}), hedef $${hedef.toFixed(4)} (%${hedefMesafePct.toFixed(2)})`,
      indicators: gostergeler
    };
  }
}

/** Isınma: `range_tool`'un otomatik eşiği `autoLookback` bar ister. */
RangeMeanReversionStrategy.warmupBars = (cfg = {}) => (+cfg.autoLookback || 100) + 60;

RangeMeanReversionStrategy.configWarnings = (cfg = {}) => {
  const u = [];
  if ((cfg.minCostMultiple !== undefined ? +cfg.minCostMultiple : 4) < 2) {
    u.push('Maliyet kapısı 2\'nin altında: komisyonun altındaki hedefler işleme dönüşür.');
  }
  if (cfg.allowShort !== false && (cfg.marketType || 'perpetual') !== 'perpetual') {
    u.push('Short açık ama piyasa vadeli değil: short sinyali üretilmez.');
  }
  if ((cfg.eqPartialPct !== undefined ? +cfg.eqPartialPct : 0.5) >= 1) {
    u.push('EQ kısmi oranı 1: pozisyonun tamamı EQ\'da kapanır, hedefe kalan olmaz.');
  }
  return u;
};

RangeMeanReversionStrategy.paramSchema = {
  thresholdMode: { type: 'enum', values: ['auto', 'percent', 'absolute'], default: 'auto', label: 'Eşik modu', group: 'Range' },
  thresholdPct: { type: 'number', default: 2.0, min: 0.05, step: 0.1, label: 'Eşik %', group: 'Range' },
  autoLookback: { type: 'number', default: 100, min: 10, step: 10, label: 'Oto eşik: geri bakış', group: 'Range' },
  autoMultiple: { type: 'number', default: 3.0, min: 0.5, step: 0.1, label: 'Oto eşik: çarpan', group: 'Range' },
  lockOn: { type: 'enum', values: ['swing', 'close', 'touch'], default: 'swing', label: 'Kilitlenme', group: 'Range' },
  deathGraceBars: { type: 'number', default: 5, min: 1, step: 1, label: 'Ölüm töleransı (bar)', group: 'Range' },
  redraw: { type: 'boolean', default: false, label: 'Yeniden çizim', group: 'Range', description: 'İkinci seviye tarafından ihlal öldürmesin, askıya alsın: range\'e dönülürse ikinci seviye yeni uca taşınır ve yapı yeniden kilitlenmeyi bekler.' },
  redrawWindowBars: { type: 'number', default: 50, min: 1, step: 5, label: 'Yeniden çizim penceresi (bar)', group: 'Range', description: 'İhlalden sonra range\'e dönüş için tanınan süre. Dolarsa yapı ölür.' },
  redrawMaxWidth: { type: 'number', default: 2.0, min: 1, max: 5, step: 0.1, label: 'Genişlik tavanı (×ilk kilit)', group: 'Range', description: 'Yeni genişlik / İLK kilit genişliği. Aşılırsa yapı ölür — genişleyen range öldürülemez patolojisine karşı.' },
  redrawMaxCount: { type: 'number', default: 2, min: 0, max: 10, step: 1, label: 'Yeniden çizim hakkı', group: 'Range', description: 'Askı yolu ve tölerans yolu bu bütçeyi PAYLAŞIR.' },
  rescaleOnRevive: { type: 'boolean', default: false, label: 'Kurtulan range yeniden ölçeklensin', group: 'Range', description: 'Ölüm töleransı içinde range\'e dönen yapının ihlal edilen sınırı, taşmanın ulaştığı uca taşınır ve range yeniden ölçeklenir.' },
  rescaleSides: { type: 'enum', values: ['second', 'both'], default: 'both', label: 'Hangi sınır taşınabilir', group: 'Range', description: 'second = yalnızca ikinci seviye · both = çapa tarafı da.' },
  rescaleRelock: { type: 'boolean', default: true, label: 'Ölçekleme sonrası yeniden kilitlensin', group: 'Range', description: 'Açıkken yapı forming\'e döner ve kilitlenmeden işlem açılmaz — yeni taşınmış sınır henüz tahmindir.' },
  eqLevel: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'EQ katsayısı', group: 'Range' },
  devHigh: { type: 'number', default: 1.377, min: 1, step: 0.001, label: 'devHigh katsayısı', group: 'Range' },
  devLow: { type: 'number', default: 0.377, min: 0, step: 0.001, label: 'devLow katsayısı', group: 'Range' },

  stopBufferPct: { type: 'number', default: 0, min: 0, max: 5, step: 0.05, label: 'Stop tamponu (%)', group: 'İşlem', description: 'Sapma sınırının ötesine eklenen pay (fiyat yüzdesi). 0 = tam sınırda.' },
  stopBufferR: { type: 'number', default: 0, min: 0, max: 2, step: 0.05, label: 'Stop tamponu (R)', group: 'İşlem', description: 'Sapma sınırının ötesine eklenen pay, range genişliği cinsinden. Ölçeğe bağlı olmadığı için varlıklar arası karşılaştırılabilir.' },
  eqPartialPct: { type: 'number', default: 0.5, min: 0, max: 0.95, step: 0.05, label: 'EQ kısmi oranı', group: 'İşlem' },
  breakevenAfterEq: { type: 'boolean', default: true, label: 'EQ sonrası breakeven', group: 'İşlem' },
  closeOnRangeDeath: { type: 'boolean', default: true, label: 'Range ölünce kapat', group: 'İşlem' },
  allocationPct: { type: 'number', default: 20, min: 1, max: 100, step: 1, label: 'Pozisyon büyüklüğü (% nakit)', group: 'İşlem' },
  allowLong: { type: 'boolean', default: true, label: 'Long açık', group: 'İşlem' },
  allowShort: { type: 'boolean', default: true, label: 'Short açık', group: 'İşlem' },

  feePct: { type: 'number', default: 0.06, min: 0, max: 1, step: 0.01, label: 'Tek yön komisyon (%)', group: 'Maliyet' },
  minCostMultiple: { type: 'number', default: 4.0, min: 0, max: 20, step: 0.5, label: 'Maliyet kapısı (komisyon katı)', group: 'Maliyet' }
};

/** Kill kriterinden GEÇTİKTEN sonra kullanılacak; önce sabit varsayılan sınanır. */
RangeMeanReversionStrategy.optimizeGrid = {
  stopBufferPct: [0, 0.1, 0.25],
  eqPartialPct: [0.3, 0.5, 0.7],
  breakevenAfterEq: [true, false],
  lockOn: ['swing', 'close'],
  autoMultiple: [2.0, 3.0, 4.0]
};

module.exports = RangeMeanReversionStrategy;
