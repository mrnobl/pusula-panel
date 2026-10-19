/**
 * DEFTER ANLATISI — araştırma defteri kaydını sade bir "olay örgüsüne" çevirir (PLAN-PANEL-2 §2, kullanıcı kararı: otomatik)
 * ═══════════════════════════════════════════════════════════════════════════
 * Kayıt alanları (baslik, hipotez, sonuc, neden, holdout, durum…) bizim kısaltmalarımızla yazılı ("P %27,3 / hol %24,8 /
 * DD %50,8 · Düşen: K-A4, K-B"). Burada SAF kurallarla dört adım çıkar:
 *   ne     — ne denendi (başlıktan, numara ve kod öneki atılmış) + hipotezin ilk cümlesi
 *   kiyas  — neyle kıyaslandı / nasıl sınandı (sonuçtaki "Kıyas:" parçası + holdout durumu)
 *   sonuc  — ne çıktı (sonuç metni, kısaltmalar açılmış)
 *   ders   — sonuç ve ders (durum + "neden kapandı", hüküm günü)
 * Ayrıca kısa liste metinleri (neKisa, sonucKisa) ve "nerede" (plan, kaynak, plan belgesinde anılan betikler).
 * Kayıt değişmez; teknik metin ekranda "Teknik ayrıntı" katında aynen durur. Yeni alan dosyaya YAZILMAZ — her okumada türetilir.
 */
'use strict';

/** Kısaltma → sade karşılık. Sıra önemli (uzun kalıp önce). Yalnız sözcük sınırında değişir. */
const SOZLUK = [
  [/\bP\(>\s*([^)]+?)\)/g, '$1\'yi yenme olasılığı'],
  [/\bP %/g, 'geliştirme dönemi yıllık %'],
  [/\bP (?=\d)/g, 'yenme olasılığı '],
  [/\b[Hh]ol(?:dout)?'(?:ta|te|da|de)\b/g, 'hiç bakılmamış dönemde'],
  [/\b[Hh]ol(?:dout)?'(?:tan|ten|dan|den)\b/g, 'hiç bakılmamış dönemden'],
  [/\bhol(?:dout)? %/gi, 'hiç bakılmamış dönem yıllık %'],
  [/\b[Hh]oldout\b/g, 'hiç bakılmamış dönem'],
  [/\bhol\b/g, 'hiç bakılmamış dönem'],
  [/\b[Gg]el(?= [−-]?%)/g, 'geliştirme dönemi yıllık'],
  [/\bgel\b(?= \d)/g, 'geliştirme'],
  [/\bdev\b/g, 'geliştirme'],
  [/\bCAGR\b/g, 'yıllık getiri'],
  [/\bMaxDD\b/g, 'en derin düşüş'],
  [/(?<![-\w])DD\b/g, 'en derin düşüş'],
  [/\bSh\b/g, 'Sharpe'],
  [/\bAile Holm\b/g, 'Ailedeki çoklu deneme düzeltmesi (Holm)'],
  [/(?<!\()\bHolm\b/g, 'çoklu deneme düzeltmesi (Holm)'],
  [/\bDüşen:/g, 'Geçemediği ölçütler:'],
  [/\btasfiye 0\b/g, 'zorla kapanma yok'],
  [/\bPIT\b/g, 'o günkü bilgiyle'],
  [/\bAUC\b/g, 'ayırma gücü (AUC)'],
  [/\bDSR\b/g, 'düzeltilmiş Sharpe (DSR)'],
  [/\bWF\b/g, 'ileri yürüyen test'],
  [/\bEW\b/g, 'eşit ağırlık'],
  [/\s*✗/g, ' (sınırı aştı)'],
  [/\s*✓/g, ' (geçti)'],
];

/** Kısaltmaları açar; boşlukları toplar. */
function sadelestir(s) {
  let t = String(s == null ? '' : s);
  for (const [k, v] of SOZLUK) t = t.replace(k, v);
  return t.replace(/\s{2,}/g, ' ').trim();
}

/** İlk cümle (en çok n karakter; uzunsa sözcük sınırında "…"). */
function ilkCumle(s, n = 220) {
  const t = String(s || '').trim();
  if (!t) return '';
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  const c = m ? m[1] : t;
  if (c.length <= n) return c;
  const kes = c.slice(0, n);
  return kes.slice(0, Math.max(kes.lastIndexOf(' '), n * 0.6)).replace(/[,;:·\s]+$/, '') + '…';
}

/** Başlıktan numara ve kod önekini atar: "896 B2 Denge (p=0,5): …" → "Denge (p=0,5): …"; "428–434 Aşama 7: …" → "…". */
function temizBaslik(baslik) {
  let t = String(baslik || '').trim();
  t = t.replace(/^#?\d+(?:\s*[–-]\s*\d+)?\s+/, '');
  t = t.replace(/^(?:Aşama|Yol|Faz|Adım)\s+\d+[a-z]?\s*[:—-]\s*/i, '');
  t = t.replace(/^[A-ZÇĞİÖŞÜ]{1,3}-?\d+[a-z]?\b[:\s—-]*/, '');
  t = t.replace(/^[→:;·\s—-]+/, '');
  return buyukBas(t.trim() || String(baslik || '').trim());
}

/** İlk harfi büyük (tr-TR). */
function buyukBas(s) { const t = String(s || ''); return t ? t.charAt(0).toLocaleUpperCase('tr-TR') + t.slice(1) : t; }

/** "a. Kıyas: b" → { asil: 'a.', kiyas: 'b' } */
function kiyasAyir(sonuc) {
  const t = String(sonuc || '');
  const i = t.search(/\bKıyas:\s*/);
  if (i < 0) return { asil: t.trim(), kiyas: '' };
  return { asil: t.slice(0, i).trim().replace(/[.;·\s]+$/, '') + (i > 0 ? '.' : ''), kiyas: t.slice(i).replace(/^Kıyas:\s*/, '').trim() };
}

const HOLDOUT_CUMLE = {
  acildi: 'Ölçütler ölçümden önce yazıldı; kural, kurulurken hiç bakılmamış dönemde bir kez sınandı.',
  acilmadi: 'Kural geliştirme döneminde elendiği için hiç bakılmamış döneme geçilmedi.',
  bekliyor: 'Hiç bakılmamış dönem henüz açılmadı.',
  yok: 'Bu denemede ayrı bir hiç bakılmamış dönem yok.',
};

const gunTr = (g) => (/^\d{4}-\d{2}-\d{2}$/.test(String(g || '')) ? `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}` : '');
function gunFarki(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
const noktali = (s) => { const t = buyukBas(String(s || '').trim()); return !t ? '' : /[.!?…)]$/.test(t) ? t : t + '.'; };

/** Durum → ders cümlesinin başı. */
function dersBasi(k, bugun) {
  const hk = gunTr(k.hukumTarihi);
  const kalan = hk && bugun ? gunFarki(bugun, k.hukumTarihi) : null;
  const zaman = hk ? ` Hüküm günü ${hk}${kalan != null ? (kalan > 0 ? ` (${kalan} gün kaldı)` : kalan === 0 ? ' (bugün)' : '') : ''}.` : '';
  switch (k.durum) {
    case 'RED': return 'Kabul edilmedi.';
    case 'KABUL': return 'Kabul edildi.';
    case 'GOLGE': return `Para koymadan, yeni günlerde gölge olarak ölçülüyor.${zaman}`;
    case 'ACIK': return `Ölçüm sürüyor; henüz hüküm yok.${zaman}`;
    case 'BILGI': return 'Bilgi kaydı — bir kabul/ret kararı değil.';
    case 'BOS': return 'Numara ayrıldı ama kullanılmadı.';
    case 'BELGESIZ': return 'Bu denemenin belgesi eksik; sonuç doğrulanamıyor.';
    default: return '';
  }
}

/** Kısa liste metni: ≤ n karakter, sözcük sınırında "…". */
function kisa(s, n = 90) {
  const t = buyukBas(sadelestir(s).trim());
  if (t.length <= n) return t.replace(/[.,;·]+$/, '');
  return t.slice(0, Math.max(t.slice(0, n).lastIndexOf(' '), n * 0.6)).replace(/[,;:·\s]+$/, '') + '…';
}

/**
 * Bir kaydın anlatısı.
 * @param {object} k  defter kaydı
 * @param {object} o  { bugun: 'YYYY-MM-DD', betikler: (plan) => string[] }
 */
function anlati(k, o = {}) {
  if (!k || typeof k !== 'object') return null;
  const n = Array.isArray(k.aralik) ? k.aralik[1] - k.aralik[0] + 1 : 1;
  const baslik = buyukBas(sadelestir(temizBaslik(k.baslik)));
  const hip = sadelestir(ilkCumle(k.hipotez));
  const { asil, kiyas } = kiyasAyir(k.sonuc);
  const ne = [noktali(baslik), hip && hip !== baslik ? hip : '', n > 1 ? `Bu kayıt ${n} denemeyi kapsar.` : '']
    .filter(Boolean).join(' ');
  const kiyasMetni = [kiyas ? noktali(`Kıyas: ${sadelestir(kiyas)}`) : '', HOLDOUT_CUMLE[k.holdout] || ''].filter(Boolean).join(' ');
  const sonucMetni = asil ? noktali(sadelestir(asil)) : (k.durum === 'GOLGE' || k.durum === 'ACIK' ? 'Henüz sonuç yok — ölçüm sürüyor.' : '—');
  const neden = sadelestir(String(k.neden || '').replace(/^kabul:\s*/i, 'Karar: '));
  const ders = [dersBasi(k, o.bugun), neden ? noktali(neden) : ''].filter(Boolean).join(' ');
  const betikler = typeof o.betikler === 'function' && k.plan ? o.betikler(k.plan) : [];
  return {
    ne, kiyas: kiyasMetni, sonuc: sonucMetni, ders,
    neKisa: kisa(baslik, 80), sonucKisa: asil ? kisa(asil, 90) : (k.durum === 'GOLGE' || k.durum === 'ACIK' ? (gunTr(k.hukumTarihi) ? `Ölçülüyor — hüküm ${gunTr(k.hukumTarihi)}` : 'Ölçülüyor') : '—'),
    nerede: { plan: k.plan || null, kaynak: k.kaynak || null, betikler },
  };
}

/** Plan belgesinde anılan, diskte var olan betikler (önbellekli; en çok 4). Saf değil — yalnız sunucu kullanır. */
function betikBulucu(kok) {
  const fs = require('fs');
  const path = require('path');
  const onb = new Map();
  return (plan) => {
    const ad = String(plan || '').split(/[\s,;]+/)[0];
    if (!/^[\w.-]+\.md$/i.test(ad)) return [];
    if (onb.has(ad)) return onb.get(ad);
    let l = [];
    try {
      const metin = fs.readFileSync(path.join(kok, ad), 'utf8');
      // Yalnız plan adıyla ortak sözcüğü olan betikler (PLAN-COKLU-TABAN → coklu-taban*.js): belgede anılan ilgisiz araçlar sayılmaz.
      const sozcuk = ad.replace(/^PLAN-/i, '').replace(/\.md$/i, '').toLowerCase().split(/[-_]/).filter(x => x.length >= 3);
      l = [...new Set([...metin.matchAll(/scripts\/[\w-]+\.js/g)].map(m => m[0]))]
        .filter(f => sozcuk.some(x => f.toLowerCase().includes(x)) && fs.existsSync(path.join(kok, f))).slice(0, 4);
    } catch (e) { l = []; }
    onb.set(ad, l);
    return l;
  };
}

module.exports = { anlati, sadelestir, temizBaslik, kiyasAyir, ilkCumle, kisa, betikBulucu, SOZLUK };
