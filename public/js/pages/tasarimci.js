/**
 * PORTFÖY TASARIMCISI — Portföy › Tasarımcı ve Portföy › Bu ay (F3, PLAN-PORTFOY-TASARIMCI.md (c) C1–C4 + C5 salt okunur).
 * ═══════════════════════════════════════════════════════════════════════════
 * TASARIMCI (#pfTasarimciKok):
 *   · sabit uyarı bandı (GET /api/tasarimci/durum → uyari) — "ileri dönem kısa, H1 sonradan"
 *   · üç aktif model özeti (t1-s1.json: 837, Nasdaq M10, BIST M10) — GET /katalog + /modeller
 *   · karar takvimi şeridi (durum.sonrakiKararlar: NYSE/BIST ay son işlem günü → ertesi açılış; 837 ay sonu dengeleme)
 *   · strateji kataloğu (C1, lib/tasarimci/katalog.js: künye PLAN SONUÇ'tan birebir, kabul durumu, rozet, kırılganlık)
 *   · tasarım kurucu (C2): kollar + ağırlık + şablon + dengeleme (837 şablonu = izlenen sürüm 2 kuralı, bant ±10 her işlem günü;
 *     B-01) + Hücum serisi senaryosu (B-03); kabul edilmiş şablonun dışı "ölçülmemiş birleşim — simülasyon, kabul değil".
 *     "dene + kaydet" (Ö11): Kaydet (taslak) · İzlemeye al… · Yeni sürüm… · Durdur… → POST /api/tasarimci/tasarim (önizleme →
 *     imza ile onay; yalnız eklenen tasarimlar.jsonl). Kendi tasarımlar ölçülmemiş — izlenir, emir listesi YOK, deneme
 *     sayacına girmez, en çok 3 (Ö14). Model izleme'deki bölüm: AG.tasarimciKendi.modelIzlemeCiz(kap).
 *   · hedef dağılım halkası (C3, kol / varlık düzeyi; varlık = M10 kollarının bu ayki 10 hissesi)
 *   · risk özeti (C4): Laboratuvar'ın iş kuyruğu (POST /api/portfoy/simule, oturum "tasarimci" → GET /api/portfoy/is/:id,
 *     motor.simule) — birleşik eğri + düşüş (AG.grafik), CAGR / MaxDD / Sharpe, korelasyon çiftleri, stres dönemleri,
 *     bootstrap MaxDD; DÖNEM ETİKETİ AÇIK (tüm kolların verisinin olduğu ortak dönem; ölçülmüş künyeyle birebir değil).
 * BU AY (#pfBuAyKok): GET /oneri + /model/m-837/kararlar — karar günü, uygulama günü, Nasdaq M10 ve BIST M10 listeleri,
 *   eksik veri uyarıları, 837'nin bant (±10 puan, t1-s2) dengeleme bilgisi; F4 (61.0): GET /emirler → gerçek portföy emir
 *   tablosu (hesap, sembol, yön, adet, tahmini fiyat, tutar, neden; 837 aktarım satırı; tam adetten kalan sapma), "Uyguladım"
 *   formu (satırlar önceden dolu, adet/fiyat/ücret/tarih düzenlenir; önizleme → onay = tek atomik Portföyüm paketi), "Bu ay
 *   atla", "Geri al" (ters kayıt), model sermayesi formu, "Portföyüm hedefini güncelle"; Portföyüm boşsa açılış rehberi.
 *
 * Kurallar (scripts/panel-tasarimci-testi.js + panel-denetim.js): DOM yalnız `AG.dom`, istek yalnız `AG.api`
 * (tasarimci + portfoy.simule/is), inline stil yok, görünürlük `.is-hidden`, tablolar `AG.tablo` (telefonda kart),
 * grafik `AG.grafik` (renk tokenlardan). Yazma düğmeleri `.ts-yazma` (telefon kademesinde CSS gizler, sunucu 403 verir).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const { el, doldur, bul } = AG.dom;
  const T = () => AG.api.tasarimci;
  /** 72.0: görünen bot/model adı kimlikten (AG.botAd); sunucu metni eski adla gelebilir → cevir. */
  const cv = s => (AG.botAd ? AG.botAd.cevir(s) : s);
  const sablonAdi = (id, ad) => (id && AG.botAd && AG.botAd.kimlik(id) ? AG.botAd.tam(id) : null) || cv(ad);
  const modelAdi = (m) => (m && AG.botAd && AG.botAd.ad(m.id)) || cv(m && m.ad);

  // ═══ BİÇİM ══════════════════════════════════════════════════════════════
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const virgul = (s) => String(s).replace('.', ',');
  /** Yüzde PUAN (katalog künyesi: 15.4 → "%15,4", −4.1 → "−%4,1"). */
  const puan = (x, b = 1) => (sayiMi(x) ? `${x < 0 ? '−' : ''}%${virgul(Math.abs(x).toFixed(b))}` : '—');
  /** Oran (0.154 → "%15,4"). */
  const yz = (x, b = 1) => (sayiMi(x) ? `${x < 0 ? '−' : ''}%${virgul(Math.abs(x * 100).toFixed(b))}` : '—');
  const isaretli = (x, b = 1) => (sayiMi(x) ? `${x > 0 ? '+' : ''}${yz(x, b)}` : '—');
  const sy = (x, b = 2) => (sayiMi(x) ? virgul(x.toFixed(b)) : '—');
  const ton = (x) => (!sayiMi(x) ? 'tone-muted' : x > 0 ? 'tone-success' : x < 0 ? 'tone-danger' : 'tone-muted');
  const AY_AD = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const gunMetni = (g) => { if (!g || !/^\d{4}-\d{2}-\d{2}/.test(g)) return '—'; const [y, a, d] = g.slice(0, 10).split('-').map(Number); return `${d} ${AY_AD[a - 1]} ${y}`; };
  const ayMetni = (ay) => { if (!ay) return '—'; const [y, a] = ay.split('-').map(Number); return `${AY_AD[a - 1]} ${y}`; };
  const bugunStr = () => new Date().toISOString().slice(0, 10);
  const yardim = (k) => (AG.sozluk ? AG.sozluk.yardim(k) : null);
  const bildir = (m, t) => AG.bildir(m, t || 'bilgi');

  const KABUL = {
    h1: ['KABUL (H1 — sonradan konmuş ölçüt)', 'pf-rozet-uyari'], kabul: ['KABUL (ön kayıtla)', 'pf-rozet-iyi'], kullanici: ['KABUL — −%35 eşiği kullanıcı kararı (deneme 444), katı Holm\'da geçmez', 'pf-rozet-uyari'], kirilgan: ['KABUL — kırılgan', 'pf-rozet-uyari'],
    red: ['RED', 'pf-rozet-tehlike'], olcum: ['ölçüm / bileşen', 'pf-rozet-bilgi'], kiyas: ['kıyas yapı taşı', 'pf-rozet-bilgi']
  };
  const ROZET = {
    elle: ['elle — aracı kurumda siz girersiniz', 'pf-rozet-bilgi'], 'otomatik-demo': ['otomatik — demo bot', 'pf-rozet-iyi'], uygulanamaz: ['uygulanamaz — yalnız izleme', 'pf-rozet-tehlike']
  };
  const SIKLIK = [['aylik', 'Aylık (ay sonu tam)'], ['bant-gunluk-10', 'Bant ±10 puan (her işlem günü)'], ['ceyrek', 'Çeyreklik'], ['yillik', 'Yıllık'], ['yok', 'Dengeleme yok']];
  /** Kurucu dengeleme anahtarı → Laboratuvar motoru tanımı (lib/tasarimci/katalog.js DENGELEME_TANIM ile aynı; test eşitliği denetler). */
  const DENGE_TANIM = { aylik: { siklik: 'aylik', bant: 0 }, ceyrek: { siklik: 'ceyrek', bant: 0 }, yillik: { siklik: 'yillik', bant: 0 }, yok: { siklik: 'yok', bant: 0 },
    'bant-gunluk-10': { siklik: 'bant', bant: 0.10, denetim: 'gunluk' } };
  const siklikAd = (d) => { const x = SIKLIK.find(y => y[0] === d); return x ? x[1] : String(d || '—'); };
  /** Hücum/Denge serisi senaryoları (Laboratuvar motoru stratejiSenaryosu; B-03). */
  const SENARYO = [['olculen', 'Ölçülen (iyimser)'], ['yari', 'Fazla getirisi yarıya'], ['btc', 'BTC al-tut (kötümser)']];
  const senaryoAd = (k) => { const x = SENARYO.find(y => y[0] === k); return x ? x[1] : k; };
  const SENARYOLU = new Set(['hucum', 'denge']);
  const TASARIM_DURUM = { taslak: ['taslak — izlenmiyor', 'pf-rozet-bilgi'], izleniyor: ['izleniyor', 'pf-rozet-iyi'], durduruldu: ['durduruldu', 'pf-rozet-uyari'] };
  const SUZGEC = [['model', 'İzlenen modeller'], ['katalog', 'Yalnız katalog'], ['kiyas', 'Kıyaslar'], ['red', 'RED adaylar'], ['hepsi', 'Tümü']];
  const MODEL_SIRA = ['m-837', 'm-qqq-m10', 'm-bist-m10'];
  const VARSAYILAN_SABLON = 't-837';
  const KURUCU_ANAHTAR = 'ag.tasarimci.kurucu';
  const OTURUM = 'tasarimci';

  // ═══ DURUM ══════════════════════════════════════════════════════════════
  let K = null;       // /katalog
  let M = null;       // /modeller
  let DU = null;      // /durum
  let O = null;       // /oneri
  let D837 = null;    // /model/m-837/kararlar
  let suzgec = 'model';
  let duzey = 'kol';
  let kurucu = null;  // { kollar: [{ strateji, agirlik(%) }], dengeleme, senaryo?, kayitId?, ad? }
  let TL = null;      // GET /tasarimlar (kendi tasarımlarım)
  let sonRisk = null;
  let yukleniyor = false;

  function kurucuOku() {
    try { const s = global.localStorage.getItem(KURUCU_ANAHTAR); if (!s) return null; const j = JSON.parse(s); return j && Array.isArray(j.kollar) ? j : null; } catch (e) { return null; }
  }
  function kurucuYaz() { try { global.localStorage.setItem(KURUCU_ANAHTAR, JSON.stringify(kurucu)); } catch (e) { /* depolama yok: yalnız hatırlanmaz */ } }
  const sablonBul = (id) => ((K && K.sablonlar) || []).find(s => s.id === id) || null;
  function sablonUygula(id) {
    const s = sablonBul(id);
    if (!s) return;
    kurucu = { kollar: s.kollar.map(k => ({ strateji: k.strateji, agirlik: k.agirlik })), dengeleme: s.dengeleme, senaryo: (kurucu && kurucu.senaryo) || 'olculen' };
    kurucuYaz(); kurucuCiz();
  }

  // ═══ SAF MODELLER (test edilir) ══════════════════════════════════════════
  /** lib/tasarimci/katalog.js etiketle ile AYNI kural: kollar + ağırlık (± 0,5 puan, oransal) + dengeleme bir şablonla aynı mı. */
  function etiketle(kollar, dengeleme, sablonlar) {
    const k = (kollar || []).filter(x => x && x.strateji && Number(x.agirlik) > 0);
    const top = k.reduce((a, x) => a + Number(x.agirlik), 0);
    const et = (K && K.etiketler) || { sablon: 'kabul edilmiş şablon', olculmemis: 'ölçülmemiş birleşim — simülasyon, kabul değil' };
    for (const s of sablonlar || []) {
      if (s.dengeleme !== dengeleme || s.kollar.length !== k.length || !(top > 0)) continue;
      const ayni = s.kollar.every(sk => { const x = k.find(y => y.strateji === sk.strateji); return x && Math.abs(Number(x.agirlik) * 100 / top - sk.agirlik) <= 0.5; });
      if (ayni) return { sablon: s.id, etiket: et.sablon, kabul: true, katalog: s.katalog, ad: s.ad };
    }
    return { sablon: null, etiket: et.olculmemis, kabul: false, katalog: null, ad: null };
  }

  /** Kurucu → Laboratuvar motor tanımı (motor.simule). Aynı Laboratuvar kimliğine düşen kollar birleşir. */
  function tanimKur(kr, kollarTanim) {
    const harita = new Map((kollarTanim || []).map(k => [k.strateji, k]));
    const w = new Map();
    for (const k of (kr && kr.kollar) || []) {
      const a = Number(k.agirlik), t = harita.get(k.strateji);
      if (!t || !(a > 0)) continue;
      w.set(t.labKimlik, (w.get(t.labKimlik) || 0) + a / 100);
    }
    const st = new Set(((kr && kr.kollar) || []).map(k => k.strateji));
    const kiyaslar = [];
    if (['qqq-altut', 'qqq-m10'].some(x => st.has(x))) kiyaslar.push('yahoo:QQQ');
    if (['hucum', 'denge', 'kalkan', 'btc-altut'].some(x => st.has(x)) && !w.has('strateji:btc-altut')) kiyaslar.push('strateji:btc-altut');
    if (['bist-m10', 'xu030-altut'].some(x => st.has(x)) && !w.has('yahoo:XU100.IS')) kiyaslar.push('yahoo:XU100.IS');
    if (!kiyaslar.length) kiyaslar.push('yahoo:QQQ');
    return {
      varliklar: [...w].map(([kimlik, agirlik]) => ({ kimlik, agirlik })), yontem: 'elle', kip: 'gecmis', birim: 'USD', eksikVeri: 'kirp',
      dengeleme: { ...(DENGE_TANIM[(kr && kr.dengeleme) || 'aylik'] || DENGE_TANIM.aylik) }, maliyet: { islem: 0.0005, hesaplarArasi: 0.001 }, nakitGetirisi: 'yok', kiyaslar,
      stratejiSenaryosu: (kr && SENARYO.some(x => x[0] === kr.senaryo)) ? kr.senaryo : 'olculen'
    };
  }

  /** Kurucu → halka dilimleri. düzey 'varlik': M10 kolları bu ayın listesine açılır (kol ağırlığı / 10). ≤ 7 dilim + "Diğer". */
  function dilimler(kr, dz, oneri, kollarTanim) {
    const ad = (s) => { const t = (kollarTanim || []).find(k => k.strateji === s); return t ? cv(t.ad) : s; };
    const liste = (mid) => { const m = ((oneri && oneri.modeller) || []).find(x => x.id === mid); return m && m.hedef && m.hedef.length ? m.hedef : null; };
    const top = ((kr && kr.kollar) || []).reduce((a, k) => a + (Number(k.agirlik) > 0 ? Number(k.agirlik) : 0), 0) || 1;
    const l = [];
    for (const k of (kr && kr.kollar) || []) {
      const w = Number(k.agirlik) > 0 ? Number(k.agirlik) / top : 0;
      if (!w) continue;
      const hed = dz === 'varlik' ? (k.strateji === 'qqq-m10' ? liste('m-qqq-m10') : k.strateji === 'bist-m10' ? liste('m-bist-m10') : null) : null;
      if (hed) for (const h of hed) l.push({ kimlik: `${k.strateji}:${h.s}`, ad: h.s, hedef: w * h.agirlik, gercek: w * h.agirlik });
      else l.push({ kimlik: k.strateji, ad: ad(k.strateji), hedef: w, gercek: w });
    }
    const birlesik = [];
    for (const d of l) { const x = birlesik.find(y => y.kimlik === d.kimlik); if (x) { x.hedef += d.hedef; x.gercek += d.gercek; } else birlesik.push({ ...d }); }
    birlesik.sort((a, b) => b.hedef - a.hedef);
    if (birlesik.length <= 7) return birlesik;
    const ust = birlesik.slice(0, 6), alt = birlesik.slice(6);
    ust.push({ kimlik: 'diger', ad: `Diğer (${alt.length})`, hedef: alt.reduce((a, d) => a + d.hedef, 0), gercek: alt.reduce((a, d) => a + d.gercek, 0) });
    return ust;
  }

  /** Karar takvimi: NYSE + BIST ay sonu kararları aynı ayda birleşir; 837 (takvim günü) ay son günü dengelenir. */
  function takvimModel(sonraki) {
    const aylar = new Map();
    for (const borsa of ['NYSE', 'BIST']) for (const x of ((sonraki && sonraki[borsa]) || [])) {
      const a = aylar.get(x.ay) || { ay: x.ay, kararlar: [] };
      a.kararlar.push({ borsa, karar: x.karar, uygulama: x.uygulama });
      aylar.set(x.ay, a);
    }
    return [...aylar.values()].sort((a, b) => (a.ay < b.ay ? -1 : 1)).map(a => {
      const [y, m] = a.ay.split('-').map(Number);
      const sonGun = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      return { ...a, dengeleme837: sonGun };
    });
  }

  // ═══ YARDIMCI DOM ═══════════════════════════════════════════════════════
  const rozet = ([metin, sinif], title) => el('span', { class: `pf-rozet ${sinif}`, text: metin, title: title || null });
  const baslik = (metin, ek) => el('h3', { class: 'pf-bolum-baslik' }, [el('span', { text: metin }), ek || null]);
  const dugme = (metin, onclick, sinif, ek) => el('button', { type: 'button', class: `btn ${sinif || 'btn-secondary btn-sm'}`, onclick, ...(ek || {}) }, [el('span', { text: metin })]);
  const sayisal = (b) => /^[−+%$-]?[\d%]/.test(String(b));
  const kv = (ciftler) => el('dl', { class: 'kv-list kv-sik mb-0' }, ciftler.filter(Boolean).flatMap(([a, b, sinif, yk]) => [yk ? el('dt', null, [el('span', { text: a }), yardim(yk)]) : el('dt', { text: a }), el('dd', { class: `${sayisal(b) ? 'sayi ' : ''}${sinif || ''}`.trim() || null, text: b })]));
  const KIYAS_AD = { 'yahoo:QQQ': 'QQQ al-tut', 'strateji:btc-altut': 'BTC al-tut', 'yahoo:XU100.IS': 'XU100 (BIST vekili, USD)', '60/40': '60/40 QQQ/IEF' };
  const kiyasAd = (x) => KIYAS_AD[x] || x;
  const KOL_AD = { cekirdek: 'QQQ al-tut (çekirdek)', uydu: 'Kairos (uydu)' };
  const kolAdi = (s) => { if (KOL_AD[s]) return KOL_AD[s]; const t = ((K && K.kollar) || []).find(k => k.strateji === s); return t ? cv(t.ad) : s; };
  const stresMetni = (x) => (x && sayiMi(x.getiri) ? `${yz(x.getiri)} (DD ${yz(x.maxDD, 0)})` : 'dönem dışı');
  const kutu = (etiket, deger, alt, sinif, yardimK) => el('div', { class: 'sunken' }, [
    el('div', { class: 'metric-label' }, [el('span', { text: etiket }), yardimK ? yardim(yardimK) : null]),
    el('div', { class: `metric-value sayi${sinif ? ' ' + sinif : ''}`, text: deger }),
    alt ? el('div', { class: 'hint hint-sm mb-0', text: alt }) : null
  ]);
  const tablo = (basliklar, satirlar, id) => AG.tablo.kutulu({ id: id || null, basliklar, satirlar, sinif: 'table-dense pf-tablo' });
  const hucre = (metin, sinif, title) => el('td', { class: sinif || null, text: metin, title: title || null });
  /** Sabit uyarı bandı — her tasarımcı ekranının başında (PLAN (b) "ekranda sabit uyarı"). */
  function uyariBandi(metin) {
    return el('div', { class: 'ts-uyari-bandi', role: 'note' }, [
      el('i', { 'data-lucide': 'alert-triangle', class: 'icon-16' }),
      el('span', { text: metin || 'İleri dönem kısa; kabuller sonradan konmuş ölçütle (H1) verildi; en az 12–24 ay görmeden yorum yok.' })
    ]);
  }
  /** Telefon kademesinde yazma düğmelerinin yerine görünen not (CSS: yalnız body.kademe-telefon'da görünür). */
  const telefonNotu = (metin) => el('p', { class: 'ts-telefon-not hint hint-sm mb-0', text: metin || 'Bu işlem yalnız sunucudaki panelden yapılır (telefon yalnız izler).' });
  const ikonla = () => { if (global.lucide && global.lucide.createIcons) global.lucide.createIcons(); };

  // ═══ 1. ÜÇ AKTİF MODEL ══════════════════════════════════════════════════
  function modelKarti(km, mm) {
    const met = mm && mm.metrik;
    const basladi = met && met.gun > 0;
    const sk = mm && mm.sonKarar;
    const kat = ((K && K.stratejiler) || []).find(s => s.model === km.id);
    return el('article', { class: 'ts-kart ts-model-kart', 'data-model': km.id }, [
      el('div', { class: 'ts-kart-ust' }, [el('strong', { class: 'ts-kart-ad', text: (AG.botAd && AG.botAd.tam(km.id)) || cv(km.ad) }), rozet(KABUL[kat ? kat.kabul : 'h1'] || KABUL.h1, km.kabul)]),
      el('p', { class: 'hint hint-sm mb-2', text: `Kaynak deneme ${km.kaynakDeneme} · ${km.kollar.map(k => `${kolAdi(k.strateji)} %${Math.round(k.agirlik * 100)}`).join(' + ')}` }),
      basladi ? kv([['Endeks (100 taban)', sy(met.son, 2)], ['Başlangıçtan', isaretli(met.toplam), ton(met.toplam)], ['En büyük düşüş', yz(met.maxDD)], ['Son gün', met.bit || '—']])
        : el('p', { class: 'hint mb-2', text: `Henüz başlamadı — ilk uygulama günü ${gunMetni(km.baslangic && km.baslangic.ilkUygulamaGunu)} (karar ${gunMetni(km.baslangic && km.baslangic.ilkKararGunu)}).` }),
      sk && sk.liste && sk.liste.length ? el('div', { class: 'ts-liste mt-2' }, [el('span', { class: 'hint hint-sm mb-0', text: `Son karar ${sk.kararGunu}: ` }), ...sk.liste.map(s => el('span', { class: 'ts-hisse', text: s }))]) : null,
      mm && mm.tutar ? el('p', { class: 'hint hint-sm mt-2 mb-0 pm-tutar', text: `Tutar: ${Math.round(mm.tutar.guncel).toLocaleString('tr-TR')} ${mm.tutar.para} (başlangıç ${Math.round(mm.tutar.baslangic).toLocaleString('tr-TR')}) — yalnız bu bilgisayarda` }) : null
    ]);
  }
  function modellerCiz() {
    const k = bul('tsModeller');
    if (!k) return;
    if (!K || !K.modeller) { doldur(k, [baslik('Model portföyler'), el('p', { class: 'hint mb-0', text: 'Model kataloğu yüklenemedi.' })]); return; }
    const mm = new Map(((M && M.modeller) || []).map(m => [m.id, m]));
    doldur(k, [
      baslik('Takip edilen üç model portföy', yardim('modelPortfoy')),
      el('p', { class: 'hint hint-sm mb-3', text: `Sabitleme ${K.tarih} (sürüm ${K.surum}): kurallar ilk ileri günden önce dondu; kararlar ay sonunda otomatik alınır, model sanal olarak uygulanır. Ayrıntı: Model izleme.` }),
      el('div', { class: 'ts-izgara' }, MODEL_SIRA.map(id => K.modeller.find(m => m.id === id)).filter(Boolean).map(km => modelKarti(km, mm.get(km.id))))
    ]);
  }

  // ═══ 2. KARAR TAKVİMİ ŞERİDİ ═════════════════════════════════════════════
  function takvimCiz() {
    const k = bul('tsTakvim');
    if (!k) return;
    const l = takvimModel(DU && DU.sonrakiKararlar);
    doldur(k, [
      baslik('Karar takvimi', yardim('kararGunu')),
      !l.length ? el('p', { class: 'hint mb-0', text: 'Takvim alınamadı.' }) : el('ol', { class: 'ts-takvim' }, l.map((a, i) => el('li', { class: `ts-takvim-ay${i === 0 ? ' is-active' : ''}` }, [
        el('strong', { text: ayMetni(a.ay) }),
        ...a.kararlar.map(x => el('span', { class: 'hint hint-sm mb-0', text: `${x.borsa === 'NYSE' ? 'Nova' : 'Lydia'}: karar ${gunMetni(x.karar)} kapanışı → uygulama ${gunMetni(x.uygulama)} açılışı` })),
        el('span', { class: 'hint hint-sm mb-0', text: 'Simurg: her QQQ işlem günü kapanışında bant denetimi (Kairos %40–%60 dışına çıkarsa tam 50/50)' })
      ]))),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Karar = ayın son işlem günü kapanışı (NYSE / BIST takvimi, tatiller dahil); uygulama = ertesi işlem günü açılışı. Türkiye saatiyle ABD kararı gece, emir ertesi gün 17:30 (1 Kasım 2026 – 14 Mart 2027 kış saati), sonra 16:30 sonra.' })
    ]);
  }

  // ═══ 3. STRATEJİ KATALOĞU (C1) ═══════════════════════════════════════════
  function suzgecUygun(s, z) {
    if (z === 'hepsi') return true;
    if (z === 'model') return !!s.model;
    if (z === 'kiyas') return s.tur === 'kiyas';
    if (z === 'red') return s.kabul === 'red';
    return s.tur === 'strateji' && !s.model && s.kabul !== 'red';
  }
  function kunyeSatirlari(ku) {
    return [
      ku.gel != null ? ['Geliştirme CAGR', puan(ku.gel), null, 'cagr'] : null,
      ku.hol != null ? ['Holdout CAGR', puan(ku.hol), null, 'holdout'] : null,
      ku.tum != null ? ['Tüm dönem CAGR', puan(ku.tum), null, 'cagr'] : null,
      ku.maxDD != null ? ['En büyük düşüş', puan(ku.maxDD), null, 'maxdd'] : null,
      ku.p != null ? ['P(kıyastan iyi)', sy(ku.p, 2), null, 'pKiyas'] : null
    ];
  }
  function kiyasMetni(kx) {
    if (!kx) return null;
    const p = [kx.gel != null ? `gel ${puan(kx.gel)}` : null, kx.hol != null ? `hol ${puan(kx.hol)}` : null, kx.tum != null ? `tüm ${puan(kx.tum)}` : null, kx.maxDD != null ? `DD ${puan(kx.maxDD)}` : null].filter(Boolean);
    return `Kıyas — ${cv(kx.ad)}: ${p.join(' · ')}`;
  }
  /** Kıyas adındaki kısaltmanın sözlük anahtarı (XU030, EW BIST30, QQQ, BTC al-tut). */
  const kiyasYardimK = (ad) => (/EW[ -]?BIST/i.test(ad || '') ? 'ewBist30' : /XU030/.test(ad || '') ? 'xu030' : /XU100/.test(ad || '') ? 'xu100' : /QQQ/.test(ad || '') ? 'qqq' : null);
  function stratejiKarti(s) {
    const kol = ((K && K.kollar) || []).find(k => k.strateji === s.id);
    const hedef = s.model ? ((O && O.modeller) || []).find(m => m.id === s.model) : null;
    const taze = DU && DU.tazelik ? DU.tazelik : null;
    return el('article', { class: `ts-kart${s.kabul === 'red' ? ' ts-kart-red' : ''}`, 'data-strateji': s.id }, [
      el('div', { class: 'ts-kart-ust' }, [
        el('strong', { class: 'ts-kart-ad', text: (s.model && AG.botAd && AG.botAd.tam(s.model)) || cv(s.ad) }),
        s.tur === 'kiyas' && kiyasYardimK(s.ad) ? yardim(kiyasYardimK(s.ad)) : null,
        rozet(KABUL[s.kabul] || KABUL.olcum),
        ...(s.rozetler || []).map(r => rozet(ROZET[r] || [r, 'pf-rozet-bilgi']))
      ]),
      el('p', { class: 'ts-aciklama mb-2', text: cv(s.aciklama) }),
      kv(kunyeSatirlari(s.kunye || {})),
      el('p', { class: 'hint hint-sm mt-2 mb-1', text: s.kunye && s.kunye.donem ? `Dönem: ${s.kunye.donem}` : '' }),
      s.kiyas ? el('p', { class: 'hint hint-sm mb-1' }, [el('span', { text: kiyasMetni(s.kiyas) }), kiyasYardimK(s.kiyas.ad) ? yardim(kiyasYardimK(s.kiyas.ad)) : null]) : null,
      el('p', { class: 'hint hint-sm mb-1', text: `${s.plan}${s.deneme ? ` · deneme ${s.deneme}` : ''}${s.kaynakKayit ? ` · künye: ${s.kaynakKayit}` : ''} · hesap: ${s.hesap} · dengeleme: ${s.dengeleme}` }),
      s.labNot ? el('p', { class: 'hint hint-sm mb-1 tone-warning', text: s.labNot }) : null,
      s.model && taze ? el('p', { class: `hint hint-sm mb-1 ${taze.bayat ? 'tone-warning' : ''}`.trim(), text: taze.bayat ? 'Veri bayat: son işlem günü eksik (Veri ekranı).' : `Veri güncel (${(taze.satirlar || []).map(x => x.sonGun).filter(Boolean).sort().pop() || '—'}).` }) : null,
      hedef && hedef.hedef && hedef.hedef.length ? el('p', { class: 'hint hint-sm mb-1', text: `Bu ayın hedefi (${hedef.karar ? hedef.karar.kararGunu : '—'}): ${hedef.hedef.map(h => `${h.kol ? kolAdi(h.kol) : h.s} ${yz(h.agirlik, 0)}`).join(', ')}` }) : null,
      s.kirilganlik && s.kirilganlik.length ? el('details', { class: 'ts-kirilgan' }, [
        el('summary', { text: `Kırılganlık ve uyarılar (${s.kirilganlik.length})` }),
        el('ul', { class: 'pf-uyari-liste' }, s.kirilganlik.map(m => el('li', { class: 'pf-uyari pf-uyari-uyari', text: m })))
      ]) : null,
      kol ? el('div', { class: 'pf-dugmeler mt-2' }, [dugme('Kurucuya ekle', () => kolEkle(s.id), 'btn-secondary btn-xs')]) : null
    ]);
  }
  function katalogCiz() {
    const k = bul('tsKatalog');
    if (!k) return;
    const l = ((K && K.stratejiler) || []).filter(s => suzgecUygun(s, suzgec));
    doldur(k, [
      baslik('Strateji kataloğu', yardim('h1')),
      el('p', { class: 'hint hint-sm mb-2', text: 'Rakamlar ölçülmez; PLAN belgelerinin SONUÇ tablolarından birebir (yüzde, USD). Kabul durumu ve kırılganlık her kartta. "Elle": emri aracı kurumda siz girersiniz; "otomatik — demo": bot kendi emrini verir (demo hesap); "uygulanamaz": yalnız bilgi.' }),
      el('div', { class: 'pf-alt-sekmeler ts-suzgec', role: 'tablist', 'aria-label': 'Katalog süzgeci' }, SUZGEC.map(([z, t]) => el('button', {
        type: 'button', id: 'tsSuzgec-' + z, class: `pf-alt-sekme${z === suzgec ? ' is-active' : ''}`, role: 'tab', 'aria-selected': z === suzgec ? 'true' : 'false', text: `${t} (${((K && K.stratejiler) || []).filter(s => suzgecUygun(s, z)).length})`,
        onclick: () => { suzgec = z; katalogCiz(); ikonla(); }
      }))),
      !l.length ? el('p', { class: 'hint mb-0', text: 'Bu süzgeçte kayıt yok.' }) : el('div', { class: 'ts-izgara' }, l.map(stratejiKarti))
    ]);
  }

  // ═══ 4. TASARIM KURUCU (C2) + HALKA (C3) ═════════════════════════════════
  function kolEkle(strateji) {
    if (!kurucu) kurucu = { kollar: [], dengeleme: 'aylik' };
    if (kurucu.kollar.some(k => k.strateji === strateji)) { bildir('Bu kol kurucuda zaten var.', 'uyari'); return; }
    kurucu.kollar.push({ strateji, agirlik: 0 });
    kurucuYaz(); kurucuCiz();
    bildir('Kol eklendi: ağırlığını girin.', 'ok');
  }
  function kurucuToplam() { return (kurucu ? kurucu.kollar : []).reduce((a, k) => a + (Number(k.agirlik) > 0 ? Number(k.agirlik) : 0), 0); }
  /** Toplam ≠ 100 iken kullanılacak oranlanmış paylar (B-24): "%54,5 / %45,5". */
  function oranlanmis(kollar) {
    const l = (kollar || []).filter(k => Number(k.agirlik) > 0), top = l.reduce((a, k) => a + Number(k.agirlik), 0);
    return top > 0 ? l.map(k => `%${virgul((Number(k.agirlik) * 100 / top).toFixed(1))}`).join(' / ') : '';
  }
  function toplamMetni(top, kollar) {
    if (Math.abs(top - 100) < 0.01) return `Toplam %${virgul(top.toFixed(0))}`;
    if (!(top > 0)) return 'Toplam %0 — en az bir kola ağırlık verin';
    return `Toplam %${virgul(top.toFixed(0))} — oranlanarak ${oranlanmis(kollar)} kullanılacak`;
  }
  /** Kurucu 837'nin kolları + ağırlıklarıyla ama başka dengelemeyle mi (sürüm 1'in eski aylık kuralı; B-01 (4)). */
  function eski837Mi(kr) {
    const s = sablonBul(VARSAYILAN_SABLON);
    if (!s || !kr || kr.dengeleme === s.dengeleme || kr.dengeleme !== 'aylik') return false;
    return !!etiketle(kr.kollar, s.dengeleme, [s]).kabul;
  }
  const kayitBul = (id) => ((TL && TL.tasarimlar) || []).find(t => t.id === id) || null;
  function kurucuCiz() {
    const k = bul('tsKurucu');
    if (!k || !K) return;
    if (!kurucu) { const s = sablonBul(VARSAYILAN_SABLON); kurucu = s ? { kollar: s.kollar.map(x => ({ ...x })), dengeleme: s.dengeleme, senaryo: 'olculen' } : { kollar: [], dengeleme: 'aylik', senaryo: 'olculen' }; }
    if (!SIKLIK.some(x => x[0] === kurucu.dengeleme)) kurucu.dengeleme = 'aylik';
    const kollarTanim = K.kollar || [];
    const top = kurucuToplam();
    const et = etiketle(kurucu.kollar, kurucu.dengeleme, K.sablonlar);
    const satirlar = kurucu.kollar.map((kol, i) => {
      const sec = el('select', { class: 'control-sm', 'aria-label': 'Kol stratejisi', onchange: (e) => { kurucu.kollar[i].strateji = e.target.value; kurucuYaz(); kurucuCiz(); } },
        kollarTanim.map(t => { const o = el('option', { value: t.strateji, text: cv(t.ad) }); if (t.strateji === kol.strateji) o.selected = true; return o; }));
      sec.value = kol.strateji;
      const ag = el('input', { type: 'number', min: '0', max: '100', step: '1', class: 'control-sm pf-sayi-girdi', 'aria-label': 'Ağırlık %', onchange: (e) => { kurucu.kollar[i].agirlik = Number(e.target.value) || 0; kurucuYaz(); kurucuCiz(); } });
      ag.value = String(kol.agirlik);
      const t = kollarTanim.find(x => x.strateji === kol.strateji);
      return el('tr', null, [el('td', null, [sec]), el('td', null, [ag]), hucre(t ? (t.not ? `${cv(t.ad)} — ${cv(t.not)}` : cv(t.ad)) : '—', 'pf-kucuk', t ? t.labKimlik : null),
        el('td', null, [dugme('Çıkar', () => { kurucu.kollar.splice(i, 1); kurucuYaz(); kurucuCiz(); }, 'btn-secondary btn-xs')])]);
    });
    const dSec = el('select', { id: 'tsDengeleme', class: 'control-sm', 'aria-label': 'Dengeleme', onchange: (e) => { kurucu.dengeleme = e.target.value; kurucuYaz(); kurucuCiz(); } },
      SIKLIK.map(([v, t]) => { const o = el('option', { value: v, text: t }); if (v === kurucu.dengeleme) o.selected = true; return o; }));
    dSec.value = kurucu.dengeleme;
    const senaryoVar = kurucu.kollar.some(x => SENARYOLU.has(x.strateji) && Number(x.agirlik) > 0);
    const sSec = el('select', { id: 'tsSenaryo', class: 'control-sm', 'aria-label': 'Kairos serisi senaryosu', onchange: (e) => { kurucu.senaryo = e.target.value; kurucuYaz(); } },
      SENARYO.map(([v, t]) => { const o = el('option', { value: v, text: t }); if (v === (kurucu.senaryo || 'olculen')) o.selected = true; return o; }));
    sSec.value = kurucu.senaryo || 'olculen';
    const yeni = kollarTanim.find(t => !kurucu.kollar.some(x => x.strateji === t.strateji));
    const kayit = kurucu.kayitId ? kayitBul(kurucu.kayitId) : null;
    const adGirdi = el('input', { id: 'tsTasarimAd', type: 'text', maxlength: '60', class: 'form-control control-sm', placeholder: 'ör. Dengeli deneme', 'aria-label': 'Tasarım adı',
      oninput: (e) => { kurucu.ad = e.target.value; kurucuYaz(); } });
    adGirdi.value = kurucu.ad || (kayit ? kayit.ad : '');
    const kayitDugmeleri = kayit && kayit.durum === 'izleniyor'
      ? [dugme('Yeni sürüm kaydet…', (e) => tasarimIslem('yeni-surum', e.currentTarget), 'btn-primary btn-sm ts-yazma', { id: 'btnTsYeniSurum' }),
        dugme('Ayrı tasarım olarak kaydet', (e) => tasarimIslem('kaydet', e.currentTarget, { yeni: true }), 'btn-secondary btn-sm ts-yazma', { id: 'btnTsAyriKaydet' })]
      : [dugme('Kaydet (taslak)', (e) => tasarimIslem('kaydet', e.currentTarget), 'btn-secondary btn-sm ts-yazma', { id: 'btnTsKaydet' }),
        kayit ? dugme('Ayrı tasarım olarak kaydet', (e) => tasarimIslem('kaydet', e.currentTarget, { yeni: true }), 'btn-secondary btn-sm ts-yazma', { id: 'btnTsAyriKaydet' }) : null];
    doldur(k, [
      baslik('Tasarım kurucu', yardim('cekirdekUydu')),
      el('p', { class: 'hint hint-sm mb-2', text: 'Kolları ve ağırlıkları seçin, "Riski dene" ile geçmişte nasıl davranacağını görün; beğendiğiniz birleşimi kaydedip izlemeye alabilirsiniz. Kendi tasarımınız ölçülmemiştir: izlenir ama emir listesi açılmaz. Takip edilen üç model sabitlemeyle donmuştur — kurucu onları değiştirmez.' }),
      el('div', { class: 'pf-dugmeler mb-3', role: 'group', 'aria-label': 'Şablonlar' }, (K.sablonlar || []).map(s => dugme(sablonAdi(s.id, s.ad), () => sablonUygula(s.id), `btn-xs ${et.sablon === s.id ? 'btn-primary' : 'btn-secondary'}`, { id: 'tsSablon-' + s.id }))),
      tablo(['Kol', 'Ağırlık %', 'Geçmiş serisi', ''], satirlar, 'tblTsKollar'),
      el('div', { class: 'row-between row-wrap gap-3 mt-2' }, [
        el('div', { class: 'row-inline row-wrap gap-2' }, [yeni ? dugme('Kol ekle', () => kolEkle(yeni.strateji), 'btn-secondary btn-xs', { id: 'btnTsKolEkle' }) : null,
          el('label', { class: 'pf-alan' }, [el('span', null, [el('span', { text: 'Dengeleme' }), yardim('bantDengeleme')]), dSec]),
          senaryoVar ? el('label', { class: 'pf-alan' }, [el('span', null, [el('span', { text: 'Kairos serisi' }), yardim('hucumSenaryo')]), sSec]) : null]),
        el('span', { id: 'tsToplam', class: `sayi ${Math.abs(top - 100) < 0.01 ? 'pf-toplam-iyi' : 'pf-toplam-kotu'}`, text: toplamMetni(top, kurucu.kollar) })
      ]),
      el('p', { id: 'tsEtiket', class: `ts-etiket ${et.kabul ? 'ts-etiket-kabul' : 'ts-etiket-olculmemis'}`, text: et.kabul ? `${et.etiket}: ${sablonAdi(et.sablon, et.ad)}` : et.etiket }),
      eski837Mi(kurucu) ? el('p', { id: 'tsEski837', class: 'hint hint-sm tone-warning mb-1', text: 'Simurg\'un ESKİ kuralı (sürüm 1, aylık) — izlenen model sürüm 2\'den beri bant ±10 puan kuralıyla işler. Kabul edilmiş kural için dengelemeyi "Bant ±10 puan (her işlem günü)" seçin.' }) : null,
      el('div', { class: 'pf-dugmeler mt-2' }, [
        dugme('Riski dene', (e) => riskDene(e.currentTarget), 'btn-primary btn-sm ts-yazma', { id: 'btnTsRisk' }),
        telefonNotu('Riski dene ve tasarım kaydı yalnız sunucudaki panelden (telefon yalnız izler).')
      ]),
      el('div', { class: 'ts-kayit-satir ts-yazma mt-3' }, [
        el('label', { class: 'pf-alan' }, [el('span', null, [el('span', { text: 'Tasarım adı' }), yardim('kendiTasarim')]), adGirdi]),
        el('div', { class: 'pf-dugmeler' }, kayitDugmeleri),
        kayit ? el('p', { id: 'tsKayitBagli', class: 'hint hint-sm mb-0', text: `Kurucu kayıtlı tasarıma bağlı: ${kayit.ad} (sürüm ${kayit.surum}, ${(TASARIM_DURUM[kayit.durum] || [kayit.durum])[0]}).${kayit.durum === 'izleniyor' ? ' Değişiklik "Yeni sürüm" olarak kaydedilir ve sonraki karar gününde yürürlüğe girer.' : ''}` }) : null
      ])
    ]);
    halkaCiz();
  }

  // ═══ 4b. KENDİ TASARIMLARIM (Ö11 "dene + kaydet", Ö14) ═════════════════════════
  // POST /api/tasarimci/tasarim: önizleme (imza) → AG.onayla → aynı imzayla yazma; tasarimlar.jsonl'a yalnız eklenir.
  const tasarimGovde = (yeniKayit) => ({ id: yeniKayit ? undefined : (kurucu.kayitId || undefined), ad: (kurucu.ad || '').trim() || undefined,
    kollar: kurucu.kollar.filter(x => Number(x.agirlik) > 0).map(x => ({ strateji: x.strateji, agirlik: Number(x.agirlik) })), dengeleme: kurucu.dengeleme });
  const ISLEM_AD = { kaydet: 'Kaydet (taslak)', 'izlemeye-al': 'İzlemeye al', 'yeni-surum': 'Yeni sürüm', durdur: 'İzlemeyi durdur' };
  async function tasarimIslem(islem, d, ek) {
    const o = ek || {};
    const g = islem === 'kaydet' || islem === 'yeni-surum' ? tasarimGovde(o.yeni) : { id: o.id };
    if ((islem === 'kaydet' || islem === 'yeni-surum') && !g.kollar.length) { bildir('Önce en az bir kola ağırlık verin.', 'uyari'); return null; }
    if (d) AG.dom.mesgul(d, 'Hazırlanıyor…');
    try {
      const on = await T().tasarim({ ...g, islem });
      if (!on || on.success === false) { bildir(`${ISLEM_AD[islem]}: ${(on && on.error) || 'yapılamadı'}`, 'hata'); return null; }
      const sa = on.satir;
      if (islem !== 'kaydet') {
        const metin = [
          islem === 'durdur' ? `"${sa.ad}" izlemesi ${gunMetni(sa.bitis)} itibarıyla durur; geçmiş satırlar silinmez.`
            : `"${sa.ad}" (sürüm ${sa.surum}) ${gunMetni(sa.yururluk)} kapanışında yürürlüğe girer — o güne kadar ${islem === 'yeni-surum' ? 'eski sürümle sürer' : 'seri başlamaz'}.`,
          'Kendi tasarımınız ölçülmemiş birleşimdir — kabul değil: emir listesi açılmaz, deneme sayacına girmez; aynı anda en çok 3 tasarım izlenir.',
          ...(on.uyarilar || []).filter(u => !/^Ölçülmemiş birleşim/.test(u))
        ].join(' ');
        const evet = await AG.onayla({ baslik: ISLEM_AD[islem], metin, onay: islem === 'durdur' ? 'Durdur' : 'Onayla', tehlikeli: islem === 'durdur' });
        if (!evet) return null;
      }
      const r = await T().tasarim({ ...g, islem, yazma: true, imza: on.imza });
      if (!r || r.success === false) { bildir(`${ISLEM_AD[islem]}: ${(r && r.error) || 'yazılamadı'}`, 'hata'); return null; }
      if (islem === 'kaydet' || islem === 'yeni-surum') { kurucu.kayitId = r.satir.id; kurucu.ad = r.satir.ad; kurucuYaz(); }
      bildir(islem === 'kaydet' ? `Kaydedildi: ${r.satir.ad} (sürüm ${r.satir.surum}, taslak).` : islem === 'durdur' ? `İzleme durduruldu: ${r.satir.ad}.` : `${r.satir.ad} sürüm ${r.satir.surum} — yürürlük ${gunMetni(r.satir.yururluk)}.`, 'ok');
      await tasarimlarAl(); kurucuCiz(); kayitliCiz(); ikonla();
      return r.satir;
    } catch (e) { bildir(`${ISLEM_AD[islem]}: ${e.message}`, 'hata'); return null; }
    finally { if (d) AG.dom.hazir(d); }
  }
  async function tasarimlarAl() { TL = await T().tasarimlar().then(r => (r && r.success !== false ? r : null)).catch(() => null); return TL; }
  function kurucuyaYukle(id) {
    const t = kayitBul(id);
    if (!t) return;
    kurucu = { kollar: t.son.kollar.map(x => ({ strateji: x.strateji, agirlik: Math.round(x.agirlik * 10) / 10 })), dengeleme: t.son.dengeleme.kural, senaryo: (kurucu && kurucu.senaryo) || 'olculen', kayitId: t.id, ad: t.son.ad };
    kurucuYaz(); kurucuCiz(); ikonla();
    bildir(`Kurucuya yüklendi: ${t.ad} (sürüm ${t.surum}).`, 'ok');
  }
  const kolOzeti = (kollar) => (kollar || []).map(x => `${kolAdi(x.strateji)} %${virgul((Math.round(x.agirlik * 10) / 10).toString())}`).join(' + ');
  function kayitliCiz() {
    const k = bul('tsKayitli');
    if (!k) return;
    const l = (TL && TL.tasarimlar) || [];
    doldur(k, [
      baslik('Kayıtlı tasarımlarım', yardim('kendiTasarim')),
      el('p', { class: 'hint hint-sm mb-2', text: `Kurucudan kaydettiğiniz birleşimler. Her değişiklik yeni bir sürüm satırıdır (eskisi silinmez). İzlemeye aldığınız tasarım sonraki karar gününden itibaren Model izleme'de 100 tabanlı izlenir; ölçülmemiş olduğu için emir listesi açılmaz ve deneme sayacına girmez. Aynı anda en çok ${(TL && TL.enCok) || 3} tasarım izlenir${TL ? ` (şu an ${TL.izlenen})` : ''}.` }),
      !l.length ? el('p', { class: 'hint mb-0', text: TL ? 'Henüz kayıtlı tasarım yok — kurucuda "Kaydet (taslak)" ile başlayın.' : 'Kayıtlı tasarımlar alınamadı.' })
        : tablo(['Ad', 'Sürüm', 'Durum', 'Yürürlük', 'Kollar · dengeleme', 'Etiket', ''], l.map(t => el('tr', { 'data-tasarim': t.id }, [
          hucre(t.ad), hucre(String(t.surum), 'sayi'), el('td', null, [rozet(TASARIM_DURUM[t.durum] || [t.durum, 'pf-rozet-bilgi'])]),
          hucre(t.son.yururluk ? gunMetni(t.son.yururluk) : '—', 'pf-kucuk', t.seri && t.seri.bekleyen ? `sürüm ${t.seri.bekleyen.surum} ${gunMetni(t.seri.bekleyen.yururluk)} kapanışında yürürlüğe girecek` : null),
          hucre(`${kolOzeti(t.son.kollar)} · ${siklikAd(t.son.dengeleme && t.son.dengeleme.kural).toLowerCase()}`, 'pf-kucuk'),
          hucre(t.son.etiket === 'kabul-sablon' ? 'şablonla birebir' : 'ölçülmemiş — kabul değil', t.son.etiket === 'kabul-sablon' ? 'tone-success' : 'tone-warning'),
          el('td', null, [el('div', { class: 'pf-dugmeler' }, [
            dugme('Kurucuya yükle', () => kurucuyaYukle(t.id), 'btn-secondary btn-xs', { id: 'btnTsYukle-' + t.id }),
            t.durum !== 'izleniyor' ? dugme('İzlemeye al…', (e) => tasarimIslem('izlemeye-al', e.currentTarget, { id: t.id }), 'btn-secondary btn-xs ts-yazma', { id: 'btnTsIzle-' + t.id }) : null,
            t.durum !== 'durduruldu' ? dugme('Durdur…', (e) => tasarimIslem('durdur', e.currentTarget, { id: t.id }), 'btn-secondary btn-xs ts-yazma', { id: 'btnTsDurdur-' + t.id }) : null
          ])])
        ])), 'tblTsKayitli'),
      telefonNotu('Tasarım kaydı yalnız sunucudaki panelden (telefon yalnız izler).')
    ]);
  }
  /** Model izleme › "Kendi tasarımlarım" bölümü (F5 alt işi modelPortfoy.js'ten çağırır). */
  async function modelIzlemeCiz(kap) {
    if (!kap) return;
    if (!K) K = await T().katalog().then(r => (r && r.success !== false ? r : null)).catch(() => null);
    await tasarimlarAl();
    const l = ((TL && TL.tasarimlar) || []).filter(t => t.gecmis.some(s => s.durum === 'izleniyor'));
    const parcalar = [
      baslik('Kendi tasarımlarım — ölçülmemiş birleşim, kabul değil', yardim('kendiTasarim')),
      el('p', { class: 'hint hint-sm mb-2', text: 'Tasarımcı kurucusunda kaydedip izlemeye aldığınız birleşimler. Ölçülmedikleri için kabul edilmiş değildir: yalnız izlenir, emir listesi açılmaz, deneme sayacına girmez. Seri yürürlük günü kapanışında 100 ile başlar.' })
    ];
    if (!l.length) parcalar.push(el('p', { class: 'hint mb-0', text: TL ? 'İzlenen kendi tasarımınız yok — Portföy › Tasarımcı › Tasarım kurucu\'dan kaydedip "İzlemeye al" diyebilirsiniz.' : 'Kendi tasarımlarınız alınamadı.' }));
    const grafikler = [];
    for (const t of l) {
      const s = t.seri || {}, m = s.metrik;
      const gid = 'mpKendiGrafik-' + t.id;
      parcalar.push(el('section', { class: 'ts-kendi-izleme mb-3', 'data-tasarim': t.id }, [
        el('div', { class: 'ts-kart-ust' }, [el('strong', { class: 'ts-kart-ad', text: t.ad }), rozet(TASARIM_DURUM[t.durum] || [t.durum, 'pf-rozet-bilgi']), rozet(['ölçülmemiş — kabul değil', 'pf-rozet-uyari'])]),
        el('p', { class: 'hint hint-sm mb-2', text: `Sürüm ${t.surum} · ${kolOzeti(t.son.kollar)} · ${siklikAd(t.son.dengeleme && t.son.dengeleme.kural).toLowerCase()}${t.son.yururluk ? ` · yürürlük ${gunMetni(t.son.yururluk)}` : ''}${t.son.bitis ? ` · durduruldu ${gunMetni(t.son.bitis)}` : ''}` }),
        m && m.gun > 1 ? kv([['Endeks (100 taban)', sy(m.son, 2)], ['Başlangıçtan', isaretli(m.toplam), ton(m.toplam)], ['En büyük düşüş', yz(m.maxDD)], ['Son gün', m.bit || '—']])
          : el('p', { class: 'hint mb-0', text: s.not && /^yürürlük/.test(s.not) ? `Henüz başlamadı — ${s.not.replace(/^yürürlük (\S+)/, (x, g) => `yürürlük ${gunMetni(g)}`)}.` : (s.not || 'Henüz değer yok.') }),
        s.eksik && s.eksik.length ? el('p', { class: 'hint hint-sm tone-warning mb-0', text: `Verisi olmayan kol: ${s.eksik.map(kolAdi).join(', ')} — o kol son değeriyle sabit sayılır.` }) : null,
        s.satirlar && s.satirlar.length > 1 ? el('div', { id: gid, class: 'grf-kap', role: 'img', 'aria-label': `${t.ad} — 100 tabanlı ileri değer` }) : null
      ]));
      if (s.satirlar && s.satirlar.length > 1) grafikler.push([gid, t, s]);
    }
    doldur(kap, parcalar);
    for (const [gid, t, s] of grafikler) {
      const g = bul(gid);
      if (g && AG.grafik) AG.grafik.ana(g, { seri: s.satirlar.map(x => ({ t: Date.parse(x.gun + 'T00:00:00Z'), v: x.endeks })), dusus: true, etiket: t.ad, ad: `${t.ad} (100 taban)`, birim: '' });
    }
    ikonla();
  }
  AG.tasarimciKendi = { modelIzlemeCiz };
  function halkaCiz() {
    const k = bul('tsHalka');
    if (!k || !K) return;
    const dl = dilimler(kurucu, duzey, O, K.kollar);
    const ana = AG.pages && AG.pages.anasayfa;
    doldur(k, [
      baslik('Hedef dağılım'),
      el('div', { class: 'pf-alt-sekmeler', role: 'tablist', 'aria-label': 'Halka düzeyi' }, [['kol', 'Kol'], ['varlik', 'Varlık']].map(([d, t]) => el('button', {
        type: 'button', id: 'tsDuzey-' + d, class: `pf-alt-sekme${d === duzey ? ' is-active' : ''}`, role: 'tab', 'aria-selected': d === duzey ? 'true' : 'false', text: t, onclick: () => { duzey = d; halkaCiz(); }
      }))),
      !dl.length ? el('p', { class: 'hint mb-0', text: 'Kurucuda ağırlıklı kol yok.' }) : el('div', { class: 'ana-dagilim' }, [
        ana && ana.halka ? ana.halka(dl, { tek: true }) : null,
        el('ul', { class: 'halka-lejant' }, dl.map((d, i) => el('li', null, [
          el('span', { class: `halka-kutu halka-renk-${i + 1}`, 'aria-hidden': 'true' }), el('span', { class: 'halka-ad', text: d.ad, title: d.kimlik }),
          el('span', { class: 'sayi halka-yuzde', text: yz(d.hedef, 1) })])))
      ]),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: duzey === 'varlik' ? 'Varlık düzeyi: Momentum kolları bu ayın dondurulmuş listesine (10 hisse, eşit) açılır; ≤ 7 dilim, küçükler "Diğer"de.' : 'Kol düzeyi: kurucudaki ağırlıklar (toplam %100\'e oranlanır).' })
    ]);
  }

  // ═══ 5. RİSK ÖZETİ (C4) — Laboratuvar iş kuyruğu ════════════════════════
  const bekle = (ms) => new Promise(c => setTimeout(c, ms));
  async function riskDene(d) {
    if (!kurucu || !K) return;
    const top = kurucuToplam();
    if (!(top > 0)) { bildir('Önce en az bir kola ağırlık verin.', 'uyari'); return; }
    if (Math.abs(top - 100) > 0.01) bildir(`Ağırlık toplamı %${virgul(top.toFixed(0))} — oranlanarak ${oranlanmis(kurucu.kollar)} kullanılacak.`, 'uyari');
    const tanim = tanimKur(kurucu, K.kollar);
    if (!tanim.varliklar.length) { bildir('Kolların Laboratuvar serisi yok.', 'uyari'); return; }
    const et = etiketle(kurucu.kollar, kurucu.dengeleme, K.sablonlar);
    if (d) AG.dom.mesgul(d, 'Hesaplanıyor…');
    try {
      const r = await AG.api.portfoy.simule(tanim, OTURUM);
      if (!r.success) throw new Error(r.error || 'simülasyon başlamadı');
      const s = await AG.ilerleme.izle({ id: r.is.id, baslik: 'Risk özeti (Laboratuvar motoru)', kutu: bul('tsIs'), aralik: 700, bekle: (ms) => sayfa._bekle(ms),
        oku: (x) => AG.api.portfoy.is(x), iptal: (is) => AG.api.portfoy.isIptal(is.id).catch(() => null) });
      sonRisk = { s, etiket: et, tanim, dengeleme: kurucu.dengeleme, senaryo: tanim.stratejiSenaryosu, senaryolu: kurucu.kollar.some(x => SENARYOLU.has(x.strateji) && Number(x.agirlik) > 0) };
      riskCiz(sonRisk);
    } catch (e) { bildir('Risk özeti hesaplanamadı: ' + e.message, 'hata'); }
    finally { if (d) AG.dom.hazir(d); }
  }
  /** Hücum serisi üç senaryo yan yana (motor.simule senaryolar; B-03). */
  function senaryoTablosu(sen, r) {
    if (!sen || !Object.keys(sen).length) return null;
    return el('div', { class: 'mt-3' }, [
      el('h4', { class: 'title-sm', text: 'Kairos serisi senaryoları (aynı birleşim)' }),
      tablo(['Kairos serisi', 'CAGR', 'En büyük düşüş', 'Sharpe'], SENARYO.filter(([k]) => sen[k]).map(([k, ad]) => el('tr', { class: k === (r.senaryo || 'olculen') ? 'is-active' : null }, [
        hucre(`${ad}${k === (r.senaryo || 'olculen') ? ' — grafikteki' : ''}`), hucre(yz(sen[k].cagr), 'sayi'), hucre(yz(sen[k].maxDD), 'sayi'), hucre(sy(sen[k].sharpe, 2), 'sayi')])), 'tblTsSenaryo'),
      el('p', { class: 'hint hint-sm mt-1 mb-0', text: 'Ölçülen seri yüzlerce denemeden seçildiği için iyimserdir; karar vermeden önce kötümser satırın (BTC al-tut) da kabul edilebilir olduğuna bakın.' })
    ]);
  }
  /** Motor uyarısını sade dile çevirir (iç alan adları, ham kimlikler ekranda görünmez; B-03). */
  function uyariSade(u, adlar, r) {
    if (!u || !u.metin) return null;
    const ad = (x) => adlar.get(x) || kiyasAd(x);
    const kimlikSade = (m) => m.replace(/\b(?:yahoo|strateji|tefas|tr|nakit):[A-Za-z0-9.^_=-]+/g, (x) => ad(x));
    switch (u.kod) {
      case 'iyimser-strateji': return { seviye: u.seviye, metin: `Kairos/Tao serisi iyimser: yüzlerce denemeden seçildi ve aynı veride ölçüldü${r && r.senaryo && r.senaryo !== 'olculen' ? ` (şu an: ${senaryoAd(r.senaryo).toLowerCase()})` : ''}. Karar vermeden önce kurucuda "Kairos serisi: BTC al-tut (kötümser)" seçip yeniden deneyin; senaryo tablosu üçünü yan yana gösterir.` };
      case 'elle-secim': return { seviye: u.seviye, metin: 'Ağırlıkları siz verdiniz: bu dönemin sonuçlarına bakarak seçtiyseniz sonuç geçmişe uydurulmuş (iyimser) sayılır.' };
      case 'in-sample': return { seviye: u.seviye, metin: 'Ağırlıklar tüm dönemin verisinden hesaplandı (geçmişe bakarak) — sonuç iyimserdir.' };
      default: {
        let m = kimlikSade(u.metin)
          .replace(/\s*eksikVeri:[^.]*\./g, ' Daha uzun dönem için kısa geçmişli kolu çıkarabilir ya da uzun geçmişli bir benzeriyle değiştirebilirsiniz.')
          .replace(/\s*\(senaryolar alanı\)/g, '').replace(/\s*Senaryo '[a-z]+'\./g, '').replace(/\s*\(?karsiKip\)?/g, '')
          .replace(/'(olculen|yari|btc)'/g, (x, k) => `"${senaryoAd(k).toLowerCase()}"`).replace(/in-sample/g, 'geçmişe bakarak');
        return { seviye: u.seviye, metin: cv(m.replace(/\s{2,}/g, ' ').trim()) };
      }
    }
  }
  function riskCiz(r) {
    const k = bul('tsRisk');
    if (!k) return;
    if (!r || !r.s) {
      doldur(k, [baslik('Risk özeti'), el('p', { class: 'hint mb-0', text: 'Kurucuda "Riski dene"ye basın: tasarımın geçmişteki birleşik eğrisi, düşüşleri, korelasyon ve stres dönemleri burada görünür (Laboratuvar motoru, iş kuyruğunda).' })]);
      return;
    }
    const s = r.s, o = s.olculer || {};
    const kiyas = (s.kiyaslar || []).filter(x => !x.hata && x.egri);
    const adlar = new Map((s.varliklar || []).map(v => [v.kimlik, cv(v.ad) || v.kimlik]));
    const kor = s.korelasyon || {};
    const ciftler = [];
    const ids = kor.kimlikler || [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) ciftler.push([ids[i], ids[j], kor.matris && kor.matris[i] ? kor.matris[i][j] : null]);
    const stres = (s.stres && s.stres.donemler) || [];
    const bs = s.bootstrap;
    doldur(k, [
      baslik('Risk özeti'),
      el('p', { class: `ts-etiket ${r.etiket.kabul ? 'ts-etiket-kabul' : 'ts-etiket-olculmemis'}`, text: r.etiket.kabul ? `${r.etiket.etiket}: ${sablonAdi(r.etiket.sablon, r.etiket.ad)} — ölçülmüş künye katalogda; aşağıdaki Laboratuvar simülasyonudur` : r.etiket.etiket }),
      el('p', { id: 'tsRiskDonem', class: 'ts-donem', text: `Dönem: ${o.bas || '—'} → ${o.bit || '—'} (${sy(o.yilSayisi, 1)} yıl) — tüm kolların verisinin olduğu ortak dönem; geçmişe bakarak sabit ağırlık, ${siklikAd(r.dengeleme || (r.tanim.dengeleme || {}).siklik).toLowerCase()} dengeleme, maliyet %0,05 + hesaplar arası %0,1${r.senaryolu ? `, Kairos serisi: ${senaryoAd(r.senaryo || 'olculen').toLowerCase()}` : ''}. Ölçülmüş künyeyle (PLAN SONUÇ) birebir DEĞİL.` }),
      el('div', { class: 'ts-sayilar mb-3' }, [
        kutu('CAGR', yz(o.cagr), null, ton(o.cagr), 'cagr'),
        kutu('En büyük düşüş', yz(o.maxDD), o.maxDDTarih ? `dip ${o.maxDDTarih}` : null, 'tone-danger', 'maxdd'),
        kutu('Sharpe', sy(sayiMi(o.sharpeTbill) ? o.sharpeTbill : o.sharpe, 2), sayiMi(o.sharpeTbill) ? 'T-bill fazlası' : 'yıllık', null, sayiMi(o.sharpeTbill) ? 'tbill' : 'sharpe'),
        kutu('Oynaklık', yz(o.vol), 'yıllık'),
        kutu('En kötü yıl', o.enKotuYil ? yz(o.enKotuYil.getiri) : '—', o.enKotuYil ? `${o.enKotuYil.yil}${o.enKotuYil.kismi ? ' (kısmi)' : ''}` : null, 'tone-danger')
      ]),
      el('div', { id: 'tsRiskGrafik', class: 'grf-kap', role: 'img', 'aria-label': 'Tasarımın birleşik eğrisi, kıyaslar ve düşüş şeridi' }),
      kiyas.length ? tablo(['Kıyas', 'CAGR', 'En büyük düşüş', 'Sharpe'], kiyas.map(x => el('tr', null, [hucre(kiyasAd(x.ad)), hucre(yz(x.olculer && x.olculer.cagr), 'sayi'), hucre(yz(x.olculer && x.olculer.maxDD), 'sayi'), hucre(sy(x.olculer && x.olculer.sharpe, 2), 'sayi')])), 'tblTsKiyas') : null,
      bs && bs.maxDD ? el('p', { class: 'hint hint-sm mt-2 mb-2', text: `Bootstrap en büyük düşüş (aynı getiriler başka sırayla): %5 ${yz(bs.maxDD[0])} · ortanca ${yz(bs.maxDD[1])} · %95 ${yz(bs.maxDD[2])} — kuyruğu dar gösterebilir; stres dönemleriyle birlikte okuyun.` }) : null,
      el('h4', { class: 'title-sm mt-3', text: 'Stres dönemleri' }),
      tablo(['Dönem', 'Tarih', 'Tasarım', ...kiyas.map(x => kiyasAd(x.ad))], stres.map(d => el('tr', null, [hucre(d.ad), hucre(`${d.bas} → ${d.bit}`, 'pf-kucuk'),
        hucre(stresMetni(d.portfoy), `sayi ${ton(d.portfoy && d.portfoy.getiri)}`), ...kiyas.map(x => hucre(stresMetni((d.kiyas || {})[x.ad]), `sayi ${ton(((d.kiyas || {})[x.ad] || {}).getiri)}`))])), 'tblTsStres'),
      el('h4', { class: 'title-sm mt-3', text: 'Korelasyon (haftalık getiri)' }),
      ciftler.length ? tablo(['Kol', 'Kol', 'ρ'], ciftler.map(([a, b, c]) => el('tr', null, [hucre(adlar.get(a) || a), hucre(adlar.get(b) || b), hucre(sayiMi(c) ? sy(c, 2) : '—', 'sayi')])), 'tblTsKorelasyon')
        : el('p', { class: 'hint hint-sm mb-0', text: 'Tek kol: korelasyon yok.' }),
      senaryoTablosu(s.senaryolar, r),
      s.uyarilar && s.uyarilar.length ? el('ul', { class: 'pf-uyari-liste mt-3' }, s.uyarilar.map(u => uyariSade(u, adlar, r)).filter(Boolean).map(u => el('li', { class: `pf-uyari pf-uyari-${u.seviye}`, text: u.metin }))) : null
    ]);
    const kap = bul('tsRiskGrafik');
    if (kap && AG.grafik && s.egri && s.egri.length > 1) {
      AG.grafik.ana(kap, {
        seri: s.egri.map(([t, v]) => ({ t, v: v * 100 })), kiyas: kiyas.map(x => ({ ad: kiyasAd(x.ad), seri: x.egri.map(([t, v]) => ({ t, v: v * 100 })) })),
        krizler: stres.filter(d => d.portfoy).map(d => ({ ad: d.ad, bas: d.bas, bit: d.bit })), dusus: true, bant: true, etiket: 'Tasarım', ad: 'Tasarım (100 taban)', birim: ''
      });
    }
  }

  // ═══ 6b. BU AY — GERÇEK PORTFÖY EMİRLERİ (F4, C5) ═════════════════════════
  // GET /api/tasarimci/emirler → model başına emir tablosu; "Uyguladım" (önizleme → onay, tek atomik Portföyüm paketi),
  // "Bu ay atla", "Geri al" (ters kayıt), model sermayesi, Portföyüm hedefi. Yazma düğmeleri `.ts-yazma` (telefonda gizli; sunucu 403).
  const DURUM_ROZET = {
    bekliyor: ['uygulanmayı bekliyor', 'pf-rozet-bilgi'], kismi: ['kısmen uygulandı', 'pf-rozet-uyari'], uygulandi: ['uygulandı — Portföyüm\'de', 'pf-rozet-iyi'],
    atlandi: ['bu ay atlandı', 'pf-rozet-uyari'], 'sermaye-yok': ['sermaye girilmedi', 'pf-rozet-uyari'], 'karar-yok': ['bu ay karar yok', 'pf-rozet-uyari'], 'islem-yok': ['işlem gerekmiyor', 'pf-rozet-iyi'], 'suresi-gecti': ['süresi geçti — yeni ayın listesine bakın', 'pf-rozet-uyari']
  };
  const HESAP_TUR_AD = { 'abd-araci': 'ABD aracı kurum', 'bist-araci': 'BIST aracı kurum', binance: 'Binance / kripto borsası' };
  const YON_AD = { al: 'AL', sat: 'SAT', 'abd→binance': 'AKTAR → Binance', 'binance→abd': 'AKTAR → ABD hesabı', 'aktarım': 'AKTARIM' };
  const para = (x, p, b = 2) => (sayiMi(x) ? `${x.toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b }).replace(/^-/, '−')} ${p === 'TRY' ? '₺' : p === 'USD' ? '$' : p || ''}`.trim() : '—');
  const adetMetni = (x) => (sayiMi(x) ? x.toLocaleString('tr-TR', { maximumFractionDigits: 6 }) : '—');
  const girdi = (props, deger) => { const i = el('input', { class: 'form-control control-sm', ...props }); if (deger != null) i.value = String(deger); return i; };
  const alan = (etiket, kontrol, ipucu) => el('label', { class: 'pf-alan' }, [el('span', { text: etiket }), kontrol, ipucu ? el('small', { class: 'hint hint-sm mb-0', text: ipucu }) : null]);
  const virgulle = (x) => (sayiMi(x) ? String(x).replace('.', ',') : '');
  let EM = null;        // GET /emirler
  let uyg = null;       // { model, satirlar: { anahtar: { sec, adet, fiyat, ucret, tutar } }, tarih, on: önizleme yanıtı }
  let atlaAcik = null;  // model id
  let geriAcik = null;  // uygulama id
  let hedefOn = null;   // hedef-aktar önizlemesi
  let hedefDuzey = 'sinif';
  const tumSatirlar = (m) => (m && m.liste ? [...m.liste.satirlar, ...(m.liste.aktarim ? [m.liste.aktarim] : [])] : []);

  /** Uyguladım formunun başlangıç durumu: açık (uygulanmamış, uygulanabilir) satırlar önceden dolu ve seçili. */
  function formKur(m) {
    const s = {};
    for (const x of tumSatirlar(m)) if (!x.uygulandi && x.uygulanabilir) s[x.anahtar] = x.tur === 'aktarim' ? { sec: true, tutar: virgulle(x.tutar) } : { sec: true, adet: virgulle(x.adet), fiyat: sayiMi(x.fiyat) ? virgul(x.fiyat.toFixed(2)) : '', ucret: sayiMi(x.tahminiUcret) && x.tahminiUcret > 0 ? virgul(x.tahminiUcret.toFixed(2)) : '' };   // B3: Midas komisyonu (ABD 1,5 $) dolu gelir — gerçek ücret farklıysa düzeltin
    return { model: m.id, satirlar: s, tarih: (EM && EM.bugun) || bugunStr(), on: null };
  }
  /** Form → POST gövdesi (yalnız seçili satırlar; adet/fiyat/ücret metin olarak — sunucu Türkçe sayıyı çözer). */
  function formGovde(f, yazma) {
    const satirlar = Object.entries(f.satirlar).filter(([, x]) => x.sec).map(([anahtar, x]) => ('tutar' in x ? { anahtar, tutar: x.tutar, ...(x.ulasanTutar ? { ulasanTutar: x.ulasanTutar } : {}) } : { anahtar, adet: x.adet, fiyat: x.fiyat, ucret: x.ucret }));
    return { model: f.model, satirlar, tarih: f.tarih, ...(yazma ? { yazma: true, imza: f.on && f.on.imza } : {}) };
  }

  /** B-08: açık satırların hepsinde AYNI engel varsa (ör. hesap yok) tablonun üstünde bir kez yazılır, satırda yalnız "uygulanamaz". */
  function ortakEngel(m) {
    const l = tumSatirlar(m).filter(x => !x.uygulandi);
    if (l.length < 2 || !l[0].engel) return null;
    return l.every(x => x.engel === l[0].engel) ? l[0].engel : null;
  }
  function emirSatirlari(m) {
    const ortak = ortakEngel(m);
    return tumSatirlar(m).map(x => el('tr', { class: x.uygulandi ? 'ts-emir-uygulandi' : null, 'data-anahtar': x.anahtar }, [
      hucre(x.tur === 'aktarim' ? `${x.hesapAd || '—'} → ${x.hedefHesapAd || '—'}` : (x.hesapAd || '—'), 'pf-sola pf-kucuk', x.engel || null),
      hucre(x.tur === 'aktarim' ? 'USD' : x.sembol, 'pf-sola fw-semibold'),
      hucre(YON_AD[x.yon] || x.yon, `ts-yon ts-yon-${x.tur === 'aktarim' ? 'aktar' : x.yon}`),
      hucre(x.tur === 'aktarim' ? '—' : adetMetni(x.adet), 'sayi'),
      hucre(x.tur === 'aktarim' ? '—' : para(x.fiyat, x.para), 'sayi', x.fiyatTarih ? `${x.fiyatKaynak || 'son kapanış'} ${x.fiyatTarih}` : null),
      hucre(para(x.tutar, x.para), 'sayi'),
      hucre(x.uygulandi ? `${x.neden} · uygulandı ✓` : x.engel ? `${x.neden} · ${ortak ? 'uygulanamaz' : x.engel}` : x.neden, 'pf-sola pf-kucuk')
    ]));
  }

  /** Önizleme uyarıları: aynı tür + hesap için yalnız SON mesaj (ör. nakit her alışta eksiye düşer → bir satır). */
  function uyariOzet(l) {
    const m = new Map();
    for (const u of l || []) m.set(u && u.kod ? `${u.kod}|${u.hesap || ''}|${u.para || ''}` : String(u && u.mesaj || u), u && u.mesaj ? u.mesaj : String(u));
    return [...m.values()];
  }
  /**
   * B-07: önizleme toplamları — toplam alış, satış, ücret ve hesap başına nakit önce → sonra (önizlenen kayıtlarla, model para
   * biriminde). `eksi`: bir hesabın nakdi eksiye düşüyor (Portföyüm "nakit eksi" uyarısı da sayılır) → onay ikincil düğme.
   */
  function onizlemeToplam(on, m) {
    const pb = (m.liste && m.liste.para) || 'USD', nakit = (m.liste && m.liste.nakit) || {};
    let alis = 0, satis = 0, ucret = 0;
    const net = {};
    const ekle = (h, t) => { if (h) net[h] = (net[h] || 0) + t; };
    for (const x of on.kayitlar || []) {
      if (x.islem === 'transfer') { ekle(x.hesap, -(x.tutar || 0)); ekle(x.hedefHesap, x.tutar || 0); continue; }
      const t = (x.adet || 0) * (x.fiyat || 0), u = x.ucret || 0;
      ucret += u;
      if (x.islem === 'al') { alis += t; ekle(x.hesap, -t - u); } else if (x.islem === 'sat') { satis += t; ekle(x.hesap, t - u); }
    }
    // D5: sunucu önizlemesi nakdi emir listesiyle aynı yuvarlamayla verir (emirler.js nakitSonra) — varsa o gösterilir.
    const R2 = (v) => Math.round(v * 100) / 100;
    const hesaplar = Array.isArray(on.nakit) ? on.nakit.map(h => ({ ad: h.ad, once: h.once, sonra: h.sonra, para: h.para || pb }))
      : Object.entries(net).filter(([h]) => nakit[h]).map(([h, n]) => ({ ad: nakit[h].hesapAd || h, once: nakit[h].mevcut, sonra: R2(R2(nakit[h].mevcut) + R2(n)), para: nakit[h].para || pb }));
    const eksi = hesaplar.some(h => h.sonra < -0.01) || (on.uyarilar || []).some(u => u && u.kod === 'nakit-eksi');
    return { alis, satis, ucret, pb, hesaplar, eksi };
  }
  function uygFormu(m) {
    const f = uyg;
    const satir = (x) => {
      const d = f.satirlar[x.anahtar]; if (!d) return null;
      const sec = el('input', { type: 'checkbox', class: 'ts-sec', 'aria-label': `${x.sembol || 'aktarım'} dahil`, onchange: (e) => { d.sec = !!e.target.checked; f.on = null; buAyEmirCiz(); } });
      sec.checked = d.sec;
      const yaz = (a) => (e) => { d[a] = e.target.value; f.on = null; };
      return el('tr', { 'data-anahtar': x.anahtar }, [
        el('td', null, [sec]), hucre(x.tur === 'aktarim' ? 'USD aktarım' : x.sembol, 'pf-sola fw-semibold'), hucre(YON_AD[x.yon] || x.yon),
        x.tur === 'aktarim' ? el('td', { colspan: '2' }, [girdi({ 'aria-label': 'aktarım tutarı (gönderilen)', inputmode: 'decimal', title: 'Gönderilen tutar', onchange: yaz('tutar') }, d.tutar)])
          : el('td', null, [girdi({ 'aria-label': `${x.sembol} adet`, inputmode: 'decimal', onchange: yaz('adet') }, d.adet)]),
        x.tur === 'aktarim' ? null : el('td', null, [girdi({ 'aria-label': `${x.sembol} fiyat`, inputmode: 'decimal', onchange: yaz('fiyat') }, d.fiyat)]),
        x.tur === 'aktarim' ? el('td', null, [girdi({ 'aria-label': 'ulaşan tutar', inputmode: 'decimal', placeholder: 'ulaşan (boş = aynı)', title: 'Hedef hesaba ulaşan tutar — fark masraf olarak düşer (B6)', onchange: yaz('ulasanTutar') }, d.ulasanTutar || '')])
          : el('td', null, [girdi({ 'aria-label': `${x.sembol} ücret`, inputmode: 'decimal', placeholder: '0', onchange: yaz('ucret') }, d.ucret)])
      ]);
    };
    const on = f.on;
    const tp = on && on.success ? onizlemeToplam(on, m) : null;
    return el('div', { id: `tsUygForm-${m.id}`, class: 'ts-form ts-yazma mt-3' }, [
      el('h4', { class: 'title-sm', text: 'Uyguladım — Portföyüm\'e al/sat kaydı' }),
      el('p', { class: 'hint hint-sm mb-2', text: 'Satırlar listeden önceden dolu. Aracı kurumda gerçekleşen adet, fiyat ve ücreti düzeltin; uygulamadığınız satırın işaretini kaldırın (sonra ayrıca uygulanabilir). Önce önizleyin; onayla tek seferde Portföyüm\'e yazılır (iptal = ters kayıt).' }),
      tablo(['', 'Sembol', 'Yön', 'Adet', 'Gerçekleşen fiyat', 'Ücret'], tumSatirlar(m).map(satir).filter(Boolean), `tblTsUyg-${m.id}`),
      el('div', { class: 'pf-form-izgara mt-2' }, [alan('İşlem tarihi', girdi({ type: 'date', id: `inpTsUygTarih-${m.id}`, onchange: (e) => { f.tarih = e.target.value; f.on = null; } }, f.tarih))]),
      el('div', { class: 'pf-dugmeler mt-2' }, [
        dugme('Önizle', (e) => uygOnizle(e.currentTarget), 'btn-secondary btn-sm', { id: `btnTsOnizle-${m.id}` }),
        on && on.success ? dugme(tp && tp.eksi ? `Nakit eksiye düşse de yaz (${on.islemSayisi} kayıt)` : `Onayla — ${on.islemSayisi} kaydı Portföyüm'e yaz`, (e) => uygOnayla(e.currentTarget), tp && tp.eksi ? 'btn-secondary btn-sm ts-onay-dugme' : 'btn-primary btn-sm ts-onay-dugme', { id: `btnTsOnay-${m.id}` }) : null,
        dugme('Vazgeç', () => { uyg = null; buAyEmirCiz(); }, 'btn-secondary btn-sm')
      ]),
      on ? el('div', { id: `tsUygOnizleme-${m.id}`, class: `ts-onizleme mt-2 ${on.success ? 'ts-onizleme-iyi' : 'ts-onizleme-kotu'}` }, [
        el('p', { class: 'mb-1 fw-semibold', text: on.success ? `Önizleme: ${on.islemSayisi} işlem${on.yeniVarliklar && on.yeniVarliklar.length ? ` + ${on.yeniVarliklar.length} yeni varlık (${on.yeniVarliklar.map(v => v.sembol).join(', ')})` : ''} — Portföyüm denetiminden geçti, henüz YAZILMADI.` : `Yazılamaz: ${on.error || 'hata'}` }),
        tp ? el('p', { id: `tsUygToplam-${m.id}`, class: 'ts-onizleme-toplam mb-1', text: `Toplam alış ${para(tp.alis, tp.pb)} · satış ${para(tp.satis, tp.pb)} · ücret ${para(tp.ucret, tp.pb)}${tp.hesaplar.length ? ` · nakit ${tp.hesaplar.map(h => `${h.ad}: ${para(h.once, h.para)} → ${para(h.sonra, h.para)}`).join('; ')}` : ''}` }) : null,
        on.kayitlar && on.kayitlar.length ? el('ul', { class: 'ts-onizleme-liste' }, on.kayitlar.map(k => el('li', { class: 'pf-kucuk', text: k.islem === 'transfer' ? `${k.tarih} transfer ${para(k.tutar, k.para)}${Number.isFinite(k.ulasanTutar) && k.ulasanTutar !== k.tutar ? ` → ulaşan ${para(k.ulasanTutar, k.para)} (masraf ${para(k.tutar - k.ulasanTutar, k.para)})` : ''}` : `${k.tarih} ${k.islem === 'al' ? 'alış' : 'satış'} ${k.sembol || ''} ${adetMetni(k.adet)} × ${para(k.fiyat, k.para)}${k.ucret ? ` + ücret ${para(k.ucret, k.para)}` : ''}` }))) : null,
        ...uyariOzet(on.uyarilar).map(u => el('p', { class: 'pf-uyari pf-uyari-uyari mt-1 mb-0', text: u })),
        tp && tp.eksi ? el('p', { class: 'hint hint-sm mt-1 mb-0', text: 'Nakit eksiye düşüyor: önce Portföyüm\'e para yatırma ya da satış kaydı girmeniz önerilir; yine de yazabilirsiniz (Portföyüm eksi nakdi uyarı olarak gösterir).' }) : null
      ]) : null
    ]);
  }

  // ── Bu ay model kartı: karar + emir listesi tek kartta (B-09) ─────────────
  const TELEFON = () => !!(global.matchMedia && global.matchMedia('(max-width: 720px)').matches);
  const katlar = {};   // model id → true (katlı) / false (açık); yoksa varsayılan
  const ISI_YOK = new Set(['uygulandi', 'islem-yok', 'atlandi']);
  const katliMi = (m) => (m.id in katlar ? katlar[m.id] : TELEFON() && ISI_YOK.has(m.durum));
  /** Özet şeridi için "yapılacak" metni (B-09 (1)). */
  function yapilacak(m) {
    const satirlar = tumSatirlar(m), acik = satirlar.filter(x => !x.uygulandi && x.uygulanabilir).length, engelli = satirlar.filter(x => !x.uygulandi && !x.uygulanabilir).length;
    switch (m.durum) {
      case 'sermaye-yok': return 'yapılacak: model sermayesini girin';
      case 'karar-yok': return 'karar bekleniyor (ay sonu)';
      case 'uygulandi': return 'bu ay tamam';
      case 'islem-yok': return 'bu ay işlem gerekmiyor';
      case 'suresi-gecti': return 'süresi geçti — yeni ayın listesi geçerli (bu ay uygulanmadı)';
      case 'atlandi': return 'bu ay atlandı';
      case 'kismi': return acik ? `yapılacak: kalan ${acik} emir` : 'kısmen uygulandı';
      default: return acik ? `yapılacak: ${acik} emir — aracı kurumda girin, sonra "Uyguladım"` : engelli ? 'yapılacak: önce Portföy › Kayıt\'ta hesap açın' : 'bekliyor';
    }
  }
  function ozetSerit(sira) {
    return el('ul', { id: 'tsBuAyOzet', class: 'ts-ozet-serit mb-3', 'aria-label': 'Bu ay modellerin durumu' }, sira.map(m => el('li', null, [
      el('button', { type: 'button', class: 'ts-ozet-satir', 'data-model': m.id, onclick: () => {
        katlar[m.id] = false; buAyEmirCiz();
        const kap = bul('tsEmirKartlar'), c = kap && kap.querySelector ? kap.querySelector(`[data-model="${m.id}"]`) : null;
        if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } }, [el('strong', { class: 'ts-ozet-ad', text: modelAdi(m) }), rozet(DURUM_ROZET[m.durum] || [m.durum, 'pf-rozet-bilgi']), el('span', { class: 'ts-ozet-is', text: yapilacak(m) })])
    ])));
  }
  /** Kararın ayrıntısı (eski "Bu ayın kararları" kartı; /oneri): doğrulama, üyelik, liste, eksik veri, 837 bant bilgisi. */
  /** Kararın kv satırları (kartın ana kv listesine eklenir — tek hizalı liste). */
  function kararSatirlari(m, oM) {
    if (!oM) return [];
    const k = oM.karar;
    return [
      k && k.ilk ? ['İlk yerleşim', 'evet — sabitleme kararı'] : null,
      k && k.dogrulama ? ['Doğrulama', k.dogrulama === 'birebir' ? 'betikle birebir' : k.dogrulama] : null,
      k && k.uyelik ? ['Üyelik', `${k.uyelik.ay} · ${k.uyelik.uyeSay} üye${k.uyelik.bayat ? ' (bayat)' : ''}`, k.uyelik.bayat ? 'tone-warning' : ''] : null,
      k ? ['Model portföy', oM.uygulandi ? 'uygulama günü açılışında sanal olarak uygulandı' : 'uygulama günü açılışında sanal olarak uygulanacak (otomatik)'] : null,
      ...(m.id === 'm-837' && oM.hedef ? oM.hedef.map(h => [h.kol === 'cekirdek' ? 'Çekirdek: QQQ al-tut' : h.kol === 'uydu' ? 'Uydu: Kairos (demo bot)' : h.kol, yz(h.agirlik, 0)]) : [])
    ];
  }
  function kararAyrinti(m, oM) {
    if (!oM) return [];
    const k = oM.karar, m10 = m.id !== 'm-837', son = m10 ? null : dengeleme837(D837);
    return [
      m10 && oM.hedef && oM.hedef.length
        ? el('div', { class: 'ts-liste mt-2', 'aria-label': `${modelAdi(m)} listesi` }, oM.hedef.map(h => el('span', { class: 'ts-hisse', title: `ağırlık ${yz(h.agirlik, 1)}` }, [el('strong', { text: h.s }), el('span', { class: 'sayi', text: ' ' + yz(h.agirlik, 0) })]))) : null,
      k && k.eksikVeri && k.eksikVeri.length ? el('p', { class: 'pf-uyari pf-uyari-uyari mt-2', text: `Eksik veri: ${eksikMetni(k.eksikVeri)} — bu hisseler listeye alınamadı/nakitte.` }) : null,
      k && k.uyelik && k.uyelik.uyari ? el('p', { class: 'pf-uyari pf-uyari-uyari mt-2', text: `Üyelik: ${k.uyelik.uyari}` }) : null,
      !m10 ? el('p', { class: 'hint hint-sm mt-2 mb-0', text: son
        ? `Bant dengelemesi (±10 puan): son ${gunMetni(son.kararGunu)} — önceki ağırlık QQQ ${yz(son.dengeleme && son.dengeleme.oncekiAgirlik && son.dengeleme.oncekiAgirlik.cekirdek, 1)} / Kairos ${yz(son.dengeleme && son.dengeleme.oncekiAgirlik && son.dengeleme.oncekiAgirlik.uydu, 1)}, aktarılan ${yz(son.dengeleme && son.dengeleme.aktarim, 1)}.`
        : 'Kairos payı %40–%60 bandının dışına çıkınca (QQQ işlem günü kapanışında denetlenir) tam 50/50\'ye dengelenir; hesaplar arası aktarımın maliyeti %0,1 + kayma %0,05. Henüz dengeleme olmadı.' }) : null
    ].filter(Boolean);
  }
  /** B-09 (2): sermaye girilmemişse kartın içinde satır içi sermaye kutusu. */
  function sermayeSatiri(m) {
    return el('div', { id: `tsSermayeSatir-${m.id}`, class: 'ts-sermaye-satir ts-yazma mt-2' }, [
      alan(`${modelAdi(m)} için ayıracağınız gerçek tutar (${m.id === 'm-bist-m10' ? '₺' : '$'})`, girdi({ id: `inpTsSermayeTek-${m.id}`, inputmode: 'decimal', placeholder: m.id === 'm-bist-m10' ? 'ör. 300000' : 'ör. 10000' })),
      dugme('Sermayeyi kaydet', (e) => sermayeTek(m.id, e.currentTarget), 'btn-primary btn-sm', { id: `btnTsSermayeTek-${m.id}` })
    ]);
  }

  function emirKarti(m, oM, gomulu) {
    const L = m.liste, k = m.karar || (oM && oM.karar), d = DURUM_ROZET[m.durum] || [m.durum, 'pf-rozet-bilgi'];
    const satirlar = tumSatirlar(m), acik = satirlar.filter(x => !x.uygulandi && x.uygulanabilir);
    const k8 = L && L.kol837;
    const hesaplar = L ? Object.values(L.hesaplar || {}).filter(h => h && h.ad).map(h => h.ad) : [];
    const ortak = L ? ortakEngel(m) : null;
    const katli = !gomulu && katliMi(m);
    // 62.4: model sekmesine gömülü "Bu ay" şeridi — başlık ay + durum + yapılacak iş (model adı sekmede zaten yazıyor)
    return el('article', { class: `ts-kart ts-emir-kart${gomulu ? ' ts-emir-gomulu' : ''}${katli ? ' ts-kart-kapali' : ''}`, 'data-model': m.id }, [
      gomulu ? el('div', { class: 'ts-kart-ust' }, [el('strong', { class: 'ts-kart-ad', text: `Bu ay${EM ? ` — ${ayMetni(EM.ay)}` : ''}` }), rozet(d), el('span', { class: 'ts-ozet-is', text: yapilacak(m) })])
        : el('div', { class: 'ts-kart-ust' }, [el('strong', { class: 'ts-kart-ad', text: modelAdi(m) }), rozet(d),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm ts-kat-dugme', 'aria-expanded': katli ? 'false' : 'true', 'aria-label': `${modelAdi(m)} kartını ${katli ? 'aç' : 'katla'}`, onclick: () => { katlar[m.id] = !katli; buAyEmirCiz(); } }, [el('span', { text: katli ? 'Aç' : 'Katla' })])]),
      kv([k && k.kararGunu ? ['Karar', `${gunMetni(k.kararGunu)} kapanışı → ${gunMetni(k.uygulamaGunu)} açılışı`] : null,
        m.sermaye ? ['Model sermayesi', m.sermaye.baslangic != null && Math.abs(m.sermaye.tutar - m.sermaye.baslangic) > 0.5 ? `${para(m.sermaye.baslangic, m.sermaye.para, 0)} → hedef tabanı ${para(m.sermaye.tutar, m.sermaye.para, 0)} (endeks ${sy(m.sermaye.endeks, 1)})` : para(m.sermaye.tutar, m.sermaye.para, 0)] : EM && EM.tutarGizli ? null : ['Model sermayesi', 'girilmedi', 'tone-warning'],
        hesaplar.length ? ['Hesap', hesaplar.join(' + ')] : null,
        k8 ? ['Şimdi', k8.ilk || k8.hucumPay == null ? `QQQ ${para(k8.cekirdekUSD, 'USD', 0)} + Binance ${para(k8.uyduUSD, 'USD', 0)} — Kairos payı ilk yerleşimden sonra hesaplanır` : `QQQ ${para(k8.cekirdekUSD, 'USD', 0)} + Binance ${para(k8.uyduUSD, 'USD', 0)} → Kairos ${yz(k8.hucumPay, 1)}`, k8.disi && !k8.ilk ? 'tone-warning' : ''] : null]),
      m.durum === 'sermaye-yok' && !(EM && EM.tutarGizli) ? sermayeSatiri(m) : null,
      ...((L && L.uyarilar) || []).filter(u => !(m.durum === 'sermaye-yok' && /Model sermayesi girilmedi/.test(u))).map(u => el('p', { class: 'pf-uyari pf-uyari-uyari mt-2', text: u })),
      ortak ? el('p', { class: 'pf-uyari pf-uyari-uyari mt-2 ts-ortak-engel', text: `Bu modelin satırları uygulanamaz: ${ortak}` }) : null,
      satirlar.length ? tablo(['Hesap', 'Sembol', 'Yön', 'Adet', 'Tahmini fiyat', 'Tutar', 'Neden'], emirSatirlari(m), `tblTsEmir-${m.id}`) : null,
      L && L.aktarim ? el('p', { class: 'hint hint-sm mt-2 mb-0 ts-aktarim-not', text: `Aktarım: ${L.aktarim.not}` }) : null,
      L && L.sapma && L.sapma.toplam > 0.005 && !(L.uyarilar || []).some(u => /Tam adet/.test(u)) ? el('p', { class: 'hint hint-sm mt-2 mb-0', text: `Tam adetten kalan sapma: ${para(L.sapma.toplam, L.sapma.para)} (%${virgul((L.sapma.oran * 100).toFixed(2))}) nakitte kalır.` }) : null,
      L && L.esikAlti && L.esikAlti.length ? el('p', { class: 'hint hint-sm mt-1 mb-0', text: `Eşik altı (${para(L.minIslemUSD, 'USD', 0)} altı, işlem yazılmadı): ${L.esikAlti.map(x => `${x.sembol} ${adetMetni(x.adet)}`).join(', ')}` }) : null,
      // 62.3: kararın künyesi ve bilgi notları katlı (kart yalnız "ne yapmalıyım"ı gösterir)
      (() => {
        const ic = [kv([m.id === 'm-837' ? ['Kural', k8 ? cv(k8.kural) : 'bant ±10 puan (Kairos %40–%60), QQQ işlem günü'] : null, ...kararSatirlari(m, oM)]), ...kararAyrinti(m, oM),
          ...((L && L.bilgi) || []).map(u => el('p', { class: 'pf-uyari pf-uyari-bilgi mt-2', text: u }))];
        return el('details', { class: 'hs-kat-mini mt-3 ts-ayrinti', id: `tsAyrinti-${m.id}` }, [el('summary', { text: 'Ayrıntı: kararın künyesi, hedef liste ve notlar' }), ...ic]);
      })(),
      m.atla ? el('p', { class: 'pf-uyari pf-uyari-uyari mt-2', text: `Bu ay atlandı: ${m.atla.neden}` }) : null,
      m.uygulamalar && m.uygulamalar.length ? el('ul', { class: 'ts-uygulamalar mt-2' }, m.uygulamalar.map(u => el('li', null, [
        el('span', { class: 'pf-kucuk', text: `Uygulandı ${u.tarih || ''} · ${u.kayitlar.length} kayıt (Portföyüm'de, kaynak: Tasarımcı)` }),
        geriAcik === u.uygulama ? el('span', { class: 'ts-yazma ts-satir-ici' }, [
          girdi({ id: `inpTsGeriNeden-${m.id}`, placeholder: 'neden (isteğe bağlı)', 'aria-label': 'geri alma nedeni' }),
          dugme('Ters kaydı yaz', (e) => geriAl(u.uygulama, e.currentTarget), 'btn-outline-danger btn-sm', { id: `btnTsGeriOnay-${m.id}` }),
          dugme('Vazgeç', () => { geriAcik = null; buAyEmirCiz(); }, 'btn-secondary btn-sm')])
          : dugme('Geri al…', () => { geriAcik = u.uygulama; buAyEmirCiz(); }, 'btn-secondary btn-sm ts-yazma', { id: `btnTsGeri-${m.id}` })
      ]))) : null,
      el('div', { class: 'pf-dugmeler mt-3' }, [
        acik.length && !m.atla ? dugme(uyg && uyg.model === m.id ? 'Formu yenile' : 'Uyguladım…', () => { uyg = formKur(m); buAyEmirCiz(); }, 'btn-primary btn-sm ts-yazma', { id: `btnTsUyg-${m.id}` }) : null,
        m.atla ? dugme('Atlamayı kaldır', () => atla(m.id, null, true), 'btn-secondary btn-sm ts-yazma', { id: `btnTsAtlaKaldir-${m.id}` })
          : !(m.uygulamalar && m.uygulamalar.length) && m.liste ? dugme('Bu ay atla…', () => { atlaAcik = m.id; buAyEmirCiz(); }, 'btn-secondary btn-sm ts-yazma', { id: `btnTsAtla-${m.id}` }) : null
      ]),
      atlaAcik === m.id ? el('div', { class: 'ts-form ts-yazma mt-2' }, [
        alan('Neden atlıyorsunuz? (karar günlüğüne girer)', girdi({ id: `inpTsAtlaNeden-${m.id}`, maxlength: '300' })),
        el('div', { class: 'pf-dugmeler mt-2' }, [dugme('Bu ayı atla', (e) => atla(m.id, e.currentTarget), 'btn-secondary btn-sm', { id: `btnTsAtlaOnay-${m.id}` }), dugme('Vazgeç', () => { atlaAcik = null; buAyEmirCiz(); }, 'btn-secondary btn-sm')])
      ]) : null,
      uyg && uyg.model === m.id ? uygFormu(m) : null,
      telefonNotu('Uyguladım / atla / geri al yalnız sunucudaki panelden (telefon yalnız izler).')
    ]);
  }

  /** B-12: açılış rehberi — her adım ilgili yere giden düğme. */
  function rehber() {
    const git = (alt, kaydir) => () => {
      if (alt && AG.pages && AG.pages.portfoy && AG.pages.portfoy.altSekme) AG.pages.portfoy.altSekme(alt);
      if (kaydir) { const h = bul(kaydir); if (h && h.scrollIntoView) h.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    };
    const adimlar = [
      ['Portföy › Kayıt › Gelişmiş: aracı kurumunuzu (Midas) ve Binance\'i ekleyin.', 'Kurum ekle', git('kayit')],
      ['Hesaplar: "ABD aracı kurum" (USD), "BIST aracı kurum" (TRY), "Binance / kripto borsası" (USD) hesaplarını açın.', 'Hesap aç', git('kayit')],
      ['Her hesaba bugünkü açılış bakiyesini girin (nakit + elinizdeki hisseler).', 'Açılış bakiyesi gir', git('kayit')],
      ['Bu sayfadaki "Model sermayesi" kutusuna her modele ayıracağınız gerçek tutarı yazın.', 'Sermaye gir', () => { ayarAcik = true; buAyEmirCiz(); git(null, 'tsSermayeKap')(); }],
      ['Listeyi aracı kurumda uygulayın, sonra "Uyguladım" ile Portföyüm\'e kaydedin.', null, null]
    ];
    return el('div', { id: 'tsRehber', class: 'ts-rehber mb-3' }, [
      el('p', { class: 'fw-semibold mb-1', text: 'Portföyüm boş — emir listesi gerçek pozisyonlarınızla hesaplanır. Açılış rehberi:' }),
      el('ol', { class: 'ts-adimlar' }, adimlar.map(([t, d, f], i) => el('li', null, [el('span', { text: t + ' ' }), d ? dugme(d, f, 'btn-secondary btn-sm ts-rehber-dugme', { id: `btnTsRehber-${i + 1}` }) : null])))
    ]);
  }

  function sermayePaneli() {
    const a = (EM && EM.ayarlar) || {};
    const sm = Object.fromEntries(((EM && EM.modeller) || []).map(m => [m.id, m.sermaye]));
    const ad = Object.fromEntries(((EM && EM.modeller) || []).map(m => [m.id, modelAdi(m)]));
    const coklu = ['abd-araci', 'bist-araci', 'binance'].map(t => [t, ((EM && EM.hesaplar) || []).filter(h => h.hesapTuru === t)]).filter(([, l]) => l.length > 1);
    const secim = (t, l) => { const s = el('select', { class: 'form-control control-sm', id: `selTsHesap-${t}` }, l.map(h => el('option', { value: h.id, text: h.ad }))); s.value = (a.hesaplar || {})[t] || l[0].id; return s; };
    return el('div', { class: 'ts-yazma' }, [
      el('div', { class: 'pf-form-izgara' }, [
        ...MODEL_SIRA.map(id => alan(`${ad[id] || id} (${id === 'm-bist-m10' ? '₺' : '$'})`, girdi({ id: `inpTsSermaye-${id}`, inputmode: 'decimal', placeholder: id === 'm-bist-m10' ? 'ör. 300000' : 'ör. 10000' }, sm[id] ? virgulle(sm[id].baslangic != null ? sm[id].baslangic : sm[id].tutar) : ''))),
        alan('En küçük işlem ($)', girdi({ id: 'inpTsMinIslem', inputmode: 'decimal' }, virgulle(a.minIslemUSD != null ? a.minIslemUSD : 10)), 'bunun altındaki fark emir yazılmaz'),
        ...coklu.map(([t, l]) => alan(`Hesap (${HESAP_TUR_AD[t] || t})`, secim(t, l)))
      ]),
      el('label', { class: 'ts-onay mt-2' }, [(() => { const c = el('input', { type: 'checkbox', id: 'chkTsKesirli' }); c.checked = !!a.kesirli; return c; })(), el('span', { text: ' Kesirli hisse alınabiliyor — ABD hisselerinde (Midas veriyor: kullanıcı 2026-10-13 doğruladı; BIST her zaman tam adet). Emir listesi ve Botlar › Hisse yapıları kâğıt hesabı bu ayarı kullanır.' })]),
      el('label', { class: 'ts-onay' }, [(() => { const c = el('input', { type: 'checkbox', id: 'chkTsTelefonGizle' }); c.checked = !!a.telefondaGizle; return c; })(), el('span', { text: ' Tutarları telefonda gizle' })]),
      el('div', { class: 'pf-dugmeler mt-2' }, [dugme('Sermayeyi kaydet', (e) => sermayeKaydet(e.currentTarget, coklu.map(([t]) => t)), 'btn-primary btn-sm', { id: 'btnTsSermaye' })]),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Tutar yalnız bu bilgisayarda saklanır; git\'e, Telegram\'a, kayıtlara gitmez. Kutuyu boşaltmak o modelin sermayesini siler (onay sorulur).' })
    ]);
  }

  function hedefPaneli() {
    const s = el('select', { class: 'form-control control-sm', id: 'selTsHedefDuzey', onchange: (e) => { hedefDuzey = e.target.value; hedefOn = null; buAyEmirCiz(); } }, [['sinif', 'Sınıf düzeyi (hisse / ETF / kripto)'], ['varlik', 'Varlık düzeyi (her hisse)']].map(([v, t]) => el('option', { value: v, text: t })));
    s.value = hedefDuzey;
    const on = hedefOn;
    return el('div', { class: 'ts-yazma' }, [
      el('p', { class: 'hint hint-sm mb-2', text: 'Modellerin bu ayki hedefini (sermayeleriyle ağırlıklı) Portföyüm › Hedef dağılım\'a kaydeder; sapma uyarıları oradan izlenir. Yalnız model kalemlerini kapsar. Portföyüm hedefine içe alma yalnız buradan yapılır.' }),
      el('div', { class: 'pf-form-izgara' }, [alan('Düzey', s)]),
      el('div', { class: 'pf-dugmeler mt-2' }, [
        dugme('Önizle', (e) => hedefAktar(false, e.currentTarget), 'btn-secondary btn-sm', { id: 'btnTsHedefOnizle' }),
        on && on.success ? dugme('Onayla — Portföyüm hedefi olarak kaydet', (e) => hedefAktar(true, e.currentTarget), 'btn-primary btn-sm', { id: 'btnTsHedefOnay' }) : null
      ]),
      on ? el('div', { id: 'tsHedefOnizleme', class: `ts-onizleme mt-2 ${on.success ? 'ts-onizleme-iyi' : 'ts-onizleme-kotu'}` }, [
        el('p', { class: 'mb-1', text: on.success ? `Önizleme (${on.duzey === 'varlik' ? 'varlık' : 'sınıf'} düzeyi, bant ±${on.bant} puan) — henüz YAZILMADI. ${cv(on.not || '')}` : `Kaydedilemez: ${on.error || ''}` }),
        on.cevrim && on.cevrim.length ? el('p', { id: 'tsHedefKur', class: 'hint hint-sm mb-1', text: on.cevrim.map(c => `${cv(c.ad)} ${para(c.tutar, 'TRY', 0)} ≈ ${para(c.usd, 'USD', 0)}`).join(' · ') + ` (USD/TRY ${sy(on.usdtry, 2)}${on.kurTarih ? `, ${gunMetni(on.kurTarih)}` : ''})` }) : null,
        on.satirlar ? el('ul', { class: 'ts-onizleme-liste' }, on.satirlar.map(x => el('li', { class: 'pf-kucuk', text: `${cv(x.ad)} %${virgul(x.yuzde.toFixed(2))}` }))) : null
      ]) : null
    ]);
  }

  // ── Eylemler ───────────────────────────────────────────────────────────
  async function emirlerAl() { EM = await T().emirler(EM && EM.ay ? { ay: EM.ay } : {}).then(r => (r && r.success !== false ? r : null)).catch(() => null); }
  async function yenidenYukle() { await emirlerAl(); buAyEmirCiz(); }
  async function uygOnizle(d) {
    if (!uyg || !EM) return;
    if (d) AG.dom.mesgul(d, 'Denetleniyor…');
    try {
      const r = await T().uygula(EM.ay, formGovde(uyg, false));
      uyg.on = r || { success: false, error: 'yanıt yok' };
    } catch (e) { uyg.on = { success: false, error: e.message }; } finally { if (d) AG.dom.hazir(d); }
    buAyEmirCiz();
  }
  async function uygOnayla(d) {
    if (!uyg || !uyg.on || !uyg.on.success) return;
    if (d) AG.dom.mesgul(d, 'Yazılıyor…');
    try {
      const r = await T().uygula(EM.ay, formGovde(uyg, true));
      if (!r || !r.success) { bildir('Yazılmadı: ' + ((r && r.error) || 'hata'), 'hata'); uyg.on = null; buAyEmirCiz(); return; }
      bildir(`${r.islemSayisi} işlem Portföyüm'e yazıldı (kaynak: Tasarımcı).`, 'ok');
      uyg = null; await yenidenYukle();
    } catch (e) { bildir('Yazılmadı: ' + e.message, 'hata'); } finally { if (d) AG.dom.hazir(d); }
  }
  async function atla(model, d, kaldir) {
    const neden = kaldir ? '' : String((bul(`inpTsAtlaNeden-${model}`) || {}).value || '').trim();
    if (!kaldir && !neden) { bildir('Atlama nedenini yazın.', 'uyari'); return; }
    if (d) AG.dom.mesgul(d, 'Kaydediliyor…');
    try {
      const r = await T().atla(EM.ay, kaldir ? { model, kaldir: true } : { model, neden });
      if (!r || !r.success) bildir((r && r.error) || 'kaydedilemedi', 'hata'); else { atlaAcik = null; bildir(kaldir ? 'Atlama kaldırıldı.' : 'Bu ay atlandı.', 'bilgi'); }
    } finally { if (d) AG.dom.hazir(d); }
    await yenidenYukle();
  }
  async function geriAl(uygulama, d) {
    const m = (EM.modeller || []).find(x => (x.uygulamalar || []).some(u => u.uygulama === uygulama));
    const neden = String((m && bul(`inpTsGeriNeden-${m.id}`) || {}).value || '').trim();
    if (d) AG.dom.mesgul(d, 'Yazılıyor…');
    try {
      const r = await T().geriAl(EM.ay, { uygulama, neden: neden || 'Tasarımcı: uygulama geri alındı' });
      if (!r || !r.success) bildir((r && r.error) || 'geri alınamadı', 'hata'); else { geriAcik = null; bildir(`${r.iptal.length} kayıt ters kayıtla iptal edildi.`, 'bilgi'); }
    } finally { if (d) AG.dom.hazir(d); }
    await yenidenYukle();
  }
  /** B-10: sunucu büyük değişimde / silmede `kod:'onay'` (409) döner → AG.onayla, evetse `onay:true` ile yeniden. */
  async function sermayeGonder(g) {
    let r = await T().sermaye(g);
    if (r && r.kod === 'onay') {
      const evet = AG.onayla ? await AG.onayla({ baslik: 'Model sermayesi — emin misiniz?', metin: r.soru, onay: 'Evet, kaydet', tehlikeli: true }) : false;
      if (!evet) return { iptal: true };
      r = await T().sermaye({ ...g, onay: true });
    }
    return r;
  }
  async function sermayeKaydet(d, turler) {
    const modeller = Object.fromEntries(MODEL_SIRA.map(id => [id, { tutar: String((bul(`inpTsSermaye-${id}`) || {}).value || '').trim() }]));
    const g = { modeller, minIslemUSD: String((bul('inpTsMinIslem') || {}).value || '10'), kesirli: !!(bul('chkTsKesirli') || {}).checked, telefondaGizle: !!(bul('chkTsTelefonGizle') || {}).checked };
    if (turler && turler.length) g.hesaplar = Object.fromEntries(turler.map(t => [t, (bul(`selTsHesap-${t}`) || {}).value || '']));
    if (d) AG.dom.mesgul(d, 'Kaydediliyor…');
    try {
      const r = await sermayeGonder(g);
      if (r && r.iptal) { bildir('Sermaye değişmedi.', 'bilgi'); return; }
      if (!r || !r.success) bildir('Kaydedilmedi: ' + ((r && r.error) || 'hata'), 'hata'); else bildir('Model sermayesi kaydedildi (yalnız bu bilgisayarda).', 'ok');
    } finally { if (d) AG.dom.hazir(d); }
    uyg = null; await yenidenYukle();
  }
  /** Kart içi sermaye kutusu (yalnız o model). */
  async function sermayeTek(id, d) {
    const tutar = String((bul(`inpTsSermayeTek-${id}`) || {}).value || '').trim();
    if (!tutar) { bildir('Tutarı yazın.', 'uyari'); return; }
    if (d) AG.dom.mesgul(d, 'Kaydediliyor…');
    try {
      const r = await sermayeGonder({ modeller: { [id]: { tutar } } });
      if (r && r.iptal) return;
      if (!r || !r.success) bildir('Kaydedilmedi: ' + ((r && r.error) || 'hata'), 'hata'); else bildir('Model sermayesi kaydedildi (yalnız bu bilgisayarda).', 'ok');
    } finally { if (d) AG.dom.hazir(d); }
    uyg = null; await yenidenYukle();
  }
  async function hedefAktar(yazma, d) {
    if (d) AG.dom.mesgul(d, yazma ? 'Kaydediliyor…' : 'Hesaplanıyor…');
    try {
      const r = await T().hedefAktar(yazma ? { duzey: hedefDuzey, ay: EM && EM.ay, yazma: true, imza: hedefOn && hedefOn.imza } : { duzey: hedefDuzey, ay: EM && EM.ay });
      if (yazma) {
        if (!r || !r.success) bildir('Kaydedilmedi: ' + ((r && r.error) || 'hata'), 'hata'); else { bildir('Portföyüm hedef dağılımı güncellendi.', 'ok'); hedefOn = null; }
      } else hedefOn = r || { success: false, error: 'yanıt yok' };
    } finally { if (d) AG.dom.hazir(d); }
    buAyEmirCiz();
  }

  /** 62.4: her modelin "Bu ay" kartı kendi Portföy sekmesindeki #pfBuAy-<id> kabına; sekme adında açık iş sayısı. */
  const SEKME_AD = { 'm-qqq-m10': 'nasdaq', 'm-bist-m10': 'bist', 'm-837': 'q837' };
  function modelBuAyCiz() {
    if (!EM) return;
    const oM = (id) => ((O && O.modeller) || []).find(x => x.id === id) || null;
    for (const m of EM.modeller || []) {
      const kap = bul(`pfBuAy-${m.id}`);
      if (kap) doldur(kap, [emirKarti(m, oM(m.id), true)]);
      const rz = bul(`pfIsSayi-${SEKME_AD[m.id]}`);
      if (rz) {
        const n = tumSatirlar(m).filter(x => !x.uygulandi && x.uygulanabilir).length;
        const goster = !m.atla && n > 0 && !['uygulandi', 'islem-yok', 'atlandi', 'suresi-gecti'].includes(m.durum);
        rz.textContent = goster ? `${n} iş` : '';
        rz.classList.toggle('is-hidden', !goster);
      }
    }
    ikonla();
  }

  let ayarAcik = null;   // Ayarlar katı: null = varsayılan (sermaye hiç girilmemişse açık)
  function buAyEmirCiz() {
    const k = bul('tsEmirler'), ks = bul('tsSermaye'), oz = bul('tsBuAyOzetKap'), ay = bul('tsAyarlar');
    const sira = EM ? MODEL_SIRA.map(id => (EM.modeller || []).find(m => m.id === id)).filter(Boolean) : [];
    const oM = (id) => ((O && O.modeller) || []).find(x => x.id === id) || null;
    if (oz) doldur(oz, EM && sira.length ? [ozetSerit(sira)] : []);
    if (ay) {
      const ac = ayarAcik == null ? !!(EM && !EM.sermayeTanimli && !EM.tutarGizli) : ayarAcik;
      if (ay.open !== ac) ay.open = ac;
    }
    const gom = !!bul('pfModel-m-qqq-m10');
    if (k && gom) {
      // 62.4: model sekmeleri — kartlar her modelin sekmesinde (modelBuAyCiz); burada yalnız ortak notlar
      doldur(k, [
        !EM ? el('p', { class: 'hint mb-0', text: 'Bu ayın emir listesi yüklenemedi.' }) : null,
        EM && EM.portfoyumBos ? rehber() : null,
        EM && !EM.portfoyumBos && EM.eksikHesap && EM.eksikHesap.length ? el('p', { class: 'pf-uyari pf-uyari-bilgi mb-0', text: `Portföy › Hesaplar'da açık hesap yok: ${EM.eksikHesap.map(t => HESAP_TUR_AD[t] || t).join(', ')} — o modelin emirleri "uygulanamaz" görünür; Portföy › Hesaplar'dan açın.` }) : null
      ]);
      k.classList.toggle('is-hidden', !k.childElementCount);
      modelBuAyCiz();
    } else if (k) {
      doldur(k, [
        baslik(`Bu ay${EM ? ` — ${ayMetni(EM.ay)}` : O && O.bugun ? ` — ${ayMetni(O.bugun.slice(0, 7))}` : ''}: kendi hesabında yapılacaklar`, yardim('emirListesi')),
        el('p', { class: 'hint hint-sm mb-2', text: 'Model portföylerin bu ayki kararını kendi hesabına uygulamak için aşağıdaki emirleri aracı kurumda (Midas) sen girersin; sonra "Uyguladım" ile Portföyüm\'e tek onayla kaydedilir.' }),
        el('details', { class: 'hs-kat-mini mb-3', id: 'tsNasilKat' }, [el('summary', { text: 'Nasıl uygulanır? (emir sırası, adet, saatler)' }),
          el('ul', { class: 'hint hint-sm mb-0' }, [
            el('li', { text: 'Sıra: önce satış, sonra hesaplar arası aktarım, sonra alış.' }),
            el('li', { text: EM && EM.ayarlar && EM.ayarlar.kesirli ? 'ABD hisselerinde kesirli adet (Ayarlar: kesirli hisse açık); BIST her zaman tam adet.' : 'Tam adet (kesirli hisse alınmaz — Ayarlar\'dan açılır).' }),
            el('li', { text: 'Tahmini fiyat son kapanıştır; aracı kurumda gerçekleşen fiyatı "Uyguladım" formunda düzeltirsin.' }),
            el('li', { text: 'Emir saati (Türkiye saati): ABD açılışı 17:30 (1 Kasım 2026 – 14 Mart 2027 kış saati), sonra 16:30 — BIST açılışı 10:00.' }),
            el('li', { text: 'Ay sonu kararları kendiliğinden alınır ve dondurulur; modelin kendi sanal hesabı uygulama günü açılışında kendiliğinden uygulanır (Model portföyler sekmesi).' })
          ])]),
        !EM ? el('p', { class: 'hint mb-0', text: 'Emir listesi yüklenemedi.' }) : null,
        EM && EM.portfoyumBos ? rehber() : null,
        EM && !EM.portfoyumBos && EM.eksikHesap && EM.eksikHesap.length ? el('p', { class: 'pf-uyari pf-uyari-bilgi mb-3', text: `Portföyüm'de açık hesap yok: ${EM.eksikHesap.map(t => HESAP_TUR_AD[t] || t).join(', ')} — o modelin satırları "uygulanamaz" görünür; Portföy › Kayıt'tan açın.` }) : null,
        EM && EM.tutarGizli ? el('p', { class: 'hint hint-sm mb-2', text: 'Tutarlar telefonda gizli (sermaye ayarı).' }) : null,
        EM ? el('div', { id: 'tsEmirKartlar', class: 'ts-emir-izgara' }, sira.map(m => emirKarti(m, oM(m.id)))) : null
      ]);
    }
    if (ks) {
      doldur(ks, [
        el('div', { id: 'tsSermayeKap', class: 'mb-3' }, [baslik('Model sermayesi', yardim('modelSermayesi')), EM ? sermayePaneli() : null, telefonNotu('Sermaye yalnız sunucudaki panelden girilir.')]),
        el('div', { id: 'tsHedefKap' }, [baslik('Portföyüm hedefini güncelle'), EM ? hedefPaneli() : null, telefonNotu('Hedef yalnız sunucudaki panelden kaydedilir.')])
      ]);
    }
    ikonla();
  }

  // ═══ 6. BU AY (C5) — kararlar ═══════════════════════════════════════════
  function eksikMetni(e) { return (e || []).map(x => (typeof x === 'string' ? x : x && (x.s || x.sembol) ? `${x.s || x.sembol}${x.neden ? ` (${x.neden})` : ''}` : JSON.stringify(x))).join(', '); }
  function dengeleme837(liste) {
    const d = (liste || []).filter(x => x && x.tur2 === 'dengeleme').pop();
    return d || null;
  }
  /**
   * Bu ay (B-09 düzeni): uyarı bandı → model başına tek satırlık durum özeti → Ayarlar katı (sermaye, kesirli, en küçük işlem,
   * telefonda gizle, Portföyüm hedefi) → model kartları (karar + emir listesi + Uyguladım birleşik). "Sıradaki kararlar" yalnız
   * Tasarımcı'da (karar takvimi). Kararın kendisi /oneri'den (O), emirler /emirler'den (EM).
   */
  function buAyCiz() {
    const k = bul('pfBuAyKok');
    if (!k) return;
    const ayarlar = el('details', { id: 'tsAyarlar', class: 'glass-panel panel-pad mb-3 ts-ayarlar', ontoggle: (e) => { ayarAcik = !!e.target.open; } }, [
      el('summary', { class: 'ts-ayarlar-baslik', text: 'Ayarlar — her modele ayırdığın sermaye, kesirli hisse, en küçük işlem, telefonda gizleme, Portföyüm hedefi' }),
      el('div', { id: 'tsSermaye', class: 'mt-3' })
    ]);
    const gom = !!bul('pfModel-m-qqq-m10');
    doldur(k, [
      !O ? el('p', { class: 'pf-uyari pf-uyari-uyari mb-3', text: 'Bu ayın kararları yüklenemedi.' }) : null,
      gom ? null : el('div', { id: 'tsBuAyOzetKap' }),
      el('div', { id: 'tsEmirler', class: gom ? 'mb-3' : 'glass-panel panel-pad mb-3' }),
      ayarlar
    ]);
    buAyEmirCiz();
  }

  // ═══ İSKELET + YÜKLEME ══════════════════════════════════════════════════
  function iskelet() {
    const k = bul('pfTasarimciKok');
    if (!k) return false;
    doldur(k, [
      el('div', { id: 'tsUyariKap' }, [uyariBandi(null)]),
      el('div', { id: 'tsModeller', class: 'glass-panel panel-pad mb-3' }),
      el('div', { id: 'tsTakvim', class: 'glass-panel panel-pad mb-3' }),
      el('div', { class: 'ts-kurucu-duzen mb-3' }, [el('div', { id: 'tsKurucu', class: 'glass-panel panel-pad' }), el('div', { id: 'tsHalka', class: 'glass-panel panel-pad' })]),
      el('div', { id: 'tsKayitli', class: 'glass-panel panel-pad mb-3' }),
      el('div', { id: 'tsIs', class: 'ilerleme-kutu is-hidden', 'aria-live': 'polite' }),
      el('div', { id: 'tsRisk', class: 'glass-panel panel-pad mb-3' }),
      el('div', { id: 'tsKatalog', class: 'glass-panel panel-pad' })
    ]);
    return true;
  }
  function hepsiniCiz() {
    const u = bul('tsUyariKap');
    if (u) doldur(u, [uyariBandi(DU && DU.uyari)]);
    modellerCiz(); takvimCiz(); kurucuCiz(); kayitliCiz(); riskCiz(sonRisk); katalogCiz(); ikonla();
  }
  const guvenli = (p) => p.then(r => (r && r.success !== false ? r : null)).catch(() => null);
  async function veriAl() {
    const [k, m, du, o, d837] = await Promise.all([guvenli(T().katalog()), guvenli(T().modeller()), guvenli(T().durum()), guvenli(T().oneri()), guvenli(T().kararlar('m-837'))]);
    K = k; M = m; DU = du; O = o; D837 = d837 ? d837.kararlar : null;
  }
  /** Tasarımcı sekmesi ek verisi: kayıtlı tasarımlar (Bu ay'da gerekmez). */
  async function tasarimciVeriAl() { await Promise.all([veriAl(), tasarimlarAl()]); }
  /** Portföy › Tasarımcı açılınca. */
  async function yukle() {
    if (!bul('pfTasarimciKok') || yukleniyor) return;
    if (!bul('tsModeller')) iskelet();
    if (!kurucu) kurucu = kurucuOku();
    yukleniyor = true;
    try { await tasarimciVeriAl(); hepsiniCiz(); } finally { yukleniyor = false; }
  }
  /** Portföy › Bu ay açılınca. */
  async function buAyYukle() {
    if (!bul('pfBuAyKok')) return;
    try { await Promise.all([veriAl(), emirlerAl()]); } finally { buAyCiz(); }
  }

  const sayfa = {
    yukle, buAyYukle, modelBuAyCiz, _bekle: bekle,
    // saf (test)
    etiketle, tanimKur, dilimler, takvimModel, suzgecUygun, puan,
    // çizim (test)
    katalogCiz, kurucuCiz, riskCiz, buAyCiz, sablonUygula, kolEkle, riskDene, kayitliCiz, tasarimIslem, kurucuyaYukle, modelIzlemeCiz, uyariSade, toplamMetni, DENGE_TANIM, buAyEmirCiz, formKur, formGovde,
    uygOnizle, uygOnayla, atla, geriAl, sermayeKaydet, sermayeTek, hedefAktar, onizlemeToplam, ortakEngel, yapilacak,
    emirDurumu: () => ({ EM, uyg, atlaAcik, geriAcik, hedefOn }),
    durumYaz: (x) => { if ('EM' in x) EM = x.EM; if ('uyg' in x) uyg = x.uyg; if ('K' in x) K = x.K; if ('M' in x) M = x.M; if ('DU' in x) DU = x.DU; if ('O' in x) O = x.O; if ('D837' in x) D837 = x.D837; if ('kurucu' in x) kurucu = x.kurucu; if ('TL' in x) TL = x.TL; if ('suzgec' in x) suzgec = x.suzgec; },
    kurucu: () => kurucu, sonRisk: () => sonRisk
  };
  AG.pages = AG.pages || {};
  AG.pages.tasarimci = sayfa;
  if (typeof module !== 'undefined' && module.exports) module.exports = sayfa;
})(typeof window !== 'undefined' ? window : globalThis);
