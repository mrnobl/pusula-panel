/**
 * İZLE LİSTESİ — #/tarama/izle (sürüm 64.3) `AG.pages.izle`
 * ═══════════════════════════════════════════════════════════════════════════
 * Dikkat listesinin "bakmaya değer" yarısı: KAÇIN temiz, en az 3 ailede verisi olan, kendi kategorisinde ücretine göre ucuz
 * (P/F alt %20) ve holder sayısı 30 günde artan coinler — İZLE (kural-v1 §3, deneme 781), en çok 15. Yanında eşit ağırlıklı puan
 * listesi (puan-v1, deneme 782) GÖLGEDİR: hiçbir karar ondan türetilmez. Sunucu: lib/tarama/izlePanel.js.
 *
 * LİSTE BİR ALIM/SATIM SİNYALİ DEĞİLDİR ve hiçbir bota bağlı değildir. Ön kayıt (A6) gereği hüküm gününden (t0 + 374) önce
 * H-DL2/H-DL2P performansı (getiri farkı, yüzdelik) GÖSTERİLMEZ; yalnız pencere sayısı, liste boyları, girenler/çıkanlar.
 * Isınma (t0 öncesi) listelerinin 30 g ön izlemesi ayrı ve "değerlendirme dışı" etiketlidir.
 * Sunucu verisi her zaman textContent (AG.dom.el) ile yazılır.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const ikonla = () => { if (global.lucide && global.lucide.createIcons) global.lucide.createIcons(); };

  const DURUM = { kip: null, gun: null, ara: '', onIzleme: 'izle' };
  let sonDurum = null, sonListe = null;

  /* ── Biçim ──────────────────────────────────────────────────────────── */
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const tr = (x, d = 0) => x.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const yuzde = (x, d = 0) => (sayiMi(x) ? `%${tr(x * 100, d)}` : '—');
  const isaretliYuzde = (x, d = 1) => (sayiMi(x) ? `${x >= 0 ? '+' : '−'}%${tr(Math.abs(x) * 100, d)}` : '—');
  /** log değişim → yüzde değişim metni (holder 30 g). */
  const logYuzde = (x) => (sayiMi(x) ? isaretliYuzde(Math.exp(x) - 1, 1) : '—');
  function pfMetni(x) {
    if (!sayiMi(x)) return '—';
    return x >= 1000 ? `${tr(x / 1000, 1)} bin×` : `${tr(x, x >= 100 ? 0 : 1)}×`;
  }
  const KANAT = { cex: 'Borsa', dex: 'DEX' };
  const AILE = { temel: 'temel', benimseme: 'benimseme', likidite: 'likidite', gelistirici: 'geliştirici', dagilim: 'dağılım' };

  /* ── Saf görünüm modelleri (öz test bunları sınar) ──────────────────── */
  function sayilarModel(d) {
    const o = (d && d.ozet) || null;
    if (!o) return [{ etiket: 'İZLE listesi', deger: '—', alt: d && d.ilkListeEnErken ? `henüz hesaplanmış gün yok · ilk liste en erken ${d.ilkListeEnErken}` : 'henüz hesaplanmış gün yok' }];
    return [
      { etiket: `İZLE (${o.gun})`, deger: `${tr(o.liste)} / 15`, alt: 'bugün listede', ton: o.liste ? 'tone-success' : null },
      { etiket: 'Bugün giren', deger: tr(o.giren), alt: o.taban ? 'ilk İZLE günü — kıyas yok' : o.oncekiGun ? `${o.oncekiGun} gününe göre` : '—' },
      { etiket: 'Bugün çıkan', deger: tr(o.cikan), alt: o.askida ? `${tr(o.askida)} coin bugün bilinmiyor (askıda)` : 'şartı artık sağlamayan' },
      { etiket: 'Aday havuzu', deger: `${tr(o.havuzSayi)} / ${tr(o.aday)}`, alt: 'P/F\'si olan / KAÇIN temiz + ≥ 3 aile' },
    ];
  }

  /** Boş liste açıklaması: sunucunun nedeni + ilk listenin en erken tarihi. */
  function bosMetin(d, l) {
    const neden = (l && l.bosNeden) || (d && d.ozet && d.ozet.bosNeden) || null;
    const erken = d && d.ilkListeEnErken;
    if (!neden) return 'Bu gün İZLE listesinde coin yok.';
    if (/30 gün önceki kayıt/.test(neden)) return `Liste henüz boş: holder sayısının 30 günlük değişimi gerekiyor ve arşivde 30 gün önceki kayıt yok. İlk liste ≈ 30 kayıt günü sonra${erken ? ` (en erken ${erken})` : ''} çıkar.`;
    return `Bu gün İZLE listesinde coin yok: ${neden}.`;
  }

  /** Hiç İZLE günü yokken: ilk hesap bir sonraki gece; liste holder 30 g değişimi için 30 gün önceki kaydı bekler. */
  function ilkGunMetni(d) {
    const erken = d && d.ilkListeEnErken;
    return `Henüz İZLE hesaplanmış gün yok: ilk hesap bir sonraki gece arşiv koşusunda yapılır. Liste ise holder sayısının 30 günlük değişimini ister; ilk liste ≈ 30 kayıt günü sonra${erken ? ` (en erken ${erken})` : ''} dolar. Puan listesi (gölge) ilk hesaptan itibaren görünür.`;
  }

  function satirModel(x) {
    return {
      anahtar: x.anahtar, sira: x.sira, sembol: x.sembol || x.anahtar, kanat: KANAT[x.kanat] || x.kanat || '—', kategori: x.kategori || '—',
      pf: pfMetni(x.pf), pfYuzdelik: sayiMi(x.pfYuzdelik) ? `${yuzde(x.pfYuzdelik, 0)}${x.yuzdelikKapsam === 'tum' ? ' (tüm)' : ''}` : '—',
      holder30: logYuzde(x.holder30), aile: Array.isArray(x.aileler) ? x.aileler.length : 0, aileMetni: (x.aileler || []).map(a => AILE[a] || a).join(', '),
      giris: x.girisGun || '—', puan: sayiMi(x.puan) ? tr(x.puan, 3) : '—', ozellik: x.ozellikSayisi || 0,
    };
  }
  /** Arama (sembol ya da anahtar, büyük/küçük harf duyarsız); sıra korunur. */
  function ara(l, metin) {
    const a = String(metin || '').trim().toLocaleUpperCase('tr-TR');
    return (l || []).filter(x => !a || String(x.sembol || '').toLocaleUpperCase('tr-TR').includes(a) || String(x.anahtar || '').toLocaleUpperCase('tr-TR').includes(a));
  }

  function onIzlemeModel(k) {
    if (!k) return null;
    return {
      not: k.not, gizli: k.gizli || 0, kutular: [
        { etiket: 'Listeye giren', deger: tr(k.giris) }, { etiket: '30 günü dolan', deger: tr(k.olgun) }, { etiket: 'İzleniyor', deger: tr(k.izleniyor) },
        { etiket: 'Medyan getiri (liste)', deger: isaretliYuzde(k.listeMedyan) }, { etiket: 'Medyan getiri (kontrol)', deger: isaretliYuzde(k.kontrolMedyan) },
        { etiket: 'Kontrolünü geçen', deger: k.kiyas ? `${yuzde(k.gecenPay, 0)} (${tr(k.gecti)} / ${tr(k.kiyas)})` : '—' },
      ],
      satirlar: (k.satirlar || []).map(s => ({ gun: s.gun, sembol: s.sembol || s.anahtar, durum: s.durum === 'izleniyor' ? `izleniyor (${s.hedef})` : s.durum === 'tamam' ? '30 g doldu' : s.durum === 'olu' ? 'öldü (−%100)' : 'ölçülemedi',
        getiri: isaretliYuzde(s.getiri), kontrol: isaretliYuzde(s.kontrolMedyan), kontrolSayi: s.kontrolSayi })),
    };
  }

  /** H-DL2 durumu — hüküm gününden önce yalnız sayım (A6). Getiri alanı modele ASLA girmez. */
  function hdl2Model(h) {
    const x = h || {};
    const p = (x.pencereler || []).map(w => ({ k: w.k, plan: w.planGun, gun: w.gun || '—', boy: w.boy == null ? '—' : String(w.boy), puanBoy: w.puanBoy == null ? '—' : String(w.puanBoy), durum: w.durum }));
    // Hüküm (zincirdeki izle-hukum.json; A6 gereği yalnız hüküm gününden sonra gelir): test başına durum + M'ler
    const testler = x.testler ? Object.entries(x.testler).map(([ad, s]) => ({ ad: ad === 'izle' ? 'İZLE (781)' : 'Puan (782)', durum: s.durum, M: s.M, Mevren: s.Mevren, Mhavuz: s.Mhavuz, p: s.p, gecerli: s.gecerli })) : [];
    return { t0: x.t0 || null, hukum: x.hukumGunu || null, durum: x.durum || 'bekliyor', neden: x.neden || null, pencereler: p, gecerli: x.gecerli || { izle: 0, puan: 0 }, testler };
  }

  /* ── Çizim ──────────────────────────────────────────────────────────── */
  function sayilarCiz(d) {
    const k = bul('izleSayilar');
    if (!k) return;
    doldur(k, sayilarModel(d).map(s => el('div', { class: 'ana-sayi' }, [
      el('span', { class: 'stat-title', text: s.etiket }),
      el('span', { class: `stat-value stat-value-sm sayi ${s.ton || ''}`.trim(), text: s.deger }),
      s.alt ? el('span', { class: 'hint hint-sm mb-0', text: s.alt }) : null,
    ])));
  }

  function seritCiz(d) {
    const k = bul('izleSerit');
    if (!k) return;
    const l = [];
    if (d.hata) l.push(el('p', { class: 'hint tone-danger mb-2', text: `Son günün İZLE hesabı başarısız oldu (${d.hata.gun}): ${d.hata.hata}. Arşiv kaydı etkilenmedi.` }));
    if (d.isinma) l.push(el('p', { class: 'hint mb-2', text: 'Isınma dönemi: evren eşikleri ilk 30 resmî kayıt gününden sonra bir kez sabitlenecek. O güne kadarki listeler ÖN İZLEMEDİR, ön kayıtlı değerlendirmeye (H-DL2) girmez.' }));
    if (d.kip === 'deneme') l.push(el('p', { class: 'hint tone-warning mb-2', text: 'Deneme kaydı gösteriliyor (bu bilgisayar). Resmî kayıt sunucunun gece görevindedir.' }));
    doldur(k, l);
    k.classList.toggle('is-hidden', !l.length);
  }

  function filtreCiz(l) {
    const k = bul('izleFiltre');
    if (!k) return;
    const gunSec = el('select', { id: 'selIzleGun', class: 'form-control', 'aria-label': 'Gün' }, ((l && l.gunler) || []).slice().reverse().map(g => el('option', { value: g, text: g })));
    if (l && l.gun) gunSec.value = l.gun;
    gunSec.addEventListener('change', () => { DURUM.gun = gunSec.value; listeYukle(); });
    const araGir = el('input', { type: 'search', id: 'inpIzleAra', class: 'form-control', placeholder: 'Coin ara (ör. AAVE)', 'aria-label': 'Coin ara', value: DURUM.ara || '', autocomplete: 'off' });
    araGir.addEventListener('input', () => { DURUM.ara = araGir.value; if (sonListe) { listeCiz(sonListe, sonDurum); puanCiz(sonListe); } });
    doldur(k, [araGir, gunSec]);
  }

  function coinHucre(m) {
    return el('td', null, [el('button', { type: 'button', class: 'btn btn-secondary btn-sm', title: 'Ayrıntı', onclick: () => coinAc(m.anahtar) }, [el('span', { text: m.sembol })])]);
  }

  function listeCiz(l, d) {
    const k = bul('izleTablo');
    if (!k) return;
    if (!l || !l.gun) { doldur(k, [el('p', { class: 'hint mb-0', id: 'izleBos', text: ilkGunMetni(d) })]); return; }
    const modeller = ara(l.liste, DURUM.ara).map(satirModel);
    const satirlar = modeller.map(m => el('tr', null, [
      el('td', { class: 'sayi', text: String(m.sira) }), coinHucre(m), el('td', { text: m.kanat }), el('td', { text: m.kategori }),
      el('td', { class: 'sayi', text: m.pf }), el('td', { class: 'sayi', text: m.pfYuzdelik }), el('td', { class: 'sayi', text: m.holder30 }),
      el('td', { class: 'sayi', title: m.aileMetni, text: `${m.aile} / 5` }), el('td', { text: m.giris }),
    ]));
    doldur(k, [
      satirlar.length ? AG.tablo.kutulu({ id: 'tblIzle', sinif: 'table-dense', basliklar: ['Sıra', 'Coin', 'Kanat', 'Kategori', 'P/F', 'Kategori yüzdeliği', 'Holder 30 g', 'Aile', 'Girdiği gün'], satirlar })
        : el('p', { class: 'hint mb-0', id: 'izleBos', text: DURUM.ara && (l.liste || []).length ? `"${DURUM.ara}" bu listede yok.` : bosMetin(d, l) }),
      el('p', { class: 'hint hint-sm mt-3 mb-0', text: `${l.gun} · ${tr(l.kume || 0)} coin incelendi · ${tr(l.aday || 0)} aday (KAÇIN temiz + ≥ 3 aile) · ${tr(l.havuzSayi || 0)} adayın P/F'si var. P/F: piyasa değeri ÷ yıllık ücret (düşük = ücretine göre ucuz).` }),
    ]);
  }

  function puanCiz(l) {
    const k = bul('izlePuan');
    if (!k) return;
    if (!l || !l.gun) { doldur(k, [el('p', { class: 'hint mb-0', text: '—' })]); return; }
    const modeller = ara(l.puanListe, DURUM.ara).map(satirModel);
    const satirlar = modeller.map(m => el('tr', null, [
      el('td', { class: 'sayi', text: String(m.sira) }), coinHucre(m), el('td', { text: m.kanat }), el('td', { text: m.kategori }),
      el('td', { class: 'sayi', text: m.puan }), el('td', { class: 'sayi', text: `${m.ozellik} / 8` }), el('td', { class: 'sayi', text: m.pf }), el('td', { text: m.giris }),
    ]));
    doldur(k, [
      el('p', { class: 'hint mb-3 max-w-prose', text: 'Gölge: aynı adaylar 8 özelliğin eşit ağırlıklı ortalamasıyla sıralanır (0 = en kötü, 1 = en iyi). Ayrı bir deneme (782) olarak yalnız kaydedilir; hiçbir karar bu listeden çıkmaz.' }),
      satirlar.length ? AG.tablo.kutulu({ id: 'tblIzlePuan', sinif: 'table-dense', basliklar: ['Sıra', 'Coin', 'Kanat', 'Kategori', 'Puan', 'Özellik', 'P/F', 'Girdiği gün'], satirlar })
        : el('p', { class: 'hint mb-0', text: DURUM.ara && (l.puanListe || []).length ? `"${DURUM.ara}" bu listede yok.` : 'Bu gün puanı olan aday yok (en az 3 özellik gerekir).' }),
    ]);
  }

  function gecisCiz(l) {
    const k = bul('izleGecis');
    if (!k) return;
    if (!l || !l.gun) { doldur(k, []); return; }
    const cip = (x, sinif) => el('span', { class: `badge ${sinif}`, title: x.anahtar, text: x.sembol || x.anahtar });
    const satir = (baslik, liste, sinif, bos) => el('div', { class: 'mb-3' }, [
      el('h4', { class: 'card-title-sm mb-2', text: `${baslik} (${liste.length})` }),
      liste.length ? el('div', { class: 'row row-wrap gap-1' }, liste.map(x => cip(x, sinif))) : el('p', { class: 'hint hint-sm mb-0', text: bos }),
    ]);
    doldur(k, [
      l.taban ? el('p', { class: 'hint mb-3', text: 'İlk İZLE günü: kıyaslanacak önceki liste yok, giren/çıkan sayılmaz.' }) : null,
      satir('İZLE — giren', l.girenler || [], 'badge-success', 'yok'),
      satir('İZLE — çıkan', l.cikanlar || [], 'badge-warning', 'yok'),
      (l.askida || []).length ? satir('İZLE — bugün bilinmiyor (askıda)', l.askida, 'badge', '') : null,
      satir('Puan — giren', l.puanGirenler || [], 'badge-success', 'yok'),
      satir('Puan — çıkan', l.puanCikanlar || [], 'badge-warning', 'yok'),
      el('p', { class: 'hint hint-sm mb-0', text: 'Giren/çıkan bir önceki kayıt gününün listesine göre. Güvenlik verisi o gün gelmeyen coin "çıktı" sayılmaz, son bilinen durumu korunur.' }),
    ]);
  }

  function onIzlemeCiz(d) {
    const k = bul('izleOnIzleme');
    if (!k) return;
    const m = onIzlemeModel(d.onIzleme && d.onIzleme[DURUM.onIzleme]);
    const dugme = (a, metin) => el('button', { type: 'button', class: `btn btn-sm ${DURUM.onIzleme === a ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': DURUM.onIzleme === a ? 'true' : 'false',
      onclick: () => { DURUM.onIzleme = a; onIzlemeCiz(sonDurum); ikonla(); } }, [el('span', { text: metin })]);
    doldur(k, [
      el('p', { class: 'badge badge-warning mb-3', text: 'Ön izleme (ısınma) — değerlendirme dışı, hüküm değil' }),
      el('div', { class: 'row row-wrap gap-2 mb-3' }, [dugme('izle', 'İZLE listesi'), dugme('puan', 'Puan listesi (gölge)')]),
      el('p', { class: 'hint mb-3 max-w-prose', text: 'Isınma döneminde listeye yeni giren her coin, aynı gün aynı kanat ve likidite diliminden listede olmayan 3 rastgele kontrol coiniyle birlikte 30 gün izlenir (maliyet düşülür, ölen coin −%100). Ön kayıtlı test t0\'dan sonraki 12 pencereyle yapılır ve sonucu hüküm gününe kadar gösterilmez.' }),
      m.gizli ? el('p', { class: 'hint hint-sm mb-3', text: `${m.gizli} giriş henüz gösterilmiyor: 30 günü (+14 gün kayıp payı) değerlendirme başlangıcından (t0) sonraya taşıyor; bu günlerin fiyatları ön kayıtlı testin ilk penceresiyle örtüştüğü için hüküm gününe kadar yalnız sayılır.` }) : null,
      el('div', { class: 'ana-sayilar mb-3' }, m.kutular.map(s => el('div', { class: 'ana-sayi' }, [el('span', { class: 'stat-title', text: s.etiket }), el('span', { class: 'stat-value stat-value-sm sayi', text: s.deger })]))),
      m.satirlar.length ? AG.tablo.kutulu({ id: 'tblIzleOnIzleme', sinif: 'table-dense', basliklar: ['Giriş günü', 'Coin', 'Durum', '30 g getiri', 'Kontrol medyanı', 'Kontrol'], satirlar: m.satirlar.slice(0, 50).map(s => el('tr', null, [
        el('td', { text: s.gun }), el('td', { text: s.sembol }), el('td', { text: s.durum }), el('td', { class: 'sayi', text: s.getiri }), el('td', { class: 'sayi', text: s.kontrol }), el('td', { class: 'sayi', text: String(s.kontrolSayi) }),
      ])) }) : el('p', { class: 'hint mb-0', text: 'Henüz ön izlemeye giren coin yok (liste boşken giriş olmaz).' }),
    ]);
  }

  function hdl2Ciz(d) {
    const k = bul('izleHukum');
    if (!k) return;
    const h = hdl2Model(d.hdl2);
    const kv = (a, v) => [el('dt', { text: a }), el('dd', { class: 'sayi', text: v == null ? '—' : String(v) })];
    doldur(k, [
      el('dl', { class: 'kv-list kv-sik mb-3' }, [
        ...kv('İZLE kuralı', `${d.kural.izle.surum} · deneme ${d.kural.izle.deneme} · SHA ${String(d.kural.izle.sha).slice(0, 12)}…`),
        ...kv('Puan (gölge)', `${d.kural.puan.surum} · deneme ${d.kural.puan.deneme} · SHA ${String(d.kural.puan.sha).slice(0, 12)}…`),
        ...kv('Değerlendirme başlangıcı (t0)', h.t0 || 'eşikler sabitlenince'),
        ...kv('Hüküm günü', h.hukum || 't0 + 374 gün'),
        ...kv('Geçerli pencere (İZLE / puan)', `${h.gecerli.izle} / ${h.gecerli.puan} (en az 5 gerekir, en çok 12)`),
        ...kv('Durum', h.durum === 'bekliyor' ? `bekliyor — ${h.neden || ''}` : h.durum === 'SONUCSUZ' ? `SONUÇSUZ — ${h.neden || ''}` : 'hüküm verildi'),
        ...h.testler.flatMap(s => kv(s.ad, `${s.durum === 'SONUCSUZ' ? 'SONUÇSUZ' : s.durum}${sayiMi(s.M) ? ` · M ${isaretliYuzde(s.M)} · evren ${isaretliYuzde(s.Mevren)} · havuz ${isaretliYuzde(s.Mhavuz)} · p ${tr(s.p, 3)} · ${s.gecerli} pencere` : ''}`)),
      ]),
      h.pencereler.length ? AG.tablo.kutulu({ id: 'tblIzlePencere', sinif: 'table-dense', basliklar: ['Pencere', 'Plan günü', 'Liste günü', 'İZLE boyu', 'Puan boyu', 'Durum'], satirlar: h.pencereler.map(w => el('tr', null, [
        el('td', { class: 'sayi', text: String(w.k + 1) }), el('td', { text: w.plan }), el('td', { text: w.gun }), el('td', { class: 'sayi', text: w.boy }), el('td', { class: 'sayi', text: w.puanBoy }), el('td', { text: w.durum }),
      ])) }) : null,
      el('p', { class: 'hint hint-sm mt-3 mb-0', text: 'Performans (liste ile rastgele sepetlerin getiri farkı) hüküm gününe kadar GÖSTERİLMEZ: ön kayıt 12 pencerenin tamamını tek bakışta test eder; arada bakmak, sonucu görüp kuralı değiştirme riskini doğurur.' }),
    ]);
  }

  async function coinAc(anahtar) {
    const k = bul('izleAyrinti');
    if (!k) return;
    k.classList.remove('is-hidden');
    doldur(k, [el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })]);
    let v; try { v = await AG.api.dikkat.coin(anahtar, DURUM.kip); } catch (e) { v = { success: false, error: e.message }; }
    if (!v || !v.success) { doldur(k, [AG.bildirim.hataKutusu((v && v.error) || 'sunucu yanıt vermedi', { baslik: 'Coin geçmişi okunamadı' })]); return; }
    const g = (v.izle || []).slice().reverse();
    doldur(k, [
      el('div', { class: 'row-between row-wrap gap-2 mb-3' }, [
        el('h3', { class: 'card-title m-0', text: `${v.sembol || anahtar}${v.kanat ? ` · ${KANAT[v.kanat] || v.kanat}` : ''}${v.ag ? ` · ${v.ag}` : ''}` }),
        el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { k.classList.add('is-hidden'); doldur(k, []); } }, [el('span', { text: 'Kapat' })]),
      ]),
      el('p', { class: 'hint hint-sm mb-3', text: `Anahtar: ${anahtar}` }),
      g.length ? AG.tablo.kutulu({ sinif: 'table-dense', basliklar: ['Gün', 'İZLE sırası', 'Puan sırası', 'Aday havuzunda', 'P/F', 'Holder 30 g'], satirlar: g.map(x => el('tr', null, [
        el('td', { text: x.gun }), el('td', { class: 'sayi', text: x.izleSira ? String(x.izleSira) : '—' }), el('td', { class: 'sayi', text: x.puanSira ? String(x.puanSira) : '—' }),
        el('td', { text: x.havuz ? 'evet' : 'hayır' }), el('td', { class: 'sayi', text: pfMetni(x.pf) }), el('td', { class: 'sayi', text: logYuzde(x.holder30) }),
      ])) }) : el('p', { class: 'hint mb-0', text: 'Bu coin için İZLE geçmişi yok.' }),
      el('p', { class: 'hint hint-sm mt-3 mb-0', text: 'Kapı (KAÇIN) geçmişi Dikkat sayfasındadır.' }),
    ]);
    ikonla();
  }

  async function listeYukle() {
    let l; try { l = await AG.api.izle.liste({ kip: DURUM.kip, gun: DURUM.gun }); } catch (e) { l = { success: false, error: e.message }; }
    const k = bul('izleTablo');
    if (!l || !l.success) { if (k) doldur(k, [AG.bildirim.hataKutusu((l && l.error) || 'sunucu yanıt vermedi', { baslik: 'İZLE listesi okunamadı', yeniden: listeYukle })]); return; }
    sonListe = l;
    filtreCiz(l); listeCiz(l, sonDurum); puanCiz(l); gecisCiz(l); ikonla();
  }

  async function yukle() {
    let d; try { d = await AG.api.izle.durum(DURUM.kip); } catch (e) { d = { success: false, error: e.message }; }
    if (!d || !d.success) { const k = bul('izleTablo'); if (k) doldur(k, [AG.bildirim.hataKutusu((d && d.error) || 'sunucu yanıt vermedi', { baslik: 'İZLE listesi okunamadı', yeniden: yukle })]); return; }
    sonDurum = d;
    DURUM.kip = d.kip;
    const kipSec = bul('selIzleKip');
    if (kipSec) kipSec.value = d.kip;
    sayilarCiz(d); seritCiz(d); onIzlemeCiz(d); hdl2Ciz(d);
    await listeYukle();
  }

  function baslat() {
    if (!doc || !doc.addEventListener) return;
    const kipSec = bul('selIzleKip');
    if (kipSec) kipSec.addEventListener('change', () => { DURUM.kip = kipSec.value; DURUM.gun = null; yukle(); });
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-izle') yukle(); });
  }

  AG.pages = AG.pages || {};
  AG.pages.izle = { yukle, coinAc, sayilarModel, satirModel, ilkGunMetni, onIzlemeModel, hdl2Model, bosMetin, ara, pfMetni, logYuzde };
  if (doc && doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat);
  else baslat();
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.izle;
})(typeof window !== 'undefined' ? window : globalThis);
