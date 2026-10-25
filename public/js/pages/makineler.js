/**
 * AYARLAR › MAKİNELER (75.2, 3. faz parça 3a — B1 Makineler panosu) `AG.pages.makineler`
 * ═══════════════════════════════════════════════════════════════════════════
 * #/ayarlar/makineler — bu bilgisayarın makine kimliği ve eşlenmiş öteki Pusula makineleri (sunucu: lib/makine/api.js,
 * GET /api/makine/pano): son görülme, sürüm uyumu, botlar (mod · çalışıyor), güncelleme durumu, boş disk, Tailscale adresi.
 * PANO SALT OKUMA: buradan hiçbir bota, emre, ayara dokunulmaz. Yazan tek şey eşleme yönetimi — "Kod üret", "Eşle", "Kaldır" —
 * yalnız bilgisayardan ve yerel PIN'le (sunucu her şeyi yeniden doğrular). Telefonda yalnız görüntüleme.
 * 75.3 (3b): YÖNETİCİ MAKİNE — Telegram komutlarını dinleyen tek makine ("Yönetici yap", yalnız bilgisayardan + yerel PIN); seçilen
 * 30 dk ulaşılamazsa öbür sunucu geçici devralır (kart + bant gösterir). Bot taşıma (3c) sonraki sürümde.
 * DOM AG.dom ile (HTML dizgesi yok), stil p- / an- aileleri, istek AG.api.makine.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);

  const ISIK = { iyi: ['Bağlı', 'p-rozet-pos'], sessiz: ['Sessiz', 'p-rozet-warn'], hic: ['Henüz görülmedi', 'p-rozet-info'], red: ['Bu makineyi reddediyor', 'p-rozet-neg'], uyumsuz: ['Sürüm uyumsuz', 'p-rozet-neg'] };
  const ROL = { sunucu: 'Sunucu (botları çalıştırabilir)', gelistirme: 'Geliştirme / araştırma bilgisayarı' };
  const MOD = { kagit: 'kâğıt', demo: 'demo', canli: 'canlı' };
  const GUNC = { guncel: 'güncel', gelistirme: 'geliştirme kopyası (buraya kurulmaz)', 'onay-bekliyor': 'onay bekliyor', onay: 'onay bekliyor', kuruldu: 'kuruldu', bekliyor: 'bekliyor', hata: 'hata', kuruluyor: 'kuruluyor', 'kademe-bekliyor': 'sırada (kademeli güncelleme)' };
  /** 75.3: bu makinenin Telegram komut kararı (lib/makine/yonetici.js kip). */
  const KIP = { tek: 'Tek makine — komutları bu bilgisayar dinliyor', yonetici: 'Yönetici — komutları bu bilgisayar dinliyor', gecici: 'Geçici devralma — yönetici ulaşılamadığı için komutları bu bilgisayar dinliyor',
    bekle: 'Komutları yönetici makine dinliyor', cekisme: 'Bekliyor — Telegram\'ı başka bir makine dinliyor (409)', 'uygun-degil': 'Bu bilgisayar komut dinlemez (geliştirme / araştırma kopyası ya da Telegram kurulu değil)' };

  let veri = null, mesgul = false, sonKod = null;
  const telefonMu = () => !!(AG.api && AG.api.kademe && AG.api.kademe() === 'telefon') || !!(veri && veri.yazilabilir === false);
  const zaman = (iso) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

  /* ── Saf yardımcılar (öz test: scripts/panel-makineler-testi.js) ── */
  /** Saf: "x dk önce" biçimi (ms farkı). */
  function onceMetni(iso, simdi = Date.now()) {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return 'hiç görülmedi';
    const dk = Math.max(0, Math.round((simdi - t) / 60000));
    if (dk < 1) return 'az önce';
    if (dk < 60) return `${dk} dk önce`;
    const sa = Math.round(dk / 60);
    if (sa < 48) return `${sa} sa önce`;
    return `${Math.round(sa / 24)} gün önce`;
  }
  /** Saf: bot listesinin tek satırlık özeti ("Kairos · demo · çalışıyor; Tao · kâğıt · durmuş"). */
  function botlarMetni(botlar) {
    if (!Array.isArray(botlar) || !botlar.length) return 'bot yok';
    return botlar.map(b => `${b.adGorunen || b.kimlik} · ${MOD[b.mod] || b.mod || '—'} · ${b.calisiyor ? 'çalışıyor' : 'durmuş'}`).join('; ');
  }
  /** Saf: sürüm + uyum metni. */
  function surumMetni(m, benSurum) {
    if (!m || !m.surum) return '—';
    const u = m.uyum === 'tam' ? '' : m.uyum === 'okuma' ? ' — yalnız okuma (taşıma için aynı sürüm gerekir)' : m.uyum === 'uyumsuz' ? ' — UYUMSUZ: iki makineyi aynı sürüme güncelleyin' : '';
    return `${m.surum}${benSurum && m.surum !== benSurum ? ` (bu bilgisayar ${benSurum})` : ''}${u}`;
  }
  /** Saf: güncelleme + disk metni. */
  function durumMetni(m) {
    const g = m && m.guncelleme && m.guncelleme.durum ? `güncelleme: ${GUNC[m.guncelleme.durum] || m.guncelleme.durum}` : 'güncelleme: —';
    const d = m && m.disk && Number.isFinite(m.disk.bosGB) ? `boş disk ${m.disk.bosGB.toLocaleString('tr-TR')} GB` : 'disk: —';
    return `${g} · ${d}`;
  }
  /** Saf (75.3): Telegram komut durumu → { metin, ton } (ton: '' | 'uyari'). */
  function telegramMetni(t) {
    if (!t) return { metin: 'Yönetici bilgisi yok (eski sunucu).', ton: '' };
    const m = KIP[t.kip] || t.sebep || '—';
    const uyari = t.kip === 'gecici' || t.kip === 'cekisme';
    return { metin: uyari ? `${m}. ${t.sebep || ''}` : m, ton: uyari ? 'uyari' : '' };
  }
  /** Saf (75.3): etkin yönetici metni. */
  function yoneticiMetni(v) {
    const y = v && v.etkinYonetici;
    if (!y || !y.kimlik) return 'yok';
    return `${y.ad || y.kimlik}${y.secildi ? '' : ' (varsayılan — seçim yapılmadı)'}`;
  }
  /** Saf (75.3): bu satır için "Yönetici yap" gösterilir mi — sunucu, Telegram dinleyebilir, şu an yönetici değil. */
  function yoneticiYapilabilir(m) { return !!m && m.rol === 'sunucu' && !(m.telegram && m.telegram.uygun === false) && !m.yonetici; }
  /** Saf: sekme ışığı — reddeden / uyumsuz eş varsa tehlike, sessiz varsa uyarı, hepsi bağlıysa iyi, eş yoksa gizli. */
  function sekmeIsigi(v) {
    const l = (v && v.makineler) || [];
    if (!l.length) return null;
    if (l.some(m => m.isik === 'red' || m.isik === 'uyumsuz')) return 'tehlike';
    if (l.some(m => m.isik === 'sessiz' || m.isik === 'hic')) return 'uyari';
    return 'iyi';
  }

  /* ── Eylemler ── */
  async function yokla() {
    if (mesgul || telefonMu()) return;
    mesgul = true;
    try {
      const r = await AG.api.makine.nabizSimdi();
      if (r && r.success) AG.bildir(r.esSayisi ? `Nabız ${r.esSayisi} makineye gönderildi.` : 'Eşlenmiş makine yok — hiçbir yere istek gönderilmedi.', 'ok');
      else AG.bildir(`Yoklanamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata');
    } catch (e) { AG.bildir(`Yoklanamadı: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }
  async function kodUret() {
    if (mesgul || telefonMu()) return;
    const kendi = (bul('mkKendiAdresKod') || {}).value || '';
    mesgul = true;
    try {
      const r = await AG.api.makine.kodUret(kendi.trim());
      if (r && r.success) { sonKod = { kod: r.kod, bitis: r.bitis }; AG.bildir('Eşleme kodu üretildi (10 dakika geçerli, tek kullanımlık).', 'ok'); }
      else AG.bildir(`Kod üretilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 10000 });
    } catch (e) { AG.bildir(`Kod üretilemedi: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }
  async function esle() {
    if (mesgul || telefonMu()) return;
    const adres = ((bul('mkKarsiAdres') || {}).value || '').trim();
    const kod = ((bul('mkKod') || {}).value || '').trim();
    const kendi = ((bul('mkKendiAdres') || {}).value || '').trim();
    if (!adres || !kod || !kendi) { AG.bildir('Karşı makinenin adresi, eşleme kodu ve bu bilgisayarın adresi gerekli.', 'uyari'); return; }
    mesgul = true;
    try {
      const r = await AG.api.makine.esleBaslat(adres, kod, kendi);
      if (r && r.success) AG.bildir(`Eşlendi: ${r.es.ad}${r.yenilendi ? ' (jetonlar yenilendi)' : ''}.`, 'ok');
      else AG.bildir(`Eşlenemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 });
    } catch (e) { AG.bildir(`Eşlenemedi: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }
  async function yoneticiYap(m) {
    if (mesgul || telefonMu()) return;
    const c = await AG.onayla({ baslik: `Yönetici makine "${m.ad}" olsun mu?`, metin: `Telegram komutlarını (/durum, /menu …) artık ${m.ad} dinler; öteki makineler dinlemeyi bırakır (iki makine aynı anda dinlerse Telegram çakışır). Bildirimleri her makine kendi botları için göndermeye devam eder. ${m.ad} 30 dakika ulaşılamazsa öbür sunucu komutları geçici olarak devralır ve Telegram'a haber verir. Acil PIN istenir.`, onay: 'Yönetici yap' });
    if (!c) return;
    mesgul = true;
    try {
      const r = await AG.api.makine.yoneticiSec(m.kimlik);
      if (r && r.success) AG.bildir(`Yönetici makine: ${r.ad}.${r.yayilim && r.yayilim.esSayisi ? ` Seçim ${r.yayilim.tamam}/${r.yayilim.esSayisi} makineye iletildi.` : ''}`, 'ok');
      else AG.bildir(`Seçilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 10000 });
    } catch (e) { AG.bildir(`Seçilemedi: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }
  async function kaldir(m) {
    if (mesgul || telefonMu()) return;
    const c = await AG.onayla({ baslik: `"${m.ad}" eşlemesi kaldırılsın mı?`, metin: 'Bu bilgisayar o makinenin jetonunu siler; o makine artık buraya nabız gönderemez ve bot durumunu okuyamaz. Karşı makineye haber verilmez — orada da Ayarlar › Makineler\'den kaldırın. Yeniden eşlemek için yeni kod gerekir.', onay: 'Kaldır', tehlikeli: true });
    if (!c) return;
    mesgul = true;
    try {
      const r = await AG.api.makine.kaldir(m.kimlik);
      if (r && r.success) AG.bildir(`Kaldırıldı: ${m.ad}.`, 'ok');
      else AG.bildir(`Kaldırılamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata');
    } catch (e) { AG.bildir(`Kaldırılamadı: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }

  /* ── Çizim ── */
  const bant = (metin, tur) => el('div', { class: `p-bant${tur ? ` p-bant-${tur}` : ''}` }, [el('p', { class: 'p-bant-metin', text: metin })]);
  const dugme = (id, metin, onclick, sinif = '') => el('button', { type: 'button', class: `p-dugme p-dugme-kucuk${sinif ? ` ${sinif}` : ''}`, id, onclick }, [el('span', { text: metin })]);
  function alan(id, etiket, deger, yer, ek = {}) {
    const g = el('input', { type: 'text', id, autocomplete: 'off', spellcheck: 'false', placeholder: yer || '', ...ek });
    g.value = deger || '';
    return el('div', { class: 'p-alan' }, [el('label', { for: id, text: etiket }), g]);
  }
  function benKarti() {
    const b = veri.ben || {};
    return el('section', { class: 'p-kart', id: 'mkBen' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Bu bilgisayar' })]),
      el('dl', { class: 'p-kv' }, [
        el('dt', { text: 'Ad' }), el('dd', { text: b.ad || '—' }),
        el('dt', { text: 'Makine kimliği' }), el('dd', { text: b.kimlik || '—' }),
        el('dt', { text: 'Rol' }), el('dd', { text: ROL[b.rol] || b.rol || '—' }),
        el('dt', { text: 'Sürüm' }), el('dd', { text: `${b.surum || '—'} · makine protokolü ${b.protokol || '—'}` }),
        el('dt', { text: 'Adres (Tailscale)' }), el('dd', { text: b.adres || 'kaydedilmedi — ilk eşlemede yazılır' }),
        el('dt', { text: 'Botlar' }), el('dd', { text: botlarMetni(b.botlar) }),
        el('dt', { text: 'Durum' }), el('dd', { text: durumMetni(b) }),
        el('dt', { text: 'Telegram komutları' }), el('dd', { id: 'mkBenTelegram', text: telegramMetni(veri.telegram).metin })
      ]),
      !telefonMu() && (veri.makineler || []).length && yoneticiYapilabilir({ rol: b.rol, telegram: { uygun: !(veri.telegram && veri.telegram.uygun === false) }, yonetici: b.yoneticiMi })
        ? el('div', { class: 'an-dugmeler' }, [dugme('mkYoneticiBen', 'Bu bilgisayarı yönetici yap', () => yoneticiYap({ kimlik: b.kimlik, ad: b.ad }))]) : null
    ]);
  }
  /** 75.3: Telegram komutları (yönetici makine) kartı — yalnız eş varken. */
  function yoneticiKarti() {
    if (!(veri.makineler || []).length) return null;
    const t = telegramMetni(veri.telegram);
    return el('section', { class: 'p-kart', id: 'mkYonetici' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Telegram komutları — yönetici makine' })]),
      el('p', { class: 'p-kart-alt', text: 'Telegram komutlarını (/durum, /menu …) tek bir makine dinler; iki makine aynı anda dinlerse Telegram çakışır (409). Yönetici seçilmezse dinleyebilen sunucular arasından biri kendiliğinden seçilir. Seçilen yönetici 30 dakika ulaşılamazsa öbür sunucu geçici olarak devralır, Telegram\'a haber verir ve yönetici geri gelince bırakır. Eşlenmiş bir sunucu 30 dakika sessiz kalırsa Telegram\'a tek uyarı, geri gelince tek bilgi gider.' }),
      el('dl', { class: 'p-kv' }, [
        el('dt', { text: 'Yönetici' }), el('dd', { id: 'mkYoneticiAd', text: yoneticiMetni(veri) }),
        el('dt', { text: 'Bu bilgisayar' }), el('dd', { class: t.ton === 'uyari' ? 'p-neg' : '', text: t.metin })
      ])
    ]);
  }
  function makineSatiri(m) {
    const [isikAd, isikSinif] = ISIK[m.isik] || ['—', 'p-rozet-info'];
    const notlar = [];
    if (m.giden && m.giden.sonuc && m.giden.sonuc !== 'tamam' && m.giden.hata) notlar.push(`son gönderim: ${m.giden.hata}`);
    return el('tr', { 'data-makine': m.kimlik }, [
      el('td', null, [el('strong', { text: m.ad }), m.yonetici ? el('span', { class: 'p-rozet p-rozet-info', text: 'Yönetici' }) : null,
        m.telegram && m.telegram.kip === 'gecici' ? el('span', { class: 'p-rozet p-rozet-warn', text: 'Komutları geçici dinliyor' }) : null,
        el('span', { class: 'an-alt', text: `${ROL[m.rol] || m.rol} · ${m.kimlik}` }), el('span', { class: 'an-alt', text: m.adres })]),
      el('td', null, [el('span', { class: `p-rozet ${isikSinif}`, text: isikAd }), el('span', { class: 'an-alt', text: `son görülme: ${onceMetni(m.sonGorulme)}${m.sonGorulme ? ` (${zaman(m.sonGorulme)})` : ''}` }),
        notlar.length ? el('span', { class: 'an-alt p-neg', text: notlar.join(' · ') }) : null]),
      el('td', null, [el('span', { text: surumMetni(m, veri.ben && veri.ben.surum) })]),
      el('td', null, [el('span', { text: botlarMetni(m.botlar) })]),
      el('td', null, [el('span', { text: durumMetni(m) })]),
      el('td', null, [el('div', { class: 'an-dugmeler' }, telefonMu() ? [] : [yoneticiYapilabilir(m) ? dugme(`mkYonetici-${m.kimlik}`, 'Yönetici yap', () => yoneticiYap(m)) : null, dugme(`mkKaldir-${m.kimlik}`, 'Kaldır', () => kaldir(m), 'p-dugme-sessiz')])])
    ]);
  }
  function eslemeKarti() {
    const b = veri.ben || {};
    const kodAlani = sonKod && Date.parse(sonKod.bitis) > Date.now() ? sonKod : null;
    const esleme = veri.esleme || {};
    return el('section', { class: 'p-kart', id: 'mkEsleme' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Makine eşle' })]),
      el('p', { class: 'p-kart-alt', text: 'İki bilgisayar bir kez eşlenir: birinde kod üretilir, ötekinde o kod ve birincinin adresi yazılır. Adres, Tailscale\'deki adıdır (https://<bilgisayar>.<ağ-adı>.ts.net). Her iki işlem de acil PIN ister; kod 10 dakika geçerli ve tek kullanımlıktır. Eşlenen makine buradan yalnız bot durumunu okuyabilir ve nabız gönderebilir — bot başlatamaz, emir veremez, ayar değiştiremez.' }),
      el('div', { class: 'an-form' }, [
        el('h4', { class: 'an-form-baslik', text: '1. Bu bilgisayarda kod üret' }),
        el('div', { class: 'an-form-izgara' }, [alan('mkKendiAdresKod', 'Bu bilgisayarın adresi (isteğe bağlı)', b.adres, 'https://sunucu.ag-adi.ts.net')]),
        el('div', { class: 'an-dugmeler' }, [dugme('mkKodUret', 'Kod üret', kodUret, 'p-dugme-ana')]),
        kodAlani ? el('p', { class: 'p-kart-alt', id: 'mkKodGoster' }, [el('span', { text: 'Eşleme kodu: ' }), el('strong', { class: 'p-sayi', text: kodAlani.kod }), el('span', { text: ` — ${zaman(kodAlani.bitis)}'e kadar geçerli; öteki bilgisayarın Makineler sekmesine yazın.` })])
          : esleme.var ? el('p', { class: 'an-alt', text: `Geçerli bir kod var (${zaman(esleme.bitis)}'e kadar). Kod yalnız üretildiği anda gösterilir; görmediyseniz yeni kod üretin.` }) : null
      ]),
      el('div', { class: 'an-form' }, [
        el('h4', { class: 'an-form-baslik', text: '2. Öteki bilgisayarın koduyla eşle' }),
        el('div', { class: 'an-form-izgara' }, [
          alan('mkKarsiAdres', 'Öteki bilgisayarın adresi', '', 'https://ev-pc.ag-adi.ts.net'),
          alan('mkKod', 'Eşleme kodu (32 rakam)', '', '1234-5678-…', { inputmode: 'numeric' }),
          alan('mkKendiAdres', 'Bu bilgisayarın adresi', b.adres, 'https://bu-pc.ag-adi.ts.net')
        ]),
        el('div', { class: 'an-dugmeler' }, [dugme('mkEsle', 'Eşle', esle, 'p-dugme-ana')])
      ])
    ]);
  }
  function bantlar() {
    const l = [];
    if (telefonMu()) l.push(bant('Telefondan makineler yalnız görüntülenir — eşleme ve kaldırma bilgisayardaki panelden.', ''));
    l.push(bant('Pano botlara dokunmaz: buradan yalnız eşleme ve yönetici makine seçimi yapılır; botu başka makineye taşıma sonraki sürümde gelecek. Eşlenmiş makine yokken Pusula hiçbir makineye istek göndermez.', ''));
    const t = veri.telegram;
    if (t && t.kip === 'gecici') l.push(bant(`Geçici devralma: ${t.sebep}. Yönetici geri gelince bu bilgisayar dinlemeyi kendiliğinden bırakır.`, 'uyari'));
    if (t && t.kip === 'cekisme') l.push(bant(`${t.sebep}. İki makine çalışıyor ama birbirini görmüyor olabilir — Tailscale bağlantısına bakın ve "Şimdi yokla"ya basın.`, 'uyari'));
    const sorunlu = (veri.makineler || []).filter(m => m.isik === 'red' || m.isik === 'uyumsuz');
    if (sorunlu.length) l.push(bant(`${sorunlu.map(m => m.ad).join(', ')}: ${sorunlu.some(m => m.isik === 'red') ? 'bu bilgisayarı reddediyor — orada eşleme kaldırılmış ya da jeton eskimiş olabilir; iki makineyi yeniden eşleyin.' : 'sürüm uyumsuz — iki makineyi aynı sürüme güncelleyin.'}`, 'uyari'));
    return l;
  }
  function isikYaz() {
    const i = bul('ayarIsik-makineler');
    if (!i) return;
    const t = sekmeIsigi(veri);
    i.classList.toggle('is-hidden', !t);
    for (const x of ['iyi', 'uyari', 'tehlike', 'notr']) i.classList.toggle(`borsa-isik-${x}`, x === (t || 'notr'));
  }
  function ciz() {
    const kap = bul('makinelerKok');
    if (!kap || !veri) return;
    const l = veri.makineler || [];
    doldur(kap, [
      el('section', { class: 'p-kart an-bas' }, [
        el('div', { class: 'p-kart-bas' }, [el('h2', { class: 'p-kart-baslik', text: 'Makineler' }), el('a', { href: '#/kilavuz/ayarlar/makineler', text: 'Kılavuz: Makineler →' })]),
        el('p', { class: 'p-kart-alt', text: `Pusula'nın çalıştığı bilgisayarlar. Eşlenen makineler ${veri.nabizDk || 5} dakikada bir birbirine nabız gönderir (sürüm, botlar, güncelleme, boş disk); ${veri.sessizDk || 15} dakikadan uzun ses gelmezse "Sessiz" görünür. Bağlantı yalnız Tailscale üzerinden ve her makinenin kendi jetonuyla.` }),
        el('div', { class: 'an-dugmeler', id: 'mkDugmeler' }, [
          telefonMu() ? null : dugme('mkYokla', 'Şimdi yokla', yokla),
          dugme('mkYenile', 'Yenile', () => yukle(), 'p-dugme-sessiz')
        ])
      ]),
      ...bantlar(),
      benKarti(),
      yoneticiKarti(),
      el('section', { class: 'p-kart', id: 'mkEsler' }, [
        el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: `Eşlenmiş makineler (${l.length})` })]),
        l.length ? AG.tablo.kutulu({ id: 'mkTablo', sinif: 'an-tablo', basliklar: ['Makine', 'Durum', 'Sürüm', 'Botlar', 'Güncelleme · disk', 'İşlem'], satirlar: l.map(makineSatiri) })
          : el('p', { class: 'p-kart-alt', id: 'mkBos', text: 'Henüz eşlenmiş makine yok. Bot çalıştıran sunucuyla bu bilgisayarı aşağıdan eşleyebilirsiniz; tek bilgisayar kullanıyorsanız bir şey yapmanız gerekmez.' })
      ]),
      telefonMu() ? null : eslemeKarti()
    ]);
    isikYaz();
  }
  async function yukle(yenile) {
    const kap = bul('makinelerKok');
    if (!kap) return;
    let r = null;
    try { r = await AG.api.makine.pano(!!yenile); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(kap, [AG.bildirim && AG.bildirim.hataKutusu ? AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Makineler okunamadı', yeniden: () => yukle() }) : bant((r && r.error) || 'Makineler okunamadı', 'tehlike')]); return; }
    veri = r;
    ciz();
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-settings' && String(e.detail.alt || '').split('/')[0] === 'makineler') yukle(); });
  }

  AG.pages = AG.pages || {};
  AG.pages.makineler = { yukle, ciz, onceMetni, botlarMetni, surumMetni, durumMetni, sekmeIsigi, telegramMetni, yoneticiMetni, yoneticiYapilabilir, _veriAyarla: (v, kod) => { veri = v; sonKod = kod || null; ciz(); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.makineler;
})(typeof window !== 'undefined' ? window : globalThis);
