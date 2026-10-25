/**
 * C1 (75.0, TASARIM-MAKINE-HESAP-BOT §3 parça 2) — server.js'ten taşındı, davranış AYNI.
 * AYAR UÇLARI:
 *   GET  /api/config    panele giden ayar (sırlar çıkarılmış — server.js disariConfig)
 *   POST /api/secrets   sırlar YALNIZ yazılır (sirlariUygula — Ayarlar › Anahtarlar da aynı yolu kullanır, lib/anahtarlar.js)
 *   POST /api/config    configUygula (74.2: ayar geçmişinin "Geri al"ı da aynı yoldan; 74.7: bindirme yaması bot kaydına alan alan)
 * `config` server.js'te `let` → her yerde ctx.config; configUygula'nın atamasıyla ctx.configYaz. Sırların kilit durumu ctx.ayar'dan.
 *
 * Bağlanma: server.js `AYAR_UCLARI = require('./lib/sunucu/ayarUclari').kur(ctx)` — eski yerinde (Express uç sırası aynı);
 * dönen { sirlariUygula, configUygula } ctx ile Anahtarlar ve ayar geçmişine verilir.
 */
'use strict';
const db = require('../database');
const guvenlikKur = require('../guvenlik');
const bindirmeArastirma = require('../research/bindirme');
const botKayitLib = require('../botKayit');
const VeriKalitesi = require('../live/veriKalitesi');
const { urlGecerli: saglikUrlGecerli, botUrl: botSaglikUrl } = require('../saglikSinyali');

function kur(ctx) {
  const { app, engine, broadcast, disariConfig, BINDIRME_ADLAR, botEtiketi, saglikBotlar, saglikSunucu, bindirmeAyar, AYAR_GECMISI } = ctx;
  const ayar = ctx.ayar;
  const { SECRET_KEYS, SAGLIK_URL_KEYS, botSaglikSirlariniYukle, loadSecrets, saveSecrets, isPlainObject, mergeConfig, saveConfig } = ayar;
  // Config GET & POST
  app.get('/api/config', (req, res) => {
    res.json(disariConfig());
  });

  /**
   * SIRLAR YALNIZ YAZILIR. Okuma ucu yok — panel yalnızca "tanımlı mı"
   * bilgisini görür (`config.sirlar`). Boş değer anahtarı SİLER.
   */
  /**
   * 73.0: /api/secrets çekirdeği — Ayarlar › Anahtarlar (lib/anahtarlar.js) da AYNI yolu kullanır (iki yer tutarlı kalsın).
   * Döndürür { durum, govde } (yanıtta sır yok). Sırlar kilitli/bozuksa yazmaz, 409 döner.
   */
  function sirlariUygula(govde0) {
    const govde = govde0 && typeof govde0 === 'object' ? govde0 : {};
    if (ayar.SIRLAR_KILITLI) return { durum: 409, govde: { success: false, kilitli: true, error: `Sırlar yazılmadı: ${ayar.SIRLAR_KILITLI}` } };
    const gizli = loadSecrets();
    const red = (durum, error) => ({ durum, govde: { success: false, error } });
    // Önce HEPSİ doğrulanır: biri geçersizse hiçbiri yazılmaz (yarım kayıt olmasın).
    for (const k of SECRET_KEYS) {
      if (!(k in govde)) continue;
      const v = typeof govde[k] === 'string' ? govde[k].trim() : '';
      if (!v) continue;
      if (SAGLIK_URL_KEYS.includes(k)) {
        if (!saglikUrlGecerli(v)) return red(400, `${k} geçersiz — healthchecks ping URL'sini olduğu gibi yapıştırın (https://hc-ping.com/...)`);
      } else if (!/^[A-Za-z0-9]{16,128}$/.test(v)) {
        return red(400, `${k} biçimi geçersiz (16–128 harf/rakam)`);
      }
    }
    // 68.8: bot başına sağlık adresi { botSaglik: { denge: url | '' } } — Hücum'unki healthchecksUrl (geri uyum).
    const botGovde = govde.botSaglik && typeof govde.botSaglik === 'object' && !Array.isArray(govde.botSaglik) ? govde.botSaglik : null;
    if (botGovde) {
      for (const [ad, v] of Object.entries(botGovde)) {
        if (!BINDIRME_ADLAR.includes(ad) || ad === 'hucum') return red(400, `botSaglik.${ad}: bilinmeyen bot (Kairos'un adresi healthchecksUrl alanında)`);
        const u = typeof v === 'string' ? v.trim() : '';
        if (u && !saglikUrlGecerli(u)) return red(400, `${botEtiketi(ad)} ping URL'si geçersiz — healthchecks ping URL'sini olduğu gibi yapıştırın (https://hc-ping.com/...)`);
      }
    }
    {
      // Kayıttan SONRAKİ adresler birbirinden farklı olmalı: her bot ve sunucu kalp atışı AYRI check (aynı URL bir botun durmasını gizler).
      const yeni = (k, eski) => (k in govde ? (typeof govde[k] === 'string' ? govde[k].trim() : '') : eski);
      const sonra = [[bindirmeArastirma.STRATEJILER.hucum.ad, yeni('healthchecksUrl', ctx.config.healthchecksUrl || '')], ['sunucu kalp atışı', yeni('healthchecksSunucuUrl', ctx.config.healthchecksSunucuUrl || '')],
        ...BINDIRME_ADLAR.filter(a => a !== 'hucum').map(a => [botEtiketi(a), botGovde && a in botGovde ? (typeof botGovde[a] === 'string' ? botGovde[a].trim() : '') : botSaglikUrl(ctx.config, a)])].filter(([, u]) => u);
      for (let i = 0; i < sonra.length; i++) for (let j = i + 1; j < sonra.length; j++) {
        if (sonra[i][1] === sonra[j][1]) return red(400, `${sonra[i][0]} ile ${sonra[j][0]} aynı ping URL'si olamaz — her bot (ve sunucu kalp atışı) healthchecks.io'da ayrı bir check olmalı; aynı adres bir botun durmasını gizler.`);
      }
    }
    const degisen = [];
    const bellek = [];   // 73.0: bellekteki config diske yazıldıktan SONRA değişir (yazılamazsa bellek de eski kalır)
    for (const k of SECRET_KEYS) {
      if (!(k in govde)) continue;
      const v = typeof govde[k] === 'string' ? govde[k].trim() : '';
      if (v) gizli[k] = v; else delete gizli[k];
      bellek.push(() => { ctx.config[k] = v; });
      degisen.push(k);
    }
    if (botGovde) {
      for (const [ad, v] of Object.entries(botGovde)) {
        const u = typeof v === 'string' ? v.trim() : '';
        const bs = { ...(gizli.bindirmeSaglik && typeof gizli.bindirmeSaglik === 'object' ? gizli.bindirmeSaglik : {}) };
        if (u) bs[ad] = u; else delete bs[ad];
        if (Object.keys(bs).length) gizli.bindirmeSaglik = bs; else delete gizli.bindirmeSaglik;
        bellek.push(() => {
          const onceki = { ...(((ctx.config.bindirme || {})[ad]) || {}) };
          if (u) onceki.healthchecksUrl = u; else delete onceki.healthchecksUrl;
          ctx.config.bindirme = { ...(ctx.config.bindirme || {}), [ad]: onceki };
        });
        degisen.push(`botSaglik.${ad}`);
      }
    }
    const sirOnce = loadSecrets();
    try { saveSecrets(gizli); } catch (e) { return red(409, e.message); }
    for (const f of bellek) f();
    // 74.2 ayar geçmişi: yalnız hangi sırrın değiştiği (değer "•••" / boş)
    try {
      const farklar = degisen.map(k => { const ad = k.startsWith('botSaglik.') ? k.slice(10) : null;
        const e = ad ? (sirOnce.bindirmeSaglik || {})[ad] : sirOnce[k], y = ad ? (gizli.bindirmeSaglik || {})[ad] : gizli[k];
        return { yol: ad ? `bindirme.${ad}.healthchecksUrl` : k, eski: e || '', yeni: y || '' }; }).filter(x => x.eski !== x.yeni);
      if (farklar.length) AYAR_GECMISI.kaydet({ tur: 'anahtar', farklar });
    } catch (e) { console.error('ayar geçmişi:', e.message); }
    engine.updateConfig(ctx.config);
    // Değer DEĞİL yalnız hangi alanın değiştiği loglanır.
    const saglikDegisti = degisen.some(k => SAGLIK_URL_KEYS.includes(k) || k.startsWith('botSaglik.'));
    const anahtarDegisti = degisen.some(k => !SAGLIK_URL_KEYS.includes(k) && !k.startsWith('botSaglik.'));
    if (anahtarDegisti) db.addLog('INFO', 'Borsa API anahtarları güncellendi.');
    if (saglikDegisti) db.addLog('INFO', `Sağlık sinyali (healthchecks) ayarı güncellendi: ${BINDIRME_ADLAR.map(a => `${botEtiketi(a)} ${saglikBotlar[a].ayarli() ? 'ayarlı' : 'yok'}`).join(' · ')} · sunucu ${saglikSunucu.ayarli() ? 'ayarlı' : 'yok'}.`);
    return { durum: 200, govde: { success: true, sirlar: disariConfig().sirlar, degisen } };
  }

  app.post('/api/secrets', (req, res) => { const r = sirlariUygula(req.body || {}); res.status(r.durum).json(r.govde); });

  /** 73.7: Telegram mesajlarındaki Sorunlar bağlantısının adresi (ör. https://sunucu.ağ.ts.net) — yalnız http(s), boşluksuz; boş = "Panel › Sorunlar". Hata metni | null. */
  /**
   * 2026-10-24: tarayıcının parola doldurması jeton kutusuna başka bir parola yazınca bu değer jeton diye kaydediliyor, Telegram duruyordu.
   * Biçimi tutmayan jeton REDDEDİLİR; kayıtlı jeton değişmez. Boş jeton = "değişmedi".
   */
  function telegramJetonHatasi(govde) {
    if (!(govde && govde.telegram) || guvenlikKur.telegramJetonGecerli(govde.telegram.botToken)) return null;
    return 'Telegram bot jetonu biçimi hatalı (BotFather’ın verdiği "123456789:AA…" metni olmalı). Kayıtlı jeton DEĞİŞMEDİ. Jeton kutusunu boş bırakırsanız kayıtlı jeton korunur.';
  }

  function panelAdresiYama(govde) {
    if (!(govde && govde.telegram && 'panelAdresi' in govde.telegram)) return null;
    const a = String(govde.telegram.panelAdresi == null ? '' : govde.telegram.panelAdresi).trim().replace(/\/+$/, '');
    if (a && !/^https?:\/\/[^\s<>"'`]{3,200}$/.test(a)) return 'Panel adresi http:// ya da https:// ile başlamalı, boşluk içermemeli (ör. https://sunucu.agadi.ts.net).';
    govde.telegram = { ...govde.telegram, panelAdresi: a };
    return null;
  }
  /** /api/config çekirdeği — 74.2: ayar geçmişinin "Geri al"ı da AYNI yoldan (chat id yaması, panel adresi, jeton biçimi, yamaTemizle). */
  function configUygula(govde0) {
    // Maskeli ya da boş chat id geri gelirse (panel maskeli gösterir) kayıtlı değer korunur (Ö18 / A-04).
    const govde = govde0 && govde0.telegram ? { ...govde0, telegram: guvenlikKur.chatIdYamaTemizle(govde0.telegram) } : govde0;
    const yHata = panelAdresiYama(govde) || telegramJetonHatasi(govde); if (yHata) return { durum: 400, govde: { success: false, error: yHata } };
    const temiz = guvenlikKur.yamaTemizle(govde, SECRET_KEYS);
    // 74.7 TEK KAYNAK: yamanın bindirme bölümü config'e BÜTÜN OLARAK yazılmaz. Etkin kaydı olan Kairos/Tao alanları KAYDA (alan alan;
    // mod / canliSermayeTavani / sağlık adresi yamaTemizle'de zaten düştü), diğer adlar config.bindirme'ye ad ad birleştirilir
    // (eskiden bütün bölüm değişiyordu: Tao'nun ve Kairos'un modu kâğıda düşebilirdi). Önce hepsi doğrulanır; biri tutmazsa hiçbir şey yazılmaz.
    let botYama = [];
    if (temiz && temiz.bindirme !== undefined) {
      const bolum = temiz.bindirme;
      delete temiz.bindirme;
      if (!isPlainObject(bolum)) return { durum: 400, govde: { success: false, error: 'bindirme bölümü nesne olmalı' } };
      const kalan = {};
      for (const [ad, v] of Object.entries(bolum)) {
        if (!isPlainObject(v)) return { durum: 400, govde: { success: false, error: `bindirme.${ad} nesne olmalı` } };
        if (ctx.BOT_KAYIT && ctx.BOT_KAYIT.etkinKayit(ad)) botYama.push([ad, v]); else kalan[ad] = v;
      }
      try {
        for (const [ad, v] of botYama) {
          const simdiki = bindirmeAyar(ad);
          // Kairos demo kabulü (2026-12-09'a kadar): Kairos demo sermaye sınırı bu yoldan da değişmez (POST /api/botlar/:k/sermaye ile aynı kural)
          if (ad === 'hucum' && 'demoSermayeTavani' in v && !botKayitLib.derinEsit(v.demoSermayeTavani, simdiki.demoSermayeTavani) && Date.now() < VeriKalitesi.KORUMA_BITIS) {
            return { durum: 409, govde: { success: false, error: `Kairos demo kabulü ${new Date(VeriKalitesi.KORUMA_BITIS).toISOString().slice(0, 10)} sonuna kadar sürüyor — Kairos'un demo sermaye sınırı bu süre içinde değişmez.` } };
          }
          ctx.BOT_KAYIT.ayarHazirla(ad, { ...botKayitLib.sirsiz(simdiki), ...v });   // yalnız doğrulama
        }
      } catch (e) { return { durum: e.kod === 409 ? 409 : 400, govde: { success: false, error: e.message } }; }
      if (Object.keys(kalan).length) {
        const b0 = isPlainObject(ctx.config.bindirme) ? ctx.config.bindirme : {};
        temiz.bindirme = Object.fromEntries([...Object.entries(b0), ...Object.entries(kalan).map(([ad, v]) => [ad, { ...(isPlainObject(b0[ad]) ? b0[ad] : {}), ...v }])]);
      }
    }
    ctx.configYaz(mergeConfig(ctx.config, temiz));
    botSaglikSirlariniYukle(ctx.config, loadSecrets());   // 68.8: yama bindirme bölümünü değiştirse de bot sağlık adresleri (sır) bellekte kalır
    try {
      for (const [ad, v] of botYama) ctx.BOT_KAYIT.ayarYaz(ad, { ...botKayitLib.sirsiz(bindirmeAyar(ad)), ...v }, 'POST /api/config', { once: () => saveConfig(ctx.config) });
    } catch (e) { return { durum: e.kod === 409 ? 409 : e.kod === 400 ? 400 : 500, govde: { success: false, error: e.message } }; }
    saveConfig(ctx.config);
    engine.updateConfig(ctx.config);
    db.addLog('INFO', 'Sistem ve strateji parametreleri güncellendi.');
    broadcast('CONFIG_UPDATED', disariConfig());
    return { durum: 200, govde: { success: true, config: disariConfig() } };
  }
  app.post('/api/config', (req, res) => { const r = configUygula(req.body); res.status(r.durum).json(r.govde); });

  return { sirlariUygula, configUygula };
}

module.exports = { kur };
