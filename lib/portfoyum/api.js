/**
 * PORTFÖYÜM — HTTP UÇLARI `/api/portfoyum/*` (sürüm 60.8; panel: public/js/pages/portfoyum.js, kurCevirici.js)
 * ═══════════════════════════════════════════════════════════════════════════
 * GET (telefonda da açık — yalnız okuma):
 *   /api/portfoyum/ozet                 durum + değerleme + getiri + dağılım + uyarılar (bugünün anlık görüntüsü yoksa üretir)
 *                                       Yeni panel F3: ?portfoy=<id>|tumu → değerleme, getiri, dağılım (o portföyün hedefiyle) yalnız o
 *                                       portföyün "toplama dahil" hesaplarından + kapsam satırı; parametresiz = eski davranış (bütün hesaplar).
 *                                       Her yanıtta portfoyler (Ben + eklenenler) ve portfoyOzetleri (portföy başına toplam, hedef var mı).
 *   /api/portfoyum/gecmis?portfoy= · /api/portfoyum/rapor?portfoy=   aynı portföy süzgeci (kümenin dışıyla transfer = dış akış)
 *   /api/portfoyum/islemler?hesap&islem&varlik&bas&bit&durum(etkin|iptal|hepsi; eski iptal=0 = etkin)   işlem defteri (iptaller işaretli;
 *                                       _gunSira: aynı gün ≥ 2 işlemde muhasebe sırası)
 *   /api/portfoyum/islemler.csv?…       aynı süzgeçle CSV (UTF-8 BOM, ';' ayraç)
 *   /api/portfoyum/gecmis?hesap=        günlük değer serisi (USD, TL, TWR endeksi) + anlık görüntü günleri; hesap verilirse yalnız o hesap (62.4)
 *   /api/portfoyum/kiyas?bas=&birim=    62.4: grafiğin kıyas çizgileri (QQQ, BIST 30, TL mevduat, dolar, TÜFE, BTC), bas gününden 100 tabanlı
 *   /api/portfoyum/rapor?ay=YYYY-AA|buay&hesap=   64.2 (P6) Rapor sekmesi: aylık rapor, başlangıçtan getiri, katkılar, stres,
 *                                       korelasyon (lib/portfoyum/rapor.js — saf; ağa çıkmaz, dosya yazmaz)
 *   /api/portfoyum/kur?yenile=1         kur çevirici tablosu (USD, TRY, EUR, GBP, gram altın, BTC; kaynak + saat)
 *   (61.1, Ö11: "Laboratuvar kararından içe al" kaldırıldı — Portföyüm hedefine içe alma yalnız Portföy › Bu ay'dan.)
 *   (67.5: /api/portfoyum/laboratuvar/girdi kaldırıldı — yalnız kaldırılan "Olsaydı planı" kullanıyordu; labGirdisi saf kaldı)
 * POST / PUT (YALNIZ bu bilgisayardaki masaüstü panel; telefon kademesinde lib/guvenlik.js 403 verir — beyaz listede YOK):
 *   POST /kurum {ad} · PUT /kurum/:id {ad} · POST /hesap {kurum, ad, hesapTuru, para} · PUT /hesap/:id {ad}
 *   POST /hesap/:id/kapat {tarih} · 64.2 POST /hesap/:id/faiz {oran, vadeGun, stopaj, vadeBaslangic, yenile} (mevduat faizi ayarı;
 *   POST /hesap da isteğe bağlı faiz:{…} alır — hesap + ayar tek pakette) · POST /varlik {sembol, ad, sinif, para, kaynak, kod} · PUT /varlik/:id {ad?, sinif?, kaynak?, kod?}
 *   POST /islem {…, acilisSonrasi?, gunIciSira?, tasarimciKayitlari?: 'dahil'|'sonra', onay?, nakitAcilisiEkle?} — 409 + soru: açılış
 *        günündeki işlem (dahil mi / sonra mı?), sonradan girilen açılış günü Tasarımcı kaydı varsa 'acilis-tasarimci' (cevap açılışa
 *        dahilEdilen: [kimlik] olarak yazılır) ve
 *        açılışa dahil işlemin nakit bacağı nakit açılışı olmayan çifte düşüyorsa ("aynı tarihe 0 nakit açılışı ekle" önerisi)
 *   POST /kayit/:id/iptal {neden} (TERS KAYIT) · POST /fiyat {varlik, tarih, fiyat} · POST /hedef {duzey, agirliklar, bant, kaynak, portfoy?}
 *   Yeni panel F3: POST /portfoy {ad} · PUT /portfoy/:id {ad} · POST /hesap/:id/portfoy {portfoy | yeniPortfoyAd} (portföy yoksa aynı
 *        pakette oluşturur — ör. eşin hesabı → yeni "Eş" portföyü tek adım) · POST /hesap/:id/kapsam {dahil} · POST /hesap {…, portfoy?}
 *   POST /csv/onizle {metin} · POST /csv/ice-aktar {metin} · POST /fiyat-yenile (ağ: Yahoo/TEFAS/Binance + kurlar)
 *   61.2 hızlı ekleme: POST /sembol-bul {q} (ağ: Yahoo künye, BIST .IS, ad araması) · POST /hizli-ekle {hesap | yeniHesap {kurumAd, ad},
 *        aday, adet, birimMaliyet} (kurum/hesap/varlık/açılış tek pakette, açılış DÜN; sonra fiyat geçmişi indirilir) ·
 *        POST /hizli-duzenle {acilis, adet, birimMaliyet, tarih?} (ters kayıt + yeni açılış; 67.2: alış tarihi de değişir — boş = eskisi).
 *        67.2: POST /hizli-ekle {…, tarih?} alış tarihi (boş = dün). /ozet `acilislar`: çift → { id, yalniz }.
 *   67.4 POST /hesap {kurumAd, …} kurum ADIYLA (yoksa aynı pakette açılır — Hesaplar › "Yeni hesap" kartı; hesapAcPlan).
 *        POST /hizli-ekle {kaynak: yahoo (vars.) | tefas {kod} | binance {kod} | altin | elle {sembol, ad, sinif, para, fiyat?} | nakit
 *        {para, tutar}, hesap, adet, birimMaliyet, tarih} — Hesaplar › "Varlık ekle" sekmeleri (açılış bakiyesi; varlık yoksa açılır,
 *        TEFAS kodu / Binance coin'i yazmadan önce doğrulanır, fiyat indirilir). Açılış soruları POST /islem ile aynı: 409
 *        'acilis-tasarimci' (tasarimciKayitlari: dahil|sonra) ve 'nakit-acilisi' (nakitAcilisiEkle | onay).
 *   67.3 POST /plan-kaydet {hesap, tarih?, yatirma?, satislar, alislar, onay?} — Hedefim › Para ekle planı tek pakette (yatırma + satış +
 *        alış; yeni sembolse varlık açılır + fiyat geçmişi); satış > elde → 400; nakit eksiye düşerse 409 soru 'nakit-eksi'.
 *   64.8 POST /tasima {kayitlar, onizle} — geliştirme bilgisayarındaki yerel Portföyüm kayıtlarının BİR KEZLİK taşınması (lib/portfoyum/tasima.js).
 *   64.8: geliştirme bilgisayarı (araştırma modu + sunucu bağlantısı) bu GET'leri sunucudan okur, yazmaları sunucuya iletir (lib/evOkuma.js, lib/evYazma.js);
 *   sunucuda bu yazma uçları geliştirme kademesine (lib/guvenlik.js GELISTIRME_YAZMA) de açıktır.
 * Telefon kademesinde GET'ler YALNIZ OKUR: /ozet anlık görüntü yazmaz, /kur ağdan tazelemez ve önbellek yazmaz.
 * Hiçbir uç Harcama'ya dokunmaz, borsa bakiyesi okumaz, emir vermez. Araştırma modunda da açık (bot/borsa değil).
 */
'use strict';
const express = require('express');
const M = require('./model');
const MUH = require('./muhasebe');
const F = require('./fiyat');
const G = require('./degerleme');
const C = require('./csv');
const depo = require('./depo');
const FAIZ = require('./faiz');
const RAPOR = require('./rapor');
const TASIMA = require('./tasima');

const BODY_SINIR = '3mb';

function kur(ops = {}) {
  const simdi = ops.simdi || (() => Date.now());
  const bugun = () => (ops.bugun ? ops.bugun() : M.yerelGun(simdi()));
  const log = ops.log || (() => {});
  const fetchFn = ops.fetch || ((...a) => globalThis.fetch(...a));
  let anlikSon = 0;
  let kurIs = null;

  const binanceOnbellek = () => (depo.jsonOku('fiyat-onbellek.json') || {}).fiyatlar || {};
  const kurOnbellek = () => depo.jsonOku('kurlar.json');

  /** Bütün ekran verisi (tek hesap). */
  function ozetKur() {
    const g = bugun();
    const r = depo.yukle({ bugun: g });
    const S = G.seriler(r.D, { kurOnbellek: kurOnbellek(), binanceOnbellek: binanceOnbellek() });
    const deg = G.degerle(r.D, r.muh, { bugun: g, seriler: S, simdiMs: simdi() });
    const seri = G.gunlukSeri(r.D, r.muh, { bugun: g, seriler: S });
    const getiri = G.getiriler(seri);
    const dag = G.dagilim(r.D, deg);
    return { r, deg, seri, getiri, dag, gun: g, S };
  }

  /** Bugünün anlık görüntüsü: yoksa üret; varsa en çok 10 dakikada bir tazele (geçmiş günler değişmez). */
  function anlikTazele(o, zorla) {
    if (!o.r.D.islemler.length) return null;
    const var_ = depo.anlikVar(o.gun);
    if (var_ && !zorla && simdi() - anlikSon < 10 * 60 * 1000) return o.gun;
    try { depo.anlikYaz(o.gun, G.anlikGoruntu(o.deg, o.getiri)); anlikSon = simdi(); } catch (e) { log('WARN', `Portföyüm anlık görüntü yazılamadı: ${e.message}`); }
    return o.gun;
  }

  const disari = (D) => ({
    kurumlar: [...D.kurumlar.values()],
    // 64.2: mevduat faizi ayarı (faiz) + sıradaki vade (bilgi)
    hesaplar: [...D.hesaplar.values()].map(h => (h.faiz ? { ...h, faizSiradaki: FAIZ.siradakiVade(h.faiz, bugun()), otoFaizSayisi: (D.otoFaizler || []).filter(x => x.hesap === h.id && !D.iptalEdilen.has(x.id)).length,
      faizUyarilari: (D.otoFaizUyarilari || []).filter(u => u.hesap === h.id).map(u => u.mesaj) } : h)),
    varliklar: [...D.varliklar.values()],
    hedef: D.hedef,
    // Yeni panel F3: sahip katmanı + portföy başına hedef (K-F)
    portfoyler: [...D.portfoyler.values()],
    hedefler: Object.fromEntries(D.hedefler || []),
  });

  /** Portföy süzgeci: ?portfoy= → { pid } | { hata }; boş → null (bütün hesaplar, eski davranış). */
  const portfoySec = (req, D) => {
    const q = typeof req.query.portfoy === 'string' ? req.query.portfoy.trim() : '';
    if (!q) return null;
    if (q !== 'tumu' && !D.portfoyler.has(q)) return { hata: `bilinmeyen portföy: ${q}` };
    return { pid: q };
  };
  /** Portföy başına toplam (Tümü görünümünde portföy başına satır; Pano başlığı). */
  const portfoyOzetleri = (D, deg) => [...D.portfoyler.values()].map(p => {
    const x = G.portfoyDegeri(D, deg, p.id);
    return { id: p.id, ad: p.ad, varsayilan: !!p.varsayilan, toplamUSD: x.toplamUSD, toplamTL: x.toplamTL, hesapSayisi: x.hesaplar.length, hedefVar: D.hedefler.has(p.id), kapsam: x.kapsam };
  });
  /**
   * F3 öneri: hesabın adı başka bir portföyün adını içeriyor ama hesap varsayılan (Ben) portföyünde — o kişinin hesabı yanlış
   * portföyde, toplamı/getiriyi/hedefi karıştırıyor (§1/1). Ad karşılaştırması Türkçe harf duyarsız; kişi adı kodda sabit değil.
   */
  const kucukTr = (s) => String(s || '').toLocaleLowerCase('tr-TR');
  const sahipOnerileri = (D) => [...D.hesaplar.values()]
    .filter(h => h.durum === 'acik' && (h.portfoy || M.VARSAYILAN_PORTFOY) === M.VARSAYILAN_PORTFOY
      && [...D.portfoyler.values()].some(p => p.id !== M.VARSAYILAN_PORTFOY && kucukTr(p.ad).length >= 2 && kucukTr(h.ad).includes(kucukTr(p.ad))))
    .map(h => ({ kod: 'sahip-oneri', hesap: h.id, mesaj: `${h.ad} "${D.portfoyler.get(M.VARSAYILAN_PORTFOY).ad}" portföyünde — başkasına aitse kendi portföyüne taşıyın (toplam, getiri ve hedef ayrılır)` }));

  const r = express.Router();
  r.use('/api/portfoyum', express.json({ limit: BODY_SINIR }));
  const hata = (res, e, kod = 400) => res.status(kod).json({ success: false, error: e && e.message ? e.message : String(e) });
  const yaz = (res, sonuc, ek) => {
    if (!sonuc.tamam) return res.status(400).json({ success: false, error: sonuc.hatalar.map(h => h.mesaj).join(' · '), hatalar: sonuc.hatalar, uyarilar: sonuc.uyarilar });
    res.json({ success: true, eklenen: sonuc.eklenen, uyarilar: sonuc.uyarilar, ...(ek || {}) });
  };
  const ekle = (res, kayitlar, ek) => {
    try { yaz(res, depo.ekle(kayitlar, { bugun: bugun(), simdi: simdi() }), ek); } catch (e) { hata(res, e, 500); }
  };
  const govde = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

  // ── Okuma ─────────────────────────────────────────────────────────────────
  r.get('/api/portfoyum/ozet', (req, res) => {
    try {
      const o = ozetKur();
      const ps = portfoySec(req, o.r.D);
      if (ps && ps.hata) return hata(res, new Error(ps.hata), 404);
      const telefon = req.kademe === 'telefon';
      const anlik = telefon ? (depo.anlikVar(o.gun) ? o.gun : null) : anlikTazele(o);
      // F3: portföy seçildiyse değerleme / seri / getiri / dağılım yalnız o portföyün "toplama dahil" hesaplarından.
      let deg = o.deg, s = o.seri, getiri = o.getiri, dag = o.dag, portfoy = null, kapsam = null;
      if (ps) {
        const D = o.r.D, p = G.portfoyDegeri(D, o.deg, ps.pid);
        deg = { ...o.deg, toplamUSD: p.toplamUSD, toplamTL: p.toplamTL, pozisyonlar: p.pozisyonlar, nakitler: p.nakitler, hesaplar: p.hesaplar };
        s = G.gunlukSeri(D, o.r.muh, { bugun: o.gun, seriler: o.S, hesaplar: G.portfoyHesaplari(D, ps.pid, { yalnizDahil: true }) });
        getiri = G.getiriler(s);
        dag = G.dagilim(D, deg, { hedef: ps.pid === 'tumu' ? null : (D.hedefler.get(ps.pid) || null) });
        portfoy = p.portfoy; kapsam = p.kapsam;
      }
      res.json({
        success: true, bugun: o.gun, kural: M.ACILIS_KURALI,
        ...disari(o.r.D),
        degerleme: deg, getiri, dagilim: dag, portfoy, kapsam, portfoyOzetleri: portfoyOzetleri(o.r.D, o.deg),
        hatalar: o.r.hatalar.concat(o.r.bozuk.map(b => ({ kod: 'dosya', mesaj: b.mesaj }))), uyarilar: o.r.uyarilar.concat(o.deg.uyarilar, sahipOnerileri(o.r.D)),
        acilislar: acilisHaritasi(o.r.D),
        islemSayisi: o.r.D.islemler.length, kayitSayisi: o.r.kayitlar.length, anlik, anlikGunleri: depo.anlikListe().length,
        seriBas: s.length ? s[0].tarih : null,
        sabitler: { paralar: M.PARALAR, siniflar: M.SINIFLAR, kaynaklar: M.FIYAT_KAYNAKLARI, hesapTurleri: M.HESAP_TURLERI, islemTurleri: M.ISLEM_TURLERI, bayatGun: F.BAYAT_GUN, bayatHesapGun: G.BAYAT_HESAP_GUN }
      });
    } catch (e) { hata(res, e, 500); }
  });

  /** id → { n, toplam } (yalnız aynı gün ≥ 2 etkin işlem olan günler). */
  function gunIciSiralar(D) {
    const sirali = MUH.siralaIslemler(D), gunler = new Map(), m = new Map();
    for (const x of sirali) { if (!gunler.has(x.tarih)) gunler.set(x.tarih, []); gunler.get(x.tarih).push(x); }
    for (const l of gunler.values()) if (l.length > 1) l.forEach((x, i) => m.set(x.id, { n: i + 1, toplam: l.length }));
    return m;
  }

  /**
   * Açılış sonradan giriliyor ve o gün bu hesapta Tasarımcı ("Uyguladım") kaydı var: açılışa dahil mi, sonra mı? (Ö10)
   * Denetim 61.1 D1: cevap YALNIZ bu açılışın kendi kalemine (çiftine) uygulanır (açılışın dahilEdilen listesi; muhasebe.js
   * acilisKarari) — o gün daha önce girilmiş açılışların sayımı değişmez. Bu yüzden soru, YENİ açılışın çiftine dokunan
   * 61.1 Tasarımcı kayıtları için sorulur (aynı gün ikinci bir açılış girilirse kendi kalemi için yeniden sorulur).
   * Sorulmaz: açıkça "dahil" (acilisSonrasi:false, CSV) taşıyan kayıt ve 61.0 biçimli kayıt (Ö21: kendi işaretiyle, elle gibi).
   * Döndürür: [işlem].
   */
  function acilisTasarimciKayitlari(D, x) {
    const anahtar = x.varlik ? M.ciftAnahtari(x.hesap, x.varlik) : M.ciftAnahtari(x.hesap, x.para, true);
    return D.islemler.filter(k => k.islem !== 'acilis' && k.kaynakKayit === 'tasarimci' && !MUH.eskiTasarimciMi(k) && k.acilisSonrasi !== false
      && k.tarih === x.tarih && MUH.dokunulanCiftler(D, k).includes(anahtar));
  }

  function islemListesi(q) {
    const yk = depo.yukle({ bugun: bugun() });
    const D = yk.D;
    // Durum süzgeci (B-16): etkin (iptal edilmemiş) · iptal · hepsi. Eski `iptal=0` parametresi = etkin.
    const durum = q.durum === 'etkin' || q.durum === 'iptal' ? q.durum : q.iptal === '0' ? 'etkin' : 'hepsi';
    const iptalDahil = durum !== 'etkin';
    let l = yk.kayitlar.filter(k => k.tur === 'islem').map(k => {
      const ip = D.iptalEdilen.get(k.id);
      const hatali = yk.hatalar.find(h => h.id === k.id);
      return { ...k, _iptal: ip ? { id: ip.id, neden: ip.neden, zaman: ip.zaman } : null, _hata: hatali ? hatali.mesaj : null };
    });
    // 64.2: otomatik mevduat faizleri (türetilir, dosyada yok) defterde "otomatik" işaretli; silinenler iptal görünür.
    for (const k of D.otoFaizler || []) {
      const ip = D.iptalEdilen.get(k.id);
      l.push({ ...k, _otomatik: true, _iptal: ip ? { id: ip.id, neden: ip.neden, zaman: ip.zaman } : null, _hata: null });
    }
    if (!iptalDahil) l = l.filter(x => !x._iptal);
    if (durum === 'iptal') l = l.filter(x => x._iptal);
    if (q.hesap) l = l.filter(x => x.hesap === q.hesap || x.hedefHesap === q.hesap);
    if (q.islem) l = l.filter(x => x.islem === q.islem);
    if (q.varlik) l = l.filter(x => x.varlik === q.varlik);
    if (q.bas) l = l.filter(x => x.tarih >= q.bas);
    if (q.bit) l = l.filter(x => x.tarih <= q.bit);
    l.sort((a, b) => (a.tarih < b.tarih ? 1 : a.tarih > b.tarih ? -1 : b.sira - a.sira));
    // Aynı gün birden çok (etkin) işlem varsa muhasebedeki gün içi sırası (1 = ilk; Ö10 — defter tablosunda rozet).
    const gunSira = gunIciSiralar(D);
    l = l.map(x => (gunSira.has(x.id) ? { ...x, _gunSira: gunSira.get(x.id) } : x));
    return { D, l, yk };
  }

  r.get('/api/portfoyum/islemler', (req, res) => {
    try {
      const { l, yk } = islemListesi(req.query || {});
      const duzeltmeler = yk.kayitlar.filter(k => k.tur === 'duzeltme');
      res.json({ success: true, islemler: l.slice(0, 2000), toplam: l.length, duzeltmeler });
    } catch (e) { hata(res, e, 500); }
  });

  r.get('/api/portfoyum/islemler.csv', (req, res) => {
    try {
      const { D, l } = islemListesi(req.query || {});
      // Otomatik faizler CSV'ye girmez: türetilir; içe aktarılsaydı elle faiz olarak ikinci kez sayılırdı.
      const metin = '﻿' + C.disaAktar(D, l.filter(x => !x._otomatik).slice().reverse());
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="portfoyum-islemler-${bugun()}.csv"`);
      res.send(metin);
    } catch (e) { hata(res, e, 500); }
  });

  r.get('/api/portfoyum/gecmis', (req, res) => {
    try {
      const o = ozetKur();
      // 62.4: ?hesap=<id> → yalnız o hesabın serisi (hesaplar arası transfer o hesap için dış akış)
      const hid = typeof req.query.hesap === 'string' && req.query.hesap ? req.query.hesap : null;
      if (hid && !o.r.D.hesaplar.has(hid)) return hata(res, new Error(`bilinmeyen hesap: ${hid}`), 404);
      const ps = hid ? null : portfoySec(req, o.r.D);
      if (ps && ps.hata) return hata(res, new Error(ps.hata), 404);
      const kaynak = hid ? G.gunlukSeri(o.r.D, o.r.muh, { bugun: o.gun, seriler: o.S, hesap: hid })
        : ps ? G.gunlukSeri(o.r.D, o.r.muh, { bugun: o.gun, seriler: o.S, hesaplar: G.portfoyHesaplari(o.r.D, ps.pid, { yalnizDahil: true }) }) : o.seri;
      const sey = seyrelt(kaynak, 1500);
      res.json({ success: true, seri: sey.map(x => ({ t: Date.parse(x.tarih + 'T00:00:00Z'), tarih: x.tarih, usd: x.usd, tl: x.tl, endeksUSD: x.endeksUSD, endeksTL: x.endeksTL, akisUSD: x.akisUSD, akisTL: x.akisTL, eksik: x.eksik })),
        anlikGunleri: depo.anlikListe(), getiri: hid || ps ? G.getiriler(kaynak) : o.getiri, hesap: hid, portfoy: ps ? ps.pid : null });
    } catch (e) { hata(res, e, 500); }
  });

  // 62.4: Portföyüm grafiğinin kıyas çizgileri — bas gününden 100 tabanlı (birim USD | TL). Kaynak: lib/portfoy/seri (laboratuvar
  // kataloğu) + tasarımcı XU030 + TÜİK TÜFE. Yalnız okur, ağa çıkmaz; 30 dk önbellek.
  const KIYASLAR = [
    { kimlik: 'qqq', ad: 'QQQ al-tut', seri: 'yahoo:QQQ' },
    { kimlik: 'bist30', ad: 'BIST 30', ozel: 'xu030' },
    { kimlik: 'mevduat', ad: 'TL mevduat', seri: 'tr:mevduat' },
    { kimlik: 'dolar', ad: 'Dolar (USD nakit)', seri: 'nakit:usd' },
    { kimlik: 'tufe', ad: 'Enflasyon (TÜFE)', ozel: 'tufe' },
    { kimlik: 'btc', ad: 'BTC al-tut', seri: 'kripto:BTC' }
  ];
  const kiyasOnb = new Map();
  r.get('/api/portfoyum/kiyas', (req, res) => {
    try {
      const bas = /^\d{4}-\d{2}-\d{2}$/.test(req.query.bas || '') ? req.query.bas : null;
      const birim = req.query.birim === 'TL' ? 'TL' : 'USD';
      if (!bas) return hata(res, new Error('bas=YYYY-AA-GG gerekli'));
      const anahtar = `${bas}|${birim}`, o = kiyasOnb.get(anahtar);
      if (o && simdi() - o.zaman < 30 * 60e3) return res.json(o.yanit);
      const SERI = require('../portfoy/seri');
      const t0 = Date.parse(bas + 'T00:00:00Z');
      let kur = null;
      const usdKur = (t) => { if (!kur) kur = SERI.kurUSD('TRY') || []; let lo = 0, hi = kur.length - 1, r2 = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (kur[m].t <= t) { r2 = kur[m].c; lo = m + 1; } else hi = m - 1; } return r2; };
      const tabanla = (n) => { const l = n.filter(([t, v]) => t >= t0 - 7 * 864e5 && Number.isFinite(v) && v > 0); if (!l.length) return []; const v0 = l[0][1]; return l.map(([t, v]) => [Math.max(t, t0), Math.round(v / v0 * 1e4) / 100]); };
      const seriler = KIYASLAR.map(k => {
        try {
          let n = [];
          if (k.seri) {
            const p = SERI.seriPaket(k.seri, { birim, bas });
            let v = 1; n = [[t0, 1]]; for (const x of p.satirlar) { v *= 1 + x.getiri; n.push([x.t, v]); }
          } else if (k.ozel === 'xu030') {
            const g = require('../tasarimci/veri').ham('XU030.IS').gunler.filter(x => x.c > 0 && x.t >= t0 - 7 * 864e5);
            n = g.map(x => [x.t, birim === 'TL' ? x.c : (usdKur(x.t) ? x.c * usdKur(x.t) : NaN)]);
          } else if (k.ozel === 'tufe') {
            const g = SERI.tufeAylik().filter(x => x.t >= t0 - 40 * 864e5);
            n = g.map(x => [x.t, birim === 'TL' ? x.deger : (usdKur(x.t) ? x.deger * usdKur(x.t) : NaN)]);
          }
          return { kimlik: k.kimlik, ad: k.ad, noktalar: tabanla(n) };
        } catch (e) { return { kimlik: k.kimlik, ad: k.ad, noktalar: [], hata: e.message }; }
      });
      const yanit = { success: true, bas, birim, seriler };
      kiyasOnb.set(anahtar, { zaman: simdi(), yanit });
      res.json(yanit);
    } catch (e) { hata(res, e, 500); }
  });

  // 64.2 (P6): Rapor sekmesi — aylık rapor, başlangıçtan getiri, katkılar, stres (doğrudan + beta), sınıf korelasyonu.
  // Yalnız okur (telefonda da aynı), ağa çıkmaz; eksik geçmiş için "Fiyatları yenile" (masaüstü) dosyaları tazeler.
  r.get('/api/portfoyum/rapor', (req, res) => {
    try {
      const o = ozetKur();
      const hid = typeof req.query.hesap === 'string' && req.query.hesap ? req.query.hesap : null;
      if (hid && !o.r.D.hesaplar.has(hid)) return hata(res, new Error(`bilinmeyen hesap: ${hid}`), 404);
      const ps = hid ? null : portfoySec(req, o.r.D);
      if (ps && ps.hata) return hata(res, new Error(ps.hata), 404);
      // F3: portföy raporu — o portföyün "toplama dahil" hesapları (K-F: Anıl'ın raporu ayrı).
      const kume = ps ? G.portfoyHesaplari(o.r.D, ps.pid, { yalnizDahil: true }) : null;
      const q = String(req.query.ay || '');
      const ay = q === 'buay' ? o.gun.slice(0, 7) : RAPOR.AY_RE.test(q) ? q : null;
      const seri = hid ? G.gunlukSeri(o.r.D, o.r.muh, { bugun: o.gun, seriler: o.S, hesap: hid })
        : kume ? G.gunlukSeri(o.r.D, o.r.muh, { bugun: o.gun, seriler: o.S, hesaplar: kume }) : o.seri;
      let tufe = null;
      try { tufe = require('../portfoy/seri').tufeAylik(); } catch (e) { tufe = null; }
      const sonuc = RAPOR.rapor({ D: o.r.D, muh: o.r.muh, S: o.S, seri, deg: o.deg, bugun: o.gun, ay, hesap: hid, hesaplar: kume ? new Set(kume) : null, tufe, faktorler: raporFaktorleri(o.S.kurlar) });
      res.json({ success: true, ...sonuc, hesaplar: [...o.r.D.hesaplar.values()].map(h => ({ id: h.id, ad: h.ad, durum: h.durum })), uyarilar: o.deg.uyarilar });
    } catch (e) { hata(res, e, 500); }
  });

  r.get('/api/portfoyum/kur', async (req, res) => {
    try {
      const yenile = req.query && (req.query.yenile === '1' || req.query.yenile === 'true');
      let ob = kurOnbellek();
      let hatalar = [];
      const bayat = !ob || !ob.zaman || simdi() - Date.parse(ob.zaman) > F.KUR_TAZE_MS;
      if (req.kademe !== 'telefon' && (yenile || bayat) && ops.ag !== false) {
        if (!kurIs) kurIs = F.kurlariTazele(ob, { fetch: fetchFn, zorla: true, simdi }).finally(() => { kurIs = null; });
        try {
          const yeni = await kurIs;
          hatalar = yeni.hatalar || [];
          if (Object.keys(yeni.kurlar || {}).length) { depo.jsonYaz('kurlar.json', yeni); ob = yeni; }
        } catch (e) { hatalar = [e.message]; }
      }
      const t = F.kurTablosu(ob);
      res.json({ success: true, ...t, hatalar, onbellekZaman: ob ? ob.zaman : null });
    } catch (e) { hata(res, e, 500); }
  });

  // ── Yazma (telefon kademesinde guvenlik.js 403) ─────────────────────────────
  r.post('/api/portfoyum/kurum', (req, res) => ekle(res, [{ tur: 'kurum', ad: String(govde(req).ad || '').trim() }]));
  r.put('/api/portfoyum/kurum/:id', (req, res) => ekle(res, [{ tur: 'kurum-ad', kurum: req.params.id, ad: String(govde(req).ad || '').trim() }]));
  r.post('/api/portfoyum/hesap', (req, res) => {
    // 67.4: Hesaplar › "Yeni hesap" kartı kurumu ADIYLA gönderir (kurumAd): varsa o, yoksa aynı pakette açılır (hesapAcPlan).
    try {
      const p = hesapAcPlan(depo.yukle({ bugun: bugun() }).D, govde(req));
      if (p.hata) return res.status(400).json({ success: false, error: p.hata });
      ekle(res, p.kayitlar, { hesap: p.hesap });
    } catch (e) { hata(res, e, 500); }
  });
  r.post('/api/portfoyum/hesap/:id/faiz', (req, res) => ekle(res, [FAIZ.ayarNormalle(req.params.id, govde(req))]));
  // ── Yeni panel F3: portföy (sahip) katmanı ──────────────────────────────────
  r.post('/api/portfoyum/portfoy', (req, res) => ekle(res, [{ tur: 'portfoy', ad: String(govde(req).ad || '').trim() }]));
  r.put('/api/portfoyum/portfoy/:id', (req, res) => ekle(res, [{ tur: 'portfoy-ad', portfoy: req.params.id, ad: String(govde(req).ad || '').trim() }]));
  r.post('/api/portfoyum/hesap/:id/portfoy', (req, res) => {
    try {
      const p = portfoyBaglaPlan(depo.yukle({ bugun: bugun() }).D, req.params.id, govde(req));
      if (p.hata) return res.status(400).json({ success: false, error: p.hata });
      ekle(res, p.kayitlar, { portfoy: p.portfoy });
    } catch (e) { hata(res, e, 500); }
  });
  r.post('/api/portfoyum/hesap/:id/kapsam', (req, res) => {
    const d = govde(req).dahil;
    ekle(res, [{ tur: 'hesap-kapsam', hesap: req.params.id, dahil: d === true || d === 'true' ? true : d === false || d === 'false' ? false : d }]);
  });
  r.put('/api/portfoyum/hesap/:id', (req, res) => ekle(res, [{ tur: 'hesap-ad', hesap: req.params.id, ad: String(govde(req).ad || '').trim() }]));
  r.post('/api/portfoyum/hesap/:id/kapat', (req, res) => ekle(res, [{ tur: 'hesap-kapat', hesap: req.params.id, tarih: String(govde(req).tarih || bugun()) }]));
  r.post('/api/portfoyum/varlik', (req, res) => ekle(res, [M.varlikNormalle(govde(req))]));
  r.put('/api/portfoyum/varlik/:id', (req, res) => {
    const b = govde(req), x = { tur: 'varlik-guncelle', varlik: req.params.id };
    for (const a of ['ad', 'sinif', 'kaynak', 'kod', 'para']) if (b[a] != null && b[a] !== '') x[a] = String(b[a]).trim();
    ekle(res, [x]);
  });
  r.post('/api/portfoyum/islem', (req, res) => {
    try {
      const b = govde(req);
      const x = M.islemNormalle(b);
      const yk = depo.yukle({ bugun: bugun() });
      const hesapAd = (id) => { const h = yk.D.hesaplar.get(id); return h ? h.ad : id; };
      // (1) Açılış GÜNÜNE tarihli işlem, açılış kaydından sonra giriliyor: dahil mi, sonra mı? (cevap yoksa sor)
      if (x.islem !== 'acilis' && b.acilisSonrasi == null) {
        const hs = [x.hesap, x.hedefHesap].filter(Boolean);
        const ac = yk.D.islemler.find(a => a.islem === 'acilis' && hs.includes(a.hesap) && a.tarih === x.tarih);
        if (ac) {
          return res.status(409).json({ success: false, soru: 'acilis-gunu', error: `Bu işlem ${x.tarih} tarihli — ${hesapAd(ac.hesap)} hesabının AÇILIŞ GÜNÜ. `
            + 'Açılış bakiyesini girerken bu işlem zaten yapılmış mıydı (açılışa DAHİL — bakiye değişmez), yoksa açılıştan SONRA mı yapıldı (bakiyeye eklenir)?' });
        }
      }
      // (1b) Açılış, o gün bu hesapta Tasarımcı kaydı varken sonradan giriliyor: kayıtlar açılışa dahil mi, sonra mı? (Ö10)
      //      Cevap açılış kaydına `dahilEdilen` olarak yazılır (yalnız eklenen ilke: Tasarımcı kayıtları değişmez).
      if (x.islem === 'acilis') {
        const tk = acilisTasarimciKayitlari(yk.D, x);
        if (tk.length) {
          const c = b.tasarimciKayitlari;
          if (c !== 'dahil' && c !== 'sonra') {
            return res.status(409).json({ success: false, soru: 'acilis-tasarimci', kayitlar: tk.map(k => k.id),
              error: `Bu günün Tasarımcı kayıtları açılışa dahil mi, sonra mı? ${x.tarih} günü ${hesapAd(x.hesap)} hesabında Portföy › Bu ay "Uyguladım" ile yazılmış ${tk.length} işlem var. `
                + 'Açılış bakiyesini girerken bu alım/satımlar zaten yapılmış mıydı (açılışa DAHİL — bakiye değişmez), yoksa açılıştan SONRA mı yapıldı (bakiyeye eklenir)?' });
          }
          x.dahilEdilen = c === 'dahil' ? tk.map(k => k.id) : [];
        }
      }
      const kayitlar = [x];
      const ek = b.nakitAcilisiEkle;
      if (ek && ek.hesap && ek.para && ek.tarih) kayitlar.unshift({ tur: 'islem', islem: 'acilis', hesap: String(ek.hesap), para: String(ek.para), tarih: String(ek.tarih), tutar: 0, not: 'nakit açılışı (işlemle birlikte önerildi)' });
      const on = depo.ekle(kayitlar, { bugun: bugun(), simdi: simdi(), yazma: false });
      if (!on.tamam) return yaz(res, on);
      // (2) Açılışa dahil işlemin nakit bacağı, nakit açılışı olmayan çifte düşüyor → onaysız yazma yok, öneri dön.
      const eksik = on.uyarilar.filter(u => u.kod === 'acilis-nakit-eksik');
      if (eksik.length && !b.onay) {
        const u = eksik[0];
        return res.status(409).json({ success: false, soru: 'nakit-acilisi', error: u.mesaj, oneri: { hesap: u.hesap, para: u.para, tarih: u.tarih } });
      }
      ekle(res, kayitlar);
    } catch (e) { hata(res, e, 500); }
  });
  // ── Hızlı ekleme (61.2, kullanıcı: "aşırı karışık, bağlamlar kopuk") ─────────
  // Tek form: sembol → Yahoo'dan ad/borsa/para bulunur; hesap seçilir ya da yerinde açılır; kurum/hesap/varlık/açılış
  // kayıtları arkada birlikte yazılır (tek depo.ekle — ya hepsi ya hiçbiri). Gelişmiş formlar yerinde kalır.
  r.post('/api/portfoyum/sembol-bul', async (req, res) => {
    try { res.json({ success: true, adaylar: await sembolBul(govde(req).q, fetchFn) }); } catch (e) { hata(res, e); }
  });
  r.post('/api/portfoyum/hizli-ekle', async (req, res) => {
    try {
      const b = govde(req);
      const D = depo.yukle({ bugun: bugun() }).D;
      const t = alisTarihi(b.tarih, M.yerelGun(simdi() - 86400000), bugun());
      if (t.hata) return res.status(400).json({ success: false, error: t.hata });
      const p = hizliEklePlan(D, { ...b, fiyatTarih: bugun() }, t.tarih);
      if (p.hata) return res.status(400).json({ success: false, error: p.hata });
      // 67.4: eski "Tüm işlem türleri › Açılış bakiyesi" yolunun soruları burada da sorulur (açılış artık yalnız Varlık ekle'den):
      //   o gün bu hesapta Tasarımcı kaydı → 'acilis-tasarimci' (dahil mi, sonra mı?); dahil edilen işlemin nakit bacağı nakit
      //   açılışı olmayan çifte düşüyorsa → 'nakit-acilisi' (önerilen 0 nakit açılışı eklensin mi?).
      const ac = p.kayitlar.find(k => k.islem === 'acilis');
      if (ac) {
        const tk = acilisTasarimciKayitlari(D, ac);
        if (tk.length) {
          const c = b.tasarimciKayitlari;
          if (c !== 'dahil' && c !== 'sonra') {
            return res.status(409).json({ success: false, soru: 'acilis-tasarimci', kayitlar: tk.map(k => k.id),
              error: `Bu günün Tasarımcı kayıtları açılışa dahil mi, sonra mı? ${ac.tarih} günü ${(D.hesaplar.get(ac.hesap) || {}).ad || ac.hesap} hesabında Portföy › Bu ay "Uyguladım" ile yazılmış ${tk.length} işlem var. `
                + 'Bakiyeyi girerken bu alım/satımlar zaten yapılmış mıydı (açılışa DAHİL — bakiye değişmez), yoksa SONRA mı yapıldı (bakiyeye eklenir)?' });
          }
          ac.dahilEdilen = c === 'dahil' ? tk.map(k => k.id) : [];
        }
      }
      const ek = b.nakitAcilisiEkle;
      if (ek && ek.hesap && ek.para && ek.tarih) p.kayitlar.unshift({ tur: 'islem', islem: 'acilis', hesap: String(ek.hesap), para: String(ek.para), tarih: String(ek.tarih), tutar: 0, not: 'nakit açılışı (varlık eklerken önerildi)' });
      const on = depo.ekle(p.kayitlar, { bugun: bugun(), simdi: simdi(), yazma: false });
      if (!on.tamam) return yaz(res, on);
      const eksik = on.uyarilar.filter(u => u.kod === 'acilis-nakit-eksik');
      if (eksik.length && !b.onay) return res.status(409).json({ success: false, soru: 'nakit-acilisi', error: eksik[0].mesaj, oneri: { hesap: eksik[0].hesap, para: eksik[0].para, tarih: eksik[0].tarih } });
      // Yahoo dışı yeni varlık: kod önce doğrulanır (TEFAS fon listesi / Binance fiyatı) — yanlış kodla kayıt yazılmaz.
      const I = ops.indir || require('../portfoy/indir');
      const d = p.indir;
      let fiyatHatasi = null, binanceFiyat = null;
      if (d && d.kaynak === 'tefas' && d.yeni) {
        try {
          const x = await I.tefasIndir(d.kod);
          const v = p.kayitlar.find(k => k.tur === 'varlik');
          try { const j = x && x.dosya ? JSON.parse(require('fs').readFileSync(x.dosya, 'utf8')) : null; if (v && j && j.ad && (!b.ad || String(b.ad).trim() === '')) v.ad = String(j.ad).slice(0, 120); } catch (e) { /* ad okunamadı: kod kalır */ }
        } catch (e) {
          if (/bilinmeyen|geçersiz|yok/i.test(e.message)) return res.status(400).json({ success: false, error: e.message });
          fiyatHatasi = e.message;
        }
      } else if (d && d.kaynak === 'binance') {
        try { binanceFiyat = await F.binanceSon(`${d.kod}USDT`, fetchFn); } catch (e) {
          if (d.yeni) return res.status(400).json({ success: false, error: `Binance'te ${d.kod}USDT fiyatı alınamadı (${e.message}) — coin kodu doğru mu?` });
          fiyatHatasi = e.message;
        }
      }
      const sonuc = depo.ekle(p.kayitlar, { bugun: bugun(), simdi: simdi(), kaynak: 'hizli' });
      if (!sonuc.tamam) return yaz(res, sonuc);
      // Fiyat geçmişini indir (değerleme hemen görünsün); başarısızsa kayıt yine durur, "Fiyatları yenile" tekrar dener.
      try {
        if (d && (d.kaynak === 'yahoo' || d.kaynak === 'altin')) await I.yahooIndir(d.kod);
        if (binanceFiyat) {
          const fo = depo.jsonOku('fiyat-onbellek.json') || {};
          const fiyatlar = fo.fiyatlar || {};
          fiyatlar[d.kod] = { fiyat: binanceFiyat.deger, zaman: binanceFiyat.zaman, kaynak: 'Binance /api/v3/ticker/price' };
          depo.jsonYaz('fiyat-onbellek.json', { zaman: new Date(simdi()).toISOString(), fiyatlar });
        }
        if (d) require('../portfoy/kaynaklar').onbellekTemizle();
      } catch (e) { fiyatHatasi = e.message; }
      yaz(res, sonuc, { fiyatHatasi });
    } catch (e) { hata(res, e, 500); }
  });
  r.post('/api/portfoyum/hizli-duzenle', (req, res) => {
    const b = govde(req);
    const D = depo.yukle({ bugun: bugun() }).D;
    const a = D.islemler.find(x => x.id === String(b.acilis || '') && x.islem === 'acilis' && x.varlik);
    if (!a) return res.status(400).json({ success: false, error: 'düzenlenecek açılış kaydı bulunamadı' });
    const t = alisTarihi(b.tarih, a.tarih, bugun());
    if (t.hata) return res.status(400).json({ success: false, error: t.hata });
    const yeni = M.islemNormalle({ islem: 'acilis', hesap: a.hesap, varlik: a.varlik, tarih: t.tarih, adet: b.adet, birimMaliyet: b.birimMaliyet, not: a.not });
    if (!(yeni.adet > 0)) return res.status(400).json({ success: false, error: 'adet sıfırdan büyük olmalı' });
    ekle(res, [{ tur: 'duzeltme', hedef: a.id, neden: 'hızlı düzenleme' }, yeni]);
  });
  // 67.3 Hedefim › "Para ekle ve dağılımı değiştir" → "Aldım, işlemleri kaydet": para yatırma + satışlar + alışlar (yeni sembolse
  // varlık da açılır) seçili hesaba TEK depo.ekle ile — ya hepsi ya hiçbiri. Satış eldekini aşamaz; nakit eksiye düşerse önce sorar
  // (409 soru 'nakit-eksi', onay:true ile yazılır). Gün içi sıra: yatırma → satışlar → alışlar.
  r.post('/api/portfoyum/plan-kaydet', async (req, res) => {
    try {
      const b = govde(req);
      const yk = depo.yukle({ bugun: bugun() });
      const t = alisTarihi(b.tarih, bugun(), bugun());
      if (t.hata) return res.status(400).json({ success: false, error: t.hata.replace('alış tarihi', 'işlem tarihi') });
      const p = planKaydetPlan(yk.D, yk.muh, b, t.tarih);
      if (p.hata) return res.status(400).json({ success: false, error: p.hata });
      const on = depo.ekle(p.kayitlar, { bugun: bugun(), simdi: simdi(), yazma: false });
      if (!on.tamam) return yaz(res, on);
      const eksi = on.uyarilar.filter(u => u.kod === 'nakit-eksi');
      if (eksi.length && b.onay !== true) return res.status(409).json({ success: false, soru: 'nakit-eksi', error: eksi[0].mesaj });
      const sonuc = depo.ekle(p.kayitlar, { bugun: bugun(), simdi: simdi(), kaynak: 'plan' });
      if (!sonuc.tamam) return yaz(res, sonuc);
      let fiyatHatasi = null;
      for (const kod of p.kodlar) {
        try { await (ops.indir || require('../portfoy/indir')).yahooIndir(kod); } catch (e) { fiyatHatasi = `${kod}: ${e.message}`; }
      }
      if (p.kodlar.length) { try { require('../portfoy/kaynaklar').onbellekTemizle(); } catch (e) { /* yok */ } }
      yaz(res, sonuc, { fiyatHatasi, ozet: p.ozet });
    } catch (e) { hata(res, e, 500); }
  });
  r.post('/api/portfoyum/kayit/:id/iptal', (req, res) => {
    // 64.2: otomatik faiz (of-…) dosyada yok — yalnız gerçekten türetilmiş bir kimlik silinebilir (silinenler listesine girer).
    if (M.OTO_FAIZ_RE.test(req.params.id)) {
      const D = depo.yukle({ bugun: bugun() }).D;
      if (!(D.otoFaizler || []).some(x => x.id === req.params.id)) return res.status(404).json({ success: false, error: `otomatik faiz kaydı yok: ${req.params.id}` });
    }
    ekle(res, [{ tur: 'duzeltme', hedef: req.params.id, neden: String(govde(req).neden || '').slice(0, 300) }]);
  });
  r.post('/api/portfoyum/fiyat', (req, res) => {
    const b = govde(req);
    const c = M.sayiCoz(b.fiyat);
    if (c.hata) return res.status(400).json({ success: false, error: 'fiyat: ' + c.hata });
    ekle(res, [{ tur: 'fiyat', varlik: String(b.varlik || ''), tarih: String(b.tarih || bugun()), fiyat: c.deger }]);
  });
  r.post('/api/portfoyum/hedef', (req, res) => {
    const b = govde(req);
    const ag = {};
    for (const [k, v] of Object.entries(b.agirliklar || {})) { const n = M.sayi(v); if (Number.isFinite(n) && n > 0) ag[String(k)] = n; else if (!Number.isFinite(n)) ag[String(k)] = NaN; }
    const h = { tur: 'hedef', duzey: String(b.duzey || ''), agirliklar: ag, bant: b.bant == null || b.bant === '' ? 5 : M.sayi(b.bant), kaynak: String(b.kaynak || 'elle').slice(0, 120) };
    // F3 (K-F): portföy başına hedef; verilmezse 'ben' (eski ekranlar, modelden "hedefimi güncelle").
    if (b.portfoy != null && String(b.portfoy).trim() && String(b.portfoy).trim() !== M.VARSAYILAN_PORTFOY) h.portfoy = String(b.portfoy).trim();
    ekle(res, [h]);
  });

  function csvHazirla(req) {
    const metin = String(govde(req).metin || '');
    if (!metin.trim()) throw new Error('CSV metni boş');
    const D = depo.yukle({ bugun: bugun() }).D;
    const c = C.iceAktarCoz(metin, D);
    if (c.hata) throw new Error(c.hata);
    return c;
  }
  r.post('/api/portfoyum/csv/onizle', (req, res) => {
    try {
      const c = csvHazirla(req);
      const gecerli = c.satirlar.filter(s => s.kayit).map(s => s.kayit);
      const butun = c.satirlar.every(s => s.kayit || s.atla) && gecerli.length ? depo.ekle(gecerli, { bugun: bugun(), simdi: simdi(), yazma: false }) : null;
      res.json({ success: true, satirlar: c.satirlar.map(s => ({ no: s.no, ham: s.ham, hatalar: s.hatalar, uyarilar: s.uyarilar || [], atla: s.atla || null })), sutunlar: c.sutunlar, bilinmeyenSutunlar: c.bilinmeyenSutunlar || [],
        atlanan: c.satirlar.filter(s => s.atla).length, mukerrer: c.satirlar.filter(s => (s.uyarilar || []).length).length,
        satirHatasi: c.satirlar.filter(s => s.hatalar.length).length, dosyaHatalari: butun ? butun.hatalar : [], uyarilar: butun ? butun.uyarilar : [],
        aktarilabilir: !!(butun && butun.tamam), adet: gecerli.length });
    } catch (e) { hata(res, e); }
  });
  r.post('/api/portfoyum/csv/ice-aktar', (req, res) => {
    try {
      const c = csvHazirla(req);
      const bozuk = c.satirlar.filter(s => !s.kayit && !s.atla);
      if (bozuk.length || !c.satirlar.some(s => s.kayit)) return res.status(400).json({ success: false, error: `${bozuk.length} satır hatalı — önizlemedeki hataları düzeltin (hiçbir satır eklenmedi)`, satirlar: bozuk.map(s => ({ no: s.no, hatalar: s.hatalar })) });
      const sonuc = depo.ekle(c.satirlar.filter(s => s.kayit).map(s => s.kayit), { bugun: bugun(), simdi: simdi(), kaynak: 'csv' });
      yaz(res, sonuc, { adet: sonuc.eklenen.length, atlanan: c.satirlar.filter(s => s.atla).length });
    } catch (e) { hata(res, e); }
  });

  r.post('/api/portfoyum/fiyat-yenile', async (req, res) => {
    try {
      const D = depo.yukle({ bugun: bugun() }).D;
      const sonuc = await fiyatlariYenile(D, { fetch: fetchFn, log, indir: ops.indir });
      const ob = await F.kurlariTazele(kurOnbellek(), { fetch: fetchFn, zorla: true, simdi }).catch(e => ({ hatalar: [e.message] }));
      if (ob && ob.kurlar && Object.keys(ob.kurlar).length) depo.jsonYaz('kurlar.json', ob);
      res.json({ success: true, ...sonuc, kurHatalari: (ob && ob.hatalar) || [] });
    } catch (e) { hata(res, e, 500); }
  });

  /**
   * 64.8 BİR KEZLİK TAŞIMA (sunucuda çalışır; geliştirme bilgisayarı lib/evYazma.js ile yollar): {kayitlar, onizle}.
   * onizle: true → yalnız plan (yazmaz). Değilse plan BU AN yeniden kurulur (önizlemeden sonra sunucuda değişen olabilir) ve eklenecekler
   * tek atomik yazımla eklenir. Plan lib/portfoyum/tasima.js (içerik eşitliği: kimlik ve yazılma zamanı yok sayılır).
   */
  r.post('/api/portfoyum/tasima', (req, res) => {
    try {
      const b = govde(req);
      if (!Array.isArray(b.kayitlar)) return hata(res, new Error('kayitlar dizisi gerekli'));
      if (b.kayitlar.length > 20000) return hata(res, new Error('çok fazla kayıt (en çok 20 000)'), 413);
      const gelen = b.kayitlar.filter(k => k && typeof k === 'object' && !Array.isArray(k)).map(k => require('../guvenlik').prototipsiz(k));
      const g = bugun();
      const ev = depo.oku();
      if (ev.bozuk.length) return hata(res, new Error('sunucudaki kayit.jsonl bozuk — önce onarın'), 409);
      const p = TASIMA.plan(ev.kayitlar, gelen, { bugun: g, dene: (l) => depo.ekle(l, { bugun: g, simdi: simdi(), yazma: false }) });
      const oz = TASIMA.disari(p);
      if (b.onizle === true) return res.json({ success: true, onizle: true, ...oz });
      let eklenen = [];
      if (p.eklenecek.length) {
        const s = depo.ekle(p.eklenecek.map(e => e.kayit), { bugun: g, simdi: simdi(), kaynak: 'gelistirme-tasima' });
        if (!s.tamam) return res.status(400).json({ success: false, error: s.hatalar.map(h => h.mesaj).join(' · '), ...oz });
        eklenen = s.eklenen;
      }
      log('INFO', `Portföyüm: geliştirme bilgisayarından taşıma — ${eklenen.length} kayıt eklendi, ${p.zatenVar.length} zaten vardı, ${p.eklenemez.length} eklenemedi.`);
      res.json({ success: true, onizle: false, ...oz, eklenenSayi: eklenen.length });
    } catch (e) { hata(res, e, 500); }
  });

  return { router: r, ozetKur, anlikTazele: () => anlikTazele(ozetKur(), true) };
}

const YAHOO_SINIF = { EQUITY: 'hisse', ETF: 'hisse-endeks', CRYPTOCURRENCY: 'kripto', MUTUALFUND: 'fon', FUTURE: 'emtia', CURRENCY: 'doviz', INDEX: 'hisse-endeks' };
const YAHOO_UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

/** Yahoo grafik ucundan tek sembolün künyesi (yoksa null). */
async function yahooKunye(kod, fetchFn) {
  const r = await fetchFn(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(kod)}?range=1d&interval=1d`, { headers: YAHOO_UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const j = await r.json();
  const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!m || !(m.regularMarketPrice > 0)) return null;
  const para = String(m.currency || '');
  const kodY = String(m.symbol || kod).toUpperCase();
  return {
    kod: kodY, sembol: kodY.replace(/\.IS$/, ''), ad: m.longName || m.shortName || kodY,
    borsa: m.fullExchangeName || m.exchangeName || '', para, sinif: YAHOO_SINIF[m.instrumentType] || 'diger', fiyat: m.regularMarketPrice,
    destek: M.PARALAR.includes(para) ? null : `para birimi ${para || '?'} desteklenmiyor (${M.PARALAR.join(', ')})`
  };
}

/**
 * Sembol ara (Yahoo): yazılan kod olduğu gibi + BIST için ".IS" denenir; ikisi de yoksa Yahoo arama ucundan en çok 5 aday
 * (şirket adıyla arama: "paypal"). Döndürür: [{ kod, sembol, ad, borsa, para, sinif, fiyat, destek }] — destek null değilse
 * eklenemez (nedeni yazar).
 */
async function sembolBul(q, fetchFn) {
  const ham = String(q || '').trim();
  const s = ham.toUpperCase();
  const kodMu = /^[A-Z0-9.^=\-]{1,24}$/.test(s);
  if (!kodMu && !/^[\p{L}0-9 .&\-]{2,40}$/u.test(ham)) throw new Error('sembol (ör. TSLA, THYAO) ya da şirket adı yazın');
  const denenecek = kodMu ? (/[.^=\-]/.test(s) ? [s] : [s, s + '.IS']) : [];
  const bulunan = (await Promise.all(denenecek.map(k => yahooKunye(k, fetchFn).catch(() => null)))).filter(Boolean);
  if (bulunan.length) return bulunan;
  const r = await fetchFn(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ham)}&quotesCount=6&newsCount=0`, { headers: YAHOO_UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Yahoo arama: HTTP ${r.status}`);
  const j = await r.json();
  const kodlar = ((j && j.quotes) || []).map(x => x.symbol).filter(Boolean).slice(0, 5);
  return (await Promise.all(kodlar.map(k => yahooKunye(k, fetchFn).catch(() => null)))).filter(Boolean);
}

/**
 * 67.4 Hesap açma planı (saf): gövde { kurum (kimlik) | kurumAd, ad, hesapTuru, para, portfoy?, faiz? } → { kayitlar, hesap } | { hata }.
 * kurumAd: aynı adlı kurum (Türkçe harf duyarsız) varsa o, yoksa yeni kurum kaydı AYNI pakette (ya hepsi ya hiçbiri). faiz.oran
 * boşsa faiz ayarı yazılmaz. Hesap kimliği yalnız aynı pakette başka kayıt ona bağlanıyorsa önceden üretilir.
 */
function hesapAcPlan(D, b) {
  const kucuk = (x) => String(x || '').trim().toLocaleLowerCase('tr-TR');
  const kayitlar = [];
  let kurum = String(b.kurum || '').trim();
  const kurumAd = String(b.kurumAd || '').trim();
  if (!kurum) {
    if (!kurumAd) return { hata: 'kurum adını yazın (ör. Midas, Enpara)' };
    const k = [...D.kurumlar.values()].find(x => kucuk(x.ad) === kucuk(kurumAd));
    if (k) kurum = k.id;
    else { kurum = yeniKimlik(D, 'k'); kayitlar.push({ tur: 'kurum', id: kurum, ad: kurumAd.slice(0, 120) }); }
  }
  const ad = String(b.ad || '').trim();
  if (!ad) return { hata: 'hesap adını yazın (ör. ABD hisseleri, Vadeli TL)' };
  const h = { tur: 'hesap', kurum, ad, hesapTuru: String(b.hesapTuru || ''), para: String(b.para || 'USD').toUpperCase().replace(/^TL$/, 'TRY') };
  if (b.portfoy != null && String(b.portfoy).trim() && String(b.portfoy).trim() !== 'tumu') h.portfoy = String(b.portfoy).trim();   // F3: hesap doğrudan bir portföye
  // 64.2: isteğe bağlı mevduat faizi ayarı aynı pakette (oran boşsa yazılmaz)
  const f = b.faiz && typeof b.faiz === 'object' && String(b.faiz.oran == null ? '' : b.faiz.oran).trim() !== '' ? b.faiz : null;
  if (f) h.id = yeniKimlik(D, 'h');
  kayitlar.push(h);
  if (f) kayitlar.push(FAIZ.ayarNormalle(h.id, f));
  return { kayitlar, hesap: h.id || null };
}

/** Yeni hesabın türü: varlığın borsası / sınıfı / para biriminden. */
const hesapTuruTahmin = (a) => (/\.IS$/.test(a.kod) ? 'bist-araci' : a.sinif === 'kripto' ? 'binance' : a.para === 'USD' ? 'abd-araci' : 'diger');

/**
 * Hızlı ekleme planı (saf): gövde { hesap | yeniHesap: { kurumAd, ad }, aday: { kod, sembol, ad, para, sinif }, adet, birimMaliyet }
 * → { kayitlar, kod } ya da { hata }. Aynı adlı kurum varsa (harf duyarsız) o kullanılır; aynı Yahoo kodlu varlık varsa o kullanılır.
 * Açılış tarihi `tarih` = DÜN (açılış gün SONU bakiyesidir; bugünün alım/satımları sonradan işlem olarak girilir).
 */
function hizliEklePlan(D, b, tarih) {
  // 67.4 "Varlık ekle" sekmeleri: kaynak tefas / binance / altin / elle / nakit (Yahoo dışı) → varlikEklePlan.
  const kaynak = String(b.kaynak || 'yahoo');
  if (kaynak !== 'yahoo') return varlikEklePlan(D, b, tarih, kaynak);
  const a = b.aday || {};
  const kod = String(a.kod || '').trim().toUpperCase();
  if (!/^[A-Z0-9.^=\-]{1,24}$/.test(kod)) return { hata: 'önce sembolü bulun ("Bul" düğmesi)' };
  const para = String(a.para || '');   // büyük harfe ÇEVRİLMEZ: Yahoo "GBp" = peni (GBP değil, 100 kat fark)
  if (!M.PARALAR.includes(para)) return { hata: `para birimi '${a.para || '?'}' desteklenmiyor (${M.PARALAR.join(', ')})` };
  const kayitlar = [];
  const kucuk = (x) => String(x || '').trim().toLocaleLowerCase('tr-TR');
  let hesap = String(b.hesap || '');
  if (!hesap) {
    const y = b.yeniHesap || {};
    const kurumAd = String(y.kurumAd || '').trim(), hesapAd = String(y.ad || '').trim();
    if (!kurumAd) return { hata: 'yeni hesap için kurum adını yazın (ör. Midas)' };
    if (!hesapAd) return { hata: 'yeni hesap için hesap adını yazın (ör. ABD hisseleri)' };
    let kurum = [...D.kurumlar.values()].find(k => kucuk(k.ad) === kucuk(kurumAd));
    if (!kurum) { kurum = { tur: 'kurum', id: yeniKimlik(D, 'k'), ad: kurumAd }; kayitlar.push(kurum); }
    hesap = yeniKimlik(D, 'h');
    kayitlar.push({ tur: 'hesap', id: hesap, kurum: kurum.id, ad: hesapAd, hesapTuru: hesapTuruTahmin({ kod, sinif: a.sinif, para }), para });
  } else {
    const h = D.hesaplar.get(hesap);
    if (!h) return { hata: 'hesap bulunamadı' };
    if (h.durum === 'kapali') return { hata: `${h.ad} kapalı — açık bir hesap seçin` };
  }
  let v = [...D.varliklar.values()].find(x => x.kaynak === 'yahoo' && String(x.kod || x.sembol).toUpperCase() === kod);
  if (v && v.para !== para) return { hata: `${v.sembol} panelde ${v.para} olarak kayıtlı, Yahoo ${para} diyor` };
  if (!v) {
    v = { ...M.varlikNormalle({ sembol: a.sembol || kod.replace(/\.IS$/, ''), ad: String(a.ad || '').slice(0, 120), sinif: M.SINIFLAR[a.sinif] ? a.sinif : 'diger', para, kaynak: 'yahoo', kod }), id: yeniKimlik(D, 'v') };
    kayitlar.push(v);
  } else if (D.islemler.some(x => x.islem === 'acilis' && x.hesap === hesap && x.varlik === v.id)) {
    return { hata: `${v.sembol} bu hesapta zaten var — listede "Düzenle" ile adedini değiştirin` };
  }
  const x = M.islemNormalle({ islem: 'acilis', hesap, varlik: v.id, tarih, adet: b.adet, birimMaliyet: b.birimMaliyet });
  if (x._sayiHatalari) return { hata: x._sayiHatalari.join(' · ') };
  if (!(x.adet > 0)) return { hata: 'adet sıfırdan büyük olmalı' };
  kayitlar.push(x);
  return { kayitlar, kod, indir: { kaynak: 'yahoo', kod } };
}

/**
 * 67.4 "Varlık ekle" (Yahoo dışı) planı (saf): gövde { hesap, kaynak, adet, birimMaliyet, … } → { kayitlar, indir, varlik } | { hata }.
 * Elimde zaten olan varlık = AÇILIŞ BAKİYESİ (tarih = gün SONU bakiyesi; varsayılan dün). Varlık yoksa aynı pakette açılır.
 *   tefas   { kod (fon kodu, ör. AFT), ad? }    → fon, TRY, kaynak tefas (aynı kodlu TEFAS varlığı varsa o)
 *   binance { kod (coin, ör. BTC; USDT eki atılır) } → kripto, USD, kaynak binance
 *   altin   {}                                   → gram altın (GRAM, TRY, kaynak altin — fiyat GC=F × USD/TRY ÷ 31,1035)
 *   elle    { sembol, ad, sinif, para, fiyat? }  → fiyat kaynağı olmayan varlık; fiyat verilirse bugüne ELLE FİYAT kaydı da yazılır
 *   nakit   { para, tutar }                      → nakit açılışı (varlık yok; aynı hesap + para birimine ikinci açılış reddedilir)
 */
function varlikEklePlan(D, b, tarih, kaynak) {
  const h = D.hesaplar.get(String(b.hesap || ''));
  if (!h) return { hata: 'hesap seçin (yeni hesap için önce "Yeni hesap" kartı)' };
  if (h.durum === 'kapali') return { hata: `${h.ad} kapalı — açık bir hesap seçin` };
  const kayitlar = [];
  if (kaynak === 'nakit') {
    const para = String(b.para || '').toUpperCase().replace(/^TL$/, 'TRY');
    if (!M.PARALAR.includes(para)) return { hata: `para birimi seçin (${M.PARALAR.join(', ')})` };
    if (D.islemler.some(x => x.islem === 'acilis' && x.hesap === h.id && !x.varlik && x.para === para)) return { hata: `${h.ad} hesabında ${para} nakit açılışı zaten var — sonraki değişiklikleri hesap kartındaki "+ işlem" (para yatırma / çekme) ile girin` };
    const x = M.islemNormalle({ islem: 'acilis', hesap: h.id, para, tutar: b.tutar, tarih, not: b.not });
    if (x._sayiHatalari) return { hata: x._sayiHatalari.join(' · ') };
    if (!(x.tutar >= 0)) return { hata: 'tutar sıfır ya da daha büyük olmalı' };
    kayitlar.push(x);
    return { kayitlar, indir: null, varlik: null };
  }
  let v = null, yeni = null;
  if (kaynak === 'tefas') {
    const kod = String(b.kod || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,6}$/.test(kod)) return { hata: 'TEFAS fon kodunu yazın (ör. AFT, TTE — 2–6 harf/rakam)' };
    v = [...D.varliklar.values()].find(x => x.kaynak === 'tefas' && String(x.kod || x.sembol).toUpperCase() === kod);
    if (!v) yeni = { sembol: kod, ad: String(b.ad || kod).slice(0, 120), sinif: 'fon', para: 'TRY', kaynak: 'tefas', kod };
  } else if (kaynak === 'binance') {
    const kod = String(b.kod || '').trim().toUpperCase().replace(/USDT$/, '');
    if (!/^[A-Z0-9]{2,15}$/.test(kod)) return { hata: 'coin kodunu yazın (ör. BTC, ETH, SOL)' };
    v = [...D.varliklar.values()].find(x => x.kaynak === 'binance' && String(x.kod || x.sembol).toUpperCase().replace(/USDT$/, '') === kod);
    if (!v) yeni = { sembol: kod, ad: String(b.ad || kod).slice(0, 120), sinif: 'kripto', para: 'USD', kaynak: 'binance', kod };
  } else if (kaynak === 'altin') {
    v = [...D.varliklar.values()].find(x => x.kaynak === 'altin');
    if (!v) yeni = { sembol: 'GRAM', ad: 'Gram altın', sinif: 'emtia', para: 'TRY', kaynak: 'altin' };
  } else if (kaynak === 'elle') {
    const sembol = String(b.sembol || '').trim().toUpperCase();
    if (!sembol) return { hata: 'sembolü yazın (ör. EUROBOND25, ARSA)' };
    const para = String(b.para || '').toUpperCase().replace(/^TL$/, 'TRY');
    if (!M.PARALAR.includes(para)) return { hata: `para birimi seçin (${M.PARALAR.join(', ')})` };
    v = [...D.varliklar.values()].find(x => x.kaynak === 'elle' && String(x.sembol).toUpperCase() === sembol);
    if (v && v.para !== para) return { hata: `${v.sembol} panelde ${v.para} olarak kayıtlı` };
    if (!v) yeni = { sembol, ad: String(b.ad || sembol).slice(0, 120), sinif: M.SINIFLAR[b.sinif] ? b.sinif : 'diger', para, kaynak: 'elle' };
  } else return { hata: `bilinmeyen kaynak: ${kaynak}` };
  if (yeni) { v = { ...M.varlikNormalle(yeni), id: yeniKimlik(D, 'v') }; kayitlar.push(v); }
  else if (D.islemler.some(x => x.islem === 'acilis' && x.hesap === h.id && x.varlik === v.id)) {
    return { hata: `${v.sembol} bu hesapta zaten var — listede "Düzenle" ile adedini değiştirin` };
  }
  const x = M.islemNormalle({ islem: 'acilis', hesap: h.id, varlik: v.id, tarih, adet: b.adet, birimMaliyet: b.birimMaliyet, not: b.not });
  if (x._sayiHatalari) return { hata: x._sayiHatalari.join(' · ') };
  if (!(x.adet > 0)) return { hata: kaynak === 'altin' ? 'gram sıfırdan büyük olmalı' : 'adet sıfırdan büyük olmalı' };
  kayitlar.push(x);
  if (kaynak === 'elle' && String(b.fiyat == null ? '' : b.fiyat).trim() !== '') {
    const c = M.sayiCoz(b.fiyat);
    if (c.hata || !(c.deger > 0)) return { hata: 'güncel fiyat: ' + (c.hata || 'sıfırdan büyük olmalı') };
    kayitlar.push({ tur: 'fiyat', varlik: v.id, tarih: String(b.fiyatTarih || tarih), fiyat: c.deger });
  }
  const indir = kaynak === 'tefas' ? { kaynak, kod: v.kod || v.sembol, yeni: !!yeni } : kaynak === 'binance' ? { kaynak, kod: String(v.kod || v.sembol).toUpperCase().replace(/USDT$/, ''), yeni: !!yeni }
    : kaynak === 'altin' ? { kaynak, kod: 'GC=F' } : null;
  return { kayitlar, indir, varlik: v };
}

/**
 * 67.3 "Para ekle" planını kaydetme planı (saf): gövde { hesap, yatirma: { tutar, para, not } | null, satislar: [{ varlik, adet,
 * fiyat }], alislar: [{ varlik | aday: { kod, sembol, ad, para, sinif }, adet, fiyat }] } → { kayitlar, kodlar (fiyatı indirilecek
 * yeni Yahoo kodları), ozet } ya da { hata }. Satış adedi hesaptaki eldeki adedi aşamaz. Kayıtlar acilisSonrasi (açılış bugünse
 * üstüne eklenir) ve gün içi sıra yatırma 50 → satış 100+ → alış 300+.
 */
function planKaydetPlan(D, muh, b, tarih) {
  const h = D.hesaplar.get(String(b.hesap || ''));
  if (!h) return { hata: 'hesap bulunamadı' };
  if (h.durum === 'kapali') return { hata: `${h.ad} kapalı — açık bir hesap seçin` };
  const satislar = Array.isArray(b.satislar) ? b.satislar : [], alislar = Array.isArray(b.alislar) ? b.alislar : [];
  if (satislar.length > 150 || alislar.length > 150) return { hata: 'çok fazla satır (en çok 150 satış, 150 alış)' };
  const kayitlar = [], kodlar = [], ozet = { yatirma: 0, satis: 0, alis: 0, yeniVarlik: 0 };
  const not = 'para ekle planı';
  const y = b.yatirma && typeof b.yatirma === 'object' ? b.yatirma : null;
  if (y && !(y.tutar == null || String(y.tutar).trim() === '' || Number(y.tutar) === 0)) {
    const x = M.islemNormalle({ islem: 'yatir', hesap: h.id, para: y.para || h.para, tutar: y.tutar, tarih, not: String(y.not || not).slice(0, 200) });
    if (x._sayiHatalari) return { hata: 'yatırma: ' + x._sayiHatalari.join(' · ') };
    if (!(x.tutar > 0)) return { hata: 'yatırılan tutar sıfırdan büyük olmalı' };
    x.acilisSonrasi = true; x.gunIciSira = 50;
    kayitlar.push(x); ozet.yatirma = 1;
  }
  const elde = (vid) => { const c = muh && muh.ciftler && muh.ciftler.get(M.ciftAnahtari(h.id, vid)); return c ? c.ana.adet : 0; };
  const satilan = new Map();
  for (let i = 0; i < satislar.length; i++) {
    const s = satislar[i] || {};
    const v = D.varliklar.get(String(s.varlik || ''));
    if (!v) return { hata: `satış ${i + 1}: varlık bulunamadı` };
    const x = M.islemNormalle({ islem: 'sat', hesap: h.id, varlik: v.id, para: v.para, adet: s.adet, fiyat: s.fiyat, tarih, not });
    if (x._sayiHatalari) return { hata: `${v.sembol}: ${x._sayiHatalari.join(' · ')}` };
    if (!(x.adet > 0)) return { hata: `${v.sembol}: satış adedi sıfırdan büyük olmalı` };
    if (!(x.fiyat > 0)) return { hata: `${v.sembol}: satış fiyatı sıfırdan büyük olmalı` };
    const toplam = (satilan.get(v.id) || 0) + x.adet, e = elde(v.id);
    if (toplam > e + 1e-9) return { hata: `${v.sembol}: satılacak ${String(toplam).replace('.', ',')} adet, ${h.ad} hesabında ${String(Math.round(e * 1e9) / 1e9).replace('.', ',')} adet var — elde olandan fazla satılamaz` };
    satilan.set(v.id, toplam);
    x.acilisSonrasi = true; x.gunIciSira = 100 + i;
    kayitlar.push(x); ozet.satis += 1;
  }
  const yeniKod = new Map();
  for (let i = 0; i < alislar.length; i++) {
    const a = alislar[i] || {};
    let v = a.varlik ? D.varliklar.get(String(a.varlik)) : null;
    if (a.varlik && !v) return { hata: `alış ${i + 1}: varlık bulunamadı` };
    if (!v) {
      const ad = a.aday || {};
      const kod = String(ad.kod || '').trim().toUpperCase();
      if (!/^[A-Z0-9.^=\-]{1,24}$/.test(kod)) return { hata: `alış ${i + 1}: sembol bulunamadı (önce "Bul")` };
      const para = String(ad.para || '');
      if (!M.PARALAR.includes(para)) return { hata: `${kod}: para birimi '${ad.para || '?'}' desteklenmiyor (${M.PARALAR.join(', ')})` };
      v = yeniKod.get(kod) || [...D.varliklar.values()].find(z => z.kaynak === 'yahoo' && String(z.kod || z.sembol).toUpperCase() === kod);
      if (v && v.para !== para) return { hata: `${v.sembol} panelde ${v.para} olarak kayıtlı, Yahoo ${para} diyor` };
      if (!v) {
        v = { ...M.varlikNormalle({ sembol: ad.sembol || kod.replace(/\.IS$/, ''), ad: String(ad.ad || '').slice(0, 120), sinif: M.SINIFLAR[ad.sinif] ? ad.sinif : 'diger', para, kaynak: 'yahoo', kod }), id: yeniKimlik(D, 'v') };
        kayitlar.push(v); kodlar.push(kod); yeniKod.set(kod, v); ozet.yeniVarlik += 1;
      }
    }
    const x = M.islemNormalle({ islem: 'al', hesap: h.id, varlik: v.id, para: v.para, adet: a.adet, fiyat: a.fiyat, tarih, not });
    if (x._sayiHatalari) return { hata: `${v.sembol}: ${x._sayiHatalari.join(' · ')}` };
    if (!(x.adet > 0)) return { hata: `${v.sembol}: alış adedi sıfırdan büyük olmalı` };
    if (!(x.fiyat > 0)) return { hata: `${v.sembol}: alış fiyatı sıfırdan büyük olmalı` };
    x.acilisSonrasi = true; x.gunIciSira = 300 + i;
    kayitlar.push(x); ozet.alis += 1;
  }
  if (!ozet.yatirma && !ozet.satis && !ozet.alis) return { hata: 'kaydedilecek işlem yok' };
  return { kayitlar, kodlar, ozet };
}

/** 67.2: hızlı ekle / düzenle alış tarihi — boş → varsayılan; YYYY-AA-GG, bugünden ileri olamaz. Döndürür { tarih } | { hata }. */
function alisTarihi(x, varsayilan, bugunGun) {
  const s = String(x == null ? '' : x).trim();
  if (!s) return { tarih: varsayilan };
  if (!M.tarihGecerli(s)) return { hata: `alış tarihi geçersiz: ${s} (YYYY-AA-GG)` };
  if (s > bugunGun) return { hata: 'alış tarihi bugünden ileri olamaz' };
  return { tarih: s };
}

/**
 * Yeni panel F3 — hesabı portföye bağlama planı (saf): gövde { portfoy } ya da { yeniPortfoyAd } (aynı adlı portföy varsa —
 * harf duyarsız — o kullanılır; yoksa aynı pakette oluşturulur: "eşin hesabı → Eş" tek adım). Zaten o portföydeyse hata.
 * Döndürür: { kayitlar, portfoy } ya da { hata }.
 */
function portfoyBaglaPlan(D, hesapId, b) {
  const h = D.hesaplar.get(hesapId);
  if (!h) return { hata: 'hesap bulunamadı' };
  const kucuk = (x) => String(x || '').trim().toLocaleLowerCase('tr-TR');
  const kayitlar = [];
  let pid = String(b.portfoy || '').trim();
  if (!pid) {
    const ad = String(b.yeniPortfoyAd || '').trim();
    if (!ad) return { hata: 'portföy seçin ya da yeni portföy adı yazın' };
    const var_ = [...D.portfoyler.values()].find(p => kucuk(p.ad) === kucuk(ad));
    if (var_) pid = var_.id;
    else { pid = yeniKimlik(D, 'p'); kayitlar.push({ tur: 'portfoy', id: pid, ad }); }
  } else if (!D.portfoyler.has(pid)) return { hata: 'portföy bulunamadı' };
  if ((h.portfoy || M.VARSAYILAN_PORTFOY) === pid) return { hata: `${h.ad} zaten bu portföyde` };
  kayitlar.push({ tur: 'hesap-portfoy', hesap: hesapId, portfoy: pid });
  return { kayitlar, portfoy: pid };
}

/** Toplu eklemede kayıtlar birbirine kimlikle bağlanır: önceden çakışmayan kimlik üret (depo.ekle verilen kimliği korur). */
let _kimlikSayac = 0;
function yeniKimlik(D, onEk) {
  let id;
  do { _kimlikSayac += 1; id = `${onEk}${Date.now().toString(36)}${_kimlikSayac}`; } while (D.kurumlar.has(id) || D.hesaplar.has(id) || D.varliklar.has(id) || (D.portfoyler && D.portfoyler.has(id)));
  return id;
}

/**
 * Pozisyon (hesap|varlık) → { id, yalniz }: etkin açılış kaydı ve o çifte başka işlem dokunmuyor mu (hızlı Düzenle/Kaldır
 * yalnız o zaman açılır; başka işlem varsa düzeltme İşlem defterinden yapılır).
 */
function acilisHaritasi(D) {
  const m = new Map(), diger = new Set(), bolunen = new Set();
  for (const x of D.islemler) {
    if (x.islem === 'acilis' && x.varlik) m.set(M.ciftAnahtari(x.hesap, x.varlik), x.id);
    else if (x.islem === 'bolunme') bolunen.add(x.varlik);
    else for (const c of MUH.dokunulanCiftler(D, x)) diger.add(c);
  }
  return Object.fromEntries([...m].map(([c, id]) => [c, { id, yalniz: !diger.has(c) && !bolunen.has(c.split('|')[1]) }]));
}

/** Seyreltme: en çok n nokta (ilk ve son korunur). */
function seyrelt(d, n) {
  if (d.length <= n) return d;
  const adim = d.length / n, o = [];
  for (let i = 0; i < n; i++) o.push(d[Math.floor(i * adim)]);
  o.push(d[d.length - 1]);
  return o;
}

/** Fiyatları ağdan tazele: Yahoo (artımlı, lab dosyaları), TEFAS, Binance son fiyat. Hata kalem başına raporlanır. */
async function fiyatlariYenile(D, ops = {}) {
  const indir = ops.indir || require('../portfoy/indir');
  const sonuclar = [], hatalar = [];
  const fiyatlar = (depo.jsonOku('fiyat-onbellek.json') || {}).fiyatlar || {};
  // 64.2: Rapor faktörleri (QQQ, GLD) de tazelenir — stres/beta için 1 yıllık geçmiş (BTC: market.db, ayrı indirici)
  const yahoo = new Set(['USDTRY=X', 'EURUSD=X', 'GBPUSD=X', 'GC=F', 'QQQ', 'GLD']);
  const tefas = new Set(), binance = new Set();
  for (const v of D.varliklar.values()) {
    if (v.kaynak === 'yahoo') yahoo.add(v.kod || v.sembol);
    if (v.kaynak === 'tefas') tefas.add((v.kod || v.sembol).toUpperCase());
    if (v.kaynak === 'binance') binance.add((v.kod || v.sembol).toUpperCase().replace(/USDT$/, ''));
  }
  for (const s of yahoo) {
    try {
      if (s === 'USDTRY=X' && indir.kurIndir) { const x = await indir.kurIndir(); sonuclar.push(`USDTRY=X → ${x.son}`); }
      else { const x = await indir.yahooIndir(s); sonuclar.push(`${s} → ${x.son}`); }
    } catch (e) { hatalar.push(`${s}: ${e.message}`); }
  }
  for (const k of tefas) {
    try { const x = await indir.tefasIndir(k); sonuclar.push(`TEFAS ${k} → ${x.son || 'tamam'}`); } catch (e) { hatalar.push(`TEFAS ${k}: ${e.message}`); }
  }
  for (const c of binance) {
    try { const x = await F.binanceSon(`${c}USDT`, ops.fetch || globalThis.fetch); fiyatlar[c] = { fiyat: x.deger, zaman: x.zaman, kaynak: 'Binance /api/v3/ticker/price' }; sonuclar.push(`${c}USDT → ${x.deger}`); }
    catch (e) { hatalar.push(`Binance ${c}: ${e.message}`); }
  }
  if (binance.size) depo.jsonYaz('fiyat-onbellek.json', { zaman: new Date().toISOString(), fiyatlar });
  try { require('../portfoy/kaynaklar').onbellekTemizle(); } catch (e) { /* yok */ }
  if (sonuclar.length) (ops.log || (() => {}))('INFO', `📒 Portföyüm fiyatları yenilendi: ${sonuclar.length} kalem${hatalar.length ? `, ${hatalar.length} hata` : ''}`);
  return { sonuclar, hatalar };
}

/**
 * Rapor faktörleri (64.2): birim(t) → USD fonksiyonları — diskteki ücretsiz seriler (ağ yok). BTC: market.db Binance günlük
 * (yoksa Yahoo BTC-USD) · QQQ: Yahoo · altın: Yahoo GLD (yoksa GC=F) · tl: 1 TL'nin dolar değeri (USDTRY=X) · bist: XU030.IS
 * (tasarımcı verisi) × kur · usd: 1 · kur:EUR / kur:GBP. Dosyası olmayan faktör null (rapor "veri yok" der).
 */
function raporFaktorleri(kurlar) {
  const fk = {};
  const dolu = (n) => (n && n.length ? n : null);
  let btc = []; try { btc = F.binanceSeri('BTC', null).noktalar; } catch (e) { btc = []; }
  if (!btc.length) btc = F.yahooSeri('BTC-USD').noktalar;
  if (dolu(btc)) fk.btc = RAPOR.birimUSD(btc, 'USD', kurlar);
  const qqq = F.yahooSeri('QQQ').noktalar; if (dolu(qqq)) fk.qqq = RAPOR.birimUSD(qqq, 'USD', kurlar);
  const gld = dolu(F.yahooSeri('GLD').noktalar) || dolu(kurlar.ALTIN); if (gld) fk.altin = RAPOR.birimUSD(gld, 'USD', kurlar);
  if (dolu(kurlar.TRY)) fk.tl = (t) => { const u = F.usdDegeri('TRY', t, kurlar); return u && u.yasGun <= 10 ? u.deger : null; };
  fk.usd = () => 1;
  for (const p of ['EUR', 'GBP']) if (dolu(kurlar[p])) fk['kur:' + p] = (t) => { const u = F.usdDegeri(p, t, kurlar); return u && u.yasGun <= 10 ? u.deger : null; };
  try {
    const g = require('../tasarimci/veri').ham('XU030.IS').gunler.filter(x => x.c > 0).map(x => [x.t, x.c]);
    if (g.length) fk.bist = RAPOR.birimUSD(g, 'TRY', kurlar);
  } catch (e) { /* BIST 30 dosyası yok */ }
  return fk;
}

/** Lab varlık kimliği (yahoo:QQQ, tefas:AFT, kripto:BTC) ↔ Portföyüm varlığı. */
function labKimligi(v) {
  if (v.kaynak === 'yahoo') return 'yahoo:' + (v.kod || v.sembol);
  if (v.kaynak === 'tefas') return 'tefas:' + (v.kod || v.sembol).toUpperCase();
  if (v.kaynak === 'binance') return 'kripto:' + (v.kod || v.sembol).toUpperCase().replace(/USDT$/, '');
  return null;
}
const LAB_SINIF = { 'hisse-endeks': 'hisse-endeks', hisse: 'hisse', fon: 'fon', kripto: 'kripto', emtia: 'emtia', doviz: 'doviz', tahvil: 'tahvil', strateji: 'kripto', 'tl-nakit': 'tl-nakit', nakit: 'nakit' };

/** Laboratuvar kararından hedef taslağı (varlık düzeyi + sınıf düzeyi). Kaydetmez — kullanıcı düzenleyicide kaydeder. */
function labTaslak(k, D, KAT) {
  const t = k.tanim || {};
  const plan = k.plan && Array.isArray(k.plan.satirlar) ? new Map(k.plan.satirlar.map(s => [s.kimlik, s.hedefW])) : new Map();
  const esle = new Map([...D.varliklar.values()].map(v => [labKimligi(v), v]).filter(([a]) => a));
  const varlik = {}, sinif = {}, eslesmeyen = [];
  let toplam = 0;
  for (const x of t.varliklar || []) {
    const kim = x.kimlik || x;
    const w = plan.has(kim) ? Number(plan.get(kim)) : Number(x.agirlik);
    if (!(w > 0)) continue;
    toplam += w;
    let s = null;
    try { s = KAT.varlik(kim).sinif; } catch (e) { s = /^tr:/.test(kim) ? 'tl-nakit' : /^nakit:/.test(kim) ? 'nakit' : 'diger'; }
    const ps = LAB_SINIF[s] || 'diger';
    sinif[ps] = (sinif[ps] || 0) + w;
    const v = esle.get(kim);
    if (v) varlik[v.id] = (varlik[v.id] || 0) + w; else eslesmeyen.push({ kimlik: kim, agirlik: w });
  }
  const yuzde = (o) => Object.fromEntries(Object.entries(o).map(([a, w]) => [a, toplam > 0 ? Math.round(w / toplam * 10000) / 100 : 0]));
  return { id: k.id, zaman: k.zaman, not: k.not || '', varlikSayisi: (t.varliklar || []).length, sinif: yuzde(sinif), varlik: yuzde(varlik), eslesmeyen: eslesmeyen.map(e => ({ ...e, agirlik: toplam > 0 ? Math.round(e.agirlik / toplam * 10000) / 100 : 0 })), plansiz: !plan.size && !(t.varliklar || []).some(x => x.agirlik > 0) };
}

/** Laboratuvar Uygulama planı girdisi: lab kimliğiyle USD tutarlar + lab hesap türü başına nakit (USD). Öneri yalnız bilgi. */
function labGirdisi(D, deg) {
  const satirlar = [], eslesmeyen = [];
  const LAB_HESAP = { 'abd-araci': 'abd-araci', 'tr-banka': 'tr-banka', tefas: 'tefas', binance: 'binance', 'bist-araci': 'tr-banka' };
  for (const p of deg.pozisyonlar) {
    if (Math.abs(p.adet) < 1e-12) continue;
    const v = D.varliklar.get(p.varlik);
    const h = D.hesaplar.get(p.hesap);
    const kim = labKimligi(v);
    if (!kim || p.degerUSD == null) { eslesmeyen.push({ sembol: p.sembol, hesap: p.hesapAd, neden: !kim ? 'laboratuvar kimliği yok (elle/altın kaynağı)' : 'fiyat yok' }); continue; }
    satirlar.push({ kimlik: kim, usd: p.degerUSD, adet: p.adet, hesap: LAB_HESAP[h && h.hesapTuru] || null, sembol: p.sembol });
  }
  const nakit = {}, atlananNakit = [];
  for (const n of deg.nakitler) {
    const h = D.hesaplar.get(n.hesap);
    const lh = LAB_HESAP[h && h.hesapTuru];
    if (Math.abs(n.tutar) < 1e-9) continue;
    if (!lh) { atlananNakit.push({ hesap: n.hesapAd, para: n.para, tutar: n.tutar, neden: 'hesap türünün laboratuvarda karşılığı yok (' + ((h && h.hesapTuru) || '?') + ')' }); continue; }
    if (!(n.degerUSD > 0)) { atlananNakit.push({ hesap: n.hesapAd, para: n.para, tutar: n.tutar, neden: n.degerUSD == null ? 'kur yok' : 'eksi nakit' }); continue; }
    nakit[lh] = (nakit[lh] || 0) + n.degerUSD;
  }
  // Aynı lab kimliği birden çok hesapta: toplanır.
  const birlesik = new Map();
  for (const s of satirlar) { const x = birlesik.get(s.kimlik) || { ...s, usd: 0, adet: 0 }; x.usd += s.usd; x.adet += s.adet; birlesik.set(s.kimlik, x); }
  return { satirlar: [...birlesik.values()], nakit, atlananNakit, eslesmeyen, tarih: deg.tarih, toplamUSD: deg.toplamUSD };
}

module.exports = { kur, router: (ops) => kur(ops).router, fiyatlariYenile, raporFaktorleri, labTaslak, labGirdisi, labKimligi, seyrelt, sembolBul, hizliEklePlan, varlikEklePlan, hesapAcPlan, acilisHaritasi, portfoyBaglaPlan, alisTarihi, planKaydetPlan };
