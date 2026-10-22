/**
 * PORTFÖY KARAR MOTORU — KAYNAK BAĞDAŞTIRICILARI (katalog.js ve seri.js kullanır; doğrudan çağırmaya gerek yok).
 *
 * Her kaynak iki iş yapar:
 *   listele()            → [varlık meta]  (katalog satırı; bkz. katalog.js "Varlık alanları")
 *   seviye(varlik, ops)  → { satirlar: [{t, v}] (artan, v > 0, YEREL para biriminde seviye), para, notlar? }
 *   imza()               → kaynağın disk önbelleği anahtarı (değişince katalogdaki o kaynak yeniden kurulur)
 *
 * Kaynaklar ve kurallar
 *   yahoo     data/portfoy/yahoo (L1 indirmeleri, ÖNCELİKLİ) > data/nasdaq > data/gercek-varlik. Seviye = Yahoo adjclose
 *             (temettü + bölünme dahil; nasdaqVeri.duzeltilmis ile aynı filtre: c > 0 ve ac > 0). Endeksler (^…) fiyat
 *             endeksidir → temettüsüz. ^IRX listelenmez (getiri oranıdır → nakit:tbill). USDTRY=X listelenmez (kur → tr:tl-nakit).
 *             Döviz: EURUSD=X / GBPUSD=X / AUDUSD=X = 1 birim dövizin USD değeri (seviye = fiyat); JPY=X / CHF=X / CAD=X =
 *             USD başına döviz → döviz tutmanın USD değeri = 1 / fiyat (para USD olarak verilir).
 *   tefas     Fon listesi data/portfoy/tefas-ham ay dosyalarından (TEFAS'taki TÜM YAT fonları, 2021-10-07 →). Fon serisi
 *             data/portfoy/tefas (portfoyVeri'nin temsilci/aday dosyaları) ya da data/portfoy/tefas-ek (L1) → 'hazir';
 *             diğerleri 'indirilebilir' (ham aylardan AĞSIZ kurulur: indir({kaynak:'tefas', kod})). Fiyat bölünme/sıfırlamaya
 *             göre düzeltilir (portfoyVeri.bolunmeDuzelt). tefasHizalama 'degerleme' (vars.): D tarihli fiyat önceki fiyat
 *             gününe yazılır (portfoyVeri.kolSerileri ile AYNI; gerekçe orada) | 'islem'.
 *   tr        tr:mevduat = TCMB EVDS MT01 1 aya kadar vadeli TL, stopaj SONRASI, ay başı yenileme, ay içi basit faiz
 *             (portfoyVeri.mevduatTLGunluk). tr:tl-nakit = faizsiz TL (seviye 1).
 *   strateji  lib/research/bindirme.js (Hücum, Denge, BTC al-tut, BTC O-GC ayağı) ve data/arastirma/nasdaq-yeni-aileler-
 *             getiri.json (N1). Hücum/Denge pahalı (≈15 sn) → seviye disk önbelleği (anahtar: kol önbelleği dosyasının imzası).
 *             ops.senaryo (yalnız hucum/denge): 'i' ölçüldüğü gibi | 'ii' günlük ½ bot + ½ BTC al-tut | 'iii' BTC al-tut
 *             (PLAN-PORTFOY Y3 ile aynı tanım).
 *   kripto    data/market.db Binance günlük: SPOT varsa spot kapanış (asıl elde tutulan varlık), yoksa USDⓈ-M perp kapanışı
 *             (spot vekili; funding hariç). USDT = USD kabul. + kripto:BTC-bitstamp (data/gercek, 2011 →, uzun vekil).
 *   nakit     nakit:usd (0 getiri), nakit:tbill (^IRX 13 haftalık T-bill iskonto oranı; günlük getiri = önceki gözlemin
 *             oranı × takvim günü / 360 — iskonto→getiri dönüşümü yapılmadı, yaklaşık; data/portfoy/yahoo/_IRX.json).
 */
const fs = require('fs');
const path = require('path');
const O = require('./ortak');
const { GUN, yollar, tarihT, tStr, jsonOku } = O;

// ═══ YAHOO ════════════════════════════════════════════════════════════════════
// data/gercek-varlik dosyalarında ad/para yok (yalnız [tarih, adjclose]); scripts/gercek-h2-varliklar.js listesinden.
const GV_AD = {
  '^GSPC': 'S&P 500', '^NDX': 'Nasdaq 100', '^DJI': 'Dow Jones', '^RUT': 'Russell 2000', '^GDAXI': 'DAX', '^FTSE': 'FTSE 100',
  '^N225': 'Nikkei 225', '^HSI': 'Hang Seng', '^FCHI': 'CAC 40', '^STOXX50E': 'Euro Stoxx 50', EEM: 'MSCI EM ETF', '^BVSP': 'Bovespa',
  'XU100.IS': 'BIST 100', '^AXJO': 'ASX 200', '^KS11': 'KOSPI', 'GC=F': 'Altın (vadeli)', 'SI=F': 'Gümüş (vadeli)', 'CL=F': 'Ham petrol (vadeli)',
  'HG=F': 'Bakır (vadeli)', 'NG=F': 'Doğal gaz (vadeli)', 'ZC=F': 'Mısır (vadeli)', 'ZW=F': 'Buğday (vadeli)', 'ZS=F': 'Soya (vadeli)', 'PL=F': 'Platin (vadeli)',
  TLT: 'TLT 20+ yıl ABD hazine', IEF: 'IEF 7-10 yıl ABD hazine', 'EURUSD=X': 'EUR (döviz)', 'JPY=X': 'JPY (döviz)', 'GBPUSD=X': 'GBP (döviz)',
  'AUDUSD=X': 'AUD (döviz)', 'CHF=X': 'CHF (döviz)', 'CAD=X': 'CAD (döviz)', 'ETH-USD': 'Ethereum (Yahoo)', 'LTC-USD': 'Litecoin (Yahoo)',
  'XRP-USD': 'XRP (Yahoo)', 'BCH-USD': 'Bitcoin Cash (Yahoo)', 'USDTRY=X': 'USD/TRY',
};
const ENDEKS_PARA = {
  '^GDAXI': 'EUR', '^FCHI': 'EUR', '^STOXX50E': 'EUR', '^FTSE': 'GBP', '^N225': 'JPY', '^HSI': 'HKD', '^BVSP': 'BRL',
  'XU100.IS': 'TRY', '^AXJO': 'AUD', '^KS11': 'KRW',
};
/** Döviz tutma: USD başına döviz kotasyonu → ters çevrilir. */
const TERS_DOVIZ = new Set(['JPY=X', 'CHF=X', 'CAD=X']);
const TAHVIL_ETF = new Set(['TLT', 'IEF', 'SHY', 'HYG', 'LQD', 'BND', 'AGG', 'TIP', 'BIL', 'SGOV', 'IEI', 'GOVT', 'VGSH', 'EMB']);
const EMTIA_ETF = new Set(['GLD', 'SLV', 'USO', 'DBC', 'IAU', 'GLDM', 'PDBC', 'UNG']);
const DOVIZ_ETF = new Set(['UUP', 'FXE', 'FXY']);
const KRIPTO_ETF = new Set(['BITO', 'IBIT', 'FBTC', 'ETHA', 'GBTC']);
const KALDIRACLI = new Set(['TQQQ', 'QLD', 'SSO', 'UPRO', 'SPXL', 'SOXL', 'TMF']);
const AYRI_NAKIT = new Set(['^IRX']);         // nakit:tbill olarak sunulur
const AYRI_KUR = new Set(['USDTRY=X']);       // tr:tl-nakit ve kur dönüşümü
const ENAZ_GOZLEM = 20;

function yahooDizinleri() {
  const Y = yollar(), d = { yahoo: Y.yahoo, nasdaq: Y.nasdaq, 'gercek-varlik': Y.gercekVarlik };
  return O.ortamAl().yahooOncelik.map(ad => [ad, d[ad]]);
}
const _yahooOku = new O.Bellek(300);
/** Bir Yahoo dosyasını okur → { sembol, ad, para, tur, borsa, satirlar:[{t,v}] }. */
function yahooDosyaOku(dosya) {
  const im = O.imza(dosya);
  const onb = _yahooOku.al(dosya);
  if (onb && onb.im === im) return onb.x;
  const j = jsonOku(dosya);
  let satirlar;
  if (Array.isArray(j.gunler)) {
    satirlar = [];
    for (const g of j.gunler) if (g.c > 0 && g.ac > 0) satirlar.push({ t: g.t, v: g.ac });
  } else if (Array.isArray(j.seri)) {
    satirlar = j.seri.filter(x => x[1] > 0 && Number.isFinite(x[1])).map(([d, v]) => ({ t: tarihT(d), v }));
  } else throw new Error(`yahoo: tanınmayan dosya biçimi ${dosya}`);
  const x = { sembol: j.sembol, ad: j.ad || null, para: j.para || null, tur: j.tur || null, borsa: j.borsa || null, satirlar, bicim: j.gunler ? 'ohlc' : 'kapanis', indirme: j.indirme || null };
  _yahooOku.koy(dosya, { im, x });
  return x;
}

/** sembol → { dosya, dizin } öncelik sırasıyla (yoksa null). */
function yahooBul(sembol) {
  for (const [ad, dir] of yahooDizinleri()) {
    const p = path.join(dir, O.yahooDosyaAdi(sembol));
    if (fs.existsSync(p)) return { dosya: p, dizin: ad };
    // gercek-varlik dosya adı '-' korur (ETH-USD.json)
    const p2 = path.join(dir, String(sembol).replace(/[^A-Za-z0-9.-]/g, '_') + '.json');
    if (p2 !== p && fs.existsSync(p2)) return { dosya: p2, dizin: ad };
  }
  return null;
}

let _n100 = null;
function nasdaq100Uyelik() {
  if (_n100) return _n100;
  _n100 = { guncel: new Set(), hic: new Set(), sonAy: null };
  try {
    const u = jsonOku(path.join(yollar().nasdaq, 'uyelik.json'));
    const aylar = Object.keys(u).sort();
    _n100.sonAy = aylar[aylar.length - 1];
    for (const a of aylar) for (const s of u[a]) _n100.hic.add(s);
    for (const s of u[_n100.sonAy] || []) _n100.guncel.add(s);
  } catch (e) { /* üyelik yok → etiket verilmez */ }
  return _n100;
}

function yahooSinifla(s, tur, para) {
  const n100 = nasdaq100Uyelik();
  const et = [], not = [];
  let sinif, alt = null, hesap = 'abd-araci';
  if (s.startsWith('^') || tur === 'INDEX' || s === 'XU100.IS') {
    sinif = 'hisse-endeks'; alt = 'endeks'; hesap = 'yok';
    not.push(s === '^GDAXI' ? 'performans endeksi (temettü dahil)' : 'fiyat endeksi — temettüsüz');
    not.push('doğrudan alınamaz; ETF/fon vekili kullan');
  } else if (/=F$/.test(s) || tur === 'FUTURE') {
    sinif = s === 'NQ=F' || s === 'ES=F' ? 'hisse-endeks' : 'emtia'; alt = 'vadeli'; hesap = 'yok';
    not.push('vadeli kontrat zinciri — devir ve teminat faizi hariç; ETF muadili tercih edilir');
  } else if (/=X$/.test(s) || tur === 'CURRENCY') {
    sinif = 'doviz'; alt = 'doviz'; hesap = 'tr-banka';
    not.push('faizsiz döviz tutma (USD karşısı)');
  } else if (/-USD$/.test(s) || tur === 'CRYPTOCURRENCY') {
    sinif = 'kripto'; alt = 'coin'; hesap = 'binance';
    not.push('Yahoo (7/24) fiyatı');
  } else if (tur === 'EQUITY') {
    sinif = 'hisse'; alt = 'tek hisse';
    if (n100.hic.has(s)) { et.push(n100.guncel.has(s) ? 'nasdaq-100-guncel' : 'nasdaq-100-eski'); alt = 'Nasdaq-100 hissesi'; }
    not.push('tek hisse — hayatta kalma yanlılığı (delist olanların çoğu veride yok)');
  } else if (tur === 'MUTUALFUND') {
    sinif = 'fon'; alt = 'ABD yatırım fonu';
  } else {
    // ETF (ya da bilinmeyen tür)
    if (TAHVIL_ETF.has(s)) { sinif = 'tahvil'; alt = 'ABD tahvil ETF'; }
    else if (EMTIA_ETF.has(s)) { sinif = 'emtia'; alt = 'emtia ETF'; }
    else if (DOVIZ_ETF.has(s)) { sinif = 'doviz'; alt = 'döviz ETF'; }
    else if (KRIPTO_ETF.has(s)) { sinif = 'kripto'; alt = 'kripto ETF'; }
    else { sinif = 'hisse-endeks'; alt = s === 'VNQ' ? 'gayrimenkul (REIT) ETF' : /^XL/.test(s) ? 'sektör ETF' : 'endeks ETF'; }
    not.push('ETF — adjclose (temettü dahil, gider oranı fiyatta)');
  }
  if (KALDIRACLI.has(s)) { et.push('kaldiracli'); not.push('kaldıraçlı ETF — günlük yeniden dengeleme aşınması'); }
  if (para && para !== 'USD' && !TERS_DOVIZ.has(s) && !/USD=X$/.test(s)) et.push('usd-disi:' + para);
  return { sinif, alt, hesap, et, not };
}

function yahooListele() {
  const gorulen = new Map();   // sembol → meta
  for (const [dizinAd, dir] of yahooDizinleri()) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('.json') || f.startsWith('_denetim') || f.startsWith('uyelik') || f === 'h2-sonuc.json') continue;
      const dosya = path.join(dir, f);
      let x;
      try { x = yahooDosyaOku(dosya); } catch (e) { continue; }
      if (!x.sembol || !x.satirlar.length) continue;
      const s = x.sembol;
      if (gorulen.has(s)) { if (gorulen.get(s).ek) gorulen.get(s).ek.yedekKaynaklar.push(`${dizinAd}/${f}`); continue; }
      if (AYRI_NAKIT.has(s) || AYRI_KUR.has(s)) continue;
      if (x.satirlar.length < ENAZ_GOZLEM) {   // kullanılamaz (ör. data/nasdaq/EA.json tek gün) → katalog dışı, raporlanır
        gorulen.set(s, { kimlik: 'yahoo:' + s, _disarida: `yalnız ${x.satirlar.length} gözlem (< ${ENAZ_GOZLEM}) — data/${dizinAd}/${f}` });
        continue;
      }
      let para = x.para || ENDEKS_PARA[s] || 'USD';
      if (TERS_DOVIZ.has(s) || /USD=X$/.test(s)) para = 'USD';
      const k = yahooSinifla(s, x.tur || (s.startsWith('^') ? 'INDEX' : null), para);
      const ad = x.ad || GV_AD[s] || s;
      gorulen.set(s, {
        kimlik: 'yahoo:' + s, ad: TERS_DOVIZ.has(s) || /USD=X$/.test(s) ? GV_AD[s] || ad : ad,
        sinif: k.sinif, altKategori: k.alt, paraBirimi: para,
        ilkTarih: tStr(x.satirlar[0].t), sonTarih: tStr(x.satirlar[x.satirlar.length - 1].t), gunSayisi: x.satirlar.length,
        kaynak: `Yahoo ${s} (${dizinAd === 'gercek-varlik' ? 'adjclose' : 'adjclose, OHLCV'}) — data/${dizinAd === 'yahoo' ? 'portfoy/yahoo' : dizinAd}/${f}`,
        hesap: k.hesap, not: k.not.join('; '), etiketler: k.et, durum: 'hazir',
        ek: { sembol: s, dizin: dizinAd, dosya: path.relative(O.PROJE, dosya).replace(/\\/g, '/'), yedekKaynaklar: [], indirme: x.indirme },
      });
    }
  }
  return [...gorulen.values()];
}

function yahooSeviye(v) {
  const s = v.ek.sembol, b = yahooBul(s);
  if (!b) throw new Error(`yahoo: ${s} verisi yok — indir({ kaynak: 'yahoo', sembol: '${s}' })`);
  const x = yahooDosyaOku(b.dosya);
  let satirlar = x.satirlar;
  if (TERS_DOVIZ.has(s)) satirlar = satirlar.map(r => ({ t: r.t, v: 1 / r.v }));
  return { satirlar, para: v.paraBirimi };
}

function yahooImza() {
  const parca = [];
  for (const [, dir] of yahooDizinleri()) {
    if (!fs.existsSync(dir)) { parca.push('-'); continue; }
    const l = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    let mt = 0, top = 0;
    for (const f of l) { try { const st = fs.statSync(path.join(dir, f)); mt = Math.max(mt, st.mtimeMs); top += st.size; } catch (e) { /* yarışta silinmiş */ } }
    parca.push(`${l.length}:${Math.round(mt)}:${top}`);
  }
  return 'yahoo|' + parca.join('|') + '|' + (O.imza(path.join(yollar().nasdaq, 'uyelik.json')) || '-');
}

// ═══ TEFAS ════════════════════════════════════════════════════════════════════
const pvYukle = () => require('../research/portfoyVeri');

function hamDosyalar() {
  const d = yollar().tefasHam;
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => /^\d{4}-\d{2}\.json\.gz$/.test(f)).sort().map(f => path.join(d, f));
}

/** Ham aylar → fon özeti (tek geçiş, ~1 sn). kodlar verilirse o fonların satırlarını da toplar. */
function hamTara(kodlar) {
  const pv = pvYukle();
  const fon = new Map(), satir = new Map();
  if (kodlar) for (const k of kodlar) satir.set(k, []);
  let veriBas = null, veriSon = null;
  for (const f of hamDosyalar()) {
    const h = pv.hamAyOku(f);
    for (const s of h.satirlar) {
      const [kod, tarih, fiyat, buyukluk, kisi] = s;
      if (!(fiyat > 0)) continue;
      if (veriBas == null || tarih < veriBas) veriBas = tarih;
      if (veriSon == null || tarih > veriSon) veriSon = tarih;
      let x = fon.get(kod);
      if (!x) { x = { kod, ilk: tarih, son: tarih, n: 0, ad: h.unvan[kod], buyukluk, kisi }; fon.set(kod, x); }
      if (tarih < x.ilk) x.ilk = tarih;
      if (tarih >= x.son) { x.son = tarih; x.ad = h.unvan[kod] || x.ad; x.buyukluk = buyukluk; x.kisi = kisi; }
      x.n++;
      if (satir.has(kod)) satir.get(kod).push([s[1], s[2], s[3], s[4], s[5]]);
    }
  }
  for (const g of satir.values()) g.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { fon, satir, veriBas, veriSon };
}

function tefasFonDosyasi(kod) {
  const Y = yollar();
  for (const d of [Y.tefasFon, Y.tefasEk]) { const p = path.join(d, kod + '.json'); if (fs.existsSync(p)) return p; }
  return null;
}

const _tefasOku = new O.Bellek(200);
/** Fon dosyası → [{t, tarih, fiyat}] bölünmeye göre düzeltilmiş TL (portfoyVeri.tefasSeri ile aynı işlem). */
function tefasFonOku(kod) {
  const p = tefasFonDosyasi(kod);
  if (!p) return null;
  const im = O.imza(p), onb = _tefasOku.al(p);
  if (onb && onb.im === im) return onb.x;
  const j = jsonOku(p);
  const ham = j.gunler.map(([tarih, fiyat, buyukluk, kisi, pay]) => ({ tarih, fiyat, buyukluk, kisi, pay })).filter(x => x.fiyat > 0);
  const { gunler } = pvYukle().bolunmeDuzelt(ham);
  const x = gunler.map(g => ({ t: tarihT(g.tarih), tarih: g.tarih, fiyat: g.fiyat }));
  _tefasOku.koy(p, { im, x });
  return x;
}

function tefasListele() {
  const pv = pvYukle();
  const Y = yollar();
  const { fon, veriSon } = hamTara();
  if (!fon.size) return [];
  let kat = null, tem = null;
  try { kat = jsonOku(Y.tefasKatalog).fonlar; } catch (e) { kat = null; }
  try { tem = jsonOku(Y.tefasTemsilci).temsilciler; } catch (e) { tem = null; }
  const temsilciKat = new Map();
  if (tem) for (const [k, x] of Object.entries(tem)) if (x.kod) temsilciKat.set(x.kod, k);
  const kapanmaSiniri = tStr(tarihT(veriSon) - 10 * GUN);
  const out = [];
  for (const x of [...fon.values()].sort((a, b) => (a.kod < b.kod ? -1 : 1))) {
    const kategori = kat && kat[x.kod] ? kat[x.kod].kategori : pv.tefasKategori(x.ad);
    const dosya = tefasFonDosyasi(x.kod);
    const et = [];
    if (temsilciKat.has(x.kod)) et.push('temsilci:' + temsilciKat.get(x.kod));
    if (x.son < kapanmaSiniri) et.push('kapandi');
    if (kategori === 'dislanan') et.push('nitelikli-yatirimci');
    const ak = pv.altKategori(x.ad);
    if (ak) et.push(ak);
    const notlar = ['TL fiyat; fon ücreti fiyatta, fon stopajı DÜŞÜLMEDİ', 'TEFAS ucu en çok 5 yıl geri veriyor (veri 2021-10 →)'];
    if (kategori === 'dislanan') notlar.push('serbest/özel fon — genel yatırımcıya kapalı');
    if (x.son < kapanmaSiniri) notlar.push(`son fiyat ${x.son} — fon kapanmış/fiyatı kesilmiş`);
    let ilk = x.ilk, son = x.son, n = x.n;
    if (dosya) { const s = tefasFonOku(x.kod); if (s && s.length) { ilk = s[0].tarih; son = s[s.length - 1].tarih; n = s.length; } }
    out.push({
      kimlik: 'tefas:' + x.kod, ad: x.ad, sinif: 'fon',
      altKategori: kategori === 'dislanan' ? 'serbest / özel (dışlanan)' : kategori ? (pv.KATEGORI_ADLARI[kategori] || kategori) : 'sınıflanamadı',
      paraBirimi: 'TRY', ilkTarih: ilk, sonTarih: son, gunSayisi: n,
      kaynak: dosya ? `TEFAS ${x.kod} — ${path.relative(O.PROJE, dosya).replace(/\\/g, '/')}` : `TEFAS ${x.kod} — data/portfoy/tefas-ham (ağsız kurulabilir)`,
      hesap: 'tefas', not: notlar.join('; '), etiketler: et, durum: dosya ? 'hazir' : 'indirilebilir',
      ek: { kod: x.kod, kategori: kategori || null, buyuklukTL: x.buyukluk || null, kisi: x.kisi || null, buyuklukTarihi: x.son },
    });
  }
  return out;
}

function tefasSeviye(v, ops = {}) {
  const f = tefasFonOku(v.ek.kod);
  if (!f) throw new Error(`tefas: ${v.ek.kod} serisi kurulmamış — indir({ kaynak: 'tefas', kod: '${v.ek.kod}' })`);
  const hz = ops.tefasHizalama || 'degerleme';
  if (hz === 'islem') return { satirlar: f.map(x => ({ t: x.t, v: x.fiyat })), para: 'TRY' };
  const out = [];
  for (let i = 1; i < f.length; i++) out.push({ t: f[i - 1].t, v: f[i].fiyat });
  return { satirlar: out, para: 'TRY' };
}

function tefasImza() {
  const Y = yollar(), h = hamDosyalar();
  const son2 = h.slice(-2).map(p => O.imza(p)).join(',');
  const ek = d => (fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => f + '@' + O.imza(path.join(d, f))).join(',') : '-');
  return `tefas|${h.length}|${son2}|${O.imza(Y.tefasKatalog)}|${O.imza(Y.tefasTemsilci)}|${require('crypto').createHash('md5').update(ek(Y.tefasFon) + ek(Y.tefasEk)).digest('hex')}`;
}

// ═══ TR (mevduat, TL nakit) ══════════════════════════════════════════════════
function trListele() {
  const pv = pvYukle();
  const out = [];
  try {
    const ay = pv.mevduatAylik();
    const ilk = ay[0].t, son = O.bugunT();
    out.push({
      kimlik: 'tr:mevduat', ad: 'TL vadeli mevduat (1 aya kadar, stopaj sonrası)', sinif: 'tl-nakit', altKategori: 'vadeli mevduat',
      paraBirimi: 'TRY', ilkTarih: tStr(ilk), sonTarih: tStr(son), gunSayisi: Math.round((son - ilk) / GUN) + 1,
      kaynak: 'TCMB EVDS TP.TRY.MT01 (akım, haftalık) — data/portfoy/evds-mevduat.json',
      hesap: 'tr-banka', not: 'piyasa ortalaması oran; ay başı 1 aylık yenileme, ay içi basit faiz; stopaj (tarihçeli) DÜŞÜLDÜ; son ay oranı bilinen oranla bugüne dek işletilir',
      etiketler: [], durum: 'hazir', ek: { sonOranAy: ay[ay.length - 1].ay, sonOranYillik: ay[ay.length - 1].oranYillik, stopaj: ay[ay.length - 1].stopaj },
    });
  } catch (e) { /* EVDS yok */ }
  try {
    const k = pv.usdtry();
    out.push({
      kimlik: 'tr:tl-nakit', ad: 'TL nakit (faizsiz)', sinif: 'tl-nakit', altKategori: 'vadesiz',
      paraBirimi: 'TRY', ilkTarih: tStr(k[0].t), sonTarih: tStr(k[k.length - 1].t), gunSayisi: k.length,
      kaynak: 'sabit 1 TL; USD karşılığı Yahoo USDTRY=X', hesap: 'tr-banka', not: 'faiz yok — USD birimde yalnız kur kaybı/kazancı',
      etiketler: [], durum: 'hazir', ek: {},
    });
  } catch (e) { /* kur yok */ }
  return out;
}
function trSeviye(v) {
  const pv = pvYukle();
  if (v.kimlik === 'tr:mevduat') {
    const ilkAy = pv.mevduatAylik()[0].t, bugun = O.bugunT();
    const gunler = [];
    for (let t = ilkAy; t <= bugun; t += GUN) gunler.push(t);
    return { satirlar: pv.mevduatTLGunluk(gunler), para: 'TRY' };
  }
  if (v.kimlik === 'tr:tl-nakit') return { satirlar: pv.usdtry().map(x => ({ t: x.t, v: 1 })), para: 'TRY' };
  throw new Error('tr: bilinmeyen ' + v.kimlik);
}
const trImza = () => `tr|${O.imza(yollar().evds)}|${O.imza(yollar().usdtry)}|${tStr(O.bugunT())}`;

// ═══ STRATEJİ ═════════════════════════════════════════════════════════════════
const N_DOSYA = () => path.join(yollar().arastirma, 'nasdaq-yeni-aileler-getiri.json');
const KOL_ONB = () => path.join(yollar().arastirma, process.env.ONBELLEK_DOSYA || 'capraz-marj-onbellek.json');
const STRATEJI_TANIM = {
  hucum: { ad: 'Kairos (O-GC BTC ×1 + Kalkan kolu ×3)', hesap: 'binance', bot: 1, senaryolu: true },
  denge: { ad: 'Tao (O-GC BTC ×0,5 + Kalkan kolu ×3)', hesap: 'binance', bot: 0.5, senaryolu: true },
  'btc-altut': { ad: 'BTC al-tut (Binance, bot dönemi)', hesap: 'binance' },
  'btc-ogc': { ad: 'BTC O-GC ayağı (SMA50/100/200 rejim, spot maliyet)', hesap: 'binance' },
  'nasdaq-n1': { ad: 'Nasdaq N1 — oynaklık hedefli QQQ (σ̂ 20 g)', hesap: 'abd-araci' },
  // Portföy tasarımcısı F1 (PLAN-PORTFOY-TASARIMCI.md): canlı çekirdekler lib/tasarimci/stratejiler/ — Laboratuvar'da seçilebilir.
  'qqq-m10': { ad: 'Nova · Nasdaq Momentum 10 (830 — PIT Nasdaq-100, 12-1, aylık)', hesap: 'abd-araci', tasarimci: 'm10' },
  'bist-m10': { ad: 'Lydia · BIST Momentum 10 (840 — PIT likidite ilk 30, 12-1, aylık; TL)', hesap: 'tr-banka', tasarimci: 'bistM10', para: 'TRY' },
  kalkan: { ad: 'Kalkan kolu tek başına (Donchian PIT + DCA PIT, ×1)', hesap: 'binance' },
};
const IYIMSER = 'iyimser / örneklem içi (yüzlerce denemeden seçildi) — 3 senaryo ile kullan (i ölçülen, ii fazla getiri yarıya, iii al-tut)';

function bindirmeVarMi() { try { return require('../research/bindirme').veriVarMi(); } catch (e) { return false; } }
const TV = () => require('../tasarimci/veri');
/** Tasarımcı çekirdeğinin verisi var mı + aralığı (simülasyon koşmadan). → { ilk, son, gun } | null */
function tasarimciAralik(id) {
  try {
    const V = TV(), T = require('../tasarimci/takvim');
    if (id === 'qqq-m10') {
      if (!V.seriVarMi('^GSPC') || !V.seriVarMi('QQQ') || !fs.existsSync(path.join(V.dizinler().nasdaq, 'uyelik.json'))) return null;
      V.irx();
      const tk = V.nyseGunleri().filter(t => t >= tarihT('2004-12-31'));
      return tk.length ? { ilk: tStr(tk[0]), son: tStr(tk[tk.length - 1]), gun: tk.length } : null;
    }
    if (id === 'bist-m10') {
      if (!V.seriVarMi('XU030.IS') || !V.seriVarMi('AKBNK.IS')) return null;
      V.tcmbFaiz(); V.usdtry();
      const g = V.ham('XU030.IS').gunler, son = g[g.length - 1].t;
      const gun = T.islemGunleri('2011-12-30', tStr(Math.min(son, Date.UTC(T.KAPSAM.son, 11, 31))), 'BIST').length;
      return { ilk: '2011-12-30', son: tStr(son), gun };
    }
  } catch (e) { return null; }
  return null;
}
const TASARIMCI_NOT = "iyimser / sonradan konmuş ölçütle kabul (H1, ai/01-KARARLAR.md 2026-10-10); çok denemeli aramanın seçilmiş adayı — kırılganlık PLAN SONUÇ'ta";

function stratejiListele() {
  const out = [];
  let kolTs = null;
  if (bindirmeVarMi()) {
    // Aralık: kol önbelleğindeki gün dizisinden (simülasyon çalıştırmadan). Taban günü = ilk gün − 1.
    let ts = null;
    try { ts = require('../research/bindirme').veriYukle().ts; } catch (e) { ts = null; }
    if (ts && ts.length) for (const id of ['hucum', 'denge', 'btc-altut', 'btc-ogc']) {
      const T = STRATEJI_TANIM[id];
      out.push({
        kimlik: 'strateji:' + id, ad: T.ad, sinif: 'strateji', altKategori: 'kripto bot',
        paraBirimi: 'USD', ilkTarih: tStr(ts[0] - GUN), sonTarih: tStr(ts[ts.length - 1]), gunSayisi: ts.length + 1,
        kaynak: `lib/research/bindirme.js ${id === 'hucum' || id === 'denge' ? 'simule' : id === 'btc-altut' ? 'alTut' : 'btcAyagi'} (data/market.db + ${path.basename(KOL_ONB())})`,
        hesap: T.hesap, not: id === 'btc-altut' ? 'kıyas serisi (BTC perp kapanışı, bot takvimi)' : IYIMSER + (id === 'btc-ogc' ? '; Kalkan kolu yok' : ''),
        etiketler: ['iyimser', ...(T.senaryolu ? ['senaryolu'] : [])], durum: 'hazir', ek: { strateji: id, senaryolar: T.senaryolu ? ['i', 'ii', 'iii'] : null },
      });
    }
    kolTs = ts;
  }
  if (fs.existsSync(N_DOSYA())) {
    const j = jsonOku(N_DOSYA()), s = j.seriler.find(x => x.kod === 'N1');
    if (s) out.push({
      kimlik: 'strateji:nasdaq-n1', ad: STRATEJI_TANIM['nasdaq-n1'].ad, sinif: 'strateji', altKategori: 'Nasdaq stratejisi',
      paraBirimi: 'USD', ilkTarih: s.t0, sonTarih: s.ts[s.ts.length - 1], gunSayisi: s.ts.length + 1,
      kaynak: 'data/arastirma/nasdaq-yeni-aileler-getiri.json (N1, maliyet dahil)', hesap: 'abd-araci',
      not: IYIMSER.replace(' — 3 senaryo', ' (kirli holdout adayı) — 3 senaryo') + '; 1999-03 öncesi ^NDX fiyat endeksi (temettüsüz)',
      etiketler: ['iyimser'], durum: 'hazir', ek: { strateji: 'nasdaq-n1' },
    });
  }
  // Portföy tasarımcısı F1 ekleri (mevcut kayıtlardan SONRA; onların sırası ve içeriği değişmez).
  if (kolTs && kolTs.length) out.push({
    kimlik: 'strateji:kalkan', ad: STRATEJI_TANIM.kalkan.ad, sinif: 'strateji', altKategori: 'kripto bot',
    paraBirimi: 'USD', ilkTarih: tStr(kolTs[0] - GUN), sonTarih: tStr(kolTs[kolTs.length - 1]), gunSayisi: kolTs.length + 1,
    kaynak: `lib/research/bindirme.js simule({ btcVar: false, m: 1 }) (data/market.db + ${path.basename(KOL_ONB())})`,
    hesap: 'binance', not: IYIMSER.replace(' — 3 senaryo ile kullan (i ölçülen, ii fazla getiri yarıya, iii al-tut)', '') + '; BTC ayağı yok, kol ×1, canlı risk katmanı simülasyonda yok',
    etiketler: ['iyimser'], durum: 'hazir', ek: { strateji: 'kalkan' },
  });
  for (const id of ['qqq-m10', 'bist-m10']) {
    const a = tasarimciAralik(id), T = STRATEJI_TANIM[id];
    if (!a) continue;
    out.push({
      kimlik: 'strateji:' + id, ad: T.ad, sinif: 'strateji', altKategori: id === 'qqq-m10' ? 'Nasdaq stratejisi' : 'BIST stratejisi',
      paraBirimi: T.para || 'USD', ilkTarih: a.ilk, sonTarih: a.son, gunSayisi: a.gun,
      kaynak: `lib/tasarimci/stratejiler/${T.tasarimci}.js (canlı veri: lib/tasarimci/veri.js; ${id === 'qqq-m10' ? 'scripts/qqq-momentum.js' : 'scripts/bist-yenmek-momentum.js'} ile birebir)`,
      hesap: T.hesap, not: TASARIMCI_NOT + (id === 'bist-m10' ? "; holdout KTLEV'e bağlı, TL eğrisi (USD çevrimi katalog katmanında)" : '; hayatta kalma yanlılığı b ölçüldü'),
      etiketler: ['iyimser'], durum: 'hazir', ek: { strateji: id },
    });
  }
  return out;
}

const egriSeviye = e => e.map(x => ({ t: x.time, v: x.oz })).filter(x => x.v > 0 && Number.isFinite(x.v));
/** Tasarımcı çekirdekleri (qqq-m10, bist-m10): disk önbelleği, anahtar = girdi dosyası imzaları. */
function tasarimciImza(id) {
  const V = TV(), d = V.dizinler();
  const dosyalar = id === 'qqq-m10'
    ? [(V.dosyaBul('^GSPC') || {}).dosya, (V.dosyaBul('QQQ') || {}).dosya, path.join(d.nasdaq, 'uyelik.json'), path.join(d.yahoo, '_IRX.json')]
    : [(V.dosyaBul('XU030.IS') || {}).dosya, path.join(d.portfoy, 'USDTRY_X.json'), path.join(d.bist, 'tcmb-politika-faizi.json'), path.join(d.tasarimci, 'tcmb-faiz-ek.json')];
  let anlik = '';
  try { anlik = id === 'qqq-m10' ? require('../tasarimci/uyelik').anlikAylar().join(',') : ''; } catch (e) { anlik = ''; }
  return dosyalar.map(f => (f ? O.imza(f) || '-' : '-')).join('|') + '|' + anlik;
}
function tasarimciHam(id) {
  const Y = yollar(), im = tasarimciImza(id);
  const p = path.join(Y.seviyeOnbellek, `strateji-${id}.json`);
  if (fs.existsSync(p)) { try { const j = jsonOku(p); if (j.imza === im) return j.satirlar; } catch (e) { /* bozuk → yeniden */ } }
  let satirlar;
  if (id === 'qqq-m10') { const M = require('../tasarimci/stratejiler/m10'); satirlar = egriSeviye(M.kos(M.hazirla()).m10.egri); }
  else { const M = require('../tasarimci/stratejiler/bistM10'); const X = M.hazirla(); satirlar = egriSeviye(M.kos(X).m10.r.egri); }
  O.jsonYaz(p, { imza: im, olusturma: new Date().toISOString(), satirlar });
  return satirlar;
}
function stratejiHam(id) {
  if (STRATEJI_TANIM[id] && STRATEJI_TANIM[id].tasarimci) return tasarimciHam(id);
  // Disk önbelleği: bindirme hesapları pahalı. Anahtar = kol önbelleği dosya imzası + strateji.
  const Y = yollar();
  const im = `${O.imza(KOL_ONB())}|${O.imza(Y.marketDb) ? 'db' : '-'}`;
  const p = path.join(Y.seviyeOnbellek, `strateji-${id}.json`);
  if (fs.existsSync(p)) { try { const j = jsonOku(p); if (j.imza === im) return j.satirlar; } catch (e) { /* bozuk → yeniden */ } }
  const B = require('../research/bindirme');
  let satirlar;
  if (id === 'kalkan') satirlar = egriSeviye(B.simule({ btcVar: false, m: 1 }).egri);
  else if (id === 'hucum') satirlar = egriSeviye(B.simule({ btcPay: 1 }).egri);
  else if (id === 'denge') satirlar = egriSeviye(B.simule({ btcPay: 0.5 }).egri);
  else if (id === 'btc-altut') satirlar = egriSeviye(B.alTut().egri);
  else if (id === 'btc-ogc') satirlar = egriSeviye(B.btcAyagi().egri);
  else throw new Error('strateji: bilinmeyen ' + id);
  O.jsonYaz(p, { imza: im, olusturma: new Date().toISOString(), satirlar });
  return satirlar;
}

/** Senaryo birleşimi: günlük getiri r = a·r_bot + (1−a)·r_AT (a = 1 / 0,5 / 0), ortak günlerde. */
function senaryoBirlestir(bot, at, a) {
  const atM = new Map(at.map(x => [x.t, x.v]));
  const out = [];
  let L = null;
  for (let i = 0; i < bot.length; i++) {
    const t = bot[i].t;
    if (!atM.has(t)) continue;
    if (L == null) { L = 1; out.push({ t, v: L, _b: bot[i].v, _a: atM.get(t) }); continue; }
    const p = out[out.length - 1];
    const rb = bot[i].v / p._b - 1, ra = atM.get(t) / p._a - 1;
    L *= 1 + a * rb + (1 - a) * ra;
    out.push({ t, v: L, _b: bot[i].v, _a: atM.get(t) });
  }
  return out.map(x => ({ t: x.t, v: x.v }));
}

function stratejiSeviye(v, ops = {}) {
  const id = v.ek.strateji;
  if (id === 'nasdaq-n1') {
    const s = jsonOku(N_DOSYA()).seriler.find(x => x.kod === 'N1');
    const out = [{ t: tarihT(s.t0), v: 1 }];
    let L = 1;
    for (let i = 0; i < s.ts.length; i++) { L *= 1 + s.r[i]; out.push({ t: tarihT(s.ts[i]), v: L }); }
    return { satirlar: out, para: 'USD' };
  }
  const sen = ops.senaryo || 'i';
  if (!['i', 'ii', 'iii'].includes(sen)) throw new Error("strateji: senaryo 'i' | 'ii' | 'iii'");
  if (sen !== 'i' && !STRATEJI_TANIM[id].senaryolu) throw new Error(`strateji: ${id} senaryo almaz (yalnız hucum/denge)`);
  if (sen === 'i') return { satirlar: stratejiHam(id), para: (STRATEJI_TANIM[id] && STRATEJI_TANIM[id].para) || 'USD' };
  const bot = stratejiHam(id), at = stratejiHam('btc-altut');
  return { satirlar: senaryoBirlestir(bot, at, sen === 'ii' ? 0.5 : 0), para: 'USD' };
}
const stratejiImza = () => `strateji|${O.imza(KOL_ONB())}|${O.imza(N_DOSYA())}|${(() => { try { return ['qqq-m10', 'bist-m10'].map(tasarimciImza).join('#'); } catch (e) { return '-'; } })()}`;

// ═══ KRİPTO ═══════════════════════════════════════════════════════════════════
const STABIL = /^(USDC|BUSD|TUSD|FDUSD|USDP|DAI|UST|USTC|EUR|GBP|AEUR|PAX|USDE|RLUSD|USD1|BFUSD)\//;
const KRIPTO_PERP_EK = 10;        // spot dışında: son 90 gün $ hacmine göre ilk 10 perp (≥ 3 yıl geçmiş, hâlâ işlemde)
let _db = null;
function db() {
  if (_db) return _db;
  const { DatabaseSync } = require('node:sqlite');
  _db = new DatabaseSync(yollar().marketDb, { readOnly: true });
  return _db;
}

function kriptoListele() {
  const out = [];
  if (fs.existsSync(yollar().marketDb)) {
    let tradfiMi = () => false;
    try { tradfiMi = require('../veri/tradfi').tradfiMi; } catch (e) { /* liste yok */ }
    const ozet = market => db().prepare(`SELECT symbol, COUNT(*) n, MIN(time) i, MAX(time) s FROM candles WHERE venue='binance' AND market=? AND timeframe='1d' GROUP BY symbol`).all(market);
    const spot = ozet('spot').filter(x => !STABIL.test(x.symbol));
    const perp = ozet('perp').filter(x => !STABIL.test(x.symbol) && !tradfiMi(x.symbol));
    const perpSon = Math.max(...perp.map(x => x.s));
    const spotSon = Math.max(...spot.map(x => x.s));
    const hacim = new Map(db().prepare(`SELECT symbol, SUM(volume*close) v FROM candles WHERE venue='binance' AND market='perp' AND timeframe='1d' AND time>? GROUP BY symbol`).all(perpSon - 90 * GUN).map(x => [x.symbol, x.v / 90]));
    const coin = s => s.split('/')[0];
    const adaylar = new Map();
    for (const x of spot) adaylar.set(coin(x.symbol), { spot: x });
    const perpSecim = perp.filter(x => x.s >= perpSon - 10 * GUN && x.s - x.i >= 3 * 365 * GUN)
      .sort((a, b) => (hacim.get(b.symbol) || 0) - (hacim.get(a.symbol) || 0)).slice(0, KRIPTO_PERP_EK);
    for (const x of perp) {
      const c = coin(x.symbol);
      if (adaylar.has(c)) adaylar.get(c).perp = x;
      else if (perpSecim.includes(x)) adaylar.set(c, { perp: x });
    }
    for (const [c, a] of [...adaylar.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
      // Spot tercih: spot verisi perp başından en çok 30 gün sonra başlıyor ve hâlâ güncel ise.
      const spotIyi = a.spot && (!a.perp || a.spot.i <= a.perp.i + 30 * GUN) && (a.spot.s >= spotSon - 10 * GUN || !a.perp);
      const x = spotIyi ? a.spot : a.perp;
      const pazar = spotIyi ? 'spot' : 'perp';
      const guncel = x.s >= (pazar === 'spot' ? spotSon : perpSon) - 10 * GUN;
      const et = [pazar];
      if (!guncel) et.push('veri-kesildi');
      if (hacim.has(a.perp ? a.perp.symbol : '')) et.push('hacim90g:' + Math.round(hacim.get(a.perp.symbol) / 1e6) + 'M$');
      out.push({
        kimlik: 'kripto:' + c, ad: `${c} (Binance ${pazar})`, sinif: 'kripto', altKategori: c === 'BTC' || c === 'ETH' ? 'büyük coin' : 'altcoin',
        paraBirimi: 'USD', ilkTarih: tStr(x.i), sonTarih: tStr(x.s), gunSayisi: x.n,
        kaynak: `data/market.db binance ${pazar} ${x.symbol} 1d kapanış`, hesap: 'binance',
        not: [pazar === 'perp' ? 'perp kapanışı spot vekili (funding hariç)' : 'spot kapanış', 'USDT = USD kabul',
          spotIyi ? null : 'listeye bugünkü hacimle girdi — hayatta kalma yanlılığı', guncel ? null : `veri ${tStr(x.s)}'te kesildi`].filter(Boolean).join('; '),
        etiketler: et, durum: 'hazir', ek: { sembol: x.symbol, pazar },
      });
    }
  }
  const bs = path.join(yollar().gercek, 'bitstamp-btcusd-1d.json');
  if (fs.existsSync(bs)) {
    const m = jsonOku(bs).mumlar.filter(x => x.c > 0);
    out.push({
      kimlik: 'kripto:BTC-bitstamp', ad: 'BTC (Bitstamp BTC/USD, uzun vekil)', sinif: 'kripto', altKategori: 'büyük coin',
      paraBirimi: 'USD', ilkTarih: tStr(m[0].t), sonTarih: tStr(m[m.length - 1].t), gunSayisi: m.length,
      kaynak: 'Bitstamp ohlc — data/gercek/bitstamp-btcusd-1d.json', hesap: 'binance',
      not: 'vekil — 2011 → uzun geçmiş; ilk yıllar sığ piyasa', etiketler: ['vekil'], durum: 'hazir', ek: { dosya: bs },
    });
  }
  return out;
}

function kriptoSeviye(v) {
  if (v.kimlik === 'kripto:BTC-bitstamp') return { satirlar: jsonOku(v.ek.dosya).mumlar.filter(x => x.c > 0).map(x => ({ t: x.t, v: x.c })), para: 'USD' };
  const rows = db().prepare(`SELECT time, close FROM candles WHERE venue='binance' AND market=? AND timeframe='1d' AND symbol=? ORDER BY time`).all(v.ek.pazar, v.ek.sembol);
  return { satirlar: rows.filter(r => r.close > 0).map(r => ({ t: r.time, v: r.close })), para: 'USD' };
}
const kriptoImza = () => `kripto|${tStr(O.bugunT())}|${fs.existsSync(yollar().marketDb)}|${O.imza(path.join(yollar().gercek, 'bitstamp-btcusd-1d.json'))}`;

// ═══ NAKİT ════════════════════════════════════════════════════════════════════
const NAKIT_BAS = Date.UTC(1990, 0, 1);
function irxSatirlari() {
  const b = yahooBul('^IRX');
  if (!b) return null;
  const j = jsonOku(b.dosya);
  const g = Array.isArray(j.gunler) ? j.gunler.filter(x => x.c != null && x.c >= 0).map(x => ({ t: x.t, y: x.c })) : (j.seri || []).map(([d, y]) => ({ t: tarihT(d), y }));
  return { g, dosya: b.dosya };
}
function nakitListele() {
  const bugun = O.bugunT();
  const out = [{
    kimlik: 'nakit:usd', ad: 'USD nakit (faizsiz)', sinif: 'nakit', altKategori: 'USD', paraBirimi: 'USD',
    ilkTarih: tStr(NAKIT_BAS), sonTarih: tStr(bugun), gunSayisi: Math.round((bugun - NAKIT_BAS) / GUN) + 1,
    kaynak: 'sabit (0 getiri)', hesap: 'abd-araci', not: '0 getiri — gerçekte aracı kurumda para piyasası/T-bill getirisi alınabilir (nakit:tbill)',
    etiketler: [], durum: 'hazir', ek: {},
  }];
  const x = irxSatirlari();
  out.push({
    kimlik: 'nakit:tbill', ad: 'ABD T-bill 13 hafta (^IRX)', sinif: 'nakit', altKategori: 'T-bill', paraBirimi: 'USD',
    ilkTarih: x && x.g.length ? tStr(x.g[0].t) : null, sonTarih: x && x.g.length ? tStr(x.g[x.g.length - 1].t) : null, gunSayisi: x ? x.g.length : 0,
    kaynak: 'Yahoo ^IRX (13 haftalık T-bill iskonto oranı, %) — data/portfoy/yahoo/_IRX.json', hesap: 'abd-araci',
    not: 'günlük getiri = önceki gözlem oranı × takvim günü / 360 (iskonto→getiri dönüşümü yok, yaklaşık); fon gideri yok',
    etiketler: [], durum: x ? 'hazir' : 'indirilebilir', ek: { sembol: '^IRX' },
  });
  return out;
}
function nakitSeviye(v) {
  if (v.kimlik === 'nakit:usd') {
    const out = [], bugun = O.bugunT();
    for (let t = NAKIT_BAS; t <= bugun; t += GUN) out.push({ t, v: 1 });
    return { satirlar: out, para: 'USD' };
  }
  const x = irxSatirlari();
  if (!x) throw new Error("nakit:tbill — ^IRX verisi yok: indir({ kaynak: 'yahoo', sembol: '^IRX' })");
  const out = [{ t: x.g[0].t, v: 1 }];
  let L = 1;
  for (let i = 1; i < x.g.length; i++) {
    L *= 1 + (x.g[i - 1].y / 100) * ((x.g[i].t - x.g[i - 1].t) / GUN) / 360;
    out.push({ t: x.g[i].t, v: L });
  }
  return { satirlar: out, para: 'USD' };
}
const nakitImza = () => `nakit|${tStr(O.bugunT())}|${(yahooBul('^IRX') || {}).dosya ? O.imza(yahooBul('^IRX').dosya) : '-'}`;

const KAYNAKLAR = {
  yahoo: { listele: yahooListele, seviye: yahooSeviye, imza: yahooImza },
  tefas: { listele: tefasListele, seviye: tefasSeviye, imza: tefasImza },
  tr: { listele: trListele, seviye: trSeviye, imza: trImza },
  strateji: { listele: stratejiListele, seviye: stratejiSeviye, imza: stratejiImza },
  kripto: { listele: kriptoListele, seviye: kriptoSeviye, imza: kriptoImza },
  nakit: { listele: nakitListele, seviye: nakitSeviye, imza: nakitImza },
};

function onbellekTemizle() {
  _yahooOku.temizle(); _tefasOku.temizle(); _n100 = null;
  if (_db) { try { _db.close(); } catch (e) { /* zaten kapalı */ } _db = null; }
}

module.exports = {
  KAYNAKLAR, onbellekTemizle,
  // indir.js ve öz test kullanır
  yahooBul, yahooDosyaOku, yahooSinifla, hamTara, hamDosyalar, tefasFonDosyasi, tefasFonOku, senaryoBirlestir,
  TERS_DOVIZ, GV_AD, ENDEKS_PARA, STRATEJI_TANIM,
};
