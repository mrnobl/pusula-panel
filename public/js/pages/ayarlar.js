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
      case 'onay':
        // 69.2: kuru denemede karar farkı — kurulum ancak "Farkı gördüm, yine de kur" ile.
        if (g.kuruFark && g.kuruFark.hedef === g.hedef) return { metin: `${s} kurulmadı: kuru denemede botun kararı değişti — ${g.kuruFark.ozet || ''}. Fark bekleniyorsa (ör. bir düzeltme) yine de kurabilirsiniz.`, ton: 'tone-warning', onay: g.hedef || null, kuruFark: true, kontrolDugmesi: true };
        const paket = g.paketFarki && g.paketFarki.length ? ` · paket değişikliği (${g.paketFarki.length}): ${g.paketFarki.slice(0, 5).map(x => `${x.ad} ${x.eski || '—'} → ${x.yeni || 'silindi'}`).join(', ')}${g.paketFarki.length > 5 ? ' …' : ''}` : '';
        return { metin: `${s} kurulmayı bekliyor: bot kodu değişti (${dosyalar}${paket}). Kurmadan önce botların kararı eski ve yeni kodla, emir göndermeden karşılaştırılır; Pusula ~30 sn yeniden başlar, açılmazsa eski sürüme kendiliğinden döner.`, ton: 'tone-warning', onay: g.hedef || null, kontrolDugmesi: true };
      case 'elle': return { metin: `Elle bakılmalı: ${g.neden || ''}`, ton: 'tone-danger', onay: null, kontrolDugmesi: true };
      case 'geri-alindi': return { metin: `${s} kurulamadı, geri alındı (${g.geriDonus || ''}): ${g.neden || ''}`, ton: 'tone-danger', onay: null, kontrolDugmesi: true };
      case 'yeniden-baslat': return { metin: g.neden || 'Yeniden başlatma gerekli.', ton: 'tone-warning', onay: null, kontrolDugmesi: true };
      case 'ag-hatasi': return { metin: `GitHub'a ulaşılamadı (${g.agHatasi || 1}. kez; ${zaman(g.kontrol)}). İnternet gelince ertesi gün yeniden dener.`, ton: (g.agHatasi || 1) >= 3 ? 'tone-warning' : 'tone-muted', onay: null, kontrolDugmesi: true };
      case 'kuruluyor': return { metin: `${s} kuruluyor… (adımlar aşağıda)`, ton: 'tone-warning', onay: null, kontrolDugmesi: false };
      default: return { metin: 'Henüz kontrol yapılmadı. Günlük görev kurulu değilse: Kılavuz › Kurulum › Otomatik güncelleme.', ton: 'tone-muted', onay: null, kontrolDugmesi: true };
    }
  }

  /* ── 69.0: güncelleme izleme — adımlar + canlı günlük (lib/guncelleme.js `islem`) ─────────────────────── */
  /** Sunucu `adimTanim` göndermezse (eski sunucu) aynı liste — lib/guncelleme.js ADIMLAR ile aynı sıra. */
  const GUNC_ADIMLAR = [
    { kod: 'baglanti', ad: 'GitHub bağlantısı' }, { kod: 'plan', ad: 'Değişikliklerin incelenmesi' },
    { kod: 'indir', ad: 'Yeni kodun indirilmesi' }, { kod: 'paket', ad: 'Paketler' }, { kod: 'denetim', ad: 'Sözdizimi denetimi' },
    { kod: 'kuru', ad: 'Kuru deneme (bot kararı)' }, { kod: 'baslat', ad: "Pusula'nın yeniden başlatılması" }, { kod: 'acilis', ad: 'Yeni sürümün açılışı' }, { kod: 'kararlilik', ad: 'Kararlılık gözlemi' }
  ];
  const saatYaz = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
  const sureYaz = (ms) => { if (!(ms >= 0)) return ''; const sn = Math.round(ms / 1000); return sn < 60 ? `${sn} sn` : `${Math.floor(sn / 60)} dk ${String(sn % 60).padStart(2, '0')} sn`; };

  /**
   * Saf: islem (+ adım tanımı, şimdi) → { durum: 'suruyor'|'bitti'|'yarida', basari, oran (0–1), adimlar: [{ kod, ad, durum, ayrinti, sure }], baslik, sure }.
   * Adım durumu: bekliyor | suruyor | tamam | atlandi | hata | gerekmedi (işlem o adıma varmadan bitti — ör. güncel / onay bekliyor).
   */
  function islemOzeti(islem, tanim, simdi = Date.now()) {
    if (!islem) return null;
    const liste = (Array.isArray(tanim) && tanim.length ? tanim : GUNC_ADIMLAR);
    const bitti = !!islem.bitti, yarida = !bitti && !!islem.yarida;
    const adimlar = liste.map(t => {
      const a = (islem.adimlar || []).find(x => x.kod === t.kod);
      let durum = a ? a.durum : 'bekliyor';
      if ((bitti || yarida) && durum === 'bekliyor') durum = 'gerekmedi';
      if (yarida && durum === 'suruyor') durum = 'hata';
      const bas = a && a.bas ? Date.parse(a.bas) : NaN, bit = a && a.bit ? Date.parse(a.bit) : NaN;
      const sure = Number.isFinite(bas) ? (Number.isFinite(bit) ? bit - bas : (durum === 'suruyor' ? simdi - bas : NaN)) : NaN;
      return { kod: t.kod, ad: t.ad, durum, ayrinti: (a && a.ayrinti) || (yarida && a && a.durum === 'suruyor' ? 'süreç yarıda kesildi' : null), sure };
    });
    // Oran: bitmiş adım = 1, süren kararlılık "i/tur" ayrıntısından kesirli; işlem bittiyse 1.
    let oran = 1;
    if (!bitti) {
      const gecerli = adimlar.filter(a => a.durum !== 'gerekmedi');
      const tamam = gecerli.filter(a => ['tamam', 'atlandi', 'hata'].includes(a.durum)).length;
      const suren = gecerli.find(a => a.durum === 'suruyor');
      let kesir = 0;
      if (suren) { const m = /^(\d+)\/(\d+) kontrol/.exec(suren.ayrinti || ''); kesir = m && +m[2] > 0 ? +m[1] / +m[2] : 0.3; }
      oran = Math.min(0.99, (tamam + kesir) / (gecerli.length || 1));
    }
    const sonuc = islem.sonuc || null;
    const basari = bitti && ['kuruldu', 'guncel', 'onay', 'kuru'].includes(sonuc);
    const SONUC = { kuruldu: 'Kuruldu ✓', guncel: 'Güncel ✓ — yeni sürüm yok', onay: 'Bot kodu değişti — onayınız bekleniyor', elle: 'Elle bakılmalı', 'geri-alindi': 'Kurulamadı — eski sürüme dönüldü', 'yeniden-baslat': 'Kod indi, yeniden başlatma gerekli', 'ag-hatasi': 'GitHub\'a ulaşılamadı', kuru: 'Deneme (hiçbir şey değişmedi)' };
    const suren = adimlar.find(a => a.durum === 'suruyor');
    const baslik = yarida ? 'Güncelleme işlemi yarıda kaldı (güncelleyici süreç kapandı)'
      : bitti ? (SONUC[sonuc] || `Bitti: ${sonuc || '?'}`)
      : suren ? `${suren.ad}…` : 'Güncelleme sürüyor…';
    const basMs = Date.parse(islem.bas), bitMs = islem.bitti ? Date.parse(islem.bitti) : simdi;
    return { durum: yarida ? 'yarida' : bitti ? 'bitti' : 'suruyor', basari, oran, adimlar, baslik, sure: Number.isFinite(basMs) ? bitMs - basMs : NaN, sonuc };
  }

  let izleme = null, izlemeIlk = null, kopuk = false, izSonDurum = null;
  const istemciSatirlari = [];   // panelin kendi gözlemi (sunucu yanıt vermiyor / geri geldi) — günlükte ayrı renk
  const istemciSatir = (metin, tur = 'istemci') => { istemciSatirlari.push({ zaman: new Date().toISOString(), metin, tur }); if (istemciSatirlari.length > 40) istemciSatirlari.shift(); };
  const yuklenenSurum = () => (typeof APP_VERSION !== 'undefined' ? APP_VERSION : null);   // eslint-disable-line no-undef

  /**
   * Kontrol / kurulum başladıktan sonra (ya da sayfa açıldığında süren bir işlem varsa) durumu 2 sn'de bir oku. Sunucu yeniden
   * başlarken istek düşer — beklenir ve günlüğe yazılır. İşlem `bitti` olana kadar izlenir (en çok 45 dk). Eski güncelleyici
   * (`islem` yazmayan) için yedek ölçüt: kontrol zamanı değişti ve durum "kuruluyor" değil.
   */
  function izle(ilk) {
    if (izleme) return;
    izlemeIlk = { bas: ilk && ilk.islem ? ilk.islem.bas : null, kontrol: ilk ? ilk.kontrol : null, beklenenYeni: !!(ilk && ilk.yeniIslem) };
    const bitis = Date.now() + 45 * 60 * 1000;
    const tik = async () => {
      const g = AG.api.guncelleme ? await AG.api.guncelleme.durum().catch(() => null) : null;
      const ok = !!(g && g.success !== false);
      if (!ok && !kopuk) { kopuk = true; istemciSatir('Panel yanıt vermiyor — Pusula yeniden başlıyor olabilir, bekleniyor…'); }
      if (ok && kopuk) { kopuk = false; istemciSatir(`Panel yeniden yanıt veriyor (çalışan sürüm ${g.calisanSurum || '?'})`); }
      if (ok) izSonDurum = g;
      cizGuncelleme(izSonDurum || g);
      if (!ok) { if (Date.now() > bitis) dur(); return; }
      const isl = g.islem;
      const yeniBasladi = isl && isl.bas !== izlemeIlk.bas;
      const islemli = isl && (!izlemeIlk.beklenenYeni || yeniBasladi);
      let bitti;
      if (islemli) bitti = !!(isl.bitti || isl.yarida);
      else bitti = g.kontrol !== izlemeIlk.kontrol && g.durum !== 'kuruluyor';   // eski güncelleyici
      if (!bitti && Date.now() <= bitis) return;
      dur();
      const sonuc = islemli ? isl.sonuc : g.durum;
      if (bitti && sonuc === 'kuruldu') {
        const yeniPanel = g.calisanSurum && yuklenenSurum() && g.calisanSurum !== yuklenenSurum();
        AG.bildir(yeniPanel ? `Pusula ${g.calisanSurum} kuruldu — yeni panel 5 sn içinde yükleniyor.` : 'Güncelleme kuruldu.', 'ok', { sure: 8000 });
        if (yeniPanel) setTimeout(() => global.location && global.location.reload(), 5000);
      }
    };
    const dur = () => { if (izleme) clearInterval(izleme); izleme = null; };
    izleme = setInterval(tik, 2000);
    tik();
  }

  function cizIzleme(g) {
    const { el } = AG.dom;
    const oz = islemOzeti(g.islem, g.adimTanim);
    if (!oz) return null;
    const ikon = { bekliyor: '○', suruyor: '◐', tamam: '✓', atlandi: '–', hata: '✗', gerekmedi: '·' };
    const durumAd = { bekliyor: 'bekliyor', suruyor: 'sürüyor', tamam: 'tamam', atlandi: 'atlandı', hata: 'hata', gerekmedi: 'gerekmedi' };
    const ton = oz.durum === 'suruyor' ? 'is-suruyor' : oz.durum === 'yarida' || (oz.durum === 'bitti' && !oz.basari) ? 'is-hata' : 'is-tamam';
    const satirlar = [...((g.islem && g.islem.satirlar) || []), ...istemciSatirlari.filter(x => !g.islem.bas || x.zaman >= g.islem.bas)]
      .sort((a, b) => String(a.zaman).localeCompare(String(b.zaman)));
    const konsol = el('div', { class: 'gunc-konsol', id: 'guncKonsol', role: 'log', 'aria-label': 'Güncelleme günlüğü', tabindex: '0' },
      satirlar.length ? satirlar.map(s => el('div', { class: `gunc-satir gunc-satir-${s.tur || 'bilgi'}` }, [
        el('span', { class: 'gunc-saat', text: saatYaz(s.zaman) }), el('span', { text: s.metin })
      ])) : [el('div', { class: 'gunc-satir', text: 'Henüz satır yok…' })]);
    // Başlık + çubuk + "başladı · %x · n sn" satırı tek tip gösterge (AG.ilerleme, Pusula P5) ile çizilir.
    const ust = el('div', { id: 'guncIzlemeUst' });
    if (AG.ilerleme && AG.ilerleme.ciz) {
      AG.ilerleme.ciz(ust, { durum: oz.durum === 'suruyor' ? 'calisiyor' : 'bitti', oran: oz.oran, sure: Number.isFinite(oz.sure) ? oz.sure : 0,
        asama: `${g.islem.tur === 'onayli' ? 'Onaylı kurulum' : 'Kontrol'} · başladı ${saatYaz(g.islem.bas)}` }, { baslik: oz.baslik });
    } else ust.appendChild(el('strong', { text: oz.baslik }));
    const kutu = el('div', { class: `gunc-izleme ${ton}`, id: 'guncIzleme' }, [
      ust,
      el('ol', { class: 'gunc-adimlar' }, oz.adimlar.map(a => el('li', { class: `gunc-adim gunc-adim-${a.durum}` }, [
        el('span', { class: 'gunc-adim-ikon', 'aria-hidden': 'true', text: ikon[a.durum] || '·' }),
        el('span', { class: 'gunc-adim-ad' }, [el('span', { text: a.ad }), el('span', { class: 'gunc-sr', text: ` (${durumAd[a.durum]})` })]),
        el('span', { class: 'gunc-adim-ayrinti', text: [a.ayrinti, Number.isFinite(a.sure) && a.durum !== 'gerekmedi' && a.sure >= 1000 ? sureYaz(a.sure) : null].filter(Boolean).join(' · ') })
      ]))),
      el('div', { class: 'gunc-konsol-baslik' }, [el('span', { text: 'Günlük' }), el('span', { class: 'hint', text: oz.durum === 'suruyor' ? 'canlı — 2 sn\'de bir yenilenir' : '' })]),
      konsol
    ]);
    return kutu;
  }

  function cizGuncelleme(g) {
    const kap = bul('ayarlarGuncelleme');
    if (!kap || !AG.dom) return;
    const { el, doldur } = AG.dom;
    const o = guncellemeOzeti(g);
    const eskiKonsol = bul('guncKonsol');
    const enAltta = !eskiKonsol || eskiKonsol.scrollHeight - eskiKonsol.scrollTop - eskiKonsol.clientHeight < 24;
    const surer = !!(g && g.islem && !g.islem.bitti && !g.islem.yarida);
    // Telefonda da açık (PIN'li — kontrol/kur içinde sorulur); bu yüzden data-kilit YOK.
    const dugme = (metin, onclick, sinif, id) => el('button', { type: 'button', id, class: `btn btn-sm ${sinif}`, onclick, disabled: surer ? true : undefined }, [el('span', { text: metin })]);
    doldur(kap, [
      el('dl', { class: 'kv-list kv-genis mb-0' }, [
        el('dt', { text: 'Çalışan sürüm' }), el('dd', { text: (g && g.calisanSurum) || '—' }),
        el('dt', { text: 'Durum' }), el('dd', { class: o.ton || null, id: 'ayGuncDurum' }, [el('span', { text: surer ? 'Güncelleme işlemi sürüyor — aşağıda adım adım' : o.metin }), el('span', { text: ' · ' }), el('a', { href: '#/kilavuz/kurulum/adim-22', text: 'Nasıl çalışır?' })])
      ]),
      o.kontrolDugmesi || o.onay ? el('div', { class: 'pf-dugmeler mt-3' }, [
        o.onay ? dugme(o.kuruFark ? `Farkı gördüm, yine de kur (${(g && g.hedefSurum) || 'yeni sürüm'})` : `Güncellemeyi kur (${(g && g.hedefSurum) || 'yeni sürüm'})`, () => kur(g, !!o.kuruFark), o.kuruFark ? 'btn-danger' : 'btn-primary', 'btnGuncKur') : null,
        o.kontrolDugmesi ? dugme('Şimdi kontrol et', () => kontrol(g), 'btn-secondary', 'btnGuncKontrol') : null
      ]) : null,
      o.kuruFark ? kuruFarkTablosu(g.kuruFark) : null,
      g && g.islem && !g.gelistirme ? cizIzleme(g) : null
    ]);
    const k = bul('guncKonsol');
    if (k && enAltta) k.scrollTop = k.scrollHeight;
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
    AG.bildir('Kontrol başladı — adımlar aşağıda canlı görünür.', 'ok');
    izle({ ...(g || {}), yeniIslem: true });
  }

  /** 69.2: kuru denemenin bot bot sonucu ve farklı çıkan alanlar (eski → yeni). */
  function kuruFarkTablosu(kd) {
    const { el } = AG.dom;
    const yaz = (v) => (v == null ? '—' : Array.isArray(v) ? (v.length > 4 ? `${v.slice(0, 4).join(', ')} … (${v.length})` : v.join(', ')) : typeof v === 'object' ? JSON.stringify(v) : String(v));
    return el('div', { class: 'gunc-kuru mt-3', id: 'guncKuruFark' }, [
      el('p', { class: 'hint mb-2', text: 'Kuru deneme: botların bugünkü kararı eski ve yeni kodla, emir göndermeden hesaplandı.' }),
      el('ul', { class: 'gunc-kuru-liste' }, (kd.botlar || []).map(b => el('li', null, [
        el('strong', { text: `${b.adGorunen || b.ad} (${b.kip === 'karar' ? 'karar' : 'yalnız yükleme'}): ` }), el('span', { text: b.metin || b.durum }),
        (b.farklar || []).length ? el('ul', { class: 'gunc-kuru-fark' }, b.farklar.map(x => el('li', { text: `${x.ad}: ${yaz(x.eski)} → ${yaz(x.yeni)}` }))) : null
      ])))
    ]);
  }

  async function kur(g, farkOnay = false) {
    const metin = farkOnay
      ? `Kuru denemede botun kararı yeni kodla farklı çıktı: ${(g.kuruFark && g.kuruFark.ozet) || ''}. Bu fark bekleniyorsa (ör. bir hata düzeltmesi) kurun; beklenmiyorsa kurmayın ve geliştirme sohbetine haber verin. Pusula yaklaşık 30 saniye yeniden başlar.`
      : `Bu güncelleme bot kodunu değiştiriyor (${(g.dosyalar || []).join(', ')}). Önce botların kararı eski ve yeni kodla emir göndermeden karşılaştırılır (1–3 dk); fark ya da hata çıkarsa kurulmaz. Sonra kod indirilir, Pusula yaklaşık 30 saniye yeniden başlar; açılmazsa eski sürüme kendiliğinden döner ve Telegram'dan haber verir. Açık pozisyonlar borsada kalır.`;
    const cevap = await AG.onayla({ baslik: farkOnay ? `Fark onaylansın ve Pusula ${g.hedefSurum || ''} kurulsun mu?` : `Pusula ${g.hedefSurum || ''} kurulsun mu?`, metin, onay: farkOnay ? 'Farkı gördüm, kur' : 'Kur ve yeniden başlat', tehlikeli: farkOnay || undefined, ...(telefonMu() ? { alanlar: PIN_ALANLARI } : {}) });
    if (!cevap) return;
    const r = await AG.api.guncelleme.uygula(g.hedef, { ...(telefonMu() ? pinGovdesi(cevap) : {}), ...(farkOnay ? { kuruFarkOnay: true } : {}) });
    if (!r || !r.success) { AG.bildir(`Kurulmadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 }); return; }
    AG.bildir('Kurulum başladı — adımlar aşağıda canlı görünür; bitince sayfa kendiliğinden yenilenir.', 'ok', { sure: 10000 });
    izle({ ...(g || {}), yeniIslem: true });
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
    // 69.0: sayfa açıldığında süren bir güncelleme (ör. 12:00 görevi) varsa izlemeye başla.
    if (g && g.islem && !g.islem.bitti && !g.islem.yarida) izle(g);
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
  AG.pages.ayarlar = { ciz, satirlar, cizSatirlar, guncellemeOzeti, cizGuncelleme, islemOzeti, GUNC_ADIMLAR, sekmeSec, sekmeCoz, SEKMELER };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.ayarlar;
})(typeof window !== 'undefined' ? window : globalThis);
