/**
 * GÜVENLİ MARKDOWN → DOM (`AG.md`) — panel içi kılavuz (60.4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kılavuz bölümleri depoda Markdown (`public/kilavuz/bolumler/*.md`). Dış
 * kütüphane EKLENMEDİ: kullanılan alt küme küçük ve panelin XSS kuralı
 * (`scripts/panel-denetim.js` 5b: HTML ayrıştıran yazım yalnız
 * js/app/backtestAnaliz.js'te) bir Markdown kütüphanesinin `innerHTML`
 * çıktısıyla çelişirdi. Burada HİÇBİR metin HTML olarak yorumlanmaz: her şey
 * `AG.dom.el` ile kurulur, metin `textContent`e gider. Markdown içindeki
 * `<script>` ya da `<img onerror>` olduğu gibi YAZI olarak görünür.
 *
 * Desteklenen alt küme:
 *   # / ## / ###  başlık  (`## Başlık {#kimlik}` açık kimlik; yoksa başlıktan türetilir)
 *   paragraf, boş satırla ayrılır · `---` yatay çizgi
 *   - / * madde, 1. sıralı madde (tek düzey; devam satırı iki boşlukla)
 *   > alıntı → not kutusu; ilk kelime **Uyarı:** / **Dikkat:** (uyarı), **Tehlike:** (tehlike),
 *     **İpucu:** (ipucu), diğerleri bilgi notu
 *   ```dil … ``` kod bloğu · `satır içi kod` · **kalın** · _eğik_ / *eğik*
 *   [metin](#/yol) iç bağlantı · [metin](https://…) dış bağlantı (yeni sekme, noopener)
 *     başka her adres (javascript:, data:, göreli) bağlantı YAPILMAZ, metin olarak kalır
 *   | tablo | … | (ikinci satır ayraç)
 *   ![açıklama](ekran:kimlik) tek başına satırda → ekran görüntüsü (secenek.ekran(kimlik) kurar)
 *   ::sozluk-paneli::  → secenek.ozel('sozluk-paneli') kurar
 *
 *   AG.md.ayristir(metin)         → blok listesi (saf, DOM'suz; test edilir)
 *   AG.md.ciz(metin, secenek)     → DocumentFragment
 *   AG.md.duzMetin(metin)         → arama için düz metin
 *   AG.md.kimlik(metin)           → başlık kimliği (Türkçe harfler sadeleşir)
 */
(function (global) {
  'use strict';
  const AG = global.AG || (global.AG = {});

  const TR = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  function kimlik(metin) {
    return String(metin || '').toLocaleLowerCase('tr').replace(/[çğıiöşüâîû]/g, h => TR[h] || h)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'baslik';
  }

  /* ── Satır içi ──────────────────────────────────────────────────────── */
  /** Satır içi öğeler: { t:'metin'|'kalin'|'egik'|'kod'|'bag', v?, c?, href? } */
  function satirIci(s) {
    const out = [];
    let i = 0, tampon = '';
    const bosalt = () => { if (tampon) { out.push({ t: 'metin', v: tampon }); tampon = ''; } };
    while (i < s.length) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length && /[\\`*_[\]()#!|>-]/.test(s[i + 1])) { tampon += s[i + 1]; i += 2; continue; }
      if (c === '`') {
        const j = s.indexOf('`', i + 1);
        if (j > i) { bosalt(); out.push({ t: 'kod', v: s.slice(i + 1, j) }); i = j + 1; continue; }
      }
      if (c === '*' && s[i + 1] === '*') {
        const j = s.indexOf('**', i + 2);
        if (j > i + 2) { bosalt(); out.push({ t: 'kalin', c: satirIci(s.slice(i + 2, j)) }); i = j + 2; continue; }
      }
      if ((c === '_' || c === '*') && s[i + 1] && s[i + 1] !== ' ' && (i === 0 || /[\s(\[„"'/]/.test(s[i - 1]))) {
        const j = s.indexOf(c, i + 1);
        if (j > i + 1 && s[j - 1] !== ' ' && (j + 1 >= s.length || /[\s.,;:!?)\]'"…—–-]/.test(s[j + 1]))) {
          bosalt(); out.push({ t: 'egik', c: satirIci(s.slice(i + 1, j)) }); i = j + 1; continue;
        }
      }
      if (c === '[') {
        const m = s.slice(i).match(/^\[([^\]]+)\]\(([^)\s]+)\)/);
        if (m) { bosalt(); out.push({ t: 'bag', href: m[2], c: satirIci(m[1]) }); i += m[0].length; continue; }
      }
      tampon += c; i++;
    }
    bosalt();
    return out;
  }

  /* ── Bloklar ────────────────────────────────────────────────────────── */
  const tabloSatiri = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(x => x.trim().replace(/\\\|/g, '|'));
  const ayracMi = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

  function ayristir(metin) {
    const satirlar = String(metin || '').replace(/\r\n?/g, '\n').split('\n');
    const bloklar = [];
    let i = 0;
    const kimlikler = new Set();
    const tekil = (k) => { let x = k, n = 2; while (kimlikler.has(x)) x = `${k}-${n++}`; kimlikler.add(x); return x; };
    while (i < satirlar.length) {
      const l = satirlar[i];
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = l.match(/^```\s*([\w-]*)\s*$/))) {
        const govde = []; i++;
        while (i < satirlar.length && !/^```\s*$/.test(satirlar[i])) govde.push(satirlar[i++]);
        i++;
        bloklar.push({ tur: 'kod', dil: m[1] || '', metin: govde.join('\n') });
        continue;
      }
      if ((m = l.match(/^(#{1,4})\s+(.+?)\s*$/))) {
        let baslik = m[2], acik = null;
        const k = baslik.match(/\s*\{#([a-z0-9-]+)\}\s*$/);
        if (k) { acik = k[1]; baslik = baslik.slice(0, k.index).trim(); }
        bloklar.push({ tur: 'baslik', duzey: m[1].length, metin: baslik, id: tekil(acik || kimlik(baslik)), satir: satirIci(baslik) });
        i++; continue;
      }
      if (/^\s*(---|\*\*\*)\s*$/.test(l)) { bloklar.push({ tur: 'cizgi' }); i++; continue; }
      if ((m = l.match(/^::([a-z0-9-]+)::\s*$/))) { bloklar.push({ tur: 'ozel', ad: m[1] }); i++; continue; }
      if ((m = l.match(/^!\[([^\]]*)\]\(ekran:([a-z0-9-]+)\)\s*$/))) { bloklar.push({ tur: 'ekran', kimlik: m[2], aciklama: m[1] }); i++; continue; }
      if (/^\s*>/.test(l)) {
        const govde = [];
        while (i < satirlar.length && /^\s*>/.test(satirlar[i])) govde.push(satirlar[i++].replace(/^\s*>\s?/, ''));
        const ic = ayristir(govde.join('\n'));
        const ilk = govde.join(' ').trim();
        // `\b` Türkçe harfte (ı, İ) çalışmaz — kelime sonu ':' / boşluk / '*' ile aranır.
        const tur = /^\*\*(Uyarı|Dikkat)(?=[:\s*])/i.test(ilk) ? 'uyari' : /^\*\*Tehlike(?=[:\s*])/i.test(ilk) ? 'tehlike' : /^\*\*İpucu(?=[:\s*])/i.test(ilk) ? 'ipucu' : 'not';
        bloklar.push({ tur: 'alinti', cesit: tur, bloklar: ic });
        continue;
      }
      if (/^\s*\|/.test(l) && i + 1 < satirlar.length && ayracMi(satirlar[i + 1])) {
        const basliklar = tabloSatiri(l).map(satirIci); i += 2;
        const satirlarT = [];
        while (i < satirlar.length && /^\s*\|/.test(satirlar[i])) satirlarT.push(tabloSatiri(satirlar[i++]).map(satirIci));
        bloklar.push({ tur: 'tablo', basliklar, satirlar: satirlarT });
        continue;
      }
      if ((m = l.match(/^(\s*)([-*]|\d+[.)])\s+(.*)$/))) {
        const sirali = /\d/.test(m[2]);
        const bas = sirali ? parseInt(m[2], 10) : 1;
        const ogeler = [];
        while (i < satirlar.length) {
          const x = satirlar[i].match(/^\s*([-*]|\d+[.)])\s+(.*)$/);
          if (x && (/\d/.test(x[1]) === sirali)) { ogeler.push(x[2]); i++; continue; }
          if (ogeler.length && /^\s{2,}\S/.test(satirlar[i]) && !x) { ogeler[ogeler.length - 1] += ' ' + satirlar[i].trim(); i++; continue; }
          break;
        }
        bloklar.push({ tur: 'liste', sirali, bas, ogeler: ogeler.map(satirIci) });
        continue;
      }
      const par = [];
      while (i < satirlar.length && satirlar[i].trim() && !/^(#{1,4}\s|```|\s*>|\s*([-*]|\d+[.)])\s+|::[a-z0-9-]+::\s*$|!\[[^\]]*\]\(ekran:)/.test(satirlar[i])
        && !(/^\s*\|/.test(satirlar[i]) && i + 1 < satirlar.length && ayracMi(satirlar[i + 1]))) par.push(satirlar[i++].trim());
      if (!par.length) { par.push(l.trim()); i++; }
      bloklar.push({ tur: 'paragraf', satir: satirIci(par.join(' ')) });
    }
    return bloklar;
  }

  /** Satır içi öğelerin düz metni (tablo başlığı, arama). */
  const inlineDuz = (dizi) => (dizi || []).map(x => (x.v != null ? x.v : inlineDuz(x.c))).join('');

  /* ── Bağlantı güvenliği ─────────────────────────────────────────────── */
  /** 'ic' (#/…), 'dis' (http/https) ya da null (bağlantı kurulmaz). */
  function bagTuru(href) {
    const h = String(href || '').trim();
    if (/^#\/[a-z0-9\-/]*$/i.test(h)) return 'ic';
    if (/^https?:\/\/[^\s<>"']+$/i.test(h)) return 'dis';
    return null;
  }

  /* ── Çizim ──────────────────────────────────────────────────────────── */
  function ciz(metin, secenek) {
    const o = secenek || {};
    const el = AG.dom.el;
    const icCiz = (dizi) => (dizi || []).map(x => {
      if (x.t === 'metin') return global.document.createTextNode(x.v);
      if (x.t === 'kod') return el('code', { text: x.v });
      if (x.t === 'kalin') return el('strong', null, icCiz(x.c));
      if (x.t === 'egik') return el('em', null, icCiz(x.c));
      if (x.t === 'bag') {
        const tur = bagTuru(x.href);
        if (tur === 'ic') return el('a', { href: x.href, class: 'kl-bag' }, icCiz(x.c));
        if (tur === 'dis') return el('a', { href: x.href, class: 'kl-bag', target: '_blank', rel: 'noopener noreferrer' }, icCiz(x.c));
        return el('span', null, icCiz(x.c));
      }
      return null;
    });
    const blokCiz = (b) => {
      switch (b.tur) {
        case 'baslik': {
          const d = Math.min(6, b.duzey + (o.baslikKaydir || 0));
          return el(`h${d}`, { id: (o.kimlikOnEki || '') + b.id, class: `kl-h kl-h${b.duzey}` }, icCiz(b.satir));
        }
        case 'paragraf': return el('p', { class: 'kl-p' }, icCiz(b.satir));
        case 'cizgi': return el('hr', { class: 'kl-cizgi' });
        // Kod bloğu kendi kutusunda yatay kayar (komut harften bölünmez, olduğu gibi kopyalanır); klavyeyle kaydırılabilsin diye tabindex.
        case 'kod': return el('pre', { class: 'kl-kod', tabindex: '0' }, [el('code', { text: b.metin, 'data-dil': b.dil || null })]);
        case 'liste': return el(b.sirali ? 'ol' : 'ul', { class: 'kl-liste', start: b.sirali && b.bas !== 1 ? String(b.bas) : null },
          b.ogeler.map(x => el('li', null, icCiz(x))));
        case 'alinti': return el('aside', { class: `kl-not kl-not-${b.cesit}`, role: b.cesit === 'uyari' || b.cesit === 'tehlike' ? 'note' : null },
          b.bloklar.map(blokCiz));
        case 'tablo': {
          const satirlarT = b.satirlar.map(s => el('tr', null, s.map(h => el('td', null, icCiz(h)))));
          if (AG.tablo && AG.tablo.kutulu) {
            return AG.tablo.kutulu({ sinif: 'kl-tablo', basliklar: b.basliklar.map(inlineDuz), satirlar: satirlarT }, 'kl-tablo-kap');
          }
          return el('div', { class: 'table-container kl-tablo-kap' });
        }
        case 'ekran': return o.ekran ? o.ekran(b.kimlik, b.aciklama) : el('p', { class: 'kl-p', text: `[${b.aciklama}]` });
        case 'ozel': return o.ozel ? o.ozel(b.ad) : null;
        default: return null;
      }
    };
    return AG.dom.parca(ayristir(metin).map(blokCiz));
  }

  /** Arama dizini için düz metin (işaretler, bağlantı adresleri ve kod çitleri çıkarılmış). */
  function duzMetin(metin) {
    return String(metin || '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\{#[a-z0-9-]+\}/g, '').replace(/^```.*$/gm, '').replace(/[`*_>#|]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  AG.md = { ayristir, ciz, duzMetin, kimlik, bagTuru, satirIci };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.md;
})(typeof window !== 'undefined' ? window : globalThis);
