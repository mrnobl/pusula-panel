const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');
const { isMainThread, parentPort } = require('worker_threads');
const { CandleStore } = require('./candleStore');

/**
 * İŞ PARÇACIĞI KORUMASI. Backtest artık `worker_threads` içinde koşuyor
 * (`lib/backtest/isci.js`) ve bu modül orada YENİDEN yüklenir — kendi
 * logs/trades kopyasıyla. Dosyaya yazsaydı ana sürecin kayıtlarını ezerdi.
 * İş parçacığında hiçbir JSON yazılmaz; günlük satırları ana sürece iletilir.
 * Mum deposu (SQLite/WAL) eş zamanlı okumaya güvenlidir.
 */
const ISCI = !isMainThread;

class TradeDatabase {

  constructor() {
    this.cacheDir = yollar.veri();   // eski düzende data/ — dosyalar aşağıda yollar.veri ile (tür alt klasörü)
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    this.tradesFile = yollar.veri('trades.json');
    this.logsFile = yollar.veri('logs.json');
    this.ordersFile = yollar.veri('orders.json');
    this.balanceHistoryFile = yollar.veri('balance_history.json');
    this.candleCacheFile = yollar.veri('candles_cache.json');
    this.walletFile = yollar.veri('wallet.json');
    this.equityHistoryFile = yollar.veri('equity_history.json');

    this.trades = this.loadJSON(this.tradesFile, []);
    this.logs = this.loadJSON(this.logsFile, []);
    this.orders = this.loadJSON(this.ordersFile, []);
    this.balanceHistory = this.loadJSON(this.balanceHistoryFile, []);

    // Mumlar ve funding artık SQLite'ta (`lib/candleStore.js`); anahtar borsa
    // ve piyasa tipini içeriyor. Eski JSON önbelleği ilk açılışta bir kez
    // içeri alınır ve `.migrated` olarak bırakılır.
    this.candleStore = new CandleStore(yollar.veri('market.db'));
    const gocSonuc = this.candleStore.migrateFromJson(this.candleCacheFile);
    if (gocSonuc.imported > 0) {
      console.log(`[veri] Eski mum önbelleği aktarıldı: ${gocSonuc.series} seri, ${gocSonuc.imported} mum.`);
    }

    // Drawdown metriklerinin kaynağı. `balanceHistory` bu iş için kullanılamaz:
    // yalnızca nakti kaydeder (açık pozisyonların değerini değil), yalnızca
    // işlem anında yazılır (zaman ızgarası yok) ve zaman damgası yerelleştirilmiş
    // metindir. Drawdown süresi ve sualtı oranı düzenli aralıklı bir seri ister.
    this.equityHistory = this.loadJSON(this.equityHistoryFile, []);
    this.equitySaveTimer = null;

    // Wallet state is kept in memory as the single source of truth so that the
    // exchange wallet and the risk engine can never overwrite each other's keys.
    this.walletState = this.loadJSON(this.walletFile, null);

    this.logSaveTimer = null;
  }

  loadJSON(filepath, fallback) {
    try {
      if (fs.existsSync(filepath)) {
        const raw = fs.readFileSync(filepath, 'utf8').trim();
        if (!raw) return fallback;
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error(`Error loading ${filepath}:`, e.message);
    }
    return fallback;
  }

  saveJSON(filepath, data) {
    if (ISCI) return;
    try {
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error(`Error writing ${filepath}:`, e.message);
    }
  }

  saveJSONAsync(filepath, data) {
    if (ISCI) return;
    fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8', (e) => {
      if (e) console.error(`Error writing ${filepath} asynchronously:`, e.message);
    });
  }

  /**
   * Write-to-temp + rename, so a second writer can never interleave with a
   * half-finished write and leave invalid JSON on disk.
   */
  saveJSONAtomic(filepath, data, pretty = true) {
    const tmp = `${filepath}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(data, null, pretty ? 2 : 0), 'utf8');
      fs.renameSync(tmp, filepath);
    } catch (e) {
      console.error(`Error writing ${filepath}:`, e.message);
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
    }
  }

  // --- Wallet Persistence ---
  loadWalletState() {
    return this.walletState;
  }

  /**
   * Merges a partial patch (e.g. only `riskState`, or only the paper wallet)
   * into the persisted state instead of replacing the whole file.
   */
  saveWalletState(patch) {
    this.walletState = { ...(this.walletState || {}), ...patch };
    this.saveJSONAtomic(this.walletFile, this.walletState);
    return this.walletState;
  }

  /**
   * Writes anything still sitting in a debounce timer. Called on shutdown so a
   * restart never loses the last few seconds of logs or freshly fetched candles.
   */
  flush() {
    if (this.logSaveTimer) {
      clearTimeout(this.logSaveTimer);
      this.logSaveTimer = null;
      this.saveJSON(this.logsFile, this.logs);
    }
    // Mumlar SQLite'a anında yazılıyor; bekleyen mum yazımı diye bir şey yok.
    if (this.walletState) {
      this.saveJSONAtomic(this.walletFile, this.walletState);
    }
  }

  clearWalletState() {
    this.walletState = null;
    try {
      if (fs.existsSync(this.walletFile)) fs.unlinkSync(this.walletFile);
    } catch (e) {
      console.error('Error clearing wallet state:', e.message);
    }
  }

  // --- Trade Logging ---
  addTrade(trade) {
    const item = {
      id: Date.now(),
      timestamp: trade.timestamp || new Date().toISOString(),
      symbol: trade.symbol,
      type: trade.type,
      price: trade.price,
      amount: trade.amount,
      profitUSDT: trade.profitUSDT || 0,
      profitPct: trade.profitPct || 0,
      reason: trade.reason || ''
    };
    this.trades.unshift(item);
    if (this.trades.length > 500) this.trades.pop();
    this.saveJSONAsync(this.tradesFile, this.trades);
  }

  getTrades(limit = 100) {
    return this.trades.slice(0, limit);
  }

  // --- System Logs ---
  addLog(level, message) {
    if (ISCI) {
      if (parentPort) parentPort.postMessage({ tur: 'log', level, message });
      return;
    }
    const timestamp = new Date().toLocaleTimeString('tr-TR');
    this.logs.unshift({ id: Date.now(), timestamp, level, message });
    // PLAN-PANEL-2: kalıcı, tek biçimli günlük (lib/gunluk.js). Yalnız server.js bağlar — öz testler gerçek günlüğe yazmaz.
    if (this.gunluk) { try { this.gunluk.yaz(level, message); } catch (e) { /* günlük yazılamadı diye iş durmaz */ } }
    if (this.logs.length > 300) this.logs.pop();

    if (!this.logSaveTimer) {
      this.logSaveTimer = setTimeout(() => {
        this.saveJSONAsync(this.logsFile, this.logs);
        this.logSaveTimer = null;
      }, 500);
    }
    this._gunlugeEkle(level, message);
  }

  /**
   * Altyapı O3 (61.8): 300 satırlık halka gece olaylarını sabaha kadar yutuyordu ve satırlarda tarih yoktu. Her kayıt ayrıca
   * `data/gunluk/AAAA-AA-GG.jsonl`e ISO zamanla eklenir; 60 günden eski dosyalar günde bir silinir. Yazılamazsa sessiz geçer.
   */
  _gunlugeEkle(level, message) {
    try {
      const simdi = new Date();
      const gun = simdi.toISOString().slice(0, 10);
      const dizin = yollar.veri('gunluk');
      if (this._gunlukGun !== gun) {
        fs.mkdirSync(dizin, { recursive: true });
        this._gunlukGun = gun;
        const sinir = new Date(simdi.getTime() - 60 * 864e5).toISOString().slice(0, 10);
        for (const f of fs.readdirSync(dizin)) if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) < sinir) fs.rmSync(path.join(dizin, f), { force: true });
      }
      fs.appendFileSync(path.join(dizin, `${gun}.jsonl`), JSON.stringify({ zaman: simdi.toISOString(), seviye: level, mesaj: String(message) }) + '\n', 'utf8');
    } catch { /* günlük dosyası yazılamadı — bellek halkası yine çalışır */ }
  }

  getLogs(limit = 50) {
    return this.logs.slice(0, limit);
  }

  clearHistory() {
    this.trades = [];
    this.logs = [];
    this.orders = [];
    this.balanceHistory = [];
    this.saveJSON(this.tradesFile, []);
    this.saveJSON(this.logsFile, []);
    this.saveJSON(this.ordersFile, []);
    this.saveJSON(this.balanceHistoryFile, []);
    // Equity serisi de gider: yarım temizlik, eski sermaye seviyesine göre
    // ölçülmüş sahte bir drawdown bırakırdı.
    this.clearEquityHistory();
  }

  // --- Order & Balance History ---
  addOrder(ord) {
    const item = {
      id: ord.id || ("ORD_" + Date.now()),
      symbol: ord.symbol || 'BTC/USDT',
      side: ord.side || 'AL',
      type: ord.type || 'Piyasa',
      amount: ord.amount || 0,
      limitPrice: ord.limitPrice || null,
      stopPrice: ord.stopPrice || null,
      fillPrice: ord.fillPrice || null,
      takeProfit: ord.takeProfit || null,
      stopLoss: ord.stopLoss || null,
      status: ord.status || 'Gerçekleşti',
      fee: ord.fee || 0,
      orderTime: ord.orderTime || new Date().toLocaleString('tr-TR'),
      closeTime: ord.closeTime || new Date().toLocaleString('tr-TR')
    };
    this.orders.unshift(item);
    if (this.orders.length > 500) this.orders.pop();
    this.saveJSONAsync(this.ordersFile, this.orders);
    return item;
  }

  getOrders(limit = 100) {
    return this.orders.slice(0, limit);
  }

  addBalanceEntry(entry) {
    const item = {
      id: "BAL_" + Date.now(),
      timestamp: entry.timestamp || new Date().toLocaleString('tr-TR'),
      prevBalance: entry.prevBalance || 0,
      newBalance: entry.newBalance || 0,
      pnl: entry.pnl || 0,
      details: entry.details || ''
    };
    this.balanceHistory.unshift(item);
    if (this.balanceHistory.length > 500) this.balanceHistory.pop();
    this.saveJSONAsync(this.balanceHistoryFile, this.balanceHistory);
    return item;
  }

  getBalanceHistory(limit = 100) {
    return this.balanceHistory.slice(0, limit);
  }

  // --- Equity Series (drawdown metriklerinin kaynağı) ---

  /**
   * Zaman sıralı equity örneği ekler. Dizi eskiden yeniye sıralıdır — drawdown
   * hesabı ileri yönde tarama yaptığı için ters çevirme maliyeti olmasın.
   *
   * `maxPoints` saklama penceresi: 1 dakikada bir örnekle 20160 nokta ≈ 14 gün.
   * Dosya yazımı debounce edilir; her tick disk yazmak 5 saniyede bir I/O demek.
   */
  addEquitySample(equityUSDT, peakUSDT, maxPoints = 20160) {
    const equity = Number(equityUSDT);
    if (!Number.isFinite(equity) || equity <= 0) return null;

    const sample = {
      t: Date.now(),
      e: +equity.toFixed(2),
      p: Number.isFinite(peakUSDT) ? +Number(peakUSDT).toFixed(2) : +equity.toFixed(2)
    };

    this.equityHistory.push(sample);
    if (this.equityHistory.length > maxPoints) {
      this.equityHistory.splice(0, this.equityHistory.length - maxPoints);
    }

    if (!this.equitySaveTimer) {
      this.equitySaveTimer = setTimeout(() => {
        this.equitySaveTimer = null;
        this.saveJSONAsync(this.equityHistoryFile, this.equityHistory);
      }, 10000);
    }

    return sample;
  }

  /** `sinceMs` verilirse yalnızca o kadar geriye bakar (0 = tümü). */
  getEquityHistory(sinceMs = 0) {
    if (!sinceMs) return this.equityHistory;
    const cutoff = Date.now() - sinceMs;
    return this.equityHistory.filter(s => s.t >= cutoff);
  }

  clearEquityHistory() {
    this.equityHistory = [];
    if (this.equitySaveTimer) {
      clearTimeout(this.equitySaveTimer);
      this.equitySaveTimer = null;
    }
    this.saveJSON(this.equityHistoryFile, []);
  }

  // --- Stats Calculation ---
  getStats() {
    // Kapanış etiketi yön duyarlı: long SELL, short COVER. Yalnızca 'SELL'
    // aramak vadeli modda short işlemlerini istatistiklerin dışında bırakırdı.
    const sellTrades = this.trades.filter(t => t.type && /^(SELL|COVER)/.test(t.type));
    const totalTrades = sellTrades.length;
    const winningTrades = sellTrades.filter(t => t.profitUSDT > 0).length;
    const totalProfitUSDT = sellTrades.reduce((acc, t) => acc + (t.profitUSDT || 0), 0);
    
    const winRatePct = totalTrades > 0 ? (winningTrades / totalTrades) * 100.0 : 0.0;

    return {
      totalTrades,
      winningTrades,
      losingTrades: totalTrades - winningTrades,
      winRatePct: +winRatePct.toFixed(2),
      totalProfitUSDT: +totalProfitUSDT.toFixed(2)
    };
  }

  saveBacktestResult(res) {
    // Keep in log
    this.addLog('INFO', `Backtest Kaydedildi: ${res.strategyName} (${res.totalReturnPct}% Kâr)`);
  }

  // --- Mum Deposu (SQLite üzerinden) ---
  //
  // İmzalara `kaynak` EKLENDİ, sırası korundu: mevcut çağrıların hepsi
  // `{ venue: 'binance', market: 'spot' }` varsayılanına düşer, yani eski
  // davranış birebir aynı. Vadeli çağıranlar `{ venue, market: 'perp' }`
  // geçerek ayrı seriye yazar/okur — spot ile perp'in aynı kovaya karışması
  // bu yüzden artık mümkün değil.

  saveCandleCache(symbol, timeframe, candles, kaynak = {}) {
    return this.candleStore.saveCandles(symbol, timeframe, candles, kaynak);
  }

  getCandleCache(symbol, timeframe, limit = 500, kaynak = {}) {
    return this.candleStore.getCandles(symbol, timeframe, limit, kaynak);
  }

  getCandleCacheStats(symbol, timeframe, kaynak = {}) {
    return this.candleStore.stats(symbol, timeframe, kaynak);
  }

  /** Depodaki tüm seriler: borsa, piyasa tipi, sembol, zaman dilimi, bar sayısı. */
  listCandleSeries() {
    return this.candleStore.listSeries();
  }

  // --- Funding Geçmişi (vadeli motorun gerçek maliyet kaynağı) ---
  saveFundingHistory(symbol, kayitlar, kaynak = {}) {
    return this.candleStore.saveFunding(symbol, kayitlar, kaynak);
  }

  getFundingHistory(symbol, baslangic = 0, bitis = Date.now(), kaynak = {}) {
    return this.candleStore.getFunding(symbol, baslangic, bitis, kaynak);
  }

  getFundingStats(symbol, kaynak = {}) {
    return this.candleStore.fundingStats(symbol, kaynak);
  }
  clearAllData() {
    this.trades = [];
    this.logs = [];
    this.orders = [];
    this.balanceHistory = [];
    this.saveJSON(this.tradesFile, []);
    this.saveJSON(this.logsFile, []);
    this.saveJSON(this.ordersFile, []);
    this.saveJSON(this.balanceHistoryFile, []);
    this.clearEquityHistory();
    this.clearWalletState();
    this.addLog('SUCCESS', '🧹 Tüm veritabanı geçmişi temizlendi.');
  }

  /** Kalıcı günlüğü bağlar (lib/gunluk.js `olustur()`); server.js açılışta bir kez çağırır. */
  gunlukBagla(g) { this.gunluk = g || null; }
}

module.exports = new TradeDatabase();
