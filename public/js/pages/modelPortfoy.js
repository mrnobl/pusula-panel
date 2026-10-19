/**
 * MODEL İZLEME — Portföy › Model izleme (F3'te öne çekilen C6 temel hâli, PLAN-PORTFOY-TASARIMCI.md (c) C6).
 * ═══════════════════════════════════════════════════════════════════════════
 * "Bugünden takip edilen" üç model portföy (t1-s1.json: 837, Nasdaq M10, BIST M10) ve kıyasları (QQQ, BTC, XU030,
 * EW-BIST30): 100 tabanlı endeks çizgileri (AG.grafik; kıyaslar modelin gün dizisine TARİHE GÖRE ileri doldurulur — BIST,
 * NYSE ve takvim günü takvimleri farklı), başlangıçtan bu yana getiri, en büyük düşüş, dondurulmuş karar günlüğü
 * (liste, eksik veri, doğrulama), sabit uyarı bandı (GET /api/tasarimci/durum → uyari) ve veri notları.
 * Tutar YALNIZ yanıtta `tutar` varsa (data/tasarimci/sermaye.json, yalnız sunucu) gösterilir; yoksa yalnız endeks.
 * Günlük henüz boşsa (2026-10-12 öncesi ya da geliştirme makinesi) tasarlanmış boş durum.
 *
 * Uçlar (yalnız GET, telefonda da açık): AG.api.tasarimci.{durum, modeller, model(id), kararlar(id)}.
 * Kurallar: DOM `AG.dom`, tablo `AG.tablo`, grafik `AG.grafik`, inline stil yok (scripts/panel-tasarimci-testi.js).
 * F5 (61.1): gerçek (Portföyüm, TWR) çizgisi, "Uygulama farkı" kutusu + katlı "Fark neden oldu" tablosu, kol katkısı (Carino),
 * aylık tablo (yıl toplamıyla), aylık dışa aktarım listesi (SHA-256 zinciri, JSON/CSV indir) — AG.api.tasarimci.{fark, aylik, disari,
 * disariUrl}. Kendi tasarımlarınız: #mpKendi kabı, AG.tasarimciKendi.modelIzlemeCiz(kap) (tasarimci.js).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const { el, doldur, bul } = AG.dom;
  const T = () => AG.api.tasarimci;

  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const virgul = (s) => String(s).replace('.', ',');
  const yz = (x, b = 1) => (sayiMi(x) ? `${x < 0 ? '−' : ''}%${virgul(Math.abs(x * 100).toFixed(b))}` : '—');
  const isaretli = (x, b = 1) => (sayiMi(x) ? `${x > 0 ? '+' : ''}${yz(x, b)}` : '—');
  const sy = (x, b = 2) => (sayiMi(x) ? virgul(x.toFixed(b)) : '—');
  const ton = (x) => (!sayiMi(x) ? 'tone-muted' : x > 0 ? 'tone-success' : x < 0 ? 'tone-danger' : 'tone-muted');
  const yardim = (k) => (AG.sozluk ? AG.sozluk.yardim(k) : null);
  const puan = (x, b = 2) => (sayiMi(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${virgul(Math.abs(x * 100).toFixed(b))} puan` : '—');
  const tutarMetni = (t) => (t ? `${Math.round(t.guncel).toLocaleString('tr-TR')} ${t.para} (başlangıç ${Math.round(t.baslangic).toLocaleString('tr-TR')}, K/Z ${Math.round(t.kar).toLocaleString('tr-TR')})` : null);
  const MODEL_SIRA = ['m-837', 'm-qqq-m10', 'm-bist-m10'];
  const KOL_AD = { cekirdek: 'QQQ', uydu: 'Hücum' };
  const MAKINE_AD = { ev: 'sunucu', gelistirme: 'geliştirme' };
  const BOS_METIN = 'Model 2026-10-12 açılışında başlıyor; ilk değer o gün kapanıştan sonra.';

  let DU = null, MD = null, AYLIK = null, DISARI = null;
  const farklar = new Map();   // id → /fark yanıtı
  const ayrinti = new Map();   // id → { model, kararlar }
  let yukleniyor = false;

  // ═══ SAF ════════════════════════════════════════════════════════════════
  /**
   * İleri doldurma: kıyas satırlarını (gün, endeks) hedef gün dizisine TARİHE GÖRE taşır — her hedef gün için o günden
   * önceki (dahil) son kıyas değeri. Hedef günden önce hiç değer yoksa nokta atlanır (uydurulmaz).
   */
  function ileriDoldur(gunler, satirlar, alan = 'endeks') {
    const s = (satirlar || []).filter(x => x && sayiMi(x[alan])).slice().sort((a, b) => (a.gun < b.gun ? -1 : 1));
    const out = [];
    let j = -1;
    for (const g of gunler) {
      while (j + 1 < s.length && s[j + 1].gun <= g) j++;
      if (j >= 0) out.push({ gun: g, v: s[j][alan] });
    }
    return out;
  }
  /** Modelin satırlarından grafik verisi: ana seri + ileri doldurulmuş kıyaslar (100 taban). */
  function grafikVerisi(m) {
    const st = (m && m.satirlar) || [];
    const gunler = st.map(x => x.gun);
    const t = (g) => Date.parse(`${g}T00:00:00Z`);
    const seri = st.filter(x => sayiMi(x.endeks)).map(x => ({ t: t(x.gun), v: x.endeks }));
    const kiyas = Object.entries((m && m.kiyaslar) || {}).map(([id, k]) => ({ id, ad: k.ad || id, seri: ileriDoldur(gunler, k.satirlar).map(p => ({ t: t(p.gun), v: p.v })) })).filter(k => k.seri.length > 1);
    return { seri, kiyas };
  }
  /** Üç modelin hepsi boş mu (gün satırı yok)? */
  const hepsiBos = (modeller) => !(modeller || []).some(m => m && m.metrik && m.metrik.gun > 0);

  // ═══ ÇİZİM ══════════════════════════════════════════════════════════════
  const baslik = (metin, ek) => el('h3', { class: 'pf-bolum-baslik' }, [el('span', { text: metin }), ek || null]);
  const hucre = (metin, sinif, title) => el('td', { class: sinif || null, text: metin, title: title || null });
  const tablo = (basliklar, satirlar, id, kapSinif) => AG.tablo.kutulu({ id: id || null, basliklar, satirlar, sinif: 'table-dense pf-tablo' }, kapSinif);
  function uyariBandi(metin) {
    return el('div', { class: 'ts-uyari-bandi', role: 'note' }, [el('i', { 'data-lucide': 'alert-triangle', class: 'icon-16' }),
      el('span', { text: metin || 'İleri dönem kısa; kabuller sonradan konmuş ölçütle (H1) verildi; en az 12–24 ay görmeden yorum yok.' })]);
  }

  /** B-14: kıyaslar ayrı sütunlarda (aynı dönem getirisi); model başlamadıysa tek "başlamadı"; başlıklarda sözlük "?". */
  const KIYAS_SUTUN = [['k-qqq', 'QQQ', 'qqq'], ['k-btc', 'BTC', null], ['k-xu030', 'XU030', 'xu030'], ['k-ew-bist30', 'EW-BIST30', 'ewBist30']];
  function ozetTablosu(modeller) {
    const tutarVar = modeller.some(m => m.tutar);
    const sutun = KIYAS_SUTUN.filter(([id]) => modeller.some(m => m.kiyas && id in m.kiyas));
    const satirlar = modeller.map(m => {
      const me = m.metrik || {}, basladi = me.gun > 0;
      return el('tr', null, [hucre(m.ad), hucre(m.baslangic || '—', 'sayi'), hucre(basladi ? me.bit : 'başlamadı', 'sayi'), hucre(basladi ? sy(me.son, 2) : '100', 'sayi'),
        hucre(basladi ? isaretli(me.toplam) : '—', `sayi ${ton(me.toplam)}`), hucre(basladi ? yz(me.maxDD) : '—', 'sayi'),
        hucre(m.metrikTl && m.metrikTl.gun > 0 ? isaretli(m.metrikTl.toplam) : '—', 'sayi', m.id === 'm-bist-m10' ? null : 'yalnız BIST M10 için (TL)'),
        ...sutun.map(([id]) => { const k = m.kiyas && m.kiyas[id]; return !k ? hucre('—', 'sayi tone-muted', 'bu modelin kıyası değil') : hucre(basladi && k.gun > 0 ? isaretli(k.toplam) : 'başlamadı', `sayi ${basladi && k.gun > 0 ? ton(k.toplam) : 'tone-muted'}`); }),
        ...(tutarVar ? [hucre(tutarMetni(m.tutar) || '—', 'sayi pm-tutar')] : [])]);
    });
    return tablo(['Model', 'Başlangıç', 'Son gün', { metin: 'Endeks', yardim: 'endeksNav' }, 'Başlangıçtan', { metin: 'En büyük düşüş', yardim: 'maxdd' }, { metin: 'TL getirisi', yardim: 'tlGetirisi' },
      ...sutun.map(([, ad, y]) => (y ? { metin: ad, yardim: y } : ad)), ...(tutarVar ? ['Tutar'] : [])], satirlar, 'tblMpOzet');
  }

  function kararTablosu(kararlar) {
    if (!kararlar || !kararlar.length) return el('p', { class: 'hint mb-0', text: 'Henüz karar yok.' });
    return tablo(['Karar günü', 'Uygulama', 'Tür', 'Liste / ağırlık', 'Eksik veri', 'Doğrulama', 'Kayıt'], kararlar.slice().reverse().map(k => el('tr', null, [
      hucre(k.kararGunu, 'sayi'), hucre(k.uygulamaGunu || '—', 'sayi'), hucre(k.tur2 === 'dengeleme' ? 'dengeleme' : k.ilk ? 'ilk yerleşim' : 'ay sonu kararı'),
      hucre(k.liste ? k.liste.map(x => x.s).join(', ') : Object.entries(k.agirlik || {}).map(([a, w]) => `${KOL_AD[a] || a} ${yz(w, 0)}`).join(', '), 'pf-kucuk pf-sola mp-liste'),
      hucre(k.eksikVeri && k.eksikVeri.length ? k.eksikVeri.map(x => (typeof x === 'string' ? x : x.s || x.sembol || '?')).join(', ') : 'yok', k.eksikVeri && k.eksikVeri.length ? 'tone-warning' : 'tone-muted'),
      hucre(k.dogrulama || '—', 'pf-sola'), hucre(k.makine === 'ev' ? 'resmî (sunucu)' : `deneme (${MAKINE_AD[k.makine] || k.makine || '?'})`, k.makine === 'ev' ? '' : 'tone-muted', k.girdiImza ? `girdi imzası ${String(k.girdiImza).slice(0, 12)}…` : null)
    ])), null, 'mp-kaydir');
  }

  function veriNotlari(id) {
    const s = DU && DU.durum && DU.durum.seriler ? DU.durum.seriler[id] : null;
    const l = [];
    if (s && s.veriNotu) l.push(s.veriNotu);
    for (const n of (s && s.notlar) || []) l.push(typeof n === 'string' ? n : n.metin || JSON.stringify(n));
    return l;
  }

  function modelBolumu(mm) {
    const a = ayrinti.get(mm.id) || {};
    const m = a.model;
    const me = mm.metrik || {};
    const notlar = veriNotlari(mm.id);
    const kap = el('div', { id: `mpGrafik-${mm.id}`, class: 'grf-kap', role: 'img', 'aria-label': `${mm.ad}: 100 tabanlı endeks ve kıyaslar` });
    const bolum = el('section', { class: 'glass-panel panel-pad mb-3', 'data-model': mm.id }, [
      baslik(mm.ad),
      el('div', { class: 'ts-sayilar mb-3' }, [
        kutu('Endeks', me.gun > 0 ? sy(me.son, 2) : '100', me.gun > 0 ? `son gün ${me.bit}` : 'taban'),
        kutu('Başlangıçtan', me.gun > 0 ? isaretli(me.toplam) : '—', `başlangıç ${mm.baslangic || '—'}`, ton(me.toplam)),
        kutu('En büyük düşüş', me.gun > 0 ? yz(me.maxDD) : '—', null, me.maxDD > 0 ? 'tone-danger' : ''),
        ...Object.entries(mm.kiyas || {}).map(([id, k]) => kutu(id.replace(/^k-/, '').toUpperCase(), k.gun > 0 ? isaretli(k.toplam) : '—', k.gun > 0 ? `DD ${yz(k.maxDD)}` : 'başlamadı', ton(k.toplam))),
        mm.tutar ? kutu('Tutar', tutarMetni(mm.tutar), 'yalnız bu bilgisayarda', 'pm-tutar') : null
      ]),
      kap,
      gercekBolumu(mm.id, farklar.get(mm.id)),
      aylikBolumu(mm.id),
      el('h4', { class: 'title-sm mt-3', text: 'Karar günlüğü (dondurulmuş)' }),
      kararTablosu(a.kararlar),
      notlar.length ? el('ul', { class: 'pf-uyari-liste mt-2' }, notlar.map(n => el('li', { class: 'pf-uyari pf-uyari-bilgi', text: n }))) : null
    ]);
    return { bolum, kap, m, fark: farklar.get(mm.id) || null };
  }

  // ═══ F5: MODEL ↔ GERÇEK ═════════════════════════════════════════════════
  const BILESEN = [['dolum', 'Dolum fiyatı (modelin açılış fiyatına göre)'], ['nakit', 'Nakitte kalan pay (tam adet yuvarlaması)'],
    ['ucret', 'Ücret (modelin maliyeti düşülmüş)'], ['uygulanmayan', 'Uygulanmayan / atlanan'], ['kalan', 'Kalan (zamanlama, kur, kısmi uygulama)']];
  const GERCEK_YOK = 'Gerçek karşılaştırma ilk Uyguladım kaydından sonra başlar (Portföy › Bu ay › Uyguladım).';
  const aralikMetni = (f) => (f && f.bas ? `${f.bas} → ${f.bit}` : '—');
  /** Gerçek (Portföyüm) seri: ilk Uyguladım gününden 100 tabanlı TWR — grafikte vurgulu kıyas çizgisi. */
  function gercekCizgi(fk) {
    if (!fk || !fk.gercekVar || !Array.isArray(fk.seri)) return null;
    const t = (g) => Date.parse(`${g}T00:00:00Z`);
    return { ad: 'Gerçek (Portföyüm)', vurgu: true, seri: fk.seri.filter(x => sayiMi(x.endeks)).map(x => ({ t: t(x.gun), v: x.endeks })) };
  }
  function katkiTablosu(k, id) {
    if (!k || !k.model) return null;
    const satirlar = new Map();
    for (const x of k.model.liste || []) satirlar.set(x.anahtar, { ad: x.ad, model: x.katki, gercek: null });
    for (const x of (k.gercek && k.gercek.liste) || []) {
      const a = x.anahtar.startsWith('h:') ? (x.ad || x.anahtar.slice(2)).replace(/\.IS$/i, '') : x.anahtar;
      const hedef = id === 'm-837' && a.startsWith('hesap:') ? 'uydu' : id === 'm-837' && /^QQQ$/i.test(a) ? 'cekirdek' : a;
      const o = satirlar.get(hedef) || { ad: x.ad, model: null, gercek: 0 };
      o.gercek = (o.gercek || 0) + x.katki; satirlar.set(hedef, o);
    }
    const l = [...satirlar.values()].sort((a, b) => (b.model || 0) - (a.model || 0));
    return tablo(['Kalem', { metin: 'Model katkısı', yardim: 'kolKatkisi' }, 'Gerçek katkısı'], l.map(x => el('tr', null, [
      hucre(x.ad, 'pf-sola'), hucre(puan(x.model), `sayi ${ton(x.model)}`), hucre(k.gercek ? puan(x.gercek) : '—', `sayi ${ton(x.gercek)}`)])), null);
  }
  function enCokMetni(k) {
    if (!k || !k.model) return null;
    const l = (x) => x.map(y => `${y.ad} ${puan(y.katki)}`).join(', ');
    const p = [];
    if ((k.model.enIyi || []).length) p.push(`En çok katkı veren: ${l(k.model.enIyi)}`);
    if ((k.model.enKotu || []).length) p.push(`en çok götüren: ${l(k.model.enKotu)}`);
    return p.length ? el('p', { class: 'hint hint-sm mt-1 mb-0', text: `${p.join(' · ')} (model, ${aralikMetni(k)}).` }) : null;
  }
  function gercekBolumu(id, fk) {
    const parca = [el('h4', { class: 'title-sm mt-3' }, [el('span', { text: 'Model ↔ gerçek (Portföyüm)' }), yardim('uygulamaFarki')])];
    if (!fk) { parca.push(el('p', { class: 'hint mb-0', text: 'Karşılaştırma verisi yüklenemedi.' })); return el('div', { class: 'mp-gercek', 'data-model-fark': id }, parca); }
    if (!fk.gercekVar) {
      parca.push(el('p', { class: 'hint mb-0 mp-gercek-yok', text: GERCEK_YOK }));
      return el('div', { class: 'mp-gercek', 'data-model-fark': id }, parca);
    }
    const f = fk.fark || {}, b = fk.baslangictan || {};
    parca.push(el('div', { class: 'ts-sayilar mb-2' }, [
      kutu('Uygulama farkı', `${puan(f.fark, 1)} (bu ay)`, `${puan(b.fark, 1)} başlangıçtan`, ton(f.fark)),
      kutu('Gerçek getiri', isaretli(f.gercekGetiri), `bu ay, ${aralikMetni(f)}`, ton(f.gercekGetiri)),
      kutu('Model getirisi', isaretli(f.modelGetiri), 'aynı aralık', ton(f.modelGetiri)),
      kutu('İlk Uyguladım', fk.ilkGun || '—', `${fk.kayitSayisi || 0} kayıt`),
      fk.deger ? kutu('Gerçek değer', `${Math.round(fk.deger.usd).toLocaleString('tr-TR')} $`, `${fk.deger.gun} · yalnız bu bilgisayarda`, 'pm-tutar') : null
    ]));
    parca.push(el('details', { class: 'mp-kat' }, [el('summary', { text: 'Fark neden oldu' }),
      tablo(['Bileşen', `Bu ay (${aralikMetni(f)})`, 'Başlangıçtan'], [
        ...BILESEN.map(([k, ad]) => el('tr', null, [hucre(ad, 'pf-sola'), hucre(puan((f.bilesenler || {})[k]), `sayi ${ton((f.bilesenler || {})[k])}`), hucre(puan((b.bilesenler || {})[k]), `sayi ${ton((b.bilesenler || {})[k])}`)])),
        el('tr', { class: 'mp-toplam' }, [hucre('Toplam = uygulama farkı', 'pf-sola'), hucre(puan(f.fark), `sayi ${ton(f.fark)}`), hucre(puan(b.fark), `sayi ${ton(b.fark)}`)])
      ], `tblMpFark-${id}`),
      el('p', { class: 'hint hint-sm mt-1 mb-0', text: 'Fark = gerçek getiri − model getirisi (aynı günler, para giriş-çıkışından arındırılmış). Eksi: gerçek portföy modelin gerisinde. Bileşenlerin toplamı farka eşittir; "kalan" ölçülemeyen kısımdır.' }),
      ...((f.notlar || []).length ? [el('p', { class: 'hint hint-sm mt-1 mb-0', text: f.notlar.join(' · ') })] : [])]));
    const kb = fk.katki && fk.katki.baslangictan;
    if (kb && kb.model) parca.push(el('details', { class: 'mp-kat' }, [el('summary', { text: `Kol katkısı (başlangıçtan, ${aralikMetni(kb)})` }),
      katkiTablosu(kb, id), enCokMetni(kb),
      el('p', { class: 'hint hint-sm mt-1 mb-0' }, [el('span', { text: 'Günlük katkılar Carino yöntemiyle bağlanır: kalemlerin toplamı dönemin toplam getirisine eşittir. ' }), yardim('carino'),
        el('span', { text: id === 'm-bist-m10' ? ' BIST M10 model katkıları TL üzerinden.' : '' })])]));
    if ((fk.uyarilar || []).length) parca.push(el('ul', { class: 'pf-uyari-liste mt-2' }, fk.uyarilar.map(u => el('li', { class: 'pf-uyari pf-uyari-bilgi', text: u }))));
    return el('div', { class: 'mp-gercek', 'data-model-fark': id }, parca);
  }
  /** Aylık tablo: satır = ay; model, gerçek, fark, kıyaslar; yıl toplamı satırı (bileşik). */
  function aylikBolumu(id) {
    const m = AYLIK && (AYLIK.modeller || []).find(x => x.id === id);
    if (!m || !(m.satirlar || []).length) return null;
    const kiy = m.kiyaslar || [];
    const satir = (bas, x, sinif) => el('tr', sinif ? { class: sinif } : null, [hucre(bas, 'sayi'), hucre(isaretli(x.model), `sayi ${ton(x.model)}`),
      hucre(x.gercek == null ? '—' : isaretli(x.gercek), `sayi ${ton(x.gercek)}`), hucre(x.fark == null ? '—' : puan(x.fark, 1), `sayi ${ton(x.fark)}`),
      ...kiy.map(k => hucre(x.kiyas && x.kiyas[k.id] != null ? isaretli(x.kiyas[k.id]) : '—', 'sayi'))]);
    return el('details', { class: 'mp-kat', open: true }, [el('summary', { text: 'Aylık tablo' }),
      tablo(['Ay', 'Model', 'Gerçek', { metin: 'Fark', yardim: 'uygulamaFarki' }, ...kiy.map(k => k.ad)],
        [...m.satirlar.slice().reverse().map(x => satir(x.ay, x)), ...(m.yillar || []).map(y => satir(`${y.yil} toplam`, y, 'mp-yil'))], `tblMpAylik-${id}`, 'mp-kaydir'),
      el('p', { class: 'hint hint-sm mt-1 mb-0', text: 'Aylık getiri USD. Gerçek ve fark ilk Uyguladım kaydından sonra dolar (ilk ayda o günden).' })]);
  }
  /** Aylık dışa aktarım: ay · SHA-256 · zincir · indir. Dosyada yalnız endeks (tutar yok). */
  function disariBolumu() {
    const d = DISARI;
    const parca = [baslik('Aylık dışa aktarım', yardim('sha256'))];
    if (!d) { parca.push(el('p', { class: 'hint mb-0', text: 'Dışa aktarım listesi yüklenemedi.' })); return el('div', { id: 'mpDisari', class: 'glass-panel panel-pad mb-3' }, parca); }
    const l = d.dosyalar || [];
    parca.push(el('p', { class: 'hint hint-sm mb-2', text: `Her tamamlanan ay için 100 tabanlı endeks, kol getirileri ve dondurulmuş listeler bir dosyaya yazılır; her dosya bir öncekinin SHA-256 özetini taşır (zincir). ${d.resmi ? 'Bu bilgisayar resmî kaydı tutuyor.' : 'Bu bilgisayardaki dosyalar "deneme"dir; resmî kayıt sunucuda.'}` }));
    if (!l.length) { parca.push(el('p', { class: 'hint mb-0 mp-disari-bos', text: 'Henüz tamamlanan ay yok — ilk dosya ilk ay kapandıktan sonra yazılır.' })); return el('div', { id: 'mpDisari', class: 'glass-panel panel-pad mb-3' }, parca); }
    parca.push(el('p', { class: `mb-2 ${d.zincirTamam ? 'tone-success' : 'tone-danger'}`, text: d.zincirTamam ? `Zincir sağlam: ${l.length} dosya.` : 'Zincir BOZUK: aşağıdaki işaretli dosya sonradan değiştirilmiş ya da araya dosya girmiş.' }));
    const indir = (ay, tur, metin, tutarli, sinif) => el('a', { class: `btn btn-ghost btn-sm${sinif ? ' ' + sinif : ''}`, href: T().disariUrl(ay, tur, tutarli), download: '', text: metin });
    parca.push(tablo(['Ay', { metin: 'SHA-256', yardim: 'sha256' }, 'Zincir', 'İndir'], l.map(x => el('tr', null, [
      hucre(x.ay, 'sayi'), hucre(x.sha ? `${String(x.sha).slice(0, 12)}…` : '—', 'sayi mp-sha', x.sha || null),
      hucre(x.tamam ? 'sağlam' : `BOZUK: ${(x.hatalar || []).join('; ')}`, x.tamam ? 'tone-success pf-sola' : 'tone-danger pf-sola'),
      el('td', { class: 'mp-indir' }, [indir(x.ay, 'json', 'JSON'), indir(x.ay, 'csv', 'CSV'), indir(x.ay, 'csv', 'CSV + gerçek', true, 'ts-yazma')])
    ])), 'tblMpDisari', 'mp-kaydir'));
    parca.push(el('p', { class: 'hint hint-sm mt-1 mb-0', text: '"CSV + gerçek" gerçek portföy endeksini ve değerini de ekler; yalnız bu bilgisayarda indirilir, git\'e gitmez.' }));
    return el('div', { id: 'mpDisari', class: 'glass-panel panel-pad mb-3' }, parca);
  }
  const kutu = (etiket, deger, alt, sinif) => el('div', { class: 'sunken' }, [
    el('div', { class: 'metric-label', text: etiket }), el('div', { class: `metric-value sayi${sinif ? ' ' + sinif : ''}`, text: deger }), alt ? el('div', { class: 'hint hint-sm mb-0', text: alt }) : null]);

  function ciz() {
    const k = bul('pfModelKok');
    if (!k) return;
    const modeller = MODEL_SIRA.map(id => ((MD && MD.modeller) || []).find(m => m.id === id)).filter(Boolean);
    const tz = DU && DU.tazelik;
    const parcalar = [uyariBandi(DU && DU.uyari)];
    if (!MD) {
      parcalar.push(el('div', { class: 'glass-panel panel-pad' }, [baslik('Model izleme'), el('p', { class: 'hint mb-0', text: 'Model portföy verisi yüklenemedi.' })]));
      doldur(k, parcalar); return;
    }
    parcalar.push(el('div', { class: 'glass-panel panel-pad mb-3' }, [
      baslik('Model portföyler — başlangıçtan bu yana', yardim('endeksNav')),
      hepsiBos(modeller) ? el('div', { id: 'mpBos', class: 'bos-durum mb-3' }, [
        el('p', { class: 'mb-2', text: BOS_METIN }),
        el('p', { class: 'hint hint-sm mb-0', text: 'Kararlar dondurulduktan sonra model her işlem günü kapanıştan sonra 100 tabanlı endeksle yazılır (eksik veride o gün yazılmaz). Resmî kayıt sunucuda tutulur; bu makinedeki koşular "deneme" etiketlidir.' })
      ]) : null,
      ozetTablosu(modeller),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: `Endeks 100 tabanlı (USD; BIST M10 ayrıca TL). Kıyas çizgileri modelin işlem günlerine tarihe göre ileri doldurulur.${MD.tutarGizli ? ' Tutarlar bu kademede gizli.' : ''}${MD.bozuk && MD.bozuk.length ? ` ⚠ ${MD.bozuk.length} bozuk defter satırı atlandı.` : ''}` }),
      tz ? el('p', { class: `hint hint-sm mt-1 mb-0 ${tz.bayat ? 'tone-warning' : ''}`.trim(), text: tz.bayat ? `Veri bayat: ${(tz.satirlar || []).filter(x => x.bayat).map(x => `${x.sembol} (son ${x.sonGun || 'yok'}, beklenen ${x.beklenen})`).join(', ')}` : `Veri güncel: son işlem günleri ${[...new Set((tz.satirlar || []).map(x => x.sonGun))].join(', ')}.` }) : null
    ]));
    const grafikler = [];
    for (const mm of modeller) { const r = modelBolumu(mm); parcalar.push(r.bolum); grafikler.push(r); }
    const kendi = el('div', { id: 'mpKendi' });
    parcalar.push(kendi, disariBolumu());
    doldur(k, parcalar);
    if (AG.tasarimciKendi && typeof AG.tasarimciKendi.modelIzlemeCiz === 'function') { try { AG.tasarimciKendi.modelIzlemeCiz(kendi); } catch (e) { /* kendi tasarım bölümü çizilemedi — model izleme yine açılır */ } }
    for (const r of grafikler) {
      if (!AG.grafik) continue;
      const g = grafikVerisi(r.m);
      const gc = gercekCizgi(r.fark);
      AG.grafik.ana(r.kap, { seri: g.seri, kiyas: gc ? [gc, ...g.kiyas] : g.kiyas, dusus: true, ad: 'Model', etiket: 'Model (100 taban)', birim: '', bosMetin: BOS_METIN });
    }
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  const guvenli = (p) => p.then(r => (r && r.success !== false ? r : null)).catch(() => null);
  async function yukle() {
    if (!bul('pfModelKok') || yukleniyor) return;
    yukleniyor = true;
    try {
      const [du, md] = await Promise.all([guvenli(T().durum()), guvenli(T().modeller())]);
      DU = du; MD = md;
      const ids = ((md && md.modeller) || []).map(m => m.id);
      const ay = await Promise.all(ids.map(id => Promise.all([guvenli(T().model(id)), guvenli(T().kararlar(id)), T().fark ? guvenli(T().fark(id)) : null])));
      ids.forEach((id, i) => { ayrinti.set(id, { model: ay[i][0], kararlar: ay[i][1] ? ay[i][1].kararlar : null }); farklar.set(id, ay[i][2] && 'gercekVar' in ay[i][2] ? ay[i][2] : null); });
      const [ayl, dis] = await Promise.all([T().aylik ? guvenli(T().aylik()) : null, T().disari ? guvenli(T().disari()) : null]);
      AYLIK = ayl && Array.isArray(ayl.modeller) ? ayl : null; DISARI = dis && Array.isArray(dis.dosyalar) ? dis : null;
      ciz();
    } finally { yukleniyor = false; }
  }

  const sayfa = { yukle, ciz, ileriDoldur, grafikVerisi, hepsiBos, gercekCizgi, BOS_METIN, GERCEK_YOK,
    durumYaz: (x) => { if ('DU' in x) DU = x.DU; if ('MD' in x) MD = x.MD; if ('AYLIK' in x) AYLIK = x.AYLIK; if ('DISARI' in x) DISARI = x.DISARI; if (x.ayrinti) for (const [k, v] of Object.entries(x.ayrinti)) ayrinti.set(k, v); if (x.farklar) for (const [k, v] of Object.entries(x.farklar)) farklar.set(k, v); } };
  AG.pages = AG.pages || {};
  AG.pages.modelPortfoy = sayfa;
  if (typeof module !== 'undefined' && module.exports) module.exports = sayfa;
})(typeof window !== 'undefined' ? window : globalThis);
