/**
 * TAŞIMA / EKLENTİ UÇLARI (68.1, PLAN-TASIMA F3) — panel: Ayarlar › Yedek ve taşıma (js/pages/tasima.js), kurulum sihirbazı ilk adım.
 * ═══════════════════════════════════════════════════════════════════════════
 * HER uç YALNIZ YEREL kademede (bu bilgisayardaki masaüstü panel): telefon ve geliştirme kademesi 403 — taşıma dosyası
 * gizli bilgileri (şifreli de olsa) taşır; indirme de kapalı. Hiçbir uç kendiliğinden çalışmaz: oluşturma, yükleme, içe aktarma
 * ve eklenti yükleme yalnız kullanıcının açık isteğiyle.
 *
 *   GET  /api/tasima/durum                 eklenti durumu, "mutabakat bekliyor", yedek şifresi var mı, oluşturulan dosyalar, iş
 *   GET  /api/tasima/tahmin                tür başına boyut tahmini (kutular için)
 *   POST /api/tasima/olustur               { tur: 'tasima'|'arastirma-eklentisi', sifre, sifreTekrar, arastirma, sunucuBaglantisi } → 202 (iş)
 *   GET  /api/tasima/is                    süren işin ilerlemesi
 *   GET  /api/tasima/indir/:ad             oluşturulan dosyayı AKIŞLA indir
 *   POST /api/tasima/sil/:ad               oluşturulan dosyayı sil
 *   POST /api/tasima/yukle                 ham gövde (application/octet-stream, başlık x-dosya-adi) → <veri>/makine/tasima/gelen-<kimlik>
 *   POST /api/tasima/yerel                 { yol } bu bilgisayardaki dosyayı yerinde kullan (büyük dosya: yükleme yok)
 *   POST /api/tasima/onizle                { kimlik, sifre } → aç + doğrula (geçici klasör) → önizleme + hedef doluluğu
 *   POST /api/tasima/uygula                { kimlik, mod: 'bos'|'degistir' } → yerleştir (taşıma) / eklentiyi ekle
 *   POST /api/tasima/vazgec                { kimlik } geçici klasör ve yüklenen dosya silinir
 *   POST /api/tasima/yedek-sifre           { sifre, sifreTekrar } USB yedeğinin şifresi (GİZLİ)
 *
 * İçe aktarma çalışan programın bellekteki durumunu (bot nesneleri, ayarlar) değiştirmez: yerleştirmeden sonra Pusula yeniden
 * başlatılmalı. Denetleyiciyle çalışıyorsa kendisi yeniden başlar; değilse yeniden başlatılana kadar yazma uçları 409 (eski bellek
 * yeni dosyaların üzerine yazmasın).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const T = require('./tasima');

const AD_RE = /^[A-Za-z0-9._-]{1,120}\.(pusula|pusula-arastirma)$/;
/** Eklenti yokken "eklenti yüklü değil" dönen araştırma uçları (menü de gizli). Model portföy kâğıt hesabının kullandığı
 *  /api/portfoy/(simule|is|katalog|seri|indir) açık kalır. */
const ARASTIRMA_UCLARI = /^\/api\/(defter(\/|$)|strateji\/(adaylar|olc)$|bindirme\/olcum$|portfoy\/(denemeler|kararlar|portfoyler|varyasyon|guncelle|guncelleme)(\/|$))/i;
const EKLENTI_YOK = 'Araştırma eklentisi yüklü değil. Araştırma verilerin başka bir bilgisayardaysa orada Ayarlar › Yedek ve taşıma › "Araştırma eklentisi oluştur", burada "Eklenti yükle".';

function olustur(o = {}) {
  const program = o.program;            // undefined: bu program
  const log = o.log || (() => {});
  const bildir = o.bildir || (() => {});   // 69.6: paket oluşturulunca Telegram (taşıma paketi çözülmüş sırları taşır)
  const surum = o.surum || T.uygulamaSurumu();
  const botlarCalisiyor = o.botlarCalisiyor || (() => []);
  const yenidenBaslat = o.yenidenBaslat || (() => false);
  const kayitlar = new Map();            // kimlik → { dosya, yerel, bildiri, hedef, tur }
  let is = null;                          // { tur, calisiyor, asama, yapilan, toplam, sonuc, hata, bas }
  let sonrasi = null;                     // içe aktarma yapıldı, yeniden başlatma bekleniyor
  let tahminOnbellek = null;

  const klasor = () => T.klasor(program);
  const durumKodu = (e) => e.durum || (/^paket bozuk|bozuk/.test(e.message) ? 400 : 500);
  const hataYanit = (res, e) => res.status(durumKodu(e)).json({ success: false, kod: e.kod || null, error: String(e.message).slice(0, 600) });

  function dosyaListesi() {
    let l = [];
    try { l = fs.readdirSync(klasor()).filter(a => AD_RE.test(a) && !a.startsWith('gelen-')); } catch { return []; }
    return l.map(ad => { const s = fs.statSync(path.join(klasor(), ad)); return { ad, boyut: s.size, zaman: s.mtime.toISOString(), tur: ad.endsWith('.pusula-arastirma') ? 'arastirma-eklentisi' : 'tasima' }; })
      .sort((a, b) => b.zaman.localeCompare(a.zaman));
  }

  /** 73.4: data/yedek-ayar.json özeti (sır yok; uzak yedekte yalnız depo adı + son durum). */
  function yedekOzet() {
    let a = null;
    try { a = o.yedekAyar ? o.yedekAyar() : JSON.parse(fs.readFileSync(require('./yollar').veri('yedek-ayar.json'), 'utf8')); } catch { a = null; }
    if (!a || typeof a !== 'object') return { hedef: null, son: null, ileriyeKayit: null, uzak: null };
    const u = a.uzak && typeof a.uzak === 'object' ? a.uzak : null;
    return { hedef: a.hedef || null, son: a.son || null, ileriyeKayit: a.ileriyeKayit || null,
      uzak: u ? { depo: u.depo || null, son: u.son ? { zaman: u.son.zaman || null, ok: u.son.ok !== false && !u.son.hata, hata: u.son.hata || null } : null } : null };
  }

  function durum() {
    return { eklenti: T.eklentiDurumu(program), bekleyen: T.bekleyenOku(program), yedekSifre: !!T.yedekSifre(program), dosyalar: dosyaListesi(),
      is: is ? { ...is } : null, sonrasi, surum };
  }

  async function isBaslat(tur, sifre, kutular) {
    if (is && is.calisiyor) throw Object.assign(new Error('Bir paket zaten hazırlanıyor — bitince yenisini başlatın.'), { durum: 409 });
    const ad = `pusula-${require('os').hostname().replace(/[^A-Za-z0-9-]/g, '')}-${T.damga()}${T.UZANTI[tur]}`;
    is = { tur, calisiyor: true, asama: 'basliyor', yapilan: 0, toplam: 0, sonuc: null, hata: null, bas: new Date().toISOString() };
    const benim = is;
    T.olustur({ program, tur, cikti: path.join(klasor(), ad), sifre, kutular, kaynak: 'panel', uygulamaSurum: surum,
      ilerleme: (x) => Object.assign(benim, { asama: x.asama, yapilan: x.yapilan || 0, toplam: x.toplam || 0 }) })
      .then(r => { Object.assign(benim, { calisiyor: false, asama: 'bitti', sonuc: { ad, boyut: r.boyut, dosyaSayisi: r.bildiri.dosyaSayisi, sayilar: r.bildiri.sayilar, gizli: r.bildiri.gizli.var } });
        log('INFO', `📦 ${tur === 'tasima' ? 'Taşıma dosyası' : 'Araştırma eklentisi'} oluşturuldu: ${ad} (${(r.boyut / 1048576).toFixed(1)} MB)`);
        try { bildir(tur, ad, r.boyut, !!(r.bildiri && r.bildiri.gizli && r.bildiri.gizli.var)); } catch { /* bildirim hatası paketi etkilemez */ } })
      .catch(e => { Object.assign(benim, { calisiyor: false, asama: 'hata', hata: e.message }); log('ERROR', `📦 Paket oluşturulamadı: ${e.message}`); });
    return benim;
  }

  function kayitBul(kimlik) {
    const k = kayitlar.get(String(kimlik || ''));
    if (!k) throw Object.assign(new Error('Dosya bulunamadı — yeniden seçin.'), { durum: 404 });
    return k;
  }
  function temizle(k) {
    if (k.hedef) { try { fs.rmSync(k.hedef, { recursive: true, force: true }); } catch { /* */ } k.hedef = null; }
  }

  const express = require('express');
  const r = express.Router();
  const json = express.json({ limit: '16kb' });
  /** Yalnız yerel kademe (telefon / geliştirme → 403). */
  const yerel = (req, res, next) => (req.kademe && req.kademe !== 'yerel'
    ? res.status(403).json({ success: false, kademe: req.kademe, error: 'Taşıma ve yedek işlemleri yalnız bu bilgisayardaki panelden yapılır (telefondan kapalı).' })
    : next());

  // 73.4: günlük yedek + ileriye kayıt haftalık artımlı yedeğinin özeti (data/yedek-ayar.json) — yalnız yerel kademede (hedef yolu telefona gitmez)
  r.get('/api/tasima/durum', (req, res) => { try { res.json({ success: true, ...durum(), ...(req.kademe && req.kademe !== 'yerel' ? {} : { yedek: yedekOzet() }), kademe: req.kademe || 'yerel' }); } catch (e) { hataYanit(res, e); } });
  r.get('/api/tasima/tahmin', yerel, (req, res) => {
    try {
      if (!tahminOnbellek || Date.now() - tahminOnbellek.t > 60000 || req.query.yenile) tahminOnbellek = { t: Date.now(), v: T.tahmin({ program }) };
      res.json({ success: true, ...tahminOnbellek.v });
    } catch (e) { hataYanit(res, e); }
  });
  r.post('/api/tasima/olustur', yerel, json, async (req, res) => {
    try {
      const b = req.body || {};
      const tur = b.tur === 'arastirma-eklentisi' ? 'arastirma-eklentisi' : 'tasima';
      const sifre = typeof b.sifre === 'string' && b.sifre ? b.sifre : null;
      if (tur === 'tasima' && !sifre) throw Object.assign(new Error('Şifre gerekli: gizli bilgiler (anahtarlar, jetonlar) bu şifreyle şifrelenir.'), { durum: 400 });
      if (sifre && b.sifreTekrar !== sifre) throw Object.assign(new Error('İki şifre aynı değil.'), { durum: 400 });
      if (sifre) require('./paket').sifreDenetle(sifre);
      const j = await isBaslat(tur, sifre, { arastirma: b.arastirma === true, sunucuBaglantisi: b.sunucuBaglantisi === true });
      res.status(202).json({ success: true, is: { ...j } });
    } catch (e) { hataYanit(res, e); }
  });
  r.get('/api/tasima/is', yerel, (req, res) => res.json({ success: true, is: is ? { ...is } : null }));
  r.get('/api/tasima/indir/:ad', yerel, (req, res) => {
    const ad = String(req.params.ad || '');
    const f = path.join(klasor(), ad);
    if (!AD_RE.test(ad) || ad.startsWith('gelen-') || !fs.existsSync(f)) return res.status(404).json({ success: false, error: 'dosya yok' });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fs.statSync(f).size);
    res.setHeader('Content-Disposition', `attachment; filename="${ad}"`);
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
  });
  r.post('/api/tasima/sil/:ad', yerel, (req, res) => {
    const ad = String(req.params.ad || '');
    if (!AD_RE.test(ad)) return res.status(404).json({ success: false, error: 'dosya yok' });
    try { fs.rmSync(path.join(klasor(), ad), { force: true }); res.json({ success: true, ...durum() }); } catch (e) { hataYanit(res, e); }
  });

  async function kaydet(dosya, yerelMi, res) {
    const kimlik = crypto.randomBytes(9).toString('hex');
    try {
      const bildiri = await T.bildiriOku(dosya);
      kayitlar.set(kimlik, { dosya, yerel: yerelMi, bildiri, hedef: null, tur: bildiri.tur });
      res.json({ success: true, kimlik, bildiri: { tur: bildiri.tur, uygulamaSurum: bildiri.uygulamaSurum, olusturma: bildiri.olusturma, makine: bildiri.makine, sayilar: bildiri.sayilar,
        gizliVar: !!(bildiri.gizli && bildiri.gizli.var), govdeSifreli: !!(bildiri.govde && bildiri.govde.sifreli), boyut: fs.statSync(dosya).size, buSurum: surum } });
    } catch (e) {
      if (!yerelMi) { try { fs.rmSync(dosya, { force: true }); } catch { /* */ } }
      hataYanit(res, e);
    }
  }
  r.post('/api/tasima/yukle', yerel, (req, res) => {
    const ham = decodeURIComponent(String(req.headers['x-dosya-adi'] || 'dosya.pusula'));
    const uz = ham.endsWith('.pusula-arastirma') ? '.pusula-arastirma' : '.pusula';
    fs.mkdirSync(klasor(), { recursive: true });
    const f = path.join(klasor(), `gelen-${crypto.randomBytes(6).toString('hex')}${uz}`);
    const w = fs.createWriteStream(f);
    let bitti = false;
    const iptal = (e) => { if (bitti) return; bitti = true; w.destroy(); try { fs.rmSync(f, { force: true }); } catch { /* */ } if (!res.headersSent) res.status(400).json({ success: false, error: `yükleme yarıda kaldı: ${e && e.message}` }); };
    req.on('aborted', () => iptal(new Error('bağlantı kesildi')));
    req.on('error', iptal);
    w.on('error', iptal);
    w.on('finish', () => { if (bitti) return; bitti = true; kaydet(f, false, res); });
    req.pipe(w);
  });
  r.post('/api/tasima/yerel', yerel, json, async (req, res) => {
    const y = String((req.body || {}).yol || '').trim().replace(/^"|"$/g, '');
    if (!y || !path.isAbsolute(y) || !/\.(pusula|pusula-arastirma)$/i.test(y)) return res.status(400).json({ success: false, error: 'Tam dosya yolu girin (ör. D:\\pusula-…\\dosya.pusula).' });
    if (!fs.existsSync(y) || !fs.statSync(y).isFile()) return res.status(404).json({ success: false, error: 'Bu yolda dosya yok.' });
    kaydet(path.resolve(y), true, res);
  });
  r.post('/api/tasima/onizle', yerel, json, async (req, res) => {
    try {
      const b = req.body || {};
      const k = kayitBul(b.kimlik);
      temizle(k);
      const hedef = path.join(klasor(), `ice-${b.kimlik}`);
      if (fs.existsSync(hedef)) fs.rmSync(hedef, { recursive: true, force: true });
      const a = await T.ac({ dosya: k.dosya, sifre: typeof b.sifre === 'string' ? b.sifre : '', hedef, beklenenTur: b.beklenenTur || undefined });
      k.hedef = a.hedef;
      const on = T.onizleme(a.bildiri, a.dosyalar, { buSurum: surum });
      const c = require('./yollar').bilgi();
      res.json({ success: true, onizleme: on, doluluk: a.bildiri.tur === 'tasima' ? T.doluluk(program ? require('./yollar').cozumle(program) : c) : null,
        calisanBotlar: botlarCalisiyor(), veriYeri: program ? require('./yollar').cozumle(program).kok : c.kok });
    } catch (e) { hataYanit(res, e); }
  });
  r.post('/api/tasima/uygula', yerel, json, async (req, res) => {
    try {
      const b = req.body || {};
      const k = kayitBul(b.kimlik);
      if (!k.hedef || !fs.existsSync(k.hedef)) throw Object.assign(new Error('Önce önizleme (şifre ile doğrulama) yapılmalı.'), { durum: 409 });
      if (k.tur === 'tasima') {
        const cal = botlarCalisiyor();
        if (cal.length) throw Object.assign(new Error(`Önce çalışan botları durdurun (${cal.join(', ')}) — taşıma çalışan botun dosyalarının üzerine gelmez.`), { durum: 409, kod: 'bot' });
        const y = T.yerlestir({ hedef: k.hedef, program, mod: b.mod === 'degistir' ? 'degistir' : 'bos' });
        k.hedef = null;
        sonrasi = { zaman: new Date().toISOString(), kaynakMakine: k.bildiri.makine };
        log('INFO', `📦 Taşıma dosyası içe aktarıldı (${k.bildiri.makine}, ${k.bildiri.olusturma}): ${y.yerlesen.length} parça${y.onceki ? `; önceki veri ${y.onceki}` : ''}. Botlar mutabakat bekliyor.`);
        if (!k.yerel) { try { fs.rmSync(k.dosya, { force: true }); } catch { /* */ } }
        kayitlar.delete(String(b.kimlik));
        T.durumSifirla();
        const yb = yenidenBaslat();
        res.json({ success: true, tur: 'tasima', sonuc: y, yenidenBasliyor: !!yb });
      } else {
        const r2 = await T.eklentiYerlestir({ hedef: k.hedef, program });
        k.hedef = null;
        log('INFO', `🧪 Araştırma eklentisi yüklendi (${k.bildiri.makine}): ${r2.konan} dosya, ${r2.ayni} aynı, ${r2.cakisma.length} çakışma`);
        if (!k.yerel) { try { fs.rmSync(k.dosya, { force: true }); } catch { /* */ } }
        kayitlar.delete(String(b.kimlik));
        res.json({ success: true, tur: 'arastirma-eklentisi', sonuc: r2, eklenti: T.eklentiDurumu(program, { tazele: true }) });
      }
    } catch (e) { hataYanit(res, e); }
  });
  r.post('/api/tasima/vazgec', yerel, json, (req, res) => {
    const k = kayitlar.get(String((req.body || {}).kimlik || ''));
    if (k) { temizle(k); if (!k.yerel) { try { fs.rmSync(k.dosya, { force: true }); } catch { /* */ } } kayitlar.delete(String(req.body.kimlik)); }
    res.json({ success: true });
  });
  r.post('/api/tasima/yedek-sifre', yerel, json, (req, res) => {
    try {
      const b = req.body || {};
      if (b.sifreTekrar !== b.sifre) throw Object.assign(new Error('İki şifre aynı değil.'), { durum: 400 });
      T.yedekSifreKaydet(String(b.sifre || ''), program);
      log('INFO', '🔐 USB yedek şifresi kaydedildi');
      res.json({ success: true, ...durum() });
    } catch (e) { hataYanit(res, e); }
  });

  /** İçe aktarmadan sonra, yeniden başlatılana kadar yazma kapalı (eski bellek yeni dosyaların üzerine yazmasın). */
  function sonrasiKapisi(req, res, next) {
    if (sonrasi && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !/^\/api\/(tasima|sistem|giris)(\/|$)/.test(req.path)) {
      return res.status(409).json({ success: false, kod: 'yeniden-baslat', error: 'Taşıma tamamlandı — Pusula yeniden başlatılmadan başka işlem yapılmaz (Pusula\'yı kapatıp yeniden açın).' });
    }
    return next();
  }
  /** Eklenti yokken araştırma uçları sade "eklenti yüklü değil" (409) döner. */
  function arastirmaKapisi(req, res, next) {
    if (ARASTIRMA_UCLARI.test(req.path) && !T.eklentiDurumu(program).yuklu) return res.status(409).json({ success: false, eklentiYok: true, error: EKLENTI_YOK });
    return next();
  }

  return { router: r, sonrasiKapisi, arastirmaKapisi, durum, _kayitlar: kayitlar };
}

module.exports = { olustur, ARASTIRMA_UCLARI, EKLENTI_YOK, AD_RE };
