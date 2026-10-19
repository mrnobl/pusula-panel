/**
 * KÂĞIT TEST RİSK AYARLARI ekranı (`#tab-risk`) — çizim ve form doldurma
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fren özeti (`frenOzeti`, Kâğıt test "Risk durumu" kartıyla ortak), risk formu (`populateRiskForm`),
 * kademe merdiveni, düşüş istatistikleri + su altı grafiği, küme ve pozisyon tabloları, `renderRiskTab`.
 * Kaydetme / sıfırlama düğmelerinin olayları `js/app/olaylar.js`te.
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

/**
 * Frenlerin tek hesabı: Risk sekmesindeki "Frenler" kartı ve Canlı İzleme'deki
 * "Risk durumu" kartı aynı listeyi gösterir.
 */
function frenOzeti(risk) {
  const or = risk.openRisk || {};
  const daily = risk.daily || {};
  const kademe = risk.riskTier || {};
  const frenler = [];
  if (risk.killSwitchTriggered) frenler.push('KILL-SWITCH');
  if (daily.haltTriggered && daily.limitEnabled !== false) frenler.push('GÜNLÜK LİMİT');
  if (risk.cooldownActive) frenler.push(`SOĞUMA ${risk.cooldownRemainingSec}s`);
  if (kademe.haltNewEntries) frenler.push('KADEME');
  if (or.overLimit) frenler.push('RİSK TAVANI');
  if (risk.exposureLimitsEnabled !== false) {
    if (or.slotsMax > 0 && or.slotsUsed >= or.slotsMax) frenler.push('SLOT DOLU');
    if (or.grossCapUSDT > 0 && or.exposureUSDT >= or.grossCapUSDT) frenler.push('BRÜT TAVAN');
  }
  return { frenler, kademe, daily, or };
}

// ---------------------------------------------------------------------------
// Risk Yönetimi sekmesi — tüm risk parametrelerinin tek adresi.
// ---------------------------------------------------------------------------

const rkMoney = (n) => `$${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Sunucudan gelen kademe merdiveninin imzası. Tablo yalnızca merdiven
// gerçekten değişince yeniden çizilir — aksi halde her tick kullanıcının
// yazmakta olduğu eşik değerini silerdi.
let rkTierSignature = null;

function rkSet(id, text, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  if (color) tonla(el, color);
}

function populateRiskForm(risk = {}) {
  const num = (id, value) => {
    const el = document.getElementById(id);
    // Kullanıcı o alana yazarken config yenilenirse yazdığı değer silinmesin.
    if (el && document.activeElement !== el) el.value = value;
  };
  const chk = (id, value) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.checked = value;
  };

  num('inpStopLoss', risk.stopLossPct || 2.0);
  num('inpTakeProfit', risk.takeProfitPct || 4.0);
  num('inpTrailingStop', risk.trailingStopPct || 1.5);
  num('inpMaxPositionSize', risk.maxPositionSizePct || 25);
  num('inpMinOrderUSDT', risk.minOrderUSDT != null ? risk.minOrderUSDT : 10);
  num('inpMaxOpenRisk', risk.maxOpenRiskPct || 6.0);
  num('inpMaxDrawdown', risk.maxDrawdownPct || 10.0);
  num('inpTierHysteresis', risk.tierHysteresisPct != null ? risk.tierHysteresisPct : 1.0);
  num('inpMaxLossStreak', risk.maxLossStreak || 3);
  num('inpCooldownMinutes', risk.cooldownMinutes || 15);
  num('inpAntiMartStep', risk.antiMartingaleStep != null ? risk.antiMartingaleStep : 0.25);
  num('inpAntiMartFloor', risk.antiMartingaleFloor != null ? risk.antiMartingaleFloor : 0.25);
  num('inpLossStreakDecay', risk.lossStreakDecayMinutes || 0);
  chk('chkAntiMartingale', risk.antiMartingaleEnabled !== false);

  const resetModeEl = document.getElementById('selLossStreakReset');
  if (resetModeEl && document.activeElement !== resetModeEl) {
    resetModeEl.value = risk.lossStreakResetMode === 'step' ? 'step' : 'full';
  }
  num('inpDailyLossLimit', risk.dailyLossLimitPct || 3.0);
  num('inpDayResetHour', risk.dayResetHour != null ? risk.dayResetHour : 0);

  const actionEl = document.getElementById('selDailyLossAction');
  if (actionEl && document.activeElement !== actionEl) {
    actionEl.value = risk.dailyLossAction === 'flatten' ? 'flatten' : 'halt';
  }

  // Sunucu tarafıyla aynı kural: alan yoksa fren açıktır.
  chk('chkTrailingStop', risk.trailingStop !== false);
  chk('chkOpenRiskLimit', risk.openRiskLimitEnabled !== false);
  chk('chkEquityTiers', risk.equityTiersEnabled !== false);
  chk('chkCooldownEnabledForm', risk.cooldownEnabled !== false);
  chk('chkDailyLossLimit', risk.dailyLossLimitEnabled !== false);

  num('inpRiskPerTrade', risk.riskPerTradePct || 1.0);
  num('inpMaxRiskPerBot', risk.maxRiskPerBotPct || 2.0);
  chk('chkRiskSizing', risk.riskSizingEnabled !== false);
  // Diğer anahtarların tersine varsayılanı KAPALI: eski bölme davranışını
  // ancak açıkça istenirse geri getirir.
  chk('chkSplitCashCap', risk.splitCashCapAcrossBots === true);

  num('inpAtrStopPeriod', risk.atrPeriod || 14);
  const atrTfEl = document.getElementById('selAtrTimeframe');
  if (atrTfEl && document.activeElement !== atrTfEl) atrTfEl.value = risk.atrTimeframe || '1h';
  num('inpAtrStopMultiplier', risk.atrStopMultiplier || 2.0);
  num('inpAtrStopMin', risk.atrStopMinPct || 0.8);
  num('inpAtrStopMax', risk.atrStopMaxPct || 6.0);
  num('inpTakeProfitRR', risk.takeProfitRR || 2.0);
  chk('chkAtrStop', risk.atrStopEnabled !== false);
  chk('chkStrategyStopPrecedence', risk.strategyStopPrecedence !== false);

  num('inpMaxConcurrent', risk.maxConcurrentPositions || 10);
  num('inpMaxSymbolExposure', risk.maxSymbolExposurePct || 15);
  num('inpMaxClusterExposure', risk.maxClusterExposurePct || 40);
  num('inpMaxGrossExposure', risk.maxGrossExposurePct || 80);
  chk('chkExposureLimits', risk.exposureLimitsEnabled !== false);

  const clustersEl = document.getElementById('txtClusters');
  if (clustersEl && document.activeElement !== clustersEl) {
    clustersEl.value = clustersToText(risk.clusters);
  }
}

/** Küme haritasını "Küme adı: SEMBOL, SEMBOL" satırlarına çevirir. */
function clustersToText(clusters) {
  if (!clusters || typeof clusters !== 'object') return '';
  return Object.entries(clusters)
    .map(([name, symbols]) => `${name}: ${(Array.isArray(symbols) ? symbols : []).join(', ')}`)
    .join('\n');
}

/**
 * Metni küme haritasına çevirir. Boş satırlar ve iki nokta içermeyen satırlar
 * yok sayılır; sembolü olmayan küme adı da atılır — kaydedilen harita ile
 * ekranda görünen metin böylece hep aynı şeyi anlatır.
 */
function textToClusters(text) {
  const out = {};
  String(text || '').split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx < 1) return;
    const name = line.slice(0, idx).trim();
    const symbols = line.slice(idx + 1)
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
    if (name && symbols.length) out[name] = symbols;
  });
  return out;
}

/**
 * Küme taraması sonucu.
 *
 * İki şey gösterilir: ölçülen harita ve MEVCUT haritanın karşılığı. Asıl sayı
 * "iç korelasyon − taban": rastgele iki varlığın ortalama korelasyonunun
 * altında kalan bir küme, "birlikte düşerler" varsayımını taşımıyor demektir
 * ve tavanı yanlış yere koyuyordur.
 *
 * Öneri metin alanına doldurulur, KAYDEDİLMEZ — kullanıcı görmeden risk
 * parametresi değişmez.
 */
function renderClusterScan(data) {
  const kutu = document.getElementById('clusterScanResult');
  if (!kutu) return;
  kutu.textContent = '';

  const baslik = document.createElement('div');
  baslik.className = 'hint mb-2';
  baslik.textContent = `${data.timeframe} · ${data.bars} ortak bar · ${data.sampleSize} getiri örneği`
    + ` · eşik ${data.threshold} · rastgele iki varlığın ortalama korelasyonu ${data.averageCorrelation?.toFixed(3) ?? '—'}`
    + (data.limitedBy ? ` · ekseni kısıtlayan: ${data.limitedBy}` : '');
  kutu.appendChild(baslik);

  // Tablo → kart ortak bileşeni (js/core/tablo.js).
  const satirlar = [];
  (data.current || []).forEach(c => {
    const tr = document.createElement('tr');
    const fark = c.vsBaseline;
    const renk = fark === null ? 'var(--text-muted)'
      : (fark > 0.1 ? 'var(--accent-success)' : (fark < 0 ? 'var(--accent-danger)' : 'var(--accent-warning)'));

    [
      { text: c.name },
      { text: (c.symbols || []).join(', '), color: 'var(--text-muted)' },
      { text: c.internalCorrelation === null ? 'tek üye' : c.internalCorrelation.toFixed(3) },
      { text: fark === null ? '—' : (fark > 0 ? `+${fark.toFixed(3)}` : fark.toFixed(3)), color: renk }
    ].forEach(h => {
      const td = document.createElement('td');
      td.textContent = h.text;
      if (h.color) tonla(td, h.color);
      tr.appendChild(td);
    });
    satirlar.push(tr);
  });
  kutu.appendChild(AG.tablo.kutulu({ sinif: 'table-dense', basliklar: ['Mevcut küme', 'Semboller', 'İç korelasyon', 'Tabana göre'], satirlar }));

  if ((data.skipped || []).length || (data.dropped || []).length) {
    const uyari = document.createElement('div');
    uyari.className = 'note-line tone-warning';
    const adlar = [
      ...(data.skipped || []).map(s => `${s.symbol} (${s.reason})`),
      ...(data.dropped || []).map(d => `${d.symbol} (${d.reason})`)
    ];
    // Ölçülemeyenler öneriye TEKİL küme olarak giriyor: tek bir
    // "Sınıflandırılmamış" kovaya düşselerdi, ölçülmemiş olmaları yüzünden
    // birlikte hareket ediyormuş gibi tek tavana bağlanırlardı.
    uyari.textContent = `Ölçülemeyen (öneride tekil küme): ${adlar.join(', ')}`;
    kutu.appendChild(uyari);
  }

  const not = document.createElement('div');
  not.className = 'note-line tone-muted';
  not.textContent = 'Ölçülen harita yukarıdaki metin alanına dolduruldu. Uygulamak için "Risk Ayarlarını Kaydet" düğmesine basın; basmazsanız hiçbir şey değişmez.';
  kutu.appendChild(not);

  const alan = document.getElementById('txtClusters');
  if (alan) alan.value = clustersToText(data.proposed);
}

/**
 * Kademe merdiveni tablosu. Satırlar sunucunun çözümlediği merdivenden
 * kurulur (eşikler orada mutlak sayıya dönmüş olur), 0. kademe "Normal"
 * atlanır — o örtük başlangıç durumudur, düzenlenecek bir yanı yok.
 */
function renderTierTable(riskStatus) {
  const tbody = document.querySelector('#tblRiskTiers tbody');
  if (!tbody) return;

  const tiers = (riskStatus && riskStatus.riskTiers) || [];
  const editable = tiers.filter(t => t.index > 0);
  if (!editable.length) return;

  const signature = JSON.stringify(editable.map(t => [t.label, t.ddPct, t.sizeMultiplier, t.haltNewEntries]));
  if (signature === rkTierSignature) return;
  rkTierSignature = signature;

  tbody.textContent = '';

  editable.forEach((tier, i) => {
    const tr = document.createElement('tr');
    tr.dataset.tierIndex = String(tier.index);

    const tdLabel = document.createElement('td');
    const inpLabel = document.createElement('input');
    inpLabel.type = 'text';
    inpLabel.className = 'form-control rk-tier-label';
    inpLabel.value = tier.label;
    inpLabel.classList.add('field-w150');
    tdLabel.appendChild(inpLabel);

    const tdDd = document.createElement('td');
    const inpDd = document.createElement('input');
    inpDd.type = 'number';
    inpDd.className = 'form-control rk-tier-dd';
    inpDd.step = '0.5';
    inpDd.min = '0';
    inpDd.value = tier.ddPct;
    inpDd.classList.add('field-w110');
    tdDd.appendChild(inpDd);

    const tdMult = document.createElement('td');
    const inpMult = document.createElement('input');
    inpMult.type = 'number';
    inpMult.className = 'form-control rk-tier-mult';
    inpMult.step = '0.05';
    inpMult.min = '0';
    inpMult.max = '1';
    inpMult.value = tier.sizeMultiplier;
    inpMult.classList.add('field-w110');
    tdMult.appendChild(inpMult);

    const tdHalt = document.createElement('td');
    const lblHalt = document.createElement('label');
    lblHalt.className = 'check-label';
    const inpHalt = document.createElement('input');
    inpHalt.type = 'checkbox';
    inpHalt.className = 'rk-tier-halt';
    inpHalt.checked = !!tier.haltNewEntries;
    inpHalt.classList.add('clickable');
    lblHalt.appendChild(inpHalt);
    lblHalt.appendChild(document.createTextNode('Durdur'));
    tdHalt.appendChild(lblHalt);

    const tdState = document.createElement('td');
    tdState.id = `rkTierState-${tier.index}`;
    tdState.textContent = '—';

    [tdLabel, tdDd, tdMult, tdHalt, tdState].forEach(td => tr.appendChild(td));
    tbody.appendChild(tr);

    if (i === editable.length - 1) {
      // Merdivenin son basamağı kill-switch: düzenlenemez, ama görünmeli ki
      // kademelerin nereye çıktığı tabloda eksik kalmasın.
      const killTr = document.createElement('tr');
      const killCells = [
        'Acil fren',
        `%${riskStatus.maxDrawdownPct}`,
        '×0 (tüm pozisyonlar kapanır)',
        'Durdur',
        riskStatus.killSwitchTriggered ? '🚨 DEVREDE' : 'Bekliyor'
      ];
      killCells.forEach((text, ci) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (ci === 0) tonla(td, 'var(--accent-danger)');
        if (ci === 4) {
          td.id = 'rkTierState-kill';
          tonla(td, riskStatus.killSwitchTriggered ? 'var(--accent-danger)' : 'var(--text-muted)');
        }
        killTr.appendChild(td);
      });
      tbody.appendChild(killTr);
    }
  });
}

/** Her tick'te yalnızca durum hücreleri güncellenir; girdi alanlarına dokunulmaz. */
function markActiveTier(riskStatus) {
  const tiers = (riskStatus && riskStatus.riskTiers) || [];
  const activeIndex = (riskStatus.riskTier && riskStatus.riskTier.index) || 0;
  const enabled = riskStatus.equityTiersEnabled !== false;

  tiers.filter(t => t.index > 0).forEach(tier => {
    const cell = document.getElementById(`rkTierState-${tier.index}`);
    if (!cell) return;
    if (!enabled) {
      cell.textContent = 'Kapalı';
      tonla(cell, 'var(--text-muted)');
    } else if (tier.index === activeIndex) {
      cell.textContent = '● AKTİF';
      tonla(cell, tier.haltNewEntries ? 'var(--accent-danger)' : 'var(--accent-warning)');
    } else if (tier.index < activeIndex) {
      cell.textContent = 'Geçildi';
      tonla(cell, 'var(--text-muted)');
    } else {
      cell.textContent = `%${tier.ddPct} eşiğinde`;
      tonla(cell, 'var(--text-muted)');
    }
  });

  const killCell = document.getElementById('rkTierState-kill');
  if (killCell) {
    killCell.textContent = riskStatus.killSwitchTriggered ? '🚨 DEVREDE' : 'Bekliyor';
    tonla(killCell, riskStatus.killSwitchTriggered ? 'var(--accent-danger)' : 'var(--text-muted)');
  }
}

// --- Drawdown & toparlanma ---------------------------------------------------
// Sualtı eğrisi 240 nokta taşıdığı için her tick WebSocket'ten göndermek yerine
// ayrı ve daha seyrek çekilir.

let ddFetchInFlight = false;

async function loadDrawdownStats() {
  if (ddFetchInFlight) return;
  ddFetchInFlight = true;
  try {
    const hours = document.getElementById('selDdRange')?.value ?? '24';
    const data = await AG.api.riskDusus(hours);
    if (data && data.success) renderDrawdownStats(data);
  } catch (err) {
    // Sessizce geç: panel bir sonraki turda tekrar dener.
  } finally {
    ddFetchInFlight = false;
  }
}

function renderDrawdownStats(d) {
  const pct = (n) => `%${Number(n || 0).toFixed(2)}`;

  rkSet('ddMeta', d.sampleCount
    ? `${d.sampleCount} örnek · ${d.spanLabel} · ${d.sampleSeconds}sn aralık`
    : 'Henüz yeterli örnek yok');

  const maxColor = d.maxDrawdownPct >= 10 ? 'var(--accent-danger)'
    : (d.maxDrawdownPct >= 5 ? 'var(--accent-warning)' : 'var(--accent-success)');
  rkSet('ddMax', pct(d.maxDrawdownPct), maxColor);
  rkSet('ddMaxSub', d.maxDrawdownUSDT
    ? `${rkMoney(d.maxDrawdownUSDT)} · en uzun sualtı ${d.maxDrawdownDurationLabel}`
    : 'Zirveden düşüş yaşanmadı', 'var(--text-muted)');

  rkSet('ddCurrent', pct(d.currentDrawdownPct),
    d.currentDrawdownPct > 0 ? 'var(--accent-warning)' : 'var(--accent-success)');
  rkSet('ddCurrentSub', d.currentDrawdownPct > 0
    ? `${rkMoney(d.currentDrawdownUSDT)} · ${d.currentDrawdownLabel} sürüyor`
    : `Zirvede · ${rkMoney(d.peakEquity)}`, 'var(--text-muted)');

  rkSet('ddRequired', pct(d.requiredGainPct),
    d.requiredGainPct > 0 ? 'var(--accent-warning)' : 'var(--accent-success)');
  rkSet('ddRequiredSub', d.requiredGainPct > 0
    ? `${rkMoney(d.currentEquity)} → ${rkMoney(d.peakEquity)}`
    : 'Kayıp yok, telafi gerekmiyor', 'var(--text-muted)');

  rkSet('ddUnderwater', `%${Number(d.timeUnderwaterPct || 0).toFixed(1)}`,
    d.timeUnderwaterPct >= 70 ? 'var(--accent-danger)'
      : (d.timeUnderwaterPct >= 40 ? 'var(--accent-warning)' : 'var(--accent-success)'));
  rkSet('ddUnderwaterSub', `En uzun toparlanma ${d.longestRecoveryLabel}`, 'var(--text-muted)');

  rkSet('ddUlcer', Number(d.ulcerIndex || 0).toFixed(2),
    d.ulcerIndex >= 5 ? 'var(--accent-danger)'
      : (d.ulcerIndex >= 2 ? 'var(--accent-warning)' : 'var(--accent-success)'));

  // Toparlanma faktörü kâr yokken veya hiç drawdown yaşanmamışken tanımsızdır;
  // 0 yazmak "kötü" gibi okunurdu.
  if (d.recoveryFactor === null || d.recoveryFactor === undefined) {
    rkSet('ddRecovery', '—', 'var(--text-muted)');
    rkSet('ddRecoverySub', d.netPnlUSDT > 0 ? 'Henüz düşüş yaşanmadı' : 'Net kâr yok — tanımsız', 'var(--text-muted)');
  } else {
    rkSet('ddRecovery', Number(d.recoveryFactor).toFixed(2),
      d.recoveryFactor >= 2 ? 'var(--accent-success)'
        : (d.recoveryFactor >= 1 ? 'var(--accent-warning)' : 'var(--accent-danger)'));
    rkSet('ddRecoverySub', `Net ${rkMoney(d.netPnlUSDT)} ÷ ${rkMoney(d.maxDrawdownUSDT)}`, 'var(--text-muted)');
  }

  renderUnderwaterChart(d.underwater || []);
  renderDrawdownEpisodes(d.episodes || []);
}

/**
 * Sualtı eğrisi. Yerleşik tema dışına çıkmamak için inline SVG: harici kütüphane
 * yok, yeni CSS sınıfı yok, renkler mevcut --accent-* değişkenlerinden.
 * Y ekseni ters: 0 üstte (zirve), derinleşen drawdown aşağı iner.
 */
function renderUnderwaterChart(rows) {
  const svg = document.getElementById('ddChart');
  if (!svg) return;

  const W = 800;
  const H = 160;
  svg.textContent = '';

  if (!rows.length) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(W / 2));
    text.setAttribute('y', String(H / 2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'var(--text-muted)');
    text.setAttribute('font-size', '13');
    text.textContent = 'Henüz yeterli equity örneği yok.';
    svg.appendChild(text);
    return;
  }

  // Ölçek: en derin drawdown grafiğin altına otururken tamamen düz bir seri
  // de görünür kalsın diye taban %1'e sabitlenir.
  const maxDd = Math.max(1, ...rows.map(r => r.dd));
  const x = (i) => (rows.length === 1 ? W / 2 : (i / (rows.length - 1)) * W);
  const y = (dd) => (dd / maxDd) * (H - 20);

  const ns = 'http://www.w3.org/2000/svg';

  // Yatay ızgara: 0, yarı derinlik, tam derinlik
  [0, maxDd / 2, maxDd].forEach((level, idx) => {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('x2', String(W));
    line.setAttribute('y1', String(y(level)));
    line.setAttribute('y2', String(y(level)));
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-opacity', idx === 0 ? '0.35' : '0.12');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', '4');
    label.setAttribute('y', String(Math.min(H - 4, y(level) + (idx === 0 ? 12 : -4))));
    label.setAttribute('fill', 'var(--text-muted)');
    label.setAttribute('font-size', '10');
    label.textContent = `-%${level.toFixed(idx === 0 ? 0 : 2)}`;
    svg.appendChild(label);
  });

  const points = rows.map((r, i) => `${x(i).toFixed(2)},${y(r.dd).toFixed(2)}`).join(' ');

  const area = document.createElementNS(ns, 'polygon');
  area.setAttribute('points', `0,0 ${points} ${W},0`);
  area.setAttribute('fill', 'var(--accent-danger)');
  area.setAttribute('fill-opacity', '0.18');
  svg.appendChild(area);

  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', points);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'var(--accent-danger)');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(line);
}

function renderDrawdownEpisodes(episodes) {
  const tbody = document.querySelector('#tblDdEpisodes tbody');
  if (!tbody) return;
  tbody.textContent = '';

  if (!episodes.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'text-center tone-muted';
    td.textContent = 'Bu pencerede zirveden düşüş yaşanmadı.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const when = (ts) => ts ? new Date(ts).toLocaleString('tr-TR') : '—';

  episodes.slice(0, 12).forEach(ep => {
    const tr = document.createElement('tr');
    const cells = [
      { text: `%${ep.maxDrawdownPct.toFixed(2)}`, color: 'var(--accent-danger)' },
      { text: rkMoney(ep.maxDrawdownUSDT) },
      { text: `${rkMoney(ep.peakEquity)} → ${rkMoney(ep.troughEquity)}`, color: 'var(--text-muted)' },
      { text: when(ep.startedAt), color: 'var(--text-muted)' },
      { text: ep.durationLabel },
      { text: ep.recoveryLabel || '—', color: 'var(--text-muted)' },
      { text: ep.open ? '● Sürüyor' : 'Toparlandı', color: ep.open ? 'var(--accent-warning)' : 'var(--accent-success)' }
    ];
    cells.forEach(c => {
      const td = document.createElement('td');
      td.textContent = c.text;
      if (c.color) tonla(td, c.color);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderClusterTable(riskStatus) {
  const tbody = document.querySelector('#tblRiskClusters tbody');
  if (!tbody) return;

  const rows = (riskStatus.openRisk && riskStatus.openRisk.byCluster) || [];
  const limitsOn = riskStatus.exposureLimitsEnabled !== false;
  tbody.textContent = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'text-center tone-muted';
    td.textContent = 'Küme tanımı yok.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach(c => {
    const tr = document.createElement('tr');

    let usageColor = 'var(--text-muted)';
    if (limitsOn && c.count > 0) {
      usageColor = c.overLimit ? 'var(--accent-danger)'
        : (c.capUsedPct >= 70 ? 'var(--accent-warning)' : 'var(--accent-success)');
    }

    const cells = [
      { text: c.cluster },
      { text: c.symbols.length ? c.symbols.join(', ') : '—', color: 'var(--text-muted)' },
      { text: String(c.count) },
      { text: rkMoney(c.exposureUSDT) },
      { text: `%${c.exposurePct}` },
      { text: limitsOn ? rkMoney(c.capUSDT) : 'kapalı', color: 'var(--text-muted)' },
      { text: limitsOn ? `%${c.capUsedPct}` : '—', color: usageColor }
    ];

    cells.forEach(cell => {
      const td = document.createElement('td');
      td.textContent = cell.text;
      if (cell.color) tonla(td, cell.color);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderRiskPositions(riskStatus) {
  const tbody = document.querySelector('#tblRiskPositions tbody');
  if (!tbody) return;

  const rows = (riskStatus.openRisk && riskStatus.openRisk.positions) || [];
  tbody.textContent = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 12;
    td.className = 'text-center tone-muted';
    td.textContent = 'Açık pozisyon yok — taşınan risk sıfır.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const px = (n) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 6 });

  rows.forEach(p => {
    const tr = document.createElement('tr');

    let state = 'Stop aktif';
    let stateColor = 'var(--text-muted)';
    if (!p.priced) {
      state = '⚠️ Fiyat yok';
      stateColor = 'var(--accent-warning)';
    } else if (p.isBreakeven) {
      state = '🛡️ Breakeven';
      stateColor = 'var(--accent-success)';
    }

    // Vadeli pozisyonda likidasyon, stop'tan önce gelebilecek gerçek çıkıştır:
    // durum sütununda stopla birlikte görünmesi gerekiyor.
    if (p.liqPrice) {
      const ref = p.markPrice || p.entryPrice;
      const uzaklik = Math.abs((ref - p.liqPrice) / ref) * 100;
      if (uzaklik < 5) {
        state = `⚠️ Likidasyon %${uzaklik.toFixed(2)} uzakta`;
        stateColor = 'var(--accent-danger)';
      }
    }

    const kisa = p.side === 'short';
    const cells = [
      // Yön ve kaldıraç sembolün yanında: short bir pozisyonun long gibi
      // okunması, risk tablosunda yapılabilecek en pahalı hatadır.
      { text: `${p.symbol}${p.side ? (kisa ? ' ▼SHORT' : ' ▲LONG') : ''}${Number(p.leverage) > 1 ? ` ${p.leverage}x` : ''}`,
        color: p.side ? (kisa ? 'var(--accent-danger)' : 'var(--accent-success)') : null },
      { text: p.botId || '—', color: 'var(--text-muted)' },
      { text: px(p.amount) },
      { text: px(p.entryPrice) },
      { text: `%${p.stopPct} · ${p.stopSource || 'sabit'}`, color: p.stopSource === 'ATR' ? 'var(--accent-cyan)' : 'var(--text-muted)' },
      { text: p.stopPrice != null ? px(p.stopPrice) : '—', color: 'var(--accent-danger)' },
      { text: rkMoney(p.riskUSDT), color: 'var(--accent-danger)' },
      { text: rkMoney(p.plannedRiskUSDT), color: 'var(--text-muted)' },
      { text: rkMoney(p.exposureUSDT) },
      { text: p.boundBy || '—', color: p.boundBy && p.boundBy !== 'risk hedefi' ? 'var(--accent-warning)' : 'var(--text-muted)' },
      { text: state, color: stateColor }
    ];

    cells.forEach(c => {
      const td = document.createElement('td');
      td.textContent = c.text;
      if (c.color) tonla(td, c.color);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderRiskTab(state) {
  const risk = (state && state.riskStatus) || null;
  if (!risk) return;

  const or = risk.openRisk || {};
  const tier = risk.riskTier || {};

  // Sermaye / zirve
  rkSet('rkEquity', rkMoney(risk.equity), 'var(--text-strong)');
  const ddColor = risk.drawdownPct >= risk.maxDrawdownPct ? 'var(--accent-danger)'
    : (risk.drawdownPct >= risk.maxDrawdownPct * 0.6 ? 'var(--accent-warning)' : 'var(--accent-success)');
  rkSet('rkEquitySub', `Zirve ${rkMoney(risk.peakCapital)} · Düşüş %${(risk.drawdownPct || 0).toFixed(2)} / %${risk.maxDrawdownPct}`, ddColor);

  // Açık risk
  const riskColor = or.overLimit ? 'var(--accent-danger)'
    : ((or.budgetUsedPct || 0) >= 70 ? 'var(--accent-warning)' : 'var(--accent-success)');
  rkSet('rkOpenRisk', rkMoney(or.openRiskUSDT), risk.openRiskLimitEnabled === false ? 'var(--text-muted)' : riskColor);
  rkSet('rkOpenRiskSub', risk.openRiskLimitEnabled === false
    ? `Tavan kapalı · sermayenin %${(or.openRiskPct || 0).toFixed(2)}'i`
    : `Bütçe ${rkMoney(or.budgetUSDT)} (%${risk.maxOpenRiskPct}) · %${or.budgetUsedPct || 0} kullanıldı · kalan ${rkMoney(or.remainingBudgetUSDT)}`,
    or.overLimit ? 'var(--accent-danger)' : 'var(--text-muted)');

  // Planlanan risk (R) ve maruziyet
  rkSet('rkPlannedRisk', rkMoney(or.plannedRiskUSDT), 'var(--text-muted)');
  rkSet('rkPlannedRiskSub', `Girişten stop'a · sermayenin %${(or.plannedRiskPct || 0).toFixed(2)}'i`);
  rkSet('rkExposure', rkMoney(or.exposureUSDT), 'var(--text-strong)');
  rkSet('rkExposureSub', `Sermayenin %${(or.exposurePct || 0).toFixed(2)}'i · ${or.positionCount || 0} pozisyon`);

  // Pozisyon slotu ve brüt tavan
  const slotsUsed = or.slotsUsed || 0;
  const slotsMax = or.slotsMax || 0;
  const slotsFull = risk.exposureLimitsEnabled !== false && slotsMax > 0 && slotsUsed >= slotsMax;
  rkSet('rkSlots', `${slotsUsed} / ${slotsMax}`,
    risk.exposureLimitsEnabled === false ? 'var(--text-muted)'
      : (slotsFull ? 'var(--accent-danger)' : (slotsUsed / Math.max(1, slotsMax) >= 0.8 ? 'var(--accent-warning)' : 'var(--accent-success)')));
  rkSet('rkSlotsSub', risk.exposureLimitsEnabled === false
    ? 'Maruziyet limitleri kapalı'
    : `Brüt ${rkMoney(or.exposureUSDT)} / ${rkMoney(or.grossCapUSDT)} (%${or.grossCapUsedPct || 0} kullanıldı)`,
    slotsFull ? 'var(--accent-danger)' : 'var(--text-muted)');

  renderClusterTable(risk);

  // Bugünkü sonuç ve günlük limit
  const daily = risk.daily || {};
  const dayPnl = daily.pnlUSDT || 0;
  const dayColor = daily.haltTriggered ? 'var(--accent-danger)'
    : (dayPnl >= 0 ? 'var(--accent-success)' : ((daily.usedPct || 0) >= 70 ? 'var(--accent-warning)' : 'var(--accent-danger)'));
  rkSet('rkDaily', `${dayPnl >= 0 ? '+' : ''}${rkMoney(dayPnl)}`, dayColor);
  if (daily.limitEnabled === false) {
    rkSet('rkDailySub', `Gün başı ${rkMoney(daily.startEquity)} · limit kapalı · gün içi dip %${daily.worstPct}`, 'var(--text-muted)');
  } else if (daily.haltTriggered) {
    rkSet('rkDailySub', `🛑 Limit devrede (%${daily.pnlPct} / -%${daily.limitPct}) · ${daily.action === 'flatten' ? 'pozisyonlar kapatıldı' : 'yeni giriş yok'}`, 'var(--accent-danger)');
  } else {
    rkSet('rkDailySub', `Gün başı ${rkMoney(daily.startEquity)} · %${daily.pnlPct} · limite ${rkMoney(daily.remainingUSDT)} kaldı (-%${daily.limitPct})`, 'var(--text-muted)');
  }

  const dailyBtn = document.getElementById('btnResetDailyHalt');
  if (dailyBtn) dailyBtn.classList.toggle('is-hidden', !daily.haltTriggered);

  // Aktif kademe
  if (risk.equityTiersEnabled === false) {
    rkSet('rkTier', 'KAPALI', 'var(--text-muted)');
    rkSet('rkTierSub', 'Kademeli risk azaltma devre dışı');
  } else {
    const tierColor = tier.haltNewEntries ? 'var(--accent-danger)'
      : (tier.index > 0 ? 'var(--accent-warning)' : 'var(--accent-success)');
    rkSet('rkTier', tier.label || 'Normal', tierColor);
    rkSet('rkTierSub', `Boyut ×${tier.sizeMultiplier != null ? tier.sizeMultiplier : 1}${tier.haltNewEntries ? ' · yeni giriş yok' : ''} · sonraki eşik %${tier.nextDdPct}`, 'var(--text-muted)');
  }

  // Frenlerin özeti (Canlı İzleme "Risk durumu" kartıyla aynı hesap)
  const brakes = frenOzeti(risk).frenler;
  rkSet('rkBrakes', brakes.length ? brakes.join(' + ') : 'AÇIK',
    brakes.length ? 'var(--accent-danger)' : 'var(--accent-success)');
  // Anti-martingale çarpanı fren değil ama boyutu sessizce dörtte bire kadar
  // indirebiliyor — özet satırında görünmesi gerekiyor.
  const amMult = risk.antiMartingaleMultiplier != null ? risk.antiMartingaleMultiplier : 1;
  const streakInfo = `Seri kayıp ${risk.consecutiveLosses || 0}/${risk.maxLossStreak || 3}`
    + (amMult < 1 ? ` · boyut ×${amMult}` : '');
  rkSet('rkBrakesSub', brakes.length
    ? `Yeni pozisyon açılmıyor · ${streakInfo}`
    : `${streakInfo} · işlemler sürüyor`,
    brakes.length ? 'var(--accent-danger)' : (amMult < 1 ? 'var(--accent-warning)' : 'var(--text-muted)'));

  renderTierTable(risk);
  markActiveTier(risk);
  renderRiskPositions(risk);
}

  /* ── Dışarı açılan adlar (app.js / öteki js/app parçaları kullanır) ── */
  Object.assign(window, { frenOzeti, loadDrawdownStats, populateRiskForm, renderClusterScan, renderRiskTab, textToClusters });
  // Paylaşılan durum: okuyan ve yazan (olaylar.js) öteki dosyalar için erişimci.
  Object.defineProperties(window, {
    rkTierSignature: { configurable: true, get: () => rkTierSignature, set: (v) => { rkTierSignature = v; } }
  });
})();
