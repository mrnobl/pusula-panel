/**
 * İŞLEM DEFTERİ — HTTP UÇLARI `/api/islem-defteri/*` (sürüm 64.7; 65.0 Binance eşitlemesi; panel public/js/pages/islemDefteri.js — Portföy › İşlem defterim)
 * ═══════════════════════════════════════════════════════════════════════════
 * Kullanıcının KENDİ (elle / takdirî) kripto ve FX işlemleri: OKX, Binance (geçmiş), MetaTrader 4/5. Botların işlemleri
 * BURADA DEĞİL (Botlar ekranı); Portföyüm'ün yatırım defterinden AYRI (çift sayım yok; Portföyüm'e dokunmaz).
 *
 * GET (telefonda da açık; sunucudaki panelden okunur — lib/evOkuma.js EV_YOLU):
 *   /bakiye?yenile=1       yeni panel F4 (K-E): OKX / Binance bugünkü bakiyesi (salt okuma anahtarı; 10 dk önbellek; telefonda yalnız önbellek)
 *   /ozet?hesap=           hesaplar (sır yok: OKX için yalnız "anahtar kayıtlı · izinler"), yüklemeler, performans, yazma durumu
 *   /islemler?hesap&sembol&bas&bit&yon&kaynak&tur&sayfa&boyut   işlem listesi
 *   /fiyat?sembol&hesap    fiyat grafiği (diskteki günlük seri) + alım/satım işaretleri — seri yoksa not
 * POST (YALNIZ sunucunun masaüstü paneli: telefon kademesinde lib/guvenlik.js 403; araştırma modunda (geliştirme
 * bilgisayarı) BURADA 403 — "kayıtlar sunucuda tutulur". ISLEM_DEFTERI_YAZ=1 yalnız kılavuz görüntüsü üreticisinin
 * geçici örnek klasörü içindir):
 *   /hesap {ad, tur, paraBirimi, not} · /hesap/:id {ad?, not?, aktif?, sunucuSaatFarki?, saatKipi? ('sabit'|'abd-yaz'), paraBirimi?}
 *   /onizle {hesap, dosyaAdi, icerik (base64), kaynak?, yenidenAl?}  — yazmaz · /yukle (aynı gövde) — tek atomik yazım.
 *        Daha önce iptal edilmiş / geri alınmış satırlar "bastırılan" sayılır, eklenmez; yenidenAl: true açıkça yeniden ekler.
 *   /yukleme/:id/geri-al {neden} (OKX dosyası geri alınınca o hesabın OKX eşitlemesi bir kez 3 ayı baştan tarar) · /kayit/:id/iptal {neden}
 *   /okx/anahtar {hesap, apiKey, secret, passphrase, saltOkumaOnay} — trade/withdraw izinli anahtar REDDEDİLİR
 *   /okx/anahtar-sil {hesap} · /okx/esitle {hesap}
 *   64.8 /okx/kayitlar {hesap, kayitlar, ozet?} — GELİŞTİRME BİLGİSAYARININ kendi OKX anahtarıyla çektiği satırlar (sunucuda çift denetimi:
 *        anahtar + bastırılan + dosya↔API ±2 sn, depo.iceAktarPlan). Telefonda 403; sunucuda geliştirme kademesi (lib/guvenlik.js) yazabilir.
 *   65.0 BINANCE (binanceApi.js; OKX'in birebir karşılığı): /binance/anahtar {hesap, apiKey, secret} — apiRestrictions'ta YALNIZ okuma açık
 *        değilse REDDEDİLİR (elle onay yok); kayıtta vadeli okuma bir kez denenir, sonucu kartta · /binance/anahtar-sil {hesap} ·
 *        /binance/esitle {hesap} · /binance/kayitlar {hesap, kayitlar, ozet?} (geliştirme bilgisayarından; sunucuda aynı çift denetimi:
 *        Trade ID / Transaction ID anahtarı + spot dosya ↔ API benzerliği). Durum data/islem-defteri/binance-durum.json (sır yok).
 * 64.8 GELİŞTİRME BİLGİSAYARI (araştırma modu + sunucu bağlantısı): yazma uçları lib/evYazma.js ile sunucuya iletilir (bu yönlendiriciye hiç
 * gelmez); OKX anahtarı BURADA (bu bilgisayarın data/secrets.json'u) kaydedilir/denenir/silinir, "Şimdi eşitle" OKX'ten burada çeker
 * ve satırları eve /okx/kayitlar ile yollar (sunucu kapalıysa kuyruk). Hesap kimlikleri evinkiler (ops.ev.hesap). Günlük otomatik
 * eşitleme YALNIZ sunucuda.
 * Hiçbir uç emir vermez, Telegram'a bir şey göndermez, sır döndürmez (OKX / Binance hataları yalnız OKX.guvenliMesaj / BN.guvenliMesaj ile — ham e.message değil).
 */
'use strict';
const express = require('express');
const M = require('./model');
const depo = require('./depo');
const A = require('./analiz');
const MT = require('./metin');
const ICE = require('./ice');
const OKX = require('./okxApi');
const BN = require('./binanceApi');
const FY = require('./fiyat');
const BAKIYE = require('./bakiye');

const DOSYA_TAVAN = 7 * 1024 * 1024;
/** 64.8: geliştirme bilgisayarının OKX satırları sunucuya en çok bu kadarlık parçalarla gider (gövde 10 MB sınırının çok altında kalsın). */
const OKX_PARCA = 2000;
const OKX_KAYIT_TAVAN = 5000;
const ARASTIRMA_MESAJI = 'Kayıtlar sunucuda tutulur; bu bilgisayar yalnız görüntüler (sunucu bağlantısı). Buradan kayıt girmek için sunucuda `npm run gelistirme-jeton`, burada `npm run sunucu-baglanti -- --yazma-jeton <jeton>` çalıştırın; o zamana kadar yükleme, hesap ve OKX anahtarı sunucudaki panelden.';

function kur(ops = {}) {
  const log = ops.log || (() => {});
  const simdi = ops.simdi || (() => Date.now());
  const kilavuzKipi = process.env.ISLEM_DEFTERI_YAZ === '1';
  const arastirma = !!ops.arastirma && !kilavuzKipi;
  // ISLEM_DEFTERI_YAZ=1 (kılavuz üreticisinin geçici klasörü) OKX anahtarını ve eşitlemeyi AÇMAZ: anahtar data/secrets.json'a gider.
  const arastirmaOkx = !!ops.arastirma;
  // 64.8: geliştirme bilgisayarı (araştırma modu) kendi OKX anahtarıyla çalışır — sunucu bağlantısı (ops.ev) varken ve kılavuz kipinde değilken
  const ev = ops.ev || null;   // { kurulu: () → bool, hesap: async (id) → sunucudaki hesap | null, gonder: async (yol, govde) → lib/evYazma yaz() sonucu }
  // sunucu bağlantısı her istekte okunur (data/ev-baglanti.json yeniden başlatmadan değişebilir)
  const evOkxF = () => arastirmaOkx && !kilavuzKipi && !!ev && (typeof ev.kurulu !== 'function' || !!ev.kurulu());
  const sirlar = ops.sirlar || { oku: () => ({}), yaz: () => { throw new Error('sır deposu yok'); } };
  const okxFetch = ops.okxFetch;   // test
  const binanceFetch = ops.binanceFetch;   // test
  let fiyatlar = ops.fiyatlar || null;
  const fiyat = () => fiyatlar || (fiyatlar = FY.olustur({ mumDeposu: ops.mumDeposu, kurSerileri: ops.kurSerileri }));
  const tzDk = ops.tzDk;
  let esitleniyor = new Set();

  const okxSir = () => { const s = sirlar.oku() || {}; return (s.okx && typeof s.okx === 'object') ? s.okx : {}; };
  const okxDurum = () => depo.jsonOku('okx-durum.json') || {};
  const okxDurumYaz = (id, alanlar) => { const d = okxDurum(); d[id] = { ...(d[id] || {}), ...alanlar }; depo.jsonYaz('okx-durum.json', d); };
  // 65.0 Binance: anahtar secrets.json islemDefteri.binance[<hesap>] (bot anahtarlarından AYRI), durum binance-durum.json (sır yok)
  const binanceSir = () => { const s = sirlar.oku() || {}; return (s.binance && typeof s.binance === 'object') ? s.binance : {}; };
  const binanceDurum = () => depo.jsonOku('binance-durum.json') || {};
  const binanceDurumYaz = (id, alanlar) => { const d = binanceDurum(); d[id] = { ...(d[id] || {}), ...alanlar }; depo.jsonYaz('binance-durum.json', d); };

  const r = express.Router();
  const hata = (res, e, kod = 400) => res.status(kod).json({ success: false, error: e && e.message ? e.message : String(e) });
  const govde = (req) => (req.body && typeof req.body === 'object' ? req.body : {});
  const yazmaKapisi = (req, res, next) => {
    if (req.kademe === 'telefon') return res.status(403).json({ success: false, kademe: 'telefon', error: 'Telefondan yalnız izleme — yükleme ve ayarlar sunucunun panelinden.' });
    if (arastirma) return res.status(403).json({ success: false, arastirma: true, error: ARASTIRMA_MESAJI });
    next();
  };
  /** OKX / Binance anahtar ve eşitleme: telefonda ve geliştirme kademesinde (sunucuda, uzaktan) 403; araştırma modunda yalnız sunucu bağlantısıyla (64.8). */
  const borsaKapisi = (borsa) => (req, res, next) => {
    if (req.kademe === 'telefon' || req.kademe === 'gelistirme') return res.status(403).json({ success: false, kademe: req.kademe, error: `${borsa} anahtarı yalnız o bilgisayarın kendi panelinden kaydedilir.` });
    if (arastirmaOkx && !evOkxF()) return res.status(403).json({ success: false, arastirma: true, error: ARASTIRMA_MESAJI });
    next();
  };
  const okxKapisi = borsaKapisi('OKX');
  const binanceKapisi = borsaKapisi('Binance');
  /** Hesap: sunucuda (ya da sunucu bağlantısız) yerel depodan; geliştirme bilgisayarında sunucudaki hesap listesinden (kimlikler evinki). */
  async function okxHesabi(id) {
    if (evOkxF()) return ev.hesap(id);
    return depo.yukle().hesaplar.get(id) || null;
  }

  function hesapDisari(h, D) {
    const sir = okxSir()[h.id];
    const dur = okxDurum()[h.id] || {};
    const kayit = D.veri.filter(k => k.hesap === h.id);
    return {
      id: h.id, ad: h.ad, hesapTuru: h.hesapTuru, turAd: (M.HESAP_TURLERI[h.hesapTuru] || {}).ad || h.hesapTuru, paraBirimi: h.paraBirimi, not: h.not || '',
      aktif: h.aktif !== false, sunucuSaatFarki: Number(h.sunucuSaatFarki) || 0, saatKipi: h.saatKipi === 'abd-yaz' ? 'abd-yaz' : 'sabit', kayit: kayit.length,
      kaynaklar: (M.HESAP_TURLERI[h.hesapTuru] || {}).kaynaklar,
      okx: h.hesapTuru === 'kripto-okx' ? { anahtar: !!sir, izinler: sir ? (sir.izinler || []) : [], izinDurumu: sir ? sir.izinDurumu : null, sonEsitleme: dur.sonEsitleme || null,
        sonHata: dur.sonHata || null, sonOzet: dur.sonOzet || null, tamTarama: !!dur.tamTarama } : null,
      binance: h.hesapTuru === 'kripto-binance' ? binanceDisari(binanceSir()[h.id], binanceDurum()[h.id]) : null
    };
  }
  /** Binance kart durumu (sır YOK): anahtar var mı, izinler, vadeli okuma sonucu, son eşitleme/hata/özet, spot tam tarama ilerlemesi. */
  function binanceDisari(sir, d0) {
    const d = d0 || {};
    const sp = (d.imlec && d.imlec.spot) || {};
    const T = sp.tarama && Array.isArray(sp.tarama.liste) ? { i: Number(sp.tarama.i) || 0, n: sp.tarama.liste.length } : null;
    return { anahtar: !!sir, izinler: sir ? (sir.izinler || []) : [], ipKisitli: !!(sir && sir.ipKisitli), vadeli: d.vadeli || null,
      sonEsitleme: d.sonEsitleme || null, sonHata: d.sonHata || null, sonOzet: d.sonOzet || null, tamTarama: !!d.tamTarama, tarama: T, tamBitti: sp.tamBitti || null };
  }

  // ── Okuma ─────────────────────────────────────────────────────────────────
  r.get('/api/islem-defteri/ozet', (req, res) => {
    try {
      const D = depo.yukle();
      const hesapId = String((req.query || {}).hesap || '');
      if (hesapId && !D.hesaplar.has(hesapId)) return hata(res, new Error('hesap bulunamadı'), 404);
      const perf = A.performans(D, { hesap: hesapId, fiyatUsd: (p, t) => fiyat().usd(p, t), tzDk });
      const hesapOzet = [...D.hesaplar.values()].map(h => {
        const p = A.performans(D, { hesap: h.id, fiyatUsd: (pp, t) => fiyat().usd(pp, t), tzDk });
        return { id: h.id, birim: p.birim, net: p.toplam.net, islem: p.toplam.islem, kazanmaOrani: p.toplam.kazanmaOrani, ilk: p.toplam.ilk, son: p.toplam.son };
      });
      const yuklemeler = [...D.yuklemeler.values()].sort((a, b) => (b.sira || 0) - (a.sira || 0)).slice(0, 100)
        .map(y => ({ id: y.id, hesap: y.hesap, kaynak: y.kaynak, kaynakAd: M.KAYNAK_AD[y.kaynak] || y.kaynak, bicim: y.bicim, dosyaAdi: y.dosyaAdi || null, sha256: y.sha256 ? y.sha256.slice(0, 12) : null,
          satir: y.satir, eklenen: y.eklenen, cift: y.cift, atlanan: y.atlanan, hata: y.hata, aralik: y.aralik || null, zaman: y.kayitZamani, geriAlindi: !!y.geriAlindi, geriAlmaZamani: y.geriAlmaZamani || null }));
      res.json({
        success: true, simdi: simdi(),
        yazma: { acik: !arastirma && req.kademe !== 'telefon', neden: req.kademe === 'telefon' ? 'telefon' : arastirma ? ARASTIRMA_MESAJI : null },
        hesaplar: [...D.hesaplar.values()].map(h => hesapDisari(h, D)), hesapOzet, yuklemeler, performans: perf,
        hatalar: D.bozuk.map(b => b.mesaj),
        sabitler: { hesapTurleri: M.HESAP_TURLERI, kaynaklar: M.KAYNAK_AD, dosyaTavanMB: DOSYA_TAVAN / 1048576 }
      });
    } catch (e) { hata(res, e, 500); }
  });

  r.get('/api/islem-defteri/islemler', (req, res) => {
    try {
      const D = depo.yukle();
      const q = req.query || {};
      const l = A.liste(D, { hesap: q.hesap, sembol: q.sembol, bas: q.bas, bit: q.bit, yon: q.yon, kaynak: q.kaynak, tur: q.tur, sayfa: q.sayfa, boyut: q.boyut }, { tzDk });
      const fu = (p, t) => fiyat().usd(p, t);
      l.satirlar = l.satirlar.map(k => {
        const kz = k.tur === 'islem' ? k.gerceklesenKar : (k.tur === 'kz' ? k.tutar : null);
        const kzUsd = kz == null ? null : (M.dolarGibiMi(k.para) ? kz : (fu(k.para, k.t) != null ? kz * fu(k.para, k.t) : null));
        return { id: k.id, tur: k.tur, islemTuru: k.islemTuru || null, hesap: k.hesap, hesapAd: k.hesapAd, kaynak: k.kaynak, t: k.t, acilisT: k.acilisT, sembol: k.sembol || null,
          piyasa: k.piyasa || null, yon: k.yon || null, miktar: k.miktar, fiyat: k.fiyat, acilisFiyat: k.acilisFiyat, ucret: k.ucret || null, gerceklesenKar: kz, kzUsd,
          komisyon: k.komisyon, swap: k.swap, vergi: k.vergi, tutar: k.tutar, para: k.para || null, pozisyonId: k.pozisyonId || null, kaynakId: k.kaynakId, yukleme: k.yukleme, not: k.not || null, ham: k.ham || null };
      });
      res.json({ success: true, ...l });
    } catch (e) { hata(res, e, 500); }
  });

  r.get('/api/islem-defteri/fiyat', (req, res) => {
    try {
      const D = depo.yukle();
      const q = req.query || {};
      const sembol = String(q.sembol || '');
      if (!sembol) return hata(res, new Error('sembol gerekli'));
      const isaret = A.isaretler(D, q.hesap || '', sembol);
      if (!isaret.length) return hata(res, new Error('bu sembolde işlem yok'), 404);
      const k = D.veri.find(x => x.tur === 'islem' && x.sembol === sembol);
      const bas = isaret[0].t - 15 * 864e5, bit = Math.min(simdi(), isaret[isaret.length - 1].t + 15 * 864e5);
      const s = fiyat().seri(sembol, k.piyasa, bas, bit);
      res.json({ success: true, sembol, piyasa: k.piyasa, seri: s.seri, kaynak: s.kaynak || null, not: s.not || null, isaretler: isaret.slice(-400) });
    } catch (e) { hata(res, e, 500); }
  });

  /**
   * Yeni panel F4 (K-E): borsa bakiyeleri (lib/islemDefteri/bakiye.js) — salt okuma anahtarı olan aktif OKX / Binance hesapları.
   * 10 dk önbellek (bakiye.json; ?yenile=1 tazeler). Telefonda ağa çıkılmaz, önbellek döner. Hesap başına hata satırda; anahtarsız
   * hesap "anahtar yok" (anahtar o bilgisayarın panelinden — sunucuda yoksa Pano bunu söyler).
   */
  const BAKIYE_MS = 10 * 60e3;
  r.get('/api/islem-defteri/bakiye', async (req, res) => {
    try {
      // ISLEM_DEFTERI_BAKIYE=0: borsaya hiç sorulmaz (kılavuz görüntüleri — örnek hesap kimlikleri gerçek anahtarlarla çakışabilir).
      if (process.env.ISLEM_DEFTERI_BAKIYE === '0') return res.json({ success: true, onbellek: false, kapali: true, hesaplar: [], toplamUSD: 0, okunan: 0 });
      const onb = depo.jsonOku('bakiye.json') || {};
      const taze = onb.zaman && simdi() - Date.parse(onb.zaman) < BAKIYE_MS;
      if (req.kademe === 'telefon' || (taze && String((req.query || {}).yenile || '') !== '1')) return res.json({ success: true, onbellek: true, ...onb });
      const D = depo.yukle();
      const bS = binanceSir(), oS = okxSir();
      const hesaplar = await Promise.all([...D.hesaplar.values()].filter(h => h.aktif !== false && (h.hesapTuru === 'kripto-binance' || h.hesapTuru === 'kripto-okx')).map(async (h) => {
        const borsa = h.hesapTuru === 'kripto-okx' ? 'okx' : 'binance';
        const sir = borsa === 'okx' ? oS[h.id] : bS[h.id];
        if (!sir) return { id: h.id, ad: h.ad, borsa, anahtar: false, hata: 'salt okuma anahtarı bu bilgisayarda kayıtlı değil' };
        try {
          const b = borsa === 'okx' ? await BAKIYE.okx(sir, { fetch: okxFetch, simdi }) : await BAKIYE.binance(sir, { fetch: binanceFetch, simdi });
          return { id: h.id, ad: h.ad, anahtar: true, ...b };
        } catch (e) { return { id: h.id, ad: h.ad, borsa, anahtar: true, hata: (borsa === 'okx' ? OKX : BN).guvenliMesaj(e) }; }
      }));
      const okunan = hesaplar.filter(h => !h.hata);
      const sonuc = { zaman: new Date(simdi()).toISOString(), hesaplar, toplamUSD: okunan.reduce((s, h) => s + (h.toplamUSD || 0), 0), okunan: okunan.length };
      try { depo.jsonYaz('bakiye.json', sonuc); } catch (e) { log('WARN', `Borsa bakiyesi önbelleği yazılamadı: ${e.message}`); }
      res.json({ success: true, onbellek: false, ...sonuc });
    } catch (e) { hata(res, e, 500); }
  });

  // ── Yazma ─────────────────────────────────────────────────────────────────
  r.post('/api/islem-defteri/hesap', yazmaKapisi, (req, res) => {
    try {
      const g = govde(req);
      const ad = String(g.ad || '').trim().slice(0, 60);
      const tur = String(g.tur || g.hesapTuru || '');
      if (!ad) return hata(res, new Error('hesap adı gerekli'));
      if (!M.HESAP_TURLERI[tur]) return hata(res, new Error(`hesap türü geçersiz (${Object.keys(M.HESAP_TURLERI).join(', ')})`));
      const para = String(g.paraBirimi || M.HESAP_TURLERI[tur].para).toUpperCase().trim();
      if (!/^[A-Z0-9]{2,6}$/.test(para)) return hata(res, new Error('para birimi geçersiz'));
      const D = depo.yukle();
      if ([...D.hesaplar.values()].some(h => h.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))) return hata(res, new Error('bu adda hesap var'));
      const [h] = depo.ekle([{ tur: 'hesap', ad, hesapTuru: tur, paraBirimi: para, not: String(g.not || '').slice(0, 200), aktif: true, sunucuSaatFarki: 0 }], { simdi: simdi() });
      res.json({ success: true, hesap: h.id });
    } catch (e) { hata(res, e, 500); }
  });

  r.post('/api/islem-defteri/hesap/:id', yazmaKapisi, (req, res) => {
    try {
      const D = depo.yukle();
      const h = D.hesaplar.get(req.params.id);
      if (!h) return hata(res, new Error('hesap bulunamadı'), 404);
      const g = govde(req), alanlar = {};
      if ('ad' in g) { const ad = String(g.ad || '').trim().slice(0, 60); if (!ad) return hata(res, new Error('ad boş olamaz')); alanlar.ad = ad; }
      if ('not' in g) alanlar.not = String(g.not || '').slice(0, 200);
      if ('aktif' in g) alanlar.aktif = !!g.aktif;
      if ('paraBirimi' in g) { const p = String(g.paraBirimi || '').toUpperCase().trim(); if (!/^[A-Z0-9]{2,6}$/.test(p)) return hata(res, new Error('para birimi geçersiz')); alanlar.paraBirimi = p; }
      if ('sunucuSaatFarki' in g) {
        const s = MT.sayi(g.sunucuSaatFarki);
        if (s == null || s < -12 || s > 14 || Math.round(s * 4) !== s * 4) return hata(res, new Error('sunucu saat farkı −12 ile +14 saat arasında olmalı (çeyrek saat adımı)'));
        alanlar.sunucuSaatFarki = s;
      }
      if ('saatKipi' in g) {
        const kip = String(g.saatKipi || '');
        if (!['sabit', 'abd-yaz'].includes(kip)) return hata(res, new Error('saat kipi "sabit" ya da "abd-yaz" olmalı'));
        alanlar.saatKipi = kip;
      }
      if (!Object.keys(alanlar).length) return hata(res, new Error('değişen alan yok'));
      depo.ekle([{ tur: 'hesap-guncelle', hesap: h.id, alanlar }], { simdi: simdi() });
      res.json({ success: true });
    } catch (e) { hata(res, e, 500); }
  });

  /** Gövdeden dosya + ayrıştırma + plan (yazmaz). */
  function hazirla(req, Dver) {
    const g = govde(req);
    const D = Dver || depo.yukle();
    const h = D.hesaplar.get(String(g.hesap || ''));
    if (!h) throw Object.assign(new Error('önce hesabı seçin'), { kod: 400 });
    let buf;
    try { buf = Buffer.from(String(g.icerik || ''), 'base64'); } catch (e) { buf = Buffer.alloc(0); }
    if (!buf.length) throw Object.assign(new Error('dosya boş'), { kod: 400 });
    if (buf.length > DOSYA_TAVAN) throw Object.assign(new Error(`dosya çok büyük (${(buf.length / 1048576).toFixed(1)} MB; en çok ${DOSYA_TAVAN / 1048576} MB) — dönemi bölüp ayrı ayrı yükleyin`), { kod: 413 });
    if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) throw Object.assign(new Error('Bu bir Excel (XLSX) dosyası — Excel\'de açıp "Farklı kaydet → CSV UTF-8 (virgülle ayrılmış)" ile kaydedin, sonra o CSV\'yi yükleyin.'), { kod: 400 });
    const { metin, kodlama } = MT.coz(buf);
    const dosyaAdi = String(g.dosyaAdi || '').replace(/[\\/]/g, '_').slice(0, 120);
    const tani = g.kaynak ? { kaynak: String(g.kaynak), bicim: String(g.kaynak) } : ICE.tani(metin, dosyaAdi);
    if (!tani) throw Object.assign(new Error('dosya biçimi tanınmadı — desteklenenler: OKX işlem geçmişi / hesap dökümü CSV, Binance spot ve vadeli işlem geçmişi CSV, Binance vadeli hesap hareketleri CSV, MetaTrader 4 "Detailed Statement" ve MetaTrader 5 "History" HTML raporu (kılavuzda nasıl indirileceği yazar)'), { kod: 400 });
    const izinli = (M.HESAP_TURLERI[h.hesapTuru] || {}).kaynaklar;
    if (izinli && !izinli.includes(tani.kaynak)) throw Object.assign(new Error(`bu dosya (${M.KAYNAK_AD[tani.kaynak] || tani.kaynak}) "${h.ad}" hesabının türüne (${M.HESAP_TURLERI[h.hesapTuru].ad}) uymuyor — doğru hesabı seçin`), { kod: 400 });
    const p = ICE.ayristir(tani.kaynak, metin, { dosyaAdi });
    const yenidenAl = g.yenidenAl === true;
    const plan = depo.iceAktarPlan(D, h.id, tani.kaynak, p.kayitlar, { yenidenAl });
    const sha = depo.sha256(buf);
    const once = [...D.yuklemeler.values()].find(y => y.sha256 === sha && y.hesap === h.id && !y.geriAlindi);
    const uyarilar = [...(p.uyarilar || [])];
    if (p.hesap && p.hesap.para && h.paraBirimi && p.hesap.para !== h.paraBirimi) uyarilar.push(`Raporun hesap para birimi ${p.hesap.para}, bu hesabınki ${h.paraBirimi} — doğru hesap mı? (hesabın para birimini düzenleyebilirsiniz)`);
    if (once) uyarilar.push(`Bu dosya ${String(once.kayitZamani || '').slice(0, 10)} günü bu hesaba zaten yüklendi — satırların hepsi çift sayılacak.`);
    if (plan.bastirilan && !yenidenAl) uyarilar.push(`${plan.bastirilan} satır daha önce geri alınmış ya da iptal edilmiş — eklenmeyecek. Bilerek yeniden eklemek için önizlemedeki "yeniden ekle" kutusunu işaretleyin.`);
    return { D, h, buf, sha, kodlama, dosyaAdi, tani, p, plan, uyarilar, yenidenAl };
  }

  function onizlemeOzeti(x) {
    const l = x.plan.yeni;
    const zamanlar = l.map(k => A.utc(k, x.h)).filter(Number.isFinite);
    const say = new Map();
    for (const k of l) if (k.sembol) say.set(k.sembol, (say.get(k.sembol) || 0) + 1);
    const turSay = {};
    for (const k of l) { const a = k.tur === 'islem' ? (k.islemTuru === 'pozisyon' ? 'pozisyon' : 'dolum') : k.tur; turSay[a] = (turSay[a] || 0) + 1; }
    return {
      kaynak: x.tani.kaynak, kaynakAd: M.KAYNAK_AD[x.tani.kaynak] || x.tani.kaynak, bicim: x.p.bicim || x.tani.bicim, kodlama: x.kodlama, dosyaAdi: x.dosyaAdi, sha256: x.sha.slice(0, 12),
      satir: x.p.satir != null ? x.p.satir : x.p.kayitlar.length, gecerli: l.length, cift: x.plan.cift, atlanan: x.p.atlanan || 0,
      bastirilan: x.plan.bastirilan || 0, yenidenAl: !!x.yenidenAl, yenidenAlinabilir: x.yenidenAl ? x.plan.yeni.filter(k => (x.D.bastirilan || new Map()).has(k.anahtar)).length : (x.plan.bastirilan || 0),
      hata: x.plan.hatalar.length + (x.p.hatalar || []).length, hatalar: [...(x.p.hatalar || []), ...x.plan.hatalar].slice(0, 20),
      aralik: zamanlar.length ? { bas: Math.min(...zamanlar), bit: Math.max(...zamanlar) } : null,
      turler: turSay, semboller: [...say.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([s, n]) => ({ sembol: s, adet: n })),
      ornek: l.slice(0, 8).map(k => ({ tur: k.tur, islemTuru: k.islemTuru || null, t: A.utc(k, x.h), sembol: k.sembol, piyasa: k.piyasa, yon: k.yon, miktar: k.miktar, fiyat: k.fiyat, ucret: k.ucret, gerceklesenKar: k.gerceklesenKar, tutar: k.tutar, para: k.para })),
      hesapBilgi: x.p.hesap || null, uyarilar: x.uyarilar, sunucuSaati: l.some(k => k.sunucuSaati), sunucuSaatFarki: Number(x.h.sunucuSaatFarki) || 0,
      saatKipi: x.h.saatKipi === 'abd-yaz' ? 'abd-yaz' : 'sabit'
    };
  }

  r.post('/api/islem-defteri/onizle', yazmaKapisi, (req, res) => {
    try { res.json({ success: true, ...onizlemeOzeti(hazirla(req)) }); } catch (e) { hata(res, e, e.kod || 500); }
  });

  /**
   * 64.8 — geliştirme bilgisayarında sunucu kapalıyken önizleme: dosya BURADA ayrıştırılır (ayrıştırıcılar saf), hesap bilgisi sunucudaki
   * hesap listesinin son okunan kopyasından. Çift denetimi YAPILAMAZ (kayıtlar sunucuda) → açık uyarı. Kaydet kuyruğa girer.
   */
  async function yerelOnizle(govdeV) {
    const g = govdeV && typeof govdeV === 'object' ? govdeV : {};
    const h = ev ? await ev.hesap(String(g.hesap || '')) : null;
    if (!h) throw Object.assign(new Error('Sunucuya ulaşılamıyor ve hesap bilgisi daha önce okunmamış — sunucu açılınca yeniden deneyin.'), { kod: 503 });
    const D = depo.durumKur([{ tur: 'hesap', id: h.id, ad: h.ad, hesapTuru: h.hesapTuru, paraBirimi: h.paraBirimi, sunucuSaatFarki: Number(h.sunucuSaatFarki) || 0, saatKipi: h.saatKipi, aktif: h.aktif !== false }]);
    const oz = onizlemeOzeti(hazirla({ body: g }, D));
    oz.uyarilar = ['Sunucu kapalı — çift denetimi sunucu açılınca yapılır; satır sayıları değişebilir (sunucuda zaten kayıtlı satırlar eklenmez). "Kaydet" değişikliği kuyruğa alır.', ...(oz.uyarilar || [])];
    return { success: true, ...oz, ciftDenetimi: false };
  }

  r.post('/api/islem-defteri/yukle', yazmaKapisi, (req, res) => {
    try {
      const x = hazirla(req);
      const oz = onizlemeOzeti(x);
      if (!x.plan.yeni.length) return res.json({ success: true, ...oz, eklenen: 0, yukleme: null, mesaj: 'eklenecek yeni satır yok (hepsi çift ya da hatalı)' });
      const yk = { tur: 'yukleme', hesap: x.h.id, kaynak: x.tani.kaynak, bicim: oz.bicim, dosyaAdi: x.dosyaAdi, sha256: x.sha, kodlama: x.kodlama, satir: oz.satir,
        eklenen: x.plan.yeni.length, cift: x.plan.cift, bastirilan: x.plan.bastirilan || 0, yenidenAl: !!x.yenidenAl, atlanan: oz.atlanan, hata: oz.hata, aralik: oz.aralik };
      const eklenen = depo.ekle([yk, ...x.plan.yeni.map(k => ({ ...k, yukleme: '@ilk' }))], { simdi: simdi() });
      log('INFO', `İşlem defteri: ${x.h.ad} — ${M.KAYNAK_AD[x.tani.kaynak] || x.tani.kaynak} ${x.plan.yeni.length} satır eklendi (${x.plan.cift} çift).`);
      res.json({ success: true, ...oz, eklenen: x.plan.yeni.length, yukleme: eklenen[0].id });
    } catch (e) { hata(res, e, e.kod || 500); }
  });

  r.post('/api/islem-defteri/yukleme/:id/geri-al', yazmaKapisi, (req, res) => {
    try {
      const D = depo.yukle();
      const y = D.yuklemeler.get(req.params.id);
      if (!y) return hata(res, new Error('yükleme bulunamadı'), 404);
      if (y.geriAlindi) return hata(res, new Error('bu yükleme zaten geri alındı'));
      depo.ekle([{ tur: 'geri-al', yukleme: y.id, neden: String(govde(req).neden || '').slice(0, 200) }], { simdi: simdi() });
      // OKX dosyası geri alındı: dosyanın çifti sayılıp atlanan API dolumları geri gelsin diye sonraki eşitleme 3 ayı baştan tarar
      if (y.kaynak === 'okx-csv') okxDurumYaz(y.hesap, { tamTarama: true });
      // 65.0: Binance dosyası geri alındı → dosyanın çifti diye atlanan API satırları geri gelsin: vadeli derinliğin tamamı, spot bilinen semboller baştan
      const bnTam = /^binance-.*-csv$/.test(String(y.kaynak || ''));
      if (bnTam) binanceDurumYaz(y.hesap, { tamTarama: true });
      res.json({ success: true, geriAlinan: y.id, hesap: y.hesap, satir: y.eklenen, okxTamTarama: y.kaynak === 'okx-csv', binanceTamTarama: bnTam });   // F7: hesap → geliştirme bilgisayarı kendi imlecini de sıfırlar
    } catch (e) { hata(res, e, 500); }
  });

  r.post('/api/islem-defteri/kayit/:id/iptal', yazmaKapisi, (req, res) => {
    try {
      const D = depo.yukle();
      const k = D.veri.find(x => x.id === req.params.id);
      if (!k) return hata(res, new Error('kayıt bulunamadı (ya da zaten etkisiz)'), 404);
      depo.ekle([{ tur: 'iptal', hedef: k.id, neden: String(govde(req).neden || '').slice(0, 200) }], { simdi: simdi() });
      res.json({ success: true, iptal: k.id });
    } catch (e) { hata(res, e, 500); }
  });

  // ── OKX salt okuma anahtarı ve eşitleme ──────────────────────────────────────
  r.post('/api/islem-defteri/okx/anahtar', okxKapisi, async (req, res) => {
    const g = govde(req);
    try {
      const h = await okxHesabi(String(g.hesap || ''));
      if (!h || h.hesapTuru !== 'kripto-okx') return hata(res, new Error(evOkxF() ? 'OKX hesabı seçin (hesap sunucudaki listeden okunur — sunucu kapalıysa ve liste hiç okunmadıysa sunucu açılınca yeniden deneyin)' : 'OKX hesabı seçin'));
      const anahtar = { apiKey: String(g.apiKey || '').trim(), secret: String(g.secret || '').trim(), passphrase: String(g.passphrase || '') };
      const b = OKX.anahtarBicimi(anahtar);
      if (b) return hata(res, new Error(b));
      let izin;
      // Hata metni yalnız OKX.guvenliMesaj: ham e.message (undici başlık hatası) passphrase / secret içerebilir
      try { izin = await OKX.izinOku(anahtar, { fetch: okxFetch, simdi }); } catch (e) { return hata(res, new Error(`Anahtar denenemedi: ${OKX.guvenliMesaj(e)}`)); }
      if (izin.durum === 'yasak') return hata(res, new Error(`Bu anahtarın izinleri: ${izin.izinler.map(x => x.replace(/[^a-z0-9_]/g, '').slice(0, 30)).join(', ')}. İşlem defteri YALNIZ "Read" (salt okuma, read_only) izinli anahtar kabul eder (trade, withdraw ya da tanınmayan başka bir izin varsa reddedilir) — OKX'te yalnız Read seçili yeni bir anahtar oluşturun; bu anahtar KAYDEDİLMEDİ.`), 422);
      if (izin.durum === 'bilinmiyor' && g.saltOkumaOnay !== true) return res.status(409).json({ success: false, onayGerekli: true, error: 'OKX anahtarın izinlerini bildirmedi. Anahtarı OKX\'te yalnız "Read" izniyle oluşturduğunuzu doğrulayın ve "yalnız okuma izinli olduğunu doğruladım" kutusunu işaretleyin.' });
      const s = sirlar.oku() || {};
      const okx = { ...(s.okx || {}) };
      okx[h.id] = { ...anahtar, izinler: izin.izinler, izinDurumu: izin.durum, kayit: new Date(simdi()).toISOString(), elleOnay: izin.durum === 'bilinmiyor' };
      sirlar.yaz({ ...s, okx });
      log('INFO', `İşlem defteri: ${h.ad} için OKX salt okuma anahtarı kaydedildi (izinler: ${izin.izinler.join(', ') || 'bilinmiyor'}).`);
      res.json({ success: true, anahtar: true, izinler: izin.izinler, izinDurumu: izin.durum });
    } catch (e) { hata(res, new Error(OKX.guvenliMesaj(e)), 500); }
  });

  r.post('/api/islem-defteri/okx/anahtar-sil', okxKapisi, (req, res) => {
    try {
      const id = String(govde(req).hesap || '');
      const s = sirlar.oku() || {};
      const okx = { ...(s.okx || {}) };
      if (!okx[id]) return hata(res, new Error('bu hesapta kayıtlı anahtar yok'), 404);
      delete okx[id];
      sirlar.yaz({ ...s, okx });
      log('INFO', 'İşlem defteri: OKX anahtarı silindi.');
      res.json({ success: true, anahtar: false });
    } catch (e) { hata(res, e, 500); }
  });

  /** Bir OKX hesabını eşitler (artımlı). Döndürür { eklenen, ozet }. */
  async function okxEsitle(hesapId) {
    if (esitleniyor.has(hesapId)) throw OKX.guvenliHata('bu hesap zaten eşitleniyor');
    const anahtar = okxSir()[hesapId];
    if (!anahtar) throw OKX.guvenliHata('bu hesapta OKX anahtarı kayıtlı değil');
    esitleniyor.add(hesapId);
    try {
      const D = depo.yukle();
      const h = D.hesaplar.get(hesapId);
      if (!h) throw OKX.guvenliHata('hesap bulunamadı');
      const dur0 = okxDurum()[hesapId] || {};
      const e = await OKX.esitle({ anahtar, D, hesapId, fetch: okxFetch, simdi, bekle: ops.bekle, log, imlec: dur0.imlec || null, tamTarama: !!dur0.tamTarama, sayfaTavan: ops.okxSayfaTavan });
      const D2 = depo.yukle();
      const plan = depo.iceAktarPlan(D2, hesapId, 'okx-api', e.kayitlar);
      let yid = null;
      if (plan.yeni.length) {
        const zl = plan.yeni.map(k => k.zaman);
        const yk = { tur: 'yukleme', hesap: hesapId, kaynak: 'okx-api', bicim: 'OKX API v5 (fills-history + bills-archive)', dosyaAdi: null, sha256: null, kodlama: null,
          satir: e.kayitlar.length, eklenen: plan.yeni.length, cift: plan.cift, atlanan: e.ozet.atlanan, hata: plan.hatalar.length, aralik: { bas: Math.min(...zl), bit: Math.max(...zl) } };
        yid = depo.ekle([yk, ...plan.yeni.map(k => ({ ...k, yukleme: '@ilk' }))], { simdi: simdi() })[0].id;
      }
      const ozet = { istek: e.ozet.istek, eklenen: plan.yeni.length, cift: plan.cift, bastirilan: plan.bastirilan || 0, hata: plan.hatalar.length, atlananTur: e.ozet.atlananTur, tavan: e.ozet.tavan,
        tamTarama: !!dur0.tamTarama, uyarilar: e.ozet.uyarilar };
      for (const u of e.ozet.uyarilar) log('WARN', `İşlem defteri: OKX (${h.ad}): ${u}`);
      // İmleç (durak + kalan aralıklar) yalnız kayıtlar yazıldıktan sonra saklanır; tam tarama bir kez yapılır
      okxDurumYaz(hesapId, { sonEsitleme: new Date(simdi()).toISOString(), sonGun: A.gunAnahtari(simdi(), tzDk != null ? tzDk : -new Date().getTimezoneOffset()), sonHata: null, sonOzet: ozet,
        imlec: e.imlec, tamTarama: false });
      log('INFO', `İşlem defteri: OKX eşitlendi — ${h.ad}: ${plan.yeni.length} yeni satır (${e.ozet.istek} istek).`);
      return { eklenen: plan.yeni.length, yukleme: yid, ozet };
    } catch (e) {
      const m = OKX.guvenliMesaj(e);
      try { okxDurumYaz(hesapId, { sonHata: `${new Date(simdi()).toISOString().slice(0, 16).replace('T', ' ')} — ${m}` }); } catch (x) { /* */ }
      throw OKX.guvenliHata(m);
    } finally { esitleniyor.delete(hesapId); }
  }

  /**
   * 64.8 — GELİŞTİRME BİLGİSAYARINDA eşitleme: OKX'ten BU bilgisayarın anahtarıyla çeker (imleç bu bilgisayarın
   * data/islem-defteri/okx-durum.json'unda), satırları eve /okx/kayitlar ile yollar (sunucu kapalıysa kuyruk). Çift denetimi sunucuda.
   * İmleç yalnız satırlar sunucuya ulaştıktan ya da kuyruğa girdikten sonra ilerler; sunucu reddederse ilerlemez (sonraki eşitleme yeniden yollar,
   * sunucu çiftleri atlar).
   */
  async function okxEsitleEv(hesapId) {
    if (esitleniyor.has(hesapId)) throw OKX.guvenliHata('bu hesap zaten eşitleniyor');
    const anahtar = okxSir()[hesapId];
    if (!anahtar) throw OKX.guvenliHata('bu hesapta OKX anahtarı kayıtlı değil (bu bilgisayarda)');
    esitleniyor.add(hesapId);
    try {
      const h = await ev.hesap(hesapId);
      if (!h || h.hesapTuru !== 'kripto-okx') throw OKX.guvenliHata('hesap sunucudaki listede bulunamadı (sunucu kapalıysa ve liste hiç okunmadıysa sunucu açılınca yeniden deneyin)');
      const dur0 = okxDurum()[hesapId] || {};
      const bos = { anahtarlar: new Map(), bastirilan: new Map() };
      const e = await OKX.esitle({ anahtar, D: bos, hesapId, fetch: okxFetch, simdi, bekle: ops.bekle, log, imlec: dur0.imlec || null, tamTarama: !!dur0.tamTarama, sayfaTavan: ops.okxSayfaTavan });
      const top = { eklenen: 0, cift: 0, bastirilan: 0, hata: 0 };
      let kuyrukta = 0, gonderilen = 0;
      for (let i = 0; i < e.kayitlar.length; i += OKX_PARCA) {
        const parca = e.kayitlar.slice(i, i + OKX_PARCA);
        const r = await ev.gonder('/api/islem-defteri/okx/kayitlar', { hesap: hesapId, kayitlar: parca, ozet: { istek: e.ozet.istek, atlanan: e.ozet.atlanan, uyarilar: e.ozet.uyarilar } });
        if (r.tur === 'kurulu-degil') throw OKX.guvenliHata('yazma bağlantısı kurulu değil — sunucuda `npm run gelistirme-jeton`, burada `npm run sunucu-baglanti -- --yazma-jeton <jeton>`');
        if (r.tur === 'red') throw OKX.guvenliHata(`sunucudaki panel satırları kabul etmedi: ${String((r.govde && r.govde.error) || r.durum).slice(0, 200)}`);
        if (r.tur === 'ulasilamadi') throw OKX.guvenliHata(`sunucudaki panele ulaşılamadı: ${String(r.hata || '').slice(0, 200)}`);
        if (r.tur === 'kuyrukta') { kuyrukta++; continue; }
        gonderilen++;
        for (const a of Object.keys(top)) top[a] += Number(r.govde && r.govde[a]) || 0;
      }
      const ozet = { istek: e.ozet.istek, cekilen: e.kayitlar.length, eklenen: kuyrukta ? null : top.eklenen, cift: top.cift, bastirilan: top.bastirilan, hata: top.hata,
        kuyrukta: kuyrukta > 0, atlananTur: e.ozet.atlananTur, tavan: e.ozet.tavan, tamTarama: !!dur0.tamTarama, uyarilar: e.ozet.uyarilar, bilgisayar: 'gelistirme' };
      okxDurumYaz(hesapId, { sonEsitleme: new Date(simdi()).toISOString(), sonGun: A.gunAnahtari(simdi(), tzDk != null ? tzDk : -new Date().getTimezoneOffset()), sonHata: null, sonOzet: ozet,
        imlec: e.imlec, tamTarama: false });
      log('INFO', `İşlem defteri: OKX (bu bilgisayarın anahtarı) — ${h.ad}: ${e.kayitlar.length} satır çekildi, ${kuyrukta ? 'kuyruğa alındı (sunucu kapalı)' : `sunucuda ${top.eklenen} yeni`}.`);
      return { eklenen: ozet.eklenen, kuyrukta: kuyrukta > 0, cekilen: e.kayitlar.length, ozet };
    } catch (e) {
      const m = OKX.guvenliMesaj(e);
      try { okxDurumYaz(hesapId, { sonHata: `${new Date(simdi()).toISOString().slice(0, 16).replace('T', ' ')} — ${m}` }); } catch (x) { /* */ }
      throw OKX.guvenliHata(m);
    } finally { esitleniyor.delete(hesapId); }
  }

  r.post('/api/islem-defteri/okx/esitle', okxKapisi, async (req, res) => {
    const id = String(govde(req).hesap || '');
    try { res.json({ success: true, ...(await (evOkxF() ? okxEsitleEv(id) : okxEsitle(id))) }); } catch (e) { hata(res, new Error(OKX.guvenliMesaj(e)), 400); }
  });

  /**
   * 64.8 — EVDE: geliştirme bilgisayarının kendi OKX anahtarıyla çektiği satırlar. Yalnız kayıt alanları alınır (kimlik, sıra, hesap,
   * anahtar, yükleme yeniden yazılır; kaynak her zaman okx-api). Çift denetimi sunucudaki eşitlemeyle AYNI (depo.iceAktarPlan).
   */
  r.post('/api/islem-defteri/okx/kayitlar', yazmaKapisi, (req, res) => {
    try {
      const g = govde(req);
      const D = depo.yukle();
      const h = D.hesaplar.get(String(g.hesap || ''));
      if (!h || h.hesapTuru !== 'kripto-okx') return hata(res, new Error('OKX hesabı bulunamadı (sunucudaki hesap kimliği)'), 404);
      if (!Array.isArray(g.kayitlar)) return hata(res, new Error('kayitlar dizisi gerekli'));
      if (g.kayitlar.length > OKX_KAYIT_TAVAN) return hata(res, new Error(`tek seferde en çok ${OKX_KAYIT_TAVAN} satır`), 413);
      // F9: yalnız okxApi.js'in ürettiği alanlar, uzunluk sınırlı; tür ve kaynak kimliği OKX biçiminde olmalı
      const temiz = [], reddedilen = [];
      g.kayitlar.forEach((k, i) => { const t = okxKaydiTemizle(k); if (t.kayit) temiz.push(t.kayit); else reddedilen.push({ sira: i + 1, mesaj: t.hata }); });
      const plan = depo.iceAktarPlan(D, h.id, 'okx-api', temiz);
      plan.hatalar = [...reddedilen, ...plan.hatalar];
      let yid = null;
      if (plan.yeni.length) {
        const zl = plan.yeni.map(k => k.zaman);
        const oz = g.ozet && typeof g.ozet === 'object' ? g.ozet : {};
        const yk = { tur: 'yukleme', hesap: h.id, kaynak: 'okx-api', bicim: 'OKX API v5 (fills-history + bills-archive) — geliştirme bilgisayarından', dosyaAdi: null, sha256: null, kodlama: null,
          satir: temiz.length, eklenen: plan.yeni.length, cift: plan.cift, atlanan: Number(oz.atlanan) || 0, hata: plan.hatalar.length, aralik: { bas: Math.min(...zl), bit: Math.max(...zl) } };
        yid = depo.ekle([yk, ...plan.yeni.map(k => ({ ...k, yukleme: '@ilk' }))], { simdi: simdi() })[0].id;
      }
      log('INFO', `İşlem defteri: OKX satırları geliştirme bilgisayarından — ${h.ad}: ${plan.yeni.length} yeni (${plan.cift} çift).`);
      res.json({ success: true, eklenen: plan.yeni.length, cift: plan.cift, bastirilan: plan.bastirilan || 0, hata: plan.hatalar.length, yukleme: yid });
    } catch (e) { hata(res, e, 500); }
  });


  // ── Binance salt okuma anahtarı ve eşitleme (65.0) ────────────────────────────────
  r.post('/api/islem-defteri/binance/anahtar', binanceKapisi, async (req, res) => {
    const g = govde(req);
    try {
      const h = await okxHesabi(String(g.hesap || ''));
      if (!h || h.hesapTuru !== 'kripto-binance') return hata(res, new Error(evOkxF() ? 'Binance hesabı seçin (hesap sunucudaki listeden okunur — sunucu kapalıysa ve liste hiç okunmadıysa sunucu açılınca yeniden deneyin)' : 'Binance hesabı seçin'));
      const anahtar = { apiKey: String(g.apiKey || '').trim(), secret: String(g.secret || '').trim() };
      const b = BN.anahtarBicimi(anahtar);
      if (b) return hata(res, new Error(b));
      const c = BN.baglam({ fetch: binanceFetch, simdi, bekle: ops.bekle });
      let izin;
      // Hata metni yalnız BN.guvenliMesaj: ham e.message (undici başlık hatası) anahtarı içerebilir
      try { await c.saatEsitle(); izin = await BN.izinOku(anahtar, { c }); } catch (e) { return hata(res, new Error(`Anahtar denenemedi: ${BN.guvenliMesaj(e)}`)); }
      if (izin.durum === 'yasak') return hata(res, new Error(`Bu anahtarda açık izinler: ${izin.izinler.join(', ')}. İşlem defteri YALNIZ "Okumayı etkinleştir" (Enable Reading) izni açık anahtar kabul eder — ${izin.yasaklar.join(', ')} kapalı olmalı (Binance'in tanımadığımız yeni bir izni de açıksa reddedilir). Binance'te yalnız okuma izinli yeni bir anahtar oluşturun; bu anahtar KAYDEDİLMEDİ.`), 422);
      if (izin.durum !== 'salt-okuma') return hata(res, new Error('Bu anahtarda "Okumayı etkinleştir" (Enable Reading) izni açık değil — Binance hiçbir veriyi vermez. Anahtar KAYDEDİLMEDİ.'), 422);
      // DOĞRULANMADI: salt okuma anahtarıyla vadeli (fapi) okuması — ilk denemede açıkça yazılır
      const vd = await BN.vadeliDene(anahtar, { c });
      const s = sirlar.oku() || {};
      const binance = { ...(s.binance || {}) };
      binance[h.id] = { ...anahtar, izinler: izin.izinler, ipKisitli: !!izin.ipKisitli, kayit: new Date(simdi()).toISOString() };
      sirlar.yaz({ ...s, binance });
      binanceDurumYaz(h.id, { vadeli: { kabul: vd.kabul, hata: vd.kabul ? null : vd.hata, zaman: new Date(simdi()).toISOString() } });
      log('INFO', `İşlem defteri: ${h.ad} için Binance salt okuma anahtarı kaydedildi (izinler: ${izin.izinler.join(', ')}; vadeli okuma ${vd.kabul ? 'kabul edildi' : 'REDDEDİLDİ'}).`);
      if (!vd.kabul) log('WARN', `İşlem defteri: vadeli okuma için Binance bu anahtarı kabul etmedi: ${vd.hata}`);
      res.json({ success: true, anahtar: true, izinler: izin.izinler, ipKisitli: !!izin.ipKisitli, vadeliOkuma: vd.kabul, vadeliHata: vd.kabul ? null : vd.hata,
        uyari: vd.kabul ? null : `Vadeli okuma için Binance bu anahtarı kabul etmedi: ${vd.hata} — spot işlemleri eşitlenir; vadeli geçmiş dosyayla yüklenebilir.` });
    } catch (e) { hata(res, new Error(BN.guvenliMesaj(e)), 500); }
  });

  r.post('/api/islem-defteri/binance/anahtar-sil', binanceKapisi, (req, res) => {
    try {
      const id = String(govde(req).hesap || '');
      const s = sirlar.oku() || {};
      const binance = { ...(s.binance || {}) };
      if (!binance[id]) return hata(res, new Error('bu hesapta kayıtlı anahtar yok'), 404);
      delete binance[id];
      sirlar.yaz({ ...s, binance });
      log('INFO', 'İşlem defteri: Binance anahtarı silindi.');
      res.json({ success: true, anahtar: false });
    } catch (e) { hata(res, e, 500); }
  });

  /** Eşitleme sonucunun vadeli okuma durumu (kart: "vadeli okuma: kabul edildi ✓" ya da Binance'in reddi). */
  const vadeliDurumu = (e) => ({ kabul: !e.ozet.vadeliRed, hata: e.ozet.vadeliRed || null, zaman: new Date(simdi()).toISOString() });
  const binanceOzeti = (e, ek) => ({ istek: e.ozet.istek, gelir: e.ozet.gelir, vadeliDolum: e.ozet.vadeliDolum, spotDolum: e.ozet.spotDolum, atlananTur: e.ozet.atlananTur,
    tarama: e.ozet.tarama, vadeliRed: e.ozet.vadeliRed, spotRed: e.ozet.spotRed, bekleme: e.ozet.bekleme, bekleSn: Math.round((e.ozet.bekleMs || 0) / 1000), agirlik: e.ozet.agirlik,
    uyarilar: e.ozet.uyarilar, ...ek });

  /** Bir Binance hesabını eşitler (artımlı; spot tam tarama eşitleme başına en çok spotCiftTavan çift). Döndürür { eklenen, ozet }. */
  async function binanceEsitle(hesapId) {
    if (esitleniyor.has(hesapId)) throw BN.guvenliHata('bu hesap zaten eşitleniyor');
    const anahtar = binanceSir()[hesapId];
    if (!anahtar) throw BN.guvenliHata('bu hesapta Binance anahtarı kayıtlı değil');
    esitleniyor.add(hesapId);
    try {
      const D = depo.yukle();
      const h = D.hesaplar.get(hesapId);
      if (!h) throw BN.guvenliHata('hesap bulunamadı');
      const dur0 = binanceDurum()[hesapId] || {};
      const e = await BN.esitle({ anahtar, hesapId, D, fetch: binanceFetch, simdi, bekle: ops.bekle, log, imlec: dur0.imlec || null, tamTarama: !!dur0.tamTarama,
        spotCiftTavan: ops.binanceSpotCiftTavan, agirlikTavan: ops.binanceAgirlikTavan });
      const D2 = depo.yukle();
      const plan = depo.iceAktarPlan(D2, hesapId, 'binance-api', e.kayitlar);
      let yid = null;
      if (plan.yeni.length) {
        const zl = plan.yeni.map(k => k.zaman);
        const yk = { tur: 'yukleme', hesap: hesapId, kaynak: 'binance-api', bicim: 'Binance API (USDⓈ-M userTrades + income, spot myTrades)', dosyaAdi: null, sha256: null, kodlama: null,
          satir: e.kayitlar.length, eklenen: plan.yeni.length, cift: plan.cift, atlanan: e.ozet.atlanan, hata: plan.hatalar.length, aralik: { bas: Math.min(...zl), bit: Math.max(...zl) } };
        yid = depo.ekle([yk, ...plan.yeni.map(k => ({ ...k, yukleme: '@ilk' }))], { simdi: simdi() })[0].id;
      }
      const ozet = binanceOzeti(e, { eklenen: plan.yeni.length, cift: plan.cift, bastirilan: plan.bastirilan || 0, hata: plan.hatalar.length, tamTarama: !!dur0.tamTarama });
      for (const u of e.ozet.uyarilar) log('WARN', `İşlem defteri: Binance (${h.ad}): ${u}`);
      // İmleç yalnız kayıtlar yazıldıktan sonra saklanır; tam tarama işareti bir kez
      binanceDurumYaz(hesapId, { sonEsitleme: new Date(simdi()).toISOString(), sonGun: A.gunAnahtari(simdi(), tzDk != null ? tzDk : -new Date().getTimezoneOffset()), sonHata: null, sonOzet: ozet,
        imlec: e.imlec, tamTarama: false, vadeli: vadeliDurumu(e) });
      log('INFO', `İşlem defteri: Binance eşitlendi — ${h.ad}: ${plan.yeni.length} yeni satır (${plan.cift} çift, ${e.ozet.istek} istek).`);
      return { eklenen: plan.yeni.length, cift: plan.cift, yukleme: yid, ozet };
    } catch (e) {
      const m = BN.guvenliMesaj(e);
      try { binanceDurumYaz(hesapId, { sonHata: `${new Date(simdi()).toISOString().slice(0, 16).replace('T', ' ')} — ${m}` }); } catch (x) { /* */ }
      throw BN.guvenliHata(m);
    } finally { esitleniyor.delete(hesapId); }
  }

  /**
   * GELİŞTİRME BİLGİSAYARINDA Binance eşitlemesi: BU bilgisayarın anahtarıyla çeker (imleç bu bilgisayarın binance-durum.json'unda),
   * satırları sunucuya /binance/kayitlar ile yollar (sunucu kapalıysa kuyruk). Çift denetimi sunucuda. İmleç yalnız satırlar sunucuya
   * ulaştıktan ya da kuyruğa girdikten sonra ilerler.
   */
  async function binanceEsitleEv(hesapId) {
    if (esitleniyor.has(hesapId)) throw BN.guvenliHata('bu hesap zaten eşitleniyor');
    const anahtar = binanceSir()[hesapId];
    if (!anahtar) throw BN.guvenliHata('bu hesapta Binance anahtarı kayıtlı değil (bu bilgisayarda)');
    esitleniyor.add(hesapId);
    try {
      const h = await ev.hesap(hesapId);
      if (!h || h.hesapTuru !== 'kripto-binance') throw BN.guvenliHata('hesap sunucudaki listede bulunamadı (sunucu kapalıysa ve liste hiç okunmadıysa sunucu açılınca yeniden deneyin)');
      const dur0 = binanceDurum()[hesapId] || {};
      const bos = { anahtarlar: new Map(), bastirilan: new Map(), veri: [] };
      const e = await BN.esitle({ anahtar, hesapId, D: bos, fetch: binanceFetch, simdi, bekle: ops.bekle, log, imlec: dur0.imlec || null, tamTarama: !!dur0.tamTarama,
        spotCiftTavan: ops.binanceSpotCiftTavan, agirlikTavan: ops.binanceAgirlikTavan });
      const top = { eklenen: 0, cift: 0, bastirilan: 0, hata: 0 };
      let kuyrukta = 0;
      for (let i = 0; i < e.kayitlar.length; i += OKX_PARCA) {
        const parca = e.kayitlar.slice(i, i + OKX_PARCA);
        const r2 = await ev.gonder('/api/islem-defteri/binance/kayitlar', { hesap: hesapId, kayitlar: parca, ozet: { istek: e.ozet.istek, atlanan: e.ozet.atlanan, uyarilar: e.ozet.uyarilar } });
        if (r2.tur === 'kurulu-degil') throw BN.guvenliHata('yazma bağlantısı kurulu değil — sunucuda `npm run gelistirme-jeton`, burada `npm run sunucu-baglanti -- --yazma-jeton <jeton>`');
        if (r2.tur === 'red') throw BN.guvenliHata(`sunucudaki panel satırları kabul etmedi: ${String((r2.govde && r2.govde.error) || r2.durum).slice(0, 200)}`);
        if (r2.tur === 'ulasilamadi') throw BN.guvenliHata(`sunucudaki panele ulaşılamadı: ${String(r2.hata || '').slice(0, 200)}`);
        if (r2.tur === 'kuyrukta') { kuyrukta++; continue; }
        for (const a of Object.keys(top)) top[a] += Number(r2.govde && r2.govde[a]) || 0;
      }
      const ozet = binanceOzeti(e, { cekilen: e.kayitlar.length, eklenen: kuyrukta ? null : top.eklenen, cift: top.cift, bastirilan: top.bastirilan, hata: top.hata,
        kuyrukta: kuyrukta > 0, tamTarama: !!dur0.tamTarama, bilgisayar: 'gelistirme' });
      binanceDurumYaz(hesapId, { sonEsitleme: new Date(simdi()).toISOString(), sonGun: A.gunAnahtari(simdi(), tzDk != null ? tzDk : -new Date().getTimezoneOffset()), sonHata: null, sonOzet: ozet,
        imlec: e.imlec, tamTarama: false, vadeli: vadeliDurumu(e) });
      log('INFO', `İşlem defteri: Binance (bu bilgisayarın anahtarı) — ${h.ad}: ${e.kayitlar.length} satır çekildi, ${kuyrukta ? 'kuyruğa alındı (sunucu kapalı)' : `sunucuda ${top.eklenen} yeni`}.`);
      return { eklenen: ozet.eklenen, kuyrukta: kuyrukta > 0, cekilen: e.kayitlar.length, ozet };
    } catch (e) {
      const m = BN.guvenliMesaj(e);
      try { binanceDurumYaz(hesapId, { sonHata: `${new Date(simdi()).toISOString().slice(0, 16).replace('T', ' ')} — ${m}` }); } catch (x) { /* */ }
      throw BN.guvenliHata(m);
    } finally { esitleniyor.delete(hesapId); }
  }

  r.post('/api/islem-defteri/binance/esitle', binanceKapisi, async (req, res) => {
    const id = String(govde(req).hesap || '');
    try { res.json({ success: true, ...(await (evOkxF() ? binanceEsitleEv(id) : binanceEsitle(id))) }); } catch (e) { hata(res, new Error(BN.guvenliMesaj(e)), 400); }
  });

  /** SUNUCUDA: geliştirme bilgisayarının kendi Binance anahtarıyla çektiği satırlar (çift denetimi sunucudaki eşitlemeyle AYNI). */
  r.post('/api/islem-defteri/binance/kayitlar', yazmaKapisi, (req, res) => {
    try {
      const g = govde(req);
      const D = depo.yukle();
      const h = D.hesaplar.get(String(g.hesap || ''));
      if (!h || h.hesapTuru !== 'kripto-binance') return hata(res, new Error('Binance hesabı bulunamadı (sunucudaki hesap kimliği)'), 404);
      if (!Array.isArray(g.kayitlar)) return hata(res, new Error('kayitlar dizisi gerekli'));
      if (g.kayitlar.length > OKX_KAYIT_TAVAN) return hata(res, new Error(`tek seferde en çok ${OKX_KAYIT_TAVAN} satır`), 413);
      const temiz = [], reddedilen = [];
      g.kayitlar.forEach((k, i) => { const t = binanceKaydiTemizle(k); if (t.kayit) temiz.push(t.kayit); else reddedilen.push({ sira: i + 1, mesaj: t.hata }); });
      const plan = depo.iceAktarPlan(D, h.id, 'binance-api', temiz);
      plan.hatalar = [...reddedilen, ...plan.hatalar];
      let yid = null;
      if (plan.yeni.length) {
        const zl = plan.yeni.map(k => k.zaman);
        const oz = g.ozet && typeof g.ozet === 'object' ? g.ozet : {};
        const yk = { tur: 'yukleme', hesap: h.id, kaynak: 'binance-api', bicim: 'Binance API (USDⓈ-M userTrades + income, spot myTrades) — geliştirme bilgisayarından', dosyaAdi: null, sha256: null, kodlama: null,
          satir: temiz.length, eklenen: plan.yeni.length, cift: plan.cift, atlanan: Number(oz.atlanan) || 0, hata: plan.hatalar.length, aralik: { bas: Math.min(...zl), bit: Math.max(...zl) } };
        yid = depo.ekle([yk, ...plan.yeni.map(k => ({ ...k, yukleme: '@ilk' }))], { simdi: simdi() })[0].id;
      }
      log('INFO', `İşlem defteri: Binance satırları geliştirme bilgisayarından — ${h.ad}: ${plan.yeni.length} yeni (${plan.cift} çift).`);
      res.json({ success: true, eklenen: plan.yeni.length, cift: plan.cift, bastirilan: plan.bastirilan || 0, hata: plan.hatalar.length, yukleme: yid });
    } catch (e) { hata(res, e, 500); }
  });

  /**
   * 64.8 — geliştirme bilgisayarında sunucudan okunan /ozet yanıtına bu bilgisayarın OKX durumu yazılır (anahtar burada; sunucudaki
   * anahtar `evAnahtar` olarak kalır: günlük otomatik eşitleme yalnız sunucuda ve yalnız sunucuda anahtar varsa).
   */
  function evOzetiTamamla(g) {
    if (!g || !Array.isArray(g.hesaplar)) return g;
    const sir = okxSir(), dur = okxDurum();
    const bsir = binanceSir(), bdur = binanceDurum();
    for (const h of g.hesaplar) {
      if (h && h.hesapTuru === 'kripto-binance') {
        const evdeki = h.binance || {};
        h.binance = { ...binanceDisari(bsir[h.id], bdur[h.id]), bilgisayar: 'gelistirme', evAnahtar: !!evdeki.anahtar, evSonEsitleme: evdeki.sonEsitleme || null };
        continue;
      }
      if (!h || h.hesapTuru !== 'kripto-okx') continue;
      const evdeki = h.okx || {};
      const s = sir[h.id], d = dur[h.id] || {};
      h.okx = { anahtar: !!s, izinler: s ? (s.izinler || []) : [], izinDurumu: s ? s.izinDurumu : null, sonEsitleme: d.sonEsitleme || null, sonHata: d.sonHata || null,
        sonOzet: d.sonOzet || null, tamTarama: !!d.tamTarama, bilgisayar: 'gelistirme', evAnahtar: !!evdeki.anahtar, evSonEsitleme: evdeki.sonEsitleme || null };
    }
    return g;
  }

  /**
   * Günlük otomatik eşitleme (yalnız sunucu — server.js araştırma modunda çağırmaz; saatte bir çağrılır): bugün eşitlenmemiş her etkin
   * OKX ve Binance hesabı. 65.0 Binance: spot tam tarama bitmediyse bugün eşitlenmiş olsa da her saat kaldığı yerden sürer.
   */
  async function gunlukEsitle() {
    if (arastirmaOkx) return [];
    const D = depo.yukle();
    const sir = okxSir(), dur = okxDurum();
    const bsir = binanceSir(), bdur = binanceDurum();
    const bugun = A.gunAnahtari(simdi(), tzDk != null ? tzDk : -new Date().getTimezoneOffset());
    const sonuc = [];
    for (const h of D.hesaplar.values()) {
      if (h.hesapTuru === 'kripto-binance' && h.aktif !== false && bsir[h.id]) {
        const d = bdur[h.id] || {};
        const taramaDevam = !!(d.imlec && d.imlec.spot && d.imlec.spot.tarama);
        if (d.sonGun === bugun && !taramaDevam) continue;
        try { sonuc.push({ hesap: h.id, borsa: 'binance', ...(await binanceEsitle(h.id)) }); } catch (e) { const m = BN.guvenliMesaj(e); log('WARN', `İşlem defteri: Binance günlük eşitleme (${h.ad}) başarısız: ${m}`); sonuc.push({ hesap: h.id, borsa: 'binance', hata: m }); }
        continue;
      }
      if (h.hesapTuru !== 'kripto-okx' || h.aktif === false || !sir[h.id]) continue;
      if ((dur[h.id] || {}).sonGun === bugun) continue;
      try { sonuc.push({ hesap: h.id, ...(await okxEsitle(h.id)) }); } catch (e) { const m = OKX.guvenliMesaj(e); log('WARN', `İşlem defteri: OKX günlük eşitleme (${h.ad}) başarısız: ${m}`); sonuc.push({ hesap: h.id, hata: m }); }
    }
    return sonuc;
  }

  /** F7: bu bilgisayarın OKX imleci için "sonraki eşitleme 3 ayı baştan tarasın" işareti (geliştirmede geri-al / reddedilen satırlar). */
  function okxTamTaramaIsaretle(hesapId) { if (hesapId) okxDurumYaz(String(hesapId), { tamTarama: true }); }
  /** 65.0: aynısı Binance için (vadeli derinliğin tamamı, spot bilinen semboller baştan; çift satırlar sunucuda düşer). */
  function binanceTamTaramaIsaretle(hesapId) { if (hesapId) binanceDurumYaz(String(hesapId), { tamTarama: true }); }

  return { router: r, gunlukEsitle, okxEsitle, okxEsitleEv, binanceEsitle, binanceEsitleEv, yerelOnizle, evOzetiTamamla, okxTamTaramaIsaretle, binanceTamTaramaIsaretle };
}

/**
 * F9 (denetim 64.8): /okx/kayitlar'a gelen bir satırı okxApi.js dolumKaydi/billKaydi çıktısının alanlarına indirger.
 * Tür: islem (dolum) · kz · ucret · fonlama · para-giris · para-cikis. kaynakId "bill:<billId>[:fee]" ya da "bill:<instId>:<tradeId>".
 * Metinler kısaltılır, `ham` yalnız düz anahtar/değer (≤ 20 alan, değer ≤ 64 karakter). Döndürür { kayit } ya da { hata }.
 */
const OKX_TURLER = new Set(['islem', 'kz', 'ucret', 'fonlama', 'para-giris', 'para-cikis']);
const OKX_KAYNAK_ID = /^bill:[A-Za-z0-9_.-]{1,64}(:[A-Za-z0-9_.-]{1,64})?(:fee)?$/;
function okxKaydiTemizle(k) {
  if (!k || typeof k !== 'object' || Array.isArray(k)) return { hata: 'satır nesne değil' };
  if (!OKX_TURLER.has(k.tur)) return { hata: `OKX satırı olmayan tür: ${String(k.tur).slice(0, 20)}` };
  if (typeof k.kaynakId !== 'string' || !OKX_KAYNAK_ID.test(k.kaynakId)) return { hata: 'kaynak kimliği OKX biçiminde değil (bill:…)' };
  const metin = (v, n) => (v == null ? null : String(v).slice(0, n));
  const sayi = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const x = { tur: k.tur, kaynak: 'okx-api', kaynakId: k.kaynakId, zaman: sayi(k.zaman), sembol: metin(k.sembol, 40), piyasa: metin(k.piyasa, 12), para: metin(k.para, 12) };
  if (k.tur === 'islem') {
    Object.assign(x, { islemTuru: 'dolum', yon: k.yon === 'al' || k.yon === 'sat' ? k.yon : null, miktar: sayi(k.miktar), fiyat: sayi(k.fiyat), kontrat: metin(k.kontrat, 40),
      gerceklesenKar: sayi(k.gerceklesenKar), pozisyonYonu: k.pozisyonYonu === 'long' || k.pozisyonYonu === 'short' ? k.pozisyonYonu : null, pozisyonId: null });
    if (k.ucret && typeof k.ucret === 'object') x.ucret = { tutar: sayi(k.ucret.tutar) != null ? k.ucret.tutar : 0, para: metin(k.ucret.para, 12) || '' };
  } else {
    x.tutar = sayi(k.tutar);
    if (k.not != null) x.not = metin(k.not, 120);
  }
  if (k.ham && typeof k.ham === 'object' && !Array.isArray(k.ham)) {
    const h = {};
    for (const [a, v] of Object.entries(k.ham).slice(0, 20)) if (/^[A-Za-z]{1,24}$/.test(a) && (v == null || ['string', 'number', 'boolean'].includes(typeof v))) h[a] = typeof v === 'string' ? v.slice(0, 64) : v;
    x.ham = h;
  }
  return { kayit: x };
}

/**
 * 65.0: /binance/kayitlar'a gelen satırı binanceApi.js vadeliDolumKaydi / spotDolumKaydi / gelirKaydi alanlarına indirger.
 * kaynakId "t:<sembol>:<id>" (dolum) ya da "tx:<tranId>:<TÜR>:<PARA>" / "gelir:…" (hareket); kaynak her zaman binance-api.
 */
const BN_KAYNAK_ID = /^(t:[A-Z0-9]{1,24}\/[A-Z0-9]{1,12}(:[A-Z0-9]{1,12})?:\d{1,24}|tx:[0-9A-Za-z_-]{1,40}:[A-Z0-9_]{1,40}:[A-Z0-9]{1,16}|gelir:[A-Z0-9_]{1,40}:\d{1,16}:[A-Z0-9]{0,16}:[A-Z0-9]{0,24}:-?[0-9.e+-]{1,32})$/;
function binanceKaydiTemizle(k) {
  if (!k || typeof k !== 'object' || Array.isArray(k)) return { hata: 'satır nesne değil' };
  if (!OKX_TURLER.has(k.tur)) return { hata: `Binance satırı olmayan tür: ${String(k.tur).slice(0, 20)}` };
  if (typeof k.kaynakId !== 'string' || !BN_KAYNAK_ID.test(k.kaynakId)) return { hata: 'kaynak kimliği Binance biçiminde değil (t:… / tx:…)' };
  if ((k.tur === 'islem') !== k.kaynakId.startsWith('t:')) return { hata: 'tür ile kaynak kimliği uyuşmuyor' };
  const t = okxKaydiTemizle({ ...k, kaynakId: 'bill:0' });
  if (!t.kayit) return t;
  return { kayit: { ...t.kayit, kaynak: 'binance-api', kaynakId: k.kaynakId } };
}

module.exports = { kur, ARASTIRMA_MESAJI, DOSYA_TAVAN, OKX_PARCA, OKX_KAYIT_TAVAN, okxKaydiTemizle, binanceKaydiTemizle };
