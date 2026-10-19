/**
 * HÜCUM / DENGE — BACKTEST SONUCUNDA botun tamamı:
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. BACKTEST SONUCU (`sonucKutusu`): strateji `hucum`/`denge` ise, standart
 *    motorun BTC ayağı koşusunun (grafik, işlem listesi, metrikler — diğer
 *    stratejilerle aynı ekran) yanında, botun TAMAMININ (Kalkan kolu ×3, 15 coin —
 *    tek grafiğe çizilemez) aynı tarih aralığındaki ölçümü. Kaynak
 *    `sonuc.bindirmeEk` (lib/backtest/isci.js → lib/research/bindirme.js
 *    `bindirmeAralik`). Açılır kutu: standart sonuçla karışmasın diye ayrı ve
 *    açıkça etiketli.
 * 2. BOTLAR ekranındaki canlı bot kartları artık js/pages/botlar.js'te (Pusula P2).
 *
 * Tüm DOM `AG.dom.el`; renkler `AG.tema.palet()`.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const { el, doldur, bul } = AG.dom;

  let grafik = null;
  let sonEk = null;

  // tr-TR (B-27): "−%35,6"; ekranda 0 görünen eksi değer işaretsiz.
  const yuzde = (x, b = 1) => {
    if (x == null || Number.isNaN(+x)) return '—';
    const y = Math.round(+x * 100 * Math.pow(10, b));
    return `${y < 0 ? '−' : ''}%${Math.abs(x * 100).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b })}`;
  };
  const isaretli = (x, b = 1) => (x == null ? '—' : `${x > 0 ? '+' : ''}${yuzde(x, b)}`);
  const sayi = (x, b = 2) => (x == null || Number.isNaN(+x) ? '—' : (+x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b }));
  const ton = (x) => (x == null ? '' : x >= 0 ? 'tone-success' : 'tone-danger');

  const tablo = (basliklar, satirlar) => AG.tablo.kutulu({ basliklar, satirlar });
  const tonla = (tr, i, sinif) => { if (tr.children[i] && sinif) tr.children[i].className = sinif; return tr; };

  // ── 1. BACKTEST SONUCU: botun tamamı ───────────────────────────────────────
  function sonucKutusu(res) {
    const kutu = bul('btBindirmeEk');
    if (!kutu) return;
    const ek = res && res.bindirmeEk;
    if (!ek) { AG.dom.bosalt(kutu); kutu.classList.add('is-hidden'); sonEk = null; if (grafik) { grafik.destroy(); grafik = null; } return; }
    kutu.classList.remove('is-hidden');
    if (ek.hata) { doldur(kutu, [el('div', { class: 'trace-note trace-note-warn', text: ek.hata })]); return; }
    const k = ek.kapsam || {};
    const notlar = (k.not || []).map(n => el('div', { class: 'trace-note trace-note-warn mb-2', text: `⚠️ ${n}` }));
    const baslik = `Botun tamamı — ${ek.ad} (Kalkan kolu ×3 dahil, 15 coin — tek grafiğe çizilemez)`;
    if (ek.yok) {
      doldur(kutu, [el('div', { class: 'sunken-panel panel-pad' }, [el('strong', { text: baslik }), ...notlar])]);
      return;
    }
    const S = ek.strateji.metrik, A = ek.btcAyagi.metrik, T = ek.alTut.metrik;
    const satir = (ad, m, ek2 = {}) => tonla(AG.dom.satir([ad, yuzde(m.cagr), yuzde(m.holdout), yuzde(m.maxDD), m.enKotuGunIci == null ? '—' : yuzde(m.enKotuGunIci), sayi(m.sharpe), yuzde(m.toplam, 0)], ek2), 1, ton(m.cagr));
    const yillar = ek.alTut.yillik.map(y => y.yil);
    const yBul = (l, y) => { const x = (l || []).find(a => a.yil === y); return x ? x.getiri : null; };
    const yillik = yillar.map(y => { const d = [yBul(ek.strateji.yillik, y), yBul(ek.btcAyagi.yillik, y), yBul(ek.alTut.yillik, y)]; const tr = AG.dom.satir([String(y), ...d.map(x => isaretli(x, 0))]); d.forEach((x, i) => tonla(tr, i + 1, ton(x))); return tr; });

    const detay = el('details', { class: 'sunken-panel panel-pad', ontoggle: () => { if (detay.open) grafikCiz(); } }, [
      el('summary', { class: 'clickable' }, [
        el('strong', { text: baslik }),
        el('span', { class: 'mono-note', text: `  ·  ${k.bas} → ${k.bit}  ·  ayrıntı, grafik ve yıllık tablo (aç / kapat)` })
      ]),
      el('p', { class: 'hint hint-sm mt-3 mb-3', text: 'AYRI ÖLÇÜM — bu kutunun dışındaki standart sonuç (grafik, işlemler, metrikler) yalnız BTC ayağıdır. Bu kutu botun tamamını araştırma simülasyonundan (tek USDⓈ-M hesap, BTC teminat %95, kol ×3 pozisyon düzeyinde PIT, gerçek funding, maliyetler dahil) aynı tarih aralığında gösterir. Eğriler 1\'den başlar.' }),
      ...notlar,
      el('div', { class: 'canvas-box canvas-260 mb-5' }, [el('canvas', { id: 'btBindirmeGrafik', role: 'img', 'aria-label': 'Botun tamamı, BTC ayağı ve BTC al-tut eğrileri (log ölçek)' })]),
      tablo(['Koşu', 'Yıllık (CAGR)', 'Holdout (2024 →)', 'En büyük düşüş', 'Gün içi en kötü', 'Sharpe', 'Toplam'], [
        satir(`Botun tamamı — ${ek.ad} (kol ×3 dahil)`, S, { class: 'row-best' }),
        satir('BTC ayağı (araştırma: ertesi gün açılış, %0,12/yön, %100)', A),
        satir('BTC al-tut', T)
      ]),
      el('p', { class: 'hint hint-sm mt-3 mb-5', text: `Gün içi en kötü: hesabın gün içi kötümser değeri (tüm diplerin aynı anda). Tasfiye: ${S.tasfiye == null ? '—' : S.tasfiye}. Standart koşunun BTC ayağı ile araştırmanın BTC ayağı arasındaki küçük fark: motor sinyal gününün KAPANIŞINDA %0,15 komisyonla doldurur, araştırma ve Pine ertesi gün AÇILIŞINDA %0,12 ile (TradingView işlem tarihleri bu yüzden bir gün sonra görünür). Piyasa = Vadeli seçilirse motor gerçek funding da öder (long için yılda ~%10) ve fark büyür — Pine ile kıyas için Piyasa = Spot seçin.` }),
      el('div', { class: 'bt-metric-label mb-2', text: 'Yıllık getiri' }),
      tablo(['Yıl', `Botun tamamı (${ek.ad})`, 'BTC ayağı', 'BTC al-tut'], yillik)
    ]);
    doldur(kutu, [...anaSayilar(ek), detay,
      el('div', { class: 'bt-metric-label mt-5', text: `Aşağıdaki sayılar ve grafik yalnız BTC AYAĞI (botun BTC işlemleri; Kalkan kolu hariç) — ${ek.ad}'un sonucu yukarıdaki satırdır.` })]);
    sonEk = ek;
  }

  /**
   * B-28 (61.1): Hücum/Denge seçiliyken ÖNE ÇIKAN sayılar botun TAMAMI. Eskiden büyük kartlar yalnız BTC
   * ayağını gösteriyordu (ör. −%4,9, al-tut'a göre −127 puan) ve "Hücum kaybettiriyor" okunuyordu;
   * botun tamamı (CAGR %19,9) kapalı kutunun başlığında küçük kalıyordu. Saf: veri → öğeler.
   */
  function anaSayilar(ek) {
    const S = ek.strateji.metrik, T = ek.alTut.metrik;
    const kutu = (baslik, deger, alt, tonSinif) => el('div', { class: 'ana-sayi' }, [
      el('span', { class: 'stat-title', text: baslik }),
      el('span', { class: `stat-value stat-value-sm sayi ${tonSinif || ''}`.trim(), text: deger }),
      alt ? el('span', { class: 'hint hint-sm mb-0 sayi', text: alt }) : null
    ]);
    const fark = S.toplam != null && T.toplam != null ? (S.toplam - T.toplam) * 100 : null;
    return [
      el('div', { class: 'bt-metric-label mb-2', text: `Botun tamamı — ${ek.ad} (Kalkan kolu ×3 dahil): asıl sonuç` }),
      el('div', { class: 'ana-sayilar mb-5', id: 'btBindirmeAnaSayilar' }, [
        kutu('Yıllık bileşik (CAGR)', yuzde(S.cagr), `BTC al-tut ${yuzde(T.cagr)}`, ton(S.cagr)),
        kutu('Toplam getiri', yuzde(S.toplam, 0), fark == null ? null : `al-tut'a göre ${fark >= 0 ? '+' : '−'}${Math.abs(fark).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} puan`, ton(S.toplam)),
        kutu('En büyük düşüş', yuzde(-Math.abs(S.maxDD)), `al-tut ${yuzde(-Math.abs(T.maxDD))}`, 'tone-danger'),
        kutu('Sharpe', sayi(S.sharpe), `al-tut ${sayi(T.sharpe)}`)
      ])
    ];
  }

  function grafikCiz() {
    const tuval = bul('btBindirmeGrafik');
    if (!tuval || !sonEk || typeof global.Chart === 'undefined') return;
    if (grafik) { grafik.destroy(); grafik = null; }
    const p = AG.tema.palet();
    const ds = (label, egri, renk, ek = {}) => ({ label, data: egri.map(x => x.oz), borderColor: renk, borderWidth: 1.6, pointRadius: 0, tension: 0.05, ...ek });
    grafik = new global.Chart(tuval.getContext('2d'), {
      type: 'line',
      data: { labels: sonEk.strateji.egri.map(x => x.t), datasets: [
        ds(`Botun tamamı (${sonEk.ad})`, sonEk.strateji.egri, p.accent, { borderWidth: 2 }),
        ds('BTC ayağı', sonEk.btcAyagi.egri, p.warn),
        ds('BTC al-tut', sonEk.alTut.egri, p.muted, { borderDash: [4, 3] })
      ] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: p.text } } },
        scales: { x: { grid: { color: p.grid }, ticks: { color: p.text, maxTicksLimit: 8 } }, y: { type: 'logarithmic', grid: { color: p.grid }, ticks: { color: p.text } } } }
    });
  }
  global.document.addEventListener('ag:tema', () => grafikCiz());

  AG.pages = AG.pages || {};
  AG.pages.bindirme = { sonucKutusu, grafikCiz, anaSayilar, yuzde };
})(typeof window !== 'undefined' ? window : globalThis);
