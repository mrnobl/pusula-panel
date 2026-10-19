/**
 * BACKTEST İŞ PARÇACIĞI — `worker_threads` içinde koşar.
 *
 * NEDEN: `Backtester.run` eş zamanlı (senkron) ve canlı motorla aynı
 * süreçteydi. Yıllarca 1m koşusu dakikalar sürer; o süre boyunca olay döngüsü
 * kilitlenir — WebSocket tick'leri, canlı bot, panel durur. Burada koşunca ana
 * süreç yalnızca ilerleme mesajı alır.
 *
 * Mesajlar (ana sürece): { tur: 'ilerleme', oran, asama } · { tur: 'log', level,
 * message } (database.js iletir) · { tur: 'sonuc', sonuc, tumIslemler } ·
 * { tur: 'hata', mesaj }.
 */
const { parentPort, workerData } = require('worker_threads');
const B = require('../backtester');
const db = require('../database');
const aralik = require('../veri/aralik');
const rapor = require('./rapor');
// İçe aktarılan Pine botları katalogda ÇALIŞMA ZAMANINDA kaydedilir (ana süreç
// server.js'te pineStore.yukle()). İş parçacığı kendi modül kopyasını yükler —
// burada da kaydedilmezse 'Bilinmeyen strateji tipi' (Panel 58 bulgusu).
try { require('../pine/store').yukle(); } catch (e) { /* Pine yoksa yerleşikler yeter */ }

/**
 * İŞİN KENDİ PINE BETİĞİ (Pusula P4): ana süreç içe aktarılan stratejinin KAYNAĞINI iş verisinde
 * gönderir (`w.pine = { anahtar, kaynak }`). Diskteki depoya bağlı kalmaz: kaydedilip henüz
 * yeniden yüklenmemiş ya da depodan okunamayan betik de koşar ve AYNI kaynak koşar. Derleme
 * hatası işi açık hatayla bitirir (desteklenmeyen yapı satır numarasıyla).
 */
function pineKaydet(p) {
  if (!p || !p.anahtar || typeof p.kaynak !== 'string') return;
  const { derle } = require('../pine/strategy');
  const { inspect } = require('../pine/inspect');
  const bilgi = inspect(p.kaynak);
  const Sinif = derle(p.kaynak, { label: bilgi.ad });
  require('../strategies/catalog').kaydet({ key: p.anahtar, label: bilgi.ad || p.anahtar, Class: Sinif, archived: false, pine: true });
}

const ilet = (m) => parentPort.postMessage(m);

/**
 * İZLEME LİSTESİ TARAMASI — örneklem dışı sıralama.
 *
 * Eski tarama her stratejiyi TÜM veride optimize edip aynı verideki skora
 * göre "en iyi 5" seçiyordu: bu, aşırı uyumun kendisini sıralamak demekti.
 * Şimdi: ilk %70'te parametre aranır, sıralama hiç görülmemiş son %30'daki
 * sonuca göre yapılır (test önüne ısınma barları, o barlarda giriş kapalı).
 */
function tara(w) {
  const catalog = require('../strategies/catalog');
  const { optimizeParameters, isinmaBari } = require('./optimize');
  const stratejiler = (w.stratejiler && w.stratejiler.length ? w.stratejiler : catalog.keys()).filter(k => catalog.has(k))
    // Portföy botları (Hücum/Denge) yalnız BTC 1d için tanımlı — izleme listesi taramasında anlamsız.
    .filter(k => !catalog.get(k).portfoy);
  const sermaye = Number(w.sermaye) > 0 ? Number(w.sermaye) : 10000;
  const sonuclar = [];
  const atlanan = [];
  let hatali = 0, adim = 0;
  const toplamAdim = w.kaynaklar.length * stratejiler.length;
  for (const k of w.kaynaklar) {
    const mumlar = aralik.oku(db.candleStore, k);
    if (mumlar.length < 300) { atlanan.push(`${k.sembol}: ${mumlar.length} mum`); adim += stratejiler.length; continue; }
    const bolme = Math.floor(mumlar.length * 0.7);
    for (const s of stratejiler) {
      adim++;
      ilet({ tur: 'ilerleme', oran: adim / toplamAdim * 0.98, asama: `${k.sembol} · ${s}` });
      try {
        const ayar = { ...((w.ayarlar && w.ayarlar[s]) || {}), marketType: 'spot' };
        const opt = optimizeParameters(B, s, ayar, mumlar.slice(0, bolme), sermaye, k.tf, { maxKombinasyon: 40 });
        const onek = Math.min(bolme, Math.max(30, isinmaBari(s, opt.bestConfig) || 100));
        const dis = B.run(s, opt.bestConfig, mumlar.slice(bolme - onek), sermaye, k.tf, { girisBasi: onek });
        if (!dis.totalTrades) continue;
        const kayit = catalog.get(s);
        const skor = +((dis.totalReturnPct * 15) + (dis.sharpeRatio * 8) + (dis.winRatePct * 0.3) + (Math.min(dis.profitFactor, 10) * 3) - (dis.maxDrawdownPct * 4)).toFixed(2);
        sonuclar.push({
          symbol: k.sembol, strategyKey: s, strategyName: (kayit && kayit.label) || s, timeframe: k.tf,
          config: opt.bestConfig,
          egitim: opt.bestMetrics ? { totalReturnPct: opt.bestMetrics.totalReturnPct, sharpeRatio: opt.bestMetrics.sharpeRatio, totalTrades: opt.bestMetrics.totalTrades } : null,
          metrics: { score: skor, totalReturnPct: dis.totalReturnPct, winRatePct: dis.winRatePct, sharpeRatio: dis.sharpeRatio, maxDrawdownPct: dis.maxDrawdownPct, totalTrades: dis.totalTrades, profitFactor: dis.profitFactor },
          testBas: B.parseSafeTimestamp(mumlar[bolme]), testBit: B.parseSafeTimestamp(mumlar[mumlar.length - 1])
        });
      } catch (e) { hatali++; }
    }
  }
  sonuclar.sort((a, b) => b.metrics.score - a.metrics.score);
  return {
    yontem: 'ilk %70 optimizasyon, sıralama son %30 (örneklem dışı)',
    scannedCount: w.kaynaklar.length, strategiesTested: stratejiler, opportunityCount: sonuclar.length,
    failedRuns: hatali, atlanan, top5Opportunities: sonuclar.slice(0, 5), tumu: sonuclar.slice(0, 50)
  };
}

try {
  const w = workerData;
  pineKaydet(w.pine);
  if (w.tur === 'tarama') {
    ilet({ tur: 'sonuc', sonuc: tara(w) });
    return;
  }
  ilet({ tur: 'ilerleme', oran: 0, asama: 'Mumlar okunuyor' });
  // `w.testMumlari`: YALNIZ testler (scripts/pine-backtest-testi.js) — depo yerine sabit sentetik seri.
  const mumlar = Array.isArray(w.testMumlari) ? w.testMumlari : aralik.oku(db.candleStore, w.kaynak);
  if (mumlar.length < 50) throw new Error(`Seçilen aralıkta yalnız ${mumlar.length} mum var — en az 50 gerekli. Önce veriyi indirin.`);

  const sermaye = Number(w.sermaye) > 0 ? Number(w.sermaye) : 10000;
  const tf = w.kaynak.tf;

  if (w.tur === 'tek') {
    ilet({ tur: 'ilerleme', oran: 0.02, asama: `${mumlar.length.toLocaleString('tr-TR')} mum simüle ediliyor` });
    const sonuc = B.run(w.strateji, w.ayar, mumlar, sermaye, tf, {
      trace: mumlar.length <= 200000,
      ilerleme: (o) => ilet({ tur: 'ilerleme', oran: 0.02 + o * 0.9, asama: 'Simülasyon' })
    });
    sonuc.symbol = w.kaynak.sembol;
    sonuc.timeframe = tf;
    sonuc.candleCount = mumlar.length;
    // HÜCUM / DENGE: grafikteki koşu botun yalnız BTC ayağıdır. Botun TAMAMI
    // (Kalkan kolu ×3, 15 coin) tek grafiğe çizilemez → araştırma simülasyonundan
    // aynı tarih aralığı (ısınma sonrası) ayrı alan olarak eklenir.
    if (w.strateji === 'hucum' || w.strateji === 'denge') {
      try {
        const BD = require('../research/bindirme');
        if (!BD.veriVarMi()) sonuc.bindirmeEk = { hata: 'Botun tamamı ölçülemedi: data/market.db ve kol önbelleği (data/arastirma/capraz-marj-onbellek.json) gerekli.' };
        else {
          ilet({ tur: 'ilerleme', oran: 0.93, asama: 'Botun tamamı (kol ×3) ölçülüyor' });
          const pay = Number.isFinite(+(w.ayar || {}).btcPayPct) ? +(w.ayar || {}).btcPayPct / 100 : BD.STRATEJILER[w.strateji].btcPay;
          const isinma = (sonuc.warmup && sonuc.warmup.bars) || 0;
          const zaman = (m) => (typeof m.time === 'number' ? m.time : Date.parse(m.time));
          const bas = zaman(mumlar[Math.min(isinma, mumlar.length - 1)]), bit = zaman(mumlar[mumlar.length - 1]);
          sonuc.bindirmeEk = { strateji: w.strateji, ad: BD.STRATEJILER[w.strateji].ad, ...BD.bindirmeAralik({ btcPay: pay, bas, bit }) };
          // Isınma seçilen aralığın içinden yenir: kısa aralıkta ölçülen dönem kısalır, CAGR o kısa dönemden yıllıklanır.
          const k = sonuc.bindirmeEk.kapsam, gunSay = Math.round((bit - bas) / 864e5) + 1;
          if (k && isinma > 0 && gunSay < 2 * 365) (k.not = k.not || []).unshift(`Seçilen aralığın ilk ${isinma} mumu ısınma (göstergeler doluyor); ölçülen dönem yalnız ${gunSay} gün (başlangıç ${new Date(bas).toISOString().slice(0, 10)}). Kısa dönemde CAGR yıllığa çevrildiği için abartılı görünebilir — anlamlı ölçüm için en az 3 yıl seçin.`);
        }
      } catch (e) { sonuc.bindirmeEk = { hata: `Botun tamamı ölçülemedi: ${e.message}` }; }
    }
    const tumIslemler = sonuc.trades;
    ilet({ tur: 'ilerleme', oran: 0.95, asama: 'Rapor hazırlanıyor' });
    rapor.hazirla(sonuc, mumlar, { ...w.baglam, timeframe: tf });
    ilet({ tur: 'sonuc', sonuc, tumIslemler: sonuc.islemlerKirpildi ? tumIslemler : null });
  } else if (w.tur === 'optimize') {
    ilet({ tur: 'ilerleme', oran: 0.02, asama: 'Parametre ızgarası taranıyor' });
    const sonuc = B.optimizeParameters(w.strateji, w.ayar, mumlar, sermaye, tf);
    ilet({ tur: 'sonuc', sonuc });
  } else if (w.tur === 'walkforward') {
    ilet({ tur: 'ilerleme', oran: 0.02, asama: 'Walk-forward katları koşuluyor' });
    const sonuc = B.runWalkForward(w.strateji, w.ayar, mumlar, sermaye, tf, w.secenek || {});
    ilet({ tur: 'sonuc', sonuc });
  } else {
    throw new Error(`Bilinmeyen iş türü: ${w.tur}`);
  }
} catch (e) {
  ilet({ tur: 'hata', mesaj: e.message });
}
