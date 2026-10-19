/**
 * PINE → MOTOR KÖPRÜSÜ ÖZ TESTİ — `node lib/pine/strategy-selftest.js`
 *
 * Köprü, iki farklı işlem modelini birbirine çeviriyor. Yanlış çevrilen bir
 * kural backtest'i sessizce bozar, bu yüzden testler ÜRETİLEN SİNYALİ
 * doğrudan okur — "çalıştı, hata vermedi" yeterli değildir.
 *
 * Ayrıca örtüşmeyen yerlerin BEKLENDİĞİ GİBİ davrandığı sınanır: gecikmiş
 * yön çevirme, yok sayılan ikinci kimlik, gevşetilmeye çalışılan stop.
 * Bunlar hata değil, belgelenmiş farklardır — ama sessiz kalmamaları şart.
 */
const { derle } = require('./strategy');

let gecti = 0, kaldi = 0;
const hatalar = [];

function ok(ad, kosul, ayrinti) {
  if (kosul) { gecti++; return; }
  kaldi++;
  hatalar.push(`✗ ${ad}${ayrinti ? ' — ' + ayrinti : ''}`);
}

function mumlar(kapanislar) {
  return kapanislar.map((c, i) => ({
    time: 1700000000000 + i * 3600000,
    open: i === 0 ? c : kapanislar[i - 1],
    high: c * 1.01, low: c * 0.99, close: c, volume: 100
  }));
}

/**
 * Motorun çağrı desenini taklit eder: `prepare` tüm seriyle, `evaluate`
 * büyüyen pencereyle. Pozisyon durumu testin verdiği gibi ilerler.
 */
function kosu(Sinif, seri, pozisyonKurali) {
  const s = new Sinif({ allocationPct: 20 });
  s.prepare(seri);
  const sinyaller = [];
  let poz = null;
  for (let i = 0; i < seri.length; i++) {
    const sinyal = s.evaluate(seri.slice(0, i + 1), { last: seri[i].close }, poz ? [poz] : []);
    sinyaller.push(sinyal);
    poz = pozisyonKurali ? pozisyonKurali(sinyal, poz, seri[i], i) : poz;
  }
  return { sinyaller, strateji: s };
}

/** Basit pozisyon simülasyonu: BUY/SHORT açar, SELL/COVER kapatır. */
function basitPozisyon(sinyal, poz, mum) {
  if (!sinyal) return poz;
  if ((sinyal.action === 'BUY' || sinyal.action === 'SHORT') && !poz) {
    return { side: sinyal.action === 'SHORT' ? 'short' : 'long', amount: 1, entryPrice: mum.close };
  }
  if ((sinyal.action === 'SELL' || sinyal.action === 'COVER') && poz) {
    if (sinyal.partialPct) return poz;
    return null;
  }
  return poz;
}

console.log('\n=== Köprü: giriş ve çıkış ===');

{
  const S = derle(`//@version=5
strategy("Basit")
if close > 25
    strategy.entry("L", strategy.long)
if close < 15
    strategy.close("L")
`);
  const { sinyaller } = kosu(S, mumlar([10, 30, 20, 10]), basitPozisyon);
  ok('bar1 BUY', sinyaller[1].action === 'BUY', sinyaller[1].action);
  ok('bar3 SELL', sinyaller[3].action === 'SELL', sinyaller[3].action);
  ok('bar3 tam kapanış', sinyaller[3].closeAll === true, JSON.stringify(sinyaller[3]));
}

{
  const S = derle(`//@version=5
strategy("Short")
if close < 15
    strategy.entry("S", strategy.short)
`);
  const { sinyaller } = kosu(S, mumlar([20, 10]), basitPozisyon);
  ok('short girişi SHORT üretir', sinyaller[1].action === 'SHORT', sinyaller[1].action);
}

{
  const S = derle(`//@version=5
strategy("Kismi")
if close > 25
    strategy.entry("L", strategy.long)
if close < 15
    strategy.close("L", qty_percent = 50)
`);
  const { sinyaller } = kosu(S, mumlar([10, 30, 10]), basitPozisyon);
  ok('qty_percent → partialPct', sinyaller[2].partialPct === 0.5, JSON.stringify(sinyaller[2]));
}

console.log('=== Köprü: strategy.exit stop/hedef girişe taşınıyor ===');

{
  const S = derle(`//@version=5
strategy("Cikisli")
if close > 25
    strategy.entry("L", strategy.long)
strategy.exit("X", from_entry = "L", stop = 18.0, limit = 40.0)
`);
  const { sinyaller } = kosu(S, mumlar([10, 30]), basitPozisyon);
  const g = sinyaller[1];
  ok('girişte slLevel var', g.slLevel === 18, JSON.stringify(g));
  // 30 → 18 = %40 mesafe
  ok('stopLossPct hesaplandı', Math.abs(g.stopLossPct - 40) < 0.01, String(g.stopLossPct));
  // 30 → 40 = %33.33
  ok('takeProfitPct hesaplandı', Math.abs(g.takeProfitPct - 33.3333) < 0.01, String(g.takeProfitPct));
}

console.log('=== Köprü: limit emir ===');

{
  const S = derle(`//@version=5
strategy("Limitli")
if close > 25
    strategy.entry("L", strategy.long, limit = 28.0)
`);
  const { sinyaller } = kosu(S, mumlar([10, 30]), basitPozisyon);
  ok('LIMIT eylemi', sinyaller[1].action === 'LIMIT', sinyaller[1].action);
  ok('limitPrice taşındı', sinyaller[1].limitPrice === 28, String(sinyaller[1].limitPrice));
  ok('side taşındı', sinyaller[1].side === 'long', String(sinyaller[1].side));
}

console.log('=== Köprü: YÖN ÇEVİRME bir bar gecikiyor (belgelenmiş fark) ===');

{
  const S = derle(`//@version=5
strategy("Cevirme")
if close > 25
    strategy.entry("L", strategy.long)
if close < 15
    strategy.entry("S", strategy.short)
`);
  // Bar0 = 20: hiçbir koşul tetiklenmez. Böylece çevirme bar1'de long açıp
  // bar2'de ters emir görmekle başlar — sıra testin sınamak istediği şey.
  const { sinyaller, strateji } = kosu(S, mumlar([20, 30, 10, 10]), basitPozisyon);
  ok('bar1 long açılır', sinyaller[1].action === 'BUY', sinyaller[1].action);
  ok('bar2 önce KAPATIR', sinyaller[2].action === 'SELL' && sinyaller[2].closeAll === true,
    JSON.stringify(sinyaller[2]));
  ok('bar3 short açılır', sinyaller[3].action === 'SHORT', sinyaller[3].action);
  ok('gecikme SAYILDI', strateji.sayac.gecikenCevirme === 1, String(strateji.sayac.gecikenCevirme));
  ok('gecikme raporlanıyor', sinyaller[2].indicators.gecikenCevirme === 1,
    JSON.stringify(sinyaller[2].indicators));
}

console.log('=== Köprü: piramitleme varsayılan KAPALI ===');

{
  const S = derle(`//@version=5
strategy("Piramit")
if close > 5
    strategy.entry("L", strategy.long)
`);
  const { sinyaller } = kosu(S, mumlar([10, 20, 30]), basitPozisyon);
  ok('ilk bar açar', sinyaller[0].action === 'BUY', sinyaller[0].action);
  ok('ikinci giriş yok sayılır', sinyaller[1].action === 'HOLD', JSON.stringify(sinyaller[1]));
  ok('sebep açık', String(sinyaller[1].reason).includes('pyramiding'), sinyaller[1].reason);
}

console.log('=== Derleme: desteklenmeyen yapı SINIF ÜRETMEZ ===');

{
  let hata = null;
  try {
    derle(`//@version=5
strategy("Kotu")
d = request.security(syminfo.tickerid, "D", close)
if d > close
    strategy.entry("L", strategy.long)
`);
  } catch (e) { hata = e.message; }
  ok('request.security derlemeyi durdurur', hata && hata.includes('desteklenmeyen'), hata);
  ok('hata satır numarası veriyor', hata && /satır \d+/.test(hata), hata);
}

{
  let hata = null;
  try { derle('//@version=5\nindicator("G")\nplot(close)\n'); } catch (e) { hata = e.message; }
  ok('gösterge reddedilir', hata && hata.includes('GÖSTERGE'), hata);
}

console.log('=== Parametre şeması motor alanıyla birleşiyor ===');

{
  const S = derle(`//@version=5
strategy("Parametreli")
uzun = input.int(20, "Uzunluk", minval = 2)
if close > ta.sma(close, uzun)
    strategy.entry("L", strategy.long)
`);
  const sema = S.paramSchema;
  ok('Pine parametresi şemada', sema.Uzunluk && sema.Uzunluk.default === 20, JSON.stringify(sema.Uzunluk));
  ok('allocationPct eklendi', sema.allocationPct && sema.allocationPct.type === 'number');

  // Panel değeri Pine varsayılanını EZMELİ.
  const s = new S({ Uzunluk: 3, allocationPct: 20 });
  const seri = mumlar([10, 10, 10, 100]);
  s.prepare(seri);
  let son = null;
  for (let i = 0; i < seri.length; i++) son = s.evaluate(seri.slice(0, i + 1), { last: seri[i].close }, []);
  ok('kısa MA ile giriş üretildi', son.action === 'BUY', JSON.stringify(son));
}

console.log('=== Gerçek backtester ile uçtan uca ===');

{
  const path = require('path');
  const B = require(path.join(__dirname, '..', 'backtester'));
  const catalog = require(path.join(__dirname, '..', 'strategies', 'catalog'));

  const S = derle(`//@version=5
strategy("EMA Kesisim")
hizli = input.int(10, "Hizli")
yavas = input.int(30, "Yavas")
eh = ta.ema(close, hizli)
ey = ta.ema(close, yavas)
if ta.crossover(eh, ey)
    strategy.entry("L", strategy.long)
if ta.crossunder(eh, ey)
    strategy.close("L")
`, { label: 'EMA Kesisim' });

  // Kataloğa geçici kayıt: backtester stratejiyi katalogdan üretiyor.
  // `CATALOG.push` YETMEZ — arama `byKey` haritasından yapılır. Kayıt tek
  // kapıdan (`kaydet`) yapılmalı; bu testin ilk sürümü tam bu yüzden
  // "Bilinmeyen strateji tipi" alıyordu.
  catalog.kaydet({ key: '__pine_test', label: 'Pine Test', Class: S, archived: true, note: 'test' });
  ok('dinamik kayıt katalogda görünür', catalog.has('__pine_test'));

  const db = require(path.join(__dirname, '..', 'database'));
  const c = db.getCandleCache('BTC/USDT', '1h', 600);

  if (!c || c.length < 200) {
    console.log('  (mum verisi yok, uçtan uca test atlandı)');
  } else {
    let sonuc = null, hata = null;
    try {
      sonuc = B.run('__pine_test', { marketType: 'spot', allocationPct: 20 }, c, 10000, '1h');
    } catch (e) { hata = e.message; }
    ok('backtester Pine stratejisini koşturdu', !!sonuc, hata);
    if (sonuc) {
      ok('işlem üretildi', sonuc.trades.length > 0, `işlem: ${sonuc.trades.length}`);
      ok('metrikler hesaplandı', Number.isFinite(sonuc.totalReturnPct), JSON.stringify(sonuc.totalReturnPct));
      console.log(`  EMA kesişim: ${sonuc.trades.length} kayıt, getiri %${(sonuc.totalReturnPct || 0).toFixed(2)}`);
    }
  }

  ok('dinamik kayıt silinebiliyor', catalog.sil('__pine_test') && !catalog.has('__pine_test'));
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`);
if (hatalar.length) {
  console.log('\n' + hatalar.join('\n'));
  process.exitCode = 1;
}

module.exports = { gecti, kaldi };
