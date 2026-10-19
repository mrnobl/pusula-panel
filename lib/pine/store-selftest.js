/**
 * PINE DEPOSU ÖZ TESTİ — `node lib/pine/store-selftest.js`
 *
 * Uçtan uca döngü: KAYDET → katalogda görün → BACKTEST'te koş → SİL.
 * Ara adımlardan biri kopsa panelde "kaydedildi" yazıp strateji listede
 * çıkmayabilir; bu testin varlık sebebi tam olarak o sessiz kopukluk.
 *
 * Test kendi dosyalarını `__test_` önekiyle yazar ve sonunda temizler;
 * kullanıcının gerçek betiklerine dokunmaz.
 */
const fs = require('fs');
const path = require('path');
// Gerçek data/pine'a yazılmaz (B-27, 61.1): yarıda kalan test kullanıcının strateji listesine kopya bırakıyordu.
if (!process.env.PINE_DIZIN) process.env.PINE_DIZIN = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pine-store-'));
const store = require('./store');
const catalog = require('../strategies/catalog');

let gecti = 0, kaldi = 0;
const hatalar = [];
const temizlenecek = [];

function ok(ad, kosul, ayrinti) {
  if (kosul) { gecti++; return; }
  kaldi++;
  hatalar.push(`✗ ${ad}${ayrinti ? ' — ' + ayrinti : ''}`);
}

const GECERLI = `//@version=5
strategy("Test Depo Botu", overlay = true)
uzunluk = input.int(15, "Uzunluk", minval = 2)
ma = ta.sma(close, uzunluk)
if ta.crossover(close, ma)
    strategy.entry("L", strategy.long)
if ta.crossunder(close, ma)
    strategy.close("L")
`;

const BOZUK = `//@version=5
strategy("Bozuk Betik")
d = request.security(syminfo.tickerid, "D", close)
if d > close
    strategy.entry("L", strategy.long)
`;

const GOSTERGE = `//@version=5
indicator("Sadece Gosterge")
plot(ta.sma(close, 20))
`;

console.log('\n=== Depo: kaydet ===');

let anahtar = null;
{
  const r = store.kaydet(GECERLI);
  anahtar = r.anahtar;
  temizlenecek.push(anahtar);
  ok('kaydedildi', !!r.anahtar, JSON.stringify(r));
  ok('anahtar pine_ önekli', String(r.anahtar).startsWith('pine_'), r.anahtar);
  ok('etiket betikten geldi', r.etiket === 'Test Depo Botu', r.etiket);
  ok('parametre sayıldı', r.parametre === 1, String(r.parametre));
  ok('dosya diske yazıldı', fs.existsSync(path.join(store.DIZIN, anahtar + '.pine')));
}

console.log('=== Depo: katalog entegrasyonu ===');

{
  ok('katalogda var', catalog.has(anahtar));
  const meta = catalog.describe().find(s => s.key === anahtar);
  ok('describe() listeliyor', !!meta, 'katalog özetinde yok');
  ok('parametre şeması taşındı', meta && meta.params && meta.params.Uzunluk
    && meta.params.Uzunluk.default === 15, JSON.stringify(meta && meta.params));
  ok('motor alanı da şemada', meta && meta.params && !!meta.params.allocationPct);
  const örnek = catalog.create(anahtar, { Uzunluk: 5 });
  ok('create() örnek üretiyor', !!örnek && typeof örnek.evaluate === 'function');
}

console.log('=== Depo: derlenmeyen betik DİSKE YAZILMAZ ===');

{
  const oncekiSayi = store.listele().length;
  let hata = null;
  try { store.kaydet(BOZUK); } catch (e) { hata = e.message; }
  ok('bozuk betik reddedildi', !!hata, 'hata beklenirdi');
  ok('hata satır numarası içeriyor', hata && /satır \d+/.test(hata), hata);
  ok('depo büyümedi', store.listele().length === oncekiSayi,
    `${oncekiSayi} → ${store.listele().length}`);
}

{
  let hata = null;
  try { store.kaydet(GOSTERGE); } catch (e) { hata = e.message; }
  ok('gösterge reddedildi', hata && hata.includes('GÖSTERGE'), hata);
}

console.log('=== Depo: listele ===');

{
  const liste = store.listele();
  const k = liste.find(x => x.anahtar === anahtar);
  ok('listede görünüyor', !!k);
  ok('derlenir işaretli', k && k.derlenir === true, JSON.stringify(k));
  ok('tür strategy', k && k.tur === 'strategy', k && k.tur);
  ok('satır sayısı var', k && k.satir > 0, String(k && k.satir));
}

console.log('=== Depo: güncelleme aynı anahtarı korur ===');

{
  const guncel = GECERLI.replace('input.int(15', 'input.int(25');
  const r = store.kaydet(guncel, { anahtar });
  ok('aynı anahtar korundu', r.anahtar === anahtar, `${r.anahtar} ≠ ${anahtar}`);
  ok('güncelleme işaretlendi', r.guncelleme === true, String(r.guncelleme));
  const meta = catalog.describe().find(s => s.key === anahtar);
  ok('şema yenilendi', meta.params.Uzunluk.default === 25, JSON.stringify(meta.params.Uzunluk));
}

console.log('=== Depo: BACKTEST motorunda koşuyor ===');

{
  const B = require('../backtester');
  const db = require('../database');
  const c = db.getCandleCache('BTC/USDT', '1h', 600);
  if (!c || c.length < 200) {
    console.log('  (mum verisi yok, atlandı)');
  } else {
    let sonuc = null, hata = null;
    try {
      sonuc = B.run(anahtar, { marketType: 'spot', allocationPct: 20, Uzunluk: 10 }, c, 10000, '1h');
    } catch (e) { hata = e.message; }
    ok('backtest koştu', !!sonuc, hata);
    ok('işlem üretildi', sonuc && sonuc.trades.length > 0, sonuc ? `işlem ${sonuc.trades.length}` : '');
    if (sonuc) console.log(`  ${anahtar}: ${sonuc.trades.length} kayıt, getiri %${(sonuc.totalReturnPct || 0).toFixed(2)}`);
  }
}

console.log('=== Depo: yeniden yükleme (sunucu açılışı) ===');

{
  // Katalogdan düşür, sonra depodan yeniden yükle — açılış davranışı bu.
  catalog.sil(anahtar);
  ok('katalogdan düştü', !catalog.has(anahtar));
  const y = store.yukle();
  ok('yükleme sonrası katalogda', catalog.has(anahtar), JSON.stringify(y.hatalar));
  ok('yüklenenler arasında', y.yuklendi.some(x => x.anahtar === anahtar), JSON.stringify(y.yuklendi));
}

console.log('=== Depo: sil ===');

{
  const vardi = store.sil(anahtar);
  ok('silme başarılı', vardi === true);
  ok('katalogdan çıktı', !catalog.has(anahtar));
  ok('dosya gitti', !fs.existsSync(path.join(store.DIZIN, anahtar + '.pine')));
  temizlenecek.length = 0;

  let hata = null;
  try { store.sil('range_mr'); } catch (e) { hata = e.message; }
  ok('yerleşik strateji silinemez', hata && /yalnızca/i.test(hata), hata);
  ok('yerleşik hâlâ katalogda', catalog.has('range_mr'));
}

// Güvenlik ağı: test yarıda kaldıysa artık dosya bırakma.
for (const a of temizlenecek) {
  try { store.sil(a); } catch (e) { /* zaten yok */ }
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`);
if (hatalar.length) {
  console.log('\n' + hatalar.join('\n'));
  process.exitCode = 1;
}

module.exports = { gecti, kaldi };
