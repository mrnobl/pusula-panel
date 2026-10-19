/**
 * BACKTEST SABİTLERİ
 *
 * Simülasyon, optimizasyon ve tarama bu üç sayıyı paylaşır. Ayrı bir modülde
 * durmalarının sebebi, aynı sabitin iki dosyada farklı değerle yaşamasının bu
 * depoda tekrarlanan bir hata sınıfı olması.
 */

/**
 * Kaldıraç tavanı. Kullanıcı kararı (2026-08-14): 100.
 *
 * UYARI — BU SAYININ ANLAMI: 100x'te başlangıç marjı %1'dir ve ilk kademe
 * bakım marjı Bybit BTC'de %0.5. Yani likidasyon, fiyat aleyhine yaklaşık
 * **%0.5** hareket ettiğinde gelir. Stratejilerin stop mesafesi neredeyse her
 * zaman bundan geniştir; o hâlde stop çalışmadan likidasyon olur ve stratejinin
 * risk mantığı devre dışı kalır. Motor bu yüzden likidasyonu stopla birlikte,
 * MESAFEYE göre sıralayarak kontrol eder ve `liquidations` sayacını raporlar —
 * sayaç sıfırdan büyükse sonuç "strateji" değil "kaldıraç" ölçüyor demektir.
 */
const MAX_LEVERAGE = 100;

// Canlı kağıt motorla (lib/exchange.js) aynı komisyon + slipaj oranı, aksi halde
// backtest sonuçları gerçek işlem maliyetini yok sayıp iyimser çıkar.
const FEE_PCT = 0.0015;

/**
 * PERPETUAL FİNANSMAN MALİYETİ.
 *
 * Varsayılan 8 saatte %0.01 — büyük borsaların taban oranı. Yalnızca
 * `marketType: 'perpetual'` koşularında işler; spot sonuçları değişmez.
 *
 * NEDEN İKİ YÖNDE DE GİDER: gerçekte oran pozitifken long öder, short alır.
 * Ama tarihsel funding serisi elimizde yok ve "boğa piyasasında short funding
 * geliri" varsaymak, ölçmediğimiz bir geliri kâra yazmak olur. Bu yüzden yön
 * ne olursa olsun MALİYET yazılıyor: model iyimser değil, kötümser tarafta
 * hatalı. Gerçek funding serisi eklenirse short tarafı yalnızca İYİLEŞİR.
 */
const FUNDING_PCT_PER_8H = 0.0001;

function getCandlesPerYear(tf = '1h') {
  const unit = (tf || '1h').slice(-1);
  const num = parseInt((tf || '1h').slice(0, -1)) || 1;
  let minutes = 60;
  // ccxt yazımı: 'm' dakika, 'M' AY — büyük/küçük harf ayrımı önemli.
  if (unit === 'm') minutes = num;
  else if (unit === 'h') minutes = num * 60;
  else if (unit === 'd') minutes = num * 24 * 60;
  else if (unit === 'w') minutes = num * 7 * 24 * 60;
  else if (unit === 'M') minutes = num * 30.4375 * 24 * 60;
  return (365 * 24 * 60) / Math.max(1, minutes);
}

module.exports = { MAX_LEVERAGE, FEE_PCT, FUNDING_PCT_PER_8H, getCandlesPerYear };
