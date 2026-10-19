/**
 * DOM KURUCU — `innerHTML` yerine eleman (`PLAN-MOTOR.md` §8, P2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Panelde 52 `innerHTML` ataması var: HTML, JavaScript metni içinde
 * birleştirilerek kuruluyor. İki bedeli ölçüldü:
 *
 *   · Bir sütun eklemek, metin birleştirmeyi düzenlemek demek — veri ile
 *     sunum aynı ifadenin içinde.
 *   · Kaçışsız birleştirme, sunucudan gelen metni (sembol adı, hata mesajı,
 *     strateji etiketi) doğrudan işaretlemeye yazıyor.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * BU KOD ZATEN VARDI — İKİNCİ KOPYA OLMASIN
 * ───────────────────────────────────────────────────────────────────────────
 * `indicatorUI.js` içinde birebir aynı işi yapan bir `el()` duruyordu.
 * Bu depoda aynı kuralın iki kopyası bir kez sessizce AYRIŞTI (`htfTopla`,
 * biri kovaya `time`/`volume` yazıyordu diğeri yazmıyordu). O yüzden burası
 * tek kaynak; `indicatorUI.js` artık buraya bağlanıyor.
 */
(function (global) {
  'use strict';

  /**
   * Eleman kurar.
   *
   * `props` sözleşmesi (`indicatorUI.js`'in emekli edilen kopyasıyla aynı,
   * geriye dönük uyumlu):
   *   text      → `textContent` (KAÇIŞ GEREKTİRMEZ, HTML olarak yorumlanmaz)
   *   class     → `className`
   *   style     → `style.cssText`
   *   on*       → olay dinleyici (`onclick`, `onchange`, …)
   *   diğerleri → `setAttribute`; `null`/`undefined` ATLANIR
   *
   * `children` dizisindeki `null`/`undefined` sessizce atlanır: koşullu
   * çocuk yazarken (`kosul && el(...)`) her seferinde filtrelemek gerekmesin.
   */
  function el(tag, props, children) {
    const node = global.document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'style') node.style.cssText = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'class') node.className = v;
        else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v !== null && v !== undefined) node.setAttribute(k, v);
      }
    }
    (children || []).forEach(c => c && node.appendChild(c));
    return node;
  }

  /**
   * SVG elemanı kurar (dağılım halkası gibi küçük çizimler). `attrs` yalnız
   * `setAttribute` ile yazılır — metin `text` ile `textContent`'e gider;
   * işaretleme ayrıştırılmaz. Renk CSS sınıfından gelir (inline stil yok).
   */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, children) {
    const d = global.document;
    const node = d.createElementNS ? d.createElementNS(SVG_NS, tag) : d.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'text') node.textContent = v;
      else if (v !== null && v !== undefined) node.setAttribute(k, String(v));
    }
    (children || []).forEach(c => c && node.appendChild(c));
    return node;
  }

  /**
   * Kabı boşaltır.
   *
   * `innerHTML = ''` yerine `textContent = ''`: ikisi de içeriği siler ama
   * `innerHTML` ayrıştırıcıyı çalıştırır ve alışkanlık olarak yanına metin
   * eklenmesine davetiye çıkarır.
   */
  function bosalt(node) {
    if (node) node.textContent = '';
    return node;
  }

  /** Kabı boşaltıp yeni çocukları koyar — "yeniden çiz" kalıbı. */
  function doldur(node, children) {
    if (!node) return node;
    bosalt(node);
    (children || []).forEach(c => c && node.appendChild(c));
    return node;
  }

  /** Çok sayıda çocuğu tek yerleştirmede eklemek için belge parçası. */
  function parca(children) {
    const f = global.document.createDocumentFragment();
    (children || []).forEach(c => c && f.appendChild(c));
    return f;
  }

  /** Tablo satırı: hücre listesi → `<tr>`. Hücre metin ya da eleman olabilir. */
  function satir(hucreler, props) {
    return el('tr', props, (hucreler || []).map(h => (
      h && h.nodeType ? el('td', null, [h]) : el('td', { text: h === null || h === undefined ? '' : String(h) })
    )));
  }

  /** Başlık satırı: `<th>` hücreleri. */
  function baslikSatiri(basliklar) {
    return el('tr', null, (basliklar || []).map(b => el('th', { text: String(b) })));
  }

  const bul = (id) => global.document.getElementById(id);

  /* ── Meşgul düğme ─────────────────────────────────────────────────────
     Panelde sekiz düğme uzun bir iş sırasında etiket değiştiriyordu ve
     bunu `innerHTML` ile yapıyordu — hem meşgul metnini yazarken hem eski
     etikete dönerken. Eski etiket `<i data-lucide="…">` içerdiği için
     dönüşten sonra `lucide.createIcons()` çağırmak ZORUNLUYDU; çağrılmayı
     unutan bir yerde ikon sessizce kaybolurdu.

     Düğümleri saklayıp geri koymak bu zorunluluğu kaldırıyor: çizilmiş
     `<svg>` olduğu gibi geri geliyor, yeniden ayrıştırma da yok.        */

  const SAKLI = '__eskiIcerik';

  /**
   * Düğmeyi meşgul hâline alır: mevcut içeriği saklar, metni yazar,
   * düğmeyi devre dışı bırakır.
   *
   * İçerik YALNIZCA İLK çağrıda saklanır — arka arkaya iki `mesgul`
   * çağrısı meşgul metnini "eski etiket" sanıp kalıcı hâle getirirdi.
   */
  function mesgul(dugme, metin) {
    if (!dugme) return dugme;
    if (!dugme[SAKLI]) dugme[SAKLI] = Array.prototype.slice.call(dugme.childNodes);
    dugme.textContent = metin;
    dugme.disabled = true;
    // Tek tip "bekleniyor" görünümü (Pusula P5): dönen simge CSS'te (.is-mesgul), ekran okuyucuya aria-busy.
    if (dugme.classList) dugme.classList.add('is-mesgul');
    if (dugme.setAttribute) dugme.setAttribute('aria-busy', 'true');
    return dugme;
  }

  /** Düğmeyi eski etiketine ve etkin hâline döndürür. */
  function hazir(dugme) {
    if (!dugme) return dugme;
    dugme.disabled = false;
    if (dugme.classList) dugme.classList.remove('is-mesgul');
    if (dugme.removeAttribute) dugme.removeAttribute('aria-busy');
    const eski = dugme[SAKLI];
    if (eski) {
      bosalt(dugme);
      eski.forEach(n => dugme.appendChild(n));
      dugme[SAKLI] = null;
    }
    return dugme;
  }

  const dom = { el, svg, bosalt, doldur, parca, satir, baslikSatiri, bul, mesgul, hazir };

  global.AG = global.AG || {};
  global.AG.dom = dom;

  if (typeof module !== 'undefined' && module.exports) module.exports = dom;
})(typeof window !== 'undefined' ? window : globalThis);
