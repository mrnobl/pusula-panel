/**
 * PORTFÖY LABORATUVARI — "Portföy" sekmesi (L3).
 * ═══════════════════════════════════════════════════════════════════════════
 * Amaç: portföyü burada simüle edip gerçek hayatta ELLE uygulamak ("QQQ'yu
 * çıkarıp yerine başka bir endeks koysam ne olur?"). Sunucu tarafı
 * lib/portfoy/ (katalog, seri, motor, lab, api); uçlar /api/portfoy/*.
 *
 * Alt sekmeler (62.4, kullanıcıyla taslak 1–3 üzerinden — "sekme = model; şahsi portföyüm için de model gibi bir sayfa; hesaplar
 * ayrı"): üstte ÖZET ŞERİDİ (#pfOzetSerit; toplam + USD/TL düğmesi, değer çizgisi, hedef → gerçek — portfoyum.js) ·
 * PORTFÖYÜM (varsayılan; şahsi portföy sayfası — portfoyum.js) · RAPOR (64.2: aylık rapor, stres, korelasyon — portfoyumRapor.js) · NASDAQ M10 · BIST M10 · 837 (her biri #pfModel-<id>: botun sanal
 * hesabı + "Bu ay" kartı — hisseYapilari.js + tasarimci.js modelBuAyCiz; sekme adında açık iş sayısı #pfIsSayi-<sekme>) ·
 * HESAPLARIM (hesap kartları + satır içi "+ işlem" — portfoyum.js). Model sekmelerinin altında ortak #pfModelOrtak: #pfBuAyKok
 * (Ayarlar, açılış rehberi) + #pfModellerKok (ayrıntılı izleme — modelPortfoy.js). Eski adresler: model/modeller/buay → nasdaq, kayit → hesaplar.
 * LABORATUVAR (araştırma aracı; Portföy sekmelerinde YOK — Araştırma ekranından ya da #/portfoy/laboratuvar ile açılır, kendi
 * başlığı ve "← Portföy" düğmesi var): Tasarımcı (kurucu, katalog, risk — js/pages/tasarimci.js) · Kurucu — varlık kataloğu +
 * portföy kurucu · Sonuç · Karşılaştır; İleri araştırma katında Strateji karışımı · Varyasyon (67.5; "Olsaydı planı" kaldırıldı —
 * gerçek emir önerisi Hedefim planlayıcısında, eski adres Kurucu'ya gider). Eski adresler: #/portfoy/model → modeller. Üst şeritte deneme sayacı ve
 * "Veri durumu" kartı (kaynak tablosu, GET /api/veri/durum); uzun işler (simülasyon, varyasyon, indirme) sunucunun
 * iş kuyruğunda koşar, ilerleme `pfIs` kutusunda görünür.
 *
 * Araştırmanın dersleri arayüzde ÖNDE (PLAN-PORTFOY.md Sonuç/Denetim):
 *   · "Geçmişe bakarak (in-sample)" ile "görülmemiş veride (walk-forward)"
 *     sonuç her zaman ayrı etiketlenir ve aynı dönemde yan yana verilir.
 *   · Stres dönemleri ve "bugünkü ağırlıklar geçmişe sabit" stresi sonuç
 *     sayfasında ölçülerin hemen altında.
 *   · Her simülasyon/varyasyon adayı oturumun deneme sayacına eklenir;
 *     düzeltilmiş Sharpe (DSR) ve şans uyarısı gösterilir.
 *
 * Kurallar (scripts/panel-denetim.js + scripts/panel-portfoy-testi.js):
 * tüm DOM `AG.dom.el` ile (innerHTML yok), renkler token sınıflarıyla
 * (inline stil yok; grafik renkleri `AG.tema.renk('--seri-N')`), istekler
 * yalnız `AG.api.portfoy` (veri durumu kartı: `AG.api.veri`), onay `AG.onayla`, hata `AG.bildir`.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const { el, doldur, bul } = AG.dom;
  const api = () => AG.api.portfoy;
  const doc = global.document;

  // ═══ BİÇİM ══════════════════════════════════════════════════════════════
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const virgul = (s) => String(s).replace('.', ',');
  const yz = (x, b = 1) => AG.fmt.oranYuzde(x, b);   // B-17: tek yüzde biçimi (core/format.js; −%4,0, −0 → %0,0)
  const isaretli = (x, b = 1) => (sayiMi(x) ? `${x > 0 ? '+' : ''}${yz(x, b)}` : '—');
  const sy = (x, b = 2) => (sayiMi(x) ? virgul(x.toFixed(b)) : '—');
  const usd = (x) => (sayiMi(x) ? `${x < 0 ? '-' : ''}$${Math.round(Math.abs(x)).toLocaleString('tr-TR')}` : '—');
  const tl = (x) => (sayiMi(x) ? `₺${Math.round(x).toLocaleString('tr-TR')}` : '—');
  const ton = (x) => (!sayiMi(x) ? 'tone-muted' : x > 0 ? 'tone-success' : x < 0 ? 'tone-danger' : 'tone-muted');
  const gunStr = (t) => new Date(t).toISOString().slice(0, 10);
  const yilFarki = (a, b) => (Date.parse(b) - Date.parse(a)) / (365.25 * 864e5);
  const kisaAd = (k) => String(k || '').replace(/^[a-z-]+:/, '');
  const bildir = (m, t) => AG.bildir(m, t || 'bilgi');

  const YONTEM_AD = {
    elle: 'Elle ağırlık (sabit)', esit: 'Eşit ağırlık', 'ters-vol': 'Ters oynaklık', 'risk-paritesi': 'Risk paritesi',
    'min-varyans': 'En düşük varyans', cvar: 'En düşük kuyruk riski (CVaR)', 'maks-sharpe': 'En yüksek Sharpe'
  };
  const SINIF_AD = {
    'hisse-endeks': 'Endeks / ETF', hisse: 'Hisse', fon: 'TEFAS fonu', kripto: 'Kripto', emtia: 'Emtia', doviz: 'Döviz',
    tahvil: 'Tahvil', strateji: 'Bot stratejisi', 'tl-nakit': 'TL mevduat / nakit', nakit: 'USD nakit'
  };
  const HESAP_AD = { binance: 'Binance', 'abd-araci': 'ABD aracı kurum', 'tr-banka': 'TR banka', tefas: 'TEFAS', yok: 'doğrudan alınamaz' };
  const SIKLIK_AD = { aylik: 'Aylık', ceyrek: 'Çeyreklik', yillik: 'Yıllık', yok: 'Dengeleme yok' };
  const SENARYO_AD = { olculen: 'i — ölçülen (iyimser)', yari: 'ii — fazla getiri yarıya', btc: 'iii — BTC al-tut (kötümser)' };
  const STRES_KISA = { '2008': '2008', '2018-08-TL': '2018-08 TL', '2020-03': '2020-03', '2021-12-TL': '2021 TL', '2022': '2022', '2025-10-10': '2025-10 kripto' };

  /** Grup şablonları — motorun grup seçicileri (lib/portfoy/motor.js tanimDenetle). Yüzde birimiyle. */
  const GRUP_SABLON = [
    { ad: 'TL toplam', para: 'TRY', max: 15, etiket: 'TL toplam ≤ %15' },
    { ad: 'Kripto', sinif: ['kripto', 'strateji'], max: 10, etiket: 'Kripto (bot dahil) ≤ %10' },
    { ad: 'Hisse', sinif: ['hisse-endeks', 'hisse'], max: 60, etiket: 'Hisse ≤ %60' },
    { ad: 'Tahvil', sinif: ['tahvil'], min: 20, etiket: 'Tahvil ≥ %20' }
  ];

  /** Varyasyon aday kümeleri — motor `adaylar` süzgeci (varyasyon: adayListesi). */
  const ADAY_KUME = {
    'abd-endeks': { ad: 'ABD endeks / sektör ETF\'leri', suzgec: { sinif: 'hisse-endeks', hesap: 'abd-araci' } },
    'endeks-tumu': { ad: 'Tüm endeksler (alınamayanlar dahil)', suzgec: { sinif: 'hisse-endeks' } },
    tahvil: { ad: 'ABD tahvil ETF\'leri', suzgec: { sinif: 'tahvil' } },
    emtia: { ad: 'Emtia (ETF + vadeli)', suzgec: { sinif: 'emtia' } },
    kripto: { ad: 'Kripto coinler', suzgec: { sinif: 'kripto' } },
    strateji: { ad: 'Bot stratejileri', suzgec: { sinif: 'strateji' } },
    'tefas-pp': { ad: 'TEFAS para piyasası fonları', suzgec: { sinif: 'fon', kategori: 'Para piyasası' } },
    'tefas-altin': { ad: 'TEFAS altın fonları', suzgec: { sinif: 'fon', kategori: 'Altın' } },
    'tefas-hisse': { ad: 'TEFAS hisse (BIST) fonları', suzgec: { sinif: 'fon', kategori: 'Hisse senedi' } },
    'tefas-yabanci': { ad: 'TEFAS yabancı hisse fonları', suzgec: { sinif: 'fon', kategori: 'Yabancı' } },
    'nasdaq-hisse': { ad: 'Nasdaq-100 hisseleri', suzgec: { sinif: 'hisse' } },
    ozel: { ad: 'Özel liste (kimlikleri yazın)', suzgec: null }
  };

  // ═══ DURUM ══════════════════════════════════════════════════════════════
  const TASLAK_ANAHTAR = 'ag.portfoy.taslak';
  const OTURUM = 'varsayilan';

  function varsayilanTaslak() {
    return {
      varliklar: [
        { kimlik: 'yahoo:QQQ', ad: 'Invesco QQQ Trust', sinif: 'hisse-endeks', hesap: 'abd-araci', para: 'USD', agirlik: 50, min: '', max: '' },
        { kimlik: 'yahoo:IEF', ad: 'iShares 7-10 Year Treasury Bond ETF', sinif: 'tahvil', hesap: 'abd-araci', para: 'USD', agirlik: 30, min: '', max: '' },
        { kimlik: 'yahoo:GLD', ad: 'SPDR Gold Shares', sinif: 'emtia', hesap: 'abd-araci', para: 'USD', agirlik: 20, min: '', max: '' }
      ],
      gruplar: [],
      yontem: 'elle', kip: 'walk-forward', pencereAy: 36, siklik: 'ceyrek', bant: 5, maliyetIslem: 0.3, maliyetHesap: 0,
      nakitGetirisi: 'yok', birim: 'USD', bas: '', bit: '', eksikVeri: 'kirp', senaryo: 'olculen', kiyaslar: 'yahoo:QQQ, 60/40'
    };
  }

  let D = varsayilanTaslak();
  let sonSonuc = null;
  let sonVaryasyon = null;
  let aktifAlt = 'pano';
  let sonLab = 'kurucu';
  let acildi = false;
  let katalogZaman = null;
  const grafikler = {};

  function taslakKaydet() {
    try { global.localStorage.setItem(TASLAK_ANAHTAR, JSON.stringify(D)); } catch (e) { /* depolama yok: yalnız hatırlanmaz */ }
  }
  function taslakOku() {
    try {
      const s = global.localStorage.getItem(TASLAK_ANAHTAR);
      if (!s) return null;
      const t = JSON.parse(s);
      return t && Array.isArray(t.varliklar) ? { ...varsayilanTaslak(), ...t } : null;
    } catch (e) { return null; }
  }

  // ═══ TANIM ↔ DURUM ══════════════════════════════════════════════════════
  const bosMu = (v) => v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
  const oran = (v) => (bosMu(v) ? undefined : Number(v) / 100);

  /** Kurucu durumu → motor tanımı (yüzdeler orana çevrilir; boş alanlar gönderilmez). */
  function tanimKur(d) {
    const elle = d.yontem === 'elle';
    const varliklar = d.varliklar.map(v => {
      const x = { kimlik: v.kimlik };
      if (v.hesap) x.hesap = v.hesap;
      if (elle) x.agirlik = oran(v.agirlik);
      if (!bosMu(v.min)) x.min = oran(v.min);
      if (!bosMu(v.max)) x.max = oran(v.max);
      return x;
    });
    const gruplar = d.gruplar.map(g => {
      const x = { ad: g.ad };
      for (const k of ['kimlikler', 'sinif', 'hesap', 'para']) if (g[k] && (!Array.isArray(g[k]) || g[k].length)) x[k] = g[k];
      if (!bosMu(g.max)) x.max = oran(g.max);
      if (!bosMu(g.min)) x.min = oran(g.min);
      return x;
    });
    const islem = Number(d.maliyetIslem || 0) / 100, arasi = Number(d.maliyetHesap || 0) / 100;
    const t = {
      varliklar, gruplar, yontem: d.yontem,
      dengeleme: { siklik: d.siklik, bant: Number(d.bant) / 100 },
      maliyet: arasi > 0 ? { islem, hesaplarArasi: arasi } : islem,
      nakitGetirisi: d.nakitGetirisi, birim: d.birim, eksikVeri: d.eksikVeri, stratejiSenaryosu: d.senaryo,
      kiyaslar: String(d.kiyaslar || '').split(',').map(s => s.trim()).filter(Boolean)
    };
    if (!elle) { t.kip = d.kip; t.pencereAy = Number(d.pencereAy) || 36; }
    if (d.bas || d.bit) t.donem = { ...(d.bas ? { bas: d.bas } : {}), ...(d.bit ? { bit: d.bit } : {}) };
    return t;
  }

  /** Motor tanımı (kayıtlı portföy, karar, sonuç) → kurucu durumu. Varlık adları sonradan katalogdan tamamlanır. */
  function tanimdanDurum(t) {
    const yuz = (x) => (x == null ? '' : +(x * 100).toFixed(4));
    const d = varsayilanTaslak();
    d.varliklar = (t.varliklar || []).map(v => (typeof v === 'string' ? { kimlik: v } : v)).map(v => ({
      kimlik: v.kimlik, ad: v.ad || '', sinif: v.sinif || '', hesap: v.hesap || '', para: v.para || '',
      agirlik: yuz(v.agirlik), min: yuz(v.min), max: yuz(v.max)
    }));
    d.gruplar = (t.gruplar || []).map(g => {
      const s = g.secici || g;
      return { ad: g.ad, kimlikler: s.kimlikler, sinif: s.sinif, hesap: s.hesap, para: s.para, max: yuz(g.max), min: yuz(g.min) };
    });
    d.yontem = t.yontem || (d.varliklar.every(v => v.agirlik !== '') ? 'elle' : 'esit');
    d.kip = t.kip === 'gecmis' && d.yontem !== 'elle' ? 'gecmis' : 'walk-forward';
    if (t.pencereAy) d.pencereAy = t.pencereAy;
    if (t.dengeleme) { d.siklik = t.dengeleme.siklik || d.siklik; if (t.dengeleme.bant != null) d.bant = yuz(t.dengeleme.bant); }
    if (typeof t.maliyet === 'number') { d.maliyetIslem = yuz(t.maliyet); d.maliyetHesap = 0; }
    else if (t.maliyet) { d.maliyetIslem = yuz(t.maliyet.islem || 0); d.maliyetHesap = yuz(t.maliyet.hesaplarArasi || 0); }
    for (const [a, b] of [['nakitGetirisi', 'nakitGetirisi'], ['birim', 'birim'], ['eksikVeri', 'eksikVeri'], ['stratejiSenaryosu', 'senaryo']]) if (t[a]) d[b] = t[a];
    if (t.donem) { d.bas = t.donem.bas || ''; d.bit = t.donem.bit || ''; }
    if (Array.isArray(t.kiyaslar)) d.kiyaslar = t.kiyaslar.join(', ');
    return d;
  }

  /** Ağırlık ve kısıt denetimi — Simüle et'ten önce; hatalar engeller, uyarılar yalnız gösterilir. */
  function agirlikDenetim(d) {
    const hatalar = [], uyarilar = [];
    const elle = d.yontem === 'elle';
    if (!d.varliklar.length) hatalar.push('Portföy boş: katalogdan varlık ekleyin.');
    let toplam = 0, minTop = 0, maxTop = 0;
    for (const v of d.varliklar) {
      const ad = kisaAd(v.kimlik);
      const chk = (deger, alan) => {
        if (bosMu(deger)) return null;
        const n = Number(deger);
        if (!Number.isFinite(n) || n < 0 || n > 100) { hatalar.push(`${ad}: ${alan} 0–100 arası olmalı.`); return null; }
        return n;
      };
      const a = chk(v.agirlik, 'ağırlık'), lo = chk(v.min, 'min'), hi = chk(v.max, 'max');
      if (elle) { if (a == null && !hatalar.some(h => h.startsWith(ad + ':'))) hatalar.push(`${ad}: ağırlık girilmedi.`); else toplam += a || 0; }
      minTop += lo || 0; maxTop += hi == null ? 100 : hi;
      if (lo != null && hi != null && lo > hi) hatalar.push(`${ad}: min > max.`);
      if (elle && a != null && ((hi != null && a > hi) || (lo != null && a < lo))) uyarilar.push(`${ad}: ağırlık min/max dışında (elle yöntemde sınırlar uygulanmaz, yalnız uyarılır).`);
    }
    if (elle && d.varliklar.length && Math.abs(toplam - 100) > 0.01) hatalar.push(`Ağırlık toplamı ${yz(toplam / 100, 2)} — %100 olmalı ("%100'e ölçekle" düğmesi).`);
    if (!elle && minTop > 100 + 1e-9) hatalar.push(`Min ağırlıkların toplamı ${yz(minTop / 100)} > %100: uygun ağırlık yok.`);
    if (!elle && d.varliklar.length && maxTop < 100 - 1e-9) hatalar.push(`Max ağırlıkların toplamı ${yz(maxTop / 100)} < %100: uygun ağırlık yok.`);
    for (const g of d.gruplar) {
      if (!(g.kimlikler || g.sinif || g.hesap || g.para)) hatalar.push(`Grup '${g.ad}': seçici yok.`);
      for (const [alan, x] of [['max', g.max], ['min', g.min]]) if (!bosMu(x) && !(Number(x) >= 0 && Number(x) <= 100)) hatalar.push(`Grup '${g.ad}': ${alan} 0–100 arası olmalı.`);
    }
    if (!bosMu(d.bant) && !(Number(d.bant) >= 0 && Number(d.bant) <= 100)) hatalar.push('Dengeleme bandı 0–100 arası olmalı.');
    if (!d.kiyaslar || !String(d.kiyaslar).trim()) uyarilar.push('Kıyas yok: sonuç bir ölçüyle karşılaştırılmayacak.');
    return { toplam, minTop, maxTop, hatalar, uyarilar, gecerli: hatalar.length === 0 };
  }

  // ═══ YARDIMCI DOM ═══════════════════════════════════════════════════════
  function girdi(props, deger) {
    const n = el('input', props);
    if (deger !== undefined && deger !== null) n.value = String(deger);
    return n;
  }
  function secici(props, secenekler, deger) {
    const s = el('select', props, secenekler.map(([v, t]) => {
      const o = el('option', { value: v, text: t });
      if (String(v) === String(deger)) o.selected = true;
      return o;
    }));
    s.value = String(deger == null ? '' : deger);
    return s;
  }
  /** Etiketli alan; `terim` verilirse etiketin yanında sözlük "?" (B-23). */
  const alan = (etiket, kontrol, ipucu, terim) => el('label', { class: 'pf-alan', title: ipucu || null }, [terim && AG.sozluk ? el('span', { class: 'pf-alan-etiket' }, [el('span', { text: etiket }), AG.sozluk.yardim(terim)]) : el('span', { text: etiket }), kontrol]);
  /** B-19: ekranın başında "bu ekran ne için / ne için DEĞİL" satırı. */
  const neIcin = (icin, degil) => el('p', { class: 'pf-ne-icin hint hint-sm' }, [el('strong', { text: 'Bu ekran: ' }), el('span', { text: icin + ' ' }), el('strong', { text: 'Değil: ' }), el('span', { text: degil })]);
  const YONTEM_TERIM = { 'ters-vol': 'tersOynaklik', 'risk-paritesi': 'riskParitesi', 'min-varyans': 'enDusukVaryans', cvar: 'cvar', 'maks-sharpe': 'sharpe' };
  /** B-23: kıyaslar çoklu seçimle (ad gösterilir, kimlik title'da); listede olmayan kimlik "diğer" kutusunda kalır. */
  const KIYAS_SECENEK = [['yahoo:QQQ', 'QQQ al-tut (Nasdaq 100 fonu)'], ['60/40', '60/40 (%60 QQQ + %40 IEF tahvil fonu)'], ['yahoo:SPY', 'S&P 500 fonu (SPY) al-tut'], ['kripto:BTC', 'BTC al-tut'], ['yahoo:GLD', 'Altın fonu (GLD) al-tut']];
  const dugme = (metin, onclick, sinif, ek) => el('button', { type: 'button', class: `btn ${sinif || 'btn-secondary btn-sm'}`, onclick, ...(ek || {}) }, [el('span', { text: metin })]);
  /** Tablo → kart ortak bileşeni (js/core/tablo.js). Isı haritaları (pf-isi: yıl × ay, korelasyon) MATRİS kalır. */
  const tablo = (basliklar, satirlar, sinif, siralanabilir) => AG.tablo.kutulu({ basliklar, satirlar, sinif: `pf-tablo ${sinif || ''}`.trim(), matris: /\bpf-isi\b/.test(sinif || ''), siralanabilir });
  const hucre = (metin, sinif, title) => el('td', { class: sinif || null, text: metin, title: title || null });
  const kutu = (etiket, deger, alt, sinif) => el('div', { class: 'sunken' }, [
    el('div', { class: 'metric-label', text: etiket }),
    el('div', { class: `metric-value${sinif ? ' ' + sinif : ''}`, text: deger }),
    alt ? el('div', { class: 'hint hint-sm mb-0', text: alt }) : null
  ]);
  const baslik = (metin) => el('h3', { class: 'pf-bolum-baslik', text: metin });

  /** Varlığın veri/nitelik rozetleri (katalog kaydından). */
  function rozetler(v) {
    const r = [];
    const et = v.etiketler || [];
    const not = v.not || '';
    const ekle = (metin, tur, title) => r.push(el('span', { class: `pf-rozet${tur ? ' pf-rozet-' + tur : ''}`, text: metin, title: title || null }));
    if (et.includes('iyimser')) ekle('iyimser', 'tehlike', 'Yüzlerce denemeden seçilmiş, örneklem içi strateji: 3 senaryoyla kullanın.');
    if (et.includes('senaryolu')) ekle('3 senaryo', 'bilgi', 'i ölçülen · ii fazla getiri yarıya · iii BTC al-tut');
    if (et.includes('vekil') || /vekil|temettüsüz|fiyat endeksi/i.test(not)) ekle('vekil', 'uyari', 'Vekil ya da düzeltilmemiş seri');
    if (v.kaynakTur === 'tefas' || /son 5 yıl|en çok 5 yıl/i.test(not)) ekle('son 5 yıl', 'uyari', 'TEFAS en çok 5 yıl geri veriyor: 2018 / 2021 TL krizleri bu seride YOK.');
    else if (v.ilkTarih && v.sonTarih && yilFarki(v.ilkTarih, v.sonTarih) < 5) ekle(`kısa: ${sy(yilFarki(v.ilkTarih, v.sonTarih), 1)} yıl`, 'uyari');
    if (et.includes('kapandi')) ekle('kapandı', 'tehlike');
    if (et.includes('veri-kesildi')) ekle('veri kesildi', 'tehlike');
    if (et.includes('nitelikli-yatirimci')) ekle('nitelikli yatırımcı', null, 'Serbest/özel fon: genel yatırımcıya kapalı');
    if (et.includes('kaldiracli')) ekle('kaldıraçlı', 'uyari');
    if (et.includes('perp')) ekle('perp kapanışı', 'bilgi', 'Spot yok: vadeli kapanışı, funding hariç');
    if (v.hesap === 'yok') ekle('alınamaz', 'uyari', 'Endeks/vadeli: gerçekte ETF/fon ile tutulur');
    if (v.durum === 'indirilebilir') ekle('ilk kullanımda kurulur', 'bilgi');
    return el('span', { class: 'pf-rozetler' }, r);
  }

  // ═══ İŞ İZLEME (tek tip gösterge: js/core/ilerleme.js) ═════════════════
  const bekle = (ms) => new Promise(c => setTimeout(c, ms));
  /** İş bitene kadar yoklar; bitince sonucu döndürür, hata/iptalde fırlatır. */
  function isiIzle(id, baslikMetni) {
    return AG.ilerleme.izle({
      id, baslik: baslikMetni, kutu: bul('pfIs'), aralik: 600, bekle: (ms) => sayfa._bekle(ms),
      oku: (x) => api().is(x),
      iptal: (is) => api().isIptal(is.id).catch(() => null)
    });
  }

  // ═══ ÜST ŞERİT: deneme sayacı + veri güncellemesi ═══════════════════════
  function denemeCiz(sayi) {
    const k = bul('pfDeneme');
    if (!k) return;
    doldur(k, [
      el('span', { text: `Oturum "${OTURUM}": ` }),
      el('strong', { class: sayi >= 20 ? 'tone-warning' : '', text: `${sayi == null ? '—' : sayi} deneme`, title: 'Her simülasyon ve her varyasyon adayı bir deneme sayılır. Çok deneme, şans eseri iyi görünen sonuç üretir; düzeltilmiş Sharpe (DSR) bunu hesaba katar.' }),
      dugme('Sayacı sıfırla', sayacSifirla, 'btn-secondary btn-xs')
    ]);
  }
  async function denemeYukle() {
    try { const r = await api().denemeler(OTURUM); if (r.success) denemeCiz(r.sayi); } catch (e) { /* üst şerit sessiz kalır */ }
  }
  async function sayacSifirla() {
    const evet = await AG.onayla({ baslik: 'Deneme sayacını sıfırla', metin: 'Yeni bir araştırma oturumu başlar; DSR yeniden sıfırdan hesaplanır. Eski denemeler silinmez, arşivde kalır. Aynı soruyu sıfırlayıp yeniden denemek şans düzeltmesini boşa çıkarır.', onay: 'Sıfırla' });
    if (!evet) return;
    try { const r = await api().denemeSifirla(OTURUM); if (!r.success) throw new Error(r.error); denemeCiz(r.sayi); bildir('Deneme sayacı sıfırlandı (eski kayıt arşivde).', 'ok'); }
    catch (e) { bildir('Sayaç sıfırlanamadı: ' + e.message, 'hata'); }
  }
  // ── Veri durumu kartı (lib/veri/orkestrator.js: GET /api/veri/durum, POST /api/veri/guncelle) ──
  // Kaynak başına son veri günü, son güncelleme, durum rozeti ve "güncelle". Güncelleme sunucuda arka planda koşar;
  // sürerken kart 4 sn'de bir yoklanır, bitince katalog tazelenir.
  const VERI_ROZET = { guncel: ['güncel', 'iyi'], bayat: ['bayat', 'uyari'], hata: ['hata', 'tehlike'], calisiyor: ['sürüyor', 'bilgi'] };
  const veriApi = () => AG.api.veri;
  let veriAcik = false;
  let veriYoklama = null;
  let veriSurdu = false;
  // B-32 (61.1): Veri ekranında TEK tarih biçimi — gün "07.10.2026", zaman "07.10.2026 17:27" (eskiden "2026-10-07" ile
  // "07/10 17:27" yan yanaydı).
  const kisaZaman = (s) => {
    if (!s) return '—';
    const t = new Date(s);
    return Number.isFinite(t.getTime()) ? `${trGun(t)} ${t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : '—';
  };
  /** "2026-10-07" ya da Date → "07.10.2026" (takvim günü; saat dilimi kaydırmaz). */
  function trGun(g) {
    if (!g) return '—';
    if (typeof g === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g)) { const [y, a, d] = g.split('-'); return `${d}.${a}.${y}`; }
    const t = g instanceof Date ? g : new Date(g);
    return Number.isFinite(t.getTime()) ? t.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : String(g);
  }
  function veriRozet(x) {
    const [metin, tur] = VERI_ROZET[x.durum] || [x.durum, null];
    const title = x.hata || x.bayatNeden || x.not || x.tazelik || null;
    return el('span', { class: `pf-rozet${tur ? ' pf-rozet-' + tur : ''}`, text: x.tur === 'harici' ? `${metin} · kendi zamanlaması` : metin, title });
  }
  /**
   * Kart iki yerde çizilir: Portföy üst şeridi (#pfGuncelleme, katlı) ve Veri ekranı (#veriKok, Pusula P1 —
   * tablo hep açık). Aynı veri, aynı düğmeler; kap yoksa atlanır.
   */
  // 63.2: Veri ekranı kendi düzenini çizer (js/pages/veri.js — özet + kullanana göre gruplar); burada yalnız Portföy şeridi.
  const VERI_KAPLAR = [['pfGuncelleme', false]];
  function veriDurumCiz(d) {
    for (const [id, hepAcik] of VERI_KAPLAR) { const k = bul(id); if (k) veriKartiCiz(k, d, hepAcik); }
  }
  function veriKartiCiz(k, d, hepAcik) {
    if (!d) { doldur(k, [el('span', { text: 'Veri durumu okunamadı.' }), dugme('Yeniden dene', () => guncellemeYukle(), 'btn-secondary btn-xs')]); return; }
    const o = d.ozet || {};
    const parca = [['guncel', 'güncel'], ['bayat', 'bayat'], ['hata', 'hata'], ['calisiyor', 'sürüyor']].filter(([a]) => o[a]).map(([a, t]) => `${o[a]} ${t}`);
    const aktif = d.aktif ? ` · şu an: ${d.aktif.ad}${d.aktif.ilerleme ? ` (${d.aktif.ilerleme})` : ''}` : '';
    const satirlar = (d.kaynaklar || []).map(x => el('tr', { title: x.aciklama || null }, [
      el('td', { class: 'pf-sola' }, [
        el('strong', { text: x.kisaAd || x.ad }),
        el('div', { class: 'pf-kucuk', text: x.hata ? `Hata: ${x.hata}` : x.bayatNeden ? x.bayatNeden : x.tazelik || '' }),
        x.uyari ? el('div', { class: 'pf-kucuk pf-uyari-metin', text: `Uyarı: ${x.uyari}` }) : null
      ]),
      hucre(x.veriGunu ? trGun(x.veriGunu) : '—', 'pf-sag'),
      x.sonBasari || !x.sonBasariTahmin ? hucre(kisaZaman(x.sonBasari), 'pf-sag', x.sureMs != null ? `${Math.round(x.sureMs / 1000)} sn sürdü` : null)
        : hucre('~' + kisaZaman(x.sonBasariTahmin), 'pf-sag', 'Tahmin (dosya zamanı): orkestratör bu kaynağı henüz hiç güncellemedi'),
      el('td', null, [veriRozet(x)]),
      el('td', null, [x.tur === 'harici' ? null : dugme('Güncelle', (ev) => veriGuncelle(ev.currentTarget, x.ad), 'btn-secondary btn-xs', { title: `${x.kisaAd || x.ad}: tazelik kuralına bakmadan şimdi güncelle` })])
    ]));
    const detay = el('details', { class: 'pf-veri-detay', ontoggle: () => { if (!hepAcik) veriAcik = detay.open; } }, [
      el('summary', { class: 'clickable' }, [
        el('strong', { text: 'Veri durumu' }),
        el('span', { text: `: ${parca.join(' · ') || '—'}${d.calisiyor ? ' — güncelleme sürüyor' + aktif : ''}` })
      ]),
      d.binanceBekleme ? el('p', { class: 'hint hint-sm mt-2 mb-0 pf-uyari-metin', text: `Binance hız sınırı (${d.binanceBekleme.kod}): ${kisaZaman(d.binanceBekleme.bitis)}'e kadar Binance kaynakları istek atmıyor (canlı botun kotası korunur).` }) : null,
      el('div', { class: 'mt-2' }, [tablo(['Kaynak', 'Son veri', 'Son güncelleme', 'Durum', ''], satirlar, 'pf-veri-tablo')]),
      el('p', { class: 'hint hint-sm mt-2 mb-0', title: 'Komut satırından: npm run veri:guncelle', text: 'Otomatik: sunucu açılışından ~2 dk sonra ve her gece 04:30 sonrası bayat olanlar; simülasyon bayat seriye dokununca o kaynak arka planda tazelenir. Elle: "Bayatları güncelle" ya da satırdaki "Güncelle".' })
    ]);
    detay.open = hepAcik || veriAcik;
    doldur(k, [detay, dugme(d.calisiyor ? 'Güncelleniyor…' : 'Bayatları güncelle', (ev) => veriGuncelle(ev.currentTarget, null), 'btn-secondary btn-xs', d.calisiyor ? { disabled: true } : null)]);
  }
  async function guncellemeYukle() {
    if (!VERI_KAPLAR.some(([id]) => bul(id))) return;
    let d = null;
    try { const r = await veriApi().durum(); d = r.success ? r : null; } catch (e) { d = null; }
    veriDurumCiz(d);
    clearTimeout(veriYoklama);
    if (d && d.calisiyor) { veriSurdu = true; veriYoklama = setTimeout(guncellemeYukle, 4000); }
    else if (veriSurdu) {
      veriSurdu = false;
      const h = d ? (d.ozet || {}).hata || 0 : 0;
      bildir(`Veri güncellemesi bitti${h ? ` (${h} kaynakta hata)` : ''}.`, h ? 'uyari' : 'ok');
      katalogYukle();
    }
  }
  async function veriGuncelle(d, kaynak) {
    AG.dom.mesgul(d, 'Başlatılıyor…');
    try {
      const r = await veriApi().guncelle(kaynak || null, !!kaynak);
      if (!r.success) throw new Error(r.error);
      veriSurdu = true;
      bildir(r.kuyrukta ? 'Güncelleme sürüyor; istek sıraya eklendi.' : `Veri güncellemesi başlatıldı${kaynak ? ` (${kaynak})` : ' (bayat olanlar)'}.`, 'bilgi');
    } catch (e) { bildir('Veri güncellenemedi: ' + e.message, 'hata'); }
    finally { AG.dom.hazir(d); guncellemeYukle(); }
  }

  // ── Dikkat listesi kaynakları (60.7, PLAN-DIKKAT-LISTESI §5 Ş4; lib/tarama/kaynakSagligi.js, GET /api/tarama/kaynak-sagligi) ──
  // Kaynak başına: son envanter sınaması (HTTP, ms), son 30 g başarı (günlük envanter + coin tarama çağrıları), kota kullanımı,
  // "bu kaynak bozulursa hangi bayrak üretilemez". Salt okunur; envanter `node scripts/dikkat-f0-envanter.js` ile koşar.
  const DK_ROZET = { ok: ['çalışıyor', 'iyi'], kismi: ['kısmi', 'uyari'], hata: ['çalışmıyor', 'tehlike'], anahtar_gerekli: ['anahtar gerekli', 'bilgi'], atlandi: ['atlandı', null] };
  const oranMetni = (x) => (sayiMi(x) ? `%${Math.round(x * 100)}` : '—');
  function dkBasari(x) {
    const p = [];
    if (x.envanter && x.envanter.gun) p.push(`envanter ${x.envanter.basarili}/${x.envanter.gun} gün`);
    if (x.tarama && x.tarama.cagri) p.push(`tarama ${oranMetni(x.tarama.oran)} (${x.tarama.yanit}/${x.tarama.cagri} çağrı)`);
    return p.length ? p.join(' · ') : 'kayıt yok';
  }
  function dkKota(x) {
    const k = x.kota || {};
    const kalan = Object.entries(k.baslik || {}).filter(([a]) => /remaining/i.test(a)).map(([a, v]) => `${a.replace(/^x-/, '')} ${v}`);
    return [
      el('div', { text: k.metin || '—' }),
      sayiMi(k.gunlukKullanim) && k.gunlukKullanim > 0 ? el('div', { class: 'pf-kucuk', text: `günde ~${virgul(k.gunlukKullanim)} çağrı${sayiMi(k.oran) ? ` · limit kullanımı ${k.oran < 0.01 ? '< %1' : oranMetni(k.oran)}` : ''}` }) : null,
      kalan.length ? el('div', { class: 'pf-kucuk', text: `son yanıt: ${kalan.join(' · ')}` }) : null
    ];
  }
  function dkBozulma(x) {
    const b = x.bozulma || { uretilemez: [], yedekleSurer: [] };
    const ad = (y) => `${y.ad}${y.ag !== 'hepsi' ? ` (${y.ag})` : ''}${y.durum === 'planli' ? ' · planlı' : ''}`;
    const tekil = (a) => [...new Set(a.map(ad))];
    return [
      el('div', { class: b.uretilemez.length ? 'pf-uyari-metin' : null, text: b.uretilemez.length ? tekil(b.uretilemez).join(' · ') : '—' }),
      b.yedekleSurer.length ? el('div', { class: 'pf-kucuk', text: `yedekle sürer: ${tekil(b.yedekleSurer).join(' · ')}` }) : null
    ];
  }
  /** Sade "bozulursa ne kaybolur": teknik parantezler (deadFrom / rugged …) ve planlı kalemler ayrıntıda kalır. */
  function dkKaybolur(x) {
    const b = x.bozulma || { uretilemez: [] };
    const sade = [...new Set((b.uretilemez || []).filter(y => y.durum !== 'planli').map(y => String(y.ad || '').replace(/\s*\([^)]*\)/g, '').trim()).filter(Boolean))];
    return sade.length ? sade.join(' · ') : 'yedek var — kayıp yok';
  }
  /**
   * 63.2 (kullanıcıyla taslak): coin tarama kaynaklarında iç adlar sadeleşir — BAĞLAM → piyasa havası, EVREN keşfi → yeni coin
   * bulma, KAÇIN → uzak dur kontrolü, İZLE temel → temel değer göstergeleri, ÖLÜ protokol izi → batmış proje kaydı,
   * D6/D9/F4 → araştırma testi, CEX/DEX → merkezi / merkeziyetsiz borsa. Saf.
   */
  function dkSade(t) {
    return String(t || '')
      .replace(/BAĞLAM çapraz kontrol/g, 'piyasa havası (çapraz kontrol)').replace(/BAĞLAM şeridi/g, 'piyasa havası').replace(/BAĞLAM/g, 'piyasa havası')
      .replace(/EVREN keşfi/g, 'yeni coin bulma').replace(/\(evren\)/g, '(coin listesi)')
      .replace(/KAÇIN güvenlik kapıları/g, 'uzak dur kontrolü').replace(/KAÇIN unlock kapısı/g, 'uzak dur kontrolü: büyük kilit açılımı').replace(/KAÇIN/g, 'uzak dur')
      .replace(/İZLE temel ailesi/g, 'temel değer göstergeleri').replace(/ÖLÜ protokol izi/g, 'batmış proje kaydı')
      .replace(/;?\s*D6 geriye dönük testin girdisi/g, '; araştırma testi verisi').replace(/\+ D9 A testi/g, '(araştırma testi)').replace(/^F4 /g, 'araştırma: ')
      .replace(/ölü repo kapısı/g, 'terk edilmiş proje kontrolü').replace(/CEX erişimi/g, 'merkezi borsa erişimi').replace(/DEX kanadı/g, 'merkeziyetsiz borsalar')
      .replace(/\s*—\s*H2 RED, yalnız bilgi/g, ' — yalnız bilgi');
  }
  /** Sade "çalışıyor mu": rozet + son N gün başarı tek cümle. */
  function dkCalisiyor(x, gun) {
    const [metin, tur] = x.son ? (DK_ROZET[x.son.durum] || [x.son.durum, null]) : ['henüz sınanmadı', null];
    const oran = x.tarama && x.tarama.cagri ? `son ${gun} günde isteklerin ${oranMetni(x.tarama.oran)} kadarı yanıtlandı`
      : x.envanter && x.envanter.gun ? `son ${gun} günde ${x.envanter.basarili}/${x.envanter.gun} gün çalıştı` : null;
    return [el('span', { class: `pf-rozet${tur ? ' pf-rozet-' + tur : ''}`, text: metin }), oran ? el('div', { class: 'pf-kucuk', text: oran }) : null];
  }
  /** Kısaltmaların sözlük "?" açıklamaları (tanımı olmayan atlanır). */
  function dkTerimler() {
    const T = [['CEX', 'cex'], ['DEX', 'dex'], ['EVM', 'evm'], ['RPC', 'rpc'], ['kota', 'kota'], ['ToS', 'tos'], ['envanter', 'envanter']];
    const y = (AG.sozluk && AG.sozluk.yardim) ? T.map(([ad, k]) => { const d = AG.sozluk.yardim(k); return d ? el('span', { class: 'row-plain gap-1' }, [el('span', { text: ad }), d]) : null; }).filter(Boolean) : [];
    return y.length ? el('div', { class: 'row row-wrap gap-3 hint hint-sm mb-2' }, [el('span', { text: 'Terimler:' }), ...y]) : null;
  }
  function dikkatKaynakCiz(k, d) {
    if (!k) return;
    if (!d) { doldur(k, [el('span', { text: 'Kaynak sağlığı okunamadı.' }), dugme('Yeniden dene', () => dikkatKaynakYukle(), 'btn-secondary btn-xs')]); return; }
    const say = {};
    for (const x of d.satirlar || []) if (x.son) say[x.son.durum] = (say[x.son.durum] || 0) + 1;
    const ozet = [['ok', 'çalışıyor'], ['kismi', 'kısmi'], ['hata', 'çalışmıyor'], ['anahtar_gerekli', 'anahtar gerekli']].filter(([a]) => say[a]).map(([a, t]) => `${say[a]} ${t}`).join(' · ');
    // B-32 (61.1): varsayılan SADE üç sütun; HTTP / ms / kota başlıkları / anahtar / lisans "Teknik ayrıntı" katında.
    const sadeSatirlar = (d.satirlar || []).map(x => el('tr', null, [
      el('td', { class: 'pf-sola' }, [el('strong', { text: x.kisaAd || x.ad }), x.rol ? el('div', { class: 'pf-kucuk', text: dkSade(x.rol) }) : null]),
      el('td', { class: 'pf-sola' }, dkCalisiyor(x, d.gun)),
      el('td', { class: `pf-sola${dkKaybolur(x) !== 'yedek var — kayıp yok' ? ' pf-uyari-metin' : ' tone-muted'}`, text: dkSade(dkKaybolur(x)) })
    ]));
    const satirlar = (d.satirlar || []).map(x => {
      const [metin, tur] = x.son ? (DK_ROZET[x.son.durum] || [x.son.durum, null]) : ['envanter yok', null];
      return el('tr', { title: x.tos ? `Kullanım koşulları / lisans: ${x.tos}` : null }, [
        el('td', { class: 'pf-sola' }, [el('strong', { text: x.kisaAd || x.ad }), el('div', { class: 'pf-kucuk', text: x.rol || '' }),
          el('div', { class: 'pf-kucuk', text: `Anahtar: ${x.anahtar || '—'}` })]),
        el('td', { class: 'pf-sola' }, [el('span', { class: `pf-rozet${tur ? ' pf-rozet-' + tur : ''}`, text: metin, title: (x.son && x.son.hata) || null }),
          x.son ? el('div', { class: 'pf-kucuk', text: `HTTP ${(x.son.http || []).join('/') || '—'}${sayiMi(x.son.ms) ? ` · ${x.son.ms} ms` : ''}` }) : null,
          el('div', { class: 'pf-kucuk', text: `Son ${d.gun} g: ${dkBasari(x)}` })]),
        el('td', { class: 'pf-sola' }, dkKota(x)),
        el('td', { class: 'pf-sola' }, dkBozulma(x))
      ]);
    });
    doldur(k, [
      el('p', { class: 'hint hint-sm mb-2', text: `${ozet || 'Kaynaklar henüz sınanmadı'}${d.sonEnvanter ? ` · son sınama ${kisaZaman(d.sonEnvanter)}` : ''} · son ${d.gun} günde ${d.envanterGunu} sınama günü, ${d.taramaSayisi} coin taraması` }),
      dkTerimler(),
        tablo(['Kaynak', 'Çalışıyor mu', 'Bozulursa ne kaybolur'], sadeSatirlar, 'pf-veri-tablo'),
      el('details', { class: 'pf-veri-detay mt-3', id: 'veriDikkatTeknik' }, [
        el('summary', { class: 'clickable' }, [el('strong', { text: 'Teknik ayrıntı' }), el('span', { text: ' — HTTP yanıtı, süre, kota, anahtar, yedek kaynak' })]),
        el('div', { class: 'mt-2' }, [tablo(['Kaynak', `Son sınama · ${d.gun} g başarı`, 'Kota', 'Bozulursa üretilemez'], satirlar, 'pf-veri-tablo')]),
        el('p', { class: 'hint hint-sm mt-2 mb-0', title: 'node scripts/dikkat-f0-envanter.js (data/dikkat/)', text: 'Sınama her kaynağa tek istek atar. "Anahtar gerekli" beklenen durumdur, başarısızlık sayılmaz. Tokenomist sayfaları otomatik erişimi yasakladığı için unlock verisi elle girilir. Satırın üzerine gelince kullanım koşulları / lisans notu görünür.' })
      ])
    ]);
  }
  async function dikkatKaynakYukle() {
    const k = bul('veriDikkat');
    if (!k) return;
    let d = null;
    try { const r = await AG.api.tarama.kaynakSagligi(); d = r.success ? r : null; } catch (e) { d = null; }
    dikkatKaynakCiz(k, d);
  }

  // ═══ 1. VARLIK KATALOĞU ═════════════════════════════════════════════════
  function katalogBolumu() {
    const yenile = () => { clearTimeout(katalogZaman); katalogZaman = setTimeout(katalogYukle, 300); };
    return el('div', { class: 'glass-panel panel-pad' }, [
      baslik('Varlık kataloğu'),
      el('div', { class: 'pf-form-izgara mb-3' }, [
        alan('Ara (ad, kod, kimlik)', girdi({ id: 'pfKatArama', type: 'search', class: 'form-control control-sm', placeholder: 'ör. QQQ, altın, TI1', oninput: yenile })),
        alan('Sınıf', secici({ id: 'pfKatSinif', class: 'form-control control-sm', onchange: katalogYukle }, [['', 'Tümü'], ...Object.entries(SINIF_AD)], '')),
        alan('Hesap', secici({ id: 'pfKatHesap', class: 'form-control control-sm', onchange: katalogYukle }, [['', 'Tümü'], ...Object.entries(HESAP_AD)], '')),
        alan('Veri', secici({ id: 'pfKatDurum', class: 'form-control control-sm', onchange: katalogYukle }, [['', 'Tümü'], ['hazir', 'Hazır'], ['indirilebilir', 'İlk kullanımda kurulur']], '')),
        alan('Geçmiş', secici({ id: 'pfKatUzun', class: 'form-control control-sm', onchange: katalogYukle, title: 'Kriz dönemlerini içeren uzun seriler' },
          [['', 'Hepsi'], ['10', '≥ 10 yıl (2016 öncesi)'], ['18', '≥ 18 yıl (2008 dahil)']], ''))
      ]),
      el('div', { id: 'pfKatSayi', class: 'hint hint-sm mb-2', text: 'Katalog yükleniyor…' }),
      el('div', { id: 'pfKatListe', class: 'pf-kat-liste' }),
      // 67.5: serbest sembol — Yahoo'da bul (kod ya da şirket adı), fiyat geçmişini indir, katalogda yahoo:<KOD> olarak kurucuya ekle.
      el('div', { class: 'pf-dugmeler mt-3', id: 'pfSerbestKap' }, [
        girdi({ id: 'pfSerbestSembol', class: 'form-control control-sm w-auto', placeholder: 'ör. MSFT, THYAO, Tesla', 'aria-label': 'Katalogda olmayan sembol ya da şirket adı' }),
        dugme('Yahoo\'da bul ve ekle', (ev) => serbestSembolEkle(ev.currentTarget), 'btn-secondary btn-sm', { id: 'btnPfSerbestEkle', 'data-kilit': 'telefon', title: 'Yahoo\'dan sembolü bulur, fiyat geçmişini indirir ve kurucuya ekler (katalogda yahoo:KOD)' })
      ]),
      el('p', { class: 'hint hint-sm mt-1 mb-0', text: 'Katalogda yoksa: sembol Yahoo\'da aranır, fiyat geçmişi indirilir (uydurma veri yok — indirilemezse hata yazar). Kısa geçmiş rozeti simülasyon dönemini kısaltabileceğini söyler.' }),
      el('details', { class: 'mt-3' }, [
        el('summary', { class: 'clickable hint', text: 'Katalogda olmayan varlığı yalnız indir (Yahoo sembolü / TEFAS kodu)' }),
        el('div', { class: 'pf-dugmeler mt-2' }, [
          secici({ id: 'pfIndirKaynak', class: 'form-control control-sm w-auto', 'aria-label': 'Kaynak' }, [['yahoo', 'Yahoo'], ['tefas', 'TEFAS']], 'yahoo'),
          girdi({ id: 'pfIndirKod', class: 'form-control control-sm w-auto', placeholder: 'ör. VT, EWZ, TCD', 'aria-label': 'Sembol ya da fon kodu' }),
          dugme('İndir', (ev) => varlikIndir(ev.currentTarget), 'btn-secondary btn-sm')
        ]),
        el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Yahoo: düzeltilmiş kapanış (temettü dahil). USD dışı para birimlerinde kur serisi de gerekir (ör. HKD=X). TEFAS: en çok 5 yıl geri.' })
      ])
    ]);
  }

  function katalogSuzgec() {
    const v = (id) => { const e = bul(id); return e ? e.value : ''; };
    const s = { metin: v('pfKatArama').trim(), sinif: v('pfKatSinif'), hesap: v('pfKatHesap'), durum: v('pfKatDurum'), limit: 100 };
    const uzun = v('pfKatUzun');
    if (uzun) { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - Number(uzun)); s.enGecBas = gunStr(d.getTime()); }
    return s;
  }

  async function katalogYukle() {
    const liste = bul('pfKatListe');
    if (!liste) return;
    try {
      const r = await api().katalog(katalogSuzgec());
      if (!r.success) throw new Error(r.error);
      katalogCiz(r);
    } catch (e) {
      doldur(liste, [el('div', { class: 'trace-note trace-note-warn', text: 'Katalog okunamadı: ' + e.message })]);
    }
  }

  function katalogCiz(r) {
    const liste = bul('pfKatListe'), sayac = bul('pfKatSayi');
    if (!liste) return;
    const vs = r.varliklar || [];
    if (sayac) sayac.textContent = `${(r.toplam || 0).toLocaleString('tr-TR')} eşleşme${r.toplam > vs.length ? ` (ilk ${vs.length} gösteriliyor)` : ''} · katalogda ${r.sayilar ? r.sayilar.toplam.toLocaleString('tr-TR') : '—'} varlık`;
    if (!vs.length) { doldur(liste, [el('p', { class: 'hint', text: 'Eşleşen varlık yok.' })]); return; }
    const ekli = new Set(D.varliklar.map(v => v.kimlik));
    const satirlar = vs.map(v => {
      const yil = v.ilkTarih && v.sonTarih ? yilFarki(v.ilkTarih, v.sonTarih) : null;
      const var_ = ekli.has(v.kimlik);
      return el('tr', null, [
        el('td', null, [dugme(var_ ? '✓' : 'Ekle', (ev) => { varlikEkle(v); ev.currentTarget.disabled = true; }, 'btn-primary btn-xs', var_ ? { disabled: 'disabled', title: 'Kurucuda' } : { 'aria-label': `${v.kimlik} ekle` })]),
        el('td', { class: 'pf-sola', title: v.not || null }, [
          el('div', { class: 'fw-semibold', text: cvAd(v.ad) || v.kimlik }),
          el('div', { class: 'pf-kucuk', text: v.kimlik }),
          rozetler(v)
        ]),
        el('td', { class: 'pf-sola', title: v.altKategori || null }, [el('div', { text: SINIF_AD[v.sinif] || v.sinif }), el('div', { class: 'pf-kucuk', text: HESAP_AD[v.hesap] || v.hesap })]),
        el('td', null, [el('div', { text: v.ilkTarih ? `${v.ilkTarih.slice(0, 7)} →` : '—' }), el('div', { class: 'pf-kucuk', text: yil != null ? `${sy(yil, 1)} yıl` : '' })])
      ]);
    });
    doldur(liste, [tablo(['', 'Varlık', 'Sınıf · hesap', 'Veri'], satirlar)]);
  }

  function varlikEkle(v) {
    if (D.varliklar.some(x => x.kimlik === v.kimlik)) return;
    D.varliklar.push({ kimlik: v.kimlik, ad: v.ad || '', sinif: v.sinif || '', hesap: v.hesap || '', para: v.paraBirimi || '', agirlik: '', min: '', max: '' });
    taslakKaydet();
    kurucuCiz();
    bildir(`${v.ad || v.kimlik} eklendi${D.yontem === 'elle' ? ' — ağırlığını girin' : ''}.`, 'ok');
  }

  async function varlikIndir(d) {
    const kaynak = bul('pfIndirKaynak').value, kod = bul('pfIndirKod').value.trim();
    if (!kod) { bildir('Sembol ya da fon kodu girin.', 'uyari'); return; }
    AG.dom.mesgul(d, 'İndiriliyor…');
    try {
      const r = await api().indir(kaynak, kod);
      if (!r.success) throw new Error(r.error);
      const s = await isiIzle(r.is.id, 'Varlık indirme');
      bildir(`${s && s.kimlik ? s.kimlik : kod} indirildi${s && s.ilk ? ` (${s.ilk} → ${s.son})` : ''}.`, 'ok');
      const a = bul('pfKatArama'); if (a) a.value = kod;
      katalogYukle();
    } catch (e) { bildir('İndirilemedi: ' + e.message, 'hata'); }
    finally { AG.dom.hazir(d); }
  }

  /**
   * 67.5: katalog varlığını hazırla — katalogda varsa onu döndür; yoksa ve yahoo:<KOD> ise fiyat geçmişini indirir (iş) ve
   * katalogdan yeniden okur. İndirilemezse / indirildikten sonra katalogda yoksa AÇIK HATA atar (uydurma varlık yok).
   */
  async function varlikHazirla(kimlik) {
    const oku = async () => { const r = await api().katalog({ kimlik }); return r && r.success && r.varlik ? r.varlik : null; };
    let v = await oku();
    if (v) return v;
    const m = /^yahoo:(.+)$/.exec(String(kimlik || ''));
    if (!m) throw new Error(`${kimlik}: katalogda yok (yalnız Yahoo sembolü indirilebilir)`);
    const r = await api().indir('yahoo', m[1]);
    if (!r || !r.success) throw new Error(`${m[1]}: Yahoo'dan indirilemedi — ${(r && r.error) || 'yanıt yok'}`);
    await isiIzle(r.is.id, `Varlık indirme: ${m[1]}`);
    v = await oku();
    if (!v) throw new Error(`${m[1]}: indirildi ama katalogda görünmüyor`);
    return v;
  }

  /** 67.5: serbest sembol (kod ya da şirket adı) → Yahoo kodu (POST /api/portfoyum/sembol-bul) → indir → kurucuya ekle. */
  async function serbestSembolEkle(d) {
    const g = bul('pfSerbestSembol');
    const q = g ? String(g.value || '').trim() : '';
    if (!q) { bildir('Sembol ya da şirket adı yazın.', 'uyari'); return; }
    if (d) AG.dom.mesgul(d, 'Aranıyor…');
    try {
      let kod = null;
      const buyuk = q.toUpperCase();
      // Kod gibi yazıldıysa önce katalog (ağsız) — yoksa Yahoo araması
      if (/^[A-Z0-9.^=-]{1,24}$/.test(buyuk)) { const r = await api().katalog({ kimlik: 'yahoo:' + buyuk }); if (r && r.success && r.varlik) kod = buyuk; }
      if (!kod) {
        const P = AG.api.portfoyum;
        if (!P || !P.sembolBul) throw new Error('sembol arama kullanılamıyor');
        const r = await P.sembolBul(q);
        if (!r || r.success === false) throw new Error((r && r.error) || 'sembol bulunamadı');
        const a = (r.adaylar || []).find(x => x && x.kod);
        if (!a) throw new Error(`${q}: Yahoo'da bulunamadı`);
        kod = a.kod;
      }
      const v = await varlikHazirla('yahoo:' + kod);
      varlikEkle(v);
      if (g) g.value = '';
    } catch (e) { bildir('Eklenemedi: ' + e.message, 'hata', { sure: 12000 }); }
    finally { if (d) AG.dom.hazir(d); }
  }

  /**
   * 67.5 "Bu dağılımı geçmişte dene" (Portföy › Hedefim planlayıcısı, js/pages/paraEkle.js): hedef payları ELLE ağırlıklı
   * tanım olarak kurucuya yükler (eksik Yahoo varlıkları önce indirilir) ve simüle eder. Bir varlık hazırlanamazsa simülasyon
   * YAPILMAZ, hata yazılır. kalemler: [{ kimlik, agirlik (0–1), ad? }]
   */
  async function gecmisteDene(kalemler, kaynak) {
    const l = (kalemler || []).filter(k => k && k.kimlik && k.agirlik > 0);
    if (!l.length) { bildir('Denenecek dağılım yok (hedef payı olan varlık yok).', 'uyari'); return false; }
    const hatalar = [], varliklar = [];
    for (const k of l) {
      try { const v = await varlikHazirla(k.kimlik); varliklar.push({ kimlik: v.kimlik, ad: v.ad || k.ad || '', sinif: v.sinif || '', hesap: v.hesap || '', para: v.paraBirimi || '', agirlik: k.agirlik }); }
      catch (e) { hatalar.push(e.message); }
    }
    if (hatalar.length) { bildir(`Geçmişte denenemedi: ${hatalar.join(' · ')}`, 'hata', { sure: 15000 }); return false; }
    // Ağırlıklar %100'e (nakitte kalan pay dağıtılır) — yüzde 2 ondalık, son kalem farkı alır
    const top = varliklar.reduce((a, v) => a + v.agirlik, 0);
    let kalan = 100;
    varliklar.forEach((v, i) => { const p = i === varliklar.length - 1 ? +kalan.toFixed(2) : +(v.agirlik / top * 100).toFixed(2); kalan -= p; v.agirlik = p / 100; });
    await tanimYukle({ varliklar, yontem: 'elle' }, kaynak || 'Hedefim planı');
    await simuleEt(bul('pfSimuleDugme'));
    return true;
  }

  // ═══ 2. PORTFÖY KURUCU ══════════════════════════════════════════════════
  function kurucuBolumu() {
    return el('div', { class: 'glass-panel panel-pad' }, [
      baslik('Varlık portföyü kur (Laboratuvar — araştırma)'),
      neIcin('varlıklardan (fon, hisse, altın, bot) portföy kurup geçmişte denemek; ağırlık yöntemini ve dengelemeyi karşılaştırmak.', 'gerçek emir listesi — gerçek portföyünüz için Portföy › Bu ay kullanılır.'),
      el('div', { id: 'pfVarliklar' }),
      el('div', { id: 'pfToplam', class: 'mt-2 mb-3' }),
      baslik('Grup kısıtları'),
      el('div', { id: 'pfGruplar' }),
      baslik('Ayarlar'),
      el('div', { id: 'pfAyarlar' }),
      el('div', { class: 'pf-dugmeler mt-4' }, [
        el('button', { type: 'button', id: 'pfSimuleDugme', class: 'btn btn-primary', onclick: (ev) => simuleEt(ev.currentTarget) }, [el('span', { text: 'Simüle et' })]),
        dugme('Varsayılan örneğe dön', varsayilanaDon),
        girdi({ id: 'pfKayitAd', class: 'form-control control-sm w-auto', placeholder: 'Portföy adı', 'aria-label': 'Kaydedilecek portföy adı', maxlength: '80' }),
        dugme('Kaydet', (ev) => portfoyKaydet(ev.currentTarget))
      ]),
      el('p', { class: 'hint hint-sm mt-3 mb-0', text: 'Her "Simüle et" bir deneme sayılır. Ayarı sonuca bakarak defalarca değiştirmek, geçmişe uyan ama geleceği tutmayan bir portföy üretir — sonuç sayfasındaki düzeltilmiş Sharpe ve stres tablosuna bakın.' })
    ]);
  }

  function kurucuCiz() {
    varliklarCiz();
    gruplarCiz();
    ayarlarCiz();
    denetimCiz();
  }

  function varliklarCiz() {
    const k = bul('pfVarliklar');
    if (!k) return;
    if (!D.varliklar.length) { doldur(k, [el('p', { class: 'hint', text: 'Portföy boş. Soldaki katalogdan "Ekle" ile varlık seçin.' })]); return; }
    const elle = D.yontem === 'elle';
    const yuzdeGirdi = (v, alanAd, etiket) => girdi({
      type: 'number', min: '0', max: '100', step: '0.1', class: 'form-control control-sm pf-sayi-girdi', 'aria-label': `${v.kimlik} ${etiket}`,
      placeholder: alanAd === 'agirlik' ? (elle ? '%' : 'yöntem') : (alanAd === 'max' ? '100' : '0'),
      ...(alanAd === 'agirlik' && !elle ? { disabled: 'disabled', title: 'Ağırlığı seçilen yöntem hesaplar; elle girmek için yöntem: Elle ağırlık' } : {}),
      oninput: (ev) => { v[alanAd] = ev.target.value === '' ? '' : Number(ev.target.value); taslakKaydet(); denetimCiz(); }
    }, alanAd === 'agirlik' && !elle ? '' : v[alanAd]);
    const satirlar = D.varliklar.map((v, i) => el('tr', null, [
      el('td', { class: 'pf-sola' }, [el('div', { class: 'fw-semibold', text: cvAd(v.ad) || v.kimlik }), el('div', { class: 'pf-kucuk', text: v.kimlik })]),
      el('td', null, [secici({ class: 'form-control control-sm w-auto', 'aria-label': `${v.kimlik} hesap`, onchange: (ev) => { v.hesap = ev.target.value; taslakKaydet(); } },
        Object.entries(HESAP_AD), v.hesap || 'yok')]),
      el('td', null, [yuzdeGirdi(v, 'agirlik', 'ağırlık %')]),
      el('td', null, [yuzdeGirdi(v, 'min', 'min %')]),
      el('td', null, [yuzdeGirdi(v, 'max', 'max %')]),
      el('td', null, [dugme('×', () => { D.varliklar.splice(i, 1); taslakKaydet(); kurucuCiz(); katalogTekrarCiz(); }, 'btn-secondary btn-xs', { 'aria-label': `${v.kimlik} çıkar`, title: 'Portföyden çıkar' })])
    ]));
    doldur(k, [tablo(['Varlık', 'Hesap', 'Ağırlık %', 'Min %', 'Max %', ''], satirlar)]);
  }

  /** Katalog listesindeki "Eklendi" düğmeleri kurucuyla eşlensin (yeniden istek atmadan değil; son süzgeçle). */
  function katalogTekrarCiz() { if (acildi) katalogYukle(); }

  function denetimCiz() {
    const k = bul('pfToplam');
    if (!k) return;
    const d = agirlikDenetim(D);
    const elle = D.yontem === 'elle';
    const parcalar = [];
    if (elle) parcalar.push(el('span', { class: Math.abs(d.toplam - 100) <= 0.01 ? 'pf-toplam-iyi' : 'pf-toplam-kotu', text: `Toplam ağırlık ${yz(d.toplam / 100, 1)}` }));
    else parcalar.push(el('span', { class: 'hint mb-0', text: `Ağırlıkları "${YONTEM_AD[D.yontem]}" hesaplar; min/max ve grup kısıtları uygulanır.` }));
    if (elle && D.varliklar.length) {
      parcalar.push(dugme('Eşit dağıt', () => { const w = +(100 / D.varliklar.length).toFixed(4); D.varliklar.forEach(v => { v.agirlik = w; }); taslakKaydet(); kurucuCiz(); }, 'btn-secondary btn-xs'));
      parcalar.push(dugme('%100\'e ölçekle', () => {
        const s = D.varliklar.reduce((a, v) => a + (Number(v.agirlik) || 0), 0);
        if (!(s > 0)) { bildir('Önce ağırlık girin.', 'uyari'); return; }
        D.varliklar.forEach(v => { v.agirlik = +((Number(v.agirlik) || 0) * 100 / s).toFixed(4); }); taslakKaydet(); kurucuCiz();
      }, 'btn-secondary btn-xs'));
    }
    doldur(k, [
      el('div', { class: 'pf-dugmeler' }, parcalar),
      d.hatalar.length ? el('ul', { class: 'pf-uyari-liste mt-2' }, d.hatalar.map(h => el('li', { class: 'pf-uyari pf-uyari-kritik', text: h }))) : null,
      d.uyarilar.length ? el('ul', { class: 'pf-uyari-liste mt-2' }, d.uyarilar.map(h => el('li', { class: 'pf-uyari pf-uyari-uyari', text: h }))) : null
    ]);
    const s = bul('pfSimuleDugme');
    if (s && !s.__mesgul) s.disabled = !d.gecerli;
  }

  function grupMetni(g) {
    const p = [];
    if (g.para) p.push(`para ${[].concat(g.para).join('/')}`);
    if (g.sinif) p.push(`sınıf ${[].concat(g.sinif).map(s => SINIF_AD[s] || s).join(' + ')}`);
    if (g.hesap) p.push(`hesap ${[].concat(g.hesap).map(h => HESAP_AD[h] || h).join(' + ')}`);
    if (g.kimlikler) p.push([].concat(g.kimlikler).map(kisaAd).join(' + '));
    return p.join(' · ') || 'seçici yok';
  }

  function gruplarCiz() {
    const k = bul('pfGruplar');
    if (!k) return;
    const satirlar = D.gruplar.map((g, i) => el('tr', null, [
      hucre(g.ad, 'pf-sola fw-semibold'),
      hucre(grupMetni(g), 'pf-sola'),
      el('td', null, [girdi({ type: 'number', min: '0', max: '100', step: '0.5', class: 'form-control control-sm pf-sayi-girdi', placeholder: '—', 'aria-label': `${g.ad} en az %`,
        oninput: (ev) => { g.min = ev.target.value === '' ? '' : Number(ev.target.value); taslakKaydet(); denetimCiz(); } }, g.min)]),
      el('td', null, [girdi({ type: 'number', min: '0', max: '100', step: '0.5', class: 'form-control control-sm pf-sayi-girdi', placeholder: '—', 'aria-label': `${g.ad} en çok %`,
        oninput: (ev) => { g.max = ev.target.value === '' ? '' : Number(ev.target.value); taslakKaydet(); denetimCiz(); } }, g.max)]),
      el('td', null, [dugme('×', () => { D.gruplar.splice(i, 1); taslakKaydet(); gruplarCiz(); denetimCiz(); }, 'btn-secondary btn-xs', { 'aria-label': `${g.ad} grubunu sil` })])
    ]));
    const sablonlar = GRUP_SABLON.map(s => dugme('+ ' + s.etiket, () => {
      if (D.gruplar.some(g => g.ad === s.ad)) { bildir(`'${s.ad}' grubu zaten var.`, 'uyari'); return; }
      const { etiket, ...g } = s; D.gruplar.push({ ...g, max: g.max == null ? '' : g.max, min: g.min == null ? '' : g.min });
      taslakKaydet(); gruplarCiz(); denetimCiz();
    }, 'btn-secondary btn-xs'));
    const ozelAd = girdi({ class: 'form-control control-sm w-auto', placeholder: 'Grup adı', 'aria-label': 'Özel grup adı' });
    const ozelSinif = secici({ class: 'form-control control-sm w-auto', 'aria-label': 'Özel grup sınıfı' }, [['', 'sınıf: hepsi'], ...Object.entries(SINIF_AD)], '');
    const ozelPara = secici({ class: 'form-control control-sm w-auto', 'aria-label': 'Özel grup para birimi' }, [['', 'para: hepsi'], ['TRY', 'TL (TRY)'], ['USD', 'USD']], '');
    const ozelHesap = secici({ class: 'form-control control-sm w-auto', 'aria-label': 'Özel grup hesabı' }, [['', 'hesap: hepsi'], ...Object.entries(HESAP_AD)], '');
    const ozelMax = girdi({ type: 'number', min: '0', max: '100', class: 'form-control control-sm pf-sayi-girdi', placeholder: 'en çok %', 'aria-label': 'Özel grup en çok %' });
    const ozelEkle = dugme('Grup ekle', () => {
      const g = { ad: ozelAd.value.trim() || `grup ${D.gruplar.length + 1}`, max: ozelMax.value === '' ? '' : Number(ozelMax.value), min: '' };
      if (ozelSinif.value) g.sinif = [ozelSinif.value];
      if (ozelPara.value) g.para = ozelPara.value;
      if (ozelHesap.value) g.hesap = ozelHesap.value;
      if (!g.sinif && !g.para && !g.hesap) { bildir('Grup için sınıf, para ya da hesap seçin.', 'uyari'); return; }
      D.gruplar.push(g); taslakKaydet(); gruplarCiz(); denetimCiz();
    }, 'btn-secondary btn-xs');
    doldur(k, [
      D.gruplar.length ? tablo(['Grup', 'Kapsam', 'En az %', 'En çok %', ''], satirlar) : el('p', { class: 'hint hint-sm', text: 'Grup kısıtı yok. Örnek: TL varlıkların toplamı en çok %15.' }),
      el('div', { class: 'pf-dugmeler mt-2' }, sablonlar),
      el('div', { class: 'pf-dugmeler mt-2' }, [ozelAd, ozelSinif, ozelPara, ozelHesap, ozelMax, ozelEkle]),
      D.yontem === 'elle' && D.gruplar.length ? el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Elle yöntemde grup kısıtları uygulanmaz, yalnız ihlal uyarısı verilir.' }) : null
    ]);
  }

  function ayarlarCiz() {
    const k = bul('pfAyarlar');
    if (!k) return;
    const elle = D.yontem === 'elle';
    const yaz = (alanAd, sayi, yeniden) => (ev) => {
      D[alanAd] = sayi ? (ev.target.value === '' ? '' : Number(ev.target.value)) : ev.target.value;
      taslakKaydet();
      if (yeniden) kurucuCiz(); else denetimCiz();
    };
    const sayiAlan = (alanAd, etiket, ek, ipucu) => alan(etiket, girdi({ type: 'number', class: 'form-control control-sm', ...ek, oninput: yaz(alanAd, true) }, D[alanAd]), ipucu);
    const strateji = D.varliklar.some(v => v.sinif === 'strateji' || /^strateji:/.test(v.kimlik));
    doldur(k, [
      el('div', { class: 'pf-form-izgara' }, [
        alan('Ağırlık yöntemi', secici({ id: 'pfYontem', class: 'form-control control-sm', onchange: yaz('yontem', false, true) }, Object.entries(YONTEM_AD), D.yontem), null, YONTEM_TERIM[D.yontem] || null),
        alan('Kip', secici({ id: 'pfKip', class: 'form-control control-sm', onchange: yaz('kip', false, true), ...(elle ? { disabled: 'disabled' } : {}) },
          [['walk-forward', 'Görülmemiş veride (walk-forward)'], ['gecmis', 'Geçmişe bakarak (aynı veride seçildi) — iyimser']], elle ? 'gecmis' : D.kip),
        'Görülmemiş veride: her ay yalnız o güne kadarki veriyle ağırlık (gerçekçi). Geçmişe bakarak: tüm dönemin verisi (ileriye bakışlı, iyimser).', D.kip === 'gecmis' ? 'inSample' : 'walkForward'),
        !elle && D.kip === 'walk-forward' ? sayiAlan('pencereAy', 'Geriye bakış penceresi (ay)', { min: '6', max: '120', step: '1' }) : null,
        alan('Dengeleme', secici({ class: 'form-control control-sm', onchange: yaz('siklik') }, Object.entries(SIKLIK_AD), D.siklik)),
        sayiAlan('bant', 'Dengeleme bandı %', { min: '0', max: '100', step: '0.5' }, 'Dönem başı dışında bir kol hedeften bu kadar saparsa dengelenir.'),
        sayiAlan('maliyetIslem', 'İşlem maliyeti % (tek yön)', { min: '0', max: '5', step: '0.05' }),
        sayiAlan('maliyetHesap', 'Hesaplar arası transfer %', { min: '0', max: '5', step: '0.05' }, 'Para bir hesaptan diğerine geçerken (kur makası, havale) bir kez ödenir.'),
        alan('USD nakit getirisi', secici({ class: 'form-control control-sm', onchange: yaz('nakitGetirisi') }, [['yok', 'Yok (0)'], ['tbill', 'ABD hazine bonosu faizi (T-bill)']], D.nakitGetirisi), null, 'tbill'),
        alan('Ölçü birimi', secici({ class: 'form-control control-sm', onchange: yaz('birim') }, [['USD', 'USD'], ['TL', 'TL (enflasyon düşülmeden)'], ['TL-reel', 'TL reel (TÜFE enflasyonu düşülmüş)']], D.birim), null, 'tufe'),
        alan('Başlangıç', girdi({ type: 'date', class: 'form-control control-sm', oninput: yaz('bas') }, D.bas), 'Boş: verinin izin verdiği en erken gün'),
        alan('Bitiş', girdi({ type: 'date', class: 'form-control control-sm', oninput: yaz('bit') }, D.bit)),
        alan('Verisi geç başlayan varlık', secici({ class: 'form-control control-sm', onchange: yaz('eksikVeri') }, [['kirp', 'Hepsinin verisi olduğu günden başla'], ['sonradan-katil', 'Verisi başlayınca portföye kat']], D.eksikVeri),
          'Hepsinin verisi olduğu gün: dönem en geç başlayan varlıkla başlar (TEFAS → 2021-10). Verisi başlayınca: varlık verisi başlayınca portföye girer.', 'eksikVeri'),
        strateji ? alan('Strateji senaryosu', secici({ class: 'form-control control-sm', onchange: yaz('senaryo') }, Object.entries(SENARYO_AD), D.senaryo),
          'Bot stratejileri iyimser (aynı veride ayarlandı). Karar için "BTC al-tut" senaryosunda da kabul edilebilir olmalı.', 'hucumSenaryo') : null
      ]),
      kiyasSecici(),
      elle ? el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Elle ağırlıkta kip yoktur: ağırlıklar tüm dönem boyunca sabit. Bu ağırlıkları geçmiş sonuçlara bakarak seçtiyseniz sonuç da geçmişe bakarak elde edilmiş sayılır.' }) : null
    ]);
  }

  /** B-23: kıyas çoklu seçimi — D.kiyaslar (virgüllü kimlik dizesi) değişmeden kalır, yalnız arayüz ad gösterir. */
  function kiyasSecici() {
    const secili = () => String(D.kiyaslar || '').split(',').map(x => x.trim()).filter(Boolean);
    const bilinen = new Set(KIYAS_SECENEK.map(([k]) => k));
    const yaz = (liste) => { D.kiyaslar = liste.join(', '); taslakKaydet(); denetimCiz(); };
    const kutular = KIYAS_SECENEK.map(([k, ad]) => {
      const c = el('input', { type: 'checkbox', class: 'pf-kiyas-kutu', 'data-kiyas': k, onchange: (e) => { const l = secili().filter(x => x !== k); if (e.target.checked) l.push(k); yaz(l); } });
      c.checked = secili().includes(k);
      return el('label', { class: 'pf-kiyas-secenek', title: k }, [c, el('span', { text: ' ' + ad })]);
    });
    const diger = girdi({ class: 'form-control control-sm', id: 'pfKiyasDiger', placeholder: 'katalog kimliği, ör. yahoo:IEF', 'aria-label': 'Diğer kıyaslar (katalog kimliği, virgülle)',
      oninput: (e) => yaz([...secili().filter(x => bilinen.has(x)), ...String(e.target.value || '').split(',').map(x => x.trim()).filter(Boolean)]) }, secili().filter(x => !bilinen.has(x)).join(', '));
    return el('fieldset', { id: 'pfKiyaslar', class: 'pf-kiyaslar mt-2' }, [
      el('legend', { class: 'pf-alan-etiket' }, [el('span', { text: 'Kıyaslar (sonuç bunlarla karşılaştırılır)' }), AG.sozluk ? AG.sozluk.yardim('kiyas') : null]),
      el('div', { class: 'pf-kiyas-liste' }, kutular),
      alan('Diğer (gelişmiş: katalog kimliği, virgülle)', diger)
    ]);
  }

  function varsayilanaDon() {
    D = varsayilanTaslak(); taslakKaydet(); kurucuCiz(); katalogTekrarCiz();
  }

  async function simuleEt(d) {
    const den = agirlikDenetim(D);
    if (!den.gecerli) { bildir(den.hatalar.join(' · '), 'uyari'); return; }
    const tanim = tanimKur(D);
    if (d) { d.__mesgul = true; AG.dom.mesgul(d, 'Simüle ediliyor…'); }
    try {
      const r = await api().simule(tanim, OTURUM);
      if (!r.success) throw new Error(r.error);
      const s = await isiIzle(r.is.id, 'Simülasyon');
      sonSonuc = s;
      if (s && s.deneme && s.deneme.oturumSayi != null) denemeCiz(s.deneme.oturumSayi);
      sonucCiz(s);
      altSekme('sonuc');
    } catch (e) { bildir('Simülasyon başarısız: ' + e.message, 'hata'); }
    finally { if (d) { d.__mesgul = false; AG.dom.hazir(d); denetimCiz(); } }
  }

  async function portfoyKaydet(d) {
    const adK = bul('pfKayitAd');
    const ad = adK ? adK.value.trim() : '';
    if (!ad) { bildir('Portföye bir ad verin.', 'uyari'); return; }
    const den = agirlikDenetim(D);
    if (!den.gecerli) { bildir(den.hatalar.join(' · '), 'uyari'); return; }
    AG.dom.mesgul(d, 'Kaydediliyor…');
    try {
      const r = await api().portfoyKaydet(ad, tanimKur(D), '');
      if (!r.success) throw new Error(r.error);
      bildir(`"${ad}" kaydedildi.`, 'ok');
      portfoylerYukle();
    } catch (e) { bildir('Kaydedilemedi: ' + e.message, 'hata'); }
    finally { AG.dom.hazir(d); }
  }

  /** Dışarıdan gelen tanımı (kayıtlı portföy, karar, varyasyon) kurucuya yükler ve adları katalogdan tamamlar. */
  async function tanimYukle(t, kaynak) {
    D = tanimdanDurum(t);
    taslakKaydet();
    kurucuCiz();
    altSekme('kurucu');
    if (kaynak) bildir(`${kaynak} kurucuya yüklendi.`, 'ok');
    await adlariTamamla();
  }
  async function adlariTamamla() {
    let degisti = false;
    for (const v of D.varliklar) {
      if (v.ad && v.sinif && v.para) continue;
      try {
        const r = await api().katalog({ kimlik: v.kimlik });
        if (r.success && r.varlik) { v.ad = v.ad || r.varlik.ad; v.sinif = v.sinif || r.varlik.sinif; v.para = v.para || r.varlik.paraBirimi; v.hesap = v.hesap || r.varlik.hesap; degisti = true; }
      } catch (e) { /* ad kimlik olarak kalır */ }
    }
    if (degisti) { taslakKaydet(); kurucuCiz(); }
  }

  // ═══ 3. SONUÇ ═══════════════════════════════════════════════════════════
  function kipBandi(s) {
    const t = s.tanim || {}, o = s.olculer || {};
    const elle = t.yontem === 'elle';
    const wf = !elle && t.kip === 'walk-forward';
    const sinif = elle ? 'pf-kip-elle' : wf ? 'pf-kip-oos' : 'pf-kip-is';
    const baslikMetni = elle ? 'ELLE AĞIRLIK — sabit ağırlıklar'
      : wf ? 'GÖRÜLMEMİŞ VERİDE (walk-forward) — örneklem dışı' : 'GEÇMİŞE BAKARAK (in-sample) — İYİMSER';
    const aciklama = elle ? 'Ağırlıklar dönem boyunca sabit. Bu ağırlıkları bu dönemin sonucuna bakarak seçtiyseniz sonuç geçmişe bakarak elde edilmiş sayılır.'
      : wf ? `Her ay başı ağırlık yalnız o güne kadarki ${t.pencereAy || 36} ayın verisiyle hesaplandı: gerçekte uygulanabilirdi.`
        : 'Ağırlıklar TÜM dönemin verisinden hesaplandı: o gün bilinemeyecek bilgi kullanıldı, sonuç gerçekte elde edilemezdi.';
    const den = s.deneme || {};
    return el('div', { class: `pf-kip-bandi ${sinif}` }, [
      el('div', null, [el('div', { class: 'pf-kip-baslik', text: baslikMetni }), el('div', { class: 'hint hint-sm mb-0', text: aciklama })]),
      el('div', { class: 'pf-kucuk', text: [
        o.bas ? `${o.bas} → ${o.bit} (${sy(o.yilSayisi, 1)} yıl)` : null,
        `${YONTEM_AD[t.yontem] || t.yontem} · ${t.birim || 'USD'} · ${SIKLIK_AD[(t.dengeleme || {}).siklik] || ''}`,
        den.oturumSayi != null ? `oturumdaki ${den.oturumSayi}. deneme` : null
      ].filter(Boolean).join(' · ') })
    ]);
  }

  const SEVIYE_AD = { kritik: 'KRİTİK', uyari: 'UYARI', bilgi: 'BİLGİ' };
  function uyariListesi(uyarilar) {
    if (!uyarilar || !uyarilar.length) return null;
    return el('ul', { class: 'pf-uyari-liste' }, uyarilar.map(u => el('li', { class: `pf-uyari pf-uyari-${u.seviye}` }, [
      el('strong', { text: (SEVIYE_AD[u.seviye] || u.seviye) + ':' }), el('span', { text: ' ' + u.metin })
    ])));
  }

  /** "Geçmişe bakarak" ile "görülmemiş veride" aynı dönemde yan yana. */
  function karsiKipKutusu(s) {
    const k = s.karsiKip;
    const t = s.tanim || {};
    if (t.yontem === 'elle') return null;
    if (!k) return null;
    if (k.hata) return el('div', { class: 'trace-note trace-note-warn mb-3', text: `Karşı kip (${t.kip === 'gecmis' ? 'walk-forward' : 'in-sample'}) koşulamadı: ${k.hata}` });
    const a = k.ayniDonem || {};
    const oos = t.kip === 'walk-forward' ? a.bu : a.diger, ins = t.kip === 'walk-forward' ? a.diger : a.bu;
    if (!oos || !ins) return null;
    const kart = (sinif, bas, m) => el('div', { class: `pf-kiyas-kutu ${sinif}` }, [
      el('div', { class: 'fw-semibold mb-2', text: bas }),
      el('div', { class: 'stats-grid stats-grid-dense' }, [
        kutu('Yıllık (CAGR)', yz(m.cagr), null, ton(m.cagr)), kutu('En büyük düşüş', yz(m.maxDD), m.maxDDTarih), kutu('Sharpe', sy(m.sharpe))
      ])
    ]);
    const fark = ins.cagr - oos.cagr;
    return el('div', { class: 'mb-3' }, [
      baslik(`Aynı dönemde iki kip (${a.bas} →)`),
      el('div', { class: 'pf-kiyas-ikili' }, [
        kart('pf-kip-oos', 'Görülmemiş veride (walk-forward) — gerçekçi', oos),
        kart('pf-kip-is', 'Geçmişe bakarak (in-sample) — iyimser', ins)
      ]),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: fark > 0.0005
        ? `Geçmişe bakmanın görünür katkısı: CAGR +${sy(fark * 100, 1)} puan, Sharpe ${(ins.sharpe - oos.sharpe > 0 ? '+' : '') + sy(ins.sharpe - oos.sharpe)}. Bu fark gerçekte elde edilemez; karar walk-forward kutusuna göre verilmeli.`
        : `Bu dönemde geçmişe bakmak avantaj sağlamadı (CAGR farkı ${sy(fark * 100, 1)} puan): yöntemin ağırlıkları dönemden döneme tutarlı. Karar yine walk-forward kutusuna göre verilmeli.` })
    ]);
  }

  function olculerKarti(s) {
    const o = s.olculer;
    if (!o) return el('div', { class: 'trace-note trace-note-warn', text: 'Ölçü yok: dönem çok kısa.' });
    const dv = s.devir || {}, b = s.bootstrap;
    const den = s.deneme || {};
    return el('div', null, [
      el('div', { class: 'stats-grid stats-grid-dense' }, [
        kutu('Yıllık getiri (CAGR)', yz(o.cagr), b ? `%5–%95: ${yz(b.cagr[0])} … ${yz(b.cagr[2])}` : null, ton(o.cagr)),
        kutu('En büyük düşüş', yz(o.maxDD), o.maxDDTarih ? `${o.maxDDTarih}${b ? ` · bootstrap %95: ${yz(b.maxDD[2])}` : ''}` : null, 'tone-danger'),
        kutu('Sharpe', sy(o.sharpe), sayiMi(o.sharpeTbill) ? `T-bill'e göre ${sy(o.sharpeTbill)}` : 'risksiz faiz 0'),
        kutu('Sortino', sy(o.sortino)),
        kutu('Calmar (CAGR / düşüş)', sy(o.calmar)),
        kutu('Oynaklık (yıllık)', yz(o.vol)),
        kutu('Kötü ay ortalaması (CVaR %95)', yz(o.cvarAy), 'en kötü %5 ayın ortalaması', ton(o.cvarAy)),
        kutu('En kötü yıl', o.enKotuYil ? yz(o.enKotuYil.getiri) : '—', o.enKotuYil ? `${o.enKotuYil.yil}${o.enKotuYil.kismi ? ' (kısmi)' : ''}` : null, ton(o.enKotuYil && o.enKotuYil.getiri)),
        kutu('En kötü ay', o.enKotuAy ? yz(o.enKotuAy.getiri) : '—', o.enKotuAy ? o.enKotuAy.ay : null, ton(o.enKotuAy && o.enKotuAy.getiri)),
        kutu('Devir / maliyet (yıllık)', `${yz(dv.yillik, 0)} / ${yz(dv.maliyetYillik, 2)}`, `${dv.islemAy || 0}/${dv.ay || 0} ayda işlem`),
        kutu('Düzeltilmiş Sharpe (DSR)', sayiMi(den.dsr) ? sy(den.dsr) : '—',
          sayiMi(den.dsr) ? `${den.denemeSayisi} deneme hesaba katıldı${den.dsr < 0.95 ? ' · ŞANS OLABİLİR (< 0,95)' : ''}` : 'en az 2 deneme gerekir',
          sayiMi(den.dsr) ? (den.dsr < 0.95 ? 'tone-warning' : 'tone-success') : '')
      ]),
      b ? el('p', { class: 'hint hint-sm mt-2 mb-0', text: `Aralıklar: ${b.not}` }) : null,
      el('p', { class: 'hint hint-sm mt-1 mb-0', text: 'DSR: sonucun Sharpe\'ı, bu oturumdaki tüm denemelerin sayısı ve dağılımına göre düzeltilir; sıfırı (al-tut değil) şanstan öte yenme olasılığıdır. 0,95 altı "şans eseri olabilir" demektir.' })
    ]);
  }

  function senaryoTablosu(s) {
    if (!s.senaryolar) return null;
    const satirlar = Object.entries(s.senaryolar).map(([k, m]) => el('tr', { class: k === (s.tanim || {}).stratejiSenaryosu ? 'pf-mevcut' : null }, [
      hucre(SENARYO_AD[k] || k, 'pf-sola'),
      hucre(m.hata ? m.hata : yz(m.cagr), m.hata ? 'tone-danger pf-sola' : ton(m.cagr)),
      hucre(m.hata ? '' : yz(m.maxDD)), hucre(m.hata ? '' : sy(m.sharpe))
    ]));
    return el('div', { class: 'mt-4' }, [
      baslik('Bot stratejisi senaryoları'),
      tablo(['Senaryo', 'CAGR', 'En büyük düşüş', 'Sharpe'], satirlar),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Bot serileri yüzlerce denemeden seçildi (örneklem içi). Portföy kararı iii (BTC al-tut) senaryosunda da kabul edilebilir olmalı.' })
    ]);
  }

  /** Stres tablosu: tarihsel dönemler × (portföy, kıyaslar, bugünkü ağırlık sabit). */
  function stresBolumu(s) {
    const st = s.stres || {};
    const don = st.donemler || [];
    const sabit = st.sabitAgirlik;
    const kiyasAdlari = (s.kiyaslar || []).filter(k => !k.hata).map(k => k.ad);
    const sabitDon = sabit && !sabit.hata ? Object.fromEntries((sabit.donemler || []).map(d => [d.kod, d])) : {};
    const getiriHucre = (x) => (x ? hucre(`${yz(x.getiri)}`, ton(x.getiri), `dönem içi en büyük düşüş ${yz(x.maxDD)}`) : hucre('kapsanmıyor', 'tone-muted'));
    const satirlar = don.map(d => el('tr', null, [
      el('td', { class: 'pf-sola' }, [el('div', { text: d.ad }), el('div', { class: 'pf-kucuk', text: `${d.bas} → ${d.bit}` })]),
      getiriHucre(d.portfoy),
      hucre(d.portfoy ? yz(d.portfoy.maxDD) : '—', d.portfoy ? 'tone-danger' : 'tone-muted'),
      ...kiyasAdlari.map(a => getiriHucre(d.kiyas && d.kiyas[a])),
      getiriHucre(sabitDon[d.kod] && sabitDon[d.kod].getiri != null ? sabitDon[d.kod] : null)
    ]));
    const parcalar = [
      baslik('Stres testi — kriz dönemlerinde ne olurdu?'),
      tablo(['Dönem', 'Portföy', 'Portföy düşüş', ...kiyasAdlari, 'Bugünkü ağırlık sabit'], satirlar),
      el('p', { class: 'hint hint-sm mt-2', text: '"kapsanmıyor": değerlendirme dönemi o krizi içermiyor — sonuç o riski GÖSTERMİYOR. Son sütun bugünkü ağırlıkların geçmişe sabit uygulanmasıdır (kısa geçmişli varlıklar için vekil seriyle).' })
    ];
    if (sabit && sabit.hata) parcalar.push(el('div', { class: 'trace-note trace-note-warn', text: `Sabit-ağırlık stresi koşulamadı: ${sabit.hata}` }));
    else if (sabit) {
      const vek = Object.entries(sabit.vekiller || {}).map(([k, v]) => `${kisaAd(k)} → ${kisaAd(v.vekil)}${v.tumDonem ? ' (tüm dönem)' : v.bitis ? ` (${v.bitis}'e kadar)` : ''}`);
      parcalar.push(el('div', { class: 'sunken-panel panel-pad' }, [
        el('div', { class: 'fw-semibold mb-2', text: `Bugünkü ağırlıklar ${sabit.bas}'den sabit uygulansaydı` }),
        el('div', { class: 'stats-grid stats-grid-dense' }, [
          kutu('CAGR', yz(sabit.cagr), null, ton(sabit.cagr)),
          kutu('En büyük düşüş', yz(sabit.maxDD), sabit.maxDDTarih, 'tone-danger'),
          kutu('Sharpe', sy(sabit.sharpe)),
          kutu('En kötü yıl', sabit.enKotuYil ? yz(sabit.enKotuYil.getiri) : '—', sabit.enKotuYil ? String(sabit.enKotuYil.yil) : null, ton(sabit.enKotuYil && sabit.enKotuYil.getiri))
        ]),
        el('p', { class: 'hint hint-sm mt-2 mb-0', text: `${sabit.aciklama}.${sabit.sinirlayan ? ` En geç başlayan seri: ${kisaAd(sabit.sinirlayan)}.` : ''}${vek.length ? ` Vekil: ${vek.join(' · ')}.` : ''}` })
      ]));
    }
    return el('div', { class: 'mt-4' }, parcalar);
  }

  /** Yıl × ay getirileri; ısı haritası kova sınıfları (pf-isi-p1..p3 / n1..n3). */
  function isiSinifi(x, olcek) {
    if (!sayiMi(x)) return 'pf-isi-bos';
    const a = Math.abs(x) / olcek;
    const kova = a < 0.34 ? 1 : a < 0.67 ? 2 : 3;
    return x >= 0 ? `pf-isi-p${kova}` : `pf-isi-n${kova}`;
  }
  function yillikEgridenGetiri(egri) {
    const o = {};
    let onceki = egri.length ? egri[0][1] : null, yil = null, son = null;
    for (const [t, v] of egri) {
      const y = new Date(t).getUTCFullYear();
      if (yil !== null && y !== yil) { o[yil] = son / onceki - 1; onceki = son; }
      yil = y; son = v;
    }
    if (yil !== null && onceki) o[yil] = son / onceki - 1;
    return o;
  }
  function getiriTablosu(s) {
    const aylik = s.aylik || [];
    if (!aylik.length) return null;
    const yillar = new Map();
    for (const a of aylik) { const [y, m] = a.ay.split('-'); if (!yillar.has(y)) yillar.set(y, {}); yillar.get(y)[+m] = a.getiri; }
    const yillik = Object.fromEntries((s.yillik || []).map(y => [String(y.yil), y]));
    const kiyaslar = (s.kiyaslar || []).filter(k => !k.hata && k.egri);
    const kiyasYil = kiyaslar.map(k => yillikEgridenGetiri(k.egri));
    const olcekAy = Math.max(0.02, ...aylik.map(a => Math.abs(a.getiri)).filter(Number.isFinite));
    const olcekYil = Math.max(0.05, ...(s.yillik || []).map(y => Math.abs(y.getiri)).filter(Number.isFinite));
    const satirlar = [...yillar.entries()].map(([y, aylar]) => {
      const yy = yillik[y];
      return el('tr', null, [
        hucre(y + (yy && yy.kismi ? '*' : ''), 'pf-sola'),
        ...Array.from({ length: 12 }, (_, i) => hucre(sayiMi(aylar[i + 1]) ? sy(aylar[i + 1] * 100, 1) : '', isiSinifi(aylar[i + 1], olcekAy))),
        hucre(yy ? yz(yy.getiri) : '—', `fw-semibold ${isiSinifi(yy && yy.getiri, olcekYil)}`),
        ...kiyasYil.map(k => hucre(sayiMi(k[y]) ? yz(k[y]) : '—', ton(k[y])))
      ]);
    });
    return el('div', { class: 'mt-4' }, [
      baslik('Aylık ve yıllık getiri'),
      tablo(['Yıl', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara', 'Yıl', ...kiyaslar.map(k => k.ad)], satirlar, 'pf-isi table-dense'),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Ay hücreleri yüzde puan. * kısmi yıl. Kıyas sütunları aynı dönemin al-tut (60/40: dengelemeli) getirisi.' })
    ]);
  }

  function agirlikTablosu(s) {
    const son = (s.sonHedef && s.sonHedef.w) || s.gecmisAgirlik || null;
    const rk = s.riskKatkisi || {};
    const satirlar = (s.varliklar || []).map(v => el('tr', null, [
      el('td', { class: 'pf-sola' }, [el('div', { text: cvAd(v.ad) || v.kimlik }), el('div', { class: 'pf-kucuk', text: `${v.kimlik}${v.seri && v.seri !== v.kimlik ? ` (seri: ${v.seri})` : ''}${v.senaryo ? ` · senaryo ${v.senaryo}` : ''}` })]),
      hucre(HESAP_AD[v.hesap] || v.hesap),
      hucre(son ? yz(son[v.kimlik] || 0) : '—'),
      hucre(yz((s.ortAgirlik || {})[v.kimlik] || 0)),
      hucre(sayiMi(rk[v.kimlik]) ? yz(rk[v.kimlik]) : '—'),
      hucre(v.baslangic || '—')
    ]));
    return el('div', { class: 'mt-4' }, [
      baslik(s.sonHedef ? `Ağırlıklar ve risk katkısı (son hedef: ${s.sonHedef.ay} ay başı)` : 'Ağırlıklar ve risk katkısı'),
      el('div', { class: 'canvas-box canvas-230 mb-3' }, [el('canvas', { id: 'pfGrafikRisk', role: 'img', 'aria-label': 'Varlık başına risk katkısı (çubuk grafik); değerler aşağıdaki tabloda' })]),
      tablo(['Varlık', 'Hesap', 'Son hedef', 'Ortalama', 'Risk katkısı', 'Veri başı'], satirlar, '', 'portfoy.dagilim'),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Risk katkısı: portföy oynaklığının ne kadarının o varlıktan geldiği (haftalık; toplam %100). Ağırlığı küçük ama risk katkısı büyük varlık, portföyü tek başına sallar.' })
    ]);
  }

  function korelasyonTablosu(s) {
    const k = s.korelasyon;
    if (!k || !k.kimlikler || k.kimlikler.length < 2) return null;
    const satirlar = k.kimlikler.map((a, i) => el('tr', null, [
      hucre(kisaAd(a), 'pf-sola'),
      ...k.matris[i].map((c, j) => hucre(c == null ? '—' : sy(c), i === j ? 'pf-isi-bos' : isiSinifi(c, 1), `${kisaAd(a)} ↔ ${kisaAd(k.kimlikler[j])}`))
    ]));
    return el('div', { class: 'mt-4' }, [
      baslik('Korelasyon (haftalık getiri)'),
      tablo(['', ...k.kimlikler.map(kisaAd)], satirlar, 'pf-isi table-dense'),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: `${k.hafta} hafta. 1'e yakın: birlikte hareket eder (çeşitlendirme yok); 0 ve altı: biri düşerken öbürü tutabilir. Krizlerde korelasyonlar genelde YÜKSELİR.` })
    ]);
  }

  function notlarBolumu(s) {
    const n = Object.entries(s.notlar || {}).filter(([, l]) => l && l.length);
    if (!n.length) return null;
    return el('details', { class: 'mt-4' }, [
      el('summary', { class: 'clickable hint', text: `Seri notları (${n.length} varlık)` }),
      el('ul', { class: 'pf-uyari-liste mt-2' }, n.map(([k, l]) => el('li', { class: 'pf-uyari pf-uyari-bilgi' }, [el('strong', { text: kisaAd(k) }), el('span', { text: [].concat(l).join(' · ') })])))
    ]);
  }

  function sonucCiz(s) {
    const k = bul('pfSonuc');
    if (!k) return;
    sonSonuc = s;
    if (!s) { doldur(k, [el('p', { class: 'hint', text: 'Henüz simülasyon yok. Kurucuda "Simüle et"e basın.' })]); return; }
    const logSecim = girdi({ type: 'checkbox', id: 'pfLogOlcek', onchange: () => egriCiz() });
    logSecim.checked = true;
    doldur(k, [
      kipBandi(s),
      // veriNotu: simülasyon bayat seriye dokundu → kaynak arka planda tazeleniyor (lib/veri/orkestrator.js talep)
      uyariListesi(s.veriNotu ? [{ seviye: 'bilgi', metin: s.veriNotu }, ...(s.uyarilar || [])] : s.uyarilar),
      karsiKipKutusu(s),
      olculerKarti(s),
      senaryoTablosu(s),
      el('div', { class: 'row-between gap-3 mt-4 mb-2' }, [
        el('h3', { class: 'pf-bolum-baslik m-0', text: 'Özsermaye eğrisi ve kıyaslar' }),
        el('label', { class: 'check-label' }, [logSecim, el('span', { text: 'log ölçek' })])
      ]),
      el('div', { class: 'canvas-box canvas-300 mb-3' }, [el('canvas', { id: 'pfGrafikEgri', role: 'img', 'aria-label': 'Portföy ve kıyasların özsermaye eğrisi (1\'den başlar)' })]),
      el('div', { class: 'canvas-box canvas-210' }, [el('canvas', { id: 'pfGrafikDusus', role: 'img', 'aria-label': 'Zirveden düşüş eğrisi (%)' })]),
      (s.kiyaslar || []).some(x => x.hata) ? el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Kıyas hatası: ' + s.kiyaslar.filter(x => x.hata).map(x => `${x.ad}: ${x.hata}`).join(' · ') }) : null,
      stresBolumu(s),
      getiriTablosu(s),
      agirlikTablosu(s),
      (s.agirlikGecmisi || []).length > 1 ? el('div', { class: 'mt-4' }, [
        baslik('Ağırlık geçmişi (her ay başı hedef)'),
        el('div', { class: 'canvas-box canvas-260' }, [el('canvas', { id: 'pfGrafikAgirlik', role: 'img', 'aria-label': 'Aylık hedef ağırlıklar (yığılmış alan); son hedef yukarıdaki tabloda' })])
      ]) : null,
      korelasyonTablosu(s),
      notlarBolumu(s),
      el('p', { class: 'hint hint-sm mt-4 mb-0', text: `Hesap süresi ${Math.round((s.sureMs || 0) / 100) / 10} sn. Simülasyon geçmiştir, kehanet değildir: vergi, valör günü ve kur makası modelde yok.` })
    ]);
    grafikleriCiz();
  }

  // ── Grafikler (Chart.js; renkler token) ─────────────────────────────────
  function seyrelt(d, n) { if (d.length <= n) return d; const adim = d.length / n; const o = []; for (let i = 0; i < n; i++) o.push(d[Math.floor(i * adim)]); o.push(d[d.length - 1]); return o; }
  const seriRengi = (i) => AG.tema.renk(`--seri-${(i % 8) + 1}`);
  function grafikKur(id, ayar) {
    if (grafikler[id]) { grafikler[id].destroy(); delete grafikler[id]; }
    const tuval = bul(id);
    if (!tuval || typeof global.Chart === 'undefined' || !tuval.getContext) return null;
    grafikler[id] = new global.Chart(tuval.getContext('2d'), ayar);
    return grafikler[id];
  }
  function ortakSecenek(p, ek) {
    return {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: p.text, boxWidth: 12 } }, tooltip: { callbacks: {} } },
      ...ek
    };
  }
  const tarihEkseni = (p, min, max) => ({ type: 'linear', min, max, grid: { color: p.grid }, ticks: { color: p.text, maxTicksLimit: 8, callback: (v) => gunStr(v).slice(0, 7) } });

  /** Kıyas eğrisini portföyün aynı gündeki düzeyine taşır (kıyas daha geç başlayabilir). */
  function yenidenTabanla(egri, kiyas) {
    if (!kiyas.length || !egri.length) return kiyas;
    const t0 = kiyas[0][0];
    let v = egri[0][1];
    for (const [t, x] of egri) { if (t > t0) break; v = x; }
    const c = v / kiyas[0][1];
    return kiyas.map(([t, x]) => [t, x * c]);
  }
  const dususHesapla = (egri) => { let tepe = -Infinity; return egri.map(([t, v]) => { tepe = Math.max(tepe, v); return [t, -(1 - v / tepe) * 100]; }); };

  function egriCiz() {
    const s = sonSonuc;
    if (!s || !s.egri) return;
    const p = AG.tema.palet();
    const log = !!(bul('pfLogOlcek') && bul('pfLogOlcek').checked);
    const kiyas = (s.kiyaslar || []).filter(k => !k.hata && k.egri);
    const ds = (ad, veri, renk, ek) => ({ label: ad, data: seyrelt(veri, 1200).map(([x, y]) => ({ x, y })), borderColor: renk, backgroundColor: renk, borderWidth: 2, pointRadius: 0, tension: 0, ...ek });
    grafikKur('pfGrafikEgri', {
      type: 'line',
      data: { datasets: [ds('Portföy', s.egri, seriRengi(0), { borderWidth: 2.4 }), ...kiyas.map((k, i) => ds(k.ad, yenidenTabanla(s.egri, k.egri), seriRengi(i + 1), { borderDash: [5, 3] }))] },
      options: ortakSecenek(p, { scales: { x: tarihEkseni(p, s.egri[0][0], s.egri[s.egri.length - 1][0]), y: { type: log ? 'logarithmic' : 'linear', grid: { color: p.grid }, ticks: { color: p.text } } } })
    });
    grafikKur('pfGrafikDusus', {
      type: 'line',
      data: { datasets: [
        ds('Portföy düşüşü %', (s.dusus || []).map(([t, d]) => [t, -d * 100]), seriRengi(0), { fill: 'origin', backgroundColor: AG.tema.alfa(seriRengi(0), 0.18) }),
        ...kiyas.map((k, i) => ds(`${k.ad} düşüşü %`, dususHesapla(k.egri), seriRengi(i + 1), { borderWidth: 1.2, borderDash: [5, 3] }))
      ] },
      options: ortakSecenek(p, { scales: { x: tarihEkseni(p, s.egri[0][0], s.egri[s.egri.length - 1][0]), y: { max: 0, grid: { color: p.grid }, ticks: { color: p.text, callback: (v) => `%${v}` } } } })
    });
  }

  function grafikleriCiz() {
    const s = sonSonuc;
    if (!s || typeof global.Chart === 'undefined') return;
    const p = AG.tema.palet();
    egriCiz();
    const vs = s.varliklar || [];
    const rk = s.riskKatkisi || {};
    if (vs.length) {
      grafikKur('pfGrafikRisk', {
        type: 'bar',
        data: { labels: vs.map(v => kisaAd(v.kimlik)), datasets: [
          { label: 'Risk katkısı %', data: vs.map(v => (rk[v.kimlik] || 0) * 100), backgroundColor: vs.map((v, i) => seriRengi(i)), borderRadius: 4, barThickness: 14 },
          { label: 'Ortalama ağırlık %', data: vs.map(v => ((s.ortAgirlik || {})[v.kimlik] || 0) * 100), backgroundColor: AG.tema.alfa(p.muted, 0.5), borderRadius: 4, barThickness: 14 }
        ] },
        options: ortakSecenek(p, { indexAxis: 'y', interaction: { mode: 'nearest', intersect: true }, scales: { x: { grid: { color: p.grid }, ticks: { color: p.text, callback: (v) => `%${v}` } }, y: { grid: { display: false }, ticks: { color: p.text } } } })
      });
    }
    const ag = s.agirlikGecmisi || [];
    if (ag.length > 1) {
      // 8'den fazla varlık: en büyük ortalamalı 7 + "Diğer" (renk varlığa bağlı, sırası tanımdaki sıra).
      let kollar = vs.map(v => v.kimlik);
      let diger = [];
      if (kollar.length > 8) {
        const sira = kollar.slice().sort((a, b) => ((s.ortAgirlik || {})[b] || 0) - ((s.ortAgirlik || {})[a] || 0));
        const ust = new Set(sira.slice(0, 7));
        diger = kollar.filter(k => !ust.has(k)); kollar = kollar.filter(k => ust.has(k));
      }
      const veri = (f) => ag.map(a => ({ x: Date.parse(a.ay + '-01'), y: f(a.hedef || {}) * 100 }));
      const dsList = kollar.map((k, i) => ({ label: kisaAd(k), data: veri(h => h[k] || 0), borderColor: seriRengi(vs.findIndex(v => v.kimlik === k)), backgroundColor: AG.tema.alfa(seriRengi(vs.findIndex(v => v.kimlik === k)), 0.75), fill: i === 0 ? 'origin' : '-1', pointRadius: 0, borderWidth: 1, stepped: true }));
      if (diger.length) dsList.push({ label: `Diğer (${diger.length})`, data: veri(h => diger.reduce((a, k) => a + (h[k] || 0), 0)), borderColor: p.muted, backgroundColor: AG.tema.alfa(p.muted, 0.6), fill: '-1', pointRadius: 0, borderWidth: 1, stepped: true });
      grafikKur('pfGrafikAgirlik', {
        type: 'line', data: { datasets: dsList },
        options: ortakSecenek(p, { scales: { x: tarihEkseni(p, Date.parse(ag[0].ay + '-01'), Date.parse(ag[ag.length - 1].ay + '-01')), y: { stacked: true, min: 0, max: 100, grid: { color: p.grid }, ticks: { color: p.text, callback: (v) => `%${v}` } } } })
      });
    }
  }

  // ═══ 4. VARYASYON ═══════════════════════════════════════════════════════
  function varyasyonBolumu() {
    return el('div', { class: 'glass-panel panel-pad' }, [
      baslik('Varyasyon: bir varlığı değiştir, adayları aynı dönemde sırala'),
      el('div', { id: 'pfVarForm' }),
      el('div', { id: 'pfVarSonuc', class: 'mt-4' })
    ]);
  }

  function varyasyonFormCiz() {
    const k = bul('pfVarForm');
    if (!k) return;
    if (!D.varliklar.length) { doldur(k, [el('p', { class: 'hint', text: 'Önce kurucuda bir portföy oluşturun.' })]); return; }
    const onceki = bul('pfVarDegistir') ? bul('pfVarDegistir').value : '';
    const kumeSec = secici({ id: 'pfVarKume', class: 'form-control control-sm', onchange: () => { const o = bul('pfVarOzelAlan'); if (o) o.classList.toggle('is-hidden', kumeSec.value !== 'ozel'); } },
      Object.entries(ADAY_KUME).map(([a, x]) => [a, x.ad]), 'abd-endeks');
    doldur(k, [
      el('div', { class: 'pf-form-izgara' }, [
        alan('Değiştirilecek varlık', secici({ id: 'pfVarDegistir', class: 'form-control control-sm' }, D.varliklar.map(v => [v.kimlik, `${kisaAd(v.kimlik)} — ${v.ad || ''}`]),
          D.varliklar.some(v => v.kimlik === onceki) ? onceki : D.varliklar[0].kimlik)),
        alan('Aday kümesi', kumeSec),
        alan('En çok aday', girdi({ id: 'pfVarLimit', type: 'number', min: '1', max: '100', step: '1', class: 'form-control control-sm' }, 15), 'Her aday bir deneme sayılır.'),
        alan('Sırala', secici({ id: 'pfVarSirala', class: 'form-control control-sm' }, [['sharpe', 'Sharpe'], ['cagr', 'CAGR'], ['maxDD', 'En küçük düşüş'], ['calmar', 'Calmar'], ['sortino', 'Sortino']], 'sharpe')),
        alan('Dönem', secici({ id: 'pfVarOrtak', class: 'form-control control-sm' }, [['1', 'Ortak dönem (adil kıyas)'], ['0', 'Her aday kendi dönemi']], '1'),
          'Ortak dönem: tüm adaylar aynı günlerde koşar. Kısa geçmişli bir aday dönemi kısaltır.')
      ]),
      el('div', { id: 'pfVarOzelAlan', class: 'mt-2 is-hidden' }, [
        alan('Aday kimlikleri (virgülle)', girdi({ id: 'pfVarOzel', class: 'form-control control-sm', placeholder: 'yahoo:SPY, yahoo:IWM, yahoo:VTI' }))
      ]),
      el('div', { class: 'pf-dugmeler mt-3' }, [
        el('button', { type: 'button', class: 'btn btn-primary', onclick: (ev) => varyasyonKos(ev.currentTarget) }, [el('span', { text: 'Varyasyonları koş' })])
      ]),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Uyarı: çok sayıda varyasyon denemek, şans eseri iyi görünen bir aday üretir. Sıralamanın başındaki adayın düzeltilmiş Sharpe\'ına ve "mevcuttan iyi olma olasılığı"na bakın; fark belirsizse değiştirmeyin.' })
    ]);
  }

  function varyasyonGovdesi() {
    const kume = bul('pfVarKume').value;
    const limit = Math.max(1, Math.min(100, Number(bul('pfVarLimit').value) || 15));
    let adaylar;
    if (kume === 'ozel') {
      adaylar = String(bul('pfVarOzel').value || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, limit);
      if (!adaylar.length) throw new Error('Özel listede aday yok.');
    } else adaylar = { ...ADAY_KUME[kume].suzgec, limit };
    return { tanim: tanimKur(D), degistir: bul('pfVarDegistir').value, adaylar, oturum: OTURUM, ortakDonem: bul('pfVarOrtak').value !== '0', sirala: bul('pfVarSirala').value };
  }

  async function varyasyonKos(d) {
    const den = agirlikDenetim(D);
    if (!den.gecerli) { bildir(den.hatalar.join(' · '), 'uyari'); return; }
    let govde;
    try { govde = varyasyonGovdesi(); } catch (e) { bildir(e.message, 'uyari'); return; }
    AG.dom.mesgul(d, 'Koşuluyor…');
    try {
      const r = await api().varyasyon(govde);
      if (!r.success) throw new Error(r.error);
      const s = await isiIzle(r.is.id, 'Varyasyon');
      sonVaryasyon = s;
      if (s && s.oturumSayi != null) denemeCiz(s.oturumSayi);
      varyasyonCiz(s);
    } catch (e) { bildir('Varyasyon başarısız: ' + e.message, 'hata'); }
    finally { AG.dom.hazir(d); }
  }

  function varyasyonCiz(s) {
    const k = bul('pfVarSonuc');
    if (!k) return;
    if (!s) { doldur(k, []); return; }
    const STRES_SUTUN = ['2020-03', '2022', '2018-08-TL'];
    const gecerli = (s.satirlar || []).filter(x => !x.hata);
    let sira = 0;
    const satirlar = (s.satirlar || []).map(x => {
      if (x.hata) return el('tr', null, [hucre('—'), el('td', { class: 'pf-sola' }, [el('div', { text: cvAd(x.ad) || x.kimlik }), el('div', { class: 'pf-kucuk', text: x.kimlik })]), el('td', { class: 'tone-danger pf-sola', colspan: '9', text: `koşulamadı: ${x.hata}` })]);
      sira++;
      const o = x.olculer || {}, f = x.fark || {};
      const tr = el('tr', {
        class: x.mevcut ? 'pf-mevcut' : 'pf-tiklanir',
        title: x.mevcut ? 'mevcut portföy' : 'Tıklayın: bu varyasyonu kurucuya yükle',
        onclick: x.mevcut ? null : () => varyasyonuYukle(s.degistir, x)
      }, [
        hucre(String(sira)),
        el('td', { class: 'pf-sola' }, [el('div', { text: `${cvAd(x.ad) || x.kimlik}${x.mevcut ? ' (mevcut)' : ''}` }), el('div', { class: 'pf-kucuk', text: x.kimlik })]),
        hucre(yz(o.cagr), ton(o.cagr)), hucre(yz(o.maxDD)), hucre(sy(o.sharpe)),
        hucre(x.mevcut ? '—' : (sayiMi(f.sharpe) ? `${f.sharpe > 0 ? '+' : ''}${sy(f.sharpe)}` : '—'), x.mevcut ? '' : ton(f.sharpe)),
        hucre(x.mevcut ? '—' : (sayiMi(x.pMevcuttanIyi) ? yz(x.pMevcuttanIyi, 0) : '—'), sayiMi(x.pMevcuttanIyi) && x.pMevcuttanIyi >= 0.9 ? 'tone-success' : 'tone-muted'),
        ...STRES_SUTUN.map(kod => { const g = x.stres && x.stres[kod]; return g ? hucre(yz(g.getiri), ton(g.getiri)) : hucre('—', 'tone-muted', 'dönem kapsanmıyor'); }),
        hucre(x.donem && x.donem.oosBas ? x.donem.oosBas.slice(0, 7) : '—')
      ]);
      return tr;
    });
    const dsrTon = sayiMi(s.dsr) ? (s.dsr < 0.95 ? 'tone-warning' : 'tone-success') : '';
    doldur(k, [
      el('div', { class: 'stats-grid stats-grid-dense mb-3' }, [
        kutu('Aday', String((s.satirlar || []).length - 1), `${gecerli.length - 1} koşuldu`),
        kutu('Bu turda deneme', String(s.yeniDeneme || 0)),
        kutu('Oturumda toplam', String(s.oturumSayi != null ? s.oturumSayi : s.denemeSayisi), 'DSR bu sayıyla düzeltilir', (s.oturumSayi || s.denemeSayisi) >= 20 ? 'tone-warning' : ''),
        kutu('En iyinin düzeltilmiş Sharpe\'ı', sayiMi(s.dsr) ? sy(s.dsr) : '—', sayiMi(s.dsr) ? (s.dsr < 0.95 ? 'şans olabilir (< 0,95)' : 'şanstan öte (≥ 0,95)') : null, dsrTon)
      ]),
      (s.sansUyarisi || []).length ? el('ul', { class: 'pf-uyari-liste' }, s.sansUyarisi.map(u => el('li', { class: 'pf-uyari pf-uyari-kritik' }, [el('strong', { text: 'ŞANS:' }), el('span', { text: ' ' + u })]))) : null,
      el('p', { class: 'hint hint-sm', text: `Dönem ${s.donem ? `${s.donem.bas} → ${s.donem.bit}` : '—'}${s.donem && s.donem.sinirlayan ? ` (en geç başlayan: ${s.donem.sinirlayan})` : ''} · "${kisaAd(s.degistir)}" yerine konan adaylar, ${s.siralama} sırasıyla. Satıra tıklayınca o varyasyon kurucuya yüklenir.` }),
      tablo(['#', 'Varlık', 'CAGR', 'Düşüş', 'Sharpe', 'Δ Sharpe', 'P(mevcuttan iyi)', ...STRES_SUTUN.map(k2 => STRES_KISA[k2]), 'Ölçü başı'], satirlar, '', 'portfoy.varyasyon'),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'P(mevcuttan iyi): aynı günlerde eşleştirilmiş bootstrap; %90 altı fark belirsizdir. Stres sütunları o dönemdeki toplam getiri.' })
    ]);
  }

  async function varyasyonuYukle(eski, satir) {
    const i = D.varliklar.findIndex(v => v.kimlik === eski);
    if (i < 0) { bildir(`'${eski}' kurucuda yok; varyasyon yüklenemedi.`, 'uyari'); return; }
    D.varliklar[i] = { ...D.varliklar[i], kimlik: satir.kimlik, ad: satir.ad || '', sinif: satir.sinif || '', hesap: '', para: '' };
    taslakKaydet();
    kurucuCiz();
    altSekme('kurucu');
    bildir(`${kisaAd(eski)} → ${kisaAd(satir.kimlik)} kurucuya yüklendi. "Simüle et" ile ayrıntıya bakın.`, 'ok');
    await adlariTamamla();
  }

  // ═══ 5. KARŞILAŞTIR ═════════════════════════════════════════════════════
  let portfoyListesi = [];
  const secilenler = new Set();

  function karsilastirBolumu() {
    return el('div', { class: 'glass-panel panel-pad' }, [
      baslik('Kayıtlı portföyler'),
      el('div', { id: 'pfKayitli' }),
      el('div', { class: 'pf-dugmeler mt-3' }, [
        el('button', { type: 'button', class: 'btn btn-primary', onclick: (ev) => karsilastir(ev.currentTarget) }, [el('span', { text: 'Seçilileri karşılaştır (2–4)' })])
      ]),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Her portföy yeniden simüle edilir (her biri bir deneme sayılır). Dönemleri farklıysa eğriler ortak başlangıçta 1\'e eşitlenir.' }),
      el('div', { id: 'pfKarsiSonuc', class: 'mt-4' }),
      el('details', { class: 'hs-kat-mini mt-4', id: 'pfKararArsiv', ontoggle: (ev) => { if (ev.target.open) kararlarYukle(); } }, [
        el('summary', { text: 'Eski karar günlüğü (arşiv, salt okunur)' }),
        el('div', { id: 'pfKararlar', class: 'mt-2' })
      ])
    ]);
  }

  async function portfoylerYukle() {
    try {
      const r = await api().portfoyler();
      if (!r.success) throw new Error(r.error);
      portfoyListesi = r.portfoyler || [];
      for (const ad of [...secilenler]) if (!portfoyListesi.some(p => p.ad === ad)) secilenler.delete(ad);
      portfoylerCiz();
    } catch (e) {
      const k = bul('pfKayitli'); if (k) doldur(k, [el('div', { class: 'trace-note trace-note-warn', text: 'Kayıtlı portföyler okunamadı: ' + e.message })]);
    }
  }

  function portfoylerCiz() {
    const k = bul('pfKayitli');
    if (!k) return;
    if (!portfoyListesi.length) { doldur(k, [el('p', { class: 'hint', text: 'Kayıtlı portföy yok. Kurucuda bir ad verip "Kaydet"e basın.' })]); return; }
    const satirlar = portfoyListesi.map(p => {
      const kutucuk = girdi({ type: 'checkbox', 'aria-label': `${p.ad} karşılaştırmaya ekle`, onchange: (ev) => { if (ev.target.checked) secilenler.add(p.ad); else secilenler.delete(p.ad); } });
      kutucuk.checked = secilenler.has(p.ad);
      const t = p.tanim || {};
      return el('tr', null, [
        el('td', null, [kutucuk]),
        el('td', { class: 'pf-sola' }, [el('div', { class: 'fw-semibold', text: p.ad }), p.aciklama ? el('div', { class: 'pf-kucuk', text: p.aciklama }) : null]),
        hucre((t.varliklar || []).map(v => kisaAd(v.kimlik || v) + (v.agirlik != null ? ` ${yz(v.agirlik, 0)}` : '')).join(', '), 'pf-sola'),
        hucre(`${YONTEM_AD[t.yontem] || t.yontem || '—'}${t.kip === 'gecmis' && t.yontem !== 'elle' ? ' · in-sample' : ''}`),
        hucre(String(p.guncelleme || '').slice(0, 10)),
        el('td', null, [el('div', { class: 'pf-dugmeler' }, [
          dugme('Yükle', () => tanimYukle(t, `"${p.ad}"`), 'btn-secondary btn-xs'),
          dugme('Sil', () => portfoySil(p.ad), 'btn-secondary btn-xs btn-outline-danger')
        ])])
      ]);
    });
    doldur(k, [tablo(['', 'Ad', 'Varlıklar', 'Yöntem', 'Güncelleme', ''], satirlar)]);
  }

  async function portfoySil(ad) {
    const evet = await AG.onayla({ baslik: 'Portföyü sil', metin: `"${ad}" kalıcı olarak silinsin mi? (Karar günlüğündeki kayıtlar etkilenmez.)`, onay: 'Sil', tehlikeli: true });
    if (!evet) return;
    try { const r = await api().portfoySil(ad); if (!r.success) throw new Error(r.error); secilenler.delete(ad); bildir(`"${ad}" silindi.`, 'ok'); portfoylerYukle(); }
    catch (e) { bildir('Silinemedi: ' + e.message, 'hata'); }
  }

  async function karsilastir(d) {
    const adlar = portfoyListesi.filter(p => secilenler.has(p.ad)).map(p => p.ad);
    if (adlar.length < 2 || adlar.length > 4) { bildir('Karşılaştırmak için 2–4 portföy seçin.', 'uyari'); return; }
    AG.dom.mesgul(d, 'Simüle ediliyor…');
    const sonuclar = [];
    try {
      for (const ad of adlar) {
        const p = portfoyListesi.find(x => x.ad === ad);
        try {
          const r = await api().simule(p.tanim, OTURUM);
          if (!r.success) throw new Error(r.error);
          const s = await isiIzle(r.is.id, `Karşılaştırma: ${ad}`);
          if (s && s.deneme && s.deneme.oturumSayi != null) denemeCiz(s.deneme.oturumSayi);
          sonuclar.push({ ad, sonuc: s });
        } catch (e) { sonuclar.push({ ad, hata: e.message }); }
      }
      karsilastirCiz(sonuclar);
    } finally { AG.dom.hazir(d); }
  }

  function karsilastirCiz(liste) {
    const k = bul('pfKarsiSonuc');
    if (!k) return;
    const ok = liste.filter(x => x.sonuc && x.sonuc.olculer);
    const stresKod = ['2008', '2020-03', '2022', '2018-08-TL', '2021-12-TL'];
    const satirlar = liste.map(x => {
      if (!x.sonuc) return el('tr', null, [hucre(x.ad, 'pf-sola'), el('td', { class: 'tone-danger pf-sola', colspan: '12', text: x.hata || 'sonuç yok' })]);
      const s = x.sonuc, o = s.olculer || {}, t = s.tanim || {};
      const kritik = (s.uyarilar || []).filter(u => u.seviye === 'kritik').length;
      const don = Object.fromEntries(((s.stres || {}).donemler || []).map(dd => [dd.kod, dd.portfoy]));
      return el('tr', null, [
        el('td', { class: 'pf-sola' }, [el('div', { class: 'fw-semibold', text: x.ad }), el('div', { class: 'pf-kucuk', text: `${o.bas || '—'} → ${o.bit || '—'}` })]),
        hucre(t.yontem === 'elle' ? 'elle' : t.kip === 'gecmis' ? 'in-sample' : 'walk-forward', t.yontem !== 'elle' && t.kip === 'gecmis' ? 'tone-danger' : ''),
        hucre(yz(o.cagr), ton(o.cagr)), hucre(yz(o.maxDD)), hucre(sy(o.sharpe)), hucre(sy(o.calmar)), hucre(yz(o.vol)),
        ...stresKod.map(kod => (don[kod] ? hucre(yz(don[kod].getiri), ton(don[kod].getiri)) : hucre('—', 'tone-muted', 'kapsanmıyor'))),
        hucre(String(kritik), kritik ? 'tone-danger' : 'tone-muted', 'kritik uyarı sayısı')
      ]);
    });
    doldur(k, [
      tablo(['Portföy', 'Kip', 'CAGR', 'Düşüş', 'Sharpe', 'Calmar', 'Oynaklık', ...stresKod.map(x => STRES_KISA[x]), 'Kritik uyarı'], satirlar, '', 'portfoy.karsilastir'),
      ok.length >= 2 ? el('div', { class: 'canvas-box canvas-300 mt-3' }, [el('canvas', { id: 'pfGrafikKarsi', role: 'img', 'aria-label': 'Seçili portföylerin özsermaye eğrileri (ortak başlangıçta 1)' })]) : null,
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Dönemleri farklı portföylerin ölçüleri doğrudan kıyaslanamaz (ör. TEFAS içeren portföy 2021-10\'dan başlar ve 2018/2021 TL krizlerini içermez).' })
    ]);
    if (ok.length >= 2 && typeof global.Chart !== 'undefined') {
      const p = AG.tema.palet();
      const t0 = Math.max(...ok.map(x => x.sonuc.egri[0][0]));
      grafikKur('pfGrafikKarsi', {
        type: 'line',
        data: { datasets: ok.map((x, i) => {
          const e = x.sonuc.egri.filter(([t]) => t >= t0);
          const b = e.length ? e[0][1] : 1;
          return { label: x.ad, data: seyrelt(e, 1000).map(([t, v]) => ({ x: t, y: v / b })), borderColor: seriRengi(i), backgroundColor: seriRengi(i), borderWidth: 2, pointRadius: 0 };
        }) },
        options: ortakSecenek(p, { scales: { x: tarihEkseni(p, t0, Math.max(...ok.map(x => x.sonuc.egri[x.sonuc.egri.length - 1][0]))), y: { type: 'logarithmic', grid: { color: p.grid }, ticks: { color: p.text } } } })
      });
    }
  }

  // ═══ 6. KARAR GÜNLÜĞÜ (ARŞİV) ══════════════════════════════════════════
  // 67.5: "Olsaydı planı" sekmesi kaldırıldı (gerçek emir önerisi Portföy › Hedefim planlayıcısında; "Bu dağılımı geçmişte
  // dene" oradan Kurucu'ya aktarır). Eski karar günlüğü silinmedi: Karşılaştır'ın altında salt okunur arşiv (yeni kayıt yok).
  async function kararlarYukle() {
    const k = bul('pfKararlar');
    if (!k) return;
    try {
      const r = await api().kararlar(50);
      if (!r.success) throw new Error(r.error);
      kararlarCiz(r.kararlar || []);
    } catch (e) { doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'Karar günlüğü okunamadı' })]); }
  }

  function kararlarCiz(liste) {
    const k = bul('pfKararlar');
    if (!k) return;
    if (!liste.length) { doldur(k, [el('p', { class: 'hint hint-sm', text: 'Arşivde karar yok.' })]); return; }
    const satirlar = liste.map(x => {
      const t = x.tanim || {};
      const varl = (t.varliklar || []).map(v => kisaAd(v.kimlik || v) + (v.agirlik != null ? ` ${yz(v.agirlik, 0)}` : '')).join(', ');
      return el('tr', null, [
        hucre(AG.fmt ? AG.fmt.tarihSaat(x.zaman) : String(x.zaman)),
        hucre(x.not || '—', 'pf-sola'),
        hucre(`${varl}${t.yontem && t.yontem !== 'elle' ? ` · ${YONTEM_AD[t.yontem] || t.yontem}` : ''}`, 'pf-sola'),
        hucre(x.plan ? (x.plan.islemGerekmez ? 'işlem yok' : `${(x.plan.islemler || []).length} işlem · ${usd(x.plan.toplamUSD)}`) : 'plansız'),
        el('td', null, [dugme('Kurucuya yükle', () => tanimYukle(t, 'Karar'), 'btn-secondary btn-xs')])
      ]);
    });
    doldur(k, [tablo(['Zaman', 'Not', 'Portföy', 'Plan', ''], satirlar)]);
  }

  // ═══ İSKELET VE ALT SEKMELER ════════════════════════════════════════════
  /** Üst sıra (62.3): Portföyüm · Model portföyler · Bu ay yapılacaklar · Kayıt. Laboratuvar (LAB) ayrı görünüm: Araştırma'dan açılır. */
  /** 62.4 (kullanıcı taslak 3): Portföyüm · üç model (her biri kendi sekmesi, kendi rengi) · Hesaplarım. */
  /** 64.2 (P6, kullanıcı taslağı A): Portföyüm'ün hemen sağında "Rapor" (aylık rapor, stres, korelasyon — portfoyumRapor.js). */
  /** 64.7: Rapor'un hemen sağında "İşlem defterim" (kendi kripto/FX işlemleri — islemDefteri.js; Portföyüm'den ayrı; düğme 'pfAlt-islem-defteri'). */
  /** Yeni panel F4 (PLAN-PANEL-YENI K2): Pano · Hesaplar · Varlıklar · İşlem defteri · Hedefim · Modeller (üç model) · Takvim ve akış · Rapor.
   *  Gezinme yan menüden (adres #/portfoy/<alt>); üst sekme şeridi ve özet şeridi gizli (toplam yalnız Pano'da — §3).
   *  Pano / Varlıklar / Hedefim / Takvim: js/pages/pano.js. Eski "Portföyüm" sayfası (#pfBolum-portfoyum) gizli kalır — portfoyum.js
   *  Hesaplar'ı aynı veriden kurar; eski adres #/portfoy/portfoyum → Pano. */
  /** 72.0: model sekme adı kimlikten (AG.botAd yüklenmemişse yedek). */
  const cvAd = (s) => (AG.botAd ? AG.botAd.cevir(s) : s);
  const botTam = (k, yedek) => (AG.botAd && AG.botAd.tam(k)) || yedek;
  const UST = [['pano', 'Pano'], ['hesaplar', 'Hesaplar'], ['varliklar', 'Varlıklar'], ['islem-defteri', 'İşlem defteri'], ['hedefim', 'Hedefim'],
    ['nasdaq', botTam('m-qqq-m10', 'Nova · Nasdaq Momentum 10')], ['bist', botTam('m-bist-m10', 'Lydia · BIST Momentum 10')], ['q837', botTam('m-837', 'Simurg · %50 QQQ + %50 Kairos')], ['takvim', 'Takvim ve akış'], ['rapor', 'Rapor']];
  const PANO_SAYFA = new Set(['pano', 'varliklar', 'hedefim', 'takvim']);
  const MODEL_SEKME = { nasdaq: 'm-qqq-m10', bist: 'm-bist-m10', q837: 'm-837' };
  const modelMi = (ad) => ad in MODEL_SEKME;
  /** F5 (denetim 2): "Tasarımcı" → Strateji karışımı (kol düzeyi; model kartları ve takvim Modeller / Takvim'de, burada gizli).
   *  67.5: "Olsaydı planı" kaldırıldı (eski adres → Kurucu). Ana sekmeler Kurucu · Sonuç · Karşılaştır; Strateji karışımı ve
   *  Varyasyon "İleri araştırma" katında (silinmedi; deneme sayacı aynı). */
  const LAB_ANA = [['kurucu', 'Kurucu'], ['sonuc', 'Sonuç'], ['karsilastir', 'Karşılaştır']];
  const LAB_ILERI = [['tasarimci', 'Strateji karışımı'], ['varyasyon', 'Varyasyon']];
  const LAB = [...LAB_ANA, ...LAB_ILERI];
  const ileriMi = (ad) => LAB_ILERI.some(([a]) => a === ad);
  let ileriAcik = false;
  const ALT = [...UST, ...LAB];
  /** Eski adresler (60.9–62.2) → yeni sekme. */
  const ESKI_AD = { model: 'nasdaq', modeller: 'nasdaq', buay: 'nasdaq', kayit: 'hesaplar', portfoyum: 'pano', plan: 'kurucu' };   // 67.5: plan → Kurucu
  const labMi = (ad) => LAB.some(([a]) => a === ad);
  const ustAd = (ad) => (labMi(ad) ? 'laboratuvar' : ad);
  /** Sekmelerin sayfa modülleri (yoksa sessiz). Portföyüm ve Kayıt aynı veriyi paylaşır (portfoyum.js iki kabı birlikte kurar). */
  function sayfaYukle(ad) {
    const P = AG.pages || {};
    if (ad === 'tasarimci' && P.tasarimci) P.tasarimci.yukle();
    if (ad === 'rapor' && P.portfoyumRapor) P.portfoyumRapor.yukle();
    if (ad === 'islem-defteri' && P.islemDefteri) P.islemDefteri.yukle();
    // F4: yeni sayfalar + Hesaplar'ın portföy kartı + Rapor'un ölçüt kartı + İşlem defteri kaynak seçici (js/pages/pano.js)
    if (P.pano) P.pano.yukle(ad);
    if (modelMi(ad)) {
      if (P.hisseYapilari) P.hisseYapilari.yukle();
      if (P.tasarimci) P.tasarimci.buAyYukle();
    }
    // Özet şeridi (toplam, değer, dağılım) her Portföy sekmesinin üstünde — veri Portföyüm'den
    if (!labMi(ad) && P.portfoyum) P.portfoyum.yukle();
  }

  /** B-21: etkin sekme şeridin görünür alanı dışındaysa şerit (yalnız yatay) onu ortalayacak kadar kayar — sayfa dikey kaymaz. */
  function seritGoster(serit) {
    if (!serit || !serit.querySelector || !serit.getBoundingClientRect) return;
    const a = serit.querySelector('.is-active');
    if (!a || !a.getBoundingClientRect) return;
    const s = serit.getBoundingClientRect(), r = a.getBoundingClientRect();
    if (r.left >= s.left && r.right <= s.right) return;
    serit.scrollLeft = Math.max(0, (serit.scrollLeft || 0) + (r.left + r.width / 2) - (s.left + s.width / 2));
  }
  /** B-20: alt sekme adreste (#/portfoy/<alt>) — yenileme, geri tuşu ve paylaşılan bağlantı aynı sekmeyi açar. */
  function adresYaz(ad) {
    try {
      const h = global.location ? global.location.hash : '';
      if (!/^#\/portfoy(\/|$)/.test(h || '') || !global.history || !global.history.replaceState) return;
      if (h !== '#/portfoy/' + ad) global.history.replaceState(null, '', '#/portfoy/' + ad);
      if (AG.rota && AG.rota.altDegisti) AG.rota.altDegisti(ad);   // 62.7: telefon alt çubuğundaki "Hesaplarım" işareti
    } catch (e) { /* file:// vb.: adres yazılamadı, sekme yine açılır */ }
  }
  /** F5: laboratuvarın iç sekmesi adreste (#/arastirma/laboratuvar/<sekme>) — yenileme ve bağlantı aynı sekmeyi açar. */
  function labAdresYaz(ad) {
    try {
      const h = global.location ? global.location.hash : '';
      if (!/^#\/arastirma\/laboratuvar(\/|$)/.test(h || '') || !global.history || !global.history.replaceState) return;
      if (h !== '#/arastirma/laboratuvar/' + ad) global.history.replaceState(null, '', '#/arastirma/laboratuvar/' + ad);
      if (AG.rota && AG.rota.altDegisti) AG.rota.altDegisti(ad);
    } catch (e) { /* file:// */ }
  }
  /** B-20: adresin alt parçası → alt sekme (bilinmeyen alt yok sayılır; alt yoksa son açılan kalır ve adres tamamlanır). */
  /** 62.9: laboratuvar Araştırma içinde açılır (#/arastirma/laboratuvar). Hangi yoldayız? */
  const rotaYol = () => (AG.rota && typeof AG.rota.gecerli === 'function' ? AG.rota.gecerli() : null);
  function rotaAlt(altYol) {
    let alt = String(altYol || '').split('/')[0];
    // Portföy yolunda laboratuvar açılmaz (Araştırma'ya taşındı); laboratuvar yolunda Portföy sekmesi açılmaz.
    if (rotaYol() === 'portfoy' && (alt === 'laboratuvar' || labMi(alt))) { if (labMi(alt)) sonLab = alt; AG.rota.git('arastirma/laboratuvar'); return; }
    if (rotaYol() === 'portfoy' && !alt && labMi(aktifAlt)) alt = 'pano';
    if (ESKI_AD[alt]) alt = ESKI_AD[alt];
    if (alt && (ALT.some(([a]) => a === alt) || alt === 'laboratuvar')) { if (alt !== aktifAlt) altSekme(alt, { adresYok: alt !== 'laboratuvar' }); }
    else adresYaz(aktifAlt);
  }
  function altSekme(ad, ops) {
    if (ad === 'laboratuvar') ad = sonLab;
    // 62.9: Portföy'den laboratuvara (ya da tersine) geçiş yol değiştirir — sol menü doğru bölümü göstersin.
    const yolNe = rotaYol();
    if (yolNe === 'portfoy' && labMi(ad)) { sonLab = ad; AG.rota.git('arastirma/laboratuvar'); return; }
    if (yolNe === 'arastirma/laboratuvar' && !labMi(ESKI_AD[ad] || ad) && ad !== 'laboratuvar') { AG.rota.git('portfoy/' + (ESKI_AD[ad] || ad)); return; }
    if (ESKI_AD[ad]) ad = ESKI_AD[ad];
    if (!ALT.some(([a]) => a === ad)) ad = 'pano';
    aktifAlt = ad;
    if (!(ops && ops.adresYok)) adresYaz(ad);
    if (labMi(ad)) { sonLab = ad; labAdresYaz(ad); }
    const ust = ustAd(ad);
    for (const [a] of ALT) {
      const b = bul('pfBolum-' + a);
      if (b) b.classList.toggle('is-hidden', a !== ad);
    }
    for (const [a] of [...UST, ...LAB]) {
      const d = bul('pfAlt-' + a), secili = a === ad || a === ust;
      if (d) { d.classList.toggle('is-active', secili); d.setAttribute('aria-selected', secili ? 'true' : 'false'); }
    }
    const labSira = bul('pfLabSekmeler');
    if (labSira) labSira.classList.toggle('is-hidden', ust !== 'laboratuvar');
    ileriGoster(ileriMi(ad) || ileriAcik);
    // 62.3: laboratuvar ayrı görünüm — Portföy sekmeleri gizli, yerine laboratuvar başlığı ("← Portföy")
    const ustSira = bul('pfUstSekmeler'), labBas = bul('pfLabBaslik');
    if (ustSira) ustSira.classList.toggle('is-hidden', ust === 'laboratuvar');
    const ozetS = bul('pfOzetSerit'), ortak = bul('pfModelOrtak');
    if (ozetS) ozetS.classList.toggle('is-hidden', ust === 'laboratuvar');
    if (ortak) ortak.classList.toggle('is-hidden', !modelMi(ad));
    // F4: Modeller tek sayfa — üç model içerideki seçiciyle (üst şerit yerine).
    const ms = bul('pfModelSecici');
    if (ms) {
      ms.classList.toggle('is-hidden', !modelMi(ad));
      if (ms.querySelectorAll) ms.querySelectorAll('button').forEach(d => d.setAttribute('aria-pressed', d.getAttribute('data-model') === ad ? 'true' : 'false'));
    }
    if (labBas) labBas.classList.toggle('is-hidden', ust !== 'laboratuvar');
    // 62.9: sayfa başlığı — laboratuvarda "Portföy laboratuvarı" (Araştırma içinde açılır).
    const sb = bul('pfSayfaBaslik');
    if (sb) sb.textContent = ust === 'laboratuvar' ? 'Portföy laboratuvarı' : 'Portföy';
    // Laboratuvar şeridi (deneme sayacı, veri durumu) yalnız Laboratuvar'da.
    const serit = bul('pfUstSerit');
    if (serit) serit.classList.toggle('is-hidden', ust !== 'laboratuvar');
    seritGoster(bul('pfUstSekmeler')); if (ust === 'laboratuvar') seritGoster(labSira);
    try { if (doc && global.CustomEvent) doc.dispatchEvent(new global.CustomEvent('ag:portfoy-alt', { detail: { alt: ad } })); } catch (e) { /* eski tarayıcı */ }
    sayfaYukle(ad);
    if (ad === 'varyasyon') varyasyonFormCiz();
    if (ad === 'karsilastir') portfoylerYukle();
    if (ad === 'sonuc' && sonSonuc) grafikleriCiz();
  }

  function labSekmeDugmesi(a, t) {
    return el('button', { type: 'button', id: 'pfAlt-' + a, class: `pf-alt-sekme${a === aktifAlt ? ' is-active' : ''}`, role: 'tab', 'aria-selected': a === aktifAlt ? 'true' : 'false', text: t, onclick: () => altSekme(a) });
  }
  /** 67.5: "İleri araştırma" katı (Strateji karışımı · Varyasyon) — açık ya da etkin sekme oradaysa görünür. */
  function ileriGoster(acik) {
    const k = bul('pfLabIleri'), d = bul('pfLabIleriDugme');
    const lab = labMi(aktifAlt);
    if (k) k.classList.toggle('is-hidden', !(lab && acik));
    if (d) { d.setAttribute('aria-expanded', acik ? 'true' : 'false'); d.classList.toggle('is-active', ileriMi(aktifAlt)); }
  }

  function iskelet() {
    const kok = bul('pfKok');
    if (!kok) return false;
    doldur(kok, [
      el('div', { id: 'pfOzetSerit', class: `pm-ozet-serit${labMi(aktifAlt) ? ' is-hidden' : ''}`, 'aria-live': 'polite' }),
      el('div', { id: 'pfUstSekmeler', class: `pf-alt-sekmeler pf-ana-sekmeler${labMi(aktifAlt) ? ' is-hidden' : ''}`, role: 'tablist', 'aria-label': 'Portföy bölümleri' }, UST.map(([a, t]) => el('button', {
        type: 'button', id: 'pfAlt-' + a, class: `pf-alt-sekme pf-sekme-${a}${a === ustAd(aktifAlt) ? ' is-active' : ''}`, role: 'tab', 'aria-selected': a === ustAd(aktifAlt) ? 'true' : 'false', onclick: () => altSekme(a)
      }, [el('span', { class: 'pf-sekme-nokta', 'aria-hidden': 'true' }), el('span', { text: t }), modelMi(a) ? el('span', { id: 'pfIsSayi-' + a, class: 'pf-is-sayi is-hidden' }) : null]))),
      el('div', { id: 'pfLabBaslik', class: `pf-lab-baslik${labMi(aktifAlt) ? '' : ' is-hidden'}` }, [
        el('p', { class: 'hint hint-sm mb-0', text: 'Kendi portföy tasarımını dene, geçmişte nasıl davranırdı ölç. Gerçek hesabına dokunmaz.' })
      ]),
      el('div', { id: 'pfLabSekmeler', class: `pf-alt-sekmeler pf-lab-sekmeler${labMi(aktifAlt) ? '' : ' is-hidden'}`, role: 'tablist', 'aria-label': 'Laboratuvar bölümleri' }, [
        ...LAB_ANA.map(([a, t]) => labSekmeDugmesi(a, t)),
        el('button', { type: 'button', id: 'pfLabIleriDugme', class: `pf-alt-sekme${ileriMi(aktifAlt) ? ' is-active' : ''}`, 'aria-expanded': ileriMi(aktifAlt) ? 'true' : 'false', 'aria-controls': 'pfLabIleri',
          title: 'Strateji karışımı ve Varyasyon (ileri araştırma)', onclick: () => { ileriAcik = !ileriAcik; ileriGoster(ileriAcik || ileriMi(aktifAlt)); } }, [el('span', { text: 'İleri araştırma ▾' })])
      ]),
      el('div', { id: 'pfLabIleri', class: `pf-alt-sekmeler pf-lab-sekmeler${labMi(aktifAlt) && ileriMi(aktifAlt) ? '' : ' is-hidden'}`, role: 'tablist', 'aria-label': 'İleri araştırma' },
        LAB_ILERI.map(([a, t]) => labSekmeDugmesi(a, t))),
      el('div', { id: 'pfUstSerit', class: `pf-ust-serit${labMi(aktifAlt) ? '' : ' is-hidden'}` }, [el('div', { id: 'pfDeneme', class: 'row-inline gap-2' }), el('div', { id: 'pfGuncelleme', class: 'pf-veri-kutu' })]),
      el('div', { id: 'pfIs', class: 'ilerleme-kutu is-hidden', 'aria-live': 'polite' }),
      // F4: eski Portföyüm sayfası gizli (Pano yerine geçti); portfoyum.js Hesaplar'ı bu kapla birlikte kurar.
      el('div', { id: 'pfBolum-portfoyum', class: 'is-hidden' }, [el('div', { id: 'pfPortfoyumKok' })]),
      ...[...PANO_SAYFA].map(a => el('div', { id: 'pfBolum-' + a, class: aktifAlt === a ? '' : 'is-hidden' }, [el('div', { id: 'pfYeni-' + a })])),
      el('div', { id: 'pfModelSecici', class: `p-secici mb-3${modelMi(aktifAlt) ? '' : ' is-hidden'}`, role: 'group', 'aria-label': 'Model' },
        Object.keys(MODEL_SEKME).map(a => el('button', { type: 'button', 'data-model': a, 'aria-pressed': a === aktifAlt ? 'true' : 'false', text: (UST.find(x => x[0] === a) || [a, a])[1], onclick: () => altSekme(a) }))),
      el('div', { id: 'pfBolum-rapor', class: aktifAlt === 'rapor' ? '' : 'is-hidden' }, [el('div', { id: 'pfRaporKok' })]),
      el('div', { id: 'pfBolum-islem-defteri', class: aktifAlt === 'islem-defteri' ? '' : 'is-hidden' }, [el('div', { id: 'pfIslemDefteriKok' })]),
      ...Object.entries(MODEL_SEKME).map(([a, id]) => el('div', { id: 'pfBolum-' + a, class: aktifAlt === a ? '' : 'is-hidden' }, [el('div', { id: 'pfModel-' + id })])),
      // Modellerin ortak alt kısmı: Ayarlar (sermaye, kesirli…) + ayrıntılı izleme — yalnız model sekmelerinde görünür
      el('div', { id: 'pfModelOrtak', class: modelMi(aktifAlt) ? '' : 'is-hidden' }, [el('div', { id: 'pfBuAyKok' }), el('div', { id: 'pfModellerKok' })]),
      el('div', { id: 'pfBolum-hesaplar', class: aktifAlt === 'hesaplar' ? '' : 'is-hidden' }, [el('div', { id: 'pfKayitKok' })]),
      el('div', { id: 'pfBolum-tasarimci', class: aktifAlt === 'tasarimci' ? '' : 'is-hidden' }, [el('div', { id: 'pfTasarimciKok' })]),
      el('div', { id: 'pfBolum-kurucu', class: `pf-kurucu-duzen${aktifAlt === 'kurucu' ? '' : ' is-hidden'}` }, [katalogBolumu(), kurucuBolumu()]),
      el('div', { id: 'pfBolum-sonuc', class: 'glass-panel panel-pad is-hidden' }, [el('div', { id: 'pfSonuc' })]),
      el('div', { id: 'pfBolum-varyasyon', class: 'is-hidden' }, [varyasyonBolumu()]),
      el('div', { id: 'pfBolum-karsilastir', class: 'is-hidden' }, [karsilastirBolumu()])
    ]);
    kurucuCiz();
    sonucCiz(null);
    denemeCiz(null);
    return true;
  }

  /** İlk açılışta veri isteyen parçalar (katalog, sayaç, güncelleme durumu). */
  function ac() {
    if (!bul('pfKok')) return;
    if (!bul('pfBolum-kurucu')) iskelet();
    if (!acildi) { acildi = true; katalogYukle(); guncellemeYukle(); }
    denemeYukle();
    sayfaYukle(aktifAlt);
    if (aktifAlt === 'sonuc' && sonSonuc) grafikleriCiz();
  }

  function baslat() {
    const t = taslakOku();
    if (t) D = t;
    if (!iskelet()) return;
    // Portföy ekranı menüden/URL'den açılınca (js/core/rota.js → ag:rota); Veri ekranı veri kartını kullanır.
    doc.addEventListener('ag:rota', (e) => {
      const b = e.detail && e.detail.bolum;
      if (b === 'tab-portfoy') {
        // B-20: #/portfoy/<alt> → o alt sekme (bilinmeyen alt sessizce yok sayılır); alt yoksa son açılan kalır, adres tamamlanır.
        rotaAlt(e.detail && e.detail.alt);
        ac();
      }
      if (b === 'tab-veri') { guncellemeYukle(); dikkatKaynakYukle(); }
    });
    const panel = bul('tab-portfoy');
    if (panel && panel.classList && panel.classList.contains('active')) ac();
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:tema', () => { if (sonSonuc && aktifAlt === 'sonuc') grafikleriCiz(); });
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat);
    else baslat();
  }

  const sayfa = {
    baslat, ac, altSekme, rotaAlt, _bekle: bekle, aktifAlt: () => aktifAlt, LAB, LAB_ANA, LAB_ILERI, ileriGoster,
    // test ve dış kullanım için
    tanimKur, tanimdanDurum, agirlikDenetim, varsayilanTaslak, rozetler, isiSinifi, yenidenTabanla,
    katalogCiz, katalogYukle, dikkatKaynakCiz, trGun, dkKaybolur, sonucCiz, varyasyonCiz, kararlarCiz, kararlarYukle, karsilastirCiz, portfoylerCiz,
    simuleEt, varyasyonKos, varlikEkle, varlikHazirla, serbestSembolEkle, gecmisteDene, varyasyonuYukle, tanimYukle, karsilastir,
    durum: () => D, durumYaz: (d) => { D = d; kurucuCiz(); },
    secilenler
  };
  AG.pages = AG.pages || {};
  AG.pages.portfoy = sayfa;
  if (typeof module !== 'undefined' && module.exports) module.exports = sayfa;
})(typeof window !== 'undefined' ? window : globalThis);
