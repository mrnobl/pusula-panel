/**
 * İLERİ VERİ GÖLGE İZLEYİCİ — Bollinger "düşüş azaltıcı" (PLAN-ILERI-BOLLINGER.md, ÖN-KAYIT).
 * EMİR YOK, PARA YOK: yalnız karar kaydı. Kurallar lib/research/trendKurallari.js (DONDURULMUŞ,
 * yalnız require edilir).
 *
 * Her çalışmada 37 seri (BTC/USDT perp 1d — Binance genel API, anahtarsız; PLAN-GERCEK-MI-H2.md
 * listesindeki 36 Yahoo serisi, aynı indirme yöntemi: v8/finance/chart, period1=0, interval=1d,
 * `adjclose` yoksa `close`) indirilir; YALNIZ KAPANMIŞ günlük mumlar kullanılır.
 *
 * KAYIT `data/ileri/bollinger-kayit.jsonl` — YALNIZ EKLENİR. Satır:
 *   { seri, kararGunu, C0, C1, C3, kapanis, oncekiGun, oncekiKapanis, kaynak, kayitZamani, gecikmeliKayit }
 *   · C0/C1/C3: 1 = LONG, 0 = pozisyon yok — kararGunu KAPANIŞINDAKİ karar (ertesi işlem günü uygulanır).
 *   · kapanis / oncekiKapanis AYNI anlık veriden (temettü ayarlı `adjclose` geçmişte sonradan
 *     değişse de getiri o günün verisiyle hesaplanır). Getiri türetilmiş dosyada: kayıttan yeniden üretilir.
 *   · (seri, kararGunu) bir kez yazılır; geçmiş satır ASLA güncellenmez/silinmez.
 *   · gecikmeliKayit: true → satır yazıldığı anki veride kararGunu'nden SONRA kapanmış mum vardı
 *     (sunucu kapalıydı / veri geç geldi). Karar yine yalnız kararGunu'ne kadarki veriyle hesaplanır
 *     (seri o güne kesilir — ileriye bakma yok).
 *   · İlk kararGunu 2026-10-06; daha eskisi yazılmaz.
 *
 * GÖLGE (bilgi, karar dışı) `data/ileri/bindirme-golge.jsonl`: Hücum (BTC %100) / Denge (BTC %50)
 * C0 / C1 / C3 sürümlerinin günlük MODEL getirisi = BTC ayağı (önceki günün kararı × BTC getirisi −
 * geçişte %0,12) + kol model getirisi (kalkanBot ile AYNI fonksiyonlar: donchianModelGetirisi,
 * dcaModelGetirisi, tersVolAgirlik; dünkü ağırlıklarla × 3). Aynı yalnız-ekle kuralı, anahtar `gun`.
 *
 * KAPANMIŞ MUM: Binance — açılış + 1 gün ≤ şimdi. Yahoo — mumun yerel tarihi, meta
 * `currentTradingPeriod.regular` oturumunun yerel tarihine eşit/büyükse ve şimdi < oturum sonu +
 * 10 dk ise mum açıktır (atılır). Meta yoksa: yerel tarihi UTC bugününe eşit/büyük mum atılır.
 *
 * Eşzamanlılık: sunucu ve `scripts/ileri-izle.js` aynı anda koşabilir → kilit dosyası (`.kilit`,
 * 'wx'; 30 dk'dan eski kilit bayat sayılır). Yazım atomik: geçici dosya + rename.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const { durumlar } = require('../research/trendKurallari');

const KOK = path.join(__dirname, '..', '..');
const VARSAYILAN_DIZIN = yollar.veri('ileri');
const GUN = 864e5;
const BAS_KARAR = '2026-10-06';           // ilk karar günü (kapanışı)
const BAS_GETIRI = '2026-10-07';          // ilk ileri getiri günü
const KARARLAR = ['C0', 'C1', 'C3'];
const SPOT_MALIYET = 0.0012;              // BTC ayağı geçiş maliyeti (bindirme.js SPOT_MALIYET)
const KOL_M = 3;
const ACIK_TAMPON_MS = 10 * 60 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

/** PLAN-GERCEK-MI-H2.md 1.1 — aynı liste, aynı sıra (selftest betikteki listeyle karşılaştırır). */
const YAHOO_VARLIKLAR = Object.freeze([
  ['^GSPC', 'S&P 500', 'hisse'], ['^NDX', 'Nasdaq 100', 'hisse'], ['^DJI', 'Dow Jones', 'hisse'],
  ['^RUT', 'Russell 2000', 'hisse'], ['^GDAXI', 'DAX', 'hisse'], ['^FTSE', 'FTSE 100', 'hisse'],
  ['^N225', 'Nikkei 225', 'hisse'], ['^HSI', 'Hang Seng', 'hisse'], ['^FCHI', 'CAC 40', 'hisse'],
  ['^STOXX50E', 'Euro Stoxx 50', 'hisse'], ['EEM', 'MSCI EM ETF', 'hisse'], ['^BVSP', 'Bovespa', 'hisse'],
  ['XU100.IS', 'BIST 100 (USD)', 'hisse'], ['^AXJO', 'ASX 200', 'hisse'], ['^KS11', 'KOSPI', 'hisse'],
  ['GC=F', 'Altın', 'emtia'], ['SI=F', 'Gümüş', 'emtia'], ['CL=F', 'Ham petrol', 'emtia'],
  ['HG=F', 'Bakır', 'emtia'], ['NG=F', 'Doğal gaz', 'emtia'], ['ZC=F', 'Mısır', 'emtia'],
  ['ZW=F', 'Buğday', 'emtia'], ['ZS=F', 'Soya', 'emtia'], ['PL=F', 'Platin', 'emtia'],
  ['TLT', 'TLT 20+y', 'tahvil'], ['IEF', 'IEF 7-10y', 'tahvil'],
  ['EURUSD=X', 'EUR/USD', 'doviz'], ['JPY=X', 'USD/JPY', 'doviz'], ['GBPUSD=X', 'GBP/USD', 'doviz'],
  ['AUDUSD=X', 'AUD/USD', 'doviz'], ['CHF=X', 'USD/CHF', 'doviz'], ['CAD=X', 'USD/CAD', 'doviz'],
  ['ETH-USD', 'Ethereum', 'kripto'], ['LTC-USD', 'Litecoin', 'kripto'], ['XRP-USD', 'XRP', 'kripto'],
  ['BCH-USD', 'Bitcoin Cash', 'kripto']
]);
const BTC_SERI = 'BTC';
/** 37 seri: [kimlik, ad, sınıf] — BTC ilk sırada. */
const SERILER = Object.freeze([[BTC_SERI, 'BTC/USDT perp (Binance)', 'kripto'], ...YAHOO_VARLIKLAR]);
const SINIF = new Map(SERILER.map(([s, , c]) => [s, c]));

const gunStr = (t) => new Date(t).toISOString().slice(0, 10);
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

/** Ağ hatasında tekrar dener (artan bekleme). */
async function tekrarla(fn, { deneme = 3, taban = 2000 } = {}) {
  let son;
  for (let i = 0; i < deneme; i++) {
    try { return await fn(); } catch (e) { son = e; if (i < deneme - 1) await bekle(taban * (i + 1)); }
  }
  throw son;
}

// ═══ 1. VERİ ═══════════════════════════════════════════════════════════════
/**
 * SAF: Yahoo chart yanıtından KAPANMIŞ günlük [tarih, kapanış] dizisi.
 * @returns {{ seri: [[YYYY-MM-DD, number]], kaynak, acikAtilan: string[] }}
 */
function yahooAyristir(j, simdi) {
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp) throw new Error('boş sonuç');
  const off = (r.meta && r.meta.gmtoffset) || 0;
  const adj = r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose;
  const kap = r.indicators.quote[0].close;
  const kaynak = adj ? 'adjclose' : 'close';
  const yerel = (ts) => new Date((ts + off) * 1000).toISOString().slice(0, 10);
  const m = new Map();
  for (let i = 0; i < r.timestamp.length; i++) {
    const v = adj ? adj[i] : kap[i];
    if (v == null || !Number.isFinite(v)) continue;
    m.set(yerel(r.timestamp[i]), v);                       // aynı tarih tekrarı → sonuncu (H2 ile aynı)
  }
  const ctp = r.meta && r.meta.currentTradingPeriod && r.meta.currentTradingPeriod.regular;
  const acikMi = (t) => {
    if (ctp && Number.isFinite(ctp.start) && Number.isFinite(ctp.end)) {
      const oturumGun = new Date((ctp.start + (ctp.gmtoffset ?? off)) * 1000).toISOString().slice(0, 10);
      return t >= oturumGun && simdi < ctp.end * 1000 + ACIK_TAMPON_MS;
    }
    return t >= gunStr(simdi);
  };
  const acikAtilan = [];
  const seri = [];
  for (const [t, v] of [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (acikMi(t)) { acikAtilan.push(t); continue; }
    seri.push([t, v]);
  }
  return { seri, kaynak, acikAtilan };
}

async function yahooIndir(sembol, simdi, fetchFn = fetch) {
  const p2 = Math.floor(simdi / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sembol)}?period1=0&period2=${p2}&interval=1d&events=div%2Csplit`;
  return tekrarla(async () => {
    const res = await fetchFn(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${sembol}: HTTP ${res.status}`);
    return yahooAyristir(await res.json(), simdi);
  });
}

/**
 * SAF: veri geçerliliği (H2 1.2 "fiyat ≤ 0" kuralının İLERİ karşılığı): seri son ≤ 0 fiyattan
 * SONRAKİ kısmıyla sınırlanır — ileri karar yalnız son 200 günü ve sonrasını gerektirir, H2'deki
 * "o günden öncesi" kesimi ileri dönemi tümden yok ederdi. Not döner.
 */
function gecerliKisim(seri) {
  let son = -1;
  for (let i = 0; i < seri.length; i++) if (!(seri[i][1] > 0)) son = i;
  if (son < 0) return { seri, not: null };
  return { seri: seri.slice(son + 1), not: `fiyat ≤ 0 (${seri[son][0]}) → seri ${seri[son + 1] ? seri[son + 1][0] : '-'} tarihinden başlatıldı` };
}

/** BTC/USDT perp 1d — Binance genel API (ccxt, anahtarsız), 2019-09'dan sayfalı; yalnız kapanmış. */
async function btcIndir(simdi, borsa) {
  const b = borsa || new (require('ccxt').binanceusdm)({ enableRateLimit: true });
  const tum = new Map();
  let since = Date.UTC(2019, 8, 1);
  for (let i = 0; i < 10; i++) {
    const ham = await tekrarla(() => b.fetchOHLCV('BTC/USDT:USDT', '1d', since, 1500));
    if (!ham.length) break;
    for (const m of ham) tum.set(m[0], m[4]);
    const son = ham[ham.length - 1][0];
    if (son + GUN > simdi || ham.length < 2) break;
    since = son + GUN;
  }
  const seri = [...tum.entries()].sort((a, b2) => a[0] - b2[0]).filter(([t]) => t + GUN <= simdi).map(([t, c]) => [gunStr(t), c]);
  return { seri, kaynak: 'binance-usdm 1d close' };
}

/** Tüm 37 seri. Hata veren seri `eksik`e yazılır (yerine seri eklenmez). */
async function hepsiniIndir(simdi, { fetchFn = fetch, borsa = null, log = () => {} } = {}) {
  const veriler = new Map(), eksik = [], notlar = {};
  try { veriler.set(BTC_SERI, await btcIndir(simdi, borsa)); } catch (e) { eksik.push({ seri: BTC_SERI, neden: e.message }); }
  let kur = null;
  for (const [s] of YAHOO_VARLIKLAR) {
    try {
      let v = await yahooIndir(s, simdi, fetchFn);
      if (s === 'XU100.IS') {
        if (!kur) kur = await yahooIndir('USDTRY=X', simdi, fetchFn);
        const k = new Map(kur.seri);
        v = { ...v, seri: v.seri.filter(([t]) => k.get(t) > 0).map(([t, x]) => [t, x / k.get(t)]), kaynak: v.kaynak + ' / USDTRY=X' };
      }
      const g = gecerliKisim(v.seri);
      if (g.not) notlar[s] = g.not;
      if (!g.seri.length) throw new Error('geçerli veri yok');
      veriler.set(s, { ...v, seri: g.seri });
    } catch (e) { eksik.push({ seri: s, neden: e.message }); log('WARN', `${s}: ${e.message}`); }
    await bekle(250);
  }
  return { veriler, eksik, notlar };
}

// ═══ 2. KARAR SATIRLARI (saf) ══════════════════════════════════════════════
/**
 * Bir serinin eklenecek satırları. Her eksik (seri, gün ≥ BAS_KARAR) için karar, seri o GÜNE
 * KESİLEREK hesaplanır (t+1 ve sonrası hiç görülmez).
 * @param mevcut Set "seri|gün"
 */
function kararSatirlari(seri, veri, mevcut, { simdi, bas = BAS_KARAR } = {}) {
  const s = veri.seri;
  const out = [];
  if (s.length < 2) return out;
  const sonIdx = s.length - 1;
  const k = s.map(x => x[1]);
  for (let i = 1; i <= sonIdx; i++) {
    const g = s[i][0];
    if (g < bas || mevcut.has(`${seri}|${g}`)) continue;
    const kes = k.slice(0, i + 1);
    const sat = { seri, kararGunu: g };
    for (const c of KARARLAR) { const d = durumlar(kes, c); sat[c] = d[i]; }
    Object.assign(sat, { kapanis: k[i], oncekiGun: s[i - 1][0], oncekiKapanis: k[i - 1], kaynak: veri.kaynak || null,
      kayitZamani: new Date(simdi).toISOString(), gecikmeliKayit: i < sonIdx });
    out.push(sat);
  }
  return out;
}

// ═══ 3. YALNIZ-EKLE DOSYA ═══════════════════════════════════════════════════
function satirlariOku(dosya) {
  if (!fs.existsSync(dosya)) return [];
  return fs.readFileSync(dosya, 'utf8').split('\n').filter(x => x.trim()).map((x, i) => {
    try { return JSON.parse(x); } catch { throw new Error(`${path.basename(dosya)} satır ${i + 1} bozuk — dosya elle düzeltilmeli (otomatik silinmez)`); }
  });
}

/** Atomik ekleme: eski içerik AYNEN korunur, yeni satırlar sona eklenir (geçici dosya + rename). */
function ekle(dosya, satirlar) {
  if (!satirlar.length) return 0;
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  let eski = fs.existsSync(dosya) ? fs.readFileSync(dosya, 'utf8') : '';
  if (eski && !eski.endsWith('\n')) eski += '\n';
  const yeni = eski + satirlar.map(x => JSON.stringify(x)).join('\n') + '\n';
  const gecici = `${dosya}.${process.pid}.tmp`;
  fs.writeFileSync(gecici, yeni, 'utf8');
  fs.renameSync(gecici, dosya);
  return satirlar.length;
}

async function kilitle(dizin, fn) {
  fs.mkdirSync(dizin, { recursive: true });
  const kilit = path.join(dizin, '.kilit');
  for (let i = 0; ; i++) {
    try { fs.writeFileSync(kilit, String(process.pid), { flag: 'wx' }); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let eski = false;
      try { eski = Date.now() - fs.statSync(kilit).mtimeMs > 30 * 60 * 1000; } catch { /* yarışta silinmiş */ }
      if (eski) { try { fs.unlinkSync(kilit); } catch { /* */ } continue; }
      if (i >= 120) throw new Error('ileri izleme kilidi alınamadı (başka bir çalışma sürüyor)');
      await bekle(1000);
    }
  }
  try { return await fn(); } finally { try { fs.unlinkSync(kilit); } catch { /* */ } }
}

const dosyalar = (dizin = VARSAYILAN_DIZIN) => ({
  kayit: path.join(dizin, 'bollinger-kayit.jsonl'),
  golge: path.join(dizin, 'bindirme-golge.jsonl'),
  getiri: path.join(dizin, 'bollinger-getiri.json'),
  son: path.join(dizin, 'son-calisma.json'),
});

// ═══ 4. GÖLGE: Hücum / Denge model getirisi (bilgi) ═════════════════════════
/**
 * SAF: BTC satırları + kol getirisi → gölge satırı. Kararlar ÖNCEKİ günün (D−1) kapanışından;
 * geçiş maliyeti D−2 kararına göre (ilk günden önce nakit varsayılır, ileri bölüm gibi).
 */
function golgeSatiri(D, btc, kol, { simdi, gecikmeli }) {
  const bugun = btc.get(D); if (!bugun) return null;
  const dun = btc.get(bugun.oncekiGun); if (!dun) return null;
  const evvel = btc.get(dun.oncekiGun) || null;
  const rBtc = bugun.kapanis / bugun.oncekiKapanis - 1;
  const sat = { gun: D, btcGetiri: rBtc, kararGunu: dun.kararGunu, kararlar: {}, kol, hucum: {}, denge: {}, kayitZamani: new Date(simdi).toISOString(), gecikmeliKayit: !!gecikmeli };
  for (const c of KARARLAR) {
    const w = dun[c], w0 = evvel ? evvel[c] : 0;
    sat.kararlar[c] = w;
    for (const [ad, pay] of [['hucum', 1], ['denge', 0.5]]) {
      sat[ad][c] = pay * w * rBtc - Math.abs(pay * w - pay * w0) * SPOT_MALIYET + kol.getiri;
    }
  }
  return sat;
}

/**
 * Kol model getirisi — kalkanBot.calistir ile AYNI hesap (donchianModelGetirisi, dcaModelGetirisi,
 * dünkü ters-vol ağırlık, × kolCarpani 3). Her D için mumlar D'ye KESİLİR (ileriye bakma yok).
 * Evren: kendi `Evren` kaydı (data/ileri/kol/evren.json) — Binance genel API, anahtarsız.
 * @returns Map(D → { getiri, rDon, rDca, agirlikDon, agirlikDca, evren })
 */
async function kolModelleri(gunler, simdi, { dizin = VARSAYILAN_DIZIN, borsa = null } = {}) {
  const { KalkanBot, donchianModelGetirisi, dcaModelGetirisi, tersVolAgirlik } = require('../live/kalkanBot');
  const { kapanmisGunlukMumlar } = require('../live/donchianBot');
  const { Evren } = require('../live/evren');
  const b = borsa || new (require('ccxt').binanceusdm)({ enableRateLimit: true });
  if (!b.markets || !Object.keys(b.markets).length) await tekrarla(() => b.loadMarkets());
  const evren = new Evren({ dizin: path.join(dizin, 'kol'), k: 15 });
  const ev = await evren.guncelle(b, simdi);
  const U = ev.semboller;
  const oncekiAy = evren.ayEvreni(simdi - 40 * GUN) || [];
  const gerekli = [...new Set([...U, ...oncekiAy])].filter(s => b.markets[s]);
  const mumlar = new Map();
  for (const s of gerekli) {
    try { const m = await tekrarla(() => kapanmisGunlukMumlar(b, s, simdi)); if (m.length) mumlar.set(s, m); } catch { /* sembol atlanır */ }
  }
  const ctx = { evren };
  const uye = KalkanBot.prototype._uyeFn.call(ctx, U);
  const seg = KalkanBot.prototype._segmentBasiFn.call(ctx, U, simdi);
  const out = new Map();
  for (const D of gunler) {
    const tD = Date.parse(`${D}T00:00:00Z`);
    const kes = new Map();
    for (const [s, m] of mumlar) { const x = m.filter(c => c.time <= tD); if (x.length) kes.set(s, x); }
    const mD = donchianModelGetirisi(kes, uye, {});
    const mC = dcaModelGetirisi(kes, uye, { segmentBasi: seg });
    const son = mD.gunler.length ? mD.gunler[mD.gunler.length - 1] : null;
    if (son !== tD) continue;                                   // D mumu yok → yazılmaz (sonra denenir)
    const ag = tersVolAgirlik(mD.getiri.slice(0, -1), mC.getiri.slice(0, -1));
    const sonR = (m) => (m.getiri.length ? m.getiri[m.getiri.length - 1] : 0);
    out.set(D, { getiri: KOL_M * (ag.don * sonR(mD) + ag.dca * sonR(mC)), rDon: sonR(mD), rDca: sonR(mC),
      agirlikDon: ag.don, agirlikDca: ag.dca, agirlikYontem: ag.yontem, evren: U.length, evrenAy: ev.ay });
  }
  return out;
}

// ═══ 5. ÇALIŞTIR ════════════════════════════════════════════════════════════
/**
 * Bir çalışma: indir → kayıt ekle → gölge ekle → türetilmiş getiri dosyası.
 * @param o.indir   (simdi) → { veriler: Map(seri → {seri:[[gün, kapanış]], kaynak}), eksik, notlar } (test için)
 * @param o.kolModel (gunler[], simdi) → Map(D → kol) (test için)
 */
async function calistir({ simdi = Date.now(), dizin = VARSAYILAN_DIZIN, indir = null, kolModel = null, log = () => {} } = {}) {
  const F = dosyalar(dizin);
  return kilitle(dizin, async () => {
    const t0 = Date.now();
    const v = indir ? await indir(simdi) : await hepsiniIndir(simdi, { log });
    const mevcutSat = satirlariOku(F.kayit);
    const mevcut = new Set(mevcutSat.map(x => `${x.seri}|${x.kararGunu}`));
    const yeni = [];
    const seriOzet = [];
    for (const [s] of SERILER) {
      const d = v.veriler.get(s);
      if (!d) continue;
      const sat = kararSatirlari(s, d, mevcut, { simdi });
      for (const x of sat) mevcut.add(`${x.seri}|${x.kararGunu}`);
      yeni.push(...sat);
      seriOzet.push({ seri: s, sonKapanmis: d.seri.length ? d.seri[d.seri.length - 1][0] : null, yeni: sat.length, gecikmeli: sat.filter(x => x.gecikmeliKayit).length });
    }
    ekle(F.kayit, yeni);

    // Gölge — BTC satırlarından (yazılmış olanlar dahil)
    const btc = new Map([...mevcutSat, ...yeni].filter(x => x.seri === BTC_SERI).map(x => [x.kararGunu, x]));
    const golgeMevcut = new Set(satirlariOku(F.golge).map(x => x.gun));
    const btcGunler = [...btc.keys()].sort();
    const sonBtc = btcGunler[btcGunler.length - 1];
    const eksikGolge = btcGunler.filter(D => D >= BAS_GETIRI && !golgeMevcut.has(D) && btc.get(btc.get(D).oncekiGun)
      && Date.parse(D) >= simdi - 60 * GUN);
    let golgeYeni = [], golgeHata = null;
    if (eksikGolge.length) {
      try {
        const kol = kolModel ? await kolModel(eksikGolge, simdi) : await kolModelleri(eksikGolge, simdi, { dizin });
        for (const D of eksikGolge) {
          const k = kol.get(D); if (!k) continue;
          const g = golgeSatiri(D, btc, k, { simdi, gecikmeli: D !== sonBtc });
          if (g) golgeYeni.push(g);
        }
        ekle(F.golge, golgeYeni);
      } catch (e) { golgeHata = e.message; log('WARN', `gölge (kol modeli): ${e.message}`); }
    }

    // Türetilmiş dosya — kayıttan yeniden üretilir
    const R = require('./bollingerRapor');
    const tumSat = [...mevcutSat, ...yeni];
    const turev = R.turet(tumSat);
    const gecici = F.getiri + '.tmp';
    fs.writeFileSync(gecici, JSON.stringify({ uretim: new Date(simdi).toISOString(), not: 'TÜRETİLMİŞ — bollinger-kayit.jsonl dosyasından yeniden üretilir; elle düzenlemeyin', seriler: turev }), 'utf8');
    fs.renameSync(gecici, F.getiri);

    const ozet = { zaman: new Date(simdi).toISOString(), sureMs: Date.now() - t0, yeniSatir: yeni.length,
      gecikmeliSatir: yeni.filter(x => x.gecikmeliKayit).length, golgeYeni: golgeYeni.length, golgeHata,
      kaydedilenSeri: [...new Set(tumSat.map(x => x.seri))].length, eksik: v.eksik || [], notlar: v.notlar || {}, seriler: seriOzet };
    fs.writeFileSync(F.son + '.tmp', JSON.stringify(ozet, null, 2), 'utf8');
    fs.renameSync(F.son + '.tmp', F.son);
    return ozet;
  });
}

module.exports = {
  SERILER, YAHOO_VARLIKLAR, BTC_SERI, SINIF, KARARLAR, BAS_KARAR, BAS_GETIRI, VARSAYILAN_DIZIN, GUN,
  yahooAyristir, yahooIndir, btcIndir, hepsiniIndir, gecerliKisim, kararSatirlari, satirlariOku, ekle, kilitle,
  golgeSatiri, kolModelleri, calistir, dosyalar, tekrarla,
};
