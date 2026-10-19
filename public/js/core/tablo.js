/**
 * TABLO → KART — panelin tek tablo bileşeni (`AG.tablo`), PLAN-PANEL-PUSULA §3 / P5
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tablette ve telefonda (≤ 1023 px — 60.2'den beri tablet de, `css/kirilim.css`)
 * her tablo AYNI VERİYLE karta döner: başlık satırı gizlenir, her satır bir kart
 * olur (telefonda iki, tablette 3–4 sütun) ve her hücrenin üstünde sütun başlığı
 * küçük etiket olarak yazar (`td::before { content: attr(data-etiket) }`).
 * Masaüstünde tablo olduğu gibi kalır (kompakt). Sıralanabilir tablolar
 * (`siralanabilir`) aşağıdaki SIRALAMA bölümünde.
 *
 * İki parça, ikisi de BURADA — hiçbir ekran kendi dönüşümünü yazmaz:
 *
 *   AG.tablo.kur({ id?, sinif?, basliklar, satirlar, altSatirlar?, matris?, siralanabilir? })
 *       Tablo kurar (`.tablo-kart`; `matris: true` → `.tablo-matris`, bkz.
 *       aşağı). `basliklar` metin ya da düğüm ({ metin, yardim, sinif } de
 *       olur); hücre etiketleri kurulurken yazılır.
 *
 *   AG.tablo.etiketle(tablo)  — var olan tablonun hücrelerine `data-etiket`
 *       yazar (thead'in son satırından; `colspan` hesaba katılır; "?" yardım
 *       düğmesinin metni etikete girmez; hücrede elle verilmiş etiket korunur;
 *       birden çok sütunu kaplayan hücre etiketsiz, kartta tam genişlik).
 *
 *   Gözcü: `index.html`'deki durağan tablolar (`<table class="… tablo-kart">`)
 *   satırlarını app.js'ten sonradan alır. `baslat()` bir MutationObserver kurar;
 *   `.tablo-kart` taşıyan bir tablonun gövdesi değişince etiketler yeniden
 *   yazılır (aynı karede tek tur). Böylece eski kod "satır ekle" dışında bir şey
 *   bilmek zorunda değil.
 *
 * İSTİSNA — `.tablo-matris`: iki boyutu birlikte okunan tablolar (yıl × ay ısı
 * haritası, korelasyon matrisi). Karta dönünce satır/sütun deseni kaybolur;
 * tablette/telefonda kendi kutusunda yatay kayar. Hangi tabloların istisna olduğu ve
 * gerekçesi `scripts/panel-mobil-testi.js` İSTİSNA listesinde — liste dışında
 * `.tablo-matris` ya da sınıfsız tablo testi kırar.
 *
 * Hücre içeriği her zaman `AG.dom.el` / `textContent` ile yazılır; etiket bir
 * öznitelik (CSS `attr()` onu metin olarak basar) — işaretleme yorumlanmaz.
 */
(function (global) {
  'use strict';

  const AG = global.AG || (global.AG = {});
  const doc = global.document;

  const KART = 'tablo-kart';
  const MATRIS = 'tablo-matris';
  /** Etikete girmeyen hücre içi öğeler: "?" açıklama düğmesi, ekran okuyucu metni. */
  const ATLA = ['yardim-isareti', 'sr-only'];

  const sinifVar = (n, s) => !!(n && n.classList && n.classList.contains(s));
  const cocuklar = (n) => Array.prototype.slice.call((n && (n.childNodes || n.children)) || []);
  const etiketMi = (n, ad) => !!(n && n.tagName && String(n.tagName).toUpperCase() === ad);
  const sayi = (x) => { const v = parseInt(x, 10); return Number.isFinite(v) && v > 0 ? v : 1; };
  const kapsam = (h) => sayi(h.getAttribute ? h.getAttribute('colspan') : 1);

  /** Başlık hücresinin görünen metni ("?" düğmesi hariç). */
  function baslikMetni(th) {
    if (!th) return '';
    const elle = th.getAttribute && th.getAttribute('data-etiket');
    if (elle !== null && elle !== undefined) return String(elle);
    let s = '';
    (function gez(n) {
      for (const c of cocuklar(n)) {
        if (c.nodeType === 3) s += c.textContent;
        else if (c.nodeType === 1 && !ATLA.some(a => sinifVar(c, a))) {
          if (cocuklar(c).length) gez(c); else s += c.textContent || '';
        }
      }
    })(th);
    if (!cocuklar(th).length) s = th.textContent || '';
    return String(s).replace(/\s+/g, ' ').trim();
  }

  /** Satırın hücreleri (td + th), DOM sırasıyla. */
  const hucreler = (tr) => cocuklar(tr).filter(c => etiketMi(c, 'TD') || etiketMi(c, 'TH'));

  /** Tablonun bölümleri: thead / tbody / tfoot (yoksa doğrudan tr'ler). */
  function bolumler(tablo) {
    const c = cocuklar(tablo);
    return {
      bas: c.filter(x => etiketMi(x, 'THEAD')),
      govde: c.filter(x => etiketMi(x, 'TBODY') || etiketMi(x, 'TFOOT')),
      ciplak: c.filter(x => etiketMi(x, 'TR'))
    };
  }

  /** Sütun başlıkları (thead'in SON satırı; colspan'lı başlık kapladığı her sütuna yazılır). */
  function sutunlar(tablo) {
    const b = bolumler(tablo);
    let satir = null;
    if (b.bas.length) {
      const trler = cocuklar(b.bas[b.bas.length - 1]).filter(x => etiketMi(x, 'TR'));
      satir = trler[trler.length - 1] || null;
    } else if (b.ciplak.length && hucreler(b.ciplak[0]).every(h => etiketMi(h, 'TH'))) {
      satir = b.ciplak[0];
    }
    if (!satir) return [];
    const liste = [];
    for (const h of hucreler(satir)) { const m = baslikMetni(h); for (let i = 0; i < kapsam(h); i++) liste.push(m); }
    return liste;
  }

  /**
   * Gövde hücrelerine `data-etiket` yazar. Elle verilmiş etiket (sayfa modülü kendi yazdıysa)
   * korunur. Dönen: etiketlenen hücre sayısı.
   */
  function etiketle(tablo) {
    if (!tablo) return 0;
    const basliklar = sutunlar(tablo);
    const b = bolumler(tablo);
    const trler = [];
    for (const g of b.govde) trler.push(...cocuklar(g).filter(x => etiketMi(x, 'TR')));
    trler.push(...b.ciplak.filter((tr, i) => !(i === 0 && !b.bas.length && hucreler(tr).every(h => etiketMi(h, 'TH')))));
    let n = 0;
    for (const tr of trler) {
      let sutun = 0;
      for (const h of hucreler(tr)) {
        const k = kapsam(h);
        const elle = h.getAttribute && h.getAttribute('data-etiket');
        if ((elle === null || elle === undefined) || h.dataset && h.dataset.etiketOto === '1') {
          // Birden çok sütunu kaplayan hücre (boş durum, bölüm başlığı) etiketsiz: kartta tam genişlik.
          h.setAttribute('data-etiket', k > 1 ? '' : (basliklar[sutun] || ''));
          if (h.dataset) h.dataset.etiketOto = '1';
          n++;
        }
        sutun += k;
      }
    }
    return n;
  }

  /** Başlık tanımı → <th>. Metin, düğüm ya da { metin, yardim (sözlük anahtarı), sinif, etiket }. */
  function baslikHucresi(b) {
    const el = AG.dom.el;
    if (b && b.nodeType) return etiketMi(b, 'TH') ? b : el('th', null, [b]);
    if (b && typeof b === 'object') {
      const yardim = b.yardim && AG.sozluk ? AG.sozluk.yardim(b.yardim) : null;
      return el('th', { class: b.sinif || null, 'data-etiket': b.etiket != null ? b.etiket : null }, [el('span', { text: String(b.metin == null ? '' : b.metin) }), yardim]);
    }
    return el('th', { text: b == null ? '' : String(b) });
  }

  /* ═══ SIRALAMA (sürüm 60.2) ═══════════════════════════════════════════════
   * Sıralanabilir tablo (`.tablo-siralanabilir`; `kur({ siralanabilir: 'anahtar' })` ya da
   * işaretlemede `class="… tablo-siralanabilir" data-siralanabilir="anahtar"`):
   *   · MASAÜSTÜ: sütun başlığına tıkla / Enter → artan → azalan → varsayılan (`aria-sort`).
   *   · KART GÖRÜNÜMÜ (≤ 1023 px, başlık satırı gizli): tablonun üstünde "Sırala" seçicisi
   *     (`.tablo-sirala-cubuk`, masaüstünde gizli) — her sütun artan/azalan + varsayılan sıra.
   * İkisi aynı durumu paylaşır. Sıralama anahtarı hücrenin `data-sira` özniteliği, yoksa metni:
   * sayıya benziyorsa sayı ("%12,5", "-%3.4", "$1,234.56", "1.234,5", "−2"), tarih biçimleri
   * (yyyy-aa-gg, gg.aa.yyyy) metin olarak doğru sıralanır, "—"/boş her yönde en sonda.
   * Birden çok sütunu kaplayan satır (boş durum, hata) sona gider. Satırlar YENİDEN ÇİZİLİNCE
   * (ekran tazelenince) seçili sıralama yeniden uygulanır; durum `anahtar`la (yoksa tablo
   * kimliği) saklanır, tablo baştan kurulsa da kaybolmaz. Başlığı boş ya da `data-sirasiz`
   * taşıyan sütun (eylem düğmeleri, sıra no) sıralanmaz.
   */
  const SIRALI = 'tablo-siralanabilir';
  const hafiza = new Map();   // anahtar → { sutun, yon }

  function sayiCoz(metin) {
    const t = String(metin).replace(/[\s ]/g, '').replace(/[−–]/g, '-');
    const m = t.match(/\d[\d.,]*/);
    if (!m) return null;
    // Sayıdan önce ≤ 4, sonra ≤ 6 karakterlik birim/işaret (%, $, ₺, x, USDT, gün…); fazlası metin.
    const once = t.slice(0, m.index), sonra = t.slice(m.index + m[0].length);
    if (once.replace(/[+-]/g, '').length > 4 || sonra.length > 6 || /\d/.test(sonra)) return null;
    const isaret = /-/.test(once) ? -1 : 1;
    let s = m[0].replace(/[.,]$/, '');
    const v = s.lastIndexOf(','), n = s.lastIndexOf('.');
    if (v >= 0 && n >= 0) s = v > n ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (v >= 0) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    const x = parseFloat(s);
    return Number.isFinite(x) ? isaret * x : null;
  }

  /** Hücrenin sıralama anahtarı: { bos } | { sayi } | { metin }. */
  function anahtar(h) {
    const d = h && h.getAttribute ? h.getAttribute('data-sira') : null;
    const ham = String(d != null ? d : (h ? h.textContent || '' : '')).trim();
    if (!ham || /^[—–-]+$/.test(ham)) return { bos: true };
    const tarih = ham.match(/^(\d{2})\.(\d{2})\.(\d{4})(.*)$/);
    if (tarih) return { metin: `${tarih[3]}-${tarih[2]}-${tarih[1]}${tarih[4]}` };
    if (/^\d{4}-\d{2}-\d{2}/.test(ham)) return { metin: ham };
    const x = sayiCoz(ham);
    return x === null ? { metin: ham.toLocaleLowerCase('tr') } : { sayi: x };
  }

  function karsilastir(a, b) {
    if (a.bos || b.bos) return (a.bos ? 1 : 0) - (b.bos ? 1 : 0);
    if (a.sayi !== undefined && b.sayi !== undefined) return a.sayi - b.sayi;
    if (a.sayi !== undefined) return -1;   // sayılar metinden önce
    if (b.sayi !== undefined) return 1;
    return a.metin < b.metin ? -1 : a.metin > b.metin ? 1 : 0;
  }

  /** thead'in son satırındaki <th>'ler. */
  function baslikHucreleri(tablo) {
    const b = bolumler(tablo);
    if (!b.bas.length) return [];
    const trler = cocuklar(b.bas[b.bas.length - 1]).filter(x => etiketMi(x, 'TR'));
    return trler.length ? hucreler(trler[trler.length - 1]) : [];
  }

  const govdesi = (tablo) => bolumler(tablo).govde.find(x => etiketMi(x, 'TBODY')) || null;
  /** Birden çok sütunu kaplayan hücresi olan satır (boş durum, hata, ara başlık) sıralanmaz, sona gider. */
  const birlesikMi = (tr) => hucreler(tr).some(h => kapsam(h) > 1);

  /** Satırları sıralar. sutun < 0 ya da yon 0 → varsayılan (ilk görüldükleri) sıra. Sıra değişmiyorsa DOM'a dokunmaz. */
  function sirala(tablo, sutun, yon) {
    const govde = govdesi(tablo);
    const d = tablo && tablo.__siralama;
    if (!govde || !d) return false;
    const trler = cocuklar(govde).filter(x => etiketMi(x, 'TR'));
    const ilk = (tr) => Number(tr.getAttribute('data-sira-ilk'));
    let sonraki = 0;
    for (const tr of trler) if (tr.getAttribute('data-sira-ilk') !== null) sonraki = Math.max(sonraki, ilk(tr) + 1);
    for (const tr of trler) if (tr.getAttribute('data-sira-ilk') === null) tr.setAttribute('data-sira-ilk', String(sonraki++));
    const tam = trler.filter(tr => !birlesikMi(tr));
    const diger = trler.filter(birlesikMi).sort((a, b) => ilk(a) - ilk(b));
    const etkin = sutun >= 0 && yon !== 0;
    const sirali = tam.slice().sort((a, b) => {
      if (etkin) {
        const ka = anahtar(hucreler(a)[sutun]), kb = anahtar(hucreler(b)[sutun]);
        const c = karsilastir(ka, kb);
        if (c) return (ka.bos || kb.bos) ? c : c * yon;
      }
      return ilk(a) - ilk(b);
    }).concat(diger);
    d.sutun = etkin ? sutun : -1;
    d.yon = etkin ? yon : 0;
    if (d.anahtar) hafiza.set(d.anahtar, { sutun: d.sutun, yon: d.yon });
    d.basliklar.forEach((th, i) => {
      if (th.__siralanir) th.setAttribute('aria-sort', i === d.sutun ? (d.yon > 0 ? 'ascending' : 'descending') : 'none');
    });
    if (d.secici) d.secici.value = etkin ? `${sutun}:${yon}` : '';
    if (sirali.every((tr, i) => tr === trler[i])) return false;
    sirali.forEach(tr => govde.appendChild(tr));
    return true;
  }

  /** Sıralamayı bir kez kurar (başlık tıklaması + kart görünümü seçicisi). Kap yoksa seçici sonra eklenir. */
  function siralamaKur(tablo) {
    if (!tablo || !sinifVar(tablo, SIRALI)) return;
    const el = AG.dom.el;
    if (!tablo.__siralama) {
      const ths = baslikHucreleri(tablo);
      if (!ths.length || ths.some(h => kapsam(h) > 1)) return;
      const anah = (tablo.getAttribute && (tablo.getAttribute('data-siralanabilir') || tablo.getAttribute('id'))) || '';
      const d = { sutun: -1, yon: 0, sutunSayisi: ths.length, basliklar: ths, anahtar: anah || null, secici: null, cubuk: null };
      const secenekler = [el('option', { value: '', text: 'Varsayılan sıra' })];
      const kurulacak = [];
      ths.forEach((th, i) => {
        const ad = baslikMetni(th);
        if (!ad || (th.hasAttribute && th.hasAttribute('data-sirasiz'))) return;
        kurulacak.push([th, i, ad]);
        secenekler.push(el('option', { value: `${i}:1`, text: `${ad} ↑ artan` }), el('option', { value: `${i}:-1`, text: `${ad} ↓ azalan` }));
      });
      if (!kurulacak.length) return;
      tablo.__siralama = d;
      for (const [th, i, ad] of kurulacak) {
        th.__siralanir = true;
        th.classList.add('tablo-sirala-baslik');
        th.setAttribute('tabindex', '0');
        th.setAttribute('aria-sort', 'none');
        th.setAttribute('title', `${ad}: sıralamak için tıklayın`);
        const tikla = (e) => {
          if (e && e.target && e.target.closest && e.target.closest('.yardim-isareti')) return;
          const yon = d.sutun === i ? (d.yon === 1 ? -1 : d.yon === -1 ? 0 : 1) : 1;
          sirala(tablo, yon ? i : -1, yon);
        };
        th.addEventListener('click', tikla);
        th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { if (e.preventDefault) e.preventDefault(); tikla(e); } });
      }
      d.secici = el('select', { class: 'form-control control-sm', 'aria-label': 'Tabloyu sırala' }, secenekler);
      d.secici.addEventListener('change', () => {
        const [i, y] = d.secici.value ? d.secici.value.split(':').map(Number) : [-1, 0];
        sirala(tablo, i, y);
      });
      d.cubuk = el('label', { class: 'tablo-sirala-cubuk' }, [el('span', { text: 'Sırala' }), d.secici]);
      const eski = d.anahtar ? hafiza.get(d.anahtar) : null;
      if (eski && eski.sutun >= 0) sirala(tablo, eski.sutun, eski.yon);
    }
    const d = tablo.__siralama;
    if (d && d.cubuk && !d.cubuk.parentNode && tablo.parentNode && tablo.parentNode.insertBefore) tablo.parentNode.insertBefore(d.cubuk, tablo);
  }

  /** Satırlar değişti: sıralama kurulu değilse kur, seçili sıralama varsa yeniden uygula (sıra aynıysa DOM'a dokunmaz). */
  function siralamaTazele(tablo) {
    if (!sinifVar(tablo, SIRALI)) return;
    siralamaKur(tablo);
    const d = tablo.__siralama;
    if (d && d.sutun >= 0) sirala(tablo, d.sutun, d.yon);
  }

  /**
   * Tablo kurar. `satirlar`: <tr> düğümleri (AG.dom.satir ya da el('tr')). Etiketler hemen yazılır;
   * satırlar sonradan değişirse gözcü (ya da `etiketle`) tazeler. `siralanabilir`: true ya da durum
   * anahtarı (metin) → sıralama (yukarı bakın).
   */
  function kur(o) {
    const el = AG.dom.el;
    const s = o || {};
    const sirali = !!s.siralanabilir && !s.matris;
    const sinif = ['dock-table', s.matris ? MATRIS : KART, sirali ? SIRALI : '', s.sinif || ''].filter(Boolean).join(' ');
    const tablo = el('table', {
      id: s.id || null, class: sinif,
      'data-siralanabilir': sirali && typeof s.siralanabilir === 'string' ? s.siralanabilir : null
    }, [
      el('thead', null, [el('tr', null, (s.basliklar || []).map(baslikHucresi))]),
      el('tbody', { id: s.govdeId || null }, s.satirlar || []),
      s.altSatirlar && s.altSatirlar.length ? el('tfoot', null, s.altSatirlar) : null
    ]);
    if (!s.matris) etiketle(tablo);
    if (sirali) siralamaKur(tablo);
    return tablo;
  }

  /** `kur` + yatay kayan kap (`.table-container`) — ekranların çoğunun kalıbı. */
  function kutulu(o, kapSinif) {
    const tablo = kur(o);
    const kap = AG.dom.el('div', { class: `table-container${kapSinif ? ' ' + kapSinif : ''}` }, [tablo]);
    if (tablo.__siralama) siralamaKur(tablo);   // seçici artık kabın içinde, tablonun üstünde
    return kap;
  }

  /** Kök altındaki tüm `.tablo-kart` tablolarını etiketler. */
  function kartla(kok) {
    const k = kok || doc;
    if (!k || !k.querySelectorAll) return 0;
    let n = 0;
    k.querySelectorAll('table.' + KART).forEach(t => { n += etiketle(t); siralamaTazele(t); });
    return n;
  }

  /** Şu an telefon kırılımında mı (tokens.css --bp-tel)? */
  function telefonMu() {
    if (!global.matchMedia || !global.getComputedStyle || !doc) return false;
    const bp = global.getComputedStyle(doc.documentElement).getPropertyValue('--bp-tel').trim() || '640px';
    return global.matchMedia(`(max-width: ${bp})`).matches;
  }

  let gozcu = null;
  function baslat() {
    if (!doc || !doc.body || gozcu) return;
    kartla(doc);
    if (!global.MutationObserver) return;
    const bekleyen = new Set();
    let planli = false;
    const isle = () => { planli = false; bekleyen.forEach(t => { etiketle(t); siralamaTazele(t); }); bekleyen.clear(); };
    gozcu = new global.MutationObserver((kayitlar) => {
      for (const k of kayitlar) {
        const t = k.target && k.target.closest ? k.target.closest('table.' + KART) : null;
        if (t) bekleyen.add(t);
        // Yeni eklenen tablo(lar) — app.js'in kurduğu ya da kopyaladığı.
        for (const n of k.addedNodes || []) {
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches('table.' + KART)) bekleyen.add(n);
          else if (n.querySelectorAll) n.querySelectorAll('table.' + KART).forEach(x => bekleyen.add(x));
        }
      }
      if (bekleyen.size && !planli) { planli = true; (global.requestAnimationFrame || setTimeout)(isle); }
    });
    gozcu.observe(doc.body, { childList: true, subtree: true });
  }

  AG.tablo = { kur, kutulu, etiketle, kartla, sutunlar, baslikMetni, telefonMu, baslat, sirala, siralamaKur, sayiCoz, anahtar, KART, MATRIS, SIRALI };

  if (doc && doc.addEventListener && !(typeof module !== 'undefined' && module.exports)) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat);
    else baslat();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.tablo;
})(typeof window !== 'undefined' ? window : globalThis);
