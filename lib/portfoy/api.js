/**
 * PORTFÖY LABORATUVARI — HTTP UÇLARI (Express Router) + GECE VERİ GÜNCELLEME ZAMANLAYICISI (L2).
 * server.js bağlar: app.use(require('./lib/portfoy/api').router({ isler, log })). Veri güncellemesi (gece + açılış + talep) artık
 * lib/veri/orkestrator.js'te (tek zamanlayıcı); buradaki /guncelleme ve /guncelle uçları geriye uyumluluk için ona bağlanır.
 * Talep tetiği: simülasyon / varyasyon bayat bir seriye dokununca o kaynak ARKA PLANDA tazelenir (simülasyon beklemez,
 * eldeki veriyle koşar); sonuçta `veriNotu` = "veri X tarihine kadar; güncelleme sürüyor".
 * Öz test bu yönlendiriciyi ayrı bir Express uygulamasında rastgele portta sınar (scripts/portfoy-motor-selftest.js).
 * Araştırma modunda çalışır: server.js'teki ARASTIRMA_KAPALI deseni /api/portfoy/ ile eşleşmez (öz test doğrular).
 *
 *   GET    /api/portfoy/katalog?metin&sinif&hesap&durum&kaynak&etiket&enAzGun&enGecBas&limit(200)&kimlik
 *            → { sayilar, toplam, varliklar }  (kimlik verilirse { varlik })
 *   GET    /api/portfoy/seri/:kimlik?birim&siklik&senaryo&bas&bit&nokta(2000)&getiri(0|1)
 *            → { kimlik, ad, birim, siklik, baslangic, bitis, notlar, seviye: [[t, düzey]] (1'den bileşik; seyreltilmiş), getiri? }
 *   POST   /api/portfoy/indir     { kaynak: 'yahoo', sembol } | { kaynak: 'tefas', kod }  → { is }  (iş; ağ)
 *   POST   /api/portfoy/simule    { tanim, oturum?, bekle? }  → { is } | bekle: { sonuc }   (iş parçacığında)
 *   POST   /api/portfoy/varyasyon { tanim, degistir, adaylar, oturum?, ortakDonem?, sirala?, bekle? } → { is } | { sonuc }
 *   GET    /api/portfoy/is/:id    → { is, sonuc }
 *   GET    /api/portfoy/kararlar?limit → eski karar günlüğü (67.5: salt okunur arşiv; "Olsaydı planı" ile birlikte
 *          POST /api/portfoy/plan ve POST /api/portfoy/kararlar kaldırıldı — gerçek plan Portföy › Hedefim planlayıcısında)
 *   GET    /api/portfoy/portfoyler · GET /api/portfoy/portfoyler/:ad · POST /api/portfoy/portfoyler { ad, tanim, aciklama? }
 *   DELETE /api/portfoy/portfoyler/:ad
 *   GET    /api/portfoy/denemeler?oturum · POST /api/portfoy/denemeler/sifirla { oturum }
 *   GET    /api/portfoy/guncelleme (orkestratörün son koşusu, eski biçim) · POST /api/portfoy/guncelle (portföy kaynakları; iş)
 *          Yeni uçlar: GET /api/veri/durum · POST /api/veri/guncelle (lib/veri/orkestrator.js).
 * Her simülasyon ve her varyasyon adayı oturumun deneme sayacına eklenir (Deflated Sharpe bununla düzeltilir).
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const KAT = require('./katalog');
const SERI = require('./seri');
const M = require('./motor');
const LAB = require('./lab');
const O = require('./ortak');

const ISCI = path.join(__dirname, 'isci.js');
const ORK = () => require('../veri/orkestrator');
/** Portföy tanımının dokunduğu kaynaklar için talep tetiği (EŞZAMANLI, bloklamaz). Hata → not yok. */
function veriTalebi(tanim, neden) {
  try {
    const kimlikler = [...(tanim.varliklar || []).map(v => v.kimlik), ...(tanim.kiyaslar == null ? ['yahoo:QQQ', '60/40'] : tanim.kiyaslar)];
    return ORK().varsayilan().talep(ORK().kaynaklariBul(kimlikler, { birim: tanim.birim || 'USD' }), { neden }).veriNotu;
  } catch (e) { return null; }
}

function temizTanim(t) {
  if (!t || typeof t !== 'object') throw new Error('tanim gerekli');
  const x = JSON.parse(JSON.stringify(t)); delete x._denetlendi; delete x._notlar; return x;
}

function router({ isler, log = () => {} } = {}) {
  if (!isler) throw new Error('portföy api: isler (lib/isler) gerekli');
  const r = express.Router();
  r.use('/api/portfoy', express.json({ limit: '5mb' }));
  const hata = (res, e, kod = 400) => res.status(kod).json({ success: false, error: e && e.message ? e.message : String(e) });

  // ── Katalog ve seriler ────────────────────────────────────────────────────
  r.get('/api/portfoy/katalog', (req, res) => {
    try {
      const q = req.query;
      if (q.kimlik) return res.json({ success: true, varlik: KAT.varlik(String(q.kimlik)) });
      const k = KAT.katalog();
      const virgul = x => (x == null ? undefined : String(x).includes(',') ? String(x).split(',') : String(x));
      const l = KAT.ara({ metin: q.metin, sinif: virgul(q.sinif), hesap: virgul(q.hesap), durum: q.durum, kaynak: q.kaynak, etiket: q.etiket,
        enAzGun: q.enAzGun ? +q.enAzGun : undefined, enGecBas: q.enGecBas });
      const limit = Math.min(+q.limit || 200, 5000);
      res.json({ success: true, olusturma: k.olusturma, sayilar: k.sayilar, toplam: l.length, varliklar: l.slice(0, limit), disarida: k.disarida });
    } catch (e) { hata(res, e); }
  });

  r.get('/api/portfoy/seri/:kimlik', (req, res) => {
    try {
      const q = req.query;
      const p = SERI.seriPaket(req.params.kimlik, { birim: q.birim || 'USD', siklik: q.siklik || 'gunluk', ...(q.senaryo ? { senaryo: q.senaryo } : {}), bas: q.bas, bit: q.bit });
      let v = 1; const sev = [];
      if (p.satirlar.length) sev.push([p.satirlar[0].t - (p.siklik === 'aylik' ? 0 : O.GUN), 1]);
      for (const x of p.satirlar) { v *= 1 + x.getiri; sev.push([x.t, +v.toPrecision(10)]); }
      const n = Math.max(50, Math.min(+q.nokta || 2000, 20000));
      let seviye = sev;
      if (sev.length > n) { const adim = sev.length / n; seviye = []; for (let i = 0; i < n; i++) seviye.push(sev[Math.floor(i * adim)]); seviye.push(sev[sev.length - 1]); }
      res.json({ success: true, kimlik: p.kimlik, ad: p.varlik.ad, birim: p.birim, siklik: p.siklik, baslangic: p.baslangic, bitis: p.bitis,
        notlar: p.notlar, varlik: p.varlik, satirSayisi: p.satirlar.length, seyreltildi: seviye !== sev, seviye,
        ...(q.getiri === '1' ? { getiri: p.satirlar.map(x => [x.t, x.getiri]) } : {}) });
    } catch (e) { hata(res, e); }
  });

  r.post('/api/portfoy/indir', (req, res) => {
    const g = req.body || {};
    if (!['yahoo', 'tefas'].includes(g.kaynak)) return hata(res, new Error("kaynak 'yahoo' | 'tefas'"));
    if (g.kaynak === 'yahoo' && !g.sembol) return hata(res, new Error('sembol gerekli'));
    if (g.kaynak === 'tefas' && !g.kod) return hata(res, new Error('kod gerekli'));
    const is = isler.yeni('portfoy-indir', `${g.kaynak} ${g.sembol || g.kod}`);
    res.json({ success: true, is: isler.ozet(is) });
    require('./indir').indir({ kaynak: g.kaynak, sembol: g.sembol, kod: g.kod })
      .then(s => { log('SUCCESS', `📥 Portföy verisi: ${s.kimlik} (${s.gun} gün, ${s.ilk} → ${s.son})`); isler.bitir(is, s); })
      .catch(e => isler.hata(is, e.message));
  });

  // ── Simülasyon ve varyasyon (iş parçacığında) ─────────────────────────────
  function isBaslat(req, res, tur, hazirla, sonra) {
    let tanim, ops, oturum;
    try {
      const g = req.body || {};
      tanim = temizTanim(g.tanim);
      M.tanimDenetle(tanim);                                 // hızlı 400
      oturum = LAB.denemeler(g.oturum).oturum;
      ops = hazirla(g, LAB.denemeler(oturum, tanim.birim || 'USD').sharpeler);   // DSR yalnız aynı birimdeki denemelerle (L4)
    } catch (e) { return hata(res, e); }
    const g = req.body || {};
    const veriNotu = veriTalebi(tanim, 'talep: portföy ' + tur);
    const is = isler.yeni('portfoy-' + tur, `${tur}: ${tanim.varliklar.length} varlık · ${tanim.yontem || 'elle/eşit'}${tur === 'varyasyon' ? ' · ' + g.degistir : ''}`);
    const calis = isler.isciCalistir(is, { tur, tanim, ops }, log, ISCI)
      .then(m => { const sonuc = sonra(m.sonuc, oturum); if (veriNotu && sonuc && typeof sonuc === 'object') sonuc.veriNotu = veriNotu; isler.bitir(is, sonuc); return sonuc; })
      .catch(e => { isler.hata(is, e.message); throw e; });
    if (g.bekle) calis.then(sonuc => res.json({ success: true, is: isler.ozet(is), sonuc })).catch(e => hata(res, e, 422));
    else { res.json({ success: true, is: isler.ozet(is) }); calis.catch(() => null); }
  }
  r.post('/api/portfoy/simule', (req, res) => isBaslat(req, res, 'simule',
    (g, onceki) => ({ oncekiSharpeler: onceki }),
    (sonuc, oturum) => { const d = LAB.denemeEkle(oturum, [sonuc.deneme.gunlukSharpe], 'simule', sonuc.tanim && sonuc.tanim.birim); sonuc.deneme.oturum = oturum; sonuc.deneme.oturumSayi = d.sayi; return sonuc; }));
  r.post('/api/portfoy/varyasyon', (req, res) => isBaslat(req, res, 'varyasyon',
    (g, onceki) => { if (!g.degistir) throw new Error('degistir gerekli'); if (!g.adaylar) throw new Error('adaylar gerekli');
      return { degistir: g.degistir, adaylar: g.adaylar, ortakDonem: g.ortakDonem, sirala: g.sirala, oncekiSharpeler: onceki }; },
    (sonuc, oturum) => { const d = LAB.denemeEkle(oturum, sonuc.yeniSharpeler || [], 'varyasyon:' + sonuc.degistir, (req.body && req.body.tanim && req.body.tanim.birim) || 'USD'); sonuc.oturum = oturum; sonuc.oturumSayi = d.sayi; return sonuc; }));
  r.get('/api/portfoy/is/:id', (req, res) => {
    const is = isler.al(req.params.id);
    if (!is) return hata(res, new Error('iş bulunamadı'), 404);
    res.json({ success: true, is: isler.ozet(is), sonuc: is.durum === 'bitti' ? is.sonuc : null });
  });

  // ── Karar günlüğü (67.5: salt okunur arşiv — "Olsaydı planı" sekmesi ve onun plan / karar yazma uçları kaldırıldı) ──
  r.get('/api/portfoy/kararlar', (req, res) => { try { res.json({ success: true, kararlar: LAB.kararlar({ limit: Math.min(+req.query.limit || 200, 5000) }) }); } catch (e) { hata(res, e, 500); } });

  // ── Kayıtlı portföyler ────────────────────────────────────────────────────
  r.get('/api/portfoy/portfoyler', (req, res) => res.json({ success: true, portfoyler: LAB.portfoyler() }));
  r.get('/api/portfoy/portfoyler/:ad', (req, res) => { const p = LAB.portfoy(req.params.ad); if (!p) return hata(res, new Error('portföy yok'), 404); res.json({ success: true, portfoy: p }); });
  r.post('/api/portfoy/portfoyler', (req, res) => {
    try { const g = req.body || {}; const t = temizTanim(g.tanim); M.tanimDenetle(t); res.json({ success: true, portfoy: LAB.portfoyKaydet(g.ad, t, g.aciklama) }); }
    catch (e) { hata(res, e); }
  });
  r.delete('/api/portfoy/portfoyler/:ad', (req, res) => { const ok = LAB.portfoySil(req.params.ad); if (!ok) return hata(res, new Error('portföy yok'), 404); res.json({ success: true }); });

  // ── Deneme sayacı ─────────────────────────────────────────────────────────
  r.get('/api/portfoy/denemeler', (req, res) => {
    try { const d = LAB.denemeler(req.query.oturum); res.json({ success: true, oturum: d.oturum, sayi: d.sayi, baslangic: d.baslangic, son: d.son, oturumlar: LAB.oturumlar() }); }
    catch (e) { hata(res, e); }
  });
  r.post('/api/portfoy/denemeler/sifirla', (req, res) => { try { const d = LAB.denemeSifirla((req.body || {}).oturum); res.json({ success: true, oturum: d.oturum, sayi: d.sayi }); } catch (e) { hata(res, e); } });

  // ── Veri güncelleme (geriye uyumlu; asıl uçlar /api/veri/*) ─────────────────
  r.get('/api/portfoy/guncelleme', (req, res) => res.json({ success: true, durum: guncellemeDurumu() }));
  r.post('/api/portfoy/guncelle', (req, res) => {
    const is = isler.yeni('portfoy-guncelle', 'Portföy verileri: artımlı güncelleme (veri orkestratörü)');
    res.json({ success: true, is: isler.ozet(is) });
    ORK().varsayilan().calistir({ kaynaklar: PORTFOY_KAYNAKLARI, neden: 'elle (portföy)' })
      .then(k => { log(k.hatalar ? 'WARN' : 'SUCCESS', `📊 Portföy verileri güncellendi: ${k.calisan} kaynak, ${k.sureSn} sn, ${k.hatalar} hata`); isler.bitir(is, k); })
      .catch(e => isler.hata(is, e.message));
  });
  return r;
}

// ═══ VERİ GÜNCELLEMESİ — lib/veri/orkestrator.js (eski gece zamanlayıcısı oraya taşındı; iki zamanlayıcı kalmasın) ═══
const PORTFOY_KAYNAKLARI = ['usdtry', 'evds-mevduat', 'tufe', 'tefas', 'yahoo-gercek-varlik', 'yahoo-nasdaq', 'yahoo-portfoy'];
/** Eski biçim { sonGun, son, neden, sonuc: { hatalar }, sonHata } — orkestratörün durum dosyasından (ucuz: yalnız dosya okur). */
function guncellemeDurumu() {
  try {
    const d = ORK().varsayilan().durumOku();
    const k = (d.kosular || []).slice(-1)[0];
    const yerel = t => { const x = new Date(t); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    return { sonGun: k ? yerel(k.bit) : (d.gece && d.gece.sonGun) || null, son: k ? k.bit : null, neden: k ? k.neden : null,
      sonuc: k ? { hatalar: k.hatalar, calisan: k.calisan, sureSn: k.sureSn } : null, sonHata: d.gece && d.gece.sonHata || null };
  } catch (e) { return { sonGun: null, sonHata: e.message }; }
}

module.exports = { router, guncellemeDurumu, PORTFOY_KAYNAKLARI };
