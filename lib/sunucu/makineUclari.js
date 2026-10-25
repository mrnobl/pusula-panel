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
 *   · 75.5 (3c): BOT TAŞIMA (lib/makine/botTasima.js — kaynak `tasi`, hedef `hazirlik` / `al`) + NÖBET (lib/makine/nobet.js): bu modül
 *     sunucu bağdaştırıcısını (`bot`: bot bilgisi, durdurma, sırlar, hedef denetimi, kayıt, dizinler, yeniden kurma, mutabakat) kurar;
 *     açılışta eşlenmiş SUNUCU varken çalışması gereken botları eşlere sorarak başlatır (botYonetimi NOBET_BEKLEYEN), elle Başlat /
 *     Çalıştır'da taze nöbet denetimi (`nobetKapisi` — server.js ara katmanı), açılışta belirsiz taşımaları hedefe sorar.
 * Bot, emir, ayar, anahtar, güncelleme DOKUNULMAZ — yalnız taşıma akışı botu durdurur / yerleştirir (kullanıcının PIN'li isteğiyle).
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
  /** 75.5 (3c): bot taşıma örneği — aşağıda kurulur (özet çağrı anında okur). */
  let TASIMA = null;

  /** Bu makinenin botları (yalnız görünürlük): kimlik, görünen ad, mod, çalışıyor mu, nöbet (2. faz kayıt alanı; 3c'de anlam kazanır). */
  function botlar() {
    try {
      const BA = require('../botAdlari');
      // 75.5: şu an buraya yerleşmekte olan (listede henüz olmayan) bot da bildirilir — kaynak "hâlâ yerleşiyor" görsün
      let yerlesen = [];
      try { yerlesen = TASIMA ? TASIMA.yerlesenler().filter(k => !ctx.BINDIRME_ADLAR.includes(k)) : []; } catch { yerlesen = []; }
      return [...ctx.BINDIRME_ADLAR, ...yerlesen].slice(0, 64).map(ad => {
        const b = ctx.bindirmeler[ad];
        const k = ctx.BOT_KAYIT ? ctx.BOT_KAYIT.kayit(ad) : null;
        return { kimlik: String(ad).slice(0, 32), adGorunen: String(BA.ad(ad) || (k && k.adGorunen) || ad).slice(0, 60),
          mod: protokol.MODLAR.includes(b ? b.mod : k && k.mod) ? (b ? b.mod : k.mod) : null,
          calisiyor: !!(b && b.bot && b.bot.durum && b.bot.durum.calisiyor), nobet: k && Number.isFinite(k.nobet) ? k.nobet : 0,
          // 75.5 (3c): botun sahibi (bot kaydı `makine`; null = bu makine) ve bu makinedeki taşıma aşaması
          makine: k && protokol.KIMLIK_RE.test(String(k.makine || '')) ? k.makine : null, tasima: tasimaAsamasi(ad) };
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
      baslangic: new Date(BASLANGIC).toISOString(), ...YONETICI.ozetAlanlari(), yetenek: [...protokol.YETENEKLER] };
  }
  /** 75.5: bot satırındaki taşıma aşaması (bot-tasima.json; okunamazsa null). TASIMA sonra kurulur — çağrı anında okunur. */
  function tasimaAsamasi(ad) { try { return TASIMA ? TASIMA.botOzetAlanlari(ad).tasima : null; } catch { return null; } }

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

  /*
   * 75.5 (3c) BOT TAŞIMA + NÖBET — sunucu bağdaştırıcısı (lib/makine/botTasima.js `bot`). Bot nesneleri, kayıt, dizinler ve sırlar burada;
   * taşıma akışının kendisi botTasima'da. Hiçbir yol pozisyon kapatmaz, emir vermez: kaynak botu yalnız DURDURUR, hedef botu yerleştirip
   * kendiliğinden BAŞLATMAZ (tasima-bekliyor + kullanıcının Mutabakat → Başlat'ı).
   */
  const fs = require('fs');
  const path = require('path');
  const yollar = require('../yollar');
  const tasimaLib = require('../tasima');
  const botTasimaLib = require('../makine/botTasima');
  const nobetLib = require('../makine/nobet');
  const anahtarlarLib = require('../anahtarlar');
  const botKayitLib = require('../botKayit');
  const { botUrl: botSaglikUrl } = require('../saglikSinyali');
  const BY = () => ctx.botYonetimi;
  const CANLI = () => ctx.borsa.CANLI_DIZIN;
  const BOT_RE = /^[a-z][a-z0-9]{1,15}$/;
  /** Günlük karar penceresi (UTC 23:50–01:30) — lib/bistHafif.js kararPenceresinde ile aynı. MAKINE_TASIMA_PENCERE=0 → yok sayılır (öz test). */
  const kararPenceresi = () => { if (process.env.MAKINE_TASIMA_PENCERE === '0') return false; const d = new Date(), dk = d.getUTCHours() * 60 + d.getUTCMinutes(); return dk >= 23 * 60 + 50 || dk < 90; };
  const dizinlerAdlar = (k) => [k, `${k}-demo`, `${k}-canli`];
  const dizinYolu = (ad) => { if (!botTasimaLib.DIZIN_RE.test(String(ad))) throw new Error(`bot dizini adı geçersiz: ${ad}`); return path.join(CANLI(), ad); };
  const dizinVar = (y) => { try { return fs.statSync(y).isDirectory(); } catch { return false; } };
  const gocMu = (k) => botKayitLib.GOC_ADLAR.includes(k);
  const kopya = (x) => (x ? JSON.parse(JSON.stringify(x)) : null);

  const BOT = {
    adlar: () => BY().BINDIRME_ADLAR.slice(),
    bilgi(k) {
      if (!BOT_RE.test(String(k || ''))) return null;
      const by = BY();
      const KB = ctx.BOT_KAYIT;
      const kayit = KB ? (KB.kayit(k) || KB.arsivKayit(k)) : null;
      const b = by.bindirmeler[k];
      if (!b && !kayit) return null;
      const temel = { kimlik: k, adGorunen: b ? b.bot.adGorunen : ((kayit && kayit.adGorunen) || k), nobet: kayit && Number.isInteger(kayit.nobet) ? kayit.nobet : 0,
        makine: kayit && protokol.KIMLIK_RE.test(String(kayit.makine || '')) ? kayit.makine : null };
      if (kayit && kayit.motor === 'model') return { ...temel, motor: 'model', mod: 'kagit', yuklu: false, kayit: null, dizinler: [] };
      const etkin = KB ? (gocMu(k) ? KB.etkinKayit(k) : kayit) : null;
      return { ...temel, motor: 'bindirme', mod: b ? b.mod : kayit.mod, yuklu: !!b, arsiv: !!(kayit && kayit.arsiv),
        calisiyor: !!(b && b.bot.durum.calisiyor), calismaSuruyor: !!(b && b.bot.calismaSuruyor && b.bot.calismaSuruyor()),
        strateji: (kayit && kayit.strateji) || k, sablon: kayit ? kayit.sablon || null : null,
        demoDizinDolu: botTasimaLib.icDolu(path.join(CANLI(), `${k}-demo`)),
        kayit: etkin && !etkin.arsiv ? kopya(etkin) : null,
        dizinler: dizinlerAdlar(k).map(ad => ({ ad, yol: path.join(CANLI(), ad) })).filter(d => dizinVar(d.yol)) };
    },
    /** Kaynak: botu durdurur (pozisyon / emir / felaket stopu KAPATILMAZ), süren çalışmayı bekler (≤ 5 dk), borsa bağlantısını keser. */
    async durdur(k) {
      const b = BY().bindirmeler[k];
      if (!b) return;
      if (b.bot.zamanlayici || b.bot.durum.calisiyor) b.bot.durdur();
      let zaman = null;
      try {
        await Promise.race([b.bot._sirali(async () => null), new Promise((_, red) => { zaman = setTimeout(() => red(new Error('süren çalışma 5 dakikada bitmedi')), 5 * 60000); })]);
      } finally { if (zaman) clearTimeout(zaman); }
      if (b.y.borsa) b.y.baglantiyiKes();
    },
    sirlar(k, mod) {
      const by = BY();
      const b = by.bindirmeler[k];
      const saglik = botSaglikUrl(ctx.config, k) || null;
      if (mod !== 'demo' || !b) return { hesap: null, saglik };
      const id = by.botHesapId(b);
      const h = id ? by.hesapBilgisi(id) : null;
      return { hesap: h ? { id: h.id, sabit: !!h.sabit, ad: h.ad, borsa: h.borsa, tur: h.tur, altHesap: h.altHesap || null, apiKey: h.apiKey, apiSecret: h.apiSecret } : null, saglik };
    },
    /** Hedef ön denetimi → engel metni | null. */
    hedefDenetle({ kimlik: k, mod, strateji, hesap }) {
      if (ARASTIRMA_MODU) return 'bu bilgisayar geliştirme / araştırma kopyası — bot alamaz';
      if (!BOT_RE.test(String(k || ''))) return 'bot kimliği geçersiz';
      const by = BY();
      if (!require('../research/bindirme').STRATEJILER[strateji || k]) return `bu bilgisayar "${strateji}" stratejisini tanımıyor`;
      const b = by.bindirmeler[k];
      const KB = ctx.BOT_KAYIT;
      const kayit = KB ? (KB.kayit(k) || KB.arsivKayit(k)) : null;
      if (gocMu(k) && KB && !KB.etkinKayit(k)) return `bu bilgisayarda ${by.botEtiketi(k)} bot kaydı kullanılamıyor (eski yol) — Pusula'yı yeniden başlatıp yeniden deneyin`;
      if (kayit && kayit.arsiv) return `bu bilgisayarda aynı kimlikli (${k}) arşivlenmiş bir bot var — üzerine taşınmaz`;
      if (b) {
        const sahipBen = !kayit || !kayit.makine || kayit.makine === KIMLIK.kimlik;
        // Sahibi bu makine olan bot "çalışıyor" işaretliyse (başlatılmış ya da açılışta başlaması gereken) üzerine taşınmaz; başka makineye
        // devredilmiş ESKİ kopyanın işareti önemsizdir (nöbet kuralı onu zaten başlatmaz) — yalnız gerçekten çalışıyorsa (zamanlayıcı) red.
        if (b.bot.zamanlayici || (sahipBen && b.bot.durum.calisiyor)) return `bu bilgisayarda "${b.bot.adGorunen}" (${k}) çalışıyor — önce burada durdurun`;
        if (b.bot.calismaSuruyor && b.bot.calismaSuruyor()) return `bu bilgisayarda "${b.bot.adGorunen}" botunun bir çalışması sürüyor`;
        if (sahipBen && b.mod !== 'kagit') return `bu bilgisayarda "${b.bot.adGorunen}" (${k}) kendi ${b.mod === 'demo' ? 'demo' : 'gerçek para'} hesabıyla kayıtlı — üzerine taşınmaz (önce burada kâğıda alın)`;
      }
      if (k === nobetLib.KAIROS && Date.now() < nobetLib.KORUMA_BITIS && ((b && b.mod === 'demo') || botTasimaLib.icDolu(path.join(CANLI(), 'hucum-demo')))) {
        return 'bu bilgisayarda Kairos demo kabulü sürüyor (hucum-demo) — Kairos buraya 2026-12-09\'a kadar taşınmaz';
      }
      const on = k.slice(0, 2);
      for (const x of (KB ? KB.tumKimlikler() : [])) if (x !== k && x.slice(0, 2) === on) return `bu bilgisayarda "${x}" aynı emir önekini (bd${on}) kullanıyor — "${k}" buraya yerleşemez`;
      if (mod === 'demo') {
        if (!hesap) return 'demo botun bağlı hesabı bildirilmedi';
        const c = by.hesapCakismasi(k, 'demo', hesap);
        if (c) return `bu bilgisayarda: ${c}`;
      }
      return null;
    },
    /** Gelen anahtar: yalnız demo hesabı; var olan FARKLI anahtarın üzerine yazılmaz. → engel metni | null */
    sirDenetle(k, sir, kayit) {
      const h = sir && sir.hesap;
      if (!h) return kayit.mod === 'demo' ? 'demo hesabının anahtarı pakette yok' : null;
      if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(String(h.id || ''))) return 'paketteki hesap kimliği geçersiz';
      if (!kayit.hesap || kayit.hesap.demo !== h.id) return 'paketteki hesap bot kaydındaki demo hesabıyla aynı değil';
      if (h.tur !== 'demo' || h.borsa !== 'binance') return 'yalnız Binance demo hesabı taşınır';
      if (!/^[A-Za-z0-9]{16,128}$/.test(String(h.apiKey || '')) || !/^[A-Za-z0-9]{16,128}$/.test(String(h.apiSecret || ''))) return 'paketteki anahtar biçimi geçersiz';
      const S = anahtarlarLib.SABIT[h.id];
      if (S) {
        const ka = ctx.config[S.key], ks = ctx.config[S.secret];
        if ((ka || ks) && (ka !== h.apiKey || ks !== h.apiSecret)) return `bu bilgisayarda "${S.ad}" hesabına başka bir anahtar kayıtlı — üzerine yazılmaz (Ayarlar › Anahtarlar'dan elle düzenleyin ya da o hesabı kullanmayan bir bot taşıyın)`;
        return null;
      }
      const m = ((ctx.ayar.loadSecrets() || {}).borsaHesaplari || {})[h.id];
      if (m && (m.apiKey !== h.apiKey || m.apiSecret !== h.apiSecret)) return `bu bilgisayarda "${m.ad || h.id}" hesabı başka bir anahtarla kayıtlı — üzerine yazılmaz`;
      return null;
    },
    /** Eksik anahtarı ekler → eklenenler (geri alma için). */
    sirYaz(k, h) {
      const S = anahtarlarLib.SABIT[h.id];
      if (S) {
        if (ctx.config[S.key] === h.apiKey && ctx.config[S.secret] === h.apiSecret) return [];
        const r = ctx.sirlariUygula({ [S.key]: h.apiKey, [S.secret]: h.apiSecret });
        if (!r || r.durum !== 200) throw new Error(`anahtar yazılamadı: ${(r && r.govde && r.govde.error) || '?'}`);
        return [{ tur: 'sabit', key: S.key, secret: S.secret }];
      }
      const g = ctx.ayar.loadSecrets() || {};
      const hs = { ...(g.borsaHesaplari && typeof g.borsaHesaplari === 'object' ? g.borsaHesaplari : {}) };
      if (hs[h.id]) return [];
      const z = new Date().toISOString();
      hs[h.id] = { ad: String(h.ad || h.id).slice(0, 40), borsa: 'binance', tur: 'demo', altHesap: h.altHesap ? String(h.altHesap).slice(0, 40) : null, apiKey: h.apiKey, apiSecret: h.apiSecret, eklendi: z, degisti: z, kaynak: 'makine-tasima' };
      ctx.ayar.saveSecrets({ ...g, borsaHesaplari: hs });
      return [{ tur: 'hesap', id: h.id }];
    },
    sirGeriAl: (eklenen) => botTasimaLib.sirEklenenGeriAl(eklenen, { loadSecrets: ctx.ayar.loadSecrets, saveSecrets: ctx.ayar.saveSecrets, config: ctx.config }),
    kayitDogrula(kayit) {
      if (!kayit || kayit.motor !== 'bindirme') return 'yalnız bindirme botu kaydı taşınır';
      if (kayit.arsiv) return 'arşivdeki bot taşınmaz';
      return botKayitLib.dogrula(kayit, { stratejiler: require('../research/bindirme').STRATEJILER });
    },
    dosyaKaydi: (k) => (ctx.BOT_KAYIT ? ctx.BOT_KAYIT.dosyaKaydi(k) : null),
    kayitYaz(kayit) { ctx.BOT_KAYIT.disaridanYaz(kayit); if (gocMu(kayit.kimlik)) ctx.saveConfig(ctx.config); },   // Kairos/Tao: config.bindirme yansıması kayıttan
    kayitGeriYukle(k, eski) { ctx.BOT_KAYIT.geriYukle(k, eski); if (gocMu(k)) { try { ctx.saveConfig(ctx.config); } catch (e) { log('ERROR', `🚚 ${k}: yansıma geri yazılamadı: ${e.message}`); } } },
    dizinYolu, dizinlerAdlar,
    /** Bot nesnesini diskteki (yeni ya da geri alınmış) veriden yeniden kurar — BAŞLATMAZ. */
    yenidenKur(k) {
      const by = BY();
      const b = by.bindirmeler[k];
      if (b) { try { if (b.bot.zamanlayici) b.bot.durdur(); } catch { /* */ } try { if (b.y.borsa) b.y.baglantiyiKes(); } catch { /* */ } }
      if (by.yeniBotMu(k)) {
        const x = ctx.BOT_KAYIT && ctx.BOT_KAYIT.kayit(k);
        if (b) by.botCikar(k);
        if (x && !x.arsiv && x.motor === 'bindirme') by.botEkle(k);
        return;
      }
      const mod = by.bindirmeAyar(k).mod;
      by.bindirmeler[k] = by.bindirmeKur(k, by.BINDIRME_MODLAR.includes(mod) ? mod : 'kagit');
    },
    /** Hedefte taşıma sonrası mutabakat (POST /api/bindirme/:ad/mutabakat ile aynı yol); temizse tasima-bekliyor kalkar. */
    async mutabakat(k) {
      const b = BY().bindirmeler[k];
      if (!b) throw new Error('bot yüklü değil');
      await b.bagla(); await b.y.mutabakat();
      const m = await b.bot.mutabakat();
      if (m && !m.engel) tasimaLib.mutabakatTemiz(k);
      return m;
    },
    sahipYaz: (k, v) => ctx.BOT_KAYIT.sahipYaz(k, v),
    bekleyenEkle: (k, o) => tasimaLib.botBekleyenEkle(k, o),
    bekleyenCikar: (k) => tasimaLib.botBekleyenCikar(k),
    /** Sağlık adresi: hedefte yoksa yazılır; farklıysa hedefinki korunur (uyarı). → uyarı metni | null */
    saglikYaz(k, url) {
      if (!url) return null;
      const var_ = botSaglikUrl(ctx.config, k);
      if (var_ === url) return null;
      if (var_) return 'bu bilgisayarda bu botun başka bir sağlık adresi vardı — korundu (isterseniz Ayarlar › Anahtarlar\'dan değiştirin)';
      const r = ctx.sirlariUygula(k === 'hucum' ? { healthchecksUrl: url } : { botSaglik: { [k]: url } });
      return r && r.durum === 200 ? null : `sağlık adresi yazılamadı (${(r && r.govde && r.govde.error) || '?'}) — Ayarlar › Anahtarlar'dan girin`;
    }
  };

  TASIMA = botTasimaLib.olustur({
    klasor: tasimaLib.klasor(), oncekiYolu: (k, d) => yollar.veri(`onceki-bot-${k}-${d}`), ben, eslesme: makineEslesme, bot: BOT, log,
    yedekSifre: () => tasimaLib.yedekSifre(), surum: () => String(APP_VERSION), rol: () => (ARASTIRMA_MODU ? 'gelistirme' : 'sunucu'), kararPenceresi,
    bildir: (baslik, satirlar, tur) => { try { ctx.portfoyBildirici.gonder(tur || 'bilgi', baslik, satirlar, { anahtar: `makine-tasima:${Date.now()}` }); } catch { /* bildirim yok */ } }
  });

  /** Kayıtlı SUNUCU eşleri (geliştirme bilgisayarı bot çalıştırmaz — nöbette sayılmaz). */
  function sunucuEsleri() {
    const d = NABIZ.oku();
    return makineEslesme.liste().makineler.filter(m => { const oz = nabizLib.enYeniOzet(d.esler[m.kimlik] || {}) || {}; return (oz.rol || m.rol) === 'sunucu'; });
  }
  async function esYanitlari(zamanAsimiMs) {
    const esler = sunucuEsleri();
    const yanitlar = await Promise.all(esler.map(async (es) => ({ kimlik: es.kimlik, ad: es.ad, ...(await TASIMA.esOzeti(es, zamanAsimiMs)) })));
    return { esler, yanitlar };
  }
  const botNobet = (ad) => { const k = ctx.BOT_KAYIT && ctx.BOT_KAYIT.kayit(ad); return k && Number.isInteger(k.nobet) ? k.nobet : 0; };

  /**
   * AÇILIŞ NÖBETİ (lib/makine/nobet.js acilisKarar): botYonetimi eşli sunucuda çalışması gereken botları NOBET_BEKLEYEN'e koyar; burada
   * sunucu eşlerine sorulup başlatılır ya da (devredildi / çakışma / eşlere ulaşılamadı) başlatılmaz + tek Telegram alarmı.
   */
  async function acilisNobet() {
    const by = BY();
    const bekleyen = (by.NOBET_BEKLEYEN || []).splice(0);
    if (!bekleyen.length) return [];
    const { esler, yanitlar } = await esYanitlari(10000);
    const out = [], baslamayan = [], haberler = [];
    for (const ad of bekleyen) {
      const b = by.bindirmeler[ad];
      if (!b || !b.bot.durum.calisiyor || b.bot.zamanlayici) continue;
      const e = TASIMA.engel(ad);
      if (e) { log('WARN', `[${ad}] açılışta başlamadı — ${e.metin}`); out.push({ bot: ad, basla: false, kod: e.kod }); continue; }
      const karar = nobetLib.acilisKarar({ bot: { kimlik: ad, mod: b.mod, nobet: botNobet(ad) }, esSayisi: esler.length, yanitlar, simdi: Date.now() });
      if (karar.devret) { try { ctx.BOT_KAYIT.sahipYaz(ad, karar.devret); } catch (x) { log('ERROR', `[${ad}] nöbet devri kaydedilemedi: ${x.message}`); } }
      if (karar.basla) {
        log(karar.haber ? 'WARN' : 'INFO', `[${ad}] açılış nöbet denetimi: ${karar.metin}`);
        if (karar.haber) haberler.push(`${b.bot.adGorunen}: ${karar.metin}`);
        by.acilisBaglan(ad, b);
      } else {
        log('WARN', `[${ad}] açılışta BAŞLAMADI — ${karar.metin}`);
        baslamayan.push(`${b.bot.adGorunen}: ${karar.metin}`);
      }
      out.push({ bot: ad, basla: karar.basla, kod: karar.kod });
    }
    try {
      if (baslamayan.length) ctx.portfoyBildirici.gonder('alarm', 'Bot açılışta başlamadı (nöbet denetimi)', [...baslamayan, 'Ne yapmalı: Ayarlar › Makineler\'de eşlerin durumuna bakın. Bot başka makinede çalışmıyorsa Botlar sayfasından elle Başlat.'], { anahtar: `nobet-acilis:${Date.now()}` });
      if (haberler.length) ctx.portfoyBildirici.gonder('uyari', 'Açılış nöbet denetimi (yalnız haber)', haberler, { anahtar: `nobet-haber:${Date.now()}` });
    } catch { /* bildirim yok */ }
    return out;
  }

  /**
   * NÖBET KAPISI (server.js ara katmanı — POST /api/bindirme/:ad/* , durdur hariç): yerel kural her işlemde; eşli sunucuda elle Başlat /
   * Çalıştır'da taze denetim (yalnız olumlu çakışma reddedilir — ulaşılamayan eş engellemez). → null | { kod, metin }
   */
  async function nobetKapisi(ad, islem) {
    if (!TASIMA || !BOT_RE.test(String(ad || ''))) return null;
    const e = TASIMA.engel(ad);
    if (e) return e;
    if (islem !== 'baslat' && islem !== 'calistir') return null;
    const b = BY().bindirmeler[ad];
    if (!b || !sunucuEsleri().length) return null;
    const { yanitlar } = await esYanitlari(5000);
    const c = nobetLib.baslatKarar({ bot: { kimlik: ad, mod: b.mod, nobet: botNobet(ad) }, yanitlar, simdi: Date.now() });
    if (c && c.devret) { try { ctx.BOT_KAYIT.sahipYaz(ad, c.devret); } catch { /* */ } }
    return c;
  }

  app.use(require('../makine/api').router({
    eslesme: makineEslesme, nabiz: NABIZ, ben, ozetFn: ozet, log, yonetici: YONETICI, kademeFn: kademe, tasima: TASIMA,
    // A3: GET /api/makine/risk — toplam risk modülü sonra kurulur (server.js), çağrı anında okunur
    riskFn: () => ctx.toplamRisk.makineRisk(),
    // Eşleme bir güvenlik olayıdır: Telegram'a (sunucuda; araştırma kopyasında bildirim zaten kapalı).
    bildir: (baslik, satirlar) => { try { ctx.portfoyBildirici.gonder('uyari', baslik, satirlar, { anahtar: `makine-esle:${Date.now()}` }); } catch { /* bildirim yok */ } }
  }));

  // 75.5: açılış nöbeti ve belirsiz taşımaların çözümü (eşler de açılıyor olabilir — birkaç saniye sonra)
  const acilisT = setTimeout(() => {
    acilisNobet().catch(e => log('ERROR', `🚚 Açılış nöbet denetimi yapılamadı: ${e.message}`));
    TASIMA.acilisCozumle().catch(e => log('WARN', `🚚 Belirsiz taşımalar denetlenemedi: ${e.message}`));
  }, Number(process.env.MAKINE_NOBET_GECIKME_MS) >= 0 && process.env.MAKINE_NOBET_GECIKME_MS !== undefined ? Number(process.env.MAKINE_NOBET_GECIKME_MS) : 3000);
  if (acilisT.unref) acilisT.unref();

  let zamanlayici = null;
  if (process.env.MAKINE_NABIZ !== '0') {
    const nabizTur = () => NABIZ.tur({ eslesme: makineEslesme, ben: ben(), ozetFn: ozet }).then(() => { try { YONETICI.degerlendir(); } catch { /* sonraki tur */ } }).catch(e => log('WARN', `🖧 Makine nabzı yollanamadı: ${e.message}`));
    const ilk = setTimeout(nabizTur, 60 * 1000);
    if (ilk.unref) ilk.unref();
    zamanlayici = setInterval(nabizTur, require('../makine/nabiz').NABIZ_MS);
    if (zamanlayici.unref) zamanlayici.unref();
  }
  if (process.env.MAKINE_YONETICI !== '0') YONETICI.baslat();

  /** 75.9 (3c-2): Telegram /menu › Makineler — yönetici, şu an dinleyen, eşlerin son nabzı (SALT OKUMA, ağ yok; lib/makine/yonetici.js menuOzeti). */
  function telegramOzeti(simdiMs = Date.now()) {
    let yon = null;
    try { yon = YONETICI.durum(); } catch { yon = null; }
    return require('../makine/yonetici').menuOzeti({ yon, liste: makineEslesme.liste(), durum: NABIZ.oku(), ben: ben(), rol: ARASTIRMA_MODU ? 'gelistirme' : 'sunucu', simdi: simdiMs });
  }
  return { KIMLIK, NABIZ, ozet, ben, zamanlayici, YONETICI, kademe, telegramEngeli: () => YONETICI.telegramEngeli(), TASIMA, nobetKapisi, acilisNobet, telegramOzeti };
}

module.exports = { kur };
