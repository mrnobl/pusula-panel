const pool = require('../indicatorPool');
const mtf = require('../mtf');

/**
 * VPFR + AVWAP RANGE MOTORU — üç teyitli range durum makinesi.
 *
 * Tarif: `PLAN-RANGE-VPFR.md` §4. Kararlar §0.1 karar günlüğünde.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BU MODÜL İŞLEM BİLMEZ — mimari kural, §3.1
 * ─────────────────────────────────────────────────────────────────────────
 * Pozisyon, SL, TP, kaldıraç bu dosyanın sözlüğünde YOKTUR. Girdi mumlar,
 * çıktı range nesneleri ve kurulum olaylarıdır. Sebebi ölçülmüş bir sorun:
 * `mtf_choch_range`'de motor ile işlem mantığı aynı dosyadaydı ve her ölçümde
 * "yapı mı bozuk işlem mi" sorusu yeniden soruldu. Ayrıca v2'nin grid
 * stratejisi bu motoru olduğu gibi kullanacak (§3.1); işlem mantığı içeri
 * sızarsa iki strateji aynı yapıları göremez.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DURUM MAKİNESİ
 * ─────────────────────────────────────────────────────────────────────────
 *   YOK → ADAY → NİTELİKLİ → KİLİTLİ → SİLAHLI
 *                                ↑        │
 *                                └─ GENİŞLEME ─→ GEÇERSİZ
 *
 *   ADAY       LTF'de onaylanmış, doğru uca çapalanmış itki bacağı
 *   NİTELİKLİ  VPFR POC'u EQ'nun `pocEqTolerans × R` bandına girdi
 *   KİLİTLİ    AVWAP teyidi geçti → SINIRLAR DONDU (işlem henüz yok)
 *   SİLAHLI    sapma olayı gerçekleşti → kurulum üretildi
 *
 * Kilit ≠ ilk işlem (kullanıcı kararı 2026-08-30): AVWAP teyidi sınırları
 * dondurur, sapma olayı tetiktir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * İLERİYE BAKMA — nasıl önleniyor
 * ─────────────────────────────────────────────────────────────────────────
 * Göstergeler tam seri üzerinde BİR KEZ hesaplanır, ama sorgulama daima
 * doğum/ölüm indeksiyle süzülür: bir bölge `i` barında ancak
 * `dogum <= i && (olum === null || olum > i)` ise aktiftir. Bu, o barda
 * kesilmiş seriyle hesaplamakla aynı cevabı verir — havuzun bölge çıktıları
 * bu sözleşmeye uyar (`lib/indicatorPool/lookaheadtest.js`, 44/44).
 *
 * VPFR ve AVWAP pencereye bağlı olduğu için tam seriden okunamaz; onlar her
 * barda `candles.slice(bas, i+1)` ile YENİDEN hesaplanır. Dilim `i`de bitiyor,
 * yani ileri bar zaten yok.
 *
 * HTF olayları, o HTF mumunun KAPANDIĞI LTF barından itibaren görünür
 * (`htfTopla` son, kapanmamış kovayı bilerek dışarıda bırakır).
 */

const DURUM = {
  YOK: 'yok',
  ADAY: 'aday',
  NITELIKLI: 'nitelikli',
  KILITLI: 'kilitli',
  SILAHLI: 'silahli',
  GENISLEME: 'genisleme'
};

/** Ölüm sebepleri — telemetride ayrı ayrı sayılır, toplanmaz. */
const OLUM = {
  ADAY_ZAMAN: 'adayZamanAsimi',
  ADAY_IHLAL: 'adayIhlal',
  NITELIKLI_ZAMAN: 'nitelikliZamanAsimi',
  CAPA_KIRILDI: 'capaKirildi',
  GENISLIK_TAVANI: 'genislikTavani',
  GENISLEME_DONUS_YOK: 'genislemeDonusYok',
  GENISLEME_HAKKI: 'genislemeHakkiBitti',
  /** Başka bir aday önce kilitlendi; bu aday aynı bölge için rakip hipotezdi. */
  YARIS_KAYBI: 'yarisKaybi',
  SERI_BITTI: 'seriBitti'
};

function cfg(c = {}) {
  const say = (v, d) => (v === undefined || v === null || !Number.isFinite(+v) ? d : +v);
  return {
    // ── Yapı ──
    htfCarpan: Math.max(2, Math.round(say(c.htfCarpan, 6))),
    // `zzEsik` KALDIRILDI: swing artık fraktaldir (bkz. fraktalOlaylar).
    /**
     * Fraktal yarı-penceresi.
     *
     * SEÇİLDİ: 10 (kullanıcı, 2026-08-31, GRAFİKTE GÖZLE — §11.8).
     * Gerekçesi: "15 bazı fraktalları atladı, 5 gürültülü yapıları kabul etti."
     *
     * ⚠ Bu değer ÖLÇÜLEREK seçilmedi. Etiket sınavı (§11.6) 4h'te fLen 5–20
     * arasını AYIRT EDEMEDİ (üç etiket de hepsinde birebir aynı sonucu verdi);
     * elediği tek değer 3'tü. Yani 10, sınavın kayıtsız kaldığı aralığın
     * içinde — ölçümle ÇELİŞMİYOR ama ölçüm tarafından SEÇİLMİŞ de değil.
     */
    fraktalLen: Math.max(1, Math.round(say(c.fraktalLen, 10))),
    /**
     * Aynı anda kaç ADAY/NİTELİKLİ yapı izlenir.
     *
     * "Her swing'de range aramalıyız" kuralının (kullanıcı, 2026-08-30) somut
     * bedeli budur: her aday, her barda kendi VPFR penceresini hesaplatır.
     * Tavan olmazsa maliyet bar sayısıyla değil, bar × aday ile büyür.
     * En ESKİ aday atılır — en yenisi en taze yapıdır.
     */
    maxAday: Math.max(1, Math.round(say(c.maxAday, 20))),
    atrPeriyot: say(c.atrPeriyot, 14),
    bacakEnAzAtr: say(c.bacakEnAzAtr, 2.5),

    /**
     * ÇAPA YÖNÜ — range hangi uca çapalanır (kullanıcı kuralı, 2026-08-31).
     *
     * Kullanıcının ifadesi: "fiyat yukarı doğru giderken range ilk fraktalı
     * en yüksek fiyat olmalı, aşağı giderken de en düşük fiyat."
     *
     * Yani range, kendinden önceki hareketin UCUNA çapalanır ve o harekete
     * KARŞI açılır: range impulse'un ÜSTÜNE değil, impulse bittikten sonra
     * DÜZELTMENİN üstüne kurulur.
     *
     *   'yapi'         ÇAPA HH YA DA LL OLMALI (VARSAYILAN, kullanıcı kuralı)
     *   'yok'          kısıt yok — eski davranış, yalnızca kıyas için
     *   'htf'          HTF yönü: yükselişse çapa `high`, düşüşse `low`
     *
     * ─────────────────────────────────────────────────────────────────────
     * 'yapi' NEDEN DOĞRU KURAL
     * ─────────────────────────────────────────────────────────────────────
     * Kullanıcının ifadesi (2026-08-31, ekran görüntüsü "yanlış range"):
     * "ara düşüş fraktalını dip yaptık ama aslında ana fraktal HH seviyesi,
     * biz HL seviyesini aldık."
     *
     * Yani çapa ANA fraktal olmalı: yükselişte trendi uzatan TEPE (HH),
     * düşüşte trendi uzatan DİP (LL). Ara salınım uçları (HL / LH) çapa
     * OLAMAZ — onlar düzeltmenin içindeki gürültüdür.
     *
     * ⚠ ELENEN KOL — 'oncekiBacak' + `impulsKat` (2026-09-01'de SİLİNDİ):
     * "bacak öncekinden büyükse impulse" boyut kıyasıydı ve tam bu vakada
     * kaldı: 26 Kas 2024'teki 90.791 dibi süzgeci GEÇİP çapa oldu, oysa o
     * bir HL'di. Boyut, yapının yerini tutmuyor.
     */
    capaYonu: ['yok', 'yapi', 'htf'].includes(c.capaYonu) ? c.capaYonu : 'yapi',

    /* ── HTF FVG YAKINLIK ŞARTI — 2026-09-01'de TAMAMEN SİLİNDİ ──────────
     * Silinen anahtarlar: `fvgSarti` · `fvgYakinlikAtr` · `fvgParams`, ve
     * range kaydındaki `fvgMesafeAtr` / `htfFvgYon` telemetrisi.
     *
     * FVG bu depoda ÜÇ ayrı rolde denendi, üçünde de boş çıktı:
     *   §11.10  range'i kuran şart → kaldırıldı. Şart açıkken itki
     *           bacaklarının %85'i YALNIZCA o kapıda ölüyordu, ama kapatınca
     *           range 17→22 oldu: asıl darboğaz FVG değilmiş.
     *   §11.16  deviasyon bölgesine denk gelme SIKLIĞI → 6 ölçümün 6'sında
     *           şans tabanına göre fark yok.
     *   §11.17  sınır aşıldığında duruş noktasını AÇIKLAMA → 1.04× / 0.99×.
     *           Yakınlık gradyanı da yok: 1R ötedeki FVG, sınıra yapışık
     *           olan kadar "işe yarıyor" — yani mekanizma değil yanlılık.
     *
     * Ölçüm betikleri KORUNDU (`scripts/fvg-deviasyon-gozlem.js`,
     * `scripts/fvg-sinir-davranis.js`); bulgu geri sınanmak istenirse orada.
     * ────────────────────────────────────────────────────────────────── */

    // ── Teyitler ──
    pocEqTolerans: say(c.pocEqTolerans, 1 / 3),
    vpfrBins: say(c.vpfrBins, 50),
    avwapTolerans: say(c.avwapTolerans, 0.15),
    avwapTeyitBar: Math.max(1, Math.round(say(c.avwapTeyitBar, 10))),
    avwapTeyitOran: say(c.avwapTeyitOran, 0.70),

    // ── Seviyeler ──
    eqSeviye: say(c.eqSeviye, 0.5),
    devKat: say(c.devKat, 0.377),

    // ── Sapma olayı ──
    sapmaDonusBar: Math.max(1, Math.round(say(c.sapmaDonusBar, 5))),

    /**
     * SAPMA OLAYI TETİĞİ — hangi hareket "sapma" sayılır.
     *
     *   'kapanis' range sınırının ÖTESİNDE kapanış yeter (VARSAYILAN)
     *   'banda'   sapma bandına DEĞMELİ (fitil yeter)
     *   'fitil'   sınırı fitille delmek yeter
     *
     * ─────────────────────────────────────────────────────────────────────
     * VARSAYILAN 'banda' İDİ, ÖLÇÜMLE 'kapanis'e ALINDI (2026-08-30)
     * ─────────────────────────────────────────────────────────────────────
     * 'banda' kullanıcının ilk kararıydı ve gerekçesi ÇÜRÜTÜLMEDİ: SL sapma
     * bandındadır, fiyatın oraya gidip dönmesi o likiditenin alındığı anlamına
     * gelir ve girişi aynı likiditenin avı olmaktan çıkarır.
     *
     * Değiştiren şey bedelin ölçülmesi oldu (`scripts/vpfr-range-tarama.js`,
     * 16 varlık, `PLAN-RANGE-VPFR.md` §11.2):
     *
     *   sapmaSarti   kurulum   silah%   ömür   genişlik%   çapaKır%
     *   banda             61       15     84        14.7         42
     *   kapanis          892       72     84        14.7         42
     *   fitil           2350       85     84        14.7         42
     *
     * Kilitli range'lerin %85'i 'banda' olayını HİÇ üretmiyordu. Yapı
     * bekçilerinin dördü de değişmiyor — sapma kuralı range'in KURULUŞUNA
     * dokunmaz, yalnızca silahlanmayı kapatır. Yani bedel yapı bozulması
     * değil, OLAY ZAYIFLAMASIdır ve o ancak beklentiyle tartılır.
     *
     * Belirleyici olan şey şuydu: 'banda' kolu, KENDİ DOĞRULUĞUNU sınatacak
     * kadar bile örneklem üretmiyordu (61 kurulum, eşik 200).
     *
     * 'banda' ELENMEDİ — ölçülebilir hâle gelince geri sınanacak (§12).
     */
    sapmaSarti: ['banda', 'kapanis', 'fitil'].includes(c.sapmaSarti) ? c.sapmaSarti : 'kapanis',

    // ── Genişleme ──
    genislemeDonusBar: Math.max(1, Math.round(say(c.genislemeDonusBar, 50))),
    genislemeTavani: say(c.genislemeTavani, 2.0),
    genislemeMaxSayi: Math.max(0, Math.round(say(c.genislemeMaxSayi, 1))),

    // ── Zaman aşımları ──
    adayZamanAsimi: Math.max(1, Math.round(say(c.adayZamanAsimi, 100))),
    nitelikliZamanAsimi: Math.max(1, Math.round(say(c.nitelikliZamanAsimi, 100))),

    /**
     * ADAY/NİTELİKLİ evresinde sapma bandı kapanışla ihlal edilirse yapı ölür.
     *
     * DİKKAT — bu kural TARİFTE YOK, motor düzeyinde eklendi. §4.1 aday ölümü
     * için yalnızca zaman aşımını sayıyor. Olmadan bir aday, fiyat yapıyı
     * tamamen kırdıktan sonra bile zaman aşımı dolana kadar ayakta kalıyor ve
     * anlamsız bir kilit üretebiliyor. Kapatılabilir olması bilinçli: kuralın
     * bedeli ölçülebilsin.
     */
    adayIhlalOlum: c.adayIhlalOlum !== false,

    // ── Telemetri (§6.10, §6.11) — kural değil, yalnızca kayıt ──
    telemetri: c.telemetri !== false,
    girisSinirYakinlik: say(c.girisSinirYakinlik, 0.25),

    // Retest penceresi — kurulum kaydına `retestGeldi` yazmak için. Motor
    // işlem açmaz; yalnızca "retest kolu bu kurulumu görebilir miydi" sorusunu
    // yapısal olarak cevaplar (§11 adım 0, iki giriş kolunun sayımı).
    retestPencereBar: Math.max(1, Math.round(say(c.retestPencereBar, 20)))
  };
}

/* ────────────────────────────────────────────────────────────────────────
   YARDIMCILAR
   ──────────────────────────────────────────────────────────────────────── */

/**
 * HTF kovaları. `mtfChochRangeStrategy.htfTopla` ile AYNI sözleşme:
 * kova genişliği medyan bar aralığının katı, SON KOVA DIŞARIDA BIRAKILIR
 * (kapanmamış olabilir; kapanmamış mumdan yapı okumak ileriye bakmadır).
 */
const htfTopla = (candles, carpan) => mtf.topla(candles, carpan);

/**
 * SWING TESPİTİ — FRAKTAL, uzunluk `fraktalLen` (her iki YANDAKİ bar sayısı).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * KARAR GEÇMİŞİ — iki kez değişti, ikisi de kullanıcı kararı
 * ─────────────────────────────────────────────────────────────────────────
 * 1) Başlangıç: eşikli salınım (zigzag), eşik `zzEsik` bir parametreydi.
 * 2) 2026-08-30: "swing bir ayar değildir" → 3 mumluk fraktal, sıfır parametre.
 *    ÖLÇÜLDÜ: BTC 4h'te medyan bacak 5 bar, medyan range genişliği %5.6
 *    (zigzag'da %14.7). Büyük hareket parçalanıyordu.
 * 3) 2026-08-30, aynı gün: kullanıcı 2'yi GERİ ALDI — "3 mumlu fraktal çok
 *    fazla gürültü demek, 5-10-15 olarak deneyelim, her zaman diliminde
 *    farklı fraktallar çalışacaktır."
 *
 * Yani ölçek yeniden ayarlanabilir hâle geldi, ama bu kez ölçüye vurulacak
 * bir boyut olarak: `fraktalLen` ∈ {5, 10, 15}.
 *
 * TANIM (`len` = her iki yandaki bar sayısı, repo geleneği: `frLen`/`htfLen`):
 *   swing high : high[i], [i-len .. i+len] penceresinin TEK EN YÜKSEĞİ
 *   swing low  : low[i],  aynı pencerenin TEK EN DÜŞÜĞÜ
 *
 * Eşitlikte fraktal YOKTUR — "tek" olması şart. Eşit tepelerde keyfî taraf
 * seçmeyi önler.
 *
 * ONAY GECİKMESİ = len bar. Uç `index`te oluşur, `confirmedAt = index + len`
 * barında bilinir ve ondan ÖNCE kullanılamaz. İleriye bakmayı önleyen budur.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ALTERNASYON ÇEVRİMİÇİ UYGULANIR — ileriye bakmayı önleyen şey budur
 * ─────────────────────────────────────────────────────────────────────────
 * Ham fraktaller alternatif gelmez: üst üste üç tepe olabilir. Bacak kurmak
 * için dip→tepe alternasyonu gerekir ve kural "aynı tip gelirse daha UÇ olan
 * kalır"dır.
 *
 * Bu kuralı tüm seriye TOPLU uygulamak İLERİYE BAKMADIR: bar 100'de var olan
 * bir tepe, bar 140'ta daha yüksek bir tepe geldiği için listeden geriye
 * dönük silinir ve bar 100'de aslında elimizde olmayan bir yapı varmış gibi
 * davranırız. Bu yüzden alternasyon burada AKIŞ İÇİNDE tutulur: her fraktal
 * onaylandığı anda işlenir, `son` güncellenir, `onceki` hiç değişmez.
 */
function fraktalOlaylar(seri, len) {
  const out = [];
  const n = seri.length;
  const L = Math.max(1, Math.round(len || 5));
  if (n < 2 * L + 1) return out;

  let son = null;      // o ana kadarki en güncel uç
  let onceki = null;   // ondan bir önceki, TERS tipte uç
  /**
   * `onceki`den bir önceki uç. Bacağın kendisi için gerekli DEĞİL; ÖNCEKİ
   * bacağın genliğini ölçmek için gerekli (`capaYonu:'oncekiBacak'`).
   * Aynı tip yer değiştirmesinde `onceki` gibi bu da DEĞİŞMEZ.
   */
  let onceki2 = null;

  for (let i = L; i < n - L; i++) {
    const onay = i + L;                       // sağ pencere kapanmadan bilinemez
    let tepeMi = true;
    let dipMi = true;
    for (let k = i - L; k <= i + L; k++) {
      if (k === i) continue;
      if (seri[k].high >= seri[i].high) tepeMi = false;
      if (seri[k].low <= seri[i].low) dipMi = false;
      if (!tepeMi && !dipMi) break;
    }
    const adaylar = [];
    if (tepeMi) adaylar.push({ index: i, type: 'high', price: seri[i].high, confirmedAt: onay });
    if (dipMi) adaylar.push({ index: i, type: 'low', price: seri[i].low, confirmedAt: onay });

    for (const p of adaylar) {
      /**
       * `uzatti` — bu uç TRENDİ UZATTI mı? (HH ya da LL mi)
       *
       * Bir tepe, kendinden önceki TEPEYİ aşmışsa HH'dir; bir dip, kendinden
       * önceki DİBİN altına inmişse LL'dir. Aşmıyorsa HL/LH'dir, yani ara
       * salınımdır.
       *
       * Kullanıcı kuralı (2026-08-31): range'in çapası ANA fraktal olmalı,
       * yani HH ya da LL. Ekran görüntüsünde motor 90.791'deki HL'yi çapa
       * yapmıştı; olması gereken 99.588'deki HH idi.
       *
       * Alternasyonda önceki AYNI TİPLİ uç şudur: aynı tip geldiyse `son`
       * (ve yer değiştirme zaten daha uç olmayı şart koşuyor), ters tip
       * geldiyse `onceki`.
       */
      if (son && son.type === p.type) {
        // Aynı tip: yalnızca daha UÇ olan yerine geçer. `onceki` DEĞİŞMEZ —
        // bacağın başlangıcı sabit kalır, yalnızca bitişi uzar.
        const dahaUc = p.type === 'high' ? p.price > son.price : p.price < son.price;
        if (!dahaUc) continue;
        p.uzatti = true;              // son'dan daha uç → tanımı gereği HH/LL
        son = p;
      } else {
        p.uzatti = onceki
          ? (p.type === 'high' ? p.price > onceki.price : p.price < onceki.price)
          : false;                    // ilk uçta kıyas yapılacak şey yok
        onceki2 = onceki;
        onceki = son;
        son = p;
      }
      if (onceki) out.push({ confirmedAt: onay, son, onceki, onceki2 });
    }
  }
  return out;
}

/** Bir bölgeyle fiyat arasındaki mesafe; bölgenin içindeyse 0. */
function bolgeMesafe(fiyat, low, high) {
  if (fiyat >= low && fiyat <= high) return 0;
  return fiyat < low ? low - fiyat : fiyat - high;
}

/**
 * Bölge listelerini tek biçime indirger: { low, high, dogum, olum, yon }.
 * Her göstergenin doğum/ölüm alanı farklı adlanıyor (fvg `index`/`filledAt`,
 * breaker `bornAt`/`invalidatedAt`, havuz `createdAt`/`takenAt`), bu yüzden
 * normalize edilmeden sorgulanamaz.
 */
function normalizeBolgeler(liste, dogumAlan, olumAlan, yonAlan) {
  const out = [];
  for (const z of liste || []) {
    const dogum = z[dogumAlan];
    if (!Number.isFinite(dogum)) continue;
    const olum = Number.isFinite(z[olumAlan]) ? z[olumAlan] : null;
    out.push({
      low: z.low, high: z.high, dogum, olum,
      yon: yonAlan ? z[yonAlan] : null,
      level: Number.isFinite(z.level) ? z.level : null
    });
  }
  return out;
}

const aktifMi = (z, i) => z.dogum <= i && (z.olum === null || z.olum > i);

/* ────────────────────────────────────────────────────────────────────────
   MOTOR
   ──────────────────────────────────────────────────────────────────────── */

/**
 * @param {Array} candles  LTF mumları {time,open,high,low,close,volume}
 * @param {object} params  bkz. cfg()
 * @returns {{ranges:Array, kurulumlar:Array, seri:object, meta:object}}
 */
function calistir(candles, params = {}) {
  const p = cfg(params);
  const n = candles ? candles.length : 0;
  const bos = {
    ranges: [], kurulumlar: [],
    seri: { durumAt: [], rangeHigh: [], rangeLow: [], eq: [], devHigh: [], devLow: [], rangeIdAt: [], htfYonAt: [], adaySayisiAt: [] },
    meta: { n, htfBar: 0, fraktalOlay: 0, yetersizVeri: true }
  };
  if (n < 100) return bos;

  // ── Tam seri üzerinde BİR KEZ hesaplananlar (sorgu doğum/ölümle süzülür) ──
  const atr = pool.computeOne(candles, 'atr', { period: p.atrPeriyot }).value;

  const { htf } = htfTopla(candles, p.htfCarpan);
  if (htf.length < 30) return { ...bos, meta: { ...bos.meta, yetersizVeri: true, htfBar: htf.length } };

  const htfYon = pool.computeOne(htf, 'structure_state', {}).state;

  // LTF bar → o barda GÖRÜNÜR olan son kapalı HTF kovası
  const htfIndexAt = new Array(n).fill(-1);
  {
    let k = 0;
    for (let i = 0; i < n; i++) {
      while (k < htf.length && htf[k].sonIndex <= i) k++;
      htfIndexAt[i] = k - 1;   // kova k-1, `sonIndex <= i` olduğu için kapalı
    }
  }

  const zz = fraktalOlaylar(candles, p.fraktalLen);
  const zzBarda = new Map();
  for (let j = 0; j < zz.length; j++) {
    if (!zzBarda.has(zz[j].confirmedAt)) zzBarda.set(zz[j].confirmedAt, []);
    zzBarda.get(zz[j].confirmedAt).push(j);
  }

  // ── Telemetri bölgeleri (§6.10) — kural DEĞİL, yalnızca sayım ──
  let ictBolgeler = [];
  let havuzlar = [];
  if (p.telemetri) {
    const f = pool.computeOne(candles, 'fvg', {});
    const iv = pool.computeOne(candles, 'ifvg', {});
    const bp = pool.computeOne(candles, 'bpr', {});
    const br = pool.computeOne(candles, 'breaker_block', {});
    ictBolgeler = [
      ...normalizeBolgeler(f.gaps, 'index', 'filledAt', 'direction').map(z => ({ ...z, tip: 'fvg' })),
      ...normalizeBolgeler(iv.inversions, 'bornAt', 'invalidatedAt', 'direction').map(z => ({ ...z, tip: 'ifvg' })),
      ...normalizeBolgeler(bp.zones, 'index', 'invalidatedAt', null).map(z => ({ ...z, tip: 'bpr' })),
      ...normalizeBolgeler(br.breakers, 'bornAt', 'invalidatedAt', 'direction').map(z => ({ ...z, tip: 'breaker' }))
    ];
    havuzlar = normalizeBolgeler(
      pool.computeOne(candles, 'liquidity_pools', {}).pools, 'createdAt', 'takenAt', 'side'
    );
  }

  // ── Çıktı serileri ──
  const seri = {
    durumAt: new Array(n).fill(DURUM.YOK),
    rangeHigh: new Array(n).fill(NaN),
    rangeLow: new Array(n).fill(NaN),
    eq: new Array(n).fill(NaN),
    devHigh: new Array(n).fill(NaN),
    devLow: new Array(n).fill(NaN),
    rangeIdAt: new Array(n).fill(null),
    /**
     * Her LTF barında o an GÖRÜNÜR olan HTF yapı yönü (1/-1/0).
     *
     * Range mantığı için gerekli değil; KOŞULLU DRIFT NÖTRLEŞTİRMESİ için
     * gerekli. Trend yönünde seçilmiş işlemleri koşulsuz ortalama sürüklenmeyle
     * düzeltmek yetmez — `PLAN-RANGE-KURALLARI.md` §2.10'da bu depoyu bir kez
     * yanıltmış hata sınıfı tam olarak budur.
     */
    htfYonAt: new Array(n).fill(0),
    /** O barda paralel izlenen aday sayısı — "her swing'de ara" kuralının izi. */
    adaySayisiAt: new Array(n).fill(0)
  };
  for (let i = 0; i < n; i++) {
    const k = htfIndexAt[i];
    seri.htfYonAt[i] = (k >= 0 && Number.isFinite(htfYon[k])) ? htfYon[k] : 0;
  }

  const ranges = [];
  const kurulumlar = [];
  /**
   * `aktif`  — KİLİTLİ/SİLAHLI/GENİŞLEME durumundaki TEK yapı.
   * `adaylar` — ADAY/NİTELİKLİ durumundaki PARALEL yapılar.
   *
   * ─────────────────────────────────────────────────────────────────────
   * NEDEN İKİ AYRI KAP (kullanıcı kuralı, 2026-08-30)
   * ─────────────────────────────────────────────────────────────────────
   * "Fiyat devam ederken HER SWING'DE range aramalıyız."
   *
   * Önceki sürümde tek bir kap vardı ve yeni aday ancak öncekisi ÖLÜNCE
   * doğabiliyordu. Sonucu: bir aday zaman aşımı dolana kadar (100 bar)
   * arama tamamen duruyordu; o pencerede oluşan gerçek yapılar hiç
   * görülmüyordu. Range'in "en baştan yanlış çizilmesi" şikâyetinin
   * mekanik sebebi buydu.
   *
   * Artık her swing olayı bir aday doğurur ve adaylar POC≈EQ eşleşmesini
   * PARALEL bekler. İlk kilitlenen yapı `aktif` olur; o andan sonra işlem
   * tek yapı üzerinden yürür ve kalan adaylar düşer (aynı fiyat bölgesi
   * için yarışan hipotezlerdi, kazananı belli oldu).
   *
   * İŞLEM TARAFI HÂLÂ TEK YAPI: iki kilitli range aynı anda işlem açsaydı
   * pozisyonlar çakışır, kill kriteri ölçülemez hâle gelirdi.
   */
  let aktif = null;
  let adaylar = [];
  let sonrakiId = 1;

  /** Seviyeleri H/L'den türetir; genişlemeden sonra da bu çağrılır. */
  const seviyeleriKur = (r) => {
    r.R = r.H - r.L;
    r.eq = r.L + p.eqSeviye * r.R;
    r.devHigh = r.H + p.devKat * r.R;
    r.devLow = r.L - p.devKat * r.R;
  };

  const oldur = (r, i, sebep) => {
    r.durum = 'gecersiz';
    r.olumBar = i;
    r.olumSebebi = sebep;
    r.omur = i - r.dogumBar;
    ranges.push(r);
    if (aktif === r) aktif = null;
  };

  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const a = Number.isFinite(atr[i]) ? atr[i] : NaN;

    /* ══════════════ 1) ADAYLARI PARALEL İLERLET ══════════════ */
    if (!aktif && adaylar.length) {
      const kalan = [];
      let kilitlenen = null;

      for (const r of adaylar) {
        if (kilitlenen) { kalan.push(r); continue; }   // yarış bitti, gerisi §2'de düşer

        // ---- Ölüm: sapma bandı ihlali ya da zaman aşımı ----
        if (p.adayIhlalOlum && (c.close > r.devHigh || c.close < r.devLow)) {
          oldur(r, i, OLUM.ADAY_IHLAL); continue;
        }
        if (r.durum === DURUM.ADAY && (i - r.dogumBar) > p.adayZamanAsimi) {
          oldur(r, i, OLUM.ADAY_ZAMAN); continue;
        }
        if (r.durum === DURUM.NITELIKLI && (i - r.nitelikliBar) > p.nitelikliZamanAsimi) {
          oldur(r, i, OLUM.NITELIKLI_ZAMAN); continue;
        }

        // ---- ADAY → NİTELİKLİ: VPFR POC'u EQ bandına girdi mi ----
        if (r.durum === DURUM.ADAY) {
          const pencere = candles.slice(r.bacakBasIndex, i + 1);
          if (pencere.length >= 5) {
            const vp = pool.computeOne(pencere, 'volume_profile', {
              mode: 'bars', bars: pencere.length, bins: p.vpfrBins
            });
            r.sonPoc = vp.poc;
            if (Number.isFinite(vp.poc) && Math.abs(vp.poc - r.eq) <= p.pocEqTolerans * r.R) {
              r.durum = DURUM.NITELIKLI;
              r.nitelikliBar = i;
              r.pocEqMesafeR = Math.abs(vp.poc - r.eq) / r.R;
            }
          }
        }

        // ---- NİTELİKLİ → KİLİTLİ: AVWAP teyidi ----
        if (r.durum === DURUM.NITELIKLI) {
          const pencere = candles.slice(r.bacakBasIndex, i + 1);
          if (pencere.length >= p.avwapTeyitBar) {
            const av = pool.computeOne(pencere, 'vwap_anchored', {
              mode: 'timestamp', anchorTime: pencere[0].time
            });
            let tutan = 0, bakilan = 0;
            for (let j = pencere.length - p.avwapTeyitBar; j < pencere.length; j++) {
              const v = av.vwap[j];
              if (!Number.isFinite(v)) continue;
              bakilan++;
              if (Math.abs(v - r.eq) <= p.avwapTolerans * r.R) tutan++;
            }
            if (bakilan > 0) {
              r.sonAvwap = av.vwap[pencere.length - 1];
              if (tutan / bakilan >= p.avwapTeyitOran) {
                r.durum = DURUM.KILITLI;
                r.kilitBar = i;
                r.ilkKilitGenislik = r.R;          // genişlik tavanı BUNA göre
                r.avwapEqMesafeR = Math.abs(r.sonAvwap - r.eq) / r.R;
                kilitlenen = r;
                continue;                          // kazanan `kalan`a girmez
              }
            }
          }
        }
        kalan.push(r);
      }

      if (kilitlenen) {
        // Kazanan aktif olur; yarışı kaybeden adaylar aynı fiyat bölgesi için
        // rakip hipotezlerdi, düşerler. Ölü listesine SEBEPLE yazılırlar ki
        // telemetride "kaç aday yarışı kaybetti" görülebilsin.
        for (const r of kalan) oldur(r, i, OLUM.YARIS_KAYBI);
        adaylar = [];
        aktif = kilitlenen;
      } else {
        adaylar = kalan;
      }
    }

    /* ══════════════ 2) AKTİF (KİLİTLİ) YAPIYI İLERLET ══════════════ */
    if (aktif) {
      // ---- KİLİTLİ / SİLAHLI / GENİŞLEME: ihlal, genişleme, sapma ----
      if (aktif.durum === DURUM.KILITLI || aktif.durum === DURUM.SILAHLI
        || aktif.durum === DURUM.GENISLEME) {
        const r2 = aktif;

        // (a) Sapma bandı KAPANIŞLA ihlal edildi mi?
        const ustIhlal = c.close > r2.devHigh;
        const altIhlal = c.close < r2.devLow;

        if (r2.durum !== DURUM.GENISLEME && (ustIhlal || altIhlal)) {
          const ihlalTaraf = ustIhlal ? 'high' : 'low';
          r2.sapmaDeneme = null;   // sapma değil ihlal — deneme iptal

          if (ihlalTaraf === r2.capaTaraf) {
            // §4.1 md.19 — dayanak gitti, genişleme kolu YOK, anında ölüm.
            oldur(r2, i, OLUM.CAPA_KIRILDI);
          } else if (r2.genislemeSayisi >= p.genislemeMaxSayi) {
            // §4.1 md.17 — genişleme hakkı bitti.
            oldur(r2, i, OLUM.GENISLEME_HAKKI);
          } else {
            r2.durum = DURUM.GENISLEME;
            r2.ihlal = { taraf: ihlalTaraf, basBar: i, uc: ihlalTaraf === 'high' ? c.high : c.low };
          }
        }

        // (b) GENİŞLEME: ucu takip et, dönüşü bekle
        if (aktif && aktif.durum === DURUM.GENISLEME) {
          const r3 = aktif;
          const ih = r3.ihlal;
          if (ih.taraf === 'high') ih.uc = Math.max(ih.uc, c.high);
          else ih.uc = Math.min(ih.uc, c.low);

          // Çapa tarafı bu sırada kırılırsa yine anında ölüm.
          const capaKirik = r3.capaTaraf === 'high' ? c.close > r3.devHigh : c.close < r3.devLow;
          if (capaKirik) {
            oldur(r3, i, OLUM.CAPA_KIRILDI);
          } else if (c.close <= r3.H && c.close >= r3.L) {
            // Range içine KAPANDI → sınırı taşınmış uca al, seviyeleri yenile.
            if (ih.taraf === 'high') r3.H = ih.uc; else r3.L = ih.uc;
            seviyeleriKur(r3);
            r3.genislemeSayisi++;
            r3.ihlal = null;

            if (r3.R / r3.ilkKilitGenislik > p.genislemeTavani) {
              // §4.1 md.18 — kümülatif tavan. TEK ölüm sebebi ki fiyat hiçbir
              // sınırı kırmamış olabilir (bkz. §6.9 tablosu).
              oldur(r3, i, OLUM.GENISLIK_TAVANI);
            } else {
              // §4 durum makinesi: sınırlar yeniden dondu, işlem için YİNE
              // sapma olayı beklenir. Silahlanma sıfırlanır.
              r3.durum = DURUM.KILITLI;
              r3.yenidenKilitBar = r3.yenidenKilitBar || [];
              r3.yenidenKilitBar.push(i);
            }
          } else if ((i - ih.basBar) > p.genislemeDonusBar) {
            oldur(r3, i, OLUM.GENISLEME_DONUS_YOK);
          }
        }

        // (c) SAPMA OLAYI — sapma bandına DEĞ, bandın ötesinde KAPANMA,
        //     pencere içinde range'e KAPAN. (Kullanıcı kararı 2026-08-30.)
        if (aktif && (aktif.durum === DURUM.KILITLI || aktif.durum === DURUM.SILAHLI)) {
          const r4 = aktif;

          // Tetik eşiği `sapmaSarti`'na göre. Varsayılan 'banda': sapma
          // bandına fitille değmek. Diğer ikisi §11.1 taraması için.
          if (!r4.sapmaDeneme) {
            let ustEsik, altEsik, deger;
            if (p.sapmaSarti === 'kapanis') {
              ustEsik = r4.H; altEsik = r4.L; deger = { ust: c.close, alt: c.close };
            } else if (p.sapmaSarti === 'fitil') {
              ustEsik = r4.H; altEsik = r4.L; deger = { ust: c.high, alt: c.low };
            } else {
              ustEsik = r4.devHigh; altEsik = r4.devLow; deger = { ust: c.high, alt: c.low };
            }
            if (deger.ust > ustEsik) r4.sapmaDeneme = { taraf: 'high', basBar: i };
            else if (deger.alt < altEsik) r4.sapmaDeneme = { taraf: 'low', basBar: i };
          }

          if (r4.sapmaDeneme) {
            const d = r4.sapmaDeneme;
            const bandDisiKapanis = d.taraf === 'high' ? c.close > r4.devHigh : c.close < r4.devLow;
            const iceriKapandi = c.close <= r4.H && c.close >= r4.L;

            if (bandDisiKapanis) {
              r4.sapmaDeneme = null;              // ihlal — (a) zaten işledi
            } else if (iceriKapandi) {
              r4.sapmaSayisi++;
              if (r4.durum === DURUM.KILITLI) {
                r4.durum = DURUM.SILAHLI;
                r4.ilkSilahBar = r4.ilkSilahBar === null ? i : r4.ilkSilahBar;
              }
              kurulumlar.push(kurulumKaydi(r4, d, i, candles, p, {
                ictBolgeler, havuzlar, htfYon, htfIndexAt, atr
              }));
              r4.kurulumSayisi++;
              r4.sapmaDeneme = null;
            } else if ((i - d.basBar) > p.sapmaDonusBar) {
              r4.sapmaDeneme = null;              // pencere doldu, deneme düştü
              r4.sapmaKacirilan++;
            }
          }
        }
      }

      // ---- Seri kaydı ----
      if (aktif) {
        seri.durumAt[i] = aktif.durum;
        seri.rangeHigh[i] = aktif.H;
        seri.rangeLow[i] = aktif.L;
        seri.eq[i] = aktif.eq;
        seri.devHigh[i] = aktif.devHigh;
        seri.devLow[i] = aktif.devLow;
        seri.rangeIdAt[i] = aktif.id;
      }
    }

    /* ══════════════ 3) YENİ ADAY — HER SWING'DE ══════════════ */
    /**
     * Kullanıcı kuralı (2026-08-30): "fiyat devam ederken HER SWING'DE range
     * aramalıyız". Yani aday doğuşunu engelleyen tek şey KİLİTLİ bir yapının
     * varlığıdır; bekleyen adaylar birbirini engellemez.
     *
     * Kilitli yapı varken aday aranmaması bilinçli: o sırada doğacak adaylar
     * aynı bölgeyi ikinci kez çizer ve yapı ölünce anında üst üste binen bir
     * range doğardı. Aktif yapı ölür ölmez arama kendiliğinden yeniden açılır.
     */
    if (!aktif && zzBarda.has(i) && Number.isFinite(a)) {
      for (const j of zzBarda.get(i)) {
        // Olay, o barda geçerli olan alternatif çifti TAŞIR (çevrimiçi
        // kurulduğu için ileriye bakma yok). Listeden komşu okumak yanlış
        // olurdu: aynı tip fraktaller yerine geçtiğinde liste sırası
        // alternasyonu yansıtmaz.
        const son = zz[j].son;
        const onc = zz[j].onceki;

        const H = Math.max(son.price, onc.price);
        const L = Math.min(son.price, onc.price);
        const genlik = H - L;
        if (!(genlik >= p.bacakEnAzAtr * a)) continue;      // itki süzgeci

        /* ── ÇAPA YÖNÜ SÜZGECİ (kullanıcı kuralı, 2026-08-31) ──
         * Range, önceki hareketin ucuna çapalanır ve ona KARŞI açılır.
         * Bu süzgeç olmadan motor range'i impulse'un ÜSTÜNE kuruyordu;
         * ölçümde 20 range'in 14'ü ters çapalanmıştı. */
        if (p.capaYonu === 'yapi') {
          /**
           * İKİ ŞART BİRDEN — range DÜZELTME bacağına kurulur, impulse'a değil.
           *
           * (a) ÇAPA trendi uzatmış olmalı (HH ya da LL). Ara salınım uçları
           *     (HL / LH) çapa olamaz.
           * (b) Bacağın UCU trendi uzatmamış olmalı. Uç yeni bir HH/LL ise o
           *     bacak IMPULSE'tur; range onun üstüne kurulmaz, çapa onun
           *     ucunda kalır ve range BİR SONRAKİ bacakta doğar.
           *
           * ─────────────────────────────────────────────────────────────
           * (b) ŞARTI NEDEN EKLENDİ (kullanıcı ekran görüntüsü, 2026-08-31)
           * ─────────────────────────────────────────────────────────────
           * Yalnızca (a) varken 24 Şub 2024'teki 50.500 dibi LL olduğu için
           * çapa oldu ve range 28 Şub'daki 63.900 tepesine kadar uzayan
           * RALLİNİN ÜSTÜNE kuruldu (R/EQ %23.5). Oysa fiyat yukarı
           * gidiyordu; kullanıcı kuralına göre çapa rallinin TEPESİ olmalıydı.
           *
           * Sebep: LL, DÜŞÜŞ trendinin ucudur. Ondan sonra gelen yükseliş
           * bacağı bir düzeltme değil, dönüş IMPULSE'udur — ve ucu yeni bir
           * HH yapar. (b) tam olarak bunu yakalar.
           *
           * Üç kullanıcı vakasının üçünde de doğru: rallide uç HH → red ·
           * 80.755 LL → 89.390 LH (önceki tepeyi aşmıyor) → kabul ·
           * 99.588 HH → 90.791 HL (önceki dibi kırmıyor) → kabul.
           */
          if (!onc.uzatti) continue;
          if (son.uzatti) continue;
        } else if (p.capaYonu === 'htf') {
          const ty = seri.htfYonAt[i];
          if (ty === 0) continue;                    // yön belirsizken kurma
          // Yükselişte çapa TEPE, düşüşte DİP olmalı. Çapa = bacağın başı.
          if (onc.type !== (ty === 1 ? 'high' : 'low')) continue;
        }

        // Bacağın YÖNÜ: son nokta tepe ise yükseliş bacağı.
        const yon = son.type === 'high' ? 'yukselis' : 'dusus';

        const r = {
          id: sonrakiId++,
          yon,
          // ÇAPA = bacağın BAŞLADIĞI uç. Kullanıcının AVWAP tarifiyle aynı
          // nokta ("range başlangıcındaki swing harekete çapalanır"); genişleme
          // daima bacağın BİTTİĞİ ucu taşır.
          capaTaraf: son.type === 'high' ? 'low' : 'high',
          H, L,
          bacakBasIndex: onc.index,
          bacakUcIndex: son.index,
          bacakGenlikAtr: genlik / a,
          durum: DURUM.ADAY,
          dogumBar: i,
          nitelikliBar: null,
          kilitBar: null,
          ilkSilahBar: null,
          olumBar: null,
          olumSebebi: null,
          ilkKilitGenislik: null,
          genislemeSayisi: 0,
          sapmaSayisi: 0,
          sapmaKacirilan: 0,
          kurulumSayisi: 0,
          sapmaDeneme: null,
          ihlal: null,
          sonPoc: null,
          sonAvwap: null,
          pocEqMesafeR: null,
          avwapEqMesafeR: null
        };
        seviyeleriKur(r);
        adaylar.push(r);

        // Tavan: en ESKİ aday atılır. Yeni aday daha taze bir yapıdır ve
        // eskisi zaten POC eşleşmesini bulamamış demektir.
        while (adaylar.length > p.maxAday) {
          oldur(adaylar.shift(), i, OLUM.ADAY_ZAMAN);
        }
        // `break` YOK: aynı barda hem tepe hem dip fraktali onaylanabilir ve
        // ikisi de ayrı aday doğurabilir. Eski sürümde buradaki `break`,
        // "her swing'de ara" kuralının ikinci ihlaliydi.
      }
    }

    /* ══════════════ 4) SERİ KAYDI ══════════════ */
    // Aktif yapı varsa o çizilir; yoksa en YENİ aday çizilir (noktalı
    // gösterim panelin/Pine'ın işi). Hiçbiri yoksa bar boş kalır.
    const cizilecek = aktif || (adaylar.length ? adaylar[adaylar.length - 1] : null);
    if (cizilecek) {
      seri.durumAt[i] = cizilecek.durum;
      seri.rangeHigh[i] = cizilecek.H;
      seri.rangeLow[i] = cizilecek.L;
      seri.eq[i] = cizilecek.eq;
      seri.devHigh[i] = cizilecek.devHigh;
      seri.devLow[i] = cizilecek.devLow;
      seri.rangeIdAt[i] = cizilecek.id;
    }
    seri.adaySayisiAt[i] = adaylar.length;
  }

  // Seri bitti — hâlâ açık yapı varsa "ölmedi", ayrı sebeple kapatılır ki
  // ömür istatistikleri sağa sansürlü olduğunu bilsin.
  for (const r of (aktif ? [aktif, ...adaylar] : adaylar)) {
    r.durum = 'gecersiz';
    r.olumBar = n - 1;
    r.olumSebebi = OLUM.SERI_BITTI;
    r.omur = (n - 1) - r.dogumBar;
    r.sansurlu = true;
    ranges.push(r);
  }

  // Retest sorusu geriye dönük cevaplanır — kurulum barından SONRAKİ barlara
  // bakar, yani bu bir ÖLÇÜM alanıdır, motorun kararı değil. Canlıda böyle bir
  // bilgi yoktur; §11'de yalnızca "retest kolu kaç kurulum görebilirdi"
  // sayımında kullanılır.
  retestIsaretle(kurulumlar, candles, p);

  return {
    ranges,
    kurulumlar,
    seri,
    meta: {
      n,
      htfBar: htf.length,
      fraktalOlay: zz.length,
      yetersizVeri: false,
      params: p
    }
  };
}

/**
 * Sapma olayı anındaki kurulum künyesi.
 *
 * Buradaki alanların HİÇBİRİ işlem kararı değildir; §11'in sayım tablolarını
 * ve §6.10/§6.11 telemetrisini besler.
 */
function kurulumKaydi(r, deneme, i, candles, p, ek) {
  const c = candles[i];
  const sinir = deneme.taraf === 'high' ? r.H : r.L;
  const a = Number.isFinite(ek.atr[i]) ? ek.atr[i] : NaN;

  // Sınıra `girisSinirYakinlik × R` mesafesinde ICT bölgesi var mı? (§6.1
  // `bolgeYoksa` boyutunun bedelini saymak için.)
  const yakinlik = p.girisSinirYakinlik * r.R;
  const bolgeler = [];
  for (const z of ek.ictBolgeler) {
    if (!aktifMi(z, i)) continue;
    if (bolgeMesafe(sinir, z.low, z.high) <= yakinlik) bolgeler.push(z.tip);
  }

  // §6.10 — EQH/EQL telemetrisi. Kural YOK, yalnızca sayım.
  let havuzVar = false, havuzMesafeR = null, havuzAlindi = false;
  for (const h of ek.havuzlar) {
    const seviye = Number.isFinite(h.level) ? h.level : (h.low + h.high) / 2;
    const m = Math.abs(seviye - sinir);
    if (h.dogum <= i && m <= yakinlik) {
      havuzVar = true;
      if (havuzMesafeR === null || m / r.R < havuzMesafeR) havuzMesafeR = m / r.R;
      // Havuz bu sapma sırasında mı alındı: ölüm barı sapma penceresinde mi
      if (h.olum !== null && h.olum >= deneme.basBar && h.olum <= i) havuzAlindi = true;
    }
  }

  const k = ek.htfIndexAt[i];
  const yonHtf = (k >= 0 && Number.isFinite(ek.htfYon[k])) ? ek.htfYon[k] : 0;

  return {
    rangeId: r.id,
    bar: i,
    time: c.time,
    taraf: deneme.taraf,
    // Sapmayı fade etmek: üst sınırdan short, alt sınırdan long.
    islemYonu: deneme.taraf === 'high' ? 'short' : 'long',
    sapmaBasBar: deneme.basBar,
    sapmaSureBar: i - deneme.basBar,
    sinir,
    R: r.R,
    eq: r.eq,
    H: r.H,
    L: r.L,
    // Stop seviyeleri buradan okunur ki ölçüm katmanı `devKat`'ı yeniden
    // türetmesin — türetirse motorla ölçüm sessizce ayrışabilir.
    devHigh: r.devHigh,
    devLow: r.devLow,
    kacinciSapma: r.sapmaSayisi,
    rangeYasi: i - r.dogumBar,
    kilitYasi: r.kilitBar === null ? null : i - r.kilitBar,
    genislemeSayisi: r.genislemeSayisi,

    // Yön politikası (§6.1) sayımı için
    htfYon: yonHtf,
    htfYonundeMi: yonHtf === 0 ? null : ((deneme.taraf === 'low') === (yonHtf === 1)),

    // Bölge (§6.1 `bolgeYoksa`) sayımı için
    bolgeVar: bolgeler.length > 0,
    bolgeTipleri: Array.from(new Set(bolgeler)),

    // §6.10 telemetri
    sinirdaHavuzVar: havuzVar,
    havuzAlindi,
    havuzMesafeR,

    // §6.11 telemetri
    girisAvwapMesafeR: r.avwapEqMesafeR,
    pocEqMesafeR: r.pocEqMesafeR,

    kapanis: c.close,
    girisMesafeR: Math.abs(c.close - sinir) / r.R,
    atr: a,

    // retestIsaretle() dolduracak
    retestGeldi: null,
    retestBar: null
  };
}

/**
 * `retestGeldi` — kurulumdan sonra fiyat sınıra `girisSinirYakinlik × R`
 * mesafesine geri döndü mü, `retestPencereBar` içinde?
 *
 * ÖLÇÜM ALANIDIR, KURAL DEĞİL. §11 adım 0'da iki giriş kolunun (retest /
 * dönüş) kaç işlem üreteceğini saymak için var. Strateji katmanı bunu canlıda
 * bar bar bekleyerek öğrenir; burada geriye dönük işaretlenmesi yalnızca
 * sayımı mümkün kılar.
 */
function retestIsaretle(kurulumlar, candles, p) {
  const n = candles.length;
  for (const s of kurulumlar) {
    const yakinlik = p.girisSinirYakinlik * s.R;
    s.retestGeldi = false;
    const son = Math.min(n - 1, s.bar + p.retestPencereBar);
    for (let i = s.bar + 1; i <= son; i++) {
      const c = candles[i];
      const m = s.taraf === 'high'
        ? bolgeMesafe(s.sinir, c.low, c.high)   // fiyat sınıra değdi mi
        : bolgeMesafe(s.sinir, c.low, c.high);
      if (m <= yakinlik) { s.retestGeldi = true; s.retestBar = i; break; }
    }
  }
}

module.exports = { calistir, DURUM, OLUM, htfTopla, fraktalOlaylar, cfg };
