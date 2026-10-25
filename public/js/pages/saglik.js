/**
 * SİSTEM › SAĞLIK — Öz denetim (69.1, lib/ozDenetim.js, PLAN-OZ-DENETIM.md) `AG.pages.saglik`
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/saglik/oz: 19 denetimin son sonucu (4 grup), botların güvenli kip / tam kapanma durumu, son 30 günün olayları.
 * 69.2: "Olay raporları" kartı — bot güvenli kipe girince / kapanınca yazılan kara kutu raporları (indir) + "Şimdi rapor al".
 * Üstte özet; kapanan ya da güvenli kipteki bot için kart ("Sebebi okudum" kutusu + "Botu yeniden aç" / "Güvenli kipi kaldır");
 * ortada gruplu denetimler; altta onarım kaydı ve tam kapanma tetikleri. Menüdeki "Sağlık" öğesinin noktası (sarı/kırmızı)
 * 5 dk'da bir tazelenir (rozetGuncelle). Geliştirme bilgisayarında sunucunun yanıtı gelir (lib/evOkuma.js).
 */
(function (global) {
  'use strict';
  /** 72.0: görünen bot adı kimlikten (js/core/sozluk.js AG.botAd). */
  const GA = (b) => (global.AG && global.AG.botAd ? global.AG.botAd.gorunen(b) : (b && (b.adGorunen || b.ad)) || '');
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const bildir = (m, t) => (AG.bildir ? AG.bildir(m, t || 'bilgi') : null);

  const DURUM_AD = { tamam: 'tamam', uyari: 'uyarı', hata: 'hata', bilinmiyor: 'bilinmiyor', kapali: 'kapalı' };
  const KADEME_AD = { onar: 'Kendisi onarır', koru: 'Korur, sonra sorar', haber: 'Yalnız haber verir' };
  const OLAY_AD = {
    onarildi: ['ONARILDI', 'pos'], onarilamadi: ['ONARILAMADI', 'neg'], 'guvenli-kip': ['GÜVENLİ KİP', 'warn'], 'guvenli-kip-kalkti': ['GÜVENLİ KİP KALKTI', 'pos'],
    'tam-kapanma': ['TAMAMEN KAPANDI', 'neg'], uyari: ['UYARI', 'warn'], hata: ['HATA', 'neg'], duzeldi: ['DÜZELDİ', 'pos'], 'kara-kutu': ['OLAY RAPORU', ''],
  };
  const SIRA = { tamam: 0, kapali: 0, bilinmiyor: 1, uyari: 2, hata: 3 };
  /** 73.7 (S13): denetim → Kılavuz › Sorun giderme başlığı (her satırın "ne yapmalı" bağlantısı). */
  const KILAVUZ = { surec: 'acilis-sayaci', donma: 'donma', bellek: 'bellek', disk: 'disk', paket: 'paket-guvenligi', node: 'node', saat: 'saat-farki', sir: 'sir-dosyasi', kilit: 'kilit',
    dosya: 'ayar-bozuk', yedek: 'yedek', uzak: 'yedek', guncel: 'guncelleme-elle', wyb: 'windows-yeniden-baslatma', uyku: 'uyku', baglanti: 'yurutucu-durdu', fiyat: 'guvenli-kip', veri: 'veri-kalitesi', bakim: 'guvenli-kip',
    delist: 'delist', kayitci: 'ileriye-kayit', internet: 'internet', mutabakat: 'pozisyon-uyusmazligi', stop: 'stop-kurulamadi', marj: 'marj', zorla: 'adl-likidasyon', funding: 'funding',
    sapma: 'golge-kaymasi', maliyet: 'islem-maliyeti', tekrar: 'guvenli-kip-tekrar', kacan: 'kacan-calisma', telegram: 'telegram-gonderim', sinyal: 'saglik-sinyali' };
  /** Saf (73.7, S13): denetim satırının "ne yapmalı" modeli → { metin, kilavuz, sorunlar } (sorunlu satırda Sorunlar bağlantısı). */
  function nasilModeli(d) {
    if (!d) return null;
    const sorunlu = d.durum === 'uyari' || d.durum === 'hata';
    return { metin: d.nasil || (sorunlu ? 'Adımlar Sistem › Sorunlar sayfasında.' : ''), kilavuz: KILAVUZ[d.kimlik] ? `#/kilavuz/sorun-giderme/${KILAVUZ[d.kimlik]}` : '#/kilavuz/sorun-giderme', sorunlar: sorunlu };
  }
  let veri = null;
  const okundu = {};   // bot → "Sebebi okudum" işaretli mi (yalnız bu sayfa açıkken)

  const p2 = (n) => String(n).padStart(2, '0');
  /** ms → "14:05" (bugünse) ya da "21.10 14:05". */
  function saat(ms, simdi = Date.now()) {
    if (!ms) return '—';
    const d = new Date(ms);
    const b = new Date(simdi);
    const s = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
    return d.toDateString() === b.toDateString() ? s : `${p2(d.getDate())}.${p2(d.getMonth() + 1)} ${s}`;
  }

  /** Saf: anlık görüntü → özet göstergeleri (test edilir). */
  function ozetModeli(g, simdi = Date.now()) {
    if (!g || !g.ozet) return [];
    const o = g.ozet;
    const gun = (g.olaylar || []).filter(x => simdi - x.zaman < 864e5);
    const onarim = gun.filter(x => x.tur === 'onarildi').length;
    const basarisiz = gun.filter(x => x.tur === 'onarilamadi').length;
    const kapali = (g.botlar || []).filter(b => b.engel).length;
    const gk = (g.botlar || []).filter(b => b.guvenliKip).length;
    const calisan = (g.botlar || []).filter(b => b.calisiyor).length;
    return [
      { kimlik: 'durum', etiket: 'Durum', deger: o.hata ? `${o.hata} hata` : o.uyari ? `${o.uyari} uyarı` : 'Her şey yolunda',
        alt: `${o.tamam} / ${o.toplam} denetim tamam${o.bilinmiyor ? ` · ${o.bilinmiyor} ölçülemedi` : ''}`, ton: o.hata ? 'p-neg' : o.uyari ? 'p-warn' : 'p-pos' },
      { kimlik: 'onarim', etiket: 'Son 24 saat', deger: `${onarim} onarım`, alt: basarisiz ? `${basarisiz} onarılamadı · sınır günde ${o.onarimSiniri}` : `sınır: aynı onarım günde ${o.onarimSiniri}`, ton: basarisiz ? 'p-warn' : '' },
      { kimlik: 'botlar', etiket: 'Botlar', deger: kapali ? `${kapali} tamamen kapalı` : gk ? `${gk} güvenli kipte` : `${calisan} çalışıyor`,
        alt: (g.botlar || []).map(b => `${GA(b)} ${b.engel ? 'kapalı' : b.guvenliKip ? 'güvenli kipte' : b.calisiyor ? 'çalışıyor' : 'durdu'}`).join(' · ') || '—', ton: kapali ? 'p-neg' : gk ? 'p-warn' : '' },
      { kimlik: 'yoklama', etiket: 'Son yoklama', deger: saat(o.sonYoklama, simdi), alt: g.calisiyor === false ? 'öz denetim sunucuda çalışır' : `sonraki ${saat(o.sonraki, simdi)} · 5 dk'da bir` },
    ];
  }

  /** Saf: denetimler → gruplar (sorunlu satırlar üstte). */
  function gruplaModeli(g) {
    if (!g || !g.denetimler) return [];
    return (g.gruplar || []).map(gr => {
      const l = g.denetimler.filter(d => d.grup === gr.kimlik).slice().sort((a, b) => (SIRA[b.durum] || 0) - (SIRA[a.durum] || 0));
      return { ...gr, denetimler: l, uyari: l.filter(d => d.durum === 'uyari').length, hata: l.filter(d => d.durum === 'hata').length };
    });
  }

  const KAYNAK_AD = { tekrar: 'tekrarlayan hata', fiyat: 'fiyat sapması', bakim: 'borsa bakımı', engel: 'ENGEL', guvenlikip: 'güvenli kip', elle: 'elle', cokme: 'döngü çöküyor', stop: 'koruma stopu', emirRet: 'emir reddi', emirret: 'emir reddi' };
  /** Saf: olay raporu listesi → satırlar (bot adı, sebep, boyut). */
  function raporModeli(l, botlar) {
    return (l || []).map(r => {
      const b = (botlar || []).find(x => x.ad === r.bot);
      return { dosya: r.dosya, zaman: r.zaman, bot: b ? GA(b) : (r.bot === 'sistem' ? 'Sistem' : r.bot || '—'), sebep: KAYNAK_AD[r.kaynak] || r.kaynak || '—', boyut: Number.isFinite(r.bayt) ? `${Math.max(1, Math.round(r.bayt / 1024))} KB` : '' };
    });
  }

  /** Saf: menü noktası tonu — kırmızı (hata ya da kapalı bot) > sarı (uyarı / güvenli kip) > yok. */
  function rozetTonu(g) {
    if (!g || !g.ozet) return null;
    if (g.ozet.hata || (g.botlar || []).some(b => b.engel)) return 'neg';
    if (g.ozet.uyari || (g.botlar || []).some(b => b.guvenliKip)) return 'warn';
    return null;
  }

  function rozetGuncelle(g) {
    if (!doc || !doc.querySelectorAll) return;
    const ton = rozetTonu(g);
    doc.querySelectorAll('[data-saglik-rozet]').forEach(r => {
      r.classList.toggle('is-hidden', !ton);
      r.classList.toggle('oz-rozet-neg', ton === 'neg');
      r.classList.toggle('oz-rozet-warn', ton === 'warn');
      r.setAttribute('title', ton === 'neg' ? 'Sağlık: hata var' : ton === 'warn' ? 'Sağlık: uyarı var' : '');
    });
  }

  // ── çizim ──
  function gosterge(x) {
    return el('div', { class: 'p-gosterge', 'data-kimlik': x.kimlik }, [
      el('p', { class: 'p-gosterge-etiket' }, [el('span', { text: x.etiket })]),
      el('p', { class: `p-gosterge-deger${x.ton ? ' ' + x.ton : ''}`, text: x.deger }),
      el('p', { class: 'p-gosterge-alt', text: x.alt }),
    ]);
  }

  async function eylem(dugme, fn, basari) {
    AG.dom.mesgul(dugme, '…');
    try {
      const r = await fn();
      if (!r || !r.success) throw new Error((r && r.error) || 'sunucu yanıt vermedi');
      bildir(basari, 'ok');
    } catch (e) { bildir(`İşlem yapılamadı: ${e.message}`, 'hata'); }
    finally { AG.dom.hazir(dugme); yukle(); }
  }

  function botKarti(b) {
    const kapali = !!b.engel;
    const kolEngeli = kapali && !b.bindirmeEngel && b.kolEngel;
    const sebep = kapali ? b.engel : (b.guvenliKip && b.guvenliKip.metin) || '';
    const kutuId = `chkOzOkudum-${b.ad}`;
    // AG.dom.el false'u da öznitelik yazar (checked="false" işaretli sayılır) — yalnız gerektiğinde verilir.
    const kutu = el('input', { type: 'checkbox', id: kutuId, checked: okundu[b.ad] ? 'checked' : null });
    const ac = el('button', { type: 'button', class: kapali ? 'btn btn-danger btn-sm' : 'btn btn-secondary btn-sm', id: `btnOzAc-${b.ad}`, disabled: okundu[b.ad] ? null : 'disabled' },
      [el('span', { text: kapali ? (kolEngeli ? 'Borsayla karşılaştır' : 'Botu yeniden aç') : 'Güvenli kipi kaldır' })]);
    kutu.addEventListener('change', () => { okundu[b.ad] = kutu.checked; ac.disabled = !kutu.checked; });
    ac.addEventListener('click', () => {
      if (!kapali) return eylem(ac, () => AG.api.saglikOz.guvenliKipKaldir(b.ad), `${GA(b)}: güvenli kip kaldırıldı — bot sonraki çalışmada işlem yapabilir`);
      if (kolEngeli) return eylem(ac, () => AG.api.bindirmeEylem(b.ad, 'mutabakat'), `${GA(b)}: borsayla karşılaştırıldı`);
      return eylem(ac, () => AG.api.bindirmeEylem(b.ad, 'engel-kaldir'), `${GA(b)}: bot yeniden açıldı`);
    });
    return el('section', { class: `p-kart oz-bot-kart ${kapali ? 'oz-bot-kapali' : 'oz-bot-gk'}`, id: `ozBot-${b.ad}`, role: 'alert' }, [
      el('div', { class: 'p-kart-bas' }, [
        el('h3', { class: 'p-kart-baslik', text: `${GA(b)} · ${kapali ? 'tamamen kapandı' : 'güvenli kipte'}` }),
        el('span', { class: `p-rozet ${kapali ? 'p-rozet-neg' : 'p-rozet-warn'}`, text: kapali ? 'Kapalı' : 'Yeni işlem yok' }),
      ]),
      el('p', { class: 'oz-sebep' }, [el('strong', { text: 'Sebep: ' }), el('span', { text: sebep })]),
      el('p', { class: 'hint hint-sm', text: kapali
        ? 'Bot siz açana kadar çalışmaz; Pusula yeniden başlasa da kapalı kalır. Açık pozisyona dokunulmadı, borsadaki stoplar yerinde.'
        : 'Bot yeni işlem açmaz; açık pozisyonun stopu yerinde. Öz denetim koyduysa sebep geçince kendiliğinden kalkar.' }),
      b.dokunulmaz ? el('p', { class: 'hint hint-sm', text: 'Demo kabul süresince öz denetim bu bota dokunmaz; bu durumu başka bir kural koydu.' }) : null,
      el('label', { class: 'oz-okudum', for: kutuId }, [kutu, el('span', { text: kolEngeli ? 'Farkı inceledim (karşılaştırma temiz çıkarsa bot açılır)' : 'Sebebi okudum ve düzelttim' })]),
      el('div', { class: 'oz-bot-dugmeler' }, [ac, el('a', { class: 'btn btn-secondary btn-sm no-underline', href: `#/botlar/${b.ad}` }, [el('span', { text: 'Bot sayfası' })]),
        el('a', { class: 'btn btn-secondary btn-sm no-underline', href: '#/gunluk' }, [el('span', { text: 'Ayrıntılı günlük' })])]),
    ]);
  }

  function denetimSatiri(d, simdi) {
    const o = d.onarim;
    return el('li', { class: `oz-satir oz-satir-${d.durum}`, 'data-kimlik': d.kimlik }, [
      el('span', { class: `oz-nokta oz-nokta-${d.durum}`, 'aria-hidden': 'true' }),
      el('div', { class: 'oz-govde' }, [
        el('div', { class: 'oz-ad-satir' }, [el('span', { class: 'oz-ad', text: d.ad }), el('span', { class: 'oz-kademe', text: KADEME_AD[d.kademe] || '' }),
          el('span', { class: 'gunc-sr', text: `durum: ${DURUM_AD[d.durum] || d.durum}` })]),
        el('div', { class: 'oz-ayrinti', text: d.ayrinti || '—' }),
        o ? el('div', { class: `oz-onarim${o.basari ? '' : ' oz-onarim-olmadi'}`, text: `${o.basari ? 'Onarıldı' : 'Onarılamadı'} ${saat(o.zaman, simdi)}: ${o.metin}` }) : null,
        (() => { const n = nasilModeli(d); return n ? el('div', { class: 'oz-nasil' }, [el('strong', { text: n.sorunlar ? 'Ne yapmalı: ' : 'Sorun olursa: ' }), el('span', { text: `${n.metin} ` }),
          n.sorunlar ? el('a', { href: '#/sorunlar', text: "Sorunlar’da adımlar →" }) : null, n.sorunlar ? el('span', { text: ' · ' }) : null, el('a', { href: n.kilavuz, text: 'Kılavuz' })]) : null; })(),
      ]),
      el('span', { class: 'oz-sag sayi', text: saat(d.zaman, simdi) }),
    ]);
  }

  function karaKutuKarti(v, simdi) {
    const l = raporModeli(v.karaKutular, v.botlar);
    const al = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'btnOzRaporAl', disabled: v.calisiyor === false ? 'disabled' : null }, [el('i', { 'data-lucide': 'file-down' }), el('span', { text: 'Şimdi rapor al' })]);
    al.addEventListener('click', () => eylem(al, () => AG.api.saglikOz.karaKutuAl('sistem'), 'Olay raporu yazıldı — listede'));
    return el('section', { class: 'p-kart mt-4', id: 'saglikRaporlar' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Olay raporları (kara kutu)' }), al]),
      el('p', { class: 'hint hint-sm', text: 'Bir bot güvenli kipe girince ya da tamamen kapanınca Pusula o anın raporunu yazar: botun ve borsa bağlantısının durumu, son 30 dakikanın günlüğü, denetim sonuçları, son güncelleme. Sorunu birlikte incelerken bu dosyayı paylaşın; günlük kopyalamaya gerek kalmaz. Sır (anahtar, jeton) içermez.' }),
      l.length ? el('ul', { class: 'oz-olaylar' }, l.slice(0, 20).map(r => el('li', { class: 'oz-olay' }, [
        el('span', { class: 'oz-sag sayi', text: saat(r.zaman, simdi) }),
        el('span', { class: 'p-rozet', text: r.bot }),
        el('span', { class: 'oz-olay-metin' }, [el('span', { text: `${r.sebep}${r.boyut ? ` · ${r.boyut}` : ''} · ` }), el('a', { href: AG.api.saglikOz.karaKutuYolu(r.dosya), download: r.dosya, text: r.dosya })]),
      ]))) : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: 'Henüz olay raporu yok. Bir bot güvenli kipe girdiğinde ya da kapandığında burada görünür.' })]),
    ]);
  }

  /**
   * 74.3 VERİ KALİTESİ (D4, GET /api/veri-kalitesi). Saf model (test edilir): kip, izleme bilgisi (7 gün doldu mu — OTOMATİK GEÇİŞ YOK),
   * bot başına son çalışma, 30 gün sayacı, son bulgular.
   */
  let vkVeri = null;
  const AGIRLIK_AD = { temiz: 'temiz', hafif: 'hafif', agir: 'AĞIR' };
  function veriKalitesiModeli(v, simdi = Date.now()) {
    if (!v || !v.success) return null;
    const etkin = v.kip === 'etkin';
    const iz = v.izleme || {};
    const botlar = Object.values(v.botlar || {}).map(b => {
      const s = b.sayac30 || {};
      const son = b.son;
      const durum = b.guvenliKip ? `güvenli kipte — ${String(b.guvenliKip.metin || '').replace(/^veri kalitesi: /, '')}`
        : b.acik ? `son çalışma: ${AGIRLIK_AD[b.acik.agirlik] || b.acik.agirlik} bulgu — ${b.acik.metin}`
          : son ? `son çalışma temiz (${saat(son.zaman, simdi)})` : 'henüz günlük çalışma kaydı yok';
      const ton = b.guvenliKip || (b.acik && b.acik.agirlik === 'agir') ? 'p-rozet-neg' : b.acik ? 'p-rozet-warn' : 'p-rozet-pos';
      return { ad: b.ad, adGorunen: b.adGorunen || b.ad, mod: b.mod, durum, ton,
        kipMetin: b.dokunulmaz ? 'demo kabul — yalnız haber' : b.etkin ? 'etkin' : 'izleme',
        sayac: `30 gün: ${s.calisma || 0} çalışma · ${s.temiz || 0} temiz · ${s.hafif || 0} hafif · ${s.agir || 0} ağır${s.guvenliKip ? ` · ${s.guvenliKip} güvenli kip` : ''}`,
        bulgular: (b.sonBulgular || []).slice(0, 3).map(x => `${saat(x.zaman, simdi)} · ${AGIRLIK_AD[x.agirlik] || x.agirlik}: ${(x.bulgular || []).map(y => y.metin).join(' · ')}`) };
    });
    return { kip: v.kip, etkin, kipAd: etkin ? 'Etkin kip' : 'İzleme kipi', rozet: etkin ? 'p-rozet-warn' : 'p-rozet-pos',
      aciklama: etkin ? 'Ağır bulguda bot güvenli kipe girer (karar ertelenir, stoplar borsada); veri temizlenince kendiliğinden çıkar. Demo kabul botu yalnız haber alır.'
        : 'Bulgular yalnız kaydedilir; botların kararı DEĞİŞMEZ. İlk 7 gün gözlem için.',
      izleme: iz.mesaj || null, doldu: !!iz.doldu, botlar,
      dugme: etkin ? { kip: 'izleme', metin: 'İzleme kipine dön' } : { kip: 'etkin', metin: iz.doldu ? 'Etkin kipe geç (7 gün doldu)' : 'Etkin kipe geç' },
      yazilabilir: v.calisiyor !== false && !(AG.api && typeof AG.api.kademe === 'function' && AG.api.kademe() === 'telefon') };
  }
  function veriKalitesiKarti(v, simdi) {
    const m = veriKalitesiModeli(v, simdi);
    if (!m) return null;
    const dugme = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'btnVkKip', disabled: m.yazilabilir ? null : 'disabled' }, [el('span', { text: m.dugme.metin })]);
    dugme.addEventListener('click', async () => {
      const etkine = m.dugme.kip === 'etkin';
      const tamam = await AG.onayla({ baslik: etkine ? 'Etkin kipe geçilsin mi?' : 'İzleme kipine dönülsün mü?', tehlikeli: false,
        metin: etkine ? 'Etkin kipte ağır bir veri bulgusunda bot o günkü kararı erteler ve güvenli kipe girer (yeni işlem yok, stoplar borsada); veri temizlenince kendiliğinden çıkar. Demo kabul botu (Kairos) 2026-12-09 sonuna kadar yine yalnız haber alır.'
          : 'İzleme kipinde bulgular yalnız kaydedilir, karar engellenmez. Veri kalitesinin koyduğu güvenli kip varsa hemen kalkar.',
        onay: etkine ? 'Etkin kipe geç' : 'İzleme kipine dön', iptal: 'Vazgeç' });
      if (!tamam) return;
      eylem(dugme, () => AG.api.veriKalitesi.kip(m.dugme.kip), etkine ? 'Veri kalitesi: etkin kip açıldı' : 'Veri kalitesi: izleme kipine dönüldü');
    });
    return el('section', { class: 'p-kart mt-4', id: 'saglikVeriKalitesi' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Veri kalitesi' }), el('span', { class: `p-rozet ${m.rozet}`, text: m.kipAd })]),
      el('p', { class: 'hint hint-sm', text: `Günlük karardan önce botun girdileri denetlenir: vadeli ↔ spot BTC kapanışı (iki kaynak), mark fiyatı, hesap; karardan sonra coin evreni, kol mumları ve funding. ${m.aciklama}` }),
      m.izleme ? el('p', { class: `oz-sebep${m.doldu ? ' p-warn' : ''}`, id: 'vkIzleme' }, [el('strong', { text: m.etkin ? 'Kip: ' : 'İzleme: ' }), el('span', { text: m.izleme })]) : null,
      m.botlar.length ? el('ul', { class: 'oz-liste', id: 'vkBotlar' }, m.botlar.map(b => el('li', { class: 'oz-satir', 'data-bot': b.ad }, [
        el('div', { class: 'oz-govde' }, [
          el('div', { class: 'oz-ad-satir' }, [el('span', { class: 'oz-ad', text: GA(b) }), el('span', { class: `p-rozet ${b.ton}`, text: b.kipMetin })]),
          el('div', { class: 'oz-ayrinti', text: b.durum }),
          el('div', { class: 'oz-nasil', text: b.sayac }),
          ...b.bulgular.map(x => el('div', { class: 'oz-ayrinti df-soluk', text: x })),
        ]),
      ]))) : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: 'Veri kalitesi kapısı bağlı bot yok.' })]),
      el('div', { class: 'oz-bot-dugmeler' }, [dugme, el('a', { class: 'btn btn-secondary btn-sm no-underline', href: '#/kilavuz/sorun-giderme/veri-kalitesi' }, [el('span', { text: 'Kılavuz' })])]),
      m.yazilabilir ? null : el('p', { class: 'hint hint-sm mb-0', text: 'Kip yalnız sunucu bilgisayarındaki panelden değiştirilir.' }),
    ]);
  }

  /** 69.4 İkinci uyarı kanalı: Telegram düşerse ACİL uyarı ntfy ile telefona; ikinci ölü adam sunucu susarsa ayrı bir hizmetten uyarır. */
  let kanal = null;
  function kanalKarti(v) {
    const k = kanal || {};
    const sunucuda = v.calisiyor !== false;
    const ntfy = el('input', { type: 'text', id: 'inpOzNtfy', class: 'form-control', autocomplete: 'off', placeholder: k.ntfy && k.ntfy.ayarli ? `ayarlı (${k.ntfy.maske}) — değiştirmek için yazın` : 'ör. pusula-7k2q9x4mzt (tahmin edilemeyecek bir ad)' });
    const sinyal = el('input', { type: 'url', id: 'inpOzSinyal', class: 'form-control', autocomplete: 'off', placeholder: k.sinyal && k.sinyal.ayarli ? `ayarlı (${k.sinyal.maske})` : 'https://uptime.betterstack.com/api/v1/heartbeat/…' });
    const kaydet = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'btnOzKanalKaydet', disabled: sunucuda ? null : 'disabled' }, [el('span', { text: 'Kaydet' })]);
    const dene = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'btnOzKanalDene', disabled: sunucuda && k.ntfy && k.ntfy.ayarli ? null : 'disabled' }, [el('span', { text: 'ntfy\'a deneme gönder' })]);
    kaydet.addEventListener('click', () => {
      const g = {};
      if (ntfy.value.trim()) g.ntfyKonu = ntfy.value.trim();
      if (sinyal.value.trim()) g.sinyalUrl = sinyal.value.trim();
      if (!Object.keys(g).length) { bildir('Değiştirmek için bir alan doldurun', 'bilgi'); return; }
      eylem(kaydet, () => AG.api.saglikOz.ikinciKanalKaydet(g), 'İkinci kanal kaydedildi');
    });
    dene.addEventListener('click', () => eylem(dene, () => AG.api.saglikOz.ikinciKanalDene(), 'Deneme iletisi gönderildi — telefondaki ntfy uygulamasına bakın'));
    const son = (k.son || []).slice(-3).reverse();
    return el('section', { class: 'p-kart mt-4', id: 'saglikKanal' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'İkinci uyarı kanalı' }),
        el('span', { class: `p-rozet ${k.ntfy && k.ntfy.ayarli ? 'p-rozet-pos' : 'p-rozet-warn'}`, text: k.ntfy && k.ntfy.ayarli ? 'ntfy ayarlı' : 'ntfy yok' })]),
      el('p', { class: 'hint hint-sm', text: 'Telegram düşerse ACİL uyarılar ntfy ile telefona da gelir (ücretsiz, hesap gerekmez: telefona ntfy uygulamasını kurup aynı konuya abone olun). İkinci ölü adam, healthchecks\'ten bağımsız ikinci bir izleyicidir (ör. Better Stack ücretsiz heartbeat): sunucu susarsa oradan da uyarı gelir.' }),
      el('div', { class: 'oz-kanal-alanlar' }, [
        el('label', { class: 'form-group', for: 'inpOzNtfy' }, [el('span', { text: 'ntfy konusu' }), ntfy]),
        el('label', { class: 'form-group', for: 'inpOzSinyal' }, [el('span', { text: 'İkinci ölü adam adresi' }), sinyal]),
      ]),
      el('div', { class: 'oz-bot-dugmeler' }, [kaydet, dene]),
      son.length ? el('p', { class: 'hint hint-sm mb-0', text: `Son ntfy: ${son.map(x => `${saat(x.zaman)} ${x.ok ? 'gitti' : `gitmedi (${x.hata || '?'})`}`).join(' · ')}` }) : null,
      sunucuda ? null : el('p', { class: 'hint hint-sm mb-0', text: 'Bu bilgisayar geliştirme kopyası: ayar sunucudaki panelden yapılır.' }),
    ]);
  }

  function ciz() {
    const k = bul('saglikKok');
    if (!k || !veri) return;
    const simdi = Date.now();
    const yoklaDugme = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'btnOzYokla', disabled: veri.calisiyor === false ? 'disabled' : null }, [el('i', { 'data-lucide': 'refresh-cw' }), el('span', { text: 'Şimdi yokla' })]);
    yoklaDugme.addEventListener('click', () => eylem(yoklaDugme, () => AG.api.saglikOz.yokla(), 'Yoklandı'));
    const sorunluBot = (veri.botlar || []).filter(b => b.engel || b.guvenliKip);
    const olaylar = veri.olaylar || [];
    doldur(k, [
      el('div', { class: 'p-serit mb-4', id: 'saglikOzet' }, ozetModeli(veri, simdi).map(gosterge)),
      el('div', { class: 'row-between row-wrap gap-2 mb-4' }, [
        el('p', { class: 'hint mb-0', text: veri.calisiyor === false ? 'Bu bilgisayar geliştirme kopyası: öz denetim sunucuda çalışır.' : 'Pusula her 5 dakikada bir kendini yoklar; disk, yedek, sunucu bilgisayarı ve borsa duyuruları saatte bir.' }), yoklaDugme]),
      sorunluBot.length ? el('div', { class: 'oz-botlar mb-4', id: 'saglikBotlar' }, sorunluBot.map(botKarti)) : null,
      el('div', { class: 'oz-gruplar', id: 'saglikDenetimler' }, gruplaModeli(veri).map(gr => el('section', { class: 'p-kart oz-grup', 'data-grup': gr.kimlik }, [
        el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: gr.ad }),
          el('span', { class: `p-rozet${gr.hata ? ' p-rozet-neg' : gr.uyari ? ' p-rozet-warn' : ' p-rozet-pos'}`, text: gr.hata ? `${gr.hata} hata` : gr.uyari ? `${gr.uyari} uyarı` : `${gr.denetimler.length} denetim tamam` })]),
        el('ul', { class: 'oz-liste' }, gr.denetimler.map(d => denetimSatiri(d, simdi))),
      ]))),
      vkVeri ? veriKalitesiKarti(vkVeri, simdi) : null,
      el('section', { class: 'p-kart mt-4', id: 'saglikKayit' }, [
        el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Onarım ve olay kaydı · 30 gün' }), el('span', { class: 'df-soluk', text: `${olaylar.length} kayıt` })]),
        olaylar.length ? el('ul', { class: 'oz-olaylar' }, olaylar.slice(0, 60).map(x => {
          const [ad, ton] = OLAY_AD[x.tur] || [String(x.tur || '').toUpperCase(), ''];
          const d = (veri.denetimler || []).find(y => y.kimlik === x.kimlik);
          const bot = x.bot && (veri.botlar || []).find(b => b.ad === x.bot);
          return el('li', { class: 'oz-olay' }, [
            el('span', { class: 'oz-sag sayi', text: saat(x.zaman, simdi) }),
            el('span', { class: `p-rozet${ton ? ' p-rozet-' + ton : ''}`, text: ad }),
            el('span', { class: 'oz-olay-metin', text: [bot ? GA(bot) : null, d ? d.ad : x.kimlik, AG.botAd ? AG.botAd.cevir(x.metin) : x.metin].filter(Boolean).join(' · ') }),
          ]);
        })) : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: 'Son 30 günde onarım ya da olay yok.' })]),
      ]),
      karaKutuKarti(veri, simdi),
      kanalKarti(veri),
      el('details', { class: 'p-kart mt-4 oz-tetikler', id: 'saglikTetikler' }, [
        el('summary', { class: 'p-kart-baslik', text: 'Bot ne zaman tamamen kapanır' }),
        el('p', { class: 'hint hint-sm', text: 'Para kaybettirebilecek bir sebepte bot tamamen kapanır ve siz açana kadar kapalı kalır. Diğerlerinde yalnız yeni işlem açmaz (güvenli kip). Zarar sınırları (kill-switch, günlük zarar limiti) ayrıca ve aynen çalışır.' }),
        AG.tablo.kutulu({ id: 'tblOzTetik', sinif: 'p-tablo', basliklar: ['Sebep', 'Sonuç', 'Not'],
          satirlar: (veri.tetikler || []).map(t => el('tr', null, [el('td', { text: t.ad }),
            el('td', null, [el('span', { class: `p-rozet ${t.sonuc === 'tam' ? 'p-rozet-neg' : 'p-rozet-warn'}`, text: t.sonuc === 'tam' ? 'Tamamen kapanır' : 'Güvenli kip' })]),
            el('td', { class: 'df-soluk', text: t.not || '—' })])) }, 'p-tablo-kap'),
        el('p', { class: 'hint hint-sm mb-0', text: `Demo kipindeki bota (Kairos, demo kabul) ${String(veri.demoKorumaBitis || '').slice(0, 10) || '2026-12-09'} sonuna kadar öz denetim hiçbir şey yapmaz — yalnız haber verir.` }),
      ]),
    ]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  async function al() {
    let r;
    try { r = await AG.api.saglikOz.durum(); } catch (e) { r = { success: false, error: e.message }; }
    return r;
  }

  async function yukle() {
    const k = bul('saglikKok');
    const r = await al();
    if (!r || !r.success) {
      if (k) doldur(k, [AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Sağlık durumu okunamadı', yeniden: yukle })]);
      return null;
    }
    veri = r;
    rozetGuncelle(r);
    try { const kk = AG.api.saglikOz.ikinciKanal ? await AG.api.saglikOz.ikinciKanal() : null; kanal = kk && kk.success ? kk : null; } catch (e) { kanal = null; }
    try { const vv = AG.api.veriKalitesi ? await AG.api.veriKalitesi.durum() : null; vkVeri = vv && vv.success ? vv : null; } catch (e) { vkVeri = null; }   // 74.3
    ciz();
    return r;
  }

  /** Menü noktası: açılışta ve 5 dk'da bir (sayfa açık olmasa da). */
  async function rozetTazele() { const r = await al(); if (r && r.success) rozetGuncelle(r); }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-saglik') yukle(); });
    doc.addEventListener('DOMContentLoaded', () => {
      global.setTimeout(rozetTazele, 4000);
      global.setInterval(() => { if (AG.rota && AG.rota.acikMi('tab-saglik')) yukle(); else rozetTazele(); }, 5 * 60000);
    });
  }

  AG.pages = AG.pages || {};
  AG.pages.saglik = { yukle, ozetModeli, gruplaModeli, raporModeli, rozetTonu, rozetGuncelle, saat, nasilModeli, veriKalitesiModeli, KILAVUZ,
    _durum: { veriAyarla: (v) => { veri = v; }, vkAyarla: (v) => { vkVeri = v; } }, _ciz: { ciz } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.saglik;
})(typeof window !== 'undefined' ? window : globalThis);
