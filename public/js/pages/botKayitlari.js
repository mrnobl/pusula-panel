/**
 * AYARLAR › BOTLAR › BOT KAYITLARI (74.5, A1 + 2. faz parça 2b) `AG.pages.botKayitlari`
 * ═══════════════════════════════════════════════════════════════════════════
 * #ayarBotKayit — bütün botların kaydı (sunucu: lib/botKayit.js, GET /api/botlar?arsiv=1):
 *   · YENİ BOT: şablon (Kairos tipi / Tao tipi; Kairos'ta küçük sermaye seçeneği = Kairos-S), kimlik, görünen ad, kâğıt sermayesi.
 *     Her zaman KÂĞITTA başlar (gerçek emir yok) — PIN istemez, onay ister.
 *   · Satırda: demo hesabı (Anahtarlar'daki Binance demo hesapları; bağlama acil PIN), sermaye üst sınırı (kâğıt: onay; demo artışı:
 *     acil PIN), Arşivle (yalnız kâğıt ve durmuş; dosyalar silinmez) / Geri getir.
 *   · Kairos ve Tao: hesapları sabit (eski anahtar alanları), arşivlenmez; sermaye sınırı değişebilir (Kairos demo kabulü süresince demo sınırı değişmez).
 *   · Canlı hesap 5. faza kadar yalnız Kairos ve Tao'da (sunucu da reddeder).
 * Telefonda ve araştırma kopyasında salt okunur. DOM AG.dom ile (HTML dizgesi yok), istek AG.api.botKayit.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const bildir = (m, t, o) => AG.bildir(m, t || 'bilgi', o);

  const KIMLIK_RE = /^[a-z][a-z0-9]{1,15}$/;
  const PIN_ALANI = { ad: 'pin', etiket: 'Acil PIN', tip: 'password', inputmode: 'numeric', dogrula: (v) => /^\d{6,12}$/.test(String(v).trim()) };
  const MOD_AD = { kagit: 'kâğıt', demo: 'demo', canli: 'CANLI HESAP' };
  const SABLON_AD = { kairos: 'Kairos tipi', tao: 'Tao tipi', 'kairos-s': 'Kairos tipi (küçük sermaye)' };

  let veri = null, hesaplar = null, sinir = null, mesgul = false, hata = null;
  const telefonMu = () => !!(AG.api && AG.api.kademe && AG.api.kademe() === 'telefon');
  const arastirmaMu = () => !!(AG.pages && AG.pages.kabuk && AG.pages.kabuk.arastirmaModu && AG.pages.kabuk.arastirmaModu());
  const yazilabilir = () => !telefonMu() && !arastirmaMu();
  const para = (x) => (typeof x === 'number' && Number.isFinite(x) ? `${x.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} $` : '—');
  const adi = (b) => (b && (b.adGorunen || b.kimlik)) || '—';

  /** Saf: yeni bot formu → { govde } | { hata } (sunucu aynısını yeniden denetler). */
  function formDenetle(f, mevcut = []) {
    const kimlik = String(f.kimlik || '').trim();
    const ad = String(f.adGorunen || '').trim();
    const tutar = Number(String(f.sermaye || '').replace(/\s/g, '').replace(',', '.'));
    if (!['kairos', 'tao', 'kairos-s'].includes(f.sablon)) return { hata: 'Şablon seçin (Kairos tipi ya da Tao tipi).' };
    if (!KIMLIK_RE.test(kimlik)) return { hata: 'Kimlik 2–16 karakter: küçük harf ve rakam, harfle başlar (ör. "ares").' };
    const ayni = mevcut.find(m => m === kimlik || m.slice(0, 2) === kimlik.slice(0, 2));
    if (ayni) return { hata: ayni === kimlik ? `"${kimlik}" kimliği kullanılıyor.` : `Kimliğin ilk iki harfi "${ayni}" botuyla aynı — emir kimliği öneki çakışır.` };
    if (ad.length < 2 || ad.length > 24) return { hata: 'Görünen ad 2–24 karakter olmalı.' };
    if (!Number.isFinite(tutar) || tutar < 100 || tutar > 1e7) return { hata: 'Kâğıt sermayesi 100 – 10.000.000 USD arasında olmalı.' };
    const govde = { sablon: f.sablon, kimlik, adGorunen: ad, sermaye: { kagit: Math.round(tutar * 100) / 100 } };
    if (f.sablon === 'kairos' && f.kucukSermaye && f.kucukSermaye !== 'oto') govde.kucukSermaye = f.kucukSermaye;
    return { govde };
  }

  async function pinSor(baslik, metin) {
    const c = await AG.onayla({ baslik, metin, onay: 'Onayla', alanlar: [PIN_ALANI] });
    return c && typeof c === 'object' ? c.pin.trim() : null;
  }
  function sonuc(r, basari) {
    if (r && r.success) { bildir(basari, 'ok'); if (r.uyari) bildir(r.uyari, 'uyari', { sure: 10000 }); return true; }
    bildir(`Yapılamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 10000 });
    return false;
  }
  async function is_(fn) {
    if (mesgul) return;
    mesgul = true;
    try { await fn(); } catch (e) { bildir(`Yapılamadı: ${e.message}`, 'hata', { sure: 10000 }); }
    finally { mesgul = false; await yukle(); tazeleDiger(); }
  }
  /** Botlar sayfası ve Ayarlar özeti yeni listeyi görsün. */
  function tazeleDiger() {
    const B = AG.pages && AG.pages.botlar;
    if (!B) return;
    Promise.resolve(B.listeYukle ? B.listeYukle(true) : null).then(() => { if (B.ayarYukle) B.ayarYukle(); }).catch(() => null);
  }

  // ── Eylemler ─────────────────────────────────────────────────────────────
  async function olustur(form) {
    const mevcut = ((veri && veri.botlar) || []).map(b => b.kimlik);
    const d = formDenetle(form, mevcut);
    if (d.hata) { bildir(d.hata, 'uyari', { sure: 8000 }); return; }
    const g = d.govde;
    const ok = await AG.onayla({ baslik: `Yeni kâğıt bot: ${g.adGorunen}`, onay: 'Oluştur', iptal: 'Vazgeç',
      metin: `${SABLON_AD[g.sablon]} · kimlik "${g.kimlik}" · kâğıt sermayesi ${para(g.sermaye.kagit)}${g.kucukSermaye ? ` · küçük sermaye ${g.kucukSermaye === 'acik' ? 'açık (Kairos-S)' : 'kapalı'}` : ''}.\n`
        + 'Bot KÂĞIT hesapta başlar (gerçek emir yok) ve durmuş olarak eklenir; Botlar sayfasından Başlat ile çalışır. Demo hesaba geçiş için önce bir Binance demo hesabı bağlanır (acil PIN).' });
    if (!ok) return;
    await is_(async () => { if (sonuc(await AG.api.botKayit.olustur(g), `${g.adGorunen} oluşturuldu (kâğıt, durmuş).`)) formSifirla(); });
  }
  async function hesapBagla(b, id) {
    const h = (hesaplar || []).find(x => x.id === id);
    const pin = await pinSor(id ? `${adi(b)}: demo hesabı bağlansın mı?` : `${adi(b)}: demo hesap bağı kaldırılsın mı?`,
      id ? `"${h ? h.ad : id}" bu botun demo hesabı olur. Aynı hesabı aynı anda yalnız bir bot demo modunda kullanabilir. Onaylamak için acil PIN'i girin.`
        : 'Bot demo moda geçemez (yeniden bağlanana kadar). Onaylamak için acil PIN\'i girin.');
    if (!pin) { ciz(); return; }
    await is_(async () => { sonuc(await AG.api.botKayit.hesap(b.kimlik, 'demo', id || null, pin), id ? 'Demo hesabı bağlandı.' : 'Demo hesap bağı kaldırıldı.'); });
  }
  async function sermayeDegistir(b, mod) {
    const simdiki = b.sermaye ? (mod === 'demo' ? b.sermaye.demo : b.sermaye.kagit) : null;
    const v = await AG.onayla({ baslik: `${adi(b)}: ${mod === 'demo' ? 'demo' : 'kâğıt'} sermaye üst sınırı`, onay: 'Kaydet', iptal: 'Vazgeç',
      metin: `Bot bu tutardan fazlasını kullanmaz; hesapta daha az para varsa hesaptaki kadarını kullanır. Şimdiki: ${para(simdiki)}. Bot durmuşken değişir.${mod === 'demo' ? ' Demo sınırını ARTIRMAK acil PIN ister.' : ''}`,
      alanlar: [{ ad: 'tutar', etiket: 'Yeni üst sınır (USD)', inputmode: 'decimal', deger: simdiki != null ? String(simdiki) : '', dogrula: (s) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) && n >= 100 && n <= 1e7; } }] });
    if (!v) return;
    const tutar = Math.round(Number(String(v.tutar).replace(',', '.')) * 100) / 100;
    let pin = null;
    if (mod === 'demo' && simdiki != null && tutar > simdiki) {
      pin = await pinSor(`${adi(b)}: demo sermaye sınırı artırılsın mı?`, `${para(simdiki)} → ${para(tutar)}. Onaylamak için acil PIN'i girin.`);
      if (!pin) return;
    }
    await is_(async () => { sonuc(await AG.api.botKayit.sermaye(b.kimlik, mod, tutar, pin), `${adi(b)}: ${mod === 'demo' ? 'demo' : 'kâğıt'} sermaye üst sınırı ${para(tutar)}.`); });
  }
  async function arsivle(b) {
    const ok = await AG.onayla({ baslik: `${adi(b)} arşivlensin mi?`, onay: 'Arşivle', iptal: 'Vazgeç', tehlikeli: true,
      metin: 'Bot listelerden kalkar ve çalışmaz. Kaydı ve kâğıt hesap dosyaları SİLİNMEZ; "Arşivdeki botlar"dan geri getirebilirsiniz. Kimliği ve görünen adı başka bota verilemez.' });
    if (!ok) return;
    await is_(async () => { sonuc(await AG.api.botKayit.arsivle(b.kimlik), `${adi(b)} arşivlendi.`); });
  }
  async function geriGetir(b) {
    if (!(await AG.onayla({ baslik: `${adi(b)} arşivden geri getirilsin mi?`, onay: 'Geri getir', iptal: 'Vazgeç', metin: 'Bot kâğıt hesapta ve durmuş olarak geri gelir; eski kayıtları olduğu gibi durur.' }))) return;
    await is_(async () => { sonuc(await AG.api.botKayit.geriGetir(b.kimlik), `${adi(b)} geri getirildi (kâğıt, durmuş).`); });
  }

  // ── Çizim ────────────────────────────────────────────────────────────────
  const form = { sablon: 'kairos', kucukSermaye: 'oto', kimlik: '', adGorunen: '', sermaye: '10000' };
  function formSifirla() { Object.assign(form, { sablon: 'kairos', kucukSermaye: 'oto', kimlik: '', adGorunen: '', sermaye: '10000' }); }
  const dugme = (metin, onclick, sinif, ek) => { const x = el('button', { type: 'button', class: `btn btn-sm ${sinif || 'btn-secondary'}`, ...(ek || {}) }, [el('span', { text: metin })]); x.addEventListener('click', () => onclick(x)); return x; };

  function hesapHucresi(b) {
    if (!b.yeni) return el('span', { class: 'hint hint-sm mb-0', text: b.kimlik === 'hucum' || b.kimlik === 'denge' ? 'Binance demo / canlı (sabit)' : '—' });
    if (b.arsiv) return el('span', { text: (b.hesapAdlari && b.hesapAdlari.demo) || '—' });
    const secenekler = [['', '— bağlı değil —'], ...(hesaplar || []).filter(h => h.tur === 'demo' && h.borsa === 'binance').map(h => [h.id, `${h.ad}${h.anahtarVar ? '' : ' (anahtar yok)'}`])];
    if (b.hesap && b.hesap.demo && !secenekler.some(([id]) => id === b.hesap.demo)) secenekler.push([b.hesap.demo, `${b.hesap.demo} (Anahtarlar'da yok)`]);
    const s = el('select', { class: 'form-control control-sm', 'aria-label': `${adi(b)} demo hesabı`, id: `selBotKayitHesap-${b.kimlik}`,
      title: b.mod === 'demo' ? 'Bot demo modundayken hesap değişmez — önce kâğıda dönün' : 'Anahtarlar\'daki Binance demo hesapları; bağlama acil PIN ister' },
    secenekler.map(([id, t]) => { const o = el('option', { value: id, text: t }); if (id === ((b.hesap && b.hesap.demo) || '')) o.selected = true; return o; }));
    s.disabled = !yazilabilir() || b.mod === 'demo' || mesgul;
    s.addEventListener('change', (e) => hesapBagla(b, e.target.value || null));
    return s;
  }
  function sermayeHucresi(b) {
    const s = b.sermaye || {};
    const metin = el('span', { class: 'sayi', text: `kâğıt ${para(s.kagit)} · demo ${para(s.demo)}` });
    if (!yazilabilir() || b.arsiv) return metin;
    return el('div', { class: 'pf-dugmeler' }, [metin, dugme('Kâğıt…', () => sermayeDegistir(b, 'kagit')), dugme('Demo…', () => sermayeDegistir(b, 'demo'))]);
  }
  function islemHucresi(b) {
    if (!yazilabilir()) return el('span', { text: '' });
    if (b.arsiv) return dugme('Geri getir…', () => geriGetir(b));
    if (!b.yeni) return el('span', { class: 'hint hint-sm mb-0', text: 'arşivlenmez' });
    const x = dugme('Arşivle…', () => arsivle(b), 'btn-outline-danger', { id: `btnBotArsivle-${b.kimlik}` });
    if (!b.arsivlenebilir) { x.disabled = true; x.setAttribute('title', b.mod !== 'kagit' ? 'Yalnız kâğıt moddaki bot arşivlenir' : 'Önce botu durdurun'); }
    return x;
  }
  function satir(b) {
    const kural = SABLON_AD[b.sablon] || (b.strateji === 'denge' ? 'Tao tipi' : 'Kairos tipi');
    return el('tr', null, [
      el('td', { class: 'pf-sola' }, [el('span', { class: 'fw-semibold', text: adi(b) }), el('span', { class: 'hint hint-sm mb-0', text: ` ${b.kimlik}` }),
        b.kiyas ? el('div', { class: 'hint hint-sm mb-0', text: b.kiyas.metin }) : null]),
      el('td', { class: 'pf-sola', text: `${kural}${b.kucukSermaye === true ? ' · küçük sermaye açık' : ''}` }),
      el('td', { text: b.arsiv ? 'arşivde' : `${MOD_AD[b.mod] || b.mod || '—'}${b.calisiyor ? ' · çalışıyor' : ''}` }),
      el('td', { class: 'pf-sola' }, [hesapHucresi(b)]),
      el('td', { class: 'pf-sola' }, [sermayeHucresi(b)]),
      el('td', null, [islemHucresi(b)])
    ]);
  }
  function formCiz() {
    const girdi = (ad, etiket, o = {}) => {
      const i = el('input', { class: 'form-control control-sm', id: `inpYeniBot-${ad}`, type: o.tip || 'text', autocomplete: 'off', spellcheck: 'false', inputmode: o.inputmode || null, placeholder: o.ipucu || null, maxlength: o.max || null });
      i.value = form[ad];
      i.addEventListener('input', () => { form[ad] = i.value; });
      return el('label', { class: 'bot-kayit-alan mb-0', for: `inpYeniBot-${ad}` }, [el('span', { class: 'bot-kayit-etiket', text: etiket }), i]);
    };
    const secim = (ad, etiket, ss, devre) => {
      const s = el('select', { class: 'form-control control-sm', id: `selYeniBot-${ad}` }, ss.map(([v, t]) => { const o = el('option', { value: v, text: t }); if (v === form[ad]) o.selected = true; return o; }));
      s.disabled = !!devre;
      s.addEventListener('change', () => { form[ad] = s.value; if (ad === 'sablon') ciz(); });
      return el('label', { class: 'bot-kayit-alan mb-0', for: `selYeniBot-${ad}` }, [el('span', { class: 'bot-kayit-etiket', text: etiket }), s]);
    };
    return el('section', { class: 'bot-kayit-form mt-4', 'aria-label': 'Yeni bot' }, [
      el('h3', { class: 'pf-bolum-baslik mb-2', text: 'Yeni bot (kâğıt hesapta başlar)' }),
      el('p', { class: 'hint hint-sm mb-3', text: 'Yalnız sınanmış kurallar: Kairos tipi ya da Tao tipi. Bot gerçek emir vermez (kâğıt); demo hesaba geçiş için önce bir Binance demo hesabı bağlanır. Canlı hesap 5. faza kadar yalnız Kairos ve Tao\'da.' }),
      el('div', { class: 'grid-3 gap-3' }, [
        secim('sablon', 'Kural (şablon)', [['kairos', 'Kairos tipi — BTC trendi + coin sepeti'], ['tao', 'Tao tipi — yarı BTC, sakin']]),
        secim('kucukSermaye', 'Küçük sermaye kuralı (Kairos-S)', [['oto', 'otomatik (< 5000 $ iken açık)'], ['acik', 'açık'], ['kapali', 'kapalı']], form.sablon !== 'kairos'),
        girdi('sermaye', 'Kâğıt sermayesi (USD, üst sınır)', { inputmode: 'decimal', ipucu: '10000' }),
        girdi('kimlik', 'Kimlik (küçük harf/rakam, ilk 2 harf benzersiz)', { ipucu: 'ör. ares', max: 16 }),
        girdi('adGorunen', 'Görünen ad', { ipucu: 'ör. Ares', max: 24 })
      ]),
      el('div', { class: 'pf-dugmeler mt-3' }, [dugme('Oluştur…', () => olustur({ ...form }), 'btn-primary', { id: 'btnYeniBotOlustur' })])
    ]);
  }
  function ciz() {
    const k = bul('ayarBotKayit');
    if (!k) return;
    const bas = el('h2', { class: 'page-title-sm mb-3' }, [el('i', { class: 'tone-primary', 'data-lucide': 'list-plus' }), el('span', { text: ' Bot kayıtları — yeni bot, hesap, sermaye, arşiv' })]);
    if (hata) { doldur(k, [bas, el('p', { class: 'tone-danger mb-0', text: `Bot kayıtları okunamadı: ${hata}` })]); return; }
    if (!veri) { doldur(k, [bas, el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })]); return; }
    const etkin = veri.botlar.filter(b => !b.arsiv), arsiv = veri.botlar.filter(b => b.arsiv);
    const basliklar = ['Bot', 'Kural', 'Hesap türü', 'Demo hesabı', 'Sermaye üst sınırı', ''];
    doldur(k, [bas,
      el('p', { class: 'hint mb-3', text: telefonMu() ? 'Telefonda salt okunur — botlar sunucudaki panelden oluşturulur ve yönetilir.'
        : arastirmaMu() ? 'Bu bilgisayar araştırma kopyası — liste sunucudan; botlar sunucudaki panelden oluşturulur ve yönetilir.'
          : 'Her bot ayrı bir kayıttır. Sermaye üst sınırı: bot bu tutardan fazlasını kullanmaz, hesapta daha az para varsa hesaptakini kullanır. Aynı borsa hesabını aynı anda yalnız bir bot kullanabilir (kâğıt botlar hariç).' }),
      AG.tablo.kutulu({ id: 'tblBotKayit', sinif: 'table-dense pf-tablo', basliklar, satirlar: etkin.map(satir) }),
      arsiv.length ? el('details', { class: 'hs-kat-mini mt-3', id: 'botKayitArsiv' }, [el('summary', { text: `Arşivdeki botlar (${arsiv.length})` }),
        AG.tablo.kutulu({ id: 'tblBotKayitArsiv', sinif: 'table-dense pf-tablo', basliklar, satirlar: arsiv.map(satir) })]) : null,
      yazilabilir() ? formCiz() : null
    ]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  async function yukle() {
    if (!bul('ayarBotKayit') || !AG.api || !AG.api.botKayit) return;
    try {
      const [l, h, s] = await Promise.all([AG.api.botKayit.liste(), AG.api.botKayit.hesaplar().catch(() => null), sinir ? Promise.resolve(null) : AG.api.botKayit.sablonlar().catch(() => null)]);
      if (!l || !l.success) throw new Error((l && l.error) || 'yanıt yok');
      veri = l; hata = null;
      hesaplar = h && h.success ? h.hesaplar : (hesaplar || []);
      if (s && s.success) sinir = s.sinirlar || {};
      if (AG.botAd && AG.botAd.kaydet) AG.botAd.kaydet(l.botlar);
    } catch (e) { hata = e.message; }
    ciz();
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => {
      if (!e.detail || e.detail.bolum !== 'tab-settings') return;
      const a = String(e.detail.alt || '').split('/')[0];
      if (!a || a === 'botlar') yukle();
    });
  }

  AG.pages = AG.pages || {};
  AG.pages.botKayitlari = { yukle, ciz, formDenetle, _veriAyarla: (v, h) => { veri = v; hesaplar = h || []; hata = null; ciz(); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.botKayitlari;
})(typeof window !== 'undefined' ? window : globalThis);
