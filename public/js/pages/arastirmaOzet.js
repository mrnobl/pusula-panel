/**
 * ARAŞTIRMA › ÖZET — yeni panel F5 (PLAN-PANEL-YENI §2; denetim 2 §1.3 "Araştırma'nın giriş ekranı yok") `AG.pages.arastirmaOzet`
 * ═══════════════════════════════════════════════════════════════════════════
 * Araştırma defterinden (GET /api/defter — lib/defter.js ozet) salt okunur özet: deneme sayacı ve durumlar · hükmü yaklaşanlar ·
 * son kayıtlar · en çok denenen aileler · araştırmanın öbür sayfalarına kısayollar. Yazma yok; yeni kayıt Araştırma defterinde.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const tr = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('tr-TR') : '—');
  const DURUM_AD = { RED: 'RED', KABUL: 'KABUL', GOLGE: 'gölge', ACIK: 'açık', BILGI: 'bilgi', BOS: 'boş', BELGESIZ: 'belgesiz' };
  const DURUM_TON = { RED: 'neg', KABUL: 'pos', GOLGE: 'vurgu', ACIK: 'warn', BILGI: 'info' };
  const aralik = (a) => (Array.isArray(a) ? (a[0] === a[1] ? String(a[0]) : `${a[0]}–${a[1]}`) : '—');

  /** Saf: defter görünümü → ekran modeli (test edilir). */
  function model(v) {
    const o = (v && v.ozet) || {};
    const d = o.durumlar || {};
    const kayitlar = ((v && v.kayitlar) || []).filter(k => k && Array.isArray(k.aralik));
    const son = kayitlar.slice().sort((a, b) => b.aralik[1] - a.aralik[1]).slice(0, 6);
    return {
      gostergeler: [
        { etiket: 'Toplam deneme', deger: tr(o.toplam), alt: `en yüksek numara ${tr(o.enYuksekNumara)} · ${tr(o.kayitSayisi)} kayıt` },
        { etiket: 'Kabul', deger: tr(d.KABUL), alt: 'ileri teste ya da kullanıma geçti', ton: 'p-pos' },
        { etiket: 'Red', deger: tr(d.RED), alt: 'kenar bulunamadı', ton: 'p-neg' },
        { etiket: 'Süren (gölge + açık)', deger: tr((d.GOLGE || 0) + (d.ACIK || 0)), alt: `${(o.yaklasanlar || []).length} tanesinin hüküm günü belli` }
      ],
      yaklasanlar: (o.yaklasanlar || []).slice(0, 6),
      son,
      aileler: (o.aileler || []).slice(0, 8)
    };
  }

  function ciz(v) {
    const k = bul('arOzetKok');
    if (!k) return;
    const m = model(v);
    const rozet = (durum) => el('span', { class: `p-rozet${DURUM_TON[durum] ? ' p-rozet-' + DURUM_TON[durum] : ''}`, text: DURUM_AD[durum] || String(durum || '?') });
    const tablo = (basliklar, satirlar) => AG.tablo.kutulu({ sinif: 'p-tablo', basliklar, satirlar }, 'p-tablo-kap');
    const bag = (yol, ad) => el('a', { class: 'p-dugme no-underline', href: `#/${yol}`, text: ad });
    doldur(k, [
      el('div', { class: 'p-serit mb-4' }, m.gostergeler.map(g => el('div', { class: 'p-gosterge' }, [
        el('p', { class: 'p-gosterge-etiket' }, [el('span', { text: g.etiket })]),
        el('p', { class: `p-gosterge-deger${g.ton ? ' ' + g.ton : ''}`, text: g.deger }),
        el('p', { class: 'p-gosterge-alt', text: g.alt })
      ]))),
      el('div', { class: 'pn-ikili mb-4' }, [
        el('section', { class: 'p-kart' }, [
          el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Hükmü yaklaşanlar' }), el('a', { href: '#/ileri/genel', class: 'no-underline', text: 'İleri test →' })]),
          m.yaklasanlar.length ? tablo(['Deneme', 'Konu', 'Durum', 'Hüküm', 'Kalan'], m.yaklasanlar.map(y => el('tr', null, [
            el('td', { class: 'p-sayi', text: aralik(y.aralik) }), el('td', { text: y.baslik || y.aileAd || y.aile || '—' }), el('td', null, [rozet(y.durum)]),
            el('td', { class: 'p-sayi', text: AG.fmt.tarih(y.hukumTarihi) }), el('td', { class: 'p-sayi', text: typeof y.kalanGun === 'number' ? `${tr(y.kalanGun)} gün` : '—' })
          ]))) : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: 'Hüküm günü belli süren deneme yok.' })])
        ]),
        el('section', { class: 'p-kart' }, [
          el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'En çok denenen aileler' })]),
          m.aileler.length ? el('ul', { class: 'pn-yapilacak' }, m.aileler.map(a => el('li', null, [
            el('span', { text: a.aileAd || a.aile }), el('span', { class: 'p-sayi pn-soluk', text: `${tr(a.adet)} deneme` })
          ]))) : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: 'Defter boş.' })])
        ])
      ]),
      el('section', { class: 'p-kart mb-4' }, [
        el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Son kayıtlar' }), el('a', { href: '#/arastirma/defter', class: 'no-underline', text: 'Araştırma defteri →' })]),
        m.son.length ? tablo(['Deneme', 'Konu', 'Durum'], m.son.map(x => el('tr', null, [
          el('td', { class: 'p-sayi', text: aralik(x.aralik) }), el('td', { text: x.baslik || x.aileAd || x.aile || '—' }), el('td', null, [rozet(x.durum)])
        ]))) : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: 'Defter henüz aktarılmadı.' })])
      ]),
      el('div', { class: 'pn-cipler' }, [bag('arastirma/stratejiler', 'Stratejiler'), bag('arastirma/backtest', 'Backtest'), bag('arastirma/laboratuvar', 'Portföy laboratuvarı'), bag('kitapcik', 'Kitapçık')])
    ]);
  }

  async function yukle() {
    const k = bul('arOzetKok');
    if (!k) return;
    try {
      const v = await AG.api.defter.liste();
      if (!v || !v.success) throw new Error((v && v.error) || 'defter okunamadı');
      ciz(v);
    } catch (e) { doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'Araştırma defteri okunamadı', yeniden: yukle })]); }
  }

  if (doc && doc.addEventListener) doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-arastirma-ozet') yukle(); });

  AG.pages = AG.pages || {};
  AG.pages.arastirmaOzet = { yukle, ciz, model };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.arastirmaOzet;
})(typeof window !== 'undefined' ? window : globalThis);
