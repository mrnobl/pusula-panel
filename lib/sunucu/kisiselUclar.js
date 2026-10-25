/**
 * C1 (75.0, TASARIM-MAKINE-HESAP-BOT §3 parça 2) — server.js'ten taşındı, davranış AYNI. KİŞİSEL VERİ ve ARAŞTIRMA ALTYAPISI
 * yönlendiricileri ve bağlamaları, üç grup:
 *   laboratuvarUclari()  portföy laboratuvarı (lib/portfoy/api), VERİ ORKESTRATÖRÜ (lib/veri/orkestrator — zamanlayıcı), coin tarama +
 *                        liste kaydı (lib/tarama), ileriye kayıt (lib/ileriKayit), piyasa bağlamı (lib/piyasaBaglami), 74.1 yapay zekâ
 *                        notları (lib/yapayZeka), araştırma defteri (lib/defter), günlükler (lib/gunluk)  → { veriOrk, piyasaBaglami, yapayZeka }
 *   portfoyUclari()      PORTFÖYÜM (lib/portfoyum + saatlik anlık görüntü), İŞLEM DEFTERİ (lib/islemDefteri), 73.0 AYARLAR › ANAHTARLAR
 *                        (lib/anahtarlar; yönlendiriciyi server.js anahtarYonlendirici'ye bağlar)  → { portfoyum, islemDefteri, anahtarlar }
 *   tasarimciUclari()    işlem defteri saatlik eşitlemesi, PORTFÖY TASARIMCISI (lib/tasarimci — zamanlayıcı + yönlendirici),
 *                        74.2 AYAR GEÇMİŞİ uçları (GET /api/ayar-gecmisi, POST /api/ayar-gecmisi/geri-al)
 * Gruplar server.js'te ESKİ YERLERİNDE çağrılır (aralarında bildirim uçları ve üreticileri — lib/sunucu/bildirimKurulum.js) — Express
 * uç sırası ve zamanlayıcıların kurulma sırası birebir aynı. Modül yüklemeleri (require) eski yerlerinde, aynı sırayla.
 * ctx alanları KULLANIM ANINDA okunur (lib/sunucu/baglam.js): `config` → ctx.config, bot kaydı → ctx.BOT_KAYIT, sırların durumu → ctx.ayar.
 */
'use strict';
const fs = require('fs');
const yollar = require('../yollar');
const db = require('../database');
const guvenlikKur = require('../guvenlik');
const ayarlarLib = require('../ayarlar');

function olustur(ctx) {
  const ayar = ctx.ayar;

  function laboratuvarUclari() {
    const { app, isler, portfoyBildirici, ileriIs, ozDenetim, APP_VERSION, ARASTIRMA_MODU, TELEGRAM_GELISTIRME_ENGELI, BILDIRIM, engine, GUNLUK } = ctx;
    const { loadSecrets } = ayar;
    /**
     * PORTFÖY LABORATUVARI (lib/portfoy/api.js, 2026-10-07): katalog, seri, simülasyon / varyasyon (iş parçacığında, aynı iş
     * kuyruğu), uygulama planı, karar günlüğü, kayıtlı portföyler. Araştırma modunda da açık (ARASTIRMA_KAPALI'ya takılmaz).
     * Veri güncellemesi artık VERİ ORKESTRATÖRÜNDE (aşağıda).
     */
    const portfoyLab = require('../portfoy/api');
    app.use(portfoyLab.router({ isler, log: (lv, msg) => db.addLog(lv, msg) }));

    /**
     * VERİ ORKESTRATÖRÜ (lib/veri/orkestrator.js, 2026-10-07): tüm veri kaynakları tek kayıt defterinde (Binance günlük +
     * PIT arşivi + TradFi listesi, Yahoo, TEFAS, EVDS, TÜFE, USD/TRY, kol önbelleği, portföy kataloğu). Açılıştan ~2 dk sonra
     * bayat olanlar, her gece 04:30 sonrası (eski portföy zamanlayıcısının YERİNE — tek zamanlayıcı), simülasyon / backtest
     * bayat seriye dokununca arka planda (talep), panelden ya da `npm run veri:guncelle` ile elle. Canlı botun kendi borsa
     * okumalarına dokunmaz. Uçlar GET /api/veri/durum, POST /api/veri/guncelle (araştırma modunda da açık).
     * VERI_ORKESTRATOR=0 (ya da eski PORTFOY_GUNCELLEME=0) zamanlayıcıyı ve talep tetiğini kapatır.
     */
    const veriOrkestrator = require('../veri/orkestrator');
    const veriOrk = veriOrkestrator.varsayilan({ log: (lv, msg) => db.addLog(lv, msg) });
    // O10 (62.0): gece veri güncellemesi günde 3 kez başarısızsa Telegram uyarısı.
    veriOrk.alarm = (baslik, satirlar) => portfoyBildirici.gonder('uyari', baslik, satirlar, { anahtar: 'veri-gece', kisitMs: 20 * 3600e3 });
    veriOrkestrator.hariciBagla('ileri-bollinger', () => ({ calisiyor: ileriIs.calisiyor, sonHata: ileriIs.sonHata }));
    app.use(veriOrk.router());
    veriOrk.zamanlayiciBaslat();

    /**
     * COIN TARAMA + LİSTE KAYDI (lib/tarama, sürüm 60.3): ileriye dönük günlük zincir üstü tarama (GoPlus / RugCheck /
     * DexScreener / RDAP / borsa fiyatı → data/tarama, yalnız eklenir) ve arkadaşın coin listelerinin SHA-256 zincirli
     * kaydı (data/tarama/listeler.jsonl + kayitlar/listeler/ dışa aktarımı). ALIM/SATIM YAPMAZ; lib/live ve lib/risk'e
     * dokunmaz. Panel açılınca (POST /api/tarama/otomatik) ve 10 dk'lık zamanlayıcıyla son başarılı tarama `otomatikSaat`ten
     * (varsayılan 20 sa) eskiyse arka planda koşar; aynı anda iki koşu yok (dosya kilidi). Telegram yalnız tarama
     * ayarlarından açılırsa (varsayılan kapalı), Bildirici'nin tekrar kısıtıyla. Binance istekleri orkestratörün kota
     * sayacından ve ortak 418/429 beklemesinden geçer. Uçlar araştırma modunda da açık (bot/borsa/emir değil). TARAMA=0
     * zamanlayıcıyı kapatır.
     */
    const taramaSistemi = require('../tarama').kur({
      log: (lv, msg) => db.addLog(lv, msg),
      bildirici: portfoyBildirici,
      kota: () => new veriOrkestrator.BinanceKota({ bekleme: veriOrk.binanceBeklemeErisimi('coin tarama') }),
    });
    app.use(taramaSistemi.router());
    veriOrkestrator.hariciBagla('coin-tarama', () => taramaSistemi.hariciDurum());
    try { taramaSistemi.zincirTazele(); } catch (e) { db.addLog('WARN', `📋 Liste kayıt zinciri okunamadı: ${e.message}`); }
    taramaSistemi.zamanlayiciBaslat();
    // İLERİYE KAYIT (73.3, lib/ileriKayit): ham piyasa verisi kayıtçıları — karar/emir yok; araştırma kopyasında çalışmaz. GET /api/ileri-kayit/durum.
    require('../ileriKayit').kur({ app, log: (lv, msg) => db.addLog(lv, msg), ozDenetim, binanceBekleme: veriOrk.binanceBeklemeErisimi('ileriye kayıt') });
    // PİYASA BAĞLAMI (73.9, lib/piyasaBaglami): olay takvimi, protokol kartı, makro pano, WinC panosu (opsiyon, pozisyonlanma, akış, duygu) —
    // YALNIZ BİLGİ, hiçbir gösterge bot kararına girmez; toplayıcı yalnız sunucuda, karar penceresinde ağ yok. GET /api/piyasa-baglami(/hafta).
    const piyasaBaglami = require('../piyasaBaglami').kur({ app, log: (lv, msg) => db.addLog(lv, msg), binanceBekleme: veriOrk.binanceBeklemeErisimi('piyasa bağlamı'), mumDeposu: db.candleStore, surum: APP_VERSION });
    // YAPAY ZEKÂ NOTLARI (74.1, lib/yapayZeka — C3 / PLAN-DIKKAT-LISTESI §F3): günde bir kez (~07:00) Google Gemini ÜCRETSİZ katmanıyla kamuya açık
    // haber / KAP / SEC metinlerini okur; şema kısıtlı JSON + birebir alıntı doğrulayıcı + kanarya. Model hiçbir şeye yazamaz; liste / kural / bot
    // DEĞİŞMEZ — yalnız not + "incele" bayrağı (Telegram türü "yapayzeka", günde en çok 1). Anahtar: secrets.json gemini.apiKey (Ayarlar › Anahtarlar);
    // yoksa ağ isteği yok. Zamanlayıcı yalnız sunucuda (araştırma kopyası ve geliştirme bilgisayarı sayfayı sunucudan okur — lib/evOkuma). YAPAY_ZEKA=0 kapatır.
    const yapayZeka = require('../yapayZeka').olustur({
      // YAPAY_ZEKA_ORNEK=1 yalnız kılavuz görüntüsü (scripts/kilavuz-ekran.js, araştırma kipinde): örnek klasör gösterilir, okuma YOK (zamanlayıcı kurulmaz).
      dizin: process.env.YAPAY_ZEKA_DIZIN || yollar.veri('yapay-zeka'), arastirma: (ARASTIRMA_MODU || !!TELEGRAM_GELISTIRME_ENGELI) && !(ARASTIRMA_MODU && process.env.YAPAY_ZEKA_ORNEK === '1'), surum: APP_VERSION, log: (lv, msg) => db.addLog(lv, msg),
      anahtarFn: () => { if (ARASTIRMA_MODU && process.env.YAPAY_ZEKA_ORNEK === '1') return 'ornek-anahtar'; if (ayar.SIRLAR_KILITLI) return null; try { return ((loadSecrets() || {}).gemini || {}).apiKey || null; } catch (e) { return null; } },
      merkez: BILDIRIM,
      gonder: (tur, parcalar, degiskenler) => engine.telegram.sendMessageDetailed(require('../bildirimMetinleri').varsayilanKur({ zaman: require('../bildirimMetinleri').kisaZaman(), ...parcalar }), { tur, parcalar, degiskenler }),
    });
    app.use(yapayZeka.router());
    if (!ARASTIRMA_MODU && !TELEGRAM_GELISTIRME_ENGELI && process.env.YAPAY_ZEKA !== '0') yapayZeka.baslat();

    /**
     * ARAŞTIRMA DEFTERİ (lib/defter.js, sürüm 60.6, PLAN-DIKKAT-LISTESI §5 Ş1): deneme sayacının kanonik kaydı
     * `kayitlar/denemeler.jsonl` (DEFTER_DOSYA ile değişir). GET /api/defter = kayıtlar + özet + denetim hataları;
     * POST /api/defter YALNIZ yeni kayıt ekler (çakışma/boşluk reddi, geçici dosya + rename). Düzeltme/silme ucu yok.
     * Sunucu git çalıştırmaz. Telefon kademesinde POST lib/guvenlik.js'te 403 (beyaz listede değil). Araştırma modunda açık.
     */
    app.use(require('../defter').router({ log: (lv, msg) => db.addLog(lv, msg) }));

    /*
     * GÜNLÜKLER (lib/gunluk.js, PLAN-PANEL-2): db.addLog'a düşen her satır ayrıca data/gunluk/<gün>.jsonl'e tek biçimle yazılır
     * (zaman · seviye · kaynak · bot · mesaj; 30 gün). GET /api/gunluk (süz + son 24 s özeti), GET /api/gunluk.csv. Salt okuma.
     */
    app.use(require('../gunluk').router(GUNLUK));

    return { veriOrk, piyasaBaglami, yapayZeka };
  }

  function portfoyUclari() {
    const { app, kok, ARASTIRMA_MODU, EV_BAGLANTI_ETKIN, evOkuma, evYazma, acilPin, BINDIRME_ADLAR, bindirmeler, botHesapId, yeniBotMu, sirlariUygula,
      engine, broadcast, disariConfig, saglikSunucu, saglikBotlar } = ctx;
    const { loadSecrets, saveSecrets } = ayar;
    /**
     * PORTFÖYÜM (lib/portfoyum, sürüm 60.8, PLAN-PORTFOYUM §0): gerçek portföyün ELLE kaydı — kurum/hesap/varlık, açılış
     * bakiyesi, işlem defteri (yalnız eklenir; iptal = ters kayıt), değerleme (kendi para biriminde maliyet/K-Z; toplam USD ve
     * TL), TWR getiri, hedef dağılım, kur çevirici. Veri data/portfoyum/ (git dışı). Harcama'ya dokunmaz, borsa bakiyesi
     * okumaz, emir vermez. GET'ler telefonda da açık; POST/PUT telefon kademesinde lib/guvenlik.js 403 (beyaz listede değil).
     * Günlük anlık görüntü: panel açılınca (GET /api/portfoyum/ozet) + saatlik zamanlayıcı (PORTFOYUM_ANLIK=0 kapatır).
     */
    const portfoyum = require('../portfoyum/api').kur({ log: (lv, msg) => db.addLog(lv, msg) });
    app.use(portfoyum.router);
    if (process.env.PORTFOYUM_ANLIK !== '0') setInterval(() => { try { portfoyum.anlikTazele(); } catch (e) { db.addLog('WARN', `Portföyüm anlık görüntü: ${e.message}`); } }, 60 * 60 * 1000).unref();

    /**
     * İŞLEM DEFTERİ (lib/islemDefteri, 64.7): kullanıcının KENDİ kripto/FX işlemleri (OKX, Binance geçmişi, MetaTrader 4/5) —
     * Portföy › İşlem defterim. Botlardan ve Portföyüm'den ayrı. Veri data/islem-defteri/ (git dışı, yalnız eklenir). GET'ler
     * telefonda da açık (ve geliştirme bilgisayarında lib/evOkuma.js ile sunucudan okunur); POST'lar telefonda 403 (lib/guvenlik.js),
     * araştırma modunda 403 (kayıtlar evde). OKX salt okuma anahtarı data/secrets.json `islemDefteri.okx` altında — panele/yanıta
     * hiç dönmez; trade/withdraw izinli anahtar reddedilir. Günlük OKX eşitlemesi yalnız sunucuda (araştırma modunda kapalı;
     * ISLEM_DEFTERI_ESITLE=0 kapatır). Emir yok, Telegram yok (K6).
     * 65.0: Binance salt okuma eşitlemesi (lib/islemDefteri/binanceApi.js) aynı yolla — anahtar `islemDefteri.binance` altında (bot anahtarlarından
     * AYRI; apiRestrictions'ta yalnız okuma açık değilse reddedilir), aynı saatlik zamanlayıcı (gunlukEsitle: OKX + Binance; spot tam tarama
     * bitene kadar her saat kaldığı yerden).
     * 64.8: geliştirme bilgisayarında (sunucu bağlantısı + yazma jetonu) yazmalar sunucuya iletilir/kuyruğa girer (lib/evYazma.js, yukarıda);
     * OKX anahtarı o bilgisayarın kendi secrets.json'unda, "Şimdi eşitle" yalnız elle (otomatik günlük eşitleme yalnız evde).
     */
    const islemDefteri = require('../islemDefteri/api').kur({
      log: (lv, msg) => db.addLog(lv, msg), arastirma: ARASTIRMA_MODU, mumDeposu: db.candleStore,
      kurSerileri: () => require('../portfoyum/fiyat').kurSerileri(require('../portfoyum/depo').jsonOku('kurlar.json')),
      sirlar: { oku: () => loadSecrets().islemDefteri || {}, yaz: (ns) => { const g = loadSecrets(); g.islemDefteri = ns; saveSecrets(g); } },
      // 64.8: geliştirme bilgisayarında OKX anahtarı burada; hesaplar sunucudaki listeden, eşitleme sonucu sunucuya (ya da kuyruğa)
      ev: EV_BAGLANTI_ETKIN ? {
        kurulu: () => !!evOkuma.ayar(),
        hesap: async (id) => { const r = await evOkuma.jsonGetir('/api/islem-defteri/ozet'); return (r && r.govde && Array.isArray(r.govde.hesaplar) && r.govde.hesaplar.find(h => h.id === id)) || null; },
        gonder: (yol, govde) => evYazma.yaz('POST', yol, govde)
      } : null
    });
    app.use(islemDefteri.router);

    /**
     * 73.0 AYARLAR › ANAHTARLAR (lib/anahtarlar.js, Faz 1 "makine × hesap × bot"): kayıtlı bütün sırlar maskeli tek tabloda; ekle / değiştir /
     * sil ACİL PIN + onay; salt okuma sınama (lib/anahtarSinama.js, emir yok); araştırma kopyasında sunucudaki liste + iletme + GİZLİ bekleyen
     * dosyası; eski şifreli sır dosyasını silmeden kenara alma; acil PIN değiştirme. Botların çalışma şekli değişmez: sabit Binance satırları
     * eski alanlara yazar (sirlariUygula = /api/secrets), İşlem defterim anahtarları islemDefteri.anahtarIslemleri ile.
     */
    const anahtarlar = require('../anahtarlar').olustur({
      arastirma: ARASTIRMA_MODU,
      sir: { oku: loadSecrets, yaz: saveSecrets, kilit: () => ayar.SIRLAR_KILITLI },
      acilPin, veri: (ad) => yollar.veri(ad), log: (lv, msg) => db.addLog(lv, msg),
      bilgi: () => ({
        // 74.5: hesapId (şu an kullandığı Anahtarlar hesabı) + hesap (yeni botun bağları) — Anahtarlar 'kullanan' sütunu hesap bazında
        botlar: BINDIRME_ADLAR.map(ad => ({ kimlik: ad, ad: require('../botAdlari').ad(ad) || ad, mod: bindirmeler[ad] ? bindirmeler[ad].mod : null,
          hesapId: botHesapId(bindirmeler[ad]), hesap: yeniBotMu(ad) && ctx.BOT_KAYIT && ctx.BOT_KAYIT.kayit(ad) ? { ...ctx.BOT_KAYIT.kayit(ad).hesap } : null })),
        telegramAcik: !!(ctx.config.telegram && ctx.config.telegram.enabled), panelJetonuEnv: (process.env.PANEL_TOKEN || '').length >= 24,
        gelistirmeJetonu: fs.existsSync(guvenlikKur.gelistirmeJetonYolu(kok))
      }),
      sirlariUygula,
      telegramUygula: (jeton) => {
        if (ayar.SIRLAR_KILITLI) return { durum: 409, govde: { success: false, kilitli: true, error: `Sırlar yazılmadı: ${ayar.SIRLAR_KILITLI}` } };
        const gizli = loadSecrets();
        const tg = { ...(gizli.telegram || {}) };
        if (jeton) tg.botToken = jeton; else delete tg.botToken;
        if (Object.keys(tg).length) gizli.telegram = tg; else delete gizli.telegram;
        try { saveSecrets(gizli); } catch (e) { return { durum: 409, govde: { success: false, error: e.message } }; }
        ctx.config.telegram = { ...(ctx.config.telegram || {}), botToken: jeton || '' };
        engine.updateConfig(ctx.config);
        broadcast('CONFIG_UPDATED', disariConfig());
        return { durum: 200, govde: { success: true } };
      },
      defter: islemDefteri.anahtarIslemleri,
      sina: {
        borsa: (h) => require('../anahtarSinama').borsaSina(h),
        defter: (borsa, a) => require('../anahtarSinama').defterSina(borsa, a),
        telegram: (t) => require('../anahtarSinama').telegramSina(t),
        gemini: (t) => require('../yapayZeka/gemini').olustur({ aralikMs: 0 }).sina(t),   // 74.1: models.list — salt okuma, kota harcamaz
        saglik: async (alt) => { const s = alt === 'sunucu' ? saglikSunucu : saglikBotlar[alt]; if (!s) return { ok: false, hata: 'bilinmeyen bot' }; const r = await s.ping('basari'); return { ok: !!r.ok, hata: r.ok ? null : (r.hata || 'gönderilemedi') }; }
      },
      ev: EV_BAGLANTI_ETKIN ? {
        kurulu: () => !!evOkuma.ayar(), yazmaKurulu: () => evYazma.yazmaAyari(), adres: () => (evOkuma.ayar() || {}).adres || null,
        oku: (yol) => evOkuma.jsonGetir(yol), yaz: (yol, govde) => evYazma.yaz('POST', yol, govde, { kuyruk: false })
      } : null,
      kasaSonrasi: (ad) => { if (ad === 'secrets.json') { ayar.SIRLAR_KILITLI = null; db.addLog('INFO', 'secrets.json kenara alındı — sırlar artık panelden yeniden girilebilir.'); } }
    });

    return { portfoyum, islemDefteri, anahtarlar };
  }

  function tasarimciUclari() {
    const { app, ARASTIRMA_MODU, islemDefteri, veriOrk, portfoyBildirici, AYAR_GECMISI, ayarGecmisiLib, BILDIRIM, configUygula, acilPin, evOkuma } = ctx;
    if (!ARASTIRMA_MODU && process.env.ISLEM_DEFTERI_ESITLE !== '0') {
      const idEsitle = () => { islemDefteri.gunlukEsitle().catch(e => db.addLog('WARN', `İşlem defteri OKX/Binance eşitleme: ${e.message}`)); };
      setTimeout(idEsitle, 3 * 60 * 1000).unref();
      setInterval(idEsitle, 60 * 60 * 1000).unref();
    }

    /**
     * PORTFÖY TASARIMCISI F2 (lib/tasarimci, PLAN-PORTFOY-TASARIMCI.md): model portföy NAV motoru (m-837, m-qqq-m10, m-bist-m10
     * + kıyaslar), yalnız eklenen defter data/tasarimci/{kararlar,dolumlar,gunluk}.jsonl, 30 dk zamanlayıcı (veri talebi
     * süreç içi, ağır hesap ALT SÜREÇTE scripts/tasarimci-tik.js; TASARIMCI=0 kapatır). GET /api/tasarimci/* telefonda da açık
     * ve dosya yazmaz; POST /api/tasarimci/yenile telefon kademesinde lib/guvenlik.js 403. Araştırma modunda da açık (kayıtlar
     * `deneme: true`). Emir vermez, borsaya bağlanmaz, Telegram'a bir şey yollamaz.
     */
    const tasarimciZaman = require('../tasarimci/zamanlayici').kur({ log: (lv, msg) => db.addLog(lv, msg), veriOrk,
      // O10 (62.0): ardışık tik hatası Telegram'a (araştırma modunda Telegram zaten kapalı).
      alarm: (baslik, satirlar) => portfoyBildirici.gonder(/yeniden çalışıyor/.test(baslik) ? 'bilgi' : 'uyari', baslik, satirlar, { anahtar: `tasarimci:${baslik}` }) });
    const tasarimciYonlendirici = require('../tasarimci/api').router({ zamanlayici: tasarimciZaman, log: (lv, msg) => db.addLog(lv, msg),
      // 74.2 ayar geçmişi: model sermayesi ayarları (tutarlar "•••" — kişisel, geri alınmaz)
      degisiklik: (once, sonra) => AYAR_GECMISI.kaydet({ tur: 'sermaye', farklar: ayarGecmisiLib.farkBul(once || {}, sonra || {}), gizliYol: (y) => /^modeller\./.test(y) }) });
    app.use(tasarimciYonlendirici);

    /* ── 74.2 AYAR GEÇMİŞİ uçları (C2; lib/ayarGecmisi.js) ── */
    /** Ayarın bugünkü (etkin, sırsız) değeri: config diskteki etkin ayardan (kayıt da diskten yazılır), bildirim merkezin etkin görünümünden. */
    function ayarSimdikiOkuyucu() {
      let disk = null, bildirim = null, sermaye = null;   // istek başına bir kez okunur
      return (tur, yol) => {
        if (tur === 'config') { if (!disk) disk = ayarlarLib.oku(); return ayarGecmisiLib.yoldanAl(disk, yol); }
        if (tur === 'bildirim') { if (!bildirim) bildirim = BILDIRIM.etkinAyar(); return ayarGecmisiLib.yoldanAl(bildirim, yol); }
        if (tur === 'sermaye') { if (!sermaye) sermaye = require('../tasarimci/api').sermayeOku() || {}; return ayarGecmisiLib.yoldanAl(sermaye, yol); }
        throw new Error('bilinmeyen tür');
      };
    }
    const ayarGunu = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
    app.get('/api/ayar-gecmisi', async (req, res) => {
      try {
        const q = req.query || {};
        const sz = { bas: ayarGunu(q.bas), bit: ayarGunu(q.bit), tur: ayarGecmisiLib.TURLER.includes(q.tur) ? q.tur : '', makine: String(q.makine || '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40), n: q.n };
        const kademe = req.kademe || 'yerel';
        const simdiki = ayarSimdikiOkuyucu();
        const bilgi = (k, d, uzak) => {
          if (!uzak && k.makine && k.makine.ad !== AYAR_GECMISI.makine.ad) return { uygun: false, neden: 'Bu kayıt başka bir makineye ait — o makinenin panelinden geri alınır.', gevsetme: false };
          let v, yok = false;
          try { v = simdiki(k.tur, d.yol); } catch { yok = true; }
          const u = ayarGecmisiLib.uygunluk(k, d, { kademe, uzak, arastirma: ARASTIRMA_MODU, simdiki: v, simdikiYok: yok });
          return { uygun: u.uygun, neden: u.neden || null, gevsetme: !!u.gevsetme };
        };
        const satirla = (k, uzak) => ({ ...k, uzak: !!uzak, degisiklikler: (k.degisiklikler || []).map(d => ({ ...d, geriAl: bilgi(k, d, uzak) })) });
        const yerel = AYAR_GECMISI.oku(sz);
        let kayitlar = yerel.kayitlar.map(k => satirla(k, false));
        let sunucu = null;
        if (ARASTIRMA_MODU && q.yerel !== '1') {
          const p = new URLSearchParams({ yerel: '1', ...(sz.bas ? { bas: sz.bas } : {}), ...(sz.bit ? { bit: sz.bit } : {}), ...(sz.tur ? { tur: sz.tur } : {}), ...(sz.makine ? { makine: sz.makine } : {}), ...(q.n ? { n: String(q.n) } : {}) });
          const r = evOkuma.ayar() ? await evOkuma.jsonGetir(`/api/ayar-gecmisi?${p}`) : null;
          if (r && r.govde && r.govde.success && Array.isArray(r.govde.kayitlar)) {
            kayitlar.push(...r.govde.kayitlar.map(k => satirla(k, true)));
            kayitlar.sort((a, b) => String(b.z).localeCompare(String(a.z)));
            sunucu = { durum: r.eski ? 'eski' : 'tamam', zaman: r.zaman || null };
          } else sunucu = { durum: evOkuma.ayar() ? 'ulasilamadi' : 'kurulu-degil' };
        }
        const makineler = [...new Set(kayitlar.map(k => k.makine && k.makine.ad).filter(Boolean))];
        res.json({ success: true, kayitlar, toplam: yerel.toplam, bozuk: yerel.bozuk, makine: AYAR_GECMISI.makine, makineler, arastirma: ARASTIRMA_MODU, sunucu,
          yazilabilir: kademe === 'yerel', pin: { tanimli: !!acilPin.durum().tanimli }, onayMetni: ayarGecmisiLib.ONAY_METNI, sonHata: AYAR_GECMISI.durum().sonHata });
      } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });
    /** Geri al: yalnız bilgisayardan (telefon/geliştirme kademesi 403 — lib/guvenlik beyaz listelerinde YOK), acil PIN, gevşetmede "GERİ AL", aynı doğrulama yolu. */
    app.post('/api/ayar-gecmisi/geri-al', async (req, res) => {
      try {
        const r = await AYAR_GECMISI.geriAl(req.body || {}, {
          kademe: req.kademe || 'yerel', arastirma: ARASTIRMA_MODU, acilPin, simdiki: ayarSimdikiOkuyucu(),
          uygula: {
            config: (yol, hedef) => {
              const p = String(yol).split('.');
              const ust = p[0];
              const yama = { [ust]: p.length > 1 ? ayarGecmisiLib.yolaKoy(ctx.config[ust], p.slice(1).join('.'), hedef, { tanimsizBirak: true }) : hedef };
              if (ARASTIRMA_MODU) { const red = guvenlikKur.arastirmaAyarRed('POST', '/api/config', yama); if (red) return { durum: 403, govde: { success: false, arastirma: true, error: red } }; }
              return configUygula(yama);
            },
            bildirim: (yol, hedef) => {
              try { BILDIRIM.yolAyarla(yol, hedef); return { durum: 200, govde: { success: true } }; }
              catch (e) { return { durum: e.durum || 500, govde: { success: false, error: e.message } }; }
            },
            sermaye: (yol, hedef) => {
              const p = String(yol).split('.');
              return tasarimciYonlendirici.sermayeYaz(p[0] === 'hesaplar' ? { hesaplar: { [p[1]]: hedef == null ? '' : hedef } } : { [p[0]]: hedef });
            }
          }
        });
        res.status(r.durum).json(r.govde);
      } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });
    tasarimciZaman.baslat();

  }

  return { laboratuvarUclari, portfoyUclari, tasarimciUclari };
}

module.exports = { olustur };
