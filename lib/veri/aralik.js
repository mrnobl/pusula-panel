/**
 * TARİH ARALIĞI VERİ KATMANI — backtest "son N mum" yerine [bas, bit] ister.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN (kullanıcı, 2026-10-06)
 * ─────────────────────────────────────────────────────────────────────────
 * Panel her zaman diliminde en çok 5000 mum alıyordu: günlükte 13 yıl, 1
 * dakikada 3,5 gün. Ölçüm için gereken şey mum SAYISI değil TARİH aralığı ve
 * borsanın verebildiği en uzun geçmiş. Bu modül:
 *   · borsadaki İLK mumu bulur (listeleme tarihi),
 *   · depoda olmayan başı / sonu / iç boşluğu sayfa sayfa indirir,
 *   · ilerlemeyi bildirir ve iptal edilebilir,
 *   · aralığı depodan okur (SQLite, birincil anahtar üzerinden).
 *
 * Sembol kovası: vadelide ccxt sembolü `BTC/USDT:USDT`. Araştırma ölçümleri
 * ve `scripts/vadeli-veri-cek.js` perp verisini bu adla saklıyor; aynı ad
 * kullanılmazsa aynı veri iki kez indirilir.
 */
const venues = require('../venues');

const TF_MS = Object.freeze({
  '1m': 60e3, '3m': 180e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3,
  '1h': 3600e3, '2h': 7200e3, '4h': 14400e3, '6h': 21600e3, '8h': 28800e3, '12h': 43200e3,
  '1d': 864e5, '3d': 2592e5, '1w': 6048e5
});
const SAYFA = 1000;                 // Binance spot üst sınırı; USDⓈ-M 1500 ama 1000 ikisinde de güvenli
const COK_ESKI = Date.UTC(2010, 0, 1);

function tfMs(tf) {
  const ms = TF_MS[tf];
  if (!ms) throw new Error(`Desteklenmeyen zaman dilimi: ${tf}`);
  return ms;
}

const perpMi = (market) => venues.normalizeMarket(market) === 'perp';

/** Depo ve ccxt için sembol: vadelide `BTC/USDT:USDT`. */
function depoSembolu(sembol, market) {
  if (!perpMi(market) || sembol.includes(':')) return sembol;
  return `${sembol}:${sembol.split('/')[1]}`;
}

const ilkOnbellek = new Map();

/** Borsadaki ilk mumun zamanı (listeleme). Süreç ömrü boyunca önbellekte. */
async function ilkMum(venue, market, sembol, tf) {
  const anahtar = `${venue}|${market}|${sembol}|${tf}`;
  if (ilkOnbellek.has(anahtar)) return ilkOnbellek.get(anahtar);
  const ex = venues.client(venue, market);
  const ham = await ex.fetchOHLCV(depoSembolu(sembol, market), tf, COK_ESKI, 1);
  const t = ham && ham.length ? ham[0][0] : null;
  if (t != null) ilkOnbellek.set(anahtar, t);
  return t;
}

/**
 * Aralığın depodaki durumu: kaç mum var, kaç olmalı, eksik parçalar.
 * `ilk` verilirse aralık listeleme tarihinden önce başlayamaz.
 */
function kapsam(store, { venue, market, sembol, tf, bas, bit, ilk = null }) {
  const ms = tfMs(tf);
  const simdi = Date.now();
  // Henüz kapanmamış son mum aralığa girmez.
  const sonKapanan = Math.floor(simdi / ms) * ms - ms;
  const b = Math.max(Math.floor(bas / ms) * ms, ilk || 0);
  const e = Math.min(Math.floor(bit / ms) * ms, sonKapanan);
  const kaynak = { venue, market };
  const ds = depoSembolu(sembol, market);
  if (e < b) return { bas: b, bit: e, beklenen: 0, depoda: 0, eksikler: [], tam: true, depoSembolu: ds };
  const beklenen = Math.floor((e - b) / ms) + 1;
  const st = store.rangeStats(ds, tf, b, e, kaynak);
  const eksikler = [];
  if (!st.count) {
    eksikler.push([b, e]);
  } else {
    if (st.firstTime > b) eksikler.push([b, st.firstTime - ms]);
    if (st.lastTime < e) eksikler.push([st.lastTime + ms, e]);
    // İç boşluk: uçlar arası beklenenden azsa aradaki parçayı da yeniden indir
    // (UPSERT — var olanlar üzerine yazılır, çoğalmaz). Borsa kesintileri
    // yüzünden kalıcı küçük boşluklar olabilir: %0,5'e kadar tolerans.
    const icBeklenen = Math.floor((st.lastTime - st.firstTime) / ms) + 1;
    if (st.count < icBeklenen * 0.995) eksikler.push([st.firstTime, st.lastTime]);
  }
  const eksikMum = eksikler.reduce((t, [x, y]) => t + Math.floor((y - x) / ms) + 1, 0);
  return { bas: b, bit: e, beklenen, depoda: st.count, eksikler, eksikMum, tam: eksikler.length === 0, depoSembolu: ds };
}

/**
 * Eksik parçaları indirir. `ilerleme({ indirilen, toplam, yuzde })` her
 * sayfada çağrılır; `iptal()` true dönerse durur.
 * @returns {{ indirilen, istek, sure }}
 */
async function indir(store, { venue, market, sembol, tf, bas, bit, ilerleme, iptal }) {
  const t0 = Date.now();
  const ms = tfMs(tf);
  const ilk = await ilkMum(venue, market, sembol, tf);
  if (ilk == null) throw new Error(`${venue} ${market} ${sembol} ${tf}: borsada mum yok`);
  const k = kapsam(store, { venue, market, sembol, tf, bas, bit, ilk });
  const ex = venues.client(venue, market);
  const toplam = k.eksikMum || 0;
  let indirilen = 0, istek = 0;

  // SAYFALAR ÖNCEDEN BÖLÜNÜR, 5'ER EŞ ZAMANLI İNDİRİLİR. Sıralı indirmede
  // istek başı ~0,4 sn gecikme 1m tam geçmişi (4,8 milyon mum) 35 dakikaya
  // çıkarıyordu. Binance klines ağırlığı 2, dakika sınırı 1200 → 5 eş
  // zamanlı istek sınırın altında; ccxt'nin hız sınırlayıcısı ayrıca açık.
  const sayfalar = [];
  for (const [pb, pe] of k.eksikler) {
    for (let s = pb; s <= pe; s += SAYFA * ms) sayfalar.push([s, Math.min(pe, s + (SAYFA - 1) * ms)]);
  }
  const ESZAMAN = 5;
  let sira = 0;
  const isci = async () => {
    while (sira < sayfalar.length) {
      if (iptal && iptal()) throw new Error('İndirme iptal edildi');
      const [sb, se] = sayfalar[sira++];
      let ham = null;
      for (let deneme = 0; deneme < 3 && !ham; deneme++) {
        try { ham = await ex.fetchOHLCV(k.depoSembolu, tf, sb, SAYFA); } catch (e) {
          if (deneme === 2) throw e;
          await new Promise(r => setTimeout(r, 1500 * (deneme + 1)));
        }
      }
      istek++;
      const mumlar = (ham || []).filter(c => c[0] >= sb && c[0] <= se)
        .map(c => ({ time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] }));
      if (mumlar.length) store.saveCandles(k.depoSembolu, tf, mumlar, { venue, market });
      // Borsa kesintisinde sayfa eksik döner; ilerleme sayfanın tamamı kadar
      // sayılır ki yüzde %100'e ulaşsın.
      indirilen += Math.floor((se - sb) / ms) + 1;
      if (ilerleme) ilerleme({ indirilen: Math.min(indirilen, toplam), toplam, yuzde: toplam ? Math.min(100, indirilen / toplam * 100) : 100, istek });
    }
  };
  await Promise.all(Array.from({ length: Math.min(ESZAMAN, sayfalar.length) }, isci));
  return { indirilen, istek, sure: Date.now() - t0, kapsam: kapsam(store, { venue, market, sembol, tf, bas, bit, ilk }) };
}

/** Aralığı depodan okur (indirmez). */
function oku(store, { venue, market, sembol, tf, bas, bit }) {
  return store.getCandlesRange(depoSembolu(sembol, market), tf, bas, bit, { venue, market });
}

module.exports = { TF_MS, tfMs, depoSembolu, ilkMum, kapsam, indir, oku };
