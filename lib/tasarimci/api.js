/**
 * PORTFÖY TASARIMCISI — HTTP UÇLARI `/api/tasarimci/*` (F2: yalnız backend; panel sayfası F3). PLAN-PORTFOY-TASARIMCI.md (d) Uçlar.
 * Öz test: node scripts/tasarimci-selftest.js (J).
 *
 * GET (telefonda da açık; HİÇBİR GET dosya yazmaz, tik tetiklemez, ağa çıkmaz — yalnız defteri ve veri dosyalarını okur):
 *   /api/tasarimci/durum              son tik özeti (durum.json) + veri tazeliği + zamanlayıcı + makine + sermaye tanımlı mı
 *   /api/tasarimci/katalog            model + kıyas + yalnız-katalog satırları + F3 strateji künyesi (katalog.js: stratejiler,
 *                                     şablonlar, kurucu kolları — PLAN SONUÇ rakamları birebir)
 *   /api/tasarimci/modeller           üç model: son endeks, toplam getiri, MaxDD, kıyasların son değeri (+ tutar)
 *   /api/tasarimci/model/:id          günlük satırlar (endeks, BIST için endeksTl, 837 kollar), kıyas serileri, son pozisyon, dolumlar
 *   /api/tasarimci/model/:id/kararlar dondurulmuş karar günlüğü
 *   /api/tasarimci/oneri              bu ayın hedefleri (her modelin son kararı + emir taslağı + sonraki karar takvimi)
 *   /api/tasarimci/model/:id/fark?ay= F5: gerçek (Portföyüm, TWR) seri + uygulama farkı ayrıştırması (ay + başlangıçtan) + kol
 *                                     katkısı (Carino); lib/tasarimci/fark.js. Yüzdeler serbest; değer telefondaGizle'de atılır.
 *   /api/tasarimci/aylik              F5: model başına aylık tablo (model, gerçek, fark, kıyaslar) + yıl toplamı
 *   /api/tasarimci/aday-havuzu        62.3: sıradaki ay sonu kararının önizlemesi (lib/tasarimci/adayHavuzu.js; zamanlayıcı yazar)
 *   /api/tasarimci/gecmis/:id         62.3: geçmiş (backtest) aylık 100 tabanlı eğri + kıyas (lib/portfoy/seri; iyimser H1; 30 dk önbellek)
 *   /api/tasarimci/portfoy-botlar     68.8: Botlar › portföy botlarının özet satırları (lib/tasarimci/portfoyBot.js)
 *   /api/tasarimci/portfoy-bot/:id    68.8: bir portföy botu — kâğıt hesap, kıyas al-tut, karar defteri, sıradaki karar
 *   /api/tasarimci/portfoy-bot/:id/fiyat?s= 68.8: botun işlem gördüğü hissenin ham günlük açılış/kapanışı (hisse grafiği)
 *                                     (bu üçü geliştirme bilgisayarında sunucudan okunur — lib/evOkuma.js EV_YOLU)
 *   /api/tasarimci/disari             F5: aylık dışa aktarım dosyaları (ay, SHA-256, zincir sağlam mı) — tutar yok
 *   /api/tasarimci/disari/:ay.json|csv F5: indir; ?tutarli=1 CSV'ye gerçek endeks + değer (telefonda 403)
 *   /api/tasarimci/emirler?ay=&model= F4: bu ayın GERÇEK portföy emir listesi (lib/tasarimci/emirler.js — Portföyüm pozisyonu →
 *                                     hedef; önce sat sonra al; tam adet + kalan sapma; 837 bant/aktarım satırı) + "Uyguladım"
 *                                     kayıtları (Portföyüm'den, iptal edilmemiş) + "atla" durumu. Portföyüm'e de YAZMAZ.
 * POST (YALNIZ bu bilgisayardaki masaüstü panel; telefon kademesinde lib/guvenlik.js 403 verir — beyaz listede YOK):
 *   /api/tasarimci/yenile             tik'i şimdi tetikle (alt süreç; veri talebi dahil) → { baslatildi | calisiyor }
 *   /api/tasarimci/sermaye            { modeller: { id: { tutar } }, kesirli?, minIslemUSD?, telefondaGizle?, hesaplar? } →
 *                                     data/tasarimci/sermaye.json (birleştirerek; tutar boş/0 = sil; git dışı)
 *   /api/tasarimci/emirler/:ay/uygula { model, satirlar: [{ anahtar, adet, fiyat, ucret, tutar }], tarih, yazma, imza }
 *                                     yazma !== true → ÖNİZLEME (Portföyüm denetleyicisi yazma:false; kayıtlar + imza);
 *                                     yazma: true + aynı imza → tek atomik Portföyüm paketi (varlık + al/sat/transfer,
 *                                     kaynakKayit:'tasarimci'). Uygulanmış (iptal edilmemiş) satır → 409; atlanan model → 409;
 *                                     seçilmeyen satırlar açık kalır (kısmi uygulama).
 *   /api/tasarimci/emirler/:ay/geri-al { uygulama, neden } → o uygulamanın işlemlerine Portföyüm TERS KAYDI (duzeltme)
 *   /api/tasarimci/emirler/:ay/atla   { model, neden, kaldir? } → data/tasarimci/uygulama/YYYY-MM.json (uygulanmışsa 409)
 *   /api/tasarimci/hedef-aktar        { duzey: 'sinif'|'varlik', bant, yazma, imza } → Portföyüm hedef kaydı (önizleme → onay)
 *   /api/tasarimci/tasarim            KENDİ TASARIMLARIM (lib/tasarimci/tasarimlar.js; Ö11 + Ö14): { islem: 'kaydet' | 'izlemeye-al' |
 *                                     'yeni-surum' | 'durdur', id?, ad?, kollar?, dengeleme?, not?, yazma?, imza? } → yazma !== true:
 *                                     önizleme { satir, imza, uyarilar }; yazma: true + aynı imza → tasarimlar.jsonl'a TEK SATIR eklenir
 *                                     (yalnız eklenir; imza farkı 409 'onizleme'). En çok 3 izlenen (409 'encok'). Defter/deneme sayacı
 *                                     DOKUNULMAZ; emir uçları kendi tasarımları (m-u-*) kabul etmez.
 * GET /api/tasarimci/tasarimlar      kayıtlı tasarımlar: sürüm geçmişi + izlenen serinin 100 tabanlı ileri değeri (yalnız okur)
 *
 * GERÇEK TUTAR (T2, K6): data/tasarimci/sermaye.json (git dışı, yalnız sunucu) varsa modellere `tutar` eklenir:
 *   { "modeller": { "m-837": { "tutar": 10000, "para": "USD" }, … }, "telefondaGizle": false }
 *   Yoksa yalnız endeks (100 tabanlı) döner. Telefon kuralı Portföyüm'le AYNI (lib/portfoyum/api.js: GET'ler telefonda da
 *   tutarları gösterir — S6 "telefondan görmek Tailscale + panel ile"); `telefondaGizle: true` ise telefon kademesinde tutar
 *   alanları hiç gönderilmez. Tutar Telegram'a, kayitlar/'a, git'e gitmez (bu modül Telegram'a hiçbir şey yollamaz).
 */
'use strict';
const express = require('express');
const T = require('./takvim');
const DF = require('./defter');
const MD = require('./model');
const KT = require('./katalog');
const E = require('./emirler');
const PM = require('../portfoyum/model');
const depoP = () => require('../portfoyum/depo');

function sermayeOku() {
  const j = DF.jsonOku('sermaye.json');
  if (!j || typeof j !== 'object' || !j.modeller || typeof j.modeller !== 'object') return null;
  const modeller = {};
  for (const [id, x] of Object.entries(j.modeller)) if (x && Number.isFinite(+x.tutar) && +x.tutar > 0) modeller[id] = { tutar: +x.tutar, para: String(x.para || (id === 'm-bist-m10' ? 'TRY' : 'USD')), ...(/^\d{4}-\d{2}-\d{2}$/.test(x.baslangicGunu || '') ? { baslangicGunu: x.baslangicGunu } : {}) };
  return { modeller, telefondaGizle: j.telefondaGizle === true,
    // F4 ayarları (Ö2): kesirli hisse varsayılmaz; eşik; hesap türü başına tercih edilen Portföyüm hesabı
    kesirli: j.kesirli === true, minIslemUSD: Number.isFinite(+j.minIslemUSD) && +j.minIslemUSD >= 0 && j.minIslemUSD !== null && j.minIslemUSD !== '' ? +j.minIslemUSD : E.VARSAYILAN.minIslemUSD,
    hesaplar: j.hesaplar && typeof j.hesaplar === 'object' ? { ...j.hesaplar } : {} };
}
/** İstek için tutar gösterilebilir mi? → sermaye nesnesi | null */
function tutarIzni(req) {
  const s = sermayeOku();
  if (!s || !Object.keys(s.modeller).length) return null;
  if (req && req.kademe === 'telefon' && s.telefondaGizle) return null;
  return s;
}
/** Model satırlarından tutar: para birimindeki endeks (BIST TL) × başlangıç tutarı / 100. */
function tutarHesapla(id, satirlar, s) {
  const x = s && s.modeller[id]; if (!x) return null;
  const son = satirlar[satirlar.length - 1];
  const alan = x.para === 'TRY' && id === 'm-bist-m10' ? 'endeksTl' : 'endeks';
  // B4 (DENETIM-CANLI-PORTFOY): sermaye girildiği/değiştiği gün (baslangicGunu) endeksi tabandır — girilen tutar = O GÜN modele
  // ayrılan para; sonrası model getirisiyle büyür. Eski kayıtta gün yoksa 2026-10-12 tabanı (100) korunur.
  let e = son ? son[alan] : 100;
  if (x.baslangicGunu && son) {
    const b = satirlar.filter(r => r.gun <= x.baslangicGunu).pop();
    if (b && b[alan] > 0) e = e * 100 / b[alan];
  }
  return { para: x.para, baslangic: x.tutar, baslangicGunu: x.baslangicGunu || null, guncel: x.tutar * e / 100, kar: x.tutar * (e / 100 - 1), endeksAlani: alan, not: 'yalnız bu bilgisayarda saklanır; git ve Telegram dışı' };
}

function yukle() {
  const g = DF.oku('gunluk'), k = DF.oku('kararlar'), d = DF.oku('dolumlar');
  const seri = new Map(MD.SIRA.map(id => [id, []]));
  for (const s of g.satirlar) if (seri.has(s.model)) seri.get(s.model).push(s);
  return { seri, kararlar: k.satirlar, dolumlar: d.satirlar, bozuk: [...g.bozuk, ...k.bozuk, ...d.bozuk] };
}
const kiyasIdleri = m => (m.kiyaslar || []).map(k => MD.KIYAS_ESLE[k]).filter(Boolean);
const sadeSatir = s => { const { sha, onceki, tur, surum, model, ...r } = s; void sha; void onceki; void tur; void surum; void model; return r; };

function kur(ops = {}) {
  const { zamanlayici = null, log = () => {} } = ops;
  const r = express.Router();
  r.use('/api/tasarimci', express.json({ limit: '64kb' }));
  const hata = (res, e, kod = 500) => res.status(kod).json({ success: false, error: e && e.message ? e.message : String(e) });

  r.get('/api/tasarimci/durum', (req, res) => {
    try {
      let tazelik = null; try { tazelik = require('./veri').tazelik(); } catch (e) { tazelik = { hata: e.message }; }
      const s = sermayeOku();
      res.json({ success: true, durum: DF.jsonOku('durum.json'), tazelik, makine: DF.makine(), zamanlayici: zamanlayici ? zamanlayici.durum() : null,
        kilit: DF.kilitDurumu(), sermayeTanimli: !!(s && Object.keys(s.modeller).length), kademe: req.kademe || null,
        sonrakiKararlar: { NYSE: T.sonrakiKararlar(3, 'NYSE'), BIST: T.sonrakiKararlar(3, 'BIST') },
        uyari: 'İleri dönem kısa; kabuller sonradan konmuş ölçütle (H1) verildi; en az 12–24 ay görmeden yorum yok.' });
    } catch (e) { hata(res, e); }
  });

  r.get('/api/tasarimci/katalog', (req, res) => {
    try {
      const S = MD.sabitleme();
      res.json({ success: true, surum: S.surum, tarih: S.tarih,
        modeller: S.modeller.map(m => ({ id: m.id, ad: m.ad, kaynakDeneme: m.kaynakDeneme, kabul: m.kabul, kollar: m.kollar, dengeleme: m.dengeleme || null, kural: m.kural || null, baslangic: { ilkUygulamaGunu: m.baslangic.ilkUygulamaGunu, ilkKararGunu: m.baslangic.ilkKararGunu }, kiyaslar: kiyasIdleri(m) })),
        kiyaslar: Object.entries(MD.SERI).filter(([, v]) => v.tur === 'kiyas').map(([id, v]) => ({ id, ad: v.ad, takvim: v.takvim })),
        yalnizKatalog: S.yalnizKatalog, uygulama: S.uygulama,
        stratejiler: KT.liste(), sablonlar: KT.SABLONLAR, kollar: KT.KOLLAR, dengelemeler: KT.DENGELEME_AD, etiketler: { sablon: KT.ETIKET_SABLON, olculmemis: KT.ETIKET_OLCULMEMIS }, h1Uyari: KT.H1_UYARI });
    } catch (e) { hata(res, e); }
  });

  r.get('/api/tasarimci/modeller', (req, res) => {
    try {
      const Y = yukle(), S = MD.sabitleme(), izin = tutarIzni(req);
      const modeller = S.modeller.map(m => {
        const st = Y.seri.get(m.id) || [], met = MD.metrik(st);
        const kiyas = Object.fromEntries(kiyasIdleri(m).map(k => [k, MD.metrik(Y.seri.get(k) || [])]));
        const sonKarar = Y.kararlar.filter(k => k.model === m.id && k.tur2 !== 'dengeleme').pop() || null;
        return { id: m.id, ad: m.ad, kabul: m.kabul, takvim: MD.SERI[m.id].takvim, para: MD.SERI[m.id].para, baslangic: m.baslangic.ilkUygulamaGunu,
          metrik: met, ...(m.id === 'm-bist-m10' ? { metrikTl: MD.metrik(st, 'endeksTl') } : {}), kiyas,
          sonKarar: sonKarar && { kararGunu: sonKarar.kararGunu, uygulamaGunu: sonKarar.uygulamaGunu, liste: (sonKarar.liste || []).map(x => x.s), agirlik: sonKarar.liste ? undefined : sonKarar.agirlik },
          ...(izin ? { tutar: tutarHesapla(m.id, st, izin) } : {}) };
      });
      res.json({ success: true, modeller, bozuk: Y.bozuk, tutarGizli: !izin && !!sermayeOku() });
    } catch (e) { hata(res, e); }
  });

  r.get('/api/tasarimci/model/:id', (req, res) => {
    try {
      const id = String(req.params.id), m = MD.modelSab(id);
      if (!m) return res.status(404).json({ success: false, error: `bilinmeyen model: ${id} (${MD.MODELLER.join(', ')})` });
      const Y = yukle(), st = Y.seri.get(id) || [], izin = tutarIzni(req), son = st[st.length - 1] || null;
      const kiyaslar = Object.fromEntries(kiyasIdleri(m).map(k => [k, { ad: MD.SERI[k].ad, takvim: MD.SERI[k].takvim, satirlar: (Y.seri.get(k) || []).map(s => ({ gun: s.gun, endeks: s.endeks, ...(s.endeksTl != null ? { endeksTl: s.endeksTl } : {}) })), metrik: MD.metrik(Y.seri.get(k) || []) }]));
      res.json({ success: true, id, ad: m.ad, kabul: m.kabul, takvim: MD.SERI[id].takvim, para: MD.SERI[id].para, kollar: m.kollar, baslangic: m.baslangic,
        satirlar: st.map(sadeSatir), metrik: MD.metrik(st), ...(id === 'm-bist-m10' ? { metrikTl: MD.metrik(st, 'endeksTl') } : {}), kiyaslar,
        pozisyon: son ? { gun: son.gun, nakit: son.nakit, poz: son.poz || null, kollar: son.kollar || null, bekleyen: son.bekleyen || null } : null,
        dolumlar: Y.dolumlar.filter(d => d.model === id).map(sadeSatir),
        ...(izin ? { tutar: tutarHesapla(id, st, izin) } : {}) });
    } catch (e) { hata(res, e); }
  });

  r.get('/api/tasarimci/model/:id/kararlar', (req, res) => {
    try {
      const id = String(req.params.id);
      if (!MD.SERI[id]) return res.status(404).json({ success: false, error: `bilinmeyen seri: ${id}` });
      res.json({ success: true, id, kararlar: yukle().kararlar.filter(k => k.model === id) });
    } catch (e) { hata(res, e); }
  });

  r.get('/api/tasarimci/oneri', (req, res) => {
    try {
      const Y = yukle(), S = MD.sabitleme(), izin = tutarIzni(req), bugun = T.iso(Date.now());
      const modeller = S.modeller.map(m => {
        const k = Y.kararlar.filter(x => x.model === m.id && x.tur2 !== 'dengeleme').pop() || null, st = Y.seri.get(m.id) || [];
        const tut = izin ? tutarHesapla(m.id, st, izin) : null;
        const hedef = k ? Object.entries(k.agirlik).map(([s, w]) => ({ [m.id === 'm-837' ? 'kol' : 's']: s, agirlik: w, ...(tut ? { hedefTutar: tut.guncel * w, para: tut.para } : {}) })) : [];
        return { id: m.id, ad: m.ad, karar: k && { kararGunu: k.kararGunu, uygulamaGunu: k.uygulamaGunu, ilk: !!k.ilk, dogrulama: k.dogrulama || null, eksikVeri: k.eksikVeri || [], uyelik: k.uyelik || null },
          hedef, uygulandi: !!(k && st.some(s => s.gun >= k.uygulamaGunu)), modelOtomatik: 'model portföy hedefi uygulama günü açılışında sanal olarak uygulanır (otomatik)',
          gercekEmir: 'GET /api/tasarimci/emirler — gerçek portföy emir tablosu (emri aracı kurumda siz girersiniz)' };
      });
      const ay = bugun.slice(0, 7);
      res.json({ success: true, bugun, modeller, emirTaslagi: DF.jsonOku(`emirler/${ay}.json`), sonrakiKararlar: { NYSE: T.sonrakiKararlar(3, 'NYSE'), BIST: T.sonrakiKararlar(3, 'BIST') } });
    } catch (e) { hata(res, e); }
  });

  // ── F4: Bu ay — emir listesi ─────────────────────────────────────────────
  const AY_RE = /^\d{4}-\d{2}$/;
  const ayOf = g => String(g || '').slice(0, 7);
  // TASARIMCI_BUGUN (YYYY-AA-GG): yalnız kılavuz görüntüsü üreticisi (scripts/kilavuz-ekran.js, geçici kopya) — ilk uygulama gününden önce
  // "Uyguladım" önizlemesini gösterebilmek için. Gerçek sunucuda tanımlı değildir.
  const bugunF = () => (ops.bugun ? ops.bugun() : /^\d{4}-\d{2}-\d{2}$/.test(process.env.TASARIMCI_BUGUN || '') ? process.env.TASARIMCI_BUGUN : PM.yerelGun());
  function varsayilanAy(kararlar) {
    const l = kararlar.filter(k => (k.model === 'm-qqq-m10' || k.model === 'm-bist-m10') && k.uygulamaGunu).map(k => ayOf(k.uygulamaGunu)).sort();
    return l.length ? l[l.length - 1] : ayOf(bugunF());
  }
  function aylar(kararlar) { return [...new Set(kararlar.filter(k => MD.MODELLER.includes(k.model) && k.tur2 !== 'dengeleme' && k.uygulamaGunu).map(k => ayOf(k.uygulamaGunu)))].sort().reverse(); }
  /** Model + ay → { hedef, karar } (837: sabitleme kolları; o ay yerleşim kararı varsa onunla). */
  function modelHedefi(id, ay, kararlar) {
    const l = kararlar.filter(k => k.model === id && k.tur2 !== 'dengeleme').sort((a, b) => (a.kararGunu < b.kararGunu ? -1 : 1));
    const k = l.filter(x => ayOf(x.uygulamaGunu) === ay).pop() || null;
    if (id === 'm-837') {
      const DK = MD.dengeleme837();
      const kk = k || { kararGunu: null, uygulamaGunu: null, kural: DK.kural };
      return { karar: { kararGunu: kk.kararGunu, uygulamaGunu: kk.uygulamaGunu, ilk: !!kk.ilk, kural: DK.kural, bantPuan: DK.bantPuan || null }, hedef: E.hedefGenislet(id, k || {}, { onceki: ['QQQ'] }) };
    }
    if (!k) return { karar: null, hedef: null };
    const o = l.filter(x => x.kararGunu < k.kararGunu).pop() || null;
    return { karar: { kararGunu: k.kararGunu, uygulamaGunu: k.uygulamaGunu, ilk: !!k.ilk, eksikVeri: k.eksikVeri || [] }, hedef: E.hedefGenislet(id, k, { onceki: o ? Object.keys(o.agirlik || {}) : null }), oncekiKarar: o ? o.kararGunu : null };
  }
  const atlaOku = (ay) => (DF.jsonOku(`uygulama/${ay}.json`) || { ay, atla: {} });
  /** Tüm modeller için emir listesi + uygulama durumu (YALNIZ okur). */
  /** Portföyüm'de bu model için İPTAL EDİLMEMİŞ tasarımcı işlemleri (bütün aylar). */
  const aktifKayitlar = (durum, id) => durum.kayitlar.filter(k => k.tur === 'islem' && k.tasarimci && k.tasarimci.model === id && !durum.D.iptalEdilen.has(k.id));
  const tabanAnahtar = (a) => String(a).replace(/#\d+$/, '');
  /** Tüm modeller için emir listesi + uygulama durumu (YALNIZ okur). */
  function emirlerKur(ay, { model = null } = {}) {
    const kararlar = DF.oku('kararlar').satirlar;
    const durum = E.portfoyumDurumu({ bugun: bugunF() });
    const sm = sermayeOku() || { modeller: {}, kesirli: false, minIslemUSD: E.VARSAYILAN.minIslemUSD, hesaplar: {} };
    const ud = atlaOku(ay), at = ud.atla || {};
    const Y = yukle();
    const D = durum.D;
    const tum = MD.MODELLER.map(id => {
      const mh = modelHedefi(id, ay, kararlar), sab = MD.modelSab(id);
      const giris = sm.modeller[id] || null;
      // Ö8: M10 hedef tabanı = sermaye × (model endeksi / 100) — kart (/oneri) ile AYNI (tutarHesapla). 837: sermaye (ilk yerleşim).
      let sermaye = giris;
      if (giris && id !== 'm-837') {
        const t = tutarHesapla(id, Y.seri.get(id) || [], { modeller: { [id]: giris } });
        sermaye = { ...giris, baslangic: giris.tutar, tutar: t ? t.guncel : giris.tutar, endeks: t ? t.guncel / giris.tutar * 100 : 100, taban: 'sermaye × model endeksi / 100' };
      }
      const aktif = aktifKayitlar(durum, id);
      // O7: önceki liste = önceki karar ∪ bu modelin iptal edilmemiş tasarımcı kayıtlarındaki semboller
      if (mh.hedef && id !== 'm-837') {
        const ek = aktif.map(k => { const v = D.varliklar.get(k.varlik); return v ? String(v.sembol).replace(/\.IS$/i, '') : null; }).filter(Boolean);
        mh.hedef.onceki = [...new Set([...(mh.hedef.onceki || []), ...ek])];
      }
      const anah = E.uygulamaAnahtarlari(durum.kayitlar, D, { ay, model: id });
      const uygulamalar = E.uygulamaOzetleri(anah);
      const dz = id !== 'm-837' && anah.size && ud.dondurma && ud.dondurma[id] ? ud.dondurma[id] : null;   // O3
      // B10: modelin net adedi = iptal edilmemiş tasarımcı kayıtlarından (al +, sat −); kayıt yoksa null (ilk ay).
      let modelAdet = null;
      if (aktif.length && id !== 'm-837') { modelAdet = new Map(); for (const k of aktif) { const v = D.varliklar.get(k.varlik); if (!v || (k.islem !== 'al' && k.islem !== 'sat')) continue; const s = String(v.sembol).replace(/\.IS$/i, ''); modelAdet.set(s, (modelAdet.get(s) || 0) + (k.islem === 'al' ? 1 : -1) * (k.adet || 0)); } }
      const liste = mh.hedef ? E.emirListesi(mh.hedef, durum, { kesirli: sm.kesirli, minIslemUSD: sm.minIslemUSD, hesap: sm.hesaplar, sermaye, dondurma: dz, bugun: durum.bugun, oncekiUygulama: id === 'm-837' ? aktif.length > 0 : undefined, modelAdet, ...(sm.komisyon ? { komisyon: sm.komisyon } : {}) }) : null;
      // O2: uygulanmış bir anahtarın KALANI yeni anahtarla açık kalır (taban#n); uygulanmış satırlar kayıttaki değerle gösterilir.
      // Sonraki sonek = bu tabandaki en büyük sonek + 1 (iptal edilen ara anahtarlar yeniden kullanılmaz; çakışma olmaz).
      const sayac = (b) => [...anah.keys()].filter(a => tabanAnahtar(a) === b).reduce((mx, a) => Math.max(mx, /#(\d+)$/.test(a) ? +a.match(/#(\d+)$/)[1] : 1), 0);
      const acikSatir = (x) => { if (!x) return x; const n = sayac(x.anahtar); return { ...x, anahtar: n ? `${x.anahtar}#${n + 1}` : x.anahtar, uygulandi: false, ...(n ? { neden: `${x.neden} · kalan (önceki uygulamadan sonra)` } : {}) }; };
      const uygulanan = [...anah.entries()].map(([a, l]) => {
        const k0 = l[0], v = D.varliklar.get(k0.varlik), hs = D.hesaplar.get(k0.hesap);
        const adet = l.reduce((t, x) => t + (x.adet || 0), 0), tutar = l.reduce((t, x) => t + (x.islem === 'transfer' ? x.tutar : (x.adet || 0) * (x.fiyat || 0)), 0);
        return k0.islem === 'transfer'
          ? { anahtar: a, tur: 'aktarim', yon: tabanAnahtar(a).endsWith('aktarim') ? 'aktarım' : 'aktarım', hesap: k0.hesap, hesapAd: hs ? hs.ad : k0.hesap, para: 'USD', tutar: Math.round(tutar * 100) / 100, uygulandi: true, uygulanabilir: false, uygulamaKayit: l.map(x => x.id), neden: `uygulandı ${k0.tarih}` }
          : { anahtar: a, tur: 'emir', yon: k0.islem, hesap: k0.hesap, hesapAd: hs ? hs.ad : k0.hesap, sembol: v ? v.sembol : k0.varlik, para: v ? v.para : null, adet, fiyat: k0.fiyat, tutar: Math.round(tutar * 100) / 100, uygulandi: true, uygulanabilir: false, uygulamaKayit: l.map(x => x.id), neden: `uygulandı ${k0.tarih} (Portföyüm kaydı)` };
      });
      const satirlar = liste ? [...liste.satirlar.map(acikSatir), ...uygulanan.filter(x => x.tur === 'emir')] : [];
      const aktarim = liste && liste.aktarim ? acikSatir(liste.aktarim) : (uygulanan.find(x => x.tur === 'aktarim') || null);
      const acik = [...satirlar, ...(aktarim ? [aktarim] : [])].filter(x => !x.uygulandi);
      const atla = at[id] || null;
      // B9: bu modelin daha yeni bir karar ayı varsa bu ayın listesi "süresi geçti" — açık satırlar uygulanamaz (geri al çalışır).
      const sonAy = aylar(kararlar.filter(k => k.model === id))[0] || ay;   // aylar() en yeniden eskiye
      const eskiAy = id !== 'm-837' && sonAy > ay;
      if (eskiAy) for (const x of acik) { x.uygulanabilir = false; x.engel = `Süresi geçti: ${sonAy} kararı var — eski ayın listesi uygulanmaz (yeni ayın listesine bakın)`; }
      const d = atla ? 'atlandi' : !giris ? 'sermaye-yok' : !mh.hedef ? 'karar-yok' : eskiAy && !uygulamalar.length ? 'suresi-gecti' : uygulamalar.length ? (acik.length ? 'kismi' : 'uygulandi') : acik.length ? 'bekliyor' : 'islem-yok';
      return { id, ad: sab.ad, karar: mh.karar, oncekiKarar: mh.oncekiKarar || null, hedef: mh.hedef && { kalemler: mh.hedef.kalemler, hesapHedefleri: mh.hedef.hesapHedefleri, dengeleme: mh.hedef.dengeleme },
        durum: d, sermaye, liste: liste && { ...liste, satirlar, aktarim }, uygulamalar, atla };
    });
    // O4: aynı hesabı kullanan modellerin AÇIK emirleri birlikte nakit denetimi (hesap para biriminde).
    const hesapNet = new Map();
    for (const m of tum) {
      if (!m.liste || m.atla) continue;
      for (const x of [...m.liste.satirlar, ...(m.liste.aktarim ? [m.liste.aktarim] : [])]) {
        if (x.uygulandi || !x.uygulanabilir) continue;
        const ek = (hid, t) => { if (!hid) return; const o = hesapNet.get(hid) || { net: 0, modeller: new Set() }; o.net += t; o.modeller.add(m.id); hesapNet.set(hid, o); };
        if (x.tur === 'aktarim') { ek(x.hesap, -x.tutar); ek(x.hedefHesap, x.tutar); } else ek(x.hesap, x.yon === 'sat' ? x.tutar : -x.tutar);
      }
    }
    for (const [hid, o] of hesapNet) {
      if (o.modeller.size < 2) continue;
      const hs = D.hesaplar.get(hid);
      if (!hs || hs.hesapTuru === 'binance') continue;
      const n = durum.deg.nakitler.filter(x => x.hesap === hid && x.para === hs.para).reduce((a, x) => a + x.tutar, 0);
      if (n + o.net < -0.01) for (const m of tum) if (o.modeller.has(m.id)) m.liste.uyarilar.push(`${hs.ad}: ${[...o.modeller].map(x => MD.modelSab(x).ad).join(' + ')} açık emirleri BİRLİKTE nakdi ${E.paraYaz(n + o.net, hs.para)} değerine düşürür (nakit ${E.paraYaz(n, hs.para)}) — önce para yatırın ya da bir modeli bu ay atlayın.`);
    }
    const modeller = tum.filter(m => !model || m.id === model);
    const portfoyumBos = !D.hesaplar.size;
    const gerekenTurler = [...new Set(MD.MODELLER.flatMap(id => MD.modelSab(id).kollar.map(k => k.hesapTuru)))];
    const eksikHesap = gerekenTurler.filter(t => ![...D.hesaplar.values()].some(h => h.hesapTuru === t && h.durum === 'acik'));
    return { ay, aylar: aylar(kararlar), bugun: durum.bugun, modeller, portfoyumBos, eksikHesap, sermayeTanimli: !!Object.keys(sm.modeller).length,
      ayarlar: { kesirli: sm.kesirli, minIslemUSD: sm.minIslemUSD, hesaplar: sm.hesaplar, telefondaGizle: sm.telefondaGizle === true },
      hesaplar: [...D.hesaplar.values()].filter(h => h.durum === 'acik').map(h => ({ id: h.id, ad: h.ad, hesapTuru: h.hesapTuru, para: h.para })),
      portfoyumHatalari: (durum.hatalar || []).length, _durum: durum, _kararlar: kararlar, _ud: ud };
  }
  const GIZLI = new Set(['adet', 'tutar', 'tutarUSD', 'hedefTutar', 'mevcutAdet', 'hedefAdet', 'sermaye', 'sapma', 'nakit', 'kol837', 'esikAlti', 'mevcutTutar']);
  const METIN = new Set(['uyarilar', 'bilgi', 'engel', 'neden', 'not']);
  const TUTAR_RE = /-?\d[\d.,]*\s*(USD|TRY|TL|\$|₺)(?=[^A-Za-zÇĞİÖŞÜçğıöşü]|$)/g;
  const maske = (v) => (typeof v === 'string' ? v.replace(TUTAR_RE, '••• $1') : Array.isArray(v) ? v.map(maske) : v);
  /** telefondaGizle: tutar alanları atılır, metinlerdeki tutarlar (uyarı/bilgi/engel/neden/not) maskelenir (D2). */
  const gizle = (x) => (Array.isArray(x) ? x.map(gizle) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k]) => !GIZLI.has(k)).map(([k, v]) => [k, METIN.has(k) ? maske(v) : gizle(v)])) : x);
  const disariAl = ({ _durum, _kararlar, _ud, ...o }) => { void _durum; void _kararlar; void _ud; return o; };

  r.get('/api/tasarimci/emirler', (req, res) => {
    try {
      const q = req.query || {};
      const kararlar = DF.oku('kararlar').satirlar;
      const ay = q.ay ? String(q.ay) : varsayilanAy(kararlar);
      if (!AY_RE.test(ay)) return res.status(400).json({ success: false, error: 'ay YYYY-AA olmalı' });
      if (q.model && !MD.MODELLER.includes(String(q.model))) return res.status(404).json({ success: false, error: `bilinmeyen model: ${q.model}` });
      const o = disariAl(emirlerKur(ay, { model: q.model ? String(q.model) : null }));
      const s = sermayeOku();
      const tutarGizli = req.kademe === 'telefon' && !!(s && s.telefondaGizle);
      res.json({ success: true, ...(tutarGizli ? gizle(o) : o), tutarGizli,
        kural: 'Liste öneridir; emri aracı kurumda (Midas) siz girersiniz. "Uyguladım" Portföyüm\'e tek onayla al/sat kaydı yazar (T3).' });
    } catch (e) { hata(res, e); }
  });

  // ── F5: model ↔ gerçek (uygulama farkı, kol katkısı, aylık tablo, aylık dışa aktarım) — YALNIZ okur ─────────
  const FK = require('./fark');
  const ZM = () => require('./zamanlayici');
  /** Telefonda tutar gizli mi (emirler ile aynı kural: telefon kademesi + sermaye.json telefondaGizle). */
  const tutarGizliMi = (req) => { const s = sermayeOku(); return req.kademe === 'telefon' && !!(s && s.telefondaGizle); };
  const yuzde12 = (x) => (Number.isFinite(x) ? +x.toPrecision(12) : null);
  const atlaHepsi = () => {
    const o = {};
    try { for (const f of require('fs').readdirSync(DF.yol('uygulama'))) { const m = /^(\d{4}-\d{2})\.json$/.exec(f); if (m) o[m[1]] = (DF.jsonOku(`uygulama/${f}`) || {}).atla || {}; } } catch (e) { /* dizin yok */ }
    return o;
  };
  function farkKur(id, Y, { ay = null, bugun, sermaye, atla = {}, B = null }) {
    const st = Y.seri.get(id) || [], dol = Y.dolumlar.filter(d => d.model === id);
    const mg = FK.modelGercek(id, { bugun, sermaye: sermaye && sermaye.modeller[id] ? sermaye.modeller[id] : null, modelSatirlar: st, B });
    const sembolBul = (k) => { const v = mg.B.D.varliklar.get(k.varlik); return v ? v.sembol : k.varlik; };
    const ac = (a) => FK.farkAyristir({ gercek: mg.gercek, modelSatirlar: st, modelDolumlar: dol, kayitlar: mg.kayitlar, atlandi: !!(a && atla[a] && atla[a][id]), ay: a, usd: mg.B.usd, sembolBul, bugun, baslangic: MD.BASLANGIC });
    const f = ac(ay), bas = ac(null);
    const adlar = { ...(mg.gercek ? mg.gercek.bilesenAd : {}), cekirdek: 'QQQ (çekirdek)', uydu: 'Kairos (uydu)', dengeleme: 'Dengeleme maliyeti', nakit: 'Nakit' };
    const katki = (a) => (a.bas ? { model: FK.katkiOzet(FK.modelKatki(id, st, dol, { bas: a.bas, bit: a.bit }).katki, adlar),
      gercek: mg.gercek ? FK.katkiOzet((FK.gercekKatki(mg.gercek, { bas: a.bas, bit: a.bit }) || {}).katki, adlar) : null, bas: a.bas, bit: a.bit } : null);
    return { mg, f, bas, katkiAy: katki(f), katkiBas: katki(bas), st, dol, sembolBul };
  }

  /**
   * KÂĞIT HESAPLAR (61.4, lib/tasarimci/kagit.js; zamanlayıcı her tikte data/tasarimci/kagit.json'u yazar) — yalnız okur.
   * Telefonda sermaye.json telefondaGizle açıksa tutarlar gönderilmez (getiri yüzdeleri, adetler ve hisseler görünür).
   * ?model=<id> tek model. Kararların sıralaması (neden bu hisseler) kararlar.jsonl'dan eklenir: son iki karar.
   */
  r.get('/api/tasarimci/kagit', (req, res) => {
    try {
      const j = DF.jsonOku('kagit.json');
      if (!j) return res.json({ success: true, bos: true, neden: 'Kâğıt hesaplar henüz hesaplanmadı (tasarımcı zamanlayıcısı ilk tikte yazar).' });
      const gizli = tutarGizliMi(req);
      const kararlar = DF.oku('kararlar').satirlar;
      const modeller = {};
      for (const [id, x] of Object.entries(j.modeller || {})) {
        if (req.query.model && req.query.model !== id) continue;
        const ks = kararlar.filter(k => k.model === id && k.liste && k.tur2 !== 'dengeleme').sort((a, b) => (a.kararGunu < b.kararGunu ? -1 : 1)).slice(-2)
          .map(k => ({ kararGunu: k.kararGunu, uygulamaGunu: k.uygulamaGunu, liste: k.liste, aday: k.aday || null, evren: k.evren || null, eksikVeri: k.eksikVeri || [] }));
        const y = { ...x, kararlar: ks };
        if (gizli) {
          const tutarsiz = (o) => { const c = { ...o }; for (const a of ['tutar', 'deger', 'kz', 'ozsermaye', 'nakit', 'yatirilan', 'kar', 'modelTutar', 'modelFark', 'komisyonToplam', 'hucum', 'gerceklesen', 'komisyon']) if (a in c) c[a] = null; return c; };
          y.islemler = x.islemler.map(tutarsiz); y.pozisyonlar = x.pozisyonlar.map(tutarsiz); y.ozet = tutarsiz(x.ozet);
          // Grafik için yalnız yüzde: özsermaye / yatırılan − 1 (eğri şekli tutar ele vermez)
          const ilk = x.gunler.length ? x.gunler[0].ozsermaye : null;
          y.gunler = x.gunler.map(gg => ({ gun: gg.gun, getiri: ilk ? gg.ozsermaye / ilk - 1 : null, modelEndeks: gg.modelEndeks }));
          y.gizli = true;
        }
        modeller[id] = y;
      }
      res.json({ success: true, guncelleme: j.guncelleme, uyarilar: j.uyarilar || [], modeller, gizli });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  /**
   * 68.8 PORTFÖY BOTLARI (Botlar › QQQ M10 / BIST M10 / 837, lib/tasarimci/portfoyBot.js) — yalnız okur. Resmî kayıt sunucuda:
   * geliştirme bilgisayarında bu üç uç lib/evOkuma.js EV_YOLU ile sunucudan okunur (Portföy laboratuvarı / tasarımcı yerel kalır).
   *   /api/tasarimci/portfoy-botlar             üç botun özet satırı (getiri, kıyas al-tut, düşüş, işlem sayısı, sıradaki karar)
   *   /api/tasarimci/portfoy-bot/:id            bir bot: kâğıt hesap + kıyas serisi + karar defteri + sıradaki karar (+ aday havuzu özeti)
   *   /api/tasarimci/portfoy-bot/:id/fiyat?s=   bir hissenin ham günlük açılış/kapanışı (kâğıt hesabın kullandığı seri; yalnız o
   *                                             botun işlem gördüğü semboller) — hisse grafiği ▲ alış / ▼ satış
   * Telefonda sermaye.json telefondaGizle açıksa tutar alanları null (kagit ucuyla aynı kural).
   */
  const PB = require('./portfoyBot');
  const TUTAR_ALANLARI = ['tutar', 'deger', 'kz', 'ozsermaye', 'nakit', 'yatirilan', 'kar', 'modelTutar', 'modelFark', 'komisyonToplam', 'hucum', 'gerceklesen', 'komisyon'];
  const kagitModeli = (id, req) => {
    const j = DF.jsonOku('kagit.json');
    const x = j && j.modeller && j.modeller[id];
    if (!x) return { j, x: null, ham: null };
    if (!tutarGizliMi(req)) return { j, x, ham: x, gizli: false };
    const tutarsiz = (o) => { const c = { ...o }; for (const a of TUTAR_ALANLARI) if (a in c) c[a] = null; return c; };
    const ilk = x.gunler.length ? x.gunler[0].ozsermaye : null;
    return { j, gizli: true, ham: x, x: { ...x, islemler: x.islemler.map(tutarsiz), pozisyonlar: x.pozisyonlar.map(tutarsiz), ozet: tutarsiz(x.ozet),
      gunler: x.gunler.map(gg => ({ gun: gg.gun, getiri: ilk ? gg.ozsermaye / ilk - 1 : null, modelEndeks: gg.modelEndeks,
        poz: Object.fromEntries(Object.entries(gg.poz || {}).map(([s, p]) => [s, { adet: p.adet, kapanis: p.kapanis }])) })) } };
  };
  const kiyasAl = (id, x, Y) => PB.kiyasSerisi((x.gunler || []).map(g => g.gun), Y.seri.get(PB.BOTLAR[id].kiyas.id) || [], PB.BOTLAR[id].kiyas.alan);
  const sonrakiKarar = (b) => (b.tur === 'hisse' ? (T.sonrakiKararlar(1, b.borsa)[0] || null) : null);
  r.get('/api/tasarimci/portfoy-botlar', (req, res) => {
    try {
      const Y = yukle(), botlar = [];
      let guncelleme = null;
      for (const id of PB.SIRA) {
        const { j, x } = kagitModeli(id, req);
        guncelleme = guncelleme || (j && j.guncelleme) || null;
        const sat = x ? PB.ozetSatiri(id, x, kiyasAl(id, x, Y)) : { ...PB.ozetSatiri(id, null, null), bos: true, neden: 'Kâğıt hesap henüz hesaplanmadı (tasarımcı zamanlayıcısı ilk tikte yazar).' };
        botlar.push({ ...sat, sonrakiKarar: sonrakiKarar(PB.BOTLAR[id]) });
      }
      res.json({ success: true, guncelleme, botlar, gizli: tutarGizliMi(req) });
    } catch (e) { hata(res, e); }
  });
  r.get('/api/tasarimci/portfoy-bot/:id', (req, res) => {
    try {
      const id = String(req.params.id), b = PB.BOTLAR[id];
      if (!b) return res.status(404).json({ success: false, error: `bilinmeyen portföy botu: ${id} (${PB.SIRA.join(', ')})` });
      const { j, x, gizli, ham } = kagitModeli(id, req);
      const kunye = { id, kisa: b.kisa, ad: b.ad, para: b.para, tur: b.tur, borsa: b.borsa, kiyasAd: b.kiyas.ad, sonrakiKarar: sonrakiKarar(b) };
      if (!x) return res.json({ success: true, ...kunye, bos: true, neden: j ? 'Bu bot için kâğıt hesap yok.' : 'Kâğıt hesaplar henüz hesaplanmadı (tasarımcı zamanlayıcısı ilk tikte yazar).' });
      const Y = yukle();
      const kiyas = kiyasAl(id, x, Y);
      const fk = require('./kagit').fiyatKaynagi(require('./veri'));
      // Karar defterindeki "hissenin payı" ham kâğıt hesaptan; gizlide tutar alanları ve tutarlı neden metni atılır.
      let defter = b.tur === 'hisse' ? PB.kararDefteri({ kararlar: Y.kararlar.filter(k => k.model === id), model: ham, fiyat: (s) => fk(s, b.borsa) }) : PB.dengelemeDefteri(ham);
      if (gizli) defter = defter.map(k => ({ ...k, komisyon: null,
        ...(k.kalemler ? { kalemler: k.kalemler.map(z => ({ ...z, komisyon: null, neden: /^tam adet yetmedi/.test(z.neden) ? 'tam adet yetmedi: 1 adedin fiyatı hissenin payından büyük' : z.neden })), satilanlar: k.satilanlar.map(s => ({ ...s, tutar: null, komisyon: null })) } : {}),
        ...(k.islemler ? { islemler: k.islemler.map(s => ({ ...s, tutar: null, komisyon: null })) } : {}) }));
      let havuz = null;
      if (b.tur === 'hisse') {
        const h = ((DF.jsonOku('aday-havuzu.json') || {}).modeller || {})[id];
        if (h && h.satirlar) havuz = { veriGunu: h.veriGunu || null, kesinlik: h.kesinlik || null, karar: (h.sonrakiKarar || {}).karar || null, girecek: h.satirlar.filter(z => z.durum === 'girecek').map(z => z.s), cikacak: h.satirlar.filter(z => z.durum === 'cikacak').map(z => z.s) };
      }
      res.json({ success: true, ...kunye, guncelleme: j.guncelleme, gizli: !!gizli, kagit: x,
        kiyas: { id: b.kiyas.id, ad: b.kiyas.ad, seri: kiyas }, kiyasGetiri: kiyas.length > 1 ? kiyas[kiyas.length - 1].v / 100 - 1 : null,
        kararDefteri: defter, havuz, semboller: PB.semboller(x), uyarilar: x.uyarilar || [] });
    } catch (e) { hata(res, e); }
  });
  r.get('/api/tasarimci/portfoy-bot/:id/fiyat', (req, res) => {
    try {
      const id = String(req.params.id), b = PB.BOTLAR[id];
      if (!b) return res.status(404).json({ success: false, error: `bilinmeyen portföy botu: ${id}` });
      const s = String(req.query.s || '').toUpperCase();
      const j = DF.jsonOku('kagit.json'), x = j && j.modeller && j.modeller[id];
      const sm = x ? PB.semboller(x) : { elde: [], gecmis: [] };
      if (!/^[A-Z0-9.]{1,12}$/.test(s) || ![...sm.elde, ...sm.gecmis].includes(s)) return res.status(400).json({ success: false, error: `bu botun işlem görmediği sembol: ${s || '—'}` });
      const son = (x.ozet && x.ozet.son) || T.iso(Date.now());
      const bas = T.iso(Date.parse(((x.ozet && x.ozet.bas) || son) + 'T00:00:00Z') - 45 * 864e5);
      const fk = require('./kagit').fiyatKaynagi(require('./veri'));
      res.json({ success: true, id, s, para: b.para, borsa: b.borsa, bas, son, gunler: PB.fiyatSerisi(fk, s, b.borsa, bas, son, T.islemGunleri(bas, son, b.borsa).map(T.iso)) });
    } catch (e) { hata(res, e); }
  });

  // 62.3: aday havuzu — zamanlayıcının yazdığı önizleme (lib/tasarimci/adayHavuzu.js); tutar içermez
  r.get('/api/tasarimci/aday-havuzu', (req, res) => {
    try {
      const j = DF.jsonOku('aday-havuzu.json');
      if (!j) return res.json({ success: true, bos: true, neden: 'Aday havuzu henüz hesaplanmadı (tasarımcı zamanlayıcısı ilk tikte yazar).' });
      res.json({ success: true, ...j });
    } catch (e) { hata(res, e); }
  });

  // 62.3: geçmiş (backtest) — model portföyün kuralının geçmişte nasıl davranırdığı, aylık, 100 tabanlı; kıyasla. İyimser (H1).
  // Kaynak lib/portfoy/seri (laboratuvar kataloğu; strateji eğrileri tasarımcı stratejileriyle birebir). Tutar içermez.
  const GECMIS = {
    'm-qqq-m10': { birim: 'USD', seriler: [['strateji:qqq-m10', 'Nova · Nasdaq Momentum 10'], ['yahoo:QQQ', 'QQQ al-tut']] },
    'm-bist-m10': { birim: 'TL', seriler: [['strateji:bist-m10', 'Lydia · BIST Momentum 10'], ['xu030', 'BIST 30 (XU030, fiyat)']] },
    'm-837': { birim: 'USD', seriler: [['yahoo:QQQ', 'QQQ al-tut (çekirdek yarı)'], ['strateji:hucum', 'Kairos simülasyonu (uydu yarı)']], bilesen: true },
    // 62.6 Botlar sekmesi: Hücum / Denge kurallarının geçmişi (bindirme simülasyonu, iyimser) + BTC al-tut
    'b-hucum': { birim: 'USD', seriler: [['strateji:hucum', 'Kairos (simülasyon)'], ['strateji:btc-altut', 'BTC al-tut']] },
    'b-denge': { birim: 'USD', seriler: [['strateji:denge', 'Tao (simülasyon)'], ['strateji:btc-altut', 'BTC al-tut']] }
  };
  const gecmisOnb = new Map();
  r.get('/api/tasarimci/gecmis/:id', (req, res) => {
    try {
      const id = String(req.params.id), g = GECMIS[id];
      if (!g) return res.status(404).json({ success: false, error: `bilinmeyen model: ${id}` });
      const o = gecmisOnb.get(id);
      if (o && Date.now() - o.zaman < 30 * 60e3) return res.json(o.yanit);
      const SERI = require('../portfoy/seri');
      const aySonu = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0); };
      const seriler = g.seriler.map(([k, ad]) => {
        try {
          if (k === 'xu030') {   // laboratuvar kataloğunda yok: tasarımcı verisinden ay sonu kapanışları (TL fiyat endeksi)
            const gun = require('./veri').ham('XU030.IS').gunler.filter(x => x.c > 0), m = new Map();
            for (const x of gun) m.set(aySonu(x.t), x.c);
            return { kimlik: k, ad, noktalar: [...m.entries()].sort((a, b) => a[0] - b[0]) };
          }
          const p = SERI.seriPaket(k, { birim: g.birim, siklik: 'aylik' });
          let v = 1; const n = [[aySonu(Date.parse(p.baslangic + 'T00:00:00Z')), 1]];
          for (const x of p.satirlar) { v *= 1 + x.getiri; n.push([aySonu(x.t), v]); }
          return { kimlik: k, ad, noktalar: n, not: (p.notlar || [])[0] || null };
        } catch (e) { return { kimlik: k, ad, hata: e.message, noktalar: [] }; }
      });
      // Ortak dönem: en geç başlayan serinin ilk ayı (hepsi orada 100) → en erken biten serinin son ayı (yarım ay yok)
      const dolu = seriler.filter(s => s.noktalar.length);
      const bas = Math.max(...dolu.map(s => s.noktalar[0][0])), son = Math.min(...dolu.map(s => s.noktalar[s.noktalar.length - 1][0]));
      for (const s of seriler) {
        const l = s.noktalar.filter(([t]) => t >= bas && t <= son);
        const t0 = l.length ? l[0][1] : null;
        s.noktalar = t0 ? l.map(([t, x]) => [t, Math.round(x / t0 * 1e4) / 100]) : [];
      }
      const yanit = { success: true, id, birim: g.birim, bilesen: !!g.bilesen, baslangic: Number.isFinite(bas) ? T.iso(bas) : null, seriler,
        uyari: 'Geçmiş = backtest: kural bugün bilinenle geçmişe uygulandı (iyimser, sonradan seçilmiş — H1). Gelecekte aynısı olmayabilir.' };
      gecmisOnb.set(id, { zaman: Date.now(), yanit });
      res.json(yanit);
    } catch (e) { hata(res, e); }
  });

  r.get('/api/tasarimci/model/:id/fark', (req, res) => {
    try {
      const id = String(req.params.id);
      if (!MD.MODELLER.includes(id)) return res.status(404).json({ success: false, error: `bilinmeyen model: ${id}` });
      const q = req.query || {}, bugun = bugunF();
      const ay = q.ay ? String(q.ay) : ayOf(bugun);
      if (!AY_RE.test(ay)) return res.status(400).json({ success: false, error: 'ay YYYY-AA olmalı' });
      const o = farkKur(id, yukle(), { ay, bugun, sermaye: sermayeOku(), atla: atlaHepsi() });
      const g = o.mg.gercek, gizli = tutarGizliMi(req);
      const son = g && g.gunler.length ? g.gunler[g.gunler.length - 1] : null;
      res.json({ success: true, id, ay, bugun, gercekVar: !!g, ilkGun: g ? g.ilkGun : null,
        seri: g ? g.gunler.map(x => ({ gun: x.gun, endeks: yuzde12(x.endeks) })) : [],
        fark: o.f, baslangictan: o.bas, katki: { ay: o.katkiAy, baslangictan: o.katkiBas },
        kayitSayisi: o.mg.kayitlar.length, uyarilar: g ? g.uyarilar : [], tutarGizli: gizli,
        ...(son && !gizli ? { deger: { usd: Math.round(son.deger * 100) / 100, gun: son.gun } } : {}),
        not: g ? 'Gerçek = bu modelin Uyguladım kayıtları + modele ayrılan nakit (Simurg: + Binance hesabının tamamı); para giriş-çıkışından arındırılmış (TWR).'
          : 'Gerçek karşılaştırma ilk Uyguladım kaydından sonra başlar.' });
    } catch (e) { hata(res, e); }
  });

  r.get('/api/tasarimci/aylik', (req, res) => {
    try {
      const bugun = bugunF(), Y = yukle(), s = sermayeOku(), S = MD.sabitleme(), at = atlaHepsi();
      const B = FK.baglamKur({ bugun });
      const modeller = S.modeller.filter(m => MD.MODELLER.includes(m.id)).map(m => {
        const o = farkKur(m.id, Y, { ay: null, bugun, sermaye: s, atla: at, B });
        const farklar = {};
        if (o.mg.gercek) for (let ay = ayOf(o.mg.gercek.ilkGun); ay <= ayOf(bugun); ay = FK._ic.sonrakiAy(ay)) {
          farklar[ay] = FK.farkAyristir({ gercek: o.mg.gercek, modelSatirlar: o.st, modelDolumlar: o.dol, kayitlar: o.mg.kayitlar, atlandi: !!(at[ay] && at[ay][m.id]), ay, usd: o.mg.B.usd, sembolBul: o.sembolBul, bugun, baslangic: MD.BASLANGIC });
        }
        const kiy = kiyasIdleri(m);
        const tablo = FK.aylikTablo({ modelSatirlar: o.st, kiyaslar: Object.fromEntries(kiy.map(k => [k, Y.seri.get(k) || []])), gercek: o.mg.gercek, farklar, bugun, baslangic: MD.BASLANGIC });
        return { id: m.id, ad: m.ad, kiyaslar: kiy.map(k => ({ id: k, ad: MD.SERI[k].ad })), gercekVar: !!o.mg.gercek, ...tablo };
      });
      res.json({ success: true, bugun, modeller, not: 'Aylık getiri (USD). Fark = gerçek − model, aynı aralıkta (ilk ayda ilk Uyguladım gününden). Yıl satırı bileşik.' });
    } catch (e) { hata(res, e); }
  });

  const disariDizin = () => (ops.disariDizin || ZM().kayitDizini(DF.makine()));
  r.get('/api/tasarimci/disari', (req, res) => {
    try {
      const l = FK.disariListe(disariDizin());
      res.json({ success: true, yer: DF.makine(), resmi: DF.makine() === 'ev', dosyalar: l.slice().reverse(), zincirTamam: l.every(x => x.tamam),
        not: 'Aylık dosyalarda yalnız 100 tabanlı endeks, kol getirileri ve dondurulmuş listeler var — tutar YOK. Her dosya bir öncekinin SHA-256 özetini taşır.' });
    } catch (e) { hata(res, e); }
  });
  r.get('/api/tasarimci/disari/:dosya', (req, res) => {
    try {
      const m = /^(\d{4}-\d{2})\.(json|csv)$/.exec(String(req.params.dosya || ''));
      if (!m) return res.status(400).json({ success: false, error: 'dosya YYYY-AA.json ya da YYYY-AA.csv olmalı' });
      const ham = FK.disariOku(disariDizin(), m[1]);
      if (ham == null) return res.status(404).json({ success: false, error: `${m[1]} dışa aktarım dosyası yok` });
      const tutarli = String((req.query || {}).tutarli || '') === '1';
      if (tutarli && req.kademe === 'telefon') return res.status(403).json({ success: false, error: 'Gerçek değerli CSV yalnız bu bilgisayardaki panelden indirilir.' });
      if (m[2] === 'json') { res.set('Content-Type', 'application/json; charset=utf-8'); res.set('Content-Disposition', `attachment; filename="model-portfoy-${m[1]}.json"`); return res.send(ham); }
      let kayit; try { kayit = JSON.parse(ham); } catch (e) { return res.status(500).json({ success: false, error: 'dosya geçersiz JSON' }); }
      let gercek = null;
      if (tutarli) {
        const Y = yukle(), s = sermayeOku(), B = FK.baglamKur({ bugun: bugunF() });
        gercek = Object.fromEntries(MD.MODELLER.map(id => [id, FK.modelGercek(id, { bugun: bugunF(), sermaye: s && s.modeller[id], modelSatirlar: Y.seri.get(id) || [], B }).gercek]).filter(([, v]) => v));
      }
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="model-portfoy-${m[1]}${tutarli ? '-gercek' : ''}.csv"`);
      res.send('﻿' + FK.disariCsv(kayit, { gercek }));
    } catch (e) { hata(res, e); }
  });

  // ── Yazma (telefon kademesinde guvenlik.js 403) ─────────────────────────────
  const govde = (req) => (req.body && typeof req.body === 'object' ? req.body : {});
  const ayParam = (req, res) => { const ay = String(req.params.ay || ''); if (!AY_RE.test(ay)) { res.status(400).json({ success: false, error: 'ay YYYY-AA olmalı' }); return null; } return ay; };
  const pEkle = (kayitlar, opsE) => depoP().ekle(kayitlar, { bugun: bugunF(), ...opsE });

  r.post('/api/tasarimci/sermaye', (req, res) => {
    try {
      const b = govde(req), eski = DF.jsonOku('sermaye.json') || {};
      const yeni = { ...eski, modeller: { ...(eski.modeller || {}) } };
      const hatalar = [], sorular = [];
      const adi = (id) => (MD.modelSab(id) || {}).ad || id;
      for (const [id, x] of Object.entries(b.modeller || {})) {
        if (!MD.MODELLER.includes(id)) { hatalar.push(`bilinmeyen model ${id}`); continue; }
        const ham = x && typeof x === 'object' ? x.tutar : x;
        const onceki = eski.modeller && eski.modeller[id] ? eski.modeller[id].tutar : null;
        const pb = id === 'm-bist-m10' ? '₺' : '$';
        // B-10: boşaltmak sermayeyi SİLER — önceki değer varsa onay ister.
        if (ham === '' || ham == null || +ham === 0) { if (onceki != null && b.onay !== true) sorular.push(`${adi(id)} sermayesi (${E.paraYaz(onceki, id === 'm-bist-m10' ? 'TRY' : 'USD')}) silinecek — emir listesi bu model için hesaplanmaz.`); delete yeni.modeller[id]; continue; }
        // B-10: üstel yazım (1e9) reddedilir — Türkçe sayı yazımı beklenir.
        if (typeof ham === 'string' && /e/i.test(ham)) { hatalar.push(`${adi(id)}: "${ham.slice(0, 20)}" — üstel yazım kabul edilmez; tutarı rakamla yazın (ör. 30000 ya da 30.000)`); continue; }
        const c = PM.sayiCoz(ham);
        if (c.hata || !(c.deger > 0) || c.deger > 1e10) { hatalar.push(`${adi(id)}: tutar ${c.hata || 'pozitif olmalı'}`); continue; }
        // B-10: önceki değerin 10 katından büyük ya da 1/10'undan küçük değişim → onay (yazım hatası koruması).
        if (onceki > 0 && (c.deger > onceki * 10 || c.deger < onceki / 10) && b.onay !== true) sorular.push(`${adi(id)}: ${E.paraYaz(onceki, pb === '₺' ? 'TRY' : 'USD')} → ${E.paraYaz(c.deger, pb === '₺' ? 'TRY' : 'USD')} (${c.deger > onceki ? 'on katından fazla artış' : 'onda birinden az'}) — yazım hatası değil mi?`);
        // B4: tutar değiştiyse başlangıç günü bugün (girilen tutar = bugün modele ayrılan para); aynıysa eski gün korunur.
        const eskiM = eski.modeller && eski.modeller[id];
        yeni.modeller[id] = { tutar: c.deger, para: id === 'm-bist-m10' ? 'TRY' : 'USD', baslangicGunu: eskiM && eskiM.tutar === c.deger && eskiM.baslangicGunu ? eskiM.baslangicGunu : (eskiM && eskiM.tutar === c.deger ? undefined : bugunF()) };
        if (yeni.modeller[id].baslangicGunu === undefined) delete yeni.modeller[id].baslangicGunu;
      }
      if ('kesirli' in b) yeni.kesirli = b.kesirli === true || b.kesirli === 'true';
      if ('telefondaGizle' in b) yeni.telefondaGizle = b.telefondaGizle === true || b.telefondaGizle === 'true';
      if ('minIslemUSD' in b) { const c = PM.sayiCoz(b.minIslemUSD); if (c.hata || !(c.deger >= 0) || c.deger > 1e6) hatalar.push('en küçük işlem tutarı 0 ya da pozitif'); else yeni.minIslemUSD = c.deger; }
      if (b.hesaplar && typeof b.hesaplar === 'object') {
        yeni.hesaplar = { ...(eski.hesaplar || {}) };
        for (const [t, hid] of Object.entries(b.hesaplar)) { if (!/^[a-z-]{2,20}$/.test(t)) continue; if (hid) yeni.hesaplar[t] = String(hid).slice(0, 40); else delete yeni.hesaplar[t]; }
      }
      if (hatalar.length) return res.status(400).json({ success: false, error: hatalar.join(' · ') });
      if (sorular.length) return res.status(409).json({ success: false, kod: 'onay', soru: sorular.join(' '), error: 'onay gerekli: ' + sorular.join(' ') });
      yeni.guncelleme = new Date().toISOString();
      DF.jsonYaz('sermaye.json', yeni);
      log('INFO', `🧭 Tasarımcı model sermayesi güncellendi (${Object.keys(yeni.modeller).length} model; tutar yalnız bu bilgisayarda)`);
      res.json({ success: true, sermaye: sermayeOku() });
    } catch (e) { hata(res, e); }
  });

  r.post('/api/tasarimci/emirler/:ay/uygula', (req, res) => {
    try {
      const ay = ayParam(req, res); if (!ay) return;
      const b = govde(req), id = String(b.model || '');
      if (!MD.MODELLER.includes(id)) return res.status(400).json({ success: false, error: 'model seçilmedi' });
      const sec = Array.isArray(b.satirlar) ? b.satirlar : [];
      if (!sec.length) return res.status(400).json({ success: false, error: 'uygulanacak satır seçilmedi' });
      const tekrar = sec.map(x => String(x.anahtar)).filter((a, i, l) => l.indexOf(a) !== i);
      if (tekrar.length) return res.status(400).json({ success: false, kod: 'tekrar', error: `aynı satır bir istekte iki kez: ${[...new Set(tekrar)].join(', ')}` });   // D1
      const tarih = String(b.tarih || bugunF());
      if (!PM.tarihGecerli(tarih)) return res.status(400).json({ success: false, error: 'tarih YYYY-AA-GG olmalı' });
      if (tarih > bugunF()) return res.status(400).json({ success: false, kod: 'tarih', error: `işlem tarihi gelecekte (${tarih}) — bugün ya da önceki bir gün girin` });
      const o = emirlerKur(ay, { model: id }), m = o.modeller[0];
      if (m.atla) return res.status(409).json({ success: false, kod: 'atlandi', error: `${m.ad} bu ay atlandı (${m.atla.neden || 'neden yok'}) — önce "atlamayı kaldır"` });
      if (!m.liste) return res.status(400).json({ success: false, error: m.durum === 'sermaye-yok' ? 'model sermayesi girilmedi' : 'bu ay için karar yok' });
      // O1: uygulama günü ≤ tarih ≤ bugün (837'de yerleşim kararı yoksa ayın ilk günü)
      const altSinir = (m.karar && m.karar.uygulamaGunu) || `${ay}-01`;
      if (tarih < altSinir) return res.status(400).json({ success: false, kod: 'tarih', error: `işlem tarihi (${tarih}) bu ayın uygulama gününden (${altSinir}) önce olamaz` });
      const tum = [...m.liste.satirlar, ...(m.liste.aktarim ? [m.liste.aktarim] : [])];
      const anah = E.uygulamaAnahtarlari(o._durum.kayitlar, o._durum.D, { ay, model: id });
      const cift = sec.filter(x => anah.has(String(x.anahtar)));
      if (cift.length) return res.status(409).json({ success: false, kod: 'cift', error: `zaten uygulandı (Portföyüm'de kayıtlı): ${cift.map(x => x.anahtar).join(', ')} — yeniden kaydetmek için önce o uygulamayı geri alın`, anahtarlar: cift.map(x => x.anahtar) });
      const secilen = [];
      for (const x of sec) {
        const s = tum.find(y => y.anahtar === String(x.anahtar) && !y.uygulandi);
        if (!s) return res.status(400).json({ success: false, error: `satır bu ayın listesinde yok: ${x.anahtar}` });
        if (!s.uygulanabilir) return res.status(400).json({ success: false, error: `${x.anahtar}: ${s.engel || 'uygulanamaz'}` });
        // O1: hesabın açılışından önce tarihli kayıt yok (açılış günü = açılıştan sonra sayılır)
        for (const hid of [s.hesap, s.hedefHesap].filter(Boolean)) {
          const ac = o._durum.D.islemler.filter(y => y.islem === 'acilis' && y.hesap === hid).map(y => y.tarih).sort().pop();
          if (ac && tarih < ac) { const hs = o._durum.D.hesaplar.get(hid); return res.status(400).json({ success: false, kod: 'tarih', error: `işlem tarihi (${tarih}) ${hs ? hs.ad : hid} hesabının açılışından (${ac}) önce — açılış bakiyesi o günün sonundaki bakiyedir` }); }
        }
        secilen.push(s.tur === 'aktarim' ? { ...s, tutar: x.tutar != null && x.tutar !== '' ? x.tutar : s.tutar, ulasanTutar: x.ulasanTutar != null && x.ulasanTutar !== '' ? x.ulasanTutar : null } : { ...s, adet: x.adet != null && x.adet !== '' ? x.adet : s.adet, fiyat: x.fiyat != null && x.fiyat !== '' ? x.fiyat : s.fiyat, ucret: x.ucret });
      }
      const normal = secilen.map(s => (s.tur === 'aktarim' ? { anahtar: s.anahtar, tutar: String(s.tutar), ...(s.ulasanTutar != null ? { ulasanTutar: String(s.ulasanTutar) } : {}) } : { anahtar: s.anahtar, adet: String(s.adet), fiyat: String(s.fiyat), ucret: s.ucret == null ? '' : String(s.ucret) }));
      const im = E.imza({ ay, model: id, tarih, satirlar: normal });
      const uygulama = `u-${ay}-${id}-${Date.now().toString(36)}`;
      const pk = E.uygulaKayitlari(secilen, { D: o._durum.D, ay, model: id, tarih, uygulama });
      if (pk.hatalar.length) return res.status(400).json({ success: false, error: pk.hatalar.join(' · '), hatalar: pk.hatalar });
      const on = pEkle(pk.kayitlar, { yazma: false });
      const ozet = { kayitSayisi: pk.kayitlar.length, islemSayisi: pk.kayitlar.filter(k => k.tur === 'islem').length, yeniVarliklar: pk.yeniVarliklar.map(v => ({ id: v.id, sembol: v.sembol, para: v.para, kod: v.kod })),
        kayitlar: pk.kayitlar.filter(k => k.tur === 'islem').map(k => ({ islem: k.islem, tarih: k.tarih, hesap: k.hesap, hedefHesap: k.hedefHesap, varlik: k.varlik, sembol: (secilen.find(s => s.anahtar === k.tasarimci.anahtar) || {}).sembol || null, adet: k.adet, fiyat: k.fiyat, ucret: k.ucret, tutar: k.tutar, para: k.para, acilisSonrasi: !!k.acilisSonrasi, gunIciSira: k.gunIciSira })),
        uyarilar: on.uyarilar, hatalar: on.hatalar,
        // D5: hesap nakdi önce → sonra, emir listesiyle AYNI yuvarlama kuralıyla (emirler.js nakitSonra); panel bunu gösterir.
        nakit: [...E.nakitKalemleri(pk.kayitlar.filter(k => k.tur === 'islem'))].filter(([h]) => m.liste.nakit && m.liste.nakit[h])
          .map(([h, kl]) => ({ hesap: h, ad: m.liste.nakit[h].hesapAd || h, once: m.liste.nakit[h].mevcut, sonra: E.nakitSonra(m.liste.nakit[h].mevcut, kl), para: m.liste.nakit[h].para || m.liste.para })) };
      if (b.yazma !== true) return res.status(on.tamam ? 200 : 400).json({ success: on.tamam, onizleme: true, imza: im, ...ozet, ...(on.tamam ? {} : { error: on.hatalar.map(h => h.mesaj).join(' · ') }) });
      if (String(b.imza || '') !== im) return res.status(409).json({ success: false, kod: 'onizleme', error: 'önizlemeden sonra satırlar değişti — yeniden önizleyin', imza: im });
      if (!on.tamam) return res.status(400).json({ success: false, error: on.hatalar.map(h => h.mesaj).join(' · '), hatalar: on.hatalar });
      const yaz = pEkle(pk.kayitlar, { kaynak: 'tasarimci' });
      if (!yaz.tamam) return res.status(400).json({ success: false, error: yaz.hatalar.map(h => h.mesaj).join(' · '), hatalar: yaz.hatalar });
      // O3: ayın İLK uygulamasında (ya da hepsi geri alındıktan sonraki ilkinde) hedef adetleri dondur.
      if (id !== 'm-837' && m.liste.dondurmaAday && !anah.size) {
        const ud = atlaOku(ay); ud.ay = ay; ud.dondurma = ud.dondurma || {};
        ud.dondurma[id] = { ...m.liste.dondurmaAday, zaman: new Date().toISOString(), uygulama };
        DF.jsonYaz(`uygulama/${ay}.json`, ud);
      }
      log('INFO', `🧭 Tasarımcı "Uyguladım": ${ay} ${id} — ${ozet.islemSayisi} işlem Portföyüm'e yazıldı (${uygulama})`);
      res.json({ success: true, uygulama, eklenen: yaz.eklenen.map(k => k.id), uyarilar: yaz.uyarilar, islemSayisi: ozet.islemSayisi, yeniVarliklar: ozet.yeniVarliklar });
    } catch (e) { hata(res, e); }
  });

  r.post('/api/tasarimci/emirler/:ay/geri-al', (req, res) => {
    try {
      const ay = ayParam(req, res); if (!ay) return;
      const b = govde(req), u = String(b.uygulama || '');
      const y = depoP().yukle({ bugun: bugunF() });
      const hedefler = y.kayitlar.filter(k => k.tur === 'islem' && k.tasarimci && k.tasarimci.ay === ay && k.tasarimci.uygulama === u && !y.D.iptalEdilen.has(k.id));
      if (!hedefler.length) return res.status(404).json({ success: false, error: 'bu uygulamanın iptal edilmemiş kaydı yok' });
      const neden = String(b.neden || 'Tasarımcı: uygulama geri alındı').slice(0, 300);
      const sonuc = pEkle(hedefler.map(k => ({ tur: 'duzeltme', hedef: k.id, neden: `${neden} (${u})`, kaynakKayit: 'tasarimci' })), {});
      if (!sonuc.tamam) return res.status(400).json({ success: false, error: sonuc.hatalar.map(h => h.mesaj).join(' · ') });
      log('INFO', `🧭 Tasarımcı uygulaması geri alındı: ${u} (${hedefler.length} ters kayıt)`);
      res.json({ success: true, iptal: hedefler.map(k => k.id), uyarilar: sonuc.uyarilar });
    } catch (e) { hata(res, e); }
  });

  r.post('/api/tasarimci/emirler/:ay/atla', (req, res) => {
    try {
      const ay = ayParam(req, res); if (!ay) return;
      const b = govde(req), id = String(b.model || '');
      if (!MD.MODELLER.includes(id)) return res.status(400).json({ success: false, error: 'model seçilmedi' });
      const d = atlaOku(ay); d.ay = ay; d.atla = d.atla || {};
      if (b.kaldir === true) { delete d.atla[id]; DF.jsonYaz(`uygulama/${ay}.json`, d); return res.json({ success: true, atla: null }); }
      const neden = String(b.neden || '').trim().slice(0, 300);
      if (!neden) return res.status(400).json({ success: false, error: 'atlama nedeni yazın (karar günlüğüne girer)' });
      const y = depoP().yukle({ bugun: bugunF() });
      const anah = E.uygulamaAnahtarlari(y.kayitlar, y.D, { ay, model: id });
      if (anah.size) return res.status(409).json({ success: false, kod: 'uygulandi', error: 'bu ay için uygulanmış kayıt var — önce geri alın' });
      d.atla[id] = { neden, zaman: new Date().toISOString() };
      DF.jsonYaz(`uygulama/${ay}.json`, d);
      log('INFO', `🧭 Tasarımcı: ${ay} ${id} bu ay atlandı`);
      res.json({ success: true, atla: d.atla[id] });
    } catch (e) { hata(res, e); }
  });

  r.post('/api/tasarimci/hedef-aktar', (req, res) => {
    try {
      const b = govde(req), duzey = b.duzey === 'varlik' ? 'varlik' : 'sinif';
      const kararlar = DF.oku('kararlar').satirlar;
      const ay = b.ay && AY_RE.test(String(b.ay)) ? String(b.ay) : varsayilanAy(kararlar);
      const o = emirlerKur(ay);
      const bant = b.bant == null || b.bant === '' ? 5 : PM.sayi(b.bant);
      const listeler = o.modeller.filter(m => m.hedef && m.sermaye).map(m => ({ hedef: { ...modelHedefi(m.id, ay, kararlar).hedef }, sermaye: m.sermaye }));
      const usdtry = (o._durum.deg.kur && o._durum.deg.kur.USDTRY) || (() => { try { const u = require('./veri').usdtry(); return u.length ? u[u.length - 1].c : null; } catch (e) { return null; } })();
      const h = E.hedefKaydi(listeler, { D: o._durum.D, deg: o._durum.deg, duzey, usdtry, bant, ay });
      if (h.hatalar.length && !h.kayit) return res.status(400).json({ success: false, error: h.hatalar.join(' · ') });
      if (h.hatalar.length) return res.status(400).json({ success: false, error: h.hatalar.join(' · ') });
      const kayitlar = [...h.yeniVarliklar, h.kayit];
      const on = pEkle(kayitlar, { yazma: false });
      const im = E.imza({ ay, duzey, bant, agirliklar: h.kayit.agirliklar });
      const ad = (k) => { const v = o._durum.D.varliklar.get(k) || h.yeniVarliklar.find(x => x.id === k); return v ? v.sembol : (PM.SINIFLAR[k] || k); };
      const kurTarih = (o._durum.deg.kur && o._durum.deg.kur.tarih) || (() => { try { const u = require('./veri').usdtry(); return u.length ? u[u.length - 1].t : null; } catch (e) { return null; } })();
      const cevrim = listeler.filter(x => x.sermaye && x.sermaye.para === 'TRY' && usdtry > 0).map(x => ({ model: x.hedef.model, ad: x.hedef.ad || x.hedef.model, tutar: x.sermaye.tutar, para: 'TRY', usd: Math.round(x.sermaye.tutar / usdtry * 100) / 100 }));
      const ozet = { duzey, bant, usdtry, kurTarih, cevrim, agirliklar: h.kayit.agirliklar, satirlar: Object.entries(h.kayit.agirliklar).map(([k, w]) => ({ anahtar: k, ad: ad(k), yuzde: w })).sort((a, z) => z.yuzde - a.yuzde),
        yeniVarliklar: h.yeniVarliklar.map(v => v.sembol), uyarilar: on.uyarilar, hatalar: on.hatalar, not: 'Hedef yalnız model kalemlerini kapsar (toplam %100); Portföyüm\'deki diğer varlıklar hedef dışı görünür. Önceki hedef kaydı geçmişte kalır.' };
      if (b.yazma !== true) return res.json({ success: on.tamam, onizleme: true, imza: im, ...ozet, ...(on.tamam ? {} : { error: on.hatalar.map(x => x.mesaj).join(' · ') }) });
      if (String(b.imza || '') !== im) return res.status(409).json({ success: false, kod: 'onizleme', error: 'önizlemeden sonra hedef değişti — yeniden önizleyin', imza: im });
      const yaz = pEkle(kayitlar, { kaynak: 'tasarimci' });
      if (!yaz.tamam) return res.status(400).json({ success: false, error: yaz.hatalar.map(x => x.mesaj).join(' · ') });
      log('INFO', `🧭 Tasarımcı hedefi Portföyüm'e aktarıldı (${duzey}, ${Object.keys(h.kayit.agirliklar).length} kalem)`);
      res.json({ success: true, eklenen: yaz.eklenen.map(k => k.id), ...ozet });
    } catch (e) { hata(res, e); }
  });

  // ── Kendi tasarımlarım (kurucu kaydı = yeni sürüm; Ö14) ───────────────────────
  const TS = require('./tasarimlar');
  r.get('/api/tasarimci/tasarimlar', (req, res) => {
    try { res.json({ success: true, bugun: bugunF(), ...TS.liste({ bugun: bugunF(), seviyeAl: ops.seviyeAl }),
      kural: 'Kendi tasarımınız ölçülmemiş birleşimdir — kabul değil: izlenir, emir listesi açılmaz, deneme sayacına girmez; en çok 3 tasarım izlenir; değişiklik sonraki karar gününde yürürlüğe girer.' }); }
    catch (e) { hata(res, e); }
  });
  r.post('/api/tasarimci/tasarim', (req, res) => {
    try {
      const b = govde(req), islem = String(b.islem || '');
      const o = TS.hazirla(islem, b, { bugun: bugunF() });
      if (b.yazma !== true) return res.json({ success: true, onizleme: true, ...o });
      if (String(b.imza || '') !== o.imza) return res.status(409).json({ success: false, kod: 'onizleme', error: 'önizlemeden sonra bir şey değişti — yeniden önizleyin', imza: o.imza });
      const satir = TS.ekle(o.satir);
      log('INFO', `🧭 Kendi tasarım ${satir.id} sürüm ${satir.surum}: ${islem} (${satir.durum}${satir.yururluk ? ', yürürlük ' + satir.yururluk : ''})`);
      res.json({ success: true, satir, uyarilar: o.uyarilar });
    } catch (e) { if (e instanceof TS.TasarimHatasi) return res.status(e.durum).json({ success: false, kod: e.kod, error: e.message }); hata(res, e); }
  });

  // 63.3 Sinyaller ekranı: BTC trendi + coin sepeti bugün ne diyor (lib/research/sinyaller.js, ayrı iş parçacığında; yalnız okur,
  // tutar içermez). Bu yönlendiricide durur: server.js'e dokunmadan otomatik güncellemeyle kurulur.
  r.get('/api/sinyaller', async (req, res) => {
    try { res.json({ success: true, ...(await require('../research/sinyaller').hesaplaArkada()) }); }
    catch (e) { hata(res, e); }
  });

  // 63.7 İleri test — EUR/USD CBDR gölge testi (PLAN-ILERI-CBDR.md, lib/ileri/cbdrGolge.js): kayıt + ara rapor + canlı "sıradaki gün"
  // (bellek içi, yazmaz; 5 dk önbellek). Kaydı ileri test işi (scripts/ileri-izle.js) yazar. Bu yönlendiricide durur: server.js'e
  // dokunmadan otomatik güncellemeyle kurulur.
  r.get('/api/ileri/cbdr', async (req, res) => {
    try { res.json(await require('../ileri/cbdrGolge').panelVerisi()); }
    catch (e) { hata(res, e); }
  });

  // 64.9 İleri test — 876 gölge + Hücum %90 / 876 %10 (PLAN-ILERI-876.md, lib/ileri/golge876.js, deneme 882): yalnız son.json okunur
  // (ağ yok, yazmaz). Kaydı ileri test işi (scripts/ileri-izle.js) yazar. Araştırma modunda /api/ileri/ sunucudan okunur (lib/evOkuma.js).
  r.get('/api/ileri/876', (req, res) => {
    try { res.json(require('../ileri/golge876').panelVerisi()); }
    catch (e) { hata(res, e); }
  });

  // 73.1 İleri test — BIST temettü ex-gün gölgesi (PLAN-ILERI-TEMETTU.md, lib/ileri/temettuGolge.js, deneme 970) ve 2 haftalık
  // momentum kolu gölgesi (PLAN-ILERI-MOMENTUM.md, lib/ileri/momentumGolge.js, deneme 971): yalnız son.json okunur (ağ yok, yazmaz).
  // Kaydı ileri test işi (scripts/ileri-izle.js) yazar. Araştırma modunda /api/ileri/ sunucudan okunur (lib/evOkuma.js).
  r.get('/api/ileri/temettu', (req, res) => {
    try { res.json(require('../ileri/temettuGolge').panelVerisi()); }
    catch (e) { hata(res, e); }
  });
  r.get('/api/ileri/momentum', (req, res) => {
    try { res.json(require('../ileri/momentumGolge').panelVerisi()); }
    catch (e) { hata(res, e); }
  });

  // 64.4 İleri test › Demo kabul RAPORU (PLAN-DEMO-KABUL §8; SALT OKUMA): scripts/demo-kabul-rapor.js ile AYNI çekirdek
  // (lib/ileri/demoKabulRapor.panelOzet) — ölçüt tablosu, Gün N / 63, §8.2 kayıt kapsamı, prova günlüğü; HÜKÜM yalnız 63. günden
  // sonra. Dosya YAZMAZ, ağa çıkmaz (prod mum referansı yalnız önbellekten; `--ag` komut satırında). 60 sn önbellek.
  // Bu yönlendiricide durur: server.js'e dokunmadan otomatik güncellemeyle kurulur.
  let demoRaporOnbellek = null;
  r.get('/api/ileri/kabul-rapor', (req, res) => {
    try {
      if (!demoRaporOnbellek || Date.now() - demoRaporOnbellek.zaman > 60 * 1000) demoRaporOnbellek = { zaman: Date.now(), rapor: require('../ileri/demoKabulRapor').panelOzet() };
      res.json({ success: true, rapor: demoRaporOnbellek.rapor });
    } catch (e) { hata(res, e); }
  });

  r.post('/api/tasarimci/yenile', (req, res) => {
    try {
      if (!zamanlayici) return res.status(503).json({ success: false, error: 'tasarımcı zamanlayıcısı kurulmadı' });
      const s = zamanlayici.tetikle('elle (panel)');
      log('INFO', `🧭 Tasarımcı elle yenile: ${s.baslatildi ? 'başladı' : 'zaten çalışıyor'}`);
      res.json({ success: true, ...s });
    } catch (e) { hata(res, e); }
  });
  return r;
}

module.exports = { kur, router: ops => kur(ops), sermayeOku, tutarIzni, tutarHesapla };
