/**
 * DİKKAT F2 — panel okuma katmanı (yalnız okur; hiçbir dosya yazmaz). Uçlar lib/tarama/index.js'te:
 *   GET /api/dikkat/durum?kip=          son gün özeti, ısınma/t0, karne (kendini denetleme), H-DL1 durumu, A4 bilinmiyor izi, günlük seri
 *   GET /api/dikkat/liste?kip=&gun=&tur= o günün listesi (tur: kacin | yetersiz | yeni | hepsi)
 *   GET /api/dikkat/coin?kip=&anahtar=   bir token'ın son 14 kayıt günü kapı geçmişi + pencereleri + İZLE/puan geçmişi (64.3, izlePanel.coinIzle)
 *   GET /api/dikkat/pencereler?kip=&isinma=  olay pencereleri (kontrolleriyle) ve sonuçları
 * kip: 'resmi' (sunucunun resmî arşivi) | 'deneme'; verilmezse resmî arşivde dikkat günü varsa resmî, yoksa deneme.
 */
'use strict';
const A = require('./arsiv');
const D = require('./dikkat');
const DT = require('./dikkatTakip');

function kipSec(o, istenen) {
  const kipler = ['resmi', 'deneme'];
  if (kipler.includes(istenen)) return istenen;
  for (const k of kipler) if (gunler(A.kokDizin({ ...o, resmi: k === 'resmi' })).length) return k;
  return 'resmi';
}
/** Manifestte dikkat dosyası olan günler (eski → yeni). */
function gunler(kok) {
  return A.manifestOku(kok).satirlar.filter(k => k.tur === 'gun' && (k.dosyalar || []).some(d => /dikkat(-ozet)?\.jsonl?$/.test(d.yol))).map(k => k.gun);
}
const jsonl = (b) => (b ? b.toString('utf8').split('\n').filter(s => s.trim()).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean) : []);
const json = (b) => { try { return b ? JSON.parse(b.toString('utf8')) : null; } catch { return null; } };

/**
 * H-DL1 durumu (N13): hüküm zincirdeki `dikkat-hukum.json`'dan okunur, panel yeniden HESAPLAMAZ. Dosya yoksa yalnız sayım
 * (hüküm günü geldiyse "gece koşusunda yazılacak").
 */
function hukumOku(kok, t, son) {
  const m = A.manifestOku(kok).satirlar;
  for (const k of m) if (k.tur === 'gun' && (k.dosyalar || []).some(d => d.yol === `arsiv/${k.gun}/dikkat-hukum.json`)) { const h = json(A.dosyaOku(kok, `arsiv/${k.gun}/dikkat-hukum.json`)); if (h) return { ...h, kaynak: 'zincir', dosyaGunu: k.gun }; }
  if (!t.t0) return DT.hdl1(t, '0000-00-00');
  const hukum = DT.gunEkle(t.t0, DT.H.hukumGun);
  const g = son && son < hukum ? son : DT.gunEkle(hukum, -1);
  const h = DT.hdl1(t, g);
  return son && son >= hukum ? { ...h, neden: `hüküm günü (${hukum}) geldi; hüküm o günün gece koşusunda bir kez hesaplanıp kayda yazılır` } : h;
}

/** 68.6: açık pencerelerden en erken 90. gün (karnede ilk "90 günü dolan" sayının ne zaman geleceği); açık pencere yoksa null. */
function ilkKapanis(t) {
  const bas = Object.values(t.pencereler || {}).filter(p => !p.kapandi && p.bas).map(p => p.bas).sort()[0];
  return bas ? DT.gunEkle(bas, DT.H.pencereGun) : null;
}

function durum(o = {}, istenen) {
  const kip = kipSec(o, istenen);
  const kok = A.kokDizin({ ...o, resmi: kip === 'resmi' });
  const g = gunler(kok);
  const son = g[g.length - 1] || null;
  const ozet = son ? json(A.dosyaOku(kok, `arsiv/${son}/dikkat-ozet.json`)) : null;
  const t = DT.takipOku(kok);
  const hata = (() => { const m = A.manifestOku(kok).satirlar.filter(k => k.tur === 'gun'); const x = m[m.length - 1]; return x && (x.dosyalar || []).some(d => /dikkat-hata\.json$/.test(d.yol)) ? json(A.dosyaOku(kok, `arsiv/${x.gun}/dikkat-hata.json`)) : null; })();
  return {
    kip, sonGun: son, gunSayisi: g.length, ozet, hata,
    kural: { surum: D.KURAL_V1.surum, deneme: D.KURAL_V1.deneme, sha: D.kurallarSha(), birincil: D.KURAL_V1.birincil, bilgi: D.KURAL_V1.bilgi, ad: D.KAPI_AD,
      aciklama: D.KAPI_ACIKLAMA, tehlike: D.KAPI_TEHLIKE, esik: D.KURAL_V1.esik },
    isinma: !t.t0 || (son && son < t.t0), t0: t.t0 || null,
    karne: { asil: DT.karne(t, { isinma: false }), isinma: DT.karne(t, { isinma: true }) },
    ilkKapanis: ilkKapanis(t),
    hdl1: hukumOku(kok, t, son),
    bilinmiyor: DT.bilinmiyorAylik(t),
    seri: (t.gunler || []).slice(-120),
    sabit: { pencereGun: DT.H.pencereGun, kayipGun: DT.H.kayipGun, kontrolSayi: DT.H.kontrolSayi, cokusOran: DT.H.cokusOran, dexLikiditeAlt: DT.H.dexLikiditeAlt, hukumGun: DT.H.hukumGun, kapsamGun: DT.H.kapsamGun },
  };
}

function liste(o = {}, istenen, gun, tur = 'kacin') {
  const kip = kipSec(o, istenen);
  const kok = A.kokDizin({ ...o, resmi: kip === 'resmi' });
  const g = gunler(kok);
  const hedef = gun && g.includes(gun) ? gun : g[g.length - 1];
  if (!hedef) return { kip, gun: null, gunler: g, satirlar: [] };
  // Liste ve sayımlar DEĞERLENDİRME KÜMESİ üzerinden (evrenden çıkıp yalnız izlemesi süren token sayılmaz; üst kutularla aynı)
  const hepsi = jsonl(A.dosyaOku(kok, `arsiv/${hedef}/dikkat.jsonl`)).filter(r => r.evrende !== false);
  const sec = hepsi.filter(r => (tur === 'hepsi' ? true : tur === 'yetersiz' ? r.yetersiz : tur === 'yeni' ? r.yeni : r.kacin));
  const acik = new Map();   // anahtar → açık pencere (satır başına iki kez taramamak için)
  for (const p of Object.values(DT.takipOku(kok).pencereler || {})) if (!p.kapandi && !acik.has(p.anahtar)) acik.set(p.anahtar, p);
  return { kip, gun: hedef, gunler: g.slice(-60), sayim: { hepsi: hepsi.length, kacin: hepsi.filter(r => r.kacin).length, yetersiz: hepsi.filter(r => r.yetersiz).length, yeni: hepsi.filter(r => r.yeni).length },
    satirlar: sec.map(r => ({ anahtar: r.anahtar, sembol: r.sembol, kanat: r.kanat, ag: r.ag, kacin: r.kacin, yeni: r.yeni, yetersiz: r.yetersiz,
      dogru: r.dogru.map(k => ({ kod: k, metin: (r.kapilar[k] || {}).metin || null })), bilgi: r.bilgi,
      fiyat: r.m ? r.m.fiyat : null, likidite: r.m ? r.m.likidite : null,
      pencere: acik.has(r.anahtar) ? (({ olayNo, tur: pt, bas, isinma }) => ({ olayNo, tur: pt, bas, isinma }))(acik.get(r.anahtar)) : null })) };
}

function coin(o = {}, istenen, anahtar) {
  const kip = kipSec(o, istenen);
  const kok = A.kokDizin({ ...o, resmi: kip === 'resmi' });
  const g = gunler(kok).slice(-14);   // her gün ~1 MB; ayrıntıda son 14 kayıt günü yeter
  const gecmis = [];
  for (const gn of g) { const r = jsonl(A.dosyaOku(kok, `arsiv/${gn}/dikkat.jsonl`)).find(x => x.anahtar === anahtar); if (r) gecmis.push({ gun: gn, kacin: r.kacin, yetersiz: r.yetersiz, dogru: r.dogru, kapilar: r.kapilar, bilgi: r.bilgi, fiyat: r.m && r.m.fiyat, likidite: r.m && r.m.likidite, holder: r.m && r.m.holder }); }
  const pen = Object.values(DT.takipOku(kok).pencereler || {}).filter(p => p.anahtar === anahtar);
  const sonSatir = g.length ? jsonl(A.dosyaOku(kok, `arsiv/${g[g.length - 1]}/dikkat.jsonl`)).find(x => x.anahtar === anahtar) : null;
  const izle = (() => { try { return require('./izlePanel').coinIzle(kok, anahtar); } catch { return []; } })();
  return { kip, anahtar, sembol: sonSatir ? sonSatir.sembol : (pen[0] && pen[0].sembol) || null, kanat: sonSatir ? sonSatir.kanat : null, ag: sonSatir ? sonSatir.ag : null, gecmis, pencereler: pen, izle, ad: D.KAPI_AD };
}

function pencereler(o = {}, istenen, isinma) {
  const kip = kipSec(o, istenen);
  const kok = A.kokDizin({ ...o, resmi: kip === 'resmi' });
  const t = DT.takipOku(kok);
  const l = Object.values(t.pencereler || {}).filter(p => (isinma == null ? true : !!p.isinma === !!isinma));
  const olay = l.filter(p => p.tur === 'olay').sort((a, b) => b.bas.localeCompare(a.bas) || b.olayNo - a.olayNo);
  return { kip, olaylar: olay.slice(0, 300).map(p => ({ ...p, kontroller: l.filter(k => k.tur === 'kontrol' && k.olayNo === p.olayNo) })), toplam: olay.length };
}

/** Hafif: yalnız son dikkat gününün özeti (Telegram zamanlayıcısı 10 dk'da bir çağırır; karne/hüküm hesaplanmaz). */
function sonOzet(o = {}, istenen) {
  const kip = kipSec(o, istenen);
  const kok = A.kokDizin({ ...o, resmi: kip === 'resmi' });
  const g = gunler(kok);
  const son = g[g.length - 1] || null;
  return { kip, ozet: son ? json(A.dosyaOku(kok, `arsiv/${son}/dikkat-ozet.json`)) : null };
}

module.exports = { hukumOku, durum, liste, coin, pencereler, gunler, kipSec, sonOzet };
