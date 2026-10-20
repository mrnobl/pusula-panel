/**
 * PORTFÖYÜM RAPORU — Portföy › "Rapor" alt sekmesi (sürüm 64.2, PLAN-PORTFOYUM P6; kullanıcı taslağı A, 2026-10-15) `AG.pages.portfoyumRapor`
 * ═══════════════════════════════════════════════════════════════════════════
 * Yalnız bakılır (telefonda da aynı; yazma yok). Veri: GET /api/portfoyum/rapor?ay=&hesap= (sunucu lib/portfoyum/rapor.js).
 * Bölümler (yukarıdan aşağı): ay + hesap seçici · seçili ayın altı kutusu (ay başı → ay sonu, para girişi/çıkışı, piyasa
 * etkisi, zaman ağırlıklı getiri, para ağırlıklı getiri, TL enflasyon hariç) · "Başlangıçtan" (para ağırlıklı + TL reel) ·
 * bu ay en çok etkileyenler (kazandıran / kaybettiren) · stres tablosu (doğrudan pay ↔ geçmiş ilişkiyle / beta) ·
 * sınıflar arası korelasyon ısı tablosu.
 * 68.7: hesap seçicide yalnız üst çubukta seçili kişinin hesapları (kisiHesaplari; Tümü = hepsi).
 * Kurallar: tüm DOM AG.dom.el, tablolar AG.tablo, renkler token sınıfları (inline stil yok). Tutarlar `.pm-tutar` —
 * Üst çubuktaki $ / ₺ / Gizli seçicisinin "Gizli"si (localStorage 'pusula.portfoy.gorunum', F6) burada da geçerli. Eksik veri her yerde
 * "—" ve nedeni; hiçbir fiyat uydurulmaz. Telegram'a gitmez (K6).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const api = () => AG.api.portfoyum;

  const GORUNUM_ANAHTAR = 'pusula.portfoy.gorunum';   // F6: üst çubuk $ / ₺ / Gizli (pano.js yazar)
  let veri = null;
  let secAy = '';        // '' = sunucunun varsayılanı (son biten ay) · 'buay' · 'YYYY-AA'
  let secHesap = '';
  let yukleniyor = false;
  let sonYukleme = 0;

  function oku(k) { try { return global.localStorage ? global.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function gizliMi() { try { const g = JSON.parse(oku(GORUNUM_ANAHTAR) || 'null'); return !!g && g.para === 'gizli'; } catch (e) { return false; } }

  /* ── Saf biçim (scripts/portfoyum-rapor-selftest.js sınar) ─────────── */
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  /** "$1.234" · eksi U+2212 ("−$60"). */
  function usd(x, b = 0) {
    if (!sayiMi(x)) return '—';
    const n = Math.abs(x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b });
    return `${x < 0 && /[1-9]/.test(n) ? '−' : ''}$${n}`;
  }
  /** "+$276" / "−$60" / "$0". */
  function isaretliUsd(x, b = 0) {
    if (!sayiMi(x)) return '—';
    const s = usd(x, b);
    return x > 0 && /[1-9]/.test(s) ? '+' + s : s;
  }
  function isaretliTl(x) {
    if (!sayiMi(x)) return '—';
    const n = Math.abs(x).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
    return `${x < 0 && /[1-9]/.test(n) ? '−' : x > 0 && /[1-9]/.test(n) ? '+' : ''}₺${n}`;
  }
  const yuzde = (x, b = 1) => AG.fmt.oranYuzde(x, b);
  const isaretliYuzde = (x, b = 1) => AG.fmt.oranYuzde(x, b, { isaretli: true });
  /** Korelasyon "0,42" / "−0,08" (2 ondalık, Türkçe). */
  function korBicim(x) {
    if (!sayiMi(x)) return '—';
    const m = Math.abs(x).toFixed(2).replace('.', ',');
    return (x < 0 && m !== '0,00' ? '−' : '') + m;
  }
  const ton = (x) => (!sayiMi(x) || Math.abs(x) < 1e-9 ? 'tone-muted' : x > 0 ? 'tone-success' : 'tone-danger');
  /** Isı sınıfı (laboratuvar korelasyonuyla aynı pf-isi kovaları; ölçek 1). */
  function isiSinifi(x) {
    if (!sayiMi(x)) return 'pf-isi-bos';
    const a = Math.abs(x);
    const kova = a < 0.34 ? 1 : a < 0.67 ? 2 : 3;
    return x >= 0 ? `pf-isi-p${kova}` : `pf-isi-n${kova}`;
  }
  /** Korelasyon hücresi metni: değer · "veri az" · "—" (sabit). */
  const korMetin = (c) => (!c ? '—' : c.az ? 'veri az' : c.deger == null ? '—' : korBicim(c.deger));
  /** Ay seçicisinin değeri (sunucu yanıtındaki ay). */
  const ayDegeri = (a) => (a.devam ? 'buay' : a.ay);

  const tutar = (metin, ek) => el('span', { class: `pm-tutar${ek ? ' ' + ek : ''}`, text: metin });
  const ikon = (ad) => el('i', { class: 'tone-primary', 'data-lucide': ad });
  const bolumBaslik = (ikonAd, metin) => el('h3', { class: 'card-title mb-3' }, [ikon(ikonAd), el('span', { text: ' ' + metin })]);
  function kutu(etiket, deger, alt, ipucu) {
    return el('div', { class: 'ana-sayi', title: ipucu || null }, [
      el('span', { class: 'stat-title', text: etiket }),
      el('span', { class: 'stat-value stat-value-sm sayi' }, [deger && deger.nodeType ? deger : el('span', { text: deger })]),
      alt ? el('span', { class: 'hint hint-sm mb-0' }, [alt.nodeType ? alt : el('span', { text: alt })]) : null
    ]);
  }

  /** Üst çubukta seçili kişi (portföy): 'ben' | <kimlik> | 'tumu' | '' (pano yüklenmemiş). */
  const seciliKisi = () => (AG.pages.pano ? AG.pages.pano.gorunum().portfoy : '');
  /**
   * 68.7 (saf): hesap seçicide yalnız seçili kişinin hesapları (portföyü yazılmamış hesap Ben'in); Tümü / boş = hepsi.
   * Sunucu portfoy alanını hiç göndermiyorsa (68.7'den eski) süzülmez.
   */
  function kisiHesaplari(hesaplar, pf) {
    if (!pf || pf === 'tumu' || !(hesaplar || []).some(h => 'portfoy' in h)) return hesaplar || [];
    return hesaplar.filter(h => (h.portfoy || 'ben') === pf);
  }

  /* ── Bölümler ───────────────────────────────────────────────────────── */
  function ustCiz() {
    const k = bul('prUst');
    if (!k) return;
    const aylar = (veri && veri.aylar) || [];
    const hesaplar = kisiHesaplari((veri && veri.hesaplar) || [], seciliKisi());
    const ay = veri ? (aylar.find(a => a.ay === veri.ay) || {}) : {};
    const ayS = el('select', { id: 'selPrAy', class: 'form-control control-sm', 'aria-label': 'Rapor ayı', onchange: (e) => { secAy = e.target.value; yukle(true); } },
      aylar.map(a => el('option', { value: ayDegeri(a), text: a.devam ? `${a.ad} — bu ay (devam ediyor)` : a.ad })));
    if (veri) ayS.value = ayDegeri(ay);
    const hS = el('select', { id: 'selPrHesap', class: 'form-control control-sm', 'aria-label': 'Hesap', onchange: (e) => { secHesap = e.target.value; yukle(true); } },
      [el('option', { value: '', text: 'Bütün hesaplar' }), ...hesaplar.map(h => el('option', { value: h.id, text: h.ad + (h.durum === 'kapali' ? ' (kapalı)' : '') }))]);
    hS.value = secHesap;
    doldur(k, [
      el('div', { class: 'row-between row-wrap gap-2' }, [
        el('div', null, [el('h3', { class: 'card-title m-0' }, [ikon('file-bar-chart'), el('span', { text: ' Rapor' })]),
          el('p', { class: 'hint hint-sm mb-0', text: 'Ay ay ne oldu, paran ne kazandırdı, kötü bir günde ne olurdu. Yalnız bakılır; hiçbir şey değiştirmez.' })]),
        el('div', { class: 'pf-dugmeler pr-secici' }, [
          el('label', { class: 'pf-alan' }, [el('span', { text: 'Ay' }), ayS]),
          el('label', { class: 'pf-alan' }, [el('span', { text: 'Hesap' }), hS]),
          el('button', { type: 'button', id: 'btnPrYenile', class: 'btn btn-secondary btn-sm', onclick: () => yukle(true) }, [el('span', { text: 'Yenile' })])
        ])
      ])
    ]);
  }

  function bantCiz() {
    const k = bul('prBant');
    if (!k) return;
    const m = [];
    const a = veri && veri.aylik;
    if (a && a.eksik) m.push('Bu ayın bazı günlerinde bir kalemin fiyatı ya da kuru yoktu: o kalem o gün toplama girmedi; rakamlar eksik olabilir ("Fiyatları yenile").');
    if (a && a.degerlenemeyen && a.degerlenemeyen.length) m.push(`Değerlenemeyen kalem: ${a.degerlenemeyen.join(', ')} — katkısı hesaplanamadı.`);
    const s = veri && veri.stres;
    const veriAz = s ? [...new Set(s.senaryolar.flatMap(x => (x.beta && x.beta.eksik) || []))] : [];
    if (veriAz.length) m.push(`Geçmiş fiyatı 26 haftadan kısa (beta hesaplanamadı): ${veriAz.join(', ')} — Portföyüm › "Fiyatları yenile" geçmişi indirir.`);
    k.classList.toggle('is-hidden', !m.length);
    doldur(k, m.length ? [el('ul', { class: 'pf-uyari-liste' }, m.map(x => el('li', { class: 'pf-uyari pf-uyari-uyari', text: x })))] : []);
  }

  function ayCiz() {
    const k = bul('prAy');
    if (!k) return;
    const a = veri.aylik;
    const bas = el('h4', { class: 'pf-bolum-baslik', text: `${a.ad}${a.bitti ? '' : ' — devam ediyor (bugüne kadar)'}` });
    if (a.bos) { doldur(k, [bas, el('p', { class: 'hint mb-0', text: a.mesaj || 'Bu ay için veri yok.' })]); return; }
    const tl = a.tlReel || {};
    doldur(k, [bas,
      el('div', { class: 'ana-sayilar', id: 'prAySayilar' }, [
        kutu('Ay başı → ay sonu', el('span', null, [tutar(usd(a.V0)), el('span', { text: ' → ' }), tutar(usd(a.V1))]),
          el('span', null, [el('span', { text: 'fark ' }), tutar(isaretliUsd(a.fark), ton(a.fark))]), `${a.t0Gun} gün sonu → ${a.bit} gün sonu (USD)`),
        kutu('Para girişi / çıkışı', tutar(isaretliUsd(a.akis), ton(a.akis)), a.akisAdet ? `${a.akisAdet} işlem (yatırma, çekme, açılış)` : 'bu ay para girişi/çıkışı yok',
          'Dışarıdan konan (+) ya da çekilen (−) para; açılış bakiyesi de giriş sayılır'),
        kutu('Piyasa etkisi', tutar(isaretliUsd(a.piyasa), ton(a.piyasa)), 'fark − para girişi/çıkışı', 'Fiyat ve kur hareketi, temettü, faiz ve ücretlerin toplam etkisi'),
        kutu('Zaman ağırlıklı getiri', el('span', { class: ton(a.twrUSD), text: isaretliYuzde(a.twrUSD) }), 'USD · para yatırıp çekmenden etkilenmez', 'Yatırımların ne kadar iyi gitti (fon yöneticisi ölçüsü)'),
        kutu('Para ağırlıklı getiri', el('span', { class: ton(a.mwr && a.mwr.donem), text: a.mwr ? isaretliYuzde(a.mwr.donem) : '—' }),
          a.mwr ? 'USD · senin paranın getirisi (yıllığa çevrilmedi)' : 'hesaplanamadı', 'Ne zaman ne kadar para koyduğun da hesaba girer (iç verim oranı)'),
        kutu('TL, enflasyon hariç', el('span', { class: ton(tl.deger), text: sayiMi(tl.deger) ? isaretliYuzde(tl.deger) : '—' }),
          el('span', null, [el('span', { text: `TL getiri ${isaretliYuzde(a.twrTL)} · ` }), el('span', { class: sayiMi(tl.deger) ? '' : 'tone-warning', text: tl.mesaj || '' })]),
          'TL zaman ağırlıklı getiri, o ayın TÜFE artışı çıkarılarak')
      ])
    ]);
  }

  function baslangicCiz() {
    const k = bul('prBaslangic');
    if (!k) return;
    const b = veri.baslangictan;
    const bas = el('h4', { class: 'pf-bolum-baslik', text: 'Başlangıçtan' });
    if (!b) { doldur(k, [bas, el('p', { class: 'hint mb-0', text: 'Henüz kayıt yok.' })]); return; }
    const tl = b.tlReel || {};
    doldur(k, [bas, el('div', { class: 'ana-sayilar', id: 'prBasSayilar' }, [
      kutu('Para ağırlıklı getiri', el('span', { class: ton(b.mwr && b.mwr.donem), text: b.mwr ? isaretliYuzde(b.mwr.donem) : '—' }),
        el('span', null, [el('span', { text: `${b.bas}'den, ${b.gun} gün · ` }), el('span', { text: b.mwr && sayiMi(b.mwr.yillik) ? `yıllık ${isaretliYuzde(b.mwr.yillik)}` : (b.yillikMesaj || '') })]),
        'USD; para giriş-çıkış zamanları dahil'),
      kutu('Zaman ağırlıklı getiri', el('span', { class: ton(b.twrUSD), text: isaretliYuzde(b.twrUSD) }), 'USD · karşılaştırma için', 'Portföyüm sekmesindeki "Başlangıçtan" ile aynı'),
      kutu('TL, enflasyon hariç', el('span', { class: ton(tl.deger), text: sayiMi(tl.deger) ? isaretliYuzde(tl.deger) : '—' }), el('span', { class: sayiMi(tl.deger) ? '' : 'tone-warning', text: tl.mesaj || '' }),
        'TL zaman ağırlıklı getiri ÷ aynı dönemin TÜFE artışı')
    ])]);
  }

  function etkileyenCiz() {
    const k = bul('prEtkileyen');
    if (!k) return;
    const a = veri.aylik;
    const bas = bolumBaslik('arrow-up-down', `${a.ad || 'Bu ay'}: en çok etkileyenler`);
    if (a.bos) { doldur(k, [bas, el('p', { class: 'hint mb-0', text: 'Bu ay için veri yok.' })]); return; }
    const l = a.katkilar || [];
    const art = l.filter(x => x.katki > 0.005).slice(0, 5), eksi = l.filter(x => x.katki < -0.005).reverse().slice(0, 5);
    const tablo = (id, liste, bosMetin) => (liste.length ? AG.tablo.kutulu({ id, sinif: 'table-dense pf-tablo', basliklar: ['Varlık', 'Katkı (USD)', 'Kendi getirisi'],
      satirlar: liste.map(x => el('tr', null, [
        el('td', { class: 'pf-sola' }, [el('div', { class: 'fw-semibold', text: x.sembol }), el('div', { class: 'pf-kucuk', text: x.ad || '' })]),
        el('td', { class: `sayi ${ton(x.katki)}` }, [tutar(isaretliUsd(x.katki))]),
        el('td', { class: `sayi ${ton(x.getiri)}`, text: sayiMi(x.getiri) ? isaretliYuzde(x.getiri) : '—' })
      ])) }) : el('p', { class: 'hint hint-sm mb-0', text: bosMetin }));
    doldur(k, [bas,
      el('div', { class: 'mp-iki pr-iki' }, [
        el('div', { class: 'mp-blok' }, [el('h4', { class: 'pf-bolum-baslik', text: 'Kazandıranlar' }), tablo('tblPrArti', art, 'Bu ay kazandıran kalem yok.')]),
        el('div', { class: 'mp-blok' }, [el('h4', { class: 'pf-bolum-baslik', text: 'Kaybettirenler' }), tablo('tblPrEksi', eksi, 'Bu ay kaybettiren kalem yok.')])
      ]),
      el('p', { class: 'hint hint-sm mt-2 mb-0' }, [
        el('span', { text: 'Katkı = kalemin ay sonu değeri − ay başı değeri − ay içinde ona koyduğun net para (alış +, satış −). Alış ücreti o kalemin katkısından düşer; temettü kalemine yazılır; nakit satırı faiz, ücret ve kur etkisidir. Katkıların toplamı piyasa etkisine eşittir' }),
        a.digerKatki ? el('span', null, [el('span', { text: ' (değerlenemeyen kalemler: ' }), tutar(isaretliUsd(a.digerKatki, 2)), el('span', { text: ')' })]) : null,
        el('span', { text: '. Kendi getirisi: kalemin bu ayki dolar fiyat değişimi.' })
      ])
    ]);
  }

  /** Stres çubuğu: iki ince çubuk (doğrudan · beta), portföyün yüzdesi olarak (ölçek %50 = tam genişlik). */
  function cubuk(d, b) {
    const w = (x) => Math.max(0.5, Math.min(100, Math.abs(x) * 200));
    const parca = [];
    if (sayiMi(d)) parca.push(AG.dom.svg('rect', { x: 0, y: 0, width: w(d), height: 4, class: d < 0 ? 'pr-cubuk-eksi' : 'pr-cubuk-arti' }));
    if (sayiMi(b)) parca.push(AG.dom.svg('rect', { x: 0, y: 6, width: w(b), height: 4, class: `${b < 0 ? 'pr-cubuk-eksi' : 'pr-cubuk-arti'} pr-cubuk-ikinci` }));
    return AG.dom.svg('svg', { class: 'pr-cubuk', viewBox: '0 0 100 10', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, parca);
  }

  function stresCiz() {
    const k = bul('prStres');
    if (!k) return;
    const s = veri.stres;
    const bas = bolumBaslik('shield-alert', 'Kötü senaryolar (bugünkü portföyle)');
    if (!s || !s.kalemSayisi) { doldur(k, [bas, el('p', { class: 'hint mb-0', text: 'Değerlenen kalem yok.' })]); return; }
    const hucre = (x, tlGoster) => (x ? el('td', { class: `sayi ${ton(x.usd)}` }, [
      tutar(isaretliUsd(x.usd)),
      el('div', { class: 'pf-kucuk', text: `portföyün ${isaretliYuzde(x.oran)}` }),
      tlGoster && sayiMi(x.tl) ? el('div', { class: 'pf-kucuk' }, [el('span', { text: 'TL: ' }), tutar(isaretliTl(x.tl))]) : null,
      // Denetim 64.2: istatistiksel olarak zayıf ilişkili kalemler (BTC/Nasdaq/altında ham β yine kullanılır; Dolar/TL'de 0 sayılır)
      x.sifirlanan && x.sifirlanan.length ? el('div', { class: 'pf-kucuk tone-muted', text: `zayıf ilişki, 0 sayıldı: ${x.sifirlanan.join(', ')}` })
        : x.zayif && x.zayif.length ? el('div', { class: 'pf-kucuk tone-muted', text: `zayıf ilişki (yine sayıldı): ${x.zayif.join(', ')}` }) : null
    ]) : el('td', { class: 'sayi tone-muted', text: '—', title: '2022 tekrarında beta yok: her kalem kendi 2022 getirisini yaşar' }));
    const satirlar = s.senaryolar.map(x => el('tr', { 'data-senaryo': x.kimlik }, [
      el('td', { class: 'pf-sola' }, [el('div', { class: 'fw-semibold', text: x.ad }), el('div', { class: 'pf-kucuk', text: x.not || '' }),
        x.vekiller && x.vekiller.length ? el('div', { class: 'pf-kucuk tone-warning', text: `vekil: ${x.vekiller.map(v => `${v.sembol} → ${v.vekil}`).join(', ')}` }) : null,
        x.dogrudan && x.dogrudan.eksik && x.dogrudan.eksik.length ? el('div', { class: 'pf-kucuk tone-warning', text: `2022 verisi yok: ${x.dogrudan.eksik.join(', ')}` }) : null]),
      hucre(x.dogrudan, x.kimlik === 'dolar'),
      hucre(x.beta, x.kimlik === 'dolar'),
      el('td', { class: 'pr-cubuk-hucre', 'data-sirasiz': '1' }, [cubuk(x.dogrudan && x.dogrudan.oran, x.beta && x.beta.oran)])
    ]));
    doldur(k, [bas,
      el('p', { class: 'hint hint-sm mb-2' }, [el('span', { text: 'Bugünkü değer ' }), tutar(usd(s.toplamUSD)), el('span', { text: ` · ${s.kalemSayisi} kalem. Kayıplar dolar cinsinden; ` }),
        el('span', { text: 'çubukta üstteki doğrudan pay, alttaki (soluk) geçmiş ilişki.' })]),
      AG.tablo.kutulu({ id: 'tblPrStres', sinif: 'table-dense pf-tablo pr-stres', basliklar: ['Senaryo', 'Doğrudan pay', 'Geçmiş ilişkiyle (beta)', ''], satirlar }),
      el('p', { class: 'hint hint-sm mt-2 mb-1', text: 'Doğrudan pay: senaryonun vurduğu kalemler şok kadar düşer, gerisi yerinde kalır — BTC −%50 → kripto sınıfı; Nasdaq −%30 → dolar cinsi hisse ve endeks fonları (TEFAS fonları kayıtta "yabancı hisse" diye ayrılmadığı için dahil değil); Altın −%20 → altın/emtia sınıfı (gram altın dahil); Dolar/TL +%30 → TL cinsi her kalemin dolar değeri 1,3\'e bölünür (gram altın ve yabancı hisse fonu TL\'de yükselse bile). TL satırı: dolarla yaşayan kalemlerin TL değeri artar. 2022 tekrarı sınırı: vekil kullanılan TL mevduat/nakit 2022 faizini almaz (kaybı olduğundan fazla gösterir); dolar cinsi tahvil ve dolar nakit %0 sayılır (2022\'deki tahvil kaybı görünmez).' }),
      el('p', { class: 'hint hint-sm mb-0', text: `Beta: son ${s.hafta} haftanın haftalık dolar getirilerinde kalemin faktörle (BTC, QQQ, GLD, TL'nin dolar değeri) birlikte ne kadar oynadığı; faktörün kendisi tam şoku alır, ilişkisi istatistiksel olarak zayıf kalem (tesadüf olabilir) "zayıf ilişki" diye işaretlenir ama kaybı yine sayılır — yalnız Dolar/TL'de 0 sayılır (dolar/TL haftalık çok az oynadığı için zayıf ilişki %30 şokla çarpılınca saçma kâr/zarar çıkar); ${s.enAzHafta} haftadan kısa geçmiş "veri az". Uyarı: büyük çöküşte ilişkiler değişir (krizde her şey birlikte düşer) — bu bir tahmin değil, kaba ölçüdür.` })
    ]);
  }

  function korelasyonCiz() {
    const k = bul('prKorelasyon');
    if (!k) return;
    const kr = veri.korelasyon;
    const bas = bolumBaslik('grid-3x3', 'Sınıflar birlikte mi hareket ediyor? (korelasyon)');
    if (!kr || kr.siniflar.length < 2) { doldur(k, [bas, el('p', { class: 'hint mb-0', text: 'En az iki sınıf gerekli.' })]); return; }
    const satirlar = kr.siniflar.map((a, i) => el('tr', null, [
      el('td', { class: 'pf-sola fw-semibold', text: a.ad }),
      ...kr.matris[i].map((c, j) => el('td', { class: i === j || !c || c.deger == null ? 'pf-isi-bos' : isiSinifi(c.deger),
        title: `${a.ad} ↔ ${kr.siniflar[j].ad}: ${c && c.az ? `${c.hafta} ortak hafta (en az ${kr.enAzHafta} gerekli)` : c && c.sabit ? 'getirisi oynamıyor (sabit)' : `${c ? c.hafta : 0} hafta`}`, text: korMetin(c) }))
    ]));
    doldur(k, [bas,
      AG.tablo.kutulu({ id: 'tblPrKorelasyon', sinif: 'table-dense pf-tablo pf-isi', matris: true, basliklar: ['', ...kr.siniflar.map(s => s.ad)], satirlar }),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: `Son 1 yıl (${kr.bas} → ${kr.bit}), haftalık dolar getirisi; sınıfın getirisi içindeki varlıkların bugünkü ağırlıklarıyla. 1'e yakın: birlikte inip çıkar (çeşitlendirme yok); 0: ilgisiz; eksi: biri düşerken öbürü tutar. "veri az": ${kr.enAzHafta} haftadan az ortak veri; "—": getirisi oynamayan (dolar nakit). Krizlerde korelasyonlar genelde yükselir.` })
    ]);
  }

  /* ── İskelet ve yükleme ─────────────────────────────────────────────── */
  function iskelet(kap) {
    if (!kap) return false;
    doldur(kap, [el('div', { id: 'prKok', class: `pm-kok${gizliMi() ? ' pm-gizli' : ''}` }, [
      el('div', { id: 'prUst', class: 'glass-panel panel-pad mb-3' }),
      el('div', { id: 'prBant', class: 'is-hidden mb-3' }),
      el('div', { class: 'glass-panel panel-pad pm-sayfa' }, [
        el('div', { id: 'prAy', class: 'mp-blok', 'aria-live': 'polite' }),
        el('div', { id: 'prBaslangic', class: 'mp-blok' })
      ]),
      el('div', { id: 'prEtkileyen', class: 'glass-panel panel-pad mt-4' }),
      el('div', { id: 'prStres', class: 'glass-panel panel-pad mt-4' }),
      el('div', { id: 'prKorelasyon', class: 'glass-panel panel-pad mt-4' })
    ])]);
    return true;
  }

  function ciz() {
    if (!veri) return;
    const kok = bul('prKok');
    if (kok && kok.classList) kok.classList.toggle('pm-gizli', gizliMi());
    ustCiz(); bantCiz(); ayCiz(); baslangicCiz(); etkileyenCiz(); stresCiz(); korelasyonCiz();
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  async function yukle(zorla) {
    const kap = bul('pfRaporKok');
    if (!kap) return;
    if (!bul('prKok')) iskelet(kap);
    if (yukleniyor) return;
    if (!zorla && veri && Date.now() - sonYukleme < 60e3) { ciz(); return; }
    yukleniyor = true;
    if (!veri) ustCiz();
    try {
      // Yeni panel F4: üst çubukta seçili portföyün raporu (K-F; hesap seçilirse yalnız o hesap).
      const pf = seciliKisi();
      // 68.7: seçili hesap başka kişinin (üst çubukta kişi değişti) → o kişinin bütün hesapları
      if (secHesap && veri && !kisiHesaplari(veri.hesaplar || [], pf).some(h => h.id === secHesap)) secHesap = '';
      const r = await api().rapor({ ay: secAy, hesap: secHesap, portfoy: pf });
      if (!r || !r.success) throw new Error((r && r.error) || 'sunucu yanıt vermedi');
      veri = r; sonYukleme = Date.now();
      ciz();
    } catch (e) {
      const k = bul('prAy');
      if (k) doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'Rapor okunamadı', yeniden: () => yukle(true) })]);
    } finally { yukleniyor = false; }
  }

  AG.pages = AG.pages || {};
  AG.pages.portfoyumRapor = {
    yukle, iskelet, kisiHesaplari, usd, isaretliUsd, isaretliTl, korBicim, korMetin, isiSinifi, ayDegeri,
    _ciz: { ustCiz, bantCiz, ayCiz, baslangicCiz, etkileyenCiz, stresCiz, korelasyonCiz, ciz },
    _durum: { veriAyarla: (v) => { veri = v; }, veri: () => veri }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.portfoyumRapor;
})(typeof window !== 'undefined' ? window : globalThis);
