/**
 * ROTA — URL ile gezinme (`AG.rota`), PLAN-PANEL-PUSULA §2 / P1
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Panelin her ekranı bir YOLA sahiptir: `#/botlar`, `#/arastirma/backtest` …
 * Yenileyince aynı ekran açılır, geri/ileri tuşları çalışır, bağlantı
 * verilebilir. Hash tabanlı: sunucuda yönlendirme gerekmez.
 *
 * YENİ PANEL F2 (2026-10-19, PLAN-PANEL-YENI §2 + EK-1): yan menü İKİ seviye, dört grup — Günlük · İzleme ·
 * Araştırma · Sistem. `menu` = yan menüdeki üst öğe (`.menu-dal[data-menu]`); alt öğeler kendi yollarıdır.
 * İçerikteki ikinci menü şeritleri (alt-menu) kalktı: alt sayfa ADRES taşır.
 *
 *   yol                  → bölüm (section#…)   menü
 *   ana                  → tab-ana             Ana sayfa
 *   portfoy[/alt]        → tab-portfoy         Portföy — ALT YOLU KORUNUR (B-20): `#/portfoy/hesaplar`
 *   botlar[/<bot>[/<görünüm>]] → tab-botlar    Botlar — alt yol seçili bot + görünüm (genel · hesap · islemler · yonetim;
 *                          js/pages/botlar.js). F5: eski "Borsa hesapları" (#/borsa, tab-exchange) → botlar/hucum/hesap.
 *   sinyaller
 *   ileri[/alt] · veri[/alt] · arsiv[/alt] → alt sayfalar bölümün data-alt-sayfalar listesinden (js/pages/kabuk.js altSayfaUygula):
 *                          İleri test genel · hucum-denge · bollinger · 876 · cbdr · temettu · momentum; Veri kaynaklar · tarama · arsiv; Arşiv genel · emekli
 *   arastirma/…          → Araştırma: ozet (F5) · stratejiler · backtest · izleme (Backtest sembolleri) · laboratuvar[/sekme]
 *                          (tab-portfoy) · pine · defter (Pine ve Araştırma defteri Arşiv'den geri geldi — canlı araştırma)
 *   tarama[/…]           → Coin tarama AYRI bölüm (K-C): tarama · kacin (tab-dikkat) · izle · listeler · ayarlar
 *   ayarlar[/alt]        → tab-settings        Ayarlar — alt yol sekmeyi taşır (js/pages/ayarlar.js)
 *   arsiv[/kagit|kagit-risk]
 *   kilavuz[/…] · kitapcik[/…] → Bilgi (K-D) — ALT YOLLARI KORUNUR: `#/kilavuz/botlar/acil-fren`,
 *                          `#/kitapcik/bot-stratejileri`; `ag:rota` olayında `detail.alt` gider.
 *   kitap                → tab-kitap           Bilgi › Pusula Kitabı (72.1) — 72.2: araştırma eklentisi yokken gizlenir (kitap dağıtıma girmez).
 *
 * ESKİ SEKME KİMLİKLERİ (`tab-dashboard`, `tab-risk`…) hâlâ kabul edilir:
 * `AG.rota.git('tab-risk')` doğru yola gider. İç bağlantılar
 * (`data-goto-tab`, `sekmeyeGec`) bu sayede kırılmadı. Eski `#tab-…` hash'i
 * de yeni yola çevrilir.
 *
 * Ekran değişince belgeye `ag:rota` olayı gönderilir
 * (`detail: { yol, bolum, onceki }`); sayfa modülleri kendi bölümleri
 * açılınca veri çekmek için bunu dinler. Bilinmeyen yol ana sayfaya düşer;
 * bilinen bir yolun altındaki ek parça (`#/botlar/hucum`) üst yola düşer.
 *
 * Bu modül DOM'a yalnız menü işaretlerini (`.is-active`, `aria-current`) ve
 * bölüm görünürlüğünü (`.active`) yazar; çizim yapmaz.
 */
(function (global) {
  'use strict';

  const AG = global.AG || (global.AG = {});
  const doc = global.document;

  /** yol → { bolum: section kimliği, menu: ana menü anahtarı, baslik } */
  const YOLLAR = {
    'ana': { bolum: 'tab-ana', menu: 'ana', baslik: 'Ana sayfa' },
    'portfoy': { bolum: 'tab-portfoy', menu: 'portfoy', baslik: 'Portföy', altYol: true },
    'botlar': { bolum: 'tab-botlar', menu: 'botlar', baslik: 'Botlar', altYol: true },
    'raporlar': { bolum: 'tab-raporlar', menu: 'raporlar', baslik: 'Raporlar' },
    'sinyaller': { bolum: 'tab-sinyaller', menu: 'sinyaller', baslik: 'Sinyaller' },
    'ileri': { bolum: 'tab-ileri', menu: 'ileri', baslik: 'İleri test', altYol: true },
    'arastirma/ozet': { bolum: 'tab-arastirma-ozet', menu: 'arastirma', baslik: 'Araştırma özeti' },
    'arastirma/stratejiler': { bolum: 'tab-strategy', menu: 'arastirma', baslik: 'Stratejiler' },
    'arastirma/backtest': { bolum: 'tab-backtest', menu: 'arastirma', baslik: 'Backtest' },
    'arastirma/izleme': { bolum: 'tab-izleme', menu: 'arastirma', baslik: 'Backtest sembolleri' },
    // 62.9: laboratuvar Araştırma içinde açılır (bölüm Portföy'ünkü; ag:rota alt = 'laboratuvar' → portfoy.js rotaAlt).
    // F5: laboratuvarın iç sekmesi adreste (#/arastirma/laboratuvar/kurucu); alt yoksa 'laboratuvar' (son açılan sekme).
    'arastirma/laboratuvar': { bolum: 'tab-portfoy', menu: 'arastirma', baslik: 'Portföy laboratuvarı', alt: 'laboratuvar', altYol: true },
    'arastirma/pine': { bolum: 'tab-pine', menu: 'arastirma', baslik: 'Pine' },
    'arastirma/defter': { bolum: 'tab-defter', menu: 'arastirma', baslik: 'Araştırma defteri' },
    'tarama': { bolum: 'tab-tarama', menu: 'tarama', baslik: 'Tarama' },
    'tarama/kacin': { bolum: 'tab-dikkat', menu: 'tarama', baslik: 'Kaçın listesi' },
    'tarama/izle': { bolum: 'tab-izle', menu: 'tarama', baslik: 'İzle listesi' },
    'tarama/listeler': { bolum: 'tab-listeler', menu: 'tarama', baslik: 'Listeler' },
    'tarama/ayarlar': { bolum: 'tab-tarama-ayar', menu: 'tarama', baslik: 'Tarama ayarları' },
    'veri': { bolum: 'tab-veri', menu: 'veri', baslik: 'Veri', altYol: true },
    // 69.1: Sistem › Sağlık — öz denetim (js/pages/saglik.js, lib/ozDenetim.js).
    'saglik': { bolum: 'tab-saglik', menu: 'saglik', baslik: 'Sağlık' },
    'gunluk': { bolum: 'tab-gunluk', menu: 'gunluk', baslik: 'Günlükler' },
    'bildirimler': { bolum: 'tab-bildirim', menu: 'bildirimler', baslik: 'Bildirimler' },
    // 63.0: Ayarlar beş sekme — alt yol sekmeyi taşır (#/ayarlar/bildirimler …); js/pages/ayarlar.js sekmeSec.
    'ayarlar': { bolum: 'tab-settings', menu: 'ayarlar', baslik: 'Ayarlar', altYol: true },
    // 63.4: Kitapçık — alt yol seçili kitapçığı taşır (#/kitapcik/bot-stratejileri); js/pages/kitapcik.js.
    'kilavuz': { bolum: 'tab-kilavuz', menu: 'bilgi', baslik: 'Kılavuz', altYol: true },
    // 72.1: Pusula Kitabı — kendi yolu ve bölümü (js/pages/kitapcik.js kitapAc). 72.2: kabuk.js eklentisizken gizle({ yollar: ['kitapcik', 'kitap'] }).
    'kitap': { bolum: 'tab-kitap', menu: 'bilgi', baslik: 'Pusula Kitabı' },
    'kitapcik': { bolum: 'tab-kitapcik', menu: 'bilgi', baslik: 'Kitapçık', altYol: true },
    'kurulum': { bolum: 'tab-kurulum', menu: 'bilgi', baslik: 'Kurulum sihirbazı' },
    // 68.3 (PLAN-TASIMA F4): Sistem › Kurulum denetimi — görevler, veri yeri, Git, sürüm, jeton, uyku (js/pages/kurulumDenetimi.js).
    'kurulum-denetimi': { bolum: 'tab-kurulum-denetimi', menu: 'kurulum-denetimi', baslik: 'Kurulum denetimi' },
    'arsiv': { bolum: 'tab-arsiv', menu: 'arsiv', baslik: 'Arşiv', altYol: true },
    'arsiv/kagit': { bolum: 'tab-kagit', menu: 'arsiv', baslik: 'Kâğıt test' },
    'arsiv/kagit-risk': { bolum: 'tab-risk', menu: 'arsiv', baslik: 'Kâğıt test risk ayarları' }
  };
  const VARSAYILAN = 'ana';
  /** Alt yolu olmayan menü anahtarının açtığı ilk alt ekran. */
  const KISAYOL = { 'arastirma': 'arastirma/ozet', 'bilgi': 'kilavuz' };

  /** Panel 58 sekme kimlikleri ve taşınmış ekranların eski yolları → yeni yollar (iç bağlantılar ve yer imleri). */
  const ESKI = {
    'tab-dashboard': 'botlar',
    'tab-strategy': 'arastirma/stratejiler',
    'tab-backtest': 'arastirma/backtest',
    'tab-risk': 'arsiv/kagit-risk',
    // 62.9: Araştırma'dan Arşiv'e taşınanlar ve Araştırma içindeki laboratuvar
    'arastirma/kagit': 'arsiv/kagit',
    'arastirma/kagit-risk': 'arsiv/kagit-risk',
    'portfoy/laboratuvar': 'arastirma/laboratuvar',
    // Yeni panel F2: Pine + Araştırma defteri Araştırma'ya döndü; Coin tarama ayrı bölüm (K-C); Dikkat → Kaçın listesi.
    'arsiv/pine': 'arastirma/pine',
    'arsiv/defter': 'arastirma/defter',
    'arastirma/tarama': 'tarama',
    'arastirma/dikkat': 'tarama/kacin',
    'arastirma/izle': 'tarama/izle',
    'arastirma/listeler': 'tarama/listeler',
    'arastirma/tarama-ayar': 'tarama/ayarlar',
    'tarama/dikkat': 'tarama/kacin',
    // F5: Borsa hesapları menüden kalktı → Botlar › Hücum › Hesap (hesap = bot); "hesaplar" yalnız kullanıcının hesapları (Portföy).
    'tab-exchange': 'botlar/hucum/hesap',
    'exchange': 'botlar/hucum/hesap',
    'borsa': 'botlar/hucum/hesap',
    'hesaplar': 'portfoy/hesaplar',
    'tab-settings': 'ayarlar',
    'tab-portfoy': 'portfoy'
  };
  // Bölüm kimliği de yol yerine geçer (tab-kagit, tab-ileri …).
  for (const [yol, t] of Object.entries(YOLLAR)) if (!ESKI[t.bolum]) ESKI[t.bolum] = yol;

  let gecerli = null;
  let gecerliAlt = '';
  /**
   * 68.1 (PLAN-TASIMA F3): araştırma eklentisi yokken GİZLİ yollar (js/pages/kabuk.js arastirmaEklentisiniUygula): menüsü
   * gizli bir yol (`arastirma/…`) ya da gizli tek yol (`kitapcik`) adresle açılırsa ana sayfaya düşer.
   */
  let gizliMenuler = new Set(), gizliYollar = new Set();
  const gizliMi = (yol) => !!(YOLLAR[yol] && (gizliMenuler.has(YOLLAR[yol].menu) || gizliYollar.has(yol)));

  /**
   * Herhangi bir girdiyi (yol, `#/yol`, `#tab-x`, `tab-x`) bilinen yola çevirir.
   * Bilinmeyen → VARSAYILAN; bilinen yolun altındaki ek parça → o yol.
   */
  function coz(girdi) {
    let h = String(girdi == null ? '' : girdi).trim();
    h = h.replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* bozuk kaçış: olduğu gibi */ }
    h = h.toLowerCase();
    if (!h) return VARSAYILAN;
    // Eski adresin hedefi alt yol taşıyabilir (borsa → botlar/hucum/hesap): hedef de çözülür.
    if (ESKI[h]) return YOLLAR[ESKI[h]] ? ESKI[h] : coz(ESKI[h]);
    if (KISAYOL[h]) return KISAYOL[h];
    if (YOLLAR[h]) return h;
    const parca = h.split('/');
    for (let n = parca.length - 1; n >= 1; n--) {
      const ust = parca.slice(0, n).join('/');
      if (YOLLAR[ust]) return ust;
      if (KISAYOL[ust]) return KISAYOL[ust];
    }
    return VARSAYILAN;
  }

  /**
   * `coz` + alt yol: `altYol` taşıyan yolun altındaki parça (yalnız a-z 0-9 - /) korunur.
   * Diğer yollarda alt her zaman '' (eski davranış: `#/botlar/hucum` → botlar).
   */
  function ayir(girdi) {
    const s = ayirIc(girdi);
    return gizliMi(s.yol) ? { yol: VARSAYILAN, alt: '' } : s;
  }
  function ayirIc(girdi) {
    const ham = String(girdi == null ? '' : girdi).trim().replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
    if (ESKI[ham] && !YOLLAR[ESKI[ham]]) return ayirIc(ESKI[ham]);   // eski adres → alt yollu yeni adres
    const yol = coz(girdi);
    if (!YOLLAR[yol] || !YOLLAR[yol].altYol) return { yol, alt: '' };
    let h = String(girdi == null ? '' : girdi).trim().replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* bozuk kaçış */ }
    h = h.toLowerCase();
    if (!h.startsWith(yol + '/')) return { yol, alt: '' };
    const alt = h.slice(yol.length + 1).replace(/[^a-z0-9\-/]/g, '').replace(/\/{2,}/g, '/').replace(/^\/|\/$/g, '').slice(0, 120);
    return { yol, alt };
  }
  const adres = (yol, alt) => '#/' + yol + (alt ? '/' + alt : '');

  const hash = () => (global.location ? global.location.hash : '');

  /**
   * Menü işaretleri (yeni panel F2):
   *   [data-rota="yol"]        yaprak — tam yolda (ya da alt yollu sayfada `yol/alt` eşleşince) yanar;
   *                            `data-rota-de="a b"` aynı yaprağı başka yollarda da yakar (Modeller: üç model sekmesi).
   *                            Alt yollu sayfada alt yolun KENDİ yaprağı varsa üst yolun yaprağı sönük kalır.
   *   [data-rota-menu="anahtar"] bölüm — o bölümdeki her yolda yanar (telefon alt çubuğu).
   *   .menu-dal[data-menu]     yan menüde üst öğe — bölüm açıkken `is-acik` (alt öğeler görünür).
   */
  function isaretle(yol, altYolu) {
    const t = YOLLAR[yol];
    if (!t || !doc) return;
    const tamYol = altYolu ? `${yol}/${altYolu.split('/')[0]}` : yol;
    const imle = (a, acik) => {
      a.classList.toggle('is-active', acik);
      if (acik) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    };
    const yapraklar = doc.querySelectorAll('[data-rota]');
    const kendiYapragi = tamYol !== yol && Array.prototype.some.call(yapraklar, a => a.getAttribute('data-rota') === tamYol);
    yapraklar.forEach(a => {
      const k = a.getAttribute('data-rota');
      const ek = (a.getAttribute('data-rota-de') || '').split(/\s+/).filter(Boolean);
      imle(a, k === tamYol || (k === yol && !kendiYapragi) || ek.includes(tamYol) || ek.includes(yol));
    });
    doc.querySelectorAll('[data-rota-menu]').forEach(a => imle(a, a.getAttribute('data-rota-menu') === t.menu));
    doc.querySelectorAll('.menu-dal[data-menu]').forEach(d => {
      const acik = d.getAttribute('data-menu') === t.menu;
      d.classList.toggle('is-acik', acik);
      const bas = d.querySelector('[aria-expanded]');
      if (bas) bas.setAttribute('aria-expanded', acik ? 'true' : 'false');
    });
  }

  /** Menü işaretleri + bölüm görünürlüğü + `ag:rota`. Aynı yola ikinci kez gelince olay yine gider (zorla). */
  function uygula(yol, zorla, altParca) {
    const t = YOLLAR[yol];
    if (!t || !doc) return;
    const onceki = gecerli;
    const altYolu = altParca || t.alt || '';
    if (onceki === yol && !zorla && altYolu === gecerliAlt) return;
    gecerli = yol;
    gecerliAlt = altYolu;

    doc.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === t.bolum));
    isaretle(yol, altYolu);
    // Telefon "Menü" düğmesi: alt çubukta olmayan bir bölüm açıksa o yanar (K-G: Ana · Portföy · Botlar · Sinyaller · Menü).
    const menuDugme = doc.getElementById('btnMenu');
    if (menuDugme) menuDugme.classList.toggle('is-active', !['ana', 'portfoy', 'botlar', 'sinyaller'].includes(t.menu));
    try { doc.title = `${t.baslik} · Pusula`; } catch (e) { /* belge başlığı yazılamadı: önemsiz */ }

    try {
      doc.dispatchEvent(new global.CustomEvent('ag:rota', { detail: { yol, bolum: t.bolum, onceki, alt: altYolu } }));
    } catch (e) { /* eski tarayıcı: modüller kendi zamanlayıcılarıyla yetinir */ }
  }

  /** Hash'i oku ve uygula. Eski biçimdeki hash (`#tab-risk`) yeni yola YAZILIR (geçmişe yeni kayıt eklemeden). */
  function hashUygula() {
    const { yol, alt } = ayir(hash());
    const beklenen = adres(yol, alt);
    if (hash() !== beklenen && global.history && global.history.replaceState) {
      try { global.history.replaceState(null, '', beklenen); } catch (e) { /* file:// vb. */ }
    }
    uygula(yol, false, alt);
  }

  /**
   * Programla gezinme. Hash değişirse tarayıcı geçmişine kayıt düşer (geri tuşu çalışır)
   * ve `hashchange` uygular; aynı yolsa olay yine gönderilir (modüller tazelensin).
   */
  function git(girdi) {
    const { yol, alt } = ayir(girdi);
    if (global.location && hash() !== adres(yol, alt)) { global.location.hash = adres(yol, alt); return yol; }
    uygula(yol, true, alt);
    return yol;
  }

  function baslat() {
    if (!doc || baslat.bitti) return;
    baslat.bitti = true;
    global.addEventListener('hashchange', hashUygula);
    hashUygula();
  }

  /** 68.1: gizli menü/yol kümesini kur; açık ekran gizlendiyse ana sayfaya geç. */
  function gizle(o) {
    gizliMenuler = new Set((o && o.menuler) || []);
    gizliYollar = new Set((o && o.yollar) || []);
    if (gecerli && gizliMi(gecerli)) git(VARSAYILAN);
  }

  AG.rota = {
    YOLLAR, ESKI, KISAYOL, coz, ayir, git, baslat, gizle, gizliMi,
    gecerli: () => gecerli,
    /** Geçerli yolun alt parçası (yalnız `altYol` yollarında; yoksa ''). */
    alt: () => gecerliAlt,
    /** 62.7: sayfa kendi alt sekmesini adrese `replaceState` ile yazınca (hashchange yok) menü işaretleri tazelenir. */
    altDegisti: (alt) => {
      gecerliAlt = alt || '';
      if (!gecerli) return;
      isaretle(gecerli, gecerliAlt);
      // F2: üst çubuk kırıntısı (js/pages/kabuk.js) alt sayfa adını tazelesin.
      try { if (doc) doc.dispatchEvent(new global.CustomEvent('ag:rota-alt', { detail: { yol: gecerli, alt: gecerliAlt } })); } catch (e) { /* eski tarayıcı */ }
    },
    bolum: () => (gecerli ? YOLLAR[gecerli].bolum : null),
    /** Bölüm (section kimliği) şu an açık mı? Eski sekme kimliği de verilebilir. */
    acikMi: (bolumVeyaYol) => {
      if (!gecerli) return false;
      const x = String(bolumVeyaYol || '');
      return x === YOLLAR[gecerli].bolum || (ESKI[x] || (YOLLAR[x] ? x : null)) === gecerli;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AG.rota;
})(typeof window !== 'undefined' ? window : globalThis);
