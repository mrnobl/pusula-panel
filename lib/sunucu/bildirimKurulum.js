/**
 * C1 (75.0, TASARIM-MAKINE-HESAP-BOT §3 parça 2) — server.js'ten taşındı, davranış AYNI. BİLDİRİM kurulumu, dört grup:
 *   merkez()      bildirim merkezi (lib/bildirimMerkezi.js — tür, kanal, şablon, sessiz saat; 74.2 ayar geçmişi) + Telegram'ın
 *                 geliştirme bilgisayarı engeli (67.5)                                   → { BILDIRIM, TELEGRAM_GELISTIRME_ENGELI }
 *   uclar()       bildirim merkezi yönlendiricisi (/api/bildirim*), 73.5 GET /api/makine/nabiz, rapor motoru (lib/rapor.js, /api/rapor*)
 *   ureticiler()  73.5 bildirim üreticileri (KAP bilançosu, makine sessiz, gölge özeti, anahtar sınaması, sert fiyat) + 73.9 piyasa
 *                 bildirimi + 73.7 BIST hafif fiyat — YALNIZ SUNUCU (araştırma kopyasında / geliştirme bilgisayarında kurulmaz)
 *   telegram()    Telegram komutları + 74.0 menü (YALNIZ OKUMA; tek yazma: 1 saat sessize al) + POST /api/telegram/test
 *                                                                                      → { telegramYoklayici }
 * Dört grup server.js'te ESKİ YERLERİNDE çağrılır — Express uç sırası ve kurulum sırası birebir aynı. `bildirimUreticileri` ve
 * `piyasaBildirim` bu modülün durumudur (null = kurulmadı); server.js dinleme anında okuyucularından okur.
 * ctx alanları KULLANIM ANINDA okunur (lib/sunucu/baglam.js): `config` → ctx.config; merkez() ikinci kanalı (ctx.ikinciKanal)
 * sonradan tanımlandığı için çağrı anında okur.
 */
'use strict';
const yollar = require('../yollar');
const fs = require('fs');
const db = require('../database');

function olustur(ctx) {
  let bildirimUreticileri = null;
  let piyasaBildirim = null;   // 73.9: piyasa takvimi + olay sonucu (lib/piyasaBaglami/bildirim.js) — yalnız sunucu

  function merkez() {
    const { kok, engine, ARASTIRMA_MODU, AYAR_GECMISI, ayarGecmisiLib } = ctx;
    // Bildirim merkezi (lib/bildirimMerkezi.js, PLAN-PANEL-2): Telegram'a giden her mesaj türüne ayrılır, kapalı tür gönderilmez,
    // her deneme kayda geçer. İlk açılışta eski config bayrakları (notifyTrades/Errors/Lifecycle) varsayılan.
    // 73.5: tür başına kanal (ntfy = 69.4 ikinci kanal, sır kasasındaki konu), şablon, sessiz saat; geliştirme bilgisayarında ntfy da gitmez.
    const BILDIRIM = require('../bildirimMerkezi').olustur({ kok: kok,
      varsayilan: () => ({ islem: engine.telegram.notifyTrades, hata: engine.telegram.notifyErrors, yasam: engine.telegram.notifyLifecycle }),
      ntfyFn: () => { const k = ctx.ikinciKanal(); return k.konu ? { konu: k.konu } : null; },
      engelFn: () => TELEGRAM_GELISTIRME_ENGELI || (ARASTIRMA_MODU ? 'araştırma modu' : null),
      // 73.7: alarm / uyarı mesajlarına Sorun merkezi adımları + bağlantı (adres: Ayarlar › Bildirimler › Panel adresi; yoksa 'Panel › Sorunlar').
      sorunBagi: { panelAdresi: () => (ctx.config.telegram && ctx.config.telegram.panelAdresi) || null },
      // 74.2 ayar geçmişi (etkin görünümün farkı; geçici sessiz de yazılır, geri alınmaz)
      degisiklik: (once, sonra) => AYAR_GECMISI.kaydet({ tur: 'bildirim', farklar: ayarGecmisiLib.farkBul(once, sonra) }) });
    engine.telegram.merkezBagla(BILDIRIM);
    // 67.5: geliştirme bilgisayarında (araştırma modu / data/makine.json / sunucu bağlantısı kurulu) Telegram yoklaması ve gönderimi
    // kapalı — sunucudaki yoklamayla 409 çakışması olmasın. TELEGRAM_GELISTIRME=1 açıkça açar. Sunucuda davranış değişmez.
    const TELEGRAM_GELISTIRME_ENGELI = require('../telegram').gelistirmeEngeli({ env: process.env, kok: kok, arastirma: ARASTIRMA_MODU });
    engine.telegram.gelistirmeEngeli = TELEGRAM_GELISTIRME_ENGELI;

    return { BILDIRIM, TELEGRAM_GELISTIRME_ENGELI };
  }

  function uclar() {
    const { app, kok, APP_VERSION, ARASTIRMA_MODU, BILDIRIM, portfoyBildirici, yapayZeka, BINDIRME_ADLAR, engine } = ctx;
    // Bildirim merkezi uçları: GET /api/bildirim (katalog + son gönderilenler + Telegram durumu), POST /api/bildirim/ayar { tur, acik }.
    // 73.5: + POST /api/bildirim/{tur,sessiz,uretici,onizle}; GET'e üretici durumu (makine nabızları, son KAP/fiyat/anahtar denetimi).
    app.use(require('../bildirimMerkezi').router(BILDIRIM, { durum: () => portfoyBildirici.durum(), ek: () => (bildirimUreticileri ? { ...bildirimUreticileri.durum(), takvim: piyasaBildirim ? piyasaBildirim.durum() : null, yapayZeka: yapayZeka.durum() } : { arastirma: ARASTIRMA_MODU }), log: (lv, msg) => db.addLog(lv, msg) }));
    /**
     * 73.5 MAKİNE NABZI: araştırma kopyası (sunucu bağlantısı kurulu) 10 dk'da bir GET /api/makine/nabiz — başlık x-pusula-makine (bilgisayar
     * adı), x-pusula-surum. Yalnız sunucuda ve jetonla gelen istekte (telefon / geliştirme kademesi) kaydedilir; yerel istek ve başlıksız
     * istek kayıt yazmaz. Yanıtta sır yok.
     */
    app.get('/api/makine/nabiz', (req, res) => {
      const ad = String(req.headers['x-pusula-makine'] || '');
      const kaydedildi = !!(bildirimUreticileri && ad && req.kademe && req.kademe !== 'yerel' && bildirimUreticileri.nabizKaydet(ad, { surum: req.headers['x-pusula-surum'], tur: 'arastirma' }));
      res.json({ success: true, kaydedildi, surum: APP_VERSION });
    });

    /*
     * RAPOR MOTORU (lib/rapor.js, PLAN-PANEL-2): her gün 09:00'dan sonra dünün günlük raporu; son biten haftanın, ayın ve (ocakta) yılın raporu (67.5)
     * (botlar: değer değişimi, işlemler, ücret · model emirleri · portföy botlarının tercihleri). Girdi sunucunun kendi uçlarından
     * (127.0.0.1); arşiv data/raporlar/; Telegram'a 📋 özeti (bildirim merkezi türü "rapor"). Araştırma kopyasında zamanlayıcı yok.
     * GET /api/rapor/liste · GET /api/rapor?tur=&bas= · POST /api/rapor/olustur { tur, gun, telegram }.
     */
    const RAPOR = require('../rapor').olusturucu({ kok: kok, port: process.env.PORT || 3000, log: (lv, msg) => db.addLog(lv, msg),
      botlar: () => BINDIRME_ADLAR.slice(),   // 74.5: yeni botlar da raporda (çağrı anında okunur)
      gonder: (metin) => engine.telegram.sendMessageDetailed(metin) });
    app.use(require('../rapor').router(RAPOR));
    if (!ARASTIRMA_MODU && process.env.RAPOR !== '0') RAPOR.baslat();

  }

  function ureticiler() {
    const { ARASTIRMA_MODU, TELEGRAM_GELISTIRME_ENGELI, BILDIRIM, engine, anahtarlar, piyasaBaglami } = ctx;
    /*
     * 73.5 BİLDİRİM ÜRETİCİLERİ (lib/bildirimUreticileri.js): bilanço (KAP), makine sessiz, gölge testler haftalık özeti, anahtar sınaması
     * (salt okuma, günde bir), sert fiyat hareketi. YALNIZ SUNUCU — araştırma kopyasında kurulmaz (Telegram yalnız sunucudan). Karar/emir yok.
     */
    function bistKodlari() {
      const s = new Set();
      try {   // Lydia (BIST M10) kâğıt hesabının açık pozisyonları
        const j = JSON.parse(fs.readFileSync(yollar.veri('tasarimci', 'kagit.json'), 'utf8'));
        for (const p of (((j.modeller || {})['m-bist-m10'] || {}).pozisyonlar || [])) if (p && p.s && Number(p.adet) > 0) s.add(String(p.s));
      } catch { /* kâğıt hesap yok */ }
      try {   // Portföyüm: TRY hisse varlıkları (adet > 0)
        const { D, muh } = require('../portfoyum/depo').yukle();
        for (const c of muh.ciftler.values()) {
          if (c.nakit || !(c.ana && c.ana.adet > 1e-9)) continue;
          const v = D.varliklar.get(c.varlik);
          if (v && v.sinif === 'hisse' && v.para === 'TRY') s.add(String(v.kod || v.sembol).replace(/\.IS$/i, ''));
        }
      } catch { /* Portföyüm yok */ }
      return [...s];
    }
    // Geliştirme bilgisayarında (TELEGRAM_GELISTIRME_ENGELI: data/makine.json, sunucu bağlantısı) da kurulmaz — öz testlerin açtığı sunucular dahil.
    if (!ARASTIRMA_MODU && !TELEGRAM_GELISTIRME_ENGELI) {
      bildirimUreticileri = require('../bildirimUreticileri').olustur({
        durumDosya: yollar.veri('bildirim-uretici.json'), merkez: BILDIRIM,
        gonder: (tur, parcalar, degiskenler) => engine.telegram.sendMessageDetailed(require('../bildirimMetinleri').varsayilanKur({ zaman: require('../bildirimMetinleri').kisaZaman(), ...parcalar }), { tur, parcalar, degiskenler }),
        log: (lv, msg) => db.addLog(lv, msg),
        kaynaklar: { bistKodlari, golgeSatirlari: () => require('../golgeOzet').satirlar(), anahtarSina: () => anahtarlar.otoSina(),
          // D2: pazartesi tek mesaj = haftalık karne (gölge satırları içinde) — lib/sunucu/olayUclari.js karneTelegram
          karne: () => ctx.olayAkisi.karneTelegram() },
      });
      piyasaBildirim = require('../piyasaBaglami/bildirim').olustur({
        pb: piyasaBaglami, durumDosya: yollar.veri('piyasa-bildirim.json'), merkez: BILDIRIM, log: (lv, msg) => db.addLog(lv, msg),
        gonder: (tur, parcalar, degiskenler) => engine.telegram.sendMessageDetailed(require('../bildirimMetinleri').varsayilanKur({ zaman: require('../bildirimMetinleri').kisaZaman(), ...parcalar }), { tur, parcalar, degiskenler }),
      });
    }
    /*
     * 73.7 BIST HAFİF FİYAT (lib/bistHafif.js): bilanço bildiriminin BIST 100 evreni sunucuda da kurulsun diye günde bir, aday kümesi
     * (~160 kod) × son ~100 gün, İş Yatırım HisseTekil, istekler arası 4 sn; karar penceresinde (UTC 23:50–01:30) çalışmaz, 429/5xx'te
     * 6 saat bekler. Yalnız sunucu (araştırma kopyasında ve geliştirme bilgisayarında kurulmaz); BIST_HAFIF=0 kapatır. Karar / emir yok.
     */
    if (bildirimUreticileri && process.env.BIST_HAFIF !== '0') {
      const bistHafif = require('../bistHafif').olustur({ dizin: yollar.veri('bist-hafif'), log: (lv, msg) => db.addLog(lv, msg) });
      const bistTik = () => { bistHafif.tik().catch(e => db.addLog('WARN', `[BIST] hafif fiyat güncellemesi: ${e.message}`)); };
      setTimeout(bistTik, 15 * 60 * 1000).unref();
      setInterval(bistTik, 30 * 60 * 1000).unref();
    }

  }

  function telegram() {
    const { app, kok, engine, APP_VERSION, BINDIRME_ADLAR, bindirmeler, GOLGE_DOSYA, sorunlarHesapla, bilinenSirlar, portfoyum, demoKabulOzet,
      piyasaBaglami, BILDIRIM, AYAR_GECMISI, TELEGRAM_GELISTIRME_ENGELI, portfoyBildirici, saglikBot, saglikBotlar, saglikSunucu, SORUN } = ctx;
    const isletim = require('../live/isletim');   // server.js bu noktada yüklemiş (modül merkez() için erken yüklenir — yükleme sırası değişmesin)
    const guncelleme = require('../guncelleme');
    /**
     * TELEGRAM KOMUTLARI (lib/telegramKomut.js) — YALNIZ OKUMA: /durum /pozisyonlar /ozet /saglik /yardim … + 74.0 /menu (düğmeli).
     * Emir veren / botu başlatan-durduran komut BİLİNÇLİ OLARAK YOK. Yalnız Ayarlar'daki chat id'den gelen
     * mesaja cevap verilir. Telegram kapalıyken yoklama ağ isteği yapmaz (30 sn'de bir ayara bakar).
     */
    const { TelegramYoklayici } = require('../telegram');
    const { komutIsleyici } = require('../telegramKomut');
    const SUNUCU_BASLANGIC = Date.now();
    /** /ileri ve menü "İleri test" (denetim A-20): ileri test ara durumu — /api/ileri/kabul ile aynı kaynaklar, hüküm yazmaz. */
    function ileriBilgisi() {
      const HD = require('../ileri/hucumDengeEsikleri');
      const ilk = '2026-10-07';
      return { demo: demoKabulOzet.ozet(), bollingerHukum: '2027-10-07 (düşüş olayı yoksa 2028-10-07)',
        kontrol: HD.UFUKLAR.map(g => ({ gun: g, tarih: new Date(Date.parse(ilk + 'T00:00:00Z') + g * 864e5).toISOString().slice(0, 10) })) };
    }
    /**
     * 74.0 TELEGRAM MENÜSÜ (lib/telegramMenu.js): /menu tek mesaj + düğmeler (callback_query → aynı mesaj düzenlenir). YALNIZ OKUR;
     * yazma işi için düğme paneli açar (Ayarlar › Bildirimler › Panel adresi + rota), işlem orada acil PIN ile. TEK İSTİSNA: "1 saat
     * sessize al" → BILDIRIM.geciciSessiz (kritik olmayanlar 60 dk bekler). Tutarlar gizli (yalnız yüzde). Sağlayıcılar salt okur.
     */
    let telegramKomutIsle = null;
    const TG_MENU = require('../telegramMenu').olustur({
      anahtarFn: () => engine.telegram.botToken,
      panelAdresi: () => (ctx.config.telegram && ctx.config.telegram.panelAdresi) || null,
      surum: APP_VERSION, baslangic: SUNUCU_BASLANGIC,
      botlar: () => BINDIRME_ADLAR.map(ad => bindirmeler[ad]).filter(Boolean),
      golgeHarita: () => isletim.golgeOku(GOLGE_DOSYA),
      komutMetni: (k) => (telegramKomutIsle ? telegramKomutIsle(k) : Promise.resolve('Komut işleyici hazır değil.')),
      sorunlar: () => sorunlarHesapla(),
      bilinenler: () => bilinenSirlar(),
      portfoy: () => {
        let pm = null;
        try { const o = portfoyum.ozetKur(); if (o.seri && o.seri.length) pm = o.getiri.USD; } catch { /* Portföyüm yok */ }
        const modeller = [];
        try {
          const DF = require('../tasarimci/defter'), MD = require('../tasarimci/model'), BA = require('../botAdlari');
          const gs = DF.oku('gunluk').satirlar;
          for (const m of MD.sabitleme().modeller) {
            const st = gs.filter(s => s.model === m.id);
            const met = MD.metrik(st);
            if (!met.gun) continue;
            const tl = m.id === 'm-bist-m10' ? MD.metrik(st, 'endeksTl') : null;
            modeller.push({ ad: BA.ad(m.id) || m.ad, toplam: met.toplam, para: 'USD', bas: met.bas, toplamTl: tl && tl.gun ? tl.toplam : null });
          }
        } catch { /* model defteri yok */ }
        return { portfoyum: pm, modeller };
      },
      golge: () => require('../golgeOzet').satirlar(),
      ileri: () => ileriBilgisi(),
      piyasa: () => ({ hafta: piyasaBaglami.hafta(), kartlar: piyasaBaglami.ozet().kartlar }),
      bilanco: () => { const d = bildirimUreticileri ? bildirimUreticileri.durum() : null; return d && d.bilanco ? d.bilanco.sonOzet : null; },
      guncelleme: () => guncelleme.durumOku(kok),
      makineler: () => (bildirimUreticileri ? bildirimUreticileri.durum().makine : null),
      bildirim: () => { const v = BILDIRIM.gorunum(0); return { sessiz: v.sessiz, gecici: v.sessiz.gecici, turler: v.katalog.map(t => ({ ad: t.ad, acik: t.acik })) }; },
      // TEK YAZMA İSTİSNASI (kullanıcı kararı 2026-10-24): kritik olmayan bildirimler 60 dk bekler; kritikler asla susmaz.
      sessizAl: (dk) => { const r = AYAR_GECMISI.baglamla({ kaynak: 'telegram', uc: 'Telegram menüsü (1 saat sessize al)' }, () => BILDIRIM.geciciSessiz(dk)); db.addLog('INFO', `🔕 Telegram'dan ${dk} dk sessize alındı — kritik olmayan bildirimler ${new Date(r.bitis).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })}'e kadar bekler`); return r; },
    });
    // Alarm / uyarı mesajlarının düğmeleri (Ayrıntı · Panelde çöz ↗ · 1 saat sessize al) — imza anahtarı bot jetonundan türetilir.
    engine.telegram.klavyeFn = (bag) => TG_MENU.bildirimKlavyesi(bag);
    const telegramYoklayici = new TelegramYoklayici({
      notifierFn: () => engine.telegram,
      offsetDosya: yollar.veri('telegram-offset.json'),
      kaydet: (sv, m) => db.addLog(sv, `[TELEGRAM] ${m}`),
      // 75.3 (3b) YÖNETİCİ MAKİNE kancası (lib/makine/yonetici.js): eşlenmiş makine varken yalnız yönetici (ya da geçici devralan) yoklar.
      // Eş yokken kanca hep null döner → bugünkü davranış birebir; kanca okunamazsa da null (dinle).
      engel: () => TELEGRAM_GELISTIRME_ENGELI || (() => { try { return ctx.makine ? ctx.makine.telegramEngeli() : null; } catch { return null; } })(),
      menu: TG_MENU,
      isleyici: telegramKomutIsle = komutIsleyici({
        menu: TG_MENU,
        surum: APP_VERSION, baslangic: SUNUCU_BASLANGIC,
        portfoyBotlari: () => BINDIRME_ADLAR.map(ad => bindirmeler[ad]),
        bildirici: portfoyBildirici,
        get yoklayici() { return telegramYoklayici; },
        saglik: { bot: saglikBot, botlar: saglikBotlar, sunucu: saglikSunucu },   // 68.8: bot başına check
        // 73.7 /teshis: Sorun merkezi kartları (lib/sorunlar.js) — etkin sorunlar + ilk 2 adım, sır temizlenmiş.
        teshis: () => SORUN.telegramTeshis(sorunlarHesapla(), { panelAdresi: (ctx.config.telegram && ctx.config.telegram.panelAdresi) || null, bilinenler: bilinenSirlar() }),
        // /ileri (denetim A-20): ileri test ara durumu — /api/ileri/kabul ile aynı kaynaklar, hüküm yazmaz.
        ileri: () => ileriBilgisi(),
      }),
    });

    // Test Telegram Endpoint
    app.post('/api/telegram/test', async (req, res) => {
      try {
        const result = await engine.telegram.sendMessageDetailed(
          '<b>🔔 Pusula Test Bildirimi</b>\n\nTelegram entegrasyonu başarıyla çalışıyor! 🚀'
        );

        if (result.ok) {
          db.addLog('SUCCESS', 'Telegram test mesajı başarıyla gönderildi.');
          return res.json({ success: true, message: 'Test mesajı gönderildi' });
        }

        db.addLog('WARN', `Telegram test mesajı gönderilemedi: ${result.error}`);
        res.status(400).json({ success: false, error: result.error });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    return { telegramYoklayici };
  }

  return {
    merkez, uclar, ureticiler, telegram,
    get bildirimUreticileri() { return bildirimUreticileri; },
    get piyasaBildirim() { return piyasaBildirim; },
  };
}

module.exports = { olustur };
