/**
 * PORTFÖY — yeni panel F4 sayfaları (`AG.pages.pano`), PLAN-PANEL-YENI §2–§5 + EK-1
 * ═══════════════════════════════════════════════════════════════════════════
 * Portföy bölümü yan menüden: Pano · Hesaplar · Varlıklar · İşlem defteri · Hedefim · Modeller · Takvim ve akış · Rapor
 * (js/pages/portfoy.js altSekme → sayfaYukle → bu modülün `yukle(ad)`'ı). Bu modül:
 *   · ÜST ÇUBUK GÖRÜNÜM YUVASI (#ustGorunum): Ben / Fırat / … / Tümü ve $ / ₺ / Gizli (K3). Seçim localStorage 'pusula.portfoy.gorunum'
 *     (try/catch). Tümü = SALT OKUNUR birleşim (Hedefim'de kayıt yok; bant söyler).
 *   · PANO (#pfYeni-pano): gösterge şeridi (toplam + kapsam satırı, TWR, başlangıçtan, düşüş, Sharpe, oynaklık) · portföy sağlığı
 *     örümcek ağı · dağılım halkası (Sınıf / Hesap / Para; 67.4 altında dilim listesi + içindeki varlıklar) · Yapman gerekenler ·
 *     getiri grafiği (QQQ / BTC / TÜFE … kıyaslı; 67.4 çizgi ucunda son değer + her kıyasın ne ölçtüğü) · aylık getiri ısı haritası
 *     (67.4 hücrede yüzde + Yıl sütunu) · düşüş grafiği · (67.4: bot hesapları satırı kaldırıldı — Botlar sayfasında) · KRİPTO BORSALARI (K-E: İşlem
 *     defterinin salt okuma anahtarlarıyla OKX / Binance bakiyesi Ben ve Tümü toplamına DAHİL; Portföyüm'de "toplama dahil" bir kripto
 *     borsası hesabı varsa çift sayılmasın diye katılmaz ve bu yazılır. Getiri, dağılım ve sağlık yalnız Portföyüm hesaplarından).
 *   · VARLIKLAR (#pfYeni-varliklar): açık / kapanmış / hepsi; nakit; gerçekleşen K/Z.
 *   · HEDEFİM (#pfYeni-hedefim, K5): 1 hedefi seç (modelden / kendim) · 2 olması gereken ↔ şu an ($ farkıyla) · 3 hangi hesapta ne.
 *   · TAKVİM VE AKIŞ (#pfYeni-takvim): günlük K/Z takvimi (para girişi K/Z değil) + zaman çizelgesi (işlem, gelir, yaklaşan vade).
 *   · HESAPLAR üstüne "Portföyler" kartı (hesap → portföy, toplama dahil, yeni portföy; ör. eşin hesabı → "Eş" portföyü).
 *   · İŞLEM DEFTERİ kaynak seçici (Kripto / FX · Yatırım · Bot) — Hesaplarım'daki Portföyüm defteri buraya taşınır (§3).
 *     68.7: Yatırım'da defterin üstünde grafikler (GET /defter-analiz: gerçekleşen K/Z, varlığa göre, gelir, alış/satış/para hareketi)
 *     seçili kişiye göre, defter açık; Kripto / FX'te başka kişi seçiliyken "borsa hesapları Ben'in" notu. Kişi değişince
 *     portfoyum.js kisiDegisti (Hesaplar kartları + defter süzgeci).
 *   · RAPOR üstüne "Risk ve getiri ölçütleri" (portföy · QQQ · BTC; js/core/olcut.js).
 * Veri: GET /api/portfoyum/ozet|gecmis?portfoy=, /kiyas, /islemler (60 sn önbellek; yazınca boşalır). Kurallar portfoyum.js ile aynı:
 * DOM yalnız AG.dom, satır içi stil yok (renk sınıftan), yazma düğmeleri data-kilit="telefon".
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const svg = (...a) => AG.dom.svg(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const OKUMA = new Set(['ozet', 'islemler', 'csvYolu', 'defterAnaliz', 'gecmis', 'kiyas', 'rapor', 'kur', 'labGirdi', 'sembolBul', 'csvOnizle', 'fiyatYenile']);
  const api = () => (AG.evKuyruk ? AG.evKuyruk.sarmala(AG.api.portfoyum, OKUMA) : AG.api.portfoyum);
  const O = () => AG.olcut;

  const GORUNUM_ANAHTAR = 'pusula.portfoy.gorunum';
  const PANO_SAYFA = ['pano', 'varliklar', 'hedefim', 'takvim'];
  const AY_KISA = ['O', 'Ş', 'M', 'N', 'M', 'H', 'T', 'A', 'E', 'E', 'K', 'A'];
  const AY_AD = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const KIYAS_AD = { qqq: 'QQQ', btc: 'BTC', tufe: 'TÜFE', bist30: 'BIST 30', mevduat: 'TL mevduat', dolar: 'Dolar' };
  /**
   * 67.4: her kıyasın neyi ölçtüğü (grafiğin altında, seçili kıyaslar için). Kaynaklar: lib/portfoyum/api.js KIYASLAR →
   * lib/portfoy/kaynaklar.js (yahoo adjclose, tr:mevduat = portfoyVeri.mevduatTLGunluk, nakit:usd, kripto market.db) ve
   * lib/portfoy/seri.js tufeAylik; BIST 30 = tasarımcı XU030.IS kapanışı.
   */
  const KIYAS_ACIKLAMA = {
    mevduat: 'TCMB\'nin 1 aya kadar vadeli TL mevduat ortalama faizi (EVDS MT01), stopaj düşülmüş; her ayın başında o günkü ortalama faizle yeniden bağlanır. Ara vermeden her ay ortalama faizi almak demektir — mevduatın alabileceğinin üst sınırı. ₺ biriminde yüksek TL faizi bileşik işlediği için dik yükselir; bu bir hata değildir.',
    bist30: 'BIST 30 fiyat endeksi (XU030), temettü hariç — temettüleri yeniden yatıran biraz daha fazlasını alırdı.',
    qqq: 'Invesco QQQ al-tut; Yahoo düzeltilmiş kapanışı (adjclose): temettüler yeniden yatırılmış, bölünmeler düzeltilmiş.',
    dolar: 'USD nakit, faizsiz: $ biriminde düz çizgi, ₺ biriminde yalnız kurun artışı.',
    tufe: 'TÜİK tüketici fiyat endeksi; aylık, her ayın değeri ay sonuna yazılır (ay içi düz çizgi). Bunun üstü reel kazanç.',
    btc: 'Bitcoin al-tut; Binance günlük spot kapanışı.'
  };
  /** Hedefim › modelden al: sınıf düzeyinde hazır hedefler (modellerin kendisi Modeller sayfasında). */
  const HAZIR_HEDEF = [
    { k: 'q837', ad: 'Simurg · %50 QQQ + %50 Kairos', alt: 'modelden · yarı endeks, yarı kripto', agirlik: { 'hisse-endeks': 50, kripto: 50 } },
    { k: 'm10', ad: 'Nasdaq / BIST Momentum 10', alt: 'modelden · tamamı hisse', agirlik: { hisse: 100 } },
    { k: 'dengeli', ad: 'Dengeli', alt: '%60 endeks · %20 kripto · %20 nakit', agirlik: { 'hisse-endeks': 60, kripto: 20, nakit: 20 } }
  ];

  function oku() { try { return JSON.parse(global.localStorage.getItem(GORUNUM_ANAHTAR) || 'null'); } catch (e) { return null; } }
  function yaz(v) { try { global.localStorage.setItem(GORUNUM_ANAHTAR, JSON.stringify(v)); } catch (e) { /* özel pencere: yalnız bu oturum */ } }
  const ilk = oku();
  const gorunum = { portfoy: (ilk && ilk.portfoy) || 'ben', para: ilk && ['usd', 'tl', 'gizli'].includes(ilk.para) ? ilk.para : 'usd' };
  let portfoyler = [{ id: 'ben', ad: 'Ben' }];
  const onbellek = new Map();
  let aktif = null;
  let dagilimTur = 'sinif', grafikTur = 'getiri', varlikSuzgec = 'acik', akisSuzgec = 'hepsi', takvimAy = null, defterKaynak = 'kripto', hedefSecim = null;
  let paraEkleAcik = false;   // 67.3: Hedefim içinde planlayıcı açık mı
  let adDuzenle = null;       // 67.3: Hesaplar › portföy adı düzenlenen portföy
  const kiyasSecili = new Set(['qqq']);

  // ── Biçim ─────────────────────────────────────────────────────────────────
  const gizli = () => gorunum.para === 'gizli';
  const birim = () => (gorunum.para === 'tl' ? 'TL' : 'USD');
  const tr = (x, b = 2) => (sayiMi(x) ? x.toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b }) : '—');
  const SIMGE = { USD: '$', TRY: '₺', TL: '₺', EUR: '€', GBP: '£' };
  /** Seçili birimde tutar ($ ya da ₺); Gizli → •••. */
  function tutar(usd, tl, b = 2) {
    if (gizli()) return '•••';
    const x = birim() === 'TL' ? tl : usd;
    if (!sayiMi(x)) return '—';
    return (x < 0 ? '−' : '') + SIMGE[birim()] + tr(Math.abs(x), b);
  }
  /** Yalnız USD karşılığı bilinen tutar (hedef farkı, öneri): TL için bugünkü USD/TRY kuru. */
  const kurNe = () => { const o = onbellek.get(gorunum.portfoy); const k = o && o.ozet.degerleme && o.ozet.degerleme.kur; return k ? k.USDTRY : null; };
  const usdTutar = (usd, b = 2) => tutar(usd, sayiMi(usd) && kurNe() ? usd * kurNe() : null, b);
  /** Kendi para biriminde tutar (varlık fiyatı, maliyet). */
  const kendi = (x, para, b = 2) => (gizli() ? '•••' : sayiMi(x) ? (x < 0 ? '−' : '') + (SIMGE[para] || '') + tr(Math.abs(x), b) + (SIMGE[para] ? '' : ' ' + para) : '—');
  const yuzde = (x, b = 1, isaretli) => AG.fmt.oranYuzde(x, b, { isaretli });
  const ton = (x) => (sayiMi(x) && Math.abs(x) > 1e-12 ? (x > 0 ? 'p-pos' : 'p-neg') : '');
  const kucukSayi = (x, b = 2) => (sayiMi(x) ? tr(x, b) : '—');

  // ── Küçük bileşenler (p- ailesi) ──────────────────────────────────────────
  const kart = (ic, ek) => el('section', { class: `p-kart${ek ? ' ' + ek : ''}` }, ic);
  const kartBas = (baslik, sag) => el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: baslik }), sag || null]);
  const gosterge = (etiket, deger, alt, sinif) => el('div', { class: 'p-gosterge' }, [
    el('p', { class: 'p-gosterge-etiket' }, [el('span', { text: etiket })]),
    el('p', { class: `p-gosterge-deger${sinif ? ' ' + sinif : ''}`, text: deger }),
    alt ? el('p', { class: 'p-gosterge-alt', text: alt }) : null
  ]);
  const rozet = (metin, tur) => el('span', { class: `p-rozet${tur ? ' p-rozet-' + tur : ''}`, text: metin });
  const dugme = (metin, f, tur, ek) => el('button', { type: 'button', class: `p-dugme${tur ? ' p-dugme-' + tur : ''}`, onclick: f, ...(ek || {}) }, [el('span', { text: metin })]);
  function secici(etiket, secenekler, secili, f) {
    return el('div', { class: 'p-secici', role: 'group', 'aria-label': etiket }, secenekler.map(([k, ad]) => el('button', {
      type: 'button', 'aria-pressed': k === secili ? 'true' : 'false', text: ad, onclick: () => f(k)
    })));
  }
  /** Tablo: AG.tablo (telefonda satır → kart; başlıklar hazır <th> düğümü olabilir). */
  const tablo = (basliklar, satirlar) => AG.tablo.kutulu({ sinif: 'p-tablo', basliklar, satirlar }, 'p-tablo-kap');
  const bos = (metin, eylem) => el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: metin }), eylem || null]);
  const bant = (metin, tur, eylem) => el('div', { class: `p-bant${tur ? ' p-bant-' + tur : ''}` }, [el('p', { class: 'p-bant-metin', text: metin }), eylem || null]);
  const git = (yol) => () => { if (AG.rota) AG.rota.git(yol); };
  const salt = () => gorunum.portfoy === 'tumu';
  const pAd = (id) => { const p = portfoyler.find(x => x.id === id); return p ? p.ad : id === 'tumu' ? 'Tümü' : id; };

  // ── Veri ──────────────────────────────────────────────────────────────────
  /** pidSec: görünümden bağımsız okuma (Hesaplar kartı her zaman bütün hesapları ister) — seçim DEĞİŞTİRİLMEZ. */
  async function veri(zorla, pidSec) {
    const pid = pidSec || gorunum.portfoy;
    const o = onbellek.get(pid);
    if (o && !zorla && Date.now() - o.zaman < 60e3) return o;
    const [oz, ge] = await Promise.all([api().ozet(pid), api().gecmis('', pid)]);
    if (!oz || !oz.success) throw new Error((oz && oz.error) || 'Portföy okunamadı');
    if (oz.portfoyler && oz.portfoyler.length) portfoyler = oz.portfoyler;
    if (!pidSec && pid !== 'tumu' && pid !== 'ben' && !portfoyler.some(p => p.id === pid)) { gorunum.portfoy = 'ben'; yaz(gorunum); return veri(true); }
    const x = { zaman: Date.now(), ozet: oz, gecmis: (ge && ge.seri) || [], kiyas: {}, islemler: null };
    onbellek.set(pid, x);
    return x;
  }
  async function kiyasAl(x) {
    const b = birim(), bas = x.gecmis.length ? x.gecmis[0].tarih : null;
    if (!bas) return {};
    if (x.kiyas[b]) return x.kiyas[b];
    try {
      const r = await api().kiyas(bas, b);
      x.kiyas[b] = {};
      for (const s of (r && r.seriler) || []) x.kiyas[b][s.kimlik] = s.noktalar || [];
    } catch (e) { x.kiyas[b] = {}; }
    return x.kiyas[b];
  }
  /** K-E: borsa bakiyeleri — Ben ve Tümü görünümünde; hata olursa null (Pano yine çizilir). */
  async function borsaAl(x, yenile) {
    if (gorunum.portfoy !== 'ben' && gorunum.portfoy !== 'tumu') return null;
    if (x.borsa !== undefined && !yenile) return x.borsa;
    try { const r = await AG.api.islemDefteri.bakiye(yenile); x.borsa = r && r.success ? r : null; } catch (e) { x.borsa = null; }
    return x.borsa;
  }
  /** Portföyüm'de toplama dahil açık bir kripto borsası hesabı var mı (varsa borsa bakiyesi eklenmez — çift sayım). */
  const ciftSayim = (oz) => (oz.hesaplar || []).some(h => h.hesapTuru === 'binance' && h.durum !== 'kapali' && h.toplamaDahil !== false && (gorunum.portfoy === 'tumu' || (h.portfoy || 'ben') === gorunum.portfoy));

  async function islemlerAl(x) {
    if (x.islemler) return x.islemler;
    try { const r = await api().islemler({ durum: 'etkin' }); x.islemler = (r && r.islemler) || []; } catch (e) { x.islemler = []; }
    return x.islemler;
  }
  function tazele() { onbellek.clear(); analizOnbellek.clear(); if (AG.pages.portfoyum) AG.pages.portfoyum.yukle(true); yukle(aktif); }
  /** Yazma isteği: başarıda önbelleği boşaltır ve sayfayı yeniden çizer. */
  async function yazma(d, f, basari) {
    if (d) AG.dom.mesgul(d, 'Kaydediliyor…');
    try {
      const r = await f();
      if (r && r.success === false) throw new Error(r.error || 'kaydedilemedi');
      if (AG.bildir) AG.bildir(basari || 'Kaydedildi.', 'ok');
      tazele();
    } catch (e) { if (AG.bildir) AG.bildir(e.message, 'hata'); } finally { if (d) AG.dom.hazir(d); }
  }

  // ── Üst çubuk görünüm yuvası ──────────────────────────────────────────────
  function ustYuva() {
    const k = bul('ustGorunum');
    if (!k) return;
    const goster = !!aktif;
    k.classList.toggle('is-hidden', !goster);
    if (!goster) { doldur(k, []); return; }
    const pl = [...portfoyler.map(p => [p.id, p.ad]), ['tumu', 'Tümü']];
    doldur(k, [
      secici('Portföy', pl, gorunum.portfoy, (v) => {
        gorunum.portfoy = v; yaz(gorunum); yukle(aktif);
        if (aktif === 'rapor' && AG.pages.portfoyumRapor) AG.pages.portfoyumRapor.yukle(true);
        // 68.7: Hesaplar kartları ve İşlem defteri (Yatırım) seçili kişiye göre yeniden çizilir
        if ((aktif === 'hesaplar' || aktif === 'islem-defteri') && AG.pages.portfoyum && AG.pages.portfoyum.kisiDegisti) AG.pages.portfoyum.kisiDegisti();
      }),
      secici('Para birimi', [['usd', '$'], ['tl', '₺'], ['gizli', 'Gizli']], gorunum.para, (v) => { gorunum.para = v; yaz(gorunum); gizliUygula(); yukle(aktif); })
    ]);
  }
  /** Gizli: eski Portföyüm kaplarına da uygulanır (portfoyum.js "pm-gizli" sınıfı tutarları gizler). */
  function gizliUygula() { for (const id of ['pmKok', 'pmKayitKok']) { const k = bul(id); if (k && k.classList) k.classList.toggle('pm-gizli', gizli()); } }

  // ── Sayfa girişi ──────────────────────────────────────────────────────────
  async function yukle(ad) {
    aktif = ad || aktif;
    if (aktif !== 'hedefim') paraEkleAcik = false;
    ustYuva();
    gizliUygula();
    if (aktif === 'hesaplar') return hesaplarKart();
    if (aktif === 'islem-defteri') return defterKaynakCiz();
    if (aktif === 'rapor') return olcutKart();
    if (!PANO_SAYFA.includes(aktif)) return;
    const k = bul('pfYeni-' + aktif);
    if (!k) return;
    if (!k.firstChild) doldur(k, [el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })]);
    try {
      const x = await veri();
      ustYuva();
      if (aktif === 'pano') await panoCiz(k, x);
      else if (aktif === 'varliklar') varliklarCiz(k, x);
      else if (aktif === 'hedefim') hedefimCiz(k, x);
      else if (aktif === 'takvim') await takvimCiz(k, x);
      if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
    } catch (e) {
      doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'Portföy okunamadı', yeniden: () => { onbellek.clear(); yukle(aktif); } })]);
    }
  }

  /** Bantlar: Tümü salt okunur; sahip önerisi. */
  function bantlar(x) {
    const l = [];
    if (salt()) l.push(bant('"Tümü" görünümündesin: yalnız okunur. Hedef ve kayıt için bir portföy seç. Toplam, portföylerin "toplama dahil" hesaplarından.'));
    for (const u of (x.ozet.uyarilar || []).filter(u => u.kod === 'sahip-oneri')) l.push(bant(u.mesaj, 'uyari', dugme('Hesaplar', git('portfoy/hesaplar'), null, { class: 'p-dugme p-dugme-kucuk' })));
    return l.length ? el('div', { class: 'pn-bantlar' }, l) : null;
  }

  // ═══ PANO ═════════════════════════════════════════════════════════════════
  async function panoCiz(k, x) {
    const oz = x.ozet, d = oz.degerleme || {}, g = (oz.getiri || {})[birim()] || {};
    const kiyas = await kiyasAl(x);
    const islemler = await islemlerAl(x);
    const borsa = await borsaAl(x);
    const borsaEkle = borsa && borsa.okunan && !ciftSayim(oz) ? borsa.toplamUSD : 0;
    const kurU = kurNe();
    const portfoyHesap = new Set((d.hesaplar || []).map(h => h.id));
    const ol = O().hesapla(x.gecmis, { birim: birim(), bugun: oz.bugun, kiyas, deg: d, hesaplar: (oz.hesaplar || []).filter(h => portfoyHesap.has(h.id)),
      islemler: islemler.filter(i => portfoyHesap.has(i.hesap)), usdtry: d.kur && d.kur.USDTRY });
    const kiyasTum = kiyasGetiri(kiyas.qqq, null);
    const sag = O().saglik(ol, { kiyasGetiri: kiyasTum, dagilim: salt() ? null : oz.dagilim });
    const kap = oz.kapsam;
    const borsaAdlari = borsa ? (borsa.hesaplar || []).filter(h => !h.hata).map(h => h.ad) : [];
    const kapsamMetni = kap ? [kap.dahil.length || borsaEkle ? 'dahil: ' + [...kap.dahil, ...(borsaEkle ? borsaAdlari : [])].join(', ') : 'dahil hesap yok', kap.dahilDegil.length ? 'dahil değil: ' + kap.dahilDegil.join(', ') : null].filter(Boolean).join(' · ') : '';
    const yilBas = (oz.bugun || '').slice(0, 4) + '-01-01';
    const qYil = kiyasGetiri(kiyas.qqq, yilBas), bYil = kiyasGetiri(kiyas.btc, yilBas);
    const parcalar = [
      bantlar(x),
      el('div', { class: 'p-serit' }, [
        gosterge('Toplam değer', tutar(d.toplamUSD + borsaEkle, d.toplamTL + (kurU ? borsaEkle * kurU : 0)), kapsamMetni || 'hisse + kripto + nakit'),
        gosterge('Bu yıl · TWR', yuzde(g.yil, 1, true), `QQQ ${yuzde(qYil, 1, true)} · BTC ${yuzde(bYil, 1, true)}`, ton(g.yil)),
        gosterge('Başlangıçtan', yuzde(g.tum, 1, true), oz.seriBas ? `ilk kayıt ${AG.fmt.tarih(oz.seriBas)} · QQQ ${yuzde(kiyasTum, 1, true)}` : 'henüz seri yok', ton(g.tum)),
        gosterge('En derin düşüş', yuzde(ol.enDerinDusus, 1), `şu an tepeden ${yuzde(ol.simdiDusus, 1)} · en uzun ${sayiMi(ol.enUzunDususGun) ? ol.enUzunDususGun + ' gün' : '—'}`, ol.enDerinDusus < 0 ? 'p-neg' : ''),
        gosterge('Sharpe', sayiMi(ol.sharpe) ? tr(ol.sharpe, 2) : '—', sayiMi(ol.sharpe) ? 'getiri ÷ oynaklık (risksiz 0)' : 'en az 30 günlük seri gerekir', ''),
        gosterge('Oynaklık · yıllık', yuzde(ol.oynaklik, 1), sayiMi(ol.oynaklik) ? `Sortino ${kucukSayi(ol.sortino)} · Calmar ${kucukSayi(ol.calmar)}` : 'en az 30 günlük seri gerekir', '')
      ]),
      salt() ? portfoySatirlari(oz) : null,
      borsaSatiri(borsa, oz),
      el('div', { class: 'pn-uclu' }, [saglikKart(sag), dagilimKart(d, oz), yapilacakKart(oz, ol, d)]),
      // 67.4: grafik tam genişlikte (uç etiketleri + kıyas açıklamaları); ısı haritası yüzdeleriyle geniş sütunda, düşüş yanında.
      grafikKart(x, kiyas),
      (() => { const ds = dususKart(ol); return ds ? el('div', { class: 'pn-ikili' }, [aylikKart(ol), ds]) : aylikKart(ol); })()
    ];
    doldur(k, parcalar.filter(Boolean));
  }

  /** Kıyas serisinin (100 tabanlı [[t, v]]) bas gününden (yoksa ilk noktadan) sona getirisi. */
  function kiyasGetiri(n, bas) {
    if (!n || n.length < 2) return null;
    const t0 = bas ? Date.parse(bas + 'T00:00:00Z') : -Infinity;
    let ilkV = null;
    for (const [t, v] of n) if (t >= t0 && sayiMi(v)) { ilkV = v; break; }
    const son = n[n.length - 1][1];
    if (bas) { let once = null; for (const [t, v] of n) { if (t < t0 && sayiMi(v)) once = v; } if (once != null) ilkV = once; }
    return ilkV && sayiMi(son) ? son / ilkV - 1 : null;
  }

  function portfoySatirlari(oz) {
    const l = oz.portfoyOzetleri || [];
    return kart([kartBas('Portföyler'), tablo(['Portföy', 'Değer', 'Hesap', 'Hedef'].map((h, i) => el('th', { class: i === 1 ? 'p-sag' : null, text: h })), l.map(p => el('tr', null, [
        el('td', { text: p.ad }), el('td', { class: 'p-sag p-sayi', text: tutar(p.toplamUSD, p.toplamTL) }), el('td', { class: 'p-sayi', text: String(p.hesapSayisi) }),
        el('td', null, [p.hedefVar ? rozet('var', 'pos') : rozet('yok', 'warn')])
      ])))]);
  }

  /** Örümcek ağı: altı eksen, 0–100 (js/core/olcut.js saglik). */
  function saglikKart(sag) {
    const W = 400, H = 250, cx = 200, cy = 122, R = 86;   // yanlarda etiket payı
    const n = sag.eksenler.length;
    const nokta = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const halka = (f) => sag.eksenler.map((_, i) => nokta(i, R * f).map(v => v.toFixed(1)).join(',')).join(' ');
    const alan = sag.eksenler.map((e, i) => nokta(i, R * (sayiMi(e.puan) ? e.puan : 0) / 100).map(v => v.toFixed(1)).join(',')).join(' ');
    const etiketler = sag.eksenler.map((e, i) => {
      const [x, y] = nokta(i, R + 16);
      const yon = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
      return svg('text', { x: x.toFixed(1), y: (y + 4).toFixed(1), 'text-anchor': yon, class: 'pn-radar-etiket', text: `${e.ad} ${sayiMi(e.puan) ? Math.round(e.puan) : '—'}` });
    });
    const cizim = svg('svg', { class: 'pn-radar', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Portföy sağlığı: ' + sag.eksenler.map(e => `${e.ad} ${sayiMi(e.puan) ? Math.round(e.puan) : 'veri yok'}`).join(', ') }, [
      ...[1, 0.66, 0.33].map(f => svg('polygon', { points: halka(f), class: 'pn-radar-izgara' })),
      ...sag.eksenler.map((_, i) => { const [x, y] = nokta(i, R); return svg('line', { x1: cx, y1: cy, x2: x.toFixed(1), y2: y.toFixed(1), class: 'pn-radar-izgara' }); }),
      svg('polygon', { points: alan, class: 'pn-radar-alan' }),
      ...etiketler
    ]);
    return kart([
      kartBas('Portföy sağlığı', el('span', { class: 'pn-puan p-sayi', text: sayiMi(sag.puan) ? `${sag.puan}/100` : '—' })),
      cizim,
      el('p', { class: 'p-kart-alt', text: 'Her eksen 0–100, eşit ağırlık; eşikler kılavuzda. Getiri QQQ\'ya göre, maliyet son 365 günün ücretleri.' + (sag.hedefYok ? ' Hedef seçilmedi: "Hedefe yakınlık" 0.' : '') })
    ]);
  }

  /**
   * 67.4 (saf): dağılım dilimleri — tür 'sinif' | 'hesap' | 'para'; her dilimde içindeki varlıklar (aynı sembol hesaplar arasında
   * toplanır; nakit "USD nakit" gibi para birimiyle). Paylar TOPLAM portföye göre. En çok `enCok` dilim: fazlası tek "Diğer (n)"
   * dilimine iner ve onun öğeleri dilim adlarıdır (halka ve liste aynı listeden çizilir, halka hep tamamlanır).
   * Döndürür { toplam, dilimler: [{ anahtar, ad, v, pay, ogeler: [{ ad, v, pay }] }] } (büyükten küçüğe).
   */
  function dagilimDilimleri(d, siniflar, tur, enCok = 8) {
    const m = new Map();
    const ekle = (k, ad, oge, v) => {
      if (!sayiMi(v) || v <= 0) return;
      const x = m.get(k) || { anahtar: k, ad, v: 0, ogeler: new Map() };
      x.v += v; m.set(k, x);
      const o = x.ogeler.get(oge) || { ad: oge, v: 0 };
      o.v += v; x.ogeler.set(oge, o);
    };
    const S = siniflar || {};
    const yerlestir = (z, oge) => {
      if (tur === 'hesap') ekle(z.hesap, z.hesapAd || z.hesap, oge, z.degerUSD);
      else if (tur === 'para') ekle(z.para, z.para, oge, z.degerUSD);
      else ekle(z.sinif, S[z.sinif] || z.sinif, oge, z.degerUSD);
    };
    for (const p of (d && d.pozisyonlar) || []) if (Math.abs(p.adet) >= 1e-12) yerlestir(p, p.sembol || p.varlik);
    for (const n of (d && d.nakitler) || []) yerlestir(n, `${n.para} nakit`);
    const top = [...m.values()].reduce((t, x) => t + x.v, 0);
    const sirala = (l) => l.sort((a, b) => b.v - a.v);
    let l = sirala([...m.values()]);
    if (l.length > enCok) {
      const ust = l.slice(0, enCok - 1), alt = l.slice(enCok - 1);
      const ogeler = new Map(alt.map(x => [x.ad, { ad: x.ad, v: x.v }]));
      l = [...ust, { anahtar: 'diger', ad: `Diğer (${alt.length})`, v: alt.reduce((t, x) => t + x.v, 0), ogeler }];
    }
    return {
      toplam: top,
      dilimler: l.map(x => ({ anahtar: x.anahtar, ad: x.ad, v: x.v, pay: top > 0 ? x.v / top : 0,
        ogeler: sirala([...x.ogeler.values()]).map(o => ({ ad: o.ad, v: o.v, pay: top > 0 ? o.v / top : 0 })) }))
    };
  }
  /** Dilimin öğe satırı: "PYPL %4,1 · ASTS %3,2 · … +3 daha" (en çok 8 öğe yazılır). */
  function ogeMetni(ogeler, enCok = 8) {
    const l = ogeler || [];
    const yaz_ = l.slice(0, enCok).map(o => `${o.ad} ${yuzde(o.pay, 1)}`);
    if (l.length > enCok) yaz_.push(`+${l.length - enCok} daha`);
    return yaz_.join(' · ');
  }

  /** Dağılım halkası: Sınıf / Hesap / Para; altında dilim listesi (renk, ad, yüzde + içindeki varlıklar). */
  function dagilimKart(d, oz) {
    const siniflar = (oz.sabitler && oz.sabitler.siniflar) || {};
    const { dilimler: l } = dagilimDilimleri(d, siniflar, dagilimTur);
    let bas = 0;
    const C = 2 * Math.PI * 15.9155;
    const halkalar = l.map((x, i) => {
      const c = svg('circle', { cx: 21, cy: 21, r: 15.9155, class: `pn-halka pn-r${i + 1}`, 'stroke-dasharray': `${(x.pay * C).toFixed(3)} ${(C - x.pay * C).toFixed(3)}`, 'stroke-dashoffset': (25 - bas * 100).toFixed(3) }, [svg('title', { text: `${x.ad} ${yuzde(x.pay, 1)}` })]);
      bas += x.pay; return c;
    });
    return kart([
      kartBas('Dağılım', secici('Dağılım türü', [['sinif', 'Sınıf'], ['hesap', 'Hesap'], ['para', 'Para']], dagilimTur, (v) => { dagilimTur = v; yukle('pano'); })),
      l.length ? el('div', { class: 'pn-halka-duzen' }, [
        svg('svg', { class: 'pn-halka-svg', viewBox: '0 0 42 42', role: 'img', 'aria-label': 'Dağılım: ' + l.map(x => `${x.ad} ${yuzde(x.pay, 1)}`).join(', ') }, [svg('circle', { cx: 21, cy: 21, r: 15.9155, class: 'pn-halka pn-halka-zemin' }), ...halkalar]),
        el('ul', { class: 'pn-dilim-liste', id: 'pnDilimListe' }, l.map((x, i) => el('li', null, [
          el('div', { class: 'pn-dilim-bas' }, [el('span', { class: `pn-nokta pn-r${i + 1}`, 'aria-hidden': 'true' }), el('span', { class: 'pn-dilim-ad', text: x.ad }), el('span', { class: 'p-sayi', text: yuzde(x.pay, 1) })]),
          x.ogeler.length ? el('p', { class: 'pn-dilim-ogeler', text: ogeMetni(x.ogeler) }) : null
        ])))
      ]) : bos('Henüz varlık yok — Hesaplar\'dan hisse ya da nakit ekle.'),
      l.length ? el('p', { class: 'p-kart-alt', text: 'Varlıkların yanındaki yüzde, bütün portföy içindeki payıdır.' }) : null
    ]);
  }

  /** Yapman gerekenler: hedef, sapma, boşta nakit, bayat hesap / fiyat, sahip önerisi. */
  function yapilacaklar(oz, ol, d) {
    const l = [];
    const dag = oz.dagilim || {};
    if (!salt() && !dag.hedefVar) l.push({ metin: `${pAd(gorunum.portfoy)} için hedef henüz seçilmedi`, rozet: ['seç', 'warn'], yol: 'portfoy/hedefim' });
    if (!salt() && dag.hedefVar && dag.asimSayisi) {
      const en = (dag.dilimler || []).filter(x => x.asim).sort((a, b) => Math.abs(b.sapma) - Math.abs(a.sapma))[0];
      if (en) l.push({ metin: `${en.ad} hedeften ${yuzde(en.sapma, 1, true)} puan saptı`, rozet: ['denge', 'warn'], yol: 'portfoy/hedefim' });
    }
    if (sayiMi(ol.bostaNakit) && ol.bostaNakit > 0.2) l.push({ metin: `Boşta (faizsiz) nakit ${yuzde(ol.bostaNakit, 0)} — ${tutar(d.toplamUSD * ol.bostaNakit, d.toplamTL * ol.bostaNakit, 0)}`, rozet: ['karar', 'warn'], yol: 'portfoy/hedefim' });
    for (const u of oz.uyarilar || []) {
      if (u.kod === 'bayat-hesap') l.push({ metin: u.mesaj.split(' — ')[0], rozet: ['güncelle', ''], yol: 'portfoy/hesaplar' });
      else if (u.kod === 'sahip-oneri') l.push({ metin: u.mesaj.split(' — ')[0], rozet: ['taşı', 'info'], yol: 'portfoy/hesaplar' });
      else if (u.kod === 'fiyatsiz' || u.kod === 'kur-yok') l.push({ metin: u.mesaj.split(' — ')[0], rozet: ['eksik', 'neg'], yol: 'portfoy/hesaplar' });
    }
    return l;
  }
  function yapilacakKart(oz, ol, d) {
    const l = yapilacaklar(oz, ol, d);
    return kart([
      kartBas('Yapman gerekenler', l.length ? rozet(String(l.length), 'warn') : null),
      l.length ? el('ul', { class: 'pn-yapilacak' }, l.slice(0, 7).map(x => el('li', null, [
        el('span', { text: x.metin }), el('a', { class: `p-rozet${x.rozet[1] ? ' p-rozet-' + x.rozet[1] : ''} no-underline`, href: '#/' + x.yol, text: x.rozet[0] })
      ]))) : bos('Şu an yapılacak bir şey yok.'),
      salt() ? null : dugme('Hedefim →', git('portfoy/hedefim'), 'ana', { class: 'p-dugme p-dugme-ana pn-ust-bosluk' })
    ]);
  }

  /** Getiri grafiği: portföy (100 tabanlı TWR) + seçili kıyaslar; "Değer" kipinde değer + net yatırılan. */
  function grafikKart(x, kiyas) {
    const s = x.gecmis;
    const alan = birim() === 'TL' ? 'endeksTL' : 'endeksUSD', vAlan = birim() === 'TL' ? 'tl' : 'usd', aAlan = birim() === 'TL' ? 'akisTL' : 'akisUSD';
    const seriler = [];
    if (grafikTur === 'getiri') {
      const e = s.filter(z => sayiMi(z[alan])), e0 = e.length ? e[0][alan] : null;
      if (e0) seriler.push({ ad: 'Portföy', sinif: 'pn-cizgi-ana', n: e.map(z => [Date.parse(z.tarih + 'T00:00:00Z'), z[alan] / e0 * 100]) });
      for (const k of kiyasSecili) if (kiyas[k] && kiyas[k].length) seriler.push({ ad: KIYAS_AD[k] || k, sinif: `pn-cizgi-k pn-cizgi-${k}`, n: kiyas[k] });
    } else {
      let yat = null;
      const deger = [], yatirilan = [];
      for (const z of s) {
        if (!sayiMi(z[vAlan])) continue;
        const t = Date.parse(z.tarih + 'T00:00:00Z');
        yat = yat == null ? z[vAlan] : yat + (z[aAlan] || 0);   // ilk gün değeri = ilk yatırılan
        deger.push([t, z[vAlan]]); yatirilan.push([t, yat]);
      }
      seriler.push({ ad: 'Değer', sinif: 'pn-cizgi-ana', n: deger }, { ad: 'Net yatırılan', sinif: 'pn-cizgi-k', n: yatirilan });
    }
    // 67.4: her çizginin ucundaki son değer (getiride kat ya da yüzde — grafik boyunca tek biçim; değerde tutar).
    const sonlar = seriler.map(z => { const n = z.n.filter(p => sayiMi(p[1])); return n.length ? n[n.length - 1][1] : null; });
    const kat = grafikTur === 'getiri' && katBicimi(sonlar);
    seriler.forEach((z, i) => { z.uc = grafikTur === 'getiri' ? ucGetiriMetni(sonlar[i], kat) : (gizli() ? '•••' : sayiMi(sonlar[i]) ? SIMGE[birim()] + tr(sonlar[i], 0) : '—'); });
    const cips = Object.keys(KIYAS_AD).map(k => el('button', { type: 'button', class: 'p-cip', 'aria-pressed': kiyasSecili.has(k) ? 'true' : 'false', text: '+ ' + KIYAS_AD[k],
      onclick: () => { if (kiyasSecili.has(k)) kiyasSecili.delete(k); else kiyasSecili.add(k); yukle('pano'); } }));
    const secKiyas = Object.keys(KIYAS_AD).filter(k => kiyasSecili.has(k));
    const ilk = s.length ? s[0].tarih : null;
    return kart([
      kartBas('Değer · getiri — kıyasla', secici('Grafik', [['getiri', 'Getiri %'], ['deger', 'Değer + yatırılan']], grafikTur, (v) => { grafikTur = v; yukle('pano'); })),
      grafikTur === 'getiri' ? el('div', { class: 'pn-cipler' }, cips) : null,
      seriler.length && seriler[0].n.length > 1 ? cizgiGrafik(seriler, { yuzde: grafikTur === 'getiri', uclar: true }) : bos('Grafik ikinci kayıt gününden sonra çizilir.'),
      el('ul', { class: 'pn-gosterim pn-gosterim-yatay' }, seriler.map(z => el('li', null, [el('span', { class: `pn-cizgi-ornek ${z.sinif}`, 'aria-hidden': 'true' }), el('span', { text: z.ad }),
        el('span', { class: 'p-sayi pn-soluk', text: z.uc })]))),
      grafikTur === 'getiri' ? el('div', { class: 'pn-kiyas-aciklama', id: 'pnKiyasAciklama' }, [
        el('p', { class: 'p-kart-alt', text: `Bütün çizgiler ${ilk ? AG.fmt.tarih(ilk) + ' (portföyün ilk kaydı)' : 'portföyün ilk kaydı'} = 100 tabanlı ve seçili birimde (${birim() === 'TL' ? '₺' : '$'}). Uçtaki değer o günden bugüne: ${kat ? '×2 = paranın iki katı' : '+%10 = 100 → 110'}. Portföy çizgisi zaman ağırlıklıdır (para yatırma/çekme getiri sayılmaz).` }),
        secKiyas.length ? el('ul', { class: 'pn-kiyas-liste' }, secKiyas.map(k => el('li', null, [el('strong', { text: KIYAS_AD[k] + ': ' }), el('span', { text: KIYAS_ACIKLAMA[k] })]))) : null
      ]) : el('p', { class: 'p-kart-alt', text: 'Değer: portföyün o günkü toplamı. Net yatırılan: ilk günün değeri + sonraki para girişleri − çıkışları; aradaki fark kazancın.' })
    ], 'pn-genis');
  }
  /** 67.4 (saf): uç değerlerinden biri ≥ 200 (×2) ise bütün grafik kat biçiminde (×4,16), değilse yüzde (+%31,6). */
  const katBicimi = (sonlar) => (sonlar || []).some(v => sayiMi(v) && v >= 200);
  /** 67.4 (saf): 100 tabanlı son değer → "×4,16" (kat) ya da "+%31,6". */
  const ucGetiriMetni = (v, kat) => (!sayiMi(v) ? '—' : kat ? '×' + tr(v / 100, 2) : yuzde(v / 100 - 1, 1, true));

  /** Basit çizgi grafiği (SVG): seriler [{ ad, sinif, n: [[t, v]] }]. Gizli kipte değer ekseni yazılmaz. */
  function cizgiGrafik(seriler, o = {}) {
    const W = 700, H = 220, PL = 48, PR = o.uclar ? 66 : 8, PT = 8, PB = 22;
    const hepsi = seriler.flatMap(z => z.n).filter(p => sayiMi(p[1]));
    let t0 = Math.min(...hepsi.map(p => p[0])), t1 = Math.max(...hepsi.map(p => p[0]));
    let v0 = Math.min(...hepsi.map(p => p[1])), v1 = Math.max(...hepsi.map(p => p[1]));
    if (t1 === t0) t1 = t0 + 864e5;
    if (v1 === v0) { v1 += 1; v0 -= 1; }
    const pay = (v1 - v0) * 0.06; v0 -= pay; v1 += pay;
    const X = (t) => PL + (t - t0) / (t1 - t0) * (W - PL - PR), Y = (v) => PT + (1 - (v - v0) / (v1 - v0)) * (H - PT - PB);
    const izgara = [0, 0.5, 1].map(f => {
      const v = v0 + (v1 - v0) * f, y = Y(v).toFixed(1);
      const yazi = gizli() && !o.yuzde ? '' : o.yuzde ? tr(v, 0) : tr(v, 0);
      return [svg('line', { x1: PL, x2: W - PR, y1: y, y2: y, class: 'pn-izgara' }), svg('text', { x: PL - 6, y: (+y + 4).toFixed(1), 'text-anchor': 'end', class: 'pn-eksen', text: yazi })];
    }).flat();
    const tarihler = [t0, (t0 + t1) / 2, t1].map((t, i) => svg('text', { x: X(t).toFixed(1), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === 2 ? 'end' : 'middle', class: 'pn-eksen', text: AG.fmt.tarih(t) }));
    const cizgiler = seriler.map(z => svg('polyline', { class: `pn-cizgi ${z.sinif}`, points: z.n.filter(p => sayiMi(p[1])).map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ') }));
    // 67.4: uç etiketleri — çizginin bittiği yerin sağında, üst üste binmesin diye en az 13 birim aralıkla (yukarıdan aşağı itilir).
    const uclar = [];
    if (o.uclar) {
      const l = seriler.map(z => { const n = z.n.filter(p => sayiMi(p[1])); const p = n[n.length - 1]; return p && z.uc ? { z, x: X(p[0]), y: Y(p[1]) + 4 } : null; }).filter(Boolean).sort((a, b) => a.y - b.y);
      for (let i = 0; i < l.length; i++) l[i].y = Math.max(l[i].y, PT + 9, i ? l[i - 1].y + 13 : -Infinity);
      for (let i = l.length - 1; i >= 0; i--) l[i].y = Math.min(l[i].y, H - PB - 2 - (l.length - 1 - i) * 13);
      for (const u of l) uclar.push(svg('text', { x: (u.x + 4).toFixed(1), y: u.y.toFixed(1), class: `pn-uc-etiket ${u.z.sinif.split(' ').filter(c => c !== 'pn-cizgi-k').map(c => c.replace('pn-cizgi-', 'pn-uc-')).join(' ')}`, text: u.z.uc }));
    }
    return svg('svg', { class: 'pn-grafik', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': seriler.map(z => z.ad + (z.uc ? ' ' + z.uc : '')).join(', ') + ' grafiği' }, [...izgara, ...tarihler, ...cizgiler, ...uclar]);
  }

  /** Aylık getiri ısı haritası (yıl × ay) + kazanan ay oranı. */
  function aylikKart(ol) {
    const aylar = ol.aylar || [];
    const yillar = [...new Set(aylar.map(a => a.ay.slice(0, 4)))];
    const m = new Map(aylar.map(a => [a.ay, a]));
    // Yıl sütunu çarpı kat eşikle renklenir (yıllık getiri aylıktan büyük olur).
    const sinif = (r, c = 1) => (!sayiMi(r) ? 'pn-isi-bos' : r >= 0.05 * c ? 'pn-isi-p3' : r >= 0.02 * c ? 'pn-isi-p2' : r > 0 ? 'pn-isi-p1' : r <= -0.05 * c ? 'pn-isi-n3' : r <= -0.02 * c ? 'pn-isi-n2' : r < 0 ? 'pn-isi-n1' : 'pn-isi-bos');
    const yilTop = yilToplamlari(aylar);
    return kart([
      kartBas('Aylık getiri (%)'),
      yillar.length ? el('div', { class: 'pn-isi-kap', id: 'pnIsi' }, [el('div', { class: 'pn-isi' }, [
        // 68.4: ilk sütun (yıl) telefonda yana kaydırınca sabit kalır (.pn-isi-sabit, css/components.css).
        el('span', { class: 'pn-isi-sabit' }), ...AY_KISA.map(a => el('span', { class: 'pn-isi-bas', text: a })), el('span', { class: 'pn-isi-bas', text: 'Yıl' }),
        ...yillar.flatMap(y => [el('span', { class: 'pn-isi-bas pn-isi-sabit', text: y }), ...AY_KISA.map((_, i) => {
          const a = m.get(`${y}-${String(i + 1).padStart(2, '0')}`);
          return el('span', { class: `pn-isi-hucre ${sinif(a && a.r)}${a && !a.tam ? ' pn-isi-yarim' : ''}`, title: a ? `${AY_AD[i]} ${y}: ${yuzde(a.r, 1, true)}${a.tam ? '' : ' (yarım ay)'}` : `${AY_AD[i]} ${y}: veri yok`, text: a ? isiMetni(a.r) : '' });
        }), el('span', { class: `pn-isi-hucre pn-isi-yil ${sinif(yilTop.get(y), 3)}`, title: `${y} yılı (bileşik, veri olan aylar): ${yuzde(yilTop.get(y), 1, true)}`, text: isiMetni(yilTop.get(y)) })])
      ])]) : bos('Aylık getiri ilk ay bitince görünür.'),
      el('p', { class: 'p-kart-alt', text: (ol.tamAy ? `Kazanan ay ${yuzde(ol.kazananAyOrani, 0)} (${ol.tamAy} tam ay) · en iyi ${ol.enIyiAy ? yuzde(ol.enIyiAy.r, 1, true) : '—'} · en kötü ${ol.enKotuAy ? yuzde(ol.enKotuAy.r, 1, true) : '—'}.` : 'Tam ay yok.') + ' İlk ve süren ay yarım sayılır (soluk). Yıl = o yılın aylarının bileşiği.' })
    ]);
  }
  /** 67.4 (saf): ısı haritası hücre metni — 1 ondalık, işaretli, % işaretsiz ("+2,3", "−1,0", "0,0"); başlıkta "(%)" yazar. */
  function isiMetni(r) {
    if (!sayiMi(r)) return '';
    const m = Math.abs(r * 100).toFixed(1);
    return (Number(m) === 0 ? '' : r < 0 ? '−' : '+') + m.replace('.', ',');
  }
  /** 67.4 (saf): olcut.aylik çıktısından yıl → bileşik getiri (veri olan aylar; yarım aylar dahil). */
  function yilToplamlari(aylar) {
    const m = new Map();
    for (const a of aylar || []) { if (!sayiMi(a.r)) continue; const y = a.ay.slice(0, 4); m.set(y, (m.has(y) ? (1 + m.get(y)) * (1 + a.r) : 1 + a.r) - 1); }
    return m;
  }

  function dususKart(ol) {
    const s = ol.dususSeri || [];
    if (s.length < 2) return null;
    const W = 1000, H = 110;
    const enD = Math.min(-0.01, ...s.map(x => x.d));
    const X = (i) => i / (s.length - 1) * W, Y = (d) => 4 + d / enD * (H - 8);
    const p = s.map((x, i) => `${X(i).toFixed(1)},${Y(x.d).toFixed(1)}`).join(' ');
    return kart([
      kartBas('Düşüş (tepeden) ve toparlanma'),
      svg('svg', { class: 'pn-dusus', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `Düşüş grafiği, en derin ${yuzde(ol.enDerinDusus, 1)}` }, [
        svg('line', { x1: 0, x2: W, y1: 4, y2: 4, class: 'pn-izgara' }),
        svg('polygon', { class: 'pn-dusus-alan', points: `0,4 ${p} ${W},4` }), svg('polyline', { class: 'pn-dusus-cizgi', points: p })
      ]),
      el('p', { class: 'p-kart-alt', text: `En derin ${yuzde(ol.enDerinDusus, 1)} · en uzun düşüş ${sayiMi(ol.enUzunDususGun) ? ol.enUzunDususGun + ' gün' : '—'} · toparlanma ${sayiMi(ol.toparlanmaGun) ? ol.toparlanmaGun + ' gün' : 'henüz dönmedi'} · Ulcer ${kucukSayi(ol.ulcer, 1)} · şu an ${yuzde(ol.simdiDusus, 1)}` })
    ]);
  }

  /** K-E: kripto borsaları satırı (toplama dahil) — hesap başına değer ya da hata, saat, Yenile. */
  function borsaSatiri(b, oz) {
    if (gorunum.portfoy !== 'ben' && gorunum.portfoy !== 'tumu') return null;
    const l = (b && b.hesaplar) || [];
    if (!b) return el('div', { class: 'p-kart-kat pn-bot-satiri' }, [el('span', { class: 'pn-soluk', text: 'Kripto borsaları: bakiye okunamadı (İşlem defteri).' })]);
    if (!l.length) return null;
    const ciftte = ciftSayim(oz);
    const parca = l.map(h => `${h.ad} ${h.hata ? '— ' + h.hata : (gizli() ? '•••' : '$' + tr(h.toplamUSD, 0))}${!h.hata && h.borsa === 'binance' && h.vadeliUSD == null ? ' (yalnız spot)' : ''}`);
    return el('div', { class: 'p-kart-kat pn-bot-satiri' }, [
      el('span', { class: 'pn-soluk', text: ciftte ? 'Kripto borsaları (Portföyüm\'de kripto borsası hesabı var — çift sayılmasın diye toplama EKLENMEDİ): ' : 'Kripto borsaları (toplama dahil): ' }),
      el('span', { class: 'p-sayi', text: parca.join(' · ') }),
      el('span', { class: 'pn-soluk', text: b.zaman ? `· ${AG.fmt.saat(b.zaman)}` : '' }),
      el('button', { type: 'button', class: 'p-dugme p-dugme-kucuk pn-sag-bag', text: 'Yenile', onclick: async (e) => { AG.dom.mesgul(e.currentTarget, '…'); const x = onbellek.get(gorunum.portfoy); if (x) await borsaAl(x, true); yukle('pano'); } })
    ]);
  }

  // ═══ VARLIKLAR ════════════════════════════════════════════════════════════
  function varliklarCiz(k, x) {
    const d = x.ozet.degerleme || {};
    const acik = (p) => Math.abs(p.adet) > 1e-12;
    const l = (d.pozisyonlar || []).filter(p => varlikSuzgec === 'hepsi' || (varlikSuzgec === 'acik' ? acik(p) : !acik(p))).sort((a, b) => (b.degerUSD || 0) - (a.degerUSD || 0));
    const satir = (p) => el('tr', null, [
      el('td', null, [el('strong', { text: p.sembol }), el('span', { class: 'pn-soluk pn-alt-satir', text: p.ad && p.ad !== p.sembol ? p.ad : '' })]),
      el('td', { text: p.hesapAd }),
      el('td', { class: 'p-sag p-sayi', text: acik(p) ? tr(p.adet, p.adet % 1 ? 4 : 0) : '0' }),
      el('td', { class: 'p-sag p-sayi', text: kendi(p.ortMaliyet, p.para) }),
      el('td', { class: 'p-sag p-sayi', text: kendi(p.fiyat, p.para) }),
      el('td', { class: 'p-sag p-sayi', text: acik(p) ? tutar(p.degerUSD, p.degerTL) : '—' }),
      el('td', { class: `p-sag p-sayi ${ton(p.kzOrt)}`, text: acik(p) ? `${kendi(p.kzOrt, p.para)} ${sayiMi(p.kzYuzde) ? '(' + yuzde(p.kzYuzde, 1, true) + ')' : ''}` : '' }),
      el('td', { class: `p-sag p-sayi ${ton(p.gerceklesenFifo)}`, text: sayiMi(p.gerceklesenFifo) && Math.abs(p.gerceklesenFifo) > 1e-9 ? kendi(p.gerceklesenFifo, p.para) : '' }),
      el('td', { class: 'p-sag p-sayi', text: acik(p) ? yuzde(p.agirlik, 1) : '' })
    ]);
    const nakit = (d.nakitler || []).filter(n => Math.abs(n.tutar) > 1e-9);
    const gerc = (d.pozisyonlar || []).filter(p => sayiMi(p.gerceklesenFifo) && Math.abs(p.gerceklesenFifo) > 1e-9);
    doldur(k, [
      bantlar(x),
      kart([
        kartBas('Elde olanlar', secici('Süzgeç', [['acik', 'Açık'], ['kapali', 'Kapanmış'], ['hepsi', 'Hepsi']], varlikSuzgec, (v) => { varlikSuzgec = v; yukle('varliklar'); })),
        l.length ? tablo(['Varlık', 'Hesap', 'Adet', 'Ort. maliyet', 'Fiyat', 'Değer', 'K/Z', 'Gerçekleşen', 'Pay'].map((h, i) => el('th', { class: i > 1 ? 'p-sag' : null, text: h })), l.map(satir)) : bos(varlikSuzgec === 'kapali' ? 'Kapanmış pozisyon yok.' : 'Henüz varlık yok — Hesaplar\'dan ekle.', dugme('Hesaplar', git('portfoy/hesaplar'))),
        el('p', { class: 'p-kart-alt', text: 'Maliyet ve K/Z varlığın kendi para biriminde (ortalama maliyet); değer seçili birimde. Gerçekleşen = satışların FIFO kârı.' })
      ]),
      kart([kartBas('Nakit'), nakit.length ? tablo(['Hesap', 'Para', 'Tutar', 'Değer', 'Pay'].map((h, i) => el('th', { class: i > 1 ? 'p-sag' : null, text: h })), nakit.map(n => el('tr', null, [el('td', { text: n.hesapAd }), el('td', { text: n.para }), el('td', { class: 'p-sag p-sayi', text: kendi(n.tutar, n.para) }),
          el('td', { class: 'p-sag p-sayi', text: tutar(n.degerUSD, n.degerTL) }), el('td', { class: 'p-sag p-sayi', text: yuzde(n.agirlik, 1) })]))) : bos('Nakit yok.')]),
      gerc.length ? kart([kartBas('Kapanan pozisyonlar — gerçekleşen'), el('div', { class: 'pn-cipler' }, gerc.map(p => el('span', { class: 'p-cip' }, [
        el('span', { text: p.sembol + ' ' }), el('span', { class: `p-sayi ${ton(p.gerceklesenFifo)}`, text: (p.gerceklesenFifo > 0 ? '+' : '') + kendi(p.gerceklesenFifo, p.para) })])))]) : null
    ].filter(Boolean));
  }

  // ═══ HEDEFİM ══════════════════════════════════════════════════════════════
  function hedefimCiz(k, x) {
    // 67.3: "Para ekle ve dağılımı değiştir" planlayıcısı aynı kapta (js/pages/paraEkle.js); "← Hedefim" geri döner.
    if (paraEkleAcik && AG.pages.paraEkle) {
      return AG.pages.paraEkle.ciz(k, { x, pid: gorunum.portfoy, pAd, salt: salt(), geri: () => { paraEkleAcik = false; yukle('hedefim'); }, yenile: tazele });
    }
    const oz = x.ozet, d = oz.degerleme || {}, dag = oz.dagilim || {};
    const siniflar = (oz.sabitler && oz.sabitler.siniflar) || {};
    const h = dag.hedef;
    const toplam = d.toplamUSD || 0;
    const parcalar = [bantlar(x), kart([
      kartBas('Hedef ne demek?'),
      el('p', { class: 'pn-metin', text: 'Hedef, paranın nasıl bölünmesini istediğindir — ör. "%50 endeks, %40 kripto, %10 nakit". Getiri hedefi değildir. Fiyatlar oynadıkça bölünme kayar; bu sayfa "olması gereken" ile "şu an olan"ı yan yana koyar ve farkı kapatmak için ne alıp ne satacağını dolar olarak söyler.' }),
      el('p', { class: 'p-kart-alt', text: salt() ? '"Tümü" görünümünde hedef girilmez — bir portföy seç (her portföyün kendi hedefi var).' : h ? `${pAd(gorunum.portfoy)} hedefi: ${h.kaynak || 'elle'} · ${h.duzey === 'sinif' ? 'sınıf' : 'varlık'} düzeyi · sapma bandı ±${h.bant} puan.` : `${pAd(gorunum.portfoy)} için henüz hedef seçilmedi. Aşağıdan birini seç.` })
    ], 'p-kart-vurgu'), kart([
      kartBas('Para ekle ve dağılımı değiştir'),
      el('p', { class: 'pn-metin', text: 'Portföye para ekleyeceksen ya da hisselerin payını değiştireceksen: hangi hisseden kaç adet alıp satacağını hesaplar, satışta elinde kaç adet kalması gerektiğini söyler; yaptıktan sonra tek düğmeyle kaydeder. Botların tuttuğu hisseler de listede.' }),
      dugme('Planla →', () => { paraEkleAcik = true; yukle('hedefim'); }, 'ana', { id: 'btnPnParaEkle', class: 'p-dugme p-dugme-ana pn-ust-bosluk' })
    ], null)];
    if (!salt()) parcalar.push(hedefSecKart(h, siniflar, oz));
    parcalar.push(farkKart(dag, toplam), islerKart(dag, d, toplam));
    doldur(k, parcalar.filter(Boolean));
    hedefToplamYaz();
  }

  /**
   * 68.7: varlık düzeyi satırları — bu portföyde tutulanlar önce (değer sırası), sonra kayıtlı hedefte olup elde olmayanlar,
   * sonra tanımlı diğer varlıklar; nakit 'nakit:<PARA>'. Anahtarlar sunucunun varlık düzeyi hedefiyle aynı (varlık id).
   */
  function varlikHedefSatirlari(oz, h) {
    const d = oz.degerleme || {};
    const ad = new Map((oz.varliklar || []).map(v => [v.id, v.sembol ? `${v.sembol}${v.ad && v.ad !== v.sembol ? ' — ' + v.ad : ''}` : v.id]));
    const out = new Map();
    for (const p of (d.pozisyonlar || []).slice().sort((a, b) => (b.degerUSD || 0) - (a.degerUSD || 0))) if (p.varlik && !out.has(p.varlik)) out.set(p.varlik, { ad: ad.get(p.varlik) || p.sembol || p.varlik, elde: true });
    for (const n of d.nakitler || []) { const k = 'nakit:' + n.para; if (!out.has(k)) out.set(k, { ad: `${n.para} nakit`, elde: true }); }
    if (h && h.duzey === 'varlik') for (const k of Object.keys(h.agirliklar || {})) if (!out.has(k)) out.set(k, { ad: k.startsWith('nakit:') ? `${k.slice(6)} nakit` : (ad.get(k) || k), elde: false });
    for (const [k, a] of ad) if (!out.has(k)) out.set(k, { ad: a, elde: false });
    return [...out.entries()].map(([anahtar, x]) => ({ anahtar, ...x }));
  }

  function hedefSecKart(h, siniflar, oz) {
    const secim = hedefSecim || (h && h.duzey === 'sinif' ? 'kendi' : h && h.duzey === 'varlik' ? 'varlik' : null);
    const kutu = (k, ad, alt) => el('button', { type: 'button', class: 'pn-secenek', 'aria-pressed': secim === k ? 'true' : 'false', onclick: () => { hedefSecim = k; yukle('hedefim'); } },
      [el('strong', { text: ad }), el('span', { class: 'pn-soluk', text: alt })]);
    const hazir = HAZIR_HEDEF.find(z => z.k === secim);
    const varlikDuzey = secim === 'varlik';
    const mevcut = h && h.duzey === (varlikDuzey ? 'varlik' : 'sinif') ? h.agirliklar : {};
    const alan = (anahtar, ad, deger, soluk) => el('div', { class: 'p-alan pn-hedef-alan' }, [
      el('label', { for: 'pnHedef-' + anahtar, text: ad, class: soluk ? 'pn-soluk' : null }),
      el('input', { id: 'pnHedef-' + anahtar, type: 'number', min: '0', max: '100', step: '0.5', inputmode: 'decimal', value: String(deger || ''), 'data-anahtar': anahtar, oninput: hedefToplamYaz })
    ]);
    const girdiler = varlikDuzey
      ? varlikHedefSatirlari(oz, h).map(r => alan(r.anahtar, r.elde ? r.ad : `${r.ad} (elde yok)`, mevcut[r.anahtar], !r.elde))
      : Object.entries(siniflar).map(([s, ad]) => alan(s, ad, hazir ? hazir.agirlik[s] : mevcut[s]));
    const bantDeger = h && h.bant != null ? h.bant : 5;
    return kart([
      kartBas('1 · Hedefini seç'),
      el('div', { class: 'pn-secenekler' }, [...HAZIR_HEDEF.map(z => kutu(z.k, z.ad, z.alt)), kutu('kendi', 'Kendim gireyim', 'sınıf yüzdeleri'), kutu('varlik', 'Varlık varlık gireyim', 'hisse / fon / nakit yüzdeleri')]),
      secim ? el('div', { class: 'pn-hedef-form pm-yazma' }, [
        el('div', { class: 'pn-hedef-izgara' }, girdiler),
        el('div', { class: 'pn-hedef-alt' }, [
          el('span', { id: 'pnHedefToplam', class: 'p-sayi', text: '' }),
          el('div', { class: 'p-alan pn-hedef-alan' }, [
            el('label', { for: 'pnHedefBant', text: 'Sapma bandı (± puan)' }),
            el('input', { id: 'pnHedefBant', type: 'number', min: '0', max: '50', step: '0.5', inputmode: 'decimal', value: String(bantDeger) })
          ]),
          dugme('Hedefi kaydet', (e) => hedefKaydet(e.currentTarget, hazir ? hazir.ad : 'elle', varlikDuzey ? 'varlik' : 'sinif'), 'ana', { 'data-kilit': 'telefon', id: 'btnPnHedefKaydet' })
        ]),
        el('p', { class: 'p-kart-alt', text: varlikDuzey
          ? 'Her hisse, fon ve nakit için yüzde girin; boş bırakılan %0 sayılır. Toplam %100 olmalı. Bandın dışındaki fark "Yapman gerekenler"e düşer. Varlık düzeyi hedef sınıf hedefinin yerine geçer.'
          : 'Toplam %100 olmalı. Bandın dışındaki fark "Yapman gerekenler"e düşer. Modellerin hisse listesi Modeller sayfasında.' })
      ]) : null
    ]);
  }
  function hedefAgirliklari() {
    const ag = {};
    doc.querySelectorAll('#pfYeni-hedefim input[data-anahtar]').forEach(i => { const v = Number(String(i.value).replace(',', '.')); if (Number.isFinite(v) && v > 0) ag[i.getAttribute('data-anahtar')] = v; });
    return ag;
  }
  function hedefToplamYaz() {
    const k = bul('pnHedefToplam');
    if (!k) return;
    const t = Object.values(hedefAgirliklari()).reduce((s, v) => s + v, 0);
    k.textContent = `Toplam %${tr(t, 0)}${Math.abs(t - 100) < 0.01 ? ' ✓' : ' — %100 olmalı'}`;
    k.className = `p-sayi ${Math.abs(t - 100) < 0.01 ? 'p-pos' : 'p-neg'}`;
  }
  function hedefKaydet(d, kaynak, duzey = 'sinif') {
    const ag = hedefAgirliklari();
    const t = Object.values(ag).reduce((s, v) => s + v, 0);
    if (Math.abs(t - 100) > 0.01) { if (AG.bildir) AG.bildir(`Ağırlıklar toplamı %${tr(t, 1)} — %100 olmalı.`, 'uyari'); return; }
    const bk = bul('pnHedefBant'), bant = bk ? Number(String(bk.value).replace(',', '.')) : 5;
    if (!Number.isFinite(bant) || bant < 0 || bant > 50) { if (AG.bildir) AG.bildir('Sapma bandı 0–50 puan arası olmalı.', 'uyari'); return; }
    hedefSecim = null;
    yazma(d, () => api().hedefKaydet({ duzey, agirliklar: ag, bant, kaynak, portfoy: gorunum.portfoy }), `${pAd(gorunum.portfoy)} hedefi kaydedildi.`);
  }

  function farkKart(dag, toplam) {
    if (!dag.hedefVar) return kart([kartBas('2 · Olması gereken ↔ şu an'), bos('Hedef seçilince her kalemin olması gereken ve şu anki payı burada yan yana durur.')]);
    const l = dag.dilimler || [];
    return kart([
      kartBas('2 · Olması gereken ↔ şu an'),
      tablo(['Ne', 'Olması gereken', 'Şu an', 'Görsel', 'Ne yapmalı'].map((h, i) => el('th', { class: i === 1 || i === 2 || i === 4 ? 'p-sag' : null, text: h })), l.map(z => {
          const fark = ((z.hedef || 0) - (z.gercek || 0)) * toplam;
          return el('tr', null, [
            el('td', { text: z.ad }), el('td', { class: 'p-sag p-sayi', text: yuzde(z.hedef || 0, 1) }), el('td', { class: 'p-sag p-sayi', text: yuzde(z.gercek, 1) }),
            el('td', null, [cubuk(z.gercek, z.hedef)]),
            el('td', { class: `p-sag p-sayi${z.asim ? (fark > 0 ? ' p-pos' : ' p-neg') : ''}`, text: Math.abs(fark) < 1 ? 'tamam' : `${fark > 0 ? 'al' : 'azalt'} ${usdTutar(Math.abs(fark), 0)}` })
          ]);
        })),
      el('p', { class: 'p-kart-alt', text: `Mor dolgu: şu an · çizgi: olması gereken. Renkli satırlar sapma bandının (±${tr((dag.bant || 0.05) * 100, 0)} puan) dışında.` })
    ]);
  }
  /** Şu an (dolgu) ↔ hedef (çizgi) çubuğu. */
  function cubuk(g, h) {
    const w = Math.max(0, Math.min(100, (g || 0) * 100)), hx = Math.max(0, Math.min(100, (h || 0) * 100));
    return svg('svg', { class: 'pn-cubuk', viewBox: '0 0 100 12', preserveAspectRatio: 'none', role: 'img', 'aria-label': `şu an ${yuzde(g, 0)}, hedef ${yuzde(h || 0, 0)}` }, [
      svg('rect', { x: 0, y: 2, width: 100, height: 8, rx: 4, class: 'pn-cubuk-zemin' }), svg('rect', { x: 0, y: 2, width: w.toFixed(1), height: 8, rx: 4, class: 'pn-cubuk-dolu' }),
      svg('rect', { x: Math.max(0, hx - 0.6).toFixed(1), y: 0, width: 1.2, height: 12, class: 'pn-cubuk-hedef' })
    ]);
  }

  /** 3 · Hangi hesapta ne: alım → en çok nakdi olan hesap; azaltma → o kalemi en çok tutan hesaplar. ÖNERİ — emir gönderilmez. */
  function islerKart(dag, d, toplam) {
    if (!dag.hedefVar) return null;
    const nakitHesap = new Map();
    for (const n of d.nakitler || []) if (sayiMi(n.degerUSD) && n.degerUSD > 0) nakitHesap.set(n.hesapAd, (nakitHesap.get(n.hesapAd) || 0) + n.degerUSD);
    const enNakit = [...nakitHesap.entries()].sort((a, b) => b[1] - a[1])[0];
    const isler = [];
    for (const z of (dag.dilimler || []).filter(x => x.asim)) {
      const fark = ((z.hedef || 0) - (z.gercek || 0)) * toplam;
      if (fark > 0) isler.push({ hesap: enNakit ? enNakit[0] : '—', islem: 'Al', ne: z.ad, tutar: fark, neden: enNakit ? `en çok nakit bu hesapta (${usdTutar(enNakit[1], 0)})` : 'nakit yok — önce para yatır' });
      else {
        const tutan = (d.pozisyonlar || []).filter(p => (dag.duzey === 'sinif' ? p.sinif === z.anahtar : p.varlik === z.anahtar) && sayiMi(p.degerUSD) && p.degerUSD > 0)
          .concat((d.nakitler || []).filter(n => (dag.duzey === 'sinif' ? n.sinif === z.anahtar : 'nakit:' + n.para === z.anahtar) && n.degerUSD > 0).map(n => ({ hesapAd: n.hesapAd, degerUSD: n.degerUSD, sembol: n.para + ' nakit' })))
          .sort((a, b) => b.degerUSD - a.degerUSD);
        const t = tutan[0];
        isler.push({ hesap: t ? t.hesapAd : '—', islem: z.anahtar === 'nakit' || z.anahtar === 'tl-nakit' ? 'Kullan' : 'Azalt', ne: t && t.sembol ? `${z.ad} (${t.sembol})` : z.ad, tutar: -fark, neden: 'hedefin üstünde' });
      }
    }
    return kart([
      kartBas('3 · Hangi hesapta ne yapılacak'),
      isler.length ? tablo(['Hesap', 'İşlem', 'Ne', 'Tutar', 'Neden'].map((h, i) => el('th', { class: i === 3 ? 'p-sag' : null, text: h })), isler.map(i => el('tr', null, [el('td', { text: i.hesap }), el('td', null, [rozet(i.islem, i.islem === 'Al' ? 'pos' : 'warn')]), el('td', { text: i.ne }),
          el('td', { class: 'p-sag p-sayi', text: usdTutar(i.tutar, 0) }), el('td', { class: 'pn-soluk', text: i.neden })]))) : bos('Bütün kalemler sapma bandının içinde — bu ay işlem gerekmiyor.'),
      el('p', { class: 'p-kart-alt', text: 'Öneri: emir gönderilmez. Yaptıktan sonra işlemi Hesaplar\'dan gir. Yeni para eklersen önce eksik kalanlara dağıt (satış gerekmez).' })
    ]);
  }

  // ═══ TAKVİM VE AKIŞ ═══════════════════════════════════════════════════════
  async function takvimCiz(k, x) {
    const oz = x.ozet;
    const islemler = await islemlerAl(x);
    const hesapSet = new Set(((oz.degerleme || {}).hesaplar || []).map(h => h.id));
    const kz = O().gunlukKz(x.gecmis, birim() === 'TL' ? 'tl' : 'usd');
    const son = x.gecmis.length ? x.gecmis[x.gecmis.length - 1].tarih : oz.bugun;
    if (!takvimAy) takvimAy = (son || oz.bugun || '').slice(0, 7);
    const [y, m] = takvimAy.split('-').map(Number);
    const ayGun = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const bosluk = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    let ayToplam = 0;
    const hucreler = [];
    for (let i = 0; i < bosluk; i++) hucreler.push(el('div', { class: 'pn-gun pn-gun-bos' }));
    for (let g = 1; g <= ayGun; g++) {
      const t = `${takvimAy}-${String(g).padStart(2, '0')}`, v = kz.get(t);
      if (sayiMi(v)) ayToplam += v;
      const s = !sayiMi(v) || Math.abs(v) < 0.005 ? '' : v > 0 ? (Math.abs(v) > 50 ? ' pn-gun-p2' : ' pn-gun-p1') : (Math.abs(v) > 50 ? ' pn-gun-n2' : ' pn-gun-n1');
      hucreler.push(el('div', { class: `pn-gun${s}`, title: sayiMi(v) ? `${AG.fmt.tarih(t)}: ${tutar(v, v)}` : AG.fmt.tarih(t) }, [
        el('span', { class: 'pn-gun-no', text: String(g) }), sayiMi(v) && Math.abs(v) >= 0.005 ? el('span', { class: `p-sayi ${ton(v)}`, text: gizli() ? '•••' : (v > 0 ? '+' : '−') + tr(Math.abs(v), Math.abs(v) >= 100 ? 0 : 2) }) : null
      ]));
    }
    const ayDegis = (n) => () => { const t = new Date(Date.UTC(y, m - 1 + n, 1)); takvimAy = t.toISOString().slice(0, 7); yukle('takvim'); };
    // Zaman çizelgesi: işlemler (portföyün hesapları) + yaklaşan vadeler
    const ISLEM_AD = (AG.pages.portfoyum && AG.pages.portfoyum.ISLEM_AD) || {};
    const olaylar = islemler.filter(i => hesapSet.has(i.hesap) || hesapSet.has(i.hedefHesap)).map(i => ({
      tarih: i.tarih, tur: ['temettu', 'faiz'].includes(i.islem) ? 'gelir' : 'islem',
      metin: `${ISLEM_AD[i.islem] || i.islem}${i.varlik ? ' · ' + varlikAd(oz, i.varlik) : ''}${sayiMi(i.adet) ? ' · ' + tr(i.adet, i.adet % 1 ? 4 : 0) + ' adet' : ''}${sayiMi(i.fiyat) ? ' @ ' + kendi(i.fiyat, i.para) : ''}${sayiMi(i.tutar) ? ' · ' + kendi(i.tutar, i.para) : ''}${i._otomatik ? ' (otomatik)' : ''}`
    }));
    for (const h of oz.hesaplar || []) if (hesapSet.has(h.id) && h.faizSiradaki) olaylar.push({ tarih: h.faizSiradaki.son, tur: 'yaklasan', metin: `${h.ad}: mevduat vadesi doluyor (faiz ${h.faiz ? '%' + tr(h.faiz.oran, 1) : ''})` });
    const sec = olaylar.filter(o => akisSuzgec === 'hepsi' || o.tur === akisSuzgec).sort((a, b) => (a.tarih < b.tarih ? 1 : -1)).slice(0, 60);
    const TUR_AD = { islem: 'işlem', gelir: 'gelir', yaklasan: 'yaklaşan' };
    doldur(k, [
      bantlar(x),
      kart([
        kartBas(`${AY_AD[m - 1]} ${y} — günlük K/Z`, el('div', { class: 'pn-ay-gezin' }, [
          el('span', { class: `p-sayi ${ton(ayToplam)}`, text: gizli() ? '•••' : `ay: ${(ayToplam >= 0 ? '+' : '−') + SIMGE[birim()] + tr(Math.abs(ayToplam), 0)}` }),
          dugme('‹', ayDegis(-1), null, { 'aria-label': 'Önceki ay', class: 'p-dugme p-dugme-simge p-dugme-kucuk' }), dugme('›', ayDegis(1), null, { 'aria-label': 'Sonraki ay', class: 'p-dugme p-dugme-simge p-dugme-kucuk' })
        ])),
        el('div', { class: 'pn-takvim' }, [...['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(g => el('span', { class: 'pn-isi-bas', text: g })), ...hucreler]),
        el('p', { class: 'p-kart-alt', text: 'Günlük K/Z = günün değeri − dünkü değer − o günkü para girişi/çıkışı (para yatırmak kâr değildir). Fiyatsız günler boş.' })
      ]),
      kart([
        kartBas('Zaman çizelgesi', secici('Akış süzgeci', [['hepsi', 'Hepsi'], ['islem', 'İşlem'], ['gelir', 'Gelir'], ['yaklasan', 'Yaklaşan']], akisSuzgec, (v) => { akisSuzgec = v; yukle('takvim'); })),
        sec.length ? el('ol', { class: 'pn-akis' }, sec.map(o => el('li', null, [
          el('span', { class: 'p-sayi pn-soluk', text: AG.fmt.tarih(o.tarih) }), el('span', { class: `pn-akis-nokta pn-akis-${o.tur}`, 'aria-hidden': 'true' }),
          el('span', { text: o.metin }), rozet(TUR_AD[o.tur], o.tur === 'gelir' ? 'pos' : o.tur === 'yaklasan' ? 'vurgu' : '')
        ]))) : bos('Bu süzgeçte olay yok.')
      ])
    ].filter(Boolean));
  }
  const varlikAd = (oz, id) => { const v = (oz.varliklar || []).find(z => z.id === id); return v ? v.sembol : id; };

  // ═══ HESAPLAR: portföy kartı ═══════════════════════════════════════════════
  async function hesaplarKart() {
    const bol = bul('pfBolum-hesaplar');
    if (!bol) return;
    let k = bul('pnPortfoyKart');
    if (!k) { k = el('div', { id: 'pnPortfoyKart', class: 'pn-ust-kart' }); bol.insertBefore(k, bol.firstChild); }
    try {
      const x = await veri(false, 'tumu');
      ustYuva();
      const oz = x.ozet;
      const hesaplar = (oz.hesaplar || []).filter(h => h.durum !== 'kapali');
      const pl = oz.portfoyler || portfoyler;
      const yeniAd = el('input', { id: 'pnYeniPortfoy', type: 'text', maxlength: '120', placeholder: 'ör. Fırat', 'aria-label': 'Yeni portföy adı' });
      doldur(k, [kart([
        kartBas('Portföyler — kimin hesabı', el('span', { class: 'pn-soluk', text: pl.map(p => p.ad).join(' · ') })),
        el('p', { class: 'p-kart-alt pn-alt-bosluk', text: 'Her hesap TEK bir portföye bağlı; başkasının hesabı senin toplamına, getirine ve hedefine girmez. "Toplama dahil" kapalı hesap portföyde görünür ama toplama katılmaz.' }),
        portfoyAdTablosu(oz, pl),
        hesaplar.length ? tablo(['Hesap', 'Kurum', 'Portföy', 'Toplama dahil'].map(h => el('th', { text: h })), hesaplar.map(h => {
            const kurum = (oz.kurumlar || []).find(z => z.id === h.kurum);
            const sec = el('select', { 'aria-label': `${h.ad} portföyü`, 'data-kilit': 'telefon', onchange: (e) => yazma(null, () => api().hesapPortfoy(h.id, { portfoy: e.target.value }), `${h.ad} → ${pAd(e.target.value)}`) },
              pl.map(p => el('option', { value: p.id, selected: (h.portfoy || 'ben') === p.id ? '' : null, text: p.ad })));
            const dahil = h.toplamaDahil !== false;
            return el('tr', null, [el('td', { text: h.ad }), el('td', { class: 'pn-soluk', text: kurum ? kurum.ad : '' }), el('td', { class: 'p-alan pn-tablo-alan' }, [sec]),
              el('td', null, [el('button', { type: 'button', class: 'p-cip', 'aria-pressed': dahil ? 'true' : 'false', 'data-kilit': 'telefon', text: dahil ? 'dahil' : 'dahil değil',
                onclick: (e) => yazma(e.currentTarget, () => api().hesapKapsam(h.id, !dahil), `${h.ad}: toplama ${dahil ? 'dahil değil' : 'dahil'}`) })])]);
          })) : bos('Henüz hesap yok.'),
        el('div', { class: 'pn-yeni-portfoy pm-yazma' }, [el('div', { class: 'p-alan' }, [el('label', { for: 'pnYeniPortfoy', text: 'Yeni portföy' }), yeniAd]),
          dugme('Portföy ekle', (e) => { const ad = yeniAd.value.trim(); if (ad) yazma(e.currentTarget, () => api().portfoyEkle(ad), `"${ad}" portföyü eklendi.`); }, null, { 'data-kilit': 'telefon' })])
      ])]);
    } catch (e) { doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'Portföyler okunamadı' })]); }
  }

  /**
   * 67.3: portföy listesi + "Adını değiştir" (satır içi girdi + Kaydet / Vazgeç; PUT /api/portfoyum/portfoy/:id — 'ben' dahil, aynı ad
   * reddedilir). Ad değişince üst çubuk ve raporlar yeni adı gösterir; hesaplar, hedef ve geçmiş aynı kalır (kimlik değişmez).
   */
  function portfoyAdTablosu(oz, pl) {
    const ozet = new Map((oz.portfoyOzetleri || []).map(p => [p.id, p]));
    const satir = (p) => {
      const z = ozet.get(p.id) || {};
      const deger = el('td', { class: 'p-sag p-sayi', text: tutar(z.toplamUSD, z.toplamTL) });
      if (adDuzenle !== p.id) {
        return el('tr', null, [el('td', null, [el('strong', { text: p.ad })]), deger, el('td', { class: 'p-sayi', text: String(z.hesapSayisi || 0) }),
          el('td', { class: 'p-sag' }, [dugme('Adını değiştir', () => { adDuzenle = p.id; hesaplarKart(); }, null, { class: 'p-dugme p-dugme-kucuk pm-yazma', 'data-kilit': 'telefon', id: 'btnPnAd-' + p.id })])]);
      }
      const girdi = el('input', { id: 'pnPortfoyAd', type: 'text', maxlength: '120', value: p.ad, 'aria-label': `${p.ad} portföyünün yeni adı` });
      const kaydet = (d) => {
        const ad = girdi.value.trim();
        if (!ad) { if (AG.bildir) AG.bildir('Portföy adı boş olamaz.', 'uyari'); return; }
        if (ad === p.ad) { adDuzenle = null; hesaplarKart(); return; }
        adDuzenle = null;
        yazma(d, () => api().portfoyAd(p.id, ad), `"${p.ad}" portföyünün adı "${ad}" oldu.`);
      };
      girdi.addEventListener('keydown', (e) => { if (e.key === 'Enter') kaydet(null); else if (e.key === 'Escape') { adDuzenle = null; hesaplarKart(); } });
      return el('tr', { class: 'pn-ad-duzenle' }, [
        el('td', { class: 'p-alan pn-tablo-alan' }, [el('label', { for: 'pnPortfoyAd', text: 'Yeni ad' }), girdi]), deger, el('td', { class: 'p-sayi', text: String(z.hesapSayisi || 0) }),
        el('td', { class: 'p-sag' }, [el('div', { class: 'pn-ad-dugmeler' }, [
          dugme('Kaydet', (e) => kaydet(e.currentTarget), 'ana', { class: 'p-dugme p-dugme-ana p-dugme-kucuk', 'data-kilit': 'telefon', id: 'btnPnAdKaydet' }),
          dugme('Vazgeç', () => { adDuzenle = null; hesaplarKart(); }, null, { class: 'p-dugme p-dugme-kucuk', id: 'btnPnAdVazgec' })])])
      ]);
    };
    return el('div', { id: 'pnPortfoyAdlari', class: 'pn-alt-bosluk' }, [
      tablo(['Portföy', 'Değer', 'Hesap', ''].map((h, i) => el('th', { class: i === 1 || i === 3 ? 'p-sag' : null, text: h })), pl.map(satir)),
      el('p', { class: 'p-kart-alt', text: 'Ad değişince üst çubuktaki portföy seçicisi ve raporlar yeni adı gösterir; hesaplar, hedef ve geçmiş aynı kalır.' })
    ]);
  }

  // ═══ İŞLEM DEFTERİ: kaynak seçici ══════════════════════════════════════════
  function defterKaynakCiz() {
    const bol = bul('pfBolum-islem-defteri');
    if (!bol) return;
    let s = bul('pnDefterKaynak'), yatirim = bul('pnDefterYatirim'), botK = bul('pnDefterBot'), analiz = bul('pnYatirimAnaliz');
    if (!s) {
      s = el('div', { id: 'pnDefterKaynak', class: 'pn-defter-kaynak' });
      yatirim = el('div', { id: 'pnDefterYatirim', class: 'is-hidden' });
      botK = el('div', { id: 'pnDefterBot', class: 'is-hidden' });
      bol.insertBefore(s, bol.firstChild); bol.appendChild(yatirim); bol.appendChild(botK);
    }
    // 68.7: Yatırım grafikleri (yatirimAnalizCiz) defter tablosunun ÜSTÜNDE.
    if (!analiz) { analiz = el('div', { id: 'pnYatirimAnaliz', class: 'pn-yatirim-analiz' }); yatirim.insertBefore(analiz, yatirim.firstChild); }
    // Portföyüm'ün işlem defteri (portfoyum.js #pmDefter) Hesaplar'dan buraya taşınır — tek İşlem defteri (§3); 68.7: burada açık.
    const pm = bul('pmDefter');
    if (pm && pm.parentNode !== yatirim) { yatirim.appendChild(pm); pm.open = true; }
    // 68.7 (A): borsa hesapları (OKX / Binance / MetaTrader) her zaman Ben'in — başka kişi seçiliyken bunu söyle.
    const kisi = gorunum.portfoy !== 'ben' && gorunum.portfoy !== 'tumu';
    doldur(s, [secici('Kaynak', [['kripto', 'Kripto / FX'], ['yatirim', 'Yatırım (Portföyüm)'], ['bot', 'Bot']], defterKaynak, (v) => { defterKaynak = v; defterKaynakCiz(); if (v === 'yatirim' && AG.pages.portfoyum) AG.pages.portfoyum.yukle(); }),
      defterKaynak === 'kripto' && kisi ? el('div', { id: 'pnDefterBenNotu', class: 'pn-ust-bosluk' }, [bant(`Borsa hesapları (OKX, Binance, MetaTrader) Ben'in — burada ${pAd(gorunum.portfoy)} seçiliyken de Ben'in borsa işlemleri görünür.`, null)]) : null]);
    const kok = bul('pfIslemDefteriKok');
    if (kok) kok.classList.toggle('is-hidden', defterKaynak !== 'kripto');
    yatirim.classList.toggle('is-hidden', defterKaynak !== 'yatirim');
    botK.classList.toggle('is-hidden', defterKaynak !== 'bot');
    if (defterKaynak === 'yatirim' && !pm) doldur(analiz, [el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })]);
    if (defterKaynak === 'yatirim') yatirimAnalizCiz();
    if (defterKaynak === 'bot') {
      // F5 (§3): botların işlem dökümü (CSV; eskiden Ayarlar › Borsa) burada — hesap, kimin (Hücum / Denge / Elle / Acil fren), tarih.
      doldur(botK, [kart([kartBas('Bot işlemleri — döküm (CSV)'),
        el('p', { class: 'pn-metin', text: 'Botların borsadaki hesaplarında yapılan bütün işlemler; hesap, kimin yaptığı ve tarih aralığıyla CSV olarak indirilir. Son 30 günün tablosu ve açık pozisyonlar botun Hesap ve İşlemler görünümünde.' }),
        el('div', { id: 'hesapDokum', class: 'mt-3' }, [el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })]),
        el('div', { class: 'pn-cipler pn-ust-bosluk' }, [dugme('Kairos › İşlemler', git('botlar/hucum/islemler')), dugme('Tao › İşlemler', git('botlar/denge/islemler')), dugme('Kairos › Hesap', git('botlar/hucum/hesap'))])])]);
      const H = AG.pages.hesaplar;
      if (H) Promise.resolve(H.yukle(false)).then(() => H.dokumCiz());
    }
  }

  // ═══ İŞLEM DEFTERİ › YATIRIM: grafikler (68.7) ═════════════════════════════
  /*
   * GET /api/portfoyum/defter-analiz (lib/portfoyum/defterAnaliz.js) — üst çubuktaki kişi + defterin hesap / tarih süzgeci
   * (portfoyum.js defterSuzgec). Kartlar Kripto / FX defteriyle aynı görünüm (glass-panel, AG.grafik.ana, .idf-cubuk, .pm-aylik):
   * (a) gerçekleşen K/Z birikimli + aylık + yıl × ay · (b) varlığa (ve hesaba) göre · (c) temettü + faiz · (d) alış / satış, para
   * hareketi, ücret. Tutarlar seçili $ / ₺ (işlem günü kuruyla); Gizli → ••• ve grafikler bulanık (.pm-gizli .pm-tutar).
   * Sunucu eski sürümdeyse (uç yok → 404) hata kutusu değil sakin bir ipucu.
   */
  const analizOnbellek = new Map();
  let analizSira = 0;
  const AY_UC = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const ayEtiket = (ay) => `${AY_UC[+ay.slice(5, 7) - 1]} ${ay.slice(2, 4)}`;
  /** Uç yok mu (sunucu 68.7'den eski): doğrudan HTML 404 ya da sunucu bağlantısının "beklenmeyen yanıt (404, …)" iletisi. */
  const analizYokMu = (m) => /HTTP 404|\(404,/.test(String(m || ''));
  const bk = () => (birim() === 'TL' ? 'tl' : 'usd');
  const ikiliT = (o, b = 0) => tutar(o && o.usd, o && o.tl, b);
  const isaretliT = (o, b = 0) => { const s = ikiliT(o, b), v = o && o[bk()]; return sayiMi(v) && v > 0.004 && !gizli() ? '+' + s : s; };
  /** Seçili birimde düz sayı → "+$1.234" (Gizli → •••). */
  const birimSayi = (v, isaretli = true) => (gizli() ? '•••' : !sayiMi(v) ? '—' : `${v < 0 ? '−' : isaretli && v > 0.004 ? '+' : ''}${SIMGE[birim()]}${tr(Math.abs(v), Math.abs(v) >= 100 ? 0 : 2)}`);

  /** Saf: yıl × ay tablosu — aylik [{ ay, … }] + değer(a) → [{ yil, aylar: [12 × sayı|null], toplam }] (yeni yıl üstte). */
  function yilAyTablosu(aylik, deger) {
    const m = new Map();
    for (const a of aylik || []) {
      const y = a.ay.slice(0, 4), v = deger(a);
      if (!m.has(y)) m.set(y, { yil: y, aylar: Array(12).fill(null), toplam: 0 });
      if (sayiMi(v)) { const z = m.get(y); z.aylar[+a.ay.slice(5, 7) - 1] = v; z.toplam += v; }
    }
    return [...m.values()].sort((p, q) => (p.yil < q.yil ? 1 : -1));
  }
  /** Saf: iki serili (a, b ≥ 0) aylık çubuk modeli — [{ ay, a, b }] → { W, H, tabanY, gruplar: [{ ay, orta, a: {x,y,w,h,v}, b }] } ya da null. */
  function ikiliCubukModeli(l, W = 720, H = 170) {
    const v = (l || []).filter(x => sayiMi(x.a) || sayiMi(x.b));
    const enB = Math.max(0, ...v.map(x => Math.max(x.a || 0, x.b || 0)));
    if (!v.length || !(enB > 0)) return null;
    const ust = 8, alt = 22, ic = H - ust - alt, tabanY = ust + ic;
    const genis = W / v.length, w = Math.max(2, Math.min(18, genis * 0.35));
    const boy = (d) => (d > 0 ? Math.max(1, ic * d / enB) : 0);
    return { W, H, tabanY, gruplar: v.map((x, i) => {
      const orta = i * genis + genis / 2, ha = boy(x.a || 0), hb = boy(x.b || 0);
      return { ay: x.ay, orta, a: { x: orta - w - 1, y: tabanY - ha, w, h: ha, v: x.a || 0 }, b: { x: orta + 1, y: tabanY - hb, w, h: hb, v: x.b || 0 } };
    }) };
  }
  const svgGenislik = (k) => Math.max(320, Math.round(((k && k.clientWidth) || 760) - 40));
  /** Ay yazıları (en çok ~12; x(c) çubuğun ortası). */
  const ayYazilari = (l, x, y) => l.filter((c, i) => l.length <= 14 || i % Math.ceil(l.length / 12) === 0)
    .map(c => svg('text', { x: x(c).toFixed(1), y, class: 'grf-cubuk-deger', 'text-anchor': 'middle', text: ayEtiket(c.ay) }));
  /** Tek serili aylık çubuk (artı yeşil, eksi kırmızı) — js/pages/islemDefteri.js aylikCubukModeli. */
  function cubukSvg(l, etiket, W) {
    const ID = AG.pages.islemDefteri;
    const m = ID && ID.aylikCubukModeli ? ID.aylikCubukModeli(l, W, 170) : null;
    if (!m || !m.cubuklar.some(c => Math.abs(c.v) > 1e-9)) return null;
    return svg('svg', { class: 'idf-cubuk pm-tutar', viewBox: `0 0 ${m.W} ${m.H}`, role: 'img', 'aria-label': etiket }, [
      svg('line', { x1: 0, x2: m.W, y1: m.sifirY.toFixed(1), y2: m.sifirY.toFixed(1), class: 'grf-cubuk-sifir' }),
      ...m.cubuklar.map(c => svg('rect', { x: c.x.toFixed(1), y: c.y.toFixed(1), width: c.w.toFixed(1), height: c.h.toFixed(1), rx: 2, class: c.arti ? 'grf-cubuk-arti' : 'grf-cubuk-eksi' }, [svg('title', { text: `${ayEtiket(c.ay)}: ${birimSayi(c.v)}` })])),
      ...ayYazilari(m.cubuklar, c => c.x + c.w / 2, m.H - 6)
    ]);
  }
  /** İki serili aylık çubuk + lejant (a: --seri-1, b: --seri-2). */
  function ikiliSvg(l, adA, adB, etiket, W) {
    const m = ikiliCubukModeli(l, W, 170);
    if (!m) return null;
    const cub = (z, sinif, ad, ay) => svg('rect', { x: z.x.toFixed(1), y: z.y.toFixed(1), width: z.w.toFixed(1), height: z.h.toFixed(1), rx: 2, class: sinif }, [svg('title', { text: `${ayEtiket(ay)} · ${ad}: ${birimSayi(z.v, false)}` })]);
    return el('div', null, [
      el('div', { class: 'pn-lejant' }, [el('span', { class: 'pn-lejant-kutu pn-lejant-a', 'aria-hidden': 'true' }), el('span', { text: adA }), el('span', { class: 'pn-lejant-kutu pn-lejant-b', 'aria-hidden': 'true' }), el('span', { text: adB })]),
      svg('svg', { class: 'idf-cubuk pm-tutar', viewBox: `0 0 ${m.W} ${m.H}`, role: 'img', 'aria-label': etiket }, [
        svg('line', { x1: 0, x2: m.W, y1: m.tabanY.toFixed(1), y2: m.tabanY.toFixed(1), class: 'grf-cubuk-sifir' }),
        ...m.gruplar.flatMap(g => [cub(g.a, 'pn-ikili-a', adA, g.ay), cub(g.b, 'pn-ikili-b', adB, g.ay)]),
        ...ayYazilari(m.gruplar, c => c.orta, m.H - 6)
      ])
    ]);
  }
  const bolum = (ikonAd, baslik, ic, id) => el('div', { class: 'glass-panel panel-pad mt-4', id }, [el('h3', { class: 'card-title mb-3' }, [el('i', { class: 'tone-primary', 'data-lucide': ikonAd }), el('span', { text: ' ' + baslik })]), ...ic]);
  const ipucu = (metin) => el('p', { class: 'hint hint-sm mt-2 mb-0', text: metin });
  const tonT = (o) => { const v = o && o[bk()]; return sayiMi(v) && Math.abs(v) > 1e-9 ? (v > 0 ? 'tone-success' : 'tone-danger') : 'tone-muted'; };
  const sayiHucre = (metin, sinif) => el('td', { class: `sayi${sinif ? ' ' + sinif : ''}` }, [el('span', { class: 'pm-tutar', text: metin })]);
  const ikiliTopla = (p, q) => ({ usd: ((p || {}).usd || 0) + ((q || {}).usd || 0), tl: ((p || {}).tl || 0) + ((q || {}).tl || 0) });

  /** Kartlar (yalnız DOM kurar; a = /defter-analiz yanıtı, W = çubuk genişliği). Döndürür { kartlar, kzKap, kzSeri }. */
  function yatirimKartlari(a, W) {
    const t = a.toplam || {}, aylik = a.aylik || [], b = bk();
    // (a) Gerçekleşen K/Z
    const kzSeri = (a.birikimli || []).map(p => ({ t: p.t, v: p[b] }));
    const kzKap = el('div', { id: 'pnYaKzGrafik', class: 'pm-tutar' });
    const kzTablo = yilAyTablosu(aylik.filter(z => z.satis), z => z.gerceklesen[b]);
    const hucre = (v) => (sayiMi(v) ? sayiHucre(birimSayi(v), v > 1e-9 ? 'tone-success' : v < -1e-9 ? 'tone-danger' : 'tone-muted') : el('td', { class: 'sayi' }));
    const kutu = (etiket, deger, alt, sinif, sayac) => el('div', { class: 'p-gosterge' }, [el('p', { class: 'p-gosterge-etiket' }, [el('span', { text: etiket })]),
      el('p', { class: `p-gosterge-deger${sinif ? ' ' + sinif : ''}` }, [el('span', { class: sayac ? null : 'pm-tutar', text: deger })]), alt ? el('p', { class: 'p-gosterge-alt', text: alt }) : null]);
    const kartA = bolum('line-chart', `Gerçekleşen kâr / zarar — ${pAd(gorunum.portfoy)}`, t.satis ? [
      el('div', { class: 'p-serit pn-alt-bosluk' }, [
        kutu('Gerçekleşen (toplam)', isaretliT(t.gerceklesen), `${t.satis} kapanan satış`, tonT(t.gerceklesen)),
        kutu('Kazanan / kaybeden', `${t.kazanan} / ${t.kaybeden}`, sayiMi(t.kazanmaOrani) ? `kazanma oranı ${yuzde(t.kazanmaOrani, 0)}` : 'kazanma oranı —', null, true),
        kutu('Temettü + faiz', ikiliT(ikiliTopla(t.temettu, t.faiz)), 'vergi / stopaj sonrası net'),
        kutu('Ücretler', ikiliT(t.ucret), 'komisyon + ücret / gider')
      ]),
      kzKap,
      el('h4', { class: 'pf-bolum-baslik mt-3', text: 'Aylık gerçekleşen kâr / zarar' }),
      cubukSvg(aylik.map(z => ({ ay: z.ay, v: z.gerceklesen[b] })), 'Aylık gerçekleşen kâr/zarar çubukları', W),
      AG.tablo.kutulu({ id: 'tblPnYaAylik', sinif: 'table-dense pf-tablo pm-aylik', basliklar: ['Yıl', ...AY_UC, 'Yıl'],
        satirlar: kzTablo.map(y => el('tr', null, [el('td', { class: 'fw-semibold', text: y.yil }), ...y.aylar.map(hucre), (() => { const c = hucre(y.toplam); c.classList.add('fw-semibold'); return c; })()])) }),
      ipucu(`Satış başına FIFO (ilk alınan ilk satılır), satış ücreti düşülmüş; tutar satış gününün kuruyla. Toplam, Varlıklar sayfasındaki gerçekleşen kâr/zararla aynıdır.${t.bilinmeyen ? ` ${t.bilinmeyen} satışta alış maliyeti bilinmiyor — o satışların kârı eksik sayılır.` : ''}`)
    ] : [el('p', { class: 'hint hint-sm mb-0', text: 'Bu seçimde satış yok — gerçekleşen kâr/zarar satışla doğar.' })], 'pnYaKz');
    // (b) Varlığa göre sonuç (+ birden çok hesapta hesaba göre)
    const vl = a.varliklar || [], hl = a.hesaplar || [];
    const kartB = bolum('list-ordered', 'Varlığa göre sonuç', vl.length ? [
      AG.tablo.kutulu({ id: 'tblPnYaVarlik', sinif: 'table-dense pf-tablo', siralanabilir: true, basliklar: ['Varlık', 'Gerçekleşen K/Z', 'Temettü', 'Alış', 'Satış', 'Kazanan / kaybeden'],
        satirlar: vl.map(v => el('tr', null, [
          el('td', { class: 'pf-sola' }, [el('div', { class: 'fw-semibold', text: v.sembol }), el('div', { class: 'pf-kucuk', text: v.ad || '' })]),
          sayiHucre(isaretliT(v.gerceklesen), tonT(v.gerceklesen)), sayiHucre(ikiliT(v.gelir)),
          el('td', { class: 'sayi' }, [el('div', { text: `${v.alisSayisi} alış` }), el('div', { class: 'pf-kucuk pm-tutar', text: ikiliT(v.alis) })]),
          el('td', { class: 'sayi' }, [el('div', { text: `${v.satisSayisi} satış` }), el('div', { class: 'pf-kucuk pm-tutar', text: ikiliT(v.satisHacmi) })]),
          el('td', { class: 'sayi', text: v.satisSayisi ? `${v.kazanan} / ${v.kaybeden}${v.bilinmeyen ? ` (${v.bilinmeyen} maliyetsiz)` : ''}` : '—' })
        ])) }),
      hl.length > 1 ? el('h4', { class: 'pf-bolum-baslik mt-3', text: 'Hesaba göre' }) : null,
      hl.length > 1 ? AG.tablo.kutulu({ id: 'tblPnYaHesap', sinif: 'table-dense pf-tablo', basliklar: ['Hesap', 'Gerçekleşen K/Z', 'Temettü + faiz', 'Ücret', 'Yatırma', 'Çekme'],
        satirlar: hl.map(h => el('tr', null, [el('td', { class: 'pf-sola fw-semibold', text: h.ad }), sayiHucre(isaretliT(h.gerceklesen), tonT(h.gerceklesen)), sayiHucre(ikiliT(h.gelir)),
          sayiHucre(ikiliT(h.ucret)), sayiHucre(ikiliT(h.yatirma)), sayiHucre(ikiliT(h.cekme))])) }) : null,
      ipucu('Gerçekleşen = satışlardan doğan kâr/zarar (eldekilerin kâğıt üstü kârı değil). Alış / satış sütununda işlem sayısı ve brüt tutar.')
    ] : [el('p', { class: 'hint hint-sm mb-0', text: 'Bu seçimde alış, satış ya da temettü yok.' })], 'pnYaVarlik');
    // (c) Temettü ve faiz geliri
    const gelirVar = aylik.some(z => Math.abs(z.temettu[b]) > 1e-9 || Math.abs(z.faiz[b]) > 1e-9);
    const kartC = bolum('coins', 'Temettü ve faiz geliri', gelirVar ? [
      el('p', { class: 'pn-metin' }, [el('span', { text: 'Temettü / kupon ' }), el('strong', { class: 'pm-tutar', text: ikiliT(t.temettu) }), el('span', { text: ' · faiz ' }), el('strong', { class: 'pm-tutar', text: ikiliT(t.faiz) })]),
      cubukSvg(aylik.map(z => ({ ay: z.ay, v: z.temettu[b] + z.faiz[b] })), 'Aylık temettü ve faiz geliri çubukları', W),
      ipucu('Vergi / stopaj sonrası net; otomatik mevduat faizi dahil. Ay, gelirin hesaba geçtiği gün.')
    ] : [el('p', { class: 'hint hint-sm mb-0', text: 'Bu seçimde temettü ya da faiz yok.' })], 'pnYaGelir');
    // (d) Alış / satış / para hareketi
    const hacimVar = aylik.some(z => z.alis[b] > 0 || z.satisHacmi[b] > 0), akisVar = aylik.some(z => z.yatirma[b] > 0 || z.cekme[b] > 0), ucretVar = aylik.some(z => z.ucret[b] > 0);
    const baslikT = (ad, metin) => el('h4', { class: 'pf-bolum-baslik mt-3' }, [el('span', { text: ad + ' · ' }), el('span', { class: 'pm-tutar', text: metin })]);
    const kartD = bolum('arrow-left-right', 'Alış / satış / para hareketi', hacimVar || akisVar || ucretVar ? [
      baslikT('Alış ↔ satış hacmi', `alış ${ikiliT(t.alis)} · satış ${ikiliT(t.satisHacmi)}`),
      hacimVar ? ikiliSvg(aylik.map(z => ({ ay: z.ay, a: z.alis[b], b: z.satisHacmi[b] })), 'Alış', 'Satış', 'Aylık alış ve satış hacmi', W) : el('p', { class: 'hint hint-sm', text: 'Alış ya da satış yok.' }),
      baslikT('Para yatırma ↔ çekme', `yatırma ${ikiliT(t.yatirma)} · çekme ${ikiliT(t.cekme)}`),
      akisVar ? ikiliSvg(aylik.map(z => ({ ay: z.ay, a: z.yatirma[b], b: z.cekme[b] })), 'Yatırma', 'Çekme', 'Aylık para yatırma ve çekme', W) : el('p', { class: 'hint hint-sm', text: 'Para yatırma ya da çekme yok.' }),
      baslikT('Ücretler', ikiliT(t.ucret)),
      ucretVar ? cubukSvg(aylik.map(z => ({ ay: z.ay, v: -z.ucret[b] })), 'Aylık ücret ve komisyon çubukları', W) : el('p', { class: 'hint hint-sm', text: 'Ücret yok.' }),
      ipucu(`Hacim brüt (adet × fiyat). Para hareketi: para yatırma / çekme ve ${gorunum.portfoy === 'tumu' ? 'kayıtlı olmayan hesaplarla' : 'başka kişinin hesabıyla'} nakit transferi; aynı kişinin hesapları arasındaki transfer sayılmaz. Ücret = alış/satış komisyonu + ücret / gider kayıtları.${a.kurEksik ? ` ${a.kurEksik} tutarın o günkü kuru yok — toplamlara girmedi.` : ''}`)
    ] : [el('p', { class: 'hint hint-sm mb-0', text: 'Bu seçimde alış, satış, para hareketi ya da ücret yok.' })], 'pnYaHareket');
    return { kartlar: [kartA, kartB, kartC, kartD], kzKap, kzSeri };
  }

  /** İşlem defteri › Yatırım grafiklerini çiz (önbellek 60 sn; zorla = yeniden oku). portfoyum.js süzgeç değişince çağırır. */
  async function yatirimAnalizCiz(zorla) {
    const k = bul('pnYatirimAnaliz');
    if (!k || aktif !== 'islem-defteri' || defterKaynak !== 'yatirim') return;
    const sz = AG.pages.portfoyum && AG.pages.portfoyum.defterSuzgec ? AG.pages.portfoyum.defterSuzgec() : {};
    const f = { portfoy: gorunum.portfoy, hesap: sz.hesap || '', bas: sz.bas || '', bit: sz.bit || '' };
    const anahtar = JSON.stringify(f), sira = ++analizSira;
    let o = analizOnbellek.get(anahtar);
    if (!o || zorla || Date.now() - o.zaman > 60e3) {
      if (!k.firstChild) doldur(k, [el('p', { class: 'hint mb-0', text: 'Grafikler hazırlanıyor…' })]);
      let r = null, hata = null;
      try { r = await api().defterAnaliz(f); if (!r || !r.success) hata = (r && r.error) || 'yanıt yok'; } catch (e) { hata = e.message; }
      if (sira !== analizSira) return;   // bu arada başka bir seçim istendi
      if (hata) {
        doldur(k, [analizYokMu(hata) ? bant('Sunucu 68.7\'ye güncellenince grafikler görünür (gerçekleşen kâr/zarar, varlığa göre sonuç, gelir, alış/satış). Aşağıdaki işlem listesi şimdi de çalışır.', null)
          : AG.bildirim.hataKutusu(hata, { baslik: 'Grafikler okunamadı', yeniden: () => yatirimAnalizCiz(true) })]);
        return;
      }
      o = { zaman: Date.now(), r };
      analizOnbellek.set(anahtar, o);
    }
    const x = yatirimKartlari(o.r, svgGenislik(k));
    doldur(k, [el('div', { id: 'pnYatirimKok', class: `pm-kok${gizli() ? ' pm-gizli' : ''}` }, x.kartlar)]);
    if (x.kzSeri.length > 1 && AG.grafik && AG.grafik.ana) {
      AG.grafik.ana(x.kzKap, { seri: x.kzSeri, dusus: false, log: false, birim: SIMGE[birim()], etiket: 'Birikimli gerçekleşen K/Z', ad: 'Gerçekleşen kâr/zarar', bicim: (v) => birimSayi(v) });
    }
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  // ═══ RAPOR: ölçüt kartı ═══════════════════════════════════════════════════
  async function olcutKart() {
    const bol = bul('pfBolum-rapor');
    if (!bol) return;
    let k = bul('pnOlcutKart');
    if (!k) { k = el('div', { id: 'pnOlcutKart', class: 'pn-ust-kart' }); bol.insertBefore(k, bol.firstChild); }
    try {
      const x = await veri();
      ustYuva();
      const kiyas = await kiyasAl(x);
      const islemler = await islemlerAl(x);
      const oz = x.ozet, d = oz.degerleme || {};
      const hs = new Set((d.hesaplar || []).map(h => h.id));
      const p = O().hesapla(x.gecmis, { birim: birim(), bugun: oz.bugun, kiyas, deg: d, hesaplar: (oz.hesaplar || []).filter(h => hs.has(h.id)), islemler: islemler.filter(i => hs.has(i.hesap)), usdtry: d.kur && d.kur.USDTRY });
      const kSeri = (n) => (n || []).map(([t, v]) => ({ tarih: new Date(t).toISOString().slice(0, 10), endeksUSD: v, endeksTL: v }));
      const q = O().hesapla(kSeri(kiyas.qqq), { birim: birim(), bugun: oz.bugun }), b = O().hesapla(kSeri(kiyas.btc), { birim: birim(), bugun: oz.bugun });
      const y = (v, isaretli) => yuzde(v, 1, isaretli), s = (v) => kucukSayi(v, 2), g = (v) => (sayiMi(v) ? v + ' gün' : '—');
      const SATIR = [
        ['Toplam getiri (TWR)', 'para giriş/çıkışından bağımsız', (o) => y(o.toplamGetiri, true)],
        ['Yıllık getiri', '≥ 90 gün', (o) => y(o.yillik, true)],
        ['Oynaklık (yıllık)', 'ne kadar sallanıyor', (o) => y(o.oynaklik)],
        ['Sharpe', 'getiri ÷ toplam oynaklık (risksiz 0)', (o) => s(o.sharpe)],
        ['Sortino', 'getiri ÷ yalnız aşağı oynaklık', (o) => s(o.sortino)],
        ['Calmar', 'yıllık getiri ÷ en derin düşüş', (o) => s(o.calmar)],
        ['En derin düşüş', 'tepe → dip', (o) => y(o.enDerinDusus)],
        ['En uzun düşüş', 'tepeye dönmeden geçen süre', (o) => g(o.enUzunDususGun)],
        ['Ulcer endeksi', 'düşüşlerin derinliği × süresi', (o) => kucukSayi(o.ulcer, 1)],
        ['Kazanan ay oranı', 'tam aylar', (o) => y(o.kazananAyOrani)],
        ['En iyi / kötü ay', 'aylık tutarlılık', (o) => `${o.enIyiAy ? y(o.enIyiAy.r, true) : '—'} / ${o.enKotuAy ? y(o.enKotuAy.r, true) : '—'}`]
      ];
      const YAPI = [
        ['Yukarı / aşağı yakalama (QQQ)', 'QQQ yükselirken / düşerken ne kadarını aldın', `${s(p.yukariYakalama)} / ${s(p.asagiYakalama)}`],
        ['Yoğunlaşma', 'en büyük 3 pay · HHI', `${y(p.ilk3Pay)} · ${s(p.hhi)}`],
        ['Boşta nakit', 'faizsiz nakit ÷ portföy', y(p.bostaNakit)],
        ['Ücret / gider oranı', 'son 365 gün ücret + komisyon ÷ portföy', y(p.ucretOrani, false)],
        ['Kur etkisi', 'TL getirisi − USD getirisi (başlangıçtan)', y(((oz.getiri || {}).TL || {}).tum - ((oz.getiri || {}).USD || {}).tum, true)],
        ['Gelecek gelir', 'sıradaki mevduat vadeleri', p.gelecekGelir.length ? p.gelecekGelir.map(z => `${z.hesap} ${AG.fmt.tarih(z.son)}`).join(' · ') : '—']
      ];
      doldur(k, [kart([
        kartBas(`Risk ve getiri ölçütleri — ${pAd(gorunum.portfoy)} (${birim()})`),
        tablo(['Ölçüt', 'Ne söyler', 'Portföy', 'QQQ', 'BTC'].map((h, i) => el('th', { class: i > 1 ? 'p-sag' : null, text: h })), [
            ...SATIR.map(([ad, ne, f]) => el('tr', null, [el('td', { text: ad }), el('td', { class: 'pn-soluk', text: ne }), el('td', { class: 'p-sag p-sayi', text: f(p) }), el('td', { class: 'p-sag p-sayi', text: f(q) }), el('td', { class: 'p-sag p-sayi', text: f(b) })])),
            ...YAPI.map(([ad, ne, v]) => el('tr', null, [el('td', { text: ad }), el('td', { class: 'pn-soluk', text: ne }), el('td', { class: 'p-sag p-sayi', colspan: '3', text: v })]))
          ]),
        el('p', { class: 'p-kart-alt', text: [p.neden.kisa, p.neden.yakalama, 'Kıyaslar aynı dönemde, seçili birimde (QQQ / BTC al-tut).'].filter(Boolean).join(' ') })
      ])]);
    } catch (e) { doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'Ölçütler hesaplanamadı' })]); }
  }

  // ── Rota: Portföy dışına çıkınca üst yuva boşalır ─────────────────────────
  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => { if (!e.detail || e.detail.yol !== 'portfoy') { aktif = null; ustYuva(); } });
  }

  AG.pages = AG.pages || {};
  /** F6: İşlem defterini belirli kaynakla aç (Hesaplar › "İşlem defteri" → Yatırım). */
  function defterAc(k) {
    defterKaynak = ['kripto', 'yatirim', 'bot'].includes(k) ? k : 'kripto';
    if (defterKaynak === 'yatirim' && AG.pages.portfoyum) AG.pages.portfoyum.yukle();
    if (AG.rota) AG.rota.git('portfoy/islem-defteri');
    if (aktif === 'islem-defteri') defterKaynakCiz();
    // 67.4: Yatırım defteri katlı (varsayılan kapalı) — bağlantıyla gelince açılır ve görünür yere kaydırılır.
    if (defterKaynak === 'yatirim') {
      const pm = bul('pmDefter');
      if (pm) { pm.open = true; if (pm.scrollIntoView) setTimeout(() => pm.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50); }
    }
  }

  AG.pages.pano = {
    yukle, defterAc, gorunum: () => ({ ...gorunum }), yatirimAnaliz: yatirimAnalizCiz, yilAyTablosu, ikiliCubukModeli, yatirimKartlari, analizYokMu, PANO_SAYFA, HAZIR_HEDEF, KIYAS_ACIKLAMA, kiyasGetiri, yapilacaklar, hedefAgirliklari, varlikHedefSatirlari,
    dagilimDilimleri, ogeMetni, isiMetni, yilToplamlari, katBicimi, ucGetiriMetni,
    _onbellek: onbellek
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.pano;
})(typeof window !== 'undefined' ? window : globalThis);
