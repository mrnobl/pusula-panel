/**
 * SİSTEM › BİLDİRİMLER — bildirim merkezi, PLAN-PANEL-2 §0.3 (kullanıcı kararı 2026-10-19) `AG.pages.bildirimMerkezi`
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/bildirim (lib/bildirimMerkezi.js): katalog (grup · ad · ne zaman gelir · önem · son gönderim · açık/kapalı),
 * son gönderilenler, Telegram durumu. Aç/kapat POST /api/bildirim/ayar; "Acil durum" kilitli. Telefonda salt okunur
 * (sunucu da POST'u 403 ile reddeder). Metin düzenleme ve yeni türler sonraki adım.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  /** 72.0: katalog metni eski bot adıyla gelebilir (sunucu eski sürüm) → yeni ad. */
  const cv = (t) => (AG.botAd ? AG.botAd.cevir(t) : t);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);

  const ONEM_AD = { kritik: 'kritik', uyari: 'uyarı', bilgi: 'bilgi' };
  const ONEM_TON = { kritik: 'neg', uyari: 'warn', bilgi: 'info' };
  const SONUC_AD = { gonderildi: 'gönderildi', kapali: 'kapalı olduğu için gönderilmedi', hata: 'gönderilemedi' };
  let veri = null;

  /** 2026-10-19T03:04:00Z → "bugün 06:04" / "dün 06:04" / "17.10 06:04"; yoksa "hiç". */
  function ne(iso, simdi = new Date()) {
    if (!iso) return 'hiç';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '—';
    const p = (n) => String(n).padStart(2, '0');
    const saat = `${p(d.getHours())}:${p(d.getMinutes())}`;
    const gun = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
    const dun = new Date(simdi.getTime() - 864e5);
    if (gun(d) === gun(simdi)) return `bugün ${saat}`;
    if (gun(d) === gun(dun)) return `dün ${saat}`;
    return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${saat}`;
  }

  /** Saf: katalog → gruplar (sıra korunur). */
  function gruplar(katalog) {
    const m = new Map();
    for (const k of katalog || []) { if (!m.has(k.grup)) m.set(k.grup, []); m.get(k.grup).push(k); }
    return [...m.entries()].map(([ad, turler]) => ({ ad, turler }));
  }

  const telefon = () => !!((AG.pages && AG.pages.kabuk && AG.pages.kabuk.telefon && AG.pages.kabuk.telefon()) || (AG.api && AG.api.kademe && AG.api.kademe() === 'telefon'));

  async function degistir(tur, acik, kutu) {
    if (kutu) kutu.disabled = true;
    try {
      const r = await AG.api.bildirim.ayarla(tur, acik);
      if (!r || !r.success) { AG.bildir(`Kaydedilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata'); }
      await yukle();
    } catch (e) { AG.bildir(`Kaydedilemedi: ${e.message}`, 'hata'); await yukle(); }
  }

  async function deneme(dugme) {
    AG.dom.mesgul(dugme, 'Gönderiliyor…');
    try {
      const r = await AG.api.telegramTest();
      if (r && r.success) AG.bildir('Deneme mesajı gönderildi — Telegram\'a bakın.', 'ok');
      else AG.bildir(`Gönderilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 10000 });
    } catch (e) { AG.bildir(`Gönderilemedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(dugme); await yukle(); }
  }

  function ciz() {
    const k = bul('bildirimKok');
    if (!k || !veri) return;
    const tg = veri.telegram || {};
    const salt = telefon();
    const satir = (t) => {
      const kutu = el('input', { type: 'checkbox', id: `chkBildirim-${t.id}`, class: 'bm-kutu', 'aria-label': `${cv(t.ad)} ${t.acik ? 'açık' : 'kapalı'}`,
        disabled: t.kilitli || salt ? '' : null, onchange: (e) => degistir(t.id, e.target.checked, e.target) });
      kutu.checked = !!t.acik;
      return el('div', { class: `bm-satir${t.acik ? '' : ' bm-kapali'}`, 'data-tur': t.id }, [
        el('div', { class: 'bm-ad' }, [el('strong', { text: cv(t.ad) }), el('span', { class: 'df-soluk', text: t.kilitli ? `${cv(t.aciklama)} — kapatılamaz` : cv(t.aciklama) })]),
        el('span', null, [el('span', { class: `p-rozet p-rozet-${ONEM_TON[t.onem] || 'info'}`, text: ONEM_AD[t.onem] || t.onem })]),
        el('span', { class: 'df-soluk bm-son', text: ne(t.sonGonderim) }),
        el('label', { class: 'bm-ac', for: `chkBildirim-${t.id}` }, [kutu]),
      ]);
    };
    doldur(k, [
      el('div', { class: 'bm-ust mb-4' }, [
        el('span', { class: `p-rozet ${tg.bagli ? 'p-rozet-pos' : 'p-rozet-warn'}`, id: 'bildirimTelegram', text: tg.bagli ? 'Telegram bağlı' : 'Telegram bağlı değil' }),
        !tg.bagli && tg.neden ? el('span', { class: 'df-soluk', text: tg.neden }) : null,
        el('a', { class: 'no-underline', href: '#/ayarlar/bildirimler', text: 'Bağlantı ayarları →' }),
        el('button', { type: 'button', class: 'btn btn-secondary bm-deneme', id: 'btnBildirimDeneme', disabled: salt ? '' : null, onclick: (e) => deneme(e.currentTarget) }, [el('span', { text: 'Deneme mesajı gönder' })]),
      ]),
      el('div', { class: 'bm-izgara' }, [
        el('div', { class: 'bm-turler', id: 'bildirimTurler' }, gruplar(veri.katalog).map(g => el('section', { class: 'p-kart' }, [
          el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: g.ad })]),
          el('div', { class: 'bm-satir bm-bas df-soluk' }, [el('span', { text: 'Bildirim · ne zaman gelir' }), el('span', { text: 'Önem' }), el('span', { text: 'Son gönderim' }), el('span', { text: 'Açık' })]),
          ...g.turler.map(satir),
        ]))),
        el('aside', { class: 'p-kart bm-gecmis', id: 'bildirimGecmis' }, [
          el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Son gönderilenler' })]),
          (veri.gecmis || []).length ? el('ul', { class: 'bm-liste' }, veri.gecmis.slice(0, 20).map(g => {
            const t = (veri.katalog || []).find(x => x.id === g.tur);
            return el('li', { class: `bm-oge${g.sonuc === 'hata' ? ' bm-oge-hata' : g.sonuc === 'kapali' ? ' bm-oge-kapali' : ''}` }, [
              el('span', { class: 'df-soluk bm-oge-ust', text: `${ne(g.zaman)} · ${t ? cv(t.ad) : g.tur} · ${SONUC_AD[g.sonuc] || g.sonuc}` }),
              el('span', { text: g.baslik || '—' }),
              g.hata ? el('span', { class: 'df-soluk', text: g.hata }) : null,
            ]);
          })) : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: tg.bagli ? 'Henüz bildirim gönderilmedi.' : 'Telegram bağlı olmadığı için kayıt yok.' })]),
        ]),
      ]),
      salt ? el('p', { class: 'hint mt-3 mb-0', text: 'Telefonda yalnız görüntülenir; aç/kapat sunucunun bilgisayarından.' }) : null,
    ]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  async function yukle() {
    const k = bul('bildirimKok');
    if (!k) return;
    let r;
    try { r = await AG.api.bildirim.liste(); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(k, [AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Bildirimler okunamadı', yeniden: yukle })]); return; }
    veri = r;
    ciz();
  }

  if (doc && doc.addEventListener) doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-bildirim') yukle(); });

  AG.pages = AG.pages || {};
  AG.pages.bildirimMerkezi = { yukle, gruplar, ne, _durum: { veriAyarla: (v) => { veri = v; } }, _ciz: { ciz } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.bildirimMerkezi;
})(typeof window !== 'undefined' ? window : globalThis);
