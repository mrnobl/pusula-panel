/**
 * SİSTEM › KURULUM DENETİMİ (68.3, PLAN-TASIMA F4) `AG.pages.kurulumDenetimi`
 * ═══════════════════════════════════════════════════════════════════════════
 * Bu bilgisayardaki kurulumun yoklaması (GET /api/kurulum-denetimi, lib/kurulumDenetimi.js): sürüm, kurulum işareti, Node,
 * paketler, veri yeri + tür klasörleri, panel/telefon jetonu, Git + uzak depo, zamanlanmış görevler (son çalışma), kısayollar,
 * uyku ayarı. Her satır ışık + ayrıntı; kırmızı satırda "Onar" (POST /api/kurulum-denetimi/onar → scripts/kur.js --adim <ad>).
 * Sayfa yalnız GÖSTERİR: açılınca hiçbir şey değiştirmez; Onar yalnız açık tıklamayla. Telefon kademesinde Onar düğmesi yok.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);

  const TON = { iyi: 'iyi', uyari: 'uyari', kotu: 'tehlike', bilgi: 'notr' };
  const ETIKET = { iyi: 'tamam', uyari: 'uyarı', kotu: 'eksik', bilgi: 'bilgi' };
  let son = null;
  let calisan = null;

  /** Saf: maddeler → gruplar (sıra korunur). */
  function grupla(maddeler) {
    const g = [];
    for (const m of maddeler || []) {
      let x = g.find(y => y.ad === m.grup);
      if (!x) { x = { ad: m.grup, maddeler: [] }; g.push(x); }
      x.maddeler.push(m);
    }
    return g;
  }

  async function onar(adim, dugme) {
    if (calisan) return;
    calisan = adim;
    if (dugme) { dugme.disabled = true; dugme.textContent = 'Onarılıyor…'; }
    let r = null;
    try { r = await AG.api.kurulumDenetimi.onar(adim); } catch (e) { r = { success: false, error: e.message }; }
    calisan = null;
    const a = r && r.sonuc && (r.sonuc.adimlar || []).find(x => x.id === adim);
    AG.bildir(r && r.success ? `Onarıldı: ${a ? a.ayrinti || a.durum : adim}` : `Onarılamadı: ${(a && a.ayrinti) || (r && (r.error || r.cikti)) || 'bilinmeyen hata'}`, r && r.success ? 'ok' : 'hata');
    yukle();
  }

  function ciz(d) {
    const kap = bul('kurulumDenetimiKok');
    if (!kap) return;
    const yerel = (d.kademe || 'yerel') === 'yerel';
    const o = d.ozet || {};
    const ust = el('div', { class: 'glass-panel panel-pad mb-4', id: 'kdOzet' }, [
      el('p', { class: 'ana-isik-satir mb-2' }, [
        el('span', { class: `borsa-isik borsa-isik-${o.kotu ? 'tehlike' : o.uyari ? 'uyari' : 'iyi'}`, 'aria-hidden': 'true' }),
        el('strong', { text: o.kotu ? `${o.kotu} eksik` : o.uyari ? `${o.uyari} uyarı` : 'Kurulum tamam' }),
        el('span', { class: 'df-soluk', text: ` · ${o.iyi || 0} tamam · ${d.rol === 'gelistirme' ? 'geliştirme bilgisayarı' : d.rol === 'sunucu' ? 'sunucu kurulumu' : 'kullanıcı kurulumu'} · Pusula ${d.surum || '?'}` }),
      ]),
      el('p', { class: 'hint mb-0', text: yerel
        ? 'Bu sayfa yalnız gösterir; hiçbir şeyi kendiliğinden değiştirmez. Kırmızı satırdaki "Onar" o adımı yeniden kurar (npm run kur -- --adim <ad>).'
        : 'Telefondan salt okunur: onarım yalnız bu bilgisayardaki panelden yapılır.' }),
    ]);
    const gruplar = grupla(d.maddeler).map(g => el('div', { class: 'glass-panel panel-pad mb-4' }, [
      el('h3', { class: 'card-title mb-3', text: g.ad }),
      el('ul', { class: 'ana-isik-liste kd-liste' }, g.maddeler.map(m => el('li', { class: 'ana-isik-satir kd-satir', 'data-kimlik': m.id, 'data-durum': m.durum }, [
        el('span', { class: `borsa-isik borsa-isik-${TON[m.durum] || 'notr'}`, 'aria-hidden': 'true', title: ETIKET[m.durum] || m.durum }),
        el('span', { class: 'kd-baslik', text: m.baslik }),
        el('span', { class: 'df-soluk kd-ayrinti', text: m.ayrinti || '' }),
        m.onar && yerel ? el('button', { type: 'button', class: 'btn btn-secondary btn-sm kd-onar', 'data-adim': m.onar, onclick: (e) => onar(m.onar, e.currentTarget) }, [el('span', { text: 'Onar' })]) : null,
      ]))),
    ]));
    doldur(kap, [ust, ...gruplar, el('p', { class: 'hint', text: `Yoklama: ${String(d.zaman || '').slice(0, 19).replace('T', ' ')} · veri: ${(d.veri && d.veri.kok) || '?'}` })]);
  }

  async function yukle() {
    const kap = bul('kurulumDenetimiKok');
    if (!kap) return;
    try { son = await AG.api.kurulumDenetimi.durum(); } catch (e) { son = { success: false, error: e.message }; }
    if (!son || !son.success) { doldur(kap, [AG.bildirim.hataKutusu((son && son.error) || 'sunucu yanıt vermedi', { baslik: 'Kurulum denetimi okunamadı', yeniden: yukle })]); return; }
    ciz(son);
  }

  if (doc && doc.addEventListener) doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-kurulum-denetimi') yukle(); });

  AG.pages = AG.pages || {};
  AG.pages.kurulumDenetimi = { yukle, grupla, _ciz: ciz };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.kurulumDenetimi;
})(typeof window !== 'undefined' ? window : globalThis);
