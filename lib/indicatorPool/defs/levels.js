const { register } = require('../registry');
const { clean } = require('../contract');
const { periodKey } = require('./vwap');

/**
 * Dönem ve seans seviyeleri — ICT'nin referans fiyatları.
 *
 * PDH/PDL (önceki gün yüksek/düşük), PWH/PWL, PMH/PML ve seans yüksek/düşükleri
 * likidite havuzlarının bulunduğu yerlerdir; `liquidity_pools` ve
 * `liquidity_sweep` bunlara dayanacak.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * İLERİYE BAKMA — bu dosyadaki tek gerçek risk
 * ─────────────────────────────────────────────────────────────────────────
 * `prevHigh`/`prevLow` güvenlidir: önceki dönem kapanmıştır, tamamı bilinir.
 * `currentHigh`/`currentLow` ise O BARA KADARKİ koşan uç değer olmalıdır.
 * Dönemin tamamının yükseğini kullanmak, günün ilk barında günün zirvesini
 * bilmek demektir — sessiz ve çok büyük bir sızıntı.
 */

register({
  key: 'period_levels',
  label: 'Dönem Seviyeleri (PDH/PDL)',
  group: 'yapi',
  kind: 'series',
  outputs: ['prevHigh', 'prevLow', 'prevOpen', 'prevClose', 'currentHigh', 'currentLow', 'currentOpen', 'periodIndex'],
  params: {
    anchor: { type: 'enum', values: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'], default: 'daily' }
  },
  warmup: 0,
  note: 'Dönem sınırları UTC. `current*` serileri o bara kadarki koşan değerdir — dönemin tamamı değil. `prevOpen`/`prevClose` önceki dönemin açılış/kapanış fiyatı (ICT "önceki gün kapanışı" referansı).',
  compute: (candles, p) => {
    const n = candles.length;
    const prevHigh = new Array(n).fill(null);
    const prevLow = new Array(n).fill(null);
    const prevOpen = new Array(n).fill(null);
    const prevClose = new Array(n).fill(null);
    const currentHigh = new Array(n).fill(null);
    const currentLow = new Array(n).fill(null);
    const currentOpen = new Array(n).fill(null);
    const periodIndex = new Array(n).fill(null);

    let aktifKey = null;
    let koşanYuksek = null;
    let koşanDusuk = null;
    let donemAcilis = null;
    let barSira = 0;

    // Kapanmış dönemin değerleri; yeni dönem boyunca sabit taşınır.
    let oncekiYuksek = null;
    let oncekiDusuk = null;
    let oncekiAcilis = null;
    let oncekiKapanis = null;

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const key = Number.isFinite(c.time) ? periodKey(c.time, p.anchor) : aktifKey;

      if (key !== aktifKey) {
        if (aktifKey !== null) {
          oncekiYuksek = koşanYuksek;
          oncekiDusuk = koşanDusuk;
          oncekiAcilis = donemAcilis;
          oncekiKapanis = candles[i - 1] ? candles[i - 1].close : null;
        }
        aktifKey = key;
        koşanYuksek = c.high;
        koşanDusuk = c.low;
        donemAcilis = c.open;
        barSira = 0;
      } else {
        if (c.high > koşanYuksek) koşanYuksek = c.high;
        if (c.low < koşanDusuk) koşanDusuk = c.low;
      }

      prevHigh[i] = oncekiYuksek;
      prevLow[i] = oncekiDusuk;
      prevOpen[i] = oncekiAcilis;
      prevClose[i] = oncekiKapanis;
      // Koşan değer: bu barın kendisi dahil, dönemin geri kalanı DEĞİL.
      currentHigh[i] = koşanYuksek;
      currentLow[i] = koşanDusuk;
      currentOpen[i] = donemAcilis;
      periodIndex[i] = barSira;
      barSira++;
    }

    return {
      prevHigh: clean(prevHigh, n),
      prevLow: clean(prevLow, n),
      prevOpen: clean(prevOpen, n),
      prevClose: clean(prevClose, n),
      currentHigh: clean(currentHigh, n),
      currentLow: clean(currentLow, n),
      currentOpen: clean(currentOpen, n),
      periodIndex: clean(periodIndex, n)
    };
  }
});

/** Varsayılan seans pencereleri (UTC saat). Örtüşme gerçektir, kasıtlıdır. */
const SESSIONS = {
  asia: { start: 0, end: 8, label: 'Asya' },
  london: { start: 7, end: 16, label: 'Londra' },
  newyork: { start: 13, end: 22, label: 'New York' }
};

/**
 * Bir zamanın seans içinde olup olmadığı ve hangi seans-gününe ait olduğu.
 * Gece yarısını geçen seanslar (start > end) desteklenir; seans-günü
 * BAŞLANGIÇ tarihine göre atanır.
 */
function sessionSlot(time, start, end) {
  const d = new Date(time);
  const saat = d.getUTCHours() + d.getUTCMinutes() / 60;
  const gunBasi = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

  if (start <= end) {
    if (saat < start || saat >= end) return null;
    return gunBasi;
  }

  // Gece yarısını geçen seans: 23:00–08:00 gibi
  if (saat >= start) return gunBasi;                       // akşam kısmı, bugünün seansı
  if (saat < end) return gunBasi - 24 * 3600 * 1000;       // sabah kısmı, dünkü seansın devamı
  return null;
}

register({
  key: 'session_levels',
  label: 'Seans Seviyeleri',
  group: 'yapi',
  kind: 'series',
  outputs: ['inSession', 'currentHigh', 'currentLow', 'sessionOpen', 'prevHigh', 'prevLow', 'sessionIndex'],
  params: {
    session: { type: 'enum', values: ['asia', 'london', 'newyork', 'custom'], default: 'london' },
    startUtc: { type: 'number', default: null },
    endUtc: { type: 'number', default: null }
  },
  warmup: 0,
  note: 'Pencereler UTC. `inSession` 1/0. `current*` koşan değerdir; `prev*` son TAMAMLANMIŞ seansın uçlarıdır. Gece yarısını geçen seanslar desteklenir (start > end).',
  compute: (candles, p) => {
    const n = candles.length;
    const varsayilan = SESSIONS[p.session] || SESSIONS.london;
    const start = Number.isFinite(p.startUtc) ? p.startUtc : varsayilan.start;
    const end = Number.isFinite(p.endUtc) ? p.endUtc : varsayilan.end;

    const inSession = new Array(n).fill(null);
    const currentHigh = new Array(n).fill(null);
    const currentLow = new Array(n).fill(null);
    const sessionOpen = new Array(n).fill(null);
    const prevHigh = new Array(n).fill(null);
    const prevLow = new Array(n).fill(null);
    const sessionIndex = new Array(n).fill(null);

    let aktifSlot = null;
    let koşanYuksek = null;
    let koşanDusuk = null;
    let acilis = null;
    let barSira = 0;

    let oncekiYuksek = null;
    let oncekiDusuk = null;

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const slot = Number.isFinite(c.time) ? sessionSlot(c.time, start, end) : null;

      if (slot !== aktifSlot) {
        // Seans değişti (veya bitti): tamamlanan seansın uçları sabitlenir.
        if (aktifSlot !== null && koşanYuksek !== null) {
          oncekiYuksek = koşanYuksek;
          oncekiDusuk = koşanDusuk;
        }
        aktifSlot = slot;
        if (slot !== null) {
          koşanYuksek = c.high;
          koşanDusuk = c.low;
          acilis = c.open;
          barSira = 0;
        } else {
          koşanYuksek = null;
          koşanDusuk = null;
          acilis = null;
          barSira = 0;
        }
      } else if (slot !== null) {
        if (c.high > koşanYuksek) koşanYuksek = c.high;
        if (c.low < koşanDusuk) koşanDusuk = c.low;
      }

      inSession[i] = slot !== null ? 1 : 0;
      // Seans dışında koşan değerler null — "şu anki seans" diye bir şey yok.
      currentHigh[i] = slot !== null ? koşanYuksek : null;
      currentLow[i] = slot !== null ? koşanDusuk : null;
      sessionOpen[i] = slot !== null ? acilis : null;
      sessionIndex[i] = slot !== null ? barSira : null;
      // Önceki seansın uçları seans dışında da geçerlidir — referans seviyedir.
      prevHigh[i] = oncekiYuksek;
      prevLow[i] = oncekiDusuk;

      if (slot !== null) barSira++;
    }

    return {
      inSession: clean(inSession, n),
      currentHigh: clean(currentHigh, n),
      currentLow: clean(currentLow, n),
      sessionOpen: clean(sessionOpen, n),
      prevHigh: clean(prevHigh, n),
      prevLow: clean(prevLow, n),
      sessionIndex: clean(sessionIndex, n)
    };
  }
});

module.exports = { SESSIONS, sessionSlot };
