/**
 * Grafik gösterge katmanı.
 *
 * Havuzdaki 52 göstergeyi Lightweight Charts üzerine çizer. Tek modül, iki
 * grafik: canlı panel (`tvChart`) ve backtest grafiği (`anPriceChart`) aynı
 * API'yi kullanır — çizim mantığını iki yere kopyalamak, ikisinin zamanla
 * ayrışması demekti.
 *
 * ÇİZİM BİLDİRİMİ SUNUCUDAN GELİR (`/api/indicators` → `render`): her çıktı
 * hangi panele (fiyat / kendi) ve hangi biçimde (çizgi, işaretçi, kutu,
 * seviye) çizileceğini söyler. İstemci tahmin etmez; RSI'ı fiyat paneline
 * koymak grafiği kullanılamaz hâle getirirdi ve bu karar havuzda ölçümle
 * doğrulanıyor.
 *
 * KENDİ PANELİ NASIL: Lightweight Charts v4'te gerçek panel yok; osilatörler
 * kendi `priceScaleId`'siyle ve `scaleMargins` ile grafiğin altına bir şerit
 * olarak yerleşir. v5'in panel API'si varsa da bu yöntem iki sürümde de
 * çalışıyor, o yüzden tek yol tutuldu.
 */
(function (global) {
  'use strict';

  const PALETTE = [
    '#6366f1', '#06b6d4', '#f59e0b', '#10b981', '#ec4899',
    '#8b5cf6', '#14b8a6', '#f97316', '#84cc16', '#e11d48'
  ];

  /** v4 `addLineSeries` / v5 `addSeries(LineSeries, …)` — ikisini de destekle. */
  function addLine(chart, options) {
    if (typeof chart.addLineSeries === 'function') return chart.addLineSeries(options);
    if (global.LightweightCharts && LightweightCharts.LineSeries) {
      return chart.addSeries(LightweightCharts.LineSeries, options);
    }
    return null;
  }

  function addHistogram(chart, options) {
    if (typeof chart.addHistogramSeries === 'function') return chart.addHistogramSeries(options);
    if (global.LightweightCharts && LightweightCharts.HistogramSeries) {
      return chart.addSeries(LightweightCharts.HistogramSeries, options);
    }
    return null;
  }

  const secToBar = (ms) => Math.floor(ms / 1000);

  /**
   * Hizalı seriyi grafik noktalarına çevirir.
   *
   * ISINMA barları (baştaki null'lar) atlanır — 0 olarak çizmek, göstergenin o
   * barlarda sıfır değer ürettiği yanılgısını verirdi ki havuzun `null` ile
   * ısınma bildirmesinin sebebi tam da bu.
   *
   * ARADAKİ null'lar ise BOŞLUK olarak işaretlenir (`{ time }`, değersiz nokta).
   * Eskiden onlar da atlanıyordu ve grafik boşluğun iki ucunu ÇAPRAZ BİR
   * ÇİZGİYLE birleştiriyordu. Bu, aralarında geçerli bir yapı olmayan iki ayrı
   * range'i birbirine bağlayarak var olmayan bir seviye çizmek demekti —
   * "range'ler birbirine karışmasın" isteğinin doğrudan ihlali.
   */
  function toPoints(candles, series) {
    const out = [];
    let basladi = false;
    for (let i = 0; i < candles.length && i < series.length; i++) {
      const v = series[i];
      const gecerli = !(v === null || v === undefined || !Number.isFinite(v));
      if (!gecerli) {
        if (basladi) out.push({ time: secToBar(candles[i].time) });   // boşluk
        continue;
      }
      basladi = true;
      out.push({ time: secToBar(candles[i].time), value: v });
    }
    return out;
  }

  function createLayer(chart, priceSeries, options) {
    const opts = options || {};
    const state = {
      chart,
      priceSeries,
      // id → { spec, seriesByOutput, priceLines, markers, scaleId }
      drawn: new Map(),
      baseMarkers: [],
      maxZones: opts.maxZones || 20,
      /**
       * BÖLGE KUTULARININ GENİŞLİĞİ — LuxAlgo davranışı.
       *
       * Eskiden her bölge, doğduğu bardan grafiğin SAĞ UCUNA kadar çiziliyordu.
       * İki sonucu vardı: (1) geçersizleşmiş bölgeler bile sonsuza dek uzuyordu,
       * (2) çizim listenin İLK kayıtlarını aldığı ve listeler eskiden yeniye
       * sıralı olduğu için ekranda hep EN ESKİ bölgeler kalıyordu — yani
       * grafiğin solundan gelen ve her şeyi kaplayan çizgiler.
       *
       * LuxAlgo'nun FVG aracı kutuyu `bar_index + extend` ile SABİT genişlikte
       * çizer ve mitigasyonda siler. Burada aynısı: kutu `[start, start+extend]`
       * aralığında, geçersizleştiği barda ise orada biter.
       */
      zoneExtendBars: Number.isFinite(opts.zoneExtendBars) ? opts.zoneExtendBars : 20,
      /** Geçersizleşmiş bölgeler çizilsin mi (LuxAlgo varsayılanı: hayır). */
      showDeadZones: opts.showDeadZones === true,
      onMarkers: opts.onMarkers || null
    };

    /** İşaretçiler tek yerden basılır: taban (işlem okları) + göstergeler. */
    function flushMarkers() {
      const all = state.baseMarkers.slice();
      for (const entry of state.drawn.values()) all.push(...entry.markers);
      all.sort((a, b) => a.time - b.time);

      try {
        if (typeof state.priceSeries.setMarkers === 'function') {
          state.priceSeries.setMarkers(all);
        } else if (global.LightweightCharts && typeof LightweightCharts.createSeriesMarkers === 'function') {
          if (state.markersApi) state.markersApi.setMarkers(all);
          else state.markersApi = LightweightCharts.createSeriesMarkers(state.priceSeries, all);
        }
      } catch (err) {
        console.warn('İşaretçiler çizilemedi:', err.message);
      }
    }

    function removeEntry(id) {
      const entry = state.drawn.get(id);
      if (!entry) return;
      for (const s of entry.series) {
        try { chart.removeSeries(s); } catch (e) { /* zaten kaldırılmış */ }
      }
      for (const l of entry.priceLines) {
        try { state.priceSeries.removePriceLine(l); } catch (e) { /* yok */ }
      }
      state.drawn.delete(id);
    }

    /** Osilatör şeridi: her gösterge kendi ölçeğinde, altta. */
    function ownScaleId(id) { return `ind_${id}`; }

    /**
     * Kendi panelindeki serilerin şerit sınırları.
     *
     * DİKKAT — burada bir hata vardı: kenar boşlukları seri EKLENDİĞİ anda,
     * `setData`'dan ÖNCE uygulanıyordu. Ölçek o anda henüz oluşmadığı için
     * `applyOptions` etkisiz kalıyor (ve hata sessizce yutuluyordu); sonuç,
     * ±1 aralığındaki bir `direction` serisinin grafiğin TÜM yüksekliğini
     * kaplaması — fiyatı takip etmeyen, ekrana yapıştırılmış bir görüntü.
     *
     * Artık veri yazıldıktan SONRA ve çizim bitince BİR KEZ DAHA uygulanıyor.
     */
    function applyOwnScale(scaleId, slot) {
      try {
        // Şeritler alt alta dizilir; ilk gösterge en altta.
        const top = Math.max(0.55, 0.80 - slot * 0.16);
        chart.priceScale(scaleId).applyOptions({
          scaleMargins: { top, bottom: Math.min(0.4, slot * 0.16) }
        });
        return true;
      } catch (e) {
        console.warn(`Gösterge şeridi ölçeklenemedi (${scaleId}):`, e.message);
        return false;
      }
    }

    /**
     * Bir göstergenin çıktısını çizer.
     * @param {object} spec  { id, key, params, outputs: { name: {visible,color} } }
     * @param {object} data  { candles, result, meta } — meta = katalog kaydı
     */
    function draw(spec, candles, result, meta, ownSlot) {
      removeEntry(spec.id);
      if (!result || result.error) return;

      const entry = { spec, series: [], priceLines: [], markers: [], ownScales: new Set(), legend: [] };
      const render = (meta && meta.render) || {};
      const secilen = spec.outputs || {};
      let renkIndex = 0;

      for (const name of Object.keys(render)) {
        const hint = render[name];
        const secim = secilen[name];
        // Varsayılan: yalnızca açıkça seçilen çıktılar çizilir. Bir göstergenin
        // sekiz çıktısını birden basmak grafiği okunmaz hâle getirir.
        if (!secim || secim.visible === false) continue;
        if (hint.as === 'none') continue;

        const renk = secim.color || PALETTE[(renkIndex++) % PALETTE.length];
        const veri = result[name];

        if (hint.as === 'line' || hint.as === 'histogram') {
          if (!Array.isArray(veri)) continue;
          const points = toPoints(candles, veri);
          if (!points.length) continue;

          const ortak = {
            color: renk,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: `${meta.label} ${hint.label !== name ? hint.label : name}`
          };

          let s;
          let scaleId = null;
          if (hint.pane === 'own') {
            scaleId = ownScaleId(spec.id);
            s = hint.as === 'histogram'
              ? addHistogram(chart, { ...ortak, priceScaleId: scaleId })
              : addLine(chart, { ...ortak, priceScaleId: scaleId });
          } else {
            // Fiyat paneli: ölçek açıkça 'right' verilir. Varsayılana bırakmak,
            // kütüphane sürümüne göre ayrı bir overlay ölçeğe düşebiliyor.
            s = hint.as === 'histogram'
              ? addHistogram(chart, { ...ortak, priceScaleId: 'right' })
              : addLine(chart, { ...ortak, priceScaleId: 'right' });
          }
          if (!s) continue;
          s.setData(points);
          // Ölçek ancak veri yazıldıktan sonra gerçekten var olur.
          if (scaleId) { applyOwnScale(scaleId, ownSlot); entry.ownScales.add(scaleId); }
          entry.series.push(s);
          entry.legend.push({ label: `${meta.label} · ${hint.label || name}`, color: renk, pane: hint.pane });

        } else if (hint.as === 'markers') {
          // Seyrek seri (olay işaretçisi) ya da olay listesi.
          if (Array.isArray(veri) && veri.length === candles.length) {
            for (let i = 0; i < veri.length; i++) {
              if (!Number.isFinite(veri[i])) continue;
              entry.markers.push({
                time: secToBar(candles[i].time),
                position: veri[i] > 0 ? 'belowBar' : 'aboveBar',
                shape: veri[i] > 0 ? 'arrowUp' : 'arrowDown',
                color: renk,
                text: `${meta.label}·${name}`
              });
            }
          } else if (Array.isArray(veri)) {
            for (const ev of veri.slice(-200)) {
              // Olay ONAY barına işaretlenir: oluştuğu bar değil, bilindiği bar.
              const idx = Number.isFinite(ev.confirmedAt) ? ev.confirmedAt : ev.index;
              if (!Number.isFinite(idx) || !candles[idx]) continue;
              const yukari = ev.direction === 'bullish';
              // Girilmeyen sinyaller GERÇEKLEŞEN işlemlerle aynı sembolü
              // kullanmamalı; içi boş daire ve gerekçe metniyle ayrılır.
              const girilmedi = ev.type === 'GİRİLMEDİ';
              // Olay kendi şeklini bildirebilir: kademeli TP kare, ekstrem
              // daire, stop ok. Hepsini aynı okla çizmek, kademeli satışları
              // nihai çıkıştan ayırt edilemez kılıyordu.
              const sekil = ev.shape || (girilmedi ? 'circle' : (yukari ? 'arrowUp' : 'arrowDown'));
              const fiyatMetni = Number.isFinite(ev.price)
                ? ` @${Number(ev.price).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`
                : '';
              const karMetni = Number.isFinite(ev.profitUSDT) && ev.profitUSDT !== 0
                ? ` (${ev.profitUSDT >= 0 ? '+' : ''}${Number(ev.profitUSDT).toFixed(1)}$)`
                : '';

              entry.markers.push({
                time: secToBar(candles[idx].time),
                position: yukari ? 'belowBar' : 'aboveBar',
                shape: sekil,
                color: girilmedi ? 'rgba(148,163,184,0.9)' : renk,
                text: girilmedi
                  ? `✕ ${ev.blockedBy || 'girilmedi'}`
                  : `${ev.type || meta.label}${fiyatMetni}${karMetni}`
              });
            }
          }

        } else if (hint.as === 'zones') {
          if (!Array.isArray(veri)) continue;
          // Kutular zaman sınırlı iki yatay parça olarak çizilir: v4'te
          // dikdörtgen primitifi yok, `createPriceLine` ise sonsuz uzar ve
          // bölgenin ne zaman doğduğunu gizlerdi.
          /**
           * Bölgenin doğduğu bar. Gösterge ailesine göre alan adı değişiyor.
           *
           * `startIndex` LİSTEDE YOKTU: range yapıları başlangıç barını o alanda
           * taşıyor ve bu yüzden hiç çizilmiyorlardı — süzgeç onları "başlangıcı
           * bilinmeyen" sayıp eliyordu. Hata görünmedi çünkü doğrulama betiği
           * çizim kodunu taklit ediyordu, ÇAĞIRMIYORDU; taklit ile gerçek kod
           * ayrışmıştı. `scripts/cizim-kontrol.js` artık bu dosyayı gerçekten
           * yükleyip çalıştırıyor.
           */
          const basIndeks = (z) => (Number.isFinite(z.confirmedAt) ? z.confirmedAt
            : (Number.isFinite(z.bornAt) ? z.bornAt
              : (Number.isFinite(z.startIndex) ? z.startIndex
                : (Number.isFinite(z.createdAt) ? z.createdAt : z.index))));

          // Bölgenin ÖLDÜĞÜ bar; yoksa null (hâlâ aktif).
          // `filledAt` (FVG) ve `endedAt` eskiden listede YOKTU: bu yüzden dolan
          // her FVG hâlâ yaşıyor sayılıp sağ uca kadar çiziliyordu.
          const olumIndeksi = (z) => {
            for (const alan of ['mitigatedAt', 'filledAt', 'takenAt', 'invalidatedAt', 'endedAt', 'endIndex']) {
              if (Number.isFinite(z[alan])) return z[alan];
            }
            return null;
          };

          // EN YENİ bölgeler seçilir. Eskiden `slice(0, maxZones)` listeyi
          // olduğu gibi kesiyordu ve listeler eskiden yeniye sıralı olduğu için
          // ekranda hep en eski bölgeler kalıyordu.
          const sirali = veri
            .filter(z => z && (Number.isFinite(basIndeks(z))))
            // Ölü bölgeler gizlenir (LuxAlgo kutuyu siler). İSTİSNA: range gibi
            // `extendActive` taşıyan yapılar geçmişte de görünür — orada amaç
            // uzamayı kesmek, yapıyı yok saymak değil.
            .filter(z => state.showDeadZones || z.extendActive === true || olumIndeksi(z) === null)
            .sort((a, b) => basIndeks(b) - basIndeks(a))
            .slice(0, state.maxZones);

          for (const z of sirali) {
            const bas = basIndeks(z);
            const olum = olumIndeksi(z);

            /**
             * Bitiş barı iki farklı kurala göre:
             *
             *  · `extendActive` TAŞIYAN bölgeler (range yapıları): yaşadıkları
             *    sürece sağ uca uzar, ÖLDÜKLERİ barda kesilir. Range'in anlamı
             *    "şu anda geçerli seviyeler" olduğu için sabit genişlik yanlış
             *    olurdu; ama ihlal edildiğinde uzamaya devam etmesi de yeni
             *    range ile karışmaya yol açar — bu yüzden ölümde kesiliyor.
             *  · Diğer bölgeler (FVG, order block…): sabit genişlik.
             */
            let bit;
            if (z.extendActive === true) {
              bit = olum === null ? candles.length - 1 : olum;
            } else {
              const varsayilanBitis = bas + state.zoneExtendBars;
              bit = olum === null ? varsayilanBitis : Math.min(olum, varsayilanBitis);
            }

            const ust = Number.isFinite(z.high) ? z.high : z.level;
            const alt = Number.isFinite(z.low) ? z.low : z.level;
            if (!candles[bas] || !Number.isFinite(ust)) continue;

            const t0 = secToBar(candles[Math.max(0, bas)].time);
            const t1 = secToBar(candles[Math.min(candles.length - 1, Math.max(bas, bit))].time);

            // Dış kenarlar + bölgenin bildirdiği İÇ SEVİYELER (range'de EQ ve
            // sapmalar). İç seviyeler daha ince ve noktalı çizilir.
            const cizgiler = [];
            if (Number.isFinite(alt) && alt !== ust) cizgiler.push({ deger: ust, ic: false }, { deger: alt, ic: false });
            else cizgiler.push({ deger: ust, ic: false });

            if (Array.isArray(z.levels)) {
              for (const lv of z.levels) {
                const v = Number.isFinite(lv) ? lv : (lv && lv.price);
                if (Number.isFinite(v)) cizgiler.push({ deger: v, ic: true });
              }
            }

            for (const cizgi of cizgiler) {
              const s = addLine(chart, {
                color: renk,
                lineWidth: 1,
                lineStyle: cizgi.ic ? 1 : 2,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: false
              });
              if (!s) continue;
              s.setData(t1 > t0
                ? [{ time: t0, value: cizgi.deger }, { time: t1, value: cizgi.deger }]
                : [{ time: t0, value: cizgi.deger }]);
              entry.series.push(s);
            }
          }

        } else if (hint.as === 'levels') {
          const seviyeler = Array.isArray(veri)
            ? veri.map(v => (Number.isFinite(v) ? v : (v && (v.price || v.level || v.center))))
            : [veri];
          for (const lv of seviyeler.slice(0, 12)) {
            if (!Number.isFinite(lv)) continue;
            try {
              entry.priceLines.push(state.priceSeries.createPriceLine({
                price: lv,
                color: renk,
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: `${meta.label}·${hint.label || name}`
              }));
            } catch (e) { /* seviye eklenemedi */ }
          }
        }
      }

      state.drawn.set(spec.id, entry);
    }

    return {
      /** İşlem okları gibi grafiğin kendi işaretçileri. */
      setBaseMarkers(markers) {
        state.baseMarkers = Array.isArray(markers) ? markers : [];
        flushMarkers();
      },

      /**
       * Tüm göstergeleri yeniden çizer.
       * @param {Array} specs    aktif gösterge listesi
       * @param {object} payload { candles, results } — /api/indicators/compute yanıtı
       * @param {Map}   catalog  key → katalog kaydı
       */
      render(specs, payload, catalog) {
        for (const id of Array.from(state.drawn.keys())) {
          if (!specs.some(s => s.id === id)) removeEntry(id);
        }

        let ownSlot = 0;
        for (const spec of specs) {
          const meta = catalog.get(spec.key);
          if (!meta) continue;
          const result = payload.results ? payload.results[spec.id] : null;
          const kendiPanel = Object.keys(spec.outputs || {}).some(n =>
            spec.outputs[n] && spec.outputs[n].visible !== false
            && meta.render[n] && meta.render[n].pane === 'own'
            && ['line', 'histogram'].includes(meta.render[n].as));

          draw(spec, payload.candles || [], result, meta, ownSlot);
          if (kendiPanel) ownSlot++;
        }
        flushMarkers();

        // Şerit sınırlarını çizim bittikten sonra BİR KEZ DAHA uygula: seriler
        // eklendikçe ölçekler yeniden oluşabiliyor ve ilk uygulama düşebiliyor.
        let slot = 0;
        for (const entry of state.drawn.values()) {
          for (const scaleId of entry.ownScales) applyOwnScale(scaleId, slot);
          if (entry.ownScales.size) slot++;
        }
      },

      /** Çizilen her serinin adı, rengi ve hangi panelde olduğu. */
      legend() {
        const out = [];
        for (const entry of state.drawn.values()) out.push(...entry.legend);
        return out;
      },

      /**
       * Seriler grafikteki mumlarla aynı zaman aralığında mı?
       * Mumlar ve göstergeler ayrı isteklerle geldiği için aralık kayarsa
       * çizgiler "fiyatı takip etmiyor" gibi görünür — sessiz kalmasın.
       */
      timeMismatch(payload, chartFirstTime, chartLastTime) {
        const c = (payload && payload.candles) || [];
        if (!c.length || !Number.isFinite(chartFirstTime) || !Number.isFinite(chartLastTime)) return null;
        const ilk = secToBar(c[0].time);
        const son = secToBar(c[c.length - 1].time);
        if (ilk === chartFirstTime && son === chartLastTime) return null;
        return { indicatorFirst: ilk, indicatorLast: son, chartFirst: chartFirstTime, chartLast: chartLastTime };
      },

      clear() {
        for (const id of Array.from(state.drawn.keys())) removeEntry(id);
        flushMarkers();
      },

      errors(payload) {
        const out = [];
        for (const [id, r] of Object.entries((payload && payload.results) || {})) {
          if (r && r.error) out.push({ id, error: r.error });
        }
        return out;
      }
    };
  }

  global.ChartIndicators = { create: createLayer, PALETTE };
})(window);
