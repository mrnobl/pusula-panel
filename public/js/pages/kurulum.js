/**
 * BİLGİ › KURULUM SİHİRBAZI — PLAN-PANEL-2 §0.6 (kullanıcı kararı 2026-10-19) `AG.pages.kurulum`
 * ═══════════════════════════════════════════════════════════════════════════
 * Sekiz adım (taslak 5): Hoş geldin · Riskler ve kullanım şartları (dört onay — sunucuya yazılır, onaysız bot başlamaz) ·
 * Pusula ne yapar / ne yapmaz · Binance demo anahtarı · Telegram · Telefondan erişim · Acil durdurma · İlk deneme (demo).
 * Her adımın durumu sunucudan okunur (✓): demo anahtarı (bindirme durum), Telegram (bildirim merkezi), telefon jetonu ve acil
 * PIN (/api/health). Yeni kurulumda panel ilk açılışta buraya gelir; mevcut kurulum hiç görmez (lib/kurulum.js "eski").
 * 68.1 (PLAN-TASIMA F3): ilk adımda iki yol — "Yeni kurulum" (sekiz adım) ya da "Başka bilgisayardan taşı" (taşıma dosyası /
 * USB yedeği → şifre → önizleme → yerine koy; js/pages/tasima.js iceAktarAkisi). Taşınan kurulumda botlar mutabakat bekler (bant).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);

  const ADIMLAR = [
    { id: 'hosgeldin', ad: 'Hoş geldin' },
    { id: 'riskler', ad: 'Riskler ve kullanım şartları' },
    { id: 'ne-yapar', ad: 'Pusula ne yapar, ne yapmaz' },
    { id: 'binance', ad: 'Binance demo anahtarı', durum: (d) => d.demoAnahtar },
    { id: 'telegram', ad: 'Telegram botun', durum: (d) => d.telegram },
    { id: 'telefon', ad: 'Telefondan erişim', durum: (d) => d.telefon },
    { id: 'acil', ad: 'Acil durdurma', durum: (d) => d.acilPin },
    { id: 'ilk-deneme', ad: 'İlk deneme (demo)' },
  ];
  let aktif = 0;
  let yontem = 'yeni';   // 68.1: 'yeni' | 'tasi'
  let tasimaKap = null;  // kalıcı kap: akışın durumu çizimler arasında korunur
  let k = null;          // GET /api/kurulum
  let d = {};            // adım durumları
  const isaret = new Set();

  async function durumlariOku() {
    const g = async (f) => { try { return await f(); } catch (e) { return null; } };
    const [saglik, bot, bil] = await Promise.all([g(() => AG.api.sunucuSagligi()),
      g(() => AG.api.bindirmeDurum('hucum')), g(() => AG.api.bildirim.liste())]);
    d = { demoAnahtar: !!(bot && bot.demoAnahtar), telegram: !!(bil && bil.telegram && bil.telegram.bagli),
      telefon: !!(saglik && saglik.telefonJeton), acilPin: !!(saglik && saglik.acilPin && saglik.acilPin.tanimli) };
  }

  const p = (metin) => el('p', { class: 'kr-metin', text: metin });
  const liste = (l) => el('ol', { class: 'kr-liste' }, l.map(x => el('li', { text: x })));
  const bag = (href, metin) => el('a', { class: 'kr-bag', href, text: metin });
  const durumSatiri = (tamam, evet, hayir) => el('p', { class: `kr-durum ${tamam ? 'kr-tamam' : 'kr-eksik'}`, text: tamam ? `✓ ${evet}` : `• ${hayir}` });

  function icerik(id) {
    switch (id) {
      case 'hosgeldin': {
        const secim = (id, deger, baslik, alt) => el('button', { type: 'button', id, class: 'kr-secim', 'aria-pressed': yontem === deger ? 'true' : 'false', onclick: () => { yontem = deger; ciz(); } },
          [el('strong', { text: baslik }), el('span', { text: alt })]);
        if (yontem === 'tasi' && !tasimaKap && AG.pages.tasima && AG.pages.tasima.iceAktarAkisi) {
          tasimaKap = el('div', { class: 'ts-akis', id: 'kurulumTasima' });
          AG.pages.tasima.iceAktarAkisi(tasimaKap, { tur: 'tasima', bitince: () => bantYukle() });
        }
        return [
          p('Pusula senin bilgisayarında, senin borsa hesabınla çalışan bir yazılım. Portföyünü izler, bot çalıştırır, rapor ve bildirim gönderir.'),
          p('Bütün bilgiler — borsa anahtarların, portföy kayıtların, Telegram ayarların — yalnız bu bilgisayarda durur. Yazılımı geliştirenlere hiçbir şey gönderilmez; onlardan sana yalnız güncellemeler gelir.'),
          el('div', { class: 'kr-secimler', role: 'group', 'aria-label': 'Kurulum yolu' }, [
            secim('btnKrYeni', 'yeni', 'Yeni kurulum', 'Sekiz adım, yaklaşık 20 dakika. Her adımı sonra Bilgi › Kurulum sihirbazı\'ndan yeniden açabilirsin.'),
            secim('btnKrTasi', 'tasi', 'Başka bilgisayardan taşı', 'Eski bilgisayarındaki taşıma dosyasıyla (ya da USB yedeğiyle) her şey kendiliğinden kurulur.'),
          ]),
          yontem === 'tasi' ? (tasimaKap || p('Taşıma ekranı yüklenemedi — sayfayı yenileyin.')) : null,
        ];
      }
      case 'riskler': {
        const onayli = k && k.onayli;
        const kutular = (k ? k.maddeler : []).map(m => {
          const c = el('input', { type: 'checkbox', id: `chkKr-${m.id}`, class: 'kr-kutu', disabled: onayli ? '' : null, onchange: (e) => { if (e.target.checked) isaret.add(m.id); else isaret.delete(m.id); ciz(); } });
          c.checked = onayli || isaret.has(m.id);
          return el('label', { class: 'kr-onay', for: `chkKr-${m.id}` }, [c, el('span', { text: m.metin })]);
        });
        return [
          el('div', { class: 'kr-kutu-metin' }, [
            p('Pusula bir yazılımdır; yatırım tavsiyesi, danışmanlık ya da portföy yönetimi hizmeti değildir. Bot ayarlarını, hangi hesabı bağlayacağını ve canlı hesapla çalışıp çalışmayacağını sen seçersin.'),
            p('Kripto ve hisse piyasalarında paranın tamamını kaybedebilirsin. Geçmiş test sonuçları gelecekte aynısının olacağını göstermez.'),
            bag('#/kilavuz/kullanim-sartlari', 'Kullanım şartlarının tam metnini oku →'),
          ]),
          el('div', { class: 'kr-onaylar' }, kutular),
          onayli ? durumSatiri(true, `Onaylandı (${k.onay ? new Date(k.onay.tarih).toLocaleString('tr-TR') : 'mevcut kurulum'})`, '') : null,
        ];
      }
      case 'ne-yapar': return [
        el('div', { class: 'kr-iki' }, [
          el('div', null, [el('h3', { class: 'kr-alt', text: 'Yapar' }), liste([
            'Senin onayınla Binance hesabında bot çalıştırır (önce demo).',
            'Portföyünü, işlemlerini ve hedef dağılımını izler.',
            'Her gün rapor hazırlar, Telegram\'a bildirim gönderir.',
            'Telefondan izlemeyi ve PIN\'li acil durdurmayı sağlar.',
          ])]),
          el('div', null, [el('h3', { class: 'kr-alt', text: 'Yapmaz' }), liste([
            'Para çekmez, para göndermez — API anahtarında çekim izni hiç açılmamalı.',
            'Senin yerine karar vermez; canlı hesabı ancak sen açarsın.',
            'Kazanç sözü vermez; geçmiş sonuçlar geleceği göstermez.',
            'Verilerini kimseyle paylaşmaz.',
          ])]),
        ]),
      ];
      case 'binance': return [
        p('Botlar önce Binance\'in Demo Trading (sanal para) hesabında çalışır.'),
        liste(['Binance → Futures → Demo Trading → API Management\'a gir.', 'Yeni anahtar oluştur; yalnız okuma ve işlem izni kalsın — para çekme (Withdraw) izni KAPALI.', 'API Key ve Secret Key\'i Ayarlar › Bağlantılar\'daki "Demo hesap API anahtarı" bölümüne yapıştır ve kaydet.']),
        bag('#/ayarlar/borsa', 'Ayarlar › Bağlantılar\'ı aç →'),
        durumSatiri(d.demoAnahtar, 'Demo anahtarı kayıtlı', 'Demo anahtarı henüz girilmedi'),
      ];
      case 'telegram': return [
        p('Botların özetleri, uyarıları ve günlük rapor Telegram\'a gelir.'),
        liste(['Telegram\'da @BotFather\'a /newbot yaz; botuna ad ver, sana bir token verir.', 'Kendi botuna /start yaz.', '@userinfobot\'a bir mesaj at; "Id" satırı chat id\'ndir.', 'Token ve chat id\'yi Ayarlar › Bildirimler\'e gir, Etkinleştir\'i işaretle, kaydet, "Test mesajı gönder".']),
        bag('#/ayarlar/bildirimler', 'Ayarlar › Bildirimler\'i aç →'),
        durumSatiri(d.telegram, 'Telegram bağlı', 'Telegram henüz bağlı değil'),
      ];
      case 'telefon': return [
        p('Telefondan paneli izleyebilir ve acil durumda botu durdurabilirsin. Bağlantı Tailscale (ücretsiz) ile yalnız senin cihazların arasında kurulur.'),
        liste(['Bu bilgisayara ve telefonuna Tailscale kur, aynı hesapla giriş yap.', 'Bu bilgisayarda komut satırında: npm run telefon-jeton (telefon için giriş jetonu).', 'Kılavuzdaki adımlarla telefondan paneli aç.']),
        bag('#/kilavuz/kurulum/adim-17', 'Kılavuz: Telefondan erişim →'),
        durumSatiri(d.telefon, 'Telefon jetonu hazır', 'Telefon jetonu henüz oluşturulmadı'),
      ];
      case 'acil': return [
        p('Bir şeyler ters giderse botu hemen durdurabilmelisin. Masaüstünde üst çubuktaki "Acil durdur", telefondan PIN ile aynı düğme.'),
        liste(['Bu bilgisayarda komut satırında: npm run acil-pin — 6 haneli bir PIN belirle.', 'Demo bot çalışırken bir kez "Acil durdur"u dene: bot durur, açık pozisyonlar kapanır.', 'PIN\'i kimseyle paylaşma; 5 yanlış denemede kilitlenir.']),
        bag('#/kilavuz/kurulum/adim-8', 'Kılavuz: Acil PIN →'),
        durumSatiri(d.acilPin, 'Acil PIN tanımlı', 'Acil PIN henüz tanımlanmadı'),
      ];
      case 'ilk-deneme': return [
        p('Her şey hazırsa demo hesapta ilk denemeyi yap.'),
        liste(['Botlar › Hücum › Yönetim\'de hesap türünü "demo" seç.', 'Genel görünümünde "Başlat".', 'Ertesi gün Raporlar\'da ve Telegram\'da günlük raporu gör.', 'Gerçek hesaba geçmeyi düşünmeden önce demo hesabı en az birkaç hafta izle.']),
        bag('#/botlar/hucum/yonetim', 'Botlar › Hücum › Yönetim →'),
        k && k.tamamlandi ? durumSatiri(true, 'Kurulum tamamlandı', '') : null,
      ];
      default: return [];
    }
  }

  async function onayla(dugme) {
    AG.dom.mesgul(dugme, 'Kaydediliyor…');
    try {
      const r = await AG.api.kurulum.onayla(k.kosulSurum, [...isaret]);
      if (!r || !r.success) { AG.bildir(`Kaydedilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      k = r; aktif += 1; ciz(); bantYukle();
    } catch (e) { AG.bildir(`Kaydedilemedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(dugme); }
  }

  async function bitir(dugme) {
    AG.dom.mesgul(dugme, 'Kaydediliyor…');
    try {
      const r = await AG.api.kurulum.tamamla();
      if (!r || !r.success) { AG.bildir(`Tamamlanamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      k = r; bantYukle(); AG.bildir('Kurulum tamamlandı. İyi çalışmalar!', 'ok');
      if (AG.rota) AG.rota.git('ana');
    } catch (e) { AG.bildir(`Tamamlanamadı: ${e.message}`, 'hata'); } finally { AG.dom.hazir(dugme); }
  }

  function ciz() {
    const kap = bul('kurulumKok');
    if (!kap || !k) return;
    const a = ADIMLAR[aktif];
    const riskte = a.id === 'riskler';
    const hepsi = k.maddeler.every(m => isaret.has(m.id));
    const ileri = riskte && !k.onayli
      ? el('button', { type: 'button', class: 'btn btn-primary', id: 'btnKrOnayla', disabled: hepsi ? null : '', onclick: (e) => onayla(e.currentTarget) }, [el('span', { text: 'Onaylıyorum, devam et' })])
      : aktif === ADIMLAR.length - 1
        ? el('button', { type: 'button', class: 'btn btn-primary', id: 'btnKrBitir', disabled: k.onayli ? null : '', onclick: (e) => bitir(e.currentTarget) }, [el('span', { text: 'Kurulumu bitir' })])
        : el('button', { type: 'button', class: 'btn btn-primary', id: 'btnKrDevam', disabled: aktif > 1 && !k.onayli ? '' : null, onclick: () => { aktif += 1; ciz(); } }, [el('span', { text: 'Devam et' })]);
    doldur(kap, [el('div', { class: 'kr-izgara' }, [
      el('nav', { class: 'kr-adimlar', 'aria-label': 'Kurulum adımları', id: 'kurulumAdimlar' }, [
        el('span', { class: 'df-soluk kr-sayac', text: `Pusula kurulumu · ${aktif + 1} / ${ADIMLAR.length}` }),
        ...ADIMLAR.map((x, i) => {
          const tamam = x.id === 'riskler' ? k.onayli : x.durum ? x.durum(d) : i < aktif;
          return el('button', { type: 'button', class: `kr-adim${i === aktif ? ' kr-adim-aktif' : ''}`, 'aria-current': i === aktif ? 'step' : null,
            disabled: i > 1 && !k.onayli ? '' : null, onclick: () => { aktif = i; ciz(); } }, [
            el('span', { class: `kr-no${tamam ? ' kr-no-tamam' : ''}`, text: tamam ? '✓' : String(i + 1) }), el('span', { text: x.ad })]);
        }),
      ]),
      el('section', { class: 'kr-ana p-kart', id: 'kurulumAdim' }, [
        el('h2', { class: 'kr-baslik', text: a.ad }),
        ...icerik(a.id),
        el('div', { class: 'kr-alt-cubuk' }, [
          el('button', { type: 'button', class: 'btn btn-secondary', disabled: aktif === 0 ? '' : null, onclick: () => { aktif = Math.max(0, aktif - 1); ciz(); } }, [el('span', { text: 'Geri' })]),
          riskte && !k.onayli ? el('span', { class: 'df-soluk', text: hepsi ? 'Dördü de işaretlendi' : 'Dördü işaretlenince devam edilir' }) : null,
          ileri,
        ]),
      ]),
    ])]);
  }

  async function yukle() {
    const kap = bul('kurulumKok');
    if (!kap) return;
    try { k = await AG.api.kurulum.durum(); } catch (e) { k = null; }
    if (!k || !k.success) { doldur(kap, [AG.bildirim.hataKutusu((k && k.error) || 'sunucu yanıt vermedi', { baslik: 'Kurulum durumu okunamadı', yeniden: yukle })]); return; }
    await durumlariOku();
    ciz();
  }

  /**
   * Kurulum bandı (kullanıcı 2026-10-19: sihirbaz zorunlu DEĞİL, tamamlanmadıysa her girişte uyar). Yönlendirme yok; panelin
   * bant yuvasında (#kurulumBandi) uyarı + "Kurulum sihirbazını aç" + "Şimdilik geç". "Şimdilik geç" yalnız bu oturum için
   * (sessionStorage) — paneli yeniden açınca uyarı yine çıkar. Riskler onaylanmadıysa bot başlatılamadığını da söyler.
   */
  const GEC_ANAHTAR = 'pusula.kurulum.gec';
  const gecildi = () => { try { return global.sessionStorage && global.sessionStorage.getItem(GEC_ANAHTAR) === '1'; } catch (e) { return false; } };
  function bantCiz(r) {
    const b = bul('kurulumBandi');
    if (!b) return;
    // 68.1: taşıma sonrası "mutabakat bekliyor" — kurulum tamam olsa da görünür; botlar mutabakatla açılır.
    const t = r && r.success && r.tasima;
    if (t) {
      const bekleyen = (t.botlar || []).filter(x => !(t.temiz || []).includes(x));
      b.classList.remove('is-hidden');
      doldur(b, [el('span', { text: `Bu kurulum ${t.kaynakMakine || 'başka bir bilgisayar'} adlı bilgisayardan taşındı: botlar kendiliğinden başlamaz. Her bot için önce "Mutabakat", temiz çıkınca "Başlat" (bekleyen: ${bekleyen.join(', ')}). ` }),
        el('a', { href: '#/botlar/hucum/yonetim', text: 'Botlar › Hücum › Yönetim' })]);
      return;
    }
    const goster = !!(r && r.success && r.gerekli) && !gecildi();
    b.classList.toggle('is-hidden', !goster);
    if (!goster) { doldur(b, []); return; }
    doldur(b, [
      el('span', { text: r.onayli ? 'Kurulum tamamlanmadı: Telegram, telefon ve acil durdurma adımlarına bakmadın. '
        : 'Kurulum tamamlanmadı: riskler ve kullanım şartları onaylanmadan botlar başlatılamaz. ' }),
      el('a', { href: '#/kurulum', text: 'Kurulum sihirbazını aç' }),
      el('button', { type: 'button', class: 'btn btn-secondary btn-sm kr-bant-gec', onclick: () => { try { global.sessionStorage.setItem(GEC_ANAHTAR, '1'); } catch (e) { /* özel pencere */ } bantCiz(null); } },
        [el('span', { text: 'Şimdilik geç' })]),
    ]);
  }
  async function bantYukle() {
    try { bantCiz(await AG.api.kurulum.durum()); } catch (e) { /* sunucu yoksa sessiz */ }
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-kurulum') yukle(); });
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => global.setTimeout(bantYukle, 300)); else global.setTimeout(bantYukle, 300);
  }

  AG.pages = AG.pages || {};
  AG.pages.kurulum = { yukle, ADIMLAR, _durum: { yontemAyarla: (v) => { yontem = v; }, aktifAyarla: (i) => { aktif = i; }, kAyarla: (v) => { k = v; }, dAyarla: (v) => { d = v; }, isaret } , _ciz: { ciz, icerik } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.kurulum;
})(typeof window !== 'undefined' ? window : globalThis);
