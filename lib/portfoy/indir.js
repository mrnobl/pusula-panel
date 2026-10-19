/**
 * PORTFÖY KARAR MOTORU — İSTEĞE BAĞLI İNDİRME VE GÜNLÜK GÜNCELLEME (L1).
 * Öz test (ağsız, sahte fetch): node scripts/portfoy-katalog-selftest.js
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * API (hepsi async, aksi yazılmadıkça)
 * ═══════════════════════════════════════════════════════════════════════════
 *   indir({ kaynak: 'yahoo', sembol, tam? })  → { kimlik, dosya, gun, ilk, son, yontem: 'tam'|'artimli', yeniGun }
 *        Yahoo v8 chart, günlük, 1970 → bugün; adjclose (temettü + bölünme dahil) saklanır. Dosya: data/portfoy/yahoo/<ad>.json
 *        (data/nasdaq biçimi; bu dizin data/nasdaq ve data/gercek-varlik'ten ÖNCELİKLİDİR — araştırma girdileri değişmez).
 *        Artımlı: dosya varsa son 20 gün istenir; örtüşen günlerde (son gün hariç) c ve adjclose eşitse eklenir, değilse
 *        (yeni temettü/bölünme geçmişi yeniden ölçekledi) TAM indirme. Hatalar: geçersiz sembol, 404 / chart.error →
 *        'Yahoo: bilinmeyen sembol', boş sonuç, 3 denemede HTTP hatası.
 *   indir({ kaynak: 'tefas', kod })           → { kimlik, dosya, gun, ilk, son, ag: bool }
 *        Önce yerel ham aylar (data/portfoy/tefas-ham: TÜM fonlar, 2021-10-07 →) — AĞSIZ. Kod hamda yoksa ham aylar ağdan
 *        tazelenir (yeni fon olabilir), yine yoksa 'TEFAS: bilinmeyen fon kodu'. TEFAS sınırları: başlangıç ≤ 5 yıl geri,
 *        istek ≤ 1 ay, ~6 istek/dk → istekler arası 12 sn, 429'da 65 sn.
 *   tefasKur(kodlar)            (SENKRON) ham aylardan fon dosyası kur/yenile → data/portfoy/tefas (zaten oradaysa) | tefas-ek
 *   tefasHamGuncelle()          tamamlanmamış/eksik ham ayları çeker (tüm fonlar tek istekte; eski satırlar korunur)
 *   kurIndir()                  USDTRY=X → data/portfoy/USDTRY_X.json (portfoyVeri biçimi; gün = İstanbul takvim günü)
 *   evdsMevduatIndir()          TP.TRY.MT01/MT02/MT06 → data/portfoy/evds-mevduat.json (portfoyVeri biçimi)
 *   tufeIndir()                 TÜİK TÜFE 2025=100 (EVDS TP.TUKFIY2025.GENEL, aylık, 2005-01 →) → data/portfoy/tufe.json
 *                               + denetim: eski seri TP.FG.J0 (2003=100, 2026-01'de biter) ile aylık % değişim farkı
 *   guncelle(ops)               GÜNLÜK ARTIMLI GÜNCELLEME (L2 zamanlayıcısı bağlayacak). Adımlar sırayla, her biri ayrı
 *        try/catch: kur → evds → tufe → tefas (ham + hazır fon dosyaları) → yahoo (+ ^IRX). Aynı anda tek çalışma (ikinci çağrı
 *        ilkinin sözünü döndürür). ops: { kur, evds, tufe, tefas: bool (vars. true); yahoo: 'endeks-etf' (vars.: hisse
 *        dışındaki tüm Yahoo serileri) | 'hepsi' | [semboller] | false; yahooAra: ms (vars. 400) }
 *        → { bas, bit, sureSn, adimlar: { ad: { durum: 'tamam'|'hata'|'atlandi', ayrinti, hata? } }, hatalar: n }
 *   Bitince katalog + seri + portfoyVeri önbellekleri düşürülür.
 *   tefasGuncelle(ops) · yahooToplu(semboller, { ara, ilerleme }) · onbellekleriDusur(): guncelle'nin adımları. Veri
 *        orkestratörü (lib/veri/orkestrator.js) kaynak başına bunları ÇAĞIRIR (kopya yok); gece zamanlayıcısı orada.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const O = require('./ortak');
const K = require('./kaynaklar');
const { GUN, yollar, tStr, tarihT } = O;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const pv = () => require('../research/portfoyVeri');
const bekle = ms => O.ortamAl().bekle(ms);
const fetchle = (...a) => O.ortamAl().fetch(...a);

function onbellekleriDusur() {
  require('./katalog').gecersizKil('indir');
  require('./seri').onbellekTemizle();
  try { pv().onbellekTemizle(); } catch (e) { /* yok */ }
}

// ═══ YAHOO ════════════════════════════════════════════════════════════════════
const SEMBOL_RE = /^[A-Za-z0-9.^=\-]{1,24}$/;

/** Ham Yahoo isteği → chart.result[0] | throws. */
async function yahooGetir(sembol, period1) {
  const p1 = period1 != null ? Math.floor(period1 / 1000) : Math.floor(Date.UTC(1970, 0, 2) / 1000);
  const p2 = Math.floor(O.ortamAl().simdi() / 1000) + 86400;
  let sonHata = null;
  for (const host of ['query1', 'query2']) {
    for (let d = 0; d < 3; d++) {
      let r;
      try {
        r = await fetchle(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sembol)}?period1=${p1}&period2=${p2}&interval=1d&events=div%2Csplit`,
          { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
      } catch (e) { sonHata = 'ağ: ' + e.message; await bekle(1500 * (d + 1)); continue; }
      if (r.status === 404) throw new Error(`Yahoo: bilinmeyen sembol '${sembol}' (HTTP 404)`);
      let j = null;
      try { j = await r.json(); } catch (e) { j = null; }
      const err = j && j.chart && j.chart.error;
      if (err) throw new Error(`Yahoo: bilinmeyen sembol '${sembol}' (${err.code || ''} ${err.description || ''})`.trim());
      if (!r.ok) { sonHata = 'HTTP ' + r.status; await bekle(1500 * (d + 1)); continue; }
      const x = j && j.chart && j.chart.result && j.chart.result[0];
      if (!x || !Array.isArray(x.timestamp) || !x.timestamp.length) throw new Error(`Yahoo: '${sembol}' için veri yok (boş sonuç)`);
      return x;
    }
  }
  throw new Error(`Yahoo: '${sembol}' indirilemedi (${sonHata || 'bilinmeyen hata'})`);
}

/** scripts/nasdaq-indir.js donustur ile aynı biçim (t = borsa yerel takvim günü). */
function yahooDonustur(sembol, x) {
  const q = x.indicators.quote[0], ac = (x.indicators.adjclose && x.indicators.adjclose[0].adjclose) || q.close;
  const ofset = (x.meta && x.meta.gmtoffset != null) ? x.meta.gmtoffset : -5 * 3600;
  const gunler = [];
  for (let i = 0; i < x.timestamp.length; i++) {
    const c = q.close[i];
    if (c == null) continue;
    const d = new Date((x.timestamp[i] + ofset) * 1000);
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const satir = { t, o: q.open[i], h: q.high[i], l: q.low[i], c, ac: ac[i] != null ? ac[i] : c, v: q.volume[i] };
    if (gunler.length && gunler[gunler.length - 1].t === t) gunler[gunler.length - 1] = satir; else gunler.push(satir);
  }
  const ev = x.events || {}, m = x.meta || {};
  return {
    sembol, kaynak: 'Yahoo Finance v8 chart', indirme: new Date(O.ortamAl().simdi()).toISOString(),
    para: m.currency || null, tur: m.instrumentType || null, ad: m.longName || m.shortName || null, borsa: m.fullExchangeName || m.exchangeName || null,
    ilkIslem: m.firstTradeDate ? tStr(m.firstTradeDate * 1000) : null,
    gunler,
    temettu: Object.values(ev.dividends || {}).map(d => ({ t: d.date * 1000, miktar: d.amount })).sort((a, b) => a.t - b.t),
    bolunme: Object.values(ev.splits || {}).map(d => ({ t: d.date * 1000, oran: d.splitRatio })).sort((a, b) => a.t - b.t),
  };
}

/** dizin (isteğe bağlı): hedef klasör — vars. data/portfoy/yahoo. Tasarımcı BIST havuzu data/portfoy/yahoo-bist'e yazar (katalog dışı). */
async function yahooIndir(sembol, { tam = false, dizin = null } = {}) {
  if (!SEMBOL_RE.test(String(sembol || ''))) throw new Error(`Yahoo: geçersiz sembol '${sembol}'`);
  const hedef = path.join(dizin || yollar().yahoo, O.yahooDosyaAdi(sembol));
  let eski = null;
  if (!tam && fs.existsSync(hedef)) { try { eski = O.jsonOku(hedef); } catch (e) { eski = null; } }
  if (eski && Array.isArray(eski.gunler) && eski.gunler.length > 5) {
    const sonT = eski.gunler[eski.gunler.length - 1].t;
    const x = yahooDonustur(sembol, await yahooGetir(sembol, sonT - 20 * GUN));
    const eskiM = new Map(eski.gunler.map(g => [g.t, g]));
    let ortak = 0, tutarli = true;
    for (const g of x.gunler) {
      const e = eskiM.get(g.t);
      if (!e || g.t === sonT) continue;
      ortak++;
      if (Math.abs(g.c / e.c - 1) > 1e-4 || Math.abs(g.ac / e.ac - 1) > 1e-6) { tutarli = false; break; }
    }
    if (tutarli && ortak > 0) {
      const yeni = x.gunler.filter(g => g.t >= sonT);
      const gunler = eski.gunler.filter(g => g.t < sonT).concat(yeni);
      const temettu = birlesikOlay(eski.temettu, x.temettu), bolunme = birlesikOlay(eski.bolunme, x.bolunme);
      const kayit = { ...eski, indirme: x.indirme, gunler, temettu, bolunme, para: x.para || eski.para, ad: x.ad || eski.ad };
      O.jsonYaz(hedef, kayit);
      return { kimlik: 'yahoo:' + sembol, dosya: hedef, gun: gunler.length, ilk: tStr(gunler[0].t), son: tStr(gunler[gunler.length - 1].t), yontem: 'artimli', yeniGun: yeni.length - 1 };
    }
  }
  const x = yahooDonustur(sembol, await yahooGetir(sembol, null));
  if (!x.gunler.length) throw new Error(`Yahoo: '${sembol}' için kapanış yok`);
  const oncekiSon = eski && eski.gunler && eski.gunler.length ? eski.gunler[eski.gunler.length - 1].t : null;
  O.jsonYaz(hedef, x);
  return { kimlik: 'yahoo:' + sembol, dosya: hedef, gun: x.gunler.length, ilk: tStr(x.gunler[0].t), son: tStr(x.gunler[x.gunler.length - 1].t), yontem: 'tam',
    yeniGun: oncekiSon == null ? x.gunler.length : x.gunler.filter(g => g.t > oncekiSon).length };
}
function birlesikOlay(a = [], b = []) {
  const m = new Map(); for (const x of [...(a || []), ...(b || [])]) m.set(x.t, x);
  return [...m.values()].sort((p, q) => p.t - q.t);
}

// ═══ TEFAS ════════════════════════════════════════════════════════════════════
const TEFAS_UC = 'https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir';
const istekGovde = (bas, bit) => '{' + [
  '"fonTipi":"YAT"', '"fonKodu":null', '"aramaMetni":null', '"fonTurKod":null', '"fonGrubu":null', '"sfonTurKod":null',
  '"fonTurAciklama":null', '"kurucuKod":null', `"basTarih":"${bas.replace(/-/g, '')}"`, `"bitTarih":"${bit.replace(/-/g, '')}"`,
  '"basSira":1', '"bitSira":200000', '"dil":"TR"', '"sFonTurKod":""', '"fonKod":""', '"fonGrup":""', '"fonUnvanTip":""',
].join(',') + '}';
let _sonTefas = 0;
/** scripts/portfoy-veri-indir.js tefasIstek ile aynı uç, gövde ve hız sınırı (sahte fetch için O.ortam). */
async function tefasIstek(bas, bit, { deneme = 8 } = {}) {
  let sonHata = null;
  for (let d = 0; d < deneme; d++) {
    const b = _sonTefas + 12000 - O.ortamAl().simdi();
    if (b > 0) await bekle(b);
    _sonTefas = O.ortamAl().simdi();
    let r;
    try {
      r = await fetchle(TEFAS_UC, {
        method: 'POST', body: istekGovde(bas, bit), signal: AbortSignal.timeout(180000),
        headers: { 'Content-Type': 'application/json', Accept: '*/*', Origin: 'https://www.tefas.gov.tr', Referer: 'https://www.tefas.gov.tr/tr/fon-verileri', 'User-Agent': UA },
      });
    } catch (e) { sonHata = 'ağ: ' + e.message; await bekle(20000); continue; }
    if (r.status === 429) { sonHata = 'HTTP 429'; await bekle(65000); continue; }
    if (!r.ok) { sonHata = 'HTTP ' + r.status; await bekle(20000); continue; }
    let j;
    try { j = await r.json(); } catch (e) { sonHata = 'JSON çözülemedi'; await bekle(20000); continue; }
    if (j.errorMessage) return { hata: j.errorMessage };
    if (!Array.isArray(j.resultList)) { sonHata = 'beklenmeyen cevap (resultList yok)'; await bekle(20000); continue; }
    if (j.toplamSayi != null && j.resultList.length < j.toplamSayi) { sonHata = `eksik sayfa ${j.resultList.length}/${j.toplamSayi}`; await bekle(20000); continue; }
    return { satirlar: j.resultList };
  }
  throw new Error(`TEFAS ${bas}..${bit} ${deneme} denemede alınamadı (${sonHata})`);
}

async function tefasHamGuncelle({ deneme } = {}) {
  const Y = yollar();
  fs.mkdirSync(Y.tefasHam, { recursive: true });
  const bugun = O.bugunT(), bd = new Date(bugun);
  let sinir = Date.UTC(bd.getUTCFullYear() - 5, bd.getUTCMonth(), bd.getUTCDate());
  const aylar = [];
  for (let t = Date.UTC(new Date(sinir).getUTCFullYear(), new Date(sinir).getUTCMonth(), 1); t <= bugun;) {
    const d = new Date(t); aylar.push(t); t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  const rapor = [];
  for (const ayT of aylar) {
    const d = new Date(ayT), ay = tStr(ayT).slice(0, 7);
    const aySonu = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
    const dosya = path.join(Y.tefasHam, ay + '.json.gz');
    let eski = null;
    if (fs.existsSync(dosya)) { eski = pv().hamAyOku(dosya); if (eski.tam) continue; }
    let bas = tStr(Math.max(ayT, sinir));
    const bit = tStr(Math.min(aySonu, bugun));
    let cevap = await tefasIstek(bas, bit, { deneme });
    for (let k = 0; cevap.hata && /5 yıl/.test(cevap.hata) && k < 40 && bas < bit; k++) {
      sinir += GUN; bas = tStr(Math.max(ayT, sinir)); cevap = await tefasIstek(bas, bit, { deneme });
    }
    if (cevap.hata) throw new Error(`TEFAS ${ay}: ${cevap.hata}`);
    const unvan = Object.assign({}, eski ? eski.unvan : {});
    const harita = new Map();
    if (eski) for (const s of eski.satirlar) harita.set(s[0] + '|' + s[1], s);
    let yeni = 0;
    for (const x of cevap.satirlar) {
      if (!x.fonKodu || !x.tarih) continue;
      const kod = String(x.fonKodu).trim().toUpperCase(), tarih = String(x.tarih).slice(0, 10);
      unvan[kod] = String(x.fonUnvan || '').trim();
      if (!harita.has(kod + '|' + tarih)) yeni++;
      harita.set(kod + '|' + tarih, [kod, tarih, x.fiyat, x.portfoyBuyukluk, x.kisiSayisi, x.tedPaySayisi]);
    }
    const satirlar = [...harita.values()].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : 1));
    const tam = bit === tStr(aySonu) && bugun >= aySonu + 5 * GUN;
    fs.writeFileSync(dosya + '.tmp', zlib.gzipSync(JSON.stringify({ ay, bas: eski && eski.bas < bas ? eski.bas : bas, bit, indirme: new Date(O.ortamAl().simdi()).toISOString(), tam, unvan, satirlar })));
    fs.renameSync(dosya + '.tmp', dosya);
    rapor.push({ ay, bas, bit, cevapSatir: cevap.satirlar.length, yeniSatir: yeni, tam });
  }
  return rapor;
}

/** SENKRON: ham aylardan fon dosyası kur. Kod hamda yoksa hata (bilinmeyen = 'TEFAS: … ham aylarda yok'). */
function tefasKur(kodlar) {
  const Y = yollar();
  const istek = [...new Set(kodlar.map(k => String(k).trim().toUpperCase()))];
  for (const k of istek) if (!/^[A-Z0-9]{2,6}$/.test(k)) throw new Error(`TEFAS: geçersiz fon kodu '${k}'`);
  const { fon, satir } = K.hamTara(istek);
  const out = {};
  const kat = (() => { try { return O.jsonOku(Y.tefasKatalog).fonlar; } catch (e) { return {}; } })();
  for (const kod of istek) {
    const f = fon.get(kod);
    if (!f) throw new Error(`TEFAS: '${kod}' ham aylarda yok`);
    const mevcut = K.tefasFonDosyasi(kod);
    const hedef = mevcut || path.join(Y.tefasEk, kod + '.json');
    const g = satir.get(kod);
    O.jsonYaz(hedef, {
      kod, ad: f.ad, kategori: kat[kod] ? kat[kod].kategori : pv().tefasKategori(f.ad), kaynak: 'TEFAS fonGnlBlgSiraliGetir (ham aylardan, lib/portfoy/indir.js)',
      olusturma: new Date(O.ortamAl().simdi()).toISOString(), sutunlar: ['tarih', 'fiyat', 'portfoyBuyukluk', 'kisiSayisi', 'tedPaySayisi'], gunler: g,
    });
    out[kod] = { dosya: hedef, gun: g.length, ilk: g[0][0], son: g[g.length - 1][0] };
  }
  onbellekleriDusur();
  return out;
}

async function tefasIndir(kod, ops = {}) {
  const k = String(kod || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(k)) throw new Error(`TEFAS: geçersiz fon kodu '${kod}'`);
  let ag = false;
  if (!K.hamTara().fon.has(k)) {
    await tefasHamGuncelle(ops);
    ag = true;
    if (!K.hamTara().fon.has(k)) throw new Error(`TEFAS: bilinmeyen fon kodu '${k}' (son 5 yılda TEFAS YAT fonları arasında yok)`);
  }
  const r = tefasKur([k])[k];
  return { kimlik: 'tefas:' + k, ...r, ag };
}

// ═══ USDTRY, EVDS (mevduat, TÜFE) ════════════════════════════════════════════
async function kurIndir() {
  const x = await yahooGetir('USDTRY=X', Date.UTC(2005, 0, 1));
  const q = x.indicators.quote[0], ac = (x.indicators.adjclose && x.indicators.adjclose[0].adjclose) || q.close;
  const gunler = [];
  for (let i = 0; i < x.timestamp.length; i++) {
    if (q.close[i] == null) continue;
    const dd = new Date((x.timestamp[i] + 3 * 3600) * 1000);   // İstanbul takvim günü (portfoy-veri-indir ile aynı)
    const t = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate());
    const s = { t, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], ac: ac[i], v: q.volume[i] };
    if (gunler.length && gunler[gunler.length - 1].t === t) gunler[gunler.length - 1] = s; else gunler.push(s);
  }
  if (gunler.length < 1000) throw new Error(`USDTRY: beklenenden az gün (${gunler.length}) — dosya değiştirilmedi`);
  O.jsonYaz(yollar().usdtry, { sembol: 'USDTRY=X', kaynak: 'Yahoo Finance v8 chart', indirme: new Date(O.ortamAl().simdi()).toISOString(), para: 'TRY', gunler });
  return { gun: gunler.length, ilk: tStr(gunler[0].t), son: tStr(gunler[gunler.length - 1].t) };
}

const EVDS_UC = 'https://evds3.tcmb.gov.tr/igmevdsms-dis/fe';
const g2 = n => String(n).padStart(2, '0');
async function evdsIstek(seriler, { frekans, bas }) {
  const b = new Date(O.ortamAl().simdi());
  const govde = {
    type: 'json', series: seriler.join('-'), aggregationTypes: seriler.map(() => 'avg').join('-'), formulas: seriler.map(() => '0').join('-'),
    startDate: bas, endDate: `${g2(b.getUTCDate())}-${g2(b.getUTCMonth() + 1)}-${b.getUTCFullYear()}`,
    frequency: frekans, decimalSeperator: '.', decimal: '4', dateFormat: '0', lang: 'tr', yon: '', sira: '', ozelFormuller: [],
    groupSeperator: false, isRaporSayfasi: false,
  };
  let sonHata = null;
  for (let d = 0; d < 3; d++) {
    let r;
    try { r = await fetchle(EVDS_UC, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify(govde), signal: AbortSignal.timeout(120000) }); }
    catch (e) { sonHata = 'ağ: ' + e.message; await bekle(3000); continue; }
    if (!r.ok) { sonHata = 'HTTP ' + r.status; await bekle(3000 * (d + 1)); continue; }
    let j; try { j = await r.json(); } catch (e) { sonHata = 'JSON çözülemedi'; continue; }
    if (!j || !Array.isArray(j.items)) { sonHata = 'beklenmeyen cevap (items yok)'; continue; }
    return j;
  }
  throw new Error(`EVDS ${seriler.join(',')}: alınamadı (${sonHata})`);
}
const sayiAl = v => (v == null || v === '' ? null : +String(v).replace(/,/g, ''));

async function evdsMevduatIndir() {
  const seriler = ['TP.TRY.MT01', 'TP.TRY.MT02', 'TP.TRY.MT06'];
  const j = await evdsIstek(seriler, { frekans: '3', bas: '01-01-2005' });
  const out = { kaynak: 'TCMB EVDS3 (evds3.tcmb.gov.tr/igmevdsms-dis/fe, anahtarsız), haftalık, Cuma tarihli', indirme: new Date(O.ortamAl().simdi()).toISOString(), adlar: j.seriesNames };
  for (const s of seriler) {
    const k = s.replace(/\./g, '_');
    out[s.split('.').pop()] = j.items.map(x => { const [dd, mm, yy] = x.Tarih.split('-'); return { tarih: `${yy}-${mm}-${dd}`, oran: sayiAl(x[k]) }; });
  }
  if (out.MT01.filter(x => x.oran > 0).length < 500) throw new Error('EVDS mevduat: beklenenden az gözlem — dosya değiştirilmedi');
  O.jsonYaz(yollar().evds, out, 1);
  return { hafta: out.MT01.length, son: out.MT01[out.MT01.length - 1].tarih };
}

const TUFE_SERI = 'TP.TUKFIY2025.GENEL', TUFE_ESKI = 'TP.FG.J0';
async function tufeIndir() {
  const j = await evdsIstek([TUFE_SERI], { frekans: '5', bas: '01-01-2003' });
  const k = TUFE_SERI.replace(/\./g, '_');
  const aylik = j.items.map(x => ({ ay: String(x.Tarih).slice(0, 7), deger: sayiAl(x[k]) })).filter(x => /^\d{4}-\d{2}$/.test(x.ay) && x.deger > 0);
  if (aylik.length < 100) throw new Error(`TÜFE: beklenenden az ay (${aylik.length}) — dosya değiştirilmedi`);
  for (let i = 1; i < aylik.length; i++) {
    const a = aylik[i - 1].ay, b = aylik[i].ay;
    const beklenen = tStr(Date.UTC(+a.slice(0, 4), +a.slice(5, 7), 1)).slice(0, 7);
    if (b !== beklenen) throw new Error(`TÜFE: ay boşluğu ${a} → ${b}`);
  }
  // Denetim: eski seri (2003=100) ile aylık değişim karşılaştırması (baz değişimi oranları değiştirmemeli).
  let denetim = null;
  try {
    const e = await evdsIstek([TUFE_ESKI], { frekans: '5', bas: '01-01-2003' });
    const ke = TUFE_ESKI.replace(/\./g, '_');
    const eski = new Map(e.items.map(x => [String(x.Tarih).slice(0, 7), sayiAl(x[ke])]).filter(x => x[1] > 0));
    let n = 0, maks = 0, maksAy = null;
    for (let i = 1; i < aylik.length; i++) {
      const a = aylik[i - 1].ay, b = aylik[i].ay;
      if (!eski.has(a) || !eski.has(b)) continue;
      const fark = Math.abs((aylik[i].deger / aylik[i - 1].deger - 1) - (eski.get(b) / eski.get(a) - 1)) * 100;
      n++; if (fark > maks) { maks = fark; maksAy = b; }
    }
    denetim = { eskiSeri: TUFE_ESKI, eskiSon: [...eski.keys()].sort().pop(), ortakAy: n, aylikDegisimMaksFarkPuan: +maks.toFixed(3), maksFarkAy: maksAy };
  } catch (err) { denetim = { hata: err.message }; }
  O.jsonYaz(yollar().tufe, {
    kaynak: `TCMB EVDS3 ${TUFE_SERI} (TÜİK TÜFE genel, 2025=100), aylık`, indirme: new Date(O.ortamAl().simdi()).toISOString(),
    seri: TUFE_SERI, baz: '2025=100', not: 'TÜİK 2026-01 verisiyle bazı 2003=100 → 2025=100 yaptı; eski TP.FG.J0 2026-01\'de biter. Aylık değerin günü = ayın son günü (lib/portfoy/seri.js).',
    denetim, aylik,
  }, 1);
  return { ay: aylik.length, ilk: aylik[0].ay, son: aylik[aylik.length - 1].ay, denetim };
}

// ═══ TOPLU ADIMLAR (guncelle ve lib/veri/orkestrator.js ortak kullanır) ═══════
/** TEFAS: eksik/tamamlanmamış ham aylar (ağ) + data/portfoy/tefas ve tefas-ek'teki hazır fon dosyalarını yeniden kur. */
async function tefasGuncelle(ops = {}) {
  const ham = await tefasHamGuncelle(ops);
  const Y = yollar();
  const kodlar = [Y.tefasFon, Y.tefasEk].flatMap(d => (fs.existsSync(d) ? fs.readdirSync(d).filter(f => /^[A-Z0-9]+\.json$/.test(f)).map(f => f.slice(0, -5)) : []));
  const kur = kodlar.length ? tefasKur(kodlar) : {};
  return { hamAylar: ham, fonDosyasi: Object.keys(kur).length };
}

/**
 * Yahoo sembollerini sırayla artımlı indirir (yahooIndir; istekler arası `ara` ms, vars. 400). Biri düşerse diğerleri
 * sürer; HEPSİ düşerse fırlatır. → { sembol, tamam, artimli, tam, yeniGun, hata: { sembol: mesaj } }.
 * ilerleme(i, n, sembol) her sembolden önce çağrılır.
 */
async function yahooToplu(semboller, { ara, ilerleme, dizin = null } = {}) {
  const sonuc = { tamam: 0, artimli: 0, tam: 0, yeniGun: 0, hata: {} };
  for (let i = 0; i < semboller.length; i++) {
    const s = semboller[i];
    if (ilerleme) { try { ilerleme(i, semboller.length, s); } catch (e) { /* yoksay */ } }
    try { const r = await yahooIndir(s, dizin ? { dizin } : {}); sonuc.tamam++; sonuc[r.yontem]++; sonuc.yeniGun += Math.max(0, r.yeniGun || 0); } catch (e) { sonuc.hata[s] = e.message; }
    await bekle(ara != null ? ara : 400);
  }
  sonuc.sembol = semboller.length;
  if (Object.keys(sonuc.hata).length === semboller.length && semboller.length) throw new Error('tüm Yahoo istekleri başarısız: ' + Object.values(sonuc.hata)[0]);
  return sonuc;
}

// ═══ DAĞITICI ═════════════════════════════════════════════════════════════════
async function indir(istek = {}) {
  const kaynak = istek.kaynak;
  let r;
  if (kaynak === 'yahoo') {
    if (String(istek.sembol || '').toUpperCase() === 'USDTRY=X') r = await kurIndir();
    else r = await yahooIndir(istek.sembol, { tam: !!istek.tam });
  } else if (kaynak === 'tefas') r = await tefasIndir(istek.kod, istek);
  else if (kaynak === 'tufe') r = await tufeIndir();
  else if (kaynak === 'evds') r = await evdsMevduatIndir();
  else throw new Error(`indir: kaynak 'yahoo' | 'tefas' | 'tufe' | 'evds' (verilen: ${kaynak})`);
  onbellekleriDusur();
  return r;
}

let _guncelleme = null;
function guncelle(ops = {}) {
  if (_guncelleme) return _guncelleme;
  _guncelleme = (async () => {
    const bas = O.ortamAl().simdi();
    const adimlar = {};
    const adim = async (ad, acik, f) => {
      if (!acik) { adimlar[ad] = { durum: 'atlandi' }; return; }
      try { adimlar[ad] = { durum: 'tamam', ayrinti: await f() }; } catch (e) { adimlar[ad] = { durum: 'hata', hata: e.message }; }
    };
    await adim('kur', ops.kur !== false, kurIndir);
    await adim('evds', ops.evds !== false, evdsMevduatIndir);
    await adim('tufe', ops.tufe !== false, tufeIndir);
    await adim('tefas', ops.tefas !== false, () => tefasGuncelle(ops));
    const yahooSecim = ops.yahoo === undefined ? 'endeks-etf' : ops.yahoo;
    await adim('yahoo', yahooSecim !== false, async () => {
      const KAT = require('./katalog');
      let semboller;
      if (Array.isArray(yahooSecim)) semboller = yahooSecim;
      else semboller = KAT.ara({ kaynak: 'yahoo' }).filter(v => yahooSecim === 'hepsi' || v.sinif !== 'hisse').map(v => v.ek.sembol);
      semboller = [...new Set([...semboller, '^IRX'])];
      return yahooToplu(semboller, { ara: ops.yahooAra });
    });
    onbellekleriDusur();
    const bit = O.ortamAl().simdi();
    return { bas: new Date(bas).toISOString(), bit: new Date(bit).toISOString(), sureSn: Math.round((bit - bas) / 1000), adimlar,
      hatalar: Object.values(adimlar).filter(a => a.durum === 'hata').length };
  })().finally(() => { _guncelleme = null; });
  return _guncelleme;
}

module.exports = { indir, guncelle, yahooIndir, tefasIndir, tefasKur, tefasHamGuncelle, kurIndir, evdsMevduatIndir, tufeIndir,
  tefasGuncelle, yahooToplu, onbellekleriDusur,
  _ic: { yahooDonustur, yahooGetir, tefasIstek, evdsIstek, sifirla: () => { _sonTefas = 0; } } };
