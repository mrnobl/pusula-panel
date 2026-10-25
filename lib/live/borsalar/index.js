'use strict';
/**
 * ORTAK BORSA ARAYÜZÜ — kayıt defteri (A2 / 5. faz parça 1; TASARIM-MAKINE-HESAP-BOT §7.2).
 *
 * Her bağdaştırıcı aynı biçimi taşır (scripts/borsa-arayuz-selftest.js "arayüz" bölümü denetler):
 *   { kimlik, ad, hazir, sinaniyor?, matris, ortamlar,
 *     kur({ ortam, apiKey, apiSecret, parola?, ccxtSinifi? }) → yürütücü YÜZEYİ (Binance dilinde: baz miktar, ag- kimliği,
 *        STOP_MARKET/closePosition, info.filters/totalMaintMargin; Binance'te ccxt nesnesinin kendisi),
 *     canliIzinDenetle(b, { cokluVarlik }) → ham izinler | hata (gerçek para kapısı),
 *     izinler(b) → { cekme, vadeli, spot, aktarim, ipKisit } | null,
 *     hesapKipiDenetle?(b) → bağlanmadan önce hesap kipi kapısı (yalnız OKX),
 *     pozisyonModu(b) → 'hedge' | 'oneway',
 *     emirKimligi: { uret, bizimMi, desen, borsaya(iç kimlik), bizden(borsa kimliği) },
 *     miktar: { bazdan(market, q), baza(market, kontrat) },
 *     filtreler(market) → { adim, tick, minMiktar, minNominal, piyasaMax, fiyatBandi: {yukari, asagi} | null },
 *     kaldiracHazirla(b, symbol, { kaldirac, marj }),
 *     korumaEmri: { koy(b, symbol, side, tetik, { tam, miktar, id }), oku(b, symbol), iptal(b, symbol, borsaId) },
 *     gelir(b, { tur: 'funding', bas, bit }), zorlaKapanislar(b, bas),
 *     hataSinifi(e) → 'RED' | 'BELIRSIZ' | 'HIZ' | 'SAAT' | 'BULUNAMADI' }
 *
 * KAPI (7.4): `hazir: false` bağdaştırıcıya bot kaydı bağlanamaz (`baglanmaEngeli`; botYonetimi.hesapUygunMu). `hazir: true` yalnız
 * o borsanın tam hata matrisi (`matris`) zincirde geçtiği commit'te yazılır — borsa-arayuz-selftest, hazir bağdaştırıcının matris
 * dosyasının var olduğunu ve package.json test zincirinde olduğunu ZORUNLU denetler: "geçmeyen borsa demoya bile açılmaz".
 * Yürütücü `ayar.borsa` (kimlik) alır; verilmezse 'binance' — bugünkü davranış birebir.
 */
const binance = require('./binance');
const okx = require('./okx');

const BORSALAR = Object.freeze({ binance, okx });
const VARSAYILAN = 'binance';

/** Bağdaştırıcı (bilinmeyen kimlik → hata). Nesne verilirse olduğu gibi (test). */
function al(kimlik = VARSAYILAN) {
  if (kimlik && typeof kimlik === 'object') return kimlik;
  const b = BORSALAR[kimlik == null || kimlik === '' ? VARSAYILAN : kimlik];
  if (!b) throw new Error(`bilinmeyen borsa: ${kimlik} (bilinenler: ${Object.keys(BORSALAR).join(', ')})`);
  return b;
}

/** Bilinmeyen → null (hata atmaz). */
function bul(kimlik) { return Object.prototype.hasOwnProperty.call(BORSALAR, kimlik) ? BORSALAR[kimlik] : null; }

function liste() { return Object.values(BORSALAR); }

/**
 * Bot kaydı bu borsanın hesabına bağlanabilir mi → engel metni | null. 75.4'teki metin korunur (yalnız Binance hazır).
 */
function baglanmaEngeli(kimlik) {
  const b = bul(kimlik);
  if (!b || b.hazir !== true) return 'bu sürümde yalnız Binance hesapları bağlanır (OKX/Bybit 5. fazda)';
  return null;
}

/**
 * A2 parça 2: panel ve API için borsaların hazırlık durumu (sır yok). `durum` metni bağdaştırıcıdan (OKX: "OKX demo: hazırlık — henüz
 * bağlanamaz"); hazır borsada null.
 */
function durumlar() {
  return liste().map(b => ({ kimlik: b.kimlik, ad: b.ad, hazir: b.hazir === true, durum: b.hazir === true ? null : (b.durum || `${b.ad}: hazırlık — henüz bağlanamaz`) }));
}

module.exports = { BORSALAR, VARSAYILAN, al, bul, liste, baglanmaEngeli, durumlar };
