/**
 * GÜNLÜK › RAPORLAR — PLAN-PANEL-2 §0.5 (kullanıcı kararı 2026-10-19) `AG.pages.raporlar`
 * ═══════════════════════════════════════════════════════════════════════════
 * Rapor motorunun (lib/rapor.js) arşivi: Günlük / Haftalık / Aylık / Yıllık seçici (67.5) + rapor günü (önceki / sonraki), dört sayı, Botlar tablosu
 * ve işlemleri (katlı), Model emirleri, Portföy botlarının tercihleri, Telegram'a giden özet. "Şimdi hazırla" masaüstünde
 * (POST /api/rapor/olustur; Telegram'a göndermez). Geliştirme bilgisayarı raporları sunucudan okur.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  /** 72.0: görünen bot/model adı kimlikten (AG.botAd); yoksa sunucu metni çevrilir (eski sürüm "Hücum" yazabilir). */
  const cv = (t) => (AG.botAd ? AG.botAd.cevir(t) : t);
  const botAdi = (b) => (b && AG.botAd && AG.botAd.ad(b.kimlik || b.id)) || cv(b && b.adGorunen);
  const modelAdi = (m) => (m && AG.botAd && AG.botAd.ad(m.id || m.model)) || cv(m && m.ad);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const tr = (x, b = 2) => (sayiMi(x) ? x.toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b }) : '—');
  const SIMGE = { USD: '$', TRY: '₺', TL: '₺' };
  const para = (x, p = 'USD', b = 2) => (sayiMi(x) ? `${x < 0 ? '−' : ''}${SIMGE[p] || ''}${tr(Math.abs(x), b)}${SIMGE[p] ? '' : ' ' + p}` : '—');
  const isaretli = (x, p = 'USD') => (sayiMi(x) ? `${x > 0 ? '+' : ''}${para(x, p)}` : '—');
  const yuzde = (x) => (sayiMi(x) ? AG.fmt.oranYuzde(x, 1, { isaretli: true }) : '—');
  const ton = (x) => (sayiMi(x) && Math.abs(x) > 1e-9 ? (x > 0 ? 'p-pos' : 'p-neg') : '');
  const gunTr = (g) => (g ? `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}` : '—');
  const saat = (ms) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const DURUM_AD = { calisiyor: 'çalışıyor', durdu: 'durdu', engel: 'ENGEL' };
  const MOD_AD = { demo: 'demo', kagit: 'kâğıt', canli: 'canlı hesap' };
  const DURUM_TON = { calisiyor: 'pos', durdu: 'warn', engel: 'neg' };
  const MODEL_DURUM = { bekliyor: 'bekliyor', kismi: 'kısmen uygulandı', uygulandi: 'uygulandı', atlandi: 'atlandı' };
  // 67.5: aylık ve yıllık raporlar
  const TURLER = [['gunluk', 'Günlük'], ['haftalik', 'Haftalık'], ['aylik', 'Aylık'], ['yillik', 'Yıllık']];
  const AY_AD = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const gStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  /** Saf: seçicide dönemin adı ("15.10.2026" · "12.10.2026 haftası" · "Ekim 2026" · "2026"). */
  function donemAdi(tur, bas) {
    if (!bas) return '—';
    if (tur === 'haftalik') return `${gunTr(bas)} haftası`;
    if (tur === 'aylik') return `${AY_AD[+bas.slice(5, 7) - 1]} ${bas.slice(0, 4)}`;
    if (tur === 'yillik') return bas.slice(0, 4);
    return gunTr(bas);
  }
  /** Saf: rapor başlığı (sunucunun Telegram başlığıyla aynı dil). */
  function baslikMetni(r) {
    if (r.tur === 'haftalik') return `Haftalık rapor — ${gunTr(r.bas)} – ${gunTr(r.bit)}`;
    if (r.tur === 'aylik') return `Aylık rapor — ${donemAdi('aylik', r.bas)}`;
    if (r.tur === 'yillik') return `Yıllık rapor — ${donemAdi('yillik', r.bas)}`;
    return `Günlük rapor — ${gunTr(r.bas)}`;
  }
  /** Saf: "Şimdi hazırla" hangi dönemin içinden bir gün gönderir — son BİTEN dönem (dün · geçen hafta · geçen ay · geçen yıl). */
  function hazirlaGunu(tur, bugun) {
    const d = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate(), 12);
    if (tur === 'haftalik') { d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 1); return gStr(d); }   // geçen haftanın pazarı
    if (tur === 'aylik') { d.setDate(0); return gStr(d); }                                          // geçen ayın son günü
    if (tur === 'yillik') return `${d.getFullYear() - 1}-12-31`;
    d.setDate(d.getDate() - 1); return gStr(d);
  }
  const BOS_METIN = { gunluk: 'Henüz günlük rapor yok. Her sabah 09:00\'dan sonra dünün raporu hazırlanır.', haftalik: 'Henüz haftalık rapor yok. İlki pazartesi sabahı hazırlanır.',
    aylik: 'Henüz aylık rapor yok. Her ayın 1\'i 09:00\'dan sonra geçen ayın raporu hazırlanır.', yillik: 'Henüz yıllık rapor yok. 1 Ocak 09:00\'dan sonra geçen yılın raporu hazırlanır.' };
  const HAZIRLA_IPUCU = { gunluk: 'Dünün raporunu şimdi hazırlar (Telegram\'a göndermez)', haftalik: 'Geçen haftanın raporunu şimdi hazırlar (Telegram\'a göndermez)',
    aylik: 'Geçen ayın raporunu şimdi hazırlar (Telegram\'a göndermez)', yillik: 'Geçen yılın raporunu şimdi hazırlar (Telegram\'a göndermez)' };

  const durum = { tur: 'gunluk', bas: null };
  let veri = null;

  const telefon = () => !!((AG.pages && AG.pages.kabuk && AG.pages.kabuk.telefon && AG.pages.kabuk.telefon()) || (AG.api && AG.api.kademe && AG.api.kademe() === 'telefon'));
  const gosterge = (etiket, deger, alt, sinif) => el('div', { class: 'p-gosterge' }, [
    el('p', { class: 'p-gosterge-etiket' }, [el('span', { text: etiket })]),
    el('p', { class: `p-gosterge-deger${sinif ? ' ' + sinif : ''}`, text: deger }),
    alt ? el('p', { class: 'p-gosterge-alt', text: alt }) : null]);
  const kart = (baslik, ic, id) => el('section', { class: 'p-kart mb-4', id: id || null }, [el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: baslik })]), ...ic]);
  const tablo = (id, basliklar, satirlar) => AG.tablo.kutulu({ id, sinif: 'p-tablo rp-tablo', basliklar, satirlar }, 'p-tablo-kap');
  const rozet = (metin, t) => el('span', { class: `p-rozet${t ? ' p-rozet-' + t : ''}`, text: metin });

  /** Saf: aynı türdeki raporlar arasında önceki / sonraki. */
  function komsular(liste, tur, bas) {
    const l = (liste || []).filter(x => x.tur === tur).map(x => x.bas).sort();
    const i = l.indexOf(bas);
    return { onceki: i > 0 ? l[i - 1] : null, sonraki: i >= 0 && i < l.length - 1 ? l[i + 1] : null, hepsi: l.slice().reverse() };
  }

  function ustCiz(r, liste) {
    const k = komsular(liste, durum.tur, r ? r.bas : null);
    const sec = el('select', { id: 'selRaporGun', class: 'form-control rp-gun', 'aria-label': 'Rapor dönemi', onchange: (e) => sec2(e.target.value) },
      (k.hepsi.length ? k.hepsi : ['']).map(b => el('option', { value: b, text: b ? donemAdi(durum.tur, b) : 'rapor yok' })));
    if (r) sec.value = r.bas;
    return el('div', { class: 'rp-ust mb-4', id: 'raporUst' }, [
      el('div', { class: 'p-secici', role: 'group', 'aria-label': 'Rapor türü' }, TURLER.map(([t, ad]) =>
        el('button', { type: 'button', 'aria-pressed': durum.tur === t ? 'true' : 'false', text: ad, onclick: () => { durum.tur = t; durum.bas = null; yukle(); } }))),
      el('button', { type: 'button', class: 'btn btn-secondary rp-ok', 'aria-label': 'Önceki rapor', disabled: k.onceki ? null : '', onclick: () => sec2(k.onceki) }, [el('span', { text: '‹' })]),
      sec,
      el('button', { type: 'button', class: 'btn btn-secondary rp-ok', 'aria-label': 'Sonraki rapor', disabled: k.sonraki ? null : '', onclick: () => sec2(k.sonraki) }, [el('span', { text: '›' })]),
      telefon() ? null : el('button', { type: 'button', class: 'btn btn-secondary rp-hazirla', id: 'btnRaporHazirla', onclick: (e) => hazirla(e.currentTarget),
        title: HAZIRLA_IPUCU[durum.tur] || HAZIRLA_IPUCU.gunluk }, [el('span', { text: 'Şimdi hazırla' })]),
    ]);
  }

  function ciz() {
    const k = bul('raporKok');
    if (!k || !veri) return;
    const r = veri.rapor;
    if (!r) {
      doldur(k, [ustCiz(null, veri.raporlar), el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: BOS_METIN[durum.tur] || BOS_METIN.gunluk })])]);
      return;
    }
    const t = r.toplam || {};
    const bek = (r.modelEmirleri || []).filter(m => m.bekliyor);
    const baslik = baslikMetni(r);
    doldur(k, [
      ustCiz(r, veri.raporlar),
      el('h3', { class: 'rp-baslik', text: baslik }),
      el('div', { class: 'p-serit mb-4', id: 'raporSayilar' }, [
        gosterge('Botlar · değer değişimi', isaretli(t.degisim), 'gerçekleşen + açık pozisyon', ton(t.degisim)),
        gosterge('Bot işlemleri', tr(t.islemSayisi, 0), `ücret ${para(t.ucret)}`),
        gosterge('Gerçekleşen kâr/zarar', isaretli(t.gerceklesenKz), 'kapanan pozisyonlar', ton(t.gerceklesenKz)),
        gosterge('Dikkat', r.dikkat.length ? `${r.dikkat.length} konu` : 'Sorun yok', r.dikkat.length ? cv(r.dikkat[0]) : 'bekleyen iş yok', r.dikkat.length ? 'p-warn' : 'p-pos'),
      ]),
      kart('Botlar', [
        tablo('tblRaporBot', ['Bot', 'Durum', 'Hesap değeri', 'Değişim', 'İşlem', 'Ücret', 'Karar'], (r.botlar || []).map(b => el('tr', null, [
          el('td', { text: `${botAdi(b)}${b.mod ? ` (${MOD_AD[b.mod] || b.mod})` : ''}` }),
          el('td', null, [rozet(DURUM_AD[b.durum] || b.durum, DURUM_TON[b.durum])]),
          el('td', { class: 'sayi', text: para(b.deger) }),
          el('td', { class: `sayi ${ton(b.degisim)}`, text: sayiMi(b.degisim) ? `${isaretli(b.degisim)} (${yuzde(b.oran)})` : '—' }),
          el('td', { class: 'sayi', text: b.islemSayisi ? `${b.islemSayisi} (${b.alis} alış · ${b.satis} satış)` : '0' }),
          el('td', { class: 'sayi', text: para(b.ucret) }),
          el('td', { class: 'df-soluk', text: cv(b.karar) || '—' }),
        ]))),
        (r.botlar || []).some(b => b.islemler && b.islemler.length) ? el('details', { class: 'rp-kat mt-3' }, [
          el('summary', { text: `İşlemler (${t.islemSayisi})` }),
          tablo('tblRaporIslem', ['Zaman', 'Bot', 'Coin', 'Yön', 'Miktar', 'Fiyat', 'Ücret', 'K/Z'], (r.botlar || []).flatMap(b => (b.islemler || []).map(x => el('tr', null, [
            el('td', { class: 'sayi', text: saat(x.zaman) }), el('td', { text: botAdi(b) }), el('td', { text: x.sembol }), el('td', { text: x.yon }),
            el('td', { class: 'sayi', text: tr(x.miktar, 4) }), el('td', { class: 'sayi', text: tr(x.fiyat, 2) }), el('td', { class: 'sayi', text: para(x.ucret, 'USD', 3) }),
            el('td', { class: `sayi ${ton(x.kz)}`, text: x.kz ? isaretli(x.kz) : '—' }),
          ])))),
        ]) : null,
      ], 'raporBotlar'),
      kart('Model emirleri', [
        tablo('tblRaporEmir', ['Model', 'Durum', 'Uygulama günü', 'Bekleme'], (r.modelEmirleri || []).map(m => el('tr', null, [
          el('td', { text: modelAdi(m) }),
          el('td', null, [rozet(MODEL_DURUM[m.durum] || m.durum || '—', m.bekliyor ? (m.gecikme > 3 ? 'neg' : 'warn') : m.durum === 'uygulandi' ? 'pos' : '')]),
          el('td', { text: gunTr(m.uygulamaGunu) }),
          el('td', { class: 'sayi', text: m.bekliyor ? (m.gecikme ? `${m.gecikme} gün` : 'bugün') : '—' }),
        ]))),
        el('p', { class: 'hint hint-sm mt-2 mb-0', text: bek.length ? 'Emirleri Midas\'a girdikten sonra Portföy › Modeller\'de "Uyguladım".' : 'Bu ay bekleyen model emri yok. Durum raporun hazırlandığı anınki.' }),
      ], 'raporEmirler'),
      kart('Portföy botlarının tercihleri', [
        el('div', { class: 'rp-modeller' }, (r.portfoyBotlari || []).map(m => el('div', { class: 'rp-model' }, [
          el('strong', { text: modelAdi(m) }),
          el('span', { class: 'sayi', text: sayiMi(m.ozsermaye) ? `${para(m.ozsermaye, m.para)}${sayiMi(m.degisim) ? ` · ${isaretli(m.degisim, m.para)} (${yuzde(m.oran)})` : ''}` : 'kâğıt hesap henüz başlamadı' }),
          m.pozisyonlar.length ? el('span', { class: 'df-soluk', text: m.pozisyonlar.slice(0, 10).map(p => `${p.sembol}${sayiMi(p.pay) ? ` %${tr(p.pay * 100, 0)}` : ''}`).join(' · ') + (sayiMi(m.nakit) ? ` · nakit ${para(m.nakit, m.para, 0)}` : '') }) : null,
          m.giren.length || m.cikan.length ? el('span', { text: `${m.giren.length ? `giren: ${m.giren.join(', ')}` : ''}${m.giren.length && m.cikan.length ? ' · ' : ''}${m.cikan.length ? `çıkan: ${m.cikan.join(', ')}` : ''}` }) : null,
          m.islemler.length ? el('span', { class: 'df-soluk', text: `${m.islemler.length} işlem: ${m.islemler.slice(0, 6).map(x => `${x.tur} ${x.sembol}`).join(', ')}${m.islemler.length > 6 ? ' …' : ''}` }) : el('span', { class: 'df-soluk', text: 'bu dönemde işlem yok' }),
        ]))),
      ], 'raporModeller'),
      kart('Telegram\'a giden özet', [el('pre', { class: 'rp-telegram', text: String(r.telegram || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') })], 'raporTelegram'),
      el('p', { class: 'hint hint-sm mb-0', text: `Hazırlanma: ${saat(Date.parse(r.olusturma))}. Bot değeri botların özsermaye eğrisinden, işlemler bot hesap kayıtlarından, model tercihleri kâğıt hesaplardan.` }),
    ]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  function sec2(bas) { if (!bas) return; durum.bas = bas; yukle(); }

  async function hazirla(dugme) {
    AG.dom.mesgul(dugme, 'Hazırlanıyor…');
    try {
      const gun = hazirlaGunu(durum.tur, new Date());
      const r = await AG.api.rapor.olustur(durum.tur, gun, false);
      if (!r || !r.success) { AG.bildir(`Hazırlanamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      durum.bas = r.rapor.bas;
      AG.bildir('Rapor hazırlandı.', 'ok');
      await yukle();
    } catch (e) { AG.bildir(`Hazırlanamadı: ${e.message}`, 'hata'); } finally { AG.dom.hazir(dugme); }
  }

  async function yukle() {
    const k = bul('raporKok');
    if (!k) return;
    let r;
    try { r = await AG.api.rapor.getir(durum.tur, durum.bas); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(k, [AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Rapor okunamadı', yeniden: yukle })]); return; }
    veri = r;
    if (r.rapor) durum.bas = r.rapor.bas;
    ciz();
  }

  if (doc && doc.addEventListener) doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-raporlar') yukle(); });

  AG.pages = AG.pages || {};
  AG.pages.raporlar = { yukle, komsular, donemAdi, baslikMetni, hazirlaGunu, TURLER, _durum: { durum, veriAyarla: (v) => { veri = v; } }, _ciz: { ciz } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.raporlar;
})(typeof window !== 'undefined' ? window : globalThis);
