const { register } = require('../registry');
const { clean } = require('../contract');

/**
 * FVG ailesi: Fair Value Gap, Inversion FVG ve Balanced Price Range.
 *
 * FVG TANIMI (üç mum):
 *   Boğa FVG → mum[i].low > mum[i-2].high     boşluk = [mum[i-2].high, mum[i].low]
 *   Ayı  FVG → mum[i].high < mum[i-2].low     boşluk = [mum[i].high, mum[i-2].low]
 *
 * Bu tanım tek başına piyasada sürekli eşleşir; çoğu gürültüdür. Bu yüzden iki
 * filtre var ve ikisi de varsayılan olarak AÇIK:
 *   - `minGapAtr`          boşluk en az bu kadar ATR olmalı
 *   - `requireDisplacement` ortadaki mum enerjili olmalı
 *
 * İLERİYE BAKMA: FVG üçüncü mumda tam olarak bilinir — gecikme yok. Ama
 * türetilmiş seriler `i-2`den değil `i`den itibaren dolar; boşluğu yaratan
 * üçüncü mum kapanmadan FVG'nin var olduğu bilinemez.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LUXALGO "FAIR VALUE GAP" KARŞILAŞTIRMASI (2026-08-14)
 * ─────────────────────────────────────────────────────────────────────────
 * Kaynak: "Fair Value Gap [LuxAlgo]" (Pine v5), CC BY-NC-SA 4.0 © LuxAlgo.
 * Mantığı buraya uyarlandı; TİCARİ KULLANIMA KAPALI bir lisans (NC) ve
 * türevleri aynı lisansla paylaşılmalı (SA). Kişisel/araştırma kullanımı
 * kapsamda; bu bot satılırsa ya da hizmet olarak sunulursa bu kısım
 * yeniden değerlendirilmeli.
 *
 * Üç gerçek fark bulundu:
 *
 * 1. ORTA MUMUN KAPANIŞI. LuxAlgo boşluğun varlığına EK olarak ortadaki mumun
 *    boşluğun karşı kenarını KAPANIŞLA geçmesini ister:
 *      boğa: `close[1] > high[2]`   ayı: `close[1] < low[2]`
 *    Bizde bu koşul yoktu. Bizim karşılığımız `requireDisplacement` (ortadaki
 *    mumun ENERJİSİ), ki farklı bir şeyi ölçer: biri mumun büyüklüğüne, diğeri
 *    NEREDE KAPANDIĞINA bakar. Artık `requireMidClose` ile ikisi de var ve
 *    bağımsız açılıp kapanabiliyor.
 *
 * 2. EŞİK NORMALİZASYONU. Bizde boşluk ATR'ye oranlanıyor (volatiliteye göre),
 *    LuxAlgo'da FİYATA oranlanıyor: `boşluk / boşluğun alt kenarı`. İkisi aynı
 *    şey değildir — ATR normalizasyonu sakin dönemlerde daha çok, oynak
 *    dönemlerde daha az FVG geçirir; yüzde normalizasyonu piyasa rejiminden
 *    bağımsızdır. `thresholdMode` ile seçilebilir.
 *
 * 3. "AUTO" EŞİK. LuxAlgo'nun otomatik eşiği `ta.cum((high−low)/low)/bar_index`,
 *    yani BAŞLANGIÇTAN BU BARA kadar ortalama göreli mum aralığı — genişleyen
 *    pencere, ileriye bakma yok. Burada aynı hesap `(i+1)` ile yapılıyor:
 *    Pine `bar_index` ile bölerken toplamda `i+1` terim vardır ve ilk barda
 *    sıfıra bölme oluşur. Fark büyük i'de ihmal edilebilir, düzeltmesi ise
 *    doğru olanı.
 *
 * AYNI olanlar: üç mumluk boşluk tanımı ve mitigasyon kuralı (boşluğun karşı
 * kenarının ötesinde KAPANIŞ) — bizim `fill: 'through'` varsayılanımız zaten
 * LuxAlgo ile birebir aynı. Bizde ek olarak `touch` ve `mid` (CE) seçenekleri,
 * dokunuş sayacı, en yakın seviye serileri, IFVG ve BPR var.
 *
 * VARSAYILANLAR DEĞİŞMEDİ: yeni koşullar varsayılan KAPALI. Hangi tanımın daha
 * iyi olduğu tercih değil ÖLÇÜM sorusudur; ölçüm yapılmadan varsayılanı
 * değiştirmek, bu depoda daha önce pahalıya mal olmuş bir alışkanlıktı.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ÖLÇÜM SONUCU (8 varlık, drift düzeltmeli brüt edge, 5 bar ufuk)
 * ─────────────────────────────────────────────────────────────────────────
 * Dokunuş olayı (fiyat boşluğa geri döner) — asıl tradable olay:
 *
 *   1d   bizim varsayılan  +%0.79  (n=968)   |  LuxAlgo  +%2.92  (n=173)
 *   4h   bizim varsayılan  −%0.22  (n=1117)  |  LuxAlgo  −%0.41  (n=355)
 *   1h   bizim varsayılan  −%0.10  (n=1227)  |  LuxAlgo  −%0.05  (n=406)
 *
 * LuxAlgo tanımı 1d'de belirgin şekilde daha iyi, 4h ve 1h'te daha KÖTÜ.
 * Doğrulandı: 1d'de 7/8 varlıkta pozitif, iki yön de simetrik (boğa +%2.93 /
 * ayı +%2.91 — yani ölçülen şey piyasa yükselişi değil), 3/3 dönem diliminde
 * pozitif. Uyarı: varlık başına örneklem 3–22 olay, per-varlık rakamlar ince;
 * güvenilir olan havuzlanmış sonuç (n=173).
 *
 * ETKİYİ HANGİ BİLEŞEN ÜRETİYOR — ölçüldü ve şaşırtıcı:
 *   · EŞİK NORMALİZASYONU her şeyi yapıyor. Aynı `requireMidClose` ile ATR
 *     eşiği +%0.64, "auto" yüzde eşiği +%2.92 veriyor.
 *   · `requireMidClose` "auto" eşik açıkken HİÇBİR ŞEY DEĞİŞTİRMİYOR: BTC 28
 *     vs 28, ETH 30 vs 30, XRP 37 vs 37, SOL 6 vs 6 — birebir aynı boşluklar.
 *     Sebebi mantıksal: ortalama mum aralığından BÜYÜK bir boşluk zaten
 *     ortadaki mumun kenarı kapanışla geçtiği anlamına geliyor. Yani
 *     LuxAlgo'nun `close[1]` koşulu, kendi auto eşiğinin yanında gereksiz.
 *   · `requireDisplacement` eklemek edge'i DÜŞÜRÜYOR (+%2.92 → +%2.40).
 *
 * SONUÇ: 1d için önerilen kurulum `{ thresholdMode: 'auto',
 * requireDisplacement: false }`. `requireMidClose` isteğe bağlı (ölçülen etkisi
 * sıfır). 4h/1h'te FVG'nin kendisi pozitif edge üretmiyor — orada kullanılmamalı.
 */

/** Bölge çakışması; BPR ve mitigasyon hesaplarının ortak yardımcısı. */
function overlap(a, b) {
  const alt = Math.max(a.low, b.low);
  const ust = Math.min(a.high, b.high);
  return ust > alt ? { low: alt, high: ust } : null;
}

register({
  key: 'fvg',
  label: 'Fair Value Gap',
  group: 'ict',
  kind: 'zones',
  outputs: ['gaps', 'stats', 'activeBullish', 'activeBearish', 'nearestBullish', 'nearestBearish', 'inGap'],
  seriesOutputs: ['activeBullish', 'activeBearish', 'nearestBullish', 'nearestBearish', 'inGap'],
  sparseOutputs: ['nearestBullish', 'nearestBearish'],
  dependsOn: ['atr', 'displacement'],
  params: {
    atrPeriod: { type: 'number', default: 14, min: 1 },
    minGapAtr: { type: 'number', default: 0.25, min: 0 },
    requireDisplacement: { type: 'boolean', default: true },

    // ── LuxAlgo uyarlaması (bkz. dosya başı karşılaştırma) ──
    // Ortadaki mum boşluğun karşı kenarını KAPANIŞLA geçmeli.
    requireMidClose: { type: 'boolean', default: false },
    // Boşluk büyüklüğü neye oranlanacak:
    //   'atr'  → ATR'ye (bizim özgün davranışımız, `minGapAtr`)
    //   'pct'  → fiyata, sabit yüzde (`minGapPct`)
    //   'auto' → fiyata, genişleyen pencere ortalama mum aralığına
    thresholdMode: { type: 'enum', values: ['atr', 'pct', 'auto'], default: 'atr' },
    minGapPct: { type: 'number', default: 0, min: 0 },

    dispAtrMultiple: { type: 'number', default: 1.5, min: 0.1 },
    dispMinBodyRatio: { type: 'number', default: 0.5, min: 0, max: 1 },
    // 'through' = karşı kenarın ötesinde kapanış (tam doldu)
    // 'touch'   = boşluğa değmek yeter
    // 'mid'     = orta noktaya (CE, consequent encroachment) ulaşmak yeter
    fill: { type: 'enum', values: ['through', 'touch', 'mid'], default: 'through' },
    maxActive: { type: 'number', default: 20, min: 1 }
  },
  warmup: (p) => p.atrPeriod + 3,
  note: 'İki gürültü filtresi varsayılan açık: `minGapAtr` ve `requireDisplacement`. Kapatılırsa üç mumda bir FVG bulunur. LuxAlgo tanımı için: `thresholdMode: auto` + `requireDisplacement: false` (ölçüm sonuçları dosya başında).',
  // `stats` bir sayaç nesnesidir, bölge değil. Bildirim olmadan `kind: 'zones'`
  // varsayılanına düşüyor ve grafik onu kutu olarak çizmeye çalışıyordu.
  render: {
    stats: { pane: 'own', as: 'none', label: 'Sayım / mitigasyon oranı' }
  },
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const atr = ctx.computeOne('atr', { period: p.atrPeriod }).value;
    const disp = p.requireDisplacement
      ? ctx.computeOne('displacement', {
        atrPeriod: p.atrPeriod,
        atrMultiple: p.dispAtrMultiple,
        minBodyRatio: p.dispMinBodyRatio
      })
      : null;

    const gaps = [];
    let sonrakiId = 1;

    /**
     * "Auto" eşik: genişleyen pencerede ortalama göreli mum aralığı.
     * LuxAlgo `ta.cum((high−low)/low) / bar_index` kullanıyor; burada bölen
     * `i+1` (bkz. dosya başı not). Geçmişe bakar, geleceğe bakmaz.
     */
    const otoEsik = new Array(n).fill(null);
    if (p.thresholdMode === 'auto') {
      let kum = 0;
      for (let i = 0; i < n; i++) {
        const c = candles[i];
        if (c.low > 0) kum += (c.high - c.low) / c.low;
        otoEsik[i] = kum / (i + 1);
      }
    }

    for (let i = 2; i < n; i++) {
      const a = atr[i];
      // ATR yalnızca `atr` modunda ve `sizeAtr` raporu için gerekli; yüzde
      // modlarında ısınmayı beklemek gereksiz yere ilk barları eler.
      if (p.thresholdMode === 'atr' && (!Number.isFinite(a) || a <= 0)) continue;

      const sol = candles[i - 2];
      const orta = i - 1;
      const sag = candles[i];

      // Ortadaki mum enerjili olmalı — gürültü FVG'yi eleyen asıl filtre.
      if (p.requireDisplacement) {
        const bogaDisp = disp.bullish[orta] === 1;
        const ayiDisp = disp.bearish[orta] === 1;
        if (!bogaDisp && !ayiDisp) continue;
      }

      let yon = null;
      let alt = null;
      let ust = null;

      if (sag.low > sol.high) { yon = 'bullish'; alt = sol.high; ust = sag.low; }
      else if (sag.high < sol.low) { yon = 'bearish'; alt = sag.high; ust = sol.low; }
      if (!yon) continue;

      // LuxAlgo koşulu: ortadaki mum boşluğun karşı kenarını kapanışla geçmeli.
      // Boğada `close[i-1] > high[i-2]` (alt kenar), ayıda `< low[i-2]` (üst).
      if (p.requireMidClose) {
        const ortaKapanis = candles[orta].close;
        if (yon === 'bullish' ? !(ortaKapanis > alt) : !(ortaKapanis < ust)) continue;
      }

      const boyut = ust - alt;

      // Eşik: ATR'ye mi fiyata mı oranlanıyor. Yüzde modlarında payda boşluğun
      // ALT kenarıdır — LuxAlgo boğada `high[2]`, ayıda `high` kullanır ve
      // ikisi de o boşluğun alt kenarıdır.
      if (p.thresholdMode === 'atr') {
        if (boyut < a * p.minGapAtr) continue;
      } else {
        const esik = p.thresholdMode === 'auto'
          ? (otoEsik[i] || 0)
          : (p.minGapPct / 100);
        if (!(alt > 0) || (boyut / alt) <= esik) continue;
      }

      gaps.push({
        id: sonrakiId++,
        direction: yon,
        low: alt,
        high: ust,
        mid: (alt + ust) / 2,      // CE — consequent encroachment
        index: i,                  // üçüncü mum: FVG burada bilinir
        time: sag.time,
        sizeAtr: (Number.isFinite(a) && a > 0) ? boyut / a : null,
        // LuxAlgo ölçüsü: boşluğun alt kenarına oranı.
        sizePct: alt > 0 ? (boyut / alt) * 100 : null,
        touches: 0,
        firstTouchAt: null,
        filledAt: null
      });
    }

    const activeBullish = new Array(n).fill(null);
    const activeBearish = new Array(n).fill(null);
    const nearestBullish = new Array(n).fill(null);
    const nearestBearish = new Array(n).fill(null);
    const inGap = new Array(n).fill(null);

    let gi = 0;
    const aktif = [];

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      while (gi < gaps.length && gaps[gi].index <= i) { aktif.push(gaps[gi]); gi++; }

      let bogaSayi = 0;
      let ayiSayi = 0;
      let enYakinBoga = null;
      let enYakinAyi = null;
      let icinde = 0;

      for (const g of aktif) {
        if (g.filledAt !== null) continue;
        // Oluştuğu bar kendini dolduramaz.
        if (i <= g.index) { if (g.direction === 'bullish') bogaSayi++; else ayiSayi++; continue; }

        const degdi = c.low <= g.high && c.high >= g.low;
        if (degdi) {
          g.touches += 1;
          if (g.firstTouchAt === null) g.firstTouchAt = i;
          icinde = 1;
        }

        let doldu = false;
        if (p.fill === 'touch') doldu = degdi;
        else if (p.fill === 'mid') doldu = g.direction === 'bullish' ? (c.low <= g.mid) : (c.high >= g.mid);
        else doldu = g.direction === 'bullish' ? (c.close < g.low) : (c.close > g.high);

        if (doldu) { g.filledAt = i; continue; }

        if (g.direction === 'bullish') {
          bogaSayi++;
          if (g.high <= c.close && (enYakinBoga === null || g.high > enYakinBoga)) enYakinBoga = g.high;
        } else {
          ayiSayi++;
          if (g.low >= c.close && (enYakinAyi === null || g.low < enYakinAyi)) enYakinAyi = g.low;
        }
      }

      activeBullish[i] = bogaSayi;
      activeBearish[i] = ayiSayi;
      nearestBullish[i] = enYakinBoga;
      nearestBearish[i] = enYakinAyi;
      inGap[i] = icinde;
    }

    const sonIndex = n - 1;
    const rapor = gaps.map(g => ({
      id: g.id,
      direction: g.direction,
      low: g.low,
      high: g.high,
      mid: g.mid,
      index: g.index,
      time: g.time,
      sizeAtr: g.sizeAtr,
      sizePct: g.sizePct,
      touches: g.touches,
      firstTouchAt: g.firstTouchAt,
      filledAt: g.filledAt,
      active: g.filledAt === null,
      ageBars: sonIndex - g.index
    }));

    /**
     * LuxAlgo panosunun karşılığı: sayım ve mitigasyon oranı.
     *
     * Mitigasyon oranı tek başına "iyi/kötü" demez ama tanımın ne kadar
     * seçici olduğunu gösterir: %100'e yakın oran, boşlukların neredeyse
     * hepsinin kapandığını yani sinyalin kalıcı bir seviye üretmediğini söyler.
     */
    const boga = rapor.filter(g => g.direction === 'bullish');
    const ayi = rapor.filter(g => g.direction === 'bearish');
    const dolan = (liste) => liste.filter(g => g.filledAt !== null).length;
    const oran = (a, b) => (b > 0 ? +((a / b) * 100).toFixed(2) : null);

    const stats = {
      bullCount: boga.length,
      bearCount: ayi.length,
      bullMitigated: dolan(boga),
      bearMitigated: dolan(ayi),
      bullMitigatedPct: oran(dolan(boga), boga.length),
      bearMitigatedPct: oran(dolan(ayi), ayi.length),
      activeCount: rapor.filter(g => g.filledAt === null).length,
      thresholdMode: p.thresholdMode,
      requireMidClose: !!p.requireMidClose,
      requireDisplacement: !!p.requireDisplacement
    };

    return {
      // `gaps` TÜM boşlukları taşır (dolanlar dahil) — IFVG onlara ihtiyaç duyar.
      gaps: rapor,
      stats,
      activeBullish: clean(activeBullish, n),
      activeBearish: clean(activeBearish, n),
      nearestBullish: clean(nearestBullish, n),
      nearestBearish: clean(nearestBearish, n),
      inGap: clean(inGap, n)
    };
  }
});

/**
 * Inversion FVG.
 *
 * Tamamen doldurulan bir FVG, karşı tarafta seviye olarak çalışmaya devam
 * eder: dolan boğa FVG'si artık direnç, dolan ayı FVG'si artık destektir.
 *
 * İLERİYE BAKMA: IFVG, kaynağın DOLDUĞU barda doğar (`filledAt`), oluştuğu
 * barda değil. Seriler ona göre doldurulur.
 */
register({
  key: 'ifvg',
  label: 'Inversion FVG',
  group: 'ict',
  kind: 'zones',
  outputs: ['inversions', 'activeBullish', 'activeBearish', 'inInversion'],
  seriesOutputs: ['activeBullish', 'activeBearish', 'inInversion'],
  dependsOn: ['fvg'],
  params: {
    atrPeriod: { type: 'number', default: 14, min: 1 },
    minGapAtr: { type: 'number', default: 0.25, min: 0 },
    requireDisplacement: { type: 'boolean', default: true },
    dispAtrMultiple: { type: 'number', default: 1.5, min: 0.1 },
    // Ters bölge kaç bar geçerli kalsın (0 = süresiz)
    maxAgeBars: { type: 'number', default: 200, min: 0 },
    maxActive: { type: 'number', default: 20, min: 1 }
  },
  warmup: (p) => p.atrPeriod + 5,
  note: 'Ters bölge, kaynak FVG DOLDUĞU barda doğar. Yön ters çevrilir: dolan boğa FVG → ayı (direnç).',
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const kaynak = ctx.computeOne('fvg', {
      atrPeriod: p.atrPeriod,
      minGapAtr: p.minGapAtr,
      requireDisplacement: p.requireDisplacement,
      dispAtrMultiple: p.dispAtrMultiple,
      fill: 'through'
    });

    const inversions = kaynak.gaps
      .filter(g => g.filledAt !== null)
      .map(g => ({
        id: g.id,
        sourceDirection: g.direction,
        direction: g.direction === 'bullish' ? 'bearish' : 'bullish',
        low: g.low,
        high: g.high,
        bornAt: g.filledAt,
        sourceIndex: g.index,
        touches: 0,
        invalidatedAt: null
      }))
      .sort((a, b) => a.bornAt - b.bornAt);

    const activeBullish = new Array(n).fill(null);
    const activeBearish = new Array(n).fill(null);
    const inInversion = new Array(n).fill(null);

    let ii = 0;
    const aktif = [];

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      while (ii < inversions.length && inversions[ii].bornAt <= i) { aktif.push(inversions[ii]); ii++; }

      let boga = 0;
      let ayi = 0;
      let icinde = 0;

      for (const z of aktif) {
        if (z.invalidatedAt !== null) continue;
        if (p.maxAgeBars > 0 && (i - z.bornAt) > p.maxAgeBars) { z.invalidatedAt = i; continue; }

        if (c.low <= z.high && c.high >= z.low) { z.touches += 1; icinde = 1; }

        // Ters bölge de kırılabilir: yönünün aksine kapanış onu geçersiz kılar.
        const kirildi = z.direction === 'bullish' ? (c.close < z.low) : (c.close > z.high);
        if (kirildi) { z.invalidatedAt = i; continue; }

        if (z.direction === 'bullish') boga++; else ayi++;
      }

      activeBullish[i] = boga;
      activeBearish[i] = ayi;
      inInversion[i] = icinde;
    }

    const sonIndex = n - 1;
    return {
      inversions: inversions
        .filter(z => z.invalidatedAt === null)
        .map(z => ({ ...z, active: true, ageBars: sonIndex - z.bornAt }))
        .sort((a, b) => b.bornAt - a.bornAt)
        .slice(0, Math.floor(p.maxActive)),
      activeBullish: clean(activeBullish, n),
      activeBearish: clean(activeBearish, n),
      inInversion: clean(inInversion, n)
    };
  }
});

/**
 * BPR — Balanced Price Range.
 *
 * Zıt yönlü iki FVG'nin ÇAKIŞTIĞI bölge. Fiyat aynı aralığı hem yukarı hem
 * aşağı dengesizlikle geçtiği için, o aralık iki taraflı bir denge bölgesi
 * sayılır.
 *
 * İLERİYE BAKMA: BPR, İKİNCİ FVG'nin oluştuğu barda bilinir.
 */
register({
  key: 'bpr',
  label: 'Balanced Price Range',
  group: 'ict',
  kind: 'zones',
  outputs: ['zones', 'active', 'inBpr'],
  seriesOutputs: ['active', 'inBpr'],
  dependsOn: ['fvg'],
  params: {
    atrPeriod: { type: 'number', default: 14, min: 1 },
    minGapAtr: { type: 'number', default: 0.25, min: 0 },
    requireDisplacement: { type: 'boolean', default: true },
    dispAtrMultiple: { type: 'number', default: 1.5, min: 0.1 },
    // İki FVG arasındaki en fazla bar mesafesi — çok uzak çakışmalar tesadüftür.
    maxPairDistance: { type: 'number', default: 30, min: 1 },
    // Bölge kaç bar sonra düşer (0 = süresiz). BPR'ın ömrü YOKTU: bir kez
    // oluşan bölge sonsuza dek "aktif" kalıyor ve grafikte hiç bitmiyordu.
    maxAgeBars: { type: 'number', default: 200, min: 0 },
    maxActive: { type: 'number', default: 10, min: 1 }
  },
  warmup: (p) => p.atrPeriod + 5,
  compute: (candles, p, ctx) => {
    const n = candles.length;
    const kaynak = ctx.computeOne('fvg', {
      atrPeriod: p.atrPeriod,
      minGapAtr: p.minGapAtr,
      requireDisplacement: p.requireDisplacement,
      dispAtrMultiple: p.dispAtrMultiple,
      fill: 'through'
    });

    const zones = [];
    const gaps = kaynak.gaps;

    for (let a = 0; a < gaps.length; a++) {
      for (let b = a + 1; b < gaps.length; b++) {
        const g1 = gaps[a];
        const g2 = gaps[b];
        if (g1.direction === g2.direction) continue;
        if (g2.index - g1.index > p.maxPairDistance) break;

        const ort = overlap(g1, g2);
        if (!ort) continue;

        zones.push({
          low: ort.low,
          high: ort.high,
          // İkinci FVG'nin barı: BPR burada bilinir.
          index: g2.index,
          time: candles[g2.index] ? candles[g2.index].time : null,
          bullishId: g1.direction === 'bullish' ? g1.id : g2.id,
          bearishId: g1.direction === 'bearish' ? g1.id : g2.id,
          touches: 0,
          touched: false,
          invalidatedAt: null
        });
      }
    }

    zones.sort((x, y) => x.index - y.index);

    const active = new Array(n).fill(null);
    const inBpr = new Array(n).fill(null);

    let zi = 0;
    const aktif = [];

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      while (zi < zones.length && zones[zi].index <= i) { aktif.push(zones[zi]); zi++; }

      let sayi = 0;
      let icinde = 0;
      for (const z of aktif) {
        if (z.invalidatedAt !== null) continue;

        // Yaş sınırı: eski bir denge bölgesi artık referans değildir.
        if (p.maxAgeBars > 0 && (i - z.index) > p.maxAgeBars) { z.invalidatedAt = i; continue; }

        const degdi = i > z.index && c.low <= z.high && c.high >= z.low;
        if (degdi) { z.touches += 1; z.touched = true; icinde = 1; }

        /**
         * ÖLÜM KURALI: bölgeye DOKUNULDUKTAN sonra bir bar tamamen dışında
         * kapanırsa denge çözülmüş sayılır. Dokunuş şartı olmadan kural işe
         * yaramazdı — fiyat zaten çoğu zaman dar bir bölgenin dışındadır ve
         * bölge doğar doğmaz ölürdü.
         */
        if (z.touched && (c.close > z.high || c.close < z.low)) { z.invalidatedAt = i; continue; }

        sayi++;
      }

      active[i] = sayi;
      inBpr[i] = icinde;
    }

    const sonIndex = n - 1;
    return {
      zones: zones
        .map(z => ({ ...z, active: z.invalidatedAt === null, ageBars: sonIndex - z.index }))
        .sort((x, y) => y.index - x.index)
        .slice(0, Math.floor(p.maxActive)),
      active: clean(active, n),
      inBpr: clean(inBpr, n)
    };
  }
});

module.exports = { overlap };
