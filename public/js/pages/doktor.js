/**
 * SİSTEM › PUSULA DOKTORU — 78.1 F1 `AG.pages.doktor` (lib/doktor/*, lib/sunucu/doktorUclari.js)
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/doktor: (1) özet + hazır olma (GET /api/hazir ile aynı hesap), (2) teşhis kartları — Sorun merkezi kartları sade dille + Doktor'un
 * kendi kuralları (D1 konsol günlüğü, D2 geçici tatbikat artığı, D3 bayat kilit, D10 hazır olma): "şu an ne bozuk · anlamı ne · kendiliğinden
 * düzelir mi · siz ne yapmalısınız · rehber", (3) onarım günlüğü — Pusula'nın kendiliğinden yaptığı onarımlar (kayıtlardan; 1 / 7 / 30 gün),
 * (4) bakım durumu, (5) Doktor ne yapar / ne yapmaz (K1/K2) + kendiliğinden onarımlar listesi.
 * SALT OKUMA: bu sayfada işlem düğmesi YOK (telefonda da aynı). Araştırma kopyasında sunucunun Doktor'u okunur (yanıtta evKaynak).
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

  function ciz() {
    const k = bul('doktorKok');
    if (!k || !veri) return;
    doldur(k, [ozetCiz(veri), teshisCiz(veri), onarimCiz(veri), bakimCiz(veri), sinirCiz(veri)]);
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
  AG.pages.doktor = { yukle, zaman, sure, hazirModeli, onarimModeli, _durum: { durum, veriAyarla: (v) => { veri = v; } }, _ciz: { ciz } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.doktor;
})(typeof window !== 'undefined' ? window : globalThis);
