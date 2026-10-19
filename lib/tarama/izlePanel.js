/**
 * DİKKAT F2 — İZLE (deneme 781) + puan gölgesi (782) panel okuma katmanı (yalnız okur; hiçbir dosya yazmaz). Uçlar lib/tarama/index.js'te:
 *   GET /api/izle/durum?kip=          son günün İZLE özeti, ısınma/t0, H-DL2 sayımı (pencere sayısı, liste boyları — GETİRİ YOK), ön izleme
 *                                      karnesi (ısınma listeleri; değerlendirme dışı), A4 bilinmiyor izi, günlük seri
 *   GET /api/izle/liste?kip=&gun=     o günün İZLE listesi, puan listesi (gölge), girenler/çıkanlar
 * Coin ayrıntısı /api/dikkat/coin'e `izle` geçmişi olarak eklenir (dikkatPanel.coin → coinIzle).
 *
 * A6: hüküm günü (t0 + 374) gelmeden hiçbir H-DL2/H-DL2P getiri farkı, M değeri ya da rastgele sepet yüzdeliği bu katmandan ÇIKMAZ
 * (izleTakip.hdl2 o güne kadar yalnız sayım döndürür; burada ayrıca süzülür).
 */
'use strict';
const A = require('./arsiv');
const DT = require('./dikkatTakip');
const IZ = require('./izle');
const IT = require('./izleTakip');

const json = (b) => { try { return b ? JSON.parse(b.toString('utf8')) : null; } catch { return null; } };
/** Manifestte izle.json olan günler (eski → yeni). */
function gunler(kok) {
  return A.manifestOku(kok).satirlar.filter(k => k.tur === 'gun' && (k.dosyalar || []).some(d => /\/izle\.json$/.test(d.yol))).map(k => k.gun);
}
function kipSec(o, istenen) {
  if (istenen === 'resmi' || istenen === 'deneme') return istenen;
  for (const k of ['resmi', 'deneme']) if (gunler(A.kokDizin({ ...o, resmi: k === 'resmi' })).length) return k;
  return require('./dikkatPanel').kipSec(o, istenen);
}
const HUKUMDEN_ONCE_YASAK = ['testler', 'M', 'Mevren', 'Mhavuz', 'p', 'yuzdelik', 'a4'];
/** A6 süzgeci: hüküm gününden önce sayım dışında hiçbir alan dışarı verilmez. */
function a6Suz(h) {
  if (h.durum === 'hukum' || h.durum === 'SONUCSUZ') return h;
  const o = { ...h };
  for (const k of HUKUMDEN_ONCE_YASAK) delete o[k];
  return o;
}

function kural() {
  const I = IZ.IZLE_V1, P = IZ.PUAN_V1;
  return {
    izle: { surum: I.surum, deneme: I.deneme, sha: IZ.izleSha(), N: I.N, yuzdelikEsik: I.yuzdelikEsik, kategoriAsgari: I.kategoriAsgari, aileAsgari: I.aileAsgari, aileler: I.aileler.map(a => ({ kod: a, ad: IZ.AILE_AD[a] })) },
    puan: { surum: P.surum, deneme: P.deneme, sha: IZ.puanSha(), N: P.N, asgariOzellik: P.asgariOzellik, ozellikler: P.ozellikler.map(([kod, yon]) => ({ kod, yon, ad: IZ.OZELLIK_AD[kod] })) },
    deger: { ...I.deger },
  };
}

/** H-DL2/2P (İ24): zincirdeki izle-hukum.json okunur; yoksa yalnız sayım (A6 süzgeciyle). Panel hükmü HESAPLAMAZ. */
function hukumOku(kok, t, son) {
  const k = IT.hukumKaydi(A.manifestOku(kok).satirlar);
  if (k) { const h = json(A.dosyaOku(kok, k.yol)); if (h) return { ...h, kaynak: 'zincir', dosyaGunu: k.gun }; }
  return a6Suz(IT.hdl2(t, son || '0000-00-00'));
}

function durum(o = {}, istenen) {
  const kip = kipSec(o, istenen);
  const kok = A.kokDizin({ ...o, resmi: kip === 'resmi' });
  const g = gunler(kok);
  const son = g[g.length - 1] || null;
  const z = son ? json(A.dosyaOku(kok, `arsiv/${son}/izle.json`)) : null;
  const t = IT.takipOku(kok);
  const hata = (() => { const m = A.manifestOku(kok).satirlar.filter(k => k.tur === 'gun'); const x = m[m.length - 1]; return x && (x.dosyalar || []).some(d => /izle-hata\.json$/.test(d.yol)) ? json(A.dosyaOku(kok, `arsiv/${x.gun}/izle-hata.json`)) : null; })();
  const ozet = z ? { gun: z.gun, isinma: z.isinma, t0: z.t0, kume: z.kume, aday: z.aday, havuzSayi: z.havuzSayi, puanKapsam: z.puanKapsam, liste: (z.liste || []).length, puan: (z.puanListe || []).length,
    giren: (z.girenler || []).length, cikan: (z.cikanlar || []).length, askida: (z.askida || []).length, taban: !!z.taban, oncekiGun: z.oncekiGun, gecmisGun: z.gecmisGun || [], sayim: z.sayim, payda: z.payda, bosNeden: z.bosNeden,
    izleSha: z.izleSha, puanSha: z.puanSha, kurallarSha: z.kurallarSha } : null;
  return {
    kip, sonGun: son, gunSayisi: g.length, ozet, hata, kural: kural(),
    ilkKayitGunu: (A.manifestOku(kok).satirlar.find(k => k.tur === 'gun') || {}).gun || null,
    ilkListeEnErken: (() => { const i = (A.manifestOku(kok).satirlar.find(k => k.tur === 'gun') || {}).gun; return i ? IT.gunEkle(i, IZ.IZLE_V1.degisimGun) : null; })(),
    isinma: !t.t0 || (son && son < t.t0), t0: t.t0 || null,
    hdl2: hukumOku(kok, t, son),
    onIzleme: { izle: IT.onIzlemeKarne(t, 'izle', { t0: t.t0, gun: son }), puan: IT.onIzlemeKarne(t, 'puan', { t0: t.t0, gun: son }) },
    bilinmiyor: DT.bilinmiyorAylik(t),
    seri: (t.gunler || []).slice(-120),
  };
}

function liste(o = {}, istenen, gun) {
  const kip = kipSec(o, istenen);
  const kok = A.kokDizin({ ...o, resmi: kip === 'resmi' });
  const g = gunler(kok);
  const hedef = gun && g.includes(gun) ? gun : g[g.length - 1];
  if (!hedef) return { kip, gun: null, gunler: g, liste: [], puanListe: [], girenler: [], cikanlar: [] };
  const z = json(A.dosyaOku(kok, `arsiv/${hedef}/izle.json`)) || {};
  return { kip, gun: hedef, gunler: g.slice(-60), isinma: z.isinma, t0: z.t0 || null, kume: z.kume, aday: z.aday, havuzSayi: z.havuzSayi, puanKapsam: z.puanKapsam, sayim: z.sayim, bosNeden: z.bosNeden, taban: !!z.taban,
    liste: z.liste || [], puanListe: z.puanListe || [], girenler: z.girenler || [], cikanlar: z.cikanlar || [], askida: z.askida || [],
    puanGirenler: z.puanGirenler || [], puanCikanlar: z.puanCikanlar || [] };
}

/** /api/dikkat/coin eki: son kayıt günlerinde token İZLE / puan listesinde miydi, havuzda mıydı. */
function coinIzle(kok, anahtar, n = 14) {
  const out = [];
  for (const gn of gunler(kok).slice(-n)) {
    const z = json(A.dosyaOku(kok, `arsiv/${gn}/izle.json`));
    if (!z) continue;
    const l = (z.liste || []).find(x => x.anahtar === anahtar), p = (z.puanListe || []).find(x => x.anahtar === anahtar);
    out.push({ gun: gn, izleSira: l ? l.sira : null, puanSira: p ? p.sira : null, havuz: (z.havuz || []).includes(anahtar), pf: l ? l.pf : null, pfYuzdelik: l ? l.pfYuzdelik : null, holder30: l ? l.holder30 : null, puan: p ? p.puan : null, girisGun: l ? l.girisGun : null });
  }
  return out;
}

module.exports = { hukumOku, durum, liste, gunler, kipSec, coinIzle, a6Suz, kural };
