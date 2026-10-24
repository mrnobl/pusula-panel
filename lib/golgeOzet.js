/**
 * GÖLGE TESTLER HAFTALIK ÖZETİ (73.5, bildirim türü "golge") — İleri test kayıtlarından test başına TEK satır.
 * ═══════════════════════════════════════════════════════════════════════════
 * HÜKÜM YAZMAZ, değerlendirme yapmaz (ön kayıtlar: ara raporda hüküm yok). Yalnız "veri akıyor mu" ve sayaçlar: son veri günü,
 * kayıtlı gün / olay / işlem sayısı, sıradaki kontrol tarihi. Kaynaklar panelin İleri test uçlarıyla aynı panelVerisi() çağrıları
 * (dosya okur, ağa çıkmaz, yazmaz; CBDR'nin canlı "sıradaki gün" hesabı da bellek içi). Her test ayrı try — biri bozuksa satırı
 * "okunamadı" olur, diğerleri gider.
 */
'use strict';

const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
/** "2026-10-23" → "23 Eki" (yıl bu yıl değilse eklenir). */
function gun(g, buYil = new Date().getUTCFullYear()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(g || ''));
  if (!m) return null;
  return `${Number(m[3])} ${AYLAR[Number(m[2]) - 1]}${Number(m[1]) !== buYil ? ' ' + m[1] : ''}`;
}
/** Saf: son veri günü kaç gün eski (İstanbul günü yerine UTC yeterli). */
function bayat(g, simdi = Date.now()) {
  const t = Date.parse(String(g || '') + 'T00:00:00Z');
  return Number.isFinite(t) ? Math.floor((simdi - t) / 864e5) : null;
}
/** Saf: parçalardan satır. */
function satir(ad, deneme, son, sayac, sonraki, simdi = Date.now()) {
  const b = bayat(son, simdi);
  const p = [`${ad}${deneme ? ` (${deneme})` : ''}:`];
  p.push(son ? `son veri ${gun(son)}${b != null && b > 3 ? ` — ${b} gündür yeni veri yok` : ''}` : 'henüz veri yok');
  if (sayac) p.push(`· ${sayac}`);
  if (sonraki) p.push(`· ${sonraki}`);
  return p.join(' ');
}

/** @param o { simdi?, kaynaklar? (öz test için modül yerine) } @returns Promise<string[]> */
async function satirlar(o = {}) {
  const simdi = o.simdi || Date.now();
  const K = o.kaynaklar || {};
  const req = (m) => (K[m] ? K[m] : require(`./ileri/${m}`));
  const out = [];
  const dene = async (ad, fn) => { try { const s = await fn(); if (s) out.push(s); } catch (e) { out.push(`${ad}: okunamadı (${String(e.message || e).slice(0, 80)})`); } };
  await dene('Demo kabul', () => {
    const z = req('demoKabulOzet').ozet();
    const sonraki = (z.asamalar || []).find(a => !a.gecti);
    return satir('Demo kabul (Kairos)', null, z.veriVar ? z.bugun : null, z.veriVar ? `gün ${z.gecenGun}` : null, sonraki ? `sıradaki: ${sonraki.ad}${sonraki.tarih ? ` (${gun(sonraki.tarih)})` : ''}` : null, simdi);
  });
  await dene('Bollinger', () => {
    const I = req('bollingerIzleme'), R = req('bollingerRapor');
    const F = I.dosyalar();
    const r = R.araRapor(I.satirlariOku(F.kayit), I.satirlariOku(F.golge));
    return satir('Bollinger (ileri)', null, r.sonKararGunu, `${r.gecenGun} gün, ${r.kayitliSeri}/${r.toplamSeri} seri`, r.sonrakiHukumTarihi ? `hüküm tarihi ${gun(r.sonrakiHukumTarihi)}` : null, simdi);
  });
  await dene('CBDR', async () => {
    const v = await req('cbdrGolge').panelVerisi();
    const r = v.rapor || {};
    return satir('CBDR EUR/USD', r.deneme, r.son && r.son.gun, `${r.gun || 0} gün, ${r.islem || 0} işlem`, r.araKontrol ? `ara kontrol ${gun(r.araKontrol)}` : null, simdi);
  });
  await dene('876', () => {
    const v = req('golge876').panelVerisi();
    const z = v.ozet || {}, t = v.takvim || {};
    return satir('876 gölge', v.deneme, z.sonKapanmis, z.durum ? `durum: ${z.durum}` : null, t.rapor ? `rapor ${gun(t.rapor)}` : null, simdi);
  });
  await dene('Temettü', () => {
    const v = req('temettuGolge').panelVerisi();
    const z = v.ozet || {}, r = z.rapor || {};
    return satir('BIST temettü', v.deneme, z.sonGun, `${r.olay || 0} olay`, r.araKontrol ? `ara kontrol ${gun(r.araKontrol)}` : null, simdi);
  });
  await dene('Momentum', () => {
    const v = req('momentumGolge').panelVerisi();
    const z = v.ozet || {}, r = z.rapor || {};
    return satir('2 haftalık momentum', v.deneme, z.sonKapanmis, `${r.gun || 0} gün`, r.araKontrol ? `ara kontrol ${gun(r.araKontrol)}` : null, simdi);
  });
  await dene('Kairos-S', () => {
    const v = req('hucumSGolge').panelVerisi();
    const z = v.ozet || {}, t = v.takvim || {};
    return satir('Kairos-S gölgesi', v.deneme, z.sonKapanmis, null, t.kapi ? `ilk kontrol ${gun(t.kapi)}` : null, simdi);
  });
  return out;
}

module.exports = { satirlar, satir, gun, bayat };
