#!/usr/bin/env node
/**
 * PORTFÖY VERİ İNDİRİCİ — PLAN-PORTFOY.md ön kaydı B.3 / B.4 / B.5.
 *   node scripts/portfoy-veri-indir.js              # hepsi: kur + EVDS + TEFAS ham + katalog + temsilci + fon serileri + denetim
 *   node scripts/portfoy-veri-indir.js --tefas      # yalnız TEFAS ham ayları (önbellekli; eksik/tamamlanmamış aylar)
 *   node scripts/portfoy-veri-indir.js --kur --evds # yalnız USDTRY / EVDS
 *   node scripts/portfoy-veri-indir.js --insa       # ağsız: katalog + temsilci + fon serileri + denetim (ham aylardan)
 *   node scripts/portfoy-veri-indir.js --denetle    # ağsız: yalnız data/portfoy/_denetim.json
 *   --yeniden-sec  temsilci kaydını yeniden üret (VARSAYILAN: kayıt varsa DOKUNULMAZ — ön kayıt ruhu, seçim bir kez)
 *
 * ═══ TEFAS (ölçüldü 2026-10-07) ═══
 *  Uç: POST https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir, gövde HARCAMA uygulamasındaki TefasApiService ile
 *  aynı (sfonTurKod + sFonTurKod ikisi birden). fonKodu=null → o aralıktaki TÜM YAT fonları; satır alanları: fonKodu,
 *  fonUnvan, tarih, fiyat, tedPaySayisi, kisiSayisi, portfoyBuyukluk. Kısıtlar: (1) basTarih bugünden en çok 5 yıl geri
 *  ("Geçersiz veri: Baslangıc Tarihi 5 yıldan eski olamaz"; 2026-10-07'de 20211007 kabul edildi); (2) aralık ≤ 1 ay;
 *  (3) ~6 istek/dk sonra 429 → burada istekler arası 12 sn, 429'da 65 sn bekle. Eski /api/DB/BindHistoryInfo ve
 *  BindHistoryAllocation: 404 "Method not found or disabled" (varlık dağılımı tarihçesi YOK). Web sayfası bot korumalı,
 *  JSON ucu değil. Kapanmış fonlar kapandıkları güne kadar listede görünür → hayatta kalma izi ham aylarda.
 *  Ham ay dosyası: data/portfoy/tefas-ham/YYYY-MM.json.gz { ay, bas, bit, indirme, tam, unvan:{kod:ad},
 *  satirlar:[[kod, tarih, fiyat, buyukluk, kisi, pay]] }. Pencere her gün kaydığından ham dosyalar SİLİNMEZ; tamamlanmamış
 *  ay yeniden çekilirse eski satırlarla BİRLEŞTİRİLİR (eski gün kaybolmaz).
 * ═══ EVDS ═══
 *  POST https://evds3.tcmb.gov.tr/igmevdsms-dis/fe (EVDS3 web ön yüzünün kullandığı uç; anahtar istemiyor —
 *  evds2/evds3 servis ucu 'key' başlığı istiyor). Seriler: TP.TRY.MT01 (1 aya kadar), MT02 (3 aya kadar), MT06 (toplam),
 *  "TL Mevduat, Akım, %", haftalık (Cuma tarihli), frequency=3.
 * ═══ USDTRY ═══  Yahoo v8 chart USDTRY=X (scripts/bist-indir.js ile aynı yöntem; gün = İstanbul takvim günü).
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const zlib = require('zlib');
const pv = require('../lib/research/portfoyVeri');
const { YOL, GUN, tarihT, tStr } = pv;

const arg = new Set(process.argv.slice(2));
const hepsi = !['--tefas', '--kur', '--evds', '--insa', '--denetle'].some(a => arg.has(a));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const bekle = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
fs.mkdirSync(YOL.hamDir, { recursive: true });
fs.mkdirSync(YOL.fonDir, { recursive: true });

// ── USDTRY ──────────────────────────────────────────────────────────────────
async function kurIndir() {
  const p1 = Date.UTC(2005, 0, 1) / 1000, p2 = Math.floor(Date.now() / 1000);
  for (const host of ['query1', 'query2']) {
    for (let d = 0; d < 3; d++) {
      try {
        const u = `https://${host}.finance.yahoo.com/v8/finance/chart/USDTRY%3DX?period1=${p1}&period2=${p2}&interval=1d`;
        const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
        if (!r.ok) { await bekle(2000 * (d + 1)); continue; }
        const x = (await r.json()).chart.result[0];
        const q = x.indicators.quote[0], ac = (x.indicators.adjclose && x.indicators.adjclose[0].adjclose) || q.close;
        const gunler = [];
        for (let i = 0; i < x.timestamp.length; i++) {
          if (q.close[i] == null) continue;
          const dd = new Date((x.timestamp[i] + 3 * 3600) * 1000);
          const t = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate());
          const s = { t, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], ac: ac[i], v: q.volume[i] };
          if (gunler.length && gunler[gunler.length - 1].t === t) gunler[gunler.length - 1] = s; else gunler.push(s);
        }
        fs.writeFileSync(YOL.usdtry, JSON.stringify({ sembol: 'USDTRY=X', kaynak: 'Yahoo Finance v8 chart', indirme: new Date().toISOString(), para: 'TRY', gunler }));
        log(`USDTRY: ${gunler.length} gün, ${tStr(gunler[0].t)} → ${tStr(gunler[gunler.length - 1].t)}`);
        return;
      } catch (e) { await bekle(2000); }
    }
  }
  log('USDTRY indirilemedi — yükleyici data/bist/USDTRY_X.json yedeğini kullanır');
}

// ── EVDS ────────────────────────────────────────────────────────────────────
async function evdsIndir() {
  const seriler = ['TP.TRY.MT01', 'TP.TRY.MT02', 'TP.TRY.MT06'];
  const bugun = new Date();
  const g = n => String(n).padStart(2, '0');
  const govde = {
    type: 'json', series: seriler.join('-'), aggregationTypes: seriler.map(() => 'avg').join('-'), formulas: seriler.map(() => '0').join('-'),
    startDate: '01-01-2005', endDate: `${g(bugun.getUTCDate())}-${g(bugun.getUTCMonth() + 1)}-${bugun.getUTCFullYear()}`,
    frequency: '3', decimalSeperator: '.', decimal: '4', dateFormat: '0', lang: 'tr', yon: '', sira: '', ozelFormuller: [],
    groupSeperator: true, isRaporSayfasi: false,
  };
  const r = await fetch('https://evds3.tcmb.gov.tr/igmevdsms-dis/fe', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify(govde), signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new Error('EVDS HTTP ' + r.status);
  const j = await r.json();
  const out = { kaynak: 'TCMB EVDS3 (evds3.tcmb.gov.tr/igmevdsms-dis/fe, anahtarsız), haftalık, Cuma tarihli', indirme: new Date().toISOString(), adlar: j.seriesNames };
  for (const s of seriler) {
    const k = s.replace(/\./g, '_');
    out[s.split('.').pop()] = j.items.map(x => {
      const [dd, mm, yy] = x.Tarih.split('-');
      return { tarih: `${yy}-${mm}-${dd}`, oran: x[k] == null || x[k] === '' ? null : +x[k] };
    });
  }
  fs.writeFileSync(YOL.evds, JSON.stringify(out, null, 1));
  log(`EVDS: ${out.MT01.length} hafta, ${out.MT01[0].tarih} → ${out.MT01[out.MT01.length - 1].tarih}; adlar ${JSON.stringify(j.seriesNames)}`);
}

// ── TEFAS ham ───────────────────────────────────────────────────────────────
const TEFAS_UC = 'https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir';
const istekGovde = (bas, bit) => [
  '"fonTipi":"YAT"', '"fonKodu":null', '"aramaMetni":null', '"fonTurKod":null', '"fonGrubu":null', '"sfonTurKod":null',
  '"fonTurAciklama":null', '"kurucuKod":null', `"basTarih":"${bas.replace(/-/g, '')}"`, `"bitTarih":"${bit.replace(/-/g, '')}"`,
  '"basSira":1', '"bitSira":200000', '"dil":"TR"', '"sFonTurKod":""', '"fonKod":""', '"fonGrup":""', '"fonUnvanTip":""',
].join(',');
let sonIstek = 0;
async function tefasIstek(bas, bit) {
  for (let d = 0; d < 8; d++) {
    const bekleme = sonIstek + 12000 - Date.now();
    if (bekleme > 0) await bekle(bekleme);
    sonIstek = Date.now();
    try {
      const r = await fetch(TEFAS_UC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: '*/*', Origin: 'https://www.tefas.gov.tr', Referer: 'https://www.tefas.gov.tr/tr/fon-verileri', 'User-Agent': UA },
        body: '{' + istekGovde(bas, bit) + '}', signal: AbortSignal.timeout(180000),
      });
      if (r.status === 429) { log('  429 — 65 sn bekleniyor'); await bekle(65000); continue; }
      if (!r.ok) { log('  HTTP', r.status); await bekle(20000); continue; }
      const j = await r.json();
      if (j.errorMessage) return { hata: j.errorMessage };
      if (j.toplamSayi != null && j.resultList.length < j.toplamSayi) throw new Error(`eksik sayfa ${j.resultList.length}/${j.toplamSayi}`);
      return { satirlar: j.resultList };
    } catch (e) { log('  hata', e.message); await bekle(20000); }
  }
  throw new Error(`TEFAS ${bas}..${bit} 8 denemede alınamadı`);
}

async function tefasIndir() {
  const bugunT = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const bd = new Date(bugunT);
  let sinir = Date.UTC(bd.getUTCFullYear() - 5, bd.getUTCMonth(), bd.getUTCDate());
  const aylar = [];
  for (let t = Date.UTC(new Date(sinir).getUTCFullYear(), new Date(sinir).getUTCMonth(), 1); t <= bugunT;) {
    const d = new Date(t); aylar.push(t); t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  let indirilen = 0;
  for (const ayT of aylar) {
    const d = new Date(ayT), ay = tStr(ayT).slice(0, 7);
    const aySonu = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
    const dosya = path.join(YOL.hamDir, ay + '.json.gz');
    let eski = null;
    if (fs.existsSync(dosya)) { eski = pv.hamAyOku(dosya); if (eski.tam) continue; }
    let bas = tStr(Math.max(ayT, sinir)), bit = tStr(Math.min(aySonu, bugunT));
    let cevap = await tefasIstek(bas, bit);
    while (cevap.hata && /5 yıl/.test(cevap.hata)) { sinir += GUN; bas = tStr(Math.max(ayT, sinir)); log(`  5 yıl sınırı → bas ${bas}`); cevap = await tefasIstek(bas, bit); }
    if (cevap.hata) throw new Error(`TEFAS ${ay}: ${cevap.hata}`);
    const unvan = Object.assign({}, eski ? eski.unvan : {});
    const harita = new Map();
    if (eski) for (const s of eski.satirlar) harita.set(s[0] + '|' + s[1], s);
    for (const x of cevap.satirlar) {
      if (!x.fonKodu || !x.tarih) continue;
      const kod = x.fonKodu.trim().toUpperCase(), tarih = x.tarih.slice(0, 10);
      unvan[kod] = (x.fonUnvan || '').trim();
      harita.set(kod + '|' + tarih, [kod, tarih, x.fiyat, x.portfoyBuyukluk, x.kisiSayisi, x.tedPaySayisi]);
    }
    const satirlar = [...harita.values()].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : 1));
    const tam = bit === tStr(aySonu) && bugunT >= aySonu + 5 * GUN;
    const kayit = { ay, bas: eski && eski.bas < bas ? eski.bas : bas, bit, indirme: new Date().toISOString(), tam, unvan, satirlar };
    fs.writeFileSync(dosya, zlib.gzipSync(JSON.stringify(kayit)));
    indirilen++;
    log(`TEFAS ${ay}: ${bas}..${bit} ${cevap.satirlar.length} satır (toplam ${satirlar.length}, ${Object.keys(unvan).length} fon)${tam ? '' : ' [tamamlanmamış]'}`);
  }
  log(`TEFAS: ${indirilen} ay indirildi/güncellendi, ${aylar.length} ay toplam`);
}

// ── İnşa: katalog + temsilci + fon serileri ──────────────────────────────────
function insa() {
  const dosyalar = pv.hamAylar();
  if (!dosyalar.length) throw new Error('ham TEFAS ayı yok — önce --tefas');
  // Tüm satırları tek geçişte topla: fon özeti + işlem günleri.
  const fon = new Map(); // kod → { ad, ilk, son, n, adTarih }
  const gunler = new Set();
  const gunSatir = new Map(); // tarih → Map(kod → satır) yalnız seçim günleri için ikinci geçişte
  for (const f of dosyalar) {
    const h = pv.hamAyOku(f);
    for (const s of h.satirlar) {
      const [kod, tarih, fiyat] = s;
      if (!(fiyat > 0)) continue;
      gunler.add(tarih);
      let x = fon.get(kod);
      if (!x) { x = { kod, ilk: tarih, son: tarih, n: 0, ad: h.unvan[kod] }; fon.set(kod, x); }
      if (tarih < x.ilk) x.ilk = tarih;
      if (tarih >= x.son) { x.son = tarih; x.ad = h.unvan[kod] || x.ad; }
      x.n++;
    }
  }
  const tumGunler = [...gunler].sort();
  const D0 = tumGunler[0], veriSon = tumGunler[tumGunler.length - 1];
  const hedefS = new Date(tarihT(D0)); hedefS.setUTCFullYear(hedefS.getUTCFullYear() + 3);
  const S = tumGunler.find(g => g >= tStr(hedefS.getTime()));
  if (!S) throw new Error('S (veri başı + 3 yıl) henüz veride yok');
  const sinir3 = new Date(tarihT(S)); sinir3.setUTCFullYear(sinir3.getUTCFullYear() - 3);
  const gecmisSiniri = tStr(sinir3.getTime());
  // İkinci geçiş: D0 ve S günlerinin satırları (büyüklük, ad).
  for (const g of [D0, S]) gunSatir.set(g, new Map());
  for (const f of dosyalar) {
    const h = pv.hamAyOku(f);
    for (const s of h.satirlar) if (gunSatir.has(s[1]) && s[2] > 0) gunSatir.get(s[1]).set(s[0], { s, ad: h.unvan[s[0]] });
  }
  const katalog = {};
  for (const x of fon.values()) {
    const sS = gunSatir.get(S).get(x.kod), s0 = gunSatir.get(D0).get(x.kod);
    const adS = sS ? sS.ad : x.ad;
    katalog[x.kod] = {
      ad: x.ad, adS, kategori: pv.tefasKategori(adS), altKategori: pv.altKategori(adS), ilk: x.ilk, son: x.son, n: x.n,
      buyuklukD0: s0 ? s0.s[3] : null, buyuklukS: sS ? sS.s[3] : null, kisiS: sS ? sS.s[4] : null,
    };
  }
  fs.writeFileSync(YOL.katalog, JSON.stringify({ olusturma: new Date().toISOString(), veriBas: D0, veriSon, S, gecmisSiniri, gunSayisi: tumGunler.length, fonlar: katalog }, null, 1));
  log(`Katalog: ${fon.size} fon, ${tumGunler.length} işlem günü, ${D0} → ${veriSon}; S = ${S}, geçmiş sınırı ${gecmisSiniri}`);

  // Temsilci seçimi — kayıt varsa dokunma.
  let tem;
  if (fs.existsSync(YOL.temsilci) && !arg.has('--yeniden-sec')) {
    tem = JSON.parse(fs.readFileSync(YOL.temsilci, 'utf8'));
    log(`Temsilci kaydı korunuyor (${tem.olusturma}); yeniden seçmek için --yeniden-sec`);
  } else {
    const liste = Object.entries(katalog).map(([kod, v]) => ({ kod, ad: v.adS, kategori: v.kategori, ilk: v.ilk, son: v.son, buyuklukS: v.buyuklukS }));
    const sec = pv.temsilciSec(liste, { S, gecmisSiniri });
    // Bilgi: değişken / katılım alt ayrımı (ön kayıt tek kategori; yalnız bilgi).
    const alt = {};
    for (const ak of ['degisken', 'katilim']) {
      const l = liste.filter(f => katalog[f.kod].altKategori === ak).map(f => ({ ...f, kategori: 'degisken_katilim' }));
      const r = pv.temsilciSec(l, { S, gecmisSiniri }).degisken_katilim;
      alt[ak] = { kod: r.kod, fonAd: r.fonAd, buyukluk: r.buyukluk, adaylar: r.adaylar.slice(0, 3) };
    }
    tem = {
      olusturma: new Date().toISOString(),
      kural: 'ÖN-KAYIT B.5: kategoride değerlendirme başında (S) ≥ 3 yıl geçmişi olan (ilk gözlem ≤ S − 3 yıl) ve S günü fiyatı olan fonlar içinde S günü portföy büyüklüğü en yüksek fon; getiriye bakılmadı. Kategori = S günündeki unvandaki SPK tür ibaresi (lib/research/portfoyVeri.js KATEGORI_KURALLARI); serbest/özel fonlar dışlandı.',
      S, veriBas: D0, gecmisSiniri,
      S_gerekce: 'TEFAS ucu en çok 5 yıl geri veriyor (veri başı ' + D0 + '); "≥ 3 yıl geçmiş" ancak S = veri başı + 3 yıl seçilirse veriyle ölçülebilir. TEFAS kolunun walk-forward ısınması (36 ay) da tam bu aralığı kaplıyor → S = TEFAS kolunun ilk örneklem dışı ayı.',
      temsilciler: sec, bilgi_altKategori: alt,
    };
    fs.writeFileSync(YOL.temsilci, JSON.stringify(tem, null, 1));
    log('Temsilci seçimi yazıldı');
  }
  for (const [k, v] of Object.entries(tem.temsilciler)) log(`  ${k.padEnd(17)} ${v.kod || '-'}  ${v.buyukluk ? (v.buyukluk / 1e9).toFixed(2) + ' mlr TL' : ''}  ${v.fonAd || ''}`);

  // Fon serileri: temsilciler + kategori başına ilk 5 aday + alt kategori liderleri.
  const kodlar = new Set();
  for (const v of Object.values(tem.temsilciler)) { if (v.kod) kodlar.add(v.kod); for (const a of v.adaylar.slice(0, 5)) kodlar.add(a.kod); }
  for (const v of Object.values(tem.bilgi_altKategori || {})) if (v.kod) kodlar.add(v.kod);
  const seriler = new Map([...kodlar].map(k => [k, []]));
  for (const f of dosyalar) {
    const h = pv.hamAyOku(f);
    for (const s of h.satirlar) if (seriler.has(s[0])) seriler.get(s[0]).push([s[1], s[2], s[3], s[4], s[5]]);
  }
  for (const [kod, g] of seriler) {
    g.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const k = katalog[kod];
    fs.writeFileSync(path.join(YOL.fonDir, kod + '.json'), JSON.stringify({
      kod, ad: k.ad, kategori: k.kategori, kaynak: 'TEFAS fonGnlBlgSiraliGetir', olusturma: new Date().toISOString(),
      sutunlar: ['tarih', 'fiyat', 'portfoyBuyukluk', 'kisiSayisi', 'tedPaySayisi'], gunler: g,
    }));
  }
  log(`Fon serisi yazıldı: ${seriler.size} fon`);
}

// ── Denetim ─────────────────────────────────────────────────────────────────
const kor = (a, b) => {
  const n = a.length; let sa = 0, sb = 0; for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n; let c = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return c / Math.sqrt(va * vb);
};
function sicramalar(satirlar, esik) {
  // satirlar [{tarih, v}] — |r| > esik olan günler
  const out = [];
  for (let i = 1; i < satirlar.length; i++) {
    const r = satirlar[i].v / satirlar[i - 1].v - 1;
    if (Math.abs(r) > esik) out.push({ tarih: satirlar[i].tarih, r: +(r * 100).toFixed(2) });
  }
  return out;
}
function denetle() {
  const kat = JSON.parse(fs.readFileSync(YOL.katalog, 'utf8'));
  const tem = JSON.parse(fs.readFileSync(YOL.temsilci, 'utf8'));
  const tefasGunleri = new Set();
  for (const f of pv.hamAylar()) for (const s of pv.hamAyOku(f).satirlar) tefasGunleri.add(s[1]);
  const gunListe = [...tefasGunleri].sort();
  const d = { olusturma: new Date().toISOString(), komut: 'node scripts/portfoy-veri-indir.js --denetle', tefas: {}, hayattaKalma: {}, usdtry: {}, evds: {}, abd: {}, kurGecikmeTesti: {}, kollar: {} };

  // TEFAS takvimi: hafta içi olup TEFAS'ta hiç fiyat olmayan günler (resmî tatil).
  const hi = pv.haftaIciTakvim(tarihT(gunListe[0]), tarihT(gunListe[gunListe.length - 1])).map(tStr);
  d.tefasTakvim = { bas: gunListe[0], son: gunListe[gunListe.length - 1], islemGunu: gunListe.length, haftaIciFiyatsizGun: hi.filter(g => !tefasGunleri.has(g)) };

  const ESIK = { para_piyasasi: 0.02, borclanma: 0.05, eurobond: 0.08, altin: 0.08, degisken_katilim: 0.08, hisse: 0.10, yabanci_hisse: 0.10 };
  const fonDosyalari = fs.readdirSync(YOL.fonDir).filter(f => f.endsWith('.json'));
  for (const f of fonDosyalari) {
    const j = JSON.parse(fs.readFileSync(path.join(YOL.fonDir, f), 'utf8'));
    const ham = j.gunler.map(([tarih, fiyat, b, k, pay]) => ({ tarih, fiyat, pay }));
    const sifir = ham.filter(x => !(x.fiyat > 0)).length;
    const gecerli = ham.filter(x => x.fiyat > 0);
    const { gunler, olaylar } = pv.bolunmeDuzelt(gecerli);
    const kendi = new Set(gecerli.map(x => x.tarih));
    const eksik = gunListe.filter(g => g >= gecerli[0].tarih && g <= gecerli[gecerli.length - 1].tarih && !kendi.has(g));
    const esik = ESIK[j.kategori] || 0.10;
    d.tefas[j.kod] = {
      ad: j.ad, kategori: j.kategori, temsilci: Object.values(tem.temsilciler).some(v => v.kod === j.kod),
      bas: gecerli[0].tarih, son: gecerli[gecerli.length - 1].tarih, gun: gecerli.length, sifirFiyat: sifir,
      eksikGun: eksik.length, eksikOrnek: eksik.slice(0, 10),
      bolunmeSifirlanma: olaylar, sicramaEsik: esik,
      sicrama: sicramalar(gunler.map(x => ({ tarih: x.tarih, v: x.fiyat })), esik),
    };
  }
  // Hayatta kalma: kategori başına veri başında var olan fonlardan sonra kapananlar.
  const veriSon = kat.veriSon;
  const kapanmaSiniri = tStr(tarihT(veriSon) - 10 * GUN);
  for (const k of Object.keys(pv.KATEGORI_ADLARI)) {
    const l = Object.entries(kat.fonlar).filter(([, v]) => v.kategori === k);
    const D0daVar = l.filter(([, v]) => v.ilk === kat.veriBas);
    const kapanan = l.filter(([, v]) => v.son < kapanmaSiniri);
    d.hayattaKalma[k] = {
      kategoridekiFon: l.length, veriBasindaVar: D0daVar.length,
      kapanan: kapanan.length, kapananSdenOnce: kapanan.filter(([, v]) => v.son < kat.S).length,
      kapananOrnek: kapanan.slice(0, 15).map(([kod, v]) => ({ kod, ad: v.ad, ilk: v.ilk, son: v.son })),
      not: 'kategori, fonun S günündeki (yoksa son) unvanından; S öncesi kapanan fon temsilci olamazdı (S\'de fiyatı yok)',
    };
  }
  // USDTRY
  const kur = pv.usdtry();
  const kurGun = new Set(kur.map(x => tStr(x.t)));
  const kurHi = pv.haftaIciTakvim(kur[0].t, kur[kur.length - 1].t).map(tStr).filter(g => !kurGun.has(g));
  d.usdtry = { kaynak: fs.existsSync(YOL.usdtry) ? YOL.usdtry : YOL.usdtryYedek, bas: tStr(kur[0].t), son: tStr(kur[kur.length - 1].t), gun: kur.length,
    haftaIciEksik: kurHi.length, haftaIciEksik2014Sonrasi: kurHi.filter(g => g >= '2014').length, eksikOrnek: kurHi.filter(g => g >= '2014').slice(0, 20),
    sicrama5: sicramalar(kur.map(x => ({ tarih: tStr(x.t), v: x.c })), 0.05) };
  // EVDS
  const ev = JSON.parse(fs.readFileSync(YOL.evds, 'utf8'));
  for (const s of ['MT01', 'MT02', 'MT06']) {
    const l = ev[s].filter(x => x.oran > 0);
    const bosluk = [];
    for (let i = 1; i < l.length; i++) { const g = (tarihT(l[i].tarih) - tarihT(l[i - 1].tarih)) / GUN; if (g > 7) bosluk.push({ onceki: l[i - 1].tarih, sonraki: l[i].tarih, gun: g }); }
    const sic = [];
    for (let i = 1; i < l.length; i++) if (Math.abs(l[i].oran - l[i - 1].oran) > 3) sic.push({ tarih: l[i].tarih, onceki: l[i - 1].oran, oran: l[i].oran });
    d.evds[s] = { ad: ev.adlar && ev.adlar['TP_TRY_' + s], bas: l[0].tarih, son: l[l.length - 1].tarih, hafta: l.length, bos: ev[s].length - l.length, bosluk7gun: bosluk, haftalikDegisim3puan: sic };
  }
  const ma = pv.mevduatAylik();
  d.evds.aylikMevduat = { bas: ma[0].ay, son: ma[ma.length - 1].ay, ay: ma.length,
    stopajDonemleri: pv.STOPAJ_TARIHCE, ornek: ma.filter(x => /-(01)$/.test(x.ay)).map(x => ({ ay: x.ay, oran: x.oranYillik, stopaj: x.stopaj, netTL: +(x.netTL * 100).toFixed(3) })) };
  // ABD
  const nv = require('../lib/research/nasdaqVeri');
  for (const s of ['SHY', 'IEF', 'TLT']) {
    const l = nv.duzeltilmis(s);
    d.abd[s] = { bas: tStr(l[0].t), son: tStr(l[l.length - 1].t), gun: l.length, sicrama4: sicramalar(l.map(x => ({ tarih: tStr(x.t), v: x.c })), 0.04) };
  }
  // Kur/fiyat gecikme testi: hisse temsilcisi TL getirisi ↔ XU100 TL getirisi, gecikme 0 / 1 / 2 gün.
  try {
    const xu = JSON.parse(fs.readFileSync(yollar.veri('bist', 'XU100.IS.json'), 'utf8')).gunler.filter(x => x.c > 0 && x.v > 0);
    const xuR = new Map(); for (let i = 1; i < xu.length; i++) xuR.set(tStr(xu[i].t), { r: xu[i].c / xu[i - 1].c - 1, i });
    const xuGun = xu.map(x => tStr(x.t));
    const kod = tem.temsilciler.hisse.kod;
    const f = pv.tefasSeri(kod);
    const sonuc = {};
    for (const lag of [0, 1, 2]) {
      const a = [], b = [];
      for (let i = 1; i < f.length; i++) {
        const x = xuR.get(f[i].tarih); if (!x) continue;
        const j = x.i - lag; if (j < 1) continue;
        // fonun önceki gözlemi ile XU100'ün aynı kaydırılmış önceki günü bir işlem günü arayla olmalı
        if (f[i - 1].tarih !== xuGun[x.i - 1]) continue;
        a.push(f[i].fiyat / f[i - 1].fiyat - 1); b.push(xu[j].c / xu[j - 1].c - 1);
      }
      sonuc['gecikme' + lag] = { n: a.length, korelasyon: +kor(a, b).toFixed(3) };
    }
    d.kurGecikmeTesti = { fon: kod, karsilastirma: 'fon TL günlük getirisi(d) ↔ XU100 TL getirisi(d − gecikme)', ...sonuc,
      yorum: 'En yüksek korelasyonun gecikmesi, TEFAS fiyat gününün piyasa gününe göre kaymasını gösterir. Gecikme 1 baskın → kolSerileri varsayılanı tefasHizalama=degerleme (fiyat önceki fiyat gününe yazılır, o günün kuruyla USD).' };
    // Hizalama karşılaştırması: temsilcilerin günlük USD getiri σ'sı (yıllık, 2023+), iki hizalamayla.
    d.kurGecikmeTesti.hizalamaSigma = {};
    const sd = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
    for (const hz of ['islem', 'degerleme']) {
      const k = pv.kolSerileri({ siklik: 'gunluk', kollar: Object.keys(pv.kolTanimlari()).filter(x => x.startsWith('TEFAS_')), tefasHizalama: hz });
      for (const [a, s] of Object.entries(k.seriler)) {
        const r = s.filter(x => x.t >= Date.UTC(2023, 0, 1)).map(x => x.getiriUSD);
        (d.kurGecikmeTesti.hizalamaSigma[a] = d.kurGecikmeTesti.hizalamaSigma[a] || {})[hz] = +(sd(r) * Math.sqrt(252) * 100).toFixed(2);
      }
    }
    d.kurGecikmeTesti.hizalamaNot = 'Yıllık % σ, 2023-01 → , ortak hafta içi takvim. Doğru hizalama gürültüyü (sahte kur oynaklığını) azaltır.';
  } catch (e) { d.kurGecikmeTesti = { hata: e.message }; }
  // Kollar
  for (const siklik of ['gunluk', 'aylik']) {
    const k = pv.kolSerileri({ siklik });
    d.kollar[siklik] = { bitis: k.bitis, kollar: Object.fromEntries(Object.entries(k.seriler).map(([a, s]) => [a, {
      baslangic: k.baslangic[a], n: s.length, ilk: s.length ? tStr(s[0].t) : null, son: s.length ? tStr(s[s.length - 1].t) : null,
      sifirGetiriOrani: s.length ? +(s.filter(x => x.getiriUSD === 0).length / s.length).toFixed(3) : null,
      enKotu: s.length ? +(Math.min(...s.map(x => x.getiriUSD)) * 100).toFixed(2) : null,
      enIyi: s.length ? +(Math.max(...s.map(x => x.getiriUSD)) * 100).toFixed(2) : null,
    }])) };
  }
  fs.writeFileSync(YOL.denetim, JSON.stringify(d, null, 1));
  log('Denetim yazıldı:', YOL.denetim);
  return d;
}

(async () => {
  if (hepsi || arg.has('--kur')) await kurIndir();
  if (hepsi || arg.has('--evds')) await evdsIndir();
  if (hepsi || arg.has('--tefas')) await tefasIndir();
  if (hepsi || arg.has('--insa')) insa();
  if (hepsi || arg.has('--insa') || arg.has('--denetle')) denetle();
})().catch(e => { console.error('HATA:', e.stack || e.message); process.exit(1); });
