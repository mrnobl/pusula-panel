/**
 * BACKTEST ANALİZ PANELİ — tablo ve zaman şeridi (`PLAN-MOTOR.md` §8, P3b)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `anRenderTable` panelin en genel tablo kurucusuydu: başlık satırı, bölüm
 * ayraçları, sağa yaslı sayı hücreleri ve isteğe bağlı açıklama. Hepsi metin
 * birleştirmeyle yazılıyordu.
 *
 * ⚠ KAPSAM: `anBar` (karşılaştırma çubuğu) BURAYA ALINMADI. O fonksiyon HTML
 * DİZESİ döndürüyor ve çağıranları o dizeyi başka dizelerle birleştirip
 * `innerHTML`e veriyor; düğüme çevirmek `renderBacktestAnalytics`in
 * tamamının (400 satır) aynı anda taşınmasını gerektirir. Yarım taşımak,
 * yarısı düğüm yarısı metin bir çizici bırakırdı.
 */
(function (global) {
  'use strict';

  const AG = global.AG || (global.AG = {});
  const dom = AG.dom;
  const fmt = AG.fmt;
  const el = (t, p, c) => dom.el(t, p, c);

  /**
   * Analiz tablosu.
   *
   * `rows` iki biçimden biri:
   *   { section: 'BAŞLIK' }                      → bölüm ayracı
   *   { label, values: [...], hint? }            → veri satırı
   *
   * `values` elemanı düz değer ya da `{ text, color }` olabilir; renk
   * `AG.fmt.renkTonu` ile ton sınıfına çevrilir. Bilinmeyen renk sessizce
   * uydurulmaz — ton verilmez.
   */
  function tablo(tableId, headers, rows) {
    const tbl = global.document.getElementById(tableId);
    if (!tbl) return;

    const basliklar = el('tr', null, (headers || []).map((h, i) =>
      el('th', { class: i === 0 ? null : 'text-right', text: String(h) })));

    const satirlar = (rows || []).map(r => {
      if (r.section) {
        return el('tr', null, [el('td', {
          colspan: String((headers || []).length),
          class: 'an-section',
          text: r.section
        })]);
      }

      const etiket = el('td', { class: 'an-label' }, [
        global.document.createTextNode(r.label)
      ]);
      if (r.hint) {
        etiket.appendChild(global.document.createTextNode(' '));
        etiket.appendChild(el('span', { class: 'an-hint', text: `(${r.hint})` }));
      }

      const hucreler = (r.values || []).map(v => {
        const nesne = v && typeof v === 'object';
        const ton = nesne ? fmt.renkTonu(v.color) : null;
        const metin = nesne ? v.text : v;
        return el('td', {
          class: 'an-cell' + (ton ? ' ' + ton : ''),
          text: metin === null || metin === undefined ? '' : String(metin)
        });
      });

      return el('tr', null, [etiket].concat(hucreler));
    });

    dom.doldur(tbl, [
      el('thead', null, [basliklar]),
      el('tbody', null, satirlar)
    ]);
    // Telefonda tablo → kart: hücre etiketleri sütun başlığından (js/core/tablo.js).
    if (global.AG && global.AG.tablo) global.AG.tablo.etiketle(tbl);
  }

  /**
   * Zaman şeridi — kümülatif kâr-zararın yönünü segment segment gösterir.
   *
   * Segment sayısı ~220 ile sınırlı: her bar için bir düğüm kurmak uzun
   * koşularda binlerce eleman demekti ve şerit zaten piksel genişliğinde.
   */
  function zamanSeridi(series) {
    const strip = global.document.getElementById('anTimeStrip');
    if (!strip || !series || !series.cumulativePnl || !series.cumulativePnl.length) return;

    const n = series.cumulativePnl.length;
    const adim = Math.max(1, Math.ceil(n / 220));
    const hucreler = [];

    for (let i = 0; i < n; i += adim) {
      const dilim = series.cumulativePnl.slice(i, i + adim);
      const bas = i === 0 ? 0 : series.cumulativePnl[i - 1];
      const son = dilim[dilim.length - 1];
      hucreler.push(el('div', { class: 'strip-cell ' + (son >= bas ? 'strip-up' : 'strip-down') }));
    }

    dom.doldur(strip, hucreler);
    return hucreler.length;
  }

  AG.pages = AG.pages || {};
  AG.pages.analiz = { tablo, zamanSeridi };

  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.analiz;
})(typeof window !== 'undefined' ? window : globalThis);
