const { register } = require('../registry');
const { clean } = require('../contract');

/**
 * RANGE YAPISI — birbirinden bağımsız, beş seviyeli range'ler.
 *
 * Tasarım planı: `PLAN-RANGE.md`. İlk sürüm bar bar hesaplanan bir gösterge
 * (MA/BB gibi) olarak yazılmıştı ve havuzdaki `swings` göstergesi kullanıldığı
 * için ATR ile pivot kavramları da içeri sızmıştı. İkisi de tarifte yoktu.
 * Bu sürümde HİÇBİR dış göstergeye bağımlılık yok: salınım tespiti tek bir
 * eşikle, burada yapılıyor.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SALINIM TESPİTİ — tek eşik, ATR yok, pivot yok
 * ─────────────────────────────────────────────────────────────────────────
 * Zigzag mantığı: bir uçtan EŞİK kadar ters yöne gidilirse o uç bir salınım
 * noktasıdır. Eşik yüzde (`thresholdPct`) ya da sabit tutar (`thresholdAbs`)
 * olabilir. Noktalar zorunlu olarak alternatiftir: dip → tepe → dip…
 *
 * İLERİYE BAKMA YOK: bir uç, dönüşün eşiği aştığı BARDA bilinir ve o barın
 * indeksi `confirmedAt` olur. Uç noktanın kendisi geçmişte kalır (`index`),
 * ama yapı ondan önce kullanılamaz.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RANGE YAŞAM DÖNGÜSÜ
 * ─────────────────────────────────────────────────────────────────────────
 *   ÇAPA        Son onaylanmış salınım noktası. Dip ise `rangeLow` sabittir ve
 *               üst taraf büyür; tepe ise `rangeHigh` sabittir ve alt taraf
 *               büyür. Çapa tarafı ASLA değişmez.
 *
 *   DOĞUM       Çapadan sonra fiyat eşiği aştığı anda range kurulur. İkinci
 *               seviye, o ana kadarki uç noktadır.
 *
 *   BÜYÜME      İkinci seviyeyi aşan yeni bir uç geldikçe ikinci seviye
 *               güncellenir; range ve EQ birlikte kayar.
 *
 *   KİLİTLENME  Fiyat EQ seviyesine dönüp orada KAPANDIĞINDA ikinci seviye
 *               kesinleşir ve bir daha değişmez. Bu kural yapıyı nihai hâle
 *               getirir; olmasaydı ikinci seviye sonsuza dek büyür, o taraftaki
 *               sapma seviyesi de onunla kayar ve range o yönden HİÇ ölemezdi.
 *               (`lockOn: 'touch'` ile fitil yeterli hâle getirilebilir, ama
 *               ölçüldü: fitille kilitlemek büyüme aşamasını yok ediyor.)
 *
 *   ÖLÜM        İki aşamalı ve TÖLERANSLI:
 *                 1) İhlal — bir bar sapma seviyesinin ötesinde KAPANIR.
 *                    Range ölmez, `violated` durumuna geçer.
 *                 2) Ölüm  — ihlalden sonra `deathGraceBars` bar içinde fiyat
 *                    range'in içine dönmezse ölür. Dönerse ihlal silinir.
 *               Fitil delişleri ve tek barlık taşmalar range'i öldürmez.
 *
 *   YENİ RANGE  Ölüm barından SONRA onaylanan ilk salınım noktası yeni çapadır.
 *               Eski salınımlar yeniden kullanılmaz — iki yapının üst üste
 *               binmesini önleyen kural budur.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * YENİDEN ÇİZİM (`redraw`, varsayılan KAPALI)
 * ─────────────────────────────────────────────────────────────────────────
 * Range'in iki tarafı aynı şey DEĞİLDİR:
 *   · ÇAPA tarafı yapının dayanağıdır. Oradan ihlal = yapı kırıldı.
 *   · İKİNCİ SEVİYE bizim ÇİZDİĞİMİZ taraftır, bir tahmindir. Oradan ihlal
 *     "yapı bozuldu" değil, "tahminimiz kısa kalmış" demektir.
 *
 * İlk sürüm ikisine aynı muameleyi yapıyordu. ÖLÇÜLDÜ (8 varlık × 3 zaman
 * dilimi, `scripts/range-yeniden-cizim-olcum.js`): ölen kilitli range'lerin
 * **%37–47'si** ikinci seviye tarafından ihlal ediliyor ve ölümden sonra
 * doğan yeni range eski çapayı yalnızca **%0–7.5** oranında yeniden
 * kullanıyor. Yani geçerli bir çapa çöpe gidiyordu.
 *
 * Açıkken, ikinci seviye tarafından ihlal ÖLDÜRMEZ, ASKIYA ALIR:
 *   1. Range `suspended` durumuna geçer — işlem durur, yeni uç izlenir.
 *   2. Fiyat `redrawWindowBars` içinde range'e geri KAPANIRSA ikinci seviye
 *      yeni uca taşınır, range `forming`e döner ve normal kilit kuralıyla
 *      yeniden kilitlenmesi gerekir. Önce kilitlenmeden işlem açılamaz.
 *   3. Pencere dolarsa ölür (eski davranış).
 *   4. Askıdayken ÇAPA tarafı ihlal edilirse ANINDA ölür — dayanak gitmiştir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN GENİŞLİK TAVANI ZORUNLU
 * ─────────────────────────────────────────────────────────────────────────
 * Bu kural, `lockOn: 'swing'`in kapattığı geri beslemeyi geri çağırır: uzun
 * yaşayan range genişler, genişleyen range öldürülemez. (BTC 1d'de bir range
 * 1098 gün yaşamış, genişliği fiyatın %346'sına çıkmış ve `devLow` NEGATİFE
 * düşmüştü — aşağıdan ölmesi matematiksel olarak imkânsız hâle gelmişti.)
 *
 * Ölçülen genişleme: medyan 1.7–1.9×, %90 dilimi 2.2–3.4×, en büyüğü 6.3×.
 * Bu yüzden iki tavan var ve ikisi de ÖLÜM sebebidir:
 *   · `redrawMaxWidth` — yeni genişlik / İLK KİLİT genişliği. Kümülatiftir:
 *     her yeniden çizim orijinale göre ölçülür, bir öncekine göre değil.
 *     Yoksa 2× tavan üst üste binip 8× genişlik üretirdi.
 *   · `redrawMaxCount` — bir yapı kaç kez yeniden çizilebilir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SEVİYELER — katsayılar aralığın DİBİNDEN ölçülür
 * ─────────────────────────────────────────────────────────────────────────
 *   devLow −0.377 · rangeLow 0 · eq 0.5 · rangeHigh 1 · devHigh 1.377
 *
 * `devLow` pozitif verilir (0.377) ve dibin ALTINA uygulanır; iki sapma da
 * sınırından aynı uzaklıktadır.
 *
 * ÇİZİM: yalnızca `ranges` çizilir — her yapı, doğduğu bardan öldüğü bara kadar
 * beş düz yatay çizgi. Bar bar seriler botun okuması için üretilir ama
 * grafiğe ÇİZİLMEZ (`as: 'none'`); çizilseydi iki range arasında var olmayan
 * bir seviyeyi birleştiren çizgiler oluşurdu.
 */

/** Durum kodları — `state` serisinde sayı olarak taşınır. */
const DURUM = { yok: 0, forming: 1, locked: 2, violated: 3, suspended: 4 };

register({
  key: 'range_tool',
  label: 'Range Yapısı',
  group: 'yapi',
  kind: 'zones',
  outputs: [
    'ranges', 'swingLevels', 'swingPoints',
    'rangeHigh', 'rangeLow', 'eq', 'devHigh', 'devLow', 'position', 'state', 'threshold'
  ],
  seriesOutputs: ['rangeHigh', 'rangeLow', 'eq', 'devHigh', 'devLow', 'position', 'state', 'threshold'],
  dependsOn: [],
  params: {
    /**
     * EŞİK — salınım tespitinin ve range doğumunun TEK ölçüsü.
     *
     * 'auto' modu: son `autoLookback` barın MEDYAN mum aralığının
     * `autoMultiple` katı. ATR değil (ortalama gerçek aralık değil, medyan
     * göreli aralık) ama aynı işi görür: eşiği zaman diliminin kendi
     * volatilitesine bağlar. Neden gerekli — ölçüldü: BTC'de medyan bar
     * aralığı 1d'de %4.03, 1h'te %0.51, 5m'de %0.07. Sabit %2 eşik 1d'de
     * gürültü üretirken 5m'de 500 barda tek bir salınım buluyordu.
     *
     * MEDYAN, ortalama değil: tek bir haber mumu ortalamayı yukarı çeker ve
     * eşik günlerce yanlış kalır.
     */
    thresholdMode: { type: 'enum', values: ['auto', 'percent', 'absolute'], default: 'auto' },
    thresholdPct: { type: 'number', default: 2.0, min: 0.05 },
    thresholdAbs: { type: 'number', default: 0, min: 0 },
    autoLookback: { type: 'number', default: 100, min: 10 },
    autoMultiple: { type: 'number', default: 3.0, min: 0.5 },

    /**
     * Salınım kendi barında onaylanabilir mi?
     *
     * Kapalıyken (varsayılan) tek bir mumun kendi yüksek–düşük aralığı eşiği
     * aşarsa o mum tek başına hem ucu kurar hem onaylar (`confirmDelay = 0`).
     * Ölçüldü: salınımların %9–23'ü böyle ve 4–10 bar hem dip hem tepe taşıyor.
     * Açıldığında onay EN AZ bir sonraki barda olur; tek mumluk salınımlar
     * elenir, onay bir bar gecikir.
     */
    requireLaterConfirm: { type: 'boolean', default: false },

    // Seviye katsayıları
    eqLevel: { type: 'number', default: 0.5, min: 0, max: 1 },
    devHigh: { type: 'number', default: 1.377, min: 1 },
    devLow: { type: 'number', default: 0.377, min: 0 },

    // Yorum kararları — hepsi tek satırda değiştirilebilir (bkz. PLAN-RANGE.md)
    // KİLİTLENME KAPANIŞLA (kullanıcı kararı, ölçüme dayanarak).
    // İlk sürümde `touch` idi — tarif "EQ'ya geldiğinde" olduğu için. Ölçüldü:
    // fitille kilitlemek büyüme aşamasını pratikte yok ediyordu (BTC 1d, eşik
    // %5: kilit gecikmesi 4.2 bar; kapanışla 11.0 bar). İkinci seviyenin
    // gerçekten büyüyebilmesi için kapanış şartı gerekiyor.
    /**
     * 'swing' seçeneği ÖLÇÜLMÜŞ BİR SORUNA karşı eklendi: EQ'ya dönüşle
     * kilitlemek, trendde ikinci seviyenin yıllarca büyümesine izin veriyor.
     * BTC 1d'de bir range 1098 gün yaşadı, genişliği fiyatın %346'sına çıktı ve
     * `devLow` NEGATİFE düştü — yani aşağıdan ölmesi matematiksel olarak
     * imkânsız hâle geldi. Geri besleme: uzun yaşayan range genişler, genişleyen
     * range öldürülemez.
     *
     * 'swing': ikinci seviye, zigzag onu bir salınım ucu olarak ONAYLADIĞINDA
     * kilitlenir. Kendi içinde tutarlı — ikinci seviye zaten bir salınım ucudur
     * ve onun ne zaman "gerçek" olduğunu eşik belirler.
     */
    lockOn: { type: 'enum', values: ['close', 'touch', 'swing'], default: 'close' },
    violationOn: { type: 'enum', values: ['close', 'wick'], default: 'close' },
    returnInto: { type: 'enum', values: ['range', 'deviation'], default: 'range' },
    deathGraceBars: { type: 'number', default: 5, min: 1 },

    /**
     * YENİDEN ÇİZİM — varsayılan KAPALI.
     *
     * Kapalı bırakılmasının sebebi ölçüm tekrarlanabilirliği: 2026-08-14'ten
     * önceki tüm range ve strateji ölçümleri bu davranış olmadan çıktı.
     * Yeni bot bunu AÇIKÇA geçecek.
     */
    redraw: { type: 'boolean', default: false },
    /** İhlalden sonra range'e dönüş için tanınan bar sayısı. */
    redrawWindowBars: { type: 'number', default: 50, min: 1 },
    /** Yeni genişlik / İLK KİLİT genişliği tavanı. Aşılırsa range ölür. */
    redrawMaxWidth: { type: 'number', default: 2.0, min: 1 },
    /**
     * Bir yapının kaç kez yeniden ÖLÇÜLEBİLECEĞİ. Askı yolu ve tölerans yolu
     * AYNI bütçeyi paylaşır: ikisi de "seviyeyi yanlış çizmişiz, düzelt"
     * demektir; ayrı bütçe vermek aynı yapının iki kapıdan toplam 4 kez
     * genişlemesine izin verirdi.
     */
    redrawMaxCount: { type: 'number', default: 2, min: 0 },

    /**
     * ÖLÜM DÖŞEĞİNDEN KALKAN RANGE YENİDEN ÖLÇÜLSÜN MÜ (varsayılan KAPALI)
     *
     * `deathGraceBars` içinde range'e dönen bir yapı şu ana kadar ESKİ
     * seviyeleriyle yaşamaya devam ediyordu. Oysa fiyat sapmaya taşıp geri
     * döndüyse o taşma, sınırın gerçekte nerede olduğunu gösteren yeni
     * bilgidir — sınırı olduğu yerde bırakmak o bilgiyi çöpe atar.
     *
     * Açıkken: ihlal edilen sınır, taşmanın ULAŞTIĞI UCA taşınır ve range
     * yeniden ölçeklenir (EQ ve sapma seviyeleri onunla birlikte kayar).
     *
     * `redrawMaxWidth` ve `redrawMaxCount` burada da geçerlidir — aynı
     * ratchet tehlikesi var, aynı tavanlar korur.
     */
    rescaleOnRevive: { type: 'boolean', default: false },
    /**
     * HANGİ SINIR taşınabilir:
     *   'second' — yalnızca ikinci seviye (bizim çizdiğimiz taraf)
     *   'both'   — çapa tarafı da taşınabilir
     *
     * 'both' bilinçli bir istisnadır: "çapa ASLA değişmez" kuralı BÜYÜME
     * aşaması içindir (yoksa yapı bir yere sabitlenemezdi). Kilitli bir
     * yapıda çapanın delinip geri dönülmesi ise farklı bir olaydır —
     * dayanağın gerçekte biraz daha aşağıda/yukarıda olduğunu gösterir.
     */
    rescaleSides: { type: 'enum', values: ['second', 'both'], default: 'both' },
    /**
     * Yeniden ölçeklenen yapı tekrar KİLİTLENMEYİ beklesin mi?
     *
     * Açıkken (varsayılan) yapı `forming`e döner ve normal kilit kuralıyla
     * yeniden kilitlenmeden işlem açılmaz. Gerekçesi tasarımın kendi kuralı:
     * yeni taşınmış bir sınır henüz TAHMİNDİR, kilit onu kesinleştirir.
     * Kapatılırsa yapı kilitli kalır ve yeni seviyelerle hemen ticaret edilir.
     */
    rescaleRelock: { type: 'boolean', default: true },

    maxRanges: { type: 'number', default: 50, min: 1 }
  },
  warmup: () => 2,
  note: 'Salınım tespiti tek eşikle yapılır (ATR/pivot yok). İkinci seviye EQ\'ya gelince kilitlenir. Ölüm töleranslı: ihlalden sonra `deathGraceBars` bar içinde range\'e dönülmezse. `redraw` açıkken ikinci seviye tarafından ihlal öldürmez, ASKIYA alır: range\'e dönülürse ikinci seviye yeni uca taşınıp yapı yeniden kilitlenmeyi bekler (genişlik ve sayı tavanına tabi).',
  render: {
    ranges: { pane: 'price', as: 'zones', label: 'Range yapıları' },
    // Salınım seviyeleri: her salınım, kendi barından ONAY barına kadar uzanan
    // kısa yatay bir çizgi. "Salınımlar doğru mu" sorusu ancak görülerek
    // cevaplanır; çizginin uzunluğu da onayın ne kadar geciktiğini gösterir.
    swingLevels: { pane: 'price', as: 'zones', label: 'Salınım seviyeleri' },
    // Aşağıdakiler bot içindir; grafiğe çizilmez.
    swingPoints: { pane: 'price', as: 'none', label: 'Salınım noktaları (ham)' },
    threshold: { pane: 'own', as: 'none', label: 'Kullanılan eşik (fiyat)' },
    rangeHigh: { pane: 'price', as: 'none', label: 'Range H' },
    rangeLow: { pane: 'price', as: 'none', label: 'Range L' },
    eq: { pane: 'price', as: 'none', label: 'EQ' },
    devHigh: { pane: 'price', as: 'none', label: 'Sapma +1.377' },
    devLow: { pane: 'price', as: 'none', label: 'Sapma −0.377' },
    position: { pane: 'own', as: 'none', label: 'Konum (0–1)' },
    state: { pane: 'own', as: 'none', label: 'Durum (0–3)' }
  },
  compute: (candles, p) => {
    const n = candles.length;

    /**
     * 'auto' eşik: son `autoLookback` barın MEDYAN göreli aralığı × katsayı.
     *
     * Pencere GERİYE bakar (`[i-N+1, i]`) — ileriye bakma yok. Her bar için
     * kendi eşiği hesaplanır, yani volatilite değiştikçe eşik de değişir.
     */
    const oranMedyan = new Array(n).fill(null);
    if (p.thresholdMode === 'auto') {
      const N = Math.floor(p.autoLookback);
      const oranlar = candles.map(c => (c.low > 0 ? (c.high - c.low) / c.low : 0));
      for (let i = 0; i < n; i++) {
        const bas = Math.max(0, i - N + 1);
        const pencere = oranlar.slice(bas, i + 1).sort((a, b) => a - b);
        oranMedyan[i] = pencere.length ? pencere[Math.floor(pencere.length / 2)] : 0;
      }
    }

    /** Eşik, FİYAT birimindedir. `i` bar indeksi, `fiyat` referans seviyedir. */
    const esik = (i, fiyat) => {
      if (p.thresholdMode === 'absolute') return p.thresholdAbs;
      if (p.thresholdMode === 'auto') return fiyat * (oranMedyan[i] || 0) * p.autoMultiple;
      return fiyat * (p.thresholdPct / 100);
    };

    // ── 1) Salınım noktaları (zigzag, tek eşik) ────────────────────────────
    const swingPoints = [];
    {
      let mod = 0;                                   // +1 tepe takip, −1 dip takip, 0 belirsiz
      let tepe = { price: candles[0].high, index: 0 };
      let dip = { price: candles[0].low, index: 0 };

      for (let i = 1; i < n; i++) {
        const c = candles[i];
        let atesledi = false;

        if (mod >= 0) {
          if (c.high >= tepe.price) tepe = { price: c.high, index: i };
          // Tepeden eşik kadar düşüş → tepe onaylandı.
          const e = esik(i, tepe.price);
          // `requireLaterConfirm`: uç ve onay aynı bar olamaz.
          const barUygun = !p.requireLaterConfirm || i > tepe.index;
          if (e > 0 && barUygun && (tepe.price - c.low) >= e) {
            swingPoints.push({ type: 'high', price: tepe.price, index: tepe.index, confirmedAt: i });
            mod = -1;
            dip = { price: c.low, index: i };
            atesledi = true;
          }
        }

        if (!atesledi && mod <= 0) {
          if (c.low <= dip.price) dip = { price: c.low, index: i };
          // Dipten eşik kadar yükseliş → dip onaylandı.
          const e = esik(i, dip.price);
          const barUygun = !p.requireLaterConfirm || i > dip.index;
          if (e > 0 && barUygun && (c.high - dip.price) >= e) {
            swingPoints.push({ type: 'low', price: dip.price, index: dip.index, confirmedAt: i });
            mod = 1;
            tepe = { price: c.high, index: i };
          }
        }
      }
    }

    // ── 2) Range yaşam döngüsü ─────────────────────────────────────────────
    const ranges = [];
    const rangeHigh = new Array(n).fill(null);
    const rangeLow = new Array(n).fill(null);
    const eq = new Array(n).fill(null);
    const devHighS = new Array(n).fill(null);
    const devLowS = new Array(n).fill(null);
    const position = new Array(n).fill(null);
    const state = new Array(n).fill(null);

    let si = 0;
    let capa = null;        // {type, price, index, confirmedAt}
    let aktif = null;
    let engelBar = -1;      // bundan önce onaylanan salınımlar çapa olamaz
    let uc = null;          // çapadan bu yana görülen uç fiyat
    let ucIndeks = null;    // o ucun barı (VPFR penceresinin diğer ucu)
    let sonrakiId = 1;

    /**
     * Ölüm kaydı. `aktif`i sıfırlamak ÇAĞIRANIN işidir (döngü değişkenleri
     * `engelBar`, `capa`, `uc` da orada temizlenir) — burada yalnızca yapının
     * kendi alanları yazılır.
     */
    const oldur = (r, i, c, sebep, neden = 'grace') => {
      r.endIndex = i;
      r.endTime = c.time;
      r.state = 'dead';
      r.active = false;
      r.invalidatedBy = sebep;
      /**
       * `invalidatedBy` HANGİ TARAFTAN öldüğünü söyler (devLow/devHigh),
       * `deathReason` ise HANGİ KURALIN öldürdüğünü. İkisi farklı sorular:
       * aynı taraftan ihlal, hakkı kalmışsa askıya alınıp pencere dolunca,
       * kalmamışsa `deathGraceBars` sonra öldürür.
       */
      r.deathReason = neden;
      // Çıktıyı şişirmesin: askı salınımları yalnızca ölüm anında, çapa
      // seçmek için gerekiyordu.
      r.askiSwingler = [];
    };

    /** Range'in beş seviyesini güncel uçtan hesaplar. */
    const seviyeleriKur = (r) => {
      const R = r.high - r.low;
      r.width = R;
      r.eq = r.low + p.eqLevel * R;
      r.devHigh = r.low + p.devHigh * R;
      r.devLow = r.low - p.devLow * R;
      r.levels = [
        { name: 'devLow', price: r.devLow },
        { name: 'eq', price: r.eq },
        { name: 'devHigh', price: r.devHigh }
      ];
    };

    for (let i = 0; i < n; i++) {
      const c = candles[i];

      // Bu barda bilinir hale gelen salınım noktaları
      // `swingKilidi`: bu barda, AKTİF range'in ikinci seviyesi yönünde bir
      // salınım onaylandı mı (lockOn: 'swing' bunu kullanır).
      let swingKilidi = false;
      while (si < swingPoints.length && swingPoints[si].confirmedAt <= i) {
        const nk = swingPoints[si];
        si++;
        /**
         * ASKIDAYKEN onaylanan salınımlar saklanır.
         *
         * Sebebi ölçüldü: askı penceresi (50 bar) boyunca `aktif` dolu olduğu
         * için bu salınımlar çapa olamadan tüketiliyordu ve pencere boşa
         * dolduğunda 50 barlık salınım geçmişi çöpe gidiyordu. Sonuç: 1h'te
         * toplam range 207 → 132. Kural 24 yapı kurtarırken 75 yapı
         * kaybettiriyordu.
         */
        if (aktif && aktif.suspendedAt !== null) aktif.askiSwingler.push(nk);
        if (aktif && !aktif.locked) {
          const beklenen = aktif.anchor === 'low' ? 'high' : 'low';
          if (nk.type === beklenen && nk.index >= aktif.startIndex) swingKilidi = true;
        }
        if (nk.confirmedAt < engelBar) continue;
        // Aktif range varken çapa DEĞİŞMEZ.
        if (!aktif) {
          capa = nk;
          uc = nk.price;
          ucIndeks = nk.index;
        }
      }

      // ── Aktif range: büyüme, kilitlenme, ihlal, ölüm ──
      if (aktif) {
        const dipCapali = aktif.anchor === 'low';

        // BÜYÜME (yalnızca kilitlenmeden önce)
        if (!aktif.locked) {
          // İkinci seviyenin BARI da saklanıyor: hacim profili (VPFR) çapa ile
          // ikinci swing arasına çekilecek, o pencere buradan geliyor.
          if (dipCapali && c.high > aktif.high) { aktif.high = c.high; aktif.extremeIndex = i; }
          if (!dipCapali && c.low < aktif.low) { aktif.low = c.low; aktif.extremeIndex = i; }
          seviyeleriKur(aktif);

          // KİLİTLENME
          let geldi;
          if (p.lockOn === 'swing') {
            // İkinci seviye, zigzag onu salınım ucu olarak onayladığında kesinleşir.
            // `swingKilidi` bu barda onaylanan uygun yönlü salınımı taşır.
            geldi = swingKilidi;
          } else if (p.lockOn === 'close') {
            geldi = dipCapali ? c.close <= aktif.eq : c.close >= aktif.eq;
          } else {
            geldi = dipCapali ? c.low <= aktif.eq : c.high >= aktif.eq;
          }
          if (geldi) {
            aktif.locked = true;
            aktif.lockedAt = i;
            aktif.state = 'locked';
            // İLK kilit genişliği saklanır: yeniden çizim tavanı hep buna
            // göre ölçülür, bir önceki genişliğe göre değil.
            if (aktif.kilitGenislik === null) aktif.kilitGenislik = aktif.high - aktif.low;
          }
        }

        // İHLAL / DÖNÜŞ / ÖLÜM
        const ustDeger = p.violationOn === 'wick' ? c.high : c.close;
        const altDeger = p.violationOn === 'wick' ? c.low : c.close;
        const altIhlal = altDeger < aktif.devLow;
        const ustIhlal = ustDeger > aktif.devHigh;
        const ihlalVar = altIhlal || ustIhlal;
        // Çapa dipteyse ÜST taraf bizim çizdiğimizdir, tersi de doğru.
        const ikinciTaraf = dipCapali ? 'devHigh' : 'devLow';
        const ihlalTarafi = altIhlal ? 'devLow' : (ustIhlal ? 'devHigh' : null);

        if (aktif.suspendedAt !== null) {
          // ── ASKIDA: yeni uç izlenir, range'e dönüş beklenir ──
          const capaIhlali = dipCapali ? altIhlal : ustIhlal;
          if (capaIhlali) {
            // Dayanak gitti: tölerans yok, anında ölür.
            oldur(aktif, i, c, dipCapali ? 'devLow' : 'devHigh', 'çapa ihlali');
            aktif = null; engelBar = i; capa = null; uc = null;
          } else {
            if (dipCapali) {
              if (c.high > aktif.yeniUc) { aktif.yeniUc = c.high; aktif.yeniUcIndeks = i; }
            } else {
              if (c.low < aktif.yeniUc) { aktif.yeniUc = c.low; aktif.yeniUcIndeks = i; }
            }

            // Dönüş RANGE'in kendisine bakar (`returnInto` değil): kullanıcı
            // tarifi "fiyat range içerisine girer" — sapma bölgesine dönmek
            // ikinci seviyenin doğrulanması sayılmaz.
            const icerde = c.close >= aktif.low && c.close <= aktif.high;

            if (icerde) {
              const capaFiyat = dipCapali ? aktif.low : aktif.high;
              const yeniGenislik = Math.abs(aktif.yeniUc - capaFiyat);
              const tavanAsildi = aktif.kilitGenislik > 0
                && (yeniGenislik / aktif.kilitGenislik) > p.redrawMaxWidth;

              if (tavanAsildi) {
                oldur(aktif, i, c, ihlalTarafi || ikinciTaraf, 'genişlik tavanı');
                aktif = null; engelBar = i; capa = null; uc = null;
              } else {
                // YENİDEN ÇİZİM: ikinci seviye yeni uca taşınır, yapı
                // `forming`e döner ve normal kilit kuralıyla yeniden
                // kilitlenmesi gerekir. Kilitlenmeden işlem açılamaz.
                if (dipCapali) aktif.high = aktif.yeniUc; else aktif.low = aktif.yeniUc;
                aktif.extremeIndex = aktif.yeniUcIndeks;
                seviyeleriKur(aktif);
                aktif.locked = false;
                aktif.lockedAt = null;
                aktif.state = 'forming';
                aktif.redrawCount++;
                aktif.redrawAt.push(i);
                aktif.suspendedAt = null;
                aktif.violatedAt = null;
                aktif.yeniUc = null;
                aktif.yeniUcIndeks = null;
                // Sonraki askı temiz başlasın: bu askının salınımları artık
                // kullanılmayacak, yapı yaşamaya devam ediyor.
                aktif.askiSwingler = [];
              }
            } else if ((i - aktif.suspendedAt) >= p.redrawWindowBars) {
              /**
               * Pencere boşa doldu: yapı ölür. Ama ASKI, NORMAL ÖLÜMDEN FAZLA
               * YAPI FEDA ETMEMELİ.
               *
               * `redraw` kapalıyken bu ihlal `deathGraceBars` sonra ölür ve
               * engel barı orada kurulurdu. Askı yüzünden engeli 50 bar ileri
               * taşımak, aradaki salınımların hepsini yakardı — ölçülen bedeli
               * buydu. Bu yüzden engel barı, kural kapalı olsaydı nerede
               * olacaksa oraya kurulur ve o bardan sonra onaylanan ilk salınım
               * yeni çapa olur.
               */
              const engel = aktif.suspendedAt + p.deathGraceBars;
              const yeniCapa = aktif.askiSwingler.find(s => s.confirmedAt >= engel) || null;
              oldur(aktif, i, c, ikinciTaraf, 'pencere doldu');
              aktif = null;
              engelBar = engel;
              capa = yeniCapa;
              if (yeniCapa) {
                /**
                 * Çapadan bu yana görülen uç yeniden kurulur: yapı doğumu
                 * "çapadan eşik kadar uzaklaşma" ile olduğu için bu uç
                 * olmadan doğum barı yanlış hesaplanırdı.
                 *
                 * Tarama ONAY barından başlar, salınımın kendi barından değil
                 * — normal yol da öyle yapıyor (`uc = nk.price` ataması
                 * `confirmedAt` barında olur). Salınım barından başlatmak bu
                 * yolu normalden cömert kılar ve aynı yapı iki farklı yoldan
                 * farklı doğum barı üretirdi.
                 */
                uc = yeniCapa.price;
                ucIndeks = yeniCapa.index;
                for (let j = yeniCapa.confirmedAt; j <= i; j++) {
                  if (yeniCapa.type === 'low') {
                    if (candles[j].high > uc) { uc = candles[j].high; ucIndeks = j; }
                  } else if (candles[j].low < uc) { uc = candles[j].low; ucIndeks = j; }
                }
              } else {
                uc = null;
              }
            }
          }
        } else if (aktif.violatedAt === null) {
          if (i > aktif.startIndex && ihlalVar) {
            /**
             * İkinci seviye tarafından ihlal + kilitli + hak kalmışsa ÖLÜM
             * değil ASKI. Diğer her durumda eski davranış aynen sürer.
             * `redraw` kapalıyken bu dal hiç çalışmaz.
             */
            const askiyaUygun = p.redraw
              && aktif.locked
              && ihlalTarafi === ikinciTaraf
              && aktif.redrawCount < p.redrawMaxCount;

            if (askiyaUygun) {
              aktif.suspendedAt = i;
              aktif.state = 'suspended';
              aktif.yeniUc = dipCapali ? Math.max(c.high, aktif.high) : Math.min(c.low, aktif.low);
              aktif.yeniUcIndeks = i;
            } else {
              aktif.violatedAt = i;
              aktif.state = 'violated';
              // Taşmanın ulaştığı uç izlenmeye başlar: dönüş olursa sınır
              // buraya taşınacak (`rescaleOnRevive`).
              aktif.ihlalTaraf = ihlalTarafi;
              aktif.ihlalUc = ihlalTarafi === 'devHigh' ? c.high : c.low;
              aktif.ihlalUcIndeks = i;
            }
          }
        } else {
          // Taşma sürerken uç güncellenir.
          if (aktif.ihlalTaraf === 'devHigh') {
            if (c.high > aktif.ihlalUc) { aktif.ihlalUc = c.high; aktif.ihlalUcIndeks = i; }
          } else if (aktif.ihlalTaraf === 'devLow') {
            if (c.low < aktif.ihlalUc) { aktif.ihlalUc = c.low; aktif.ihlalUcIndeks = i; }
          }

          // Töleranslı bekleme: range'e dönüldü mü?
          const sinirAlt = p.returnInto === 'deviation' ? aktif.devLow : aktif.low;
          const sinirUst = p.returnInto === 'deviation' ? aktif.devHigh : aktif.high;
          const dondu = c.close >= sinirAlt && c.close <= sinirUst;

          if (dondu) {
            /**
             * ÖLÜM DÖŞEĞİNDEN KALKTI. Sınır olduğu yerde mi kalsın, taşmanın
             * ucuna mı taşınsın? `rescaleOnRevive` açıksa taşınır.
             *
             * Yalnızca KİLİTLİ yapıda: kilitlenmemiş bir yapının sınırı zaten
             * büyüme aşamasında serbestçe hareket ediyor, ayrıca taşımanın
             * anlamı yok.
             */
            const capaTarafiIhlali = dipCapali
              ? aktif.ihlalTaraf === 'devLow'
              : aktif.ihlalTaraf === 'devHigh';
            const tarafUygun = p.rescaleSides === 'both' || !capaTarafiIhlali;

            if (p.rescaleOnRevive && aktif.locked && tarafUygun
                && aktif.redrawCount < p.redrawMaxCount
                && Number.isFinite(aktif.ihlalUc)) {
              const yeniAlt = aktif.ihlalTaraf === 'devLow' ? aktif.ihlalUc : aktif.low;
              const yeniUst = aktif.ihlalTaraf === 'devHigh' ? aktif.ihlalUc : aktif.high;
              const yeniGen = yeniUst - yeniAlt;
              const tavanTamam = !(aktif.kilitGenislik > 0)
                || (yeniGen / aktif.kilitGenislik) <= p.redrawMaxWidth;

              if (yeniGen > 0 && tavanTamam) {
                aktif.low = yeniAlt;
                aktif.high = yeniUst;
                aktif.extremeIndex = aktif.ihlalUcIndeks;
                seviyeleriKur(aktif);
                aktif.redrawCount++;
                aktif.redrawAt.push(i);
                if (p.rescaleRelock) {
                  aktif.locked = false;
                  aktif.lockedAt = null;
                }
              }
              // Tavan aşıldıysa yapı ölmez — yalnızca ÖLÇEKLENMEZ. Ölüm
              // sebebi ihlaldir; tavan bir ölçme sınırıdır, ölüm sebebi değil.
            }

            aktif.violatedAt = null;
            aktif.ihlalTaraf = null;
            aktif.ihlalUc = null;
            // `locked` yukarıda ölçekleme sırasında düşmüş olabilir; durum
            // ondan türetilir.
            aktif.state = aktif.locked ? 'locked' : 'forming';
            aktif.returnCount = (aktif.returnCount || 0) + 1;
          } else if ((i - aktif.violatedAt) >= p.deathGraceBars) {
            oldur(aktif, i, c, altDeger < aktif.devLow ? 'devLow' : 'devHigh');
            aktif = null;
            engelBar = i;
            capa = null;
            uc = null;
          }
        }
      }

      // ── Range yoksa: çapadan eşik kadar uzaklaşınca DOĞUM ──
      if (!aktif && capa) {
        if (capa.type === 'low') {
          if (c.high > uc) { uc = c.high; ucIndeks = i; }
          if (esik(i, capa.price) > 0 && (uc - capa.price) >= esik(i, capa.price)) {
            aktif = {
              id: sonrakiId++,
              anchor: 'low',
              startIndex: i,
              startTime: c.time,
              endIndex: null,
              endTime: null,
              low: capa.price,
              high: uc,
              anchorIndex: capa.index,
              // İkinci seviyenin barı — VPFR penceresinin diğer ucu.
              extremeIndex: ucIndeks !== null ? ucIndeks : i,
              locked: false,
              lockedAt: null,
              violatedAt: null,
              returnCount: 0,
              invalidatedBy: null,
              deathReason: null,
              // Yeniden çizim durumu (bkz. sınıf notu). `redraw` kapalıyken
              // hepsi başlangıç değerinde kalır.
              suspendedAt: null,
              redrawCount: 0,
              redrawAt: [],
              askiSwingler: [],
              kilitGenislik: null,
              yeniUc: null,
              yeniUcIndeks: null,
              // Tölerans yolunda taşmanın ulaştığı uç (`rescaleOnRevive`)
              ihlalTaraf: null,
              ihlalUc: null,
              ihlalUcIndeks: null,
              state: 'forming',
              active: true,
              extendActive: true
            };
            seviyeleriKur(aktif);
            ranges.push(aktif);
          }
        } else {
          if (c.low < uc) { uc = c.low; ucIndeks = i; }
          if (esik(i, capa.price) > 0 && (capa.price - uc) >= esik(i, capa.price)) {
            aktif = {
              id: sonrakiId++,
              anchor: 'high',
              startIndex: i,
              startTime: c.time,
              endIndex: null,
              endTime: null,
              low: uc,
              high: capa.price,
              anchorIndex: capa.index,
              // İkinci seviyenin barı — VPFR penceresinin diğer ucu.
              extremeIndex: ucIndeks !== null ? ucIndeks : i,
              locked: false,
              lockedAt: null,
              violatedAt: null,
              returnCount: 0,
              invalidatedBy: null,
              deathReason: null,
              // Yeniden çizim durumu (bkz. sınıf notu). `redraw` kapalıyken
              // hepsi başlangıç değerinde kalır.
              suspendedAt: null,
              redrawCount: 0,
              redrawAt: [],
              askiSwingler: [],
              kilitGenislik: null,
              yeniUc: null,
              yeniUcIndeks: null,
              // Tölerans yolunda taşmanın ulaştığı uç (`rescaleOnRevive`)
              ihlalTaraf: null,
              ihlalUc: null,
              ihlalUcIndeks: null,
              state: 'forming',
              active: true,
              extendActive: true
            };
            seviyeleriKur(aktif);
            ranges.push(aktif);
          }
        }
      }

      // ── Seriler (bot için; grafiğe çizilmez) ──
      if (aktif) {
        rangeHigh[i] = aktif.high;
        rangeLow[i] = aktif.low;
        eq[i] = aktif.eq;
        devHighS[i] = aktif.devHigh;
        devLowS[i] = aktif.devLow;
        position[i] = aktif.width > 0 ? (c.close - aktif.low) / aktif.width : null;
        state[i] = DURUM[aktif.state] !== undefined ? DURUM[aktif.state] : DURUM.forming;
      } else {
        state[i] = DURUM.yok;
      }
    }

    // ── 3) Salınım seviyeleri: her salınım kendi barından ONAY barına kadar ──
    //
    // Grafikte "salınımlarım doğru mu" sorusunu cevaplar. Çizgi salınım
    // barında başlar, onay barında biter; uzunluğu onayın ne kadar geciktiğini
    // gösterir. `extendActive` ile ölü bölge süzgecinden muaf tutulur, yoksa
    // hepsi (onaylandıkları için "ölü" sayılıp) gizlenirdi.
    const swingLevels = swingPoints.map((s, k) => ({
      id: k + 1,
      type: s.type,
      direction: s.type === 'high' ? 'bearish' : 'bullish',
      startIndex: s.index,
      endIndex: s.confirmedAt,
      startTime: candles[s.index] ? candles[s.index].time : null,
      // Tek seviyeli "bölge": çizim katmanı alt=üst olduğunda tek çizgi çizer.
      high: s.price,
      low: s.price,
      price: s.price,
      confirmDelay: s.confirmedAt - s.index,
      extendActive: true
    }));

    // Kullanılan eşik — panelde görülebilsin diye seri olarak da veriliyor.
    const thresholdSeri = new Array(n).fill(null);
    for (let i = 0; i < n; i++) thresholdSeri[i] = esik(i, candles[i].close);

    const sonIndex = n - 1;
    return {
      // Yeniden eskiye: grafik en yenileri seçiyor.
      ranges: ranges
        .map(r => ({ ...r, ageBars: sonIndex - r.startIndex }))
        .sort((a, b) => b.startIndex - a.startIndex)
        .slice(0, Math.floor(p.maxRanges)),
      // En yeniler önde: grafik listenin başındaki `maxRanges` kadarını çizer.
      swingLevels: swingLevels.slice().sort((a, b) => b.startIndex - a.startIndex),
      swingPoints,
      threshold: clean(thresholdSeri, n),
      rangeHigh: clean(rangeHigh, n),
      rangeLow: clean(rangeLow, n),
      eq: clean(eq, n),
      devHigh: clean(devHighS, n),
      devLow: clean(devLowS, n),
      position: clean(position, n),
      state: clean(state, n)
    };
  }
});

module.exports = { DURUM };
