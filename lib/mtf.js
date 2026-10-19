/**
 * ÇOKLU ZAMAN DİLİMİ (MTF) — LTF mumlarından HTF mumu üretme
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NEDEN AYRI MODÜL
 * ═══════════════════════════════════════════════════════════════════════════
 * Bu mekanizma iki yerde birden yazılmıştı — `lib/rangeEngine/vpfrRange.js` ve
 * `lib/strategies/mtfChochRangeStrategy.js` — ve İKİSİ AYRIŞMIŞTI: biri kovaya
 * `time` ve `volume` yazıyordu, diğeri yazmıyordu. Aynı kuralın iki kopyası,
 * bu depoda tekrarlanan bir hata sınıfı (strateji listesi altı yerde
 * tutuluyordu, `catalog.js` o yüzden var).
 *
 * `PLAN-GRID-DCA.md` F1 ve `PLAN-MOTOR.md` M-4: MTF, grid+DCA botunun
 * temel katmanlarından biri. Tek kaynağa indirilmeden üstüne bir şey
 * kurulamaz.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PAZARLIK DIŞI KURAL — SON KOVA DIŞARIDA KALIR
 * ═══════════════════════════════════════════════════════════════════════════
 * Üretilen HTF serisinin SON kovası listeye alınmaz, çünkü henüz kapanmamış
 * olabilir. Kapanmamış bir HTF mumundan yapı okumak İLERİYE BAKMAKTIR:
 * 4 saatlik mumun kapanışı, o mumun ilk 1 saatinde bilinmez.
 *
 * Bunun pratik karşılığı şudur: bir HTF olayı, o HTF mumunun KAPANDIĞI LTF
 * barından itibaren görünür — oluştuğu bardan değil. `sonIndex` alanı tam
 * olarak o barı taşır.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KOVA SINIRLARI MUTLAK ZAMANA GÖRE
 * ═══════════════════════════════════════════════════════════════════════════
 * Kova numarası `floor(time / kovaMs)` ile bulunur, "her N mumda bir" diye
 * sayılmaz. Sebep: seride boşluk olabilir (borsa kesintisi, eksik mum).
 * Sayarak bölmek, boşluktan sonra bütün kovaları kaydırırdı ve iki farklı
 * varlıkta aynı takvim saatleri farklı kovalara düşerdi.
 */

/**
 * Serinin medyan bar aralığı (ms).
 *
 * Ortalama değil MEDYAN: tek bir boşluk (eksik mum) ortalamayı bozar ve
 * bütün kova genişliğini kaydırırdı.
 */
function barAraligiMs(candles, ornek = 200) {
  if (!Array.isArray(candles) || candles.length < 2) return 0;
  const farklar = [];
  for (let i = 1; i < Math.min(candles.length, ornek); i++) {
    farklar.push(candles[i].time - candles[i - 1].time);
  }
  if (!farklar.length) return 0;
  farklar.sort((a, b) => a - b);
  return farklar[Math.floor(farklar.length / 2)] || 0;
}

/**
 * LTF mumlarını `carpan` katı genişliğinde HTF mumlarına toplar.
 *
 * @param   {Array}  candles  LTF mumları (zaman sırasında)
 * @param   {number} carpan   kova genişliği = medyan bar aralığı × carpan
 * @returns {{htf: Array, araMs: number, kovaMs: number}}
 *
 * Her HTF mumu: `{ kova, time, open, high, low, close, volume, sonIndex }`
 * `time`    kovanın İLK LTF mumunun zamanı
 * `sonIndex` kovanın SON LTF barının indeksi — HTF mumu o barda kapanır,
 *            yani o bardan itibaren okunabilir.
 */
function topla(candles, carpan) {
  const araMs = barAraligiMs(candles);
  if (!(araMs > 0)) return { htf: [], araMs: 0, kovaMs: 0 };

  const kat = Math.max(2, Math.round(carpan));
  const kovaMs = araMs * kat;
  const htf = [];
  let aktif = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const kova = Math.floor(c.time / kovaMs);
    if (!aktif || aktif.kova !== kova) {
      if (aktif) htf.push(aktif);
      aktif = {
        kova,
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
        sonIndex: i
      };
    } else {
      aktif.high = Math.max(aktif.high, c.high);
      aktif.low = Math.min(aktif.low, c.low);
      aktif.close = c.close;
      aktif.volume += (c.volume || 0);
      aktif.sonIndex = i;
    }
  }

  // `aktif` BİLEREK eklenmiyor: kapanmamış olabilir (yukarıdaki kural).
  return { htf, araMs, kovaMs };
}

/**
 * HTF mumu → onu görünür kılan LTF barı.
 *
 * Anahtar: LTF bar indeksi (`sonIndex`). Değer: o barda kapanan HTF mumunun
 * `htf` dizisindeki sırası. Bir LTF barında en çok bir HTF mumu kapanır.
 *
 * Strateji "bu barda yeni bir HTF mumu kapandı mı" sorusunu bununla sorar;
 * HTF dizisini bar bar taramaz.
 */
function ltfHizala(htf = []) {
  const harita = new Map();
  for (let k = 0; k < htf.length; k++) harita.set(htf[k].sonIndex, k);
  return harita;
}

/**
 * Her LTF barı için "o an okunabilir olan son HTF mumu"nun sırası.
 *
 * `hizali[i]` = `i`. LTF barında geçerli HTF mumunun indeksi, yoksa −1.
 * Kapanmamış kova hiçbir zaman görünmez; ilk HTF mumu kapanana kadar −1.
 *
 * Bu dizi, HTF değerlerini LTF döngüsünde ileriye bakmadan okumanın
 * tek doğru yoludur.
 */
function gecerliHtfIndeksi(htf = [], ltfBarSayisi = 0) {
  const out = new Array(ltfBarSayisi).fill(-1);
  let k = -1;
  const harita = ltfHizala(htf);
  for (let i = 0; i < ltfBarSayisi; i++) {
    if (harita.has(i)) k = harita.get(i);
    out[i] = k;
  }
  return out;
}

module.exports = { barAraligiMs, topla, ltfHizala, gecerliHtfIndeksi };
