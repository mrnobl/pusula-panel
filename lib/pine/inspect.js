/**
 * PINE İNCELEME — ağaçtan bildirim, parametreler ve destek raporu.
 *
 * Bu katman ÇALIŞTIRMADAN önce şunları söyler:
 *   · Bu bir `strategy` mi `indicator` mü, adı ne, varsayılan komisyonu ne?
 *   · Hangi `input.*` çağrıları var → panelin parametre formu bunlardan üretilir
 *   · Kullanılan yerleşiklerin hangileri DESTEKLENİYOR, hangileri desteklenmiyor?
 *
 * Üçüncü madde bu dosyanın var oluş sebebi: kullanıcı "kaydet" demeden ÖNCE
 * neyin çevrilemeyeceğini görmeli. Yarısı çevrilmiş bir strateji, sessizce
 * yanlış sayı üretir.
 */
const { parse } = require('./parser');
const { taAdlari, mathAdlari } = require('./builtins');

/**
 * DESTEKLENEN YERLEŞİKLER.
 *
 * Liste bilinçli olarak DAR. Bir işlev buraya ancak DAVRANIŞI DOĞRULANDIKTAN
 * sonra eklenir; "muhtemelen şuna denk" diye eklenen her giriş sessiz hata
 * riskidir. Değeri `null` olanlar tanınır ama çizim/bilgi amaçlıdır ve
 * çalıştırmada YOK SAYILIR (sonucu etkilemez).
 */
const DESTEKLENEN = {
  // Seri değişkenleri
  seriler: new Set([
    'open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4', 'hlcc4',
    'bar_index', 'time', 'time_close', 'na'
  ]),

  /**
   * `ta.*` ve `math.*` listeleri `builtins.js`ten GELİR, burada tekrarlanmaz.
   *
   * Elle ikinci bir liste tutmak, `catalog.js` öncesindeki hatanın aynısı
   * olurdu: inceleme "destekliyorum" der, çalışma zamanında karşılığı
   * bulunmaz. Tek kaynak, gerçeklemenin kendisidir.
   *
   * Bilinçli olarak DIŞARIDA bırakılanlar: `ta.sar`, `ta.adx`, `ta.dmi`,
   * `ta.linreg`, `ta.pivothigh/pivotlow`, `math.random`. İlk beşi henüz
   * gerçeklenmedi; `pivot*` ayrıca ileriye bakma riski taşır (uç, N bar
   * SONRA onaylanır). `math.random` bir backtest aracında yasak: aynı veriyle
   * iki koşu farklı sonuç verirdi.
   */
  ta: taAdlari(),
  math: mathAdlari(),

  // strategy.* — işlem çağrıları
  strategy: new Set([
    'entry', 'exit', 'close', 'close_all', 'cancel', 'cancel_all',
    'long', 'short', 'position_size', 'position_avg_price',
    'opentrades', 'closedtrades', 'equity', 'netprofit',
    'commission', 'percent_of_equity', 'fixed', 'cash', 'direction'
  ]),

  /**
   * SONUCU ETKİLEMEYEN aileler — çalıştırmada atlanır.
   *
   * Liste DAR tutulmalı. Buraya konan her ad "bu çağrıyı yok saysak da
   * backtest sonucu aynı kalır" iddiasıdır. İddia yanlışsa sessiz hata olur.
   * Bu yüzden yalnızca çizim, biçimlendirme ve görsel sabitler var:
   * `request.*` (başka zaman dilimi/sembol verisi), `barstate.*` (çalıştırma
   * anını değiştirir), `syminfo.*`, `timeframe.*`, `array.*` gibi aileler
   * BİLİNÇLİ OLARAK dışarıda — hepsi sonucu değiştirebilir, bu yüzden
   * desteklenene kadar açıkça reddedilirler.
   */
  cizim: new Set([
    'plot', 'plotshape', 'plotchar', 'plotarrow', 'plotbar', 'plotcandle',
    'bgcolor', 'barcolor', 'fill', 'hline', 'alertcondition', 'alert',
    'label', 'line', 'box', 'table', 'linefill', 'polyline', 'log'
  ]),

  /**
   * `str.*` — gerçeklenen metin işlevleri.
   *
   * Sabit ailesinden ÇIKARILDI: `str.tostring` emir kimliği üretmekte
   * kullanılıyor (`"SO" + str.tostring(i)`), yani sonucu etkiliyor. Sabit
   * sayılıp `na` döndüğünde bütün güvenlik emirleri aynı kimliği alıp
   * birbirini eziyordu.
   */
  str: new Set([
    'tostring', 'format', 'length', 'upper', 'lower', 'contains',
    'startswith', 'endswith', 'substring', 'replace_all', 'tonumber'
  ]),

  /** Değer üretir ama yan etkisi yoktur: renk, görsel sabitler. */
  sabit: new Set([
    'color', 'size', 'shape', 'location', 'extend', 'xloc', 'yloc',
    'position', 'format', 'scale', 'display', 'currency', 'order', 'adjustment',
    'font', 'text'
  ]),

  /** Bildirim çağrıları — ayrıca ele alınır. */
  bildirim: new Set(['indicator', 'strategy', 'library', 'input']),

  /**
   * Tip dönüşümü: `int(x)`, `float(na)`, `bool(x)`.
   * Pine'da tip adı aynı zamanda dönüştürücü işlevdir; `float(na)` deyimi
   * `var float x = float(na)` kalıbında sık geçer.
   */
  donusum: new Set(['int', 'float', 'bool', 'string', 'color']),

  /** Ad alanı olmayan küresel yardımcılar. */
  kuresel: new Set(['na', 'nz'])
};

/**
 * İŞLEM ÇAĞRILARININ ADLI ARGÜMANLARI (Pusula P4).
 *
 * Köprü (`strategy.js`) yalnız buradaki argümanları OKUR. Listede olmayan bir argüman
 * (ör. `strategy.exit(trail_points = …)`, `strategy.entry(stop = …)`, `profit = …`)
 * eskiden sessizce yok sayılıyordu: betik derleniyor, backtest koşuyor, ama ölçülen şey
 * başka bir stratejiydi. Artık satır numarasıyla reddedilir. `comment`/`alert_*` yalnız
 * etiket — sonucu değiştirmez.
 */
const ETIKET = ['comment', 'alert_message', 'disable_alert'];
const ISLEM_ARGUMANLARI = {
  entry: {
    izin: new Set(['id', 'direction', 'limit', 'qty', 'long', ...ETIKET]),
    neden: {
      stop: 'stop emirli giriş (strategy.entry stop=) desteklenmiyor — yalnız piyasa ve limit giriş',
      when: '`when=` v4 kalıntısı — koşulu `if` ile yazın',
      oca_name: 'OCA grupları desteklenmiyor', oca_type: 'OCA grupları desteklenmiyor'
    }
  },
  exit: {
    izin: new Set(['id', 'from_entry', 'stop', 'limit', ...ETIKET, 'comment_profit', 'comment_loss', 'comment_trailing', 'alert_profit', 'alert_loss', 'alert_trailing']),
    neden: {
      trail_points: 'takip eden stop desteklenmiyor (Pine bar içinde, motor bar sonunda uygular — sonuç farklı olur)',
      trail_offset: 'takip eden stop desteklenmiyor (Pine bar içinde, motor bar sonunda uygular — sonuç farklı olur)',
      trail_price: 'takip eden stop desteklenmiyor (Pine bar içinde, motor bar sonunda uygular — sonuç farklı olur)',
      profit: 'tik cinsinden hedef (profit=) desteklenmiyor — fiyat olarak limit= kullanın',
      loss: 'tik cinsinden stop (loss=) desteklenmiyor — fiyat olarak stop= kullanın',
      qty: 'kısmi çıkış (strategy.exit qty=) desteklenmiyor', qty_percent: 'kısmi çıkış (strategy.exit qty_percent=) desteklenmiyor',
      when: '`when=` v4 kalıntısı — koşulu `if` ile yazın'
    }
  },
  close: {
    izin: new Set(['id', 'qty_percent', ...ETIKET]),
    neden: { qty: 'adetle kısmi kapatma (qty=) desteklenmiyor — qty_percent kullanın', immediately: 'immediately= desteklenmiyor (motor bar kapanışında kapatır)', when: '`when=` v4 kalıntısı — koşulu `if` ile yazın' }
  },
  close_all: {
    izin: new Set([...ETIKET]),
    neden: { immediately: 'immediately= desteklenmiyor (motor bar kapanışında kapatır)', when: '`when=` v4 kalıntısı — koşulu `if` ile yazın' }
  }
};

/**
 * KONUMLA VERİLEN ARGÜMANLAR (Pusula P4 sınaması).
 *
 * Köprü yalnız ilk konumları (`id`, `direction` / `from_entry`) konumla okur; geri kalan her
 * argümanı ADLA arar. `strategy.entry("L", strategy.long, na, na, high)` gibi konumla verilmiş
 * bir stop/limit/qty/profit eskiden hiç okunmuyordu ve denetim de sessizdi — stop emirli giriş
 * piyasa girişi olarak koşuyordu. Konum Pine v5 imzasıyla ada çevrilir; köprünün konumla
 * okumadığı ve değeri `na` olmayan her argüman satır numarasıyla reddedilir (adla yazılınca
 * yukarıdaki ISLEM_ARGUMANLARI kuralı uygulanır). Etiket argümanları (comment…) sonucu
 * değiştirmez, konumla da serbest.
 */
const ISLEM_IMZASI = {
  entry: { okunan: 2, sira: ['id', 'direction', 'qty', 'limit', 'stop', 'oca_name', 'oca_type', 'comment', 'alert_message', 'disable_alert'] },
  exit: { okunan: 2, sira: ['id', 'from_entry', 'qty', 'qty_percent', 'profit', 'limit', 'loss', 'stop', 'trail_price', 'trail_points', 'trail_offset', 'oca_name', 'comment', 'comment_profit', 'comment_loss', 'comment_trailing', 'alert_message', 'alert_profit', 'alert_loss', 'alert_trailing', 'disable_alert'] },
  close: { okunan: 1, sira: ['id', 'comment', 'qty', 'qty_percent', 'alert_message', 'immediately', 'disable_alert'] },
  close_all: { okunan: 0, sira: ['comment', 'alert_message', 'immediately', 'disable_alert'] }
};
const KONUMLA_SERBEST = new Set(['comment', 'alert_message', 'disable_alert', 'comment_profit', 'comment_loss', 'comment_trailing', 'alert_profit', 'alert_loss', 'alert_trailing']);

/** `input.int(...)` → panel parametre şeması karşılığı. */
const INPUT_TIP = {
  'int': 'number',
  'float': 'number',
  'bool': 'boolean',
  'string': 'enum',
  'color': 'color',
  'timeframe': 'string',
  'symbol': 'string',
  'source': 'enum',
  'session': 'string',
  'price': 'number',
  'time': 'number',
  'text_area': 'string'
};

/** Ağacı gezer, her düğüm için `ziyaretci` çağırır. */
function gez(dugum, ziyaretci) {
  if (!dugum || typeof dugum !== 'object') return;
  if (Array.isArray(dugum)) { dugum.forEach(d => gez(d, ziyaretci)); return; }
  if (dugum.tip) ziyaretci(dugum);
  for (const k of Object.keys(dugum)) {
    if (k === 'tip') continue;
    gez(dugum[k], ziyaretci);
  }
}

/** `a.b.c` biçimindeki üye zincirini düz metne çevirir; değilse null. */
function yolAdi(dugum) {
  if (!dugum) return null;
  if (dugum.tip === 'Ad') return dugum.ad;
  if (dugum.tip === 'Uye') {
    const on = yolAdi(dugum.nesne);
    return on ? `${on}.${dugum.ad}` : null;
  }
  return null;
}

/** Sabit ifadeyi JS değerine indirger; sabit değilse `undefined`. */
function sabitDeger(dugum) {
  if (!dugum) return undefined;
  switch (dugum.tip) {
    case 'Sayi': return dugum.deger;
    case 'Metin': return dugum.deger;
    case 'Mantik': return dugum.deger;
    case 'Renk': return dugum.deger;
    case 'Na': return null;
    case 'Birli':
      if (dugum.op === '-') {
        const i = sabitDeger(dugum.deger);
        return typeof i === 'number' ? -i : undefined;
      }
      return undefined;
    case 'Demet': {
      const l = dugum.ogeler.map(sabitDeger);
      return l.some(x => x === undefined) ? undefined : l;
    }
    case 'Uye': {
      // `color.red`, `strategy.long` gibi sabitler metin olarak taşınır.
      const yol = yolAdi(dugum);
      return yol || undefined;
    }
    default: return undefined;
  }
}

/** Argüman listesinden konum ya da ada göre değer alır. */
function arg(argumanlar, sira, ad) {
  if (ad) {
    const adli = argumanlar.find(a => a.ad === ad);
    if (adli) return adli.deger;
  }
  // Adlandırılmış argümanlar konum sayımını bozmasın diye yalnızca adsızlar sayılır.
  const adsiz = argumanlar.filter(a => !a.ad);
  return adsiz[sira] ? adsiz[sira].deger : undefined;
}

/**
 * Kaynağı inceler.
 *
 * @returns {{
 *   tur: 'strategy'|'indicator'|null, ad: string|null, version: number|null,
 *   inputs: Array, paramSchema: Object,
 *   desteklenmeyen: Array, uyarilar: Array, agac: Object
 * }}
 */
function inspect(kaynak) {
  const agac = parse(kaynak);

  const sonuc = {
    tur: null,
    ad: null,
    version: agac.version,
    bildirimArgumanlari: {},
    inputs: [],
    paramSchema: {},
    desteklenmeyen: [],
    uyarilar: [],
    agac
  };

  /**
   * SÜRÜM DENETİMİ ÖNCE GELİR.
   *
   * v4 ile v5 arasındaki fark söz dizimi değil, İSİM ALANIDIR: v4'te
   * göstergeler kürsel (`rsi(close,7)`), v5'te ad alanlı (`ta.rsi(...)`).
   * Aynı şey `security`/`request.security`, `tostring`/`str.tostring`,
   * `input(x, type=...)`/`input.float(x)` için de geçerli.
   *
   * Sürümü söylemeden tek tek "tanınmayan çağrı" listelemek kullanıcıyı
   * yanlış yere bakmaya iter — sorun eksik bir işlev değil, yanlış sürümdür.
   */
  if (agac.version !== null && agac.version < 5) {
    sonuc.surumUyumsuz = agac.version;
    sonuc.uyarilar.push(
      `Bu betik Pine v${agac.version} — desteklenen sürüm v5. `
      + 'v4 göstergeleri ad alanı KULLANMAZ (`rsi()` ↔ `ta.rsi()`, `security()` ↔ '
      + '`request.security()`, `tostring()` ↔ `str.tostring()`, '
      + '`input(x, type=input.float)` ↔ `input.float(x)`). '
      + 'TradingView düzenleyicisinde betiği açıp "Convert code to v5" ile '
      + 'dönüştürdükten sonra tekrar deneyin.');
  } else if (agac.version !== null && agac.version > 5) {
    sonuc.uyarilar.push(`//@version=${agac.version} — yalnızca v5 sınandı, v${agac.version} beklenmedik davranabilir.`);
  }
  if (agac.version === null) {
    sonuc.uyarilar.push('`//@version=5` satırı yok — v5 varsayıldı.');
  }

  // Kullanıcının kendi tanımladığı fonksiyonlar yerleşik sayılmamalı.
  const kullaniciFonksiyonlari = new Set();
  gez(agac, d => { if (d.tip === 'FonksiyonTanimi') kullaniciFonksiyonlari.add(d.ad); });

  const inputSayaci = new Map();

  /**
   * ÇAĞRI OLMAYAN üye erişimleri de denetlenmeli: `barstate.islast`,
   * `syminfo.mintick`, `timeframe.period` çağrı değil, düz değerdir.
   *
   * Bu denetim eklenmeden önce çalışma zamanı böyle bir yol için yolun
   * KENDİSİNİ (boş olmayan bir metin) döndürüyordu — `if barstate.islast`
   * her bar DOĞRU oluyordu. Sessiz ve pahalı bir hata.
   */
  const cagriHedefleri = new Set();
  gez(agac, d => { if (d.tip === 'Cagri' && d.hedef) cagriHedefleri.add(d.hedef); });

  const SABIT_KOKLER = new Set([
    'color', 'line', 'label', 'box', 'table', 'shape', 'size', 'location',
    'position', 'format', 'extend', 'xloc', 'yloc', 'scale', 'display',
    'font', 'text', 'plot', 'hline', 'currency', 'order', 'adjustment',
    'linefill', 'polyline', 'math', 'ta'
  ]);
  /**
   * `barstate.*` — geçmiş veri üzerinde anlamı kesin olanlar gerçeklendi.
   * `isconfirmed` backtest'te hep doğru (her bar kapalı), `isrealtime` hep
   * yanlış. Canlı grafikteki anlamlarıyla aynı değildir; bu bilinçli.
   */
  const BARSTATE = new Set([
    'isfirst', 'islast', 'isconfirmed', 'ishistory', 'isrealtime', 'isnew',
    'islastconfirmedhistory'
  ]);

  /** Anlamı olan ve gerçeklenmiş `strategy.*` değerleri. */
  const STRATEJI_DEGERLERI = new Set([
    'long', 'short', 'position_size', 'position_avg_price',
    'equity', 'initial_capital', 'opentrades',
    'commission', 'percent_of_equity', 'fixed', 'cash', 'direction',
    'oca', 'fixed_qty'
  ]);

  gez(agac, d => {
    if (d.tip !== 'Uye' || cagriHedefleri.has(d)) return;
    const yol = yolAdi(d);
    if (!yol) return;
    const [kok, uye] = yol.split('.');
    if (SABIT_KOKLER.has(kok)) return;
    if (kok === 'barstate') {
      if (!BARSTATE.has(uye)) {
        sonuc.desteklenmeyen.push({ satir: d.satir || null, ad: yol, sebep: `barstate.${uye} desteklenmiyor` });
      }
      return;
    }
    if (kok === 'strategy') {
      if (!STRATEJI_DEGERLERI.has(uye)) {
        sonuc.desteklenmeyen.push({ satir: d.satir || null, ad: yol, sebep: `strategy.${uye} değeri desteklenmiyor` });
      }
      return;
    }
    if (kullaniciFonksiyonlari.has(kok)) return;
    sonuc.desteklenmeyen.push({ satir: d.satir || null, ad: yol, sebep: 'desteklenmeyen değer' });
  });

  gez(agac, d => {
    if (d.tip !== 'Cagri') return;
    const yol = yolAdi(d.hedef);
    if (!yol) return;

    const parcalar = yol.split('.');
    const kok = parcalar[0];
    const uye = parcalar[1] || null;

    // 1) Bildirim: strategy(...) / indicator(...)
    if ((kok === 'strategy' || kok === 'indicator') && parcalar.length === 1) {
      sonuc.tur = kok;
      sonuc.ad = sabitDeger(arg(d.argumanlar, 0, 'title')) || null;
      for (const a of d.argumanlar) {
        if (!a.ad) continue;
        const v = sabitDeger(a.deger);
        if (v !== undefined) sonuc.bildirimArgumanlari[a.ad] = v;
      }
      return;
    }

    // 2) input.* → parametre
    if (kok === 'input') {
      const inputTip = uye || 'source';
      const semaTip = INPUT_TIP[inputTip];
      if (!semaTip) {
        sonuc.desteklenmeyen.push({
          satir: d.satir || null,
          ad: yol,
          sebep: `input.${inputTip} desteklenmiyor`
        });
        return;
      }
      const varsayilan = sabitDeger(arg(d.argumanlar, 0, 'defval'));
      const baslik = sabitDeger(arg(d.argumanlar, 1, 'title'));
      const secenekler = sabitDeger(arg(d.argumanlar, undefined, 'options'));
      const minval = sabitDeger(arg(d.argumanlar, undefined, 'minval'));
      const maxval = sabitDeger(arg(d.argumanlar, undefined, 'maxval'));
      const step = sabitDeger(arg(d.argumanlar, undefined, 'step'));
      const grup = sabitDeger(arg(d.argumanlar, undefined, 'group'));
      const ipucu = sabitDeger(arg(d.argumanlar, undefined, 'tooltip'));

      sonuc.inputs.push({
        pineTip: inputTip,
        semaTip: Array.isArray(secenekler) ? 'enum' : semaTip,
        varsayilan, baslik, secenekler, minval, maxval, step, grup, ipucu,
        satir: d.satir || null
      });
      inputSayaci.set(inputTip, (inputSayaci.get(inputTip) || 0) + 1);
      return;
    }

    // 3) Yerleşik ad denetimi
    if (kullaniciFonksiyonlari.has(yol) || kullaniciFonksiyonlari.has(kok)) return;

    // Üyesi denetlenen aileler: kök tanınır, üye listede olmalı.
    if (kok === 'str') {
      if (uye && !DESTEKLENEN.str.has(uye)) {
        sonuc.desteklenmeyen.push({ satir: d.satir || null, ad: yol, sebep: `str.${uye} desteklenmiyor` });
      }
      return;
    }
    if (kok === 'ta' || kok === 'math' || kok === 'strategy') {
      const kume = DESTEKLENEN[kok];
      if (uye && !kume.has(uye)) {
        sonuc.desteklenmeyen.push({ satir: d.satir || null, ad: yol, sebep: `${kok}.${uye} desteklenmiyor` });
      }
      // İşlem çağrısının ADLI ARGÜMANI da desteklenmeli (bkz. ISLEM_ARGUMANLARI).
      if (kok === 'strategy' && uye && ISLEM_ARGUMANLARI[uye]) {
        const kural = ISLEM_ARGUMANLARI[uye];
        for (const a of d.argumanlar || []) {
          if (!a.ad || kural.izin.has(a.ad)) continue;
          sonuc.desteklenmeyen.push({
            satir: d.satir || null,
            ad: `${yol}(${a.ad}=…)`,
            sebep: kural.neden[a.ad] || `${a.ad}= argümanı motor köprüsünde uygulanmıyor`
          });
        }
        // Konumla verilenler (bkz. ISLEM_IMZASI): köprü okumuyorsa açık ret.
        const imza = ISLEM_IMZASI[uye];
        const konumlu = (d.argumanlar || []).filter(a => !a.ad);
        konumlu.forEach((a, k) => {
          if (k < imza.okunan) return;
          if (a.deger && a.deger.tip === 'Na') return;
          const ad = imza.sira[k] || `#${k + 1}`;
          if (KONUMLA_SERBEST.has(ad)) return;
          sonuc.desteklenmeyen.push({
            satir: d.satir || null,
            ad: `${yol}(${k + 1}. argüman: ${ad})`,
            sebep: kural.neden[ad] || `konumla verilen ${ad} köprüde okunmuyor — adla yazın (${ad} = …)`
          });
        });
      }
      return;
    }

    if (DESTEKLENEN.cizim.has(kok)) return;
    if (DESTEKLENEN.sabit.has(kok)) return;
    if (parcalar.length === 1 && DESTEKLENEN.donusum.has(kok)) return;
    if (parcalar.length === 1 && DESTEKLENEN.kuresel.has(kok)) return;
    if (DESTEKLENEN.bildirim.has(kok)) return;
    if (DESTEKLENEN.seriler.has(kok)) return;

    sonuc.desteklenmeyen.push({
      satir: d.satir || null,
      ad: yol,
      sebep: 'tanınmayan çağrı'
    });
  });

  // input.* çağrılarını panel şemasına çevir. Ad çakışmasını önlemek için
  // başlıktan üretilen anahtar tekilleştirilir — Pine'da iki input aynı
  // başlığı taşıyabilir, panel formunda taşıyamaz.
  const kullanilan = new Set();
  for (const inp of sonuc.inputs) {
    let anahtar = anahtarlastir(inp.baslik || `p${sonuc.inputs.indexOf(inp) + 1}`);
    let n = 2;
    while (kullanilan.has(anahtar)) anahtar = `${anahtarlastir(inp.baslik || 'p')}_${n++}`;
    kullanilan.add(anahtar);
    inp.anahtar = anahtar;

    const sema = { type: inp.semaTip, default: inp.varsayilan, label: inp.baslik || anahtar };
    if (inp.grup) sema.group = inp.grup;
    if (inp.ipucu) sema.description = inp.ipucu;
    if (Array.isArray(inp.secenekler)) sema.values = inp.secenekler;
    if (typeof inp.minval === 'number') sema.min = inp.minval;
    if (typeof inp.maxval === 'number') sema.max = inp.maxval;
    if (typeof inp.step === 'number') sema.step = inp.step;
    sonuc.paramSchema[anahtar] = sema;
  }

  if (!sonuc.tur) {
    sonuc.uyarilar.push('`strategy(...)` ya da `indicator(...)` bildirimi bulunamadı.');
  }
  if (sonuc.tur === 'indicator') {
    sonuc.uyarilar.push('Bu bir GÖSTERGE — işlem açmaz. Backtest için `strategy(...)` bildirimi gerekir.');
  }
  /**
   * BİLİNEN MODEL FARKLARI — hata değil, ölçek/zamanlama farkı; kullanıcı TradingView sonucuyla
   * kıyaslarken bilsin diye denetim raporunda AÇIKÇA yazılır (Pusula P4).
   */
  if (sonuc.tur === 'strategy') {
    const b = sonuc.bildirimArgumanlari;
    if (b.process_orders_on_close !== true) {
      sonuc.uyarilar.push('Dolum zamanı: panel motoru emri sinyal barının KAPANIŞINDA doldurur; TradingView varsayılanı bir sonraki barın AÇILIŞI. İşlem tarihleri bir bar kayar, getiri biraz farklı çıkar (işlem sayısı aynı kalır).');
    }
    if (b.default_qty_type !== undefined || b.default_qty_value !== undefined || b.initial_capital !== undefined) {
      sonuc.uyarilar.push('Pozisyon büyüklüğü ve başlangıç sermayesi betikten değil panelden gelir (`allocationPct` parametresi, Backtest formundaki sermaye).');
    }
    if (b.commission_value !== undefined || b.slippage !== undefined) {
      sonuc.uyarilar.push('Komisyon ve kayma betikten değil motorun maliyet modelinden gelir.');
    }
  }

  return sonuc;
}

/** Başlıktan güvenli parametre anahtarı: Türkçe karakterler de dahil. */
function anahtarlastir(metin) {
  const harita = { 'ı': 'i', 'İ': 'i', 'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g', 'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c' };
  const sade = String(metin).replace(/[ıİşŞğĞüÜöÖçÇ]/g, c => harita[c] || c);
  const anahtar = sade
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'p$1');
  return anahtar || 'param';
}

module.exports = { inspect, gez, yolAdi, sabitDeger, arg, DESTEKLENEN, anahtarlastir };
