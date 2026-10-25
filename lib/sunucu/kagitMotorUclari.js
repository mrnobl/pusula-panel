/**
 * C1 (74.8, TASARIM-MAKINE-HESAP-BOT §3 parça 1) — server.js'ten taşınan KÂĞIT MOTOR (eski çoklu bot motoru, lib/engine.js) uçları,
 * davranış AYNI: /api/candles(+/import), /api/watchlist/*, /api/start|stop, /api/reset-kill-switch, /api/risk/*, /api/trades|orders|
 * balance-history|logs, /api/position/close, /api/wallet/balance, /api/clear-history, /api/reset-all, /api/bots/run|stop-all|stop.
 * Bağlanma: server.js `require('./lib/sunucu/kagitMotorUclari').kur(ctx)` — eski yerinde (/api/config'ten sonra; uç sırası aynı).
 * ctx alanları KULLANIM ANINDA okunur (lib/sunucu/baglam.js); `config` server.js'te `let` → her yerde ctx.config.
 */
'use strict';
const db = require('../database');
const TradingEngine = require('../engine');
const { computeDrawdownStats } = require('../drawdownStats');
const strategyCatalog = require('../strategies/catalog');

function kur(ctx) {
  const { app, engine, saveConfig, ensureEngineRunning, mumGetir, KNOWN_STRATEGIES, KNOWN_TIMEFRAMES } = ctx;
  // Custom Candle Import Endpoint (CSV/JSON upload)
  app.post('/api/candles/import', (req, res) => {
    try {
      const { symbol, timeframe, candles } = req.body;
      if (!symbol || !candles || !Array.isArray(candles)) {
        return res.status(400).json({ success: false, error: 'Gereksiz veya eksik veri formatı' });
      }
      const count = engine.exchange.importCustomCandles(symbol, timeframe || '1h', candles);
      res.json({ success: true, count, message: `${count} mum verisi başarıyla yüklendi ve önbelleğe alındı` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Chart candles for the live monitor — serves the same cached/refreshed OHLCV the engine trades on
  app.get('/api/candles', async (req, res) => {
    try {
      const symbol = req.query.symbol || ctx.config.symbol || 'BTC/USDT';
      const timeframe = req.query.timeframe || ctx.config.timeframe || '1h';
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 300, 30), 5000);

      const candles = await mumGetir(symbol, timeframe, limit);
      if (!candles || candles.length === 0) {
        return res.status(503).json({ success: false, error: `${symbol} (${timeframe}) için mum verisi alınamadı.` });
      }

      res.json({ success: true, symbol, timeframe, count: candles.length, candles });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Watchlist Management & Multi-Timeframe Candle Preloading Endpoints ---

  app.get('/api/watchlist', (req, res) => {
    const tf = req.query.timeframe || ctx.config.timeframe || '1h';
    const watchlist = ctx.config.watchlist || ["BTC/USDT", "ETH/USDT", "SOL/USDT", "AVAX/USDT", "XRP/USDT", "BNB/USDT", "LINK/USDT"];
    const detailedWatchlist = watchlist.map(sym => {
      const stats = db.getCandleCacheStats(sym, tf);
      return {
        symbol: sym,
        timeframe: tf,
        cachedCandles: stats ? stats.count : 0,
        lastFetched: stats ? stats.lastFetched : null
      };
    });
    res.json({ success: true, timeframe: tf, watchlist: detailedWatchlist });
  });

  app.post('/api/watchlist/add', async (req, res) => {
    try {
      let { symbol, timeframe } = req.body;
      if (!symbol) return res.status(400).json({ success: false, error: 'Sembol belirtilmedi' });

      symbol = symbol.trim().toUpperCase();
      if (!symbol.includes('/')) symbol = `${symbol}/USDT`;
      const tf = timeframe || '1h';

      if (!/^[A-Z0-9]{2,15}\/[A-Z0-9]{2,10}$/.test(symbol)) {
        return res.status(400).json({ success: false, error: `Geçersiz sembol biçimi: ${symbol} (örnek: SOL/USDT)` });
      }

      let watchlist = ctx.config.watchlist || [];
      if (!watchlist.includes(symbol)) {
        // Verify the pair actually trades before adding it — otherwise the entry
        // sits in the list forever returning no candles.
        const ticker = await engine.exchange.fetchTicker(symbol);
        if (!ticker || !ticker.last) {
          return res.status(400).json({ success: false, error: `${symbol} borsada bulunamadı veya fiyat alınamadı.` });
        }

        watchlist.push(symbol);
        ctx.config.watchlist = watchlist;
        saveConfig(ctx.config);
        engine.updateConfig(ctx.config);
        db.addLog('INFO', `İzleme Listesine Yeni Varlık Eklendi: ${symbol}`);

        // Background preload candles for newly added symbol across main timeframes
        engine.exchange.fetchOHLCV(symbol, tf, 500).catch(() => {});
        engine.exchange.fetchOHLCV(symbol, '4h', 500).catch(() => {});
      }

      res.json({ success: true, watchlist: ctx.config.watchlist });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/watchlist/remove', (req, res) => {
    try {
      let { symbol } = req.body;
      if (!symbol) return res.status(400).json({ success: false, error: 'Sembol belirtilmedi' });

      let watchlist = ctx.config.watchlist || [];
      ctx.config.watchlist = watchlist.filter(s => s !== symbol);
      saveConfig(ctx.config);
      engine.updateConfig(ctx.config);
      db.addLog('INFO', `İzleme Listesinden Varlık Çıkarıldı: ${symbol}`);

      res.json({ success: true, watchlist: ctx.config.watchlist });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/watchlist/preload', async (req, res) => {
    try {
      const { timeframe } = req.body;
      const tf = timeframe || ctx.config.timeframe || '1h';
      const watchlist = ctx.config.watchlist || [];
      
      // Preload requested timeframe
      await engine.exchange.preloadWatchlistCandles(watchlist, tf, 500);
      res.json({ success: true, message: `İzleme listesindeki varlıkların (${tf}) fiyat geçmişi önbelleğe yükleniyor` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Bot Control: Start / Stop / Reset Kill-Switch
  app.post('/api/start', (req, res) => {
    try {
      engine.start();
      res.json({ success: true, isRunning: true });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message, isRunning: false });
    }
  });

  app.post('/api/stop', (req, res) => {
    engine.stop();
    res.json({ success: true, isRunning: false });
  });

  app.post('/api/reset-kill-switch', (req, res) => {
    engine.resetKillSwitch();

    // The kill-switch stops the engine loop; without a start button in the
    // header, resetting has to bring the bots back up too.
    const eng = engine.getBots().length > 0 ? ensureEngineRunning() : { running: engine.isRunning };

    res.json({
      success: true,
      isRunning: eng.running,
      message: 'Kill-Switch sıfırlandı',
      warning: eng.error || null
    });
  });

  /**
   * Günlük zarar limitini gün bitmeden elle kaldırır. Kill-switch'ten farklı
   * olarak motoru durdurmadığı için yeniden başlatmaya gerek yoktur.
   */
  app.post('/api/risk/reset-daily', (req, res) => {
    engine.riskManager.resetDailyHalt();
    res.json({
      success: true,
      daily: engine.riskManager.getDailyStatus(),
      message: 'Günlük zarar limiti sıfırlandı'
    });
  });

  /**
   * Drawdown ve toparlanma metrikleri. Sualtı eğrisi 240 noktaya indirildiği için
   * bile olsa her tick WebSocket'ten göndermek israf — panel bunu ayrı ve daha
   * seyrek çeker.
   *
   * `range`: kaç saatlik pencere (0 = tüm geçmiş).
   */
  app.get('/api/risk/drawdown', (req, res) => {
    const hours = Math.max(0, parseInt(req.query.hours) || 0);
    const series = db.getEquityHistory(hours ? hours * 3600 * 1000 : 0);
    const stats = computeDrawdownStats(series, { underwaterPoints: 240 });

    res.json({
      success: true,
      hours,
      sampleSeconds: ctx.config.risk?.equitySampleSeconds || 60,
      ...stats
    });
  });

  /**
   * Korelasyondan küme haritası önerir — UYGULAMAZ.
   *
   * `risk.clusters` bugüne kadar elle yazılıyordu ve ölçüm bunun veriyle
   * uyuşmadığını gösterdi (tematik grupların iç korelasyonu 0.37–0.51, rastgele
   * iki varlığın ortalaması 0.48; gerçek grup BTC-ETH-SOL-XRP-LINK). Bu uç nokta
   * ölçülen haritayı `config.risk.clusters` biçiminde üretir, mevcut haritayla
   * yan yana koyar ve orada durur: risk parametresini değiştirmek kullanıcının
   * kararıdır, panel önce karşılaştırmayı gösterir.
   *
   * Mumlar YALNIZCA ÖNBELLEKTEN okunur — 16 sembol için borsaya gitmek hem yavaş
   * hem rate-limit riski; motor zaten watchlist'in önbelleğini taze tutuyor.
   */
  app.post('/api/risk/cluster-scan', (req, res) => {
    try {
      const pool = require('../indicatorPool');

      const timeframe = KNOWN_TIMEFRAMES.includes(req.body.timeframe) ? req.body.timeframe : (ctx.config.timeframe || '1h');
      const period = Math.min(Math.max(parseInt(req.body.period) || 500, 30), 5000);
      const threshold = Math.min(Math.max(parseFloat(req.body.threshold) ?? 0.7, -1), 1);
      const minBars = Math.min(Math.max(parseInt(req.body.minBars) || 200, 30), 5000);

      const symbols = Array.isArray(req.body.symbols) && req.body.symbols.length
        ? req.body.symbols
        : (ctx.config.watchlist || []);

      if (symbols.length < 2) {
        return res.status(400).json({ success: false, error: 'Küme taraması için en az iki sembol gerekir.' });
      }

      const seriesMap = {};
      const skipped = [];
      for (const sym of symbols) {
        const candles = db.getCandleCache(sym, timeframe, period + 50);
        if (!candles || candles.length < minBars) {
          skipped.push({ symbol: sym, bars: candles ? candles.length : 0, reason: `önbellekte ${minBars} bardan az veri` });
          continue;
        }
        seriesMap[sym] = candles;
      }

      if (Object.keys(seriesMap).length < 2) {
        return res.status(400).json({
          success: false,
          error: `Yeterli önbellek verisi olan sembol sayısı iki'den az (${timeframe}). Watchlist önyüklemesi yapın.`,
          skipped
        });
      }

      const out = pool.computeMulti(seriesMap, [
        { key: 'correlation_matrix', params: { period, threshold } }
      ]);
      const matris = out.correlation_matrix;

      // Ölçülemeyen semboller (bayat önbellek, eksik veri) TEKİL küme olarak
      // öneriye eklenir. Dışarıda bırakılsalardı riskManager hepsini tek bir
      // "Sınıflandırılmamış" kovaya atardı — ölçülmemiş olmak, birlikte hareket
      // ettikleri anlamına gelmez ve tek tavana bağlamak yanlış olurdu.
      const olculmeyen = [
        ...skipped.map(s => s.symbol),
        ...(out._dropped || []).map(d => d.symbol)
      ];
      const proposed = { ...matris.clusters };
      for (const sym of olculmeyen) {
        proposed[`${String(sym).split('/')[0]} (ölçülmedi)`] = [sym];
      }

      // Mevcut haritanın her kümesi için iç korelasyon: kullanıcının öneriyi
      // körlemesine kabul etmesi değil, farkı görmesi amaçlanıyor.
      const ortalamaKor = matris.averageCorrelation;
      const current = Object.entries(ctx.config.risk?.clusters || {}).map(([name, syms]) => {
        const uyeler = (Array.isArray(syms) ? syms : []).filter(s => matris.matrix[s]);
        const ciftler = [];
        for (let i = 0; i < uyeler.length; i++) {
          for (let j = i + 1; j < uyeler.length; j++) {
            const v = matris.matrix[uyeler[i]][uyeler[j]];
            if (Number.isFinite(v)) ciftler.push(v);
          }
        }
        const ic = ciftler.length ? ciftler.reduce((a, b) => a + b, 0) / ciftler.length : null;
        return {
          name,
          symbols: syms,
          measuredSymbols: uyeler.length,
          internalCorrelation: ic,
          // Taban ortalamanın altındaki küme, "birlikte düşerler" varsayımını
          // taşımıyor demektir — asıl bakılacak sayı bu fark.
          vsBaseline: ic === null || ortalamaKor === null ? null : ic - ortalamaKor
        };
      });

      res.json({
        success: true,
        timeframe,
        period,
        threshold,
        bars: out._times.length,
        sampleSize: matris.info.sampleSize,
        limitedBy: out._limitedBy || null,
        averageCorrelation: ortalamaKor,
        proposed,
        current,
        strongestPairs: matris.strongestPairs,
        skipped,
        dropped: out._dropped || []
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Trades & Logs
  app.get('/api/trades', (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const symbol = req.query.symbol;

    let trades = db.getTrades(500);
    if (symbol) {
      const clean = symbol.replace('/', '').toUpperCase();
      trades = trades.filter(t => (t.symbol || '').replace('/', '').toUpperCase() === clean);
    }

    res.json(trades.slice(0, limit));
  });

  app.get('/api/orders', (req, res) => {
    res.json(db.getOrders(100));
  });

  app.get('/api/balance-history', (req, res) => {
    res.json(db.getBalanceHistory(100));
  });

  app.get('/api/logs', (req, res) => {
    res.json(db.getLogs(100));
  });

  app.post('/api/position/close', async (req, res) => {
    try {
      const { symbol } = req.body;
      const targetSymbol = symbol || ctx.config.symbol;
      const balances = engine.exchange.getBalances();
      const targetClean = targetSymbol.replace('/', '').toUpperCase();
      const pos = balances.positions.find(p => p.symbol.replace('/', '').toUpperCase() === targetClean);

      if (!pos) {
        return res.status(400).json({ success: false, error: 'Kapatılacak açık pozisyon bulunamadı.' });
      }

      // Trigger 60s manual cooldown so strategy doesn't immediately re-buy on next tick
      engine.riskManager.triggerManualCooldown(60000);

      const ticker = await engine.exchange.fetchTicker(pos.symbol);
      if (!ticker || !ticker.last) {
        return res.status(503).json({ success: false, error: `${pos.symbol} için güncel fiyat alınamadı, pozisyon kapatılamadı. Lütfen tekrar deneyin.` });
      }

      const order = await engine.executeTrade('SELL', pos.symbol, pos.amount, ticker.last, 'Manuel Pozisyon Kapatma (Kullanıcı Talebi)');

      db.addLog('SUCCESS', `✖️ Manuel Pozisyon Kapatıldı: ${pos.symbol} ($${ticker.last})`);

      res.json({ success: true, message: `${pos.symbol} pozisyonu piyasa fiyatından kapatıldı.`, order });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Manual paper-wallet adjustment (deposit / withdraw / set).
   * Open positions are untouched — only free cash changes.
   */
  app.post('/api/wallet/balance', (req, res) => {
    try {
      const { mode, amount } = req.body;
      const value = Number(amount);

      if (!Number.isFinite(value)) {
        return res.status(400).json({ success: false, error: 'Geçerli bir tutar giriniz.' });
      }
      if (!['set', 'deposit', 'withdraw'].includes(mode)) {
        return res.status(400).json({ success: false, error: 'Geçersiz işlem tipi.' });
      }
      if (value < 0) {
        return res.status(400).json({ success: false, error: 'Tutar negatif olamaz.' });
      }

      const current = engine.exchange.paperBalances.USDT || 0;
      let next;
      if (mode === 'set') next = value;
      else if (mode === 'deposit') next = current + value;
      else next = current - value;

      if (next < 0) {
        return res.status(400).json({ success: false, error: `Yetersiz bakiye: mevcut $${current.toFixed(2)}, çekilmek istenen $${value.toFixed(2)}` });
      }

      engine.exchange.setCashBalance(next);

      const label = mode === 'set' ? 'Bakiye Ayarlandı' : (mode === 'deposit' ? 'Bakiye Eklendi' : 'Bakiye Çekildi');
      db.addBalanceEntry({
        prevBalance: +current.toFixed(2),
        newBalance: +next.toFixed(2),
        pnl: 0,
        details: `Manuel ${label.toLowerCase()} (kullanıcı işlemi)`
      });
      db.addLog('INFO', `💰 ${label}: $${current.toFixed(2)} → $${next.toFixed(2)}`);

      // Re-baseline the drawdown peak, otherwise a withdrawal reads as a loss and
      // can trip the kill-switch.
      const equity = engine.getTotalEquity();
      engine.riskManager.rebasePeak(equity);

      res.json({
        success: true,
        balance: next,
        equity,
        message: `${label}: $${next.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/clear-history', (req, res) => {
    db.clearHistory();
    res.json({ success: true });
  });

  app.post('/api/reset-all', (req, res) => {
    try {
      engine.resetAllData();
      res.json({ success: true, message: 'Tüm işlem geçmişi temizlendi ve bakiye $10.000.00 sıfırlandı.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * The one and only way to start bots: strategy + timeframe + symbols applied
   * together in a single transaction, so a half-applied configuration (old
   * strategy, new symbols) can never run.
   *
   * Starting a bot ADDS it — bots already running keep their own strategy and
   * timeframe. Re-running an asset reconfigures just that one.
   */
  app.post('/api/bots/run', (req, res) => {
    try {
      const { strategy, timeframe, symbols } = req.body;

      if (!Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ success: false, error: 'En az bir varlık seçilmelidir.' });
      }
      if (!KNOWN_STRATEGIES.includes(strategy)) {
        return res.status(400).json({ success: false, error: `Bilinmeyen strateji: ${strategy}` });
      }
      if (!KNOWN_TIMEFRAMES.includes(timeframe)) {
        return res.status(400).json({ success: false, error: `Geçersiz zaman dilimi: ${timeframe}` });
      }
      // Hücum / Denge portföy botudur (BTC ayağı + 15 coinlik Kalkan kolu ×3): motorun
      // sembol başına bot akışında yalnız BTC ayağı koşardı ve "bot çalışıyor" yanılgısı
      // doğardı. Kâğıt bot Canlı İzleme → "Portföy botları" alanından yönetilir.
      const katalogKaydi = strategyCatalog.get(strategy);
      if (katalogKaydi && katalogKaydi.portfoy) {
        return res.status(400).json({ success: false, error: `${katalogKaydi.label}: portföy botudur — Canlı İzleme → "Portföy botları (kâğıt)" alanından başlatın. Backtest sekmesinde strateji olarak seçilebilir.` });
      }

      const watchlist = ctx.config.watchlist || [];
      const unknown = symbols.filter(s => !watchlist.includes(s));
      if (unknown.length > 0) {
        return res.status(400).json({ success: false, error: `İzleme listesinde olmayan varlık: ${unknown.join(', ')}` });
      }

      const started = Array.from(new Set(symbols));

      // A bot is (symbol, strategy, timeframe). Adding BTC/15m next to BTC/1h
      // creates a second bot; re-running the exact same triple just refreshes it.
      ctx.config.bots = engine.getBots();

      const newBots = [];
      for (const symbol of started) {
        const id = TradingEngine.makeBotId(symbol, strategy, timeframe);
        if (!ctx.config.bots.some(b => b.id === id)) {
          ctx.config.bots.push({ id, symbol, strategy, timeframe });
          newBots.push(id);
        }
      }

      ctx.config.activeSymbols = Array.from(new Set(ctx.config.bots.map(b => b.symbol)));
      delete ctx.config.botConfigs;   // legacy one-bot-per-symbol map
      delete ctx.config.symbolConfigs; // legacy hidden overrides

      // Panel defaults for the next run
      ctx.config.activeStrategy = strategy;
      ctx.config.timeframe = timeframe;
      ctx.config.symbol = started[0];

      saveConfig(ctx.config);
      engine.updateConfig(ctx.config);

      const eng = ensureEngineRunning();
      if (!eng.running) {
        return res.status(409).json({ success: false, error: eng.error || 'Motor başlatılamadı.' });
      }

      const stratName = (ctx.config.strategies[strategy] && ctx.config.strategies[strategy].name) || strategy;
      const verb = newBots.length > 0 ? 'Başlatıldı' : 'Zaten Çalışıyor';
      db.addLog('SUCCESS', `⚡ Bot ${verb} — ${stratName} (${timeframe}): ${started.join(', ')} | Toplam Bot: ${ctx.config.bots.length}`);

      res.json({
        success: true,
        isRunning: true,
        strategy,
        strategyName: stratName,
        timeframe,
        startedSymbols: started,
        newBotCount: newBots.length,
        bots: ctx.config.bots,
        activeSymbols: ctx.config.activeSymbols
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });


  /** Stops every bot at once. Open positions are left untouched. */
  app.post('/api/bots/stop-all', (req, res) => {
    try {
      const count = engine.getBots().length;
      ctx.config.bots = [];
      ctx.config.activeSymbols = [];
      delete ctx.config.botConfigs;

      saveConfig(ctx.config);
      engine.updateConfig(ctx.config);

      db.addLog('WARN', `⛔ Tüm Botlar Durduruldu (${count} bot).`);
      res.json({ success: true, stopped: count, bots: [], activeSymbols: [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Stops one bot by id. Other bots on the same asset keep running. */
  app.post('/api/bots/stop', (req, res) => {
    try {
      const { botId } = req.body;
      if (!botId) return res.status(400).json({ success: false, error: 'Bot kimliği belirtilmedi' });

      const before = engine.getBots();
      const target = before.find(b => b.id === botId);
      if (!target) return res.status(404).json({ success: false, error: 'Bot bulunamadı' });

      ctx.config.bots = before.filter(b => b.id !== botId);
      ctx.config.activeSymbols = Array.from(new Set(ctx.config.bots.map(b => b.symbol)));
      delete ctx.config.botConfigs;

      saveConfig(ctx.config);
      engine.updateConfig(ctx.config);

      db.addLog('WARN', `⛔ Bot Durduruldu — ${target.symbol} ${target.strategy} (${target.timeframe}) | Kalan Bot: ${ctx.config.bots.length}`);
      res.json({ success: true, bots: ctx.config.bots, activeSymbols: ctx.config.activeSymbols });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

module.exports = { kur };
