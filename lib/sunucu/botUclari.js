/**
 * C1 (75.1, TASARIM-MAKINE-HESAP-BOT §3 parça 3) — server.js'ten taşındı, davranış AYNI. BOT UÇLARI, iki grup:
 *   botlarUclari()    74.4–74.6 /api/botlar (GET liste + model örnekleri; POST yeni kâğıt bot / model örneği), /api/botlar/sablonlar,
 *                     /api/botlar/hesaplar, POST /api/botlar/:k/hesap (acil PIN), /:k/sermaye (demo artışı acil PIN), /:k/arsivle,
 *                     /:k/geri-getir — yazmalar yalnız sunucu bilgisayarındaki panelden (telefon/geliştirme 403, araştırma 409)
 *   bindirmeUclari()  HÜCUM / DENGE (bindirme) uçları: /api/bindirme/olcum, /:ad/durum, /:ad/binance-bakiye, /:ad/mod, /:ad/kucuk-sermaye,
 *                     /:ad/kagit-sifirla, /:ad/baslat, /:ad/sermaye-akisi, /:ad/canli-onay, /:ad/durdur, /:ad/kuru, /:ad/calistir,
 *                     /:ad/mutabakat, /:ad/engel-kaldir, /:ad/acil, /:ad/acil-dene, /:ad/islemler; HESAP İŞLEMLERİ (/api/hesap-islemleri,
 *                     /senkron, .csv; açılıştan 2 dk sonra + 15 dk'da bir eşitleme); HESAPLAR (/api/hesaplar, /islemler, /islemler.csv);
 *                     /api/bindirme/:ad/grafik; /api/bindirme-telegram
 * Kademe/yetki kuralları (PIN, acil PIN, telefon/geliştirme kademesi, ARASTIRMA_KAPALI) server.js ara katman zincirinde ve burada AYNEN.
 *
 * Bağlanma: server.js `BOT_UCLARI = require('./lib/sunucu/botUclari').olustur(ctx)`; iki grup ESKİ YERLERİNDE (botlarUclari bot
 * yönetiminden hemen sonra; bindirmeUclari /api/exchange + /api/kalkan uçlarından sonra) — Express uç sırası birebir aynı. Bot nesneleri
 * ve işlevleri ctx.botYonetimi'den, borsa yürütücüleri ctx.borsa'dan; `config` / `BOT_KAYIT` (server.js `let`) her kullanımda ctx.config /
 * ctx.BOT_KAYIT. Kütüphaneler (server.js zaten yüklemiş) doğrudan; bindirme bloğunun kendi require'ları YERİNDE (yükleme sırası aynı).
 */
'use strict';

/**
 * 76.7 (saf): OKX botunun son kol kararında (KalkanBot durum.sonRapor — gerçek ya da kuru çalışma; salt okuma) işlem borsasında olmayan
 * coinler → { borsa, semboller, gun, kuru } | { borsa, semboller: null } (henüz karar yok). Bot nesnesine / canlı koda dokunmaz.
 */
function borsadaYokOzeti(bot) {
  const r = bot && bot.kol && bot.kol.durum ? bot.kol.durum.sonRapor : null;
  const y = r && r.borsadaYok;
  const ad = String((bot && bot.ayar && bot.ayar.islemBorsasi) || '');
  if (!y) return { borsa: ad, semboller: null, gun: null, kuru: null };
  return { borsa: String(y.borsa || ad), semboller: (Array.isArray(y.semboller) ? y.semboller : []).map(String), gun: r.gun || null, kuru: !!r.kuru };
}
const path = require('path');
const fs = require('fs');
const db = require('../database');
const tasimaLib = require('../tasima');
const isletim = require('../live/isletim');
const canliKapi = require('../live/canliKapi');
const VeriKalitesi = require('../live/veriKalitesi');
const bindirmeArastirma = require('../research/bindirme');
const botKayitLib = require('../botKayit');
const botSablonlari = require('../botSablonlari');
const anahtarlarLib = require('../anahtarlar');
const { YENI_CANLI_RED } = require('./botFabrikasi');
const { borsaHata } = require('./borsaUclari');

function olustur(ctx) {
  function botlarUclari() {
    const { app, ARASTIRMA_MODU, acilPin } = ctx;
    const { loadSecrets } = ctx.ayar;
    const { BINDIRME_ADLAR, bindirmeler, botEtiketi, yeniBotMu, bindirmeAyar, bindirmeDizin, bindirmeKur, botCikar, botEkle, botHesapId,
      gocBotAyarYaz, hesapBilgisi, hesapCakismasi, hesapUygunMu, modelOrnegiMi, ornekYansit, portfoyBildirici } = ctx.botYonetimi;

    /**
     * 74.4 (A1 2a) GET /api/botlar — bot listesi kayıttan (live/botlar/<kimlik>.json; göç olmadıysa eski yol). Panel Botlar listesi bunu
     * okur. Görünen ad: botAdlari (kimlikten) → kaydın adGorunen'i → strateji adı. Yalnız okuma (telefon + araştırma kopyası EV_YOLU ile
     * sunucudan). Sır yok; bot yazma uçları (/api/bindirme/:ad/*) aynen. Yeni bot oluşturma 2b'de.
     */
    /**
     * 74.5 (A1 2b): yeni botlar da listede (yeni: true); ?arsiv=1 arşivdekileri de verir (arsiv: { zaman }). Her satırda kıyas notu
     * (yeni Kairos tipi bot: ENGEL eşiği hucum.C0'a göre, kâğıtta yalnız uyarı; küçük sermaye açıksa Kairos-S gölgesi 972 bilgi olarak).
     */
    function botSatiri(ad, k, b, durumlar) {
      const botAdlari = require('../botAdlari');
      const strateji = (k && k.strateji) || ad;
      const st = bindirmeArastirma.STRATEJILER[strateji] || {};
      const sablonAd = (k && k.sablon) || botSablonlari.GOC_SABLON[ad] || null;
      const sb = sablonAd ? botSablonlari.sablon(sablonAd) : null;
      const yeni = yeniBotMu(ad);
      const mod = b ? b.mod : (k ? k.mod : null);
      let kiyas = null;
      if (yeni && k) {
        const tavan = mod === 'demo' ? k.sermaye.demo : k.sermaye.kagit;
        const kucukAcik = k.kucukSermaye === true || (k.kucukSermaye === 'oto' && +tavan < 5000);
        let hucumS = null;
        if (strateji === 'hucum' && kucukAcik) {
          try { const p = require('../ileri/hucumSGolge').panelVerisi(); hucumS = { deneme: p.deneme, son: (p.ozet && p.ozet.rapor && p.ozet.rapor.son) || null, uc: '/api/ileri/hucum-s' }; }
          catch { hucumS = { deneme: 972, son: null, uc: '/api/ileri/hucum-s' }; }
        }
        kiyas = { model: `${strateji}.C0`, metin: `kıyas: ${botEtiketi(strateji)} modeli (${strateji}.C0) — ENGEL eşiği buna göre${mod === 'kagit' ? '; kâğıtta sapma yalnız uyarı' : ''}`,
          engelYalnizUyari: mod === 'kagit', kucukSermayeAcik: kucukAcik, hucumS };
      }
      const hesapAdi = (id) => { if (!id) return null; const h = hesapBilgisi(id); return h ? h.ad : `${id} (Anahtarlar'da yok)`; };
      return { kimlik: ad, adGorunen: botAdlari.ad(ad) || (k && k.adGorunen) || st.ad || ad, motor: 'bindirme', strateji, sablon: sablonAd,
        aciklama: (sb && sb.aciklama) || st.aciklama || null, mod, calisiyor: !!(b && b.bot.durum.calisiyor),
        kayit: durumlar[ad] || { durum: 'eski-yol', neden: 'kayıt yüklenmedi' }, hesap: k ? { ...k.hesap } : null, sermaye: k ? { ...k.sermaye } : null,
        makine: k ? k.makine : null,
        // 74.5
        yeni, arsiv: (k && k.arsiv) || null, kucukSermaye: k ? k.kucukSermaye : null,
        hesapAdlari: k && yeni ? { demo: hesapAdi(k.hesap.demo), canli: null } : null,
        arsivlenebilir: yeni && !!b && b.mod === 'kagit' && !b.bot.durum.calisiyor,
        canliKapali: yeni, kiyas, olusturma: (k && k.olusturma) || null,
        // A2 parça 2: işlem borsası (kayıtta yoksa binance) + hazırlık durumu (OKX hazir:false → 'OKX demo: hazırlık — henüz bağlanamaz')
        borsa: botKayitLib.borsaKimligi(k), borsaDurum: borsaDurumu(botKayitLib.borsaKimligi(k)) };
    }
    /** A2 parça 2: borsanın hazırlık metni (hazırsa null). */
    function borsaDurumu(kimlik) { const d = require('../live/borsalar').durumlar().find(x => x.kimlik === kimlik); return d ? d.durum : null; }
    function botListesi({ arsiv = false } = {}) {
      const durumlar = ctx.BOT_KAYIT ? ctx.BOT_KAYIT.durum() : {};
      const l = BINDIRME_ADLAR.map(ad => botSatiri(ad, ctx.BOT_KAYIT ? ctx.BOT_KAYIT.kayit(ad) : null, bindirmeler[ad], durumlar));
      if (arsiv && ctx.BOT_KAYIT) for (const [ad, k] of Object.entries(ctx.BOT_KAYIT.arsivliler())) if (!botKayitLib.modelMi(k)) l.push(botSatiri(ad, k, null, durumlar));
      return l;
    }
    /** 74.6: model örneği satırı (GET /api/botlar `ornekler`; `botlar` dizisi geriye uyum için YALNIZ bindirme botları). */
    function ornekSatiri(k, durumlar = {}) {
      const sb = botSablonlari.sablon(k.sablon) || {};
      const BA = require('../botAdlari');
      return { kimlik: k.kimlik, adGorunen: k.adGorunen || k.kimlik, motor: 'model', model: k.model, modelAd: BA.ad(k.model) || k.model, sablon: k.sablon,
        aciklama: sb.aciklama || null, mod: 'kagit', calisiyor: false, para: k.para || 'USD', sermaye: { ...k.sermaye }, baslangic: k.baslangic || null,
        kayit: durumlar[k.kimlik] || { durum: k.arsiv ? 'arsiv' : 'kayit', neden: null }, hesap: { ...k.hesap }, makine: k.makine || null,
        yeni: true, arsiv: k.arsiv || null, arsivlenebilir: !k.arsiv, canliKapali: true, demoKapali: true, olusturma: k.olusturma || null, href: `#/botlar/${k.kimlik}` };
    }
    function ornekListesi({ arsiv = false } = {}) {
      if (!ctx.BOT_KAYIT) return [];
      const durumlar = ctx.BOT_KAYIT.durum();
      const l = Object.values(ctx.BOT_KAYIT.modelKayitlari()).map(k => ornekSatiri(k, durumlar));
      if (arsiv) for (const k of Object.values(ctx.BOT_KAYIT.arsivliler())) if (botKayitLib.modelMi(k)) l.push(ornekSatiri(k, durumlar));
      return l;
    }
    app.get('/api/botlar', (req, res) => {
      try { const arsiv = String((req.query || {}).arsiv || '') === '1'; res.json({ success: true, surum: botKayitLib.SURUM, kaynak: 'kayit', botlar: botListesi({ arsiv }), ornekler: ornekListesi({ arsiv }) }); }
      catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });
    app.get('/api/botlar/sablonlar', (req, res) => res.json({ success: true, sablonlar: botSablonlari.liste(), olusturma: true,
      sinirlar: { sermayeEnAz: botKayitLib.SERMAYE_EN_AZ, sermayeEnCok: botKayitLib.SERMAYE_EN_COK, kimlik: '2–16 küçük harf/rakam, harfle başlar; ilk iki harf her botta farklı' },
      borsalar: require('../live/borsalar').durumlar() }));   // A2 parça 2: yeni bot formunda borsa seçimi (hazırlık durumu dahil)
    /** 74.5: bağlanabilir borsa hesapları (Anahtarlar) — SIR YOK (yalnız ad, borsa, tür, anahtar var mı, kim kullanıyor). */
    app.get('/api/botlar/hesaplar', (req, res) => {
      try {
        const sir = loadSecrets() || {};
        const idler = [...Object.keys(anahtarlarLib.SABIT), ...Object.keys(sir.borsaHesaplari || {}).filter(id => /^[a-z0-9][a-z0-9-]{1,31}$/.test(id) && !anahtarlarLib.SABIT[id])];
        const hesaplar = idler.map(id => {
          const h = hesapBilgisi(id);
          const kullanan = BINDIRME_ADLAR.map(ad => bindirmeler[ad]).filter(b => b && botHesapId(b) === id).map(b => ({ kimlik: b.ad, ad: b.bot.adGorunen, mod: b.mod }));
          const bagli = Object.values(ctx.BOT_KAYIT ? ctx.BOT_KAYIT.kayitlar() : {}).filter(k => yeniBotMu(k.kimlik) && k.hesap && (k.hesap.demo === id || k.hesap.canli === id)).map(k => ({ kimlik: k.kimlik, ad: k.adGorunen || k.kimlik }));
          const neden = hesapUygunMu(h, h && h.tur === 'canli' ? 'canli' : 'demo');
          return { id, ad: h ? h.ad : id, borsa: h ? h.borsa : null, tur: h ? h.tur : null, sabit: !!(h && h.sabit), altHesap: (h && h.altHesap) || null,
            anahtarVar: !!(h && h.apiKey && h.apiSecret), kullanan, bagli, demoyaUygun: !neden && !!h && h.tur === 'demo', neden,
            borsaDurum: h && h.borsa ? borsaDurumu(h.borsa) : null };   // A2 parça 2
        });
        res.json({ success: true, hesaplar });
      } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });

    /* ── 74.5 YAZMA UÇLARI (yalnız sunucu bilgisayarındaki panel: telefon salt okuma, geliştirme kademesine eklenmedi, araştırmada 403) ── */
    const botYerelDegil = (req, res) => {
      if ((req.kademe || 'yerel') !== 'yerel') { res.status(403).json({ success: false, error: 'Botlar yalnız sunucu bilgisayarındaki panelden yönetilir (telefon izler, geliştirme bilgisayarı yazamaz).' }); return true; }
      if (ARASTIRMA_MODU) { res.status(409).json({ success: false, error: 'Bu bilgisayar araştırma kopyası — botlar sunucuda oluşturulur ve yönetilir.' }); return true; }
      return false;
    };
    /** Acil PIN + onay (anahtarlar.js deseni: yanlış 400, tanımsız 428, kilit 429). null = geçti. */
    function botPinKapisi(g) {
      if (g.onay !== true) return { durum: 400, govde: { success: false, error: 'Onay gerekli.' } };
      const r = acilPin.pinDogrula(String(g.pin == null ? '' : g.pin).trim());
      if (r.ok) return null;
      if (r.tanimli === false) return { durum: 428, govde: { success: false, pinTanimsiz: true, error: 'Acil PIN bu bilgisayarda tanımlı değil — önce bilgisayar başında `npm run acil-pin` ile PIN belirleyin.' } };
      return { durum: r.durum === 429 ? 429 : 400, govde: { success: false, pinHatali: true, error: r.hata } };
    }
    const botHata = (res, e) => res.status(e && [400, 404, 409].includes(e.kod) ? e.kod : 500).json({ success: false, error: e ? e.message : 'bilinmeyen hata' });
    /** Kullanılan görünen adlar (yeni botun adı bunlardan farklı olmalı): tablo adları + eski adlar + bütün kayıtlar (arşiv dahil). */
    function doluAdlar() {
      const BA = require('../botAdlari');
      const l = [];
      for (const id of BA.SIRA) l.push(BA.ad(id), BA.eski(id));
      for (const k of Object.values({ ...(ctx.BOT_KAYIT ? ctx.BOT_KAYIT.kayitlar() : {}), ...(ctx.BOT_KAYIT ? ctx.BOT_KAYIT.arsivliler() : {}) })) if (k.adGorunen) l.push(k.adGorunen);
      return l.filter(Boolean);
    }
    /** POST /api/botlar — şablondan YENİ KÂĞIT bot (PIN yok, onay var — kâğıt, para riski yok). */
    app.post('/api/botlar', (req, res) => {
      if (botYerelDegil(req, res)) return;
      const g = req.body || {};
      if (g.onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
      try {
        const BA = require('../botAdlari');
        const sb0 = botSablonlari.sablon(String(g.sablon || ''));
        if (sb0 && sb0.motor === 'model' && (g.hesap != null || (g.mod != null && g.mod !== 'kagit'))) return res.status(409).json({ success: false, error: botKayitLib.MODEL_ORNEK_RED });
        const kayit = ctx.BOT_KAYIT.yeni({ sablon: g.sablon, kimlik: g.kimlik, adGorunen: g.adGorunen, sermaye: g.sermaye, kucukSermaye: g.kucukSermaye, ...(sb0 && sb0.motor === 'model' ? { baslangic: g.baslangic } : {}),
          ...(g.borsa != null && g.borsa !== '' ? { borsa: g.borsa } : {}) },   // A2 parça 2: işlem borsası (şablon sabitlemediyse)
          { dolu: doluAdlar(), takma: (k) => !!BA.kimlik(k) });
        if (botKayitLib.modelMi(kayit)) {
          // 74.6: model örneği — bindirme botu KURULMAZ; tasarımcı yansıması yazılır (kâğıt hesap tasarımcının sonraki tikinde)
          try { ornekYansit(kayit); }
          catch (e) { try { ctx.BOT_KAYIT.arsivle(kayit.kimlik, `kurulamadı: ${e.message}`); } catch { /* */ } throw Object.assign(new Error(`model örneği kurulamadı (kayıt arşive alındı): ${e.message}`), { kod: 500 }); }
          BA.kaydet(kayit.kimlik, kayit.adGorunen);
          const modelAd = BA.ad(kayit.model) || kayit.model, birim = kayit.para === 'TRY' ? 'TL' : 'USD';
          db.addLog('INFO', `[BOTLAR] yeni model örneği: ${kayit.adGorunen} (${kayit.kimlik}, ${modelAd} örneği, kâğıt sermayesi ${kayit.sermaye.kagit} ${birim}, başlangıç ${kayit.baslangic || 'modelin ilk günü'}) — kâğıt hesap tasarımcının sonraki tikinde`);
          portfoyBildirici.gonder('bilgi', `Yeni model örneği: ${kayit.adGorunen}`, [`${modelAd} modelinin ikinci kâğıt hesabı (aynı kararlar, ayrı sermaye; gerçek emir yok).`, 'Siz oluşturmadıysanız: Ayarlar › Botlar › Arşivle.']);
          return res.json({ success: true, bot: ornekSatiri(kayit, ctx.BOT_KAYIT.durum()) });
        }
        try { botEkle(kayit.kimlik); }
        catch (e) { try { ctx.BOT_KAYIT.arsivle(kayit.kimlik, `kurulamadı: ${e.message}`); } catch { /* */ } throw Object.assign(new Error(`bot kurulamadı (kayıt arşive alındı): ${e.message}`), { kod: 500 }); }
        db.addLog('INFO', `[BOTLAR] yeni kâğıt bot: ${kayit.adGorunen} (${kayit.kimlik}, ${botSablonlari.sablon(kayit.sablon).ad || kayit.sablon}, üst sınır ${kayit.sermaye.kagit} USD) — durmuş; Başlat ile çalışır`);
        if (botKayitLib.borsaKimligi(kayit) !== 'binance') db.addLog('INFO', `[BOTLAR] ${kayit.adGorunen}: işlem borsası ${require('../live/borsalar').al(kayit.borsa).ad} — kâğıt hesap o borsanın pazar kurallarıyla, karar verisi Binance'ten; ${borsaDurumu(kayit.borsa) || 'demo hesap bağlanabilir'}`);
        portfoyBildirici.gonder('bilgi', `Yeni kâğıt bot: ${kayit.adGorunen}`, [`Şablon: ${botSablonlari.sablon(kayit.sablon).ad || kayit.sablon}. Kâğıt hesap (gerçek emir yok), henüz başlatılmadı.`, 'Siz oluşturmadıysanız: Ayarlar › Botlar › Arşivle.']);
        res.json({ success: true, bot: botSatiri(kayit.kimlik, ctx.BOT_KAYIT.kayit(kayit.kimlik), bindirmeler[kayit.kimlik], ctx.BOT_KAYIT.durum()) });
      } catch (e) { botHata(res, e); }
    });
    /** Yeni bot uçlarının ortak girişi: bilinmeyen 404; Kairos/Tao bu uçlarda değişmez (409) — `goc` true ise Kairos/Tao da kabul. */
    function yeniBotBul(req, res, { goc = false } = {}) {
      const k = String(req.params.k || '');
      if (!goc && !yeniBotMu(k) && BINDIRME_ADLAR.includes(k)) { res.status(409).json({ success: false, error: `${botEtiketi(k)} sabit hesaplarını ve kendi ayar yolunu kullanır — bu işlem yalnız sizin oluşturduğunuz botlarda` }); return null; }
      const b = bindirmeler[k];
      if (!b) { res.status(404).json({ success: false, error: ctx.BOT_KAYIT && ctx.BOT_KAYIT.arsivKayit(k) ? 'bot arşivde — önce geri getirin' : `bilinmeyen bot: ${k}` }); return null; }
      return b;
    }
    /** POST /api/botlar/:k/hesap { mod: 'demo', hesap: <Anahtarlar kimliği> | null, pin, onay: true } — acil PIN + onay. */
    app.post('/api/botlar/:k/hesap', (req, res) => {
      if (botYerelDegil(req, res)) return;
      if (modelOrnegiMi(String(req.params.k || ''))) return res.status(409).json({ success: false, error: botKayitLib.MODEL_ORNEK_RED });   // 74.6
      const b = yeniBotBul(req, res); if (!b) return;
      const g = req.body || {};
      const mod = String(g.mod || '');
      if (mod === 'canli') return res.status(409).json({ success: false, error: YENI_CANLI_RED });
      if (mod !== 'demo') return res.status(400).json({ success: false, error: 'mod "demo" olmalı (kâğıt hesap borsa hesabı istemez)' });
      const id = g.hesap == null || g.hesap === '' ? null : String(g.hesap);
      if (id !== null && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) return res.status(400).json({ success: false, error: 'hesap kimliği geçersiz' });
      if (b.mod === mod) return res.status(409).json({ success: false, error: `${b.bot.adGorunen} şu an ${mod} modunda — hesap çalışırken değişmez; önce kâğıda dönün` });
      let h = null;
      if (id) {
        h = hesapBilgisi(id);
        const u = hesapUygunMu(h, mod, botKayitLib.borsaKimligi(ctx.BOT_KAYIT.kayit(b.ad)));   // A2 parça 2: hesap borsası = bot borsası
        if (u) return res.status(400).json({ success: false, error: u });
      }
      const pk = botPinKapisi(g);
      if (pk) return res.status(pk.durum).json(pk.govde);
      try {
        if (id) { const c = hesapCakismasi(b.ad, mod, id); if (c) return res.status(409).json({ success: false, error: c }); }
        const yeni = ctx.BOT_KAYIT.guncelle(b.ad, (c) => { c.hesap = { ...(c.hesap || {}), [mod]: id }; }, id ? 'hesap bağlandı' : 'hesap bağı kaldırıldı');
        db.addLog('INFO', `[BOTLAR] ${b.bot.adGorunen}: ${mod} hesabı ${id ? `→ ${h.ad} (${id})` : 'bağı kaldırıldı'}`);
        const baskasi = id ? Object.values(ctx.BOT_KAYIT.kayitlar()).filter(x => x.kimlik !== b.ad && x.hesap && x.hesap[mod] === id).map(x => x.adGorunen || x.kimlik) : [];
        res.json({ success: true, hesap: { ...yeni.hesap }, uyari: baskasi.length ? `${baskasi.join(', ')} de bu hesaba bağlı — aynı anda yalnız biri ${mod} modunda olabilir (a4).` : null,
          bot: botSatiri(b.ad, yeni, bindirmeler[b.ad], ctx.BOT_KAYIT.durum()) });
      } catch (e) { botHata(res, e); }
    });
    /**
     * POST /api/botlar/:k/sermaye { mod: 'kagit' | 'demo', tutar (USD), pin?, onay: true } — a5 sermaye üst sınırı. Kâğıtta onay; demoda ARTIŞ acil PIN
     * ister (azaltma risk düşürür). Bot durmuşken. Kairos/Tao da (74.7: kayda — gocBotAyarYaz); Kairos demo kabulü süresince Kairos demo sınırı
     * değişmez. Gerçek para üst sınırı bu uçtan değişmez (canlı kapısı + onaylı üst sınır).
     */
    app.post('/api/botlar/:k/sermaye', (req, res) => {
      if (botYerelDegil(req, res)) return;
      if (modelOrnegiMi(String(req.params.k || ''))) return ornekSermaye(req, res);   // 74.6
      const b = yeniBotBul(req, res, { goc: true }); if (!b) return;
      const g = req.body || {};
      const mod = String(g.mod || '');
      if (mod === 'canli') return res.status(409).json({ success: false, error: yeniBotMu(b.ad) ? YENI_CANLI_RED : 'Gerçek para üst sınırı bu ekrandan değişmez — canlı kapısı ve onaylı üst sınır (PLAN-GERCEK-PARA-2027).' });
      if (!['kagit', 'demo'].includes(mod)) return res.status(400).json({ success: false, error: 'mod kagit | demo olmalı' });
      if (g.onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
      const tutar = typeof g.tutar === 'string' && /^\d+(\.\d{1,2})?$/.test(g.tutar.trim()) ? +g.tutar.trim() : g.tutar;
      const sh = botKayitLib.sermayeHatasi(tutar);
      if (sh) return res.status(400).json({ success: false, error: sh });
      if (b.bot.durum.calisiyor || b.bot.mesgul) return res.status(409).json({ success: false, error: 'önce botu durdurun (sermaye üst sınırı bot çalışırken değişmez)' });
      if (b.ad === 'hucum' && mod === 'demo' && Date.now() < VeriKalitesi.KORUMA_BITIS) return res.status(409).json({ success: false, error: `Kairos demo kabulü ${new Date(VeriKalitesi.KORUMA_BITIS).toISOString().slice(0, 10)} sonuna kadar sürüyor — Kairos'un demo sermaye sınırı bu süre içinde değişmez.` });
      const a = bindirmeAyar(b.ad);
      const simdiki = mod === 'demo' ? +a.demoSermayeTavani : +a.sermayeTavani;
      const t = Math.round(tutar * 100) / 100;
      if (t === simdiki) return res.json({ success: true, degismedi: true, tutar: t });
      if (mod === 'demo' && t > simdiki) { const pk = botPinKapisi(g); if (pk) return res.status(pk.durum).json(pk.govde); }
      try {
        if (yeniBotMu(b.ad)) {
          const kagitDosyaVar = fs.existsSync(path.join(bindirmeDizin(b.ad, 'kagit'), 'kagit-borsa.json'));
          ctx.BOT_KAYIT.guncelle(b.ad, (c) => { c.sermaye = { ...c.sermaye, [mod]: t }; if (mod === 'kagit' && !kagitDosyaVar) c.kagitBakiye = t; }, 'sermaye üst sınırı');
        } else {
          gocBotAyarYaz(b.ad, { [mod === 'demo' ? 'demoSermayeTavani' : 'sermayeTavani']: t }, 'sermaye üst sınırı');   // 74.7: kayda (tek kaynak)
        }
        if (b.mod === mod) {
          if (b.y.borsa) b.y.baglantiyiKes();
          if (b.bot.zamanlayici) b.bot.durdur();
          bindirmeler[b.ad] = bindirmeKur(b.ad, mod);
        }
        db.addLog('INFO', `[BOTLAR] ${b.bot.adGorunen}: ${mod === 'demo' ? 'demo' : 'kâğıt'} sermaye üst sınırı ${simdiki} → ${t} USD`);
        res.json({ success: true, mod, eski: simdiki, tutar: t });
      } catch (e) { botHata(res, e); }
    });
    /**
     * 74.6: model örneğinin kâğıt sermayesi { mod: 'kagit', tutar, onay: true } — PIN yok (kâğıt). Kâğıt hesap değişikliği o gün para
     * yatırma/çekme olarak işler (lib/tasarimci/kagit.js tikHesapla: getiri bozulmaz). demo/canlı 409.
     */
    function ornekSermaye(req, res) {
      const k = String(req.params.k || ''), g = req.body || {};
      const kayit = ctx.BOT_KAYIT.kayit(k);
      if (!kayit) return res.status(404).json({ success: false, error: 'model örneği arşivde — önce geri getirin' });
      if (String(g.mod || '') !== 'kagit') return res.status(409).json({ success: false, error: botKayitLib.MODEL_ORNEK_RED });
      if (g.onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
      const tutar = typeof g.tutar === 'string' && /^\d+(\.\d{1,2})?$/.test(g.tutar.trim()) ? +g.tutar.trim() : g.tutar;
      const sh = botKayitLib.sermayeHatasi(tutar);
      if (sh) return res.status(400).json({ success: false, error: kayit.para === 'TRY' ? sh.replace(/USD/g, 'TL') : sh });
      const t = Math.round(tutar * 100) / 100, eski = kayit.sermaye.kagit;
      if (t === eski) return res.json({ success: true, degismedi: true, tutar: t });
      try {
        const yeni = ctx.BOT_KAYIT.guncelle(k, (c) => { c.sermaye = { ...c.sermaye, kagit: t }; }, 'kâğıt sermayesi');
        ornekYansit(yeni);
        db.addLog('INFO', `[BOTLAR] ${kayit.adGorunen}: model örneğinin kâğıt sermayesi ${eski} → ${t} ${kayit.para === 'TRY' ? 'TL' : 'USD'} (kâğıt hesapta bugün para ${t > eski ? 'yatırma' : 'çekme'} olarak işlenir)`);
        res.json({ success: true, mod: 'kagit', eski, tutar: t, para: kayit.para || 'USD' });
      } catch (e) { botHata(res, e); }
    }
    /** POST /api/botlar/:k/arsivle { onay: true } — yalnız kâğıtta ve durmuş yeni bot; dosyalar SİLİNMEZ (kayıtta arsiv, bot dizini yerinde). */
    app.post('/api/botlar/:k/arsivle', (req, res) => {
      if (botYerelDegil(req, res)) return;
      if (!yeniBotMu(String(req.params.k || ''))) return res.status(409).json({ success: false, error: 'Kairos ve Tao arşivlenemez' });
      if (modelOrnegiMi(String(req.params.k || ''))) {
        // 74.6: model örneği — kayıtta arsiv + yansımada arsiv (tasarımcı hesaplamaz); kâğıt hesap dosyaları SİLİNMEZ
        if ((req.body || {}).onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
        try {
          const k = String(req.params.k), ad = botEtiketi(k);
          const x = ctx.BOT_KAYIT.arsivle(k, 'panel');
          ornekYansit(x);
          db.addLog('INFO', `[BOTLAR] ${ad} (${k}) model örneği arşivlendi — kayıt ve kâğıt hesap dosyaları silinmedi (tasarimci/ornekler/${k}); geri getirilebilir`);
          return res.json({ success: true, arsiv: true });
        } catch (e) { return botHata(res, e); }
      }
      const b = yeniBotBul(req, res); if (!b) return;
      if ((req.body || {}).onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
      if (b.mod !== 'kagit') return res.status(409).json({ success: false, error: 'yalnız kâğıt moddaki bot arşivlenir — önce kâğıda dönün' });
      if (b.bot.durum.calisiyor || b.bot.mesgul || (typeof b.bot.calismaSuruyor === 'function' && b.bot.calismaSuruyor())) return res.status(409).json({ success: false, error: 'önce botu durdurun' });
      try {
        const ad = b.bot.adGorunen;
        ctx.BOT_KAYIT.arsivle(b.ad, 'panel');
        botCikar(b.ad);
        db.addLog('INFO', `[BOTLAR] ${ad} (${b.ad}) arşivlendi — kayıt ve kâğıt hesap dosyaları silinmedi (data/live/${b.ad}); geri getirilebilir`);
        res.json({ success: true, arsiv: true });
      } catch (e) { botHata(res, e); }
    });
    /** POST /api/botlar/:k/geri-getir { onay: true } — arşivden kâğıtta geri getirir (durmuş). */
    app.post('/api/botlar/:k/geri-getir', (req, res) => {
      if (botYerelDegil(req, res)) return;
      const k = String(req.params.k || '');
      if ((req.body || {}).onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
      try {
        const x = ctx.BOT_KAYIT.geriGetir(k);
        if (botKayitLib.modelMi(x)) {   // 74.6: model örneği — yansıma güncellenir, bindirme botu kurulmaz
          ornekYansit(x);
          require('../botAdlari').kaydet(k, x.adGorunen || k);
          db.addLog('INFO', `[BOTLAR] ${botEtiketi(k)} (${k}) model örneği arşivden geri getirildi — kâğıt hesap sonraki tikte yeniden hesaplanır`);
          return res.json({ success: true, bot: ornekSatiri(x, ctx.BOT_KAYIT.durum()) });
        }
        botEkle(k);
        db.addLog('INFO', `[BOTLAR] ${botEtiketi(k)} (${k}) arşivden geri getirildi (kâğıt, durmuş)`);
        res.json({ success: true, bot: botSatiri(k, ctx.BOT_KAYIT.kayit(k), bindirmeler[k], ctx.BOT_KAYIT.durum()) });
      } catch (e) { botHata(res, e); }
    });
  }

  function bindirmeUclari() {
    const { app, ARASTIRMA_MODU, engine, ozDenetim } = ctx;
    const { CANLI_DIZIN, canli, kalkanYurutucu } = ctx.borsa;
    const { STRATEJI_ADLAR, BINDIRME_ADLAR, BINDIRME_MODLAR, KUCUK_SECIMLER, KAGIT_AYAKLAR, GOLGE_DOSYA, bindirmeler, bindirmeAyar, bindirmeBul,
      bindirmeDemoCakisma, bindirmeKur, botHesapId, canliKapiDurum, canliKapiGerekli, gocBotAyarYaz, gorunurModlar, hesapBilgisi, hesapCakismasi,
      hesapUygunMu, portfoyBildirici, yeniBotMu } = ctx.botYonetimi;
    // ── HÜCUM / DENGE (bindirme) ───────────────────────────────────────────────
    /**
     * Ölçüm (lib/research/bindirme.js): iki strateji + yalnız BTC ayağı + kol + BTC al-tut.
     * İlk çağrıda hesaplanır (~5–8 sn, olay döngüsünü tutar) ve bellekte saklanır;
     * `?yenile=1` yeniden hesaplar. Veri yoksa 503.
     */
    let bindirmeOlcumOnbellek = null;
    function bindirmeOlcumKur() {
      const A = bindirmeArastirma;
      const out = { zaman: Date.now(), stratejiler: {}, ortak: null };
      for (const ad of STRATEJI_ADLAR) {   // 74.5: ölçüm strateji başına (yeni botlar aynı kuralı paylaşır)
        const t = A.STRATEJILER[ad];
        const s = A.bindirmeSonuc({ btcPay: t.btcPay, bootstrap: true });
        out.stratejiler[ad] = { ad: t.ad, aciklama: t.aciklama, btcPay: t.btcPay, kayit: t.kayit, egri: s.egri, metrik: s.metrik, yillik: s.yillik.strateji, btcIslemler: s.btcIslemler, marj: s.marj };
        if (!out.ortak) {
          out.ortak = { donem: s.donem, icerideGun: s.icerideGun, btcAyagi: s.btcAyagi, kol: s.kol, alTut: s.alTut,
            metrikBtcAyagi: s.metrikBtcAyagi, metrikKol: s.metrikKol, metrikAlTut: s.metrikAlTut, alTutKayit: A.AL_TUT_KAYIT,
            yillik: { btcAyagi: s.yillik.btcAyagi, kol: s.yillik.kol, alTut: s.yillik.alTut },
            gecisler: s.gecisler, btcAyagiIslemler: s.btcAyagiIslemler };
        }
      }
      return out;
    }
    app.get('/api/bindirme/olcum', (req, res) => {
      try {
        if (!bindirmeArastirma.veriVarMi()) return res.status(503).json({ success: false, error: 'Ölçüm verisi yok: data/market.db ve data/arastirma/capraz-marj-onbellek.json gerekli (ONBELLEK=1 node scripts/capraz-marj-sim.js)' });
        if (!bindirmeOlcumOnbellek || req.query.yenile) bindirmeOlcumOnbellek = bindirmeOlcumKur();
        res.json({ success: true, olcum: bindirmeOlcumOnbellek });
      } catch (err) { res.status(500).json({ success: false, error: err.message }); }
    });

    app.get('/api/bindirme/:ad/durum', async (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        let hesap = null, btc = null;
        if (b.y.borsa) {
          hesap = await b.y.hesap().catch(e => ({ hata: e.message }));
          try { const q = await b.bot.btcMiktari(); const f = q !== 0 ? await b.bot._btcFiyat() : null; btc = { miktar: q, fiyat: f, deger: q * (f || 0), ayak: b.bot.ayar.btcAyak }; } catch (e) { btc = { hata: e.message }; }
        }
        const kapi = canliKapiDurum(b.ad);
        // 76.7 (A2 parça 2): OKX botunda işlem borsasında olmayan evren coinleri (son kararın kol raporundan; hedef 0 — payı nakitte).
        // Yalnız Binance DIŞI botta (bot ayarında islemBorsasi); Binance botunun yanıtı birebir eskisi.
        const borsadaYok = b.bot.ayar && b.bot.ayar.islemBorsasi ? borsadaYokOzeti(b.bot) : null;
        res.json({ ...(borsadaYok ? { borsadaYok } : {}), success: true, mod: b.mod, modlar: gorunurModlar(b), canliKapi: { izin: kapi.izin, eksikler: kapi.eksikler, enErken: canliKapi.CANLI_EN_ERKEN, ustSinir: kapi.ustSinir }, demoAnahtar: !!(ctx.config.testnetApiKey && ctx.config.testnetApiSecret),
          bot: b.bot.ozet(), yurutucu: b.y.borsa ? b.y.ozet() : { durum: 'BAGLI_DEGIL' }, hesap, btc });
      } catch (err) { borsaHata(res, err); }
    });

    /**
     * BINANCE BAKİYE KIRILIMI (64.5, YALNIZ OKUMA) — Botlar › Hücum "Binance bakiyesi": cüzdan, gerçekleşmemiş K/Z, marj bakiyesi
     * (= hesap değeri), pozisyon teminatı, emir teminatı, kullanılabilir (Binance "Avbl") + özdeşlik denetimi; pozisyonlar işaret
     * fiyatıyla, açık emirler (temel + koşullu). lib/binanceHesapOzeti.js. Panel açıkken ~12 sn'de bir sorulur → 10 sn önbellek
     * (4 GET, yürütücünün hız kapısından). Bağlı değilse (araştırma kopyası / bot bağlanmamış) Binance'e GİDİLMEZ; son kayıtlı
     * hesap değeri döner. Telefon kademesi: GET serbest; araştırma kopyası: lib/evOkuma EV_YOLU (/api/bindirme/…) sunucudan okur.
     */
    const binanceHesapOzeti = require('../binanceHesapOzeti');
    const binanceBakiyeOnbellek = {};
    app.get('/api/bindirme/:ad/binance-bakiye', async (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        const son = (() => { try { const l = b.bot.ozsermayeOku(); const x = l[l.length - 1]; return x ? { gun: x.gun, zaman: x.zaman || null, ozsermaye: x.ozsermaye } : null; } catch { return null; } })();
        const temel = { success: true, ad: b.ad, mod: b.mod, arastirma: ARASTIRMA_MODU, sermayeTavani: b.bot.ayar.sermayeTavani, sonKayit: son };
        if (!b.y.borsa) {
          return res.json({ ...temel, bagli: false, neden: ARASTIRMA_MODU
            ? 'Bu bilgisayar araştırma kopyası — Binance\'e bağlanılmaz (bot sunucuda çalışır). Sunucu bağlantısı kuruluysa bu bilgi sunucudaki panelden okunur.'
            : 'Bot borsaya bağlı değil (durdurulmuş ya da kâğıt hesap) — Binance bakiyesi okunmuyor.' });
        }
        if (!binanceHesapOzeti.binanceMi(b.y.borsa)) return res.json({ ...temel, bagli: true, binance: false, neden: 'Kâğıt hesap — Binance bakiye kırılımı yok (sanal bakiye).' });
        const o = binanceBakiyeOnbellek[b.ad];
        let veri;
        if (o && o.dizin === b.dizin && Date.now() - o.zaman < 10000) veri = o.veri;
        else {
          const istek = (fn) => (typeof b.y.borsaIstegi === 'function' ? b.y.borsaIstegi(fn) : fn());
          veri = { zaman: Date.now(), ortam: b.y.ortam, ...(await binanceHesapOzeti.oku(b.y.borsa, istek)) };
          binanceBakiyeOnbellek[b.ad] = { zaman: veri.zaman, dizin: b.dizin, veri };
        }
        res.json({ ...temel, bagli: true, binance: true, ...veri });
      } catch (err) { borsaHata(res, err); }
    });

    /** Mod seçimi: kagit | demo. Bot çalışırken değişmez; canlı bu sürümde YOK. */
    app.post('/api/bindirme/:ad/mod', async (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        const mod = String((req.body || {}).mod || '');
        if (!BINDIRME_MODLAR.includes(mod)) throw new Error(`mod kagit | demo | canli olmalı`);
        if (mod === b.mod) return res.json({ success: true, mod });
        if (yeniBotMu(b.ad)) {
          // 74.5: yeni bot — canlı TAMAMEN kapalı; demo yalnız bağlı Binance demo hesabıyla ve a4 temizse (PIN: masaüstünde yerel PIN kapısı).
          if (mod === 'canli') return res.status(409).json({ success: false, error: YENI_CANLI_RED });
          if (mod === 'demo') {
            const id = ((ctx.BOT_KAYIT.kayit(b.ad) || {}).hesap || {}).demo;
            if (!id) return res.status(409).json({ success: false, error: `${b.bot.adGorunen}: demo hesabı bağlı değil — önce Ayarlar › Botlar › Hesap (acil PIN)` });
            const u = hesapUygunMu(hesapBilgisi(id), 'demo', botKayitLib.borsaKimligi(ctx.BOT_KAYIT.kayit(b.ad)));   // A2 parça 2: hesap borsası = bot borsası
            if (u) return res.status(409).json({ success: false, error: u });
            const c = hesapCakismasi(b.ad, 'demo', id);
            if (c) return res.status(409).json({ success: false, error: c });
          }
        }
        if (mod === 'canli') {
          canliKapiGerekli(b.ad);
          if (String((req.body || {}).onay || '').trim().toLocaleUpperCase('tr-TR') !== 'GERÇEK PARA') throw new Error('gerçek paraya geçiş onayı: "GERÇEK PARA" yazılmalı');
        }
        if (b.mod === 'canli') {
          // Denetim #4: gerçek hesapta açık pozisyon/emir kalırken çıkılırsa acil durdurma o hesaba artık ulaşmaz — önce acil.
          try { await b.bagla({ mutabakatsiz: true }); } catch (e) { if (!b.y.borsa) throw new Error(`gerçek hesap okunamadı (${e.message}) — moddan çıkılmadı`); }
          const istek = (fn) => (typeof b.y.borsaIstegi === 'function' ? b.y.borsaIstegi(fn) : fn());
          const [poz, emir] = await Promise.all([istek(() => b.y.borsa.fetchPositions()), istek(() => b.y.borsa.fetchOpenOrders())]);
          const acikPoz = (poz || []).filter(p => Math.abs(+p.contracts || 0) > 0);
          const btcQ = await b.bot.btcMiktari().catch(() => 0);
          if (acikPoz.length || (emir || []).length || btcQ > 0) throw new Error(`gerçek hesapta açık pozisyon/emir ya da BTC var (${acikPoz.length} pozisyon, ${(emir || []).length} emir, BTC ${btcQ}) — önce Acil fren, sonra moddan çıkın`);
          b.y._onayKaldir('gerçek para modundan çıkıldı');   // yeniden girişte "CANLI" yeniden istenir
        }
        if (b.bot.durum.calisiyor) throw new Error('önce botu durdurun (mod çalışırken değişmez)');
        const yeni = bindirmeKur(b.ad, mod);
        bindirmeDemoCakisma(yeni);
        if (b.y.borsa) b.y.baglantiyiKes();
        if (b.bot.zamanlayici) b.bot.durdur();
        bindirmeler[b.ad] = yeni;
        if (yeniBotMu(b.ad)) ctx.BOT_KAYIT.guncelle(b.ad, (c) => { c.mod = mod; }, 'mod');   // 74.5: yeni bot — kayıt tek kaynak
        else gocBotAyarYaz(b.ad, { mod }, 'mod');   // 74.7: Kairos/Tao — kayda (tek kaynak); config.bindirme yansıması saveConfig'te
        db.addLog(mod === 'canli' ? 'WARN' : 'INFO', `[${b.ad}] mod: ${mod === 'demo' ? 'DEMO hesap (BTC ayağı perp LONG — demo yaklaşımı)' : mod === 'canli' ? '⚠ GERÇEK PARA (çoklu varlık; kapı açık)' : 'kâğıt'}`);
        if (mod === 'canli') portfoyBildirici.gonder('alarm', `${yeni.bot.adGorunen}: GERÇEK PARA moduna geçildi`, ['Bot henüz başlamadı: emir onayı (CANLI) ve Başlat gerekir. Siz değilseniz hemen moda geri dönün.'], { anahtar: `canli-mod:${Date.now()}` });
        res.json({ success: true, mod });
      } catch (err) { borsaHata(res, err); }
    });

    /**
     * Küçük sermaye (Hücum-S) seçimi: oto (sermaye < 5000 $ iken açık) | acik | kapali.
     * Kural PLAN-SERMAYE-1000.md §3 (lib/live/kucukSermaye.js); bot çalışırken değişmez.
     */
    app.post('/api/bindirme/:ad/kucuk-sermaye', (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        const anahtar = String((req.body || {}).secim || '');
        if (!(anahtar in KUCUK_SECIMLER)) throw new Error('secim: oto | acik | kapali');
        if (b.bot.durum.calisiyor) throw new Error('önce botu durdurun');
        const v = KUCUK_SECIMLER[anahtar];
        b.bot.ayar.kucukSermaye = v; b.bot.kol.ayar.kucukSermaye = v;
        if (yeniBotMu(b.ad)) ctx.BOT_KAYIT.guncelle(b.ad, (c) => { c.kucukSermaye = v; }, 'küçük sermaye');   // 74.5: yeni bot — kayıt tek kaynak
        else gocBotAyarYaz(b.ad, { kucukSermaye: v }, 'küçük sermaye');   // 74.7: kayda (tek kaynak)
        db.addLog('INFO', `[${b.ad}] küçük sermaye (Kairos-S): ${anahtar}`);
        res.json({ success: true, secim: anahtar, bot: b.bot.ozet() });
      } catch (err) { borsaHata(res, err); }
    });

    /**
     * 68.8 KÂĞIT HESABI SIFIRLA (TEMİZ BAŞLA) — lib/live/kagitSifirla.js. Yalnız kâğıt modda ve bot durmuşken (yoksa 409); gövde
     * { onay: 'SIFIRLA' }. Botun dizini (data/live/<ad>) SİLİNMEZ: `<ad>-onceki-<UTC zaman>` yedeğine taşınır; bot taze durumla yeniden
     * kurulur (sermaye = kagitBakiye; son gün yok → ilk çalışmada kaçırılan gün telafisi yok). Demo / canlı dizinine dokunmaz.
     * 68.9 (G7, PLAN-GERCEK-PARA-2027 §1): isteğe bağlı { btcAyak: 'spot' | 'coklu' } — BTC ayağı biçimi YALNIZ sıfırlamayla değişir
     * (spot ↔ çoklu varlık durumu birbirine taşınmaz); bot kaydına btcAyak yazılır (74.7; config.bindirme yansıması), bot o biçimle taze kurulur.
     */
    const kagitSifirlaLib = require('../live/kagitSifirla');
    app.post('/api/bindirme/:ad/kagit-sifirla', (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        const durum = { ad: b.bot.adGorunen || b.ad, mod: b.mod, calisiyor: !!b.bot.durum.calisiyor, dizin: b.dizin, kok: CANLI_DIZIN };
        const e = kagitSifirlaLib.engel(durum);
        if (e) return res.status(409).json({ success: false, error: e });
        if (String((req.body || {}).onay || '').trim().toLocaleUpperCase('tr-TR') !== kagitSifirlaLib.ONAY) return res.status(400).json({ success: false, error: 'onay eksik: gövdede { onay: "SIFIRLA" } olmalı' });
        const yeniAyak = (req.body || {}).btcAyak;
        if (yeniAyak != null && !KAGIT_AYAKLAR.includes(yeniAyak)) return res.status(400).json({ success: false, error: `btcAyak ${KAGIT_AYAKLAR.join(' | ')} olmalı` });
        if (b.y.borsa) b.y.baglantiyiKes();
        if (b.bot.zamanlayici) b.bot.durdur();
        const r = kagitSifirlaLib.sifirla({ ...durum, simdi: Date.now() });
        if (yeniAyak != null && yeniBotMu(b.ad)) ctx.BOT_KAYIT.guncelle(b.ad, (c) => { c.btcAyak = yeniAyak; }, 'BTC ayağı (kâğıt sıfırlama)');   // 74.5
        else if (yeniAyak != null) gocBotAyarYaz(b.ad, { btcAyak: yeniAyak }, 'BTC ayağı (kâğıt sıfırlama)');   // 74.7: kayda (tek kaynak)
        bindirmeler[b.ad] = bindirmeKur(b.ad, 'kagit');
        const yedekAd = r.yedek ? path.basename(r.yedek) : null;
        db.addLog('WARN', `[${b.ad}] kâğıt hesap sıfırlandı (temiz başlangıç, sermaye ${bindirmeAyar(b.ad).kagitBakiye} USDT · BTC ayağı ${bindirmeler[b.ad].bot.ayar.btcAyak === 'coklu' ? 'çoklu varlık' : 'spot'})${yedekAd ? ` — eski kayıtlar data/live/${yedekAd}` : ''}`);
        res.json({ success: true, yedek: yedekAd, sermaye: bindirmeAyar(b.ad).kagitBakiye, btcAyak: bindirmeler[b.ad].bot.ayar.btcAyak, bot: bindirmeler[b.ad].bot.ozet() });
      } catch (err) {
        if (err && err.kod === 409) return res.status(409).json({ success: false, error: err.message });
        res.status(500).json({ success: false, error: `kâğıt hesap sıfırlanamadı (bot olduğu gibi kaldı): ${err.message}` });
      }
    });

    app.post('/api/bindirme/:ad/baslat', async (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        bindirmeDemoCakisma(b);
        if (b.mod === 'canli') canliKapiGerekli(b.ad);
        await b.bagla();
        if (b.mod === 'canli' && !b.y.kilitAcik) throw new Error('gerçek para emir onayı verilmedi — kartta "Gerçek para emir onayı" (CANLI yazarak)');
        b.bot.baslat(); res.json({ success: true, bot: b.bot.ozet() });
      }
      catch (err) { borsaHata(res, err); }
    });

    /** O3 (62.1): para yatırma/çekme kaydı — { tutar: +/− USDT, not?, onay: 'KAYIT' }. Para taşımaz; ölçüm tabanlarını kaydırır.
     *  69.6: onay metni, tutar sınırı ve büyük kayıtta borsadaki özsermayeyle tutarlılık botta denetlenir (400). */
    app.post('/api/bindirme/:ad/sermaye-akisi', async (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        const g = req.body || {};
        const k = await b.bot.sermayeDegisikligi(g.tutar, g.not, { onay: g.onay });
        // Para akışı onayı (2026-10-25): kayıt bekleyen hareketi onayladıysa ya da ön kayıt olduysa metin ona göre.
        const satir = k.onKayit ? ['Ön kayıt: borsada 72 saat içinde eşleşen hareket görülünce bot onu onaylı sayar ve durmaz; o zamana kadar hiçbir hesap değişmez.']
          : k.onaylandi ? [`Borsada bekleyen hareket onaylandı; hesaplar yeni bakiyeye göre güncellendi.${k.devam ? ' Bot yeniden çalışır.' : ''}`]
            : ['Bot bu hareketi getiri saymaz (gölge karşılaştırması ve risk tepesi kaydırıldı).'];
        portfoyBildirici.gonder('bilgi', `${b.bot.adGorunen}: ${k.tutar > 0 ? 'para yatırma' : 'para çekme'} ${k.onKayit ? 'önceden kaydedildi' : k.onaylandi ? 'onaylandı' : 'kaydedildi'}`, satir);
        res.json({ success: true, kayit: k, bot: b.bot.ozet() });
      } catch (err) { borsaHata(res, err); }
    });

    /** C1/K1: gerçek para emir onayı (kalıcı, onaylanan tavanlarla) ya da geri alma ({ kapat: true }). Yalnız canli modda. */
    app.post('/api/bindirme/:ad/canli-onay', async (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        if (b.mod !== 'canli') throw new Error('emir onayı yalnız gerçek para modunda');
        if ((req.body || {}).kapat) {
          if (b.y.borsa) b.y.kilitKapat(); else b.y._onayKaldir('panelden kapatıldı (bağlı değil)');
          return res.json({ success: true, bot: b.bot.ozet(), yurutucu: b.y.borsa ? b.y.ozet() : null });
        }
        canliKapiGerekli(b.ad);
        await b.bagla();
        b.y.kilitAc(String((req.body || {}).onay || '').trim().toUpperCase());
        portfoyBildirici.gonder('alarm', `${b.bot.adGorunen}: GERÇEK PARA emir onayı verildi`, [`Tavan: emir ${b.y.ayar.maxEmirNominal} / sembol ${b.y.ayar.maxPozisyonNominal} USDT. Siz değilseniz hemen acil durdurun.`], { anahtar: `canli-onay:${Date.now()}` });
        res.json({ success: true, bot: b.bot.ozet(), yurutucu: b.y.ozet() });
      } catch (err) { borsaHata(res, err); }
    });

    app.post('/api/bindirme/:ad/durdur', (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      b.bot.durdur();
      res.json({ success: true, bot: b.bot.ozet() });
    });

    /** Kuru çalıştırma: hesap + plan, emir YOK, durum (sonW, evren, risk) yazılmaz. */
    app.post('/api/bindirme/:ad/kuru', async (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try { await b.bagla(); res.json({ success: true, rapor: await b.bot.calistir({ kuru: true }) }); }
      catch (err) { borsaHata(res, err); }
    });

    /** Günlük çalışmayı şimdi koş: önce mutabakat (uyuşmazlık → ENGEL), sonra emirler (kâğıt ya da demo). */
    app.post('/api/bindirme/:ad/calistir', async (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        // Y1 (61.7): süren çalışma varken ikinci tetikleme reddedilir (bot içi kilit zaten sıraya sokar; kullanıcıya açık söylenir).
        if (b.bot.calismaSuruyor()) return res.status(409).json({ success: false, error: 'Bir çalışma zaten sürüyor (zamanlanmış ya da başka bir sekmeden) — bitince sonuç kartta görünür.' });
        bindirmeDemoCakisma(b); await b.bagla();
        const r = await b.bot.gunlukCalisma();
        if (r && r.engel) throw new Error(`ENGEL: ${r.engel}`);
        res.json({ success: true, rapor: r });
      } catch (err) { borsaHata(res, err); }
    });

    app.post('/api/bindirme/:ad/mutabakat', async (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        await b.bagla(); await b.y.mutabakat();
        const m = await b.bot.mutabakat();
        if (!m.engel) tasimaLib.mutabakatTemiz(b.ad);   // 68.1: taşıma sonrası ilk temiz mutabakat → Başlat açılır
        if (m.engel) portfoyBildirici.gonder('alarm', `${b.bot.adGorunen}: mutabakat uyuşmazlığı`, [m.engel], { anahtar: `mutabakat:${b.ad}` });
        res.json({ success: true, mutabakat: m, bot: b.bot.ozet() });
      }
      catch (err) { borsaHata(res, err); }
    });

    /** Uygulama sapması ENGEL'ini elle kaldır (pozisyon uyuşmazlığı engeli yalnız temiz mutabakatla kalkar). */
    app.post('/api/bindirme/:ad/engel-kaldir', (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      const kaldirilan = b.bot.engelKaldir();
      try { ozDenetim.onayVerildi(b.ad); } catch { /* */ }   // 73.6 (Y-02): öz denetim sayaçları bu andan sonrasını sayar
      res.json({ success: true, kaldirilan, bot: b.bot.ozet() });
    });

    app.post('/api/bindirme/:ad/acil', async (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        // Y4 (61.7): acil, tam bağlantı + mutabakat istemez. Bağlanırken açılış mutabakatı hata verse bile borsa nesnesi
        // kurulduysa acil yine denenir (yürütücünün acilDurdur'u kendi okumalarını yapar). Hiç bağlanamazsa hata döner.
        try { await b.bagla({ mutabakatsiz: true }); } catch (e) {
          if (!b.y.borsa) throw e;
          db.addLog('WARN', `[ACİL] ${b.ad}: bağlantı sırasında mutabakat hatası (${e.message}) — acil yine uygulanıyor`);
        }
        res.json({ success: true, rapor: await b.bot.acilDurdur('panel'), bot: b.bot.ozet() });
      }
      catch (err) { borsaHata(res, err, 500); }
    });

    /** ACİL DURDURMAYI DENE (yalnız demo): küçük uzak limit emir → acil durdurma → doğrulama → mutabakat. */
    app.post('/api/bindirme/:ad/acil-dene', async (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        if (b.mod !== 'demo') throw new Error('acil durdurma denemesi yalnız demo modunda (kâğıtta "Acil" düğmesi zaten gerçek borsaya dokunmaz)');
        bindirmeDemoCakisma(b); await b.bagla();
        const r = await b.bot.acilDene();
        res.status(r.basarili ? 200 : 500).json({ success: r.basarili, error: r.basarili ? null : 'acil durdurma denemesi başarısız — ayrıntı sonuçta', sonuc: r, bot: b.bot.ozet() });
      } catch (err) { borsaHata(res, err, 500); }
    });

    /**
     * İŞLEMLER / GRAFİK (panel: Canlı İzleme → portföy botu ayrıntısı). Borsa çağrıları önbellekli:
     *   · canlı görünüm (pozisyon + açık emir): bot başına 15 sn
     *   · fetchMyTrades mutabakatı: 5 dk (IslemGecmisi kendi sınırı)
     *   · günlük mumlar: sembol başına 10 dk
     * Bot bağlı değilse borsaya bağlanılmaz (yalnız kayıtlı geçmiş gösterilir).
     */
    const { grafikIsaretleri, grafikIslemleri, ozsermayeKarsilastir } = require('../live/islemGecmisi');
    const bindirmeGorunumOnbellek = {};
    const bindirmeMumOnbellek = new Map();
    let bindirmeVeriIstemcisi = null;

    app.get('/api/bindirme/:ad/islemler', async (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        b.bot.islemGecmisiGuncelle();
        let canli = null, canliHata = null;
        if (b.y.borsa) {
          const o = bindirmeGorunumOnbellek[b.ad];
          if (o && o.dizin === b.dizin && Date.now() - o.zaman < 15000) canli = o.veri;
          else {
            try { canli = await b.bot.canliGorunum(); bindirmeGorunumOnbellek[b.ad] = { zaman: Date.now(), dizin: b.dizin, veri: canli }; }
            catch (e) { canliHata = e.message; }
          }
          // Borsa işlem kayıtlarıyla tamamla (gerçek fiyat/ücret); en çok 5 dk'da bir.
          await b.bot.gecmis.borsaMutabakat(b.y.borsa, b.y.defter).catch(() => null);
        }
        const q = req.query || {};
        const gs = q.grafikSembol ? String(q.grafikSembol) : null;
        const satirlar = b.bot.gecmis.satirlar();
        res.json({ success: true, mod: b.mod, bagli: !!b.y.borsa, canli, canliHata, hesap: bindirmeHesapAdi(b),
          // Botun işlem gördüğü semboller (grafik hızlı geçiş düğmeleri) ve gösterilen sembolün işaretleri
          islemSembolleri: [...new Set(satirlar.map(x => String(x.symbol).replace(' (spot)', '').split(':')[0]))].sort(),
          isaretler: gs ? grafikIsaretleri(satirlar, gs) : [],
          gecmis: b.bot.gecmis.liste({ symbol: q.sembol || null, kol: q.kol || null, sayfa: q.sayfa, boyut: q.boyut, bas: tarihBas(q.bas), bit: tarihBit(q.bit) }) });
      } catch (err) { borsaHata(res, err, 500); }
    });

    /**
     * HESAP İŞLEMLERİ (lib/live/hesapIslemleri.js) — bağlı her hesabın (demo/canlı; kâğıt botların kendi
     * kâğıt borsası) TÜM dolumları + funding, data/live/hesap-islemleri.jsonl (yalnız ekle).
     * Açılıştan 2 dk sonra (sunucu kapalıyken oluşan boşluk doldurulur) ve 15 dk'da bir eşitlenir.
     */
    const { HesapIslemleri } = require('../live/hesapIslemleri');
    const hesapIslemleri = new HesapIslemleri(path.join(CANLI_DIZIN, 'hesap-islemleri.jsonl'), { kaydet: (sv, m) => db.addLog(sv, `[HESAP] ${m}`) });
    const tarihBas = (g) => (/^\d{4}-\d{2}-\d{2}$/.test(String(g || '')) ? Date.parse(`${g}T00:00:00Z`) : null);
    const tarihBit = (g) => (/^\d{4}-\d{2}-\d{2}$/.test(String(g || '')) ? Date.parse(`${g}T23:59:59.999Z`) : null);
    /** 74.5: yeni bot Anahtarlar'daki AYRI bir demo hesaba bağlıysa o hesabın adıyla (demo-<kimlik>) — Kairos'un "testnet" defteriyle karışmasın. */
    function bindirmeHesapAdi(b) { const hid = yeniBotMu(b.ad) ? botHesapId(b) : null; if (hid && !anahtarlarLib.SABIT[hid]) return `demo-${hid}`; return b.y.borsa ? (b.y.ortam === 'kagit' ? `kagit-${b.ad}` : b.y.ortam) : (b.mod === 'demo' ? 'testnet' : `kagit-${b.ad}`); }

    /** Bağlı yürütücüler → hesap grupları (aynı hesabı paylaşan defterler birlikte sınıflanır). */
    function hesapGruplari() {
      const g = new Map();
      const ekle = (hesap, y, kaynak, spot = null) => {
        if (!y || !y.borsa) return;
        // Yürütücünün geri çekilme kapısından (F2): 418 ban'da fetchMyTrades/funding/fetchOrder atılmaz.
        if (!g.has(hesap)) g.set(hesap, { hesap, borsa: (typeof y.kapiliBorsa === 'function' && y.kapiliBorsa()) || y.borsa, defterler: [] });
        g.get(hesap).defterler.push({ kaynak, defter: y.defter });
        if (spot) g.get(hesap).spot = spot;   // D5 (62.2): çoklu varlık — spot BTC, aktarım, otomatik çevrim de kayda
      };
      for (const ad of BINDIRME_ADLAR) { const b = bindirmeler[ad]; ekle(bindirmeHesapAdi(b), b.y, ad, b.bot.ayar.btcAyak === 'coklu' ? { varlik: b.bot.ayar.varlik || 'BTC' } : null); }
      if (canli.borsa) ekle(canli.ortam === 'kagit' ? 'kagit-borsa' : canli.ortam, canli, 'donchianBot');
      return [...g.values()];
    }
    async function hesapSenkron() {
      const sonuc = [];
      for (const grup of hesapGruplari()) {
        try { sonuc.push(await hesapIslemleri.senkron(grup)); } catch (e) { sonuc.push({ hesap: grup.hesap, hata: e.message }); }
      }
      return sonuc;
    }
    setTimeout(() => { hesapSenkron().catch(() => null); }, 2 * 60 * 1000).unref();
    setInterval(() => { hesapSenkron().catch(() => null); }, 15 * 60 * 1000).unref();

    const hesapSuzgec = (q = {}) => ({ hesap: q.hesap || null, bas: tarihBas(q.bas), bit: tarihBit(q.bit), symbol: q.sembol || null, kaynak: q.kaynak || null, tur: q.tur || null, sayfa: q.sayfa, boyut: q.boyut });
    app.get('/api/hesap-islemleri', (req, res) => {
      try { res.json({ success: true, ...hesapIslemleri.liste(hesapSuzgec(req.query)) }); } catch (err) { borsaHata(res, err, 500); }
    });
    app.post('/api/hesap-islemleri/senkron', async (req, res) => {
      try { res.json({ success: true, sonuc: await hesapSenkron() }); } catch (err) { borsaHata(res, err, 500); }
    });
    /** CSV dışa aktarma — panel bağlantısı (aynı sunucu, indirme). Süzgeçler sorgudan. */
    app.get('/api/hesap-islemleri.csv', (req, res) => {
      try {
        const f = hesapSuzgec(req.query);
        const ad = `hesap-islemleri${f.hesap ? '-' + String(f.hesap).replace(/[^a-z0-9-]/gi, '') : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${ad}"`);
        res.send(hesapIslemleri.csv(f));
      } catch (err) { borsaHata(res, err, 500); }
    });

    /**
     * HESAPLAR (Pusula P3, lib/hesaplar.js) — SALT OKUMA birleşik görünüm: bağlı her hesap (Hesaplar ekranının elle
     * bağlantısı, Hücum/Denge, Kalkan) + kâğıt işlem motoru → tek pozisyon listesi, tek emir/işlem listesi.
     * Emir vermez, durum yazmaz; GET olduğu için araştırma modunda da açık. Borsa okuması hesap başına 15 sn önbellekli.
     */
    const { HesaplarGorunum, gunAraligi } = require('../hesaplar');
    const anahtarMaske = (k) => (k ? { kayitli: true, son4: String(k).slice(-4) } : { kayitli: false, son4: null });
    const hesaplarGorunum = new HesaplarGorunum({
      yurutuculer: () => {
        const l = [];
        if (canli.borsa) l.push({ kaynak: 'elle', hesap: canli.ortam === 'kagit' ? 'kagit-borsa' : canli.ortam, y: canli });
        for (const ad of BINDIRME_ADLAR) { const b = bindirmeler[ad]; l.push({ kaynak: ad, hesap: bindirmeHesapAdi(b), y: b.y, bot: b.bot }); }
        if (kalkanYurutucu.borsa) l.push({ kaynak: 'kalkan', hesap: 'kagit-kalkan', y: kalkanYurutucu });
        return l;
      },
      kagitMotor: () => {
        const b = engine.exchange.getBalances();
        return { positions: b.positions || [], tickerMap: (engine.lastState && engine.lastState.tickerMap) || {}, orders: db.getOrders(500), trades: db.getTrades(500),
          calisiyor: !!engine.isRunning && engine.getBots().length > 0, bakiye: { toplam: engine.getTotalEquity(), serbest: (b.balances && b.balances.USDT) || 0, kullanilan: null } };
      },
      hesapIslemleri,
      // Anahtarın kendisi panele GİTMEZ: yalnız kayıtlı mı + API Key'in son 4 hanesi (secret hiç).
      anahtarlar: () => ({ testnet: anahtarMaske(ctx.config.testnetApiSecret && ctx.config.testnetApiKey), live: anahtarMaske(ctx.config.apiSecret && ctx.config.apiKey) })
    });
    // Tarih süzgeci tarayıcının gününe göre (tz = getTimezoneOffset; tablo zamanı yerel saatle yazıyor).
    const hesaplarSuzgec = (q = {}) => ({ durum: q.durum || '', hesap: q.hesap || null, kaynak: q.kaynak || null, symbol: q.sembol || null, ...gunAraligi(q.bas, q.bit, q.tz), sayfa: q.sayfa, boyut: q.boyut });
    app.get('/api/hesaplar', async (req, res) => {
      try { res.json({ success: true, ...(await hesaplarGorunum.anlik({ zorla: !!(req.query || {}).yenile })) }); } catch (err) { borsaHata(res, err, 500); }
    });
    app.get('/api/hesaplar/islemler', async (req, res) => {
      try { res.json({ success: true, ...(await hesaplarGorunum.islemler(hesaplarSuzgec(req.query))) }); } catch (err) { borsaHata(res, err, 500); }
    });
    app.get('/api/hesaplar/islemler.csv', async (req, res) => {
      try {
        const metin = await hesaplarGorunum.csv(hesaplarSuzgec(req.query));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="hesaplar-emir-islem-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send(metin);
      } catch (err) { borsaHata(res, err, 500); }
    });

    app.get('/api/bindirme/:ad/grafik', async (req, res) => {
      const b = bindirmeBul(req, res); if (!b) return;
      try {
        b.bot.islemGecmisiGuncelle();
        const satirlar = b.bot.gecmis.satirlar();
        const semboller = [...new Set(satirlar.map(x => String(x.symbol).replace(' (spot)', '').split(':')[0]))].sort();
        let sembol = String((req.query || {}).sembol || '') || semboller[0] || 'BTC/USDT';
        sembol = sembol.split(':')[0];
        const perp = `${sembol}:USDT`;
        const anahtar = perp;
        let mumlar = null, mumHata = null;
        const o = bindirmeMumOnbellek.get(anahtar);
        if ((req.query || {}).mumsuz) mumlar = [];                      // panel Performans sekmesi: mum gerekmez
        else if (o && Date.now() - o.zaman < 10 * 60000) mumlar = o.mumlar;
        else {
          try {
            let istemci = b.y.borsa;
            if (!istemci) { if (!bindirmeVeriIstemcisi) { const ccxt = require('ccxt'); bindirmeVeriIstemcisi = new ccxt.binanceusdm({ enableRateLimit: true }); } istemci = bindirmeVeriIstemcisi; }
            const ham = await istemci.fetchOHLCV(perp, '1d', undefined, 300);
            mumlar = ham.map(m => ({ t: m[0], o: m[1], h: m[2], l: m[3], c: m[4] }));
            bindirmeMumOnbellek.set(anahtar, { zaman: Date.now(), mumlar });
          } catch (e) { mumHata = e.message; }
        }
        const golge = isletim.golgeOku(GOLGE_DOSYA);
        res.json({ success: true, sembol, semboller, mumlar: mumlar || [], mumHata,
          isaretler: grafikIsaretleri(satirlar, sembol),
          islemler: grafikIslemleri(satirlar),   // 71.0: Botlar › Genel takvim + getiri grafiği noktaları (tüm semboller)
          ozsermaye: ozsermayeKarsilastir(b.bot.ozsermayeOku(), golge, b.ad, b.bot.durum.sermayeAkislari) });
      } catch (err) { borsaHata(res, err, 500); }
    });

    /** Portföy botlarının Telegram durumu (panel "Telegram bağlı değil" satırı). */
    app.get('/api/bindirme-telegram', (req, res) => {
      res.json({ success: true, telegram: portfoyBildirici.durum(), son: portfoyBildirici.gecmis.slice(-10) });
    });
  }

  return { botlarUclari, bindirmeUclari };
}

module.exports = { olustur, borsadaYokOzeti };
