/**
 * OLAY BAĞLAMA — `bindFormEvents()` (eski app.js gövdesi)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Grafik denetimleri, ayar/risk/Telegram/sağlık formları, kâğıt bot başlat/durdur, izleme listesi,
 * backtest ve optimizasyon düğmeleri, sanal cüzdan, acil fren — hepsi tek fonksiyonda, app.js'in
 * DOMContentLoaded işleyicisinden BİR KEZ çağrılır. Yıkıcı her işlem AG.onayla ile onaylı.
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

// Bind Form Events
function bindFormEvents() {
  // --- Chart controls. Deliberately separate from the bot-config selectors:
  // populateConfigForms() resets those on every config change, which would
  // yank the chart back to the bot's symbol/timeframe mid-inspection. ---
  ['chartSymbolSelect', 'chartTimeframeSelect', 'chartBarCount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => applyChartSelection(true));
  });

  const btnReloadChart = document.getElementById('btnReloadChart');
  if (btnReloadChart) {
    btnReloadChart.addEventListener('click', () => applyChartSelection(true));
  }

  // Sanal cüzdan bakiyesi (Ayarlar → Sanal cüzdan)
  const btnApplyBalance = document.getElementById('btnApplyBalance');
  if (btnApplyBalance) {
    btnApplyBalance.addEventListener('click', async () => {
      const mode = document.getElementById('selBalanceMode')?.value || 'set';
      const inp = document.getElementById('inpBalanceAmount');
      const amount = parseFloat(inp?.value);

      if (!Number.isFinite(amount) || amount < 0) {
        AG.bildir('Geçerli bir tutar girin.', 'uyari');
        return;
      }

      const labels = { set: 'ayarlanacak', deposit: 'eklenecek', withdraw: 'çekilecek' };
      if (!(await AG.onayla({
        baslik: 'Sanal bakiye değişsin mi?',
        metin: `Sanal cüzdana $${amount.toLocaleString('tr-TR')} ${labels[mode]}.`,
        onay: 'Uygula'
      }))) return;

      btnApplyBalance.disabled = true;
      try {
        const data = await AG.api.cuzdanBakiye(mode, amount);

        if (!data.success) {
          AG.bildir('Bakiye güncellenemedi: ' + (data.error || `HTTP ${data[AG.api.DURUM]}`));
          return;
        }

        if (inp) inp.value = '';
        AG.bildir(`✅ ${data.message}\n\nPortföy değeri: $${Number(data.equity).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`);
        await fetchInitialData();
        fetchDockBalanceHistory();
      } catch (err) {
        AG.bildir('Bakiye güncellenemedi: ' + err.message);
      } finally {
        btnApplyBalance.disabled = false;
      }
    });
  }

  const btnStopAll = document.getElementById('btnStopAllBots');
  if (btnStopAll) {
    btnStopAll.addEventListener('click', async () => {
      const running = (lastState && lastState.bots) ? lastState.bots.length : 0;
      if (running === 0) { AG.bildir('Çalışan bot yok.'); return; }
      if (!(await AG.onayla({
        baslik: 'Tüm botlar durdurulsun mu?',
        metin: `${running} botun tamamı durdurulacak. Açık pozisyonlar KAPATILMAZ; yönetimsiz kalırlar.`,
        onay: 'Hepsini durdur',
        tehlikeli: true
      }))) return;

      btnStopAll.disabled = true;
      try {
        const data = await AG.api.botHepsiniDurdur();
        if (!data.success) {
          AG.bildir('Botlar durdurulamadı: ' + (data.error || `HTTP ${data[AG.api.DURUM]}`));
          return;
        }
        currentConfig.bots = [];
        currentConfig.activeSymbols = [];
        multiSymbolRenderedState = null;
        await fetchInitialData();
        fetchWatchlistUI();
      } catch (err) {
        AG.bildir('Botlar durdurulamadı: ' + err.message);
      } finally {
        btnStopAll.disabled = false;
      }
    });
  }

  /**
   * Kill-switch, drawdown limitine değildiği için botları durdurmuştu;
   * sıfırlamak botları AYNI drawdown altında yeniden işleme sokar.
   */
  const killSwitchOnay = () => {
    const r = (lastState && lastState.riskStatus) || {};
    const dd = Number(r.drawdownPct);
    const ek = Number.isFinite(dd) ? `\n\nGüncel düşüş: %${dd.toFixed(2)} · limit %${r.maxDrawdownPct || '—'}` : '';
    return AG.onayla({
      baslik: 'Kâğıt test acil freni sıfırlansın mı?',
      metin: `Botlar yeniden işlem açmaya başlayacak. Kill-switch'i tetikleyen kayıp geri gelmez.${ek}`,
      onay: 'Sıfırla ve devam et',
      tehlikeli: true
    });
  };

  const btnKill = document.getElementById('btnResetKillSwitch');
  if (btnKill) {
    btnKill.addEventListener('click', async () => {
      if (!(await killSwitchOnay())) return;
      const data = await AG.api.killSwitchSifirla();
      if (data.success) {
        AG.bildir('Kâğıt test acil freni sıfırlandı. Kâğıt botlar yeniden çalışmaya başlıyor.', 'ok');
        await fetchInitialData();
      } else {
        AG.bildir('Acil fren sıfırlanamadı: ' + (data.error || `HTTP ${data[AG.api.DURUM]}`), 'hata');
      }
    });
  }

  // Drawdown paneli: pencere değişince hemen; sekme AÇIKKEN dakikada bir.
  // Sekme açılınca `sekmeyiAc` bekletmeden tazeler. Equity örneklemesi de
  // dakikalık olduğu için daha sık çekmek yeni veri getirmez.
  const ddRange = document.getElementById('selDdRange');
  if (ddRange) {
    ddRange.addEventListener('change', loadDrawdownStats);
    setInterval(() => { if (sekmeAcik('tab-risk')) loadDrawdownStats(); }, 60000);
  }

  // Günlük zarar limitini gün bitmeden elle kaldır. Referans sermaye o anki
  // seviyeye çekilir — aksi halde limit bir sonraki tick'te yine tetiklenirdi.
  const btnResetDaily = document.getElementById('btnResetDailyHalt');
  if (btnResetDaily) {
    btnResetDaily.addEventListener('click', async () => {
      if (!(await AG.onayla({
        baslik: 'Günlük zarar limiti kaldırılsın mı?',
        metin: 'Gün başı referansı şu anki sermayeye çekilecek.\n\nBugünün kaybı sıfırlanmış sayılır — limit yeniden en baştan işlemeye başlar.',
        onay: 'Limiti kaldır',
        tehlikeli: true
      }))) return;
      const data = await AG.api.riskGunlukSifirla();
      if (data.success) {
        AG.bildir(`✅ Günlük zarar limiti sıfırlandı. Yeni gün başı referansı: $${data.daily.startEquity}`);
        await fetchInitialData();
      }
    });
  }

  // Kademe merdivenini varsayılana döndür: riskTiers'ı silmek yeterli,
  // sunucu eşikleri yeniden maxDrawdownPct oranından türetir.
  const btnResetTiers = document.getElementById('btnResetTiers');
  if (btnResetTiers) {
    btnResetTiers.addEventListener('click', async () => {
      if (!(await AG.onayla({
        baslik: 'Kademe merdiveni sıfırlansın mı?',
        metin: 'Merdiven varsayılana (acil fren sınırının %40 / %60 / %80\'i) dönecek.',
        onay: 'Varsayılana dön'
      }))) return;
      const data = await AG.api.ayarYaz({ risk: { riskTiers: [] } });
      if (data.success) {
        currentConfig = data.config;
        rkTierSignature = null; // merdiven değişti, tablo yeniden çizilsin
        kirliFormlar.delete('formRisk');
        populateConfigForms(currentConfig);
        AG.bildir('✅ Kademe merdiveni varsayılana döndürüldü.');
      }
    });
  }

  // Korelasyondan küme haritası öner. Sunucu YALNIZCA hesaplar; öneri metin
  // alanına doldurulur ama kaydedilmez — risk parametresini yazan tek yol
  // formun Kaydet'i ve o yol kullanıcının onayından geçer.
  const btnClusterScan = document.getElementById('btnClusterScan');
  if (btnClusterScan) {
    btnClusterScan.addEventListener('click', async () => {
      const kutu = document.getElementById('clusterScanResult');
      AG.dom.mesgul(btnClusterScan, 'Hesaplanıyor…');

      try {
        const data = await AG.api.riskKumeTaramasi(currentConfig?.timeframe || '1h', 500, 0.7);
        if (!data.success) {
          AG.bildir(`❌ Küme taraması başarısız: ${data.error}`);
          return;
        }
        renderClusterScan(data);
        if (kutu) kutu.classList.remove('is-hidden');
      } catch (err) {
        AG.bildir(`❌ Küme taraması başarısız: ${err.message}`);
      } finally {
        AG.dom.hazir(btnClusterScan);
      }
    });
  }

  document.getElementById('formRisk')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const num = (id, fallback) => {
      const raw = parseFloat(document.getElementById(id)?.value);
      return Number.isFinite(raw) ? raw : fallback;
    };
    const checked = (id) => document.getElementById(id)?.checked === true;

    const maxDrawdownPct = num('inpMaxDrawdown', 10.0);

    // Kademe merdivenini tablodan oku. Eşikler mutlak yüzde olarak yazılır —
    // kullanıcı bir kez elle değiştirdiyse artık maxDrawdownPct oranına
    // bağlı kalmasın, girdiği sayı geçerli olsun.
    const riskTiers = Array.from(document.querySelectorAll('#tblRiskTiers tbody tr'))
      .filter(tr => tr.dataset.tierIndex)
      .map(tr => ({
        label: tr.querySelector('.rk-tier-label')?.value.trim() || 'Kademe',
        ddPct: parseFloat(tr.querySelector('.rk-tier-dd')?.value),
        sizeMultiplier: parseFloat(tr.querySelector('.rk-tier-mult')?.value),
        haltNewEntries: tr.querySelector('.rk-tier-halt')?.checked === true
      }))
      .filter(t => Number.isFinite(t.ddPct) && Number.isFinite(t.sizeMultiplier));

    const invalidTier = riskTiers.find(t => t.ddPct <= 0 || t.ddPct >= maxDrawdownPct);
    if (invalidTier) {
      AG.bildir(`❌ "${invalidTier.label}" kademesinin eşiği %${invalidTier.ddPct}. Eşikler 0 ile acil fren sınırı (%${maxDrawdownPct}) arasında olmalı — limite eşit veya üstündeki bir kademe hiç devreye giremez.`);
      return;
    }

    const atrMin = num('inpAtrStopMin', 0.8);
    const atrMax = num('inpAtrStopMax', 6.0);
    if (atrMin >= atrMax) {
      AG.bildir(`❌ ATR stop alt sınırı (%${atrMin}) üst sınırdan (%${atrMax}) küçük olmalı. Aksi halde stop mesafesi tek bir değere sabitlenir ve ATR'nin bir anlamı kalmaz.`);
      return;
    }

    const tierRowCount = document.querySelectorAll('#tblRiskTiers tbody tr[data-tier-index]').length;

    const updated = {
      risk: {
        ...currentConfig.risk,
        stopLossPct: num('inpStopLoss', 2.0),
        takeProfitPct: num('inpTakeProfit', 4.0),
        trailingStopPct: num('inpTrailingStop', 1.5),
        trailingStop: checked('chkTrailingStop'),
        maxPositionSizePct: num('inpMaxPositionSize', 25),
        minOrderUSDT: num('inpMinOrderUSDT', 10),
        maxOpenRiskPct: num('inpMaxOpenRisk', 6.0),
        openRiskLimitEnabled: checked('chkOpenRiskLimit'),
        maxDrawdownPct,
        tierHysteresisPct: num('inpTierHysteresis', 1.0),
        equityTiersEnabled: checked('chkEquityTiers'),
        maxLossStreak: num('inpMaxLossStreak', 3),
        cooldownMinutes: num('inpCooldownMinutes', 15),
        cooldownEnabled: checked('chkCooldownEnabledForm'),
        antiMartingaleEnabled: checked('chkAntiMartingale'),
        antiMartingaleStep: num('inpAntiMartStep', 0.25),
        antiMartingaleFloor: num('inpAntiMartFloor', 0.25),
        lossStreakResetMode: document.getElementById('selLossStreakReset')?.value === 'step' ? 'step' : 'full',
        lossStreakDecayMinutes: Math.max(0, Math.round(num('inpLossStreakDecay', 0))),
        dailyLossLimitPct: num('inpDailyLossLimit', 3.0),
        dailyLossLimitEnabled: checked('chkDailyLossLimit'),
        dailyLossAction: document.getElementById('selDailyLossAction')?.value === 'flatten' ? 'flatten' : 'halt',
        dayResetHour: Math.min(23, Math.max(0, Math.round(num('inpDayResetHour', 0)))),
        riskSizingEnabled: checked('chkRiskSizing'),
        splitCashCapAcrossBots: checked('chkSplitCashCap'),
        riskPerTradePct: num('inpRiskPerTrade', 1.0),
        maxRiskPerBotPct: num('inpMaxRiskPerBot', 2.0),
        atrStopEnabled: checked('chkAtrStop'),
        atrPeriod: Math.max(2, Math.round(num('inpAtrStopPeriod', 14))),
        atrTimeframe: document.getElementById('selAtrTimeframe')?.value || '1h',
        atrStopMultiplier: num('inpAtrStopMultiplier', 2.0),
        atrStopMinPct: num('inpAtrStopMin', 0.8),
        atrStopMaxPct: num('inpAtrStopMax', 6.0),
        takeProfitRR: num('inpTakeProfitRR', 2.0),
        strategyStopPrecedence: checked('chkStrategyStopPrecedence'),
        exposureLimitsEnabled: checked('chkExposureLimits'),
        maxConcurrentPositions: Math.max(1, Math.round(num('inpMaxConcurrent', 10))),
        maxSymbolExposurePct: num('inpMaxSymbolExposure', 15),
        maxClusterExposurePct: num('inpMaxClusterExposure', 40),
        maxGrossExposurePct: num('inpMaxGrossExposure', 80)
      }
    };

    // Küme haritası yalnızca metin alanı gerçekten doluysa gönderilir. Boş bir
    // harita göndermek tüm sembolleri "Sınıflandırılmamış" tek kümeye yığar —
    // bu, alan henüz doldurulmamışken sessizce olmamalı.
    const clusterText = document.getElementById('txtClusters')?.value || '';
    if (clusterText.trim()) {
      const clusters = textToClusters(clusterText);
      if (!Object.keys(clusters).length) {
        AG.bildir('❌ Küme tanımları okunamadı. Her satır "Küme adı: SEMBOL, SEMBOL" biçiminde olmalı.');
        return;
      }
      updated.risk.clusters = clusters;
    }

    // Merdiven tablosu sunucudan gelen riskStatus ile çizilir. Motor durmuşsa
    // tablo hiç dolmamış olabilir; o durumda boş bir dizi göndermek merdiveni
    // sessizce varsayılana döndürürdü. Satır yoksa alan hiç gönderilmez ve
    // mevcut merdiven olduğu gibi kalır.
    if (tierRowCount > 0) updated.risk.riskTiers = riskTiers;

    const btn = document.getElementById('btnSaveRisk');
    if (btn) btn.disabled = true;
    try {
      const data = await AG.api.ayarYaz(updated);
      if (data.success) {
        currentConfig = data.config;
        rkTierSignature = null; // eşikler değişmiş olabilir, tabloyu tazele
        kirliFormlar.delete('formRisk');
        populateConfigForms(currentConfig);
        AG.bildir('✅ Risk ayarları kaydedildi ve motora uygulandı.');
      } else {
        AG.bildir('❌ Risk ayarları kaydedilemedi.');
      }
    } catch (err) {
      AG.bildir(`❌ Risk ayarları kaydedilemedi: ${err.message}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Tehlikeli Bölge: tüm geçmişi sil + sanal cüzdanı başlangıç bakiyesine döndür
  const btnResetAll = document.getElementById('btnResetAll');
  if (btnResetAll) {
    btnResetAll.addEventListener('click', async () => {
      if (!(await AG.onayla({
        baslik: 'Her şey sıfırlansın mı?',
        metin: 'Tüm işlem geçmişi silinecek, açık pozisyonlar kapatılacak ve sanal cüzdan başlangıç bakiyesine döndürülecek. Bu işlem GERİ ALINAMAZ.',
        onay: 'Hepsini sıfırla',
        tehlikeli: true
      }))) return;
      try {
        const data = await AG.api.hepsiniSifirla();
        if (data.success) {
          AG.bildir('✅ Tüm geçmiş temizlendi, sanal cüzdan başlangıç bakiyesine döndü.');
          fetchInitialData();
          fetchDockBalanceHistory();
        }
      } catch (err) {
        AG.bildir('Sıfırlama hatası: ' + err.message);
      }
    });
  }

  // Inline watchlist add — the number of bots is capped by the watchlist, and
  // sending it to the settings tab for that is a dead end.
  const btnQuickAdd = document.getElementById('btnQuickAddSymbol');
  const inpQuickAdd = document.getElementById('inpQuickAddSymbol');
  if (btnQuickAdd && inpQuickAdd) {
    const quickAdd = async () => {
      const raw = (inpQuickAdd.value || '').trim();
      if (!raw) return;

      btnQuickAdd.disabled = true;
      try {
        const data = await AG.api.izlemeEkle(raw, document.getElementById('dashSelectTimeframe')?.value || '1h');

        if (!data.success) {
          AG.bildir('Varlık eklenemedi: ' + (data.error || `HTTP ${data[AG.api.DURUM]}`));
          return;
        }

        inpQuickAdd.value = '';
        currentConfig.watchlist = data.watchlist;
        await fetchWatchlistUI();
      } catch (err) {
        AG.bildir('Varlık eklenemedi: ' + err.message);
      } finally {
        btnQuickAdd.disabled = false;
      }
    };

    btnQuickAdd.addEventListener('click', quickAdd);
    inpQuickAdd.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); quickAdd(); }
    });
  }

  // The single bot-start flow: strategy + timeframe + selected assets, applied
  // together so a half-configured run can never happen.
  const btnSaveMulti = document.getElementById('btnSaveMultiSymbols');
  if (btnSaveMulti) {
    btnSaveMulti.addEventListener('click', async () => {
      const container = document.getElementById('multiSymbolCheckboxes');
      const scope = container || document;
      const symbols = Array.from(scope.querySelectorAll('.chk-multi-symbol:checked')).map(chk => chk.value);
      const strategy = document.getElementById('dashSelectStrategy')?.value;
      const timeframe = document.getElementById('dashSelectTimeframe')?.value;

      if (symbols.length === 0) {
        AG.bildir('Lütfen en az 1 varlık seçin.\n\nÇalışan botları durdurmak için tablodaki ⛔ Durdur düğmesini kullanın.');
        return;
      }
      if (!strategy || !timeframe) {
        AG.bildir('Strateji ve zaman dilimi seçilmelidir.', 'uyari');
        return;
      }

      AG.dom.mesgul(btnSaveMulti, '⚡ Başlatılıyor...');

      try {
        const data = await AG.api.botCalistir(strategy, timeframe, symbols);

        if (!data.success) {
          AG.bildir('Botlar başlatılamadı: ' + (data.error || `HTTP ${data[AG.api.DURUM]}`));
          return;
        }

        // Adopt the server's list before refreshing so the checkbox renderer
        // does not mistake this for a stale in-progress edit.
        currentConfig.activeSymbols = data.activeSymbols;
        currentConfig.activeStrategy = data.strategy;
        currentConfig.timeframe = data.timeframe;
        currentConfig.bots = data.bots;
        multiSymbolRenderedState = null;

        const head = data.newBotCount > 0
          ? `⚡ ${data.newBotCount} Bot Başlatıldı`
          : `ℹ️ Bu kurulum zaten çalışıyor`;
        AG.bildir(
          `${head}\n\n` +
          `Strateji: ${data.strategyName}\n` +
          `Zaman Dilimi: ${data.timeframe}\n` +
          `Varlık: ${data.startedSymbols.join(', ')}\n\n` +
          `Toplam çalışan bot: ${data.bots.length}`,
          data.newBotCount > 0 ? 'ok' : 'bilgi'
        );

        isBotRunning = true;
        await fetchInitialData();
        fetchWatchlistUI();
      } catch (err) {
        AG.bildir('Botlar başlatılamadı: ' + err.message);
      } finally {
        AG.dom.hazir(btnSaveMulti);
      }
    });
  }

  /**
   * PİYASA VERİSİ (Ayarlar). Eskiden Strateji sekmesindeydi ve Backtest'in
   * borsa seçicisiyle İKİ YÖNLÜ eşleniyordu: backtestte borsa değiştirmek canlı
   * seçiciyi de değiştiriyor, sonraki kayıt canlı borsayı sessizce değiştiriyordu.
   * Artık bağımsız ve kendi Kaydet'i var.
   */
  document.getElementById('selExchangeProvider')?.addEventListener('change', syncVadeliKontroller);
  // Vadeli kontrolleri anında tepki versin: kaldıraç yazılırken likidasyon
  // mesafesinin ve motorun reddedeceği stop eşiğinin görünmesi gerekiyor.
  document.getElementById('selMarketType')?.addEventListener('change', syncVadeliKontroller);
  document.getElementById('numLeverage')?.addEventListener('input', syncVadeliKontroller);

  document.getElementById('formMarket')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const perpSecili = document.getElementById('selMarketType')?.value === 'perpetual';
    const parca = {
      exchange: document.getElementById('selExchangeProvider')?.value || 'binance',
      marketType: perpSecili ? 'perpetual' : 'spot',
      // Kaldıraç yalnızca vadelide anlamlı; spotta 1'e sabitlenir ki piyasa
      // tipi geri alındığında eski bir kaldıraç sessizce yürürlükte kalmasın.
      leverage: perpSecili ? Math.max(1, Math.min(100, Number(document.getElementById('numLeverage')?.value) || 1)) : 1
    };
    try {
      const data = await AG.api.ayarYaz(parca);
      if (!data.success) { AG.bildir('Kaydedilemedi: ' + (data.error || `HTTP ${data[AG.api.DURUM]}`), 'hata'); return; }
      currentConfig = data.config;
      kirliFormlar.delete('formMarket');
      populateConfigForms(currentConfig);
      AG.bildir(`✅ Piyasa verisi: ${parca.exchange} · ${perpSecili ? `vadeli ${parca.leverage}x` : 'spot'}`);
    } catch (err) {
      AG.bildir('Kaydedilemedi: ' + err.message, 'hata');
    }
  });

  // İzleme listesi rozetleri seçili önbellek dilimine göre.
  const selCacheTf = document.getElementById('selWatchlistCacheTf');
  if (selCacheTf) selCacheTf.addEventListener('change', fetchWatchlistUI);

  // Watchlist Add & Preload Buttons
  const izlemeyeEkle = async () => {
    const inp = document.getElementById('inpAddWatchlistSymbol');
    const val = inp?.value?.trim();
    if (!val) return;

    const tf = selCacheTf ? selCacheTf.value : '1h';

    try {
      const data = await AG.api.izlemeEkle(val, tf);
      if (data.success) {
        if (inp) inp.value = '';
        fetchWatchlistUI();
      } else {
        AG.bildir('Varlık eklenemedi: ' + data.error, 'hata');
      }
    } catch (e) {
      AG.bildir('Varlık eklenemedi: ' + e.message, 'hata');
    }
  };
  document.getElementById('btnAddWatchlistSymbol')?.addEventListener('click', izlemeyeEkle);
  document.getElementById('inpAddWatchlistSymbol')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); izlemeyeEkle(); }
  });

  document.getElementById('btnPreloadWatchlist')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnPreloadWatchlist');
    AG.dom.mesgul(btn, '⚡ Veriler Yükleniyor...');

    const tf = selCacheTf ? selCacheTf.value : '1h';

    try {
      const data = await AG.api.izlemeOnyukle(tf);
      if (data.success) {
        setTimeout(fetchWatchlistUI, 3000);
      }
    } catch (e) {
      AG.bildir('Ön yükleme hatası: ' + e.message);
    } finally {
      setTimeout(() => AG.dom.hazir(btn), 3000);
    }
  });

  /**
   * Stratejiler → Parametreler: YALNIZ seçili stratejinin parametreleri yazılır.
   * Eskiden aynı form işlem modu, sembol ve zaman dilimi de yazıyordu; üçü de
   * her bot başlatmada ezildiği için etkisizdi (mod seçicisi ayrıca yanlıştı).
   */
  document.getElementById('formStrategy')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = strategyParamState.key;
    const meta = strategyCatalog.find(x => x.key === key);
    if (!key || !meta) return;
    const btn = document.getElementById('btnSaveStrategyParams');
    if (btn) btn.disabled = true;
    try {
      // Sunucu `strategies`i derin birleştirir; diğer stratejilere dokunulmaz.
      const data = await AG.api.ayarYaz({ strategies: { [key]: { ...strategyParamState.values } } });
      if (!data.success) { AG.bildir(`❌ Kaydedilemedi: ${data.error || 'bilinmeyen hata'}`); return; }
      currentConfig = data.config;
      kirliFormlar.delete('formStrategy');
      renderStrategyParams(key);
      AG.bildir(`✅ ${meta.label}: ${Object.keys(strategyParamState.values).length} parametre kaydedildi.`);
    } catch (err) {
      AG.bildir('Kaydedilemedi: ' + err.message, 'hata');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  /**
   * BACKTEST / OPTİMİZASYON / WALK-FORWARD — tarih aralıklı iş akışı
   * (`js/pages/backtestIs.js` → `/api/backtest/is`).
   *
   * Eskiden: "son N mum" (en çok 5000), senkron istek, ve form backtest
   * borsasını CANLI ayara yazıyordu (`ayarYaz({ exchange })`) — backtestte
   * borsa değiştirmek botun borsasını da sessizce değiştiriyordu. Artık
   * borsa/piyasa/kaldıraç yalnız bu koşuya gider.
   */
  const btIs = () => AG.pages.backtestIs;

  const formBt = document.getElementById('formBacktest');
  if (formBt) {
    formBt.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnRunBacktest');
      AG.dom.mesgul(btn, 'Backtest çalışıyor…');
      try {
        const sonuc = await btIs().calistir('tek', { strategyName: document.getElementById('btStrategy')?.value });
        renderBacktestResults(sonuc);
      } catch (err) {
        AG.bildir('Backtest: ' + err.message);
      } finally {
        AG.dom.hazir(btn);
      }
    });
  }

  const btnOpt = document.getElementById('btnOptimizeParams');
  if (btnOpt) {
    btnOpt.addEventListener('click', async () => {
      AG.dom.mesgul(btnOpt, 'Optimize ediliyor…');
      try {
        const sonuc = await btIs().calistir('optimize', {
          strategyName: document.getElementById('btStrategy')?.value,
          // Boş dizi gönderilirse sunucu kendi varsayılan seçimini yapar.
          optimizeParams: secilenOptParams()
        });
        renderOptimizationResults(sonuc);
      } catch (err) {
        AG.bildir('Optimizasyon: ' + err.message);
      } finally {
        AG.dom.hazir(btnOpt);
      }
    });
  }

  // Walk-forward: kayan pencere, %70 eğitim / %30 test (lib/backtest/optimize.js)
  const btnWf = document.getElementById('btnWalkForward');
  if (btnWf) {
    btnWf.addEventListener('click', async () => {
      AG.dom.mesgul(btnWf, 'Walk-forward hesaplanıyor…');
      try {
        const sonuc = await btIs().calistir('walkforward', {
          strategyName: document.getElementById('btStrategy')?.value,
          // Walk-forward EĞİTİM penceresinde optimize eder; aranacak parametreler
          // burada da geçerli.
          optimizeParams: secilenOptParams(),
          katSayisi: parseInt(document.getElementById('btWfFolds')?.value || '4', 10)
        });
        renderWalkForwardResults(sonuc);
      } catch (err) {
        AG.bildir('Walk-forward: ' + err.message);
      } finally {
        AG.dom.hazir(btnWf);
      }
    });
  }

  /**
   * İZLEME LİSTESİ TARAMASI — tarih aralıklı, iş parçacığında, ÖRNEKLEM DIŞI
   * sıralama: ilk %70'te parametre aranır, sıra son %30'daki sonuca göre.
   * Eskiden tüm veride optimize edip aynı verideki skora göre sıralıyordu.
   */
  const btnScan = document.getElementById('btnScanWatchlist');
  if (btnScan) {
    btnScan.addEventListener('click', async () => {
      AG.dom.mesgul(btnScan, 'İzleme listesi taranıyor…');
      try {
        const sonuc = await AG.pages.backtestIs.calistir('tarama', {});
        renderWatchlistResults(sonuc);
      } catch (err) {
        AG.bildir('Tarama: ' + err.message);
      } finally {
        AG.dom.hazir(btnScan);
      }
    });
  }

  /**
   * YENİDEN TEST — form değişmiş olsa bile SON SONUCUN verisinde (sembol,
   * dilim, aralık, piyasa) koşar; eskiden formu okuyordu ve "güncellenmiş"
   * test başka bir veride koşabiliyordu.
   */
  const btnRerun = document.getElementById('btnRerunCustomBacktest');
  if (btnRerun) {
    btnRerun.addEventListener('click', async () => {
      AG.dom.mesgul(btnRerun, 'Yeniden test ediliyor…');
      const stratKey = currentInspectedStrategyKey || document.getElementById('btStrategy')?.value;
      const son = anLastResult || {};
      const v = son.varsayimlar || {};
      const ek = { strategyName: stratKey, customConfig: getTunedParametersFromInputs(stratKey) };
      if (son.symbol) ek.symbol = son.symbol;
      if (son.timeframe) ek.timeframe = son.timeframe;
      if (v.bas) ek.bas = v.bas.slice(0, 10);
      if (v.bit) ek.bit = v.bit.slice(0, 10);
      if (v.piyasa) ek.market = v.piyasa;
      if (v.borsa) ek.venue = v.borsa;
      if (v.kaldirac) ek.leverage = v.kaldirac;
      try {
        const sonuc = await btIs().calistir('tek', ek);
        renderBacktestResults(sonuc, `Güncellenmiş ayarlarla: ${sonuc.symbol} · ${stratKey}`);
      } catch (err) {
        AG.bildir('Yeniden test: ' + err.message);
      } finally {
        AG.dom.hazir(btnRerun);
      }
    });
  }

  /**
   * "Bu ayarları bota yükle": test edilen parametreleri o stratejinin kayıtlı
   * ayarına yazar. Yalnız PARÇA gönderilir; eskiden tüm config gönderiliyordu
   * ve araya giren başka bir yazımı geri alabiliyordu.
   */
  const btnApplyTuned = document.getElementById('btnApplyTunedToLive');
  if (btnApplyTuned) {
    btnApplyTuned.addEventListener('click', async () => {
      const stratKey = currentInspectedStrategyKey || document.getElementById('btStrategy')?.value;
      if (!stratKey) return;
      await stratejiAyariYaz(stratKey, getTunedParametersFromInputs(stratKey));
    });
  }

  document.getElementById('formTelegram')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const updated = {
      telegram: {
        enabled: document.getElementById('chkTgEnabled')?.checked || false,
        botToken: document.getElementById('inpTgToken')?.value || '',
        // Boş bırakılırsa kayıtlı chat id korunur (Ö18 / A-04: panel maskeli gösterir; sunucu boş/maskeli değeri yazmaz).
        chatId: (document.getElementById('inpTgChatId')?.value || '').trim(),
        notifyCritical: document.getElementById('chkTgCritical')?.checked !== false,
        notifyErrors: document.getElementById('chkTgErrors')?.checked !== false,
        notifyLifecycle: document.getElementById('chkTgLifecycle')?.checked !== false,
        notifyTrades: document.getElementById('chkTgTrades')?.checked === true
      }
    };
    // Kaydın gerçekten sunucuya ulaştığını doğrulamadan "kaydedildi" demek,
    // sunucu kapalıyken sessiz başarısızlığa yol açıyordu.
    try {
      const data = await AG.api.ayarYaz(updated);

      if (!data.success) {
        AG.bildir('Ayarlar kaydedilemedi: ' + (data.error || `HTTP ${data[AG.api.DURUM]}`));
        return;
      }

      currentConfig = data.config;
      kirliFormlar.delete('formTelegram');
      const tg = data.config.telegram || {};
      AG.bildir(
        `✅ Telegram ayarları kaydedildi\n\n` +
        `Durum: ${tg.enabled ? 'Etkin' : 'Kapalı'}\n` +
        `Token: ${(data.config.sirlar || {}).telegramBotToken ? 'kayıtlı' : 'BOŞ'}\n` +
        `Chat ID: ${tg.chatId ? `${tg.chatId} (maskeli)` : 'BOŞ'}\n\n` +
        `Şimdi "Test mesajı gönder" ile deneyebilirsiniz.`
      );
    } catch (err) {
      AG.bildir('Ayarlar kaydedilemedi — sunucuya ulaşılamıyor.\n\n' + err.message +
            '\n\nSunucu çalışıyor mu? (node server.js)');
    }
  });

  document.getElementById('formSaglik')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const govde = {};
    const bot = (document.getElementById('inpHcUrl')?.value || '').trim();
    const denge = (document.getElementById('inpHcUrlDenge')?.value || '').trim();   // 68.8: Denge kendi check'i
    const sunucu = (document.getElementById('inpHcSunucuUrl')?.value || '').trim();
    if (bot) govde.healthchecksUrl = bot;
    if (denge) govde.botSaglik = { denge };
    if (sunucu) govde.healthchecksSunucuUrl = sunucu;
    if (!Object.keys(govde).length) { AG.bildir('Boş — kaydedilecek URL yok. Kaldırmak için "URL\'leri kaldır".', 'uyari'); return; }
    const dolu = [bot, denge, sunucu].filter(Boolean);
    if (new Set(dolu).size !== dolu.length) { AG.bildir('URL\'ler aynı olamaz: Hücum, Denge ve sunucu kalp atışı healthchecks.io\'da ayrı check olmalı (aynı URL bir botun durmasını gizler).', 'uyari'); return; }
    try { await saglikKaydet(govde, 'Sağlık sinyali kaydedildi. Şimdi "Test sinyali gönder" ile deneyin.'); }
    catch (err) { AG.bildir('Sunucuya ulaşılamıyor: ' + err.message, 'hata'); }
  });

  document.getElementById('btnHcSil')?.addEventListener('click', async () => {
    const onay = await AG.onayla({ baslik: 'Sağlık sinyali URL\'leri kaldırılsın mı?', metin: 'Hücum, Denge ve sunucu ping URL\'leri silinir; healthchecks.io\'ya sinyal gitmez ve check\'ler bir süre sonra "down" olur (healthchecks\'te check\'leri duraklatmayı unutmayın).', onay: 'Kaldır', tehlikeli: true });
    if (!onay) return;
    try { await saglikKaydet({ healthchecksUrl: '', healthchecksSunucuUrl: '', botSaglik: { denge: '' } }, 'Sağlık sinyali URL\'leri kaldırıldı.'); }
    catch (err) { AG.bildir('Sunucuya ulaşılamıyor: ' + err.message, 'hata'); }
  });

  document.getElementById('btnHcTest')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnHcTest');
    if (btn) btn.disabled = true;
    try {
      const r = await AG.api.saglikTest();
      const s = r.sonuc || {};
      const satir = (ad, x) => !x || !x.ayarli ? `${ad}: ayarlı değil` : (x.ok ? `${ad}: gönderildi ✓` : `${ad}: GÖNDERİLEMEDİ (${x.hata})`);
      // 68.8: bot başına (s.botlar); eski sunucuda tek "bot" satırı
      const botSatirlari = s.botlar ? [satir('Hücum', s.botlar.hucum), satir('Denge', s.botlar.denge)] : [satir('Bot sinyali', s.bot)];
      const metin = [...botSatirlari, satir('Sunucu kalp atışı', s.sunucu)].join('\n');
      if (r.success) AG.bildir('✅ Test sinyali gönderildi — healthchecks.io\'da check "up" görünmeli.\n\n' + metin, 'ok');
      else AG.bildir('❌ ' + (r.error || 'Test başarısız') + (r.sonuc ? '\n\n' + metin : ''), 'hata');
    } catch (err) {
      AG.bildir('❌ Sunucuya ulaşılamıyor.\n\n' + err.message, 'hata');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById('btnTestTg')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnTestTg');
    if (btn) btn.disabled = true;
    try {
      const data = await AG.api.telegramTest();

      if (data.success) {
        AG.bildir('✅ Test mesajı gönderildi.\n\nTelegram\'ı kontrol edin.');
      } else {
        AG.bildir('❌ Test mesajı gönderilemedi\n\n' + (data.error || `HTTP ${data[AG.api.DURUM]}`));
      }
    } catch (err) {
      AG.bildir('❌ Sunucuya ulaşılamıyor.\n\n' + err.message +
            '\n\nSunucu çalışıyor mu? (node server.js)');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

  /* ── Dışarı açılan adlar (app.js / öteki js/app parçaları kullanır) ── */
  Object.assign(window, { bindFormEvents });
})();
