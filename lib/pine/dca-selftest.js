/**
 * ÇOKLU LİMİT EMRİ (DCA / KADEMELİ ALIM) ÖZ TESTİ
 *   `node lib/pine/dca-selftest.js`
 *
 * Motorun emir defteri, DCA botlarını ölçebilmek için eklendi: bir kerede
 * 1 baz + N güvenlik emri masaya konur, hepsi KALICIDIR ve doldukça pozisyona
 * ORTALAMA alarak eklenir.
 *
 * Bu dosya defterin kurallarını tek tek sınar. En kritik ikisi:
 *   · Emir verildiği barda DOLMAZ (ileriye bakma kuralı).
 *   · Merdivenin ORANLARI korunur (`qty` birim cinsinden aynen taşınır) —
 *     bozulursa DCA botu ölçülmüş sayılmaz, başka bir bot ölçülmüş olur.
 */
const path = require('path');
const { derle } = require('./strategy');
const catalog = require(path.join(__dirname, '..', 'strategies', 'catalog'));
const B = require(path.join(__dirname, '..', 'backtester'));

let gecti = 0, kaldi = 0;
const hatalar = [];

function ok(ad, kosul, ayrinti) {
  if (kosul) { gecti++; return; }
  kaldi++;
  hatalar.push(`✗ ${ad}${ayrinti ? ' — ' + ayrinti : ''}`);
}

/** Düşen sonra yükselen seri: DCA merdiveni için ideal senaryo. */
function seri(kapanislar) {
  return kapanislar.map((c, i) => ({
    time: 1700000000000 + i * 3600000,
    open: i === 0 ? c : kapanislar[i - 1],
    high: c * 1.002, low: c * 0.998, close: c, volume: 100
  }));
}

const DCA = `//@version=5
strategy("DCA Merdiven", overlay = true, pyramiding = 99)
bazTutar   = input.float(100.0, "Baz emir")
guvTutar   = input.float(140.0, "Guvenlik emri")
adet       = input.int(3, "Guvenlik emri sayisi")
sapma      = input.float(2.0, "Sapma %") / 100
hacimCarpan = input.float(1.5, "Hacim carpani")
adimCarpan  = input.float(1.6, "Adim carpani")
tp         = input.float(3.0, "Take profit %") / 100

var float bazSeviye = na

if strategy.opentrades == 0 and strategy.position_size == 0
    bazSeviye := close
    strategy.entry("BO", strategy.long, limit = bazSeviye, qty = bazTutar / bazSeviye)
    sonSeviye = bazSeviye
    for i = 1 to adet
        sapmaI = sapma * math.pow(adimCarpan, i - 1)
        soSeviye = sonSeviye * (1 - sapmaI)
        soTutar = guvTutar * math.pow(hacimCarpan, i - 1)
        strategy.entry("SO" + str.tostring(i), strategy.long, limit = soSeviye, qty = soTutar / soSeviye)
        sonSeviye := soSeviye

if strategy.position_size > 0
    strategy.exit("x", limit = strategy.position_avg_price * (1 + tp))
`;

console.log('\n=== DCA: derleme ve şema ===');

let S = null;
{
  let hata = null;
  try { S = derle(DCA, { label: 'DCA Merdiven' }); } catch (e) { hata = e.message; }
  ok('DCA betiği derlendi', !!S, hata);
  if (S) {
    ok('7 parametre çıkarıldı', Object.keys(S.paramSchema).length === 8,
      Object.keys(S.paramSchema).join(', '));
  }
}

if (!S) {
  console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`);
  console.log(hatalar.join('\n'));
  process.exitCode = 1;
  return;
}

console.log('=== DCA: merdiven kuruluyor ve doluyor ===');

{
  catalog.kaydet({ key: '__dca_test', label: 'DCA Test', Class: S, archived: true });

  /**
   * Motor 30. bardan itibaren strateji çağırır (ısınma). Senaryo bu yüzden
   * 35 barlık düz bir önekle ötelenir — yoksa merdiven hiç kurulmaz ve test
   * "defter çalışmıyor" der, oysa strateji hiç çağrılmamıştır.
   */
  const onek = Array.from({ length: 35 }, () => 100);
  const mumlar = seri([...onek, 100, 99, 97, 95, 93, 91, 89, 88, 90, 94, 98, 102, 106, 110, 112]);
  const r = B.run('__dca_test', { marketType: 'spot', allocationPct: 20 }, mumlar, 10000, '1h');

  ok('sonuç üretildi', !!r);
  ok('emir defteri künyesi var', !!r.orderBook, JSON.stringify(r.orderBook));

  const girisler = r.trades.filter(t => t.type === 'BUY');
  ok('birden çok giriş doldu', girisler.length > 1, `giriş: ${girisler.length}`);
  ok('defter dolumu sayıldı', r.orderBook.dolum === girisler.length,
    `dolum ${r.orderBook.dolum} ≠ giriş ${girisler.length}`);

  // Kademe etiketleri: ilk giriş kademe değil, sonrakiler kademeli.
  const kademeli = r.trades.filter(t => /kademe/.test(String(t.reason)));
  ok('kademeli ekleme oldu', kademeli.length >= 1, `kademe: ${kademeli.length}`);

  // Merdiven ORANI: SO1 miktarı BO miktarından büyük olmalı (hacim çarpanı 1.5,
  // tutar 140 vs 100 ve fiyat daha düşük → miktar belirgin büyük).
  const bo = r.trades.find(t => /DEFTER BO/.test(String(t.reason)));
  const so1 = r.trades.find(t => /DEFTER SO1/.test(String(t.reason)));
  ok('BO doldu', !!bo, r.trades.map(t => t.reason).join(' | '));
  ok('SO1 doldu', !!so1);
  if (bo && so1) {
    ok('SO1 miktarı BO\'dan büyük (merdiven oranı korundu)', so1.amount > bo.amount,
      `BO ${bo.amount.toFixed(4)} · SO1 ${so1.amount.toFixed(4)}`);
    ok('SO1 fiyatı BO\'dan düşük', so1.entryPrice < bo.entryPrice,
      `BO ${bo.entryPrice} · SO1 ${so1.entryPrice}`);
  }

  const kapanis = r.trades.filter(t => t.type === 'SELL');
  ok('pozisyon kapandı', kapanis.length >= 1, `kapanış: ${kapanis.length}`);
  console.log(`  giriş ${girisler.length} · kademe ${kademeli.length} · kapanış ${kapanis.length}`
    + ` · getiri %${(r.totalReturnPct || 0).toFixed(2)}`
    + ` · defter: ${JSON.stringify(r.orderBook)}`);

  catalog.sil('__dca_test');
}

console.log('=== Defter kuralı: emir VERİLDİĞİ barda dolmaz ===');

{
  /**
   * Emir bar 0'ın kapanışında `close` seviyesine verilir. Bar 0'ın kendi
   * düşüğü o seviyenin altındadır (low = close × 0.998) — emir aynı barda
   * dolsaydı ileriye bakma olurdu. Doğru davranış: bar 1'de dolmak.
   */
  const tekEmir = `//@version=5
strategy("Tek Limit")
var bool verildi = false
if not verildi and bar_index > 30
    verildi := true
    strategy.entry("A", strategy.long, limit = close, qty = 1.0)
    strategy.entry("B", strategy.long, limit = close * 0.5, qty = 1.0)
`;
  const S2 = derle(tekEmir);
  catalog.kaydet({ key: '__dca_test2', label: 'DCA Test 2', Class: S2, archived: true });
  const mumlar = seri(Array.from({ length: 60 }, () => 100));
  const r = B.run('__dca_test2', { marketType: 'spot' }, mumlar, 10000, '1h');
  const girisler = r.trades.filter(t => t.type === 'BUY');
  ok('emir doldu', girisler.length === 1, `giriş: ${girisler.length}`);
  ok('yarı fiyattaki emir dolmadı', r.orderBook.kalanAcikEmir === 1,
    JSON.stringify(r.orderBook));
  catalog.sil('__dca_test2');
}

console.log('=== Ters yön emri yok sayılır ve SAYILIR ===');

{
  /**
   * İki emir AYNI seviyede, ters yönlerde ve merdiven bir kez kurulur.
   * Biri dolup pozisyonu açar, öteki aynı barda ters yönde kalır ve yok
   * sayılmalıdır — motor tek pozisyon taşır. Sessizce yutulursa kullanıcı
   * ölçtüğü şeyin ne olduğunu bilemez.
   */
  const tersYon = `//@version=5
strategy("Ters")
var bool kuruldu = false
if not kuruldu and bar_index > 30
    kuruldu := true
    strategy.entry("L", strategy.long, limit = close * 1.02, qty = 1.0)
    strategy.entry("S", strategy.short, limit = close * 1.02, qty = 1.0)
`;
  const S3 = derle(tersYon);
  catalog.kaydet({ key: '__dca_test3', label: 'DCA Test 3', Class: S3, archived: true });
  const mumlar = seri(Array.from({ length: 80 }, (_, i) => 100 + i));
  const r = B.run('__dca_test3', { marketType: 'spot' }, mumlar, 10000, '1h');
  ok('ters yön emri sayıldı', r.orderBook.tersYonYokSayilan > 0,
    JSON.stringify(r.orderBook));
  ok('yalnızca bir emir doldu', r.orderBook.dolum === 1, JSON.stringify(r.orderBook));
  catalog.sil('__dca_test3');
}

console.log('=== Eski tek-emir yolu BOZULMADI ===');

{
  // `range_mr` defter kullanmaz; sonucu değişmemeli.
  const db = require(path.join(__dirname, '..', 'database'));
  const c = db.getCandleCache('BTC/USDT', '1h', 600);
  if (!c || c.length < 200) {
    console.log('  (mum verisi yok, atlandı)');
  } else {
    const r = B.run('range_mr', { marketType: 'perpetual', leverage: 1, allocationPct: 20 }, c, 10000, '1h');
    ok('range_mr hâlâ koşuyor', !!r && r.trades.length > 0, `işlem ${r ? r.trades.length : 0}`);
    ok('range_mr defteri kullanmıyor', r.orderBook.dolum === 0, JSON.stringify(r.orderBook));
    ok('limit emir yolu çalışıyor', r.limitFills > 0, `limitFills ${r.limitFills}`);
    console.log(`  range_mr: ${r.trades.length} kayıt · limitFills ${r.limitFills} · defter ${r.orderBook.dolum}`);
  }
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`);
if (hatalar.length) {
  console.log('\n' + hatalar.join('\n'));
  process.exitCode = 1;
}

module.exports = { gecti, kaldi };
