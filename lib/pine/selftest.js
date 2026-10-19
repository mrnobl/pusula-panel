/**
 * PINE AYRIŞTIRICI ÖZ TESTİ — `node lib/pine/selftest.js`
 *
 * Bir çeviricinin en tehlikeli hatası SESSİZ olanıdır: kabul ettiği ama yanlış
 * anladığı satır. Bu yüzden testler iki yönlü:
 *   · KABUL — desteklenen sözdizimi doğru ağaca çevriliyor mu?
 *   · RET   — desteklenmeyen sözdizimi AÇIKÇA reddediliyor mu?
 *
 * İkincisi en az birincisi kadar önemli. Sessizce yutulan bir `request.security`
 * çağrısı, farklı zaman diliminden veri okuyan bir stratejiyi tek zaman
 * dilimliymiş gibi ölçtürür ve sonuç doğru görünür.
 */
const { parse, PineHata } = require('./parser');
const { inspect } = require('./inspect');

let gecti = 0, kaldi = 0;
const hatalar = [];

function ok(ad, kosul, ayrinti) {
  if (kosul) { gecti++; return; }
  kaldi++;
  hatalar.push(`✗ ${ad}${ayrinti ? ' — ' + ayrinti : ''}`);
}

function esit(ad, bulunan, beklenen) {
  const b = JSON.stringify(bulunan), e = JSON.stringify(beklenen);
  ok(ad, b === e, `bulunan ${b}, beklenen ${e}`);
}

/** Bu kaynak ayrıştırılabilmeli. */
function kabul(ad, kaynak, kontrol) {
  try {
    const agac = parse(kaynak);
    gecti++;
    if (kontrol) kontrol(agac);
  } catch (err) {
    kaldi++;
    hatalar.push(`✗ ${ad} — ayrıştırma hatası: ${err.message}`);
  }
}

/** Bu kaynak REDDEDİLMELİ; sessizce kabul edilmesi hatadır. */
function ret(ad, kaynak, mesajParcasi) {
  try {
    parse(kaynak);
    kaldi++;
    hatalar.push(`✗ ${ad} — SESSİZCE KABUL EDİLDİ (reddedilmeliydi)`);
  } catch (err) {
    if (mesajParcasi && !String(err.message).includes(mesajParcasi)) {
      kaldi++;
      hatalar.push(`✗ ${ad} — reddedildi ama mesaj beklenenden farklı: ${err.message}`);
    } else {
      gecti++;
    }
  }
}

console.log('\n=== Pine ayrıştırıcı: KABUL ===');

kabul('basit atama', 'x = 1.5\n');
kabul('var bildirimi', 'var float x = na\n');
kabul('tip önekli bildirim', 'int n = 10\n');
kabul('yeniden atama', 'x = 1\nx := 2\n');
kabul('geçmiş erişimi', 'y = close[1]\n');
kabul('iç içe geçmiş', 'y = ta.sma(close, 20)[2]\n');
kabul('üçlü operatör', 'y = close > open ? 1 : -1\n');
kabul('mantık operatörleri', 'y = close > open and not (high < low) or true\n');
kabul('adlandırılmış argüman', 'x = input.int(100, "Uzunluk", minval = 10, step = 5)\n');
kabul('çok satırlı çağrı', 'x = input.int(\n    100,\n    "Uzunluk",\n    minval = 10)\n');
kabul('demet ataması', '[m, s, h] = ta.macd(close, 12, 26, 9)\n');
kabul('fonksiyon tanımı (tek satır)', 'f(a, b) => a + b\ny = f(1, 2)\n');
kabul('fonksiyon tanımı (bloklu)', 'f(a) =>\n    t = a * 2\n    t + 1\n');
kabul('if bloğu', 'if close > open\n    x = 1\n');
kabul('if/else', 'if close > open\n    x = 1\nelse\n    x = 2\n');
kabul('if/else if/else', 'if close > open\n    x = 1\nelse if close < open\n    x = 2\nelse\n    x = 3\n');
kabul('for döngüsü', 'for i = 0 to 10\n    x := x + i\n');
kabul('for by', 'for i = 10 to 0 by -1\n    x := i\n');
kabul('yorum satırları', '// yorum\nx = 1 // satır sonu yorumu\n');
kabul('boş satır blok bozmaz', 'if close > open\n    x = 1\n\n    y = 2\n');
kabul('sekme girintisi', 'if close > open\n\tx = 1\n');
kabul('renk sabiti', 'c = #ff9800\n');
kabul('tek tırnak metin', "s = 'merhaba'\n");
kabul('negatif sayı', 'x = -1.5\n');
// Satır devamı: 4'ün KATI OLMAYAN girinti önceki satıra bağlanır (Pine kuralı).
kabul('çok satırlı üçlü operatör',
  'y = close > open\n   ? 1\n   : 2\n',
  (a) => { if (a.govde.length !== 1) throw new Error('tek deyim olmalıydı'); });
kabul('çok satırlı aritmetik', 'y = close\n   + high\n   + low\n');
kabul('devam satırı yorum taşıyabilir', 'y = close\n   + high // toplam\n');
kabul('üstel sayı', 'x = 1e6\n');

console.log('=== Pine ayrıştırıcı: RET ===');

ret('kapanmayan parantez', 'x = (1 + 2\n', 'Kapanmayan parantez');
ret('kapanmayan metin', 'x = "abc\n', 'Kapanmayan metin');
// 2 boşluk girinti Pine'da DEVAM SATIRIDIR (4'ün katı değil), yani
// `x = 1 y = 2` olur ve deyim bitmeden yeni ifade başlar.
ret('hatalı girinti devam satırı sanılır ve yakalanır',
  'if close > open\n    x = 1\n  y = 2\n', 'Deyim bitmeden');
ret('aynı satırda iki deyim', 'x = 1 y = 2\n', 'Deyim bitmeden');
ret('while desteklenmiyor', 'while true\n    x = 1\n', 'desteklenmiyor');
ret('switch desteklenmiyor', 'switch x\n    1 => 2\n', 'desteklenmiyor');
ret('import desteklenmiyor', 'import Kullanici/Kutuphane/1 as k\n', 'desteklenmiyor');
ret('kullanıcı tipi desteklenmiyor', 'type Nokta\n    float x\n', 'desteklenmiyor');
ret('tanınmayan karakter', 'x = 1 @ 2\n', 'Tanınmayan karakter');
ret('değersiz bildirim', 'var float x\n', 'değer yok');

console.log('=== Pine inceleme: bildirim ve parametreler ===');

const ORNEK = `//@version=5
strategy("Test Botu", overlay = true, commission_type = strategy.commission.percent, commission_value = 0.06)

uzunluk = input.int(20, "MA Uzunluğu", minval = 2, maxval = 200, step = 1, group = "Gösterge")
esik    = input.float(1.5, "Eşik %", minval = 0.1, step = 0.1)
aktif   = input.bool(true, "Long açık")
mod     = input.string("hizli", "Mod", options = ["hizli", "yavas"])

ma = ta.sma(close, uzunluk)
if close > ma * (1 + esik / 100) and aktif
    strategy.entry("L", strategy.long)
if close < ma
    strategy.close("L")
`;

{
  const r = inspect(ORNEK);
  esit('tür', r.tur, 'strategy');
  esit('ad', r.ad, 'Test Botu');
  esit('sürüm', r.version, 5);
  esit('input sayısı', r.inputs.length, 4);
  esit('komisyon değeri', r.bildirimArgumanlari.commission_value, 0.06);
  ok('desteklenmeyen yok', r.desteklenmeyen.length === 0,
    JSON.stringify(r.desteklenmeyen));

  const s = r.paramSchema;
  const anahtarlar = Object.keys(s);
  esit('şema anahtarları', anahtarlar, ['MA_Uzunlugu', 'Esik', 'Long_acik', 'Mod']);
  esit('int → number', s.MA_Uzunlugu.type, 'number');
  esit('int varsayılan', s.MA_Uzunlugu.default, 20);
  esit('int min', s.MA_Uzunlugu.min, 2);
  esit('int max', s.MA_Uzunlugu.max, 200);
  esit('grup taşındı', s.MA_Uzunlugu.group, 'Gösterge');
  esit('float → number', s.Esik.type, 'number');
  esit('bool → boolean', s.Long_acik.type, 'boolean');
  esit('options → enum', s.Mod.type, 'enum');
  esit('enum değerleri', s.Mod.values, ['hizli', 'yavas']);
}

console.log('=== Pine inceleme: desteklenmeyen çağrı YAKALANIYOR ===');

{
  const r = inspect(`//@version=5
strategy("X")
d = request.security(syminfo.tickerid, "D", close)
`);
  ok('request.security yakalandı',
    r.desteklenmeyen.some(x => x.ad.startsWith('request.')),
    JSON.stringify(r.desteklenmeyen));
}

{
  const r = inspect(`//@version=5
strategy("X")
x = ta.supertrend(3, 10)
`);
  ok('bilinmeyen ta.* yakalandı',
    r.desteklenmeyen.some(x => x.ad === 'ta.supertrend'),
    JSON.stringify(r.desteklenmeyen));
}

{
  const r = inspect(`//@version=5
strategy("X")
plot(close)
plotshape(close > open, style = shape.triangleup)
alertcondition(close > open, "yukari")
label.new(bar_index, close, "x")
`);
  ok('çizim çağrıları desteklenmeyen sayılmaz', r.desteklenmeyen.length === 0,
    JSON.stringify(r.desteklenmeyen));
}

{
  const r = inspect(`//@version=5
indicator("Sadece gosterge")
plot(ta.sma(close, 20))
`);
  esit('gösterge türü', r.tur, 'indicator');
  ok('gösterge uyarısı verildi', r.uyarilar.some(u => u.includes('GÖSTERGE')), r.uyarilar.join(' | '));
}

{
  const r = inspect(`//@version=5
strategy("X")
f(a) => a * 2
y = f(close)
`);
  ok('kullanıcı fonksiyonu desteklenmeyen sayılmaz', r.desteklenmeyen.length === 0,
    JSON.stringify(r.desteklenmeyen));
}

{
  // Aynı başlıklı iki input — panel formunda anahtar çakışmamalı.
  const r = inspect(`//@version=5
strategy("X")
a = input.int(1, "Uzunluk")
b = input.int(2, "Uzunluk")
`);
  esit('çakışan başlık tekilleştirildi', Object.keys(r.paramSchema), ['Uzunluk', 'Uzunluk_2']);
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`);
if (hatalar.length) {
  console.log('\n' + hatalar.join('\n'));
  process.exitCode = 1;
}

module.exports = { gecti, kaldi };
