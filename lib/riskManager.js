const db = require('./database');

/**
 * Sermaye kademeleri: drawdown büyüdükçe pozisyon boyutu küçülür ve en üst
 * kademede yeni giriş tamamen durur. Eşikler `maxDrawdownPct`'in oranı olarak
 * tanımlı — kill-switch limitini değiştirince kademeler de birlikte kayar.
 * Kill-switch (oran 1.0) bu merdivenin son basamağıdır.
 */
const DEFAULT_TIER_LADDER = [
  { ddFrac: 0.40, sizeMultiplier: 0.75, haltNewEntries: false, label: 'İzleme' },
  { ddFrac: 0.60, sizeMultiplier: 0.50, haltNewEntries: false, label: 'Riski Azalt' },
  { ddFrac: 0.80, sizeMultiplier: 0.25, haltNewEntries: true, label: 'Giriş Durdu' }
];

const normSymbol = (s) => String(s || '').replace('/', '').toUpperCase();

/**
 * Korelasyon kümeleri. Kriptoda çeşitlendirme çoğu zaman illüzyondur: 16 ayrı
 * altcoin aynı anda düşer ve tek bir pozisyon gibi davranır. Küme limiti,
 * "farklı sembol" ile "farklı risk"i birbirinden ayırır.
 *
 * Kümeye atanmamış her sembol `UNCLUSTERED_NAME` altında toplanır — bilinmeyeni
 * serbest bırakmak yerine tek çatı altında sınırlamak daha güvenli.
 */
const UNCLUSTERED_NAME = 'Sınıflandırılmamış';

const DEFAULT_CLUSTERS = {
  'Major': ['BTC/USDT', 'ETH/USDT'],
  'L1 & L2': ['SOL/USDT', 'AVAX/USDT', 'DOT/USDT', 'ATOM/USDT', 'ADA/USDT', 'TRX/USDT', 'MATIC/USDT'],
  'DeFi & Altyapı': ['LINK/USDT', 'UNI/USDT', 'FIL/USDT'],
  'Ödeme': ['XRP/USDT', 'LTC/USDT'],
  'Borsa': ['BNB/USDT'],
  'Meme': ['DOGE/USDT']
};

class RiskManager {
  constructor(config) {
    this.updateConfig(config);

    // Advanced Risk Engine State
    this.peakCapital = null;
    this.currentDrawdownPct = 0.0;
    this.consecutiveLosses = 0;
    this.cooldownUntil = 0; // Timestamp for cooldown expiry
    this.killSwitchTriggered = false;
    this.killSwitchReason = '';
    this.tierIndex = 0;
    this._logTimes = {};

    // Günlük zarar limiti durumu. `dayKey` gün sınırını taşır — değişince
    // referans sermaye yeniden alınır ve limit kendiliğinden kalkar.
    this.dayKey = null;
    this.dayStartEquity = null;
    this.dayLowEquity = null;
    this.dailyHaltTriggered = false;
    this.dailyHaltReason = '';

    // Son tick'te ölçülen açık risk ve sermaye. Pozisyon boyutu hesaplanırken
    // risk bütçesinin ne kadarının kullanıldığını bilmek için tutulur.
    this.lastEquity = 0;
    this.openRisk = this.emptyOpenRisk();

    this.loadState();
  }

  loadState() {
    const saved = db.loadWalletState();
    if (saved && saved.riskState) {
      this.peakCapital = saved.riskState.peakCapital || null;
      this.currentDrawdownPct = saved.riskState.currentDrawdownPct || 0.0;
      this.consecutiveLosses = saved.riskState.consecutiveLosses || 0;
      this.cooldownUntil = saved.riskState.cooldownUntil || 0;
      this.killSwitchTriggered = saved.riskState.killSwitchTriggered || false;
      this.killSwitchReason = saved.riskState.killSwitchReason || '';
      this.tierIndex = saved.riskState.tierIndex || 0;
      // Günlük limit yeniden başlatmayı atlatmalı — aksi halde limite takılan
      // bot yeniden başlatılarak aynı gün içinde serbest bırakılabilirdi.
      this.dayKey = saved.riskState.dayKey || null;
      this.dayStartEquity = saved.riskState.dayStartEquity != null ? saved.riskState.dayStartEquity : null;
      this.dayLowEquity = saved.riskState.dayLowEquity != null ? saved.riskState.dayLowEquity : null;
      this.dailyHaltTriggered = saved.riskState.dailyHaltTriggered || false;
      this.dailyHaltReason = saved.riskState.dailyHaltReason || '';
      this.lastLossAt = saved.riskState.lastLossAt || 0;
    }
  }

  saveState() {
    db.saveWalletState({
      riskState: {
        peakCapital: this.peakCapital,
        currentDrawdownPct: this.currentDrawdownPct,
        consecutiveLosses: this.consecutiveLosses,
        cooldownUntil: this.cooldownUntil,
        killSwitchTriggered: this.killSwitchTriggered,
        killSwitchReason: this.killSwitchReason,
        tierIndex: this.tierIndex,
        dayKey: this.dayKey,
        dayStartEquity: this.dayStartEquity,
        dayLowEquity: this.dayLowEquity,
        dailyHaltTriggered: this.dailyHaltTriggered,
        dailyHaltReason: this.dailyHaltReason,
        lastLossAt: this.lastLossAt || 0
      }
    });
  }

  /**
   * Accepts either the whole app config or just its `risk` section — the engine
   * passes the section, the constructor passes the whole object. Reading only
   * `config.risk` meant every settings save silently reset stop-loss, take-profit,
   * drawdown limit, loss streak and cooldown back to the hardcoded defaults.
   */
  updateConfig(config = {}) {
    this.config = (config && config.risk) ? config.risk : (config || {});
    this.maxDrawdownPct = this.config.maxDrawdownPct || 10.0;
    this.stopLossPct = this.config.stopLossPct || 2.0;
    this.takeProfitPct = this.config.takeProfitPct || 4.0;
    this.maxLossStreak = this.config.maxLossStreak || 3;

    // Anti-martingale: kayıp serisi büyüdükçe pozisyon küçülür. Sayılar
    // eskiden koda gömülüydü (adım 0.25, taban 0.25) — bu da 3 kayıptan
    // sonra boyutun kalıcı olarak dörtte bire inmesi ve ancak tek bir kârlı
    // işlemle tamamen geri dönmesi demekti.
    this.antiMartingaleEnabled = this.config.antiMartingaleEnabled !== false;
    this.antiMartingaleStep = this.config.antiMartingaleStep != null ? this.config.antiMartingaleStep : 0.25;
    this.antiMartingaleFloor = this.config.antiMartingaleFloor != null ? this.config.antiMartingaleFloor : 0.25;
    // 'full' → tek kârlı işlem seriyi sıfırlar (eski davranış)
    // 'step' → kârlı işlem seriyi bir kademe geri alır, boyut kademeli döner
    this.lossStreakResetMode = this.config.lossStreakResetMode === 'step' ? 'step' : 'full';
    // Kayıpsız geçen süre sonunda seri kendiliğinden bir kademe erir.
    // 0 = kapalı: seri yalnızca kârlı işlemle azalır.
    this.lossStreakDecayMinutes = this.config.lossStreakDecayMinutes || 0;
    this.cooldownDurationMs = (this.config.cooldownMinutes || 15) * 60 * 1000;
    // Opt-out switch: when off, loss streaks no longer pause trading.
    this.cooldownEnabled = this.config.cooldownEnabled !== false;

    // Açık risk tavanı: tüm açık pozisyonların stop'a kadar taşıdığı toplam
    // kayıp, sermayenin bu yüzdesini aşamaz.
    this.maxOpenRiskPct = this.config.maxOpenRiskPct || 6.0;
    this.openRiskLimitEnabled = this.config.openRiskLimitEnabled !== false;
    this.equityTiersEnabled = this.config.equityTiersEnabled !== false;
    // Kademe düşerken gereken fazladan toparlanma — eşik civarında gidip
    // gelen drawdown'ın pozisyon boyutunu her tick değiştirmesini önler.
    this.tierHysteresisPct = this.config.tierHysteresisPct || 1.0;
    // Risk bütçesi kırpıldığında ortaya çıkan toz pozisyonları engeller.
    this.minOrderUSDT = this.config.minOrderUSDT != null ? this.config.minOrderUSDT : 10.0;

    // Günlük zarar limiti. Kümülatif drawdown'dan bağımsızdır: tek günde
    // açılan bir delik, toplam limite hiç değmeden de durdurulabilmeli.
    this.dailyLossLimitPct = this.config.dailyLossLimitPct || 3.0;
    this.dailyLossLimitEnabled = this.config.dailyLossLimitEnabled !== false;
    // 'halt'    → gün sonuna kadar yeni giriş yok, açık pozisyonlar kendi
    //             stop/TP kurallarıyla yönetilmeye devam eder (varsayılan).
    // 'flatten' → limite değince tüm pozisyonlar da kapatılır.
    this.dailyLossAction = this.config.dailyLossAction === 'flatten' ? 'flatten' : 'halt';
    // Gün sınırı (yerel saat). 0 = gece yarısı.
    this.dayResetHour = Number.isFinite(this.config.dayResetHour) ? this.config.dayResetHour : 0;

    // Maruziyet limitleri. Açık risk tavanı toplam *kaybı* sınırlar; bunlar
    // sermayenin nereye yığıldığını sınırlar — ikisi farklı sorular.
    this.exposureLimitsEnabled = this.config.exposureLimitsEnabled !== false;
    this.maxConcurrentPositions = this.config.maxConcurrentPositions || 10;
    this.maxSymbolExposurePct = this.config.maxSymbolExposurePct || 15.0;
    this.maxClusterExposurePct = this.config.maxClusterExposurePct || 40.0;
    this.maxGrossExposurePct = this.config.maxGrossExposurePct || 80.0;

    this.clusters = (this.config.clusters && Object.keys(this.config.clusters).length)
      ? this.config.clusters
      : DEFAULT_CLUSTERS;
    this.clusterIndex = this.buildClusterIndex();

    // Bot başına açık risk kotası: tek bir botun risk bütçesinin tamamını
    // yutmasını engeller.
    this.maxRiskPerBotPct = this.config.maxRiskPerBotPct || 2.0;

    // Risk bazlı boyutlandırma (fixed fractional). Nakit yüzdesi "ne kadar
    // alıyorum" sorusunu yanıtlar; bu "ne kadar kaybedebilirim" sorusunu —
    // asıl sorulması gereken soru budur.
    this.riskSizingEnabled = this.config.riskSizingEnabled !== false;
    this.riskPerTradePct = this.config.riskPerTradePct || 1.0;

    // Nakit tavanının bot sayısına bölünmesi, portföy tavanları yokken konmuş
    // kaba bir emniyetti. Brüt maruziyet, açık risk bütçesi, slot ve küme
    // tavanları toplamı zaten tuttuğu için bölme artık aynı işi ikinci kez
    // yapıyor ve pozisyon başına tavanı risk hedefinin çok altına çekiyordu.
    this.splitCashCapAcrossBots = this.config.splitCashCapAcrossBots === true;

    // ATR bazlı stop: sabit %2, BTC ile DOGE için tamamen farklı şeyler
    // ifade eder. Volatiliteye göre ölçeklenen stop, riski varlıklar
    // arasında eşitler. Alt/üst sınır uç ATR değerlerine karşı koruma.
    this.atrStopEnabled = this.config.atrStopEnabled !== false;
    this.atrPeriod = this.config.atrPeriod || 14;
    this.atrTimeframe = this.config.atrTimeframe || '1h';
    this.atrStopMultiplier = this.config.atrStopMultiplier || 2.0;
    this.atrStopMinPct = this.config.atrStopMinPct || 0.8;
    this.atrStopMaxPct = this.config.atrStopMaxPct || 6.0;
    // Stop volatiliteye göre kayınca sabit TP risk/ödül oranını bozar,
    // bu yüzden TP stop mesafesinden türetilir.
    this.takeProfitRR = this.config.takeProfitRR || 2.0;
    // Strateji kendi stop mesafesini gönderdiğinde ona öncelik verilsin mi?
    // Bj Bot gibi stratejiler stopu swing seviyesi + ATR ile hesaplar ve genel
    // bir yüzdeyle ezmek risk/ödül yapısını bozar. Ama TSS gibi stratejiler
    // yalnızca kendi config'indeki sabit yüzdeyi geçirir — o durumda ATR
    // stopunu devre dışı bırakmış olur. Seçim kullanıcıda.
    this.strategyStopPrecedence = this.config.strategyStopPrecedence !== false;

    this.tiers = this.buildTiers();
    if (this.tierIndex >= this.tiers.length) this.tierIndex = this.tiers.length - 1;
  }

  /** Sembol → küme adı eşlemesi. Sembol biçimi normalize edilir (BTC/USDT = BTCUSDT). */
  buildClusterIndex() {
    const index = {};
    Object.entries(this.clusters || {}).forEach(([name, symbols]) => {
      (Array.isArray(symbols) ? symbols : []).forEach(sym => {
        index[normSymbol(sym)] = name;
      });
    });
    return index;
  }

  clusterOf(symbol) {
    return this.clusterIndex[normSymbol(symbol)] || UNCLUSTERED_NAME;
  }

  /**
   * Kademe listesi: 0. kademe her zaman "Normal" (çarpan 1). Kullanıcı
   * `risk.riskTiers` ile mutlak `ddPct` verebilir; vermezse merdiven
   * `maxDrawdownPct` oranından türetilir.
   */
  buildTiers() {
    const custom = Array.isArray(this.config.riskTiers) && this.config.riskTiers.length
      ? this.config.riskTiers
      : DEFAULT_TIER_LADDER;

    const tiers = [{ index: 0, label: 'Normal', ddPct: 0, sizeMultiplier: 1.0, haltNewEntries: false }];

    custom.forEach((t, i) => {
      const ddPct = Number.isFinite(t.ddPct) ? t.ddPct : this.maxDrawdownPct * (t.ddFrac || 0);
      const mult = Number.isFinite(t.sizeMultiplier) ? t.sizeMultiplier : 1.0;
      tiers.push({
        index: i + 1,
        label: t.label || `Kademe ${i + 1}`,
        ddPct: +ddPct.toFixed(2),
        sizeMultiplier: Math.max(0, Math.min(1, mult)),
        haltNewEntries: !!t.haltNewEntries
      });
    });

    tiers.sort((a, b) => a.ddPct - b.ddPct);
    tiers.forEach((t, i) => { t.index = i; });
    return tiers;
  }

  /**
   * Güncel drawdown'a karşılık gelen kademe. Yukarı çıkış anında, aşağı iniş
   * histerezis kadar toparlanma sonrası olur.
   */
  resolveTier(ddPct = this.currentDrawdownPct) {
    if (!this.equityTiersEnabled) {
      this.tierIndex = 0;
      return this.tiers[0];
    }

    let target = 0;
    for (const t of this.tiers) {
      if (ddPct >= t.ddPct) target = t.index;
    }

    if (target > this.tierIndex) {
      const next = this.tiers[target];
      this.tierIndex = target;
      db.addLog('WARN', `📉 Sermaye kademesi düşürüldü → "${next.label}" (DD %${ddPct.toFixed(2)} ≥ %${next.ddPct}). Pozisyon boyutu ×${next.sizeMultiplier}${next.haltNewEntries ? ', yeni giriş yok' : ''}.`);
      this.saveState();
    } else if (target < this.tierIndex) {
      const current = this.tiers[this.tierIndex];
      if (ddPct <= current.ddPct - this.tierHysteresisPct) {
        const back = this.tiers[target];
        this.tierIndex = target;
        db.addLog('SUCCESS', `📈 Sermaye toparlandı → "${back.label}" kademesine dönüldü (DD %${ddPct.toFixed(2)}). Pozisyon boyutu ×${back.sizeMultiplier}.`);
        this.saveState();
      }
    }

    return this.tiers[this.tierIndex];
  }

  /**
   * Tracks portfolio peak capital and computes Peak-to-Trough Drawdown
   */
  updatePortfolioCapital(currentTotalEquity) {
    if (Number.isFinite(currentTotalEquity)) this.lastEquity = currentTotalEquity;

    if (this.peakCapital === null || currentTotalEquity > this.peakCapital) {
      this.peakCapital = currentTotalEquity;
      this.saveState();
    }

    if (this.peakCapital > 0) {
      this.currentDrawdownPct = +(((this.peakCapital - currentTotalEquity) / this.peakCapital) * 100.0).toFixed(2);
    }

    // 1. Max Drawdown Kill-Switch Check
    if (this.currentDrawdownPct >= this.maxDrawdownPct && !this.killSwitchTriggered) {
      this.killSwitchTriggered = true;
      this.killSwitchReason = `KRİTİK ZARAR LİMİTİ AŞILDI (%${this.currentDrawdownPct} >= %${this.maxDrawdownPct})`;
      db.addLog('ERROR', `🚨 EMERGENCY KILL-SWITCH DEVREDE: ${this.killSwitchReason}. Tüm işlemler donduruldu!`);
      this.saveState();
      return { killSwitch: true, reason: this.killSwitchReason };
    }

    this.resolveTier(this.currentDrawdownPct);

    return { killSwitch: this.killSwitchTriggered, drawdownPct: this.currentDrawdownPct };
  }

  /**
   * İşlem gününün kimliği (yerel saat). `dayResetHour` kadar geri kaydırılır,
   * böylece gün sınırı gece yarısı yerine istenen saatte olur.
   */
  dayKeyFor(timestamp = Date.now()) {
    const d = new Date(timestamp);
    d.setHours(d.getHours() - this.dayResetHour);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  /**
   * Günlük zarar limiti. Gün başındaki sermaye referans alınır; gün içinde
   * bu referanstan `dailyLossLimitPct` kadar uzaklaşılırsa yeni giriş durur.
   * Gün sınırı geçildiğinde referans yenilenir ve limit kendiliğinden kalkar.
   *
   * Drawdown'dan farkı: drawdown *tüm zamanların* zirvesine bakar ve yavaş
   * erimeyi yakalar; bu ise tek gün içindeki hızlı kaybı yakalar.
   */
  updateDailyRisk(currentTotalEquity) {
    if (!Number.isFinite(currentTotalEquity) || currentTotalEquity <= 0) {
      return { triggered: false, flatten: false };
    }

    const key = this.dayKeyFor();

    // Gün değişti: referansı yenile, limiti kaldır.
    if (this.dayKey !== key) {
      const prevKey = this.dayKey;
      const prevStart = this.dayStartEquity;
      const wasHalted = this.dailyHaltTriggered;

      this.dayKey = key;
      this.dayStartEquity = currentTotalEquity;
      this.dayLowEquity = currentTotalEquity;
      this.dailyHaltTriggered = false;
      this.dailyHaltReason = '';
      this.saveState();

      if (prevKey) {
        const dayPnl = Number.isFinite(prevStart) ? currentTotalEquity - prevStart : 0;
        db.addLog('INFO', `📅 Yeni işlem günü (${key}). Referans sermaye $${currentTotalEquity.toFixed(2)}. ${prevKey} sonucu: ${dayPnl >= 0 ? '+' : ''}$${dayPnl.toFixed(2)}.${wasHalted ? ' Günlük zarar limiti kalktı.' : ''}`);
      }
      return { triggered: false, flatten: false };
    }

    // İlk tick veya kayıp durum: referansı şimdi al.
    if (!Number.isFinite(this.dayStartEquity) || this.dayStartEquity <= 0) {
      this.dayStartEquity = currentTotalEquity;
      this.dayLowEquity = currentTotalEquity;
      this.saveState();
      return { triggered: false, flatten: false };
    }

    if (!Number.isFinite(this.dayLowEquity) || currentTotalEquity < this.dayLowEquity) {
      this.dayLowEquity = currentTotalEquity;
    }

    if (!this.dailyLossLimitEnabled || this.dailyHaltTriggered) {
      return { triggered: false, flatten: false };
    }

    const lossPct = ((this.dayStartEquity - currentTotalEquity) / this.dayStartEquity) * 100.0;
    if (lossPct >= this.dailyLossLimitPct) {
      this.dailyHaltTriggered = true;
      this.dailyHaltReason = `Günlük zarar limiti aşıldı (%${lossPct.toFixed(2)} ≥ %${this.dailyLossLimitPct})`;
      this.saveState();

      const flatten = this.dailyLossAction === 'flatten';
      db.addLog('ERROR', `🛑 GÜNLÜK ZARAR LİMİTİ: ${this.dailyHaltReason}. Gün başı $${this.dayStartEquity.toFixed(2)} → şimdi $${currentTotalEquity.toFixed(2)}. ${flatten ? 'Tüm pozisyonlar kapatılıyor.' : 'Gün sonuna kadar yeni giriş yok, açık pozisyonlar kendi stop/TP kurallarıyla yönetilmeye devam ediyor.'}`);

      return { triggered: true, flatten };
    }

    return { triggered: false, flatten: false };
  }

  /** Günlük durumun panele gönderilen özeti. */
  getDailyStatus() {
    const start = Number.isFinite(this.dayStartEquity) ? this.dayStartEquity : 0;
    const equity = this.lastEquity || 0;
    const pnl = start > 0 ? equity - start : 0;
    const pnlPct = start > 0 ? (pnl / start) * 100.0 : 0;
    const worstPct = (start > 0 && Number.isFinite(this.dayLowEquity))
      ? ((this.dayLowEquity - start) / start) * 100.0
      : 0;

    return {
      dayKey: this.dayKey,
      dayResetHour: this.dayResetHour,
      startEquity: +start.toFixed(2),
      lowEquity: Number.isFinite(this.dayLowEquity) ? +this.dayLowEquity.toFixed(2) : 0,
      pnlUSDT: +pnl.toFixed(2),
      pnlPct: +pnlPct.toFixed(2),
      worstPct: +worstPct.toFixed(2),
      limitPct: this.dailyLossLimitPct,
      limitEnabled: this.dailyLossLimitEnabled,
      action: this.dailyLossAction,
      // Limite ne kadar kaldı — negatifse limit aşılmış demektir.
      remainingUSDT: +(start * (this.dailyLossLimitPct / 100.0) + pnl).toFixed(2),
      usedPct: this.dailyLossLimitPct > 0 ? +((Math.max(0, -pnlPct) / this.dailyLossLimitPct) * 100).toFixed(1) : 0,
      haltTriggered: this.dailyHaltTriggered,
      haltReason: this.dailyHaltReason
    };
  }

  /** Limiti gün bitmeden elle kaldırır ve referansı bugüne yeniden çeker. */
  resetDailyHalt() {
    this.dailyHaltTriggered = false;
    this.dailyHaltReason = '';
    if (this.lastEquity > 0) {
      this.dayStartEquity = this.lastEquity;
      this.dayLowEquity = this.lastEquity;
    }
    this.saveState();
    db.addLog('SUCCESS', `🔄 Günlük zarar limiti elle sıfırlandı. Yeni referans sermaye: $${(this.lastEquity || 0).toFixed(2)}.`);
  }

  emptyOpenRisk() {
    return {
      openRiskUSDT: 0,
      openRiskPct: 0,
      plannedRiskUSDT: 0,
      plannedRiskPct: 0,
      exposureUSDT: 0,
      exposurePct: 0,
      positionCount: 0,
      unprotectedCount: 0,
      budgetUSDT: 0,
      remainingBudgetUSDT: 0,
      budgetUsedPct: 0,
      overLimit: false,
      positions: [],
      bySymbol: {},
      byBot: {},
      byCluster: [],
      grossCapUSDT: 0,
      grossCapUsedPct: 0,
      slotsUsed: 0,
      slotsMax: this.maxConcurrentPositions || 10
    };
  }

  /**
   * Bir pozisyonun bugünkü efektif stop fiyatı. `evaluatePositions` içindeki
   * çıkış kurallarının birebir aynısını uygular — ölçülen risk, motorun
   * gerçekten uygulayacağı çıkışla aynı olmalı, yoksa rakam süs olur.
   */
  /**
   * Bir pozisyonun stop ve take-profit mesafesi. Pozisyon açılırken hesaplanan
   * değer üzerinde saklanır; yoksa (eski pozisyonlar) global ayara düşülür.
   * Stop mesafesi pozisyon ömrü boyunca sabittir — ATR sonradan değişse bile
   * girişte kabul edilen risk geriye dönük değiştirilmemeli.
   */
  /**
   * Pozisyonun yönü: long +1, short −1.
   *
   * Risk yöneticisi baştan sona long varsayımıyla yazılmıştı (`side` geçen tek
   * satır yoktu). Vadeli tarafta bu sessiz bir felakete dönerdi: short bir
   * pozisyonda fiyat YÜKSELDİĞİNDE zarar edilir, oysa tüm eşikler "fiyat
   * düşerse zarar" varsayıyordu — stop hiç tetiklenmez, take-profit ise zarar
   * büyürken tetiklenirdi.
   */
  static yon(pos) {
    return (pos && pos.side === 'short') ? -1 : 1;
  }

  /** Pozisyon lehine giden uç fiyat: long'da en yüksek, short'ta en düşük. */
  static ucFiyat(pos) {
    const kisa = RiskManager.yon(pos) === -1;
    const deger = kisa ? pos.lowestPrice : pos.highestPrice;
    return Number.isFinite(deger) && deger > 0 ? deger : null;
  }

  positionStopPct(pos) {
    const stored = Number(pos && pos.stopPct);
    return Number.isFinite(stored) && stored > 0 ? stored : this.stopLossPct;
  }

  positionTakeProfitPct(pos) {
    const stored = Number(pos && pos.tpPct);
    return Number.isFinite(stored) && stored > 0 ? stored : this.takeProfitPct;
  }

  /**
   * Volatiliteye göre stop mesafesi. ATR yoksa veya kapalıysa sabit yüzdeye
   * düşülür — strateji ATR üretmediğinde davranış eskisiyle aynı kalır.
   */
  resolveStopPct(currentPrice, atrValue, signalStopPct = null, signalTpPct = null) {
    // Strateji kendi stop mesafesini hesaplayıp gönderdiyse o kazanır: Bj Bot
    // swing seviyesi + ATR ile, breakout_atr kendi kanalıyla hesaplıyor.
    // Genel bir yüzdeyle ezmek stratejinin risk/ödül yapısını bozar.
    if (this.strategyStopPrecedence && Number(signalStopPct) > 0) {
      const stopPct = Number(signalStopPct);
      return {
        stopPct: +stopPct.toFixed(4),
        tpPct: Number(signalTpPct) > 0 ? +Number(signalTpPct).toFixed(4) : +(stopPct * this.takeProfitRR).toFixed(4),
        stopSource: 'strateji'
      };
    }

    const fixed = {
      stopPct: this.stopLossPct,
      tpPct: this.takeProfitPct,
      stopSource: 'sabit'
    };

    if (!this.atrStopEnabled) return fixed;
    if (!Number.isFinite(atrValue) || atrValue <= 0) return fixed;
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return fixed;

    const raw = (atrValue / currentPrice) * 100.0 * this.atrStopMultiplier;
    const stopPct = Math.min(this.atrStopMaxPct, Math.max(this.atrStopMinPct, raw));

    return {
      stopPct: +stopPct.toFixed(4),
      tpPct: +(stopPct * this.takeProfitRR).toFixed(4),
      stopSource: 'ATR',
      atrPct: +((atrValue / currentPrice) * 100).toFixed(4),
      clamped: raw > this.atrStopMaxPct ? 'üst' : (raw < this.atrStopMinPct ? 'alt' : null)
    };
  }

  stopPriceFor(pos) {
    const entry = Number(pos && pos.entryPrice);
    if (!Number.isFinite(entry) || entry <= 0) return null;

    // Short'ta stop ÜSTTE: her işaret bu tek katsayıdan dönüyor.
    const yon = RiskManager.yon(pos);
    const kisa = yon === -1;

    // Breakeven tetiklenmişse stop girişe taşınmıştır (activeStopLossPct = 0).
    let stop = pos.isBreakeven ? entry : entry * (1 - yon * this.positionStopPct(pos) / 100.0);

    // Trailing stop yalnızca kâr bölgesinde çalışır; girişin ötesine geçmeyen
    // bir trailing seviyesi zaten sabit stop tarafından karşılanır.
    const uc = RiskManager.ucFiyat(pos);
    if (this.config.trailingStop && uc !== null) {
      const trailPct = (this.config.trailingStopPct || 1.5) / 100.0;
      // long: uç × (1 − %) — zirveden aşağı; short: uç × (1 + %) — dipten yukarı.
      const trail = uc * (kisa ? (1 + trailPct) : (1 - trailPct));
      if (kisa ? (trail < entry && trail < stop) : (trail > entry && trail > stop)) stop = trail;
    }

    // Stratejinin gönderdiği takip eden stop (`signal.updateStop` → motor →
    // `pos.strategyStop`). Sigmoid TS gibi kendi stop mantığı olan stratejiler
    // buradan bağlanır. Yalnızca SIKILAŞTIRIR: motorun kendi stopundan daha
    // gevşek bir seviye yok sayılır, yoksa strateji riski büyütebilirdi.
    // Short'ta sıkılaşma yönü TERSTİR: stop aşağı inerse yaklaşır.
    if (Number.isFinite(pos.strategyStop) && (kisa ? pos.strategyStop < stop : pos.strategyStop > stop)) {
      stop = pos.strategyStop;
    }

    return stop;
  }

  /**
   * Açık risk = tüm pozisyonların stop'a kadar taşıdığı toplam kayıp.
   *
   * İki ayrı büyüklük raporlanır:
   *  - `openRiskUSDT`   : güncel fiyattan stop'a kadar — şu an masadaki sermaye.
   *    Sermaye zaten gerçekleşmemiş kârı içerdiği için tavan bununla ölçülür.
   *  - `plannedRiskUSDT`: girişten stop'a kadar — pozisyon açılırken göze
   *    alınan başlangıç riski (R). Breakeven'a taşınan pozisyonda 0'a düşer.
   */
  computeOpenRisk(positions = [], markPrices = {}, totalEquity = this.lastEquity) {
    const result = this.emptyOpenRisk();

    const priceMap = {};
    Object.keys(markPrices || {}).forEach(key => {
      const raw = markPrices[key];
      const price = (raw && typeof raw === 'object') ? raw.last : raw;
      if (Number.isFinite(price) && price > 0) priceMap[normSymbol(key)] = price;
    });

    for (const pos of (positions || [])) {
      const amount = Number(pos && pos.amount) || 0;
      const entry = Number(pos && pos.entryPrice) || 0;
      if (amount <= 0 || entry <= 0) continue;

      // Fiyat çekilemediyse girişten ölçmek riski olduğundan küçük gösterir —
      // bu pozisyon ayrıca "korumasız" sayılır ki panelde görünür olsun.
      const priced = priceMap[normSymbol(pos.symbol)];
      const mark = Number.isFinite(priced) ? priced : entry;
      const stop = this.stopPriceFor(pos);

      const exposure = amount * mark;
      // Stop mesafesi yön duyarlı: short'ta stop fiyatın ÜSTÜNDEDİR, dolayısıyla
      // risk `(stop − mark)`tir. İşaret düzeltilmezse her short pozisyon "risksiz"
      // görünür ve açık risk tavanı hiç bağlamazdı.
      const posYon = RiskManager.yon(pos);
      const risk = stop === null ? exposure : Math.max(0, posYon * (mark - stop) * amount);
      const planned = stop === null ? exposure : Math.max(0, posYon * (entry - stop) * amount);

      result.exposureUSDT += exposure;
      result.openRiskUSDT += risk;
      result.plannedRiskUSDT += planned;
      result.positionCount += 1;
      if (stop === null || !Number.isFinite(priced)) result.unprotectedCount += 1;

      // Varlık ve küme bazlı yığılma — limitler bu kırılım üzerinden işler.
      const symKey = normSymbol(pos.symbol);
      if (!result.bySymbol[symKey]) {
        result.bySymbol[symKey] = { symbol: pos.symbol, cluster: this.clusterOf(pos.symbol), exposureUSDT: 0, riskUSDT: 0, count: 0 };
      }
      result.bySymbol[symKey].exposureUSDT += exposure;
      result.bySymbol[symKey].riskUSDT += risk;
      result.bySymbol[symKey].count += 1;

      // Bot bazlı kırılım: kota kontrolü buradan okunur.
      const botKey = pos.botId || '(botsuz)';
      if (!result.byBot[botKey]) {
        result.byBot[botKey] = { botId: botKey, exposureUSDT: 0, riskUSDT: 0, count: 0 };
      }
      result.byBot[botKey].exposureUSDT += exposure;
      result.byBot[botKey].riskUSDT += risk;
      result.byBot[botKey].count += 1;

      result.positions.push({
        symbol: pos.symbol,
        cluster: this.clusterOf(pos.symbol),
        botId: pos.botId || null,
        // Vadeli künyesi: yön, kaldıraç ve likidasyon fiyatı görünmezse panel
        // bir short pozisyonu long gibi gösterir.
        side: pos.side || 'long',
        leverage: Number(pos.leverage) || 1,
        liqPrice: Number.isFinite(pos.liqPrice) ? +Number(pos.liqPrice).toFixed(6) : null,
        stopPct: +this.positionStopPct(pos).toFixed(2),
        tpPct: +this.positionTakeProfitPct(pos).toFixed(2),
        stopSource: Number.isFinite(Number(pos.stopPct)) && Number(pos.stopPct) > 0 ? (pos.stopSource || 'ATR') : 'sabit',
        boundBy: pos.boundBy || null,
        amount: +amount.toFixed(8),
        entryPrice: +entry.toFixed(6),
        markPrice: +mark.toFixed(6),
        stopPrice: stop === null ? null : +stop.toFixed(6),
        isBreakeven: !!pos.isBreakeven,
        riskUSDT: +risk.toFixed(2),
        plannedRiskUSDT: +planned.toFixed(2),
        exposureUSDT: +exposure.toFixed(2),
        priced: Number.isFinite(priced)
      });
    }

    const equity = Number.isFinite(totalEquity) && totalEquity > 0 ? totalEquity : 0;
    result.budgetUSDT = equity * (this.maxOpenRiskPct / 100.0);
    result.remainingBudgetUSDT = Math.max(0, result.budgetUSDT - result.openRiskUSDT);
    result.overLimit = this.openRiskLimitEnabled && result.budgetUSDT > 0 && result.openRiskUSDT > result.budgetUSDT;

    if (equity > 0) {
      result.openRiskPct = +((result.openRiskUSDT / equity) * 100).toFixed(2);
      result.plannedRiskPct = +((result.plannedRiskUSDT / equity) * 100).toFixed(2);
      result.exposurePct = +((result.exposureUSDT / equity) * 100).toFixed(2);
    }
    if (result.budgetUSDT > 0) {
      result.budgetUsedPct = +((result.openRiskUSDT / result.budgetUSDT) * 100).toFixed(1);
    }

    // Küme toplamları. Kümede pozisyon olmasa bile satır üretilir ki panelde
    // hangi kümelerin boş durduğu görünsün.
    const clusterMap = {};
    const ensureCluster = (name) => {
      if (!clusterMap[name]) clusterMap[name] = { cluster: name, exposureUSDT: 0, riskUSDT: 0, count: 0, symbols: [] };
      return clusterMap[name];
    };
    Object.keys(this.clusters || {}).forEach(name => ensureCluster(name));

    Object.values(result.bySymbol).forEach(entry => {
      const c = ensureCluster(entry.cluster);
      c.exposureUSDT += entry.exposureUSDT;
      c.riskUSDT += entry.riskUSDT;
      c.count += entry.count;
      c.symbols.push(entry.symbol);
    });

    const symbolCap = equity * (this.maxSymbolExposurePct / 100.0);
    const clusterCap = equity * (this.maxClusterExposurePct / 100.0);
    const botRiskCap = equity * (this.maxRiskPerBotPct / 100.0);

    Object.values(result.byBot).forEach(entry => {
      entry.exposureUSDT = +entry.exposureUSDT.toFixed(2);
      entry.riskUSDT = +entry.riskUSDT.toFixed(2);
      entry.riskCapUSDT = +botRiskCap.toFixed(2);
      entry.riskCapUsedPct = botRiskCap > 0 ? +((entry.riskUSDT / botRiskCap) * 100).toFixed(1) : 0;
    });

    Object.values(result.bySymbol).forEach(entry => {
      entry.exposureUSDT = +entry.exposureUSDT.toFixed(2);
      entry.riskUSDT = +entry.riskUSDT.toFixed(2);
      entry.exposurePct = equity > 0 ? +((entry.exposureUSDT / equity) * 100).toFixed(2) : 0;
      entry.capUSDT = +symbolCap.toFixed(2);
      entry.capUsedPct = symbolCap > 0 ? +((entry.exposureUSDT / symbolCap) * 100).toFixed(1) : 0;
    });

    result.byCluster = Object.values(clusterMap)
      .map(c => ({
        cluster: c.cluster,
        symbols: c.symbols,
        count: c.count,
        exposureUSDT: +c.exposureUSDT.toFixed(2),
        riskUSDT: +c.riskUSDT.toFixed(2),
        exposurePct: equity > 0 ? +((c.exposureUSDT / equity) * 100).toFixed(2) : 0,
        capUSDT: +clusterCap.toFixed(2),
        capUsedPct: clusterCap > 0 ? +((c.exposureUSDT / clusterCap) * 100).toFixed(1) : 0,
        overLimit: this.exposureLimitsEnabled && clusterCap > 0 && c.exposureUSDT > clusterCap
      }))
      .sort((a, b) => b.exposureUSDT - a.exposureUSDT);

    result.grossCapUSDT = +(equity * (this.maxGrossExposurePct / 100.0)).toFixed(2);
    result.grossCapUsedPct = result.grossCapUSDT > 0
      ? +((result.exposureUSDT / result.grossCapUSDT) * 100).toFixed(1)
      : 0;
    result.slotsUsed = result.positionCount;
    result.slotsMax = this.maxConcurrentPositions;

    result.openRiskUSDT = +result.openRiskUSDT.toFixed(2);
    result.plannedRiskUSDT = +result.plannedRiskUSDT.toFixed(2);
    result.exposureUSDT = +result.exposureUSDT.toFixed(2);
    result.budgetUSDT = +result.budgetUSDT.toFixed(2);
    result.remainingBudgetUSDT = +result.remainingBudgetUSDT.toFixed(2);

    return result;
  }

  /** Tick başına bir kez: açık riski ölçer, sonucu duruma yazar. */
  updateOpenRisk(positions, markPrices, totalEquity) {
    this.openRisk = this.computeOpenRisk(positions, markPrices, totalEquity);

    if (this.openRisk.overLimit) {
      this.logThrottled('WARN', 'openrisk-over',
        `⚠️ Açık risk tavanı aşıldı: $${this.openRisk.openRiskUSDT} / $${this.openRisk.budgetUSDT} (sermayenin %${this.openRisk.openRiskPct}'i, tavan %${this.maxOpenRiskPct}). Yeni giriş yapılmayacak.`);
    }
    if (this.openRisk.unprotectedCount > 0) {
      this.logThrottled('WARN', 'openrisk-unpriced',
        `⚠️ ${this.openRisk.unprotectedCount} pozisyonun güncel fiyatı okunamadı; riski girişten ölçüldü (olduğundan düşük görünebilir).`);
    }

    return this.openRisk;
  }

  /** Kayıp serisinin pozisyon boyutuna uyguladığı çarpan. */
  antiMartingaleMultiplier() {
    if (!this.antiMartingaleEnabled || this.consecutiveLosses <= 0) return 1.0;
    const raw = 1.0 - (this.consecutiveLosses * this.antiMartingaleStep);
    return Math.max(this.antiMartingaleFloor, Math.min(1.0, raw));
  }

  /**
   * Kayıpsız geçen süre serinin bir kademesini eritir. Kapalıyken (varsayılan)
   * seri yalnızca kârlı bir işlemle azalır — düşük kazanma oranlı bir sistemde
   * bu, boyutun tabana yapışıp orada kalması anlamına gelir.
   */
  decayLossStreak() {
    if (!this.lossStreakDecayMinutes || this.consecutiveLosses <= 0) return;

    const intervalMs = this.lossStreakDecayMinutes * 60 * 1000;
    if (!this.lastLossAt) {
      this.lastLossAt = Date.now();
      return;
    }

    const elapsed = Date.now() - this.lastLossAt;
    if (elapsed < intervalMs) return;

    const steps = Math.floor(elapsed / intervalMs);
    const before = this.consecutiveLosses;
    this.consecutiveLosses = Math.max(0, this.consecutiveLosses - steps);
    this.lastLossAt = Date.now();
    this.saveState();
    db.addLog('INFO', `⏳ ${this.lossStreakDecayMinutes} dk kayıpsız geçti: kayıp serisi ${before} → ${this.consecutiveLosses}. Pozisyon boyutu çarpanı ×${this.antiMartingaleMultiplier().toFixed(2)}.`);
  }

  /**
   * Called on trade settlement to update loss streaks and trigger Anti-Martingale / Cooldown
   */
  registerTradeResult(profitUSDT) {
    if (profitUSDT < 0) {
      this.consecutiveLosses += 1;
      this.lastLossAt = Date.now();
      db.addLog('WARN', `⚠️ Peş Peşe Kayıp Sayısı: ${this.consecutiveLosses} (boyut çarpanı ×${this.antiMartingaleMultiplier().toFixed(2)})`);

      if (this.consecutiveLosses >= this.maxLossStreak) {
        if (this.cooldownEnabled) {
          this.cooldownUntil = Date.now() + this.cooldownDurationMs;
          db.addLog('WARN', `⏸️ ${this.maxLossStreak} Üst Üste Kayıp Yaşandı! Bot ${this.config.cooldownMinutes || 15} Dakikalık Soğuma Moduna Geçti.`);
        } else {
          db.addLog('WARN', `⚠️ ${this.maxLossStreak} Üst Üste Kayıp Yaşandı — Soğuma Modu kapalı olduğu için işlemler sürüyor.`);
        }
      }
    } else if (profitUSDT > 0) {
      if (this.consecutiveLosses > 0) {
        const before = this.consecutiveLosses;
        // 'step' modunda tek kârlı işlem seriyi tamamen silmez: 9 kayıptan
        // sonra boyutun bir anda dört katına çıkması, kademeli küçültmenin
        // amacına aykırı bir sıçrama üretir.
        this.consecutiveLosses = this.lossStreakResetMode === 'step'
          ? Math.max(0, this.consecutiveLosses - 1)
          : 0;
        db.addLog('SUCCESS', `🎉 Kârlı İşlem Gerçekleşti. Kayıp serisi ${before} → ${this.consecutiveLosses} (boyut çarpanı ×${this.antiMartingaleMultiplier().toFixed(2)}).`);
      }
    }
    this.saveState();
  }

  /**
   * Resets the drawdown high-water mark to the current equity. Needed after a
   * manual balance change — otherwise a withdrawal looks like a loss and can
   * trip the kill-switch.
   */
  rebasePeak(currentEquity) {
    if (!Number.isFinite(currentEquity) || currentEquity <= 0) return;
    this.peakCapital = currentEquity;
    this.lastEquity = currentEquity;
    this.currentDrawdownPct = 0.0;
    this.tierIndex = 0;
    // Günlük referans da kayar: elle para yatırma/çekme aksi halde o günün
    // zararı gibi okunur ve günlük limiti haksız yere tetikler.
    this.dayKey = this.dayKeyFor();
    this.dayStartEquity = currentEquity;
    this.dayLowEquity = currentEquity;
    this.dailyHaltTriggered = false;
    this.dailyHaltReason = '';
    this.saveState();
    db.addLog('INFO', `📌 Drawdown ve günlük zarar referansı güncellendi: $${currentEquity.toFixed(2)}`);
  }

  resetState() {
    this.peakCapital = null;
    this.currentDrawdownPct = 0.0;
    this.consecutiveLosses = 0;
    this.lastLossAt = 0;
    this.cooldownUntil = 0;
    this.killSwitchTriggered = false;
    this.killSwitchReason = '';
    this.tierIndex = 0;
    this.lastEquity = 0;
    this.openRisk = this.emptyOpenRisk();
    this.dayKey = null;
    this.dayStartEquity = null;
    this.dayLowEquity = null;
    this.dailyHaltTriggered = false;
    this.dailyHaltReason = '';
    this.saveState();
  }

  /**
   * Calculates Anti-Martingale Scaled Position Size
   */
  /**
   * These fire once per bot per tick. Logging every time buried the log buffer
   * under hundreds of identical lines, so repeats are throttled.
   */
  logThrottled(level, key, message, intervalMs = 60000) {
    const now = Date.now();
    if (!this._logTimes) this._logTimes = {};
    if (this._logTimes[key] && (now - this._logTimes[key]) < intervalMs) return;
    this._logTimes[key] = now;
    db.addLog(level, message);
  }

  /**
   * Maruziyet limitleri: yeni bir alımın hangi tavana ne kadar sığdığını
   * hesaplar. Dönen değer USDT cinsinden izin verilen üst sınırdır; `null`
   * limitlerin kapalı olduğunu, `0` ise girişin tamamen kapalı olduğunu belirtir.
   *
   * Açık risk tavanından farkı: o toplam *kaybı* sınırlar, bunlar sermayenin
   * nereye *yığıldığını*. Aynı yönde 16 korelasyonlu altcoin, risk tavanına
   * takılmadan tek pozisyon gibi davranabilir — kümeler bunu engeller.
   */
  exposureHeadroomUSDT(symbol) {
    if (!this.exposureLimitsEnabled) return null;

    const equity = this.lastEquity > 0 ? this.lastEquity : 0;
    if (equity <= 0) return null;

    const or = this.openRisk || this.emptyOpenRisk();
    const symKey = normSymbol(symbol);
    const symEntry = or.bySymbol ? or.bySymbol[symKey] : null;
    const hasPosition = !!(symEntry && symEntry.count > 0);

    // Eşzamanlı pozisyon sayısı: mevcut bir varlığa ekleme yapmak yeni bir
    // slot tüketmez, bu yüzden yalnızca yeni varlıklar engellenir.
    if (!hasPosition && or.positionCount >= this.maxConcurrentPositions) {
      this.logThrottled('WARN', 'exposure-slots',
        `⛔ Eşzamanlı pozisyon limiti dolu (${or.positionCount}/${this.maxConcurrentPositions}). Yeni varlıkta pozisyon açılmıyor.`);
      return 0;
    }

    const limits = [];

    const symbolCap = equity * (this.maxSymbolExposurePct / 100.0);
    limits.push({
      name: `${symbol} varlık tavanı (%${this.maxSymbolExposurePct})`,
      room: symbolCap - (symEntry ? symEntry.exposureUSDT : 0)
    });

    const clusterName = this.clusterOf(symbol);
    const clusterEntry = (or.byCluster || []).find(c => c.cluster === clusterName);
    const clusterCap = equity * (this.maxClusterExposurePct / 100.0);
    limits.push({
      name: `"${clusterName}" küme tavanı (%${this.maxClusterExposurePct})`,
      room: clusterCap - (clusterEntry ? clusterEntry.exposureUSDT : 0)
    });

    const grossCap = equity * (this.maxGrossExposurePct / 100.0);
    limits.push({
      name: `brüt maruziyet tavanı (%${this.maxGrossExposurePct})`,
      room: grossCap - or.exposureUSDT
    });

    const tightest = limits.reduce((a, b) => (b.room < a.room ? b : a));
    if (tightest.room <= 0) {
      this.logThrottled('WARN', `exposure-${symKey}`,
        `⛔ ${symbol}: ${tightest.name} dolu. Yeni alım yapılmıyor.`);
      return 0;
    }

    return tightest.room;
  }

  /**
   * Pozisyon boyutu ve o pozisyona yazılacak stop/TP mesafesi.
   *
   * `context`: { atrValue, activeSymbolsCount, symbol, botId }
   * Dönen: { amount, stopPct, tpPct, stopSource, blockedBy }
   *
   * Hedef boyut risk bazlı belirlenir ("bu işlemde sermayenin %1'ini riske
   * atarım"), ardından tüm tavanlar bunu yalnızca *küçültebilir*. Nakit
   * yüzdesi tavanı da bu tavanlardan biridir — artık hedefi değil sınırı verir.
   */
  calculatePositionSize(availableUSDT, currentPrice, context = {}) {
    const {
      atrValue = null,
      activeSymbolsCount = 1,
      symbol = null,
      botId = null,
      signalStopPct = null,
      signalTpPct = null
    } = context;

    const blocked = (reason) => ({
      amount: 0,
      stopPct: this.stopLossPct,
      tpPct: this.takeProfitPct,
      stopSource: 'sabit',
      blockedBy: reason
    });

    if (this.killSwitchTriggered) {
      this.logThrottled('ERROR', 'killswitch', 'Kill-Switch aktif! Yeni pozisyon açılamaz.');
      return blocked('kill-switch');
    }

    if (this.cooldownEnabled && Date.now() < this.cooldownUntil) {
      const remainingSec = Math.ceil((this.cooldownUntil - Date.now()) / 1000);
      this.logThrottled('WARN', 'cooldown', `Bot Soğuma Modunda (${remainingSec} sn kaldı). Yeni alım engellendi.`);
      return blocked('soğuma');
    }

    if (this.dailyLossLimitEnabled && this.dailyHaltTriggered) {
      this.logThrottled('WARN', 'daily-halt', `🛑 ${this.dailyHaltReason}. Gün sonuna kadar yeni pozisyon açılmıyor.`);
      return blocked('günlük limit');
    }

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return blocked('fiyat yok');

    // Sermaye kademesi: drawdown derinleştikçe boyut küçülür, en üst kademede
    // yeni giriş tamamen durur (kill-switch'ten önceki son fren).
    const tier = this.resolveTier(this.currentDrawdownPct);
    if (tier.haltNewEntries) {
      this.logThrottled('WARN', 'tier-halt',
        `⛔ Sermaye kademesi "${tier.label}" (DD %${this.currentDrawdownPct} ≥ %${tier.ddPct}): yeni pozisyon açılmıyor.`);
      return blocked('sermaye kademesi');
    }

    // Bu işlemin stop mesafesi — hem boyutlandırmanın paydası hem de
    // pozisyona yazılacak değer.
    const { stopPct, tpPct, stopSource } = this.resolveStopPct(currentPrice, atrValue, signalStopPct, signalTpPct);

    // Boyutu hangi tavanın belirlediği takip edilir. Beş ayrı tavan var ve
    // en darı kazanıyor; hangisinin bağladığını bilmeden ayar yapmak körlemedir.
    let boundBy = 'risk hedefi';
    const out = (amount, blockedBy = null) => ({
      amount: +Math.max(0, amount).toFixed(6),
      stopPct,
      tpPct,
      stopSource,
      boundBy: blockedBy || boundBy,
      blockedBy
    });

    if (!(stopPct > 0)) return blocked('stop mesafesi tanımsız');

    /**
     * KALDIRAÇ KAPISI — stop, likidasyondan DAHA YAKIN olmalı.
     *
     * Kaldıraçlı bir pozisyonda likidasyon, başlangıç marjı eksi bakım marjı
     * kadar bir fiyat hareketinde gelir: yaklaşık %(100/kaldıraç − bakım%).
     * Stop mesafesi bundan genişse stop hiçbir zaman çalışmaz — pozisyon önce
     * likide olur ve stratejinin risk mantığı devre dışı kalır. Kaldıraç
     * tavanı 100 kararı bu kapıyı zorunlu kılıyor: 100x'te likidasyon ~%0.5
     * uzakta, hemen her stratejinin stopu bundan geniştir.
     *
     * Motor bunu ENGEL olarak uygular, uyarı olarak değil: ölçümde "stop
     * çalıştı" diye raporlanan bir çıkış gerçekte likidasyon olurdu.
     */
    const kaldirac = Math.max(1, Number(context.leverage) || Number(this.config.leverage) || 1);
    if (kaldirac > 1) {
      const bakimPct = Number.isFinite(context.maintenanceMarginPct) ? context.maintenanceMarginPct : 0.5;
      const likidasyonMesafePct = (100 / kaldirac) - bakimPct;
      if (!(likidasyonMesafePct > 0)) {
        return blocked(`kaldıraç ${kaldirac}x: bakım marjı başlangıç marjını aşıyor`);
      }
      // %20 emniyet payı: likidasyon fiyatına değen bir stop pratikte geç kalır
      // (slipaj, funding ve bakım marjı kademesi mesafeyi daraltır).
      if (stopPct >= likidasyonMesafePct * 0.8) {
        this.logThrottled('WARN', 'kaldirac-stop',
          `⛔ Kaldıraç ${kaldirac}x ile stop mesafesi %${stopPct.toFixed(2)}, likidasyon ~%${likidasyonMesafePct.toFixed(2)} uzakta. `
          + `Stop çalışmadan likidasyon olurdu — giriş engellendi. Kaldıracı düşür ya da stop'u daralt.`);
        return blocked(`stop (%${stopPct.toFixed(2)}) likidasyondan (%${likidasyonMesafePct.toFixed(2)}) uzak`);
      }
    }

    this.decayLossStreak();
    const sizeMultiplier = this.antiMartingaleMultiplier() * tier.sizeMultiplier;
    const equity = this.lastEquity > 0 ? this.lastEquity : availableUSDT;

    // 1) Hedef boyut: işlem başına riske atılacak tutar / stop mesafesi.
    let maxUSDTToUse = Infinity;
    if (this.riskSizingEnabled) {
      const tradeRiskUSDT = equity * (this.riskPerTradePct / 100.0) * sizeMultiplier;
      maxUSDTToUse = tradeRiskUSDT / (stopPct / 100.0);
    } else {
      boundBy = 'nakit tavanı';
    }

    // Bir tavan mevcut sınırı daraltıyorsa bağlayıcı olan odur.
    const narrow = (candidate, name) => {
      if (candidate < maxUSDTToUse) {
        maxUSDTToUse = candidate;
        boundBy = name;
      }
    };

    // 2) Nakit yüzdesi tavanı. Risk bazlı boyutlandırma kapalıyken tek
    //    belirleyici budur — yani eski davranış korunur.
    const divisor = this.splitCashCapAcrossBots ? Math.max(1, activeSymbolsCount) : 1;
    const cashCapPct = ((this.config.maxPositionSizePct || 25.0) / divisor) * sizeMultiplier;
    narrow((availableUSDT * cashCapPct) / 100.0, 'nakit tavanı');

    // 3) Bot bazlı risk kotası: tek bot toplam bütçeyi yutmasın.
    if (this.exposureLimitsEnabled && botId && this.maxRiskPerBotPct > 0) {
      const botCap = equity * (this.maxRiskPerBotPct / 100.0);
      const botUsed = (this.openRisk && this.openRisk.byBot && this.openRisk.byBot[botId])
        ? this.openRisk.byBot[botId].riskUSDT : 0;
      const botRemaining = botCap - botUsed;

      if (botRemaining <= 0) {
        this.logThrottled('WARN', `bot-quota-${botId}`,
          `⛔ ${botId}: bot risk kotası dolu ($${botUsed.toFixed(2)} / $${botCap.toFixed(2)}, tavan %${this.maxRiskPerBotPct}).`);
        return out(0, 'bot risk kotası');
      }

      narrow(botRemaining / (stopPct / 100.0), 'bot risk kotası');
    }

    // 4) Açık risk tavanı: kalan risk bütçesi, bu pozisyonun stop'a kadar
    //    taşıyacağı kaybı karşılamıyorsa boyut bütçeye sığacak kadar kırpılır.
    if (this.openRiskLimitEnabled) {
      const budget = equity * (this.maxOpenRiskPct / 100.0);
      const used = (this.openRisk && this.openRisk.openRiskUSDT) || 0;
      const remaining = budget - used;

      if (remaining <= 0) {
        this.logThrottled('WARN', 'risk-budget-full',
          `⛔ Açık risk bütçesi dolu ($${used.toFixed(2)} / $${budget.toFixed(2)}, tavan %${this.maxOpenRiskPct}). Yeni pozisyon açılmıyor.`);
        return out(0, 'açık risk bütçesi');
      }

      const maxUSDTByRisk = remaining / (stopPct / 100.0);
      if (maxUSDTByRisk < maxUSDTToUse) {
        this.logThrottled('INFO', 'risk-budget-clamp',
          `📐 Pozisyon açık risk bütçesine göre kırpıldı: $${maxUSDTToUse.toFixed(2)} → $${maxUSDTByRisk.toFixed(2)} (kalan bütçe $${remaining.toFixed(2)}).`);
        narrow(maxUSDTByRisk, 'açık risk bütçesi');
      }
    }

    // 5) Maruziyet tavanları: sermayenin tek varlığa, tek korelasyon kümesine
    //    veya topluca yığılmasını engeller.
    if (symbol) {
      const headroom = this.exposureHeadroomUSDT(symbol);
      if (headroom !== null) {
        if (headroom <= 0) return out(0, 'maruziyet tavanı');
        if (headroom < maxUSDTToUse) {
          this.logThrottled('INFO', `exposure-clamp-${normSymbol(symbol)}`,
            `📐 ${symbol}: pozisyon maruziyet tavanına göre kırpıldı: $${maxUSDTToUse.toFixed(2)} → $${headroom.toFixed(2)}.`);
          narrow(headroom, 'maruziyet tavanı');
        }
      }
    }

    if (!Number.isFinite(maxUSDTToUse)) return out(0, 'tavan bulunamadı');

    // Kırpma sonrası toz kalan emirler açılmaz — komisyon dışında bir şey üretmezler.
    if (this.minOrderUSDT > 0 && maxUSDTToUse < this.minOrderUSDT) {
      this.logThrottled('WARN', 'min-order',
        `⛔ Hesaplanan pozisyon minimum emir tutarının altında ($${maxUSDTToUse.toFixed(2)} < $${this.minOrderUSDT}). Giriş yapılmadı.`);
      return out(0, 'minimum emir tutarı');
    }

    return out(maxUSDTToUse / currentPrice);
  }

  /**
   * Evaluates active positions against Stop-Loss, Take-Profit, Trailing Stop, and Breakeven
   */
  evaluatePositions(positions, currentPrice, atrValue = null) {
    const signals = [];
    if (this.killSwitchTriggered) {
      // Force exit all positions
      for (let pos of positions) {
        signals.push({
          action: 'SELL',
          reason: `KILL-SWITCH EMERGENCY EXIT (${this.killSwitchReason})`,
          position: pos
        });
      }
      return signals;
    }

    const trailingStop = this.config.trailingStop || false;
    const trailingStopPct = this.config.trailingStopPct || 1.5;

    for (let pos of positions) {
      const entryPrice = pos.entryPrice;
      const yon = RiskManager.yon(pos);
      const kisa = yon === -1;
      // Kâr yüzdesi yön duyarlı: short'ta fiyat DÜŞÜNCE kazanılır.
      const changePct = yon * ((currentPrice - entryPrice) / entryPrice) * 100.0;

      // Uç fiyat takibi: long'da zirve, short'ta dip.
      if (!pos.highestPrice || currentPrice > pos.highestPrice) {
        pos.highestPrice = currentPrice;
      }
      if (!pos.lowestPrice || currentPrice < pos.lowestPrice) {
        pos.lowestPrice = currentPrice;
      }

      pos.currentPrice = currentPrice;
      pos.pnlPct = +changePct.toFixed(2);
      pos.pnlUSDT = +(yon * (currentPrice - entryPrice) * pos.amount).toFixed(2);

      /**
       * LİKİDASYON UYARISI — vadeli pozisyonlarda motorun son savunması.
       *
       * Likidasyon borsada gerçekleşir, bot onu "engelleyemez"; ama fiyat
       * likidasyona yaklaşırken pozisyonu kapatmak elimizdedir. Eşiğe
       * gelindiğinde stop beklenmez: stop likidasyondan uzaktaysa zaten hiç
       * çalışmayacaktır (kaldıraç tavanı 100 kararının doğrudan sonucu).
       */
      if (Number.isFinite(pos.liqPrice) && pos.liqPrice > 0) {
        const liqMesafePct = Math.abs((currentPrice - pos.liqPrice) / currentPrice) * 100;
        const tehlikede = kisa ? currentPrice >= pos.liqPrice * 0.995 : currentPrice <= pos.liqPrice * 1.005;
        if (tehlikede) {
          signals.push({
            action: 'SELL',
            reason: `LİKİDASYON EŞİĞİ ($${Number(pos.liqPrice).toFixed(4)}, %${liqMesafePct.toFixed(2)} uzakta) — pozisyon kapatılıyor`,
            position: pos
          });
          continue;
        }
      }

      // Çıkış eşikleri pozisyonun kendi stop mesafesinden okunur: ATR bazlı
      // stop açıkken her varlık farklı bir mesafe taşır.
      const posStopPct = this.positionStopPct(pos);
      const posTakeProfitPct = this.positionTakeProfitPct(pos);

      // 1. Breakeven Check: Move stop-loss to entry price once profit >= 1.5 * stopLossPct
      if (!pos.isBreakeven && changePct >= (posStopPct * 1.5)) {
        pos.isBreakeven = true;
        db.addLog('INFO', `🛡️ Breakeven Protokolü Tetiklendi! Pozisyon risksizleştirildi (Stop -> $${entryPrice.toFixed(2)}).`);
      }

      const activeStopLossPct = pos.isBreakeven ? 0.0 : posStopPct;

      // 2. Take Profit Check
      if (changePct >= posTakeProfitPct) {
        signals.push({
          action: 'SELL',
          reason: `TAKE_PROFIT (+%${changePct.toFixed(2)} >= %${posTakeProfitPct.toFixed(2)})`,
          position: pos
        });
        continue;
      }

      // 2.5 Stratejinin takip eden stopu (`pos.strategyStop`).
      //
      // Yüzde tabanlı kontrollerden AYRI duruyor çünkü mutlak bir fiyat
      // seviyesi taşıyor: sigmoid TS gibi stoplar girişe göre değil, fiyatın
      // geçmişine göre hareket eder. `stopPriceFor` bunu zaten hesaba katıyor
      // ama çıkış kararı burada verildiği için kontrol de burada olmalı —
      // yoksa açık risk raporunda görünen stop ile gerçekten uygulanan stop
      // ayrışırdı (ölçüm ile motorun yapacağı çıkış ayrışırsa rakam süs olur).
      // Short'ta strateji stopu ÜSTTE: fiyat onu yukarı geçerse çıkılır.
      if (Number.isFinite(pos.strategyStop) && (kisa ? currentPrice >= pos.strategyStop : currentPrice <= pos.strategyStop)) {
        signals.push({
          action: 'SELL',
          reason: `STRATEJİ STOPU ($${Number(pos.strategyStop).toFixed(4)} · %${changePct.toFixed(2)})`,
          position: pos
        });
        continue;
      }

      // 3. Stop Loss Check
      if (changePct <= -activeStopLossPct) {
        signals.push({
          action: 'SELL',
          reason: pos.isBreakeven ? `BREAKEVEN STOP (%${changePct.toFixed(2)})` : `STOP_LOSS (%${changePct.toFixed(2)} <= -%${activeStopLossPct.toFixed(2)})`,
          position: pos
        });
        continue;
      }

      // 4. Trailing Stop Loss Check — long'da zirveden düşüş, short'ta dipten yükseliş.
      const ucFiyat = RiskManager.ucFiyat(pos);
      if (trailingStop && ucFiyat !== null) {
        const dropFromHighPct = (yon * (ucFiyat - currentPrice) / ucFiyat) * 100.0;
        if (dropFromHighPct >= trailingStopPct && changePct > 0) {
          signals.push({
            action: 'SELL',
            reason: `TRAILING_STOP (${kisa ? 'Dipten' : 'Zirveden'} %${dropFromHighPct.toFixed(2)} ${kisa ? 'yükseliş' : 'düşüş'})`,
            position: pos
          });
        }
      }
    }

    return signals;
  }

  resetKillSwitch() {
    this.killSwitchTriggered = false;
    this.killSwitchReason = '';
    this.consecutiveLosses = 0;
    this.cooldownUntil = 0;
    // Zirve olduğu yerde kalır: kademe, drawdown gerçekten toparlandıkça iner.
    this.tierIndex = 0;
    this.saveState();
    db.addLog('SUCCESS', '🔄 Kill-Switch ve Kayıp Serisi Sıfırlandı. Bot normal çalışmaya döndü.');
  }

  triggerManualCooldown(durationMs = 30000) {
    this.cooldownUntil = Date.now() + durationMs;
    this.saveState();
  }

  getStatus() {
    const tier = this.tiers[this.tierIndex] || this.tiers[0];
    const nextTier = this.tiers[this.tierIndex + 1] || null;

    return {
      peakCapital: this.peakCapital ? +this.peakCapital.toFixed(2) : 0,
      equity: +(this.lastEquity || 0).toFixed(2),
      drawdownPct: this.currentDrawdownPct,
      maxDrawdownPct: this.maxDrawdownPct,
      openRisk: this.openRisk,
      daily: this.getDailyStatus(),
      maxOpenRiskPct: this.maxOpenRiskPct,
      openRiskLimitEnabled: this.openRiskLimitEnabled,
      exposureLimitsEnabled: this.exposureLimitsEnabled,
      maxConcurrentPositions: this.maxConcurrentPositions,
      maxSymbolExposurePct: this.maxSymbolExposurePct,
      maxClusterExposurePct: this.maxClusterExposurePct,
      maxGrossExposurePct: this.maxGrossExposurePct,
      maxRiskPerBotPct: this.maxRiskPerBotPct,
      clusters: this.clusters,
      riskSizingEnabled: this.riskSizingEnabled,
      riskPerTradePct: this.riskPerTradePct,
      splitCashCapAcrossBots: this.splitCashCapAcrossBots,
      atrStopEnabled: this.atrStopEnabled,
      atrPeriod: this.atrPeriod,
      atrTimeframe: this.atrTimeframe,
      atrStopMultiplier: this.atrStopMultiplier,
      atrStopMinPct: this.atrStopMinPct,
      atrStopMaxPct: this.atrStopMaxPct,
      takeProfitRR: this.takeProfitRR,
      strategyStopPrecedence: this.strategyStopPrecedence,
      minOrderUSDT: this.minOrderUSDT,
      equityTiersEnabled: this.equityTiersEnabled,
      riskTier: {
        index: tier.index,
        label: tier.label,
        ddPct: tier.ddPct,
        sizeMultiplier: tier.sizeMultiplier,
        haltNewEntries: tier.haltNewEntries,
        nextLabel: nextTier ? nextTier.label : null,
        nextDdPct: nextTier ? nextTier.ddPct : this.maxDrawdownPct,
        totalTiers: this.tiers.length
      },
      riskTiers: this.tiers,
      consecutiveLosses: this.consecutiveLosses,
      maxLossStreak: this.maxLossStreak,
      antiMartingaleEnabled: this.antiMartingaleEnabled,
      antiMartingaleStep: this.antiMartingaleStep,
      antiMartingaleFloor: this.antiMartingaleFloor,
      antiMartingaleMultiplier: +this.antiMartingaleMultiplier().toFixed(3),
      lossStreakResetMode: this.lossStreakResetMode,
      lossStreakDecayMinutes: this.lossStreakDecayMinutes,
      cooldownEnabled: this.cooldownEnabled,
      cooldownMinutes: this.config.cooldownMinutes || 15,
      cooldownActive: this.cooldownEnabled && Date.now() < this.cooldownUntil,
      cooldownRemainingSec: Math.max(0, Math.ceil((this.cooldownUntil - Date.now()) / 1000)),
      killSwitchTriggered: this.killSwitchTriggered,
      killSwitchReason: this.killSwitchReason
    };
  }
}

module.exports = RiskManager;
