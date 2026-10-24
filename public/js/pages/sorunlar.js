/**
 * SİSTEM › SORUNLAR — Sorun merkezi (73.7, P2 + P4; lib/sorunlar.js) `AG.pages.sorunlar`
 * ═══════════════════════════════════════════════════════════════════════════
 * Kullanıcı kararı (2026-10-24, taslak 4U955wGXbnq8exaMCh6hBk): ayrı "Sorunlar" sayfası + her sayfanın üstünde küçük rozet + ana
 * sayfada bant (yalnız müdahale / dikkat varken). Her etkin sorun TEK kart: Ne oldu · Ciddi mi · Kendiliğinden geçer mi (+ tahmini
 * saat) · adımlar · "Dokunmayın" · "Neyi saydı?" · eylem düğmeleri (YALNIZ mevcut uçlar: Borsayla karşılaştır, Botu yeniden aç,
 * Güvenli kipi kaldır, Şimdi yokla; 73.8 araçları kapalı yer tutucu) · kılavuz bağlantısı · "Sohbete gönder" teşhis paketi (panoya).
 * Sorun yoksa: "Her şey yolunda · son denetim N dk önce".
 *
 * Telefon kademesi: salt okunur — yalnız telefona açık eylemler (Acil durdur, gezinme) görünür. Araştırma kopyası: sunucunun
 * sorunları (GET /api/sorunlar → lib/evOkuma.js sunucudan) + bu bilgisayarınkiler ("bu bilgisayar" etiketiyle, GET /api/sorunlar/yerel).
 * Rozet ve bant 5 dk'da bir (ve sayfa değişince en çok dakikada bir) tazelenir. DOM yalnız AG.dom; istek yalnız AG.api.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const bildir = (m, t) => (AG.bildir ? AG.bildir(m, t || 'bilgi') : null);
  const kabuk = () => (AG.pages && AG.pages.kabuk) || {};
  const telefonMu = () => !!(kabuk().telefon && kabuk().telefon());
  const arastirmaMu = () => !!(kabuk().arastirmaModu && kabuk().arastirmaModu());

  const SINIF = { mudahale: 's-bad', dikkat: 's-warn', gecici: 's-info', bilgi: 's-info' };
  const ROZET = { mudahale: 'p-rozet-neg', dikkat: 'p-rozet-warn', gecici: 'p-rozet-info', bilgi: 'p-rozet' };
  const AD = { mudahale: 'müdahale bekliyor', dikkat: 'dikkat', gecici: 'kendiliğinden geçecek', bilgi: 'bilgi' };
  const TON_SINIF = { zararsiz: 'tone-success', dikkat: 'tone-warning', tehlike: 'tone-danger' };
  const TELEFON_NOTU = 'Telefondan yalnız izleme, acil durdurma ve güncelleme yapılır; bu karttaki diğer işlemler sunucudaki panelde.';

  let son = null;           // { sorunlar, sayac, sonDenetim, rol, ... } (sunucu + yerel birleşik)
  let sonZaman = 0;
  let yukleniyor = null;
  let sira = 0;             // son isteğin sırası — geç gelen eski yanıt yenisinin üstüne yazmasın
  let ornekKip = false;     // kılavuz görüntüsü: bir kez ornek istendiyse sonraki tazelemeler de örnek
  const okundu = {};        // kart kimliği → "Sebebi okudum" (sayfa açıkken)

  // ── saf yardımcılar (test edilir) ──
  function dkOnce(ms, simdi = Date.now()) {
    if (!ms) return null;
    const d = Math.max(0, Math.round((simdi - ms) / 60000));
    return d < 1 ? 'az önce' : d < 60 ? `${d} dk önce` : `${Math.round(d / 60)} saat önce`;
  }
  /** Saf: sunucu + yerel yanıtı → tek liste (yerel kartlar etiketli, sayaç yeniden). */
  function birlestir(sunucu, yerel) {
    const s = sunucu && sunucu.success !== false && Array.isArray(sunucu.sorunlar) ? sunucu : null;
    const y = yerel && yerel.success !== false && Array.isArray(yerel.sorunlar) ? yerel.sorunlar : [];
    const sorunlar = [...(s ? s.sorunlar : []), ...y];
    const sira = { mudahale: 0, dikkat: 1, gecici: 2, bilgi: 3 };
    sorunlar.sort((a, b) => (sira[a.ciddiyet] ?? 9) - (sira[b.ciddiyet] ?? 9));
    const sayac = { mudahale: 0, dikkat: 0, gecici: 0, bilgi: 0, toplam: sorunlar.length };
    for (const k of sorunlar) if (sayac[k.ciddiyet] != null) sayac[k.ciddiyet]++;
    return { sorunlar, sayac, sonDenetim: s ? s.sonDenetim : null, rol: (s && s.rol) || (yerel && yerel.rol) || null,
      sunucuYok: !s, sunucuHata: !s ? ((sunucu && sunucu.error) || null) : null, eski: !!(s && s.evKaynak && s.evKaynak.eski), ornek: !!(s && s.ornek),
      calisiyor: s ? s.calisiyor : false, zaman: (s && s.zaman) || Date.now() };
  }
  /** Saf: rozet modeli → { ton: 'neg'|'warn'|'info'|null, parcalar: [{ ton, sayi, ad }], metin } */
  function rozetModeli(v) {
    const s = (v && v.sayac) || {};
    const parcalar = [];
    if (s.mudahale) parcalar.push({ ton: 'neg', sayi: s.mudahale, ad: AD.mudahale });
    if (s.dikkat) parcalar.push({ ton: 'warn', sayi: s.dikkat, ad: AD.dikkat });
    if ((s.gecici || 0) + (s.bilgi || 0)) parcalar.push({ ton: 'info', sayi: (s.gecici || 0) + (s.bilgi || 0), ad: 'kendiliğinden geçecek / bilgi' });
    return { ton: parcalar.length ? parcalar[0].ton : null, parcalar, metin: parcalar.map(p => `${p.sayi} ${p.ad}`).join(' · ') };
  }
  /** Saf: ana sayfa bandı — yalnız müdahale / dikkat varken. */
  function bantModeli(v) {
    const s = (v && v.sayac) || {};
    if (!s.mudahale && !s.dikkat) return null;
    const ilk = (v.sorunlar || []).find(k => k.ciddiyet === 'mudahale' || k.ciddiyet === 'dikkat');
    return { ton: s.mudahale ? 'neg' : 'warn', metin: [s.mudahale ? `${s.mudahale} sorun müdahalenizi bekliyor` : null, s.dikkat ? `${s.dikkat} dikkat` : null].filter(Boolean).join(' · '), ilk: ilk ? ilk.baslik : '' };
  }
  /** Saf: telefonda / araştırma kopyasında görünecek eylemler. */
  function gorunenEylemler(k, { telefon = false } = {}) {
    return (k.eylemler || []).filter(e => !telefon || e.telefon);
  }

  // ── rozet + bant ──
  function rozetGuncelle(v) {
    if (!doc || !doc.querySelectorAll) return;
    const m = rozetModeli(v);
    const ust = bul('sorunUstRozet');
    if (ust) {
      ust.classList.toggle('is-hidden', !m.ton);
      doldur(ust, m.parcalar.map(p => el('span', { class: `sorun-ust-sayi sorun-ust-${p.ton}`, title: p.ad, text: String(p.sayi) })));
      ust.setAttribute('title', m.ton ? `Sorunlar: ${m.metin}` : 'Sorun yok');
      ust.setAttribute('aria-label', m.ton ? `Sorunlar: ${m.metin}` : 'Sorunlar: yok');
    }
    doc.querySelectorAll('[data-sorun-menu-rozet]').forEach(r => {
      const n = ((v && v.sayac) || {}).mudahale + ((v && v.sayac) || {}).dikkat || 0;
      const top = (v && v.sayac && v.sayac.toplam) || 0;
      r.classList.toggle('is-hidden', !top);
      r.textContent = top ? String(n || top) : '';
      r.className = `menu-rozet sorun-menu-rozet${top ? '' : ' is-hidden'} sorun-menu-${m.ton || 'info'}`;
      r.setAttribute('title', top ? m.metin : '');
    });
  }
  function anaBantCiz(v) {
    const k = bul('anaSorunBandi');
    if (!k) return;
    const b = bantModeli(v);
    k.classList.toggle('is-hidden', !b);
    if (!b) { doldur(k, []); return; }
    k.className = `sorun-ana-bant sorun-ana-${b.ton}`;
    doldur(k, [el('i', { 'data-lucide': b.ton === 'neg' ? 'alert-octagon' : 'alert-triangle', class: 'icon-16' }),
      el('div', { class: 'sorun-ana-metin' }, [el('strong', { text: b.metin }), b.ilk ? el('span', { class: 'hint hint-sm', text: ` — ${b.ilk}` }) : null]),
      el('a', { class: 'btn btn-secondary btn-sm no-underline', href: '#/sorunlar', id: 'lnkAnaSorunlar' }, [el('span', { text: 'Sorunlar →' })])]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  // ── eylemler ──
  async function eylemCalistir(dugme, e) {
    const a = e.api || {};
    const fn = a.tur === 'bindirmeEylem' ? () => AG.api.bindirmeEylem(a.bot, a.eylem)
      : a.tur === 'guvenliKipKaldir' ? () => AG.api.saglikOz.guvenliKipKaldir(a.bot)
        : a.tur === 'yokla' ? () => AG.api.saglikOz.yokla() : null;
    if (!fn) return;
    AG.dom.mesgul(dugme, '…');
    try {
      const r = await fn();
      if (!r || r.success === false) throw new Error((r && r.error) || 'sunucu yanıt vermedi');
      bildir(`${e.ad}: tamam`, 'ok');
    } catch (x) { bildir(`${e.ad} yapılamadı: ${x.message}`, 'hata'); }
    finally { AG.dom.hazir(dugme); yukle({ taze: true }); }
  }
  /** Botlar › <bot>'a gider ve kartın acil düğmesine basar (PIN'li diyalog — kabuk.js ustAcil ile aynı yol). */
  function acilAc(bot) {
    AG.rota.git('botlar/' + bot);
    let n = 0;
    const bas = () => {
      const d = doc.querySelector(`#botKart-${bot} .acil-fren`);
      if (d && !d.disabled) { d.click(); return; }
      if (d && d.disabled) { bildir(d.getAttribute('title') || 'Acil durdurma şu an kullanılamıyor.', 'uyari'); return; }
      if (++n < 20) global.setTimeout(bas, 250);
    };
    bas();
  }
  async function panoya(metin) {
    try { if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(metin); return true; } } catch (e) { /* aşağıdaki kutu */ }
    return false;
  }
  /** "Sohbete gönder": sunucunun teşhis paketi (+ araştırma kopyasında bu bilgisayarın kartları) panoya; olmazsa seçili metin kutusu. */
  async function sohbeteGonder(dugme, kartKimlik) {
    AG.dom.mesgul(dugme, '…');
    try {
      const r = await AG.api.sorunlar.teshis(kartKimlik && !/^yerel:/.test(kartKimlik) ? kartKimlik : null);
      if (!r || r.success === false || !r.metin) throw new Error((r && r.error) || 'paket alınamadı');
      let metin = r.metin;
      if (arastirmaMu()) {
        try { const y = await AG.api.sorunlar.yerel(); if (y && y.metin) metin += `\n\nBU BİLGİSAYAR (araştırma kopyası)\n${y.metin}`; } catch (e) { /* yerel ek yok */ }
      }
      if (await panoya(metin)) bildir('Teşhis paketi panoya kopyalandı — geliştirme sohbetine yapıştırın (sır içermez).', 'ok');
      else paketKutusu(metin);
    } catch (x) { bildir(`Teşhis paketi alınamadı: ${x.message}`, 'hata'); }
    finally { AG.dom.hazir(dugme); }
  }
  function paketKutusu(metin) {
    const k = bul('sorunPaket');
    if (!k) return;
    const ta = el('textarea', { class: 'form-control sorun-paket-metin', id: 'txtSorunPaket', readonly: 'readonly', rows: '12' });
    ta.value = metin;
    doldur(k, [el('p', { class: 'hint hint-sm', text: 'Panoya kopyalanamadı (tarayıcı izin vermedi). Metni seçip kopyalayın, geliştirme sohbetine yapıştırın:' }), ta]);
    k.classList.remove('is-hidden');
    try { ta.focus(); ta.select(); } catch (e) { /* */ }
  }

  // ── çizim ──
  function eylemDugmesi(k, e, okudumKutu) {
    if (e.href) return el('a', { class: 'btn btn-secondary btn-sm no-underline', href: e.href }, [el('span', { text: e.ad })]);
    if (e.yakinda) return el('button', { type: 'button', class: 'btn btn-secondary btn-sm', disabled: 'disabled', title: e.not || '73.8\'de gelecek' }, [el('span', { text: `${e.ad} (73.8)` })]);
    if (e.acil) {
      const d = el('button', { type: 'button', class: 'btn btn-danger btn-sm sorun-acil', 'data-bot': e.acil }, [el('span', { text: e.ad })]);
      d.addEventListener('click', () => acilAc(e.acil));
      return d;
    }
    const kilitli = arastirmaMu();
    const d = el('button', { type: 'button', class: e.kimlik === 'engel-kaldir' ? 'btn btn-danger btn-sm' : 'btn btn-secondary btn-sm', 'data-kilit': 'arastirma', 'data-eylem': e.kimlik,
      disabled: kilitli || (e.okudum && !okundu[k.kimlik]) ? 'disabled' : null, title: kilitli ? 'Araştırma kopyası: bu işlem sunucudaki panelde yapılır.' : e.okudum ? 'Önce "Sebebi okudum" kutusunu işaretleyin.' : null }, [el('span', { text: e.ad })]);
    if (e.okudum && okudumKutu) okudumKutu.addEventListener('change', () => { okundu[k.kimlik] = okudumKutu.checked; d.disabled = kilitli || !okudumKutu.checked; });
    d.addEventListener('click', () => eylemCalistir(d, e));
    return d;
  }

  function neyiSaydiCiz(n) {
    if (!n) return null;
    const satirlar = (n.satirlar || []).length ? el('div', { class: 'sorun-satirlar' }, (n.satirlar || []).map(s => el('div', { text: s }))) : null;
    const tablo = n.tablo ? AG.tablo.kutulu({ sinif: 'p-tablo', basliklar: n.tablo.basliklar, satirlar: n.tablo.satirlar.map(r => el('tr', null, r.map(h => el('td', { text: h })))) }, 'p-tablo-kap') : null;
    return el('details', { class: 'sorun-neyi' }, [el('summary', { text: `Neyi saydı? — ${n.baslik}` }), tablo, satirlar]);
  }

  function kartCiz(k, { telefon }) {
    const eylemler = gorunenEylemler(k, { telefon });
    const gizlenen = (k.eylemler || []).length - eylemler.length;
    const okudumGerek = eylemler.some(e => e.okudum) && !telefon;
    const kutuId = `chkSorunOkudum-${String(k.kimlik).replace(/[^a-z0-9-]/gi, '-')}`;
    const kutu = okudumGerek ? el('input', { type: 'checkbox', id: kutuId, checked: okundu[k.kimlik] ? 'checked' : null }) : null;
    const gonder = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-sohbet': k.kimlik }, [el('i', { 'data-lucide': 'clipboard-copy' }), el('span', { text: 'Sohbete gönder' })]);
    gonder.addEventListener('click', () => sohbeteGonder(gonder, k.kimlik));
    return el('section', { class: `sorun-kart ${SINIF[k.ciddiyet] || ''}`, id: `sorun-${String(k.kimlik).replace(/[^a-z0-9-]/gi, '-')}`, 'data-tur': k.tur, role: k.ciddiyet === 'mudahale' ? 'alert' : null }, [
      el('div', { class: 'sorun-bas' }, [
        el('h3', { class: 'sorun-baslik', text: k.baslik }),
        el('div', { class: 'sorun-rozetler' }, [
          k.kaynak === 'yerel' ? el('span', { class: 'p-rozet p-rozet-vurgu', text: 'bu bilgisayar' }) : null,
          el('span', { class: `p-rozet ${ROZET[k.ciddiyet] || ''}`, text: AD[k.ciddiyet] || k.ciddiyet }),
          k.gecer && k.gecer.kalkis ? el('span', { class: 'p-rozet p-rozet-info', text: `~${AG.pages.sorunlar.saatMetni(k.gecer.kalkis)}` }) : null,
        ]),
      ]),
      el('div', { class: 'sorun-ne' }, [
        el('div', null, [el('b', { text: 'Ne oldu' }), el('span', { text: k.ne || '—' })]),
        el('div', null, [el('b', { text: 'Ciddi mi' }), el('span', { class: TON_SINIF[k.ciddi && k.ciddi.ton] || '', text: `${(k.ciddi && k.ciddi.tonAd) || ''}. ` }), el('span', { text: (k.ciddi && k.ciddi.neden) || '' })]),
        el('div', null, [el('b', { text: 'Kendiliğinden geçer mi' }), el('span', { text: (k.gecer && k.gecer.metin) || '—' }), k.gecer && k.gecer.kalkisMetin ? el('span', { class: 'sorun-kalkis', text: ` ${k.gecer.kalkisMetin}` }) : null]),
      ]),
      el('ol', { class: 'sorun-adim' }, (k.adimlar || []).map(a => el('li', { text: a }))),
      k.dokunma ? el('p', { class: 'sorun-dokunma' }, [el('strong', { text: 'Dokunmayın: ' }), el('span', { text: k.dokunma })]) : null,
      neyiSaydiCiz(k.neyiSaydi),
      okudumGerek ? el('label', { class: 'oz-okudum', for: kutuId }, [kutu, el('span', { text: 'Sebebi okudum (açma / kaldırma düğmesi açılır)' })]) : null,
      el('div', { class: 'sorun-dugmeler' }, [...eylemler.map(e => eylemDugmesi(k, e, kutu)), gonder,
        el('a', { class: 'btn btn-secondary btn-sm no-underline sorun-kilavuz', href: k.kilavuz }, [el('i', { 'data-lucide': 'book-open' }), el('span', { text: 'Kılavuz' })])]),
      telefon && gizlenen > 0 ? el('p', { class: 'hint hint-sm mb-0', text: TELEFON_NOTU }) : null,
      el('p', { class: 'hint hint-sm mb-0 sorun-sohbet' }, [el('strong', { text: 'Ne zaman geliştirme sohbetine yazmalı: ' }), el('span', { text: k.sohbet || '' })]),
    ]);
  }

  function ciz() {
    const kok = bul('sorunKok');
    if (!kok || !son) return;
    const v = son, simdi = Date.now();
    const telefon = telefonMu();
    const m = rozetModeli(v);
    const yenile = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'btnSorunYenile' }, [el('i', { 'data-lucide': 'refresh-cw' }), el('span', { text: 'Yenile' })]);
    yenile.addEventListener('click', () => yukle({ taze: true, ornek: v.ornek }));
    const gonder = el('button', { type: 'button', class: 'btn btn-primary btn-sm', id: 'btnSorunSohbet' }, [el('i', { 'data-lucide': 'clipboard-copy' }), el('span', { text: 'Sohbete gönder (teşhis paketi)' })]);
    gonder.addEventListener('click', () => sohbeteGonder(gonder, null));
    const denetim = v.sonDenetim ? `son denetim ${dkOnce(v.sonDenetim, simdi)}` : v.rol === 'arastirma' && v.sunucuYok ? 'sunucuya ulaşılamadı' : 'öz denetim henüz yoklamadı';
    const ust = el('div', { class: 'sorun-ozet row-between row-wrap gap-2 mb-4', id: 'sorunOzet' }, [
      el('div', { class: 'sorun-ozet-sol' }, v.sorunlar.length
        ? m.parcalar.map(p => el('span', { class: `p-rozet ${p.ton === 'neg' ? 'p-rozet-neg' : p.ton === 'warn' ? 'p-rozet-warn' : 'p-rozet-info'}`, text: `${p.sayi} ${p.ad}` })).concat([el('span', { class: 'hint hint-sm', text: ` · ${denetim}` })])
        : [el('span', { class: 'sorun-yolunda tone-success', id: 'sorunYolunda' }, [el('i', { 'data-lucide': 'check-circle-2', class: 'icon-16' }), el('span', { text: ` Her şey yolunda · ${denetim}` })])]),
      el('div', { class: 'oz-bot-dugmeler' }, [gonder, yenile]),
    ]);
    const notlar = [];
    if (v.ornek) notlar.push(el('p', { class: 'hint hint-sm', text: 'ÖRNEK kartlar (kılavuz görüntüsü) — gerçek veri değil.' }));
    if ((v.rol === 'arastirma' || arastirmaMu()) && !v.ornek) notlar.push(el('p', { class: 'hint hint-sm', text: v.sunucuYok ? `Bu bilgisayar araştırma kopyası; sunucunun sorunları okunamadı${v.sunucuHata ? ` (${v.sunucuHata})` : ''}. Aşağıda yalnız bu bilgisayarınkiler ("bu bilgisayar").` : `Bu bilgisayar araştırma kopyası: kartlar sunucudan${v.eski ? ' (SON OKUNAN KOPYA — sunucuya şu an ulaşılamıyor)' : ''}; "bu bilgisayar" etiketliler buranın.` }));
    if (telefon) notlar.push(el('p', { class: 'hint hint-sm', text: 'Telefon: salt okunur. Yalnız telefondan yapılabilen işlemler (acil durdurma, gezinme) görünür.' }));
    doldur(kok, [ust, ...notlar,
      el('div', { class: 'sorun-paket is-hidden mb-4', id: 'sorunPaket' }),
      el('div', { class: 'sorun-liste', id: 'sorunListe' }, v.sorunlar.map(k => kartCiz(k, { telefon }))),
      v.sorunlar.length ? null : el('p', { class: 'hint mt-3', text: 'Bir sorun çıkarsa burada kartıyla görünür; Telegram\'daki uyarıların sonundaki "Sorunlar" bağlantısı da buraya gelir. Uzaktayken Telegram\'a /teshis yazabilirsiniz.' }),
    ]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  /** Veriyi çeker; rozet + bant her zaman, sayfa açıksa kartlar. `o.ornek`: kılavuz görüntüsü (sunucu SORUN_ORNEK=1). */
  async function yukle(o = {}) {
    if (o.ornek) ornekKip = true;
    if (ornekKip) o = { ...o, ornek: true };
    if (yukleniyor && !o.taze && !o.ornek) return yukleniyor;
    const benim = ++sira;
    yukleniyor = (async () => {
      let s = null, y = null;
      try { s = await AG.api.sorunlar.liste({ taze: o.taze, ornek: o.ornek }); } catch (e) { s = { success: false, error: e.message }; }
      if (arastirmaMu() && !o.ornek) { try { y = await AG.api.sorunlar.yerel(); } catch (e) { y = null; } }
      if (benim !== sira) return son;   // daha yeni bir istek var
      son = birlestir(s, y);
      sonZaman = Date.now();
      rozetGuncelle(son);
      anaBantCiz(son);
      if (AG.rota && AG.rota.acikMi && AG.rota.acikMi('tab-sorunlar')) ciz();
      return son;
    })();
    try { return await yukleniyor; } finally { yukleniyor = null; }
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => {
      if (!e.detail) return;
      if (e.detail.bolum === 'tab-sorunlar') { if (son) ciz(); yukle(); }
      else if (Date.now() - sonZaman > 60000) yukle();
      else if (e.detail.bolum === 'tab-ana' && son) anaBantCiz(son);
    });
    doc.addEventListener('DOMContentLoaded', () => {
      global.setTimeout(() => yukle(), 3000);
      const z = global.setInterval(() => yukle(), 5 * 60000);
      if (z && z.unref) z.unref();
    });
  }

  /** "04:15" ya da "25.10 04:15" (bu tarayıcının saati). */
  function saatMetni(ms) {
    const d = new Date(ms), b = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const s = `${p(d.getHours())}:${p(d.getMinutes())}`;
    return d.toDateString() === b.toDateString() ? s : `${p(d.getDate())}.${p(d.getMonth() + 1)} ${s}`;
  }

  AG.pages = AG.pages || {};
  AG.pages.sorunlar = { yukle, ciz, rozetGuncelle, anaBantCiz, birlestir, rozetModeli, bantModeli, gorunenEylemler, kartCiz, dkOnce, saatMetni, TELEFON_NOTU,
    _durum: { veriAyarla: (v) => { son = v; } } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.sorunlar;
})(typeof window !== 'undefined' ? window : globalThis);
