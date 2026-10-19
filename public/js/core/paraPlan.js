/**
 * PARA EKLE PLANI — SAF HESAP (sürüm 67.3; sayfa: js/pages/paraEkle.js, öz test: scripts/para-plan-selftest.js)
 * ═══════════════════════════════════════════════════════════════════════════
 * Portföy › Hedefim › "Para ekle ve dağılımı değiştir". DOM, ağ ve saat YOK — aynı girdi aynı sonucu verir.
 *
 * Girdi  hesapla({ satirlar, M, kesirli, adim })
 *   satirlar: [{ s, adet, fiyat, kural: 'sabit'|'oran', hedef (yüzde; '15', 15, '12,5'), yeni }]
 *             fiyat ve tutarlar HESABIN para biriminde (ABD hesabı → $). yeni = portföyde olmayan hisse (yalnız Sabit %).
 *   M:        eklenecek para, hesabın para biriminde (TL yazıldıysa çağıran kurla çevirir). 0 = yalnız dağılım değişir.
 *   kesirli:  true → adet `adim` (varsayılan 0,001) katı; false → tam adet. Alış aşağı yuvarlanır (artan nakitte kalır).
 *
 * Kural  T0 = satırların bugünkü değeri, T = T0 + M. Sabit satırın hedef payı kullanıcının yüzdesi; "Oranını koru" satırları
 *        kalan payı (1 − sabitler) BUGÜNKÜ değerleri oranında böler. al = hedefPay × T − bugünkü değer; eksiyse satış.
 *        Sabit %0 → hepsi satılır (adet tam elde olan). Satış elde olanı aşamaz. Yuvarlamadan sonra nakit eksiye düşerse
 *        en büyük alış bir adım küçültülür (nakit ≥ 0 olana dek). "Oranını koru" satırı yoksa kalan pay nakitte kalır.
 *
 * Çıktı  { T0, T, M, sabitPay, kalanPay, asim, satirlar: [{ …girdi, v, suanPay, hp, hedefDeger, al, yon: 'al'|'sat'|null,
 *        adet (işlem adedi), tutar, sonrakiAdet, sonrakiPay }], satislar, alimlar, nakitArtan, hatalar, durum }
 */
(function (global) {
  'use strict';
  const EPS = 1e-9;
  const ESIK = 0.005;   // yarım kuruştan küçük fark işlem sayılmaz
  const AG = global.AG = global.AG || {};

  /** "12,5" · "12.5" · 12.5 → 12.5; boş/bozuk → NaN. */
  function sayi(x) {
    if (typeof x === 'number') return x;
    const s = String(x == null ? '' : x).trim().replace(/\s/g, '');
    if (!s) return NaN;
    const t = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
    return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  }
  const temiz = (x) => Math.round(x * 1e9) / 1e9;
  const asagi = (x, adim) => temiz(Math.floor(x / adim + 1e-7) * adim);
  const yakin = (x, adim) => temiz(Math.round(x / adim) * adim);

  function hesapla(g) {
    const girdi = g || {};
    const kesirli = girdi.kesirli !== false;
    const adim = kesirli ? (girdi.adim > 0 ? girdi.adim : 0.001) : 1;
    const M = Number.isFinite(sayi(girdi.M)) ? sayi(girdi.M) : 0;
    const hatalar = [];
    if (M < 0) hatalar.push('eklenecek para eksi olamaz (para çekmek bu planda yok)');
    const S = (girdi.satirlar || []).map((r) => {
      const adet = Number.isFinite(Number(r.adet)) && Number(r.adet) > 0 ? Number(r.adet) : 0;
      const fiyat = Number(r.fiyat);
      const kural = r.yeni || r.kural === 'sabit' ? 'sabit' : 'oran';   // yeni hisse yalnız Sabit %
      const h = sayi(r.hedef);
      return { ...r, adet, fiyat, kural, hedefSayi: kural === 'sabit' ? (Number.isFinite(h) ? h : 0) : null, v: Number.isFinite(fiyat) && fiyat > 0 ? adet * fiyat : 0 };
    });
    for (const r of S) {
      if (!(Number.isFinite(r.fiyat) && r.fiyat > 0)) hatalar.push(`${r.s}: fiyat yok`);
      if (r.kural === 'sabit' && (r.hedefSayi < 0 || r.hedefSayi > 100)) hatalar.push(`${r.s}: hedef pay 0–100 arası olmalı`);
    }
    const T0 = S.reduce((a, r) => a + r.v, 0);
    const T = T0 + Math.max(0, M);
    const sabitPay = S.filter(r => r.kural === 'sabit').reduce((a, r) => a + Math.max(0, r.hedefSayi) / 100, 0);
    const oranT = S.filter(r => r.kural === 'oran').reduce((a, r) => a + r.v, 0);
    const kalanPay = 1 - sabitPay;
    const asim = sabitPay > 1 + 1e-6;
    const sonuc = S.map((r) => {
      const hp = r.kural === 'sabit' ? Math.max(0, r.hedefSayi) / 100 : (oranT > EPS ? Math.max(0, kalanPay) * r.v / oranT : 0);
      const hedefDeger = hp * T;
      const al = hedefDeger - r.v;
      let yon = null, adet = 0;
      if (!asim && r.fiyat > 0) {
        if (al > ESIK) { adet = asagi(al / r.fiyat, adim); yon = adet > EPS ? 'al' : null; }
        else if (al < -ESIK && r.adet > EPS) {
          adet = hp <= EPS ? r.adet : Math.min(r.adet, kesirli ? yakin(-al / r.fiyat, adim) : asagi(-al / r.fiyat, adim));
          yon = adet > EPS ? 'sat' : null;
        }
      }
      if (!yon) adet = 0;
      return { ...r, suanPay: T0 > EPS ? r.v / T0 : 0, hp, hedefDeger, al, yon, adet };
    });
    // Yuvarlamadan sonra nakit eksiye düşmesin: en büyük alışı bir adım küçült.
    const nakit = () => M + sonuc.reduce((a, r) => a + (r.yon === 'sat' ? r.adet * r.fiyat : r.yon === 'al' ? -r.adet * r.fiyat : 0), 0);
    let koruma = 0;
    while (!asim && nakit() < -1e-7 && koruma++ < 100000) {
      const l = sonuc.filter(r => r.yon === 'al' && r.adet >= adim - EPS).sort((a, b) => b.adet * b.fiyat - a.adet * a.fiyat);
      if (!l.length) { hatalar.push('nakit yetmiyor: satışlar alışları karşılamıyor'); break; }
      l[0].adet = temiz(l[0].adet - adim);
      if (l[0].adet <= EPS) { l[0].adet = 0; l[0].yon = null; }
    }
    // tutar = adet × fiyat; sonrakiAdet = eldeki ± işlem (satışta hepsi satılıyorsa tam 0)
    for (let i = 0; i < sonuc.length; i++) {
      const r = sonuc[i], elde = S[i].adet;
      if (!r.yon) r.adet = 0;
      r.tutar = r.adet * r.fiyat;
      r.elde = elde;
      r.sonrakiAdet = r.yon === 'sat' ? (r.adet >= elde - EPS ? 0 : temiz(elde - r.adet)) : r.yon === 'al' ? temiz(elde + r.adet) : elde;
      r.sonrakiPay = T > EPS ? r.sonrakiAdet * r.fiyat / T : 0;
    }
    const satislar = sonuc.filter(r => r.yon === 'sat').sort((a, b) => a.al - b.al);
    const alimlar = sonuc.filter(r => r.yon === 'al').sort((a, b) => b.al - a.al);
    const nakitArtan = asim ? 0 : Math.max(0, temiz(nakit()));
    const durum = hatalar.length ? 'hata' : asim ? 'asim' : satislar.length ? 'satis' : 'tamam';
    return { T0, T, M, sabitPay, kalanPay, asim, adim, kesirli, satirlar: sonuc, satislar, alimlar, nakitArtan, hatalar, durum };
  }

  /** Adet metni: en çok 6 ondalık, sondaki sıfırlar atılır ("0,278", "12", "0,31"). */
  function adetMetni(x) {
    if (!Number.isFinite(x)) return '—';
    return temiz(x).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 6 });
  }

  AG.paraPlan = { hesapla, sayi, adetMetni, ESIK };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.paraPlan;
})(typeof window !== 'undefined' ? window : globalThis);
