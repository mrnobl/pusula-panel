/**
 * COIN TARAMA + LİSTE KAYDI — kurulum, HTTP uçları, zamanlayıcı (sürüm 60.3).
 *
 *   const T = require('./lib/tarama').kur({ log, bildirici, kota, fetch?, dizin?, disaDizin?, simdi? });
 *   app.use(T.router());  T.zamanlayiciBaslat();   // TARAMA=0 → zamanlayıcı kapalı
 *
 * Bu modül ALIM/SATIM YAPMAZ, `lib/live` ve `lib/risk`e dokunmaz, canlı bot kararlarını etkilemez. Uçlar araştırma
 * modunda da açıktır (bot/borsa/emir değil); yazma uçları POST + gövde doğrulaması. Sunucu git komutu çalıştırmaz.
 *
 * UÇLAR
 *   GET  /api/tarama/durum         son tarama, otomatik karar, iş durumu, ayar özeti, uyarılar
 *   GET  /api/tarama/is            koşan/son taramanın ilerlemesi (AG.ilerleme biçimi)
 *   POST /api/tarama/tara          şimdi tara (409: koşuyor / başka süreçte)
 *   POST /api/tarama/otomatik      panel açıldı: son başarılı tarama `otomatikSaat`ten eskiyse arka planda başlat
 *   GET  /api/tarama/ozet          coin başına son metrikler + bayraklar (türetilmiş)
 *   GET  /api/tarama/coin/:id      bir coinin son satırları (ham)
 *   GET  /api/tarama/uyarilar      rozet + bildirim listesi
 *   GET  /api/tarama/ayarlar       ayarlar + tanımlar (varsayılan, sınır, gerekçe) + Telegram bağlantı durumu
 *   POST /api/tarama/ayarlar       { yama }        kaynak / eşik / aralık / Telegram (denetim kaydı)
 *   POST /api/tarama/izleme        { islem, coin } ekle / guncelle / cikar (denetim kaydı)
 *   GET  /api/tarama/denetim       elle değişiklik kaydı
 *   GET  /api/tarama/kaynak-sagligi dikkat listesi kaynak envanteri: son durum, 30 g başarı, kota, bozulma haritası (60.7, kaynakSagligi.js)
 *   GET  /api/tarama/arsiv[?tam=1] dikkat F1 günlük ham arşiv: resmî/deneme manifest zinciri (hafif + önbellekli; tam=1 tüm dosya SHA'ları), kesintisiz gün, boşluklar, son koşu
 *   POST /api/tarama/yeniden-uret  özeti ham kayıttan yeniden kur
 *   GET  /api/dikkat/durum|liste|coin|pencereler  dikkat F2 KAÇIN listesi + kendini denetleme karnesi (lib/tarama/dikkatPanel.js; salt okuma)
 *   GET  /api/izle/durum|liste     dikkat F2 İZLE (781) + puan gölgesi (782), H-DL2 sayımı, ön izleme (lib/tarama/izlePanel.js; salt okuma; A6)
 *   GET  /api/listeler             etkin listeler + zincir doğrulama
 *   POST /api/listeler             yeni liste (fiyatlar giriş anında çekilir)
 *   POST /api/listeler/duzeltme    düzeltme kaydı
 *   GET  /api/listeler/dogrula     zinciri doğrula (+ dışa aktarımla eşitle)
 *   GET  /api/listeler/:no/degerlendirme?bas=YYYY-MM-DD
 *   POST /api/listeler/piyasa      { gun }  geçmiş gün piyasa evrenini hesapla (arka plan işi)
 *   GET  /api/listeler/piyasa-is   o işin ilerlemesi
 */
'use strict';
const path = require('path');
const { dizinler, gecerliGun, temizMetin, gunStr } = require('./ortak');
const { AyarDeposu, AyarHatasi, KAYNAK_TANIM, ESIK_TANIM, GENEL_TANIM, BAYRAK_KODLARI } = require('./ayarlar');
const { Kayit } = require('./kayit');
const { Tarayici, KilitHatasi } = require('./tarayici');
const { Listeler, ListeHatasi } = require('./listeler');
const { Piyasa } = require('./piyasa');
const { Istemci } = require('./http');
const { FiyatKaynagi } = require('./fiyat');
const { degerlendir } = require('./degerlendir');
const { uyarilar } = require('./uyarilar');
const { ACIKLAMA } = require('./bayraklar');
const { AGLAR } = require('./aglar');
const fs = require('fs');

function kur(o = {}) {
  const D = dizinler(o);
  const log = o.log || (() => {});
  const simdi = o.simdi || (() => Date.now());
  const ayarlar = new AyarDeposu({ ...o, simdi });
  const kayit = new Kayit({ ...o, simdi });
  const httpYeni = () => new Istemci({ fetch: o.fetch || undefined, simdi, uyu: o.uyu || undefined, zamanAsimiMs: ayarlar.oku().zamanAsimiSn * 1000 });
  const fiyatYeni = (http) => new FiyatKaynagi({ http: http || httpYeni(), kota: o.kota || (() => null), onbellekDosya: D.fiyatOnbellek, simdi });
  const listeler = new Listeler({ ...o, simdi, log, http: () => httpYeni(), fiyat: () => fiyatYeni(), piyasa: () => new Piyasa({ fiyat: fiyatYeni(), dizin: D.piyasaDizin, simdi }) });
  let zincir = null;
  const zincirTazele = () => {
    let e = { catisma: null };
    try { e = listeler.esitle(); } catch (x) { e = { catisma: `eşitleme hatası: ${x.message}` }; }
    zincir = { ...listeler.dogrula(), catisma: e.catisma || null, eklenen: e.eklenen || 0 };
    return zincir;
  };
  const zincirAl = () => zincir || zincirTazele();
  const tarayici = new Tarayici({ ayarlar, kayit, fetch: o.fetch, kota: o.kota, simdi, uyu: o.uyu, log, bildirici: o.bildirici || null, zincirFn: zincirAl });

  /** Piyasa (geçmiş gün evreni) işi — süreç içi tek iş. */
  let piyasaIs = null;
  function piyasaBaslat(gun) {
    if (piyasaIs && piyasaIs.durum === 'calisiyor') return { baslatildi: false, neden: `${piyasaIs.gun} için hesap sürüyor`, is: piyasaIsOzet() };
    piyasaIs = { id: `p-${gun}-${simdi()}`, gun, durum: 'calisiyor', oran: 0, asama: 'başlıyor', aciklama: `${gun} piyasa evreni`, basladi: simdi(), bitti: null, hata: null, iptal: false };
    const is = piyasaIs;
    const p = new Piyasa({ fiyat: fiyatYeni(), dizin: D.piyasaDizin, simdi });
    p.acilisHesapla(gun, { ilerleme: (oran, m) => { is.oran = oran; is.asama = m; }, iptal: () => is.iptal })
      .then(r => { Object.assign(is, { durum: 'bitti', oran: 1, asama: `${r.n} sembol`, bitti: simdi() }); log('INFO', `📋 Piyasa evreni ${gun}: ${r.n} sembol (${r.atlanan} atlandı)`); })
      .catch(e => { Object.assign(is, { durum: 'hata', hata: e.message, bitti: simdi() }); log('WARN', `📋 Piyasa evreni ${gun} hesaplanamadı: ${e.message}`); });
    return { baslatildi: true, is: piyasaIsOzet() };
  }
  const piyasaIsOzet = () => (piyasaIs ? { ...piyasaIs, sure: (piyasaIs.bitti || simdi()) - piyasaIs.basladi } : null);

  function durumOzeti() {
    const a = ayarlar.oku();
    const d = kayit.durumOku();
    const oz = kayit.ozetOku();
    const u = uyarilar({ durum: { ...d, calisiyor: tarayici.calisiyor ? d.calisiyor || true : null }, ozet: oz, zincir: zincirAl(), ayar: a, simdi: simdi() });
    return {
      calisiyor: tarayici.calisiyor || !!(tarayici.kilitDurumu() && !tarayici.kilitDurumu().bayat),
      is: tarayici.isDurum(), sonTarama: d.sonTarama || null, sonBasari: d.sonBasari || null, sonDeneme: d.sonDeneme || null, sonHata: d.sonHata || null,
      otomatik: tarayici.otomatikGerekli(), ayar: { otomatikSaat: a.otomatikSaat, gecikmeSaat: a.gecikmeSaat, telegram: a.telegram, kaynaklar: a.kaynaklar, izlenen: a.izleme.filter(c => c.aktif !== false).length },
      uyarilar: u, uyariSayisi: u.filter(x => x.seviye !== 'bilgi').length,
    };
  }

  /** Orkestratörün Veri ekranı için (harici kaynak satırı). */
  function hariciDurum() {
    const d = kayit.durumOku();
    const t = d.sonTarama || {};
    return { sonBasari: d.sonBasari || null, sonDeneme: d.sonDeneme || null, sureMs: t.sureSn != null ? t.sureSn * 1000 : null, calisiyor: tarayici.calisiyor,
      hata: t.durum === 'hata' ? t.hata : null,   // kısmi tarama hata sayılmaz (tarama ekranının kendi uyarısı söyler)
      hataZamani: t.bit || null, veriGunu: d.sonBasari ? String(d.sonBasari).slice(0, 10) : null };
  }

  /**
   * Dikkat F2 — RESMÎ arşivin son gününde KAÇIN'a yeni giren coinler Telegram'a, gün başına bir kez (A11). Yalnız coin adı +
   * kapı kodları; kişisel finans yok. Durum: data/tarama/dikkat-bildirim.json { sonGun }. İlk çağrıda geçmiş günler gönderilmez.
   */
  async function dikkatBildir() {
    const a = ayarlar.oku();
    if (!a.dikkatTelegram || !o.bildirici) return { gonderildi: false };
    const DP = require('./dikkatPanel');
    const oz = DP.sonOzet({ dizin: D.dizin }, 'resmi').ozet;
    if (!oz || !oz.gun) return { gonderildi: false };
    const yol = path.join(D.dizin, 'dikkat-bildirim.json');
    let st = null; try { st = JSON.parse(fs.readFileSync(yol, 'utf8')); } catch { st = null; }
    const yaz = (x) => { try { require('./ortak').atomikYaz(yol, JSON.stringify(x)); } catch { /* yoksay */ } };
    if (!st) { yaz({ sonGun: oz.gun }); return { gonderildi: false, ilk: true }; }
    if (st.sonGun >= oz.gun) return { gonderildi: false };
    yaz({ sonGun: oz.gun });
    const y = oz.yeniGiren || [];
    if (!y.length) return { gonderildi: false };
    const satir = y.slice(0, 15).map(x => `${x.sembol || x.anahtar} (${x.kanat}) — ${(x.kapilar || []).join(', ')}`);
    if (y.length > 15) satir.push(`… ve ${y.length - 15} coin daha (panel › Araştırma › Coin tarama › Dikkat)`);
    satir.push(oz.isinma ? 'Isınma dönemi: liste değerlendirmeye henüz girmiyor.' : 'Liste kural-v1; 90 gün takip edilir.', 'Alım/satım sinyali değildir.');
    await o.bildirici.gonder('uyari', `Dikkat listesi ${oz.gun}: ${y.length} yeni coin`, satir, { anahtar: `dikkat:${oz.gun}`, kisitMs: 20 * 3600e3 });
    return { gonderildi: true, sayi: y.length };
  }

  let zamanlayici = null;
  function zamanlayiciBaslat({ aralikMs = 10 * 60e3, acilisMs = 3 * 60e3 } = {}) {
    if (process.env.TARAMA === '0') { log('INFO', '🔎 Coin tarama zamanlayıcısı kapalı (TARAMA=0)'); return null; }
    let sonGecikmeBildirim = 0;
    const tik = () => {
      try { dikkatBildir().catch(e => log('WARN', `🔎 Dikkat bildirimi: ${e.message}`)); } catch (e) { log('WARN', `🔎 Dikkat bildirimi: ${e.message}`); }
      try {
        const k = tarayici.otomatikGerekli();
        if (k.gerekli) tarayici.baslat({ neden: `zamanlayıcı (${k.neden})`, kim: 'sunucu' });
        // Gecikme uyarısı Telegram'a (ayarla açıksa), en çok 12 saatte bir.
        const a = ayarlar.oku();
        if (a.telegram && simdi() - sonGecikmeBildirim > 12 * 3600e3) {
          const g = uyarilar({ durum: kayit.durumOku(), ozet: null, zincir: null, ayar: a, simdi: simdi() }).filter(x => x.kod === 'gecikme' && x.seviye !== 'bilgi');
          if (g.length) { sonGecikmeBildirim = simdi(); tarayici.bildir(g, a).catch(() => {}); }
        }
      } catch (e) { log('WARN', `🔎 Coin tarama zamanlayıcısı: ${e.message}`); }
    };
    const ilk = setTimeout(tik, acilisMs);
    const id = setInterval(tik, aralikMs);
    if (ilk.unref) ilk.unref();
    if (id.unref) id.unref();
    zamanlayici = { durdur: () => { clearTimeout(ilk); clearInterval(id); }, tik };
    return zamanlayici;
  }

  function router() {
    const express = require('express');
    const r = express.Router();
    const json = express.json({ limit: '256kb' });
    const kim = (req) => `panel (${temizMetin(req.ip || (req.socket && req.socket.remoteAddress) || '?', 60)})`;
    const hataYaz = (res, e) => {
      const kullanici = e instanceof AyarHatasi || e instanceof ListeHatasi;
      if (!kullanici) log('WARN', `🔎 Tarama ucu: ${e.message}`);
      res.status(kullanici ? 400 : e instanceof KilitHatasi ? 409 : 500).json({ success: false, error: String(e.message).slice(0, 400) });
    };
    const nesne = (b) => b && typeof b === 'object' && !Array.isArray(b);

    r.get('/api/tarama/durum', (req, res) => { try { res.json({ success: true, ...durumOzeti() }); } catch (e) { hataYaz(res, e); } });
    r.get('/api/tarama/is', (req, res) => {
      const is = tarayici.isDurum();
      if (!is) return res.json({ success: true, is: null, sonuc: null });
      res.json({ success: true, is, sonuc: is.durum === 'bitti' ? tarayici.sonSonuc : null });
    });
    r.post('/api/tarama/tara', json, (req, res) => {
      try {
        const s = tarayici.baslat({ neden: 'elle (panel)', kim: kim(req) });
        if (!s.baslatildi) return res.status(409).json({ success: false, error: s.neden, is: s.is || null });
        res.json({ success: true, ...s });
      } catch (e) { hataYaz(res, e); }
    });
    r.post('/api/tarama/otomatik', json, (req, res) => {
      try {
        const k = tarayici.otomatikGerekli();
        if (!k.gerekli) return res.json({ success: true, baslatildi: false, neden: k.neden, is: tarayici.isDurum() });
        const s = tarayici.baslat({ neden: `panel açılışı (${k.neden})`, kim: kim(req) });
        res.json({ success: true, ...s, neden: s.neden || k.neden });
      } catch (e) { hataYaz(res, e); }
    });
    r.get('/api/tarama/ozet', (req, res) => {
      try {
        let oz = kayit.ozetOku();
        if (!oz) oz = kayit.ozetUret(ayarlar.oku());
        res.json({ success: true, ozet: oz, bayrakAciklama: ACIKLAMA, aglar: Object.fromEntries(Object.entries(AGLAR).map(([k, v]) => [k, v.ad])) });
      } catch (e) { hataYaz(res, e); }
    });
    r.get('/api/tarama/coin/:id', (req, res) => {
      try {
        const id = String(req.params.id || '').slice(0, 80);
        const lim = Math.max(1, Math.min(90, Number(req.query.limit) || 14));
        res.json({ success: true, id, satirlar: kayit.coinGecmisi(id, lim) });
      } catch (e) { hataYaz(res, e); }
    });
    r.get('/api/tarama/uyarilar', (req, res) => {
      try { const d = durumOzeti(); res.json({ success: true, uyarilar: d.uyarilar, sayi: d.uyariSayisi, calisiyor: d.calisiyor }); } catch (e) { hataYaz(res, e); }
    });
    r.get('/api/tarama/ayarlar', (req, res) => {
      try {
        res.json({ success: true, ayarlar: ayarlar.oku(), tanim: { kaynaklar: KAYNAK_TANIM, esikler: ESIK_TANIM, genel: GENEL_TANIM, bayraklar: ACIKLAMA, bayrakKodlari: BAYRAK_KODLARI,
          aglar: Object.fromEntries(Object.entries(AGLAR).map(([k, v]) => [k, v.ad])) },
        telegram: o.bildirici && typeof o.bildirici.durum === 'function' ? o.bildirici.durum() : { bagli: false, neden: 'Bildirici yok' } });
      } catch (e) { hataYaz(res, e); }
    });
    r.post('/api/tarama/ayarlar', json, (req, res) => {
      try {
        if (!nesne(req.body) || !nesne(req.body.yama)) throw new AyarHatasi('gövde { yama: {...} } olmalı');
        const s = ayarlar.yamala(req.body.yama, kim(req));
        if (s.degisti && s.farklar.some(f => /^esikler\./.test(f))) kayit.ozetUret(s.ayarlar);   // bayraklar yeni eşikle
        res.json({ success: true, degisti: s.degisti, farklar: s.farklar || [], ayarlar: s.ayarlar });
      } catch (e) { hataYaz(res, e); }
    });
    r.post('/api/tarama/izleme', json, (req, res) => {
      try {
        if (!nesne(req.body)) throw new AyarHatasi('gövde nesne olmalı');
        const islem = String(req.body.islem || '');
        if (!['ekle', 'guncelle', 'cikar'].includes(islem)) throw new AyarHatasi('islem ekle / guncelle / cikar olmalı');
        const c = ayarlar.izleme(islem, req.body.coin, kim(req));
        kayit.ozetUret(ayarlar.oku());
        res.json({ success: true, coin: c });
      } catch (e) { hataYaz(res, e); }
    });
    r.get('/api/tarama/denetim', (req, res) => {
      try { res.json({ success: true, kayitlar: ayarlar.denetimOku(Math.max(1, Math.min(500, Number(req.query.limit) || 100))) }); } catch (e) { hataYaz(res, e); }
    });
    r.get('/api/tarama/kaynak-sagligi', (req, res) => {
      try { res.json({ success: true, ...require('./kaynakSagligi').saglik({ taramaDizin: D.dizin, simdi }) }); } catch (e) { hataYaz(res, e); }
    });
    r.get('/api/tarama/arsiv', (req, res) => {
      try { res.json({ success: true, ...require('./arsiv').arsivDurumu({ dizin: D.dizin, tam: req.query.tam === '1' }) }); } catch (e) { hataYaz(res, e); }
    });
    const kipQ = (q) => (q === 'resmi' || q === 'deneme' ? q : null);
    const gunQ = (q) => (gecerliGun(String(q || '')) ? String(q) : null);
    r.get('/api/dikkat/durum', (req, res) => { try { res.json({ success: true, ...require('./dikkatPanel').durum({ dizin: D.dizin }, kipQ(req.query.kip)) }); } catch (e) { hataYaz(res, e); } });
    r.get('/api/dikkat/liste', (req, res) => {
      try { const tur = ['kacin', 'yetersiz', 'yeni', 'hepsi'].includes(req.query.tur) ? req.query.tur : 'kacin'; res.json({ success: true, ...require('./dikkatPanel').liste({ dizin: D.dizin }, kipQ(req.query.kip), gunQ(req.query.gun), tur) }); } catch (e) { hataYaz(res, e); }
    });
    r.get('/api/dikkat/coin', (req, res) => {
      try { const a = temizMetin(req.query.anahtar, 200); if (!a) { res.status(400).json({ success: false, error: 'anahtar gerekli' }); return; } res.json({ success: true, ...require('./dikkatPanel').coin({ dizin: D.dizin }, kipQ(req.query.kip), a) }); } catch (e) { hataYaz(res, e); }
    });
    r.get('/api/dikkat/pencereler', (req, res) => {
      try { const i = req.query.isinma === '1' ? true : req.query.isinma === '0' ? false : null; res.json({ success: true, ...require('./dikkatPanel').pencereler({ dizin: D.dizin }, kipQ(req.query.kip), i) }); } catch (e) { hataYaz(res, e); }
    });
    r.get('/api/izle/durum', (req, res) => { try { res.json({ success: true, ...require('./izlePanel').durum({ dizin: D.dizin }, kipQ(req.query.kip)) }); } catch (e) { hataYaz(res, e); } });
    r.get('/api/izle/liste', (req, res) => { try { res.json({ success: true, ...require('./izlePanel').liste({ dizin: D.dizin }, kipQ(req.query.kip), gunQ(req.query.gun)) }); } catch (e) { hataYaz(res, e); } });
    r.post('/api/tarama/yeniden-uret', json, (req, res) => {
      try { const oz = kayit.ozetUret(ayarlar.oku()); res.json({ success: true, satirSayisi: oz.satirSayisi, coin: oz.coinler.length, bozukSatir: oz.bozukSatir }); } catch (e) { hataYaz(res, e); }
    });

    // ── Listeler ──
    r.get('/api/listeler', (req, res) => {
      try { const z = zincirTazele(); res.json({ success: true, listeler: listeler.etkin(), zincir: z, ham: listeler.oku().satirlar.map(k => ({ no: k.no, tur: k.tur, duzelttigi: k.duzelttigi || null, girisZamani: k.girisZamani, ozet: k.ozet })) }); } catch (e) { hataYaz(res, e); }
    });
    r.get('/api/listeler/dogrula', (req, res) => { try { res.json({ success: true, zincir: zincirTazele() }); } catch (e) { hataYaz(res, e); } });
    r.post('/api/listeler', json, async (req, res) => {
      try {
        if (!nesne(req.body)) throw new ListeHatasi('gövde nesne olmalı');
        const { ek, ...govde } = req.body;   // 'ek' yalnız iç betiklerin (tohum) alanı — panelden yazılmaz
        const k = await listeler.ekle(govde, { kim: kim(req) });
        zincirTazele();
        res.json({ success: true, kayit: k, zincir });
      } catch (e) { hataYaz(res, e); }
    });
    r.post('/api/listeler/duzeltme', json, async (req, res) => {
      try {
        if (!nesne(req.body)) throw new ListeHatasi('gövde nesne olmalı');
        const k = await listeler.duzelt(req.body, { kim: kim(req) });
        zincirTazele();
        res.json({ success: true, kayit: k, zincir });
      } catch (e) { hataYaz(res, e); }
    });
    r.get('/api/listeler/:no/degerlendirme', async (req, res) => {
      try {
        const no = Number(req.params.no);
        const l = listeler.etkin().find(x => x.no === no);
        if (!l) throw new ListeHatasi(`#${req.params.no} numaralı liste yok`);
        const bas = req.query.bas ? String(req.query.bas) : undefined;
        if (bas !== undefined && !gecerliGun(bas)) throw new ListeHatasi('başlangıç YYYY-AA-GG olmalı');
        const http = httpYeni();
        const fiyat = fiyatYeni(http);
        const sonuc = await degerlendir(l, { bas, fiyat, http, simdi, piyasa: new Piyasa({ fiyat, dizin: D.piyasaDizin, simdi }),
          piyasaAnlikOku: (n) => { try { return fs.readFileSync(listeler.piyasaAnlikYolu(n), 'utf8'); } catch { return null; } } });
        res.json({ success: true, degerlendirme: sonuc, piyasaIs: piyasaIsOzet() });
      } catch (e) { hataYaz(res, e); }
    });
    r.post('/api/listeler/piyasa', json, (req, res) => {
      try {
        const gun = nesne(req.body) ? String(req.body.gun || '') : '';
        if (!gecerliGun(gun) || gun >= gunStr(simdi())) throw new ListeHatasi('gün YYYY-AA-GG ve bugünden önce olmalı');
        res.json({ success: true, ...piyasaBaslat(gun) });
      } catch (e) { hataYaz(res, e); }
    });
    r.get('/api/listeler/piyasa-is', (req, res) => { const is = piyasaIsOzet(); res.json({ success: true, is, sonuc: is && is.durum === 'bitti' ? { gun: is.gun } : null }); });
    r.post('/api/listeler/piyasa-iptal', json, (req, res) => { if (piyasaIs && piyasaIs.durum === 'calisiyor') piyasaIs.iptal = true; res.json({ success: true }); });
    return r;
  }

  return { D, ayarlar, kayit, tarayici, listeler, router, zamanlayiciBaslat, dikkatBildir, hariciDurum, durumOzeti, zincirTazele, piyasaBaslat, durdur: () => zamanlayici && zamanlayici.durdur() };
}

module.exports = { kur, dizinler, AGLAR, KOK: path.join(__dirname, '..', '..') };
