/**
 * KILAVUZ — panel içi kullanım kılavuzu (#/kilavuz, sürüm 60.4) `AG.pages.kilavuz`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * İçerik depoda: `public/kilavuz/kilavuz.json` (bölüm listesi, sürüm notları özeti) +
 * `public/kilavuz/bolumler/*.md` (bölüm başına Markdown) + `public/kilavuz/ekranlar.json`
 * (ekran görüntüsü tanımları ve üretim bilgisi) + `public/kilavuz/ekran/*.webp`.
 * Görüntüler `npm run kilavuz:ekran` ile üretilir; güncel tutma `scripts/kilavuz-testi.js`
 * (npm test) — eksik bölüm, kaybolan seçici, bayat görüntü, sürüm uyuşmazlığı KIRMIZI.
 *
 * Dört iş (4. — 60.8: üst çubuktaki "?" Kılavuz düğmesi #btnKilavuzUst, her ekrandan o ekranın bölümüne; Portföy'de
 * "Portföyüm" alt sekmesi açıksa Portföyüm bölümüne — ustHedef):
 *   1. Kılavuz ekranı: içindekiler (gruplu), arama (tüm bölümlerde, büyük/küçük harf ve
 *      Türkçe harf duyarsız), bölüm görünümü, başlık bağlantıları (#/kilavuz/<bölüm>/<başlık>),
 *      önceki/sonraki, "Bu ekrana git".
 *   2. Her ekranın başlığına küçük "Kılavuz" bağlantısı (o ekranın bölümüne) — eşleme kilavuz.json
 *      `rota` alanından; yeni ekran eklenip bölümü yazılmazsa kılavuz testi kırılır.
 *   3. "Bu sürümde yeni" kartı: Ana sayfada, kullanıcı o sürümün notunu görmediyse
 *      (localStorage `ag.kilavuz.gorulen`; yoksa ya da erişilemezse kart görünür, "Tamam" o oturumda kapatır).
 *
 * Markdown `AG.md` ile DOM'a çizilir (innerHTML yok, metin textContent).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);
  const GORULEN = 'ag.kilavuz.gorulen';
  const VARSAYILAN = 'baslarken';

  let dizin = null, ekranlar = null, yukleniyor = null;
  const metinler = new Map();        // bölüm kimliği → Markdown
  let kartKapali = false;
  let rotaGeldi = false;             // açılışta ag:rota bizden önce gelirse ikinci kez açmamak için

  const el = (...a) => AG.dom.el(...a);
  const sadele = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, h => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }[h] || h));

  function oku(k) { try { return global.localStorage ? global.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function yaz(k, v) { try { if (global.localStorage) global.localStorage.setItem(k, v); } catch (e) { /* özel pencere: yalnız bu oturum */ } }

  async function dizinYukle() {
    if (dizin) return dizin;
    if (!yukleniyor) {
      yukleniyor = Promise.all([AG.api.kilavuz.dizin(), AG.api.kilavuz.ekranlar().catch(() => ({ ekranlar: [] }))])
        .then(([d, e]) => { dizin = d; ekranlar = e; return d; })
        .catch(err => { yukleniyor = null; throw err; });
    }
    return yukleniyor;
  }
  async function bolumMetni(b) {
    if (!metinler.has(b.id)) metinler.set(b.id, await AG.api.kilavuz.bolum(b.dosya));
    return metinler.get(b.id);
  }
  /**
   * 68.1 (PLAN-TASIMA F3): araştırma eklentisi yokken kilavuz.json'da `"arastirma": true` işaretli bölümler içindekilerde,
   * önceki/sonraki gezintisinde ve aramada GÖRÜNMEZ (doğrudan adresle açılırsa Başlarken'e düşer). Saf: gorunur(d, eklentiVar).
   */
  const eklentiVar = () => !(AG.pages && AG.pages.kabuk && AG.pages.kabuk.arastirmaEklentisi && AG.pages.kabuk.arastirmaEklentisi() === false);
  function gorunur(d, ek = eklentiVar()) { return ((d && d.bolumler) || []).filter(b => ek || !b.arastirma); }
  const bolumBul = (id) => (dizin && gorunur(dizin).find(b => b.id === id)) || null;

  /* ── Görünüm modelleri (saf; scripts/kilavuz-testi.js sınar) ─────────── */

  /** Rota yolu → kılavuz bölümü kimliği (yoksa null). */
  function rotaBolumu(d, yol) {
    const b = ((d && d.bolumler) || []).find(x => x.rota === yol);
    return b ? b.id : null;
  }

  /** Arama: her kelime geçen bölümler, isabet sayısına göre; parça = ilk isabetin çevresi. */
  function ara(d, metinHaritasi, sorgu) {
    const kelimeler = sadele(sorgu).split(/\s+/).filter(k => k.length >= 2);
    if (!kelimeler.length) return [];
    const out = [];
    for (const b of gorunur(d)) {
      const ham = metinHaritasi.get(b.id);
      if (ham == null) continue;
      const duz = AG.md.duzMetin(ham);
      const s = sadele(`${b.baslik} ${duz}`);
      if (!kelimeler.every(k => s.includes(k))) continue;
      let puan = 0;
      for (const k of kelimeler) { let i = -1; while ((i = s.indexOf(k, i + 1)) >= 0) puan++; if (sadele(b.baslik).includes(k)) puan += 20; }
      // Parça: önce sorgunun TAMAMININ geçtiği yer, yoksa ilk kelime.
      const sd = sadele(duz), tam = sd.indexOf(kelimeler.join(' '));
      const ilk = tam >= 0 ? tam : sd.indexOf(kelimeler[0]);
      if (tam >= 0) puan += 10;
      const bas = Math.max(0, ilk - 70);
      const parca = (bas > 0 ? '…' : '') + duz.slice(bas, bas + 200) + (bas + 200 < duz.length ? '…' : '');
      // Hedef başlık: bütün kelimeleri taşıyan ilk ## başlığı (bonus), yoksa ilk kelimeyi taşıyan.
      const baslikBloklari = AG.md.ayristir(ham).filter(x => x.tur === 'baslik' && x.duzey >= 2);
      let baslik = baslikBloklari.find(x => kelimeler.every(k => sadele(x.metin).includes(k)));
      if (baslik) puan += 15;
      else baslik = baslikBloklari.find(x => sadele(x.metin).includes(kelimeler[0])) || null;
      out.push({ id: b.id, baslik: b.baslik, puan, parca, hedef: baslik ? `${b.id}/${baslik.id}` : b.id, altBaslik: baslik ? baslik.metin : null });
    }
    return out.sort((a, b) => b.puan - a.puan);
  }

  /** "Bu sürümde yeni" kartı gösterilsin mi? */
  function yeniKartGoster(d, gorulen) {
    const s = d && d.surumler && d.surumler[0];
    return !!(s && s.surum && gorulen !== s.surum);
  }

  /* ── Ekran görüntüsü ─────────────────────────────────────────────────── */
  function ekranCiz(kimlik, aciklama) {
    const e = ((ekranlar && ekranlar.ekranlar) || []).find(x => x.kimlik === kimlik);
    if (!e || !e.uretim) return el('aside', { class: 'kl-not kl-not-uyari', role: 'note' }, [el('p', { class: 'kl-p', text: `Ekran görüntüsü henüz üretilmedi: ${kimlik} (npm run kilavuz:ekran).` })]);
    const src = `kilavuz/ekran/${e.uretim.dosya}`;
    const tel = e.genislik <= 640;
    const isaret = (e.isaretler || []);
    return el('figure', { class: `kl-sekil${tel ? ' kl-sekil-tel' : ''}` }, [
      el('a', { href: src, target: '_blank', rel: 'noopener', class: 'kl-sekil-bag', 'aria-label': `${aciklama} — tam boyut aç` }, [
        el('img', { src, alt: aciklama, width: String(e.uretim.en), height: String(e.uretim.boy), loading: 'lazy', decoding: 'async', class: 'kl-sekil-resim' })
      ]),
      el('figcaption', { class: 'kl-sekil-alt' }, [
        el('span', { class: 'kl-sekil-baslik', text: aciklama }),
        isaret.length ? el('ol', { class: 'kl-isaretler' }, isaret.map((x, i) => el('li', null, [el('span', { class: 'kl-isaret-no', text: String(i + 1), 'aria-hidden': 'true' }), el('span', { text: x.etiket })]))) : null
      ])
    ]);
  }

  function sozlukPaneli() {
    const t = (AG.sozluk && AG.sozluk.TERIMLER) || {};
    const satirlar = Object.values(t).slice().sort((a, b) => a.localeCompare(b, 'tr'));
    return el('ul', { class: 'kl-liste kl-sozluk-panel' }, satirlar.map(m => {
      const i = m.indexOf(':');
      return el('li', null, i > 0 && i < 60 ? [el('strong', { text: m.slice(0, i) }), doc.createTextNode(m.slice(i))] : [doc.createTextNode(m)]);
    }));
  }

  /* ── Kılavuz ekranı ──────────────────────────────────────────────────── */
  function icindekilerCiz(secili) {
    const kap = bul('klIcindekiler');
    if (!kap || !dizin) return;
    const gruplar = [];
    for (const b of gorunur(dizin)) {
      let g = gruplar.find(x => x.ad === b.grup);
      if (!g) gruplar.push(g = { ad: b.grup, bolumler: [] });
      g.bolumler.push(b);
    }
    AG.dom.doldur(kap, gruplar.map(g => el('div', { class: 'kl-grup' }, [
      el('p', { class: 'kl-grup-ad', text: g.ad }),
      el('ul', { class: 'kl-grup-liste' }, g.bolumler.map(b => el('li', null, [
        el('a', { href: `#/kilavuz/${b.id}`, class: `kl-ic-bag${b.id === secili ? ' is-active' : ''}`, 'aria-current': b.id === secili ? 'page' : null, text: b.baslik })
      ])))
    ])));
  }

  async function bolumGoster(alt) {
    const icerik = bul('klIcerik');
    if (!icerik) return;
    const [id, baslik] = String(alt || '').split('/');
    const b = bolumBul(id) || bolumBul(VARSAYILAN) || dizin.bolumler[0];
    icindekilerCiz(b.id);
    let md;
    try { md = await bolumMetni(b); } catch (e) {
      AG.dom.doldur(icerik, [AG.bildirim.hataKutusu(`Bölüm okunamadı: ${e.message}`, { baslik: b.baslik, yeniden: () => bolumGoster(alt) })]);
      return;
    }
    const liste = gorunur(dizin);
    const sira = liste.indexOf(b);
    const onceki = liste[sira - 1], sonraki = liste[sira + 1];
    AG.dom.doldur(icerik, [
      el('div', { class: 'kl-bolum', 'data-kl-bolum': b.id }, [AG.md.ciz(md, { ekran: ekranCiz, ozel: (ad) => (ad === 'sozluk-paneli' ? sozlukPaneli() : null), kimlikOnEki: 'kl-' })]),
      el('nav', { class: 'kl-alt-gezinme', 'aria-label': 'Bölümler arası' }, [
        b.rota ? el('a', { href: `#/${b.rota}`, class: 'btn btn-primary no-underline', text: `${b.baslik} ekranına git` }) : null,
        onceki ? el('a', { href: `#/kilavuz/${onceki.id}`, class: 'btn btn-secondary no-underline', text: `← ${onceki.baslik}` }) : null,
        sonraki ? el('a', { href: `#/kilavuz/${sonraki.id}`, class: 'btn btn-secondary no-underline', text: `${sonraki.baslik} →` }) : null
      ])
    ]);
    if (AG.sozluk) AG.sozluk.bagla(icerik);
    const hedef = baslik ? bul(`kl-${baslik}`) : null;
    if (hedef && hedef.scrollIntoView) hedef.scrollIntoView({ block: 'start' });
    else if (global.scrollTo) global.scrollTo(0, 0);
    if (doc) doc.title = `${b.baslik} · Kılavuz · Pusula`;
    const ic = bul('klIcindekiler');
    if (ic) ic.classList.remove('is-acik');
    const dg = bul('btnKlIcindekiler');
    if (dg) dg.setAttribute('aria-expanded', 'false');
  }

  async function tumMetinler() {
    await Promise.all(dizin.bolumler.map(b => bolumMetni(b).catch(() => null)));
    return metinler;
  }

  async function aramaGoster(sorgu) {
    const icerik = bul('klIcerik');
    if (!icerik) return;
    await tumMetinler();
    const sonuc = ara(dizin, metinler, sorgu);
    AG.dom.doldur(icerik, [
      el('h3', { class: 'kl-h kl-h2', text: `“${sorgu}” için ${sonuc.length} bölüm` }),
      sonuc.length ? el('ul', { class: 'kl-sonuclar' }, sonuc.map(s => el('li', { class: 'kl-sonuc' }, [
        el('a', { href: `#/kilavuz/${s.hedef}`, class: 'kl-sonuc-bag', text: s.altBaslik ? `${s.baslik} › ${s.altBaslik}` : s.baslik }),
        el('p', { class: 'kl-sonuc-parca', text: s.parca })
      ]))) : el('p', { class: 'kl-p', text: 'Sonuç yok. Daha kısa ya da farklı bir kelime deneyin (ör. "acil", "demo", "liste", "telefon").' })
    ]);
    // Önceki bölümde bir başlığa kaydırılmış olabilir: sonuçlar baştan görünsün (arama kutusu da görünür kalır).
    const kutu = bul('klArama');
    if (kutu && kutu.getBoundingClientRect && global.scrollBy) { const r = kutu.getBoundingClientRect(); if (r.top < 72) global.scrollBy(0, r.top - 72); }   // 72 px: yapışkan üst başlığın altı
  }

  let aramaZaman = 0;
  function aramaKur() {
    const g = bul('klArama');
    if (!g || g.__bagli) return;
    g.__bagli = true;
    g.addEventListener('input', () => {
      global.clearTimeout(aramaZaman);
      aramaZaman = global.setTimeout(() => {
        const v = g.value.trim();
        if (v.length >= 2) aramaGoster(v); else bolumGoster(AG.rota.alt());
      }, 200);
    });
    g.addEventListener('keydown', (e) => { if (e.key === 'Escape') { g.value = ''; bolumGoster(AG.rota.alt()); } });
    const d = bul('btnKlIcindekiler');
    if (d) d.addEventListener('click', () => {
      const ic = bul('klIcindekiler');
      const ac = !ic.classList.contains('is-acik');
      ic.classList.toggle('is-acik', ac);
      d.setAttribute('aria-expanded', ac ? 'true' : 'false');
    });
  }

  async function ekranAc(alt) {
    const icerik = bul('klIcerik');
    try { await dizinYukle(); } catch (e) {
      if (icerik) AG.dom.doldur(icerik, [AG.bildirim.hataKutusu(`Kılavuz yüklenemedi: ${e.message}`, { baslik: 'Kılavuz', yeniden: () => ekranAc(alt) })]);
      return;
    }
    aramaKur();
    const g = bul('klArama');
    if (g) g.value = '';
    const s = bul('klSurum');
    if (s) s.textContent = `Kılavuz sürümü ${dizin.surum}`;
    await bolumGoster(alt);
  }

  /* ── Ekran başlıklarına "Kılavuz" bağlantısı ─────────────────────────── */
  function baslikBaglantilari() {
    if (!dizin || !AG.rota) return 0;
    let n = 0;
    for (const [yol, t] of Object.entries(AG.rota.YOLLAR)) {
      if (yol === 'kilavuz') continue;
      const id = rotaBolumu(dizin, yol);
      const s = bul(t.bolum);
      if (!id || !s) continue;
      const h = s.querySelector('.toolbar .page-title');
      if (!h || h.querySelector('.kl-ac')) continue;
      h.appendChild(el('a', { href: `#/kilavuz/${id}`, class: 'kl-ac no-underline', title: `Kılavuzda aç: ${t.baslik}`, 'aria-label': `Kılavuzda aç: ${t.baslik}` }, [
        el('span', { class: 'kl-ac-isaret', text: '?', 'aria-hidden': 'true' }), el('span', { class: 'kl-ac-yazi', text: 'Kılavuz' })
      ]));
      n++;
    }
    return n;
  }

  /* ── Üst çubuk "?" Kılavuz düğmesi (60.8) ─────────────────────────────── */
  /** Saf: geçerli yol (+ Portföy alt sekmesi) → kılavuz bölümü. Kılavuz ekranındayken null (kılavuzun kendisi). */
  function ustHedef(d, yol, portfoyAlt) {
    if (yol === 'kilavuz') return 'kilavuz-kullanimi';
    // Portföy alt sekmesi → kendi bölümü (62.4): Portföyüm → portfoyum, Hesaplarım → portfoyum/kayit, model sekmeleri → model-portfoy.
    // B-22: Laboratuvar sekmeleri de kendi başlığına (kurucu/sonuç/varyasyon/karşılaştır → portfoy/sekmeler, plan → portfoy/tutarlari-girmek).
    const PF_ALT = { portfoyum: 'portfoyum', rapor: 'portfoyum-rapor', 'islem-defteri': 'islem-defterim', hesaplar: 'portfoyum/kayit', nasdaq: 'model-portfoy', bist: 'model-portfoy', q837: 'model-portfoy', kayit: 'portfoyum', modeller: 'model-portfoy', tasarimci: 'tasarimci/ekran', buay: 'tasarimci/bu-ay', model: 'model-portfoy',
      pano: 'portfoy/pano', varliklar: 'portfoy/varliklar', hedefim: 'portfoy/hedefim', takvim: 'portfoy/takvim',
      kurucu: 'portfoy/sekmeler', sonuc: 'portfoy/sekmeler', varyasyon: 'portfoy/sekmeler', karsilastir: 'portfoy/sekmeler', plan: 'portfoy/tutarlari-girmek' };
    // 62.9: laboratuvar Araştırma içinde (#/arastirma/laboratuvar) — aynı Portföy alt sekme eşlemesi.
    const hedefBolum = yol === 'portfoy' || yol === 'arastirma/laboratuvar' ? PF_ALT[portfoyAlt] : null;
    if (hedefBolum && ((d && d.bolumler) || []).some(b => b.id === hedefBolum.split('/')[0])) return hedefBolum;
    return rotaBolumu(d, yol) || VARSAYILAN;
  }
  function ustHedefSimdi() {
    const pf = AG.pages && AG.pages.portfoy && AG.pages.portfoy.aktifAlt ? AG.pages.portfoy.aktifAlt() : null;
    return ustHedef(dizin, AG.rota && AG.rota.gecerli ? AG.rota.gecerli() : null, pf);
  }
  function ustDugmeTazele() {
    const b = bul('btnKilavuzUst');
    if (b && dizin) b.setAttribute('href', '#/kilavuz/' + ustHedefSimdi());
    // B-22: Portföy başlığındaki "? Kılavuz" bağlantısı da açık alt sekmeyi izler.
    const pf = bul('tab-portfoy'), a = pf && pf.querySelector ? pf.querySelector('.toolbar .page-title .kl-ac') : null;
    if (a && dizin && AG.rota && AG.rota.gecerli && (AG.rota.gecerli() === 'portfoy' || AG.rota.gecerli() === 'arastirma/laboratuvar')) a.setAttribute('href', '#/kilavuz/' + ustHedefSimdi());
  }
  function ustDugmeKur() {
    const b = bul('btnKilavuzUst');
    if (!b || b.__kuruldu) return;
    b.__kuruldu = true;
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await dizinYukle(); } catch (x) { /* dizin yok: kılavuz ana sayfası */ }
      const h = dizin ? ustHedefSimdi() : '';
      if (AG.rota && AG.rota.git) AG.rota.git('kilavuz' + (h ? '/' + h : ''));
    });
  }

  /* ── "Bu sürümde yeni" kartı (Ana sayfa) ─────────────────────────────── */
  function yeniKartCiz() {
    const kap = bul('anaYeniSurum');
    if (!kap || !dizin) return;
    const goster = !kartKapali && yeniKartGoster(dizin, oku(GORULEN));
    kap.classList.toggle('is-hidden', !goster);
    if (!goster) return;
    const s = dizin.surumler[0];
    const kapat = () => { kartKapali = true; yaz(GORULEN, s.surum); kap.classList.add('is-hidden'); };
    AG.dom.doldur(kap, [
      el('h3', { class: 'card-title mb-3', text: `Pusula ${s.surum} — bu sürümde yeni` }),
      el('ul', { class: 'kl-liste kl-yeni-liste' }, (s.yeni || []).map(x => el('li', { text: x }))),
      el('div', { class: 'row row-wrap gap-2' }, [
        el('a', { href: '#/kilavuz/surum-notlari', class: 'btn btn-primary no-underline', text: 'Sürüm notlarını oku', onclick: () => kapat() }),
        el('a', { href: '#/kilavuz/baslarken', class: 'btn btn-secondary no-underline', text: 'Kılavuzu aç' }),
        el('button', { type: 'button', class: 'btn btn-secondary', id: 'btnYeniSurumTamam', text: 'Tamam, gördüm', onclick: kapat })
      ])
    ]);
  }

  async function baslat() {
    ustDugmeKur();
    doc.addEventListener('ag:rota', (e) => {
      const d = e.detail || {};
      ustDugmeTazele();
      if (d.yol === 'kilavuz') { rotaGeldi = true; ekranAc(d.alt); }
      if (d.yol === 'ana') yeniKartCiz();
    });
    // B-22: Portföy alt sekmesi değişince (js/pages/portfoy.js altSekme → ag:portfoy-alt) hedefler yenilenir.
    doc.addEventListener('ag:portfoy-alt', ustDugmeTazele);
    // 68.1: eklenti durumu öğrenilince (js/pages/kabuk.js) açık kılavuzun içindekileri yeniden çizilir.
    doc.addEventListener('ag:eklenti', () => { if (dizin && AG.rota && AG.rota.gecerli() === 'kilavuz') ekranAc(AG.rota.alt()); });
    try { await dizinYukle(); } catch (e) { return; /* kılavuz yoksa panel yine çalışır */ }
    baslikBaglantilari();
    ustDugmeTazele();
    yeniKartCiz();
    if (!rotaGeldi && AG.rota && AG.rota.gecerli() === 'kilavuz') ekranAc(AG.rota.alt());
  }

  AG.pages = AG.pages || {};
  AG.pages.kilavuz = { baslat, rotaBolumu, ara, gorunur, yeniKartGoster, baslikBaglantilari, ekranAc, ustHedef, GORULEN };
  if (doc) { if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat); else baslat(); }
})(typeof window !== 'undefined' ? window : globalThis);
