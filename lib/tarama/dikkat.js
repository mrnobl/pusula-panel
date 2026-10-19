/**
 * DİKKAT F2 — KAÇIN kapıları (`kural-v1`, deneme 780). PLAN-DIKKAT-V1-ONKAYIT.md §2 + EK-1 (A1, A3, A4, düzeltme 2) + EK-2.
 * ═══════════════════════════════════════════════════════════════════════════
 * SAF fonksiyonlar: günlük ham arşiv satırı (arsiv/YYYY-MM-DD/anlik.jsonl) + önceki kayıt günlerinin özet ölçümleri →
 * token başına 16 kapının değerlendirmesi ve KAÇIN kararı. Ağ yok, dosya yok (dosya işleri lib/tarama/dikkatTakip.js).
 *
 *   KAPI SONUCU   'dogru' | 'yanlis' | 'bilinmiyor' (kaynak çağrıldı, cevap vermedi: hata/kota/belirsiz — A4 paydası)
 *                 | 'uygulanmaz' (yapısal yokluk: ağa uygun değil, sözleşme yok, kaynakta kayıt yok, önceki gün yok — paydadan çıkar)
 *   KAÇIN         ⇔ BİRİNCİL 13 kapıdan (A1) en az biri 'dogru' VE token "yetersiz veri" değil.
 *   YETERSİZ VERİ ⇔ ağına uygun güvenlik kaynağı (EVM: GoPlus, Solana: RugCheck) bugün cevap vermedi (§2.2 son paragraf).
 *                 Ayrı raporlanır, KAÇIN sayılmaz, kontrol olamaz (A2).
 *   BİLGİ         K2 rugged, K6 unlock (elle; otomatik kaynak yok), K10 veri kayboldu (A1, A3) + bilgi bayrakları
 *                 (ilk 10 ±5 puan, blacklist, vergi değişebilir, sahip yetkisi tek başına).
 *
 * Eşikler DONDURULMUŞ (`KURAL_V1`): Tarama ayarlarında kullanıcının değiştirdiği eşikler bunu ETKİLEMEZ. Herhangi bir kapı/eşik
 * değişirse yeni sürüm (`kural-v2`) + yeni deneme numarası; v1 paralel sürer (§9). `kurallarSha` her gün kaydına yazılır.
 * Kod hatası düzeltmesi sürüm değiştirmez (sabitler aynı kalır → SHA aynı).
 *
 * Bu modül liste/puan üretir ama hiçbir şeye BAĞLANMAZ: bot, portföy, emir yok (K1–K6). lib/live, lib/risk'e dokunmaz.
 */
'use strict';
const { AGLAR } = require('./aglar');
const { YAKMA } = require('./kaynaklar');
const { ayiklanmis } = require('./bayraklar');
const { kanonik, sha256 } = require('./ortak');

const GUN = 864e5;
const gunFark = (a, b) => Math.round((Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`)) / GUN);

/** kural-v1 — ön kayıttaki değerler (değiştirme: yeni sürüm). */
const KURAL_V1 = Object.freeze({
  surum: 'kural-v1',
  deneme: 780,
  birincil: Object.freeze(['K1', 'K3', 'K4', 'K5', 'K7', 'K8', 'K9', 'K11', 'K12', 'K13', 'K14', 'K15', 'K16']),
  bilgi: Object.freeze(['K2', 'K6', 'K10']),
  esik: Object.freeze({
    K5_lpPay: 0.5, K5_gencGun: 90,
    K7_pencere: 7, K7_gun: 3, K7_turler: Object.freeze(['tokenAd', 'trendingBarAd']),
    K8_ilk10: 0.5,
    K9_commitGun: 180,
    K10_kayipGun: 2,
    K11_likiditePct: 0.30,
    K12_adresPuan: 0.02,
    K13_holderPct: 0.05,
    K14_kalanGun: 30,
    K15_lpPuan: 0.20,
    K16_alanAdiGun: 30,
    bilgi_ilk10Puan: 0.05,
  }),
});
const KURALLAR = Object.freeze({ 'kural-v1': KURAL_V1 });
const kurallarSha = (k = KURAL_V1) => sha256(kanonik(k));

const KAPI_AD = Object.freeze({
  K1: 'honeypot / tamamı satılamıyor', K2: 'rugged (RugCheck)', K3: 'mint yetkisi açık', K4: 'sahip yetkisi + vergi değiştirilebilir',
  K5: 'LP kilitsiz + genç', K6: 'büyük unlock (elle)', K7: 'paralı tanıtım dalgası', K8: 'ayıklanmış ilk 10 yoğunlaşması',
  K9: 'ölü repo', K10: 'veri kayboldu', K11: 'likidite çekilmesi', K12: 'ilk 10 tek adres boşaltması', K13: 'holder düşüşü',
  K14: 'LP kilidi bitiyor', K15: 'kilitli LP azaldı', K16: 'yeni alan adı',
});

// ── Kaynak okuma ─────────────────────────────────────────────────────────
/** Satırdaki kaynak → { d: 'ok'|'bos'|'bilinmiyor'|'uygulanmaz', h: ham|null, neden }. Kayıtta hiç yoksa (toplanmadı) bilinmiyor. */
function kaynak(row, ad) {
  const s = row && row.kaynaklar ? row.kaynaklar[ad] : null;
  if (!s) return { d: 'bilinmiyor', h: null, neden: `${ad} bu gün toplanmadı` };
  if (s.durum === 'ok' || s.durum === 'onbellek') return { d: 'ok', h: s.ham || {}, neden: null };
  if (s.durum === 'bos') return { d: 'bos', h: s.ham || null, neden: s.neden || 'kaynakta kayıt yok' };
  if (s.durum === 'uygulanmaz') return { d: 'uygulanmaz', h: null, neden: s.neden || 'uygulanmaz' };
  return { d: 'bilinmiyor', h: null, neden: s.neden || s.hata || s.durum };
}
/**
 * Ağ sınıfı: 'evm' (GoPlus), 'sol' (RugCheck), 'yok' (yapısal: yerel zincir / eşleme yok), 'bilinmiyor' (sözleşme eşlemesi
 * o gün KURULAMADI: arşiv güvenlik kaynağına hata/kota/belirsiz yazmış — EK-2 c: zincire bağlı kapılar "bilinmiyor", payda içinde,
 * token yetersiz veri; denetim bulgusu 1).
 */
const BILINMIYOR_DURUM = new Set(['hata', 'kota', 'belirsiz']);
function agSinifi(row) {
  const ag = row && row.ag;
  if (!ag || ag === 'diger' || !row.adres) {
    const k = (row && row.kaynaklar) || {};
    return ['goplus', 'rugcheck'].some(a => k[a] && BILINMIYOR_DURUM.has(k[a].durum)) ? 'bilinmiyor' : 'yok';
  }
  if (ag === 'sol') return 'sol';
  return AGLAR[ag] && AGLAR[ag].goplus ? 'evm' : 'yok';
}
const guvenlikAdi = (sinif) => (sinif === 'evm' ? 'goplus' : sinif === 'sol' ? 'rugcheck' : null);

const S = {
  dogru: (deger, metin) => ({ s: 'dogru', deger, metin }),
  yanlis: (deger, metin) => ({ s: 'yanlis', deger, ...(metin ? { metin } : {}) }),
  bil: (neden) => ({ s: 'bilinmiyor', neden }),
  uyg: (neden) => ({ s: 'uygulanmaz', neden }),
};
/** Kaynağın 'ok' olmayan hâlini kapı sonucuna çevir: bos → uygulanmaz (kaynakta kayıt yok, yapısal), diğerleri olduğu gibi. */
const kaynakSonucu = (k) => (k.d === 'bilinmiyor' ? S.bil(k.neden) : S.uyg(k.neden));

// ── Özet ölçüm (ertesi günün değişim kapıları için; dikkat.jsonl'a yazılır) ──
/**
 * Arşiv satırı → küçük ölçüm nesnesi. Değişim kapıları (K11–K13, K15), K7 penceresi, K10 ve çöküş takibi bunu okur;
 * böylece ertesi gün önceki günün 1,4 MB'lık anlık dosyası yeniden okunmaz (dosya yoksa dikkatTakip anlık satırından kurar).
 */
function olcum(row) {
  const sinif = agSinifi(row);
  const g = guvenlikAdi(sinif);
  const gv = g ? kaynak(row, g) : { d: sinif === 'bilinmiyor' ? 'bilinmiyor' : 'uygulanmaz', h: null };
  const ds = kaynak(row, 'dexscreener'), cg = kaynak(row, 'coingecko'), gt = kaynak(row, 'geckoterminal'), bo = kaynak(row, 'borsa'), sp = kaynak(row, 'dexSiparis');
  const ilk10 = gv.d === 'ok' && Array.isArray(gv.h.ilk10)
    ? gv.h.ilk10.filter(x => x && x.adres && Number.isFinite(x.pay)).map(x => ({ adres: String(x.adres), pay: x.pay, temiz: g === 'rugcheck' ? !x.bilinen && !YAKMA.has(String(x.adres)) : !x.sozlesme && !x.kilitli && !x.etiket && !YAKMA.has(String(x.adres).toLowerCase()) }))
    : null;
  const ayk = gv.d === 'ok' ? ayiklanmis(gv.h.ilk10, g) : null;
  let holder = null, holderKaynak = null;
  if (gv.d === 'ok' && Number.isFinite(gv.h.holder) && gv.h.holder > 0) { holder = gv.h.holder; holderKaynak = g; }
  else if (gt.d === 'ok' && Number.isFinite(gt.h.holder) && gt.h.holder > 0) { holder = gt.h.holder; holderKaynak = 'geckoterminal'; }
  const lp = lpDurumu(g, gv);
  // K7 günlük işaret: aktif boost ya da onaylı ödenmiş reklam (tokenProfile / communityTakeover sayılmaz)
  let k7 = null;
  const boost = ds.d === 'ok' ? (Number(ds.h.boostAktif) || 0) > 0 : ds.d === 'bos' ? false : null;
  const reklam = sp.d === 'ok' ? (sp.h.siparisler || []).some(x => x && KURAL_V1.esik.K7_turler.includes(x.tur) && /approved/i.test(String(x.durum || ''))) : sp.d === 'bos' ? false : null;
  if (boost === true || reklam === true) k7 = true;
  else if (boost === false && reklam === false) k7 = false;
  else if (boost === false && sp.d === 'uygulanmaz') k7 = false;
  // Fiyat (çöküş takibi): CEX → CoinGecko, yoksa DexScreener; DEX → DexScreener, yoksa CoinGecko. Kaynak adı kayda girer.
  const dsF = ds.d === 'ok' && Number.isFinite(ds.h.fiyat) && ds.h.fiyat > 0 ? ds.h.fiyat : null;
  const cgF = cg.d === 'ok' && Number.isFinite(cg.h.fiyat) && cg.h.fiyat > 0 ? cg.h.fiyat : null;
  const sira = row.kanat === 'cex' ? [['coingecko', cgF], ['dexscreener', dsF]] : [['dexscreener', dsF], ['coingecko', cgF]];
  const f = sira.find(([, v]) => v != null) || [null, null];
  const hacim = row.kanat === 'cex'
    ? (bo.d === 'ok' ? (Number.isFinite(bo.h.spotHacim24) ? bo.h.spotHacim24 : Number.isFinite(bo.h.perpHacim24) ? bo.h.perpHacim24 : null) : null)
    : (ds.d === 'ok' && Number.isFinite(ds.h.hacim24) ? ds.h.hacim24 : null);
  // Fiyat/hacim YOK yalnız fiyat kaynakları cevap verip boş döndüyse; biri bilinmiyorsa null (K10 sayılmaz)
  const fiyatKaynaklari = row.kanat === 'cex' ? [cg, ds, bo] : [ds, cg];
  const varMi = f[1] != null || (Number.isFinite(hacim) && hacim > 0);
  const fiyatYok = varMi ? false : fiyatKaynaklari.some(k => k.d === 'bilinmiyor') ? null : true;
  return {
    sinif, guvenlik: g ? gv.d : 'uygulanmaz',
    likidite: ds.d === 'ok' && Number.isFinite(ds.h.toplamLikidite) ? ds.h.toplamLikidite : ds.d === 'bos' ? 0 : null,
    likiditeD: ds.d,
    holder, holderKaynak,
    ilk10, ilk10Ayk: ayk ? ayk.pay : null,
    lpKilitliPay: lp.kilitliPay, lpKilitBitis: lp.bitisler[0] || null,
    k7,
    fiyat: f[1], fiyatKaynak: f[0], hacim, fiyatYok,
    delist: row.kanat === 'cex' ? (bo.d === 'bos' ? true : bo.d === 'ok' ? false : null) : null,
    ilkCift: ds.d === 'ok' ? ds.h.ilkCift || null : null,
  };
}

/** LP kilit durumu. EVM: GoPlus lp_holders (kilitli ya da yakma adresindeki pay); Solana: RugCheck pazar kilitli payı + kilitçiler. */
function lpDurumu(g, gv) {
  // bitisler: TÜM kilit bitişleri (sıralı) — K14 geçmiş bitişi atıp gelecektekinin en yakınını alır (denetim bulgusu 4)
  if (gv.d !== 'ok') return { kilitliPay: null, bitisler: [], var: false };
  if (g === 'goplus') {
    const lp = Array.isArray(gv.h.lp) ? gv.h.lp.filter(x => x && Number.isFinite(x.pay)) : [];
    if (!lp.length) return { kilitliPay: null, bitisler: [], var: false };
    const kilitli = lp.filter(x => x.kilitli || YAKMA.has(String(x.adres || '').toLowerCase())).reduce((s, x) => s + x.pay, 0);
    return { kilitliPay: Math.min(1, kilitli), bitisler: lp.flatMap(x => (Array.isArray(x.kilitBitisler) ? x.kilitBitisler : [x.kilitBitis])).filter(Boolean).sort(), var: true };
  }
  if (g === 'rugcheck') {
    const p = (gv.h.lp || []).find(x => x && Number.isFinite(x.kilitliPay));
    const kilitler = Array.isArray(gv.h.kilitler) ? gv.h.kilitler : [];
    return { kilitliPay: p ? Math.min(1, p.kilitliPay) : null, bitisler: kilitler.map(x => x && x.bitis).filter(Boolean).sort(), var: !!p };
  }
  return { kilitliPay: null, bitisler: [], var: false };
}

// ── Kapılar ──────────────────────────────────────────────────────────────
/**
 * @param row     bugünün arşiv satırı (anlik.jsonl)
 * @param gun     'YYYY-MM-DD'
 * @param once    önceki kayıt günlerinin bu token için ölçümleri, YENİDEN ESKİYE: [{ gun, m: olcum() }] (en çok 7)
 * @param oncekiGun  bir önceki KAYIT günü (manifest) — token o gün yoksa değişim kapıları 'uygulanmaz'
 * @returns { kapilar: { K1…K16: sonuc }, m: olcum, bilgi: [..], yetersiz, kacin, dogru: [kod] }
 */
function degerlendir(row, gun, once = [], oncekiGun = null, kural = KURAL_V1) {
  const E = kural.esik;
  const m = olcum(row);
  const sinif = m.sinif, g = guvenlikAdi(sinif);
  const gv = g ? kaynak(row, g) : null;
  const ds = kaynak(row, 'dexscreener');
  const dun = once.find(x => x.gun === oncekiGun) || null;
  const K = {};
  const EPS = 1e-9;   // eşik sınırında kayan nokta (0,12 − 0,10 ≥ 0,02) — denetim bulgusu 7c
  const BIL = 'sözleşme eşlemesi bugün kurulamadı (CoinGecko eşlemesi alınamadı / belirsiz)';
  const yapisal = () => (sinif === 'bilinmiyor' ? S.bil(BIL) : S.uyg('sözleşmesi bilinmeyen / yerel zincir'));
  const yalnizEvm = (f) => (sinif === 'bilinmiyor' ? S.bil(BIL) : sinif !== 'evm' ? S.uyg(sinif === 'sol' ? 'EVM kapısı (Solana)' : 'sözleşmesi bilinmeyen / yerel zincir') : gv.d !== 'ok' ? kaynakSonucu(gv) : f(gv.h));
  const guvenlik = (fEvm, fSol) => (sinif === 'yok' || sinif === 'bilinmiyor' ? yapisal() : gv.d !== 'ok' ? kaynakSonucu(gv) : (sinif === 'evm' ? fEvm : fSol)(gv.h));

  // K1 honeypot — EVM
  K.K1 = yalnizEvm(h => (h.honeypot === true || h.tamSatisYok === true ? S.dogru(true, 'GoPlus is_honeypot / cannot_sell_all') : S.yanlis(false)));
  // K2 rugged — Solana (bilgi)
  K.K2 = sinif === 'bilinmiyor' ? S.bil(BIL) : sinif !== 'sol' ? S.uyg('yalnız Solana') : gv.d !== 'ok' ? kaynakSonucu(gv) : gv.h.rugged === true ? S.dogru(true, 'RugCheck rugged = true') : S.yanlis(false);
  // K3 mint
  K.K3 = guvenlik(h => (h.mint === true ? S.dogru(true, 'GoPlus is_mintable = 1') : h.mint === false ? S.yanlis(false) : S.uyg('GoPlus mint alanı yok')),
    h => (h.mintYetkisi === true ? S.dogru(true, 'Solana mint yetkisi açık') : h.mintYetkisi === false ? S.yanlis(false) : S.uyg('RugCheck mint alanı yok')));
  // K4 sahip yetkisi ∧ vergi değiştirilebilir — EVM
  K.K4 = yalnizEvm(h => {
    const sahip = h.sahipGeriAlabilir === true || h.gizliSahip === true || h.sahipBakiyeDegistirir === true;
    const vergi = h.vergiDegisebilir === true || h.kisiselVergi === true;
    return sahip && vergi ? S.dogru(true, 'sahip yetkisi (geri alma / gizli sahip / bakiye değiştirme) + vergi değiştirilebilir') : S.yanlis(false);
  });
  // K5 LP kilitsiz (< %50) ∧ ilk çift < 90 g — güvenlik kaynağı VE DexScreener
  K.K5 = (() => {
    if (sinif === 'yok' || sinif === 'bilinmiyor') return yapisal();
    if (ds.d !== 'ok') return kaynakSonucu(ds);
    if (!ds.h.ilkCift) return S.uyg('ilk çift tarihi yok');
    const yas = gunFark(ds.h.ilkCift, gun);
    if (yas >= E.K5_gencGun) return S.yanlis({ yas }, `ilk çift ${ds.h.ilkCift} (${yas} g ≥ ${E.K5_gencGun})`);
    if (gv.d !== 'ok') return kaynakSonucu(gv);
    const lp = lpDurumu(g, gv);
    if (!lp.var || lp.kilitliPay == null) return S.uyg('LP sahipliği bilgisi yok (ör. V3/V4 havuzu)');
    return lp.kilitliPay < E.K5_lpPay ? S.dogru({ yas, kilitliPay: lp.kilitliPay }, `kilitli/yakılmış LP %${(lp.kilitliPay * 100).toFixed(1)} < %${E.K5_lpPay * 100}, ilk çift ${yas} g önce`) : S.yanlis({ yas, kilitliPay: lp.kilitliPay });
  })();
  // K6 unlock — elle girilen olay; otomatik kaynak yok (A3)
  K.K6 = S.uyg('unlock yalnız elle girilir (Tokenomist otomatik erişime kapalı) — bilgi bayrağı');
  // K7 paralı tanıtım dalgası — son 7 kayıt gününün ≥ 3'ü (bugün dahil)
  K.K7 = (() => {
    if (sinif === 'yok' && m.k7 == null) return S.uyg('DexScreener kapsamı dışı');
    // "son 7 KAYIT günü" (takvim değil — denetim 7e): bugün + önceki 6 kayıt günü; token o gün kayıtta yoksa bilinmiyor
    const pencere = [{ gun, k7: m.k7 }, ...once.filter(x => x.gun !== gun).slice(0, E.K7_pencere - 1).map(x => ({ gun: x.gun, k7: x.m ? x.m.k7 : null }))];
    const evet = pencere.filter(x => x.k7 === true).length, bil = pencere.filter(x => x.k7 == null).length;
    if (evet >= E.K7_gun) return S.dogru({ evet, gun: pencere.length }, `son ${pencere.length} kayıt gününün ${evet}'ünde aktif boost / ödenmiş reklam`);
    if (evet + bil < E.K7_gun) return S.yanlis({ evet, gun: pencere.length });
    return S.bil(`paralı tanıtım penceresinde ${bil} gün bilinmiyor`);
  })();
  // K8 ayıklanmış ilk 10 ≥ %50
  const k8 = () => (m.ilk10Ayk == null ? S.uyg('ilk 10 listesi yok') : m.ilk10Ayk >= E.K8_ilk10 ? S.dogru(m.ilk10Ayk, `ayıklanmış ilk 10 payı %${(m.ilk10Ayk * 100).toFixed(1)} ≥ %${E.K8_ilk10 * 100}`) : S.yanlis(m.ilk10Ayk));
  K.K8 = guvenlik(k8, k8);
  // K9 ölü repo — GitHub (repo: DefiLlama github alanı)
  K.K9 = (() => {
    const gh = kaynak(row, 'github');
    if (gh.d === 'bilinmiyor') return S.bil(gh.neden);
    if (gh.d === 'uygulanmaz') return S.uyg(gh.neden);
    const p = gh.h && gh.h.enYeniPush;
    if (!p) return S.uyg('herkese açık repo yok');
    const yas = gunFark(p, gun);
    return yas > E.K9_commitGun ? S.dogru({ yas, son: p.slice(0, 10) }, `en yeni commit ${p.slice(0, 10)} (${yas} g > ${E.K9_commitGun})`) : S.yanlis({ yas });
  })();
  // K10 veri kayboldu — art arda 2 kayıt gününde fiyat ve hacim yok (bilgi)
  K.K10 = (() => {
    if (m.fiyatYok == null) return S.bil('fiyat kaynaklarından biri cevap vermedi');
    if (m.fiyatYok === false) return S.yanlis(false);
    const onceki = once.find(x => x.gun === oncekiGun) || once.find(x => x.gun !== gun);
    if (!onceki || !onceki.m) return S.uyg('önceki kayıt günü yok');
    return onceki.m.fiyatYok === true ? S.dogru(true, `${onceki.gun} ve ${gun} kayıtlarında fiyat ve hacim yok`) : onceki.m.fiyatYok == null ? S.bil('önceki gün fiyat kaynağı bilinmiyor') : S.yanlis(false);
  })();
  // ── Değişim kapıları (önceki KAYIT gününe göre) ──
  const degisim = (alan, f) => {
    if (!oncekiGun) return S.uyg('önceki kayıt günü yok');
    if (!dun || !dun.m) return S.uyg(`token ${oncekiGun} kaydında yok`);
    const a = dun.m[alan], b = m[alan];
    if (a == null) return S.uyg(`${oncekiGun} değeri yok`);
    if (b == null) return null;   // bugünkü değer yok → çağıran kaynak durumuna bakar
    return f(a, b);
  };
  // K11 likidite ≥ %30 düştü (DexScreener)
  K.K11 = (() => {
    if (ds.d === 'bilinmiyor' || ds.d === 'uygulanmaz') return kaynakSonucu(ds);
    const r = degisim('likidite', (a, b) => (a <= 0 ? S.uyg('önceki likidite 0') : (b / a - 1) <= -E.K11_likiditePct + EPS
      ? S.dogru({ once: a, simdi: b }, `DEX likiditesi $${Math.round(a).toLocaleString('tr-TR')} → $${Math.round(b).toLocaleString('tr-TR')} (%${((b / a - 1) * 100).toFixed(1)})`) : S.yanlis({ once: a, simdi: b })));
    return r || S.uyg('bugün likidite yok');
  })();
  // K12 ilk 10'daki temiz (EOA) adresin payı ≥ 2 puan azaldı
  K.K12 = (() => {
    if (sinif === 'yok' || sinif === 'bilinmiyor') return yapisal();
    if (gv.d !== 'ok') return kaynakSonucu(gv);
    const r = degisim('ilk10', (a, b) => {
      const simdi = new Map(b.map(x => [x.adres, x.pay]));
      const enAz = b.length ? Math.min(...b.map(x => x.pay)) : 0;
      const bosaltan = a.filter(x => x.temiz).map(x => ({ adres: x.adres, once: x.pay, simdi: simdi.has(x.adres) ? simdi.get(x.adres) : enAz })).filter(x => x.once - x.simdi >= E.K12_adresPuan - EPS);
      return bosaltan.length ? S.dogru(bosaltan.slice(0, 3), bosaltan.slice(0, 3).map(x => `${x.adres.slice(0, 8)}… %${(x.once * 100).toFixed(1)} → ${simdi.has(x.adres) ? `%${(x.simdi * 100).toFixed(1)}` : 'ilk 10 dışı'}`).join(' · ')) : S.yanlis(0);
    });
    return r || S.uyg('bugün ilk 10 listesi yok');
  })();
  // K13 holder ≥ %5 düştü — aynı kaynak iki günde (GoPlus ∨ GeckoTerminal)
  K.K13 = (() => {
    if (sinif === 'yok' || sinif === 'bilinmiyor') return yapisal();
    const gt = kaynak(row, 'geckoterminal');
    if (m.holder == null) return (gv && gv.d === 'bilinmiyor') && (gt.d === 'bilinmiyor') ? S.bil('GoPlus ve GeckoTerminal cevap vermedi') : (gv && gv.d === 'bilinmiyor') || gt.d === 'bilinmiyor' ? S.bil('holder kaynağı cevap vermedi') : S.uyg('holder sayısı yok');
    if (!oncekiGun) return S.uyg('önceki kayıt günü yok');
    if (!dun || !dun.m || dun.m.holder == null) return S.uyg(`${oncekiGun} holder değeri yok`);
    if (dun.m.holderKaynak !== m.holderKaynak) return S.uyg(`holder kaynağı değişti (${dun.m.holderKaynak} → ${m.holderKaynak})`);
    const d = m.holder / dun.m.holder - 1;
    return d <= -E.K13_holderPct + EPS ? S.dogru({ once: dun.m.holder, simdi: m.holder }, `holder ${dun.m.holder.toLocaleString('tr-TR')} → ${m.holder.toLocaleString('tr-TR')} (%${(d * 100).toFixed(1)})`) : S.yanlis({ once: dun.m.holder, simdi: m.holder });
  })();
  // K14 en yakın LP kilit bitişi ≤ 30 g (gelecekte)
  K.K14 = (() => {
    if (sinif === 'yok' || sinif === 'bilinmiyor') return yapisal();
    if (gv.d !== 'ok') return kaynakSonucu(gv);
    const lp = lpDurumu(g, gv);
    const gelecek = lp.bitisler.map(b => ({ b, kalan: gunFark(gun, b) })).filter(x => x.kalan >= 0);
    if (!gelecek.length) return S.yanlis(null);
    return gelecek[0].kalan <= E.K14_kalanGun ? S.dogru(gelecek[0], `LP kilidi ${String(gelecek[0].b).slice(0, 10)} bitiyor (${gelecek[0].kalan} g)`) : S.yanlis(gelecek[0]);
  })();
  // K15 kilitli LP payı ≥ 20 puan azaldı
  K.K15 = (() => {
    if (sinif === 'yok' || sinif === 'bilinmiyor') return yapisal();
    if (gv.d !== 'ok') return kaynakSonucu(gv);
    const r = degisim('lpKilitliPay', (a, b) => (a - b >= E.K15_lpPuan - EPS ? S.dogru({ once: a, simdi: b }, `kilitli LP %${(a * 100).toFixed(1)} → %${(b * 100).toFixed(1)}`) : S.yanlis({ once: a, simdi: b })));
    return r || S.uyg('bugün LP sahipliği bilgisi yok');
  })();
  // K16 alan adı ilk DEX çiftinden ≤ 30 g önce/sonra (RDAP VE DexScreener; ön kayıt: iki yön)
  K.K16 = (() => {
    const rd = kaynak(row, 'rdap');
    if (rd.d === 'bilinmiyor') return S.bil(rd.neden);
    if (rd.d !== 'ok') return S.uyg(rd.neden || 'alan adı yok');
    if (ds.d !== 'ok') return kaynakSonucu(ds);
    if (!rd.h.kayit || !ds.h.ilkCift) return S.uyg('kayıt ya da ilk çift tarihi yok');
    const fark = gunFark(rd.h.kayit, ds.h.ilkCift);
    return Math.abs(fark) <= E.K16_alanAdiGun ? S.dogru({ alanAdi: rd.h.alanAdi, kayit: String(rd.h.kayit).slice(0, 10), ilkCift: ds.h.ilkCift, fark }, `${rd.h.alanAdi}: kayıt ${String(rd.h.kayit).slice(0, 10)}, ilk çift ${ds.h.ilkCift} (${Math.abs(fark)} g ${fark >= 0 ? 'önce' : 'sonra'})`) : S.yanlis({ fark });
  })();

  // Bilgi bayrakları (KAÇIN değil)
  const bilgi = [];
  if (gv && gv.d === 'ok' && sinif === 'evm') {
    if (gv.h.blacklist === true || gv.h.transferDurdurulur === true) bilgi.push({ kod: 'blacklist', metin: 'kara liste / transfer durdurma yetkisi' });
    if (gv.h.vergiDegisebilir === true || gv.h.kisiselVergi === true) bilgi.push({ kod: 'vergi_degisebilir', metin: 'vergi sonradan değiştirilebilir' });
    if (gv.h.sahipGeriAlabilir === true || gv.h.gizliSahip === true || gv.h.sahipBakiyeDegistirir === true) bilgi.push({ kod: 'sahip_yetkisi', metin: 'sahip yetkileri sürüyor' });
  }
  if (gv && gv.d === 'ok' && sinif === 'sol' && gv.h.dondurmaYetkisi === true) bilgi.push({ kod: 'blacklist', metin: 'Solana dondurma yetkisi açık' });
  if (dun && dun.m && dun.m.ilk10Ayk != null && m.ilk10Ayk != null && Math.abs(m.ilk10Ayk - dun.m.ilk10Ayk) >= E.bilgi_ilk10Puan)
    bilgi.push({ kod: m.ilk10Ayk > dun.m.ilk10Ayk ? 'ilk10_artis' : 'ilk10_azalis', metin: `ayıklanmış ilk 10 %${(dun.m.ilk10Ayk * 100).toFixed(1)} → %${(m.ilk10Ayk * 100).toFixed(1)}` });
  for (const k of kural.bilgi) if (K[k] && K[k].s === 'dogru') bilgi.push({ kod: k, metin: K[k].metin });

  const yetersiz = sinif === 'bilinmiyor' || !!(g && gv && gv.d === 'bilinmiyor');
  const dogru = kural.birincil.filter(k => K[k].s === 'dogru');
  return { kapilar: K, m, bilgi, yetersiz, kacin: !yetersiz && dogru.length > 0, dogru };
}

/** Kapı değerlendirmelerinin payda özeti (A4): birincil × token, ağa uygulanabilir olanlar. */
function payda(kayitlar, kural = KURAL_V1) {
  const o = { toplam: 0, bilinmiyor: 0, kapi: {} };
  for (const k of kural.birincil) o.kapi[k] = { dogru: 0, yanlis: 0, bilinmiyor: 0, uygulanmaz: 0 };
  for (const r of kayitlar) for (const k of kural.birincil) {
    const s = r.kapilar && r.kapilar[k] ? r.kapilar[k].s : 'bilinmiyor';
    o.kapi[k][s] = (o.kapi[k][s] || 0) + 1;
    if (s !== 'uygulanmaz') { o.toplam++; if (s === 'bilinmiyor') o.bilinmiyor++; }
  }
  o.oran = o.toplam ? o.bilinmiyor / o.toplam : null;
  return o;
}

module.exports = { KURAL_V1, KURALLAR, KAPI_AD, kurallarSha, degerlendir, olcum, kaynak, agSinifi, lpDurumu, payda, gunFark };
