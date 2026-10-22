/**
 * ANA SAYFA — "Botlar ne durumda, bugün bir şey yapmam gerekiyor mu?" (62.8; kullanıcıyla taslak 1–2 üzerinden)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DÖRT KART + YAPILACAKLAR (masaüstü: Botlar üstte tam genişlik, altında Portföyüm · Modeller · Sistem yan yana,
 * en altta yapılacaklar; telefonda sıra: Botlar → Yapılacaklar → Portföyüm → Modeller → Sistem). Grafik yok (kullanıcı
 * kararı: grafikler Portföy ve Botlar sayfalarında).
 *
 *   1. BOTLAR (#anaBotSagligi) — her bot: durum rozeti, hesap türü, hesap değeri, başlangıçtan getiri (aynı dönemde
 *      BTC; GET /api/bindirme/:ad/grafik?mumsuz=1 → AG.pages.botlar.egriOzeti), son karar, koruma stopu; durduysa ya da
 *      onay bekliyorsa "Ne yapmalı" satırı. Metinler js/pages/botDil.js'ten (Botlar ekranıyla aynı sade dil).
 *   2. PORTFÖYÜM (#anaPortfoy) — toplam USD, ay başından getiri, ≈ TL, hedef bandı dışı varlık (GET /api/portfoyum/ozet).
 *   3. MODELLER (#anaModeller) — tek satır + ışık: "3 model izleniyor" ve varsa tek iş (emir bekliyor / liste hazır).
 *   4. SİSTEM (#anaSistem) — üç ışık: veri (GET /api/veri/durum + model verisi tazeliği), borsa hesapları
 *      (GET /api/hesaplar), Pusula sürümü/güncelleme (GET /api/guncelleme/durum). Bilgi notu YAZMAZ — yalnız ışık + bağlantı.
 *   5. YAPMAN GEREKENLER (#anaYapilacaklar) — yalnız kullanıcının elle yapacağı işler, aynı iş TEK satır ("3 modelin bu ayki
 *      emirleri Midas'a girilmedi"). Coin tarama notları ve veri hataları burada YOK (kullanıcı kararı): ilgili sayfada
 *      (Araştırma › Coin tarama — menü rozeti; Veri) ve Sistem ışığında.
 *
 * Yalnız OKUR; eylemler yalnız gezinme. Ekran açıkken 60 sn'de bir tazelenir. DOM yalnız `AG.dom`; istek yalnız `AG.api`.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const { el, doldur, bul } = AG.dom;
  const doc = global.document;
  const D = () => AG.botDil;

  const BOTLAR = ['hucum', 'denge'];
  const YENILEME_MS = 60000;
  const GRAFIK_MS = 5 * 60000;
  const DILIM_SINIRI = 7;
  let zamanlayici = null;
  let yukleniyor = false;
  const grafikOnbellek = {};           // bot → { zaman, egri }

  const usd = (x) => (x == null || !Number.isFinite(+x) ? '—' : `$${(+x).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`);
  const yz = (x, b = 1) => D().yuzde(x, b);
  const isaretliYz = (x, b = 1) => (x == null || !Number.isFinite(+x) ? '—' : `${x > 0 ? '+' : ''}${yz(x, b)}`);
  const bugunStr = () => D().yerelGun();   // yerel gün (denetim A-07; toISOString UTC verirdi)
  const arastirmaMu = () => !!(AG.pages && AG.pages.kabuk && AG.pages.kabuk.arastirmaModu && AG.pages.kabuk.arastirmaModu());
  const gunFarki = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5);
  const baslik = (ikon, metin, ek) => el('h3', { class: 'card-title mb-3' }, [el('i', { class: 'tone-primary', 'data-lucide': ikon }), el('span', { text: ' ' + metin }), ek || null]);
  const ikonla = () => { if (global.lucide && global.lucide.createIcons) global.lucide.createIcons(); };
  const yardim = (k) => (AG.sozluk ? AG.sozluk.yardim(k) : null);
  const ton = (t) => D().TON_SINIF[t || ''] || '';
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);

  // ═══ DAĞILIM HALKASI (Portföy › Portföyüm de kullanır: AG.pages.anasayfa.halka) ═══════════════

  /** ≤ 7 dilim: büyükten küçüğe (hedef ya da gerçek hangisi büyükse), kalanlar "Diğer"de toplanır. Nakit ayrı dilim. */
  function dilimler(oz) {
    const l = oz.satirlar.filter(s => s.hedef > 0 || s.gercek > 0).slice().sort((a, b) => Math.max(b.hedef, b.gercek) - Math.max(a.hedef, a.gercek));
    if (oz.nakitUSD > 0 && oz.toplamUSD > 0) l.push({ kimlik: 'nakit', ad: 'Nakit', hedef: 0, gercek: oz.nakitUSD / oz.toplamUSD });
    if (l.length <= DILIM_SINIRI) return l;
    const ust = l.slice(0, DILIM_SINIRI - 1), alt = l.slice(DILIM_SINIRI - 1);
    ust.push({ kimlik: 'diger', ad: `Diğer (${alt.length})`, hedef: alt.reduce((a, s) => a + s.hedef, 0), gercek: alt.reduce((a, s) => a + s.gercek, 0) });
    return ust;
  }

  /**
   * Dağılım halkası (SVG): iç halka hedef, dış halka gerçek. Renk sınıftan (`halka-renk-N` → --seri-N).
   * `secenek.tek` (60.9, Portföy › Tasarımcı): yalnız TEK halka (hedef) — tasarımın gerçeği yok.
   */
  function halka(dl, secenek) {
    const S = AG.dom.svg;
    const tek = !!(secenek && secenek.tek);
    const halkaCiz = (r, gen, alan, sinif) => {
      const C = 2 * Math.PI * r;
      const toplam = dl.reduce((a, d) => a + Math.max(0, d[alan]), 0) || 1;
      let bas = 0;
      return dl.map((d, i) => {
        const pay = Math.max(0, d[alan]) / toplam;
        const uz = pay * C;
        const bosluk = dl.length > 1 && uz > 1.2 ? 0.8 : 0;
        const c = uz > 0 ? S('circle', { cx: 60, cy: 60, r, 'stroke-width': gen, class: `halka-dilim halka-renk-${i + 1} ${sinif}`,
          'stroke-dasharray': `${(uz - bosluk).toFixed(2)} ${(C - uz + bosluk).toFixed(2)}`, 'stroke-dashoffset': (-bas).toFixed(2),
          transform: 'rotate(-90 60 60)' }, [S('title', { text: `${d.ad}: ${alan === 'hedef' ? 'hedef' : 'gerçek'} ${yz(pay, 1)}` })]) : null;
        bas += uz;
        return c;
      });
    };
    if (tek) {
      const ozet = dl.map(d => `${d.ad} ${yz(d.hedef, 0)}`).join('; ');
      return S('svg', { viewBox: '0 0 120 120', class: 'halka', role: 'img', 'aria-label': `Hedef dağılım halkası. ${ozet}` }, [
        S('circle', { cx: 60, cy: 60, r: 45, 'stroke-width': 22, class: 'halka-zemin' }),
        ...halkaCiz(45, 22, 'hedef', 'halka-hedef'),
        S('text', { x: 60, y: 63, class: 'halka-merkez', 'text-anchor': 'middle', text: 'hedef' })
      ]);
    }
    const ozet = dl.map(d => `${d.ad} hedef ${yz(d.hedef, 0)}, gerçek ${yz(d.gercek, 0)}`).join('; ');
    return S('svg', { viewBox: '0 0 120 120', class: 'halka', role: 'img', 'aria-label': `Dağılım halkası — iç halka hedef, dış halka gerçek. ${ozet}` }, [
      S('circle', { cx: 60, cy: 60, r: 51, 'stroke-width': 13, class: 'halka-zemin' }),
      S('circle', { cx: 60, cy: 60, r: 35, 'stroke-width': 11, class: 'halka-zemin' }),
      ...halkaCiz(51, 13, 'gercek', 'halka-gercek'),
      ...halkaCiz(35, 11, 'hedef', 'halka-hedef'),
      S('text', { x: 60, y: 57, class: 'halka-merkez', 'text-anchor': 'middle', text: 'iç: hedef' }),
      S('text', { x: 60, y: 69, class: 'halka-merkez', 'text-anchor': 'middle', text: 'dış: gerçek' })
    ]);
  }

  const MODEL_SEKME = { 'm-qqq-m10': 'nasdaq', 'm-bist-m10': 'bist', 'm-837': 'q837' };
  // Denetim A-15: tek görünen ad — sunucunun model adıyla aynı (lib/tasarimci/katalog.js "%50 QQQ + %50 Hücum").
  // 72.0: ad kimlikten (js/core/sozluk.js AG.botAd) — Nova / Lydia / Simurg.
  const BA = (id, yedek) => (AG.botAd && AG.botAd.ad(id)) || yedek;
  const GA = (b) => (AG.botAd ? AG.botAd.gorunen(b) : (b && (b.adGorunen || b.ad)) || '');
  const MODEL_KISA = { 'm-qqq-m10': 'Nova', 'm-bist-m10': 'Lydia', 'm-837': 'Simurg' };
  const MODEL_SIRA = ['m-837', 'm-qqq-m10', 'm-bist-m10'];
  /** Portföy ekranını belirli alt sayfada açar (Pano / Hesaplar / Hedefim / model). */
  function portfoyAc(alt) {
    const pf = AG.pages && AG.pages.portfoy;
    if (pf && typeof pf.altSekme === 'function') { try { pf.altSekme(alt); } catch (e) { /* Portföy ekranı yine açılır */ } }
    if (AG.rota) AG.rota.git('portfoy');
  }
  const gitDugme = (metin, hedef, id) => el(typeof hedef === 'string' ? 'a' : 'button', typeof hedef === 'string'
    ? { class: 'ana-kart-bag no-underline', href: hedef, id: id || null }
    : { type: 'button', class: 'ana-kart-bag', id: id || null, onclick: hedef }, [el('span', { text: metin })]);

  // ═══ SAF HESAPLAR ═══════════════════════════════════════════════════════

  /** Saf: Portföyüm özeti → { toplamUSD, ay, asim, bant, bos } (kayıt yoksa bos). */
  function portfoyumOzeti(pm) {
    if (!pm || pm.success === false || !pm.degerleme) return { bos: true, hata: pm && pm.error ? pm.error : null };
    const d = pm.degerleme, u = (pm.getiri && pm.getiri.USD) || {};
    const kayit = (pm.kayitSayisi || 0) > 0 || Number(d.toplamUSD) > 0;
    if (!kayit) return { bos: true };
    const dag = pm.dagilim || {};
    return { bos: false, toplamUSD: Number(d.toplamUSD) || 0, toplamTL: Number(d.toplamTL) || null, ay: sayiMi(u.ay) ? u.ay : null,
      asim: dag.hedefVar ? (dag.asimSayisi || 0) : null, bant: dag.bant || null, hedefVar: !!dag.hedefVar };
  }

  /**
   * Saf: model portföylerin kullanıcıdan beklediği işler — aynı türden işler TEK kayıtta toplanır.
   * → { emir: { modeller: [{ id, ad, gec }], gec, ton } | null, liste: { modeller, uygulamaGunu } | null, bant837: { pay } | null }
   */
  function modelIsleri({ oneri, emirler, bugun }) {
    const emirBekleyen = [];
    let bant837 = null;
    for (const m of (emirler && emirler.modeller) || []) {
      const ug = m.liste && m.liste.uygulamaGunu;
      if ((m.durum === 'bekliyor' || m.durum === 'kismi') && ug && ug <= bugun) emirBekleyen.push({ id: m.id, ad: MODEL_KISA[m.id] || m.ad, gec: gunFarki(bugun, ug), kismi: m.durum === 'kismi' });
      const k8 = m.liste && m.liste.kol837;
      if (m.id === 'm-837' && k8 && !k8.ilk && k8.disi && m.durum !== 'uygulandi' && m.durum !== 'atlandi') bant837 = { pay: k8.hucumPay || 0 };
    }
    const hazir = [];
    let uygulamaGunu = null;
    for (const m of (oneri && oneri.modeller) || []) {
      const k = m.karar;
      if (!k || m.uygulandi || m.id === 'm-837') continue;
      if (gunFarki(bugun, k.kararGunu) <= 31 && k.uygulamaGunu >= bugun) { hazir.push({ id: m.id, ad: MODEL_KISA[m.id] || m.ad }); uygulamaGunu = uygulamaGunu && uygulamaGunu < k.uygulamaGunu ? uygulamaGunu : k.uygulamaGunu; }
    }
    const gec = emirBekleyen.reduce((a, x) => Math.max(a, x.gec), 0);
    return {
      emir: emirBekleyen.length ? { modeller: emirBekleyen, gec, ton: gec > 3 ? 'tehlike' : 'uyari' } : null,
      liste: hazir.length ? { modeller: hazir, uygulamaGunu } : null,
      bant837
    };
  }

  /** Saf: "A, B ve C" */
  const listele = (l) => (l.length <= 1 ? (l[0] || '') : `${l.slice(0, -1).join(', ')} ve ${l[l.length - 1]}`);

  // ═══ YAPMAN GEREKENLER ══════════════════════════════════════════════════
  const ONCELIK = { tehlike: 0, uyari: 1, bilgi: 2 };

  /**
   * Saf: yalnız kullanıcının elle yapacağı işler → [{ metin, ton: 'tehlike'|'uyari'|'bilgi', etiket?, href?, eylem? }].
   * Coin tarama notları, veri hataları ve model verisi tazeliği BURADA YOK (62.8 kullanıcı kararı) — Sistem kartının ışığında.
   */
  function yapilacaklar({ pm, oneri, durumlar, bugun, guncelleme, emirler }) {
    const l = [];
    const ekle = (ton2, metin, hedef, etiket) => l.push({ ton: ton2, metin, etiket: etiket || null, ...(typeof hedef === 'function' ? { eylem: hedef } : { href: hedef || null }) });
    // Otomatik güncelleme (61.3, lib/guncelleme.js): onayınızı ya da elle müdahalenizi bekleyenler.
    const g = guncelleme;
    if (g && !g.gelistirme) {
      if (g.durum === 'onay') ekle('uyari', `Pusula ${g.hedefSurum || 'yeni sürüm'} kurulmayı bekliyor — bot kodu değişti, onayınız gerekli (Ayarlar › Güncelleme)`, '#/ayarlar/guncelleme', 'onay');
      else if (g.durum === 'elle' || g.durum === 'geri-alindi') ekle('tehlike', `Güncelleme: ${g.durum === 'geri-alindi' ? `${g.hedefSurum || 'yeni sürüm'} kurulamadı, geri alındı` : 'elle bakılmalı'} — ${String(g.neden || '').slice(0, 140)}`, '#/ayarlar/guncelleme', 'güncelleme');
      else if (g.durum === 'yeniden-baslat') ekle('uyari', 'Güncelleme indirildi: Pusula yeniden başlatılmalı', '#/ayarlar/guncelleme', 'güncelleme');
    }
    (durumlar || []).forEach((d, i) => {
      const adY = BA(BOTLAR[i], String(BOTLAR[i] || 'bot'));
      if (!d || !d.success || !d.bot) { ekle('tehlike', `${adY}: durum alınamadı${d && d.error ? ` (${d.error})` : ''}`, '#/botlar', 'bot'); return; }
      const b = d.bot, ad = BA(b.ad || BOTLAR[i], adY);
      const du = D().durum(b);
      if (du.onayBekliyor) ekle('tehlike', `${ad} durduruldu — onayınızı bekliyor: ${du.neden}`, '#/botlar', 'onay');
      else if (b.model && b.model.durum === 'DUR') ekle('tehlike', `${ad}: modelin düşüş sınırı aşıldı — durdurmayı değerlendirin`, '#/botlar', 'bot');
      const kp = D().kalp(b);
      if (b.calisiyor && kp.gecikti) ekle('tehlike', `${ad} 26 saattir çalışmadı (son çalışma ${kp.metin.replace(/ — 26 saati geçti$/, '')})`, '#/botlar', 'bot');
      const modAd = D().mod(d, b);
      const mj = D().marj(b, modAd);
      if (mj.seviye === 'alarm' || mj.seviye === 'uyari') ekle(mj.seviye === 'alarm' ? 'tehlike' : 'uyari', `${ad} teminat: ${mj.metin}`, '#/botlar', 'bot');
      const kr = D().koruma(b, modAd);
      if (kr.sorun) ekle('tehlike', `${ad} koruma stopu ${kr.metin}`, '#/botlar', 'bot');
      if (!du.onayBekliyor && b.uygulama && b.uygulama.bant === 'incele') ekle('uyari', `${ad}: gerçek sonuç simülasyondan ayrılıyor (${D().sapma(b).metin})`, '#/botlar', 'bot');
    });
    const mi = modelIsleri({ oneri, emirler, bugun });
    if (mi.emir) {
      const ilk = mi.emir.modeller[0];
      const n = mi.emir.modeller.length;
      ekle(mi.emir.ton, `${n > 1 ? `${n} modelin` : `${ilk.ad}:`} bu ayki emirleri Midas'a girilmedi${n > 1 ? ` — ${listele(mi.emir.modeller.map(x => x.ad))}` : ''}. Girdikten sonra Bu ay › Uyguladım.`,
        () => portfoyAc(MODEL_SEKME[ilk.id] || 'nasdaq'), mi.emir.gec > 0 ? `${mi.emir.gec} gün gecikti` : 'bugün');
    }
    if (mi.bant837) ekle('uyari', `Simurg: Kairos payı bant dışında (%${Math.round(mi.bant837.pay * 100)}) — QQQ ↔ Binance dengeleme gerekiyor`, () => portfoyAc('q837'), 'dengele');
    if (mi.liste && !mi.emir) ekle('bilgi', `Ay sonu listesi hazır: ${listele(mi.liste.modeller.map(x => x.ad))} — ${D().gunAdi(mi.liste.uygulamaGunu, true)} açılışında uygulanacak`,
      () => portfoyAc(MODEL_SEKME[mi.liste.modeller[0].id] || 'nasdaq'), 'liste hazır');
    // Portföyüm: kayıt yoksa bilgi, hedef bandı aşımı uyarı.
    const p = portfoyumOzeti(pm);
    if (p.bos) ekle('bilgi', 'Portföyüne hesap ve varlıklarını gir (Portföy › Hesaplar)', () => portfoyAc('hesaplar'), 'başlangıç');
    else if (p.asim) ekle('uyari', `Portföyüm: ${p.asim} varlık hedef bandının dışında (±${Math.round((p.bant || 0) * 100)} puan)`, () => portfoyAc('hedefim'), 'dengele');
    return l.sort((a, b) => ONCELIK[a.ton] - ONCELIK[b.ton]);
  }

  function yapilacaklarCiz(liste) {
    const k = bul('anaYapilacaklar');
    if (!k) return;
    const IKON = { tehlike: 'alert-octagon', uyari: 'alert-triangle', bilgi: 'info' };
    const govde = !liste.length
      ? el('p', { class: 'yapilacak-bos tone-success mb-0' }, [el('i', { 'data-lucide': 'check-circle-2', class: 'icon-16' }), el('span', { text: ' Yapman gereken bir şey yok — her şey yolunda.' })])
      : el('ul', { class: 'yapilacak-liste' }, liste.map(x => {
        const icerik = [el('i', { 'data-lucide': IKON[x.ton], class: 'icon-16' }), x.etiket ? el('span', { class: `yapilacak-etiket yapilacak-etiket-${x.ton}`, text: x.etiket }) : null, el('span', { text: x.metin })];
        const ic = x.eylem ? el('button', { type: 'button', class: 'yapilacak-baglanti', onclick: x.eylem }, icerik)
          : x.href ? el('a', { class: 'yapilacak-baglanti', href: x.href }, icerik) : el('span', { class: 'yapilacak-baglanti' }, icerik);
        return el('li', { class: `yapilacak yapilacak-${x.ton}` }, [ic]);
      }));
    doldur(k, [baslik('list-todo', `Yapman gerekenler${liste.length ? ` (${liste.length})` : ''}`), govde]);
  }

  // ═══ 1. BOTLAR ══════════════════════════════════════════════════════════
  /** Saf: hesap türü satırı ("Binance demo — canlı hesap değil"). */
  const turMetni = (modAd) => (modAd === 'demo' ? 'Binance demo — canlı hesap değil' : modAd === 'canlı hesap' ? 'Binance — CANLI HESAP' : 'kâğıt hesap — canlı hesap değil');
  /** Saf: başlangıçtan getiri (eğriden) — botlar.js egriOzeti varsa onu kullanır (tek tanım). */
  function egriOzeti(egri) {
    if (AG.pages && AG.pages.botlar && AG.pages.botlar.egriOzeti) return AG.pages.botlar.egriOzeti(egri);
    const l = (egri || []).filter(x => sayiMi(x.gercek) && x.gercek > 0);
    if (l.length < 2) return { getiri: null, btcGetiri: null };
    const b0 = l.find(x => sayiMi(x.btc) && x.btc > 0), b1 = [...l].reverse().find(x => sayiMi(x.btc) && x.btc > 0);
    return { getiri: l[l.length - 1].gercek / l[0].gercek - 1, btcGetiri: b0 && b1 && b1 !== b0 ? b1.btc / b0.btc - 1 : null };
  }

  function botKarti(ad, d, bugun, egri) {
    const yedekAd = BA(ad, ad === 'hucum' ? 'Kairos' : 'Tao');
    if (!d || !d.success || !d.bot) {
      return el('div', { class: `saglik-kart ana-bot ana-bot-${ad}`, id: `anaBot-${ad}` }, [
        el('div', { class: 'saglik-ust' }, [el('strong', { text: yedekAd })]),
        el('p', { class: 'tone-danger hint-sm mb-0', text: `durum alınamadı${d && d.error ? ': ' + d.error : ''}` })
      ]);
    }
    const b = d.bot, L = D();
    const modAd = L.mod(d, b);
    const du = L.durum(b), ka = L.karar(b, bugun), kr = L.koruma(b, modAd), kp = L.kalp(b);
    const E = L.ozsermaye(d);
    const oz = egriOzeti(egri || []);
    const satir = (etiket, metin, tonAd, yardimK, title, id) => [
      el('dt', null, [el('span', { text: etiket }), yardimK ? yardim(yardimK) : null]),
      el('dd', { class: ton(tonAd) || null, text: metin, title: title || null, id: id || null })
    ];
    const getiriMetni = oz.getiri == null ? '—' : `${isaretliYz(oz.getiri)}${oz.btcGetiri != null ? ` (BTC ${isaretliYz(oz.btcGetiri)})` : ''}`;
    const neYapmali = du.onayBekliyor ? `Botlar › ${yedekAd} — nedeni okuyup onaylayın`
      : !b.calisiyor ? `Botlar › ${yedekAd} › Başlat` : null;
    return el('div', { class: `saglik-kart ana-bot ana-bot-${ad}${du.onayBekliyor ? ' saglik-kart-dur' : ''}`, id: `anaBot-${ad}` }, [
      el('div', { class: 'saglik-ust row-between' }, [
        el('strong', { class: 'ana-bot-ad', text: yedekAd, title: AG.botAd ? AG.botAd.anlam(ad) : null }),
        el('span', { class: `bot-durum-buyuk ${du.ton === 'iyi' ? 'bot-durum-iyi' : du.ton === 'tehlike' ? 'bot-durum-tehlike' : 'bot-durum-uyari'}`, title: du.ham || null }, [
          el('span', { class: 'bot-durum-isik', 'aria-hidden': 'true' }), el('span', { text: du.metin })])
      ]),
      el('p', { class: 'hint hint-sm mb-0', text: turMetni(modAd) }),
      arastirmaMu() ? el('p', { class: 'hint hint-sm bot-eski-kayit mb-0', text: 'Bu bilgisayardaki eski kayıt — asıl durum sunucudaki panelde.' }) : null,
      du.onayBekliyor ? el('p', { class: 'saglik-neden mb-0', text: `Neden: ${du.neden}` }) : null,
      el('dl', { class: 'kv-list kv-sik mb-0' }, [
        ...satir('Hesap değeri', E != null ? `${L.para(E)} USDT` : '—', '', null, null, `anaBotDeger-${ad}`),
        ...satir('Başlangıçtan', getiriMetni, oz.getiri == null ? '' : oz.getiri >= 0 ? 'iyi' : 'tehlike', null, oz.bas ? `${L.gunAdi(oz.bas)}'den bu yana; parantezde aynı dönemde BTC al-tut` : null),
        ...satir('Son karar', ka.metin, '', null, `son çalışma: ${kp.metin}`),
        ...satir('Koruma stopu', kr.metin, kr.ton, 'felaketStopu', kr.ayrinti),
        ...(neYapmali ? satir('Ne yapmalı', neYapmali, du.onayBekliyor ? 'tehlike' : 'uyari') : [])
      ])
    ]);
  }

  function botSagligiCiz(durumlar, bugun, egriler) {
    const k = bul('anaBotSagligi');
    if (!k) return;
    bugun = bugun || bugunStr();
    doldur(k, [
      el('div', { class: 'row-between row-wrap gap-2' }, [baslik('bot', 'Botlar'), gitDugme('Ayrıntı ve yönetim: Botlar ›', '#/botlar', 'btnAnaBotlar')]),
      el('div', { class: 'saglik-serit' }, BOTLAR.map((ad, i) => botKarti(ad, durumlar[i], bugun, (egriler || {})[ad])))
    ]);
  }

  // ═══ 2. PORTFÖYÜM ═══════════════════════════════════════════════════════
  function portfoyCiz(veri) {
    const k = bul('anaPortfoy');
    if (!k) return;
    const pm = portfoyumOzeti((veri || {}).portfoyum);
    const ust = el('div', { class: 'row-between row-wrap gap-2' }, [baslik('pie-chart', 'Portföyüm'), pm.asim ? el('span', { class: 'pf-is-sayi', text: `${pm.asim} iş` }) : null]);
    if (pm.bos) {
      doldur(k, [ust, el('p', { class: 'hint mb-3', text: 'Henüz kayıt yok. Hesaplarını ve varlıklarını Portföy › Hesaplar\'da gir; toplam ve getiri burada görünür.' }),
        gitDugme('Hesaplar ›', () => portfoyAc('hesaplar'), 'btnAnaPortfoyum')]);
      return;
    }
    doldur(k, [ust,
      el('span', { class: 'ana-buyuk-sayi sayi', id: 'anaPortfoyToplam', text: usd(pm.toplamUSD) }),
      el('p', { class: 'mb-0 hint-sm' }, [
        el('span', { class: `sayi ${pm.ay == null ? '' : pm.ay >= 0 ? 'tone-success' : 'tone-danger'}`, text: isaretliYz(pm.ay) }), el('span', { text: ' bu ay' }), yardim('twr'),
        pm.toplamTL ? el('span', { class: 'hint', text: ` · ≈ ${Math.round(pm.toplamTL).toLocaleString('tr-TR')} TL` }) : null]),
      pm.asim ? gitDugme(`${pm.asim} varlık hedef bandı dışında ›`, () => portfoyAc('hedefim'), 'btnAnaHedef')
        : gitDugme('Pano ›', () => portfoyAc('pano'), 'btnAnaPortfoyum')
    ]);
  }

  // ═══ 3. MODELLER (tek satır) ════════════════════════════════════════════
  function modellerCiz({ modeller, oneri, emirler, bugun }) {
    const k = bul('anaModeller');
    if (!k) return;
    const mm = ((modeller && modeller.modeller) || []).filter(m => MODEL_SIRA.includes(m.id));
    const mi = modelIsleri({ oneri, emirler, bugun: bugun || bugunStr() });
    const say = mm.length || MODEL_SIRA.length;
    const n = mi.emir ? mi.emir.modeller.length : 0;
    const [isikTon, metin, rozet] = mi.emir ? [mi.emir.ton, `${say} model izleniyor — ${n >= say ? 'bu ayki emirler' : n > 1 ? `${n} modelin bu ayki emirleri` : `${mi.emir.modeller[0].ad} emirleri`} Midas'a girilmedi`, 'emir bekliyor']
      : mi.liste ? ['iyi', `${say} model izleniyor — ay sonu listesi hazır (${D().gunAdi(mi.liste.uygulamaGunu)} uygulanacak)`, 'liste hazır']
        : !modeller ? ['uyari', 'Model verisi alınamadı', null]
          : ['iyi', `${say} model izleniyor — bekleyen iş yok`, null];
    const hedef = mi.emir ? MODEL_SEKME[mi.emir.modeller[0].id] : 'nasdaq';
    doldur(k, [
      el('div', { class: 'row-between row-wrap gap-2' }, [baslik('layers', 'Modeller', yardim('modelPortfoy')), rozet ? el('span', { class: 'pf-is-sayi', text: rozet }) : null]),
      el('p', { class: 'ana-isik-satir mb-2', id: 'anaModelSatir' }, [el('span', { class: `borsa-isik borsa-isik-${isikTon}`, 'aria-hidden': 'true' }), el('span', { text: metin })]),
      gitDugme('Modeller ›', () => portfoyAc(hedef || 'nasdaq'), 'btnAnaBuAy'),
      // 68.8: modellerin kâğıt hesapları Botlar'da kendi sayfasında (js/pages/portfoyBotlari.js)
      el('p', { class: 'hint hint-sm mb-0 mt-2', id: 'anaPortfoyBotlari' }, [el('span', { text: 'Portföy botları (kâğıt hesap): ' }),
        ...[['m-qqq-m10', 'Nova'], ['m-bist-m10', 'Lydia'], ['m-837', 'Simurg']].flatMap(([id, ad], i) => [i ? el('span', { text: ' · ' }) : null, el('a', { href: `#/botlar/${id}`, class: 'no-underline', text: BA(id, ad), title: AG.botAd ? AG.botAd.tam(id) : null })]).filter(Boolean)])
    ]);
  }

  // ═══ 4. SİSTEM (yalnız ışık) ════════════════════════════════════════════
  /** Saf: üç ışık → [{ kimlik, ton: 'iyi'|'uyari'|'tehlike'|'notr', metin, href }]. Bilgi notu metni YAZILMAZ; yalnız özet. */
  /**
   * 69.1 ÖZ DENETİM (Sistem › Sağlık): kapalı / güvenli kipteki bot, sonra hata ve uyarı satırları (en çok 3); sorun yoksa tek
   * yeşil satır. Diğer ışıklar (veri, borsa, günlük, sürüm) aynen altta. `oz` yoksa (eski sunucu) satır gri.
   */
  function ozIsiklari(oz) {
    if (!oz || !Array.isArray(oz.denetimler)) return [{ kimlik: 'oz', ton: 'notr', metin: 'Öz denetim okunamadı', href: '#/saglik' }];
    const l = [];
    for (const b of oz.botlar || []) {
      if (b.engel) l.push({ kimlik: `oz-bot-${b.ad}`, ton: 'tehlike', metin: `${GA(b)} tamamen kapalı — siz açana kadar çalışmaz`, href: '#/saglik' });
      else if (b.guvenliKip) l.push({ kimlik: `oz-bot-${b.ad}`, ton: 'uyari', metin: `${GA(b)} güvenli kipte — yeni işlem açmıyor`, href: '#/saglik' });
    }
    const sorunlu = (oz.denetimler || []).filter(d => d.durum === 'hata' || d.durum === 'uyari').sort((a, b) => (a.durum === 'hata' ? 0 : 1) - (b.durum === 'hata' ? 0 : 1));
    for (const d of sorunlu.slice(0, 3)) l.push({ kimlik: `oz-${d.kimlik}`, ton: d.durum === 'hata' ? 'tehlike' : 'uyari', metin: `${d.ad}: ${String(d.ayrinti || '').slice(0, 90)}`, href: '#/saglik' });
    if (sorunlu.length > 3) l.push({ kimlik: 'oz-daha', ton: 'notr', metin: `+ ${sorunlu.length - 3} sorun daha`, href: '#/saglik' });
    if (!l.length) {
      const o = oz.ozet || {};
      l.push({ kimlik: 'oz', ton: oz.calisiyor === false && !o.sonYoklama ? 'notr' : 'iyi',
        metin: oz.calisiyor === false && !o.sonYoklama ? 'Öz denetim sunucuda çalışır' : `${o.tamam || 0} / ${o.toplam || 0} denetim tamam`, href: '#/saglik' });
    }
    return l;
  }

  function sistemIsiklari({ veri, tdurum, hesaplar, guncelleme, gunluk, oz }) {
    const l = oz === undefined ? [] : ozIsiklari(oz);
    // Veri: güncellenemeyen kaynak / Binance bekleme / model verisi bayat / bayat (gece güncellenir).
    if (!veri) l.push({ kimlik: 'veri', ton: 'notr', metin: 'Veri durumu alınamadı', href: '#/veri' });
    else {
      const hatali = (veri.kaynaklar || []).filter(s => s.durum === 'hata').length || (!veri.kaynaklar && veri.ozet && veri.ozet.hata) || 0;
      const bayat = (veri.ozet && veri.ozet.bayat) || 0;
      const modelBayat = !!(tdurum && tdurum.tazelik && tdurum.tazelik.bayat);
      if (hatali) l.push({ kimlik: 'veri', ton: 'uyari', metin: `${hatali} veri kaynağı güncellenemedi`, href: '#/veri' });
      else if (veri.binanceBekleme) l.push({ kimlik: 'veri', ton: 'uyari', metin: 'Binance hız sınırı — veri güncellemesi ertelendi', href: '#/veri' });
      else if (modelBayat) l.push({ kimlik: 'veri', ton: 'uyari', metin: 'Model portföy verisi bayat', href: '#/veri' });
      else if (bayat && !veri.calisiyor) l.push({ kimlik: 'veri', ton: 'notr', metin: `${bayat} kaynak bayat — gece güncellenir`, href: '#/veri' });
      else l.push({ kimlik: 'veri', ton: 'iyi', metin: veri.calisiyor ? 'Veri güncelleniyor…' : 'Veri güncel', href: '#/veri' });
    }
    // Borsa hesapları (62.7): okunamayan hesap tehlike; borsaya bağlı hesap varsa iyi; yoksa gri.
    const bl = (hesaplar && hesaplar.baglantilar) || null;
    if (!bl) l.push({ kimlik: 'borsa', ton: 'notr', metin: 'Bot hesapları okunamadı', href: '#/botlar/hucum/hesap' });
    else {
      const borsada = bl.filter(b => b.hesap === 'testnet' || b.hesap === 'live' || b.ortam === 'testnet' || b.ortam === 'live');
      const hatali = borsada.filter(b => b.bagli && b.hata);
      if (hatali.length) l.push({ kimlik: 'borsa', ton: 'tehlike', metin: `${hatali.length} borsa hesabı okunamıyor`, href: '#/botlar/hucum/hesap' });
      else if (borsada.some(b => b.bagli)) l.push({ kimlik: 'borsa', ton: 'iyi', metin: 'Bot hesapları okunuyor', href: '#/botlar/hucum/hesap' });
      else l.push({ kimlik: 'borsa', ton: 'notr', metin: 'Borsaya bağlı hesap yok (botlar durdu)', href: '#/botlar/hucum/hesap' });
    }
    // PLAN-PANEL-2: son 24 saatin günlüğü (lib/gunluk.js) — hata varsa kırmızı, yalnız uyarı varsa sarı; Sistem › Günlükler'e gider.
    const gs = gunluk && gunluk.ozet && gunluk.ozet.sayilar;
    if (gs) {
      if (gs.hata) l.push({ kimlik: 'gunluk', ton: 'tehlike', metin: `Son 24 saatte ${gs.hata} hata`, href: '#/gunluk' });
      else if (gs.uyari) l.push({ kimlik: 'gunluk', ton: 'uyari', metin: `Son 24 saatte ${gs.uyari} uyarı, hata yok`, href: '#/gunluk' });
      else l.push({ kimlik: 'gunluk', ton: 'iyi', metin: 'Son 24 saatte hata yok', href: '#/gunluk' });
    }
    // Pusula sürümü / otomatik güncelleme.
    const g = guncelleme;
    // app.js'teki APP_VERSION (klasik betik, genel kapsam) — geliştirme kopyasında güncelleme kaydında sürüm yok.
    const surum = (g && g.kurulu && g.kurulu.surum) || (typeof APP_VERSION !== 'undefined' ? APP_VERSION : null); // eslint-disable-line no-undef
    if (!g) l.push({ kimlik: 'surum', ton: 'notr', metin: 'Güncelleme durumu alınamadı', href: '#/ayarlar/guncelleme' });
    else if (g.gelistirme) l.push({ kimlik: 'surum', ton: 'notr', metin: `Pusula ${surum || ''} — geliştirme kopyası`.replace('  ', ' '), href: '#/ayarlar/guncelleme' });
    else if (g.durum === 'onay') l.push({ kimlik: 'surum', ton: 'uyari', metin: `Pusula ${g.hedefSurum || 'yeni sürüm'} onay bekliyor`, href: '#/ayarlar/guncelleme' });
    else if (g.durum === 'elle' || g.durum === 'geri-alindi' || g.durum === 'yeniden-baslat') l.push({ kimlik: 'surum', ton: 'tehlike', metin: 'Güncellemeye elle bakılmalı', href: '#/ayarlar/guncelleme' });
    else if (g.durum === 'ag-hatasi' && (g.agHatasi || 0) >= 3) l.push({ kimlik: 'surum', ton: 'uyari', metin: `Güncelleme kontrolü ${g.agHatasi} gündür yapılamıyor`, href: '#/ayarlar/guncelleme' });
    else l.push({ kimlik: 'surum', ton: 'iyi', metin: `Pusula ${surum || ''} kurulu`.replace('  ', ' '), href: '#/ayarlar/guncelleme' });
    return l;
  }

  function sistemCiz(girdi) {
    const k = bul('anaSistem');
    if (!k) return;
    const l = sistemIsiklari(girdi || {});
    const enKotu = l.some(x => x.ton === 'tehlike') ? 'sorun var' : l.some(x => x.ton === 'uyari') ? 'dikkat' : null;
    doldur(k, [
      el('div', { class: 'row-between row-wrap gap-2' }, [baslik('activity', 'Sistem sağlığı'), enKotu ? el('span', { class: 'pf-is-sayi', text: enKotu }) : null]),
      el('ul', { class: 'ana-isik-liste', id: 'anaSistemListe' }, l.map(x => el('li', { class: 'ana-isik-satir', 'data-kimlik': x.kimlik }, [
        el('span', { class: `borsa-isik borsa-isik-${x.ton}`, 'aria-hidden': 'true' }),
        el('a', { class: 'no-underline', href: x.href, text: x.metin })
      ]))),
      el('a', { class: 'ana-saglik-ac', href: '#/saglik', id: 'lnkAnaSaglik', text: 'Sağlık sayfasını aç →' })
    ]);
  }

  // ═══ YÜKLEME ════════════════════════════════════════════════════════════
  /** Botların eğrisi (başlangıçtan getiri için) — 5 dk önbellek; okunamazsa boş. */
  async function egriAl(ad) {
    const o = grafikOnbellek[ad];
    if (o && Date.now() - o.zaman < GRAFIK_MS) return o.egri;
    let egri = [];
    try { const r = AG.api.bindirmeGrafik ? await AG.api.bindirmeGrafik(ad) : null; egri = (r && r.success !== false && r.ozsermaye && r.ozsermaye.egri) || []; } catch (e) { egri = (o && o.egri) || []; }
    grafikOnbellek[ad] = { zaman: Date.now(), egri };
    return egri;
  }

  async function yukle() {
    if (yukleniyor || !bul('anaBotSagligi')) return;
    yukleniyor = true;
    try {
      const tz = AG.api.tasarimci;
      const [durumlar, egriListe, pm, veri, modeller, oneri, tdurum, guncelleme, emirler, hesaplar, gunluk, oz] = await Promise.all([
        Promise.all(BOTLAR.map(ad => AG.api.bindirmeDurum(ad).catch(e => ({ success: false, error: e.message })))),
        Promise.all(BOTLAR.map(ad => egriAl(ad))),
        AG.api.portfoyum ? AG.api.portfoyum.ozet().catch(() => null) : Promise.resolve(null),
        AG.api.veri.durum().catch(() => null),
        tz ? tz.modeller().catch(() => null) : Promise.resolve(null),
        tz ? tz.oneri().catch(() => null) : Promise.resolve(null),
        tz ? tz.durum().catch(() => null) : Promise.resolve(null),
        AG.api.guncelleme ? AG.api.guncelleme.durum().catch(() => null) : Promise.resolve(null),
        tz && tz.emirler ? tz.emirler().catch(() => null) : Promise.resolve(null),
        AG.api.hesaplar ? AG.api.hesaplar(false).catch(() => null) : Promise.resolve(null),
        AG.api.gunluk ? AG.api.gunluk.liste({ limit: 1 }).catch(() => null) : Promise.resolve(null),
        AG.api.saglikOz ? AG.api.saglikOz.durum().catch(() => null) : Promise.resolve(null)
      ]);
      const bugun = bugunStr();
      const ok = (x) => (x && x.success !== false ? x : null);
      const egriler = {}; BOTLAR.forEach((ad, i) => { egriler[ad] = egriListe[i]; });
      botSagligiCiz(durumlar, bugun, egriler);
      yapilacaklarCiz(yapilacaklar({ pm: ok(pm), oneri: ok(oneri), durumlar, bugun, guncelleme: ok(guncelleme), emirler: ok(emirler) }));
      portfoyCiz({ portfoyum: ok(pm) });
      modellerCiz({ modeller: ok(modeller), oneri: ok(oneri), emirler: ok(emirler), bugun });
      sistemCiz({ veri: ok(veri), tdurum: ok(tdurum), hesaplar: ok(hesaplar), guncelleme: ok(guncelleme), gunluk: ok(gunluk), oz: ok(oz) });
      if (ok(oz) && AG.pages.saglik) AG.pages.saglik.rozetGuncelle(oz);
      ikonla();
    } finally {
      yukleniyor = false;
    }
  }

  function acildi() {
    yukle();
    if (!zamanlayici) zamanlayici = global.setInterval(() => { if (AG.rota && AG.rota.acikMi('tab-ana')) yukle(); }, YENILEME_MS);
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-ana') acildi(); });
  }

  AG.pages = AG.pages || {};
  AG.pages.anasayfa = { yukle, botSagligiCiz, botKarti, portfoyCiz, modellerCiz, sistemCiz, sistemIsiklari, ozIsiklari, modelIsleri, yapilacaklarCiz, portfoyumOzeti, dilimler, yapilacaklar, halka, portfoyAc, turMetni };
})(typeof window !== 'undefined' ? window : globalThis);
