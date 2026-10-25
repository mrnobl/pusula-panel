/**
 * C1 (74.8, TASARIM-MAKINE-HESAP-BOT §3 parça 1) — server.js'ten taşınan ARAŞTIRMA uçları, davranış AYNI:
 *   gostergeUclari()  GET /api/indicators, POST /api/indicators/compute(-multi), GET /api/strategies, /api/pine/* (inspect, liste, oku, save, sil)
 *   backtestUclari()  POST /api/backtest, GET /api/venues, /api/funding/*, POST /api/backtest/optimize, /api/backtest/walk-forward
 *   isUclari()        GET /api/veri/kapsam, POST /api/veri/indir, POST /api/backtest/is, /api/is/*, /api/strateji/*, backtest/scan-watchlist, strategy-scan
 * Üç grup server.js'te ESKİ YERLERİNDE çağrılır — Express uç sırası birebir aynı kalır (scripts/sunucu-uc-envanteri-selftest.js).
 * Ortak yardımcılar (mumGetir, ayarlariAl, optimizasyonPlani) olustur() düzeyinde; mumGetir kâğıt motor uçlarına ctx.mumGetir ile verilir.
 * ctx alanları KULLANIM ANINDA okunur (lib/sunucu/baglam.js); `config` server.js'te `let` → her yerde ctx.config.
 */
'use strict';
const fs = require('fs');
const yollar = require('../yollar');
const db = require('../database');
const { runScan: runStrategyScan } = require('../strategyScanner');
const strategyCatalog = require('../strategies/catalog');
const pineStore = require('../pine/store');
const { inspect: pineInspect } = require('../pine/inspect');
const venues = require('../venues');
const Backtester = require('../backtester');
const { ADAYLAR } = require('../research/adaylar');
const donchianPortfoy = require('../research/donchianPortfoy');
const kitapOlcum = require('../research/kitapOlcum');

function olustur(ctx) {
  const { engine } = ctx;   // olustur() /api/status ucundan sonra çağrılır: motor kurulmuş
  async function mumGetir(symbol, timeframe, limit) {
    const m = await engine.exchange.fetchOHLCV(symbol, timeframe, limit);
    if ((m && m.length) || !/^[A-Z0-9]+\/USDT$/.test(symbol)) return m;
    return engine.exchange.fetchOHLCV(`${symbol}:USDT`, timeframe, limit);
  }

  function ayarlariAl(anahtar) {
    return (ctx.config.strategies && ctx.config.strategies[anahtar]) || {};
  }

  function optimizasyonPlani(anahtar, baseConfig) {
    const kayit = strategyCatalog.get(anahtar);
    const Sinif = kayit && kayit.Class;
    if (Sinif && typeof Sinif.optimizePlan === 'function') {
      try { return Sinif.optimizePlan(baseConfig); } catch (err) { return null; }
    }
    // Elle yazılmış stratejiler ızgaralarını kendileri bildirir.
    const izgara = Sinif && Sinif.optimizeGrid;
    if (!izgara) return { izgara: {}, secilen: [], aday: [], toplam: 0 };
    const duz = typeof izgara === 'function' ? (izgara(baseConfig) || {}) : izgara;
    const anahtarlar = Object.keys(duz);
    return {
      izgara: duz,
      secilen: anahtarlar,
      aday: anahtarlar,
      toplam: anahtarlar.reduce((a, k) => a * (Array.isArray(duz[k]) ? duz[k].length : 1), 1)
    };
  }

  /** Gösterge havuzu, strateji kataloğu, Pine içe aktarma (server.js'te eski yeri: /api/status'tan sonra). */
  function gostergeUclari() {
    const { app, KNOWN_TIMEFRAMES } = ctx;
    /**
     * Gösterge havuzu kataloğu — grafik katmanının ve gösterge sayfasının kaynağı.
     *
     * Parametreler tipli döndüğü için form OTOMATİK üretilir: 52 göstergeye elle
     * form yazmak sürdürülemez. `render` her çıktının nereye çizileceğini söyler
     * (fiyat paneli / kendi paneli, çizgi / işaretçi / kutu / seviye).
     */
    app.get('/api/indicators', (req, res) => {
      const pool = require('../indicatorPool');
      const defs = pool.describe();

      // BOTLAR DA GÖSTERGE OLARAK LİSTELENİR (`bot:` öneki).
      //
      // Amaç grafikte "bot ne gördü ve ne yaptı"yı doğrudan görebilmek: kendi
      // stopu, kendi bantları, girdiği yerler ve GİRMEDİĞİ yerler (yutulan
      // sinyaller). Ayrı bir arayüz yazmak yerine gösterge katmanına takılıyor —
      // form üretimi, çizim, panel ve işaretçi veri yolu zaten hazır.
      const botDefs = strategyCatalog.describe().map(s => ({
        key: `bot:${s.key}`,
        label: `Bot: ${s.label}`,
        group: 'bot',
        kind: 'events',
        multi: false,
        outputs: ['stop', 'bbUpper', 'bbLower', 'direction', 'z',
          'entries', 'ladderTp', 'extremeExit', 'stopExit', 'trendExit', 'exits', 'blocked'],
        seriesOutputs: ['stop', 'bbUpper', 'bbLower', 'direction', 'z'],
        sparseOutputs: [],
        params: s.params,
        dependsOn: [],
        warmup: 0,
        render: {
          stop: { pane: 'price', as: 'line', series: true, sparse: false, label: 'Takip eden stop' },
          bbUpper: { pane: 'price', as: 'line', series: true, sparse: false, label: 'BB üst' },
          bbLower: { pane: 'price', as: 'line', series: true, sparse: false, label: 'BB alt' },
          direction: { pane: 'own', as: 'line', series: true, sparse: false, label: 'Yön (1/-1)' },
          z: { pane: 'own', as: 'line', series: true, sparse: false, label: 'Sapma (z)' },
          entries: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Girişler ▲' },
          ladderTp: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Kademeli TP ■ (üst band)' },
          extremeExit: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Ekstrem sapma çıkışı ●' },
          stopExit: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Stop / breakeven ▼' },
          trendExit: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Trend dönüşü ▼' },
          exits: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Diğer çıkışlar ▼' },
          blocked: { pane: 'price', as: 'markers', series: false, sparse: false, label: 'Girilmeyen sinyaller ○' }
        },
        note: `${s.note || ''} — Grafikte: stop ve bantlar çizgi, girişler/çıkışlar ok, yutulan sinyaller içi boş daire.`.trim()
      }));

      res.json({
        success: true,
        count: defs.length + botDefs.length,
        groups: { ...pool.groups(), bot: botDefs.map(b => b.key) },
        indicators: [...defs, ...botDefs]
      });
    });

    /**
     * Bir botu grafik katmanı için "gösterge" haline getirir.
     *
     * Backtester'ı iz açık koşturur ve iki şeyi birden döndürür:
     *   · bar bazlı seriler — stratejinin O BARDA GÖRDÜĞÜ kendi değerleri
     *   · işaretçiler — girişler, çıkışlar ve GİRİLMEYEN sinyaller
     *
     * Sonuncusu asıl istenen: "burada neden girmedi" sorusu grafikte, gerekçesiyle
     * birlikte görünüyor. Sinyal izi tablosu aynı bilgiyi veriyordu ama barla
     * eşleştirmek gözle mümkün değildi.
     */
    function runBotOverlay(strategyKey, params, candles, timeframe) {
      const taban = (ctx.config.strategies && ctx.config.strategies[strategyKey]) || {};
      const stratConfig = { ...taban, ...params, marketType: ctx.config.marketType || 'spot' };

      const res = Backtester.run(strategyKey, stratConfig, candles, 10000, timeframe, {
        trace: true,
        traceBars: true
      });

      const n = candles.length;
      const seri = (ad) => {
        const out = new Array(n).fill(null);
        for (const b of (res.trace.bars || [])) {
          const v = b[ad];
          if (Number.isFinite(v)) out[b.i] = v;
        }
        return out;
      };

      // İşaretler GERÇEK İŞLEMLERDEN türetilir, yalnızca strateji sinyallerinden
      // değil: stop ve breakeven çıkışları risk yöneticisinden gelir ve sinyal
      // izinde HİÇ görünmez. Sadece izi kullanmak, grafikte "pozisyon nasıl
      // kapandı" sorusunu cevapsız bırakıyordu.
      const zamanIndeks = new Map();
      candles.forEach((c, i) => zamanIndeks.set(c.time, i));
      const barIndeksi = (isoZaman) => {
        const ms = Date.parse(isoZaman);
        if (!Number.isFinite(ms)) return null;
        if (zamanIndeks.has(ms)) return zamanIndeks.get(ms);
        // Zaman damgası tam oturmazsa en yakın barı bul.
        let en = null, enFark = Infinity;
        for (const [t, i] of zamanIndeks) {
          const f = Math.abs(t - ms);
          if (f < enFark) { enFark = f; en = i; }
        }
        return en;
      };

      const islemler = res.trades || [];
      const isaretle = (filtre, tip, shape, direction) => islemler.filter(filtre).map(t => {
        const alim = String(t.type) === 'BUY';
        const idx = barIndeksi(alim ? t.entryTime : t.exitTime);
        return idx === null ? null : {
          index: idx,
          confirmedAt: idx,
          direction,
          type: tip,
          shape,
          price: alim ? t.entryPrice : t.exitPrice,
          profitUSDT: t.profitUSDT,
          reason: t.reason
        };
      }).filter(Boolean);

      // Kapanış etiketi yön duyarlı: long SELL, short COVER.
      const kapanis = (t) => /^(SELL|COVER)/.test(String(t.type));
      const sebep = (re) => (t) => kapanis(t) && re.test(t.reason || '');

      return {
        stop: seri('stop'),
        bbUpper: seri('bbUpper'),
        bbLower: seri('bbLower'),
        direction: seri('dir'),
        z: seri('z'),
        entries: isaretle(t => String(t.type) === 'BUY' || String(t.type) === 'SHORT', 'GİRİŞ', 'arrowUp', 'bullish'),
        // Kademeli TP'nin kendi işareti var: nihai çıkışla aynı oku kullanmak
        // ikisini ayırt edilemez kılıyordu (kullanıcı "kademeli satış yerleri
        // görünmüyor" derken tam olarak bunu görüyordu).
        ladderTp: isaretle(sebep(/Kademeli TP/), 'KADEMELİ TP', 'square', 'bearish'),
        extremeExit: isaretle(sebep(/Ekstrem/), 'EKSTREM', 'circle', 'bearish'),
        stopExit: isaretle(sebep(/STOP|Stop|Breakeven|BREAKEVEN/), 'STOP', 'arrowDown', 'bearish'),
        trendExit: isaretle(sebep(/trend dönüşü/), 'TREND DÖNÜŞÜ', 'arrowDown', 'bearish'),
        exits: isaretle(
          t => kapanis(t)
            && !/Kademeli TP|Ekstrem|STOP|Stop|Breakeven|BREAKEVEN|trend dönüşü/.test(t.reason || ''),
          'ÇIKIŞ', 'arrowDown', 'bearish'
        ),
        blocked: (res.trace.signals || []).filter(s => !s.executed).map(s => ({
          index: s.index, confirmedAt: s.index, direction: s.action === 'BUY' ? 'bullish' : 'bearish',
          type: 'GİRİLMEDİ', shape: 'circle', reason: s.reason, blockedBy: s.blockedBy || null
        })),
        _meta: {
          key: `bot:${strategyKey}`,
          params: stratConfig,
          warmup: (res.warmup && res.warmup.bars) || 0,
          trades: res.totalTrades,
          // İşaret eşlemesi tanısı: işaretler boş çıkarsa sebebi burada görünür
          // (işlem yok mu, zaman damgası bara oturmuyor mu).
          markerDebug: {
            tradeRecords: islemler.length,
            firstType: islemler[0] ? String(islemler[0].type) : null,
            firstTime: islemler[0] ? (islemler[0].entryTime || islemler[0].exitTime) : null,
            firstIndex: islemler[0] ? barIndeksi(islemler[0].entryTime || islemler[0].exitTime) : null,
            candleTimeSample: candles[0] ? candles[0].time : null
          },
          returnPct: res.totalReturnPct,
          signals: res.trace.totalSignals,
          blockedReasons: res.trace.blocked,
          warmupWarning: (res.warmup && res.warmup.warning) || null
        }
      };
    }

    /**
     * Gösterge hesabı — mumlarla BİRLİKTE.
     *
     * Mumları ve serileri iki ayrı istekte çekmek indeks kayması riski yaratır:
     * arada yeni bir mum kapanırsa grafik bir bara, seri başka bara oturur ve
     * havuzun tüm hizalama disiplini boşa gider. Bu yüzden tek yanıt.
     *
     * Bir gösterge hata verirse yalnızca o spec `error` ile döner; bozuk bir
     * parametre yüzünden grafiğin tamamı boş kalmaz.
     */
    /**
     * Grafik mumları. Bot vadeli işlem görür: 1000PEPE/USDT gibi semboller spotta YOK (yalnız USDT-M perp).
     * Spot boş dönerse aynı sembolün perp karşılığından (X/USDT:USDT) çizilir — işlem panelinde PEPE grafiği boş kalıyordu.
     */

    app.post('/api/indicators/compute', async (req, res) => {
      try {
        const pool = require('../indicatorPool');

        const symbol = req.body.symbol || ctx.config.symbol || 'BTC/USDT';
        const timeframe = KNOWN_TIMEFRAMES.includes(req.body.timeframe) ? req.body.timeframe : (ctx.config.timeframe || '1h');
        const limit = Math.min(Math.max(parseInt(req.body.limit) || 500, 30), 5000);
        const specs = Array.isArray(req.body.specs) ? req.body.specs : [];

        const candles = await mumGetir(symbol, timeframe, limit);
        if (!candles || candles.length === 0) {
          return res.status(503).json({ success: false, error: `${symbol} (${timeframe}) için mum verisi alınamadı.` });
        }

        const results = {};
        for (const spec of specs) {
          if (!spec || !spec.key) continue;
          const id = spec.id || spec.key;
          try {
            // `bot:` önekli anahtarlar havuza değil STRATEJİ koşucusuna gider.
            if (String(spec.key).startsWith('bot:')) {
              results[id] = runBotOverlay(String(spec.key).slice(4), spec.params || {}, candles, timeframe);
              continue;
            }
            const out = pool.computeOne(candles, spec.key, spec.params || {});
            // `_meta` hesap bağlamını taşır (ısınma, çözülmüş parametreler) —
            // grafik ısınma barlarını boş bırakmak için buna bakar.
            results[id] = out;
          } catch (err) {
            results[id] = { error: err.message, _meta: { key: spec.key, params: spec.params || {} } };
          }
        }

        res.json({ success: true, symbol, timeframe, count: candles.length, candles, results });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    /**
     * Çok sembollü hesap (korelasyon, beta, SMT). Ortak zaman ekseni ve elenen
     * semboller yanıtta bildirilir — bir sembolün bayat önbelleği yüzünden sessiz
     * boş sonuç dönmesi bu katmanda bir kez yaşandı, görünür olmalı.
     */
    app.post('/api/indicators/compute-multi', async (req, res) => {
      try {
        const pool = require('../indicatorPool');

        const timeframe = KNOWN_TIMEFRAMES.includes(req.body.timeframe) ? req.body.timeframe : (ctx.config.timeframe || '1h');
        const limit = Math.min(Math.max(parseInt(req.body.limit) || 500, 30), 5000);
        const symbols = Array.isArray(req.body.symbols) && req.body.symbols.length
          ? req.body.symbols
          : (ctx.config.watchlist || []).slice(0, 4);
        const specs = Array.isArray(req.body.specs) ? req.body.specs : [];

        if (symbols.length < 2) {
          return res.status(400).json({ success: false, error: 'Çok sembollü hesap için en az iki sembol gerekir.' });
        }

        const seriesMap = {};
        for (const sym of symbols) {
          const c = db.getCandleCache(sym, timeframe, limit);
          if (c && c.length >= 30) seriesMap[sym] = c;
        }

        const out = pool.computeMulti(seriesMap, specs.map(s => ({ key: s.key, params: s.params || {}, as: s.id || s.key })));
        res.json({ success: true, timeframe, symbols: out._symbols, times: out._times, dropped: out._dropped, limitedBy: out._limitedBy, results: out });
      } catch (err) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    /**
     * Panelin Stratejiler listesindeki ölçüm rozeti: `lib/research/adaylar.js`
     * kaydından. Donchian'ın katalog anahtarı `donchian_trend`, ölçüm kaydı
     * `donchian_portfoy` (canlıda koşan portföy modu). Kaydı olmayan strateji
     * 'ÖLÇÜLMEDİ'.
     */
    const ADAY_KATALOG = { donchian_portfoy: 'donchian_trend' };
    function olcumDurumu(key) {
      const aday = ADAYLAR.find(a => (ADAY_KATALOG[a.anahtar] || a.anahtar) === key);
      return aday ? aday.durum : 'ÖLÇÜLMEDİ';
    }

    /**
     * Strateji kataloğu. Panel listeleri buradan kurulur — üç ayrı `<select>`
     * elle tutuluyordu ve üçü de birbirinden farklıydı (hiçbirinde `regime_trend`
     * yoktu). `archived: true` olanlar eski 7 strateji: silinmiyorlar, kontrol
     * grubu olarak kalıyorlar; panelde ayrı grupta listelenir.
     */
    app.get('/api/strategies', (req, res) => {
      res.json({
        success: true,
        strategies: strategyCatalog.describe().map(s => ({ ...s, durum: olcumDurumu(s.key) })),
        active: strategyCatalog.activeKeys(),
        archived: strategyCatalog.archivedKeys()
      });
    });

    /**
     * Bir stratejinin KAYDEDİLMİŞ ayarları. Kayıt yoksa boş nesne.
     *
     * `config.strategies` bir stratejinin VAR OLUP OLMADIĞININ kaydı değildir,
     * yalnızca kullanıcının değiştirdiği ayarlardır. Yeni içe aktarılan bir
     * Pine botunun burada kaydı olmaz ve olmaması normaldir — strateji kendi
     * varsayılanlarını kullanır. Varlık sorusunun tek cevabı `strategyCatalog`.
     */

    /**
     * Optimizasyon planı: hangi parametreler aranabilir, hangileri arandı, kaç
     * kombinasyon eder. Panel bunu göstermezse kullanıcı "optimize ettim" der
     * ama neyin arandığını bilmez — 14 parametreli bir botta 4'ünün arandığını
     * bilmemek sonucu yanlış okutur.
     */

    /* ─────────────────────────────────────────────────────────────────────────
     * PINE İÇE AKTARMA
     *
     * `/inspect` KAYDETMEDEN önce raporlar: hangi parametreler bulundu, hangi
     * satırlar çevrilemiyor. Kullanıcı "kaydet" demeden neyin çalışmayacağını
     * görmeli — yarısı çevrilmiş bir strateji doğru görünen yanlış sayı üretir.
     * ───────────────────────────────────────────────────────────────────────── */
    app.post('/api/pine/inspect', (req, res) => {
      try {
        const { kaynak } = req.body || {};
        if (typeof kaynak !== 'string' || !kaynak.trim()) {
          return res.status(400).json({ success: false, error: 'Betik boş' });
        }
        const bilgi = pineInspect(kaynak);
        // `agac` yanıta konmaz: büyüktür ve panelde işi yoktur.
        const { agac, ...ozet } = bilgi;
        void agac;
        res.json({
          success: true,
          bilgi: ozet,
          derlenir: bilgi.tur === 'strategy' && bilgi.desteklenmeyen.length === 0
        });
      } catch (err) {
        // Ayrıştırma hatası bir SONUÇTUR, sunucu hatası değil: satır numarasıyla
        // birlikte 200 döner ki panel onu form hatası gibi gösterebilsin.
        res.json({ success: true, bilgi: null, derlenir: false, ayristirmaHatasi: err.message });
      }
    });

    app.get('/api/pine', (req, res) => {
      try {
        res.json({ success: true, betikler: pineStore.listele() });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.get('/api/pine/:anahtar', (req, res) => {
      let kaynak;
      try { kaynak = pineStore.kaynakOku(req.params.anahtar); } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
      }
      if (kaynak === null) return res.status(404).json({ success: false, error: 'Betik bulunamadı' });
      res.json({ success: true, anahtar: req.params.anahtar, kaynak });
    });

    app.post('/api/pine/save', (req, res) => {
      try {
        const { kaynak, anahtar } = req.body || {};
        const r = pineStore.kaydet(kaynak, { anahtar });
        db.addLog('SUCCESS', `📥 Pine betiği ${r.guncelleme ? 'güncellendi' : 'kaydedildi'}: ${r.etiket} (${r.anahtar}, ${r.parametre} parametre)`);
        res.json({ success: true, ...r });
      } catch (err) {
        db.addLog('WARN', `Pine betiği kaydedilemedi: ${err.message}`);
        res.status(400).json({ success: false, error: err.message });
      }
    });

    app.delete('/api/pine/:anahtar', (req, res) => {
      try {
        const anahtar = req.params.anahtar;
        // Silinen strateji çalışan bir bota bağlıysa önce onu durdur — yoksa
        // motor her tikte "bilinmeyen strateji" ile çakılırdı.
        const durdurulan = engine.stopBotsByStrategy ? engine.stopBotsByStrategy(anahtar) : 0;
        const vardi = pineStore.sil(anahtar);
        if (!vardi) return res.status(404).json({ success: false, error: 'Betik bulunamadı' });
        db.addLog('INFO', `🗑️ Pine betiği silindi: ${anahtar}${durdurulan ? ` (${durdurulan} bot durduruldu)` : ''}`);
        res.json({ success: true, anahtar, durdurulanBot: durdurulan });
      } catch (err) {
        res.status(400).json({ success: false, error: err.message });
      }
    });
  }

  /** Tek koşu backtest, borsalar, funding, optimizasyon, walk-forward (eski yeri: kâğıt motor uçlarından sonra). */
  function backtestUclari() {
    const { app } = ctx;
    // Backtest Single Run Endpoint
    app.post('/api/backtest', async (req, res) => {
      try {
        const { strategyName, symbol, timeframe, candlesCount, initialCapital, customConfig } = req.body;
        const targetSymbol = symbol || ctx.config.symbol;
        const tf = timeframe || '1h';
        const limit = parseInt(candlesCount) || 500;
        const stratKey = strategyName || ctx.config.activeStrategy;
        let stratConfig = customConfig || ctx.config.strategies[stratKey] || {};

        /**
         * VADELİ BACKTEST: kontrat özellikleri ve gerçek funding serisi motora
         * DIŞARIDAN verilmek zorunda — backtester sembolü bilmez (`'BACKTEST'` ile
         * çalışır). Panelden piyasa tipi "perpetual" seçildiğinde burada hazırlanır,
         * yoksa vadeli koşu sessizce sabit funding varsayımına ve yedek marj
         * kademelerine düşer.
         */
        if (venues.normalizeMarket(ctx.config.marketType) === 'perp' && String(ctx.config.marketType) !== 'spot') {
          try {
            const ek = await Backtester.perpConfig(targetSymbol, { venue: ctx.config.exchange }, {
              apiKey: ctx.config.apiKey, apiSecret: ctx.config.apiSecret
            });
            stratConfig = { ...stratConfig, ...ek, leverage: Math.max(1, Math.min(100, Number(ctx.config.leverage) || 1)) };
            if (!ek.fundingSeries.length) {
              db.addLog('WARN', `${targetSymbol} için depoda funding geçmişi yok — sabit varsayım kullanılacak. (Vadeli sekmesinden çekilebilir.)`);
            }
          } catch (e) {
            db.addLog('WARN', `Vadeli kurulum hazırlanamadı (${e.message}); spot varsayımlarıyla koşuluyor.`);
          }
        }

        db.addLog('INFO', `Backtest Başlatılıyor: ${stratKey} (${targetSymbol}, ${tf}, ${limit} Mum)`);

        const ohlcv = await engine.exchange.fetchOHLCV(targetSymbol, tf, limit);
        // Sinyal izi varsayılan AÇIK: tek koşuluk backtestte maliyeti düşük ve
        // "strateji doğru al-sat yapıyor mu" sorusunun tek kaynağı bu.
        // Optimizasyon/tarama gibi yüzlerce koşu yapan yollar izi istemez.
        const trace = req.body.trace !== false;
        const result = Backtester.run(stratKey, stratConfig, ohlcv, parseFloat(initialCapital) || 10000.0, tf, { trace });

        // The result travels to panels that do not know which form produced it, so
        // it carries its own market context for the price chart.
        result.symbol = targetSymbol;
        result.timeframe = tf;
        result.candleCount = ohlcv.length;

        db.addLog('SUCCESS', `Backtest Tamamlandı! Kâr: %${result.totalReturnPct} | WinRate: %${result.winRatePct} | Sharpe: ${result.sharpeRatio}`);
        res.json({ success: true, result });
      } catch (err) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    /**
     * VADELİ: kayıtlı borsalar ve kontrat özellikleri.
     *
     * `tiersSource` alanı kritik: `'varsayim'` dönüyorsa likidasyon fiyatı
     * yaklaşıktır (Binance kaldıraç kademelerini anahtarsız vermiyor) ve panelde
     * bunun görünmesi gerekir.
     */
    app.get('/api/venues', async (req, res) => {
      try {
        const liste = venues.listVenues();
        const symbol = req.query.symbol;
        let specs = null;
        if (symbol) {
          specs = await venues.contractSpecs(
            req.query.venue || ctx.config.exchange, 'perp', symbol,
            { apiKey: ctx.config.apiKey, apiSecret: ctx.config.apiSecret }
          );
        }
        res.json({ success: true, venues: liste, specs });
      } catch (err) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    /** Tarihsel funding oranlarını borsadan çeker ve depoya yazar. */
    app.post('/api/funding/fetch', async (req, res) => {
      try {
        const symbol = req.body.symbol || ctx.config.symbol;
        const venue = (req.body.venue || ctx.config.exchange || 'binance').toLowerCase();
        const kayitlar = await venues.fetchFundingHistory(venue, symbol, undefined, {
          apiKey: ctx.config.apiKey, apiSecret: ctx.config.apiSecret
        });
        const n = db.saveFundingHistory(symbol, kayitlar, { venue, market: 'perp' });
        const stats = db.getFundingStats(symbol, { venue, market: 'perp' });
        db.addLog('SUCCESS', `💰 ${symbol} funding geçmişi güncellendi: ${n} kayıt (${venue}).`);
        res.json({ success: true, saved: n, stats });
      } catch (err) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    /** Depodaki funding durumu (panelde "veri var mı" göstergesi). */
    app.get('/api/funding/stats', (req, res) => {
      try {
        const symbol = req.query.symbol || ctx.config.symbol;
        const venue = (req.query.venue || ctx.config.exchange || 'binance').toLowerCase();
        res.json({ success: true, stats: db.getFundingStats(symbol, { venue, market: 'perp' }) });
      } catch (err) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    // Automated Strategy Parameter Grid Search & Optimizer Endpoint for single asset
    app.post('/api/backtest/optimize', async (req, res) => {
      try {
        const { strategyName, symbol, timeframe, candlesCount, initialCapital, optimizeParams } = req.body;
        const targetSymbol = symbol || ctx.config.symbol;
        const tf = timeframe || '1h';
        const limit = parseInt(candlesCount) || 500;
        const stratKey = strategyName || ctx.config.activeStrategy;
        if (!strategyCatalog.has(stratKey)) {
          return res.status(400).json({ success: false, error: `Bilinmeyen strateji: ${stratKey}` });
        }
        const baseConfig = { ...ayarlariAl(stratKey) };
        // Kullanıcı hangi parametrelerin aranacağını seçebilir; seçmezse strateji
        // kendi varsayılan seçimini yapar.
        if (Array.isArray(optimizeParams) && optimizeParams.length) baseConfig.__optimizeParams = optimizeParams;

        db.addLog('INFO', `⚡ PARAMETRE OPTİMİZATÖRÜ BAŞLATILDI: ${stratKey} (${targetSymbol}, ${tf}, ${limit} Mum)...`);

        const ohlcv = await engine.exchange.fetchOHLCV(targetSymbol, tf, limit);
        const optimizationResult = Backtester.optimizeParameters(stratKey, baseConfig, ohlcv, parseFloat(initialCapital) || 10000.0, tf);
        optimizationResult.plan = optimizasyonPlani(stratKey, baseConfig);

        db.addLog('SUCCESS', `🎯 OPTİMİZASYON TAMAMLANDI! ${optimizationResult.testedPermutations} Kombinasyon Test Edildi.`);
        res.json({ success: true, optimizationResult });
      } catch (err) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    // Panel bu ucu KULLANMIYOR (panel `/api/backtest/is` iş akışında). Kalma sebebi:
    // `scripts/pine-uc-testi.js` eski senkron yolu da sınıyor. (Pusula P4: iş parçacığı
    // lib/backtest/isci.js içe aktarılan Pine'ı da koşar — kaynak iş verisinde gider.)
    // Walk-forward: kayan pencere, %70 eğitim / %30 test (`lib/backtest/optimize.js`)
    app.post('/api/backtest/walk-forward', async (req, res) => {
      try {
        const { strategyName, symbol, timeframe, candlesCount, initialCapital, optimizeParams, katSayisi } = req.body;
        const targetSymbol = symbol || ctx.config.symbol;
        const tf = timeframe || '1h';
        const limit = parseInt(candlesCount) || 500;
        const stratKey = strategyName || ctx.config.activeStrategy;
        if (!strategyCatalog.has(stratKey)) {
          return res.status(400).json({ success: false, error: `Bilinmeyen strateji: ${stratKey}` });
        }
        const baseConfig = { ...ayarlariAl(stratKey) };
        if (Array.isArray(optimizeParams) && optimizeParams.length) baseConfig.__optimizeParams = optimizeParams;

        db.addLog('INFO', `🧪 Walk-forward başladı: ${stratKey} (${targetSymbol}, ${tf}, ${limit} mum)`);

        const ohlcv = await engine.exchange.fetchOHLCV(targetSymbol, tf, limit);
        const walkForwardResult = Backtester.runWalkForward(stratKey, baseConfig, ohlcv, parseFloat(initialCapital) || 10000.0, tf, { katSayisi });
        walkForwardResult.plan = optimizasyonPlani(stratKey, baseConfig);
        walkForwardResult.symbol = targetSymbol;
        walkForwardResult.timeframe = tf;

        db.addLog('SUCCESS', `✅ Walk-forward bitti: WFE ${walkForwardResult.wfe == null ? '—' : '%' + walkForwardResult.wfe} · ${walkForwardResult.overfittingStatus}`);
        res.json({ success: true, walkForwardResult });
      } catch (err) {
        res.status(400).json({ success: false, error: err.message });
      }
    });
  }

  /** Tarih aralıklı backtest işleri, veri kapsamı/indirme, strateji araştırması, taramalar (eski yeri: tasarımcı zamanlayıcısından sonra). */
  function isUclari() {
    const { app, broadcast, isler, veriOrk } = ctx;
    const aralikVeri = require('../veri/aralik');   // server.js bu noktadan önce yükledi (yükleme sırası aynı)
    /** İstekten veri kaynağı: borsa, piyasa, sembol, dilim, [bas, bit] (ms). */
    function kaynakOku(g) {
      const tf = g.timeframe || g.tf || '1h';
      aralikVeri.tfMs(tf);   // desteklenmeyen dilimde hata atar
      const market = venues.normalizeMarket(g.market || g.marketType || 'spot');
      const bas = g.bas != null && g.bas !== '' ? Date.parse(g.bas) : 0;
      const bit = g.bit != null && g.bit !== '' ? Date.parse(g.bit) + (String(g.bit).length <= 10 ? 864e5 - 1 : 0) : Date.now();
      if (!Number.isFinite(bas) || !Number.isFinite(bit)) throw new Error('Tarih okunamadı (YYYY-AA-GG bekleniyor)');
      if (bit <= bas) throw new Error('Bitiş tarihi başlangıçtan sonra olmalı');
      return { venue: String(g.venue || g.exchange || 'binance').toLowerCase(), market, sembol: g.symbol || ctx.config.symbol, tf, bas, bit };
    }

    /** Vadelide funding geçmişini aralığın başından itibaren tamamlar. */
    async function fundingTamamla(k) {
      if (k.market !== 'perp') return 0;
      const ds = aralikVeri.depoSembolu(k.sembol, k.market);
      const st = db.candleStore.fundingStats(ds, { venue: k.venue, market: 'perp' }) || {};
      const ilk = st.firstTime || st.ilk || null, son = st.lastTime || st.son || null;
      let since = null;
      if (!ilk || ilk > k.bas + 864e5) since = Math.max(k.bas, Date.UTC(2019, 0, 1));
      else if (!son || son < Date.now() - 9 * 3600e3) since = son + 1;
      if (since == null) return 0;
      const kayitlar = await venues.fetchFundingHistory(k.venue, ds, since);
      if (kayitlar.length) db.candleStore.saveFunding(ds, kayitlar, { venue: k.venue, market: 'perp' });
      return kayitlar.length;
    }

    app.get('/api/veri/kapsam', async (req, res) => {
      try {
        const k = kaynakOku(req.query);
        let ilk = null;
        try { ilk = await aralikVeri.ilkMum(k.venue, k.market, k.sembol, k.tf); } catch (e) { /* ağ yoksa depoyla yetin */ }
        const kap = aralikVeri.kapsam(db.candleStore, { ...k, ilk });
        const depo = db.candleStore.stats(kap.depoSembolu, k.tf, { venue: k.venue, market: k.market });
        res.json({ success: true, ilk, kapsam: kap, depo });
      } catch (err) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    app.post('/api/veri/indir', async (req, res) => {
      let k;
      try { k = kaynakOku(req.body || {}); } catch (err) { return res.status(400).json({ success: false, error: err.message }); }
      const is = isler.yeni('indir', `${k.venue} ${k.market} ${k.sembol} ${k.tf}`);
      res.json({ success: true, is: isler.ozet(is) });
      try {
        const r = await aralikVeri.indir(db.candleStore, { ...k,
          ilerleme: (p) => isler.guncelle(is, p.yuzde / 100 * 0.95, `${p.indirilen.toLocaleString('tr-TR')} / ${p.toplam.toLocaleString('tr-TR')} mum`),
          iptal: () => is.iptal });
        const f = await fundingTamamla(k);
        db.addLog('SUCCESS', `📥 Veri indirildi: ${k.sembol} ${k.tf} ${k.market} · ${r.indirilen} mum, ${r.istek} istek, ${(r.sure / 1000).toFixed(0)} sn${f ? ` · ${f} funding` : ''}`);
        isler.bitir(is, { indirilen: r.indirilen, istek: r.istek, sure: r.sure, funding: f, kapsam: r.kapsam });
      } catch (err) {
        isler.hata(is, err.message);
      }
    });

    /**
     * Backtest / optimizasyon / walk-forward işi. Gövde:
     * { tur: 'tek'|'optimize'|'walkforward', strategyName, symbol, timeframe,
     *   market, venue, leverage, bas, bit, initialCapital, customConfig,
     *   optimizeParams, katSayisi }
     */
    app.post('/api/backtest/is', async (req, res) => {
      const g = req.body || {};
      let k;
      try {
        k = kaynakOku(g);
        if (g.tur !== 'tarama' && !strategyCatalog.has(g.strategyName)) throw new Error(`Bilinmeyen strateji: ${g.strategyName}`);
      } catch (err) { return res.status(400).json({ success: false, error: err.message }); }

      // İZLEME LİSTESİ TARAMASI: her varlığın aralığı tamamlanır, sonra tek iş parçacığı.
      if (g.tur === 'tarama') {
        const liste = (ctx.config.watchlist || []).map(x => (typeof x === 'string' ? x : x.symbol)).filter(Boolean);
        if (!liste.length) return res.status(400).json({ success: false, error: 'İzleme listesi boş' });
        const is = isler.yeni('tarama', `${liste.length} varlık · ${k.tf} ${k.market}`);
        res.json({ success: true, is: isler.ozet(is) });
        try {
          const kaynaklar = liste.map(sembol => ({ ...k, sembol }));
          for (let i = 0; i < kaynaklar.length; i++) {
            if (is.iptal) return;
            const kk = kaynaklar[i];
            isler.guncelle(is, i / kaynaklar.length * 0.3, `Veri: ${kk.sembol}`);
            try { await aralikVeri.indir(db.candleStore, { ...kk, iptal: () => is.iptal }); }
            catch (e) { db.addLog('WARN', `Tarama verisi indirilemedi (${kk.sembol}): ${e.message}`); }
          }
          const ayarlar = {};
          for (const s of strategyCatalog.keys()) ayarlar[s] = ayarlariAl(s);
          const m = await isler.isciCalistir(is, { tur: 'tarama', kaynaklar, ayarlar, sermaye: g.initialCapital, stratejiler: g.stratejiler }, (lv, msg) => db.addLog(lv, msg));
          db.addLog('SUCCESS', `🏆 Tarama bitti: ${m.sonuc.opportunityCount} aday, sıralama örneklem dışından`);
          isler.bitir(is, m.sonuc);
        } catch (err) { isler.hata(is, err.message); }
        return;
      }
      const tur = ['tek', 'optimize', 'walkforward'].includes(g.tur) ? g.tur : 'tek';
      const is = isler.yeni(tur, `${g.strategyName} · ${k.sembol} ${k.tf} ${k.market}`);
      res.json({ success: true, is: isler.ozet(is) });

      try {
        // 1. Veri: eksik varsa indir (vadelide funding de).
        const ilk = await aralikVeri.ilkMum(k.venue, k.market, k.sembol, k.tf).catch(() => null);
        const kap = aralikVeri.kapsam(db.candleStore, { ...k, ilk });
        if (!kap.tam) {
          isler.guncelle(is, 0, `Eksik ${kap.eksikMum.toLocaleString('tr-TR')} mum indiriliyor`);
          await aralikVeri.indir(db.candleStore, { ...k,
            ilerleme: (p) => isler.guncelle(is, p.yuzde / 100 * 0.4, `Veri indiriliyor: ${p.indirilen.toLocaleString('tr-TR')} / ${p.toplam.toLocaleString('tr-TR')} mum`),
            iptal: () => is.iptal });
        }
        if (is.iptal) return;
        await fundingTamamla(k).catch(e => db.addLog('WARN', `Funding indirilemedi: ${e.message}`));

        // 2. Ayar: kayıtlı + panelden gelen. Vadeli kurulum yalnız BU koşuya.
        let ayar = { ...ayarlariAl(g.strategyName), ...(g.customConfig || {}) };
        if (Array.isArray(g.optimizeParams) && g.optimizeParams.length) ayar.__optimizeParams = g.optimizeParams;
        let komisyonPct = null;
        if (k.market === 'perp') {
          const ds = aralikVeri.depoSembolu(k.sembol, k.market);
          const ek = await Backtester.perpConfig(ds, { venue: k.venue }, { apiKey: ctx.config.apiKey, apiSecret: ctx.config.apiSecret });
          // Yalnız aralığın funding'i — tüm geçmişi iş parçacığına kopyalamaya gerek yok.
          ek.fundingSeries = ek.fundingSeries.filter(f => f.time >= kap.bas - 864e5 && f.time <= kap.bit + 864e5);
          ayar = { ...ayar, ...ek, leverage: Math.max(1, Math.min(100, Number(g.leverage) || 1)) };
          komisyonPct = ek.feePct;
          if (!ek.fundingSeries.length) db.addLog('WARN', `${ds}: aralıkta funding kaydı yok — sabit varsayım kullanılacak.`);
        } else {
          ayar.marketType = 'spot';
        }

        // Hücum / Denge "botun tamamı" kutusu kol önbelleğinden gelir: bayatsa arka planda tazelenir (koşu BEKLEMEZ, eldeki
        // veriyle koşar), kutuya "veri X tarihine kadar; güncelleme sürüyor" notu düşülür (lib/veri/orkestrator.js talep).
        const vtBindirme = (g.strategyName === 'hucum' || g.strategyName === 'denge') ? veriOrk.talep(['kol-onbellegi'], { neden: `talep: backtest ${g.strategyName}` }) : null;

        // 3. Koşu — iş parçacığında.
        isler.guncelle(is, 0.42, 'Simülasyon başlıyor');
        // İçe aktarılan Pine: kaynağı iş verisinde gider (isci.js pineKaydet) — iş parçacığı depoya bağlı kalmaz.
        const pineIs = String(g.strategyName).startsWith(pineStore.ONEK) ? { anahtar: g.strategyName, kaynak: pineStore.kaynakOku(g.strategyName) } : null;
        const m = await isler.isciCalistir(is, {
          tur, strateji: g.strategyName, ayar, sermaye: g.initialCapital, pine: pineIs,
          kaynak: k, secenek: { katSayisi: g.katSayisi },
          baglam: { symbol: k.sembol, market: k.market, venue: k.venue, komisyonPct }
        }, (lv, msg) => db.addLog(lv, msg));
        const sonuc = m.sonuc;
        if (vtBindirme && vtBindirme.veriNotu && sonuc && sonuc.bindirmeEk && sonuc.bindirmeEk.kapsam) (sonuc.bindirmeEk.kapsam.not = sonuc.bindirmeEk.kapsam.not || []).push(vtBindirme.veriNotu);
        if (tur === 'tek') {
          if (komisyonPct != null && sonuc.varsayimlar) sonuc.varsayimlar.komisyonPct = komisyonPct;
          sonuc.isId = is.id;
          db.addLog('SUCCESS', `Backtest bitti: ${g.strategyName} ${k.sembol} ${k.tf} · ${sonuc.candleCount} mum · %${sonuc.totalReturnPct} · ${sonuc.totalTrades} işlem`);
        } else if (tur === 'optimize') {
          sonuc.plan = optimizasyonPlani(g.strategyName, ayar);
        } else {
          sonuc.plan = optimizasyonPlani(g.strategyName, ayar);
          sonuc.symbol = k.sembol; sonuc.timeframe = k.tf;
        }
        isler.bitir(is, sonuc, { tumIslemler: m.tumIslemler || null });
      } catch (err) {
        db.addLog('ERROR', `İş başarısız (${is.aciklama}): ${err.message}`);
        isler.hata(is, err.message);
      }
    });

    app.get('/api/is', (req, res) => res.json({ success: true, isler: isler.liste() }));

    app.get('/api/is/:id', (req, res) => {
      const is = isler.al(req.params.id);
      if (!is) return res.status(404).json({ success: false, error: 'İş bulunamadı (sunucu yeniden başlamış olabilir)' });
      res.json({ success: true, is: isler.ozet(is), sonuc: is.durum === 'bitti' ? is.sonuc : null });
    });

    app.post('/api/is/:id/iptal', (req, res) => {
      res.json({ success: isler.iptalEt(req.params.id) });
    });

    /** İşlem listesinin TAMAMI (panel kırpılmış listeyi görür). */
    app.get('/api/is/:id/islemler.csv', (req, res) => {
      const is = isler.al(req.params.id);
      if (!is || !is.sonuc) return res.status(404).type('text/plain').send('İş bulunamadı');
      const liste = (is.ek && is.ek.tumIslemler) || is.sonuc.trades || [];
      const alanlar = ['id', 'type', 'direction', 'entryTime', 'exitTime', 'entryPrice', 'exitPrice', 'amount', 'profitUSDT', 'profitPct', 'barsInTrade', 'kademe', 'reason'];
      const kacis = (v) => { if (v == null) return ''; const s = String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const satirlar = [alanlar.join(';'), ...liste.map(t => alanlar.map(a => kacis(t[a])).join(';'))];
      res.setHeader('Content-Disposition', `attachment; filename="islemler-${is.id}.csv"`);
      res.type('text/csv; charset=utf-8').send('﻿' + satirlar.join('\n'));
    });

    /**
     * STRATEJİ ARAŞTIRMASI — ölçülmüş adaylar (`lib/research/adaylar.js`) ve
     * yeniden ölçüm. Ölçüm `data/market.db`deki 4h perp mumlarından ve funding
     * kayıtlarından yapılır (ağ yok); veri `scripts/vadeli-veri-cek.js` ile tazelenir.
     */
    app.get('/api/strateji/adaylar', (req, res) => {
      res.json({ success: true, adaylar: ADAYLAR });
    });

    app.post('/api/strateji/olc', (req, res) => {
      try {
        const { anahtar, semboller } = req.body || {};
        const aday = ADAYLAR.find(a => a.anahtar === anahtar);
        if (!aday || !aday.olcum) throw new Error(`Yeniden ölçülebilir aday değil: ${anahtar}`);
        if (aday.olcum.tur === 'kitap') {
          // Kitap stratejisi: motorla 15 varlık + Donchian'la korelasyon.
          const donchianEgri = donchianPortfoy.olc()._ham.S.egri;
          const { _egri, ...ham } = kitapOlcum.olc(aday.olcum.strateji, { donchianEgri });
          const sonuc = { tur: 'kitap', ...ham };
          db.addLog('INFO', `🔬 ${aday.ad}: ${sonuc.karar} · Sharpe ${sonuc.metrik.sharpe}`);
          return res.json({ success: true, sonuc });
        }
        const liste = Array.isArray(semboller) && semboller.length ? semboller : (aday.olcum.semboller || donchianPortfoy.VARSAYILAN_VARLIKLAR);
        const { _ham, ...sonuc } = donchianPortfoy.olc(liste);
        db.addLog('INFO', `🔬 ${aday.ad}: ${sonuc.karar} · Sharpe ${sonuc.metrik.strateji.sharpe} · veri ${sonuc.veriSonGun}`);
        res.json({ success: true, sonuc });
      } catch (err) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    // Panel bu ucu KULLANMIYOR (panel `/api/backtest/is` iş akışında). Kalma sebebi:
    // `scripts/pine-uc-testi.js` eski senkron yolu da sınıyor. (Pusula P4: iş parçacığı
    // lib/backtest/isci.js içe aktarılan Pine'ı da koşar — kaynak iş verisinde gider.)
    // Multi-Asset Watchlist Scanner Endpoint (USES CUSTOM WATCHLIST & FAST CANDLE CACHE)
    app.post('/api/backtest/scan-watchlist', async (req, res) => {
      try {
        const { timeframe, candlesCount, initialCapital } = req.body;
        const watchlist = ctx.config.watchlist || ["BTC/USDT", "ETH/USDT", "SOL/USDT", "AVAX/USDT", "XRP/USDT", "BNB/USDT", "LINK/USDT"];
        const tf = timeframe || '1h';
        const limit = parseInt(candlesCount) || 500;

        const fetchCandlesFn = async (sym, timeframe, limit) => {
          try {
            return await engine.exchange.fetchOHLCV(sym, timeframe, limit);
          } catch (err) {
            return [];
          }
        };

        /**
         * Strateji haritası KATALOGDAN kurulur. `config.strategies` yalnızca
         * kaydedilmiş AYARLARI taşır; içe aktarılan Pine botlarının ayar kaydı
         * kullanıcı bir şey değiştirene kadar yoktur ve tarama onları sessizce
         * atlıyordu — strateji karşılaştırma taramasındaki hatanın aynısı.
         */
        const taranacak = {};
        for (const k of strategyCatalog.keys()) {
          taranacak[k] = { ...ayarlariAl(k), marketType: ctx.config.marketType || 'spot' };
        }

        const scanResults = await Backtester.scanWatchlist(watchlist, taranacak, fetchCandlesFn, tf, limit, parseFloat(initialCapital) || 10000.0);

        db.addLog('SUCCESS', `🏆 ÖZEL İZLEME LİSTESİ TARAMASI TAMAMLANDI! En İyi 5 Portföy Fırsatı Belirlendi.`);
        res.json({ success: true, scanResults });
      } catch (err) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    /**
     * Strateji karşılaştırma taraması. Aynı ızgarada tüm stratejileri koşturup
     * tutar ağırlıklı beklenti ve brüt edge üretir.
     *
     * Tarama dakikalar sürebildiği için ilerleme WebSocket'ten yayınlanır; istek
     * diğer backtest uçlarıyla aynı desende senkron kalır.
     */
    app.post('/api/strategy-scan', async (req, res) => {
      try {
        const { strategyKeys, symbols, timeframe, candlesCount, initialCapital } = req.body || {};

        /**
         * GEÇERLİ STRATEJİ LİSTESİ KATALOGDAN GELİR, `config.strategies`TEN DEĞİL.
         *
         * `config.strategies` KAYDEDİLMİŞ AYARLARDIR; bir stratejinin var olup
         * olmadığının kaydı değildir. İçe aktarılan Pine botları katalogda vardır
         * ama kullanıcı ayarlarını değiştirene kadar config'de KAYDI YOKTUR.
         * Süzgeç config'e bakınca yeni eklenen bot sessizce eleniyordu ve panel
         * "karşılaştırılacak strateji yok" diyordu — kullanıcı kutuyu işaretlemiş
         * olmasına rağmen.
         *
         * Bu, kataloğun var oluş sebebi olan hatanın aynısı: listeyi ikinci bir
         * yerde tutmak. Ayarlar config'den okunmaya devam eder, VARLIK sorusunun
         * tek cevabı katalogdur.
         */
        const allKeys = strategyCatalog.keys();
        const keys = (Array.isArray(strategyKeys) && strategyKeys.length)
          ? strategyKeys.filter(k => strategyCatalog.has(k))
          : allKeys;

        if (!keys.length) {
          return res.status(400).json({
            success: false,
            error: Array.isArray(strategyKeys) && strategyKeys.length
              ? `Seçilen stratejiler katalogda bulunamadı: ${strategyKeys.join(', ')}`
              : 'Katalogda strateji yok'
          });
        }

        const targetSymbols = (Array.isArray(symbols) && symbols.length)
          ? symbols
          : (ctx.config.activeSymbols || ctx.config.watchlist || ['BTC/USDT']).slice(0, 4);

        // Motorla aynı enjeksiyon: strateji piyasa tipini config'inden okur.
        const selected = {};
        keys.forEach(k => {
          // Ayar YOKSA boş nesne: strateji kendi varsayılanlarını kullanır.
          // (Yeni içe aktarılan botların config kaydı henüz olmayabilir.)
          const kayitli = (ctx.config.strategies && ctx.config.strategies[k]) || {};
          selected[k] = { ...kayitli, marketType: ctx.config.marketType || 'spot' };
        });

        const tf = timeframe || '1h';
        const limit = parseInt(candlesCount) || 5000;

        db.addLog('INFO', `🔬 STRATEJİ TARAMASI BAŞLADI: ${keys.length} strateji × ${targetSymbols.length} varlık (${tf}, ${limit} mum)`);

        const scan = await runStrategyScan({
          strategies: selected,
          symbols: targetSymbols,
          timeframe: tf,
          candlesCount: limit,
          initialCapital: parseFloat(initialCapital) || 10000.0,
          fetchCandles: async (sym, timeframe2, limit2) => {
            try {
              return await engine.exchange.fetchOHLCV(sym, timeframe2, limit2);
            } catch (err) {
              db.addLog('WARN', `[${sym}] Tarama için mum alınamadı: ${err.message}`);
              return [];
            }
          },
          onProgress: (p) => broadcast('STRATEGY_SCAN_PROGRESS', p)
        });

        const s = scan.summary;
        db.addLog('SUCCESS', `🔬 TARAMA TAMAMLANDI: ${s.tested} strateji, ${s.totalTrades} işlem. Beklentisi pozitif: ${s.profitable}, brüt edge'i olan: ${s.withGrossEdge}.`);
        broadcast('STRATEGY_SCAN_DONE', { summary: s });

        res.json({ success: true, scan });
      } catch (err) {
        db.addLog('ERROR', `Strateji taraması başarısız: ${err.message}`);
        res.status(400).json({ success: false, error: err.message });
      }
    });
  }

  return { gostergeUclari, backtestUclari, isUclari, mumGetir };
}

module.exports = { olustur };
