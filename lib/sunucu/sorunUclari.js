/**
 * C1 (75.0, TASARIM-MAKINE-HESAP-BOT §3 parça 2) — server.js'ten taşındı, davranış AYNI. Tasarım haritasında yer almayan sorun/teşhis
 * bloğu (kullanıcı kararı: ayrı modül, tek sorumluluk): 73.7 SORUN MERKEZİ girdisi + GET /api/sorunlar, /api/sorunlar/teshis,
 * /api/sorunlar/yerel; 73.8 SORUN ARAÇLARI GET /api/sorun-arac/:arac/onizle, POST /api/sorun-arac/:arac/uygula.
 * lib/sorunlar.js (saf) ve lib/sorunAraclari.js DEĞİŞMEDİ. Dönen { SORUN, sorunlarHesapla, bilinenSirlar } Telegram komut/menüsüne
 * ctx ile verilir (lib/sunucu/bildirimKurulum.js telegram()).
 *
 * Bağlanma: server.js `SORUN_UCLARI = require('./lib/sunucu/sorunUclari').kur(ctx)` — eski yerinde (öz denetim/veri kalitesi
 * uçlarından sonra, /api/health'ten önce). Sonra kurulan nesneler (veri orkestratörü, piyasa bağlamı, yapay zekâ, Telegram
 * yoklayıcısı, ileri izleyici durumu) ve `config` ctx'ten KULLANIM ANINDA okunur.
 */
'use strict';
const fs = require('fs');
const yollar = require('../yollar');
const db = require('../database');
const guncelleme = require('../guncelleme');
const tasimaLib = require('../tasima');

function kur(ctx) {
  const { app, kok, APP_VERSION, ARASTIRMA_MODU, COMMIT, GUNLUK, acilPin, evYazma, evOkuma, BINDIRME_ADLAR, bindirmeler, portfoyBildirici, ozDenetim } = ctx;
  const { loadSecrets, ayarIzi } = ctx.ayar;
  /**
   * 73.7 SORUN MERKEZİ (lib/sorunlar.js — saf): bütün kaynaklardan o an ETKİN sorunlar tek biçimde. Girdi burada toplanır (salt okuma;
   * botların karar/emir koduna dokunulmaz). 30 sn önbellek (rozet her sayfada 5 dk'da bir sorar). Uçlar (hepsi GET, telefonda açık):
   *   /api/sorunlar            { sorunlar, sayac, sonDenetim, rol } — araştırma kopyasında lib/evOkuma.js sunucudan okur (EV_YOLU)
   *   /api/sorunlar/teshis     { metin } "Sohbete gönder" paketi (sır taraması + uzunluk sınırı); ?kart=<kimlik> o kartı başa alır
   *   /api/sorunlar/yerel      bu bilgisayarın kendi sorunları (araştırma kopyası: sunucu bağlantısı, kuyruk, yerel veri) — iletilmez
   * Telegram /teshis aynı kartlardan (lib/telegramKomut.js ctx.teshis). SORUN_ORNEK=1 iken ?ornek=1 kılavuz görüntüsü için ÖRNEK kartlar.
   */
  const SORUN = require('../sorunlar');
  const sorunOnbellek = { zaman: 0, sonuc: null, gunluk: null, gunlukZaman: 0 };
  const sorunGuvenli = (fn, vars = null) => { try { const x = fn(); return x === undefined ? vars : x; } catch { return vars; } };
  function sorunBotlari(simdi) {
    return BINDIRME_ADLAR.map(ad => bindirmeler[ad]).filter(Boolean).map(b => {
      const o = sorunGuvenli(() => b.bot.ozet(simdi), {}) || {};
      const y = b.y && b.y.borsa ? (sorunGuvenli(() => b.y.ozet(), {}) || {}) : null;
      const uy = o.uygulama || null;
      return { ad: b.ad, adGorunen: b.bot.adGorunen, mod: b.mod, calisiyor: !!o.calisiyor, bindirmeEngel: o.bindirmeEngel || null, kolEngel: o.kolEngel || null,
        guvenliKip: o.guvenliKip || null, akisBekleyen: o.akisBekleyen || null, paraAkisi: o.paraAkisi || null, model: o.model ? { durum: o.model.durum, metin: o.model.metin } : null,
        uygulama: uy ? { bant: uy.bant } : null, sapmaMetin: uy && Number.isFinite(uy.birikim) ? `Son 30 günde gerçek − simülasyon farkı ${(uy.birikim * 100).toFixed(2).replace('.', ',')} puan (bant: ${uy.bant}).` : null,
        kalp: o.kalp || null, kalpDurumu: o.kalpDurumu || null, sonKarar: o.sonKarar ? { gun: o.sonKarar.gun, risk: o.sonKarar.risk || null } : null,
        yurutucu: y ? { durum: y.durum, durmaTuru: y.durmaTuru, durmaSebebi: y.durmaSebebi, geriCekilme: y.geriCekilme ? { bitis: y.geriCekilme.bitis, aktif: y.geriCekilme.aktif } : null, kilitAcik: y.kilitAcik } : { durum: 'BAGLI_DEGIL' },
        // 73.8 Sorun araçları: K3 mandalı (canlı dosyadan), uyuşmazlık açıklayıcısı (Y-09b), emir freni dökümü (Y-14) — hepsi YEREL kayıttan, borsaya istek yok
        riskDurum: o.riskDurum || null,
        uyusmazlikAciklama: o.kolEngel ? sorunGuvenli(() => SORUN_ARAC.uyusmazlikAciklama({
          farklar: (((b.bot.kol.durum.sonMutabakat || {}).pozisyon || {}).farklar) || [],
          emirler: Object.fromEntries(((((b.bot.kol.durum.sonMutabakat || {}).pozisyon || {}).farklar) || []).map(f => [f.symbol, b.bot._sembolEmirleri(f.symbol, 10)])),
          korumaOlaylari: (b.bot.koruma && b.bot.koruma.durum && b.bot.koruma.durum.olaylar) || [],
          zorla: (sorunGuvenli(() => ozDenetim.olaylar(2), []) || []).filter(x => x.kimlik === 'zorla' && x.bot === b.ad), simdi }), null) : null,
        frenNeyiSaydi: o.fren || /EMİR FRENİ/.test(o.bindirmeEngel || '') ? sorunGuvenli(() => SORUN_ARAC.frenNeyiSaydi(b.y.frenDokumu(simdi), simdi), null) : null };
    });
  }
  function sorunGirdisi(simdi = Date.now()) {
    // Günlük özeti 24 saatin dosyalarını okur — 5 dk önbellek.
    if (!sorunOnbellek.gunluk || simdi - sorunOnbellek.gunlukZaman > 5 * 60000) {
      const oz = sorunGuvenli(() => GUNLUK.ozet(), null);
      sorunOnbellek.gunluk = oz ? { hata: (oz.sayilar && oz.sayilar.hata) || 0, sonHata: oz.sonHata ? String(oz.sonHata.m || '').slice(0, 200) : null } : null;
      sorunOnbellek.gunlukZaman = simdi;
    }
    const gu = sorunGuvenli(() => { const d = guncelleme.durumOku(kok); if (d.islem && !d.islem.bitti && !guncelleme.kilitVar(kok)) d.islem = { ...d.islem, yarida: true }; return { ...d, gelistirme: ARASTIRMA_MODU }; }, null);
    const vd = sorunGuvenli(() => ctx.veriOrk.durum(), null);
    return {
      simdi, rol: ARASTIRMA_MODU ? 'arastirma' : 'sunucu',
      oz: { calisiyor: !ARASTIRMA_MODU, goruntu: sorunGuvenli(() => ozDenetim.goruntu(), null), veri: sorunGuvenli(() => ozDenetim.sorunVerisi(simdi), {}) },
      botlar: ARASTIRMA_MODU ? [] : sorunBotlari(simdi),
      guncelleme: gu,
      veri: vd ? { kaynaklar: (vd.kaynaklar || []).map(s => ({ ad: s.ad, kisaAd: s.kisaAd, durum: s.durum, hata: s.hata, sonBasari: s.sonBasari })), binanceBekleme: vd.binanceBekleme || null, kismiEvren: vd.kismiEvren || null } : null,
      ileri: ARASTIRMA_MODU ? null : { sonHata: ctx.ileriIs.sonHata, sonDeneme: ctx.ileriIs.sonDeneme, calisiyor: ctx.ileriIs.calisiyor },
      acilPin: sorunGuvenli(() => acilPin.durum(), null),
      tasimaBekliyor: !!sorunGuvenli(() => tasimaLib.bekleyenOku(), false),
      donma: sorunGuvenli(() => JSON.parse(fs.readFileSync(yollar.veri('donma.json'), 'utf8')), null),
      gunluk: ARASTIRMA_MODU ? null : sorunOnbellek.gunluk,
      saatDilimi: sorunGuvenli(() => Intl.DateTimeFormat().resolvedOptions().timeZone, null),
      piyasaBaglami: ARASTIRMA_MODU ? null : sorunGuvenli(() => ctx.piyasaBaglami.saglik(), null),   // 73.9: uzun süre alınamayan bilgi kaynağı
      yapayZeka: ARASTIRMA_MODU ? null : sorunGuvenli(() => ctx.yapayZeka.durum(), null),   // 74.1: Gemini anahtarı bekliyor / reddedildi / kota / kanarya
      // 77.8: eşlenmiş sunucu 30 dk'dan uzun sessiz ("Makine sessiz" kartı → telefondan devral aracı) ve bu makinede devralınmış botlar
      // (emir listesi onayı / bir kezlik Başlat). Salt okuma: lib/makine/devralma.js liste() — ağ yok; eş yokken boş.
      devralma: ARASTIRMA_MODU ? null : sorunGuvenli(() => (ctx.makine && ctx.makine.DEVRALMA ? ctx.makine.DEVRALMA.liste() : null), null),
    };
  }
  /** Sunucunun sorunları (önbellekli). Araştırma kopyasında öz denetim yok → yalnız bu bilgisayarın güncelleme / veri durumu değil (o /yerel'de). */
  function sorunlarHesapla({ taze = false } = {}) {
    const simdi = Date.now();
    if (!taze && sorunOnbellek.sonuc && simdi - sorunOnbellek.zaman < 30000) return sorunOnbellek.sonuc;
    let r;
    if (ARASTIRMA_MODU) r = { sorunlar: [], sayac: SORUN.sayac([]), sonDenetim: null, calisiyor: false };
    else { try { r = SORUN.uret(sorunGirdisi(simdi)); } catch (e) { r = { sorunlar: [SORUN.kart('taninmayan', { ne: `Sorun merkezi girdisi okunamadı: ${e.message}`, deg: { ad: 'sorun merkezi' } }, simdi)], sayac: { mudahale: 0, dikkat: 1, gecici: 0, bilgi: 0, toplam: 1 }, sonDenetim: null, calisiyor: true }; } }
    r = { ...r, zaman: simdi, rol: ARASTIRMA_MODU ? 'arastirma' : 'sunucu', surum: APP_VERSION, commit: COMMIT };
    // 77.x: "Botu güvenli kipe al" listesi (Sorunlar sayfası; telefondan da) — yalnız ad / görünen ad / kip durumu, tutar yok.
    if (!ARASTIRMA_MODU) r.botDurum = sorunGuvenli(() => BINDIRME_ADLAR.map(ad => bindirmeler[ad]).filter(b => b && b.bot && b.bot.durum)
      .map(b => ({ ad: b.ad, adGorunen: b.bot.adGorunen || b.ad, mod: b.mod, guvenliKip: !!b.bot.durum.guvenliKip, engel: !!b.bot.durum.engel })), []);
    sorunOnbellek.sonuc = r; sorunOnbellek.zaman = simdi;
    return r;
  }
  /** Araştırma kopyasının KENDİ sorunları (sunucu bağlantısı, yazma kuyruğu, bu bilgisayarın verisi) — kaynak 'yerel'. */
  function yerelSorunlar() {
    const simdi = Date.now();
    if (!ARASTIRMA_MODU) return { sorunlar: [], sayac: SORUN.sayac([]) };
    // 73.8: kılavuz görüntüsü üretimi (scripts/kilavuz-ekran.js SORUN_ORNEK=1) — araştırma kopyasına özgü kartlar görüntüye girmez
    if (process.env.SORUN_ORNEK === '1') return { sorunlar: [], sayac: SORUN.sayac([]) };
    const kq = sorunGuvenli(() => evYazma.bilgi(), null);
    const bas = kq ? (kq.ogeler || []).filter(x => x.durum === 'bekliyor').pop() : null;
    const vd = sorunGuvenli(() => ctx.veriOrk.durum(), null);
    const r = SORUN.uret({ simdi, rol: 'arastirma', veri: vd ? { kaynaklar: (vd.kaynaklar || []).map(s => ({ ad: s.ad, kisaAd: s.kisaAd, durum: s.durum, hata: s.hata, sonBasari: s.sonBasari })), binanceBekleme: vd.binanceBekleme || null, kismiEvren: vd.kismiEvren || null } : null,
      yerel: { evBaglanti: sorunGuvenli(() => evOkuma.bilgi(), null), evKuyruk: kq ? { bekleyen: kq.bekleyen || 0, sonHata: (kq.kafaReddi && kq.kafaReddi.ayrinti) || (bas && bas.sonHata) || null } : null } });
    const sorunlar = r.sorunlar.map(k => ({ ...k, kaynak: 'yerel', kimlik: `yerel:${k.kimlik}` }));
    return { sorunlar, sayac: SORUN.sayac(sorunlar) };
  }
  /** Sır taraması için bu makinenin gerçek sır değerleri (paket ve /teshis metninden birebir silinir). Değerler hiçbir yanıta girmez. */
  function bilinenSirlar() {
    const l = [];
    const topla = (x, d = 0) => { if (d > 5 || x == null) return; if (typeof x === 'string') { if (x.trim().length >= 6) l.push(x.trim()); return; } if (typeof x === 'object') for (const v of Object.values(x)) topla(v, d + 1); };
    sorunGuvenli(() => topla(loadSecrets()));
    sorunGuvenli(() => { const t = ctx.config.telegram || {}; topla([t.botToken, t.chatId ? String(t.chatId) : null, ctx.config.healthchecksUrl, ctx.config.healthchecksSunucuUrl, ctx.config.apiKey, ctx.config.apiSecret]); });
    sorunGuvenli(() => { for (const ad of BINDIRME_ADLAR) topla(((ctx.config.bindirme || {})[ad] || {}).healthchecksUrl); });
    sorunGuvenli(() => { const a = evOkuma.ayar(); if (a) topla([a.jeton, a.yazmaJetonu]); });
    sorunGuvenli(() => topla(process.env.PANEL_TOKEN));
    return l;
  }
  function teshisPaketi({ one = null } = {}) {
    const simdi = Date.now();
    const r = sorunlarHesapla({ taze: true });
    const yerel = ARASTIRMA_MODU ? yerelSorunlar().sorunlar : [];
    const go = sorunGuvenli(() => ozDenetim.goruntu(), null);
    const ov = sorunGuvenli(() => ozDenetim.sorunVerisi(simdi), {}) || {};
    let sonRapor = null;
    const kk = ARASTIRMA_MODU ? null : sorunGuvenli(() => ozDenetim.karaKutular(1)[0], null);
    if (kk) {
      sonRapor = { dosya: kk.dosya, bot: kk.bot, kaynak: kk.kaynak, zaman: kk.zaman };
      sorunGuvenli(() => { const j = JSON.parse(fs.readFileSync(ozDenetim.karaKutuYolu(kk.dosya), 'utf8')); sonRapor = { ...sonRapor, bot: (j.bot && (j.bot.adGorunen || j.bot.ad)) || kk.bot, metin: j.metin, denetimler: j.denetimler || [] }; });
    }
    const botSatir = ARASTIRMA_MODU ? [] : sorunBotlari(simdi).map(b => {
      const kd = b.kalpDurumu || {};
      return `${b.adGorunen} (${b.mod}): ${b.calisiyor ? 'çalışıyor' : 'durdu'} · ${kd.metin || 'son çalışma —'} · ENGEL: ${b.bindirmeEngel || b.kolEngel ? String(b.bindirmeEngel || b.kolEngel).slice(0, 160) : 'yok'} · güvenli kip: ${b.guvenliKip ? String(b.guvenliKip.metin).slice(0, 120) : 'yok'} · yürütücü: ${b.yurutucu.durum}${b.yurutucu.durmaTuru ? ` [${b.yurutucu.durmaTuru}]` : ''}${b.sonKarar && b.sonKarar.risk && b.sonKarar.risk.kill ? ` · risk kill ${b.sonKarar.risk.kill}` : ''}`;
    });
    const say = [];
    if (!ARASTIRMA_MODU) {
      for (const [ad, v] of Object.entries(ov.botlar || {})) say.push(`${ad}: emir reddi (30 dk) ${(v.emirRetler || []).length} · tekrarlayan ${(v.tekrarlar || []).length} · stop ardışık ${(v.stopHata && v.stopHata.ardisik) || 0}${v.onay ? ` · son onay ${SORUN.trSaat(v.onay, simdi)}` : ''}${v.dokunulmaz ? ' · demo kabul (öz denetim dokunmaz)' : ''}`);
      const sc = go && (go.denetimler || []).find(d => d.kimlik === 'surec');
      if (sc) say.push(`Pusula süreci: ${sc.ayrinti}`);
    }
    sorunGuvenli(() => { const d = guncelleme.durumOku(kok); say.push(`Güncelleme: ${d.durum || '—'}${d.hedefSurum ? ` → ${d.hedefSurum}` : ''}${d.agHatasi ? ` · GitHub denemesi ${d.agHatasi}` : ''}${d.neden ? ` · ${String(d.neden).slice(0, 160)}` : ''}`); });
    sorunGuvenli(() => { if (!ARASTIRMA_MODU) say.push(`Telegram: giden kutusu ${portfoyBildirici._kuyrukOku().length} ileti${(() => { const k = ctx.telegramYoklayici.durum(); return k && k.sonHata ? ` · komut yoklaması hatası: ${String(k.sonHata.metin || '').slice(0, 100)}` : ''; })()}`); });
    sorunGuvenli(() => { if (ARASTIRMA_MODU) { const e = evOkuma.bilgi(); say.push(`Sunucu bağlantısı: ${e.kurulu ? 'kurulu' : 'kurulu değil'}${e.sonBasari ? ` · son başarılı okuma ${SORUN.trSaat(e.sonBasari, simdi)}` : ''}${e.sonHata ? ` · son hata: ${String(e.sonHata).slice(0, 140)}` : ''}`); } });
    const gunluk = ARASTIRMA_MODU ? [] : (sorunGuvenli(() => GUNLUK.oku({ saat: 1, seviye: 'uyari+', limit: 400 }).kayitlar, []) || []).filter(k => Date.parse(k.t) >= simdi - 30 * 60000).reverse().slice(-80);
    return SORUN.teshisMetni({ simdi, surum: APP_VERSION, commit: COMMIT, ayarIzi: sorunGuvenli(() => ayarIzi(), null), rol: ARASTIRMA_MODU ? 'arastirma' : 'sunucu',
      makine: sorunGuvenli(() => require('os').hostname(), null), sorunlar: r.sorunlar, yerel, oz: ARASTIRMA_MODU ? null : go, sonRapor, botlar: botSatir, sayaclar: say, gunluk, one }, bilinenSirlar());
  }
  app.get('/api/sorunlar', (req, res) => {
    if (process.env.SORUN_ORNEK === '1' && req.query && req.query.ornek === '1') {
      const r = SORUN.uret(SORUN.ornekGirdi(Date.now()));
      return res.json({ success: true, ornek: true, ...r, zaman: Date.now(), rol: 'sunucu', surum: APP_VERSION });
    }
    try { res.json({ success: true, ...sorunlarHesapla({ taze: req.query && req.query.taze === '1' }) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
  app.get('/api/sorunlar/teshis', (req, res) => {
    try { res.json({ success: true, metin: teshisPaketi({ one: req.query && req.query.kart ? String(req.query.kart).slice(0, 120) : null }) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
  app.get('/api/sorunlar/yerel', (req, res) => {
    try {
      const r = yerelSorunlar();
      res.json({ success: true, rol: ARASTIRMA_MODU ? 'arastirma' : 'sunucu', ...r, metin: ARASTIRMA_MODU ? SORUN.sirTemizle(r.sorunlar.map(SORUN.kartMetni).join('\n'), bilinenSirlar()) : '' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  /**
   * 73.8 SORUN ARAÇLARI (lib/sorunAraclari.js; Sorun merkezi P3): bugün hiçbir düğmenin çözemediği durumlar — kayıt eşitleme (Y-03/Y-33),
   * zarar sınırı sıfırlama (Y-04), sapma kabulü (Y-05), yatırma kabulü (Y-44). EMİR GÖNDERMEZ; yalnız kayıt / engel / risk durumu.
   *   GET  /api/sorun-arac/:arac/onizle?bot=&sembol=   ne değişecek + parmak izi (telefonda açık; araştırma kopyasında sunucudan — EV_YOLU)
   *   POST /api/sorun-arac/:arac/uygula { bot, sembol?, pin, onay, parmak }   PIN + onay her kademede; durum değiştiyse 409 + yeni önizleme
   * 77.7: bota bağlı her aracın uygula adımı NÖBET KAPISINDAN geçer (ctx.makine.nobetKapisi; masaüstü /api/bindirme/* ile aynı 409).
 * Telefon: lib/acilPin.js SORUN_ARAC_YOLU (beyaz liste + PIN kapısı). Araştırma kopyası: lib/guvenlik.js GELISTIRME_YAZMA ile sunucuya
   * iletilir (kuyruğa girmez); bağlantı yoksa burada 409.
   */
  const SORUN_ARAC = require('../sorunAraclari');
  /*
   * 77.x (kullanıcı onayı 2026-10-26) TELEFONA ÖZEL iki araç — kancalar burada, karar / önizleme lib/sorunAraclari.js'te.
   * "Pusula'yı yeniden başlat": MEVCUT yol (POST /api/sistem/yeniden-baslat ile aynı — temiz kapanış, çıkış kodu 75, denetleyici ~10 sn
   * sonra açar; PowerShell / cmd YOK). Saatte en çok 1: son zaman <veri>/telefon-yeniden-baslat.json'da (yeniden başlatmada kaybolmasın).
   * "Borsayla karşılaştır": masaüstü POST /api/bindirme/:ad/mutabakat ile AYNI adımlar + aynı NÖBET KAPISI (ctx.makine.nobetKapisi —
   * sorun-arac yolu server.js'teki /api/bindirme/* ara katmanından geçmediği için burada ayrıca çağrılır).
   */
  const YB_DOSYA = yollar.veri('telefon-yeniden-baslat.json');
  const YB_BASLANGIC = Math.round((Date.now() - process.uptime() * 1000) / 1000) * 1000;
  function ybDurum() {
    let son = null;
    try { const d = JSON.parse(fs.readFileSync(YB_DOSYA, 'utf8')); if (Number.isFinite(+d.son)) son = +d.son; } catch { /* yok */ }
    const suren = BINDIRME_ADLAR.map(ad => bindirmeler[ad]).filter(b => b && b.bot && typeof b.bot.calismaSuruyor === 'function' && sorunGuvenli(() => b.bot.calismaSuruyor(), false))
      .map(b => b.bot.adGorunen || b.ad);
    return { denetleyici: !!process.env.PUSULA_KONSOL_GUNLUGU && !ARASTIRMA_MODU, son, surum: APP_VERSION, baslangic: YB_BASLANGIC, suren };
  }
  async function ybUygula({ kademe }) {
    const simdi = Date.now();
    fs.mkdirSync(require('path').dirname(YB_DOSYA), { recursive: true });
    fs.writeFileSync(YB_DOSYA, JSON.stringify({ son: simdi, kademe }), 'utf8');
    db.addLog('WARN', `🔄 Pusula yeniden başlatılıyor (${kademe === 'telefon' ? 'telefondan' : 'panelden'}, acil PIN + onay) — denetleyici ~10 sn sonra açar`);
    const bildir = sorunGuvenli(() => portfoyBildirici.gonder('bilgi', 'Pusula yeniden başlatılıyor', [`${kademe === 'telefon' ? 'Telefondan' : 'Panelden'}, acil PIN + onayla istendi.`,
      'Denetleyici ~10 saniye sonra aynı kodla açar; açılış iletisi gelmezse sunucuyu kontrol edin.', 'Bunu siz yapmadıysanız: acil PIN\'i değiştirin.'], { anahtar: `yeniden-baslat:${simdi}` }), null);
    await Promise.race([Promise.resolve(bildir).catch(() => null), new Promise(r => setTimeout(r, 3000))]);
    setTimeout(() => ctx.shutdown('telefondan yeniden başlatma (acil PIN + onay)', 75), 800);
    return 'Pusula yeniden başlatılıyor (denetleyici ~10 sn sonra açar)';
  }
  async function karsilastirNobet(ad) {
    const e = await ctx.makine.nobetKapisi(ad, 'mutabakat');
    return e ? (e.metin || 'nöbet kapısı') : null;
  }
  async function karsilastirYap(b) {
    await b.bagla(); await b.y.mutabakat();
    const m = await b.bot.mutabakat();
    if (!m.engel) tasimaLib.mutabakatTemiz(b.ad);   // 68.1: taşıma sonrası ilk temiz mutabakat → Başlat açılır (masaüstü ucuyla aynı)
    else portfoyBildirici.gonder('alarm', `${b.bot.adGorunen}: mutabakat uyuşmazlığı`, [m.engel], { anahtar: `mutabakat:${b.ad}` });
    return m;
  }
  // 77.x güvenli kip araçları: çıkışta öz denetim sayaçları "onay" alır (masaüstü POST /api/saglik/oz/:ad/guvenli-kip-kaldir ile aynı);
  // her iki yön ayar geçmişine 'bot' türünde (geri alınamaz) yazılır — kaynak 'arac', kademe (telefon / panel) istek bağlamından.
  const sorunArac = SORUN_ARAC.olustur({ botBul: (ad) => bindirmeler[ad] || null, acilPin, log: (lv, msg) => db.addLog(lv, msg), sonra: () => { sorunOnbellek.zaman = 0; },
    guvenliKipKalkti: (ad) => { if (ozDenetim) ozDenetim.onayVerildi(ad); }, gecmis: (k) => ctx.AYAR_GECMISI.kaydet(k),
    sistem: { durum: ybDurum, yenidenBaslat: ybUygula }, karsilastir: { nobet: karsilastirNobet, yap: karsilastirYap },
    // 77.7 NÖBET KAPISI: bota bağlı HER aracın uygula adımı (telefon, panel, geliştirme iletimi) masaüstü /api/bindirme/* ara katmanıyla
    // aynı kapıdan geçer — bot başka makineye taşındı / devralındı / taşınıyorsa 409 kod 'nobet'. Önizleme sormaz (salt okuma).
    nobet: (ad, islem) => (ctx.makine && typeof ctx.makine.nobetKapisi === 'function' ? ctx.makine.nobetKapisi(ad, islem) : null),
    // 77.8 telefondan devralma araçları (devral / devral-sahiplen / devral-baslat) — lib/makine/devralmaArac.js, makine modülü kurar (çağrı anında okunur)
    devralma: () => (ctx.makine && ctx.makine.DEVRALMA_ARAC) || null });
  const SORUN_ARAC_ARASTIRMA = 'Araştırma kopyası: bu araç sunucuda çalışır. Sunucu bağlantısı (ve yazma jetonu) kurulu değil — sunucudaki panelden ya da telefondan yapın.';
  app.get('/api/sorun-arac/:arac/onizle', async (req, res) => {
    if (ARASTIRMA_MODU) return res.status(409).json({ success: false, error: SORUN_ARAC_ARASTIRMA });
    try { res.json({ success: true, onizleme: await sorunArac.onizle(req.params.arac, { bot: req.query.bot, sembol: req.query.sembol, es: req.query.es }) }); }
    catch (e) { res.status(e.durum || 500).json({ success: false, error: e.message }); }
  });
  app.post('/api/sorun-arac/:arac/uygula', async (req, res) => {
    if (ARASTIRMA_MODU) return res.status(409).json({ success: false, error: SORUN_ARAC_ARASTIRMA });
    const r = await sorunArac.uygula(req.params.arac, req.body || {}, { kademe: req.kademe || 'yerel' });
    res.status(r.durum).json(r.govde);
  });

  return { SORUN, sorunlarHesapla, bilinenSirlar };
}

module.exports = { kur };
