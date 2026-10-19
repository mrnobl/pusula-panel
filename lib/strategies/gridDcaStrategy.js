const BaseStrategy = require('./baseStrategy');
const { referansHatti } = require('../context/referenceLine');
const { yapiBaglami } = require('../context/structureCtx');
const { merdivenKur, planEmirleri } = require('../ladder');
const mtf = require('../mtf');
const havuz = require('../indicatorPool');

/**
 * GRID + DCA BİRLEŞİK BOT (`PLAN-GRID-DCA.md` §3 katman 5, F6)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bu dosya YENİ BİR ŞEY HESAPLAMAZ. Altındaki beş katmanı birleştirir:
 *
 *   F1  `lib/mtf.js`               LTF ↔ HTF                    → K6
 *   F2  `lib/context/referenceLine` merkez çizgisi               → K2
 *   F3  `lib/context/structureCtx`  yapı kapısı (asimetri)
 *   F4  `lib/ladder/`               merdiven planı               → K3
 *   F5  motorun hedge defteri       iki taraf ayrı               → K1/K5/K7
 *
 * "Bağlam katmanı işlem bilmez, plan katmanı yapı bilmez" ilkesi gereği
 * KARAR VERME işi yalnızca burada. Aşağıdaki hiçbir satır fiyat serisinden
 * yeni bir gösterge türetmiyor.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ÇIKIŞ: HEDEF TOPLU, STOP KADEME KADEME
 * ═══════════════════════════════════════════════════════════════════════════
 * İkisi ASİMETRİK ve bu bilinçli.
 *
 * HEDEF taraf başına TEKTİR, çünkü motor taraf başına tek pozisyon taşır ve
 * hedefe değince tamamı kapanır. İki mod var, ikisi de ATR bazlı (kullanıcı
 * kararı, 2026-09-08):
 *
 *   'ilkSeviye'  TP emirle birlikte konur, tarafı AÇAN basamağın bir adım
 *                berisi; sonraki dolumlar TP'yi taşımaz
 *   'ortalama'   ortalamadan `tpAtr` kadar, her dolumda kayar
 *
 * STOP ise KADEME KADEME işler — kullanıcının tarifi:
 *
 *   > 90'da long açtım, 50'ye kadar alım yapacağım, 30'un altına düşerse en
 *   > fazla zarar edenden başlayarak kapatacağım. 90'dan 30'a %kaç düştüyse,
 *   > ikinci kademedeki de o kadar yüzdelik düşüş gelince kapanacak.
 *
 * Bu, motorun `M8`de kazandığı lot bazlı kısmi çıkış yoluyla işliyor: oran
 * emirle gidiyor (`lotStopPct`), motor her lotu KENDİ girişinden ölçüyor ve
 * bar İÇİNDE sırayla kapatıyor. Strateji burada yalnızca ORANI üretir —
 * kapatma kararı motorundur, çünkü seviye bar içinde geçilir ve bar
 * kapanışında karar vermek iyimser sapma olurdu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BAR BAŞINA TEK GÜNCELLEME — VE BU SESSİZ DEĞİL
 * ═══════════════════════════════════════════════════════════════════════════
 * `evaluate` tek bir sinyal döndürür ve `updateTarget` tarafını
 * `signal.side` ile söyler — yani BİR BARDA BİR TARAF. İki taraf birden
 * açıkken ikisinin de hedefi aynı barda değişebilir. (Stop bu darboğazdan
 * etkilenmez: oran emirle gidip pozisyonda donar, her bar bildirilmez.)
 *
 * Sırayla uygulanıyor (round-robin) ve ertelenen her güncelleme SAYILIYOR
 * (`ertelenenGuncelleme` göstergesi, ize düşer). Sessizce bir tarafın hedefi
 * eski kalsaydı, ölçüm "grid'in short bacağı neden geç kapanıyor" sorusunu
 * hiç cevaplayamazdı.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AÇIK POZİSYONUN SÖZLEŞMESİ MERKEZ KAYINCA DEĞİŞMEZ
 * ═══════════════════════════════════════════════════════════════════════════
 * K3 yalnızca DOLMAMIŞ emirleri ilgilendirir. Merkez kayıp plan yeniden
 * kurulduğunda açık pozisyonun stop'u ve hedefi OLDUĞU GİBİ KALIR — VPFR'da
 * aynı soru çıkmış ve "genişleme açık pozisyonun SL/TP'sini TAŞIMAZ" diye
 * kapatılmıştı. Tersi, girildikten sonra sözleşmesi değişen bir işlem olurdu.
 */

const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);

/** Yapı durumundan yön eğilimi: yükselen yapı long, alçalan short. */
const YAPI_YONU = { HH: 'long', HL: 'long', LH: 'short', LL: 'short' };

class GridDcaStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('Grid + DCA (birleşik)', config);
    this.hazir = null;

    /** Masadaki plan. `null` = masa boş. */
    this.plan = null;
    this.planMerkez = null;
    this.planBar = null;

    /**
     * IZGARA ÇAPASI — basamakların asıldığı SABİT fiyat ve aralık.
     *
     * Plan yeniden kurulduğunda basamaklar `merkez`den değil BURADAN
     * hesaplanır; merkez oynadıkça kafes oynamaz. Çapa yalnızca merkez
     * eşiği aşacak kadar uzaklaşınca yenilenir.
     */
    this.izgaraCapa = null;
    this.izgaraAralik = null;
    this.izgaraYenileme = 0;

    /**
     * Taraf başına en son BİLDİRİLEN hedef. Ortalama değişmediyse aynı
     * hedefi her bar yeniden bildirmek güncelleme bütçesini boşa harcardı.
     */
    this.sonHedef = { long: null, short: null };
    /** Round-robin imleci — hangi taraf sıradaydı. */
    this.siradaki = 'long';

    this.planSayaci = 0;
    this.yenidenKurulum = 0;
    this.planYenileme = 0;
    this.planIptal = 0;
    this.ertelenenGuncelleme = 0;
  }

  cfg() {
    const c = this.config || {};
    const s = (ad, vars) => (c[ad] !== undefined ? c[ad] : vars);
    return {
      // ── K2: merkez ────────────────────────────────────────────────────
      merkezKaynagi: s('merkezKaynagi', 'referans'),   // 'referans' | 'rangeEq'
      /**
       * K2 KARARI (kullanıcı, 2026-09-08): VARSAYILAN VWAP.
       *
       * Altı merkez de seçilebilir. Varsayılanın EMA'dan VWAP'a alınmasının
       * sebebi ölçülmüş bir davranış farkı: BTC 4h 1500 barda EMA50 merkezli
       * grid'in kapanışlarının çoğu KADEME STOPUNDAN geliyordu (119 kapanış /
       * 175 kademe stopu), VWAP merkezlininki ise HEDEFTEN (238 kapanış /
       * 220 hedef). Bu bir kâr ölçümü değil — hangi çıkışın baskın olduğunu
       * söylüyor, ve merdivenin gömülmek yerine dönmesi istenen davranış.
       */
      referansKaynagi: s('referansKaynagi', 'vwap'),   // ema|vwap|avwap|eq|poc
      referansPeriod: Math.max(2, Math.floor(+s('referansPeriod', 50))),

      // ── Merdiven ──────────────────────────────────────────────────────
      yon: s('yon', 'iki'),                            // 'iki' | 'long' | 'short'
      kademe: Math.max(1, Math.floor(+s('kademe', 4))),
      /**
       * BASAMAK ARALIĞI, BİR MUMUN MENZİLİNDEN GENİŞ OLMAK ZORUNDA.
       *
       * Eski varsayılan 0.5 idi ve yapısal olarak bozuktu: ölçüldü, mum
       * menzili / ATR medyan **0.86**, %90 dilimi **1.67** (5m · 1h · 4h,
       * üçünde de aynı). Yani 0.5 ATR'lik basamak, TİPİK bir mumun
       * menzilinin yarısı — tek mum 1.7 basamağı, büyük mum 3.3 basamağı
       * süpürüyor. Merdiven "fiyat düştükçe kademeli al" olmaktan çıkıp
       * "hepsini bu mumda al"a dönüyordu.
       *
       * 2.0, mumların %90'ından geniş bir basamak demek. Ölçülen sonuç: tek
       * barda en çok 1 giriş, çoklu dolum %0 (üç seride de).
       *
       * Bu bir PARAMETRE ARAMASI değil, verinin ölçülmüş bir özelliğinden
       * çıkan yapısal kısıt — kâr/beklenti hiç hesaba katılmadı.
       */
      adimAtr: +s('adimAtr', 2.0),
      tutar: +s('tutar', 100),
      tutarTipi: s('tutarTipi', 'Fixed'),
      /**
       * K5 — TARAF BAŞINA SERMAYE TAVANI (kullanıcı, 2026-09-06).
       *
       * Motor ayarı ama panelde hiçbir yerden ayarlanamıyordu: `paramSchema`
       * dışında kalan her alan panele çıkmıyor. Kararın kendisi 2026-09-06'da
       * alınmış, motorda `HedgeBook.ayrilabilir` olarak da yazılmış — ama
       * defter yolunda hiç sorulmadığı için `grid_dca`da FİİLEN YOKTU.
       * Artık hem uygulanıyor hem ayarlanabiliyor.
       */
      tarafTavanPct: +s('tarafTavanPct', 50),              // 'Fixed' | '% of equity'

      // ── K4: TP — HEPSİ ATR CİNSİNDEN (kullanıcı, 2026-09-08) ──────────
      tpModu: s('tpModu', 'ilkSeviye'),                // 'ilkSeviye' | 'ortalama'
      tpAdim: Math.max(1, Math.floor(+s('tpAdim', 1))),
      tpAtr: +s('tpAtr', 1.0),                         // yalnızca 'ortalama'

      // ── Kademe sınırı ve yapısal stop (kullanıcı, 2026-09-08) ─────────
      kademeSinir: Math.max(1, Math.floor(+s('kademeSinir', 5))),
      yapiSeviyesi: s('yapiSeviyesi', 'swing'),        // 'swing' | 'range'
      stopTamponAtr: +s('stopTamponAtr', 1.0),

      // ── Dalga eğilimi ─────────────────────────────────────────────────
      egilim: s('egilim', 'dalga'),                    // 'kapali' | 'dalga'
      expansiyonAtr: +s('expansiyonAtr', 2.0),
      egilimBonus: Math.max(0, Math.floor(+s('egilimBonus', 2))),

      /**
       * ── K3: merkez kayınca ──────────────────────────────────────────
       *
       * VARSAYILAN `yenidenKur` — yani KAYAN GRID.
       *
       * `PLAN-GRID-DCA.md` §2 botu tam olarak böyle tanımlıyor: "merkezi
       * sabit değil, referans hattıyla KAYAN grid". `yerinde` ise §7'de
       * ölçülüp "kontrol grubu olarak dürüst ama tek başına bir grid değil"
       * diye kaydedildi: plan bir kez kurulup masa boşalmadığı için bot
       * neredeyse atıl kalıyor (ölçüldü: 15 varlık × 2500 barda 58 deal,
       * yani ~646 barda bir işlem).
       *
       * Varsayılanın `yerinde` kalması bir gözden kaçmaydı; F8 ölçümü onunla
       * koşsaydı tasarlanan botu değil kontrol grubunu ölçerdi.
       */
      kayma: s('kayma', 'yenidenKur'),                 // 'yerinde'|'yenidenKur'|'iptal'
      yenidenMerkezAtr: +s('yenidenMerkezAtr', 1.5),

      /**
       * ── IZGARA KİLİDİ — basamaklar fiyatı KOVALAMAZ ─────────────────
       *
       * Kullanıcı bildirimi (2026-09-08): "fiyat long ve short emri tek
       * noktadan seri halde veriyor, bunu parçalamalıyız."
       *
       * Ölçüldü ve doğrulandı: BTC 5m'de tek bir barda 4 long dolmuş,
       * barın toplam aralığı %0.17. Kademeler 4-5-6-7 ama fiyatları sıralı
       * DEĞİL (79596 · 79536 · 79656 · 79476) — çünkü ayrı planlardan
       * geliyorlar. Merkez her kaydığında merdiven baştan diziliyor ve her
       * yeni plan fiyatın hemen dibine taze bir L1 koyuyor; o da anında
       * doluyor. Sonuç: basamaklar yerinde durmuyor, fiyatı kovalıyor.
       *
       * Kilit açıkken basamaklar bir ÇAPAYA sabitlenir: plan yeniden
       * kurulsa bile fiyatlar aynı kafeste kalır, yani bir sonraki emrin
       * dolması için fiyatın gerçekten bir basamak yol alması gerekir.
       * `kapali` eski davranıştır — kontrol grubu olarak duruyor.
       */
      izgaraKilit: s('izgaraKilit', 'acik'),           // 'acik' | 'kapali'

      // ── Asimetri (SERT kapı — eğilimden ayrı) ─────────────────────────
      asimetri: s('asimetri', 'kapali'),               // 'kapali'|'yapi'|'range'

      // ── K6: MTF ───────────────────────────────────────────────────────
      htfCarpan: Math.max(0, Math.floor(+s('htfCarpan', 0))),   // 0 = MTF kapalı
      aralikDilimi: s('aralikDilimi', 'ltf'),          // 'ltf' | 'htf'
      yapiDilimi: s('yapiDilimi', 'ltf'),              // 'ltf' | 'htf'

      // Kullanıcı kararı: ATR botun KENDİ zaman diliminden, 14 periyot.
      atrPeriod: Math.max(2, Math.floor(+s('atrPeriod', 14)))
    };
  }

  /* ═══ HAZIRLIK ═════════════════════════════════════════════════════════ */

  /**
   * Bağlam katmanlarını TÜM seride bir kez hesaplar.
   *
   * İleriye bakma DEĞİLDİR: `referansHatti` ve `yapiBaglami` F2/F3'te
   * kesim testinden geçti — `i`. bardaki değer seri `i`'de kesildiğinde de
   * aynı çıkıyor. Buradaki tek iş onları okumak.
   */
  prepare(candles) {
    const p = this.cfg();
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n < 60) { this.hazir = null; return; }

    try {
      const zaman = new Map();
      candles.forEach((c, i) => zaman.set(c.time, i));

      const ref = referansHatti(candles, {
        kaynak: p.referansKaynagi,
        period: p.referansPeriod,
        atrPeriod: p.atrPeriod
      });
      const yapi = yapiBaglami(candles, { atrPeriod: p.atrPeriod });

      /**
       * HTF KATMANI — yalnızca istendiğinde kurulur.
       *
       * HTF serisi `mtf.topla` ile üretiliyor ve KAPANMAMIŞ SON KOVA
       * dışarıda kalıyor; `gecerliHtfIndeksi` her LTF barı için "o an
       * okunabilir olan son HTF mumu"nu veriyor. HTF değerini LTF
       * döngüsünde ileriye bakmadan okumanın tek doğru yolu bu.
       */
      let htfAtr = null, htfYapi = null, htfIx = null;
      if (p.htfCarpan >= 2 && (p.aralikDilimi === 'htf' || p.yapiDilimi === 'htf')) {
        const { htf } = mtf.topla(candles, p.htfCarpan);
        if (htf.length) {
          htfIx = mtf.gecerliHtfIndeksi(htf, n);
          /**
           * İKİ EŞİK AYRI, ÇÜNKÜ İHTİYAÇLARI AYRI. ATR'nin ısınması birkaç
           * bar; salınım/range tespiti çok daha uzun. Tek bir eşik
           * kullanmak, aralık HTF'den okunabilecekken botu beklettirirdi.
           *
           * ATR doğrudan havuzdan alınıyor: `referansHatti`nin `atr` alanı da
           * zaten havuzun aynı serisidir, ama oradan almak gereksiz bir EMA
           * hesabı ve ilgisiz bir ısınma bağı getirirdi.
           */
          if (p.aralikDilimi === 'htf' && htf.length >= p.atrPeriod + 2) {
            htfAtr = havuz.computeOne(htf, 'atr', { period: p.atrPeriod }).value;
          }
          if (p.yapiDilimi === 'htf' && htf.length >= 60) {
            htfYapi = yapiBaglami(htf, { atrPeriod: p.atrPeriod });
          }
        }
      }

      this.hazir = { zaman, n, ref, yapi, htfAtr, htfYapi, htfIx };
    } catch (err) {
      this.hazir = null;
    }
  }

  indeksBul(ohlcv) {
    const son = ohlcv[ohlcv.length - 1];
    if (this.hazir && this.hazir.zaman.has(son.time)) return this.hazir.zaman.get(son.time);
    return null;
  }

  /* ═══ KARARLAR ═════════════════════════════════════════════════════════ */

  /**
   * K2 — merkez nerede?
   *
   * `rangeEq` yalnızca AKTİF bir range varken sayı döndürür; range yokken
   * `null` gelir ve plan kurulmaz. Range yokken sessizce referans hattına
   * düşmek, kullanıcının "range'in ortasında grid" isteğini fark ettirmeden
   * "EMA'da grid"e çevirirdi.
   */
  merkezSec(i) {
    const { ref, yapi } = this.hazir;
    const p = this.cfg();
    if (p.merkezKaynagi === 'rangeEq') {
      return yapi.rangeVar[i] === 1 && sayiMi(yapi.rangeEq[i]) ? yapi.rangeEq[i] : null;
    }
    return sayiMi(ref.deger[i]) ? ref.deger[i] : null;
  }

  /**
   * K6 — merdivenin aralığını hangi dilim belirler?
   *
   * Yapı HTF'den, tetik LTF'den olması doğal; ARALIK açık soruydu. İkisi de
   * seçilebiliyor çünkü bu bir ölçüm sorusu: HTF ATR'siyle kurulan grid
   * daha seyrek basamaklı olur, LTF'ninki daha sık.
   */
  atrSec(i) {
    const p = this.cfg();
    const { ref, htfAtr, htfIx } = this.hazir;
    if (p.aralikDilimi === 'htf') {
      /**
       * HTF İSTENDİYSE LTF'YE DÜŞÜLMEZ — `null` dönülür ve plan kurulmaz.
       *
       * Geri düşmek en sinsi hata biçimi olurdu: kullanıcı HTF aralıklı bir
       * grid kurduğunu sanırken bot ilk yüzlerce barı LTF aralığıyla koşar
       * ve ölçüm iki farklı botun ortalamasını ölçerdi. `referenceLine`
       * bilinmeyen kaynakta tam bu sebeple hata atıyor (F2).
       */
      if (!htfAtr || !htfIx) return null;
      const k = htfIx[i];
      return k >= 0 && sayiMi(htfAtr[k]) ? htfAtr[k] : null;
    }
    return sayiMi(ref.atr[i]) ? ref.atr[i] : null;
  }

  /**
   * Asimetri kapısı — yapının izin verdiği taraf.
   *
   * @returns {string|null} 'iki' | 'long' | 'short' | null (hiç plan kurma)
   */
  yonSec(i) {
    const p = this.cfg();
    if (p.asimetri === 'kapali') return p.yon;

    const { yapi, htfYapi, htfIx } = this.hazir;
    let kaynak = yapi, j = i;
    if (p.yapiDilimi === 'htf') {
      // `atrSec` ile aynı kural: HTF istendiyse LTF'ye SESSİZCE düşülmez.
      if (!htfYapi || !htfIx) return null;
      const k = htfIx[i];
      if (k < 0) return null;          // henüz kapanmış HTF mumu yok
      kaynak = htfYapi; j = k;
    }

    if (p.asimetri === 'range') {
      // Range yoksa grid'in merkezi tanımsızdır — plan kurulmaz.
      return kaynak.rangeVar[j] === 1 ? p.yon : null;
    }

    // 'yapi': yükselen yapıda yalnızca alt basamaklar, alçalanda üst.
    // İlk salınımlar 'H'/'L' etiketi taşır (F3): kıyaslanacak öncül yok,
    // yön eğilimi de yok — o barlarda kapı AÇIK bırakılıyor, çünkü
    // "bilinmiyor" ile "ters" aynı şey değil.
    const egilim = YAPI_YONU[kaynak.yapiDurumu[j]] || null;
    if (!egilim) return p.yon;
    if (p.yon !== 'iki') return p.yon === egilim ? p.yon : null;
    return egilim;
  }

  /**
   * YAPISAL SEVİYELER — alımın nereye kadar ineceği ve stopun nerede olduğu.
   *
   * Kullanıcı kararı (2026-09-08): bu seviyeler ELLE GİRİLMEZ, YAPIDAN gelir.
   *
   *   taban  long merdiveni buranın ALTINA basamak koymaz  (son onaylı dip)
   *   stop   taban bir tampon kadar aşağıda kırılırsa kapanış başlar
   *
   * Tampon ATR cinsinden: yapının "kırıldığını" söylemek için fiyatın diple
   * tam olarak aynı yerde olması yetmez, bir miktar geçmesi gerekir. Yüzde
   * tampon zaman dilimleri arasında kıyaslanamazdı (F2 gerekçesi).
   *
   * @returns {{taban, stop}|null} yön için geçerli seviyeler, yoksa null
   */
  yapiSeviyeleri(i, yon, atr) {
    const p = this.cfg();
    const { yapi } = this.hazir;
    const uzun = yon === 'long';

    let sinir;
    if (p.yapiSeviyesi === 'range') {
      // Range yoksa seviye YOK — sessizce salınıma düşmek, kullanıcının
      // seçtiği yapıdan başka bir yapıyla işlem açmak olurdu.
      if (yapi.rangeVar[i] !== 1) return null;
      sinir = uzun ? yapi.rangeAlt[i] : yapi.rangeUst[i];
    } else {
      sinir = uzun ? yapi.swingAlt[i] : yapi.swingUst[i];
    }
    if (!sayiMi(sinir) || sinir <= 0) return null;

    const tampon = p.stopTamponAtr * atr;
    const stop = uzun ? sinir - tampon : sinir + tampon;
    if (!(stop > 0)) return null;
    return { taban: sinir, stop };
  }

  /**
   * DALGA EĞİLİMİ — "fiyat yükseliyor, expansion geldi, net longu artır".
   *
   * Expansion ayrı bir gösterge değil: F3'ün DALGA'sı zaten "son salınımdan
   * bu yana fiyat hangi yöne, kaç ATR gitti" diyor. Bir dalga, boyu eşiği
   * aştığında expansion sayılır. İkinci bir tespit yazmak, bu depoda
   * tekrarlanan "aynı kuralın iki kopyası" hatası olurdu.
   *
   * @returns {'long'|'short'|null} null = expansion yok, iki taraf eşit
   */
  egilimYonu(i) {
    const p = this.cfg();
    if (p.egilim !== 'dalga') return null;
    const { yapi } = this.hazir;
    const boy = yapi.dalgaBoyu[i];
    const yon = yapi.dalgaYonu[i];
    if (!sayiMi(boy) || !sayiMi(yon)) return null;
    if (boy < p.expansiyonAtr) return null;
    return yon > 0 ? 'long' : 'short';
  }

  /**
   * Taraf başına kademe tavanı.
   *
   * Kullanıcı kararı: hem long hem short tarafta işlem kademe sınırı olacak.
   * Eğilim bu tavanı SİMETRİK OLMAYAN biçimde kaydırır — expansion yukarıysa
   * long daha derin, short daha sığ olur. Net maruziyet böyle yön değiştirir.
   *
   * Tavan SIFIRA inebilir: eğilimin tersindeki taraf tamamen kapanabilir.
   * Bu kasıtlı — "fiyat düşerken kâr eğrimiz ayrışsın" hedefinin tek yolu,
   * düşüşte long tarafını kısmaktır.
   */
  kademeSinirlari(i) {
    const p = this.cfg();
    const egilim = this.egilimYonu(i);
    const taban = p.kademeSinir;
    if (!egilim) return { long: taban, short: taban, egilim: null };
    return {
      long: Math.max(0, taban + (egilim === 'long' ? p.egilimBonus : -p.egilimBonus)),
      short: Math.max(0, taban + (egilim === 'short' ? p.egilimBonus : -p.egilimBonus)),
      egilim
    };
  }

  /* ═══ DEĞERLENDİRME ════════════════════════════════════════════════════ */

  evaluate(ohlcv, ticker, positions, motorDurumu) {
    const p = this.cfg();
    if (!Array.isArray(ohlcv) || ohlcv.length < 60) {
      return { action: 'HOLD', reason: 'Yetersiz mum verisi' };
    }
    if (!this.hazir || !this.hazir.zaman.has(ohlcv[ohlcv.length - 1].time)) this.prepare(ohlcv);
    if (!this.hazir) return { action: 'HOLD', reason: 'Bağlam hazırlanamadı' };

    const i = this.indeksBul(ohlcv);
    if (i === null) return { action: 'HOLD', reason: 'Bar indeksi çözülemedi' };

    const acik = (positions || []).filter(x => x && x.amount > 0);
    const pozLong = acik.find(x => x.side !== 'short') || null;
    const pozShort = acik.find(x => x.side === 'short') || null;
    const acikEmir = motorDurumu ? (motorDurumu.openOrders || 0) : 0;
    const sermaye = motorDurumu && sayiMi(motorDurumu.equity) ? motorDurumu.equity : 10000;

    const merkez = this.merkezSec(i);
    const atr = this.atrSec(i);
    const izinliYon = this.yonSec(i);
    /**
     * Emrin piyasanın doğru tarafında olup olmadığı BU BARIN KAPANIŞINA göre
     * ölçülür — emir zaten bar kapanışında masaya konuyor ve en erken bir
     * sonraki barda dolabiliyor. İleriye bakma yok: kapanış bu barın bilgisi.
     */
    const kapanis = ohlcv[ohlcv.length - 1].close;

    /**
     * TARAF DURUMU — yapısal seviyeler + kalan kademe hakkı.
     *
     * Lot SAYISI motorun pozisyon kaydından okunuyor (`poz.lots`), stratejinin
     * kendi saydığı bir sayaçtan değil. Sayaç tutmak, kademe stopu bir lotu
     * kapattığında sessizce ayrışırdı — motor lotu düşer, sayaç düşmezdi ve
     * tavan gerçekte olduğundan dolu görünürdü.
     */
    const sinirlar = sayiMi(atr) && atr > 0 ? this.kademeSinirlari(i) : { long: 0, short: 0, egilim: null };
    const lotSayisi = {
      long: pozLong && Array.isArray(pozLong.lots) ? pozLong.lots.length : 0,
      short: pozShort && Array.isArray(pozShort.lots) ? pozShort.lots.length : 0
    };
    const poz = { long: pozLong, short: pozShort };
    const durum = {};
    for (const taraf of ['long', 'short']) {
      durum[taraf] = {
        yapi: (sayiMi(atr) && atr > 0) ? this.yapiSeviyeleri(i, taraf, atr) : null,
        kalan: Math.max(0, sinirlar[taraf] - lotSayisi[taraf]),
        // Halihazırda TUTULAN basamak fiyatları — dolu basamak yeniden
        // teklif edilmesin diye. Motorun kendi lot kaydından okunuyor.
        lotFiyatlari: poz[taraf] && Array.isArray(poz[taraf].lots)
          ? poz[taraf].lots.map(l => l.price).filter(sayiMi) : [],
        oran: 0
      };
    }

    const gostergeler = {
      merkez: sayiMi(merkez) ? +merkez.toFixed(6) : null,
      atr: sayiMi(atr) ? +atr.toFixed(8) : null,
      planMerkez: sayiMi(this.planMerkez) ? +this.planMerkez.toFixed(6) : null,
      sapmaAtr: sayiMi(merkez) && sayiMi(this.planMerkez) && sayiMi(atr) && atr > 0
        ? +Math.abs(merkez - this.planMerkez) / atr : null,
      izinliYon: izinliYon || 'yok',
      egilim: sinirlar.egilim || 'yok',
      sinirLong: sinirlar.long,
      sinirShort: sinirlar.short,
      lotLong: lotSayisi.long,
      lotShort: lotSayisi.short,
      tabanLong: durum.long.yapi ? +durum.long.yapi.taban.toFixed(6) : null,
      stopLong: durum.long.yapi ? +durum.long.yapi.stop.toFixed(6) : null,
      acikEmir,
      plan: this.planSayaci,
      yenidenKurulum: this.yenidenKurulum,
      planYenileme: this.planYenileme,
      izgaraCapa: sayiMi(this.izgaraCapa) ? +this.izgaraCapa.toFixed(6) : null,
      izgaraYenileme: this.izgaraYenileme,
      ertelenenGuncelleme: this.ertelenenGuncelleme
    };

    /**
     * ÇIKIŞ GÜNCELLEMELERİ ÖNCE HAZIRLANIR, SİNYALE EN SONDA BİNER.
     *
     * Sıra önemli: aynı barda hem plan kurulup hem hedef güncellenebilir ve
     * ikisi TEK sinyal nesnesinde taşınır (`orders` + `updateTarget`).
     * Motor `orders`ı `action`dan bağımsız işliyor, çakışma yok.
     */
    const guncelleme = this.cikisGuncellemesi(pozLong, pozShort, atr, p);

    // ── Kapı kapalı: masadaki planı kaldır ──────────────────────────────
    if (!izinliYon) {
      if (this.plan) {
        this.planBirak();
        this.planIptal++;
        return this.sinyalle({ action: 'HOLD', cancelAll: true, reason: 'Yapı kapısı kapalı — plan iptal' }, guncelleme, gostergeler);
      }
      return this.sinyalle({ action: 'HOLD', reason: 'Yapı kapısı kapalı' }, guncelleme, gostergeler);
    }

    if (!sayiMi(merkez) || !sayiMi(atr) || !(atr > 0)) {
      return this.sinyalle({ action: 'HOLD', reason: 'Merkez ya da ATR hazır değil' }, guncelleme, gostergeler);
    }

    // ── Plan yok: kur ───────────────────────────────────────────────────
    if (!this.plan) {
      return this.sinyalle(this.planKur(merkez, atr, izinliYon, sermaye, i, p, durum, 'Grid planı kuruldu', kapanis), guncelleme, gostergeler);
    }

    /**
     * PLAN TÜKENDİ — MERDİVEN YENİDEN KURULUR.
     *
     * Bu K3'ten AYRI bir sorudur ve karıştırılırsa bot uykuya dalar:
     * `kayma: 'yerinde'` "canlı bir plan OYNATILMAZ" demek, "ömür boyu tek
     * plan" demek değil. Ayrım yapılmadığında ölçüldü — 1500 barlık BTC 4h
     * koşusunda tek plan kuruluyor, 8 emir doluyor ve bot geri kalan ~1450
     * barı hiçbir şey yapmadan geçiriyordu.
     *
     * §2'nin tablosu iki ömür tanımının ikisini de yeniden kurmakla
     * bitiriyor: DCA'da "deal biter, merdiven yeniden kurulur", grid'de
     * "süreklidir". Hiç kurmamak ikisi de değildi.
     *
     * ÖLÇÜT MASANIN BOŞ OLMASI, pozisyonun kapanması değil: dolmamış tek bir
     * basamak bile masadaysa plan hâlâ yaşıyordur. Verildiği barda sayılmaz
     * (`i > this.planBar`) — o barda emirler motora henüz ulaşmamıştır.
     */
    if (acikEmir === 0 && i > this.planBar) {
      this.planYenileme++;
      return this.sinyalle(
        this.planKur(merkez, atr, izinliYon, sermaye, i, p, durum, 'Plan tükendi — merdiven yeniden kuruldu', kapanis),
        guncelleme, gostergeler);
    }

    /**
     * K3 — MERKEZ KAYDI, ŞİMDİ NE OLACAK?
     *
     * Eşik ATR cinsinden ölçülür (F2 gerekçesi): yüzde eşik, aynı ayarı iki
     * zaman diliminde bambaşka bir davranışa çevirirdi.
     */
    const sapma = Math.abs(merkez - this.planMerkez) / atr;
    const kaydi = sapma >= p.yenidenMerkezAtr;

    // Yön değiştiyse (asimetri kapısı taraf değiştirdi) plan zaten geçersiz.
    const yonDegisti = this.plan.yon !== izinliYon;

    if (!kaydi && !yonDegisti) {
      return this.sinyalle({ action: 'HOLD', reason: `Plan yerinde (sapma ${sapma.toFixed(2)} ATR)` }, guncelleme, gostergeler);
    }

    if (p.kayma === 'yerinde' && !yonDegisti) {
      /**
       * 'yerinde' = merkez kaysa da plan HİÇ dokunulmaz. Bugünkü DCA
       * davranışının grid'e taşınmış hâli; kayan grid'in KONTROL GRUBU.
       */
      return this.sinyalle({ action: 'HOLD', reason: `Merkez kaydı (${sapma.toFixed(2)} ATR) — plan sabit` }, guncelleme, gostergeler);
    }

    if (p.kayma === 'iptal' && !yonDegisti) {
      this.planBirak();
      this.planIptal++;
      return this.sinyalle({ action: 'HOLD', cancelAll: true, reason: `Merkez kaydı (${sapma.toFixed(2)} ATR) — plan iptal` }, guncelleme, gostergeler);
    }

    /**
     * 'yenidenKur' — DOLMAMIŞ emirler iptal edilip yeni merkeze göre
     * yeniden dizilir. Açık pozisyona DOKUNULMAZ (dosya başlığı).
     *
     * Yön değişimi de buraya düşer: eski tarafın emirleri masada kalırsa
     * yapı artık izin vermediği bir yönde pozisyon açarlar.
     */
    this.yenidenKurulum++;
    const sebep = yonDegisti
      ? `Yön değişti (${this.plan.yon} → ${izinliYon}) — plan yeniden kuruldu`
      : `Merkez kaydı (${sapma.toFixed(2)} ATR) — plan yeniden kuruldu`;
    const yeni = this.planKur(merkez, atr, izinliYon, sermaye, i, p, durum, sebep, kapanis);
    yeni.cancelAll = true;
    return this.sinyalle(yeni, guncelleme, gostergeler);
  }

  /* ═══ PLAN ═════════════════════════════════════════════════════════════ */

  planBirak() {
    this.plan = null;
    this.planMerkez = null;
    this.planBar = null;
  }

  /**
   * IZGARA ÇAPASI — basamakların asıldığı sabit fiyat.
   *
   * Kilit KAPALIYKEN çapa her seferinde merkezdir (eski davranış: kafes
   * fiyatı kovalar). AÇIKKEN çapa yalnızca merkez `yenidenMerkezAtr` kadar
   * uzaklaşınca yenilenir; arada plan kaç kez kurulursa kurulsun basamak
   * fiyatları AYNI kalır.
   *
   * Aralık da çapayla birlikte donar. Donmasaydı ATR her barda biraz
   * oynadığı için basamaklar milimetrik kayar ve "aynı kafes" iddiası
   * kâğıt üstünde kalırdı.
   */
  izgaraCapasi(merkez, atr, p) {
    if (p.izgaraKilit !== 'acik') return { capa: merkez, aralik: p.adimAtr * atr };

    /**
     * ÇAPA EŞİĞİ, PLAN YENİLEME EŞİĞİNDEN BAĞIMSIZ OLMAK ZORUNDA.
     *
     * İlk sürümde ikisi de `yenidenMerkezAtr` idi ve kilit HİÇBİR ŞEY
     * yapmıyordu: plan tam da merkez o kadar kaydığı için yeniden kuruluyor,
     * dolayısıyla çapa da her seferinde birlikte kayıyordu. Test bunu
     * yakaladı — kilitli ve serbest koşular birebir aynı fiyatları üretti
     * (105 fiyat / 25 plan, ikisinde de).
     *
     * Doğru ölçüt: çapa, fiyat KAFESİN DIŞINA çıkınca yenilenir. Kafesin
     * yarı açıklığı `kademe × aralık`tır; merkez bu kadar uzaklaştıysa
     * mevcut basamakların hepsi fiyatın bir tarafında kalmış demektir ve
     * kafes artık işe yaramaz.
     *
     * Böylece iki eşik iki AYRI soruyu cevaplar:
     *   yenidenMerkezAtr → masadaki emirler ne sıklıkla tazelenir
     *   kafes açıklığı   → basamaklar NEREDE durur
     */
    const kur = !sayiMi(this.izgaraCapa) || !sayiMi(this.izgaraAralik) || !(this.izgaraAralik > 0);
    const disari = !kur && Math.abs(merkez - this.izgaraCapa) >= p.kademe * this.izgaraAralik;

    if (kur || disari) {
      this.izgaraCapa = merkez;
      this.izgaraAralik = p.adimAtr * atr;
      this.izgaraYenileme++;
    }
    return { capa: this.izgaraCapa, aralik: this.izgaraAralik };
  }

  planKur(merkez, atr, yon, sermaye, i, p, durum, sebep, guncelFiyat) {
    const { capa, aralik } = this.izgaraCapasi(merkez, atr, p);
    if (!(capa > 0) || !(aralik > 0)) {
      this.planBirak();
      return { action: 'HOLD', reason: 'Izgara çapası kurulamadı' };
    }

    const plan = merdivenKur('grid', {
      // Basamaklar ÇAPADAN hesaplanır, merkezden değil — kafes sabit kalsın.
      referans: capa,
      yon,
      kademe: p.kademe,
      // Aralık mutlak fiyat olarak veriliyor: `adimAtr × atr` her barda
      // yeniden hesaplansaydı kafes ATR ile birlikte kayardı.
      adimYuzde: aralik / capa,
      tutar: p.tutar,
      tutarTipi: p.tutarTipi,
      sermaye,
      tpAdim: p.tpAdim,
      yenidenMerkezAtr: p.yenidenMerkezAtr
    });

    const secilen = this.basamaklariSuz(plan, durum, guncelFiyat);
    if (!secilen.length) {
      this.planBirak();
      return { action: 'HOLD', reason: 'Yapı, kademe tavanı ya da piyasa tarafı hiçbir basamağa izin vermedi' };
    }

    this.plan = plan;
    this.planMerkez = merkez;
    this.planBar = i;
    this.planSayaci++;

    return {
      action: 'HOLD',
      orders: this.emirler(plan, secilen, p, durum),
      reason: `${sebep} — ${secilen.length} emir (plan ${this.planSayaci})`
    };
  }

  /**
   * SÜZME — merdiven simetrik kurulur, MASAYA simetrik konmaz.
   *
   * Planlayıcı (F4) yapı bilmez ve bilmemeli; iki yana eşit basamak dizer.
   * Hangi basamağın gerçekten masaya konacağı bu katmanın kararıdır ve iki
   * kısıttan geçer:
   *
   *   1. YAPISAL TABAN — long basamağı son onaylı dibin ALTINA konmaz.
   *      Kullanıcı kuralı: "50'ye kadar alım yapacağım", ve 50 yapıdan gelir.
   *   2. KADEME TAVANI — o tarafta halihazırda taşınan lot sayısı tavana
   *      yaklaştıysa yalnızca KALAN kadar basamak konur.
   *
   * İkincisi neden emir sayısını kısıtlıyor da dolumu beklemiyor: masaya
   * konan her emir dolabilir. 5 tavanına 3 lotla gelinip 4 emir konsaydı,
   * hepsi aynı barda dolduğunda tavan 7'ye çıkardı — tavan ancak masaya
   * konarken bağlayıcıysa gerçekten tavandır.
   *
   * Basamaklar merkeze YAKINDAN uzağa sıralı geldiği için `slice` en yakın
   * olanları tutar; uzaktakileri tutmak merdiveni ortasından boşaltırdı.
   */
  basamaklariSuz(plan, durum, guncelFiyat) {
    const secilen = [];
    /**
     * ═══════════════════════════════════════════════════════════════════
     * EMİR PİYASANIN YANLIŞ TARAFINA KONMAZ
     * ═══════════════════════════════════════════════════════════════════
     * Bir limit ALIŞ piyasanın ALTINDA, limit SATIŞ ÜSTÜNDE olmak zorundadır.
     * Ters tarafa konan emir bekleyen emir değildir: konduğu anda "paranın
     * içindedir" ve bir sonraki barda ANINDA, üstelik piyasadan KÖTÜ bir
     * fiyattan dolar.
     *
     * Ölçüldü ve sebep buydu: girişlerin %39–94'ü emir konarken zaten
     * paranın içindeydi. En uç örnek — BTC 4h'te short limit 67512'ye
     * konmuş, piyasa 69089: %2.3 kötü fiyattan anında satış.
     *
     * Sebebi kafesin ÇAPAYA asılı olması: fiyat çapadan uzaklaştığında
     * basamakların bir kısmı fiyatın yanlış tarafında kalıyor. Kafes doğru,
     * eksik olan şuydu — o basamaklar MASAYA KONMAMALIYDI.
     *
     * Kullanıcının "girişleri ve çıkışları dağıtmalıyız" dediği kümelenmenin
     * de asıl kaynağı bu: yanlış taraftaki basamakların hepsi tek barda
     * birden doluyordu.
     */
    const fiyatGecerli = sayiMi(guncelFiyat) && guncelFiyat > 0;
    const dogruTaraf = (taraf, fiyat) => {
      if (!fiyatGecerli) return true;
      return taraf === 'long' ? fiyat < guncelFiyat : fiyat > guncelFiyat;
    };

    /**
     * DOLU BASAMAK YENİDEN TEKLİF EDİLMEZ.
     *
     * Kullanıcının gördüğü "tek noktadan seri emir"in ikinci yarısı buydu:
     * bir basamak dolduktan sonra plan yeniden kurulunca AYNI fiyat tekrar
     * masaya konuyor ve anında yeniden doluyordu. Aynı rakama üst üste
     * binen lotlar, merdiveni yaymak yerine tek noktada yığıyordu.
     *
     * Ölçüt yarım basamak: kafes kilitliyken fiyatlar birebir aynı gelir,
     * ama çapa yenilendiğinde bir önceki kafesten kalan lot yeni kafesin
     * basamağına çok yakın düşebilir. Yarım basamak, "aynı rakam" ile
     * "komşu basamak"ı ayıran doğal sınır.
     */
    const aralik = plan.gecerlilik && plan.gecerlilik.aralik;
    const doluMu = (taraf, fiyat) => {
      const lotlar = (durum[taraf] && durum[taraf].lotFiyatlari) || [];
      if (!lotlar.length || !sayiMi(aralik) || !(aralik > 0)) return false;
      return lotlar.some(lf => Math.abs(lf - fiyat) < aralik / 2);
    };

    for (const taraf of ['long', 'short']) {
      const d = durum[taraf];
      if (!d || !d.yapi || d.kalan <= 0) continue;
      const liste = plan.seviyeler
        .filter(s => s.yon === taraf)
        .filter(s => (taraf === 'long' ? s.fiyat >= d.yapi.taban : s.fiyat <= d.yapi.taban))
        .filter(s => dogruTaraf(taraf, s.fiyat))
        .filter(s => !doluMu(taraf, s.fiyat))
        .slice(0, d.kalan);
      if (!liste.length) continue;

      /**
       * KADEME STOP ORANI — kullanıcının kuralı, tek satırda:
       * "90'dan 30'a %kaç düştüyse, her kademe kendi girişinden o kadar
       * düşünce kapanır." Buradaki 90, tarafı AÇACAK olan basamaktır
       * (merkeze en yakın olan); 30 ise yapısal stop.
       *
       * Oran geçersizse (stop, ilk basamağın yanlış tarafında) o taraf hiç
       * açılmaz — stopu girişin ötesinde bir emir, girer girmez kapanırdı.
       */
      const ilk = liste[0];
      const oran = taraf === 'long'
        ? (ilk.fiyat - d.yapi.stop) / ilk.fiyat
        : (d.yapi.stop - ilk.fiyat) / ilk.fiyat;
      if (!(oran > 0 && oran < 1)) continue;
      d.oran = oran;
      secilen.push(...liste);
    }
    return secilen;
  }

  /**
   * Plan → motor emirleri.
   *
   * `planEmirleri` DCA ile birebir uyum için yalnızca dört alan üretiyor
   * (`id · side · limitPrice · qty`) ve o sözleşme F4'ün bitti ölçütü —
   * genişletilemez. Grid'e özel alanlar bu yüzden BURADA biniyor; emrin
   * gövdesi yine planlayıcıdan geliyor, burada yeniden kurulmuyor.
   */
  emirler(plan, secilen, p, durum) {
    const temel = planEmirleri(plan);
    const harita = new Map(plan.seviyeler.map((s, k) => [s, temel[k]]));

    return secilen.map((s) => {
      const e = { ...harita.get(s) };
      const d = durum[s.yon];

      // Kademe stop oranı: motor bunu pozisyonu AÇAN emirde dondurur.
      if (d && d.oran > 0) e.lotStopPct = d.oran;

      if (p.tpModu === 'ilkSeviye' && sayiMi(s.tp) && sayiMi(s.fiyat) && s.fiyat > 0) {
        // Motor YÜZDE bekliyor, fiyat değil — ve yönü kendisi çeviriyor.
        // Mesafenin kendisi ATR'den geldiği için hedef de ATR bazlıdır.
        const yuzde = Math.abs(s.tp - s.fiyat) / s.fiyat * 100;
        if (yuzde > 0) e.takeProfitPct = yuzde;
      }
      return e;
    });
  }

  /* ═══ ÇIKIŞ ════════════════════════════════════════════════════════════ */

  /**
   * Taraf başına hedef/stop güncellemesi — bar başına EN ÇOK BİR TARAF.
   *
   * Neden kuyruk: motor `signal.side` ile tek taraf kabul ediyor. Sıradaki
   * taraf round-robin ile seçiliyor ve ertelenen her güncelleme sayılıyor.
   *
   * @returns {object|null} { side, updateTarget?, updateStop? }
   */
  cikisGuncellemesi(pozLong, pozShort, atr, p) {
    const adaylar = [];
    for (const [yon, poz] of [['long', pozLong], ['short', pozShort]]) {
      if (!poz) { this.sonHedef[yon] = null; continue; }
      const istek = this.tarafGuncellemesi(yon, poz, atr, p);
      if (istek) adaylar.push(istek);
    }
    if (!adaylar.length) return null;

    // Round-robin: sıradaki taraf varsa o, yoksa eldeki tek aday.
    const secili = adaylar.find(a => a.side === this.siradaki) || adaylar[0];
    this.siradaki = secili.side === 'long' ? 'short' : 'long';
    this.ertelenenGuncelleme += adaylar.length - 1;

    if (sayiMi(secili.updateTarget)) this.sonHedef[secili.side] = secili.updateTarget;
    return secili;
  }

  /**
   * Bir tarafın hedefi DEĞİŞTİYSE güncelleme isteği üretir.
   *
   * STOP BURADA YOK — ve bu kasıtlı. Kullanıcı kararı (2026-09-08): stop
   * bakiye bazlı ya da tek seviyeli olmayacak, her kademe kendi girişinden
   * aynı oranda düşünce kapanacak. O kural emirle motora geçiyor
   * (`lotStopPct`) ve bar İÇİNDE işliyor; buradan bar kapanışında ikinci bir
   * stop bildirmek aynı riski iki kez yönetmek olurdu.
   */
  tarafGuncellemesi(yon, poz, atr, p) {
    if (p.tpModu !== 'ortalama' || !(p.tpAtr > 0)) return null;
    if (!sayiMi(poz.entryPrice) || !sayiMi(atr) || !(atr > 0)) return null;

    /**
     * 'ortalama' modunda hedef pozisyonun ORTALAMASINA asılıdır ve her yeni
     * dolumda kayar — DCA'nın anlamı budur. Mesafe ATR cinsinden: kullanıcı
     * kararı gereği kâr alma seviyeleri yüzde değil ATR bazlı.
     * 'ilkSeviye' modunda hedef emirle birlikte kondu, burada dokunulmaz.
     */
    const mesafe = p.tpAtr * atr;
    const hedef = yon === 'short' ? poz.entryPrice - mesafe : poz.entryPrice + mesafe;
    if (this.sonHedef[yon] !== null && Math.abs(hedef - this.sonHedef[yon]) <= 1e-9) return null;
    return { side: yon, updateTarget: hedef };
  }

  /** Sinyale güncelleme ve gösterge izini bindirir. */
  sinyalle(sinyal, guncelleme, gostergeler) {
    /**
     * ÇAPA İZİ EN SONDA TAZELENİR.
     *
     * `gostergeler` bar başında kuruluyor, `planKur` ise SONRA çalışıp
     * çapayı güncelleyebiliyor. Tazelenmezse iz bir plan geriden gelir:
     * grafikte görünen çapa, o barda fiilen kullanılan çapa olmaz. Testte
     * yakalandı — "çapa aynı ama fiyatlar kafeste değil" diyen bulgu buydu,
     * kafes doğruydu, İZ yanlıştı.
     */
    gostergeler.izgaraCapa = sayiMi(this.izgaraCapa) ? +this.izgaraCapa.toFixed(6) : null;
    gostergeler.izgaraYenileme = this.izgaraYenileme;

    sinyal.indicators = gostergeler;
    if (guncelleme) {
      sinyal.side = guncelleme.side;
      if (sayiMi(guncelleme.updateTarget)) sinyal.updateTarget = guncelleme.updateTarget;
    }
    return sinyal;
  }
}

/**
 * Isınma: bağlam katmanlarının en uzunu. `poc` 200 barlık pencere istiyor,
 * `eq` 60, salınımlar ATR+1. Kaynağa göre değişiyor çünkü sabit bir sayı ya
 * gereksiz bekletir ya da hazır olmayan çizgiyle işlem açtırır.
 */
GridDcaStrategy.warmupBars = (cfg = {}) => {
  const kaynak = cfg.referansKaynagi || 'ema';
  const taban = { poc: 210, eq: 70, avwap: 60, vwap: 40, ema: (+cfg.referansPeriod || 50) + 20 }[kaynak] || 70;
  return Math.max(taban, 60);
};

/**
 * AYAR UYARILARI — sessiz sürprizleri önceden söyler.
 *
 * `dca_bot`ta öğrenilen ders: kullanıcı sıfır sonuç alıp sebebini
 * bilemiyordu. Buradaki tuzaklar farklı ama aynı cinsten.
 */
GridDcaStrategy.configWarnings = (cfg = {}) => {
  const u = [];
  const p = new GridDcaStrategy(cfg).cfg();

  /**
   * Hedge artık strateji bildirimiyle kendiliğinden açılıyor
   * (`requiresHedge`), yani uyarı yalnızca AÇIKÇA kapatıldığında anlamlı.
   * Eskiden `hedge !== true` diye bakılıyordu ve panelden gelen HER koşuda
   * uyarı çıkıyordu — doğru uyarıydı ama düzeltilecek yer strateji değil
   * motordu.
   */
  if (cfg.hedge === false && p.yon === 'iki') {
    u.push('Yön "iki" ama `hedge` AÇIKÇA kapatılmış — ikinci tarafın emirleri'
      + ' TERS YÖN sayılıp yok sayılır. Grid tek bacakla koşar; bu bir kontrol'
      + ' koşusudur, botun kendisi değildir.');
  }
  /**
   * Basamak aralığı tipik mum menzilinden darsa merdiven yayılamaz — tek
   * mum birkaç basamağı birden süpürür. Ölçülen medyan menzil 0.86 ATR.
   */
  if (p.adimAtr < 1.0) {
    u.push(`Basamak aralığı ${p.adimAtr} ATR — ölçülen medyan mum menzili 0.86 ATR,`
      + ' %90 dilimi 1.67. Bu kadar dar bir basamakta tek mum birkaç basamağı birden'
      + ' süpürür; girişler tek bara yığılır ve merdiven yayılmaz.');
  }
  if (p.tpModu === 'ortalama' && !(p.tpAtr > 0)) {
    u.push('TP modu "ortalama" ama TP mesafesi 0 ATR — pozisyonun hedefi hiç kurulmaz.');
  }
  /**
   * Kâr alma ARTIK YÜZDE DEĞİL. Eski ayarı taşıyan bir yapılandırma sessizce
   * varsayılana düşerdi ve kullanıcı seçtiğini sandığı hedefle koşmazdı.
   */
  if (cfg.tpYuzde !== undefined) {
    u.push('`tpYuzde` kaldırıldı — kâr alma seviyeleri ATR bazlı (`tpAtr`). Verdiğiniz değer YOK SAYILDI.');
  }
  if (cfg.stopYuzde !== undefined) {
    u.push('`stopYuzde` kaldırıldı — stop artık KADEME bazlı: her kademe kendi girişinden'
      + ' aynı oranda düşünce kapanır, oran yapısal stoptan türer (`yapiSeviyesi` + `stopTamponAtr`).');
  }
  if (p.egilim === 'dalga' && p.egilimBonus >= p.kademeSinir) {
    u.push(`Eğilim bonusu (${p.egilimBonus}) kademe sınırından (${p.kademeSinir}) küçük değil —`
      + ' expansion geldiğinde ters taraf tamamen kapanır. Kasıtlıysa sorun yok, değilse bonusu düşürün.');
  }
  if (p.tpModu === 'ilkSeviye' && p.tpAdim > p.kademe) {
    u.push(`TP adımı (${p.tpAdim}) kademe sayısından (${p.kademe}) büyük — en dış basamağın`
      + ' hedefi merkezin ötesine düşer. Geçersiz değil ama grid\'in "bir adım beride kâr al"'
      + ' anlamı kalmaz.');
  }
  if (p.kayma !== 'yerinde' && !(p.yenidenMerkezAtr > 0)) {
    u.push(`Kayma modu "${p.kayma}" ama yeniden merkezleme eşiği 0 —`
      + ' plan her barda yeniden kurulur, hiçbir emir dolacak kadar masada kalmaz.');
  }
  if (p.merkezKaynagi === 'rangeEq' && p.asimetri === 'kapali') {
    u.push('Merkez "range EQ" seçili: range YOKKEN plan hiç kurulmaz.'
      + ' Bu bir hata değil ama koşunun büyük bölümü boş geçebilir.');
  }
  if (p.htfCarpan > 0 && p.htfCarpan < 2) {
    u.push(`HTF çarpanı ${p.htfCarpan} — 2'nin altı zaman dilimi yükseltmez, MTF etkisiz kalır.`);
  }
  if ((p.aralikDilimi === 'htf' || p.yapiDilimi === 'htf') && p.htfCarpan < 2) {
    u.push('HTF dilimi seçili ama HTF çarpanı 2\'nin altında — LTF\'ye düşülür.');
  }

  /**
   * Merdivenin tamamı için gereken sermaye. Grid iki yanı birden diziyor,
   * yani DCA'nın iki katı kadar emir masaya konur.
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * BOYUT KÜNYESİ — "bu ayar ne kadar sermaye çalıştırır"
   * ═══════════════════════════════════════════════════════════════════════
   * Merdivende bu soru tek bir alana bakarak cevaplanamaz: taraf başına
   * kaç lot taşınacağı KADEME TAVANI + EĞİLİM BONUSU'ndan, her lotun boyutu
   * `tutar`dan, üst sınır ise TARAF TAVANI'ndan (K5) geliyor. Üçü birbirine
   * bakmadan ayarlanınca ya merdiven tavana dayanıp yarım kalıyor ya da
   * tavan hiç bağlamıyor ve K5 kâğıt üstünde kalıyor.
   */
  const yanSayisi = p.yon === 'iki' ? 2 : 1;
  const enCokLot = p.kademeSinir + (p.egilim === 'dalga' ? p.egilimBonus : 0);

  if (p.tutarTipi === 'Fixed') {
    const tarafBasi = p.tutar * enCokLot;
    const gerekenSermaye = tarafBasi / (p.tarafTavanPct / 100);
    u.push(`BOYUT: taraf başına en çok ${enCokLot} lot × ${p.tutar} = ${tarafBasi.toFixed(2)}`
      + ` · iki yan birden ${(tarafBasi * yanSayisi).toFixed(2)}.`
      + ` Taraf tavanı %${p.tarafTavanPct} olduğuna göre başlangıç sermayesi en az`
      + ` ${gerekenSermaye.toFixed(2)} olmalı — altında kalırsa merdiven tavana dayanıp`
      + ' derinleşmeyi durdurur (emirler REDDEDİLİR, künyede sayılır).');
  } else {
    const tarafBasiPct = p.tutar * enCokLot;
    u.push(`BOYUT: taraf başına en çok ${enCokLot} lot × %${p.tutar} = sermayenin`
      + ` %${tarafBasiPct.toFixed(0)}'i · iki yan birden %${(tarafBasiPct * yanSayisi).toFixed(0)}.`);
    if (tarafBasiPct > p.tarafTavanPct) {
      u.push(`Taraf başına istenen (%${tarafBasiPct.toFixed(0)}) taraf tavanını`
        + ` (%${p.tarafTavanPct}) AŞIYOR — merdivenin alt basamakları hiç dolmaz.`);
    }
    if (tarafBasiPct * yanSayisi > 100) {
      u.push(`İki yanın toplamı sermayenin %${(tarafBasiPct * yanSayisi).toFixed(0)}'i`
        + ' — %100 üstü karşılanamaz.');
    }
  }
  if (p.tarafTavanPct * yanSayisi > 100) {
    u.push(`Taraf tavanı %${p.tarafTavanPct} × ${yanSayisi} yön = %${p.tarafTavanPct * yanSayisi}`
      + ' — iki taraf birden dolarsa sermayeden fazlası istenir. Nakit yetmediğinde'
      + ' emirler sessizce değil, "sermaye yetmedi" sayacıyla düşer.');
  }
  return u;
};

GridDcaStrategy.paramSchema = {
  merkezKaynagi: { type: 'enum', values: ['referans', 'rangeEq'], default: 'referans', label: 'Grid merkezi (K2)', group: 'Merkez', description: '"rangeEq" seçiliyken AKTİF range yoksa plan kurulmaz.' },
  referansKaynagi: { type: 'enum', values: ['ema', 'vwap', 'avwap', 'eq', 'poc'], default: 'vwap', label: 'Referans hattı kaynağı', group: 'Merkez', description: 'Yalnızca merkez "referans" iken. Varsayılan VWAP: ölçümde VWAP merkezli grid ağırlıklı olarak HEDEFTE kapanıyor, EMA merkezli ise kademe stopunda.' },
  referansPeriod: { type: 'number', default: 50, min: 2, step: 1, label: 'Referans periyodu', group: 'Merkez' },

  yon: { type: 'enum', values: ['iki', 'long', 'short'], default: 'iki', label: 'Yön', group: 'Merdiven', description: '"iki" seçiliyken motor hedge\'i KENDİLİĞİNDEN açar (`requiresHedge`); ayrıca bir şey yapmanız gerekmez.' },
  kademe: { type: 'number', default: 4, min: 1, max: 20, step: 1, label: 'Her yanda basamak', group: 'Merdiven' },
  adimAtr: { type: 'number', default: 2.0, min: 0.05, step: 0.05, label: 'Basamak aralığı (ATR katı)', group: 'Merdiven', description: 'Mum menzili / ATR ölçüldü: medyan 0.86, %90 dilimi 1.67. Basamak bundan DAR olursa tek mum birkaç basamağı birden süpürür ve merdiven yayılmaz.' },
  tutar: { type: 'number', default: 100, min: 0, step: 1, label: 'Basamak tutarı', group: 'Boyut', description: '"Fixed" iken dolar, "% of equity" iken sermayenin yüzdesi — BASAMAK BAŞINA.' },
  tutarTipi: { type: 'enum', values: ['Fixed', '% of equity'], default: 'Fixed', label: 'Tutar tipi', group: 'Boyut' },
  tarafTavanPct: { type: 'number', default: 50, min: 1, max: 100, step: 1, label: 'Taraf başına sermaye tavanı (%)', group: 'Boyut', description: 'K5: her yön başlangıç sermayesinin en çok bu kadarını bağlayabilir. Tavana dayanan taraf yeni lot almaz (emir REDDEDİLİR, kısılmaz — basamak tutarları arasındaki oran merdivenin kendisidir).' },

  tpModu: { type: 'enum', values: ['ilkSeviye', 'ortalama'], default: 'ilkSeviye', label: 'TP modu (K4)', group: 'Çıkış', description: 'İkisi de ATR bazlı. "ilkSeviye": tarafı açan basamağın bir adım berisi, emirle konur. "ortalama": ortalamadan `tpAtr` kadar, her dolumda kayar.' },
  tpAdim: { type: 'number', default: 1, min: 1, max: 10, step: 1, label: 'TP kaç basamak beride', group: 'Çıkış', description: 'Yalnızca "ilkSeviye" modunda. Basamak aralığı ATR katı olduğu için hedef de ATR bazlıdır.' },
  tpAtr: { type: 'number', default: 1.0, min: 0, step: 0.1, label: 'TP mesafesi (ATR katı)', group: 'Çıkış', description: 'Yalnızca "ortalama" modunda.' },

  kademeSinir: { type: 'number', default: 5, min: 1, max: 30, step: 1, label: 'Taraf başına kademe tavanı', group: 'Kademe', description: 'Bir pozisyona en fazla kaç kez eklenir. Masaya konan emir sayısı da bununla kısılır.' },
  yapiSeviyesi: { type: 'enum', values: ['swing', 'range'], default: 'swing', label: 'Alım tabanı ve stop nereden', group: 'Kademe', description: 'Alım bu seviyenin ötesine geçmez; stop bunun `stopTamponAtr` kadar ötesidir.' },
  stopTamponAtr: { type: 'number', default: 1.0, min: 0, step: 0.1, label: 'Stop tamponu (ATR katı)', group: 'Kademe', description: 'Yapı seviyesinin ne kadar ötesi "kırıldı" sayılır.' },

  egilim: { type: 'enum', values: ['dalga', 'kapali'], default: 'dalga', label: 'Yön eğilimi', group: 'Dalga', description: 'Expansion yönünde kademe tavanı açılır, ters yönde kısılır. İki taraf da çalışmaya devam eder — bu SERT bir kapı değil.' },
  expansiyonAtr: { type: 'number', default: 2.0, min: 0.1, step: 0.1, label: 'Expansion eşiği (dalga boyu, ATR)', group: 'Dalga' },
  egilimBonus: { type: 'number', default: 2, min: 0, max: 20, step: 1, label: 'Eğilim kademe farkı', group: 'Dalga', description: 'Expansion yönündeki tarafa eklenir, ters taraftan düşülür.' },

  kayma: { type: 'enum', values: ['yenidenKur', 'yerinde', 'iptal'], default: 'yenidenKur', label: 'Merkez kayınca (K3)', group: 'Kayma', description: 'Açık POZİSYONA hiçbir modda dokunulmaz; yalnızca dolmamış emirler. "yerinde" KONTROL GRUBUDUR — plan hiç kaymaz ve bot neredeyse atıl kalır.' },
  yenidenMerkezAtr: { type: 'number', default: 1.5, min: 0.1, step: 0.1, label: 'Yeniden merkezleme eşiği (ATR)', group: 'Kayma' },

  asimetri: { type: 'enum', values: ['kapali', 'yapi', 'range'], default: 'kapali', label: 'Yapı kapısı', group: 'Yapı', description: '"yapi": yükselen yapıda yalnızca long, alçalanda yalnızca short. "range": yalnızca aktif range içinde.' },

  htfCarpan: { type: 'number', default: 0, min: 0, max: 24, step: 1, label: 'HTF çarpanı (K6) [0 = kapalı]', group: 'MTF' },
  aralikDilimi: { type: 'enum', values: ['ltf', 'htf'], default: 'ltf', label: 'Aralığı belirleyen dilim', group: 'MTF' },
  yapiDilimi: { type: 'enum', values: ['ltf', 'htf'], default: 'ltf', label: 'Yapıyı belirleyen dilim', group: 'MTF' },

  atrPeriod: { type: 'number', default: 14, min: 2, step: 1, label: 'ATR periyodu', group: 'Genel' }
};

/**
 * OPTİMİZASYON IZGARASI — panelin "optimize et" düğmesi bunu okur.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IZGARA DAR VE BİLEREK ÖYLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 3 parametre × 3 değer = 27 bileşim. Seçilen üçü, F8 ölçümünün teşhis
 * adayını doğrudan hedefliyor (§6.2): kayıp yönden değil MALİYETTEN geliyor
 * gibi görünüyor, çünkü long ve short neredeyse eşit kaybediyor ve sayı
 * varlıklar arasında tekdüze. Üçü de "deal başına kaç bacak açılıyor"ı
 * değiştiriyor:
 *
 *   adimAtr      basamaklar birbirinden uzaklaşır → daha az dolum
 *   kademeSinir  bir pozisyona daha az ekleme → daha az bacak
 *   tpAdim       hedef uzaklaşır → daha az gidiş-dönüş
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIŞARIDA BIRAKILANLAR — ve nedenleri
 * ═══════════════════════════════════════════════════════════════════════════
 * · `tutar` / `tutarTipi` — bunlar POZİSYON BOYUTUDUR. Aranırsa koşular
 *   arasında sermaye uyumu bozulur ve sonuçlar kıyaslanamaz hâle gelir
 *   (`dcaBotStrategy.optimizeGrid`de aynı gerekçe yazılı).
 * · `referansKaynagi` — K2 bir KARARDIR (kullanıcı, VWAP), parametre değil.
 *   Altı merkezi yarıştırmak parametre aramasının ta kendisi olurdu.
 * · `kayma` — kayan grid botun tanımı (§2); `yerinde` kontrol grubudur.
 *
 * ⚠ Bu ızgara bir GEREKÇE üretmez, yalnızca sıralama. Bu depoda bir değerin
 * benimsenmesi için boyutun ayrıştırıcı olması ve değerin tek varlıkta değil
 * DIŞARIDA da geçmesi şart (`PLAN-RANGE-VPFR.md` §11 md.3). Strateji henüz
 * kill kriterinden geçmedi; buradan çıkan "en iyi" satır varsayılan yapılmaz.
 */
/**
 * BU STRATEJİ HEDGE İSTER — ve bunu kendisi söyler.
 *
 * `hedge` bir motor ayarı ve hiçbir `paramSchema`da yok, yani panelden gelen
 * koşularda asla açılmıyordu. Sonuç ölçüldü: BTC 5m koşusunda **1227 emir**
 * "ters yön" sayılıp yok sayıldı — short bacağının tamamı. Panel, ölçülen
 * bottan bambaşka bir şey gösteriyordu.
 *
 * Kullanıcıya kutu işaretletmek çözüm değil: iki yönlü olmak bu botun
 * TANIMI. `yon: 'iki'` iken hedge zorunludur; tek yön seçildiyse gerekmez.
 *
 * Kullanıcı `hedge: false` diye AÇIKÇA yazarsa motor ona uyar (tek bacaklı
 * kontrol koşusu meşru bir istektir) ama künyeye uyarı düşer.
 */
GridDcaStrategy.requiresHedge = (cfg = {}) => (cfg.yon || 'iki') === 'iki';

GridDcaStrategy.optimizeGrid = {
  adimAtr: [0.3, 0.5, 0.9],
  kademeSinir: [3, 5, 8],
  tpAdim: [1, 2, 3]
};

module.exports = GridDcaStrategy;
