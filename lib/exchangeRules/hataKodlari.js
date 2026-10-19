/**
 * Binance USDⓈ-M hata kodları — yalnızca `emirDogrula`nın önden yakaladıkları.
 *
 * Kaynak: https://developers.binance.com/docs/derivatives/usds-margined-futures/error-code
 * ve ccxt 4.5.71 eşlemesi (binance.js:2066+). `dogrulandi: false` olanların
 * HANGİ KODLA döndüğü belgeden okunamadı (araştırma raporu "DOĞRULANMADI");
 * reddin kendisi kesin, kod numarası tahmindir.
 */
const HATA = {
  BILINMEYEN_KARAKTER: { kod: -1100, ad: 'ILLEGAL_CHARS', dogrulandi: false },
  GEREKSIZ_PARAMETRE: { kod: -1106, ad: 'PARAM_NOT_REQUIRED', dogrulandi: false },
  HASSASIYET: { kod: -1111, ad: 'BAD_PRECISION', dogrulandi: true },
  GECERSIZ_TIF: { kod: -1115, ad: 'INVALID_TIF', dogrulandi: true },
  GECERSIZ_EMIR_TIPI: { kod: -1116, ad: 'INVALID_ORDER_TYPE', dogrulandi: true },
  HEMEN_TETIKLENIR: { kod: -2021, ad: 'ORDER_WOULD_IMMEDIATELY_TRIGGER', dogrulandi: true },
  MAKS_ACIK_EMIR: { kod: -2025, ad: 'MAX_OPEN_ORDER_EXCEEDED', dogrulandi: true },
  FIYAT_SIFIR: { kod: -4001, ad: 'PRICE_LESS_THAN_ZERO', dogrulandi: true },
  FIYAT_MAKS_USTU: { kod: -4002, ad: 'PRICE_GREATER_THAN_MAX_PRICE', dogrulandi: true },
  MIKTAR_SIFIR: { kod: -4003, ad: 'QTY_LESS_THAN_ZERO', dogrulandi: true },
  MIKTAR_MIN_ALTI: { kod: -4004, ad: 'QTY_LESS_THAN_MIN_QTY', dogrulandi: true },
  MIKTAR_MAKS_USTU: { kod: -4005, ad: 'QTY_GREATER_THAN_MAX_QTY', dogrulandi: true },
  TETIK_SIFIR: { kod: -4006, ad: 'STOP_PRICE_LESS_THAN_ZERO', dogrulandi: true },
  TETIK_MAKS_USTU: { kod: -4007, ad: 'STOP_PRICE_GREATER_THAN_MAX_PRICE', dogrulandi: true },
  FIYAT_MIN_ALTI: { kod: -4013, ad: 'PRICE_LESS_THAN_MIN_PRICE', dogrulandi: true },
  FIYAT_TICK_DISI: { kod: -4014, ad: 'PRICE_NOT_INCREASED_BY_TICK_SIZE', dogrulandi: true },
  CLIENT_ID_UZUN: { kod: -4015, ad: 'INVALID_CL_ORD_ID_LEN', dogrulandi: true },
  FIYAT_CARPAN_USTU: { kod: -4016, ad: 'PRICE_HIGHER_THAN_MULTIPLIER_UP', dogrulandi: true },
  MIKTAR_STEP_DISI: { kod: -4023, ad: 'QTY_NOT_INCREASED_BY_STEP_SIZE', dogrulandi: true },
  FIYAT_CARPAN_ALTI: { kod: -4024, ad: 'PRICE_LOWER_THAN_MULTIPLIER_DOWN', dogrulandi: true },
  POZISYON_TARAFI: { kod: -4061, ad: 'POSITION_SIDE_NOT_MATCH', dogrulandi: true },
  PIYASA_FIYAT_KORUMASI: { kod: -4131, ad: 'MARKET_ORDER_REJECT', dogrulandi: true },
  MIN_NOMINAL: { kod: -4164, ad: 'MIN_NOTIONAL', dogrulandi: true }
};

function hata(tanim, mesaj, alan) {
  return { kod: tanim.kod, ad: tanim.ad, mesaj, alan: alan || null, kodDogrulandi: tanim.dogrulandi };
}

module.exports = { HATA, hata };
