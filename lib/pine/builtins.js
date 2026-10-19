/**
 * PINE YERLEŞİKLERİ — `ta.*` ve `math.*` gerçeklemeleri.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BU DOSYA DESTEK LİSTESİNİN TEK KAYNAĞIDIR
 * ─────────────────────────────────────────────────────────────────────────
 * `inspect.js` desteklenen adları BURADAN okur. Ayrı bir liste tutulsaydı
 * ikisi ayrışırdı ve sonuç şu olurdu: inceleme "destekliyorum" der, çalışma
 * zamanı çöker ya da daha kötüsü sessizce `na` üretir. Deponun `catalog.js`
 * dersi aynen geçerli — liste altı yerde tutulduğu için yazılmış ama
 * çalıştırılamayan bir strateji vardı.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DURUMLU İŞLEVLER: HER ÇAĞRI NOKTASI KENDİ DURUMUNU TAŞIR
 * ─────────────────────────────────────────────────────────────────────────
 * `ta.sma(close, 20)` ile `ta.sma(high, 50)` aynı işlevdir ama ayrı
 * pencerelerdir. Bu yüzden her çağrı noktasına ayrıştırma anında bir kimlik
 * verilir ve durum o kimlikte saklanır. Durumu paylaştırmak, iki göstergenin
 * birbirinin penceresini bozması demekti.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TOHUMLAMA — TradingView davranışı taklit edilir
 * ─────────────────────────────────────────────────────────────────────────
 * `ta.ema` ve `ta.rma` özyinelemelidir; ilk değerin nereden geldiği sonucu
 * kalıcı olarak kaydırır. TradingView ikisini de ilk `length` barın BASİT
 * ORTALAMASIYLA tohumlar. "İlk değer kaynağın kendisi" varsayımı yaygın bir
 * hatadır ve uzun serilerde bile fark bırakır.
 *
 * `na` YAYILIMI: yeterli bar yokken `na` döner (JS tarafında `null`).
 * Sıfır dönmek en tehlikeli seçenekti — ısınma barlarında sahte sinyal üretirdi.
 */

const NA = null;
const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);

/** Kayan pencere yardımcısı: değeri iter, pencereyi `len` uzunlukta tutar. */
function pencereIt(durum, deger, len) {
  if (!durum.p) durum.p = [];
  durum.p.push(deger);
  while (durum.p.length > len) durum.p.shift();
  return durum.p;
}

const topla = (a) => a.reduce((x, y) => x + y, 0);
const ortalama = (a) => (a.length ? topla(a) / a.length : NA);

// ── Hareketli ortalamalar ──────────────────────────────────────────────────

function sma(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len) || len < 1) return NA;
  const p = pencereIt(durum, src, Math.floor(len));
  return p.length < Math.floor(len) ? NA : ortalama(p);
}

/**
 * EMA — ilk `len` barın SMA'sı ile tohumlanır (TradingView davranışı).
 * Tohumdan önce `na` döner; erken sinyal üretmemek için önemli.
 */
function ema(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len) || len < 1) return NA;
  const n = Math.floor(len);
  if (durum.deger === undefined) {
    const p = pencereIt(durum, src, n);
    if (p.length < n) return NA;
    durum.deger = ortalama(p);
    return durum.deger;
  }
  const alfa = 2 / (n + 1);
  durum.deger = alfa * src + (1 - alfa) * durum.deger;
  return durum.deger;
}

/** RMA (Wilder) — alfa = 1/len. RSI ve ATR bunun üstünde durur. */
function rma(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len) || len < 1) return NA;
  const n = Math.floor(len);
  if (durum.deger === undefined) {
    const p = pencereIt(durum, src, n);
    if (p.length < n) return NA;
    durum.deger = ortalama(p);
    return durum.deger;
  }
  durum.deger = (src + (n - 1) * durum.deger) / n;
  return durum.deger;
}

function wma(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len) || len < 1) return NA;
  const n = Math.floor(len);
  const p = pencereIt(durum, src, n);
  if (p.length < n) return NA;
  let pay = 0, payda = 0;
  for (let i = 0; i < n; i++) { const a = i + 1; pay += p[i] * a; payda += a; }
  return pay / payda;
}

function vwma(durum, [src, len], ctx) {
  if (!sayiMi(src) || !sayiMi(len)) return NA;
  const n = Math.floor(len);
  const hac = ctx.bar.volume || 0;
  if (!durum.s) durum.s = [];
  durum.s.push({ v: src * hac, h: hac });
  while (durum.s.length > n) durum.s.shift();
  if (durum.s.length < n) return NA;
  const th = topla(durum.s.map(x => x.h));
  return th > 0 ? topla(durum.s.map(x => x.v)) / th : NA;
}

/** HMA = wma(2*wma(src, n/2) − wma(src, n), sqrt(n)) */
function hma(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len)) return NA;
  const n = Math.floor(len);
  if (!durum.a) { durum.a = {}; durum.b = {}; durum.c = {}; }
  const yari = wma(durum.a, [src, Math.max(1, Math.floor(n / 2))]);
  const tam = wma(durum.b, [src, n]);
  if (!sayiMi(yari) || !sayiMi(tam)) return NA;
  return wma(durum.c, [2 * yari - tam, Math.max(1, Math.round(Math.sqrt(n)))]);
}

// ── Değişim ve momentum ───────────────────────────────────────────────────

/** Kaynağın `len` bar öncesine göre farkı. Geçmiş burada tutulur. */
function change(durum, [src, len]) {
  const n = sayiMi(len) ? Math.floor(len) : 1;
  if (!durum.g) durum.g = [];
  durum.g.push(sayiMi(src) ? src : NA);
  while (durum.g.length > n + 1) durum.g.shift();
  if (durum.g.length < n + 1) return NA;
  const eski = durum.g[0];
  return sayiMi(src) && sayiMi(eski) ? src - eski : NA;
}

function mom(durum, args) { return change(durum, args); }

function roc(durum, [src, len]) {
  const n = sayiMi(len) ? Math.floor(len) : 1;
  if (!durum.g) durum.g = [];
  durum.g.push(sayiMi(src) ? src : NA);
  while (durum.g.length > n + 1) durum.g.shift();
  if (durum.g.length < n + 1) return NA;
  const eski = durum.g[0];
  return sayiMi(src) && sayiMi(eski) && eski !== 0 ? ((src - eski) / eski) * 100 : NA;
}

function cum(durum, [src]) {
  if (durum.t === undefined) durum.t = 0;
  if (sayiMi(src)) durum.t += src;
  return durum.t;
}

function sum(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len)) return NA;
  const p = pencereIt(durum, src, Math.floor(len));
  return p.length < Math.floor(len) ? NA : topla(p);
}

// ── Uç değerler ───────────────────────────────────────────────────────────

function highest(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len)) return NA;
  const p = pencereIt(durum, src, Math.floor(len));
  return p.length < Math.floor(len) ? NA : Math.max(...p);
}

function lowest(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len)) return NA;
  const p = pencereIt(durum, src, Math.floor(len));
  return p.length < Math.floor(len) ? NA : Math.min(...p);
}

/** Kaç bar önce en yüksek görüldü (0 = bu bar). */
function highestbars(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len)) return NA;
  const n = Math.floor(len);
  const p = pencereIt(durum, src, n);
  if (p.length < n) return NA;
  let en = -Infinity, idx = 0;
  p.forEach((v, i) => { if (v >= en) { en = v; idx = i; } });
  return -(p.length - 1 - idx);
}

function lowestbars(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len)) return NA;
  const n = Math.floor(len);
  const p = pencereIt(durum, src, n);
  if (p.length < n) return NA;
  let en = Infinity, idx = 0;
  p.forEach((v, i) => { if (v <= en) { en = v; idx = i; } });
  return -(p.length - 1 - idx);
}

// ── Dağılım ───────────────────────────────────────────────────────────────

function variance(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len)) return NA;
  const n = Math.floor(len);
  const p = pencereIt(durum, src, n);
  if (p.length < n) return NA;
  const ort = ortalama(p);
  // Pine `ta.variance` ANAKÜTLE varyansıdır (n'e böler, n−1'e değil).
  return topla(p.map(v => (v - ort) ** 2)) / n;
}

function stdev(durum, args) {
  const v = variance(durum, args);
  return sayiMi(v) ? Math.sqrt(v) : NA;
}

function median(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len)) return NA;
  const n = Math.floor(len);
  const p = pencereIt(durum, src, n);
  if (p.length < n) return NA;
  const s = p.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

// ── Kesişimler ────────────────────────────────────────────────────────────

function ikiliGecmis(durum, a, b) {
  const onceA = durum.a, onceB = durum.b;
  durum.a = a; durum.b = b;
  return [onceA, onceB];
}

function crossover(durum, [a, b]) {
  const [oa, ob] = ikiliGecmis(durum, a, b);
  if (![a, b, oa, ob].every(sayiMi)) return false;
  return oa <= ob && a > b;
}

function crossunder(durum, [a, b]) {
  const [oa, ob] = ikiliGecmis(durum, a, b);
  if (![a, b, oa, ob].every(sayiMi)) return false;
  return oa >= ob && a < b;
}

function cross(durum, [a, b]) {
  const [oa, ob] = ikiliGecmis(durum, a, b);
  if (![a, b, oa, ob].every(sayiMi)) return false;
  return (oa <= ob && a > b) || (oa >= ob && a < b);
}

// ── Koşul geçmişi ─────────────────────────────────────────────────────────

/** Koşul en son kaç bar önce doğruydu. Hiç olmadıysa `na`. */
function barssince(durum, [kosul]) {
  if (kosul) { durum.n = 0; return 0; }
  if (durum.n === undefined) return NA;
  durum.n++;
  return durum.n;
}

/** Koşul doğruyken kaynağın aldığı `n`. son değer. */
function valuewhen(durum, [kosul, src, n]) {
  const k = sayiMi(n) ? Math.floor(n) : 0;
  if (!durum.g) durum.g = [];
  if (kosul) durum.g.unshift(src);
  return durum.g.length > k ? durum.g[k] : NA;
}

function rising(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len)) return false;
  const n = Math.floor(len);
  const p = pencereIt(durum, src, n + 1);
  if (p.length < n + 1) return false;
  for (let i = 1; i < p.length; i++) if (!(p[i] > p[i - 1])) return false;
  return true;
}

function falling(durum, [src, len]) {
  if (!sayiMi(src) || !sayiMi(len)) return false;
  const n = Math.floor(len);
  const p = pencereIt(durum, src, n + 1);
  if (p.length < n + 1) return false;
  for (let i = 1; i < p.length; i++) if (!(p[i] < p[i - 1])) return false;
  return true;
}

// ── Fiyat türevleri ───────────────────────────────────────────────────────

/** Gerçek aralık. İlk barda önceki kapanış yoktur → high−low. */
function tr(durum, args, ctx) {
  const b = ctx.bar;
  const oncekiKapanis = ctx.oncekiBar ? ctx.oncekiBar.close : NA;
  if (!sayiMi(oncekiKapanis)) {
    // `ta.tr(true)` ilk barda high−low verir; `ta.tr` (handle_na=false) `na`.
    return args[0] === true ? b.high - b.low : NA;
  }
  return Math.max(b.high - b.low, Math.abs(b.high - oncekiKapanis), Math.abs(b.low - oncekiKapanis));
}

function atr(durum, [len], ctx) {
  if (!durum.tr) durum.tr = {};
  if (!durum.rma) durum.rma = {};
  const t = tr(durum.tr, [true], ctx);
  return rma(durum.rma, [t, len]);
}

function rsi(durum, [src, len]) {
  if (!sayiMi(src)) return NA;
  if (!durum.up) { durum.up = {}; durum.down = {}; }
  const once = durum.once;
  durum.once = src;
  /**
   * İLK BARDA DEĞİŞİM YOK (na) ve RMA'ya HİÇBİR ŞEY BESLENMEZ — TradingView tanımı:
   * u = max(x - x[1], 0) ilk barda na, rma'nın SMA tohumu na içeren pencerede na kalır →
   * ilk RSI `len`. barda (değişim 1..len). Eskiden ilk bara 0 besleniyordu: RSI bir bar
   * erken ve sahte bir 0'lı pencereyle başlıyordu (Pusula P4, RSI betiği kıyası).
   */
  if (!sayiMi(once)) return NA;
  const fark = src - once;
  const u = rma(durum.up, [Math.max(fark, 0), len]);
  const d = rma(durum.down, [Math.max(-fark, 0), len]);
  if (!sayiMi(u) || !sayiMi(d)) return NA;
  if (d === 0) return 100;
  if (u === 0) return 0;
  return 100 - 100 / (1 + u / d);
}

/** MACD → [macd, signal, hist] */
function macd(durum, [src, hizli, yavas, sinyal]) {
  if (!durum.h) { durum.h = {}; durum.y = {}; durum.s = {}; }
  const h = ema(durum.h, [src, hizli]);
  const y = ema(durum.y, [src, yavas]);
  if (!sayiMi(h) || !sayiMi(y)) { ema(durum.s, [NA, sinyal]); return [NA, NA, NA]; }
  const m = h - y;
  const s = ema(durum.s, [m, sinyal]);
  return [m, s, sayiMi(s) ? m - s : NA];
}

/** Bollinger → [orta, üst, alt] */
function bb(durum, [src, len, carpan]) {
  if (!durum.m) { durum.m = {}; durum.s = {}; }
  const orta = sma(durum.m, [src, len]);
  const sap = stdev(durum.s, [src, len]);
  if (!sayiMi(orta) || !sayiMi(sap)) return [NA, NA, NA];
  return [orta, orta + carpan * sap, orta - carpan * sap];
}

function bbw(durum, args) {
  const [orta, ust, alt] = bb(durum, args);
  return sayiMi(orta) && orta !== 0 ? (ust - alt) / orta : NA;
}

/** Stokastik %K */
function stoch(durum, [src, yuksek, dusuk, len]) {
  if (!durum.h) { durum.h = {}; durum.l = {}; }
  const hh = highest(durum.h, [yuksek, len]);
  const ll = lowest(durum.l, [dusuk, len]);
  if (!sayiMi(hh) || !sayiMi(ll) || hh === ll) return NA;
  return 100 * (src - ll) / (hh - ll);
}

function cci(durum, [src, len]) {
  if (!durum.m) { durum.m = {}; durum.p = [] };
  const ort = sma(durum.m, [src, len]);
  durum.p.push(src);
  while (durum.p.length > Math.floor(len)) durum.p.shift();
  if (!sayiMi(ort) || durum.p.length < Math.floor(len)) return NA;
  const sapma = ortalama(durum.p.map(v => Math.abs(v - ort)));
  return sapma === 0 ? 0 : (src - ort) / (0.015 * sapma);
}

function obv(durum, args, ctx) {
  const b = ctx.bar;
  if (durum.t === undefined) { durum.t = 0; durum.once = b.close; return 0; }
  if (b.close > durum.once) durum.t += (b.volume || 0);
  else if (b.close < durum.once) durum.t -= (b.volume || 0);
  durum.once = b.close;
  return durum.t;
}

function mfi(durum, [src, len], ctx) {
  const b = ctx.bar;
  if (!durum.pos) { durum.pos = {}; durum.neg = {}; }
  const akis = (sayiMi(src) ? src : b.close) * (b.volume || 0);
  const once = durum.once;
  durum.once = sayiMi(src) ? src : b.close;
  if (!sayiMi(once)) { sum(durum.pos, [0, len]); sum(durum.neg, [0, len]); return NA; }
  const yukari = durum.once > once ? akis : 0;
  const asagi = durum.once < once ? akis : 0;
  const p = sum(durum.pos, [yukari, len]);
  const n = sum(durum.neg, [asagi, len]);
  if (!sayiMi(p) || !sayiMi(n)) return NA;
  if (n === 0) return 100;
  return 100 - 100 / (1 + p / n);
}

// ── math.* ────────────────────────────────────────────────────────────────

const MATH = {
  abs: (a) => sayiMi(a[0]) ? Math.abs(a[0]) : NA,
  max: (a) => a.every(sayiMi) ? Math.max(...a) : NA,
  min: (a) => a.every(sayiMi) ? Math.min(...a) : NA,
  pow: (a) => a.slice(0, 2).every(sayiMi) ? Math.pow(a[0], a[1]) : NA,
  sqrt: (a) => sayiMi(a[0]) && a[0] >= 0 ? Math.sqrt(a[0]) : NA,
  log: (a) => sayiMi(a[0]) && a[0] > 0 ? Math.log(a[0]) : NA,
  log10: (a) => sayiMi(a[0]) && a[0] > 0 ? Math.log10(a[0]) : NA,
  exp: (a) => sayiMi(a[0]) ? Math.exp(a[0]) : NA,
  floor: (a) => sayiMi(a[0]) ? Math.floor(a[0]) : NA,
  ceil: (a) => sayiMi(a[0]) ? Math.ceil(a[0]) : NA,
  // Pine `math.round(x, hane)` — ikinci argüman ondalık hane sayısı.
  round: (a) => {
    if (!sayiMi(a[0])) return NA;
    const h = sayiMi(a[1]) ? Math.floor(a[1]) : 0;
    const k = Math.pow(10, h);
    return Math.round(a[0] * k) / k;
  },
  sign: (a) => sayiMi(a[0]) ? Math.sign(a[0]) : NA,
  avg: (a) => a.every(sayiMi) ? topla(a) / a.length : NA,
  sum: (a) => a.every(sayiMi) ? topla(a) : NA,
  sin: (a) => sayiMi(a[0]) ? Math.sin(a[0]) : NA,
  cos: (a) => sayiMi(a[0]) ? Math.cos(a[0]) : NA,
  tan: (a) => sayiMi(a[0]) ? Math.tan(a[0]) : NA,
  todegrees: (a) => sayiMi(a[0]) ? a[0] * 180 / Math.PI : NA,
  toradians: (a) => sayiMi(a[0]) ? a[0] * Math.PI / 180 : NA
};

/**
 * `ta.*` kayıt defteri.
 *
 * `durumlu: true` olan her çağrı noktası kendi durum nesnesini alır.
 * `demet: n` çoklu dönüş verir (`[m, s, h] = ta.macd(...)`).
 */
const TA = {
  sma: { fn: sma, durumlu: true },
  ema: { fn: ema, durumlu: true },
  rma: { fn: rma, durumlu: true },
  wma: { fn: wma, durumlu: true },
  vwma: { fn: vwma, durumlu: true },
  hma: { fn: hma, durumlu: true },
  rsi: { fn: rsi, durumlu: true },
  atr: { fn: atr, durumlu: true },
  tr: { fn: tr, durumlu: true },
  stdev: { fn: stdev, durumlu: true },
  variance: { fn: variance, durumlu: true },
  median: { fn: median, durumlu: true },
  highest: { fn: highest, durumlu: true },
  lowest: { fn: lowest, durumlu: true },
  highestbars: { fn: highestbars, durumlu: true },
  lowestbars: { fn: lowestbars, durumlu: true },
  change: { fn: change, durumlu: true },
  mom: { fn: mom, durumlu: true },
  roc: { fn: roc, durumlu: true },
  cum: { fn: cum, durumlu: true },
  sum: { fn: sum, durumlu: true },
  crossover: { fn: crossover, durumlu: true },
  crossunder: { fn: crossunder, durumlu: true },
  cross: { fn: cross, durumlu: true },
  barssince: { fn: barssince, durumlu: true },
  valuewhen: { fn: valuewhen, durumlu: true },
  rising: { fn: rising, durumlu: true },
  falling: { fn: falling, durumlu: true },
  macd: { fn: macd, durumlu: true, demet: 3 },
  bb: { fn: bb, durumlu: true, demet: 3 },
  bbw: { fn: bbw, durumlu: true },
  stoch: { fn: stoch, durumlu: true },
  cci: { fn: cci, durumlu: true },
  obv: { fn: obv, durumlu: true },
  mfi: { fn: mfi, durumlu: true }
};

module.exports = {
  TA, MATH, NA, sayiMi,
  /** İnceleme katmanı destek listesini buradan okur — tek kaynak. */
  taAdlari: () => new Set(Object.keys(TA)),
  mathAdlari: () => new Set(Object.keys(MATH))
};
