/**
 * LİSTELER — #/tarama/listeler (sürüm 60.3) `AG.pages.listeler`
 * ═══════════════════════════════════════════════════════════════════════════
 * Arkadaşın coin listelerinin TARİH DAMGALI, DEĞİŞTİRİLEMEZ kaydı (seçilenler + elenenler) ve değerlendirmesi.
 *
 *   · Yeni liste: tarih (varsayılan bugün), kaynak, not, coin satırları (seçildi/elendi, isteğe bağlı ağ/sözleşme).
 *     Kaydedince sunucu o anki fiyatları, BTC'yi ve piyasa evreninin anlık görüntüsünü çekip kayda ekler.
 *   · Kayıt yalnız eklenir + SHA-256 zinciri; panelde zincir göstergesi ve "Zinciri doğrula". Düzeltme gerekirse eski kayıt
 *     silinmez, "düzeltme kaydı" eklenir. Dışa aktarım kayitlar/listeler/ (git'e işlemek kullanıcının elinde).
 *   · Değerlendirme: başlangıçtan bugüne seçilenler vs elenenler, BTC ve piyasa medyanı; medyan + kırpılmış ortalama.
 *     BETİMLEYİCİ — tek liste şanstan ayrılamaz, hüküm değildir.
 * Sunucu verisi her zaman textContent (AG.dom.el).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);

  let veri = null, satirSayac = 0, secili = null, duzeltilen = null;
  const AG_SECENEK = [['', '—'], ['eth', 'Ethereum'], ['bsc', 'BNB Chain'], ['base', 'Base'], ['arbitrum', 'Arbitrum'], ['polygon', 'Polygon'], ['optimism', 'Optimism'], ['avalanche', 'Avalanche C'], ['sol', 'Solana']];

  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const yuzde = (x, d = 1) => (sayiMi(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}%${Math.abs(x * 100).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })}` : '—');
  const puan = (x) => (sayiMi(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} puan` : '—');
  const fiyat = (x) => (sayiMi(x) ? x.toLocaleString('tr-TR', { maximumFractionDigits: Math.abs(x) >= 100 ? 2 : Math.abs(x) >= 1 ? 4 : 8 }) : '—');
  const tarihSaat = (iso) => (AG.fmt && AG.fmt.tarihSaat ? AG.fmt.tarihSaat(iso) : String(iso || '—').slice(0, 16).replace('T', ' '));
  const bugun = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const ton = (x) => (!sayiMi(x) ? '' : x > 0 ? 'tone-success' : x < 0 ? 'tone-danger' : '');
  const ikonla = () => { if (global.lucide && global.lucide.createIcons) global.lucide.createIcons(); };
  const yardim = (k) => (k && AG.sozluk ? AG.sozluk.yardim(k) : null);

  /* ── Saf modeller (test edilir) ─────────────────────────────────────── */

  /** Toplu metin → coin satırları. Her satır: "SEMBOL [elendi|seçildi] [ağ] [sözleşme] [not…]" ya da "-SEMBOL" (elendi). */
  function topluCoz(metin) {
    const out = [];
    for (const ham of String(metin || '').split(/\r?\n|,|;/)) {
      const s = ham.trim();
      if (!s) continue;
      const p = s.split(/\s+/);
      let sembol = p.shift();
      let durum = 'secildi';
      if (/^[-–]/.test(sembol)) { durum = 'elendi'; sembol = sembol.replace(/^[-–]+/, ''); }
      sembol = sembol.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!sembol) continue;
      let ag = '', sozlesme = '';
      const notP = [];
      for (const x of p) {
        const k = x.toLocaleLowerCase('tr-TR');
        if (/^(elendi|elenen|ele|x)$/.test(k)) durum = 'elendi';
        else if (/^(seçildi|secildi|seçilen|secilen)$/.test(k)) durum = 'secildi';
        else if (!ag && AG_SECENEK.some(([v]) => v && v === k)) ag = k;
        else if (!sozlesme && (/^0x[0-9a-fA-F]{40}$/.test(x) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x))) sozlesme = x;
        else notP.push(x);
      }
      if (sozlesme && !ag) ag = /^0x/.test(sozlesme) ? 'eth' : 'sol';
      out.push({ sembol, durum, ag, sozlesme, not: notP.join(' ') });
    }
    return out;
  }

  /** Zincir göstergesi modeli. */
  function zincirModel(z) {
    if (!z) return { metin: 'doğrulanmadı', ton: 'badge badge-warning', ayrinti: '' };
    if (z.catisma) return { metin: 'zincir çelişkisi', ton: 'badge badge-danger', ayrinti: z.catisma };
    if (!z.gecerli) return { metin: `zincir BOZUK (#${(z.hatalar[0] || {}).no})`, ton: 'badge badge-danger', ayrinti: z.hatalar.map(h => `#${h.no}: ${h.neden}`).join(' · ') };
    const uyar = [...(z.ekler || []).map(e => `#${e.no}: ${e.neden}`), ...((z.disaAktarim && z.disaAktarim.farkli) || []).map(n => `#${n}: dışa aktarım farklı`)];
    return { metin: `zincir sağlam · ${z.kayitSayisi} kayıt`, ton: uyar.length ? 'badge badge-warning' : 'badge badge-success', ayrinti: uyar.join(' · ') || `son özet ${String(z.sonOzet || '').slice(0, 12)}…` };
  }

  /** Değerlendirme → ana sayılar. */
  function degerlendirmeSayilari(d) {
    const g = d.gruplar || {};
    const p = d.piyasa || {};
    return [
      { etiket: 'Seçilenler (medyan)', deger: yuzde(g.secildi && g.secildi.medyan), alt: g.secildi && g.secildi.n ? `${g.secildi.n} coin · ort. ${yuzde(g.secildi.ortalama)} · kırpılmış ${yuzde(g.secildi.kirpik)}` : 'coin yok', ton: ton(g.secildi && g.secildi.medyan) },
      { etiket: 'Elenenler (medyan)', deger: yuzde(g.elendi && g.elendi.medyan), alt: g.elendi && g.elendi.n ? `${g.elendi.n} coin · ort. ${yuzde(g.elendi.ortalama)}` : 'elenen kaydı yok', ton: ton(g.elendi && g.elendi.medyan) },
      { etiket: 'BTC', deger: yuzde(d.btc && d.btc.getiri), alt: d.btc && d.btc.hata ? `hata: ${d.btc.hata}` : 'Binance spot', ton: ton(d.btc && d.btc.getiri) },
      { etiket: 'Piyasa medyanı', deger: p.durum === 'hazir' ? yuzde(p.medyan) : p.durum === 'hata' ? 'hata' : 'hesaplanmadı', alt: p.durum === 'hazir' ? `${p.n} perp · kırpılmış ${yuzde(p.kirpik)} · artıda %${Math.round((p.pozitifPay || 0) * 100)}` : p.durum === 'hata' ? p.hata : `${p.gun} için piyasa evreni yok`, ton: p.durum === 'hazir' ? ton(p.medyan) : '' },
      { etiket: 'Seçilen − piyasa', deger: puan(d.farklar && d.farklar.secilenEksiPiyasa), alt: `seçilen − BTC ${puan(d.farklar && d.farklar.secilenEksiBtc)} · seçilen − elenen ${puan(d.farklar && d.farklar.secilenEksiElenen)}`, ton: ton(d.farklar && d.farklar.secilenEksiPiyasa) },
    ];
  }

  /* ── Coin satırı düzenleyici ─────────────────────────────────────────── */
  function coinSatiriEl(kap, c) {
    const n = ++satirSayac;
    const id = (a) => `lsC${n}_${a}`;
    const sec = (ad, secenekler, d) => { const s = el('select', { id: id(ad), class: 'form-control', 'data-alan': ad }, secenekler.map(([v, t]) => el('option', { value: v, text: t }))); s.value = d || secenekler[0][0]; return s; };
    const girdi = (ad, d, ek) => el('input', { type: 'text', id: id(ad), class: 'form-control', 'data-alan': ad, value: d || '', autocomplete: 'off', ...ek });
    const alan = (etiket, g) => el('div', { class: 'form-group mb-0' }, [el('label', { for: g.getAttribute('id'), text: etiket }), g]);
    const satir = el('div', { class: 'tarama-coin-satir', 'data-coin-satiri': '1' }, [
      alan('Sembol', girdi('sembol', c && c.sembol, { placeholder: 'ör. MET', maxlength: '20' })),
      alan('Durum', sec('durum', [['secildi', 'seçildi'], ['elendi', 'elendi']], c && c.durum)),
      alan('Ağ (isteğe bağlı)', sec('ag', AG_SECENEK, c && c.ag)),
      alan('Sözleşme (isteğe bağlı)', girdi('sozlesme', c && c.sozlesme, { placeholder: '0x… / Solana mint', spellcheck: 'false' })),
      alan('Not', girdi('not', c && c.not, { maxlength: '300' })),
      el('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'aria-label': 'Satırı sil', onclick: () => { if (satir.parentNode) satir.parentNode.removeChild(satir); } }, [el('span', { text: 'Sil' })]),
    ]);
    kap.appendChild(satir);
    return satir;
  }
  function satirlariOku(kap) {
    const out = [];
    if (!kap) return out;
    for (const s of kap.querySelectorAll('[data-coin-satiri]')) {
      const o = {};
      for (const g of s.querySelectorAll('[data-alan]')) o[g.getAttribute('data-alan')] = String(g.value || '').trim();
      if (!o.sembol) continue;
      out.push({ sembol: o.sembol.toUpperCase(), durum: o.durum || 'secildi', ag: o.ag || null, sozlesme: o.sozlesme || null, not: o.not || null });
    }
    return out;
  }

  /* ── Çizim ──────────────────────────────────────────────────────────── */
  function zincirCiz(z) {
    const k = bul('listeZincir');
    if (!k) return;
    const m = zincirModel(z);
    doldur(k, [el('span', { class: m.ton, text: m.metin, title: m.ayrinti || null }), yardim('listeZinciri'),
      m.ayrinti ? el('span', { class: 'hint hint-sm mb-0', text: m.ayrinti }) : null]);
  }

  function kayitlarCiz() {
    const k = bul('listeKayitlar');
    if (!k) return;
    const l = (veri && veri.listeler) || [];
    if (!l.length) { doldur(k, [el('p', { class: 'hint mb-0', text: 'Henüz liste kaydı yok. Yukarıdan ilk listeyi girin.' })]); return; }
    doldur(k, [AG.tablo.kutulu({ id: 'tblListeler', sinif: 'table-dense', siralanabilir: 'listeler',
      basliklar: ['No', 'Liste tarihi', 'Girildi', 'Kaynak', 'Seçilen', 'Elenen', 'Durum', 'Özet', ''],
      satirlar: l.map(x => {
        const sec = (x.coinler || []).filter(c => c.durum === 'secildi'), ele = (x.coinler || []).filter(c => c.durum === 'elendi');
        const durum = [x.geriyeDonuk ? 'geriye dönük girildi' : 'giriş günü kaydı', x.duzeltmeler && x.duzeltmeler.length ? `düzeltildi (#${x.duzeltmeler.map(d => d.no).join(', #')})` : null].filter(Boolean).join(' · ');
        return el('tr', null, [
          el('td', { class: 'sayi', text: `#${x.no}` }), el('td', { text: x.tarih }), el('td', { text: tarihSaat(x.girisZamani) }), el('td', { text: x.kaynak }),
          el('td', { text: `${sec.length}: ${sec.slice(0, 8).map(c => c.sembol).join(', ')}${sec.length > 8 ? '…' : ''}` }),
          el('td', { text: ele.length ? `${ele.length}: ${ele.slice(0, 6).map(c => c.sembol).join(', ')}${ele.length > 6 ? '…' : ''}` : '—' }),
          el('td', { class: x.geriyeDonuk ? 'tone-warning' : null, text: durum }),
          el('td', { class: 'tarama-adres', text: `${String(x.ozet || '').slice(0, 10)}…`, title: x.ozet || null }),
          el('td', { 'data-sirasiz': '1' }, [el('div', { class: 'row row-wrap gap-2' }, [
            el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => degerlendirAc(x.no) }, [el('span', { text: 'Değerlendir' })]),
            el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => duzeltmeAc(x.no) }, [el('span', { text: 'Düzeltme ekle' })]),
          ])]),
        ]);
      }) })]);
  }

  function degerlendirmeCiz(d, piyasaIs) {
    const k = bul('listeDegerlendirme');
    if (!k) return;
    const l = (veri && veri.listeler || []).find(x => x.no === secili);
    const basGirdi = el('input', { type: 'date', id: 'inpListeBas', class: 'form-control', value: (d && d.bas) || (l && l.tarih) || '' });
    const ust = el('div', { class: 'row row-wrap gap-3 mb-4' }, [
      el('div', { class: 'form-group mb-0' }, [el('label', { for: 'inpListeBas', text: 'Başlangıç (giriş = o günün açılışı)' }), basGirdi]),
      el('button', { type: 'button', class: 'btn btn-primary', id: 'btnListeDegerlendir', onclick: (e) => degerlendirAc(secili, basGirdi.value, e.currentTarget) }, [el('span', { text: 'Hesapla' })]),
    ]);
    if (!d) { doldur(k, [el('h3', { class: 'card-title mb-3', text: `Liste #${secili} — değerlendirme` }), ust, el('p', { class: 'hint mb-0', text: 'Hesaplanıyor…' })]); return; }
    const p = d.piyasa || {};
    const piyasaDugme = p.durum !== 'hazir' ? el('button', { type: 'button', class: 'btn btn-secondary', onclick: (e) => piyasaHesapla(d.bas, e.currentTarget) }, [el('span', { text: `Piyasa kıyasını hesapla (${d.bas})` })]) : null;
    doldur(k, [
      el('div', { class: 'row-between row-wrap gap-2 mb-3' }, [
        el('h3', { class: 'card-title m-0', text: `Liste #${d.liste.no} — ${d.liste.tarih} · ${d.liste.kaynak}` }),
        el('span', { class: 'badge badge-warning' }, [el('span', { text: 'Betimleyici — hüküm değil' }), yardim('listeDegerlendirme')]),
      ]),
      ust,
      el('div', { class: 'ana-sayilar mb-4' }, degerlendirmeSayilari(d).map(s => el('div', { class: 'ana-sayi' }, [
        el('span', { class: 'stat-title', text: s.etiket }), el('span', { class: `stat-value stat-value-sm sayi ${s.ton || ''}`.trim(), text: s.deger }),
        s.alt ? el('span', { class: 'hint hint-sm mb-0', text: s.alt }) : null]))),
      piyasaDugme ? el('div', { class: 'row row-wrap gap-3 mb-3' }, [piyasaDugme, el('span', { class: 'hint hint-sm mb-0', text: 'Geçmiş gün için Binance USDⓈ-M evreninin (~600 perp) o günkü açılışı indirilir: canlı kipte 5–12 dk, bir kez; sonra saklanır.' })]) : null,
      el('div', { id: 'listePiyasaIs', class: 'is-hidden mb-3' }),
      el('h4', { class: 'card-title-sm mb-2', text: 'Gruplar' }),
      AG.tablo.kutulu({ sinif: 'table-dense', basliklar: ['Grup', 'n', 'Ortalama', { metin: 'Kırpılmış ort.', yardim: 'kirpikOrtalama' }, 'Medyan', 'Artıda'], satirlar: [
        ['Seçilenler', d.gruplar.secildi], ['Elenenler', d.gruplar.elendi],
      ].map(([ad, g]) => el('tr', null, [el('td', { text: ad }), el('td', { class: 'sayi', text: String(g.n) }), el('td', { class: `sayi ${ton(g.ortalama)}`, text: yuzde(g.ortalama) }),
        el('td', { class: `sayi ${ton(g.kirpik)}`, text: yuzde(g.kirpik), title: g.kirpikTaban || null }), el('td', { class: `sayi ${ton(g.medyan)}`, text: yuzde(g.medyan) }), el('td', { class: 'sayi', text: g.n ? `${g.pozitif}/${g.n}` : '—' })]))
        .concat([el('tr', null, [el('td', { text: 'BTC' }), el('td', { class: 'sayi', text: '1' }), el('td', { class: `sayi ${ton(d.btc.getiri)}`, text: yuzde(d.btc.getiri) }), el('td', { text: '—' }), el('td', { text: '—' }), el('td', { text: '—' })]),
          el('tr', null, [el('td', { text: 'Piyasa (Binance perp)' }), el('td', { class: 'sayi', text: p.durum === 'hazir' ? String(p.n) : '—' }), el('td', { class: `sayi ${ton(p.ortalama)}`, text: p.durum === 'hazir' ? yuzde(p.ortalama) : '—' }),
            el('td', { class: `sayi ${ton(p.kirpik)}`, text: p.durum === 'hazir' ? yuzde(p.kirpik) : '—' }), el('td', { class: `sayi ${ton(p.medyan)}`, text: p.durum === 'hazir' ? yuzde(p.medyan) : '—' }),
            el('td', { class: 'sayi', text: p.durum === 'hazir' && sayiMi(p.pozitifPay) ? `%${Math.round(p.pozitifPay * 100)}` : '—' })])]) }),
      el('h4', { class: 'card-title-sm mt-4 mb-2', text: 'Coinler' }),
      AG.tablo.kutulu({ id: 'tblListeCoin', sinif: 'table-dense', siralanabilir: 'listeCoin', basliklar: ['Coin', 'Durum', 'Kaynak', 'Giriş', 'Son', 'Getiri', 'Not'],
        satirlar: d.coinler.map(c => el('tr', null, [el('td', { text: c.sembol }), el('td', { text: c.durum === 'secildi' ? 'seçildi' : 'elendi' }), el('td', { text: c.kaynak || '—' }),
          el('td', { class: 'sayi', text: fiyat(c.giris) }), el('td', { class: 'sayi', text: fiyat(c.son) }), el('td', { class: `sayi ${ton(c.getiri)}`, 'data-sira': sayiMi(c.getiri) ? String(c.getiri) : null, text: yuzde(c.getiri) }),
          el('td', { class: c.hata ? 'tone-warning' : null, text: c.hata || c.not || '—' })])) }),
      el('ul', { class: 'hint hint-sm mt-3 mb-0' }, [`Giriş: ${d.girisYontemi}. Son: ${tarihSaat(d.bit)}. ${p.durum === 'hazir' ? `Piyasa: ${p.kaynak}${p.cikan ? `, ${p.cikan} sembol listeden çıkmış (son fiyatıyla)` : ''}.` : ''}`, ...d.notlar].map(t => el('li', { text: t }))),
    ]);
    if (piyasaIs && piyasaIs.durum === 'calisiyor' && piyasaIs.gun === d.bas) piyasaIzle();
    ikonla();
  }

  function duzeltmeCiz(l) {
    const k = bul('listeDuzeltme');
    if (!k) return;
    if (!l) { k.classList.add('is-hidden'); doldur(k, []); return; }
    k.classList.remove('is-hidden');
    const satirlar = el('div', { class: 'tarama-coin-satirlar', id: 'listeDuzeltmeSatirlar' });
    (l.coinler || []).forEach(c => coinSatiriEl(satirlar, c));
    doldur(k, [
      el('h3', { class: 'card-title mb-2', text: `Liste #${l.no} için düzeltme kaydı` }),
      el('p', { class: 'hint mb-4', text: 'Eski kayıt SİLİNMEZ ve değişmez; bu düzeltme zincire yeni bir kayıt olarak eklenir ve listenin geçerli hâlini değiştirir. Önceden yakalanan giriş fiyatları korunur; yeni eklenen coinin fiyatı şimdi yakalanır.' }),
      el('div', { class: 'grid-2 gap-5' }, [
        el('div', { class: 'form-group' }, [el('label', { for: 'inpDuzNeden', text: 'Düzeltme nedeni (zorunlu)' }), el('input', { type: 'text', id: 'inpDuzNeden', class: 'form-control', maxlength: '500', placeholder: 'ör. MET yanlış girilmişti, MNT olacaktı' })]),
        el('div', { class: 'form-group' }, [el('label', { for: 'inpDuzTarih', text: 'Liste tarihi' }), el('input', { type: 'date', id: 'inpDuzTarih', class: 'form-control', value: l.tarih })]),
        el('div', { class: 'form-group' }, [el('label', { for: 'inpDuzKaynak', text: 'Kaynak' }), el('input', { type: 'text', id: 'inpDuzKaynak', class: 'form-control', maxlength: '60', value: l.kaynak || '' })]),
        el('div', { class: 'form-group' }, [el('label', { for: 'inpDuzNot', text: 'Not' }), el('input', { type: 'text', id: 'inpDuzNot', class: 'form-control', maxlength: '1000', value: l.not || '' })]),
      ]),
      el('h4', { class: 'card-title-sm mt-3 mb-2', text: 'Coinler (listenin yeni tam hâli)' }),
      satirlar,
      el('div', { class: 'row row-wrap gap-3 mt-3' }, [el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => coinSatiriEl(satirlar, null) }, [el('span', { text: 'Satır ekle' })])]),
      el('div', { class: 'row-end gap-3 mt-5' }, [
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => { duzeltilen = null; duzeltmeCiz(null); } }, [el('span', { text: 'Vazgeç' })]),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => duzeltmeKaydet(l, e.currentTarget) }, [el('span', { text: 'Düzeltme kaydını ekle' })]),
      ]),
    ]);
    ikonla();
  }

  /* ── Eylemler ───────────────────────────────────────────────────────── */
  async function yeniKaydet(dugme) {
    const govde = {
      tarih: (bul('inpListeTarih') || {}).value || bugun(), kaynak: String((bul('inpListeKaynak') || {}).value || '').trim() || 'arkadaş',
      not: String((bul('inpListeNot') || {}).value || '').trim() || null, coinler: satirlariOku(bul('listeYeniSatirlar')),
    };
    if (!govde.coinler.length) { AG.bildir('En az bir coin satırı girin.', 'uyari'); return; }
    const sec = govde.coinler.filter(c => c.durum === 'secildi').length;
    const onay = await AG.onayla({ baslik: `Liste kaydedilsin mi? (${govde.tarih}, ${sec} seçilen / ${govde.coinler.length - sec} elenen)`,
      metin: 'Kayıt DEĞİŞTİRİLEMEZ: yalnız eklenir ve SHA-256 zincirine bağlanır. Hata olursa sonradan "düzeltme kaydı" eklenir. Kaydederken şu anki fiyatlar, BTC ve piyasa evreni de kayda yazılır (birkaç saniye sürer).', onay: 'Kaydet' });
    if (!onay) return;
    AG.dom.mesgul(dugme, 'Fiyatlar çekiliyor…');
    try {
      const r = await AG.api.listeler.ekle(govde);
      if (!r || !r.success) { AG.bildir(`Kaydedilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      const fiyatsiz = r.kayit.coinler.filter(c => !c.fiyat || c.fiyat.deger == null).map(c => c.sembol);
      AG.bildir(`Liste #${r.kayit.no} kaydedildi.${fiyatsiz.length ? ` Fiyatı bulunamayan: ${fiyatsiz.join(', ')}.` : ''} Dışa aktarım: kayitlar/listeler/ (git'e işlemek isterseniz siz işlersiniz).`, fiyatsiz.length ? 'uyari' : 'ok', { sure: 12000 });
      const kap = bul('listeYeniSatirlar'); if (kap) { AG.dom.bosalt(kap); coinSatiriEl(kap, null); }
      ['inpListeNot', 'inpListeToplu'].forEach(id => { const x = bul(id); if (x) x.value = ''; });
      await yukle();
    } catch (e) { AG.bildir(`Kaydedilemedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(dugme); }
  }

  async function duzeltmeKaydet(l, dugme) {
    const neden = String((bul('inpDuzNeden') || {}).value || '').trim();
    if (neden.length < 3) { AG.bildir('Düzeltmenin nedenini yazın.', 'uyari'); return; }
    const degisiklik = {};
    const t = (bul('inpDuzTarih') || {}).value, ka = String((bul('inpDuzKaynak') || {}).value || '').trim(), no = String((bul('inpDuzNot') || {}).value || '').trim();
    if (t && t !== l.tarih) degisiklik.tarih = t;
    if (ka !== (l.kaynak || '')) degisiklik.kaynak = ka;
    if (no !== (l.not || '')) degisiklik.not = no || null;
    const yeni = satirlariOku(bul('listeDuzeltmeSatirlar'));
    const ozetle = (a) => JSON.stringify((a || []).map(c => [c.sembol, c.durum, c.ag || null, c.sozlesme || null, c.not || null]));
    if (ozetle(yeni) !== ozetle(l.coinler)) degisiklik.coinler = yeni;
    if (!Object.keys(degisiklik).length) { AG.bildir('Değişiklik yok.', 'bilgi'); return; }
    const onay = await AG.onayla({ baslik: `Liste #${l.no} için düzeltme kaydı eklensin mi?`, metin: `Değişen: ${Object.keys(degisiklik).join(', ')}. Eski kayıt silinmez; düzeltme zincire eklenir ve geri alınamaz.`, onay: 'Ekle' });
    if (!onay) return;
    AG.dom.mesgul(dugme, 'Ekleniyor…');
    try {
      const r = await AG.api.listeler.duzelt({ duzelttigi: l.no, neden, degisiklik });
      if (!r || !r.success) { AG.bildir(`Eklenemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      AG.bildir(`Düzeltme kaydı #${r.kayit.no} eklendi.`, 'ok');
      duzeltilen = null; duzeltmeCiz(null);
      await yukle();
    } catch (e) { AG.bildir(`Eklenemedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(dugme); }
  }

  function duzeltmeAc(no) {
    duzeltilen = no;
    const l = (veri && veri.listeler || []).find(x => x.no === no);
    duzeltmeCiz(l || null);
    const k = bul('listeDuzeltme');
    if (k && k.scrollIntoView) { try { k.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* yok */ } }
  }

  async function degerlendirAc(no, bas, dugme) {
    secili = no;
    const k = bul('listeDegerlendirme');
    if (!k) return;
    k.classList.remove('is-hidden');
    if (!dugme) degerlendirmeCiz(null);
    if (dugme) AG.dom.mesgul(dugme, 'Hesaplanıyor…');
    try {
      const r = await AG.api.listeler.degerlendir(no, bas || null);
      if (!r || !r.success) { doldur(k, [AG.bildirim.hataKutusu((r && r.error) || 'bilinmeyen hata', { baslik: `Liste #${no} değerlendirilemedi`, yeniden: () => degerlendirAc(no, bas) })]); return; }
      degerlendirmeCiz(r.degerlendirme, r.piyasaIs);
      if (!dugme && k.scrollIntoView) { try { k.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* yok */ } }
    } catch (e) {
      doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: `Liste #${no} değerlendirilemedi`, yeniden: () => degerlendirAc(no, bas) })]);
    } finally { if (dugme) AG.dom.hazir(dugme); }
  }

  let piyasaIzleniyor = false;
  async function piyasaIzle() {
    if (piyasaIzleniyor) return;
    piyasaIzleniyor = true;
    try {
      await AG.ilerleme.izle({ id: 'piyasa', kutu: bul('listePiyasaIs'), baslik: 'Piyasa evreni', aralik: 2000,
        oku: async () => { const r = await AG.api.listeler.piyasaIs(); return r && r.success && r.is ? r : { success: false, error: 'iş bulunamadı (sunucu yeniden başlamış olabilir)' }; },
        iptal: () => AG.api.listeler.piyasaIptal() });
      AG.bildir('Piyasa evreni hesaplandı; değerlendirme yenileniyor.', 'ok');
      const bas = (bul('inpListeBas') || {}).value;
      if (secili) degerlendirAc(secili, bas);
    } catch (e) { AG.bildir(`Piyasa evreni hesaplanamadı: ${e.message}`, 'hata'); } finally { piyasaIzleniyor = false; }
  }

  async function piyasaHesapla(gun, dugme) {
    AG.dom.mesgul(dugme, 'Başlatılıyor…');
    try {
      const r = await AG.api.listeler.piyasa(gun);
      if (!r || !r.success) { AG.bildir(`Başlatılamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      if (!r.baslatildi) AG.bildir(r.neden || 'Hesap zaten sürüyor.', 'bilgi');
      piyasaIzle();
    } catch (e) { AG.bildir(`Başlatılamadı: ${e.message}`, 'hata'); } finally { AG.dom.hazir(dugme); }
  }

  function topluAktar() {
    const t = bul('inpListeToplu');
    const kap = bul('listeYeniSatirlar');
    if (!t || !kap) return;
    const l = topluCoz(t.value);
    if (!l.length) { AG.bildir('Dönüştürülecek satır bulunamadı. Her satıra bir sembol yazın (elenenler için "-SEMBOL" ya da "SEMBOL elendi").', 'uyari'); return; }
    // Boş tek satır varsa kaldır.
    for (const s of kap.querySelectorAll('[data-coin-satiri]')) { const g = s.querySelectorAll('[data-alan]'); let bos = true; for (const x of g) if (x.getAttribute('data-alan') === 'sembol' && String(x.value || '').trim()) bos = false; if (bos && s.parentNode) s.parentNode.removeChild(s); }
    l.forEach(c => coinSatiriEl(kap, c));
    t.value = '';
    AG.bildir(`${l.length} satır eklendi (${l.filter(c => c.durum === 'elendi').length} elenen). Kaydetmeden önce kontrol edin.`, 'ok');
  }

  async function yukle() {
    const k = bul('listeKayitlar');
    if (!k) return;
    let r;
    try { r = await AG.api.listeler.liste(); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(k, [AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Liste kayıtları okunamadı', yeniden: yukle })]); zincirCiz(null); return; }
    veri = r;
    zincirCiz(r.zincir); kayitlarCiz();
    if (duzeltilen) duzeltmeCiz((r.listeler || []).find(x => x.no === duzeltilen) || null);
    const t = bul('inpListeTarih'); if (t && !t.value) t.value = bugun();
    const kap = bul('listeYeniSatirlar'); if (kap && !kap.querySelectorAll('[data-coin-satiri]').length) coinSatiriEl(kap, null);
    ikonla();
  }

  async function dogrula(dugme) {
    if (AG.pages.tarama && AG.pages.tarama.zinciriDogrula) { const z = await AG.pages.tarama.zinciriDogrula(dugme); if (z) zincirCiz(z); }
  }

  function baslat() {
    if (!doc || !doc.addEventListener) return;
    const b = (id, f) => { const x = bul(id); if (x) x.addEventListener('click', (e) => f(e.currentTarget)); };
    b('btnListeKaydet', yeniKaydet);
    b('btnListeSatirEkle', () => coinSatiriEl(bul('listeYeniSatirlar'), null));
    b('btnListeToplu', topluAktar);
    b('btnListeDogrula', dogrula);
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-listeler') yukle(); });
  }

  AG.pages = AG.pages || {};
  AG.pages.listeler = { yukle, topluCoz, zincirModel, degerlendirmeSayilari, satirlariOku, coinSatiriEl, degerlendirAc, duzeltmeAc, _ciz: { kayitlarCiz, degerlendirmeCiz, duzeltmeCiz, zincirCiz } };
  if (doc && doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat);
  else baslat();
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.listeler;
})(typeof window !== 'undefined' ? window : globalThis);
