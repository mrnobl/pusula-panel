/**
 * TRADFI SEMBOLLERİ — Binance USDⓈ-M'deki altın/gümüş/petrol/hisse/ETF perp'leri (contractType
 * TRADIFI_PERPETUAL). Kripto stratejilerinin evreninden HARİÇ tutulur (2026-10-07 bulgu: arşivde 212 sembol,
 * ilki 2025-12-11; 2026-02 sonrası aylık ilk 15'e 1–9 tanesi giriyordu).
 *
 * Canlıda pazar bilgisi (`info.contractType`) zaten taşınır (`lib/live/evren.js` perpMi). Araştırma arşivi
 * (`data/market.db`) yalnız mum taşıdığı için liste `referans/binance-tradfi-semboller.json`dan okunur
 * (`node scripts/nasdaq-erisim.js` ile Binance exchangeInfo'dan üretilir; yeni TradFi listelenince tazelenir).
 */
const path = require('path');
const fs = require('fs');

const DOSYA = path.join(__dirname, '..', '..', 'referans', 'binance-tradfi-semboller.json');
let _taban = null;

function tabanlar() {
  if (_taban) return _taban;
  const j = JSON.parse(fs.readFileSync(DOSYA, 'utf8'));
  _taban = new Set((j.semboller || []).map(x => x.taban));
  return _taban;
}

/**
 * 'XAU/USDT:USDT' → true. `TRADFI_DAHIL=1` ortam değişkeni eski (kirli) davranışı geri getirir —
 * YALNIZ önce/sonra karşılaştırması için (PLAN-TRADFI-SIZINTI.md); ölçümde kullanılmaz.
 */
function tradfiMi(sembol) {
  if (process.env.TRADFI_DAHIL === '1') return false;
  return tabanlar().has(String(sembol).split('/')[0]);
}

/** Liste dosyası yenilendi (lib/veri/orkestrator.js) → bir sonraki çağrı yeniden okusun. */
function sifirla() { _taban = null; }

module.exports = { tradfiMi, tabanlar, DOSYA, sifirla };
