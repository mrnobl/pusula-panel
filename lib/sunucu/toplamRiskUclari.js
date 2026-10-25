'use strict';
/**
 * TOPLAM RİSK UÇLARI (A3 — PLAN-MAKINE-HESAP-BOT §6, TASARIM-MAKINE-HESAP-BOT §6.1–6.4; hesap lib/toplamRisk.js)
 * ═══════════════════════════════════════════════════════════════════════════
 * server.js bu modülü makine uçlarından (MAKINE) hemen sonra bağlar.
 *   · Ölçüm: bütün bindirme botları (Kairos/Tao + kullanıcı botları) — borsaya BAĞLI olanın hesabı (y.hesap(): bakiye, pozisyonlar,
 *     açık emirler — salt okuma), BTC ayağı (spot/çoklu), felaket stopları (bellek), son marj oranı (bellek). Bağlı olmayan bot
 *     "ölçülemedi" satırıyla görünür, toplama girmez. Eşlenmiş makineler (3. faz) GET /api/makine/risk ile; eş yoksa dış istek YOK.
 *     DEMO KABUL BOTU (Kairos, 2026-12-09 sonuna kadar): borsaya EK okuma YOK — satır botun kendi son kaydından (kayittanSatir).
 *   · Zamanlama: izleme kipinde saatte bir (kayıt da saatte bir), sınır kipinde 5 dk'da bir; açılıştan 2 dk sonra ilk ölçüm.
 *     Araştırma kopyasında ÖLÇÜM YOK (botlar sunucuda; panel sunucunun yanıtını okur — lib/evOkuma.js EV_YOLU `toplam-risk$`).
 *     Ortam TOPLAM_RISK=0 → zamanlayıcı kurulmaz (öz testler ?yenile=1 ile tetikler).
 *   · Kapı kancası (r2): YALNIZ sınır kipinde ve yalnız CANLI hesaptaki bota (kullanıcı kararı 2026-10-25; kâğıt / demo yalnız izlenir) bot yürütücüsüne + BTC ayağına `riskKapisiFn` takılır;
 *     izleme kipinde alan hiç yoktur (davranış birebir). İzlemeye dönüşte kanca hemen sökülür.
 *
 *   GET  /api/toplam-risk               anlık değerler (son ölçüm) + 14 günlük dağılım + kip + eşikler (her kademe; ?yenile=1 yalnız bu
 *                                       bilgisayar, 60 sn'de en çok bir)
 *   POST /api/toplam-risk/esikler       { esikler, onay: true } — yalnız bu bilgisayar + yerel PIN (lib/yerelPin.js TEHLIKELI);
 *                                       izleme 14 günü dolmadan 409. Onaylı eşiklerle SINIR kipine geçer.
 *   POST /api/toplam-risk/kip           { kip: 'izleme', onay: true } — yalnız bu bilgisayar; izlemeye dönüş HER ZAMAN serbest (PIN'siz).
 *                                       Sınır kipine yalnız /esikler ile (PIN) geçilir.
 *   GET  /api/makine/risk               lib/makine/api.js (riskFn = makineRisk) — bu makinenin KENDİ bot satırları.
 * Öz denetim: 'toplamRisk' (haber) — ctx'e `toplamRisk` ölçümü verilir.
 */
const TR = require('../toplamRisk');
const yollar = require('../yollar');
const istemci = require('../makine/istemci');
const protokol = require('../makine/protokol');

const YENILE_MS = 60e3;
const BOT_SURE_MS = 30e3;
const TUR_MS = 5 * 60e3;
const ILK_MS = 2 * 60e3;

function sureli(p, ms, metin) {
  let t;
  return Promise.race([p, new Promise((_, r) => { t = setTimeout(() => r(new Error(metin)), ms); if (t.unref) t.unref(); })]).finally(() => clearTimeout(t));
}

/**
 * DEMO KABUL BOTU (Kairos, mod demo, 2026-12-09 sonuna kadar) — kullanıcı kararı 2026-10-25: borsaya EK okuma YOK. Satır botun KENDİ
 * son kaydından: özsermaye = durum.sonOzsermaye (son günlük çalışma sonu), miktarlar = emir defteri + durum (BTC ayağı btSanal, Donchian
 * donSanal, DCA sanalMiktarlar), fiyat = felaket stopunun konduğu andaki mark → BTC için son raporun fiyatı → defterdeki son dolum fiyatı.
 * Hiçbiri borsaya istek atmaz (yalnız bellek + bot dizininden yüklenmiş defter). Fiyatı bilinmeyen pozisyon satıra giremez → not düşülür.
 */
function kayittanSatir(b, temel) {
  const bot = b.bot, d = (bot && bot.durum) || {};
  const ozs = +d.sonOzsermaye;
  if (!(ozs > 0)) return TR.olculemedi(temel, 'demo kabul botu: son çalışma kaydı yok — borsadan okunmaz');
  const miktar = {};
  const ekle = (o) => { for (const [s, q] of Object.entries(o || {})) if (Number.isFinite(+q)) miktar[s] = (miktar[s] || 0) + +q; };
  try { if (bot.ayar.btcAyak === 'perp' && typeof bot.btSanal === 'function') ekle(bot.btSanal()); } catch { /* */ }
  try { ekle(bot.kol.donSanal()); } catch { /* */ }
  try { ekle(bot.kol.dca.sanalMiktarlar()); } catch { /* */ }
  const stoplar = bot.koruma && bot.koruma.durum ? bot.koruma.durum.stoplar : null;
  const sonDolum = {};
  try {
    for (const e of b.y.defter.emirler.values()) {
      if (!(+e.dolan > 0) || !(+e.ortFiyat > 0)) continue;
      const t = +e.olusturma || 0;
      if (!sonDolum[e.symbol] || t >= sonDolum[e.symbol].t) sonDolum[e.symbol] = { t, f: +e.ortFiyat };
    }
  } catch { /* defter yok */ }
  const rap = d.sonRapor || null;
  const btcF = rap && rap.btc && +rap.btc.fiyat > 0 ? +rap.btc.fiyat : null;
  const fiyat = (s) => (stoplar && stoplar[s] && +stoplar[s].mark > 0 ? +stoplar[s].mark : TR.varlikAdi(s) === 'BTC' && btcF ? btcF : sonDolum[s] ? sonDolum[s].f : null);
  const pozisyonlar = [], fiyatsiz = [];
  for (const [s, q] of Object.entries(miktar)) {
    if (Math.abs(q) < 1e-12) continue;
    const m = fiyat(s);
    if (!(m > 0)) { fiyatsiz.push(TR.varlikAdi(s)); continue; }
    pozisyonlar.push({ symbol: s, side: q < 0 ? 'short' : 'long', miktar: Math.abs(q), mark: m });
  }
  let btcSpot = null, usdt = ozs;
  if (bot.ayar.btcAyak && bot.ayar.btcAyak !== 'perp' && rap && rap.btc && +rap.btc.miktarSonra > 0 && btcF) {
    btcSpot = { miktar: +rap.btc.miktarSonra, fiyat: btcF };
    usdt = ozs - btcSpot.miktar * btcSpot.fiyat;
  }
  const satir = TR.botOlc({ ...temel, hesap: { bakiye: { toplam: usdt }, pozisyonlar }, btcAyak: bot.ayar.btcAyak, btcSpot, spotUsdt: 0, stoplar, marj: d.sonMarj });
  satir.kaynak = 'kayit';
  satir.kayitZamani = d.sonCalisma ? new Date(d.sonCalisma).toISOString() : null;
  if (fiyatsiz.length) satir.not = `fiyatı kayıtta olmayan pozisyon satıra girmedi: ${fiyatsiz.join(', ').slice(0, 120)}`;
  return satir;
}

/** Bir bindirme botunun satırı. Demo kabul botu → kayıttan (borsaya istek YOK); diğerleri borsadan salt okuma. */
async function botSatiriOlc(b, simdi, hesapIdFn = () => null) {
  const temel = { kimlik: b.ad, adGorunen: b.bot.adGorunen, mod: b.mod, hesapId: hesapIdFn(b), simdi };
  if (TR.dokunulmaz(b.mod, simdi)) return kayittanSatir(b, temel);
  if (!b.y || !b.y.borsa) return TR.olculemedi(temel, 'borsaya bağlı değil (bot durdu ya da bağlanıyor)');
  // Botun kendi işi sürerken (günlük çalışma, acil, mutabakat) ve borsa beklemesindeyken hesaba istek atılmaz — sonraki ölçümde.
  if (b.bot._calisma) return TR.olculemedi(temel, 'bot şu an çalışıyor — sonraki ölçümde');
  try { const hk = typeof b.y._hizKapisi === 'function' ? b.y._hizKapisi() : null; if (hk) return TR.olculemedi(temel, `borsa beklemesi: ${String(hk).slice(0, 120)}`); } catch { /* */ }
  try {
    const hesap = await sureli(b.y.hesap(), BOT_SURE_MS, 'hesap 30 sn içinde okunamadı');
    let btcSpot = null, spotUsdt = 0;
    const ayak = b.bot.ayar.btcAyak;
    if (ayak && ayak !== 'perp') {
      const q = await sureli(b.bot.btcMiktari(), BOT_SURE_MS, 'BTC miktarı okunamadı');
      const f = q > 0 ? await sureli(b.bot._btcFiyat(), BOT_SURE_MS, 'BTC fiyatı okunamadı') : 0;
      btcSpot = { miktar: q, fiyat: f };
      if (ayak === 'coklu') spotUsdt = await sureli(b.bot._spotUsdt(), BOT_SURE_MS, 'spot USDT okunamadı');
    }
    return TR.botOlc({ ...temel, hesap, btcAyak: ayak, btcSpot, spotUsdt,
      stoplar: b.bot.koruma && b.bot.koruma.durum ? b.bot.koruma.durum.stoplar : null, marj: b.bot.durum && b.bot.durum.sonMarj });
  } catch (e) { return TR.olculemedi(temel, `okunamadı: ${String(e && e.message || e).slice(0, 160)}`); }
}

function kur(ctx) {
  const { app, ARASTIRMA_MODU, makineEslesme } = ctx;
  const db = require('../database');
  const log = (lv, msg) => { try { db.addLog(lv, msg); } catch { console.log(msg); } };
  const ayarFn = () => (ctx.config && ctx.config.toplamRisk) || {};
  const benKimlik = () => { try { return ctx.makine.ben().kimlik; } catch { return null; } };

  const botSatiri = (b, simdi) => botSatiriOlc(b, simdi, (x) => { try { return ctx.botHesapId(x); } catch { return null; } });

  async function kaynak() {
    const simdi = Date.now();
    const l = [];
    for (const ad of ctx.BINDIRME_ADLAR.slice()) {
      const b = ctx.bindirmeler[ad];
      if (!b || !b.bot) continue;
      l.push(await botSatiri(b, simdi));   // sırayla: aynı anda tek botun hesabı okunur (hız sınırı dostu)
    }
    return l;
  }

  /** Eşlerin risk satırları (eş yoksa hiçbir istek yok). 404 = eş bu sürümde toplam risk vermiyor. */
  async function esler() {
    let l;
    try { l = makineEslesme.liste().makineler; } catch { return null; }
    if (!l.length) return [];
    const ben = benKimlik();
    const o = [];
    for (const es of l) {
      const jeton = makineEslesme.gidenJeton(es.kimlik);
      if (!jeton || !es.adres) { o.push({ kimlik: es.kimlik, ad: es.ad, hata: 'eşin jetonu ya da adresi yok — yeniden eşleyin' }); continue; }
      try {
        const r = await istemci.istek(es.adres, '/api/makine/risk', { ben, jeton });
        if (r.durum === 404 || r.durum === 501) { o.push({ kimlik: es.kimlik, ad: es.ad, hata: 'eş bu sürümde toplam risk vermiyor (eşi güncelleyin)' }); continue; }
        if (r.durum !== 200) { o.push({ kimlik: es.kimlik, ad: es.ad, hata: `eş ${r.durum} döndü` }); continue; }
        const d = protokol.dogrula('risk', r.govde);
        if (!d.ok) { o.push({ kimlik: es.kimlik, ad: es.ad, hata: `eşin yanıtı biçim dışı: ${d.hatalar.slice(0, 2).join('; ')}` }); continue; }
        const t = protokol.temizle('risk', r.govde);
        o.push({ kimlik: es.kimlik, ad: es.ad, satirlar: t.satirlar.map(s => ({ ...s, makine: es.kimlik })) });
      } catch (e) { o.push({ kimlik: es.kimlik, ad: es.ad, hata: String(e && e.message || e).slice(0, 160) }); }
    }
    return o;
  }

  const HIZMET = new TR.ToplamRisk({
    dizin: yollar.veri('live'), ayarFn, kaynak, esler, kaydet: log,
    bildir: ARASTIRMA_MODU ? null : (tur, baslik, satirlar, s) => ctx.portfoyBildirici.gonder(tur, baslik, satirlar, s),
  });
  let sonYerel = null;   // /api/makine/risk: yalnız bu makinenin satırları
  const olc = async (o = {}) => {
    const r = await HIZMET.olc(o);
    sonYerel = { zaman: new Date(r.zaman).toISOString(), satirlar: r.botlar.filter(b => !b.makine) };
    kancalariBagla();
    return r;
  };

  /** Kapı kancası: yalnız sınır kipinde ve canlı hesaptaki bota takılır; aksi hâlde alan HİÇ yok (birebir). */
  function kancaBagla(ad, b) {
    if (!b || !b.y || !b.bot) return;
    const a = HIZMET.ayar();
    // Kullanıcı kararı 2026-10-25: sınır yalnız CANLI hesaba; kâğıt / demo yalnız izlenir (kanca takılmaz).
    const tak = a.kip === 'sinir' && b.mod === TR.SINIR_GRUP && !TR.dokunulmaz(b.mod);
    if (tak) {
      if (b.y.ayar.riskKapisiFn && b.y.ayar.riskKapisiFn.__toplamRisk === ad) return;
      const fn = HIZMET.kapiFn(ad, () => b.mod);
      fn.__toplamRisk = ad;
      b.y.ayar.riskKapisiFn = fn;
      b.bot.ayar.riskKapisiFn = fn;
    } else {
      if ('riskKapisiFn' in b.y.ayar) delete b.y.ayar.riskKapisiFn;
      if ('riskKapisiFn' in b.bot.ayar) delete b.bot.ayar.riskKapisiFn;
    }
  }
  function kancalariBagla() {
    for (const ad of ctx.BINDIRME_ADLAR.slice()) { try { kancaBagla(ad, ctx.bindirmeler[ad]); } catch (e) { log('WARN', `[TOPLAM RİSK] ${ad}: kapı bağlanamadı: ${e.message}`); } }
  }
  kancalariBagla();

  function durum() {
    return { success: true, calisiyor: !ARASTIRMA_MODU, ...HIZMET.durum() };
  }

  app.get('/api/toplam-risk', async (req, res) => {
    try {
      if (req.query && req.query.yenile === '1' && !ARASTIRMA_MODU && (req.kademe || 'yerel') === 'yerel' && (!HIZMET.son || Date.now() - HIZMET.son.zaman > YENILE_MS)) await olc({ kayit: false });
      res.json(durum());
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  const yalnizYerel = (req, res) => {
    if ((req.kademe || 'yerel') !== 'yerel') { res.status(403).json({ success: false, error: 'Toplam risk kipi ve sınırları yalnız sunucu bilgisayarındaki panelden değiştirilir.' }); return false; }
    if (ARASTIRMA_MODU) { res.status(409).json({ success: false, error: 'Toplam risk sunucuda yönetilir — bu bilgisayar geliştirme kopyası.' }); return false; }
    return true;
  };

  app.post('/api/toplam-risk/esikler', (req, res) => {
    if (!yalnizYerel(req, res)) return;
    const g = req.body || {};
    if (g.onay !== true) return res.status(400).json({ success: false, error: 'onay gerekli (panelde onay penceresi)' });
    const d = TR.esikDogrula(g.esikler);
    if (!d.ok) return res.status(400).json({ success: false, error: `eşikler geçersiz: ${d.hatalar.join('; ')}` });
    const iz = HIZMET.durum().izleme;
    if (!iz.doldu) return res.status(409).json({ success: false, error: `İzleme ${TR.IZLEME_GUN} günü dolmadı (${iz.bas == null ? 'henüz ölçüm yok' : `${iz.kalanGun} gün kaldı`}) — sınırlar gerçek değerler görüldükten sonra onaylanır.` });
    const once = HIZMET.ayar();
    ctx.config.toplamRisk = { ...(ctx.config.toplamRisk || {}), kip: 'sinir', esikler: d.esikler, onay: { zaman: new Date().toISOString(), kaynak: 'panel' },
      ...(once.baslangic == null && iz.bas != null ? { baslangic: new Date(iz.bas).toISOString() } : {}) };
    ctx.saveConfig(ctx.config);
    kancalariBagla();
    const metin = TR.METRIKLER.map(m => `${m.ad} ${m.bicim === 'kat' ? `${d.esikler[m.anahtar]}×` : `%${Math.round(d.esikler[m.anahtar] * 1000) / 10}`}`).join(' · ');
    log('WARN', `[TOPLAM RİSK] sınır kipi açıldı (${metin}) — yalnız canlı hesap: sınırı aşacak büyüten emir verilmez; azaltan emir ve stoplar serbest; kâğıt / demo yalnız izlenir`);
    try { ctx.portfoyBildirici.gonder('uyari', 'Toplam risk: sınır kipi açıldı', [metin, 'Yalnız canlı hesap: sınırı aşacak büyüten emir verilmez; azaltan emir ve stoplar serbest. Kâğıt ve demo yalnız izlenir.', 'İzlemeye dönüş: Sistem › Sağlık › Toplam risk.'], { anahtar: `toplam-risk-kip:${Date.now()}` }); } catch { /* */ }
    olc({ kayit: false }).catch(() => null);   // kapı önbelleği hemen dolsun
    res.json(durum());
  });

  app.post('/api/toplam-risk/kip', (req, res) => {
    if (!yalnizYerel(req, res)) return;
    const g = req.body || {};
    if (g.kip === 'sinir') return res.status(400).json({ success: false, error: 'Sınır kipine sınırları onaylayarak geçilir (PIN) — Sistem › Sağlık › Toplam risk › Sınırları onayla.' });
    if (g.kip !== 'izleme') return res.status(400).json({ success: false, error: 'kip "izleme" olmalı' });
    if (g.onay !== true) return res.status(400).json({ success: false, error: 'onay gerekli (panelde onay penceresi)' });
    const once = HIZMET.ayar().kip;
    if (once === 'izleme' && (!ctx.config.toplamRisk || ctx.config.toplamRisk.kip !== 'sinir')) return res.json({ ...durum(), degismedi: true });
    ctx.config.toplamRisk = { ...(ctx.config.toplamRisk || {}), kip: 'izleme' };
    ctx.saveConfig(ctx.config);
    kancalariBagla();
    log('INFO', '[TOPLAM RİSK] kip: sınır → izleme — hiçbir emir engellenmez, yalnız ölçüm ve uyarı');
    res.json(durum());
  });

  /** /api/makine/risk (lib/makine/api.js riskFn): yalnız bu makinenin satırları; araştırma kopyasında boş (botlar sunucuda). */
  function makineRisk() {
    if (ARASTIRMA_MODU) return { zaman: null, satirlar: [] };
    return sonYerel || { zaman: null, satirlar: [] };
  }

  /** Öz denetim 'toplamRisk' (haber). */
  function saglik() {
    const a = HIZMET.ayar();
    const s = HIZMET.son;
    return { calisiyor: !ARASTIRMA_MODU, kip: a.kip, esikBozuk: a.esikBozuk, son: s ? s.zaman : null, asim: s ? s.asim : [], esUyarilari: s ? s.esUyarilari : [],
      olculemeyen: s ? s.botlar.filter(b => b.olculemedi && !b.makine).map(b => ({ kimlik: b.kimlik, neden: b.olculemedi })) : [] };
  }
  try { if (ctx.ozDenetim && ctx.ozDenetim.ctx) ctx.ozDenetim.ctx.toplamRisk = saglik; } catch { /* öz denetim yok */ }

  let zamanlayici = null;
  if (!ARASTIRMA_MODU && process.env.TOPLAM_RISK !== '0') {
    const tur = () => {
      const a = HIZMET.ayar();
      const aralik = a.kip === 'sinir' ? TR.SINIR_OLCUM_MS : TR.KAYIT_ARALIK_MS;
      if (HIZMET.son && Date.now() - HIZMET.son.zaman < aralik - 30e3) { kancalariBagla(); return; }
      olc().catch(e => log('WARN', `[TOPLAM RİSK] ölçüm yapılamadı: ${e.message}`));
    };
    const ilk = setTimeout(tur, ILK_MS);
    if (ilk.unref) ilk.unref();
    zamanlayici = setInterval(tur, TUR_MS);
    if (zamanlayici.unref) zamanlayici.unref();
  }

  return { HIZMET, olc, durum, makineRisk, saglik, kancaBagla, kancalariBagla, zamanlayici };
}

module.exports = { kur, botSatiriOlc, kayittanSatir };
