const ExchangeConnector = require('./exchange');
const RiskManager = require('./riskManager');
const TelegramNotifier = require('./telegram');
const catalog = require('./strategies/catalog');
const Indicators = require('./indicators');
const db = require('./database');

class TradingEngine {
  constructor(config) {
    this.config = config;
    this.isRunning = false;
    this.timer = null;
    this.strategyCache = new Map();
    // Bumped on every filled order so the UI knows when to refresh chart markers
    // instead of re-fetching trade history on every tick.
    this.tradeSeq = 0;

    this.exchange = new ExchangeConnector(config);
    this.riskManager = new RiskManager(config);
    this.telegram = new TelegramNotifier(config);

    this.initStrategy();
  }

  initStrategy() {
    const stratKey = this.config.activeStrategy || catalog.defaultKey();
    const stratConfig = (this.config.strategies && this.config.strategies[stratKey]) || {};

    // Katalog tek kaynak. Eskiden burada ayrı bir if-zinciri vardı ve
    // `createStrategyInstance`'takinden farklıydı: `regime_trend` yalnızca
    // ikincisinde tanımlıydı, buraya düşen anahtar sessizce RSI+MACD oluyordu.
    // Geri düşülen strateji de katalogdan alınır; sabit bir anahtar yazmak,
    // o strateji arşive taşındığında motoru çökertirdi.
    try {
      this.strategy = catalog.create(stratKey, stratConfig);
    } catch (err) {
      const yedek = catalog.defaultKey();
      db.addLog('WARN', `${err.message} — '${yedek}' stratejisine düşülüyor.`);
      this.strategy = catalog.create(yedek, (this.config.strategies && this.config.strategies[yedek]) || {});
    }

    db.addLog('INFO', `Aktif Strateji Yüklendi: ${this.strategy.name}`);
  }

  updateConfig(newConfig) {
    this.config = newConfig;
    this.exchange.updateConfig(newConfig);
    this.riskManager.updateConfig(newConfig.risk);
    this.telegram.updateConfig(newConfig);
    this.initStrategy();
  }

  start() {
    if (this.riskManager.killSwitchTriggered) {
      db.addLog('ERROR', '❌ Bot başlatılamadı: Kill-Switch aktif! Lütfen önce Kill-Switch\'i sıfırlayın.');
      throw new Error('Kill-Switch aktif! Lütfen önce Kill-Switch\'i sıfırlayın.');
    }
    if (this.isRunning) return;
    this.isRunning = true;
    db.addLog('SUCCESS', `🤖 Bot Çalışmaya Başladı! Mod: ${this.config.mode.toUpperCase()} | Sembol: ${this.config.symbol}`);
    this.loop();
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) clearTimeout(this.timer);
    db.addLog('WARN', '⏸️ Bot Durduruldu.');
  }

  async loop() {
    if (!this.isRunning) return;

    try {
      await this.tick();
    } catch (err) {
      db.addLog('ERROR', `Engine tick döngü hatası: ${err.message}`);
    }

    const interval = this.config.pollIntervalMs || 5000;
    this.timer = setTimeout(() => this.loop(), interval);
  }

  /**
   * Running bots. A bot is a (symbol, strategy, timeframe) triple with its own
   * positions, so the same asset can host several bots at once — e.g. BTC on a
   * 15m SMC bot and BTC on a 1h RSI bot, side by side.
   */
  getBots() {
    if (Array.isArray(this.config.bots)) {
      return this.config.bots.filter(b => b && b.symbol && b.strategy && b.timeframe);
    }

    // Legacy config (one bot per symbol) — read it as bots so nothing is lost.
    const legacy = this.config.botConfigs || {};
    const symbols = Array.isArray(this.config.activeSymbols) ? this.config.activeSymbols : [];
    return symbols.map(symbol => {
      const c = legacy[symbol] || {};
      const strategy = c.strategy || this.config.activeStrategy || 'rsi_macd';
      const timeframe = c.timeframe || this.config.timeframe || '1h';
      return { id: TradingEngine.makeBotId(symbol, strategy, timeframe), symbol, strategy, timeframe };
    });
  }

  static makeBotId(symbol, strategy, timeframe) {
    return `${symbol}|${strategy}|${timeframe}`;
  }

  /** Distinct symbols across all running bots. */
  getActiveSymbols() {
    return Array.from(new Set(this.getBots().map(b => b.symbol)));
  }

  /**
   * Every symbol the user has set up (watchlist + per-symbol strategy configs),
   * so the dashboard can list passive bots next to the running ones.
   */
  getConfiguredSymbols() {
    const fromWatchlist = Array.isArray(this.config.watchlist) ? this.config.watchlist : [];
    return Array.from(new Set([...fromWatchlist, ...this.getActiveSymbols()]));
  }

  createStrategyInstance(stratKey, stratConfig) {
    return catalog.create(stratKey, stratConfig);
  }

  /**
   * Returns the live strategy instance for a symbol.
   *
   * Strategies carry per-deal state — DCA tracks its trailing take-profit peak,
   * SMC tracks which safety orders and partial take-profits already fired.
   * Building a fresh instance on every tick silently wiped that state every few
   * seconds, so instances are cached per symbol and only rebuilt when the
   * strategy or its parameters actually change.
   */
  /**
   * Per-bot settings. Each bot is started explicitly from the terminal panel
   * with its own strategy and timeframe, so bots can run side by side without
   * inheriting each other's configuration.
   */
  getStrategyForBot(bot) {
    const stratKey = bot.strategy;
    const rawConfig = (this.config.strategies && this.config.strategies[stratKey]) || {};

    // Piyasa tipi stratejinin kendi ayarı değil, borsanın gerçeği — global
    // config'den enjekte edilir. Short sinyalleri yalnızca 'perpetual' iken
    // üretilir; spot piyasada borsa açığa satışa izin vermez.
    const stratConfig = { ...rawConfig, marketType: this.config.marketType || 'spot' };

    const signature = `${stratKey}|${JSON.stringify(stratConfig)}`;
    let entry = this.strategyCache.get(bot.id);

    if (!entry || entry.signature !== signature) {
      entry = {
        signature,
        stratKey,
        config: stratConfig,
        strategy: this.createStrategyInstance(stratKey, stratConfig)
      };
      this.strategyCache.set(bot.id, entry);
    }

    return {
      stratKey: entry.stratKey,
      stratName: entry.strategy.name,
      strategy: entry.strategy,
      config: entry.config
    };
  }

  /** Cash plus the mark value of every open position. */
  getTotalEquity() {
    const balances = this.exchange.getBalances();
    const cash = balances.balances.USDT || 0;
    const tickers = (this.lastState && this.lastState.tickerMap) || {};

    const positionValue = balances.positions.reduce((sum, pos) => {
      const mark = (tickers[pos.symbol] && tickers[pos.symbol].last) || pos.currentPrice || pos.entryPrice || 0;
      return sum + (pos.amount * mark);
    }, 0);

    return cash + positionValue;
  }

  resetAllData() {
    db.clearAllData();
    const initialUSDT = (this.config.paperWallet && this.config.paperWallet.USDT) || 10000.0;
    this.exchange.resetWallet(initialUSDT);
    this.riskManager.resetState();
  }

  async tick() {
    const bots = this.getBots();
    const activeSymbols = Array.from(new Set(bots.map(b => b.symbol)));
    const balances = this.exchange.getBalances();
    let allPositions = balances.positions;
    let availableUSDT = balances.balances.USDT || 0.0;

    // The dashboard keeps showing a live price for the selected symbol even when
    // no bot trades it, so fetch its market data too — but never act on it.
    const displaySymbol = this.config.symbol || activeSymbols[0] || 'BTC/USDT';
    const displayTf = this.config.timeframe || '1h';
    const symbolsToFetch = Array.from(new Set([...activeSymbols, displaySymbol]));

    // Candles are keyed by symbol+timeframe: two bots on the same asset can
    // analyse different timeframes and must not share one series.
    const candleKey = (symbol, timeframe) => `${symbol}|${timeframe}`;
    const seriesNeeded = new Map();
    bots.forEach(b => seriesNeeded.set(candleKey(b.symbol, b.timeframe), { symbol: b.symbol, timeframe: b.timeframe }));
    seriesNeeded.set(candleKey(displaySymbol, displayTf), { symbol: displaySymbol, timeframe: displayTf });

    // ATR ayrı bir zaman diliminden okunur. ATR *bar başına* aralığı ölçer;
    // 1m barın aralığı bir pozisyon stopu için doğru ölçek değil (ölçümde
    // %0.05 çıkıyor, alt sınıra yapışıp ATR'yi işlevsiz bırakıyor). Stop,
    // pozisyonun tutulacağı süredeki dalgalanmayı yansıtmalı.
    const atrTf = this.atrTimeframe();
    if (this.config.risk?.atrStopEnabled !== false) {
      bots.forEach(b => seriesNeeded.set(candleKey(b.symbol, atrTf), { symbol: b.symbol, timeframe: atrTf }));
    }

    const tickerMap = {};
    const ohlcvMap = {};

    // One batched price request for every symbol, regardless of bot count.
    const batched = await this.exchange.fetchTickers(symbolsToFetch);
    await Promise.all(symbolsToFetch.map(async (sym) => {
      try {
        const t = batched[sym] || await this.exchange.fetchTicker(sym);
        if (t) tickerMap[sym] = t;
      } catch (err) {
        db.addLog('WARN', `[${sym}] Fiyat alınamadı: ${err.message}`);
      }
    }));

    // Sustained data loss means the bots are blind, not idle — worth an alert.
    if (symbolsToFetch.length > 0 && Object.keys(tickerMap).length === 0) {
      this._blindTicks = (this._blindTicks || 0) + 1;
      if (this._blindTicks === 12) { // ~1 dakika kesintisiz veri yok
        this.telegram.notify('error', 'Piyasa Verisi Alınamıyor', [
          `${symbolsToFetch.length} varlık için fiyat verisi ${this._blindTicks} tick'tir gelmiyor.`,
          'Botlar sinyal üretemiyor. Borsa erişimi veya internet bağlantısı kontrol edilmeli.'
        ], { key: 'nodata', throttleMs: 30 * 60 * 1000 });
      }
    } else if (this._blindTicks) {
      if (this._blindTicks >= 12) {
        this.telegram.notify('lifecycle', 'Piyasa Verisi Geri Geldi', [
          'Fiyat akışı normale döndü, botlar çalışmaya devam ediyor.'
        ], { key: 'nodata-recovered', throttleMs: 10 * 60 * 1000 });
      }
      this._blindTicks = 0;
    }

    await Promise.all(Array.from(seriesNeeded.values()).map(async ({ symbol, timeframe }) => {
      try {
        const o = await this.exchange.fetchOHLCV(symbol, timeframe, 300);
        if (o && o.length > 0) ohlcvMap[candleKey(symbol, timeframe)] = o;
      } catch (err) {
        db.addLog('WARN', `[${symbol} ${timeframe}] Mum verisi alınamadı: ${err.message}`);
      }
    }));

    // Re-read the wallet: fetching market data for many symbols takes seconds,
    // and a manual balance change landing in that window would otherwise be
    // measured against a stale snapshot and read as a huge loss.
    const freshBalances = this.exchange.getBalances();
    allPositions = freshBalances.positions;
    availableUSDT = freshBalances.balances.USDT || 0.0;

    // FİNANSMAN: 8 saatlik damgalarda açık vadeli pozisyonlardan tahsil edilir.
    // Sermaye hesabından ÖNCE işlenmeli, yoksa equity bir tick boyunca ödenmemiş
    // finansmanı içerir ve drawdown ölçümü kayar.
    if (this.exchange.marketType === 'perp') {
      this.exchange.applyFunding(tickerMap);
      const guncel = this.exchange.getBalances();
      allPositions = guncel.positions;
      availableUSDT = guncel.balances.USDT || 0.0;
    }

    // Calculate total portfolio equity (cash + all open positions mark value)
    let openPositionsValue = 0;
    allPositions.forEach(pos => {
      const ticker = tickerMap[pos.symbol];
      const markPrice = ticker ? ticker.last : pos.entryPrice;
      openPositionsValue += TradingEngine.pozisyonDegeri(pos, markPrice);
    });

    const totalEquity = availableUSDT + openPositionsValue;

    // Continuous Peak-to-Trough Drawdown & Kill-Switch Tracking
    const riskCheck = this.riskManager.updatePortfolioCapital(totalEquity);

    // Equity serisi: drawdown süresi ve sualtı oranı düzenli aralıklı örnek
    // ister. Tick 5 saniyede bir attığı için örnekleme ayrıca kısılır —
    // aksi halde günde ~17.000 nokta birikirdi.
    this.sampleEquity(totalEquity);

    // Günlük zarar limiti. Kill-switch'ten farkı: motoru durdurmaz, yalnızca
    // gün sonuna kadar yeni girişi keser — 'flatten' seçilmişse açık
    // pozisyonlar da kapatılır.
    const dailyCheck = this.riskManager.updateDailyRisk(totalEquity);
    if (dailyCheck.triggered) {
      const daily = this.riskManager.getDailyStatus();
      this.telegram.notify('critical', 'GÜNLÜK ZARAR LİMİTİ', [
        `<b>Sebep:</b> ${this.riskManager.dailyHaltReason}`,
        `<b>Gün başı:</b> $${daily.startEquity.toFixed(2)}`,
        `<b>Şimdi:</b> $${totalEquity.toFixed(2)} (${daily.pnlPct >= 0 ? '+' : ''}%${daily.pnlPct})`,
        `<b>Açık pozisyon:</b> ${allPositions.length}`,
        '',
        dailyCheck.flatten
          ? 'Tüm pozisyonlar kapatılıyor. Gün sonuna kadar yeni giriş yok.'
          : 'Gün sonuna kadar yeni giriş yok. Açık pozisyonlar stop/TP ile yönetilmeye devam ediyor.'
      ], { key: 'dailyloss', throttleMs: 6 * 60 * 60 * 1000 });

      if (dailyCheck.flatten) {
        for (const pos of allPositions) {
          const markPrice = tickerMap[pos.symbol] ? tickerMap[pos.symbol].last : pos.entryPrice;
          await this.executeTrade('SELL', pos.symbol, pos.amount, markPrice, 'Günlük Zarar Limiti — Pozisyon Kapatma', { botId: pos.botId });
        }
        // Pozisyonlar kapandı: cüzdan fotoğrafı bayatladı, döngü bu tick'te
        // eski listeyle devam etmemeli.
        const afterFlatten = this.exchange.getBalances();
        allPositions = afterFlatten.positions;
        availableUSDT = afterFlatten.balances.USDT || 0.0;
      }
    }

    // Açık risk: tüm pozisyonların stop'a kadar taşıdığı toplam kayıp. Yeni
    // girişler bu ölçüme göre kırpıldığı için drawdown kontrolüyle aynı anda,
    // bot döngüsünden önce hesaplanır.
    this.riskManager.updateOpenRisk(allPositions, tickerMap, totalEquity);

    if (riskCheck.killSwitch) {
      db.addLog('ERROR', '🚨 Kill-Switch tetiklendi! Tüm açık pozisyonlar acilen kapatılıyor...');

      this.telegram.notify('critical', 'KILL-SWITCH DEVREDE', [
        `<b>Sebep:</b> ${this.riskManager.killSwitchReason || 'Zarar limiti aşıldı'}`,
        `<b>Portföy:</b> $${totalEquity.toFixed(2)}`,
        `<b>Kapatılan pozisyon:</b> ${allPositions.length}`,
        `<b>Duran bot:</b> ${bots.length}`,
        '',
        'Bot durduruldu. Panelden Kill-Switch sıfırlanana kadar işlem yapılmayacak.'
      ], { key: 'killswitch', throttleMs: 60 * 60 * 1000 });

      for (const pos of allPositions) {
        const markPrice = tickerMap[pos.symbol] ? tickerMap[pos.symbol].last : pos.entryPrice;
        await this.executeTrade('SELL', pos.symbol, pos.amount, markPrice, 'Kill-Switch Acil Çıkış');
      }
      this.stop();
      return;
    }

    const symbolSignals = {};
    const botStates = [];
    const marketRegimeMap = {};

    // Market regime for the monitored symbol, even if no bot is running on it
    const displaySeries = ohlcvMap[candleKey(displaySymbol, displayTf)];
    if (displaySeries) {
      marketRegimeMap[displaySymbol] = Indicators.detectMarketRegime(displaySeries);
    }

    // Untagged positions predate per-bot tracking; hand each to the first bot
    // on its symbol so nothing is orphaned by the upgrade.
    const firstBotBySymbol = {};
    bots.forEach(b => { if (!firstBotBySymbol[b.symbol]) firstBotBySymbol[b.symbol] = b.id; });
    const sameSymbol = (a, b) => a.replace('/', '').toUpperCase() === b.replace('/', '').toUpperCase();

    // Each bot trades only its own positions.
    for (const bot of bots) {
      const sym = bot.symbol;
      const ticker = tickerMap[sym];
      const ohlcv = ohlcvMap[candleKey(sym, bot.timeframe)];
      if (!ticker || !ohlcv) continue;

      const botPositions = allPositions.filter(p => (
        p.botId ? p.botId === bot.id : (sameSymbol(p.symbol, sym) && firstBotBySymbol[sym] === bot.id)
      ));

      marketRegimeMap[sym] = Indicators.detectMarketRegime(ohlcv);

      // Risk Management checks against this bot's own positions
      const riskSignals = this.riskManager.evaluatePositions(botPositions, ticker.last);
      for (let rSig of riskSignals) {
        if (rSig.action === 'SELL') {
          db.addLog('WARN', `[${sym} ${bot.timeframe}] Risk Yönetimi Tetiklendi: ${rSig.reason}`);
          await this.executeTrade('SELL', sym, rSig.position.amount, ticker.last, rSig.reason, { botId: bot.id });
        }
      }

      const { stratKey, stratName, strategy: symStrategy } = this.getStrategyForBot(bot);
      const signal = symStrategy.evaluate(ohlcv, ticker, botPositions);

      const enriched = {
        ...signal,
        botId: bot.id,
        symbol: sym,
        strategyKey: stratKey,
        strategyName: stratName,
        timeframe: bot.timeframe
      };
      botStates.push({
        ...bot,
        strategyName: stratName,
        signal: { action: signal.action, reason: signal.reason },
        positionCount: botPositions.length,
        positionQty: +botPositions.reduce((a, p) => a + p.amount, 0).toFixed(8)
      });
      // Kept for the chart/header, which look up by symbol.
      if (!symbolSignals[sym]) symbolSignals[sym] = enriched;

      const symPositions = botPositions;

      // TAKİP EDEN STOP — strateji her tick stop'u sıkılaştırabilir.
      //
      // Motorun kendi stopu girişte sabitlenir (`pos.stopPct`); sigmoid TS gibi
      // bar bar hareket eden bir stop bu yüzden yazılamıyordu. `updateStop`
      // mutlak bir fiyat taşır ve `pos.strategyStop`a yazılır; risk yöneticisi
      // stop seviyesini hesaplarken bunu da hesaba katar.
      //
      // YALNIZCA SIKILAŞTIRMA: gevşeyen bir takip eden stop, stop olmaktan
      // çıkar. Bu kural backtester'da da aynı.
      if (Number.isFinite(signal.updateStop) && symPositions.length) {
        for (const pos of symPositions) {
          // Sıkılaştırma yönü short'ta TERSTİR: stop aşağı inerse yaklaşır.
          const kisa = pos.side === 'short';
          const sikilastirir = !Number.isFinite(pos.strategyStop)
            || (kisa ? signal.updateStop < pos.strategyStop : signal.updateStop > pos.strategyStop);
          if (sikilastirir) pos.strategyStop = signal.updateStop;
        }
      }

      // SHORT sinyali BUY ile aynı boyutlandırma ve frenlerden geçer; tek fark
      // emrin yönü. Ayrı bir kod yolu yazmak, iki yönün risk kurallarının
      // zamanla ayrışmasının en kısa yoludur.
      const girisSinyali = (signal.action === 'BUY' || signal.action === 'SHORT');
      const kisaGiris = signal.action === 'SHORT';

      if (kisaGiris && this.exchange.marketType !== 'perp') {
        db.addLog('WARN', `[${sym}] SHORT sinyali yok sayıldı: piyasa tipi spot (vadeli için config.marketType = 'perpetual').`);
      }

      if (girisSinyali && !(kisaGiris && this.exchange.marketType !== 'perp') && !this.riskManager.killSwitchTriggered) {
        // ATR stratejiden değil, mum serisinden ham olarak hesaplanır: her
        // strateji `indicators.atr` üretmiyor (TSS üretmiyor) ve
        // `detectMarketRegime`'in ATR'si 2 basamağa yuvarlandığı için düşük
        // fiyatlı varlıklarda 0.00'a düşüyor. Seri, işlem zaman diliminden
        // bağımsız olarak ATR zaman dilimindendir; yoksa bota düşülür.
        const atrSeries = ohlcvMap[candleKey(sym, this.atrTimeframe())] || ohlcv;
        const atrValue = this.latestAtr(atrSeries);
        const currentBal = this.exchange.getBalances();
        const freeUsdt = currentBal.balances.USDT || 0.0;

        // Aynı tick içinde daha önceki botlar pozisyon açmış olabilir. Risk
        // bütçesi tick başındaki fotoğrafa göre hesaplanırsa her bot aynı boş
        // bütçeyi görür ve tavan topluca aşılır — bu yüzden taze ölçülür.
        this.riskManager.updateOpenRisk(
          currentBal.positions,
          tickerMap,
          this.markedEquity(currentBal, tickerMap)
        );

        // Strateji kendi tutarını dayatıyorsa bu bir tavandır. Belirtmiyorsa
        // boyutu tamamen risk yöneticisi belirler — nakit yüzdesi tavanı zaten
        // orada, bot sayısına bölünmüş haliyle uygulanıyor.
        let strategyCapUSDT = Infinity;
        if (signal.orderAmountUSDT) {
          strategyCapUSDT = signal.orderAmountUSDT;
        } else if (signal.allocationPct) {
          strategyCapUSDT = freeUsdt * (signal.allocationPct / 100.0);
        }

        // amount 0 ise bir fren devrededir (kill-switch, soğuma, günlük limit,
        // kademe, kota, tavan). Bu kesin bir engeldir, eksik bir limit değil —
        // bu yüzden strateji hedefine geri düşülmez.
        const sizing = this.riskManager.calculatePositionSize(freeUsdt, ticker.last, {
          atrValue,
          activeSymbolsCount: bots.length,
          symbol: sym,
          botId: bot.id,
          // Kaldıraç kapısı burada devreye girer: stop likidasyondan genişse
          // giriş engellenir (bkz. riskManager `calculatePositionSize`).
          leverage: this.exchange.marketType === 'perp'
            ? (Number(bot.leverage) || Number(this.config.leverage) || 1)
            : 1,
          // Strateji kendi stop/hedef mesafesini hesapladıysa risk yöneticisi
          // onu kullanır — backtester ile aynı öncelik sırası.
          signalStopPct: signal.stopLossPct,
          signalTpPct: signal.takeProfitPct
        });

        if (sizing.amount > 0) {
          const finalUSDT = Math.min(strategyCapUSDT, sizing.amount * ticker.last);
          // Vadelide Binance kuralı biliniyorsa step katına AŞAĞI (borsa -4023 ile reddeder);
          // aksi hâlde eski 6 hane yuvarlaması (bkz. exchange.miktarYuvarla).
          const amountToBuy = await this.miktarYuvarla(sym, finalUSDT / ticker.last);

          if (amountToBuy > 0) {
            db.addLog('INFO', `🎯 [${sym} ${bot.timeframe}] Strateji ${kisaGiris ? 'SHORT' : 'ALIM'} Sinyali: ${signal.reason} — stop %${sizing.stopPct.toFixed(2)} (${sizing.stopSource}), TP %${sizing.tpPct.toFixed(2)}`);
            const meta = {
              botId: bot.id,
              leverage: this.exchange.marketType === 'perp'
                ? (Number(bot.leverage) || Number(this.config.leverage) || 1)
                : 1,
              // Stop mesafesi pozisyonla birlikte saklanır: ATR sonradan
              // değişse de girişte kabul edilen risk sabit kalmalı.
              stopPct: sizing.stopPct,
              tpPct: sizing.tpPct,
              stopSource: sizing.stopSource,
              // Boyutu hangi tavanın belirlediği: ayar yaparken hangi limitin
              // gerçekten bağladığını bilmek gerekiyor.
              boundBy: strategyCapUSDT < sizing.amount * ticker.last ? 'strateji tutarı' : sizing.boundBy,
              slLevel: signal.slLevel,
              tp1Level: signal.tp1Level,
              tp2Level: signal.tp2Level,
              so1Level: signal.so1Level,
              so2Level: signal.so2Level
            };
            await this.executeTrade(kisaGiris ? 'SHORT' : 'BUY', sym, amountToBuy, ticker.last, signal.reason, meta);
          }
        }
      } else if (signal.action === 'SELL' && symPositions.length > 0) {
        db.addLog('INFO', `🎯 [${sym} ${bot.timeframe}] Strateji SATIŞ Sinyali: ${signal.reason}`);
        const totalSymQty = symPositions.reduce((acc, p) => acc + p.amount, 0);
        let amountToSell = totalSymQty;

        if (signal.closeAll) {
          amountToSell = totalSymQty;
        } else if (signal.partialPct && signal.partialPct > 0) {
          // Stratejiler ve backtester bu değeri oran olarak kullanır (0.5 = %50).
          // Yüzde olarak gelirse (>1) normalize edilir.
          const fraction = Math.min(signal.partialPct > 1 ? signal.partialPct / 100.0 : signal.partialPct, 1);
          amountToSell = await this.miktarYuvarla(sym, totalSymQty * fraction);
        } else if (symPositions.length > 0) {
          amountToSell = symPositions[0].amount;
        }

        if (amountToSell > 0) {
          await this.executeTrade('SELL', sym, amountToSell, ticker.last, signal.reason, { botId: bot.id });
        }
      }
    }

    // Dashboard follows the user's selected symbol, not just the first bot.
    const primarySymbol = displaySymbol;
    this.lastState = {
      ticker: tickerMap[primarySymbol] || { last: 0 },
      tickerMap,
      mode: this.config.mode,
      symbol: primarySymbol,
      timeframe: this.config.timeframe || '1h',
      activeSymbols,
      configuredSymbols: this.getConfiguredSymbols(),
      bots: botStates,
      tradeSeq: this.tradeSeq,
      strategyName: this.strategy ? this.strategy.name : 'Aktif Strateji',
      balances: this.exchange.getBalances(),
      marketRegime: marketRegimeMap[primarySymbol] || { regime: 'NORMAL' },
      riskStatus: this.riskManager.getStatus(),
      lastSignal: symbolSignals[primarySymbol] || { action: 'NEUTRAL', reason: 'Sinyal Bekleniyor' },
      symbolSignals,
      updatedAt: new Date().toLocaleTimeString('tr-TR')
    };

    this.lastTickAt = Date.now();

    if (this.onTickCallback) {
      this.onTickCallback(this.lastState);
    }
  }

  /**
   * Equity örneğini kaydeder, ayarlanan aralıktan sık olmamak kaydıyla.
   * Zirve de birlikte yazılır: drawdown'ı sonradan yeniden türetmek yerine
   * o anda geçerli olan referansla saklamak, zirve elle kaydırıldığında
   * (para yatırma/çekme) geçmişin tutarlı kalmasını sağlar.
   */
  sampleEquity(totalEquity) {
    const intervalMs = (this.config.risk?.equitySampleSeconds || 60) * 1000;
    const now = Date.now();
    if (this._lastEquitySampleAt && (now - this._lastEquitySampleAt) < intervalMs) return;
    this._lastEquitySampleAt = now;

    const maxPoints = this.config.risk?.equityMaxPoints || 20160;
    db.addEquitySample(totalEquity, this.riskManager.peakCapital, maxPoints);
  }

  /** ATR'nin okunacağı zaman dilimi; ayarlanmamışsa 1 saat. */
  atrTimeframe() {
    return this.config.risk?.atrTimeframe || '1h';
  }

  /**
   * Serinin son ATR değeri, yuvarlanmamış. Stop mesafesi buradan türediği için
   * hassasiyet önemli: DOGE/TRX gibi düşük fiyatlı varlıklarda 2 basamağa
   * yuvarlanmış bir ATR 0'a düşer ve stop hesabı çöker.
   */
  latestAtr(ohlcv) {
    const period = this.config.risk?.atrPeriod || 14;
    if (!Array.isArray(ohlcv) || ohlcv.length < period + 1) return null;
    try {
      const series = Indicators.calculateATR(ohlcv, period);
      for (let i = series.length - 1; i >= 0; i--) {
        const v = Number(series[i]);
        if (Number.isFinite(v) && v > 0) return v;
      }
    } catch (err) {
      db.addLog('WARN', `ATR hesaplanamadı: ${err.message}`);
    }
    return null;
  }

  /**
   * Nakit + açık pozisyonların piyasa değeri. Fiyatı okunamayan pozisyon
   * girişinden değerlenir — tick başındaki equity hesabıyla aynı kural.
   */
  markedEquity(balances, tickerMap = {}) {
    const cash = (balances && balances.balances && balances.balances.USDT) || 0.0;
    const positions = (balances && balances.positions) || [];
    let marked = 0;
    for (const pos of positions) {
      const ticker = tickerMap[pos.symbol];
      const markPrice = (ticker && ticker.last) ? ticker.last : pos.entryPrice;
      marked += TradingEngine.pozisyonDegeri(pos, markPrice);
    }
    return cash + marked;
  }

  /**
   * Bir pozisyonun sermayeye katkısı.
   *
   * SPOT: elde mal var, değeri `miktar × fiyat`.
   * VADELİ: elde mal YOK; kilitli marj + gerçekleşmemiş kâr-zarar. Spot
   * formülünü vadelide kullanmak, 10x bir pozisyonu sermayenin 10 katı
   * göstererek drawdown ve risk tavanı hesaplarının tamamını bozar — short'ta
   * ise pozisyonu artı değer sayarken fiyat yükseldikçe "sermaye arttı" derdi.
   */
  static pozisyonDegeri(pos, markPrice) {
    if (!pos) return 0;
    if (pos.side) {
      const yon = pos.side === 'short' ? -1 : 1;
      const marj = Number.isFinite(pos.margin) ? pos.margin : (pos.cost || 0);
      return marj + yon * (markPrice - pos.entryPrice) * pos.amount;
    }
    return pos.amount * markPrice;
  }

  /** Emir miktarı yuvarlaması borsa bağlayıcısına aittir; sahte bağlayıcıda eski 6 hane. */
  async miktarYuvarla(symbol, miktar) {
    if (this.exchange && typeof this.exchange.miktarYuvarla === 'function') return this.exchange.miktarYuvarla(symbol, miktar);
    return +Number(miktar).toFixed(6);
  }

  async executeTrade(side, symbol, amount, price, reason, meta = {}) {
    try {
      // Üç yön var artık: BUY (long aç), SHORT (short aç), SELL (kapat).
      // `isBuy` yalnızca "giriş mi" sorusunu yanıtlıyordu; SHORT da bir giriştir
      // ama alım değildir — ikisi ayrı tutulmazsa short girişi kapanış gibi
      // kaydedilir ve istatistikler bozulur.
      const yonAdi = String(side).toLowerCase();
      const isBuy = yonAdi === 'buy';
      const isShort = yonAdi === 'short';
      const isGiris = isBuy || isShort;
      const isKapanis = !isGiris;
      const prevBal = this.exchange.paperBalances ? (this.exchange.paperBalances.USDT || 10000) : 10000;
      
      const order = await this.exchange.createOrder(symbol, 'market', side.toLowerCase(), amount, price, meta);
      
      const newBal = this.exchange.paperBalances ? (this.exchange.paperBalances.USDT || 10000) : 10000;
      const fee = +(amount * price * 0.0015).toFixed(4);

      // Add to Order History in Database
      db.addOrder({
        id: "ORD_" + Date.now().toString().slice(-8),
        symbol,
        side: isBuy ? 'AL' : (isShort ? 'SHORT' : 'SAT'),
        type: 'Piyasa',
        amount,
        limitPrice: null,
        stopPrice: null,
        fillPrice: price,
        takeProfit: +(price * (isBuy ? 1.04 : 0.96)).toFixed(2),
        stopLoss: +(price * (isBuy ? 0.97 : 1.03)).toFixed(2),
        status: 'Gerçekleşti',
        fee,
        orderTime: new Date().toLocaleString('tr-TR'),
        closeTime: new Date().toLocaleString('tr-TR')
      });

      // Add to Trade History in Database (Required for Stats)
      db.addTrade({
        symbol,
        // Kapanış etiketi yön duyarlı: short kapanışı COVER'dır (backtester ile
        // aynı sözleşme; `db.getStats` ve tarama bu önekleri arıyor).
        type: isBuy ? 'BUY' : (isShort ? 'SHORT' : ((order && order.direction === 'short') ? 'COVER' : 'SELL')),
        price,
        amount,
        profitUSDT: order && order.profit !== undefined ? +order.profit.toFixed(2) : 0,
        profitPct: order && order.profitPct !== undefined ? +order.profitPct.toFixed(2) : 0,
        reason: reason || ''
      });

      // Add to Balance History in Database
      db.addBalanceEntry({
        timestamp: new Date().toLocaleString('tr-TR'),
        prevBalance: +prevBal.toFixed(2),
        newBalance: +newBal.toFixed(2),
        pnl: order && order.profit !== undefined ? +order.profit.toFixed(2) : 0.0,
        details: `${isBuy ? 'Enter' : 'Close'} position for symbol ${symbol} at price ${price} for ${amount} units.`
      });

      // Register trade result for loss streak & Anti-Martingale tracking
      if (isKapanis && order && order.profit !== undefined) {
        this.riskManager.registerTradeResult(order.profit);
      }

      this.tradeSeq += 1;

      await this.telegram.sendTradeAlert(side, symbol, price, amount, order ? order.profit : 0);
      return order;
    } catch (err) {
      db.addLog('ERROR', `İşlem Gerçekleştirilemedi: ${err.message}`);
    }
  }

  resetKillSwitch() {
    this.riskManager.resetKillSwitch();
  }

  getState() {
    return this.lastState || {
      ticker: { last: 0.0 },
      mode: this.config.mode,
      symbol: this.config.symbol,
      timeframe: this.config.timeframe || '1h',
      activeSymbols: this.getActiveSymbols(),
      configuredSymbols: this.getConfiguredSymbols(),
      bots: this.getBots().map(b => ({ ...b, signal: { action: 'IDLE', reason: 'Başlatılıyor...' } })),
      tradeSeq: this.tradeSeq,
      strategyName: this.strategy ? this.strategy.name : 'Yok',
      balances: this.exchange.getBalances(),
      marketRegime: { regime: 'RANGING', adx: 15 },
      riskStatus: this.riskManager.getStatus(),
      lastSignal: { action: 'IDLE', reason: 'Sistem hazır' },
      updatedAt: new Date().toLocaleTimeString('tr-TR')
    };
  }
}

module.exports = TradingEngine;
