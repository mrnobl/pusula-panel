const { register } = require('../registry');

/**
 * Sabit Aralıklı Hacim Profili.
 *
 * Fiyat aralığını `bins` satıra böler, her mumun hacmini kapsadığı satırlara
 * dağıtır ve şunları üretir:
 *   POC  (Point of Control)  → en çok hacim gören fiyat satırı
 *   VAH/VAL (Value Area)     → POC'tan başlayıp hacmin %70'ini kapsayan bant
 *   HVN/LVN                  → yüksek/düşük hacim düğümleri
 *
 * ARALIK KAYNAKLARI (dört mod):
 *   bars   → son N bar
 *   time   → iki zaman damgası arası
 *   wave   → son onaylanmış salınım bacağı (dip→zirve veya zirve→dip)
 *   range  → son konsolidasyon kutusu (`ranges` göstergesinden)
 *
 * HACİM DAĞITIMI: OHLCV'de mum içi dağılım bilinmez. Hacim, mumun high-low
 * aralığına DÜZGÜN dağıtılır — bu standart yaklaşımdır ama bir yaklaşımdır.
 * Gerçek dağılım tick verisi ister; sahip olmadığımız bir şeyi varmış gibi
 * göstermemek için burada açıkça yazılı.
 *
 * `kind: 'levels'` — bu bir anlık görüntü aracıdır, bar bazlı seri değil.
 * Backtester stratejiyi her barda kesilmiş seriyle çağırdığı için strateji
 * doğal olarak o barın profilini alır.
 */

function resolveRange(candles, p, ctx) {
  const n = candles.length;
  if (!n) return null;

  if (p.mode === 'time') {
    const bas = Number(p.startTime) || 0;
    const bit = Number(p.endTime) || Infinity;
    let s = candles.findIndex(c => Number(c.time) >= bas);
    if (s < 0) return null;
    let e = n - 1;
    for (let i = s; i < n; i++) {
      if (Number(candles[i].time) > bit) { e = i - 1; break; }
    }
    return e >= s ? { start: s, end: e, source: 'time' } : null;
  }

  if (p.mode === 'wave') {
    // Son ONAYLANMIŞ iki salınım noktası arasındaki bacak.
    const sw = ctx.computeOne('swings', {
      method: p.swingMethod, atrMultiple: p.swingAtrMultiple, lookback: p.swingLookback
    });
    const onayli = sw.points.filter(x => x.confirmedAt <= n - 1).sort((a, b) => a.index - b.index);
    if (onayli.length < 2) return null;
    const son = onayli[onayli.length - 1];
    const onceki = onayli[onayli.length - 2];
    return { start: onceki.index, end: Math.max(son.index, onceki.index + 1), source: `wave(${onceki.label}→${son.label})` };
  }

  if (p.mode === 'range') {
    const rg = ctx.computeOne('ranges', {
      atrPeriod: p.atrPeriod, widthAtr: p.rangeWidthAtr, minBars: p.rangeMinBars
    });
    if (!rg.boxes.length) return null;
    const kutu = rg.boxes[rg.boxes.length - 1];
    // Kutular seyrektir; "sonuncu" 100+ bar önce bitmiş olabilir. Bayat bir
    // kutunun profilini "güncel range" diye sunmak yanıltıcı olur — böyle bir
    // durumda aralık yok denir, uydurulmaz.
    const bayatlik = (n - 1) - kutu.endIndex;
    if (bayatlik > p.rangeMaxStaleBars) return null;
    return { start: kutu.startIndex, end: kutu.endIndex, source: `range(${kutu.bars} bar, ${bayatlik} bar önce)` };
  }

  // Varsayılan: son N bar
  const geri = Math.max(2, Math.floor(p.bars));
  return { start: Math.max(0, n - geri), end: n - 1, source: `bars(${geri})` };
}

register({
  key: 'volume_profile',
  label: 'Hacim Profili (Sabit Aralık)',
  group: 'hacim',
  kind: 'levels',
  outputs: ['poc', 'vah', 'val', 'histogram', 'hvn', 'lvn', 'range', 'totalVolume'],
  // Profilin tamamı fiyat ekseninde yatay seviyelerdir; `histogram` adı
  // çıkarımda osilatöre işaret ettiği için açıkça bildiriliyor.
  render: {
    poc: { pane: 'price', as: 'levels', label: 'POC' },
    vah: { pane: 'price', as: 'levels', label: 'Değer Alanı Üst' },
    val: { pane: 'price', as: 'levels', label: 'Değer Alanı Alt' },
    histogram: { pane: 'price', as: 'levels', label: 'Hacim dağılımı' },
    hvn: { pane: 'price', as: 'levels' },
    lvn: { pane: 'price', as: 'levels' }
  },
  dependsOn: ['swings', 'ranges'],
  params: {
    mode: { type: 'enum', values: ['bars', 'time', 'wave', 'range'], default: 'bars' },
    bars: { type: 'number', default: 200, min: 5 },
    startTime: { type: 'number', default: 0 },
    endTime: { type: 'number', default: 0 },
    bins: { type: 'number', default: 50, min: 5, max: 500 },
    valueAreaPct: { type: 'number', default: 70, min: 10, max: 100 },
    // Düğüm eşikleri: ortalama satır hacminin katı
    hvnMultiple: { type: 'number', default: 1.5, min: 1 },
    lvnMultiple: { type: 'number', default: 0.4, min: 0, max: 1 },
    swingMethod: { type: 'enum', values: ['atr', 'pivot'], default: 'atr' },
    swingAtrMultiple: { type: 'number', default: 2.0, min: 0.1 },
    swingLookback: { type: 'number', default: 5, min: 1 },
    atrPeriod: { type: 'number', default: 14, min: 1 },
    rangeWidthAtr: { type: 'number', default: 2.5, min: 0.2 },
    rangeMinBars: { type: 'number', default: 10, min: 3 },
    rangeMaxStaleBars: { type: 'number', default: 30, min: 0 }
  },
  warmup: (p) => (p.mode === 'bars' ? Math.min(p.bars, 60) : 60),
  note: 'Hacim, mumun high-low aralığına DÜZGÜN dağıtılır — gerçek mum içi dağılım tick verisi ister, bizde yok. Bu bir yaklaşımdır.',
  compute: (candles, p, ctx) => {
    const bos = { poc: null, vah: null, val: null, histogram: [], hvn: [], lvn: [], range: null, totalVolume: 0 };

    const aralik = resolveRange(candles, p, ctx);
    if (!aralik) return bos;

    const dilim = candles.slice(aralik.start, aralik.end + 1);
    if (dilim.length < 2) return bos;

    let ustFiyat = -Infinity;
    let altFiyat = Infinity;
    for (const c of dilim) {
      if (c.high > ustFiyat) ustFiyat = c.high;
      if (c.low < altFiyat) altFiyat = c.low;
    }
    if (!(ustFiyat > altFiyat)) return bos;

    const binSayisi = Math.max(5, Math.floor(p.bins));
    const binYuksekligi = (ustFiyat - altFiyat) / binSayisi;
    const hacimler = new Array(binSayisi).fill(0);

    for (const c of dilim) {
      const v = Number.isFinite(c.volume) ? c.volume : 0;
      if (v <= 0) continue;

      const altBin = Math.max(0, Math.floor((c.low - altFiyat) / binYuksekligi));
      const ustBin = Math.min(binSayisi - 1, Math.floor((c.high - altFiyat) / binYuksekligi));
      const kapsanan = ustBin - altBin + 1;

      // Mum içi dağılım bilinmediği için hacim kapsanan satırlara eşit bölünür.
      const pay = v / kapsanan;
      for (let b = altBin; b <= ustBin; b++) hacimler[b] += pay;
    }

    const toplam = hacimler.reduce((a, b) => a + b, 0);
    if (toplam <= 0) return bos;

    const binFiyati = (b) => altFiyat + binYuksekligi * (b + 0.5);

    // POC: en yüksek hacimli satır
    let pocBin = 0;
    for (let b = 1; b < binSayisi; b++) if (hacimler[b] > hacimler[pocBin]) pocBin = b;

    // Value Area: POC'tan başla, iki yandan büyük olanı ekleyerek genişle.
    const hedef = toplam * (p.valueAreaPct / 100);
    let alt = pocBin;
    let ust = pocBin;
    let birikim = hacimler[pocBin];

    while (birikim < hedef && (alt > 0 || ust < binSayisi - 1)) {
      const altAday = alt > 0 ? hacimler[alt - 1] : -1;
      const ustAday = ust < binSayisi - 1 ? hacimler[ust + 1] : -1;
      if (ustAday >= altAday) { ust++; birikim += hacimler[ust]; }
      else { alt--; birikim += hacimler[alt]; }
    }

    const ortalama = toplam / binSayisi;
    const histogram = hacimler.map((h, b) => ({
      price: binFiyati(b),
      low: altFiyat + binYuksekligi * b,
      high: altFiyat + binYuksekligi * (b + 1),
      volume: h,
      pct: (h / toplam) * 100,
      inValueArea: b >= alt && b <= ust
    }));

    const hvn = histogram.filter(h => h.volume >= ortalama * p.hvnMultiple).map(h => h.price);
    const lvn = histogram.filter(h => h.volume <= ortalama * p.lvnMultiple).map(h => h.price);

    return {
      poc: binFiyati(pocBin),
      vah: altFiyat + binYuksekligi * (ust + 1),
      val: altFiyat + binYuksekligi * alt,
      histogram,
      hvn,
      lvn,
      range: {
        startIndex: aralik.start,
        endIndex: aralik.end,
        startTime: candles[aralik.start].time,
        endTime: candles[aralik.end].time,
        bars: dilim.length,
        high: ustFiyat,
        low: altFiyat,
        source: aralik.source
      },
      totalVolume: toplam
    };
  }
});
