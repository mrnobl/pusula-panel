/**
 * İLERLEME — uzun işlerin TEK TİP göstergesi (`AG.ilerleme`), PLAN-PANEL-PUSULA §3 / P5
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sunucudaki iş kuyruğunda koşan her uzun iş (backtest, walk-forward,
 * optimizasyon, veri indirme, portföy simülasyonu/varyasyonu) aynı kutuyla
 * görünür: başlık + İptal · çubuk · "aşama · %x · n sn". Eskiden backtest
 * ekranı bir div çubuk (satır içi genişlik), portföy ekranı <progress> çiziyordu.
 *
 *   AG.ilerleme.ciz(kutu, is, { baslik, iptal })
 *       is: { durum, oran (0–1 ya da yok), aciklama, asama, sure (ms) } — null → kutu gizlenir.
 *       Oran bilinmiyorsa çubuk BELİRSİZ (kayan şerit) çizilir; yüzde yazılmaz.
 *       iptal: işi durdurmak için çağrılacak fonksiyon (yalnız durum 'calisiyor' iken düğme çıkar).
 *
 *   await AG.ilerleme.izle({ id, oku, kutu, baslik, iptal, aralik, bekle })
 *       İş bitene kadar `oku(id)` ile yoklar ({ success, is, sonuc, error }), her turda kutuyu
 *       çizer; bitince sonucu döndürür, hata/iptalde fırlatır. Aynı kutuda yeni bir iş
 *       başlarsa eskisinin turu kutuya YAZMAZ (son başlayan kazanır).
 *
 * Kısa bekleyişler (düğmeye basıldı, yanıt bekleniyor) için ayrı gösterge yok:
 * `AG.dom.mesgul(dugme, metin)` düğmeyi meşgul yapar (`aria-busy`, dönen simge —
 * components.css `.is-mesgul`). Hatalar her yerde `AG.bildir(…, 'hata')` (anlık
 * işlem) ya da `AG.bildirim.hataKutusu` (ekran verisi yüklenemedi).
 *
 * Tüm metinler textContent ile yazılır; çubuk <progress> öğesi — satır içi stil yok.
 */
(function (global) {
  'use strict';

  const AG = global.AG || (global.AG = {});
  const AKTIF = '__agIlerlemeIs';

  const yuzde = (is) => (typeof is.oran === 'number' && Number.isFinite(is.oran)
    ? Math.max(0, Math.min(100, Math.round(is.oran * 100))) : null);

  function altMetin(is) {
    const y = yuzde(is);
    return [is.asama || null, y === null ? null : `%${y}`, `${Math.round((is.sure || 0) / 1000)} sn`].filter(Boolean).join(' · ');
  }

  function ciz(kutu, is, secenek) {
    if (!kutu) return null;
    const { el, doldur } = AG.dom;
    if (!is) { kutu.classList.add('is-hidden'); doldur(kutu, []); kutu.removeAttribute && kutu.removeAttribute('aria-busy'); return null; }
    const o = secenek || {};
    const y = yuzde(is);
    kutu.classList.remove('is-hidden');
    kutu.classList.add('ilerleme-kutu');
    kutu.setAttribute('aria-busy', is.durum === 'calisiyor' ? 'true' : 'false');
    const cubuk = el('progress', { class: 'ilerleme-cubuk', max: '100', 'aria-label': `${o.baslik || 'İş'} ilerlemesi` });
    if (y !== null) cubuk.value = y;   // değer yok → tarayıcı belirsiz çubuk çizer
    doldur(kutu, [
      el('div', { class: 'ilerleme-ust' }, [
        el('strong', { class: 'ilerleme-baslik', text: [o.baslik, is.aciklama].filter(Boolean).join(' — ') }),
        is.durum === 'calisiyor' && typeof o.iptal === 'function'
          ? el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => o.iptal(is) }, [el('span', { text: 'İptal' })])
          : null
      ]),
      cubuk,
      el('p', { class: 'ilerleme-alt hint hint-sm mb-0', text: altMetin(is) })
    ]);
    return cubuk;
  }

  async function izle(o) {
    const { id, oku, kutu } = o;
    const bekle = o.bekle || ((ms) => new Promise(r => setTimeout(r, ms)));
    const aralik = o.aralik || 700;
    if (kutu) kutu[AKTIF] = id;
    const benim = () => !kutu || kutu[AKTIF] === id;
    const secenek = { baslik: o.baslik, iptal: o.iptal };
    for (;;) {
      const r = await oku(id);
      if (!r || !r.success) { if (benim()) ciz(kutu, null); throw new Error((r && r.error) || 'iş okunamadı'); }
      if (r.is.durum === 'bitti') {
        if (benim()) {
          if (o.bitinceGoster) { ciz(kutu, r.is, secenek); setTimeout(() => { if (benim()) ciz(kutu, null); }, o.bitinceGoster); } else ciz(kutu, null);
        }
        return r.sonuc;
      }
      // Hata / iptal: kutu kapanır, nedeni çağıran tek tip bildirimle söyler (AG.bildir … 'hata').
      if (r.is.durum !== 'calisiyor') { if (benim()) ciz(kutu, null); throw new Error(r.is.hata || r.is.durum); }
      if (benim()) ciz(kutu, r.is, secenek);
      await bekle(aralik);
    }
  }

  AG.ilerleme = { ciz, izle, altMetin };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.ilerleme;
})(typeof window !== 'undefined' ? window : globalThis);
