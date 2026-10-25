'use strict';
/**
 * MAKİNE UÇLARI (75.2, 3. faz parça 3a — TASARIM-MAKINE-HESAP-BOT §4.2, §4.5, §4.7) — Express yönlendiricisi.
 * ═══════════════════════════════════════════════════════════════════════════
 *   GET  /api/makine/kimlik        bu makinenin özeti (protokol, sürüm, kimlik, ad, rol, botlar, güncelleme, disk) — her kademe
 *                                   (makine kademesinde MAKINE_IZINLI listesinde). Sır yok.
 *   GET  /api/makine/pano          B1 Makineler panosu (SALT OKUMA): bu makine + eşler (son görülme, sürüm/uyum, botlar, güncelleme,
 *                                   disk, adres). ?yenile=1 eşlere hemen nabız yollar (60 sn'de en çok bir kez). Makine kademesine KAPALI.
 *   POST /api/makine/esle/kod      [yalnız bu bilgisayar + yerel PIN] tek kullanımlık eşleme kodu (8 × 4 rakam, 10 dk)
 *   POST /api/makine/esle-baslat   [yalnız bu bilgisayar + yerel PIN] { adres, kod, kendiAdres } — karşı makinenin koduyla eşleşir
 *   POST /api/makine/esle          [jetonsuz, KODLU; IP başına 10 dk'da 5 deneme] eşlemeyi başlatan makinenin isteği (lib/guvenlik.js
 *                                   bu TEK yolu panel jetonu istemeden geçirir; kodu yalnız burada doğrulanır)
 *   POST /api/makine/kaldir        [yalnız bu bilgisayar + yerel PIN] { kimlik } — eşi ve jetonlarını siler (karşı tarafa haber verilmez)
 *   POST /api/makine/nabiz         [YALNIZ makine kademesi] eşin nabzı → kaydet, yanıtta bu makinenin özeti
 *   POST /api/makine/nabiz/simdi   [yalnız bu bilgisayar] bütün eşlere şimdi nabız
 * 3a'da yönetici seçimi, devralma, taşıma YOK (3b/3c). Bu uçların hiçbiri bot başlatmaz/durdurmaz, emir vermez, ayar/anahtar yazmaz.
 */
const express = require('express');
const protokol = require('./protokol');
const eslesmeLib = require('./eslesme');
const nabizLib = require('./nabiz');
const istemci = require('./istemci');

const ESLE_HAK = 5;
const ESLE_PENCERE_MS = 10 * 60 * 1000;
const PANO_YENILE_MS = 60 * 1000;

/**
 * @param o.eslesme   lib/makine/eslesme olustur()
 * @param o.nabiz     lib/makine/nabiz olustur()
 * @param o.ben       () → { kimlik, ad }
 * @param o.ozetFn    () → bu makinenin özeti (protokol.OZET_SEMA)
 * @param o.log       (düzey, metin)
 * @param o.bildir    (baslik, satirlar) → Telegram/uyarı (isteğe bağlı)
 * @param o.fetchFn   test
 * @param o.simdi     () → ms
 */
function router(o) {
  const r = express.Router();
  const log = o.log || (() => {});
  const simdi = o.simdi || Date.now;
  const bildir = o.bildir || (() => {});
  const yerelMi = (req) => (req.kademe || 'yerel') === 'yerel';
  const yalnizYerel = (res) => res.status(403).json({ success: false, error: 'Makine eşleme ve kaldırma yalnız bu bilgisayardaki panelden yapılır (telefondan ve başka makineden değil).' });
  const govde = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

  r.get('/api/makine/kimlik', (req, res) => res.json({ success: true, ...o.ozetFn() }));

  let sonYenile = 0;
  r.get('/api/makine/pano', async (req, res) => {
    if (req.kademe === 'makine') return res.status(403).json({ success: false, error: 'Pano başka makineye açık değil.' });
    try {
      if (req.query && req.query.yenile === '1' && simdi() - sonYenile > PANO_YENILE_MS) {
        sonYenile = simdi();
        await o.nabiz.tur({ eslesme: o.eslesme, ben: o.ben(), ozetFn: o.ozetFn, fetchFn: o.fetchFn }).catch(() => null);
      }
      res.json(panoVerisi({ yerel: yerelMi(req), kademe: req.kademe || 'yerel' }));
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  function panoVerisi({ yerel, kademe }) {
    const l = o.eslesme.liste();
    const d = o.nabiz.oku();
    const t = simdi();
    const makineler = l.makineler.map(m => {
      const x = d.esler[m.kimlik] || {};
      const oz = nabizLib.enYeniOzet(x) || {};
      const sg = nabizLib.sonGorulme(x);
      return {
        kimlik: m.kimlik, ad: oz.ad || m.ad, adres: m.adres, rol: oz.rol || m.rol, sira: m.sira, eklendi: m.eklendi || null, yenilendi: m.yenilendi || null,
        sonGorulme: sg ? new Date(sg).toISOString() : null, isik: nabizLib.isik(x, t),
        surum: oz.surum || null, protokol: Number.isFinite(oz.protokol) ? oz.protokol : null, uyum: Number.isFinite(oz.protokol) ? protokol.uyum(oz.protokol) : null,
        botlar: Array.isArray(oz.botlar) ? oz.botlar : [], guncelleme: oz.guncelleme || null, disk: oz.disk || null,
        gelen: x.gelen ? { zaman: x.gelen.zaman } : null,
        giden: x.giden ? { zaman: x.giden.zaman, sonuc: x.giden.sonuc, hata: x.giden.hata || null, sonBasari: x.giden.sonBasari || null } : null,
        // İleriye uyumlu alanlar: yönetici rozeti 3b'de (f1), kopya yaşı 4. fazda (d3).
        yonetici: false, kopyaYasi: null
      };
    });
    return { success: true, protokol: protokol.MAKINE_PROTOKOL, kademe, yazilabilir: yerel,
      ben: { ...o.ozetFn(), adres: l.kendi.adres, ben: true }, makineler, yonetici: l.yonetici || null,
      esleme: yerel ? o.eslesme.kodDurumu() : null, nabizDk: nabizLib.NABIZ_MS / 60000, sessizDk: nabizLib.SESSIZ_MS / 60000 };
  }

  r.post('/api/makine/esle/kod', (req, res) => {
    if (!yerelMi(req)) return yalnizYerel(res);
    const g = govde(req);
    if (g.kendiAdres && !o.eslesme.kendiAdresYaz(g.kendiAdres)) return res.status(400).json({ success: false, error: 'Bu bilgisayarın adresi geçersiz (örnek: https://sunucu.ag-adi.ts.net).' });
    const k = o.eslesme.kodUret();
    log('INFO', '🖧 Makine eşleme kodu üretildi (10 dk geçerli, tek kullanımlık).');
    res.json({ success: true, ...k, ben: o.ben() });
  });

  r.post('/api/makine/esle-baslat', async (req, res) => {
    if (!yerelMi(req)) return yalnizYerel(res);
    const g = govde(req);
    const adres = eslesmeLib.adresNormal(g.adres);
    const kendi = eslesmeLib.adresNormal(g.kendiAdres || o.eslesme.liste().kendi.adres);
    const kod = eslesmeLib.kodNormal(g.kod);
    if (!adres) return res.status(400).json({ success: false, error: 'Karşı makinenin adresi geçersiz (örnek: https://sunucu.ag-adi.ts.net — Tailscale\'de görünen ad).' });
    if (!kendi) return res.status(400).json({ success: false, error: 'Bu bilgisayarın adresi gerekli (karşı makine nabzı buraya yollar; örnek: https://bilgisayar.ag-adi.ts.net).' });
    if (adres === kendi) return res.status(400).json({ success: false, error: 'Karşı makinenin adresi bu bilgisayarın adresiyle aynı.' });
    if (kod.length !== 32) return res.status(400).json({ success: false, error: 'Eşleme kodu 32 rakam olmalı (8 grup × 4).' });
    const ben = o.ben();
    const tB = eslesmeLib.jetonUret();
    const istekGovde = { kod, kimlik: ben.kimlik, ad: ben.ad, rol: o.ozetFn().rol, adres: kendi, protokol: protokol.MAKINE_PROTOKOL, surum: o.ozetFn().surum, jeton: tB };
    let y;
    try { y = await istemci.istek(adres, '/api/makine/esle', { method: 'POST', govde: istekGovde, fetchFn: o.fetchFn }); }
    catch (e) { return res.status(502).json({ success: false, error: `Karşı makineye ulaşılamadı: ${e.message}` }); }
    const b = y.govde || {};
    if (y.durum !== 200) return res.status(y.durum === 429 ? 429 : 409).json({ success: false, error: `Karşı makine eşlemeyi reddetti (${y.durum}): ${String(b.error || '').slice(0, 200)}` });
    const v = protokol.dogrula('esleYanit', b);
    if (!v.ok) return res.status(502).json({ success: false, error: `Karşı makinenin yanıtı protokole uymuyor: ${v.hatalar.slice(0, 3).join('; ')}` });
    if (b.kimlik === ben.kimlik) return res.status(409).json({ success: false, error: 'Karşı adres bu bilgisayarın kendisi.' });
    if (protokol.uyum(b.protokol) === 'uyumsuz') return res.status(409).json({ success: false, error: `Karşı makinenin sürümü (${b.surum}) bu sürümle ${protokol.uyumMetni('uyumsuz')}.` });
    const e = o.eslesme.esEkle({ kimlik: b.kimlik, ad: b.ad, adres, rol: b.rol }, { giden: b.jeton, gelen: tB });
    if (!e.ok) return res.status(409).json({ success: false, error: `Eş kaydedilemedi: ${e.neden}` });
    o.eslesme.kendiAdresYaz(kendi);
    log('INFO', `🖧 Makine eşlendi: ${e.es.ad} (${e.es.kimlik}, ${adres})${e.yenilendi ? ' — jetonlar yenilendi' : ''}.`);
    bildir('Makine eşlendi', [`${e.es.ad} (${adres}) bu bilgisayarla eşlendi${e.yenilendi ? ' (jetonlar yenilendi)' : ''}.`, 'Bunu siz yapmadıysanız: Ayarlar › Makineler\'den kaldırın.']);
    o.nabiz.tur({ eslesme: o.eslesme, ben, ozetFn: o.ozetFn, fetchFn: o.fetchFn }).catch(() => null);
    res.json({ success: true, es: e.es, yenilendi: e.yenilendi, uyum: protokol.uyum(b.protokol) });
  });

  // Jetonsuz kodlu eşleme isteği: IP başına deneme sınırı (vekil arkasında istemci adresi x-forwarded-for'dan).
  const denemeler = new Map();
  r.post('/api/makine/esle', (req, res) => {
    const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '?').split(',')[0].trim();
    const t = simdi();
    const l = (denemeler.get(ip) || []).filter(x => t - x < ESLE_PENCERE_MS);
    if (denemeler.size > 1000) denemeler.clear();
    if (l.length >= ESLE_HAK) { denemeler.set(ip, l); return res.status(429).json({ success: false, error: 'Çok fazla eşleme denemesi — 10 dakika sonra yeniden deneyin.' }); }
    l.push(t); denemeler.set(ip, l);
    const g = govde(req);
    const v = protokol.dogrula('esleIstek', g);
    if (!v.ok) return res.status(400).json({ success: false, error: `Eşleme isteği geçersiz: ${v.hatalar.slice(0, 3).join('; ')}` });
    const ben = o.ben();
    if (protokol.uyum(g.protokol) === 'uyumsuz') return res.status(409).json({ success: false, error: `Sürümler uyumsuz (bu makine ${o.ozetFn().surum}, karşı ${g.surum}) — önce iki makineyi aynı sürüme güncelleyin.` });
    if (g.kimlik === ben.kimlik) return res.status(409).json({ success: false, error: 'Bir makine kendisiyle eşlenemez.' });
    const adres = eslesmeLib.adresNormal(g.adres);
    if (!adres) return res.status(400).json({ success: false, error: 'Eşleme isteğindeki adres geçersiz.' });
    const k = o.eslesme.kodKullan(g.kod);
    if (!k.ok) { log('WARN', `🖧 Makine eşleme reddedildi (${ip}): ${k.neden}`); return res.status(403).json({ success: false, error: k.neden }); }
    const tA = eslesmeLib.jetonUret();
    const e = o.eslesme.esEkle({ kimlik: g.kimlik, ad: g.ad, adres, rol: g.rol }, { giden: g.jeton, gelen: tA });
    if (!e.ok) return res.status(409).json({ success: false, error: `Eş kaydedilemedi: ${e.neden}` });
    denemeler.delete(ip);
    log('INFO', `🖧 Makine eşlendi (kodla): ${e.es.ad} (${e.es.kimlik}, ${adres})${e.yenilendi ? ' — jetonlar yenilendi' : ''}.`);
    bildir('Makine eşlendi', [`${e.es.ad} (${adres}) eşleme koduyla bu bilgisayara eşlendi${e.yenilendi ? ' (jetonlar yenilendi)' : ''}.`, 'Bunu siz yapmadıysanız: Ayarlar › Makineler\'den kaldırın.']);
    const oz = o.ozetFn();
    res.json({ success: true, kimlik: ben.kimlik, ad: ben.ad, rol: oz.rol, protokol: protokol.MAKINE_PROTOKOL, surum: oz.surum, jeton: tA });
  });

  r.post('/api/makine/kaldir', (req, res) => {
    if (!yerelMi(req)) return yalnizYerel(res);
    const kimlik = String(govde(req).kimlik || '');
    if (!protokol.KIMLIK_RE.test(kimlik)) return res.status(400).json({ success: false, error: 'makine kimliği geçersiz' });
    const es = o.eslesme.es(kimlik);
    if (!o.eslesme.esKaldir(kimlik)) return res.status(404).json({ success: false, error: 'Bu kimlikte eşlenmiş makine yok.' });
    o.nabiz.esSil(kimlik);
    log('WARN', `🖧 Makine eşlemesi kaldırıldı: ${(es && es.ad) || kimlik} (${kimlik}).`);
    res.json({ success: true });
  });

  r.post('/api/makine/nabiz', (req, res) => {
    if (req.kademe !== 'makine') return res.status(401).json({ success: false, error: 'Nabız yalnız eşlenmiş makinenin jetonuyla gelir.' });
    const g = govde(req);
    const v = protokol.dogrula('nabiz', g);
    if (!v.ok) return res.status(400).json({ success: false, error: `Nabız gövdesi protokole uymuyor: ${v.hatalar.slice(0, 3).join('; ')}` });
    if (g.kimlik !== req.makineKimlik) return res.status(403).json({ success: false, error: 'Nabızdaki kimlik jetonun kimliğiyle aynı değil.' });
    const u = o.nabiz.gelenKaydet(g.kimlik, g);
    const oz = o.ozetFn();
    if (u === 'uyumsuz') return res.status(409).json({ success: false, kaydedildi: false, uyum: u, error: protokol.uyumMetni(u), ...oz });
    res.json({ success: true, kaydedildi: true, uyum: u, ...oz });
  });

  r.post('/api/makine/nabiz/simdi', async (req, res) => {
    if (!yerelMi(req)) return yalnizYerel(res);
    try { const s = await o.nabiz.tur({ eslesme: o.eslesme, ben: o.ben(), ozetFn: o.ozetFn, fetchFn: o.fetchFn }); res.json({ success: true, ...s }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  return r;
}

module.exports = { router, ESLE_HAK, ESLE_PENCERE_MS, PANO_YENILE_MS };
