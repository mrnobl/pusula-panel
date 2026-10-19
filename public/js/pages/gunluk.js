/**
 * SİSTEM › GÜNLÜKLER — PLAN-PANEL-2 §0.4 (kullanıcı kararı 2026-10-19) `AG.pages.gunluk`
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/gunluk (lib/gunluk.js): son 24 saat özeti (hata · uyarı · olay · sunucu açık) + süzülebilir kayıt (seviye, kaynak,
 * zaman, arama) + CSV. Salt okuma; geliştirme bilgisayarında sunucunun günlüğü gelir (lib/evOkuma.js EV_YOLU).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const tr = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('tr-TR') : '—');

  const SEVIYE_AD = { hata: 'hata', uyari: 'uyarı', islem: 'işlem', basari: 'başarı', bilgi: 'bilgi' };
  const SEVIYE_TON = { hata: 'neg', uyari: 'warn', islem: 'info', basari: 'pos', bilgi: '' };
  const ZAMANLAR = [['24', 'Son 24 saat'], ['72', 'Son 3 gün'], ['168', 'Son 7 gün'], ['720', 'Son 30 gün']];
  const SEVIYE_SECENEK = [['', 'Hepsi'], ['uyari+', 'Uyarı ve üstü'], ['hata', 'Yalnız hata'], ['islem', 'İşlemler']];
  const suzgec = { seviye: '', kaynak: '', saat: '24', ara: '' };
  let veri = null;
  let araZaman = null;

  /** 2026-10-19T03:03:12.000Z → "19.10 06:03:12" (yerel saat). */
  function zaman(iso) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '—';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  /** 273000 sn → "3 g 3 s" */
  function sure(sn) {
    if (typeof sn !== 'number' || !Number.isFinite(sn)) return '—';
    const g = Math.floor(sn / 86400), s = Math.floor((sn % 86400) / 3600), d = Math.floor((sn % 3600) / 60);
    return g ? `${g} g ${s} s` : s ? `${s} s ${d} dk` : `${d} dk`;
  }

  /** Saf: API yanıtı → özet kartları (test edilir). */
  function ozetModeli(v) {
    const o = (v && v.ozet) || {};
    const s = o.sayilar || {};
    const ilk = (l) => (l && l.length ? l.slice(0, 2).map(x => `${x.ad} ${x.adet}`).join(' · ') : 'yok');
    return [
      { etiket: 'Son 24 saat · hata', deger: tr(s.hata || 0), alt: s.hata ? ilk(o.hataKaynak) : 'sorun yok', ton: s.hata ? 'p-neg' : 'p-pos' },
      { etiket: 'Son 24 saat · uyarı', deger: tr(s.uyari || 0), alt: s.uyari ? ilk(o.uyariKaynak) : 'yok', ton: s.uyari ? 'p-warn' : '' },
      { etiket: 'Son 24 saat · olay', deger: tr(o.olay || 0), alt: `${tr(s.islem || 0)} işlem · ${tr((s.bilgi || 0) + (s.basari || 0))} bilgi` },
      { etiket: 'Sunucu açık', deger: sure(v && v.sunucuAcikSn), alt: v && v.evKaynak ? 'sunucudaki kayıt' : 'bu bilgisayar' },
    ];
  }

  function secim(id, etiket, secenekler, deger, f) {
    const s = el('select', { id, class: 'form-control', onchange: (e) => f(e.target.value) }, secenekler.map(([k, ad]) => el('option', { value: k, text: ad })));
    s.value = deger;
    return el('label', { class: 'form-group gl-alan' }, [el('span', { text: etiket }), s]);
  }

  function ciz() {
    const k = bul('gunlukKok');
    if (!k || !veri) return;
    const kaynaklar = [['', 'Hepsi'], ...((veri.kaynaklar || []).map(x => [x, x]))];
    const ara = el('input', { id: 'inpGunlukAra', type: 'search', class: 'form-control', placeholder: 'ör. kaldıraç, BTC, 429', value: suzgec.ara,
      oninput: (e) => { suzgec.ara = e.target.value; if (araZaman) global.clearTimeout(araZaman); araZaman = global.setTimeout(yukle, 350); } });
    const l = veri.kayitlar || [];
    doldur(k, [
      el('div', { class: 'p-serit mb-4', id: 'gunlukOzet' }, ozetModeli(veri).map(g => el('div', { class: 'p-gosterge' }, [
        el('p', { class: 'p-gosterge-etiket' }, [el('span', { text: g.etiket })]),
        el('p', { class: `p-gosterge-deger${g.ton ? ' ' + g.ton : ''}`, text: g.deger }),
        el('p', { class: 'p-gosterge-alt', text: g.alt }),
      ]))),
      el('div', { class: 'gl-suzgec mb-4', id: 'gunlukSuzgec' }, [
        secim('selGunlukSeviye', 'Seviye', SEVIYE_SECENEK, suzgec.seviye, (x) => { suzgec.seviye = x; yukle(); }),
        secim('selGunlukKaynak', 'Kaynak', kaynaklar, suzgec.kaynak, (x) => { suzgec.kaynak = x; yukle(); }),
        secim('selGunlukZaman', 'Zaman', ZAMANLAR, suzgec.saat, (x) => { suzgec.saat = x; yukle(); }),
        el('label', { class: 'form-group gl-alan gl-ara' }, [el('span', { text: 'Ara' }), ara]),
        el('a', { class: 'btn btn-secondary gl-disa no-underline', id: 'lnkGunlukCsv', href: AG.api.gunluk.csvYolu(sorgu()), download: '' }, [el('span', { text: 'Dışa aktar (CSV)' })]),
      ]),
      el('section', { class: 'p-kart', id: 'gunlukListe' }, [
        el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: `Kayıtlar (${tr(veri.toplam || 0)})` }),
          veri.kesildi ? el('span', { class: 'df-soluk', text: `ilk ${tr(l.length)} gösteriliyor — süzgeci daraltın` }) : null]),
        l.length ? AG.tablo.kutulu({ id: 'tblGunluk', sinif: 'p-tablo gl-tablo', basliklar: ['Zaman', 'Seviye', 'Kaynak', 'Ne oldu'],
          satirlar: l.map(x => el('tr', { class: x.s === 'hata' ? 'gl-hata' : null }, [
            el('td', { class: 'sayi gl-zaman', text: zaman(x.t) }),
            el('td', null, [el('span', { class: `p-rozet${SEVIYE_TON[x.s] ? ' p-rozet-' + SEVIYE_TON[x.s] : ''}`, text: SEVIYE_AD[x.s] || x.s })]),
            el('td', { class: 'df-soluk', text: x.b ? `${x.k} · ${x.b}` : x.k }),
            el('td', { class: 'gl-mesaj', text: x.m }),
          ])) }, 'p-tablo-kap')
          : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: 'Bu süzgece uyan kayıt yok.' })]),
      ]),
    ]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  function sorgu() {
    const q = {};
    for (const [a, v] of Object.entries(suzgec)) if (v) q[a] = v;
    return q;
  }

  async function yukle() {
    const k = bul('gunlukKok');
    if (!k) return;
    let r;
    try { r = await AG.api.gunluk.liste(sorgu()); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(k, [AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Günlük okunamadı', yeniden: yukle })]); return; }
    veri = r;
    const odak = doc && doc.activeElement ? doc.activeElement.id : null;
    ciz();
    if (odak) { const x = bul(odak); if (x && x.focus) { x.focus(); if (odak === 'inpGunlukAra' && x.setSelectionRange) x.setSelectionRange(x.value.length, x.value.length); } }
  }

  if (doc && doc.addEventListener) doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-gunluk') yukle(); });

  AG.pages = AG.pages || {};
  AG.pages.gunluk = { yukle, ozetModeli, zaman, sure, _durum: { suzgec, veriAyarla: (v) => { veri = v; } }, _ciz: { ciz } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.gunluk;
})(typeof window !== 'undefined' ? window : globalThis);
