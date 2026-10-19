const BaseStrategy = require('./baseStrategy');
const motor = require('../rangeEngine/vpfrRange');

/**
 * VPFR RANGE — üç teyitli range botu (v1, tek giriş).
 *
 * Tarif ve tüm kararlar: `PLAN-RANGE-VPFR.md`.
 * Pine ikizi: `pine/vpfr-range-strateji.pine` — kural değişirse İKİSİ
 * BİRDEN değişmeli.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ BU STRATEJİ HENÜZ KILL KRİTERİNİ KESİN GEÇMEDİ (§11.4)
 * ─────────────────────────────────────────────────────────────────────────
 * Önceden yazılı kriter (koşulsuz drift düzeltmesi) geçildi: 5/6 kat,
 * +%2.06 ± 0.62, n=298. Ama sonradan eklenen SAĞLAMLIK kontrolü — koşullu
 * drift, yani aynı HTF yön durumundaki ortalama sürüklenme — 4/6'da kaldı.
 *
 * Sebebi biliniyor: iniş `yonPolitikasi:'hepHtf'`i seçti, yani işlemlerin
 * hepsi trend yönünde. O kol için koşulsuz sürüklenme doğru boş hipotez
 * değil. Bu depo aynı hatayı bir kez yaptı (`PLAN-RANGE-KURALLARI.md` §2.10).
 *
 * Ayrıca: ölçüm SPOT veride yapıldı, bot vadeli için tasarlandı ([ÇELİŞKİ-5]);
 * ve işlemler ortalama 131 bar sürüp örtüştüğü için ±0.62 bir ALT SINIRDIR.
 *
 * PANELDE GÖRÜNÜR OLMASI ONAY DEĞİLDİR — gözle bakılabilsin diye kayıtlı.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MİMARİ — motor ayrı modül (§3.1)
 * ─────────────────────────────────────────────────────────────────────────
 * Yapı mantığı `lib/rangeEngine/vpfrRange.js`'te ve İŞLEM BİLMEZ. Burası
 * yalnızca kurulum olaylarını emre çevirir. v2'nin grid stratejisi aynı
 * motoru kullanacak; sızma olursa iki strateji aynı yapıları göremez.
 */
class VpfrRangeStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('VPFR Range', config);
    this.hazir = null;
    this.islem = null;
  }

  cfg() {
    const c = this.config || {};
    const say = (v, d) => (v === undefined || v === null || !Number.isFinite(+v) ? d : +v);
    return {
      // ── Motor (yapı) ──
      htfCarpan: say(c.htfCarpan, 6),
      // 10 = kullanıcının 2026-08-31'de grafikte gözle seçtiği değer (§11.8).
      // Motor varsayılanıyla aynı kalmalı; ikisi ayrışırsa panelden koşulan
      // strateji ile betiklerden koşulan ölçüm farklı yapı üretir.
      fraktalLen: say(c.fraktalLen, 10),
      /**
       * ÇAPA (anchor) KURALI — kullanıcı, 2026-08-31 (§11.11 + düzeltmesi).
       * 'yapi' iki şart birden arar: çapa HH/LL OLMALI **ve** bacağın ucu
       * HH/LL OLMAMALI. Yani range yalnızca DÜZELTME bacağına kurulur.
       * Panelde görünmediği için motor varsayılanına düşüyordu; eklendi.
       */
      capaYonu: ['yok', 'yapi', 'htf'].includes(c.capaYonu) ? c.capaYonu : 'yapi',
      maxAday: say(c.maxAday, 20),
      bacakEnAzAtr: say(c.bacakEnAzAtr, 2.5),
      pocEqTolerans: say(c.pocEqTolerans, 1 / 3),
      vpfrBins: say(c.vpfrBins, 50),
      avwapTolerans: say(c.avwapTolerans, 0.15),
      avwapTeyitBar: say(c.avwapTeyitBar, 10),
      avwapTeyitOran: say(c.avwapTeyitOran, 0.70),
      devKat: say(c.devKat, 0.377),
      sapmaSarti: ['banda', 'kapanis', 'fitil'].includes(c.sapmaSarti) ? c.sapmaSarti : 'kapanis',
      sapmaDonusBar: say(c.sapmaDonusBar, 5),
      genislemeDonusBar: say(c.genislemeDonusBar, 50),
      genislemeTavani: say(c.genislemeTavani, 2.0),
      genislemeMaxSayi: say(c.genislemeMaxSayi, 1),
      girisSinirYakinlik: say(c.girisSinirYakinlik, 0.25),
      retestPencereBar: say(c.retestPencereBar, 20),

      // ── İşlem (§6, koordinat inişi sonuçları) ──
      // VARSAYILAN 'serbest' (kullanıcı, 2026-08-31). `capaYonu:'yapi'` ile
      // BİRLİKTE ÇALIŞMIYOR: çapa yükselişte HH'ye konduğundan range aşağı
      // açılıyor ve ağırlıkla SHORT kurulum üretiyor (39/24); 'hepHtf' ise
      // HTF boğayken short'u kesiyor. Ölçüldü: 63 kurulumun 45'i bu kapıda
      // ölüyordu, 34'ü HTF-boğa+short. Pine ikizi de 'serbest'.
      yonPolitikasi: ['ilkHtf', 'hepHtf', 'serbest'].includes(c.yonPolitikasi) ? c.yonPolitikasi : 'serbest',
      girisAni: c.girisAni === 'donus' ? 'donus' : 'retest',
      // VARSAYILAN 'sinirdanGir' (2026-08-31): FVG öncülü kaldırılınca giriş
      // tarafındaki bölge şartı da düştü. Pine ikizinde bu girdi tamamen
      // silindi; burada ölçüm boyutu olarak duruyor ama varsayılanı eşit.
      bolgeYoksa: c.bolgeYoksa === 'bolgeZorunlu' ? 'bolgeZorunlu' : 'sinirdanGir',
      slTamponR: say(c.slTamponR, 0),
      tpTamponR: say(c.tpTamponR, 0),
      eqPartialPct: say(c.eqPartialPct, 0.5),
      breakevenAfterEq: c.breakevenAfterEq !== false,

      /**
       * §6.9 KARARI: range ölünce açık pozisyon SL'ye BIRAKILIR.
       * `mtf_choch_range`'in varsayılanının TERSİ ve bilinçli — orada
       * `closeOnRangeDeath: true`. Buradaki karar kullanıcınındır (2026-08-30)
       * ve §6.6 ile tutarlıdır: yapının muhasebesi değişti diye açık işlemin
       * şartları değişmez.
       */
      closeOnRangeDeath: c.closeOnRangeDeath === true,

      allocationPct: say(c.allocationPct, 20),
      allowLong: c.allowLong !== false,
      allowShort: c.allowShort !== false,
      feePct: say(c.feePct, 0.06)
    };
  }

  prepare(candles) {
    const p = this.cfg();
    if (!Array.isArray(candles) || candles.length < 150) { this.hazir = null; return; }
    try {
      const r = motor.calistir(candles, p);
      if (r.meta.yetersizVeri) { this.hazir = null; return; }
      const zamanIndeks = new Map();
      for (let i = 0; i < candles.length; i++) zamanIndeks.set(candles[i].time, i);
      const kurulumBarda = new Map();
      for (const s of r.kurulumlar) kurulumBarda.set(s.bar, s);
      this.hazir = { ...r, zamanIndeks, kurulumBarda };
    } catch (err) {
      this.hazir = null;
    }
  }

  /** Kurulum, seçili yön/bölge politikasından geçiyor mu (§6.1). */
  static gecerMi(s, p) {
    if (p.yonPolitikasi === 'hepHtf' && s.htfYonundeMi === false) return false;
    if (p.yonPolitikasi === 'ilkHtf' && s.kacinciSapma === 1 && s.htfYonundeMi === false) return false;
    if (p.bolgeYoksa === 'bolgeZorunlu' && !s.bolgeVar) return false;
    return true;
  }

  evaluate(ohlcv, ticker, positions) {
    const p = this.cfg();
    if (!Array.isArray(ohlcv) || ohlcv.length < 150) {
      return { action: 'HOLD', reason: 'Yetersiz mum verisi' };
    }
    const sonZaman = ohlcv[ohlcv.length - 1].time;
    if (!this.hazir || !this.hazir.zamanIndeks.has(sonZaman)) this.prepare(ohlcv);
    if (!this.hazir) return { action: 'HOLD', reason: 'Yapı hazırlanamadı' };

    const i = this.hazir.zamanIndeks.get(sonZaman);
    if (i === undefined || i < 1) return { action: 'HOLD', reason: 'Bar indeksi çözülemedi' };

    const H = this.hazir;
    const son = ohlcv[ohlcv.length - 1];
    const fiyat = (ticker && ticker.last) || son.close;

    const rl = H.seri.rangeLow[i];
    const rh = H.seri.rangeHigh[i];
    const eq = H.seri.eq[i];
    const durum = H.seri.durumAt[i];
    const rangeId = H.seri.rangeIdAt[i];

    const gostergeler = {
      rangeId,
      durum,                                  // aday · nitelikli · kilitli · silahli · genisleme
      rangeLow: Number.isFinite(rl) ? +rl.toFixed(6) : null,
      rangeHigh: Number.isFinite(rh) ? +rh.toFixed(6) : null,
      eq: Number.isFinite(eq) ? +eq.toFixed(6) : null,
      devHigh: Number.isFinite(H.seri.devHigh[i]) ? +H.seri.devHigh[i].toFixed(6) : null,
      devLow: Number.isFinite(H.seri.devLow[i]) ? +H.seri.devLow[i].toFixed(6) : null,
      htfYon: H.seri.htfYonAt[i]
    };

    const acik = (positions || []).filter(x => x && x.amount > 0);

    /* ── POZİSYON VARKEN ── */
    if (acik.length) {
      const kisa = acik[0].side === 'short';
      const miktar = acik.reduce((a, x) => a + x.amount, 0);
      const giris = acik.reduce((a, x) => a + x.amount * x.entryPrice, 0) / miktar;
      if (!this.islem || this.islem.giris !== +giris.toFixed(8)) {
        this.islem = { giris: +giris.toFixed(8), rangeId, eqAlindi: false };
      }
      gostergeler.yon = kisa ? 'short' : 'long';

      // §6.9 — varsayılan KAPALI: range ölse de pozisyon kendi SL/TP'siyle yaşar.
      if (p.closeOnRangeDeath && (rangeId === null || rangeId !== this.islem.rangeId)) {
        return { action: 'SELL', closeAll: true, reason: 'Range öldü — kapatılıyor (§6.9 varsayılanının DIŞINDA)', indicators: gostergeler };
      }

      // §6.4 / §6.5 — EQ kısmi kârı + breakeven. İniş 0.5'te bıraktı (md.3).
      if (p.eqPartialPct > 0 && !this.islem.eqAlindi && Number.isFinite(eq)) {
        const ulasti = kisa ? fiyat <= eq : fiyat >= eq;
        if (ulasti) {
          this.islem.eqAlindi = true;
          return {
            action: 'SELL',
            partialPct: Math.min(0.95, p.eqPartialPct),
            updateStop: p.breakevenAfterEq ? giris : undefined,
            reason: `EQ kısmi kâr %${(p.eqPartialPct * 100).toFixed(0)}`
              + (p.breakevenAfterEq ? ' + breakeven' : ''),
            indicators: gostergeler
          };
        }
      }
      return { action: 'HOLD', reason: `Pozisyon taşınıyor (${kisa ? 'short' : 'long'})`, indicators: gostergeler };
    }

    this.islem = null;

    /* ── KURULUM VAR MI ── */
    const s = H.kurulumBarda.get(i);
    if (!s) {
      const aciklama = durum === motor.DURUM.ADAY ? 'Aday range — VPFR POC ≈ EQ bekleniyor'
        : durum === motor.DURUM.NITELIKLI ? 'Nitelikli — AVWAP teyidi bekleniyor'
          : durum === motor.DURUM.KILITLI ? 'Range KİLİTLİ — sapma olayı bekleniyor'
            : durum === motor.DURUM.SILAHLI ? 'Range silahlı — yeni sapma bekleniyor'
              : durum === motor.DURUM.GENISLEME ? 'Genişleme — range içine dönüş bekleniyor'
                : 'Aktif yapı yok';
      return { action: 'HOLD', reason: aciklama, indicators: gostergeler };
    }

    if (!VpfrRangeStrategy.gecerMi(s, p)) {
      return {
        action: 'HOLD',
        reason: `Kurulum süzgeçten geçmedi (${p.yonPolitikasi}${!s.bolgeVar ? ' · bölge yok' : ''})`,
        indicators: gostergeler
      };
    }

    const uzun = s.islemYonu === 'long';
    if (uzun && !p.allowLong) return { action: 'HOLD', reason: 'Long kapalı', indicators: gostergeler };
    if (!uzun && !p.allowShort) return { action: 'HOLD', reason: 'Short kapalı', indicators: gostergeler };

    // §6.2 / §6.3 — seviyeler kurulum kaydından okunur (motorla ayrışmasın).
    const sl = uzun ? s.devLow - p.slTamponR * s.R : s.devHigh + p.slTamponR * s.R;
    const tp = uzun ? s.H - p.tpTamponR * s.R : s.L + p.tpTamponR * s.R;

    gostergeler.R = +s.R.toFixed(6);
    gostergeler.yon = s.islemYonu;
    gostergeler.sinir = +s.sinir.toFixed(6);
    gostergeler.bolgeler = s.bolgeTipleri;

    /* ── GİRİŞ (§6.1) ── */
    if (p.girisAni === 'retest') {
      // Retest kolu = sınıra pasif LİMİT emir. Ölçümdeki doldurma modeliyle
      // birebir aynı: fiyat sınıra dönmezse işlem olmaz.
      const limit = s.sinir;
      if ((uzun && limit >= fiyat) || (!uzun && limit <= fiyat)) {
        return { action: 'HOLD', reason: 'Retest limiti fiyatın yanlış tarafında', indicators: gostergeler };
      }
      if (!Number.isFinite(sl) || (uzun ? sl >= limit : sl <= limit)) {
        return { action: 'HOLD', reason: 'Stop seviyesi geçersiz', indicators: gostergeler };
      }
      const stopPct = (Math.abs(limit - sl) / limit) * 100;
      const tpPct = (Math.abs(tp - limit) / limit) * 100;
      return {
        action: 'LIMIT',
        side: uzun ? 'long' : 'short',
        limitPrice: +limit.toFixed(6),
        allocationPct: p.allocationPct,
        stopLossPct: +stopPct.toFixed(4),
        takeProfitPct: +tpPct.toFixed(4),
        slLevel: +sl.toFixed(6),
        reason: `SAPMA ${uzun ? 'LONG' : 'SHORT'} retest limiti @${limit.toFixed(4)} — `
          + `stop $${sl.toFixed(4)}, hedef $${tp.toFixed(4)}, R/R ${(tpPct / stopPct).toFixed(2)}`,
        indicators: gostergeler
      };
    }

    // Dönüş kolu — sapma barının kapanışında piyasa emri.
    const giris = son.close;
    if (!Number.isFinite(sl) || (uzun ? sl >= giris : sl <= giris)) {
      return { action: 'HOLD', reason: 'Stop seviyesi geçersiz', indicators: gostergeler };
    }
    const stopPct = (Math.abs(giris - sl) / giris) * 100;
    const tpPct = (Math.abs(tp - giris) / giris) * 100;
    return {
      action: uzun ? 'BUY' : 'SHORT',
      allocationPct: p.allocationPct,
      stopLossPct: +stopPct.toFixed(4),
      takeProfitPct: +tpPct.toFixed(4),
      slLevel: +sl.toFixed(6),
      reason: `SAPMA ${uzun ? 'LONG' : 'SHORT'} dönüş — sınır $${s.sinir.toFixed(4)}, `
        + `giriş $${giris.toFixed(4)}, stop $${sl.toFixed(4)}, hedef $${tp.toFixed(4)}, `
        + `R/R ${(tpPct / stopPct).toFixed(2)}`,
      indicators: gostergeler
    };
  }
}

VpfrRangeStrategy.warmupBars = (cfg = {}) => {
  const carpan = +cfg.htfCarpan || 6;
  // HTF yapı durumu için en az ~40 HTF mumu; artı LTF swing ısınması.
  return carpan * 40 + 120;
};

VpfrRangeStrategy.configWarnings = (cfg = {}) => {
  const u = [];
  const c = +cfg.htfCarpan || 6;
  if (c < 2) u.push('HTF çarpanı 2\'den küçük: yapı ile onay dilimi aynı olur, MTF anlamını yitirir.');
  if (c > 24) u.push('HTF çarpanı 24\'ten büyük: bir HTF mumu için çok fazla LTF barı gerekir, örneklem çöker.');
  if ((cfg.sapmaSarti || 'kapanis') === 'banda') {
    u.push('sapmaSarti "banda": ölçümde kilitli range\'lerin yalnızca %15\'i tetik üretti (§11.2). Örneklem beklenti ölçümüne yetmeyebilir.');
  }
  if ((cfg.sapmaSarti || 'kapanis') === 'fitil') {
    u.push('sapmaSarti "fitil": en bol örneklem ama en zayıf olay — kurulum sayısının artması iyi olduğunu göstermez (§11.2).');
  }
  if ((cfg.devKat !== undefined ? +cfg.devKat : 0.377) < 0.3) {
    u.push('devKat 0.3 altında: §11.2\'de 0.25 ölçüldü ve yapıyı bozdu (ömür 84→77, çapa kırılması %42→%45). Sapma bandı aynı zamanda ÖLÜM eşiğidir.');
  }
  if (cfg.closeOnRangeDeath === true) {
    u.push('Range geçersiz olunca kapatma AÇIK: §6.9 kararı bunun tersi — pozisyon SL\'ye bırakılır.');
  }
  if ((cfg.capaYonu || 'yapi') === 'yok') {
    u.push('capaYonu "yok": anchor kuralı KAPALI. Bu davranışta range impulse bacağının üstüne kuruluyordu — ölçümde en geniş range %51\'e çıktı ve 857 bar yaşayarak yeni aday aranmasını engelledi (§11.11).');
  }
  if ((cfg.yonPolitikasi || 'serbest') === 'hepHtf') {
    u.push('yonPolitikasi "hepHtf": anchor kuralı "yapi" ile ÇELİŞİR. Range yükselişte HH\'ye çapalanıp aşağı açıldığı için ağırlıkla SHORT setup üretir (39/24); hepHtf ise HTF boğayken short\'u keser. Ölçümde 63 setup\'ın 45\'i bu kapıda ölüyordu (§11.12).');
  }
  // FAZ UYARISI — ölçüm sonucu değil, ölçümün nerede durduğu bilgisi.
  u.push('⚠ KILL KRİTERİ ÜÇ KOŞUDA DA GEÇİLEMEDİ: §11.9 spot 3/6 · §11.18 vadeli 3/6 · pencere hizalı spot kontrol 3/6. Altı katın altısında işaret aynı. Paneldeki backtest sonuçları yönlendirici değil, gözle doğrulama içindir.');
  u.push('⚠ FVG hattı KAPANDI (§11.10 · §11.16 · §11.17): üç ayrı rolde denendi, üçünde de şans tabanının üstüne çıkmadı. Algoritmada FVG\'nin hiçbir rolü yok; strateji anahtarı 2026-09-01\'de `fvg_vpfr_range` → `vpfr_range` olarak düzeltildi.');
  return u;
};

/**
 * PANEL PARAMETRELERİ — 29 → 14 (2026-09-01 sadeleştirmesi).
 *
 * Pine ikiziyle AYNI kural uygulandı: bir parametre ancak (a) ait olduğu hat
 * ölçümle kapandıysa, (b) ölçülüp tek değere karar verildiyse, ya da (c) salt
 * hesap maliyeti sabitiyse arayüzden çıkarıldı. Değerleri `cfg()`'de
 * varsayılan olarak DURUYOR — davranış değişmedi, yalnızca kadran gitti.
 *
 * ⚠ ÖLÇÜM YETENEĞİ KORUNDU. Kaldırılan altı işlem boyutu (`yonPolitikasi` ·
 * `girisAni` · `bolgeYoksa` · `slTamponR` · `tpTamponR` · `eqPartialPct`)
 * `lib/rangeEngine/islemSim.js` ve `scripts/vpfr-range-olcum.js` içinde
 * AYNEN duruyor; koordinat inişi onları sınamaya devam edebilir. Silinen tek
 * şey panel kadranı. Üçü de (§11.4 · §11.9 · §11.18) ayrıştırıcı çıkmadı.
 */
VpfrRangeStrategy.paramSchema = {
  // ── Yapı ──
  htfCarpan: { type: 'number', default: 6, min: 2, max: 24, step: 1, label: 'HTF çarpanı', group: 'Yapı', description: 'Bot LTF\'de çalışır, HTF bu seriden toplanır. 4h+6 = 1d yapı · 1h+4 = 4h yapı. İkisi de ölçüm boyutudur (§2).' },
  bacakEnAzAtr: { type: 'number', default: 2.5, min: 0, max: 10, step: 0.1, label: 'Min. impulse bacak genliği (× ATR)', group: 'Yapı', description: 'Bir swing bacağı range adayı sayılması için en az bu kadar ATR olmalı — mikro salınımların range üretmesini engeller. Hiç ölçülmedi.' },

  // ── Teyitler ──
  pocEqTolerans: { type: 'number', default: 0.333, min: 0.05, max: 0.5, step: 0.001, label: 'Volume Profile POC ≈ EQ toleransı (× R)', group: 'Teyit', description: '0.333 = orta üçte iki · 0.167 = orta üçte bir. HÂLÂ ÖLÇÜLECEK bir yapı boyutu (1/6 ve 1/4 denenmedi), o yüzden duruyor. Sıkı değer örneklemi azaltır ama yapıyı sağlamlaştırır: anchor kırılması %42→%31 (§11.2).' },
  avwapTolerans: { type: 'number', default: 0.15, min: 0.02, max: 0.5, step: 0.01, label: 'AVWAP ≈ EQ toleransı (× R)', group: 'Teyit', description: '⚠ ÖLÇÜM UYARISI: bu teyit adayların ~%100\'ünü geçiriyor, fiilen elemiyor. Sentetik test: sabit hızlı DÜZ bir trendin AVWAP\'ı tam EQ\'ya düşer — şartın ideal örneği range değil TREND. Kaldırılması PREMISE değişikliği olduğu için ayrı karara bırakıldı (2026-09-01).' },
  avwapTeyitBar: { type: 'number', default: 10, min: 3, max: 50, step: 1, label: 'AVWAP teyit penceresi (bar)', group: 'Teyit' },
  avwapTeyitOran: { type: 'number', default: 0.70, min: 0.3, max: 1, step: 0.05, label: 'AVWAP teyit oranı', group: 'Teyit', description: 'Son N barın en az bu oranı EQ bandında olmalı.' },

  // ── Range ──
  sapmaDonusBar: { type: 'number', default: 5, min: 1, max: 50, step: 1, label: 'Deviasyon geri dönüş penceresi (bar)', group: 'Range', description: 'Sınır aşıldıktan sonra fiyatın range içine kaç barda dönmesi gerektiği. Dönmezse setup iptal.' },
  genislemeDonusBar: { type: 'number', default: 50, min: 5, max: 200, step: 5, label: 'Expansion geri dönüş penceresi (bar)', group: 'Range' },
  genislemeTavani: { type: 'number', default: 2.0, min: 1, max: 6, step: 0.1, label: 'Expansion tavanı (× ilk onaylı genişlik)', group: 'Range', description: 'KÜMÜLATİF — her expansion orijinale göre ölçülür. Aşılırsa range geçersiz olur; "genişleyen range öldürülemez" patolojisine karşı zorunlu. ⚠ 2.0 = range iki katına çıkabilir; ölçümde bir range 13.588\'den 25.829\'a genişleyip 7 AY yaşadı ve o sürede yeni aday aranmadı.' },
  genislemeMaxSayi: { type: 'number', default: 1, min: 0, max: 3, step: 1, label: 'En fazla expansion sayısı', group: 'Range', description: 'Taslak kuralı: range en fazla 2 kez sabitlenir, yani 1 expansion.' },

  // ── İşlem ──
  retestPencereBar: { type: 'number', default: 20, min: 1, max: 100, step: 1, label: 'Limit emir geçerlilik süresi (bar)', group: 'İşlem', description: 'Range sınırına konan pasif limit emir bu kadar barda dolmazsa iptal edilir.' },
  breakevenAfterEq: { type: 'boolean', default: true, label: 'Kısmi TP sonrası stop\'u girişe çek (breakeven)', group: 'İşlem', description: 'AÇIK KARAR (kullanıcı, 2026-08-31: "EQ\'da partialdan sonra breakeven olabiliriz ama bu daha net değil"). AÇIK = kalan pozisyonun stop\'u girişe çekilir, risk sıfırlanır ama fiyat girişe dönerse kalan da kapanır. KAPALI = stop deviasyon bandında kalır. TP her iki hâlde de karşı sınırda, DEĞİŞMEZ.' },
  allocationPct: { type: 'number', default: 20, min: 1, max: 100, step: 1, label: 'Pozisyon büyüklüğü (% nakit)', group: 'İşlem' },

  feePct: { type: 'number', default: 0.06, min: 0, max: 1, step: 0.01, label: 'Tek yön komisyon (%)', group: 'Maliyet', description: 'Vadeli taker varsayılanı (lib/venues.js). Spot dönemindeki 0.15 buraya taşınmadı.' }
};

/**
 * Optimizasyon ızgarası — bilinçli olarak DAR.
 *
 * Amaç en iyi ayarı bulmak DEĞİL, kuralın parametreye duyarlılığını görmek.
 * Asıl seçim `scripts/vpfr-range-olcum.js`'teki koordinat inişiyle ve önceden
 * yazılı seçim kuralıyla yapılır. (Geniş ızgara = `sigmoid_bb` yolu; o
 * strateji 2300+ kombinasyon denendikten sonra genelleşmediği için
 * arşivlendi.)
 *
 * 2026-09-01: `capaYonu` ve `yonPolitikasi` ÇIKARILDI — ikisi de ölçülüp
 * karara bağlandı ve panelden kalktı. Geriye tek CANLI yapı boyutu kaldı.
 */
VpfrRangeStrategy.optimizeGrid = {
  pocEqTolerans: [1 / 6, 1 / 4, 1 / 3]
};

module.exports = VpfrRangeStrategy;
