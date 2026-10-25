/**
 * C1 (75.1, TASARIM-MAKINE-HESAP-BOT §3 parça 3) — server.js'ten taşındı, davranış AYNI. BORSA (eski canlı yürütücü) + B KALKAN, iki grup:
 *   yurutuculer()  CANLI BORSA KATMANI (lib/live/yurutucu, paper motordan AYRI; Borsa sekmesinin elle bağlanan yürütücüsü `canli`) +
 *                  DonchianBot + B KALKAN (yalnız kâğıt borsa, kendi yürütücüsü, `kalkanBagla`); açılışta "çalışıyor" işaretli
 *                  Donchian / Kalkan başlatılır (araştırma modunda ve taşıma sonrası mutabakat beklenirken başlamaz)
 *                  → { CanliYurutucu, KagitBorsa, CANLI_DIZIN, canli, donchianBot, kalkanYurutucu, kalkanBot, kalkanBagla, kalkanKagitMi }
 *                  (server.js bunu ctx.borsa olarak verir — bot yönetimi ve bot uçları aynı nesneleri kullanır)
 *   uclar()        /api/exchange/* (status, connect, disconnect, arm, reconcile, account, preview, order, cancel, kill, bot),
 *                  /api/kalkan/* (durum, baslat, durdur, kuru, calistir, mutabakat, acil)
 * `borsaHata` modül düzeyinde (saf) — bindirme uçları da kullanır (lib/sunucu/botUclari.js).
 *
 * Bağlanma: server.js `BORSA_UCLARI = require('./lib/sunucu/borsaUclari').olustur(ctx)` + `yurutuculer()` eski yerinde (bildirim merkezi
 * ve broadcast'ten sonra, bot yönetiminden önce); `uclar()` eski yerinde (gösterge uçlarından sonra, bindirme uçlarından önce) — Express uç
 * sırası ve yükleme sırası (lib/live/yurutucu → donchianBot → kalkanBot → kagitBorsa) birebir aynı. ctx alanları KULLANIM ANINDA okunur
 * (lib/sunucu/baglam.js): `config` → ctx.config.
 */
'use strict';
const path = require('path');
const yollar = require('../yollar');
const db = require('../database');
const tasimaLib = require('../tasima');

/** Borsa / kalkan / bindirme uçlarının ortak hata yanıtı (server.js'teki ad ve davranış). */
const borsaHata = (res, err, kod = 400) => res.status(kod).json({ success: false, error: err.message || String(err) });

function olustur(ctx) {
  let Y = null;   // yurutuculer() sonucu — uclar() aynı nesneleri kullanır

  function yurutuculer() {
    const { ARASTIRMA_MODU } = ctx;
    /**
     * CANLI BORSA KATMANI (lib/live/) — paper motordan AYRI.
     * Bağlantı her zaman panelden elle kurulur; sunucu açılışta kendiliğinden
     * canlıya bağlanmaz. Canlı emir kilidi bellekte durur, yeniden başlatmada kapanır.
     */
    const { CanliYurutucu } = require('../live/yurutucu');
    const { DonchianBot } = require('../live/donchianBot');
    const CANLI_DIZIN = yollar.veri('live');
    const canliAyar = () => ({ maxEmirNominal: 200, maxPozisyonNominal: 500, sermayeTavani: 200, symbol: 'BTC/USDT:USDT', ...(ctx.config.canli || {}) });
    const canli = new CanliYurutucu({
      dizin: CANLI_DIZIN,
      maxEmirNominal: canliAyar().maxEmirNominal,
      maxPozisyonNominal: canliAyar().maxPozisyonNominal,
      kaydet: (seviye, metin) => db.addLog(seviye, `[BORSA] ${metin}`)
    });
    const donchianBot = new DonchianBot(canli, {
      dizin: CANLI_DIZIN, symbol: canliAyar().symbol, semboller: canliAyar().semboller, sermayeTavani: canliAyar().sermayeTavani,
      kaydet: (seviye, metin) => db.addLog(seviye, `[DONCHIAN] ${metin}`)
    });
    if (donchianBot.durum.calisiyor && !ARASTIRMA_MODU && !tasimaLib.botBekliyor('donchian')) donchianBot.baslat();   // 68.1: taşıma sonrası mutabakat bekler   // bağlantı kurulana kadar boşta bekler

    /**
     * B KALKAN (lib/live/kalkanBot.js) — YALNIZ KÂĞIT BORSA. Kendi yürütücüsü,
     * kendi defteri (data/live/kalkan/). Piyasa verisi Binance USDⓈ-M'den
     * ANAHTARSIZ okunur; emirler `KagitBorsa`da yaşar, borsaya hiçbir emir gitmez.
     * Testnet/canlıya bağlama yolu bilerek yok (PLAN-ADAYLAR: anahtar en son).
     */
    const { KalkanBot } = require('../live/kalkanBot');
    const { KagitBorsa } = require('../live/kagitBorsa');
    const KALKAN_DIZIN = path.join(CANLI_DIZIN, 'kalkan');
    const kalkanAyar = () => ({ sermayeTavani: 10000, kagitBakiye: 10000, k: 15, ...(ctx.config.kalkan || {}) });
    const kalkanYurutucu = new CanliYurutucu({
      dizin: KALKAN_DIZIN,
      maxEmirNominal: kalkanAyar().sermayeTavani,
      maxPozisyonNominal: kalkanAyar().sermayeTavani,
      kaydet: (seviye, metin) => db.addLog(seviye, `[KALKAN-BORSA] ${metin}`)
    });
    const kalkanBot = new KalkanBot(kalkanYurutucu, {
      dizin: KALKAN_DIZIN, sermayeTavani: kalkanAyar().sermayeTavani, evren: { k: kalkanAyar().k },
      kaydet: (seviye, metin) => db.addLog(seviye, `[KALKAN] ${metin}`)
    });
    /** Kâğıt borsaya bağlanır (bir kez) ve kalkan mutabakatını koşar. */
    async function kalkanBagla() {
      if (kalkanYurutucu.borsa) return kalkanYurutucu.ozet();
      const ccxt = require('ccxt');
      const veri = new ccxt.binanceusdm({ enableRateLimit: true });     // anahtarsız: yalnız piyasa verisi
      const borsa = new KagitBorsa({ veri, bakiye: kalkanAyar().kagitBakiye, dosya: path.join(KALKAN_DIZIN, 'kagit-borsa.json'), model: 'kotumser' });   // 69.5: yalnız yeni dosyada etkin
      const ozet = await kalkanYurutucu.baglanKagit(borsa);
      await kalkanBot.mutabakat();
      return ozet;
    }
    const kalkanKagitMi = () => { if (kalkanYurutucu.borsa && kalkanYurutucu.ortam !== 'kagit') throw new Error('kalkan yalnız kâğıt borsada çalışır'); };
    if (kalkanBot.durum.calisiyor && !ARASTIRMA_MODU && !tasimaLib.botBekliyor('kalkan')) {
      kalkanBagla().then(() => kalkanBot.baslat())
        .catch(e => db.addLog('ERROR', `[KALKAN] açılışta kâğıt borsaya bağlanılamadı: ${e.message}`));
    }
    Y = { CanliYurutucu, KagitBorsa, CANLI_DIZIN, canli, donchianBot, kalkanYurutucu, kalkanBot, kalkanBagla, kalkanKagitMi };
    return Y;
  }

  function uclar() {
    const { app, broadcast, BINDIRME_ADLAR, bindirmeler, botHesapId, borsaModu } = ctx;
    const { canli, donchianBot, kalkanYurutucu, kalkanBot, kalkanBagla, kalkanKagitMi } = Y;
    // ── BORSA (canlı / testnet) ────────────────────────────────────────────────
    // (borsaHata modül düzeyinde — yukarıda)

    app.get('/api/exchange/status', (req, res) => {
      res.json({ success: true, exchangeMode: borsaModu(), yurutucu: canli.ozet(), bot: donchianBot.ozet(),
        anahtarlar: { live: !!(ctx.config.apiKey && ctx.config.apiSecret), testnet: !!(ctx.config.testnetApiKey && ctx.config.testnetApiSecret) },
        canliIzin: ctx.config.canliIzin === true });
    });

    /**
     * GERÇEK PARA KAPALI (karar Ö16, denetim A-01): canlı (live) bağlantı yalnız config.json'da `canliIzin: true` iken
     * kurulur — PLAN-GERCEK-PARA-2027 G1–G9 sağlanmadan ve kullanıcı bu bayrağı bilinçli açmadan tek tıkla gerçek paraya
     * bağlanılmasın. Bilinmeyen ortam adı da reddedilir (önceden "testnet" dışındaki her değer canlı anahtarı kullanıyordu).
     */
    app.post('/api/exchange/connect', async (req, res) => {
      const { ortam, onay } = req.body || {};
      try {
        if (ortam !== 'testnet' && ortam !== 'live') throw new Error('ortam "testnet" (demo hesap) ya da "live" olmalı');
        if (ortam === 'live' && ctx.config.canliIzin !== true) {
          return res.status(403).json({ success: false, error: 'Gerçek para modu bilinçli olarak kapalı (PLAN-GERCEK-PARA-2027: G1–G9 şartları sağlanınca açılır).' });
        }
        if (ortam === 'live' && onay !== 'CANLI') throw new Error('canlı bağlantı için onay metni "CANLI" gerekli');
        // 62.1: portföy botu gerçek paradayken aynı hesaba ikinci yürütücü bağlanmaz; demo hesapta da aynısı (D6).
        // 74.5: yalnız AYNI hesabı (sabit Binance demo / canlı anahtarı) kullanan bot sayılır — başka demo hesaba bağlı yeni bot çakışmaz.
        const ayniHesap = BINDIRME_ADLAR.map(ad => bindirmeler[ad]).find(b => b && botHesapId(b) === (ortam === 'live' ? 'binance-canli' : 'binance-demo') && ((ortam === 'live' && b.mod === 'canli') || (ortam === 'testnet' && b.mod === 'demo' && b.bot.durum.calisiyor)));
        if (ayniHesap) throw new Error(`${ayniHesap.bot.adGorunen} bu hesapta (${ortam === 'live' ? 'gerçek para' : 'demo'}) çalışıyor — aynı hesaba ikinci bağlantı açılmaz`);
        const anahtar = ortam === 'testnet'
          ? { apiKey: ctx.config.testnetApiKey, apiSecret: ctx.config.testnetApiSecret }
          : { apiKey: ctx.config.apiKey, apiSecret: ctx.config.apiSecret };
        const ozet = await canli.baglan({ ortam, ...anahtar });
        broadcast('EXCHANGE', ozet);
        res.json({ success: true, yurutucu: ozet });
      } catch (err) { borsaHata(res, err); }
    });

    app.post('/api/exchange/disconnect', (req, res) => {
      canli.baglantiyiKes();
      broadcast('EXCHANGE', canli.ozet());
      res.json({ success: true });
    });

    app.post('/api/exchange/arm', (req, res) => {
      try {
        if (req.body && req.body.kapat) canli.kilitKapat(); else canli.kilitAc(req.body && req.body.onay);
        broadcast('EXCHANGE', canli.ozet());
        res.json({ success: true, yurutucu: canli.ozet() });
      } catch (err) { borsaHata(res, err); }
    });

    app.post('/api/exchange/reconcile', async (req, res) => {
      try { const m = await canli.mutabakat(); if (m && !m.hata && !(m.cozulemeyen || []).length) tasimaLib.mutabakatTemiz('donchian'); res.json({ success: true, mutabakat: m, yurutucu: canli.ozet() }); }
      catch (err) { borsaHata(res, err); }
    });

    app.get('/api/exchange/account', async (req, res) => {
      try { res.json({ success: true, hesap: await canli.hesap() }); } catch (err) { borsaHata(res, err); }
    });

    /** Panelden gelen emir gövdesini sıkı biçimde okur — fazladan alan taşınmaz. */
    function emirGovdesi(b = {}) {
      const e = {
        symbol: String(b.symbol || ''), side: b.side, type: b.type,
        amount: Number(b.amount), reduceOnly: b.reduceOnly === true, bot: 'pnl'
      };
      if (b.type === 'limit') e.price = Number(b.price);
      if (!canli.borsa || !canli.borsa.markets[e.symbol]) throw new Error(`sembol bilinmiyor: ${e.symbol}`);
      return e;
    }

    app.post('/api/exchange/preview', async (req, res) => {
      try { res.json({ success: true, onizleme: await canli.onizle(emirGovdesi(req.body)) }); }
      catch (err) { borsaHata(res, err); }
    });

    app.post('/api/exchange/order', async (req, res) => {
      try {
        const r = await canli.emirGonder(emirGovdesi(req.body));
        broadcast('EXCHANGE', canli.ozet());
        res.status(r.basarili ? 200 : 400).json({ success: r.basarili, error: r.sebep || null, sonuc: r });
      } catch (err) { borsaHata(res, err); }
    });

    app.post('/api/exchange/cancel', async (req, res) => {
      try { const k = await canli.iptal(String((req.body || {}).clientOrderId || '')); res.json({ success: true, emir: k }); }
      catch (err) { borsaHata(res, err); }
    });

    app.post('/api/exchange/kill', async (req, res) => {
      try {
        donchianBot.durdur();
        const rapor = await canli.acilDurdur('panel');
        broadcast('EXCHANGE', canli.ozet());
        res.json({ success: true, rapor });
      } catch (err) { borsaHata(res, err, 500); }
    });

    app.post('/api/exchange/bot', async (req, res) => {
      const { eylem } = req.body || {};
      try {
        // Denetim D6 (62.1): Borsa sekmesinin Donchian botu, aynı hesabı kullanan portföy botuyla birlikte çalışamaz (ters yön
        // bindirmeDemoCakisma'da vardı): demo hesapta Hücum demo'dayken, gerçek hesapta Hücum gerçek paradayken başlatma/çalıştırma reddedilir.
        if (eylem === 'baslat' || eylem === 'simdi') {
          const ayni = BINDIRME_ADLAR.map(ad => bindirmeler[ad]).find(b => b && botHesapId(b) === (canli.ortam === 'live' ? 'binance-canli' : 'binance-demo') && ((canli.ortam === 'testnet' && b.mod === 'demo') || (canli.ortam === 'live' && b.mod === 'canli')));   // 74.5: hesap bazında
          if (ayni) throw new Error(`${ayni.bot.adGorunen} aynı hesapta (${ayni.mod === 'demo' ? 'demo' : 'gerçek'}) çalışıyor — iki bot aynı hesapta mutabakatı bozar`);
        }
        if (eylem === 'baslat') donchianBot.baslat();
        else if (eylem === 'durdur') donchianBot.durdur();
        else if (eylem === 'kuru') return res.json({ success: true, rapor: await donchianBot.calistir({ kuru: true }) });
        else if (eylem === 'simdi') return res.json({ success: true, rapor: await donchianBot.calistir({ kuru: false }) });
        else throw new Error('eylem: baslat | durdur | kuru | simdi');
        res.json({ success: true, bot: donchianBot.ozet() });
      } catch (err) { borsaHata(res, err); }
    });

    // ── B KALKAN (yalnız kâğıt borsa) ──────────────────────────────────────────
    app.get('/api/kalkan/durum', async (req, res) => {
      try {
        const hesap = kalkanYurutucu.borsa ? await kalkanYurutucu.hesap().catch(e => ({ hata: e.message })) : null;
        res.json({ success: true, kalkan: kalkanBot.ozet(), yurutucu: kalkanYurutucu.borsa ? kalkanYurutucu.ozet() : { durum: 'BAGLI_DEGIL' }, hesap });
      } catch (err) { borsaHata(res, err); }
    });

    app.post('/api/kalkan/baslat', async (req, res) => {
      try {
        await kalkanBagla(); kalkanKagitMi();
        kalkanBot.baslat();
        res.json({ success: true, kalkan: kalkanBot.ozet() });
      } catch (err) { borsaHata(res, err); }
    });

    app.post('/api/kalkan/durdur', (req, res) => {
      kalkanBot.durdur();
      res.json({ success: true, kalkan: kalkanBot.ozet() });
    });

    /** Kuru çalıştırma: hesap + plan, emir YOK, durum yazılmaz. */
    app.post('/api/kalkan/kuru', async (req, res) => {
      try { await kalkanBagla(); kalkanKagitMi(); res.json({ success: true, rapor: await kalkanBot.calistir({ kuru: true }) }); }
      catch (err) { borsaHata(res, err); }
    });

    /** Günlük çalışmayı şimdi koş — kâğıt borsada (gerçek emir yok). */
    app.post('/api/kalkan/calistir', async (req, res) => {
      try { await kalkanBagla(); kalkanKagitMi(); res.json({ success: true, rapor: await kalkanBot.calistir({ kuru: false }) }); }
      catch (err) { borsaHata(res, err); }
    });

    app.post('/api/kalkan/mutabakat', async (req, res) => {
      try { await kalkanBagla(); await kalkanYurutucu.mutabakat(); const m = await kalkanBot.mutabakat(); if (m && !m.engel) tasimaLib.mutabakatTemiz('kalkan'); res.json({ success: true, mutabakat: m, kalkan: kalkanBot.ozet() }); }
      catch (err) { borsaHata(res, err); }
    });

    app.post('/api/kalkan/acil', async (req, res) => {
      try { await kalkanBagla(); kalkanKagitMi(); res.json({ success: true, rapor: await kalkanBot.acilDurdur('panel'), kalkan: kalkanBot.ozet() }); }
      catch (err) { borsaHata(res, err, 500); }
    });
  }

  return { yurutuculer, uclar };
}

module.exports = { olustur, borsaHata };
