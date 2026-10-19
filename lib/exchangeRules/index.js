/**
 * BORSA KURALLARI — Binance USDⓈ-M ile birebir uyumlu saf hesaplar.
 *
 *   const kr = require('./lib/exchangeRules');
 *   const kurallar = kr.kurallarKur({ exchangeInfo, fundingInfo, leverageBracket, ortam: 'prod' });
 *   const sonuc = kr.emirDogrula({ sembol: 'BTCUSDT', tip: 'LIMIT', yon: 'BUY', fiyat, miktar },
 *                                kurallar, { markFiyati });
 *
 * Ağ isteği YOK: ham JSON'u çağıran getirir. Testler: `npm run test:borsa-kurallari`.
 * Kaynaklar ve açık noktalar: araştırma raporu `binance-usdm.md` §1–§5 ve
 * CLAUDE.md "Borsa kuralları modülü".
 */
module.exports = {
  ...require('./ayristir'),
  ...require('./filtreler'),
  ...require('./hesap'),
  ondalik: require('./ondalik'),
  ...require('./hataKodlari')
};
