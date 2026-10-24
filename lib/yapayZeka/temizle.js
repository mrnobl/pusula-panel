'use strict';
/**
 * YAPAY ZEKÂ NOTLARI (74.1, PLAN-DIKKAT-LISTESI §F3) — getirilen sayfa metnini TEMİZLEME (saf, ağ yok, dosya yok).
 * ═══════════════════════════════════════════════════════════════════════════
 * Modele yalnız İNSANIN GÖRDÜĞÜ metin gider. Atılanlar (istem enjeksiyonu yolları):
 *   · HTML yorumları, CDATA, <script> <style> <noscript> <template> <svg> <iframe> <object> <embed> <head> <math> <canvas>
 *     <select> <button> <form> <textarea> öğeleri (içerikleriyle);
 *   · gizli öğeler İÇERİKLERİYLE: `hidden` niteliği, aria-hidden="true", style'da display:none / visibility:hidden /
 *     opacity:0 / font-size:0 / height:0 / width:0 / clip / ekran dışı konum, sınıfta sr-only / visually-hidden /
 *     screen-reader / d-none / hidden / invisible;
 *   · görünmez karakterler: sıfır genişlikli boşluklar, yön denetim karakterleri (U+202A–202E, U+2066–2069), yumuşak tire.
 * Sonra etiketler düşer, HTML varlıkları çözülür, boşluk sadeleşir (NFC). Çıktı DÜZ METİNDİR; HTML yorumlanmaz.
 */

const ICERIKLI_AT = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'object', 'embed', 'head', 'math', 'canvas', 'select', 'button', 'form', 'textarea'];
const BOS_OGELER = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const BLOK = new Set(['p', 'div', 'br', 'li', 'ul', 'ol', 'tr', 'td', 'th', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer', 'blockquote', 'pre', 'dd', 'dt', 'hr', 'title', 'item', 'description']);
const GIZLI_STIL = /(display\s*:\s*none|visibility\s*:\s*(hidden|collapse)|opacity\s*:\s*0(\.0+)?\s*(;|$|!)|font-size\s*:\s*0(\.0+)?(px|em|rem|pt|%)?\s*(;|$|!)|(^|[;\s])(height|width|max-height|max-width)\s*:\s*0(px)?\s*(;|$|!)|clip\s*:\s*rect\(\s*0|clip-path\s*:\s*inset\(\s*50%|(left|top|text-indent)\s*:\s*-\d{3,})/i;
const GIZLI_SINIF = /(^|\s)(sr-only|visually-hidden|visuallyhidden|screen-reader-text|screen-reader-only|d-none|hidden|invisible|is-hidden|u-hidden)(\s|$)/i;
const GORUNMEZ = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁦-⁯ㅤ﻿ﾠ]/g;

/** Saf: HTML varlıklarını çözer (adlı birkaç + sayısal). */
function varlikCoz(s) {
  const AD = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•', euro: '€', pound: '£' };
  return String(s).replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, k) => {
    if (k[0] === '#') {
      const n = k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return ' ';
      return String.fromCodePoint(n);
    }
    const v = AD[k.toLowerCase()];
    return v == null ? m : v;
  });
}

/** Saf: açılış etiketinin nitelik metni gizli bir öğeyi mi anlatıyor. */
function gizliMi(nitelik) {
  const a = String(nitelik || '');
  if (/(^|\s)hidden(\s|=|$|\/)/i.test(a)) return true;
  if (/aria-hidden\s*=\s*["']?\s*true/i.test(a)) return true;
  const st = /style\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(a);
  if (st && GIZLI_STIL.test(varlikCoz(st[2] || st[3] || st[4] || ''))) return true;
  const cl = /class\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(a);
  if (cl && GIZLI_SINIF.test(cl[2] || cl[3] || cl[4] || '')) return true;
  if (/type\s*=\s*["']?hidden/i.test(a)) return true;
  return false;
}

/**
 * Saf: HTML → görünen düz metin.
 * @param html  ham HTML (ya da HTML parçası)
 * @param o     { enCok: karakter sınırı (varsayılan 20000) }
 */
function htmlTemizle(html, o = {}) {
  let s = String(html == null ? '' : html);
  s = s.replace(/<!--[\s\S]*?(-->|$)/g, ' ').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<![^>]*>/g, ' ').replace(/<\?[\s\S]*?\?>/g, ' ');
  for (const ad of ICERIKLI_AT) s = s.replace(new RegExp(`<${ad}\\b[\\s\\S]*?(<\\/${ad}\\s*>|$)`, 'gi'), ' ');
  // Etiket tarayıcısı: gizli öğe içeriğiyle birlikte atlanır (aynı adlı iç içe öğeler sayılır).
  const out = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/g;
  let son = 0, m, atla = null;   // atla: { ad, derinlik }
  while ((m = re.exec(s))) {
    const kapanis = m[1] === '/', ad = m[2].toLowerCase(), nit = m[3] || '';
    const kendiKapali = /\/\s*$/.test(nit) || BOS_OGELER.has(ad);
    if (!atla) out.push(s.slice(son, m.index));
    son = re.lastIndex;
    if (atla) {
      if (ad === atla.ad && !kendiKapali) atla.derinlik += kapanis ? -1 : 1;
      if (atla.derinlik <= 0) atla = null;
      continue;
    }
    if (!kapanis && gizliMi(nit)) { if (!kendiKapali) atla = { ad, derinlik: 1 }; continue; }
    if (BLOK.has(ad)) out.push('\n');
    else out.push(' ');
  }
  if (!atla) out.push(s.slice(son));
  let t = out.join('').replace(/<[^>]*$/, ' ');
  t = varlikCoz(t).normalize('NFC').replace(GORUNMEZ, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
  t = t.replace(/[ \t  -   　]+/g, ' ').split('\n').map(x => x.trim()).filter(Boolean).join('\n');
  const n = Number.isFinite(o.enCok) ? o.enCok : 20000;
  return t.length > n ? t.slice(0, n) : t;
}

/** Saf: RSS/Atom → [{ baslik, aciklama, link, tarih (ISO|null) }] (açıklama temizlenmiş düz metin). */
function rssOgeleri(xml, o = {}) {
  const s = String(xml || '');
  const ogeler = s.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  const al = (x, ad) => { const r = new RegExp(`<${ad}\\b[^>]*>([\\s\\S]*?)<\\/${ad}>`, 'i').exec(x); return r ? r[1] : ''; };
  const sonuc = [];
  for (const x of ogeler.slice(0, o.enCok || 50)) {
    let link = al(x, 'link').trim();
    if (!link) { const l = /<link\b[^>]*href\s*=\s*["']([^"']+)["']/i.exec(x); link = l ? l[1] : ''; }
    link = varlikCoz(link.replace(/<!\[CDATA\[|\]\]>/g, '')).trim();
    const tarihHam = al(x, 'pubDate') || al(x, 'published') || al(x, 'updated');
    const t = Date.parse(htmlTemizle(tarihHam));
    const baslik = htmlTemizle(varlikCoz(al(x, 'title').replace(/<!\[CDATA\[|\]\]>/g, '')), { enCok: 400 });
    // RSS açıklaması kaçışlı HTML taşır (&lt;a …&gt;): önce varlık çöz, sonra temizle.
    const aciklama = htmlTemizle(varlikCoz((al(x, 'description') || al(x, 'summary') || al(x, 'content')).replace(/<!\[CDATA\[|\]\]>/g, '')), { enCok: 1500 });
    const kaynak = htmlTemizle(al(x, 'source'), { enCok: 120 });
    if (!baslik || !/^https?:\/\//i.test(link)) continue;
    sonuc.push({ baslik, aciklama: aciklama === baslik ? '' : aciklama, link, tarih: Number.isFinite(t) ? new Date(t).toISOString() : null, kaynak: kaynak || null });
  }
  return sonuc;
}

module.exports = { htmlTemizle, rssOgeleri, varlikCoz, gizliMi, GORUNMEZ };
