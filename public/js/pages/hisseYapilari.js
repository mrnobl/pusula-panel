/**
 * MODEL SEKMELERİ — Portföy › Nasdaq M10 / BIST M10 / 837 sekmeleri (62.4; 62.3'te tek "Model portföyler" sekmesi, önce Botlar'daki
 * "Hisse yapıları", 61.4) `AG.pages.hisseYapilari`. Her model kendi sekmesinde (#pfModel-<id> → #hisseKart-<kısa>): renkli başlık + kural ·
 * sayılar · Bu ay kartı (#pfBuAy-<id>, tasarimci.js doldurur) · grafik + hisse K/Z çubukları (AG.grafik.cubuk) · elindekiler + aday havuzu ·
 * işlem geçmişi. Ortak alt kısım (#pfModellerKok): ayrıntılı izleme + H1 notu. Aşağıdaki 62.3 açıklaması sıra dışında geçerlidir.
 * ═══════════════════════════════════════════════════════════════════════════
 * Botların (üç model portföyün) kendi sanal hesabı: Nasdaq Momentum 10 · BIST Momentum 10 · %50 QQQ + %50 Hücum. Üstte model
 * seçici (bir model görünür; seçim localStorage 'ag.modeller.secili', try/catch). Kart sırası — kullanıcının sorduğu sırayla:
 *   1. NE YAPAR: kural, düz Türkçe (bir paragraf) + sıradaki karar günü.
 *   2. SAYILAR: başlangıçtan getiri · aynı dönemde kıyas · en derin düşüş · değer · nakit.
 *   3. GRAFİK: "Canlı takip" (kâğıt hesap, 12 Ekim 2026'dan; kıyas çizgisi; alım ▲ satım ▼) ↔ "Geçmiş (backtest)" (kuralın
 *      geçmişte nasıl davranırdığı, aylık, 100 tabanlı + kıyas; İYİMSER etiketli — GET /api/tasarimci/gecmis/:id). Canlı seride
 *      20 günden az nokta varsa varsayılan Geçmiş.
 *   4. ŞU AN ELDE: kâğıt hesabın hisseleri (adet, maliyet, değer, K/Z, pay).
 *   5. ADAY HAVUZU (yalnız M10'lar): sıradaki ay sonu kararı BUGÜN verilse sıralama — elde · kalıyor / elde · çıkacak / girecek /
 *      yedek aday (GET /api/tasarimci/aday-havuzu; zamanlayıcı yazar, lib/tasarimci/adayHavuzu.js). 837'de hisse seçimi yok.
 *   6. İŞLEM GEÇMİŞİ (katlı) ve kurallar (küçük yazı).
 * En altta katlı "Ayrıntılı izleme" (#pfModelKok → js/pages/modelPortfoy.js: üç model yan yana, aylık tablo, model ↔ gerçek farkı,
 * dışa aktarım) ve H1 notu. Kâğıt hesap: lib/tasarimci/kagit.js → GET /api/tasarimci/kagit (sermaye Bu ay yapılacaklar › Ayarlar).
 * YALNIZ OKUR — tek yazma düğmesi (73.4): "Sermaye tam adet için yetmiyor" uyarısında ABD modeli + kesirli kapalıysa
 * "Kesirli hisseyi aç" (onaylı; POST /api/tasarimci/sermaye { kesirli: true } — yalnız bu alan; telefonda gizli; araştırma kopyasında
 * lib/evYazma ile sunucuya iletilir). Portföy botları sayfası (portfoyBotlari.js) aynı uyarı + düğmeyi buradan alır (tamAdetUyarisi,
 * tamAdetBlok). Telefonda tam kullanılır; "tutarları gizle" açıksa tutarlar "—", grafik yüzde.
 * Kurallar: DOM AG.dom, tablo AG.tablo, grafik AG.grafik, inline stil yok.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);

  const SIRA = ['m-qqq-m10', 'm-bist-m10', 'm-837'];
  /** DOM kimliklerinde kısa ad (kılavuz işaretleri: #hisseKart-bist, #tblHissePoz-bist …). */
  const KISA = { 'm-qqq-m10': 'qqq', 'm-bist-m10': 'bist', 'm-837': 'q837' };
  /** 72.0: görünen ad kimlikten (AG.botAd; yoksa yedek). adTam = "Nova · Nasdaq Momentum 10", adKisa = "Nova". */
  const AD_YEDEK = { 'm-qqq-m10': ['Nova', 'Nasdaq Momentum 10'], 'm-bist-m10': ['Lydia', 'BIST Momentum 10'], 'm-837': ['Simurg', '%50 QQQ + %50 Kairos'] };
  const adTam = (id) => (AG.botAd && AG.botAd.tam(id)) || (AD_YEDEK[id] ? AD_YEDEK[id].join(' · ') : id);
  const adKisa = (id) => (AG.botAd && AG.botAd.ad(id)) || (AD_YEDEK[id] ? AD_YEDEK[id][0] : id);
  const cv = (s) => (AG.botAd ? AG.botAd.cevir(s) : s);
  /** Kural — düz Türkçe (kullanıcı: "botların hisseleri seçerken ne yaptığı anlaşılmıyor"). */
  const NE_YAPAR = {
    'm-qqq-m10': 'Her ayın son işlem günü Nasdaq-100\'deki hisseleri son 12 ayda en çok yükselenden (son ay hariç) en aza sıralar ve en güçlü 10 hisseyi eşit paylarla (her biri %10) tutar. Listeden düşen hisse satılır, yeni giren alınır; alım-satım ertesi işlem günü açılışında yapılır.',
    'm-bist-m10': 'Her ayın son işlem günü Borsa İstanbul\'da son 3 ayda en çok işlem gören 30 hisseyi seçer, bunları son 12 ayda en çok yükselenden (son ay hariç) en aza sıralar ve en güçlü 10 hisseyi eşit paylarla (her biri %10) tutar. Alım-satım ertesi işlem günü açılışında yapılır.',
    'm-837': 'Paranın yarısı QQQ\'da (Nasdaq-100 fonu, ABD hesabı), yarısı Kairos kripto botunda (Binance) durur. Kairos\'un payı %40\'ın altına düşer ya da %60\'ı geçerse (QQQ işlem günü kapanışında bakılır) ikisi yeniden yarı yarıya yapılır. Hisse seçimi yoktur.'
  };
  const SIMGE_KISA = { 'm-qqq-m10': 'NV', 'm-bist-m10': 'LY', 'm-837': 'SM' };
  const KIYAS = { 'm-qqq-m10': ['k-qqq', 'QQQ al-tut'], 'm-bist-m10': ['k-xu030', 'BIST 30 (XU030)'], 'm-837': ['k-qqq', 'QQQ al-tut'] };
  const DURUM = {
    kaliyor: ['Elde · kalıyor', 'pf-rozet-bilgi'], cikacak: ['Elde · çıkacak', 'pf-rozet-tehlike'],
    girecek: ['Girecek', 'pf-rozet-iyi'], yedek: ['Yedek aday', '']
  };
  const KRIZLER = [{ ad: '2008 krizi', bas: '2008-09-01', bit: '2009-03-31' }, { ad: 'Covid', bas: '2020-02-19', bit: '2020-04-30' }, { ad: '2022 düşüşü', bas: '2022-01-01', bit: '2022-12-31' }];
  const k = (id) => KISA[id] || id;
  const SIMGE = { USD: '$', TRY: '₺' };
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const para = (x, p, b = 2) => (sayiMi(x) ? `${x < 0 ? '−' : ''}${SIMGE[p] || ''}${Math.abs(x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b })}` : '—');
  const fiyat = (x, p) => para(x, p, sayiMi(x) && Math.abs(x) < 10 ? 4 : 2);
  const adet = (x) => (sayiMi(x) ? x.toLocaleString('tr-TR', { maximumFractionDigits: 6 }) : '—');
  const yz = (x, b = 1) => (sayiMi(x) ? AG.fmt.oranYuzde(x, b) : '—');
  const isaretli = (x, b = 1) => (sayiMi(x) ? AG.fmt.oranYuzde(x, b, { isaretli: true }) : '—');
  const ton = (x) => (!sayiMi(x) || Math.abs(x) < 1e-9 ? 'tone-muted' : x > 0 ? 'tone-success' : 'tone-danger');
  const gunMetni = (g) => { if (!g) return '—'; const d = new Date(g + 'T12:00:00Z'); return Number.isNaN(d.getTime()) ? g : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }); };
  const TUR_AD = { al: 'Alış', sat: 'Satış', temettu: 'Temettü', bolunme: 'Bölünme', yatir: 'Para girişi', cek: 'Para çıkışı', aktarim: 'Kairos kolu aktarımı' };

  let veri = null, sonraki = null, zaman = 0, yukleniyor = false;
  let havuz = null;                       // GET /aday-havuzu
  const modelVeri = {};                   // id → GET /model/:id (canlı kıyas)
  const gecmis = {};                      // id → GET /gecmis/:id (null = yükleniyor)
  const grafikKip = {};                   // id → 'canli' | 'gecmis' (kullanıcı seçimi)


  /**
   * Saf (73.4): kâğıt hesap modeli → tam adet uyarısı { metin, kesirliAcilabilir } | null. Listedeki hisselerin bir kısmı alınamadı ve
   * paranın %5'ten fazlası nakitte (bekleyen emir yoksa — o zaman neden sermaye değil). kesirliAcilabilir: ABD (USD) modeli ve kâğıt
   * hesabın ayarında kesirli kapalı → "Kesirli hisseyi aç" düğmesi. BIST'te kesirli hisse yok (Midas) → düğme yok, metin sermaye der.
   */
  function tamAdetUyarisi(x) {
    const o = (x && x.ozet) || {};
    const sonK = o.sonKarar;
    if (!x || x.model === 'm-837' || o.bos || !sonK || !sonK.liste) return null;
    const hedef = sonK.liste.length, alinan = (x.pozisyonlar || []).length;
    const nakitPay = o.ozsermaye > 0 ? o.nakit / o.ozsermaye : null;
    if (!(alinan < hedef && sayiMi(nakitPay) && nakitPay > 0.05 && !(o.bekleyenEmir && o.bekleyenEmir.length))) return null;
    const usd = (x.para || (x.model === 'm-bist-m10' ? 'TRY' : 'USD')) === 'USD';
    const kesirliAcik = !!(x.ayar && x.ayar.kesirli);
    const bas = `Sermaye tam adet için yetmiyor: listedeki ${hedef} hisseden ${alinan} tanesi alınabildi, paranın ${yz(nakitPay, 0)} nakitte. Bir adedi hedef payından pahalı hisseler alınamıyor`;
    if (!usd) return { metin: `${bas} — sermayeyi artırmak gerekir (BIST'te kesirli hisse alınmaz).`, kesirliAcilabilir: false };
    if (kesirliAcik) return { metin: `${bas} — kesirli hisse açık; sermaye en küçük işlem tutarına yetmiyor olabilir.`, kesirliAcilabilir: false };
    return { metin: `${bas} — sermaye ya da kesirli hisse kararı gerekir.`, kesirliAcilabilir: true };
  }

  const telefonMu = () => !!(AG.api && AG.api.kademe && AG.api.kademe() === 'telefon');
  /**
   * 73.4 "Kesirli hisseyi aç" düğmesi (telefonda null). Onay penceresi → POST /api/tasarimci/sermaye { kesirli: true } (yalnız bu alan:
   * tutarlar, eşik, hesaplar değişmez) → tik yenile isteği → `sonra()`. Kâğıt hesap her tikte baştan hesaplandığı için "geçmiş işlemler
   * yeniden hesapta değişti" uyarısı bir kez çıkabilir (kılavuzda).
   */
  function kesirliDugmesi(sonra, id) {
    if (telefonMu() || !(AG.api && AG.api.tasarimci && AG.api.tasarimci.sermaye)) return null;
    const d = el('button', { type: 'button', class: 'btn btn-sm btn-primary mp-kesirli-dugme pm-yazma', id: id || null, 'data-eylem': 'kesirli-ac', text: 'Kesirli hisseyi aç',
      onclick: async () => {
        const evet = AG.onayla ? await AG.onayla({ baslik: 'Kesirli hisse açılsın mı?', metin: KESIRLI_ONAY, onay: 'Evet, aç' }) : false;
        if (!evet) return;
        AG.dom.mesgul(d, 'Kaydediliyor…');
        try {
          const r = await AG.api.tasarimci.sermaye({ kesirli: true });
          if (r && r.kuyrukta) AG.bildir(r.mesaj || 'Sunucuya ulaşılamadı — ayar kuyruğa alındı.', 'uyari');
          else if (!r || !r.success) { AG.bildir(`Kaydedilmedi: ${(r && r.error) || 'hata'}`, 'hata'); return; }
          else AG.bildir('Kesirli hisse açıldı. Kâğıt hesap yeniden hesaplanıyor — birkaç dakika içinde güncellenir.', 'ok');
          try { if (AG.api.tasarimci.yenile) await AG.api.tasarimci.yenile(); } catch { /* yenileme isteği olmasa da 30 dk'lık tik hesaplar */ }
        } catch (e) { AG.bildir(`Kaydedilmedi: ${e.message}`, 'hata'); return; } finally { AG.dom.hazir(d); }
        if (typeof sonra === 'function') sonra();
      } });
    return d;
  }
  const KESIRLI_ONAY = 'ABD hisselerinde (Nasdaq M10 ve 837\'nin QQQ ayağı) adetler artık bölünerek (en çok 6 hane) alınır: paranın tamamı hisselere girer, tek hissenin fiyatı payından pahalı olsa da alınır. BIST her zaman tam adet kalır. Kâğıt hesap baştan hesaplanır, geçmiş işlemleri bu ayarla yeniden yazılır (bir kez "geçmiş işlemler değişti" uyarısı görebilirsiniz). Ayar Portföy › Modeller › Bu ay › Ayarlar\'dan geri kapatılabilir.';
  /** Uyarı kutusu + (açılabilirse) düğme. */
  function tamAdetBlok(u, sonra, id) {
    if (!u) return null;
    return el('div', { class: 'pf-uyari pf-uyari-uyari mb-0 mp-tam-adet', id: id ? `${id}-uyari` : null }, [
      el('span', { text: `⚠ ${u.metin}` }),
      u.kesirliAcilabilir ? kesirliDugmesi(sonra, id) : null
    ]);
  }

  /** Saf: kart üstündeki durum cümlesi ve uyarılar (tam adet uyarısı ayrı alanda: tamAdet → tamAdetBlok). */
  function durumMetni(x, sk) {
    const o = x.ozet || {};
    if (o.bos) return { metin: o.neden || 'Henüz başlamadı.', ton: 'tone-muted', uyarilar: [], tamAdet: null };
    const uyarilar = [];
    const tur = x.model === 'm-837' ? '837' : 'hisse';
    const karar = tur === 'hisse' && sk ? sk[x.model === 'm-bist-m10' ? 'BIST' : 'NYSE'] : null;
    const sonK = o.sonKarar;
    const tamAdet = tamAdetUyarisi(x);
    if (o.bekleyenEmir && o.bekleyenEmir.length) uyarilar.push(`Açılış fiyatı gelmediği için bekleyen emir: ${o.bekleyenEmir.join(', ')}`);
    for (const u of x.uyarilar || []) uyarilar.push(cv(u));
    const parca = [];
    if (tur === 'hisse' && karar && karar[0]) parca.push(`Sıradaki karar: ${gunMetni(karar[0].karar)} kapanışı → ${gunMetni(karar[0].uygulama)} açılışında alım-satım`);
    if (tur === '837') parca.push('Dengeleme her QQQ işlem günü kapanışında denetlenir (Kairos payı %40–60 dışına çıkınca)');
    if (sonK) parca.push(`son karar ${gunMetni(sonK.kararGunu)} → ${gunMetni(sonK.uygulamaGunu)} açılışında uygulandı`);
    parca.push(`son veri ${gunMetni(o.son)}`);
    return { metin: parca.join(' · '), ton: '', uyarilar, tamAdet };
  }

  /** Saf: son iki karar → { sira: [{ s, p, yeni }], giren, cikan }. */
  function kararFarki(kararlar) {
    const l = kararlar || [];
    const son = l[l.length - 1], once = l.length > 1 ? l[l.length - 2] : null;
    if (!son || !son.liste) return null;
    const onceS = new Set(once && once.liste ? once.liste.map(y => y.s) : []);
    const sonS = new Set(son.liste.map(y => y.s));
    return {
      kararGunu: son.kararGunu, aday: son.aday || son.evren || null,
      sira: son.liste.map((y, i) => ({ sira: i + 1, s: y.s, p: y.p, yeni: !!once && !onceS.has(y.s) })),
      giren: once ? son.liste.map(y => y.s).filter(s => !onceS.has(s)) : [],
      cikan: once ? once.liste.map(y => y.s).filter(s => !sonS.has(s)) : []
    };
  }

  /** Saf: aday havuzu satırları → { cikacak: [s], girecek: [s] }. */
  function havuzOzeti(satirlar) {
    const l = satirlar || [];
    return { cikacak: l.filter(x => x.durum === 'cikacak').map(x => x.s), girecek: l.filter(x => x.durum === 'girecek').map(x => x.s) };
  }

  /** Saf: kıyas satırlarını (gun, endeks) hedef günlere tarihe göre ileri doldurur; ilk dolu günde 100'e tabanlar. */
  function kiyasSerisi(gunler, satirlar) {
    const s = (satirlar || []).filter(x => x && sayiMi(x.endeks)).slice().sort((a, b) => (a.gun < b.gun ? -1 : 1));
    const out = [];
    let j = -1, taban = null;
    for (const g of gunler) {
      while (j + 1 < s.length && s[j + 1].gun <= g) j++;
      if (j < 0) continue;
      if (taban == null) taban = s[j].endeks;
      out.push({ gun: g, v: s[j].endeks / taban * 100 });
    }
    return out;
  }

  const sayiKutu = (etiket, deger, alt, sinif) => el('div', { class: 'ana-sayi' }, [
    el('span', { class: 'stat-title', text: etiket }),
    el('span', { class: `stat-value stat-value-sm sayi ${sinif || ''}`, text: deger }),
    alt ? el('span', { class: 'hint hint-sm mb-0', text: alt }) : null
  ]);
  const tablo = (b, satirlar, idT) => AG.tablo.kutulu({ id: idT, sinif: 'table-dense pf-tablo', basliklar: b, satirlar });
  const rozet = ([metin, sinif]) => el('span', { class: `pf-rozet ${sinif}`, text: metin });

  /** Canlı takip: kâğıt hesap (100 taban) ve kıyas — getiri ve kıyasın aynı dönem getirisi. */
  function canliSeriler(id, x) {
    const g = x.gunler || [];
    const gizli = !!x.gizli;
    const ilk = g.length && !gizli ? g[0].ozsermaye : null;
    const ana = g.map(z => ({ gun: z.gun, v: gizli ? 100 * (1 + (z.getiri || 0)) : (ilk ? z.ozsermaye / ilk * 100 : null) })).filter(z => sayiMi(z.v));
    const [kid, kad] = KIYAS[id];
    const m = modelVeri[id];
    const kiyas = m && m.kiyaslar && m.kiyaslar[kid] ? kiyasSerisi(ana.map(z => z.gun), m.kiyaslar[kid].satirlar) : [];
    return { ana, kiyas, kiyasAd: kad, kiyasGetiri: kiyas.length > 1 ? kiyas[kiyas.length - 1].v / 100 - 1 : null };
  }
  const varsayilanKip = (id, x) => grafikKip[id] || ((x.ozet || {}).bos || (x.gunler || []).length < 20 ? 'gecmis' : 'canli');

  function kartCiz(id, x) {
    const kap = bul(`hisseKart-${k(id)}`);
    if (!kap) return;
    const p = x.para, o = x.ozet || {};
    const d = durumMetni(x, sonraki);
    // 62.4: renkli model başlığı (sekmeyle aynı renk) — kural başlığın altında tek paragraf
    const baslik = el('div', { class: `mp-bas mp-r-${k(id)}` }, [
      el('div', { class: 'mp-simge', 'aria-hidden': 'true', text: SIMGE_KISA[id] }),
      el('div', { class: 'mp-bas-metin' }, [
        el('div', { class: 'row-inline row-wrap gap-2' }, [el('h3', { class: 'card-title m-0', text: adTam(id) }),
          el('span', { class: 'badge', text: 'botun sanal hesabı — canlı hesap değil' }), el('span', { class: 'badge', text: id === 'm-bist-m10' ? 'BIST · TL' : id === 'm-837' ? 'ABD + Binance · USD' : 'ABD · USD' })]),
        el('p', { class: 'mp-ne-yapar mb-0' }, [el('span', { text: NE_YAPAR[id] })])
      ])
    ]);
    const buAy = el('div', { id: `pfBuAy-${id}`, class: 'mp-buay' });
    if (o.bos) { doldur(kap, [baslik, el('p', { class: 'hint mb-0 mt-2', text: d.metin }), buAy, grafikBolumu(id, x)]); grafikCiz(id, x); buAyDoldur(); return; }
    const gizli = !!x.gizli;
    const cs = canliSeriler(id, x);
    const sayilar = el('div', { class: 'ana-sayilar bot-sayilar' }, [
      sayiKutu('Başlangıçtan', isaretli(o.getiri), `${gunMetni(o.bas)}'dan bu yana`, ton(o.getiri)),
      sayiKutu(`Aynı dönemde ${cs.kiyasAd}`, isaretli(cs.kiyasGetiri), 'kıyas: hiçbir şey yapmasaydı', ton(cs.kiyasGetiri)),
      sayiKutu('En derin düşüş', sayiMi(o.maxDD) ? yz(-o.maxDD) : '—', 'zirveden en büyük kayıp', sayiMi(o.maxDD) && o.maxDD > 0 ? 'tone-danger' : ''),
      sayiKutu('Değer', gizli ? '—' : para(o.ozsermaye, p, 0), gizli ? 'tutarlar gizli' : `başlangıç ${para(o.yatirilan, p, 0)}`),
      sayiKutu('Nakit', gizli ? '—' : para(o.nakit, p, 0), sayiMi(o.nakit) && o.ozsermaye > 0 ? `payı ${yz(o.nakit / o.ozsermaye, 0)} · ${o.islemSayisi || 0} emir` : null)
    ]);
    const poz = (x.pozisyonlar || []).map(z => el('tr', null, [
      el('td', { class: 'pf-sola fw-semibold', text: cv(z.ad) || z.s }),
      el('td', { class: 'sayi', text: z.simulasyon ? '—' : adet(z.adet) }),
      el('td', { class: 'sayi', text: z.simulasyon ? '—' : fiyat(z.ortMaliyet, p) }),
      el('td', { class: 'sayi', text: z.simulasyon ? 'simülasyon' : fiyat(z.kapanis, p) }),
      el('td', { class: 'sayi', text: gizli ? '—' : para(z.deger, p) }),
      el('td', { class: `sayi ${ton(z.kzYuzde)}`, text: z.simulasyon ? '—' : `${gizli ? '' : para(z.kz, p) + ' · '}${isaretli(z.kzYuzde)}` }),
      el('td', { class: 'sayi', text: yz(z.pay) })
    ]));
    const islemSatiri = (i) => el('tr', null, [
      el('td', { class: 'sayi', text: i.gun }), el('td', { class: 'pf-sola', text: TUR_AD[i.tur] || i.tur }),
      el('td', { class: 'pf-sola fw-semibold', text: i.s === 'HUCUM' ? 'Kairos kolu' : (i.s || '—') }),
      el('td', { class: 'sayi', text: i.adet != null ? adet(i.adet) : '—' }),
      el('td', { class: 'sayi', text: i.fiyat != null && i.tur !== 'temettu' ? fiyat(i.fiyat, p) : '—' }),
      el('td', { class: 'sayi', text: gizli ? '—' : para(i.tutar, p) }),
      el('td', { class: 'sayi', text: gizli || !i.komisyon ? '—' : para(i.komisyon, p) }),
      el('td', { class: 'pf-sola pf-kucuk', text: i.neden })
    ]);
    const isl = (x.islemler || []).slice().reverse();
    const a = x.ayar || {};
    const kzKap = el('div', { id: `hisseKz-${k(id)}`, class: 'mp-kz' });
    doldur(kap, [
      baslik,
      el('p', { class: `hint hint-sm mb-0 ${d.ton}`, text: d.metin }),
      tamAdetBlok(d.tamAdet, () => yukle(true), `btnKesirliAc-${k(id)}`),
      ...d.uyarilar.map(u => el('p', { class: 'pf-uyari pf-uyari-uyari mb-0', text: `⚠ ${u}` })),
      sayilar,
      buAy,
      el('div', { class: 'mp-iki' }, [
        el('div', { class: 'mp-blok' }, [grafikBolumu(id, x)]),
        el('div', { class: 'mp-blok' }, [el('h4', { class: 'pf-bolum-baslik', text: 'Hisse bazında kâr / zarar' }), kzKap])
      ]),
      el('div', { class: 'mp-iki' }, [
        el('div', { class: 'mp-blok' }, [el('h4', { class: 'pf-bolum-baslik', text: 'Botun elindekiler' }),
          poz.length ? tablo(['Hisse', 'Adet', 'Ort. maliyet', 'Son fiyat', 'Değer', 'Kâr / zarar', 'Pay'], poz, `tblHissePoz-${k(id)}`) : el('p', { class: 'hint hint-sm', text: 'Şu an hisse yok (hepsi nakitte).' })]),
        el('div', { class: 'mp-blok' }, [havuzBolumu(id)])
      ]),
      el('details', { class: 'hs-kat-mini mt-4', id: `hisseIslemKat-${k(id)}` }, [
        el('summary', { text: `İşlem geçmişi (${isl.length} kayıt)` }),
        isl.length ? tablo(['Gün', 'İşlem', 'Hisse', 'Adet', 'Fiyat', 'Tutar', 'Komisyon', 'Neden'], isl.map(islemSatiri), `tblHisseIslem-${k(id)}`) : el('p', { class: 'hint hint-sm', text: 'Henüz işlem yok.' })
      ]),
      el('p', { class: 'hint hint-sm mt-3 mb-0', text: `Kâğıt hesabın kuralları: ${p === 'USD' ? `emir başına ${para(a.komisyonSabit, 'USD')} komisyon (Midas)` : (a.komisyonOran ? `komisyon tutarın %${(a.komisyonOran * 100).toLocaleString('tr-TR')}'i` : 'komisyon yok (Midas BIST)')}, kayma %${((a.kayma || 0) * 100).toLocaleString('tr-TR')}, ${a.kesirli ? 'kesirli adet' : 'tam adet'}, temettü stopajı %${Math.round((a.stopaj || 0) * 100)}, nakde faiz yok; mevcut hissede küçük düzeltme (değerin %${Math.round((a.esikOran || 0) * 100)}'sinden az) yapılmaz. Fiyatlar gerçek açılış/kapanış (Yahoo). Sermaye: bu sayfanın altındaki Ayarlar.` })
    ]);
    grafikCiz(id, x);
    if (AG.grafik && AG.grafik.cubuk) AG.grafik.cubuk(kzKap, (x.pozisyonlar || []).filter(z => !z.simulasyon && sayiMi(z.kzYuzde)).map(z => ({ ad: z.s || z.ad, v: z.kzYuzde, alt: gizli ? null : para(z.kz, p) })), { ad: `${adKisa(id)} hisse kâr/zarar`, bosMetin: 'Henüz hisse yok.' });
    buAyDoldur();
  }
  /** Bu ay şeridi tasarimci.js'ten (emir listesi + Uyguladım) — kart yeniden çizilince yeniden doldurulur. */
  function buAyDoldur() { if (AG.pages && AG.pages.tasarimci && AG.pages.tasarimci.modelBuAyCiz) AG.pages.tasarimci.modelBuAyCiz(); }

  /** Grafik bölümü: Canlı takip ↔ Geçmiş (backtest) seçici + kap + açıklama. */
  function grafikBolumu(id, x) {
    const canliNokta = (x.gunler || []).length;
    const kip = varsayilanKip(id, x);
    const g = gecmis[id];
    const yil = g && g.baslangic ? g.baslangic.slice(0, 4) : null;
    const secim = el('div', { class: 'pf-dugmeler', role: 'group', 'aria-label': 'Grafik' }, [['canli', `Canlı takip (${canliNokta} gün)`], ['gecmis', `Geçmiş — backtest${yil ? ` (${yil}'ten)` : ''}`]].map(([a, t]) =>
      el('button', { type: 'button', id: `btnHisseGrafik-${a}-${k(id)}`, class: `btn btn-sm ${kip === a ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': kip === a ? 'true' : 'false',
        onclick: () => { grafikKip[id] = a; if (veri && veri.modeller && veri.modeller[id]) kartCiz(id, veri.modeller[id]); } }, [el('span', { text: t })])));
    const not = kip === 'gecmis'
      ? (g ? `${cv(g.uyari)}${g.bilesen ? ' Bu modelin tek bir geçmiş eğrisi yok: iki yarısı ayrı çizildi (Kairos simülasyonu iyimser).' : ''} Aylık, başlangıç 100 (${g.birim === 'TL' ? 'TL' : 'USD'}); altın gölgeler kriz dönemleri.` : 'Geçmiş yükleniyor…')
      : (canliNokta < 2 ? 'Canlı takip 12 Ekim 2026\'da başladı; çizgi ikinci işlem gününden sonra görünür. O zamana kadar "Geçmiş" grafiğine bakın.' : `Başlangıç 100. Kalın çizgi kâğıt hesap, ince çizgi ${KIYAS[id][1]}; ▲ alış ▼ satış.`);
    return el('div', { class: 'mp-grafik mt-3' }, [secim, el('div', { id: `hisseGrafik-${k(id)}`, class: 'hisse-grafik mt-2' }), el('p', { class: 'hint hint-sm mt-2 mb-0', text: not })]);
  }

  function grafikCiz(id, x) {
    const kap = bul(`hisseGrafik-${k(id)}`);
    if (!kap || !AG.grafik) return;
    const t = (gun) => Date.parse(gun + 'T12:00:00Z');
    if (varsayilanKip(id, x) === 'gecmis') {
      const g = gecmis[id];
      if (g === undefined) { gecmisYukle(id); return; }
      if (!g) return;
      const [ana, ...diger] = (g.seriler || []).filter(s => s.noktalar && s.noktalar.length);
      if (!ana) { doldur(kap, [el('p', { class: 'hint mb-0', text: 'Geçmiş seri bulunamadı.' })]); return; }
      const bas = ana.noktalar[0][0];
      AG.grafik.ana(kap, {
        ad: `${adKisa(id)} geçmiş`, etiket: cv(ana.ad), birim: '', dusus: true,
        seri: ana.noktalar.map(([tt, v]) => ({ t: tt, v })),
        kiyas: diger.map(s => ({ ad: cv(s.ad), seri: s.noktalar.map(([tt, v]) => ({ t: tt, v })) })),
        krizler: KRIZLER.filter(z => Date.parse(z.bit) > bas)
      });
      return;
    }
    const cs = canliSeriler(id, x);
    AG.grafik.ana(kap, {
      ad: adKisa(id), etiket: 'Kâğıt hesap (başlangıç 100)', birim: '', dusus: cs.ana.length > 5,
      bosMetin: 'Canlı takip 12 Ekim 2026\'da başladı; çizgi ikinci işlem gününden sonra görünür.',
      seri: cs.ana.map(z => ({ t: t(z.gun), v: z.v })),
      kiyas: cs.kiyas.length ? [{ ad: cs.kiyasAd, seri: cs.kiyas.map(z => ({ t: t(z.gun), v: z.v })) }] : [],
      isaretler: (x.islemler || []).filter(i => i.tur === 'al' || i.tur === 'sat').map(i => ({ t: t(i.gun), tur: i.tur, etiket: `${i.s} ${adet(i.adet)}` }))
    });
  }

  async function gecmisYukle(id) {
    if (gecmis[id] === null) return;   // yükleniyor
    gecmis[id] = null;
    try {
      const r = await AG.api.tasarimci.gecmis(id);
      if (!r || !r.success) throw new Error((r && r.error) || 'yanıt yok');
      gecmis[id] = r;
    } catch (e) { gecmis[id] = { seriler: [], uyari: `Geçmiş okunamadı: ${e.message}.`, birim: '' }; }
    if (veri && veri.modeller && veri.modeller[id]) kartCiz(id, veri.modeller[id]);
  }

  /** Aday havuzu: sıradaki kararın önizlemesi (yalnız M10). */
  function havuzBolumu(id) {
    if (id === 'm-837') {
      return el('div', { id: `hisseHavuz-${k(id)}` }, [
        el('h4', { class: 'pf-bolum-baslik', text: 'Hisse seçimi' }),
        el('p', { class: 'hint hint-sm mb-0', text: 'Bu modelde aday havuzu yok: hep QQQ ile Kairos botu arasında yarı yarıya bölünür; yalnız paylar bozulunca yeniden dengelenir.' })
      ]);
    }
    const h = havuz && havuz.modeller ? havuz.modeller[id] : null;
    const bas = el('h4', { class: 'pf-bolum-baslik', text: 'Aday havuzu — sıradaki karar bugün verilse' });
    if (!h || h.hata || !h.satirlar) {
      return el('div', { id: `hisseHavuz-${k(id)}` }, [bas, el('p', { class: 'hint hint-sm mb-0', text: h && h.hata ? `Hesaplanamadı: ${h.hata}` : (havuz && havuz.neden) || 'Aday havuzu henüz yok.' })]);
    }
    const oz = havuzOzeti(h.satirlar);
    const sk = h.sonrakiKarar || {};
    const ozetMetni = oz.cikacak.length || oz.girecek.length
      ? `Bugünkü veriyle ${gunMetni(sk.karar)} kararında çıkacak: ${oz.cikacak.join(', ') || '—'} · girecek: ${oz.girecek.join(', ') || '—'}. Diğer eldekiler kalır.`
      : `Bugünkü veriyle ${gunMetni(sk.karar)} kararında liste değişmiyor: eldeki hisselerin hepsi kalır.`;
    const kesin = h.kesinlik === 'kesine-yakin'
      ? `Puanlar geçmiş ay sonu kapanışlarından hesaplanır, bu yüzden ${gunMetni(sk.karar)}'a kadar neredeyse değişmez; liste yalnız Nasdaq-100 üyeliği değişirse ya da bir hissenin verisi kesilirse değişir. ${h.aday} hisse sıralandı (veri ${gunMetni(h.veriGunu)}).`
      : `Bu bir tahmindir: "en çok işlem gören 30 hisse" karar günü yeniden hesaplanır, kenardaki hisseler girip çıkabilir. Evren ${h.evren || '—'} hisse, ${h.aday} hisse sıralandı (veri ${gunMetni(h.veriGunu)}).`;
    const satirlar = h.satirlar.map(z => el('tr', { class: z.durum === 'cikacak' ? 'mp-havuz-cikacak' : z.durum === 'girecek' ? 'mp-havuz-girecek' : null }, [
      el('td', { class: 'sayi', text: z.sira != null ? String(z.sira) : '—' }),
      el('td', { class: 'pf-sola fw-semibold', text: z.s }),
      el('td', { class: `sayi ${ton(z.p)}`, text: sayiMi(z.p) ? isaretli(z.p, 0) : '—' }),
      el('td', { class: 'pf-sola' }, [rozet(DURUM[z.durum] || [z.durum, '']), z.neden ? el('span', { class: 'pf-kucuk', text: ` ${z.neden}` }) : null])
    ]));
    return el('div', { id: `hisseHavuz-${k(id)}` }, [
      bas,
      el('p', { class: 'mb-2 fw-semibold', id: `hisseHavuzOzet-${k(id)}`, text: ozetMetni }),
      tablo(['Sıra', 'Hisse', 'Son 12 ay getirisi', 'Durum'], satirlar, `tblHisseHavuz-${k(id)}`),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: `İlk 10 sıra alınır. "Yedek aday" = 11–15. sıra: ilk 10'dan biri düşerse yerine girecek olanlar. "Son 12 ay getirisi" son ay hariçtir. ${kesin} Kesin karar ${gunMetni(sk.karar)} kapanışında verilir, ${gunMetni(sk.uygulama)} açılışında uygulanır.` })
    ]);
  }

  /** 62.4: her model kendi Portföy sekmesinde (#pfModel-<id>); ortak alt kısım (#pfModellerKok): ayrıntılı izleme + not. */
  function iskelet() {
    let kok = null;
    for (const id of SIRA) {
      const kap = bul(`pfModel-${id}`);
      if (!kap) continue;
      kok = kok || kap;
      if (!bul(`hisseKart-${k(id)}`)) doldur(kap, [el('article', { id: `hisseKart-${k(id)}`, class: `glass-panel panel-pad bot-kart mp-kart mp-r-${k(id)}`, 'aria-label': adTam(id) }, [el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })])]);
    }
    const ortak = bul('pfModellerKok');
    if (ortak && !bul('pfModelIzlemeKat')) {
      doldur(ortak, [
        el('p', { id: 'hisseKartNot', class: 'hint hint-sm mt-2 mb-0' }),
        el('details', { class: 'glass-panel hs-kat mt-3', id: 'pfModelIzlemeKat', ontoggle: (e) => { if (e.target.open && AG.pages.modelPortfoy) AG.pages.modelPortfoy.yukle(); } }, [
          el('summary', { 'data-ikon': 'table' }, [el('span', { text: 'Ayrıntılı izleme: üç model yan yana, aylık tablo, model ile gerçek portföyün farkı, karar günlüğü, dışa aktarım' })]),
          el('div', { class: 'hs-kat-ic' }, [el('div', { id: 'pfModelKok' })])
        ]),
        el('p', { class: 'hint hint-sm mt-3 mb-0', id: 'hmH1Not', text: 'Not: bu üç model geçmiş verideki çok sayıda deneme arasından seçildi ve kabulü sonradan konmuş ölçütle verildi (H1). Canlı takip kısa; en az 12–24 ay görmeden "işe yarıyor" demek erken. Geçmiş grafiği iyimserdir.' })
      ]);
    }
    return kok;
  }

  async function yukle(zorla) {
    const kok = iskelet();
    if (!kok || yukleniyor) return;
    if (!zorla && veri && Date.now() - zaman < 5 * 60e3) { buAyDoldur(); return; }
    yukleniyor = true;
    try {
      const T = AG.api.tasarimci;
      const guv = (p) => Promise.resolve(p).then(r => (r && r.success !== false ? r : null)).catch(() => null);
      const [r, du, ah, ...md] = await Promise.all([T.kagit(), guv(T.durum()), guv(T.adayHavuzu ? T.adayHavuzu() : null), ...SIRA.map(id => guv(T.model(id)))]);
      if (!r || !r.success) throw new Error((r && r.error) || 'yanıt yok');
      veri = r; zaman = Date.now(); sonraki = du && du.sonrakiKararlar ? du.sonrakiKararlar : null; havuz = ah;
      SIRA.forEach((id, i) => { if (md[i]) modelVeri[id] = md[i]; });
      const not = bul('hisseKartNot');
      if (not) not.textContent = r.bos ? r.neden : `Botların sanal hesapları en son ${new Date(r.guncelleme).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} hesaplandı (30 dakikada bir yenilenir).`;
      for (const id of SIRA) if (r.modeller && r.modeller[id]) kartCiz(id, r.modeller[id]);
    } catch (e) {
      for (const id of SIRA) { const kap = bul(`hisseKart-${k(id)}`); if (kap) doldur(kap, [AG.bildirim.hataKutusu(e.message, { baslik: 'Model portföy okunamadı', yeniden: () => yukle(true) })]); }
    } finally { yukleniyor = false; }
  }

  if (doc && doc.addEventListener) doc.addEventListener('ag:tema', () => { if (veri && veri.modeller) for (const id of SIRA) if (veri.modeller[id]) grafikCiz(id, veri.modeller[id]); });

  AG.pages = AG.pages || {};
  AG.pages.hisseYapilari = { yukle, durumMetni, tamAdetUyarisi, kesirliDugmesi, tamAdetBlok, kararFarki, havuzOzeti, kiyasSerisi, kartCiz, NE_YAPAR };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.hisseYapilari;
})(typeof window !== 'undefined' ? window : globalThis);
