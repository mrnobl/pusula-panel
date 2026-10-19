/**
 * İŞLEM DEFTERİ — METİN ARAÇLARI (sürüm 64.7) — saf, ağa çıkmaz, dosya yazmaz.
 *   coz(buffer)        bayt → { metin, kodlama }: BOM (UTF-8 / UTF-16LE / UTF-16BE), BOM'suz UTF-16 (sıfır bayt deseni),
 *                      geçerli UTF-8, HTML <meta charset>, yoksa windows-1254 (Türkçe Windows; ASCII'de 1252 ile aynı).
 *                      MetaTrader 5 raporları UTF-16LE + BOM; MT4 "Detailed Statement" çoğunlukla windows-125x.
 *   csvAyristir(metin) → [[hücre]] — tırnaklı alan, "" kaçışı, satır içi yeni satır; ayraç (, ; sekme) ilk satırdan seçilir.
 *   htmlSatirlar(html) → [[{ metin, kapsam }]] — <tr>/<td|th> (kapanış etiketi olmasa da), colspan, &nbsp; ve sayı varlıkları;
 *                      tek geçişli doğrusal tarayıcı (bozuk girdide düzenli ifade geri izlemesi yok). etiketSil(html, ara) aynı tarayıcıyla.
 *   sayi(s)            "1 234.56" · "1,234.56" · "1.234,56" · "−5" · "(5)" · "0.001BTC" → sayı (birim soneki atılır) ya da null.
 *   birimAyir(s)       "0.001BTC" → { sayi: 0.001, birim: 'BTC' }.
 */
'use strict';

const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);

function kodlamaDene(buf, ad, fatal) {
  try { return new TextDecoder(ad, fatal ? { fatal: true } : undefined).decode(buf); } catch (e) { return null; }
}

/** Bayt dizisini metne çevirir; hangi kodlamanın seçildiğini de söyler. */
function coz(girdi) {
  const buf = Buffer.isBuffer(girdi) ? girdi : Buffer.from(girdi || '');
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return { metin: buf.subarray(3).toString('utf8'), kodlama: 'utf-8 (BOM)' };
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return { metin: kodlamaDene(buf.subarray(2), 'utf-16le') || '', kodlama: 'utf-16le (BOM)' };
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) return { metin: kodlamaDene(buf.subarray(2), 'utf-16be') || '', kodlama: 'utf-16be (BOM)' };
  // BOM'suz UTF-16: ASCII ağırlıklı metinde baytların yarısı sıfırdır (LE'de tek, BE'de çift konumlar)
  const n = Math.min(buf.length, 4000);
  let tekSifir = 0, ciftSifir = 0;
  for (let i = 0; i < n; i++) if (buf[i] === 0) { if (i % 2) tekSifir++; else ciftSifir++; }
  if (n >= 8 && tekSifir > n * 0.3 && ciftSifir < n * 0.05) return { metin: kodlamaDene(buf, 'utf-16le') || '', kodlama: 'utf-16le' };
  if (n >= 8 && ciftSifir > n * 0.3 && tekSifir < n * 0.05) return { metin: kodlamaDene(buf, 'utf-16be') || '', kodlama: 'utf-16be' };
  const u8 = kodlamaDene(buf, 'utf-8', true);
  if (u8 != null) return { metin: u8, kodlama: 'utf-8' };
  // HTML'de beyan edilen kod sayfası (MT4: <meta http-equiv="Content-Type" content="text/html; charset=windows-1252">)
  const bas = buf.subarray(0, 2048).toString('latin1');
  const m = /charset\s*=\s*["']?([\w-]+)/i.exec(bas);
  if (m) {
    const ad = m[1].toLowerCase();
    if (!/^utf-?8$/.test(ad)) { const d = kodlamaDene(buf, ad); if (d != null) return { metin: d, kodlama: ad }; }
  }
  return { metin: kodlamaDene(buf, 'windows-1254') || buf.toString('latin1'), kodlama: 'windows-1254' };
}

/** Ayraç: ilk dolu satırda (tırnak dışı) en çok geçen , ; sekme. */
function ayracSec(metin) {
  const ilk = (metin.split(/\r?\n/).find(s => s.trim()) || '');
  let tirnak = false;
  const say = { ',': 0, ';': 0, '\t': 0 };
  for (const c of ilk) { if (c === '"') tirnak = !tirnak; else if (!tirnak && c in say) say[c]++; }
  return Object.entries(say).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(say).sort((a, b) => b[1] - a[1])[0][0] : ',';
}

/** RFC 4180 benzeri CSV ayrıştırıcı. Boş satırlar atlanır; hücreler kırpılır. */
function csvAyristir(metin, ayrac) {
  const s = String(metin || '').replace(/^﻿/, '');
  const a = ayrac || ayracSec(s);
  const satirlar = [];
  let satir = [], hucre = '', tirnak = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (tirnak) {
      if (c === '"') { if (s[i + 1] === '"') { hucre += '"'; i++; } else tirnak = false; }
      else hucre += c;
      continue;
    }
    if (c === '"' && !hucre.trim()) { tirnak = true; hucre = ''; continue; }
    if (c === a) { satir.push(hucre.trim()); hucre = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      satir.push(hucre.trim()); hucre = '';
      if (satir.some(x => x !== '')) satirlar.push(satir);
      satir = [];
      continue;
    }
    hucre += c;
  }
  satir.push(hucre.trim());
  if (satir.some(x => x !== '')) satirlar.push(satir);
  return satirlar;
}

const VARLIK = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
function varlikCoz(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (t, v) => {
    if (v[0] === '#') { const k = v[1] === 'x' || v[1] === 'X' ? parseInt(v.slice(2), 16) : parseInt(v.slice(1), 10); return Number.isFinite(k) && k > 0 && k < 0x110000 ? String.fromCodePoint(k) : t; }
    const r = VARLIK[v.toLowerCase()];
    return r != null ? r : t;
  });
}

/**
 * Yorum (<!-- … -->) ve <script>/<style> bloklarını TEK GEÇİŞTE atar (indexOf; geri izleme yok — bozuk dosyada da doğrusal).
 * Kapanışı olmayan yorum / betik olduğu gibi kalır (eski düzenli ifadeyle aynı davranış).
 */
function yorumBetikSil(s) {
  const lo = s.toLowerCase();
  const parca = [];
  let i = 0;
  // Her desenin bir sonraki konumu önbellekte; yalnız geride kalınca yeniden aranır (toplam doğrusal).
  const ara = { yorum: -2, script: -2, style: -2 };
  const desen = { yorum: '<!--', script: '<script', style: '<style' };
  const sonraki = (ad) => {
    if (ara[ad] === -1) return -1;
    if (ara[ad] < i) {
      let p = lo.indexOf(desen[ad], i);
      // <script / <style ardından ad karakteri gelmemeli (<scripts değil)
      while (p >= 0 && ad !== 'yorum' && /[a-z0-9_-]/.test(lo[p + desen[ad].length] || '')) p = lo.indexOf(desen[ad], p + 1);
      ara[ad] = p;
    }
    return ara[ad];
  };
  for (;;) {
    let ad = null, p = -1;
    for (const a of ['yorum', 'script', 'style']) { const q = sonraki(a); if (q >= 0 && (p < 0 || q < p)) { p = q; ad = a; } }
    if (p < 0) break;
    let son;
    if (ad === 'yorum') { const k = lo.indexOf('-->', p + 4); son = k < 0 ? -1 : k + 3; }
    else { const k = lo.indexOf(`</${ad}`, p + desen[ad].length); const g = k < 0 ? -1 : lo.indexOf('>', k); son = g < 0 ? -1 : g + 1; }
    if (son < 0) { ara[ad] = -1; continue; }   // kapanışı yok: dokunma, bu desen bir daha aranmaz
    parca.push(s.slice(i, p));
    i = son;
  }
  parca.push(s.slice(i));
  return parca.join('');
}

/**
 * Etiket tarayıcı (doğrusal): her '<' için bir sonraki '>' ve '<' önbellekten bulunur. '>' gelmeden yeni '<' başlıyorsa ya da
 * '>' hiç yoksa '<' düz metindir (eski `<[^>]*>` davranışı). geri(ad, kapanis, oznitelik) adı olan her etiket için; metin(bas, son)
 * etiketler arası metin için çağrılır. Adsız etiket (<!DOCTYPE …>, "< x >") yalnız atılır.
 */
function etiketTara(s, geri, metin) {
  let i = 0, lt = -2, gt = -2, duzBas = 0;
  for (;;) {
    if (lt < i) lt = s.indexOf('<', i);
    if (lt < 0) break;
    if (gt !== -1 && gt < lt) gt = s.indexOf('>', lt);
    if (gt < 0) break;   // bundan sonra hiç '>' yok: kalan her şey metin
    const lt2 = s.indexOf('<', lt + 1);
    if (lt2 >= 0 && lt2 < gt) { i = lt2; lt = lt2; continue; }   // bu '<' düz metin
    if (metin && lt > duzBas) metin(duzBas, lt);
    const ic = s.slice(lt + 1, gt);
    const m = /^(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(ic);
    if (m) geri(m[2].toLowerCase(), m[1] === '/', ic.slice(m[0].length));
    duzBas = gt + 1;
    i = gt + 1;
    lt = lt2;
  }
  if (metin && s.length > duzBas) metin(duzBas, s.length);
}

/** Etiketleri atar (doğrusal); `ara` her etiketin yerine konur. */
function etiketSil(html, ara = '') {
  const s = String(html || '');
  const out = [];
  etiketTara(s, () => { if (ara) out.push(ara); }, (a, b) => out.push(s.slice(a, b)));
  return out.join('');
}

/**
 * HTML tablolarındaki satırlar (belge sırasıyla). Etiketler atılır, boşluklar tek boşluğa iner. Tek geçişli tarayıcı:
 * bozuk / kötü niyetli dosyada (ör. 0,7 MB "<tr ") süre doğrusal kalır — sunucu (bot da aynı süreçte) donmaz.
 * <tr> satır açar; </tr> ya da </table> kapatır; <td>/<th> hücre açar (kapanışı olmasa da sonraki hücre / satır kapatır);
 * </td> ile sonraki hücre arasındaki metin yok sayılır; <br> boşluk olur, diğer etiketler atılır.
 */
function htmlSatirlar(html) {
  const s = yorumBetikSil(String(html || ''));
  const out = [];
  let satir = null, hucre = null;
  const hucreKapat = () => {
    if (!hucre) return;
    const metin = varlikCoz(hucre.parca.join('')).replace(/\s+/g, ' ').trim();
    satir.push({ metin, kapsam: hucre.kapsam });
    hucre = null;
  };
  const satirKapat = () => { hucreKapat(); if (satir && satir.length) out.push(satir); satir = null; };
  etiketTara(s, (ad, kapanis, oz) => {
    if (ad === 'tr' && !kapanis) { satirKapat(); satir = []; return; }
    if ((ad === 'tr' || ad === 'table') && kapanis) { satirKapat(); return; }
    if (!satir) return;
    if (ad === 'td' || ad === 'th') {
      hucreKapat();
      if (kapanis) return;
      const kap = /colspan\s*=\s*["']?(\d{1,4})/i.exec(oz.slice(0, 2000));
      hucre = { parca: [], kapsam: kap ? Math.max(1, +kap[1]) : 1 };
      return;
    }
    if (ad === 'br' && hucre) hucre.parca.push(' ');
  }, (a, b) => { if (hucre) hucre.parca.push(s.slice(a, b)); });
  satirKapat();
  return out;
}

/** Sayı: binlik/ondalık ayraç kestirimi; birim soneki ya da öneki atılır. */
function sayi(girdi) {
  if (sayiMi(girdi)) return girdi;
  if (girdi == null) return null;
  let s = String(girdi).replace(/[\s  ]/g, '').replace(/[−–]/g, '-');
  if (!s || s === '-' || /^n\/?a$/i.test(s)) return null;
  let eksi = false;
  if (/^\(.*\)$/.test(s)) { eksi = true; s = s.slice(1, -1); }
  const m = /[-+]?[\d.,]*\d(?:[eE][-+]?\d+)?/.exec(s);
  if (!m) return null;
  let t = m[0];
  if (/[eE]/.test(t) && !/,/.test(t)) { const v = Number(t); return Number.isFinite(v) ? (eksi ? -v : v) : null; }
  const virgul = t.lastIndexOf(','), nokta = t.lastIndexOf('.');
  if (virgul >= 0 && nokta >= 0) {
    if (virgul > nokta) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, '');
  } else if (virgul >= 0) {
    // Tek virgül: "1,234" (binlik) mı "1,5" (ondalık) mı? Üç basamaklı gruplar ve birden çok virgül → binlik.
    const gruplar = t.split(',');
    t = gruplar.length > 2 || (gruplar.length === 2 && gruplar[1].length === 3 && /^-?[1-9]\d{0,2}$/.test(gruplar[0])) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  return eksi ? -Math.abs(v) : v;
}

/** "0.001BTC" / "12.5 USDT" / "-3.2USDT" → { sayi, birim }. */
function birimAyir(girdi) {
  const s = String(girdi == null ? '' : girdi).trim();
  const m = /^([-+−]?[\d.,]+(?:[eE][-+]?\d+)?)\s*([A-Za-z][A-Za-z0-9]*)?$/.exec(s);
  if (!m) return { sayi: sayi(s), birim: null };
  return { sayi: sayi(m[1]), birim: m[2] ? m[2].toUpperCase() : null };
}

/** Başlık normalleştirme: küçük harf, boşluk/altçizgi/nokta/parantez tek boşluk. */
const baslikNorm = (s) => String(s || '').replace(/^﻿/, '').toLowerCase().replace(/[_./()\-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Kısa ham alan: en çok `n` alan, her biri en çok 120 karakter (sır taşımaz — yalnız dosya/sunucu satırı). */
function hamKisalt(nesne, n = 14) {
  const out = {};
  let i = 0;
  for (const [k, v] of Object.entries(nesne || {})) {
    if (i++ >= n) break;
    if (/secret|passphrase|sign|apikey|api_key|token/i.test(k)) continue;
    // Kullanıcı kimliği (OKX "User ID" / "UID") saklanmaz: MT hesap numarası gibi yalnız son 3 hanesi
    if (/user[\s_-]?id|uid/i.test(k)) { const d = String(v == null ? '' : v).trim(); out[String(k).slice(0, 40)] = d ? `…${d.slice(-3)}` : ''; continue; }
    const d = v == null ? '' : String(v);
    out[String(k).slice(0, 40)] = d.length > 120 ? d.slice(0, 117) + '…' : d;
  }
  return out;
}

module.exports = { coz, csvAyristir, ayracSec, htmlSatirlar, etiketSil, yorumBetikSil, varlikCoz, sayi, birimAyir, baslikNorm, hamKisalt, sayiMi };
