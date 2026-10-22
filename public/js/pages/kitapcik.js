/**
 * KİTAPÇIK EKRANI — #/kitapcik[/kimlik] `AG.pages.kitapcik` (63.4)
 * ═══════════════════════════════════════════════════════════════════════════
 * Kullanıcı: "pusula bot stratejileri kitapçığını panele kitapçık adı altında gömmeni istiyorum, elimizdeki botları
 * tanıyalım". Kitapçıklar `public/kitapcik/` altında KENDİ BAŞINA TAM HTML sayfalarıdır (sol menü, SVG grafikler, açık/koyu
 * tema); içerikleri panelde DEĞİŞTİRİLMEZ, aynı kökenli iframe'de açılır (#ktpCerceve) + "Yeni sekmede aç".
 *
 * Yeni kitapçık eklemek: dosyayı `public/kitapcik/<kimlik>.html` olarak koyun, KITAPCIKLAR dizisine bir satır ekleyin
 * (kimlik yalnız a-z 0-9 - : rota alt yolu böyle temizlenir), kılavuzdaki Kitapçık bölümünü güncelleyin.
 *
 * Tema: kitapçık `:root[data-theme]` destekliyor; iframe yüklenince ve panelde `ag:tema` olunca panelin teması
 * (`AG.tema.etkin()`) iframe belgesine yazılır (aynı köken). Erişilemezse kitapçık kendi prefers-color-scheme'ine kalır.
 * iframe adresi YALNIZ ekran açıkken yazılır (kitapçık ~1 MB; panel açılışında indirilmez).
 *
 * 72.1 PUSULA KİTABI — #/kitap (Bilgi › Pusula Kitabı, bölüm #tab-kitap, okuyucu #kitapOkuyucu / #kitapCerceve / #kitapYeniSekme):
 * Pusula'nın kendi kitabı (Pusula, güvenlik, botlar, testler, sözlük); AYRI YOL + AYRI BÖLÜM.
 * 72.2 (kullanıcı: "depo şu an herkese açık, kitabı çıkaralım"): kitap test sonuçları içerir → herkese açık dağıtıma GİRMEZ
 * (scripts/dagitim.js), araştırma paketiyle gelir (lib/tasima.js EKLENTI_PROGRAM). Araştırma eklentisi yokken Kitapçık gibi gizlenir:
 * menü öğesi [data-arastirma], yol js/pages/kabuk.js arastirmaEklentisiniUygula → AG.rota.gizle yollar ['kitapcik', 'kitap']
 * (adresle açılış ana sayfaya düşer; boş sayfa açılmaz). Kendi kurulumunuzda (araştırma verisi / eklenti var) görünür. Okuyucu kodu
 * (tembel src, tema aktarımı, yeni sekme) iki ekranda ORTAK (okuyucuAc / temaIlet). Kitapçık listesinde de son satır olarak durur.
 */
(function (global) {
  'use strict';

  const AG = global.AG || (global.AG = {});
  const doc = global.document;

  /** Kitapçık listesi — sıra = ekrandaki sıra; ilk kitapçık alt yol yokken açılır. */
  const KITAPCIKLAR = [
    {
      kimlik: 'bot-stratejileri',
      baslik: 'Bot stratejileri',
      aciklama: 'Elimizdeki her botun alım satım kuralı, grafikleri ve backtest sonucu.',
      dosya: 'kitapcik/bot-stratejileri.html'
    },
    {
      kimlik: 'ict-kitabi',
      baslik: 'ICT Kitabı',
      aciklama: "ICT'nin bütün kavramları ve 23 modeli kitap gibi; forex (DXY pariteleri) ve Nasdaq 100 üzerinde backtest.",
      dosya: 'kitapcik/ict-kitabi.html'
    },
    {
      kimlik: 'ict-modelleri',
      baslik: 'ICT modelleri',
      aciklama: 'ICT kavramları, 16 alım satım modeli, gerçek işlem grafikleri ve BTC / EUR/USD backtest sonuçları.',
      dosya: 'kitapcik/ict-modelleri.html'
    },
    {
      kimlik: 'grafik-stilleri',
      baslik: 'Grafik stilleri',
      aciklama: 'Harmonik, Elliott, formasyonlar, mumlar, DeMark, Wyckoff, seviyeler ve trend göstergeleri: anlatım ve 7 piyasada test',
      dosya: 'kitapcik/grafik-stilleri.html'
    },
    {
      kimlik: 'strateji-kitaplari',
      baslik: 'Strateji kitapları',
      aciklama: 'Connors & Raschke, Kratter, Kuepper, price action kitapları, Volman ve psikoloji kitaplarının kuralları: anlatım ve 7 piyasada test',
      dosya: 'kitapcik/strateji-kitaplari.html'
    },
    // 72.1: Pusula Kitabı — kendi yolu da var (#/kitap, her zaman görünür); listede de okunabilsin.
    {
      kimlik: 'pusula-kitabi',
      baslik: 'Pusula Kitabı',
      aciklama: 'Pusula nedir, güvenlik, botlar, testler ve sözlük: panelin kendi kitabı.',
      dosya: 'kitapcik/pusula-kitabi.html'
    }
  ];

  /** 72.1: Bilgi › Pusula Kitabı (#/kitap). 72.2: araştırma eklentisi yokken yol + menü gizli (kabuk.js). */
  const PUSULA_KITABI = KITAPCIKLAR[KITAPCIKLAR.length - 1];

  /** Okuyucu kimlikleri: Kitapçık ekranı ve Pusula Kitabı ekranı aynı okuyucu kodunu kullanır. */
  const OKUYUCU_KTP = { okuyucu: 'ktpOkuyucu', cerceve: 'ktpCerceve', baslik: 'ktpBaslik', yeni: 'ktpYeniSekme' };
  const OKUYUCU_KITAP = { okuyucu: 'kitapOkuyucu', cerceve: 'kitapCerceve', baslik: 'kitapBaslik', yeni: 'kitapYeniSekme' };

  const bul = (id) => (doc ? doc.getElementById(id) : null);

  /** PLAN-PANEL-2 dağıtım: araştırma kitapçıkları pakete girmez — scripts/dagitim.js KITAPCIKLAR'ı boşaltır, sayfa bunu söyler. */
  const liste = () => KITAPCIKLAR;

  /** Alt yoldan kitapçık: bilinmeyen / boş → ilk kitapçık. */
  function sec(alt) {
    const k = String(alt || '').split('/')[0];
    const l = liste();
    return l.find(x => x.kimlik === k) || l[0] || null;
  }

  /** Panel temasını iframe belgesine yaz (aynı köken; olmazsa sessiz — kitapçık kendi temasına kalır). */
  function temaYaz(id) {
    const c = bul(id);
    if (!c || !AG.tema || !AG.tema.etkin) return false;
    try {
      const d = c.contentDocument;
      if (!d || !d.documentElement) return false;
      d.documentElement.setAttribute('data-theme', AG.tema.etkin());
      return true;
    } catch (e) { return false; }
  }
  /** İki okuyucuya da (Kitapçık + Pusula Kitabı); en az birine yazıldıysa true. */
  function temaIlet() {
    const a = temaYaz(OKUYUCU_KTP.cerceve), b = temaYaz(OKUYUCU_KITAP.cerceve);
    return a || b;
  }

  /** Ortak okuyucu: başlık, yeni sekme adresi, iframe (src yalnız değişince — tembel yükleme). */
  function okuyucuAc(ids, k) {
    const okuyucu = bul(ids.okuyucu), c = bul(ids.cerceve), baslik = bul(ids.baslik), yeni = bul(ids.yeni);
    if (!okuyucu || !c) return k;
    okuyucu.classList.toggle('is-hidden', !k);
    if (!k) return k;
    if (baslik) baslik.textContent = k.baslik;
    if (yeni) yeni.setAttribute('href', k.dosya);
    c.setAttribute('title', (ids === OKUYUCU_KITAP ? '' : 'Kitapçık: ') + k.baslik);
    if (c.getAttribute('src') !== k.dosya) c.setAttribute('src', k.dosya);
    return k;
  }

  function listeCiz(secili) {
    const kok = bul('ktpListe');
    if (!kok || !AG.dom) return;
    if (!liste().length) { AG.dom.doldur(kok, [AG.dom.el('p', { class: 'hint mb-0', text: 'Bu kurulumda kitapçık yok.' })]); return; }
    AG.dom.doldur(kok, liste().map(k => AG.dom.el('a', {
      class: 'glass-panel ktp-kart' + (secili && secili.kimlik === k.kimlik ? ' is-active' : ''),
      href: '#/kitapcik/' + k.kimlik,
      'aria-current': secili && secili.kimlik === k.kimlik ? 'true' : null
    }, [
      AG.dom.el('span', { class: 'ktp-kart-baslik', text: k.baslik }),
      AG.dom.el('span', { class: 'ktp-kart-aciklama', text: k.aciklama })
    ])));
  }

  function ac(alt) {
    const k = sec(alt);
    listeCiz(k);
    return okuyucuAc(OKUYUCU_KTP, k);
  }

  /** 72.1: Bilgi › Pusula Kitabı (#/kitap). */
  function kitapAc() { const k = okuyucuAc(OKUYUCU_KITAP, PUSULA_KITABI); kitapYoklama(); return k; }

  /**
   * 72.2 güvence: menü/yol gizlemesine rağmen ekran açılır ama kitap dosyası bu kurulumda yoksa (ör. araştırma verisi olan ama
   * araştırma paketi olmayan bir dağıtım kurulumu → sunucu 404) boş/hata sayfası yerine açıklama (#kitapYok) gösterilir.
   * Yüklenen belgenin başlığı "Pusula Kitabı" değilse kitap yok sayılır. Erişilemezse (aynı köken değil) dokunulmaz.
   */
  function kitapYoklama() {
    const c = bul(OKUYUCU_KITAP.cerceve), okuyucu = bul(OKUYUCU_KITAP.okuyucu), yok = bul('kitapYok');
    if (!c || !yok || !c.getAttribute('src')) return null;
    let var_;
    try {
      const d = c.contentDocument;
      // Henüz yüklenmemiş (about:blank / yükleniyor) belge karar vermez.
      if (!d || d.readyState !== 'complete' || !(d.location && /pusula-kitabi\.html$/.test(String(d.location.pathname || '')))) return null;
      var_ = /Pusula Kitabı/.test(String(d.title || ''));
    } catch (e) { return null; }
    yok.classList.toggle('is-hidden', var_);
    if (okuyucu && !var_) okuyucu.classList.add('is-hidden');
    return var_;
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => {
      if (e.detail && e.detail.bolum === 'tab-kitapcik') ac(e.detail.alt);
      else if (e.detail && e.detail.bolum === 'tab-kitap') kitapAc();
    });
    doc.addEventListener('ag:tema', temaIlet);
    for (const id of [OKUYUCU_KTP.cerceve, OKUYUCU_KITAP.cerceve]) {
      const c = bul(id);
      if (c) c.addEventListener('load', () => { temaYaz(id); if (id === OKUYUCU_KITAP.cerceve) kitapYoklama(); });
    }
  }

  AG.pages = AG.pages || {};
  AG.pages.kitapcik = { KITAPCIKLAR, PUSULA_KITABI, sec, ac, kitapAc, kitapYoklama, temaIlet };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.kitapcik;
})(typeof window !== 'undefined' ? window : globalThis);
