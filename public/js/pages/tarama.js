/**
 * COIN TARAMA + TARAMA AYARLARI — #/tarama, #/tarama/ayarlar (sürüm 60.3) `AG.pages.tarama`
 * ═══════════════════════════════════════════════════════════════════════════
 * "İzlediğim coinlerde zincir üstünde ne değişti?" İleriye dönük günlük kayıt (lib/tarama): her coin için borsa fiyatı,
 * DEX likiditesi, holder sayısı, ilk 10 payı, sözleşme yetkileri, paralı tanıtım, alan adı yaşı. Kayıt yalnız eklenir.
 *
 * KIRMIZI BAYRAK BİR ALIM/SATIM SİNYALİ DEĞİLDİR — yalnız "şuna bak" listesi; eşikler başlangıç değeri, ön kayıt değil.
 *
 * Otomatik güncelleme: Ana sayfa, Coin tarama ya da Listeler açılınca `POST /api/tarama/otomatik` — sunucu son başarılı
 * tarama ayardaki aralıktan (varsayılan 20 saat) eskiyse arka planda başlatır; ilerleme AG.ilerleme ile. Sunucunun kendi
 * 10 dk'lık zamanlayıcısı panel açılmasa da kaydı sürdürür.
 * Uyarılar (`GET /api/tarama/uyarilar`): menüde rozet (`[data-tarama-rozet]`) + her uyarı bir kez AG.bildir (tarayıcıda
 * 7 gün hatırlanır; depolama yoksa oturum boyunca).
 * Ayar ekranı: izleme listesi (ekle / düzelt / çıkar — her değişiklik sunucuda denetim kaydına yazılır), kaynak aç/kapa,
 * eşikler, aralıklar, Telegram. Sunucu verisi her zaman textContent (AG.dom.el) ile yazılır.
 */
(function (global) {
  'use strict';

  /**
   * Ö13 / B-30: alan adı ile ilk DEX çifti arasındaki sıra — token'dan SONRA alınmışsa yalnız bilgi (bayrak değil);
   * ÖNCE alınmışsa ve eşik içindeyse bayrak listesinde "Alan adı token'dan hemen önce kaydedilmiş" görünür.
   */
  function alanAdiBilgi(m) {
    if (!m || !m.alanAdiKayit || !m.ilkCift) return '';
    const fark = (Date.parse(m.ilkCift) - Date.parse(m.alanAdiKayit)) / 864e5;
    if (!Number.isFinite(fark)) return '';
    const g = Math.round(Math.abs(fark));
    return fark >= 0 ? ` — token'dan ${g} gün önce alınmış` : ` — token'dan ${g} gün sonra alınmış (olağan; bayrak değil)`;
  }
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);

  const ROZET_MS = 5 * 60e3;
  const GORULEN_ANAHTAR = 'ag.tarama.gorulen';
  let sonOzet = null, sonDurum = null, sonAyar = null, secili = null, duzenlenen = null;
  let izleniyor = false;

  /* ── Biçim ──────────────────────────────────────────────────────────── */
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const tr = (x, d = 0) => x.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
  function kisaUsd(x) {
    if (!sayiMi(x)) return '—';
    const a = Math.abs(x);
    if (a >= 1e9) return `$${tr(x / 1e9, 2)} mr`;
    if (a >= 1e6) return `$${tr(x / 1e6, 2)} M`;
    if (a >= 1e3) return `$${tr(x / 1e3, 1)} bin`;
    return `$${tr(x, 0)}`;
  }
  function fiyatMetni(x) {
    if (!sayiMi(x)) return '—';
    const a = Math.abs(x);
    const d = a >= 100 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 8;
    return `$${x.toLocaleString('tr-TR', { maximumFractionDigits: d })}`;
  }
  const yuzde = (x, d = 1) => (sayiMi(x) ? `%${tr(x * 100, d)}` : '—');
  const tamSayi = (x) => (sayiMi(x) ? tr(x, 0) : '—');
  function zamanOnce(iso, simdi = Date.now()) {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return 'hiç';
    const dk = Math.max(0, (simdi - t) / 60e3);
    if (dk < 60) return `${Math.round(dk)} dk önce`;
    if (dk < 48 * 60) return `${Math.round(dk / 60)} saat önce`;
    return `${Math.round(dk / 1440)} gün önce`;
  }
  const tarihSaat = (iso) => (AG.fmt && AG.fmt.tarihSaat ? AG.fmt.tarihSaat(iso) : String(iso || '—').slice(0, 16).replace('T', ' '));
  const KAYNAK_AD = { goplus: 'GoPlus', rugcheck: 'RugCheck', dexscreener: 'DexScreener', rdap: 'RDAP', borsa: 'Borsa', geckoterminal: 'GeckoTerminal', coingecko: 'CoinGecko' };
  const DURUM_AD = { ok: 'veri var', bos: 'veri yok', hata: 'hata', atlandi: 'uygulanmaz', onbellek: 'son sorgudan' };

  /* ── Saf görünüm modelleri ──────────────────────────────────────────── */

  /** Üst sayılar. */
  function sayilarModel(d, oz, simdi = Date.now()) {
    const coinler = ((oz && oz.coinler) || []).filter(c => c.izlemede);
    const bayrakli = coinler.filter(c => (c.bayraklar || []).some(b => !b.yokSayildi));
    const t = d && d.sonTarama;
    const ko = (t && t.kaynakOzet) || {};
    const hatali = Object.entries(ko).filter(([, s]) => s && s.hata > 0).map(([k]) => KAYNAK_AD[k] || k);
    const gecik = d && d.ayar && sayiMi(Date.parse(d.sonBasari || '')) ? (simdi - Date.parse(d.sonBasari)) / 3600e3 > d.ayar.gecikmeSaat : !(d && d.sonBasari);
    return [
      { etiket: 'İzlenen coin', deger: String(d && d.ayar ? d.ayar.izlenen : coinler.length), alt: `${coinler.length} coinin kaydı var` },
      { etiket: 'Kırmızı bayraklı coin', deger: String(bayrakli.length), alt: 'yok sayılanlar hariç · sinyal değil', ton: bayrakli.length ? 'tone-warning' : '' },
      { etiket: 'Son başarılı tarama', deger: zamanOnce(d && d.sonBasari, simdi), alt: d && d.calisiyor ? 'şu an tarıyor…' : (d && d.otomatik ? d.otomatik.neden : ''), ton: gecik ? 'tone-warning' : '' },
      { etiket: 'Kaynak durumu', deger: !t ? '—' : t.durum === 'tamam' ? 'hepsi yanıt verdi' : t.durum === 'kismi' ? 'kısmi' : 'erişilemedi',
        alt: hatali.length ? `hata: ${hatali.join(', ')}` : t ? `${t.coin} coin · ${t.sureSn} sn` : 'henüz tarama yok', ton: !t ? '' : t.durum === 'hata' ? 'tone-danger' : t.durum === 'kismi' ? 'tone-warning' : '' },
    ];
  }

  /** Tablo satır modeli (coin başına). */
  function satirModel(c) {
    const m = (c.son && c.son.metrik) || {};
    const ks = (c.son && c.son.kaynaklar) || {};
    const kayit = Object.entries(ks).filter(([, v]) => v && v.durum !== 'atlandi');
    const hatalar = kayit.filter(([, v]) => v.durum === 'hata').map(([k, v]) => `${KAYNAK_AD[k] || k}: ${v.hata || 'hata'}`);
    return {
      id: c.id, sembol: c.sembol, ad: c.ad || '', ag: c.ag || '—', izlemede: c.izlemede,
      fiyat: fiyatMetni(m.fiyat), fiyatKaynak: m.fiyatKaynak || '', hacim: kisaUsd(m.hacim24), likidite: kisaUsd(m.likidite), holder: tamSayi(m.holder),
      ilk10: sayiMi(m.ilk10Ham) ? `${yuzde(m.ilk10Ham, 0)} / ${yuzde(m.ilk10Ayk, 0)}` : '—',
      bayraklar: (c.bayraklar || []).map(b => ({ kod: b.kod, metin: b.metin, yeni: !!b.yeni, yokSayildi: !!b.yokSayildi, ayrinti: b.ayrinti || '' })),
      kaynak: { ok: kayit.filter(([, v]) => v.durum === 'ok' || v.durum === 'onbellek').length, toplam: kayit.length, hatalar },
      son: c.son ? c.son.zaman : null, fiyatYok: !!m.fiyatYok,
    };
  }

  /** Kaynak sağlığı uyarıları (B-31) — yalnız Coin tarama / Veri ekranında balon. */
  const KAYNAK_UYARILARI = new Set(['kaynak_hatasi', 'tarama_hatasi', 'kismi_veri', 'gecikme']);
  const BALON_EKRANLARI = new Set(['tab-tarama', 'tab-veri']);
  function balonYeri(u, ekran) { return !KAYNAK_UYARILARI.has(u && u.kod) || BALON_EKRANLARI.has(ekran); }
  function acikEkran() {
    if (!AG.rota || !AG.rota.acikMi) return null;
    for (const b of BALON_EKRANLARI) if (AG.rota.acikMi(b)) return b;
    return null;
  }

  /** Uyarılardan yeni (görülmemiş) olanlar. */
  function yeniUyarilar(liste, gorulen) {
    return (liste || []).filter(u => u && u.anahtar && !gorulen[u.anahtar] && u.seviye !== 'bilgi');
  }

  /* ── Rozet + bildirim ───────────────────────────────────────────────── */
  function gorulenOku() {
    try { const j = JSON.parse(global.localStorage.getItem(GORULEN_ANAHTAR) || '{}'); return j && typeof j === 'object' ? j : {}; } catch (e) { return gorulenOku.bellek || (gorulenOku.bellek = {}); }
  }
  function gorulenYaz(g) {
    const sinir = Date.now() - 7 * 864e5;
    for (const k of Object.keys(g)) if (g[k] < sinir) delete g[k];
    try { global.localStorage.setItem(GORULEN_ANAHTAR, JSON.stringify(g)); } catch (e) { gorulenOku.bellek = g; }
  }
  function rozetCiz(sayi) {
    if (!doc || !doc.querySelectorAll) return;
    doc.querySelectorAll('[data-tarama-rozet]').forEach(r => {
      r.textContent = sayi > 0 ? String(sayi) : '';
      r.classList.toggle('is-hidden', !(sayi > 0));
      r.setAttribute('aria-label', sayi > 0 ? `${sayi} coin tarama uyarısı` : 'uyarı yok');
      r.setAttribute('title', sayi > 0 ? `${sayi} coin tarama uyarısı` : '');
    });
  }
  async function rozetTazele() {
    let r;
    try { r = await AG.api.tarama.uyarilar(); } catch (e) { return null; }
    if (!r || !r.success) return null;
    rozetCiz(r.sayi || 0);
    // A-38 (61.1): Ana sayfada balon yok — aynı uyarı orada "Yapılacaklar"da zaten yazıyor; görülmedi sayılır, başka ekranda çıkar.
    if (AG.rota && AG.rota.acikMi && AG.rota.acikMi('tab-ana')) return r;
    const g = gorulenOku();
    // B-31 (61.1): KAYNAK hatası / tarama sağlığı uyarıları yalnız Coin tarama ve Veri ekranında balon olur;
    // başka ekranda (Portföy, Ana sayfa…) içeriği kapatmasın diye yalnız menü rozeti. Görülmedi sayılır →
    // kullanıcı o ekranlardan birini açınca balon bir kez çıkar (ag:rota → rozetTazele).
    const yeni = yeniUyarilar(r.uyarilar, g).filter(u => balonYeri(u, acikEkran()));
    for (const u of yeni.slice(0, 4)) {
      if (AG.bildir) AG.bildir(u.metin, u.seviye === 'tehlike' ? 'hata' : 'uyari', { baslik: 'Coin tarama', sure: u.seviye === 'tehlike' ? 0 : 12000 });
      g[u.anahtar] = Date.now();
    }
    if (yeni.length > 4) { yeni.slice(4).forEach(u => { g[u.anahtar] = Date.now(); }); if (AG.bildir) AG.bildir(`${yeni.length - 4} tarama uyarısı daha — Araştırma › Coin tarama`, 'uyari'); }
    if (yeni.length) gorulenYaz(g);
    return r;
  }

  /* ── Otomatik tetik + ilerleme ──────────────────────────────────────── */
  async function izle() {
    if (izleniyor) return;
    izleniyor = true;
    try {
      await AG.ilerleme.izle({
        id: 'tarama', kutu: bul('taramaIs'), baslik: 'Coin tarama', aralik: 1500, bitinceGoster: 1500,
        oku: async () => { const r = await AG.api.tarama.is(); return r && r.success && r.is ? r : { success: false, error: (r && r.error) || 'tarama durumu okunamadı' }; },
      });
      if (AG.bildir) AG.bildir('Coin taraması bitti.', 'ok');
    } catch (e) {
      if (AG.bildir) AG.bildir(`Coin taraması: ${e.message}`, 'hata');
    } finally {
      izleniyor = false;
      if (AG.rota && AG.rota.acikMi('tab-tarama')) yukle();
      rozetTazele();
    }
  }

  /** Panel açıldı: sunucu gerekirse arka planda başlatır. Ekran açıksa ilerleme gösterilir. */
  async function otomatik() {
    let r;
    try { r = await AG.api.tarama.otomatik(); } catch (e) { return null; }
    if (r && r.success && r.baslatildi) {
      if (AG.bildir) AG.bildir(`Coin taraması arka planda başladı (${r.neden || 'son tarama eski'}).`, 'bilgi');
      if (AG.rota && AG.rota.acikMi('tab-tarama')) izle();
    }
    return r;
  }

  async function simdiTara(dugme) {
    if (dugme) AG.dom.mesgul(dugme, 'Başlatılıyor…');
    try {
      const r = await AG.api.tarama.tara();
      if (!r || !r.success) { if (AG.bildir) AG.bildir(`Tarama başlatılamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      if (AG.rota && AG.rota.acikMi('tab-tarama')) izle(); else if (AG.bildir) AG.bildir('Coin taraması başladı; ilerleme Coin tarama ekranında.', 'bilgi');
    } catch (e) { if (AG.bildir) AG.bildir(`Tarama başlatılamadı: ${e.message}`, 'hata'); } finally { if (dugme) AG.dom.hazir(dugme); }
  }

  /* ── Coin tarama ekranı ─────────────────────────────────────────────── */
  const yardim = (k) => (k && AG.sozluk ? AG.sozluk.yardim(k) : null);
  const ikonla = () => { if (global.lucide && global.lucide.createIcons) global.lucide.createIcons(); };

  function sayilarCiz(d, oz) {
    const k = bul('taramaSayilar');
    if (!k) return;
    doldur(k, sayilarModel(d, oz).map(s => el('div', { class: 'ana-sayi' }, [
      el('span', { class: 'stat-title', text: s.etiket }),
      el('span', { class: `stat-value stat-value-sm sayi ${s.ton || ''}`.trim(), text: s.deger }),
      s.alt ? el('span', { class: 'hint hint-sm mb-0', text: s.alt }) : null,
    ])));
  }

  function uyarilarCiz(d) {
    const k = bul('taramaUyarilar');
    if (!k) return;
    const l = (d && d.uyarilar) || [];
    if (!l.length) { doldur(k, []); k.classList.add('is-hidden'); return; }
    k.classList.remove('is-hidden');
    const IKON = { tehlike: 'alert-octagon', uyari: 'alert-triangle', bilgi: 'info' };
    // 62.9 (kullanıcıyla taslak): uyarılar tek satıra iner — "N uyarı" katı; tablo hemen altta başlar.
    const tehlike = l.some(u => u.seviye === 'tehlike');
    doldur(k, [el('details', { class: `tarama-uyari-kat${tehlike ? ' tarama-uyari-tehlike' : ''}`, id: 'taramaUyariKat' }, [
      el('summary', { text: `${l.length} uyarı — kaynak durumu ve yeni kırmızı bayraklar` }),
      el('ul', { class: 'yapilacak-liste mt-2' }, l.map(u => el('li', { class: `yapilacak yapilacak-${u.seviye}` }, [
      el(u.href && u.href !== '#/tarama' ? 'a' : 'span', { class: 'yapilacak-baglanti', href: u.href && u.href !== '#/tarama' ? u.href : null }, [
        el('i', { 'data-lucide': IKON[u.seviye] || 'info', class: 'icon-16' }), el('span', { text: u.metin }),
      ]),
    ])))])]);
  }

  function bayrakRozetleri(bl) {
    if (!bl.length) return el('span', { class: 'tone-muted', text: 'yok' });
    return el('span', { class: 'tarama-bayraklar' }, bl.map(b => el('span', {
      class: b.yokSayildi ? 'badge' : 'badge badge-danger', title: `${b.metin}${b.ayrinti ? ' — ' + b.ayrinti : ''}${b.yokSayildi ? ' (yok sayıldı)' : ''}`,
      text: `${b.metin.split(' (')[0].split(' — ')[0]}${b.yeni ? ' · yeni' : ''}${b.yokSayildi ? ' · yok sayıldı' : ''}`,
    })));
  }

  function tabloCiz(oz) {
    const k = bul('taramaTablo');
    if (!k) return;
    const coinler = (oz && oz.coinler) || [];
    if (!coinler.length) { doldur(k, [el('p', { class: 'hint mb-0', text: 'Henüz kayıt yok. "Şimdi tara" ile ilk taramayı başlatın ya da izleme listesine coin ekleyin (Tarama ayarları).' })]); return; }
    const satirlar = coinler.map(satirModel).map(s => el('tr', { class: s.izlemede ? null : 'tone-muted' }, [
      el('td', { 'data-sira': s.sembol }, [el('strong', { text: s.sembol }), el('span', { class: 'hint hint-sm mb-0 tarama-alt', text: [s.ad, s.izlemede ? null : 'izlemeden çıkarıldı'].filter(Boolean).join(' · ') })]),
      el('td', { text: s.ag }),
      el('td', { class: `sayi${s.fiyatYok ? ' tone-warning' : ''}`, text: s.fiyatYok ? 'yok' : s.fiyat, title: s.fiyatKaynak || null }),
      el('td', { class: 'sayi', text: s.hacim }),
      el('td', { class: 'sayi', text: s.likidite }),
      el('td', { class: 'sayi', text: s.holder }),
      el('td', { class: 'sayi', text: s.ilk10, title: 'ham / ayıklanmış (sözleşme, kilit, etiketli ve yakma adresleri hariç)' }),
      el('td', { 'data-sira': String(s.bayraklar.filter(b => !b.yokSayildi).length) }, [bayrakRozetleri(s.bayraklar)]),
      el('td', { class: s.kaynak.hatalar.length ? 'tone-warning' : null, title: s.kaynak.hatalar.join(' · ') || null, text: `${s.kaynak.ok}/${s.kaynak.toplam}${s.kaynak.hatalar.length ? ' · hata' : ''}` }),
      el('td', { 'data-sirasiz': '1' }, [el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => ayrintiAc(s.id) }, [el('span', { text: 'Ayrıntı' })])]),
    ]));
    doldur(k, [AG.tablo.kutulu({ id: 'tblTarama', sinif: 'table-dense', siralanabilir: 'tarama',
      basliklar: ['Coin', 'Ağ', 'Fiyat', '24 s hacim', 'Likidite', 'Holder', { metin: 'İlk 10 (ham / ayık.)', yardim: 'ilk10Ayik' }, { metin: 'Kırmızı bayrak', yardim: 'kirmiziBayrak' }, 'Kaynak', ''],
      satirlar })]);
  }

  function kaynakCiz(d) {
    const k = bul('taramaKaynaklar');
    if (!k) return;
    const t = d && d.sonTarama;
    if (!t) { doldur(k, [el('p', { class: 'hint mb-0', text: 'Henüz tarama yok.' })]); return; }
    const satirlar = Object.entries(t.kaynakOzet || {}).map(([ad, s]) => el('tr', null, [
      el('td', { text: KAYNAK_AD[ad] || ad }),
      el('td', { class: 'sayi', text: String(s.ok || 0) }), el('td', { class: 'sayi', text: String(s.onbellek || 0) }),
      el('td', { class: 'sayi', text: String(s.bos || 0) }), el('td', { class: `sayi${s.hata ? ' tone-danger' : ''}`, text: String(s.hata || 0) }),
      el('td', { class: 'sayi', text: String(s.atlandi || 0) }), el('td', { text: s.sonHata || '—' }),
    ]));
    doldur(k, [
      el('p', { class: 'hint hint-sm', text: `Son tarama ${tarihSaat(t.bas)} · ${t.neden} · ${t.coin} coin · ${t.sureSn} sn · durum: ${t.durum === 'tamam' ? 'tamam' : t.durum === 'kismi' ? 'kısmi' : 'hata'}. "Veri yok" = kaynak yanıt verdi ama bu token için veri yok (kaybolma izi); "uygulanmaz" = kaynak bu ağı desteklemiyor.` }),
      AG.tablo.kutulu({ id: 'tblTaramaKaynak', sinif: 'table-dense', basliklar: ['Kaynak', 'Veri var', 'Son sorgudan', 'Veri yok', 'Hata', 'Uygulanmaz', 'Son hata'], satirlar }),
    ]);
  }

  function ayrintiCiz(c, gecmis) {
    const k = bul('taramaAyrinti');
    if (!k) return;
    if (!c) { k.classList.add('is-hidden'); doldur(k, []); return; }
    k.classList.remove('is-hidden');
    const m = (c.son && c.son.metrik) || {};
    const kv = (etiket, deger) => [el('dt', { text: etiket }), el('dd', { class: 'sayi', text: deger == null || deger === '' ? '—' : String(deger) })];
    const bl = c.bayraklar || [];
    const ks = (c.son && c.son.kaynaklar) || {};
    doldur(k, [
      el('div', { class: 'row-between row-wrap gap-2 mb-3' }, [
        el('h3', { class: 'card-title m-0', text: `${c.sembol}${c.ad ? ' — ' + c.ad : ''}` }),
        el('div', { class: 'row row-wrap gap-2' }, [
          c.izlemede ? el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { duzenlenen = c.id; if (AG.rota) AG.rota.git('tarama/ayarlar'); } }, [el('span', { text: 'Düzelt / yok say' })]) : null,
          el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { secili = null; ayrintiCiz(null); } }, [el('span', { text: 'Kapat' })]),
        ]),
      ]),
      c.belirsizlik ? el('p', { class: 'hint mb-3', text: `Eşleme notu: ${c.belirsizlik}` }) : null,
      c.not ? el('p', { class: 'hint mb-3', text: `Not: ${c.not}` }) : null,
      el('h4', { class: 'card-title-sm mb-2', text: 'Kırmızı bayraklar (sinyal değil)' }),
      bl.length ? el('ul', { class: 'tarama-bayrak-liste mb-4' }, bl.map(b => el('li', { class: b.yokSayildi ? 'tone-muted' : null }, [
        el('strong', { text: b.metin }), el('span', { text: b.ayrinti ? ` — ${b.ayrinti}` : '' }),
        el('span', { class: 'hint hint-sm mb-0 tarama-alt', text: `ilk görülme ${tarihSaat(b.ilkGorulme)}${b.yeni ? ' · bu taramada yeni' : ''}${b.yokSayildi ? ' · yok sayıldı (ayarlardan)' : ''}` }),
      ]))) : el('p', { class: 'hint mb-4', text: 'Bayrak yok.' }),
      el('dl', { class: 'kv-list kv-sik mb-4' }, [
        ...kv('Ağ / sözleşme', `${c.ag || '—'}${c.sozlesme ? ' · ' + c.sozlesme : ''}`),
        ...kv('Fiyat (kaynak)', m.fiyat != null ? `${fiyatMetni(m.fiyat)} (${m.fiyatKaynak || '—'})` : 'yok'),
        ...kv('24 s hacim · DEX hacmi', `${kisaUsd(m.hacim24)} · ${kisaUsd(m.dexHacim24)}`),
        ...kv('DEX likiditesi', kisaUsd(m.likidite)),
        ...kv('Holder', tamSayi(m.holder)),
        ...kv('İlk 10 ham / ayıklanmış', `${yuzde(m.ilk10Ham)} / ${yuzde(m.ilk10Ayk)} (${m.ilk10AykAdet != null ? m.ilk10AykAdet : '—'} adres)`),
        ...kv('Kilitli LP payı · kilit bitişi', `${yuzde(m.lpKilitliPay)} · ${m.lpKilitBitis ? String(m.lpKilitBitis).slice(0, 10) : '—'}`),
        ...kv('İlk DEX çifti', m.ilkCift ? String(m.ilkCift).slice(0, 10) : '—'),
        ...kv('Alan adı (kayıt · şirket)', m.alanAdi ? `${m.alanAdi} (${m.alanAdiKayit ? String(m.alanAdiKayit).slice(0, 10) : '—'} · ${m.kayitSirketi || '—'})${alanAdiBilgi(m)}` : '—'),
        ...kv('Kategoriler (CoinGecko)', (m.kategoriler || []).join(', ')),
        ...kv('İlk kayıt · satır', `${tarihSaat(c.ilkKayit)} · ${c.satirSayisi}`),
      ]),
      el('h4', { class: 'card-title-sm mb-2', text: 'Son taramada kaynaklar' }),
      AG.tablo.kutulu({ sinif: 'table-dense', basliklar: ['Kaynak', 'Durum', 'Açıklama', 'Alındı'], satirlar: Object.entries(ks).map(([ad, v]) => el('tr', null, [
        el('td', { text: KAYNAK_AD[ad] || ad }), el('td', { class: v.durum === 'hata' ? 'tone-danger' : v.durum === 'bos' ? 'tone-warning' : null, text: DURUM_AD[v.durum] || v.durum }),
        el('td', { text: v.hata || v.neden || (v.kaynakZamani ? `son sorgu ${String(v.kaynakZamani).slice(0, 10)}` : '—') }), el('td', { text: v.alindi ? tarihSaat(v.alindi) : '—' }),
      ])) }),
      el('h4', { class: 'card-title-sm mt-4 mb-2', text: 'Son taramalar' }),
      AG.tablo.kutulu({ sinif: 'table-dense', siralanabilir: 'taramaSeri', basliklar: ['Zaman', 'Fiyat', '24 s hacim', 'Likidite', 'Holder', 'İlk 10 ayık.'],
        satirlar: (c.seri || []).slice(-14).reverse().map(s => el('tr', null, [
          el('td', { text: tarihSaat(s.zaman) }), el('td', { class: 'sayi', text: s.fiyatYok ? 'yok' : fiyatMetni(s.fiyat) }), el('td', { class: 'sayi', text: kisaUsd(s.hacim24) }),
          el('td', { class: 'sayi', text: kisaUsd(s.likidite) }), el('td', { class: 'sayi', text: tamSayi(s.holder) }), el('td', { class: 'sayi', text: yuzde(s.ilk10Ayk) }),
        ])) }),
      gecmis && gecmis.length ? el('p', { class: 'hint hint-sm mt-3 mb-0', text: `Ham kayıt: ${gecmis.length} satır okundu (data/tarama/anlik).` }) : null,
    ]);
    ikonla();
  }

  async function ayrintiAc(id) {
    secili = id;
    const c = sonOzet && (sonOzet.coinler || []).find(x => x.id === id);
    ayrintiCiz(c || null, null);
    const k = bul('taramaAyrinti');
    if (k && k.scrollIntoView) { try { k.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* eski tarayıcı */ } }
  }

  async function yukle() {
    const kok = bul('taramaTablo');
    if (!kok) return;
    let d, o;
    try { [d, o] = await Promise.all([AG.api.tarama.durum(), AG.api.tarama.ozet()]); } catch (e) { d = { success: false, error: e.message }; }
    if (!d || !d.success || !o || !o.success) {
      doldur(kok, [AG.bildirim.hataKutusu((d && d.error) || (o && o.error) || 'sunucu yanıt vermedi', { baslik: 'Tarama verisi okunamadı', yeniden: yukle })]);
      return;
    }
    sonDurum = d; sonOzet = o.ozet;
    sayilarCiz(d, sonOzet); uyarilarCiz(d); tabloCiz(sonOzet); kaynakCiz(d);
    if (secili) ayrintiCiz((sonOzet.coinler || []).find(x => x.id === secili) || null, null);
    rozetCiz(d.uyariSayisi || 0);
    ikonla();
    if (d.calisiyor && d.is && d.is.durum === 'calisiyor') izle();
  }

  /* ── Tarama ayarları ekranı ─────────────────────────────────────────── */
  const alanId = (ad) => `taramaAyar_${ad}`;
  const grup = (etiket, girdi, ipucu) => el('div', { class: 'form-group' }, [el('label', { for: girdi.getAttribute('id'), text: etiket }), girdi, ipucu ? el('small', { class: 'hint', text: ipucu }) : null]);
  const metinGirdi = (ad, deger, ek = {}) => el('input', { type: 'text', id: alanId(ad), class: 'form-control', value: deger == null ? '' : String(deger), autocomplete: 'off', ...ek });
  const secici = (ad, secenekler, deger) => {
    const s = el('select', { id: alanId(ad), class: 'form-control' }, secenekler.map(([v, t]) => el('option', { value: v, text: t })));
    s.value = deger == null ? '' : String(deger);
    return s;
  };
  const deger = (ad) => { const x = bul(alanId(ad)); return x ? String(x.value || '').trim() : ''; };

  /** Coin formu → sunucuya giden nesne (saf; test edilir). */
  function coinFormuOku(oku, kodlar) {
    const borsa = oku('borsa');
    const fiyat = borsa ? { borsa, piyasa: oku('piyasa') || 'spot', sembol: oku('borsaSembol').toUpperCase() } : null;
    return {
      sembol: oku('sembol').toUpperCase(), ad: oku('ad') || null, ag: oku('ag') || 'diger', sozlesme: oku('sozlesme') || null, fiyat,
      alanAdi: oku('alanAdi') || null, coingeckoId: oku('coingeckoId') || null, belirsizlik: oku('belirsizlik') || null, not: oku('not') || null,
      yokSay: (kodlar || []).filter(k => oku(`yok_${k}`) === '1'), aktif: oku('aktif') !== '0',
    };
  }

  function coinFormuCiz(veri, c) {
    const k = bul('taramaCoinFormu');
    if (!k) return;
    const t = veri.tanim;
    const kutu = (ad, etiket, isaretli) => { const i = el('input', { type: 'checkbox', id: alanId(ad) }); i.checked = !!isaretli; return el('label', { class: 'check-label', for: alanId(ad) }, [i, el('span', { text: etiket })]); };
    const f = (c && c.fiyat) || {};
    doldur(k, [
      el('h3', { class: 'card-title mb-3', text: c ? `${c.sembol} — düzelt` : 'Coin ekle' }),
      c ? el('p', { class: 'hint mb-3', text: 'Kimlik (geçmiş kayıtla bağ) değişmez; ağ/sözleşme düzeltmesi bundan sonraki taramalara uygulanır ve denetim kaydına yazılır.' }) : null,
      el('div', { class: 'grid-2 gap-5' }, [
        grup('Sembol', metinGirdi('sembol', c ? c.sembol : '', { placeholder: 'ör. MET', maxlength: '20' })),
        grup('Ad', metinGirdi('ad', c ? c.ad : '', { placeholder: 'ör. Meteora', maxlength: '60' })),
        grup('Ağ', secici('ag', Object.entries(t.aglar), c ? c.ag : 'eth')),
        grup('Sözleşme / mint adresi', metinGirdi('sozlesme', c ? c.sozlesme : '', { placeholder: '0x… ya da Solana mint', spellcheck: 'false' }), 'Kendi zincirindeki coinlerde boş bırakın.'),
        grup('Fiyat borsası', secici('borsa', [['', 'otomatik (Binance → Bybit → OKX → Gate)'], ['binance', 'Binance'], ['bybit', 'Bybit'], ['okx', 'OKX'], ['gate', 'Gate']], f.borsa || '')),
        grup('Piyasa', secici('piyasa', [['spot', 'spot'], ['perp', 'perp (yalnız Binance)']], f.piyasa || 'spot')),
        grup('Borsa sembolü', metinGirdi('borsaSembol', f.sembol || '', { placeholder: 'METUSDT · NES-USDT · MNT_USDT', maxlength: '24' }), 'Aynı sembollü başka coin tuzağına dikkat (LIT: Binance spot eski Litentry, Lighter perp).'),
        grup('Alan adı', metinGirdi('alanAdi', c ? c.alanAdi : '', { placeholder: 'ör. meteora.ag' }), 'Boşsa DexScreener site bilgisinden türetilir.'),
        grup('CoinGecko kimliği', metinGirdi('coingeckoId', c ? c.coingeckoId : '', { placeholder: 'ör. tokenbot-2' }), 'Yalnız CoinGecko kaynağı açıksa kullanılır.'),
        grup('Eşleme notu', metinGirdi('belirsizlik', c ? c.belirsizlik : '', { maxlength: '400' })),
        grup('Not', metinGirdi('not', c ? c.not : '', { maxlength: '400' })),
      ]),
      el('fieldset', { class: 'tarama-fieldset mt-3' }, [
        el('legend', { text: 'Bu coinde yok sayılacak bayraklar' }),
        el('div', { class: 'tarama-secimler' }, (t.bayrakKodlari || []).map(kod => kutu(`yok_${kod}`, t.bayraklar[kod] || kod, c && (c.yokSay || []).includes(kod)))),
      ]),
      el('div', { class: 'row row-wrap gap-3 mt-3' }, [kutu('aktif', 'Taramaya dahil (aktif)', c ? c.aktif !== false : true)]),
      el('div', { class: 'row-end gap-3 mt-5' }, [
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => { duzenlenen = null; k.classList.add('is-hidden'); } }, [el('span', { text: 'Vazgeç' })]),
        el('button', { type: 'button', class: 'btn btn-primary', id: 'btnTaramaCoinKaydet', onclick: (e) => coinKaydet(e.currentTarget, c) }, [el('span', { text: c ? 'Düzeltmeyi kaydet' : 'Ekle' })]),
      ]),
    ]);
    k.classList.remove('is-hidden');
    ikonla();
  }

  function formOkuyucu() {
    return (ad) => {
      const x = bul(alanId(ad));
      if (!x) return '';
      if (x.type === 'checkbox') return x.checked ? '1' : '0';
      return String(x.value || '').trim();
    };
  }

  async function coinKaydet(dugme, c) {
    const kodlar = sonAyar && sonAyar.tanim ? sonAyar.tanim.bayrakKodlari : [];
    const govde = coinFormuOku(formOkuyucu(), kodlar);
    if (c) govde.id = c.id;
    AG.dom.mesgul(dugme, 'Kaydediliyor…');
    try {
      const r = await AG.api.tarama.izleme(c ? 'guncelle' : 'ekle', govde);
      if (!r || !r.success) { AG.bildir(`Kaydedilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      AG.bildir(c ? `${r.coin.sembol} düzeltildi (denetim kaydına yazıldı).` : `${r.coin.sembol} izleme listesine eklendi.`, 'ok');
      duzenlenen = null;
      await ayarYukle();
    } catch (e) { AG.bildir(`Kaydedilemedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(dugme); }
  }

  async function coinCikar(c) {
    const onay = await AG.onayla({ baslik: `${c.sembol} izlemeden çıkarılsın mı?`, metin: 'Bundan sonra taranmaz. Geçmiş kayıtları SİLİNMEZ (tarama ekranında "izlemeden çıkarıldı" diye görünür). Değişiklik denetim kaydına yazılır.', onay: 'Çıkar', tehlikeli: true });
    if (!onay) return;
    try {
      const r = await AG.api.tarama.izleme('cikar', { id: c.id });
      if (!r || !r.success) { AG.bildir(`Çıkarılamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      AG.bildir(`${c.sembol} izlemeden çıkarıldı.`, 'ok');
      await ayarYukle();
    } catch (e) { AG.bildir(`Çıkarılamadı: ${e.message}`, 'hata'); }
  }

  function izlemeCiz(veri) {
    const k = bul('taramaIzleme');
    if (!k) return;
    const a = veri.ayarlar;
    const satirlar = a.izleme.map(c => el('tr', { class: c.aktif === false ? 'tone-muted' : null }, [
      el('td', { 'data-sira': c.sembol }, [el('strong', { text: c.sembol }), el('span', { class: 'hint hint-sm mb-0 tarama-alt', text: c.ad || '' })]),
      el('td', { text: veri.tanim.aglar[c.ag] || c.ag }),
      el('td', { class: 'tarama-adres', text: c.sozlesme ? `${c.sozlesme.slice(0, 8)}…${c.sozlesme.slice(-4)}` : '—', title: c.sozlesme || null }),
      el('td', { text: c.fiyat ? `${c.fiyat.borsa} ${c.fiyat.piyasa} ${c.fiyat.sembol}` : 'otomatik' }),
      el('td', { text: c.alanAdi || 'DexScreener\'dan' }),
      el('td', { text: (c.yokSay || []).length ? c.yokSay.map(kod => veri.tanim.bayraklar[kod] || kod).join('; ') : '—' }),
      el('td', { text: [c.belirsizlik, c.not].filter(Boolean).join(' · ') || '—' }),
      el('td', { text: c.aktif === false ? 'pasif' : 'aktif' }),
      el('td', { 'data-sirasiz': '1' }, [el('div', { class: 'row row-wrap gap-2' }, [
        el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { duzenlenen = c.id; coinFormuCiz(veri, c); } }, [el('span', { text: 'Düzelt' })]),
        el('button', { type: 'button', class: 'btn btn-secondary btn-outline-danger btn-sm', onclick: () => coinCikar(c) }, [el('span', { text: 'Çıkar' })]),
      ])]),
    ]));
    doldur(k, [AG.tablo.kutulu({ id: 'tblTaramaIzleme', sinif: 'table-dense', siralanabilir: 'taramaIzleme',
      basliklar: ['Coin', 'Ağ', 'Sözleşme', 'Fiyat kaynağı', 'Alan adı', 'Yok sayılan bayrak', 'Not', 'Durum', ''], satirlar })]);
  }

  function kaynakAyarCiz(veri) {
    const k = bul('taramaKaynakAyar');
    if (!k) return;
    const t = veri.tanim.kaynaklar, a = veri.ayarlar.kaynaklar;
    doldur(k, [
      el('div', { class: 'tarama-secimler tarama-secimler-genis' }, Object.entries(t).map(([ad, tt]) => {
        const i = el('input', { type: 'checkbox', id: alanId(`k_${ad}`) }); i.checked = !!a[ad];
        return el('label', { class: 'check-label tarama-kaynak', for: alanId(`k_${ad}`) }, [i, el('span', null, [el('strong', { text: tt.ad }), el('span', { class: 'hint hint-sm mb-0 tarama-alt', text: tt.aciklama })])]);
      })),
      el('div', { class: 'row-end mt-4' }, [el('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => ayarKaydet(e.currentTarget, { kaynaklar: Object.fromEntries(Object.keys(t).map(ad => [ad, !!(bul(alanId(`k_${ad}`)) || {}).checked])) }) }, [el('span', { text: 'Kaynakları kaydet' })])]),
    ]);
  }

  function esikCiz(veri) {
    const k = bul('taramaEsikAyar');
    if (!k) return;
    const t = veri.tanim.esikler, a = veri.ayarlar.esikler;
    doldur(k, [
      el('p', { class: 'hint mb-4', text: 'Başlangıç değerleri — ÖN KAYIT DEĞİL. Hiçbir eşiğin isabet ya da yanlış alarm oranı henüz bilinmiyor; kayıt birkaç ay birikince bakılıp ayarlanacak. Eşik değişince bayraklar tüm kayıt için yeniden hesaplanır (ham kayıt değişmez).' }),
      el('div', { class: 'grid-2 gap-5' }, Object.entries(t).map(([ad, tt]) => grup(`${tt.ad} (${tt.birim})`, el('input', { type: 'number', id: alanId(`e_${ad}`), class: 'form-control', min: String(tt.min), max: String(tt.max), step: 'any', value: String(a[ad]) }),
        `Varsayılan ${tt.varsayilan}. ${tt.gerekce}`))),
      el('div', { class: 'row-end mt-4' }, [el('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => ayarKaydet(e.currentTarget, { esikler: Object.fromEntries(Object.keys(t).map(ad => [ad, Number(deger(`e_${ad}`))])) }) }, [el('span', { text: 'Eşikleri kaydet' })])]),
    ]);
  }

  function genelCiz(veri) {
    const k = bul('taramaGenelAyar');
    if (!k) return;
    const t = veri.tanim.genel, a = veri.ayarlar;
    const tg = el('input', { type: 'checkbox', id: alanId('telegram') }); tg.checked = !!a.telegram;
    const dtg = el('input', { type: 'checkbox', id: alanId('dikkatTelegram') }); dtg.checked = a.dikkatTelegram !== false;
    const tgDurum = veri.telegram || {};
    doldur(k, [
      el('div', { class: 'grid-2 gap-5' }, Object.entries(t).map(([ad, tt]) => grup(tt.ad, el('input', { type: 'number', id: alanId(`g_${ad}`), class: 'form-control', min: String(tt.min), max: String(tt.max), step: '1', value: String(a[ad]) }), `Varsayılan ${tt.varsayilan}. ${tt.gerekce}`))),
      el('label', { class: 'check-label mt-4', for: alanId('telegram') }, [tg, el('span', { text: 'Uyarıları Telegram\'a da gönder (kaynak hatası, yeni kırmızı bayrak, zincir bozulması, gecikme)' })]),
      el('label', { class: 'check-label mt-3', for: alanId('dikkatTelegram') }, [dtg, el('span', { text: 'Dikkat listesine yeni giren coinleri Telegram\'a gönder (günde bir mesaj; yalnız coin adı ve kapı kodu)' })]),
      el('p', { class: `hint hint-sm ${tgDurum.bagli ? '' : 'tone-warning'}`.trim(), text: tgDurum.bagli ? 'Telegram bağlı (Ayarlar → Telegram). Aynı uyarı 24 saatte bir gönderilir.' : `Telegram şu an gönderemez: ${tgDurum.neden || 'bağlı değil'}. Açık olsa da mesaj gitmez; panel uyarıları çalışır.` }),
      el('div', { class: 'row-end mt-4' }, [el('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => {
        const yama = Object.fromEntries(Object.keys(t).map(ad => [ad, Number(deger(`g_${ad}`))]));
        yama.telegram = !!(bul(alanId('telegram')) || {}).checked;
        yama.dikkatTelegram = !!(bul(alanId('dikkatTelegram')) || {}).checked;
        ayarKaydet(e.currentTarget, yama);
      } }, [el('span', { text: 'Kaydet' })])]),
    ]);
  }

  function denetimCiz(kayitlar) {
    const k = bul('taramaDenetim');
    if (!k) return;
    const kisa = (x) => { if (x == null) return '—'; const s = typeof x === 'object' ? JSON.stringify(x) : String(x); return s.length > 140 ? s.slice(0, 140) + '…' : s; };
    const ISLEM = { ayar: 'ayar', 'izleme-ekle': 'coin eklendi', 'izleme-cikar': 'coin çıkarıldı', 'izleme-duzelt': 'coin düzeltildi' };
    if (!kayitlar || !kayitlar.length) { doldur(k, [el('p', { class: 'hint mb-0', text: 'Henüz elle değişiklik yok.' })]); return; }
    doldur(k, [AG.tablo.kutulu({ id: 'tblTaramaDenetim', sinif: 'table-dense', basliklar: ['Zaman', 'Kim', 'İşlem', 'Hedef', 'Eski', 'Yeni'],
      satirlar: kayitlar.map(d => el('tr', null, [el('td', { text: tarihSaat(d.zaman) }), el('td', { text: d.kim || '—' }), el('td', { text: ISLEM[d.islem] || d.islem }), el('td', { text: d.hedef || '—' }),
        el('td', { class: 'tarama-adres', text: kisa(d.eski) }), el('td', { class: 'tarama-adres', text: kisa(d.yeni) })])) })]);
  }

  async function ayarKaydet(dugme, yama) {
    AG.dom.mesgul(dugme, 'Kaydediliyor…');
    try {
      const r = await AG.api.tarama.ayarYaz(yama);
      if (!r || !r.success) { AG.bildir(`Kaydedilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      AG.bildir(r.degisti ? `Kaydedildi: ${r.farklar.length} değişiklik (denetim kaydına yazıldı).` : 'Değişiklik yok.', r.degisti ? 'ok' : 'bilgi');
      await ayarYukle();
    } catch (e) { AG.bildir(`Kaydedilemedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(dugme); }
  }

  async function zinciriDogrula(dugme) {
    if (dugme) AG.dom.mesgul(dugme, 'Doğrulanıyor…');
    try {
      const r = await AG.api.listeler.dogrula();
      if (!r || !r.success) { AG.bildir(`Doğrulanamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return null; }
      const z = r.zincir;
      if (z.gecerli && !z.catisma) AG.bildir(`Liste kayıt zinciri sağlam: ${z.kayitSayisi} kayıt${z.ekler && z.ekler.length ? ` (${z.ekler.length} ek dosyada sorun)` : ''}.`, z.ekler && z.ekler.length ? 'uyari' : 'ok');
      else AG.bildir(`Liste kayıt zinciri BOZUK: ${z.catisma || z.hatalar.map(h => `#${h.no} ${h.neden}`).join(' · ')}`, 'hata');
      rozetTazele();
      return z;
    } catch (e) { AG.bildir(`Doğrulanamadı: ${e.message}`, 'hata'); return null; } finally { if (dugme) AG.dom.hazir(dugme); }
  }

  async function yenidenUret(dugme) {
    AG.dom.mesgul(dugme, 'Üretiliyor…');
    try {
      const r = await AG.api.tarama.yenidenUret();
      if (!r || !r.success) { AG.bildir(`Üretilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      AG.bildir(`Özet ham kayıttan yeniden üretildi: ${r.satirSayisi} satır, ${r.coin} coin${r.bozukSatir ? `, ${r.bozukSatir} bozuk satır atlandı` : ''}.`, r.bozukSatir ? 'uyari' : 'ok');
    } catch (e) { AG.bildir(`Üretilemedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(dugme); }
  }

  async function ayarYukle() {
    const kok = bul('taramaIzleme');
    if (!kok) return;
    let v, den;
    try { [v, den] = await Promise.all([AG.api.tarama.ayarlar(), AG.api.tarama.denetim(50)]); } catch (e) { v = { success: false, error: e.message }; }
    if (!v || !v.success) { doldur(kok, [AG.bildirim.hataKutusu((v && v.error) || 'sunucu yanıt vermedi', { baslik: 'Tarama ayarları okunamadı', yeniden: ayarYukle })]); return; }
    sonAyar = v;
    izlemeCiz(v); kaynakAyarCiz(v); esikCiz(v); genelCiz(v);
    denetimCiz(den && den.success ? den.kayitlar : []);
    const form = bul('taramaCoinFormu');
    if (duzenlenen) { const c = v.ayarlar.izleme.find(x => x.id === duzenlenen); if (c) coinFormuCiz(v, c); else if (form) form.classList.add('is-hidden'); } else if (form && !form.dataset.ekleAcik) form.classList.add('is-hidden');
    ikonla();
  }

  /* ── Başlatma ───────────────────────────────────────────────────────── */
  function baslat() {
    if (!doc || !doc.addEventListener) return;
    const b = (id, f) => { const x = bul(id); if (x) x.addEventListener('click', (e) => f(e.currentTarget)); };
    b('btnTaramaSimdi', simdiTara);
    b('btnTaramaZincir', zinciriDogrula);
    b('btnTaramaYenidenUret', yenidenUret);
    b('btnTaramaCoinEkle', () => { duzenlenen = null; if (sonAyar) coinFormuCiz(sonAyar, null); });
    doc.addEventListener('ag:rota', (e) => {
      const bolum = e.detail && e.detail.bolum;
      if (bolum === 'tab-tarama') { yukle(); otomatik(); rozetTazele(); }
      else if (bolum === 'tab-veri') rozetTazele();   // B-31: bekleyen kaynak uyarısı burada balon olur
      else if (bolum === 'tab-tarama-ayar') ayarYukle();
      else if (bolum === 'tab-ana' || bolum === 'tab-listeler') otomatik();
    });
    global.setTimeout(rozetTazele, 4000);
    global.setInterval(rozetTazele, ROZET_MS);
  }

  AG.pages = AG.pages || {};
  AG.pages.tarama = { balonYeri, alanAdiBilgi, yukle, ayarYukle, otomatik, rozetTazele, rozetCiz, simdiTara, zinciriDogrula, sayilarModel, satirModel, yeniUyarilar, coinFormuOku, kisaUsd, fiyatMetni, zamanOnce,
    _ciz: { tabloCiz, uyarilarCiz, ayrintiCiz, izlemeCiz, kaynakAyarCiz, esikCiz, genelCiz, denetimCiz, coinFormuCiz, kaynakCiz, sayilarCiz } };
  if (doc && doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat);
  else baslat();
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.tarama;
})(typeof window !== 'undefined' ? window : globalThis);
