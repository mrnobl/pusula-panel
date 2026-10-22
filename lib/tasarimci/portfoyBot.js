/**
 * PORTFÖY BOTLARI — Botlar › QQQ M10 / BIST M10 / 837 sayfalarının verisi (kullanıcı 2026-10-20: "model portföyler Hücum/Denge
 * gibi izlenebilen botlar olsun; her bot kendi sayfası"). SAF hesap — dosya okumaz/yazmaz; lib/tasarimci/api.js
 * `/api/tasarimci/portfoy-bot*` uçları kâğıt hesabı (kagit.json), model kıyas serisini (gunluk.jsonl), kararları (kararlar.jsonl)
 * ve fiyatı (kagit.fiyatKaynagi — kâğıt hesabın kullandığı HAM açılış/kapanış) verir.
 * ═══════════════════════════════════════════════════════════════════════════
 * KIYAS (al-tut, kâğıt hesabın İLK gününde 100, aynı günlere ileri doldurulur):
 *   m-qqq-m10 → k-qqq   QQQ al-tut (USD, `endeks`)
 *   m-bist-m10 → k-xu030 BIST 30 (XU030) al-tut — TL (`endeksTl`; kâğıt hesap TL tuttuğu için USD serisi değil)
 *   m-837     → k-qqq   QQQ al-tut (lib/tasarimci/kagit.js MODEL.kiyas — 837'nin belgelenmiş kıyası)
 * KARAR DEFTERİ (hisse modelleri): her ay sonu kararı (kararlar.jsonl `liste`) için listedeki her hisse ne oldu —
 *   alindi (kâğıt hesap aldı) · eldeKaldi (zaten eldeydi, tuttu) · bekliyor (açılış fiyatı gelmedi) · alinamadi (neden: tam adet
 *   yetmedi = 1 adedin fiyatı hissenin payından büyük; nakit yetmedi; o gün fiyat yok) — ve o kararla satılanlar. İşlem ↔ karar
 *   eşlemesi kâğıt hesabın `neden` metninden: "<ilk liste|aylık karar> <kararGunu>: …" (kagit.js dengele).
 * 837: karar defteri = ilk yerleşim + dengeleme günleri (kâğıt hesabın al/sat/aktarım satırlarından).
 *
 * API: BOTLAR · kiyasSerisi(gunler, satirlar, alan) · kararDefteri(o) · dengelemeDefteri(model) · ozetSatiri(id, model, kiyas)
 *      semboller(model) → { elde: [s], gecmis: [s] } · fiyatSerisi(fk, s, borsa, bas, son) → [{ gun, o, c }]
 */
'use strict';

const BOTLAR = Object.freeze({
  'm-qqq-m10': { kisa: 'Nova', ad: 'Nova · Nasdaq Momentum 10', borsa: 'NYSE', para: 'USD', tur: 'hisse', kiyas: { id: 'k-qqq', alan: 'endeks', ad: 'QQQ al-tut' } },
  'm-bist-m10': { kisa: 'Lydia', ad: 'Lydia · BIST Momentum 10', borsa: 'BIST', para: 'TRY', tur: 'hisse', kiyas: { id: 'k-xu030', alan: 'endeksTl', ad: 'BIST 30 (XU030) al-tut, TL' } },
  'm-837': { kisa: 'Simurg', ad: 'Simurg · %50 QQQ + %50 Kairos', borsa: 'NYSE', para: 'USD', tur: '837', kiyas: { id: 'k-qqq', alan: 'endeks', ad: 'QQQ al-tut' } }
});
const SIRA = Object.keys(BOTLAR);
const R2 = x => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const R6 = x => (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : null);
const sayi = x => typeof x === 'number' && Number.isFinite(x);

/** Kıyas satırlarını (gun, alan) hedef günlere ileri doldurur; ilk dolu günde 100'e tabanlar. Kâğıt hesabın ilk günü kıyasta yoksa ilk sonraki değer taban olur. */
function kiyasSerisi(gunler, satirlar, alan = 'endeks') {
  const s = (satirlar || []).filter(x => x && sayi(x[alan]) && x[alan] > 0).slice().sort((a, b) => (a.gun < b.gun ? -1 : 1));
  const out = [];
  let j = -1, taban = null;
  for (const g of gunler || []) {
    while (j + 1 < s.length && s[j + 1].gun <= g) j++;
    if (j < 0) continue;
    if (taban == null) taban = s[j][alan];
    out.push({ gun: g, v: R6(s[j][alan] / taban * 100) });
  }
  return out;
}

/** Elde ve geçmişte tutulan semboller (Hücum kolu hariç) — hisse grafiği çipleri. */
function semboller(model) {
  const elde = ((model && model.pozisyonlar) || []).filter(p => p.s && p.s !== 'HUCUM' && !p.simulasyon && p.adet > 0).map(p => p.s);
  const hepsi = [...new Set(((model && model.islemler) || []).filter(i => i.s && i.s !== 'HUCUM' && (i.tur === 'al' || i.tur === 'sat')).map(i => i.s))];
  return { elde, gecmis: hepsi.filter(s => !elde.includes(s)).sort() };
}

/** Kâğıt hesabın bir gün öncesi (ya da o gün yoksa en yakın önceki) pozisyonu. */
function oncekiGun(gunler, gun) { let x = null; for (const g of gunler || []) { if (g.gun < gun) x = g; else break; } return x; }
function oGun(gunler, gun) { return (gunler || []).find(g => g.gun === gun) || null; }

/**
 * Hisse modeli karar defteri.
 * o: { kararlar (yalnız bu model, liste taşıyan), model (kagit.json modeli: islemler, gunler, ozet, ayar), fiyat(s) → { bar(gun) → {o,c}|null } | null }
 * → [{ kararGunu, uygulamaGunu, ilk, durum: 'uygulandi'|'bekliyor'|'gelecek', aday, kalemler: [{ sira, s, p, w, sonuc, adet, fiyat, komisyon, neden }],
 *      satilanlar: [{ s, adet, fiyat, tutar, komisyon, neden }], islemSayisi, komisyon }]  (yeniden eskiye)
 */
function kararDefteri({ kararlar, model, fiyat }) {
  const isl = (model && model.islemler) || [], gunler = (model && model.gunler) || [], oz = (model && model.ozet) || {};
  const a = (model && model.ayar) || {};
  const son = oz.son || null;
  const bekleyen = new Set(oz.bekleyenEmir || []);
  const l = (kararlar || []).filter(k => k && k.liste && k.tur2 !== 'dengeleme').sort((x, y) => (x.kararGunu < y.kararGunu ? -1 : 1));
  const out = l.map((k, i) => {
    const etiket = ` ${k.kararGunu}:`;
    const bu = isl.filter(x => (x.tur === 'al' || x.tur === 'sat') && String(x.neden || '').includes(etiket));
    const sonKarar = i === l.length - 1;
    const durum = !son || k.uygulamaGunu > son ? 'gelecek' : (sonKarar && bekleyen.size ? 'bekliyor' : 'uygulandi');
    const once = oncekiGun(gunler, k.uygulamaGunu), gun0 = oGun(gunler, k.uygulamaGunu);
    const oz0 = once ? once.ozsermaye : (gunler[0] ? gunler[0].ozsermaye : null);
    const w = k.agirlik || {};
    const kalemler = k.liste.map((x, j) => {
      const al = bu.filter(y => y.tur === 'al' && y.s === x.s);
      const r = { sira: j + 1, s: x.s, p: sayi(x.p) ? R6(x.p) : null, w: sayi(+w[x.s]) ? R6(+w[x.s]) : null, sonuc: null, adet: null, fiyat: null, komisyon: null, neden: '' };
      if (al.length) {
        const n = al.reduce((t, y) => t + (y.adet || 0), 0), tut = al.reduce((t, y) => t + (y.tutar || 0), 0);
        Object.assign(r, { sonuc: 'alindi', adet: R6(n), fiyat: n ? R6(tut / n) : null, komisyon: R2(al.reduce((t, y) => t + (y.komisyon || 0), 0)), neden: al.map(y => String(y.neden).split(': ').slice(1).join(': ')).filter(Boolean).join(' · ') });
        return r;
      }
      const elde0 = once && once.poz && once.poz[x.s] && once.poz[x.s].adet > 0;
      const elde1 = gun0 && gun0.poz && gun0.poz[x.s] && gun0.poz[x.s].adet > 0;
      if (elde0 && elde1) return Object.assign(r, { sonuc: 'eldeKaldi', adet: gun0.poz[x.s].adet, neden: 'zaten eldeydi — tuttu (küçük ağırlık düzeltmesi yapılmaz)' });
      if (durum === 'gelecek') return Object.assign(r, { sonuc: 'gelecek', neden: `${k.uygulamaGunu} açılışında uygulanacak` });
      if (sonKarar && bekleyen.has(x.s)) return Object.assign(r, { sonuc: 'bekliyor', neden: 'açılış fiyatı henüz gelmedi — fiyat gelen ilk gün alınır' });
      const b = fiyat ? fiyat(x.s) : null, bar = b && b.bar ? b.bar(k.uygulamaGunu) : null;
      if (!bar) return Object.assign(r, { sonuc: 'alinamadi', neden: `${k.uygulamaGunu} açılış fiyatı yok` });
      const f = bar.o * (1 + (a.kayma || 0));
      const pay = sayi(oz0) && r.w ? oz0 * r.w : null;
      r.fiyat = R6(f);
      if (pay != null && f > pay) return Object.assign(r, { sonuc: 'alinamadi', neden: `tam adet yetmedi: 1 adet ${R2(f)} > hissenin payı ${R2(pay)}` });
      return Object.assign(r, { sonuc: 'alinamadi', neden: 'nakit yetmedi (önceki alımlar ve komisyondan sonra)' });
    });
    const satilanlar = bu.filter(y => y.tur === 'sat').map(y => ({ s: y.s, adet: y.adet, fiyat: y.fiyat, tutar: y.tutar, komisyon: y.komisyon, neden: String(y.neden).split(': ').slice(1).join(': ') || y.neden }));
    return { kararGunu: k.kararGunu, uygulamaGunu: k.uygulamaGunu, ilk: !!k.ilk, durum, aday: k.aday || k.evren || null, kalemler, satilanlar,
      islemSayisi: bu.length, komisyon: R2(bu.reduce((t, y) => t + (y.komisyon || 0), 0)), eksikVeri: (k.eksikVeri || []).slice(0, 10) };
  });
  return out.reverse();
}

/** 837: ilk yerleşim + dengeleme günleri (al/sat/aktarım satırları günlere toplanır), yeniden eskiye. */
function dengelemeDefteri(model) {
  const isl = (model && model.islemler) || [];
  const gunler = [...new Set(isl.filter(i => i.tur === 'al' || i.tur === 'sat' || i.tur === 'aktarim').map(i => i.gun))].sort();
  return gunler.map((g, i) => {
    const l = isl.filter(x => x.gun === g && (x.tur === 'al' || x.tur === 'sat' || x.tur === 'aktarim'));
    return { gun: g, ilk: i === 0, islemler: l.map(x => ({ tur: x.tur, s: x.s, adet: x.adet, fiyat: x.fiyat, tutar: x.tutar, komisyon: x.komisyon, neden: x.neden })),
      komisyon: R2(l.reduce((t, x) => t + (x.komisyon || 0), 0)) };
  }).reverse();
}

/** Liste satırı (Botlar özeti / Ana sayfa): getiri, kıyas getirisi, düşüş, işlem sayısı. Tutar alanları gizliyse null kalır. */
function ozetSatiri(id, model, kiyas) {
  const b = BOTLAR[id], o = (model && model.ozet) || {};
  const ks = kiyas && kiyas.length > 1 ? kiyas[kiyas.length - 1].v / 100 - 1 : null;
  return { id, kisa: b.kisa, ad: b.ad, para: b.para, bos: !!o.bos, neden: o.neden || null, bas: o.bas || null, son: o.son || null,
    getiri: sayi(o.getiri) ? o.getiri : null, kiyasGetiri: R6(ks), kiyasAd: b.kiyas.ad, maxDD: sayi(o.maxDD) ? o.maxDD : null,
    ozsermaye: sayi(o.ozsermaye) ? o.ozsermaye : null, islemSayisi: o.islemSayisi || 0 };
}

/** Sembolün ham günlük açılış/kapanışı (bas..son, ISO gün). fk = kagit.fiyatKaynagi(V). */
function fiyatSerisi(fk, s, borsa, bas, son, tumGunler) {
  const F = fk(s, borsa);
  if (!F || !F.var) return [];
  return (tumGunler || []).filter(g => (!bas || g >= bas) && (!son || g <= son)).map(g => { const b = F.bar(g); return b ? { gun: g, o: b.o, c: b.c } : null; }).filter(Boolean);
}

module.exports = { BOTLAR, SIRA, kiyasSerisi, kararDefteri, dengelemeDefteri, ozetSatiri, semboller, fiyatSerisi };
