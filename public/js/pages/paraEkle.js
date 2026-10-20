/**
 * PORTFÖY › HEDEFİM › PARA EKLE VE DAĞILIMI DEĞİŞTİR (`AG.pages.paraEkle`, sürüm 67.3; onaylı taslak 2026-10-19)
 * ═══════════════════════════════════════════════════════════════════════════
 * Hedefim sayfasındaki "Planla" düğmesi (js/pages/pano.js hedefimCiz) bu planlayıcıyı aynı kaba çizer. Bölüm sırası (kullanıcı):
 *   1 Eklenecek para → 2 Her hisse için kural → özet şeridi → 3 Yapılacaklar (kaydet / vazgeç / kopyala) → 4 Portföy botları (EN ALTTA).
 * Hesap: js/core/paraPlan.js (saf; öz test scripts/para-plan-selftest.js). Plan seçili portföyün TEK hesabında yapılır (birden çok
 * hesap varsa seçici; varsayılan pozisyonu en büyük USD hesabı). "Tümü" seçiliyken salt okunur.
 * Satış: satılacak adet ve satıştan SONRA ELİNDE KALMASI GEREKEN adet tabloda vurgulu, Yapılacaklar'da "Önce sat" kutusunda büyük
 * ve kopyalanan listede yazılır. "Aldım, işlemleri kaydet" → POST /api/portfoyum/plan-kaydet (yatırma + satış + alış tek pakette,
 * atomik; her satırın gerçek adet/fiyatı önce düzeltilebilir). "Vazgeç" hiçbir şey yazmaz.
 * Portföy botları: GET /api/tasarimci/aday-havuzu + /modeller + /emirler (fiyat bilinen satırlar) — liste öneri DEĞİL, botun kuralının
 * bugünkü sonucu; "+ Plana ekle" fiyatı POST /api/portfoyum/sembol-bul ile alır (satır başına ağ isteği yok), Sabit %5 gelir.
 * Kurallar: DOM yalnız AG.dom, satır içi stil yok, yazma düğmeleri data-kilit="telefon".
 */
(function (global) {
  'use strict';
  const AG = global.AG = global.AG || {};
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const P = () => AG.paraPlan;
  const OKUMA = new Set(['ozet', 'islemler', 'csvYolu', 'gecmis', 'kiyas', 'rapor', 'kur', 'labGirdi', 'sembolBul', 'csvOnizle', 'fiyatYenile']);
  const api = () => (AG.evKuyruk ? AG.evKuyruk.sarmala(AG.api.portfoyum, OKUMA) : AG.api.portfoyum);
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);

  // ── Biçim ─────────────────────────────────────────────────────────────────
  const SIMGE = { USD: '$', TRY: '₺', EUR: '€', GBP: '£' };
  const tr = (x, b = 2) => (sayiMi(x) ? x.toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b }) : '—');
  const para = (x, p, b = 2) => (sayiMi(x) ? (x < 0 ? '−' : '') + (SIMGE[p] || '') + tr(Math.abs(x), b) : '—');
  const yuzde = (x, b = 2) => (sayiMi(x) ? '%' + tr(x * 100, b) : '—');
  const adetM = (x) => P().adetMetni(x);
  /** Girdi kutusu için gruplamasız sayı ("1234,5"): "1.234" belirsizliği (binlik mi ondalık mı) doğmasın. */
  const girdiSayi = (x, b = 6) => (sayiMi(x) ? x.toLocaleString('tr-TR', { useGrouping: false, maximumFractionDigits: b }) : '');
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const gunKisa = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? `${Number(s.slice(8, 10))} ${AY[Number(s.slice(5, 7)) - 1]}` : '—');
  const birimAd = (B) => (B === 'TRY' ? 'TL' : 'USD');

  // ── Küçük bileşenler (p- ailesi; pano.js ile aynı) ─────────────────────────
  const kart = (ic, ek, id) => el('section', { class: `p-kart${ek ? ' ' + ek : ''}`, id: id || null }, ic);
  const kartBas = (baslik, sag) => el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: baslik }), sag || null]);
  const rozet = (metin, tur) => el('span', { class: `p-rozet${tur ? ' p-rozet-' + tur : ''}`, text: metin });
  const dugme = (metin, f, tur, ek) => {
    const o = { ...(ek || {}) };
    const sinif = `p-dugme${tur ? ' p-dugme-' + tur : ''}${o.ekSinif ? ' ' + o.ekSinif : ''}`;
    delete o.ekSinif;
    return el('button', { type: 'button', class: sinif, onclick: f, ...o }, [el('span', { text: metin })]);
  };
  const secici = (etiket, secenekler, secili, f) => el('div', { class: 'p-secici', role: 'group', 'aria-label': etiket }, secenekler.map(([k, ad]) => el('button', {
    type: 'button', 'aria-pressed': k === secili ? 'true' : 'false', text: ad, onclick: () => f(k)
  })));
  const tablo = (basliklar, satirlar) => AG.tablo.kutulu({ sinif: 'p-tablo', basliklar, satirlar }, 'p-tablo-kap');
  const th = (metin, sag) => el('th', { class: sag ? 'p-sag' : null, text: metin });
  const bos = (metin) => el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: metin })]);
  const bant = (metin, tur) => el('div', { class: `p-bant${tur ? ' p-bant-' + tur : ''}` }, [el('p', { class: 'p-bant-metin', text: metin })]);
  const bildir = (m, t, o) => { if (AG.bildir) AG.bildir(m, t, o); };

  // ── Durum (portföy başına; sayfa yeniden çizilince kaybolmaz) ───────────────
  const durumlar = new Map();
  const ilk = () => ({ para: '', birim: 'TL', hesap: null, kesirli: null, nakitKullan: false, kurallar: {}, ekler: [], duzelt: {}, tarih: '', yatan: '', yatanOneri: null, bulMetin: '' });
  const durumAl = (pid) => { if (!durumlar.has(pid)) durumlar.set(pid, ilk()); return durumlar.get(pid); };
  let son = null;   // { k, ctx } — durum değişince aynı kaba yeniden çizilir
  const yeniden = () => { if (son) ciz(son.k, son.ctx); };

  /** Görünüm modeli: hesap, para birimi, satırlar ve saf plan sonucu. */
  function modelKur(oz, pid, st) {
    const d = oz.degerleme || {};
    const kur = d.kur && sayiMi(d.kur.USDTRY) ? d.kur.USDTRY : null;
    const hesaplar = (oz.hesaplar || []).filter(h => h.durum !== 'kapali' && (h.portfoy || 'ben') === pid);
    const poz = (d.pozisyonlar || []).filter(p => sayiMi(p.adet) && p.adet > 1e-12);
    const hesapDeger = (h) => poz.filter(p => p.hesap === h.id).reduce((a, p) => a + (p.degerUSD || 0), 0);
    const hesap = hesaplar.find(h => h.id === st.hesap) || hesaplar.slice().sort((a, b) => (b.para === 'USD') - (a.para === 'USD') || hesapDeger(b) - hesapDeger(a))[0] || null;
    const B = hesap ? hesap.para : 'USD';
    const destek = B === 'USD' || B === 'TRY';
    const hPoz = hesap ? poz.filter(p => p.hesap === hesap.id) : [];
    const uygun = hPoz.filter(p => p.para === B && sayiMi(p.fiyat) && p.fiyat > 0);
    const disarida = hPoz.filter(p => !uygun.includes(p));
    const nakit = hesap ? (d.nakitler || []).filter(n => n.hesap === hesap.id && n.para === B).reduce((a, n) => a + (n.tutar || 0), 0) : 0;
    const yazilan = P().sayi(st.para);
    const ham = sayiMi(yazilan) ? yazilan : 0;
    const cevir = (x, birim) => (birim === birimAd(B) ? x : !kur ? NaN : B === 'USD' ? x / kur : x * kur);
    const yeniPara = cevir(ham, st.birim);
    const nakitEk = st.nakitKullan && nakit > 0.005 ? nakit : 0;
    const kesirli = st.kesirli == null ? B === 'USD' : st.kesirli;
    const kural = (a, varsayilan) => st.kurallar[a] || varsayilan;
    const satirlar = [
      ...uygun.map(p => { const a = 'v:' + p.varlik, k = kural(a, { kural: 'oran', hedef: '' }); return { anahtar: a, s: p.sembol, ad: p.ad, varlik: p.varlik, adet: p.adet, fiyat: p.fiyat, fiyatTarih: p.fiyatTarih, kural: k.kural, hedef: k.hedef }; }),
      ...st.ekler.filter(e => !uygun.some(p => p.sembol === e.s)).map(e => ({ anahtar: e.anahtar, s: e.s, ad: e.ad, aday: e.aday, adet: 0, fiyat: e.fiyat, kural: 'sabit', hedef: e.hedef, yeni: true }))
    ];
    const o = P().hesapla({ satirlar, M: (sayiMi(yeniPara) ? yeniPara : 0) + nakitEk, kesirli });
    if (!sayiMi(yeniPara)) { o.hatalar.push('kur yok — tutarı hesabın para biriminde yaz'); o.durum = 'hata'; }
    return { hesaplar, hesap, B, destek, kur, nakit, nakitEk, yeniPara: sayiMi(yeniPara) ? yeniPara : 0, ham, kesirli, o, disarida, satirlar };
  }
  /** Hesap para biriminden öbürüne (≈ TL / ≈ $). */
  const karsi = (m, x) => (!m.kur || !sayiMi(x) ? '—' : m.B === 'USD' ? '≈ ₺' + tr(Math.abs(x) * m.kur, 0) : '≈ $' + tr(Math.abs(x) / m.kur, 0));
  /** Kullanıcı tutarı hesabın para biriminden başka birimde mi yazdı (TL yazıp USD hesaba)? */
  const cevrildi = (m, st) => st.birim !== birimAd(m.B);

  // ═══ ÇİZİM ════════════════════════════════════════════════════════════════
  /** ctx: { x (pano verisi: ozet), pid, pAd(id), salt (Tümü), geri (Hedefim'e dön), yenile (kayıttan sonra önbelleği boşalt + çiz) } */
  function ciz(k, ctx) {
    son = { k, ctx };
    const oz = ctx.x.ozet, pid = ctx.pid, ad = ctx.pAd(pid);
    const bas = kart([
      kartBas('Para ekle ve dağılımı değiştir', dugme('← Hedefim', ctx.geri, 'sessiz', { id: 'btnPeGeri' })),
      el('p', { class: 'pn-metin', text: `Portföye para ekleyeceksen ya da dağılımı değiştireceksen, hangi hisseden ne kadar alıp satacağını burada hesaplarsın. Botların listesinden hisse de ekleyebilirsin (sayfanın en altında). Panel emir göndermez. "Aldım, işlemleri kaydet" dersen işlemler seçili portföye${ctx.salt ? '' : ` (${ad})`} yazılır; "Vazgeç" dersen hiçbir şey yazılmaz.` })
    ], 'p-kart-vurgu');
    if (ctx.salt) {
      doldur(k, [el('div', { class: 'pe-kok' }, [bas, bant('"Tümü" görünümünde plan yapılamaz: işlemlerin hangi portföye yazılacağı belli değil. Üst çubuktan bir portföy seç (Ben, ANIL …).', 'uyari'), botKap()])]);
      botDoldur(null, ctx);
      return;
    }
    const st = durumAl(pid);
    const m = modelKur(oz, pid, st);
    let govde;
    if (!m.hesap) govde = [kart([bos(`${ad} portföyünde açık hesap yok — önce Portföy › Hesaplar'dan hesap aç.`)])];
    else if (!m.destek) govde = [paraKart(m, st, oz), bant(`${m.hesap.ad} ${m.B} hesabı — planlayıcı USD ve TL hesaplarla çalışır.`, 'uyari')];
    else govde = [paraKart(m, st, oz), kuralKart(m, st), ozetSerit(m), isKart(m, st, oz, ctx)];
    doldur(k, [el('div', { class: 'pe-kok' }, [bas, ...govde, botKap()])]);
    botDoldur(m, ctx);
  }

  // ── 1 · Eklenecek para ───────────────────────────────────────────────────
  function paraKart(m, st, oz) {
    const kurum = (id) => { const z = (oz.kurumlar || []).find(x => x.id === id); return z ? z.ad : ''; };
    const hesapAd = (h) => [h.ad, kurum(h.kurum), h.para].filter(Boolean).join(' · ');
    const hesapAlani = m.hesaplar.length > 1
      ? el('div', { class: 'p-alan pe-hesap' }, [el('label', { for: 'peHesap', text: 'Hesap' }),
        el('select', { id: 'peHesap', onchange: (e) => { const yeni = ilk(); yeni.hesap = e.target.value; yeni.para = st.para; yeni.birim = st.birim; durumlar.set(son.ctx.pid, yeni); yeniden(); } },
          m.hesaplar.map(h => el('option', { value: h.id, selected: h.id === m.hesap.id ? '' : null, text: hesapAd(h) })))])
      : el('div', { class: 'pe-tutar-kutu' }, [el('span', { class: 'p-alan-etiket', text: 'Hesap' }), el('strong', { text: hesapAd(m.hesap) }), el('span', { class: 'pn-soluk', text: 'portföyde tek hesap' })]);
    const nakitSatiri = m.nakit > 0.005
      ? el('label', { class: 'pe-onay' }, [el('input', { type: 'checkbox', id: 'peNakit', checked: st.nakitKullan ? '' : null, onchange: () => { st.nakitKullan = !st.nakitKullan; yeniden(); } }),
        el('span', { text: `Hesaptaki nakdi de dağıt — ${m.hesap.ad} hesabında ${para(m.nakit, m.B)} nakit var (kapalıyken nakit plana girmez, yalnız eklediğin para dağıtılır)` })])
      : m.nakit < -0.005 ? el('p', { class: 'p-kart-alt', text: `${m.hesap.ad} hesabında nakit eksi (${para(m.nakit, m.B)}) — bir para yatırma ya da satış kaydı eksik olabilir.` }) : null;
    const kurTarih = (oz.degerleme && oz.degerleme.kur && oz.degerleme.kur.tarih) || '';
    return kart([
      kartBas('1 · Eklenecek para'),
      el('div', { class: 'pe-para-satir' }, [
        el('div', { class: 'p-alan pe-tutar-alan' }, [el('label', { for: 'pePara', text: 'Tutar (yalnız dağılım değişecekse 0)' }),
          el('input', { id: 'pePara', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', value: st.para, onchange: (e) => { st.para = e.target.value; yeniden(); } })]),
        secici('Para birimi', [['TL', '₺'], ['USD', '$']], st.birim, (v) => {
          if (v === st.birim) return;
          const x = P().sayi(st.para);
          if (sayiMi(x) && x > 0 && m.kur) st.para = girdiSayi(v === 'USD' ? x / m.kur : x * m.kur, v === 'USD' ? 2 : 0);
          st.birim = v; yeniden();
        }),
        el('div', { class: 'pe-tutar-kutu' }, [el('span', { class: 'p-alan-etiket', text: m.B === 'USD' ? 'Dolar karşılığı (hesaba geçecek)' : 'TL karşılığı (hesaba geçecek)' }),
          el('p', { class: 'pe-tutar p-sayi', id: 'peParaB', text: para(m.yeniPara, m.B) }),
          el('span', { class: 'pn-soluk', text: m.kur ? `kur ${tr(m.kur, 4)}${kurTarih ? ' (' + AG.fmt.tarih(kurTarih) + ')' : ''}${cevrildi(m, st) ? ` · aracı kurumun kuru farklıysa tutarı ${m.B === 'USD' ? '$' : '₺'} olarak yaz` : ''}` : 'kur yok' })]),
        hesapAlani
      ]),
      nakitSatiri,
      m.disarida.length ? el('p', { class: 'p-kart-alt', text: `Bu planda yok (para birimi farklı ya da fiyat yok): ${m.disarida.map(p => p.sembol).join(', ')}.` }) : null
    ]);
  }

  // ── 2 · Her hisse için kural ─────────────────────────────────────────────
  function kuralKart(m, st) {
    const o = m.o;
    const kuralYaz = (r, v) => {
      if (r.yeni && v === 'oran') { bildir('Yeni hisse yalnız "Sabit %" olabilir (bugün payı 0).', 'uyari'); return; }
      if (r.yeni || v === r.kural) return;
      st.kurallar[r.anahtar] = { kural: v, hedef: v === 'sabit' ? girdiSayi(Math.round(r.hp * 10000) / 100, 2) : '' };
      yeniden();
    };
    const hedefYaz = (r, deger) => {
      if (r.yeni) { const e = st.ekler.find(x => x.anahtar === r.anahtar); if (e) e.hedef = deger; } else st.kurallar[r.anahtar] = { kural: 'sabit', hedef: deger };
      yeniden();
    };
    const satirlar = o.satirlar.map(r => {
      const sat = r.yon === 'sat', al = r.yon === 'al';
      return el('tr', { class: sat ? 'pe-satir-sat' : null }, [
        el('td', null, [el('strong', { text: r.s + ' ' }), r.yeni ? rozet('eklenecek', 'vurgu') : null, el('span', { class: 'pn-soluk pn-alt-satir', text: r.ad && r.ad !== r.s ? r.ad : '' })]),
        el('td', { class: 'p-sayi' }, [el('span', { text: r.yeni ? 'yok' : adetM(r.elde) + ' adet' }), el('span', { class: 'pn-soluk pn-alt-satir', text: para(r.fiyat, m.B) })]),
        el('td', { class: 'p-sag p-sayi', text: yuzde(r.suanPay) }),
        el('td', null, [secici(`${r.s} kuralı`, [['sabit', 'Sabit %'], ['oran', 'Oranını koru']], r.kural, (v) => kuralYaz(r, v))]),
        el('td', { class: 'p-sag' }, [r.kural === 'sabit'
          ? el('input', { type: 'text', inputmode: 'decimal', class: 'pe-girdi', 'aria-label': `${r.s} hedef payı (%)`, value: String(r.hedef == null ? '' : r.hedef), onchange: (e) => hedefYaz(r, e.target.value) })
          : el('span', { class: 'p-sayi', text: yuzde(r.hp) })]),
        el('td', { class: `p-sag p-sayi${sat ? ' p-warn' : al ? ' p-pos' : ''}`, text: sat ? 'sat ' + para(-r.al, m.B) : al ? 'al ' + para(r.al, m.B) : '—' }),
        el('td', { class: 'p-sag p-sayi', text: r.yon ? adetM(r.adet) : '—' }),
        el('td', { class: 'p-sag p-sayi' }, [sat ? el('strong', { class: 'pe-kalmali', text: `${adetM(r.sonrakiAdet)} kalmalı` }) : el('span', { text: adetM(r.sonrakiAdet) })]),
        el('td', { class: 'p-sag p-sayi pn-soluk', text: r.yon ? karsi(m, r.tutar) : '—' }),
        el('td', null, [r.yeni ? dugme('×', () => { st.ekler = st.ekler.filter(x => x.anahtar !== r.anahtar); yeniden(); }, 'sessiz', { 'aria-label': `${r.s} plandan çıkar`, ekSinif: 'p-dugme-simge p-dugme-kucuk' }) : null])
      ]);
    });
    const bulGirdi = el('input', { id: 'peYeniSembol', type: 'text', autocomplete: 'off', placeholder: 'ör. MSFT', value: st.bulMetin, onchange: (e) => { st.bulMetin = e.target.value; } });
    return kart([
      kartBas('2 · Her hisse için kural', el('span', { class: 'pn-soluk', text: 'Sabit %: payı sen yazarsın (0 = hepsini sat) · Oranını koru: kalan pay bugünkü oranlarla bölünür' })),
      o.satirlar.length ? tablo(['Hisse', 'Adet · fiyat', 'Şu an', 'Kural', 'Hedef pay', 'Al / sat', 'İşlem adedi', 'Sonra elinde', m.B === 'USD' ? '≈ TL' : '≈ $', ''].map((h, i) => th(h, [2, 4, 5, 6, 7, 8].includes(i))), satirlar)
        : bos(`${m.hesap.ad} hesabında hisse yok — aşağıdan ya da botların listesinden hisse ekle.`),
      el('div', { class: 'pe-bul' }, [
        el('div', { class: 'p-alan' }, [el('label', { for: 'peYeniSembol', text: 'Listede olmayan hisse' }), bulGirdi]),
        dugme('Bul', (e) => { const q = String(bulGirdi.value || '').trim(); st.bulMetin = q; if (q) ekle(q, e.currentTarget, m); }, null, { id: 'btnPeBul', 'data-kilit': 'telefon' }),
        el('span', { class: 'pn-soluk', text: 'fiyat Yahoo\'dan gelir; yeni hisse yalnız "Sabit %" olabilir (bugün payı 0)' })
      ])
    ]);
  }

  // ── Özet şeridi ──────────────────────────────────────────────────────────
  function durumMetni(m) {
    const o = m.o;
    if (o.durum === 'hata') return { tur: 'hata', baslik: 'Hesaplanamadı', alt: o.hatalar.join(' · ') };
    if (o.durum === 'asim') return { tur: 'asim', baslik: 'Sabit paylar %100\'ü aşıyor', alt: `Sabit payların toplamı ${yuzde(o.sabitPay, 1)} — düşürmeden kaydedilemez.` };
    const nakit = o.nakitArtan > 0.005 ? ` ${para(o.nakitArtan, m.B)} nakitte kalır.` : '';
    if (o.durum === 'satis') return { tur: 'satis', baslik: 'Satış gerekir: ' + o.satislar.map(r => r.s).join(', '), alt: 'Satılacaklar aşağıda, alımlardan önce.' + nakit };
    if (!o.alimlar.length) return { tur: 'tamam', baslik: 'İşlem yok', alt: (o.M > 0.005 ? 'Para eklendi ama alınacak bir şey çıkmadı.' : 'Eklenecek para ya da kural değişikliği yok.') + nakit };
    return { tur: 'tamam', baslik: 'Satış gerekmiyor', alt: (o.M > 0.005 ? 'Bütün para alıma gider.' : 'Yalnız alım.') + nakit };
  }
  function ozetSerit(m) {
    const o = m.o, d = durumMetni(m);
    const g = (etiket, deger, alt) => el('div', { class: 'p-gosterge' }, [el('p', { class: 'p-gosterge-etiket' }, [el('span', { text: etiket })]), el('p', { class: 'p-gosterge-deger', text: deger }), alt ? el('p', { class: 'p-gosterge-alt', text: alt }) : null]);
    return el('div', { id: 'pePlanOzet', class: 'p-serit' }, [
      g('Bugünkü değer', para(o.T0, m.B), `${m.hesap.ad} · hisseler`),
      g('Para eklenince', para(o.T, m.B), m.nakitEk ? `+ ${para(m.nakitEk, m.B)} hesaptaki nakit` : null),
      g('Sabit paylar · oranını koruyan', `${yuzde(o.sabitPay, 1)} · ${yuzde(Math.max(0, o.kalanPay), 1)}`),
      el('div', { class: `p-gosterge pe-durum pe-durum-${d.tur}`, id: 'pePlanDurum' }, [el('p', { class: 'p-gosterge-etiket' }, [el('span', { text: 'Durum' })]), el('p', { class: 'pe-durum-baslik', text: d.baslik }), el('p', { class: 'p-gosterge-alt', text: d.alt })])
    ]);
  }

  // ── 3 · Yapılacaklar ─────────────────────────────────────────────────────
  /** Satırın kaydedilecek adet/fiyatı: kullanıcı düzelttiyse o (öneri değişmediyse), yoksa plan. */
  function duzeltme(st, r) {
    const d = st.duzelt[`${r.anahtar}|${r.yon}`];
    if (d && d.oneri === r.adet && d.oneriFiyat === r.fiyat) return d;
    return { oneri: r.adet, oneriFiyat: r.fiyat, adet: girdiSayi(r.adet), fiyat: girdiSayi(r.fiyat, 4) };
  }
  function duzeltAlanlari(st, r, m) {
    const d = duzeltme(st, r), a = `${r.anahtar}|${r.yon}`;
    const yaz = (alan) => (e) => { st.duzelt[a] = { ...duzeltme(st, r), [alan]: e.target.value }; };
    const id = `pe${r.yon === 'sat' ? 'Sat' : 'Al'}-${r.s.replace(/[^A-Za-z0-9]/g, '')}`;
    return el('div', { class: 'pe-duzelt pm-yazma' }, [
      el('div', { class: 'p-alan' }, [el('label', { for: id + '-adet', text: r.yon === 'sat' ? 'Sattığın adet' : 'Aldığın adet' }), el('input', { id: id + '-adet', type: 'text', inputmode: 'decimal', value: d.adet, onchange: yaz('adet') })]),
      el('div', { class: 'p-alan' }, [el('label', { for: id + '-fiyat', text: `Fiyat (${SIMGE[m.B]})` }), el('input', { id: id + '-fiyat', type: 'text', inputmode: 'decimal', value: d.fiyat, onchange: yaz('fiyat') })])
    ]);
  }
  const yatanDeger = (m, st) => (st.yatan && st.yatanOneri === m.yeniPara ? st.yatan : girdiSayi(Math.round(m.yeniPara * 100) / 100, 2));
  function isKart(m, st, oz, ctx) {
    const o = m.o, ad = ctx.pAd(ctx.pid);
    const yatirma = m.yeniPara > 0.005;
    const tarihGirdi = el('input', { id: 'peTarih', type: 'date', max: oz.bugun, value: st.tarih || oz.bugun, onchange: (e) => { st.tarih = e.target.value; } });
    const satisKutu = o.satislar.length ? el('div', { class: 'pe-sat-kutu', id: 'peSatKutu' }, [
      el('strong', { class: 'pe-kutu-baslik pe-kalmali', text: 'Önce sat — bu dağılım yalnız alımla tutmuyor' }),
      el('ol', { class: 'pe-islemler' }, o.satislar.map(r => el('li', { class: 'pe-islem' }, [
        el('p', { class: 'pe-islem-ana' }, [el('strong', { text: `${r.s}: ${adetM(r.adet)} adet sat` }), el('span', { text: ' → ' }), el('strong', { class: 'pe-kalmali', text: `satıştan sonra elinde ${adetM(r.sonrakiAdet)} adet kalmalı` })]),
        el('p', { class: 'pn-soluk pe-islem-alt', text: `elde ${adetM(r.elde)} adet · ≈ ${para(r.tutar, m.B)} · fiyat ${para(r.fiyat, m.B)} · ${karsi(m, r.tutar)}${r.hp <= 1e-9 ? ' · hepsi satılıyor' : ''}` }),
        duzeltAlanlari(st, r, m)
      ]))),
      el('p', { class: 'pe-uyari', text: 'Yanlış adet satarsan hesap şaşar: satıştan sonra elinde tam yazan adet kalmalı. Farklı sattıysan kaydetmeden önce gerçek adedi ve fiyatı yaz.' }),
      el('p', { class: 'pn-soluk pe-islem-alt', text: 'Satış kâr ya da zarar doğurur (vergi ve komisyon dahil değil). İstemiyorsan sabit payları düşür.' })
    ]) : null;
    const alimKutu = o.alimlar.length ? el('div', { class: 'pe-al-kutu' }, [
      el('strong', { class: 'pe-kutu-baslik p-pos', text: o.satislar.length ? 'Sonra al' : 'Al' }),
      el('ol', { class: 'pe-islemler' }, o.alimlar.map(r => el('li', { class: 'pe-islem' }, [
        el('p', { class: 'pe-islem-ana' }, [el('strong', { text: `${r.s}: ${adetM(r.adet)} adet al` }), el('span', { class: 'pn-soluk', text: ` · ≈ ${para(r.tutar, m.B)} · ${karsi(m, r.tutar)} → alımdan sonra elinde ${adetM(r.sonrakiAdet)} adet olacak` })]),
        duzeltAlanlari(st, r, m)
      ])))
    ]) : null;
    const yatirmaKutu = yatirma ? el('div', { class: 'p-kart-kat pe-yatirma' }, [
      el('p', { class: 'pe-islem-ana' }, [el('strong', { text: `Para yatır: ${m.hesap.ad} hesabına ${para(m.yeniPara, m.B)}` }),
        el('span', { class: 'pn-soluk', text: cevrildi(m, st) ? ` (${para(m.ham, st.birim === 'TL' ? 'TRY' : 'USD', st.birim === 'TL' ? 0 : 2)}, kur ${tr(m.kur, 4)})` : '' })]),
      el('div', { class: 'pe-duzelt pm-yazma' }, [el('div', { class: 'p-alan' }, [el('label', { for: 'peYatan', text: `Hesaba geçen tutar (${SIMGE[m.B]})` }),
        el('input', { id: 'peYatan', type: 'text', inputmode: 'decimal', value: yatanDeger(m, st), onchange: (e) => { st.yatan = e.target.value; st.yatanOneri = m.yeniPara; } })])])
    ]) : null;
    const islemVar = yatirma || o.satislar.length > 0 || o.alimlar.length > 0;
    const kaydedilebilir = islemVar && (o.durum === 'tamam' || o.durum === 'satis');
    return kart([
      kartBas('3 · Yapılacaklar', el('div', { class: 'p-alan pe-tarih pm-yazma' }, [el('label', { for: 'peTarih', text: 'İşlem tarihi' }), tarihGirdi])),
      el('div', { class: 'pe-isler' }, [
        yatirmaKutu, satisKutu, alimKutu,
        !islemVar ? bos('Yapılacak işlem yok — eklenecek parayı yaz ya da kuralları değiştir.') : null,
        o.nakitArtan > 0.005 && islemVar ? el('p', { class: 'p-kart-alt', text: `≈ ${para(o.nakitArtan, m.B)} nakitte kalır (adet yuvarlaması${o.satirlar.some(r => r.kural === 'oran') ? '' : ' ve sabit payların dışı'}).` }) : null,
        el('label', { class: 'pe-onay' }, [el('input', { type: 'checkbox', id: 'peKesirli', checked: m.kesirli ? '' : null, onchange: () => { st.kesirli = !m.kesirli; yeniden(); } }),
          el('span', { text: 'Kesirli adet (Midas ABD hisselerinde kesirli alım var; kapalıysa tam adede yuvarlanır, artan para nakitte kalır)' })]),
        el('div', { class: 'pe-eylemler' }, [
          dugme('Aldım, işlemleri kaydet', (e) => kaydet(e.currentTarget, m, st, ctx), 'ana', { id: 'btnPeKaydet', 'data-kilit': 'telefon', ekSinif: 'pm-yazma', disabled: kaydedilebilir ? null : '' }),
          dugme('Vazgeç', () => { durumlar.delete(ctx.pid); bildir('Plan temizlendi; portföye hiçbir şey yazılmadı.', 'bilgi'); yeniden(); }, null, { id: 'btnPeVazgec' }),
          dugme('Listeyi kopyala', () => kopyala(m, st, ad), null, { id: 'btnPeKopyala', disabled: islemVar ? null : '' }),
          dugme('Bu dağılımı geçmişte dene', (e) => gecmisteDene(e.currentTarget, m, oz), null, { id: 'btnPeGecmis', 'data-kilit': 'telefon', title: 'Hedef payları Araştırma › Portföy laboratuvarı Kurucu\'ya aktarır ve geçmişte simüle eder (gerçek hesaba dokunmaz)', disabled: o.satirlar.some(r => r.hp > 1e-9) ? null : '' }),
          el('span', { class: 'pn-soluk', text: `Kaydedince ${ad} portföyündeki ${m.hesap.ad} hesabına tek seferde yazılır (para yatırma + satışlar + alışlar). Kaydetmeden önce her satırın gerçek fiyatını ve adedini düzeltebilirsin.` })
        ])
      ])
    ], null, 'peYapilacaklar');
  }

  /** Portföyüm varlığı → laboratuvar katalog kimliği (lib/portfoyum/api.js labKimligi ile aynı kural). */
  const labKimligi = (v) => (!v ? null : v.kaynak === 'yahoo' ? 'yahoo:' + (v.kod || v.sembol) : v.kaynak === 'tefas' ? 'tefas:' + String(v.kod || v.sembol).toUpperCase()
    : v.kaynak === 'binance' ? 'kripto:' + String(v.kod || v.sembol).toUpperCase().replace(/USDT$/, '') : null);
  /**
   * 67.5 "Bu dağılımı geçmişte dene" (saf): planın hedef payları (sabit + oranını koru sonucu) → laboratuvar kalemleri.
   * Yeni (plana eklenen) hisse Yahoo kodundan; laboratuvar kimliği olmayan (elle / altın) varlık atlanır ve listelenir.
   * @returns {{ kalemler: [{ kimlik, agirlik, ad }], atlanan: [sembol] }}
   */
  function gecmisKalemleri(m, oz) {
    const vs = new Map(((oz && oz.varliklar) || []).map(v => [v.id, v]));
    const kalemler = [], atlanan = [];
    for (const r of (m && m.o && m.o.satirlar) || []) {
      if (!(r.hp > 1e-9)) continue;
      const kim = r.yeni ? (r.aday && r.aday.kod ? 'yahoo:' + r.aday.kod : null) : labKimligi(vs.get(r.varlik));
      if (!kim) { atlanan.push(r.s); continue; }
      const var_ = kalemler.find(k => k.kimlik === kim);
      if (var_) var_.agirlik += r.hp; else kalemler.push({ kimlik: kim, agirlik: r.hp, ad: r.ad || r.s });
    }
    return { kalemler, atlanan };
  }
  async function gecmisteDene(btn, m, oz) {
    const { kalemler, atlanan } = gecmisKalemleri(m, oz);
    const L = AG.pages && AG.pages.portfoy;
    if (!L || !L.gecmisteDene) { bildir('Portföy laboratuvarı yüklenmedi.', 'hata'); return; }
    if (!kalemler.length) { bildir('Denenecek dağılım yok — hedef payı olan, geçmiş verisi indirilebilen varlık yok.', 'uyari'); return; }
    if (atlanan.length) bildir(`Laboratuvarda karşılığı olmayan varlık atlandı: ${atlanan.join(', ')} (payı diğerlerine dağıtılır).`, 'uyari', { sure: 10000 });
    if (btn && AG.dom.mesgul) AG.dom.mesgul(btn, 'Hazırlanıyor…');
    try { await L.gecmisteDene(kalemler, `${m.hesap ? m.hesap.ad + ' ' : ''}planı`); } finally { if (btn && AG.dom.hazir) AG.dom.hazir(btn); }
  }

  /** Kopyalanan düz metin: satışta elde kalacak adet açıkça yazılır. */
  function listeMetni(m, st, ad, bugun) {
    const o = m.o, l = [`${ad} — para ekle planı (${m.hesap.ad}, ${AG.fmt ? AG.fmt.tarih(st.tarih || bugun) : st.tarih || bugun})`];
    if (m.yeniPara > 0.005) l.push(`Para yatır: ${para(m.yeniPara, m.B)}${cevrildi(m, st) ? ` (${para(m.ham, st.birim === 'TL' ? 'TRY' : 'USD', st.birim === 'TL' ? 0 : 2)}, kur ${tr(m.kur, 4)})` : ''}`);
    if (o.satislar.length) {
      l.push('ÖNCE SAT:');
      o.satislar.forEach((r, i) => l.push(`${i + 1}. ${r.s}: ${adetM(r.adet)} adet sat (≈ ${para(r.tutar, m.B)}) → satıştan sonra elinde ${adetM(r.sonrakiAdet)} adet KALMALI`));
    }
    if (o.alimlar.length) {
      l.push(o.satislar.length ? 'SONRA AL:' : 'AL:');
      o.alimlar.forEach((r, i) => l.push(`${i + 1}. ${r.s}: ${adetM(r.adet)} adet al (≈ ${para(r.tutar, m.B)}) → alımdan sonra elinde ${adetM(r.sonrakiAdet)} adet olacak`));
    }
    if (o.satislar.length) l.push('Not: satışta adet yanlış olursa hesap şaşar; farklı sattıysan panelde kaydetmeden önce gerçek adedi yaz.');
    return l.join('\n');
  }
  async function kopyala(m, st, ad) {
    const metin = listeMetni(m, st, ad, son && son.ctx.x.ozet.bugun);
    try {
      await global.navigator.clipboard.writeText(metin);
      bildir('Liste panoya kopyalandı.', 'ok');
    } catch (e) { bildir('Pano kullanılamadı — liste: ' + metin.split('\n').slice(1).join(' · '), 'uyari', { sure: 15000 }); }
  }

  /** Kaydetme gövdesi (DOM'suz; öz testte de kurulur). */
  function kayitGovdesi(m, st, bugun) {
    const o = m.o;
    const deger = (r) => { const d = duzeltme(st, r); return { adet: d.adet, fiyat: d.fiyat }; };
    return {
      hesap: m.hesap.id, tarih: st.tarih || bugun,
      yatirma: m.yeniPara > 0.005 ? { tutar: yatanDeger(m, st), para: m.B,
        not: cevrildi(m, st) ? `para ekle planı · ${tr(m.ham, 2)} ${st.birim}, kur ${tr(m.kur, 4)}` : 'para ekle planı' } : null,
      satislar: o.satislar.map(r => ({ varlik: r.varlik, sembol: r.s, ...deger(r) })),
      alislar: o.alimlar.map(r => ({ ...(r.yeni ? { aday: r.aday } : { varlik: r.varlik }), sembol: r.s, ...deger(r) }))
    };
  }
  async function kaydet(btn, m, st, ctx) {
    const ad = ctx.pAd(ctx.pid);
    const govde = kayitGovdesi(m, st, ctx.x.ozet.bugun);
    if (AG.dom.mesgul) AG.dom.mesgul(btn, 'Kaydediliyor…');
    try {
      let r = await api().planKaydet(govde);
      if (r && r.soru === 'nakit-eksi') {
        const evet = AG.onayla ? await AG.onayla({ baslik: 'Nakit eksiye düşüyor', metin: `${r.error} Yine de kaydedilsin mi?`, onay: 'Yine de kaydet' }) : false;
        if (!evet) return;
        r = await api().planKaydet({ ...govde, onay: true });
      }
      if (!r || r.success === false) throw new Error((r && r.error) || 'kaydedilemedi');
      const z = r.ozet || {};
      const parca = [z.yatirma ? '1 para yatırma' : null, z.satis ? `${z.satis} satış` : null, z.alis ? `${z.alis} alış` : null].filter(Boolean).join(' + ');
      bildir(`${ad} · ${m.hesap.ad}: ${parca || 'işlemler'} yazıldı.${r.fiyatHatasi ? ' Yeni hissenin fiyat geçmişi indirilemedi (Fiyatları yenile tekrar dener): ' + r.fiyatHatasi : ''}`, 'ok', { sure: 9000 });
      durumlar.delete(ctx.pid);
      if (ctx.yenile) ctx.yenile(); else yeniden();
    } catch (e) { bildir(e.message, 'hata', { sure: 12000 }); } finally { if (AG.dom.hazir) AG.dom.hazir(btn); }
  }

  /** "+ Plana ekle" / "Bul": Yahoo'dan sembol → hesabın para birimine uyan aday → Sabit %5 yeni satır. */
  async function ekle(sembol, btn, m) {
    if (!m || !m.hesap || !son) return;
    const st = durumAl(son.ctx.pid);
    const s = String(sembol || '').trim().toUpperCase();
    if (m.o.satirlar.some(r => r.s === s)) { bildir(`${s} zaten planda.`, 'bilgi'); return; }
    if (btn && AG.dom.mesgul) AG.dom.mesgul(btn, '…');
    try {
      const r = await api().sembolBul(sembol);
      if (!r || r.success === false) throw new Error((r && r.error) || 'sembol bulunamadı');
      const l = (r.adaylar || []).filter(a => !a.destek);
      const a = l.find(x => x.para === m.B);
      if (!a) throw new Error(l.length ? `${l[0].sembol} ${l[0].para} — plan ${m.hesap.ad} (${m.B}) hesabında; uygun hesabı seç` : `${sembol}: Yahoo'da bulunamadı`);
      if (m.o.satirlar.some(x => x.s === a.sembol)) { bildir(`${a.sembol} zaten planda.`, 'bilgi'); return; }
      st.ekler.push({ anahtar: 'yeni:' + a.kod, s: a.sembol, ad: a.ad, fiyat: a.fiyat, hedef: '5', aday: { kod: a.kod, sembol: a.sembol, ad: a.ad, para: a.para, sinif: a.sinif } });
      st.bulMetin = '';
      bildir(`${a.sembol} plana eklendi (Sabit %5 — payı değiştirebilir ya da × ile çıkarabilirsin).`, 'ok');
      yeniden();
    } catch (e) { bildir(e.message, 'hata'); } finally { if (btn && AG.dom.hazir) AG.dom.hazir(btn); }
  }

  // ═══ 4 · PORTFÖY BOTLARI NE TUTUYOR (en altta) ══════════════════════════════
  const MODELLER = [['m-qqq-m10', 'Nasdaq Momentum 10', 'USD'], ['m-bist-m10', 'BIST Momentum 10', 'TRY'], ['m-837', '%50 QQQ + %50 Hücum', 'USD']];
  const DURUM_AD = { kaliyor: ['Tutuyor', 'vurgu'], girecek: ['Girecek', 'pos'], cikacak: ['Çıkacak', 'warn'], yedek: ['Yedek', ''], bot: ['Bot', ''] };
  const KESINLIK = { kesin: 'kesin', 'kesine-yakin': 'tahmin: kesine yakın', tahmin: 'tahmin' };
  const bot = { model: 'm-qqq-m10', veri: null, zaman: 0, is: null, hata: null };
  const botKap = () => el('div', { id: 'peBotlar' }, [kart([kartBas('4 · Portföy botları ne tutuyor'), el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })])]);
  async function botVeri() {
    if (bot.veri && Date.now() - bot.zaman < 5 * 60e3) return bot.veri;
    const T = AG.api.tasarimci;
    if (!bot.is) {
      bot.is = Promise.all([T.adayHavuzu(), T.modeller(), T.emirler().catch(() => null)])
        .then(([h, mo, e]) => { bot.veri = { h: (h && h.modeller) || {}, mo: (mo && mo.modeller) || [], e: (e && e.modeller) || [] }; bot.zaman = Date.now(); bot.hata = null; })
        .catch((x) => { bot.hata = x.message; })
        .finally(() => { bot.is = null; });
    }
    await bot.is;
    return bot.veri;
  }
  async function botDoldur(m, ctx) {
    const v = await botVeri();
    const k = bul('peBotlar');
    if (!k) return;
    if (!v) { doldur(k, [kart([kartBas('4 · Portföy botları ne tutuyor'), bos('Botların listesi okunamadı' + (bot.hata ? `: ${bot.hata}` : '.'))])]); return; }
    doldur(k, [botKart(v, m, ctx)]);
  }
  /** Bot satırının durumu (DOM'suz; öz testte de sınanır): { bizde, engel }. */
  function botSatirDurumu(x, paraM, m, salt) {
    const p = m ? m.o.satirlar.find(r => r.s === x.s) : null;
    const uygunHesap = m ? m.hesaplar.find(h => h.para === paraM) : null;
    const paraAd = birimAd(paraM);
    const bizde = p && p.elde > 0 ? `var · ${adetM(p.elde)} adet` : p ? 'planda' : 'yok';
    let engel = '';
    if (x.durum === 'bot') engel = 'Binance botunda';
    else if (salt) engel = 'bir portföy seç';
    else if (!m || !m.hesap) engel = `${paraAd} hesap gerekir`;
    else if (m.B !== paraM) engel = uygunHesap ? `${paraAd} hesabı seçilince` : `${paraAd} hesap gerekir`;
    else if (p) engel = p.elde > 0 && x.durum === 'cikacak' ? 'botta çıkacak — Sabit %0 ile sat' : 'planda';
    return { bizde, engel, p };
  }
  function botKart(v, m, ctx) {
    const [id, adM, paraM] = MODELLER.find(x => x[0] === bot.model) || MODELLER[0];
    const h = v.h[id] || {}, mo = v.mo.find(x => x.id === id) || {};
    const fiyatlar = new Map(), adlar = new Map();
    for (const e of v.e) {
      for (const s of ((e.liste || {}).satirlar || [])) if (sayiMi(s.fiyat)) fiyatlar.set(s.sembol, { fiyat: s.fiyat, para: s.para });
      for (const s of ((e.hedef || {}).kalemler || [])) if (s.ad && s.ad !== s.sembol) adlar.set(s.sembol, s.ad);
    }
    const sk = mo.sonKarar || h.sonKarar || {};
    const sonraki = id === 'm-837' ? 'Bant kuralı: QQQ payı %40–60 dışına çıkınca dengeler'
      : h.sonrakiKarar ? `Sıradaki karar ${gunKisa(h.sonrakiKarar.karar)} · uygulama ${gunKisa(h.sonrakiKarar.uygulama)} · ${KESINLIK[h.kesinlik] || 'tahmin'} (veri ${gunKisa(h.veriGunu)})` : '';
    const met = mo.metrik && sayiMi(mo.metrik.toplam) ? mo.metrik.toplam : null;
    const kq = mo.kiyas && mo.kiyas['k-qqq'];
    const q = sayiMi(kq) ? kq : kq && sayiMi(kq.toplam) ? kq.toplam : null;
    const basari = met == null ? '' : `Başladığından beri${mo.baslangic ? ` (${gunKisa(mo.baslangic)})` : ''} ${AG.fmt.oranYuzde(met, 1, { isaretli: true })}${q != null ? ` · aynı dönemde QQQ ${AG.fmt.oranYuzde(q, 1, { isaretli: true })}` : ''}`;
    const satirlar = id === 'm-837'
      ? [{ sira: 1, s: 'QQQ', durum: 'kaliyor', ad: 'Invesco QQQ Trust · çekirdek %50' }, { sira: null, s: 'Hücum', durum: 'bot', ad: 'Binance botu · uydu %50' }]
      : (h.satirlar || []).map(x => ({ ...x, ad: adlar.get(x.s) || '' }));
    const paraAd = birimAd(paraM);
    const uygunHesap = m ? m.hesaplar.find(x => x.para === paraM) : null;
    let not = id === 'm-837' ? 'Hücum yarısı Binance\'teki botun işidir; bu plana eklenmez.' : '';
    if (!ctx.salt && m && m.hesap && m.B !== paraM) not = uygunHesap ? `Bu hisseler ${paraAd}; plan şu an ${m.hesap.ad} (${m.B}) hesabında — eklemek için 1. bölümden ${uygunHesap.ad} hesabını seç.` : `${ctx.pAd(ctx.pid)} portföyünde ${paraAd} hesap yok. Bu hisseleri eklemek için önce Portföy › Hesaplar'da ${paraAd} bir hesap aç.`;
    const satir = (x) => {
      const d = DURUM_AD[x.durum] || [x.durum, ''];
      const fz = fiyatlar.get(x.s);
      const z = botSatirDurumu(x, paraM, m, ctx.salt);
      return el('tr', null, [
        el('td', { class: 'p-sayi pn-soluk', text: x.sira == null ? '—' : String(x.sira) }),
        el('td', null, [el('strong', { text: x.s }), el('span', { class: 'pn-soluk pn-alt-satir', text: x.ad || '' })]),
        el('td', null, [rozet(d[0], d[1])]),
        el('td', { class: 'p-sag p-sayi', text: fz ? para(fz.fiyat, fz.para) : '—' }),
        el('td', { class: z.p ? (z.p.elde > 0 ? null : 'p-pos') : 'pn-soluk', text: z.bizde }),
        el('td', { class: 'p-sag' }, [z.engel ? el('span', { class: 'pn-soluk', text: z.engel })
          : dugme('+ Plana ekle', (e) => ekle(x.s, e.currentTarget, m), null, { 'data-kilit': 'telefon', ekSinif: 'p-dugme-kucuk' })])
      ]);
    };
    return kart([
      kartBas('4 · Portföy botları ne tutuyor', secici('Portföy botu', MODELLER.map(([k, a]) => [k, a]), id, (k) => { bot.model = k; botDoldur(m, ctx); })),
      el('div', { class: 'pe-bot-bilgi' }, [
        sk.kararGunu ? el('span', { text: `Son karar ${gunKisa(sk.kararGunu)} · uygulandı ${gunKisa(sk.uygulamaGunu)}` }) : null,
        sonraki ? el('span', { text: sonraki }) : null,
        basari ? el('span', { text: basari }) : null
      ]),
      not ? bant(not, 'uyari') : null,
      satirlar.length ? tablo(['Sıra', 'Hisse', 'Botta', 'Fiyat', ctx.salt ? 'Portföyde' : `${ctx.pAd(ctx.pid)} portföyünde`, ''].map((t, i) => th(t, i === 3 || i === 5)), satirlar.map(satir)) : bos(`${adM}: liste henüz yok.`),
      el('p', { class: 'p-kart-alt', text: 'Tutuyor: botun şu anki listesinde. Girecek / çıkacak: bugünkü veriyle sıradaki kararın tahmini, karar günü kesinleşir. Yedek: listenin hemen altındakiler. Fiyat yalnız bu ayın emir listesindekiler için; plana eklerken güncel fiyat Yahoo\'dan alınır. Bu liste öneri değil; botun kuralının bugünkü sonucudur.' })
    ], null, 'peBotKart');
  }

  AG.pages = AG.pages || {};
  AG.pages.paraEkle = { ciz, modelKur, gecmisKalemleri, listeMetni, durumMetni, kayitGovdesi, botSatirDurumu, _durumlar: durumlar };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.paraEkle;
})(typeof window !== 'undefined' ? window : globalThis);
