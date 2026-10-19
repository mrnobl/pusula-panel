/**
 * TEMA — koyu/açık seçimi ve grafik renkleri (`AG.tema`)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bu betik `<head>` içinde, STİL DOSYALARINDAN HEMEN SONRA ve senkron
 * yüklenir: `data-theme` özniteliği ilk boyamadan önce yazılmazsa sayfa
 * bir an koyu açılıp açığa "yanıp söner".
 *
 * Kurallar:
 *   - Tercih localStorage'da ('pusula.tema' = 'dark' | 'light'; yeni panel 2026-10-19,
 *     eski 'ag.tema' anahtarı bilerek okunmaz: herkes yeni koyu temayla açılır). Okuma/yazma
 *     try/catch içinde: gizli pencere ya da engelli depolama sayfayı
 *     kırmaz, yalnızca tercih hatırlanmaz.
 *   - Kayıtlı tercih yoksa KOYU (yeni panel K-H: açık tema seçenek, varsayılan koyu).
 *   - Öznitelik HER ZAMAN yazılır; CSS iki durumla yetinir.
 *
 * GRAFİKLER: tuval (Chart.js, lightweight-charts) CSS değişkeni okuyamaz.
 * `renk('--pos')` hesaplanmış değeri döndürür, `coz('var(--x)')` dizedeki
 * değişkeni çözer. Tema değişince belgeye `ag:tema` olayı gönderilir;
 * grafikler bu olayı dinleyip kendini yeniden boyar.
 */
(function (global) {
  'use strict';

  const AG = global.AG || (global.AG = {});
  const doc = global.document;
  const ANAHTAR = 'pusula.tema';

  function kayitliOku() {
    try {
      const v = global.localStorage.getItem(ANAHTAR);
      return v === 'dark' || v === 'light' ? v : null;
    } catch (e) { return null; }
  }

  function kaydet(v) {
    try { global.localStorage.setItem(ANAHTAR, v); } catch (e) { /* depolama yok: yalnızca hatırlanmaz */ }
  }

  /** Varsayılan KOYU (PLAN-PANEL-YENI EK-1 K-H). Sistem tercihi artık seçmez; açık tema yalnız düğmeyle. */
  function sistemTemasi() { return 'dark'; }

  function etkin() {
    const a = doc && doc.documentElement.getAttribute('data-theme');
    return a === 'light' || a === 'dark' ? a : sistemTemasi();
  }

  function yay() {
    if (!doc) return;
    try {
      doc.dispatchEvent(new global.CustomEvent('ag:tema', { detail: { tema: etkin() } }));
    } catch (e) { /* eski tarayıcı: grafikler sonraki çizimde uyar */ }
    dugmeleriGuncelle();
  }

  function uygula(t, yayinla) {
    if (!doc) return;
    doc.documentElement.setAttribute('data-theme', t);
    if (yayinla) yay();
  }

  function degistir() {
    const yeni = etkin() === 'dark' ? 'light' : 'dark';
    kaydet(yeni);
    uygula(yeni, true);
    return yeni;
  }

  /** Hesaplanmış token değeri: `renk('--pos')` → '#0ecb81'. */
  function renk(token, yedek) {
    if (!doc) return yedek || '';
    const v = global.getComputedStyle(doc.documentElement).getPropertyValue(token).trim();
    return v || yedek || '';
  }

  /** 'var(--x)' içeren dizeyi çözer; değilse aynen döndürür. */
  function coz(deger) {
    if (typeof deger !== 'string') return deger;
    const m = deger.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/);
    return m ? renk(m[1], m[2] && m[2].trim()) : deger;
  }

  /**
   * Rengi saydamlaştırır (#rgb, #rrggbb, rgb(), rgba()) — grafik dolguları.
   * Tanınmayan biçimde rengi değiştirmeden döndürür.
   */
  function alfa(c, a) {
    c = coz(c);
    if (typeof c !== 'string') return c;
    let r, g, b;
    let m = c.match(/^#([0-9a-f]{3})$/i);
    if (m) { [r, g, b] = m[1].split('').map(x => parseInt(x + x, 16)); }
    else if ((m = c.match(/^#([0-9a-f]{6})$/i))) {
      r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16);
    } else if ((m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i))) {
      r = +m[1]; g = +m[2]; b = +m[3];
    } else return c;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  /** Grafiklerin ortak paleti — her çağrıda O ANKİ temadan okunur. */
  function palet() {
    return {
      bg: renk('--chart-bg', '#ffffff'),
      grid: renk('--chart-grid', 'rgba(27,36,48,0.06)'),
      text: renk('--chart-text', '#5e6673'),
      border: renk('--border', '#e2ded5'),
      strong: renk('--text-strong', '#111821'),
      soft: renk('--text-soft', '#3f4853'),
      muted: renk('--text-muted', '#5e6673'),
      accent: renk('--accent', '#1f6f63'),
      pos: renk('--pos', '#1f7a4d'),
      neg: renk('--neg', '#b4432f'),
      warn: renk('--warn', '#9a6212'),
      info: renk('--info', '#3b6fb6'),
      // Grafik dili (§4a/4): portföy · ikinci seri · kıyas (gri) · güven bandı · kriz gölgesi · altın
      seri1: renk('--chart-1', '#1f6f63'),
      seri2: renk('--chart-2', '#3b6fb6'),
      notr: renk('--chart-notr', '#8a909a'),
      bant: renk('--chart-bant', 'rgba(31,111,99,0.14)'),
      kriz: renk('--chart-kriz', 'rgba(201,138,43,0.16)'),
      altin: renk('--gold', '#c98a2b')
    };
  }

  /* ── Düğme ──────────────────────────────────────────────────────────── */
  function dugmeleriGuncelle() {
    if (!doc) return;
    const acik = etkin() === 'light';
    doc.querySelectorAll('[data-theme-toggle]').forEach(d => {
      d.setAttribute('aria-pressed', acik ? 'true' : 'false');
      const etiket = acik ? 'Koyu temaya geç' : 'Açık temaya geç';
      d.setAttribute('aria-label', etiket);
      d.setAttribute('title', etiket);
    });
  }

  function dugmeleriBagla() {
    doc.querySelectorAll('[data-theme-toggle]').forEach(d => {
      if (d.__temaBagli) return;
      d.__temaBagli = true;
      d.addEventListener('click', degistir);
    });
    dugmeleriGuncelle();
  }

  /* ── Açılış ─────────────────────────────────────────────────────────── */
  if (doc) {
    uygula(kayitliOku() || sistemTemasi(), false);

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', dugmeleriBagla);
    else dugmeleriBagla();
  }

  AG.tema = { etkin, degistir, renk, coz, alfa, palet };

  if (typeof module !== 'undefined' && module.exports) module.exports = AG.tema;
})(typeof window !== 'undefined' ? window : globalThis);
