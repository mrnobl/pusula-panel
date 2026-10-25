/**
 * AYARLAR › ANAHTARLAR (73.0, Faz 1 "makine × hesap × bot") `AG.pages.anahtarlar`
 * ═══════════════════════════════════════════════════════════════════════════
 * #/ayarlar/anahtarlar — kayıtlı BÜTÜN sırlar gruplu tek tabloda (sunucu: lib/anahtarlar.js):
 *   Borsa hesapları ("Binance canlı (Kairos)" / "Binance demo (Kairos)" sabit satırları + eklenen hesaplar, "Hesap ekle") ·
 *   İşlem defterim (salt okuma) · Bildirim (Telegram jetonu, sağlık sinyali adresleri) · Erişim (acil PIN, jetonlar, sunucu bağlantısı …).
 * Değer YALNIZ son 4 karakterle görünür (sunucu zaten tamamını hiç göndermez). Her yazma acil PIN + onay ister (pencere).
 * Araştırma kopyasında liste SUNUCUDAN gelir; sunucuya ulaşılamazsa değişiklik bu bilgisayarda bekler → "Gönder" bandı;
 * sunucudaki değer o arada değiştiyse iki maskeli değer yan yana, hangisinin geçerli olacağı sorulur.
 * Telefonda yalnız görüntüleme. DOM AG.dom (innerHTML yok), stil p- ailesi + an- düzen sınıfları (inline stil yok), istek AG.api.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);

  const GRUPLAR = [
    ['borsa', 'Borsa hesapları', 'Botların ve hesapların borsa API anahtarları. Bugün Kairos ve Tao "Binance demo (Kairos)" / "Binance canlı (Kairos)" anahtarlarını kullanır; yeni eklenen hesaplar Faz 2\'de botlara bağlanacak.'],
    ['defter', 'İşlem defterim (salt okuma)', 'İşlem geçmişini okumak için yalnız okuma izinli anahtarlar.'],
    ['bildirim', 'Bildirim', 'Telegram ve healthchecks.io ("ölü adam anahtarı") adresleri.'],
    ['yapayzeka', 'Yapay zekâ', 'Yapay zekâ notları için Google Gemini anahtarı (ücretsiz katman; Google AI Studio). Yalnız kamuya açık haber ve bildirim metni gönderilir.'],
    ['erisim', 'Erişim', 'Panele ve korumalı işlemlere giriş. Bunlar bilgisayar başında komutla değişir; burada yalnız durumları.'],
    ['bu', 'Bu bilgisayar', 'Bu geliştirme bilgisayarının kendi kayıtları (sunucudan ayrı).']
  ];
  const DURUM = { tamam: ['Tamam', 'p-rozet-pos'], bakilmali: ['Bakılmalı', 'p-rozet-warn'], eksik: ['Eksik', 'p-rozet-neg'], bos: ['Boş', ''] };
  const BORSA_AD = { binance: 'Binance', okx: 'OKX', bybit: 'Bybit' };
  const TUR_AD = { demo: 'demo', canli: 'canlı', aktarim: 'aktarım' };
  /** A2 parça 2: OKX hesabının hazırlık durumu (lib/live/borsalar/okx.js `durum`; hazir:true olunca kalkar). */
  const OKX_HAZIRLIK = 'OKX demo: hazırlık — henüz bota bağlanamaz (anahtar saklanır, salt okuma sınanır)';
  const DOSYA_AD = { 'secrets.json': 'API anahtarları dosyası (secrets.json)', 'telefon-jeton.json': 'Telefon jetonu dosyası (telefon-jeton.json)', 'ev-baglanti.json': 'Sunucu bağlantısı dosyası (ev-baglanti.json)', 'yedek-sifre.json': 'Yedek şifresi dosyası (yedek-sifre.json)' };

  let veri = null, form = null, cakisma = null, mesgul = false;
  const telefonMu = () => !!(AG.api && AG.api.kademe && AG.api.kademe() === 'telefon') || !!(veri && veri.yazilabilir === false);
  const zaman = (iso) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

  /* ── Saf yardımcılar (öz test: scripts/anahtarlar-selftest.js) ── */
  /** Saf: durum → [etiket, sınıf]; tehlike (para çekme izni) kırmızı. */
  function rozet(satir) {
    const d = DURUM[satir && satir.durum] || ['—', ''];
    return satir && satir.tehlike ? [d[0], 'p-rozet-neg'] : d;
  }
  /** Saf: satırları grup sırasına göre böler (boş grup atlanır). */
  function grupla(satirlar, yerelSatirlar) {
    const l = [...(satirlar || []), ...(yerelSatirlar || []).map(x => ({ ...x, grup: 'bu' }))];
    return GRUPLAR.map(([k, ad, alt]) => ({ kimlik: k, ad, alt, satirlar: l.filter(x => x.grup === k) })).filter(g => g.satirlar.length);
  }
  /** Saf: makine sütunu. */
  function makineAdi(satir, arastirma) {
    if (satir.makine === 'sunucu') return 'Sunucu';
    return arastirma ? 'Bu bilgisayar' : 'Bu bilgisayar (sunucu)';
  }
  /** Saf: kaynak → bant { metin, tur } | null. */
  function kaynakBandi(v) {
    if (!v || !v.arastirma) return null;
    if (v.kaynak === 'sunucu') return { metin: `Sunucudaki anahtarlar gösteriliyor${v.adres ? ` (${v.adres})` : ''}. Değişiklik sunucuya gönderilir; PIN sunucuda doğrulanır.${v.yazmaKurulu ? '' : ' Yazma bağlantısı yok — değişiklik yapılamaz (sunucuda `npm run gelistirme-jeton`).'}`, tur: v.yazmaKurulu ? '' : 'uyari' };
    if (v.kaynak === 'sunucu-eski') return { metin: `Sunucuya şu an ulaşılamıyor — son okunan liste gösteriliyor (${zaman(v.sunucuZaman)}). Yaptığınız değişiklik bu bilgisayarda bekler; bağlantı gelince "Gönder".`, tur: 'uyari' };
    return { metin: v.mesaj || 'Sunucudaki listeye ulaşılamadı.', tur: 'uyari' };
  }
  /** Saf: satır tipi → form alanları [{ ad, etiket, tip, ipucu, secenekler }]. */
  function alanlar(satir, ekle) {
    const k = (ad, etiket, ipucu) => ({ ad, etiket, tip: 'password', ipucu });
    if (ekle) {
      return [{ ad: 'ad', etiket: 'Hesap adı', tip: 'text', ipucu: 'ör. Binance alt hesap — Tao' },
        { ad: 'borsa', etiket: 'Borsa', tip: 'select', secenekler: [['binance', 'Binance'], ['okx', 'OKX'], ['bybit', 'Bybit']] },
        { ad: 'tur', etiket: 'Hesap türü', tip: 'select', secenekler: [['demo', 'Demo (sahte para)'], ['canli', 'Canlı hesap'], ['aktarim', 'Aktarım (yalnız alt hesaplar arası — çekme izni KAPALI)']] },
        { ad: 'altHesap', etiket: 'Alt hesap (isteğe bağlı)', tip: 'text', ipucu: 'alt hesap e-postası (Binance) / adı (OKX)' },
        k('apiKey', 'API anahtarı'), k('apiSecret', 'Gizli anahtar (secret)'), k('parola', 'Parola (yalnız OKX: passphrase)')];
    }
    switch (satir.tip) {
      case 'borsa-sabit': return [k('apiKey', 'Yeni API anahtarı'), k('apiSecret', 'Yeni gizli anahtar (secret)')];
      case 'borsa-hesap': return [{ ad: 'ad', etiket: 'Hesap adı', tip: 'text', deger: satir.ad }, { ad: 'altHesap', etiket: 'Alt hesap', tip: 'text', deger: (satir.ek && satir.ek.altHesap) || '' },
        k('apiKey', 'Yeni API anahtarı', 'boş bırakılırsa değişmez'), k('apiSecret', 'Yeni gizli anahtar', 'boş bırakılırsa değişmez'),
        ...(satir.ek && satir.ek.borsa === 'okx' ? [k('parola', 'Yeni parola (passphrase)', 'boş bırakılırsa değişmez')] : [])];
      case 'defter-okx': return [k('apiKey', 'API anahtarı'), k('apiSecret', 'Gizli anahtar (secret)'), k('parola', 'Parola (passphrase)'),
        { ad: 'saltOkumaOnay', etiket: 'Anahtarı OKX\'te yalnız "Read" izniyle oluşturdum', tip: 'checkbox' }];
      case 'defter-binance': return [k('apiKey', 'API anahtarı'), k('apiSecret', 'Gizli anahtar (secret)')];
      case 'telegram': return [k('deger', 'Yeni bot jetonu', '@BotFather\'ın verdiği "123456789:AA…" metni')];
      case 'saglik': return [k('deger', 'Yeni ping adresi', 'https://hc-ping.com/…')];
      case 'gemini': return [k('deger', 'Gemini API anahtarı', 'Google AI Studio › Get API key — genelde "AIza…" ile başlar')];
      case 'pin': return [{ ad: 'eskiPin', etiket: 'Şimdiki PIN', tip: 'password', inputmode: 'numeric' }, { ad: 'yeniPin', etiket: 'Yeni PIN (6–12 rakam)', tip: 'password', inputmode: 'numeric' },
        { ad: 'yeniPin2', etiket: 'Yeni PIN (tekrar)', tip: 'password', inputmode: 'numeric' }];
      default: return [];
    }
  }
  /** Saf: son sınamanın kısa metni. */
  function sinamaMetni(s) {
    if (!s) return null;
    if (!s.ok) return `Son sınama ${zaman(s.zaman)}: başarısız — ${s.hata || 'bilinmeyen hata'}`;
    const p = [`Son sınama ${zaman(s.zaman)}: bağlantı tamam`];
    if (s.botAdi) p.push(s.botAdi);
    if (s.bakiye) p.push(`${s.bakiye.varlikSayisi} varlık${s.bakiye.usdt != null ? `, ${s.bakiye.usdt.toLocaleString('tr-TR')} USDT` : ''}`);
    if (s.izinler && s.izinler.length) p.push(`izinler: ${s.izinler.join(', ')}`);
    if (s.saltOkuma === true) p.push('yalnız okuma');
    if (s.ipKisitli === false) p.push('IP kısıtı YOK');
    return p.join(' · ');
  }

  const PIN_ALANI = { ad: 'pin', etiket: 'Acil PIN', tip: 'password', inputmode: 'numeric', dogrula: (v) => /^\d{6,12}$/.test(v.trim()) };
  async function pinSor(baslik, metin, tehlikeli) {
    const c = await AG.onayla({ baslik, metin, onay: tehlikeli ? 'Sil' : 'Onayla', tehlikeli: tehlikeli || undefined, alanlar: [PIN_ALANI] });
    return c && typeof c === 'object' ? c.pin.trim() : null;
  }
  function sonuc(r, basari) {
    if (r && r.bekleyen) { AG.bildir(r.mesaj || 'Değişiklik bu bilgisayarda bekliyor.', 'uyari', { sure: 10000 }); return true; }
    if (r && r.success) { AG.bildir(basari, 'ok'); if (r.uyari) AG.bildir(r.uyari, 'uyari', { sure: 10000 }); return true; }
    AG.bildir(`Yapılamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 10000 });
    return false;
  }
  async function is_(fn) {
    if (mesgul) return;
    mesgul = true;
    try { await fn(); } catch (e) { AG.bildir(`Yapılamadı: ${e.message}`, 'hata'); } finally { mesgul = false; }
  }

  /* ── Eylemler ── */
  async function kaydet() {
    if (!form) return;
    const d = {};
    for (const a of form.alanlar) {
      const g = bul(`anAlan-${a.ad}`);
      d[a.ad] = !g ? '' : a.tip === 'checkbox' ? !!g.checked : String(g.value || '');
    }
    await is_(async () => {
      let r;
      if (form.tip === 'pin') {
        if (d.yeniPin !== d.yeniPin2) { AG.bildir('Yeni PIN iki kez aynı yazılmalı.', 'hata'); return; }
        const ok = await AG.onayla({ baslik: 'Acil PIN değiştirilsin mi?', metin: veri && veri.arastirma ? 'PIN önce sunucuda, sonra bu bilgisayarda değişir. Biri başarısız olursa ekranda açıkça yazar.' : 'Telefondan acil durdurma ve korumalı işlemler yeni PIN\'i ister. Başka bilgisayarlar varsa orada da aynı PIN\'i girin.', onay: 'Değiştir' });
        if (!ok) return;
        r = await AG.api.anahtarlar.pinDegistir(d.eskiPin.trim(), d.yeniPin.trim(), d.yeniPin2.trim());
        if (r && r.ayrisma) { AG.bildir(r.error, 'hata', { sure: 20000 }); form = null; await yukle(); return; }
        if (sonuc(r, r && r.mesaj ? r.mesaj : 'Acil PIN değiştirildi.')) { form = null; await yukle(); }
        return;
      }
      const ad = form.ekle ? (d.ad || 'yeni hesap') : form.satir.ad;
      const pin = await pinSor(form.ekle ? 'Hesap eklensin mi?' : `"${ad}" değiştirilsin mi?`, `${veri && veri.arastirma ? 'Değişiklik sunucuya gönderilir (ulaşılamazsa bu bilgisayarda bekler). ' : ''}Onaylamak için acil PIN'i girin.`);
      if (!pin) return;
      if (form.ekle) r = await AG.api.anahtarlar.hesapEkle({ ad: d.ad, borsa: d.borsa, tur: d.tur, altHesap: d.altHesap, apiKey: d.apiKey, apiSecret: d.apiSecret, parola: d.parola }, pin);
      else {
        const alan = {};
        for (const [k, v] of Object.entries(d)) if (v !== '' && v !== false) alan[k] = v;
        r = await AG.api.anahtarlar.degistir(form.satir.kimlik, alan, pin);
      }
      if (sonuc(r, form.ekle ? 'Hesap eklendi.' : 'Değiştirildi.')) { form = null; await yukle(); }
    });
  }
  async function sil(satir) {
    const pin = await pinSor(`"${satir.ad}" silinsin mi?`, `Kayıtlı değer silinir${satir.kullanan ? ` (kullanan: ${satir.kullanan})` : ''}. Geri alınamaz; yeniden girmeniz gerekir.`, true);
    if (!pin) return;
    await is_(async () => { if (sonuc(await AG.api.anahtarlar.sil(satir.kimlik, pin), 'Silindi.')) await yukle(); });
  }
  async function sina(satir) {
    await is_(async () => {
      AG.bildir(`"${satir.ad}" sınanıyor (yalnız okuma, emir yok)…`, 'bilgi');
      const r = await AG.api.anahtarlar.sina(satir.kimlik);
      if (!r || !r.success) { AG.bildir(`Sınanamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 10000 }); return; }
      const s = r.sonuc || {};
      if (s.cekmeIzni) AG.bildir(`DİKKAT: "${satir.ad}" anahtarında PARA ÇEKME izni AÇIK — borsada hemen kapatın.`, 'hata', { sure: 20000 });
      else AG.bildir(sinamaMetni(s) || 'Sınandı.', s.ok ? 'ok' : 'hata', { sure: 10000 });
      await yukle();
    });
  }
  async function kenaraAl(dosya) {
    const pin = await pinSor('Eski şifreli dosya kenara alınsın mı?', `${DOSYA_AD[dosya] || dosya} SİLİNMEZ; "${dosya}.eski-sifreli-<tarih>" adıyla aynı klasörde kenara alınır. Pusula içindekileri çözmeye çalışmaz. Sonra anahtarları bu ekrandan yeniden girersiniz${dosya === 'telefon-jeton.json' ? ' (telefon jetonu: npm run telefon-jeton)' : ''}.`);
    if (!pin) return;
    await is_(async () => { const r = await AG.api.anahtarlar.kenaraAl(dosya, pin); if (sonuc(r, (r && r.mesaj) || 'Kenara alındı.')) await yukle(); });
  }
  async function gonder(secimler) {
    const pin = await pinSor('Bekleyen değişiklikler sunucuya gönderilsin mi?', 'PIN sunucuda doğrulanır (bu bilgisayarda saklanmaz).');
    if (!pin) return;
    await is_(async () => {
      const r = await AG.api.anahtarlar.bekleyenGonder(pin, secimler);
      if (r && r.cakisma) { cakisma = r.cakismalar || []; ciz(); AG.bildir(r.error, 'uyari', { sure: 10000 }); return; }
      cakisma = null;
      if (sonuc(r, `${(r && r.gonderilen) || 0} değişiklik sunucuya gönderildi${r && r.atilan ? `, ${r.atilan} bırakıldı` : ''}.`)) await yukle();
      else await yukle();
    });
  }
  async function vazgec(o) {
    const ok = await AG.onayla({ baslik: 'Bu değişiklikten vazgeçilsin mi?', metin: `"${o.ad}" için bekleyen değişiklik bu bilgisayardan silinir; sunucuda hiçbir şey değişmez.`, onay: 'Vazgeç', tehlikeli: true });
    if (!ok) return;
    await is_(async () => { if (sonuc(await AG.api.anahtarlar.bekleyenVazgec(o.id), 'Bekleyen değişiklik silindi.')) await yukle(); });
  }

  /* ── Çizim ── */
  const dugme = (metin, onclick, sinif, o = {}) => el('button', { type: 'button', class: `p-dugme p-dugme-kucuk ${sinif || ''}`.trim(), onclick, id: o.id || null, disabled: o.kapali ? '' : null }, [el('span', { text: metin })]);
  const bant = (metin, tur, ek) => el('div', { class: `p-bant${tur ? ` p-bant-${tur}` : ''}` }, [el('p', { class: 'p-bant-metin', text: metin }), ...(ek || [])]);

  function formCiz() {
    if (!form) return null;
    const girdiler = form.alanlar.map(a => {
      const id = `anAlan-${a.ad}`;
      if (a.tip === 'select') return el('div', { class: 'p-alan' }, [el('label', { for: id, text: a.etiket }), el('select', { id }, a.secenekler.map(([v, t]) => el('option', { value: v, text: t })))]);
      if (a.tip === 'checkbox') return el('label', { class: 'an-kutu', for: id }, [el('input', { type: 'checkbox', id }), el('span', { text: a.etiket })]);
      const g = el('input', { type: a.tip || 'text', id, autocomplete: a.tip === 'password' ? 'new-password' : 'off', spellcheck: 'false', inputmode: a.inputmode || null, placeholder: a.ipucu || null });
      if (a.deger != null) g.value = String(a.deger);
      return el('div', { class: 'p-alan' }, [el('label', { for: id, text: a.etiket }), g]);
    });
    const baslik = form.ekle ? 'Hesap ekle' : form.tip === 'pin' ? 'Acil PIN\'i değiştir' : `Değiştir: ${form.satir.ad}`;
    const not = form.tip === 'pin' ? 'PIN bütün bilgisayarlarda ortaktır: değiştirdiğinizde öbür bilgisayarlarda da aynı PIN\'i girin (Faz 3\'te kendiliğinden eşitlenecek). Unutursanız bilgisayar başında `npm run acil-pin` (eski PIN istemez).'
      : form.ekle ? 'Anahtarı borsada para çekme izni KAPALI oluşturun. Değer kaydedildikten sonra bir daha gösterilmez (yalnız son 4 karakter). OKX: parola (passphrase) zorunlu; OKX demo hesabı eklenebilir ve sınanabilir — bota bağlama hazırlıkta (henüz bağlanamaz).'
        : 'Yeni değer kaydedildikten sonra bir daha gösterilmez (yalnız son 4 karakter).';
    return el('section', { class: 'p-kart-kat an-form', id: 'anForm' }, [
      el('h4', { class: 'an-form-baslik', text: baslik }),
      el('p', { class: 'p-kart-alt', text: not }),
      el('div', { class: 'an-form-izgara' }, girdiler),
      el('div', { class: 'an-dugmeler' }, [dugme(form.tip === 'pin' ? 'PIN\'i değiştir' : 'Kaydet', () => kaydet(), 'p-dugme-ana', { id: 'anKaydet' }), dugme('Vazgeç', () => { form = null; ciz(); }, 'p-dugme-sessiz')])
    ]);
  }

  function satirCiz(s) {
    const yaz = !telefonMu();
    const [et, sn] = rozet(s);
    const ek = s.ek && s.ek.borsa ? [BORSA_AD[s.ek.borsa] || s.ek.borsa, TUR_AD[s.ek.tur] || null, s.ek.altHesap ? `alt hesap: ${s.ek.altHesap}` : null].filter(Boolean).join(' · ') : null;
    const sm = sinamaMetni(s.sonSinama);
    const islemler = [];
    if (yaz && s.degistirilebilir) islemler.push(dugme(s.tip === 'pin' ? 'PIN\'i değiştir' : 'Değiştir', () => { form = { satir: s, tip: s.tip, alanlar: alanlar(s), grup: s.grup }; ciz(); const g = bul('anForm'); if (g && g.scrollIntoView) g.scrollIntoView({ block: 'nearest' }); }, '', { id: `anDegistir-${s.kimlik}` }));
    if (yaz && s.sinanabilir) islemler.push(dugme('Sına', () => sina(s), '', { id: `anSina-${s.kimlik}` }));
    if (yaz && s.silinebilir) islemler.push(dugme('Sil', () => sil(s), 'p-dugme-sessiz'));
    if (s.nasil) {
      islemler.push(el('span', { class: 'an-nasil' }, [
        s.nasil.komut ? el('code', { text: s.nasil.komut }) : null,
        s.nasil.href ? el('a', { href: s.nasil.href, text: s.nasil.metin || 'Nasıl?' }) : (s.nasil.komut ? null : el('span', { text: s.nasil.metin }))
      ]));
    }
    return el('tr', { 'data-anahtar': s.kimlik }, [
      el('td', null, [el('strong', { text: s.ad }), ek ? el('span', { class: 'an-alt', text: ek }) : null,
        // A2 parça 2: OKX bağdaştırıcısı hazır değil — anahtar saklanır ve salt okuma sınanır, bota bağlanamaz
        s.grup === 'borsa' && s.ek && s.ek.borsa === 'okx' ? el('span', { class: 'an-alt tone-warning', id: `anOkxHazirlik-${s.kimlik}`, text: OKX_HAZIRLIK }) : null]),
      el('td', { class: 'an-soluk', text: s.kullanan || '—' }),
      el('td', { class: 'p-sayi an-maske', text: s.maske || (s.durum === 'bos' || s.durum === 'eksik' ? '—' : 'gizli') }),
      el('td', { text: makineAdi(s, veri && veri.arastirma) }),
      el('td', null, [el('span', { class: `p-rozet ${sn}`.trim(), text: et }), s.not ? el('span', { class: `an-alt${s.tehlike ? ' p-neg' : ''}`, text: s.not }) : null, sm ? el('span', { class: `an-alt${s.sonSinama && !s.sonSinama.ok ? ' p-neg' : ''}`, text: sm }) : null]),
      el('td', null, [el('div', { class: 'an-dugmeler' }, islemler)])
    ]);
  }

  function grupCiz(g) {
    const yaz = !telefonMu();
    const ekleDugme = g.kimlik === 'borsa' && yaz ? dugme('Hesap ekle', () => { form = { ekle: true, alanlar: alanlar(null, true), grup: 'borsa' }; ciz(); }, 'p-dugme-ana', { id: 'anHesapEkle' }) : null;
    return el('section', { class: 'p-kart an-grup', id: `anGrup-${g.kimlik}` }, [
      el('div', { class: 'p-kart-bas' }, [el('div', null, [el('h3', { class: 'p-kart-baslik', text: g.ad }), el('p', { class: 'p-kart-alt', text: g.alt })]), ekleDugme]),
      form && form.grup === g.kimlik ? formCiz() : null,
      AG.tablo.kutulu({ id: `anTablo-${g.kimlik}`, sinif: 'an-tablo', basliklar: ['Ad', 'Kullanan', 'Değer', 'Makine', 'Durum', 'İşlem'], satirlar: g.satirlar.map(satirCiz) })
    ]);
  }

  function bantlar() {
    const l = [];
    const v = veri || {};
    if (telefonMu()) l.push(bant('Telefondan anahtarlar yalnız görüntülenir — değişiklik bilgisayardaki panelden.', ''));
    const kb = kaynakBandi(v);
    if (kb) l.push(bant(kb.metin, kb.tur));
    const yerel = v.yerel || {};
    for (const d of (yerel.dosyalar || []).filter(x => x.durum === 'eski-sifreli' || (x.durum === 'yok' && x.yedekSifreli))) {
      l.push(bant(`${DOSYA_AD[d.ad] || d.ad} eski şifreli biçimde (69.x) — Pusula bunu çözmez, içindekiler okunamıyor${d.ad === 'secrets.json' ? ': API anahtarları, Telegram jetonu ve sağlık adresleri bu bilgisayarda boş sayılıyor' : ''}. Dosyayı silmeden kenara alıp yeniden girebilirsiniz.`, 'tehlike',
        telefonMu() ? [] : [dugme('Eski şifreli dosyayı kenara al', () => kenaraAl(d.ad), 'p-dugme-tehlike', { id: `anKenara-${d.ad.replace('.json', '')}` })]));
    }
    const sk = v.sunucu || {};
    for (const d of (sk.dosyalar || []).filter(x => x.durum === 'eski-sifreli')) l.push(bant(`Sunucuda ${DOSYA_AD[d.ad] || d.ad} eski şifreli — sunucunun kendi panelinden kenara alın.`, 'uyari'));
    if (!telefonMu() && yerel.pin && !yerel.pin.tanimli) {
      l.push(bant(v.arastirma ? 'Bu bilgisayarda acil PIN tanımlı değil: sunucuya giden değişiklikler sunucunun PIN\'iyle olur; bu bilgisayardaki dosyayı kenara almak ve PIN\'i burada da değiştirmek için önce bilgisayar başında `npm run acil-pin`.' : 'Acil PIN tanımlı değil — bu ekranda değişiklik yapılamaz. Önce bilgisayar başında `npm run acil-pin`.', 'uyari'));
    }
    const bek = v.bekleyen || { sayi: 0, ogeler: [] };
    if (bek.sayi) {
      l.push(el('div', { class: 'p-bant p-bant-uyari an-bekleyen', id: 'anBekleyen' }, [
        el('p', { class: 'p-bant-metin' }, [el('strong', { text: `Sunucuya gönderilmeyi bekleyen ${bek.sayi} değişiklik` }), el('span', { text: ' — kendiliğinden gönderilmez.' })]),
        telefonMu() ? null : dugme('Gönder', () => gonder(), 'p-dugme-ana', { id: 'anGonder', kapali: v.kaynak !== 'sunucu' }),
        el('ul', { class: 'an-liste' }, bek.ogeler.map(o => el('li', null, [
          el('span', { text: `${o.ad} — ${o.islem === 'sil' ? 'silinecek' : o.islem === 'ekle' ? 'eklenecek' : 'değişecek'}${o.yeniMaske ? ` (yeni: ${o.yeniMaske})` : ''} · ${zaman(o.zaman)}` }),
          o.sonHata ? el('span', { class: 'an-alt p-neg', text: o.sonHata }) : null,
          telefonMu() ? null : dugme('Vazgeç', () => vazgec(o), 'p-dugme-sessiz')
        ])))
      ]));
    }
    if (cakisma && cakisma.length) {
      const secim = {};
      l.push(el('div', { class: 'p-bant p-bant-tehlike an-cakisma', id: 'anCakisma' }, [
        el('p', { class: 'p-bant-metin', text: 'Sunucudaki değer siz bu bilgisayarda değiştirdikten SONRA değişmiş. Her biri için hangisinin geçerli olacağını seçin:' }),
        el('ul', { class: 'an-liste' }, cakisma.map(c => el('li', null, [
          el('strong', { text: c.ad }),
          el('span', { text: ` · sunucudaki: ${c.sunucuMaske || (c.sunucuDurum === 'yok' ? 'yok' : '—')} · bu bilgisayardaki: ${c.yerelMaske || (c.islem === 'sil' ? 'silinecek' : '—')}` }),
          el('span', { class: 'p-secici', role: 'group', 'aria-label': `${c.ad} için seçim` }, [['yerel', 'Benimki geçerli'], ['sunucu', 'Sunucudaki kalsın']].map(([k, t]) => {
            const b = el('button', { type: 'button', 'aria-pressed': 'false', text: t });
            b.addEventListener('click', () => { secim[c.id] = k; b.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); });
            return b;
          }))
        ]))),
        dugme('Seçimlerle gönder', () => { if (cakisma.some(c => !secim[c.id])) { AG.bildir('Her değişiklik için bir seçim yapın.', 'hata'); return; } gonder(secim); }, 'p-dugme-ana', { id: 'anCakismaGonder' })
      ]));
    }
    return l;
  }

  function ciz() {
    const kap = bul('anahtarlarKok');
    if (!kap || !veri) return;
    const gr = grupla(veri.satirlar, veri.yerelSatirlar);
    const pinForm = form && form.tip === 'pin';
    if (pinForm && !gr.some(g => g.kimlik === form.grup)) form.grup = 'erisim';
    doldur(kap, [
      el('section', { class: 'p-kart an-bas' }, [
        el('div', { class: 'p-kart-bas' }, [el('h2', { class: 'p-kart-baslik', text: 'Anahtarlar' }), el('a', { href: '#/kilavuz/ayarlar/anahtarlar', text: 'Kılavuz: Anahtarlar →' })]),
        el('p', { class: 'p-kart-alt', text: 'Bu panelin kayıtlı bütün anahtar, jeton ve şifreleri. Değerin yalnız son 4 karakteri görünür; tamamı hiçbir zaman gösterilmez ve hiçbir yere yazılmaz. Her değişiklik acil PIN ister. "Sına" yalnız okur — emir göndermez.' })
      ]),
      ...bantlar(),
      ...gr.map(grupCiz)
    ]);
    const isik = bul('ayarIsik-anahtarlar');
    if (isik) {
      const l = [...(veri.satirlar || []), ...(veri.yerelSatirlar || [])];
      const kotu = l.some(x => x.tehlike || x.durum === 'eksik') || ((veri.yerel || {}).dosyalar || []).some(x => x.durum === 'eski-sifreli');
      const uyari = kotu || l.some(x => x.durum === 'bakilmali') || ((veri.bekleyen || {}).sayi > 0);
      isik.classList.remove('is-hidden');
      isik.className = `borsa-isik borsa-isik-${kotu ? 'tehlike' : uyari ? 'uyari' : 'iyi'}`;
    }
  }

  async function yukle() {
    const kap = bul('anahtarlarKok');
    if (!kap) return;
    let r = null;
    try { r = await AG.api.anahtarlar.liste(); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(kap, [AG.bildirim && AG.bildirim.hataKutusu ? AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Anahtarlar okunamadı', yeniden: yukle }) : bant((r && r.error) || 'Anahtarlar okunamadı', 'tehlike')]); return; }
    veri = r;
    ciz();
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-settings' && String(e.detail.alt || '').split('/')[0] === 'anahtarlar') yukle(); });
  }

  AG.pages = AG.pages || {};
  AG.pages.anahtarlar = { yukle, ciz, rozet, grupla, makineAdi, kaynakBandi, alanlar, sinamaMetni, GRUPLAR, _veriAyarla: (v) => { veri = v; form = null; cakisma = null; ciz(); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.anahtarlar;
})(typeof window !== 'undefined' ? window : globalThis);
