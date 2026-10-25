/**
 * C1 (75.1, TASARIM-MAKINE-HESAP-BOT §3 parça 3) — server.js'ten taşındı, davranış AYNI. SÜREÇ: HTTP dinleme (O1 EADDRINUSE → çıkış 2),
 * 73.6 (S03) donma bekçisi (yalnız KENDİ PID'i), açılış işleri (Telegram yoklayıcısı, bildirim üreticileri + sessiz saat, araştırma
 * kopyasının nabzı, izleme listesi mumları, motor açılışı + Telegram), Y8 kapanış (botların zamanlayıcıları dondurulur, süren iş en çok
 * 120 sn beklenir), 73.6 (S12) son kapanış işareti, SIGINT/SIGTERM/SIGHUP, unhandledRejection, uncaughtException.
 *
 * Bağlanma: `SUREC = require('./lib/sunucu/surec').olustur(ctx)` güncelleme uçlarından ÖNCE (shutdown ve sonKapanisPlanliMi'yi güncelleme /
 * öz denetim kurulumu okur — eskiden hoisted işlevlerdi); `SUREC.baslat()` server.js'in EN SONUNDA, eski yerinde: error dinleyicisi,
 * server.listen, process olayları AYNI SIRAYLA. ctx alanları KULLANIM ANINDA okunur (lib/sunucu/baglam.js): sonra kurulan Telegram
 * yoklayıcısı ctx.telegramYoklayici, `config` ctx.config.
 */
'use strict';
const fs = require('fs');
const yollar = require('../yollar');
const db = require('../database');

function olustur(ctx) {
  const { server, engine, bindirmeler } = ctx;   // olustur anında kurulmuş, yeniden atanmayan nesneler
  // --- Process resilience ------------------------------------------------------
  // Without these a single unhandled promise rejection kills the whole bot, and a
  // restart loses whatever was still sitting in a debounced write.

  let shuttingDown = false;
  let donmaBekcisi = null;   // 73.6 (S03) — baslat() dinleme anında kurar

  /**
   * Y8 (61.8): kapanışta portföy botlarının dakikalık zamanlayıcıları DONDURULUR (durum dosyasında "çalışıyor" kalır —
   * açılışta yeniden başlar) ve süren iş (günlük çalışma, DCA senkronu, felaket stopu denetimi) en çok KAPANIS_BEKLE_MS
   * beklenir; böylece yeniden başlatma emirlerin ortasında kesmez. Çökme (uncaughtException) beklemez.
   */
  const KAPANIS_BEKLE_MS = 120 * 1000;
  function botlarMesgul() {
    return Object.values(bindirmeler).filter(b => b && (b.bot.mesgul || (typeof b.bot.calismaSuruyor === 'function' && b.bot.calismaSuruyor()))).map(b => b.ad);
  }
  function shutdown(reason, exitCode = 0, { bekleme = true } = {}) {
    if (shuttingDown) return;
    shuttingDown = true;
    try { if (donmaBekcisi) donmaBekcisi.durdur(); } catch { /* */ }
    for (const b of Object.values(bindirmeler)) {
      if (b && b.bot.zamanlayici) { clearInterval(b.bot.zamanlayici); b.bot.zamanlayici = null; }
    }
    const mesgul = bekleme ? botlarMesgul() : [];
    if (mesgul.length) {
      console.log(`\n⏳ Kapatma bekliyor: ${mesgul.join(', ')} işini bitiriyor (en çok ${KAPANIS_BEKLE_MS / 1000} sn)...`);
      const bas = Date.now();
      const t = setInterval(() => {
        if (!botlarMesgul().length || Date.now() - bas > KAPANIS_BEKLE_MS) { clearInterval(t); kapat(reason, exitCode); }
      }, 500);
      return;
    }
    kapat(reason, exitCode);
  }
  /** 73.6 (S12): temiz kapanış işareti — sonraki açılış "planlı" sayılır (öz denetimin günlük açılış sayacına girmez). */
  /*
   * 75.4 — S12 DÜZELTMESİ: SON_KAPANIS olustur düzeyinde. Eskiden server.js'in sonunda `const` (75.1'de baslat()'ta atanan `let`) idi;
   * açılıştaki tek çağrı (öz denetim acilisKaydet, lib/sunucu/saglikUclari.js — baslat()'tan ÖNCE) onu tanımlanmadan okuyup hatayı
   * kendi try/catch'inde yutuyordu → her açılış "planlı değil", son-kapanis.json hiç silinmiyordu (73.6 S12 işlevsizdi).
   * Yol her çağrıda yollar'dan sorulur (veri yeri ortamdan / veri-yeri.json'dan gelir).
   */
  const SON_KAPANIS = () => yollar.veri('son-kapanis.json');
  function sonKapanisPlanliMi(simdi = Date.now()) {
    let k = null;
    try { k = JSON.parse(fs.readFileSync(SON_KAPANIS(), 'utf8')); } catch { return false; }
    try { fs.unlinkSync(SON_KAPANIS()); } catch { /* */ }
    return !!k && [0, 75].includes(k.kod) && Number.isFinite(k.zaman) && simdi - k.zaman >= 0 && simdi - k.zaman < 30 * 60e3;
  }
  function kapat(reason, exitCode) {
    console.log(`\n⏹️  Kapatılıyor (${reason})...`);
    try { fs.writeFileSync(SON_KAPANIS(), JSON.stringify({ zaman: Date.now(), kod: exitCode, neden: String(reason).slice(0, 120) }), 'utf8'); } catch { /* */ }
    // 75.3 (3b): yönetici kararının dakikalık zamanlayıcısı kapanışta yoklayıcıyı yeniden açmasın (eş yokken zaten dokunmaz).
    try { ctx.makine.YONETICI.durdur(); } catch { /* makine modülü yok */ }
    try {
      ctx.telegramYoklayici.durdur();
      engine.stop();
      db.addLog('WARN', `Sunucu kapatılıyor: ${reason}`);
      db.flush();
      console.log('   Durum diske yazıldı.');
    } catch (err) {
      console.error('   Kapanış sırasında hata:', err.message);
    }

    server.close(() => process.exit(exitCode));
    // Bir bağlantı takılırsa süreci yine de bırak
    setTimeout(() => process.exit(exitCode), 3000).unref();
  }

  function baslat() {
    const { HOST, guvenlik, ARASTIRMA_MODU, APP_VERSION, evOkuma, BILDIRIM, ensureEngineRunning, telegramYoklayici } = ctx;
    const BILDIRIM_KURULUM = ctx.bildirimKurulum;
    // Start HTTP Server
    const PORT = process.env.PORT || 3000;
    // O1 (61.8): port doluysa (eski Pusula açık) açık mesaj + çıkış 2 — eskiden yakalanmayan hata Telegram'a "Bot çöktü" yolluyordu.
    server.on('error', (e) => {
      if (e && e.code === 'EADDRINUSE') {
        console.error(`⛔ Port ${PORT} kullanımda — başka bir Pusula zaten çalışıyor olabilir. Önce onu kapatın (masaüstü: "Pusula'yı durdur").`);
        try { db.addLog('ERROR', `Port ${PORT} kullanımda — ikinci sunucu açılmadı`); db.flush(); } catch { /* */ }
        process.exit(2);
      }
      throw e;
    });
    // 73.6 (S03): donma bekçisi — iş parçacığı kendi sağlık ucunu yoklar; 10 dk yanıt yoksa YALNIZ kendi PID'ini kapatır (denetleyici açar).
    donmaBekcisi = null;   // (olustur düzeyinde — shutdown okur)
    server.listen(PORT, HOST, () => {
      try { donmaBekcisi = require('../donmaBekcisi').baslat({ port: PORT, dosya: yollar.veri('donma.json') }); } catch (e) { console.error('donma bekçisi başlatılamadı:', e.message); }
      console.log(`====================================================`);
      console.log(`🧭 Pusula sunucusu çalışıyor: ${HOST}:${PORT}`);
      if (!guvenlik.yerel) console.log('🔒 Ağa açık dinleme: panel jetonu zorunlu (tarayıcıda giriş sayfası → oturum çerezi; betikte x-panel-token).');
      console.log(`🌐 Dashboard: http://${guvenlik.yerel ? 'localhost' : HOST}:${PORT}`);
      console.log(`====================================================`);
      db.addLog('INFO', `Sunucu port ${PORT} üzerinde başlatıldı.`);
      if (ARASTIRMA_MODU) console.log('🔬 ARAŞTIRMA MODU: Telegram kapalı, botlar başlamaz, bot/borsa/emir POST uçları kapalı.');
      else telegramYoklayici.baslat();
      // 73.5: bildirim üreticileri + sessiz saat özeti (dakikada bir; sessiz saat bitince bekleyenler TEK mesaj) — yalnız sunucu.
      if (BILDIRIM_KURULUM.bildirimUreticileri) {
        BILDIRIM_KURULUM.bildirimUreticileri.baslat();
        if (BILDIRIM_KURULUM.piyasaBildirim) BILDIRIM_KURULUM.piyasaBildirim.baslat();
        const sessizT = setInterval(() => { BILDIRIM.sessizBosalt({ telegram: (m) => (engine.telegram.enabled && engine.telegram.botToken && engine.telegram.chatId ? engine.telegram._gonderHam(m) : Promise.resolve({ ok: true })) }).catch(() => null); }, 60 * 1000);
        if (sessizT.unref) sessizT.unref();
      }
      // 73.5: araştırma kopyası sunucuya 10 dk'da bir "buradayım" der (Bildirimler › Makine sessiz). Yalnız sunucu bağlantısı kuruluysa.
      if (ARASTIRMA_MODU) {
        const nabiz = async () => {
          const a = evOkuma.ayar();
          if (!a) return;
          try { await fetch(`${a.adres}/api/makine/nabiz`, { headers: { 'x-panel-token': a.jeton, 'x-pusula-makine': require('os').hostname().slice(0, 40), 'x-pusula-surum': APP_VERSION }, signal: AbortSignal.timeout(10000), redirect: 'error' }); } catch { /* sunucu kapalı: sonraki tur */ }
        };
        const nabizT = setInterval(nabiz, 10 * 60 * 1000);
        if (nabizT.unref) nabizT.unref();
        setTimeout(() => nabiz(), 30 * 1000).unref();
      }
      
      // Preload historical candles for configured watchlist on boot.
      // 68.3 (PLAN-TASIMA K6/F5): YENİ veri düzeninde (kurulum programıyla kurulmuş boş kurulum) açılışta mum indirilmez — ilk açılışta
      // önceden yüklü fiyat/grafik yok, ihtiyaç olunca (bot çalışınca, grafik açılınca) indirilir. ESKİ düzen (bugünkü kurulumlar) aynen.
      if (ctx.config.watchlist && ctx.config.watchlist.length > 0 && yollar.bilgi().duzen !== 'yeni') {
        engine.exchange.preloadWatchlistCandles(ctx.config.watchlist, '1h', 500);
        engine.exchange.preloadWatchlistCandles(ctx.config.watchlist, '4h', 500);
      }

      // start() throws while the kill-switch is latched. Unguarded, that took the
      // whole process down on boot and left the dashboard unreachable — exactly
      // when the user needs it to reset the kill-switch.
      const boot = ensureEngineRunning();
      if (!boot.running) {
        db.addLog('ERROR', `Motor başlatılamadı: ${boot.error} — panelden Kill-Switch'i sıfırlayın.`);
        console.error(`⚠️  Motor başlatılamadı: ${boot.error}`);
        console.error('   Panelden "Kill-Switch Sıfırla" ile devam edebilirsiniz.');

        engine.telegram.notify('critical', 'Motor Başlatılamadı', [
          `<b>Sebep:</b> ${boot.error}`,
          'Sunucu ayakta ama botlar çalışmıyor. Panelden Kill-Switch sıfırlanmalı.'
        ], { key: 'bootfail', throttleMs: 30 * 60 * 1000 });
      } else {
        engine.telegram.notify('lifecycle', 'Bot Sunucusu Başlatıldı', [
          `<b>Çalışan bot:</b> ${engine.getBots().length}`,
          `<b>Mod:</b> ${(ctx.config.mode || 'paper').toUpperCase()}`,
          `<b>Port:</b> ${PORT}`
        ], { key: 'boot', throttleMs: 60 * 1000 });
      }
    });

    ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(sig => {
      process.on(sig, () => shutdown(sig));
    });

    // A rejected promise nobody awaited is usually a missed .catch on a network
    // call — log it, keep trading.
    process.on('unhandledRejection', (reason) => {
      const msg = reason instanceof Error ? reason.message : String(reason);
      console.error('⚠️  Yakalanmamış promise hatası:', msg);
      db.addLog('ERROR', `Yakalanmamış promise hatası: ${msg}`);

      engine.telegram.notify('error', 'Yakalanmamış Promise Hatası', [
        `<code>${msg}</code>`,
        'Bot çalışmaya devam ediyor, ancak loglar incelenmeli.'
      ], { key: 'unhandled:' + msg.slice(0, 40), throttleMs: 30 * 60 * 1000 });
    });

    // An uncaught exception leaves the process in an unknown state — persist what we
    // can, tell the supervisor to restart us, and exit.
    process.on('uncaughtException', (err) => {
      console.error('💥 Yakalanmamış hata:', err);
      try {
        db.addLog('ERROR', `KRİTİK: Yakalanmamış hata — ${err.message}`);
        engine.telegram.notify('critical', 'Bot Çöktü — Yeniden Başlatılıyor', [
          `<code>${err.message}</code>`,
          'Süreç güvenli şekilde kapatıldı. Süreç yöneticisi botu yeniden başlatacak.'
        ], { key: 'crash', throttleMs: 5 * 60 * 1000 });
      } catch (_) { /* bildirim başarısız olsa da kapanmaya devam */ }

      shutdown('uncaughtException', 1, { bekleme: false });
    });
  }

  return { shutdown, sonKapanisPlanliMi, baslat };
}

module.exports = { olustur };
