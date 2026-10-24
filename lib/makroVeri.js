'use strict';
/**
 * MAKRO VERİ — ORTAK UÇ TANIMLARI VE AYRIŞTIRICILAR (73.9; ilk kaynağı scripts/winc-makro-veri.js, PLAN-WINC-MAKRO)
 * ═══════════════════════════════════════════════════════════════════════════
 * FRED fredgraph.csv, CFTC Socrata (Traders in Financial Futures, gpe5-46if) ve Coinbase Exchange mum uçlarının ADRESLERİ ve SAF
 * ayrıştırıcıları tek yerde.
 *   · scripts/winc-makro-veri.js — araştırma indiricisi (curl ile tam geçmiş). KOD DONDURMALI (kayitlar/winc-makro/dondurma.json blob
 *     SHA'sı; 986/987 holdout açılışı denetler) → DEĞİŞTİRİLMEDİ. Buradaki adres kurucular onun adresleriyle BİREBİR aynıdır;
 *     scripts/piyasa-baglami-selftest.js donmuş betiğin kaynağındaki kalıplarla karşılaştırır (biri değişirse test kırılır).
 *   · lib/piyasaBaglami — sunucunun "Piyasa bağlamı" sayfası (fetch ile yalnız son yıllar; BİLGİ, karar yok)
 * Taşıma (curl / fetch) çağıranın işi; bu dosya ağa çıkmaz. Ücretsiz, anahtarsız uçlar; kişisel bilgi gönderilmez.
 */

/** FRED grafik CSV'si (anahtarsız). bas: 'YYYY-MM-DD' verilirse yalnız o günden sonrası (cosd) — küçük yanıt. */
function fredUrl(id, bas = null) {
  return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}${bas ? `&cosd=${bas}` : ''}`;
}
/** Saf: fredgraph.csv → [{ d: 'YYYY-MM-DD', v: '<metin>' }] (başlık satırı atlanır; boş değer '' ya da '.' olarak kalır). */
function fredCsvCoz(csv) {
  const satir = String(csv || '').trim().split(/\r?\n/).slice(1).map(l => l.split(','));
  return satir.map(([d, v]) => ({ d, v }));
}
/** Saf: FRED satırları → sayısal [{ d, v }] (boş / '.' atlanır). */
function fredSayisal(satirlar) {
  const out = [];
  for (const x of satirlar || []) {
    const v = Number(x && x.v);
    if (x && /^\d{4}-\d{2}-\d{2}$/.test(x.d) && x.v !== '' && x.v !== '.' && Number.isFinite(v)) out.push({ d: x.d, v });
  }
  return out;
}

/** CFTC TFF (yalnız vadeli) alanları — winc-makro-veri ile aynı. */
const CFTC_ALANLAR = Object.freeze(['report_date_as_yyyy_mm_dd', 'open_interest_all', 'asset_mgr_positions_long', 'asset_mgr_positions_short', 'lev_money_positions_long', 'lev_money_positions_short',
  'dealer_positions_long_all', 'dealer_positions_short_all', 'market_and_exchange_names', 'cftc_contract_market_code']);
/** Sözleşme kodları: 133741 CME Bitcoin, 209742 Nasdaq-100 E-mini. */
const CFTC_KODLAR = Object.freeze({ btc: '133741', nq: '209742' });
/**
 * CFTC Socrata adresi. sira 'ASC' + limit 50000 = tüm geçmiş (araştırma); 'DESC' + küçük limit = son raporlar (pano).
 */
function cftcUrl(kod, { limit = 50000, sira = 'ASC' } = {}) {
  return `https://publicreporting.cftc.gov/resource/gpe5-46if.json?$select=${CFTC_ALANLAR.join(',')}&cftc_contract_market_code=${kod}&$order=report_date_as_yyyy_mm_dd%20${sira}&$limit=${limit}`;
}

/** Coinbase Exchange mumları. granularity saniye (3600, 86400); bas/bit ISO. Satır [zaman sn, low, high, open, close, hacim]. */
function coinbaseMumUrl(urun, granularity, bas = null, bit = null) {
  const q = [`granularity=${granularity}`];
  if (bas) q.push(`start=${bas}`);
  if (bit) q.push(`end=${bit}`);
  return `https://api.exchange.coinbase.com/products/${encodeURIComponent(urun)}/candles?${q.join('&')}`;
}

module.exports = { fredUrl, fredCsvCoz, fredSayisal, CFTC_ALANLAR, CFTC_KODLAR, cftcUrl, coinbaseMumUrl };
