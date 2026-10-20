/**
 * PORTFÖYÜM — Portföy › "Portföyüm" ve "Kayıt" alt sekmeleri (sürüm 60.8, PLAN-PORTFOYUM; 62.3 ikiye ayrıldı) `AG.pages.portfoyum`
 * 62.4: PORTFÖYÜM (#pfPortfoyumKok) şahsi portföy sayfası (model sayfasıyla aynı yapı): başlık · sayılar (seçili USD/TL) · grafik
 * (hesap seçici, getiri/değer, 6 kıyas — GET /gecmis?hesap, /kiyas) · varlık K/Z çubukları · bütün varlıklar (model etiketi) ·
 * dağılım (sınıf + hesap; "hedef nedir") · aylık getiri · son işlemler. Özet şeridi (#pfOzetSerit) her Portföy sekmesinin üstünde.
 * HESAPLARIM (#pfKayitKok): üst düğmeler · 67.4 "Yeni hesap" (katlı; kurum adıyla, isteğe bağlı vadeli mevduat) · "Varlık ekle"
 * (katlı; sekmeler Hisse/ETF · Fon · Kripto · Altın · Nakit · Diğer — hepsi açılış bakiyesi = elimde zaten olan) · hesap kartları
 * (varlıklar, Sat / Düzenle / Kaldır / Fiyat gir, satır içi "+ işlem", "Vadeli mevduat") · diğer işlemler (transfer, faiz, ücret,
 * bölünme) · işlem defteri (katlı, varsayılan kapalı) · hedef · CSV · gelişmiş (adlar, hesap kapatma). İki kap aynı veriyi paylaşır.
 * ═══════════════════════════════════════════════════════════════════════════
 * Gerçek portföyün ELLE kaydı ve izlenmesi (sunucu: lib/portfoyum, uçlar /api/portfoyum/*). Laboratuvar sekmeleri yerinde;
 * bu sekme onların ÖNÜNDE (ilk alt sekme). Kurallar (PLAN-PORTFOYUM §0): yalnız panel (Harcama'ya dokunulmaz), hiçbir bakiye
 * otomatik dolmaz, ana para birimi yok (her varlık kendi biriminde; toplam USD ve TL), hedefi kullanıcı girer.
 *
 * Bölümler: üst düğmeler (tutarları gizle · yenile · fiyatları yenile) · uyarı bandı · özet şeridi (USD ve TL toplam, gün /
 * ay / yıl getirisi TWR, en yüksekten düşüş) · dağılım halkası (iç hedef, dış gerçek, sapma turuncu) + kur çevirici kartı ·
 * varlık tablosu (telefonda kart) · hesap kırılımı (son kayıt + bayat uyarısı) · değer geçmişi grafiği · işlem defteri (ekle
 * formu + katlı "Aynı gün sırası", süzgeç (durum: etkin/iptal/hepsi), tasarımcı paketi özeti, aynı gün sıra rozeti, iptal = ters kayıt,
 * CSV dışa / içe aktarım önizlemeli) · hedef düzenleyici (%100 denetimi; model hedefi Bu ay'dan — Ö11) · kurum / hesap / varlık yönetimi + elle fiyat.
 *
 * Kurallar: tüm DOM AG.dom.el (innerHTML yok — scripts/panel-denetim.js 5b), tablolar AG.tablo, renkler token sınıfları
 * (inline stil yok), istekler yalnız AG.api.portfoyum. Yazma düğmeleri data-kilit="telefon" (js/pages/kabuk.js kilitler) ve
 * yazma bölümleri `.pm-yazma` (telefon kademesinde CSS ile gizli; sunucu da 403 verir). Tutar gizleme ve $ / ₺ yalnız arayüz:
 * yeni panel F6'dan beri TEK kaynak üst çubuktaki $ / ₺ / Gizli seçicisi (localStorage 'pusula.portfoy.gorunum', js/pages/pano.js).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  // 64.8: geliştirme bilgisayarında yazma sunucuya gider; sunucu kapalıysa kuyruğa girer → ek "kuyrukta" bildirimi (js/pages/evKuyruk.js)
  const OKUMA_UCLARI = new Set(['ozet', 'islemler', 'csvYolu', 'gecmis', 'kiyas', 'rapor', 'kur', 'labGirdi', 'sembolBul', 'csvOnizle', 'fiyatYenile']);
  const api = () => (AG.evKuyruk ? AG.evKuyruk.sarmala(AG.api.portfoyum, OKUMA_UCLARI) : AG.api.portfoyum);
  /** 64.8: bu bilgisayar Portföyüm'ü sunucudan yalnız gösteriyor mu (sunucu bağlantısı var, yazma jetonu yok) — yazma bölümleri gizlenir. */
  const saltOkunur = () => !!(veri && veri.yazma && veri.yazma.ev && !veri.yazma.acik);

  const GORUNUM_ANAHTAR = 'pusula.portfoy.gorunum';   // F6: üst çubuk $ / ₺ / Gizli (pano.js yazar)
  const PARA_SIMGE = { USD: '$', TRY: '₺', EUR: '€', GBP: '£' };
  const ISLEM_AD = { acilis: 'Açılış bakiyesi', al: 'Alış', sat: 'Satış', temettu: 'Temettü / kupon', faiz: 'Faiz', yatir: 'Para yatırma', cek: 'Para çekme',
    transfer: 'Transfer', bolunme: 'Bölünme', ucret: 'Ücret / gider' };
  const KAYNAK_AD = { yahoo: 'Yahoo', tefas: 'TEFAS', binance: 'Binance', altin: 'Gram altın', elle: 'Elle', islem: 'İşlem fiyatı', canli: 'Canlı' };

  /**
   * Form alanları (işlem türüne göre). `nakit` = varlık yerine para birimi + tutar. Açılış ve transferde
   * "varlık / nakit" seçimi var.
   */
  const FORM_ALANLARI = {
    acilis: ['hesap', 'tarih', 'kalem', 'varlik', 'adet', 'birimMaliyet', 'para', 'tutar', 'not'],
    al: ['hesap', 'tarih', 'varlik', 'adet', 'fiyat', 'ucret', 'not'],
    sat: ['hesap', 'tarih', 'varlik', 'adet', 'fiyat', 'ucret', 'not'],
    temettu: ['hesap', 'tarih', 'varlik', 'tutar', 'vergi', 'not'],
    faiz: ['hesap', 'tarih', 'para', 'tutar', 'vergi', 'not'],
    yatir: ['hesap', 'tarih', 'para', 'tutar', 'not'],
    cek: ['hesap', 'tarih', 'para', 'tutar', 'not'],
    ucret: ['hesap', 'tarih', 'para', 'tutar', 'not'],
    transfer: ['hesap', 'hedefHesap', 'tarih', 'kalem', 'varlik', 'adet', 'para', 'tutar', 'ulasanTutar', 'not'],
    bolunme: ['tarih', 'varlik', 'oran', 'not']
  };
  const ALAN_ETIKET = {
    hesap: 'Hesap', hedefHesap: 'Hedef hesap', tarih: 'Tarih', kalem: 'Ne?', varlik: 'Varlık', adet: 'Adet', birimMaliyet: 'Birim maliyet (isteğe bağlı)',
    fiyat: 'Birim fiyat', ucret: 'Ücret / komisyon', tutar: 'Tutar', ulasanTutar: 'Ulaşan tutar (isteğe bağlı)', vergi: 'Vergi / stopaj', para: 'Para birimi', oran: 'Oran (2 = her pay 2 pay)', not: 'Not'
  };

  let veri = null;           // GET /ozet
  let defter = null;         // GET /islemler
  let gecmis = null;         // GET /gecmis
  let yukleniyor = false;
  let gizli = genelPara() === 'gizli';
  let duzenlenen = null;     // satır içi düzenlenen pozisyon anahtarı (hesap|varlık)
  /** "Varlık ekle" kartı (61.2 hisse ekle; 67.4 sekmeli): bulunan adaylar, seçili aday, sekme, son kullanılan hesap, uyarı. */
  const hizli = { adaylar: [], aday: null, sekme: 'hisse', sonHesap: '', bulunuyor: false, hata: '', uyari: '' };
  /** 67.4 "Yeni hesap" kartının yazılanları (yeniden çizimde kaybolmasın). */
  let yeniHesap = {};
  /** 67.4 hesap kartında açık satır içi formlar: mevduat (hesap id) ve elle fiyat (pozisyon anahtarı). */
  let faizAcik = null, fiyatAcik = null;
  /** 67.4: açılış bakiyesi artık yalnız "Varlık ekle"den — "Diğer işlemler" formunda açılış yok. */
  const FORM_TURLERI = () => Object.entries(ISLEM_AD).filter(([k]) => k !== 'acilis');
  let formTur = 'transfer';
  let formKalem = 'varlik';
  let grafikBirim = 'USD';
  let hedefTaslak = null;    // { duzey, satirlar: [{anahtar, yuzde}], bant, kaynak }
  let csvSonuc = null;
  const suzgec = { hesap: '', islem: '', varlik: '', bas: '', bit: '', durum: 'etkin' };
  const acikPaketler = new Set();   // geri alınmış tasarımcı paketleri: kayıtları açılanlar
  const MODEL_AD = { 'm-qqq-m10': 'Nasdaq M10', 'm-bist-m10': 'BIST M10', 'm-837': '%50 QQQ + %50 Hücum (837)' };

  function oku(k) { try { return global.localStorage ? global.localStorage.getItem(k) : null; } catch (e) { return null; } }
  /** Üst çubuk seçimi: 'usd' | 'tl' | 'gizli' (okunamazsa 'usd'). */
  function genelPara() { try { const g = JSON.parse(oku(GORUNUM_ANAHTAR) || 'null'); return g && ['usd', 'tl', 'gizli'].includes(g.para) ? g.para : 'usd'; } catch (e) { return 'usd'; } }
  function yaz(k, v) { try { if (global.localStorage) global.localStorage.setItem(k, v); } catch (e) { /* özel pencere: yalnız bu oturum */ } }

  /* ── Saf biçim ve modeller (scripts/portfoyum-selftest.js sınar) ───────── */
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  function sayiBicim(x, b) {
    if (!sayiMi(x)) return '—';
    const ondalik = b != null ? b : (Math.abs(x) >= 1000 ? 0 : Math.abs(x) >= 1 ? 2 : 4);
    return x.toLocaleString('tr-TR', { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik });
  }
  /** Tutar kendi para biriminde: "$1.234,56" / "₺1.234,56" / "€…" (b: ondalık). */
  function paraBicim(x, para, b) {
    if (!sayiMi(x)) return '—';
    const s = PARA_SIMGE[para] || '';
    const n = Math.abs(x).toLocaleString('tr-TR', { minimumFractionDigits: b != null ? b : 2, maximumFractionDigits: b != null ? b : 2 });
    return `${x < 0 && /[1-9]/.test(n) ? '−' : ''}${s}${n}${s ? '' : ' ' + (para || '')}`;
  }
  // B-17: tek yüzde biçimi (core/format.js oranYuzde): "−%4,0", −0 → "%0,0" ("BUGÜN %-0,0" yok).
  const yuzde = (x, b = 1) => AG.fmt.oranYuzde(x, b);
  const isaretliYuzde = (x, b = 1) => AG.fmt.oranYuzde(x, b, { isaretli: true });
  const adetBicim = (x) => (sayiMi(x) ? x.toLocaleString('tr-TR', { maximumFractionDigits: 8 }) : '—');
  const ton = (x) => (!sayiMi(x) || Math.abs(x) < 1e-12 ? 'tone-muted' : x > 0 ? 'tone-success' : 'tone-danger');
  const gunStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const bugun = () => gunStr(new Date());
  /** Açılış formunun varsayılan tarihi DÜN: bugünün işlemleri açılıştan sonra girilir (açılış = gün SONU bakiyesi). */
  const dun = () => { const d = new Date(); d.setDate(d.getDate() - 1); return gunStr(d); };
  /** "Tutarları gizle" açıkken bildirim/onay metnindeki rakamlar • olur (yalnız arayüz). */
  const gizliMetin = (m) => (gizli ? String(m == null ? '' : m).replace(/[0-9]/g, '•') : String(m == null ? '' : m));

  /** Formdaki metin değerlerinden POST /islem gövdesi (sunucu yine normaller ve denetler). Boş alan gönderilmez. */
  function formGovdesi(tur, d, kalem) {
    const g = { islem: tur };
    const alanlar = FORM_ALANLARI[tur] || [];
    const nakitMi = (tur === 'acilis' || tur === 'transfer') && kalem === 'nakit';
    for (const a of alanlar) {
      if (a === 'kalem') continue;
      if ((tur === 'acilis' || tur === 'transfer') && nakitMi && ['varlik', 'adet', 'birimMaliyet'].includes(a)) continue;
      if ((tur === 'acilis' || tur === 'transfer') && !nakitMi && ['para', 'tutar', 'ulasanTutar'].includes(a)) continue;
      const v = d[a] == null ? '' : String(d[a]).trim();
      if (v !== '') g[a] = v;
    }
    // Aynı gün sırası (Ö10): isteğe bağlı, açılışta yok (açılış her zaman gün SONU bakiyesidir).
    const gs = d.gunIciSira == null ? '' : String(d.gunIciSira).trim();
    if (gs !== '' && tur !== 'acilis') g.gunIciSira = gs;
    return g;
  }

  /** İşlem satırı özeti (insan dilinde, tutar kendi biriminde). */
  function islemOzeti(x, V) {
    const v = x.varlik && V ? V.get(x.varlik) : null;
    const sem = v ? v.sembol : (x.varlik || '');
    const para = x.para || (v && v.para);
    switch (x.islem) {
      case 'acilis': return v || x.varlik ? `${sem}: ${adetBicim(x.adet)} adet${sayiMi(x.birimMaliyet) ? ` · birim maliyet ${paraBicim(x.birimMaliyet, para)}` : ' · maliyet girilmedi'}` : `${para} nakit: ${paraBicim(x.tutar, para)}`;
      case 'al': case 'sat': return `${sem}: ${adetBicim(x.adet)} × ${paraBicim(x.fiyat, para, x.fiyat < 10 ? 4 : 2)}${x.ucret ? ` + ücret ${paraBicim(x.ucret, para)}` : ''}`;
      case 'temettu': return `${sem}: ${paraBicim(x.tutar, para)}${x.vergi ? ` (vergi ${paraBicim(x.vergi, para)})` : ''}`;
      case 'faiz': return `${paraBicim(x.tutar, para)}${x.vergi ? ` (stopaj ${paraBicim(x.vergi, para)})` : ''}`;
      case 'yatir': case 'cek': case 'ucret': return paraBicim(x.tutar, para);
      case 'transfer': return v || x.varlik ? `${sem}: ${adetBicim(x.adet)} adet` : `${paraBicim(x.tutar, para)}${Number.isFinite(x.ulasanTutar) && x.ulasanTutar !== x.tutar ? ` → ulaşan ${paraBicim(x.ulasanTutar, para)} (masraf ${paraBicim(x.tutar - x.ulasanTutar, para)})` : ''}`;
      case 'bolunme': return `${sem}: oran ${sayiBicim(x.oran, 4)}`;
      default: return '';
    }
  }

  /** Hedef düzenleyici denetimi: toplam %100 (±0,01). */
  function hedefDenetle(satirlar) {
    const l = (satirlar || []).filter(s => String(s.yuzde == null ? '' : s.yuzde).trim() !== '');
    let toplam = 0; const hatalar = [];
    for (const s of l) {
      const n = Number(String(s.yuzde).replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 100) { hatalar.push(`${s.ad || s.anahtar}: 0–100 arası yüzde`); continue; }
      toplam += n;
    }
    if (!l.length) hatalar.push('en az bir ağırlık girin');
    else if (Math.abs(toplam - 100) > 0.01) hatalar.push(`toplam %${toplam.toFixed(2).replace('.', ',')} — %100 olmalı`);
    return { toplam, gecerli: hatalar.length === 0, hatalar };
  }

  /** Halka dilimleri: ≤ 7 (küçükler "Diğer"de); AG.pages.anasayfa.halka biçimi { kimlik, ad, hedef, gercek }. */
  function halkaDilimleri(dag) {
    const l = ((dag && dag.dilimler) || []).filter(d => d.gercek > 0 || (d.hedef || 0) > 0).map(d => ({ kimlik: d.anahtar, ad: d.ad, hedef: d.hedef || 0, gercek: d.gercek, asim: d.asim, sapma: d.sapma }));
    if (l.length <= 7) return l;
    const ust = l.slice(0, 6), alt = l.slice(6);
    ust.push({ kimlik: 'diger', ad: `Diğer (${alt.length})`, hedef: alt.reduce((a, d) => a + d.hedef, 0), gercek: alt.reduce((a, d) => a + d.gercek, 0), asim: false, sapma: null });
    return ust;
  }

  /** Hedef taslağı: mevcut hedef ya da dağılım anahtarlarından (düzey değişince satırlar o düzeyin anahtarları). */
  function hedefTaslagiKur(v, duzey) {
    const h = v && v.hedef;
    const d = duzey || (h ? h.duzey : 'sinif');
    const anahtarlar = new Map();
    const ad = (k) => {
      if (d === 'sinif') return (v.sabitler && v.sabitler.siniflar[k]) || k;
      if (k.startsWith('nakit:')) return `${k.slice(6)} nakit`;
      const x = (v.varliklar || []).find(y => y.id === k); return x ? `${x.sembol} — ${x.ad}` : k;
    };
    if (d === 'sinif') {
      for (const p of (v.degerleme && v.degerleme.pozisyonlar) || []) anahtarlar.set(p.sinif, null);
      for (const n of (v.degerleme && v.degerleme.nakitler) || []) anahtarlar.set(n.sinif, null);
    } else {
      for (const x of v.varliklar || []) anahtarlar.set(x.id, null);
      for (const n of (v.degerleme && v.degerleme.nakitler) || []) anahtarlar.set('nakit:' + n.para, null);
    }
    if (h && h.duzey === d) for (const [k, w] of Object.entries(h.agirliklar)) anahtarlar.set(k, w);
    return { duzey: d, bant: h ? h.bant : 5, kaynak: 'elle', satirlar: [...anahtarlar.entries()].map(([k, w]) => ({ anahtar: k, ad: ad(k), yuzde: w == null ? '' : String(w) })) };
  }

  /* ── Çizim yardımcıları ─────────────────────────────────────────────── */
  const tutar = (metin, ek) => el('span', { class: `pm-tutar${ek ? ' ' + ek : ''}`, text: metin });
  const ikon = (ad, sinif) => el('i', { class: sinif || 'tone-primary', 'data-lucide': ad });
  const baslik = (ikonAd, metin, ek) => el('h3', { class: 'card-title mb-3' }, [ikon(ikonAd), el('span', { text: ' ' + metin }), ek || null]);
  const dugme = (metin, onclick, sinif, ek) => el('button', { type: 'button', class: `btn ${sinif || 'btn-secondary'} btn-sm`, onclick, ...(ek || {}) }, [el('span', { text: metin })]);
  const yazmaDugme = (metin, onclick, sinif, ek) => dugme(metin, onclick, sinif, { 'data-kilit': 'telefon', ...(ek || {}) });
  const secici = (props, secenekler, deger) => {
    const s = el('select', { class: 'form-control control-sm', ...props }, secenekler.map(([v, t]) => el('option', { value: v, text: t })));
    if (deger != null) s.value = deger;
    return s;
  };
  const girdi = (props, deger) => { const i = el('input', { class: 'form-control control-sm', ...props }); if (deger != null) i.value = deger; return i; };
  const alan = (etiket, kontrol, ipucu) => el('label', { class: 'pf-alan' }, [el('span', { text: etiket }), kontrol, ipucu ? el('small', { class: 'hint hint-sm mb-0', text: ipucu }) : null]);
  const hesapAdi = (id) => { const h = veri && (veri.hesaplar || []).find(x => x.id === id); return h ? h.ad : (id || '—'); };
  const varlikHaritasi = () => new Map(((veri && veri.varliklar) || []).map(v => [v.id, v]));
  const hesapSecenekleri = (yalnizAcik) => ((veri && veri.hesaplar) || []).filter(h => !yalnizAcik || h.durum === 'acik').map(h => {
    const k = (veri.kurumlar || []).find(x => x.id === h.kurum);
    return [h.id, `${h.ad}${k ? ' · ' + k.ad : ''}${h.durum === 'kapali' ? ' (kapalı)' : ''}`];
  });
  const varlikSecenekleri = () => ((veri && veri.varliklar) || []).map(v => [v.id, `${v.sembol} — ${v.ad} (${v.para})`]);
  const paraSecenekleri = () => ((veri && veri.sabitler && veri.sabitler.paralar) || ['USD', 'TRY', 'EUR', 'GBP']).map(p => [p, p]);

  /* ── Bölümler ───────────────────────────────────────────────────────── */
  function ustCiz() {
    const k = bul('pmUst');
    if (!k) return;
    const d = veri && veri.degerleme;
    doldur(k, [
      el('div', { class: 'pm-ust-bilgi' }, [
        el('span', { class: 'hint hint-sm mb-0', text: d ? `Değerleme: ${d.tarih}${d.kur ? ` · USD/TRY ${sayiBicim(d.kur.USDTRY, 4)} (${d.kur.tarih})` : ''} · ${veri.islemSayisi} işlem` : 'Yükleniyor…' })
      ]),
      el('div', { class: 'pf-dugmeler' }, [
        dugme('Yenile', () => yukle(true), 'btn-secondary', { id: 'btnPmYenileEski' })
      ])
    ]);
  }

  function bantCiz() {
    const k = bul('pmBant');
    if (!k) return;
    const h = (veri && veri.hatalar) || [], u = (veri && veri.uyarilar) || [];
    // 64.8: geliştirme bilgisayarında yazma/kuyruk durumu + Kuyruk paneli
    const ev = AG.evKuyruk ? AG.evKuyruk.bantModeli(veri) : [];
    const kuyruk = AG.evKuyruk ? AG.evKuyruk.kuyrukPaneli(veri, { onEk: 'Pm', onDegisti: () => yukle(true) }) : null;
    k.classList.toggle('is-hidden', !h.length && !u.length && !ev.length && !kuyruk);
    const ogeler = [];
    if (ev.length) ogeler.push(el('ul', { class: 'pf-uyari-liste', id: 'pmEvBant' }, ev.map(x => el('li', { class: `pf-uyari pf-uyari-${x.s}`, text: x.t }))));
    if (kuyruk) ogeler.push(kuyruk);
    if (h.length) ogeler.push(el('div', { class: 'hata-kutu', role: 'alert' }, [
      el('strong', { class: 'hata-kutu-baslik', text: `Kayıt denetimi: ${h.length} hata` }),
      el('ul', { class: 'mb-0' }, h.slice(0, 10).map(x => el('li', null, [tutar(x.mesaj)])))
    ]));
    const kritik = new Set(['fiyatsiz', 'kapali-bakiye', 'kur-yok', 'kaynak', 'acilis-nakit-eksik', 'bolunme-eksik']);
    if (u.length) ogeler.push(el('ul', { class: 'pf-uyari-liste' }, u.slice(0, 12).map(x => el('li', { class: `pf-uyari ${kritik.has(x.kod) ? 'pf-uyari-kritik' : 'pf-uyari-uyari'}` }, [tutar(x.mesaj)]))
      .concat(u.length > 12 ? [el('li', { class: 'pf-uyari pf-uyari-bilgi', text: `… ve ${u.length - 12} uyarı daha` })] : [])));
    doldur(k, ogeler);
  }

  function kutu(etiket, deger, alt, sinif, ipucu) {
    return el('div', { class: 'ana-sayi', title: ipucu || null }, [
      el('span', { class: 'stat-title', text: etiket }),
      el('span', { class: `stat-value stat-value-sm sayi ${sinif || ''}` }, [deger && deger.nodeType ? deger : el('span', { text: deger })]),
      alt ? el('span', { class: 'hint hint-sm mb-0' }, [alt.nodeType ? alt : el('span', { text: alt })]) : null
    ]);
  }

  /** 62.4 Portföyüm sayıları (seçili para biriminde): toplam · başlangıçtan · bu yıl · bu ay · QQQ aynı dönem · en derin düşüş ·
   * gerçekleşen K/Z + gelir · net yatırılan (kâr). */
  function ozetCiz() {
    const k = bul('pmOzet');
    if (!k || !veri) return;
    const d = veri.degerleme, g = veri.getiri || {}, u = getiriB(), o = (g[birim === 'TL' ? 'USD' : 'TL']) || {}, s = (gecmis && gecmis.seri) || [];
    const eksiNakit = (d.nakitler || []).filter(x => x.tutar < -1e-6);
    const eksikKur = (veri.uyarilar || []).some(x => x.kod === 'kur-yok');
    const kv = s.length ? kiyasVeri.get(`${s[0].tarih}|${birim}`) : null;
    if (s.length && kv === undefined) kiyasYukle(s[0].tarih, birim);
    const q = kv && kv.seriler ? kv.seriler.find(x => x.kimlik === 'qqq') : null;
    const qGet = q && q.noktalar.length > 1 ? q.noktalar[q.noktalar.length - 1][1] / 100 - 1 : null;
    const akisAlan = birim === 'TL' ? 'akisTL' : 'akisUSD';
    const net = s.reduce((a, x) => a + (sayiMi(x[akisAlan]) ? x[akisAlan] : 0), 0);
    const toplam = birim === 'TL' ? d.toplamTL : d.toplamUSD;
    let gerc = 0;
    for (const p of d.pozisyonlar || []) { const f = p.deger ? (birim === 'TL' ? p.degerTL / p.deger : p.degerUSD / p.deger) : null; if (sayiMi(f)) gerc += ((p.gerceklesenFifo || 0) + (p.gelir || 0)) * f; }
    const pb = birim === 'TL' ? 'TRY' : 'USD', diger = birim === 'TL' ? 'USD' : 'TL';
    const getiriKutu = (etiket, a, ipucu) => kutu(etiket, el('span', { class: ton(u[a]), text: isaretliYuzde(u[a]) }), el('span', { class: ton(o[a]), text: `${diger}: ${isaretliYuzde(o[a])}` }), '', ipucu);
    doldur(k, [
      kutu(`Toplam (${birim})`, tutar(tutarB(d.toplamUSD, d.toplamTL)), el('span', null, [
        el('span', { text: d.kur ? `USD/TRY ${sayiBicim(d.kur.USDTRY, 2)}${d.kur.bayat ? ' (bayat)' : ''}` : 'kur yok' }),
        eksiNakit.length ? el('span', { class: 'tone-warning', id: 'pmEksiNakit', title: eksiNakit.map(x => `${x.hesapAd} ${x.para}`).join(', '), text: ` · ⚠ ${eksiNakit.length} hesapta nakit eksi` }) : null,
        eksikKur ? el('span', { class: 'tone-warning', text: ' · ⚠ kur yok: toplam eksik' }) : null])),
      kutu('Başlangıçtan', el('span', { class: ton(u.tum), text: isaretliYuzde(u.tum) }), s.length ? `${s[0].tarih}'den · para giriş/çıkışı hariç` : null, '', 'Zaman ağırlıklı getiri (TWR): para yatırmak ya da çekmek getiriyi değiştirmez'),
      getiriKutu('Bu yıl', 'yil', 'Yıl başından, zaman ağırlıklı'),
      getiriKutu('Bu ay', 'ay', 'Ay başından, zaman ağırlıklı'),
      kutu('QQQ · aynı dönem', el('span', { class: ton(qGet), text: isaretliYuzde(qGet) }), 'kıyas: hiçbir şey yapmasaydın', '', 'Aynı ilk günden bugüne QQQ al-tut, aynı para biriminde'),
      kutu('En derin düşüş', el('span', { class: ton(u.ddEnBuyuk), text: yuzde(u.ddEnBuyuk) }), `şu an zirveden ${yuzde(u.dd)}`, '', 'Getiri endeksinin zirvesinden en büyük düşüş'),
      kutu('Gerçekleşen K/Z + gelir', tutar(paraBicim(gerc, pb, 0)), 'satışlar (FIFO) + temettü/faiz', '', 'Kapatılmış işlemlerin kâr/zararı ve alınan gelir'),
      kutu('Net yatırılan', tutar(paraBicim(net, pb, 0)), el('span', null, [el('span', { text: 'kâr ' }), tutar(paraBicim(toplam - net, pb, 0))]), '', 'Açılış bakiyeleri + para yatırma − çekme (bugünkü kurla değil, o günün kuruyla)')
    ]);
  }

  function dagilimCiz() {
    const k = bul('pmDagilim');
    if (!k) return;
    const dag = veri.dagilim;
    const dl = halkaDilimleri(dag);
    const bas = el('h4', { class: 'pf-bolum-baslik', text: `Dağılım (${dag.duzey === 'sinif' ? 'sınıfa' : 'varlığa'} göre)` });
    if (!dl.length) { doldur(k, [bas, el('p', { class: 'hint mb-0', text: 'Henüz değerlenen varlık yok.' })]); return; }
    const halka = AG.pages.anasayfa && AG.pages.anasayfa.halka ? AG.pages.anasayfa.halka(dl) : null;
    const lejant = el('ul', { class: 'halka-lejant' }, dl.map((d, i) => el('li', null, [
      el('span', { class: `halka-kutu halka-renk-${i + 1}`, 'aria-hidden': 'true' }),
      el('span', { class: 'halka-ad', text: d.ad }),
      el('span', { class: 'sayi halka-yuzde', title: 'hedef → gerçek', text: dag.hedefVar ? `${yuzde(d.hedef, 0)} → ${yuzde(d.gercek, 0)}` : yuzde(d.gercek, 1) }),
      el('span', { class: `sayi halka-fark ${d.asim ? 'tone-warning' : 'tone-muted'}`, title: d.asim ? `bant (±${Math.round(dag.bant * 100)} puan) dışında` : 'fark (puan)',
        text: dag.hedefVar && sayiMi(d.sapma) ? `${d.sapma > 0 ? '+' : ''}${(d.sapma * 100).toFixed(1).replace('.', ',')}${d.asim ? ' !' : ''}` : '' })
    ])));
    // 62.4: hesaba göre dağılım (değer payı) — çubuk listesi
    const hl = ((veri.degerleme && veri.degerleme.hesaplar) || []).filter(h => (h.degerUSD || 0) > 0);
    const topUSD = hl.reduce((a, h) => a + (h.degerUSD || 0), 0);
    const hesapListe = topUSD > 0 ? el('ul', { class: 'pm-hesap-dag' }, hl.sort((a, b) => b.degerUSD - a.degerUSD).map(h => {
      const pay = h.degerUSD / topUSD;
      return el('li', null, [el('span', { class: 'pm-hesap-dag-ad', text: h.ad }),
        AG.dom.svg('svg', { class: 'pm-hesap-dag-svg', viewBox: '0 0 100 6', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, [AG.dom.svg('rect', { x: 0, y: 0, width: Math.max(0.5, pay * 100), height: 6, class: 'pm-hesap-dag-dolgu' })]),
        el('span', { class: 'sayi', text: yuzde(pay, 0) })]);
    })) : null;
    doldur(k, [bas, el('div', { class: 'ana-dagilim' }, [halka, lejant]),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: dag.hedefVar
        ? `İç halka hedef, dış halka gerçek. Turuncu: hedeften ±${Math.round(dag.bant * 100)} puandan fazla uzaklaşmış (${dag.asimSayisi}).`
        : 'Hedef girilmedi: yalnız bugünkü (gerçek) dağılım görünür.' }),
      el('details', { class: 'hs-kat-mini mt-2', id: 'pmHedefNedir' }, [el('summary', { text: 'Hedef ve gerçek ne demek?' }),
        el('p', { class: 'hint hint-sm mt-1 mb-0', text: 'Hedef, paranın sınıflara (hisse, altın, kripto, TL…) nasıl bölünmesini istediğin orandır — ör. %40 hisse, %25 altın. Gerçek, bugünkü fiyatlarla paranın fiilen nasıl bölündüğüdür. Fiyatlar oynadıkça gerçek hedeften uzaklaşır; fark bandı aşınca alım-satımla hedefe geri getirmek (dengeleme) riskini istediğin seviyede tutar. Bu bir getiri hedefi değildir, ne kadar kazandığını ölçmez. Hedefi Portföy › Hedefim\'den girersin.' })]),
      hesapListe ? el('h4', { class: 'pf-bolum-baslik mt-3', text: 'Hesaba göre' }) : null, hesapListe]);
  }

  function hesaplarCiz() {
    const k = bul('pmHesaplar');
    if (!k) return;
    const l = veri.degerleme.hesaplar || [];
    const bas = baslik('landmark', 'Hesaplarım');
    if (!l.length) { doldur(k, [bas, el('p', { class: 'hint mb-0', text: 'Hesap yok — Portföy › Hesaplar\'daki "Yeni hesap" kartından aç, sonra "Varlık ekle".' })]); return; }
    const tur = (veri.sabitler && veri.sabitler.hesapTurleri) || {};
    doldur(k, [bas, AG.tablo.kutulu({ id: 'tblPmHesaplar', sinif: 'table-dense pf-tablo', basliklar: ['Hesap', 'Kurum', 'Tür', 'Değer USD', 'Değer TL', 'Nakit', 'Son kayıt', 'Durum'],
      satirlar: l.map(h => el('tr', { class: h.bayat ? 'pm-satir-uyari' : null }, [
        el('td', { class: 'pf-sola fw-semibold', text: h.ad }), el('td', { class: 'pf-sola', text: h.kurumAd }), el('td', { class: 'pf-sola', text: tur[h.hesapTuru] || h.hesapTuru }),
        el('td', { class: 'sayi' }, [tutar(paraBicim(h.degerUSD, 'USD', 0))]), el('td', { class: 'sayi' }, [tutar(paraBicim(h.degerTL, 'TRY', 0))]),
        el('td', { class: 'sayi' }, [tutar(h.nakit.length ? h.nakit.map(n => paraBicim(n.tutar, n.para)).join(' · ') : '—')]),
        el('td', { class: `sayi${h.bayat ? ' tone-warning' : ''}`, text: h.sonKayit ? `${String(h.sonKayit).slice(0, 10)}${h.sonKayitGun != null ? ` (${h.sonKayitGun} gün)` : ''}` : '—' }),
        el('td', null, [el('span', { class: `badge ${h.durum === 'kapali' ? '' : h.bayat ? 'badge-warning' : 'badge-success'}`, text: h.durum === 'kapali' ? `kapalı ${h.kapanis}` : h.bayat ? 'bayat' : 'açık' })])
      ])) }),
    el('p', { class: 'hint hint-sm mt-3 mb-0', text: `Bütün hesaplar elle güncellenir (otomatik bakiye okuma yok). ${(veri.sabitler && veri.sabitler.bayatHesapGun) || 30} günden uzun süredir kayıt girilmeyen açık hesap "bayat" işaretlenir.` })]);
  }

  async function grafikYukle() {
    const k = bul('pmGrafik');
    if (!k) return;
    try {
      const r = await api().gecmis();
      if (!r || !r.success) throw new Error((r && r.error) || 'yanıt yok');
      gecmis = r;
      portfoyumCiz();
    } catch (e) { doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'Değer geçmişi okunamadı' })]); }
  }

  /* ── İşlem defteri ──────────────────────────────────────────────────── */
  async function defterYukle() {
    const k = bul('pmDefterTablo');
    if (!k) return;
    try {
      const r = await api().islemler(suzgec);
      if (!r || !r.success) throw new Error((r && r.error) || 'yanıt yok');
      defter = r;
      defterTabloCiz();
    } catch (e) { doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'İşlem defteri okunamadı', yeniden: defterYukle })]); }
  }

  function defterSuzgecCiz() {
    const k = bul('pmDefterSuzgec');
    if (!k) return;
    const degis = (a) => (e) => { suzgec[a] = e.target.value; defterYukle(); csvBagCiz(); };
    doldur(k, [el('div', { class: 'pf-form-izgara' }, [
      alan('Hesap', secici({ id: 'selPmSuzHesap', onchange: degis('hesap') }, [['', 'Tümü']].concat(hesapSecenekleri(false)), suzgec.hesap)),
      alan('Tür', secici({ id: 'selPmSuzTur', onchange: degis('islem') }, [['', 'Tümü']].concat(Object.entries(ISLEM_AD)), suzgec.islem)),
      alan('Varlık', secici({ id: 'selPmSuzVarlik', onchange: degis('varlik') }, [['', 'Tümü']].concat(varlikSecenekleri()), suzgec.varlik)),
      alan('Başlangıç', girdi({ type: 'date', id: 'inpPmSuzBas', onchange: degis('bas') }, suzgec.bas)),
      alan('Bitiş', girdi({ type: 'date', id: 'inpPmSuzBit', onchange: degis('bit') }, suzgec.bit)),
      alan('Durum', secici({ id: 'selPmSuzDurum', onchange: degis('durum') }, [['etkin', 'Etkin'], ['iptal', 'İptal edilmiş'], ['hepsi', 'Hepsi']], suzgec.durum),
        'Varsayılan etkin: iptal edilmiş (ters kayıtlı) işlemler gizli.')
    ]), el('div', { class: 'pf-dugmeler mt-3', id: 'pmCsvBag' })]);
    csvBagCiz();
  }

  function csvBagCiz() {
    const k = bul('pmCsvBag');
    if (!k) return;
    doldur(k, [
      el('a', { class: 'btn btn-secondary btn-sm no-underline', id: 'lnkPmCsv', href: api().csvYolu(suzgec), download: 'portfoyum-islemler.csv' }, [ikon('download', ''), el('span', { text: ' CSV dışa aktar (süzgeçle)' })]),
      dugme('Süzgeci temizle', () => { for (const a of Object.keys(suzgec)) suzgec[a] = ''; suzgec.durum = 'etkin'; defterSuzgecCiz(); defterYukle(); }, 'btn-secondary')
    ]);
  }

  function defterTabloCiz() {
    const k = bul('pmDefterTablo');
    if (!k) return;
    const l = (defter && defter.islemler) || [];
    const V = varlikHaritasi();
    const sayac = bul('pmDefterSayi');
    if (sayac) sayac.textContent = ` · ${defter ? defter.toplam : 0} kayıt${l.some(x => x._iptal) ? ` · ${l.filter(x => x._iptal).length} iptal` : ''}`;
    if (!l.length) { doldur(k, [el('p', { class: 'hint mb-0', text: veri && veri.islemSayisi ? 'Süzgece uyan işlem yok.' : 'Henüz işlem yok. İlk iş: her hesap için "Açılış bakiyesi" girin.' })]); return; }
    // Tasarımcı paketleri (Portföy › Bu ay "Uyguladım"): bir satırlık özet; tamamı geri alınmış paket tabloda tek satıra iner (B-16).
    const paketler = tasarimciPaketleri(l);
    const gosterilen = [];
    const ozetVerildi = new Set();
    for (const x of l.slice(0, 500)) {
      const p = x.kaynakKayit === 'tasarimci' && x.tasarimci ? paketler.get(x.tasarimci.uygulama) : null;
      if (p && p.geriAlindi && p.kayitlar.length > 1 && !acikPaketler.has(p.id)) {
        if (!ozetVerildi.has(p.id)) { ozetVerildi.add(p.id); gosterilen.push({ paket: p }); }
        continue;
      }
      gosterilen.push(x);
    }
    const paketSatiri = (p) => el('tr', { class: 'pm-iptal pm-paket' }, [
      el('td', { text: p.tarih }),
      el('td', null, [el('span', { class: 'badge', text: 'Tasarımcı paketi' })]),
      el('td', { class: 'pf-sola', text: p.hesaplar.map(hesapAdi).join(', ') }),
      el('td', { class: 'pf-sola', text: paketMetni(p) }),
      el('td', { class: 'pf-sola pf-kucuk', text: 'Bu ay › Geri al ile ters kayıt yazıldı' }),
      el('td', { class: 'pf-kucuk', text: p.id }),
      el('td', { 'data-sirasiz': '1' }, [dugme('Kayıtları göster', () => { acikPaketler.add(p.id); defterTabloCiz(); }, 'btn-secondary btn-xs')])
    ]);
    const paketListe = [...paketler.values()];
    doldur(k, [
      paketListe.length ? el('ul', { class: 'pm-paket-liste mb-2', id: 'pmPaketler' }, paketListe.map(p => el('li', { class: 'pf-kucuk', text: paketMetni(p) }))) : null,
      AG.tablo.kutulu({ id: 'tblPmDefter', sinif: 'table-dense pf-tablo', siralanabilir: 'portfoyum-defter',
      basliklar: ['Tarih', 'Tür', 'Hesap', 'Ayrıntı', 'Not', 'Kimlik', ''],
      satirlar: gosterilen.map(x => (x.paket ? paketSatiri(x.paket) : el('tr', { class: x._iptal ? 'pm-iptal' : null }, [
        el('td', null, [el('span', { text: x.tarih }), x._gunSira ? el('span', { class: 'pm-gun-sira', title: 'Aynı gün sırası: bu gün muhasebede ' + x._gunSira.n + '. işlem (' + x._gunSira.toplam + ' işlemden)', text: x._gunSira.n + '/' + x._gunSira.toplam }) : null]),
        el('td', null, [el('span', { class: `badge ${x.islem === 'acilis' ? 'pm-rozet-acilis' : x.islem === 'al' || x.islem === 'yatir' ? 'badge-success' : x.islem === 'sat' || x.islem === 'cek' ? 'badge-danger' : ''}`, text: ISLEM_AD[x.islem] || x.islem }),
          x._otomatik ? el('span', { class: 'badge pm-rozet-oto', title: 'Mevduat faizi ayarından kendiliğinden eklendi (64.2); İptal et ile silinirse bir daha eklenmez', text: 'otomatik' }) : null]),
        el('td', { class: 'pf-sola', text: x.islem === 'transfer' ? `${hesapAdi(x.hesap)} → ${hesapAdi(x.hedefHesap)}` : x.islem === 'bolunme' ? 'tüm hesaplar' : hesapAdi(x.hesap) }),
        el('td', { class: 'pf-sola' }, [tutar(islemOzeti(x, V)), x._iptal ? el('div', { class: 'pf-kucuk tone-warning', text: `İPTAL (ters kayıt ${x._iptal.id})${x._iptal.neden ? ': ' + x._iptal.neden : ''}` }) : null,
          x._hata ? el('div', { class: 'pf-kucuk tone-danger', text: x._hata }) : null]),
        el('td', { class: 'pf-sola pf-kucuk', text: x.not || '' }),
        el('td', { class: 'pf-kucuk', text: x.id }),
        el('td', { 'data-sirasiz': '1' }, [x._iptal ? null : yazmaDugme('İptal et', () => iptalEt(x), 'btn-secondary btn-xs', { title: 'Ters kayıt: işlem silinmez, "iptal" işaretlenir ve hesaplara katılmaz' })])
      ]))) }),
    l.length > 500 ? el('p', { class: 'hint hint-sm mt-2 mb-0', text: `İlk 500 satır gösteriliyor (${l.length}); süzgeç kullanın ya da CSV indirin.` }) : null]);
  }

  /** Listede görünen tasarımcı paketleri: uygulama kimliği → { id, ay, model, tarih, hesaplar, kayitlar, iptal, geriAlindi }. */
  function tasarimciPaketleri(l) {
    const m = new Map();
    for (const x of l || []) {
      if (x.kaynakKayit !== 'tasarimci' || !x.tasarimci || !x.tasarimci.uygulama) continue;
      const id = x.tasarimci.uygulama;
      if (!m.has(id)) m.set(id, { id, ay: x.tasarimci.ay || '', model: x.tasarimci.model || '', tarih: x.tarih, hesaplar: [], kayitlar: [], iptal: 0 });
      const p = m.get(id);
      p.kayitlar.push(x); if (x._iptal) p.iptal++;
      for (const h of [x.hesap, x.hedefHesap]) if (h && !p.hesaplar.includes(h)) p.hesaplar.push(h);
    }
    for (const p of m.values()) p.geriAlindi = p.iptal === p.kayitlar.length;
    return m;
  }
  function paketMetni(p) {
    const durum = p.geriAlindi ? 'geri alındı' : p.iptal ? p.iptal + ' iptal' : 'etkin';
    return 'Tasarımcı ' + p.ay + ' ' + (MODEL_AD[p.model] || p.model) + ' — ' + p.kayitlar.length + ' kayıt (' + durum + ')';
  }

  /* ── Varlık ekle (61.2 "Hisse ekle"; 67.4 sekmeli). Elimde ZATEN olan varlık = AÇILIŞ BAKİYESİ; her zaman VAR OLAN bir hesaba
   *    eklenir (yeni hesap "Yeni hesap" kartında). Varlık yoksa arkada açılır, fiyatı indirilir: POST /hizli-ekle
   *    { kaynak: yahoo (Hisse/ETF) | tefas (Fon) | binance (Kripto) | altin (gram) | nakit (para + tutar) | elle (Diğer) }. ── */
  const hizliAlanlar = { sembol: 'inpPmHSembol', hesap: 'selPmHHesap', adet: 'inpPmHAdet', maliyet: 'inpPmHMaliyet', tarih: 'inpPmHTarih',
    kod: 'inpPmHKod', para: 'selPmHPara', tutar: 'inpPmHTutar', eSembol: 'inpPmHESembol', ad: 'inpPmHAd', sinif: 'selPmHSinif', fiyat: 'inpPmHFiyat', not: 'inpPmHNot' };
  const VE_SEKME = [['hisse', 'Hisse / ETF'], ['fon', 'Fon (TEFAS)'], ['kripto', 'Kripto'], ['altin', 'Altın (gram)'], ['nakit', 'Nakit bakiyesi'], ['diger', 'Diğer (elle fiyat)']];
  /** Yeniden çizimde yazılanlar kaybolmasın: alanları oku (yoksa önceki değer). */
  function hizliOku() {
    const o = hizli.alan || {};
    for (const [a, id] of Object.entries(hizliAlanlar)) { const x = bul(id); if (x) o[a] = String(x.value == null ? '' : x.value); }
    hizli.alan = o;
    return o;
  }
  const adayMetni = (a) => `${a.ad} · ${a.borsa || '?'} · ${a.para}`;
  /** Adayın beklenen hesap türü (sunucudaki hesapTuruTahmin ile aynı kural). */
  const beklenenHesapTuru = (a) => (/\.IS$/.test(a.kod) ? 'bist-araci' : a.sinif === 'kripto' ? 'binance' : a.para === 'USD' ? 'abd-araci' : 'diger');
  const acikHesaplar = () => ((veri && veri.hesaplar) || []).filter(h => h.durum === 'acik');
  /**
   * Aday seçilince hesap: önce beklenen türde ve aynı para birimli hesap (seçili olan uyuyorsa o kalır); yoksa aynı para birimli
   * aracı kurum / diğer hesabı; hiçbiri yoksa seçili hesap kalır ve uyarı yazar (BIST hissesi TL mevduat hesabına düşmesin diye
   * kullanıcı görür; ayrı hesap için "Yeni hesap" kartı).
   */
  function adaySec(a) {
    hizli.aday = a; hizli.uyari = '';
    if (!a) return;
    const acik = acikHesaplar();
    if (!acik.length) return;
    const o = hizli.alan || (hizli.alan = {});
    const tur = beklenenHesapTuru(a);
    const uyar = (h) => h.para === a.para && h.hesapTuru === tur;
    const secili = acik.find(h => h.id === (o.hesap || hizli.sonHesap));
    const hedef = (secili && uyar(secili) ? secili : acik.find(uyar))
      || acik.find(h => h.para === a.para && ['abd-araci', 'bist-araci', 'diger'].includes(h.hesapTuru));
    if (hedef) o.hesap = hedef.id;
    else hizli.uyari = `Bu hisseye uyan hesabın (${a.para}, ${/\.IS$/.test(a.kod) ? 'BIST aracı kurumu' : 'aracı kurum'}) yok: seçili hesaba eklenir. Ayrı hesapta tutmak istersen önce "Yeni hesap" kartından aç.`;
  }
  /** 67.4: sekmeye uyan hesap önerisi (fon → TEFAS / BIST / TRY, kripto → Binance, altın → fiziki altın / TRY); yoksa seçim değişmez. */
  function sekmeHesabi(sekme) {
    const acik = acikHesaplar();
    const ilk = (...f) => { for (const g of f) { const h = acik.find(g); if (h) return h.id; } return null; };
    if (sekme === 'fon') return ilk(h => h.hesapTuru === 'tefas', h => h.hesapTuru === 'bist-araci', h => h.para === 'TRY');
    if (sekme === 'kripto') return ilk(h => h.hesapTuru === 'binance');
    if (sekme === 'altin') return ilk(h => h.hesapTuru === 'altin', h => h.para === 'TRY' && h.hesapTuru !== 'tr-banka');
    return null;
  }
  /** Katlı bölümü aç ve oraya kaydır (üst düğmeler, boş durum). */
  function katAc(id) { const x = bul(id); if (x) { if ('open' in x) x.open = true; if (x.scrollIntoView) x.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }

  function hizliCiz() {
    const k = bul('pmHizli');
    if (!k || !veri) return;
    const o = hizli.alan || (hizli.alan = {});
    const hesaplar = hesapSecenekleri(true);
    const bas = baslik('plus-circle', 'Varlık ekle');
    if (!hesaplar.length) {
      doldur(k, [bas, el('p', { class: 'hint mb-0', id: 'pmHHesapYok', text: 'Önce bir hesap aç: varlık her zaman bir hesabın içinde durur. "Yeni hesap" kartında kurumu ve hesap adını yaz, sonra buraya dön.' }),
        el('div', { class: 'pf-dugmeler mt-2' }, [dugme('Yeni hesap aç', () => katAc('pmYeniHesapKat'), 'btn-primary', { id: 'btnPmHYeniHesapAc' })])]);
      return;
    }
    const s = hizli.sekme;
    const a = hizli.aday;
    const hesapSecili = [o.hesap, hizli.sonHesap].find(x => x && hesaplar.some(([id]) => id === x)) || null;
    const hesapHam = acikHesaplar().find(h => h.id === (hesapSecili || hesaplar[0][0])) || {};
    const hesapAlani = alan('Hesap', secici({ id: hizliAlanlar.hesap }, hesaplar, hesapSecili), 'Var olan hesaba eklenir. Yeni hesap için "Yeni hesap" kartı.');
    const sekmeler = el('div', { class: 'pm-sekmeler', role: 'group', 'aria-label': 'Varlık türü' }, VE_SEKME.map(([kk, ad]) => el('button', {
      type: 'button', id: 'btnPmHSekme-' + kk, class: `btn btn-xs ${s === kk ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': s === kk ? 'true' : 'false',
      onclick: () => { hizliOku(); hizli.sekme = kk; hizli.hata = ''; const h = sekmeHesabi(kk); if (h) o.hesap = h; hizliCiz(); }
    }, [el('span', { text: ad })])));
    const tarihAlani = alan(s === 'nakit' ? 'Bakiye tarihi' : 'Alış tarihi', girdi({ id: hizliAlanlar.tarih, type: 'date', max: bugun() }, o.tarih || dun()),
      s === 'nakit' ? 'Bu günün SONUNDAKİ bakiye (varsayılan dün); sonraki para giriş/çıkışı hesap kartındaki "+ işlem"den.' : 'Getiri bu günden ölçülür. Birkaç kez aldıysan ilk alış günü (varsayılan dün).');
    const adet = (etiket) => alan(etiket, girdi({ id: hizliAlanlar.adet, type: 'text', inputmode: 'decimal', placeholder: '0' }, o.adet));
    const maliyet = (para, etiket) => alan(`${etiket || 'Ortalama alış fiyatı'}${para ? ` (${para})` : ''}`, girdi({ id: hizliAlanlar.maliyet, type: 'text', inputmode: 'decimal', placeholder: 'boş bırakılabilir' }, o.maliyet),
      'Girersen kâr/zarar hesaplanır. Sonra da ekleyebilirsin.');
    const kodAlani = (etiket, ph, ipucu) => alan(etiket, girdi({ id: hizliAlanlar.kod, type: 'text', maxlength: '15', autocomplete: 'off', placeholder: ph }, o.kod), ipucu);
    const paraAlani = () => alan('Para birimi', secici({ id: hizliAlanlar.para }, paraSecenekleri(), o.para || hesapHam.para || 'USD'));
    // 68.4: açılış kaydına isteğe bağlı not (67.4'te eski "Açılış bakiyesi" formuyla kaybolmuştu); İşlem defterinin Not sütununda görünür.
    const notAlani = alan('Not (isteğe bağlı)', girdi({ id: hizliAlanlar.not, type: 'text', maxlength: '500', autocomplete: 'off', placeholder: 'ör. eski hesaptan aktarıldı' }, o.not), 'Açılış kaydında saklanır; İşlem defterinde görünür.');
    let ust = [], alanlar = [], not = null;
    if (s === 'hisse') {
      const adayKutusu = hizli.bulunuyor ? el('p', { class: 'hint hint-sm mb-0', text: 'Aranıyor…' })
        : hizli.hata ? el('p', { class: 'tone-danger hint-sm mb-0', role: 'alert', text: hizli.hata })
        : a ? el('div', { class: `pf-uyari ${a.destek ? 'pf-uyari-uyari' : 'pf-uyari-bilgi'} pm-aday`, id: 'pmHAday' }, [
            el('strong', { text: `✓ ${a.sembol}` }), el('span', { text: ` — ${adayMetni(a)} · son fiyat ${paraBicim(a.fiyat, a.para, a.fiyat < 10 ? 4 : 2)}` }),
            a.destek ? el('div', { class: 'tone-warning', text: `Eklenemez: ${a.destek}` }) : null,
            hizli.uyari ? el('div', { class: 'tone-warning', id: 'pmHUyari', text: hizli.uyari }) : null,
            hizli.adaylar.filter(x => x !== a && !x.destek).length ? el('div', { class: 'pf-dugmeler mt-2' }, [el('span', { class: 'pf-kucuk', text: 'Başka bir şey mi kastettin?' })]
              .concat(hizli.adaylar.filter(x => x !== a && !x.destek).map(x => dugme(`${x.sembol} · ${x.borsa || x.para}`, () => { hizliOku(); adaySec(x); hizliCiz(); }, 'btn-secondary btn-xs')))) : null])
        : el('p', { class: 'hint hint-sm mb-0', text: 'Sembolü ya da şirket adını yaz, "Bul"a bas. BIST hisseleri için de kodu yazman yeter (ör. THYAO). ETF\'ler de burada (ör. QQQ, GLD).' });
      ust = [el('div', { class: 'pm-hizli-sembol' }, [
          alan('Sembol', girdi({ id: hizliAlanlar.sembol, type: 'text', maxlength: '40', autocomplete: 'off', placeholder: 'ör. TSLA, PYPL, THYAO',
            onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); sembolBul(); } } }, o.sembol)),
          yazmaDugme('Bul', () => sembolBul(), 'btn-secondary', { id: 'btnPmHBul' })
        ]), el('div', { class: 'mt-2 mb-3' }, [adayKutusu])];
      alanlar = [hesapAlani, adet('Adet'), maliyet(a && a.para), tarihAlani];
    } else if (s === 'fon') {
      alanlar = [kodAlani('Fon kodu', 'ör. AFT, TTE', 'TEFAS kodu. Fonun adı ve fiyat geçmişi TEFAS\'tan gelir (kod yanlışsa eklenmez).'), hesapAlani, adet('Pay adedi'), maliyet('TRY', 'Ortalama birim fiyat'), tarihAlani];
    } else if (s === 'kripto') {
      alanlar = [kodAlani('Coin', 'ör. BTC, ETH, SOL', 'Binance\'teki kodu (USDT çifti). Fiyat Binance\'ten (kod yanlışsa eklenmez).'), hesapAlani, adet('Adet'), maliyet('USD'), tarihAlani];
    } else if (s === 'altin') {
      alanlar = [hesapAlani, adet('Gram'), maliyet('TRY', 'Ortalama gram fiyatı'), tarihAlani];
      not = 'Fiyat: ons altın (Yahoo GC=F) × USD/TRY ÷ 31,1035 — fiziki gram altın. Altın fonu ya da ETF için Fon ya da Hisse / ETF sekmesi.';
    } else if (s === 'nakit') {
      alanlar = [hesapAlani, paraAlani(), alan('Tutar', girdi({ id: hizliAlanlar.tutar, type: 'text', inputmode: 'decimal', placeholder: '0' }, o.tutar), 'Hesaptaki nakit (bugün değil, tarihteki gün sonu).'), tarihAlani];
      not = 'Bir hesapta her para birimi için tek nakit bakiyesi girilir; sonrası para yatırma / çekme işlemidir. Vadeli mevduatsa hesap kartındaki "Vadeli mevduat" ile faizi işlet.';
    } else {
      alanlar = [alan('Sembol', girdi({ id: hizliAlanlar.eSembol, type: 'text', maxlength: '32', placeholder: 'ör. EUROBOND30, ARSA' }, o.eSembol)),
        alan('Ad', girdi({ id: hizliAlanlar.ad, type: 'text', maxlength: '120', placeholder: 'ör. 2030 vadeli Eurobond' }, o.ad)),
        alan('Sınıf', secici({ id: hizliAlanlar.sinif }, Object.entries((veri.sabitler && veri.sabitler.siniflar) || {}), o.sinif || 'diger')),
        paraAlani(), hesapAlani, adet('Adet'), maliyet(null, 'Birim maliyet'),
        alan('Güncel birim fiyat (isteğe bağlı)', girdi({ id: hizliAlanlar.fiyat, type: 'text', inputmode: 'decimal', placeholder: 'boş = sonra gir' }, o.fiyat), 'Bugünün fiyatı olarak kaydedilir; sonra hesap kartındaki "Fiyat gir" ile güncellersin.'),
        tarihAlani];
      not = 'Fiyat kaynağı olmayan varlık (tahvil, özel fon, gayrimenkul…): değeri senin girdiğin fiyattan hesaplanır.';
    }
    doldur(k, [
      bas,
      el('p', { class: 'hint hint-sm', text: 'Elinde ZATEN olan varlığı ve nakdi buraya gir (açılış bakiyesi). Bundan sonraki alış, satış, temettü ve para giriş/çıkışı hesap kartındaki "+ işlem" satırından.' }),
      sekmeler,
      ...ust,
      el('div', { class: 'pf-form-izgara mt-2' }, alanlar.concat([notAlani])),
      not ? el('p', { class: 'hint hint-sm mt-2 mb-0', text: not }) : null,
      s !== 'hisse' && hizli.hata ? el('p', { class: 'tone-danger hint-sm mt-2 mb-0', role: 'alert', text: hizli.hata }) : null,
      el('div', { class: 'pf-dugmeler mt-3' }, [yazmaDugme('Ekle', (e) => hizliEkle(e.currentTarget), 'btn-primary', { id: 'btnPmHEkle' })]),
      el('details', { class: 'hs-kat-mini mt-3', id: 'pmKuralKat' }, [el('summary', { text: 'Bu kayıt nasıl sayılır? (açılış kuralı)' }),
        el('div', { class: 'pf-uyari pf-uyari-bilgi mt-1', id: 'pmKuralKutusu' }, [el('strong', { text: 'Açılış kuralı:' }), el('span', { text: ' ' + (veri.kural || '') })])])
    ]);
  }

  async function sembolBul() {
    const o = hizliOku();
    const q = String(o.sembol || '').trim();
    if (!q) { hizli.hata = 'Önce sembolü yaz.'; hizliCiz(); return; }
    hizli.bulunuyor = true; hizli.hata = ''; hizli.aday = null; hizli.adaylar = [];
    hizliCiz();
    try {
      const r = await api().sembolBul(q);
      if (!r || !r.success) throw new Error((r && r.error) || 'yanıt yok');
      hizli.adaylar = r.adaylar || [];
      adaySec(hizli.adaylar.find(x => !x.destek) || hizli.adaylar[0] || null);
      if (!hizli.aday) hizli.hata = `"${q}" bulunamadı. Kodu kontrol et (ör. PayPal = PYPL) ya da şirket adını yaz.`;
    } catch (e) { hizli.hata = `Aranamadı: ${e.message}`; } finally { hizli.bulunuyor = false; hizliCiz(); }
  }

  /** 67.4 (saf): Varlık ekle sekmesi + okunan alanlar → POST /hizli-ekle gövdesi ve bildirimdeki ad ({ hata } yalnız hisse adayı yoksa). */
  function varlikGovdesi(sekme, o, aday) {
    const ortak = { hesap: o.hesap, tarih: o.tarih };
    if (String(o.not || '').trim()) ortak.not = String(o.not).trim();
    const ad_ = { adet: o.adet, birimMaliyet: o.maliyet };
    if (sekme === 'hisse') {
      if (!aday) return { hata: 'Önce sembolü bulun ("Bul").' };
      return { g: { ...ortak, ...ad_, aday }, ad: aday.sembol };
    }
    if (sekme === 'fon' || sekme === 'kripto') return { g: { ...ortak, ...ad_, kaynak: sekme === 'fon' ? 'tefas' : 'binance', kod: String(o.kod || '').trim().toUpperCase() }, ad: String(o.kod || '').trim().toUpperCase() };
    if (sekme === 'altin') return { g: { ...ortak, ...ad_, kaynak: 'altin' }, ad: 'Gram altın' };
    if (sekme === 'nakit') return { g: { ...ortak, kaynak: 'nakit', para: o.para, tutar: o.tutar }, ad: `${o.para} nakit` };
    return { g: { ...ortak, ...ad_, kaynak: 'elle', sembol: o.eSembol, ad: o.ad, sinif: o.sinif, para: o.para, fiyat: o.fiyat }, ad: String(o.eSembol || '').toUpperCase() };
  }

  async function hizliEkle(d) {
    const o = hizliOku();
    const a = hizli.aday;
    if (hizli.sekme === 'hisse' && a && a.destek) { AG.bildir(`Eklenemez: ${a.destek}`, 'hata'); return; }
    const v = varlikGovdesi(hizli.sekme, o, a);
    if (v.hata) { hizli.hata = v.hata; hizliCiz(); return; }
    AG.dom.mesgul(d, 'Ekleniyor…');
    try {
      const r = await soruluGonder((x) => api().hizliEkle(x), v.g);
      if (r === null) return;
      if (!r || !r.success) { AG.bildir(gizliMetin(`Eklenmedi: ${(r && r.error) || 'bilinmeyen hata'}`), 'hata', { sure: 12000 }); return; }
      hizli.sonHesap = o.hesap || hizli.sonHesap;
      hizli.alan = { hesap: hizli.sonHesap, para: o.para, sinif: o.sinif };
      hizli.aday = null; hizli.adaylar = []; hizli.hata = ''; hizli.uyari = '';
      AG.bildir(gizliMetin(`${v.ad} eklendi${r.fiyatHatasi ? ` — fiyat indirilemedi (${r.fiyatHatasi}); "Fiyatları yenile" ile tekrar dene` : ''}.`), r.fiyatHatasi ? 'uyari' : 'ok', { sure: 8000 });
      await yukle(true);
      const s = bul(hizli.sekme === 'hisse' ? hizliAlanlar.sembol : hizli.sekme === 'fon' || hizli.sekme === 'kripto' ? hizliAlanlar.kod : hizliAlanlar.adet); if (s && s.focus) s.focus();
    } catch (e) { AG.bildir(`Eklenmedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(d); }
  }

  /* ── 67.4 Yeni hesap: kurum ADIYLA (varsa o, yoksa arkada açılır) + hesap adı + tür + para birimi + isteğe bağlı vadeli mevduat.
   *    Tek istek POST /hesap {kurumAd, …} — ya hepsi ya hiçbiri. Hesap üst çubukta seçili portföye bağlanır ("Tümü" seçiliyse Ben). ── */
  const yeniHesapAlanlar = { kurum: 'inpPmYKurum', ad: 'inpPmYAd', tur: 'selPmYTur', para: 'selPmYPara' };
  const mevduatUygun = (tur, para) => tur === 'tr-banka' || tur === 'nakit' || para === 'TRY';
  function yeniHesapOku() { for (const [a, id] of Object.entries(yeniHesapAlanlar)) { const x = bul(id); if (x) yeniHesap[a] = String(x.value == null ? '' : x.value); } return yeniHesap; }
  function seciliPortfoy() {
    let g = null;
    try { g = AG.pages.pano && AG.pages.pano.gorunum ? AG.pages.pano.gorunum().portfoy : null; } catch (e) { g = null; }
    return g && g !== 'tumu' && ((veri && veri.portfoyler) || []).some(p => p.id === g) ? g : 'ben';
  }
  function yeniHesapCiz() {
    const k = bul('pmYeniHesap');
    if (!k || !veri) return;
    const y = yeniHesap, s = veri.sabitler || {};
    const pid = seciliPortfoy(), pAd = ((veri.portfoyler || []).find(p => p.id === pid) || {}).ad || 'Ben';
    const tur = y.tur || 'abd-araci', para = y.para || 'USD';
    const faizKat = el('details', { class: `hs-kat-mini mt-2${mevduatUygun(tur, para) ? '' : ' is-hidden'}`, id: 'pmYFaizKat' }, [
      el('summary', { text: 'Vadeli mevduat mı? Faiz bilgisi (isteğe bağlı)' }), faizAlanlari('PmY', null), el('p', { class: 'hint hint-sm mt-1 mb-0', text: FAIZ_CUMLE })]);
    const degis = () => { const x = bul(yeniHesapAlanlar.tur), z = bul(yeniHesapAlanlar.para); faizKat.classList.toggle('is-hidden', !mevduatUygun(x ? x.value : tur, z ? z.value : para)); };
    doldur(k, [
      baslik('landmark', 'Yeni hesap'),
      el('p', { class: 'hint hint-sm', text: `Aracı kurum, banka ya da borsa hesabı. Kurumu adıyla yaz — yoksa kendiliğinden eklenir. Hesap "${pAd}" portföyüne bağlanır (üst çubuktaki seçim; sonra Portföyler kartından değişir).` }),
      el('datalist', { id: 'dlPmKurumlar' }, (veri.kurumlar || []).map(x => el('option', { value: x.ad }))),
      el('div', { class: 'pf-form-izgara' }, [
        alan('Kurum', girdi({ id: yeniHesapAlanlar.kurum, type: 'text', maxlength: '120', list: 'dlPmKurumlar', placeholder: 'ör. Midas, Enpara' }, y.kurum), 'Daha önce yazdıysan listeden seç.'),
        alan('Hesap adı', girdi({ id: yeniHesapAlanlar.ad, type: 'text', maxlength: '120', placeholder: 'ör. ABD hisseleri, Vadeli TL' }, y.ad)),
        alan('Tür', secici({ id: yeniHesapAlanlar.tur, onchange: degis }, Object.entries(s.hesapTurleri || {}), tur)),
        alan('Para birimi', secici({ id: yeniHesapAlanlar.para, onchange: degis }, paraSecenekleri(), para), 'Hesabın ana birimi; mevduatta faiz bu birimde işler.')
      ]),
      faizKat,
      el('div', { class: 'pf-dugmeler mt-3' }, [yazmaDugme('Hesabı aç', (e) => yeniHesapAc(e.currentTarget), 'btn-primary', { id: 'btnPmYHesapAc' })])
    ]);
  }
  /** 67.4 (saf): Yeni hesap kartı → POST /hesap gövdesi (faiz yalnız mevduata uygun hesapta ve oran yazıldıysa). */
  function yeniHesapGovdesi(y, pid, faiz) {
    const g = { kurumAd: String(y.kurum || '').trim(), ad: String(y.ad || '').trim(), hesapTuru: y.tur || 'abd-araci', para: y.para || 'USD' };
    if (pid && pid !== 'ben' && pid !== 'tumu') g.portfoy = pid;
    if (faiz && String(faiz.oran || '').trim() && mevduatUygun(g.hesapTuru, g.para)) g.faiz = faiz;
    return g;
  }
  async function yeniHesapAc(d) {
    const y = yeniHesapOku();
    const g = yeniHesapGovdesi(y, seciliPortfoy(), faizGovdesi('PmY'));
    if (!g.kurumAd) { AG.bildir('Kurum adını yaz (ör. Midas, Enpara).', 'uyari'); return; }
    if (!g.ad) { AG.bildir('Hesap adını yaz (ör. ABD hisseleri).', 'uyari'); return; }
    AG.dom.mesgul(d, 'Açılıyor…');
    try {
      const r = await api().hesapEkle(g);
      if (!r || !r.success) { AG.bildir(`Hesap açılmadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 }); return; }
      const h = (r.eklenen || []).find(x => x.tur === 'hesap');
      yeniHesap = {};
      if (h) { hizli.sonHesap = h.id; hizli.alan = { ...(hizli.alan || {}), hesap: h.id }; }
      AG.bildir(`${h ? h.ad : 'Hesap'} açıldı${(r.eklenen || []).some(x => x.tur === 'kurum') ? ' (kurum da eklendi)' : ''}${g.faiz ? ' — vadeli mevduat ayarıyla' : ''}. Sıradaki adım: "Varlık ekle" ile içindekileri gir.`, 'ok', { sure: 9000 });
      await yukle(true);
      const yk = bul('pmYeniHesapKat'); if (yk) yk.open = false;
      katAc('pmHizliKat');
    } catch (e) { AG.bildir(`Hesap açılmadı: ${e.message}`, 'hata'); } finally { AG.dom.hazir(d); }
  }

  const hizliDuzenleKaydet = (d, acilis) => yazIstek(d, 'Kaydediliyor…', () => api().hizliDuzenle({ acilis, adet: deger('inpPmDuzAdet'), birimMaliyet: deger('inpPmDuzMaliyet'), tarih: deger('inpPmDuzTarih'), not: deger('inpPmDuzNot') }),
    () => { duzenlenen = null; return 'Güncellendi.'; });

  async function hizliKaldir(p, acilis) {
    const ok_ = await AG.onayla({ baslik: `${p.sembol} kaldırılsın mı?`, metin: `${p.hesapAd} hesabındaki ${p.sembol} kaydı iptal edilir. Kayıt silinmez; İşlem defterinde "iptal" olarak görünür.`, onay: 'Kaldır', tehlikeli: true });
    if (!ok_) return;
    const r = await api().iptal(acilis, 'hızlı kaldır');
    if (!r || !r.success) { AG.bildir(`Kaldırılamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
    AG.bildir(`${p.sembol} kaldırıldı.`, 'ok');
    yukle(true);
  }

  function formCiz() {
    const k = bul('pmForm');
    if (!k) return;
    const hesapVar = veri && (veri.hesaplar || []).some(h => h.durum === 'acik');
    if (!hesapVar) { doldur(k, [el('p', { class: 'hint mb-0', text: 'İşlem girmek için önce bir hesap gerekir: yukarıdaki "Yeni hesap" kartından aç.' })]); return; }
    // 67.4: açılış bakiyesi bu formda yok ("Varlık ekle"); test yardımcısı açılışı seçse bile transfer gösterilir.
    if (formTur === 'acilis') formTur = 'transfer';
    const alanlar = FORM_ALANLARI[formTur];
    const nakitSecilebilir = formTur === 'transfer';
    const gizle = (a) => nakitSecilebilir && ((formKalem === 'nakit' && ['varlik', 'adet', 'birimMaliyet'].includes(a)) || (formKalem !== 'nakit' && ['para', 'tutar', 'ulasanTutar'].includes(a)));
    const kontrol = (a) => {
      const id = 'inpPmF-' + a;
      if (a === 'hesap' || a === 'hedefHesap') return secici({ id }, hesapSecenekleri(true));
      if (a === 'varlik') return secici({ id }, varlikSecenekleri());
      if (a === 'para') return secici({ id }, paraSecenekleri());
      if (a === 'tarih') return girdi({ id, type: 'date', max: bugun() }, bugun());
      if (a === 'kalem') return secici({ id, onchange: (e) => { formKalem = e.target.value; formCiz(); } }, [['varlik', 'Varlık (adet)'], ['nakit', 'Nakit (tutar)']], formKalem);
      if (a === 'not') return girdi({ id, type: 'text', maxlength: '500', placeholder: 'isteğe bağlı' });
      return girdi({ id, type: 'text', inputmode: 'decimal', placeholder: a === 'birimMaliyet' ? 'boş = bilinmiyor' : '0' });
    };
    const ipucu = { tarih: null, birimMaliyet: 'Girilmezse ve açılış öncesi işlemler adedi tam açıklamıyorsa maliyet "bilinmiyor" olur.', fiyat: 'Varlığın kendi para biriminde.', tutar: formTur === 'transfer' ? 'Gönderilen tutar (kaynak hesaptan çıkan).' : 'Seçili para biriminde (temettüde varlığın biriminde).', ulasanTutar: 'Hedef hesaba ulaşan (masraf/kur farkı düşülmüş). Boş = gönderilenle aynı; fark portföyden masraf olarak düşer.', oran: '0,5 = 2 pay 1 pay olur (birleşme).' };
    doldur(k, [
      el('p', { class: 'hint hint-sm', text: 'Alış, satış, temettü, para yatırma ve çekme hesap kartındaki "+ işlem" satırında; elinde zaten olan varlık "Varlık ekle"de. Burada kalan hareketler: hesaplar arası transfer, faiz, ücret / gider, bölünme (ve gerekirse alış, satış, temettü, para giriş/çıkışı).' }),
      el('div', { class: 'pf-form-izgara' }, [alan('İşlem türü', secici({ id: 'selPmFTur', onchange: (e) => { formTur = e.target.value; formCiz(); } }, FORM_TURLERI(), formTur))]
        .concat(alanlar.filter(a => !gizle(a)).map(a => alan(ALAN_ETIKET[a] || a, kontrol(a), ipucu[a])))),
      el('details', { class: 'pm-gun-sira-kat mt-3', id: 'pmGunSiraKat' }, [
          el('summary', { text: 'Aynı gün sırası (isteğe bağlı)' }),
          el('div', { class: 'pf-form-izgara mt-2' }, [alan('Sıra (0–999, küçük önce)', girdi({ id: 'inpPmF-gunIciSira', type: 'text', inputmode: 'numeric', placeholder: 'boş = varsayılan' }),
            'Aynı gün birden çok işlem varsa hangisinin önce yapıldığını belirtir. Boş: önce para girişleri, sonra alış, transfer, satış. Satışın parasıyla aynı gün alım yaptıysanız satışa 100, alışa 300 yazın.')])
        ]),
      el('div', { class: 'pf-dugmeler mt-3' }, [yazmaDugme('Kaydet', (e) => islemKaydet(e.currentTarget), 'btn-primary', { id: 'btnPmIslemKaydet' }),
        el('span', { class: 'hint hint-sm mb-0', text: 'Kayıt silinmez; yanlışsa defterde "İptal et" (ters kayıt) ve doğrusunu girin.' })])
    ]);
  }

  function formOku() {
    const d = {};
    for (const a of FORM_ALANLARI[formTur]) { const x = bul('inpPmF-' + a); if (x) d[a] = x.value; }
    const gs = bul('inpPmF-gunIciSira'); if (gs) d.gunIciSira = gs.value;
    return formGovdesi(formTur, d, formKalem);
  }

  /**
   * İşlemi gönderir; sunucu 409 + soru dönerse sorar ve cevabıyla yeniden gönderir. İPTAL = İPTAL: Vazgeç, Esc ya da pencereyi
   * kapatmak HİÇBİR kayıt yazmaz (null döner); yalnız açıkça seçilen düğme kaydeder.
   *   acilis-gunu    "Açılıştan SONRA yapıldı" (acilisSonrasi: true) | "Açılışa DAHİL" (acilisSonrasi: false) | Vazgeç
   *   nakit-acilisi  "Nakit açılışı ekle ve kaydet" (nakitAcilisiEkle) | "Nakit açılışı olmadan kaydet" (onay) | Vazgeç
   *   acilis-tasarimci  (sonradan girilen açılış; o gün Tasarımcı kaydı var) "Açılıştan SONRA yapıldı" | "Açılışa DAHİL" | Vazgeç
   */
  async function soruluGonder(gonderF, g) {
    let govde = { ...g };
    let r = await gonderF(govde);
    for (let tur = 0; tur < 3 && r && r.soru; tur++) {
      if (r.soru === 'acilis-gunu') {
        const c = await AG.onayla({ baslik: 'Açılış günündeki işlem', metin: gizliMetin(r.error), iptal: 'Vazgeç (kaydetme)',
          secenekler: [{ deger: 'sonra', metin: 'Açılıştan SONRA yapıldı', birincil: true }, { deger: 'dahil', metin: 'Açılışa DAHİL (bakiye değişmez)' }] });
        if (c !== 'sonra' && c !== 'dahil') return null;
        govde = { ...govde, acilisSonrasi: c === 'sonra' };
      } else if (r.soru === 'acilis-tasarimci') {
        const c = await AG.onayla({ baslik: 'Bu günün Tasarımcı kayıtları', metin: gizliMetin(r.error), iptal: 'Vazgeç (kaydetme)',
          secenekler: [{ deger: 'sonra', metin: 'Açılıştan SONRA yapıldı', birincil: true }, { deger: 'dahil', metin: 'Açılışa DAHİL (bakiye değişmez)' }] });
        if (c !== 'sonra' && c !== 'dahil') return null;
        govde = { ...govde, tasarimciKayitlari: c };
      } else if (r.soru === 'nakit-acilisi') {
        const oneri = r.oneri || {};
        const c = await AG.onayla({ baslik: 'Nakit açılışı eksik', iptal: 'Vazgeç (kaydetme)',
          metin: gizliMetin(r.error) + `. "Ekle ve kaydet": ${oneri.tarih} tarihli 0 ${oneri.para} nakit açılışı da eklenir (tutarı sonra düzeltebilirsiniz). "Olmadan kaydet": nakit bacağı bakiyeye yazılır (nakit eksiye düşebilir).`,
          secenekler: [{ deger: 'ekle', metin: 'Nakit açılışı ekle ve kaydet', birincil: true }, { deger: 'olmadan', metin: 'Nakit açılışı olmadan kaydet' }] });
        if (c === 'ekle') govde = { ...govde, nakitAcilisiEkle: oneri };
        else if (c === 'olmadan') govde = { ...govde, onay: true };
        else return null;
      } else break;
      r = await gonderF(govde);
    }
    return r;
  }
  /** POST /islem (form, hesap kartı "+ işlem"); 67.4: aynı soru döngüsü POST /hizli-ekle (Varlık ekle) için de kullanılır. */
  const islemGonder = (g) => soruluGonder((x) => api().islemEkle(x), g);

  async function islemKaydet(d) {
    const g = formOku();
    AG.dom.mesgul(d, 'Kaydediliyor…');
    try {
      const r = await islemGonder(g);
      if (r === null) return;
      if (!r || !r.success) { AG.bildir(gizliMetin(`Kaydedilmedi: ${(r && r.error) || 'bilinmeyen hata'}`), 'hata', { sure: 12000 }); return; }
      AG.bildir(gizliMetin(`${ISLEM_AD[g.islem]} kaydedildi (${r.eklenen[r.eklenen.length - 1].id}).${r.uyarilar && r.uyarilar.length ? ' Uyarı: ' + r.uyarilar.map(u => u.mesaj).join(' · ') : ''}`), r.uyarilar && r.uyarilar.length ? 'uyari' : 'ok', { sure: 9000 });
      for (const a of ['adet', 'fiyat', 'tutar', 'ulasanTutar', 'ucret', 'vergi', 'birimMaliyet', 'oran', 'not', 'gunIciSira']) { const x = bul('inpPmF-' + a); if (x) x.value = ''; }
      await yukle(true);
    } catch (e) { AG.bildir(`Kaydedilmedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(d); }
  }

  async function iptalEt(x) {
    const sonuc = await AG.onayla({ baslik: `${ISLEM_AD[x.islem]} (${x.tarih}) iptal edilsin mi?`, metin: `${gizliMetin(islemOzeti(x, varlikHaritasi()))}. Kayıt SİLİNMEZ: ters kayıt eklenir, işlem "iptal" görünür ve hesaplara katılmaz. Bu ters kayıt geri alınamaz (gerekirse işlemi yeniden girin).`,
      onay: 'Ters kayıt ekle', alanlar: [{ ad: 'neden', etiket: 'Neden (isteğe bağlı)', ipucu: 'ör. yanlış adet' }] });
    if (!sonuc) return;
    const r = await api().iptal(x.id, sonuc.neden || '');
    if (!r || !r.success) { AG.bildir(`İptal edilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 }); return; }
    AG.bildir('Ters kayıt eklendi; işlem iptal görünüyor.', 'ok');
    yukle(true);
  }

  /* ── CSV içe aktarım ────────────────────────────────────────────────── */
  function csvCiz() {
    const k = bul('pmCsv');
    if (!k) return;
    const metin = el('textarea', { id: 'txtPmCsv', class: 'form-control pf-not-metni pm-csv-metin', placeholder: 'tarih;islem;hesap;varlik;adet;fiyat;tutar;para;ucret;vergi;hedefHesap;oran;birimMaliyet;not\n2026-10-01;al;ABD hesabı;QQQ;2;600;;;1;;;;;', 'aria-label': 'CSV metni', spellcheck: 'false' });
    const dosya = el('input', { type: 'file', id: 'inpPmCsvDosya', accept: '.csv,text/csv', class: 'form-control control-sm', 'aria-label': 'CSV dosyası seç',
      onchange: (e) => { const f = e.target.files && e.target.files[0]; if (!f || !global.FileReader) return; const r = new global.FileReader(); r.onload = () => { metin.value = String(r.result || ''); }; r.readAsText(f, 'utf-8'); } });
    doldur(k, [
      el('p', { class: 'hint hint-sm', text: 'Sütunlar: tarih;islem;hesap;varlik;adet;fiyat;tutar;para;ucret;vergi;hedefHesap;oran;birimMaliyet;not (başlık satırı zorunlu, sıra serbest; ";" ya da "," ayraç). hesap = hesap adı ya da kimliği, varlik = sembol ya da kimlik. Önce önizleme: hiçbir şey yazılmaz; hata yoksa "İçe aktar" hepsini tek seferde ekler (biri bile hatalıysa hiçbiri).' }),
      el('div', { class: 'pf-dugmeler mb-2' }, [dosya]),
      metin,
      el('div', { class: 'pf-dugmeler mt-3' }, [yazmaDugme('Önizle', (e) => csvOnizle(e.currentTarget), 'btn-secondary', { id: 'btnPmCsvOnizle' }),
        yazmaDugme('İçe aktar', (e) => csvIceAktar(e.currentTarget), 'btn-primary', { id: 'btnPmCsvAktar', disabled: csvSonuc && csvSonuc.aktarilabilir ? null : 'disabled' })]),
      el('div', { id: 'pmCsvSonuc', class: 'mt-3' })
    ]);
    csvSonucCiz();
  }

  function csvSonucCiz() {
    const k = bul('pmCsvSonuc');
    if (!k) return;
    const r = csvSonuc;
    if (!r) { doldur(k, []); return; }
    const ust = r.aktarilabilir
      ? el('div', { class: 'pf-uyari pf-uyari-bilgi', text: `${r.adet} satır hazır — hata yok. "İçe aktar" ile eklenir.${r.uyarilar.length ? ` Uyarı: ${r.uyarilar.map(u => u.mesaj).join(' · ')}` : ''}` })
      : el('div', { class: 'pf-uyari pf-uyari-kritik', text: `${r.satirHatasi} satırda hata${r.dosyaHatalari.length ? `, bütün dosya denetiminde ${r.dosyaHatalari.length} hata (${r.dosyaHatalari.map(h => h.mesaj).slice(0, 3).join(' · ')})` : ''} — hiçbir satır eklenmez.` });
    const ek = [];
    if (r.atlanan) ek.push(`${r.atlanan} iptal edilmiş satır (durum = iptal) atlanır`);
    if (r.mukerrer) ek.push(`${r.mukerrer} satır mükerrer olabilir (mevcut kayıtla ya da dosyadaki başka satırla aynı) — kontrol edin`);
    doldur(k, [ust, ek.length ? el('div', { class: 'pf-uyari pf-uyari-uyari mt-2', id: 'pmCsvMukerrer', text: ek.join(' · ') }) : null, r.bilinmeyenSutunlar && r.bilinmeyenSutunlar.length ? el('p', { class: 'hint hint-sm', text: `Tanınmayan sütunlar yok sayıldı: ${r.bilinmeyenSutunlar.join(', ')}` }) : null,
      AG.tablo.kutulu({ id: 'tblPmCsv', sinif: 'table-dense pf-tablo', basliklar: ['Satır', 'Tarih', 'Tür', 'Hesap', 'Varlık', 'Adet', 'Fiyat', 'Tutar', 'Durum'],
        satirlar: r.satirlar.slice(0, 200).map(s => el('tr', { class: s.hatalar.length ? 'row-bad' : (s.uyarilar || []).length ? 'pm-satir-uyari' : s.atla ? 'pm-iptal' : null }, [
          el('td', { class: 'sayi', text: String(s.no) }), el('td', { text: s.ham.tarih || '' }), el('td', { text: s.ham.islem || '' }), el('td', { class: 'pf-sola', text: s.ham.hesap || '' }),
          el('td', { text: s.ham.varlik || '' }), el('td', { class: 'sayi' }, [tutar(s.ham.adet || '')]), el('td', { class: 'sayi' }, [tutar(s.ham.fiyat || '')]), el('td', { class: 'sayi' }, [tutar(s.ham.tutar || '')]),
          el('td', { class: `pf-sola ${s.hatalar.length ? 'tone-danger' : (s.uyarilar || []).length || s.atla ? 'tone-warning' : 'tone-success'}`, text: s.hatalar.length ? s.hatalar.join(' · ') : s.atla ? s.atla : (s.uyarilar || []).length ? s.uyarilar.join(' · ') : 'tamam' })
        ])) })]);
  }

  async function csvOnizle(d) {
    const m = bul('txtPmCsv');
    if (!m || !m.value.trim()) { AG.bildir('CSV metni boş.', 'uyari'); return; }
    AG.dom.mesgul(d, 'Denetleniyor…');
    try {
      const r = await api().csvOnizle(m.value);
      if (!r || !r.success) { csvSonuc = null; AG.bildir(`Önizleme olmadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 10000 }); return; }
      csvSonuc = r;
      const b = bul('btnPmCsvAktar'); if (b) b.disabled = !r.aktarilabilir;
      csvSonucCiz();
    } catch (e) { AG.bildir(`Önizleme olmadı: ${e.message}`, 'hata'); } finally { AG.dom.hazir(d); const b = bul('btnPmCsvAktar'); if (b) b.disabled = !(csvSonuc && csvSonuc.aktarilabilir); }
  }

  async function csvIceAktar(d) {
    const m = bul('txtPmCsv');
    if (!csvSonuc || !csvSonuc.aktarilabilir || !m) return;
    const onay = await AG.onayla({ baslik: `${csvSonuc.adet} işlem içe aktarılsın mı?`, metin: 'Hepsi tek seferde eklenir (silinmez; yanlış satır ters kayıtla iptal edilir).', onay: 'İçe aktar' });
    if (!onay) return;
    AG.dom.mesgul(d, 'Aktarılıyor…');
    try {
      const r = await api().csvIceAktar(m.value);
      if (!r || !r.success) { AG.bildir(`İçe aktarılmadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 }); return; }
      AG.bildir(`${r.adet} işlem eklendi.`, 'ok');
      csvSonuc = null; m.value = '';
      await yukle(true);
    } catch (e) { AG.bildir(`İçe aktarılmadı: ${e.message}`, 'hata'); } finally { AG.dom.hazir(d); }
  }

  /* ── Hedef dağılım ──────────────────────────────────────────────────── */
  function hedefCiz() {
    const k = bul('pmHedef');
    if (!k || !veri) return;
    if (!hedefTaslak) hedefTaslak = hedefTaslagiKur(veri);
    const t = hedefTaslak;
    const den = hedefDenetle(t.satirlar);
    const dag = veri.dagilim && veri.dagilim.duzey === t.duzey ? new Map(veri.dagilim.dilimler.map(x => [x.anahtar, x.gercek])) : null;
    const satirlar = t.satirlar.map((s, i) => el('tr', null, [
      el('td', { class: 'pf-sola', text: s.ad }),
      el('td', { class: 'sayi', text: dag ? yuzde(dag.get(s.anahtar) || 0) : '—' }),
      el('td', null, [girdi({ type: 'text', inputmode: 'decimal', class: 'form-control control-sm pf-sayi-girdi', 'aria-label': `${s.ad} hedef yüzde`, placeholder: '0',
        oninput: (e) => { t.satirlar[i].yuzde = e.target.value; hedefToplamCiz(); } }, s.yuzde)])
    ]));
    doldur(k, [
      el('div', { class: 'pf-form-izgara' }, [
        alan('Düzey', secici({ id: 'selPmHedefDuzey', onchange: (e) => { hedefTaslak = hedefTaslagiKur(veri, e.target.value); hedefCiz(); } }, [['sinif', 'Varlık sınıfı'], ['varlik', 'Tek tek varlık']], t.duzey)),
        alan('Sapma bandı (± puan)', girdi({ id: 'inpPmHedefBant', type: 'text', inputmode: 'decimal', oninput: (e) => { t.bant = e.target.value; } }, String(t.bant)), 'Bu kadar puandan fazla sapan dilim turuncu görünür.')
      ]),
      AG.tablo.kutulu({ id: 'tblPmHedef', sinif: 'table-dense pf-tablo', basliklar: [t.duzey === 'sinif' ? 'Sınıf' : 'Varlık', 'Şu an', 'Hedef %'], satirlar }),
      el('p', { id: 'pmHedefToplam', class: `mt-2 mb-0 ${den.gecerli ? 'pf-toplam-iyi' : 'pf-toplam-kotu'}`, text: `Toplam %${den.toplam.toFixed(2).replace('.', ',')}${den.gecerli ? ' ✓' : ' — %100 olmalı'}` }),
      el('div', { class: 'pf-dugmeler mt-3' }, [
        yazmaDugme('Hedefi kaydet', (e) => hedefKaydet(e.currentTarget), 'btn-primary', { id: 'btnPmHedefKaydet' }),
        el('a', { class: 'btn btn-secondary no-underline', id: 'btnPmHedefBuAy', href: '#/portfoy/nasdaq', title: 'Model portföylerin hedefi model sekmelerinin altındaki Ayarlar › "Portföyüm hedefini güncelle" ile önizlenip kaydedilir (tek uygulama yeri)', text: 'Model hedefini al (model Ayarları)' }),
        t.kaynak && t.kaynak !== 'elle' ? el('span', { class: 'pf-kucuk', text: `Taslak kaynağı: ${t.kaynak}` }) : null
      ])
    ]);
  }

  function hedefToplamCiz() {
    const p = bul('pmHedefToplam');
    if (!p || !hedefTaslak) return;
    const den = hedefDenetle(hedefTaslak.satirlar);
    p.className = `mt-2 mb-0 ${den.gecerli ? 'pf-toplam-iyi' : 'pf-toplam-kotu'}`;
    p.textContent = `Toplam %${den.toplam.toFixed(2).replace('.', ',')}${den.gecerli ? ' ✓' : ' — %100 olmalı'}`;
  }

  async function hedefKaydet(d) {
    const t = hedefTaslak;
    const den = hedefDenetle(t.satirlar);
    if (!den.gecerli) { AG.bildir(den.hatalar.join(' · '), 'uyari'); return; }
    const agirliklar = {};
    for (const s of t.satirlar) { const n = Number(String(s.yuzde).replace(',', '.')); if (String(s.yuzde).trim() !== '' && n > 0) agirliklar[s.anahtar] = n; }
    AG.dom.mesgul(d, 'Kaydediliyor…');
    try {
      const r = await api().hedefKaydet({ duzey: t.duzey, agirliklar, bant: String(t.bant).replace(',', '.'), kaynak: t.kaynak || 'elle' });
      if (!r || !r.success) { AG.bildir(`Kaydedilmedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 10000 }); return; }
      AG.bildir('Hedef dağılım kaydedildi (eskisi geçmişte durur).', 'ok');
      hedefTaslak = null;
      await yukle(true);
    } catch (e) { AG.bildir(`Kaydedilmedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(d); }
  }

  /* ── Gelişmiş (67.4): yalnız adlar (kurum / hesap / varlık) ve hesap kapatma. Kurum ve hesap ekleme "Yeni hesap" kartında,
   *    varlık ekleme "Varlık ekle"de (Diğer sekmesi = elle fiyatlı varlık), mevduat faizi ve elle fiyat hesap kartında. ── */
  function yonetimCiz() {
    const k = bul('pmYonetim');
    if (!k || !veri) return;
    const s = veri.sabitler || {};
    const kurumlar = veri.kurumlar || [], hesaplar = veri.hesaplar || [], varliklar = veri.varliklar || [];
    doldur(k, [
      el('p', { class: 'hint hint-sm', text: 'Yeni hesap (kurumuyla) "Yeni hesap" kartında, varlık "Varlık ekle"de açılır; vadeli mevduat faizi ve elle fiyat hesap kartında. Burada adlar ve Yahoo fiyat kodu değişir, hesap kapatılır.' }),
      el('h4', { class: 'pf-bolum-baslik', text: 'Kurumlar' }),
      kurumlar.length ? AG.tablo.kutulu({ id: 'tblPmKurumlar', sinif: 'table-dense pf-tablo', basliklar: ['Kurum', 'Kimlik', ''], satirlar: kurumlar.map(x => el('tr', null, [
        el('td', { class: 'pf-sola', text: x.ad }), el('td', { class: 'pf-kucuk', text: x.id }),
        el('td', null, [yazmaDugme('Adını değiştir', () => adDegistir('kurum', x), 'btn-secondary btn-xs')])])) }) : el('p', { class: 'hint hint-sm', text: 'Henüz kurum yok — "Yeni hesap" kartında kurum adını yazınca eklenir.' }),

      el('h4', { class: 'pf-bolum-baslik', text: 'Hesaplar' }),
      hesaplar.length ? AG.tablo.kutulu({ id: 'tblPmHesapYonet', sinif: 'table-dense pf-tablo', basliklar: ['Hesap', 'Kurum', 'Tür', 'Durum', 'Kimlik', ''], satirlar: hesaplar.map(h => el('tr', null, [
        el('td', { class: 'pf-sola', text: h.ad }), el('td', { class: 'pf-sola', text: (kurumlar.find(x => x.id === h.kurum) || {}).ad || h.kurum }),
        el('td', { class: 'pf-sola', text: (s.hesapTurleri || {})[h.hesapTuru] || h.hesapTuru }),
        el('td', { text: h.durum === 'kapali' ? `kapalı (${h.kapanis})` : 'açık' }), el('td', { class: 'pf-kucuk', text: h.id }),
        el('td', null, [el('div', { class: 'pf-dugmeler' }, [yazmaDugme('Adını değiştir', () => adDegistir('hesap', h), 'btn-secondary btn-xs'),
          h.durum === 'acik' ? yazmaDugme('Kapat', () => hesapKapat(h), 'btn-secondary btn-xs', { title: 'Silme değil: hesap kapalı işaretlenir, geçmiş korunur; kapanıştan sonra işlem girilemez' }) : null])])
      ])) }) : el('p', { class: 'hint hint-sm', text: 'Henüz hesap yok.' }),

      el('h4', { class: 'pf-bolum-baslik', text: 'Varlıklar' }),
      varliklar.length ? AG.tablo.kutulu({ id: 'tblPmVarlikYonet', sinif: 'table-dense pf-tablo', basliklar: ['Sembol', 'Ad', 'Sınıf', 'Para', 'Fiyat kaynağı', 'Kimlik', ''], satirlar: varliklar.map(v => el('tr', null, [
        el('td', { class: 'fw-semibold', text: v.sembol }), el('td', { class: 'pf-sola', text: v.ad }), el('td', { class: 'pf-sola', text: (s.siniflar || {})[v.sinif] || v.sinif }), el('td', { text: v.para }),
        el('td', { class: 'pf-sola', text: `${KAYNAK_AD[v.kaynak] || v.kaynak}${v.kod ? ' · ' + v.kod : ''}` }), el('td', { class: 'pf-kucuk', text: v.id }),
        el('td', null, [el('div', { class: 'pf-dugmeler' }, [yazmaDugme('Adını değiştir', () => adDegistir('varlik', v), 'btn-secondary btn-xs'),
          v.kaynak === 'yahoo' ? yazmaDugme('Fiyat kodunu değiştir', () => kodDegistir(v), 'btn-secondary btn-xs', { id: `btnPmKod-${v.id}`, title: 'Fiyatın çekildiği Yahoo sembolü (ör. THYAO.IS, QQQ)' }) : null])])
      ])) }) : el('p', { class: 'hint hint-sm mb-0', text: 'Henüz varlık yok.' })
    ]);
  }

  /* ── 64.2 Mevduat faizi: yıllık oran, vade, stopaj, başlangıç, yenile (sunucu lib/portfoyum/faiz.js). 67.4: TEK YER hesap kartı
   *    ("Vadeli mevduat" / ayar varsa özeti + Değiştir · Faizi durdur · Ayarı iptal et); Yeni hesap kartında aynı alanlar isteğe bağlı. ── */
  const FAIZ_ACIKLAMA = 'Faiz, her vade bitince hesabın ana para birimindeki nakde kendiliğinden eklenir (net = brüt − stopaj; işlem defterinde "otomatik" yazar). Hesap: anapara × yıllık oran × vade günü ÷ 365; anapara, vade boyunca hesaptaki en düşük nakittir (vade ortasında yatırılan para o vadede faiz almaz). Yalnız biten vadeler eklenir, ileriye faiz yazılmaz. Bir otomatik faizi defterde "İptal et" ile silerseniz bir daha eklenmez.';
  const FAIZ_CUMLE = 'Bu oranla her vade sonunda faiz kendiliğinden deftere işlenir; Pano\'daki değer buna göre artar. Oranı değiştirirsen yeni oran o günden başlar.';
  /** Faiz alanları (on: kimliklerin ortası — inp<on>FaizOran …). degistir: var olan ayarın yeni oranı (başlangıç = yeni oranın günü). */
  function faizAlanlari(on, a, degistir) {
    const yenile = el('input', { id: `chk${on}Yenile`, type: 'checkbox' });
    if (!a || a.yenile !== false) yenile.checked = true;
    return el('div', { class: 'pf-form-izgara mt-1' }, [
      alan('Yıllık faiz oranı (%)', girdi({ id: `inp${on}FaizOran`, type: 'text', inputmode: 'decimal', placeholder: 'ör. 42,5' }, a && a.oran > 0 ? String(a.oran).replace('.', ',') : ''), 'Bankanın yazdığı yıllık BRÜT oran.'),
      alan('Vade (gün)', girdi({ id: `inp${on}VadeGun`, type: 'text', inputmode: 'numeric', placeholder: 'ör. 32' }, a ? String(a.vadeGun) : ''), 'Mevduatın kaç günlük bağlandığı.'),
      alan('Stopaj (%)', girdi({ id: `inp${on}Stopaj`, type: 'text', inputmode: 'decimal', placeholder: 'ör. 15' }, a ? String(a.stopaj).replace('.', ',') : ''), 'Faizden kesilen vergi oranı (dekontta yazar). Boş = 0.'),
      alan(degistir ? 'Yeni oranın başladığı gün' : 'Vade başlangıcı', girdi({ id: `inp${on}VadeBas`, type: 'date', max: bugun() }, a && a.vadeBaslangic ? a.vadeBaslangic : bugun()),
        degistir ? 'Eski ayar bu gün biter, yenisi başlar. Eskisinin başlangıç gününü yazarsan eskisini düzeltirsin.' : 'İlk vadenin başladığı gün.'),
      el('label', { class: 'check-label pf-alan' }, [yenile, el('span', { text: 'Vade sonunda yenile' }),
        el('small', { class: 'hint hint-sm mb-0', text: 'İşaretliyse vade bitince para faiziyle birlikte yeniden bağlanır (faiz faize işler). İşaretsizse yalnız ilk vadenin faizi eklenir.' })])
    ]);
  }
  const faizGovdesi = (on) => { const c = bul(`chk${on}Yenile`); return { oran: deger(`inp${on}FaizOran`), vadeGun: deger(`inp${on}VadeGun`), stopaj: deger(`inp${on}Stopaj`), vadeBaslangic: deger(`inp${on}VadeBas`), yenile: !!(c && c.checked) }; };
  /** 67.4: mevduata uygun hesap — banka / nakit türü ya da TRY (ya da zaten faiz ayarı olan). */
  const mevduatHesabiMi = (hh) => !!(hh && (hh.faiz || hh.hesapTuru === 'tr-banka' || hh.hesapTuru === 'nakit' || hh.para === 'TRY'));
  /**
   * 67.4 hesap kartının "Vadeli mevduat" bölümü: ayar varsa özeti (oran, vade, stopaj, başlangıç, yenile, sıradaki faiz, eklenen vade,
   * uyarılar — eski Gelişmiş faiz tablosunun bütün bilgisi) + Değiştir · Faizi durdur · Ayarı iptal et; yoksa "Vadeli mevduat" düğmesi.
   * Düğmeye basınca satır içi form (faizAlanlari) ve tek net cümle (FAIZ_CUMLE).
   */
  function mevduatBolumu(h, hh) {
    if (!mevduatHesabiMi(hh)) return null;
    const f = hh.faiz, kapali = h.durum === 'kapali';
    if (kapali && !f) return null;
    const yz = (x) => String(x).replace('.', ',');
    const id = (x) => `${x}-${h.id}`;
    const on = 'PmHF-' + h.id;
    const ozet = f ? el('div', { class: `pm-mevduat-ozet${(hh.faizUyarilari || []).length ? ' pm-satir-uyari' : ''}`, id: `pmHesapFaiz-${h.id}` }, [
      el('span', { class: 'pf-kucuk', text: f.oran > 0
        ? `Vadeli mevduat: yıllık %${yz(f.oran)} · ${f.vadeGun} gün · stopaj %${yz(f.stopaj)} · başlangıç ${f.vadeBaslangic} · ${f.yenile ? 'vade sonunda yenilenir' : 'yenilenmez'} · sıradaki faiz ${hh.faizSiradaki ? hh.faizSiradaki.son : '—'} · eklenen ${hh.otoFaizSayisi || 0} vade (otomatik)`
        : `Vadeli mevduat faizi durduruldu (${f.vadeBaslangic}) · eklenen ${hh.otoFaizSayisi || 0} vade` }),
      ...(hh.faizUyarilari || []).map(m => el('div', { class: 'pf-kucuk tone-warning', text: m }))
    ]) : null;
    const dugmeler = kapali || faizAcik === h.id ? null : el('div', { class: 'pf-dugmeler pm-yazma' }, f ? [
      yazmaDugme('Değiştir', () => { faizAcik = h.id; hesapKartlariCiz(); }, 'btn-secondary btn-xs', { id: id('btnPmFaizDegistir'), title: 'Yeni oran, vade ya da stopaj (yeni ayar seçtiğin günden başlar)' }),
      f.oran > 0 ? yazmaDugme('Faizi durdur', () => faizDurdur(hh), 'btn-secondary btn-xs', { title: 'Bugünden sonra faiz işlemez; eklenmiş faizler kalır' }) : null,
      yazmaDugme('Ayarı iptal et', () => faizAyarIptal(hh), 'btn-secondary btn-xs', { id: id('btnPmFaizIptal'), title: 'Bu ayar kaydı ters kayıtla iptal edilir; ondan gelen otomatik faizler kalkar (önceki ayar varsa o geçerli olur)' })
    ] : [yazmaDugme('Vadeli mevduat', () => { faizAcik = h.id; hesapKartlariCiz(); }, 'btn-secondary btn-xs', { id: id('btnPmMevduat'), title: 'Bu hesaptaki nakde vadeli mevduat faizi işlet' })]);
    const form = faizAcik === h.id && !kapali ? el('div', { class: 'pm-hf pm-yazma', id: id('pmFaizForm') }, [
      el('strong', { class: 'pm-form-baslik', text: f ? 'Vadeli mevduat — yeni ayar' : 'Vadeli mevduat' }),
      faizAlanlari(on, f ? { ...f, vadeBaslangic: bugun() } : null, !!f),
      el('p', { class: 'hint hint-sm mb-0', text: FAIZ_CUMLE }),
      el('details', { class: 'hs-kat-mini' }, [el('summary', { text: 'Faiz nasıl hesaplanır?' }), el('p', { class: 'hint hint-sm mt-1 mb-0', text: FAIZ_ACIKLAMA })]),
      el('div', { class: 'pf-dugmeler' }, [yazmaDugme('Kaydet', (e) => faizKaydet(h.id, e.currentTarget), 'btn-primary btn-xs', { id: id('btnPmFaizKaydet') }),
        dugme('Vazgeç', () => { faizAcik = null; hesapKartlariCiz(); }, 'btn-secondary btn-xs')])
    ]) : null;
    return el('div', { class: 'pm-mevduat', id: `pmMevduat-${h.id}` }, [ozet, dugmeler, form]);
  }
  /** Denetim 64.2: faiz ayarını geri al (ters kayıt). Onay sayfa içi pencerede (AG.onayla), tarayıcının onay kutusu değil. */
  async function faizAyarIptal(h) {
    const s = await AG.onayla({ baslik: `${h.ad}: faiz ayarı iptal edilsin mi?`,
      metin: `Geçerli ayar (yıllık %${String(h.faiz.oran).replace('.', ',')}, ${h.faiz.vadeGun} gün, başlangıç ${h.faiz.vadeBaslangic}) ters kayıtla iptal edilir. Bu ayardan eklenen otomatik faizler kalkar; daha önceki bir ayar varsa o yeniden geçerli olur. Daha erken başlangıçlı yeni ayarı bundan sonra girebilirsiniz.`,
      onay: 'Ayarı iptal et', alanlar: [{ ad: 'neden', etiket: 'Neden (isteğe bağlı)', ipucu: 'ör. başlangıç tarihi yanlış' }] });
    if (!s) return;
    const r = await api().iptal(h.faiz.id, s.neden || 'faiz ayarı iptal');
    if (!r || !r.success) { AG.bildir(`İptal edilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 }); return; }
    AG.bildir('Faiz ayarı iptal edildi.', 'ok');
    yukle(true);
  }

  const deger = (id) => { const x = bul(id); return x ? String(x.value || '').trim() : ''; };
  async function yazIstek(d, metin, f, basari) {
    AG.dom.mesgul(d, metin);
    try {
      const r = await f();
      if (!r || !r.success) { AG.bildir(`Kaydedilmedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 }); return false; }
      AG.bildir(basari(r), 'ok');
      await yukle(true);
      return true;
    } catch (e) { AG.bildir(`Kaydedilmedi: ${e.message}`, 'hata'); return false; } finally { AG.dom.hazir(d); }
  }
  const faizKaydet = (hid, d) => yazIstek(d, 'Kaydediliyor…', () => api().hesapFaiz(hid, faizGovdesi('PmHF-' + hid)), () => { faizAcik = null; return 'Vadeli mevduat ayarı kaydedildi; biten vadelerin faizi defterde "otomatik" görünür.'; });
  async function faizDurdur(h) {
    const s = await AG.onayla({ baslik: `${h.ad}: faiz durdurulsun mu?`, metin: 'Bugünden sonra bu hesaba faiz eklenmez (bitmemiş vadenin faizi de). Daha önce eklenmiş faizler kalır.', onay: 'Durdur' });
    if (!s) return;
    const r = await api().hesapFaiz(h.id, { oran: 0, vadeGun: h.faiz.vadeGun, stopaj: h.faiz.stopaj, vadeBaslangic: bugun(), yenile: false });
    if (!r || !r.success) { AG.bildir(`Durdurulamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 }); return; }
    AG.bildir('Faiz durduruldu.', 'ok');
    yukle(true);
  }
  /**
   * 67.4 elle fiyat (eski Gelişmiş "4. Elle fiyat" yerine): hesap kartındaki varlık satırında "Fiyat gir" (fiyat kaynağı elle, fiyatı
   * yok ya da bayat) ya da "⋯ › Fiyatı düzelt" → kartın altında satır içi form (tarih + birim fiyat; POST /fiyat aynen).
   */
  const elleFiyatGerek = (p, v) => (v && v.kaynak === 'elle') || p.fiyat == null || !!p.fiyatBayat;
  function fiyatFormu(p) {
    const fy = (veri.sabitler && veri.sabitler.bayatGun) || {};
    return el('div', { class: 'pm-hf pm-yazma', id: 'pmFiyatForm' }, [
      el('strong', { class: 'pm-form-baslik', text: `${p.sembol} — elle fiyat` }),
      el('div', { class: 'pm-hf-satir' }, [
        alan('Tarih', girdi({ id: 'inpPmFyTarih', type: 'date', max: bugun() }, bugun())),
        alan(`Birim fiyat (${p.para})`, girdi({ id: 'inpPmFyDeger', type: 'text', inputmode: 'decimal', placeholder: p.fiyat != null ? p.fiyat.toLocaleString('tr-TR', { maximumFractionDigits: p.fiyat < 10 ? 4 : 2, useGrouping: false }) : '0' })),
        yazmaDugme('Kaydet', (e) => elleFiyat(p, e.currentTarget), 'btn-primary', { id: 'btnPmFyKaydet' }),
        dugme('Vazgeç', () => { fiyatAcik = null; hesapKartlariCiz(); }, 'btn-secondary')
      ]),
      el('p', { class: 'hint hint-sm mb-0', text: `O günün fiyatı olarak kaydedilir ve o gün için kaynağın (Yahoo / TEFAS / Binance) fiyatından önce gelir; sonraki günlerde kaynak fiyatı yine kullanılır. Elle fiyat ${fy.elle || 31} günden eskiyse bayat sayılır.` })
    ]);
  }
  const elleFiyat = (p, d) => yazIstek(d, 'Kaydediliyor…', () => api().fiyatEkle({ varlik: p.varlik, tarih: deger('inpPmFyTarih'), fiyat: deger('inpPmFyDeger') }), () => { fiyatAcik = null; return `${p.sembol}: elle fiyat kaydedildi.`; });

  async function adDegistir(tur, x) {
    const s = await AG.onayla({ baslik: `${x.ad || x.sembol}: yeni ad`, metin: 'Yalnız görünen ad değişir; kimlik ve geçmiş kayıtlar aynı kalır.', onay: 'Kaydet',
      alanlar: [{ ad: 'ad', etiket: 'Yeni ad', dogrula: (v) => v.trim().length > 0 && v.trim().length <= 120 }] });
    if (!s) return;
    const f = tur === 'kurum' ? api().kurumAd(x.id, s.ad) : tur === 'hesap' ? api().hesapAd(x.id, s.ad) : api().varlikGuncelle(x.id, { ad: s.ad });
    const r = await f;
    if (!r || !r.success) { AG.bildir(`Değiştirilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
    AG.bildir('Ad değiştirildi.', 'ok');
    yukle(true);
  }

  /** 68.4: Yahoo fiyat kodunu (sembol değil) değiştir — PUT /varlik/:id {kod}; sunucu kodu Yahoo'da doğrular, para birimi aynı olmalı. */
  const yahooKodGecerli = (v) => /^[A-Z0-9.^=\-]{1,24}$/.test(String(v || '').trim().toUpperCase());
  async function kodDegistir(v) {
    const s = await AG.onayla({ baslik: `${v.sembol}: Yahoo fiyat kodu`, metin: `Fiyat bu koddan çekilir (şu an ${v.kod || v.sembol}). Kaydetmeden önce Yahoo'da denetlenir; para birimi (${v.para}) aynı olmalı. Görünen sembol, işlemler ve geçmiş aynı kalır; fiyat geçmişi yeni koddan yeniden indirilir.`,
      onay: 'Kaydet', alanlar: [{ ad: 'kod', etiket: 'Yahoo kodu (ör. THYAO.IS, QQQ, GC=F)', deger: v.kod || v.sembol, dogrula: yahooKodGecerli }] });
    if (!s) return;
    const kod = s.kod.trim().toUpperCase();
    if (kod === String(v.kod || '').toUpperCase()) { AG.bildir('Kod aynı — değişiklik yok.', 'bilgi'); return; }
    try {
      const r = await api().varlikGuncelle(v.id, { kod });
      if (!r || !r.success) { AG.bildir(`Değiştirilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 }); return; }
      AG.bildir(`${v.sembol}: fiyat kodu ${kod}${r.fiyatHatasi ? ` — fiyat geçmişi indirilemedi (${r.fiyatHatasi}); "Fiyatları yenile" ile tekrar dene` : ''}.`, r.fiyatHatasi ? 'uyari' : 'ok', { sure: 9000 });
      yukle(true);
    } catch (e) { AG.bildir(`Değiştirilemedi: ${e.message}`, 'hata'); }
  }

  async function hesapKapat(h) {
    const s = await AG.onayla({ baslik: `${h.ad} kapatılsın mı?`, metin: 'Hesap SİLİNMEZ: "kapalı" işaretlenir, geçmişi ekranda kalır; kapanış tarihinden sonra işlem girilemez. Bakiyesi varsa önce transfer/çekme girin. Yanlışlıkla kapattıysanız kapanış kaydı ters kayıtla iptal edilebilir (kimlik CSV/denetimde görünür).',
      onay: 'Kapat', tehlikeli: true, alanlar: [{ ad: 'tarih', etiket: 'Kapanış tarihi (YYYY-AA-GG)', ipucu: bugun(), dogrula: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) }] });
    if (!s) return;
    const r = await api().hesapKapat(h.id, s.tarih.trim());
    if (!r || !r.success) { AG.bildir(`Kapatılamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 }); return; }
    AG.bildir(`${h.ad} kapatıldı (${r.eklenen[0].id}).`, 'ok');
    yukle(true);
  }

  async function fiyatYenile(d) {
    AG.dom.mesgul(d, 'Yenileniyor…');
    try {
      const r = await api().fiyatYenile();
      if (!r || !r.success) { AG.bildir(`Fiyatlar yenilenemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      const h = (r.hatalar || []).concat(r.kurHatalari || []);
      AG.bildir(`${(r.sonuclar || []).length} kalem yenilendi${h.length ? `; ${h.length} hata: ${h.slice(0, 3).join(' · ')}` : ''}.`, h.length ? 'uyari' : 'ok', { sure: 10000 });
      await yukle(true);
      if (AG.pages.kurCevirici && AG.pages.kurCevirici.yenile) AG.pages.kurCevirici.yenile();
    } catch (e) { AG.bildir(`Fiyatlar yenilenemedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(d); }
  }

  /** F6: gizleme üst çubuktan gelir — her çizimde yeniden okunur (seçim değişince pano.js sayfayı yeniden yükler). */
  function gizliUygula() { gizli = genelPara() === 'gizli'; for (const id of ['pmKok', 'pmKayitKok']) { const k = bul(id); if (k && k.classList) { k.classList.toggle('pm-gizli', gizli); k.classList.toggle('pm-salt-okunur', saltOkunur()); } } }
  /** Portföyüm → Kayıt sekmesi (isteğe bağlı bir bölüme kaydırır). */
  function kayitAc(kaydir) {
    const pf = AG.pages && AG.pages.portfoy;
    if (pf && pf.altSekme) pf.altSekme('hesaplar');
    if (kaydir) { const h = bul(kaydir); if (h && h.scrollIntoView) h.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  }

  /* ── 62.4 Portföyüm sayfası (model sayfasıyla aynı yapı) + özet şeridi + Hesaplarım kartları ───────────────
   * Kullanıcı (taslak 3): "şahsi portföyüm için Nasdaq Momentum 10 gibi bir sayfa; hesap ve varlık girince grafikler kendiliğinden;
   * grafiğe düğme — her hesabın performansı; kıyaslar QQQ, BIST 30, TL mevduat, dolar, TÜFE, BTC; para birimi düğmeyle".
   * Veri: /ozet (değerleme, getiri, dağılım) · /gecmis[?hesap=] (günlük USD/TL + TWR endeksi) · /kiyas?bas&birim (100 tabanlı) ·
   * /islemler (defter; alım ▲ satım ▼ işaretleri ve son işlemler). Model etiketleri: tasarımcı /oneri son karar listeleri. */
  const KIYAS_ANAHTAR = 'ag.portfoyum.kiyas';
  const KIYAS_AD = { qqq: 'QQQ al-tut', bist30: 'BIST 30', mevduat: 'TL mevduat', dolar: 'Dolar', tufe: 'Enflasyon (TÜFE)', btc: 'BTC al-tut' };
  const KIYAS_RENK = { qqq: 2, bist30: 5, mevduat: 3, dolar: 8, tufe: 4, btc: 6 };
  const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  let birim = genelPara() === 'tl' ? 'TL' : 'USD';   // F6: üst çubuk $ / ₺
  let kiyasSecili = (() => { try { const v = JSON.parse(oku(KIYAS_ANAHTAR) || 'null'); return Array.isArray(v) ? v.filter(x => x in KIYAS_AD) : ['qqq', 'mevduat']; } catch (e) { return ['qqq', 'mevduat']; } })();
  let grafikHesap = '';            // '' = tüm portföy
  let grafikKip = 'getiri';        // 'getiri' | 'deger'
  const hesapGecmis = new Map();   // hesap id → /gecmis?hesap yanıtı (null = yükleniyor)
  const kiyasVeri = new Map();     // `${bas}|${birim}` → /kiyas yanıtı (null = yükleniyor)
  let modelListe = null;           // { N10: Set, B10: Set } — tasarımcı son kararları
  const hf = {};                   // hesap id → satır içi işlem formu durumu
  let sonYukleme = 0;

  const PM_SIMGE = { USD: '$', TL: '₺' };
  const tutarB = (usd, tl, b = 0) => (birim === 'TL' ? paraBicim(tl, 'TRY', b) : paraBicim(usd, 'USD', b));
  const getiriB = () => ((veri && veri.getiri) || {})[birim === 'TL' ? 'TL' : 'USD'] || {};

  /** Saf: model etiketi (son karar listesine göre): QQQ → 837, Nasdaq M10 listesi → N10, BIST M10 listesi → B10. */
  function modelEtiketi(sembol, liste) {
    const s = String(sembol || '').toUpperCase().replace(/\.IS$/, '');
    if (s === 'QQQ') return '837';
    if (liste && liste.N10 && liste.N10.has(s)) return 'N10';
    if (liste && liste.B10 && liste.B10.has(s)) return 'B10';
    return null;
  }
  const etiketCip = (e) => (e ? el('span', { class: `pm-model-cip pm-model-${e.toLowerCase()}`, title: 'Bu varlık modelin son karar listesinde', text: e }) : el('span', { class: 'pf-kucuk tone-muted', text: '—' }));

  /** Saf: günlük endeks serisi [{ tarih, e }] → { yillar: [{ yil, aylar: [12 × oran|null], yil: oran }] } (ay sonu / önceki ay sonu − 1). */
  function aylikGetiri(seri, alan) {
    const sonDeger = new Map();
    let ilk = null;
    for (const x of seri || []) { const v = x[alan]; if (!sayiMi(v)) continue; if (!ilk) ilk = { ay: x.tarih.slice(0, 7), v }; sonDeger.set(x.tarih.slice(0, 7), v); }
    if (!ilk) return { yillar: [] };
    const aylar = [...sonDeger.keys()].sort();
    const out = new Map();
    let onceki = ilk.v;
    for (const a of aylar) {
      const v = sonDeger.get(a), y = a.slice(0, 4), m = Number(a.slice(5, 7)) - 1;
      if (!out.has(y)) out.set(y, { yil: y, aylar: Array(12).fill(null), bas: onceki });
      out.get(y).aylar[m] = onceki > 0 ? v / onceki - 1 : null;
      out.get(y).son = v;
      onceki = v;
    }
    return { yillar: [...out.values()].map(r => ({ yil: r.yil, aylar: r.aylar, toplam: r.bas > 0 ? r.son / r.bas - 1 : null })) };
  }

  /** Özet şeridi (Portföy'ün her sekmesinin üstünde): toplam · değer çizgisi · hedef → gerçek dağılım. */
  function ozetSeritCiz() {
    const k = bul('pfOzetSerit');
    if (!k) return;
    if (!veri || !veri.degerleme) { doldur(k, []); return; }
    const d = veri.degerleme, u = getiriB(), s = (gecmis && gecmis.seri) || [];
    const alan = birim === 'TL' ? 'tl' : 'usd';
    const nokta = s.filter(x => sayiMi(x[alan]));
    let cizgi = null;
    if (nokta.length > 1) {
      const W = 300, H = 56, enK = Math.min(...nokta.map(x => x[alan])), enB = Math.max(...nokta.map(x => x[alan]));
      const xs = (i) => (i / (nokta.length - 1)) * W, ys = (v) => (enB > enK ? H - 4 - ((v - enK) / (enB - enK)) * (H - 8) : H / 2);
      const p = nokta.map((x, i) => `${xs(i).toFixed(1)},${ys(x[alan]).toFixed(1)}`).join(' ');
      cizgi = AG.dom.svg('svg', { class: 'pm-serit-cizgi', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Portföy değeri' }, [
        AG.dom.svg('polygon', { class: 'pm-serit-alan', points: `0,${H} ${p} ${W},${H}` }), AG.dom.svg('polyline', { class: 'pm-serit-hat', points: p })]);
    }
    const dag = veri.dagilim || {}, dl = halkaDilimleri(dag);
    const enCok = dag.hedefVar ? dl.filter(x => sayiMi(x.sapma)).sort((a, b) => Math.abs(b.sapma) - Math.abs(a.sapma))[0] : null;
    const cubuk = (alan2) => { let x0 = 0; return AG.dom.svg('svg', { class: 'pm-dag-svg', viewBox: '0 0 100 6', preserveAspectRatio: 'none', role: 'img', 'aria-label': (alan2 === 'hedef' ? 'Hedef: ' : 'Gerçek: ') + dl.map(x => `${x.ad} ${yuzde(x[alan2] || 0, 0)}`).join(', ') }, dl.map((x, i) => {
      const w = Math.max(0, (x[alan2] || 0) * 100), r = AG.dom.svg('rect', { x: x0, y: 0, width: w, height: 6, class: `halka-renk-${i + 1}` }, [AG.dom.svg('title', { text: `${x.ad} ${yuzde(x[alan2] || 0, 0)}` })]); x0 += w; return r;
    })); };
    doldur(k, [
      el('div', { class: 'pm-serit-kutu' }, [
        el('div', { class: 'row-between gap-2' }, [el('span', { class: 'stat-title', text: 'Toplam portföyüm' })]),
        el('span', { class: 'pm-serit-toplam sayi' }, [tutar(tutarB(d.toplamUSD, d.toplamTL))]),
        el('span', { class: 'hint hint-sm mb-0' }, [el('span', { class: ton(u.ay), text: isaretliYuzde(u.ay) }), el('span', { text: ' bu ay · ' }), el('span', { class: ton(u.yil), text: isaretliYuzde(u.yil) }), el('span', { text: ' bu yıl' })])
      ]),
      el('div', { class: 'pm-serit-kutu pm-serit-grafik' }, [el('span', { class: 'stat-title', text: `Değer (${birim})` }), cizgi || el('span', { class: 'hint hint-sm mb-0', text: 'Grafik ikinci kayıt gününden sonra.' })]),
      el('div', { class: 'pm-serit-kutu' }, [
        el('span', { class: 'stat-title', text: dag.hedefVar ? 'Dağılım: hedef → gerçek' : 'Dağılım (gerçek)' }),
        dl.length ? (dag.hedefVar ? el('div', { class: 'pm-dag-ikili' }, [cubuk('hedef'), cubuk('gercek')]) : cubuk('gercek')) : el('span', { class: 'hint hint-sm mb-0', text: 'Henüz varlık yok.' }),
        el('span', { class: 'hint hint-sm mb-0', text: enCok && Math.abs(enCok.sapma) > 0.0005 ? `En büyük fark: ${enCok.ad} ${enCok.sapma > 0 ? '+' : '−'}${Math.abs(enCok.sapma * 100).toFixed(1).replace('.', ',')} puan` : dag.hedefVar ? 'Hedefe yakın.' : 'Hedef girilmedi (Portföy › Hedefim).' })
      ])
    ]);
    gizliUygula();
  }

  /** Portföyüm sayfası: başlık + sayılar + grafik + K/Z + varlıklar + dağılım + aylık + son işlemler. */
  function portfoyumCiz() {
    if (!veri) return;
    birim = genelPara() === 'tl' ? 'TL' : 'USD'; gizliUygula();
    ozetSeritCiz(); pmBaslikCiz(); ozetCiz(); grafikCiz(); kzCiz(); varliklarCiz(); dagilimCiz(); aylikCiz(); sonIslemlerCiz();
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  function pmBaslikCiz() {
    const k = bul('pmBaslik');
    if (!k || !veri) return;
    const d = veri.degerleme;
    const hesapSay = (d.hesaplar || []).filter(h => h.durum !== 'kapali').length, varlikSay = (d.pozisyonlar || []).filter(p => Math.abs(p.adet) > 1e-12).length;
    const ilk = (gecmis && gecmis.seri && gecmis.seri[0] && gecmis.seri[0].tarih) || null;
    doldur(k, [el('div', { class: 'mp-bas mp-r-ben' }, [
      el('div', { class: 'mp-simge', 'aria-hidden': 'true', text: 'BEN' }),
      el('div', { class: 'mp-bas-metin' }, [
        el('div', { class: 'row-inline row-wrap gap-2' }, [el('h3', { class: 'card-title m-0', text: 'Portföyüm' }), el('span', { class: 'badge badge-success', text: 'gerçek hesaplarım' })]),
        el('p', { class: 'hint mb-0', text: `${hesapSay} hesap · ${varlikSay} varlık${ilk ? ` · ilk kayıt ${ilk}` : ''}. Portföy › Hesaplar'a girdiğin hesap, varlık ve işlemlerden (geçmiş tarihli olanlar dahil) kendiliğinden hesaplanır.` })
      ])
    ])]);
  }

  /** Portföyüm grafiği: hesap seçici · Getiri/Değer · kıyas çipleri. */
  function grafikCiz() {
    const k = bul('pmGrafik');
    if (!k) return;
    const hesaplar = ((veri && veri.degerleme && veri.degerleme.hesaplar) || []).filter(h => h.durum !== 'kapali');
    const kaynak = grafikHesap ? hesapGecmis.get(grafikHesap) : gecmis;
    if (grafikHesap && kaynak === undefined) hesapGecmisYukle(grafikHesap);
    const s = (kaynak && kaynak.seri) || [];
    const dugmeler = el('div', { class: 'pf-dugmeler pm-hesap-sec', role: 'group', 'aria-label': 'Grafikte hesap' }, [['', 'Tüm portföy'], ...hesaplar.map(h => [h.id, h.ad])].map(([id, ad]) =>
      el('button', { type: 'button', class: `btn btn-xs ${grafikHesap === id ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': grafikHesap === id ? 'true' : 'false', 'data-hesap': id || 'tum',
        onclick: () => { grafikHesap = id; grafikCiz(); aylikCiz(); } }, [el('span', { text: ad })])));
    const kip = el('div', { class: 'pf-dugmeler', role: 'group', 'aria-label': 'Grafik türü' }, [['getiri', 'Getiri (başlangıç 100)'], ['deger', `Değer (${birim})`]].map(([a, t]) =>
      el('button', { type: 'button', id: `btnPmKip-${a}`, class: `btn btn-xs ${grafikKip === a ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': grafikKip === a ? 'true' : 'false', onclick: () => { grafikKip = a; grafikCiz(); } }, [el('span', { text: t })])));
    const cipler = grafikKip === 'getiri' ? el('div', { class: 'pm-kiyas-cipler', role: 'group', 'aria-label': 'Kıyaslar' }, Object.entries(KIYAS_AD).map(([a, t]) => {
      const acik = kiyasSecili.includes(a);
      return el('button', { type: 'button', id: `btnPmKiyas-${a}`, class: `pm-kiyas-cip grf-lj-r${KIYAS_RENK[a]}${acik ? ' is-active' : ''}`, 'aria-pressed': acik ? 'true' : 'false',
        onclick: () => { kiyasSecili = acik ? kiyasSecili.filter(x => x !== a) : [...kiyasSecili, a]; yaz(KIYAS_ANAHTAR, JSON.stringify(kiyasSecili)); grafikCiz(); ozetCiz(); } }, [el('span', { class: 'pm-kiyas-nokta', 'aria-hidden': 'true' }), el('span', { text: t })]);
    })) : null;
    const kap = el('div', { id: 'pmGrafikKap', class: `pm-grafik${gizli && grafikKip === 'deger' ? ' pm-tutar' : ''}` });
    const hAd = grafikHesap ? (hesaplar.find(h => h.id === grafikHesap) || {}).ad : 'Tüm portföy';
    doldur(k, [
      el('div', { class: 'row-between row-wrap gap-2 mb-2' }, [el('h4', { class: 'pf-bolum-baslik m-0', text: `${hAd} — ${grafikKip === 'getiri' ? 'getiri ve kıyaslar' : 'değer'}` }), kip]),
      dugmeler, cipler, kap,
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: !s.length ? (kaynak === null ? 'Yükleniyor…' : 'Henüz seri yok (en az bir açılış ya da işlem gerekir).')
        : grafikKip === 'getiri' ? `${s[0].tarih} → ${s[s.length - 1].tarih}. Getiri zaman ağırlıklıdır: para yatırma/çekme${grafikHesap ? ' ve hesaplar arası aktarım' : ''} getiriyi değiştirmez. Kıyaslar aynı günden 100 tabanlı, ${birim} cinsinden.`
          : `${s[0].tarih} → ${s[s.length - 1].tarih}. Para yatırma/çekme değer çizgisinde görünür.` })
    ]);
    if (s.length < 2 || !AG.grafik || !AG.grafik.ana) return;
    const eAlan = birim === 'TL' ? 'endeksTL' : 'endeksUSD', dAlan = birim === 'TL' ? 'tl' : 'usd';
    const e0 = s[0][eAlan] || 1;
    const seri = s.map(x => ({ t: x.t, v: grafikKip === 'getiri' ? x[eAlan] / e0 * 100 : x[dAlan] }));
    let kiyas = [];
    if (grafikKip === 'getiri' && kiyasSecili.length) {
      const kv = kiyasVeri.get(`${s[0].tarih}|${birim}`);
      if (kv === undefined) kiyasYukle(s[0].tarih, birim);
      if (kv && kv.seriler) kiyas = kv.seriler.filter(x => kiyasSecili.includes(x.kimlik) && x.noktalar.length > 1).map(x => ({ ad: x.ad, renk: KIYAS_RENK[x.kimlik], seri: x.noktalar.map(([t, v]) => ({ t, v })) }));
    }
    const islem = ((defter && defter.islemler) || []).filter(x => !x._iptal && (x.islem === 'al' || x.islem === 'sat') && (!grafikHesap || x.hesap === grafikHesap));
    const V = varlikHaritasi();
    AG.grafik.ana(kap, { ad: 'portfoyum', seri, kiyas, dusus: grafikKip === 'getiri', birim: grafikKip === 'getiri' ? '' : PM_SIMGE[birim],
      etiket: grafikKip === 'getiri' ? `${hAd} (başlangıç 100)` : `${hAd} değeri (${birim})`,
      isaretler: islem.map(x => ({ t: Date.parse(x.tarih + 'T12:00:00Z'), tur: x.islem, etiket: `${(V.get(x.varlik) || {}).sembol || ''} ${adetBicim(x.adet)}` })) });
  }

  async function hesapGecmisYukle(id) {
    if (hesapGecmis.has(id)) return;
    hesapGecmis.set(id, null);
    try { const r = await api().gecmis(id); hesapGecmis.set(id, r && r.success ? r : { seri: [] }); } catch (e) { hesapGecmis.set(id, { seri: [] }); }
    if (grafikHesap === id) { grafikCiz(); aylikCiz(); }
  }
  async function kiyasYukle(bas, b) {
    const a = `${bas}|${b}`;
    if (kiyasVeri.has(a)) return;
    kiyasVeri.set(a, null);
    try { const r = await api().kiyas(bas, b); kiyasVeri.set(a, r && r.success ? r : { seriler: [] }); } catch (e) { kiyasVeri.set(a, { seriler: [] }); }
    grafikCiz(); ozetCiz();
  }

  function kzCiz() {
    const k = bul('pmKz');
    if (!k || !veri) return;
    const l = (veri.degerleme.pozisyonlar || []).filter(p => Math.abs(p.adet) > 1e-12 && sayiMi(p.kzYuzde));
    const kap = el('div', { id: 'pmKzKap' });
    doldur(k, [el('h4', { class: 'pf-bolum-baslik', text: 'Varlık bazında kâr / zarar' }), kap, el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Ortalama alış fiyatına göre, varlığın kendi para biriminde. Alış fiyatı girilmeyen varlık görünmez.' })]);
    if (AG.grafik && AG.grafik.cubuk) AG.grafik.cubuk(kap, l.map(p => ({ ad: p.sembol, v: p.kzYuzde, alt: gizli ? null : paraBicim(p.kzOrt, p.para) })), { ad: 'Varlık kâr/zarar', bosMetin: 'Kâr/zarar için alış fiyatı girilmiş varlık yok.' });
  }

  /** Bütün hesapların varlıkları tek tabloda: hesap ve model etiketiyle (düğme yok — düzeltme Hesaplarım'da). */
  function varliklarCiz() {
    const k = bul('pmVarliklar');
    if (!k || !veri) return;
    const l = (veri.degerleme.pozisyonlar || []).filter(p => Math.abs(p.adet) > 1e-12).sort((a, b) => (b.degerUSD || 0) - (a.degerUSD || 0));
    const n = (veri.degerleme.nakitler || []).filter(x => Math.abs(x.tutar) > 1e-9);
    const bas = el('h4', { class: 'pf-bolum-baslik', text: 'Varlıklarım (bütün hesaplar)' });
    if (!l.length && !n.length) { doldur(k, [bas, el('p', { class: 'hint mb-0', text: 'Henüz varlık yok. Hesaplarını ve varlıklarını Portföy › Hesaplar\'da gir.' }), dugme('Hesaplar\'a git', () => kayitAc(), 'btn-primary', { id: 'btnPmKayitaGit' })]); return; }
    const satir = (p) => el('tr', { class: p.fiyatBayat ? 'pm-satir-uyari' : null }, [
      el('td', { class: 'pf-sola' }, [el('div', { class: 'fw-semibold', text: p.sembol }), el('div', { class: 'pf-kucuk', text: p.ad })]),
      el('td', { class: 'pf-sola pf-kucuk', text: p.hesapAd }),
      el('td', { class: 'pf-sola' }, [etiketCip(modelEtiketi(p.sembol, modelListe))]),
      el('td', { class: 'sayi', 'data-sira': String(p.degerUSD || 0) }, [tutar(paraBicim(p.deger, p.para)), p.para !== 'USD' ? el('div', { class: 'pf-kucuk' }, [tutar(paraBicim(p.degerUSD, 'USD', 0))]) : null]),
      el('td', { class: `sayi ${ton(p.kzYuzde)}`, 'data-sira': String(p.kzYuzde || 0) }, [el('span', { text: p.kzYuzde != null ? isaretliYuzde(p.kzYuzde) : '—' })]),
      el('td', { class: 'sayi', 'data-sira': String(p.agirlik || 0), text: yuzde(p.agirlik) })
    ]);
    const nakitSatir = (x) => el('tr', null, [
      el('td', { class: 'pf-sola' }, [el('div', { class: 'fw-semibold', text: `${x.para} nakit` })]), el('td', { class: 'pf-sola pf-kucuk', text: x.hesapAd || hesapAdi(x.hesap) }), el('td', null),
      el('td', { class: `sayi${x.tutar < 0 ? ' tone-danger' : ''}` }, [tutar(paraBicim(x.tutar, x.para))]), el('td', { class: 'sayi', text: '—' }), el('td', { class: 'sayi', text: yuzde(x.agirlik) })
    ]);
    doldur(k, [bas, AG.tablo.kutulu({ id: 'tblPmVarliklar', sinif: 'table-dense pf-tablo', siralanabilir: 'portfoyum-varlik',
      basliklar: ['Varlık', 'Hesap', 'Model', 'Değer', 'Kâr / zarar', 'Pay'], satirlar: l.map(satir).concat(n.map(nakitSatir)) }),
    el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Model etiketi: varlık, o modelin son karar listesinde (837 = QQQ). Adet, alış fiyatı ve düzeltme: Portföy › Hesaplar.' })]);
  }

  function aylikCiz() {
    const k = bul('pmAylik');
    if (!k) return;
    const kaynak = grafikHesap ? hesapGecmis.get(grafikHesap) : gecmis;
    const a = aylikGetiri((kaynak && kaynak.seri) || [], birim === 'TL' ? 'endeksTL' : 'endeksUSD');
    const hAd = grafikHesap ? hesapAdi(grafikHesap) : 'Tüm portföy';
    if (!a.yillar.length) { doldur(k, [el('h4', { class: 'pf-bolum-baslik', text: 'Aylık getiri' }), el('p', { class: 'hint hint-sm mb-0', text: 'Henüz seri yok.' })]); return; }
    const hucre = (v) => el('td', { class: `sayi ${ton(v)}`, text: sayiMi(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1).replace('.', ',')}` : '' });
    doldur(k, [el('h4', { class: 'pf-bolum-baslik', text: `Aylık getiri — ${hAd} (%, ${birim})` }),
      AG.tablo.kutulu({ id: 'tblPmAylik', sinif: 'table-dense pf-tablo pm-aylik', basliklar: ['Yıl', ...AY_KISA, 'Yıl'],
        satirlar: a.yillar.map(y => el('tr', null, [el('td', { class: 'fw-semibold', text: y.yil }), ...y.aylar.map(hucre), (() => { const c = hucre(y.toplam); c.classList.add('fw-semibold'); return c; })()])) }),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Zaman ağırlıklı (para yatırma/çekme sayılmaz). İlk ay, ilk kayıt gününden başlar. Grafikte hesap seçince bu tablo da o hesaba geçer.' })]);
  }

  function sonIslemlerCiz() {
    const k = bul('pmSonIslemler');
    if (!k) return;
    const l = ((defter && defter.islemler) || []).filter(x => !x._iptal).slice(0, 30);
    const V = varlikHaritasi();
    doldur(k, l.length ? [AG.tablo.kutulu({ id: 'tblPmSonIslem', sinif: 'table-dense pf-tablo', basliklar: ['Tarih', 'İşlem', 'Hesap', 'Ayrıntı'],
      satirlar: l.map(x => el('tr', null, [el('td', { class: 'sayi', text: x.tarih }), el('td', { class: 'pf-sola', text: ISLEM_AD[x.islem] || x.islem }), el('td', { class: 'pf-sola pf-kucuk', text: hesapAdi(x.hesap) }), el('td', { class: 'pf-sola' }, [tutar(islemOzeti(x, V))])])) }),
    el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Son 30 işlem. Hepsi, süzgeç ve düzeltme: Portföy › İşlem defteri.' })] : [el('p', { class: 'hint hint-sm mb-0', text: 'Henüz işlem yok.' })]);
  }

  /** Hesaplarım: hesap başına kart — varlıklar (model etiketi, Düzenle/Kaldır ya da Sat) + satır içi "+ işlem" formu. */
  function hesapKartlariCiz() {
    const k = bul('pmHesapKartlari');
    if (!k || !veri) return;
    const d = veri.degerleme, ham = new Map((veri.hesaplar || []).map(h => [h.id, h]));
    const l = d.hesaplar || [];
    if (!l.length) { doldur(k, [el('p', { class: 'hint mb-0', text: 'Henüz hesap yok. Üstteki "Yeni hesap" ile ilk hesabını aç, sonra "Varlık ekle" ile içindekileri gir.' })]); return; }
    const acilislar = veri.acilislar || {};
    const V = varlikHaritasi();
    const tur = (veri.sabitler && veri.sabitler.hesapTurleri) || {};
    doldur(k, l.map(h => {
      const poz = (d.pozisyonlar || []).filter(p => p.hesap === h.id && Math.abs(p.adet) > 1e-12).sort((a, b) => (b.degerUSD || 0) - (a.degerUSD || 0));
      const nakit = (d.nakitler || []).filter(x => x.hesap === h.id && Math.abs(x.tutar) > 1e-9);
      const satir = (p) => {
        const a = acilislar[p.anahtar], yalniz = a && a.yalniz, duz = yalniz && duzenlenen === p.anahtar;
        const hucreGirdi = (id, deger, etiket) => girdi({ id, type: 'text', inputmode: 'decimal', class: 'form-control control-sm pf-sayi-girdi', 'aria-label': etiket }, deger);
        const eylem = duz
          ? el('div', { class: 'pf-dugmeler' }, [yazmaDugme('Kaydet', (e) => hizliDuzenleKaydet(e.currentTarget, a.id), 'btn-primary btn-xs', { id: 'btnPmDuzKaydet' }), dugme('Vazgeç', () => { duzenlenen = null; hesapKartlariCiz(); }, 'btn-secondary btn-xs')])
          : el('div', { class: 'pf-dugmeler' }, [
            yazmaDugme('Sat', () => { hf[h.id] = { ...(hf[h.id] || {}), tur: 'sat', varlik: p.varlik, adet: String(p.adet).replace('.', ','), fiyat: p.fiyat != null ? String(p.fiyat).replace('.', ',') : '' }; hesapFormCiz(h.id); const x = bul(`inpPmH-${h.id}-adet`); if (x && x.focus) x.focus(); }, 'btn-secondary btn-xs'),
            yalniz ? yazmaDugme('Düzenle', () => { duzenlenen = p.anahtar; hesapKartlariCiz(); }, 'btn-secondary btn-xs') : null,
            yalniz ? yazmaDugme('Kaldır', () => hizliKaldir(p, a.id), 'btn-secondary btn-xs') : null,
            // 67.4: elle fiyat satırda — gerekiyorsa "Fiyat gir" görünür; değilse "⋯" içinde "Fiyatı düzelt".
            elleFiyatGerek(p, V.get(p.varlik)) ? yazmaDugme('Fiyat gir', () => { fiyatAcik = p.anahtar; hesapKartlariCiz(); }, 'btn-primary btn-xs', { id: `btnPmFiyatGir-${p.hesap}-${p.varlik}`, title: 'Bu varlığın fiyatını elle gir (fiyat kaynağı yok ya da fiyat bayat)' })
              : el('details', { class: 'pm-satir-menu pm-yazma' }, [el('summary', { 'aria-label': `${p.sembol}: diğer eylemler`, title: 'Diğer', text: '⋯' }),
                yazmaDugme('Fiyatı düzelt', () => { fiyatAcik = p.anahtar; hesapKartlariCiz(); }, 'btn-secondary btn-xs', { id: `btnPmFiyatDuzelt-${p.hesap}-${p.varlik}` })])]);
        return el('tr', { class: p.fiyatBayat ? 'pm-satir-uyari' : null }, [
          el('td', { class: 'pf-sola' }, [el('div', { class: 'fw-semibold', text: p.sembol }), el('div', { class: 'pf-kucuk', text: p.ad }),
            // 67.2: alış tarihi (açılış kaydının tarihi; getiri buradan ölçülür) — düzenlemede değiştirilebilir.
            duz ? girdi({ id: 'inpPmDuzTarih', type: 'date', max: bugun(), class: 'form-control control-sm mt-1', 'aria-label': `${p.sembol} alış tarihi` }, p.acilis && p.acilis.tarih)
              : yalniz && p.acilis ? el('div', { class: 'pf-kucuk', text: `alış ${p.acilis.tarih}` }) : null,
            // 68.4: açılış notu — düzenlemede değişir (boş = silinir), değilse satırda soluk görünür.
            duz ? girdi({ id: 'inpPmDuzNot', type: 'text', maxlength: '500', class: 'form-control control-sm mt-1', placeholder: 'not (isteğe bağlı)', 'aria-label': `${p.sembol} açılış notu` }, p.acilis && p.acilis.not)
              : p.acilis && p.acilis.not ? el('div', { class: 'pf-kucuk tone-muted pm-acilis-not', text: p.acilis.not }) : null]),
          el('td', { class: 'pf-sola' }, [etiketCip(modelEtiketi(p.sembol, modelListe))]),
          el('td', { class: 'sayi' }, [duz ? hucreGirdi('inpPmDuzAdet', String(p.adet).replace('.', ','), `${p.sembol} adet`) : tutar(adetBicim(p.adet))]),
          el('td', { class: 'sayi' }, [duz ? hucreGirdi('inpPmDuzMaliyet', p.ortMaliyet != null ? String(p.ortMaliyet).replace('.', ',') : '', `${p.sembol} ortalama alış fiyatı`) : tutar(p.ortMaliyet != null ? paraBicim(p.ortMaliyet, p.para, p.ortMaliyet < 10 ? 4 : 2) : 'girilmedi')]),
          el('td', { class: 'sayi' }, [el('div', { text: paraBicim(p.fiyat, p.para, p.fiyat != null && p.fiyat < 10 ? 4 : 2) }), el('div', { class: `pf-kucuk${p.fiyatBayat ? ' tone-warning' : ''}`, text: p.fiyatTarih || 'fiyat yok' })]),
          el('td', { class: 'sayi' }, [tutar(paraBicim(p.deger, p.para))]),
          el('td', { class: `sayi ${ton(p.kzOrt)}` }, [tutar(p.kzOrt != null ? paraBicim(p.kzOrt, p.para) : '—'), el('div', { class: 'pf-kucuk', text: p.kzYuzde != null ? isaretliYuzde(p.kzYuzde) : '' })]),
          el('td', { class: 'pm-eylem' }, [eylem])
        ]);
      };
      const nakitSatir = (x) => el('tr', null, [el('td', { class: 'pf-sola fw-semibold', text: `${x.para} nakit` }), el('td', null), el('td', null), el('td', null), el('td', null),
        el('td', { class: `sayi${x.tutar < 0 ? ' tone-danger' : ''}` }, [tutar(paraBicim(x.tutar, x.para))]), el('td', null), el('td', null)]);
      const hh = ham.get(h.id) || {};
      return el('section', { class: `glass-panel panel-pad pm-hesap-kart${h.bayat ? ' pm-hesap-bayat' : ''}`, id: `pmHesap-${h.id}`, 'data-hesap': h.id }, [
        el('div', { class: 'row-between row-wrap gap-2' }, [
          el('div', null, [el('h4', { class: 'card-title m-0', text: h.ad }), el('span', { class: 'pf-kucuk', text: `${h.kurumAd || ''}${h.kurumAd ? ' · ' : ''}${tur[h.hesapTuru] || h.hesapTuru || ''}${hh.para ? ' · ' + hh.para : ''}` })]),
          el('div', { class: 'sayi fw-semibold' }, [tutar(tutarB(h.degerUSD, h.degerTL)), el('span', { class: 'pf-kucuk' }, [el('span', { text: ' · son kayıt ' }), el('span', { class: h.bayat ? 'tone-warning' : '', text: h.sonKayit ? String(h.sonKayit).slice(0, 10) : '—' })]),
            h.durum === 'kapali' ? el('span', { class: 'badge', text: ` kapalı ${h.kapanis || ''}` }) : null])
        ]),
        poz.length || nakit.length ? AG.tablo.kutulu({ id: `tblPmHesap-${h.id}`, sinif: 'table-dense pf-tablo', basliklar: ['Varlık', 'Model', 'Adet', 'Ort. alış', 'Son fiyat', 'Değer', 'Kâr / zarar', ''], satirlar: poz.map(satir).concat(nakit.map(nakitSatir)) })
          : el('p', { class: 'hint hint-sm mb-0', text: 'Bu hesapta varlık yok — "Varlık ekle" ile gir.' }),
        fiyatAcik && poz.some(p => p.anahtar === fiyatAcik) ? fiyatFormu(poz.find(p => p.anahtar === fiyatAcik)) : null,
        mevduatBolumu(h, hh),
        h.durum === 'kapali' ? null : el('div', { id: `pmHf-${h.id}`, class: 'pm-hf pm-yazma' })
      ]);
    }));
    for (const h of l) if (h.durum !== 'kapali') hesapFormCiz(h.id);
  }

  /** Satır içi "+ işlem" formu (hesap kartının altında): al · sat · temettü · para yatırma · para çekme. */
  const HF_TUR = [['al', 'Alış'], ['sat', 'Satış'], ['temettu', 'Temettü'], ['yatir', 'Para yatırma'], ['cek', 'Para çekme']];
  function hesapFormCiz(hid) {
    const k = bul(`pmHf-${hid}`);
    if (!k || !veri) return;
    const s = hf[hid] = { tur: 'al', tarih: bugun(), ...(hf[hid] || {}) };
    const id = (a) => `inpPmH-${hid}-${a}`;
    const yazS = (a) => (e) => { s[a] = e.target.value; };
    const hh = (veri.hesaplar || []).find(h => h.id === hid) || {};
    const hesapVarlik = new Set(((veri.degerleme && veri.degerleme.pozisyonlar) || []).filter(p => p.hesap === hid).map(p => p.varlik));
    const varliklar = (veri.varliklar || []).slice().sort((a, b) => (hesapVarlik.has(b.id) - hesapVarlik.has(a.id)) || String(a.sembol).localeCompare(String(b.sembol)));
    const varlikMi = ['al', 'sat', 'temettu'].includes(s.tur);
    if (varlikMi && !s.varlik && varliklar.length) s.varlik = varliklar[0].id;
    const alanlar = [
      alan('İşlem', secici({ id: id('tur'), onchange: (e) => { s.tur = e.target.value; hesapFormCiz(hid); } }, HF_TUR, s.tur)),
      varlikMi ? alan('Varlık', secici({ id: id('varlik'), onchange: yazS('varlik') }, varliklar.map(v => [v.id, `${v.sembol}${hesapVarlik.has(v.id) ? '' : ' (bu hesapta yok)'}`]), s.varlik)) : null,
      s.tur === 'al' || s.tur === 'sat' ? alan('Adet', girdi({ id: id('adet'), inputmode: 'decimal', onchange: yazS('adet') }, s.adet || '')) : null,
      s.tur === 'al' || s.tur === 'sat' ? alan('Birim fiyat', girdi({ id: id('fiyat'), inputmode: 'decimal', onchange: yazS('fiyat') }, s.fiyat || '')) : null,
      s.tur === 'al' || s.tur === 'sat' ? alan('Ücret', girdi({ id: id('ucret'), inputmode: 'decimal', placeholder: '0', onchange: yazS('ucret') }, s.ucret || '')) : null,
      s.tur === 'temettu' || s.tur === 'yatir' || s.tur === 'cek' ? alan('Tutar', girdi({ id: id('tutar'), inputmode: 'decimal', onchange: yazS('tutar') }, s.tutar || '')) : null,
      s.tur === 'temettu' ? alan('Vergi / stopaj', girdi({ id: id('vergi'), inputmode: 'decimal', placeholder: '0', onchange: yazS('vergi') }, s.vergi || '')) : null,
      s.tur === 'yatir' || s.tur === 'cek' ? alan('Para birimi', secici({ id: id('para'), onchange: yazS('para') }, paraSecenekleri(), s.para || hh.para || 'USD')) : null,
      alan('Tarih', girdi({ id: id('tarih'), type: 'date', onchange: yazS('tarih') }, s.tarih))
    ];
    doldur(k, [
      el('div', { class: 'pm-hf-satir' }, [el('strong', { class: 'pm-hf-baslik', text: '+ işlem' }), ...alanlar,
        yazmaDugme('Ekle', (e) => hesapIslemKaydet(hid, e.currentTarget), 'btn-primary', { id: `btnPmH-${hid}` })]),
      varlikMi && !varliklar.length ? el('p', { class: 'hint hint-sm mb-0', text: 'Henüz varlık yok: elindekileri üstteki "Varlık ekle" ile gir.' }) : null,
    ]);
  }

  async function hesapIslemKaydet(hid, d) {
    const s = hf[hid] || {};
    const oku2 = (a) => { const x = bul(`inpPmH-${hid}-${a}`); return x ? x.value : (s[a] || ''); };
    for (const a of ['varlik', 'adet', 'fiyat', 'ucret', 'tutar', 'vergi', 'para', 'tarih']) s[a] = oku2(a);
    const g = formGovdesi(s.tur, { hesap: hid, tarih: s.tarih, varlik: s.varlik, adet: s.adet, fiyat: s.fiyat, ucret: s.ucret, tutar: s.tutar, vergi: s.vergi, para: s.para }, 'varlik');
    AG.dom.mesgul(d, 'Kaydediliyor…');
    try {
      const r = await islemGonder(g);
      if (r === null) return;
      if (!r || !r.success) { AG.bildir(gizliMetin(`Kaydedilmedi: ${(r && r.error) || 'bilinmeyen hata'}`), 'hata', { sure: 12000 }); return; }
      AG.bildir(gizliMetin(`${ISLEM_AD[g.islem]} kaydedildi.${r.uyarilar && r.uyarilar.length ? ' Uyarı: ' + r.uyarilar.map(u => u.mesaj).join(' · ') : ''}`), r.uyarilar && r.uyarilar.length ? 'uyari' : 'ok', { sure: 9000 });
      hf[hid] = { tur: s.tur, tarih: s.tarih, varlik: s.varlik, para: s.para };
      hesapGecmis.clear();
      await yukle(true);
    } catch (e) { AG.bildir(`Kaydedilmedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(d); }
  }

  /** Hesaplarım üst satırı: düğmeler katlı bölümleri açıp oraya kaydırır. */
  function kayitUstCiz() {
    const k = bul('pmKayitUst');
    if (!k) return;
    const ac = (id) => () => katAc(id);
    doldur(k, [
      el('div', { class: 'row-between row-wrap gap-2' }, [
        el('h3', { class: 'card-title m-0' }, [ikon('landmark'), el('span', { text: ' Hesaplar' })]),
        el('div', { class: 'pf-dugmeler' }, [
          // 67.4: "Varlık ekle" yalnız var olan hesaba; yeni hesap ayrı kartta.
          yazmaDugme('+ Varlık ekle', ac('pmHizliKat'), 'btn-primary', { id: 'btnPmVarlikEkleAc' }),
          yazmaDugme('+ Yeni hesap', ac('pmYeniHesapKat'), 'btn-secondary', { id: 'btnPmYeniHesapAc' }),
          yazmaDugme('Geçmiş işlemleri içe aktar (CSV)', ac('pmCsvKat'), 'btn-secondary', { id: 'btnPmCsvAc' }),
          // F6: Portföyüm defteri İşlem defteri › Yatırım'da (pano.js defterAc).
          dugme('İşlem defteri', () => { if (AG.pages.pano && AG.pages.pano.defterAc) AG.pages.pano.defterAc('yatirim'); }, 'btn-secondary', { id: 'btnPmDefterAc' }),
          dugme('Hedef dağılım', ac('pmHedefKat'), 'btn-secondary', { id: 'btnPmHedefAc' }),
          // F6: eski Portföyüm sayfasının üst düğmeleri (o kap artık gizli) buraya taşındı.
          dugme('Yenile', () => yukle(true), 'btn-secondary', { id: 'btnPmYenile' }),
          yazmaDugme('Fiyatları yenile', (e) => fiyatYenile(e.currentTarget), 'btn-secondary', { id: 'btnPmFiyatYenile', title: 'Yahoo / TEFAS / Binance fiyatlarını ve kurları ağdan tazeler (ücretsiz kaynaklar)' })
        ])
      ]),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Buraya girdiğin her şey (geçmiş tarihli işlemler dahil) Pano, Varlıklar ve Rapor\'daki sayıları ve grafikleri kendiliğinden günceller. Elinde zaten olan hisse, fon, kripto, altın ve nakit "Varlık ekle"de; sonraki alış, satış, temettü, para giriş/çıkışı hesap kartındaki "+ işlem" satırında (geçmiş tarih için tarihi geriye al); transfer, faiz, ücret, bölünme "Diğer işlemler"de. Vadeli mevduat faizi ve elle fiyat hesap kartında. Hiçbir bakiye otomatik dolmaz. Model portföylerin emirlerini uyguladıysan modelin sekmesindeki "Uyguladım" bunları buraya kendisi yazar.' })
    ]);
  }

  /* ── İskelet ve yükleme ─────────────────────────────────────────────── */
  /**
   * 62.3: iki kap. Portföyüm (kap) yalnız bakılır: üst düğmeler → uyarılar → özet şeridi → değer grafiği + dağılım → varlıklar.
   * Kayıt (kayitKap) bilgi girişi: hisse ekle → işlem ekle → varlıkları düzelt → hesaplarım → işlem defteri → katlı CSV / hedef /
   * gelişmiş. Kayıt kabı yoksa (eski yerleşim, test) Kayıt bölümleri Portföyüm kabının altına eklenir.
   */
  function iskelet(kap, kayitKap) {
    if (!kap) return false;
    const kat = (id, metin, ikonAd, ic, acik, ek) => el('details', { class: `glass-panel hs-kat mt-4${ek ? ' ' + ek : ''}`, id, open: acik ? '' : null }, [
      el('summary', { 'data-ikon': ikonAd }, [el('span', { text: metin })]), el('div', { class: 'hs-kat-ic' }, ic)]);
    // 62.4: Portföyüm = şahsi portföy sayfası (model sayfasıyla aynı yapı); Hesaplarım = hesap kartları + satır içi "+ işlem"
    const gorunum = [
      el('div', { id: 'pmUst', class: 'pm-ust' }),
      el('div', { id: 'pmBant', class: 'is-hidden mb-3' }),
      el('div', { id: 'pmTasima', class: 'is-hidden' }),
      el('div', { id: 'pmBos', class: 'is-hidden' }),
      el('div', { class: 'glass-panel panel-pad pm-sayfa' }, [
        el('div', { id: 'pmBaslik' }),
        el('div', { id: 'pmOzet', class: 'ana-sayilar', 'aria-live': 'polite' }),
        el('div', { class: 'mp-iki' }, [el('div', { id: 'pmGrafik', class: 'mp-blok' }), el('div', { id: 'pmKz', class: 'mp-blok' })]),
        el('div', { class: 'mp-iki' }, [el('div', { id: 'pmVarliklar', class: 'mp-blok' }), el('div', { id: 'pmDagilim', class: 'mp-blok' })]),
        el('div', { id: 'pmAylik', class: 'mp-blok' }),
        el('details', { class: 'hs-kat-mini', id: 'pmSonIslemKat' }, [el('summary', { text: 'Son işlemler (bütün hesaplar)' }), el('div', { id: 'pmSonIslemler', class: 'mt-2' })])
      ])
    ];
    const kayit = [
      el('div', { id: 'pmKayitUst', class: 'glass-panel panel-pad mb-4' }),
      // 67.4: yeni hesap ayrı kart; "Varlık ekle" (açılış bakiyesi) yalnız var olan hesaba.
      kat('pmYeniHesapKat', 'Yeni hesap — kurum, hesap adı, tür (vadeli mevduat isteğe bağlı)', 'landmark', [el('div', { id: 'pmYeniHesap', class: 'pm-yazma' })], false, 'pm-yazma'),
      kat('pmHizliKat', 'Varlık ekle — elinde olan hisse, fon, kripto, altın, nakit', 'circle-plus', [el('div', { id: 'pmHizli', class: 'pm-yazma' })], false, 'pm-yazma'),
      el('div', { id: 'pmHesapKartlari', class: 'pm-hesap-kartlari mt-4' }),
      kat('pmFormKat', 'Diğer işlemler: transfer, faiz, ücret, bölünme', 'file-plus', [el('div', { id: 'pmForm' })], false, 'pm-yazma'),
      // 67.4: işlem defteri katlı, varsayılan KAPALI (özet satırında kayıt sayısı); "İşlem defteri" bağlantıları açıp kaydırır (pano.js defterAc).
      el('details', { id: 'pmDefter', class: 'glass-panel hs-kat mt-4' }, [
        el('summary', { 'data-ikon': 'notebook-pen' }, [el('span', { text: 'İşlem defteri' }), el('span', { id: 'pmDefterSayi', class: 'hint hint-sm mb-0 pm-defter-sayi' })]),
        el('div', { class: 'hs-kat-ic' }, [el('div', { id: 'pmDefterSuzgec' }), el('div', { id: 'pmDefterTablo', class: 'mt-3' })])
      ]),
      kat('pmHedefKat', 'Hedef dağılım — olmasını istediğin oranlar', 'target', [el('div', { id: 'pmHedef' })], false, 'pm-yazma'),
      kat('pmCsvKat', 'Geçmiş işlemleri içe aktar (CSV, önizlemeli)', 'upload', [el('div', { id: 'pmCsv' })], false, 'pm-yazma'),
      kat('pmYonetimKat', 'Gelişmiş: kurum, hesap ve varlık adları · fiyat kodu · hesap kapatma', 'building-2', [el('div', { id: 'pmYonetim' })], false, 'pm-yazma')
    ];
    if (kayitKap) {
      doldur(kap, [el('div', { id: 'pmKok', class: `pm-kok${gizli ? ' pm-gizli' : ''}` }, gorunum)]);
      doldur(kayitKap, [el('div', { id: 'pmKayitKok', class: `pm-kok${gizli ? ' pm-gizli' : ''}` }, kayit)]);
    } else doldur(kap, [el('div', { id: 'pmKok', class: `pm-kok${gizli ? ' pm-gizli' : ''}` }, [...gorunum, ...kayit])]);
    return true;
  }

  function bosDurumCiz() {
    const k = bul('pmBos');
    if (!k) return;
    const bos = !veri || !(veri.hesaplar || []).length;
    k.classList.toggle('is-hidden', !bos);
    if (!bos) { doldur(k, []); return; }
    doldur(k, [el('div', { class: 'glass-panel panel-pad mb-4' }, [
      baslik('compass', 'Portföyüm — ilk kurulum'),
      el('ol', { class: 'pm-adimlar' }, [
        el('li', { text: 'Portföy › Hesaplar\'ı aç. "Yeni hesap" kartında kurum adını (ör. Midas, Enpara), hesap adını, türünü ve para birimini yaz; vadeli mevduatsa faiz bilgisini de.' }),
        el('li', { text: '"Varlık ekle" kartında türü seç (Hisse / ETF · Fon · Kripto · Altın · Nakit · Diğer). Hissede sembolü yazıp "Bul"a bas: panel adını, borsasını ve para birimini kendisi bulur.' }),
        el('li', { text: 'Adedi (istersen ortalama alış fiyatını ve alış tarihini de) yaz, "Ekle"ye bas. Varlık, hesabının altında listede görünür.' }),
        el('li', { text: 'Sonraki alış, satış, temettü ve para giriş/çıkışını hesap kartındaki "+ işlem" satırından girersin; transfer, faiz, ücret ve bölünme "Diğer işlemler"de.' })
      ]),
      el('div', { class: 'pf-dugmeler mt-2 mb-2' }, [dugme('Hesaplar\'a git', () => kayitAc(), 'btn-primary', { id: 'btnPmBosKayit' })]),
      el('p', { class: 'hint hint-sm mb-0', text: veri && veri.yazma && veri.yazma.ev ? 'Hiçbir bakiye otomatik dolmaz; veriler sunucuda tutulur (bu bilgisayar sunucudakini gösterir, girdiklerin sunucuya gider). Telefondan yalnız görüntülenir.' : 'Hiçbir bakiye otomatik dolmaz; veriler yalnız bu bilgisayarda tutulur. Telefondan yalnız görüntülenir.' })
    ])]);
  }

  function ciz() {
    if (!veri) return;
    ustCiz(); bantCiz(); bosDurumCiz(); portfoyumCiz(); kayitUstCiz(); yeniHesapCiz(); hizliCiz(); hesapKartlariCiz(); defterSuzgecCiz(); formCiz(); csvCiz(); hedefCiz(); yonetimCiz();
    // 67.4: hiç hesap yoksa ilk adım "Yeni hesap" (Varlık ekle de "önce hesap aç" der).
    const yk = bul('pmYeniHesapKat'); if (yk && !(veri.hesaplar || []).some(h => h.durum === 'acik')) yk.open = true;
    gizliUygula();
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  async function yukle(zorla) {
    const kap = bul('pfPortfoyumKok');
    if (!kap) return;
    if (!bul('pmKok')) iskelet(kap, bul('pfKayitKok'));
    if (yukleniyor && !zorla) return;
    // 62.4: Portföy'ün her sekmesi özet şeridi için çağırır — 60 sn içinde ikinci kez sunucuya gitmez
    if (!zorla && veri && Date.now() - sonYukleme < 60e3) { ozetSeritCiz(); return; }
    yukleniyor = true;
    ustCiz();
    try {
      const [r, on] = await Promise.all([api().ozet(), modelListe || !AG.api.tasarimci || !AG.api.tasarimci.oneri ? null : AG.api.tasarimci.oneri().catch(() => null)]);
      if (!r || !r.success) throw new Error((r && r.error) || 'sunucu yanıt vermedi');
      veri = r; sonYukleme = Date.now();
      if (on && on.modeller) {
        const set = (id) => new Set(((on.modeller.find(m => m.id === id) || {}).hedef || []).map(h => String(h.s || '').toUpperCase().replace(/.IS$/, '')).filter(Boolean));
        modelListe = { N10: set('m-qqq-m10'), B10: set('m-bist-m10') };
      }
      if (hedefTaslak && hedefTaslak.kaynak === 'elle' && !zorla) hedefTaslak = null;
      if (zorla) { hesapGecmis.clear(); kiyasVeri.clear(); }
      ciz();
      // 64.8: geliştirme bilgisayarında bir kezlik "sunucuya taşı" kartı (yalnız taşınmamış yerel kayıt varsa görünür)
      if (veri.yazma && veri.yazma.ev && veri.yazma.acik && AG.evKuyruk) AG.evKuyruk.tasimaKarti(bul('pmTasima'), { onDegisti: () => yukle(true) });
      await Promise.all([defterYukle(), grafikYukle()]);
      sonIslemlerCiz(); grafikCiz();
    } catch (e) {
      const k = bul('pmOzet');
      if (k) doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'Portföyüm okunamadı', yeniden: () => yukle(true) })]);
    } finally { yukleniyor = false; }
  }

  AG.pages = AG.pages || {};
  AG.pages.portfoyum = {
    yukle, iskelet, kayitAc, gizliUygula, islemGonder, soruluGonder, varlikGovdesi, yeniHesapGovdesi, elleFiyatGerek, kodDegistir, yahooKodGecerli, mevduatHesabiMi, modelEtiketi, aylikGetiri, gizliMetin, paraBicim, sayiBicim, yuzde, isaretliYuzde, formGovdesi, islemOzeti, hedefDenetle, halkaDilimleri, hedefTaslagiKur, FORM_ALANLARI, ISLEM_AD,
    _ciz: { ustCiz, bantCiz, ozetCiz, ozetSeritCiz, portfoyumCiz, hesapKartlariCiz, hesapFormCiz, kayitUstCiz, hizliCiz, yeniHesapCiz, dagilimCiz, varliklarCiz, hesaplarCiz, defterTabloCiz, formCiz, csvSonucCiz, hedefCiz, yonetimCiz, bosDurumCiz, ciz },
    _durum: { veriAyarla: (v) => { veri = v; }, defterAyarla: (d) => { defter = d; }, csvAyarla: (c) => { csvSonuc = c; }, gizli: () => gizli, formTurAyarla: (t, k) => { formTur = t; formKalem = k || 'varlik'; }, hizli: () => hizli, duzenleAyarla: (a) => { duzenlenen = a; }, faizAcAyarla: (h) => { faizAcik = h; }, fiyatAcAyarla: (a) => { fiyatAcik = a; } }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.portfoyum;
})(typeof window !== 'undefined' ? window : globalThis);
