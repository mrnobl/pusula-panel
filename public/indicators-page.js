/**
 * Gösterge sayfası — havuzdaki 53 göstergenin (ve botların) tamamı tek yerde.
 *
 * Amacı iki soru: "havuzda ne var ve ne ayarlanabilir" ile "bu gösterge
 * gerçek piyasa verisinde makul mü". İkincisi grafik entegrasyonundan bile
 * önemli — bir gösterge burada gerçek veride yanlış görünüyorsa, stratejiye
 * bağlanmadan önce yakalanmış olur.
 *
 * Sayfa panelden AYRI: app.js zaten 4000 satırın üstünde ve bu sayfanın
 * hiçbir şeyi canlı bot durumuna bağlı değil.
 */
(function () {
  'use strict';

  // Sunucu `grupAd` göndermezse (bot grubu, eski sunucu) yedek Türkçe adlar.
  const GRUP_AD = { 'hareketli-ortalama': 'Hareketli ortalamalar', hacim: 'Hacim', fiyat: 'Fiyat dönüşümü', momentum: 'Momentum (hız)', volatilite: 'Oynaklık', yapi: 'Piyasa yapısı', ict: 'ICT / akıllı para kavramları', coklu: 'Çok sembollü (sembolleri karşılaştırır)', bot: 'Botlar (grafikte bot ne gördü)' };
  const CIZIM_AD = { line: 'çizgi', markers: 'işaret', histogram: 'sütun', boxes: 'kutu', box: 'kutu', levels: 'seviye', level: 'seviye', zones: 'bölge', area: 'alan', band: 'bant' };

  const el = (tag, props, children) => IndicatorUI.el(tag, props, children);

  const state = {
    meta: null,
    spec: null,
    chart: null,
    series: null,
    layer: null,
    lastPayload: null,
    config: null
  };

  // ── Katalog listesi ──────────────────────────────────────────────────────
  function renderCatalog(filtre) {
    const liste = document.getElementById('catalogList');
    liste.textContent = '';

    const q = (filtre || '').trim().toLowerCase();
    const gruplar = {};
    IndicatorUI.getList().forEach(d => {
      const hedef = `${d.key} ${d.label} ${d.group} ${d.grupAd || ''} ${d.note || ''} ${d.aciklama ? d.aciklama.ne : ''}`.toLowerCase();
      if (q && !hedef.includes(q)) return;
      if (!gruplar[d.group]) gruplar[d.group] = [];
      gruplar[d.group].push(d);
    });

    const adlar = Object.keys(gruplar).sort();
    if (!adlar.length) {
      liste.appendChild(el('div', { text: 'Eşleşen gösterge yok.', class: 'hint' }));
      return;
    }

    adlar.forEach(g => {
      liste.appendChild(el('div', {
        text: `${(gruplar[g][0] && gruplar[g][0].grupAd) || GRUP_AD[g] || g} (${gruplar[g].length})`,
        class: 'catalog-group'
      }));

      gruplar[g].forEach(d => {
        const aktif = state.meta && state.meta.key === d.key;
        const satir = el('button', {
          type: 'button',
          text: d.label,
          title: (d.aciklama && d.aciklama.ne) || d.note || d.key,
          class: 'catalog-item' + (aktif ? ' is-active' : ''),
          'aria-current': aktif ? 'true' : null,
          onclick: () => select(d.key)
        });
        // Çok sembollü göstergeler grafik önizlemesi yapamaz, işaretlensin.
        if (d.multi) satir.appendChild(el('span', { text: ' ⚯', class: 'tone-muted', title: 'çok sembollü — önizleme yok' }));
        liste.appendChild(satir);
      });
    });
  }

  // ── Seçim ve detay ───────────────────────────────────────────────────────
  function select(key) {
    const meta = IndicatorUI.getCatalog().get(key);
    if (!meta) return;
    state.meta = meta;
    state.spec = IndicatorUI.defaultSpec(meta, 'onizleme');
    renderCatalog(document.getElementById('inpSearch').value);
    renderDetail();
    run();
  }

  function renderDetail() {
    const meta = state.meta;
    const head = document.getElementById('detailHeader');
    head.textContent = '';

    head.appendChild(el('div', {
      class: 'row-baseline-wrap'
    }, [
      el('strong', { text: meta.label, class: 'title-md' }),
      el('code', { text: meta.key, class: 'text-xs tone-cyan' }),
      el('span', { text: `${meta.grupAd || GRUP_AD[meta.group] || meta.group} · ${meta.turAd || meta.kind}${meta.multi ? ' · çok sembollü' : ''} · ısınma ${meta.warmup} mum`, class: 'hint' })
    ]));

    if (meta.dependsOn && meta.dependsOn.length) {
      head.appendChild(el('div', {
        text: `Bağımlı olduğu göstergeler: ${meta.dependsOn.join(', ')}`,
        class: 'hint mt-1'
      }));
    }

    // B-33 (61.1): göstergenin ne olduğu ve nasıl okunacağı sade Türkçe (lib/indicatorPool/aciklamalar.js).
    if (meta.aciklama) {
      head.appendChild(el('div', { class: 'ind-desc' }, [
        el('p', { class: 'm-0' }, [el('strong', { text: 'Nedir: ' }), el('span', { text: meta.aciklama.ne })]),
        el('p', { class: 'm-0 mt-1' }, [el('strong', { text: 'Nasıl okunur: ' }), el('span', { text: meta.aciklama.okuma })])
      ]));
    }
    if (meta.note) {
      head.appendChild(el('div', {
        text: meta.note,
        class: 'ind-desc'
      }));
    }

    // Çıktı tablosu: hangi çıktı nereye çizilir, seri mi seyrek mi.
    // Tablo → kart ortak bileşeni (js/core/tablo.js).
    const satirlar = [];
    Object.entries(meta.render).forEach(([name, h]) => {
      satirlar.push(el('tr', {}, [
        el('td', { text: h.label || name, title: name }),
        el('td', { text: h.pane === 'price' ? 'fiyat grafiği' : 'kendi paneli' }),
        el('td', { text: CIZIM_AD[h.as] || h.as }),
        el('td', {
          text: h.series ? (h.sparse ? 'ara sıra değer (olay)' : 'her mumda değer') : 'liste',
          class: 'tone-muted'
        })
      ]));
    });
    const tablo = AG.tablo.kur({ sinif: 'table-dense mt-2', basliklar: ['Çıktı', 'Nerede', 'Çizim', 'Değer'], satirlar });
    // Kendi kutusunda kaysın: doğrudan eklenince geniş tablo grid sütununu
    // viewport dışına itiyordu ve `body { overflow-x: hidden }` yüzünden
    // taşan kısma erişilemiyordu.
    head.appendChild(el('div', { class: 'gh-scroll-x' }, [tablo]));

    const params = document.getElementById('detailParams');
    params.textContent = '';
    params.appendChild(el('div', { text: 'Parametreler', class: 'title-sm' }));
    params.appendChild(IndicatorUI.buildParamForm(meta, state.spec.params, (name, value) => {
      state.spec.params[name] = value;
    }));
    params.appendChild(el('div', { text: 'Çizilecek çıktılar', class: 'title-sm mt-3' }));
    params.appendChild(IndicatorUI.buildOutputPicker(meta, state.spec, () => {
      if (state.lastPayload) draw();
    }));
  }

  // ── Hesap ve çizim ───────────────────────────────────────────────────────
  function ensureChart() {
    if (state.chart) return;
    const container = document.getElementById('previewChart');
    // Renkler temadan (js/core/tema.js); tema değişince yerinde yeniden boyanır.
    const tema = () => {
      const p = AG.tema.palet();
      return {
        grafik: {
          layout: { background: { color: p.bg }, textColor: p.text },
          grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
          rightPriceScale: { borderColor: p.border },
          timeScale: { borderColor: p.border }
        },
        mum: { upColor: p.pos, downColor: p.neg, wickUpColor: p.pos, wickDownColor: p.neg }
      };
    };
    const t0 = tema();
    state.chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: t0.grafik.layout,
      grid: t0.grafik.grid,
      rightPriceScale: { borderColor: t0.grafik.rightPriceScale.borderColor, scaleMargins: { top: 0.08, bottom: 0.26 } },
      timeScale: { borderColor: t0.grafik.timeScale.borderColor, timeVisible: true, secondsVisible: false }
    });

    const opts = { ...t0.mum, borderVisible: false };
    document.addEventListener('ag:tema', () => {
      const t = tema();
      try { state.chart.applyOptions(t.grafik); state.series.applyOptions(t.mum); } catch (e) { /* grafik kapandı */ }
    });
    state.series = typeof state.chart.addCandlestickSeries === 'function'
      ? state.chart.addCandlestickSeries(opts)
      : state.chart.addSeries(LightweightCharts.CandlestickSeries, opts);

    state.layer = ChartIndicators.create(state.chart, state.series, { maxZones: 30 });

    window.addEventListener('resize', () => {
      if (state.chart && container.clientWidth > 0) {
        state.chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
      }
    });
  }

  async function run() {
    if (!state.meta) return;
    const durum = document.getElementById('runStatus');

    if (state.meta.multi) {
      durum.textContent = 'Çok sembollü gösterge — grafik önizlemesi yok, çıktı tablosuna bakın.';
      await runMulti();
      return;
    }

    ensureChart();
    // Önceki çok sembollü çizim temizlenmeli; kalırsa fiyat grafiğinin üstünde
    // −1..1 aralığında çizgiler kalır ve ölçek okunmaz olur.
    (state.multiSeries || []).forEach(s => { try { state.chart.removeSeries(s); } catch (e) { /* yok */ } });
    state.multiSeries = [];
    durum.textContent = 'hesaplanıyor…';

    try {
      const data = await AG.api.gostergeHesapla({
        symbol: document.getElementById('selSym').value,
        timeframe: document.getElementById('selTf').value,
        limit: parseInt(document.getElementById('inpBars').value) || 500,
        specs: [{ id: state.spec.id, key: state.spec.key, params: state.spec.params }]
      });
      if (!data.success) { durum.textContent = `hata: ${data.error}`; return; }

      const sonuc = data.results[state.spec.id];
      if (sonuc && sonuc.error) {
        durum.textContent = `gösterge hatası: ${sonuc.error}`;
        return;
      }

      state.lastPayload = data;
      state.series.setData(data.candles.map(c => ({
        time: Math.floor(c.time / 1000), open: c.open, high: c.high, low: c.low, close: c.close
      })));
      draw();
      state.chart.timeScale().fitContent();

      durum.textContent = `${data.count} mum · ${data.symbol} ${data.timeframe}`;
      renderOutputs(sonuc, data.candles);
    } catch (err) {
      durum.textContent = `hata: ${err.message}`;
    }
  }

  /**
   * Çok sembollü göstergeler.
   *
   * Bunların çıktısı mum başına DEĞİL, sembol başına seridir (`pairs`) ya da
   * anlık bir matristir. İlk sürüm ham çıktıyı mum tablosuna vermeye
   * çalışıyordu; mum olmadığı için tablo tamamen boş kalıyor ve dört gösterge
   * de "çalışmıyor" gibi görünüyordu. Artık ortak zaman ekseni (`times`)
   * üzerine kendi çizimi ve kendi tablosu var.
   */
  async function runMulti() {
    const durum = document.getElementById('runStatus');
    try {
      const data = await AG.api.gostergeHesaplaCoklu({
        timeframe: document.getElementById('selTf').value,
        limit: parseInt(document.getElementById('inpBars').value) || 500,
        symbols: (state.config && state.config.watchlist) || [],
        specs: [{ id: state.spec.id, key: state.spec.key, params: state.spec.params }]
      });
      if (!data.success) { durum.textContent = `hata: ${data.error}`; return; }

      const elenen = (data.dropped || []).map(d => `${d.symbol} (${d.reason})`);
      durum.textContent = `${(data.symbols || []).length} sembol · ${(data.times || []).length} ortak bar`
        + (data.limitedBy ? ` · ekseni kısıtlayan: ${data.limitedBy}` : '')
        + (elenen.length ? ` · elenen: ${elenen.join(', ')}` : '');

      const sonuc = data.results[state.spec.id];
      drawMultiChart(data, sonuc);
      renderMultiOutputs(data, sonuc);
    } catch (err) {
      durum.textContent = `hata: ${err.message}`;
    }
  }

  /** Çok sembollü seriler ortak zaman ekseni üzerine çizilir. */
  function drawMultiChart(data, sonuc) {
    ensureChart();
    // Mum serisi boşaltılır: burada fiyat yok, oran var.
    state.series.setData([]);
    if (state.layer) state.layer.clear();
    (state.multiSeries || []).forEach(s => { try { state.chart.removeSeries(s); } catch (e) { /* yok */ } });
    state.multiSeries = [];

    const times = data.times || [];
    const legend = document.getElementById('previewLegend');
    legend.textContent = '';
    if (!sonuc || !times.length) return;

    const ekle = (ad, seri, renk) => {
      if (!Array.isArray(seri) || seri.length !== times.length) return;
      const noktalar = [];
      for (let i = 0; i < times.length; i++) {
        const v = seri[i];
        if (!Number.isFinite(v)) continue;
        noktalar.push({ time: Math.floor(times[i] / 1000), value: v });
      }
      if (!noktalar.length) return;

      const s = typeof state.chart.addLineSeries === 'function'
        ? state.chart.addLineSeries({ color: renk, lineWidth: 2, priceLineVisible: false, title: ad })
        : state.chart.addSeries(LightweightCharts.LineSeries, { color: renk, lineWidth: 2, priceLineVisible: false, title: ad });
      s.setData(noktalar);
      state.multiSeries.push(s);
      // Renk yalnız işarette (■): seri rengi veriden gelir, yazı rengi olunca kontrast tutmuyordu (P5 sınaması).
      legend.appendChild(el('span', null, [el('span', { text: '■ ', style: `color:${renk};` }), el('span', { text: ad })]));
    };

    let i = 0;
    const renk = () => ChartIndicators.PALETTE[(i++) % ChartIndicators.PALETTE.length];

    // Sembol başına seriler (korelasyon / beta) — asıl görülmek istenen bu.
    if (sonuc.pairs && typeof sonuc.pairs === 'object') {
      Object.entries(sonuc.pairs).forEach(([sym, seri]) => ekle(sym.split('/')[0], seri, renk()));
    }
    // Özet seriler
    ['average', 'spread', 'divergenceCount'].forEach(ad => {
      if (Array.isArray(sonuc[ad])) ekle(ad, sonuc[ad], renk());
    });

    state.chart.timeScale().fitContent();
  }

  /** Çok sembollü çıktılar: matris, kümeler, çiftler ve olaylar okunur biçimde. */
  function renderMultiOutputs(data, sonuc) {
    const tablo = document.getElementById('outputTable');
    const thead = tablo.querySelector('thead');
    const tbody = tablo.querySelector('tbody');
    thead.textContent = '';
    tbody.textContent = '';
    if (!sonuc) return;

    const satir = (hucreler, renkler) => {
      const tr = el('tr', {});
      hucreler.forEach((h, i) => {
        const td = el('td', { text: String(h) });
        if (renkler && renkler[i]) td.style.color = renkler[i];
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    };

    // 1) Sembol başına son değerler (korelasyon / beta)
    if (sonuc.pairs && typeof sonuc.pairs === 'object' && Object.keys(sonuc.pairs).length) {
      thead.appendChild(el('tr', {}, ['sembol', 'son değer', 'ortalama', 'min', 'maks'].map(t => el('th', { text: t }))));
      Object.entries(sonuc.pairs).forEach(([sym, seri]) => {
        const gecerli = (seri || []).filter(Number.isFinite);
        if (!gecerli.length) { satir([sym, '—', '—', '—', '—']); return; }
        const son = gecerli[gecerli.length - 1];
        const ort = gecerli.reduce((a, b) => a + b, 0) / gecerli.length;
        satir([
          sym,
          son.toFixed(3),
          ort.toFixed(3),
          Math.min(...gecerli).toFixed(3),
          Math.max(...gecerli).toFixed(3)
        ], [null, son >= 0.7 ? 'var(--accent-success)' : (son < 0.3 ? 'var(--accent-warning)' : null)]);
      });
      return;
    }

    // 2) Korelasyon matrisi + kümeler + en güçlü çiftler
    if (sonuc.matrix && sonuc.symbols) {
      const syms = sonuc.symbols;
      thead.appendChild(el('tr', {}, ['', ...syms.map(s => s.split('/')[0])].map(t => el('th', { text: t }))));
      syms.forEach(a => {
        const tr = el('tr', {}, [el('td', { text: a.split('/')[0], class: 'fw-semibold' })]);
        syms.forEach(b => {
          const v = sonuc.matrix[a][b];
          const td = el('td', { text: v === null || v === undefined ? '—' : v.toFixed(2) });
          if (Number.isFinite(v) && a !== b) {
            td.classList.add(v >= 0.7 ? 'tone-success' : (v < 0.3 ? 'tone-muted' : 'tone-warning'));
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      const alt = document.getElementById('previewLegend');
      alt.appendChild(el('span', {
        text: `ortalama korelasyon ${Number(sonuc.averageCorrelation).toFixed(3)} · kümeler: `
          + Object.entries(sonuc.clusters || {}).map(([ad, u]) => `${ad} [${u.map(x => x.split('/')[0]).join(',')}]`).join(' · '),
        class: 'tone-muted'
      }));
      return;
    }

    // 3) Olay listesi (SMT)
    if (Array.isArray(sonuc.events)) {
      thead.appendChild(el('tr', {}, ['bar', 'onay', 'yön', 'eş', 'baz %', 'eş %', 'fark', 'korelasyon'].map(t => el('th', { text: t }))));
      if (!sonuc.events.length) {
        satir(['—', 'uyuşmazlık bulunamadı', '', '', '', '', '', '']);
      }
      sonuc.events.slice(-60).reverse().forEach(e => {
        satir([
          e.index, e.confirmedAt, e.direction, e.peer,
          e.baseChangePct.toFixed(2), e.peerChangePct.toFixed(2),
          e.gapPct.toFixed(2), e.correlation.toFixed(2)
        ], [null, null, e.direction === 'bullish' ? 'var(--accent-success)' : 'var(--accent-danger)']);
      });

      // Kapıya takılan adaylar: kapının iş yapıp yapmadığı buradan görünür.
      const peers = sonuc.peers || {};
      const engel = Object.entries(peers).map(([s, p]) => `${s.split('/')[0]}: ${p.blockedByCorrelation}`).join(' · ');
      if (engel) {
        document.getElementById('previewLegend').appendChild(el('span', {
          text: `korelasyon kapısında elenen aday — ${engel}`,
          class: 'tone-muted'
        }));
      }
    }
  }

  function draw() {
    if (!state.layer || !state.lastPayload) return;
    state.layer.render([state.spec], state.lastPayload, IndicatorUI.getCatalog());

    const legend = document.getElementById('previewLegend');
    legend.textContent = '';
    Object.entries(state.spec.outputs || {}).forEach(([name, o]) => {
      if (!o || o.visible === false) return;
      const h = state.meta.render[name] || {};
      legend.appendChild(el('span', null, [
        el('span', { text: '■ ', style: `color:${o.color || '#6366f1'};` }),
        el('span', { text: `${name} (${h.pane === 'price' ? 'fiyat' : 'alt panel'})` })
      ]));
    });
  }

  /** Son barların değerleri — sayıyı gözle görmek grafikte görmekten farklı. */
  function renderOutputs(sonuc, candles) {
    const tablo = document.getElementById('outputTable');
    const thead = tablo.querySelector('thead');
    const tbody = tablo.querySelector('tbody');
    thead.textContent = '';
    tbody.textContent = '';
    if (!sonuc) return;

    const meta = state.meta;
    const seriAdlari = Object.keys(meta.render).filter(n => meta.render[n].series && Array.isArray(sonuc[n]));
    const listeAdlari = Object.keys(meta.render).filter(n => !meta.render[n].series);

    if (seriAdlari.length && candles) {
      thead.appendChild(el('tr', {}, ['bar', 'zaman', ...seriAdlari].map(t => el('th', { text: t }))));
      const n = candles.length;
      for (let i = Math.max(0, n - 15); i < n; i++) {
        tbody.appendChild(el('tr', {}, [
          el('td', { text: String(i) }),
          el('td', { text: new Date(candles[i].time).toISOString().slice(0, 16).replace('T', ' ') }),
          ...seriAdlari.map(name => {
            const v = sonuc[name][i];
            return el('td', {
              text: v === null || v === undefined ? '—' : (typeof v === 'number' ? v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') : String(v)),
              class: v === null || v === undefined ? 'tone-muted' : null
            });
          })
        ]));
      }
    }

    // Liste/nesne çıktıları JSON olarak; kutu ve olayların ham hâli burada.
    listeAdlari.forEach(name => {
      const v = sonuc[name];
      if (v === undefined) return;
      const ozet = Array.isArray(v) ? `${v.length} kayıt` : (v && typeof v === 'object' ? 'nesne' : String(v));
      const tr = el('tr', {}, [
        el('td', { text: name, class: 'tone-cyan' }),
        el('td', { text: ozet, colspan: String(Math.max(1, seriAdlari.length + 1)) })
      ]);
      tbody.appendChild(tr);

      if (Array.isArray(v) && v.length) {
        const orn = el('tr', {}, [
          el('td', { text: '' }),
          el('td', {
            colspan: String(Math.max(1, seriAdlari.length + 1)),
            text: JSON.stringify(v.slice(0, 3), null, 0).slice(0, 600),
            class: 'mono-pre'
          })
        ]);
        tbody.appendChild(orn);
      }
    });
  }

  // ── Kayıtlı ayarlar ──────────────────────────────────────────────────────
  async function loadPresets() {
    const kutu = document.getElementById('presetList');
    kutu.textContent = '';
    const presets = (state.config && state.config.indicators && state.config.indicators.presets) || {};
    const adlar = Object.keys(presets);

    if (!adlar.length) {
      kutu.appendChild(el('span', { text: 'Kayıtlı ayar yok. "Ayarı kaydet" ile bu göstergenin parametrelerini adlandırarak saklayabilirsiniz.' }));
      return;
    }

    adlar.forEach(ad => {
      const p = presets[ad];
      const satir = el('div', { class: 'row row-wrap py-1' }, [
        el('strong', { text: ad, class: 'text-sm' }),
        el('code', { text: p.key, class: 'text-xs tone-cyan' }),
        el('span', { text: JSON.stringify(p.params), class: 'hint' }),
        el('button', {
          type: 'button', class: 'btn btn-secondary btn-xxs', text: 'yükle',
          onclick: () => {
            select(p.key);
            Object.assign(state.spec.params, p.params);
            renderDetail();
            run();
          }
        }),
        el('button', {
          type: 'button', class: 'btn btn-secondary btn-xxs', text: 'sil',
          onclick: async () => {
            const kalan = { ...presets };
            delete kalan[ad];
            await savePresets(kalan);
          }
        })
      ]);
      kutu.appendChild(satir);
    });
  }

  async function savePresets(presets) {
    const data = await AG.api.ayarYaz({ indicators: { presets } });
    if (data.success) {
      state.config = data.config;
      loadPresets();
    }
  }

  // ── Başlangıç ────────────────────────────────────────────────────────────
  async function init() {
    try {
      state.config = await AG.api.ayarOku();
    } catch (e) { state.config = {}; }

    const sym = document.getElementById('selSym');
    ((state.config && state.config.watchlist) || ['BTC/USDT']).forEach(s => {
      sym.appendChild(el('option', { value: s, text: s }));
    });
    if (state.config && state.config.timeframe) document.getElementById('selTf').value = state.config.timeframe;

    await IndicatorUI.loadCatalog();
    const liste = IndicatorUI.getList();
    // B-33: botlar da listede (grafikte bot ne gördü) — gösterge sayısına karıştırılmaz.
    const botSay = liste.filter(d => d.group === 'bot').length;
    const gosterge = liste.filter(d => d.group !== 'bot');
    document.getElementById('poolSummary').textContent =
      `${gosterge.length} gösterge · ${new Set(gosterge.map(d => d.group)).size} grup · ${gosterge.filter(d => d.multi).length} çok sembollü${botSay ? ` · ayrıca ${botSay} bot` : ''}`;

    renderCatalog('');
    loadPresets();
    if (liste.length) select(liste[0].key);

    document.getElementById('inpSearch').addEventListener('input', (e) => renderCatalog(e.target.value));
    document.getElementById('btnRun').addEventListener('click', run);
    document.getElementById('selSym').addEventListener('change', run);
    document.getElementById('selTf').addEventListener('change', run);

    document.getElementById('btnSavePreset').addEventListener('click', async () => {
      if (!state.meta) return;
      const ad = prompt('Ayar adı:', `${state.meta.key} özel`);
      if (!ad) return;
      const presets = { ...((state.config.indicators && state.config.indicators.presets) || {}) };
      presets[ad] = { key: state.spec.key, params: { ...state.spec.params } };
      await savePresets(presets);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
