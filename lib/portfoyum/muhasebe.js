/**
 * PORTFÖYÜM — MUHASEBE (adet, maliyet, gerçekleşen K/Z) — sürüm 60.8
 * ═══════════════════════════════════════════════════════════════════════════
 * `muhasebe(durum)` işlemleri TARİH SIRASIYLA bir kez geçer. Her "çift" (hesap + varlık, ya da hesap + nakit para birimi)
 * için İKİ defter tutulur:
 *   ana    — ekranda görülen bakiye. Açılışı olan çiftte açılış gününden SONRAKİ işlemler; açılışı olmayanda hepsi.
 *   golge  — açılışı olan çiftte açılış tarihi ve ÖNCESİNDEKİ işlemler (açılış bakiyesine DAHİL — model.js ACILIS_KURALI).
 *            Adedi değiştirmez; maliyet geçmişi (açılışta maliyet girilmediyse) ve gerçekleşen K/Z için kullanılır.
 *
 * Aynı gün içindeki sıra bilinmiyorsa (yalnız tarih girilir) gün içinde önce GİRİŞLER sayılır (bölünme → yatırma →
 * temettü/faiz → alış → transfer → satış → ücret → çekme), açılış GÜN SONUNDA uygulanır. İşlem `gunIciSira` (0–999, küçük
 * önce) taşıyorsa o kullanılır (Ö10, 61.1 — Tasarımcı paketi: satış 100+, aktarım 200+, alış 300+); bkz. siralaIslemler.
 * 61.0'da yazılmış (gunIciSira taşımayan) Tasarımcı kayıtları 61.0 sırasını birebir korur (Ö21; bkz. eskiTasarimciMi).
 *
 * Maliyet: FIFO lotları (vergi için) ve ağırlıklı ortalama, ikisi de varlığın KENDİ para biriminde. Alış ücreti maliyete,
 * satış ücreti satış gelirinden düşülür. Açılışta birim maliyet verildiyse o kullanılır; verilmediyse ve gölge defter açılış
 * adedini TAM açıklıyorsa gölge lotlar; yoksa maliyet "bilinmiyor" (K/Z gösterilmez, ekranda nedeni yazar).
 *
 * DIŞ AKIŞLAR (TWR için): yatırma/çekme, açılış (ana deftere ayni giriş) ve bacaklarından biri gölgede kalan çok bacaklı
 * işlemin ana bacağı. Akış = (tarih, çift, adet değişimi); değerlemede o günün fiyatıyla paraya çevrilir.
 */
'use strict';
const M = require('./model');
const { EPS, ciftAnahtari } = M;

const ONCELIK = { bolunme: 0, yatir: 1, temettu: 2, faiz: 2, al: 3, transfer: 4, sat: 5, ucret: 6, cek: 7, acilis: 9 };

function yeniDefter() {
  return { adet: 0, lotlar: [], ortAdet: 0, ortToplam: 0, ortBilinmiyor: false, gercFifo: 0, gercOrt: 0, gercBilinmiyor: false, gelir: 0, gider: 0, eksik: false };
}

/** Yalnız FIFO lotu + adet (ortalama defter ayrı: ortEkle). */
function lotEkle(d, adet, birimMaliyet, tarih) {
  if (!(adet > EPS)) return;
  d.adet += adet;
  d.lotlar.push({ adet, maliyet: birimMaliyet == null ? null : birimMaliyet, tarih });
}
/** Ortalama maliyet defterine adet + TOPLAM maliyet (null = bilinmiyor). */
function ortEkle(d, adet, toplam) {
  if (!(adet > EPS)) return;
  d.ortAdet += adet;
  if (toplam == null) d.ortBilinmiyor = true; else d.ortToplam += toplam;
}
/** Lot ekle (birimMaliyet null = bilinmiyor): FIFO lotu + ortalama defter aynı birim maliyetle. */
function arti(d, adet, birimMaliyet, tarih) {
  if (!(adet > EPS)) return;
  lotEkle(d, adet, birimMaliyet, tarih);
  ortEkle(d, adet, birimMaliyet == null ? null : adet * birimMaliyet);
}

/**
 * Adet düş (FIFO). `netFiyat` verilirse (satış) gerçekleşen K/Z yazılır.
 * Döndürür: { tuketilen: [lot], eksikAdet, ortDusen (ortalama defterden düşülen TOPLAM maliyet), ortBilinmiyor }.
 * Transfer, hedefin ortalama defterine ortDusen'i yazar (FIFO lotlarından ayrı — denetim 2026-10-09).
 * Defterde yeterli adet yoksa eksikAdet > 0 (çağıran hata/uyarı yazar); adet yine düşülür (negatif görünür).
 */
function eksi(d, adet, netFiyat) {
  const tuketilen = [];
  let kalan = adet;
  while (kalan > EPS && d.lotlar.length) {
    const l = d.lotlar[0];
    const al = Math.min(l.adet, kalan);
    tuketilen.push({ adet: al, maliyet: l.maliyet, tarih: l.tarih });
    l.adet -= al; kalan -= al;
    if (l.adet <= EPS) d.lotlar.shift();
  }
  const eldeOlan = d.adet;
  const ortBirim = d.ortAdet > EPS && !d.ortBilinmiyor ? d.ortToplam / d.ortAdet : null;
  if (netFiyat != null) {
    for (const l of tuketilen) { if (l.maliyet == null) d.gercBilinmiyor = true; else d.gercFifo += l.adet * (netFiyat - l.maliyet); }
    const satilan = Math.min(adet, Math.max(0, eldeOlan));
    if (ortBirim == null) { if (satilan > EPS) d.gercBilinmiyor = true; } else d.gercOrt += satilan * (netFiyat - ortBirim);
    if (kalan > EPS) d.gercBilinmiyor = true;
  }
  // Ortalama: düşülen adet kadar ortalama maliyet çıkar (oran korunur).
  const dusen = Math.min(adet, Math.max(0, d.ortAdet));
  const ortBilinmiyor = d.ortBilinmiyor || dusen < adet - EPS;
  const ortDusen = d.ortAdet > EPS ? d.ortToplam * (dusen / d.ortAdet) : 0;
  if (d.ortAdet > EPS) {
    const pay = dusen / d.ortAdet;
    d.ortToplam -= d.ortToplam * pay;
    d.ortAdet -= dusen;
    if (d.ortAdet <= EPS) { d.ortAdet = 0; d.ortToplam = 0; d.ortBilinmiyor = false; }
  }
  d.adet -= adet;
  if (Math.abs(d.adet) <= EPS) d.adet = 0;
  return { tuketilen, eksikAdet: kalan > EPS ? kalan : 0, ortDusen, ortBilinmiyor };
}

/** Bölünme: adet × oran, birim maliyet ÷ oran. */
function bol(d, oran) {
  d.adet *= oran;
  for (const l of d.lotlar) { l.adet *= oran; if (l.maliyet != null) l.maliyet /= oran; }
  d.ortAdet *= oran;
}

/** Nakit defteri: yalnız adet (tutar). */
const nakitArti = (d, t) => { d.adet += t; };
const nakitEksi = (d, t) => { d.adet -= t; if (Math.abs(d.adet) <= 1e-7) d.adet = 0; };

/**
 * Ana muhasebe geçişi.
 * Döndürür: {
 *   ciftler: Map anahtar → { anahtar, hesap, varlik?, para, nakit, ana, golge, acilis?, adimlar: [[tarih, adet]], acilisTutarlilik? },
 *   akislar: [{ tarih, anahtar, adet, tur, birimMaliyet? (açılış) }], hatalar: [{kod, id, mesaj}], uyarilar: [{kod, id?, mesaj}],
 *   olaylar: [{ tarih, id }]   (işlenen sıra; değerleme için)
 * }
 */
function muhasebe(D) {
  const ciftler = new Map();
  const hatalar = [], uyarilar = [], akislar = [];
  // Çok bacaklı işlemlerin ANA defter bacakları (değerleme: bir bacağın çifti o gün değerlenemiyorsa diğer bacaklar dış akış sayılır).
  const islemBacaklari = [];
  const acilisTarihi = new Map();
  for (const x of D.islemler) if (x.islem === 'acilis') acilisTarihi.set(x.varlik ? ciftAnahtari(x.hesap, x.varlik) : ciftAnahtari(x.hesap, x.para, true), x.tarih);

  const cift = (hesap, varlikId, para, nakit) => {
    const a = nakit ? ciftAnahtari(hesap, para, true) : ciftAnahtari(hesap, varlikId);
    let c = ciftler.get(a);
    if (!c) {
      c = { anahtar: a, hesap, varlik: nakit ? null : varlikId, para, nakit: !!nakit, ana: yeniDefter(), golge: yeniDefter(), acilis: null, adimlar: [], acilisTarihi: acilisTarihi.get(a) || null };
      ciftler.set(a, c);
    }
    return c;
  };
  // Açılış günündeki işlem açılıştan SONRA mı (ana defter), açılışa DAHİL mi (gölge)? — acilisSonrasiMi (gün içi sıradan ayrı).
  let simdikiIslem = null;
  const karar = acilisKarari(D), sonraKumesi = karar.sonraKumesi;
  // Karar çift başına (D1): 61.1 Tasarımcı kaydı bir çiftin açılışına dahil, başka çiftinkinden sonra olabilir.
  const defter = (c, tarih) => (c.acilisTarihi && (tarih < c.acilisTarihi || (tarih === c.acilisTarihi && !(simdikiIslem && karar.sonraMi(simdikiIslem, c.anahtar)))) ? 'golge' : 'ana');

  const sirali = siralaIslemler(D, sonraKumesi);
  const degisen = new Set();
  let gun = null;
  const gunKapat = () => {
    if (gun == null) return;
    for (const c of degisen) { const son = c.adimlar[c.adimlar.length - 1]; if (son && son[0] === gun) son[1] = c.ana.adet; else c.adimlar.push([gun, c.ana.adet]); }
    degisen.clear();
  };

  /** Bacak uygula: tür, çift, adet/tutar; döner hangi deftere gittiği. */
  const islemAd = (x) => `${M.ISLEM_TURLERI[x.islem] || x.islem} ${x.tarih}`;
  // D5 (denetim 61.1): "satışı öne alın" ipucu yalnız o gün bu hesapta (aynı para biriminde) satış varsa.
  const gunSatisVar = (c, x) => D.islemler.some(y => y.islem === 'sat' && y.tarih === x.tarih && y.hesap === c.hesap && y.id !== x.id
    && (() => { const vy = D.varliklar && D.varliklar.get ? D.varliklar.get(y.varlik) : null; return !vy || vy.para === c.para; })());
  const negatifDenetle = (c, d, x, eksikAdet) => {
    if (c.nakit) {
      if (d === 'ana' && c.ana.adet < -1e-6) uyarilar.push({ kod: 'nakit-eksi', id: x.id, mesaj: `${hesapAdi(D, c.hesap)} ${c.para} nakdi eksiye düştü (${islemAd(x)}: ${paraTr(c.ana.adet, c.para)}) — para yatırma ya da nakit açılışı eksik olabilir${gunSatisVar(c, x) ? "; aynı gün satışınız var: 'Aynı gün sırası' ile satışı öne alın" : ''}` });
      return;
    }
    if (eksikAdet > 0 || c[d].adet < -EPS) {
      const v = D.varliklar.get(c.varlik);
      const ad = v ? v.sembol : c.varlik;
      if (d === 'ana') hatalar.push({ kod: 'negatif', id: x.id, mesaj: `negatif adet: ${hesapAdi(D, c.hesap)} · ${ad} ${islemAd(x)} sonrası ${fmt(c.ana.adet)} (elde olandan fazla çıkış)` });
      else c.golge.eksik = true;
    }
  };

  for (const x of sirali) {
    if (x.tarih !== gun) { gunKapat(); gun = x.tarih; }
    simdikiIslem = x;
    const v = x.varlik ? D.varliklar.get(x.varlik) : null;
    const para = x.para || (v && v.para);
    const bacaklar = [];   // { c, d, adetDegisim } — akış tespiti için
    const kaydet = (c, adetDegisim) => { const d = defter(c, x.tarih); bacaklar.push({ c, d, adetDegisim }); if (d === 'ana') degisen.add(c); return d; };

    switch (x.islem) {
      case 'acilis': {
        const c = v ? cift(x.hesap, x.varlik, v.para, false) : cift(x.hesap, null, x.para, true);
        // Açılış gün sonunda ana defteri KURAR: adet = açılış adedi (öncesindeki her şey gölgede).
        const ad = v ? x.adet : x.tutar;
        c.acilis = { id: x.id, tarih: x.tarih, adet: ad, birimMaliyet: x.birimMaliyet == null ? null : x.birimMaliyet, not: x.not || '' };
        const a = c.ana = yeniDefter();
        if (c.nakit) a.adet = ad;
        else if (ad > EPS) {
          const g = c.golge;
          const golgeAciklar = !g.eksik && Math.abs(g.adet - ad) <= 1e-6 * Math.max(1, ad) && g.lotlar.length;
          if (x.birimMaliyet != null) arti(a, ad, x.birimMaliyet, x.tarih);
          else if (golgeAciklar && g.lotlar.every(l => l.maliyet != null) && !g.ortBilinmiyor) {
            for (const l of g.lotlar) lotEkle(a, l.adet, l.maliyet, l.tarih);
            ortEkle(a, ad, g.ortToplam);   // ortalama defter gölgenin ortalamasıyla (FIFO lotlarından ayrı)
          }
          else arti(a, ad, null, x.tarih);
          // Tutarlılık bilgisi: gölge defter (açılış öncesi kayıtlar) açılış adedini açıklıyor mu?
          c.acilisTutarlilik = { gecmisAdet: g.adet, acilisAdet: ad, tutarli: Math.abs(g.adet - ad) <= 1e-6 * Math.max(1, ad) && !g.eksik, gecmisVar: g.lotlar.length > 0 || Math.abs(g.adet) > EPS || g.eksik };
          if (c.acilisTutarlilik.gecmisVar && !c.acilisTutarlilik.tutarli) {
            uyarilar.push({ kod: 'acilis-tutarsiz', id: x.id, mesaj: `${hesapAdi(D, c.hesap)} · ${v.sembol}: açılış ${fmt(ad)} adet, açılış öncesi kayıtlar ${fmt(g.adet)} adet ediyor — eksik geçmiş işlem olabilir (bakiye açılış adedidir; çift sayım yok)` });
          }
        }
        degisen.add(c);
        // 67.2: birim maliyeti bilinen açılış o gün ALIŞ FİYATINDAN girer (getiri alıştan ölçülür; degerleme.gunlukSeri, rapor.katkilar).
        akislar.push({ tarih: x.tarih, anahtar: c.anahtar, adet: ad, tur: 'acilis', id: x.id, birimMaliyet: !c.nakit && x.birimMaliyet != null ? x.birimMaliyet : null });
        break;
      }
      case 'al': case 'sat': {
        const ca = cift(x.hesap, x.varlik, v.para, false), cn = cift(x.hesap, null, v.para, true);
        const brut = x.adet * x.fiyat, ucret = x.ucret || 0;
        if (x.islem === 'al') {
          const d = kaydet(ca, x.adet); arti(ca[d], x.adet, (brut + ucret) / x.adet, x.tarih);
          const dn = kaydet(cn, -(brut + ucret)); nakitEksi(cn[dn], brut + ucret); negatifDenetle(cn, dn, x, 0);
          ca[d].gider += ucret;
        } else {
          const d = kaydet(ca, -x.adet); const r = eksi(ca[d], x.adet, (brut - ucret) / x.adet); negatifDenetle(ca, d, x, r.eksikAdet);
          const dn = kaydet(cn, brut - ucret); nakitArti(cn[dn], brut - ucret);
          ca[d].gider += ucret;
        }
        break;
      }
      case 'temettu': {
        const cn = cift(x.hesap, null, para, true), ca = cift(x.hesap, x.varlik, v.para, false);
        const net = x.tutar - (x.vergi || 0);
        const dn = kaydet(cn, net); nakitArti(cn[dn], net);
        ca[defter(ca, x.tarih)].gelir += net;
        break;
      }
      case 'faiz': {
        const cn = cift(x.hesap, null, para, true);
        const net = x.tutar - (x.vergi || 0);
        const dn = kaydet(cn, net); nakitArti(cn[dn], net); cn[dn].gelir += net;
        break;
      }
      case 'ucret': {
        const cn = cift(x.hesap, null, para, true);
        const dn = kaydet(cn, -x.tutar); nakitEksi(cn[dn], x.tutar); cn[dn].gider += x.tutar; negatifDenetle(cn, dn, x, 0);
        break;
      }
      case 'yatir': case 'cek': {
        const cn = cift(x.hesap, null, para, true);
        const isaret = x.islem === 'yatir' ? 1 : -1;
        const dn = kaydet(cn, isaret * x.tutar);
        if (isaret > 0) nakitArti(cn[dn], x.tutar); else { nakitEksi(cn[dn], x.tutar); negatifDenetle(cn, dn, x, 0); }
        if (dn === 'ana') akislar.push({ tarih: x.tarih, anahtar: cn.anahtar, adet: isaret * x.tutar, tur: x.islem, id: x.id });
        bacaklar.length = 0;   // tek bacaklı dış akış: aşağıdaki "karışık bacak" kuralı uygulanmaz
        break;
      }
      case 'transfer': {
        if (v) {
          const ck = cift(x.hesap, x.varlik, v.para, false), ch = cift(x.hedefHesap, x.varlik, v.para, false);
          const dk = kaydet(ck, -x.adet); const r = eksi(ck[dk], x.adet, null); negatifDenetle(ck, dk, x, r.eksikAdet);
          const dh = kaydet(ch, x.adet);
          // FIFO lotları maliyetleriyle; ortalama defter KAYNAĞIN ortalamasıyla (düşülen ortalama tutar).
          for (const l of r.tuketilen) lotEkle(ch[dh], l.adet, l.maliyet, l.tarih);
          if (r.eksikAdet > 0) lotEkle(ch[dh], r.eksikAdet, null, x.tarih);
          ortEkle(ch[dh], x.adet, r.ortBilinmiyor ? null : r.ortDusen);
        } else {
          const ck = cift(x.hesap, null, para, true), ch = cift(x.hedefHesap, null, para, true);
          const dk = kaydet(ck, -x.tutar); nakitEksi(ck[dk], x.tutar); negatifDenetle(ck, dk, x, 0);
          // B6 (62.1): hedefe ulaşan tutar (boşsa gönderilen) — aradaki fark masraf: portföyden çıkar, dış akış sayılmaz.
          const ulasan = Number.isFinite(x.ulasanTutar) ? x.ulasanTutar : x.tutar;
          const dh = kaydet(ch, ulasan); nakitArti(ch[dh], ulasan);
        }
        break;
      }
      case 'bolunme': {
        for (const c of ciftler.values()) {
          if (c.nakit || c.varlik !== x.varlik) continue;
          const d = defter(c, x.tarih);
          bol(c[d], x.oran);
          if (d === 'ana') degisen.add(c);
        }
        break;
      }
      default: break;
    }
    // Karışık bacak: bacaklardan biri gölgede (açılışa dahil) diğeri ana defterde → ana bacak DIŞ AKIŞ sayılır
    // (aksi hâlde ana bakiyede karşılıksız artış/azalış "getiri" görünürdü).
    if (bacaklar.length > 1 && bacaklar.every(b => b.d === 'ana')) islemBacaklari.push({ tarih: x.tarih, id: x.id, bacaklar: bacaklar.map(b => ({ anahtar: b.c.anahtar, adet: b.adetDegisim })) });
    if (bacaklar.length > 1 && bacaklar.some(b => b.d === 'golge') && bacaklar.some(b => b.d === 'ana')) {
      for (const b of bacaklar) if (b.d === 'ana') akislar.push({ tarih: x.tarih, anahtar: b.c.anahtar, adet: b.adetDegisim, tur: 'karisik', id: x.id });
      // Açılış öncesi işlemin NAKİT bacağı, açılışı olmayan nakit çiftine (ana deftere) düştü: aynı hesapta nakit açılışı eksik.
      const golgeCift = bacaklar.find(b => b.d === 'golge');
      for (const b of bacaklar) {
        if (b.d !== 'ana' || !b.c.nakit || b.c.acilisTarihi) continue;
        uyarilar.push({ kod: 'acilis-nakit-eksik', id: x.id, hesap: b.c.hesap, para: b.c.para, tarih: golgeCift.c.acilisTarihi,
          mesaj: `${hesapAdi(D, b.c.hesap)}: ${islemAd(x)} açılışa dahil ama ${b.c.para} nakit açılışı yok — nakit bacağı bakiyeye yazıldı. Bu hesaba ${golgeCift.c.acilisTarihi} tarihli ${b.c.para} nakit açılışı (0 ya da gerçek tutar) ekleyin` });
      }
    }
  }
  gunKapat();
  return { ciftler, akislar, islemBacaklari, hatalar, uyarilar };
}

/**
 * GÜN İÇİ SIRA (Ö10, panel 61.1). Aynı tarihli işlemler şu anahtarla sıralanır (küçük önce), eşitlikte kayıt sırası (`sira`):
 *   açılışa DAHİL olanlar ve açılışı olmayan günler : gunIciSira ?? varsayilanSira(x)   (0–999)
 *   açılış kaydı (gün sonu bakiyesi)               : 1000
 *   açılıştan SONRA olanlar                         : 2000 + (gunIciSira ?? 0)
 * varsayilanSira = ONCELIK × 100 → gunIciSira taşımayan eski defterin sırası BİREBİR aynıdır (eski: öncelik, açılış 9,
 * acilisSonrasi 10 — hepsi eşit, kayıt sırasıyla). acilisSonrasi artık gün içi önceliğe karışmaz; yalnız açılışın
 * öncesi/sonrası ayrımını (aşama) belirler — açılış ana defteri yeniden kurduğu için "sonra" işlemleri açılıştan sonra işlenmeli.
 */
const varsayilanSira = (x) => (ONCELIK[x.islem] == null ? 800 : ONCELIK[x.islem] * 100);

/**
 * ESKİ (61.0) Tasarımcı kaydı: `kaynakKayit:'tasarimci'` ama `gunIciSira` yok (61.1 paketi her kayda gunIciSira yazar).
 * Karar Ö21 (denetim 61.1 O2): bu kayıtların gün içi sırası ve açılış dahil/sonra kararı 61.0 davranışını BİREBİR korur —
 * elle kayıt gibi yalnız kendi `acilisSonrasi` işaretine bakılır (işaretli → öncelik 10 = açılıştan sonra, gün sonu
 * grubunda kayıt sırasıyla; işaretsiz → tür önceliği, ör. satış 5). Geçmiş muhasebe sonucu sessizce değişmez.
 */
const eskiTasarimciMi = (x) => x.kaynakKayit === 'tasarimci' && x.gunIciSira == null;
/** 61.1 Tasarımcı kaydı (gunIciSira taşır): açılış kararı çift başına (D1) ve açılışın `dahilEdilen` listesiyle. */
const yeniTasarimciMi = (x) => x.kaynakKayit === 'tasarimci' && x.gunIciSira != null;

/** İşlemin dokunduğu çiftlerin anahtarları (açılış dahil/sonra kararı çift başına verilir). */
function dokunulanCiftler(D, x) {
  const v = x.varlik && D.varliklar && typeof D.varliklar.get === 'function' ? D.varliklar.get(x.varlik) : null;
  const vp = (v && v.para) || x.para;
  const l = [];
  switch (x.islem) {
    case 'al': case 'sat':
      if (x.varlik) l.push(ciftAnahtari(x.hesap, x.varlik));
      if (vp) l.push(ciftAnahtari(x.hesap, vp, true));
      break;
    case 'temettu':
      if (x.varlik) l.push(ciftAnahtari(x.hesap, x.varlik));
      if (x.para || vp) l.push(ciftAnahtari(x.hesap, x.para || vp, true));
      break;
    case 'transfer':
      if (x.varlik) l.push(ciftAnahtari(x.hesap, x.varlik), ciftAnahtari(x.hedefHesap, x.varlik));
      else l.push(ciftAnahtari(x.hesap, x.para, true), ciftAnahtari(x.hedefHesap, x.para, true));
      break;
    case 'bolunme': break;
    default: if (x.para) l.push(ciftAnahtari(x.hesap, x.para, true));
  }
  return l;
}

/**
 * AÇILIŞ KARARI — açılış gününde bir işlem açılıştan SONRA mı (ana defter), açılışa DAHİL mi (gölge)?
 *   · Elle işlem ve ESKİ (61.0) Tasarımcı kaydı: `acilisSonrasi` işaretiyle (panel sorar / 61.0 yazmıştı).
 *   · 61.1 Tasarımcı kaydı: varsayılan "sonra"; kayıt açıkça acilisSonrasi:false taşıyorsa (CSV gidiş-dönüşü) dahil; ÇİFTİN
 *     açılışı `dahilEdilen` listesinde bu kaydı sayıyorsa (açılış sonradan girildi, cevap "dahil") YALNIZ o çift için dahil
 *     (denetim 61.1 D1: bir açılışın cevabı başka — özellikle daha önce girilmiş — açılışların sayımını değiştirmez).
 * Döndürür: { sonraMi(x, ciftAnahtari), sonraKumesi } — sonraKumesi gün içi SIRA içindir (açılışlardan sonra işlenecekler):
 * 61.1 Tasarımcı kaydı o gün hesabında (ya da hedef hesapta) açılış varsa ve açılışlı çiftlerinin en az birinde "sonra"
 * ise (ya da hiçbir açılışlı çifte dokunmuyorsa — paket sırası korunur) kümede; açılışlı bütün çiftlerinde dahilse değil.
 */
function acilisKarari(D) {
  const acilisCift = new Map(), acilisGun = new Set();
  for (const x of D.islemler) {
    if (x.islem !== 'acilis') continue;
    acilisGun.add(x.hesap + '|' + x.tarih);
    acilisCift.set(x.varlik ? ciftAnahtari(x.hesap, x.varlik) : ciftAnahtari(x.hesap, x.para, true), x);
  }
  const sonraMi = (x, anahtar) => {
    if (!yeniTasarimciMi(x)) return !!x.acilisSonrasi;
    if (x.acilisSonrasi === false) return false;
    const A = acilisCift.get(anahtar);
    return !(A && A.tarih === x.tarih && Array.isArray(A.dahilEdilen) && A.dahilEdilen.includes(x.id));
  };
  const sonraKumesi = new Set();
  for (const x of D.islemler) {
    if (x.islem === 'acilis') continue;
    if (!yeniTasarimciMi(x)) { if (x.acilisSonrasi) sonraKumesi.add(x); continue; }
    if (x.acilisSonrasi === false) continue;
    if (!acilisGun.has(x.hesap + '|' + x.tarih) && !(x.hedefHesap && acilisGun.has(x.hedefHesap + '|' + x.tarih))) continue;
    const acilisli = dokunulanCiftler(D, x).filter(a => { const A = acilisCift.get(a); return A && A.tarih === x.tarih; });
    if (acilisli.length && acilisli.every(a => !sonraMi(x, a))) continue;
    sonraKumesi.add(x);
  }
  return { sonraMi, sonraKumesi };
}

/** Açılış gününde açılıştan SONRA (sıra bakımından) işlenen işlemler (nesne kümesi) — acilisKarari(D).sonraKumesi. */
function acilisSonrasiKumesi(D) { return acilisKarari(D).sonraKumesi; }
function siraAnahtari(x, sonraKumesi) {
  if (x.islem === 'acilis') return 1000;
  const g = Number.isInteger(x.gunIciSira) ? x.gunIciSira : null;
  if (sonraKumesi.has(x)) return 2000 + (g == null ? 0 : g);
  return g == null ? varsayilanSira(x) : g;
}
/** İşlemlerin muhasebe sırası (tarih, gün içi anahtar, kayıt sırası). */
function siralaIslemler(D, sonraKumesi) {
  const k = sonraKumesi || acilisSonrasiKumesi(D);
  return D.islemler.slice().sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : (siraAnahtari(a, k) - siraAnahtari(b, k)) || (a.sira - b.sira)));
}

function hesapAdi(D, id) { const h = D.hesaplar.get(id); return h ? h.ad : id; }
const SIMGE = { USD: '$', TRY: '₺', EUR: '€', GBP: '£' };
/** Tutar tr-TR biçiminde, eksi işareti U+2212 ("−23.210,23 $"; B-07). */
function paraTr(x, para) {
  const v = Math.round(x * 100) / 100;
  const m = Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '−' : '') + m + (para ? ' ' + (SIMGE[para] || para) : '');
}
function fmt(x) { return (Math.round(x * 1e6) / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 6 }).replace(/^-/, '−'); }

/** Çiftin bir tarihteki ana adedi (adım fonksiyonu; tarih öncesi 0). */
function adetTarihte(c, tarih) {
  let a = 0;
  for (const [t, x] of c.adimlar) { if (t > tarih) break; a = x; }
  return a;
}

/** Çiftin maliyet özeti (ana defter, kendi para biriminde). */
function maliyetOzeti(c) {
  const d = c.ana;
  if (c.nakit) return null;
  const lotlarBilinir = d.lotlar.every(l => l.maliyet != null);
  const fifoToplam = lotlarBilinir ? d.lotlar.reduce((s, l) => s + l.adet * l.maliyet, 0) : null;
  const ortBirim = d.ortAdet > EPS && !d.ortBilinmiyor ? d.ortToplam / d.ortAdet : null;
  return {
    adet: d.adet,
    fifoToplam, fifoBirim: fifoToplam != null && d.adet > EPS ? fifoToplam / d.adet : null,
    ortBirim, ortToplam: ortBirim != null ? ortBirim * d.adet : null,
    bilinmiyor: !lotlarBilinir || d.ortBilinmiyor,
    gercFifo: d.gercFifo + c.golge.gercFifo, gercOrt: d.gercOrt + c.golge.gercOrt, gercBilinmiyor: d.gercBilinmiyor || c.golge.gercBilinmiyor,
    gelir: d.gelir + c.golge.gelir, gider: d.gider + c.golge.gider,
    lotlar: d.lotlar.map(l => ({ ...l }))
  };
}

module.exports = { muhasebe, adetTarihte, maliyetOzeti, ONCELIK, varsayilanSira, siralaIslemler, acilisSonrasiKumesi, acilisKarari, eskiTasarimciMi, dokunulanCiftler, paraTr, _ic: { arti, lotEkle, ortEkle, eksi, bol, yeniDefter } };
