/**
 * PORTFÖY BOTLARI — Botlar › QQQ M10 · BIST M10 · 837 (68.8, kullanıcı 2026-10-20; onaylı taslak) `AG.pages.portfoyBotlari`
 * ═══════════════════════════════════════════════════════════════════════════
 * Model portföylerin kâğıt hesapları (lib/tasarimci/kagit.js) Hücum / Denge gibi izlenen BOTLAR: her bot yan menüde kendi öğesi
 * ve kendi sayfası (#/botlar/m-qqq-m10 · m-bist-m10 · m-837) — sayfa içi sekme YOK. js/pages/botlar.js `ag:rota`da alt yol bir
 * portföy botuysa Hücum/Denge görünümlerini gizler ve `ac(id)` çağırır; Hücum/Denge'ye dönünce `kapat()`.
 * Sayfa (taslaktaki sırayla), kap #pbotKap › article#pbotKart-<kısa>:
 *   başlık   simge · ad · "kâğıt hesap" · borsa/para · kural (düz Türkçe, hisseYapilari.NE_YAPAR) · sunucu kaynağı
 *   (a) sayılar   özsermaye (yatırılan) · getiri · kıyas al-tut (aynı günler) · en derin düşüş · model ↔ kâğıt fark · işlem + komisyon
 *                 (+ sıradaki karar)
 *   (b) "Portföy değeri ve karar günleri"  değer çizgisi + kesikli kıyas + dikey karar uygulama günleri; imleç → o günün kararı
 *   (c) "Hisse grafiği — nerede aldı, nerede sattı"  elde + geçmişteki hisse çipleri; günlük kapanış + ▲ alış / ▼ satış;
 *       imleç → o günün işlemleri (adet, fiyat, komisyon, karar). Fiyat: GET /api/tasarimci/portfoy-bot/:id/fiyat (kâğıt hesabın
 *       kullandığı ham seri)
 *   (d) "Eldeki hisseler"  maliyet (komisyon dahil), son, değer, K/Z %, pay + nakit (837: Hücum kolu satırı)
 *   (e) "Karar defteri"  sıradaki karar + her ay sonu kararı: liste, puan, alındı ✓ / elde kaldı / satıldı / alınamadı (neden);
 *       "Bu günü grafikte göster" → (b)'de o gün vurgulanır ve kaydırılır. 837: ilk yerleşim + dengeleme günleri.
 *   (f) "İşlem geçmişi"  tarih, işlem, hisse, adet, fiyat, tutar, komisyon, gerçekleşen K/Z, neden · CSV indir
 * Veri: GET /api/tasarimci/portfoy-bot/:id (lib/tasarimci/portfoyBot.js). Resmî kayıt sunucuda: geliştirme bilgisayarında uç
 * lib/evOkuma.js ile sunucudan okunur; sunucu eski sürümse (uç yok → "(404,") sakin "Sunucu güncellenince görünür" bandı.
 * Telefonda "tutarları gizle" açıksa tutarlar "—", grafik yüzde (100 taban). YALNIZ OKUR. Kurallar: AG.dom, AG.tablo, AG.grafik;
 * inline stil yok.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);

  const SIRA = ['m-qqq-m10', 'm-bist-m10', 'm-837'];
  const KISA = { 'm-qqq-m10': 'qqq', 'm-bist-m10': 'bist', 'm-837': 'q837' };
  /** 72.0: görünen ad kimlikten (js/core/sozluk.js AG.botAd); sunucunun x.ad metni kullanılmaz. */
  const AD_YEDEK = { 'm-qqq-m10': 'Nova', 'm-bist-m10': 'Lydia', 'm-837': 'Simurg' };
  const AD = new Proxy(AD_YEDEK, { get: (t, id) => (AG.botAd && AG.botAd.ad(id)) || t[id] });
  const CV = (s) => (AG.botAd && typeof s === 'string' ? AG.botAd.cevir(s) : s);
  const KOL = 'Kairos kolu';
  const SIMGE_KISA = { 'm-qqq-m10': 'NV', 'm-bist-m10': 'LY', 'm-837': 'SM' };   // 72.0: Nova · Lydia · Simurg (hisseYapilari.js ile aynı)
  const PIYASA = { 'm-qqq-m10': 'ABD · USD · Midas', 'm-bist-m10': 'BIST · TL · Midas', 'm-837': 'ABD + Binance · USD' };
  const SIMGE = { USD: '$', TRY: '₺' };
  const TUR_AD = { al: 'AL', sat: 'SAT', yatir: 'YATIR', cek: 'ÇEK', temettu: 'Temettü', bolunme: 'Bölünme', aktarim: 'Aktarım (Kairos kolu)' };
  const SONUC = {
    alindi: ['Alındı ✓', 'pf-rozet-iyi'], eldeKaldi: ['Elde kaldı', 'pf-rozet-bilgi'], bekliyor: ['Bekliyor', 'pf-rozet-uyari'],
    alinamadi: ['Alınamadı', 'pf-rozet-uyari'], gelecek: ['Uygulanacak', '']
  };
  const yenilemeMs = 5 * 60e3;

  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const para = (x, p, b = 2) => (sayiMi(x) ? `${x < 0 ? '−' : ''}${SIMGE[p] || ''}${Math.abs(x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b })}` : '—');
  const fiyat = (x, p) => para(x, p, sayiMi(x) && Math.abs(x) < 10 ? 4 : 2);
  const adet = (x) => (sayiMi(x) ? x.toLocaleString('tr-TR', { maximumFractionDigits: 6 }) : '—');
  const yz = (x, b = 1) => (sayiMi(x) ? AG.fmt.oranYuzde(x, b) : '—');
  const isaretli = (x, b = 1) => (sayiMi(x) ? AG.fmt.oranYuzde(x, b, { isaretli: true }) : '—');
  const ton = (x) => (!sayiMi(x) || Math.abs(x) < 1e-9 ? '' : x > 0 ? 'tone-success' : 'tone-danger');
  const gunMetni = (g, yil) => { if (!g) return '—'; const d = new Date(g + 'T12:00:00Z'); return Number.isNaN(d.getTime()) ? g : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', ...(yil ? { year: 'numeric' } : {}), timeZone: 'UTC' }); };
  const tms = (gun) => Date.parse(gun + 'T12:00:00Z');
  const isoGun = (t) => new Date(t).toISOString().slice(0, 10);
  const k = (id) => KISA[id] || id;

  const veri = {};          // id → { zaman, r } | { zaman, hata }
  const fiyatVeri = {};     // `${id}|${s}` → { r } | { hata } | null (yükleniyor)
  const seciliSembol = {};  // id → sembol
  const vurguGun = {};      // id → 'YYYY-MM-DD' (Karar defteri › Bu günü grafikte göster)
  let acik = null;          // açık bot id (null = Hücum/Denge görünümü)

  // ── Saf yardımcılar (scripts/panel-botlar-testi.js sınar) ────────────────
  /** Uç yok mu (sunucu 68.8'den eski): doğrudan HTML 404 ya da sunucu bağlantısının "beklenmeyen yanıt (404, …)" iletisi. */
  const ucYokMu = (m) => /HTTP 404|\(404,|uç bulunamadı/.test(String(m || ''));

  /**
   * Saf: işlem listesi (eski → yeni) → her satış satırının gerçekleşen K/Z'si (ortalama maliyet, komisyon dahil).
   * Bölünme adedi değiştirir, toplam maliyet aynı kalır; Hücum kolu aktarımı K/Z değildir. → Map(index → K/Z)
   */
  function gerceklesenKz(islemler) {
    const maliyet = new Map(), adetler = new Map(), out = new Map();
    (islemler || []).forEach((i, n) => {
      if (!i || !i.s || i.s === 'HUCUM') return;
      const a = adetler.get(i.s) || 0, m = maliyet.get(i.s) || 0;
      if (i.tur === 'al' && sayiMi(i.adet) && sayiMi(i.tutar)) { adetler.set(i.s, a + i.adet); maliyet.set(i.s, m + i.tutar + (i.komisyon || 0)); }
      else if (i.tur === 'bolunme' && sayiMi(i.adet)) adetler.set(i.s, Math.max(0, a + i.adet));
      else if (i.tur === 'sat' && sayiMi(i.adet) && sayiMi(i.tutar) && a > 0) {
        const ort = m / a, n2 = Math.min(i.adet, a);
        out.set(n, i.tutar - (i.komisyon || 0) - n2 * ort);
        adetler.set(i.s, a - n2); maliyet.set(i.s, a - n2 > 1e-9 ? m - n2 * ort : 0);
      }
    });
    return out;
  }

  /** Saf: işlem geçmişi CSV (noktalı virgül, Türkçe ondalık virgülü yok — makine okunur nokta). */
  function islemCsv(x) {
    const l = (x && x.kagit && x.kagit.islemler) || [];
    const kz = gerceklesenKz(l);
    const hucre = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const satir = (a) => a.map(hucre).join(';');
    return [satir(['tarih', 'islem', 'hisse', 'adet', 'fiyat', 'tutar', 'komisyon', 'gerceklesen_kz', 'neden', 'para']),
      ...l.map((i, n) => satir([i.gun, i.tur, i.s === 'HUCUM' ? KOL : (i.s || ''), i.adet, i.tur === 'temettu' ? '' : i.fiyat, i.tutar, i.komisyon, kz.has(n) ? Math.round(kz.get(n) * 100) / 100 : '', CV(i.neden), x.para]))].join('\n') + '\n';
  }

  /** Saf: özet kutuları için sayılar. Gizli (telefon) kipte tutarlar null; yüzdeler yine hesaplanır. */
  function ozetSayilari(x) {
    const kg = (x && x.kagit) || {}, o = kg.ozet || {}, g = kg.gunler || [];
    const son = g[g.length - 1] || null;
    const modelSon = son && sayiMi(son.modelEndeks) ? son.modelEndeks : null;
    const fark = sayiMi(o.getiri) && sayiMi(modelSon) && modelSon > 0 ? (1 + o.getiri) / (modelSon / 100) - 1 : null;
    return { ozsermaye: o.ozsermaye, yatirilan: o.yatirilan, getiri: o.getiri, kiyas: sayiMi(x && x.kiyasGetiri) ? x.kiyasGetiri : null,
      fazla: sayiMi(o.getiri) && sayiMi(x && x.kiyasGetiri) ? o.getiri - x.kiyasGetiri : null, maxDD: o.maxDD, modelFark: o.modelFark, modelFarkYuzde: fark,
      islem: o.islemSayisi || 0, komisyon: o.komisyonToplam, bas: o.bas, son: o.son };
  }

  /** Saf: değer grafiği serileri — özsermaye (gizlide 100 tabanlı), kıyas aynı tabanda, 837'de Hücum kolu. */
  function degerSerileri(x) {
    const kg = (x && x.kagit) || {}, g = kg.gunler || [];
    const gizli = !!(x && x.gizli);
    const ilk = g.length ? (gizli ? 100 : g[0].ozsermaye) : null;
    const ana = g.map(z => ({ gun: z.gun, v: gizli ? (sayiMi(z.getiri) ? 100 * (1 + z.getiri) : null) : z.ozsermaye })).filter(z => sayiMi(z.v));
    const kiyas = ((x && x.kiyas && x.kiyas.seri) || []).map(z => ({ gun: z.gun, v: sayiMi(ilk) ? ilk * z.v / 100 : null })).filter(z => sayiMi(z.v));
    const hucum = !gizli ? g.filter(z => sayiMi(z.hucum)).map(z => ({ gun: z.gun, v: z.hucum })) : [];
    return { ana, kiyas, hucum, birim: gizli ? '' : (SIMGE[x && x.para] || '') };
  }

  /** Saf: grafik dikeyleri — hisse modelinde uygulanan karar günleri; 837'de yerleşim + dengeleme günleri. */
  function kararGunleri(x) {
    const d = (x && x.kararDefteri) || [];
    if (x && x.tur === '837') return d.map(z => ({ gun: z.gun, etiket: z.ilk ? 'ilk yerleşim (%50 QQQ + %50 Kairos)' : 'dengeleme (Kairos payı bant dışında)' }));
    return d.filter(z => z.durum !== 'gelecek').map(z => ({ gun: z.uygulamaGunu, etiket: `${z.ilk ? 'ilk liste' : 'aylık karar'} ${gunMetni(z.kararGunu)} kapanışı` }));
  }

  /** Saf: karar kartının tek satırlık özeti (imleç ve kart başlığı). */
  function kararOzeti(z) {
    if (!z) return '';
    if (z.islemler) return z.islemler.map(i => `${TUR_AD[i.tur] || i.tur} ${i.s === 'HUCUM' ? KOL : i.s}${sayiMi(i.adet) ? ' ' + adet(i.adet) : ''}`).join(', ');
    const say = (s) => z.kalemler.filter(x => x.sonuc === s).map(x => x.s);
    const parca = [];
    if (say('alindi').length) parca.push(`alındı: ${say('alindi').join(', ')}`);
    if (say('eldeKaldi').length) parca.push(`elde kaldı: ${say('eldeKaldi').join(', ')}`);
    if (z.satilanlar.length) parca.push(`satıldı: ${z.satilanlar.map(s => s.s).join(', ')}`);
    if (say('bekliyor').length) parca.push(`bekliyor: ${say('bekliyor').join(', ')}`);
    if (say('alinamadi').length) parca.push(`alınamadı: ${say('alinamadi').join(', ')}`);
    return parca.join(' · ');
  }

  // ── Çizim ────────────────────────────────────────────────────────────────
  const sayiKutu = (etiket, deger, alt, sinif, title) => el('div', { class: 'ana-sayi' }, [
    el('span', { class: 'stat-title', text: etiket }),
    el('span', { class: `stat-value stat-value-sm bot-sayi-deger sayi ${sinif || ''}`, text: deger, title: title || null }),
    alt ? el('span', { class: 'hint hint-sm mb-0', text: alt }) : null
  ]);
  const rozet = ([metin, sinif]) => el('span', { class: `pf-rozet ${sinif || ''}`, text: metin });
  const tablo = (b, satirlar, idT, sinif) => AG.tablo.kutulu({ id: idT, sinif: `table-dense pf-tablo ${sinif || ''}`, basliklar: b, satirlar });
  const blok = (id, baslik, icerik, ek) => el('section', { id, class: `bot-blok pbot-blok${ek ? ' ' + ek : ''}`, 'aria-label': baslik }, [el('h4', { class: 'pf-bolum-baslik', text: baslik }), ...icerik]);
  const kuralMetni = (id) => (AG.pages && AG.pages.hisseYapilari && AG.pages.hisseYapilari.NE_YAPAR && AG.pages.hisseYapilari.NE_YAPAR[id]) || '';

  function kart(id) {
    let a = bul(`pbotKart-${k(id)}`);
    if (a) return a;
    a = el('article', { id: `pbotKart-${k(id)}`, class: `glass-panel panel-pad bot-kart mp-kart mp-r-${k(id)} pbot-kart`, 'aria-label': AD[id] }, [el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })]);
    const kap = bul('pbotKap');
    if (kap) kap.appendChild(a);
    return a;
  }

  function baslikCiz(id, x) {
    const ek = [];
    if (x && x.evKaynak) {
      const s = x.evKaynak.zaman ? new Date(x.evKaynak.zaman).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—';
      ek.push(el('p', { class: `hint hint-sm mb-0 ${x.evKaynak.eski ? 'tone-warning' : ''}`, id: `pbotKaynak-${k(id)}`, text: x.evKaynak.eski ? `Sunucudaki panele şu an ulaşılamadı — ${s} tarihli son okuma gösteriliyor.` : `Resmî kayıt: sunucudaki panelden okundu (${s}).` }));
    }
    return el('div', { class: `mp-bas mp-r-${k(id)}` }, [
      el('div', { class: 'mp-simge', 'aria-hidden': 'true', text: SIMGE_KISA[id] }),
      el('div', { class: 'mp-bas-metin' }, [
        el('div', { class: 'row-inline row-wrap gap-2' }, [
          el('h3', { class: 'card-title m-0', text: AD[id], title: AG.botAd ? AG.botAd.anlam(id) : null }),
          AG.botAd && AG.botAd.alt(id) ? el('span', { class: 'hint hint-sm mb-0 bot-ad-alt', text: AG.botAd.alt(id) }) : null,
          el('span', { class: 'badge', text: 'kâğıt hesap — canlı hesap değil' }), el('span', { class: 'badge', text: PIYASA[id] })]),
        el('p', { class: 'mp-ne-yapar mb-0' }, [el('span', { text: kuralMetni(id) })]),
        ...ek
      ])
    ]);
  }

  function sayilarCiz(id, x) {
    const s = ozetSayilari(x), p = x.para, gizli = !!x.gizli, sk = x.sonrakiKarar;
    return el('div', { id: `pbotSayilar-${k(id)}`, class: 'ana-sayilar bot-sayilar' }, [
      sayiKutu('Özsermaye', gizli ? '—' : para(s.ozsermaye, p, 0), gizli ? 'tutarlar gizli' : `yatırılan ${para(s.yatirilan, p, 0)}`),
      sayiKutu('Getiri', isaretli(s.getiri), `${gunMetni(s.bas)} → ${gunMetni(s.son)}`, ton(s.getiri)),
      sayiKutu(`Kıyas: ${x.kiyas ? x.kiyas.ad : 'al-tut'}`, isaretli(s.kiyas), sayiMi(s.fazla) ? `bot ${isaretli(s.fazla)} puan ${s.fazla >= 0 ? 'önde' : 'geride'} · aynı günler` : 'aynı günler', ton(s.kiyas)),
      sayiKutu('En derin düşüş', sayiMi(s.maxDD) ? yz(-s.maxDD) : '—', 'zirveden en büyük kayıp', sayiMi(s.maxDD) && s.maxDD > 0 ? 'tone-danger' : ''),
      sayiKutu('Model ↔ kâğıt fark', isaretli(s.modelFarkYuzde, 2), gizli ? 'model kesirli alır, nakde faiz verir' : `${para(s.modelFark, p)} · model kesirli alır, nakde faiz verir`, '', 'Kâğıt hesap tam adet alır, komisyon öder, nakde faiz almaz; model bunları yapmaz. Fark bu uygulama kaybıdır.'),
      sayiKutu('İşlem · komisyon', `${s.islem} emir`, [gizli ? null : `${para(s.komisyon, p)} komisyon`, x.tur === 'hisse' && sk ? `sıradaki karar ${gunMetni(sk.karar)} → ${gunMetni(sk.uygulama)} açılışı` : x.tur === '837' ? 'dengeleme her QQQ işlem günü denetlenir' : null].filter(Boolean).join(' · '))
    ]);
  }

  function degerGrafikCiz(id, x) {
    const kap = bul(`pbotDeger-${k(id)}`), bilgi = bul(`pbotDegerBilgi-${k(id)}`);
    if (!kap || !AG.grafik) return;
    const s = degerSerileri(x);
    const kg = kararGunleri(x);
    const defter = x.kararDefteri || [];
    const vg = vurguGun[id] || null;
    const kiyasAd = x.kiyas ? x.kiyas.ad : 'al-tut';
    const varsayilan = `Kalın çizgi kâğıt hesap, kesikli çizgi ${kiyasAd} (aynı günler, aynı başlangıç)${s.hucum.length ? ', ince çizgi Kairos kolu (simülasyon)' : ''}; dikey çizgiler karar günleri. İmleci bir günün üstüne getirin.`;
    if (bilgi) bilgi.textContent = varsayilan;
    AG.grafik.ana(kap, {
      ad: `${AD[id]} portföy değeri`, etiket: x.gizli ? 'Kâğıt hesap (başlangıç 100)' : 'Kâğıt hesap — özsermaye', birim: s.birim, dusus: s.ana.length > 5,
      bosMetin: 'Çizgi ikinci işlem gününden sonra görünür.',
      seri: s.ana.map(z => ({ t: tms(z.gun), v: z.v })),
      kiyas: [s.kiyas.length ? { ad: kiyasAd, vurgu: true, seri: s.kiyas.map(z => ({ t: tms(z.gun), v: z.v })) } : null,
        s.hucum.length ? { ad: 'Kairos kolu (simülasyon)', renk: 4, seri: s.hucum.map(z => ({ t: tms(z.gun), v: z.v })) } : null].filter(Boolean),
      dikeyler: kg.map(z => ({ t: tms(z.gun), etiket: z.etiket, vurgu: z.gun === vg })), dikeyEtiketi: x.tur === '837' ? 'Yerleşim / dengeleme günü' : 'Karar uygulama günü',
      imlecFn: (t) => {
        if (!bilgi) return;
        if (t == null) { bilgi.textContent = varsayilan; return; }
        const gun = isoGun(t);
        const z = x.tur === '837' ? defter.find(d => d.gun === gun) : defter.find(d => d.uygulamaGunu === gun);
        const a = s.ana.find(y => y.gun === gun), kq = s.kiyas.find(y => y.gun === gun);
        const deger = a ? (x.gizli ? `${(a.v).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : para(a.v, x.para)) : '—';
        bilgi.textContent = `${gunMetni(gun, true)} · kâğıt hesap ${deger}${kq ? ` · ${kiyasAd} ${x.gizli ? kq.v.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : para(kq.v, x.para)}` : ''}${z ? ` — ${x.tur === '837' ? (z.ilk ? 'ilk yerleşim' : 'dengeleme') : `karar ${gunMetni(z.kararGunu)}`}: ${kararOzeti(z) || 'işlem yok'}` : ''}`;
      }
    });
  }

  function sembolCipleri(id, x) {
    const sm = x.semboller || { elde: [], gecmis: [] };
    const sec = seciliSembol[id];
    const cip = (s, elde) => el('button', { type: 'button', class: `btn btn-xs ${s === sec ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': s === sec ? 'true' : 'false', id: `btnPbotSembol-${k(id)}-${s.replace(/[^A-Za-z0-9]/g, '')}`,
      title: elde ? 'elde' : 'geçmişte tutuldu, satıldı', onclick: () => { seciliSembol[id] = s; fiyatCiz(id); } }, [el('span', { text: elde ? `● ${s}` : s })]);
    return [
      sm.elde.length ? el('span', { class: 'hint hint-sm mb-0', text: 'Elde:' }) : null, ...sm.elde.map(s => cip(s, true)),
      sm.gecmis.length ? el('span', { class: 'hint hint-sm mb-0', text: 'Geçmiştekiler:' }) : null, ...sm.gecmis.map(s => cip(s, false)),
      !sm.elde.length && !sm.gecmis.length ? el('span', { class: 'hint hint-sm mb-0', text: 'Henüz alınmış hisse yok.' }) : null
    ];
  }

  async function fiyatYukle(id, s) {
    const a = `${id}|${s}`;
    if (fiyatVeri[a] === null) return;
    fiyatVeri[a] = null;
    try {
      const r = await AG.api.tasarimci.portfoyBotFiyat(id, s);
      fiyatVeri[a] = r && r.success ? { r } : { hata: (r && r.error) || 'yanıt yok' };
    } catch (e) { fiyatVeri[a] = { hata: e.message }; }
    if (acik === id) fiyatCiz(id);
  }

  function fiyatCiz(id) {
    const x = (veri[id] || {}).r;
    const kap = bul(`pbotFiyat-${k(id)}`), bilgi = bul(`pbotFiyatBilgi-${k(id)}`), cipK = bul(`pbotSemboller-${k(id)}`);
    if (!x || !kap) return;
    const sm = x.semboller || { elde: [], gecmis: [] };
    if (!seciliSembol[id] || ![...sm.elde, ...sm.gecmis].includes(seciliSembol[id])) seciliSembol[id] = sm.elde[0] || sm.gecmis[0] || null;
    if (cipK) doldur(cipK, sembolCipleri(id, x));
    const s = seciliSembol[id];
    if (!s) { doldur(kap, [el('p', { class: 'hint hint-sm mb-0', text: 'Grafik, bot ilk hisseyi aldıktan sonra görünür.' })]); if (bilgi) bilgi.textContent = ''; return; }
    const f = fiyatVeri[`${id}|${s}`];
    if (f === undefined) { fiyatYukle(id, s); doldur(kap, [el('p', { class: 'hint hint-sm mb-0', text: `${s} fiyatı yükleniyor…` })]); return; }
    if (f === null) return;
    if (f.hata) { doldur(kap, [el('p', { class: 'hint hint-sm mb-0', text: ucYokMu(f.hata) ? 'Sunucu güncellenince görünür (hisse grafiği Pusula 68.8 ile geldi).' : `Fiyat okunamadı: ${f.hata}` })]); return; }
    const islem = (x.kagit.islemler || []).filter(i => i.s === s && (i.tur === 'al' || i.tur === 'sat' || i.tur === 'temettu' || i.tur === 'bolunme'));
    const defter = x.kararDefteri || [];
    const kararAd = (i) => { const m = /(ilk liste|aylık karar) (\d{4}-\d{2}-\d{2})/.exec(i.neden || ''); return m ? `${m[1]} ${gunMetni(m[2])}` : CV(i.neden || ''); };
    const p = x.para;
    const etiket = (i) => `${TUR_AD[i.tur]} ${adet(i.adet)} adet × ${fiyat(i.fiyat, p)}${x.gizli || !i.komisyon ? '' : ` + ${para(i.komisyon, p)} komisyon`} — ${kararAd(i)}`;
    const varsayilan = `${s} günlük kapanış (ham fiyat, kâğıt hesabın kullandığı seri) · ▲ alış ▼ satış. İmleci bir işaretin üstüne getirin.`;
    if (bilgi) bilgi.textContent = varsayilan;
    AG.grafik.ana(kap, {
      ad: `${s} fiyatı`, etiket: `${s} kapanış`, birim: SIMGE[p] || '', dusus: false, bosMetin: `${s} için fiyat verisi yok.`,
      seri: (f.r.gunler || []).map(z => ({ t: tms(z.gun), v: z.c })),
      isaretler: islem.filter(i => i.tur === 'al' || i.tur === 'sat').map(i => ({ t: tms(i.gun), tur: i.tur, etiket: etiket(i) })),
      dikeyler: kararGunleri(x).map(z => ({ t: tms(z.gun), etiket: z.etiket })), dikeyEtiketi: 'Karar günü',
      imlecFn: (t) => {
        if (!bilgi) return;
        if (t == null) { bilgi.textContent = varsayilan; return; }
        const gun = isoGun(t), bar = (f.r.gunler || []).find(z => z.gun === gun);
        const o = islem.filter(i => i.gun === gun);
        const z = defter.find(d => d.uygulamaGunu === gun && d.kalemler);
        const kalem = z ? z.kalemler.find(y => y.s === s) : null;
        bilgi.textContent = `${gunMetni(gun, true)} · açılış ${bar ? fiyat(bar.o, p) : '—'} · kapanış ${bar ? fiyat(bar.c, p) : '—'}${o.length ? ' — ' + o.map(i => (i.tur === 'temettu' || i.tur === 'bolunme') ? CV(i.neden) : etiket(i)).join(' · ') : ''}${!o.length && kalem && kalem.sonuc === 'alinamadi' ? ` — ${s} alınamadı: ${kalem.neden}` : ''}`;
      }
    });
  }

  function eldekilerCiz(id, x) {
    const p = x.para, gizli = !!x.gizli, o = x.kagit.ozet || {};
    const satir = (z) => el('tr', null, [
      el('td', { class: 'pf-sola fw-semibold', text: z.s === 'HUCUM' ? 'Kairos kolu (simülasyon)' : CV(z.ad || z.s) }),
      el('td', { class: 'sayi', text: z.simulasyon ? '—' : adet(z.adet) }),
      el('td', { class: 'sayi', text: z.simulasyon ? '—' : fiyat(z.ortMaliyet, p) }),
      el('td', { class: 'sayi', text: z.simulasyon ? 'simülasyon' : fiyat(z.kapanis, p) }),
      el('td', { class: 'sayi', text: gizli ? '—' : para(z.deger, p) }),
      el('td', { class: `sayi ${ton(z.kzYuzde)}`, text: z.simulasyon ? '—' : `${isaretli(z.kzYuzde)}${gizli || !sayiMi(z.kz) ? '' : ` · ${para(z.kz, p)}`}` }),
      el('td', { class: 'sayi', text: yz(z.pay) })
    ]);
    const nakitPay = sayiMi(o.nakit) && o.ozsermaye > 0 ? o.nakit / o.ozsermaye : null;
    const poz = (x.kagit.pozisyonlar || []);
    const nakitSatir = el('tr', { class: 'pbot-nakit' }, [el('td', { class: 'pf-sola fw-semibold', text: 'Nakit' }), el('td', { class: 'sayi', text: '—' }), el('td', { class: 'sayi', text: '—' }), el('td', { class: 'sayi', text: '—' }),
      el('td', { class: 'sayi', text: gizli ? '—' : para(o.nakit, p) }), el('td', { class: 'sayi', text: 'faizsiz' }), el('td', { class: 'sayi', text: gizli ? '—' : yz(nakitPay) })]);
    return blok(`pbotElde-${k(id)}`, 'Eldeki hisseler', [
      tablo(['Hisse', 'Adet', 'Maliyet (komisyon dahil)', 'Son', 'Değer', 'K/Z', 'Pay'], [...poz.map(satir), nakitSatir], `tblPbotElde-${k(id)}`),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: `Maliyet = alış fiyatı + komisyon, adet başına. Son = ${gunMetni(o.son)} kapanışı.${x.tur === '837' ? ' Kairos kolu Binance\'teki Kairos botunun getirisiyle büyüyen simülasyondur; hisse değildir.' : ''}` })
    ]);
  }

  function kararKarti(id, x, z) {
    const p = x.para;
    const goster = el('button', { type: 'button', class: 'btn btn-xs btn-secondary', onclick: () => grafikteGoster(id, x.tur === '837' ? z.gun : z.uygulamaGunu) }, [el('span', { text: 'Bu günü grafikte göster' })]);
    if (x.tur === '837') {
      return el('article', { class: 'pbot-karar', 'data-gun': z.gun }, [
        el('div', { class: 'row-between row-wrap gap-2' }, [el('strong', { text: `${gunMetni(z.gun, true)} · ${z.ilk ? 'ilk yerleşim' : 'dengeleme'}` }), goster]),
        tablo(['İşlem', 'Varlık', 'Adet', 'Fiyat', 'Tutar', 'Komisyon', 'Neden'], z.islemler.map(i => el('tr', null, [
          el('td', { class: 'pf-sola', text: TUR_AD[i.tur] || i.tur }), el('td', { class: 'pf-sola fw-semibold', text: i.s === 'HUCUM' ? KOL : i.s }),
          el('td', { class: 'sayi', text: adet(i.adet) }), el('td', { class: 'sayi', text: i.fiyat != null ? fiyat(i.fiyat, p) : '—' }),
          el('td', { class: 'sayi', text: para(i.tutar, p) }), el('td', { class: 'sayi', text: i.komisyon ? para(i.komisyon, p) : '—' }), el('td', { class: 'pf-sola pf-kucuk', text: CV(i.neden) })])), null, 'pbot-karar-tablo')
      ]);
    }
    const durum = z.durum === 'gelecek' ? ['Uygulanacak', ''] : z.durum === 'bekliyor' ? ['Kısmen bekliyor', 'pf-rozet-uyari'] : ['Uygulandı', 'pf-rozet-iyi'];
    return el('article', { class: 'pbot-karar', 'data-gun': z.uygulamaGunu }, [
      el('div', { class: 'row-between row-wrap gap-2' }, [
        el('div', { class: 'row-inline row-wrap gap-2' }, [el('strong', { text: `Karar ${gunMetni(z.kararGunu, true)} kapanışı` }), el('span', { class: 'hint hint-sm mb-0', text: `→ uygulama ${gunMetni(z.uygulamaGunu)} açılışı${z.ilk ? ' · ilk liste' : ''}${z.aday ? ` · ${z.aday} hisse sıralandı` : ''}` }), rozet(durum)]),
        z.durum !== 'gelecek' ? goster : null]),
      tablo(['Sıra', 'Hisse', 'Puan (12-1 getiri)', 'Sonuç', 'Adet', 'Fiyat', 'Not'], z.kalemler.map(y => el('tr', null, [
        el('td', { class: 'sayi', text: String(y.sira) }), el('td', { class: 'pf-sola fw-semibold', text: y.s }),
        el('td', { class: `sayi ${ton(y.p)}`, text: sayiMi(y.p) ? isaretli(y.p, 0) : '—' }),
        el('td', { class: 'pf-sola' }, [rozet(SONUC[y.sonuc] || [y.sonuc, ''])]),
        el('td', { class: 'sayi', text: y.adet != null ? adet(y.adet) : '—' }), el('td', { class: 'sayi', text: y.fiyat != null ? fiyat(y.fiyat, p) : '—' }),
        el('td', { class: 'pf-sola pf-kucuk', text: CV(y.neden || '') })])), null, 'pbot-karar-tablo'),
      z.satilanlar.length ? el('p', { class: 'mb-0 mt-2 pf-kucuk' }, [el('strong', { text: 'Satılanlar: ' }), el('span', { text: z.satilanlar.map(s => `${s.s} ${adet(s.adet)} adet × ${fiyat(s.fiyat, p)} (${CV(s.neden)})`).join(' · ') })]) : null,
      el('p', { class: 'hint hint-sm mb-0 mt-1', text: `${z.islemSayisi} emir${sayiMi(z.komisyon) && z.komisyon > 0 ? ` · ${para(z.komisyon, p)} komisyon` : ''}${z.eksikVeri && z.eksikVeri.length ? ` · verisi eksik olduğu için sıralanmayan: ${z.eksikVeri.map(e => e.s || e).join(', ')}` : ''}` })
    ]);
  }

  function kararDefteriCiz(id, x) {
    const d = x.kararDefteri || [];
    const parca = [];
    if (x.tur === 'hisse') {
      const sk = x.sonrakiKarar, h = x.havuz;
      parca.push(el('article', { class: 'pbot-karar pbot-karar-sirada', id: `pbotSiradaki-${k(id)}` }, [
        el('div', { class: 'row-inline row-wrap gap-2' }, [el('strong', { text: sk ? `Sıradaki karar ${gunMetni(sk.karar, true)} kapanışı` : 'Sıradaki karar' }), sk ? el('span', { class: 'hint hint-sm mb-0', text: `→ ${gunMetni(sk.uygulama)} açılışında alım-satım` }) : null, rozet(['Bekliyor', ''])]),
        el('p', { class: 'mb-0 mt-1 pf-kucuk', text: h ? (h.girecek.length || h.cikacak.length ? `Bugünkü veriyle girecek: ${h.girecek.join(', ') || '—'} · çıkacak: ${h.cikacak.join(', ') || '—'} (önizleme; kesin liste karar günü kapanışında${h.veriGunu ? `, veri ${gunMetni(h.veriGunu)}` : ''}).` : 'Bugünkü veriyle liste değişmiyor (önizleme).') : 'Önizleme yok (aday havuzu henüz hesaplanmadı).' })
      ]));
    }
    if (!d.length) parca.push(el('p', { class: 'hint hint-sm mb-0', text: 'Henüz karar uygulanmadı.' }));
    for (const z of d) parca.push(kararKarti(id, x, z));
    return blok(`pbotKararlar-${k(id)}`, 'Karar defteri', parca);
  }

  function islemGecmisiCiz(id, x) {
    const p = x.para, gizli = !!x.gizli;
    const l = x.kagit.islemler || [];
    const kz = gerceklesenKz(l);
    const satirlar = l.map((i, n) => ({ i, n })).reverse().map(({ i, n }) => el('tr', null, [
      el('td', { class: 'sayi', text: i.gun }),
      el('td', { class: 'pf-sola' }, [el('span', { class: `pf-rozet ${i.tur === 'al' ? 'pf-rozet-iyi' : i.tur === 'sat' ? 'pf-rozet-tehlike' : ''}`, text: TUR_AD[i.tur] || i.tur })]),
      el('td', { class: 'pf-sola fw-semibold', text: i.s === 'HUCUM' ? KOL : (i.s || '—') }),
      el('td', { class: 'sayi', text: i.adet != null ? adet(i.adet) : '—' }),
      el('td', { class: 'sayi', text: i.fiyat != null && i.tur !== 'temettu' ? fiyat(i.fiyat, p) : '—' }),
      el('td', { class: 'sayi', text: gizli ? '—' : para(i.tutar, p) }),
      el('td', { class: 'sayi', text: gizli || !i.komisyon ? '—' : para(i.komisyon, p) }),
      el('td', { class: `sayi ${kz.has(n) ? ton(kz.get(n)) : ''}`, text: kz.has(n) && !gizli ? para(kz.get(n), p) : '—' }),
      el('td', { class: 'pf-sola pf-kucuk', text: CV(i.neden || '') })
    ]));
    const csv = el('button', { type: 'button', class: 'btn btn-xs btn-secondary', id: `btnPbotCsv-${k(id)}`, onclick: () => csvIndir(id) }, [el('i', { 'data-lucide': 'download', class: 'icon-13' }), el('span', { text: ' CSV indir' })]);
    return el('section', { id: `pbotIslemler-${k(id)}`, class: 'bot-blok pbot-blok', 'aria-label': 'İşlem geçmişi' }, [
      el('div', { class: 'row-between row-wrap gap-2 mb-2' }, [el('h4', { class: 'pf-bolum-baslik m-0', text: `İşlem geçmişi (${l.length} kayıt)` }), csv]),
      l.length ? tablo(['Tarih', 'İşlem', 'Hisse', 'Adet', 'Fiyat', 'Tutar', 'Komisyon', 'Gerçekleşen K/Z', 'Neden'], satirlar, `tblPbotIslem-${k(id)}`) : el('p', { class: 'hint hint-sm mb-0', text: 'Henüz işlem yok.' })
    ]);
  }

  function csvIndir(id) {
    const x = (veri[id] || {}).r;
    if (!x || !global.Blob || !global.URL || !doc) return;
    try {
      const url = global.URL.createObjectURL(new global.Blob(['﻿' + islemCsv(x)], { type: 'text/csv;charset=utf-8' }));
      const a = el('a', { href: url, download: `pusula-${id}-islemler-${(x.kagit.ozet || {}).son || 'bugun'}.csv`, class: 'is-hidden' });
      doc.body.appendChild(a); a.click(); a.remove();
      global.setTimeout(() => global.URL.revokeObjectURL(url), 2000);
    } catch (e) { if (AG.bildir) AG.bildir(`CSV hazırlanamadı: ${e.message}`, 'hata'); }
  }

  /** Karar defteri › "Bu günü grafikte göster": değer grafiğinde o günün dikeyi vurgulanır ve grafik görünür alana kaydırılır. */
  function grafikteGoster(id, gun) {
    vurguGun[id] = gun;
    const x = (veri[id] || {}).r;
    if (x) degerGrafikCiz(id, x);
    const b = bul(`pbotDegerBlok-${k(id)}`);
    if (b && b.scrollIntoView) { try { b.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { b.scrollIntoView(); } }
    const bilgi = bul(`pbotDegerBilgi-${k(id)}`);
    const z = (x && x.kararDefteri || []).find(d => (x.tur === '837' ? d.gun : d.uygulamaGunu) === gun);
    if (bilgi && z) bilgi.textContent = `${gunMetni(gun, true)} vurgulandı — ${x.tur === '837' ? (z.ilk ? 'ilk yerleşim' : 'dengeleme') : `karar ${gunMetni(z.kararGunu)}`}: ${kararOzeti(z) || 'işlem yok'}`;
  }

  function ciz(id) {
    const a = kart(id);
    const v = veri[id];
    if (!v) { doldur(a, [baslikCiz(id, null), el('p', { class: 'hint mb-0 mt-2', text: 'Yükleniyor…' })]); return; }
    if (v.hata) {
      doldur(a, [baslikCiz(id, null), ucYokMu(v.hata)
        ? el('div', { class: 'pf-uyari pf-uyari-bilgi mt-3', id: `pbotGuncelle-${k(id)}`, role: 'status' }, [el('strong', { text: 'Sunucu güncellenince görünür.' }), el('span', { text: ' Portföy botu sayfaları Pusula 68.8 ile geldi; sunucudaki panel eski sürümde. Ayarlar › Güncelleme ile sunucu güncellenince resmî kâğıt hesap burada görünür. Şimdilik Portföy › Modeller\'e bakın.' })])
        : AG.bildirim.hataKutusu(v.hata, { baslik: 'Portföy botu okunamadı', yeniden: () => yukle(id, true) })]);
      return;
    }
    const x = v.r;
    if (x.bos) { doldur(a, [baslikCiz(id, x), el('p', { class: 'hint mb-0 mt-2', text: CV(x.neden) || 'Henüz başlamadı.' })]); return; }
    const kg = x.kagit, uy = [...(x.uyarilar || [])];
    const o = kg.ozet || {};
    if (o.bekleyenEmir && o.bekleyenEmir.length) uy.push(`Açılış fiyatı gelmediği için bekleyen emir: ${o.bekleyenEmir.join(', ')}`);
    const ay = kg.ayar || {};
    doldur(a, [
      baslikCiz(id, x),
      ...uy.map(u => el('p', { class: 'pf-uyari pf-uyari-uyari mb-0 mt-2', text: `⚠ ${u}` })),
      sayilarCiz(id, x),
      el('section', { id: `pbotDegerBlok-${k(id)}`, class: 'bot-blok pbot-blok', 'aria-label': 'Portföy değeri ve karar günleri' }, [
        el('h4', { class: 'pf-bolum-baslik', text: 'Portföy değeri ve karar günleri' }),
        el('div', { id: `pbotDeger-${k(id)}`, class: 'pbot-grafik' }),
        el('p', { id: `pbotDegerBilgi-${k(id)}`, class: 'hint hint-sm mb-0 mt-2', 'aria-live': 'polite' })
      ]),
      el('section', { id: `pbotHisse-${k(id)}`, class: 'bot-blok pbot-blok', 'aria-label': 'Hisse grafiği' }, [
        el('h4', { class: 'pf-bolum-baslik', text: x.tur === '837' ? 'QQQ grafiği — nerede aldı, nerede sattı' : 'Hisse grafiği — nerede aldı, nerede sattı' }),
        el('div', { id: `pbotSemboller-${k(id)}`, class: 'row row-wrap gap-2 mb-2' }),
        el('div', { id: `pbotFiyat-${k(id)}`, class: 'pbot-grafik' }),
        el('p', { id: `pbotFiyatBilgi-${k(id)}`, class: 'hint hint-sm mb-0 mt-2', 'aria-live': 'polite' })
      ]),
      eldekilerCiz(id, x),
      kararDefteriCiz(id, x),
      islemGecmisiCiz(id, x),
      el('p', { class: 'hint hint-sm mt-3 mb-0', text: `Kâğıt hesabın kuralları: ${x.para === 'USD' ? `emir başına ${para(ay.komisyonSabit, 'USD')} komisyon (Midas)` : 'komisyon yok (Midas BIST)'}, kayma %${((ay.kayma || 0) * 100).toLocaleString('tr-TR')}, ${ay.kesirli ? 'kesirli adet' : 'tam adet'}, temettü stopajı %${Math.round((ay.stopaj || 0) * 100)}, nakde faiz yok. Fiyatlar gerçek açılış/kapanış (Yahoo). Son hesap ${x.guncelleme ? new Date(x.guncelleme).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '—'} (30 dakikada bir). Sermaye: Portföy › Modeller › Bu ay › Ayarlar.` })
    ]);
    degerGrafikCiz(id, x);
    fiyatCiz(id);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  async function yukle(id, zorla) {
    if (!SIRA.includes(id)) return;
    const v = veri[id];
    if (!zorla && v && Date.now() - v.zaman < yenilemeMs) { ciz(id); return; }
    if (!v) ciz(id);
    try {
      const r = await AG.api.tasarimci.portfoyBot(id);
      if (!r || r.success === false) throw new Error((r && r.error) || 'yanıt yok');
      veri[id] = { zaman: Date.now(), r };
      for (const a of Object.keys(fiyatVeri)) if (a.startsWith(`${id}|`) && zorla) delete fiyatVeri[a];
    } catch (e) { veri[id] = { zaman: Date.now(), hata: e.message }; }
    if (acik === id) ciz(id);
  }

  /** botlar.js çağırır: portföy botu sayfasını aç (Hücum/Denge kapları gizlenir). */
  function ac(id) {
    if (!SIRA.includes(id)) return false;
    acik = id;
    const kap = bul('pbotKap');
    if (kap) kap.classList.remove('is-hidden');
    for (const x of SIRA) { const a = bul(`pbotKart-${k(x)}`); if (a) a.classList.toggle('is-hidden', x !== id); }
    kart(id).classList.remove('is-hidden');
    yukle(id, false);
    return true;
  }
  function kapat() {
    acik = null;
    const kap = bul('pbotKap');
    if (kap) kap.classList.add('is-hidden');
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:tema', () => { if (acik && veri[acik] && veri[acik].r && !veri[acik].r.bos) { degerGrafikCiz(acik, veri[acik].r); fiyatCiz(acik); } });
  }

  AG.pages = AG.pages || {};
  AG.pages.portfoyBotlari = { ac, kapat, yukle, acik: () => acik, SIRA, KISA, AD, gerceklesenKz, islemCsv, ozetSayilari, degerSerileri, kararGunleri, kararOzeti, ucYokMu, grafikteGoster, _veri: veri };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.portfoyBotlari;
})(typeof window !== 'undefined' ? window : globalThis);
