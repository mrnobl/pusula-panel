/**
 * GÜNLÜK › RAPORLAR › HAFTALIK KARNE — D2 (TASARIM-MAKINE-HESAP-BOT §8.3, PLAN-MAKINE-HESAP-BOT §8 s3) `AG.pages.karne`
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/karne (lib/karne.js): geçen haftanın (pazartesi–pazar) karnesi — her bot için getiri, aynı haftada BTC, BTC'ye fark, en büyük
 * düşüş, tepeden düşüş, işlem sayısı, durum; portföy; sorunlar; ileri test (Kairos demo kabulü + gölge satırları, hüküm yok).
 * Haftalar arasında ‹ ›; "Bu hafta (sürüyor)" o ana kadarki önizleme. Pazartesi 09:00'dan sonra aynı karne Telegram'a TEK mesaj (yalnız yüzde).
 * SALT OKUMA. Geliştirme bilgisayarında sunucunun karnesi gelir (lib/evOkuma EV_YOLU).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const trS = (x, b = 1) => Number(x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b });
  /** Saf: 0,021 → "+%2,1" (sunucunun Telegram metniyle aynı). */
  function yuzde(x) {
    if (!sayiMi(x)) return '—';
    const r = Math.abs(x) * 100;
    if (Number(r.toFixed(1)) === 0) return '%0,0';
    return `${x < 0 ? '−' : '+'}%${trS(r)}`;
  }
  function puan(x) {
    if (!sayiMi(x)) return '—';
    const r = Math.abs(x) * 100;
    if (Number(r.toFixed(1)) === 0) return '0,0 puan';
    return `${x < 0 ? '−' : '+'}${trS(r)} puan`;
  }
  const ton = (x) => (sayiMi(x) && Math.abs(x) > 1e-9 ? (x > 0 ? 'p-pos' : 'p-neg') : '');
  const gunTr = (g) => (g ? `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}` : '—');
  const botAdi = (b) => (b && AG.botAd && AG.botAd.ad(b.ad)) || (b && b.adGorunen) || (b && b.ad) || '';
  const DURUM = { calisiyor: ['çalışıyor', 'pos'], durdu: ['durdu', 'warn'], engel: ['ENGEL', 'neg'] };
  const MOD = { demo: 'demo', kagit: 'kâğıt', canli: 'canlı hesap' };
  let veri = null;
  let secili = '';   // '' = son biten hafta · 'bu' · 'AAAA-AA-GG'

  /** Saf: komşu hafta pazartesisi (n = ±1). */
  function komsu(bas, n) {
    const d = new Date(`${bas}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7 * n);
    return d.toISOString().slice(0, 10);
  }
  /** Saf: karne → dört gösterge. */
  function gostergeler(k) {
    const b = (k && k.botlar) || [];
    const getirili = b.filter(x => sayiMi(x.getiri));
    const enIyi = getirili.slice().sort((x, y) => y.getiri - x.getiri)[0] || null;
    const s = (k && k.sorunlar && k.sorunlar.sayac) || null;
    return [
      { etiket: 'BTC bu hafta', deger: yuzde(k && k.btc), ton: ton(k && k.btc), alt: 'aynı haftada al-tut' },
      { etiket: 'En iyi bot', deger: enIyi ? yuzde(enIyi.getiri) : '—', ton: enIyi ? ton(enIyi.getiri) : '', alt: enIyi ? `${botAdi(enIyi)} · BTC'ye fark ${puan(enIyi.fark)}` : 'bu hafta veri yok' },
      { etiket: 'İşlem', deger: String(b.reduce((a, x) => a + (x.islem || 0), 0)), alt: `${b.length} bot` },
      { etiket: 'Sorunlar (şu an)', deger: s ? String((s.mudahale || 0) + (s.dikkat || 0)) : '—', ton: s && (s.mudahale || s.dikkat) ? 'p-warn' : 'p-pos',
        alt: s ? `${s.mudahale || 0} müdahale · ${s.dikkat || 0} dikkat${k.olaylar ? ` · haftada ${k.olaylar.alarm || 0} alarm` : ''}` : 'okunamadı' },
    ];
  }

  function ciz() {
    const k = bul('karneKok');
    if (!k || !veri || !veri.karne) return;
    const kr = veri.karne;
    const h = kr.hafta || {};
    const bas = h.bas;
    const ileriVar = veri.buHafta && bas < veri.buHafta;
    const pf = kr.portfoy || {};
    const pfParca = [pf.portfoyum != null ? `Portföyüm ${yuzde(pf.portfoyum)}` : null, ...((pf.modeller || []).map(m => `${(AG.botAd && AG.botAd.ad(m.id)) || m.ad} ${yuzde(m.getiri)}${m.para === 'TRY' ? ' (TL)' : ''}`))].filter(Boolean);
    const d = kr.ileri && kr.ileri.demo;
    doldur(k, [
      el('section', { class: 'p-kart mb-4', id: 'karneKart' }, [
        el('div', { class: 'p-kart-bas' }, [
          el('h3', { class: 'p-kart-baslik', text: `Haftalık karne — ${gunTr(h.bas)} – ${gunTr(h.bit)}` }),
          el('span', { class: `p-rozet${veri.suruyor ? ' p-rozet-warn' : veri.onizleme ? ' p-rozet-info' : ''}`, text: veri.suruyor ? 'hafta sürüyor — önizleme' : veri.onizleme ? 'önizleme (henüz kaydedilmedi)' : 'kayıtlı' }),
        ]),
        el('div', { class: 'gl-suzgec mb-4', id: 'karneSecici' }, [
          el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'btnKarneOnceki', 'aria-label': 'Önceki hafta', onclick: () => { secili = komsu(bas, -1); yukle(); } }, [el('span', { text: '‹ Önceki' })]),
          el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'btnKarneSonraki', disabled: ileriVar ? null : '', 'aria-label': 'Sonraki hafta', onclick: () => { const s = komsu(bas, 1); secili = s >= veri.buHafta ? 'bu' : s; yukle(); } }, [el('span', { text: 'Sonraki ›' })]),
          veri.suruyor ? null : el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'btnKarneBuHafta', onclick: () => { secili = 'bu'; yukle(); } }, [el('span', { text: 'Bu hafta (sürüyor)' })]),
        ]),
        el('div', { class: 'p-serit mb-4', id: 'karneOzet' }, gostergeler(kr).map(g => el('div', { class: 'p-gosterge' }, [
          el('p', { class: 'p-gosterge-etiket' }, [el('span', { text: g.etiket })]),
          el('p', { class: `p-gosterge-deger${g.ton ? ' ' + g.ton : ''}`, text: g.deger }),
          el('p', { class: 'p-gosterge-alt', text: g.alt }),
        ]))),
        (kr.botlar || []).length ? AG.tablo.kutulu({ id: 'tblKarneBot', sinif: 'p-tablo', basliklar: ['Bot', 'Hesap', 'Durum', 'Bu hafta', 'BTC', "BTC'ye fark", 'En büyük düşüş', 'Tepeden', 'İşlem'],
          satirlar: kr.botlar.map(b => el('tr', null, [
            el('td', { text: botAdi(b) }),
            el('td', { class: 'df-soluk', text: MOD[b.mod] || b.mod || '—' }),
            el('td', null, [el('span', { class: `p-rozet p-rozet-${(DURUM[b.durum] || ['', ''])[1] || 'info'}`, text: (DURUM[b.durum] || [b.durum || '—'])[0] })]),
            el('td', { class: `sayi ${ton(b.getiri)}`, text: b.getiri == null ? 'veri yok' : yuzde(b.getiri) }),
            el('td', { class: 'sayi', text: yuzde(b.btc) }),
            el('td', { class: `sayi ${ton(b.fark)}`, text: puan(b.fark) }),
            el('td', { class: 'sayi', text: sayiMi(b.dusus) ? yuzde(-b.dusus) : '—' }),
            el('td', { class: 'sayi df-soluk', text: sayiMi(b.tepedenDusus) ? yuzde(-b.tepedenDusus) : '—' }),
            el('td', { class: 'sayi', text: String(b.islem || 0) }),
          ])) }, 'p-tablo-kap') : el('p', { class: 'hint', text: 'Bu makinede bot yok.' }),
        el('ul', { class: 'mt-3', id: 'karneSatirlar' }, [
          pfParca.length ? el('li', { text: `Portföy: ${pfParca.join(' · ')}` }) : null,
          kr.sorunlar ? el('li', { text: (kr.sorunlar.basliklar || []).length ? `Sorunlar (şu an): ${kr.sorunlar.basliklar.slice(0, 3).join(' · ')}` : 'Şu an etkin sorun yok.' }) : null,
          kr.olaylar ? el('li', { text: `Bu haftanın olayları: ${kr.olaylar.alarm || 0} alarm, ${kr.olaylar.uyari || 0} uyarı — ayrıntı Sistem › Olay akışı` }) : null,
          d ? el('li', { text: `Kairos demo kabulü: ${d.gecenGun} gün${d.hukumTarihi ? ` · hüküm ${d.hukumTarihi}` : ''}${d.sonBant ? ` · son bant ${d.sonBant}` : ''} (ara durum, hüküm değil)` }) : null,
        ]),
        (kr.ileri && kr.ileri.golge && kr.ileri.golge.length) ? el('details', { class: 'mt-3', id: 'karneGolge' }, [
          el('summary', { text: `Gölge testler (${kr.ileri.golge.length}) — canlı hesap değil, emir yok; ara sonuç, hüküm değil` }),
          el('ul', null, kr.ileri.golge.map(s => el('li', { class: 'df-soluk', text: s }))),
        ]) : null,
        kr.telegram ? el('details', { class: 'mt-3', id: 'karneTelegram' }, [
          el('summary', { text: 'Telegram\'a giden metin (yalnız yüzdeler)' }),
          el('pre', { class: 'df-soluk', text: [kr.telegram.baslik, ...(kr.telegram.govde || [])].join('\n') }),
        ]) : null,
      ]),
    ]);
  }

  async function yukle() {
    const k = bul('karneKok');
    if (!k) return;
    let r;
    try { r = await AG.api.karne.getir(secili || ''); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(k, [AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Haftalık karne okunamadı', yeniden: yukle })]); return; }
    veri = r;
    ciz();
  }

  if (doc && doc.addEventListener) doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-raporlar') yukle(); });

  AG.pages = AG.pages || {};
  AG.pages.karne = { yukle, yuzde, puan, komsu, gostergeler, _durum: { veriAyarla: (v) => { veri = v; } }, _ciz: { ciz } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.karne;
})(typeof window !== 'undefined' ? window : globalThis);
