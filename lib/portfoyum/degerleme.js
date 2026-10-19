/**
 * PORTFÖYÜM — DEĞERLEME, GETİRİ (TWR), DÜŞÜŞ, DAĞILIM, ANLIK GÖRÜNTÜ (sürüm 60.8)
 * ═══════════════════════════════════════════════════════════════════════════
 *   degerle(D, muh, ops)   → bugünkü pozisyonlar (kendi para biriminde fiyat/maliyet/K-Z + USD ve TL değer), hesap kırılımı,
 *                            toplam USD/TL, uyarılar (bayat fiyat, fiyatsız varlık, bayat hesap)
 *   gunlukSeri(D, muh, ops)→ ilk kayıttan bugüne her takvim günü: değer USD/TL, dış akış USD/TL, TWR endeksi USD/TL
 *   getiriler(seri)        → gün / ay başından / yıl başından / tümü (TWR) + en yüksekten düşüş (şimdiki ve en büyük), USD ve TL
 *   dagilim(D, deg)        → hedef (kullanıcının girdiği) ile gerçek; sınıf ya da varlık düzeyinde; sapma > bant işaretli
 *   anlikGoruntu(...)      → data/portfoyum/anlik/YYYY-AA-GG.json içeriği (nokta-zamanlı kayıt)
 *
 * TWR (zaman ağırlıklı getiri): r_t = Σ_p (V_t,p − F_t,p) / Σ_p V_{t−1},p − 1 — toplam YALNIZ hem dün hem bugün DEĞERLENEBİLEN
 * çiftler (p) üzerinden (denetim 2026-10-09): fiyatı ya da kuru olmayan çift o gün dışarıda kalır; değeri İLK KEZ hesaplanabildiği
 * gün getiriye girmez (dış akış gibi), ertesi gün tabana katılır — sonradan gelen ilk fiyat sahte getiri üretmez. F = o günün dış
 * akışları (yatırma +, çekme −, açılış ayni giriş +) o günün fiyatı ve kuruyla; akış gün SONUNDA. Payda ≤ 0 ise r = 0 (taban).
 * USD ve TL ayrı ayrı (TL'de kur değişimi getiriye dahildir). Kur serisi başlamadan önceki günlerde değer YOK (gelecekteki kur
 * kullanılmaz).
 */
'use strict';
const M = require('./model');
const F = require('./fiyat');
const { adetTarihte, maliyetOzeti } = require('./muhasebe');

const GUN = 864e5;
const BAYAT_HESAP_GUN = 30;

/** Varlık başına fiyat serileri (elle + işlem fiyatı + bölünme düzeltmesi). */
function seriler(D, ops = {}) {
  const kurlar = ops.kurlar || F.kurSerileri(ops.kurOnbellek);
  const out = new Map();
  for (const v of D.varliklar.values()) {
    const islemFiyatlari = D.islemler.filter(x => x.varlik === v.id && (x.islem === 'al' || x.islem === 'sat') && x.fiyat > 0).map(x => ({ tarih: x.tarih, fiyat: x.fiyat }));
    const bolunmeler = D.islemler.filter(x => x.varlik === v.id && x.islem === 'bolunme').map(x => ({ tarih: x.tarih, oran: x.oran }));
    const ilkTarih = D.islemler.filter(x => x.varlik === v.id).reduce((m, x) => (m == null || x.tarih < m ? x.tarih : m), null);
    out.set(v.id, F.varlikSerisi(v, { elleFiyatlar: D.fiyatlar.get(v.id) || [], islemFiyatlari, bolunmeler, kurlar, binanceOnbellek: ops.binanceOnbellek, ilkTarih }));
  }
  return { seri: out, kurlar };
}

/** Tutar (kendi para biriminde) → { usd, tl } t gününde. */
function cevirTarihte(tutar, para, t, kurlar) {
  const u = F.usdDegeri(para, t, kurlar), k = F.usdtry(t, kurlar);
  if (!u) return { usd: null, tl: para === 'TRY' ? tutar : null, kurYok: para };
  const usd = tutar * u.deger;
  return { usd, tl: para === 'TRY' ? tutar : (k ? usd * k.deger : null), kurYok: para !== 'TRY' && !k ? 'TRY' : null };
}
const KUR_BAYAT_GUN = 5;
const OTOMATIK_KAYNAK = { yahoo: 'Yahoo', tefas: 'TEFAS', binance: 'Binance', altin: 'gram altın (GC=F × USD/TRY)' };
const KAYNAK_AD = { islem: 'işlem fiyatı', elle: 'elle fiyat', yahoo: 'Yahoo', tefas: 'TEFAS', binance: 'Binance', altin: 'gram altın' };

/** Bugünkü değerleme. ops: { bugun, kurlar, seriler } */
function degerle(D, muh, ops = {}) {
  const bugun = ops.bugun || M.yerelGun();
  const bt = M.gunMs(bugun);
  const S = ops.seriler || seriler(D, ops);
  const kurlar = S.kurlar;
  const uyarilar = [];
  const kurYoklar = new Set();
  const pozisyonlar = [], nakitler = [];
  for (const c of muh.ciftler.values()) {
    const adet = adetTarihte(c, bugun);
    const hs = D.hesaplar.get(c.hesap);
    if (c.nakit) {
      if (Math.abs(adet) < 1e-9 && !c.acilis) continue;
      const d = cevirTarihte(adet, c.para, bt, kurlar);
      if (d.kurYok && Math.abs(adet) > 1e-9) kurYoklar.add(d.kurYok);
      nakitler.push({ anahtar: c.anahtar, hesap: c.hesap, hesapAd: hs ? hs.ad : c.hesap, para: c.para, tutar: adet, degerUSD: d.usd, degerTL: d.tl,
        sinif: c.para === 'TRY' ? 'tl-nakit' : 'nakit', gelir: c.ana.gelir + c.golge.gelir, gider: c.ana.gider + c.golge.gider });
      continue;
    }
    const v = D.varliklar.get(c.varlik);
    const mo = maliyetOzeti(c);
    if (Math.abs(adet) < 1e-12 && Math.abs(mo.gercFifo) < 1e-9 && !mo.gelir && !c.acilis) continue;
    const seri = S.seri.get(c.varlik);
    const f = seri ? F.fiyatTarihte(seri, bt, bt) : null;
    const deger = f ? adet * f.fiyat : null;
    const d = deger != null ? cevirTarihte(deger, v.para, bt, kurlar) : { usd: null, tl: null };
    const kzFifo = deger != null && mo.fifoToplam != null ? deger - mo.fifoToplam : null;
    const kzOrt = deger != null && mo.ortToplam != null ? deger - mo.ortToplam : null;
    let kaynakYok = false;
    if (Math.abs(adet) > 1e-12) {
      if (seri && seri.uyari) uyarilar.push({ kod: 'kaynak', mesaj: v.sembol + ': ' + seri.uyari });
      if (seri && seri.bolunmeUyari) uyarilar.push({ kod: 'bolunme-eksik', mesaj: v.sembol + ': ' + seri.bolunmeUyari });
      // Otomatik kaynaklı varlıkta kaynak serisi boş ya da eski ve fiyat işlem/elle fiyatından geliyorsa: her zaman söylenir.
      const kaynakEski = !!(seri && OTOMATIK_KAYNAK[v.kaynak] && (seri.kaynakSon == null || (bt - seri.kaynakSon) / GUN > (F.BAYAT_GUN[v.kaynak] || 5)));
      if (f && kaynakEski && (f.kaynak === 'islem' || f.kaynak === 'elle')) {
        kaynakYok = true;
        uyarilar.push({ kod: 'kaynak-yok', mesaj: v.sembol + ': ' + OTOMATIK_KAYNAK[v.kaynak] + ' fiyatı ' + (seri.kaynakSon == null ? 'yok' : 'eski (' + M.msGun(seri.kaynakSon) + ')')
          + ' — ' + KAYNAK_AD[f.kaynak] + ' kullanılıyor (' + f.tarih + '); "Fiyatları yenile" ya da kaynak kodunu düzeltin' });
      }
      if (!f) uyarilar.push({ kod: 'fiyatsiz', mesaj: v.sembol + ': fiyat yok — elle fiyat girin ya da kaynağı düzeltin; toplama katılmadı' });
      else if (f.bayat && !kaynakYok) uyarilar.push({ kod: 'bayat-fiyat', mesaj: v.sembol + ': son fiyat ' + f.tarih + ' (' + f.yasGun + ' gün önce, ' + (KAYNAK_AD[f.kaynak] || f.kaynak) + ') — bayat' });
      if (deger != null && d.kurYok) kurYoklar.add(d.kurYok);
    }
    pozisyonlar.push({
      anahtar: c.anahtar, hesap: c.hesap, hesapAd: hs ? hs.ad : c.hesap, varlik: v.id, sembol: v.sembol, ad: v.ad, sinif: v.sinif, para: v.para, kaynak: v.kaynak,
      adet, fiyat: f ? f.fiyat : null, fiyatTarih: f ? f.tarih : null, fiyatKaynak: f ? f.kaynak : null, fiyatBayat: f ? (f.bayat || kaynakYok) : null, fiyatYas: f ? f.yasGun : null, kaynakYok,
      deger, degerUSD: d.usd, degerTL: d.tl,
      ortMaliyet: mo.ortBirim, fifoMaliyet: mo.fifoBirim, maliyetToplamOrt: mo.ortToplam, maliyetToplamFifo: mo.fifoToplam, maliyetBilinmiyor: mo.bilinmiyor,
      kzOrt, kzFifo, kzYuzde: kzOrt != null && mo.ortToplam > 0 ? kzOrt / mo.ortToplam : null,
      gerceklesenFifo: mo.gercFifo, gerceklesenOrt: mo.gercOrt, gerceklesenBilinmiyor: mo.gercBilinmiyor, gelir: mo.gelir,
      acilis: c.acilis ? { tarih: c.acilis.tarih, adet: c.acilis.adet, birimMaliyet: c.acilis.birimMaliyet } : null,
      acilisTutarlilik: c.acilisTutarlilik || null, lotlar: mo.lotlar
    });
  }
  const toplam = (l, a) => l.reduce((s, x) => s + (x[a] == null ? 0 : x[a]), 0);
  const toplamUSD = toplam(pozisyonlar, 'degerUSD') + toplam(nakitler, 'degerUSD');
  const toplamTL = toplam(pozisyonlar, 'degerTL') + toplam(nakitler, 'degerTL');
  for (const p of pozisyonlar) p.agirlik = toplamUSD > 0 && p.degerUSD != null ? p.degerUSD / toplamUSD : null;
  for (const n of nakitler) n.agirlik = toplamUSD > 0 && n.degerUSD != null ? n.degerUSD / toplamUSD : null;

  // Hesap kırılımı
  const simdiMs = ops.simdiMs != null ? ops.simdiMs : Date.now();
  const hesaplar = [...D.hesaplar.values()].map(h => {
    const p = pozisyonlar.filter(x => x.hesap === h.id), n = nakitler.filter(x => x.hesap === h.id);
    const sonMs = h.sonKayit ? Date.parse(h.sonKayit) : null;
    const yas = sonMs != null ? Math.floor((simdiMs - sonMs) / GUN) : null;
    const bayat = h.durum === 'acik' && yas != null && yas > BAYAT_HESAP_GUN;
    const k = D.kurumlar.get(h.kurum);
    if (bayat) uyarilar.push({ kod: 'bayat-hesap', mesaj: `${h.ad}: ${yas} gündür kayıt girilmedi — bakiyeyi kontrol edin (elle güncellenen hesap)` });
    const bakiyeVar = p.some(x => Math.abs(x.adet) > 1e-9) || n.some(x => Math.abs(x.tutar) > 1e-6);
    if (h.durum === 'kapali' && bakiyeVar) uyarilar.push({ kod: 'kapali-bakiye', mesaj: `${h.ad} kapalı ama bakiyesi var — transfer ya da çekme kaydı eksik olabilir` });
    return {
      id: h.id, ad: h.ad, kurum: h.kurum, kurumAd: k ? k.ad : h.kurum, hesapTuru: h.hesapTuru, para: h.para, durum: h.durum, kapanis: h.kapanis,
      degerUSD: toplam(p, 'degerUSD') + toplam(n, 'degerUSD'), degerTL: toplam(p, 'degerTL') + toplam(n, 'degerTL'),
      nakit: n.map(x => ({ para: x.para, tutar: x.tutar })), pozisyonSayisi: p.filter(x => Math.abs(x.adet) > 1e-12).length,
      sonKayit: h.sonKayit, sonKayitGun: yas, bayat, kaynak: 'elle'
    };
  });
  // Kur: yoksa "toplama katılmadı"; eskiyse bayat (kullanılan her para birimi için).
  for (const para of kurYoklar) uyarilar.push({ kod: 'kur-yok', mesaj: para + ' kuru yok (' + bugun + ' ve öncesi) — bu birimdeki tutarlar toplama katılmadı; "Fiyatları yenile"' });
  const kullanilan = new Set([...pozisyonlar.filter(x => Math.abs(x.adet) > 1e-12).map(x => x.para), ...nakitler.filter(x => Math.abs(x.tutar) > 1e-9).map(x => x.para), 'TRY']);
  const kurBayat = [];
  for (const para of kullanilan) {
    if (para === 'USD' || kurYoklar.has(para)) continue;
    const u = F.usdDegeri(para, bt, kurlar);
    if (u && u.yasGun > KUR_BAYAT_GUN) kurBayat.push(para + ' (' + u.tarih + ')');
  }
  if (kurBayat.length) uyarilar.push({ kod: 'kur-bayat', mesaj: 'Kur bayat: ' + kurBayat.join(', ') + ' — ' + KUR_BAYAT_GUN + ' günden eski; "Fiyatları yenile"' });
  const kur = F.usdtry(bt, kurlar);
  return { tarih: bugun, pozisyonlar, nakitler, hesaplar, toplamUSD, toplamTL, kur: kur ? { USDTRY: kur.deger, tarih: kur.tarih, kaynak: kur.kaynak, bayat: kur.yasGun > KUR_BAYAT_GUN } : null, uyarilar };
}

/**
 * Günlük seri: ilk işlem gününden bugüne. Döndürür: [{ tarih, usd, tl, akisUSD, akisTL, endeksUSD, endeksTL, eksik }].
 * ops.hesap (62.4): yalnız o hesabın çiftleri; hesaplar arası transferin bu hesaptaki bacağı o hesap için DIŞ AKIŞ sayılır
 * (para girdi/çıktı — getiri değil). Hesabın ilk kaydından önceki günler seriden atılır.
 * ops.hesaplar (yeni panel F3): hesap KÜMESİ (bir portföyün hesapları) — kümenin dışındaki hesapla transfer DIŞ AKIŞ
 * (ör. Ben → Anıl: Anıl portföyüne para girişi, Ben'den çıkış); küme içi transfer akış değildir.
 */
function gunlukSeri(D, muh, ops = {}) {
  const bugun = ops.bugun || M.yerelGun();
  if (!D.islemler.length) return [];
  const S = ops.seriler || seriler(D, ops);
  const kurlar = S.kurlar;
  const ilk = D.islemler.reduce((m, x) => (x.tarih < m ? x.tarih : m), bugun);
  const t0 = M.gunMs(ilk), t1 = M.gunMs(bugun);
  const kume = ops.hesaplar ? new Set(ops.hesaplar) : ops.hesap ? new Set([ops.hesap]) : null;
  const icinde = kume ? (k) => { const c = muh.ciftler.get(k); return !!c && kume.has(c.hesap); } : () => true;
  const ciftler = [...muh.ciftler.values()].filter(c => c.adimlar.length && icinde(c.anahtar));
  const akisGun = new Map();
  const akisEkle = (a) => { const t = M.gunMs(a.tarih); if (!akisGun.has(t)) akisGun.set(t, []); akisGun.get(t).push(a); };
  for (const a of muh.akislar) if (icinde(a.anahtar)) akisEkle(a);
  const bacakGun = new Map();
  for (const b of muh.islemBacaklari || []) {
    const ic = b.bacaklar.filter(x => icinde(x.anahtar));
    if (!ic.length) continue;
    if (ic.length < b.bacaklar.length) { for (const x of ic) akisEkle({ tarih: b.tarih, anahtar: x.anahtar, adet: x.adet, tur: 'hesaplar-arasi', id: b.id }); continue; }
    const t = M.gunMs(b.tarih); if (!bacakGun.has(t)) bacakGun.set(t, []); bacakGun.get(t).push(b);
  }
  const fiyat = (c, t) => {
    if (c.nakit) return { fiyat: 1, para: c.para };
    const v = D.varliklar.get(c.varlik), s = S.seri.get(c.varlik);
    const n = s ? F.oncekiNokta(s.noktalar, t) : null;
    return n ? { fiyat: n[1], para: v.para } : null;
  };
  // Adım işaretçileri (O(gün + adım)); çift başına dünkü değer (null = değerlenemedi).
  const idx = new Map(ciftler.map(c => [c.anahtar, -1]));
  const dun = new Map();
  const out = [];
  let eUSD = 1, eTL = 1;
  for (let t = t0; t <= t1; t += GUN) {
    const g = M.msGun(t);
    let usd = 0, tl = 0, eksik = false;
    const bugunDeger = new Map();
    for (const c of ciftler) {
      let i = idx.get(c.anahtar);
      while (i + 1 < c.adimlar.length && c.adimlar[i + 1][0] <= g) i++;
      idx.set(c.anahtar, i);
      const adet = i >= 0 ? c.adimlar[i][1] : 0;
      if (Math.abs(adet) < 1e-12) { bugunDeger.set(c.anahtar, { usd: 0, tl: 0 }); continue; }
      const f = fiyat(c, t);
      if (!f) { eksik = true; bugunDeger.set(c.anahtar, null); continue; }
      const d = cevirTarihte(adet * f.fiyat, f.para, t, kurlar);
      if (d.usd == null || d.tl == null) { eksik = true; bugunDeger.set(c.anahtar, null); continue; }
      bugunDeger.set(c.anahtar, d);
      usd += d.usd; tl += d.tl;
    }
    // 67.2: birim maliyetli açılış GÜN BAŞI akışıdır (alış fiyatından girer, paydaya eklenir) → ilk gün getirisi = kapanış ÷ alış.
    // Öbür akışlar gün sonu: değeri o günün fiyatıyla, paydan düşülür.
    const akisCift = new Map(), basCift = new Map();
    let akisUSD = 0, akisTL = 0;
    for (const a of akisGun.get(t) || []) {
      const c = muh.ciftler.get(a.anahtar);
      const f = c ? fiyat(c, t) : null;
      const maliyetli = c && !c.nakit && a.tur === 'acilis' && a.birimMaliyet != null;
      if (!f && !maliyetli) continue;
      const d = maliyetli ? cevirTarihte(a.adet * a.birimMaliyet, c.para, t, kurlar) : cevirTarihte(a.adet * f.fiyat, f.para, t, kurlar);
      if (d.usd == null || d.tl == null) continue;
      akisUSD += d.usd; akisTL += d.tl;
      const hedef = maliyetli ? basCift : akisCift;
      const x = hedef.get(a.anahtar) || { usd: 0, tl: 0 };
      x.usd += d.usd; x.tl += d.tl; hedef.set(a.anahtar, x);
    }
    // Değerlenemeyen bir çifte (dün ya da bugün) dokunan işlemin DEĞERLENEN bacakları o gün DIŞ AKIŞ sayılır (yeniden denetim
    // 2026-10-09): ör. fiyatsız varlığın satışında nakit +500 getiri değil, dışarıdan giriş gibi işlenir.
    const degerlenir = (k) => !!bugunDeger.get(k) && (!dun.has(k) || !!dun.get(k));
    for (const ib of bacakGun.get(t) || []) {
      if (ib.bacaklar.every(b => degerlenir(b.anahtar))) continue;
      for (const b of ib.bacaklar) {
        if (!degerlenir(b.anahtar)) continue;
        const c = muh.ciftler.get(b.anahtar);
        const f = c ? fiyat(c, t) : null;
        if (!f) continue;
        const d = cevirTarihte(b.adet * f.fiyat, f.para, t, kurlar);
        if (d.usd == null || d.tl == null) continue;
        const x = akisCift.get(b.anahtar) || { usd: 0, tl: 0 };
        x.usd += d.usd; x.tl += d.tl; akisCift.set(b.anahtar, x);
      }
    }
    // Yalnız dün ve bugün değerlenebilen çiftler: ilk kez değerlenen ya da bugün değerlenemeyen çift getiri yaratmaz.
    let payUSD = 0, payTL = 0, paydaUSD = 0, paydaTL = 0;
    for (const [k, b] of bugunDeger) {
      const o = dun.has(k) ? dun.get(k) : { usd: 0, tl: 0 };   // dün hiç yoktu = 0 adet = değeri 0 (değerlenebilir)
      if (!b || !o) continue;
      const fa = akisCift.get(k) || { usd: 0, tl: 0 }, fb = basCift.get(k) || { usd: 0, tl: 0 };
      payUSD += b.usd - fa.usd; payTL += b.tl - fa.tl; paydaUSD += o.usd + fb.usd; paydaTL += o.tl + fb.tl;
    }
    if (paydaUSD > 1e-9) eUSD *= payUSD / paydaUSD;
    if (paydaTL > 1e-9) eTL *= payTL / paydaTL;
    for (const [k, b] of bugunDeger) dun.set(k, b);
    out.push({ tarih: g, usd, tl, akisUSD, akisTL, endeksUSD: eUSD, endeksTL: eTL, eksik });
  }
  // Baştaki boş günler (yalnız açılışa dahil geçmiş kayıtlar — ana bakiye henüz yok) seriden atılır.
  let i0 = 0;
  while (i0 < out.length - 1 && Math.abs(out[i0].usd) < 1e-9 && Math.abs(out[i0].akisUSD) < 1e-9) i0++;
  const s = i0 ? out.slice(i0) : out;
  // 67.2: ilk gün maliyetli açılışla getiri doğduysa (endeks ≠ 1) önüne değeri 0, endeksi 1 olan bir TABAN günü konur — seriyi
  // ilk noktadan ölçen her yer (getiriler, panel ölçütleri, grafik) alıştan bugüne getiriyi görür.
  if (s.length && (Math.abs(s[0].endeksUSD - 1) > 1e-12 || Math.abs(s[0].endeksTL - 1) > 1e-12)) {
    s.unshift({ tarih: M.msGun(M.gunMs(s[0].tarih) - GUN), usd: 0, tl: 0, akisUSD: 0, akisTL: 0, endeksUSD: 1, endeksTL: 1, eksik: false, taban: true });
  }
  return s;
}

/** Dönem getirileri + düşüş (TWR endeksinden). */
function getiriler(seri) {
  const bos = { gun: null, ay: null, yil: null, tum: null, dd: null, ddEnBuyuk: null, zirve: null };
  if (!seri || !seri.length) return { USD: { ...bos }, TL: { ...bos }, bas: null, son: null };
  const son = seri[seri.length - 1];
  const hesap = (alan) => {
    const e = seri.map(x => x[alan]);
    const sonE = e[e.length - 1];
    const bazAl = (onEk) => { // önceki dönemin son günü (yoksa ilk gün = dönem içinde başladı)
      let baz = null;
      for (let i = seri.length - 1; i >= 0; i--) if (!seri[i].tarih.startsWith(onEk)) { baz = e[i]; break; }
      return baz == null ? e[0] : baz;
    };
    let zirve = -Infinity, dd = 0, ddMax = 0;
    for (const v of e) { if (v > zirve) zirve = v; const d = v / zirve - 1; if (d < ddMax) ddMax = d; dd = d; }
    return {
      gun: e.length > 1 ? sonE / e[e.length - 2] - 1 : 0,
      ay: sonE / bazAl(son.tarih.slice(0, 7)) - 1,
      yil: sonE / bazAl(son.tarih.slice(0, 4)) - 1,
      tum: sonE / e[0] - 1, dd, ddEnBuyuk: ddMax
    };
  };
  return { USD: hesap('endeksUSD'), TL: hesap('endeksTL'), bas: seri[0].tarih, son: son.tarih };
}

/** Hedef ↔ gerçek dağılım. */
/**
 * Yeni panel F3 — portföyün hesapları (kimlik listesi). ops.yalnizDahil: "toplama dahil" kapatılmış hesaplar çıkar.
 * pid 'tumu' = bütün portföylerin hesapları (salt okunur birleşim, K3).
 */
function portfoyHesaplari(D, pid, ops = {}) {
  return [...D.hesaplar.values()]
    .filter(h => (pid === 'tumu' || (h.portfoy || M.VARSAYILAN_PORTFOY) === pid) && (!ops.yalnizDahil || h.toplamaDahil !== false))
    .map(h => h.id);
}

/**
 * Yeni panel F3 — bir portföyün değeri, bütün hesapların değerlemesinden (degerle) süzülerek: toplam yalnız "toplama dahil"
 * hesaplardan; kapsam satırı ("dahil: … · dahil değil: …", PLAN §4/2) dahil olmayanları da adıyla söyler.
 * Döndürür: { portfoy, toplamUSD, toplamTL, pozisyonlar, nakitler, hesaplar, kapsam: { dahil:[ad], dahilDegil:[ad] } }.
 */
function portfoyDegeri(D, deg, pid) {
  const tum = new Set(portfoyHesaplari(D, pid));
  const dahil = new Set(portfoyHesaplari(D, pid, { yalnizDahil: true }));
  const pozisyonlar = deg.pozisyonlar.filter(p => dahil.has(p.hesap));
  const nakitler = deg.nakitler.filter(n => dahil.has(n.hesap));
  const toplam = (l, a) => l.reduce((s, x) => s + (x[a] == null ? 0 : x[a]), 0);
  const toplamUSD = toplam(pozisyonlar, 'degerUSD') + toplam(nakitler, 'degerUSD');
  const toplamTL = toplam(pozisyonlar, 'degerTL') + toplam(nakitler, 'degerTL');
  const agirlik = (x) => ({ ...x, agirlik: toplamUSD > 0 && x.degerUSD != null ? x.degerUSD / toplamUSD : null });
  const hesaplar = deg.hesaplar.filter(h => tum.has(h.id)).map(h => ({ ...h, toplamaDahil: dahil.has(h.id) }));
  const p = D.portfoyler && D.portfoyler.get(pid);
  return {
    portfoy: pid === 'tumu' ? { id: 'tumu', ad: 'Tümü' } : { id: pid, ad: p ? p.ad : pid },
    toplamUSD, toplamTL, pozisyonlar: pozisyonlar.map(agirlik), nakitler: nakitler.map(agirlik), hesaplar,
    kapsam: { dahil: hesaplar.filter(h => h.toplamaDahil && h.durum === 'acik').map(h => h.ad), dahilDegil: hesaplar.filter(h => !h.toplamaDahil).map(h => h.ad) }
  };
}

/** ops.hedef (F3): portföyün kendi hedefi (null = hedef yok); verilmezse D.hedef ('ben' portföyü — eski ekranlar). */
function dagilim(D, deg, ops = {}) {
  const h = 'hedef' in ops ? ops.hedef : D.hedef;
  const duzey = h ? h.duzey : 'sinif';
  const gercek = new Map();
  const ekle = (k, ad, usd) => { if (usd == null) return; const x = gercek.get(k) || { anahtar: k, ad, usd: 0 }; x.usd += usd; gercek.set(k, x); };
  for (const p of deg.pozisyonlar) {
    if (duzey === 'sinif') ekle(p.sinif, M.SINIFLAR[p.sinif] || p.sinif, p.degerUSD);
    else ekle(p.varlik, p.sembol, p.degerUSD);
  }
  for (const n of deg.nakitler) {
    if (duzey === 'sinif') ekle(n.sinif, M.SINIFLAR[n.sinif], n.degerUSD);
    else ekle('nakit:' + n.para, `${n.para} nakit`, n.degerUSD);
  }
  const toplam = [...gercek.values()].reduce((s, x) => s + Math.max(0, x.usd), 0);
  const anahtarlar = new Set([...gercek.keys(), ...(h ? Object.keys(h.agirliklar) : [])]);
  const adOf = (k) => {
    if (gercek.has(k)) return gercek.get(k).ad;
    if (duzey === 'sinif') return M.SINIFLAR[k] || k;
    if (k.startsWith('nakit:')) return `${k.slice(6)} nakit`;
    const v = D.varliklar.get(k); return v ? v.sembol : k;
  };
  const bant = h ? h.bant / 100 : 0.05;
  const dilimler = [...anahtarlar].map(k => {
    const g = toplam > 0 && gercek.has(k) ? Math.max(0, gercek.get(k).usd) / toplam : 0;
    const hd = h && h.agirliklar[k] != null ? h.agirliklar[k] / 100 : (h ? 0 : null);
    const sapma = hd == null ? null : g - hd;
    return { anahtar: k, ad: adOf(k), gercek: g, hedef: hd, sapma, asim: sapma != null && Math.abs(sapma) > bant + 1e-12, usd: gercek.has(k) ? gercek.get(k).usd : 0 };
  }).sort((a, b) => Math.max(b.gercek, b.hedef || 0) - Math.max(a.gercek, a.hedef || 0));
  return { duzey, hedefVar: !!h, bant, dilimler, hedef: h, asimSayisi: dilimler.filter(d => d.asim).length };
}

/** Anlık görüntü içeriği (nokta-zamanlı: o günün fiyatları ve kurlarıyla). */
function anlikGoruntu(deg, getiri) {
  return {
    surum: 1, tarih: deg.tarih, uretim: new Date().toISOString(), toplamUSD: deg.toplamUSD, toplamTL: deg.toplamTL, kur: deg.kur,
    getiri: getiri ? { USD: getiri.USD, TL: getiri.TL } : null,
    pozisyonlar: deg.pozisyonlar.filter(p => Math.abs(p.adet) > 1e-12).map(p => ({ hesap: p.hesap, varlik: p.varlik, sembol: p.sembol, adet: p.adet, fiyat: p.fiyat, para: p.para,
      fiyatTarih: p.fiyatTarih, fiyatKaynak: p.fiyatKaynak, degerUSD: p.degerUSD, degerTL: p.degerTL })),
    nakit: deg.nakitler.map(n => ({ hesap: n.hesap, para: n.para, tutar: n.tutar, degerUSD: n.degerUSD, degerTL: n.degerTL }))
  };
}

module.exports = { seriler, degerle, gunlukSeri, getiriler, dagilim, anlikGoruntu, cevirTarihte, portfoyHesaplari, portfoyDegeri, BAYAT_HESAP_GUN, KUR_BAYAT_GUN };
