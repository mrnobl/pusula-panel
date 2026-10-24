/**
 * AYARLAR › YEDEK VE TAŞIMA — 68.1, PLAN-TASIMA F3 `AG.pages.tasima`
 * ═══════════════════════════════════════════════════════════════════════════
 * Beş kart (#tasimaKok):
 *   1. Taşıma dosyası oluştur — şifre ×2, "Araştırma verilerini de ekle" (varsayılan KAPALI, boyut uyarısı), "Sunucu bağlantısını da
 *      taşı" (varsayılan KAPALI), boyut tahmini, ilerleme. Dosya <veri>/makine/tasima/ altına yazılır.
 *   2. Oluşturulan dosyalar — indir (akış) / sil.
 *   3. Araştırma eklentisi — oluştur (şifre isteğe bağlı) · "Eklenti yükle" (içe aktarma akışı, tür eklenti).
 *   4. USB yedeği — yedek şifresini bir kez kaydet (GİZLİ); haftalık USB yedeği aynı .pusula biçiminde.
 *   5. Eski yedekten geri yükleme — kılavuza bağlantı.
 *   6. (73.4) Günlük yedek — #tsGunlukKart: hedef, son günlük kopya, ileriye kayıt haftalık ARTIMLI kopyası (yedek-ayar.json; YALNIZ OKUR,
 *      komutlar npm run yedek …). GET /api/tasima/durum `yedek` (yalnız yerel kademe); başka uçların yanıtı `yedek` taşımaz → son değer korunur.
 * `iceAktarAkisi(kap, { tur })` kurulum sihirbazının ilk adımı ("Başka bilgisayardan taşı") ile ortak: dosya / yerel yol → şifre →
 * önizleme (ne gelecek, ne kadar, hangi sürümden) → onay → yerine koy. Telefon kademesinde her şey kapalı (sunucu da 403).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const MB = 1024 * 1024;
  const TUR_AD = { KISISEL: 'Kişisel', GIZLI: 'Gizli (şifreli)', ARASTIRMA: 'Araştırma', PROGRAM: 'Araştırma kitapçık ve kayıtları' };

  /** Saf: bayt → "12,3 MB" / "1,24 GB". */
  function boyutYaz(b) {
    const n = Number(b) || 0;
    if (n >= 1024 * MB) return `${(n / 1024 / MB).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} GB`;
    if (n >= MB) return `${(n / MB).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
    return `${Math.max(1, Math.round(n / 1024)).toLocaleString('tr-TR')} KB`;
  }
  const tarihYaz = (t) => { try { return new Date(t).toLocaleString('tr-TR'); } catch (e) { return String(t || ''); } };
  const telefonMu = () => !!(AG.api && AG.api.kademe && AG.api.kademe() === 'telefon');
  const p = (metin, sinif) => el('p', { class: sinif || 'ts-metin', text: metin });
  const alan = (id, etiket, girdi, ipucu) => el('div', { class: 'p-alan' }, [el('label', { for: id, text: etiket }), girdi, ipucu ? el('span', { class: 'p-alan-ipucu', text: ipucu }) : null]);
  const sifreGirdi = (id, ac) => el('input', { type: 'password', id, autocomplete: ac || 'new-password', spellcheck: 'false' });
  const kutu = (id, metin, ipucu, o = {}) => {
    const c = el('input', { type: 'checkbox', id, class: 'kr-kutu', disabled: o.kapali ? '' : null });
    return el('label', { class: 'ts-kutu', for: id }, [c, el('span', null, [el('strong', { text: metin }), ipucu ? el('span', { class: 'ts-kutu-ipucu', text: ipucu }) : null])]);
  };
  const bant = (metin, tur) => el('div', { class: `p-bant${tur ? ` p-bant-${tur}` : ''}` }, [el('p', { class: 'p-bant-metin', text: metin })]);
  const dugme = (id, metin, sinif, onclick, o = {}) => el('button', { type: 'button', id, class: `p-dugme ${sinif || ''}`.trim(), disabled: o.kapali ? '' : null, onclick }, [el('span', { text: metin })]);

  let durum = null, tahmin = null, izleyici = null;
  let yedekBilgi = null;   // 73.4: yalnız /api/tasima/durum taşır (diğer uçların yanıtı durum'u değiştirse de bu korunur)

  /* ── 1. Taşıma dosyası / eklenti oluştur ─────────────────────────────── */

  function tahminMetni() {
    if (!tahmin) return 'Boyut hesaplanıyor…';
    const k = tahmin.kisisel || {}, a = tahmin.arastirma || {}, ap = tahmin.arastirmaProgram || {};
    return `Tahmini (sıkıştırmadan önce): kişisel ${boyutYaz(k.bayt)} (${(k.dosya || 0).toLocaleString('tr-TR')} dosya) + gizli bilgiler. Araştırma eklenirse +${boyutYaz((a.bayt || 0))} (${(a.dosya || 0).toLocaleString('tr-TR')} dosya).`
      + (ap.dosya ? ` Araştırma eklentisi kitapçık ve kayıtlarla ${boyutYaz((a.bayt || 0) + (ap.bayt || 0))}.` : '');
  }

  async function olustur(tur, d) {
    const s1 = bul(tur === 'tasima' ? 'tsSifre' : 'tsEkSifre'), s2 = bul(tur === 'tasima' ? 'tsSifre2' : 'tsEkSifre2');
    const sifre = s1 ? s1.value : '', tekrar = s2 ? s2.value : '';
    if (tur === 'tasima' && sifre.length < 8) { AG.bildir('Şifre en az 8 karakter olmalı.', 'hata'); return; }
    if (sifre && sifre !== tekrar) { AG.bildir('İki şifre aynı değil.', 'hata'); return; }
    if (sifre && sifre.length < 8) { AG.bildir('Şifre en az 8 karakter olmalı (ya da boş bırakın).', 'hata'); return; }
    const arastirma = tur === 'tasima' && !!(bul('tsArastirma') || {}).checked;
    const sunucu = tur === 'tasima' && !!(bul('tsSunucu') || {}).checked;
    if (arastirma && tahmin && (tahmin.arastirma || {}).bayt > 200 * MB) {
      const tamam = await AG.onayla({ baslik: 'Araştırma verileri büyük', metin: `Araştırma verileri ${boyutYaz(tahmin.arastirma.bayt)}. Dosya büyük olur ve hazırlanması dakikalar sürebilir. Devam edilsin mi?`, onay: 'Devam et' });
      if (!tamam) return;
    }
    if (sunucu) {
      const tamam = await AG.onayla({ baslik: 'Sunucu bağlantısı da taşınsın mı?', metin: 'Bu dosyayı açan bilgisayar şifreyle birlikte sunucundaki panele bağlanabilir. Dosyayı ve şifreyi yalnız kendi bilgisayarların için kullan.', onay: 'Evet, taşı', tehlikeli: true });
      if (!tamam) return;
    }
    AG.dom.mesgul(d, 'Hazırlanıyor…');
    try {
      const r = await AG.api.tasima.olustur({ tur, sifre: sifre || null, sifreTekrar: tekrar || null, arastirma, sunucuBaglantisi: sunucu });
      if (!r || !r.success) { AG.bildir(`Oluşturulamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      if (s1) s1.value = ''; if (s2) s2.value = '';
      izle(tur);
    } catch (e) { AG.bildir(`Oluşturulamadı: ${e.message}`, 'hata'); } finally { AG.dom.hazir(d); }
  }

  function ilerlemeCiz(is) {
    // Çubuk tek tip gösterge (AG.ilerleme, js/core/ilerleme.js); sonuç ayrı bantta.
    const k = bul('tsIlerleme'), s = bul('tsSonuc');
    if (!k || !s) return;
    const ad = is && is.tur === 'arastirma-eklentisi' ? 'Araştırma eklentisi' : 'Taşıma dosyası';
    if (AG.ilerleme && AG.ilerleme.ciz) AG.ilerleme.ciz(k, is && is.calisiyor ? { durum: 'calisiyor', oran: is.toplam ? Math.min(1, (is.yapilan || 0) / is.toplam) : undefined,
      asama: ({ basliyor: 'başlıyor', paketleniyor: 'dosyalar paketleniyor', sifreleniyor: 'şifreleniyor', yaziliyor: 'dosya yazılıyor' })[is.asama] || is.asama } : null, { baslik: `${ad} hazırlanıyor` });
    if (!is || is.calisiyor) { doldur(s, []); return; }
    if (is.hata) doldur(s, [bant(`${ad} oluşturulamadı: ${is.hata}`, 'tehlike')]);
    else if (is.sonuc) doldur(s, [bant(`${ad} hazır: ${is.sonuc.ad} · ${boyutYaz(is.sonuc.boyut)} · ${is.sonuc.dosyaSayisi} dosya${is.tur === 'tasima' ? (is.sonuc.gizli ? ' · gizli bilgiler şifreli' : ' · gizli bilgiler YOK') : ''}. Aşağıdan indir.`)]);
  }

  async function izle() {
    if (izleyici) global.clearTimeout(izleyici);
    const tur = async () => {
      let r = null;
      try { r = await AG.api.tasima.is(); } catch (e) { r = null; }
      const is = r && r.is;
      ilerlemeCiz(is);
      if (is && is.calisiyor) izleyici = global.setTimeout(tur, 800);
      else { izleyici = null; await yukle(); ilerlemeCiz(is); }
    };
    await tur();
  }

  function olusturKarti() {
    const sunucuVar = !!(tahmin && tahmin.sunucuBaglantisiVar);
    return el('section', { class: 'p-kart ts-kart', id: 'tsOlusturKart' }, [
      el('h3', { class: 'p-kart-baslik', text: 'Taşıma dosyası oluştur' }),
      p('Pusula\'yı başka bir bilgisayara taşımak ya da tam yedek almak için: portföy, işlem defteri, bot durumları, ileri test kayıtları, raporlar ve ayarlar tek dosyaya girer. API anahtarları, jetonlar ve PIN şifreyle şifrelenir. Fiyat önbelleği (yeniden indirilir) ve bu bilgisayara özel dosyalar girmez.'),
      el('div', { class: 'ts-iki' }, [
        alan('tsSifre', 'Şifre', sifreGirdi('tsSifre'), 'En az 8 karakter. Unutursan gizli bilgiler açılamaz — kimse kurtaramaz.'),
        alan('tsSifre2', 'Şifre (tekrar)', sifreGirdi('tsSifre2')),
      ]),
      kutu('tsArastirma', 'Araştırma verilerini de ekle', `Varsayılan kapalı: araştırma senindir, taşıma dosyasına girmez. ${tahmin ? `Eklenirse dosya ${boyutYaz((tahmin.arastirma || {}).bayt)} büyür.` : ''} Ayrı paylaşmak için aşağıdaki araştırma eklentisini kullan.`),
      kutu('tsSunucu', 'Sunucu bağlantısını da taşı', sunucuVar ? 'Varsayılan kapalı: işaretlersen yeni bilgisayar açılır açılmaz sunucundaki panele bağlanır. Yanlışlıkla verilen dosya sunucuna erişim vermesin diye kapalı.' : 'Bu bilgisayarda kayıtlı sunucu bağlantısı yok.', { kapali: !sunucuVar }),
      p(tahminMetni(), 'ts-metin ts-soluk'),
      el('div', { class: 'ts-cubuk' }, [dugme('btnTsOlustur', 'Taşıma dosyası oluştur', 'p-dugme-ana', (e) => olustur('tasima', e.currentTarget))]),
      el('div', { id: 'tsIlerleme', class: 'ts-ilerleme' }),
      el('div', { id: 'tsSonuc', class: 'ts-ilerleme', 'aria-live': 'polite' }),
    ]);
  }

  /* ── 2. Oluşturulan dosyalar ─────────────────────────────────────────── */

  function dosyalarKarti() {
    const l = (durum && durum.dosyalar) || [];
    return el('section', { class: 'p-kart ts-kart', id: 'tsDosyalarKart' }, [
      el('h3', { class: 'p-kart-baslik', text: 'Oluşturulan dosyalar' }),
      l.length ? AG.tablo.kutulu({ id: 'tsDosyaTablo', sinif: 'ts-tablo', basliklar: ['Dosya', 'Tür', { metin: 'Boyut', sinif: 'p-sag' }, 'Oluşturma', ''],
        satirlar: l.map(f => el('tr', null, [
          el('td', { class: 'ts-ad', text: f.ad }),
          el('td', { text: f.tur === 'tasima' ? 'Taşıma dosyası' : 'Araştırma eklentisi' }),
          el('td', { class: 'p-sag p-sayi', text: boyutYaz(f.boyut) }),
          el('td', { text: tarihYaz(f.zaman) }),
          el('td', { class: 'ts-eylem' }, [
            el('a', { class: 'p-dugme p-dugme-kucuk', href: AG.api.tasima.indirYolu(f.ad), download: f.ad, text: 'İndir', onclick: async (e) => {
              // 69.6: indirme PIN ister (paket çözülmüş sırları taşır) — düz bağlantı yinelenemez, önce oturum açılır.
              if (e.currentTarget.dataset.pinTamam === '1') return;
              e.preventDefault();
              const a = e.currentTarget;
              if (!(await AG.api.yerelPin.hazirla())) return;
              a.dataset.pinTamam = '1'; a.click(); delete a.dataset.pinTamam;
            } }),
            el('button', { type: 'button', class: 'p-dugme p-dugme-kucuk p-dugme-sessiz', onclick: async () => {
              if (!(await AG.onayla({ baslik: 'Dosya silinsin mi?', metin: `${f.ad} bu bilgisayardan silinir (başka yere kopyaladıysan o kopya kalır).`, onay: 'Sil', tehlikeli: true }))) return;
              const r = await AG.api.tasima.sil(f.ad); if (r && r.success) { durum = r; ciz(); } else AG.bildir(`Silinemedi: ${(r && r.error) || ''}`, 'hata');
            } }, [el('span', { text: 'Sil' })]),
          ]),
        ])) }) : p('Henüz oluşturulmuş dosya yok.', 'ts-metin ts-soluk'),
      p('Dosyayı USB belleğe ya da güvendiğin bir yere kopyala. Gizli bilgiler şifreli olsa da dosyayı ve şifreyi aynı yerde saklama.', 'ts-metin ts-soluk'),
    ]);
  }

  /* ── 3. Araştırma eklentisi ──────────────────────────────────────────── */

  let eklentiAkisKap = null;
  function eklentiKarti() {
    const e = (durum && durum.eklenti) || {};
    if (!eklentiAkisKap) eklentiAkisKap = el('div', { class: 'ts-akis', id: 'tsEklentiYukle' });
    return el('section', { class: 'p-kart ts-kart', id: 'tsEklentiKart' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Araştırma eklentisi' }),
        el('span', { class: `p-rozet ${e.yuklu ? 'p-rozet-pos' : ''}`, text: e.yuklu ? 'Bu bilgisayarda yüklü' : 'Yüklü değil' })]),
      p('Araştırma verilerin (deneme sonuçları, araştırma kayıtları, kitapçıklar) senindir ve taşıma dosyasına girmez. Başka bir bilgisayarında da görmek istersen burada eklenti oluştur, orada "Eklenti yükle". Eklenti yüklü değilse Araştırma menüsü görünmez.'),
      el('div', { class: 'ts-iki' }, [
        alan('tsEkSifre', 'Şifre (isteğe bağlı)', sifreGirdi('tsEkSifre'), 'Boş bırakılırsa şifresiz. Şifreliyse dosya adları da görünmez.'),
        alan('tsEkSifre2', 'Şifre (tekrar)', sifreGirdi('tsEkSifre2')),
      ]),
      el('div', { class: 'ts-cubuk' }, [dugme('btnTsEklenti', 'Araştırma eklentisi oluştur', '', (ev) => olustur('arastirma-eklentisi', ev.currentTarget))]),
      el('h4', { class: 'kr-alt', text: 'Eklenti yükle' }),
      eklentiAkisKap,
    ]);
  }

  /* ── 4. USB yedeği ───────────────────────────────────────────────────── */

  async function yedekSifreKaydet(d) {
    const a = (bul('tsYedekSifre') || {}).value || '', b = (bul('tsYedekSifre2') || {}).value || '';
    if (a.length < 12) { AG.bildir('Yedek şifresi en az 12 karakter olmalı.', 'hata'); return; }
    if (a !== b) { AG.bildir('İki şifre aynı değil.', 'hata'); return; }
    AG.dom.mesgul(d, 'Kaydediliyor…');
    try {
      const r = await AG.api.tasima.yedekSifre(a, b);
      if (!r || !r.success) { AG.bildir(`Kaydedilemedi: ${(r && r.error) || ''}`, 'hata'); return; }
      durum = r; AG.bildir('Yedek şifresi kaydedildi. USB yedeği gizli bilgileri bu şifreyle şifreler.', 'ok'); ciz();
    } catch (e) { AG.bildir(`Kaydedilemedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(d); }
  }
  function usbKarti() {
    const var_ = !!(durum && durum.yedekSifre);
    return el('section', { class: 'p-kart ts-kart', id: 'tsUsbKart' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'USB yedeği' }),
        el('span', { class: `p-rozet ${var_ ? 'p-rozet-pos' : 'p-rozet-warn'}`, text: var_ ? 'Yedek şifresi kayıtlı' : 'Yedek şifresi yok' })]),
      p('Haftalık USB yedeği (Pazar 06:00, USB takılıysa) taşıma dosyasıyla AYNI biçimde bir .pusula dosyası yazar: bozulan ya da kaybolan bir bilgisayarı bu dosyayla, kurulum sihirbazındaki "Başka bilgisayardan taşı" ile geri kurarsın.'),
      p(var_ ? 'Gizli bilgiler (anahtarlar, jetonlar, PIN) yedeğe kayıtlı şifreyle şifreli girer. Şifreyi değiştirmek için yenisini kaydet.'
        : 'Yedek şifresi kaydedilmedikçe gizli bilgiler USB yedeğine GİRMEZ (yedek günlüğünde de yazar). Bugünkü kurulumlarda şifre kaydedilene kadar USB yedeği eski biçimde (klasör kopyası) sürer.', 'ts-metin ts-soluk'),
      el('div', { class: 'ts-iki' }, [alan('tsYedekSifre', 'Yedek şifresi', sifreGirdi('tsYedekSifre')), alan('tsYedekSifre2', 'Yedek şifresi (tekrar)', sifreGirdi('tsYedekSifre2'))]),
      el('div', { class: 'ts-cubuk' }, [dugme('btnTsYedekSifre', 'Yedek şifresini kaydet', '', (e) => yedekSifreKaydet(e.currentTarget))]),
    ]);
  }

  /* ── 6. Günlük yedek + ileriye kayıt haftalık artımlı (73.4) ─────────── */

  /** Saf: yedek-ayar özeti → kart satırları [{ ad, deger, ton }]. */
  function gunlukSatirlari(y, simdi = Date.now()) {
    const once = (z) => { const t = Date.parse(z); if (!Number.isFinite(t)) return '—'; const s = (simdi - t) / 3600e3; return s < 1 ? 'bir saatten az önce' : s < 48 ? `${Math.round(s)} saat önce` : `${Math.round(s / 24)} gün önce`; };
    const out = [];
    if (!y || !y.hedef) out.push({ ad: 'Hedef klasör', deger: 'kaydedilmemiş — sunucuda bir kez: npm run yedek -- --hedef E:\\PusulaYedek', ton: 'warn' });
    else out.push({ ad: 'Hedef klasör', deger: y.hedef });
    const s = y && y.son;
    if (!s) out.push({ ad: 'Günlük kopya (her gün 05:30)', deger: 'henüz alınmadı', ton: 'warn' });
    else if (s.hata) out.push({ ad: 'Günlük kopya (her gün 05:30)', deger: `BAŞARISIZ (${once(s.zaman)}): ${String(s.hata).slice(0, 160)}`, ton: 'neg' });
    else out.push({ ad: 'Günlük kopya (her gün 05:30)', deger: `${once(s.zaman)} · ${s.dosya || '?'} dosya · ${boyutYaz(s.bayt)} · son 14 gün + 8 pazartesi saklanır` });
    const ik = y && y.ileriyeKayit;
    if (!ik) out.push({ ad: 'İleriye kayıt (haftada bir, artımlı)', deger: 'henüz alınmadı — ilk günlük yedekte, sonra her pazartesi', ton: 'warn' });
    else if (ik.hata) out.push({ ad: 'İleriye kayıt (haftada bir, artımlı)', deger: `BAŞARISIZ (${once(ik.zaman)}): ${String(ik.hata).slice(0, 160)}`, ton: 'neg' });
    else out.push({ ad: 'İleriye kayıt (haftada bir, artımlı)', deger: `${once(ik.zaman)} · toplam ${ik.dosya != null ? ik.dosya : '?'} dosya, ${boyutYaz(ik.toplamBayt)} · son çalışmada ${ik.eklenen || 0} yeni + ${ik.guncellenen || 0} değişen dosya (${boyutYaz(ik.bayt)})` });
    const u = y && y.uzak;
    if (u && u.depo) out.push({ ad: 'Şifreli uzak yedek', deger: u.son ? `${u.depo} · ${u.son.ok ? 'tamam' : `BAŞARISIZ: ${String(u.son.hata || '').slice(0, 120)}`} (${once(u.son.zaman)})` : `${u.depo} · henüz gönderilmedi`, ton: u.son && !u.son.ok ? 'neg' : '' });
    return out;
  }
  function gunlukKarti() {
    const satirlar = gunlukSatirlari(yedekBilgi);
    const kotu = satirlar.some(x => x.ton === 'neg'), eksik = satirlar.some(x => x.ton === 'warn');
    return el('section', { class: 'p-kart ts-kart', id: 'tsGunlukKart' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Günlük yedek' }),
        el('span', { class: `p-rozet ${kotu ? 'p-rozet-neg' : eksik ? 'p-rozet-warn' : 'p-rozet-pos'}`, text: kotu ? 'Sorun var' : eksik ? 'Eksik' : 'Çalışıyor' })]),
      p('Bu bilgisayarın PusulaYedek görevi her gün 05:30\'da yeniden üretilemeyen veriyi (bot kayıtları, ileri test, portföy, ayarlar) tarihli klasöre kopyalar. İleriye kayıt verisi büyük olduğu için günlük kopyaya girmez: haftada bir (pazartesi) aynı görev yalnız yeni ve değişen günlük dosyaları tek klasöre (ileriye-kayit-artimli) ekler; ham veri hiç silinmez.'),
      el('dl', { class: 'kv-list kv-sik mb-0', id: 'tsGunlukListe' }, satirlar.flatMap(x => [el('dt', { text: x.ad }), el('dd', { class: x.ton === 'neg' ? 'tone-danger' : x.ton === 'warn' ? 'tone-warning' : '', text: x.deger })])),
      p('Komutlar (sunucuda): npm run yedek -- --durum · hemen al: npm run yedek -- --ileri · ileriye kayıt kopyasını doğrula: npm run yedek -- --ileri-dogrula.', 'ts-metin ts-soluk'),
      el('a', { class: 'kr-bag', href: '#/kilavuz/yedek-tasima/ileriye-kayit-yedegi', text: 'Kılavuz: ileriye kayıt yedeği →' }),
    ]);
  }

  function eskiKarti() {
    return el('section', { class: 'p-kart ts-kart', id: 'tsEskiKart' }, [
      el('h3', { class: 'p-kart-baslik', text: 'Eski biçimdeki yedekten geri yükleme' }),
      p('68.1\'den önceki günlük ve USB yedekleri tarihli klasörlerdir (içinde yedek-manifest.json). Okunabilir kalırlar: komut satırında npm run yedek -- --geri-yukle <tarih> --dizin <boş klasör> yedeği doğrulayıp ayrı bir klasöre açar; gereken dosyaları Pusula kapalıyken veri klasörüne kopyalarsın.'),
      el('a', { class: 'kr-bag', href: '#/kilavuz/yedek-tasima/eski-yedek', text: 'Kılavuz: eski yedekten geri yükleme →' }),
    ]);
  }

  function ciz() {
    const kap = bul('tasimaKok');
    if (!kap) return;
    if (telefonMu()) { doldur(kap, [bant('Yedek ve taşıma yalnız bu bilgisayardaki panelden yapılır (telefondan kapalı): taşıma dosyası gizli bilgileri taşır.', 'uyari')]); return; }
    if (!durum) return;
    const bekleyen = durum.bekleyen;
    doldur(kap, [
      bekleyen ? bant(`Bu kurulum ${bekleyen.kaynakMakine || 'başka bir bilgisayar'} adlı bilgisayardan taşındı: botlar kendiliğinden başlamaz. Her bot için Botlar › Yönetim'de önce "Mutabakat", temiz çıkınca "Başlat" (bekleyen: ${(bekleyen.botlar || []).filter(b => !(bekleyen.temiz || []).includes(b)).join(', ')}).`, 'uyari') : null,
      el('div', { class: 'ts-izgara' }, [olusturKarti(), dosyalarKarti(), eklentiKarti(), usbKarti(), gunlukKarti(), eskiKarti()]),
    ]);
    if (eklentiAkisKap && !eklentiAkisKap.dataset.kuruldu) { eklentiAkisKap.dataset.kuruldu = '1'; iceAktarAkisi(eklentiAkisKap, { tur: 'arastirma-eklentisi', bitince: () => yukle() }); }
  }

  async function yukle() {
    const kap = bul('tasimaKok');
    if (!kap) return;
    if (telefonMu()) { ciz(); return; }
    try { durum = await AG.api.tasima.durum(); } catch (e) { durum = null; }
    if (durum && durum.yedek !== undefined) yedekBilgi = durum.yedek;
    if (!durum || !durum.success) { doldur(kap, [AG.bildirim.hataKutusu((durum && durum.error) || 'sunucu yanıt vermedi', { baslik: 'Yedek ve taşıma durumu okunamadı', yeniden: yukle })]); return; }
    ciz();
    if (durum.is && durum.is.calisiyor && !izleyici) izle();
    if (!tahmin) {
      try { const t = await AG.api.tasima.tahmin(); if (t && t.success) { tahmin = t; ciz(); } } catch (e) { /* tahmin yok: metin "hesaplanıyor" kalır */ }
    }
  }

  /* ── İçe aktarma akışı (kurulum sihirbazı + eklenti yükle) ───────────── */

  /**
   * @param kap  kalıcı kap (çağıran her çizimde aynı elemanı yerleştirir — durum kapta yaşar)
   * @param o.tur 'tasima' | 'arastirma-eklentisi' · o.bitince(sonuç)
   */
  function iceAktarAkisi(kap, o = {}) {
    const tur = o.tur || 'tasima';
    // Kimlikler düz yazılır (kılavuz görüntüsü işaretleri ve testler kaynakta arar).
    const ID = tur === 'tasima' ? { dosya: 'tsIceDosya', yol: 'tsIceYol', sec: 'tsIceSec', sifre: 'tsIceSifre', vazgec2: 'tsIceVazgec2', vazgec: 'tsIceVazgec', onizle: 'tsIceOnizle', uygula: 'tsIceUygula', degistir: 'tsIceDegistir' } : { dosya: 'tsEklentiYukleDosya', yol: 'tsEklentiYukleYol', sec: 'tsEklentiYukleSec', sifre: 'tsEklentiYukleSifre', vazgec2: 'tsEklentiYukleVazgec2', vazgec: 'tsEklentiYukleVazgec', onizle: 'tsEklentiYukleOnizle', uygula: 'tsEklentiYukleUygula', degistir: 'tsEklentiYukleDegistir' };
    let k = null, onz = null, sonuc = null, adim = 'sec';
    const eklentiMi = tur !== 'tasima';

    async function yuklendi(r) {
      if (!r || !r.success) { AG.bildir(`Dosya okunamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); return; }
      if (eklentiMi && r.bildiri.tur !== 'arastirma-eklentisi') { AG.bildir('Bu bir taşıma dosyası — kurulum sihirbazında "Başka bilgisayardan taşı" ile açılır.', 'hata'); AG.api.tasima.vazgec(r.kimlik); return; }
      if (!eklentiMi && r.bildiri.tur !== 'tasima') { AG.bildir('Bu bir araştırma eklentisi — Ayarlar › Yedek ve taşıma › "Eklenti yükle" ile yüklenir.', 'hata'); AG.api.tasima.vazgec(r.kimlik); return; }
      k = r; adim = 'sifre'; ciz2();
    }
    async function dosyaSec(d) {
      const g = bul(ID.dosya);
      const f = g && g.files && g.files[0];
      const yol = ((bul(ID.yol) || {}).value || '').trim();
      if (!f && !yol) { AG.bildir('Bir dosya seç ya da bu bilgisayardaki tam yolunu yaz.', 'hata'); return; }
      AG.dom.mesgul(d, f ? 'Yükleniyor…' : 'Okunuyor…');
      try { await yuklendi(f ? await AG.api.tasima.yukle(f) : await AG.api.tasima.yerel(yol)); }
      catch (e) { AG.bildir(`Dosya okunamadı: ${e.message}`, 'hata'); } finally { AG.dom.hazir(d); }
    }
    async function onizle(d) {
      const sifre = ((bul(ID.sifre) || {}).value) || '';
      AG.dom.mesgul(d, 'Doğrulanıyor…');
      try {
        const r = await AG.api.tasima.onizle(k.kimlik, sifre, tur);
        if (!r || !r.success) { AG.bildir((r && r.error) || 'Doğrulanamadı', 'hata'); return; }
        onz = r; adim = 'onizle'; ciz2();
      } catch (e) { AG.bildir(`Doğrulanamadı: ${e.message}`, 'hata'); } finally { AG.dom.hazir(d); }
    }
    async function uygula(d) {
      const degistir = !!(bul(ID.degistir) || {}).checked;
      if (!eklentiMi && onz.doluluk && onz.doluluk.dolu && !degistir) { AG.bildir('Bu bilgisayarda kişisel veri var — "Var olanı yedekleyip değiştir"i işaretle ya da boş bir kurulum kullan.', 'hata'); return; }
      if (!eklentiMi && degistir && !(await AG.onayla({ baslik: 'Var olan veri değiştirilsin mi?', metin: 'Bu bilgisayardaki kişisel ve gizli veri silinmez, veri klasöründe makine/onceki-<zaman> altına taşınır; yerine dosyadaki gelir.', onay: 'Yedekle ve değiştir', tehlikeli: true }))) return;
      AG.dom.mesgul(d, eklentiMi ? 'Yükleniyor…' : 'Taşınıyor…');
      try {
        const r = await AG.api.tasima.uygula(k.kimlik, degistir ? 'degistir' : 'bos');
        if (!r || !r.success) { AG.bildir((r && r.error) || 'Yapılamadı', 'hata'); return; }
        sonuc = r; adim = 'bitti'; ciz2();
        if (r.yenidenBasliyor) global.setTimeout(() => { try { global.location.reload(); } catch (e) { /* */ } }, 15000);
        if (eklentiMi && AG.pages.kabuk && AG.pages.kabuk.arastirmaEklentisiniUygula) AG.pages.kabuk.arastirmaEklentisiniUygula(true);
        if (typeof o.bitince === 'function') o.bitince(r);
      } catch (e) { AG.bildir(`Yapılamadı: ${e.message}`, 'hata'); } finally { AG.dom.hazir(d); }
    }
    async function vazgec() {
      if (k) { try { await AG.api.tasima.vazgec(k.kimlik); } catch (e) { /* */ } }
      k = null; onz = null; sonuc = null; adim = 'sec'; ciz2();
    }

    function bildiriSatiri(b) {
      return el('dl', { class: 'p-kv ts-kv' }, [
        el('dt', { text: 'Kaynak' }), el('dd', { text: `${b.makine || '?'} · ${tarihYaz(b.olusturma)}` }),
        el('dt', { text: 'Pusula sürümü' }), el('dd', { text: `${b.uygulamaSurum || '?'}${b.buSurum && b.uygulamaSurum !== b.buSurum ? ` (bu bilgisayar ${b.buSurum})` : ''}` }),
        el('dt', { text: 'Dosya' }), el('dd', { text: boyutYaz(b.boyut) }),
        ...Object.entries(b.sayilar || {}).flatMap(([t, s]) => [el('dt', { text: TUR_AD[t] || t }), el('dd', { text: `${s.dosya.toLocaleString('tr-TR')} dosya · ${boyutYaz(s.bayt)}` })]),
      ]);
    }

    function ciz2() {
      if (telefonMu()) { doldur(kap, [bant('Taşıma ve eklenti yükleme yalnız bu bilgisayardaki panelden yapılır.', 'uyari')]); return; }
      if (adim === 'sec') {
        doldur(kap, [
          p(eklentiMi ? 'Başka bilgisayarında oluşturduğun .pusula-arastirma dosyasını seç. Var olan araştırma verilerinin üzerine yazılmaz: aynı dosya atlanır, farklıysa "çakışma" diye raporlanır.'
            : 'Eski bilgisayarında Ayarlar › Yedek ve taşıma › "Taşıma dosyası oluştur" ile aldığın .pusula dosyasını (ya da USB yedeğini) seç.'),
          alan(ID.dosya, 'Dosya', el('input', { type: 'file', id: ID.dosya, accept: eklentiMi ? '.pusula-arastirma' : '.pusula' })),
          alan(ID.yol, 'ya da bu bilgisayardaki tam yolu (büyük dosyada yükleme beklemez)', el('input', { type: 'text', id: ID.yol, placeholder: eklentiMi ? 'D:\\yedek\\pusula-….pusula-arastirma' : 'E:\\PusulaYedek\\pusula-yedek-….pusula', spellcheck: 'false' })),
          el('div', { class: 'ts-cubuk' }, [dugme(ID.sec, 'Dosyayı aç', 'p-dugme-ana', (e) => dosyaSec(e.currentTarget))]),
        ]);
      } else if (adim === 'sifre') {
        const b = k.bildiri;
        const sifreGerek = eklentiMi ? b.govdeSifreli : b.gizliVar;
        doldur(kap, [
          bildiriSatiri(b),
          !eklentiMi && !b.gizliVar ? bant('Bu dosyada gizli bilgiler yok (oluşturulurken şifre verilmemiş): API anahtarları, Telegram jetonu ve PIN yeniden girilir.', 'uyari') : null,
          sifreGerek ? alan(ID.sifre, 'Dosyanın şifresi', sifreGirdi(ID.sifre, 'current-password'), 'Dosya oluşturulurken verilen şifre. Yanlışsa hiçbir şey değişmez.') : p('Bu dosya şifresiz.', 'ts-metin ts-soluk'),
          el('div', { class: 'ts-cubuk' }, [dugme(ID.vazgec, 'Vazgeç', 'p-dugme-sessiz', vazgec), dugme(ID.onizle, 'Doğrula ve önizle', 'p-dugme-ana', (e) => onizle(e.currentTarget))]),
        ]);
      } else if (adim === 'onizle') {
        const z = onz.onizleme;
        const dolu = onz.doluluk && onz.doluluk.dolu;
        doldur(kap, [
          bant(`Dosya doğrulandı: her dosyanın özeti tuttu${z.gizliVar ? ', gizli bilgiler şifresi çözüldü' : ''}. Henüz hiçbir şey değişmedi.`),
          z.surumUyari ? bant(z.surumUyari, 'uyari') : null,
          AG.tablo.kutulu({ sinif: 'ts-tablo', basliklar: ['Gelecek', { metin: 'Dosya', sinif: 'p-sag' }, { metin: 'Boyut', sinif: 'p-sag' }],
            satirlar: Object.entries(z.turler).map(([t, s]) => el('tr', null, [el('td', { text: TUR_AD[t] || t }), el('td', { class: 'p-sag p-sayi', text: s.dosya.toLocaleString('tr-TR') }), el('td', { class: 'p-sag p-sayi', text: boyutYaz(s.bayt) })])) }),
          !eklentiMi ? p(`Kişisel: ${z.kisiselParcalar.join(', ') || '—'}.${z.gizliAdlar.length ? ` Gizli: ${z.gizliAdlar.join(', ')}.` : ''}${z.botlar.length ? ` Bot kayıtları: ${z.botlar.join(', ')} — botlar kendiliğinden BAŞLAMAZ; önce borsa mutabakatı, sonra senin "Başlat"ın.` : ''}${z.sunucuBaglantisi ? ' Sunucu bağlantısı da geliyor.' : ''}`, 'ts-metin')
            : p(`Araştırma: ${z.arastirmaParcalar.join(', ') || '—'}.`, 'ts-metin'),
          z.haric && z.haric.length && !eklentiMi ? p(`Dosyaya bilerek girmeyenler: ${[...new Set(z.haric.map(h => h.neden))].join(' · ')}.`, 'ts-metin ts-soluk') : null,
          onz.calisanBotlar && onz.calisanBotlar.length && !eklentiMi ? bant(`Önce çalışan botları durdur: ${onz.calisanBotlar.join(', ')}.`, 'tehlike') : null,
          dolu ? bant(`Bu bilgisayarda zaten kişisel veri var (${onz.doluluk.parcalar.map(x => x.ad).slice(0, 6).join(', ')}). Üzerine yazılmaz.`, 'uyari') : null,
          dolu ? kutu(ID.degistir, 'Var olanı yedekleyip değiştir', 'Var olan veri silinmez: veri klasöründe makine/onceki-<zaman> altına taşınır.') : null,
          el('div', { class: 'ts-cubuk' }, [dugme(ID.vazgec2, 'Vazgeç', 'p-dugme-sessiz', vazgec),
            dugme(ID.uygula, eklentiMi ? 'Eklentiyi yükle' : 'Bu bilgisayara taşı', 'p-dugme-ana', (e) => uygula(e.currentTarget))]),
        ]);
      } else if (adim === 'bitti') {
        const r = sonuc;
        doldur(kap, eklentiMi ? [
          bant(`Eklenti yüklendi: ${r.sonuc.konan.toLocaleString('tr-TR')} dosya kondu, ${r.sonuc.ayni.toLocaleString('tr-TR')} zaten aynıydı.${r.sonuc.cakisma.length ? ` ${r.sonuc.cakisma.length} dosya bu bilgisayarda farklı — üzerine yazılmadı: ${r.sonuc.cakisma.slice(0, 4).join(', ')}${r.sonuc.cakisma.length > 4 ? '…' : ''}` : ''} Araştırma menüsü artık görünür.`),
        ] : [
          bant(`Taşıma tamam: ${r.sonuc.yerlesen.length} parça yerine kondu.${r.sonuc.onceki ? ` Önceki veri: ${r.sonuc.onceki}` : ''}`),
          bant(r.yenidenBasliyor ? 'Pusula yeni verilerle yeniden başlıyor — sayfa 15 saniye sonra kendiliğinden yenilenir.'
            : 'Şimdi Pusula\'yı kapatıp yeniden aç (Pusula-Durdur, sonra Pusula-Baslat). Yeniden açılana kadar başka işlem yapılmaz.', 'uyari'),
          p('Botlar kendiliğinden başlamaz: her bot için Botlar › <bot> › Yönetim\'de "Mutabakat" (borsayla karşılaştır), temiz çıkınca "Başlat". Kurulum onayın dosyadan geldi; kullanım şartları değiştiyse sihirbaz yeniden onay ister.', 'ts-metin'),
        ]);
      }
    }
    ciz2();
    return { ciz: ciz2, vazgec };
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-settings' && String(e.detail.alt || '').split('/')[0] === 'yedek') yukle(); });
  }

  AG.pages = AG.pages || {};
  AG.pages.tasima = { yukle, ciz, iceAktarAkisi, boyutYaz, gunlukSatirlari };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.tasima;
})(typeof window !== 'undefined' ? window : globalThis);
