/**
 * KABUK — menü davranışı ve araştırma modu (PLAN-PANEL-PUSULA §2, P1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. YAN MENÜ ÇEKMECESİ (yeni panel F2): telefon/tablette alt çubuktaki "Menü"
 *    yan menünün KENDİSİNİ soldan açar (ayrı telefon menüsü yok). Ekran değişince,
 *    perdeye dokununca, × ya da Esc ile kapanır. Yollar `AG.rota`'da.
 *    Üst çubuk: kırıntı (menü grubu › bölüm) + sayfa adı, her `ag:rota`da; bir bot
 *    çalışırken "Acil durdur" (Botlar'daki aynı PIN'li / onaylı acil düğmesine basar).
 *
 * 2. ARAŞTIRMA MODU: sunucu `ARASTIRMA_MODU=1` ile açıldıysa (`GET /api/health`
 *    → `arastirmaModu: true`) başlıkta rozet + açıklama bandı görünür ve bot /
 *    borsa / emir düğmeleri DEVRE DIŞI kalır. Sunucu bu POST'ları zaten 403 ile
 *    reddediyor (server.js `ARASTIRMA_KAPALI`); panel düğmeye basıp hata almayı
 *    beklemeden söyler. Düğmelerin çoğu sayfa modüllerince sürekli yeniden
 *    çizildiği için kilit bir MutationObserver ile her çizimden sonra yeniden
 *    uygulanır. Kilitlenecekler `KILITLI` seçici listesinde; yeni bir bot/emir
 *    düğmesi `data-kilit="arastirma"` ile de işaretlenebilir.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => doc.getElementById(id);

  /** Sunucunun araştırma modunda reddettiği işlemlerin düğmeleri (server.js ARASTIRMA_KAPALI ile aynı kapsam). */
  const KILITLI = [
    '[data-kilit="arastirma"]',
    // Botlar: Hücum/Denge kartlarının eylem menüsü, acil fren, engel kaldır, mod/küçük sermaye seçicileri (/api/bindirme/*)
    '#botKartlari button:not(.yardim-isareti):not(.bot-serbest)', '#botKartlari select',
    // 62.6 Ayarlar › Botlar: mod, canlı hesap emir onayı, para yatırdım, küçük hesap kipi, şimdi çalıştır, kontroller
    '#ayarBotlar button:not(.yardim-isareti)', '#ayarBotlar select',
    // 74.5 Ayarlar › Botlar › Bot kayıtları: yeni bot, hesap bağlama, sermaye, arşiv (/api/botlar POST — araştırmada sunucu da 403)
    '#ayarBotKayit button:not(.yardim-isareti)', '#ayarBotKayit select', '#ayarBotKayit input',
    // Arşiv › Elle emir (62.7): bağlan / mutabakat / kilit / acil durdur (/api/exchange/*); elle emir formunun tamamı.
    // Borsa hesapları ve Arşiv › Kâğıt test hesabı tablolarındaki İptal / Kapat düğmeleri data-kilit="arastirma" taşır (js/pages/hesaplar.js).
    '#exchangeStatusBox button:not(.yardim-isareti)', '#exchangePreviewBox button:not(.yardim-isareti)', '#exchangePreviewBox input', '#exchangePreviewBox select',
    // Kâğıt motor: bot başlat/durdur (/api/bots/*). "Kâğıt testte dene" (Stratejiler, Pine) yalnız seçip ekranı açar — kilitli değil.
    '#btnSaveMultiSymbols', '#btnStopAllBots', '#tblActiveBotsList button:not(.yardim-isareti)',
    // Arşiv: Donchian botu (/api/exchange/bot)
    '#arsivDonchianKutu button:not(.yardim-isareti)',
    // Arşiv: Kalkan kartı (Ö17 salt okunur; çalışıyorsa yalnız Durdur — /api/kalkan/durdur)
    '#arsivKalkanKutu button:not(.yardim-isareti)',
    // Ayarlar: Telegram ve sağlık sinyali testleri (/api/telegram/test, /api/saglik/test)
    '#btnTestTg', '#btnHcTest',
    // Ayarlar kayıtları (denetim A-02): araştırma modunda sunucu bunları 403 ile reddeder (lib/guvenlik.js arastirmaAyarRed)
    // — bellekte kapatılan Telegram'ın config.json'a kalıcı yazılmaması için. Piyasa verisi, izleme listesi ekle/çıkar,
    // Telegram "Ayarları kaydet", sağlık sinyali kaydet/kaldır, Ayarlar › Borsa "Anahtarları kaydet" (/api/secrets).
    '#formMarket button:not(.yardim-isareti)', '#formMarket select', '#formMarket input',
    '#btnAddWatchlistSymbol', '#inpAddWatchlistSymbol', '.wl-remove',
    '#formTelegram button:not(.yardim-isareti)', '#formTelegram input',
    '#formSaglik button:not(.yardim-isareti)', '#formSaglik input',
    '#exchangeKeysBox button:not(.yardim-isareti)', '#exchangeKeysBox input',
    // Canlı hesap katı (Ö16): canlı anahtar kaydı ve CANLI bağlan
    '#canliParaKutu button:not(.yardim-isareti)', '#canliParaKutu input'
  ].join(', ');
  const KILIT_NEDENI = 'Araştırma modu: bu bilgisayarda bot, borsa, emir işlemleri ve ayar kayıtları kapalı (bot ve ayarlar sunucuda).';

  /**
   * TELEFON KADEMESİ (60.5): telefondan (Tailscale / köprü) yalnız izleme + acil durdurma. Aynı kilit listesi +
   * birkaç yazma düğmesi; Hücum/Denge kartındaki kırmızı "Acil durdur" (.acil-fren) AÇIK kalır (PIN'li diyalog,
   * js/pages/botlar.js). Diğer yazma istekleri zaten AG.api'de sunucuya gitmeden reddedilir (js/core/api.js).
   */
  const TELEFON_EK = ['[data-kilit="telefon"]', '#btnRunBacktest', '#btnResetKillSwitch', '#btnPreloadWatchlist'].join(', ');
  const TELEFON_NEDENI = 'Telefondan yalnız izleme ve acil durdurma — bu işlem sunucudaki panelden yapılır.';

  let arastirmaModu = false;
  let telefon = false;
  let acilPin = { tanimli: false, kilitli: false };
  let gozcu = null;

  function kilitle() {
    if (!arastirmaModu && !telefon) return;
    const neden = arastirmaModu ? KILIT_NEDENI : TELEFON_NEDENI;
    doc.querySelectorAll(telefon ? `${KILITLI}, ${TELEFON_EK}` : KILITLI).forEach(d => {
      // Telefonda acil durdurma açık kalır (araştırma modunda acil de kapalı: sunucu reddeder).
      if (!arastirmaModu && d.classList && d.classList.contains('acil-fren')) return;
      if (d.dataset.arastirmaKilitli === '1' && d.disabled) return;
      d.disabled = true;
      d.dataset.arastirmaKilitli = '1';
      d.setAttribute('title', neden);
    });
  }

  function gozcuKur() {
    if (!gozcu && global.MutationObserver) {
      let bekleyen = false;
      gozcu = new global.MutationObserver(() => {
        if (bekleyen) return;
        bekleyen = true;
        // Aynı çizimdeki yüzlerce değişiklik tek kilitleme turuna toplanır.
        global.requestAnimationFrame(() => { bekleyen = false; kilitle(); });
      });
      // `disabled` özniteliği de izlenir: AG.dom.hazir ya da bir modül düğmeyi yerinde yeniden açarsa kilit geri gelir.
      gozcu.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    }
  }
  function gozcuSok() { if (gozcu && !arastirmaModu && !telefon) { gozcu.disconnect(); gozcu = null; } }

  function arastirmaModunuUygula(acik) {
    arastirmaModu = !!acik;
    const rozet = bul('arastirmaRozet'), bant = bul('arastirmaBandi');
    if (rozet) rozet.classList.toggle('is-hidden', !arastirmaModu);
    if (bant) bant.classList.toggle('is-hidden', !arastirmaModu);
    doc.body.classList.toggle('arastirma-modu', arastirmaModu);
    if (!arastirmaModu) { gozcuSok(); return; }
    kilitle();
    gozcuKur();
  }

  /** Telefon kademesi: rozet + bant, AG.api yazma kilidi, düğme kilitleri (acil durdurma hariç). */
  function kademeyiUygula(kademe, pin) {
    telefon = kademe === 'telefon';
    acilPin = pin || { tanimli: false, kilitli: false };
    if (AG.api && AG.api.kademeAyarla) AG.api.kademeAyarla(telefon ? 'telefon' : 'yerel');
    const rozet = bul('telefonRozet'), bant = bul('telefonBandi');
    if (rozet) rozet.classList.toggle('is-hidden', !telefon);
    if (bant) bant.classList.toggle('is-hidden', !telefon);
    doc.body.classList.toggle('kademe-telefon', telefon);
    if (!telefon) { gozcuSok(); return; }
    kilitle();
    gozcuKur();
  }

  /** 61.7: araştırma bandında bot/işlem verisinin kaynağı (lib/evOkuma.js). */
  function evKaynakNotu(ev) {
    const n = bul('evKaynakNotu');
    if (!n) return;
    if (!ev || !ev.etkin) { n.textContent = ''; return; }
    if (!ev.kurulu && ev.sorun === 'eski-sifreli') { n.textContent = 'Sunucu bağlantı dosyası (data\\ev-baglanti.json) eski sürümün şifreli biçiminde, okunamıyor — bot ve işlem ekranları bu bilgisayardaki ESKİ kopyayı gösterir. Bağlantıyı yeniden kurun (Kılavuz › Kurulum, adım 23).'; return; }
    if (!ev.kurulu && ev.sorun === 'gecersiz') { n.textContent = 'Sunucu bağlantı dosyası (data\\ev-baglanti.json) eksik ya da bozuk (adres https, jeton) — bot ve işlem ekranları bu bilgisayardaki ESKİ kopyayı gösterir. Bağlantıyı yeniden kurun (Kılavuz › Kurulum, adım 23).'; return; }
    if (!ev.kurulu) { n.textContent = 'Bot ve işlem ekranları bu bilgisayardaki ESKİ kopyayı gösterir; güncel veri için sunucu bağlantısını kurun (Kılavuz › Kurulum, adım 23).'; return; }
    const hataSonra = ev.sonHata && (!ev.sonBasari || ev.sonHataZaman > ev.sonBasari);
    n.textContent = hataSonra ? `Bot ve işlem ekranları sunucudaki panelden okunuyor, ama son deneme başarısız (${ev.sonHata}) — gösterilen, son okunan kopya.`
      : 'Bot ve işlem ekranları sunucudaki panelden canlı okunuyor.';
  }

  /**
   * 68.1 ARAŞTIRMA EKLENTİSİ (PLAN-TASIMA F3, kullanıcı kararı 2026-10-19 §6.2): sunucu `arastirmaEklentisi: false` derse (yeni boş
   * kurulum, eklenti yüklenmemiş) Araştırma menü grubu, alt sayfaları ve kitapçık bağlantıları ([data-arastirma]) GİZLENİR; adresle
   * açılış ana sayfaya yönlenir (AG.rota.gizle). Bugünkü kurulumlar (eski data/ düzeni) hep "yüklü" sayılır — menü kaybolmaz.
   * Yanıt gelmeden önce menü görünür kalır (eski davranış).
   */
  let arastirmaEklentisi = true;
  function arastirmaEklentisiniUygula(yuklu) {
    arastirmaEklentisi = yuklu !== false;
    doc.querySelectorAll('[data-arastirma]').forEach(d => d.classList.toggle('is-hidden', !arastirmaEklentisi));
    if (AG.rota && AG.rota.gizle) AG.rota.gizle(arastirmaEklentisi ? {} : { menuler: ['arastirma'], yollar: ['kitapcik', 'kitap'] });   // 72.2: + Pusula Kitabı (araştırma paketiyle gelir)
    try { doc.dispatchEvent(new global.CustomEvent('ag:eklenti', { detail: { arastirma: arastirmaEklentisi } })); } catch (e) { /* eski tarayıcı */ }
  }

  async function sunucuModuOku() {
    try {
      const h = await AG.api.sunucuSagligi();
      kademeyiUygula(h && h.kademe, h && h.acilPin);
      arastirmaEklentisiniUygula(!(h && h.arastirmaEklentisi === false));
      arastirmaModunuUygula(!!(h && h.arastirmaModu));
      evKaynakNotu(h && h.evBaglanti);
      bantlariBirlestir();
      // Kartlar telefon / araştırma kipiyle yeniden (A-11 "eski kayıt" notu, A-12 Telegram satırı, A-22 acil PIN notu).
      if ((telefon || arastirmaModu) && AG.pages.botlar && AG.pages.botlar.yukle) AG.pages.botlar.yukle(true);
      if (arastirmaModu && AG.pages.ayarlar && AG.pages.ayarlar.ciz) AG.pages.ayarlar.ciz();
      if (arastirmaModu && AG.pages.anasayfa && AG.pages.anasayfa.yukle && AG.rota && AG.rota.acikMi && AG.rota.acikMi('tab-ana')) AG.pages.anasayfa.yukle();
    } catch (e) { /* sunucuya ulaşılamadı: rozet gösterilmez, sunucu yine reddeder */ }
  }

  /**
   * Denetim A-26: telefonda iki bant üst üste ekranın ~%30'unu kaplıyordu. Telefon kademesindeyken araştırma
   * bandı gizlenir (üst çubuktaki "Araştırma modu" rozeti aynı bilgiyi verir); dar ekranda bant tek satırdır,
   * dokununca açılır (CSS `.bant-acik`, panel denetimi A bloğu).
   */
  function bantlariBirlestir() {
    const ab = bul('arastirmaBandi');
    if (ab && telefon) ab.classList.add('is-hidden');
    ['arastirmaBandi', 'telefonBandi'].forEach(id => {
      const b = bul(id);
      if (!b || b.dataset.acilir) return;
      b.dataset.acilir = '1';
      b.setAttribute('tabindex', '0');
      b.setAttribute('title', 'Ayrıntı için dokunun');
      const ac = () => b.classList.toggle('bant-acik');
      b.addEventListener('click', ac);
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ac(); } });
    });
  }

  // ── Yan menü çekmecesi (telefon/tablet) ─────────────────────────────────
  function menuKapat() {
    if (!doc.body.classList.contains('menu-acik')) return;
    doc.body.classList.remove('menu-acik');
    const d = bul('btnMenu'), p = bul('menuPerde');
    if (d) d.setAttribute('aria-expanded', 'false');
    if (p) p.hidden = true;
  }
  function menuAc() {
    doc.body.classList.add('menu-acik');
    const d = bul('btnMenu'), p = bul('menuPerde');
    if (d) d.setAttribute('aria-expanded', 'true');
    if (p) p.hidden = false;
    const ilk = (doc.querySelector && doc.querySelector('#yanMenu .is-active')) || bul('btnMenuKapat');
    if (ilk && ilk.focus) ilk.focus();
  }

  // ── Üst çubuk: kırıntı + sayfa adı ───────────────────────────────────────
  /** Bölüm adı: yan menüdeki üst öğe (dal) ya da tek öğe; grup adı: öğeden önceki .menu-grup-ad. */
  function kirintiYaz(yol, alt) {
    const t = AG.rota && AG.rota.YOLLAR[yol];
    const k = bul('ustKirinti'), b = bul('ustBaslik');
    if (!t || !k || !b) return;
    const dal = doc.querySelector(`.menu-dal[data-menu="${t.menu}"]`);
    const ogeUst = dal || doc.querySelector(`#yanMenu > [data-rota="${yol}"]`);
    let grup = '';
    for (let x = ogeUst && ogeUst.previousElementSibling; x; x = x.previousElementSibling) {
      if (x.classList.contains('menu-grup-ad')) { grup = x.textContent.trim(); break; }
    }
    const bolumAd = dal ? ((dal.querySelector('.menu-ust span') || {}).textContent || '').trim() : '';
    // Sayfa adı: alt yollu sayfada o alt sayfanın menü yaprağı (Ayarlar › Bildirimler), yoksa rota başlığı.
    const yaprak = alt && doc.querySelector(`#yanMenu [data-rota="${yol}/${String(alt).split('/')[0]}"]`);
    const ad = yaprak ? yaprak.textContent.trim() : t.baslik;
    k.textContent = [grup, bolumAd && bolumAd !== ad && bolumAd !== grup ? bolumAd : ''].filter(Boolean).join(' › ');
    b.textContent = ad;
  }

  // ── Alt sayfalar (yeni panel F5): bölüm data-alt-sayfalar="a b c", öğe data-alt="a [b]" ─────────────
  /**
   * Bir bölümün alt sayfaları adreste (#/veri/tarama). Alt yoksa ya da bilinmiyorsa İLKİ açılır ve adrese yazılır (geçmişe kayıt
   * eklemeden) — yan menüde yaprağı işaretlensin. Görünen alt sayfadaki katlı bölüm (details) açık gelir.
   */
  function altSayfaUygula(yol, alt) {
    const t = AG.rota && AG.rota.YOLLAR[yol];
    const b = t && bul(t.bolum);
    const liste = b && b.getAttribute ? (b.getAttribute('data-alt-sayfalar') || '').split(/\s+/).filter(Boolean) : [];
    if (!liste.length) return;
    let a = String(alt || '').split('/')[0];
    if (!liste.includes(a)) {
      a = liste[0];
      try { if (global.history && global.history.replaceState) global.history.replaceState(null, '', `#/${yol}/${a}`); } catch (e) { /* file:// */ }
      if (AG.rota.altDegisti) AG.rota.altDegisti(a);
    }
    if (!b.querySelectorAll) return;
    b.querySelectorAll('[data-alt]').forEach(x => {
      const goster = x.getAttribute('data-alt').split(/\s+/).includes(a);
      x.classList.toggle('is-hidden', !goster);
      if (goster && x.tagName === 'DETAILS') x.open = true;
    });
  }

  // ── Üst çubuk: Acil durdur (bot çalışırken) ─────────────────────────────
  let calisanBot = null;
  async function acilDurumuOku() {
    const d = bul('btnUstAcil');
    if (!d || !AG.api || !AG.api.bindirmeDurum || !AG.pages.botlar) return;
    try {
      const ds = await Promise.all(AG.pages.botlar.ADLAR.map(a => AG.api.bindirmeDurum(a).catch(() => null)));
      const i = ds.findIndex(x => x && x.bot && x.bot.calisiyor);
      calisanBot = i >= 0 ? AG.pages.botlar.ADLAR[i] : null;
    } catch (e) { calisanBot = null; }
    d.classList.toggle('is-hidden', !calisanBot);
  }
  /** Botlar › <bot>'a gider ve o kartın acil düğmesine basar: onay (masaüstü) ya da PIN + DURDUR (telefon) aynı diyalogdan. */
  function ustAcil() {
    if (!calisanBot) return;
    const ad = calisanBot;
    AG.rota.git('botlar/' + ad);
    let deneme = 0;
    const bas = () => {
      const dg = doc.querySelector(`#botKart-${ad} .acil-fren`);
      if (dg && !dg.disabled) { dg.click(); return; }
      if (dg && dg.disabled) { if (AG.bildir) AG.bildir(dg.getAttribute('title') || 'Acil durdurma şu an kullanılamıyor.', 'uyari'); return; }
      if (++deneme < 20) global.setTimeout(bas, 250);
    };
    bas();
  }

  function baslat() {
    const d = bul('btnMenu');
    if (d) d.addEventListener('click', (e) => { e.stopPropagation(); if (doc.body.classList.contains('menu-acik')) menuKapat(); else menuAc(); });
    const kapat = bul('btnMenuKapat'), perde = bul('menuPerde');
    if (kapat) kapat.addEventListener('click', menuKapat);
    if (perde) perde.addEventListener('click', menuKapat);
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') menuKapat(); });
    // Rotanın O ANKİ alt yolu: bu olayın önceki dinleyicisi (botlar.js, ayarlar.js) alt sayfayı adrese yazmış olabilir.
    doc.addEventListener('ag:rota', (e) => {
      menuKapat();
      if (!e.detail) return;
      const alt = AG.rota.gecerli() === e.detail.yol ? AG.rota.alt() : e.detail.alt;
      altSayfaUygula(e.detail.yol, alt);
      kirintiYaz(e.detail.yol, AG.rota.gecerli() === e.detail.yol ? AG.rota.alt() : alt);
    });
    // Alt sayfa adrese replaceState ile yazılınca (hashchange yok) rota 'ag:rota-alt' gönderir; kırıntı tazelenir.
    doc.addEventListener('ag:rota-alt', (e) => { if (e.detail) kirintiYaz(e.detail.yol, e.detail.alt); });
    if (AG.rota && AG.rota.gecerli && AG.rota.gecerli()) altSayfaUygula(AG.rota.gecerli(), AG.rota.alt());
    if (AG.rota && AG.rota.gecerli && AG.rota.gecerli()) kirintiYaz(AG.rota.gecerli(), AG.rota.alt());
    const acil = bul('btnUstAcil');
    if (acil) acil.addEventListener('click', ustAcil);
    acilDurumuOku();
    const z = global.setInterval ? global.setInterval(acilDurumuOku, 60000) : null;
    if (z && z.unref) z.unref();   // Node'daki testlerde süreci açık tutmasın
    // İşaretlemedeki statik "?" düğmeleri (data-sozluk) açıklamayı sözlükten alır (Botlar, Borsa hesapları, Ayarlar, Arşiv).
    if (AG.sozluk && AG.sozluk.bagla) AG.sozluk.bagla(doc.body);
    sunucuModuOku();
  }

  AG.pages = AG.pages || {};
  AG.pages.kabuk = { baslat, arastirmaModunuUygula, arastirmaEklentisiniUygula, arastirmaEklentisi: () => arastirmaEklentisi, kademeyiUygula, kilitle, bantlariBirlestir, KILITLI, TELEFON_EK, menuAc, menuKapat, kirintiYaz, altSayfaUygula,
    arastirmaModu: () => arastirmaModu, telefon: () => telefon, acilPin: () => acilPin };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat);
  else baslat();
})(typeof window !== 'undefined' ? window : globalThis);
