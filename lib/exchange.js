const ccxt = require('ccxt');
const db = require('./database');
const venues = require('./venues');
const borsaKurallari = require('./exchangeRules');

class ExchangeConnector {
  // Binance caps klines at 1000 per request; 5000 bars is ~3.5 days on 1m,
  // 208 days on 1h and 13 years on 1d — deep enough for the chart and backtests.
  static CHUNK_SIZE = 1000;
  /**
   * Seri başına tavan. Panel ve backtest için 5000 bilinçli bir varsayılan:
   * grafik zaten bu kadarını çizmiyor ve her `fetchOHLCV` çağrısı önbelleği
   * bu limitle okuyor, yani tavan doğrudan bellek maliyeti.
   *
   * ⚠ ÖLÇÜM İÇİN YÜKSELTİLEBİLİR — `ExchangeConnector.MAX_CANDLES = 20000`
   * gibi. 2026-09-01'de ölçüldü (§11.18): vadeli ölçüm penceresini borsanın
   * listeleme tarihi değil BU SABİT belirliyordu (4h'te 2.3 yıl, 1h'te 7 ay),
   * oysa borsada perp geçmişi 2019-09'a kadar var. Yükseltmek yalnızca
   * ölçüm/çekme süreçlerinde yapılmalı, sunucu sürecinde DEĞİL.
   */
  static MAX_CANDLES = parseInt(process.env.MAX_CANDLES, 10) || 5000;

  constructor(config = {}) {
    if (config.mode === 'live') {
      db.addLog('ERROR', 'Live mod henüz desteklenmiyor, paper moda geçildi.');
      this.mode = 'paper';
    } else {
      this.mode = config.mode || 'paper';
    }

    this.exchangeId = config.exchange || 'binance';
    this.symbol = config.symbol || 'BTC/USDT';
    // Piyasa tipi artık bağlayıcı: hem hangi ccxt sınıfının kurulacağını hem
    // mumların hangi önbellek kovasına yazılacağını belirler.
    this.marketType = venues.normalizeMarket(config.marketType);
    this.credentials = { apiKey: config.apiKey || '', apiSecret: config.apiSecret || '' };
    // Kaldıraç gibi vadeli ayarları emir anında okunuyor.
    this.config = config || {};

    // Paper Trading Wallet State with persistence
    const savedWallet = db.loadWalletState();
    const initialUSDT = (config.paperWallet && config.paperWallet.USDT) || 10000.0;

    if (savedWallet && savedWallet.paperBalances) {
      this.paperBalances = savedWallet.paperBalances;
      this.paperPositions = savedWallet.paperPositions || [];
    } else {
      this.paperBalances = {
        USDT: initialUSDT,
        BTC: 0.0,
        ETH: 0.0,
        SOL: 0.0,
        AVAX: 0.0,
        XRP: 0.0,
        BNB: 0.0,
        LINK: 0.0
      };
      this.paperPositions = [];
      this.saveWalletState();
    }

    this.initRealExchange(this.exchangeId, config);
  }

  saveWalletState() {
    db.saveWalletState({
      paperBalances: this.paperBalances,
      paperPositions: this.paperPositions
    });
  }

  resetWallet(initialUSDT = 10000.0) {
    this.paperBalances = {
      USDT: initialUSDT,
      BTC: 0.0,
      ETH: 0.0,
      SOL: 0.0,
      AVAX: 0.0,
      XRP: 0.0,
      BNB: 0.0,
      LINK: 0.0
    };
    this.paperPositions = [];
    this.saveWalletState();
  }

  /**
   * İstemci artık `lib/venues.js` üzerinden kuruluyor.
   *
   * ESKİ HÂLİ SPOTA KİLİTLİYDİ (`defaultType: 'spot'`, `fetchMarkets: ['spot']`)
   * — vadeli sembolleri hiç göremezdi. Piyasa tipi `perp` olduğunda venue
   * katmanı doğru ccxt sınıfını seçer (Binance'te vadeli AYRI bir sınıftır:
   * `binanceusdm`).
   */
  initRealExchange(exchangeId, config = {}) {
    try {
      this.exchangeId = (exchangeId || 'binance').toLowerCase();
      if (config.marketType) this.marketType = venues.normalizeMarket(config.marketType);
      if (config.apiKey !== undefined || config.apiSecret !== undefined) {
        this.credentials = { apiKey: config.apiKey || '', apiSecret: config.apiSecret || '' };
      }
      this.realExchange = venues.client(this.exchangeId, this.marketType, this.credentials);
      db.addLog('INFO', `Veri Sağlayıcı: ${this.exchangeId.toUpperCase()} / ${this.marketType.toUpperCase()}`);
    } catch (err) {
      console.error('Venue init error, fallback to binance spot:', err.message);
      this.exchangeId = 'binance';
      this.marketType = 'spot';
      this.realExchange = venues.client('binance', 'spot');
    }
  }

  /** Önbellek kovası: borsa + piyasa tipi. Spot ile perp asla karışmaz. */
  kaynak() {
    return { venue: this.exchangeId, market: this.marketType };
  }

  updateConfig(config) {
    if (config.mode === 'live') {
      db.addLog('ERROR', 'Live mod henüz desteklenmiyor, paper moda geçildi.');
      this.mode = 'paper';
    } else {
      this.mode = config.mode || 'paper';
    }

    if (config.symbol) this.symbol = config.symbol;

    // Piyasa tipi değişimi de istemciyi yeniden kurmalı: spot istemcisi vadeli
    // sembolleri bilmez, `market not found` ile ölür.
    const yeniPiyasa = config.marketType ? venues.normalizeMarket(config.marketType) : this.marketType;
    if ((config.exchange && config.exchange.toLowerCase() !== this.exchangeId) || yeniPiyasa !== this.marketType) {
      this.initRealExchange(config.exchange || this.exchangeId, { ...config, marketType: yeniPiyasa });
    }
  }

  /**
   * Fetch current market ticker
   */
  async fetchTicker(symbol = null) {
    const targetSymbol = symbol || this.symbol;
    try {
      const ticker = await this.realExchange.fetchTicker(targetSymbol);
      return ticker;
    } catch (err) {
      db.addLog('ERROR', `[${targetSymbol}] Fiyat verisi (Ticker) borsadan alınamadı: ${err.message}`);
      return null;
    }
  }

  /**
   * One request for every symbol's price instead of one request per bot.
   * With N bots the per-symbol version issued N calls every tick, which is what
   * made the engine crawl (and get rate-limited) as bots were added.
   */
  async fetchTickers(symbols = []) {
    if (!symbols || symbols.length === 0) return {};

    try {
      const map = await this.realExchange.fetchTickers(symbols);
      return map || {};
    } catch (err) {
      db.addLog('WARN', `Toplu fiyat alınamadı (${symbols.length} varlık): ${err.message}`);
      return {};
    }
  }

  /**
   * Fetch OHLCV Candlesticks with Freshness Check & Pagination
   */
  async fetchOHLCV(symbol = null, timeframe = '1h', limit = 500) {
    const targetSymbol = symbol || this.symbol;
    const tfMs = this.parseTimeframeMs(timeframe);
    const target = Math.min(Math.max(parseInt(limit) || 500, 1), ExchangeConnector.MAX_CANDLES);

    const cached = db.getCandleCache(targetSymbol, timeframe, ExchangeConnector.MAX_CANDLES, this.kaynak());
    const isFresh = cached.length > 0 && (Date.now() - cached[cached.length - 1].time) < tfMs;

    if (isFresh && cached.length >= target) {
      return cached.slice(-target);
    }

    try {
      // --- 1. Forward top-up: bring the newest candles up to date ---
      if (!isFresh) {
        let since;
        if (cached.length > 0) {
          const gapPeriods = (Date.now() - cached[cached.length - 1].time) / tfMs;
          // Page forward only when one request can close the gap; otherwise ask
          // for the latest candles so a long-idle cache still catches up.
          if (gapPeriods <= ExchangeConnector.CHUNK_SIZE) since = cached[cached.length - 1].time;
        }
        await this.fetchCandleChunk(targetSymbol, timeframe, since, ExchangeConnector.CHUNK_SIZE);
      }

      // --- 2. Backward backfill: walk history back until `target` bars exist ---
      let have = db.getCandleCache(targetSymbol, timeframe, ExchangeConnector.MAX_CANDLES, this.kaynak());
      let guard = 0;
      // Tur tavanı hedeften TÜRETİLİR. Sabit 15 iken, bir sayfa 1000 bar
      // olduğu için 15.000 barlık GİZLİ bir tavan vardı: `target` daha büyük
      // olsa bile döngü orada kesiliyor ve seri sessizce eksik kalıyordu.
      // (§11.18'de MAX_CANDLES yükseltilince bu ikinci tavan ortaya çıktı.)
      const turTavani = Math.ceil(target / ExchangeConnector.CHUNK_SIZE) + 5;

      while (have.length < target && guard < turTavani) {
        guard++;
        const oldest = have.length > 0 ? have[0].time : Date.now();
        const chunk = Math.min(ExchangeConnector.CHUNK_SIZE, target - have.length);
        const since = oldest - (chunk * tfMs);

        const added = await this.fetchCandleChunk(targetSymbol, timeframe, since, chunk);
        if (added === 0) break; // exchange has no earlier history

        const next = db.getCandleCache(targetSymbol, timeframe, ExchangeConnector.MAX_CANDLES, this.kaynak());
        if (next.length <= have.length) break; // no progress — stop instead of looping
        have = next;
      }

      return have.slice(-target);

    } catch (err) {
      db.addLog('WARN', `[${targetSymbol}] Borsa OHLCV güncelleme hatası: ${err.message}, önbellek kullanılıyor.`);
      return cached.length > 0 ? cached.slice(-target) : [];
    }
  }

  /**
   * Fetches one page of candles and merges it into the cache.
   * Returns how many candles came back.
   */
  async fetchCandleChunk(symbol, timeframe, since, limit) {
    const raw = await this.realExchange.fetchOHLCV(symbol, timeframe, since, Math.min(limit, ExchangeConnector.CHUNK_SIZE));
    if (!raw || raw.length === 0) return 0;

    const formatted = raw.map(c => ({
      time: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5]
    }));

    db.saveCandleCache(symbol, timeframe, formatted, this.kaynak());
    return formatted.length;
  }

  /**
   * Tarihsel funding oranlarını çeker ve depoya yazar.
   *
   * Vadeli backtest'in gerçek maliyet kaynağı budur: sabit oran varsayımı
   * (8 saatte %0.01) piyasa geriliminin yaşandığı dönemleri kaçırır — funding
   * o dönemlerde 10 katına çıkabilir ve kaldıraçlı bir pozisyonun sonucunu
   * tek başına belirler.
   */
  async fetchAndStoreFunding(symbol = null, since = undefined) {
    const targetSymbol = symbol || this.symbol;
    if (this.marketType !== 'perp') {
      throw new Error('Funding yalnızca vadeli (perp) piyasada vardır.');
    }
    try {
      const kayitlar = await venues.fetchFundingHistory(this.exchangeId, targetSymbol, since, this.credentials);
      const n = db.saveFundingHistory(targetSymbol, kayitlar, this.kaynak());
      db.addLog('SUCCESS', `💰 ${targetSymbol} funding geçmişi: ${n} kayıt (${this.exchangeId}).`);
      return n;
    } catch (err) {
      db.addLog('ERROR', `[${targetSymbol}] Funding geçmişi alınamadı: ${err.message}`);
      return 0;
    }
  }

  /** Kontrat özellikleri (komisyon, min nominal, kaldıraç, bakım marjı kademeleri). */
  async contractSpecs(symbol = null) {
    return venues.contractSpecs(this.exchangeId, this.marketType, symbol || this.symbol, this.credentials);
  }

  /**
   * Import Custom Historical Candle Data (CSV/JSON upload)
   */
  importCustomCandles(symbol, timeframe, candleList) {
    if (!candleList || candleList.length === 0) {
      throw new Error('Yüklenecek mum verisi boş olamaz.');
    }
    const formatted = candleList.map(c => ({
      time: typeof c.time === 'string' ? new Date(c.time).getTime() : c.time,
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume || 0)
    })).filter(c => !isNaN(c.time) && !isNaN(c.close));

    db.saveCandleCache(symbol, timeframe, formatted);
    db.addLog('SUCCESS', `📂 Özel Geçmiş Mum Verisi Yüklendi: ${symbol} (${timeframe}, ${formatted.length} Mum)`);
    return formatted.length;
  }

  /**
   * Preload & Cache Historical Candles for Watchlist
   */
  async preloadWatchlistCandles(watchlist, timeframe = '1h', limit = 500) {
    if (!watchlist || watchlist.length === 0) return;

    db.addLog('INFO', `⚡ İzleme Listesindeki ${watchlist.length} Varlığın Fiyat Geçmişi (${timeframe}) Önbelleğe Alınıyor...`);
    for (const sym of watchlist) {
      try {
        await this.fetchOHLCV(sym, timeframe, limit);
      } catch (err) {
        console.error(`Preload candle error for ${sym}:`, err.message);
      }
    }
    db.addLog('SUCCESS', `✅ İzleme Listesindeki Tüm Varlıkların Fiyat Geçmişi (${timeframe}) Önbelleğe Alındı!`);
  }

  parseTimeframeMs(tf) {
    const unit = tf.slice(-1);
    const num = parseInt(tf.slice(0, -1)) || 1;
    switch (unit) {
      case 'm': return num * 60 * 1000;
      case 'h': return num * 60 * 60 * 1000;
      case 'd': return num * 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000;
    }
  }

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * VADELİ KÂĞIT HESABI (izole marj)
   * ─────────────────────────────────────────────────────────────────────────
   * Spot kâğıt cüzdanı coin başına bakiye tutar (`paperBalances.BTC`) — vadelide
   * böyle bir şey yoktur: elde coin değil POZİSYON vardır, teminat USDT olarak
   * kilitlenir ve kâr-zarar marja işler. Bu yüzden vadeli yolu ayrı:
   *
   *   açılış : marj = nominal / kaldıraç; USDT'den marj + komisyon düşülür,
   *            pozisyona yön, kaldıraç ve likidasyon fiyatı yazılır.
   *   kapanış: kâr = yön × (çıkış − giriş) × miktar − komisyonlar;
   *            USDT'ye marj payı + kâr döner.
   *
   * Backtester ile AYNI muhasebe (`lib/backtester.js`): ölçüm ile canlının
   * ayrışması, bu depoda daha önce yaşanmış ve pahalıya mal olmuş bir hatadır.
   */
  async perpSpecs(symbol) {
    if (!this._specsCache) this._specsCache = new Map();
    const anahtar = `${this.exchangeId}:${symbol}`;
    if (this._specsCache.has(anahtar)) return this._specsCache.get(anahtar);
    const s = await venues.contractSpecs(this.exchangeId, 'perp', symbol, this.credentials);
    this._specsCache.set(anahtar, s);
    return s;
  }

  /**
   * Emir miktarını borsanın kabul edeceği değere yuvarlar.
   *
   * Vadelide Binance kuralları biliniyorsa (`specs.kurallar`) miktar
   * MARKET_LOT_SIZE adımına AŞAĞI yuvarlanır — borsa adım katı olmayanı -4023
   * ile reddeder, yukarı yuvarlama ise bakiyeyi aşabilir. Kural yoksa (spot,
   * Bybit, test sahtesi) eski davranış: 6 haneye en yakın.
   */
  async miktarYuvarla(symbol, miktar) {
    if (this.marketType === 'perp') {
      try {
        const specs = await this.perpSpecs(symbol);
        if (specs && specs.kurallar) return borsaKurallari.miktarYuvarla(specs.kurallar, miktar, { piyasa: true });
      } catch (e) {
        // Özellik alınamadıysa eski yuvarlamaya düş; emir yine perpOpen'da sınanır.
      }
    }
    return +Number(miktar).toFixed(6);
  }

  /** Vadeli pozisyon açar (long ya da short). */
  async perpOpen(symbol, kisa, amount, price, meta = {}) {
    const specs = await this.perpSpecs(symbol);
    const kaldirac = Math.max(1, Math.min(100, Number(meta.leverage) || Number(this.config?.leverage) || 1));

    // Binance kuralları biliniyorsa borsanın REDDEDECEĞİ emir kâğıtta da
    // reddedilir (min nominal, adım, MARKET_LOT_SIZE…). Kâğıdın kabul edip
    // borsanın reddettiği bir emir, kâğıt sonucunu canlıda tekrarlanamaz yapar.
    if (specs.kurallar) {
      const d = borsaKurallari.emirDogrula(
        { tip: 'MARKET', yon: kisa ? 'SELL' : 'BUY', miktar: amount },
        specs.kurallar,
        { markFiyati: price }
      );
      if (!d.gecerli) {
        throw new Error(`Borsa kuralı reddi: ${d.hatalar.map(h => `${h.kod} ${h.mesaj}`).join('; ')}`);
      }
    }

    const nominal = amount * price;
    const marj = nominal / kaldirac;
    const komisyon = nominal * specs.taker;

    if (this.paperBalances.USDT < marj + komisyon) {
      throw new Error(`Yetersiz marj: $${this.paperBalances.USDT.toFixed(2)} (gerekli: $${(marj + komisyon).toFixed(2)})`);
    }

    this.paperBalances.USDT -= (marj + komisyon);

    /**
     * LİKİDASYON — Binance resmi izole formülü (lib/exchangeRules):
     *   long : (Q·EP − WB − cum) / (Q·(1 − MMR))
     *   short: (Q·EP + WB + cum) / (Q·(1 + MMR))
     * WB = izole cüzdan = marj. Komisyon nakitten ayrıca düşüldüğü için
     * marjdan BİR DAHA düşülmez (eski formül `marj − komisyon − bakım` onu
     * hem nakitten hem marjdan sayıyordu) ve bakım marjı GİRİŞ değil
     * likidasyon fiyatındaki nominalle hesaplanır.
     * ⚠ Binance'te açılış komisyonunun izole cüzdandan mı düştüğü DOĞRULANMADI.
     */
    const liq = borsaKurallari.izoleLikidasyon({
      yon: kisa ? 'short' : 'long', miktar: amount, girisFiyati: price,
      izoleCuzdan: marj, kademeler: specs.tiers, markFiyati: price
    });
    const liqPrice = liq.fiyat;

    const pos = {
      symbol,
      side: kisa ? 'short' : 'long',
      entryPrice: price,
      amount,
      margin: marj,
      leverage: kaldirac,
      entryFee: komisyon,
      liqPrice: liqPrice > 0 ? liqPrice : null,
      marginTiersSource: specs.tiersSource,
      // Funding aralığı sembolden (Binance fundingInfo: 1/4/8 saat); yoksa 8 + işaret.
      fundingIntervalHours: Number(specs.fundingIntervalHours) || 8,
      fundingIntervalSource: specs.fundingIntervalSource || (specs.fundingIntervalHours ? 'borsa' : 'varsayim'),
      fundingCap: Number.isFinite(specs.fundingCap) ? specs.fundingCap : null,
      fundingFloor: Number.isFinite(specs.fundingFloor) ? specs.fundingFloor : null,
      // Spot muhasebesiyle uyum: `cost` girişte çekilen nakittir.
      cost: marj + komisyon,
      timestamp: new Date().toISOString(),
      ...meta
    };

    this.paperPositions.push(pos);
    this.saveWalletState();

    return {
      success: true,
      orderId: 'PAPER_' + Date.now(),
      side: kisa ? 'SHORT' : 'BUY',
      price,
      amount,
      leverage: kaldirac,
      liqPrice: pos.liqPrice,
      cost: pos.cost
    };
  }

  /** Vadeli pozisyon kapatır/azaltır. Yön pozisyondan okunur. */
  async perpClose(symbol, amount, price, meta = {}) {
    const specs = await this.perpSpecs(symbol);
    const temiz = (s) => s.replace('/', '').toUpperCase();
    const hedef = temiz(symbol);

    const adaylar = this.paperPositions.filter(p =>
      temiz(p.symbol) === hedef && (!meta.botId || !p.botId || p.botId === meta.botId));
    if (!adaylar.length) throw new Error(`${symbol} için kapatılacak vadeli pozisyon yok.`);

    let kalan = amount;
    let toplamKar = 0;
    let kapananNominal = 0;
    let girisAgirlik = 0;
    let kapananYon = null;
    const silinecek = new Set();

    for (const pos of adaylar) {
      if (kalan <= 0) break;
      const yon = pos.side === 'short' ? -1 : 1;
      if (!kapananYon) kapananYon = pos.side;
      const qty = Math.min(pos.amount, kalan);
      const oran = qty / pos.amount;

      const cikisKomisyon = qty * price * specs.taker;
      const kar = yon * (price - pos.entryPrice) * qty - (pos.entryFee || 0) * oran - cikisKomisyon;
      /**
       * Kasaya dönen = girişte çekilen nakdin payı (`cost` = marj + giriş
       * komisyonu) + kâr. Kâr giriş komisyonunu ZATEN düşüyor; burada yalnız
       * marjı geri vermek komisyonu İKİ KEZ keserdi (2026-10-06'ya kadar böyleydi:
       * 1 @100 → 110, 10x, taker 0.0006 tur sonunda 10009.874 yerine 10009.814
       * bırakıyordu). `lib/backtest/costs.js` `kapanisNakit` ile aynı kural.
       */
      const girisNakdi = Number.isFinite(pos.cost) && pos.cost > 0
        ? pos.cost
        : (pos.margin || 0) + (pos.entryFee || 0);
      const marjPayi = girisNakdi * oran;

      this.paperBalances.USDT += marjPayi + kar;
      toplamKar += kar;
      kapananNominal += qty * pos.entryPrice;
      girisAgirlik += qty * pos.entryPrice;

      pos.amount -= qty;
      pos.margin = (pos.margin || 0) * (1 - oran);
      pos.cost = (pos.cost || 0) * (1 - oran);
      if (pos.entryFee) pos.entryFee *= (1 - oran);
      kalan -= qty;

      if (pos.amount <= 1e-12) silinecek.add(pos);
    }

    this.paperPositions = this.paperPositions.filter(p => !silinecek.has(p));
    this.saveWalletState();

    const kapatilan = amount - Math.max(0, kalan);
    return {
      success: true,
      orderId: 'PAPER_' + Date.now(),
      side: 'CLOSE',
      // Kapanan pozisyonun yönü: çağıran işlemi COVER mı SELL mi kaydedeceğini
      // bundan bilir.
      direction: kapananYon || 'long',
      price,
      amount: kapatilan,
      profit: toplamKar,
      profitPct: kapananNominal > 0 ? (toplamKar / kapananNominal) * 100 : 0,
      avgEntryPrice: kapatilan > 0 ? girisAgirlik / kapatilan : price
    };
  }

  /**
   * FİNANSMAN TAHAKKUKU (kâğıt).
   *
   * Sembolün KENDİ aralığındaki damgalarda (Binance fundingInfo: 1, 4 ya da 8
   * saat; UTC'ye hizalı) açık her vadeli pozisyondan MARK fiyatlı nominal
   * üzerinden alınır. Aralık pozisyonda saklıdır (`fundingIntervalHours`,
   * açılışta kontrat özelliklerinden); eski pozisyonlarda yoksa 8 saat.
   * Oran depodaki en son gerçek funding kaydından okunur, yoksa %0.01; sembolün
   * tavan/tabanı biliniyorsa ona kıstırılır. Yön duyarlı: pozitif oranda long
   * öder, short alır. Fiyat: ticker `markPrice` → `last` → giriş.
   */
  applyFunding(tickerMap = {}) {
    if (this.marketType !== 'perp') return 0;
    const simdi = Date.now();
    let toplam = 0;

    for (const pos of this.paperPositions) {
      if (!pos.side) continue;
      const ARALIK = (Number(pos.fundingIntervalHours) || 8) * 60 * 60 * 1000;
      const buDonem = Math.floor(simdi / ARALIK) * ARALIK;
      if (pos.lastFundingAt && pos.lastFundingAt >= buDonem) continue;
      // Pozisyon bu dönemde açıldıysa ilk damga atlanır.
      const acilis = new Date(pos.timestamp).getTime();
      if (!Number.isFinite(acilis) || acilis >= buDonem) { pos.lastFundingAt = buDonem; continue; }

      const kayitlar = db.getFundingHistory(pos.symbol, buDonem - Math.max(3 * ARALIK, 24 * 60 * 60 * 1000), simdi, this.kaynak());
      const oran = kayitlar.length ? kayitlar[kayitlar.length - 1].rate : 0.0001;
      const tk = tickerMap[pos.symbol] || {};
      const fiyat = (Number(tk.markPrice) > 0 && Number(tk.markPrice))
        || (Number(tk.info && tk.info.markPrice) > 0 && Number(tk.info.markPrice))
        || tk.last || pos.entryPrice;
      const ucret = borsaKurallari.fundingOdemesi({
        yon: pos.side === 'short' ? 'short' : 'long', miktar: pos.amount, markFiyati: fiyat, oran,
        tavan: pos.fundingCap, taban: pos.fundingFloor
      });

      this.paperBalances.USDT -= ucret;
      pos.fundingPaid = (pos.fundingPaid || 0) + ucret;
      pos.lastFundingAt = buDonem;
      toplam += ucret;
    }

    if (toplam !== 0) {
      this.saveWalletState();
      db.addLog('INFO', `💰 Finansman tahakkuku: $${toplam.toFixed(4)} (${toplam > 0 ? 'ödendi' : 'alındı'}).`);
    }
    return toplam;
  }

  /**
   * Execute Buy/Sell Orders
   */
  async createOrder(symbol, type, side, amount, price = null, meta = {}) {
    const targetSymbol = symbol || this.symbol;

    // VADELİ YOL: spot muhasebesi (coin bakiyesi) burada geçerli değil.
    if (this.mode === 'paper' && this.marketType === 'perp') {
      let execPrice = price;
      if (!execPrice) {
        const ticker = await this.fetchTicker(targetSymbol);
        if (!ticker || !ticker.last) throw new Error(`${targetSymbol} için fiyat alınamadı, emir iptal edildi.`);
        execPrice = ticker.last;
      }
      const yonAdi = String(side).toLowerCase();
      if (yonAdi === 'buy') return this.perpOpen(targetSymbol, false, amount, execPrice, meta);
      if (yonAdi === 'short') return this.perpOpen(targetSymbol, true, amount, execPrice, meta);
      return this.perpClose(targetSymbol, amount, execPrice, meta);
    }

    if (this.mode === 'paper') {
      // Only hit the exchange when the caller could not supply a fill price.
      let execPrice = price;
      if (!execPrice) {
        const ticker = await this.fetchTicker(targetSymbol);
        if (!ticker || !ticker.last) {
          throw new Error(`${targetSymbol} için fiyat alınamadı, emir iptal edildi.`);
        }
        execPrice = ticker.last;
      }
      const baseCurrency = targetSymbol.split('/')[0];
      const feePct = 0.0015; // 0.15% fee with slippage

      if (side === 'buy' || side === 'BUY') {
        const totalCost = amount * execPrice * (1 + feePct);
        if (this.paperBalances.USDT < totalCost) {
          throw new Error(`Yetersiz USDT bakiyesi: $${this.paperBalances.USDT.toFixed(2)} (Gerekli: $${totalCost.toFixed(2)})`);
        }
        this.paperBalances.USDT -= totalCost;
        this.paperBalances[baseCurrency] = (this.paperBalances[baseCurrency] || 0) + amount;

        const pos = {
          symbol: targetSymbol,
          entryPrice: execPrice,
          amount,
          cost: totalCost,
          timestamp: new Date().toISOString(),
          ...meta
        };
        this.paperPositions.push(pos);
        this.saveWalletState();
        return { success: true, orderId: 'PAPER_' + Date.now(), side: 'BUY', price: execPrice, amount, cost: totalCost };

      } else {
        const targetClean = targetSymbol.replace('/', '').toUpperCase();
        // Several bots may hold the same asset — only close the caller's own
        // lots, otherwise one bot would liquidate another's position.
        const matchingIndices = [];
        this.paperPositions.forEach((p, idx) => {
          if (p.symbol.replace('/', '').toUpperCase() !== targetClean) return;
          if (meta.botId && p.botId && p.botId !== meta.botId) return;
          matchingIndices.push(idx);
        });

        let remainingToSell = amount;
        let closedCost = 0;
        let closedNotional = 0;
        const toRemove = new Set();

        for (const idx of matchingIndices) {
          const pos = this.paperPositions[idx];
          // Maliyet esası birim başına `pos.cost`tan alınır — bu tutar giriş
          // komisyonunu içerir. `entryPrice` kullanmak, giriş komisyonunu
          // işlem kârının dışında bırakıp her turu olduğundan kârlı gösterirdi
          // (aynı fiyattan al-sat -%0.15 görünüyordu, gerçekte -%0.30).
          const unitCost = pos.amount > 0 ? pos.cost / pos.amount : pos.entryPrice;

          if (pos.amount <= remainingToSell) {
            const soldQty = pos.amount;
            remainingToSell -= soldQty;
            closedCost += soldQty * unitCost;
            closedNotional += soldQty * pos.entryPrice;
            toRemove.add(idx);
          } else {
            const soldQty = remainingToSell;
            closedCost += soldQty * unitCost;
            closedNotional += soldQty * pos.entryPrice;
            pos.amount -= soldQty;
            pos.cost -= soldQty * unitCost;
            remainingToSell = 0;
            break;
          }
        }

        this.paperPositions = this.paperPositions.filter((_, idx) => !toRemove.has(idx));

        const grossVal = amount * execPrice * (1 - feePct);
        const profit = grossVal - closedCost;
        const profitPct = closedCost > 0 ? ((grossVal - closedCost) / closedCost) * 100 : 0;
        // Ortalama giriş fiyatı ham fiyatlardan hesaplanır; maliyet esasından
        // türetilseydi komisyon kadar yüksek çıkar ve "giriş fiyatı" olmazdı.
        const avgEntryPrice = amount > 0 ? closedNotional / amount : execPrice;

        this.paperBalances.USDT += grossVal;
        this.paperBalances[baseCurrency] = Math.max(0, (this.paperBalances[baseCurrency] || 0) - amount);

        this.saveWalletState();
        return {
          success: true,
          orderId: 'PAPER_' + Date.now(),
          side: 'SELL',
          price: execPrice,
          amount,
          profit,
          profitPct,
          avgEntryPrice
        };
      }
    } else {
      db.addLog('ERROR', 'Live mod desteklenmiyor.');
      throw new Error('Live mod desteklenmiyor.');
    }
  }

  /**
   * Fetch Balance & Active Positions
   */
  async fetchBalance() {
    return this.getBalances();
  }

  /** Manual cash adjustment. Positions are deliberately left alone. */
  setCashBalance(usdt) {
    const value = Number(usdt);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Geçersiz bakiye tutarı.');
    }
    this.paperBalances.USDT = value;
    this.saveWalletState();
    return this.paperBalances.USDT;
  }

  getBalances() {
    return {
      mode: this.mode,
      balances: this.paperBalances,
      positions: this.paperPositions
    };
  }
}

module.exports = ExchangeConnector;
