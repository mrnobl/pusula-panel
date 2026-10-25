'use strict';
/**
 * A4 — SERMAYE DAĞITIMI + ONAYLI ALT HESAPLAR ARASI AKTARIM UÇLARI (TASARIM-MAKINE-HESAP-BOT §8.2; hizmet lib/aktarim/hizmet.js,
 * saf dağıtım lib/sermayeDagitimi.js; panel Botlar › Sermaye dağıtımı — public/js/pages/sermaye.js, rota #/sermaye).
 * ═══════════════════════════════════════════════════════════════════════════
 *   GET  /api/sermaye/dagitim            hedef paylar, sapma + öneri, kapı (prova / canlı hesap), taraflar, bugünkü tavan, son aktarımlar
 *                                        (her kademe okur; alt hesap adresi ve anahtar YOK)
 *   POST /api/sermaye/dagitim/ayar       { hedefler, bant, tekTavan, gunlukTavan, anaHesap?, pin, onay: true } — acil PIN
 *   POST /api/sermaye/aktar/onizle       { kip, kaynak, hedef, tutar } — yan etkisiz önizleme (1. aşama)
 *   POST /api/sermaye/aktar              { kip, kaynak, hedef, tutar, parmak, pin, onay: 'AKTAR' } — 2. aşama; acil PIN + onay metni
 *   POST /api/sermaye/aktar/sorgula      { id } — belirsiz aktarımın borsadan sorgusu (salt okuma; tekrar YOK)
 * YAZMALAR YALNIZ SUNUCU BİLGİSAYARINDAKİ PANELDEN: telefon ve geliştirme kademesi 403 (beyaz listelerde YOK), araştırma kopyası 409
 * (+ server.js ARASTIRMA_KAPALI "sermaye"). Canlı hesap kapısı (aktarim-kapisi.json) BU UÇLARDAN AÇILAMAZ — yalnız `npm run aktarim-kapisi`.
 * `config.sermayeDagitimi` genel ayar yamasıyla (/api/config) yazılamaz (lib/guvenlik.js PANELDEN_YAZILMAZ) ve ayar geçmişinden geri
 * alınamaz (lib/ayarGecmisi.js CONFIG_OZEL_UST) — yalnız bu ekran, PIN'le.
 */
const fs = require('fs');
const yollar = require('../yollar');
const SD = require('../sermayeDagitimi');
const HZ = require('../aktarim/hizmet');

function kur(ctx) {
  const { app, ARASTIRMA_MODU } = ctx;
  const db = require('../database');
  const log = (lv, msg) => { try { db.addLog(lv, msg); } catch { console.log(msg); } };
  const anahtarlarLib = require('../anahtarlar');
  const botKayitLib = require('../botKayit');
  const VK = require('../live/veriKalitesi');
  const borsalar = require('../live/borsalar');
  const sirlar = () => { try { return ctx.ayar.loadSecrets() || {}; } catch { return {}; } };

  /** Hesap (SIR YOK): { id, borsa, tur, altHesap }. Kairos'un sabit satırlarında alt hesap adresi tutulmaz. */
  function hesap(id) {
    if (anahtarlarLib.SABIT[id]) return { id, borsa: 'binance', tur: anahtarlarLib.SABIT[id].tur, altHesap: null, sabit: true };
    const h = (sirlar().borsaHesaplari || {})[id];
    if (!h || typeof h !== 'object') return null;
    return { id, borsa: h.borsa || null, tur: h.tur || null, altHesap: typeof h.altHesap === 'string' && h.altHesap.trim() ? h.altHesap.trim() : null, sabit: false };
  }
  /** Canlı hesaplar (ana hesabın işlem hesabı seçimi için). */
  function canliHesaplar() {
    const l = Object.keys(anahtarlarLib.SABIT).filter(id => anahtarlarLib.SABIT[id].tur === 'canli');
    for (const [id, h] of Object.entries(sirlar().borsaHesaplari || {})) if (h && h.tur === 'canli' && /^[a-z0-9][a-z0-9-]{1,31}$/.test(id)) l.push(id);
    return l;
  }
  /** Aktarım anahtarı: Anahtarlar'daki ilk "aktarım" türü hesap (kimlik sırasıyla). Sır yalnız hizmetin içinde kalır. */
  function aktarimHesabi() {
    const hs = sirlar().borsaHesaplari || {};
    const id = Object.keys(hs).sort().find(k => hs[k] && hs[k].tur === 'aktarim' && hs[k].apiKey && hs[k].apiSecret);
    if (!id) return null;
    const h = hs[id];
    const ss = h.sonSinama && typeof h.sonSinama === 'object' ? { zaman: h.sonSinama.zaman || null, ok: !!h.sonSinama.ok, cekmeIzni: h.sonSinama.cekmeIzni === true ? true : h.sonSinama.cekmeIzni === false ? false : null } : null;
    return { id, ad: String(h.ad || id).slice(0, 40), borsa: h.borsa || 'binance', anahtar: { apiKey: h.apiKey, apiSecret: h.apiSecret, parola: h.parola || '' }, sonSinama: ss };
  }
  function botlar() {
    const l = [];
    for (const ad of ctx.BINDIRME_ADLAR.slice()) {
      const b = ctx.bindirmeler[ad];
      if (!b || !b.bot) continue;
      const bot = b.bot;
      let hesapId = null, borsa = 'binance', pa = null;
      try { hesapId = ctx.botHesapId(b); } catch { hesapId = null; }
      try { borsa = botKayitLib.borsaKimligi(ctx.BOT_KAYIT ? ctx.BOT_KAYIT.kayit(ad) : null); } catch { borsa = 'binance'; }
      try { pa = typeof bot.paraAkisiOzet === 'function' ? bot.paraAkisiOzet() : null; } catch { pa = null; }
      const oz = bot.durum ? +bot.durum.sonOzsermaye : NaN;
      l.push({ kimlik: ad, ad: bot.adGorunen || ad, mod: b.mod, btcAyak: bot.ayar ? bot.ayar.btcAyak : null, hesapId, borsa,
        ozsermaye: Number.isFinite(oz) ? oz : null, calisma: !!bot._calisma, calisiyor: !!(bot.durum && bot.durum.calisiyor),
        dokunulmaz: VK.VeriKapisi.dokunulmaz(b.mod), paraAkisi: pa,
        sermayeKaydi: (t, not, simdi) => bot.sermayeDegisikligi(t, not, { simdi, onay: 'KAYIT' }),
        kapi: () => (ctx.botYonetimi && typeof ctx.botYonetimi.canliKapiDurum === 'function' ? ctx.botYonetimi.canliKapiDurum(ad) : { izin: false, eksikler: [{ metin: 'kapı okunamadı' }] }) });
    }
    return l;
  }

  const HIZMET = HZ.olustur({
    dizin: yollar.veri('live'), log, arastirma: ARASTIRMA_MODU,
    ayar: () => (ctx.config && ctx.config.sermayeDagitimi) || null,
    botlar, hesap, aktarimHesabi,
    borsaHazir: (k) => { const b = borsalar.bul(k); return !!(b && b.hazir === true); },
    bildir: ARASTIRMA_MODU ? null : (tur, baslik, satirlar, s) => { try { return ctx.portfoyBildirici.gonder(tur, baslik, satirlar, s); } catch { return null; } },
    ayarGecmisi: (f) => ctx.AYAR_GECMISI.kaydet({ tur: 'config', farklar: [f], uc: 'POST /api/sermaye/aktar' }),
  });

  const yalnizYerel = (req, res) => {
    if ((req.kademe || 'yerel') !== 'yerel') { res.status(403).json({ success: false, error: 'Sermaye dağıtımı ve aktarım yalnız sunucu bilgisayarındaki panelden yapılır (telefon izler, geliştirme bilgisayarı yazamaz).' }); return false; }
    if (ARASTIRMA_MODU) { res.status(409).json({ success: false, error: 'Bu bilgisayar araştırma kopyası — sermaye dağıtımı ve aktarım sunucuda yapılır.' }); return false; }
    return true;
  };
  /** Acil PIN (anahtarlar.js deseni: yanlış 400, tanımsız 428, kilit 429). null = geçti. */
  function pinKapisi(g) {
    const r = ctx.acilPin.pinDogrula(String(g.pin == null ? '' : g.pin).trim());
    if (r.ok) return null;
    if (r.tanimli === false) return { durum: 428, govde: { success: false, pinTanimsiz: true, error: 'Acil PIN bu bilgisayarda tanımlı değil — önce bilgisayar başında `npm run acil-pin` ile PIN belirleyin.' } };
    return { durum: r.durum === 429 ? 429 : 400, govde: { success: false, pinHatali: true, error: r.hata } };
  }
  const hata = (res, e) => res.status(500).json({ success: false, error: e && e.message ? e.message : String(e) });

  app.get('/api/sermaye/dagitim', (req, res) => {
    try { res.json({ success: true, arastirma: ARASTIRMA_MODU, canliHesaplar: canliHesaplar(), ...HIZMET.durum() }); } catch (e) { hata(res, e); }
  });

  app.post('/api/sermaye/dagitim/ayar', (req, res) => {
    if (!yalnizYerel(req, res)) return;
    const g = req.body || {};
    if (g.onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
    const p = pinKapisi(g);
    if (p) return res.status(p.durum).json(p.govde);
    try {
      const d = SD.ayarDogrula(g, ctx.BINDIRME_ADLAR.slice(), canliHesaplar());
      if (!d.ok) return res.status(400).json({ success: false, error: d.hatalar.join(' · ') });
      const once = ctx.config.sermayeDagitimi && typeof ctx.config.sermayeDagitimi === 'object' ? ctx.config.sermayeDagitimi : {};
      const yeni = { ...once, ...d.ayar };
      delete yeni.gercekAcik;   // canlı hesap kapısı config'te değil (aktarim-kapisi.json)
      ctx.config.sermayeDagitimi = yeni;
      ctx.saveConfig(ctx.config);
      log('INFO', `[SERMAYE DAĞITIMI] ayar değişti: hedef paylar ${Object.entries(yeni.hedefler || {}).map(([k, v]) => `${k} %${Math.round(v * 1000) / 10}`).join(', ') || 'yok'}; bant %${Math.round(SD.ayar(yeni).bant * 1000) / 10}; tek ${SD.ayar(yeni).tekTavan} / günlük ${SD.ayar(yeni).gunlukTavan} USDT`);
      res.json({ success: true, ...HIZMET.durum() });
    } catch (e) { hata(res, e); }
  });

  app.post('/api/sermaye/aktar/onizle', (req, res) => {
    if (!yalnizYerel(req, res)) return;
    try { res.json({ success: true, onizleme: HIZMET.onizle(req.body || {}) }); } catch (e) { hata(res, e); }
  });

  app.post('/api/sermaye/aktar', async (req, res) => {
    if (!yalnizYerel(req, res)) return;
    const g = req.body || {};
    const p = pinKapisi(g);
    if (p) return res.status(p.durum).json(p.govde);
    try { const r = await HIZMET.uygula(g); res.status(r.durum).json(r.govde); } catch (e) { hata(res, e); }
  });

  app.post('/api/sermaye/aktar/sorgula', async (req, res) => {
    if (!yalnizYerel(req, res)) return;
    try { const r = await HIZMET.sorgula((req.body || {}).id); res.status(r.durum).json(r.govde); } catch (e) { hata(res, e); }
  });

  // Kapı dosyası yoksa bile hizmet çalışır (prova). Dosyanın varlığı yalnız bilgi.
  try { if (fs.existsSync(yollar.veri('live', HZ.KAPI_DOSYA))) log('WARN', '[AKTARIM] aktarim-kapisi.json var — canlı hesap aktarımı kapısı dosyası okunuyor (şartlar ayrıca denetlenir)'); } catch { /* */ }

  return { HIZMET, botlar, aktarimHesabi, hesap };
}

module.exports = { kur };
