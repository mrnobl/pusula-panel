/**
 * YAPAY ZEKÂ NOTLARI — #/notlar `AG.pages.yapayZekaNotlari` (74.1 C3; kullanıcı kararı 2026-10-23/24, taslak EP3T4695ij7SDitZa1Nccb)
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/yapay-zeka/notlar[?gun=] (lib/yapayZeka; araştırma kopyasında sunucudan). Sayfa YALNIZ OKUR. "Yalnız not · karar yok":
 * notlar dikkat listesini, kuralları, botları değiştirmez. Her not: iddia · etiket · kaynaktan BİREBİR alıntı · kaynak bağlantısı + tarih.
 * Reddedilen iddialar (alıntı kaynakta yok vb.) ayrı katta, nedeniyle. Kanarya geçmediyse günün notları "güvenilmez" bandıyla.
 * Kayıt katında: model + sürüm, istem SHA-256, sıcaklık 0, doğrulayıcı, deneme 783 durumu, son 4 hafta kabul / red oranı.
 * DOM yalnız AG.dom; model / kaynak metni METİN olarak yazılır (HTML yorumlanmaz); bağlantı yalnız http(s).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);
  let secili = null;

  const LISTE_AD = { izle: 'İZLE', kacin: 'KAÇIN (bu hafta yeni)' };
  const TUR_AD = { coin: 'Coin dikkat kısa listesi', bist: 'BIST — KAP bildirimleri', nasdaq: 'Nasdaq — SEC bildirimleri' };
  const DURUM_AD = { 'kaynak-yok': 'haber / bildirim bulunamadı', 'atlandi-tavan': 'günlük istek sınırı — okunmadı', 'atlandi-kota': 'kota doldu — yarın', hata: 'okunamadı', baslik: 'yalnız başlık', tamam: 'okundu' };

  /** Saf: ISO / ms → "25 Eki 07:04" (yerel saat). */
  function zaman(x) {
    if (x == null || x === '') return '—';
    const d = new Date(typeof x === 'number' ? x : String(x));
    if (!Number.isFinite(d.getTime())) return String(x).slice(0, 16);
    return d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  const gunAdi = (g) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(g || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : '—'; };
  /** Saf: güvenli bağlantı — yalnız http(s). */
  const guvenliUrl = (u) => (/^https?:\/\/[^\s<>"']{3,500}$/i.test(String(u || '')) ? String(u) : null);
  const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return ''; } };

  /** Saf: durum → üst satır metni. */
  function durumMetni(v) {
    const d = (v && v.durum) || {};
    if (d.arastirma) return 'Notlar sunucuda üretilir; bu bilgisayar sunucudaki notları gösterir (sunucu bağlantısı yoksa boş).';
    if (d.durum === 'anahtar-bekliyor') return 'Gemini API anahtarı bekleniyor — Ayarlar › Anahtarlar. Anahtar girilince ilk okuma aynı gün ~07:00\'dan sonra (en geç 10 dk içinde) başlar.';
    const sc = d.sonCalisma;
    const p = [];
    if (sc) p.push(`Son okuma ${zaman(sc.bit)}`, `${(sc.sayim && sc.sayim.konu) || 0} konu`, `${(sc.sayim && sc.sayim.kabul) || 0} not / ${(sc.sayim && sc.sayim.red) || 0} reddedilen`);
    else p.push('Henüz okuma yapılmadı');
    if (d.durum === 'calisiyor') p.push('şu an okuyor');
    if (d.durum === 'kota') p.push('ücretsiz günlük kota doldu — yarın devam');
    if (d.durum === 'anahtar-hatasi') p.push('Gemini anahtarı reddedildi — Ayarlar › Anahtarlar › Sına');
    if (d.istekBugun != null) p.push(`bugün ${d.istekBugun}/${d.tavan} Gemini isteği`);
    if (d.sonraki) p.push(`sonraki okuma ~${zaman(d.sonraki)}`);
    return p.join(' · ');
  }

  /** Saf: kayıt → bölümler { incele: [...], gruplar: [{ tur, ad, konular, bos: { kaynakYok, haberYok, diger } }], red: [...] } */
  function model(kayit) {
    const konular = (kayit && kayit.konular) || [];
    const incele = [];
    const red = [];
    const gruplar = ['coin', 'bist', 'nasdaq'].map(tur => {
      const l = konular.filter(k => k.tur === tur);
      const dolu = [], kaynakYok = [], sessiz = [], diger = [];
      for (const k of l) {
        for (const a of k.kabul || []) if (a.incele) incele.push({ konu: k, not: a });
        for (const r of k.red || []) red.push({ konu: k, red: r });
        if ((k.kabul || []).length || (k.basliklar || []).length) dolu.push(k);
        else if (k.durum === 'kaynak-yok') kaynakYok.push(k);
        else if (k.durum === 'tamam') sessiz.push(k);
        else diger.push(k);
      }
      return { tur, ad: TUR_AD[tur], sayi: l.length, konular: dolu, kaynakYok, sessiz, diger };
    }).filter(g => g.sayi);
    return { incele, red, gruplar };
  }

  const konuAdi = (k) => (k.tur === 'coin' ? `${k.sembol}${k.liste ? ` · ${LISTE_AD[k.liste] || k.liste}` : ''}`
    : k.tur === 'bist' ? `${k.kod}${k.elde ? ` · 📌 elinizde${Array.isArray(k.elde) && k.elde[0] !== 'elinizde' ? `: ${k.elde.join(', ')}` : ''}` : ''}`
      : `${k.sembol}${(k.botlar || []).length ? ` · ${k.botlar.join(', ')}` : ''}`);

  function notCiz(a, etiketAd, el) {
    const url = guvenliUrl(a.url);
    return el('li', { class: `yz-not${a.incele ? ' yz-not-incele' : ''}` }, [
      el('div', { class: 'yz-not-bas' }, [
        el('span', { class: `p-rozet ${a.incele ? 'p-rozet-warn' : 'p-rozet-info'}`, text: (etiketAd && etiketAd[a.etiket]) || a.etiket }),
        a.incele ? el('span', { class: 'p-rozet p-rozet-warn', text: 'incele' }) : null,
      ]),
      el('p', { class: 'yz-iddia', text: a.iddia }),
      el('blockquote', { class: 'yz-alinti', text: `“${a.alinti}”` }),
      el('p', { class: 'hint hint-sm mb-0' }, [
        url ? el('a', { href: url, target: '_blank', rel: 'noopener noreferrer nofollow', text: host(url) || 'kaynak' }) : el('span', { text: 'kaynak' }),
        el('span', { text: ` · ${zaman(a.tarih)}` }),
      ]),
    ]);
  }

  function konuCiz(k, etiketAd, el) {
    return el('section', { class: 'pb-kart yz-konu', 'data-konu': k.kimlik }, [
      el('div', { class: 'pb-kart-bas' }, [el('h4', { class: 'pb-kart-baslik', text: konuAdi(k) }),
        el('span', { class: 'p-rozet p-rozet-info pb-rozet', text: DURUM_AD[k.durum] || k.durum })]),
      (k.kabul || []).length ? el('ul', { class: 'yz-notlar' }, k.kabul.map(a => notCiz(a, etiketAd, el))) : null,
      (k.basliklar || []).length ? el('ul', { class: 'pb-liste' }, k.basliklar.map(b => {
        const u = guvenliUrl(b.url);
        return el('li', null, [u ? el('a', { href: u, target: '_blank', rel: 'noopener noreferrer nofollow', text: `${b.form} · ${gunAdi(b.tarih)}` }) : el('span', { text: `${b.form} · ${gunAdi(b.tarih)}` }),
          (b.aciklama && b.aciklama !== b.form) || b.maddeler ? el('span', { class: 'hint hint-sm mb-0', text: [b.aciklama !== b.form ? b.aciklama : '', b.maddeler ? `madde ${b.maddeler}` : ''].filter(Boolean).join(' · ') }) : null]);
      })) : null,
      k.not ? el('p', { class: 'hint hint-sm mb-0', text: k.not }) : null,
    ]);
  }

  function ciz(v) {
    const kok = bul('yzKok'), dur = bul('yzDurum');
    if (!kok || !AG.dom) return;
    const { el, doldur } = AG.dom;
    if (!v || !v.success) {
      if (dur) dur.textContent = '';
      doldur(kok, [AG.bildirim && AG.bildirim.hataKutusu ? AG.bildirim.hataKutusu((v && v.error) || 'sunucu yanıt vermedi', { baslik: 'Yapay zekâ notları okunamadı', yeniden: yukle }) : el('p', { class: 'hint', text: 'Notlar okunamadı.' })]);
      return;
    }
    if (dur) dur.textContent = durumMetni(v);
    const d = v.durum || {};
    const kayit = v.kayit;
    const parcalar = [];
    if (d.durum === 'anahtar-bekliyor' && !d.arastirma) {
      parcalar.push(el('section', { class: 'p-kart yz-anahtar', id: 'yzAnahtarKart' }, [
        el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Gemini API anahtarı bekleniyor' }), el('span', { class: 'p-rozet p-rozet-info', text: 'bilgi' })]),
        el('ol', { class: 'yz-adimlar' }, [
          el('li', { text: 'aistudio.google.com adresine Google hesabınızla girin.' }),
          el('li', { text: '"Get API key" › "Create API key". Ücretsizdir; faturalandırma (billing) AÇMAYIN.' }),
          el('li', { text: 'Ayarlar › Anahtarlar › "Gemini API anahtarı" › Değiştir › anahtarı yapıştırın (acil PIN sorulur), sonra "Sına".' }),
        ]),
        el('p', { class: 'hint hint-sm mb-0' }, [el('a', { href: '#/ayarlar/anahtarlar', text: 'Anahtarlar →' }), el('span', { text: ' · ' }), el('a', { href: '#/kilavuz/yapay-zeka-notlari/anahtar', text: 'Kılavuz: adım adım' })]),
      ]));
    }
    if (v.gunler && v.gunler.length) {
      const sec = el('select', { id: 'yzGun', class: 'form-control yz-gun', 'aria-label': 'Gün',
        onchange: (e) => { secili = e.target.value || null; yukle(); } }, v.gunler.map(g => {
        const o = el('option', { value: g.gun, text: `${gunAdi(g.gun)}${g.sayim ? ` · ${g.sayim.kabul} not${g.sayim.incele ? `, ${g.sayim.incele} incele` : ''}` : ''}${g.kanarya === false ? ' · kanarya geçmedi' : ''}` });
        if (kayit && g.gun === kayit.gun) o.selected = true;
        return o;
      }));
      parcalar.push(el('div', { class: 'yz-ust mb-3' }, [el('label', { class: 'df-soluk', for: 'yzGun', text: 'Gün' }), sec]));
    }
    if (!kayit) {
      parcalar.push(el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: d.durum === 'anahtar-bekliyor' ? 'Anahtar girilince ilk notlar burada görünür.' : 'Henüz not yok. Pusula her sabah ~07:00\'dan sonra bir kez okur.' })]));
      doldur(kok, parcalar);
      if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
      return;
    }
    if (kayit.kanarya && kayit.kanarya.gecti === false) parcalar.push(el('p', { class: 'yz-bant yz-bant-uyari', role: 'alert', text: 'Kanarya sınaması GEÇMEDİ: model sayfaya gömülü sahte bir talimata uydu. Bu günün notlarına güvenmeyin (Telegram\'a gönderilmedi).' }));
    for (const u of kayit.uyarilar || []) if (!/Kanarya GEÇMEDİ/.test(u)) parcalar.push(el('p', { class: 'hint hint-sm mb-2', text: u }));
    const m = model(kayit);
    const ea = v.etiketAd || {};
    if (m.incele.length) {
      parcalar.push(el('section', { class: 'p-kart p-kart-vurgu mb-3', id: 'yzIncele' }, [
        el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: `İncele (${m.incele.length})` }), el('span', { class: 'p-rozet p-rozet-warn', text: 'yalnız not' })]),
        el('ul', { class: 'yz-notlar' }, m.incele.map(x => el('li', { class: 'yz-incele-satir' }, [el('strong', { text: konuAdi(x.konu) }), el('ul', { class: 'yz-notlar' }, [notCiz(x.not, ea, el)])]))),
      ]));
    }
    for (const g of m.gruplar) {
      const bosSatir = (l, metin) => (l.length ? el('p', { class: 'hint hint-sm mb-1', text: `${metin}: ${l.map(k => (k.tur === 'bist' ? k.kod : k.sembol)).join(', ')}` }) : null);
      parcalar.push(el('section', { class: 'mb-4 yz-grup', 'data-tur': g.tur }, [
        el('h3', { class: 'card-title mb-2', text: `${g.ad} (${g.sayi})` }),
        g.konular.length ? el('div', { class: 'pb-izgara' }, g.konular.map(k => konuCiz(k, ea, el))) : el('p', { class: 'hint mb-1', text: 'Kayda değer not yok.' }),
        bosSatir(g.sessiz, 'Okundu, kayda değer bir şey yok'),
        bosSatir(g.kaynakYok, 'Haber / bildirim bulunamadı'),
        ...g.diger.map(k => el('p', { class: 'hint hint-sm mb-1', text: `${k.tur === 'bist' ? k.kod : k.sembol}: ${DURUM_AD[k.durum] || k.durum}${k.hata ? ` (${k.hata})` : ''}` })),
      ]));
    }
    parcalar.push(el('details', { class: 'glass-panel veri-grup mb-3', id: 'yzRed' }, [
      el('summary', null, [el('strong', { text: `Reddedilen iddialar (${m.red.length})` }), el('span', { class: 'hint hint-sm mb-0', text: ' — alıntısı kaynakta kelimesi kelimesine bulunamayan ya da şemaya uymayanlar; not sayılmaz' })]),
      m.red.length ? el('ul', { class: 'pb-liste' }, m.red.map(x => el('li', null, [
        el('span', { text: `${konuAdi(x.konu)} — ${x.red.iddia || '(iddia yok)'}` }),
        el('span', { class: 'hint hint-sm mb-0', text: `Neden: ${x.red.aciklama || x.red.neden}${x.red.alinti ? ` · alıntı: “${x.red.alinti}”` : ''}` }),
      ]))) : el('p', { class: 'hint mb-0', text: 'Bu gün reddedilen iddia yok.' }),
    ]));
    const r4 = v.rapor4h || {};
    const h = kayit.h783 || {};
    parcalar.push(el('details', { class: 'glass-panel veri-grup mb-3', id: 'yzKayit' }, [
      el('summary', null, [el('strong', { text: 'Kayıt ve doğrulama' }), el('span', { class: 'hint hint-sm mb-0', text: ' — model, istem özeti, kanarya, deneme 783' })]),
      el('dl', { class: 'pb-satirlar' }, [
        ['Model', `${kayit.model || '—'}${kayit.modelSurum && kayit.modelSurum !== kayit.model ? ` (sürüm ${kayit.modelSurum})` : ''}`],
        ['Sıcaklık', String(kayit.sicaklik)],
        ['İstem SHA-256 (coin)', kayit.istemSha ? String(kayit.istemSha.coin).slice(0, 16) + '…' : '—'],
        ['İstem SHA-256 (BIST)', kayit.istemSha ? String(kayit.istemSha.bist).slice(0, 16) + '…' : '—'],
        ['İstem SHA-256 (Nasdaq)', kayit.istemSha ? String(kayit.istemSha.nasdaq).slice(0, 16) + '…' : '—'],
        ['Doğrulayıcı', kayit.dogrulayici || '—'],
        ['Kanarya', kayit.kanarya ? (kayit.kanarya.gecti === true ? 'geçti' : kayit.kanarya.gecti === false ? 'GEÇMEDİ' : `çalışmadı${kayit.kanarya.hata ? ` (${kayit.kanarya.hata})` : ''}`) : '—'],
        ['Gemini isteği', String((kayit.istek && kayit.istek.gemini) || 0)],
        ['Okuma', `${zaman(kayit.baslangic)} → ${zaman(kayit.bitis)}`],
        ['Deneme 783 (H-DL3)', h.sayilir ? `sayılıyor (ön kayıt ${h.onKayit})` : (h.neden || 'sayılmıyor')],
        ['Son 4 hafta', r4.gun ? `${r4.gun} gün · ${r4.kabul} kabul / ${r4.red} red${r4.oran != null ? ` (kabul %${Math.round(r4.oran * 100)})` : ''}` : 'henüz yok'],
      ].flatMap(([a, b]) => [el('dt', { text: a }), el('dd', { text: b })])),
    ]));
    doldur(kok, parcalar);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  async function yukle() {
    if (!bul('yzKok') || !AG.api || !AG.api.yapayZeka) return;
    let v = null;
    try { v = await AG.api.yapayZeka.notlar(secili); } catch (e) { v = { success: false, error: e.message }; }
    ciz(v);
  }

  if (doc && doc.addEventListener) doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-notlar') yukle(); });

  AG.pages = AG.pages || {};
  AG.pages.yapayZekaNotlari = { yukle, ciz, model, durumMetni, guvenliUrl, konuAdi };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.yapayZekaNotlari;
})(typeof window !== 'undefined' ? window : globalThis);
