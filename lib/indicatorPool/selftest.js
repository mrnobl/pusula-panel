/**
 * Havuz sözleşmesi testi.
 *
 * Kayıtlı her göstergeyi çalıştırıp hizalama, tip ve ısınma davranışını
 * doğrular. ADX'in 200 mum için 173 değer döndürmesi bu testten geçemezdi —
 * havuzun yazılma sebebi buydu, o yüzden test havuzun içinde duruyor.
 *
 * Çalıştırma:  node lib/indicators/selftest.js
 */

const pool = require('./index');
const registry = require('./registry');
const { resolveRender } = require('./render');

/** Tekrarlanabilir sözde-rastgele üreteç — test kararlı kalsın. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Gerçekçi sentetik mum serisi.
 *
 * İlk sürüm fazla düzdü: her mumun aralığı birbirinin aynısıydı (aralık/ATR
 * 0.68–1.11) ve gövde oranı 0.12'yi geçmiyordu. Sonuç olarak `displacement`
 * 300 barda SIFIR olay üretiyordu — gösterge doğru çalışıyordu ama test
 * verisinde tetikleyecek hiçbir şey yoktu. ICT göstergelerinin tamamı aynı
 * duvara çarpardı.
 *
 * Şimdi gerçek BTC profiline yaklaştırılmış: değişken gövde oranı,
 * volatilite kümelenmesi ve arada enerjili mumlar (gerçek veride aralık/ATR
 * medyan ~0.84, maks ~5.0; gövde oranı medyan ~0.46).
 *
 * `seed` çok sembollü testler için: aynı tohumla üretilen iki seri yalnızca
 * fiyat ölçeğinde farklı olur (korelasyonları tam 1 çıkar) ve korelasyon
 * göstergesini test etmez.
 */
function makeCandles(n = 300, basePrice = 100, seed = 20260812) {
  const rand = rng(seed);
  const out = [];
  let price = basePrice;
  let vol = 0.008; // koşan volatilite

  for (let i = 0; i < n; i++) {
    // Volatilite kümelenmesi: yavaş değişen bir rejim.
    vol = Math.max(0.003, Math.min(0.03, vol * (0.92 + 0.16 * rand())));

    // Arada enerjili hareket — displacement/FVG/OB'nin tetikleyicisi.
    const impuls = rand() < 0.06;
    const buyukluk = impuls ? vol * (2.5 + 2 * rand()) : vol * (0.4 + 1.2 * rand());
    const yon = rand() < 0.5 ? -1 : 1;

    const open = price;
    const close = open * (1 + yon * buyukluk);

    // Gövde oranı 0.15–0.95 arasında değişsin: doji de var, kararlı mum da.
    const govdeOrani = impuls ? 0.65 + 0.3 * rand() : 0.15 + 0.6 * rand();
    const govde = Math.abs(close - open);
    const toplamAralik = govde / Math.max(0.05, govdeOrani);
    const fitilPayi = Math.max(0, toplamAralik - govde);
    const ustFitil = fitilPayi * rand();
    const altFitil = fitilPayi - ustFitil;

    const high = Math.max(open, close) + ustFitil;
    const low = Math.min(open, close) - altFitil;

    out.push({
      time: 1700000000000 + i * 3600000,
      open,
      high,
      low,
      close,
      // Enerjili mumlarda hacim de yüksek — hacim filtreleri test edilebilsin.
      volume: (60 + 120 * rand()) * (impuls ? 2.5 : 1)
    });

    price = close;
  }
  return out;
}

function run() {
  // 600 bar: bazı yapılar ZİNCİR gerektirir (FVG → dolum → ters çevrilme, ya da
  // iki zıt FVG'nin çakışması). 300 barda bu zincirler oluşmuyor ve gösterge
  // ölü sanılıyordu — gerçek BTC verisinde 2000 barda 106 FVG / 3 IFVG / 10 BPR
  // üretirken sentetikte sıfır çıkıyordu.
  const candles = makeCandles(600);
  // Düşük fiyatlı varlık: yuvarlama hatalarını yakalayan senaryo.
  const cheapCandles = makeCandles(600, 0.07);

  const defs = registry.all();
  let gecen = 0;
  const basarisiz = [];

  console.log(`Havuz sözleşme testi · ${defs.length} gösterge · ${candles.length} mum\n`);

  for (const def of defs) {
    if (def.multi) continue; // çok sembollü göstergeler ayrı test edilir

    const sorunlar = [];

    // 1. Normal fiyat
    let sonuc;
    try {
      sonuc = pool.computeOne(candles, def.key, {});
    } catch (e) {
      basarisiz.push({ key: def.key, sorunlar: [`çalıştırma hatası: ${e.message}`] });
      continue;
    }

    // 2. Düşük fiyatlı varlıkta çöküyor mu / sıfırlanıyor mu
    try {
      const ucuz = pool.computeOne(cheapCandles, def.key, {});
      if (def.kind === 'series') {
        for (const name of def.outputs) {
          const seri = ucuz[name] || [];
          const gecerli = seri.filter(v => Number.isFinite(v));
          const sifir = gecerli.filter(v => v === 0).length;
          // Tüm geçerli değerler sıfırsa yuvarlama çökmesi vardır.
          if (gecerli.length > 10 && sifir === gecerli.length) {
            sorunlar.push(`${name}: düşük fiyatlı varlıkta tüm değerler 0 (yuvarlama çökmesi?)`);
          }
        }
      }
    } catch (e) {
      sorunlar.push(`düşük fiyatlı varlıkta hata: ${e.message}`);
    }

    // 3. Isınma ve ÜRETİM kontrolü.
    //    `kind:'series'` dışındaki göstergelerin de hizalı serileri olabilir
    //    (`seriesOutputs`). Bu kontrol eskiden yalnızca 'series' tipine
    //    uygulanıyordu; `swings` 400 mumda sıfır nokta üretirken testten
    //    geçmişti çünkü tipi 'events'ti.
    const seriAdlari = def.kind === 'series' ? def.outputs : (def.seriesOutputs || []);
    const seyrek = new Set(def.sparseOutputs || []);
    if (seriAdlari.length) {
      const warmup = sonuc._meta.warmup;
      // Seyrek seriler (olay işaretçileri) süreklilik kontrolünden muaf:
      // tasarım gereği yalnızca olay barlarında değer taşırlar.
      for (const name of seriAdlari.filter(x => !seyrek.has(x))) {
        const seri = sonuc[name] || [];
        const ilkGecerli = seri.findIndex(v => Number.isFinite(v));
        if (ilkGecerli === -1) {
          sorunlar.push(`${name}: hiç geçerli değer üretmedi`);
        } else if (warmup > 0 && ilkGecerli > warmup + 5) {
          sorunlar.push(`${name}: ilk değer ${ilkGecerli}. barda ama warmup ${warmup} bildirilmiş`);
        }
      }
    }

    // 4. Olay/bölge üreten göstergeler gerçekten olay üretiyor mu?
    //    Boş liste "hiç kurulum yok" olabilir ama 300 barlık dalgalı seride
    //    sıfır çıktı, göstergenin ölü olduğunun işaretidir.
    if (def.kind === 'events' || def.kind === 'zones') {
      const listeler = def.outputs.filter(o => Array.isArray(sonuc[o]) && !seriAdlari.includes(o));
      const toplam = listeler.reduce((a, o) => a + sonuc[o].length, 0);
      if (listeler.length && toplam === 0) {
        sorunlar.push(`hiç ${def.kind} üretmedi (${candles.length} barlık dalgalı seride sıfır — ölü gösterge?)`);
      }
    }

    // 5. ÇİZİM BİLDİRİMİ — grafiğe bağlanınca ortaya çıkan üçüncü soru:
    //    bu çıktı nereye çizilir? RSI fiyat paneline düşerse eksen ezilir ve
    //    grafik kullanılamaz hâle gelir.
    //
    //    Sınıflandırmayı yazarın gözü değil KONTROLLÜ DENEY belirler: ucuz
    //    seri (fiyat 0.07) normal serinin (fiyat 100) birebir ölçeklenmiş
    //    hâlidir — aynı tohum, aynı getiriler, farklı taban fiyat. Fiyat
    //    ölçekli bir çıktı bu iki seride fiyatla AYNI oranda değişir; sayaç,
    //    oran, indeks ve osilatör değişmez. Ayrım budur.
    const render = resolveRender(def);
    const medyanOf = (arr) => {
      const s = arr.filter(Number.isFinite).map(Math.abs).filter(v => v > 0).sort((a, b) => a - b);
      return s.length ? s[s.length >> 1] : null;
    };
    const fiyatOrani = medyanOf(cheapCandles.map(c => c.close)) / medyanOf(candles.map(c => c.close));

    let ucuzSonuc = null;
    try { ucuzSonuc = pool.computeOne(cheapCandles, def.key, {}); } catch (e) { ucuzSonuc = null; }

    for (const name of def.outputs) {
      const h = render[name];
      if (!h) { sorunlar.push(`${name}: çizim bildirimi çözülemedi`); continue; }
      if (!['price', 'own'].includes(h.pane)) sorunlar.push(`${name}: geçersiz pane '${h.pane}'`);
      if (!['line', 'histogram', 'markers', 'zones', 'levels', 'none'].includes(h.as)) {
        sorunlar.push(`${name}: geçersiz çizim biçimi '${h.as}'`);
      }
      if (!h.series || !ucuzSonuc) continue;

      const normalMed = medyanOf(sonuc[name] || []);
      const ucuzMed = medyanOf(ucuzSonuc[name] || []);
      if (normalMed === null || ucuzMed === null) continue;

      const olcekOrani = ucuzMed / normalMed;
      const fiyatlaOlcekli = olcekOrani < fiyatOrani * 10 && olcekOrani > fiyatOrani / 10;

      // Fiyatla ölçeklenmek YETMEZ: MACD ve ATR de ölçeklenir ama fiyat
      // SEVİYESİ değil, fiyat FARKIdır. Mum 100'deyken ATR 0.8, MACD 0.1 —
      // fiyat eksenine konsalar en altta düz bir çizgi olarak görünürler.
      // Fiyat paneline yalnızca mumlarla aynı MERTEBEDE olanlar girer.
      const seviyeOrani = normalMed / medyanOf(candles.map(c => c.close));
      const fiyatSeviyesi = fiyatlaOlcekli && seviyeOrani > 0.2 && seviyeOrani < 5;

      if (fiyatSeviyesi && h.pane !== 'price') {
        sorunlar.push(`${name}: fiyat seviyesi (mumların ${seviyeOrani.toFixed(2)}× mertebesinde) ama '${h.pane}' paneline bildirilmiş — 'price' olmalı`);
      } else if (!fiyatSeviyesi && h.pane !== 'own') {
        const sebep = fiyatlaOlcekli
          ? `fiyat farkı/oranı (mumların ${seviyeOrani.toExponential(1)}× mertebesinde)`
          : `fiyattan bağımsız (${olcekOrani.toFixed(2)}×)`;
        sorunlar.push(`${name}: ${sebep} ama '${h.pane}' paneline bildirilmiş — 'own' olmalı`);
      }
    }

    // 6. Kısa seride çökmemeli (ısınmanın altında)
    try {
      pool.computeOne(candles.slice(0, 12), def.key, {});
    } catch (e) {
      sorunlar.push(`kısa seride çöktü (12 mum): ${e.message}`);
    }

    if (sorunlar.length) basarisiz.push({ key: def.key, sorunlar });
    else gecen++;
  }

  for (const b of basarisiz) {
    console.log(`  ✗ ${b.key}`);
    b.sorunlar.forEach(s => console.log(`      ${s}`));
  }

  console.log('');
  console.log(`geçen: ${gecen}/${defs.filter(d => !d.multi).length}`);

  const cokluSonuc = runMulti();

  // Önbellek gerçekten çalışıyor mu
  pool.clearCache();
  pool.computeOne(candles, 'ema', { period: 21 });
  const ilkBoyut = pool.cacheSize();
  pool.computeOne(candles, 'ema', { period: 21 });
  const ikinciBoyut = pool.cacheSize();
  console.log(`önbellek: ${ilkBoyut === 1 && ikinciBoyut === 1 ? 'çalışıyor (tekrar hesap yok)' : 'BEKLENMEYEN (' + ilkBoyut + '/' + ikinciBoyut + ')'}`);

  return basarisiz.length === 0 && cokluSonuc;
}

/**
 * Çok sembollü göstergeler.
 *
 * Bunlar bir süre HİÇ test edilmedi: yukarıdaki döngü `def.multi` olanları
 * atlıyor ve `computeMulti` de (o zamanlar) çıktıyı sözleşmeye sokmuyordu.
 * Burada üç şey doğrulanır: sözleşme, hizalama ve DEĞERİN DOĞRULUĞU —
 * korelasyonda hizalama hatası sessizdir, çıktı yine −1..1 arasında bir sayı
 * olur. Bu yüzden bilinen cevaplı iki senaryo var:
 *   seriyle kendisi   → korelasyon 1
 *   bağımsız iki seri → korelasyon ≈ 0
 */
/**
 * İki serinin getirilerini karıştırarak "korele ama aynı olmayan" bir seri
 * üretir. SMT tam olarak bunu ister: kopya seride uyuşmazlık olmaz (salınımlar
 * birebir aynı), bağımsız seride ise korelasyon kapısı kapatır. Test verisinin
 * göstergeyi tetikleyebilmesi için arada bir şey gerekiyor.
 */
function mixCandles(A, B, w = 0.8) {
  const out = [];
  let fiyat = A[0].close;
  for (let i = 0; i < A.length; i++) {
    const rA = i ? Math.log(A[i].close / A[i - 1].close) : 0;
    const rB = i ? Math.log(B[i].close / B[i - 1].close) : 0;
    const r = w * rA + (1 - w) * rB;
    const acilis = fiyat;
    const kapanis = acilis * Math.exp(r);
    // Fitiller kaynak mumun oranlarından ölçeklenir; şekil korunur.
    const ustOran = (A[i].high - Math.max(A[i].open, A[i].close)) / A[i].close;
    const altOran = (Math.min(A[i].open, A[i].close) - A[i].low) / A[i].close;
    out.push({
      time: A[i].time,
      open: acilis,
      close: kapanis,
      high: Math.max(acilis, kapanis) * (1 + Math.abs(ustOran)),
      low: Math.min(acilis, kapanis) * (1 - Math.abs(altOran)),
      volume: A[i].volume
    });
    fiyat = kapanis;
  }
  return out;
}

function runMulti() {
  const defs = registry.all().filter(d => d.multi);
  if (!defs.length) return true;

  console.log('');
  console.log(`Çok sembollü testler · ${defs.length} gösterge`);

  const A = makeCandles(400, 100, 20260812);
  const B = makeCandles(400, 30, 777001);     // bağımsız
  // KOPYA: A'nın birebir aynısı, farklı fiyat ölçeğinde → korelasyon 1 olmalı.
  const A2 = A.map(c => ({ ...c, open: c.open * 3, high: c.high * 3, low: c.low * 3, close: c.close * 3 }));
  // Zaman ekseni testi: C bir bar eksik başlıyor, kesişim doğru alınmalı.
  const C = makeCandles(400, 12, 424242).slice(5);

  const harita = { 'AAA/USDT': A, 'BBB/USDT': B, 'CCC/USDT': C, 'AAA2/USDT': A2 };
  const sorunlar = [];

  let sonuc;
  try {
    sonuc = pool.computeMulti(harita, defs.map(d => ({ key: d.key, params: {} })));
  } catch (e) {
    console.log(`  ✗ computeMulti çalıştırma hatası: ${e.message}`);
    return false;
  }

  const beklenenUzunluk = sonuc._times.length;
  console.log(`  ortak zaman ekseni: ${beklenenUzunluk} bar (girdiler 400/400/395/400)`);
  if (beklenenUzunluk !== 395) {
    sorunlar.push(`kesişim 395 bar olmalıydı, ${beklenenUzunluk} çıktı`);
  }

  for (const def of defs) {
    const r = sonuc[def.key];
    for (const ad of (def.seriesOutputs || [])) {
      const seri = r[ad];
      if (!Array.isArray(seri) || seri.length !== beklenenUzunluk) {
        sorunlar.push(`${def.key}.${ad}: HİZASIZ (${seri && seri.length} / ${beklenenUzunluk})`);
      }
    }
    // Sembol haritası taşıyan çıktılar da hizalı olmak zorunda — sözleşme
    // iç içe haritaları göremez, o yüzden burada elle kontrol edilir.
    if (r.pairs) {
      for (const [sym, seri] of Object.entries(r.pairs)) {
        if (!Array.isArray(seri) || seri.length !== beklenenUzunluk) {
          sorunlar.push(`${def.key}.pairs['${sym}']: HİZASIZ (${seri && seri.length} / ${beklenenUzunluk})`);
        }
      }
    }
  }

  // Değer doğruluğu: aynı seri ile korelasyon 1, bağımsız seriyle ~0.
  const kor = pool.computeMulti(harita, [{ key: 'correlation_rolling', params: { base: 'AAA/USDT', period: 100 } }]).correlation_rolling;
  const son = beklenenUzunluk - 1;
  const kendisi = kor.pairs['AAA2/USDT'][son];
  const bagimsiz = kor.pairs['BBB/USDT'][son];

  if (!(Number.isFinite(kendisi) && Math.abs(kendisi - 1) < 1e-9)) {
    sorunlar.push(`aynı serinin korelasyonu 1 olmalı, ${kendisi} çıktı (hizalama hatası?)`);
  }
  if (!(Number.isFinite(bagimsiz) && Math.abs(bagimsiz) < 0.3)) {
    sorunlar.push(`bağımsız serilerin korelasyonu ~0 olmalı, ${bagimsiz} çıktı`);
  }

  const beta = pool.computeMulti(harita, [{ key: 'beta_rolling', params: { base: 'AAA/USDT', period: 100 } }]).beta_rolling;
  const betaKendisi = beta.pairs['AAA2/USDT'][son];
  // Log getiriler ölçekten bağımsız: 3× fiyatlı kopyanın betası da 1 olmalı.
  if (!(Number.isFinite(betaKendisi) && Math.abs(betaKendisi - 1) < 1e-9)) {
    sorunlar.push(`ölçeklenmiş kopyanın betası 1 olmalı, ${betaKendisi} çıktı`);
  }

  // Kümeleme: A ve A2 aynı kümede olmalı, B ayrı.
  const mat = pool.computeMulti(harita, [{ key: 'correlation_matrix', params: { period: 200 } }]).correlation_matrix;
  const kumeler = Object.values(mat.clusters);
  const birlikte = kumeler.some(k => k.includes('AAA/USDT') && k.includes('AAA2/USDT'));
  if (!birlikte) sorunlar.push('aynı seri iki farklı kümeye düştü (kümeleme bozuk)');
  const yanlisBirlesme = kumeler.some(k => k.includes('AAA/USDT') && k.includes('BBB/USDT'));
  if (yanlisBirlesme) sorunlar.push('bağımsız seriler aynı kümeye girdi (eşik/bağlantı hatası)');

  // SMT: kopya seriyle uyuşmazlık OLMAZ (salınımlar birebir aynı), bağımsız
  // seriyi korelasyon kapısı eler. Göstergeyi tetikleyen tek şey "korele ama
  // aynı olmayan" seridir — o yüzden karışım serisiyle test edilir.
  const karisim = mixCandles(A, B, 0.8);
  try {
    const smtOut = pool.computeMulti(
      { 'AAA/USDT': A, 'KARISIM/USDT': karisim },
      [{ key: 'smt_divergence', params: { base: 'AAA/USDT' } }]
    ).smt_divergence;

    if (smtOut.events.length < 3) {
      sorunlar.push(`smt_divergence: korele-ama-farklı seride yalnızca ${smtOut.events.length} olay (ölü gösterge?)`);
    }
    // Olay barı, karşılaştırılan salınımların en geç ONAYLANANI olmalı.
    const erken = smtOut.events.filter(e => e.confirmedAt < e.index);
    if (erken.length) sorunlar.push(`smt_divergence: ${erken.length} olay salınımdan ÖNCE onaylanmış (sızıntı)`);

    // Kopya seride uyuşmazlık olmamalı — aynı salınımlar, aynı yönler.
    const kopyaOut = pool.computeMulti(
      { 'AAA/USDT': A, 'AAA2/USDT': A2 },
      [{ key: 'smt_divergence', params: { base: 'AAA/USDT' } }]
    ).smt_divergence;
    if (kopyaOut.events.length) {
      sorunlar.push(`smt_divergence: birebir kopya seride ${kopyaOut.events.length} uyuşmazlık üretti (olmamalı)`);
    }

    // Korelasyon kapısı: bağımsız seride tüm adaylar elenmeli.
    const kapiOut = pool.computeMulti(
      { 'AAA/USDT': A, 'BBB/USDT': B },
      [{ key: 'smt_divergence', params: { base: 'AAA/USDT', minCorrelation: 0.9 } }]
    ).smt_divergence;
    if (kapiOut.events.length) {
      sorunlar.push(`smt_divergence: bağımsız seride 0.9 kapısına rağmen ${kapiOut.events.length} olay geçti`);
    }
  } catch (e) {
    sorunlar.push(`smt_divergence çalıştırma hatası: ${e.message}`);
  }

  // BAYAT SEMBOL: gerçek `config.watchlist`te MATIC'in önbelleği iki yıl
  // eskiydi ve 16 sembolün kesişimini boşaltıyordu — hatasız, sessizce.
  // Artık elenmeli ve kalanlar hesaplanabilmeli.
  const bayat = B.map((c, i) => ({ ...c, time: c.time - 400 * 3600000 * 2 }));
  try {
    const r = pool.computeMulti(
      { 'AAA/USDT': A, 'AAA2/USDT': A2, 'ESKI/USDT': bayat },
      [{ key: 'correlation_rolling', params: { base: 'AAA/USDT', period: 100 } }]
    );
    if (!r._dropped.some(d => d.symbol === 'ESKI/USDT')) {
      sorunlar.push('bayat sembol elenmedi (kesişim sessizce boşalırdı)');
    }
    if (r._times.length !== 400) {
      sorunlar.push(`bayat sembol elendikten sonra eksen 400 bar olmalı, ${r._times.length} çıktı`);
    }
  } catch (e) {
    sorunlar.push(`bayat sembol varken çöktü: ${e.message}`);
  }

  // Hiç kesişmeyen semboller: sessiz boş sonuç yerine AÇIK hata.
  try {
    pool.computeMulti({ 'A/USDT': A, 'B/USDT': bayat }, [{ key: 'correlation_rolling', params: {} }], { dropNonOverlapping: false });
    sorunlar.push('kesişmeyen sembollerde hata fırlatılmadı (sessiz boş sonuç)');
  } catch (e) {
    if (!/ortak zaman ekseni boş/i.test(e.message)) {
      sorunlar.push(`kesişmeyen sembollerde beklenmeyen hata: ${e.message}`);
    }
  }

  // Kısa seride çökmemeli.
  try {
    pool.computeMulti({ x: A.slice(0, 8), y: B.slice(0, 8) }, defs.map(d => ({ key: d.key, params: {} })));
  } catch (e) {
    sorunlar.push(`kısa seride çöktü (8 mum): ${e.message}`);
  }
  // Tek sembolle de çökmemeli (kullanıcı tek varlık seçebilir).
  try {
    pool.computeMulti({ x: A }, defs.map(d => ({ key: d.key, params: {} })));
  } catch (e) {
    sorunlar.push(`tek sembolle çöktü: ${e.message}`);
  }

  if (sorunlar.length) {
    sorunlar.forEach(s => console.log(`  ✗ ${s}`));
    return false;
  }

  console.log(`  ✓ hizalama, sözleşme ve bilinen değerler (kendisi=1, bağımsız≈${bagimsiz.toFixed(3)}, beta=1, kümeleme)`);
  return true;
}

if (require.main === module) {
  const ok = run();
  process.exit(ok ? 0 : 1);
}

module.exports = { run, makeCandles, mixCandles };
