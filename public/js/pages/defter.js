/**
 * ARAŞTIRMA DEFTERİ — #/arastirma/defter (sürüm 60.6) `AG.pages.defter`
 * ═══════════════════════════════════════════════════════════════════════════
 * Deneme sayacının kanonik kaydı `kayitlar/denemeler.jsonl` (sunucu: lib/defter.js, GET/POST /api/defter).
 *
 *   · Üstte sayaç kartları: toplam deneme (en yüksek numara) ve durum başına NUMARA sayısı (aralık uzunluğu kadar).
 *   · "Hükmü yaklaşanlar" (GOLGE / ACIK, hüküm tarihi sıralı, kalan gün) ve aile sayacı (tıklayınca süzer).
 *   · Arama (başlık / hipotez / sonuç / neden / plan / aile; sayı yazılırsa o numarayı kapsayan kayıt), durum ve aile süzgeci,
 *     AG.tablo sıralanabilir tablo (≤ 1023 px'te kart). Satır açılınca tüm alanlar (commit'ler kısa hash METİN olarak —
 *     sunucu git çalıştırmaz).
 *   · Denetim hatası (çakışma, boşluk, biçim) varsa kırmızı bant.
 *   · "Yeni kayıt" formu YALNIZ masaüstünde (telefon kademesinde gizli; sunucu da 403 verir), sonraki boş numarayı önerir.
 * Sunucu verisi her zaman textContent (AG.dom.el); işaretleme ayrıştıran yazım yok (scripts/panel-denetim.js 5b).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);

  let veri = null;
  const suzgec = { ara: '', durum: '', aile: '' };
  // B-29 (61.1): 200+ kayıt tek tabloda sayfayı 12.000 px'e uzatıyordu → ilk 50 satır + "daha fazla göster".
  // Arama ve süzgeçler TÜM defterde çalışır; yalnız çizilen satır sayısı sınırlı. Süzgeç değişince 50'ye döner.
  const SAYFA = 50;
  let gosterilen = SAYFA;
  let acik = null;   // açık satırın ilk numarası

  /* ── Saf modeller (test edilir) ─────────────────────────────────────── */

  const DURUM_AD = { RED: 'RED', KABUL: 'KABUL', GOLGE: 'GÖLGE', BOS: 'BOŞ', BELGESIZ: 'BELGESİZ', BILGI: 'BİLGİ', ACIK: 'AÇIK' };
  const DURUM_SINIF = { RED: 'badge badge-danger', KABUL: 'badge badge-success', GOLGE: 'badge badge-warning', ACIK: 'badge badge-warning', BELGESIZ: 'badge badge-warning', BOS: 'badge', BILGI: 'badge' };
  const HOLDOUT_AD = { acildi: 'açıldı', acilmadi: 'açılmadı', yok: 'yok', bekliyor: 'bekliyor' };
  const KART_DURUMLARI = ['RED', 'GOLGE', 'ACIK', 'KABUL', 'BILGI', 'BOS', 'BELGESIZ'];   // hepsi: kart toplamı = numara toplamı
  const ARANAN = ['baslik', 'hipotez', 'sonuc', 'neden', 'plan', 'aile', 'aileAd'];

  const kucuk = (s) => String(s == null ? '' : s).toLocaleLowerCase('tr-TR');
  const numara = (a) => (Array.isArray(a) ? (a[0] === a[1] ? `#${a[0]}` : `#${a[0]}–${a[1]}`) : '#?');
  const uzunluk = (k) => (Array.isArray(k.aralik) ? k.aralik[1] - k.aralik[0] + 1 : 0);
  const kisaHash = (h) => (h ? String(h).slice(0, 7) : '—');
  /** 2026-10-18 → 18.10.2026 (geçersizse boş). */
  const gunTr = (g) => (/^\d{4}-\d{2}-\d{2}$/.test(String(g || '')) ? `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}` : '');
  const bugun = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const gecerliKayit = (k) => k && !k._gecersiz && Array.isArray(k.aralik) && k.aralik.length === 2;

  /** Süzgeç: arama (Türkçe harf duyarsız; tam sayı → o numarayı kapsayan kayıt) + durum + aile. */
  function suz(kayitlar, s) {
    const q = kucuk((s && s.ara) || '').trim();
    const sayi = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null;
    return (kayitlar || []).filter(gecerliKayit).filter(k => {
      if (s && s.durum && k.durum !== s.durum) return false;
      if (s && s.aile && k.aile !== s.aile) return false;
      if (!q) return true;
      if (sayi != null && k.aralik[0] <= sayi && sayi <= k.aralik[1]) return true;
      return ARANAN.some(a => kucuk(k[a]).includes(q));
    });
  }

  /** Sayaç kartları modeli. */
  function sayacKartlari(oz) {
    const d = (oz && oz.durumlar) || {};
    const ayr = oz && oz.ayrilmisBos && oz.ayrilmisBos.length ? ` · ayrılmış boş ${oz.ayrilmisBos.map(numara).join(', ')}` : '';
    return [{ etiket: 'Toplam deneme', deger: String((oz && oz.toplam) || 0), alt: oz ? `${oz.kayitSayisi} kayıt${ayr} · sonraki boş #${oz.sonrakiBos}` : '', durum: '' }]
      .concat(KART_DURUMLARI.map(x => ({ etiket: DURUM_AD[x], deger: String(d[x] || 0), alt: 'numara', durum: x })));
  }

  /** Kalan gün metni. */
  function kalanMetni(g) {
    if (typeof g !== 'number' || !Number.isFinite(g)) return '—';
    if (g < 0) return `${-g} gün geçti`;
    if (g === 0) return 'bugün';
    return `${g} gün`;
  }

  /** Aile kimliği: ASCII küçük harf (tr-TR yerel ayarı "I"yı "ı" yapardı ve kebab-id denetimi düşerdi): İ/I/ı → i. */
  const aileKimligi = (s) => String(s == null ? '' : s).trim().replace(/[İIı]/g, 'i').toLowerCase();

  /** Formdan kayıt gövdesi (sözleşme alanları; boş isteğe bağlı alan → null). */
  function formGovdesi(degerler) {
    const v = degerler || {};
    const m = (x) => { const t = String(x == null ? '' : x).trim(); return t || null; };
    const ilk = Number(v.ilk), son = v.son === '' || v.son == null ? Number(v.ilk) : Number(v.son);
    return {
      aralik: [ilk, son], aile: aileKimligi(v.aile), aileAd: String(v.aileAd || '').trim(), baslik: String(v.baslik || '').trim(),
      hipotez: String(v.hipotez || '').trim(), tarih: m(v.tarih), plan: m(v.plan), onKayitCommit: m(v.onKayitCommit), sonucCommit: m(v.sonucCommit),
      holdout: v.holdout || 'bekliyor', durum: v.durum || 'ACIK', sonuc: String(v.sonuc || '').trim(), neden: m(v.neden), hukumTarihi: m(v.hukumTarihi),
      kaynak: String(v.kaynak || '').trim() || 'panel',
    };
  }

  /* ── Çizim ──────────────────────────────────────────────────────────── */
  const rozet = (d) => el('span', { class: DURUM_SINIF[d] || 'badge', text: DURUM_AD[d] || String(d || '?') });

  function bantCiz(hatalar) {
    const k = bul('defterBant');
    if (!k) return;
    const h = hatalar || [];
    k.classList.toggle('is-hidden', !h.length);
    if (!h.length) { doldur(k, []); return; }
    const goster = h.slice(0, 12);
    doldur(k, [el('div', { class: 'hata-kutu', role: 'alert' }, [
      el('strong', { class: 'hata-kutu-baslik', text: `Defter denetimi: ${h.length} hata` }),
      el('div', { class: 'hata-kutu-metin' }, [
        el('ul', { class: 'mb-0' }, goster.map(x => el('li', { text: `${x.satir ? `satır ${x.satir}: ` : ''}${x.mesaj}` }))),
        h.length > goster.length ? el('span', { class: 'hint hint-sm mb-0', text: `… ve ${h.length - goster.length} hata daha (npm run defter:denetle)` }) : null,
      ]),
    ])]);
  }

  function sayilarCiz(oz) {
    const k = bul('defterSayilar');
    if (!k) return;
    doldur(k, sayacKartlari(oz).map(s => el('div', {
      class: `ana-sayi${s.durum ? ' clickable' : ''}`, role: s.durum ? 'button' : null, tabindex: s.durum ? '0' : null, 'data-durum': s.durum || null,
      onkeydown: s.durum ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); durumSec(suzgec.durum === s.durum ? '' : s.durum); } } : null,
      'aria-pressed': s.durum ? (suzgec.durum === s.durum ? 'true' : 'false') : null,
      title: s.durum ? `Yalnız ${s.etiket} kayıtlarını göster` : null,
      onclick: s.durum ? () => durumSec(suzgec.durum === s.durum ? '' : s.durum) : null,
    }, [el('span', { class: 'stat-title', text: s.etiket }), el('span', { class: 'stat-value stat-value-sm sayi', text: s.deger }),
      s.alt ? el('span', { class: 'hint hint-sm mb-0', text: s.alt }) : null])));
  }

  function yaklasanCiz(oz) {
    const k = bul('defterYaklasan');
    if (!k) return;
    const l = (oz && oz.yaklasanlar) || [];
    const baslik = el('h3', { class: 'card-title mb-3' }, [el('i', { class: 'tone-primary', 'data-lucide': 'hourglass' }), el('span', { text: ' Hükmü yaklaşanlar' })]);
    if (!l.length) { doldur(k, [baslik, el('p', { class: 'hint mb-0', text: 'Hüküm tarihi olan GÖLGE / AÇIK kayıt yok.' })]); return; }
    doldur(k, [baslik, AG.tablo.kutulu({ id: 'tblDefterYaklasan', sinif: 'table-dense', basliklar: ['Hüküm', 'Kalan', 'No', 'Durum', 'Başlık'],
      satirlar: l.map(y => el('tr', { class: y.kalanGun < 0 ? 'row-bad' : null }, [
        el('td', { text: y.hukumTarihi }), el('td', { class: `sayi${y.kalanGun < 0 ? ' tone-danger' : y.kalanGun <= 30 ? ' tone-warning' : ''}`, text: kalanMetni(y.kalanGun) }),
        el('td', { class: 'sayi', text: numara(y.aralik) }), el('td', null, [rozet(y.durum)]), el('td', { text: y.baslik || '' })])) }),
      oz.hukumsuz && oz.hukumsuz.length ? el('p', { class: 'hint hint-sm mt-3 mb-0', text: `Hüküm tarihi yazılmamış GÖLGE/AÇIK: ${oz.hukumsuz.map(numara).join(', ')}` }) : null]);
  }

  function ailelerCiz(oz) {
    const k = bul('defterAileler');
    if (!k) return;
    const l = (oz && oz.aileler) || [];
    doldur(k, [
      el('h3', { class: 'card-title mb-3' }, [el('i', { class: 'tone-primary', 'data-lucide': 'users' }), el('span', { text: ` Aileler (${l.length})` })]),
      l.length ? el('div', { class: 'row row-wrap gap-2', role: 'group', 'aria-label': 'Aileye göre süz' }, l.map(a => el('button', {
        type: 'button', class: `btn btn-sm ${suzgec.aile === a.aile ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': suzgec.aile === a.aile ? 'true' : 'false',
        title: `${a.aile} · ${a.kayit} kayıt`, 'data-aile': a.aile, onclick: () => aileSec(suzgec.aile === a.aile ? '' : a.aile),
      }, [el('span', { text: `${a.aileAd || a.aile} · ${a.adet}` })]))) : el('p', { class: 'hint mb-0', text: 'Kayıt yok.' }),
    ]);
  }

  function suzgecSecenekleri() {
    const d = bul('selDefterDurum'), a = bul('selDefterAile');
    const oz = veri && veri.ozet;
    if (d && !d.options.length) {
      doldur(d, [el('option', { value: '', text: 'Tüm durumlar' })].concat(Object.keys(DURUM_AD).map(x => el('option', { value: x, text: DURUM_AD[x] }))));
    }
    if (d) d.value = suzgec.durum;
    if (a) {
      doldur(a, [el('option', { value: '', text: 'Tüm aileler' })].concat(((oz && oz.aileler) || []).map(x => el('option', { value: x.aile, text: `${x.aileAd || x.aile} (${x.adet})` }))));
      a.value = suzgec.aile;
    }
    const dl = bul('dlDefterAile');
    if (dl) doldur(dl, ((oz && oz.aileler) || []).map(x => el('option', { value: x.aile, label: x.aileAd || x.aile })));
  }

  function tabloCiz() {
    const k = bul('defterTablo');
    if (!k) return;
    const l = suz((veri && veri.kayitlar) || [], suzgec).sort((x, y) => y.aralik[0] - x.aralik[0]);
    const n = l.reduce((t, x) => t + uzunluk(x), 0);
    const sayac = bul('defterSuzgecSayi');
    if (sayac) sayac.textContent = `${l.length} kayıt · ${n} numara`;
    if (!l.length) { doldur(k, [el('p', { class: 'hint mb-0', text: veri && veri.kayitlar && veri.kayitlar.length ? 'Süzgece uyan kayıt yok.' : 'Defterde kayıt yok.' })]); return; }
    // Açık satır sınırın dışındaysa sınır onu kapsayacak kadar genişler.
    const acikSira = acik == null ? -1 : l.findIndex(x => x.aralik[0] === acik);
    const sinir = Math.max(gosterilen, acikSira + 1);
    const parca = l.slice(0, sinir);
    const kalan = l.length - parca.length;
    const devam = kalan > 0 ? el('div', { class: 'row row-wrap gap-3 mt-3', id: 'defterDahaFazla' }, [
      el('span', { class: 'hint mb-0', text: `${parca.length} / ${l.length} kayıt gösteriliyor` }),
      el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { gosterilen = sinir + SAYFA; tabloCiz(); } }, [el('span', { text: `Daha fazla göster (+${Math.min(SAYFA, kalan)})` })]),
      el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { gosterilen = l.length; tabloCiz(); } }, [el('span', { text: `Tümünü göster (${l.length})` })])
    ]) : null;
    doldur(k, [AG.tablo.kutulu({ id: 'tblDefter', sinif: 'table-dense', siralanabilir: 'defter',
      // PLAN-PANEL-2 §2: sade sütunlar — ne denendi / ne çıktı anlatıdan (lib/defterAnlati.js); hepsi sola yaslı (df-tablo).
      basliklar: ['No', 'Ne denendi', 'Ne çıktı', 'Durum', 'Tarih', ''],
      satirlar: parca.map(x => el('tr', { class: 'clickable', 'data-no': String(x.aralik[0]), onclick: (e) => { if (!(e.target && e.target.closest && e.target.closest('button'))) ac(x.aralik[0]); } }, [
        el('td', { class: 'sayi df-no', 'data-sira': String(x.aralik[0]), text: `${numara(x.aralik)}${uzunluk(x) > 1 ? ` (${uzunluk(x)})` : ''}` }),
        el('td', { text: (x.anlati && x.anlati.neKisa) || x.baslik || '', title: x.aileAd || x.aile || null }),
        el('td', { class: 'df-soluk', text: (x.anlati && x.anlati.sonucKisa) || '—' }),
        el('td', { 'data-sira': x.durum || '' }, [rozet(x.durum)]),
        el('td', { class: 'df-soluk', 'data-sira': x.tarih || '', text: gunTr(x.tarih) || '—' }),
        el('td', { 'data-sirasiz': '1' }, [el('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'aria-expanded': acik === x.aralik[0] ? 'true' : 'false', onclick: () => ac(x.aralik[0]) }, [el('span', { text: acik === x.aralik[0] ? 'Kapat' : 'Aç' })])]),
      ])) }), devam]);
  }

  function ayrintiCiz() {
    const k = bul('defterAyrinti');
    if (!k) return;
    const x = acik == null ? null : ((veri && veri.kayitlar) || []).filter(gecerliKayit).find(y => y.aralik[0] === acik);
    k.classList.toggle('is-hidden', !x);
    if (!x) { doldur(k, []); return; }
    // Teknik alanlar: etiket üstte, değer altta (eski kv-list değeri sağa yaslıyordu — kullanıcı: görsel bütünlük bozuluyor).
    const satir = (ad, deger, ek) => [el('dt', { text: ad }), el('dd', { text: deger == null || deger === '' ? '—' : String(deger), title: ek || null })];
    const a = x.anlati || {};
    const adim = (no, baslik, metin) => el('div', { class: 'df-adim' }, [el('span', { class: 'df-adim-baslik', text: `${no} · ${baslik}` }), el('p', { class: 'df-adim-metin', text: metin || '—' })]);
    const ner = a.nerede || {};
    const nerede = [ner.plan ? `Plan: ${ner.plan}` : '', ner.betikler && ner.betikler.length ? `Betik: ${ner.betikler.join(', ')}` : '',
      x.onKayitCommit ? `Ön kayıt ${kisaHash(x.onKayitCommit)}` : '', x.sonucCommit ? `Sonuç ${kisaHash(x.sonucCommit)}` : ''].filter(Boolean).join(' · ');
    doldur(k, [
      el('div', { class: 'df-bas' }, [
        el('span', { class: 'sayi df-soluk', text: numara(x.aralik) }),
        el('h3', { class: 'df-baslik', text: (a.neKisa || x.baslik || '') }),
        rozet(x.durum),
        el('span', { class: 'df-soluk', text: [x.aileAd || x.aile, gunTr(x.tarih)].filter(Boolean).join(' · ') }),
        el('button', { type: 'button', class: 'btn btn-secondary btn-sm df-kapat', onclick: () => ac(x.aralik[0]) }, [el('span', { text: 'Kapat' })]),
      ]),
      el('div', { class: 'df-hikaye' }, [
        adim(1, 'Ne denendi', a.ne), adim(2, 'Neyle kıyaslandı', a.kiyas), adim(3, 'Ne çıktı', a.sonuc), adim(4, 'Sonuç ve ders', a.ders),
      ]),
      nerede ? el('p', { class: 'df-nerede', text: `Nerede: ${nerede}` }) : null,
      el('details', { class: 'df-teknik' }, [el('summary', { text: 'Teknik ayrıntı (kayıttaki metin aynen)' }),
      el('dl', { class: 'df-kv mb-0' }, [].concat(
        satir('Numara aralığı', `${x.aralik[0]}–${x.aralik[1]} (${uzunluk(x)} deneme)`),
        satir('Aile', `${x.aileAd || ''}${x.aileAd ? ' · ' : ''}${x.aile || ''}`),
        satir('Hipotez', x.hipotez),
        satir('Ön kayıt tarihi', x.tarih),
        satir('Plan dosyası', x.plan),
        satir('Ön kayıt commit', kisaHash(x.onKayitCommit), x.onKayitCommit || null),
        satir('Sonuç commit', kisaHash(x.sonucCommit), x.sonucCommit || null),
        satir('Holdout', HOLDOUT_AD[x.holdout] || x.holdout),
        satir('Durum', DURUM_AD[x.durum] || x.durum),
        satir('Sonuç', x.sonuc),
        satir('Neden kapandı', x.neden),
        satir('Hüküm tarihi', x.hukumTarihi),
        satir('Kaynak', x.kaynak),
        satir('Dosya satırı', x._satir),
      )),
      el('p', { class: 'hint hint-sm mt-3 mb-0', text: 'Yukarıdaki dört adım bu metinden kendiliğinden üretilir (kısaltmalar açılır). Commit kısa hash olarak gösterilir; ayrıntı için: git show <hash>.' })]),
    ]);
    if (k.scrollIntoView) { try { k.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { /* yok */ } }
  }

  /** Form yalnız masaüstünde: telefon kademesinde gizli (sunucu da POST'u 403 ile reddeder). */
  function formGorunurlugu() {
    const k = bul('defterYeniKat');
    if (!k) return;
    const telefon = !!((AG.pages && AG.pages.kabuk && AG.pages.kabuk.telefon && AG.pages.kabuk.telefon()) || (AG.api && AG.api.kademe && AG.api.kademe() === 'telefon'));
    k.classList.toggle('is-hidden', telefon);
  }

  function formOneri() {
    const oz = veri && veri.ozet;
    const ilk = bul('inpDfIlk'), son = bul('inpDfSon'), t = bul('inpDfTarih'), on = bul('defterSonrakiNo');
    if (oz && ilk && !ilk.value) ilk.value = String(oz.sonrakiBos);
    if (oz && son && !son.value) son.value = String(oz.sonrakiBos);
    if (t && !t.value) t.value = bugun();
    if (on) on.textContent = oz ? `Sonraki boş numara: #${oz.sonrakiBos}` : '';
  }

  function ciz() {
    const oz = veri && veri.ozet;
    bantCiz(veri && veri.hatalar);
    sayilarCiz(oz); yaklasanCiz(oz); ailelerCiz(oz); suzgecSecenekleri(); tabloCiz(); ayrintiCiz(); formOneri(); formGorunurlugu();
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  /* ── Eylemler ───────────────────────────────────────────────────────── */
  function ac(no) { acik = acik === no ? null : no; tabloCiz(); ayrintiCiz(); }
  function durumSec(d) { suzgec.durum = d || ''; gosterilen = SAYFA; ciz(); }
  function aileSec(a) { suzgec.aile = a || ''; gosterilen = SAYFA; ciz(); }

  async function yukle() {
    const k = bul('defterTablo');
    if (!k) return;
    let r;
    try { r = await AG.api.defter.liste(); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(k, [AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Defter okunamadı', yeniden: yukle })]); formGorunurlugu(); return; }
    veri = r;
    ciz();
  }

  function formOku() {
    const d = (id) => { const x = bul(id); return x ? x.value : ''; };
    return formGovdesi({ ilk: d('inpDfIlk'), son: d('inpDfSon'), aile: d('inpDfAile'), aileAd: d('inpDfAileAd'), baslik: d('inpDfBaslik'), hipotez: d('inpDfHipotez'),
      tarih: d('inpDfTarih'), plan: d('inpDfPlan'), onKayitCommit: d('inpDfOnKayit'), sonucCommit: d('inpDfSonucCommit'), holdout: d('selDfHoldout'), durum: d('selDfDurum'),
      sonuc: d('inpDfSonuc'), neden: d('inpDfNeden'), hukumTarihi: d('inpDfHukum'), kaynak: d('inpDfKaynak') });
  }

  async function kaydet(dugme) {
    const g = formOku();
    if (!Number.isInteger(g.aralik[0]) || g.aralik[0] < 1) { AG.bildir('İlk numara geçerli bir tam sayı olmalı.', 'uyari'); return; }
    if (!g.aile || !g.baslik) { AG.bildir('Aile kimliği ve başlık zorunlu.', 'uyari'); return; }
    const onay = await AG.onayla({ baslik: `${numara(g.aralik)} deftere eklensin mi?`,
      metin: `${g.baslik} · ${DURUM_AD[g.durum] || g.durum} · aile ${g.aile}. Kayıt kayitlar/denemeler.jsonl dosyasına EKLENİR; panel düzeltme/silme yapmaz (gerekirse dosya elle, git ile izlenerek düzeltilir). Git'e işlemek sizin elinizde.`, onay: 'Ekle' });
    if (!onay) return;
    AG.dom.mesgul(dugme, 'Ekleniyor…');
    try {
      const r = await AG.api.defter.ekle(g);
      if (!r || !r.success) { AG.bildir(`Eklenemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 }); return; }
      AG.bildir(`${numara(r.kayit.aralik)} eklendi. Sonraki boş numara #${r.sonrakiBos}. CLAUDE.md "Güncel" sayısını da güncelleyin.`, 'ok', { sure: 10000 });
      ['inpDfIlk', 'inpDfSon', 'inpDfBaslik', 'inpDfHipotez', 'inpDfSonuc', 'inpDfNeden', 'inpDfOnKayit', 'inpDfSonucCommit', 'inpDfHukum'].forEach(id => { const x = bul(id); if (x) x.value = ''; });
      await yukle();
    } catch (e) { AG.bildir(`Eklenemedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(dugme); }
  }

  function baslat() {
    if (!doc || !doc.addEventListener) return;
    const ara = bul('inpDefterAra');
    if (ara) ara.addEventListener('input', () => { suzgec.ara = ara.value; gosterilen = SAYFA; tabloCiz(); });
    const d = bul('selDefterDurum');
    if (d) d.addEventListener('change', () => durumSec(d.value));
    const a = bul('selDefterAile');
    if (a) a.addEventListener('change', () => aileSec(a.value));
    const t = bul('btnDefterTemizle');
    if (t) t.addEventListener('click', () => { suzgec.ara = ''; suzgec.durum = ''; suzgec.aile = ''; gosterilen = SAYFA; if (ara) ara.value = ''; ciz(); });
    const y = bul('btnDefterYenile');
    if (y) y.addEventListener('click', yukle);
    const k = bul('btnDefterKaydet');
    if (k) k.addEventListener('click', (e) => kaydet(e.currentTarget));
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-defter') yukle(); });
    // Kademe sunucudan sonradan gelir (js/pages/kabuk.js body'ye .kademe-telefon yazar): form görünürlüğü onu izler.
    if (global.MutationObserver && doc.body) new global.MutationObserver(formGorunurlugu).observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    formGorunurlugu();
  }

  AG.pages = AG.pages || {};
  AG.pages.defter = { yukle, suz, aileKimligi, sayacKartlari, kalanMetni, formGovdesi, numara, kisaHash, _ciz: { bantCiz, sayilarCiz, yaklasanCiz, ailelerCiz, tabloCiz, ayrintiCiz, formGorunurlugu }, _durum: { suzgec, veriAyarla: (v) => { veri = v; }, ac, SAYFA, gosterilen: () => gosterilen } };
  if (doc && doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat);
  else baslat();
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.defter;
})(typeof window !== 'undefined' ? window : globalThis);
