/**
 * AYARLAR › BU BİLGİSAYAR (panel denetimi A-18, 2026-10-11) `AG.pages.ayarlar`
 * ═══════════════════════════════════════════════════════════════════════════
 * PLAN-PANEL-PUSULA §2 Ayarlar "bu kopyanın rolü, panel jetonu": komut satırına bırakılmış durumlar ekranda, SALT OKUNUR:
 *   · rol: araştırma kopyası (ARASTIRMA_MODU) / sunucu (bot burada çalışır) — araştırmada ayar kayıtları
 *     kapalıdır (sunucu 403, lib/guvenlik.js arastirmaAyarRed; Telegram'ın kapalılığı config.json'a yazılmaz)
 *   · bu oturum: masaüstü / telefon kademesi
 *   · acil PIN tanımlı mı, kilitli mi (GET /api/health → acilPin)
 *   · telefon jetonu tanımlı mı (GET /api/health → telefonJeton; değeri asla)
 *   · Telegram komut yoklaması (GET /api/saglik/durum → telegramKomut)
 * Her satırda "nasıl yapılır" kılavuz bağlantısı. DOM AG.dom; inline stil yok.
 * 61.3 OTOMATİK GÜNCELLEME bölümü (lib/guncelleme.js): çalışan sürüm, son kontrol durumu; "Şimdi kontrol et" ve bot kodu
 * değişen güncelleme için "Güncellemeyi kur" (onaylı) — tek yazma düğmeleri bunlar. Telefonda da açık: acil PIN + "GÜNCELLE"
 * sorulur (lib/acilPin.js kapısı, sunucu doğrular); araştırma modunda düğme yok ve sunucu 403 verir.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const yardim = (k) => (AG.sozluk ? AG.sozluk.yardim(k) : null);

  /** Saf: /api/health + /api/saglik/durum → satırlar [{ etiket, deger, ton, href, nasil }]. */
  function satirlar(h, s) {
    const hh = h || {};
    const pin = hh.acilPin || {};
    const tk = (s && s.telegramKomut) || null;
    const l = [];
    l.push(hh.arastirmaModu
      ? { etiket: 'Rol', deger: 'Araştırma kopyası — bot sunucuda çalışır. Burada bot/borsa/emir işlemleri ve ayar kayıtları (Telegram, piyasa verisi, izleme listesi, API anahtarları, sağlık sinyali) kapalı; Telegram bu bilgisayarda bilinçli kapalı, sunucudaki ayar değişmez.', ton: 'tone-warning', href: '#/kilavuz/ayarlar/uyarilar', nasil: 'Neden?' }
      : { etiket: 'Rol', deger: 'Sunucu (ana bilgisayar) — botlar burada çalışır, ayarlar buradan kaydedilir.', ton: '', href: '#/kilavuz/ayarlar/ne-ise-yarar', nasil: 'Ayrıntı' });
    l.push({ etiket: 'Bu oturum', deger: hh.kademe === 'telefon' ? 'Telefon: yalnız izleme + PIN\'li acil durdurma' : 'Bu bilgisayardaki masaüstü panel (tam yetki)', ton: '', href: '#/kilavuz/telefon', nasil: 'Telefon kılavuzu' });
    l.push({ etiket: 'Acil PIN', deger: !pin.tanimli ? 'tanımlı değil — telefondan acil durdurma kapalı (sunucuda: npm run acil-pin)' : pin.kilitli ? 'tanımlı — şu an KİLİTLİ (çok fazla yanlış deneme, 15 dk)' : 'tanımlı ✓',
      ton: !pin.tanimli || pin.kilitli ? 'tone-warning' : 'tone-success', href: '#/kilavuz/telefon', nasil: 'Nasıl tanımlanır?' });
    l.push({ etiket: 'Telefon jetonu', deger: hh.telefonJeton === undefined ? '—' : hh.telefonJeton ? 'tanımlı ✓ (değeri gösterilmez)' : 'tanımlı değil — telefondan erişim kapalı (sunucuda: npm run telefon-jeton)',
      ton: hh.telefonJeton === false ? 'tone-warning' : hh.telefonJeton ? 'tone-success' : '', href: '#/kilavuz/telefon', nasil: 'Nasıl kurulur?' });
    l.push({ etiket: 'Telegram komutları', deger: !tk ? '—' : tk.calisiyor ? 'yoklama çalışıyor (komutlara cevap veriliyor)' : hh.arastirmaModu ? 'kapalı (araştırma kopyası — komutlara sunucu cevap verir)' : 'kapalı — Telegram bildirimleri etkin değil',
      ton: tk && !tk.calisiyor && !hh.arastirmaModu ? 'tone-warning' : '', href: '#/kilavuz/ayarlar/telegram', nasil: 'Nasıl açılır?' });
    return l;
  }

  /* ── Otomatik güncelleme (61.3; lib/guncelleme.js) ───────────────────── */
  const zaman = (iso) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); };
  /**
   * Saf: GET /api/guncelleme/durum → { metin, ton, onay (bekleyen hedef sha | null), kontrolDugmesi }.
   * Durumlar: gelistirme · guncel · kuruldu · onay · elle · geri-alindi · yeniden-baslat · ag-hatasi · kuruluyor · (yok).
   */
  function guncellemeOzeti(g) {
    if (!g || g.success === false) return { metin: 'Güncelleme durumu okunamadı.', ton: 'tone-muted', onay: null, kontrolDugmesi: false };
    if (g.gelistirme) return { metin: 'Bu bilgisayar geliştirme kopyası: güncellemeler buradan GitHub\'a gönderilir. Sunucu her gün 12:00\'de yeni sürümü kendisi kurar (bot kodu değiştiyse onay ister).', ton: '', onay: null, kontrolDugmesi: false };
    const s = g.hedefSurum ? `${g.hedefSurum}` : 'yeni sürüm';
    const dosyalar = (g.dosyalar || []).slice(0, 4).join(', ') + ((g.dosyalar || []).length > 4 ? ' …' : '');
    switch (g.durum) {
      case 'guncel': return { metin: `Güncel ✓ — son kontrol ${zaman(g.kontrol)}`, ton: 'tone-success', onay: null, kontrolDugmesi: true };
      case 'kuruldu': return { metin: `${(g.kurulu && g.kurulu.surum) || s} kuruldu ✓ (${zaman(g.kontrol)}, ${g.onayli ? 'onayınızla' : 'otomatik'})`, ton: 'tone-success', onay: null, kontrolDugmesi: true };
      case 'onay': return { metin: `${s} kurulmayı bekliyor: bot kodu değişti (${dosyalar}). Kurulunca Pusula ~30 sn yeniden başlar; açılmazsa eski sürüme kendiliğinden döner.`, ton: 'tone-warning', onay: g.hedef || null, kontrolDugmesi: true };
      case 'elle': return { metin: `Elle bakılmalı: ${g.neden || ''}`, ton: 'tone-danger', onay: null, kontrolDugmesi: true };
      case 'geri-alindi': return { metin: `${s} kurulamadı, geri alındı (${g.geriDonus || ''}): ${g.neden || ''}`, ton: 'tone-danger', onay: null, kontrolDugmesi: true };
      case 'yeniden-baslat': return { metin: g.neden || 'Yeniden başlatma gerekli.', ton: 'tone-warning', onay: null, kontrolDugmesi: true };
      case 'ag-hatasi': return { metin: `GitHub'a ulaşılamadı (${g.agHatasi || 1}. kez; ${zaman(g.kontrol)}). İnternet gelince ertesi gün yeniden dener.`, ton: (g.agHatasi || 1) >= 3 ? 'tone-warning' : 'tone-muted', onay: null, kontrolDugmesi: true };
      case 'kuruluyor': return { metin: `${s} kuruluyor…`, ton: 'tone-warning', onay: null, kontrolDugmesi: false };
      default: return { metin: 'Henüz kontrol yapılmadı. Günlük görev kurulu değilse: Kılavuz › Kurulum › Otomatik güncelleme.', ton: 'tone-muted', onay: null, kontrolDugmesi: true };
    }
  }

  let izleme = null;
  /** Kontrol / kurulum başladıktan sonra durumu 5 sn'de bir oku (sunucu yeniden başlarken istek düşer — beklenir), en çok 5 dk. */
  function izle(ilk) {
    if (izleme) clearInterval(izleme);
    const bitis = Date.now() + 5 * 60 * 1000;
    izleme = setInterval(async () => {
      const g = AG.api.guncelleme ? await AG.api.guncelleme.durum().catch(() => null) : null;
      if (g && g.success !== false) cizGuncelleme(g);
      const bitti = g && g.success !== false && g.kontrol !== ilk.kontrol && g.durum !== 'kuruluyor';
      if (!bitti && Date.now() <= bitis) return;
      clearInterval(izleme); izleme = null;
      if (bitti && g.durum === 'kuruldu') { AG.bildir('Yeni sürüm kuruldu — sayfa yenileniyor.', 'ok'); setTimeout(() => global.location && global.location.reload(), 1500); }
    }, 5000);
  }

  function cizGuncelleme(g) {
    const kap = bul('ayarlarGuncelleme');
    if (!kap || !AG.dom) return;
    const { el, doldur } = AG.dom;
    const o = guncellemeOzeti(g);
    // Telefonda da açık (PIN'li — kontrol/kur içinde sorulur); bu yüzden data-kilit YOK.
    const dugme = (metin, onclick, sinif, id) => el('button', { type: 'button', id, class: `btn btn-sm ${sinif}`, onclick }, [el('span', { text: metin })]);
    doldur(kap, [
      el('dl', { class: 'kv-list kv-genis mb-0' }, [
        el('dt', { text: 'Çalışan sürüm' }), el('dd', { text: (g && g.calisanSurum) || '—' }),
        el('dt', { text: 'Durum' }), el('dd', { class: o.ton || null, id: 'ayGuncDurum' }, [el('span', { text: o.metin }), el('span', { text: ' · ' }), el('a', { href: '#/kilavuz/kurulum/adim-22', text: 'Nasıl çalışır?' })])
      ]),
      o.kontrolDugmesi || o.onay ? el('div', { class: 'pf-dugmeler mt-3' }, [
        o.onay ? dugme(`Güncellemeyi kur (${(g && g.hedefSurum) || 'yeni sürüm'})`, () => kur(g), 'btn-primary', 'btnGuncKur') : null,
        o.kontrolDugmesi ? dugme('Şimdi kontrol et', () => kontrol(g), 'btn-secondary', 'btnGuncKontrol') : null
      ]) : null
    ]);
    // 63.0: Güncelleme sekmesinde "onay" rozeti (bot kodu güncellemesi onay bekliyorsa).
    const rz = bul('ayarIsik-guncelleme');
    if (rz) rz.classList.toggle('is-hidden', !o.onay);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  /**
   * Telefon kademesinde (61.3): güncelleme kontrol / kur acil PIN + "GÜNCELLE" ister (lib/acilPin.js; aynı yanlış PIN
   * sayacı ve 15 dk kilit). Masaüstünde alan yok. Döndürür: gövde eki | {} (masaüstü) | null (vazgeçildi).
   */
  const telefonMu = () => !!(AG.api && AG.api.kademe && AG.api.kademe() === 'telefon');
  const PIN_ALANLARI = [
    { ad: 'pin', etiket: 'Acil PIN', tip: 'password', inputmode: 'numeric', dogrula: (v) => /^\d{6,12}$/.test(v.trim()) },
    { ad: 'onay', etiket: 'Onay için GÜNCELLE yazın', ipucu: 'GÜNCELLE', dogrula: (v) => ['GÜNCELLE', 'GUNCELLE'].includes(v.trim().toLocaleUpperCase('tr-TR')) }
  ];
  const pinGovdesi = (d) => (d && typeof d === 'object' ? { pin: d.pin.trim(), onay: d.onay.trim() } : null);

  async function kontrol(g) {
    let ek = {};
    if (telefonMu()) {
      ek = pinGovdesi(await AG.onayla({ baslik: 'Güncellemeyi şimdi kontrol et', metin: 'Sunucu GitHub\'da yeni sürüm var mı bakar. Panel değişikliğiyse hemen kurar (Pusula ~30 sn yeniden başlar); bot kodu değiştiyse kurmaz, onayınızı bekler.', onay: 'Kontrol et', alanlar: PIN_ALANLARI }));
      if (!ek) return;
    }
    const r = await AG.api.guncelleme.kontrol(ek);
    if (!r || !r.success) { AG.bildir(`Başlatılamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
    AG.bildir('Kontrol başladı — sonuç birkaç saniye içinde burada görünür.', 'ok');
    izle(g || {});
  }

  async function kur(g) {
    const metin = `Bu güncelleme bot kodunu değiştiriyor (${(g.dosyalar || []).join(', ')}). Kod indirilir, Pusula yaklaşık 30 saniye yeniden başlar; açılmazsa eski sürüme kendiliğinden döner ve Telegram'dan haber verir. Açık pozisyonlar borsada kalır.`;
    const cevap = await AG.onayla({ baslik: `Pusula ${g.hedefSurum || ''} kurulsun mu?`, metin, onay: 'Kur ve yeniden başlat', ...(telefonMu() ? { alanlar: PIN_ALANLARI } : {}) });
    if (!cevap) return;
    const r = await AG.api.guncelleme.uygula(g.hedef, telefonMu() ? pinGovdesi(cevap) : {});
    if (!r || !r.success) { AG.bildir(`Kurulmadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 }); return; }
    AG.bildir('Kurulum başladı — Pusula birazdan yeniden başlayacak; bu sayfa kendiliğinden yenilenir.', 'ok', { sure: 10000 });
    izle(g);
  }

  function cizSatirlar(h, s) {
    const kap = bul('ayarlarBuBilgisayar');
    if (!kap || !AG.dom) return;
    const { el, doldur } = AG.dom;
    doldur(kap, [
      el('h2', { class: 'page-title-sm mb-3' }, [el('i', { class: 'tone-primary', 'data-lucide': 'monitor' }), el('span', { text: ' Bu bilgisayar' })]),
      // F5: "Telegram komutları" durumu Ayarlar › Bildirimler'de (tekrar etmez — denetim 3 §5.3 D5).
      el('dl', { class: 'kv-list kv-genis mb-0' }, satirlar(h, s).filter(x => x.etiket !== 'Telegram komutları').flatMap(x => [
        el('dt', null, [el('span', { text: x.etiket }), x.etiket === 'Acil PIN' ? yardim('acilFren') : null]),
        el('dd', { class: x.ton || null }, [el('span', { text: x.deger }), x.href ? el('span', { text: ' · ' }) : null, x.href ? el('a', { href: x.href, text: x.nasil }) : null])
      ]))
    ]);
    const tk = satirlar(h, s).find(x => x.etiket === 'Telegram komutları'), tkYer = bul('txtTelegramKomut');
    if (tk && tkYer) doldur(tkYer, [el('span', { text: `Telegram komutları: ${tk.deger}`, class: tk.ton || null })]);
    // 63.0: sekmede ışık — uyarı tonlu satır varsa (ör. acil PIN tanımlı değil) sarı.
    const isik = bul('ayarIsik-bilgisayar');
    if (isik) { const uyari = satirlar(h, s).some(x => /warning|danger/.test(x.ton || '')); isik.classList.remove('is-hidden'); isik.className = `borsa-isik borsa-isik-${uyari ? 'uyari' : 'iyi'}`; }
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  async function ciz() {
    if (!bul('ayarlarBuBilgisayar')) return;
    const [h, s, g] = await Promise.all([
      AG.api.sunucuSagligi().catch(() => null),
      AG.api.saglikDurum ? AG.api.saglikDurum().catch(() => null) : Promise.resolve(null),
      AG.api.guncelleme ? AG.api.guncelleme.durum().catch(() => null) : Promise.resolve(null)
    ]);
    cizSatirlar(h, s && s.success ? s : null);
    cizGuncelleme(g);
  }

  // ── 63.0: sekmeler (Botlar · Bildirimler · Borsa · Bu bilgisayar · Güncelleme; 68.1 + Yedek ve taşıma — js/pages/tasima.js) ──
  const SEKMELER = ['botlar', 'bildirimler', 'borsa', 'bilgisayar', 'guncelleme', 'yedek'];
  /** Saf: adresin alt parçası → sekme (bilinmeyen ya da boş → Botlar; açılış her zaman Botlar). */
  const sekmeCoz = (alt) => { const a = String(alt || '').split('/')[0]; return SEKMELER.includes(a) ? a : 'botlar'; };
  function sekmeSec(ad) {
    if (!doc || !doc.querySelectorAll) return;
    const sec = sekmeCoz(ad);
    doc.querySelectorAll('[data-ayar-bolum]').forEach(p => p.classList.toggle('is-hidden', p.getAttribute('data-ayar-bolum') !== sec));
    doc.querySelectorAll('[data-ayar-sekme]').forEach(d => { const a = d.getAttribute('data-ayar-sekme') === sec; d.classList.toggle('is-active', a); d.setAttribute('aria-selected', a ? 'true' : 'false'); });
    return sec;
  }
  function sekmeleriBagla() {
    if (!doc || !doc.querySelectorAll) return;
    doc.querySelectorAll('[data-ayar-sekme]').forEach(d => {
      if (d.dataset && d.dataset.bagli) return;
      if (d.dataset) d.dataset.bagli = '1';
      d.addEventListener('click', () => { const a = d.getAttribute('data-ayar-sekme'); if (AG.rota && AG.rota.git) AG.rota.git(`ayarlar/${a}`); else sekmeSec(a); });
    });
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => {
      if (!e.detail || e.detail.bolum !== 'tab-settings') return;
      sekmeleriBagla();
      const sec = sekmeSec(e.detail.alt);
      // Yeni panel F2: alt yolsuz #/ayarlar açılan sekmeyi adrese yazar — yan menüde Ayarlar › Botlar işaretlenir.
      if (!e.detail.alt && sec) {
        try { if (global.history && global.history.replaceState) global.history.replaceState(null, '', '#/ayarlar/' + sec); } catch (x) { /* file:// */ }
        if (AG.rota && AG.rota.altDegisti) AG.rota.altDegisti(sec);
      }
      ciz();   // 68.1 "yedek" sekmesini js/pages/tasima.js kendi ag:rota dinleyicisiyle yükler
    });
  }

  AG.pages = AG.pages || {};
  AG.pages.ayarlar = { ciz, satirlar, cizSatirlar, guncellemeOzeti, cizGuncelleme, sekmeSec, sekmeCoz, SEKMELER };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.ayarlar;
})(typeof window !== 'undefined' ? window : globalThis);
