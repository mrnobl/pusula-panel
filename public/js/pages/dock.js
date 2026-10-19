/**
 * KÂĞIT TEST HESABI AYRINTILARI — bakiye geçmişi · varlıklar · günlük (eski hesap dock'u)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Araştırma › Kâğıt test ekranında. Bakiye geçmişi · Varlıklar · Günlük. Hepsi saf
 * VERİ → TABLO dönüşümü: DOM'dan bir şey okumazlar, durum tutmazlar.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NEDEN `innerHTML` DEĞİL
 * ───────────────────────────────────────────────────────────────────────────
 * Bu dört tablo `app.js` içinde metin birleştirmeyle kuruluyordu ve sekiz
 * `innerHTML` ataması buradaydı. İki somut bedeli vardı:
 *
 *   1. **Kaçış yok.** `item.details`, `o.symbol`, `o.status` sunucudan
 *      geliyor ve doğrudan işaretlemeye yazılıyordu. `textContent` ile
 *      kurulan bir hücrede bu sorun tanım gereği yok.
 *   2. **Tırnak kırılması.** Kapat düğmesi `onclick="closeDockPosition('
 *      ${p.symbol}')"` diye yazılıyordu; sembolde tek tırnak olsa işaretleme
 *      bozulurdu. Artık gerçek bir olay dinleyicisi bağlanıyor.
 *
 * Sunum kararları da sınıflara taşındı: satırlarda inline `style` yok.
 *
 * ⚠ Bu dosya DOM kurar ama SUNUCUYA GİTMEZ ve durum tutmaz — veriyi çağıran
 * verir. Böylece `scripts/panel-dock-testi.js` tarayıcısız sınayabiliyor.
 */
(function (global) {
  'use strict';

  const AG = global.AG || (global.AG = {});
  const dom = AG.dom;
  const fmt = AG.fmt;
  const el = (t, p, c) => dom.el(t, p, c);

  /** "Kayıt yok" satırı — sütun sayısı tabloya göre değişir. */
  function bosSatir(sutun, metin) {
    return el('tr', null, [
      el('td', { colspan: String(sutun), class: 'text-center tone-muted empty-cell', text: metin })
    ]);
  }

  /** Kâr-zarar hücresi: işaretli değer + tona göre renk. */
  const kzHucre = (metin, deger) =>
    el('td', { class: `fw-bold ${fmt.tonSinifi(deger)}`, text: metin });

  /*
   * Pozisyon · açık emir · emir geçmişi tabloları Pusula P3'te (sürüm 59.8) KALKTI: kâğıt motorun
   * pozisyon ve emirleri Hesaplar ekranının tek pozisyon / tek emir-işlem tablosunda ("Kâğıt test"
   * kaynağı, js/pages/hesaplar.js + lib/hesaplar.js). TP/SL orada da uydurulmaz: yalnız pozisyonun
   * taşıdığı zarar durdur seviyesi "koruma emri" sütununda görünür.
   */

  /* ── 1. Bakiye geçmişi ──────────────────────────────────────────────── */
  function bakiyeGecmisi(items) {
    const tbody = global.document.querySelector('#tblDockBalanceHistory tbody');
    if (!tbody) return;

    if (!items || items.length === 0) {
      dom.doldur(tbody, [bosSatir(5, 'Bakiye değişim kaydı bulunmuyor.')]);
      return;
    }

    const para = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 });

    const satirlar = items.map(item => {
      const pnl = item.pnl || 0;
      return el('tr', null, [
        el('td', { class: 'cell-sm', text: item.timestamp }),
        el('td', { text: `$${para(item.prevBalance)}` }),
        el('td', null, [el('strong', { text: `$${para(item.newBalance)}` })]),
        kzHucre(`${pnl >= 0 ? '+' : ''}$${para(pnl)}`, pnl),
        el('td', { class: 'cell-soft', text: item.details })
      ]);
    });

    dom.doldur(tbody, satirlar);
  }

  /* ── 2. Varlıklar (cüzdan dökümü) ───────────────────────────────────── */
  /**
   * @param bakiyeler  state.balances.balances ({ USDT: 1000, BTC: 0.1 … }) — yoksa null
   * @param tickerlar  state.tickerMap ({ 'BTC/USDT': { last } })
   * Fiyatı bilinmeyen varlıkta değer UYDURULMAZ: "—".
   */
  function varliklar(bakiyeler, tickerlar) {
    const tbody = global.document.querySelector('#tblDockAssets tbody');
    if (!tbody) return;
    if (!bakiyeler || !Object.keys(bakiyeler).length) {
      dom.doldur(tbody, [bosSatir(4, 'Bakiye verisi bekleniyor…')]);
      return;
    }
    const para = (n) => '$' + Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    dom.doldur(tbody, Object.keys(bakiyeler).map(coin => {
      const miktar = Number(bakiyeler[coin]) || 0;
      let fiyat = 1;
      if (coin !== 'USDT') {
        const t = (tickerlar || {})[`${coin}/USDT`];
        fiyat = t && Number.isFinite(Number(t.last)) ? Number(t.last) : null;
      }
      return el('tr', null, [
        el('td', null, [el('strong', { text: coin })]),
        el('td', { text: miktar.toFixed(4) }),
        el('td', { text: fiyat === null ? '—' : para(fiyat) }),
        el('td', { text: fiyat === null ? '—' : para(miktar * fiyat) })
      ]);
    }));
  }

  /* ── 3. İşlem günlüğü ───────────────────────────────────────────────── */
  function kayitlar(logs) {
    const kap = global.document.getElementById('dockLogTerminal');
    if (!kap || !logs) return;

    /**
     * `l.message` sunucudan gelen SERBEST METİNDİR — strateji adı, hata
     * gövdesi, sembol. Metin birleştirmeyle yazıldığında işaretleme olarak
     * yorumlanıyordu; burada metin metin kalıyor.
     */
    dom.doldur(kap, logs.map(l => el('div', { class: 'log-item' }, [
      el('span', { class: 'log-time', text: `[${l.timestamp}]` }),
      el('span', { class: `log-level ${l.level}`, text: l.level }),
      el('span', { class: 'log-msg', text: l.message })
    ])));

    kap.scrollTop = 0;
  }

  AG.pages = AG.pages || {};
  AG.pages.dock = { bakiyeGecmisi, varliklar, kayitlar, bosSatir };

  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.dock;
})(typeof window !== 'undefined' ? window : globalThis);
