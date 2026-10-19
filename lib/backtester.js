const db = require('./database');
const catalog = require('./strategies/catalog');
const venues = require('./venues');
const { computeAnalytics, gunlukOranlar } = require('./backtestStats');

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BU DOSYA BİR CEPHEDİR (`PLAN-MOTOR.md` M1)
 * ═══════════════════════════════════════════════════════════════════════════
 * `Backtester.run` burada; optimizasyon, walk-forward ve izleme listesi
 * taraması `lib/backtest/` altına taşındı. Sınıfın DIŞARIYA GÖRÜNEN imzası
 * değişmedi — `server.js` ve panel aynı çağrıları yapmaya devam eder.
 *
 * Neden ayrıldılar: üçü de `run()`'ı çağırır ama hiçbiri onun içini bilmez.
 * Aynı dosyada dururken simülasyona dokunmak optimizasyonu, optimizasyona
 * dokunmak walk-forward'ı riske atıyordu.
 *
 * Sabitler `lib/backtest/constants.js`'te — aynı sabitin iki dosyada farklı
 * değerle yaşaması bu depoda tekrarlanan bir hata sınıfı.
 */
const { MAX_LEVERAGE, FEE_PCT, FUNDING_PCT_PER_8H, getCandlesPerYear } = require('./backtest/constants');
const dolumKur = require('./backtest/fills').kur;
const optimize = require('./backtest/optimize');
const scan = require('./backtest/scan');
const ledger = require('./backtest/ledger');
const { HedgeBook } = require('./backtest/positions');
const { Korumalar } = require('./backtest/protections');
const { hesapKur } = require('./backtest/costs');

class Backtester {

  // Katalog tek kaynak (`lib/strategies/catalog.js`); burada ayrı bir switch
  // tutmak, listeyi altı yerde tutan eski düzenin parçasıydı.
  static getStrategyInstance(strategyName, config) {
    return catalog.create(strategyName, config);
  }

  /** Bir stratejinin optimizasyon ızgarası — `lib/backtest/optimize.js`. */
  static optimizeGridFor(strategyName, baseConfig, ctx = {}) {
    return optimize.optimizeGridFor(strategyName, baseConfig, ctx);
  }

  /**
   * Vadeli koşu için hazır konfigürasyon: kontrat özellikleri + funding serisi.
   *
   * Backtester sembolü bilmez (`'BACKTEST'` ile çalışır), bu yüzden funding
   * serisi ve kademeler DIŞARIDAN verilmek zorunda. Bu yardımcı ikisini de
   * tek çağrıda hazırlar:
   *
   *   const ek = await Backtester.perpConfig('BTC/USDT:USDT', { venue: 'bybit' });
   *   Backtester.run('strateji', { ...cfg, ...ek, leverage: 5 }, mumlar, ...);
   */
  static async perpConfig(symbol, kaynak = {}, kimlik = {}) {
    const venue = (kaynak.venue || 'bybit').toLowerCase();
    const specs = await venues.contractSpecs(venue, 'perp', symbol, kimlik);
    const fundingSeries = db.getFundingHistory(symbol, 0, Date.now(), { venue, market: 'perp' });
    return {
      marketType: 'perpetual',
      contractSpecs: specs,
      fundingSeries,
      feePct: +(specs.taker * 100).toFixed(4)
    };
  }

  static parseSafeTimestamp(candle) {
    if (!candle) return new Date().toISOString();
    const rawTime = candle.timestamp !== undefined ? candle.timestamp : (candle.time !== undefined ? candle.time : Date.now());
    const d = new Date(rawTime);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
    return new Date().toISOString();
  }

  /**
   * Main Backtest Execution Engine
   */
  /**
   * @param {object} options  `{ trace: true }` → sinyal izi kaydedilir.
   *                          `{ girisBasi: n }` → n. bardan önce giriş açılmaz (ısınma öneki).
   *                          `{ girisYasak: (i) => bool }` → true dönen barda YENİ pozisyon açılmaz
   *                          (açık pozisyona ekleme serbest; araştırma: PLAN-PUMP-FAZ1.md).
   */
  static run(strategyName, strategyConfig = {}, ohlcvData = [], initialCapital = 10000.0, timeframe = '1h', options = {}) {
    if (!ohlcvData || ohlcvData.length < 30) {
      throw new Error('Backtest için en az 30 mumluk OHLCV verisi gereklidir.');
    }

    /**
     * SİNYAL İZİ — "strateji gerçekten doğru al-sat yapıyor mu" sorusunun
     * cevabı burada.
     *
     * Backtest bugüne kadar yalnızca GERÇEKLEŞEN işlemleri raporluyordu.
     * Oysa strateji her barda sinyal üretir ve çoğu uygulanmaz: pozisyon
     * zaten açıktır, sermaye yetmez, ya da sinyal SHORT'tur ve motor onu
     * işlemez. Bu ayrım görünmeden "strateji az işlem açıyor" ile "sinyalleri
     * yutuluyor" birbirinden ayrılamaz.
     *
     * Kaydedilen: her HOLD OLMAYAN sinyal, uygulandı mı, uygulanmadıysa neden,
     * ve stratejinin O BARDA GÖRDÜĞÜ kendi gösterge değerleri
     * (`signal.indicators`). Sonuncusu havuz göstergeleriyle karşılaştırma
     * imkânı verir — havuz "piyasa ne yaptı"yı, bu "strateji ne gördü"yü söyler.
     */
    const traceOn = options && options.trace === true;
    // `traceBars`: stratejinin HER BARDA gördüğü kendi gösterge değerleri.
    // Grafik katmanı bunu seri olarak çiziyor — "bot ne gördü" ile "piyasa ne
    // yaptı" ancak yan yana konunca karşılaştırılabilir.
    const traceBarsOn = traceOn && options.traceBars === true;
    /**
     * BAŞ + SON. Eskiden İLK 3000 sinyal tutuluyordu; panel "son sinyaller"i
     * gösterdiği için yıllarca koşuda dönemin BAŞINDAN sinyaller görünüyordu.
     * Şimdi ilk `IZ_BAS` + son `IZ_SON` (halka tampon) tutulur; sayaçlar tam.
     */
    const IZ_BAS = 500, IZ_SON = 2500;
    const trace = traceOn
      ? { signals: [], counts: {}, blocked: {}, truncated: 0, executedTotal: 0, indicatorKeys: [], bars: traceBarsOn ? [] : null }
      : null;
    const izSon = [];
    let izSonBas = 0;

    const izKaydet = (kayit) => {
      if (!trace) return;
      trace.counts[kayit.action] = (trace.counts[kayit.action] || 0) + 1;
      if (kayit.executed) trace.executedTotal++;
      if (!kayit.executed) {
        const sebep = kayit.blockedBy || 'bilinmiyor';
        trace.blocked[sebep] = (trace.blocked[sebep] || 0) + 1;
      }
      if (trace.signals.length < IZ_BAS) trace.signals.push(kayit);
      else if (izSon.length < IZ_SON) izSon.push(kayit);
      else { izSon[izSonBas] = kayit; izSonBas = (izSonBas + 1) % IZ_SON; trace.truncated++; }
      if (kayit.indicators) {
        for (const k of Object.keys(kayit.indicators)) {
          if (!trace.indicatorKeys.includes(k)) trace.indicatorKeys.push(k);
        }
      }
    };

    const strategy = this.getStrategyInstance(strategyName, strategyConfig);

    /**
     * HAZIRLIK KANCASI — gösterge havuzunu stratejilere açan şey.
     *
     * Havuz göstergelerini her barda pencerenin tamamı üzerinde hesaplamak
     * O(n²) olur: 5000 barlık bir backtest dakikalar sürer ve çok katlı
     * walk-forward imkânsızlaşır. Bu yüzden strateji `prepare(fullSeries)`
     * tanımlarsa, seriyi döngüden ÖNCE bir kez alır.
     *
     * BU NEDEN İLERİYE BAKMA DEĞİL: havuzun `lookaheadtest.js`'i tam olarak
     * şunu kanıtlıyor — bir göstergenin `i`. bardaki değeri, seri `i`. barda
     * kesilerek hesaplandığında da AYNI çıkıyor. Yani tüm seride hesaplayıp
     * `i`. indeksi okumak, o bara kadar hesaplamakla eşdeğerdir.
     *
     * KISIT: yalnızca lookahead testinden geçmiş göstergeler böyle
     * kullanılabilir. Testten geçmemiş bir gösterge buraya sokulursa
     * backtest sessizce iyimser çıkar — kancayı kullanan strateji bunu
     * bilerek kullanmalı.
     */
    if (typeof strategy.prepare === 'function') {
      strategy.prepare(ohlcvData);
    }

    let capital = initialCapital;

    /**
     * POZİSYON KAYDI — HEDGE DEFTERİ (`PLAN-MOTOR.md` M4b)
     *
     * Motorun TEK pozisyon kaydı budur; `position` diye bir çalışma değişkeni
     * artık yok. Açık olan her şey defterdedir ve yön adıyla okunur
     * (`kitap.get('long')` / `kitap.get('short')`), böylece "hangi pozisyon"
     * sorusu her yerde açıkça cevaplanmak zorunda kalır.
     *
     * `hedge` VARSAYILAN KAPALI: defter tek pozisyonlu davranır ve ters yön
     * açılışını reddedip sayar. Bu, bugünkü motorun birebir davranışıdır.
     */
    /**
     * ─────────────────────────────────────────────────────────────────────
     * STRATEJİ HEDGE'İ KENDİSİ İSTEYEBİLİR
     * ─────────────────────────────────────────────────────────────────────
     * `hedge` bir MOTOR ayarıdır ve hiçbir stratejinin `paramSchema`sında
     * yok — yani panelden gelen bir koşuda ASLA açılmıyordu. İki bacaklı bir
     * strateji için bu sessiz bir felaket: `grid_dca` panelde koşturulunca
     * short bacağının tamamı "ters yön" sayılıp yok sayılıyordu (ölçüldü:
     * BTC 5m'de 1227 emir). Panel, ölçülenden bambaşka bir bot gösteriyordu.
     *
     * Çözüm kullanıcıya bir kutu işaretletmek DEĞİL: iki yönlü olmak
     * stratejinin TANIMIDIR, tercihi değil. Strateji `static requiresHedge`
     * ile bunu bildirir, motor uyar.
     *
     * Kullanıcı `hedge: false` diye AÇIKÇA yazarsa o kazanır — kontrol
     * koşusu yapmak (tek bacakla ne olurdu) meşru bir istek. Ama o zaman da
     * künyeye uyarı düşer, sessiz kalmaz.
     */
    const hedgeIsteyen = (() => {
      const Sinif = catalog.get(strategyName) && catalog.get(strategyName).Class;
      const bildirim = Sinif && Sinif.requiresHedge;
      if (!bildirim) return false;
      try {
        return typeof bildirim === 'function' ? bildirim(strategyConfig) === true : bildirim === true;
      } catch (err) { return false; }
    })();
    const hedgeAcikcaKapatildi = strategyConfig.hedge === false;
    const hedgeAcik = strategyConfig.hedge === true || (hedgeIsteyen && !hedgeAcikcaKapatildi);

    const kitap = new HedgeBook({
      hedge: hedgeAcik,
      tarafTavanPct: strategyConfig.tarafTavanPct,
      baslangicSermaye: initialCapital
    });

    /**
     * KORUMA KATMANI (`PLAN-MOTOR.md` M6) — strateji sonuçlarına bakıp yeni
     * girişi kilitler. Hiçbir koruma yapılandırılmamışsa tamamen devre dışı
     * ve korumasız koşuya hiçbir bedeli yok.
     *
     * Yalnızca GİRİŞİ engeller; açık pozisyonların çıkışına karışmaz. Bir
     * freni, açık pozisyonu stopsuz bırakacak şekilde çalıştırmak korumayı
     * riskin kendisine çevirirdi.
     */
    const korumalar = new Korumalar(strategyConfig.protections);
    let korumaEngeli = 0;

    /**
     * ISINMA ÖNEKİ — `options.girisBasi` (walk-forward test dilimi).
     *
     * Test dilimini tek başına koşturmak göstergeleri SOĞUK başlatır: 250
     * barlık bir ortalama, testin ilk 250 barında hiç sinyal üretmez ve test
     * "strateji işlem açmadı" diye okunur. Çözüm, dilimin ÖNÜNE eğitim
     * verisinden ısınma barları koymak — ama o barlarda giriş açılırsa eğitim
     * dönemine ait kâr teste sızar. Bu kapı o barlarda yalnız GİRİŞİ kapatır;
     * strateji veriyi görür, göstergeleri ısınır. Verilmezse davranış aynı.
     */
    const girisBasi = Number.isFinite(options.girisBasi) ? options.girisBasi : 0;

    /** Giriş serbest mi — engellenen her istek SAYILIR, sessiz kalmaz. */
    /**
     * GİRİŞ YASAĞI — `options.girisYasak(i)` (araştırma; verilmezse davranış aynı).
     * Yasaklı KARAR barında yeni pozisyon kurulmaz: piyasa girişi açılmaz, düzken
     * yeni limit emir (DCA merdiveni) deftere YAZILMAZ. Defterdeki emirlerin dolumu
     * ve açık pozisyona ekleme serbest — merdiven ortadan koparılmaz.
     */
    const girisYasak = typeof options.girisYasak === 'function' ? options.girisYasak : null;
    let yasakEngeli = 0;
    const yasakli = (i) => { if (!girisYasak || !girisYasak(i)) return false; yasakEngeli++; return true; };
    const girisSerbest = (i) => {
      if (i < girisBasi) return false;
      if (!korumalar.aktif) return true;
      const k = korumalar.girisSerbest(i);
      if (!k.serbest) korumaEngeli++;
      return k.serbest;
    };

    const pozYonu = (p) => (p && p.side === 'short' ? 'short' : 'long');

    /**
     * Pozisyon açar.
     *
     * HER çağrı yeri, sermayeyi harcamadan ÖNCE `kitap.acilabilirMi(yon)`
     * ile soruyor; buraya düşen bir ret o kontrolün atlandığı anlamına
     * gelir. Çağıran o noktada nakdi zaten düşmüş ve işlem kaydını yazmak
     * üzeredir — `null` dönmek o sermayeyi sessizce buharlaştırırdı, bu
     * yüzden hata atılıyor.
     */
    const pozAc = (poz) => {
      const yon = pozYonu(poz);
      if (!kitap.ac(yon, poz)) {
        throw new Error(`Defter ${yon} açılışını reddetti — çağrı yeri acilabilirMi() sormamış`);
      }
      return poz;
    };

    /** Açık pozisyonu kapatır ve defterden düşer. */
    const pozKapat = (poz) => {
      if (!poz) return null;
      kitap.kapat(pozYonu(poz));
      return poz;
    };

    /**
     * SİNYALİN HANGİ TARAFI KASTETTİĞİ (`PLAN-MOTOR.md` M4b Aşama 3).
     *
     * Giriş sinyallerinde soru yok: `BUY` long, `SHORT` short açar — eylem
     * adı tarafı zaten söylüyor. Soru ÇIKIŞ ve GÜNCELLEME sinyallerinde
     * doğuyor: iki yön birden açıkken bir `SELL` hangisini kapatacak?
     * Strateji bunu `signal.side` ile söyler.
     *
     * Söylemediyse tek açık yön kullanılır — bugünkü davranış budur ve
     * mevcut yedi strateji tek satır değişmeden çalışmaya devam eder. İki
     * yön birden açıkken TAHMİN EDİLMEZ: yanlış tarafı kapatmak, botu
     * sessizce ters pozisyona geçirmektir.
     */
    const hedefYon = (signal, ne) => {
      if (signal.side === 'long' || signal.side === 'short') return signal.side;
      if (kitap.adet <= 1) return kitap.acikYonler[0] || null;
      throw new Error(`${ne} sinyali iki yön birden açıkken tarafını belirtmeli (signal.side)`);
    };

    /** Eylem adının söylediği tarafla `signal.side` çelişiyorsa sessiz kalınmaz. */
    const girisYonu = (signal, yon) => {
      if ((signal.side === 'long' || signal.side === 'short') && signal.side !== yon) {
        throw new Error(`'${signal.action}' ${yon} tarafını açar, signal.side='${signal.side}' çelişiyor`);
      }
      return yon;
    };

    /**
     * Bu yöne bu barda ayrılabilecek üst sınır — K5 taraf tavanı.
     *
     * Hedge kapalı ve tavan açıkça verilmemişken bağlayıcı değildir
     * (`HedgeBook.ayrilabilir` nakdin tamamını döndürür), yani mevcut
     * ölçümler değişmez.
     */
    const tarafTavani = (yon) => {
      const mevcut = kitap.get(yon);
      return kitap.ayrilabilir(yon, capital, (mevcut && mevcut.cost) || 0);
    };
    const trades = [];
    const closedTrades = [];
    const equityCurve = [];
    const dailyReturns = [];

    let peakCapital = initialCapital;
    let maxDrawdown = 0.0;

    // --- Raw series the analytics module needs -------------------------------
    let totalCommission = 0;
    let maxCapitalDeployed = 0;
    let capitalDeployedSum = 0;
    const equitySeries = [];   // close / intrabar high / intrabar low equity per bar
    const buyHoldSeries = [];  // same bars, buy-and-hold benchmark

    const startIndex = 30;
    const firstClose = ohlcvData[startIndex].close;
    // Benchmark buys once at the first simulated bar, paying the same fee.
    const buyHoldUnits = initialCapital / (firstClose * (1 + FEE_PCT));

    // ── VADELİ (PERPETUAL) KURULUMU ────────────────────────────────────────
    const perpetual = venues.normalizeMarket(strategyConfig.marketType) === 'perp'
      && String(strategyConfig.marketType || 'spot') !== 'spot';

    // Kaldıraç yalnızca vadelide anlamlı; spot her zaman 1x kalır ki mevcut
    // spot ölçümleri birebir korunsun.
    const kaldirac = perpetual
      ? Math.min(MAX_LEVERAGE, Math.max(1, +strategyConfig.leverage || 1))
      : 1;

    // Kontrat özellikleri çağrandan gelir (`lib/venues.js` → `contractSpecs`).
    // Gelmezse yedek kademeler kullanılır; `tiersSource` bunu raporlar.
    const specs = strategyConfig.contractSpecs || null;
    const kademeler = (specs && specs.tiers) || venues.YEDEK_KADEMELER;
    const kademeKaynak = (specs && specs.tiersSource) || 'varsayim';
    const takerFee = (specs && Number.isFinite(specs.taker)) ? specs.taker : FEE_PCT;

    // Dolum varsayımları tek yerde (lib/backtest/fills.js). Varsayılan
    // `dokunma` eski davranışın aynısıdır.
    const dolum = dolumKur(strategyConfig.dolumModeli);

    /**
     * FİNANSMAN: gerçek seri varsa o kullanılır.
     *
     * `fundingSeries` = [{ time, rate }] — `Backtester.loadFundingSeries()` ya
     * da `db.getFundingHistory()` ile alınır. Gerçek seri kullanıldığında oran
     * YÖN DUYARLIDIR: oran pozitifken long öder, short alır. Bugüne kadarki
     * "iki yönde de gider" varsayımı yalnızca seri YOKKEN geçerli bir yedektir
     * (ölçmediğimiz bir geliri kâra yazmamak için kötümser taraf).
     */
    const fundingSerisi = perpetual && Array.isArray(strategyConfig.fundingSeries)
      ? strategyConfig.fundingSeries.filter(f => Number.isFinite(f.time) && Number.isFinite(f.rate))
        .sort((a, b) => a.time - b.time)
      : null;
    const gercekFunding = !!(fundingSerisi && fundingSerisi.length);
    let fundingImlec = 0;

    const fundingOran = Number.isFinite(+strategyConfig.fundingPctPer8h)
      ? +strategyConfig.fundingPctPer8h / 100
      : FUNDING_PCT_PER_8H;
    const barSaat = 8760 / getCandlesPerYear(timeframe);
    const barBasiFunding = (perpetual && !gercekFunding) ? fundingOran * (barSaat / 8) : 0;
    let totalFunding = 0;
    let liquidations = 0;

    /**
     * PARA MATEMATİĞİ — `lib/backtest/costs.js`.
     *
     * Komisyon, giriş maliyeti, kapanış kârı, dönen nakit, anlık değer,
     * likidasyon fiyatı ve finansman payı orada. Buraya kapanış olarak
     * yazıldıklarında tanım SIRASINA bağlıydılar: `takerFee` bir alt satırda
     * tanımlanıyordu ve fonksiyonu bir satır yukarı almak sessizce
     * `undefined` ile hesap yaptırırdı.
     */
    const hesap = hesapKur({
      feePct: FEE_PCT,
      takerFee,
      perpetual,
      kademeler,
      bakimMarji: venues.maintenanceMargin,
      // 'eski' (varsayılan, mutabakat tabanı) | 'binance' (resmi izole formül)
      likidasyonModeli: strategyConfig.likidasyonModeli
    });
    const { netProceeds, entryCost, kapanisKar, kapanisNakit, markDeger,
      lotKapanisKar, lotKapanisNakit,
      likidasyonFiyati, fonlamaPayi } = hesap;
    // Breakeven eşiği pozisyon başına, kendi stop mesafesinden hesaplanır
    // (döngü içinde). Sabit bir eşik, strateji kendi stop yüzdesini
    // gönderdiğinde stop mesafesiyle ilgisiz bir yerde tetikleniyordu.

    /**
     * BEKLEYEN LİMİT EMİR.
     *
     * Motor bugüne kadar yalnızca PİYASA emri biliyordu: pozisyon her zaman
     * barın KAPANIŞINDA açılıyordu. Seviyeye limit yazan bir strateji için bu
     * ölçümü baştan bozar — sınırdan girmekle sınırın 0.1R içinden girmek
     * arasındaki fark, bu depoda ölçüldüğü üzere beklentiyi eksiden artıya
     * taşıyacak büyüklükte.
     *
     * İLERİYE BAKMA KURALI: emir barın KAPANIŞINDA verilir, ancak SONRAKİ
     * barlarda dolabilir. Verildiği barda doldurmak, emrin o bar boyunca zaten
     * masada olduğunu varsaymak olurdu.
     *
     * TAZELEME: emir her barda strateji tarafından yeniden bildirilmelidir.
     * Bildirilmezse iptal edilir — böylece "koşulu bozulan emir masada kalır"
     * hatası imkânsız olur; stratejinin ayrıca iptal sinyali göndermesi gerekmez.
     */
    let bekleyenEmir = null;      // bu bardan sonra geçerli olacak emir
    let aktifEmir = null;         // önceki bardan gelen, bu barda dolabilecek emir
    let limitFills = 0;

    /**
     * ─────────────────────────────────────────────────────────────────────
     * EMİR DEFTERİ — AYNI ANDA BİRDEN ÇOK, KİMLİKLİ, KALICI LİMİT EMRİ
     * ─────────────────────────────────────────────────────────────────────
     * Yukarıdaki `bekleyenEmir` TEK emir taşır ve HER BAR TAZELENMEK zorundadır.
     * O model `range_mr` için doğru: emir bir koşula bağlıdır, koşul bozulunca
     * emir de düşmelidir.
     *
     * DCA / kademeli alım botları bunun tam tersini ister: bir kerede 1 baz +
     * N güvenlik emri masaya konur, hepsi KALICIDIR ve doldukça pozisyona
     * eklenir. Tek emirli modelde bu botlar ölçülemiyordu — köprü ilk emri
     * alıp kalanını yok sayıyor, sonuç DCA botu değil tek girişli bir bot
     * oluyordu.
     *
     * İki model YAN YANA yaşar; eski yol hiç değişmedi, defter ayrı bir
     * kapıdır (`signal.orders`). Böylece mevcut ölçümler birebir tekrarlanabilir.
     *
     * KURALLAR
     *   · Emir verildiği barda DOLMAZ (aynı ileriye bakma kuralı).
     *   · Emirler kalıcıdır: strateji açıkça iptal edene ya da dolana kadar durur.
     *   · Dolan emir pozisyon YOKSA açar, AYNI YÖNDE pozisyon varsa ORTALAMA
     *     alarak ekler, TERS yönde pozisyon varsa yok sayılır (ve sayılır).
     */
    const emirDefteri = new Map();
    let defterDolum = 0;
    let defterTersYon = 0;
    let defterSermayeYetmedi = 0;
    /** Taraf tavanı (K5) yüzünden dolmayan emirler — sessiz kalmamalı. */
    let defterTavanReddedilen = 0;
    const DEFTER_TAVAN = 200;   // kaçak emir birikmesine karşı

    /**
     * PENCERE KOPYALANMAZ, BÜYÜTÜLÜR (`PLAN-MOTOR.md` M-3).
     *
     * Eskiden her barda `ohlcvData.slice(0, i + 1)` çağrılıyordu: bar başına
     * `i` elemanlık bir kopya, yani toplamda O(n²) iş. 40.000 barlık bir seri
     * 800 milyon eleman kopyalatıyordu ve grid botuyla birlikte hem bar sayısı
     * hem strateji yükü artacak.
     *
     * Yerine tek bir dizi tutulup her barda sonuna bir mum ekleniyor —
     * içerik birebir aynı, maliyet O(1).
     *
     * ─────────────────────────────────────────────────────────────────────
     * NEDEN GÜVENLİ — ÜÇÜ DE KONTROL EDİLDİ
     * ─────────────────────────────────────────────────────────────────────
     * 1. Gösterge havuzu önbelleği İÇERİK parmak iziyle çalışıyor
     *    (`length:ilkZaman:sonZaman:sonKapanis:hacimToplamı`), dizi KİMLİĞİYLE
     *    değil. Büyüyen dizi her barda farklı parmak izi üretir; kimlikle
     *    önbelleklenseydi strateji ikinci bardan itibaren bayat veri okurdu.
     * 2. Hiçbir strateji diziyi saklamıyor.
     * 3. Hiçbir yerde mum dizisi üzerinde `sort`/`reverse`/`push` gibi
     *    DEĞİŞTİREN bir çağrı yok — paylaşılan pencere bozulmaz.
     *
     * Yine de son güvence mutabakattır: içerik değişseydi 64 koşunun işlem
     * ve sermaye eğrisi sağlamaları tutmazdı.
     */
    /**
     * ─────────────────────────────────────────────────────────────────────
     * KADEME STOPLARI — "en zararlıdan başlayarak, zarar ettikçe kapan"
     * ─────────────────────────────────────────────────────────────────────
     * Kullanıcı tarifi (2026-09-08):
     *
     *   > 90'da long açtım, 50'ye kadar alım yapacağım, 30'un altına düşerse
     *   > en fazla zarar edenden başlayarak kapatacağım. 90'dan 30'a %kaç
     *   > düştüyse, ikinci kademedeki de o kadar yüzdelik düşüş gelince
     *   > kapanacak. Hepsi aynı anda kapanmayacak, zarar ettikçe kapanacak.
     *
     * Yani stop bir SEVİYE değil, bir ORANDIR: her lot KENDİ giriş fiyatından
     * aynı yüzde kadar düştüğünde kapanır. 90'dan alınan 30'da, 80'den alınan
     * 26.67'de, 70'ten alınan 23.33'te. Pozisyon tek seferde değil, fiyat
     * düştükçe parça parça erir.
     *
     * ═══════════════════════════════════════════════════════════════════════
     * NEDEN MOTORDA, STRATEJİDE DEĞİL
     * ═══════════════════════════════════════════════════════════════════════
     * Seviye bar İÇİNDE geçilir. Strateji yalnızca bar KAPANIŞINDA konuşur;
     * kuralı orada işletmek, fiyatın 30'un çok altına sarktığı bir barda
     * kapanışı 30'dan değil kapanış fiyatından yazardı — düpedüz iyimser
     * sapma. Stop ve hedef kontrolü de tam bu yüzden motorda.
     *
     * ═══════════════════════════════════════════════════════════════════════
     * SIRA GARANTİLİ, TAHMİNLİ DEĞİL
     * ═══════════════════════════════════════════════════════════════════════
     * Lotlar EN ZARARLIDAN sıralanır: long'da en yüksek fiyattan alınan,
     * short'ta en düşükten. Bu sıra aynı zamanda stop seviyelerinin sırasıdır
     * (yüksek girişin stopu da yüksektir), yani fiyat düşerken gerçekten o
     * sırayla vurulurlar. İlk vurmayanda durulabilmesinin sebebi bu — daha az
     * zararlı bir lotun stopu daha uzaktadır.
     *
     * VARSAYILAN KAPALI: `lotStopPct` verilmeyen pozisyonda bu blok hiç
     * çalışmaz. Mevcut yedi stratejinin sonuçları bu yüzden değişmez.
     */
    let lotStopKapanis = 0;
    /** Aynı anda taşınan en çok lot — kademe tavanının kanıtı. */
    let enDerinKademe = 0;
    const kademeStoplari = (poz, mum, i, timestamp) => {
      const oranStop = poz.lotStopPct;
      if (!(oranStop > 0) || !Array.isArray(poz.lots) || !poz.lots.length) return false;
      const kisa = poz.side === 'short';

      const sirali = poz.lots.slice().sort((a, b) => (kisa ? a.price - b.price : b.price - a.price));
      let pozKapandi = false;

      for (const lot of sirali) {
        const seviye = kisa ? lot.price * (1 + oranStop) : lot.price * (1 - oranStop);
        const vurdu = kisa ? mum.high >= seviye : mum.low <= seviye;
        // Sıra garantili: bu lot vurmadıysa daha az zararlı olan hiç vurmaz.
        if (!vurdu) break;
        const cikis = dolum.stopCikisFiyati(mum, seviye, kisa);

        const yer = poz.lots.indexOf(lot);
        if (yer < 0) continue;

        // Finansman payı MİKTAR oranıyla gider; lot maliyetiyle değil.
        const miktarOrani = poz.amount > 0 ? lot.amount / poz.amount : 0;
        const kar = lotKapanisKar(poz, lot, cikis) - fonlamaPayi(poz, miktarOrani);
        capital += lotKapanisNakit(poz, lot, cikis);
        totalCommission += lot.amount * cikis * FEE_PCT;

        poz.lots.splice(yer, 1);
        poz.amount -= lot.amount;
        poz.cost -= (lot.cost || 0);
        if (poz.entryFee) poz.entryFee -= (lot.entryFee || 0);
        lotStopKapanis++;

        /**
         * SON LOT GİDİNCE POZİSYON KAPANIR. `amount` eşiği kayan nokta
         * artıklarına karşı: sıfıra tam inmeyen bir kalıntı, defterde
         * miktarsız bir pozisyon bırakırdı.
         */
        const sonuncu = poz.lots.length === 0 || poz.amount <= 1e-12;
        const maliyet = lot.cost || (lot.price * lot.amount);

        const trade = {
          id: `trade-${trades.length + 1}`,
          symbol: 'BACKTEST',
          type: kisa ? 'COVER (Kademe Stop)' : 'SELL (Kademe Stop)',
          direction: poz.side,
          // Giriş fiyatı LOTUN kendisidir, pozisyonun ortalaması değil —
          // "en zararlı olan" ancak böyle görünür.
          entryPrice: lot.price,
          exitPrice: cikis,
          amount: lot.amount,
          profitUSDT: +kar.toFixed(2),
          profitPct: maliyet > 0 ? +((kar / maliyet) * 100).toFixed(2) : 0,
          reason: `Kademe stop —%${(oranStop * 100).toFixed(2)} (giriş ${lot.price})`,
          entryTime: lot.time,
          exitTime: timestamp,
          entryIndex: lot.index,
          exitIndex: i,
          barsInTrade: i - lot.index,
          kind: sonuncu ? 'kapanis' : 'kismi',
          sebepKodu: 'kademeStop',
          barIndex: i
        };
        trades.push(trade);
        closedTrades.push(trade);

        if (sonuncu) {
          korumalar.islemKapandi(i, trade);
          pozKapat(poz);
          pozKapandi = true;
          break;
        }

        // Kalan lotlardan ortalama yeniden kurulur; eski ortalama artık
        // var olmayan bir lotu içeriyordu.
        const toplamDeger = poz.lots.reduce((a, l) => a + l.price * l.amount, 0);
        const toplamMiktar = poz.lots.reduce((a, l) => a + l.amount, 0);
        if (toplamMiktar > 0) poz.entryPrice = toplamDeger / toplamMiktar;
      }
      return pozKapandi;
    };

    const pencere = ohlcvData.slice(0, 30);

    // İlerleme: uzun aralıkta (yüz binlerce bar) panel "çalışıyor" demekle
    // yetinmesin. 20 bin barda bir çağrılır; verilmezse maliyeti sıfır.
    const ilerleme = typeof options.ilerleme === 'function' ? options.ilerleme : null;
    for (let i = 30; i < ohlcvData.length; i++) {
      if (ilerleme && i % 20000 === 0) ilerleme(i / ohlcvData.length);
      pencere.push(ohlcvData[i]);
      const windowSlice = pencere;
      const currentCandle = ohlcvData[i];
      const ticker = { last: currentCandle.close, symbol: 'BACKTEST' };

      // Önceki barın emri bu barda dolabilir.
      aktifEmir = bekleyenEmir;
      bekleyenEmir = null;

      const bekleyenYon = aktifEmir && (aktifEmir.side === 'short' ? 'short' : 'long');
      if (aktifEmir && Number.isFinite(aktifEmir.limitPrice)
        && kitap.acilabilirMi(bekleyenYon) && girisSerbest(i)) {
        const kisaEmir = aktifEmir.side === 'short';
        // Short limiti YUKARIDA: barın yükseği ona değerse dolar.
        // Long limiti AŞAĞIDA: barın düşüğü ona değerse dolar.
        const doldu = dolum.limitDoldu(currentCandle, aktifEmir.limitPrice, !kisaEmir);

        if (doldu) {
          const fiyat = aktifEmir.limitPrice;
          const allocPct = aktifEmir.allocationPct || 25.0;
          const istenen = Math.min(capital * (allocPct / 100.0), capital * 0.95);
          const allocatedCapital = Math.min(istenen, tarafTavani(bekleyenYon));
          if (allocatedCapital < istenen) kitap.kisildi();

          if (allocatedCapital >= 10) {
            const marj = perpetual ? allocatedCapital / (1 + kaldirac * takerFee) : allocatedCapital;
            const nominal = perpetual ? marj * kaldirac : 0;
            const girisKomisyon = perpetual ? nominal * takerFee : 0;
            const amount = perpetual
              ? nominal / fiyat
              : allocatedCapital / (fiyat * (1 + FEE_PCT));

            capital -= allocatedCapital;
            totalCommission += perpetual ? girisKomisyon : amount * fiyat * FEE_PCT;
            limitFills++;

            const entryStopPct = Number(aktifEmir.stopLossPct) > 0 ? Number(aktifEmir.stopLossPct) : 2.0;
            const entryTpPct = Number(aktifEmir.takeProfitPct) > 0 ? Number(aktifEmir.takeProfitPct) : 4.0;

            pozAc({
              side: kisaEmir ? 'short' : 'long',
              perp: perpetual,
              leverage: perpetual ? kaldirac : 1,
              entryPrice: fiyat,
              amount,
              cost: allocatedCapital,
              entryFee: girisKomisyon,
              // Lot MALİYETİNİ de taşır (`Σ lot.cost === pos.cost`): lot bazlı
              // kapanış onsuz kârı olduğundan büyük gösterirdi. Bkz. costs.js.
              lots: [{ price: fiyat, amount, cost: allocatedCapital, entryFee: girisKomisyon, index: i, time: this.parseSafeTimestamp(currentCandle) }],
              tranches: 1,
              allocatedCapital,
              entryTime: this.parseSafeTimestamp(currentCandle),
              entryIndex: i,
              isBreakeven: false,
              stopPct: entryStopPct,
              tpPct: entryTpPct,
              stopPrice: aktifEmir.slLevel || (kisaEmir ? fiyat * (1 + entryStopPct / 100) : fiyat * (1 - entryStopPct / 100)),
              takeProfitPrice: kisaEmir ? fiyat * (1 - entryTpPct / 100) : fiyat * (1 + entryTpPct / 100),
              liqPrice: perpetual
                ? likidasyonFiyati(kisaEmir, fiyat, amount, marj, girisKomisyon)
                : null
            });

            trades.push({
              id: `trade-${trades.length + 1}`,
              symbol: 'BACKTEST',
              type: kisaEmir ? 'SHORT' : 'BUY',
              direction: kisaEmir ? 'short' : 'long',
              entryPrice: fiyat,
              amount,
              reason: `LİMİT DOLDU @${fiyat.toFixed(4)} — ${aktifEmir.reason || ''}`,
              entryTime: this.parseSafeTimestamp(currentCandle),
              kind: 'giris', kaynak: 'limit', barIndex: i
            });
          }
          aktifEmir = null;
        }
      }

      /**
       * DEFTERDEKİ EMİRLERİN DOLUMU.
       *
       * Fiyata YAKINLIK sırasına göre işlenir: bar içinde hangi emrin önce
       * dolduğu bar verisinden bilinemez, ama fiyatın yolu gereği yakın olan
       * uzağa göre ÖNCE dolar. Rastgele sıra, DCA merdiveninde ortalama
       * maliyeti yanlış hesaplardı.
       */
      if (emirDefteri.size) {
        const dolabilir = [];
        for (const emir of emirDefteri.values()) {
          if (emir.verildigiBar >= i) continue;          // verildiği barda dolmaz
          const kisa = emir.side === 'short';
          const doldu = dolum.limitDoldu(currentCandle, emir.limitPrice, !kisa);
          if (doldu) dolabilir.push(emir);
        }
        dolabilir.sort((a, b) => Math.abs(a.limitPrice - currentCandle.open) - Math.abs(b.limitPrice - currentCandle.open));

        for (const emir of dolabilir) {
          emirDefteri.delete(emir.id);
          const kisa = emir.side === 'short';
          const emirYon = kisa ? 'short' : 'long';
          const fiyat = emir.limitPrice;

          // Aynı yönde pozisyon varsa ORTALAMA alınarak eklenir. Yoksa emir
          // ancak defter o yönü açmaya izin veriyorsa dolar — hedge kapalıyken
          // ters yön yok sayılır ve SAYILIR, açıkken ikinci taraf açılır.
          const mevcutPoz = kitap.get(emirYon);
          if (!mevcutPoz && !kitap.acilabilirMi(emirYon)) { defterTersYon++; continue; }
          /**
           * Koruma YENİ pozisyonu engeller, açık pozisyona EKLEMEYİ değil.
           * Merdivenin ortasında freni indirmek, ortalaması yarım kalmış bir
           * pozisyonu planından koparırdı.
           */
          if (!mevcutPoz && !girisSerbest(i)) continue;

          // MİKTAR: `qty` verilmişse BİRİM cinsindendir ve aynen kullanılır.
          // DCA merdiveninde emirler arası ORAN (hacim çarpanı) anlamı taşır;
          // hepsini `allocationPct` ile eşitlemek merdiveni yok ederdi.
          let amount;
          if (Number.isFinite(emir.qty) && emir.qty > 0) {
            amount = emir.qty;
          } else {
            const allocPct = emir.allocationPct || 25.0;
            const istenen = Math.min(capital * (allocPct / 100.0), capital * 0.95);
            const ayrilan = Math.min(istenen, tarafTavani(emirYon));
            if (ayrilan < istenen) kitap.kisildi();
            amount = ayrilan / (fiyat * (1 + FEE_PCT));
          }

          /**
           * VADELİDE DEFTER DOLUMU = MARJ + KOMİSYON (2026-10-06, PLAN-ADAYLAR.md 1).
           * Eskiden defter yolu vadeli koşuda da spot gibi tam nominal çekiyor,
           * pozisyonu `perp: false` ve likidasyonsuz açıyordu: DCA'da
           * `leverage` etkisizdi, SHORT'ta fiyat iki katına çıkınca özsermaye
           * eksiye düşüyordu (likidasyon 0). Artık tek emir yoluyla aynı kural.
           */
          const dNominal = perpetual ? amount * fiyat : 0;
          const dKomisyon = perpetual ? dNominal * takerFee : 0;
          const maliyet = perpetual ? dNominal / kaldirac + dKomisyon : entryCost(amount, fiyat);
          if (!(maliyet > 0) || maliyet > capital) { defterSermayeYetmedi++; continue; }

          /**
           * ─────────────────────────────────────────────────────────────
           * K5 — TARAF BAŞINA SERMAYE TAVANI, DEFTER YOLUNDA DA GEÇERLİ
           * ─────────────────────────────────────────────────────────────
           * Tavan `HedgeBook.ayrilabilir` ile hesaplanıyor ve tek emir
           * yolunda uygulanıyordu; DEFTER yolunda ise `qty` verilmişse hiç
           * sorulmuyordu. Yani K5 (kullanıcı kararı, 2026-09-06) tam da onun
           * için alındığı strateji olan `grid_dca`da ölü koddu: merdiven
           * sermayenin tamamını tek tarafa bağlayabiliyordu.
           *
           * REDDEDİLİR, KISILMAZ. Tek emir yolunda miktar kısılıyor
           * (`Math.min(istenen, tarafTavani)`) ama merdivende bu sessiz bir
           * bozulma olurdu: basamak tutarları arasındaki ORAN merdivenin
           * kendisidir; bir basamağı küçültmek planı değiştirir. Tavana
           * gelen taraf yeni lot almaz, mevcut lotlarını taşımaya devam eder.
           *
           * Hedge KAPALI ve tavan açıkça verilmemişken `ayrilabilir` nakdin
           * tamamını döndürüyor — yani mevcut stratejiler için bu satır
           * yukarıdaki `maliyet > capital` kontrolünün aynısı, davranış
           * değişmiyor (mutabakat 64/64 ile doğrulandı).
           */
          const tarafHakki = tarafTavani(emirYon);
          if (maliyet > tarafHakki) { defterTavanReddedilen++; kitap.kisildi(); continue; }

          capital -= maliyet;
          totalCommission += perpetual ? dKomisyon : amount * fiyat * FEE_PCT;
          defterDolum++;

          if (!mevcutPoz) {
            /**
             * DEFTER YOLUNDA VARSAYILAN STOP/HEDEF YOKTUR.
             *
             * Tek emir yolunda bildirilmeyen stop %2, hedef %4 sayılır — piyasa
             * emriyle giren stratejiler için makul bir emniyet. Defter yolunda
             * ise ÖLÇÜMÜ BOZAR: DCA botunun stop'u genellikle kapalıdır ve
             * varsayılan %2 stop, merdivenin ikinci basamağı dolmadan pozisyonu
             * kapatır. Ölçüldü: 4 basamaklı merdivende hiçbir güvenlik emri
             * dolmuyordu, her basamak ayrı bir işlem gibi görünüyordu.
             *
             * Defteri kullanan strateji çıkışını kendi yönetir (`strategy.exit`
             * → `updateStop` / `updateTarget`). Bildirmediyse pozisyon
             * stop'suz taşınır — bu, stratejinin kararıdır, motorun tahmini değil.
             */
            const eStop = Number(emir.stopLossPct) > 0 ? Number(emir.stopLossPct) : null;
            const eTp = Number(emir.takeProfitPct) > 0 ? Number(emir.takeProfitPct) : null;
            pozAc({
              side: kisa ? 'short' : 'long',
              perp: perpetual, leverage: perpetual ? kaldirac : 1,
              entryPrice: fiyat,
              amount,
              cost: maliyet,
              entryFee: dKomisyon,
              lots: [{ price: fiyat, amount, cost: maliyet, entryFee: dKomisyon, index: i, time: this.parseSafeTimestamp(currentCandle) }],
              tranches: 1,
              allocatedCapital: maliyet,
              entryTime: this.parseSafeTimestamp(currentCandle),
              entryIndex: i,
              isBreakeven: false,
              // Genel breakeven kuralı defter pozisyonlarında ÇALIŞMAZ:
              // stratejinin kendi çıkış planı vardır ve stop'u girişe taşımak
              // DCA merdiveninin ortalama mantığını bozar.
              selfManaged: true,
              stopPct: eStop,
              tpPct: eTp,
              /**
               * KADEME STOP ORANI EMİRLE GELİR ve pozisyonu AÇAN emirde
               * donar. Kullanıcı kuralı bunu gerektiriyor: oran, ilk girişin
               * yapısal stopundan türer ("90'dan 30'a %kaç düştüyse"). Sonraki
               * her dolumda yeniden hesaplansaydı merdiven derinleştikçe oran
               * kayar ve hiçbir lot tarif edilen yerde kapanmazdı.
               */
              lotStopPct: Number(emir.lotStopPct) > 0 ? Number(emir.lotStopPct) : 0,
              stopPrice: Number.isFinite(emir.slLevel) ? emir.slLevel
                : (eStop === null ? null : (kisa ? fiyat * (1 + eStop / 100) : fiyat * (1 - eStop / 100))),
              takeProfitPrice: eTp === null ? null
                : (kisa ? fiyat * (1 - eTp / 100) : fiyat * (1 + eTp / 100)),
              liqPrice: perpetual ? likidasyonFiyati(kisa, fiyat, amount, maliyet - dKomisyon, dKomisyon) : null
            });
            trades.push({
              id: `trade-${trades.length + 1}`, symbol: 'BACKTEST',
              type: kisa ? 'SHORT' : 'BUY', direction: kisa ? 'short' : 'long',
              entryPrice: fiyat, amount,
              reason: `DEFTER ${emir.id} @${fiyat.toFixed(6)}`,
              entryTime: this.parseSafeTimestamp(currentCandle),
              kind: 'giris', kaynak: 'defter', emirId: emir.id, barIndex: i, kademe: 1
            });
          } else {
            // KADEMELİ EKLEME: ortalama maliyet güncellenir.
            // STOP YERİNDE KALIR — aşağı ortalama yapıldıkça stop'u da taşımak
            // "kademeler toplam riski artırmaz" kuralını bozardı.
            const toplamDeger = mevcutPoz.entryPrice * mevcutPoz.amount + fiyat * amount;
            const toplamMiktar = mevcutPoz.amount + amount;
            mevcutPoz.entryPrice = toplamDeger / toplamMiktar;
            mevcutPoz.amount = toplamMiktar;
            mevcutPoz.cost += maliyet;
            mevcutPoz.allocatedCapital += maliyet;
            if (mevcutPoz.perp) {
              mevcutPoz.entryFee = (mevcutPoz.entryFee || 0) + dKomisyon;
              mevcutPoz.liqPrice = likidasyonFiyati(kisa, mevcutPoz.entryPrice, mevcutPoz.amount, mevcutPoz.cost - mevcutPoz.entryFee, mevcutPoz.entryFee);
            }
            mevcutPoz.lots.push({ price: fiyat, amount, cost: maliyet, entryFee: dKomisyon, index: i, time: this.parseSafeTimestamp(currentCandle) });
            mevcutPoz.tranches = (mevcutPoz.tranches || 1) + 1;
            trades.push({
              id: `trade-${trades.length + 1}`, symbol: 'BACKTEST',
              type: kisa ? 'SHORT' : 'BUY', direction: kisa ? 'short' : 'long',
              entryPrice: fiyat, amount,
              reason: `DEFTER ${emir.id} @${fiyat.toFixed(6)} [kademe ${mevcutPoz.tranches}]`,
              entryTime: this.parseSafeTimestamp(currentCandle),
              kind: 'giris', kaynak: 'defter', emirId: emir.id, barIndex: i, kademe: mevcutPoz.tranches
            });
          }
        }
      }

      const activePositions = kitap.acikPozisyonlar();
      /**
       * MERDİVENİN GERÇEK DERİNLİĞİ — aynı anda taşınan en çok lot sayısı.
       *
       * İşlem kaydındaki `kademe` alanı bunu SÖYLEMEZ: o, pozisyonun ömrü
       * boyunca kaçıncı dolum olduğunu sayar ve kademe stopu bir lotu
       * kapattığında geri düşmez. Kademe TAVANI konulduktan sonra ikisi
       * ayrışıyor — tavan 5'ken `kademe` 112'ye kadar çıkabiliyor (aynı
       * pozisyona zaman içinde 112 kez eklenmiş ama hiçbir an 5'ten fazla
       * lot taşınmamış). Tavanın işleyip işlemediği ancak bu sayıyla okunur.
       */
      for (const poz of activePositions) {
        if (Array.isArray(poz.lots) && poz.lots.length > enDerinKademe) enDerinKademe = poz.lots.length;
      }
      /**
       * Motor durumu 4. argüman olarak verilir. Pine köprüsü
       * `strategy.equity` / `strategy.opentrades` gibi değerleri buradan
       * besler; bunlar olmadan DCA betiklerinin "işlem açık mı" dalları hiç
       * çalışmaz. Mevcut stratejiler argümanı yok sayar — imza geriye dönük
       * uyumludur.
       */
      // `markDeger` — sermaye eğrisinin kullandığı değerlemenin AYNISI. Eskiden
      // burada long için `amount × close` (NOMİNAL) yazıyordu: vadelide marj
      // yerine nominal sayılınca strateji özsermayeyi kaldıraç katı büyük
      // görüyor, pozisyonunu küçük sanıp eklemeye devam ediyordu (Donchian
      // 2x'te getiri %104 yerine %394 çıktı, 2026-10-06).
      const acikDeger = activePositions.reduce((toplam, poz) => toplam + markDeger(poz, currentCandle.close), 0);
      const motorDurumu = {
        capital,
        equity: capital + acikDeger,
        initialCapital,
        openTrades: kitap.adet,
        openOrders: emirDefteri.size,
        barIndex: i
      };
      const signal = strategy.evaluate(windowSlice, ticker, activePositions, motorDurumu);
      const timestamp = this.parseSafeTimestamp(currentCandle);

      /**
       * DEFTER BİLDİRİMİ. Herhangi bir sinyal `orders` / `cancel` /
       * `cancelAll` taşıyabilir — `action` ne olursa olsun işlenir. Böylece
       * strateji aynı barda hem emir bildirip hem başka bir eylem üretebilir.
       */
      if (signal && (signal.orders || signal.cancel || signal.cancelAll)) {
        if (signal.cancelAll) emirDefteri.clear();
        if (Array.isArray(signal.cancel)) for (const id of signal.cancel) emirDefteri.delete(id);
        if (Array.isArray(signal.orders)) {
          const yeniKurulumYasak = girisYasak && signal.orders.some(o => o && o.id && !emirDefteri.has(o.id) && !kitap.get(o.side === 'short' ? 'short' : 'long')) && yasakli(i);
          for (const o of signal.orders) {
            if (!o || !o.id || !Number.isFinite(o.limitPrice)) continue;
            if (yeniKurulumYasak && !emirDefteri.has(o.id) && !kitap.get(o.side === 'short' ? 'short' : 'long')) continue;
            if (!emirDefteri.has(o.id) && emirDefteri.size >= DEFTER_TAVAN) continue;
            const yon = o.side === 'short' ? 'short' : 'long';
            const eski = emirDefteri.get(o.id);
            /**
             * AYNI EMRİN YENİDEN BİLDİRİMİ EMRİ TAZELEMEZ.
             *
             * Pine betikleri emir bloğunu genellikle bir KOŞUL altında her bar
             * çalıştırır (`if strategy.opentrades == 0` gibi). Aynı kimlik,
             * aynı yön ve aynı fiyat geldiğinde bu "yeni emir" değil, aynı
             * emrin tekrar bildirilmesidir.
             *
             * `verildigiBar` her bildirimde güncellenirse emir SONSUZA DEK
             * "bu bar verildi" sayılır ve ileriye bakma kuralı yüzünden HİÇ
             * DOLMAZ. DCA merdiveni sessizce hiç kurulmamış olurdu.
             *
             * Fiyat ya da yön değiştiyse emir gerçekten değişmiştir; o zaman
             * yaşı sıfırlanır.
             */
            const ayniEmir = eski && eski.side === yon && eski.limitPrice === o.limitPrice;
            emirDefteri.set(o.id, {
              ...o, side: yon,
              verildigiBar: ayniEmir ? eski.verildigiBar : i
            });
          }
        }
      }

      /**
       * LİMİT SİNYALİNİN İZDEKİ KARŞILIĞI — teşhis aracı YALAN SÖYLÜYORDU.
       *
       * Aşağıdaki dal limit emri gerçekten masaya koyuyor, ama `izUygulandi`
       * bayrağı bu satırdan SONRA (823) tanımlanıyor; dal ona erişemiyordu.
       * Sonuçta her limit sinyali izin son dalına düşüp
       * `'LIMIT' motor tarafından işlenmiyor` etiketi alıyordu.
       *
       * Somut bedeli: `range_mr` limit emirle çalışır, yani sinyallerinin
       * neredeyse tamamı LIMIT'tir. Panel "107 sinyal, 2 uygulanan, 104'ü
       * motor işlemiyor" diyordu — strateji normal çalışırken. Kullanıcı
       * bunu arıza sanıp motoru sorguladı; oysa arıza teşhis aracındaydı.
       *
       * Bu yüzden durum BURADA saptanıp aşağıya taşınıyor. Üç ayrı hâl var
       * ve üçü de ayrı ayrı raporlanır — "işlenmiyor" toptancılığı yerine.
       */
      let izLimitDurumu = null;
      const limitYon = signal && signal.side === 'short' ? 'short' : 'long';
      // Emir, açılamayacak bir yön için masaya konmaz: hedge kapalıyken
      // herhangi bir pozisyon açıkken, açıkken ise o yön zaten doluyken.
      const limitKonabilir = kitap.acilabilirMi(limitYon);
      if (signal && signal.action === 'LIMIT') {
        if (!Number.isFinite(signal.limitPrice)) {
          izLimitDurumu = { kondu: false, sebep: 'limitPrice geçersiz' };
        } else if (!limitKonabilir) {
          // Bu GERÇEK bir kısıt ve izde öyle görünmeli.
          izLimitDurumu = { kondu: false, sebep: 'pozisyon açık — limit emir konmadı' };
        } else {
          izLimitDurumu = { kondu: true, sebep: null };
        }
      }

      // Strateji bu barda limit bildirdiyse SONRAKİ bar için masaya konur.
      if (limitKonabilir && signal && signal.action === 'LIMIT' && Number.isFinite(signal.limitPrice)) {
        bekleyenEmir = {
          side: limitYon,
          limitPrice: signal.limitPrice,
          allocationPct: signal.allocationPct,
          stopLossPct: signal.stopLossPct,
          takeProfitPct: signal.takeProfitPct,
          slLevel: signal.slLevel,
          reason: signal.reason
        };
      }

      // Bar bazlı gösterge izi: pozisyon durumu dahil GERÇEK koşudan alınır.
      // Stratejiyi ayrıca boş pozisyonla koşturmak, çıkış dallarındaki
      // değerleri kaçırırdı.
      if (trace && trace.bars && signal && signal.indicators) {
        trace.bars.push({ i, time: currentCandle.time, ...signal.indicators });
        for (const k of Object.keys(signal.indicators)) {
          if (!trace.indicatorKeys.includes(k)) trace.indicatorKeys.push(k);
        }
      }

      /**
       * ÇIKIŞ DENETİMİ TARAF BAŞINADIR (`PLAN-MOTOR.md` M4b Aşama 2).
       *
       * Breakeven · likidasyon · hedef · stop — dördü de pozisyonun KENDİ
       * yönüne bakar, karşı tarafı hiç görmez. Bu yüzden blok tek bir
       * `position` yerine defterdeki açık yönlerin üzerinde dönüyor. Hedge
       * kapalıyken defterde en çok bir yön vardır, döngü tek tur atar ve
       * eski davranış birebir korunur.
       *
       * Defterin ANLIK GÖRÜNTÜSÜ üzerinde geziliyor: tur içinde pozisyon
       * kapanıp defterden düşüyor, canlı liste üzerinde gezmek sıradaki
       * yönü atlatırdı.
       */
      for (const poz of kitap.acikPozisyonlar()) {
        const kisa = poz.side === 'short';
        // Pozisyon bu tur içinde kapanmış olabilir; sonraki denetimler
        // kapanmış pozisyona bakmamalı.
        let acik = true;

        // Short'ta kâr fiyat DÜŞÜNCE oluşur; yön çarpanı tüm eşik
        // kontrollerinde bu tek satırdan gelir.
        const yon = kisa ? -1 : 1;
        const pnlPct = yon * ((currentCandle.close - poz.entryPrice) / poz.entryPrice) * 100;

        // Breakeven eşiği pozisyonun KENDİ stop mesafesinden türer — motorla
        // aynı kural. Sabit bir eşik, ATR bazlı stop taşıyan pozisyonlarda
        // stop mesafesiyle ilgisiz bir yerde tetiklenirdi.
        const positionBreakevenPct = (poz.stopPct || strategyConfig.stopLossPct || 2.0) * 1.5;

        // Breakeven raise. `selfManaged` pozisyonlarda (emir defteri yolu)
        // atlanır: strateji çıkışını kendi yönetiyor, stop'u girişe taşımak
        // onun planına müdahale olurdu.
        if (!poz.selfManaged && !poz.isBreakeven && pnlPct >= positionBreakevenPct) {
          poz.isBreakeven = true;
          poz.stopPrice = poz.entryPrice;
        }

        /**
         * LİKİDASYON — stop'tan önce mi sonra mı?
         *
         * Kör bir "likidasyon her zaman önce gelir" kuralı yanlış olurdu: stop
         * likidasyondan yakınsa fiyat stop'u geçmeden likidasyona ULAŞAMAZ.
         * Doğru ölçüt MESAFEDİR — girişten hangisi daha yakınsa o tetiklenir.
         * Aynı barda ikisi de görülüyorsa hangisinin önce geldiği bar içinden
         * bilinemez; yakın olanı seçmek fiyatın yolu gereği zorunlu olandır.
         *
         * Likidasyonda MARJIN TAMAMI gider. Borsa pozisyonu iflas fiyatından
         * devralır ve kalan bakım marjını da tasfiye ücreti olarak alır; kalan
         * bir bakiye varsayan bir model iyimser olurdu.
         */
        if (perpetual && Number.isFinite(poz.liqPrice) && poz.liqPrice > 0) {
          const liqVuruldu = kisa
            ? currentCandle.high >= poz.liqPrice
            : currentCandle.low <= poz.liqPrice;

          const stopMesafe = Number.isFinite(poz.stopPrice)
            ? Math.abs(poz.entryPrice - poz.stopPrice)
            : Infinity;
          const liqMesafe = Math.abs(poz.entryPrice - poz.liqPrice);

          if (liqVuruldu && liqMesafe <= stopMesafe) {
            const marj = poz.cost;
            const fonPayi = fonlamaPayi(poz);
            totalCommission += poz.amount * poz.liqPrice * takerFee;
            liquidations++;

            const trade = {
              id: `trade-${trades.length + 1}`,
              symbol: 'BACKTEST',
              type: kisa ? 'COVER' : 'SELL',
              direction: kisa ? 'short' : 'long',
              entryPrice: poz.entryPrice,
              exitPrice: poz.liqPrice,
              amount: poz.amount,
              // Marjın tamamı + o pozisyonun ödediği finansman.
              profitUSDT: +(-(marj + fonPayi)).toFixed(2),
              profitPct: -100,
              reason: `LİKİDASYON — ${kaldirac}x, marjın tamamı kayıp (likidasyon $${poz.liqPrice.toFixed(4)})`,
              entryTime: poz.entryTime,
              exitTime: timestamp,
              entryIndex: poz.entryIndex,
              exitIndex: i,
              barsInTrade: i - poz.entryIndex,
              liquidated: true,
              kind: 'kapanis', sebepKodu: 'likidasyon', barIndex: i
            };

            trades.push(trade);
            closedTrades.push(trade);
            korumalar.islemKapandi(i, trade);
            pozKapat(poz);   // marj geri dönmez: `capital` artmaz
            acik = false;
          }
        }

        // Take-Profit. Motorun `evaluatePositions` kuralının karşılığı; backtest
        // tarafında hiç yoktu, bu yüzden backtest ile canlı ayrışıyordu.
        // Aynı barda hem stop hem hedef görülürse stop kabul edilir: hangisinin
        // önce geldiği bar içinden bilinemez, iyimser varsayım sonucu şişirir.
        // Stop short'ta ÜSTTE, hedef ALTTA — eşikler yön duyarlı.
        //
        // Pozisyon yukarıdaki likidasyonda kapanmış olabilir.
        const stopHit = acik && poz.stopPrice && (kisa
          ? currentCandle.high >= poz.stopPrice
          : currentCandle.low <= poz.stopPrice);
        const tpHit = acik && poz.takeProfitPrice
          && dolum.limitDoldu(currentCandle, poz.takeProfitPrice, kisa);

        if (acik && !stopHit && tpHit) {
          const exitPrice = poz.takeProfitPrice;
          const grossCost = poz.cost;
          const profitUSDT = kapanisKar(poz, exitPrice) - fonlamaPayi(poz);
          capital += kapanisNakit(poz, exitPrice);
          totalCommission += poz.amount * exitPrice * FEE_PCT;

          const trade = {
            id: `trade-${trades.length + 1}`,
            symbol: 'BACKTEST',
            type: kisa ? 'COVER' : 'SELL',
            direction: kisa ? 'short' : 'long',
            entryPrice: poz.entryPrice,
            exitPrice,
            amount: poz.amount,
            profitUSDT: +profitUSDT.toFixed(2),
            profitPct: +((profitUSDT / grossCost) * 100).toFixed(2),
            reason: `TAKE_PROFIT (+%${(poz.tpPct || 0).toFixed(2)})`,
            entryTime: poz.entryTime,
            exitTime: timestamp,
            entryIndex: poz.entryIndex,
            exitIndex: i,
            barsInTrade: i - poz.entryIndex,
            kind: 'kapanis', sebepKodu: 'hedef', barIndex: i
          };

          trades.push(trade);
          closedTrades.push(trade);
          korumalar.islemKapandi(i, trade);
          pozKapat(poz);
          acik = false;
        }

        // Stop-Loss / breakeven stop. Eşik yukarıda bir kez hesaplandı;
        // ikinci kez türetmek, aradaki breakeven yükseltmesi yüzünden iki
        // farklı cevap verebilirdi.
        if (acik && stopHit) {
          const exitPrice = dolum.stopCikisFiyati(currentCandle, poz.stopPrice, kisa);
          const grossCost = poz.cost;
          const profitUSDT = kapanisKar(poz, exitPrice) - fonlamaPayi(poz);
          capital += kapanisNakit(poz, exitPrice);
          totalCommission += poz.amount * exitPrice * FEE_PCT;

          const trade = {
            id: `trade-${trades.length + 1}`,
            symbol: 'BACKTEST',
            type: kisa ? 'COVER' : 'SELL',
            direction: kisa ? 'short' : 'long',
            entryPrice: poz.entryPrice,
            exitPrice,
            amount: poz.amount,
            profitUSDT: +profitUSDT.toFixed(2),
            profitPct: +((profitUSDT / grossCost) * 100).toFixed(2),
            reason: poz.isBreakeven ? 'Breakeven Stop-Out (+%0)' : 'Stop-Loss Triggered',
            entryTime: poz.entryTime,
            exitTime: timestamp,
            entryIndex: poz.entryIndex,
            exitIndex: i,
            barsInTrade: i - poz.entryIndex,
            kind: 'kapanis', sebepKodu: poz.isBreakeven ? 'breakeven' : 'stop', barIndex: i
          };

          trades.push(trade);
          closedTrades.push(trade);
          korumalar.islemKapandi(i, trade);
          pozKapat(poz);
          acik = false;
        }

        /**
         * KADEME STOPLARI EN SONDA. Pozisyon likidasyon, hedef ya da toplu
         * stop ile zaten kapandıysa hiç çalışmaz — aynı barda pozisyonu iki
         * kez kapatmak sermayeyi iki kez geri verirdi.
         */
        if (acik && kademeStoplari(poz, currentCandle, i, timestamp)) acik = false;
      }

      // Signal Processing
      // İz için: sinyalin uygulanıp uygulanmadığı ve uygulanmadıysa sebebi.
      let izUygulandi = false;
      let izEngel = null;

      /**
       * SİNYALİN DOKUNDUĞU POZİSYON.
       *
       * Giriş eylemi tarafını adından alır (`BUY` long, `SHORT` short);
       * `SELL` ise `signal.side` ile ya da tek açık yön kuralıyla çözülür.
       */
      const alimPoz = signal.action === 'BUY' ? kitap.get(girisYonu(signal, 'long')) : null;
      let satisPoz = null;
      if (signal.action === 'SELL') {
        const satisYon = hedefYon(signal, 'SELL');
        satisPoz = satisYon ? kitap.get(satisYon) : null;
      }

      // KADEMELİ ALIM: `addToPosition` ile gelen BUY sinyali açık pozisyona
      // eklenir. Bu bilinçli olarak OPT-IN — eski davranışta ikinci BUY
      // sessizce yutuluyordu ("pozisyon zaten açık") ve kademeli giriş kuran
      // hiçbir strateji backtestte ölçülemiyordu. Bayrağı taşımayan sinyaller
      // için davranış aynen korunur, yoksa mevcut stratejiler farkında olmadan
      // piramitlemeye başlardı.
      if (signal.action === 'BUY' && alimPoz && signal.addToPosition === true) {
        const allocPct = signal.allocationPct || 25.0;
        const istenen = Math.min(capital * (allocPct / 100.0), capital * 0.95);
        const allocatedCapital = Math.min(istenen, tarafTavani('long'));
        if (allocatedCapital < istenen) kitap.kisildi();

        if (allocatedCapital < 10) {
          izEngel = 'ayrılan sermaye $10 altında';
        } else {
          // VADELİ KADEME: ilk girişle AYNI kural — ayrılan sermaye marj +
          // komisyondur, nominal = marj × kaldıraç. Eskiden burada spot formülü
          // vardı: 2x'te eklenen kademe kaldıraçsız giriyor, ama marjı tam
          // nominal kadar bağlıyordu.
          const kPerp = !!alimPoz.perp;
          const kMarj = kPerp ? allocatedCapital / (1 + kaldirac * takerFee) : allocatedCapital;
          const kNominal = kPerp ? kMarj * kaldirac : 0;
          const kKomisyon = kPerp ? kNominal * takerFee : 0;
          const amount = kPerp
            ? kNominal / currentCandle.close
            : allocatedCapital / (currentCandle.close * (1 + FEE_PCT));
          capital -= allocatedCapital;
          totalCommission += kPerp ? kKomisyon : amount * currentCandle.close * FEE_PCT;

          alimPoz.amount += amount;
          alimPoz.cost += allocatedCapital;
          if (kPerp) {
            alimPoz.entryFee = (alimPoz.entryFee || 0) + kKomisyon;
            alimPoz.liqPrice = likidasyonFiyati(false, (alimPoz.lots.reduce((a, l) => a + l.price * l.amount, 0) + currentCandle.close * amount) / alimPoz.amount,
              alimPoz.amount, alimPoz.cost - alimPoz.entryFee, alimPoz.entryFee);
          }
          alimPoz.lots.push({ price: currentCandle.close, amount, cost: allocatedCapital, entryFee: kKomisyon, index: i, time: timestamp });
          // Ortalama giriş komisyonsuz fiyattan hesaplanır (stop/hedef
          // seviyeleri fiyat üzerinden konuşulur); kâr-zarar ise `cost`tan.
          const toplamDeger = alimPoz.lots.reduce((a, l) => a + l.price * l.amount, 0);
          const toplamMiktar = alimPoz.lots.reduce((a, l) => a + l.amount, 0);
          alimPoz.entryPrice = toplamDeger / toplamMiktar;

          // STOP YERİNDE KALIR. Kademe eklerken stop'u yeni ortalamaya göre
          // yeniden hesaplamak, aşağı ortalama yapıldıkça stop'u da aşağı
          // taşır ve "kademeler toplam riski artırmaz" kuralını bozardı.
          // Yalnızca strateji açıkça yeni bir seviye gönderirse değişir.
          if (Number.isFinite(signal.slLevel)) alimPoz.stopPrice = signal.slLevel;
          alimPoz.takeProfitPrice = alimPoz.entryPrice * (1 + alimPoz.tpPct / 100);
          alimPoz.tranches = (alimPoz.tranches || 1) + 1;

          trades.push({
            id: `trade-${trades.length + 1}`,
            symbol: 'BACKTEST',
            type: 'BUY',
            entryPrice: currentCandle.close,
            amount,
            reason: `${signal.reason || 'Kademe'} [kademe ${alimPoz.tranches}]`,
            entryTime: timestamp,
            kind: 'giris', kaynak: 'sinyal', barIndex: i, kademe: alimPoz.tranches
          });
          izUygulandi = true;
        }
      } else if (signal.action === 'BUY' && kitap.acilabilirMi('long') && girisSerbest(i) && !yasakli(i)) {
        const allocPct = signal.allocationPct || 25.0;
        // `tamSermaye` (opt-in, Hücum): %95 tavanı kalkar — komisyon zaten ayrılan
        // sermayenin içinden düşülüyor (spot: miktar = sermaye / (fiyat × (1 + ücret))).
        const istenen = Math.min(capital * (allocPct / 100.0), capital * (signal.tamSermaye === true ? 1.0 : 0.95));
        const allocatedCapital = Math.min(istenen, tarafTavani('long'));
        if (allocatedCapital < istenen) kitap.kisildi();
        if (allocatedCapital < 10) izEngel = 'ayrılan sermaye $10 altında';
        if (allocatedCapital >= 10) {
          // VADELİ LONG: ayrılan sermaye MARJ + giriş komisyonudur, nominal
          // değil. Kaldıraçta komisyon nominal üzerinden alınır (100x'te marjın
          // %6'sı kadar!) — "komisyonu ayrılan sermayenin içinde tut" kuralı
          // olmadan sermaye eksiye düşerdi.
          const marj = perpetual ? allocatedCapital / (1 + kaldirac * takerFee) : allocatedCapital;
          const nominal = perpetual ? marj * kaldirac : 0;
          const girisKomisyon = perpetual ? nominal * takerFee : 0;

          // Ayrılan sermaye komisyonu da kapsar, bu yüzden alınan miktar daha azdır
          const amount = perpetual
            ? nominal / currentCandle.close
            : allocatedCapital / (currentCandle.close * (1 + FEE_PCT));
          capital -= allocatedCapital;
          totalCommission += perpetual ? girisKomisyon : amount * currentCandle.close * FEE_PCT;

          // Stop ve hedef mesafesi öncelikle STRATEJİDEN alınır. Bj Bot gibi
          // stratejiler bunu swing seviyesi + ATR ile hesaplayıp sinyalde
          // gönderiyor; genel %2 ile ezmek stratejinin tüm mantığını çöpe atar
          // (Bj Bot'un 43 işlemi bu yüzden sıfır kâr alma ile kapanıyordu).
          const entryStopPct = Number(signal.stopLossPct) > 0
            ? Number(signal.stopLossPct)
            : (Number(strategyConfig.stopLossPct) > 0 ? Number(strategyConfig.stopLossPct) : 2.0);
          const entryTpPct = Number(signal.takeProfitPct) > 0
            ? Number(signal.takeProfitPct)
            : (Number(strategyConfig.takeProfitPct) > 0 ? Number(strategyConfig.takeProfitPct) : 4.0);

          pozAc({
            entryPrice: currentCandle.close,
            amount,
            // Vadelide `cost` MARJDIR; spotta gerçek maliyet esası (giriş
            // komisyonu dahil). Kâr-zarar bundan hesaplanır; `entryPrice ×
            // amount` kullanmak giriş komisyonunu dışarıda bırakıyordu —
            // canlı motorda düzeltilen aynı hata.
            // `cost` GİRİŞTE ÇEKİLEN NAKİTTİR (marj + giriş komisyonu), çıplak
            // marj değil. `kapanisNakit` bunu geri verir ve `kapanisKar` giriş
            // komisyonunu ayrıca düşer; `cost`a marj yazmak komisyonu İKİ KEZ
            // düşürüyordu (ölçüldü: perp long getirisi %38.3 yerine %35.9).
            cost: allocatedCapital,
            perp: perpetual,
            side: 'long',
            leverage: perpetual ? kaldirac : 1,
            entryFee: girisKomisyon,
            liqPrice: perpetual
              ? likidasyonFiyati(false, currentCandle.close, amount, marj, girisKomisyon)
              : null,
            lots: [{ price: currentCandle.close, amount, cost: allocatedCapital, entryFee: girisKomisyon, index: i, time: timestamp }],
            tranches: 1,
            allocatedCapital,
            entryTime: timestamp,
            entryIndex: i,
            isBreakeven: false,
            stopPct: entryStopPct,
            tpPct: entryTpPct,
            stopPrice: signal.slLevel || currentCandle.close * (1 - entryStopPct / 100),
            takeProfitPrice: currentCandle.close * (1 + entryTpPct / 100),
            tp1Level: signal.tp1Level,
            tp2Level: signal.tp2Level,
            so1Level: signal.so1Level,
            so2Level: signal.so2Level
          });

          trades.push({
            id: `trade-${trades.length + 1}`,
            symbol: 'BACKTEST',
            type: 'BUY',
            entryPrice: currentCandle.close,
            amount,
            reason: signal.reason,
            entryTime: timestamp,
            kind: 'giris', kaynak: 'sinyal', barIndex: i, kademe: 1
          });
          izUygulandi = true;
        }
      } else if (signal.action === 'SHORT' && kitap.acilabilirMi(girisYonu(signal, 'short'))
        && girisSerbest(i) && !yasakli(i)) {
        // SHORT GİRİŞİ — yalnızca perpetual piyasada anlamlı; strateji zaten
        // spotta bu sinyali üretmiyor. Marj = ayrılan sermaye (1x, kaldıraçsız).
        const allocPct = signal.allocationPct || 25.0;
        const istenen = Math.min(capital * (allocPct / 100.0), capital * 0.95);
        const allocatedCapital = Math.min(istenen, tarafTavani('short'));
        if (allocatedCapital < istenen) kitap.kisildi();

        if (allocatedCapital < 10) {
          izEngel = 'ayrılan sermaye $10 altında';
        } else {
          // Marj + komisyon = ayrılan sermaye. Kaldıraç 1 ve komisyon FEE_PCT
          // iken bu ifade eski formülle birebir aynı sayıyı verir; mevcut
          // short ölçümleri değişmez.
          const marj = allocatedCapital / (1 + kaldirac * takerFee);
          const notional = marj * kaldirac;
          const amount = notional / currentCandle.close;
          const girisKomisyon = notional * takerFee;
          capital -= allocatedCapital;
          totalCommission += girisKomisyon;

          const entryStopPct = Number(signal.stopLossPct) > 0
            ? Number(signal.stopLossPct)
            : (Number(strategyConfig.stopLossPct) > 0 ? Number(strategyConfig.stopLossPct) : 2.0);
          const entryTpPct = Number(signal.takeProfitPct) > 0
            ? Number(signal.takeProfitPct)
            : (Number(strategyConfig.takeProfitPct) > 0 ? Number(strategyConfig.takeProfitPct) : 4.0);

          pozAc({
            side: 'short',
            perp: perpetual,
            leverage: perpetual ? kaldirac : 1,
            entryPrice: currentCandle.close,
            amount,
            // Girişte çekilen nakit (marj + komisyon) — bkz. long tarafındaki not.
            cost: allocatedCapital,
            entryFee: girisKomisyon,
            liqPrice: perpetual
              ? likidasyonFiyati(true, currentCandle.close, amount, marj, girisKomisyon)
              : null,
            lots: [{ price: currentCandle.close, amount, cost: allocatedCapital, entryFee: girisKomisyon, index: i, time: timestamp }],
            tranches: 1,
            allocatedCapital,
            entryTime: timestamp,
            entryIndex: i,
            isBreakeven: false,
            stopPct: entryStopPct,
            tpPct: entryTpPct,
            // Short'ta stop ÜSTTE, hedef ALTTA.
            stopPrice: signal.slLevel || currentCandle.close * (1 + entryStopPct / 100),
            takeProfitPrice: currentCandle.close * (1 - entryTpPct / 100)
          });

          trades.push({
            id: `trade-${trades.length + 1}`,
            symbol: 'BACKTEST',
            type: 'SHORT',
            direction: 'short',
            entryPrice: currentCandle.close,
            amount,
            reason: signal.reason,
            entryTime: timestamp,
            kind: 'giris', kaynak: 'sinyal', barIndex: i, kademe: 1
          });
          izUygulandi = true;
        }
      } else if (signal.action === 'SELL' && satisPoz) {
        const satisKisa = satisPoz.side === 'short';
        if (signal.partialPct && signal.partialPct < 1.0) {
          // Partial Take-Profit Kapanışı
          const closeAmount = satisPoz.amount * signal.partialPct;
          const exitPrice = currentCandle.close;
          // Maliyet esası oransal düşülür: `pos.cost` giriş komisyonunu da
          // taşıdığı için kısmi çıkışta da onun payı kadarı gider.
          const grossCost = satisPoz.cost * signal.partialPct;
          const profitUSDT = kapanisKar(satisPoz, exitPrice, signal.partialPct)
            - fonlamaPayi(satisPoz, signal.partialPct);
          capital += kapanisNakit(satisPoz, exitPrice, signal.partialPct);
          satisPoz.amount -= closeAmount;
          satisPoz.cost -= grossCost;
          if (satisPoz.entryFee) satisPoz.entryFee -= satisPoz.entryFee * signal.partialPct;
          // LOTLAR DA ORANTILI KÜÇÜLÜR — sözleşme `Σ lot.amount === pos.amount`
          // (costs.js). Küçülmezse sonraki kademe eklemesi ortalama girişi
          // eski, büyük lotlardan hesaplıyor; vadelide kâr ortalamadan
          // hesaplandığı için pozisyon değeri şişiyordu (Donchian BTC 1x:
          // araştırma %104, motor %1122 — 2026-10-06).
          if (Array.isArray(satisPoz.lots)) {
            const kalan = 1 - signal.partialPct;
            for (const lot of satisPoz.lots) {
              lot.amount *= kalan;
              if (lot.cost) lot.cost *= kalan;
              if (lot.entryFee) lot.entryFee *= kalan;
            }
          }
          totalCommission += closeAmount * exitPrice * FEE_PCT;

          const trade = {
            id: `trade-${trades.length + 1}`,
            symbol: 'BACKTEST',
            // Etiket YÖNDEN gelir: short kapanışı COVER'dır. Kısmi çıkışta
            // sabit 'long' yazılıyordu — short ölçümünde yön kırılımı
            // (long/short beklentisi ayrı ayrı) yanlış çıkıyordu.
            type: satisKisa ? 'COVER (Kısmi TP)' : 'SELL (Kısmi TP)',
            direction: satisKisa ? 'short' : 'long',
            entryPrice: satisPoz.entryPrice,
            exitPrice,
            amount: closeAmount,
            profitUSDT: +profitUSDT.toFixed(2),
            profitPct: +((profitUSDT / grossCost) * 100).toFixed(2),
            reason: signal.reason,
            entryTime: satisPoz.entryTime,
            exitTime: timestamp,
            entryIndex: satisPoz.entryIndex,
            exitIndex: i,
            barsInTrade: i - satisPoz.entryIndex,
            kind: 'kismi', sebepKodu: 'kismi', barIndex: i, oran: signal.partialPct
          };

          trades.push(trade);
          closedTrades.push(trade);
        } else {
          // Tam Pozisyon Kapanışı
          const exitPrice = currentCandle.close;
          const grossCost = satisPoz.cost;
          const profitUSDT = kapanisKar(satisPoz, exitPrice) - fonlamaPayi(satisPoz);
          capital += kapanisNakit(satisPoz, exitPrice);
          totalCommission += satisPoz.amount * exitPrice * FEE_PCT;

          const trade = {
            id: `trade-${trades.length + 1}`,
            symbol: 'BACKTEST',
            type: satisKisa ? 'COVER' : 'SELL',
            direction: satisKisa ? 'short' : 'long',
            entryPrice: satisPoz.entryPrice,
            exitPrice,
            amount: satisPoz.amount,
            profitUSDT: +profitUSDT.toFixed(2),
            profitPct: +((profitUSDT / grossCost) * 100).toFixed(2),
            reason: signal.reason,
            entryTime: satisPoz.entryTime,
            exitTime: this.parseSafeTimestamp(currentCandle),
            entryIndex: satisPoz.entryIndex,
            exitIndex: i,
            barsInTrade: i - satisPoz.entryIndex,
            kind: 'kapanis', sebepKodu: 'sinyal', barIndex: i
          };

          trades.push(trade);
          closedTrades.push(trade);
          korumalar.islemKapandi(i, trade);
          pozKapat(satisPoz);
        }
        izUygulandi = true;
      }

      if (traceOn && signal.action && signal.action !== 'HOLD') {
        if (!izUygulandi && !izEngel) {
          // Yutulan sinyalin sebebi: motorun yapısal kısıtları.
          if (izLimitDurumu) {
            // Limit emrin masaya konması sinyalin UYGULANMASIDIR — motor
            // stratejinin istediğini yapmıştır. Emrin dolup dolmadığı ayrı
            // bir sorudur ve işlem listesinde görünür.
            if (izLimitDurumu.kondu) izUygulandi = true;
            else izEngel = izLimitDurumu.sebep;
          }
          else if (signal.action === 'BUY') {
            if (kitap.get('long')) izEngel = 'pozisyon açık ve sinyal addToPosition taşımıyor';
            // Hedge kapalıyken karşı taraf açıksa alım hiç denenmez; iz bunu
            // "alım açılamadı" diye toptancılık yapmadan söylemeli.
            else if (kitap.adet > 0) izEngel = 'ters yön açık — hedge kapalı';
            else izEngel = 'alım açılamadı';
          }
          else if (signal.action === 'SELL') izEngel = 'kapatılacak pozisyon yok';
          // SHORT sinyalleri bilinçli olarak işlenmiyor (spot piyasa) —
          // CLAUDE.md'de yazılı; iz bunu görünür kılar.
          else izEngel = `'${signal.action}' motor tarafından işlenmiyor`;
        }

        izKaydet({
          index: i,
          time: currentCandle.time || null,
          timestamp,
          action: signal.action,
          price: currentCandle.close,
          reason: signal.reason || null,
          executed: izUygulandi,
          blockedBy: izUygulandi ? null : izEngel,
          hasPosition: kitap.adet > 0,
          stopLossPct: Number.isFinite(signal.stopLossPct) ? signal.stopLossPct : null,
          takeProfitPct: Number.isFinite(signal.takeProfitPct) ? signal.takeProfitPct : null,
          indicators: signal.indicators || null
        });
      }

      // TAKİP EDEN STOP — sıralama burada kritik.
      //
      // `signal.updateStop` bu barın KAPANIŞINDAN hesaplanmış bir seviyedir.
      // Bu barın stop kontrolüne dahil etmek, stop'un barın düşüğü oluşmadan
      // önce oraya taşınmış olduğunu varsaymak olurdu — düpedüz ileriye bakma.
      // Bu yüzden bar sonunda uygulanır, SONRAKİ bardan itibaren geçerlidir.
      //
      // Yalnızca sıkılaştırma yönünde: gevşeyen bir "takip eden" stop, stop
      // olmaktan çıkar.
      /**
       * KADEME STOP ORANININ SONRADAN GÜNCELLENMESİ.
       *
       * Emirle gelen oran pozisyon açılışında donar (yukarıdaki not). Strateji
       * yine de açıkça değiştirebilsin diye bu kapı var — ama SIKILAŞTIRMA
       * şartı YOKTUR: oran bir koruma değil, stratejinin tarif ettiği kuraldır.
       * `0` göndermek kuralı kapatır.
       */
      if (kitap.adet > 0 && Number.isFinite(signal.lotStopPct)) {
        const poz = kitap.get(hedefYon(signal, 'lotStopPct'));
        if (poz) poz.lotStopPct = signal.lotStopPct > 0 ? signal.lotStopPct : 0;
      }

      /**
       * ⚠ HEDEF TARAF BU BARDA KAPANMIŞ OLABİLİR.
       *
       * Strateji `evaluate`de konuşur, güncelleme bar SONUNDA uygulanır ve
       * ikisinin ARASINDA çıkış denetimi çalışır. Strateji "long'un stopunu
       * şuraya al" derken long o barda hedefe/stopa/kademe stopuna değip
       * kapanmış olabilir; defterde short duruyorsa `kitap.adet > 0` hâlâ
       * doğrudur ama `get('long')` artık `null` döner.
       *
       * Ölçüldü: `tpModu: 'ortalama'` koşusu tam burada çöküyordu
       * (`Cannot read properties of null`). Kapanmış tarafa yapılacak bir
       * güncelleme YOKTUR — sessizce atlanır, çünkü bu bir hata değil,
       * sıradan bir yarış durumudur.
       */
      if (kitap.adet > 0 && Number.isFinite(signal.updateStop) && kitap.get(hedefYon(signal, 'updateStop'))) {
        const poz = kitap.get(hedefYon(signal, 'updateStop'));
        const yeni = signal.updateStop;
        // Sıkılaştırma yönü short'ta terstir: stop AŞAĞI inerse yaklaşır.
        const sikilastirir = !Number.isFinite(poz.stopPrice)
          || (poz.side === 'short' ? yeni < poz.stopPrice : yeni > poz.stopPrice);
        if (sikilastirir) {
          poz.stopPrice = yeni;
          poz.strategyStopAt = i;
        }
      }

      /**
       * HEDEF GÜNCELLEME — `updateStop`un simetriği.
       *
       * NEDEN GEREKLİ: Pine'da yaygın kalıp, çıkış seviyelerini pozisyon
       * AÇILDIKTAN SONRA bildirmektir (`strategy.entry` bir barda,
       * `strategy.exit` pozisyon açıkken her barda). Bu kalıpta giriş
       * sinyalinde hedef HENÜZ BİLİNMEZ ve motor varsayılan %4'e düşerdi —
       * yani stratejinin kendi hedefi hiç uygulanmazdı. Ölçüldü: aynı
       * kuralın Pine ve JS sürümleri arasında işlem sayısı %42-69 ayrışıyordu
       * ve Pine tarafı daha İYİ görünüyordu; iyimser sapmanın kaynağı buydu.
       *
       * `updateStop` gibi BAR SONUNDA uygulanır (aynı ileriye bakma gerekçesi).
       * Stop'tan farkı: sıkılaştırma şartı YOKTUR — hedef bir koruma değil,
       * stratejinin bildirdiği seviyedir; onu kısıtlamak stratejiyi değiştirmek
       * olurdu.
       */
      // Kapanmış tarafa güncelleme yok — `updateStop`taki aynı yarış durumu.
      if (kitap.adet > 0 && Number.isFinite(signal.updateTarget) && kitap.get(hedefYon(signal, 'updateTarget'))) {
        const poz = kitap.get(hedefYon(signal, 'updateTarget'));
        const gecerli = poz.side === 'short'
          ? signal.updateTarget < poz.entryPrice
          : signal.updateTarget > poz.entryPrice;
        if (gecerli) {
          poz.takeProfitPrice = signal.updateTarget;
          poz.strategyTargetAt = i;
        }
      }

      /**
       * FİNANSMAN TAHAKKUKU — bar bar, açık nominal üzerinden.
       *
       * Sıralama: stop/hedef kontrolünden SONRA, yani kapanan barın finansmanı
       * ödenmez. Nakitten burada düşülür; işlem kârına atfı kapanışta yapılır.
       *
       * GERÇEK SERİ varsa bu barın zaman aralığına düşen funding damgaları
       * bulunur ve YÖN DUYARLI uygulanır: oran pozitifken long öder, short
       * alır. Seri yoksa kötümser sabit modele düşülür (iki yönde de gider).
       */
      if (perpetual) {
        // Finansman POZİSYON BAŞINA tahakkuk eder ve yön duyarlıdır: iki
        // taraf birden açıkken biri öderken diğeri alır. Tek pozisyonda
        // döngü tek tur atar, tutar eskisiyle aynıdır.
        for (const poz of kitap.acikPozisyonlar()) {
          let ucret = 0;

          if (gercekFunding) {
            const barSonu = currentCandle.time + (barSaat * 60 * 60 * 1000);
            // İmleç ileri yürür: seri ve mumlar zaman sıralı olduğu için her
            // damga yalnızca bir kez ödenir. İmleci bu barın başına çekmek
            // tekrarlanabilir bir işlemdir — ikinci taraf aynı damgaları görür.
            while (fundingImlec < fundingSerisi.length && fundingSerisi[fundingImlec].time < currentCandle.time) {
              fundingImlec++;
            }
            let k = fundingImlec;
            while (k < fundingSerisi.length && fundingSerisi[k].time < barSonu) {
              const nominal = poz.amount * currentCandle.close;
              // Long pozitif oranda ÖDER, short ALIR.
              const yonKatsayi = poz.side === 'short' ? -1 : 1;
              ucret += nominal * fundingSerisi[k].rate * yonKatsayi;
              k++;
            }
          } else if (barBasiFunding > 0) {
            ucret = poz.amount * currentCandle.close * barBasiFunding;
          }

          if (ucret !== 0) {
            capital -= ucret;
            poz.fundingPaid = (poz.fundingPaid || 0) + ucret;
            totalFunding += ucret;
          }
        }
      }

      // Compute Equity Curve & Drawdown
      // Short'ta pozisyonun değeri = kilitli marj + gerçekleşmemiş P&L.
      // Açık yönlerin değeri TOPLANIR; hedge'de net sıfır olsa bile iki
      // tarafın işaretlenmiş değeri ayrı ayrı sermayeye girer.
      const acikPozlar = kitap.acikPozisyonlar();
      const currentPositionValue = acikPozlar
        .reduce((toplam, poz) => toplam + markDeger(poz, currentCandle.close), 0);
      const totalEquity = capital + currentPositionValue;

      if (totalEquity > peakCapital) {
        peakCapital = totalEquity;
      }

      const drawdown = ((peakCapital - totalEquity) / peakCapital) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      const barTime = this.parseSafeTimestamp(currentCandle);
      equityCurve.push({
        time: barTime,
        value: +totalEquity.toFixed(2),
        drawdownPct: +drawdown.toFixed(2)
      });

      // Intrabar extremes: a position is worth more at the bar high and less at
      // the bar low, which is what run-up / drawdown "(intrabar)" measures.
      const deployed = kitap.kullanilanMarj();
      if (deployed > maxCapitalDeployed) maxCapitalDeployed = deployed;
      capitalDeployedSum += deployed;

      // Bar içi uçlar: short'ta yüksek fiyat ZARAR, düşük fiyat kârdır.
      // Her taraf KENDİ lehine/aleyhine ucundan işaretlenir — aynı bar ucu
      // long'a kâr, short'a zarardır; tek bir fiyat seçmek iki yön açıkken
      // birini yanlış tarafından ölçerdi.
      const barUcDeger = (lehine) => acikPozlar.reduce((toplam, poz) => {
        const kisaPoz = poz.side === 'short';
        const px = lehine
          ? (kisaPoz ? currentCandle.low : currentCandle.high)
          : (kisaPoz ? currentCandle.high : currentCandle.low);
        return toplam + markDeger(poz, px);
      }, 0);

      equitySeries.push({
        index: i,
        time: barTime,
        close: totalEquity,
        high: capital + barUcDeger(true),
        low: capital + barUcDeger(false),
        deployed
      });

      buyHoldSeries.push({
        time: barTime,
        value: buyHoldUnits * currentCandle.close
      });

      if (equityCurve.length > 1) {
        const prevValue = equityCurve[equityCurve.length - 2].value;
        const dReturn = (totalEquity - prevValue) / prevValue;
        dailyReturns.push(dReturn);
      }

      // Koruma katmanı barın SONUNDA değerlendirilir: bu barın kapanışları
      // ve sermayesi hesaba girsin, sonraki barın girişini etkilesin.
      korumalar.barSonu(i, totalEquity);
    }

    // A position still open on the last bar stays open — its unrealised result
    // is reported as Open PnL instead of being force-closed, which is what
    // makes the "Open PnL" metric meaningful.
    const lastCandle = ohlcvData[ohlcvData.length - 1];
    let openPnl = 0;
    let openTrade = null;
    const acikKayitlar = [];

    // Açık YÖN BAŞINA bir kayıt; açık kâr toplanır. Tek yön açıkken bu
    // eski davranışın birebir aynısıdır.
    for (const poz of kitap.acikPozisyonlar()) {
      const grossCost = poz.cost;
      const kisa = poz.side === 'short';
      const markValue = (kisa || poz.perp)
        ? poz.cost + kapanisKar(poz, lastCandle.close)
        : netProceeds(poz.amount, lastCandle.close);
      // Açık pozisyonun ödenmiş finansmanı gerçekleşmiş bir giderdir; nakitten
      // zaten düştü, raporlanan açık kâra da yansıması gerekir.
      const pozAcikKar = markValue - grossCost - (poz.fundingPaid || 0);
      openPnl += pozAcikKar;

      const kayit = {
        id: `open-${trades.length + 1}`,
        symbol: 'BACKTEST',
        type: 'OPEN',
        direction: kisa ? 'short' : 'long',
        entryPrice: poz.entryPrice,
        markPrice: lastCandle.close,
        amount: poz.amount,
        profitUSDT: +pozAcikKar.toFixed(2),
        profitPct: +((pozAcikKar / grossCost) * 100).toFixed(2),
        reason: `Bar sonunda açık pozisyon${poz.tranches > 1 ? ` (${poz.tranches} kademe)` : ''}`,
        entryTime: poz.entryTime,
        entryIndex: poz.entryIndex,
        tranches: poz.tranches || 1,
        barsInTrade: (ohlcvData.length - 1) - poz.entryIndex,
        kind: 'acik', sebepKodu: 'acik', barIndex: ohlcvData.length - 1
      };
      trades.push(kayit);
      acikKayitlar.push(kayit);
    }

    /**
     * `openTrade` TEKİL alandır — panelin ve mevcut ölçüm araçlarının bugünkü
     * sözleşmesi bu. İki yön birden açıkken tek kayıt göstermek diğerini
     * sessizce yutardı; bu yüzden kayıtların tamamı `openTradeler` alanında
     * ayrıca veriliyor. Tekil alan, panel çoklu pozisyona geçtiğinde emekli
     * olacak (M4b Aşama 3).
     */
    openTrade = acikKayitlar.length ? acikKayitlar[0] : null;

    // Equity = cash + mark value of anything still held
    const openMarkValue = kitap.acikPozisyonlar().reduce((toplam, poz) => toplam + ((poz.side === 'short' || poz.perp)
      ? poz.cost + kapanisKar(poz, lastCandle.close)
      : netProceeds(poz.amount, lastCandle.close)), 0);
    const finalEquity = capital + openMarkValue;

    // Performance Metrics Calculations — equity based, so an open position counts
    const totalProfitUSDT = finalEquity - initialCapital;
    const totalReturnPct = (totalProfitUSDT / initialCapital) * 100;

    const winningTrades = closedTrades.filter(t => t.profitUSDT > 0);
    const losingTrades = closedTrades.filter(t => t.profitUSDT <= 0);

    const winRatePct = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;
    const grossProfit = winningTrades.reduce((a, b) => a + b.profitUSDT, 0);
    const grossLoss = Math.abs(losingTrades.reduce((a, b) => a + b.profitUSDT, 0));
    const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 10.0 : 0) : +(grossProfit / grossLoss).toFixed(2);

    const avgWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;
    const winRatio = closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0;
    const lossRatio = 1 - winRatio;
    const expectancy = +( (winRatio * avgWin) - (lossRatio * avgLoss) ).toFixed(2);

    let currentWinStreak = 0, maxWinStreak = 0;
    let currentLossStreak = 0, maxLossStreak = 0;

    for (let t of closedTrades) {
      if (t.profitUSDT > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
      } else {
        currentLossStreak++;
        currentWinStreak = 0;
        if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
      }
    }

    // Özet Sharpe analitikle AYNI hesaptan (`gunlukOranlar`): eskiden burada
    // bar getirisi × √(yıllık bar) vardı, analiz paneli başka bir sayı
    // gösteriyordu ve 1m'de çarpan gürültüyü ~725 kat büyütüyordu.
    const sharpeRatio = +gunlukOranlar(equitySeries.map(s => s.time), equitySeries.map(s => s.close), timeframe).sharpe.toFixed(2);

    // Deal yaşam döngüsü: olay listesinden (`trades`) kurulur, sebep metni
    // ayrıştırılmaz — motorun yazdığı yapısal alanlar okunur.
    const dealler = ledger.kur(trades);

    const result = {
      strategyName,
      strategyConfig,
      initialCapital,
      finalCapital: +finalEquity.toFixed(2),
      cashBalance: +capital.toFixed(2),
      openPnl: +openPnl.toFixed(2),
      // Koruma katmanının künyesi — kapalıyken `{ aktif: false }`.
      korumalar: korumalar.ozet(),
      openTrade,
      // Açık pozisyonların TAMAMI. `openTrade` bunun ilk elemanıdır.
      openTradeler: acikKayitlar,
      totalProfitUSDT: +totalProfitUSDT.toFixed(2),
      totalReturnPct: +totalReturnPct.toFixed(2),
      winRatePct: +winRatePct.toFixed(2),
      totalTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      maxWinStreak,
      maxLossStreak,
      maxDrawdownPct: +maxDrawdown.toFixed(2),
      // Perpetual koşularda ödenen toplam finansman; spotta her zaman 0.
      // Gerçek seride NEGATİF olabilir (short funding aldıysa).
      totalFunding: +totalFunding.toFixed(2),
      fundingSource: perpetual ? (gercekFunding ? 'gercek' : 'sabit-varsayim') : null,
      // Vadeli kurulum künyesi: sonuç okunurken hangi varsayımlarla ölçüldüğü
      // görünmezse rakamlar yanlış yorumlanır.
      leverage: kaldirac,
      liquidations,
      ...(girisYasak ? { girisYasakEngeli: yasakEngeli } : {}),
      // Limit emirle açılan pozisyon sayısı — piyasa emriyle karışmasın.
      limitFills,
      /**
       * EMİR DEFTERİ KÜNYESİ. Yok sayılan emirler SESSİZ KALMAMALI: ters yönlü
       * ya da sermaye yetmediği için düşen emirler, DCA merdiveninin
       * beklenenden sığ kurulduğu anlamına gelir ve sonuç öyle okunmalıdır.
       */
      orderBook: {
        dolum: defterDolum,
        tersYonYokSayilan: defterTersYon,
        sermayeYetmeyen: defterSermayeYetmedi,
        tarafTavaniReddetti: defterTavanReddedilen,
        kalanAcikEmir: emirDefteri.size
      },
      /**
       * Kaç lot kendi stopunda kapandı. Sıfır olması ya kural hiç
       * çalışmadı ya hiç tetiklenmedi demektir; ikisi de sessiz kalmamalı.
       */
      kademeStop: { kapanan: lotStopKapanis, enDerin: enDerinKademe },
      marginTiersSource: perpetual ? kademeKaynak : null,
      likidasyonModeli: perpetual ? hesap.likidasyonModeli : null,
      profitFactor,
      expectancy,
      sharpeRatio,
      trades,
      /**
       * DEAL YAŞAM DÖNGÜSÜ (`lib/backtest/ledger.js`).
       *
       * `trades` olay listesidir — bir deal'in nerede başlayıp bittiği
       * oradan doğrudan okunamaz. `deals` o soruyu cevaplar: her kayıt
       * girişlerini, kısmi çıkışlarını, kapanış sebebini, ömrünü ve dolan
       * emir kimliklerini taşır. Sebep METNİ ayrıştırılmaz.
       */
      deals: dealler,
      dealSummary: ledger.ozet(dealler),
      equityCurve,
      analytics: computeAnalytics({
        closedTrades,
        equitySeries,
        buyHoldSeries,
        initialCapital,
        finalEquity,
        openPnl,
        openTrade,
        totalCommission,
        maxCapitalDeployed,
        avgCapitalDeployed: equitySeries.length > 0 ? capitalDeployedSum / equitySeries.length : 0,
        timeframe
      })
    };

    // ISINMA UYARISI — "strateji az işlem açtı" ile "veri kısa" farkı.
    //
    // ATR(300) + 500 mum kurulumunda barların %60'ı ısınmada geçiyor ve
    // strateji tek işlem açmış gibi görünüyor. Ayar bozuk değil, örneklem
    // kısa; sonuç bunu kendisi söylemeli. Strateji sınıfı `static warmupBars`
    // ile bildirir (bildirmezse hesap yapılmaz).
    try {
      const Sinif = catalog.get(strategyName) && catalog.get(strategyName).Class;
      const wb = Sinif && Sinif.warmupBars;
      if (wb) {
        const bar = typeof wb === 'function' ? wb(strategyConfig) : +wb;
        if (Number.isFinite(bar) && bar > 0) {
          const oran = bar / ohlcvData.length;
          result.warmup = {
            bars: Math.round(bar),
            candles: ohlcvData.length,
            usableBars: Math.max(0, ohlcvData.length - Math.round(bar)),
            pctOfSample: +(oran * 100).toFixed(1),
            // %25 keyfî ama bir yerden başlamak gerekiyor: ısınma örneklemin
            // dörtte birini yiyorsa işlem sayısı stratejiyi değil pencereyi
            // ölçer.
            warning: oran > 0.25
              ? `Isınma ${Math.round(bar)} bar — örneklemin %${(oran * 100).toFixed(0)}'i. Sonuç stratejiyi değil pencere uzunluğunu ölçüyor olabilir; mum sayısını artırın ya da periyotları kısaltın.`
              : null
          };
        }
      }
    } catch (err) { /* ısınma bilgisi kritik değil */ }

    // Ayar uyarıları: "strateji kötü" ile "ayar tutarsız"ı ayırır. Tarayıcıdaki
    // `configWarnings` ile aynı ilke — Grid'in BTC'ye uymayan kanal sınırları
    // gibi, sonuç geçersiz değil ama ölçtüğü şey strateji olmayabilir.
    try {
      const Sinif2 = catalog.get(strategyName) && catalog.get(strategyName).Class;
      if (Sinif2 && typeof Sinif2.configWarnings === 'function') {
        const uyarilar = Sinif2.configWarnings(strategyConfig) || [];
        if (uyarilar.length) result.configWarnings = uyarilar;
      }
    } catch (err) { /* uyarı üretilemedi */ }

    /**
     * EMİR DEFTERİ UYARISI — "sonuçlar sıfır" sorusunun cevabı.
     *
     * Reddedilen emirler sessiz kalmamalı. Somut vaka: Pine'dan içe aktarılan
     * DCA botunda emir boyutu "Sermaye %" moduna alınıp baz emre 150 yazıldı.
     * O, sermayenin %150'si demektir; 769 emir sermaye yetmediği için
     * reddedildi, hiçbir işlem açılmadı ve panel yalnızca sıfırlar gösterdi.
     * Motor sebebi biliyordu, söylemiyordu.
     */
    if (defterDolum > 0 || defterSermayeYetmedi > 0 || defterTersYon > 0 || defterTavanReddedilen > 0) {
      const defterUyari = [];
      if (defterTavanReddedilen > 0) {
        defterUyari.push(`${defterTavanReddedilen} emir TARAF TAVANI (K5) yüzünden dolmadı`
          + ` — taraf başına sermaye sınırı ${kitap.tarafTavanPct}%. Merdiven bu tavana`
          + ' dayandığında derinleşmeyi durdurur; daha derin merdiven isteniyorsa'
          + ' tavan yükseltilmeli ya da basamak tutarı düşürülmeli.');
      }
      if (defterSermayeYetmedi > 0) {
        defterUyari.push(`${defterSermayeYetmedi} emir SERMAYE YETMEDİĞİ için dolmadı`
          + (defterDolum === 0 ? ' ve hiçbir işlem açılmadı' : '')
          + '. Emir boyutu "yüzde" modundaysa değerler sermayenin yüzdesi olarak okunur.');
      }
      if (defterTersYon > 0) {
        /**
         * Bu uyarı iki BAMBAŞKA duruma düşebiliyor ve ikisi ayrılmalı:
         * strateji zaten tek yönlüyse bu bir bilgi, iki yönlüyse ARIZADIR.
         */
        defterUyari.push(hedgeIsteyen
          ? `${defterTersYon} emir ters yönlü olduğu için yok sayıldı — bu strateji İKİ YÖNLÜ`
            + ' çalışır ama hedge KAPATILMIŞ. Short bacağı tamamen devre dışı;'
            + ' sonuçlar tek bacaklı bir botu gösterir.'
          : `${defterTersYon} emir ters yönlü olduğu için yok sayıldı (motor tek pozisyon taşır).`);
      }
      if (defterUyari.length) {
        result.configWarnings = (result.configWarnings || []).concat(defterUyari);
      }
    }

    /**
     * KORUMA UYARISI — "strateji sinyal üretmedi" ile "koruma freni indi"
     * ayrımı. İkisi de az işlem olarak görünür ama sebepleri zıttır ve
     * birincisinde ayar, ikincisinde koruma eşiği gözden geçirilir.
     */
    if (korumaEngeli > 0) {
      const tetik = Object.entries(korumalar.tetikleyenler)
        .map(([ad, n]) => `${ad}×${n}`).join(', ');
      result.configWarnings = (result.configWarnings || []).concat(
        `${korumaEngeli} giriş KORUMA katmanı tarafından engellendi (${tetik}).`
      );
    }

    if (korumalar.bilinmeyenAnahtarlar.length) {
      result.configWarnings = (result.configWarnings || []).concat(
        `Bilinmeyen koruma anahtarı: ${korumalar.bilinmeyenAnahtarlar.join(', ')} — `
        + 'bu koruma HİÇ çalışmadı. Yanlış yazılmış bir ad, koruma var sanıp korumasız koşmaktır.'
      );
    }

    /**
     * PINE FARK SAYAÇLARI (Pusula P4): içe aktarılan Pine stratejisi motorla birebir
     * örtüşmeyen bir yapı kullandıysa (yön çevirme gecikmesi, ikinci kimlik, qty, gevşek
     * stop) sayaçlar sonuca yazılır — panel 'Pine ile birebir değil' uyarısını buradan gösterir.
     */
    if (strategy && strategy.sayac && strategy.bilgi && strategy.bilgi.agac) {
      result.pineFark = { ...strategy.sayac };
    }

    if (trace) {
      // Özet: kaç sinyal üretildi, kaçı uygulandı. "Strateji az işlem açıyor"
      // ile "sinyalleri yutuluyor" ancak bu oranla ayrılır.
      const toplam = Object.values(trace.counts).reduce((a, b) => a + b, 0);
      // Halka tamponu zaman sırasına aç: [en eski … en yeni].
      const son = izSon.slice(izSonBas).concat(izSon.slice(0, izSonBas));
      const signals = trace.signals.concat(son);
      result.trace = {
        ...trace,
        signals,
        totalSignals: toplam,
        // TAM sayaç — örneklemden değil (eskiden örneklemden sayılıyor,
        // kırpılınca "toplam" ile tutmuyordu).
        executedInSample: trace.executedTotal,
        // `truncated` ortadan düşen sinyal sayısı; listede ilk IZ_BAS + son IZ_SON var.
        sampleSize: signals.length
      };
    }

    return result;
  }

  /**
   * Parametre optimizasyonu — gerçeklemesi `lib/backtest/optimize.js`.
   *
   * ⚠ "En iyi satır" bir GEREKÇE değildir: bu depoda bir değerin
   * benimsenmesi için boyutun ayrıştırıcı olması ve değerin tek varlıkta
   * değil dışarıda da geçmesi şartı var (`PLAN-RANGE-VPFR.md` §11 md.3).
   */
  static optimizeParameters(strategyName, baseConfig, ohlcvData, initialCapital = 10000.0, timeframe = '1h') {
    return optimize.optimizeParameters(Backtester, strategyName, baseConfig, ohlcvData, initialCapital, timeframe);
  }

  /**
   * Walk-forward (kayan pencere, %70 eğitim / %30 test) — `lib/backtest/optimize.js`.
   */
  static runWalkForward(strategyName, baseConfig, ohlcvData, initialCapital = 10000.0, timeframe = '1h', secenek = {}) {
    return optimize.runWalkForward(Backtester, strategyName, baseConfig, ohlcvData, initialCapital, timeframe, secenek);
  }

  /**
   * İzleme listesi taraması — `lib/backtest/scan.js`.
   */
  static async scanWatchlist(watchlist = [], baseConfig = {}, exchangeOrFn, timeframe = '1h', candlesCount = 500, initialCapital = 10000.0) {
    return scan.scanWatchlist(Backtester, watchlist, baseConfig, exchangeOrFn, timeframe, candlesCount, initialCapital);
  }
}

module.exports = Backtester;
