/**
 * SİSTEM › OLAY AKIŞI — B2 (TASARIM-MAKINE-HESAP-BOT §8.1, PLAN-MAKINE-HESAP-BOT §8 s1) `AG.pages.olaylar`
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/olaylar (lib/olayAkisi.js): bütün makinelerin olayları tek zaman çizelgesinde — emir, uyarı, başlat/durdur, sorun, bildirim,
 * ayar, güncelleme, makine, model kararı. Süzgeç: tür (sayılarıyla), bot, makine, önem, tarih, arama; "Daha eski" sayfalar. 1 yıl saklanır.
 * SALT OKUMA (telefonda da aynı). Geliştirme bilgisayarında sunucunun akışı bu bilgisayarınkiyle birleşir.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const tr = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('tr-TR') : '—');
  const botAdi = (k) => (k && AG.botAd && AG.botAd.ad(k)) || k || '';

  const TUR_AD = { emir: 'Emir', karar: 'Karar', baslat: 'Başlat', durdur: 'Durdur', uyari: 'Uyarı', sorun: 'Sorun', bildirim: 'Bildirim', ayar: 'Ayar',
    guncelleme: 'Güncelleme', makine: 'Makine', tasima: 'Taşıma', devralma: 'Devralma', tatbikat: 'Tatbikat', aktarim: 'Aktarım' };
  const CIDDIYET_TON = { alarm: 'neg', uyari: 'warn', bilgi: '' };
  const TUR_TON = { emir: 'info', karar: 'info', baslat: 'pos', durdur: 'warn' };
  const ZAMANLAR = [['1', 'Bugün'], ['3', 'Son 3 gün'], ['7', 'Son 7 gün'], ['30', 'Son 30 gün'], ['90', 'Son 90 gün'], ['365', 'Son 1 yıl']];
  const ONEM = [['', 'Hepsi'], ['uyari', 'Uyarı ve alarm'], ['alarm', 'Yalnız alarm']];
  const suzgec = { tur: '', bot: '', makine: '', ciddiyet: '', gun: '7', ara: '' };
  let veri = null;
  let ekler = [];          // "Daha eski" ile gelen sayfalar
  let araZaman = null;

  const gStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  /** Saf: "Son N gün" → { bas, bit } (yerel gün; bugün dahil). */
  function aralik(gun, bugun = new Date()) {
    const n = Math.max(1, Number(gun) || 7);
    const b = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate(), 12);
    const a = new Date(b); a.setDate(a.getDate() - (n - 1));
    return { bas: gStr(a), bit: gStr(b) };
  }
  /** Saf: süzgeç → sorgu nesnesi. */
  function sorgu(s = suzgec, ek = {}) {
    const q = { ...aralik(s.gun), n: '200' };
    for (const a of ['tur', 'bot', 'makine', 'ciddiyet', 'ara']) if (s[a]) q[a] = s[a];
    return { ...q, ...ek };
  }
  /** 1792000000000 → "25.10 14:03" (yerel saat). */
  function zaman(ms) {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return '—';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  /** Saf: yanıt → tür çipleri [{ id, ad, adet, secili }] (yalnız adedi olanlar + seçili). */
  function turCipleri(v, secili = suzgec.tur) {
    const s = (v && v.sayilar) || {};
    return Object.keys(TUR_AD).filter(t => s[t] || t === secili).map(t => ({ id: t, ad: TUR_AD[t], adet: s[t] || 0, secili: t === secili }));
  }
  /** Saf: satır → tablo hücreleri için model. */
  function satirModeli(x, cokMakine) {
    return { zaman: zaman(x.z), tur: TUR_AD[x.tur] || x.tur, turTon: x.ciddiyet === 'alarm' ? 'neg' : x.ciddiyet === 'uyari' ? 'warn' : (TUR_TON[x.tur] || ''),
      bot: x.bot ? botAdi(x.bot) : '—', ozet: AG.botAd && AG.botAd.cevir ? AG.botAd.cevir(x.ozet) : x.ozet, ayrinti: x.ayrinti || '', makine: cokMakine ? (x.makine || '—') : null, ciddiyet: x.ciddiyet || 'bilgi' };
  }

  function secim(id, etiket, secenekler, deger, f) {
    const s = el('select', { id, class: 'form-control', onchange: (e) => f(e.target.value) }, secenekler.map(([k, ad]) => el('option', { value: k, text: ad })));
    s.value = deger;
    return el('label', { class: 'form-group gl-alan' }, [el('span', { text: etiket }), s]);
  }

  function bilgiSatiri(v) {
    const p = [];
    if (v.sunucu) p.push(v.sunucu.durum === 'tamam' ? 'sunucunun akışı birleştirildi' : v.sunucu.durum === 'eski' ? 'sunucuya ulaşılamadı — son bilinen kopyası' : v.sunucu.durum === 'kurulu-degil' ? 'sunucu bağlantısı kurulu değil — yalnız bu bilgisayar' : 'sunucuya ulaşılamadı — yalnız bu bilgisayar');
    for (const e of v.esler || []) p.push(`${e.ad}: ${e.durum === 'tamam' ? 'birleştirildi' : `okunamadı (${e.hata || 'bilinmiyor'})`}`);
    p.push(`${v.saklaAy ? Math.round(v.saklaAy - 1) : 12} ay saklanır`);
    return p.join(' · ');
  }

  function ciz() {
    const k = bul('olayKok');
    if (!k || !veri) return;
    const l = [...(veri.olaylar || []), ...ekler];
    const makineler = veri.makineler || [];
    const cokMakine = makineler.length > 1;
    const botlar = [['', 'Hepsi'], ...((veri.botlar || []).map(b => [b, botAdi(b)]))];
    const ara = el('input', { id: 'inpOlayAra', type: 'search', class: 'form-control', placeholder: 'ör. ENGEL, BTC, güncelleme', value: suzgec.ara,
      oninput: (e) => { suzgec.ara = e.target.value; if (araZaman) global.clearTimeout(araZaman); araZaman = global.setTimeout(yukle, 350); } });
    const cipler = turCipleri(veri);
    doldur(k, [
      el('div', { class: 'gl-suzgec mb-4', id: 'olaySuzgec' }, [
        secim('selOlayTur', 'Tür', [['', 'Hepsi'], ...Object.entries(TUR_AD).filter(([t]) => (veri.sayilar || {})[t] || t === suzgec.tur)], suzgec.tur, (x) => { suzgec.tur = x; yukle(); }),
        secim('selOlayBot', 'Bot', botlar, suzgec.bot, (x) => { suzgec.bot = x; yukle(); }),
        cokMakine || suzgec.makine ? secim('selOlayMakine', 'Makine', [['', 'Hepsi'], ...makineler.map(m => [m, m])], suzgec.makine, (x) => { suzgec.makine = x; yukle(); }) : null,
        secim('selOlayOnem', 'Önem', ONEM, suzgec.ciddiyet, (x) => { suzgec.ciddiyet = x; yukle(); }),
        secim('selOlayZaman', 'Zaman', ZAMANLAR, suzgec.gun, (x) => { suzgec.gun = x; yukle(); }),
        el('label', { class: 'form-group gl-alan gl-ara' }, [el('span', { text: 'Ara' }), ara]),
      ]),
      cipler.length ? el('div', { class: 'gl-suzgec mb-4', id: 'olayCipler' }, cipler.map(c => el('button', { type: 'button', class: `btn btn-sm ${c.secili ? 'btn-primary' : 'btn-secondary'}`, 'data-tur': c.id,
        onclick: () => { suzgec.tur = c.secili ? '' : c.id; yukle(); } }, [el('span', { text: `${c.ad} ${tr(c.adet)}` })]))) : null,
      el('section', { class: 'p-kart', id: 'olayListe' }, [
        el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: `Olaylar (${tr(veri.toplam || 0)})` }), el('span', { class: 'df-soluk', text: bilgiSatiri(veri) })]),
        l.length ? AG.tablo.kutulu({ id: 'tblOlay', sinif: 'p-tablo gl-tablo', basliklar: ['Zaman', 'Tür', 'Bot', 'Ne oldu', ...(cokMakine ? ['Makine'] : [])],
          satirlar: l.map(x => { const m = satirModeli(x, cokMakine); return el('tr', { class: m.ciddiyet === 'alarm' ? 'gl-hata' : null }, [
            el('td', { class: 'sayi gl-zaman', text: m.zaman }),
            el('td', null, [el('span', { class: `p-rozet${m.turTon ? ' p-rozet-' + m.turTon : ''}`, text: m.tur })]),
            el('td', { class: 'df-soluk', text: m.bot }),
            el('td', { class: 'gl-mesaj' }, [el('span', { text: m.ozet }), m.ayrinti ? el('span', { class: 'df-soluk', text: ` · ${m.ayrinti}` }) : null]),
            ...(cokMakine ? [el('td', { class: 'df-soluk', text: m.makine })] : []),
          ]); }) }, 'p-tablo-kap')
          : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: 'Bu süzgece uyan olay yok.' })]),
        veri.kesildi || (ekler.length && ekler.sonKesildi) ? el('div', { class: 'mt-3' }, [el('button', { type: 'button', class: 'btn btn-secondary', id: 'btnOlayDahaEski', onclick: dahaEski }, [el('span', { text: 'Daha eski olaylar' })])]) : null,
      ]),
    ]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  async function dahaEski() {
    const l = [...(veri.olaylar || []), ...ekler];
    if (!l.length) return;
    let r;
    try { r = await AG.api.olaylar.liste(sorgu(suzgec, { once: String(l[l.length - 1].z) })); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { AG.bildirim.bildir(`Daha eski olaylar okunamadı: ${(r && r.error) || 'sunucu yanıt vermedi'}`, 'hata'); return; }
    const gor = new Set(l.map(x => `${x.makine}|${x.kimlik}`));
    ekler = [...ekler, ...(r.olaylar || []).filter(x => !gor.has(`${x.makine}|${x.kimlik}`))];
    ekler.sonKesildi = !!r.kesildi;
    veri = { ...veri, kesildi: false };
    ciz();
  }

  async function yukle() {
    const k = bul('olayKok');
    if (!k) return;
    let r;
    try { r = await AG.api.olaylar.liste(sorgu()); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(k, [AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Olay akışı okunamadı', yeniden: yukle })]); return; }
    veri = r; ekler = [];
    const odak = doc && doc.activeElement ? doc.activeElement.id : null;
    ciz();
    if (odak) { const x = bul(odak); if (x && x.focus) { x.focus(); if (odak === 'inpOlayAra' && x.setSelectionRange) x.setSelectionRange(x.value.length, x.value.length); } }
  }

  if (doc && doc.addEventListener) doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-olaylar') yukle(); });

  AG.pages = AG.pages || {};
  AG.pages.olaylar = { yukle, aralik, sorgu, zaman, turCipleri, satirModeli, TUR_AD, _durum: { suzgec, veriAyarla: (v) => { veri = v; ekler = []; } }, _ciz: { ciz } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.olaylar;
})(typeof window !== 'undefined' ? window : globalThis);
