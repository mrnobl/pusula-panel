const { register } = require('../registry');
const { clean } = require('../contract');
const { sessionSlot } = require('./levels');

/**
 * Killzone'lar — ICT'nin gün içi zaman pencereleri.
 *
 * Fikir: piyasa günün her saati aynı davranmaz. Kurumsal akış belirli
 * saatlerde yoğunlaşır; ICT kurulumları bu pencerelerde aranır, dışında
 * beklenir. Bu gösterge o pencereleri işaretler ve her geçişin uçlarını
 * (`sessions`) tutar — Asya aralığının zirvesi Londra'da süpürülecek
 * likiditedir, yani `liquidity_pools`/`liquidity_sweep` ile doğrudan eşleşir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SAAT DİLİMİ — bu dosyanın tek gerçek tuzağı
 * ─────────────────────────────────────────────────────────────────────────
 * ICT pencereleri NEW YORK YEREL saatiyle tanımlar, mum zaman damgaları ise
 * UTC. Aradaki fark yaz saati uygulamasıyla değişir: EDT'de −4, EST'de −5.
 * Pencereler bu yüzden NY saatiyle yazılır ve `nyOffsetHours` ile UTC'ye
 * çevrilir (varsayılan −4 = EDT). Kışın ölçüm yapılacaksa −5 verilmelidir;
 * bir saatlik kayma, bir saatlik pencerede kurulumun tamamını kaçırır.
 *
 * DST otomatik çözülmüyor — `session_levels` de çözmüyor ve tarih kütüphanesi
 * eklemek bu depo için fazla. Parametre açıkta duruyor ve notta yazılı.
 */

/** Pencereler NEW YORK yerel saatiyle (ondalık saat). */
const KILLZONES = {
  asia: { start: 20, end: 24, label: 'Asya Aralığı' },
  london: { start: 2, end: 5, label: 'Londra Açılışı' },
  newyork: { start: 7, end: 10, label: 'New York Açılışı' },
  londonClose: { start: 10, end: 12, label: 'Londra Kapanışı' },
  silverBullet: { start: 10, end: 11, label: 'Silver Bullet (AM)' },
  silverBulletPm: { start: 14, end: 15, label: 'Silver Bullet (PM)' }
};

register({
  key: 'killzones',
  label: 'Killzone Pencereleri',
  group: 'ict',
  kind: 'events',
  outputs: [
    'sessions', 'windows',
    'active', 'zoneId', 'barsIn',
    'zoneHigh', 'zoneLow', 'zoneOpen',
    'prevHigh', 'prevLow'
  ],
  seriesOutputs: ['active', 'zoneId', 'barsIn', 'zoneHigh', 'zoneLow', 'zoneOpen', 'prevHigh', 'prevLow'],
  // Pencere dışında "şu anki killzone" diye bir şey yoktur; `active` ise
  // her barda 1/0 taşır.
  sparseOutputs: ['zoneId', 'barsIn', 'zoneHigh', 'zoneLow', 'zoneOpen', 'prevHigh', 'prevLow'],
  params: {
    // Hangi pencereler açık. Sıra ÖNCELİKTİR: çakışan pencerelerde (Londra
    // kapanışı 10–12 ile Silver Bullet 10–11) listede önce gelen `zoneId`'yi
    // alır. Asya bir "killzone" değil aralıktır, o yüzden varsayılanda yok.
    zones: { type: 'list', default: ['london', 'newyork', 'londonClose'] },
    // NY yerel saatin UTC'ye farkı: EDT −4, EST −5.
    nyOffsetHours: { type: 'number', default: -4 },
    // Kendi pencereni tanımla: [{ name, start, end }] — NY yerel saatiyle.
    customWindows: { type: 'list', default: [] }
  },
  warmup: 0,
  note: 'Pencereler NEW YORK yerel saatiyle tanımlıdır, `nyOffsetHours` ile UTC\'ye çevrilir (varsayılan −4 = EDT; kışın −5). `prevHigh`/`prevLow` son TAMAMLANMIŞ killzone geçişinin uçlarıdır — Asya aralığının süpürülecek likiditesi bu.',
  compute: (candles, p) => {
    const n = candles.length;

    const secilen = [];
    for (const ad of (Array.isArray(p.zones) ? p.zones : [])) {
      const w = KILLZONES[ad];
      if (w) secilen.push({ name: ad, label: w.label, start: w.start, end: w.end });
    }
    for (const w of (Array.isArray(p.customWindows) ? p.customWindows : [])) {
      if (!w || !Number.isFinite(w.start) || !Number.isFinite(w.end)) continue;
      secilen.push({ name: w.name || 'custom', label: w.label || w.name || 'Özel', start: w.start, end: w.end });
    }

    const pencereler = secilen.map((w, k) => ({ ...w, id: k + 1 }));
    const kayma = (Number.isFinite(p.nyOffsetHours) ? p.nyOffsetHours : -4) * 3600000;

    const active = new Array(n).fill(null);
    const zoneId = new Array(n).fill(null);
    const barsIn = new Array(n).fill(null);
    const zoneHigh = new Array(n).fill(null);
    const zoneLow = new Array(n).fill(null);
    const zoneOpen = new Array(n).fill(null);
    const prevHigh = new Array(n).fill(null);
    const prevLow = new Array(n).fill(null);

    const sessions = [];
    // Pencere başına açık geçiş durumu.
    const durum = pencereler.map(() => ({ slot: null, kayit: null }));

    // Son TAMAMLANMIŞ geçişin uçları (hangi pencere olursa olsun).
    let sonYuksek = null;
    let sonDusuk = null;

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      // NY yerel saate kaydırılmış zaman: `sessionSlot` UTC saatine baktığı
      // için pencereleri NY saatiyle yazıp zamanı kaydırmak yeterli.
      const t = Number.isFinite(c.time) ? c.time + kayma : null;

      let aktifKayit = null;
      let aktifPencere = null;

      for (let k = 0; k < pencereler.length; k++) {
        const w = pencereler[k];
        const d = durum[k];
        const slot = t === null ? null : sessionSlot(t, w.start, w.end);

        if (slot !== d.slot) {
          // Geçiş bitti: kaydı kapat ve "son tamamlanmış" referansını güncelle.
          if (d.kayit) {
            d.kayit.endIndex = i - 1;
            d.kayit.close = candles[i - 1] ? candles[i - 1].close : null;
            d.kayit.bars = d.kayit.endIndex - d.kayit.startIndex + 1;
            sonYuksek = d.kayit.high;
            sonDusuk = d.kayit.low;
            d.kayit = null;
          }
          d.slot = slot;
          if (slot !== null) {
            d.kayit = {
              zone: w.name,
              zoneId: w.id,
              label: w.label,
              slot,
              startIndex: i,
              startTime: c.time,
              endIndex: null,
              open: c.open,
              close: null,
              high: c.high,
              low: c.low,
              bars: 1
            };
            sessions.push(d.kayit);
          }
        } else if (slot !== null && d.kayit) {
          if (c.high > d.kayit.high) d.kayit.high = c.high;
          if (c.low < d.kayit.low) d.kayit.low = c.low;
        }

        // Öncelik: listede önce gelen pencere kazanır.
        if (d.kayit && aktifKayit === null) { aktifKayit = d.kayit; aktifPencere = w; }
      }

      active[i] = aktifKayit ? 1 : 0;
      if (aktifKayit) {
        zoneId[i] = aktifPencere.id;
        barsIn[i] = i - aktifKayit.startIndex;
        // Koşan uçlar: bu bar dahil, geçişin geri kalanı DEĞİL.
        zoneHigh[i] = aktifKayit.high;
        zoneLow[i] = aktifKayit.low;
        zoneOpen[i] = aktifKayit.open;
      }
      prevHigh[i] = sonYuksek;
      prevLow[i] = sonDusuk;
    }

    // Seri sonunda hâlâ açık olan geçişler kapatılır (uçları o ana kadarki).
    for (const d of durum) {
      if (d.kayit) {
        d.kayit.endIndex = n - 1;
        d.kayit.close = n > 0 ? candles[n - 1].close : null;
        d.kayit.bars = d.kayit.endIndex - d.kayit.startIndex + 1;
        d.kayit.open_ended = true;
      }
    }

    return {
      sessions,
      windows: pencereler,
      active: clean(active, n),
      zoneId: clean(zoneId, n),
      barsIn: clean(barsIn, n),
      zoneHigh: clean(zoneHigh, n),
      zoneLow: clean(zoneLow, n),
      zoneOpen: clean(zoneOpen, n),
      prevHigh: clean(prevHigh, n),
      prevLow: clean(prevLow, n)
    };
  }
});

module.exports = { KILLZONES };
