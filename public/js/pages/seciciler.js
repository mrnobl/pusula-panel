/**
 * SEÇİCİLER — onay kutusu çipleri ve açılır liste seçenekleri
 * ═══════════════════════════════════════════════════════════════════════════
 * (`PLAN-MOTOR.md` §8, P3b)
 *
 * Panelde iki seçici var — çalıştırılacak varlıklar ve optimize edilecek
 * parametreler. Eskiden dört ayrı seçici AYNI çipi kendi metin şablonunda yeniden yazıyordu. Sekiz
 * `innerHTML` ataması buradaydı ve çipin dolgusu iki yerde 0.2rem, bir
 * yerde 0.15rem'di; yani kopyalar çoktan ayrışmıştı.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * BURADA DURUM YOK
 * ───────────────────────────────────────────────────────────────────────────
 * "Hangi kutu işaretli kalsın", "ilk çizimde ne seçili olsun" gibi kararlar
 * SAYFANIN durumudur ve `app.js`te kalıyor. Bu modül yalnızca verilen
 * bilgiden düğüm kurar. Böylece seçim koruma mantığı tek yerde durur ve
 * modül tarayıcısız sınanabilir.
 *
 * Sembol ve strateji adları `value` niteliğine METİN olarak yazılıyordu;
 * tırnak içeren bir ad işaretlemeyi bozardı.
 */
(function (global) {
  'use strict';

  const AG = global.AG || (global.AG = {});
  const dom = AG.dom;
  const el = (t, p, c) => dom.el(t, p, c);

  /**
   * Tek onay kutusu çipi.
   *
   * @param {object} o
   *   deger     — kutunun `value`si (sembol, strateji anahtarı, parametre adı)
   *   etiket    — görünen metin
   *   sinif     — kutunun sınıfı (`chk-scan-symbol` gibi); olay temsilcisi buna bakar
   *   isaretli  — başlangıçta işaretli mi
   *   baslik    — `title` niteliği
   *   dar       — dar dolgulu sürüm (parametre seçicisi)
   *   ek        — etiketin ardına eklenecek düğüm (rozet gibi)
   */
  function cip(o) {
    const kutu = el('input', { type: 'checkbox', value: o.deger, class: o.sinif });
    if (o.isaretli) kutu.checked = true;

    const cocuklar = [kutu, global.document.createTextNode(' ' + o.etiket)];
    if (o.ek) cocuklar.push(o.ek);

    return el('label', {
      class: 'pick-chip' + (o.dar ? ' pick-chip-sm' : ''),
      title: o.baslik || null
    }, cocuklar);
  }

  /** "Bot çalışıyor" noktası — varlık çipinin yanında. */
  function calisiyorRozeti() {
    return el('span', {
      class: 'run-dot tone-success',
      title: 'Bu varlıkta bot çalışıyor',
      text: ' ● çalışıyor'
    });
  }

  /** Liste boşken gösterilen tek satırlık not. */
  function bosNot(metin) {
    return el('span', { class: 'tone-muted', text: metin });
  }

  /**
   * Açılır listeyi doldurur.
   *
   * Seçili değer `selected` niteliğiyle DEĞİL, `value` ataması ile
   * belirleniyor: nitelik yolu metin birleştirmeyle yazıldığında sembolde
   * tırnak olsa işaretleme bozulurdu.
   */
  function secenekler(select, degerler, secili) {
    if (!select) return;
    dom.doldur(select, (degerler || []).map(d => el('option', { value: d, text: d })));
    if (secili !== undefined && secili !== null) select.value = secili;
  }

  AG.pages = AG.pages || {};
  AG.pages.seciciler = { cip, calisiyorRozeti, bosNot, secenekler };

  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.seciciler;
})(typeof window !== 'undefined' ? window : globalThis);
