/**
 * PINE YORUMLAYICI ÖZ TESTİ — `node lib/pine/runtime-selftest.js`
 *
 * Sayısal doğruluk ELLE HESAPLANMIŞ değerlerle karşılaştırılır. "Kendi
 * çıktısını kendine doğrulatmak" işe yaramaz: yanlış bir SMA de kararlı
 * biçimde yanlış üretir. Bu yüzden beklenen değerler testin içinde açıkça
 * yazılıdır.
 *
 * Ayrıca dilin İNCE noktaları sınanır — çünkü sessiz hata oralardan gelir:
 *   · `var` kalıcılığı (bir kez değerlenir, sonra korunur)
 *   · `x[1]` geçmiş erişimi, ifade üstünde de
 *   · `na` yayılımı (na + 1 = na, JS'te 1 olurdu)
 *   · kısa devre (`and` sağ tarafı gereksizse çalışmaz)
 *   · kapsam (if içinde bildirilen ad dışarı sızmaz)
 */
const { parse } = require('./parser');
const { inspect } = require('./inspect');
const { PineRuntime } = require('./runtime');

let gecti = 0, kaldi = 0;
const hatalar = [];

function ok(ad, kosul, ayrinti) {
  if (kosul) { gecti++; return; }
  kaldi++;
  hatalar.push(`✗ ${ad}${ayrinti ? ' — ' + ayrinti : ''}`);
}

function yakin(ad, bulunan, beklenen, tolerans = 1e-9) {
  if (beklenen === null) { ok(ad, bulunan === null, `bulunan ${bulunan}, beklenen na`); return; }
  const f = typeof bulunan === 'number' && Math.abs(bulunan - beklenen) <= tolerans;
  ok(ad, f, `bulunan ${bulunan}, beklenen ${beklenen}`);
}

/** Basit mum üretici: kapanışlar verilen dizi, yüksek/düşük ±%1. */
function mumlar(kapanislar, hacimler) {
  return kapanislar.map((c, i) => ({
    time: 1700000000000 + i * 3600000,
    open: i === 0 ? c : kapanislar[i - 1],
    high: c * 1.01,
    low: c * 0.99,
    close: c,
    volume: hacimler ? hacimler[i] : 100
  }));
}

/**
 * Betiği çalıştırır ve SON bardaki değişken değerlerini döndürür.
 * `sonuc` adlı değişkeni okumak için betiğe `plot(sonuc)` gerekmez —
 * yorumlayıcının kök kapsamı doğrudan okunur.
 */
function calistir(kaynak, mumDizi, params) {
  const bilgi = inspect(kaynak);
  const rt = new PineRuntime(bilgi.agac, {
    params: params || {},
    inputAnahtarlari: bilgi.inputs.map(i => i.anahtar)
  });
  const cikti = rt.run(mumDizi);
  return { rt, cikti, bilgi, son: rt.kokKapsam };
}

function degerAl(r, ad) {
  const v = r.son.oku(ad);
  return v === undefined ? null : v;
}

console.log('\n=== Yorumlayıcı: temel semantik ===');

{
  const r = calistir('x = close * 2\n', mumlar([10, 20, 30]));
  yakin('aritmetik', degerAl(r, 'x'), 60);
}

{
  const r = calistir('x = close[1]\n', mumlar([10, 20, 30]));
  yakin('geçmiş erişimi x[1]', degerAl(r, 'x'), 20);
}

{
  const r = calistir('x = close[5]\n', mumlar([10, 20, 30]));
  yakin('yetersiz geçmiş → na', degerAl(r, 'x'), null);
}

{
  // İfade üstünde geçmiş: (close*2)[1] = önceki barın close*2 değeri
  const r = calistir('y = close * 2\nx = y[1]\n', mumlar([10, 20, 30]));
  yakin('ifade geçmişi', degerAl(r, 'x'), 40);
}

{
  const r = calistir('var t = 0\nt := t + 1\n', mumlar([1, 2, 3, 4, 5]));
  yakin('var kalıcılığı (sayaç)', degerAl(r, 't'), 5);
}

{
  const r = calistir('t = 0\nt := t + 1\n', mumlar([1, 2, 3, 4, 5]));
  yakin('var YOK → her bar sıfırlanır', degerAl(r, 't'), 1);
}

{
  const r = calistir('x = na + 1\n', mumlar([10]));
  yakin('na yayılımı (na+1 = na)', degerAl(r, 'x'), null);
}

{
  const r = calistir('x = close / 0\n', mumlar([10]));
  yakin('sıfıra bölme → na', degerAl(r, 'x'), null);
}

{
  const r = calistir('x = na == na ? 1 : 0\n', mumlar([10]));
  yakin('na == na doğru', degerAl(r, 'x'), 1);
}

{
  const r = calistir('x = 0 ? 1 : 2\n', mumlar([10]));
  yakin('0 yanlış sayılır', degerAl(r, 'x'), 2);
}

{
  const r = calistir('x = na ? 1 : 2\n', mumlar([10]));
  yakin('na yanlış sayılır', degerAl(r, 'x'), 2);
}

console.log('=== Yorumlayıcı: akış ===');

{
  const r = calistir('x = 0\nif close > 15\n    x := 1\nelse\n    x := 2\n', mumlar([10, 20]));
  yakin('if/else', degerAl(r, 'x'), 1);
}

{
  const r = calistir('x = 0\nif close > 100\n    x := 1\nelse if close > 15\n    x := 2\nelse\n    x := 3\n', mumlar([10, 20]));
  yakin('else if', degerAl(r, 'x'), 2);
}

{
  const r = calistir('t = 0\nfor i = 1 to 5\n    t := t + i\n', mumlar([1]));
  yakin('for döngüsü toplamı', degerAl(r, 't'), 15);
}

{
  const r = calistir('t = 0\nfor i = 10 to 1 by -2\n    t := t + 1\n', mumlar([1]));
  yakin('for by -2 tur sayısı', degerAl(r, 't'), 5);
}

{
  const r = calistir('t = 0\nfor i = 1 to 10\n    if i > 3\n        break\n    t := t + 1\n', mumlar([1]));
  yakin('break', degerAl(r, 't'), 3);
}

{
  // if içinde bildirilen ad dışarı SIZMAMALI.
  let hataMesaji = null;
  try {
    calistir('if close > 0\n    ic = 5\nx = ic\n', mumlar([10]));
  } catch (e) { hataMesaji = e.message; }
  ok('blok kapsamı sızdırmıyor', hataMesaji && hataMesaji.includes('Tanımsız değişken'), hataMesaji);
}

{
  const r = calistir('f(a, b) => a * b\nx = f(3, 4)\n', mumlar([10]));
  yakin('kullanıcı fonksiyonu', degerAl(r, 'x'), 12);
}

{
  const r = calistir('f(a) =>\n    t = a * 2\n    t + 1\nx = f(5)\n', mumlar([10]));
  yakin('bloklu fonksiyon dönüşü', degerAl(r, 'x'), 11);
}

console.log('=== Yerleşikler: elle hesaplanmış değerler ===');

{
  // SMA(close, 3), kapanışlar 10,20,30,40 → son üç: 20,30,40 → 30
  const r = calistir('x = ta.sma(close, 3)\n', mumlar([10, 20, 30, 40]));
  yakin('ta.sma', degerAl(r, 'x'), 30);
}

{
  // Isınma tamamlanmadan na
  const r = calistir('x = ta.sma(close, 5)\n', mumlar([10, 20, 30]));
  yakin('ta.sma ısınmadan na', degerAl(r, 'x'), null);
}

{
  // EMA(3): ilk 3 barın SMA'sı = 20 (10,20,30). 4. bar: alfa=0.5
  // 0.5*40 + 0.5*20 = 30
  const r = calistir('x = ta.ema(close, 3)\n', mumlar([10, 20, 30, 40]));
  yakin('ta.ema (SMA tohumlu)', degerAl(r, 'x'), 30);
}

{
  // RMA(3): tohum 20. 4. bar: (40 + 2*20)/3 = 26.6666...
  const r = calistir('x = ta.rma(close, 3)\n', mumlar([10, 20, 30, 40]));
  yakin('ta.rma (Wilder)', degerAl(r, 'x'), (40 + 2 * 20) / 3, 1e-9);
}

{
  // stdev(3) anakütle: 20,30,40 → ort 30, kareler (100+0+100)/3 = 66.666
  // kök = 8.16496...
  const r = calistir('x = ta.stdev(close, 3)\n', mumlar([10, 20, 30, 40]));
  yakin('ta.stdev (anakütle)', degerAl(r, 'x'), Math.sqrt(200 / 3), 1e-9);
}

{
  const r = calistir('x = ta.highest(close, 3)\ny = ta.lowest(close, 3)\n', mumlar([10, 50, 30, 40]));
  yakin('ta.highest', degerAl(r, 'x'), 50);
  yakin('ta.lowest', degerAl(r, 'y'), 30);
}

{
  const r = calistir('x = ta.change(close)\n', mumlar([10, 20, 35]));
  yakin('ta.change', degerAl(r, 'x'), 15);
}

{
  const r = calistir('x = ta.change(close, 2)\n', mumlar([10, 20, 35]));
  yakin('ta.change(len=2)', degerAl(r, 'x'), 25);
}

{
  const r = calistir('x = ta.cum(1)\n', mumlar([1, 2, 3, 4]));
  yakin('ta.cum', degerAl(r, 'x'), 4);
}

{
  const r = calistir('x = ta.sum(close, 3)\n', mumlar([10, 20, 30, 40]));
  yakin('ta.sum', degerAl(r, 'x'), 90);
}

{
  // crossover: önceki barda close <= 25, bu barda > 25
  const r = calistir('x = ta.crossover(close, 25) ? 1 : 0\n', mumlar([10, 20, 30]));
  yakin('ta.crossover', degerAl(r, 'x'), 1);
}

{
  const r = calistir('x = ta.crossover(close, 25) ? 1 : 0\n', mumlar([10, 30, 40]));
  yakin('ta.crossover ikinci kez tetiklenmez', degerAl(r, 'x'), 0);
}

{
  const r = calistir('x = ta.barssince(close > 25)\n', mumlar([30, 10, 10, 10]));
  yakin('ta.barssince', degerAl(r, 'x'), 3);
}

{
  const r = calistir('x = ta.valuewhen(close > 25, close, 0)\n', mumlar([30, 10, 40, 10]));
  yakin('ta.valuewhen', degerAl(r, 'x'), 40);
}

{
  // tr: high=101, low=99, önceki close=100 → max(2, 1, 1) = 2
  const r = calistir('x = ta.tr(true)\n', mumlar([100, 100]));
  yakin('ta.tr', degerAl(r, 'x'), 2, 1e-9);
}

{
  const r = calistir('[m, s, h] = ta.macd(close, 3, 6, 3)\nx = m\n', mumlar([10, 20, 30, 40, 50, 60, 70, 80]));
  ok('ta.macd demet çözülüyor', typeof degerAl(r, 'x') === 'number', String(degerAl(r, 'x')));
}

{
  const r = calistir('[o, u, a] = ta.bb(close, 3, 2)\nx = u - a\n', mumlar([10, 20, 30, 40]));
  yakin('ta.bb bant genişliği', degerAl(r, 'x'), 4 * Math.sqrt(200 / 3), 1e-9);
}

{
  const r = calistir('x = math.max(1, 5, 3)\ny = math.round(1.2345, 2)\n', mumlar([10]));
  yakin('math.max', degerAl(r, 'x'), 5);
  yakin('math.round(hane)', degerAl(r, 'y'), 1.23);
}

console.log('=== input.* panel parametresiyle EZİLİYOR ===');

{
  const kaynak = 'uzunluk = input.int(20, "Uzunluk")\nx = ta.sma(close, uzunluk)\n';
  const varsayilan = calistir(kaynak, mumlar([10, 20, 30, 40]));
  yakin('input varsayılanı (ısınmadı)', degerAl(varsayilan, 'x'), null);

  const ezilmis = calistir(kaynak, mumlar([10, 20, 30, 40]), { Uzunluk: 3 });
  yakin('panel parametresi input.*ı eziyor', degerAl(ezilmis, 'x'), 30);
}

console.log('=== strategy.* çağrıları yakalanıyor ===');

{
  const kaynak = `//@version=5
strategy("T")
if close > 25
    strategy.entry("L", strategy.long)
if close < 15
    strategy.close("L")
`;
  const r = calistir(kaynak, mumlar([10, 30, 10]));
  const tumEylemler = r.cikti.barlar.flat();
  ok('entry yakalandı', tumEylemler.some(e => e.tur === 'entry'), JSON.stringify(tumEylemler));
  ok('close yakalandı', tumEylemler.some(e => e.tur === 'close'), JSON.stringify(tumEylemler));
  const entry = tumEylemler.find(e => e.tur === 'entry');
  ok('strategy.long sabiti çözüldü', entry && entry.args.konum[1] === 'long', JSON.stringify(entry && entry.args));
  ok('entry doğru barda (1)', r.cikti.barlar[1].some(e => e.tur === 'entry'), JSON.stringify(r.cikti.barlar));
  ok('close doğru barda (2)', r.cikti.barlar[2].some(e => e.tur === 'close'), JSON.stringify(r.cikti.barlar));
}

{
  // `strategy(...)` BİLDİRİMİ bir işlem eylemi DEĞİLDİR. Sıra yanlış olduğunda
  // her bar sahte bir eylem kaydediliyordu.
  const r = calistir('//@version=5\nstrategy("T", overlay = true)\nx = 1\n', mumlar([10, 20, 30]));
  const hepsi = r.cikti.barlar.flat();
  ok('strategy() bildirimi eylem üretmiyor', hepsi.length === 0, JSON.stringify(hepsi));
}

console.log('=== barstate ===');

{
  const r = calistir('var n = 0\nif barstate.islast\n    n := 1\n', mumlar([10, 20, 30]));
  yakin('barstate.islast yalnızca son barda', degerAl(r, 'n'), 1);
}

{
  const r = calistir('var n = 0\nif barstate.islast\n    n := n + 1\n', mumlar([10, 20, 30, 40, 50]));
  yakin('barstate.islast bir kez tetikler', degerAl(r, 'n'), 1);
}

{
  let hata = null;
  try { calistir('x = barstate.uydurma ? 1 : 0\n', mumlar([10])); } catch (e) { hata = e.message; }
  ok('bilinmeyen barstate reddedilir', hata && hata.includes('Desteklenmeyen değer'), hata);
}

{
  // ESKİ HATA: bilinmeyen üye yolu METİN olarak dönüyordu ve boş olmayan
  // metin DOĞRU sayıldığı için `if syminfo.x` her bar tetikleniyordu.
  let hata = null;
  try { calistir('x = syminfo.mintick\n', mumlar([10])); } catch (e) { hata = e.message; }
  ok('desteklenmeyen üye SESSİZCE doğru dönmüyor', hata && hata.includes('Desteklenmeyen değer'), hata);
}

console.log('=== na() ve nz() ===');

{
  const r = calistir('var float v = na\nx = na(v) ? 1 : 0\n', mumlar([10]));
  yakin('na(x) boşluk sınaması', degerAl(r, 'x'), 1);
}

{
  const r = calistir('x = nz(na, 7)\ny = nz(3, 7)\n', mumlar([10]));
  yakin('nz boşsa yedek', degerAl(r, 'x'), 7);
  yakin('nz doluysa kendisi', degerAl(r, 'y'), 3);
}

console.log('=== Çizim çağrıları argümanı YİNE DE besliyor ===');

{
  // `plot(ta.sma(...))` içindeki gösterge her bar beslenmezse penceresi
  // delik kalır. Aynı göstergeyi ayrıca kullanan kod yanlış değer görürdü.
  const r = calistir('plot(ta.sma(close, 3))\nx = 1\n', mumlar([10, 20, 30, 40]));
  ok('plot çökmeden geçti', degerAl(r, 'x') === 1);
}

console.log('=== Sonsuz döngü koruması ===');

{
  let hata = null;
  try {
    calistir('t = 0\nfor i = 1 to 1000000\n    t := t + 1\n', mumlar([1]));
  } catch (e) { hata = e.message; }
  ok('döngü sınırı devrede', hata && hata.includes('Döngü sınırı'), hata);
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`);
if (hatalar.length) {
  console.log('\n' + hatalar.join('\n'));
  process.exitCode = 1;
}

module.exports = { gecti, kaldi };
