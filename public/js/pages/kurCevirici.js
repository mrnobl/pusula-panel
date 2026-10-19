/**
 * KUR ÇEVİRİCİ (sürüm 60.8, PLAN-PORTFOYUM §0 P4) `AG.pages.kurCevirici`
 * ═══════════════════════════════════════════════════════════════════════════
 * USD · TRY · EUR · GBP · gram altın · BTC arasında çevirme. Kurlar GET /api/portfoyum/kur (sunucu: lib/portfoyum/fiyat.js
 * kurTablosu) — ücretsiz kaynaklar: Yahoo chart (USDTRY=X, EURUSD=X, GBPUSD=X, GC=F) ve Binance açık fiyat ucu (BTCUSDT);
 * ağ yoksa diskteki son günlük kapanış. Her kurun KAYNAĞI ve SAATİ yazar. Gram altın = ons ÷ 31,1035.
 *   · Üst çubuktaki "Kur" düğmesi (#btnKurCevirici) her ekrandan pencere açar (Esc / dışarı tıklama kapatır).
 *   · Portföyüm sekmesinde küçük kart (`kart(kap)`).
 * Yalnız okuma (telefonda da çalışır). DOM AG.dom.el; inline stil yok.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);

  const SIRA = ['USD', 'TRY', 'EUR', 'GBP', 'ALTIN_GR', 'BTC'];
  const AD = { USD: 'USD — ABD doları', TRY: 'TRY — Türk lirası', EUR: 'EUR — Euro', GBP: 'GBP — İngiliz sterlini', ALTIN_GR: 'Gram altın', BTC: 'BTC — Bitcoin' };
  let tablo = null;
  let yukleniyor = null;
  const secim = { miktar: '1', kaynak: 'USD', hedef: 'TRY' };

  /** Seçici için kısa ad (telefonda 390 px'te kesilmesin — denetim A-41); uzun ad option title'da. */
  const KISA = { USD: 'USD dolar', TRY: 'TRY lira', EUR: 'EUR euro', GBP: 'GBP sterlin', ALTIN_GR: 'Gram altın', BTC: 'BTC' };

  /**
   * Saf: yazılan miktarı sayıya çevirir (denetim A-06). Türkçe yazım: "1.234,5" → 1234,5; virgül yoksa
   * nokta(lar) üç haneli grupları ayırıyorsa BİNLİK ("1.000" = bin, "12.500.000"), değilse ondalık ("1.5", "0.25").
   * Eksi, sıfır ve sayı olmayan → NaN (sonuç "—").
   */
  function miktarOku(miktar) {
    if (typeof miktar === 'number') return Number.isFinite(miktar) && miktar > 0 ? miktar : NaN;
    const t = String(miktar == null ? '' : miktar).trim().replace(/\s/g, '');
    if (t === '' || !/^[0-9.,]+$/.test(t)) return NaN;
    let n;
    if (t.includes(',')) n = Number(t.replace(/\./g, '').replace(',', '.'));
    else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) n = Number(t.replace(/\./g, ''));
    else n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  }
  /** Saf: miktar kaynak → hedef (degerler: 1 birimin USD değeri). */
  function cevir(miktar, kaynak, hedef, degerler) {
    const a = degerler && degerler[kaynak], b = degerler && degerler[hedef];
    const m = miktarOku(miktar);
    if (!(Number.isFinite(m) && a > 0 && b > 0)) return null;
    return m * a / b;
  }
  /** Saf: sunucunun kaynak etiketini sadeleştirir ("Yahoo USDTRY=X" → "Yahoo Finance", "Binance BTCUSDT" → "Binance"). */
  function sadeKaynak(k) {
    return String(k || '')
      .replace(/Yahoo\s+[A-Z^.]+=[A-Z]+(\s*\([^)]*\))?/g, 'Yahoo Finance')
      .replace(/Binance\s+BTC\/?USDT/g, 'Binance');
  }
  /** Pencere içindeki odaklanabilir denetimler (Tab tuzağı). */
  function odaklanabilir(kutu) {
    if (!kutu || !kutu.querySelectorAll) return [];
    return [...kutu.querySelectorAll('input, select, button, a[href]')].filter(d => !d.disabled);
  }
  function bicim(x, birim) {
    if (typeof x !== 'number' || !Number.isFinite(x)) return '—';
    const b = birim === 'BTC' ? 8 : Math.abs(x) >= 100 ? 2 : 4;
    return x.toLocaleString('tr-TR', { minimumFractionDigits: Math.min(2, b), maximumFractionDigits: b });
  }
  function saatMetni(z) {
    if (!z) return '';
    const d = new Date(z);
    if (!Number.isFinite(d.getTime())) return '';
    return `${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  async function yukle(yenile) {
    if (yukleniyor && !yenile) return yukleniyor;
    yukleniyor = (async () => {
      try {
        const r = await AG.api.portfoyum.kur(yenile);
        if (r && r.success) tablo = r;
        else tablo = tablo || { hata: (r && r.error) || 'kur okunamadı' };
      } catch (e) { tablo = tablo || { hata: e.message }; }
      finally { yukleniyor = null; }
      return tablo;
    })();
    return yukleniyor;
  }

  /** Çevirici gövdesi (kart ve pencere aynı). `onEk`: kimlik öneki (iki kopya aynı sayfada olabilir). */
  function govde(onEk) {
    const sonucId = `${onEk}Sonuc`;
    const miktar = el('input', { id: `${onEk}Miktar`, class: 'form-control control-sm kur-miktar', type: 'text', inputmode: 'decimal', 'aria-label': 'Miktar' });
    miktar.value = secim.miktar;
    const kaynak = el('select', { id: `${onEk}Kaynak`, class: 'form-control control-sm kur-birim', 'aria-label': 'Kaynak birim' }, SIRA.map(b => el('option', { value: b, text: KISA[b], title: AD[b] })));
    const hedef = el('select', { id: `${onEk}Hedef`, class: 'form-control control-sm kur-birim', 'aria-label': 'Hedef birim' }, SIRA.map(b => el('option', { value: b, text: KISA[b], title: AD[b] })));
    kaynak.value = secim.kaynak; hedef.value = secim.hedef;
    const sonuc = el('div', { id: sonucId, class: 'kur-sonuc sayi', 'aria-live': 'polite' });
    const hesapla = () => {
      secim.miktar = miktar.value; secim.kaynak = kaynak.value; secim.hedef = hedef.value;
      const d = tablo && tablo.degerler;
      const x = cevir(miktar.value, kaynak.value, hedef.value, d);
      const birimAd = (b) => (b === 'ALTIN_GR' ? 'gr altın' : b);
      sonuc.textContent = x == null
        ? (tablo && tablo.hata ? `kur yok: ${tablo.hata}` : (String(miktar.value || '').trim() ? '— (sıfırdan büyük bir miktar yazın, ör. 1.000 ya da 1.234,5)' : '—'))
        : `${bicim(miktarOku(miktar.value), kaynak.value)} ${birimAd(kaynak.value)} = ${bicim(x, hedef.value)} ${birimAd(hedef.value)}`;
    };
    miktar.addEventListener('input', hesapla); kaynak.addEventListener('change', hesapla); hedef.addEventListener('change', hesapla);
    const ters = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'aria-label': 'Birimleri yer değiştir', title: 'Yer değiştir', onclick: () => { const a = kaynak.value; kaynak.value = hedef.value; hedef.value = a; hesapla(); } }, [el('span', { text: '⇄' })]);
    const liste = el('ul', { class: 'kur-liste', id: `${onEk}Liste` });
    const listeCiz = () => {
      const b = (tablo && tablo.bilgi) || {};
      doldur(liste, SIRA.filter(x => x !== 'USD').map(x => {
        const k = b[x];
        return el('li', null, [
          el('span', { class: 'kur-ad', text: AD[x] }),
          el('span', { class: 'kur-deger sayi', text: k ? k.gosterim : 'kur yok' }),
          el('span', { class: `kur-kaynak${k && !k.canli ? ' tone-warning' : ''}`, text: k ? `${sadeKaynak(k.kaynak)}${k.zaman ? ' · ' + saatMetni(k.zaman) : ''}` : '' }),
          x === 'ALTIN_GR' ? el('span', { class: 'kur-kaynak', text: 'Uluslararası ons fiyatından hesaplanır; kuyumcu ve bankadaki gram altın fiyatı alış-satış farkı ve prim yüzünden farklıdır.' }) : null
        ]);
      }));
    };
    const yenileBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: `${onEk}Yenile`, onclick: async (e) => { AG.dom.mesgul(e.currentTarget, 'Yenileniyor…'); try { await yukle(true); hesapla(); listeCiz(); } finally { AG.dom.hazir(e.currentTarget); } } }, [el('span', { text: 'Kurları yenile' })]);
    const kok = el('div', { class: 'kur-govde' }, [
      el('div', { class: 'kur-satir' }, [miktar, kaynak, ters, hedef]),
      sonuc,
      liste,
      el('div', { class: 'pf-dugmeler mt-2' }, [yenileBtn, el('span', { class: 'hint hint-sm mb-0', text: 'Ücretsiz kaynaklar; turuncu = canlı değil (diskteki son kapanış).' })])
    ]);
    const tazele = () => { hesapla(); listeCiz(); };
    tazele();
    return { kok, tazele };
  }

  /** Portföyüm kartı. */
  async function kart(kap) {
    if (!kap) return;
    const g = govde('kurKart');
    doldur(kap, [el('h3', { class: 'card-title mb-3' }, [el('i', { class: 'tone-primary', 'data-lucide': 'arrow-left-right' }), el('span', { text: ' Kur çevirici' })]), g.kok]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
    await yukle(false);
    g.tazele();
  }

  /** Her ekrandan açılan pencere. */
  let acikPencere = null;
  async function ac() {
    if (!doc || !doc.body || acikPencere) return;
    const g = govde('kurPencere');
    const kapatBtn = el('button', { type: 'button', class: 'btn btn-secondary', id: 'btnKurKapat', text: 'Kapat' });
    const kutu = el('div', { class: 'modal kur-pencere', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'kurPencereBaslik' }, [
      el('h2', { class: 'modal-title', id: 'kurPencereBaslik', text: 'Kur çevirici' }), g.kok, el('div', { class: 'modal-actions' }, [kapatBtn])]);
    const perde = el('div', { class: 'modal-backdrop', id: 'kurPencere' }, [kutu]);
    const onceki = doc.activeElement;
    const kapat = () => {
      if (!acikPencere) return;
      doc.removeEventListener('keydown', tus, true);
      if (perde.parentNode) perde.parentNode.removeChild(perde);
      acikPencere = null;
      if (onceki && onceki.focus) { try { onceki.focus(); } catch (e) { /* yok */ } }
    };
    /** Esc kapatır; Tab odağı pencerede tutar (denetim A-41 — arkadaki sayfaya geçilmesin). */
    function tus(e) {
      if (e.key === 'Escape') { e.preventDefault(); kapat(); return; }
      if (e.key !== 'Tab') return;
      const odak = odaklanabilir(kutu);
      if (!odak.length) return;
      const ilk = odak[0], son = odak[odak.length - 1], aktif = doc.activeElement;
      const icerde = kutu.contains ? kutu.contains(aktif) : false;
      if (e.shiftKey && (aktif === ilk || !icerde)) { e.preventDefault(); son.focus(); }
      else if (!e.shiftKey && (aktif === son || !icerde)) { e.preventDefault(); ilk.focus(); }
    }
    kapatBtn.addEventListener('click', kapat);
    perde.addEventListener('click', (e) => { if (e.target === perde) kapat(); });
    doc.addEventListener('keydown', tus, true);
    doc.body.appendChild(perde);
    acikPencere = { kapat };
    const m = bul('kurPencereMiktar'); if (m && m.focus) { try { m.focus(); } catch (e) { /* yok */ } }
    await yukle(false);
    g.tazele();
  }

  function baslat() {
    const b = bul('btnKurCevirici');
    if (b) b.addEventListener('click', ac);
  }

  AG.pages = AG.pages || {};
  AG.pages.kurCevirici = { cevir, miktarOku, sadeKaynak, odaklanabilir, bicim, kart, ac, yenile: () => yukle(true), kapat: () => { if (acikPencere) acikPencere.kapat(); }, SIRA };
  if (doc && doc.addEventListener) { if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat); else baslat(); }
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.kurCevirici;
})(typeof window !== 'undefined' ? window : globalThis);
