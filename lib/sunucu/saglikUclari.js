/**
 * C1 (75.0, TASARIM-MAKINE-HESAP-BOT §3 parça 2) — server.js'ten taşındı, davranış AYNI. SAĞLIK uçları, üç grup:
 *   ozDenetimUclari()  69.1 öz denetim kurulumu (OzDenetim, ağ ölçümü, kara kutu verisi, db.addLog gözlemi, açılış kaydı, baslat) +
 *                      GET /api/saglik/oz, /api/saglik/ikinci-kanal (GET/POST, /dene), POST /api/saglik/kara-kutu/:ad,
 *                      GET /api/saglik/kara-kutu/dosya/:dosya, POST /api/saglik/oz/yokla, /api/saglik/oz/:ad/guvenli-kip-kaldir,
 *                      74.3 GET /api/veri-kalitesi, POST /api/veri-kalitesi/kip  → { ozDenetim }
 *   durumUclari()      GET /api/health, GET /api/status
 *   testUclari()       POST /api/saglik/test, GET /api/saglik/durum, sunucu kalp atışı zamanlayıcısı (healthchecksSunucuUrl)
 * Üç grup server.js'te ESKİ YERLERİNDE çağrılır (aralarında sorun merkezi ve diğer uçlar) — Express uç sırası ve zamanlayıcıların
 * kurulma sırası birebir aynı (scripts/sunucu-uc-envanteri-selftest.js). ctx alanları KULLANIM ANINDA okunur (lib/sunucu/baglam.js):
 * `config` → ctx.config, sonra kurulan Telegram yoklayıcısı → ctx.telegramYoklayici, sırların durumu → ctx.ayar.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const yollar = require('../yollar');
const db = require('../database');
const sirKasasi = require('../sirKasasi');
const isletim = require('../live/isletim');
const VeriKalitesi = require('../live/veriKalitesi');
const guncelleme = require('../guncelleme');
const tasimaLib = require('../tasima');

function olustur(ctx) {
  const ayar = ctx.ayar;

  function ozDenetimUclari() {
    const { app, kok, APP_VERSION, ARASTIRMA_MODU, COMMIT, BINDIRME_ADLAR, bindirmeler, botEtiketi, portfoyBildirici, saglikBotlar, saglikSunucu,
      diskDurumu, ikinciKanal, veriKalitesiAyar, shutdown, sonKapanisPlanliMi, saveConfig } = ctx;
    const { SECRETS_PATH, loadSecrets, saveSecrets, loadConfig, ayarIzi } = ayar;
    // Lightweight liveness probe for supervisors / uptime monitors.
    /**
     * ÖZ DENETİM (69.1, lib/ozDenetim.js, PLAN-OZ-DENETIM.md) — 5 dk'da bir 19 denetim; güvenli onarım, güvenli kip, tam kapanma
     * (= bot ENGEL'i). Panel: Sistem › Sağlık (#/saglik) + ana sayfa "Sistem sağlığı" kartı. Demo kipindeki bota (demo kabul,
     * 2026-12-09'a kadar) hiçbir şey yapmaz — yalnız haber. Araştırma modunda ÇALIŞMAZ (botlar sunucuda; panel sunucunun
     * /api/saglik/oz yanıtını okur — lib/evOkuma.js EV_YOLU).
     *   GET  /api/saglik/oz                         anlık görüntü + son 30 günün olayları
     *   POST /api/saglik/oz/yokla                   şimdi yokla
     *   POST /api/saglik/oz/:ad/guvenli-kip-kaldir  güvenli kipi elle kaldır (tam kapanma: /api/bindirme/:ad/engel-kaldir)
     *   69.2: POST /api/saglik/kara-kutu/:ad (olay raporu şimdi; ad = bot ya da "sistem") · GET /api/saglik/kara-kutu/dosya/:dosya (indir)
     *         bağdaştırıcı + bilgisayar (lib/sunucuBilgisayari.js) + borsaTakvimi (lib/borsaTakvimi.js) + karaKutuVeri.
     */
    const { OzDenetim } = require('../ozDenetim');
    async function ozAgOlc() {
      const al = async (url, o = {}) => { const bas = Date.now(); const r = await fetch(url, { signal: AbortSignal.timeout(8000), ...o }); return { r, sure: Date.now() - bas }; };
      const sonuc = { binance: false, github: false, saatFarkMs: null, gecikmeMs: null, fiyat: {} };
      await Promise.all([
        (async () => {
          try {
            const { r, sure } = await al('https://fapi.binance.com/fapi/v1/time');
            const j = await r.json();
            if (Number.isFinite(j.serverTime)) { sonuc.binance = true; sonuc.gecikmeMs = sure; sonuc.saatFarkMs = Date.now() - sure / 2 - j.serverTime; }
          } catch { /* ulaşılamadı */ }
          try { const { r } = await al('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'); const j = await r.json(); const f = +j.markPrice; if (f > 0) { sonuc.fiyat.binance = f; sonuc.binance = true; } } catch { /* */ }
        })(),
        (async () => { try { const { r } = await al('https://github.com', { method: 'HEAD' }); sonuc.github = r.status < 500; } catch { /* */ } })(),
        (async () => {
          try { const { r } = await al('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT'); const j = await r.json(); const f = +(j.data && j.data[0] && j.data[0].last); if (f > 0) { sonuc.fiyat.ikinci = f; sonuc.fiyat.ikinciAd = 'OKX'; } } catch { /* */ }
        })(),
      ]);
      return sonuc;
    }
    const KILIT_YOLU = () => yollar.programVeri(kok, 'guncelleme.kilit');
    const ozCalistir = (komut, args, o = {}) => new Promise((coz) => {
      require('child_process').execFile(komut, args, { timeout: o.sure || 20000, windowsHide: true, encoding: 'utf8', maxBuffer: 4 << 20 },
        (e, out, err) => coz({ kod: e ? (Number.isInteger(e.code) ? e.code : 1) : 0, cikti: `${out || ''}${err || ''}` }));
    });
    /** 69.2 kara kutu: o anın sunucu tarafı (bot ve yürütücü özeti, son 30 dk günlük, güncelleme). Sır yok (özetlerde anahtar bulunmaz). */
    function ozKaraKutuVeri(b, o = {}) {
      const guvenli = (fn) => { try { return fn(); } catch (e) { return { hata: e.message }; } };
      const simdi = Date.now(), sinir = simdi - (o.gunlukMs || 30 * 60000);
      const gunluk = [];
      for (const g of [...new Set([new Date(sinir).toISOString().slice(0, 10), new Date(simdi).toISOString().slice(0, 10)])]) {
        let metin = '';
        try { metin = fs.readFileSync(yollar.veri('gunluk', `${g}.jsonl`), 'utf8'); } catch { continue; }
        for (const satir of metin.split('\n')) {
          if (!satir.trim()) continue;
          let x; try { x = JSON.parse(satir); } catch { continue; }
          const t = Date.parse(x.t || x.zaman);
          if (t >= sinir) gunluk.push({ t: x.t || x.zaman, s: x.s || x.seviye, m: String(x.m || x.mesaj || '').slice(0, 600) });
        }
      }
      return {
        surum: APP_VERSION, commit: COMMIT, ayarIzi: ayarIzi(), sistem: { bellekMB: Math.round(process.memoryUsage().rss / 1048576), acikSn: Math.round(process.uptime()), disk: diskDurumu() },
        botOzet: b ? guvenli(() => b.bot.ozet()) : null, yurutucu: b ? guvenli(() => b.y.ozet()) : null,
        kolEngel: b && b.bot.kol && b.bot.kol.durum ? b.bot.kol.durum.engel || null : null,
        guncelleme: guvenli(() => { const d = guncelleme.durumOku(kok); return { durum: d.durum, kurulu: d.kurulu || null, kontrol: d.kontrol || null, neden: d.neden || null, kuruDeneme: d.kuruDeneme || null }; }),
        gunluk: gunluk.slice(-400),
      };
    }
    const ozDenetim = new OzDenetim({
      dizin: yollar.veri('oz-denetim'), bildirici: portfoyBildirici, kaydet: (sv, m) => db.addLog(sv, m),
      ctx: {
        botlar: () => BINDIRME_ADLAR.map(ad => bindirmeler[ad]).filter(Boolean).map(b => ({ ad: b.ad, mod: b.mod, adGorunen: b.bot.adGorunen, dizin: b.dizin,
          etiket: botEtiketi(b.ad).toLocaleUpperCase('tr-TR') + (b.mod === 'demo' ? '·DEMO' : ''), bot: b.bot, y: b.y })),
        disk: () => { try { const st = fs.statfsSync(kok); return { bosGB: +((st.bavail * st.bsize) / 1e9).toFixed(1), toplamGB: +((st.blocks * st.bsize) / 1e9).toFixed(1) }; } catch (e) { return { hata: e.message }; } },
        bellekMB: () => Math.round(process.memoryUsage().rss / 1048576),
        denetleyici: () => { try { return JSON.parse(fs.readFileSync(yollar.veri('denetleyici.json'), 'utf8')); } catch { return null; } },
        denetleyiciVar: () => !!process.env.PUSULA_KONSOL_GUNLUGU,
        kilit: () => {
          let st; try { st = fs.statSync(KILIT_YOLU()); } catch { return null; }
          let pid = null, yasiyor = false;
          try { pid = parseInt(fs.readFileSync(KILIT_YOLU(), 'utf8'), 10); if (pid > 0) { process.kill(pid, 0); yasiyor = true; } } catch (e) { yasiyor = !!(e && e.code === 'EPERM'); }
          return { zaman: st.mtimeMs, pid, yasiyor };
        },
        kilitSil: () => { fs.rmSync(KILIT_YOLU(), { force: true }); db.addLog('WARN', '[ÖZ DENETİM] sahipsiz güncelleme kilidi silindi'); return true; },
        ayarBozuk: () => [loadConfig._yedekten, ayar.SIRLAR_BOZUK, ayar.SIRLAR_KILITLI],
        sirKasasi: () => ({ sifreli: sirKasasi.sifreliMi(SECRETS_PATH), etkin: sirKasasi.etkinMi(), kilitli: ayar.SIRLAR_KILITLI, var: fs.existsSync(SECRETS_PATH),
          // 69.6: kapsam (CurrentUser beklenir), düz kip (PUSULA_SIR_DUZ=1) ve diğer kasa dosyaları (düz kalan var mı)
          kapsam: sirKasasi.kapsamOku(SECRETS_PATH), duzKip: sirKasasi.duzKipMi(),
          duzKalan: sirKasasi.KASA_DOSYALARI.filter(ad => ad !== 'secrets.json' && fs.existsSync(yollar.veri(ad)) && !sirKasasi.sifreliMi(yollar.veri(ad))) }),
        yedek: () => { try { return JSON.parse(fs.readFileSync(yollar.veri('yedek-ayar.json'), 'utf8')); } catch { return null; } },
        guncelleme: () => { const d = guncelleme.durumOku(kok); return { durum: d.durum, mesaj: d.neden, calisan: APP_VERSION, commit: COMMIT, ayarIzi: ayarIzi(), yarida: !!(d.islem && !d.islem.bitti && !guncelleme.kilitVar(kok)),
          // 69.6 imza: son kontrolün sonucu; yoksa imza dosyası var mı
          imza: (d.imza && d.imza.durum && d.imza.durum !== 'atlandi') ? d.imza.durum : (fs.existsSync(guncelleme.imzaDosyasi(kok)) ? 'kurulu' : 'kurulmadi') }; },
        telegram: () => ({ ...portfoyBildirici.durum(), gecmis: portfoyBildirici.gecmis, kuyruk: portfoyBildirici._kuyrukOku().length,
          komut: (() => { try { return ctx.telegramYoklayici.durum(); } catch { return null; } })() }),   // 73.6 (S05) komut yoklaması
        sinyal: () => [...BINDIRME_ADLAR.map(ad => ({ ad: botEtiketi(ad), ...saglikBotlar[ad].durum() })), { ad: 'sunucu', sunucu: true, ...saglikSunucu.durum() }],
        kalp: (b) => isletim.kalpOku(b.dizin),
        gunlukDizin: () => yollar.veri('gunluk'),
        ag: ozAgOlc,
        // 69.6: güvenlik ölçümü de (antivirüs, güvenlik duvarı, port, RDP, Pusula klasör izinleri)
        bilgisayar: () => require('../sunucuBilgisayari').olc(ozCalistir, process.platform),
        borsaTakvimi: () => require('../borsaTakvimi').getir(fetch),
        // 69.3 funding: tek istek, tüm semboller (anahtarsız) → { oranlar: { ETHUSDT: 0.0001, … } }
        funding: async () => {
          const r = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex', { signal: AbortSignal.timeout(12000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const l = await r.json();
          const oranlar = {};
          for (const x of Array.isArray(l) ? l : []) { const v = +x.lastFundingRate; if (x.symbol && Number.isFinite(v)) oranlar[x.symbol] = v; }
          return { oranlar };
        },
        karaKutuVeri: ozKaraKutuVeri,
        // C5: API anahtarı yetkisi (günde bir, SALT OKUMA — lib/anahtarlar.js yetkiDenetimi, Anahtarlar › Sına ile aynı kod; emir yok)
        anahtarYetki: (o) => ctx.anahtarlar.yetkiDenetimi(o),
        // 69.4 npm audit (günde bir; ücretsiz kayıt hizmeti) — çalışan Node'un yanındaki npm
        npmAudit: () => new Promise((coz) => {
          const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
          if (!fs.existsSync(cli)) return coz({ hata: 'npm bulunamadı' });
          require('child_process').execFile(process.execPath, [cli, 'audit', '--omit=dev', '--json'], { cwd: kok, timeout: 90000, windowsHide: true, maxBuffer: 32 << 20 }, (e, out) => {
            try { const j = JSON.parse(out); coz({ acik: (j.metadata && j.metadata.vulnerabilities) || {}, paketler: Object.entries(j.vulnerabilities || {}).filter(([, v]) => ['high', 'critical'].includes(v.severity)).map(([k, v]) => `${k} (${v.severity === 'critical' ? 'kritik' : 'yüksek'})`) }); }
            catch { coz({ hata: e ? e.message : 'çıktı okunamadı' }); }
          });
        }),
        // 69.4 ikinci ölü adam (Better Stack ücretsiz heartbeat ya da başka bir healthchecks hesabı): 5 dk'da bir GET
        ikinciSinyal: async () => {
          const u = ikinciKanal().sinyalUrl;
          if (!u || ARASTIRMA_MODU) return { atlandi: true };
          const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
          return { ok: r.ok, hata: r.ok ? null : `HTTP ${r.status}` };
        },
        yenidenBaslat: (sebep) => {
          if (!process.env.PUSULA_KONSOL_GUNLUGU) throw new Error('Pusula denetleyicisiz başlatılmış — kapanırsa geri açılmaz');
          db.addLog('WARN', `🔄 ${sebep} — Pusula yeniden başlatılıyor (denetleyici birkaç saniye sonra açar)`);
          setTimeout(() => shutdown(sebep, 75), 1500).unref();
          return true;
        },
      },
    });
    if (!ARASTIRMA_MODU) {
      const asilAddLog = db.addLog.bind(db);
      db.addLog = (seviye, mesaj) => { asilAddLog(seviye, mesaj); try { ozDenetim.gunlukGozle(seviye, mesaj); } catch { /* gözlem işi durdurmaz */ } };
      // 73.6 (S12): önceki süreç TEMİZ kapandıysa (güncelleme / panelden yeniden başlatma / Pusula'yı durdur — kapat() işareti) açılış planlıdır.
      ozDenetim.acilisKaydet({ planli: sonKapanisPlanliMi() });
      ozDenetim.baslat();
    }
    app.get('/api/saglik/oz', (req, res) => {
      res.json({ success: true, calisiyor: !ARASTIRMA_MODU, ...ozDenetim.goruntu(), olaylar: ozDenetim.olaylar(30), karaKutular: ozDenetim.karaKutular(30) });
    });
    /** 69.4 İkinci uyarı kanalı: GET durum (maskeli) · POST kaydet { ntfyKonu, sinyalUrl } · POST /dene (ntfy'a deneme iletisi). */
    app.get('/api/saglik/ikinci-kanal', (req, res) => {
      const k = ikinciKanal();
      const maske = (s) => (s ? `${String(s).slice(0, 4)}…${String(s).slice(-3)}` : null);
      res.json({ success: true, ntfy: { ayarli: !!k.konu, maske: maske(k.konu) }, sinyal: { ayarli: !!k.sinyalUrl, maske: k.sinyalUrl ? String(k.sinyalUrl).replace(/^(https?:\/\/[^/]+\/).*$/, '$1…') : null },
        son: (portfoyBildirici.ikinciGecmis || []).slice(-5) });
    });
    app.post('/api/saglik/ikinci-kanal', (req, res) => {
      if (ARASTIRMA_MODU) return res.status(409).json({ success: false, error: 'İkinci kanal sunucuda ayarlanır — bu bilgisayar geliştirme kopyası.' });
      const g = req.body || {};
      const k = { ...((loadSecrets().ikinciKanal) || {}) };
      if ('ntfyKonu' in g) {
        const v = String(g.ntfyKonu || '').trim();
        if (v && !/^[A-Za-z0-9_-]{12,64}$/.test(v)) return res.status(400).json({ success: false, error: 'ntfy konusu 12–64 harf/rakam/-/_ olmalı (tahmin edilemeyecek uzunlukta seçin; konuyu bilen herkes iletileri görebilir).' });
        if (v) k.ntfyKonu = v; else delete k.ntfyKonu;
      }
      if ('sinyalUrl' in g) {
        const v = String(g.sinyalUrl || '').trim();
        if (v && !/^https:\/\/[^\s]{8,300}$/.test(v)) return res.status(400).json({ success: false, error: 'ikinci ölü adam adresi https:// ile başlamalı (Better Stack heartbeat ya da healthchecks ping adresi).' });
        if (v && [ctx.config.healthchecksUrl, ctx.config.healthchecksSunucuUrl].includes(v)) return res.status(400).json({ success: false, error: 'ikinci ölü adam, mevcut healthchecks adreslerinden FARKLI olmalı (bağımsız ikinci izleyici).' });
        if (v) k.sinyalUrl = v; else delete k.sinyalUrl;
      }
      try { const s = loadSecrets(); if (Object.keys(k).length) s.ikinciKanal = k; else delete s.ikinciKanal; saveSecrets(s); }
      catch (e) { return res.status(500).json({ success: false, error: e.message }); }
      db.addLog('INFO', `[İŞLETİM] ikinci uyarı kanalı güncellendi: ntfy ${k.ntfyKonu ? 'ayarlı' : 'yok'} · ikinci ölü adam ${k.sinyalUrl ? 'ayarlı' : 'yok'}`);
      res.json({ success: true });
    });
    app.post('/api/saglik/ikinci-kanal/dene', async (req, res) => {
      const r = await portfoyBildirici._ikinci('uyari', 'deneme iletisi', ['Bu ileti Telegram\'dan bağımsız ikinci kanaldan (ntfy) geldi. Telegram düşerse ACİL uyarılar buradan da gelir.']);
      if (r.atlandi) return res.status(400).json({ success: false, error: 'ntfy konusu ayarlı değil' });
      res.status(r.ok ? 200 : 502).json({ success: !!r.ok, error: r.ok ? null : `ntfy'a gönderilemedi: ${r.hata}` });
    });

    app.post('/api/saglik/kara-kutu/:ad', (req, res) => {
      if (ARASTIRMA_MODU) return res.status(409).json({ success: false, error: 'Olay raporu sunucuda yazılır — bu bilgisayar geliştirme kopyası.' });
      const b = req.params.ad === 'sistem' ? null : bindirmeler[req.params.ad];
      if (req.params.ad !== 'sistem' && !b) return res.status(404).json({ success: false, error: `bilinmeyen bot: ${req.params.ad}` });
      const dosya = ozDenetim.karaKutu(b ? { ad: b.ad, adGorunen: b.bot.adGorunen, mod: b.mod, bot: b.bot, y: b.y } : null, 'elle', 'panelden elle istendi');
      if (!dosya) return res.status(500).json({ success: false, error: 'rapor yazılamadı' });
      res.json({ success: true, dosya, karaKutular: ozDenetim.karaKutular(30) });
    });
    app.get('/api/saglik/kara-kutu/dosya/:dosya', (req, res) => {
      const y = ozDenetim.karaKutuYolu(req.params.dosya);
      if (!y) return res.status(404).json({ success: false, error: 'rapor bulunamadı' });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(y)}"`);
      res.send(fs.readFileSync(y, 'utf8'));
    });
    app.post('/api/saglik/oz/yokla', async (req, res) => {
      if (ARASTIRMA_MODU) return res.status(409).json({ success: false, error: 'Öz denetim sunucuda çalışır — bu bilgisayar geliştirme kopyası.' });
      try { await ozDenetim.yokla({ zorla: true }); res.json({ success: true, ...ozDenetim.goruntu(), olaylar: ozDenetim.olaylar(30) }); }
      catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });
    app.post('/api/saglik/oz/:ad/guvenli-kip-kaldir', (req, res) => {
      const b = bindirmeler[req.params.ad];
      if (!b) return res.status(404).json({ success: false, error: `bilinmeyen bot: ${req.params.ad}` });
      const g = b.bot.guvenliKipKaldir();
      if (g) { try { ozDenetim.onayVerildi(b.ad); } catch { /* */ } }   // 73.6 (Y-02): sayaçlar bu andan sonrasını sayar
      res.json({ success: true, kaldirilan: g, bot: b.bot.ozet() });
    });

    /**
     * 74.3 VERİ KALİTESİ (D4): GET /api/veri-kalitesi { kip, izleme, esikler, botlar: { <ad>: { kip, etkin, dokunulmaz, son, acik, sayac30, sonBulgular } } }
     * (telefonda da; araştırma kopyasında lib/evOkuma.js sunucudan okur) · POST /api/veri-kalitesi/kip { kip, onay: true } — yalnız bu bilgisayar
     * (telefon / geliştirme 403), sunucuda. Etkin → izleme geçişinde veri kalitesinin koyduğu güvenli kip hemen kalkar.
     */
    function veriKalitesiDurum(simdi = Date.now()) {
      const a = veriKalitesiAyar();
      const liste = BINDIRME_ADLAR.map(ad => bindirmeler[ad]).filter(b => b && b.bot && b.bot.ayar.veriKalitesi);
      const botlar = {};
      for (const b of liste) {
        const d = b.bot.ayar.veriKalitesi.durum({ mod: b.mod });
        const gk = b.bot.durum.guvenliKip;
        botlar[b.ad] = { ad: b.ad, adGorunen: b.bot.adGorunen, mod: b.mod, calisiyor: !!b.bot.durum.calisiyor, ...d, guvenliKip: gk && gk.kaynak === 'veri' ? gk : null };
      }
      return { success: true, calisiyor: !ARASTIRMA_MODU, kip: a.kip, esikler: a.esikler, demoKorumaBitis: new Date(VeriKalitesi.KORUMA_BITIS).toISOString(),
        izleme: VeriKalitesi.izlemeBilgisi({ kip: a.kip, izlemeBas: a.izlemeBas, kapilar: liste.map(b => b.bot.ayar.veriKalitesi), simdi }), botlar };
    }
    app.get('/api/veri-kalitesi', (req, res) => {
      try { res.json(veriKalitesiDurum()); } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });
    app.post('/api/veri-kalitesi/kip', (req, res) => {
      if ((req.kademe || 'yerel') !== 'yerel') return res.status(403).json({ success: false, error: 'Veri kalitesi kipi yalnız sunucu bilgisayarındaki panelden değiştirilir.' });
      if (ARASTIRMA_MODU) return res.status(409).json({ success: false, error: 'Veri kalitesi kipi sunucuda değiştirilir — bu bilgisayar geliştirme kopyası.' });
      const g = req.body || {};
      const kip = String(g.kip || '');
      if (!VeriKalitesi.KIPLER.includes(kip)) return res.status(400).json({ success: false, error: 'kip "izleme" ya da "etkin" olmalı' });
      if (g.onay !== true) return res.status(400).json({ success: false, error: 'onay gerekli (panelde onay penceresi)' });
      const once = veriKalitesiAyar().kip;
      if (once === kip) return res.json({ ...veriKalitesiDurum(), degismedi: true });
      ctx.config.veriKalitesi = { ...(ctx.config.veriKalitesi || {}), kip, ...(kip === 'izleme' ? { izlemeBas: new Date().toISOString() } : {}) };
      saveConfig(ctx.config);
      for (const ad of BINDIRME_ADLAR) {
        const b = bindirmeler[ad];
        if (!b || !b.bot.ayar.veriKalitesi) continue;
        b.bot.ayar.veriKalitesi.kipKaydet(kip, 'panel');
        if (kip === 'izleme') b.bot.guvenliKipKaldir('veri');   // izleme kipinde veri kalitesi kararı engellemez
      }
      db.addLog(kip === 'etkin' ? 'WARN' : 'INFO', `[VERİ KALİTESİ] kip: ${once} → ${kip}${kip === 'etkin' ? ' — ağır bulguda botlar güvenli kipe girer (demo kabul botu yalnız haber)' : ' — bulgular yalnız kaydedilir'}`);
      res.json(veriKalitesiDurum());
    });

    return { ozDenetim };
  }

  function durumUclari() {
    const { app, engine, APP_VERSION, COMMIT, ARASTIRMA_MODU, BINDIRME_ADLAR, bindirmeler, diskDurumu, evOkuma, acilPin, guvenlik } = ctx;
    const { ayarIzi } = ayar;
    app.get('/api/health', (req, res) => {
      const bots = engine.getBots();
      const risk = engine.riskManager.getStatus();
      const stale = engine.lastState
        ? (Date.now() - (engine.lastTickAt || 0)) > 60000
        : true;

      const healthy = engine.isRunning && !risk.killSwitchTriggered && !(bots.length > 0 && stale);

      res.status(healthy ? 200 : 503).json({
        status: healthy ? 'ok' : 'degraded',
        appVersion: APP_VERSION, commit: COMMIT, ayarIzi: ayarIzi(),
        // Panel başlığındaki "Araştırma modu" rozeti ve devre dışı bot/borsa/emir düğmeleri (public/js/pages/kabuk.js).
        arastirmaModu: ARASTIRMA_MODU,
        // 68.1 (PLAN-TASIMA F3): araştırma eklentisi yoksa panel Araştırma menüsünü gizler; taşıma sonrası botlar mutabakat bekler.
        arastirmaEklentisi: tasimaLib.eklentiDurumu().yuklu,
        tasimaBekliyor: !!tasimaLib.bekleyenOku(),
        // Y7 (61.8): güncelleyicinin kararlılık penceresi — güncellemeden önce bağlı olan bot sonra da bağlı olmalı.
        bindirme: BINDIRME_ADLAR.map(ad => { const b = bindirmeler[ad]; return b ? { ad, mod: b.mod, calisiyor: !!b.bot.durum.calisiyor, bagli: !!b.y.borsa } : { ad }; }),
        // O7 (61.8): boş disk (GB) — 10 GB altında günlük Telegram uyarısı.
        disk: diskDurumu(),
        // 61.7: araştırma modunda bot/işlem ekranlarının kaynağı (sunucudaki panel mi, yerel eski kopya mı) — jeton dönmez.
        evBaglanti: ARASTIRMA_MODU ? evOkuma.bilgi() : null,
        // Telefon kademesi (60.5): panel yazma düğmelerini kilitler, bot kartında PIN'li "Acil durdur" (js/pages/kabuk.js, botlar.js).
        kademe: req.kademe || 'yerel',
        acilPin: (({ tanimli, kilitli, kalanHak }) => ({ tanimli, kilitli, kalanHak }))(acilPin.durum()),
        // Ayarlar › Bu bilgisayar (denetim A-18): telefon jetonu tanımlı mı (değeri DEĞİL).
        telefonJeton: !!guvenlik.jetonVar(),
        uptimeSec: Math.round(process.uptime()),
        engineRunning: engine.isRunning,
        bots: bots.length,
        lastTickAgoSec: engine.lastTickAt ? Math.round((Date.now() - engine.lastTickAt) / 1000) : null,
        killSwitch: risk.killSwitchTriggered,
        memoryMB: Math.round(process.memoryUsage().rss / 1048576)
      });
    });

    // Bot State & Status
    app.get('/api/status', (req, res) => {
      res.json({
        appVersion: APP_VERSION,
        isRunning: engine.isRunning,
        state: engine.getState(),
        stats: db.getStats()
      });
    });

  }

  function testUclari() {
    const { app, ARASTIRMA_MODU, BINDIRME_ADLAR, botEtiketi, saglikBotlar, saglikBot, saglikSunucu } = ctx;
    /**
     * SAĞLIK SİNYALİ TESTİ — ayarlı her URL'ye bir başarı ping'i (gövdesiz GET). healthchecks'te check
     * "up" olur; URL yanlışsa (404) burada görünür. Yanıtta URL YOK, yalnız sonuç.
     */
    app.post('/api/saglik/test', async (req, res) => {
      // 68.8: her botun KENDİ check'i ayrı denenir (sonuc.botlar.<ad>); sonuc.bot = Hücum (eski panel / geri uyum).
      const tek = async (s) => { if (!s.ayarli()) return { ayarli: false }; const r = await s.ping('basari'); return { ayarli: true, ok: r.ok, hata: r.hata || null, deneme: r.deneme }; };
      const botlar = {};
      for (const ad of BINDIRME_ADLAR) botlar[ad] = await tek(saglikBotlar[ad]);
      const sonuc = { bot: botlar.hucum, botlar, sunucu: await tek(saglikSunucu) };
      const hepsi = [...BINDIRME_ADLAR.map(a => [botEtiketi(a), botlar[a]]), ['sunucu', sonuc.sunucu]];
      const herhangi = hepsi.some(([, x]) => x.ayarli);
      const hepsiOk = hepsi.every(([, x]) => !x.ayarli || x.ok);
      if (herhangi) db.addLog(hepsiOk ? 'SUCCESS' : 'WARN', `Sağlık sinyali testi: ${hepsi.map(([a, x]) => `${a} ${x.ayarli ? (x.ok ? 'gönderildi' : `başarısız (${x.hata})`) : 'ayarlı değil'}`).join(' · ')}`);
      res.status(!herhangi ? 400 : 200).json({ success: herhangi && hepsiOk, sonuc,
        error: !herhangi ? 'Ping URL\'si girilmemiş (Ayarlar → Sağlık sinyali).' : (hepsiOk ? null : 'En az bir ping gönderilemedi — URL\'yi ve internet bağlantısını kontrol edin.') });
    });

    app.get('/api/saglik/durum', (req, res) => {
      res.json({ success: true, bot: saglikBot.durum(), botlar: Object.fromEntries(BINDIRME_ADLAR.map(a => [a, { ad: botEtiketi(a), ...saglikBotlar[a].durum() }])),
        sunucu: saglikSunucu.durum(), telegramKomut: ctx.telegramYoklayici.durum() });
    });

    /**
     * SUNUCU KALP ATIŞI (healthchecksSunucuUrl ayarlıysa): açılıştan 1 dk sonra, sonra her 10 dk'da
     * bakılır — son BAŞARILI ping 1 saatten eskiyse bir ping. Ağ hatası 10 dk sonra yeniden denenir.
     */
    // O9 (61.8): 23 saat → 1 saat — sunucu ölümü bir gün sonra değil ~2 saatte fark edilir (healthchecks period 1 sa, tolerans 1 sa).
    const SUNUCU_PING_ARALIK = 3600e3;
    let sunucuPingMesgul = false;
    async function sunucuKalpAtisi() {
      // Araştırma modunda ping YOK: başka makinedeki gerçek sunucu çökmüşken buradan giden ping onu "yaşıyor" gösterirdi.
      if (ARASTIRMA_MODU || sunucuPingMesgul || !saglikSunucu.ayarli()) return;
      if (saglikSunucu.sonBasari && Date.now() - saglikSunucu.sonBasari < SUNUCU_PING_ARALIK) return;
      sunucuPingMesgul = true;
      try { await saglikSunucu.ping('basari'); } finally { sunucuPingMesgul = false; }
    }
    setTimeout(() => { sunucuKalpAtisi(); }, 60 * 1000).unref();
    setInterval(() => { sunucuKalpAtisi(); }, 10 * 60 * 1000).unref();

  }

  return { ozDenetimUclari, durumUclari, testUclari };
}

module.exports = { olustur };
