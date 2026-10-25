/**
 * C1 (75.1, TASARIM-MAKINE-HESAP-BOT §3 parça 3) — server.js'ten taşındı, davranış AYNI. BOT YÖNETİMİ, iki grup:
 *   kur()    HÜCUM / DENGE (Kairos/Tao) + kullanıcının oluşturduğu botlar (lib/live/bindirmeBot): STRATEJI_ADLAR / BINDIRME_ADLAR (dinamik
 *            dizi — nesne hiç değişmez), botEtiketi, gerçek para kapısı (canliKapiDurum/Gerekli, gorunurModlar), ikinci kanal, portföy
 *            bildiricisi, bot başına sağlık sinyalleri (68.8), 74.4 BOT KAYDI (server.js `let BOT_KAYIT`'a ctx.botKayitYaz ile yazılır —
 *            ayar deposu saveConfig onu okur), bindirmeAyar / gocBotAyarYaz (74.7 tek kaynak), 74.3 veri kalitesi ayarı + spot okuyucu,
 *            bindirmeKur (lib/sunucu/botFabrikasi), açılış göçü + bot kurulumu, hesap bağlama (a4), botEkle/botCikar, 74.6 model örnekleri,
 *            Y1 açılış bağlanışı (acilisBaglan), 26 sa alarmı, O5 saatlik bekçi, disk, Y10 dış IP, açılış ayar/sır alarmı, giden kutusu,
 *            bindirmeBul, bindirmeDemoCakisma → server.js'in ve diğer modüllerin kullandığı adlar (ctx.botYonetimi)
 *   motor()  panelin borsa modu rozeti (borsaModu), motor TICK yayını (engine.onTickCallback), WebSocket ilk durum (wss connection),
 *            ensureEngineRunning → { borsaModu, ensureEngineRunning }
 *
 * Bağlanma: server.js `BOT_YONETIMI = require('./lib/sunucu/botYonetimi').olustur(ctx)`; `kur()` eski yerinde (borsa yürütücülerinden
 * sonra), `motor()` eski yerinde (/api/botlar uçlarından sonra, güncelleme uçlarından önce). Bütün require'lar ve zamanlayıcılar eski
 * SIRAYLA, kur() İÇİNDE (yükleme sırası değişmesin). ctx alanları KULLANIM ANINDA okunur (lib/sunucu/baglam.js): `config` ve `BOT_KAYIT`
 * (server.js `let`) her yerde ctx.config / ctx.BOT_KAYIT; sonra kurulan veri orkestratörü ctx.veriOrk (çağrı anında, try içinde — eski
 * TDZ davranışıyla aynı); taşınan koddaki `__dirname` → `kok`, AYAR_DEPOSU → `ayar` (ctx.ayar).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const yollar = require('../yollar');
const db = require('../database');
const kaliciDosya = require('../live/kaliciDosya');
const tasimaLib = require('../tasima');

function olustur(ctx) {
  function kur() {
    const { kok, ARASTIRMA_MODU, BILDIRIM, AYAR_GECMISI, engine, saveConfig } = ctx;
    const ayar = ctx.ayar;
    const { loadSecrets } = ayar;
    const { CanliYurutucu, KagitBorsa, CANLI_DIZIN, canli, donchianBot } = ctx.borsa;
    /**
     * HÜCUM / DENGE (lib/live/bindirmeBot.js) — iki mod, panelden seçilir:
     *   · kagit : O-GC BTC ayağı SPOT BTC (çoklu varlık modunun kâğıt karşılığı) + Kalkan kolu ×3,
     *             KagitBorsa (gerçek emir yok). Dizin data/live/<ad>/.
     *   · demo  : Binance DEMO TRADING hesabı (testnet anahtarı, Borsa sekmesi). BTC ayağı BTCUSDT
     *             perp LONG — DEMO YAKLAŞIMI, gerçekte spot teminat. Karar verisi prod'un anahtarsız
     *             genel uçlarından (gölgeyle aynı veri), emirler demo hesaba. Dizin data/live/<ad>-demo/.
     *   · canli : GERÇEK PARA (61.9, C1 — PLAN-GERCEK-PARA-2027.md). Yalnız lib/live/canliKapi.js kapısı açıkken (tarih ≥
     *             2027-01-05, G1–G9 yazılı onayı data/live/canli-kapilar.json, canliSermayeTavani ≤ onaylı üst sınır, live anahtar,
     *             healthchecks, tek bot). Kapı her bağlanışta (açılış dahil) yeniden denetlenir. BTC ayağı HER ZAMAN çoklu varlık
     *             ('coklu'); anahtar izinleri bağlanırken borsadan denetlenir (çekme kapalı, futures, spot, universal transfer, IP
     *             kısıtı). Mod geçişi "GERÇEK PARA" yazarak; emir onayı "CANLI" (kalıcı, K1). Hesap kesicisi %30/%40 (Ö6); ileri test
     *             DUR → acil. Dizin data/live/<ad>-canli/.
     *   · GERÇEK TASARIM kipi (PLAN-GERCEK-PARA-2027.md): config.bindirme.<ad>.btcAyak = 'coklu' → yalnız KÂĞIT modda
     *     BTC ayağı çoklu varlık akışıyla (spot alım → vadeliye aktarım, KagitBorsa taklidi). Varsayılan DEĞİŞMEZ (spot);
     *     demo'da sapi aktarımı olmadığı için yok sayılır (perp).
     * Tek demo hesap ⇒ aynı anda en çok BİR portföy botu demo modunda olabilir.
     * Ayar: config.bindirme.{hucum|denge} = { mod, sermayeTavani, kagitBakiye, k, demoSermayeTavani }.
     */
    const { BindirmeBot } = require('../live/bindirmeBot');
    const isletim = require('../live/isletim');
    const bindirmeArastirma = require('../research/bindirme');
    /** Strateji (model) adları — Kairos/Tao iç adları ['hucum', 'denge']; gölge ve ölçüm döngüleri BUNU kullanır. */
    const STRATEJI_ADLAR = Object.freeze(Object.keys(bindirmeArastirma.STRATEJILER));
    /**
     * Çalışan bot kimlikleri. 74.5 (A1 2b): DİNAMİK — Kairos/Tao + kullanıcının oluşturduğu botlar (live/botlar); yeni bot eklenince
     * push, arşivlenince çıkarılır. Dizi NESNESİ hiç değişmez: her tüketici (öz denetim, bekçi, rapor, Telegram, sağlık, taşıma, anahtarlar)
     * listeyi çağrı anında bu diziden okur (getter) — önbelleğe alan yok.
     */
    const BINDIRME_ADLAR = [...STRATEJI_ADLAR];
    /** Görünen ad: Kairos/Tao → strateji adı (eskisiyle aynı); yeni bot → kaydın adı (lib/botAdlari EK), yoksa kimlik. */
    const botEtiketi = (ad) => (STRATEJI_ADLAR.includes(ad) ? bindirmeArastirma.STRATEJILER[ad].ad : (require('../botAdlari').ad(ad) || ad));
    /** 74.5: kullanıcının oluşturduğu bot mu (Kairos/Tao değil). */
    const yeniBotMu = (ad) => !STRATEJI_ADLAR.includes(ad);
    const YENI_CANLI_RED = require('./botFabrikasi').YENI_CANLI_RED;
    const BINDIRME_MODLAR = ['kagit', 'demo', 'canli'];
    const canliKapi = require('../live/canliKapi');
    const CANLI_KAPILAR_DOSYA = yollar.veri('live', 'canli-kapilar.json');
    /** Gerçek para kapısı (lib/live/canliKapi.js) — her çağrıda dosyadan okunur; çalışan bot her günlük çalışmada sorar (kapiFn). */
    function canliKapiDurum(ad) {
      // 74.5: yeni botlar için gerçek para TAMAMEN kapalı (5. faza kadar) — kapı dosyası okunmaz bile.
      if (yeniBotMu(ad)) return { izin: false, yeniBot: true, eksikler: [{ kod: 'yeni-bot', metin: YENI_CANLI_RED }], ustSinir: 0 };
      let kapilar = null;
      try { kapilar = JSON.parse(fs.readFileSync(CANLI_KAPILAR_DOSYA, 'utf8')); } catch { /* yok/bozuk = onay yok */ }
      return canliKapi.denetle({ simdi: Date.now(), ad, tavan: bindirmeAyar(ad).canliSermayeTavani, kapilar,
        anahtarVar: !!(ctx.config.apiKey && ctx.config.apiSecret), saglikUrl: botSaglikUrl(ctx.config, ad), arastirma: ARASTIRMA_MODU,   // 68.8: o botun KENDİ adresi
        digerCanli: Object.values(bindirmeler).filter(b => b && b.mod === 'canli').map(b => b.ad) });
    }
    function canliKapiGerekli(ad) { const k = canliKapiDurum(ad); if (!k.izin) throw new Error(canliKapi.metin(k)); return k; }
    /** Panelde görünen modlar: gerçek para yalnız kapı açıkken (ya da zaten o moddaysa — geri dönebilmek için). */
    const gorunurModlar = (b) => BINDIRME_MODLAR.filter(m => m !== 'canli' || b.mod === 'canli' || canliKapiDurum(b.ad).izin);
    const GOLGE_DOSYA = yollar.veri('ileri', 'bindirme-golge.jsonl');
    /** 69.4 ikinci kanal (ntfy) ve ikinci ölü adam: secrets.json `ikinciKanal` { ntfyKonu, sinyalUrl } (sır — panelde maskeli). */
    const ikinciKanal = () => { const k = (loadSecrets().ikinciKanal) || {}; return { konu: k.ntfyKonu || null, sinyalUrl: k.sinyalUrl || null }; };
    // 73.5: Bildirici'nin kendi ntfy yayını (alarm her zaman) bildirim merkezinin az önce ntfy'a yolladığı aynı başlığı ikinci kez yollamasın
    // (tür kanalı "ikisi" seçiliyse) — yalnız fetch sarılır; Bildirici kodu (lib/live/isletim.js) değişmedi.
    const portfoyBildirici = new isletim.Bildirici(() => engine.telegram, { ikinciKanalFn: ikinciKanal, fetchFn: BILDIRIM.ntfyFetchSarmala(), ozetDosya: yollar.veri('telegram-son-ozet.json'),
      kuyrukDosya: ARASTIRMA_MODU ? null : yollar.veri('telegram-kuyruk.jsonl'),   // Y3: giden kutusu (5 dk'da bir boşaltılır)
      gunlukDosya: ARASTIRMA_MODU ? null : yollar.veri('live', 'alarmlar.jsonl') });   // PLAN-DEMO-KABUL I3: kalıcı bildirim günlüğü

    /**
     * SAĞLIK SİNYALİ (healthchecks.io, lib/saglikSinyali.js). İKİ AYRI URL — bilinçli:
     *   · bot    : yalnız portföy botunun günlük çalışması pingler. Sunucu kalp atışı AYNI URL'ye
     *              gitseydi, sunucu açık ama bot durmuş/takılmışken check hiç düşmezdi (asıl yakalanacak durum).
     *   · sunucu : isteğe bağlı ikinci check; sunucu açıkken günde bir ping.
     * 68.8 BOT BAŞINA: her bot KENDİ check'ine (lib/saglikSinyali.js botUrl) — Hücum eski `healthchecksUrl` (geri uyum), Denge
     *   `bindirme.denge.healthchecksUrl`. Önceden iki bot aynı URL'ye ping atıyordu: biri durunca öbürünün başarı ping'i check'i
     *   "up" tutardı. Denge'nin adresi yoksa Denge ping GÖNDERMEZ (Hücum'unkine de). `saglikBot` = Hücum'unki (eski ad).
     */
    const { SaglikSinyali, botUrl: botSaglikUrl } = require('../saglikSinyali');   // C1 (75.0): urlGecerli → lib/sunucu/ayarUclari.js
    const saglikBotlar = Object.fromEntries(BINDIRME_ADLAR.map(ad => [ad, new SaglikSinyali({ ad: `sağlık sinyali (${botEtiketi(ad)})`, urlFn: () => botSaglikUrl(ctx.config, ad), kaydet: (sv, m) => db.addLog(sv, `[SAĞLIK] ${m}`) })]));
    const saglikBot = saglikBotlar.hucum;
    const saglikSunucu = new SaglikSinyali({ ad: 'sağlık sinyali (sunucu)', urlFn: () => ctx.config.healthchecksSunucuUrl, kaydet: (sv, m) => db.addLog(sv, `[SAĞLIK] ${m}`) });
    /**
     * 74.4 BOT KAYDI (A1 + 2. faz parça 2a, lib/botKayit.js — TASARIM-MAKINE-HESAP-BOT §2): her bot için <veri>/live/botlar/<ad>.json
     * (sır yok; hesap Anahtarlar kimliğiyle). Açılışta Kairos/Tao config.bindirme'den göç eder (doğrulama tutmazsa göç YOK, eski yol + WARN).
     * 74.7 TEK KAYNAK (§2.5/§2.11 — çift yazım kaldırıldı): Kairos/Tao ayarı yalnız KAYDA yazılır (gocBotAyarYaz → BOT_KAYIT.ayarYaz);
     * config.bindirme.<ad> kayıttan tek yönlü türetilen GERİ DÖNÜŞ YANSIMASIDIR (saveConfig başında BOT_KAYIT.yansit) — eski sürüme
     * (74.3 / 74.4–74.6) dönülürse botlar aynı ayarla çalışır. Açılışta ikisi ayrışmışsa (eski sürümde/elle değişti) config kazanır (içe alma).
     * bindirmeAyar = etkin kayıt → botKayit.ayar (+ bellekteki sır); kayıt kullanılamıyorsa eski yol (config.bindirme tek kaynak).
     * Dizinler, hesap adı, sağlık adresi, gölge DEĞİŞMEZ.
     */
    const botKayitLib = require('../botKayit');
    const botFabrikasi = require('./botFabrikasi');
    const botSablonlari = require('../botSablonlari');
    ctx.botKayitYaz(botKayitLib.olustur({ dizin: yollar.veri('live', 'botlar'), stratejiler: bindirmeArastirma.STRATEJILER,
      log: (lv, m) => db.addLog(lv, m),
      gecmis: ({ kimlik, farklar, neden }) => AYAR_GECMISI.kaydet({ tur: 'bot', farklar: farklar.map(f => ({ ...f, yol: `${kimlik}.${f.yol}` })), ...(neden === 'göç' ? { kaynak: 'sistem', uc: 'açılış göçü' } : {}) }) }));   // C1 (75.1): server.js `let BOT_KAYIT`'a yazılır (ayar deposu okur)
    /** Eski yol (74.3'e kadar tek yol): varsayılanlar ⊕ config.bindirme.<ad> — lib/botKayit.hamAyar birebir. */
    const bindirmeAyarEski = (ad) => botKayitLib.hamAyar(ctx.config, ad);
    function bindirmeAyar(ad) {
      // 74.5: kullanıcının oluşturduğu bot — kayıt TEK kaynak (config.bindirme'de tanımı yok).
      if (ctx.BOT_KAYIT && ctx.BOT_KAYIT.yeniMi && ctx.BOT_KAYIT.yeniMi(ad)) { const y = ctx.BOT_KAYIT.kayit(ad); if (!y) throw new Error(`bot kaydı yok: ${ad}`); return botKayitLib.ayar(y); }
      const ham = bindirmeAyarEski(ad);
      const k = ctx.BOT_KAYIT ? ctx.BOT_KAYIT.etkinKayit(ad) : null;   // 74.7: kayıt tek kaynak (config'le karşılaştırılmaz; config onun yansıması)
      return k ? { ...botKayitLib.ayar(k), ...botKayitLib.sirlar(ham) } : ham;
    }
    /**
     * 74.7 TEK KAYNAK: Kairos/Tao ayar değişikliği (mod, küçük sermaye, btcAyak, sermaye üst sınırı, /api/config yaması). Etkin kayıt varsa
     * YALNIZ kayda yazılır; yansıma saveConfig'te kayıttan türer (önce ayarlar.json, sonra kayıt dosyası — lib/botKayit ayarYaz). Kayıt
     * kullanılamıyorsa (bozuk/geçersiz — eski yol) config.bindirme tek kaynaktır (74.3 yolu). Döndürür true (değişti) | false.
     */
    function gocBotAyarYaz(ad, alanlar, neden) {
      if (ctx.BOT_KAYIT && ctx.BOT_KAYIT.etkinKayit(ad)) {
        return !!ctx.BOT_KAYIT.ayarYaz(ad, { ...botKayitLib.sirsiz(bindirmeAyar(ad)), ...alanlar }, neden, { once: () => saveConfig(ctx.config) });
      }
      const onceki = (ctx.config.bindirme || {})[ad] || {};
      ctx.config.bindirme = { ...(ctx.config.bindirme || {}), [ad]: { ...onceki, ...alanlar } };
      saveConfig(ctx.config);
      return true;
    }
    /**
     * 74.3 VERİ KALİTESİ KAPISI (D4, lib/live/veriKalitesi.js): config.veriKalitesi = { kip ('izleme' varsayılan | 'etkin'), izlemeBas (ISO | null), esikler }.
     * İkinci kaynak Binance SPOT günlük kapanış (anahtarsız; 418/429 beklemesi veri orkestratörüyle ORTAK — veriOrk aşağıda tanımlı, yalnız
     * çağrı anında okunur). Kip yalnız POST /api/veri-kalitesi/kip ile (bu bilgisayar + onay) değişir; kendiliğinden geçiş YOK.
     */
    const VeriKalitesi = require('../live/veriKalitesi');
    function veriKalitesiAyar() {
      const v = (ctx.config && ctx.config.veriKalitesi) || {};
      const bas = v.izlemeBas == null ? NaN : (typeof v.izlemeBas === 'number' ? v.izlemeBas : Date.parse(v.izlemeBas));
      return { kip: VeriKalitesi.KIPLER.includes(v.kip) ? v.kip : 'izleme', izlemeBas: Number.isFinite(bas) && bas > 0 ? bas : null, esikler: VeriKalitesi.esikBirlestir(v.esikler) };
    }
    const veriKalitesiSpot = VeriKalitesi.spotOkuyucu({
      fetchFn: (...a) => fetch(...a),
      bekleme: {
        oku: () => { try { return ctx.veriOrk.binanceBekleme(); } catch { return null; } },
        yaz: (x) => { try { ctx.veriOrk.binanceBeklemeErisimi('veri kalitesi').yaz(x); } catch { /* orkestratör yoksa bekleme yalnız bu istekte */ } },
      },
      zamanAsimiMs: VeriKalitesi.ESIKLER.zamanAsimiMs,
    });
    const KUCUK_SECIMLER = { oto: 'oto', acik: true, kapali: false };
    const KAGIT_AYAKLAR = ['spot', 'coklu'];   // 68.9: kâğıt hesapta BTC ayağı (sıfırlamayla seçilir; demo her zaman perp, canlı her zaman çoklu)
    const bindirmeDizin = (ad, mod) => path.join(CANLI_DIZIN, mod === 'demo' ? `${ad}-demo` : mod === 'canli' ? `${ad}-canli` : ad);
    const bindirmeler = {};
    const ACILIS_DENEME_DK = [1, 2, 5, 10, 30];
    const ACILIS_ALARM_MS = 15 * 60000;

    /**
     * 74.4 (C1 ilk parça): bindirmeKur'un argüman üretimi SAF fabrikada (lib/sunucu/botFabrikasi.js — btcAyakSec, tavan, yürütücü ve bot
     * ayarı). Yan etkili parçalar burada (ortam): günlük, bildirici, bot başına sağlık sinyali (68.8: saglik: saglikBotlar[ad]), veri kalitesi
     * kapısı (74.3), gerçek para kapısı (denetim #2). Eski kodla derin eşitlik: scripts/bot-kayit-selftest.js.
     */
    const FABRIKA_ORTAM = {
      dizin: (ad, mod) => bindirmeDizin(ad, mod),
      log: (seviye, metin) => db.addLog(seviye, metin),
      bildirici: portfoyBildirici,
      golgeDosya: GOLGE_DOSYA,
      saglik: (ad) => saglikBotlar[ad],
      veriKapisi: ({ dizin, kaydet }) => new VeriKalitesi.VeriKapisi({ dizin, kipFn: () => veriKalitesiAyar().kip, esikFn: () => veriKalitesiAyar().esikler, ikinciKaynak: veriKalitesiSpot, varlik: 'BTC', kaydet }),
      kapiFn: (ad) => () => canliKapiDurum(ad),
    };

    function bindirmeKur(ad, mod) {
      if (!BINDIRME_MODLAR.includes(mod)) throw new Error(`mod kagit | demo | canli olmalı ("${mod}")`);
      // 74.4/74.7: etkin kayıt varsa kayıttan (tek kaynak), yoksa eski yoldan (config.bindirme) — ikisi de aynı fabrikadan geçer.
      const ham = bindirmeAyarEski(ad);
      // 74.5: kullanıcının oluşturduğu bot → yalnız kayıttan (sır yok; canlı fabrikada reddedilir).
      const yeniKayit = yeniBotMu(ad) ? (ctx.BOT_KAYIT && ctx.BOT_KAYIT.kayit(ad)) : null;
      if (yeniBotMu(ad) && !yeniKayit) throw new Error(`bot kaydı yok: ${ad}`);
      const kayit = ctx.BOT_KAYIT ? ctx.BOT_KAYIT.etkinKayit(ad) : null;
      const r = yeniKayit ? botFabrikasi.argumanlar(yeniKayit, mod, FABRIKA_ORTAM, {})
        : kayit ? botFabrikasi.argumanlar(kayit, mod, FABRIKA_ORTAM, botKayitLib.sirlar(ham)) : botFabrikasi.argumanlarAyardan(ham, ad, mod, FABRIKA_ORTAM);
      const { dizin, canliMi, ayar: a } = r;
      const y = new CanliYurutucu(r.yurutucu);
      const bot = new BindirmeBot(y, r.bot);
      /** @param o.mutabakatsiz Y4 (61.7): acil durdurma için yalnız bağlan — kol mutabakatı (ve hatası) acili engellemez. */
      const bagla = async (o = {}) => {
        if (y.borsa) return y.ozet();
        const ccxt = require('ccxt');
        const veri = new ccxt.binanceusdm({ enableRateLimit: true });   // anahtarsız: yalnız piyasa verisi
        let ozet;
        if (canliMi) {
          // C1: kapı HER bağlanışta yeniden denetlenir (açılışta da). Denetim #1: ACİL bağlanışı (mutabakatsiz) hariç — kapı kapansa da
          // açık pozisyon kapatılabilmeli; acil zaten ELLE durdurur ve kalıcı emir onayını kaldırır.
          if (!o.mutabakatsiz) canliKapiGerekli(ad);
          ozet = await y.baglan({ ortam: 'live', apiKey: ctx.config.apiKey, apiSecret: ctx.config.apiSecret });
        } else if (mod === 'demo' && yeniKayit) {
          // 74.5: yeni bot — bağlı demo hesabın anahtarı (Anahtarlar kimliğiyle; bağlanış anında güncel kayıttan, a4 yeniden denetlenir).
          const an = yeniBotAnahtari(ad, 'demo');
          ozet = await y.baglan({ ortam: 'testnet', apiKey: an.apiKey, apiSecret: an.apiSecret, veri });
        } else if (mod === 'demo') {
          if (!ctx.config.testnetApiKey || !ctx.config.testnetApiSecret) throw new Error('Demo anahtarı yok — Borsa sekmesi → API anahtarları → Testnet Key/Secret girin');
          ozet = await y.baglan({ ortam: 'testnet', apiKey: ctx.config.testnetApiKey, apiSecret: ctx.config.testnetApiSecret, veri });
        } else {
          // 69.5: yeni kâğıt hesap kötümser modelle açılır (stoplar tetiklenir, piyasa emri kaymalı); var olan dosya kendi modelinde kalır.
          const borsa = new KagitBorsa({ veri, bakiye: a.kagitBakiye, dosya: path.join(dizin, 'kagit-borsa.json'), model: 'kotumser' });
          ozet = await y.baglanKagit(borsa);
        }
        if (!o.mutabakatsiz) await bot.mutabakat();
        return ozet;
      };
      return { ad, mod, dizin, y, bot, bagla };
    }

    // 74.4 A1 göçü (a2): Kairos/Tao tanımı config.bindirme'den live/botlar/<ad>.json'a (doğrulama tutmazsa göç yok, eski yol + WARN).
    try { ctx.BOT_KAYIT.gocEt(ctx.config, BINDIRME_ADLAR); } catch (e) { db.addLog('ERROR', `[BOT KAYDI] göç yapılamadı: ${e.message} — eski yol (config.bindirme)`); }
    for (const ad of BINDIRME_ADLAR) {
      let mod = bindirmeAyar(ad).mod;
      if (!BINDIRME_MODLAR.includes(mod)) { db.addLog('WARN', `[BİNDİRME] ${ad}: geçersiz mod "${mod}" — kâğıt kullanılıyor`); mod = 'kagit'; }
      const b = bindirmeler[ad] = bindirmeKur(ad, mod);
      if (b.bot.durum.calisiyor && !ARASTIRMA_MODU && !tasimaLib.botBekliyor(ad)) acilisBaglan(ad, b);   // 68.1: taşıma sonrası mutabakat bekler
      else if (b.bot.durum.calisiyor && tasimaLib.botBekliyor(ad)) db.addLog('WARN', `[${ad}] taşıma dosyasıyla gelindi — bot kendiliğinden başlamadı; önce mutabakat, sonra Başlat`);
    }

    /**
     * 74.5 (A1 + 2. faz parça 2b — TASARIM-MAKINE-HESAP-BOT §2.6–2.10): KULLANICININ OLUŞTURDUĞU BOTLAR. Kayıt TEK kaynak (live/botlar/<kimlik>.json);
     * açılışta (göçten sonra) yüklenir, panelden (POST /api/botlar) çalışma zamanında eklenir. Her tüketici listeyi BINDIRME_ADLAR / bindirmeler /
     * saglikBotlar'dan çağrı anında okur. Kurallar: a6 her zaman kâğıtta başlar; a3 yalnız Kairos/Tao kuralı; a4 aynı borsa hesabına ikinci bot
     * yok (kâğıt hariç); a5 sermaye sabit üst sınır (USD, bakiye azsa bakiye — Ecap = min(E, tavan) bot içinde); CANLI YOK (5. faza kadar);
     * demo yalnız Binance demo hesabıyla (A2'ye kadar). Kairos/Tao'nun yolu (74.7: kayıt tek kaynak + config.bindirme geri dönüş yansıması) ayrı.
     */
    const anahtarlarLib = require('../anahtarlar');
    /** Bot nesnesi → şu an kullandığı borsa hesabı kimliği (kâğıtta null). Kairos/Tao her zaman sabit hesaplar (eski anahtar alanları). */
    function botHesapId(b) {
      if (!b || b.mod === 'kagit') return null;
      if (!yeniBotMu(b.ad)) return b.mod === 'demo' ? 'binance-demo' : 'binance-canli';
      const k = ctx.BOT_KAYIT && ctx.BOT_KAYIT.kayit(b.ad);
      return (k && k.hesap && k.hesap[b.mod]) || null;
    }
    /** Anahtarlar hesabı (sır DAHİL — yalnız sunucu içinde; dışarı verilmez). Bilinmeyen → null. */
    function hesapBilgisi(id) {
      const s = anahtarlarLib.SABIT[id];
      if (s) return { id, ad: s.ad, borsa: 'binance', tur: s.tur, sabit: true, apiKey: ctx.config[s.key] || '', apiSecret: ctx.config[s.secret] || '' };
      const h = ((loadSecrets() || {}).borsaHesaplari || {})[id];
      if (!h || typeof h !== 'object') return null;
      return { id, ad: String(h.ad || id).slice(0, 40), borsa: h.borsa || null, tur: h.tur || null, sabit: false, altHesap: h.altHesap || null, apiKey: h.apiKey || '', apiSecret: h.apiSecret || '' };
    }
    /** Hesap bu moda bağlanabilir mi → engel metni | null (A2'ye kadar yalnız Binance; tür moda uymalı; canlı yeni botlara kapalı). */
    function hesapUygunMu(h, mod) {
      if (mod === 'canli') return YENI_CANLI_RED;
      if (!h) return 'hesap Anahtarlar\'da bulunamadı (silinmiş olabilir)';
      if (h.borsa !== 'binance') return 'bu sürümde yalnız Binance hesapları bağlanır (OKX/Bybit 5. fazda)';
      if (h.tur !== mod) return `hesap türü "${h.tur === 'canli' ? 'canlı' : h.tur || '?'}" — ${mod} moduna yalnız ${mod} hesabı bağlanır`;
      if (!h.apiKey || !h.apiSecret) return 'hesabın API anahtarı eksik (Ayarlar › Anahtarlar)';
      return null;
    }
    /** a4: başka bir bot (kâğıt dışı) ya da Borsa sekmesinin eski yürütücüsü bu hesabı kullanıyor mu → engel metni | null. */
    function hesapCakismasi(ad, mod, hesapId) {
      if (mod === 'kagit' || !hesapId) return null;
      for (const x of BINDIRME_ADLAR) {
        if (x === ad) continue;
        const o = bindirmeler[x];
        if (o && o.mod !== 'kagit' && botHesapId(o) === hesapId) return `${o.bot.adGorunen} bu hesabı ${o.mod === 'demo' ? 'demo' : 'gerçek para'} modunda kullanıyor — aynı borsa hesabına ikinci bot bağlanamaz (her bot kendi hesabı / alt hesabı)`;
      }
      if (hesapId === 'binance-demo' && canli.borsa && canli.ortam === 'testnet') return 'Borsa sekmesinde demo hesaba ayrı bir bağlantı açık — önce onu kesin (aynı hesapta iki yürütücü olmaz)';
      if (hesapId === 'binance-canli' && canli.borsa && canli.ortam === 'live') return 'Borsa sekmesinde gerçek hesaba ayrı bir bağlantı açık — önce onu kesin';
      return null;
    }
    /** Yeni botun bağlanış anahtarı (yalnız demo). */
    function yeniBotAnahtari(ad, mod) {
      if (mod !== 'demo') throw new Error(YENI_CANLI_RED);
      const k = ctx.BOT_KAYIT && ctx.BOT_KAYIT.kayit(ad);
      const id = k && k.hesap ? k.hesap.demo : null;
      if (!id) throw new Error(`${botEtiketi(ad)}: demo hesabı bağlı değil — Ayarlar › Botlar › Hesap (acil PIN)`);
      const h = hesapBilgisi(id);
      const u = hesapUygunMu(h, 'demo');
      if (u) throw new Error(`${botEtiketi(ad)}: ${u}`);
      const c = hesapCakismasi(ad, 'demo', id);
      if (c) throw new Error(c);
      return { apiKey: h.apiKey, apiSecret: h.apiSecret };
    }
    /** Yeni botu çalışma zamanı listelerine ekler (açılışta ve POST /api/botlar). Sağlık sinyali adresi secrets'tan (bindirmeSaglik). */
    function botEkle(k, { acilis = false } = {}) {
      const kayit = ctx.BOT_KAYIT.kayit(k);
      if (!kayit) throw new Error(`bot kaydı yok: ${k}`);
      require('../botAdlari').kaydet(k, kayit.adGorunen || k);
      if (!saglikBotlar[k]) saglikBotlar[k] = new SaglikSinyali({ ad: `sağlık sinyali (${botEtiketi(k)})`, urlFn: () => botSaglikUrl(ctx.config, k), kaydet: (sv, m) => db.addLog(sv, `[SAĞLIK] ${m}`) });
      let mod = kayit.mod;
      if (mod === 'canli' || !BINDIRME_MODLAR.includes(mod)) { db.addLog('ERROR', `[BOT KAYDI] ${k}: mod "${mod}" yeni botta kullanılamaz — kâğıt`); mod = 'kagit'; }
      const b = bindirmeler[k] = bindirmeKur(k, mod);
      if (!BINDIRME_ADLAR.includes(k)) BINDIRME_ADLAR.push(k);
      if (acilis && b.bot.durum.calisiyor && !ARASTIRMA_MODU && !tasimaLib.botBekliyor(k)) acilisBaglan(k, b);
      else if (acilis && b.bot.durum.calisiyor && tasimaLib.botBekliyor(k)) db.addLog('WARN', `[${k}] taşıma dosyasıyla gelindi — bot kendiliğinden başlamadı; önce mutabakat, sonra Başlat`);
      return b;
    }
    /** Botu çalışma zamanı listelerinden çıkarır (arşiv). Dosyalar ve bot dizini olduğu gibi kalır. */
    function botCikar(k) {
      const b = bindirmeler[k];
      if (b) { try { if (b.bot.zamanlayici) b.bot.durdur(); } catch { /* */ } try { if (b.y.borsa) b.y.baglantiyiKes(); } catch { /* */ } }
      delete bindirmeler[k];
      delete saglikBotlar[k];
      const i = BINDIRME_ADLAR.indexOf(k);
      if (i >= 0) BINDIRME_ADLAR.splice(i, 1);
    }
    try {
      for (const k of ctx.BOT_KAYIT.yukle()) {
        try { botEkle(k, { acilis: true }); } catch (e) { db.addLog('ERROR', `[BOT KAYDI] ${k}: yüklenemedi — ${e.message}`); }
      }
      for (const [k, x] of Object.entries(ctx.BOT_KAYIT.arsivliler())) require('../botAdlari').kaydet(k, x.adGorunen || k);   // geçmiş satırlarında ad
    } catch (e) { db.addLog('ERROR', `[BOT KAYDI] yeni botlar yüklenemedi: ${e.message}`); }
    /**
     * 74.6 (A1 + 2. faz parça 2c — TASARIM-MAKINE-HESAP-BOT §2.6 "Model şablonları"): MODEL ÖRNEKLERİ (Nova / Lydia / Simurg'un ikinci
     * kâğıt hesabı). Bot kaydı (live/botlar/<kimlik>.json, motor 'model') TEK KAYNAK; tasarımcı tarafına yansıması
     * <tasarimci>/ornekler/<kimlik>/sermaye.json (lib/tasarimci/ornekler.js yansit) — tasarımcı tiki (alt süreç) yalnız onu okur ve
     * ornekler/<kimlik>/kagit.json'u yazar. Model örneği BİNDİRME BOTU DEĞİLDİR: BINDIRME_ADLAR / bindirmeler / sağlık sinyali / öz denetim /
     * veri kalitesi / emir uçlarında YOK (model botları da oralarda yok); görüldüğü yerler model botlarıyla aynı: Botlar › portföy botu sayfası,
     * Botlar › Özet, rapor (kâğıt hesaplar), Telegram kâğıt hesap alım-satım özeti. Demo/canlı ve borsa hesabı bu sürümde YOK (açık ret).
     */
    const ORNEKLER_LIB = require('../tasarimci/ornekler');
    const tasarimciDefter = require('../tasarimci/defter');
    const modelOrnegiMi = (k) => !!(ctx.BOT_KAYIT && botKayitLib.modelMi(ctx.BOT_KAYIT.kayit(k) || ctx.BOT_KAYIT.arsivKayit(k)));
    /** Kayıt → tasarımcı yansıması (sermaye.json). Hata yutulmaz (çağıran karar verir). */
    const ornekYansit = (kayit) => ORNEKLER_LIB.yansit(tasarimciDefter, kayit);
    try {
      for (const x of [...Object.values(ctx.BOT_KAYIT.modelKayitlari()), ...Object.values(ctx.BOT_KAYIT.arsivliler()).filter(botKayitLib.modelMi)]) {
        require('../botAdlari').kaydet(x.kimlik, x.adGorunen || x.kimlik);
        try { if (ornekYansit(x)) db.addLog('INFO', `[BOT KAYDI] ${x.adGorunen} (${x.kimlik}): model örneğinin tasarımcı yansıması kayıttan yenilendi`); }
        catch (e) { db.addLog('ERROR', `[BOT KAYDI] ${x.kimlik}: model örneği yansıtılamadı — ${e.message}`); }
      }
    } catch (e) { db.addLog('ERROR', `[BOT KAYDI] model örnekleri yüklenemedi: ${e.message}`); }
    /**
     * Y1 (61.8, DENETIM-CANLI-ALTYAPI): açılışta internet/DNS henüz yoksa bot bir daha denenmiyordu (panelden "Başlat"a kadar ölü).
     * Artık 1 · 2 · 5 · 10 · 30 dk (sonra 30 dk'da bir) yeniden denenir; ALARM ilk hatada değil, 15 dk süren başarısızlıkta
     * (internet o sırada gelmiş olur), bir kez. Bağlanınca alarm gitmişse "bağlantı kuruldu" bilgisi. Kullanıcı elle bağlarsa/durdurursa biter.
     */
    function acilisBaglan(ad, b, deneme = 0, ilk = null) {
      const etiket = b.mod === 'demo' ? 'demo hesaba' : b.mod === 'canli' ? 'GERÇEK hesaba' : 'kâğıt borsaya';
      // bagla() borsa nesnesi zaten varsa erken döner (mutabakatsız) — önceki denemede mutabakat düştüyse burada yeniden yapılır.
      const baglan = () => (b.y.borsa ? b.bot.mutabakat() : b.bagla());
      baglan().then(() => {
        b.bot.baslat();
        if (deneme > 0) {
          db.addLog('SUCCESS', `[${ad}] açılış bağlantısı ${deneme + 1}. denemede kuruldu`);
          if (b._acilisAlarm) portfoyBildirici.gonder('bilgi', `${b.bot.adGorunen}: bağlantı kuruldu`, [`Açılışta ${Math.round((Date.now() - ilk) / 60000)} dk bağlanılamamıştı; ${deneme + 1}. denemede bağlandı, bot çalışıyor.`]);
        }
      }).catch(e => {
        const bas = ilk || Date.now();
        db.addLog('ERROR', `[${ad}] açılışta ${etiket} bağlanılamadı (deneme ${deneme + 1}): ${e.message}`);
        if (!b._acilisAlarm && Date.now() - bas >= ACILIS_ALARM_MS) {
          b._acilisAlarm = true;
          portfoyBildirici.gonder('alarm', `${botEtiketi(ad)}: açılışta bağlanılamadı`, [e.message, `${Math.round((Date.now() - bas) / 60000)} dakikadır deneniyor; denemeler sürüyor (en çok 30 dk arayla).`]);
        }
        const bekle = ACILIS_DENEME_DK[Math.min(deneme, ACILIS_DENEME_DK.length - 1)] * 60000;
        setTimeout(() => {
          // Denetim 61.8 #1: borsa nesnesi kurulup MUTABAKAT hata verdiyse de yeniden dene (y.borsa dolu olabilir) —
          // yalnız bot başlatıldıysa (zamanlayıcı kurulu: elle Başlat ya da önceki deneme) dur.
          if (bindirmeler[ad] !== b || !b.bot.durum.calisiyor || b.bot.zamanlayici) return;
          acilisBaglan(ad, b, deneme + 1, bas);
        }, bekle).unref();
      });
    }
    // Sunucu açılınca: çalışması gereken bot 26 saattir çalışmadıysa Telegram uyarısı (kapalı kalma).
    setTimeout(() => {
      for (const ad of BINDIRME_ADLAR) {
        const b = bindirmeler[ad];
        const k = isletim.kalpDurumu(isletim.kalpOku(b.dizin));
        if (b.bot.durum.calisiyor && k.var && k.gecikti) {
          db.addLog('WARN', `[${ad}] ${isletim.KALP_ESIK_SAAT} saattir çalışmadı (${k.metin}) — kaçırılan günler bugünkü hedefle telafi edilecek`);
          portfoyBildirici.gonder('alarm', `${b.bot.adGorunen}: bot ${isletim.KALP_ESIK_SAAT} saattir çalışmadı`, [k.metin, 'Sunucu yeni açıldı. Bot yalnız bugünkü hedefe gidecek; kaçırılan günler ve gölgeye göre farkı raporlanacak.']);
        }
      }
    }, 45 * 1000).unref();

    // O5 (61.7): saatlik süreç içi bekçi — kalp 26 saati aştıysa ya da bir işlem 30 dk'dan uzun sürüyorsa (takılma) Telegram alarmı.
    // Aynı sorun 6 saatte bir tekrarlanır (Bildirici anahtar kısıtı). Araştırma modunda (bot başka makinede) çalışmaz.
    if (!ARASTIRMA_MODU) {
      setInterval(() => {
        for (const ad of BINDIRME_ADLAR) {
          const b = bindirmeler[ad];
          let sorunlar = [];
          try { sorunlar = b.bot.bekci(); } catch (e) { sorunlar = [{ anahtar: 'bekci', metin: `bekçi denetimi yapılamadı: ${e.message}` }]; }
          for (const s of sorunlar) {
            db.addLog('WARN', `[${ad}] bekçi: ${s.metin}`);
            portfoyBildirici.gonder('alarm', `${b.bot.adGorunen}: bekçi uyarısı`, [s.metin], { anahtar: `bekci:${ad}:${s.anahtar}` });
          }
        }
      }, 3600e3).unref();
    }

    /** O7: boş disk alanı (veri dizininin sürücüsü). */
    function diskDurumu() {
      try { const st = fs.statfsSync(kok); return { bosGB: +((st.bavail * st.bsize) / 1e9).toFixed(1) }; } catch (e) { return { hata: e.message }; }
    }
    const DISK_UYARI_GB = 10;

    /**
     * Y10 (61.8): DIŞ IP İZLEYİCİ — sunucunun internetinin IP'si değişince (modem yeniden başlaması) Binance API IP kısıtı anahtarı
     * reddeder. Saatte bir ücretsiz api.ipify.org'dan okunur (yalnız IP döner), data/dis-ip.json'a yazılır; değişince Telegram.
     */
    const DIS_IP_DOSYA = yollar.veri('dis-ip.json');
    async function disIpDenetle() {
      let ip;
      try {
        const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(10000) });
        ip = String(((await r.json()) || {}).ip || '');
      } catch { return null; }   // ağ yok — bir sonraki saatte
      if (!/^[0-9a-f.:]{3,45}$/i.test(ip)) return null;
      let eski = null;
      try { eski = JSON.parse(fs.readFileSync(DIS_IP_DOSYA, 'utf8')); } catch { /* ilk kez */ }
      if (eski && eski.ip === ip) return { ip, degisti: false };
      try { kaliciDosya.yaz(DIS_IP_DOSYA, { ip, zaman: new Date().toISOString(), onceki: eski ? eski.ip : null }); } catch { /* */ }
      if (eski && eski.ip) {
        db.addLog('WARN', `[İŞLETİM] dış IP değişti: ${eski.ip} → ${ip}`);
        portfoyBildirici.gonder('alarm', 'Sunucunun internetinin dış IP adresi değişti', [`${eski.ip} → ${ip}`,
          'Binance API anahtarında IP kısıtı varsa yeni adresi ekleyin (Binance → API Management → Edit restrictions); yoksa borsa istekleri reddedilir.'], { anahtar: `dis-ip:${ip}` });
      }
      return { ip, degisti: !!eski };
    }

    if (!ARASTIRMA_MODU) {
      // Açılış: bozuk ayar/sır dosyası kurtarıldıysa (Y5) alarm (Telegram ayarı bu sırada okunmuş olur).
      setTimeout(() => {
        if (ayar.SIR_GECIS && ayar.SIR_GECIS.yapildi) db.addLog('SUCCESS', `[İŞLETİM] sır dosyası şifrelendi (Windows DPAPI, yalnız bu bilgisayardaki bu Windows kullanıcısı çözer)${ayar.SIR_GECIS.neden ? ` — ${ayar.SIR_GECIS.neden}` : ''}`);
        for (const [ad, g] of Object.entries(ayar.KASA_GECIS || {})) if (ad !== 'secrets.json' && g && g.yapildi) db.addLog('SUCCESS', `[İŞLETİM] ${ad} sır kasasına alındı${g.neden ? ` — ${g.neden}` : ''}`);
        else if (ayar.SIR_GECIS && /doğrulanamadı/.test(ayar.SIR_GECIS.neden || '')) db.addLog('ERROR', `[İŞLETİM] ${ayar.SIR_GECIS.neden}`);
        for (const m of [ayar.loadConfig._yedekten, ayar.SIRLAR_BOZUK, ayar.SIRLAR_KILITLI].filter(Boolean)) {
          db.addLog('ERROR', `[İŞLETİM] ${m}`);
          portfoyBildirici.gonder('alarm', 'Ayar dosyası bozuk açıldı', [m], { anahtar: `ayar-bozuk:${m.slice(0, 30)}` });
        }
      }, 30 * 1000).unref();
      setInterval(() => { portfoyBildirici.kuyruguGonder().catch(() => null); }, 5 * 60000).unref();   // Y3
      setTimeout(() => { portfoyBildirici.kuyruguGonder().catch(() => null); }, 90 * 1000).unref();
      const saatlik = () => {
        disIpDenetle().catch(() => null);
        const d = diskDurumu();
        if (d.bosGB != null && d.bosGB < DISK_UYARI_GB) {
          portfoyBildirici.gonder('uyari', 'Disk dolmak üzere', [`Boş alan ${d.bosGB} GB (< ${DISK_UYARI_GB} GB). Disk dolarsa bot durum dosyalarını yazamaz.`], { anahtar: 'disk-dolu', kisitMs: 24 * 3600e3 });
        }
      };
      setTimeout(saatlik, 2 * 60000).unref();
      setInterval(saatlik, 3600e3).unref();
    }

    /** `:ad` → bot kaydı; bilinmeyen ad 404. */
    function bindirmeBul(req, res) {
      const b = bindirmeler[req.params.ad];
      // 74.6: model örneği bindirme botu değil — demo/canlı, başlat/durdur, acil fren yok (kâğıt hesap tasarımcı tikinde hesaplanır)
      if (!b && modelOrnegiMi(String(req.params.ad || ''))) { res.status(409).json({ success: false, modelOrnegi: true, error: `${botEtiketi(req.params.ad)}: ${botKayitLib.MODEL_ORNEK_RED}. Kâğıt hesabı Botlar sayfasında (#/botlar/${req.params.ad}).` }); return null; }
      if (!b) { res.status(404).json({ success: false, error: `bilinmeyen bot: ${req.params.ad} (${BINDIRME_ADLAR.join(' | ')})` }); return null; }
      return b;
    }
    /** Demo hesabı tek: başka bir portföy botu ya da Borsa sekmesinin Donchian botu aynı hesapta çalışmasın. */
    function bindirmeDemoCakisma(b) {
      // C1 denetim notu (62.1): Borsa sekmesinin eski yürütücüsü (canliIzin) gerçek hesaba bağlıyken portföy botu gerçek parada
      // başlatılamaz/çalıştırılamaz — aynı anahtarla iki yürütücü aynı hesabı yönetir, mutabakat ve K-TEK bozulur.
      if (b.mod === 'canli' && canli.borsa && canli.ortam === 'live') throw new Error('Borsa sekmesinde gerçek hesaba ayrı bir bağlantı açık — önce onu kesin (aynı hesapta iki yürütücü olmaz)');
      if (b.mod !== 'demo') return;
      // 74.5 (a4): çakışma HESAP bazında — Kairos/Tao ikisi de sabit 'binance-demo' kullandığı için onlarda davranış aynı; başka demo hesaba
      // bağlı yeni bot bu kuralla Kairos'u engellemez (ayrı hesap).
      const hid = botHesapId(b);
      if (!hid) throw new Error(`${b.bot.adGorunen}: demo hesabı bağlı değil — Ayarlar › Botlar › Hesap`);
      for (const ad of BINDIRME_ADLAR) if (ad !== b.ad && bindirmeler[ad].mod === 'demo' && botHesapId(bindirmeler[ad]) === hid) throw new Error(`${bindirmeler[ad].bot.adGorunen} zaten demo modunda — tek demo hesapta iki portföy botu mutabakatı bozar`);
      if (hid === 'binance-demo' && canli.ortam === 'testnet' && donchianBot.durum.calisiyor) throw new Error('Borsa sekmesindeki Donchian botu demo hesapta çalışıyor — önce onu durdurun');
      // §2.10: aynı hesapta iki botun emir kimliği öneki (bd + ilk 2 harf) aynı olamaz (a4 zaten engeller; kimlik kuralı da — üçüncü savunma).
      for (const ad of BINDIRME_ADLAR) if (ad !== b.ad && bindirmeler[ad].mod !== 'kagit' && botHesapId(bindirmeler[ad]) === hid && ad.slice(0, 2) === b.ad.slice(0, 2)) throw new Error(`${bindirmeler[ad].bot.adGorunen} ile emir kimliği öneki (bd${ad.slice(0, 2)}) aynı hesapta çakışıyor`);
    }
    return {
      STRATEJI_ADLAR, BINDIRME_ADLAR, BINDIRME_MODLAR, KUCUK_SECIMLER, KAGIT_AYAKLAR, GOLGE_DOSYA,
      botEtiketi, yeniBotMu, canliKapiDurum, canliKapiGerekli, gorunurModlar, ikinciKanal, portfoyBildirici,
      saglikBotlar, saglikBot, saglikSunucu, bindirmeAyar, gocBotAyarYaz, veriKalitesiAyar, bindirmeDizin, bindirmeler, bindirmeKur,
      botHesapId, hesapBilgisi, hesapUygunMu, hesapCakismasi, botEkle, botCikar, modelOrnegiMi, ornekYansit, diskDurumu,
      bindirmeBul, bindirmeDemoCakisma,
    };
  }

  function motor() {
    const { engine, broadcast, wss } = ctx;
    const { canli } = ctx.borsa;
    /** Panelin mod rozeti: paper motor mu, testnet mi, canlı mı. */
    const borsaModu = () => (canli.borsa ? canli.ortam : 'paper');

    engine.onTickCallback = (state) => {
      broadcast('TICK', { ...state, exchangeMode: borsaModu() });
      broadcast('STATS', db.getStats());
      broadcast('LOGS', db.getLogs(20));
    };

    // WebSocket Connection Handler
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ type: 'INIT', data: { ...engine.getState(), exchangeMode: borsaModu() }, stats: db.getStats(), logs: db.getLogs(50) }));
    });

    // --- REST API Endpoints ---

    /**
     * Adding a symbol to activeSymbols does nothing while the engine loop is
     * stopped — the UI would report "bot started" and no tick would ever run.
     * Every start path goes through here so the loop is guaranteed to be live,
     * and any refusal (kill-switch) is reported instead of swallowed.
     */
    function ensureEngineRunning() {
      if (engine.isRunning) return { running: true };
      try {
        engine.start();
        return { running: true, justStarted: true };
      } catch (err) {
        return { running: false, error: err.message };
      }
    }
    return { borsaModu, ensureEngineRunning };
  }

  return { kur, motor };
}

module.exports = { olustur };
