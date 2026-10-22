const DcaBotStrategy = require('./dcaBotStrategy');
const VpfrRangeStrategy = require('./vpfrRangeStrategy');
const MtfChochRangeStrategy = require('./mtfChochRangeStrategy');
const RangeMeanReversionStrategy = require('./rangeMeanReversionStrategy');
const RegimeTrendStrategy = require('./regimeTrendStrategy');
const SigmoidBbStrategy = require('./sigmoidBbStrategy');
const StructureOteStrategy = require('./structureOteStrategy');
const GridDcaStrategy = require('./gridDcaStrategy');
const DonchianTrendStrategy = require('./donchianTrendStrategy');

/**
 * Strateji kataloğu — tek doğruluk kaynağı.
 *
 * NEDEN VAR: strateji listesi altı ayrı yerde elle tutuluyordu (engine'de İKİ
 * ayrı if-zinciri, backtester'da switch, server'da `KNOWN_STRATEGIES`, panelde
 * üç ayrı `<select>`) ve hepsi birbirinden farklıydı. Somut sonuç:
 * `regime_trend` motorda ve backtester'da tanımlıydı ama `KNOWN_STRATEGIES`'te
 * olmadığı için `/api/bots/run` "Bilinmeyen strateji" diyordu ve panelde hiç
 * görünmüyordu — yazılmış ama çalıştırılamayan bir strateji.
 *
 * ARŞİV KLASÖRÜ SİLİNDİ (2026-08-14). Eski 7 strateji (rsi_macd, grid, dca,
 * smc_dca, breakout_atr, bj_bot, tss_strat) `lib/strategies/_arsiv/` altında
 * duruyordu; hiçbirinin brüt edge'i pozitif değildi ve ölçüm sonuçlarının
 * tamamı CLAUDE.md'de yazılı. Kod, vadeli işlem altyapısına geçiş temizliğinde
 * silindi. Geri getirmek gerekirse: `trade-bot-yedek/` altındaki
 * `trade-bot-v55-arsivleme-oncesi-*.zip` anlık görüntüsü.
 *
 * NOT: aşağıdaki `dca_bot` o silinen `dca` DEĞİLDİR. Eskisi elde yazılmış,
 * ölçülmüş ve edge'i negatif çıkmış bir kademeli alımdı; bu ise 3commas
 * betiğinin uyarlaması ve motorun EMİR DEFTERİ üzerine kurulu. Ortak yanları
 * yalnızca adları.
 *
 * SPOT DÖNEMİ KAPANDI: `structure_ote` ve `regime_trend` de arşiv işaretli.
 * Yeni bot vadeli (perpetual) için sıfırdan yazılacak — yol haritası
 * `PLAN-VADELI.md`. Arşiv işareti stratejiyi çalışmaz yapmaz: panelde "Arşiv"
 * grubunda listelenir, backtest ve tarama kapsamaya devam eder. `structure_ote`
 * özellikle KIYAS ÖLÇÜTÜ olarak duruyor — yeni botun "daha iyi mi" sorusunun
 * ölçülmüş bir cevabı olsun diye (spot 1d, 8 varlığın 6'sında pozitif).
 */
/**
 * ZAMAN DİLİMİ (B-25, panel 61.1): kuralı gün cinsinden yazılmış stratejiler yalnız günlük mumla
 * anlamlıdır. `izinli` dışı seçimde backtest ekranı uyarır, strateji seçilince `varsayilan`a çeker.
 * Alanı olmayan strateji her zaman diliminde koşabilir.
 */
const GUNLUK = Object.freeze({ varsayilan: '1d', izinli: Object.freeze(['1d']) });

const CATALOG = [
  {
    key: 'range_mr',
    label: 'Range İçi Ortalamaya Dönüş',
    Class: RangeMeanReversionStrategy,
    archived: true,
    note: 'Range yapısının sapma bölgesinden içeri dönüşte karşı tarafı hedefleyen işlem. Stop sapma sınırında, EQ\'da kısmi kâr + breakeven, hedef karşı iç sınır. Yalnızca kilitli range\'lerde; yapı ölünce pozisyon kapanır. Kill kriteri INŞADAN ÖNCE yazıldı (PLAN-RANGE-BOT.md).'
  },
  {
    key: 'mtf_choch_range',
    label: 'MTF CHoCH Range',
    Class: MtfChochRangeStrategy,
    archived: true,
    note: 'Range\'in İKİ SINIRI DA yapıdan, sırayla gelir: düşüşte önce L (boğa CHoCH), sonra onu izleyen yükselişi bitiren ayı CHoCH ile H. HTF salınımı yalnızca bağlamdır, sınır değildir. Bot ONAY (LTF) diliminde çalışır; HTF `htfCarpan` ile bu seriden toplanır (4H bot + 6 = 1D yapı). Yapı tespiti LuxAlgo fraktal + CHoCH/BOS uyarlaması (CC BY-NC-SA 4.0). Pine ikizi: `pine/mtf-choch-range-strateji.pine` — kural değişirse İKİSİ BİRDEN değişmeli. HENÜZ KILL KRİTERİNE SOKULMADI.'
  },
  {
    /**
     * KATALOG SIRASI ÖNEMLİ: `defaultKey()` ilk AKTİF kaydı döndürür ve motor
     * bilinmeyen anahtarda oraya düşer. Bu yüzden yeni ve HENÜZ ONAYLANMAMIŞ
     * bir strateji listenin başına konmaz — konursa varsayılan sessizce değişir.
     */
    key: 'vpfr_range',
    label: 'VPFR Range (üç teyitli)',
    Class: VpfrRangeStrategy,
    archived: true,
    note: 'Range ÜÇ bağımsız teyitle kurulur: yeterince büyük ve doğru uca çapalanmış LTF düzeltme bacağı (yapı), VPFR POC\'unun EQ\'ya yakınsaması (hacim), bacak başına çapalı AVWAP\'ın EQ civarında seyri (kilit). Sonra sapma olayı işlem açtırır — kilit ≠ ilk işlem. Motor AYRI MODÜL ve işlem bilmez: `lib/rangeEngine/vpfrRange.js` (v2\'nin grid stratejisi aynı motoru kullanacak). Tarif ve kararların tamamı `PLAN-RANGE-VPFR.md`. Pine ikizi: `pine/vpfr-range-strateji.pine` — kural değişirse İKİSİ BİRDEN değişmeli. ⚠ KILL KRİTERİ ÜÇ KOŞUDA DA GEÇİLEMEDİ: spot 3/6 (§11.9) · vadeli 3/6 · pencere hizalı spot kontrol 3/6 (§11.18). FVG hattı üç ayrı rolde denenip kapandı (§11.10 · §11.16 · §11.17); adında artık FVG geçmiyor.'
  },
  {
    key: 'dca_bot',
    label: 'DCA Botu (3commas tarzı)',
    Class: DcaBotStrategy,
    archived: false,
    note: 'Kaynak: "Backtesting 3commas DCA Bot v2" (© rouxam, MPL 2.0). Bir kerede 1 baz + N güvenlik emri masaya konur (motorun emir defteri), doldukça ortalama alınarak eklenir; çıkış TP / trailing TP / SL. Giriş koşulu: hemen başla, RSI-7 ya da TV presets. YERLİ uyarlama — Pine çeviricisinden geçirilmedi, sebebi dosyanın başlığında. TV presets puanı TradingView çıktısıyla KARŞILAŞTIRILMADI.'
  },
  {
    key: 'structure_ote',
    label: 'Yapı Kapılı OTE',
    Class: StructureOteStrategy,
    // ARŞİV — ama KIYAS ÖLÇÜTÜ olarak. Spot 1d'de kill kriterini geçen tek
    // strateji (8 varlığın 6'sında pozitif beklenti). Short tarafı ayrıca
    // ölçüldü ve kaldı (2/8). Yeni vadeli bot bununla kıyaslanacak.
    archived: true,
    note: 'ARŞİV / KIYAS ÖLÇÜTÜ — spot 1d\'de kill kriterini geçen tek strateji (6/8 varlık pozitif, BTC +2.94 beklenti / 101 işlem). Short tarafı ölçüldü ve kaldı (2/8): mekanik simetrik, koşucu short tarafta koşamıyor. Spot dönemi kapandı; yeni bot vadeli için yazılacak.'
  },
  {
    key: 'sigmoid_bb',
    label: 'Sigmoid TS + Bollinger (Kademeli Çıkış)',
    Class: SigmoidBbStrategy,
    // ARŞİV: dört zaman diliminde 2300+ kombinasyon, 6 katlı walk-forward ve
    // 7 varlıkta çapraz sınama yapıldı. Genelleşen bir parametre seti yok.
    // En iyi bulunan (1d perpetual, pullback ATR200 x1 amp2 sd2.5 sig40) yedi
    // varlıkta pozitif ama short beklentisi örneklemi yeterli iki varlıkta
    // negatif (BTC −%5.12, ETH −%9.24) ve BTC/ETH'de al-tut'un çok gerisinde.
    // Silinmedi: sermaye koruma profili (maks DD %2–25) ileride işe yarayabilir.
    archived: true,
    note: 'ARŞİV — ölçüldü, genelleşen parametre bulunamadı. Sermaye koruma profili güçlü (düşen altcoinlerde maks DD %2–7), getiri profili zayıf. Ayrıntılı ölçümler CLAUDE.md\'de.'
  },
  {
    key: 'regime_trend',
    label: 'Rejim Kapılı Trend Devamı',
    Class: RegimeTrendStrategy,
    // ARŞİV: kill kriterinden geçmedi (10 işlem / −%1.15), örneklem de ince.
    archived: true,
    note: 'ARŞİV — kill kriterinden geçmedi (10 işlem, −%1.15). Maliyet kapısı + rejim kapısı + çok barlı teyit + kısmi kâr alma; tasarım fikirleri yeni bota taşınabilir.'
  },
  {
    /**
     * SONA KONDU, BAŞA DEĞİL: `defaultKey()` ilk AKTİF kaydı döndürür.
     * Başa konsaydı motorun varsayılan stratejisi, henüz hiç ölçülmemiş bir
     * botla sessizce değişirdi (yukarıdaki `vpfr_range` notunun aynısı).
     */
    key: 'grid_dca',
    label: 'Grid + DCA (birleşik)',
    Class: GridDcaStrategy,
    archived: true,
    note: 'F6 — `PLAN-GRID-DCA.md` §3\'ün beş katmanını birleştirir: MTF (F1) · referans hattı (F2) · yapı bağlamı (F3) · merdiven planlayıcı (F4) · hedge defteri (F5). Kendisi hiçbir gösterge türetmez; testi bunu toleranssız `===` ile kanıtlıyor. Kullanıcı kuralları (2026-09-08): taraf başına KADEME TAVANI · alım tabanı ve stop YAPIDAN (son onaylı salınım ± ATR tamponu) · kâr alma ATR bazlı · stop KADEME KADEME (her lot kendi girişinden aynı oranda uzaklaşınca kapanır, motorun M8 kısmi çıkış yolu) · DALGA expansion\'ı net yönü kaydırır (sert kapı değil, kademe tavanı kayması). Merkez K2: varsayılan VWAP (kullanıcı, 2026-09-08). Kayma varsayılanı `yenidenKur` — kayan grid; `yerinde` KONTROL grubudur. ⚠ KILL KRİTERİNDEN KALDI (2026-09-08): 15 varlık × 2 dilim, vadeli 1x, 4147 deal → 0/6 kat, 3/30 varlık, havuz −0.71 %/deal, long ve short AYRI AYRI negatif. Tek geçen şart "ayrışma" (düşüşte al-tut\'u geçme) ve o şart market-nötr bir bot için neredeyse bedava. Teşhis adayı: yön hatası değil MALİYET imzası (long/short simetrik kayıp, varlıklar arası tekdüze) — maliyet sıfırlanmış kontrol koşusuyla doğrulanmalı. Ayrıntı `PLAN-GRID-DCA.md` §6.2. Pine ikizi: `pine/grid-dca-strateji.pine` — kural değişirse İKİSİ BİRDEN değişmeli (katı denetimde). ⚠ TradingView tek betikte iki yön taşıyamaz: ikiz TEK BACAKLIDIR, grafiğe long ve short olarak İKİ KEZ eklenir.'
  },
  {
    // Sona: varsayılan stratejiyi (`defaultKey`) değiştirmesin.
    key: 'donchian_trend', zamanDilimi: GUNLUK,
    label: 'Donchian Trend Topluluğu (günlük)',
    Class: DonchianTrendStrategy,
    archived: false,
    note: 'Zarattini, Pagani & Barbon (2025). 9 alt model (N = 5…360 gün): kapanış önceki N günün en yükseğini geçince giriş, (N günün en yüksek + en düşük kapanışı)/2 izleyen stop. Maruziyet = açık alt model oranı × (%25 vol hedefi / 30 günlük vol), en çok 2x. Yalnız long. 1d zaman diliminde kullanın — N gün cinsinden. Araştırma sekmesinde kill kriterleri: BTC tek BEKLET, 15 varlık portföyü GEÇTİ. Kural sahibi `donchianEnsemble.js`; canlı bot (Borsa sekmesi) aynı fonksiyonu kullanır.'
  },
  /**
   * KİTAP STRATEJİLERİ (2026-10-06) — `lib/strategies/kitap/`, plan ve kill
   * kriteri `PLAN-KITAP-STRATEJI.md`. Kurallar kitaptan aynen; kitapta
   * olmayan her şey dosya başında "bizim varsayımımız" diye yazılı.
   */
  {
    key: 'clenow_karsi_trend', zamanDilimi: GUNLUK,
    label: 'Clenow Karşı Trend (kitap, günlük)',
    Class: require('./kitap/clenowKarsiTrend'),
    archived: false,
    note: 'Clenow, Trading Evolved Böl. 17. EMA40 > EMA80 iken kapanış son 20 günün tepesinden 3σ(Δfiyat, 40g) aşağıdaysa al; EMA40 < EMA80 ya da 20 gün dolunca çık. Stop yok. Vol-parite boyut (portföy × 0,0015 / std). Yalnız long. 1d.'
  },
  {
    key: 'clenow_zaman_getirisi', zamanDilimi: GUNLUK,
    label: 'Clenow Zaman Getirisi / TSMOM (kitap, günlük)',
    Class: require('./kitap/clenowZamanGetirisi'),
    archived: true,
    note: 'Clenow, Trading Evolved Böl. 16. Ay başında kapanış hem 250 hem 125 gün öncesinden yüksekse long, ikisinden de düşükse short (yalnız vadeli), değilse pozisyon yok. Stop yok. Vol-parite boyut (std 60g). 1d.'
  },
  {
    key: 'connors_rsi_guc', zamanDilimi: GUNLUK,
    label: 'Connors RSI Power Zones (kitap, günlük)',
    Class: require('./kitap/connorsRsiGuc'),
    archived: false,
    note: 'Connors, Buy the Fear Böl. 2. SMA200 üstünde RSI(4) < 30 → 1 birim; açıkken RSI(4) < 25 → 2. birim; RSI(4) > 55 → sat. Stop yok. Birim boyutu kitapta yok (bizim: %47,5 + kalan). Yalnız long. 1d.'
  },
  {
    key: 'connors_crash', zamanDilimi: GUNLUK,
    label: 'Connors CRASH short (kitap, günlük, vadeli)',
    Class: require('./kitap/connorsCrash'),
    archived: true,
    note: 'Connors, Buy the Fear Böl. 3. HV100 ≥ %100 ve ConnorsRSI ≥ 90 → ertesi gün kapanışın %3 üstüne limit SHORT; CRSI < 30 → kapat. Stop yok. Yalnız vadeli (spotta işlem yok). Boyut kitapta yok (bizim: nakdin %20). 1d.'
  },
  // TUR 3 — PLAN-KITAP-STRATEJI.md (ikinci tur kitap adayları).
  { key: 'pruitt_yuzde_b', zamanDilimi: GUNLUK, label: 'Pruitt %B ortalamaya dönüş (kitap, günlük)', Class: require('./kitap/tur3').PruittYuzdeB, archived: true,
    note: 'Pruitt, Algo Toolbox Kutu 3.4. Close>MA200 ve MA3(%B(5,2)) < 0,25 → long; close<MA200 ve > 0,75 → short (vadeli). %B > 0,75 / < 0,25 çık. Stop 3×ATR(20) (kitap: $2.000). 1d.' },
  { key: 'kestner_iraksama', zamanDilimi: GUNLUK, label: 'Kestner Iraksama Endeksi (kitap, günlük)', Class: require('./kitap/tur3').KestnerIraksama, archived: true,
    note: 'Kestner, Quantitative Trading Strategies Böl. 8. DI = mom10×mom40/σ40²; DI < −10 ve mom40>0 → long, mom40<0 → short; ters sinyalde çık. Vol-parite. 1d.' },
  { key: 'chande_cbpb', zamanDilimi: GUNLUK, label: 'Chande kırılım + geri çekilme (kitap, günlük)', Class: require('./kitap/tur3').ChandeCbPb, archived: true,
    note: 'Chande, Beyond Technical Analysis Böl. 4. Son 7 günde 20g zirve ve bugünün low u 5g dibin altında → al; 50 gün ya da 40g düşük kırılınca çık. İlk stop 3 × ort. aralık(10). Yalnız long. 1d.' },
  { key: 'carver_carpiklik', zamanDilimi: GUNLUK, label: 'Carver çarpıklık / skew (kitap, günlük)', Class: require('./kitap/tur3').CarverCarpiklik, archived: true,
    note: 'Carver, Advanced Futures Trading Strategies Strateji 24. Tahmin = −çarpıklık(60g), EWMA 15, ×33,3, |F|≤20; maruziyet = F/10 × %25 vol hedefi / σ30, tavan 2x. Long + short (vadeli). 1d.' },
  // PLAN-SEVIYE-KOMBO.md — ölçülene kadar arşivde (aday).
  { key: 'dca_seviye', label: 'DCA + VWAP/POC giriş filtresi', Class: require('./dcaSeviye'), archived: false,
    note: 'dca_bot aynen; yalnız YENİ deal başlatma koşulu önceki günün VWAP/POC seviyesiyle filtrelenir (indirim: VWAP altında · temas: POC/VWAP desteği tuttu). PLAN-SEVIYE-KOMBO.md: TEMAS kriteri geçti (puan 57→66, holdout Sharpe 0,58→0,64) ama küçük ve işlem 8’de 1; varsayılan filtre bu yüzden TEMAS olmalı.' },
  /**
   * HÜCUM / DENGE (PLAN-ALTUT-YENMEK.md 8.–10b.) — portföy botlarının BTC AYAĞI.
   * `portfoy: true`: botun tamamı (Kalkan kolu ×3, 15 coin) motorun tek sembollü
   * bot akışına sığmaz — Canlı İzleme'nin "Bot başlat" listesinde yoktur, kâğıt
   * bot "Portföy botları" alanından yönetilir (lib/live/bindirmeBot.js).
   * Backtest sonucu ayrıca botun tamamının ölçümünü gösterir (lib/research/bindirme.js).
   */
  { key: 'hucum', zamanDilimi: GUNLUK, label: 'Kairos — BTC trend (O-GC) · %100', Class: require('./bindirmeStrategy').Hucum, archived: false, portfoy: true,
    note: 'Trendde %100 BTC teminat + Kalkan kolu ×3 — getiri öncelikli. Bu strateji botun BTC AYAĞIDIR (tek grafik): LONG AÇ = kapanış > SMA100 VE SMA50 > SMA200 (pozisyon yokken); LONG KAPAT = kapanış < SMA100. Yalnız long, yalnız GÜNLÜK (1d) BTC/USDT. Botun tamamı (kol dahil) backtest sonucunda ayrı kutuda. Pine ikizi: masaüstü "Hucum BTC ayagi - TradingView Pine.txt".' },
  { key: 'denge', zamanDilimi: GUNLUK, label: 'Tao — BTC trend (O-GC) · %50', Class: require('./bindirmeStrategy').Denge, archived: false, portfoy: true,
    note: 'Trendde %50 BTC + Kalkan kolu ×3 — gün içi risk daha düşük. Bu strateji botun BTC AYAĞIDIR: Kairos ile aynı kural, rejim açıkken nakdin %50 kadarı BTC. Yalnız günlük (1d). Botun tamamı backtest sonucunda ayrı kutuda.' }
];

const byKey = new Map(CATALOG.map(s => [s.key, s]));

/**
 * ÇALIŞMA ZAMANINDA STRATEJİ KAYDI — Pine içe aktarma için.
 *
 * Doğrudan `CATALOG.push(...)` YETMEZ: arama `byKey` haritası üzerinden
 * yapılır ve harita modül yüklenirken bir kez kurulur. Diziye eklenip
 * haritaya eklenmeyen bir strateji listede görünür ama `create()` "bilinmeyen
 * strateji" der — kataloğun var oluş sebebi olan hatanın aynısı, bu kez
 * kaynağın kendi içinde. Bu yüzden ekleme ve silme TEK kapıdan yapılır.
 */
function kaydet(kayit) {
  if (!kayit || !kayit.key || !kayit.Class) throw new Error('Katalog kaydı `key` ve `Class` gerektirir');
  const mevcut = byKey.get(kayit.key);
  if (mevcut) {
    // Güncelleme: aynı anahtar yeniden derlendiğinde yerine geçer.
    Object.assign(mevcut, kayit);
    return mevcut;
  }
  const yeni = { archived: false, note: null, ...kayit };
  CATALOG.push(yeni);
  byKey.set(yeni.key, yeni);
  return yeni;
}

function sil(key) {
  const i = CATALOG.findIndex(s => s.key === key);
  if (i < 0) return false;
  CATALOG.splice(i, 1);
  byKey.delete(key);
  return true;
}

const get = (key) => byKey.get(key) || null;
const has = (key) => byKey.has(key);
const keys = () => CATALOG.map(s => s.key);
const activeKeys = () => CATALOG.filter(s => !s.archived).map(s => s.key);
const archivedKeys = () => CATALOG.filter(s => s.archived).map(s => s.key);

/**
 * AYNI ADLI KAYITLAR (B-27): iki Pine betiği aynı `strategy("…")` başlığını taşıyınca listede
 * ayırt edilemiyordu. Aynı etiketi taşıyan ikinci ve sonraki kayıtlara anahtar (+ içe aktarma günü) eklenir.
 */
function etiketAyirt(key, label) {
  const ayni = CATALOG.filter(s => s.label === label);
  if (ayni.length < 2) return label;
  const k = ayni.find(s => s.key === key) || {};
  return `${label} (${key}${k.iceAktarma ? ` · içe aktarma ${k.iceAktarma}` : ''})`;
}

/**
 * Panel ve API için: sınıf referansı olmadan katalog özeti.
 *
 * `params` stratejinin kendi bildirimidir (`static paramSchema`) — panel
 * formu bundan üretilir. Bildirmeyen strateji için boş döner ve arayüz
 * "ayarlanabilir parametre yok" der; elle HTML yazılmaz.
 */
const describe = () => CATALOG.map(({ key, label, archived, note, Class, portfoy, pine, zamanDilimi, iceAktarma }) => ({
  key,
  label: etiketAyirt(key, label),
  // B-25: { varsayilan, izinli } ya da null (her zaman dilimi)
  zamanDilimi: zamanDilimi ? { varsayilan: zamanDilimi.varsayilan, izinli: [...zamanDilimi.izinli] } : null,
  iceAktarma: iceAktarma || null,
  archived: archived === true,
  portfoy: portfoy === true,
  // İçe aktarılan Pine betiği (panel: "Pine" rozeti, "Betiği düzenle" bağlantısı — Pusula P4).
  pine: pine === true,
  note: note || null,
  params: (Class && Class.paramSchema) || {},
  optimizable: !!(Class && Class.optimizeGrid)
}));

/**
 * Strateji örneği üretir. Bilinmeyen anahtarda SESSİZCE varsayılana düşmez —
 * eski `initStrategy` bunu yapıyordu ve yazım hatası olan bir anahtar, farkına
 * varılmadan RSI+MACD ile işlem açılmasına yol açabilirdi.
 */
function create(key, config = {}) {
  const entry = byKey.get(key);
  if (!entry) throw new Error(`Bilinmeyen strateji tipi: ${key}`);
  return new entry.Class(config);
}

/** Motorun geri düşeceği strateji: katalogdaki ilk aktif kayıt. */
const defaultKey = () => (activeKeys()[0] || keys()[0] || null);

module.exports = { CATALOG, get, has, keys, activeKeys, archivedKeys, describe, create, defaultKey, kaydet, sil };
