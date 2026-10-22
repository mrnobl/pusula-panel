/**
 * BOT ADLARI — botların EKRANDA / TELEGRAM'DA görünen adları (72.0, kullanıcı kararı 2026-10-22)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Yalnız GÖRÜNEN ad değişti. İç kimlikler (hucum, denge, m-qqq-m10, m-bist-m10, m-837), adresler
 * (#/botlar/hucum …), API yolları, JSON alan adları, dosya/dizin adları ve config anahtarları AYNI kalır.
 * Araştırma arşivi, ön kayıt belgeleri ve eski sürüm notları eski adlarla kalır (tarihsel kayıt).
 *
 * Ön yüzdeki eşi: public/js/core/sozluk.js `AG.botAd` (aynı tablo; scripts/panel-botlar-testi.js eşitliği denetler).
 *
 *   ad(kimlik)        → 'Kairos' (bilinmeyen kimlik → null)
 *   alt(kimlik)       → 'BTC trendi + coin sepeti' (kısa alt yazı: botun ne yaptığı)
 *   anlam(kimlik)     → tek satır anlam
 *   tam(kimlik)       → 'Kairos · BTC trendi + coin sepeti'
 *   eski(kimlik)      → 'Hücum' (eski görünen ad)
 *   cevir(metin)      → eski sürümün yazdığı serbest metindeki eski adları yenisine çevirir (ör. sunucudan gelen günlük satırı)
 */
'use strict';

const BOTLAR = Object.freeze({
  hucum: Object.freeze({ ad: 'Kairos', eski: 'Hücum', alt: 'BTC trendi + coin sepeti',
    anlam: 'Kairos: "doğru an"ın tanrısı — kırılımı geçerken yakalayan bot.' }),
  denge: Object.freeze({ ad: 'Tao', eski: 'Denge', alt: 'yarı BTC + coin sepeti, sakin',
    anlam: 'Tao: "yol" — inişle çıkışın dengesi.' }),
  'm-qqq-m10': Object.freeze({ ad: 'Nova', eski: 'QQQ M10', alt: 'Nasdaq Momentum 10',
    anlam: 'Nova: gökte birden parlayan yeni yıldız — teknoloji.' }),
  'm-bist-m10': Object.freeze({ ad: 'Lydia', eski: 'BIST M10', alt: 'BIST Momentum 10',
    anlam: 'Lydia: dünyada ilk parayı basan Anadolu krallığı.' }),
  'm-837': Object.freeze({ ad: 'Simurg', eski: '837', alt: '%50 QQQ + %50 Kairos',
    anlam: 'Simurg: iki diyarı birleştiren efsanevi kuş — iki piyasayı birleştiren bot.' })
});

/** Aynı bota çıkan diğer kimlikler (model / strateji / sekme / seri kimlikleri). */
const TAKMA = Object.freeze({
  'strateji:hucum': 'hucum', 'b-hucum': 'hucum', 't-hucum': 'hucum', 'hucum-demo': 'hucum',
  'strateji:denge': 'denge', 'b-denge': 'denge',
  'qqq-m10': 'm-qqq-m10', 'strateji:qqq-m10': 'm-qqq-m10', 't-830': 'm-qqq-m10', nasdaq: 'm-qqq-m10', qqq: 'm-qqq-m10', n10: 'm-qqq-m10',
  'bist-m10': 'm-bist-m10', 'strateji:bist-m10': 'm-bist-m10', 't-840': 'm-bist-m10', bist: 'm-bist-m10', b10: 'm-bist-m10',
  't-837': 'm-837', q837: 'm-837', 837: 'm-837'
});

const SIRA = Object.freeze(Object.keys(BOTLAR));

function kimlik(k) {
  if (k == null) return null;
  const s = String(k);
  if (BOTLAR[s]) return s;
  return TAKMA[s] || null;
}
const al = (k, alan) => { const id = kimlik(k); return id ? BOTLAR[id][alan] : null; };
const ad = k => al(k, 'ad');
const alt = k => al(k, 'alt');
const anlam = k => al(k, 'anlam');
const eski = k => al(k, 'eski');
const tam = k => { const id = kimlik(k); return id ? `${BOTLAR[id].ad} · ${BOTLAR[id].alt}` : null; };

/**
 * Serbest metindeki ESKİ görünen adları yenisine çevirir (sunucu eski sürümdeyse onun yazdığı metin).
 * Yalnız bot adı olarak kullanılan biçimler: "Hücum" her zaman bottur; "Denge" yalnız büyük harfle, tek
 * kelime ve ek almamış/kesme işaretli biçimde (dengeleme, dengeli, Dengeli … dokunulmaz). "837" yalnız
 * "837 · …" model biçiminde (deneme numaraları dokunulmaz). Zaten yeni adla yazılmış metin değişmez.
 */
const KAIROS_EK = { un: 'un', a: 'a', da: 'ta', dan: 'tan', u: 'u', daki: 'taki', la: 'la', dur: 'tur' };
const TAO_EK = { nin: 'nun', ye: 'ya', de: 'da', den: 'dan', yi: 'yu', deki: 'daki', yle: 'yla', dir: 'dur' };
const HARF = 'A-Za-zÇĞİÖŞÜçğıöşü';
function cevir(metin) {
  if (typeof metin !== 'string' || !metin) return metin;
  let s = metin;
  s = s.replace(/837 · %50 QQQ \+ %50 Hücum/g, () => 'Simurg · %50 QQQ + %50 Kairos');
  s = s.replace(/837 · QQQ \+ Hücum/g, () => 'Simurg · QQQ + Kairos');
  s = s.replace(/Hücum'(daki|dan|da|un|u|a|la|dur)(?![a-zçğıöşü])/g, (_, e) => `Kairos'${KAIROS_EK[e]}`);
  s = s.replace(/HÜCUM/g, () => 'KAIROS');
  s = s.replace(/Hücum/g, () => 'Kairos');
  s = s.replace(new RegExp(`(?<![${HARF}])Denge'(deki|den|de|nin|ye|yi|yle|dir)(?![a-zçğıöşü])`, 'g'), (_, e) => `Tao'${TAO_EK[e]}`);
  s = s.replace(new RegExp(`(?<![${HARF}])Denge(?![${HARF}'])`, 'g'), () => 'Tao');
  s = s.replace(new RegExp(`(?<![${HARF}])DENGE(?![${HARF}])`, 'g'), () => 'TAO');
  s = s.replace(/QQQ M10/g, () => 'Nova');
  s = s.replace(/BIST M10/g, () => 'Lydia');
  s = s.replace(/Nasdaq M10/g, () => 'Nova');
  return s;
}

/** Bot nesnesi ({ ad, adGorunen }) → görünen ad: kimlikten; tanınmazsa verilen metin çevrilerek. */
const gorunen = b => (b ? (ad(b.ad) || cevir(b.adGorunen) || b.ad || '') : '');

module.exports = { BOTLAR, TAKMA, SIRA, kimlik, ad, alt, anlam, eski, tam, cevir, gorunen };
