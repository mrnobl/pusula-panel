/**
 * Canlı drawdown ve toparlanma metrikleri.
 *
 * Tümü ham equity serisinden türetilir — `backtestStats.js` ile aynı ilke:
 * özet değerlerden devralma yok. Seri `[{ t, e, p }]` biçiminde, eskiden yeniye
 * sıralı; `p` örnekleme anındaki zirve referansıdır ama zirve burada seriden
 * yeniden hesaplanır ki elle kaydırılmış bir referans geçmişi bozmasın.
 *
 * Zaman bazlı metrikler (süre, sualtı oranı) örneklerin zaman damgalarını
 * kullanır, nokta sayısını değil: örnekleme aralığı değişse veya bot bir süre
 * durmuş olsa da sonuç bozulmaz.
 */

const round = (n, d = 2) => {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
};

/** İnsan okunur süre: 3g 4sa, 2sa 15dk, 45dk gibi. */
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}g ${hours}sa`;
  if (hours > 0) return `${hours}sa ${mins}dk`;
  if (mins > 0) return `${mins}dk`;
  return '<1dk';
}

function emptyStats() {
  return {
    sampleCount: 0,
    spanMs: 0,
    spanLabel: '—',
    startEquity: 0,
    currentEquity: 0,
    peakEquity: 0,
    netPnlUSDT: 0,
    netPnlPct: 0,
    currentDrawdownPct: 0,
    currentDrawdownUSDT: 0,
    currentDrawdownSinceMs: 0,
    currentDrawdownLabel: '—',
    maxDrawdownPct: 0,
    maxDrawdownUSDT: 0,
    maxDrawdownAt: null,
    maxDrawdownDurationMs: 0,
    maxDrawdownDurationLabel: '—',
    longestRecoveryMs: 0,
    longestRecoveryLabel: '—',
    timeUnderwaterPct: 0,
    ulcerIndex: 0,
    recoveryFactor: null,
    requiredGainPct: 0,
    episodes: [],
    underwater: []
  };
}

/**
 * @param {Array<{t:number,e:number}>} series eskiden yeniye sıralı equity örnekleri
 * @param {object} opts `underwaterPoints`: grafiğe gönderilecek nokta sayısı
 */
function computeDrawdownStats(series, opts = {}) {
  const points = (Array.isArray(series) ? series : [])
    .filter(s => s && Number.isFinite(s.t) && Number.isFinite(s.e) && s.e > 0)
    .sort((a, b) => a.t - b.t);

  if (points.length < 2) {
    const stats = emptyStats();
    if (points.length === 1) {
      stats.sampleCount = 1;
      stats.startEquity = round(points[0].e);
      stats.currentEquity = round(points[0].e);
      stats.peakEquity = round(points[0].e);
    }
    return stats;
  }

  const stats = emptyStats();
  stats.sampleCount = points.length;
  stats.spanMs = points[points.length - 1].t - points[0].t;
  stats.spanLabel = formatDuration(stats.spanMs);
  stats.startEquity = round(points[0].e);
  stats.currentEquity = round(points[points.length - 1].e);

  let peak = points[0].e;
  let peakAt = points[0].t;

  // Sualtı dönemleri: zirveden düşüşün başladığı andan zirveye dönüşe kadar.
  let episode = null;
  const episodes = [];

  let maxDrawdownPct = 0;
  let maxDrawdownUSDT = 0;
  let maxDrawdownAt = null;

  let underwaterMs = 0;
  let squaredSum = 0; // Ulcer index için: sualtı yüzdelerinin karesi
  const underwater = [];

  for (let i = 0; i < points.length; i++) {
    const { t, e } = points[i];
    const prevT = i > 0 ? points[i - 1].t : t;
    const dt = t - prevT;

    if (e >= peak) {
      // Zirve yenilendi: açık bir sualtı dönemi varsa burada kapanır.
      if (episode) {
        episode.recoveredAt = t;
        episode.durationMs = t - episode.startedAt;
        episode.recoveryMs = t - episode.troughAt;
        episodes.push(episode);
        episode = null;
      }
      peak = e;
      peakAt = t;
    } else {
      const ddUSDT = peak - e;
      const ddPct = (ddUSDT / peak) * 100;

      if (!episode) {
        episode = {
          startedAt: peakAt,
          peakEquity: peak,
          troughEquity: e,
          troughAt: t,
          maxDrawdownPct: ddPct,
          maxDrawdownUSDT: ddUSDT,
          recoveredAt: null,
          durationMs: 0,
          recoveryMs: 0
        };
      } else if (ddPct > episode.maxDrawdownPct) {
        episode.maxDrawdownPct = ddPct;
        episode.maxDrawdownUSDT = ddUSDT;
        episode.troughEquity = e;
        episode.troughAt = t;
      }

      if (ddPct > maxDrawdownPct) {
        maxDrawdownPct = ddPct;
        maxDrawdownUSDT = ddUSDT;
        maxDrawdownAt = t;
      }

      underwaterMs += dt;
      squaredSum += ddPct * ddPct;
    }

    underwater.push({ t, dd: round(peak > 0 ? ((peak - e) / peak) * 100 : 0, 3) });
  }

  // Hâlâ açık olan sualtı dönemi: toparlanmadığı için `recoveredAt` boş kalır.
  const openEpisode = episode;
  if (openEpisode) {
    openEpisode.durationMs = points[points.length - 1].t - openEpisode.startedAt;
    episodes.push(openEpisode);
  }

  stats.peakEquity = round(peak);
  stats.netPnlUSDT = round(stats.currentEquity - stats.startEquity);
  stats.netPnlPct = stats.startEquity > 0
    ? round(((stats.currentEquity - stats.startEquity) / stats.startEquity) * 100)
    : 0;

  stats.currentDrawdownUSDT = round(Math.max(0, peak - stats.currentEquity));
  stats.currentDrawdownPct = peak > 0 ? round(((peak - stats.currentEquity) / peak) * 100) : 0;
  if (openEpisode) {
    stats.currentDrawdownSinceMs = openEpisode.durationMs;
    stats.currentDrawdownLabel = formatDuration(openEpisode.durationMs);
  }

  stats.maxDrawdownPct = round(maxDrawdownPct);
  stats.maxDrawdownUSDT = round(maxDrawdownUSDT);
  stats.maxDrawdownAt = maxDrawdownAt;

  // En uzun sualtı dönemi ve en uzun toparlanma (dipten zirveye dönüş).
  stats.maxDrawdownDurationMs = episodes.reduce((m, ep) => Math.max(m, ep.durationMs || 0), 0);
  stats.maxDrawdownDurationLabel = formatDuration(stats.maxDrawdownDurationMs);
  stats.longestRecoveryMs = episodes.reduce((m, ep) => Math.max(m, ep.recoveryMs || 0), 0);
  stats.longestRecoveryLabel = formatDuration(stats.longestRecoveryMs);

  stats.timeUnderwaterPct = stats.spanMs > 0 ? round((underwaterMs / stats.spanMs) * 100) : 0;

  // Ulcer index: drawdown'ın hem derinliğini hem süresini cezalandırır.
  // Tek bir derin düşüş ile uzun süren sığ bir erimeyi ayırt eder.
  stats.ulcerIndex = round(Math.sqrt(squaredSum / points.length), 3);

  // Toparlanma faktörü: net kâr / maksimum drawdown. Kâr yoksa veya hiç
  // drawdown yaşanmamışsa tanımsızdır — 0 yazmak yanıltıcı olur.
  stats.recoveryFactor = (maxDrawdownUSDT > 0 && stats.netPnlUSDT > 0)
    ? round(stats.netPnlUSDT / maxDrawdownUSDT)
    : null;

  // Kayıp-kazanç asimetrisi: mevcut drawdown'dan zirveye dönmek için gereken
  // kazanç. %50 kayıp %100 kazanç ister — bu metrik onu görünür kılar.
  stats.requiredGainPct = stats.currentEquity > 0 && peak > stats.currentEquity
    ? round(((peak - stats.currentEquity) / stats.currentEquity) * 100)
    : 0;

  stats.episodes = episodes
    .map(ep => ({
      startedAt: ep.startedAt,
      troughAt: ep.troughAt,
      recoveredAt: ep.recoveredAt,
      peakEquity: round(ep.peakEquity),
      troughEquity: round(ep.troughEquity),
      maxDrawdownPct: round(ep.maxDrawdownPct),
      maxDrawdownUSDT: round(ep.maxDrawdownUSDT),
      durationMs: ep.durationMs,
      durationLabel: formatDuration(ep.durationMs),
      recoveryMs: ep.recoveryMs,
      recoveryLabel: ep.recoveredAt ? formatDuration(ep.recoveryMs) : null,
      open: !ep.recoveredAt
    }))
    .sort((a, b) => b.maxDrawdownPct - a.maxDrawdownPct);

  stats.underwater = downsample(underwater, opts.underwaterPoints || 240);

  return stats;
}

/**
 * Grafiğe gönderilecek nokta sayısını düşürür. Her kovadan en *derin* drawdown
 * seçilir — ortalama almak, grafiğin varlık sebebi olan dipleri törpülerdi.
 */
function downsample(rows, target) {
  if (rows.length <= target) return rows;
  const bucketSize = rows.length / target;
  const out = [];
  for (let i = 0; i < target; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(rows.length, Math.floor((i + 1) * bucketSize));
    let worst = rows[start];
    for (let j = start + 1; j < end; j++) {
      if (rows[j].dd > worst.dd) worst = rows[j];
    }
    if (worst) out.push(worst);
  }
  return out;
}

module.exports = { computeDrawdownStats, formatDuration };
