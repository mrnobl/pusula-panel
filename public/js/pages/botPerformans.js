/**
 * BOTLARIMIZIN GERÇEKLEŞMİŞ SONUÇLARI (68.3, PLAN-TASIMA §4 / F5) `AG.pages.botPerformans`
 * ═══════════════════════════════════════════════════════════════════════════
 * Yeni kurulum bomboş açılır (K6): kullanıcı kendi botunu çalıştırmadan önce, kullanacağı botların GELİŞTİRİCİNİN kendi
 * hesaplarındaki sonuçlarını görür. Veri: dağıtımla gelen statik `performans/bot-performans.json` (scripts/bot-performans.js
 * üretir; yalnız yüzde / endeks — tutar, bakiye, miktar, kimlik yok). Her kartta kaynak, tarih aralığı ve
 * "geçmiş sonuç geleceği göstermez".
 *   · Ana sayfa (#anaBotPerformans): YALNIZ yeni kurulumda (GET /api/kurulum → eski değil) — kısa metin, grafik yok (Ana sayfa
 *     kuralı: grafikler Botlar / Portföy'de); "Ayrıntı: Botlar".
 *   · Botlar (#botPerformans): yeni kurulumda açık kart (grafikli); kendi verisi olan kurulumda (eski) kapalı, ikincil satır.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  /** 72.0: paket metni eski bot adıyla gelebilir → yeni ad (AG.botAd). */
  const cv = (t) => (AG.botAd ? AG.botAd.cevir(t) : t);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const SVG = 'http://www.w3.org/2000/svg';

  let veri = null;
  let yeniKurulum = null;
  let zorla = false;

  const yz = (x) => (x == null || !Number.isFinite(+x) ? '—' : `${x > 0 ? '+' : ''}${(+x).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`);
  const gunYaz = (g) => { const p = String(g || '').split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(g || ''); };

  /** Saf: seriler → SVG yol noktaları (ortak y ekseni). seriler: [[[gün, değer], …], …] → { noktalar: [string], min, max } */
  function olcekle(seriler, gen = 320, yuk = 110, pay = 6) {
    const hepsi = seriler.flat().map(x => x[1]).filter(Number.isFinite);
    if (!hepsi.length) return { noktalar: seriler.map(() => ''), min: null, max: null };
    let min = Math.min(...hepsi), max = Math.max(...hepsi);
    if (max - min < 1) { min -= 0.5; max += 0.5; }
    const gunler = [...new Set(seriler.flat().map(x => x[0]))].sort();
    const xi = (g) => (gunler.length > 1 ? pay + (gen - 2 * pay) * gunler.indexOf(g) / (gunler.length - 1) : gen / 2);
    const yi = (v) => pay + (yuk - 2 * pay) * (1 - (v - min) / (max - min));
    return { noktalar: seriler.map(s => s.filter(x => Number.isFinite(x[1])).map(x => `${xi(x[0]).toFixed(1)},${yi(x[1]).toFixed(1)}`).join(' ')), min, max, y100: yi(100) };
  }

  function grafik(seriler, etiket) {
    const gen = 320, yuk = 110;
    const o = olcekle(seriler.map(s => s.seri), gen, yuk);
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${gen} ${yuk}`);
    svg.setAttribute('class', 'bp-grafik');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', etiket);
    if (o.y100 != null && o.y100 >= 0 && o.y100 <= yuk) {
      const c = doc.createElementNS(SVG, 'line');
      c.setAttribute('x1', '0'); c.setAttribute('x2', String(gen)); c.setAttribute('y1', o.y100.toFixed(1)); c.setAttribute('y2', o.y100.toFixed(1));
      c.setAttribute('class', 'bp-taban');
      svg.appendChild(c);
    }
    seriler.forEach((s, i) => {
      const p = doc.createElementNS(SVG, 'polyline');
      p.setAttribute('points', o.noktalar[i]);
      p.setAttribute('class', `bp-cizgi bp-cizgi-${i === 0 ? 'ana' : 'kiyas'}`);
      p.setAttribute('fill', 'none');
      svg.appendChild(p);
    });
    return svg;
  }

  const satirlar = (x, kiyaslar) => el('ul', { class: 'bp-sayilar' }, [
    el('li', {}, [el('span', { class: 'df-soluk', text: 'Getiri ' }), el('strong', { text: yz(x.getiriYuzde) })]),
    el('li', {}, [el('span', { class: 'df-soluk', text: 'En derin düşüş ' }), el('strong', { text: yz(x.enDerinDususYuzde) })]),
    x.islemSayisi != null ? el('li', {}, [el('span', { class: 'df-soluk', text: 'İşlem ' }), el('strong', { text: String(x.islemSayisi) })]) : null,
    ...kiyaslar.slice(0, 2).map(k => el('li', {}, [el('span', { class: 'df-soluk', text: `${k.baslik} ` }), el('strong', { text: yz(k.getiriYuzde) })])),
  ]);

  function kart(x, grafikli) {
    if (!x.veriVar) return el('div', { class: 'bp-kart' }, [el('h4', { class: 'bp-baslik', text: cv(x.baslik) }), el('p', { class: 'hint mb-0', text: x.neden || 'Henüz sonuç yok.' })]);
    const kiyaslar = x.kiyas ? [x.kiyas] : (x.kiyaslar || []);
    return el('div', { class: 'bp-kart', 'data-kimlik': x.ad || x.kimlik }, [
      el('h4', { class: 'bp-baslik', text: cv(x.baslik) }),
      el('p', { class: 'df-soluk bp-kunye', text: `${x.hesap} · ${gunYaz(x.bas)} – ${gunYaz(x.bit)} (${x.gunSayisi} gün)` }),
      grafikli ? grafik([{ seri: x.seri }, ...(kiyaslar[0] ? [{ seri: kiyaslar[0].seri }] : [])], `${cv(x.baslik)}: başlangıç 100, ${kiyaslar[0] ? kiyaslar[0].baslik + ' ile' : ''}`) : null,
      grafikli && kiyaslar[0] ? el('p', { class: 'bp-lejant df-soluk' }, [el('span', { class: 'bp-l-ana', text: '━ ' + cv(x.baslik) }), el('span', { class: 'bp-l-kiyas', text: '  ━ ' + kiyaslar[0].baslik })]) : null,
      satirlar(x, kiyaslar),
    ]);
  }

  /** Botlar sayfası kartı (grafikli). acik: yeni kurulumda açık, kendi verisi olan kurulumda kapalı (ikincil). */
  function botlarCiz(kap, v, acik) {
    const icerik = [
      el('p', { class: 'hint mb-3 max-w-prose', text: `${v.kaynak} Kendi botun çalıştıkça burada değil, bot sayfasında kendi sonuçların görünür.` }),
      el('h4', { class: 'bp-grup', text: 'Botlar (demo hesap)' }),
      el('div', { class: 'bp-izgara' }, (v.botlar || []).map(x => kart(x, true))),
      el('h4', { class: 'bp-grup', text: 'Model portföyler (kâğıt hesap)' }),
      el('div', { class: 'bp-izgara' }, (v.modeller || []).map(x => kart(x, true))),
      el('p', { class: 'bp-uyari', text: `⚠ ${v.uyari}` }),
      el('p', { class: 'df-soluk', text: `Paket: Pusula ${v.surum || '?'} · ${gunYaz(v.uretim)}` }),
    ];
    const d = el('details', { class: 'glass-panel panel-pad mb-4 bp-kap', id: 'botPerformansKart' }, [
      el('summary', { class: 'bp-ozet' }, [el('strong', { text: 'Botlarımızın gerçekleşmiş sonuçları' }),
        el('span', { class: 'df-soluk', text: acik ? ' — geliştiricinin kendi hesaplarından' : ' — yeni kullanıcılar için örnek (geliştiricinin hesapları)' })]),
      ...icerik,
    ]);
    if (acik) d.open = true;
    doldur(kap, [d]);
  }

  /** Ana sayfa kısa kartı (grafik yok). */
  function anaCiz(kap, v) {
    const h = (v.botlar || []).find(x => x.veriVar);
    const m = (v.modeller || []).filter(x => x.veriVar);
    doldur(kap, [
      el('h3', { class: 'card-title mb-3', text: 'Botlarımızın gerçekleşmiş sonuçları' }),
      h ? el('p', { class: 'mb-2', text: `${cv(h.baslik)} (demo, ${gunYaz(h.bas)} – ${gunYaz(h.bit)}): ${yz(h.getiriYuzde)} · en derin düşüş ${yz(h.enDerinDususYuzde)}${h.kiyas ? ` · aynı dönemde BTC ${yz(h.kiyas.getiriYuzde)}` : ''}.` }) : null,
      m.length ? el('p', { class: 'mb-2', text: `Model portföyler (kâğıt hesap): ${m.map(x => `${cv(x.baslik)} ${yz(x.getiriYuzde)}`).join(' · ')}.` }) : null,
      el('p', { class: 'hint mb-2', text: v.uyari }),
      el('a', { href: '#/botlar', text: 'Grafikler ve ayrıntı: Botlar' }),
    ]);
    kap.classList.remove('is-hidden');
  }

  async function veriAl() {
    if (veri) return veri;
    try {
      const r = await global.fetch('performans/bot-performans.json', { cache: 'no-cache' });
      veri = r.ok ? await r.json() : null;
    } catch (e) { veri = null; }
    return veri;
  }
  async function yeniMi() {
    if (zorla) return true;
    if (yeniKurulum != null) return yeniKurulum;
    try { const k = await AG.api.kurulum.durum(); yeniKurulum = !!(k && k.success && !k.eski); } catch (e) { yeniKurulum = false; }
    return yeniKurulum;
  }

  async function botlarYukle() {
    const kap = bul('botPerformans');
    if (!kap) return;
    const v = await veriAl();
    if (!v) { doldur(kap, []); return; }
    botlarCiz(kap, v, await yeniMi());
  }
  async function anaYukle() {
    const kap = bul('anaBotPerformans');
    if (!kap) return;
    const v = await veriAl();
    if (!v || !(await yeniMi())) { kap.classList.add('is-hidden'); doldur(kap, []); return; }
    anaCiz(kap, v);
  }

  /** Kılavuz görüntüsü / deneme: bu kurulumda da yeni kurulum gibi göster. */
  async function goster() { zorla = true; await Promise.all([anaYukle(), botlarYukle()]); }

  if (doc && doc.addEventListener) doc.addEventListener('ag:rota', (e) => {
    const b = e.detail && e.detail.bolum;
    if (b === 'tab-botlar') botlarYukle();
    else if (b === 'tab-ana') anaYukle();
  });

  AG.pages = AG.pages || {};
  AG.pages.botPerformans = { botlarYukle, anaYukle, goster, olcekle, _ciz: { botlarCiz, anaCiz, kart } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.botPerformans;
})(typeof window !== 'undefined' ? window : globalThis);
