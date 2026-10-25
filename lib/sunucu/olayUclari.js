'use strict';
/**
 * B2 OLAY AKIŞI + D2 HAFTALIK KARNE uçları (TASARIM-MAKINE-HESAP-BOT §8.1, §8.3; PLAN-MAKINE-HESAP-BOT §8 s1, s3).
 * ═══════════════════════════════════════════════════════════════════════════
 *   GET /api/olaylar?bas&bit&tur&bot&makine&ciddiyet&ara&n&once[&yerel=1]
 *       bu makinenin akışı (lib/olayAkisi.js) + EŞ MAKİNELERİN akışı (makine kademesi, GET /api/makine/olaylar — yalnız kayıtlı eşler,
 *       5 sn zaman aşımı, eş başına en çok 300 satır) + araştırma kopyasında SUNUCUNUN akışı (lib/evOkuma jsonGetir, EV_IC_YOLU).
 *       `yerel=1`: yalnız bu makine (eşe / sunucuya sorulmaz — döngü yok).
 *   GET /api/makine/olaylar   yalnız bu makinenin akışı (eşin okuduğu uç; MAKINE_IZINLI). Satırlarda tutar yok.
 *   GET /api/makine/karne?bas=   (75.9) yalnız bu makinenin botlarının karne satırları (yüzde; eşin okuduğu uç — MAKINE_IZINLI).
 *       Karne eş SUNUCULARIN botlarını bu uçtan okur (makine başına ayrı grup; okunamazsa "okunamadı").
 *   GET /api/karne?bas=AAAA-AA-GG|bu   kayıtlı karne (<veri>/karne/<pazartesi>.json) ya da o an hesaplanan önizleme + kayıtlı haftalar.
 * Telegram: karne pazartesi ≥ 09:00 bildirim üreticisinin "gölge" adımında (lib/bildirimUreticileri.js golgeTik → `karneTelegram`),
 * YALNIZ Telegram'ı dinleyen makinede (75.3 yönetici; eş yokken her sunucu). Yazma ucu YOK; toplama ve karne bot koduna dokunmaz
 * (bellekteki botlardan salt okuma: ozet, ozsermayeOku, gecmis.satirlar — panelin Botlar grafiğiyle aynı).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const yollar = require('../yollar');
const OA = require('../olayAkisi');
const KARNE = require('../karne');

const ESLER_ZAMAN_ASIMI = 5000;
const ES_N_TAVAN = 300;

function kur(ctx) {
  const { app, kok, ARASTIRMA_MODU } = ctx;
  const db = require('../database');
  const log = (lv, msg) => { try { db.addLog(lv, msg); } catch { console.log(msg); } };
  const BA = require('../botAdlari');
  const makineAdi = () => { try { return (ctx.makine && ctx.makine.KIMLIK && ctx.makine.KIMLIK.ad) || os.hostname(); } catch { return os.hostname(); } };

  const botlarListesi = () => { try { return ctx.BINDIRME_ADLAR.map(ad => ctx.bindirmeler[ad]).filter(b => b && b.bot); } catch { return []; } };
  /** Metindeki (bildirim başlığı, günlük satırı) bot adı → bot kimliği. */
  function botBul(metin) {
    const m = String(metin || '');
    for (const b of botlarListesi()) {
      const adlar = [...new Set([BA.ad(b.ad), b.bot.adGorunen, b.ad].filter(Boolean).map(String))];
      if (adlar.some(a => m === a || m.startsWith(`${a} `) || m.startsWith(`${a}:`) || m.startsWith(`${a} (`))) return b.ad;
    }
    return null;
  }

  const OLAY = OA.olustur({
    dizin: yollar.veri('olaylar'), makine: makineAdi, log,
    kaynaklar: {
      // Araştırma kopyasında botlar sunucuda çalışır — bu bilgisayarın eski bot dosyaları akışa girmez (sunucunun akışı birleştirilir).
      botlar: () => (ARASTIRMA_MODU ? [] : botlarListesi().map(b => ({ ad: b.ad, dizin: b.dizin }))),
      gunlukDizin: process.env.GUNLUK_DIZIN || yollar.veri('gunluk'),
      ozDenetimDizin: (() => { try { return (ctx.ozDenetim && ctx.ozDenetim.dizin) || yollar.veri('oz-denetim'); } catch { return yollar.veri('oz-denetim'); } })(),
      bildirimGecmis: yollar.programVeri(kok, 'bildirim-gecmis.jsonl'),
      ayarGecmisDizin: yollar.veri('ayar-gecmisi'),
      guncellemeGecmis: () => { try { return (require('../guncelleme').durumOku(kok) || {}).gecmis || []; } catch { return []; } },
      kararlar: () => { if (ARASTIRMA_MODU) return []; try { return require('../tasarimci/defter').oku('kararlar').satirlar; } catch { return []; } },
      botBul, adFn: (k) => BA.ad(k),
    },
  });
  if (process.env.OLAY_AKISI !== '0') OLAY.baslat();

  /** Eş makinelerin akışı (yalnız kayıtlı eşler; eş yoksa dış istek YOK). */
  async function eslerdenOku(sz) {
    let esler = [];
    try { esler = ctx.makineEslesme.liste().makineler || []; } catch { esler = []; }
    if (!esler.length) return { yanitlar: [], durum: [] };
    const istemci = require('../makine/istemci');
    const ben = (() => { try { return ctx.makine.KIMLIK.kimlik; } catch { return null; } })();
    const p = new URLSearchParams({ bas: sz.basGun, bit: sz.bitGun, n: String(Math.min(ES_N_TAVAN, sz.n)), ...(sz.turler.length ? { tur: sz.turler.join(',') } : {}),
      ...(sz.bot ? { bot: sz.bot } : {}), ...(sz.ciddiyet ? { ciddiyet: sz.ciddiyet } : {}), ...(sz.ara ? { ara: sz.ara } : {}), ...(sz.once ? { once: String(sz.once) } : {}) });
    const sonuc = await Promise.all(esler.map(async (es) => {
      const jeton = ctx.makineEslesme.gidenJeton(es.kimlik);
      if (!jeton || !es.adres) return { es, hata: 'eşin adresi ya da jetonu yok' };
      try {
        const r = await istemci.istek(es.adres, `/api/makine/olaylar?${p}`, { ben, jeton, zamanAsimiMs: ESLER_ZAMAN_ASIMI });
        if (r.durum !== 200 || !r.govde || !r.govde.success) return { es, hata: `eş yanıtı ${r.durum}${r.govde && r.govde.error ? ` — ${String(r.govde.error).slice(0, 120)}` : ''}` };
        const ad = String(es.ad || es.kimlik).slice(0, 60);
        return { es, yanit: { ...r.govde, olaylar: (r.govde.olaylar || []).map(x => OA.olay({ ...x, makine: x.makine || ad })).filter(Boolean) } };
      } catch (e) { return { es, hata: String(e.message || e).slice(0, 160) }; }
    }));
    return { yanitlar: sonuc.filter(x => x.yanit).map(x => x.yanit), durum: sonuc.map(x => ({ ad: x.es.ad || x.es.kimlik, durum: x.yanit ? 'tamam' : 'ulasilamadi', hata: x.hata || null })) };
  }

  app.get('/api/olaylar', async (req, res) => {
    try {
      const q = req.query || {};
      const sz = OA.suzgecNormal(q);
      OLAY.tazele();
      const yerel = OLAY.oku(q);
      const yanitlar = [yerel];
      let esler = [], sunucu = null;
      if (q.yerel !== '1') {
        if (ARASTIRMA_MODU) {
          const ev = ctx.evOkuma;
          if (ev && ev.ayar()) {
            const p = new URLSearchParams({ ...Object.fromEntries(Object.entries(q).filter(([a, v]) => typeof v === 'string' && a !== 'yerel')), yerel: '1' });
            let r = null;
            try { r = await ev.jsonGetir(`/api/olaylar?${p}`); } catch { r = null; }
            if (r && r.govde && r.govde.success) { yanitlar.push(r.govde); sunucu = { durum: r.eski ? 'eski' : 'tamam', zaman: r.zaman || null }; }
            else sunucu = { durum: 'ulasilamadi' };
          } else sunucu = { durum: 'kurulu-degil' };
        } else {
          const e = await eslerdenOku(sz);
          yanitlar.push(...e.yanitlar); esler = e.durum;
        }
      }
      const r = yanitlar.length > 1 ? OA.birlestir(yanitlar, sz) : yerel;
      res.json({ success: true, ...r, makine: makineAdi(), esler, sunucu, arastirma: ARASTIRMA_MODU, turler: OA.TURLER.map(t => ({ id: t, ad: OA.TUR_AD[t] })), toplayici: OLAY.durum(), saklaAy: OA.SAKLA_AY });
    } catch (e) { res.status(500).json({ success: false, error: String(e.message || e).slice(0, 300) }); }
  });
  app.get('/api/makine/olaylar', (req, res) => {
    try {
      const q = { ...(req.query || {}) };
      q.n = String(Math.min(ES_N_TAVAN, Number(q.n) || 200));
      OLAY.tazele();
      const r = OLAY.oku(q);
      res.json({ success: true, olaylar: r.olaylar, toplam: r.toplam, sayilar: r.sayilar, kesildi: r.kesildi, makine: makineAdi() });
    } catch (e) { res.status(500).json({ success: false, error: String(e.message || e).slice(0, 300) }); }
  });

  // ── D2 Haftalık karne ──────────────────────────────────────────────────────
  const KARNE_DIZIN = yollar.veri('karne');
  const karneDosya = (bas) => path.join(KARNE_DIZIN, `${bas}.json`);
  const karneListe = () => { try { return fs.readdirSync(KARNE_DIZIN).map(f => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f)).filter(Boolean).map(m => m[1]).sort().reverse(); } catch { return []; } };
  const karneOku = (bas) => { try { return JSON.parse(fs.readFileSync(karneDosya(bas), 'utf8')); } catch { return null; } };
  function karneYaz(k) {
    fs.mkdirSync(KARNE_DIZIN, { recursive: true });
    const g = `${karneDosya(k.hafta.bas)}.${process.pid}.tmp`;
    fs.writeFileSync(g, JSON.stringify(k, null, 1));
    fs.renameSync(g, karneDosya(k.hafta.bas));
  }

  const benKimlik = () => { try { return ctx.makine.KIMLIK.kimlik; } catch { return null; } };
  /** 75.9: bu makinedeki eski kopya mı (bot kaydı `makine` başka bir makine — bot oraya taşındı; karnede o makinenin satırında sayılır). */
  function baskaMakinede(ad) {
    try { const k = ctx.BOT_KAYIT && ctx.BOT_KAYIT.kayit(ad); const b = benKimlik(); return !!(k && k.makine && b && k.makine !== b); } catch { return false; }
  }
  /** Karnenin bot girdileri — bellekteki botlardan SALT OKUMA (ağ yok); başka makineye taşınmış eski kopyalar hariç. */
  function yerelBotGirdileri() {
    const IG = require('../live/islemGecmisi');
    const isletim = require('../live/isletim');
    let golge = null;
    try { golge = isletim.golgeOku(ctx.GOLGE_DOSYA); } catch { golge = null; }
    return botlarListesi().filter(b => !baskaMakinede(b.ad)).map(b => {
      let o = {};
      try { o = b.bot.ozet() || {}; } catch { o = {}; }
      let egri = [], islemler = [];
      try { egri = IG.ozsermayeKarsilastir(b.bot.ozsermayeOku(), golge, b.ad, (b.bot.durum && b.bot.durum.sermayeAkislari) || []).egri || []; } catch { egri = []; }
      try { islemler = (b.bot.gecmis && b.bot.gecmis.satirlar()) || []; } catch { islemler = []; }
      return { ad: b.ad, adGorunen: BA.ad(b.ad) || o.adGorunen || b.ad, mod: b.mod || o.mod || null, durum: o.engel ? 'engel' : o.calisiyor ? 'calisiyor' : 'durdu',
        egri: egri.map(x => ({ gun: x.gun, gercek: x.gercek, btc: x.btc })), islemler: islemler.map(x => ({ zaman: x.zaman })) };
    });
  }
  /**
   * 75.9 (3c-2): EŞ SUNUCULARIN karne satırları — eş başına GET /api/makine/karne?bas= (makine kademesi, 5 sn; yalnız kayıtlı SUNUCU eşleri;
   * eş yoksa dış istek YOK). Okunamayan eş "okunamadı" + son nabızdaki bot adları. Araştırma kopyasında okunmaz (karne sunucudan gelir).
   */
  async function eslerKarne(h) {
    if (ARASTIRMA_MODU) return [];
    let esler = [], durum = { esler: {} };
    try { esler = ctx.makineEslesme.liste().makineler || []; } catch { esler = []; }
    if (!esler.length) return [];
    const nabizLib = require('../makine/nabiz');
    try { durum = ctx.makine.NABIZ.oku(); } catch { durum = { esler: {} }; }
    const sunucular = esler.map(es => ({ es, oz: nabizLib.enYeniOzet((durum.esler || {})[es.kimlik] || {}) || {} })).filter(x => (x.oz.rol || x.es.rol) === 'sunucu');
    if (!sunucular.length) return [];
    const istemci = require('../makine/istemci');
    const ben = benKimlik();
    return Promise.all(sunucular.map(async ({ es, oz }) => {
      const ad = String(oz.ad || es.ad || es.kimlik).slice(0, 64);
      const bilinen = (Array.isArray(oz.botlar) ? oz.botlar : []).filter(b => b && (!b.makine || b.makine === es.kimlik)).map(b => BA.ad(b.kimlik) || b.adGorunen || b.kimlik);
      const jeton = ctx.makineEslesme.gidenJeton(es.kimlik);
      if (!jeton || !es.adres) return { makine: ad, kimlik: es.kimlik, durum: 'okunamadi', hata: 'eşin adresi ya da jetonu yok', bilinen };
      try {
        const r = await istemci.istek(es.adres, `/api/makine/karne?bas=${encodeURIComponent(h.bas)}`, { ben, jeton, zamanAsimiMs: ESLER_ZAMAN_ASIMI });
        if (r.durum === 404) return { makine: ad, kimlik: es.kimlik, durum: 'okunamadi', hata: 'eş eski sürümde (75.9 öncesi) — eşi güncelleyin', bilinen };
        if (r.durum !== 200 || !r.govde || !r.govde.success || !Array.isArray(r.govde.botlar)) return { makine: ad, kimlik: es.kimlik, durum: 'okunamadi', hata: `eş yanıtı ${r.durum}${r.govde && r.govde.error ? ` — ${String(r.govde.error).slice(0, 120)}` : ''}`, bilinen };
        if (r.govde.hafta && r.govde.hafta.bas !== h.bas) return { makine: ad, kimlik: es.kimlik, durum: 'okunamadi', hata: 'eş başka bir haftayı döndürdü', bilinen };
        return { makine: ad, kimlik: es.kimlik, durum: 'tamam', botlar: r.govde.botlar };
      } catch (e) { return { makine: ad, kimlik: es.kimlik, durum: 'okunamadi', hata: String(e.message || e).slice(0, 160), bilinen }; }
    }));
  }
  /** Karnenin girdisi — bellekteki botlardan ve yerel kayıtlardan SALT OKUMA; 75.9: + eş sunucuların satırları. */
  async function karneGirdisi(h) {
    const botlar = yerelBotGirdileri();
    let portfoyum = null;
    try { const p = ctx.portfoyum.ozetKur(); if (p && p.seri && p.seri.length) portfoyum = p.seri.map(x => ({ tarih: x.tarih, endeksUSD: x.endeksUSD })); } catch { portfoyum = null; }
    const modeller = [];
    try {
      const DF = require('../tasarimci/defter'), MD = require('../tasarimci/model');
      const gs = DF.oku('gunluk').satirlar;
      for (const m of MD.sabitleme().modeller) {
        const tl = m.id === 'm-bist-m10';
        const alan = tl ? 'endeksTl' : 'endeks';
        const seri = gs.filter(s => s.model === m.id && Number.isFinite(s[alan])).map(s => ({ gun: s.gun, endeks: s[alan] }));
        if (seri.length) modeller.push({ id: m.id, ad: BA.ad(m.id) || m.ad, para: tl ? 'TRY' : 'USD', seri });
      }
    } catch { /* model defteri yok */ }
    let sorunlar = null;
    try {
      const s = ctx.sorunlarHesapla();
      const sira = { mudahale: 0, dikkat: 1, gecici: 2, bilgi: 3 };
      sorunlar = { sayac: s.sayac, basliklar: (s.sorunlar || []).slice().sort((a, b) => (sira[a.ciddiyet] ?? 9) - (sira[b.ciddiyet] ?? 9)).filter(k => k.ciddiyet !== 'bilgi').map(k => String(k.baslik || '').slice(0, 120)).filter(Boolean) };
    } catch { sorunlar = null; }
    let olaylar = null;
    try {
      OLAY.tazele();
      const ham = { bas: h.bas, bit: h.bit, n: 1 };
      olaylar = { sayilar: OLAY.oku(ham).sayilar, uyari: OLAY.oku({ ...ham, ciddiyet: 'uyari' }).toplam - OLAY.oku({ ...ham, ciddiyet: 'alarm' }).toplam, alarm: OLAY.oku({ ...ham, ciddiyet: 'alarm' }).toplam };
    } catch { olaylar = null; }
    let demo = null;
    try {
      if (!ARASTIRMA_MODU) {
        const d = ctx.demoKabulOzet.ozet();
        if (d && d.veriVar) demo = { gecenGun: d.gecenGun, hukumTarihi: d.hukumTarihi, sonBant: d.uygulama && d.uygulama.sonBant, calisiyor: !!(d.calisma && d.calisma.calisiyor) };
      }
    } catch { demo = null; }
    let golgeSatir = [], hukumTarihleri = [];
    try { const g = (await require('../golgeOzet').satirlar()) || []; golgeSatir = g.map(String); hukumTarihleri = g.hukumTarihleri || []; } catch { golgeSatir = []; }
    let esler = [];
    try { esler = await eslerKarne(h); } catch (e) { esler = []; log('WARN', `📒 Karne: eşler okunamadı: ${e.message}`); }
    return { hafta: h, olusturma: Date.now(), botlar, portfoyum, modeller, sorunlar, olaylar, ileri: { demo, golge: golgeSatir, hukumTarihleri }, esler, makine: makineAdi() };
  }
  async function karneHesapla(h) { return KARNE.karneKur(await karneGirdisi(h)); }

  /** Bildirim üreticisinin kaynağı (pazartesi ≥ 09:00): geçen haftanın karnesini hesaplar, KAYDEDER, Telegram parçalarını verir. */
  async function karneTelegram() {
    const h = KARNE.sonBitenHafta();
    const k = await karneHesapla(h);
    try { karneYaz(k); } catch (e) { log('WARN', `📒 Haftalık karne kaydedilemedi: ${e.message}`); }
    log('INFO', `📒 Haftalık karne hazırlandı: ${h.bas} – ${h.bit} (${k.botlar.length} bot)`);
    let engel = null;
    try { engel = ctx.makine && typeof ctx.makine.telegramEngeli === 'function' ? ctx.makine.telegramEngeli() : null; } catch { engel = null; }
    if (engel) return { atla: `Telegram'ı başka makine dinliyor (${String(engel).slice(0, 80)}) — karne o makineden gider` };
    const BM = require('../bildirimMetinleri');
    return { parcalar: k.telegram, degiskenler: { hafta: h.etiket, aralik: `${h.bas.slice(8, 10)}.${h.bas.slice(5, 7)} – ${h.bit.slice(8, 10)}.${h.bit.slice(5, 7)}`, liste: k.telegram.govde.map(BM.kacir) } };
  }

  /**
   * 75.9 (3c-2) GET /api/makine/karne?bas=AAAA-AA-GG — eşin okuduğu uç (MAKINE_IZINLI): YALNIZ bu makinenin (sahibi olduğu) botlarının karne
   * satırları — yüzde / puan / işlem sayısı; tutar, bakiye, adet YOK. Eşe sorulmaz (döngü yok), dosya yazmaz.
   */
  app.get('/api/makine/karne', (req, res) => {
    try {
      const q = req.query || {};
      const h = /^d{4}-d{2}-d{2}$/.test(String(q.bas || '')) ? KARNE.hafta(String(q.bas)) : KARNE.sonBitenHafta();
      res.json({ success: true, makine: makineAdi(), kimlik: benKimlik(), hafta: h, botlar: KARNE.botSatirlari(yerelBotGirdileri(), h.bas, h.bit) });
    } catch (e) { res.status(500).json({ success: false, error: String(e.message || e).slice(0, 300) }); }
  });

  app.get('/api/karne', async (req, res) => {
    try {
      const q = req.query || {};
      const liste = karneListe();
      let h;
      if (q.bas === 'bu') h = KARNE.hafta(KARNE.istGun(Date.now()));
      else if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.bas || ''))) h = KARNE.hafta(String(q.bas));
      else h = KARNE.sonBitenHafta();
      const kayitli = karneOku(h.bas);
      const suruyor = h.bas === KARNE.hafta(KARNE.istGun(Date.now())).bas;
      const karne = kayitli || await karneHesapla(h);
      res.json({ success: true, karne, kayitli: !!kayitli, onizleme: !kayitli, suruyor, haftalar: liste, sonBiten: KARNE.sonBitenHafta().bas, buHafta: KARNE.hafta(KARNE.istGun(Date.now())).bas });
    } catch (e) { res.status(500).json({ success: false, error: String(e.message || e).slice(0, 300) }); }
  });

  return { OLAY, karneTelegram, karneHesapla, botBul };
}

module.exports = { kur };
