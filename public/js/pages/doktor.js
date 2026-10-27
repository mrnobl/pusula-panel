/**
 * SİSTEM › PUSULA DOKTORU — 78.1 F1 `AG.pages.doktor` (lib/doktor/*, lib/sunucu/doktorUclari.js)
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/doktor: (1) özet + hazır olma (GET /api/hazir ile aynı hesap), (2) teşhis kartları — Sorun merkezi kartları sade dille + Doktor'un
 * kendi kuralları (D1 konsol günlüğü, D2 geçici tatbikat artığı, D3 bayat kilit, D10 hazır olma): "şu an ne bozuk · anlamı ne · kendiliğinden
 * düzelir mi · siz ne yapmalısınız · rehber", (3) onarım günlüğü — Pusula'nın kendiliğinden yaptığı onarımlar (kayıtlardan; 1 / 7 / 30 gün),
 * (4) bakım durumu, (5) Doktor ne yapar / ne yapmaz (K1/K2) + kendiliğinden onarımlar listesi.
 * (6) 78.2 ONARIM MOTORU (#doktorMotor): kip (gölge / etkin / kapalı), gölge gün sayacı, kurallar (D4 D5 D6 D7: tetik var mı, neden yapmadı,
 * son karar), "şunu yapardım" listesi, etkin kayıtlar, devirler, ortak sınırlar. Düğmeler — YALNIZ bunlar yazar:
 *   "Etkin kipe geç…"   yalnız bu bilgisayarda (telefonda gizli; sunucu da 403): önizleme + ONAR yazma → sunucu yerel PIN ister (api.js PIN penceresi)
 *   "İzleme kipine dön" / "Kapat" / "İzleme kipini aç"   PIN'siz, telefonda da (güvenli yön)
 *   kural "Aç" (yerel PIN) / "Kapat" (PIN'siz) — yalnız bu bilgisayarda
 * Araştırma kopyasında (sunucudan okunan sayfa) düğme yok: değişiklik sunucudaki panelden ya da telefondan.
 * Teşhis kartlarında ve onarım günlüğünde işlem düğmesi YOK. Araştırma kopyasında sunucunun Doktor'u okunur (yanıtta evKaynak).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const botAdi = (k) => (k && AG.botAd && AG.botAd.ad(k)) || k || '';

  const SINIF = { mudahale: 's-bad', dikkat: 's-warn', gecici: 's-info', bilgi: 's-info' };
  const ROZET = { mudahale: 'p-rozet-neg', dikkat: 'p-rozet-warn', gecici: 'p-rozet-info', bilgi: 'p-rozet-info' };
  const DURUM_AD = { iyi: 'Her şey yolunda', dikkat: 'Bakmanız iyi olur', mudahale: 'Sizin bir adımınız gerekiyor', bilinmiyor: 'Teşhis eksik' };
  const DURUM_TON = { iyi: 'tone-success', dikkat: 'tone-warning', mudahale: 'tone-danger', bilinmiyor: 'tone-warning' };
  const BOT_DURUM = { hazir: ['hazır', 'p-rozet-pos'], durdu: ['durduruldu', ''], engel: ['ENGEL', 'p-rozet-neg'], 'guvenli-kip': ['güvenli kip', 'p-rozet-warn'],
    'bagli-degil': ['bağlı değil', 'p-rozet-warn'], gecikti: ['gecikti', 'p-rozet-warn'], bilinmiyor: ['okunamadı', 'p-rozet-warn'] };
  const SONUC_TON = { onarildi: 'p-rozet-pos', duzeldi: 'p-rozet-info', koruma: 'p-rozet-warn', olmadi: 'p-rozet-neg', atlandi: '' };
  const KURAL_TON = { var: 'p-rozet-warn', yok: 'p-rozet-pos', bilinmiyor: '' };
  const KURAL_AD = { var: 'var', yok: 'yok', bilinmiyor: 'bilinmiyor' };
  const GUNLER = [['1', 'Bugün'], ['7', 'Son 7 gün'], ['30', 'Son 30 gün']];
  const durum = { gun: '7', ornek: false };   // ornek: kılavuz görüntüsü (GET /api/doktor?ornek=1, yalnız SORUN_ORNEK=1 sunucuda)
  let veri = null;

  /** 1792000000000 → "25.10 14:03" (yerel saat). */
  function zaman(ms) {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return '—';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function sure(sn) {
    if (!Number.isFinite(sn)) return '—';
    if (sn < 3600) return `${Math.max(1, Math.round(sn / 60))} dk`;
    if (sn < 172800) return `${String(Math.round(sn / 360) / 10).replace('.', ',')} saat`;
    return `${Math.round(sn / 86400)} gün`;
  }
  const mb = (b) => (Number.isFinite(b) ? `${String(Math.round(b / 1048576 * 10) / 10).replace('.', ',')} MB` : 'yok');

  /** Saf: hazır özeti → satır modelleri (özet kartı). */
  function hazirModeli(h) {
    if (!h) return { hazir: null, metin: 'hazır olma bilgisi yok', satirlar: [], botlar: [] };
    const satirlar = [
      { ad: 'Pusula süreci', deger: h.surec ? `${h.surec.metin}${h.surec.surum ? ` · sürüm ${h.surec.surum}` : ''}` : '—' },
      { ad: 'Öz denetim', deger: h.ozDenetim ? h.ozDenetim.metin : '—' },
    ];
    const botlar = (h.botlar || []).map(b => {
      const [ad, ton] = BOT_DURUM[b.durum] || [b.durum, ''];
      const sk = b.sonKarar && Number.isFinite(b.sonKarar.yasSaat) ? `son karar ${b.sonKarar.yasSaat < 1 ? 'bir saatten yeni' : `${String(b.sonKarar.yasSaat).replace('.', ',')} saat önce`}` : 'son karar —';
      return { ad: b.ad, adGorunen: b.adGorunen || botAdi(b.ad), durumAd: ad, ton, metin: b.durum === 'hazir' ? sk : `${b.metin}${b.sonKarar ? ` · ${sk}` : ''}` };
    });
    return { hazir: h.hazir, metin: h.metin, satirlar, botlar };
  }

  function ozetCiz(v) {
    const o = v.ozet || {};
    const h = hazirModeli(v.hazir);
    const s = o.sayilar || {};
    return el('section', { class: 'p-kart', id: 'doktorOzet' }, [
      el('div', { class: 'p-kart-bas' }, [
        el('h3', { class: 'p-kart-baslik' }, [el('span', { class: DURUM_TON[o.durum] || '', text: DURUM_AD[o.durum] || 'Teşhis' })]),
        el('span', { class: 'df-soluk', text: `${v.ornek ? 'ÖRNEK (kılavuz görüntüsü) · ' : ''}${v.rol === 'arastirma' ? 'araştırma kopyası · ' : ''}${v.sunucudan ? 'sunucudan okundu · ' : ''}${zaman(v.zaman)}` }),
      ]),
      el('p', { class: 'mb-3', text: o.metin || '' }),
      el('div', { class: 'sorun-ne mb-3' }, [
        el('div', null, [el('b', { text: 'Müdahale' }), el('span', { text: String(s.mudahale || 0) })]),
        el('div', null, [el('b', { text: 'Dikkat' }), el('span', { text: String(s.dikkat || 0) })]),
        el('div', null, [el('b', { text: 'Kendiliğinden geçecek' }), el('span', { text: String((s.gecici || 0) + (s.bilgi || 0)) })]),
        el('div', null, [el('b', { text: 'Bugün kendiliğinden düzelen' }), el('span', { text: String((v.onarim && v.onarim.bugun) || 0) })]),
      ]),
      el('div', { id: 'doktorHazir' }, [
        el('p', { class: 'mb-2' }, [el('strong', { class: h.hazir === false ? 'tone-warning' : h.hazir === true ? 'tone-success' : '', text: h.metin })]),
        el('ul', { class: 'hint hint-sm mb-2' }, h.satirlar.map(x => el('li', null, [el('strong', { text: `${x.ad}: ` }), el('span', { text: x.deger })]))),
        h.botlar.length ? el('div', { class: 'gl-suzgec', id: 'doktorBotlar' }, h.botlar.map(b => el('span', { class: 'p-rozet-kutu', 'data-bot': b.ad }, [
          el('span', { class: `p-rozet ${b.ton}`, text: `${b.adGorunen}: ${b.durumAd}` }), el('span', { class: 'df-soluk', text: ` ${b.metin}` })]))) : null,
      ]),
    ]);
  }

  function kartCiz(k) {
    const g = k.kendiliginden || {};
    return el('section', { class: `sorun-kart ${SINIF[k.ciddiyet] || ''}`, id: `doktor-${String(k.kimlik).replace(/[^a-z0-9-]/gi, '-')}`, 'data-kaynak': k.kaynak }, [
      el('div', { class: 'sorun-bas' }, [
        el('h3', { class: 'sorun-baslik', text: k.baslik }),
        el('div', { class: 'sorun-rozetler' }, [
          k.kaynak === 'doktor' ? el('span', { class: 'p-rozet p-rozet-vurgu', text: 'Doktor' }) : null,
          el('span', { class: `p-rozet ${ROZET[k.ciddiyet] || ''}`, text: k.ciddiyetAd || k.ciddiyet }),
        ]),
      ]),
      el('div', { class: 'sorun-ne' }, [
        el('div', null, [el('b', { text: 'Şu an ne bozuk' }), el('span', { text: k.neOldu || '—' })]),
        el('div', null, [el('b', { text: 'Bunun anlamı' }), el('span', { text: k.anlami || '—' })]),
        el('div', null, [el('b', { text: 'Kendiliğinden düzelir mi' }), el('span', { text: g.metin || (g.evet ? 'Evet' : 'Hayır') }), g.kalkis ? el('span', { class: 'sorun-kalkis', text: ` ${g.kalkis}` }) : null]),
      ]),
      (k.yapin || []).length ? el('div', null, [el('strong', { text: 'Siz ne yapmalısınız' }), el('ol', { class: 'sorun-adim' }, k.yapin.map(a => el('li', { text: a })))]) : null,
      k.dokunmayin ? el('p', { class: 'sorun-dokunma' }, [el('strong', { text: 'Dokunmayın: ' }), el('span', { text: k.dokunmayin })]) : null,
      el('div', { class: 'sorun-dugmeler' }, [
        k.rehber ? el('a', { class: 'btn btn-secondary btn-sm no-underline', href: k.rehber }, [el('i', { 'data-lucide': 'book-open' }), el('span', { text: 'Rehber' })]) : null,
        k.sorunlarda ? el('a', { class: 'btn btn-secondary btn-sm no-underline', href: '#/sorunlar' }, [el('i', { 'data-lucide': 'life-buoy' }), el('span', { text: 'Sorunlar sayfasında aç' })]) : null,
      ]),
    ]);
  }

  function teshisCiz(v) {
    const l = v.kartlar || [];
    return el('section', { class: 'mb-4', id: 'doktorTeshis' }, [
      el('h3', { class: 'p-kart-baslik mb-3', text: 'Teşhis' }),
      l.length ? el('div', { class: 'sorun-liste' }, l.map(kartCiz))
        : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: 'Şu an bozuk bir şey yok. Ekrana bakıp beklemenize gerek yok.' })]),
    ]);
  }

  /** Saf: onarım satırı → tablo modeli. */
  function onarimModeli(x) {
    return { zaman: zaman(x.z), sonuc: x.sonucAd || x.sonuc, ton: SONUC_TON[x.sonuc] || '', bot: x.bot ? botAdi(x.bot) : '—', baslik: x.baslik, ayrinti: x.ayrinti || '' };
  }

  function onarimCiz(v) {
    const o = v.onarim || { satirlar: [] };
    const sec = el('select', { id: 'selDoktorGun', class: 'form-control', onchange: (e) => { durum.gun = e.target.value; yukle(); } }, GUNLER.map(([k, ad]) => el('option', { value: k, text: ad })));
    sec.value = durum.gun;
    const s = o.sayilar || {};
    return el('section', { class: 'p-kart mb-4', id: 'doktorOnarim' }, [
      el('div', { class: 'p-kart-bas' }, [
        el('h3', { class: 'p-kart-baslik', text: `Kendiliğinden yapılan onarımlar (${o.toplam || 0})` }),
        el('label', { class: 'form-group gl-alan' }, [el('span', { text: 'Zaman' }), sec]),
      ]),
      el('p', { class: 'hint hint-sm', text: `Pusula'nın kendi kayıtlarından (olay akışı, günlük, Doktor sicili) toplanır — Doktor bu listeye bir şey eklemek için ayrıca kayıt yazmaz. ${s.onarildi || 0} kendisi onardı · ${s.duzeldi || 0} kendiliğinden düzeldi · ${s.koruma || 0} koruyucu adım · ${s.olmadi || 0} olmadı.` }),
      (o.satirlar || []).length ? AG.tablo.kutulu({ id: 'tblDoktorOnarim', sinif: 'p-tablo gl-tablo', basliklar: ['Zaman', 'Sonuç', 'Bot', 'Ne oldu'],
        satirlar: o.satirlar.map(x => { const m = onarimModeli(x); return el('tr', null, [
          el('td', { class: 'sayi gl-zaman', text: m.zaman }),
          el('td', null, [el('span', { class: `p-rozet ${m.ton}`, text: m.sonuc })]),
          el('td', { class: 'df-soluk', text: m.bot }),
          el('td', { class: 'gl-mesaj' }, [el('span', { text: m.baslik }), m.ayrinti ? el('span', { class: 'df-soluk', text: ` · ${m.ayrinti}` }) : null]),
        ]); }) }, 'p-tablo-kap')
        : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: 'Bu sürede kendiliğinden yapılmış bir onarım kaydı yok.' })]),
    ]);
  }

  function bakimCiz(v) {
    const b = v.bakim || {};
    const kural = v.kurallar || [];
    const sd = b.sonDondurme, st = b.sonTemizlik;
    return el('section', { class: 'p-kart mb-4', id: 'doktorBakim' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Doktor\'un kendi denetimleri ve bakımı' })]),
      AG.tablo.kutulu({ id: 'tblDoktorKural', sinif: 'p-tablo', basliklar: ['Kural', 'Durum', 'Ayrıntı', 'Ne yapar'],
        satirlar: kural.map(r => el('tr', null, [
          el('td', { text: `${r.kimlik} · ${r.ad}` }),
          el('td', null, [el('span', { class: `p-rozet ${KURAL_TON[r.durum] || ''}`, text: KURAL_AD[r.durum] || r.durum })]),
          el('td', { class: 'df-soluk', text: r.ayrinti || '—' }),
          el('td', { class: 'df-soluk', text: r.eylem }),
        ])) }, 'p-tablo-kap'),
      el('ul', { class: 'hint hint-sm mt-3 mb-0' }, [
        el('li', { text: `Konsol günlükleri: ${(b.gunlukler || []).map(g => `${g.ad} ${mb(g.boyut)}`).join(' · ') || 'okunamadı'} (sınır ${b.esik ? b.esik.gunlukMB : 20} MB, en çok ${b.esik ? b.esik.kopya : 3} eski kopya).` }),
        el('li', { text: `Son döndürme: ${sd ? `${zaman(sd.z)} — ${sd.dosya || ''} ${sd.sonuc === 'dondu' ? 'döndürüldü' : `atlandı (${sd.neden || ''})`}` : 'yok (gerek olmadı)'}.` }),
        el('li', { text: `Geçici tatbikat artıkları: ${b.artiklar ? `${b.artiklar.sayi} silinecek, ${b.artiklar.genc} yeni (24 saatten genç, dokunulmaz)` : 'okunamadı'} · son temizlik: ${st ? `${zaman(st.z)} (${st.sayi || 0} klasör)` : 'yok'}.` }),
        el('li', { text: 'Bakım işleri TR 02:30–04:30 arası yapılmaz (botların karar saati).' }),
      ]),
    ]);
  }

  function sinirCiz(v) {
    const s = v.sinirlar || { yapar: [], yapmaz: [] };
    return el('section', { class: 'p-kart mb-4', id: 'doktorSinir' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Doktor ne yapar, ne yapmaz' })]),
      el('div', { class: 'sorun-ne' }, [
        el('div', null, [el('b', { text: 'Yapar' }), el('ul', { class: 'mb-0' }, (s.yapar || []).map(x => el('li', { text: x })))]),
        el('div', null, [el('b', { text: 'Yapmaz' }), el('ul', { class: 'mb-0' }, (s.yapmaz || []).map(x => el('li', { text: x })))]),
      ]),
      el('details', { class: 'mt-3', id: 'doktorTurler' }, [
        el('summary', { text: `Pusula'nın kendiliğinden yaptığı onarımlar (${(v.onarimTurleri || []).length})` }),
        el('ul', { class: 'hint hint-sm mb-0' }, (v.onarimTurleri || []).map(t => el('li', null, [el('strong', { text: `${t.ad}: ` }), el('span', { text: t.ne })]))),
      ]),
    ]);
  }

  // ── 78.2 ONARIM MOTORU ────────────────────────────────────────────────────────
  const KIP_TON = { golge: 'p-rozet-info', etkin: 'p-rozet-pos', kapali: '' };
  const KIP_AD = { golge: 'gölge (izleme)', etkin: 'etkin', kapali: 'kapalı' };
  const KARAR_AD = { yapardim: ['yapardım', 'p-rozet-info'], 'golge-sonra': ['sonra', ''], yapildi: ['yaptı', 'p-rozet-pos'], dogrulandi: ['düzeldi', 'p-rozet-pos'],
    olmadi: ['olmadı', 'p-rozet-neg'], atlandi: ['atlandı', ''], devretti: ['size devretti', 'p-rozet-neg'] };
  const telefonMu = () => !!(AG.api && AG.api.kademe && AG.api.kademe() === 'telefon');
  /** Sunucudan okunan sayfada (araştırma kopyası) yazma yok — değişiklik sunucuda. */
  const yazilabilir = (v) => !!v && !v.sunucudan && v.rol !== 'arastirma';
  const kisaOnce = (o) => {
    if (!o || typeof o !== 'object') return '';
    const p = [];
    if (o.hata) p.push(o.hata);
    if (o.veriGunu) p.push(`veri ${o.veriGunu} tarihine kadar`);
    if (Number.isFinite(o.saat)) p.push(`${String(o.saat).replace('.', ',')} saattir yazmıyor`);
    if (o.bekleme) p.push(`${o.kuyruk || '?'} ileti ${o.bekleme} bekliyor`);
    if (o.sorun) p.push(o.sorun);
    return p.join(' · ');
  };

  /** Saf: "şunu yapardım" / etkin kayıt satırı → tablo modeli. */
  function motorSatirModeli(x) {
    const [ad, ton] = KARAR_AD[x.karar] || [x.karar, ''];
    let ne;
    if (x.karar === 'golge-sonra') ne = x.sonuc === 'gecti' ? 'sorun kendiliğinden geçti (Doktor bir şey yapmadan)' : 'sorun sürüyordu';
    else if (x.karar === 'yapardim') ne = `${x.kuralAd || x.kural}${kisaOnce(x.once) ? ` — gördüğü: ${kisaOnce(x.once)}` : ''}`;
    else ne = `${x.kuralAd || x.kural}${x.sonra && x.sonra.ayrinti ? ` — ${x.sonra.ayrinti}` : ''}${x.neden ? ` — ${x.neden}` : ''}`;
    return { zaman: zaman(x.z), karar: ad, ton, hedef: x.hedefAd || x.hedef || '—', ne };
  }
  /** Saf: motor özeti → düğme listesi (kademe + kip'e göre). Telefonda YALNIZ izleme / kapalı kipine dönüş. */
  function motorDugmeleri(m, { telefon = false, yazilir = true } = {}) {
    if (!m || !yazilir) return [];
    const l = [];
    if (m.kip !== 'etkin' && !telefon) l.push({ kimlik: 'etkin', metin: 'Etkin kipe geç…', birincil: true });
    if (m.kip === 'etkin') l.push({ kimlik: 'golge', metin: 'İzleme kipine dön', birincil: true });
    if (m.kip === 'kapali') l.push({ kimlik: 'golge', metin: 'İzleme kipini aç' });
    if (m.kip !== 'kapali') l.push({ kimlik: 'kapali', metin: 'Kapat' });
    return l;
  }

  async function kipDugmesi(kimlik) {
    const m = veri && veri.motor;
    if (!m) return;
    let r;
    if (kimlik === 'etkin') {
      const o = m.onizleme || {};
      const ac = (o.acikKurallar || []).map(x => `${x.ad} — ${x.sinir}`).join(' · ') || 'açık kural yok';
      const kapali = (o.kapaliKurallar || []).map(x => x.ad).join(', ');
      const g = m.golge || {};
      const cevap = await AG.bildirim.onayla({ baslik: 'Onarım motoru etkin kipe geçsin mi?', tehlikeli: true, onay: 'Etkin kipe geç',
        metin: `Etkin kipte Doktor şu kuralları sınırları içinde KENDİLİĞİNDEN uygular: ${ac}.${kapali ? ` Kapalı kalanlar: ${kapali}.` : ''} Ortak sınırlar: ${(o.sinirlar || []).join(' ')} Gölgede son 7 günde ${g.yapardim || 0} kez "yapardım" dedi. Telefondan "İzleme kipine dön" ile hemen durdurabilirsiniz. Ardından acil PIN sorulur.`,
        alanlar: [{ ad: 'onay', etiket: `Onay için ${o.onay || 'ONAR'} yazın`, ipucu: o.onay || 'ONAR', dogrula: (s) => s.trim().toLocaleUpperCase('tr-TR') === (o.onay || 'ONAR') }] });
      if (!cevap) return;
      r = await AG.api.doktor.etkin(cevap.onay);
    } else {
      if (kimlik === 'kapali' && !(await AG.bildirim.onayla({ baslik: 'Onarım motoru kapatılsın mı?', metin: 'Kapalıyken Doktor ne izler ne yapar ("yapardım" kaydı da düşmez). Teşhis ve bakım işleri sürer. İstediğiniz zaman PIN\'siz yeniden açabilirsiniz.', onay: 'Kapat' }))) return;
      r = await AG.api.doktor.kip(kimlik);
    }
    AG.bildirim.bildir(r && r.success ? `Onarım motoru: ${KIP_AD[r.motor && r.motor.kip] || 'güncellendi'}` : `Olmadı: ${(r && r.error) || 'yanıt yok'}`, r && r.success ? 'ok' : 'hata');
    if (r && r.success) { veri.motor = r.motor; ciz(); }
  }
  async function kuralDugmesi(kural, ac) {
    const r = ac ? await AG.api.doktor.kuralAc(kural) : await AG.api.doktor.kuralKapat(kural);
    AG.bildirim.bildir(r && r.success ? `${kural} ${ac ? 'açıldı' : 'kapatıldı'}` : `Olmadı: ${(r && r.error) || 'yanıt yok'}`, r && r.success ? 'ok' : 'hata');
    if (r && r.success) { veri.motor = r.motor; ciz(); }
  }

  function motorCiz(v) {
    const m = v.motor;
    if (!m) return el('section', { class: 'p-kart mb-4', id: 'doktorMotor' }, [el('h3', { class: 'p-kart-baslik', text: 'Onarım motoru' }), el('p', { class: 'hint hint-sm mb-0', text: 'Onarım motoru bilgisi yok (sunucu eski sürüm olabilir).' })]);
    const telefon = telefonMu();
    const yazilir = yazilabilir(v);
    const g = m.golge || {};
    const kipMetni = m.kip === 'golge'
      ? `Gölge kipi — Doktor yalnız izler: sorun görünce "şunu yapardım" diye yazar, HİÇBİR şey yapmaz. ${g.doldu ? `${g.gunSiniri} günlük gölge süresi doldu (${String(g.gun).replace('.', ',')}. gün) — listeye bakıp karar verin; Pusula kipi kendisi değiştirmez.` : `Gölge ${String(g.gun != null ? g.gun : 0).replace('.', ',')}. gün / ${g.gunSiniri || 7} (kalan ${g.kalanGun != null ? g.kalanGun : '?'} gün).`}`
      : m.kip === 'etkin' ? 'Etkin kip — açık kurallar sınırları içinde kendiliğinden uygulanır. Her deneme aşağıda ve onarım günlüğünde görünür. "İzleme kipine dön" hemen durdurur (telefondan da, PIN\'siz).'
        : 'Kapalı — Doktor onarım için ne izler ne yapar. Teşhis ve bakım işleri sürer.';
    const dugmeler = motorDugmeleri(m, { telefon, yazilir });
    const kuralSatir = (r) => {
      const [dAd, dTon] = r.durum === 'var' ? ['tetik var', 'p-rozet-warn'] : r.durum === 'yok' ? ['tetik yok', 'p-rozet-pos'] : ['bilinmiyor', ''];
      const son = r.sonKarar ? `${zaman(r.sonKarar.z)} ${(KARAR_AD[r.sonKarar.karar] || [r.sonKarar.karar])[0]}` : '—';
      const dugme = yazilir && !telefon ? el('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-kural': r.kimlik, text: r.acik ? 'Kapat' : 'Aç (PIN)', onclick: () => kuralDugmesi(r.kimlik, !r.acik) }) : null;
      return el('tr', { 'data-kural': r.kimlik }, [
        el('td', null, [el('strong', { text: `${r.kimlik} · ${r.ad}` }), el('div', { class: 'df-soluk', text: r.eylem })]),
        el('td', null, [el('span', { class: `p-rozet ${r.acik ? 'p-rozet-pos' : ''}`, text: r.acik ? 'açık' : 'kapalı' })]),
        el('td', null, [el('span', { class: `p-rozet ${dTon}`, text: dAd }), el('div', { class: 'df-soluk', text: `${r.ayrinti || ''}${r.bekleyen ? ` · yapmadı: ${r.bekleyen}` : ''}` })]),
        el('td', { class: 'df-soluk', text: son }),
        el('td', { class: 'df-soluk' }, [el('span', { text: r.sinir }), el('div', null, [el('a', { href: r.kilavuz, text: `Rehber ${r.rehber}` })])]),
        el('td', null, [dugme]),
      ]);
    };
    const yapardim = m.yapardim || [];
    const etkinKayit = m.etkinKayit || [];
    const tablo = (id, l) => AG.tablo.kutulu({ id, sinif: 'p-tablo gl-tablo', basliklar: ['Zaman', 'Karar', 'Hedef', 'Ne'],
      satirlar: l.map(x => { const s = motorSatirModeli(x); return el('tr', null, [el('td', { class: 'sayi gl-zaman', text: s.zaman }), el('td', null, [el('span', { class: `p-rozet ${s.ton}`, text: s.karar })]), el('td', { class: 'df-soluk', text: s.hedef }), el('td', { class: 'gl-mesaj', text: s.ne })]); }) }, 'p-tablo-kap');
    return el('section', { class: 'p-kart mb-4', id: 'doktorMotor', 'data-kip': m.kip }, [
      el('div', { class: 'p-kart-bas' }, [
        el('h3', { class: 'p-kart-baslik', text: 'Onarım motoru' }),
        el('span', { class: `p-rozet ${KIP_TON[m.kip] || ''}`, id: 'doktorMotorKip', text: KIP_AD[m.kip] || m.kip }),
      ]),
      el('p', { class: 'mb-2', text: kipMetni }),
      m.kip === 'golge' ? el('p', { class: 'hint hint-sm mb-2', text: `Son 7 gün: ${g.yapardim || 0} kez "yapardım" · ${g.gecti || 0} tanesinde sorun kendiliğinden geçti · ${g.suruyor || 0} tanesinde sürüyordu.` }) : null,
      dugmeler.length ? el('div', { class: 'sorun-dugmeler mb-3', id: 'doktorMotorDugmeler' }, dugmeler.map(d => el('button', { type: 'button', class: `btn ${d.birincil ? 'btn-primary' : 'btn-secondary'} btn-sm`, 'data-kip': d.kimlik, text: d.metin, onclick: () => kipDugmesi(d.kimlik) })))
        : el('p', { class: 'hint hint-sm mb-3', text: !yazilir ? 'Bu sayfa sunucudan okunuyor — değişiklik sunucudaki panelden (ya da telefondan izleme kipine dönüş).' : telefon ? 'Telefondan yalnız izleme kipine dönülür; etkin kipe geçiş sunucudaki panelden.' : '' }),
      (m.devirler || []).length ? el('div', { class: 'mb-3', id: 'doktorDevirler' }, m.devirler.map(x => el('section', { class: 'sorun-kart s-bad' }, [
        el('div', { class: 'sorun-bas' }, [el('h3', { class: 'sorun-baslik', text: `Size devredildi: ${x.ad} — ${x.hedefAd}` })]),
        el('p', { class: 'mb-0', text: `${zaman(x.z)} · art arda ${x.ardisik} deneme olmadı${x.neden ? ` (${x.neden})` : ''}. Onarım Rehberi › ${x.rehber}. Doktor ${zaman(x.yenidenDeneme)} sonrası bir kez daha dener.` }),
      ]))) : null,
      AG.tablo.kutulu({ id: 'tblDoktorMotorKural', sinif: 'p-tablo', basliklar: ['Kural', 'Açık mı', 'Şu an', 'Son karar', 'Sınır', ''], satirlar: (m.kurallar || []).map(kuralSatir) }, 'p-tablo-kap'),
      el('h4', { class: 'mt-3 mb-2', text: `Şunu yapardım (gölge kaydı, ${yapardim.length})` }),
      yapardim.length ? tablo('tblDoktorYapardim', yapardim) : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: 'Henüz "yapardım" kaydı yok — Doktor bir sorun görmedi ya da sınırlar izin vermedi.' })]),
      etkinKayit.length ? el('h4', { class: 'mt-3 mb-2', text: `Etkin kipte yaptıkları (${etkinKayit.length})` }) : null,
      etkinKayit.length ? tablo('tblDoktorEtkin', etkinKayit) : null,
      el('details', { class: 'mt-3', id: 'doktorMotorSinir' }, [
        el('summary', { text: 'Ortak sınırlar ve asla yapmadıkları' }),
        el('ul', { class: 'hint hint-sm' }, (m.sinirlar || []).map(x => el('li', { text: x }))),
        el('ul', { class: 'hint hint-sm' }, (m.asla || []).map(x => el('li', { text: x }))),
        el('p', { class: 'hint hint-sm mb-0', text: `Sessiz saatte yeniden başlatma kuralı YOK: ${((m.d8 && m.d8.elenen) || []).map(x => `${x.belirti} (${x.neden})`).join(' · ')}` }),
      ]),
    ]);
  }

  function ciz() {
    const k = bul('doktorKok');
    if (!k || !veri) return;
    doldur(k, [ozetCiz(veri), teshisCiz(veri), onarimCiz(veri), motorCiz(veri), bakimCiz(veri), sinirCiz(veri)]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  async function yukle(o = {}) {
    const k = bul('doktorKok');
    if (!k) return;
    if (o && o.ornek) durum.ornek = true;
    let r;
    try { r = await AG.api.doktor.durum(durum.gun, durum.ornek); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(k, [AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Pusula Doktoru okunamadı', yeniden: yukle })]); return; }
    veri = r;
    if (r.evKaynak) veri.sunucudan = r.evKaynak;
    ciz();
  }

  if (doc && doc.addEventListener) doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-doktor') yukle(); });

  AG.pages = AG.pages || {};
  AG.pages.doktor = { yukle, zaman, sure, hazirModeli, onarimModeli, motorSatirModeli, motorDugmeleri, _durum: { durum, veriAyarla: (v) => { veri = v; } }, _ciz: { ciz, motorCiz } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.doktor;
})(typeof window !== 'undefined' ? window : globalThis);
