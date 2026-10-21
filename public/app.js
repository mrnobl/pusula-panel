// Must match APP_VERSION in server.js. If the browser is serving a cached
// app.js against a newer server, the mismatch is surfaced instead of silently
// running outdated UI logic.
const APP_VERSION = '69.9';

// Global State
let ws = null;
let tvChart = null;
let candlestickSeries = null;
let volumeSeries = null;
let currentConfig = {};
let isBotRunning = false;
let lastOptimizationResults = [];
let lastOptimizationStrategy = null;
let lastWatchlistResults = [];
let currentInspectedConfig = {};
let currentInspectedStrategyKey = null;
let lastStats = null;
let lastState = null;
// Selection the multi-bot checkboxes were last rendered with, so a background
// refresh can tell "server changed" apart from "user is mid-edit".
let multiSymbolRenderedState = null;

/**
 * Açık bölüm (Pusula P1: menü yolu → bölüm, `ag:rota` olayı). TICK her 5 sn'de gelir; gizli sekmelerin tablolarını her seferinde
 * baştan kurmak boşa işti (Portföy, yan pozisyon tablosu, Risk tabloları…).
 * Görünmeyen bölüm çizilmez; sekme açılınca son veriden hemen çizilir.
 */
let aktifSekme = null;   // açık bölümün kimliği (section#…) — AG.rota (js/core/rota.js) belirler
const sekmeAcik = (id) => aktifSekme === id;

/**
 * Kullanıcının elle değiştirdiği, henüz kaydetmediği formlar. Her `/api/config`
 * yazımı CONFIG_UPDATED yayınlıyor; eskiden bu, başka bir yerdeki kayıt (gösterge
 * listesi, başka sekme) yüzünden yazılmakta olan formu sessizce geri alıyordu.
 */
const kirliFormlar = new Set();
['input', 'change'].forEach(tur => document.addEventListener(tur, (e) => {
  const f = e.target && e.target.closest && e.target.closest('form[id]');
  if (f && f.id !== 'formBacktest') kirliFormlar.add(f.id);
}));

// Live chart state: which series is loaded and where the newest bar starts
let chartSymbol = null;
let chartTimeframe = null;
let chartLastBar = null;
let chartLoading = false;
let chartBarCount = 1000;
let chartFailedKey = null;
let chartFailedAt = 0;
let chartTrades = [];
let chartMarkersApi = null;
let chartPriceLines = [];
let chartLinesSignature = null;
let chartTradeSeq = -1;

// --- Gösterge katmanı ------------------------------------------------------
// İki grafik, tek çizim modülü. Spec listeleri config'te kalıcıdır
// (`config.indicators.charts.*`), böylece panel yenilenince kaybolmazlar.
let liveIndicatorLayer = null;
let btIndicatorLayer = null;
let liveIndicatorSpecs = [];
let btIndicatorSpecs = [];
let indicatorSaveTimer = null;
// Backtest grafiğinin hangi seri üzerinde çizildiği — göstergeler AYNI
// sembol/zaman dilimi/uzunlukla hesaplanmalı, yoksa barlar kayar.
let btChartContext = null;

const TIMEFRAME_SECONDS = {
  '1m': 60,
  '5m': 5 * 60,
  '15m': 15 * 60,
  '30m': 30 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60
};

/**
 * Renk → ton sınıfı. JS eskiden `el.style.color = 'var(--accent-success)'`
 * yazıyordu (30'dan fazla yerde); inline renk temayla değişse de sınıfı
 * ezer ve aynı anlam her yerde yeniden yazılırdı. `AG.fmt.renkTonu` bilinen
 * rengi `.tone-*` sınıfına çevirir; önceki ton sınıfı silinir ki "bir kez
 * kırmızı oldu, hep kırmızı kaldı" olmasın. Tanınmayan renk (ör. gösterge
 * serisinin kendi rengi) olduğu gibi yazılır.
 */
const TON_SINIFLARI = ['tone-muted', 'tone-main', 'tone-strong', 'tone-primary', 'tone-cyan', 'tone-success', 'tone-warning', 'tone-danger'];
function tonla(el, renk) {
  if (!el) return;
  el.classList.remove(...TON_SINIFLARI);
  const ton = AG.fmt.renkTonu(renk);
  if (ton) {
    el.classList.add(ton);
    el.style.removeProperty('color');
  } else if (renk) {
    el.style.color = renk;
  }
}

/**
 * Borsanın GERÇEK modu. Sunucu `state.exchangeMode` ('paper' | 'testnet' |
 * 'live') gönderir — borsa katmanının zorladığı mod. `state.mode` config'teki
 * İSTEKTİR ve borsa onu reddetmiş olabilir; rozet yanlış güven vermesin diye
 * yalnızca alan yoksa ona düşülür.
 */
function borsaModu(state) {
  const m = String((state && (state.exchangeMode || state.mode)) || 'paper').toLowerCase();
  return m === 'live' || m === 'testnet' ? m : 'paper';
}

function modRozeti(el, mod) {
  if (!el) return;
  // Sade dil (PLAN-PANEL-PUSULA §2): "PAPER" → "kâğıt".
  el.textContent = mod === 'live' ? 'CANLI' : mod === 'testnet' ? 'TESTNET' : 'kâğıt';
  el.classList.toggle('mode-live', mod === 'live');
  el.classList.toggle('mode-testnet', mod === 'testnet');
  el.title = mod === 'live' ? 'CANLI HESAP — Binance canlı hesapta işlem'
    : (mod === 'testnet' ? 'Testnet — borsanın deneme ağı' : 'Kâğıt işlem — sanal bakiye');
}

/** Bakiye verisi geldi mi? Gelmediyse sayılar "—" kalır, uydurulmaz. */
function bakiyeVar(state) {
  return !!(state && state.balances && state.balances.balances
    && Number.isFinite(Number(state.balances.balances.USDT)));
}

/**
 * GRAFİK RENKLERİ — temadan okunur.
 *
 * Tuval (Chart.js, lightweight-charts) CSS değişkeni çözemez; renk dize
 * olarak verilmek zorunda. Eskiden 50'ye yakın sabit hex vardı ve açık
 * temada grafikler koyu kalırdı. `AN_COLORS.x` her ERİŞİMDE o anki temanın
 * değerini döndürür (getter); tema değişince `ag:tema` olayı grafikleri
 * yeniden boyar (`grafikleriTemayaUydur`).
 *
 * `AN_TON` ise HTML/tablo içindir: CSS değişkeni olarak kalır, `renkTonu`
 * onu `.tone-*` sınıfına çevirir ve tema değişince kendiliğinden uyar.
 */
const temaRengi = (token, yedek) => (window.AG && AG.tema ? AG.tema.renk(token, yedek) : yedek);
const saydam = (renk, a) => (window.AG && AG.tema ? AG.tema.alfa(renk, a) : renk);
const AN_COLORS = {
  get primary() { return temaRengi('--accent', '#4d7cfe'); },
  get success() { return temaRengi('--pos', '#0ecb81'); },
  get danger() { return temaRengi('--neg', '#f6465d'); },
  get warning() { return temaRengi('--warn', '#f0b90b'); },
  get cyan() { return temaRengi('--info', '#3aa6f0'); },
  get muted() { return temaRengi('--chart-text', '#8a94a3'); },
  get grid() { return temaRengi('--chart-grid', 'rgba(255,255,255,0.05)'); },
  get bg() { return temaRengi('--chart-bg', '#10141b'); },
  get border() { return temaRengi('--border', '#232a36'); },
  get strong() { return temaRengi('--text-strong', '#f3f5f9'); },
  get soft() { return temaRengi('--text-soft', '#a9b2bf'); },
  get surface() { return temaRengi('--surface-1', '#12161e'); }
};
const AN_TON = {
  primary: 'var(--accent-primary)',
  success: 'var(--accent-success)',
  danger: 'var(--accent-danger)',
  warning: 'var(--accent-warning)',
  cyan: 'var(--accent-cyan)',
  muted: 'var(--text-muted)'
};

/** lightweight-charts ortak görünümü — iki mum grafiği de bunu kullanır. */
function lwTema() {
  return {
    layout: { background: { color: AN_COLORS.bg }, textColor: AN_COLORS.muted },
    grid: { vertLines: { color: AN_COLORS.grid }, horzLines: { color: AN_COLORS.grid } },
    rightPriceScale: { borderColor: AN_COLORS.border },
    timeScale: { borderColor: AN_COLORS.border }
  };
}

function mumRenkleri() {
  return {
    upColor: AN_COLORS.success,
    downColor: AN_COLORS.danger,
    wickUpColor: AN_COLORS.success,
    wickDownColor: AN_COLORS.danger
  };
}

function timeframeSeconds(tf) {
  return TIMEFRAME_SECONDS[tf] || 60 * 60;
}

// Start of the candle bucket a timestamp falls into — this is what makes the
// live bar line up with the historical bars instead of drifting every tick.
function bucketStart(epochSeconds, tf) {
  const size = timeframeSeconds(tf);
  return Math.floor(epochSeconds / size) * size;
}

/**
 * CANLI GRAFİK KÖPRÜSÜ — portföy botu işlem paneli (js/pages/bindirmeIslem.js) ana canlı grafiğe
 * buradan erişir: işaret/çizgi çizer, tablodaki satıra tıklanınca sembole geçip mumuna odaklanır.
 */
AG.canliGrafik = {
  sembol: () => chartSymbol,
  dilim: () => chartTimeframe,
  seri: () => candlestickSeries,
  grafik: () => tvChart,
  bucketStart,
  isaretleriCiz: () => renderChartTradeMarkers(),
  /** Grafiği `sembol`e geçirir (gerekirse seçiciye ekler); `zamanMs` verilirse o mumun çevresine odaklanır. */
  async git(sembol, zamanMs) {
    const sel = document.getElementById('chartSymbolSelect');
    if (sel && sembol && sel.value !== sembol) {
      if (![...sel.options].some(o => o.value === sembol)) sel.appendChild(AG.dom.el('option', { value: sembol, text: sembol }));
      sel.value = sembol;
    }
    if (sembol && sembol !== chartSymbol) await loadChartHistory(sembol, chartTimeframe || (document.getElementById('chartTimeframeSelect') || {}).value || '1h', chartBarCount);
    if (!tvChart) return;
    if (zamanMs) {
      const tf = timeframeSeconds(chartTimeframe || '1h');
      const t = bucketStart(Math.floor(zamanMs / 1000), chartTimeframe || '1h');
      try { tvChart.timeScale().setVisibleRange({ from: t - 60 * tf, to: t + 20 * tf }); } catch (e) { /* mum aralık dışında */ }
    } else {
      try { tvChart.timeScale().scrollToRealTime(); } catch (e) { /* yok */ }
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initTabNavigation();
  initDockNavigation();
  initStratejiSekmesi();
  initTradingViewChart();
  connectWebSocket();
  // Watchlist selector needs currentConfig.activeSymbols, so load config first.
  fetchInitialData().then(fetchWatchlistUI);
  bindFormEvents();
  initAnalyticsTabs();
  initAnalyticsPriceControls();
});

// ---------------------------------------------------------------------------
// Gösterge katmanı
// ---------------------------------------------------------------------------

/**
 * Katalog yüklenir, kayıtlı gösterge listeleri config'ten okunur ve iki
 * grafiğin paneli kurulur.
 *
 * Config'te tutulmasının sebebi: grafik ayarı bir tercih değil, ölçüm
 * kurulumudur. "Backtestte hangi göstergelerle baktım" sorusunun cevabı
 * tarayıcı sekmesi kapanınca kaybolmamalı.
 */
async function initIndicators(cfg) {
  if (!window.IndicatorUI || !window.ChartIndicators) return;

  try {
    await IndicatorUI.loadCatalog();
  } catch (err) {
    console.warn('Gösterge kataloğu yüklenemedi:', err.message);
    return;
  }

  const kayitli = (cfg && cfg.indicators && cfg.indicators.charts) || {};
  liveIndicatorSpecs = Array.isArray(kayitli.live) ? JSON.parse(JSON.stringify(kayitli.live)) : [];
  btIndicatorSpecs = Array.isArray(kayitli.backtest) ? JSON.parse(JSON.stringify(kayitli.backtest)) : [];

  if (tvChart && candlestickSeries && !liveIndicatorLayer) {
    liveIndicatorLayer = ChartIndicators.create(tvChart, candlestickSeries, {});
    // Katman kurulduktan sonra işlem okları onun üzerinden basılmalı.
    renderChartTradeMarkers();
  }

  bindIndicatorPanel('live');
  bindIndicatorPanel('bt');
  refreshLiveIndicators();
}

function bindIndicatorPanel(which) {
  const btnId = which === 'live' ? 'btnLiveIndicators' : 'btnBtIndicators';
  const panelId = which === 'live' ? 'liveIndicatorPanel' : 'btIndicatorPanel';
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  if (!btn || !panel || btn.dataset.bound === '1') return;

  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    /**
     * Görünürlük SINIFLA yönetilir, `style.display` ile değil (P3).
     *
     * Panelin başlangıç durumu artık `.is-hidden` sınıfı. `style.display`
     * yazmak inline bir değer bırakır ve sınıfla inline birbirini ezmeye
     * başlar; hangisinin kazandığı yazma sırasına bağlı kalırdı.
     */
    const acik = !panel.classList.contains('is-hidden');
    panel.classList.toggle('is-hidden', acik);
    if (acik) return;

    const specs = which === 'live' ? liveIndicatorSpecs : btIndicatorSpecs;
    IndicatorUI.mountEditor(panel, specs, () => {
      saveIndicatorSpecs();
      if (which === 'live') refreshLiveIndicators();
      else refreshBtIndicators();
    });
  });
}

/** Değişiklikler toplanıp tek yazımda kaydedilir; her tuşta POST atılmaz. */
function saveIndicatorSpecs() {
  if (indicatorSaveTimer) clearTimeout(indicatorSaveTimer);
  indicatorSaveTimer = setTimeout(async () => {
    indicatorSaveTimer = null;
    try {
      const data = await AG.api.ayarYaz({
        indicators: { charts: { live: liveIndicatorSpecs, backtest: btIndicatorSpecs } }
      });
      if (data.success) currentConfig = data.config;
    } catch (err) {
      console.warn('Gösterge ayarları kaydedilemedi:', err.message);
    }
  }, 800);
}

/**
 * Göstergeleri sunucudan hesaplatıp çizer.
 *
 * Mumlar ve seriler TEK yanıtta gelir: ayrı çekilseler, arada yeni bir bar
 * kapandığında grafik bir bara, gösterge başka bara otururdu.
 */
async function computeAndRender(layer, specs, ctx, statusEl) {
  if (!layer) return;
  if (!specs.length) { layer.render([], { candles: [], results: {} }, IndicatorUI.getCatalog()); if (statusEl) statusEl.textContent = ''; return; }
  if (!ctx || !ctx.symbol || !ctx.timeframe) return;

  if (statusEl) statusEl.textContent = 'gösterge hesaplanıyor…';
  try {
    const data = await AG.api.gostergeHesapla({
      symbol: ctx.symbol,
      timeframe: ctx.timeframe,
      limit: ctx.limit || 500,
      specs: specs.map(s => ({ id: s.id, key: s.key, params: s.params }))
    });
    if (!data.success) {
      if (statusEl) statusEl.textContent = `hesap başarısız: ${data.error}`;
      return;
    }

    layer.render(specs, data, IndicatorUI.getCatalog());

    const hatalar = layer.errors(data);
    if (statusEl) {
      // Ne çizildiği ve NEREYE çizildiği yazılı olsun: "çizgi fiyatı takip
      // etmiyor" tipi bir sorunda ilk bakılacak yer bu satır.
      const efsane = layer.legend();
      const fiyatPaneli = efsane.filter(l => l.pane === 'price').length;
      const altPanel = efsane.filter(l => l.pane === 'own').length;

      statusEl.textContent = hatalar.length
        ? `${hatalar.length} gösterge hata verdi: ${hatalar.map(h => h.id).join(', ')}`
        : `${specs.length} gösterge · ${data.count} mum · ${fiyatPaneli} çizgi fiyat panelinde`
          + (altPanel ? `, ${altPanel} çizgi ALT ŞERİTTE (${efsane.filter(l => l.pane === 'own').map(l => l.label.split('·').pop().trim()).join(', ')})` : '');
      tonla(statusEl, hatalar.length ? 'var(--accent-warning)' : 'var(--text-muted)');
      statusEl.title = efsane.map(l => `${l.label} — ${l.pane === 'price' ? 'fiyat paneli' : 'alt şerit'}`).join('\n');
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = `hesap başarısız: ${err.message}`;
  }
}

function refreshLiveIndicators() {
  computeAndRender(
    liveIndicatorLayer,
    liveIndicatorSpecs,
    { symbol: chartSymbol, timeframe: chartTimeframe, limit: chartBarCount },
    document.getElementById('liveIndicatorStatus')
  );
}

function refreshBtIndicators() {
  computeAndRender(
    btIndicatorLayer,
    btIndicatorSpecs,
    btChartContext,
    document.getElementById('btIndicatorStatus')
  );
}

// --- Gezinme (Pusula P1) ---------------------------------------------------
/**
 * Menü ve URL `AG.rota`'da (js/core/rota.js): hash değişince bölümü görünür
 * yapar ve `ag:rota` gönderir; burada yalnız o bölümün çizimi tetiklenir.
 * Eski sekme kimlikleri (`data-goto-tab="tab-risk"`, `sekmeyeGec('tab-backtest')`)
 * rota tarafından yeni yollara çevrilir.
 */
function initTabNavigation() {
  document.addEventListener('ag:rota', (e) => sekmeyiAc(e.detail && e.detail.bolum));

  // Başka ekrana götüren öğeler ("Risk durumu" kartı gibi).
  document.addEventListener('click', (e) => {
    const hedef = e.target.closest && e.target.closest('[data-goto-tab]');
    if (hedef) sekmeyeGec(hedef.getAttribute('data-goto-tab'));
  });

  AG.rota.baslat();
}

function sekmeyiAc(id) {
  if (!id || !document.getElementById(id)) return;
  aktifSekme = id;

  // Gizliyken çizilmeyen bölüm son veriden hemen çizilir; sonraki tick beklenmez.
  if (lastState) updateDashboardState(lastState);
  if (id === 'tab-risk') loadDrawdownStats();
  if (id === 'tab-strategy') stratejileriCiz();
  if (id === 'tab-botlar' && AG.pages.botlar) AG.pages.botlar.yukle(true);
  if (id === 'tab-botlar' && AG.pages.bindirmeIslem) AG.pages.bindirmeIslem.goster(true);
  if (id === 'tab-ileri' && AG.pages.ileri) AG.pages.ileri.yukle(false);
  // Kâğıt test hesabı ayrıntılarında varsayılan sekme "Bakiye geçmişi": ekran açılınca doldurulur.
  if (id === 'tab-kagit') fetchDockBalanceHistory();
  // Gizli kapta boyutlanan grafikler (genişlik 0) görünür olunca yeniden ölçülsün.
  window.dispatchEvent(new Event('resize'));
}

/**
 * Programla ekran değişimi: yol (`arastirma/backtest`) ya da eski sekme
 * kimliği (`tab-backtest`). Hash değişir → tarayıcı geçmişine girer (geri tuşu).
 */
function sekmeyeGec(id) {
  AG.rota.git(id);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Initialize TradingView Lightweight Charts
function initTradingViewChart() {
  const container = document.getElementById('tvChartContainer');
  if (!container || !window.LightweightCharts) return;

  try {
    tvChart = LightweightCharts.createChart(container, {
      // Without an explicit size the chart renders at its 400x300 default
      // instead of filling the panel.
      width: container.clientWidth,
      height: container.clientHeight,
      // Denetim A-35: eksen ve imleç fiyatları Türkçe biçimde ("88.000,00"; "88000.00" değil).
      localization: {
        locale: 'tr-TR',
        priceFormatter: (p) => (Number.isFinite(p) ? p.toLocaleString('tr-TR', Math.abs(p) >= 100
          ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumSignificantDigits: 6 }) : '')
      },
      layout: lwTema().layout,
      grid: lwTema().grid,
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: AN_COLORS.border,
        scaleMargins: { top: 0.08, bottom: 0.26 },
      },
      timeScale: {
        borderColor: AN_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const seriesOptions = {
      ...mumRenkleri(),
      borderVisible: false,
    };

    // Lightweight Charts v5 replaced addCandlestickSeries() with addSeries().
    if (typeof tvChart.addCandlestickSeries === 'function') {
      candlestickSeries = tvChart.addCandlestickSeries(seriesOptions);
    } else if (LightweightCharts.CandlestickSeries) {
      candlestickSeries = tvChart.addSeries(LightweightCharts.CandlestickSeries, seriesOptions);
    } else {
      candlestickSeries = tvChart.addLineSeries({ color: AN_COLORS.primary, lineWidth: 2 });
    }

    const volumeOptions = {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume'
    };

    try {
      if (typeof tvChart.addHistogramSeries === 'function') {
        volumeSeries = tvChart.addHistogramSeries(volumeOptions);
      } else if (LightweightCharts.HistogramSeries) {
        volumeSeries = tvChart.addSeries(LightweightCharts.HistogramSeries, volumeOptions);
      }
      if (volumeSeries) {
        tvChart.priceScale('volume').applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 }
        });
      }
    } catch (volErr) {
      // Volume is a nice-to-have; never let it take the price chart down.
      console.warn('Hacim serisi oluşturulamadı:', volErr.message);
      volumeSeries = null;
    }

    window.addEventListener('resize', () => {
      if (tvChart && container) {
        tvChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
      }
    });
  } catch (err) {
    console.error('TradingView Chart Init Error:', err);
  }
}

/**
 * Loads real OHLCV history for a symbol/timeframe, exactly like a TradingView
 * chart does, instead of synthesising bars from the ticker.
 */
async function loadChartHistory(symbol, timeframe, limit = 300) {
  if (!candlestickSeries || !symbol || !timeframe) return;
  if (chartLoading) return;

  // Back off after a failure so a broken symbol doesn't hammer the API on every tick.
  const key = `${symbol}|${timeframe}`;
  if (chartFailedKey === key && Date.now() - chartFailedAt < 15000) return;

  chartLoading = true;
  setChartStatus(`${symbol} · ${timeframe} yükleniyor...`);

  try {
    // JSON olmayan gövde (uç yok, sunucu eski sürüm) `AG.api` tarafında
    // anlaşılır bir istisnaya çevriliyor; aşağıdaki `catch` onu yakalar.
    const data = await AG.api.mumlar(symbol, timeframe, limit);

    if (!data.success || !Array.isArray(data.candles) || data.candles.length === 0) {
      chartFailedKey = key;
      chartFailedAt = Date.now();
      setChartStatus(data.error || 'Mum verisi alınamadı', true);
      return;
    }
    chartFailedKey = null;

    const bars = data.candles
      .map(c => ({
        time: Math.floor(c.time / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0
      }))
      .filter(b => Number.isFinite(b.time) && Number.isFinite(b.close))
      .sort((a, b) => a.time - b.time);

    candlestickSeries.setData(bars.map(({ volume, ...bar }) => bar));

    if (volumeSeries) {
      volumeSeries.setData(bars.map(b => ({
        time: b.time,
        value: b.volume,
        color: b.close >= b.open ? saydam(AN_COLORS.success, 0.5) : saydam(AN_COLORS.danger, 0.5)
      })));
    }

    chartSymbol = symbol;
    chartTimeframe = timeframe;
    chartLastBar = bars[bars.length - 1] || null;

    if (tvChart) tvChart.timeScale().fitContent();
    setChartStatus(`${symbol} · ${timeframe} · ${bars.length} mum`);

    // Switching symbol/timeframe invalidates both overlays.
    clearChartPriceLines();
    chartLinesSignature = null;
    await loadChartTrades(symbol);
    if (AG.pages.bindirmeIslem) AG.pages.bindirmeIslem.grafikDegisti();
    // Göstergeler yeni seriye göre yeniden hesaplanmalı — eski sembolün
    // serilerini yeni mumların üzerine bırakmak sessiz bir yanlış olurdu.
    refreshLiveIndicators();
  } catch (err) {
    chartFailedKey = key;
    chartFailedAt = Date.now();
    setChartStatus('Grafik yüklenemedi: ' + err.message, true);
  } finally {
    chartLoading = false;
  }
}

/**
 * Past fills for the charted symbol, drawn as buy/sell arrows. Shown whether or
 * not a bot is currently running on the symbol — history is history.
 */
async function loadChartTrades(symbol) {
  if (!candlestickSeries || !symbol) return;

  try {
    chartTrades = await AG.api.islemler(symbol, 300);
    renderChartTradeMarkers();
  } catch (err) {
    console.warn('İşlem geçmişi alınamadı:', err.message);
  }
}

function renderChartTradeMarkers() {
  if (!candlestickSeries || !chartTimeframe) return;

  const markers = (chartTrades || [])
    .map(t => {
      const ts = Date.parse(t.timestamp);
      if (!Number.isFinite(ts)) return null;

      const isBuy = String(t.type || '').toUpperCase().startsWith('BUY');
      const pnl = t.profitUSDT || 0;
      const price = Number(t.price) || 0;

      // Snap to the candle the fill belongs to so arrows sit on real bars.
      return {
        time: bucketStart(Math.floor(ts / 1000), chartTimeframe),
        position: isBuy ? 'belowBar' : 'aboveBar',
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        color: isBuy ? AN_COLORS.success : (pnl >= 0 ? AN_COLORS.cyan : AN_COLORS.danger),
        text: isBuy
          ? `AL ${price.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`
          : `SAT ${price.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}${pnl ? ` (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}$)` : ''}`
      };
    })
    .filter(Boolean);
  // Portföy botunun (Hücum/Denge) bu semboldeki işlemleri — js/pages/bindirmeIslem.js
  if (AG.pages.bindirmeIslem && typeof AG.pages.bindirmeIslem.grafikIsaretleri === 'function') {
    try { markers.push(...AG.pages.bindirmeIslem.grafikIsaretleri(chartSymbol, chartTimeframe, bucketStart)); } catch (e) { /* işaret yok */ }
  }
  markers.sort((a, b) => a.time - b.time);

  // Gösterge katmanı varsa işaretçiler ONUN üzerinden basılır: `setMarkers`
  // diziyi tamamen değiştirdiği için, iki taraf ayrı ayrı çağırırsa biri
  // diğerinin işaretlerini siler (işlem okları gösterge olaylarını yutardı).
  if (liveIndicatorLayer) {
    liveIndicatorLayer.setBaseMarkers(markers);
    return;
  }

  try {
    // v5 moved markers off the series onto a primitive.
    if (typeof candlestickSeries.setMarkers === 'function') {
      candlestickSeries.setMarkers(markers);
    } else if (typeof LightweightCharts.createSeriesMarkers === 'function') {
      if (chartMarkersApi) chartMarkersApi.setMarkers(markers);
      else chartMarkersApi = LightweightCharts.createSeriesMarkers(candlestickSeries, markers);
    }
  } catch (err) {
    console.warn('İşlem işaretleri çizilemedi:', err.message);
  }
}

function clearChartPriceLines() {
  chartPriceLines.forEach(line => {
    try { candlestickSeries.removePriceLine(line); } catch (e) { /* already gone */ }
  });
  chartPriceLines = [];
}

/**
 * Entry / take-profit / stop-loss levels for an open position, but only when a
 * bot is actually running on the charted symbol — a stopped bot's levels are
 * not being enforced, so drawing them would be misleading.
 */
function renderChartPositionLines(state) {
  if (!candlestickSeries || !chartSymbol) return;

  const activeSymbols = state.activeSymbols || [];
  const positions = (state.balances && state.balances.positions) ? state.balances.positions : [];
  const clean = chartSymbol.replace('/', '').toUpperCase();
  const pos = activeSymbols.includes(chartSymbol)
    ? positions.find(p => p.symbol.replace('/', '').toUpperCase() === clean)
    : null;

  const sig = state.symbolSignals ? state.symbolSignals[chartSymbol] : null;
  const botName = (sig && sig.strategyName) || state.strategyName || 'Bot';

  // Redrawing four price lines every tick is wasteful; only rebuild on change.
  const signature = pos
    ? `${chartSymbol}|${botName}|${pos.entryPrice}|${pos.slLevel || ''}|${pos.tp1Level || ''}|${pos.tp2Level || ''}|${pos.isBreakeven ? 1 : 0}`
    : `${chartSymbol}|none`;

  if (signature === chartLinesSignature) return;
  chartLinesSignature = signature;

  clearChartPriceLines();
  if (!pos || !pos.entryPrice) return;

  const risk = currentConfig.risk || {};
  const slPct = risk.stopLossPct !== undefined ? risk.stopLossPct : 2.0;
  const tpPct = risk.takeProfitPct !== undefined ? risk.takeProfitPct : 4.0;

  const entry = pos.entryPrice;
  // Strategy-supplied levels win; otherwise show what the risk engine enforces.
  const slLevel = pos.slLevel || (pos.isBreakeven ? entry : entry * (1 - slPct / 100));
  const tpLevel = pos.tp1Level || (entry * (1 + tpPct / 100));

  const styles = (window.LightweightCharts && LightweightCharts.LineStyle) || {};
  const addLine = (price, color, title, lineStyle) => {
    if (!Number.isFinite(price) || price <= 0) return;
    try {
      chartPriceLines.push(candlestickSeries.createPriceLine({
        price,
        color,
        lineWidth: 2,
        lineStyle: lineStyle !== undefined ? lineStyle : 0,
        axisLabelVisible: true,
        title
      }));
    } catch (err) {
      console.warn('Seviye çizgisi eklenemedi:', err.message);
    }
  };

  addLine(entry, AN_COLORS.cyan, `${botName} · Giriş`, styles.Solid);
  addLine(tpLevel, AN_COLORS.success, `TP ${pos.tp1Level ? '(strateji)' : `%${tpPct}`}`, styles.Dashed);
  addLine(slLevel, AN_COLORS.danger, pos.isBreakeven ? 'SL (Breakeven)' : `SL %${slPct}`, styles.Dashed);
  if (pos.tp2Level) addLine(pos.tp2Level, AN_COLORS.cyan, 'TP2 (strateji)', styles.Dotted);
}

/**
 * Grafik başlığındaki bot satırı (#chartBotInfo / #chartNoBotInfo) eski kâğıt test motorunun botlarına aitti; Hücum / Denge için
 * "bu varlıkta çalışan bot yok" diye yanlış konuşuyordu (denetim 1 §3.4). Yeni panel F5: ikisi de her zaman gizli — botun ne
 * yaptığı grafiğin altındaki işaret satırında (#botIsaretBilgi, js/pages/bindirmeIslem.js).
 */
function updateChartBotHeader() {
  for (const id of ['chartBotInfo', 'chartNoBotInfo']) document.getElementById(id)?.classList.add('is-hidden');
}

function setChartStatus(text, isError = false) {
  const el = document.getElementById('txtChartStatus');
  if (!el) return;
  el.textContent = text;
  tonla(el, isError ? 'var(--accent-danger)' : 'var(--text-muted)');
}

/**
 * Folds the live ticker price into the current candle bucket: updates the open
 * bar while the period is running, and opens a new bar when it rolls over.
 */
function updateLiveChartBar(price) {
  if (!candlestickSeries || !chartTimeframe || !Number.isFinite(price)) return;

  const nowBucket = bucketStart(Math.floor(Date.now() / 1000), chartTimeframe);

  if (!chartLastBar || nowBucket > chartLastBar.time) {
    chartLastBar = {
      time: nowBucket,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0
    };
  } else if (nowBucket === chartLastBar.time) {
    chartLastBar.high = Math.max(chartLastBar.high, price);
    chartLastBar.low = Math.min(chartLastBar.low, price);
    chartLastBar.close = price;
  } else {
    // Ticker is older than the newest loaded bar — nothing to update.
    return;
  }

  const { volume, ...bar } = chartLastBar;
  candlestickSeries.update(bar);
}

/**
 * Tema değişti (`ag:tema`, js/core/tema.js): tuvaller CSS'i izlemez,
 * renkleri elle yenilenir. Mum grafikleri yerinde boyanır; Chart.js
 * analiz grafikleri son veriden yeniden çizilir (veri yeniden İSTENMEZ).
 */
function grafikleriTemayaUydur() {
  const lw = lwTema();
  [tvChart, anPriceChart].forEach(c => { if (c) { try { c.applyOptions(lw); } catch (e) { /* yok */ } } });
  [candlestickSeries, anPriceSeries].forEach(sr => {
    if (sr && typeof sr.applyOptions === 'function') { try { sr.applyOptions(mumRenkleri()); } catch (e) { /* yok */ } }
  });
  if (lastState) { chartLinesSignature = null; renderChartPositionLines(lastState); }
  if (typeof renderChartTradeMarkers === 'function') renderChartTradeMarkers();
  if (AG.pages.bindirmeIslem) AG.pages.bindirmeIslem.grafikDegisti();
  if (anData) { try { renderBacktestAnalytics(anData); } catch (e) { console.warn('Analiz yeniden çizilemedi:', e.message); } }
}
document.addEventListener('ag:tema', grafikleriTemayaUydur);

// WebSocket Connection
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket Connected!');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'INIT') {
        updateDashboardState(msg.data);
        updateStats(msg.stats);
        renderDockLogs(msg.logs);
      } else if (msg.type === 'TICK') {
        updateDashboardState(msg.data);
      } else if (msg.type === 'STATS') {
        updateStats(msg.data);
      } else if (msg.type === 'LOGS') {
        renderDockLogs(msg.data);
      } else if (msg.type === 'CONFIG_UPDATED') {
        currentConfig = msg.data;
        populateConfigForms(msg.data);
        fetchWatchlistUI();
      }
    } catch (e) {
      console.error('WS Message Parse Error:', e);
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 3000);
  };
}

// Fetch Initial Data via REST API
async function fetchInitialData() {
  try {
    const statusData = await AG.api.durum();

    checkAppVersion(statusData.appVersion);

    isBotRunning = !!statusData.isRunning;
    updateDashboardState(statusData.state);
    updateStats(statusData.stats);

    // Strateji listeleri config'ten ÖNCE kurulmalı: `populateConfigForms`
    // seçili stratejiyi atarken seçeneğin listede olması gerekiyor.
    await loadStrategyCatalog();

    currentConfig = await AG.api.ayarOku();
    populateConfigForms(currentConfig);

    // Gösterge katmanı config'e bağlı (kayıtlı listeler orada), o yüzden
    // config yüklendikten sonra kurulur.
    await initIndicators(currentConfig);

    const logs = await AG.api.kayitlar();
    renderDockLogs(logs);

    // Ölçüm kayıtları bir kez: Stratejiler listesinin rozetleri ve "Ölçüm" bölümü.
    if (!stratAdaylar.length && AG.pages.arastirma) {
      AG.pages.arastirma.adaylariGetir()
        .then(a => { stratAdaylar = a; stratejileriCiz(); })
        .catch(err => console.warn('Ölçüm kayıtları alınamadı:', err.message));
    }

  } catch (e) {
    console.error('Error fetching initial data:', e);
  }
}

/**
 * Strateji kataloğu (`/api/strategies`). Seçiciler tek listeden kurulur:
 *   · Bot başlatma (`dashSelectStrategy`): YALNIZ Aktif + Aday. Arşivdekiler
 *     elendi; eskiden "güncel" grupta duruyor ve başlatılabiliyorlardı.
 *   · Backtest (`btStrategy`): hepsi — arşiv kıyas ölçütü olarak ayrı grupta.
 * Gruplama kuralı `AG.pages.stratejiler.grup` (ölçüm durumu + arşiv bayrağı).
 */
let strategyCatalog = [];

function stratejiSeceneklari(sel, gruplar, { portfoyHaric = false, grupla: grupFn = null } = {}) {
  if (!sel) return;
  const onceki = sel.value;
  sel.textContent = '';
  const grupla = grupFn || AG.pages.stratejiler.grup;
  for (const [g, ad] of gruplar) {
    // Portföy botları (Hücum/Denge) motorun sembol başına bot akışında koşmaz.
    const uyeler = strategyCatalog.filter(s => grupla(s) === g && !(portfoyHaric && s.portfoy));
    if (!uyeler.length) continue;
    const og = document.createElement('optgroup');
    og.label = ad;
    uyeler.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.key;
      opt.textContent = s.label;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  }
  if (onceki && Array.from(sel.options).some(o => o.value === onceki)) sel.value = onceki;
}

/**
 * 62.9: Backtest strateji seçicisi — Çalışan botlar · Adaylar · Geçti, kullanılmıyor; elenenler yalnız
 * Gelişmiş › "Arşivdeki (elenen) stratejileri de göster" işaretliyse (kıyas için).
 */
function btStratejiSecenekleri() {
  const S = AG.pages.stratejiler;
  const arsiv = !!(document.getElementById('btArsivGoster') || {}).checked;
  const gruplar = [['bot', 'Çalışan botlar'], ['aday', 'Adaylar'], ['gecti', 'Geçti, kullanılmıyor']];
  if (arsiv) gruplar.push(['arsiv', 'Arşiv (kıyas için)']);
  stratejiSeceneklari(document.getElementById('btStrategy'), gruplar, { grupla: S.listeGrubu });
}
/** 62.9: Arşiv › Eski stratejiler — tıklayınca Stratejiler ekranında ayrıntısı. */
function stratejiArsivCiz() {
  const S = AG.pages.stratejiler;
  if (!S || !S.arsivCiz) return;
  S.arsivCiz(document.getElementById('arsivStratListe'), strategyCatalog, stratAdaylar, (key) => { stratejiSec(key); sekmeyeGec('tab-strategy'); });
}

async function loadStrategyCatalog() {
  try {
    const data = await AG.api.stratejiler();
    if (!data.success || !Array.isArray(data.strategies)) return;
    strategyCatalog = data.strategies;

    stratejiSeceneklari(document.getElementById('dashSelectStrategy'), [['aktif', 'Aktif'], ['aday', 'Aday']], { portfoyHaric: true });
    btStratejiSecenekleri();
    stratejiArsivCiz();

    // Optimizasyon parametre seçicisi de katalogdan beslenir.
    renderOptParamPicker();

    // Backtest ince-ayar formu strateji seçimine bağlı: test etmeden ÖNCE
    // alanlar görünsün.
    const btSel = document.getElementById('btStrategy');
    if (btSel && btSel.dataset.tuneBound !== '1') {
      btSel.dataset.tuneBound = '1';
      // B-25/B-26 (61.1): strateji değişince TEK yerden — ince ayar alanları, aranacak parametreler
      // (seçili stratejinin şemasından) ve zaman dilimi (günlük stratejide 1 gün) birlikte tazelenir.
      // Belgeye bağlı 'change' dinleyicisi programla seçilen değerde (kabarmayan olay) kaçabiliyordu.
      const ciz = () => {
        currentInspectedStrategyKey = btSel.value;
        const kayitli = (currentConfig.strategies && currentConfig.strategies[btSel.value]) || {};
        currentInspectedConfig = { ...kayitli };
        renderParameterTuneFields(btSel.value, currentInspectedConfig);
        renderOptParamPicker();
        btZamanDilimiUygula(true);
      };
      btSel.addEventListener('change', ciz);
      btSel.addEventListener('input', ciz);
      document.getElementById('btTimeframe')?.addEventListener('change', () => btZamanDilimiUygula(false));
      ciz();
    }

    if (!seciliStrateji || !strategyCatalog.some(s => s.key === seciliStrateji)) {
      // 62.9: liste "Çalışan botlar" ile başlar — ilk açılışta Hücum seçili.
      const ilkBot = strategyCatalog.find(s => s.portfoy && !s.archived);
      seciliStrateji = (ilkBot && ilkBot.key) || (strategyCatalog[0] && strategyCatalog[0].key) || null;
    }
    stratejileriCiz();
  } catch (e) {
    console.error('Strateji kataloğu alınamadı:', e);
  }
}

/**
 * STRATEJİ PARAMETRE FORMU — tek üretici.
 *
 * Eskiden iki kopya vardı: Strateji sekmesinin formu (`renderStrategyParams`)
 * ve Backtest'in ince-ayar formu (`renderParameterTuneFields`); aynı şemayı
 * iki ayrı kodla çiziyorlardı. İkisi de artık bunu çağırır. Şema stratejinin
 * `static paramSchema` bildirimi; elle HTML yazılmaz.
 *
 * @param kutu      kap
 * @param sema      { ad: { type, label, default, min, max, step, values, group, description } }
 * @param degerler  başlangıç değerleri (eksik alan varsayılanla)
 * @param secenek   { onek: kimlik öneki, kompakt: grup başlığı/açıklama satırı yok (açıklama title'da),
 *                    degisti: alan değişince çağrılır }
 * @returns değerler nesnesi — alanlar değiştikçe yerinde güncellenir
 */
function paramFormuCiz(kutu, sema, degerler, secenek = {}) {
  const el = AG.dom.el;
  const onek = secenek.onek || 'prm';
  const kompakt = !!secenek.kompakt;
  const values = {};
  const alanlar = Object.entries(sema || {});
  for (const [ad, spec] of alanlar) {
    values[ad] = degerler && degerler[ad] !== undefined ? degerler[ad] : spec.default;
  }
  if (!kutu) return values;
  AG.dom.bosalt(kutu);
  if (!alanlar.length) {
    kutu.appendChild(el('div', { class: 'hint text-sm', text: 'Bu strateji panelden ayarlanabilir parametre bildirmemiş.' }));
    return values;
  }

  const degisti = () => { if (secenek.degisti) secenek.degisti(values); };
  const alanCiz = (ad, spec) => {
    const id = `${onek}-${ad}`;
    const sarici = el('div', { class: kompakt ? 'form-group mb-0' : 'form-group m-0' });
    sarici.appendChild(el('label', { for: id, text: spec.label || ad, class: 'text-sm', title: kompakt ? (spec.description || null) : null }));

    let input;
    if (spec.type === 'boolean') {
      input = el('input', { type: 'checkbox', id, class: kompakt ? 'mt-1' : null });
      input.checked = values[ad] === true;
      input.addEventListener('change', () => { values[ad] = input.checked; degisti(); });
      sarici.appendChild(kompakt ? input : el('div', { class: 'pt-1' }, [input]));
    } else if (spec.type === 'enum') {
      input = el('select', { id, class: kompakt ? 'form-control control-md' : 'form-control' });
      (spec.values || []).forEach(v => input.appendChild(el('option', { value: v, text: String(v) })));
      input.value = String(values[ad]);
      input.addEventListener('change', () => { values[ad] = input.value; degisti(); });
      sarici.appendChild(input);
    } else {
      input = el('input', {
        type: 'number', id, class: kompakt ? 'form-control control-md' : 'form-control',
        step: spec.step !== undefined ? spec.step : 'any',
        value: values[ad]
      });
      if (spec.min !== undefined) input.setAttribute('min', spec.min);
      if (spec.max !== undefined) input.setAttribute('max', spec.max);
      input.addEventListener('change', () => {
        const ham = parseFloat(input.value);
        values[ad] = Number.isFinite(ham) ? ham : spec.default;
        degisti();
      });
      sarici.appendChild(input);
    }

    if (!kompakt) {
      if (spec.description) sarici.appendChild(el('small', { text: spec.description, class: 'param-desc' }));
      // Sınırlar görünsün: hiç tetiklenmeyen bir eşik yazılmasın.
      if (spec.type === 'number' && (spec.min !== undefined || spec.max !== undefined)) {
        sarici.appendChild(el('small', {
          text: `aralık: ${spec.min !== undefined ? spec.min : '−∞'} … ${spec.max !== undefined ? spec.max : '∞'} · varsayılan ${spec.default}`,
          class: 'param-range'
        }));
      }
    }
    return sarici;
  };

  if (kompakt) {
    alanlar.forEach(([ad, spec]) => kutu.appendChild(alanCiz(ad, spec)));
    return values;
  }
  // Tam form `group` alanına göre bölümlenir — 20 alanı tek ızgaraya dökmek okunmaz.
  const gruplar = {};
  for (const [ad, spec] of alanlar) (gruplar[spec.group || 'Genel'] = gruplar[spec.group || 'Genel'] || []).push([ad, spec]);
  for (const [grupAdi, liste] of Object.entries(gruplar)) {
    kutu.appendChild(el('h4', { text: grupAdi, class: 'param-group-title' }));
    kutu.appendChild(el('div', { class: 'param-grid' }, liste.map(([ad, spec]) => alanCiz(ad, spec))));
  }
  return values;
}

/** Stratejiler → Parametreler formu. Değerler `config.strategies[key]`'den. */
let strategyParamState = { key: null, values: {} };

function renderStrategyParams(key) {
  const kutu = document.getElementById('strategyParamForm');
  if (!kutu) return;
  const meta = strategyCatalog.find(s => s.key === key);
  const baslik = document.getElementById('strategyParamTitle');
  if (baslik) baslik.textContent = `${meta ? meta.label : key} — parametreler`;
  const mevcut = (currentConfig.strategies && currentConfig.strategies[key]) || {};
  strategyParamState = {
    key,
    values: paramFormuCiz(kutu, (meta && meta.params) || {}, mevcut, { onek: 'sp', degisti: () => kirliFormlar.add('formStrategy') })
  };
}

// --- Stratejiler sekmesi ------------------------------------------------------
// Liste ve "Kurallar" js/pages/stratejiler.js; "Ölçüm" js/pages/arastirma.js.
let seciliStrateji = null;
let stratAdaylar = [];
let stratBotImza = null;
let stratOlcumKey = null;

function botSayilari() {
  const m = {};
  ((lastState && lastState.bots) || []).forEach(b => { m[b.strategy] = (m[b.strategy] || 0) + 1; });
  return m;
}

function stratejileriCiz() {
  const S = AG.pages.stratejiler;
  if (!S || !strategyCatalog.length) return;
  const sayilar = botSayilari();
  stratBotImza = JSON.stringify(sayilar);
  S.listeCiz(document.getElementById('stratListe'), strategyCatalog, stratAdaylar, sayilar, seciliStrateji, stratejiSec);
  stratejiArsivCiz();

  const s = strategyCatalog.find(x => x.key === seciliStrateji);
  if (!s) return;
  const ad = document.getElementById('stratDetayAd');
  if (ad) ad.textContent = s.label;
  S.rozetler(document.getElementById('stratDetayRozetler'), s, stratAdaylar, sayilar);
  S.kurallarCiz(document.getElementById('strat-kurallar'), s, stratAdaylar);
  if (strategyParamState.key !== s.key || !kirliFormlar.has('formStrategy')) renderStrategyParams(s.key);
  // Ölçüm bölümü yalnız strateji değişince: yeniden ölçüm sonucu her çizimde silinmesin.
  if (stratOlcumKey !== s.key + '|' + stratAdaylar.length && AG.pages.arastirma) {
    stratOlcumKey = s.key + '|' + stratAdaylar.length;
    AG.pages.arastirma.olcumCiz(document.getElementById('arastirmaDetay'), S.adaylariBul(s.key, stratAdaylar));
  }
  const botBtn = document.getElementById('btnStratBotBaslat');
  if (botBtn) {
    botBtn.disabled = !!s.archived;
    botBtn.title = s.archived ? 'Arşivdeki strateji kâğıt testte çalıştırılamaz (yalnız backtestte kıyas için)' : 'Arşiv › Kâğıt test ekranında bu stratejiyi seçer';
  }
}

function stratejiSec(key) {
  if (key === seciliStrateji) return;
  if (kirliFormlar.has('formStrategy')) AG.bildir('Kaydedilmemiş parametre değişiklikleri bırakıldı.', 'uyari');
  kirliFormlar.delete('formStrategy');
  seciliStrateji = key;
  stratejileriCiz();
}

/** Tick'te yalnız çalışan bot sayıları değiştiyse liste yeniden çizilir. */
function stratBotSayilariniGuncelle() {
  if (JSON.stringify(botSayilari()) !== stratBotImza) stratejileriCiz();
}

function initStratejiSekmesi() {
  const PANELLER = ['strat-kurallar', 'strat-parametreler', 'strat-olcum'];
  document.querySelectorAll('[data-strat-tab]').forEach(btn => btn.addEventListener('click', () => {
    const hedef = btn.getAttribute('data-strat-tab');
    document.querySelectorAll('[data-strat-tab]').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    PANELLER.forEach(id => document.getElementById(id)?.classList.toggle('is-hidden', id !== hedef));
  }));

  document.getElementById('btArsivGoster')?.addEventListener('change', () => {
    btStratejiSecenekleri();
    document.getElementById('btStrategy')?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  document.getElementById('btnStratBacktest')?.addEventListener('click', () => {
    const sel = document.getElementById('btStrategy');
    // 62.9: arşivdeki stratejinin backtesti — seçicide yoksa "arşivdekileri de göster" açılır.
    const ak = document.getElementById('btArsivGoster');
    if (sel && seciliStrateji && ak && !Array.from(sel.options).some(o => o.value === seciliStrateji)) { ak.checked = true; btStratejiSecenekleri(); }
    if (sel && seciliStrateji) {
      sel.value = seciliStrateji;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (AG.pages.backtestEkran) AG.pages.backtestEkran.gorunum('kosu');
    sekmeyeGec('tab-backtest');
  });

  document.getElementById('btnStratBotBaslat')?.addEventListener('click', () => {
    const s = strategyCatalog.find(x => x.key === seciliStrateji);
    const sel = document.getElementById('dashSelectStrategy');
    if (!s || s.archived || !sel) return;
    sel.value = s.key;
    sekmeyeGec('tab-kagit');
    setTimeout(() => document.getElementById('botBaslatPanel')?.scrollIntoView({ behavior: 'smooth' }), 60);
    AG.bildir(`${s.label} seçildi. Varlıkları işaretleyip "Kâğıt botları başlat"a basın.`, 'bilgi');
  });

  document.getElementById('btnResetStrategyParams')?.addEventListener('click', async () => {
    const meta = strategyCatalog.find(s => s.key === seciliStrateji);
    if (!meta) return;
    if (!(await AG.onayla({
      baslik: 'Varsayılanlara dönülsün mü?',
      metin: `${meta.label} parametreleri formda varsayılanlara döner. Kalıcı olması için Kaydet'e basın.`,
      onay: 'Varsayılana dön'
    }))) return;
    const varsayilan = {};
    for (const [ad, spec] of Object.entries(meta.params || {})) varsayilan[ad] = spec.default;
    strategyParamState = {
      key: meta.key,
      values: paramFormuCiz(document.getElementById('strategyParamForm'), meta.params || {}, varsayilan,
        { onek: 'sp', degisti: () => kirliFormlar.add('formStrategy') })
    };
    kirliFormlar.add('formStrategy');
  });
}

/**
 * A cached app.js running against a newer server reintroduces bugs that were
 * already fixed, with no visible symptom. Make it impossible to miss.
 */
function checkAppVersion(serverVersion) {
  if (!serverVersion || serverVersion === APP_VERSION) return;
  if (document.getElementById('staleClientBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'staleClientBanner';
  banner.className = 'stale-banner';
  const el = AG.dom.el;
  AG.dom.doldur(banner, [
    document.createTextNode(
      `⚠️ Bu sayfa eski sürümü çalıştırıyor (arayüz ${APP_VERSION}, sunucu ${serverVersion}). `
      + 'Düzeltmelerin etkin olması için '),
    el('strong', { text: 'Ctrl+F5' }),
    document.createTextNode(' ile sayfayı yenileyin. '),
    el('button', { id: 'btnForceReload', class: 'stale-reload', text: 'Şimdi Yenile' })
  ]);
  document.body.appendChild(banner);

  document.getElementById('btnForceReload').addEventListener('click', () => {
    // Cache-busting query guarantees a fresh document even if the cached copy
    // predates the no-cache headers.
    window.location.href = window.location.pathname + '?reload=' + Date.now() + window.location.hash;
  });
}

// Watchlist UI Rendering & API Connection
async function fetchWatchlistUI() {
  // Rozetlerin önbellek durumu Ayarlar'daki seçiciye göre; backtest dilimine BAĞLI DEĞİL.
  const tf = document.getElementById('selWatchlistCacheTf')?.value || '1h';

  try {
    const data = await AG.api.izlemeListesi(tf);
    if (data.success && data.watchlist) {
      renderWatchlistBadges(data.watchlist, tf);
      populateSymbolDropdowns(data.watchlist);
      renderMultiSymbolCheckboxes(data.watchlist);
      // Chart picker now has options — do the first load.
      if (!chartSymbol) applyChartSelection();
    }
  } catch (e) {
    console.error('Watchlist fetch error:', e);
  }
}

// Builds the multi-bot selector from the configured watchlist so the two never drift apart.
function renderMultiSymbolCheckboxes(watchlistItems) {
  const container = document.getElementById('multiSymbolCheckboxes');
  if (!container) return;

  const symbols = (watchlistItems || []).map(i => (typeof i === 'string' ? i : i.symbol));
  const active = Array.isArray(currentConfig.activeSymbols) ? currentConfig.activeSymbols : [];

  // The watchlist is the ceiling on how many bots can run — make that visible.
  const countEl = document.getElementById('txtWatchlistCount');
  if (countEl) countEl.textContent = `(${symbols.length} varlık · ${active.length} çalışıyor)`;

  if (symbols.length === 0) {
    AG.dom.doldur(container, [
      AG.pages.seciciler.bosNot('İzleme listesi boş. Yandaki alandan varlık ekleyin.')
    ]);
    multiSymbolRenderedState = null;
    return;
  }

  // This row selects which assets to START now — it is not a mirror of what is
  // already running. Pre-checking running bots would re-apply the panel's
  // current strategy/timeframe to them on the next click.
  const boxes = Array.from(container.querySelectorAll('.chk-multi-symbol'));
  const domSelection = boxes.filter(c => c.checked).map(c => c.value).sort().join(',');
  const userEdited = multiSymbolRenderedState !== null && domSelection !== multiSymbolRenderedState;
  const checked = new Set(userEdited ? boxes.filter(c => c.checked).map(c => c.value) : []);

  AG.dom.doldur(container, symbols.map(s => AG.pages.seciciler.cip({
    deger: s,
    etiket: s,
    sinif: 'chk-multi-symbol',
    isaretli: checked.has(s),
    ek: active.includes(s) ? AG.pages.seciciler.calisiyorRozeti() : null
  })));

  multiSymbolRenderedState = Array.from(checked).sort().join(',');
}

/**
 * ARANACAK PARAMETRE SEÇİCİSİ.
 *
 * Optimizatör en çok 4 parametreyi birlikte arar (81 kombinasyon). Hangi 4'ü
 * olduğu görünmezse kullanıcı "optimize ettim" der ama neyin arandığını
 * bilmez — 14 parametreli bir botta bu, sonucu yanlış okutur.
 *
 * Otomatik seçim şemadaki ilk sayısal parametrelerdir; bu bir TAHMİNDİR ve
 * pozisyon boyutu gibi aranmaması gereken alanlara denk gelebilir. Seçim boş
 * bırakılırsa sunucu kendi varsayılanını kullanır.
 *
 * MODÜL DÜZEYİNDE: `strategyCatalog` modül düzeyinde bir `let` ve katalog
 * yüklendiğinde bu işlev çağrılıyor. İç kapsamda tanımlansaydı oradan
 * erişilemezdi.
 */
function renderOptParamPicker() {
  const kutu = document.getElementById('optParamPicker');
  const ipucu = document.getElementById('optParamHint');
  if (!kutu) return;

  const key = document.getElementById('btStrategy')?.value;
  const meta = (strategyCatalog || []).find(s => s.key === key);
  const sema = (meta && meta.params) || {};
  // Motorun kendi boyutlandırma alanı stratejinin mantığına ait değil.
  const anahtarlar = Object.keys(sema).filter(k => k !== 'allocationPct');

  if (!anahtarlar.length) {
    AG.dom.doldur(kutu, [AG.pages.seciciler.bosNot('Bu stratejide ayarlanabilir parametre yok.')]);
    if (ipucu) ipucu.textContent = '';
    updateOptParamSayi();
    return;
  }

  const onceki = new Set(Array.from(kutu.querySelectorAll('input:checked')).map(c => c.value));
  const ayniStrateji = kutu.dataset.key === key;

  kutu.dataset.key = key;
  AG.dom.doldur(kutu, anahtarlar.map(k => {
    const s = sema[k] || {};
    // Tip işareti: sayı, açma-kapama, liste.
    const tip = s.type === 'number' ? '#' : s.type === 'boolean' ? '✓' : '≡';
    return AG.pages.seciciler.cip({
      deger: k,
      etiket: `${tip} ${s.label || k}`,
      sinif: 'chk-opt-param',
      isaretli: ayniStrateji && onceki.has(k),
      baslik: `${k} · ${s.type}`,
      dar: true
    });
  }));
  updateOptParamSayi();
}

/**
 * ZAMAN DİLİMİ ↔ STRATEJİ (B-25, 61.1). Katalog `zamanDilimi: { varsayilan, izinli }` taşıyan strateji
 * (Hücum, Denge, Donchian, kitap stratejileri — kuralı gün cinsinden) seçilince zaman dilimi
 * varsayılana çekilir; kullanıcı izinsiz bir dilim seçerse uyarı görünür (koşu engellenmez).
 * Saf karar `AG.pages.backtestZaman.karar` (test edilir).
 */
function btZamanDilimiUygula(stratejiDegisti) {
  const sel = document.getElementById('btTimeframe');
  const uyari = document.getElementById('btTfUyari');
  const key = document.getElementById('btStrategy')?.value;
  const meta = (strategyCatalog || []).find(s => s.key === key);
  if (!sel || !AG.pages.backtestZaman) return;
  const k = AG.pages.backtestZaman.karar(meta, sel.value, stratejiDegisti);
  if (k.yeni && k.yeni !== sel.value) { sel.value = k.yeni; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  if (uyari) { uyari.textContent = k.uyari || ''; uyari.classList.toggle('is-hidden', !k.uyari); }
}

function secilenOptParams() {
  return Array.from(document.querySelectorAll('#optParamPicker input:checked')).map(c => c.value);
}

function updateOptParamSayi() {
  const n = secilenOptParams().length;
  const et = document.getElementById('optParamSayi');
  const ipucu = document.getElementById('optParamHint');
  if (et) et.textContent = n ? `(${n} seçili)` : '(otomatik)';
  if (!ipucu) return;
  if (!n) {
    ipucu.textContent = 'Seçim yoksa sunucu ilk sayısal parametreleri arar (en çok 4).';
    tonla(ipucu, 'var(--text-muted)');
  } else if (n > 4) {
    ipucu.textContent = `${n} seçtiniz — optimizatör en çok 4 parametre arar, fazlası yok sayılır.`;
    tonla(ipucu, 'var(--accent-warning)');
  } else {
    ipucu.textContent = `${n} parametre × 3 değer ≈ ${Math.pow(3, n)} kombinasyon; hepsi denenir.`;
    tonla(ipucu, 'var(--text-muted)');
  }
}

// Olay temsilcisi: kutular yeniden çizildiği için doğrudan bağlanmaz.
document.addEventListener('change', (e) => {
  if (e.target.matches && e.target.matches('.chk-opt-param')) updateOptParamSayi();
  if (e.target.id === 'btStrategy') renderOptParamPicker();
});
document.addEventListener('click', (e) => {
  if (!e.target.closest || !e.target.closest('#btnOptParamTemizle')) return;
  document.querySelectorAll('#optParamPicker input:checked').forEach(c => { c.checked = false; });
  updateOptParamSayi();
});

function populateSymbolDropdowns(watchlistItems) {
  const currentSym = currentConfig.symbol || 'BTC/USDT';
  const symbols = (watchlistItems && watchlistItems.length > 0)
    ? watchlistItems.map(i => i.symbol)
    : ["BTC/USDT", "ETH/USDT", "SOL/USDT", "AVAX/USDT", "XRP/USDT", "BNB/USDT", "LINK/USDT", "NEAR/USDT"];

  if (!symbols.includes(currentSym)) {
    symbols.unshift(currentSym);
  }

  const dropdownIds = ['btSymbol'];
  dropdownIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) AG.pages.seciciler.secenekler(el, symbols, el.value || currentSym);
  });

  // The chart's own symbol picker keeps whatever the user selected, so a
  // watchlist refresh never drags the chart back to the bot's symbol.
  const chartSel = document.getElementById('chartSymbolSelect');
  if (chartSel) {
    const keep = chartSel.value || chartSymbol || currentSym;
    const chartSymbols = symbols.includes(keep) ? symbols : [keep, ...symbols];
    AG.pages.seciciler.secenekler(chartSel, chartSymbols, keep);
  }
}

function formatTimeframeLabel(tf) {
  switch (tf) {
    case '1m': return '1 Dakikalık (1m)';
    case '5m': return '5 Dakikalık (5m)';
    case '15m': return '15 Dakikalık (15m)';
    case '1h': return '1 Saatlik (1h)';
    case '4h': return '4 Saatlik (4h)';
    case '1d': return '1 Günlük (1d)';
    default: return `${tf} Zaman Dilimi`;
  }
}

const renderWatchlistBadges = (items, timeframe) =>
  AG.pages.bots.izlemeRozetleri(items, timeframe,
    formatTimeframeLabel(timeframe), window.removeWatchlistSymbol);

/** Denetim A-03: ✖ tek tıkla silmiyor — önce onay (BTC/USDT dahil hiçbir varlık onaysız gitmez). */
window.removeWatchlistSymbol = async function(symbol) {
  const onay = await AG.onayla({
    baslik: `${symbol} izleme listesinden çıkarılsın mı?`,
    metin: 'Varlık grafik seçicisinden, kâğıt test bot listesinden ve izleme listesi taramasından kalkar. Mum önbelleği silinmez; istediğiniz zaman yeniden ekleyebilirsiniz.',
    onay: 'Listeden çıkar', tehlikeli: true
  });
  if (!onay) return false;
  try {
    const data = await AG.api.izlemeCikar(symbol);
    if (data.success) {
      fetchWatchlistUI();
      return true;
    }
    AG.bildir('Varlık çıkarılamadı: ' + (data.error || `HTTP ${data[AG.api.DURUM]}`), 'hata');
  } catch (e) {
    AG.bildir('Varlık silinemedi: ' + e.message);
  }
  return false;
};

// --- Kâğıt test hesabı ayrıntıları (eski hesap dock'u; Araştırma › Kâğıt test) ---
// Pozisyonlar ve emirler Pusula P3'ten beri Hesaplar ekranının tek tablolarında (js/pages/hesaplar.js).
let dockBalanceHistoryList = [];

function initDockNavigation() {
  /**
   * YALNIZ dock'un kendi sekmeleri. Eskiden seçici `.dock-tab` idi ve Backtest
   * analiz alt sekmeleri de bu sınıfı taşıyordu: analizde bir alt sekmeye
   * tıklamak dock panellerini, dock'ta tıklamak analiz panellerini boşaltıyordu.
   */
  const tabs = document.querySelectorAll('.dock-tab[data-dock-tab]');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      document.querySelectorAll('.dock-content-area > .dock-tab-pane').forEach(p => p.classList.remove('active'));

      const targetId = tab.getAttribute('data-dock-tab');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');

      if (targetId === 'dock-balance-history') {
        fetchDockBalanceHistory();
      } else if (targetId === 'dock-assets' && lastState) {
        AG.pages.dock.varliklar(bakiyeVar(lastState) ? lastState.balances.balances : null, lastState.tickerMap);
      }
    });
  });

  /**
   * "Ekranı temizle" YALNIZ görünümü temizler. Eskiden onaysız
   * `/api/clear-history` çağırıyordu — o uç işlem geçmişini, emirleri, bakiye
   * kayıtlarını ve equity serisini SİLİYOR. Ekranda görünen kayıtlar gizlenir;
   * yenileri gelmeye devam eder.
   */
  const btnClearDockLogs = document.getElementById('btnClearDockLogs');
  if (btnClearDockLogs) {
    btnClearDockLogs.addEventListener('click', () => {
      gizliLoglar = new Set((sonLoglar || []).map(logImzasi));
      logEkranImza = null;
      renderDockLogs(sonLoglar || []);
    });
  }

  const btnExport = document.getElementById('btnExportDockCsv');
  if (btnExport) {
    btnExport.addEventListener('click', exportDockToCsv);
  }
}

async function fetchDockBalanceHistory() {
  try {
    dockBalanceHistoryList = await AG.api.bakiyeGecmisi();
    renderDockBalanceHistory(dockBalanceHistoryList);
  } catch (e) {
    console.error('Fetch balance history error:', e);
  }
}

function updateTradingDock(state) {
  if (!state) return;
  if (document.getElementById('dock-assets')?.classList.contains('active')) {
    AG.pages.dock.varliklar(bakiyeVar(state) ? state.balances.balances : null, state.tickerMap);
  }
}

/**
 * DOCK TABLOLARI ARTIK BURADA DEĞİL — `js/pages/dock.js` içinde (bakiye geçmişi,
 * varlıklar, günlük). Kâğıt motorun pozisyon/emir tabloları Pusula P3'te kalktı:
 * Hesaplar ekranının tek pozisyon ve tek emir/işlem tablosunda "Kâğıt test" kaynağı.
 * Kâğıt pozisyonun "Kapat" düğmesi (js/pages/hesaplar.js) aşağıdaki onaylı fonksiyonu çağırır.
 */
const renderDockBalanceHistory = (items) => AG.pages.dock.bakiyeGecmisi(items);

window.closeDockPosition = async function(symbol) {
  // Piyasa emriyle kapatır ve geri alınamaz; tek tıkla gitmemeli.
  const pos = ((lastState && lastState.balances && lastState.balances.positions) || []).find(p => p.symbol === symbol);
  const ayrinti = pos
    ? `\n\nMiktar: ${Math.abs(Number(pos.amount) || 0).toFixed(4)} · Giriş: $${Number(pos.entryPrice || 0).toFixed(4)}`
      + (pos.side ? ` · Yön: ${pos.side === 'short' ? 'Kısa' : 'Uzun'}` : '')
    : '';
  const onay = await AG.onayla({
    baslik: `${symbol} pozisyonu kapatılsın mı?`,
    metin: `Pozisyon PİYASA FİYATINDAN kapatılacak ve sembol 60 sn soğumaya girecek. Bu işlem geri alınamaz.${ayrinti}`,
    onay: 'Pozisyonu kapat',
    tehlikeli: true
  });
  if (!onay) return;
  try {
    const data = await AG.api.pozisyonKapat(symbol);
    if (data.success) {
      AG.bildir(`${symbol} pozisyonu kapatıldı.`, 'ok');
      fetchInitialData();
      fetchDockBalanceHistory();
      if (AG.pages.hesaplar) AG.pages.hesaplar.yukle(true);
    } else {
      AG.bildir('Pozisyon kapatılamadı: ' + (data.error || `HTTP ${data[AG.api.DURUM]}`), 'hata');
    }
  } catch (err) {
    AG.bildir('Pozisyon kapatılamadı: ' + err.message, 'hata');
  }
};

/**
 * Günlük her tick (LOGS) aynı 20 satırla gelir; değişmediyse yeniden kurulmaz.
 * "Ekranı temizle"den sonra o an görünen kayıtlar gizli kalır.
 */
let sonLoglar = [];
let logEkranImza = null;
let gizliLoglar = new Set();
const logImzasi = (l) => `${l.timestamp}|${l.level}|${l.message}`;
function renderDockLogs(logs) {
  if (!Array.isArray(logs)) return;
  sonLoglar = logs;
  const gorunen = gizliLoglar.size ? logs.filter(l => !gizliLoglar.has(logImzasi(l))) : logs;
  const imza = gorunen.length + '#' + (gorunen.length ? logImzasi(gorunen[0]) + logImzasi(gorunen[gorunen.length - 1]) : '');
  if (imza === logEkranImza) return;
  logEkranImza = imza;
  AG.pages.dock.kayitlar(gorunen);
}

function exportDockToCsv() {
  const activePane = document.querySelector('.dock-content-area > .dock-tab-pane.active');
  if (!activePane) return;

  const table = activePane.querySelector('table');
  if (!table) return;

  let csv = [];
  const rows = table.querySelectorAll('tr');

  for (let r of rows) {
    const cols = r.querySelectorAll('th, td');
    const rowData = [];
    for (let c of cols) {
      rowData.push(`"${c.innerText.replace(/"/g, '""').trim()}"`);
    }
    csv.push(rowData.join(','));
  }

  const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `trade_bot_dock_export_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// UI State Updates

/**
 * BOTS SAYFASININ ÇİZİCİLERİ ARTIK BURADA DEĞİL — `js/pages/bots.js`.
 *
 * Üçü de metin birleştirmeyle işaretleme kuruyordu; bot kimliği ve sembol
 * `onclick="…('…')"` içine gömülüyordu. Modül DOM kurar, sunucuya gitmez
 * ve durum tutmaz — `scripts/panel-bots-testi.js` onu tarayıcısız sınıyor.
 */
const renderActiveBotsTable = (state) =>
  AG.pages.bots.calisanBotlar(state, isBotRunning, window.stopBot);

window.stopBot = async function(botId) {
  const bot = ((lastState && lastState.bots) || []).find(b => b.id === botId);
  const ad = bot ? `${bot.symbol} · ${bot.strategy} · ${bot.timeframe}` : String(botId);
  if (!(await AG.onayla({
    baslik: 'Bot durdurulsun mu?',
    metin: `${ad}\n\nBot yeni sinyal üretmeyecek. Açık pozisyonu varsa KAPATILMAZ.`,
    onay: 'Botu durdur',
    tehlikeli: true
  }))) return;
  try {
    const data = await AG.api.botDurdur(botId);
    if (!data.success) {
      AG.bildir('Bot durdurulamadı: ' + (data.error || `HTTP ${data[AG.api.DURUM]}`));
      return;
    }
    currentConfig.bots = data.bots;
    currentConfig.activeSymbols = data.activeSymbols;
    multiSymbolRenderedState = null;
    await fetchInitialData();
    fetchWatchlistUI();
  } catch (err) {
    AG.bildir('Bot durdurulamadı: ' + err.message);
  }
};

function updateDashboardState(state) {
  if (!state) return;
  lastState = state;

  // Kill-switch sıfırlama düğmesi başlıkta: hangi sekme açık olursa olsun görünmeli.
  const risk = state.riskStatus || {};
  document.getElementById('btnResetKillSwitch')?.classList.toggle('is-hidden', !risk.killSwitchTriggered);

  // Grafik her tick beslenir (gizliyken de): canlı barın yüksek/düşüğü kaçmasın.
  syncChartSelection(state);
  updateChartBotHeader(state);
  renderChartPositionLines(state);
  if (chartSymbol && typeof state.tradeSeq === 'number' && state.tradeSeq !== chartTradeSeq) {
    chartTradeSeq = state.tradeSeq;
    loadChartTrades(chartSymbol);
  }
  if (chartSymbol) {
    const chartTicker = (state.tickerMap && state.tickerMap[chartSymbol])
      || (state.symbol === chartSymbol ? state.ticker : null);
    if (chartTicker && chartTicker.last) updateLiveChartBar(chartTicker.last);
  }

  // Tablolar yalnız görünen ekranda (Pusula P1: eski Canlı İzleme üç ekrana bölündü).
  if (sekmeAcik('tab-kagit')) {                              // Araştırma › Kâğıt test (+ hesap ayrıntıları)
    updateTradingDock(state);
    renderActiveBotsTable(state);
    renderTopCards(state);
  }
  if (sekmeAcik('tab-botlar')) {
    if (AG.pages.botlar) AG.pages.botlar.yukle(false);   // Hücum/Denge kartları, en çok 15 sn'de bir
    if (AG.pages.bindirmeIslem) AG.pages.bindirmeIslem.goster(false); // en çok 15 sn'de bir (grafik 60 sn)
  }
  if (sekmeAcik('tab-risk')) renderRiskTab(state);
  if (sekmeAcik('tab-strategy')) stratBotSayilariniGuncelle();
}

/**
 * Canlı İzleme kartları (5): portföy, gerçekleşmiş, açık pozisyon, botlar,
 * risk durumu. Eskiden 8 kart vardı; drawdown, açık risk, kademe ve soğuma
 * kartları Risk sekmesindeki aynı sayıların kopyasıydı (soğuma kartındaki onay
 * kutusu da Risk formunu atlayıp ayar yazıyordu). Hepsi tek "Risk durumu"
 * kartında özetlenir; kart Risk sekmesini açar.
 */
const kartYaz = (id, text, color) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  if (color) tonla(el, color);
};
const paraYaz = (n) => `$${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function renderRealizedCard() {
  const stats = lastStats || {};
  const realized = stats.totalProfitUSDT || 0;
  const startCapital = (currentConfig.paperWallet && currentConfig.paperWallet.USDT) || 10000;
  const realizedPct = startCapital > 0 ? (realized / startCapital) * 100 : 0;
  kartYaz('cardRealized', `${realized >= 0 ? '+' : ''}${paraYaz(realized)}`, realized >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)');
  kartYaz('cardRealizedSub', (stats.totalTrades || 0) === 0
    ? 'Henüz kapanmış işlem yok'
    : `%${realizedPct.toFixed(2)} · ${stats.totalTrades} işlem · kazanma %${(stats.winRatePct || 0).toFixed(0)}`);
}

function renderTopCards(state) {
  const positions = (state.balances && state.balances.positions) ? state.balances.positions : [];
  const cash = (state.balances && state.balances.balances) ? (state.balances.balances.USDT || 0) : 0;
  const tickers = state.tickerMap || {};

  // 1. Portföy değeri = nakit + açık pozisyonların güncel değeri
  let posValue = 0;
  let posCost = 0;
  positions.forEach(p => {
    const mark = (tickers[p.symbol] && tickers[p.symbol].last) || p.currentPrice || p.entryPrice || 0;
    posValue += p.amount * mark;
    posCost += p.amount * p.entryPrice;
  });
  if (bakiyeVar(state)) {
    kartYaz('cardEquity', paraYaz(cash + posValue), 'var(--text-strong)');
    kartYaz('cardEquitySub', `Nakit ${paraYaz(cash)} · Pozisyon ${paraYaz(posValue)}`);
  } else {
    kartYaz('cardEquity', '—', 'var(--text-muted)');
    kartYaz('cardEquitySub', 'Bakiye verisi gelmedi');
  }
  modRozeti(document.getElementById('txtModeBadge'), borsaModu(state));

  // 2. Gerçekleşmiş sonuç
  renderRealizedCard();

  // 3. Açık pozisyonlar
  const unrealized = posValue - posCost;
  kartYaz('cardOpenPos', String(positions.length), positions.length > 0 ? 'var(--text-strong)' : 'var(--text-muted)');
  kartYaz('cardOpenPosSub', positions.length === 0
    ? 'Açık pozisyon yok'
    : `${paraYaz(posValue)} · Gerçekleşmemiş ${unrealized >= 0 ? '+' : ''}${paraYaz(unrealized)}`,
    positions.length === 0 ? 'var(--text-muted)' : (unrealized >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'));

  // 4. Çalışan botlar (MOTOR DURUK ayrımı dahil)
  const oz = AG.pages.bots.botOzeti(state.bots, isBotRunning);
  const botEl = document.getElementById('cardBots');
  if (botEl) {
    botEl.textContent = oz.deger;
    botEl.classList.remove(...TON_SINIFLARI);
    botEl.classList.add(oz.ton);
  }
  kartYaz('cardBotsSub', oz.alt);

  // 5. Risk durumu — Risk sekmesindeki "Frenler" ile aynı hesap
  const risk = state.riskStatus || {};
  const f = frenOzeti(risk);
  const dd = Number(risk.drawdownPct) || 0;
  const ddLimit = risk.maxDrawdownPct || 10;
  kartYaz('cardRisk', f.frenler.length ? f.frenler.join(' + ') : 'Fren yok',
    f.frenler.length ? 'var(--accent-danger)' : (dd >= ddLimit * 0.6 ? 'var(--accent-warning)' : 'var(--accent-success)'));
  const or = risk.openRisk || {};
  kartYaz('cardRiskSub', `Düşüş %${dd.toFixed(2)} / %${ddLimit} · açık risk ${paraYaz(or.openRiskUSDT)}`
    + (f.kademe.label && f.kademe.index > 0 ? ` · kademe ${f.kademe.label}` : ''));
}

// Kâğıt test risk ekranı (frenOzeti, populateRiskForm, renderRiskTab …) → js/app/riskEkrani.js

/**
 * Reads the chart's own selectors and (re)loads if anything changed.
 * `force` bypasses the no-change check for the reload button.
 */
function applyChartSelection(force = false) {
  const symEl = document.getElementById('chartSymbolSelect');
  const tfEl = document.getElementById('chartTimeframeSelect');
  const barsEl = document.getElementById('chartBarCount');

  const symbol = (symEl && symEl.value) || chartSymbol || currentConfig.symbol || 'BTC/USDT';
  const timeframe = (tfEl && tfEl.value) || chartTimeframe || currentConfig.timeframe || '1h';
  const bars = parseInt(barsEl && barsEl.value) || 1000;

  if (force) {
    chartSymbol = null;
    chartFailedKey = null;
  } else if (symbol === chartSymbol && timeframe === chartTimeframe && bars === chartBarCount) {
    return;
  }

  chartBarCount = bars;
  loadChartHistory(symbol, timeframe, bars);
}

/**
 * First-load bootstrap only: point the chart at whatever the engine is trading
 * until the user picks something themselves.
 */
function syncChartSelection(state) {
  if (chartSymbol || chartLoading) return;

  const symEl = document.getElementById('chartSymbolSelect');
  if (symEl && !symEl.value) return; // dropdown not populated yet

  applyChartSelection();
}

function updateStats(stats) {
  if (!stats) return;
  lastStats = stats;
  // STATS aynı tick'te TICK'ten sonra geliyor: bütün kartları ikinci kez
  // çizmek yerine yalnız istatistiğe bağlı kart.
  if (sekmeAcik('tab-kagit')) renderRealizedCard();
}

/**
 * Vadeli kontrollerinin görünürlüğü ve kaldıraç uyarısı.
 *
 * Uyarı metni motorun GERÇEK kuralını yansıtır (`riskManager.calculatePositionSize`):
 * likidasyon ≈ %(100/kaldıraç − bakım marjı) uzaktadır ve stop bunun %80'inden
 * genişse motor girişi REDDEDER. Panelde farklı bir eşik göstermek, kullanıcıyı
 * hiç açılmayacak bir kurulumu ayarlamaya iter.
 */
function syncVadeliKontroller() {
  const perp = document.getElementById('selMarketType')?.value === 'perpetual';
  const grp = document.getElementById('grpLeverage');
  if (grp) grp.classList.toggle('is-hidden', !perp);

  const borsa = document.getElementById('selExchangeProvider')?.value || 'binance';
  const note = document.getElementById('txtVenueNote');
  if (note) {
    if (!perp) note.textContent = '';
    else if (borsa === 'bybit') note.textContent = '✔ Bybit: kaldıraç kademeleri public — likidasyon fiyatı kesin hesaplanır.';
    else if (borsa === 'binance') note.textContent = '⚠ Binance: kaldıraç kademeleri API anahtarı ister. Anahtarsız yedek tablo kullanılır (yaklaşık likidasyon).';
    else note.textContent = '⚠ Bu borsa için vadeli desteklenmiyor — spot veriye düşülür.';
  }

  const lev = Math.max(1, Math.min(100, Number(document.getElementById('numLeverage')?.value) || 1));
  const levNote = document.getElementById('txtLeverageNote');
  if (levNote) {
    const bakimPct = 0.5;
    const liqPct = (100 / lev) - bakimPct;
    const maxStop = liqPct * 0.8;
    const el = AG.dom.el;
    if (liqPct > 0) {
      const parcalar = [
        document.createTextNode('Likidasyon ~'),
        el('b', { text: `%${liqPct.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }),
        document.createTextNode(' uzakta. Motor stop mesafesi '),
        el('b', { text: `%${maxStop.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }),
        document.createTextNode(' ve üzerindeki girişleri REDDEDER (stop çalışmadan likidasyon olurdu).')
      ];
      if (lev >= 20) {
        parcalar.push(document.createTextNode(' '));
        parcalar.push(el('span', {
          class: 'tone-danger',
          text: 'Bu kaldıraçta çoğu strateji hiç işlem açamaz.'
        }));
      }
      AG.dom.doldur(levNote, parcalar);
    } else {
      AG.dom.doldur(levNote, [el('span', {
        class: 'tone-danger',
        text: 'Bu kaldıraçta bakım marjı başlangıç marjını aşıyor — giriş yapılamaz.'
      })]);
    }
  }
}

/**
 * Config → formlar.
 *
 * İLK yüklemede kullanıcının "şu anki seçimleri" (bot başlatma stratejisi ve
 * zaman dilimi, backtest borsası/dilimi) config'ten gelir; sonraki
 * CONFIG_UPDATED'ler bunlara DOKUNMAZ — eskiden gösterge kaydı ya da başka
 * sekmedeki bir kayıt Backtest formunu canlı ayara geri çekiyordu.
 * Kayıtlı ayar formları (piyasa, strateji parametreleri, risk, Telegram)
 * kullanıcı onları düzenliyorsa (kirli) ezilmez.
 */
let formlarIlkKez = true;

function populateConfigForms(cfg) {
  if (!cfg) return;
  const ilk = formlarIlkKez;
  formlarIlkKez = false;
  const yaz = (id, v) => { const e = document.getElementById(id); if (e && v !== undefined && v !== null) e.value = v; };

  if (ilk) {
    const dash = document.getElementById('dashSelectStrategy');
    if (dash && cfg.activeStrategy && Array.from(dash.options).some(o => o.value === cfg.activeStrategy)) dash.value = cfg.activeStrategy;
    yaz('dashSelectTimeframe', cfg.timeframe);
    yaz('btTimeframe', cfg.timeframe);
    yaz('btExchangeProvider', cfg.exchange);
    // 62.9: backtest varsayılan stratejisi çalışan bot (Hücum, günlük) — kayıtlı zaman dilimi onunla çelişmesin.
    if (typeof btZamanDilimiUygula === 'function') btZamanDilimiUygula(true);
  }

  if (!kirliFormlar.has('formMarket')) {
    yaz('selExchangeProvider', cfg.exchange || 'binance');
    yaz('selMarketType', (cfg.marketType === 'perpetual' || cfg.marketType === 'perp') ? 'perpetual' : 'spot');
    yaz('numLeverage', Number(cfg.leverage) || 1);
    syncVadeliKontroller();
  }

  if (seciliStrateji && !kirliFormlar.has('formStrategy')) renderStrategyParams(seciliStrateji);

  if (cfg.risk && !kirliFormlar.has('formRisk')) populateRiskForm(cfg.risk);

  if (cfg.telegram && !kirliFormlar.has('formTelegram')) {
    const tg = cfg.telegram;
    const tgEnabled = document.getElementById('chkTgEnabled');
    if (tgEnabled) tgEnabled.checked = !!tg.enabled;
    // Sunucu token'ı hiç göndermez; alan boş kalır, yer tutucu kayıtlı olup olmadığını söyler.
    const tgAlan = document.getElementById('inpTgToken');
    if (tgAlan) {
      tgAlan.value = '';
      tgAlan.placeholder = (cfg.sirlar && cfg.sirlar.telegramBotToken) ? 'kayıtlı — değiştirmek için yeni token yazın' : 'bot token';
    }
    // Ö18 / A-04: sunucu chat id'yi MASKELİ gönderir; alan boş kalır, yer tutucu kayıtlı değeri maskeli gösterir.
    yaz('inpTgChatId', '');
    const tgChat = document.getElementById('inpTgChatId');
    if (tgChat) tgChat.placeholder = tg.chatId ? `kayıtlı: ${tg.chatId} — değiştirmek için yeni chat id yazın` : 'ör. 987654321';
    // Bildirim türleri — varsayılanlar sunucudakiyle aynı
    const tgFlag = (id, key, def) => {
      const el = document.getElementById(id);
      if (el) el.checked = tg[key] !== undefined ? !!tg[key] : def;
    };
    tgFlag('chkTgCritical', 'notifyCritical', true);
    tgFlag('chkTgErrors', 'notifyErrors', true);
    tgFlag('chkTgLifecycle', 'notifyLifecycle', true);
    tgFlag('chkTgTrades', 'notifyTrades', false);
  }

  saglikFormuDoldur(cfg.sirlar || {});
}

/**
 * Sağlık sinyali (healthchecks.io) formu. URL bir SIRdır: sunucu geri göndermez, alan boş kalır,
 * yer tutucu ve durum satırı yalnız "kayıtlı mı" bilgisini gösterir (`config.sirlar`).
 */
function saglikFormuDoldur(sirlar) {
  if (kirliFormlar.has('formSaglik')) return;
  const yer = (id, kayitli, bos) => {
    const a = document.getElementById(id);
    if (a) { a.value = ''; a.placeholder = kayitli ? 'kayıtlı — değiştirmek için yeni URL yapıştırın' : bos; }
  };
  // 68.8: bot başına check — Hücum eski alan, Denge kendi alanı (sirlar.botSaglik.denge)
  const bs = sirlar.botSaglik || {};
  yer('inpHcUrl', sirlar.healthchecksUrl, 'https://hc-ping.com/...');
  yer('inpHcUrlDenge', bs.denge, 'https://hc-ping.com/... (Denge için ayrı check)');
  yer('inpHcSunucuUrl', sirlar.healthchecksSunucuUrl, 'https://hc-ping.com/... (boş bırakılabilir)');
  const d = document.getElementById('txtHcDurum');
  if (!d) return;
  const ozet = saglikDurumMetni(sirlar, null);
  d.textContent = ozet;
  // Son ping (bot başına) sunucudan; okunamazsa yalnız "kayıtlı mı" kalır.
  if (AG.api.saglikDurum) AG.api.saglikDurum().then(s => { if (s && s.success !== false && !kirliFormlar.has('formSaglik')) d.textContent = saglikDurumMetni(sirlar, s); }).catch(() => {});
}

/**
 * Saf: sağlık sinyali durum satırı — her bot ayrı (kayıtlı mı + son ping), sunucu kalp atışı.
 * `s` = GET /api/saglik/durum (68.8: botlar.<ad>; eski sunucuda yalnız bot → Hücum sayılır).
 */
function saglikDurumMetni(sirlar, s) {
  const bs = sirlar.botSaglik || { hucum: !!sirlar.healthchecksUrl };
  const once = (t) => { if (!t) return ''; const dk = Math.round((Date.now() - t) / 60000); return dk < 60 ? `${dk} dk önce` : dk < 2880 ? `${Math.round(dk / 60)} sa önce` : `${Math.round(dk / 1440)} gün önce`; };
  const son = (x) => (x && x.son ? ` · son ping ${once(x.son.zaman)} ${x.son.ok ? 'gönderildi' : 'GÖNDERİLEMEDİ'}` : x && x.ayarli ? ' · henüz ping yok' : '');
  const botlar = (s && s.botlar) || (s && s.bot ? { hucum: s.bot } : {});
  const AD = { hucum: 'Hücum', denge: 'Denge' };
  const parca = Object.keys(AD).map(ad => `${AD[ad]}: ${bs[ad] ? 'kayıtlı ✓' : 'yok'}${son(botlar[ad])}`);
  parca.push(`Sunucu kalp atışı: ${sirlar.healthchecksSunucuUrl ? 'kayıtlı ✓' : 'yok'}${son(s && s.sunucu)}`);
  const eksik = Object.keys(AD).filter(ad => !bs[ad]).map(ad => AD[ad]);
  return parca.join(' · ') + (eksik.length ? ` — ${eksik.join(' ve ')} için URL girilmezse o bot sinyal göndermez (bot etkilenmez; başka botun check'ine de gitmez).` : '');
}

async function saglikKaydet(govde, basari) {
  const r = await AG.api.saglikKaydet(govde);
  if (!r.success) { AG.bildir('Kaydedilemedi: ' + (r.error || `HTTP ${r[AG.api.DURUM]}`), 'hata'); return false; }
  kirliFormlar.delete('formSaglik');
  if (currentConfig) currentConfig.sirlar = r.sirlar;
  saglikFormuDoldur(r.sirlar || {});
  AG.bildir(basari, 'ok');
  return true;
}

// Olay bağlama (bindFormEvents) → js/app/olaylar.js

/**
 * İnce-ayar formundaki değerleri test koşusu için toplar.
 *
 * Eski sürüm 40 satır boyunca arşivlenen stratejilerin `tune*` input
 * id'lerini tek tek okuyordu. Artık değerler formun kendi durumundan gelir;
 * yeni strateji eklemek için buraya dokunmak gerekmez.
 */
function getTunedParametersFromInputs(stratKey) {
  const taban = { ...currentInspectedConfig };
  if (tuneParamState.key === stratKey) return { ...taban, ...tuneParamState.values };
  return taban;
}

function renderBacktestResults(res, targetInfo = '') {
  currentInspectedConfig = res.strategyConfig || {};
  currentInspectedStrategyKey = res.strategyName || document.getElementById('btStrategy')?.value || null;

  const infoEl = document.getElementById('txtBacktestTargetInfo');
  if (infoEl) infoEl.textContent = targetInfo || `${res.strategyName || 'Backtest'} Sonuçları`;

  // Render Date Range near header
  const dateRangeEl = document.getElementById('txtBacktestDateRange');
  if (dateRangeEl && res.equityCurve && res.equityCurve.length > 0) {
    // Mum sayısı TAM seriden (`candleCount`); eğri seyreltilmiş olabilir.
    const v = res.varsayimlar || {};
    const bas = (v.bas || res.equityCurve[0].time || '').slice(0, 10);
    const bit = (v.bit || res.equityCurve[res.equityCurve.length - 1].time || '').slice(0, 10);
    dateRangeEl.textContent = `${bas} → ${bit} · ${(res.candleCount || res.equityCurve.length).toLocaleString('tr-TR')} mum · ${res.timeframe || ''}`;
  }

  /**
   * VADELİ KÜNYESİ — hangi varsayımlarla ölçüldüğü görünmezse rakamlar yanlış
   * okunur. Özellikle `liquidations > 0`: o sonuç stratejiyi değil kaldıracı
   * ölçüyordur ve getiri rakamına bakmanın anlamı kalmaz.
   */
  const perpEl = document.getElementById('txtBacktestPerpNote');
  if (perpEl) {
    if (!res.fundingSource) {
      AG.dom.bosalt(perpEl);
      perpEl.classList.add('is-hidden');
    } else {
      perpEl.classList.remove('is-hidden');
      const el = AG.dom.el;
      const fon = (res.totalFunding || 0).toFixed(2);

      /**
       * Künye parçaları " · " ile ayrılıyor. Ayracı düğümler arasına
       * elle koymak gerekiyor — metin birleştirmede `join` yapan şey buydu.
       */
      const parcalar = [
        [document.createTextNode('⚡ '), el('b', { text: `${res.leverage || 1}x` }),
          document.createTextNode(' kaldıraç')],
        res.fundingSource === 'gercek'
          ? [document.createTextNode('finansman: '), el('b', { text: 'gerçek geçmiş' }),
            document.createTextNode(` ($${fon}${res.totalFunding < 0 ? ' — alındı' : ''})`)]
          : [document.createTextNode('finansman: '),
            el('span', { class: 'tone-warning', text: 'sabit varsayım' }),
            document.createTextNode(` ($${fon})`)],
        res.marginTiersSource === 'borsa'
          ? [document.createTextNode('marj kademeleri: borsadan')]
          : [el('span', { class: 'tone-warning', text: 'marj kademeleri: varsayım (likidasyon yaklaşık)' })]
      ];

      if (res.liquidations > 0) {
        parcalar.push([el('span', {
          class: 'tone-danger fw-bold',
          text: `${res.liquidations} LİKİDASYON — bu sonuç stratejiyi değil kaldıracı ölçüyor`
        })]);
      }

      const dugumler = [];
      parcalar.forEach((p, i) => {
        if (i > 0) dugumler.push(document.createTextNode(' · '));
        p.forEach(n => dugumler.push(n));
      });
      AG.dom.doldur(perpEl, dugumler);
    }
  }

  // Pusula P4: 5 ana sayı + Pine fark uyarısı + TEK ANA GRAFİK (güven bandı + kriz + al-tut) — js/pages/backtestEkran.js.
  if (AG.pages.backtestEkran) AG.pages.backtestEkran.ozetCiz(res);

  // Populate Interactive Parameter Tuning Fields under the Backtest Chart
  renderParameterTuneFields(currentInspectedStrategyKey, currentInspectedConfig);

  if (AG.pages.backtestIs) AG.pages.backtestIs.raporCiz(res);
  // Hücum/Denge: botun tamamı (kol ×3 dahil) ayrı, açıkça etiketli kutuda.
  if (AG.pages.bindirme) AG.pages.bindirme.sonucKutusu(res);

  // Detaylı metrik paneli + fiyat grafiği (giriş/çıkış işaretleriyle)
  if (res.analytics) {
    renderBacktestAnalytics(res.analytics);
    // Analitik modülü spot varsayar ("kaldıraçsız"); vadelide motorun
    // likidasyon sayısı ve kaldıraç gösterilir.
    const v = res.varsayimlar || {};
    // Teminat kullanımı spotta anlamsız (kaldıraç yok): sekme ve grafik yalnız vadelide.
    const perp = v.piyasa === 'perp';
    document.getElementById('anTabMargin')?.classList.toggle('is-hidden', !perp);
    document.getElementById('anMarginBox')?.classList.toggle('is-hidden', !perp);
    if (!perp && document.getElementById('an-cap-margin')?.classList.contains('active')) {
      document.querySelector('[data-an-tab="an-cap-overview"]')?.click();
    }
    const likNot = document.getElementById('anMarginCallsNote');
    if (v.piyasa === 'perp') {
      anSetText('anMarginCalls', String(res.liquidations || 0), (res.liquidations || 0) > 0 ? 'var(--accent-danger)' : null);
      if (likNot) likNot.textContent = `vadeli ${v.kaldirac || 1}x`;
    } else if (likNot) {
      likNot.textContent = 'kaldıraçsız spot';
    }
    renderBacktestPriceChart(res);
  } else {
    const panel = document.getElementById('btAnalyticsPanel');
    if (panel) panel.classList.add('is-hidden');
  }
}

/**
 * Backtest ince-ayar formu — `paramFormuCiz` (kompakt). CANLI CONFIG'İ
 * DEĞİŞTİRMEZ; yalnızca test koşusuna gönderilen `customConfig`i besler.
 */
let tuneParamState = { key: null, values: {} };

function renderParameterTuneFields(strategyKey, cfg) {
  const container = document.getElementById('tuneFieldsContainer');
  const labelEl = document.getElementById('txtTuneStrategyLabel');
  if (!container) return;
  const meta = (strategyCatalog || []).find(s => s.key === strategyKey);
  if (labelEl) labelEl.textContent = `Strateji: ${meta ? meta.label : (strategyKey || '—')}`;
  tuneParamState = {
    key: strategyKey,
    values: paramFormuCiz(container, (meta && meta.params) || {}, cfg, { onek: 'tn', kompakt: true })
  };
}

/**
 * Optimizasyon tablosundaki "Parametreler" sütunu — stratejinin KENDİ
 * şemasından. Eskiden silinmiş stratejiler için elle yazılmıştı ve güncel
 * stratejilerin hepsi uydurma DCA varsayılanları ("TP:%3 · BO:$100 …")
 * gösteriyordu.
 */
function formatParamSummary(stratKey, cfg) {
  if (!cfg || !Object.keys(cfg).length) return 'varsayılan';
  const meta = strategyCatalog.find(s => s.key === stratKey);
  const sema = (meta && meta.params) || {};
  const anahtarlar = Object.keys(sema).length ? Object.keys(sema).filter(k => cfg[k] !== undefined) : Object.keys(cfg);
  const deger = (v) => (typeof v === 'number' ? String(+v.toFixed(4)) : String(v));
  return anahtarlar
    .filter(k => !k.startsWith('__'))
    .map(k => `${(sema[k] && sema[k].label) || k}: ${deger(cfg[k])}`)
    .join(' · ') || 'varsayılan';
}

/**
 * BACKTEST SONUÇ TABLOLARI ARTIK BURADA DEĞİL — `js/pages/backtest.js`.
 *
 * Buradaki sarmalayıcılar panelin kendi işini yapar: paneli görünür kılmak,
 * son sonucu saklamak ve görünüme kaydırmak. Tabloyu modül çizer.
 */
function renderOptimizationResults(optRes) {
  const panel = document.getElementById('optimizerPanel');
  if (!panel || !optRes.rankings) return;

  const stratKey = optRes.strategyName || document.getElementById('btStrategy')?.value || null;
  panel.classList.remove('is-hidden');
  lastOptimizationResults = optRes.rankings;
  // Satırdaki "Backtest Gör" bu sıralamanın stratejisini kullanmalı, formdakini değil.
  lastOptimizationStrategy = stratKey;

  if (AG.pages.backtestEkran) AG.pages.backtestEkran.gorunum('opt');
  AG.pages.backtest.optimizasyonSonuclari(
    optRes.rankings,
    (cfg) => formatParamSummary(stratKey, cfg),
    window.inspectSingleBacktest,
    window.applySingleConfigToSettings
  );

  panel.scrollIntoView({ behavior: 'smooth' });
}

function renderWalkForwardResults(wfRes) {
  const panel = document.getElementById('walkForwardPanel');
  if (!panel || !wfRes) return;

  panel.classList.remove('is-hidden');
  if (AG.pages.backtestEkran) AG.pages.backtestEkran.gorunum('wf');
  AG.pages.backtest.walkForward(wfRes);
  panel.scrollIntoView({ behavior: 'smooth' });
}

function renderWatchlistResults(scanRes) {
  const panel = document.getElementById('watchlistPanel');
  if (!panel || !scanRes.top5Opportunities) return;

  panel.classList.remove('is-hidden');
  lastWatchlistResults = scanRes.top5Opportunities;

  AG.pages.backtest.izlemeTaramasi(
    scanRes.top5Opportunities,
    window.inspectWatchlistBacktest,
    window.applyWatchlistOpportunityToConfig
  );

  panel.scrollIntoView({ behavior: 'smooth' });
}

/** Sonuç kartına kaydır (eskiden kaldırılan eşitlik grafiğine kayıyordu). */
const sonucaKaydir = () => document.getElementById('txtBacktestTargetInfo')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

window.inspectSingleBacktest = async function(idx) {
  if (!lastOptimizationResults[idx]) return;
  const item = lastOptimizationResults[idx];
  const stratKey = lastOptimizationStrategy || document.getElementById('btStrategy')?.value;
  try {
    // Formun tarih aralığı ve piyasasıyla; strateji sıralamanın kendisinden.
    const sonuc = await AG.pages.backtestIs.calistir('tek', { strategyName: stratKey, customConfig: item.config });
    renderBacktestResults(sonuc, `#${idx + 1} sıradaki ayar · ${sonuc.symbol}`);
    sonucaKaydir();
  } catch (e) {
    AG.bildir('Backtest detayı yüklenemedi: ' + e.message);
  }
};

window.inspectWatchlistBacktest = async function(idx) {
  if (!lastWatchlistResults[idx]) return;
  const opp = lastWatchlistResults[idx];
  // Formu adayla eşitle: sonraki "Yeniden test" de aynı veride koşsun.
  const symInput = document.getElementById('btSymbol');
  const stratInput = document.getElementById('btStrategy');
  if (symInput) symInput.value = opp.symbol;
  if (stratInput) stratInput.value = opp.strategyKey;
  sekmeyeGec('tab-backtest');   // tarama Arşiv'de, sonuç Backtest ekranında çizilir
  try {
    const sonuc = await AG.pages.backtestIs.calistir('tek', { strategyName: opp.strategyKey, symbol: opp.symbol, timeframe: opp.timeframe, customConfig: opp.config });
    renderBacktestResults(sonuc, `${opp.symbol} · ${opp.strategyName} (taramadan; tüm aralık — ilk %70 örneklem içi)`);
    sonucaKaydir();
  } catch (e) {
    AG.bildir('Tarama adayı yüklenemedi: ' + e.message);
  }
};

/**
 * Bir stratejinin parametrelerini KAYITLI ayara yazar — yalnız parça.
 * Bot otomatik başlatılmaz; yeni başlatılan botlar bu ayarla çalışır.
 */
async function stratejiAyariYaz(stratKey, cfg, ek = '') {
  const meta = strategyCatalog.find(s => s.key === stratKey);
  try {
    const data = await AG.api.ayarYaz({ strategies: { [stratKey]: cfg } });
    if (!data.success) { AG.bildir('Kaydedilemedi: ' + (data.error || `HTTP ${data[AG.api.DURUM]}`), 'hata'); return false; }
    currentConfig = data.config;
    kirliFormlar.delete('formStrategy');
    if (seciliStrateji === stratKey) renderStrategyParams(stratKey);
    AG.bildir(`✅ ${meta ? meta.label : stratKey} parametreleri kaydedildi${ek}. Bot otomatik başlatılmadı; Arşiv › Kâğıt test ekranından "Kâğıt botları başlat" ile başlatın.`, 'ok');
    return true;
  } catch (err) {
    AG.bildir('Kaydedilemedi: ' + err.message, 'hata');
    return false;
  }
}

/**
 * Optimizasyon satırındaki "Bota yükle": OPTİMİZE EDİLEN stratejiye yazar.
 * Eskiden Strateji sekmesinde o an seçili olan stratejinin kaydına yazıyordu.
 */
window.applySingleConfigToSettings = async function(idx) {
  const item = lastOptimizationResults[idx];
  const stratKey = lastOptimizationStrategy;
  if (!item || !stratKey) return;
  await stratejiAyariYaz(stratKey, item.config, ` (#${idx + 1} sıradaki ayar)`);
};

window.applyWatchlistOpportunityToConfig = async function(idx) {
  const opp = lastWatchlistResults[idx];
  if (!opp) return;
  if (!(await stratejiAyariYaz(opp.strategyKey, opp.config, ` (${opp.symbol} taraması)`))) return;
  // Bot başlatma formunu adaya hazırla: strateji ve zaman dilimi.
  const dash = document.getElementById('dashSelectStrategy');
  if (dash && Array.from(dash.options).some(o => o.value === opp.strategyKey)) dash.value = opp.strategyKey;
  const tfSel = document.getElementById('dashSelectTimeframe');
  if (tfSel && opp.timeframe && Array.from(tfSel.options).some(o => o.value === opp.timeframe)) tfSel.value = opp.timeframe;
};

// Backtest analiz paneli (renderBacktestAnalytics, analiz fiyat grafiği …) → js/app/backtestAnaliz.js