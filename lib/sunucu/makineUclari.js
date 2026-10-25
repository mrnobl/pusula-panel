'use strict';
/**
 * MAKİNE UÇLARI — 3. faz parça 3a (75.2, TASARIM-MAKINE-HESAP-BOT §4.1–4.2, §4.5 B1, §4.7 C3-uyum; PLAN-MAKINE-HESAP-BOT §4 f5).
 * ═══════════════════════════════════════════════════════════════════════════
 * server.js bu modülü BILDIRIM_KURULUM.uclar()'dan hemen sonra bağlar (uçlar lib/makine/api.js başlığında):
 *   · makine kimliği (<veri>/makine-kimlik.json, ilk açılışta bir kez) — lib/makine/kimlik.js
 *   · eşleme + jetonlar — lib/makine/eslesme.js (örnek server.js'te kurulur: lib/guvenlik.js makine kademesi aynı örneği kullanır → ctx.makineEslesme)
 *   · nabız: NABIZ_MS'de (5 dk) bir yalnız KAYITLI eşlere; eş yoksa hiçbir dış istek yok — lib/makine/nabiz.js
 *   · B1 Makineler panosu (salt okuma) — GET /api/makine/pano
 *   · 75.3 (3b): YÖNETİCİ MAKİNE (lib/makine/yonetici.js) — Telegram komut yoklayıcısının `engel` kancası (bildirimKurulum.telegram())
 *     + dakikada bir karar (geçici devralma / geri verme / 409 çekişmesi / sessiz eş uyarısı). Eş yokken karar hep "dinle" ve
 *     yoklayıcıya HİÇ dokunulmaz (bugünkü davranış). B3 kademe kapısı (lib/makine/kademe.js) → GET /api/makine/kademe.
 * Bot, emir, ayar, anahtar, güncelleme ve taşıma DOKUNULMAZ; taşıma + nöbet 3c.
 * Ortam: MAKINE_NABIZ=0 → nabız zamanlayıcısı kurulmaz (öz testler "Şimdi yokla" ucuyla tetikler); MAKINE_YONETICI=0 → yönetici
 * kararının dakikalık zamanlayıcısı kurulmaz (karar yine nabızda ve panelde verilir).
 */
const protokol = require('../makine/protokol');
const nabizLib = require('../makine/nabiz');

function kur(ctx) {
  const { app, kok, APP_VERSION, ARASTIRMA_MODU, makineEslesme } = ctx;
  const db = require('../database');
  const log = (lv, msg) => { try { db.addLog(lv, msg); } catch { console.log(msg); } };
  const KIMLIK = require('../makine/kimlik').hazirla();
  if (!KIMLIK.kalici) log('WARN', '🖧 Makine kimliği diske yazılamadı — bu açılış için geçici kimlik kullanılıyor (eşleme yapmayın; veri klasörünün yazılabilirliğine bakın).');
  const NABIZ = require('../makine/nabiz').olustur({ log });
  const ben = () => ({ kimlik: KIMLIK.kimlik, ad: KIMLIK.ad });

  /** Bu makinenin botları (yalnız görünürlük): kimlik, görünen ad, mod, çalışıyor mu, nöbet (2. faz kayıt alanı; 3c'de anlam kazanır). */
  function botlar() {
    try {
      const BA = require('../botAdlari');
      return ctx.BINDIRME_ADLAR.slice(0, 64).map(ad => {
        const b = ctx.bindirmeler[ad];
        const k = ctx.BOT_KAYIT ? ctx.BOT_KAYIT.kayit(ad) : null;
        return { kimlik: String(ad).slice(0, 32), adGorunen: String(BA.ad(ad) || (k && k.adGorunen) || ad).slice(0, 60),
          mod: protokol.MODLAR.includes(b ? b.mod : k && k.mod) ? (b ? b.mod : k.mod) : null,
          calisiyor: !!(b && b.bot && b.bot.durum && b.bot.durum.calisiyor), nobet: k && Number.isFinite(k.nobet) ? k.nobet : 0 };
      }).filter(x => /^[a-z0-9_-]{1,32}$/.test(x.kimlik));
    } catch { return []; }
  }
  function guncellemeOzeti() {
    try {
      const g = require('../guncelleme').durumOku(kok) || {};
      const sha = g.kurulu && /^[0-9a-f]{40}$/.test(String(g.kurulu.sha || '')) ? g.kurulu.sha : null;
      return { durum: g.durum ? String(g.durum).slice(0, 40) : null, zaman: g.kontrol ? String(g.kontrol).slice(0, 40) : null, sha, kurulum: g.durum === 'kuruldu' && g.kontrol ? String(g.kontrol).slice(0, 40) : null };
    } catch { return { durum: null, zaman: null, sha: null, kurulum: null }; }
  }
  const BASLANGIC = Date.now();
  /** Telegram komutlarını bu makine dinleyebilir mi: araştırma modu / geliştirme engeli yok ve Telegram kurulu (etkin + jeton + chat id). */
  const gelistirmeEngeli = () => { try { return ctx.TELEGRAM_GELISTIRME_ENGELI || null; } catch { return null; } };
  function telegramUygun() {
    if (ARASTIRMA_MODU || gelistirmeEngeli()) return false;
    try { const t = ctx.engine.telegram; return !!(t && t.enabled && t.botToken && t.chatId); } catch { return false; }
  }
  function ozet() {
    let disk = null;
    try { const d = ctx.diskDurumu(); disk = { bosGB: Number.isFinite(d && d.bosGB) ? d.bosGB : null }; } catch { disk = null; }
    let commit = null;
    try { commit = ctx.COMMIT ? String(ctx.COMMIT).slice(0, 40) : null; } catch { commit = null; }
    return { protokol: protokol.MAKINE_PROTOKOL, surum: String(APP_VERSION), commit, kimlik: KIMLIK.kimlik, ad: KIMLIK.ad,
      rol: ARASTIRMA_MODU ? 'gelistirme' : 'sunucu', zaman: new Date().toISOString(), botlar: botlar(), guncelleme: guncellemeOzeti(), disk,
      baslangic: new Date(BASLANGIC).toISOString(), ...YONETICI.ozetAlanlari() };
  }

  /*
   * 75.3 (3b) YÖNETİCİ MAKİNE: Telegram'ı yoklayan tek makine. Karar lib/makine/yonetici.js; bildirim türü 'makine' (bildirim merkezi —
   * kapatılabilir, sessiz saate uyar); yoklayıcı server.js'te sonra kurulur (ctx.telegramYoklayici, çağrı anında okunur).
   */
  const YONETICI = require('../makine/yonetici').olustur({
    eslesme: makineEslesme, nabiz: NABIZ, ben, log,
    rol: () => (ARASTIRMA_MODU ? 'gelistirme' : 'sunucu'), uygun: telegramUygun,
    yoklayiciYonet: !ARASTIRMA_MODU && !gelistirmeEngeli(),
    yoklayici: () => ctx.telegramYoklayici,
    baslangic: BASLANGIC,
    esikGelistirmeMs: () => { const u = ctx.BILDIRIM.uretici('makine'); return Number(u && u.esikSaat) * 3600e3; },
    bildir: (parcalar, degiskenler) => {
      const BM = require('../bildirimMetinleri');
      return Promise.resolve(ctx.engine.telegram.sendMessageDetailed(BM.varsayilanKur({ zaman: BM.kisaZaman(), ...parcalar }), { tur: 'makine', parcalar, degiskenler })).catch(() => null);
    }
  });
  try { YONETICI.degerlendir({ yoklayiciya: false }); } catch (e) { log('WARN', `🧭 Yönetici kararı verilemedi: ${e.message}`); }

  /** 75.3 (3b) B3: kademeli güncelleme kapısı — eşlerin son nabız özetleriyle (lib/makine/kademe.js). */
  function kademe(hedef) {
    const l = makineEslesme.liste();
    const d = NABIZ.oku();
    const esler = l.makineler.map(m => { const x = d.esler[m.kimlik] || {}; const oz = nabizLib.enYeniOzet(x) || {}; return { kimlik: m.kimlik, ad: oz.ad || m.ad, rol: oz.rol || m.rol, sonGorulme: nabizLib.sonGorulme(x), ozet: oz }; });
    return require('../makine/kademe').kademeKarar({ ben: { kimlik: KIMLIK.kimlik, rol: ARASTIRMA_MODU ? 'gelistirme' : 'sunucu', botlar: botlar() }, esler, hedef, simdi: Date.now() });
  }

  app.use(require('../makine/api').router({
    eslesme: makineEslesme, nabiz: NABIZ, ben, ozetFn: ozet, log, yonetici: YONETICI, kademeFn: kademe,
    // Eşleme bir güvenlik olayıdır: Telegram'a (sunucuda; araştırma kopyasında bildirim zaten kapalı).
    bildir: (baslik, satirlar) => { try { ctx.portfoyBildirici.gonder('uyari', baslik, satirlar, { anahtar: `makine-esle:${Date.now()}` }); } catch { /* bildirim yok */ } }
  }));

  let zamanlayici = null;
  if (process.env.MAKINE_NABIZ !== '0') {
    const nabizTur = () => NABIZ.tur({ eslesme: makineEslesme, ben: ben(), ozetFn: ozet }).then(() => { try { YONETICI.degerlendir(); } catch { /* sonraki tur */ } }).catch(e => log('WARN', `🖧 Makine nabzı yollanamadı: ${e.message}`));
    const ilk = setTimeout(nabizTur, 60 * 1000);
    if (ilk.unref) ilk.unref();
    zamanlayici = setInterval(nabizTur, require('../makine/nabiz').NABIZ_MS);
    if (zamanlayici.unref) zamanlayici.unref();
  }
  if (process.env.MAKINE_YONETICI !== '0') YONETICI.baslat();
  return { KIMLIK, NABIZ, ozet, ben, zamanlayici, YONETICI, kademe, telegramEngeli: () => YONETICI.telegramEngeli() };
}

module.exports = { kur };
