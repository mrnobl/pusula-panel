/**
 * GÖLGE TESTLER HAFTALIK ÖZETİ (73.5, bildirim türü "golge"; 73.6 getiri rakamları, kullanıcı kararı 2026-10-24) — gölge başına TEK satır.
 * ═══════════════════════════════════════════════════════════════════════════
 * HÜKÜM YAZMAZ, yorum yapmaz ("iyi gidiyor" yok; ön kayıtlar: ara raporda hüküm yok). Satır başına yalnız SAYILAR:
 *   başlangıçtan bu yana getiri · son 7 gün · aynı dönemde gölgenin KENDİ ön kaydındaki kıyas · işlem / olay / gün sayısı ·
 *   bant içinde mi (varsa) · hüküm / kontrol tarihi. Her satır "🧪 GÖLGE ·" ile başlar (mesaj başlığı lib/bildirimUreticileri.js).
 * KAYNAK = panelin İleri test ekranıyla AYNI işlevler (ayrı hesap yok): bollingerRapor.araRapor (Kairos / Tao gölgesi + Bollinger),
 * zamanDilimiGolge / rangeVetoGolge .panelOzet, cbdrGolge / golge876 / temettuGolge / momentumGolge / hucumSGolge .panelVerisi.
 * "Son 7 gün" aynı çıktının gün gün serisinden (seri / birikim) ya da aynı araRapor'un 7 gün önceki kesitinden okunur.
 * Dosya okur, ağa çıkmaz, yazmaz. Her gölge ayrı try — biri bozuksa satırı "okunamadı" olur, diğerleri gider.
 * Demo kabul (Kairos demo hesabı) burada YOK: gölge değildir (demo borsada emir verir); kendi bildirimleri "İleri test" türünde.
 *
 *   satirlar({ simdi?, kaynaklar? }) → Promise<string[]>   dizinin `hukumTarihleri` alanı: satırlardaki hüküm/kontrol tarihleri (YYYY-MM-DD)
 */
'use strict';

const GUN = 864e5;
const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const ETIKET = '🧪 GÖLGE ·';
/** "2026-10-23" → "23 Eki" (yıl bu yıl değilse eklenir). */
function gun(g, buYil = new Date().getUTCFullYear()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(g || ''));
  if (!m) return null;
  return `${Number(m[3])} ${AYLAR[Number(m[2]) - 1]}${Number(m[1]) !== buYil ? ' ' + m[1] : ''}`;
}
/** Saf: son veri günü kaç gün eski (İstanbul günü yerine UTC yeterli). */
function bayat(g, simdi = Date.now()) {
  const t = Date.parse(String(g || '') + 'T00:00:00Z');
  return Number.isFinite(t) ? Math.floor((simdi - t) / GUN) : null;
}
const trSayi = (x, b = 1) => Number(x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b });
/** Saf: 0,0693 → "−%6,9" (işaret her zaman; −0,04 puan altı "%0,0"). */
function yuzde(x, b = 1) {
  if (x == null || !Number.isFinite(x)) return '—';
  const r = Math.abs(x) * 100;
  if (Number(r.toFixed(b)) === 0) return `%${trSayi(0, b)}`;
  return `${x < 0 ? '−' : '+'}%${trSayi(r, b)}`;
}
/** Saf: log fark (0,027) → "+2,7 puan". */
function puan(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  const r = Math.abs(x) * 100;
  if (Number(r.toFixed(1)) === 0) return '0,0 puan';
  return `${x < 0 ? '−' : '+'}${trSayi(r, 1)} puan`;
}
/** Saf: R birimi → "+0,11 R". */
function rMetin(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  if (Number(Math.abs(x).toFixed(2)) === 0) return '0,00 R';
  return `${x < 0 ? '−' : '+'}${trSayi(Math.abs(x), 2)} R`;
}
/** Saf: "2026-10-23" − n gün → "2026-10-16". */
const gunEksi = (g, n) => new Date(Date.parse(`${g}T00:00:00Z`) - n * GUN).toISOString().slice(0, 10);
/** Saf: gün gün seride `sonGun − 7`'ye kadar (dahil) son değer; yoksa `baz` (seri başlangıcı). */
function yediOnce(seri, alan, sonGun, baz) {
  if (!sonGun) return baz;
  const sinir = gunEksi(sonGun, 7);
  let v = baz;
  for (const x of seri || []) { if (x && x.gun <= sinir && Number.isFinite(x[alan])) v = x[alan]; }
  return v;
}
/** Saf: özsermaye serisinden (başlangıç 1) son 7 gün getirisi. */
function yediGunGetiri(seri, alan = 'E', baz = 1) {
  const l = (seri || []).filter(x => x && Number.isFinite(x[alan]));
  if (!l.length) return null;
  const son = l[l.length - 1];
  return son[alan] / yediOnce(l, alan, son.gun, baz) - 1;
}
/** Saf: model bandı (hucumDengeEsikleri.modelDurumu çıktısı) → kısa metin. */
function bant(m) {
  if (!m || !Number.isFinite(m.maxdd)) return null;
  const dd = `MaxDD %${trSayi(m.maxdd * 100)}`;
  if (m.durum === 'normal') return `bant içinde (${dd} ≤ p95 %${trSayi(m.p95 * 100)}, ${m.ufuk} g)`;
  if (m.durum === 'uyari') return `bant DIŞINDA (${dd} > p95 %${trSayi(m.p95 * 100)}, ${m.ufuk} g — uyarı eşiği)`;
  return `bant DIŞINDA (${dd} > p99 %${trSayi(m.p99 * 100)}, ${m.ufuk} g — DUR eşiği)`;
}
/** Saf: parçalardan satır: "🧪 GÖLGE · Ad (deneme): p1 · p2 · … · hüküm 7 Eki 2027" (+ bayat veri uyarısı). */
function satir(ad, deneme, son, parcalar, tarih, simdi = Date.now()) {
  const b = bayat(son, simdi);
  const p = [...(Array.isArray(parcalar) ? parcalar : [parcalar])].filter(Boolean);
  if (!son) p.unshift('henüz veri yok');
  else if (b != null && b > 3) p.push(`son veri ${gun(son)} — ${b} gündür yeni veri yok`);
  if (tarih) p.push(tarih);
  return `${ETIKET} ${ad}${deneme ? ` (${deneme})` : ''}: ${p.join(' · ')}`;
}
/** Kairos / Tao gölgesi kontrol noktaları (PLAN-ILERI-HUCUM-DENGE: ilk ileri gün + 90/182/365 g; server.js /api/ileri/kabul ile aynı). */
const HD_ILK = '2026-10-07';
function hdKontrol(bugun, ufuklar) {
  const t = (ufuklar || [90, 182, 365]).map(g => new Date(Date.parse(HD_ILK + 'T00:00:00Z') + g * GUN).toISOString().slice(0, 10));
  return t.find(x => x > bugun) || t[t.length - 1];
}

/** @param o { simdi?, kaynaklar? (öz test için modül yerine) } @returns Promise<string[]> (+ .hukumTarihleri) */
async function satirlar(o = {}) {
  const simdi = o.simdi || Date.now();
  const bugun = new Date(simdi).toISOString().slice(0, 10);
  const K = o.kaynaklar || {};
  const req = (m) => (K[m] ? K[m] : require(`./ileri/${m}`));
  const out = [];
  const tarihler = [];
  const hukumT = (ad, t) => { if (!t) return null; tarihler.push(t); return `${ad} ${gun(t)}`; };
  const dene = async (ad, fn) => { try { const s = await fn(); if (s) out.push(s); } catch (e) { out.push(`${ETIKET} ${ad}: okunamadı (${String(e.message || e).slice(0, 80)})`); } };

  // Kairos / Tao gölgesi + Bollinger — panelin /api/ileri/bollinger ucuyla aynı araRapor; "son 7 g" = aynı işlevin 7 gün önceki kesiti
  let B = null;
  const bolOku = () => {
    if (B) return B;
    const I = req('bollingerIzleme'), R = req('bollingerRapor');
    const F = I.dosyalar();
    const kayit = I.satirlariOku(F.kayit), golge = I.satirlariOku(F.golge);
    const r = R.araRapor(kayit, golge, bugun);
    const sonG = (r.golge && r.golge.son) || (r.btc && r.btc.sonKararGunu) || null;
    const r7 = sonG ? R.araRapor(kayit, golge, gunEksi(sonG, 7)) : null;
    B = { r, r7, kayit, golge };
    return B;
  };
  const yedi = (g, g7) => (g == null ? null : (1 + g) / (1 + (g7 || 0)) - 1);
  for (const [ad, k, model] of [['Kairos gölgesi (çalışan kural)', 'hucum', 'hucum'], ['Tao gölgesi (çalışan kural)', 'denge', 'denge']]) {
    await dene(ad, () => {
      const { r, r7 } = bolOku();
      const G = r.golge || {}, G7 = (r7 && r7.golge) || {};
      if (!G.gun) return satir(ad, null, null, null, hukumT('kontrol', hdKontrol(bugun)), simdi);
      let ufuk = null; try { ufuk = req('hucumDengeEsikleri').UFUKLAR; } catch (e) { ufuk = null; }
      const g = G[k].C0.getiri, g7 = G7.gun ? G7[k].C0.getiri : 0;
      const at = r.btc && r.btc.AT ? r.btc.AT.getiri : null, at7 = r7 && r7.btc && r7.btc.AT ? r7.btc.AT.getiri : 0;
      return satir(ad, null, G.son, [
        `${gun(G.ilk)}'den beri ${yuzde(g)}`, `son 7 g ${yuzde(yedi(g, g7))}`,
        at != null ? `kıyas BTC al-tut ${yuzde(at)} (7 g ${yuzde(yedi(at, at7))})` : null,
        `${G.gun} gün`, bant(G.model && G.model[model]),
      ], hukumT('kontrol', hdKontrol(bugun, ufuk)), simdi);
    });
  }
  await dene('Bollinger', () => {
    const { r, r7 } = bolOku();
    const b = r.btc, b7 = r7 && r7.btc;
    if (!b) return satir('Bollinger (ileri, BTC)', null, null, null, hukumT('hüküm', r.sonrakiHukumTarihi), simdi);
    const al = (x, c) => (x && x[c] ? x[c].getiri : 0);
    return satir('Bollinger (ileri, BTC)', null, b.sonKararGunu, [
      `Bollinger'li kural (C1) ${yuzde(b.C1.getiri)}`, `son 7 g ${yuzde(yedi(b.C1.getiri, al(b7, 'C1')))}`,
      `kıyas mevcut kural (C0) ${yuzde(b.C0.getiri)}, BTC al-tut ${yuzde(b.AT.getiri)}`,
      `${b.gun} gün, ${b.C1.islem} işlem`, `${r.kayitliSeri}/${r.toplamSeri} seri kayıtlı`,
    ], hukumT('hüküm', r.sonrakiHukumTarihi), simdi);
  });
  await dene('Zaman dilimi', () => {
    const I = req('bollingerIzleme'), Z = req('zamanDilimiGolge');
    const v = Z.panelOzet(I.satirlariOku(Z.dosyalar().kayit), bolOku().golge);
    const A = v.A || {}, son = (v.seri || []).length ? v.seri[v.seri.length - 1] : null;
    const f7 = son ? son.fark - yediOnce(v.seri, 'fark', son.gun, 0) : null;
    return satir('3 günlük mum adayı', v.deneme, v.sonKararGunu, [
      `aday − taban farkı: Kairos ${puan(A.sumH)}, Tao ${puan(A.sumD)}`, `son 7 g Kairos ${puan(f7)}`,
      `${v.gecenGun || 0} gün, ${A.farkliGun || 0} farklı karar günü`,
    ], hukumT('hüküm', v.hukumTarihi), simdi);
  });
  await dene('Range veto', () => {
    const I = req('bollingerIzleme'), RV = req('rangeVetoGolge');
    const v = RV.panelOzet(I.satirlariOku(RV.dosyalar().kayit), bolOku().golge);
    const son = (v.seri || []).length ? v.seri[v.seri.length - 1] : null;
    const f7 = son ? son.fark - yediOnce(v.seri, 'fark', son.gun, 0) : null;
    return satir('D3 range veto', v.deneme, v.sonKararGunu, [
      `veto − taban farkı: Kairos ${puan(v.sumH)}, Tao ${puan(v.sumD)}`, `son 7 g Kairos ${puan(f7)}`,
      `${v.gecenGun || 0} gün, ${v.vetoOlayi || 0} veto olayı, ${v.farkliGun || 0} farklı gün`,
    ], hukumT('hüküm', v.hukumTarihi), simdi);
  });
  await dene('CBDR', async () => {
    const v = await req('cbdrGolge').panelVerisi();
    const r = v.rapor || {};
    const son = (r.seri || []).length ? r.seri[r.seri.length - 1] : null;
    const r7 = son ? son.birikim - yediOnce(r.seri, 'birikim', son.gun, 0) : null;
    return satir('CBDR EUR/USD', r.deneme, r.son && r.son.gun, [
      `toplam ${rMetin(r.toplamR || 0)} (R = stop mesafesi)`, `son 7 g ${rMetin(r7 == null ? 0 : r7)}`, 'kıyas 0 R (hiç işlem yapmamak)',
      `${r.gun || 0} gün, ${r.islem || 0} işlem${r.islem ? ` (${r.isabet || 0} kârlı)` : ''}`,
      r.araKontrol ? `ara kontrol ${gun(r.araKontrol)}` : null,
    ], hukumT('hüküm', r.kararTarihi), simdi);
  });
  await dene('876', () => {
    const v = req('golge876').panelVerisi();
    const z = v.ozet || {}, t = v.takvim || z.takvim || {};
    if (z.toplam876 == null) return satir('876 piyasa-nötr', v.deneme, z.sonKapanmis, [`henüz başlamadı${t.bas ? ` (başlangıç ${gun(t.bas)})` : ''}`], hukumT('rapor', t.rapor), simdi);
    const d = z.durdurma && z.durdurma.dur;
    return satir('876 piyasa-nötr', v.deneme, z.sonGun || z.sonKapanmis, [
      `başlangıçtan ${yuzde(z.toplam876)}`, `son 7 g ${yuzde(yediGunGetiri(z.seri))}`,
      z.hucum ? `kıyas Kairos ${yuzde(z.hucum.getiri)}` : null, z.birlesim && z.birlesim.gun ? `Kairos + 876 birlikte ${yuzde(z.birlesim.getiri)}` : null,
      z.mdd876 != null ? `MaxDD %${trSayi(z.mdd876 * 100)}` : null, d ? `durdurma kuralı ${d.kural} tetiklendi (${gun(d.gun)})` : null,
    ], hukumT('rapor', t.rapor), simdi);
  });
  await dene('Temettü', () => {
    const v = req('temettuGolge').panelVerisi();
    const z = v.ozet || {}, r = z.rapor || {};
    const bas = r.baslangic || (v.takvim && v.takvim.bas);
    if (!r.olay && bas && bugun < bas) return satir('BIST temettü', v.deneme, z.sonGun, [`henüz başlamadı (başlangıç ${gun(bas)})`], hukumT('hüküm', r.kararTarihi || (v.takvim && v.takvim.karar)), simdi);
    return satir('BIST temettü', v.deneme, z.sonGun, [
      `başlangıçtan ${yuzde(r.toplam || 0)}`, `son 7 g ${yuzde(yediGunGetiri(r.seri) || 0)}`, 'kıyas 0 (nakit)',
      `${r.olay || 0} olay${r.ana && r.ana.ort != null ? `, olay başı net ${yuzde(r.ana.ort, 2)}` : ''}`,
      r.araKontrol ? `ara kontrol ${gun(r.araKontrol)}` : null,
    ], hukumT('hüküm', r.kararTarihi), simdi);
  });
  await dene('Momentum', () => {
    const v = req('momentumGolge').panelVerisi();
    const z = v.ozet || {}, r = z.rapor || {};
    const bas = r.baslangic || (v.takvim && v.takvim.bas);
    if (!r.gun && bas && bugun < bas) return satir('2 haftalık momentum', v.deneme, z.sonKapanmis, [`henüz başlamadı (başlangıç ${gun(bas)})`], hukumT('hüküm', r.kararTarihi || (v.takvim && v.takvim.karar)), simdi);
    return satir('2 haftalık momentum', v.deneme, r.sonGun || z.sonKapanmis, [
      `kol başlangıçtan ${yuzde(r.kol ? r.kol.toplam : 0)}`, `son 7 g ${yuzde(yediGunGetiri(r.seri) || 0)}`,
      r.kairos ? `kıyas Kairos ${yuzde(r.kairos.toplam)}` : null, r.birlikte ? `Kairos + kol birlikte ${yuzde(r.birlikte.toplam)}` : null,
      `${r.gun || 0} gün`,
    ], hukumT('hüküm', r.kararTarihi), simdi);
  });
  await dene('Kairos-S', () => {
    const v = req('hucumSGolge').panelVerisi();
    const z = v.ozet || {}, r = (z && z.rapor) || {}, t = v.takvim || (z && z.takvim) || {};
    const kontrol = (r.sonraki && r.sonraki.tarih) || t.kapi;
    if (!r.hs) return satir('Kairos-S gölgesi', v.deneme, z && z.sonKapanmis, null, hukumT('kontrol', kontrol), simdi);
    const an = r.anlik || {};
    return satir('Kairos-S gölgesi', v.deneme, r.son || (z && z.sonKapanmis), [
      `${gun(r.ilk)}'den beri ${yuzde(r.hs.toplam)}`, `son 7 g ${yuzde(yediGunGetiri(r.seri, 'hs'))}`,
      `kıyas Kairos ${yuzde(r.c0 && r.c0.toplam)} (7 g ${yuzde(yediGunGetiri(r.seri, 'c0'))}), BTC al-tut ${yuzde(r.btc && r.btc.toplam)}`,
      `${r.gun || 0} gün`, bant(an.hs),
    ], hukumT('kontrol', kontrol), simdi);
  });
  out.hukumTarihleri = [...new Set(tarihler)].sort();
  return out;
}

module.exports = { satirlar, satir, gun, bayat, yuzde, puan, rMetin, yediOnce, yediGunGetiri, bant, hdKontrol, ETIKET };
