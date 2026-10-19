/**
 * BACKTEST ANALİZ PANELİ — `renderBacktestAnalytics` ve fiyat grafiği
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Ayrıntılı analiz" katı: performans / getiri / işlem / risk sekmeleri, Chart.js grafikleri, analiz
 * fiyat grafiği (işlem işaretleri, ortalama giriş çizgileri, sinyal izi). Tablo kurucusu `js/pages/analiz.js`.
 * Panelde HTML DİZESİ yazan (innerHTML) tek yer burası: `anBar` karşılaştırma çubukları — her `${…}`
 * kaçışlı ya da sayısal, `scripts/panel-denetim.js` XSS bölümü bu dosyayı tarar.
 *
 * ⚠ app.js'İN PARÇASI: app.js ile aynı küreselleri (`currentConfig`, `tonla`, `AN_COLORS` …) kullanır;
 * dışarıya açılan işlevleri app.js ve öteki parçalar adıyla çağırır.
 * Pusula P6'da 4.621 satırlık app.js'ten olduğu gibi taşındı (davranış değişmedi). index.html'de
 * app.js'ten HEMEN SONRA yüklenir; çağrılar DOMContentLoaded'da başladığı için sıra güvenli.
 * Üst düzey kodu yalnız kendi sabitlerini kurar — app.js'teki bir `let`e yükleme anında dokunmaz.
 *
 * KAPSAM (60.2): dosya bir IIFE içinde — üst düzey `let`/`const`/işlevleri artık küresel DEĞİL (başka bir klasik
 * betikte aynı adla `let` yazılırsa "already declared" ile BÜTÜN betik düşerdi). app.js'in küresellerini
 * (`currentConfig`, `tonla`, `AN_COLORS` …) okumaya devam eder. Başka dosyanın kullandığı adlar dosya sonunda
 * `window`a AÇIKÇA verilir (liste `scripts/panel-denetim.js` "js/app kapsamı" bölümünde denetlenir).
 */
(function () {

// ============================================================================
// Gelişmiş Backtest Analizi — render katmanı
// Tüm değerler sunucudaki backtestStats.js çıktısından gelir; burada hesaplama
// yapılmaz, yalnızca biçimlendirilir. Renkler ve bileşenler uygulamanın mevcut
// CSS değişkenleri ve dock sekme/tablo sınıflarıyla aynıdır.
// ============================================================================

let anCharts = {};
let anData = null;

// AN_COLORS / AN_TON dosyanın başında (tema bölümü).

const anMoney = (n, dp = 2) => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
};
const anPct = (n, dp = 2) => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  // B-27 (61.1): tr-TR, eksi yüzde simgesinin önünde ("−%4,50"; eskisi "%-4.50").
  const v = Number(n), y = Math.round(v * Math.pow(10, dp));
  return `${y < 0 ? '−' : ''}%${Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
};
const anNum = (n, dp = 2) => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
const anSigned = (n) => (Number(n) >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)');

function anSetText(id, text, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  if (color) tonla(el, color);
}

function anDestroy(key) {
  if (anCharts[key]) { anCharts[key].destroy(); delete anCharts[key]; }
}

/** Ortak Chart.js görünümü — uygulamanın renk değişkenleriyle aynı. */
function anChartBase(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: AN_COLORS.surface,
        borderColor: AN_COLORS.border,
        borderWidth: 1,
        titleColor: AN_COLORS.strong,
        bodyColor: AN_COLORS.soft
      },
      ...(extra.plugins || {})
    },
    scales: extra.scales !== undefined ? extra.scales : {
      x: { grid: { color: AN_COLORS.grid }, ticks: { color: AN_COLORS.muted, maxTicksLimit: 8 } },
      y: { grid: { color: AN_COLORS.grid }, ticks: { color: AN_COLORS.muted } }
    }
  };
}

/** Metrik tablosu: [{label, values:[...], color?}] — dock-table stilinde. */
/**
 * ANALİZ TABLOSU ARTIK BURADA DEĞİL — `js/pages/analiz.js`.
 * Hücre renkleri `AG.fmt.renkTonu` ile ton sınıfına çevriliyor.
 */
const anRenderTable = (tableId, headers, rows) =>
  AG.pages.analiz.tablo(tableId, headers, rows);

/** Yatay karşılaştırma çubuğu. */
/** Bilinen renk ton sınıfına çevrilir; tanınmayan (saydam) renk boş döner. */
const anTonSinifi = (color) => AG.fmt.renkTonu(color) || '';

function anBar(label, value, max, color, formatter) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return `
    <div class="an-bar">
      <div class="an-bar-head">
        <span class="bt-metric-label">${label}</span>
        <span class="fw-bold ${anTonSinifi(color)}">${formatter(value)}</span>
      </div>
      <div class="bt-bar-track"><div class="bt-bar-fill" style="width:${pct}%; background:${color};"></div></div>
    </div>`;
}

// ---------------------------------------------------------------------------

function renderBacktestAnalytics(analytics) {
  const panel = document.getElementById('btAnalyticsPanel');
  if (!panel || !analytics) return;

  anData = analytics;
  panel.classList.remove('is-hidden');

  const r = analytics.returns;
  const t = analytics.trades;
  const x = analytics.excursions;
  const c = analytics.capital;

  // Özet sayılar (toplam K/Z, düşüş, kazanma, kâr faktörü, Sharpe, beklenti)
  // sonuç kartının üstündeki tek şeritte; burada tekrarlanmaz.
  renderAnPerformanceChart();
  renderAnTimeStrip(analytics.series);

  // ---- 2. Return details --------------------------------------------------
  anSetText('anOpenPnl', anMoney(r.openPnl), anSigned(r.openPnl));
  anSetText('anAlpha', anMoney(r.alphaAbs), anSigned(r.alphaAbs));
  anSetText('anAlphaPct', anPct(r.alphaPct), anSigned(r.alphaPct));

  const ps = r.profitStructure;
  anDestroy('profitStruct');
  const psCtx = document.getElementById('anProfitStructChart');
  if (psCtx) {
    anCharts.profitStruct = new Chart(psCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Toplam kâr', 'Açık pozisyon kâr/zararı', 'Toplam zarar', 'Komisyon', 'Toplam kâr/zarar'],
        datasets: [{
          data: [ps.grossProfit, ps.openPnl, ps.grossLoss, ps.commission, ps.totalPnl],
          backgroundColor: [AN_COLORS.success, AN_COLORS.cyan, AN_COLORS.danger, AN_COLORS.warning, AN_COLORS.primary],
          borderRadius: 4
        }]
      },
      options: anChartBase({
        scales: {
          x: { grid: { display: false }, ticks: { color: AN_COLORS.muted, font: { size: 10 } } },
          y: { grid: { color: AN_COLORS.grid }, ticks: { color: AN_COLORS.muted, callback: (v) => anMoney(v, 0) } }
        }
      })
    });
  }

  const br = r.benchmarkRange;
  const brMax = Math.max(1, ...[br.strategy.max, br.strategy.min, br.buyHold.max, br.buyHold.min].map(Math.abs));
  const brBox = document.getElementById('anBenchRange');
  if (brBox) {
    const row = (title, o, color) => `
      <div class="an-bar-group">
        <div class="an-bar-title ${anTonSinifi(color)}">${title}</div>
        ${anBar('Maksimum', o.max, brMax, AN_TON.success, (v) => anPct(v))}
        ${anBar('Mevcut', o.current, brMax, color, (v) => anPct(v))}
        ${anBar('Minimum', o.min, brMax, AN_TON.danger, (v) => anPct(v))}
      </div>`;
    brBox.innerHTML = row('Strateji kâr/zararı', br.strategy, AN_TON.primary)
      + row('Al-tut kâr/zararı', br.buyHold, AN_TON.cyan);
  }

  const e = r.earnings;
  // Uzun-yönlü (long-only) simülasyon: her işlem alış tarafındadır.
  anRenderTable('anTblEarnings', ['Metrik', 'Tümü', 'Alış', 'Satış'], [
    { label: 'Başlangıç sermayesi', values: [anMoney(e.initialCapital), anMoney(e.initialCapital), '—'] },
    { label: 'Açık pozisyon kâr/zararı', values: [{ text: anMoney(e.openPnl), color: anSigned(e.openPnl) }, { text: anMoney(e.openPnl), color: anSigned(e.openPnl) }, '—'] },
    { label: 'Net PnL', values: [{ text: anMoney(e.netPnl), color: anSigned(e.netPnl) }, { text: anMoney(e.netPnl), color: anSigned(e.netPnl) }, '—'] },
    { label: 'Brüt kâr', values: [{ text: anMoney(e.grossProfit), color: AN_TON.success }, { text: anMoney(e.grossProfit), color: AN_TON.success }, '—'] },
    { label: 'Brüt zarar', values: [{ text: anMoney(e.grossLoss), color: AN_TON.danger }, { text: anMoney(e.grossLoss), color: AN_TON.danger }, '—'] },
    { label: 'Kâr faktörü', values: [e.profitFactor === null ? '∞' : anNum(e.profitFactor), e.profitFactor === null ? '∞' : anNum(e.profitFactor), '—'] },
    { label: 'Ödenen komisyon', values: [anMoney(e.commission), anMoney(e.commission), '—'] },
    { label: 'Beklenen getiri', values: [{ text: anMoney(e.expectancy), color: anSigned(e.expectancy) }, { text: anMoney(e.expectancy), color: anSigned(e.expectancy) }, '—'], hint: 'işlem başına' }
  ]);

  const bm = r.benchmarking;
  anRenderTable('anTblBench', ['Metrik', 'Tümü'], [
    { label: 'Al-tut kâr/zararı', values: [{ text: anMoney(bm.buyHoldPnl), color: anSigned(bm.buyHoldPnl) }] },
    { label: 'Al-tut getirisi %', values: [{ text: anPct(bm.buyHoldPct), color: anSigned(bm.buyHoldPct) }] },
    { label: 'Strateji üstün performansı', values: [{ text: anMoney(bm.alphaAbs), color: anSigned(bm.alphaAbs) }] },
    { label: 'Strateji üstün performansı %', values: [{ text: anPct(bm.alphaPct), color: anSigned(bm.alphaPct) }] }
  ]);

  anRenderTable('anTblRisk', ['Metrik', 'Tümü'], [
    { label: 'Sharpe oranı', values: [{ text: anNum(r.sharpe), color: anSigned(r.sharpe) }], hint: 'yıllıklandırılmış' },
    { label: 'Sortino oranı', values: [{ text: anNum(r.sortino), color: anSigned(r.sortino) }], hint: 'yalnızca aşağı yönlü sapma' }
  ]);

  // ---- 3. Trade analysis --------------------------------------------------
  anSetText('anAvgPnl', anMoney(t.avgPnl), anSigned(t.avgPnl));
  anSetText('anAvgBars', anNum(t.avgBars, 1));
  anSetText('anLargestProfit', anMoney(t.largestProfit));
  anSetText('anLargestLoss', anMoney(t.largestLoss));

  anDestroy('hist');
  const hCtx = document.getElementById('anHistChart');
  if (hCtx) {
    anCharts.hist = new Chart(hCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: t.histogram.map(b => b.label),
        datasets: [{
          data: t.histogram.map(b => b.count),
          backgroundColor: t.histogram.map(b => (b.to <= 0 ? saydam(AN_COLORS.danger, 0.65) : saydam(AN_COLORS.success, 0.65))),
          borderRadius: 3
        }]
      },
      options: anChartBase({
        plugins: {
          tooltip: {
            callbacks: {
              afterBody: () => [
                `Ort. kâr: ${anPct(t.avgProfitPct)}`,
                `Ort. zarar: ${anPct(t.avgLossPct)}`
              ]
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: AN_COLORS.muted, font: { size: 9 }, maxRotation: 60, minRotation: 45 } },
          y: { grid: { color: AN_COLORS.grid }, ticks: { color: AN_COLORS.muted, precision: 0 }, title: { display: true, text: 'İşlem sayısı', color: AN_COLORS.muted, font: { size: 10 } } }
        }
      })
    });
  }

  const d = t.distribution;
  anDestroy('donut');
  const dCtx = document.getElementById('anDonutChart');
  if (dCtx) {
    anCharts.donut = new Chart(dCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Kazanan', 'Kaybeden', 'Başa baş'],
        datasets: [{
          data: [d.winners, d.losers, d.breakevens],
          backgroundColor: [AN_COLORS.success, AN_COLORS.danger, AN_COLORS.muted],
          borderColor: AN_COLORS.surface,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: true, position: 'bottom', labels: { color: AN_COLORS.muted, font: { size: 10 }, boxWidth: 10 } },
          tooltip: {
            backgroundColor: AN_COLORS.surface,
            callbacks: {
              label: (ctx) => {
                const pctv = d.total > 0 ? ((ctx.raw / d.total) * 100).toFixed(1) : '0.0';
                return `${ctx.label}: ${ctx.raw} (%${pctv})`;
              }
            }
          },
          // Halkanın merkezine toplam işlem sayısı
          totalLabel: { total: d.total }
        }
      },
      plugins: [{
        id: 'totalLabel',
        afterDraw(chart) {
          const { ctx, chartArea } = chart;
          if (!chartArea) return;
          const cx = (chartArea.left + chartArea.right) / 2;
          const cy = (chartArea.top + chartArea.bottom) / 2;
          ctx.save();
          ctx.textAlign = 'center';
          ctx.fillStyle = AN_COLORS.strong;
          ctx.font = '700 22px Inter, sans-serif';
          ctx.fillText(String(d.total), cx, cy);
          ctx.fillStyle = AN_COLORS.muted;
          ctx.font = '500 10px Inter, sans-serif';
          ctx.fillText('TOPLAM İŞLEM', cx, cy + 16);
          ctx.restore();
        }
      }]
    });
  }

  const td = t.detail;
  anRenderTable('anTblTradeDetail', ['Metrik', 'Tümü', 'Alış', 'Satış'], [
    { label: 'Toplam işlemler', values: [td.totalTrades, td.totalTrades, '—'] },
    { label: 'Toplam açık işlemler', values: [td.openTrades, td.openTrades, '—'] },
    { label: 'Kazanan işlem', values: [{ text: td.winners, color: AN_TON.success }, { text: td.winners, color: AN_TON.success }, '—'] },
    { label: 'Kaybeden işlem', values: [{ text: td.losers, color: AN_TON.danger }, { text: td.losers, color: AN_TON.danger }, '—'] },
    { label: 'Karlılık yüzdesi', values: [anPct(td.winRate), anPct(td.winRate), '—'] },
    { section: 'Ortalamalar' },
    { label: 'Ortalama kâr/zarar', values: [{ text: anMoney(td.avgPnl), color: anSigned(td.avgPnl) }, { text: anMoney(td.avgPnl), color: anSigned(td.avgPnl) }, '—'] },
    { label: 'Ortalama kâr', values: [{ text: anMoney(td.avgProfit), color: AN_TON.success }, { text: anMoney(td.avgProfit), color: AN_TON.success }, '—'] },
    { label: 'Ortalama zarar', values: [{ text: anMoney(td.avgLoss), color: AN_TON.danger }, { text: anMoney(td.avgLoss), color: AN_TON.danger }, '—'] },
    { label: 'Ortalama kâr / ortalama zarar', values: [anNum(td.profitLossRatio), anNum(td.profitLossRatio), '—'] },
    { section: 'Uç değerler' },
    { label: 'En büyük kâr', values: [{ text: anMoney(td.largestProfit), color: AN_TON.success }, { text: anMoney(td.largestProfit), color: AN_TON.success }, '—'] },
    { label: 'En büyük kâr %', values: [anPct(td.largestProfitPct), anPct(td.largestProfitPct), '—'], hint: 'brüt kâra oranı: ' + anPct(td.largestProfitShare) },
    { label: 'En büyük zarar', values: [{ text: anMoney(td.largestLoss), color: AN_TON.danger }, { text: anMoney(td.largestLoss), color: AN_TON.danger }, '—'] },
    { label: 'En büyük zarar %', values: [anPct(td.largestLossPct), anPct(td.largestLossPct), '—'], hint: 'brüt zarara oranı: ' + anPct(td.largestLossShare) },
    { label: 'Aykırı işlemler', values: [`${td.outlierCount} adet`, `${td.outlierCount} adet`, '—'], hint: 'K/Z: ' + anMoney(td.outlierAmount) },
    { section: 'Süre (bar)' },
    { label: 'Ortalama işlem süresi (bar)', values: [anNum(td.avgBarsAll, 1), anNum(td.avgBarsAll, 1), '—'] },
    { label: 'Kazananlarda ortalama süre (bar)', values: [anNum(td.avgBarsWinners, 1), anNum(td.avgBarsWinners, 1), '—'] },
    { label: 'Kaybedenlerde ortalama süre (bar)', values: [anNum(td.avgBarsLosers, 1), anNum(td.avgBarsLosers, 1), '—'] }
  ]);

  // ---- 4. Run-ups & drawdowns --------------------------------------------
  anSetText('anAvgRuDur', anNum(x.avgRunUpDuration, 1));
  anSetText('anAvgDdDur', anNum(x.avgDrawdownDuration, 1));
  anSetText('anDdOfInitial', anPct(x.maxDrawdownPctOfInitial), 'var(--accent-danger)');
  anSetText('anReturnOfDd', anNum(x.returnOfMaxDrawdown), anSigned(x.returnOfMaxDrawdown));

  anDestroy('excursion');
  const exCtx = document.getElementById('anExChart');
  if (exCtx) {
    anCharts.excursion = new Chart(exCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Yükseliş', 'Düşüş', 'Mevcut düşüş'],
        datasets: [{
          data: [x.bars.runUp, -x.bars.drawdown, -x.bars.currentDrawdown],
          backgroundColor: [AN_COLORS.success, AN_COLORS.danger, AN_COLORS.warning],
          borderRadius: 4
        }]
      },
      options: anChartBase({
        scales: {
          x: { grid: { display: false }, ticks: { color: AN_COLORS.muted, font: { size: 10 } } },
          y: { grid: { color: AN_COLORS.grid }, ticks: { color: AN_COLORS.muted, callback: (v) => anMoney(v, 0) } }
        }
      })
    });
  }

  const cmp = x.comparison;
  const cmpMax = Math.max(1, cmp.runUpMax, cmp.drawdownMax);
  const exBars = document.getElementById('anExBars');
  if (exBars) {
    exBars.innerHTML =
      `<div class="an-bar-title tone-success">Yükseliş</div>`
      + anBar('Maksimum', cmp.runUpMax, cmpMax, AN_TON.success, (v) => anMoney(v))
      + anBar('Ortalama', cmp.runUpAvg, cmpMax, saydam(AN_COLORS.success, 0.6), (v) => anMoney(v))
      + `<div class="an-bar-title an-bar-title-gap tone-danger">Düşüş</div>`
      + anBar('Maksimum', cmp.drawdownMax, cmpMax, AN_TON.danger, (v) => anMoney(v))
      + anBar('Ortalama', cmp.drawdownAvg, cmpMax, saydam(AN_COLORS.danger, 0.6), (v) => anMoney(v))
      + anBar('Güncel', cmp.drawdownCurrent, cmpMax, AN_TON.warning, (v) => anMoney(v));
  }

  const ru = x.runUpTable;
  anRenderTable('anTblRunUp', ['Metrik', 'Tümü'], [
    { label: 'Ortalama yükseliş süresi', values: [`${anNum(ru.avgDuration, 1)} bar`], hint: 'kapanıştan kapanışa' },
    { label: 'Ortalama yükseliş', values: [{ text: anMoney(ru.avgRunUp), color: AN_TON.success }], hint: 'kapanıştan kapanışa' },
    { label: 'En büyük yükseliş', values: [{ text: anMoney(ru.maxRunUpClose), color: AN_TON.success }], hint: 'kapanıştan kapanışa' },
    { label: 'En büyük yükseliş', values: [{ text: anMoney(ru.maxRunUpIntrabar), color: AN_TON.success }], hint: 'bar içi' },
    { label: 'En büyük yükseliş / başlangıç sermayesi', values: [anPct(ru.maxRunUpPctOfInitial)], hint: 'bar içi' }
  ]);

  const dd = x.drawdownTable;
  anRenderTable('anTblDd', ['Metrik', 'Tümü'], [
    { label: 'Ortalama düşüş süresi', values: [`${anNum(dd.avgDuration, 1)} bar`], hint: 'kapanıştan kapanışa' },
    { label: 'Ortalama düşüş', values: [{ text: anMoney(dd.avgDrawdown), color: AN_TON.danger }], hint: 'kapanıştan kapanışa' },
    { label: 'En büyük düşüş', values: [{ text: anMoney(dd.maxDrawdownClose), color: AN_TON.danger }], hint: 'kapanıştan kapanışa' },
    { label: 'En büyük düşüş', values: [{ text: anMoney(dd.maxDrawdownIntrabar), color: AN_TON.danger }], hint: 'bar içi' },
    { label: 'En büyük düşüş / başlangıç sermayesi', values: [anPct(dd.maxDrawdownPctOfInitial)], hint: 'bar içi' },
    { label: 'Getiri / en büyük düşüş', values: [{ text: anNum(dd.returnOfMaxDrawdown), color: anSigned(dd.returnOfMaxDrawdown) }], hint: 'Total PnL / max drawdown' }
  ]);

  // ---- 5. Capital efficiency ---------------------------------------------
  anSetText('anCagr', c.cagr === null ? '—' : anPct(c.cagr), c.cagr === null ? 'var(--text-muted)' : anSigned(c.cagr));
  anSetText('anCagrNote', c.cagrNote || `${c.coveredDays} günlük veri`);
  anSetText('anReqAccount', anMoney(c.requiredAccountSize));
  anSetText('anReturnInitial', anPct(c.returnOnInitial), anSigned(c.returnOnInitial));
  anSetText('anMarginCalls', String(c.marginCalls));

  anDestroy('margin');
  const mCtx = document.getElementById('anMarginChart');
  if (mCtx) {
    anCharts.margin = new Chart(mCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels: analytics.series.time,
        datasets: [{
          data: c.marginSeries,
          borderColor: AN_COLORS.cyan,
          backgroundColor: saydam(AN_COLORS.cyan, 0.15),
          borderWidth: 1.5,
          fill: true,
          pointRadius: 0,
          tension: 0.2
        }]
      },
      options: anChartBase({
        scales: {
          x: { grid: { color: AN_COLORS.grid }, ticks: { color: AN_COLORS.muted, maxTicksLimit: 8, callback: function (v) { const l = this.getLabelForValue(v); return l ? String(l).slice(0, 10) : ''; } } },
          y: { min: 0, max: 100, grid: { color: AN_COLORS.grid }, ticks: { color: AN_COLORS.muted, callback: (v) => v + '%' } }
        }
      })
    });
  }

  const cu = c.usage;
  anRenderTable('anTblCapUsage', ['Metrik', 'Tümü', 'Alış', 'Satış'], [
    { label: 'Yıllıklandırılmış getiri (CAGR)', values: [c.cagr === null ? '—' : anPct(c.cagr), c.cagr === null ? '—' : anPct(c.cagr), '—'], hint: c.cagr === null ? c.cagrNote : `${c.coveredDays} gün` },
    { label: 'Başlangıç sermayesi getirisi', values: [{ text: anPct(c.returnOnInitial), color: anSigned(c.returnOnInitial) }, { text: anPct(c.returnOnInitial), color: anSigned(c.returnOnInitial) }, '—'] },
    { label: 'Gerekli hesap büyüklüğü', values: [anMoney(c.requiredAccountSize), anMoney(c.requiredAccountSize), '—'], hint: 'maks. kullanılan sermaye + maks. düşüş' },
    { label: 'Gerekli hesap büyüklüğü getirisi', values: [{ text: anPct(c.returnOnRequired), color: anSigned(c.returnOnRequired) }, { text: anPct(c.returnOnRequired), color: anSigned(c.returnOnRequired) }, '—'] },
    { label: 'Net PnL / en büyük zarar', values: [anPct(c.netPnlVsLargestLoss), anPct(c.netPnlVsLargestLoss), '—'] }
  ]);

  anRenderTable('anTblMargin', ['Metrik', 'Tümü'], [
    { label: 'Ortalama kullanılan teminat', values: [anMoney(cu.avgMarginUsed)], hint: 'pozisyona bağlanan ortalama sermaye' },
    { label: 'Kullanılan maks. marjin', values: [anMoney(cu.maxMarginUsed)] },
    { label: 'Marjin verimliliği', values: [{ text: anNum(cu.marginEfficiency, 4), color: anSigned(cu.marginEfficiency) }], hint: 'Total PnL / maks. marjin' },
    { label: 'Marjin çağrıları', values: [String(cu.marginCalls)], hint: c.leverage },
    { label: 'Toplam tasfiye edilen hacim', values: [anMoney(cu.liquidatedVolume)], hint: 'kaldıraç yok — tasfiye oluşmaz' },
    { label: 'En büyük tasfiye edilen hacim', values: [anMoney(cu.largestLiquidation)], hint: 'kaldıraç yok — tasfiye oluşmaz' }
  ]);

  if (window.lucide) lucide.createIcons();
}

/** Performans grafiği — sol menüdeki görünürlük seçeneklerine göre kurulur. */
function renderAnPerformanceChart() {
  if (!anData) return;
  const ctx = document.getElementById('anPerfChart');
  if (!ctx) return;

  const s = anData.series;
  const on = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
  const datasets = [];

  if (on('anTogCum')) {
    datasets.push({
      label: 'Birikimli kâr/zarar',
      data: s.cumulativePnl,
      borderColor: AN_COLORS.primary,
      backgroundColor: saydam(AN_COLORS.primary, 0.15),
      borderWidth: 2, fill: true, pointRadius: 0, tension: 0.15
    });
  }
  if (on('anTogBh')) {
    datasets.push({
      label: 'Al-tut',
      data: s.buyHold,
      borderColor: AN_COLORS.cyan,
      borderWidth: 1.5, borderDash: [5, 4], fill: false, pointRadius: 0, tension: 0.15
    });
  }
  if (on('anTogRuns')) {
    datasets.push({
      label: 'Yükseliş (koşan dipten)',
      data: s.runUp,
      borderColor: saydam(AN_COLORS.success, 0.55),
      backgroundColor: saydam(AN_COLORS.success, 0.1),
      borderWidth: 1, fill: true, pointRadius: 0, tension: 0.1
    });
    datasets.push({
      label: 'Düşüş (koşan tepeden)',
      // Yeni rapor düşüşü zaten ≤ 0 verir (özsermaye − koşan tepe); eski
      // yol pozitif (close − low) verirdi. İkisi de aşağı çizilsin.
      data: s.drawdown.map(v => (v > 0 ? -v : v)),
      borderColor: saydam(AN_COLORS.danger, 0.55),
      backgroundColor: saydam(AN_COLORS.danger, 0.1),
      borderWidth: 1, fill: true, pointRadius: 0, tension: 0.1
    });
  }
  if (on('anTogTrades')) {
    // Bar bazlı PnL değişimi = işlem sapmaları
    const deltas = s.cumulativePnl.map((v, i) => (i === 0 ? 0 : +(v - s.cumulativePnl[i - 1]).toFixed(2)));
    datasets.push({
      type: 'bar',
      label: 'İşlem sapmaları',
      data: deltas,
      backgroundColor: deltas.map(v => (v >= 0 ? saydam(AN_COLORS.success, 0.5) : saydam(AN_COLORS.danger, 0.5))),
      borderWidth: 0
    });
  }

  anDestroy('perf');
  anCharts.perf = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { labels: s.time, datasets },
    options: anChartBase({
      plugins: {
        legend: { display: true, position: 'top', labels: { color: AN_COLORS.muted, font: { size: 10 }, boxWidth: 12 } }
      },
      scales: {
        x: { grid: { color: AN_COLORS.grid }, ticks: { color: AN_COLORS.muted, maxTicksLimit: 10, callback: function (v) { const l = this.getLabelForValue(v); return l ? String(l).slice(0, 10) : ''; } } },
        y: { grid: { color: AN_COLORS.grid }, ticks: { color: AN_COLORS.muted, callback: (v) => anMoney(v, 0) } }
      }
    })
  });
}

/** Zaman şeridi: her bar için kârlı (yeşil) / zararlı (kırmızı) dönem bandı. */
function renderAnTimeStrip(series) {
  if (!series || !series.cumulativePnl || !series.cumulativePnl.length) return;
  AG.pages.analiz.zamanSeridi(series);
  const t = series.time;
  anSetText('anStripStart', t.length ? String(t[0]).slice(0, 10) : '—');
  anSetText('anStripEnd', t.length ? String(t[t.length - 1]).slice(0, 10) : '—');
}

/** Analiz paneli alt sekmeleri — dock sekme sistemiyle aynı davranış. */
function initAnalyticsTabs() {
  document.querySelectorAll('[data-an-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-an-tab');
      const group = btn.closest('.dock-tabs');
      if (!group) return;

      group.querySelectorAll('[data-an-tab]').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });

      const container = group.parentElement;
      container.querySelectorAll(':scope > .dock-tab-pane').forEach(p => p.classList.remove('active'));
      const pane = document.getElementById(targetId);
      if (pane) pane.classList.add('active');
    });
  });

  ['anTogCum', 'anTogBh', 'anTogTrades', 'anTogRuns'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderAnPerformanceChart);
  });
}

// ---------------------------------------------------------------------------
// Backtest fiyat grafiği — canlı izleme ekranındaki Lightweight Charts
// kurulumunun aynısı. Üzerine backtestin ürettiği tüm giriş ve çıkışlar
// işaretlenir; grafiğin tamamı görünecek şekilde ölçeklenir.
// ---------------------------------------------------------------------------

let anPriceChart = null;
let anPriceSeries = null;
let anVolumeSeries = null;
let anPriceMarkersApi = null;
let anPriceLines = [];
let anLastResult = null;

function initAnalyticsPriceChart() {
  const container = document.getElementById('anPriceChartContainer');
  if (!container || !window.LightweightCharts || anPriceChart) return;

  try {
    anPriceChart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: lwTema().layout,
      grid: lwTema().grid,
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: AN_COLORS.border,
        scaleMargins: { top: 0.08, bottom: 0.26 }
      },
      timeScale: {
        borderColor: AN_COLORS.border,
        timeVisible: true,
        secondsVisible: false
      }
    });

    const seriesOptions = {
      ...mumRenkleri(),
      borderVisible: false
    };

    if (typeof anPriceChart.addCandlestickSeries === 'function') {
      anPriceSeries = anPriceChart.addCandlestickSeries(seriesOptions);
    } else if (LightweightCharts.CandlestickSeries) {
      anPriceSeries = anPriceChart.addSeries(LightweightCharts.CandlestickSeries, seriesOptions);
    } else {
      anPriceSeries = anPriceChart.addLineSeries({ color: AN_COLORS.primary, lineWidth: 2 });
    }

    try {
      const volOptions = { priceFormat: { type: 'volume' }, priceScaleId: 'volume' };
      if (typeof anPriceChart.addHistogramSeries === 'function') {
        anVolumeSeries = anPriceChart.addHistogramSeries(volOptions);
      } else if (LightweightCharts.HistogramSeries) {
        anVolumeSeries = anPriceChart.addSeries(LightweightCharts.HistogramSeries, volOptions);
      }
      if (anVolumeSeries) {
        anPriceChart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      }
    } catch (volErr) {
      anVolumeSeries = null;
    }

    window.addEventListener('resize', () => {
      if (anPriceChart && container.clientWidth > 0) {
        anPriceChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
      }
    });
  } catch (err) {
    console.error('Backtest fiyat grafiği kurulamadı:', err);
  }
}

/** Backtest sonucundaki sembol/zaman dilimi için mumları yükler ve işaretler. */
async function renderBacktestPriceChart(result) {
  if (!result) return;
  anLastResult = result;

  initAnalyticsPriceChart();
  if (!anPriceSeries) return;

  // Gösterge katmanı grafikle aynı anda kurulur; işlem okları bundan sonra
  // katman üzerinden basılır (aksi halde biri diğerini siler).
  if (anPriceChart && !btIndicatorLayer && window.ChartIndicators) {
    btIndicatorLayer = ChartIndicators.create(anPriceChart, anPriceSeries, {});
  }

  const symbol = result.symbol || document.getElementById('btSymbol')?.value || currentConfig.symbol || 'BTC/USDT';
  const timeframe = result.timeframe || document.getElementById('btTimeframe')?.value || '1h';
  const limit = Math.min(Math.max(result.candleCount || 500, 30), 5000);

  // Göstergeler backtestin GÖRDÜĞÜ seriyle birebir aynı parametrelerle
  // hesaplanmalı; farklı uzunluk seçmek barları kaydırır.
  btChartContext = { symbol, timeframe, limit };

  const info = document.getElementById('anChartInfo');
  if (info) info.textContent = `${symbol} · ${timeframe} · yükleniyor...`;

  try {
    // JSON olmayan gövde `AG.api` tarafında istisnaya çevriliyor; aşağıdaki
    // `catch` onu yakalayıp aynı mesajı gösteriyor.
    /**
     * Backtestin KENDİ dönemi: sunucu sonuca ≤5000 bara toplanmış mumları
     * koyuyor (`result.fiyat`). Eskiden burada ayrı istekle EN SON 5000 mum
     * çekiliyordu — tarih aralıklı koşuda grafik başka bir dönemi gösterirdi.
     */
    let data;
    if (result.fiyat && Array.isArray(result.fiyat.mumlar) && result.fiyat.mumlar.length) {
      data = { success: true, candles: result.fiyat.mumlar.map(m => ({ ...m, time: m.time * 1000, volume: 0 })) };
    } else {
      data = await AG.api.mumlar(symbol, timeframe, limit);
    }
    if (!data.success || !Array.isArray(data.candles) || data.candles.length === 0) {
      if (info) info.textContent = data.error || 'Mum verisi alınamadı';
      return;
    }

    const bars = data.candles
      .map(c => ({
        time: Math.floor(c.time / 1000),
        open: c.open, high: c.high, low: c.low, close: c.close,
        volume: c.volume || 0
      }))
      .filter(b => Number.isFinite(b.time) && Number.isFinite(b.close))
      .sort((a, b) => a.time - b.time);

    anPriceSeries.setData(bars.map(({ volume, ...bar }) => bar));

    if (anVolumeSeries) {
      anVolumeSeries.setData(bars.map(b => ({
        time: b.time,
        value: b.volume,
        color: b.close >= b.open ? saydam(AN_COLORS.success, 0.4) : saydam(AN_COLORS.danger, 0.4)
      })));
    }

    renderBacktestTradeMarkers(result, (result.fiyat && result.fiyat.tf) || timeframe);
    renderBacktestTradeLevels(result);
    renderSignalTrace(result);

    // Tüm test aralığı görünsün
    if (anPriceChart) anPriceChart.timeScale().fitContent();

    // Short kapanışı COVER etiketiyle gelir; yalnız 'SELL' saymak perpetual
    // koşularında çıkışları sıfır gösteriyordu.
    const closed = (result.trades || []).filter(t => /^(SELL|COVER)/.test(String(t.type))).length;
    const opens = (result.trades || []).filter(t => String(t.type) === 'BUY' || String(t.type) === 'SHORT').length;
    const grafikTf = (result.fiyat && result.fiyat.tf) || timeframe;
    if (info) info.textContent = `${symbol} · ${grafikTf}${grafikTf !== timeframe ? ` (koşu ${timeframe}, grafik toplandı)` : ''} · ${bars.length} mum · ${opens} giriş / ${closed} çıkış`;

    refreshBtIndicators();
  } catch (err) {
    if (info) info.textContent = 'Grafik yüklenemedi: ' + err.message;
  }
}

/**
 * Backtestin ürettiği her giriş ve çıkışı mum grafiğine işaretler.
 * Zaman damgası mumun kovasına yuvarlanır, böylece işaretler gerçek barlara oturur.
 */
function renderBacktestTradeMarkers(result, timeframe) {
  if (!anPriceSeries) return;

  const show = document.getElementById('anTogMarkers');
  const enabled = show ? show.checked : true;
  const trades = result.trades || [];

  const markers = [];

  if (enabled) {
    // Çok işlemde etiket metinleri üst üste biner ve grafik yavaşlar:
    // 80'in üstünde yalnız ok/şekil çizilir; fiyat ve kâr işlem listesinde.
    const etiket = trades.length <= 80;
    trades.forEach(t => {
      const tur = String(t.type);
      // SHORT girişi de giriştir; eskiden yalnız 'BUY' giriş sayılıyor, SHORT
      // kaydında exitTime olmadığı için işaret hiç çizilmiyordu.
      const isBuy = tur === 'BUY';
      const isShort = tur === 'SHORT';
      const isOpen = tur === 'OPEN';
      const stamp = isBuy || isShort || isOpen ? t.entryTime : t.exitTime;
      const ms = Date.parse(stamp);
      if (!Number.isFinite(ms)) return;

      const time = bucketStart(Math.floor(ms / 1000), timeframe);
      const price = isBuy || isShort || isOpen ? t.entryPrice : t.exitPrice;
      const pnl = t.profitUSDT || 0;
      const fiyatYazi = Number(price).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

      if (isShort) {
        markers.push({ time, position: 'aboveBar', shape: 'arrowDown', color: AN_COLORS.warning, text: etiket ? `SHORT ${fiyatYazi}` : '' });
        return;
      }
      if (isBuy) {
        markers.push({
          time,
          position: 'belowBar',
          shape: 'arrowUp',
          color: AN_COLORS.success,
          text: etiket ? `AL ${fiyatYazi}` : ''
        });
      } else if (isOpen) {
        markers.push({
          time,
          position: 'belowBar',
          shape: 'circle',
          color: AN_COLORS.warning,
          text: `AÇIK ${Number(price).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`
        });
      } else {
        // Short kapanışı COVER'dır: ok yukarı ve "KAPAT" — "SAT" yanlış okunurdu.
        const kapanisShort = /^COVER/.test(tur);
        markers.push({
          time,
          position: kapanisShort ? 'belowBar' : 'aboveBar',
          shape: kapanisShort ? 'arrowUp' : 'arrowDown',
          color: pnl >= 0 ? AN_COLORS.cyan : AN_COLORS.danger,
          text: etiket ? `${kapanisShort ? 'KAPAT' : 'SAT'} ${fiyatYazi} (${pnl >= 0 ? '+' : '−'}${Math.abs(pnl).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $)` : ''
        });
      }
    });

    markers.sort((a, b) => a.time - b.time);
  }

  // Uygulanmayan sinyaller ayrı bir işaretle: strateji "al" dedi ama işlem
  // açılmadı. Gerçekleşen işlemlerle aynı sembolü kullanmak, ikisini
  // birbirine karıştırırdı — bu yüzden içi boş daire ve soluk renk.
  const blockedToggle = document.getElementById('anTogBlockedSignals');
  const trace = result && result.trace;
  if (blockedToggle && blockedToggle.checked && trace && Array.isArray(trace.signals)) {
    trace.signals.filter(s => !s.executed).slice(-200).forEach(s => {
      const ms = Date.parse(s.timestamp);
      if (!Number.isFinite(ms)) return;
      markers.push({
        time: bucketStart(Math.floor(ms / 1000), timeframe),
        position: s.action === 'BUY' ? 'belowBar' : 'aboveBar',
        shape: 'circle',
        color: AN_COLORS.muted,
        text: `${s.action}✕ ${s.blockedBy || ''}`
      });
    });
    markers.sort((a, b) => a.time - b.time);
  }

  // Canlı grafikteki ile aynı gerekçe: işaretçiler tek elden basılmalı.
  if (btIndicatorLayer) {
    btIndicatorLayer.setBaseMarkers(markers);
    return;
  }

  try {
    // v5 işaretleri seriden ayrı bir primitive'e taşıdı.
    if (typeof anPriceSeries.setMarkers === 'function') {
      anPriceSeries.setMarkers(markers);
    } else if (typeof LightweightCharts.createSeriesMarkers === 'function') {
      if (anPriceMarkersApi) anPriceMarkersApi.setMarkers(markers);
      else anPriceMarkersApi = LightweightCharts.createSeriesMarkers(anPriceSeries, markers);
    }
  } catch (err) {
    console.warn('İşlem işaretleri çizilemedi:', err.message);
  }
}

/**
 * Sinyal izi — stratejinin ürettiği her sinyal ve akıbeti.
 *
 * Backtest bugüne kadar yalnızca GERÇEKLEŞEN işlemleri gösteriyordu. Oysa
 * strateji her barda sinyal üretir ve bir kısmı hiç uygulanmaz: pozisyon zaten
 * açıktır, sermaye yetmez ya da sinyal SHORT'tur (motor işlemez). Bu ayrım
 * görünmeden "strateji az işlem açıyor" ile "sinyaller yutuluyor" birbirinden
 * ayrılamaz — ilk ölçümde Bj Bot'un 6 SELL sinyalinin altısının da açık
 * pozisyon olmadığı barlarda düştüğü böyle görüldü.
 */
function renderSignalTrace(result) {
  const kutu = document.getElementById('signalTraceBox');
  if (!kutu || !window.IndicatorUI) return;
  // DOM kurucusu gösterge modülünden gelir; app.js'te genel bir `el` yok
  // (aynı ad burada onlarca yerde yerel değişken olarak kullanılıyor).
  const el = IndicatorUI.el;
  kutu.textContent = '';

  /**
   * EMİR DEFTERİ UYARILARI EN ÜSTTE.
   *
   * "Sonuçlar sıfır ama grafikte hareket var" durumunun sebebi neredeyse her
   * zaman burada yazılı: emirler dolmamıştır. Motor bunu sayıyordu ama panel
   * göstermiyordu — kullanıcı sıfırları görüp sebebini tahmin etmek zorunda
   * kalıyordu.
   *
   * En sık vaka: "Sermaye %" modunda baz emre 150 yazmak. O, sermayenin
   * %150'si demektir ve hiçbir emir karşılanamaz.
   */
  const ob = result && result.orderBook;
  if (ob && (ob.sermayeYetmeyen > 0 || ob.tersYonYokSayilan > 0 || (ob.dolum === 0 && ob.kalanAcikEmir > 0))) {
    const mesajlar = [];
    if (ob.sermayeYetmeyen > 0) {
      mesajlar.push(`${ob.sermayeYetmeyen} emir SERMAYE YETMEDİĞİ için dolmadı`
        + (ob.dolum === 0 ? ' — hiçbir işlem açılmadı.' : '.')
        + ' Emir boyutu "Sermaye %" ise değerler yüzde olarak okunur'
        + ' (150 = sermayenin %150\'si).');
    }
    if (ob.tersYonYokSayilan > 0) {
      mesajlar.push(`${ob.tersYonYokSayilan} emir TERS YÖNLÜ olduğu için yok sayıldı`
        + ' — motor tek pozisyon taşır.');
    }
    if (ob.dolum === 0 && ob.kalanAcikEmir > 0 && !ob.sermayeYetmeyen) {
      mesajlar.push(`${ob.kalanAcikEmir} emir masada kaldı, hiçbiri dolmadı`
        + ' — limit seviyelerine fiyat hiç gelmemiş olabilir.');
    }
    const kutuUyari = el('div', { class: 'trace-note trace-note-danger' });
    kutuUyari.textContent = '⛔ ' + mesajlar.join(' · ');
    kutu.appendChild(kutuUyari);
  } else if (ob && ob.dolum > 0) {
    const bilgi = el('div', { class: 'hint mb-2' });
    bilgi.textContent = `Emir defteri: ${ob.dolum} dolum`
      + (ob.kalanAcikEmir ? ` · ${ob.kalanAcikEmir} emir masada` : '');
    kutu.appendChild(bilgi);
  }

  // Isınma uyarısı sinyal izinden ÖNCE gelir: "az işlem" görüldüğünde ilk
  // bakılacak yer burasıdır, aşağıdaki tabloyu okumaya gerek kalmadan.
  const w = result && result.warmup;
  if (w) {
    const satir = el('div', { class: `trace-note ${w.warning ? 'trace-note-warn' : 'trace-note-ok'}` });
    satir.textContent = w.warning
      ? `⚠️ ${w.warning} (${w.candles} mumun ${w.bars}'i ısınma, kullanılabilir ${w.usableBars} bar)`
      : `Isınma ${w.bars} bar / ${w.candles} mum (%${w.pctOfSample}) — kullanılabilir ${w.usableBars} bar.`;
    kutu.appendChild(satir);
  }

  // Ayar uyarıları: tutarsız parametre bileşimleri (sigAmp < atrMult gibi)
  // sonucu geçersiz kılmaz ama ölçülen şeyin strateji olmadığını söyler.
  for (const u of (result && result.configWarnings) || []) {
    kutu.appendChild(el('div', {
      text: `⚠️ ${u}`,
      class: 'trace-note trace-note-config'
    }));
  }

  const trace = result && result.trace;
  if (!trace || !trace.totalSignals) {
    kutu.appendChild(el('div', {
      text: 'Sinyal izi yok (bu koşuda kaydedilmemiş).',
      class: 'hint'
    }));
    return;
  }

  const uygulanan = trace.signals.filter(s => s.executed).length;
  const yutulan = trace.signals.length - uygulanan;

  kutu.appendChild(el('div', {
    text: '🔍 Sinyal İzi',
    class: 'title-base mb-2'
  }));

  const ozet = el('div', { class: 'trace-summary' });
  ozet.appendChild(el('span', { text: `Toplam sinyal: ${trace.totalSignals}` }));
  ozet.appendChild(el('span', { text: `Uygulanan: ${uygulanan}`, class: 'tone-success' }));
  ozet.appendChild(el('span', {
    text: `Uygulanmayan: ${yutulan}`,
    class: yutulan ? 'tone-warning' : 'tone-muted'
  }));
  Object.entries(trace.counts || {}).forEach(([a, n]) => {
    ozet.appendChild(el('span', { text: `${a}: ${n}`, class: 'tone-muted' }));
  });
  if (trace.truncated) {
    ozet.appendChild(el('span', { text: `(+${trace.truncated} sinyal listeye alınmadı)`, class: 'tone-muted' }));
  }
  kutu.appendChild(ozet);

  // Yutulma sebepleri: asıl teşhis burada.
  const sebepler = Object.entries(trace.blocked || {});
  if (sebepler.length) {
    const s = el('div', { class: 'tone-warning text-xs mb-2' });
    s.textContent = 'Uygulanmama sebepleri — ' + sebepler.map(([k, v]) => `${k}: ${v}`).join(' · ');
    kutu.appendChild(s);
  }

  const basliklar = ['bar', 'zaman', 'sinyal', 'fiyat', 'durum', 'sebep', ...(trace.indicatorKeys || [])];
  const satirlar = [];
  trace.signals.slice(-120).reverse().forEach(sig => {
    const hucreler = [
      { text: String(sig.index) },
      { text: (sig.timestamp || '').slice(0, 16).replace('T', ' ') },
      { text: sig.action, color: sig.action === 'BUY' ? 'var(--accent-success)' : (sig.action === 'SELL' ? 'var(--accent-cyan)' : 'var(--accent-warning)') },
      { text: Number(sig.price).toLocaleString('tr-TR', { maximumFractionDigits: 4 }) },
      { text: sig.executed ? 'uygulandı' : 'yutuldu', color: sig.executed ? 'var(--accent-success)' : 'var(--accent-warning)' },
      { text: sig.executed ? (sig.reason || '—') : (sig.blockedBy || '—'), color: 'var(--text-muted)' },
      ...(trace.indicatorKeys || []).map(k => {
        const v = sig.indicators ? sig.indicators[k] : undefined;
        return { text: v === undefined || v === null ? '—' : String(v), color: 'var(--text-muted)' };
      })
    ];

    const tr = el('tr', {});
    hucreler.forEach(h => {
      const td = el('td', { text: h.text });
      if (h.color) tonla(td, h.color);
      tr.appendChild(td);
    });
    satirlar.push(tr);
  });

  // Tablo → kart ortak bileşeni (js/core/tablo.js).
  kutu.appendChild(AG.tablo.kutulu({ sinif: 'table-dense', basliklar, satirlar }, 'scroll-box-sm'));
}

/** İsteğe bağlı: ortalama giriş ve açık pozisyon seviyeleri. */
function renderBacktestTradeLevels(result) {
  if (!anPriceSeries) return;

  anPriceLines.forEach(l => { try { anPriceSeries.removePriceLine(l); } catch (e) { /* yok */ } });
  anPriceLines = [];

  const toggle = document.getElementById('anTogTradeLevels');
  if (!toggle || !toggle.checked) return;

  const trades = result.trades || [];
  const entries = trades.filter(t => String(t.type) === 'BUY' && Number.isFinite(t.entryPrice));
  if (entries.length === 0) return;

  const avgEntry = entries.reduce((a, t) => a + t.entryPrice, 0) / entries.length;
  const styles = (window.LightweightCharts && LightweightCharts.LineStyle) || {};

  const addLine = (price, color, title, style) => {
    if (!Number.isFinite(price) || price <= 0) return;
    try {
      anPriceLines.push(anPriceSeries.createPriceLine({
        price, color, lineWidth: 1,
        lineStyle: style !== undefined ? style : 0,
        axisLabelVisible: true, title
      }));
    } catch (e) { /* seviye eklenemedi */ }
  };

  addLine(avgEntry, AN_COLORS.primary, `Ort. giriş (${entries.length} alım)`, styles.Dashed);

  const openTrade = trades.find(t => String(t.type) === 'OPEN');
  if (openTrade) {
    addLine(openTrade.entryPrice, AN_COLORS.warning, 'Açık pozisyon girişi', styles.Solid);
  }
}

function initAnalyticsPriceControls() {
  ['anTogMarkers', 'anTogTradeLevels', 'anTogBlockedSignals'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (!anLastResult) return;
      const tf = anLastResult.timeframe || document.getElementById('btTimeframe')?.value || '1h';
      renderBacktestTradeMarkers(anLastResult, tf);
      renderBacktestTradeLevels(anLastResult);
    });
  });
}

  /* ── Dışarı açılan adlar (app.js / öteki js/app parçaları kullanır) ── */
  Object.assign(window, { anSetText, initAnalyticsPriceControls, initAnalyticsTabs, renderBacktestAnalytics, renderBacktestPriceChart });
  // Paylaşılan durum: okuyan (ve yazmayan) öteki dosyalar için erişimci.
  Object.defineProperties(window, {
    anData: { configurable: true, get: () => anData },
    anPriceChart: { configurable: true, get: () => anPriceChart },
    anPriceSeries: { configurable: true, get: () => anPriceSeries },
    anLastResult: { configurable: true, get: () => anLastResult }
  });
})();
