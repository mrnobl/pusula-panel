#!/usr/bin/env node
/**
 * NASDAQ VERİ İNDİRİCİ — PLAN-NASDAQ.md (ön-kayıt) veri altyapısı.
 *   node scripts/nasdaq-indir.js                # hepsi: Wikipedia → üyelik → Yahoo → denetim
 *   node scripts/nasdaq-indir.js --uyelik       # yalnız Wikipedia + üyelik tablosu (Yahoo yok)
 *   node scripts/nasdaq-indir.js --eksik        # yalnız dosyası OLMAYAN serileri indir, sonra denetim
 *   node scripts/nasdaq-indir.js --denetle      # indirme yok; üyelik + kalite raporu
 *   node scripts/nasdaq-indir.js --yenile-wiki  # Wikipedia önbelleğini (data/nasdaq/_wiki) yeniden çek
 *   node scripts/nasdaq-indir.js QQQ AAPL       # yalnız verilen Yahoo sembolleri (denetim yine hepsi)
 *
 * Kaynaklar
 *   · Fiyat: Yahoo Finance chart API (v8), günlük, period1 = 1970 → olabildiğince uzun.
 *     Çıktı data/nasdaq/<DOSYA>.json (DOSYA = sembolde ^ = . dışındakiler '_'; ^NDX → _NDX, NQ=F → NQ_F)
 *     { sembol, kaynak, indirme, para, tur, ad, ilkIslem, gunler:[{t,o,h,l,c,ac,v}], temettu, bolunme }
 *     t = New York takvim günü (UTC gece yarısı ms), c = bölünmeye göre düzeltilmiş kapanış (Yahoo "close"),
 *     ac = bölünme + temettü düzeltilmiş kapanış, o/h/l Yahoo ham (yalnız bölünme düzeltmeli),
 *     v = bölünmeye göre düzeltilmiş adet. Yükleyici (lib/research/nasdaqVeri.js) ac/c oranını o/h/l'ye uygular.
 *   · Üyelik: Wikipedia
 *     - "List of NASDAQ-100 companies" (bugünkü üyeler),
 *     - "Historical components of the Nasdaq-100" (2007-02 → bugün tüm ekleme/çıkarma satırları),
 *     - "Nasdaq-100" makalesinin ESKİ SÜRÜMLERİ (2004-12 → 2007-01 ay başı anlık listeleri; 2007+ doğrulama).
 *     Ham wikitext data/nasdaq/_wiki/ altında saklanır (tekrar üretilebilirlik).
 *
 * Üyelik yöntemi (nokta-zamanlı)
 *   1. 2007-02 → bugün: bugünkü listeden GERİYE yürünür (eklemeyi geri al = çıkar, çıkarmayı geri al = ekle).
 *      Ay M'nin üyeleri = M'nin 1. günü 00:00'daki durum (o güne kadar YÜRÜRLÜĞE girmiş değişiklikler, tarih ≤ ay başı).
 *      Ay içi eklenen hisse bir sonraki aydan itibaren sayılır → ileriye bakma yok.
 *   2. 2005-01 → 2007-01: değişim tablosu yok; Wikipedia makalesinin o ay başından ÖNCEKİ son sürümündeki liste
 *      (editör gecikmesi olabilir → güven "düşük", etiket 'wiki-anlik').
 *   3. 2005 öncesi: kaynak bulunamadı (Wikipedia makalesi 2004-12'den önce liste içermiyor; Wayback CDX 504 verdi).
 *   Anahtar = veri dosyası sembolü. Şirket endeksteyken ticker değiştirdiyse ve Yahoo geçmişi yeni ticker'da tutuyorsa
 *   anahtar YENİ ticker'dır (TAKMA_AD). Aynı ticker'ı sonradan başka şirket aldıysa (FB, PCLN, SNDK, DELL, GOLD, LIFE…)
 *   veri o üyelik aralığını kapsamaz ya da ad tutmaz → aralık "geçersiz" işaretlenir, yükleyici o aralıkta kullanmaz.
 *
 * Çıktılar: data/nasdaq/uyelik.json      { "YYYY-MM": [anahtar, …] }
 *           data/nasdaq/uyelik-meta.json aralıklar, güven, takma adlar, geçersiz aralıklar, doğrulama, eksik veri
 *           data/nasdaq/_denetim.json    seri kalitesi + aylık kapsama
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const DIR = yollar.veri('nasdaq');
const WIKI_DIR = path.join(DIR, '_wiki');
const GUN = 864e5;

// ── Evren ───────────────────────────────────────────────────────────────────
const ENDEKS = ['^NDX', '^IXIC', 'QQQ', 'TQQQ', 'QLD', 'NQ=F', 'SPY', '^GSPC', 'IWM', 'DIA'];
const ETF = ['XLK', 'SMH', 'SOXX', 'XLE', 'XLF', 'XLV', 'XLY', 'XLP', 'XLI', 'XLU', 'XLB', 'XLRE', 'XLC', 'GLD', 'SLV',
  'TLT', 'IEF', 'SHY', 'UUP', 'USO', 'DBC', 'EFA', 'EEM', 'VNQ', 'ARKK', 'HYG', 'LQD', 'BITO'];
const REF_TAKVIM = '^GSPC';   // NYSE işlem günleri referansı (eksik gün sayımı)

/**
 * Wikipedia/anlık listedeki ticker → veri anahtarı (Yahoo sembolü). Aynı şirket, ticker değişti, Yahoo geçmişi
 * yeni ticker'da (her biri 2026-10-07'de Yahoo'da yoklandı: ilk tarih şirketin üyelik başından önce).
 * NOT: GOOG 2014-04-03 öncesi A sınıfıydı → Yahoo'da GOOGL; geri yürüyüş bunu kendiliğinden yapıyor
 * (GOOG eklenmesi geri alınınca A sınıfı GOOGL olarak kalıyor).
 */
const TAKMA_AD = {
  PCLN: 'BKNG',   // Priceline → Booking Holdings (2018-02)
  KFT: 'MDLZ',    // Kraft Foods Inc. → Mondelez (2012-10; yeni Kraft KRFT ayrı şirket)
  CTRP: 'TCOM',   // Ctrip → Trip.com (2019-10)
  ERTS: 'EA',     // Electronic Arts (2011)
  HANS: 'MNST',   // Hansen Natural → Monster Beverage (2012-01)
  RIMM: 'BB',     // Research In Motion → BlackBerry (2013)
  SYMC: 'GEN', NLOK: 'GEN',   // Symantec → NortonLifeLock → Gen Digital
  JDSU: 'VIAV',   // JDS Uniphase → Viavi (2015)
  FI: 'FISV',     // Fiserv: Yahoo geçmişi FISV'de (FI 404)
  MYL: 'VTRS',    // Mylan → Viatris (2020-11), Yahoo VTRS geçmişi 1985'ten
  DISCA: 'WBD',   // Discovery A → Warner Bros. Discovery (2022-04), Yahoo WBD 2005'ten
  NWSA: 'FOXA',   // 2009–2013 News Corp → 21st Century Fox (FOXA) → (2019) Fox Corp. Yahoo FOXA 2019'dan → 2019 öncesi kapsanmaz
  WFMI: 'WFM',    // Whole Foods ticker değişimi (tablo 2008'de WFMI, 2010'da WFM)
  SUNW: 'JAVA',   // Sun Microsystems (2007-08 ticker değişimi)
  NTLI: 'NLTI',   // NTL Inc.: tablo "NLTI" yazıyor (yazım), anlık listeler NTLI → tek anahtar
  LINTA: 'QRTEA', // Liberty Interactive → Qurate Retail (2018)
  VIP: 'VEON',    // VimpelCom → VEON (Yahoo VIP artık başka şirket)
  WLTW: 'WTW',    // Willis Towers Watson ticker değişimi (2022-01)
  QVCA: 'QRTEA',  // Liberty Interactive QVC Group izleme hissesi → Qurate Retail (2018-04)
};
/** Ad denetiminden elle geçen anahtarlar: aynı şirket, yalnız adı değişti (Yahoo ilk tarih üyelikten önce). */
const AD_ONAY = new Set(['FLEX', 'FFIV', 'JD', 'MSTR']);   // Flextronics→Flex, F5 Networks→F5, JD.com, MicroStrategy→Strategy
/** Tarih/ada bağlı eşlemeler (ticker'ı sonradan başka menkul kıymet aldı). */
function anahtar(t, an = Infinity, ad = '') {
  if (t === 'GOOG' && an < Date.UTC(2014, 3, 3)) return 'GOOGL';                       // eski GOOG = bugünkü A sınıfı
  if (t === 'FB') return 'META';
  if (t === 'MNST' && (/worldwide/i.test(ad) || an < Date.UTC(2010, 0, 1))) return 'MWW'; // Monster Worldwide (2012'den sonra MNST = Hansen/Monster Beverage)
  return TAKMA_AD[t] || t;
}

/**
 * Değişim tablosu DÜZELTMELERİ — her biri Wikipedia'nın eski makale listeleriyle (2008–2012 Şubat anlıkları)
 * çelişen satırlar; düzeltme olmadan geri yürüyüş bu sınıfları yanlış aylara taşır.
 */
const DUZELTME = [
  { tarih: '2014-12-22', ekleSil: ['CMCSA'], not: 'Tablo "+CMCSA" diyor; 2008–2012 listelerinde CMCSA zaten üye. Yeni eklenen sınıf CMCSK olmalı (Yahoo\'da yok) → satır yok sayıldı.' },
  { tarih: '2014-12-22', ekleEkle: ['DISCK', 'LMCK'], not: 'Çoklu sınıf kuralı (2014-12): DISCK ve LMCK tabloda eklenmeden çıkarılıyor; 2008–2012 listelerinde yoklar → bu tarihte eklendi sayıldı.' },
  { tarih: '2015-11-11', cikarDegistir: ['AVGO', 'BRCM'], not: 'Çıkarılan "Broadcom Corporation" = BRCM (Avago 2011\'den beri AVGO ile üye).' },
  { tarih: '2007-10-24', yeniSatir: { ekle: ['HSIC'], cikar: ['MXIM'] }, not: 'Tabloda YOK. Maxim 2007 sonbaharında Nasdaq kotasyonunu kaybetti; Wikipedia makale sürümleri 2007-09-25 (MXIM üye) ile 2007-10-24 (HSIC üye) arasında değişiyor → tarih = geç sınır (yaklaşık).' },
  { tarih: '2016-02-01', ekleSil: ['AVGO'], not: 'Avago → Broadcom Ltd. aynı AVGO ticker\'ı; üyelik değişmedi.' },
];
function duzeltmeUygula(degisim) {
  const uygulanan = [];
  for (const d of DUZELTME) {
    if (d.yeniSatir) { degisim.push({ t: Date.parse(d.tarih), tarih: d.tarih, ekleAd: '', cikarAd: '', neden: 'DÜZELTME: ' + d.not, ...d.yeniSatir }); uygulanan.push({ ...d, durum: 'eklendi' }); continue; }
    const satirlar = degisim.filter(c => tarih(c.t) === d.tarih);
    if (!satirlar.length) { uygulanan.push({ ...d, durum: 'satır bulunamadı' }); continue; }
    if (d.ekleSil) for (const c of satirlar) c.ekle = c.ekle.filter(x => !d.ekleSil.includes(x));
    if (d.ekleEkle) satirlar[0].ekle.push(...d.ekleEkle);
    if (d.cikarDegistir) for (const c of satirlar) c.cikar = c.cikar.map(x => (x === d.cikarDegistir[0] ? d.cikarDegistir[1] : x));
    uygulanan.push({ ...d, durum: 'uygulandı' });
  }
  degisim.sort((a, b) => b.t - a.t);
  return uygulanan;
}

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' };
const WUA = { 'User-Agent': 'trade-bot-arastirma/1.0 (kisisel arastirma; Node fetch)' };
const bekle = ms => new Promise(s => setTimeout(s, ms));
const tarih = t => new Date(t).toISOString().slice(0, 10);
const ayAnahtar = t => new Date(t).toISOString().slice(0, 7);
const dosyaAdi = y => y.replace(/[^A-Z0-9.]/gi, '_') + '.json';

// ── Wikipedia ───────────────────────────────────────────────────────────────
async function wikiApi(params) {
  const u = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let d = 0; d < 6; d++) {
    try {
      const r = await fetch(u, { headers: WUA });
      const metin = await r.text();
      if (r.ok && metin.startsWith('{')) return JSON.parse(metin);
    } catch (e) { /* tekrar dene */ }
    await bekle(3000 * (d + 1));
  }
  throw new Error('Wikipedia API yanıt vermedi: ' + u);
}

async function wikiOnbellek(ad, getir, yenile) {
  const f = path.join(WIKI_DIR, ad);
  if (!yenile && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const v = await getir();
  fs.writeFileSync(f, JSON.stringify(v));
  await bekle(1200);
  return v;
}

const sayfaGuncel = (baslik, yenile) => wikiOnbellek(baslik.replace(/\W+/g, '_') + '.json', async () => {
  const j = await wikiApi({ action: 'parse', page: baslik, prop: 'wikitext|revid', redirects: '1' });
  return { baslik, revid: j.parse.revid, cekildi: new Date().toISOString(), wikitext: j.parse.wikitext };
}, yenile);

/** `baslik` sayfasının `t` anından önceki son sürümü. */
const sayfaSurum = (baslik, t, yenile) => wikiOnbellek(`${baslik.replace(/\W+/g, '_')}@${tarih(t)}.json`, async () => {
  const j = await wikiApi({ action: 'query', prop: 'revisions', titles: baslik, rvlimit: '1', rvdir: 'older',
    rvstart: new Date(t).toISOString(), rvprop: 'ids|timestamp|content', rvslots: 'main', redirects: '1' });
  const p = j.query.pages[0];
  if (!p.revisions) return { baslik, yok: true };
  const r = p.revisions[0];
  return { baslik, revid: r.revid, zaman: r.timestamp, wikitext: r.slots.main.content };
}, yenile);

const temizle = s => s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '')
  .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').trim();

function guncelListe(w) {
  const tab = w.split('id="constituents"')[1].split('\n|}')[0];
  return tab.split('\n').filter(s => /^\|\s*[A-Z][A-Z.]*\s*\|\|/.test(s)).map(s => {
    const h = temizle(s.slice(1)).split('||').map(x => x.trim());
    return { ticker: h[0], ad: h[1] || '' };
  });
}

function degisimTablosu(w) {
  const t = w.split('id="changes"')[1].split('\n|}')[0];
  const satirlar = t.split(/\n\|-\s*\n/).slice(1).map(r => r.split('\n').filter(x => x.startsWith('|')).map(x => x.slice(1).trim())).filter(r => r.length === 6);
  const bol = s => temizle(s).split(/[,\s/]+/).filter(x => /^[A-Z][A-Z.]*$/.test(x));
  return satirlar.map(r => ({
    t: Date.parse(temizle(r[0]) + ' UTC'), tarih: temizle(r[0]),
    ekle: bol(r[1]), ekleAd: temizle(r[2]), cikar: bol(r[3]), cikarAd: temizle(r[4]), neden: temizle(r[5]).slice(0, 200),
  })).filter(x => isFinite(x.t)).sort((a, b) => b.t - a.t);
}

/** Eski makale sürümlerindeki madde listesi: "*[[Ad]] (AAPL)", "([[ADBE]])", "([[Apple Inc.|AAPL]])", "#[[..]] (X)". */
function anlikListe(w) {
  const out = [];
  // Yalnız '==Components==' bölümü (2013+ makale yıllık değişim listeleri de içeriyor); yoksa tüm metin.
  const bas = w.search(/^==\s*Components\s*==\s*$/m);
  if (bas >= 0) { const geri = w.slice(bas).split('\n'); const son = geri.findIndex((x, i) => i > 0 && /^==/.test(x)); w = geri.slice(0, son > 0 ? son : undefined).join('\n'); }
  for (const satir of w.split('\n')) {
    // Tablo satırı (2019+ makale): "|[[Şirket]]||TICK" ya da "| TICK || Şirket || …"
    if (/^\|(?![-}+])/.test(satir) && satir.includes('||')) {
      const ham = satir.slice(1).split('||'), h = ham.map(x => temizle(x).trim());
      const tk = h.find((x, i) => !ham[i].includes('[[') && /^[A-Z]{1,5}(?:\.[A-Z])?$/.test(x));   // bağlantılı hücre = şirket adı
      if (tk) out.push({ ticker: tk, ad: h.find(x => x && x !== tk) || '' });
      continue;
    }
    if (!/^[*#]/.test(satir)) continue;
    const m = [...satir.matchAll(/\(\s*(?:\[\[(?:[^\]|]*\|)?)?\s*(?:NASDAQ\s*:\s*)?([A-Z]{1,5}(?:\.[A-Z])?)\s*(?:\]\])?\s*\)/g)];
    if (!m.length) continue;
    const ad = temizle(satir.replace(/^[*#]+/, '').split('(')[0]);
    out.push({ ticker: m[m.length - 1][1], ad });
  }
  // Tekrarları at (aynı ticker iki kez).
  const gor = new Set(); return out.filter(x => (gor.has(x.ticker) ? false : (gor.add(x.ticker), true)));
}

// ── Üyelik kurulumu ─────────────────────────────────────────────────────────
async function uyelikKur(yenile) {
  fs.mkdirSync(WIKI_DIR, { recursive: true });
  const g = await sayfaGuncel('List of NASDAQ-100 companies', yenile);
  const h = await sayfaGuncel('Historical components of the Nasdaq-100', yenile);
  const guncel = guncelListe(g.wikitext);
  const degisim = degisimTablosu(h.wikitext);
  const duzeltmeler = duzeltmeUygula(degisim);
  const adlar = new Map();   // anahtar → Wikipedia adları (ad denetimi için)
  const adEkle = (k, ad) => { if (!ad) return; if (!adlar.has(k)) adlar.set(k, new Set()); adlar.get(k).add(ad); };
  for (const x of guncel) adEkle(anahtar(x.ticker), x.ad);

  // Geriye yürüyüş: her değişiklikten ÖNCEKİ durum kaydedilir.
  let kume = new Set(guncel.map(x => anahtar(x.ticker)));
  const durumlar = [{ t: Infinity, kume: new Set(kume) }];   // t'den itibaren (t dahil) geçerli durum
  const uyumsuz = [];
  for (const c of degisim) {
    for (const a of c.ekle) { const k = anahtar(a, c.t, c.ekleAd); adEkle(k, c.ekleAd); if (!kume.has(k)) uyumsuz.push({ tarih: tarih(c.t), tur: 'eklenen yok', ticker: a }); kume.delete(k); }
    for (const r of c.cikar) { const k = anahtar(r, c.t, c.cikarAd); adEkle(k, c.cikarAd); if (kume.has(k)) uyumsuz.push({ tarih: tarih(c.t), tur: 'çıkarılan zaten var', ticker: r }); kume.add(k); }
    durumlar.push({ t: c.t, kume: new Set(kume) });   // c.t'den ÖNCE geçerli
  }
  // durumAn(t): t anında geçerli küme = tarihi ≤ t olan tüm değişiklikler uygulanmış.
  const durumAn = t => { let k = durumlar[0].kume; for (let i = 1; i < durumlar.length; i++) { if (durumlar[i].t > t) k = durumlar[i].kume; else break; } return k; };
  const ilkDegisim = degisim[degisim.length - 1].t;

  // Anlık listeler (2004-12 → 2007-01 ay başları) + doğrulama anları.
  const aylar = {}, guven = {}, anlikKaynak = {};
  const AB = (y, m) => Date.UTC(y, m, 1);
  const anlik = new Map();
  for (let y = 2005, m = 0; AB(y, m) <= AB(2007, 0); m === 11 ? (y++, m = 0) : m++) {
    const t = AB(y, m);
    let s = await sayfaSurum('Nasdaq-100', t, yenile), liste = s.yok ? [] : anlikListe(s.wikitext);
    if (liste.length < 90) {   // 2005 sonu: liste ayrı sayfadaydı
      const s2 = await sayfaSurum('List of NASDAQ-100 companies', t, yenile);
      const l2 = s2.yok ? [] : anlikListe(s2.wikitext);
      if (l2.length > liste.length) { s = s2; liste = l2; }
    }
    anlik.set(ayAnahtar(t), { s, liste });
  }
  let sonGecerli = null;
  for (const [ay, { s, liste }] of anlik) {
    if (liste.length >= 90 && liste.length <= 110) sonGecerli = { ay, s, liste };
    if (!sonGecerli) continue;
    const tA = ayBas(ay);
    aylar[ay] = [...new Set(sonGecerli.liste.map(x => anahtar(x.ticker, tA, x.ad)))].sort();
    for (const x of sonGecerli.liste) adEkle(anahtar(x.ticker, tA, x.ad), x.ad);
    guven[ay] = sonGecerli.ay === ay ? 'wiki-anlik' : `wiki-anlik (${sonGecerli.ay} taşındı)`;
    anlikKaynak[ay] = { sayfa: sonGecerli.s.baslik, revid: sonGecerli.s.revid, zaman: sonGecerli.s.zaman, n: sonGecerli.liste.length };
  }
  // 2007-02 → bugün: değişim tablosu.
  const simdi = Date.now();
  for (let y = 2007, m = 1; AB(y, m) <= simdi; m === 11 ? (y++, m = 0) : m++) {
    const t = AB(y, m), ay = ayAnahtar(t);
    aylar[ay] = [...durumAn(t)].sort();
    guven[ay] = t >= ilkDegisim ? 'degisim-tablosu' : 'degisim-tablosu (ilk satırdan önce)';
  }

  // Doğrulama: eski makale sürümlerindeki listeler ↔ geri yürüyüş (aynı an).
  const dogrulama = [];
  for (let y = 2007; y <= 2026; y++) {
    const s = await sayfaSurum('Nasdaq-100', Date.UTC(y, 1, 1), yenile);
    const liste = s.yok ? [] : anlikListe(s.wikitext);
    if (liste.length < 95 || liste.length > 110) { dogrulama.push({ an: `${y}-02-01`, atlandi: `liste güvenilmez/ayrıştırılamadı (${liste.length} satır; makale başka listeler de içeriyor)` }); continue; }
    const notu = (s.wikitext.match(/This list is current[^.\n]*/i) || [null])[0];
    const an = Date.parse(s.zaman), yurume = durumAn(an), wiki = new Set(liste.map(x => anahtar(x.ticker, an, x.ad)));
    if (an < ilkDegisim) { dogrulama.push({ an: s.zaman, atlandi: 'değişim tablosundan önce' }); continue; }
    dogrulama.push({
      an: s.zaman, revid: s.revid, listeNotu: notu, wikiSayi: wiki.size, yurumeSayi: yurume.size,
      ortak: [...wiki].filter(x => yurume.has(x)).length,
      yalnizWiki: [...wiki].filter(x => !yurume.has(x)), yalnizYurume: [...yurume].filter(x => !wiki.has(x)),
    });
  }
  // Geçiş ayı: 2007-01 (anlık) ↔ 2007-02 (yürüyüş) farkı.
  const gecis = aylar['2007-01'] && aylar['2007-02'] ? {
    yalnizAnlik: aylar['2007-01'].filter(x => !aylar['2007-02'].includes(x)),
    yalnizYurume: aylar['2007-02'].filter(x => !aylar['2007-01'].includes(x)),
  } : null;

  // Aralıklar: anahtar → [[ilkAy, sonAy]] (aylık tablodan).
  const araliklar = {};
  const ayListesi = Object.keys(aylar).sort();
  for (let i = 0; i < ayListesi.length; i++) {
    for (const k of aylar[ayListesi[i]]) {
      const a = (araliklar[k] = araliklar[k] || []);
      if (a.length && a[a.length - 1][1] === ayListesi[i - 1]) a[a.length - 1][1] = ayListesi[i]; else a.push([ayListesi[i], ayListesi[i]]);
    }
  }
  return {
    aylar, guven, anlikKaynak, araliklar, uyumsuz, dogrulama, gecis, duzeltmeler,
    adlar: Object.fromEntries([...adlar].map(([k, v]) => [k, [...v]])),
    kaynak: { guncel: { revid: g.revid, cekildi: g.cekildi, n: guncel.length }, degisim: { revid: h.revid, cekildi: h.cekildi, satir: degisim.length, ilk: tarih(ilkDegisim) } },
  };
}

// ── Yahoo ───────────────────────────────────────────────────────────────────
async function getir(y) {
  const p1 = Date.UTC(1970, 0, 2) / 1000, p2 = Math.floor(Date.now() / 1000);
  for (const host of ['query1', 'query2']) {
    for (let deneme = 0; deneme < 3; deneme++) {
      try {
        const u = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?period1=${p1}&period2=${p2}&interval=1d&events=div%2Csplit`;
        const r = await fetch(u, { headers: UA });
        if (r.status === 404) return null;
        if (!r.ok) { await bekle(1500 * (deneme + 1)); continue; }
        const j = await r.json();
        const x = j.chart && j.chart.result && j.chart.result[0];
        if (!x || !x.timestamp) return null;
        return x;
      } catch (e) { await bekle(1500); }
    }
  }
  return null;
}

function donustur(sembol, x) {
  const q = x.indicators.quote[0], ac = (x.indicators.adjclose && x.indicators.adjclose[0].adjclose) || q.close;
  const ofset = (x.meta && x.meta.gmtoffset) || -5 * 3600;   // New York (yaz saati Yahoo'nun meta değerinde)
  const gunler = [];
  for (let i = 0; i < x.timestamp.length; i++) {
    const c = q.close[i];
    if (c == null) continue;
    // Gün: borsa yerel takvim günü. Günlük çubuk zaman damgası seans açılışı (09:30 ET) → ofset kayması günü değiştirmez.
    const d = new Date((x.timestamp[i] + ofset) * 1000);
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const satir = { t, o: q.open[i], h: q.high[i], l: q.low[i], c, ac: ac[i], v: q.volume[i] };
    if (gunler.length && gunler[gunler.length - 1].t === t) gunler[gunler.length - 1] = satir; else gunler.push(satir);
  }
  const ev = x.events || {}, m = x.meta || {};
  return {
    sembol, kaynak: 'Yahoo Finance v8 chart', indirme: new Date().toISOString(),
    para: m.currency, tur: m.instrumentType, ad: m.longName || m.shortName || null, borsa: m.fullExchangeName || m.exchangeName,
    ilkIslem: m.firstTradeDate ? tarih(m.firstTradeDate * 1000) : null,
    gunler,
    temettu: Object.values(ev.dividends || {}).map(d => ({ t: d.date * 1000, miktar: d.amount })).sort((a, b) => a.t - b.t),
    bolunme: Object.values(ev.splits || {}).map(d => ({ t: d.date * 1000, oran: d.splitRatio })).sort((a, b) => a.t - b.t),
  };
}

// ── Denetim ─────────────────────────────────────────────────────────────────
/**
 * Seri kalitesi:
 *  eksikGun   = [ilk, son] içinde referans takvimde (^GSPC) olup seride olmayan gün
 *  fazlaGun   = seride olup referansta olmayan gün (vadeli/tatil açık seans)
 *  sifir      = c ≤ 0 ya da ac ≤ 0;  ohlcBos = o/h/l boş ya da ≤ 0;  hacimSifir = v boş/0
 *  ohlcTutarsiz = h < l ya da c ∉ [l, h] (%0,1 tolerans)
 *  sicrama    = ac getirisi |r| ≥ %50 ya da r ≤ −%34 (BIST kuralı)
 *  duzeltme   : k = ac/c — kBuyuk (k > 1,0001: düzeltilmiş > ham, olmamalı), sonK (≈1 olmalı),
 *               olaysizSicrama (|k_i/k_{i−1} − 1| > %0,5 ve arada temettü/bölünme kaydı yok)
 */
function denetle(v, ref) {
  const g = v.gunler, sicrama = [];
  let sifir = 0, ohlcBos = 0, hacimSifir = 0, ohlcTutarsiz = 0, kBuyuk = 0, olaysiz = 0;
  const olay = new Set([...v.temettu, ...v.bolunme].map(e => { const d = new Date(e.t - 5 * 3600e3); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }));
  const olaySirali = [...olay].sort((a, b) => a - b);
  const olayArada = (a, b) => olaySirali.some(t => t > a && t <= b);
  const olaysizOrnek = [];
  for (let i = 0; i < g.length; i++) {
    const x = g[i];
    if (!(x.c > 0) || !(x.ac > 0)) { sifir++; continue; }
    if (x.o == null || x.h == null || x.l == null || !(x.o > 0) || !(x.h > 0) || !(x.l > 0)) ohlcBos++;
    else if (x.h < x.l * 0.999 || x.c > x.h * 1.001 || x.c < x.l * 0.999) ohlcTutarsiz++;
    if (!x.v) hacimSifir++;
    const k = x.ac / x.c;
    if (k > 1.0001) kBuyuk++;
    if (i && g[i - 1].ac > 0 && g[i - 1].c > 0) {
      const r = x.ac / g[i - 1].ac - 1;
      if (Math.abs(r) >= 0.5 || r <= -0.34) sicrama.push({ t: tarih(x.t), r: +(r * 100).toFixed(1) });
      const k0 = g[i - 1].ac / g[i - 1].c;
      if (Math.abs(k / k0 - 1) > 0.005 && !olayArada(g[i - 1].t, x.t)) { olaysiz++; if (olaysizOrnek.length < 5) olaysizOrnek.push({ t: tarih(x.t), oran: +(k / k0).toFixed(4) }); }
    }
  }
  const tset = new Set(g.map(x => x.t));
  let eksik = 0, fazla = 0; const eksikOrnek = [];
  if (ref && g.length) {
    const ilk = g[0].t, son = g[g.length - 1].t;
    for (const t of ref) if (t >= ilk && t <= son && !tset.has(t)) { eksik++; if (eksikOrnek.length < 5) eksikOrnek.push(tarih(t)); }
    const rset = new Set(ref);
    for (const t of tset) if (!rset.has(t) && t <= ref[ref.length - 1]) fazla++;
  }
  const son = g[g.length - 1];
  return {
    ad: v.ad, tur: v.tur, gun: g.length, ilk: g.length ? tarih(g[0].t) : null, son: g.length ? tarih(son.t) : null,
    eksikGun: eksik, eksikOrnek, fazlaGun: fazla, sifir, ohlcBos, hacimSifir, ohlcTutarsiz, sicrama,
    duzeltme: { kBuyuk, sonK: son ? +(son.ac / son.c).toFixed(5) : null, ilkK: g.length ? +(g[0].ac / g[0].c).toFixed(5) : null, olaysizSicrama: olaysiz, olaysizOrnek, temettu: v.temettu.length, bolunme: v.bolunme.length },
  };
}

/** Ad benzerliği (Wikipedia adı ↔ Yahoo longName): anlamlı ortak kelime var mı. */
const GURULTU = new Set(['inc', 'corp', 'corporation', 'company', 'co', 'ltd', 'limited', 'plc', 'holdings', 'holding', 'group', 'the', 'class', 'series', 'common', 'stock', 'sa', 'nv', 'ag', 'se', 'llc', 'lp', 'international', 'technologies', 'technology', 'systems', 'and', 'of', 'com', 'adr', 'ads', 'trust', 'communications', 'a', 'b', 'c', 'n', 'v', 's']);
const kelimeler = s => new Set(String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !GURULTU.has(w)));
function adTutar(wikiAdlar, yahooAd) {
  const y = kelimeler(yahooAd);
  return wikiAdlar.some(a => { const w = kelimeler(a); for (const x of w) if (y.has(x) || [...y].some(z => z.startsWith(x.slice(0, 5)) && x.length >= 5)) return true; return false; });
}

const ayBas = ay => Date.UTC(+ay.slice(0, 4), +ay.slice(5, 7) - 1, 1);

/** Üyelik aralığı başına geçerlilik: veri aralığı kapsıyor mu, ad tutuyor mu. */
function araliklariDenetle(uy, seriBilgi) {
  const gecersiz = [], kismi = [], adUyusmaz = [];
  // Ad onayı: TAKMA_AD ile eşlenen anahtarlar adları farklı olsa da kabul (bilinçli eşleme).
  const takmaHedef = new Set([...Object.values(TAKMA_AD), ...AD_ONAY]);
  for (const [k, arr] of Object.entries(uy.araliklar)) {
    const b = seriBilgi.get(k);
    for (const [a1, a2] of arr) {
      const t1 = ayBas(a1), t2 = ayBas(a2) + 31 * GUN;
      if (!b) { gecersiz.push({ anahtar: k, aralik: [a1, a2], neden: 'Yahoo\'da yok (404/boş)' }); continue; }
      if (b.ilkT > t2 || b.sonT < t1) { gecersiz.push({ anahtar: k, aralik: [a1, a2], neden: `veri aralık dışında (${tarih(b.ilkT)} → ${tarih(b.sonT)}; ticker başka şirkete geçmiş/delist)` }); continue; }
      if (!takmaHedef.has(k) && !adTutar(uy.adlar[k] || [], b.ad)) { gecersiz.push({ anahtar: k, aralik: [a1, a2], neden: `ad tutmuyor: Wikipedia "${(uy.adlar[k] || []).join(' / ')}" ↔ Yahoo "${b.ad}"` }); adUyusmaz.push(k); continue; }
      if (b.ilkT > t1 + 40 * GUN) kismi.push({ anahtar: k, aralik: [a1, a2], veriIlk: tarih(b.ilkT) });
    }
  }
  return { gecersiz, kismi, adUyusmaz: [...new Set(adUyusmaz)] };
}

/** Aylık kapsama: ay başında üyelerin kaçının o ana kadar ≥1 çubuğu ve ay içinde verisi var (geçersiz aralık hariç). */
function kapsama(uy, seriBilgi, gecersiz) {
  const ger = new Map();
  for (const g of gecersiz) { if (!ger.has(g.anahtar)) ger.set(g.anahtar, []); ger.get(g.anahtar).push(g.aralik); }
  const out = {};
  for (const [ay, uyeler] of Object.entries(uy.aylar)) {
    const t = ayBas(ay); let var_ = 0; const yok = [];
    for (const k of uyeler) {
      const b = seriBilgi.get(k);
      const gecmez = (ger.get(k) || []).some(([a1, a2]) => ay >= a1 && ay <= a2);
      if (b && !gecmez && b.ilkT < t && b.sonT >= t) var_++; else yok.push(k);
    }
    out[ay] = { uye: uyeler.length, veri: var_, oran: +(var_ / uyeler.length).toFixed(3), guven: uy.guven[ay], yok };
  }
  return out;
}

// ── Ana akış ────────────────────────────────────────────────────────────────
async function main() {
  const arg = process.argv.slice(2);
  const bayrak = b => arg.includes(b);
  fs.mkdirSync(DIR, { recursive: true });

  console.log('1) Wikipedia → nokta-zamanlı üyelik');
  const uy = await uyelikKur(bayrak('--yenile-wiki'));
  fs.writeFileSync(path.join(DIR, 'uyelik.json'), JSON.stringify(uy.aylar));
  const aylar = Object.keys(uy.aylar).sort();
  console.log(`   ${aylar[0]} → ${aylar[aylar.length - 1]} · ${aylar.length} ay · ${Object.keys(uy.araliklar).length} farklı anahtar · tablo satırı ${uy.kaynak.degisim.satir} (ilk ${uy.kaynak.degisim.ilk})`);
  console.log(`   geri yürüyüş uyumsuzluğu: ${uy.uyumsuz.length ? uy.uyumsuz.map(u => `${u.tarih} ${u.tur} ${u.ticker}`).join('; ') : 'yok'}`);
  for (const d of uy.dogrulama) console.log(d.atlandi ? `   doğrulama ${d.an}: ${d.atlandi}` : `   doğrulama ${d.an.slice(0, 10)}: wiki ${d.wikiSayi} / yürüyüş ${d.yurumeSayi} / ortak ${d.ortak} · yalnız wiki [${d.yalnizWiki.join(' ')}] · yalnız yürüyüş [${d.yalnizYurume.join(' ')}]`);
  if (uy.gecis) console.log(`   geçiş 2007-01 (anlık) ↔ 2007-02 (yürüyüş): yalnız anlık [${uy.gecis.yalnizAnlik.join(' ')}] · yalnız yürüyüş [${uy.gecis.yalnizYurume.join(' ')}]`);
  if (bayrak('--uyelik')) { fs.writeFileSync(path.join(DIR, 'uyelik-meta.json'), JSON.stringify({ ...uy, aylar: undefined }, null, 1)); return; }

  const hisseler = Object.keys(uy.araliklar).sort();
  let tum = [...ENDEKS, ...ETF, ...hisseler.filter(h => !ENDEKS.includes(h) && !ETF.includes(h))];
  const sec = arg.filter(a => !a.startsWith('--'));
  if (sec.length) tum = tum.filter(y => sec.includes(y));
  const yok = {};
  if (!bayrak('--denetle')) {
    console.log(`2) Yahoo indirme: ${tum.length} sembol`);
    for (const y of tum) {
      const dosya = path.join(DIR, dosyaAdi(y));
      if (bayrak('--eksik') && fs.existsSync(dosya)) continue;
      const x = await getir(y);
      if (!x) { console.log(`   ✗ ${y.padEnd(8)} Yahoo'da yok`); yok[y] = true; await bekle(300); continue; }
      const v = donustur(y, x);
      fs.writeFileSync(dosya, JSON.stringify(v));
      console.log(`   ✓ ${y.padEnd(8)} ${v.gunler.length} gün ${v.gunler.length ? tarih(v.gunler[0].t) : ''} → ${v.gunler.length ? tarih(v.gunler[v.gunler.length - 1].t) : ''} · ${v.ad || ''}`);
      await bekle(350);
    }
  }

  console.log('3) Denetim');
  const refV = JSON.parse(fs.readFileSync(path.join(DIR, dosyaAdi(REF_TAKVIM)), 'utf8'));
  const ref = refV.gunler.filter(x => x.c > 0).map(x => x.t);
  const rapor = {}, seriBilgi = new Map();
  for (const y of [...ENDEKS, ...ETF, ...hisseler]) {
    if (rapor[y]) continue;
    const f = path.join(DIR, dosyaAdi(y));
    if (!fs.existsSync(f)) { rapor[y] = { yok: true }; continue; }
    const v = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!v.gunler.length) { rapor[y] = { bos: true }; continue; }
    rapor[y] = denetle(v, ref);
    seriBilgi.set(y, { ilkT: v.gunler[0].t, sonT: v.gunler[v.gunler.length - 1].t, ad: v.ad });
  }
  const ar = araliklariDenetle(uy, seriBilgi);
  const kap = kapsama(uy, seriBilgi, ar.gecersiz);
  const yillik = {};
  for (const [ay, k] of Object.entries(kap)) { const y = ay.slice(0, 4); (yillik[y] = yillik[y] || []).push(k.oran); }
  const yillikOzet = Object.fromEntries(Object.entries(yillik).map(([y, a]) => [y, { ort: +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(3), min: Math.min(...a) }]));

  const meta = {
    tarih: new Date().toISOString(), yontem: 'scripts/nasdaq-indir.js başlığı', kaynak: uy.kaynak, takmaAd: TAKMA_AD,
    guven: uy.guven, anlikKaynak: uy.anlikKaynak, araliklar: uy.araliklar, adlar: uy.adlar,
    duzeltmeler: uy.duzeltmeler, uyumsuz: uy.uyumsuz, dogrulama: uy.dogrulama, gecis: uy.gecis,
    gecersiz: ar.gecersiz, kismi: ar.kismi,
  };
  fs.writeFileSync(path.join(DIR, 'uyelik-meta.json'), JSON.stringify(meta, null, 1));
  const gruplar = { endeks: ENDEKS, etf: ETF, hisse: hisseler };
  fs.writeFileSync(path.join(DIR, '_denetim.json'), JSON.stringify({
    tarih: new Date().toISOString(), referansTakvim: REF_TAKVIM, gruplar,
    seri: rapor, yahoodaYok: Object.keys(rapor).filter(k => rapor[k].yok),
    uyelik: { gecersizAralik: ar.gecersiz, kismiAralik: ar.kismi, adUyusmaz: ar.adUyusmaz, yillikKapsama: yillikOzet, aylikKapsama: kap },
  }, null, 1));

  for (const y of [...ENDEKS, ...ETF]) {
    const d = rapor[y];
    if (!d || d.yok) { console.log(`   ${y.padEnd(8)} YOK`); continue; }
    console.log(`   ${y.padEnd(8)} ${String(d.gun).padStart(5)} gün ${d.ilk} → ${d.son} · eksik ${d.eksikGun} · fazla ${d.fazlaGun} · sıfır ${d.sifir} · OHLC boş ${d.ohlcBos} · tutarsız ${d.ohlcTutarsiz} · hacim0 ${d.hacimSifir} · sıçrama ${d.sicrama.length} · k>1 ${d.duzeltme.kBuyuk} · olaysız k ${d.duzeltme.olaysizSicrama}`);
  }
  const hv = hisseler.filter(h => rapor[h] && !rapor[h].yok);
  console.log(`   hisse: ${hv.length}/${hisseler.length} Yahoo'da var · geçersiz aralık ${ar.gecersiz.length} · kısmi ${ar.kismi.length} · ad uyuşmaz ${ar.adUyusmaz.join(' ') || '—'}`);
  console.log('   yıllık kapsama (ay başı üyelerin veri oranı, ort/min): ' + Object.entries(yillikOzet).map(([y, k]) => `${y} ${(k.ort * 100).toFixed(0)}/${(k.min * 100).toFixed(0)}`).join(' · '));
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
// Ayrıştırıcılar ve eşlemeler dışa açık (lib/tasarimci/uyelik.js canlı aylık üyeliği AYNI kodla kurar); betiğin davranışı değişmez.
module.exports = { ENDEKS, ETF, TAKMA_AD, AD_ONAY, DUZELTME, DIR, dosyaAdi, anlikListe, degisimTablosu, guncelListe, anahtar, duzeltmeUygula, temizle };
