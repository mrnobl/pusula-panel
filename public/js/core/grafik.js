/**
 * ANA GRAFİK — Pusula grafik dili (PLAN-PANEL-PUSULA §4a/4) `AG.grafik`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Güven bandı + kriz dönemleri": strateji/portföy KALIN YEŞİL çizgi, %5–%95 bootstrap
 * aralığı AÇIK YEŞİL bant, kriz/stres dönemleri ALTIN gölge + etiket, kıyaslar (al-tut,
 * BTC) GRİ İNCE çizgi, düşüşler altta ayrı şeritte NEGATİF renkte. Her ekran aynı
 * fonksiyonu çağırır; ikinci bir çizim kodu yazılmaz.
 *
 * SVG + CSS sınıfı: renkler tokens.css'teki grafik rolleri (`--chart-1`, `--chart-bant`,
 * `--chart-kriz`, `--chart-notr`, `--neg`) — tema değişince yeniden çizim gerekmez, inline
 * stil yok. Genişlik kabın o anki genişliğidir (telefonda yazı okunur kalsın diye viewBox
 * ölçeklenmez); pencere boyu değişince kayıtlı grafikler yeniden çizilir.
 *
 *   AG.grafik.ana(kap, {
 *     seri:   [{ t, v }],                 ana çizgi (t: ms)
 *     kiyas:  [{ ad, seri: [{ t, v }], vurgu?, renk? }], gri ince çizgiler (renk: 2–8 → --seri-N renkli ince çizgi, 62.4) (vurgu: true → kesikli renkli, ör. F5 gerçek portföy) (ilk noktası ana seriye taşınmaz — aynı ölçek)
 *     bant:   true | { alt: [v], ust: [v] } | null   true → bootstrapBant(seri)
 *     krizler:[{ ad, bas, bit }],          bas/bit ISO gün ya da ms
 *     isinma: { bas, bit, ad? }            gri gölge: göstergelerin dolduğu, işlem yapılmayan baş dönem (B-28)
 *     dusus:  true                         altta düşüş şeridi
 *     isaretler: [{ t, tur: "al"|"sat", etiket }]  alım ▲ / satım ▼ (61.4)
 *     ad, birim: '$', etiket: 'Strateji', bantEtiketi
 *   })
 *   AG.grafik.bootstrapBant(degerler, { n, blok, tohum })  → { alt, ust }  (saf)
 *   AG.grafik.dususSerisi(degerler)                         → [≤ 0 oran]   (saf)
 */
(function (global) {
  'use strict';
  const AG = global.AG || (global.AG = {});

  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const zaman = (x) => (typeof x === 'number' ? x : Date.parse(x));

  /** Sabit tohumlu üreteç (mulberry32) — aynı veri her açılışta aynı bandı verir. */
  function uretec(tohum) {
    let a = (tohum >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * DURAĞAN BLOK BOOTSTRAP BANDI — "aynı getiriler başka sırayla gelseydi".
   * Ardışık noktalar arası getiriler blok blok (ortalama `blok` uzunluk) yeniden örneklenir,
   * `n` yol kurulur, her noktada %5 ve %95 değeri alınır. Bant ilk noktada sıfır genişlikte
   * başlar (hepsi aynı sermayeyle) ve son noktada sonucun ne kadar SIRAYA bağlı olduğunu
   * gösterir. Kehanet değildir; geçmişin dağılımıdır.
   */
  function bootstrapBant(degerler, secenek = {}) {
    const v = (degerler || []).filter(sayiMi);
    const m = v.length;
    if (m < 3 || v.some(x => x <= 0)) return null;
    const n = secenek.n || 200;
    const blok = Math.max(1, secenek.blok || 10);
    const alt = secenek.alt != null ? secenek.alt : 0.05;
    const ust = secenek.ust != null ? secenek.ust : 0.95;
    const r = [];
    for (let i = 1; i < m; i++) r.push(v[i] / v[i - 1]);
    const k = r.length;
    const rnd = uretec(secenek.tohum || 7);
    const yollar = new Array(m);
    for (let i = 0; i < m; i++) yollar[i] = new Float64Array(n);
    for (let y = 0; y < n; y++) {
      let deger = v[0];
      yollar[0][y] = deger;
      let j = Math.floor(rnd() * k);
      for (let i = 1; i < m; i++) {
        if (rnd() < 1 / blok) j = Math.floor(rnd() * k); else j = (j + 1) % k;
        deger *= r[j];
        yollar[i][y] = deger;
      }
    }
    const altD = new Array(m), ustD = new Array(m);
    const iA = Math.max(0, Math.min(n - 1, Math.floor(alt * (n - 1))));
    const iU = Math.max(0, Math.min(n - 1, Math.ceil(ust * (n - 1))));
    for (let i = 0; i < m; i++) {
      const s = Array.from(yollar[i]).sort((a, b) => a - b);
      altD[i] = s[iA]; ustD[i] = s[iU];
    }
    return { alt: altD, ust: ustD, n, blok };
  }

  /** Koşan tepeden düşüş oranı (≤ 0): v / tepe − 1. */
  function dususSerisi(degerler) {
    let tepe = -Infinity;
    return (degerler || []).map(x => {
      if (!sayiMi(x)) return null;
      tepe = Math.max(tepe, x);
      return tepe > 0 ? x / tepe - 1 : 0;
    });
  }

  /** Eksen için "yuvarlak" adımlar. */
  function adimlar(min, max, hedef) {
    if (!(max > min)) return [min];
    const ham = (max - min) / Math.max(1, hedef);
    const us = Math.pow(10, Math.floor(Math.log10(ham)));
    const kat = [1, 2, 2.5, 5, 10].find(k => k * us >= ham) * us;
    const out = [];
    for (let x = Math.ceil(min / kat) * kat; x <= max + kat * 1e-9; x += kat) out.push(+x.toPrecision(12));
    return out;
  }

  /** Log eksen için 1-2-5 × 10^k adımlar; çoksa seyreltilir. */
  function logAdimlar(min, max, en) {
    const out = [];
    for (let k = Math.floor(Math.log10(min)); k <= Math.ceil(Math.log10(max)); k++) {
      for (const c of [1, 2, 5]) { const v = c * Math.pow(10, k); if (v >= min && v <= max) out.push(v); }
    }
    if (out.length <= en) return out;
    const adim = Math.ceil(out.length / en);
    return out.filter((_, i) => i % adim === 0);
  }

  const kisaSayi = (x) => {
    const a = Math.abs(x);
    // B-27 (61.1): "30 B" milyar sanılıyordu → "30 bin", "1,2 mn", "3,4 mr".
    if (a >= 1e9) return `${(x / 1e9).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} mr`;
    if (a >= 1e6) return `${(x / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} mn`;
    if (a >= 1e4) return `${(x / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} bin`;
    return x.toLocaleString('tr-TR', { maximumFractionDigits: a < 10 ? 2 : 0 });
  };
  /** Eksen etiketi: para birimi SONDA ("30 bin $", "9.500 $") — Türkçe yazım; birimsiz seri yalnız sayı. */
  const eksenEtiketi = (v, birim) => (birim ? `${kisaSayi(v)} ${birim}` : kisaSayi(v));
  const gunStr = (t) => new Date(t).toISOString().slice(0, 10);

  /** Zaman ekseni etiketleri: aralığa göre yıl / ay / gün. */
  function zamanEtiketleri(t0, t1, adet) {
    const aralik = t1 - t0;
    const out = [];
    for (let i = 0; i <= adet; i++) {
      const t = t0 + aralik * i / adet;
      const g = gunStr(t);
      out.push({ t, metin: aralik > 3 * 365 * 864e5 ? g.slice(0, 7) : aralik > 60 * 864e5 ? g.slice(0, 7) : g.slice(5) });
    }
    return out;
  }

  const kayitli = new Set();
  let boyutBagli = false;
  function boyutBagla() {
    if (boyutBagli || !global.addEventListener) return;
    boyutBagli = true;
    let zamanlayici = null;
    global.addEventListener('resize', () => {
      if (zamanlayici) global.clearTimeout(zamanlayici);
      zamanlayici = global.setTimeout(() => {
        for (const kap of kayitli) {
          if (!kap.isConnected && kap.isConnected !== undefined) { kayitli.delete(kap); continue; }
          if (kap.__grafik && kap.clientWidth && kap.clientWidth !== kap.__grafik.genislik) ana(kap, kap.__grafik.veri);
        }
      }, 150);
    });
  }

  /**
   * Ana grafiği kabın içine çizer (kabın eski içeriği silinir).
   * @returns {{ genislik, yukseklik, nokta }} çizim ölçüsü (testler için)
   */
  function ana(kap, veri) {
    if (!kap || !AG.dom) return null;
    const { el, svg, doldur } = AG.dom;
    const seri = (veri && veri.seri || []).map(p => ({ t: zaman(p.t), v: p.v })).filter(p => sayiMi(p.t) && sayiMi(p.v));
    if (seri.length < 2) {
      doldur(kap, [el('p', { class: 'hint mb-0', text: (veri && veri.bosMetin) || 'Grafik için yeterli veri yok.' })]);
      return null;
    }
    const birim = (veri && veri.birim) || '';
    const W = Math.max(280, Math.round(kap.clientWidth || 800));
    const dar = W < 640;
    const solB = dar ? 44 : 58, sagB = 8, ustB = 20;
    const anaH = dar ? 190 : 240;
    const dususVar = veri.dusus !== false;
    const dususH = dususVar ? (dar ? 54 : 64) : 0;
    const ara = dususVar ? 22 : 0;
    const altB = 20;
    const H = ustB + anaH + ara + dususH + altB;
    const t0 = seri[0].t, t1 = seri[seri.length - 1].t;
    const x = (t) => solB + (W - solB - sagB) * (t1 > t0 ? (t - t0) / (t1 - t0) : 0);

    const kiyas = (veri.kiyas || []).map(k => ({ ad: k.ad, vurgu: !!k.vurgu, renk: Number.isInteger(k.renk) && k.renk >= 2 && k.renk <= 8 ? k.renk : null, seri: (k.seri || []).map(p => ({ t: zaman(p.t), v: p.v })).filter(p => sayiMi(p.t) && sayiMi(p.v) && p.t >= t0 && p.t <= t1) }))
      .filter(k => k.seri.length > 1);
    let bant = veri.bant === true ? bootstrapBant(seri.map(p => p.v), veri.bantSecenek) : veri.bant;
    if (bant && (!bant.alt || bant.alt.length !== seri.length)) bant = null;

    let ymin = Infinity, ymax = -Infinity;
    const genislet = (v) => { if (sayiMi(v)) { if (v < ymin) ymin = v; if (v > ymax) ymax = v; } };
    seri.forEach(p => genislet(p.v));
    kiyas.forEach(k => k.seri.forEach(p => genislet(p.v)));
    if (bant) { bant.alt.forEach(genislet); bant.ust.forEach(genislet); }
    /**
     * LOG ÖLÇEK — değerler 8 kattan fazla açılıyorsa (ör. BTC al-tut ×10) doğrusal eksen stratejiyi
     * dümdüz bir çizgiye ezer; oransal hareketler log eksende karşılaştırılabilir. `veri.log` ile zorlanır.
     */
    const log = veri.log === true || (veri.log !== false && ymin > 0 && ymax / ymin > 8);
    let y;
    if (log) {
      const a = Math.log(ymin) - 0.04 * Math.log(ymax / ymin), b = Math.log(ymax) + 0.04 * Math.log(ymax / ymin);
      ymin = Math.exp(a); ymax = Math.exp(b);
      y = (v) => ustB + anaH * (1 - (Math.log(Math.max(v, 1e-12)) - a) / (b - a));
    } else {
      const pay = (ymax - ymin) * 0.06 || Math.abs(ymax) * 0.05 || 1;
      ymin -= pay; ymax += pay;
      y = (v) => ustB + anaH * (1 - (v - ymin) / (ymax - ymin));
    }

    const yol = (noktalar) => noktalar.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const parcalar = [];

    // 1. Kriz gölgeleri (her iki şeridi kaplar) + etiket.
    const krizler = (veri.krizler || []).map(k => ({ ad: k.ad, bas: zaman(k.bas), bit: zaman(k.bit) + (typeof k.bit === 'string' && k.bit.length <= 10 ? 864e5 : 0) }))
      .filter(k => sayiMi(k.bas) && sayiMi(k.bit) && k.bit > t0 && k.bas < t1);
    let sonEtiketBiter = -Infinity, ikinciSiraBiter = -Infinity;
    krizler.forEach((k) => {
      const xa = x(Math.max(k.bas, t0)), xb = Math.max(xa + 3, x(Math.min(k.bit, t1)));
      parcalar.push(svg('rect', { class: 'grf-kriz', x: xa.toFixed(1), y: ustB, width: (xb - xa).toFixed(1), height: anaH + ara + dususH }, [svg('title', { text: k.ad })]));
      // Etiket: telefonda yalnız geniş dönemde; sağ kenara taşacaksa dönemin sağ ucuna sağa hizalı;
      // önceki etiketle çakışacaksa yazılmaz (ad gölgenin <title>'ında kalır).
      const metin = (xb - xa) > 30 || !dar ? k.ad : '';
      if (!metin) return;
      const gen = metin.length * 6.2;
      const sagaHizali = xa + 2 + gen > W - sagB;
      const bas = sagaHizali ? Math.min(xb, W - sagB) - gen : xa + 2;
      if (bas < solB) return;
      // 60.9: üst sırada çakışırsa ikinci sıraya (çizim alanının üstü) iner; iki sıra da doluysa yazılmaz.
      const sira = bas >= sonEtiketBiter + 6 ? 0 : bas >= ikinciSiraBiter + 6 ? 1 : -1;
      if (sira < 0) return;
      if (sira === 0) sonEtiketBiter = bas + gen; else ikinciSiraBiter = bas + gen;
      parcalar.push(svg('text', { class: 'grf-kriz-etiket', x: (sagaHizali ? Math.min(xb, W - sagB) : xa + 2).toFixed(1), y: sira === 0 ? ustB - 8 : ustB + 12, 'text-anchor': sagaHizali ? 'end' : 'start', text: metin }));
    });

    // 1b. Isınma gölgesi (B-28): ölçümün başındaki işlem yapılmayan dönem — gri, etiketsiz (ad <title>'da).
    const isinma = veri.isinma && sayiMi(zaman(veri.isinma.bas)) && sayiMi(zaman(veri.isinma.bit)) && zaman(veri.isinma.bit) > t0
      ? { ad: veri.isinma.ad || 'Isınma: göstergeler doluyor, işlem yok', bas: Math.max(zaman(veri.isinma.bas), t0), bit: Math.min(zaman(veri.isinma.bit), t1) } : null;
    if (isinma && isinma.bit > isinma.bas) {
      const xa = x(isinma.bas), xb = Math.max(xa + 2, x(isinma.bit));
      parcalar.push(svg('rect', { class: 'grf-isinma', x: xa.toFixed(1), y: ustB, width: (xb - xa).toFixed(1), height: anaH + ara + dususH }, [svg('title', { text: isinma.ad })]));
    }

    // 2. Izgara + y ekseni.
    (log ? logAdimlar(ymin, ymax, dar ? 4 : 6) : adimlar(ymin, ymax, dar ? 3 : 4)).forEach(v => {
      const yy = y(v).toFixed(1);
      parcalar.push(svg('line', { class: 'grf-izgara', x1: solB, x2: W - sagB, y1: yy, y2: yy }));
      parcalar.push(svg('text', { class: 'grf-eksen sayi', x: solB - 6, y: (+yy + 4).toFixed(1), 'text-anchor': 'end', text: eksenEtiketi(v, birim) }));
    });

    // 3. Güven bandı.
    if (bant) {
      const ustY = seri.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(bant.ust[i]).toFixed(1)}`).join('');
      const altY = seri.slice().reverse().map((p, i) => `L${x(p.t).toFixed(1)},${y(bant.alt[seri.length - 1 - i]).toFixed(1)}`).join('');
      parcalar.push(svg('path', { class: 'grf-bant', d: `${ustY}${altY}Z` }));
    }
    // 4. Kıyaslar (gri ince) ve ana çizgi (kalın yeşil).
    kiyas.forEach(k => parcalar.push(svg('path', { class: k.vurgu ? 'grf-kiyas grf-kiyas-vurgu' : k.renk ? `grf-kiyas grf-kiyas-r${k.renk}` : 'grf-kiyas', d: yol(k.seri) }, [svg('title', { text: k.ad })])));
    parcalar.push(svg('path', { class: 'grf-ana', d: yol(seri) }));

    // 4b. Alım ▲ / satım ▼ işaretleri (61.4 kâğıt hesaplar): ana çizginin o günkü noktasında; aynı gün birden çok işlem tek
    // işarette toplanır (<title> hepsini sayar). Alım çizginin altında yukarı, satım üstünde aşağı bakar.
    const isaretler = [];
    for (const m of veri.isaretler || []) {
      const t = zaman(m.t);
      if (!sayiMi(t) || t < t0 || t > t1 || (m.tur !== 'al' && m.tur !== 'sat')) continue;
      let i = 0; while (i < seri.length - 1 && seri[i + 1].t <= t) i++;
      const var_ = isaretler.find(z => z.i === i && z.tur === m.tur);
      if (var_) var_.etiket.push(m.etiket || m.tur); else isaretler.push({ i, tur: m.tur, etiket: [m.etiket || m.tur] });
    }
    for (const z of isaretler) {
      const xx = x(seri[z.i].t), yy = y(seri[z.i].v), r = dar ? 5 : 6;
      const d = z.tur === 'al' ? `M${xx.toFixed(1)},${(yy + 4).toFixed(1)}l${r},${(r * 1.6).toFixed(1)}h${-2 * r}Z` : `M${xx.toFixed(1)},${(yy - 4).toFixed(1)}l${r},${(-r * 1.6).toFixed(1)}h${-2 * r}Z`;
      parcalar.push(svg('path', { class: z.tur === 'al' ? 'grf-isaret-al' : 'grf-isaret-sat', d }, [svg('title', { text: `${gunStr(seri[z.i].t)} · ${z.tur === 'al' ? 'alım' : 'satım'}: ${z.etiket.join(', ')}` })]));
    }

    // 5. Düşüş şeridi.
    let enDerin = 0;
    if (dususVar) {
      const dd = dususSerisi(seri.map(p => p.v));
      enDerin = Math.min(0, ...dd.filter(sayiMi));
      const taban = ustB + anaH + ara;
      const dy = (d) => taban + dususH * (enDerin < 0 ? d / enDerin : 0);
      const d = seri.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${dy(dd[i]).toFixed(1)}`).join('')
        + `L${x(t1).toFixed(1)},${taban}L${x(t0).toFixed(1)},${taban}Z`;
      parcalar.push(svg('line', { class: 'grf-izgara', x1: solB, x2: W - sagB, y1: taban, y2: taban }));
      parcalar.push(svg('path', { class: 'grf-dusus', d }));
      parcalar.push(svg('text', { class: 'grf-eksen', x: solB - 6, y: taban + 12, 'text-anchor': 'end', text: 'Düşüş' }));
      parcalar.push(svg('text', { class: 'grf-eksen sayi', x: solB - 6, y: taban + dususH, 'text-anchor': 'end', text: `%${(enDerin * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` }));
    }

    // 6. Zaman ekseni.
    zamanEtiketleri(t0, t1, dar ? 3 : 5).forEach((e, i, a) => {
      parcalar.push(svg('text', {
        class: 'grf-eksen sayi', x: x(e.t).toFixed(1), y: H - 4,
        'text-anchor': i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle', text: e.metin
      }));
    });

    // 7. İmleç: dikey çizgi + değer (SVG içinde — konum öznitelikle, inline stil yok).
    const imlecCizgi = svg('line', { class: 'grf-imlec is-hidden', x1: 0, x2: 0, y1: ustB, y2: ustB + anaH + ara + dususH });
    const imlecMetin = svg('text', { class: 'grf-imlec-metin sayi is-hidden', x: 0, y: ustB + 12 });
    const yuzey = svg('rect', { class: 'grf-yuzey', x: solB, y: ustB, width: W - solB - sagB, height: anaH + ara + dususH });
    const bicim = veri.bicim || ((v) => `${birim}${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`);
    const imlec = (e) => {
      const kutu = e.currentTarget && e.currentTarget.ownerSVGElement && e.currentTarget.ownerSVGElement.getBoundingClientRect
        ? e.currentTarget.ownerSVGElement.getBoundingClientRect() : null;
      if (!kutu) return;
      const px = (e.clientX - kutu.left) * (W / (kutu.width || W));
      const t = t0 + (t1 - t0) * Math.max(0, Math.min(1, (px - solB) / (W - solB - sagB)));
      let i = 0;
      while (i < seri.length - 1 && seri[i + 1].t <= t) i++;
      const xx = x(seri[i].t);
      imlecCizgi.setAttribute('x1', xx.toFixed(1)); imlecCizgi.setAttribute('x2', xx.toFixed(1));
      imlecMetin.textContent = `${gunStr(seri[i].t)} · ${bicim(seri[i].v)}`;
      const sagda = xx > W * 0.6;
      imlecMetin.setAttribute('x', (sagda ? xx - 6 : xx + 6).toFixed(1));
      imlecMetin.setAttribute('text-anchor', sagda ? 'end' : 'start');
      imlecCizgi.classList.remove('is-hidden'); imlecMetin.classList.remove('is-hidden');
    };
    const gizle = () => { imlecCizgi.classList.add('is-hidden'); imlecMetin.classList.add('is-hidden'); };
    yuzey.addEventListener('pointermove', imlec);
    yuzey.addEventListener('pointerleave', gizle);
    parcalar.push(imlecCizgi, imlecMetin, yuzey);

    const cizim = svg('svg', {
      class: 'grf', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img',
      'aria-label': `${veri.ad || 'Grafik'}: ${gunStr(t0)} – ${gunStr(t1)}, son değer ${bicim(seri[seri.length - 1].v)}${dususVar ? `, en derin düşüş %${(enDerin * 100).toFixed(1)}` : ''}`
    }, parcalar);

    const lj = (sinif, metin) => el('span', { class: 'grf-lj' }, [el('span', { class: `grf-lj-isaret ${sinif}` }), el('span', { text: metin })]);
    const lejant = el('div', { class: 'grf-lejant' }, [
      lj('grf-lj-ana', veri.etiket || 'Strateji'),
      bant ? lj('grf-lj-bant', veri.bantEtiketi || 'Olası sıralamalar %5–%95') : null,
      ...kiyas.map(k => lj(k.vurgu ? 'grf-lj-kiyas grf-lj-vurgu' : k.renk ? `grf-lj-kiyas grf-lj-r${k.renk}` : 'grf-lj-kiyas', k.ad)),
      isaretler.some(z => z.tur === 'al') ? lj('grf-lj-al', 'Alım') : null,
      isaretler.some(z => z.tur === 'sat') ? lj('grf-lj-sat', 'Satım') : null,
      krizler.length ? lj('grf-lj-kriz', 'Kriz dönemi') : null,
      isinma ? lj('grf-lj-isinma', 'Isınma (işlem yok)') : null,
      dususVar ? lj('grf-lj-dusus', 'Tepeden düşüş') : null,
      log ? el('span', { class: 'grf-lj', text: 'Dikey eksen log ölçek (oransal)' }) : null
    ]);
    doldur(kap, [el('div', { class: 'grf-kap' }, [cizim]), lejant]);
    kap.__grafik = { veri, genislik: W };
    kayitli.add(kap);
    boyutBagla();
    return { genislik: W, yukseklik: H, nokta: seri.length, log, bant: !!bant, kriz: krizler.length, isinma: !!isinma, kiyas: kiyas.length, isaret: isaretler.length, enDerin };
  }

  /**
   * 62.4 Yatay kâr/zarar çubukları (varlık / hisse başına yüzde): AG.grafik.cubuk(kap, [{ ad, v (oran, ör. 0.12), alt? }], { ad })
   * Sıfır çizgisi ortada değil, en büyük eksi ile en büyük artı arasında orantılı; artı yeşil, eksi kırmızı (token sınıfları).
   */
  function cubuk(kap, satirlar, ops = {}) {
    if (!kap || !AG.dom) return null;
    const { el, svg, doldur } = AG.dom;
    const l = (satirlar || []).filter(x => x && sayiMi(x.v)).slice().sort((p, q) => q.v - p.v);
    if (!l.length) { doldur(kap, [el('p', { class: 'hint hint-sm mb-0', text: ops.bosMetin || 'Gösterilecek kâr/zarar yok.' })]); return null; }
    const W = 360, SATIR = 22, H = l.length * SATIR + 6, SOL = 92, SAG = 56;
    const enK = Math.min(0, ...l.map(x => x.v)), enB = Math.max(0, ...l.map(x => x.v));
    const genis = W - SOL - SAG, olcek = (enB - enK) > 0 ? genis / (enB - enK) : 0, x0 = SOL + (-enK) * olcek;
    const yuzde = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}%${Math.abs(v * 100).toLocaleString('tr-TR', { maximumFractionDigits: Math.abs(v) < 0.1 ? 1 : 0 })}`;
    const parca = [svg('line', { x1: x0, y1: 0, x2: x0, y2: H, class: 'grf-cubuk-sifir' })];
    l.forEach((x, i) => {
      const y = i * SATIR + 4, w = Math.max(1, Math.abs(x.v) * olcek), xb = x.v >= 0 ? x0 : x0 - w;
      parca.push(svg('text', { x: 2, y: y + 13, class: 'grf-cubuk-ad', text: x.ad }));
      parca.push(svg('rect', { x: xb, y, width: w, height: SATIR - 8, rx: 2, class: x.v >= 0 ? 'grf-cubuk-arti' : 'grf-cubuk-eksi' }, [svg('title', { text: `${x.ad} ${yuzde(x.v)}${x.alt ? ' · ' + x.alt : ''}` })]));
      parca.push(svg('text', { x: x.v >= 0 ? Math.min(W - 2, xb + w + 4) : Math.max(SOL, xb - 4), y: y + 13, 'text-anchor': x.v >= 0 ? 'start' : 'end', class: 'grf-cubuk-deger', text: yuzde(x.v) }));
    });
    doldur(kap, [svg('svg', { class: 'grf-cubuk', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': ops.ad || 'Kâr / zarar çubukları' }, parca)]);
    return { satir: l.length };
  }

  AG.grafik = { ana, cubuk, bootstrapBant, dususSerisi, adimlar, logAdimlar, zamanEtiketleri, kisaSayi, eksenEtiketi };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.grafik;
})(typeof window !== 'undefined' ? window : globalThis);
