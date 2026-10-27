/**
 * PUSULA DOKTORU uçları (F1, 78.1; lib/doktor/*) — HEPSİ SALT OKUMA (GET), telefonda da açık; araştırma kopyasında lib/evOkuma.js EV_YOLU
 * ile sunucudan okunur (sunucu bağlantısı kuruluysa). Makine kademesine (eş makine) AÇIK DEĞİL (lib/guvenlik.js MAKINE_OKUMA'da yok).
 *   GET /api/doktor?gun=1..30   teşhis kartları (Sorun merkezi + Doktor kuralları D1/D2/D3/D10) · onarım günlüğü · hazır olma · bakım durumu
 *                               · Pusula'nın kendiliğinden yaptığı onarımlar listesi · Doktor'un sınırları (K1/K2)
 *   GET /api/hazir[?taze=1]     hazır olma (readiness): süreç + öz denetim son yoklama yaşı + çalışan her bindirme botunun bağlı / ENGEL /
 *                               güvenli kip / son karar yaşı. /api/health'e DOKUNULMADI (donma bekçisi ve healthchecks oradan; K6: /api/hazir
 *                               healthchecks'e bağlanmaz). Hazır olmamak hiçbir eylem doğurmaz.
 * Zamanlayıcı: D2 geçici tatbikat artığı temizliği — açılıştan 20 dk sonra, sonra saatte bir denenir; TR günü başına en çok bir kez, TR
 * 02:30–04:30 dışında (lib/doktor/index.js bakimTik). DOKTOR=0 kapatır. D1 (konsol günlüğü döndürme) burada DEĞİL: scripts/denetleyici-bekle.js
 * --basla (node server.js başlamadan, dosya açık değilken).
 * Bot nesnelerinin YALNIZ okuma yöntemleri çağrılır (bot.ozet, y.ozet); yazan yöntem (mutabakat, engelKaldir, guvenliKipKaldir, baslat …) YOK.
 *
 * F2 ONARIM MOTORU (78.2 adayı; lib/doktor/motor.js + onarim.js): ilk 7 gün GÖLGE (yalnız "şunu yapardım" kaydı), etkin kipe yalnız kullanıcı.
 *   GET  /api/doktor                        yanıtta `motor` (kip, gölge sayacı, kurallar, "yapardım" listesi, etkin kayıtlar, devirler, önizleme)
 *   POST /api/doktor/motor/etkin { onay: 'ONAR' }   YALNIZ bu bilgisayar (telefon 403 — lib/guvenlik.js beyaz listesinde yok) + YEREL PIN
 *                                                    (lib/yerelPin.js TEHLIKELI). Araştırma kopyasında 409.
 *   POST /api/doktor/motor/kip { kip: 'golge' | 'kapali' }   PIN'SİZ, telefonda da (güvenli yön — lib/acilPin.js TELEFON_SERBEST_YOLU)
 *   POST /api/doktor/motor/kural-ac { kural }      yalnız bu bilgisayar + YEREL PIN (bir kuralı açmak eylem alanını genişletir)
 *   POST /api/doktor/motor/kural-kapat { kural }   yalnız bu bilgisayar, PIN'siz (güvenli yön)
 * EYLEM BEYAZ LİSTESİ (bu dosyada, `EYLEMLER`): veri-yeniden (veriOrk.talep — orkestratörün kendi talep yolu), kayitci-yenile (ileriye kayıt
 * kendi yenile yöntemi), ikinci-kanal (Bildirici'nin ntfy yolu; yalnız başlıklar), yedek-yeniden (lib/doktor/yedekKos.js — process.execPath +
 * scripts/yedek.js, kabuk YOK). Başka eylem YOK. Motor zamanlayıcısı: açılıştan 16 dk sonra, sonra 10 dk'da bir; yalnız sunucuda; DOKTOR=0 kapatır.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const yollar = require('../yollar');
const guncelleme = require('../guncelleme');
const DOKTOR = require('../doktor');

const guvenli = (fn, vars = null) => { try { const x = fn(); return x === undefined ? vars : x; } catch { return vars; } };
const istGun = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
const ONAY_METNI = 'ONAR';
/** Sorun merkezi (lib/sunucu/sorunUclari.js) motorun girdisini buradan okur — kur() çağrılmadıysa null (kart yok). */
let MOTOR_SON = null;
function sorunGirdisi(simdi = Date.now()) { return MOTOR_SON ? guvenli(() => MOTOR_SON.sorunGirdisi(simdi), null) : null; }

/** Yedek klasöründeki en yeni günlük kopyanın toplam boyutu (manifest) — yoksa null. */
function sonYedekBoyutu(hedef) {
  try {
    const gunler = fs.readdirSync(hedef).filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a)).sort();
    for (let i = gunler.length - 1; i >= 0; i--) {
      const m = guvenli(() => JSON.parse(fs.readFileSync(path.join(hedef, gunler[i], 'yedek-manifest.json'), 'utf8')), null);
      if (m && Array.isArray(m.dosyalar)) return m.dosyalar.reduce((s, x) => s + (Number(x.boyut) || 0), 0);
    }
  } catch { /* hedef okunamadı */ }
  return null;
}

function kur(ctx) {
  const { app, kok, APP_VERSION, ARASTIRMA_MODU, COMMIT } = ctx;

  function botGirdileri(simdi) {
    return ctx.BINDIRME_ADLAR.map(ad => ctx.bindirmeler[ad]).filter(b => b && b.bot).map(b => {
      let o;
      try { o = b.bot.ozet(simdi) || {}; } catch { return { ad: b.ad, adGorunen: b.bot.adGorunen || b.ad, mod: b.mod, okunamadi: true }; }
      const y = b.y && b.y.borsa ? (guvenli(() => b.y.ozet(), null) || {}) : { durum: 'BAGLI_DEGIL' };
      return { ad: b.ad, adGorunen: o.adGorunen || b.bot.adGorunen || b.ad, mod: o.mod || b.mod, calisiyor: !!o.calisiyor, engel: o.bindirmeEngel || o.kolEngel || null,
        guvenliKip: o.guvenliKip || null, yurutucu: { durum: y.durum || null, durmaTuru: y.durmaTuru || null, geriCekilme: y.geriCekilme || null },
        sonKarar: o.sonKarar ? { gun: o.sonKarar.gun, zaman: o.sonKarar.zaman } : null, kalpDurumu: o.kalpDurumu || null };
    });
  }
  function kilitler() {
    const l = [];
    const simdi = Date.now();
    const vk = guvenli(() => ctx.veriOrk.kilitDurumu(), undefined);
    if (vk === undefined) return null;
    if (vk) { const bas = Date.parse(vk.bas || ''); l.push({ ad: 'veri orkestratörü kilidi', bayat: !!vk.bayat, yasMs: Number.isFinite(bas) ? simdi - bas : null, sahip: vk.pid ? `süreç ${vk.pid}` : null }); }
    const gk = yollar.programVeri(kok, 'guncelleme.kilit');
    try {
      const st = fs.statSync(gk);
      const yas = simdi - st.mtimeMs;
      const d = guvenli(() => guncelleme.durumOku(kok), {}) || {};
      const suruyor = !!(d.islem && !d.islem.bitti);
      l.push({ ad: 'güncelleme kilidi', bayat: yas > DOKTOR.K.ESIK.kilitBayatMs && !suruyor, yasMs: yas, sahip: suruyor ? 'güncelleme sürüyor' : null });
    } catch { /* kilit yok */ }
    return l;
  }

  const DR = DOKTOR.olustur({
    rol: () => (ARASTIRMA_MODU ? 'arastirma' : 'sunucu'),
    kaynaklar: {
      sorunlar: () => (ARASTIRMA_MODU ? [] : (ctx.sorunlarHesapla() || {}).sorunlar || null),
      surec: () => ({ surum: APP_VERSION, commit: COMMIT, uptimeSn: process.uptime(), denetleyici: !!process.env.PUSULA_KONSOL_GUNLUGU && !ARASTIRMA_MODU }),
      oz: () => { const g = ctx.ozDenetim.goruntu(); return g && g.ozet ? { sonYoklama: g.ozet.sonYoklama || null } : null; },
      botlar: () => botGirdileri(Date.now()),
      olaylar: (bas) => {
        const O = ctx.olayAkisi && ctx.olayAkisi.OLAY;
        if (!O) return [];
        O.tazele();
        return O.oku({ bas: istGun(bas), bit: istGun(Date.now()), n: 1000 }).olaylar || [];
      },
      // Günlük dosyaları büyük olabilir: desen taraması en çok son 7 gün (onarım günlüğünün diğer kaynakları 30 güne kadar).
      gunluk: (saat) => (ctx.GUNLUK.oku({ saat: Math.min(saat, 7 * 24), limit: 5000 }).kayitlar || []),
      kilitler,
      botBul: (m) => guvenli(() => ctx.olayAkisi.botBul(m), null),
    },
  });

  app.get('/api/doktor', (req, res) => {
    // Kılavuz görüntüsü (scripts/kilavuz-ekran.js SORUN_ORNEK=1): ÖRNEK yanıt — gerçek veri değil (lib/doktor/ornek.js)
    if (process.env.SORUN_ORNEK === '1' && req.query && req.query.ornek === '1') {
      try { return res.json({ success: true, ...require('../doktor/ornek').yanit(Date.now(), Number(req.query.gun) || 7), zaman: Date.now() }); }
      catch (e) { return res.status(500).json({ success: false, error: String(e.message || e).slice(0, 300) }); }
    }
    try {
      const t = DR.teshis();
      res.json({ success: true, rol: ARASTIRMA_MODU ? 'arastirma' : 'sunucu', surum: APP_VERSION, ...t, hazir: DR.hazir(),
        onarim: DR.onarimlar(req.query && req.query.gun), onarimTurleri: DOKTOR.K.ONARIM_TURLERI, sinirlar: DOKTOR.K.SINIRLAR,
        motor: guvenli(() => MOTOR.ozet(), null) });
    } catch (e) { res.status(500).json({ success: false, error: String(e.message || e).slice(0, 300) }); }
  });
  app.get('/api/hazir', (req, res) => {
    try { res.json({ success: true, ...DR.hazir({ taze: !!(req.query && req.query.taze === '1') }) }); }
    catch (e) { res.status(500).json({ success: false, error: String(e.message || e).slice(0, 300) }); }
  });

  // ── F2 ONARIM MOTORU ──────────────────────────────────────────────────────────
  const log = (seviye, metin) => guvenli(() => require('../database').addLog(seviye, metin));
  const oz = () => guvenli(() => ctx.ozDenetim, null);
  const ozCtx = () => guvenli(() => oz().ctx, null);
  const yedekAyar = () => guvenli(() => JSON.parse(fs.readFileSync(yollar.veri('yedek-ayar.json'), 'utf8')), undefined);
  /** Motorun girdileri — hepsi SALT OKUMA; okunamayan girdi null (kural "bilinmiyor" der, eylem yok). */
  const KAYNAKLAR = {
    veri: () => ctx.veriOrk.durum(),
    kayitci: () => { const c = ozCtx(); return c && typeof c.kayitci === 'function' ? c.kayitci() : null; },
    telegram: () => {
      const b = ctx.portfoyBildirici;
      if (!b || typeof b._kuyrukOku !== 'function') return null;
      const l = b._kuyrukOku();
      const son = [...(b.gecmis || [])].reverse().find(x => x && x.ok && !x.atlandi);
      const zamanlar = l.map(x => Number(x.zaman)).filter(Number.isFinite);
      return { kuyruk: l.length, enEski: zamanlar.length ? Math.min(...zamanlar) : null, sonBasari: son ? son.zaman : null,
        ikinciKanal: !!guvenli(() => (ctx.ikinciKanal() || {}).konu, false), basliklar: l.slice(-8).map(x => String(x.baslik || '').slice(0, 100)) };
    },
    yedek: () => {
      const a = yedekAyar();
      if (a === undefined) return { son: null };
      const hedef = a.hedef || path.join(os.homedir(), 'PusulaYedek');
      const son = a.son || null;
      const sorunVar = !son || son.hata || !(Date.now() - Date.parse(son.zaman) <= DOKTOR.ONARIM.YEDEK_YAS_MS);
      if (!sorunVar) return { son, hedef };
      let erisim = null;
      try { const st = fs.statSync(hedef); erisim = { var: st.isDirectory(), bos: null }; } catch { erisim = { var: false, bos: null }; }
      if (erisim.var && typeof fs.statfsSync === 'function') { const f = guvenli(() => fs.statfsSync(hedef), null); if (f) erisim.bos = Number(f.bavail) * Number(f.bsize); }
      return { son, hedef, erisim: erisim.var && erisim.bos == null ? null : erisim, gerekli: sonYedekBoyutu(hedef) };
    },
    mesgul: () => { const o = oz(); return o && typeof o._mesgulMu === 'function' ? o._mesgulMu() : false; },
    acilis: () => Date.now() - process.uptime() * 1000,
  };
  /** EYLEM BEYAZ LİSTESİ — onarim.js KURALLAR'daki `eylem` kimlikleriyle BİREBİR (öz test denetler). Başka eylem eklenmez. */
  const EYLEMLER = {
    'veri-yeniden': (h) => {
      const r = ctx.veriOrk.talep([h.ad], { neden: 'Pusula Doktoru' }) || {};
      const b = r.baslatildi || [];
      if (!b.length) return { tamam: false, atlandi: true, ayrinti: 'veri yöneticisi başlatmadı (son deneme çok yakın, veri bayat değil ya da Binance beklemesi)' };
      return { tamam: true, ayrinti: `${b.join(', ')} yeniden indiriliyor` };
    },
    'kayitci-yenile': async (h) => {
      const c = ozCtx();
      if (!c || typeof c.kayitciYenile !== 'function') return { tamam: false, ayrinti: 'kayıtçı yeniden başlatma yolu yok' };
      return (await c.kayitciYenile(h.ad, h.tur)) || { tamam: false, ayrinti: 'sonuç yok' };
    },
    'ikinci-kanal': async (h) => {
      const b = ctx.portfoyBildirici;
      if (!b || typeof b._ikinci !== 'function') return { tamam: false, ayrinti: 'ikinci kanal yolu yok' };
      const n = (h.once && h.once.kuyruk) || 0;
      const r = await b._ikinci('uyari', `Telegram'a ulaşılamıyor — ${n} ileti bekliyor`, [
        ...(h.basliklar || []).map(x => `• ${x}`), 'Pusula çalışıyor; iletiler Telegram dönünce sırayla gönderilecek. (Pusula Doktoru özeti)'], 'Telegram ulaşmıyor');
      if (r && r.atlandi) return { tamam: false, atlandi: true, ayrinti: 'ikinci kanal kurulu değil' };
      return { tamam: !!(r && r.ok), ayrinti: r && r.ok ? 'ikinci kanala özet gitti' : `ikinci kanal: ${(r && r.hata) || 'gönderilemedi'}` };
    },
    'yedek-yeniden': async () => {
      const bas = Date.now();
      const r = await require('../doktor/yedekKos').kos();
      const a = yedekAyar() || {};
      const s = a.son || {};
      const ok = r.kod === 0 && !s.hata && Date.parse(s.zaman) >= bas - 1000;
      return { tamam: ok, ayrinti: ok ? `yedek tamam: ${s.dosya || '?'} dosya` : `yedek olmadı: ${String(s.hata || r.hata || `çıkış kodu ${r.kod}`).slice(0, 160)}` };
    },
  };
  const MOTOR = DOKTOR.MOTOR.olustur({
    kaynaklar: KAYNAKLAR, eylemler: EYLEMLER, log, calisir: () => !ARASTIRMA_MODU,
    bildir: (baslik, satirlar, o) => (ctx.portfoyBildirici ? ctx.portfoyBildirici.gonder('uyari', baslik, satirlar, o) : null),
  });
  MOTOR_SON = MOTOR;

  const kademe = (req) => (req && req.kademe) || 'yerel';
  const hata = (res, d, metin) => res.status(d).json({ success: false, error: metin });
  const arastirmaRed = (res) => hata(res, 409, 'Onarım motoru sunucuda çalışır — bu bilgisayar geliştirme kopyası. Sunucudaki panelden (ya da telefondan) değiştirin.');
  const yanit = (res, ek = {}) => res.json({ success: true, ...ek, motor: MOTOR.ozet() });

  /** Etkin kipe geçiş: YALNIZ bu bilgisayar + yerel PIN (lib/yerelPin.js TEHLIKELI) + onay metni ONAR. Pusula kendiliğinden geçmez. */
  app.post('/api/doktor/motor/etkin', (req, res) => {
    if (ARASTIRMA_MODU) return arastirmaRed(res);
    if (kademe(req) !== 'yerel') return hata(res, 403, 'Etkin kipe geçiş yalnız sunucudaki panelden yapılır (telefondan yapılamaz). Telefondan yalnız izleme kipine dönebilirsiniz.');
    const onay = String((req.body && req.body.onay) || '').trim().toLocaleUpperCase('tr-TR');
    if (onay !== ONAY_METNI) return hata(res, 400, `Onay için ${ONAY_METNI} yazın.`);
    try {
      const r = MOTOR.kipAyarla('etkin', { kaynak: 'panel (bu bilgisayar, PIN + ONAR)' });
      if (r.degisti && ctx.portfoyBildirici) ctx.portfoyBildirici.gonder('uyari', 'Pusula Doktoru onarım motoru ETKİN', ['Bundan sonra açık kurallar sınırları içinde kendiliğinden dener. Telefondan "İzleme kipine dön" ile hemen durdurabilirsiniz (PIN gerekmez).',
        'Bunu siz yapmadıysanız: Sistem › Pusula Doktoru › İzleme kipine dön ve acil PIN\'i değiştirin.'], { anahtar: `doktor:etkin:${Date.now()}` }).catch(() => null);
      yanit(res, { degisti: r.degisti });
    } catch (e) { hata(res, 500, String(e.message || e).slice(0, 200)); }
  });
  /** Gölgeye (izleme) ya da kapalıya dönüş — PIN'siz, telefonda da (güvenli yön). 'etkin' burada KABUL EDİLMEZ. */
  app.post('/api/doktor/motor/kip', (req, res) => {
    if (ARASTIRMA_MODU) return arastirmaRed(res);
    const kip = String((req.body && req.body.kip) || '');
    if (kip !== 'golge' && kip !== 'kapali') return hata(res, 400, 'Bu uç yalnız izleme (golge) ya da kapalı kipine geçirir; etkin kip için sunucudaki panel › Etkin kipe geç.');
    try { const r = MOTOR.kipAyarla(kip, { kaynak: kademe(req) === 'telefon' ? 'telefon (PIN\'siz — güvenli yön)' : 'panel (bu bilgisayar)' }); yanit(res, { degisti: r.degisti }); }
    catch (e) { hata(res, 500, String(e.message || e).slice(0, 200)); }
  });
  const kuralUcu = (acik) => (req, res) => {
    if (ARASTIRMA_MODU) return arastirmaRed(res);
    if (kademe(req) !== 'yerel') return hata(res, 403, 'Kurallar yalnız sunucudaki panelden açılıp kapatılır.');
    const kural = String((req.body && req.body.kural) || '');
    if (!DOKTOR.ONARIM.KURAL[kural]) return hata(res, 400, 'tanımsız kural');
    try { MOTOR.kuralAyarla(kural, acik, { kaynak: 'panel (bu bilgisayar)' }); yanit(res); }
    catch (e) { hata(res, 500, String(e.message || e).slice(0, 200)); }
  };
  app.post('/api/doktor/motor/kural-ac', kuralUcu(true));      // yerel PIN (lib/yerelPin.js TEHLIKELI)
  app.post('/api/doktor/motor/kural-kapat', kuralUcu(false));  // PIN'siz (güvenli yön)

  if (process.env.DOKTOR !== '0') {
    const tik = () => { try { const r = DR.bakimTik(); if (r && r.sayi) require('../database').addLog('INFO', `🩺 Pusula Doktoru: ${r.sayi} geçici tatbikat klasörü silindi (24 saatten eski)`); } catch { /* bakım işi hata verse de Pusula sürer */ } };
    const t1 = setTimeout(tik, 20 * 60 * 1000);
    const t2 = setInterval(tik, 60 * 60 * 1000);
    const zamanlayicilar = [t1, t2];
    if (!ARASTIRMA_MODU) {
      const motorTik = () => { MOTOR.tik().catch(e => log('WARN', `🩺 Pusula Doktoru onarım motoru: ${String(e && e.message).slice(0, 160)}`)); };
      zamanlayicilar.push(setTimeout(motorTik, 16 * 60 * 1000), setInterval(motorTik, 10 * 60 * 1000));
    }
    for (const t of zamanlayicilar) if (t.unref) t.unref();
  }

  return { DOKTOR: DR, MOTOR, EYLEM_KIMLIKLERI: Object.freeze(Object.keys(EYLEMLER)) };
}

module.exports = { kur, sorunGirdisi, ONAY_METNI };
