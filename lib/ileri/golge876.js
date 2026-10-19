/**
 * İLERİ GÖLGE TESTİ — 876 (DefiLlama TVL 30 g değişimi L/S) + Hücum %90 / 876 %10 birleşimi (PLAN-ILERI-876.md, deneme 882).
 * EMİR YOK, PARA YOK, ANAHTAR YOK: yalnız herkese açık veriyle kayıt. lib/live ve lib/risk'e DOKUNMAZ.
 *
 * KURAL: scripts/dikkat-ls.js (95404dd, SHA-256 aşağıda) DEĞİŞTİRİLMEDEN require edilir — `lsKos(V, 876, [F], gSon)` her ay ayrı koşar
 * (yalnız o F'nin TVL anlık görüntüsüyle), özsermaye aydan aya zincirlenir (bütün kalemler — adet, maliyet, funding, (1 − m)·E faizi — E ile orantılı → ölçekten bağımsız). Bu modül yalnız VERİ YOLUNU
 * kurar: dikkat-ls `gercekVeri`'nin (market.db + 2026-10-16 önbelleği) karşılığı, Binance genel API + DefiLlama + Yahoo önbelleğiyle.
 *
 * VERİ (data/ileri/876/, git dışı):
 *   mum/<HAM>.json   Binance USDⓈ-M 1d [t, h, l, c, v] (yalnız kapanmış), `kapsam` = başarıyla sorgulanan son gün; geçersiz sembol (delist) `gecersiz`
 *   fon/<HAM>.json   funding [t, oran], `kapsam` = sorgunun ulaştığı an (ms)
 *   tvl/<F>/<slug>.json  DefiLlama /protocol `tvl` — F−45 … F−1 anlık görüntüsü (bir kez; sonra yeniden indirilmez)
 *   irx.json         ^IRX [[gün, kapanış %]]
 *   kayit.jsonl      YALNIZ EKLENİR: kurulus · gun (kesinleşmiş gün) · dur · rapor
 *   son.json         özet (her koşuda yeniden yazılır; panel bunu okur)
 *
 * KOŞU GEÇMİŞİ (EK-1 b): Binance API yeniden listelenen sembolde (ICP, TLM…) yalnız güncel listelemenin mumlarını verir; eski koşu
 * bilinmezse §1.2 "yeniden kullanım" kuralı uygulanamaz. Donmuş tablo kayitlar/ileri-876/kosular.json (market.db + örtü, ≤ 2026-10-16,
 * yalnız hacimli gün koşu sınırları — fiyat yok) API'nin ilk gününden önceki koşuları verir; V._kosu (dikkat-ls kosular önbelleği)
 * tabloyla birleştirilmiş koşularla önceden doldurulur (aynı ≥ 30 g boşluk kuralı).
 *
 * Bir gün, sonraki günün mumu gelince ya da ayın son günüyse (çıkış maliyetiyle) KESİNLEŞİR; son günün "bugün kapatılsa" değeri yalnız
 * son.json'dadır. Her koşuda kayıtlı kuruluşlar ve günler önbellekten yeniden hesaplanır; fark → UYARI (`degisen`), kayıt değişmez.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const crypto = require('crypto');
const I = require('./bollingerIzleme');

const KOK = path.join(__dirname, '..', '..');
const GUN = 864e5;
const DENEME = 882;
const KOL = 876;
const PLAN = 'PLAN-ILERI-876.md';
const gn = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / GUN);
const gs = (g) => new Date(g * GUN).toISOString().slice(0, 10);
const FLER = Object.freeze(['2026-11-01', '2026-12-01']);
const BAS = '2026-10-31';                 // E = 1 (kapanış)
const SON = '2026-12-31';                 // son tutuş günü (çıkış = 2027-01-01 açılışı)
const RAPOR = '2027-01-01';
const PAY_H = 0.9, PAY_876 = 0.1;
const D1_ESIK = -0.20, D2_PUAN = 0.03;
const GUN0 = gn('2019-09-01');            // dikkat-ls gercekVeri gun0
const BEKLEME_GUN = 2;                    // F + 2 koşusunda alınamayan TVL / mum → o ay sinyalsiz (ön kayıt §6)
const TVL_PENCERE = 45;
const BTC = 'BTC';

/** Dondurulmuş kod ve tablolar (ön kayıt §1). Satır sonu LF'ye çevrilerek ölçülür (git autocrlf'e dayanıklı). */
const KOD_SHA = Object.freeze({
  'scripts/dikkat-ls.js': 'ed1ad19e3629f0394a0dcebad033204751d8eb75434a74fc4b4e578c8d0534e3',
  'scripts/dikkat-ls-veri.js': '8279219055ba993a3f35e9f8d6a1e3d19d0b20ee104115d8442ea9fa061856b8',
});
const TABLO_SHA = Object.freeze({
  'eslesme.json': '2e6845828b3a6d190925cd26ff136f285e8523fe378eca5da798b49844762c5f',
  'k161-perp-delist.json': '6b7c62e209d50e75169a4c2fecc2662e96891dd4807bdb9359b8465e735a3787',
});
/** EK-1 (b): donmuş koşu geçmişi tablosu (scripts/ileri-876.js kosu-tablo; LF ile ölçülür). */
const KOSU_SHA = '5c3afd57c239a7e66c7510fc0047c8a61f24ea4210ae53fc7d9f5d596d977e3e';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const lfSha = (b) => sha(Buffer.from(String(b).replace(/\r\n/g, '\n'), 'utf8'));

/** Kod + tablo mührü. Tutmazsa hata (gölge durur, kayıt yazılmaz). → { E, k161 } */
function muhurDenetle(kok = KOK) {
  for (const [rel, h] of Object.entries(KOD_SHA)) {
    const x = lfSha(fs.readFileSync(path.join(kok, rel), 'utf8'));
    if (x !== h) throw new Error(`${rel} dondurulmuş sürümle aynı değil (SHA ${x.slice(0, 12)}… ≠ ${h.slice(0, 12)}…) — 876 gölgesi DURDU`);
  }
  const T = JSON.parse(fs.readFileSync(path.join(kok, 'kayitlar', 'dikkat-ls', 'tablolar.json'), 'utf8'));
  const out = {};
  for (const [ad, h] of Object.entries(TABLO_SHA)) {
    if (T.tablolar[ad] !== h) throw new Error(`tablolar.json ${ad} SHA'sı ön kayıttakiyle aynı değil — DURDU`);
    const b = fs.readFileSync(path.join(kok, 'kayitlar', 'dikkat-ls', ad), 'utf8');
    if (lfSha(b) !== h) throw new Error(`${ad} SHA tutmuyor — DURDU`);
    out[ad] = JSON.parse(b);
  }
  const kb = fs.readFileSync(path.join(kok, 'kayitlar', 'ileri-876', 'kosular.json'), 'utf8');
  if (lfSha(kb) !== KOSU_SHA) throw new Error('kayitlar/ileri-876/kosular.json SHA tutmuyor — DURDU');
  return { E: out['eslesme.json'], k161: out['k161-perp-delist.json'], kosular: JSON.parse(kb).kosular };
}

/** Kural modülleri (tembel: panel okuması bunları yüklemez). */
const kural = () => ({ L: require('../../scripts/dikkat-ls.js'), DV: require('../../scripts/dikkat-ls-veri.js') });

/* ═══════════ DOSYALAR ═══════════ */
const dosyalar = (dizin = I.VARSAYILAN_DIZIN) => {
  const k = path.join(dizin, '876');
  return { kok: k, mum: path.join(k, 'mum'), fon: path.join(k, 'fon'), tvl: path.join(k, 'tvl'), irx: path.join(k, 'irx.json'),
    kayit: path.join(k, 'kayit.jsonl'), son: path.join(k, 'son.json'), golge: I.dosyalar(dizin).golge };
};
const okuJ = (p, v = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return v; } };
function yazJ(p, o) { fs.mkdirSync(path.dirname(p), { recursive: true }); const t = `${p}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o), 'utf8'); fs.renameSync(t, p); }
const imza = (o) => sha(JSON.stringify(o));

/** Eşlemesi geçerli perp'ler (ham) — mum yalnız bunlar + BTC için indirilir (ön kayıt §6). */
const gecerliHamlar = (E) => [...new Set(E.satirlar.filter(r => r.durum === 'gecerli').map(r => r.ham))].sort();
const birimSluglar = (e) => (e.birim.tip === 'toplam' ? e.birim.sluglar : [e.birim.slug]);

/* ═══════════ AĞ (herkese açık, anahtarsız) ═══════════ */
const UA = 'pusula-ileri-876/1.0';
const bekle = (ms) => new Promise(r => setTimeout(r, ms));
async function istek(url, { deneme = 4, fetchFn = fetch } = {}) {
  let son;
  for (let i = 0; i < deneme; i++) {
    try {
      const r = await fetchFn(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.status === 429 || r.status === 418 || r.status >= 500) { son = new Error(`HTTP ${r.status}`); await bekle(Math.min(60e3, (+r.headers.get('retry-after') || 5) * 1000 * (i + 1))); continue; }
      const metin = await r.text();
      return { durum: r.status, metin, agirlik: +(r.headers.get('x-mbx-used-weight-1m') || 0) };
    } catch (e) { son = e; await bekle(2000 * (i + 1)); }
  }
  throw son || new Error('ağ hatası');
}
/** Gerçek ağ katmanı. Her işlev ağ hatasında FIRLATIR (eksik); kesin "yok" cevapları ayrı döner. */
function gercekAg({ fetchFn = fetch } = {}) {
  const FAPI = 'https://fapi.binance.com';
  let agirlik = 0;
  const yavas = async () => { if (agirlik > 1700) { await bekle(30e3); agirlik = 0; } else await bekle(120); };
  return {
    /** → { gecersiz: true } | { satirlar: [[openTime, h, l, c, v]] } (en çok `limit`) */
    async mum(ham, bas, limit = 1000) {
      await yavas();
      const r = await istek(`${FAPI}/fapi/v1/klines?symbol=${ham}USDT&interval=1d&startTime=${bas}&limit=${limit}`, { fetchFn });
      agirlik = r.agirlik || agirlik;
      if (r.durum === 400) { let j = {}; try { j = JSON.parse(r.metin); } catch { /* */ } if (j.code === -1121) return { gecersiz: true }; throw new Error(`${ham} mum HTTP 400 ${j.code || ''}`); }
      if (r.durum !== 200) throw new Error(`${ham} mum HTTP ${r.durum}`);
      return { satirlar: JSON.parse(r.metin).map(k => [+k[0], +k[2], +k[3], +k[4], +k[5]]) };
    },
    /** → [[t, oran]] (bas ≤ t < bit), sayfalı */
    async funding(ham, bas, bit) {
      const out = []; let t = bas;
      for (let i = 0; i < 50; i++) {
        await yavas();
        const r = await istek(`${FAPI}/fapi/v1/fundingRate?symbol=${ham}USDT&startTime=${t}&endTime=${bit - 1}&limit=1000`, { fetchFn });
        if (r.durum === 400) { let j = {}; try { j = JSON.parse(r.metin); } catch { /* */ } if (j.code === -1121) return out; throw new Error(`${ham} funding HTTP 400`); }
        if (r.durum !== 200) throw new Error(`${ham} funding HTTP ${r.durum}`);
        const l = JSON.parse(r.metin).map(x => [+x.fundingTime, +x.fundingRate]);
        out.push(...l);
        if (l.length < 1000) break;
        t = l[l.length - 1][0] + 1;
      }
      return out;
    },
    /** → { yok: kod } | { tvl: [[tarih (sn), totalLiquidityUSD]] } — DefiLlama /protocol üst düzey tvl (dikkat-ls-veri seri() ile aynı uç) */
    async tvl(slug) {
      await bekle(300);
      const r = await istek(`https://api.llama.fi/protocol/${encodeURIComponent(slug)}`, { fetchFn });
      if (r.durum === 404 || r.durum === 400) return { yok: r.durum };
      if (r.durum !== 200) throw new Error(`${slug} TVL HTTP ${r.durum}`);
      const j = JSON.parse(r.metin);
      return { tvl: (j.tvl || []).map(x => [x.date, x.totalLiquidityUSD]) };
    },
    /** → [[gün, kapanış %]] (son ~1 yıl) */
    async irx() {
      const r = await istek('https://query1.finance.yahoo.com/v8/finance/chart/%5EIRX?range=1y&interval=1d', { fetchFn });
      if (r.durum !== 200) throw new Error(`^IRX HTTP ${r.durum}`);
      const j = JSON.parse(r.metin).chart.result[0];
      const c = j.indicators.quote[0].close;
      return j.timestamp.map((t, i) => [Math.floor(t * 1000 / GUN), c[i]]).filter(x => x[1] != null && x[1] >= 0);
    },
  };
}

/* ═══════════ ÖNBELLEK GÜNCELLEME ═══════════ */
/** Bir sembolün mum önbelleği: kapsam < Y ise eksik günleri indir (ilk kez 2019-09-01'den). Ağ hatası → fırlatır. */
async function mumGuncelle(F, ag, ham, Y, simdi) {
  const yol = path.join(F.mum, ham + '.json');
  const o = okuJ(yol) || { ham, satirlar: [], kapsam: null, gecersiz: false };
  if (o.kapsam != null && o.kapsam >= Y) return o;
  const harita = new Map(o.satirlar.map(r => [r[0], r]));
  let bas = o.satirlar.length ? (o.satirlar[o.satirlar.length - 1][0] / GUN - 3) * GUN : GUN0 * GUN;
  for (let i = 0; i < 20; i++) {
    const r = await ag.mum(ham, bas, 1000);
    if (r.gecersiz) { o.gecersiz = true; o.gecersizGun = o.gecersizGun || gs(Y); break; }
    const kap = r.satirlar.filter(k => k[0] + GUN <= simdi);
    if (r.satirlar.length) o.gecersiz = false;
    for (const k of kap) harita.set(k[0], k);
    if (r.satirlar.length < 1000 || !kap.length) break;
    bas = kap[kap.length - 1][0] + GUN;
  }
  o.satirlar = [...harita.values()].sort((a, b) => a[0] - b[0]);
  o.kapsam = Y;
  yazJ(yol, o);
  return o;
}
/** Funding önbelleği [bas, bit) aralığını kapsayana kadar indirir (kapsam = sorgunun ulaştığı an). Ağ hatası → fırlatır. */
async function fonGuncelle(F, ag, ham, bas, bit) {
  const yol = path.join(F.fon, ham + '.json');
  const o = okuJ(yol) || { ham, satirlar: [], kapsam: bas, bas: null };
  if (o.bas != null && o.bas <= bas && o.kapsam >= bit) return o;
  const bas2 = o.bas != null && o.bas <= bas ? Math.max(bas, o.kapsam - GUN) : bas;
  const l = await ag.funding(ham, bas2, bit);
  const h = new Map(o.satirlar.map(r => [r[0], r]));
  for (const r of l) h.set(r[0], r);
  o.satirlar = [...h.values()].sort((a, b) => a[0] - b[0]);
  o.bas = o.bas != null ? Math.min(o.bas, bas) : bas;
  o.kapsam = Math.max(o.kapsam || 0, bit);
  yazJ(yol, o);
  return o;
}
/** F kuruluşunun TVL anlık görüntüsü (bir kez). → { durum: 'ok'|'yok', tvl } ; ağ hatası → fırlatır. */
async function tvlAl(F, ag, Fg, slug, simdi) {
  const yol = path.join(F.tvl, gs(Fg), slug.replace(/[^A-Za-z0-9._-]/g, '_') + '.json');
  const v = okuJ(yol); if (v) return v;
  const r = await ag.tvl(slug);
  const o = r.yok ? { slug, durum: 'yok', kod: r.yok, indirme: new Date(simdi).toISOString() }
    : { slug, durum: 'ok', indirme: new Date(simdi).toISOString(), tvl: r.tvl.filter(x => { const g = Math.floor(x[0] * 1000 / GUN); return g >= Fg - TVL_PENCERE && g < Fg; }) };
  o.sha = imza(o.tvl || null);
  yazJ(yol, o);
  return o;
}

/* ═══════════ V (dikkat-ls gercekVeri karşılığı) ═══════════ */
/**
 * Saf: önbellekten dikkat-ls veri nesnesi. son = dışlayıcı gün. temelF: (e) → { fee, rev, tvl, tvlBas, cm } (yalnız tvl kullanılır).
 * gercekVeri ile aynı biçim: gun0 2019-09-01, sıralı semboller, funding dakikaya yuvarlanır, ^IRX D−1 kapanışı.
 */
/**
 * Saf (EK-1 b): donmuş koşular (API'nin ilk gününden önce başlayanlar, o güne kırpılır) + API koşuları → §1.2 kuralıyla birleşik koşular
 * (ardışık iki koşu arasında < 30 g boşluk → aynı koşu). onceki: [[basGun, sonGun]] ('YYYY-AA-GG'); api: [{ bas, son }] (gün no).
 */
function kosuBirlestir(onceki, api) {
  if (!api.length) return api;
  const ilk = api[0].bas;
  const l = [...(onceki || []).map(([a, b]) => ({ bas: gn(a), son: Math.min(gn(b), ilk - 1) })).filter(x => x.bas < ilk), ...api.map(x => ({ ...x }))].sort((a, b) => a.bas - b.bas);
  const out = [];
  for (const x of l) { const p = out[out.length - 1]; if (p && x.bas - p.son - 1 < 30) p.son = Math.max(p.son, x.son); else out.push(x); }
  return out;
}
function vKur({ son, mumlar, fonlar, irx, E, k161, haric, temel, kosular = null }) {
  const { L } = kural();
  const n = son - GUN0;
  const seri = new Map();
  for (const ham of [...mumlar.keys()].sort()) {
    const c = new Float64Array(n).fill(NaN), h = new Float64Array(n).fill(NaN), l = new Float64Array(n).fill(NaN), v = new Float64Array(n).fill(NaN);
    for (const r of mumlar.get(ham)) { if (r[0] >= son * GUN) continue; const i = Math.floor(r[0] / GUN) - GUN0; if (i < 0 || i >= n) continue; h[i] = r[1]; l[i] = r[2]; c[i] = r[3]; v[i] = r[4]; }
    seri.set(ham, { c, h, l, v });
  }
  const fonC = new Map();
  const fon = (ham) => {
    if (fonC.has(ham)) return fonC.get(ham);
    const rows = (fonlar.get(ham) || []).filter(x => x[0] < son * GUN);
    const t = new Float64Array(rows.length), r = new Float64Array(rows.length);
    rows.forEach((x, i) => { t[i] = Math.round(x[0] / 60e3) * 60e3; r[i] = x[1]; });
    const o = { t, r }; fonC.set(ham, o); return o;
  };
  const y = L.yYap(irx.filter(q => q[0] < son && q[1] != null && q[1] >= 0).map(q => [q[0], q[1] / 100]).sort((a, b) => a[0] - b[0]));
  const delist = new Map();
  for (const d of k161.duyurular) if (d.tau < son * GUN) for (const p of d.perpler) { const ham = p.replace(/USDT$/, ''); if (!delist.has(ham)) delist.set(ham, []); delist.get(ham).push(d.tau); }
  const V = { gun0: GUN0, son, semboller: [...seri.keys()], seri, fon, y, temel, eslesme: new Map(E.satirlar.map(r => [r.ham, r])), delist, mt: [], hack: [], haric, tablolar: null, ortuSay: 0, github: null };
  if (kosular) { V._kosu = new Map(); for (const ham of V.semboller) { const api = L.kosular({ gun0: GUN0, seri: new Map([[ham, seri.get(ham)]]) }, ham); V._kosu.set(ham, kosuBirlestir(kosular[ham], api)); } }
  return V;
}
/** Hariç işlevi (gercekVeri ile aynı kurulum; taban kümesi = donmuş tablonun bütün perp'leri). */
function haricKur(E) {
  const { L, DV } = kural();
  const H = DV.haricKumeleri();
  const tabanlar = new Set(E.satirlar.map(r => DV.perpTaban(r.ham).taban));
  const esMap = new Map(E.satirlar.map(r => [r.ham, r]));
  const geckoIdOf = (ham) => { const r = esMap.get(ham); return r && r.geckoId && (r.durum === 'gecerli' || r.cmDenetim === 'red') ? r.geckoId : null; };
  const hf = L.haricYap(H, new Set(E.stabilTabanlar || []), new Set(E.stabilGeckoIdler || []), geckoIdOf);
  return (ham) => hf(ham, tabanlar);
}
/** Saf: F anlık görüntüsünden temel (dikkat-ls temelYukle'nin TVL kısmının aynısı: aynı gün değerleri toplanır, g ≥ son atlanır). */
function temelKur(snap, son) {
  return (e) => {
    const m = new Map(); let var_ = false;
    for (const s of birimSluglar(e)) {
      const j = snap.get(s); if (!j || j.durum !== 'ok') continue; var_ = true;
      for (const [ts, v] of j.tvl) { const g = Math.floor(ts * 1000 / GUN); if (g >= son || !Number.isFinite(+v)) continue; m.set(g, (m.get(g) || 0) + +v); }
    }
    return { fee: null, rev: null, tvl: var_ ? m : null, tvlBas: null, cm: null };
  };
}

/** Saf: F−1'de TVL'si gereken birimler (sinyal() sırası: eşleme geçerli → koşu no 0 → listedAt kuralı; §1.1 evren). */
function tvlAdaylari(V, F) {
  const { L } = kural();
  const out = [];
  for (const ham of V.semboller) {
    if (ham === BTC) continue;
    const ev = L.evrendeMi(V, ham, F - 1, 5e6, F); if (!ev.ok) continue;
    const e = V.eslesme.get(ham);
    if (!e || e.durum !== 'gecerli' || ev.kosu.no !== 0 || !L.birimBiliniyor(e, F)) continue;
    out.push({ ham, e });
  }
  return out;
}

/* ═══════════ SAF HESAPLAR ═══════════ */
function maxDD(seri) { let tepe = -Infinity, m = 0; for (const e of seri) { if (e > tepe) tepe = e; m = Math.min(m, e / tepe - 1); } return m; }
function korelasyon(a, b) {
  const n = Math.min(a.length, b.length); if (n < 3) return null;
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
}
/**
 * Saf: birleşim. gunler: [{ gun, E }] (876 zinciri, başlangıç 1), hucum: Map(gun → r). Hücum'u eksik ilk günde durur.
 * → { gun, son, eksikHucum, r876[], rH[], rC[], E876[], EH[], EC[], mdd876, mddH, mddC }
 */
function birlesim(gunler, hucum) {
  const r876 = [], rH = [], rC = [], g = [];
  let once = 1, eksik = null;
  for (const x of gunler) {
    const r = once > 0 ? x.E / once - 1 : 0; once = x.E;
    const h = hucum.get(x.gun);
    if (!Number.isFinite(h)) { eksik = x.gun; break; }
    r876.push(r); rH.push(h); rC.push(PAY_H * h + PAY_876 * r); g.push(x.gun);
  }
  const zincir = (l) => { const o = [1]; for (const r of l) o.push(o[o.length - 1] * (1 + r)); return o; };
  const E876 = zincir(r876), EH = zincir(rH), EC = zincir(rC);
  return { gun: g.length, son: g[g.length - 1] || null, gunler: g, eksikHucum: eksik, r876, rH, rC, E876, EH, EC,
    mdd876: maxDD(E876), mddH: maxDD(EH), mddC: maxDD(EC) };
}
/**
 * Saf: durdurma kuralları (§5) — her gün t için seri "t son günmüş gibi" (t'de tasfiye değeri). gunler: [{gun, E (kesin), Eliq}].
 * → null | { gun, kural: 'D1'|'D2', mdd876, mddC, mddH }
 */
function durdurmaBul(gunler, hucum, { d1Esik = D1_ESIK, d2Puan = D2_PUAN } = {}) {
  for (let i = 0; i < gunler.length; i++) {
    const on = gunler.slice(0, i + 1).map((x, j) => ({ gun: x.gun, E: j === i ? x.Eliq : x.E }));
    const d1 = maxDD([1, ...on.map(x => x.E)]);
    if (d1 <= d1Esik) return { gun: gunler[i].gun, kural: 'D1', mdd876: d1, mddC: null, mddH: null };
    const b = birlesim(on, hucum);
    if (b.gun === i + 1 && b.mddC < b.mddH - d2Puan) return { gun: gunler[i].gun, kural: 'D2', mdd876: d1, mddC: b.mddC, mddH: b.mddH };
  }
  return null;
}

/* ═══════════ ÇALIŞTIR ═══════════ */
/**
 * Bir gece koşusu: önbellekleri güncelle → kuruluş (F günü ve sonrası) → kesinleşen günler → durdurma → rapor → son.json. Idempotent.
 * @param o.ag      ağ katmanı (test için sahte); varsayılan gercekAg()
 * @param o.tablo   { E, k161 } (test için); varsayılan muhurDenetle()
 * @param o.haric   (ham) → neden|null (test için); varsayılan haricKur(E)
 * @param o.fler    kuruluş günleri (test için); varsayılan FLER
 * @param o.yalnizKurulus  yalnız kuruluş yazılır (geçmiş F eşdeğerlik denetimi — getiri HESAPLANMAZ)
 */
async function calistir({ simdi = Date.now(), dizin = I.VARSAYILAN_DIZIN, ag = null, tablo = null, haric = null, log = () => {}, butceMs = 8 * 60e3, fler = FLER, son: sonStr = SON, bas: basStr = BAS, rapor: raporStr = RAPOR, yalnizKurulus = false } = {}) {
  const F = dosyalar(dizin);
  return I.kilitle(dizin, async () => {
    const t0 = Date.now();
    const { L } = kural();
    const T = tablo || muhurDenetle();
    const A = ag || gercekAg();
    const hf = haric || haricKur(T.E);
    const Y = Math.floor(simdi / GUN) - 1;                 // son kapanmış gün
    const Fg = fler.map(gn), SONg = gn(sonStr);
    const mevcut = I.satirlariOku(F.kayit);
    const kur = new Map(mevcut.filter(x => x.tur === 'kurulus').map(x => [x.F, x]));
    const gunKayit = new Map(mevcut.filter(x => x.tur === 'gun').map(x => [x.gun, x]));
    const durK = mevcut.find(x => x.tur === 'dur') || null;
    const raporK = mevcut.find(x => x.tur === 'rapor') || null;
    const eksik = [], notlar = [], degisen = [], yeni = [];
    const bitti = !!raporK;
    const sonGun = Math.min(Y, SONg, durK ? gn(durK.kapanis) : Infinity);
    const Yv = Math.min(Y, SONg);                          // veri bu güne kadar gerekir

    // ── 1. mumlar (eşlemeli perp'ler + BTC); bütçe aşılırsa kalanlar sonraki koşuya ──
    const hamlar = [BTC, ...gecerliHamlar(T.E).filter(h => h !== BTC)];
    const mumlar = new Map();
    let butceDoldu = false;
    for (const ham of hamlar) {
      let o = okuJ(path.join(F.mum, ham + '.json'));
      if (!bitti && !(o && o.kapsam >= Yv)) {
        if (Date.now() - t0 > butceMs) butceDoldu = true;
        else { try { o = await mumGuncelle(F, A, ham, Yv, simdi); } catch (e) { eksik.push({ seri: `876:${ham}`, neden: e.message }); } }
      }
      if (o) mumlar.set(ham, o);
    }
    if (butceDoldu) eksik.push({ seri: '876:mum', neden: 'süre bütçesi doldu — kalan semboller sonraki koşuda' });
    const kapsam = (ham) => { const o = mumlar.get(ham); return !o ? -Infinity : o.kapsam == null ? -Infinity : o.kapsam; };
    const satirlar = (ham) => (mumlar.get(ham) ? mumlar.get(ham).satirlar : []);
    // ── 2. ^IRX (alınamazsa önbellek, o da yoksa portföy dosyası) ──
    let irx = (okuJ(F.irx) || {}).gunler || null;
    if (!bitti) { try { const l = await A.irx(); const h = new Map((irx || []).map(x => [x[0], x])); for (const x of l) h.set(x[0], x); irx = [...h.values()].sort((a, b) => a[0] - b[0]); yazJ(F.irx, { indirme: new Date(simdi).toISOString(), gunler: irx }); } catch (e) { notlar.push(`^IRX alınamadı (${e.message}) — önbellek`); } }
    if (!irx || !irx.length) { const p = okuJ(yollar.veri('portfoy', 'yahoo', '_IRX.json')); irx = p ? p.gunler.filter(q => q.c != null && q.c >= 0).map(q => [Math.floor(q.t / GUN), q.c]) : []; }

    const fonlar = new Map();
    const fonOku = (ham) => { const o = okuJ(path.join(F.fon, ham + '.json')); return o ? o.satirlar : []; };
    const mumMap = (l) => new Map(l.map(h => [h, satirlar(h)]));

    // ── 3. kuruluşlar ──
    const aylar = [];   // { F, kr, Fn, snapSha }
    for (let k = 0; k < Fg.length; k++) {
      const Fd = Fg[k], Fn = k + 1 < Fg.length ? Fg[k + 1] : SONg + 1;
      if (Fd > Y + 1 || Fd > SONg || (durK && Fd > gn(durK.kapanis))) break;   // henüz F günü değil (ya da durduruldu: sonrası kurulmaz)
      const kayitli = kur.get(gs(Fd));
      const bekleSiniri = Y + 1 >= Fd + BEKLEME_GUN;                // F + 2 gününün koşusu (ön kayıt §6)
      // mum tamlığı: bütün eşlemeli perp'ler F−1'e kadar (geçersizler kesin "yok")
      const mumEksik = hamlar.filter(h => !(kapsam(h) >= Fd - 1));
      if (!kayitli && mumEksik.length && (!bekleSiniri || mumEksik.includes(BTC))) { eksik.push({ seri: `876:kurulus:${gs(Fd)}`, neden: `${mumEksik.length} sembolün mumu eksik` }); break; }
      const kul = kayitli ? new Set(kayitli.mumEksik || []) : new Set(mumEksik);
      const V0 = vKur({ son: Fd, mumlar: mumMap(hamlar.filter(h => !kul.has(h))), fonlar, irx, E: T.E, k161: T.k161, haric: hf, kosular: T.kosular || null, temel: () => ({ tvl: null }) });
      const ad = tvlAdaylari(V0, Fd);
      const sluglar = [...new Set(ad.flatMap(x => birimSluglar(x.e)))].sort();
      const snap = new Map(); const alinamadi = new Set(kayitli ? kayitli.tvlAlinamadi || [] : []);
      let tvlEksik = 0;
      for (const s of sluglar) {
        if (alinamadi.has(s)) continue;
        try { snap.set(s, await tvlAl(F, A, Fd, s, simdi)); }
        catch (e) { if (kayitli || bekleSiniri) alinamadi.add(s); else tvlEksik++; if (!kayitli) notlar.push(`TVL ${s}: ${e.message}`); }
      }
      if (!kayitli && tvlEksik) { eksik.push({ seri: `876:kurulus:${gs(Fd)}`, neden: `${tvlEksik} birimin TVL'si alınamadı` }); break; }
      const V = vKur({ son: Fd, mumlar: mumMap(hamlar.filter(h => !kul.has(h))), fonlar, irx, E: T.E, k161: T.k161, haric: hf, kosular: T.kosular || null, temel: temelKur(snap, Fd) });
      const karar = []; L.lsKos(V, KOL, [Fd], Fd - 1, { karar, kararDur: Fd });
      const kr = karar[0];
      const snapSha = imza(sluglar.map(s => [s, snap.has(s) ? snap.get(s).sha : 'alinamadi']));
      const N = kr.evren.filter(x => typeof x[2] === 'number').length;
      const kayip = {}; for (const x of kr.evren) if (typeof x[2] !== 'number') kayip[x[2]] = (kayip[x[2]] || 0) + 1;
      if (!kayitli) {
        const sat = { tur: 'kurulus', F: gs(Fd), veriSon: gs(Fd - 1), tvlGunleri: [gs(Fd - 32), gs(Fd - 2)], kayitZamani: new Date(simdi).toISOString(), gecikmeli: Y > Fd,
          evren: kr.evren.length, N, n: kr.n, w: kr.w ?? null, long: kr.long || [], short: kr.short || [], Hn: kr.Hn ?? null, m: kr.m ?? null,
          kayip, mumEksik: [...kul], tvlAlinamadi: [...alinamadi], tvlBirim: sluglar.length, snapSha, kr, imza: imza(kr) };
        yeni.push(sat); kur.set(sat.F, sat);
        log('INFO', `876 gölge kuruluş ${sat.F}: evren ${sat.evren}, N ${N}, n ${kr.n}${kr.n ? ` (${kr.long.join(',')} | ${kr.short.join(',')})` : ' — boş ay'}`);
      } else if (kayitli.imza !== imza(kr) || kayitli.snapSha !== snapSha) degisen.push({ tur: 'kurulus', F: gs(Fd) });
      aylar.push({ Fd, Fn, kr: kayitli ? kayitli.kr : kr, snap, kul });
    }

    if (yalnizKurulus) { I.ekle(F.kayit, yeni); return { yeniSatir: yeni.length, eksik, notlar, degisen, kuruluslar: [...kur.values()] }; }
    // ── 4. funding + günler (aydan aya zincir) ──
    const tumGun = [];   // { gun, E (kesin değer), Eliq, kesin }
    let Ebas = 1, zincirTam = true;
    for (const a of aylar) {
      if (!zincirTam) break;
      const ayBit = a.Fn - 1;
      const bacak = a.kr.n ? [...a.kr.long, ...a.kr.short, BTC] : [];
      let tam = Math.min(sonGun, ayBit);
      for (const h of bacak) if (!(kapsam(h) >= tam)) tam = Math.min(tam, kapsam(h));
      const fonBit = Math.min(simdi, (tam + 1) * GUN);
      if (!bitti && tam >= a.Fd) for (const h of bacak) { try { const o = await fonGuncelle(F, A, h, a.Fd * GUN, fonBit); fonlar.set(h, o.satirlar); } catch (e) { eksik.push({ seri: `876:funding:${h}`, neden: e.message }); tam = Math.min(tam, Math.floor((((okuJ(path.join(F.fon, h + '.json')) || {}).kapsam) || a.Fd * GUN) / GUN) - 1); } }
      for (const h of bacak) if (!fonlar.has(h)) fonlar.set(h, fonOku(h));
      if (tam < a.Fd) { if (a.Fd <= sonGun) { zincirTam = false; if (sonGun >= a.Fd) eksik.push({ seri: `876:gun:${gs(a.Fd)}`, neden: 'bacak verisi eksik' }); } break; }
      const V = vKur({ son: Math.min(tam + 1, a.Fn), mumlar: mumMap(hamlar.filter(h => !a.kul.has(h))), fonlar, irx, E: T.E, k161: T.k161, haric: hf, kosular: T.kosular || null, temel: temelKur(a.snap, a.Fd) });
      const kesinR = L.lsKos(V, KOL, [a.Fd], tam, {});
      for (const x of kesinR.kayit) {
        const kesin = x.g < tam || x.g === ayBit;
        const liq = x.g === tam ? x.E : L.lsKos(V, KOL, [a.Fd], x.g, {}).kayit.slice(-1)[0].E;
        tumGun.push({ gun: gs(x.g), E: Ebas * x.E, Eliq: Ebas * liq, kesin, ay: gs(a.Fd), y: x.y });
      }
      if (tam < ayBit) { zincirTam = false; break; }
      Ebas *= kesinR.kayit[kesinR.kayit.length - 1].E;
    }

    // ── 5. durdurma (§5) ──
    const hucum = new Map(I.satirlariOku(F.golge).map(x => [x.gun, x.hucum && x.hucum.C0]));
    let dur = durK;
    if (!dur && tumGun.length) {
      const d = durdurmaBul(tumGun, hucum);
      if (d) {
        const sonKesin = [...gunKayit.keys()].sort().pop();
        const kapanis = sonKesin && sonKesin > d.gun ? sonKesin : d.gun;
        const x = tumGun.find(z => z.gun === kapanis);
        dur = { tur: 'dur', gun: d.gun, kural: d.kural, kapanis, E: x ? x.Eliq : null, mdd876: d.mdd876, mddC: d.mddC, mddH: d.mddH, kayitZamani: new Date(simdi).toISOString() };
        log('WARN', `876 gölge DURDU (${d.kural}, ${d.gun}): 876 DD ${(d.mdd876 * 100).toFixed(1)} %${d.mddC != null ? `, birleşim ${(d.mddC * 100).toFixed(1)} % vs Hücum ${(d.mddH * 100).toFixed(1)} %` : ''}`);
      }
    }
    const kapanisG = dur ? gn(dur.kapanis) : Infinity;
    // kesin günler: kayda eklenir (durdurma günü tasfiye değeriyle)
    for (const x of tumGun) {
      const g = gn(x.gun); if (g > kapanisG) continue;
      const kesin = x.kesin || g === kapanisG;
      if (!kesin) continue;
      const E = g === kapanisG ? x.Eliq : x.E;
      const sat = { tur: 'gun', gun: x.gun, ay: x.ay, E, kayitZamani: new Date(simdi).toISOString(), gecikmeli: Y > g + 1 };
      const e = gunKayit.get(x.gun);
      if (e) { if (Math.abs(e.E - E) > 1e-12 * Math.max(1, Math.abs(E))) degisen.push({ tur: 'gun', gun: x.gun, kayit: e.E, yeniden: E }); continue; }
      yeni.push(sat); gunKayit.set(x.gun, sat);
    }
    if (dur && !durK) {
      yeni.push(dur);
      for (let i = yeni.length - 1; i >= 0; i--) if (yeni[i].tur === 'kurulus' && yeni[i].F > dur.kapanis) { kur.delete(yeni[i].F); yeni.splice(i, 1); }   // durdurmadan sonraki kuruluş yapılmaz
    }

    // ── 6. rapor (2027-01-01 ya da durdurulunca; bir kez) ──
    const kesinGunler = [...gunKayit.values()].sort((a, b) => (a.gun < b.gun ? -1 : 1));
    const btcR = btcGetiri(satirlar(BTC));
    let raporSat = raporK;
    const raporGun = dur ? dur.kapanis : sonStr;
    const raporZamani = dur ? true : Y >= gn(raporStr) - 1;
    if (!raporK && raporZamani && kesinGunler.length && kesinGunler[kesinGunler.length - 1].gun === raporGun) {
      const b = birlesim(kesinGunler, hucum);
      if (b.gun === kesinGunler.length) {
        raporSat = { tur: 'rapor', ...raporHesapla({ kesinGunler, kur: [...kur.values()], hucum, btcR, irx, dur, sonStr: raporGun, basStr }), kayitZamani: new Date(simdi).toISOString() };
        yeni.push(raporSat);
      } else eksik.push({ seri: '876:rapor', neden: `Hücum gölge satırı eksik (${b.eksikHucum})` });
    }
    I.ekle(F.kayit, yeni);

    // ── 7. özet ──
    const ozet = ozetYap({ simdi, Y, kur: [...kur.values()].sort((a, b) => (a.F < b.F ? -1 : 1)), kesinGunler, tumGun, hucum, dur, rapor: raporSat, eksik, notlar, degisen, fler, sonStr, raporStr, basStr, irx,
      sonMum: kapsam(BTC) > -Infinity ? gs(kapsam(BTC)) : null, mumSembol: mumlar.size, sureMs: Date.now() - t0, yeniSatir: yeni.length });
    yazJ(F.son, ozet);
    if (degisen.length) log('WARN', `876 gölge: ${degisen.length} kayıtlı satırın yeniden hesabı farklı — kayıt DEĞİŞMEDİ`);
    return ozet;
  });
}
function btcGetiri(sat) { const m = new Map(); for (let i = 1; i < sat.length; i++) if (sat[i][0] - sat[i - 1][0] === GUN) m.set(gs(sat[i][0] / GUN), sat[i][3] / sat[i - 1][3] - 1); return m; }
/** Nakit: gün listesi için Π(1 + y_t) − 1 (^IRX/100/365, D−1 ve öncesindeki son kapanış). */
function nakitGetiri(gunler, irx) {
  const { L } = kural();
  const y = L.yYap(irx.map(q => [q[0], q[1] / 100]).sort((a, b) => a[0] - b[0]));
  return gunler.reduce((a, g) => a * (1 + y(gn(g))), 1) - 1;
}
/** Saf: rapor (§4, yalnız betimleyici). */
function raporHesapla({ kesinGunler: kg, kur, hucum, btcR, irx, dur, sonStr, basStr }) {
  // durdurulduysa kapanış günü tasfiye değeriyle (dur.E), sonrası yok
  const kesinGunler = dur ? kg.filter(x => x.gun <= dur.kapanis).map(x => (x.gun === dur.kapanis && Number.isFinite(dur.E) ? { ...x, E: dur.E } : x)) : kg;
  const aylik = [];
  let once = 1;
  const ayGrup = new Map(); for (const x of kesinGunler) { if (!ayGrup.has(x.ay)) ayGrup.set(x.ay, []); ayGrup.get(x.ay).push(x); }
  for (const [ay, l] of ayGrup) {
    const son = l[l.length - 1].E, r = son / once - 1;
    const nakit = nakitGetiri(l.map(x => x.gun), irx);
    const k = kur.find(z => z.F === ay);
    aylik.push({ ay, getiri: r, nakit, nakdeFazla: Math.log1p(r) - Math.log1p(nakit), gun: l.length, evren: k ? k.evren : null, N: k ? k.N : null, n: k ? k.n : null, long: k ? k.long : [], short: k ? k.short : [], w: k ? k.w : null });
    once = son;
  }
  const b = birlesim(kesinGunler, hucum);
  const rBtc = b.gunler.map(g => btcR.get(g));
  const tamBtc = rBtc.every(Number.isFinite);
  const nakitT = nakitGetiri(b.gunler, irx);
  return {
    deneme: DENEME, plan: PLAN, bas: basStr, son: sonStr, gun: b.gun, durduruldu: !!dur, durdurma: dur ? { gun: dur.gun, kural: dur.kural } : null,
    aylik, toplam876: b.E876[b.E876.length - 1] - 1, nakitToplam: nakitT, nakdeFazla: Math.log1p(b.E876[b.E876.length - 1] - 1) - Math.log1p(nakitT),
    korBtc: tamBtc ? korelasyon(b.r876, rBtc) : null, korHucum: korelasyon(b.r876, b.rH),
    birlesim: { getiri: b.EC[b.EC.length - 1] - 1, maxDD: b.mddC }, hucum: { getiri: b.EH[b.EH.length - 1] - 1, maxDD: b.mddH }, mdd876: b.mdd876,
    fark: { getiri: (b.EC[b.EC.length - 1] - b.EH[b.EH.length - 1]), maxDD: b.mddC - b.mddH },
    isletim: { kurulus: kur.map(k => ({ F: k.F, kayitZamani: k.kayitZamani, gecikmeli: k.gecikmeli, veriSon: k.veriSon, tvlGunleri: k.tvlGunleri, snapSha: k.snapSha, evren: k.evren, N: k.N, n: k.n, kayip: k.kayip, mumEksik: k.mumEksik, tvlAlinamadi: k.tvlAlinamadi, ileriBakisYok: k.kayitZamani >= `${k.F}T00:00:00` && k.veriSon < k.F })) },
    not: '2 ay istatistiksel kanıt değildir — yalnız betimleyici; kabul/ret, canlı ya da sermaye kararı değildir.',
  };
}
/** Saf: son.json özeti (panel). */
function ozetYap({ simdi, Y, kur, kesinGunler, tumGun, hucum, dur, rapor, eksik, notlar, degisen, fler, sonStr, raporStr, basStr, irx, sonMum, mumSembol, sureMs, yeniSatir }) {
  const tum = tumGun.filter(x => !dur || x.gun <= dur.kapanis).map(x => ({ gun: x.gun, E: dur && x.gun === dur.kapanis ? x.Eliq : (x.kesin ? x.E : x.Eliq), ay: x.ay }));
  const son = tum[tum.length - 1] || null;
  const ayK = kur[kur.length - 1] || null;
  let mtd = null;
  if (son && ayK) { const onceki = tum.filter(x => x.ay < ayK.F); const e0 = onceki.length ? onceki[onceki.length - 1].E : 1; mtd = son.ay === ayK.F ? son.E / e0 - 1 : null; }
  const b = tum.length ? birlesim(tum, hucum) : null;
  const d1 = tum.length ? maxDD([1, ...tum.map(x => x.E)]) : null;
  const durum = rapor ? 'rapor' : dur ? 'durdu' : !kur.length ? 'bekliyor' : 'suruyor';
  return {
    zaman: new Date(simdi).toISOString(), deneme: DENEME, plan: PLAN, durum, sonKapanmis: gs(Y), sonMum, mumSembol, sureMs, yeniSatir,
    takvim: { bas: basStr, kuruluslar: fler.slice(), son: sonStr, rapor: raporStr },
    ay: ayK ? { F: ayK.F, evren: ayK.evren, N: ayK.N, n: ayK.n, long: ayK.long.length, short: ayK.short.length, longL: ayK.long, shortL: ayK.short, w: ayK.w, gecikmeli: ayK.gecikmeli } : null,
    sonGun: son ? son.gun : null, sonGunKesin: son ? !!(kesinGunler.length && kesinGunler[kesinGunler.length - 1].gun === son.gun) : null,
    mtd, toplam876: son ? son.E - 1 : null, mdd876: d1,
    birlesim: b && b.gun ? { gun: b.gun, son: b.son, getiri: b.EC[b.EC.length - 1] - 1, maxDD: b.mddC, eksikHucum: b.eksikHucum } : (b ? { gun: 0, eksikHucum: b.eksikHucum } : null),
    hucum: b && b.gun ? { getiri: b.EH[b.EH.length - 1] - 1, maxDD: b.mddH } : null,
    durdurma: { D1: { esik: D1_ESIK, deger: d1, tetik: !!(dur && dur.kural === 'D1') }, D2: { puan: D2_PUAN, fark: b && b.gun ? b.mddC - b.mddH : null, tetik: !!(dur && dur.kural === 'D2') }, dur: dur ? { gun: dur.gun, kural: dur.kural, kapanis: dur.kapanis } : null },
    rapor: rapor ? { gun: rapor.son, toplam876: rapor.toplam876, birlesim: rapor.birlesim, hucum: rapor.hucum, korBtc: rapor.korBtc } : null,
    seri: tum.map(x => ({ gun: x.gun, E: x.E })),
    eksik, notlar, degisen,
    not: '2 ay istatistiksel kanıt değildir.',
  };
}

/* ── Panel: GET /api/ileri/876 (yalnız dosya okur; ağ yok) ── */
function panelVerisi({ dizin = I.VARSAYILAN_DIZIN } = {}) {
  const F = dosyalar(dizin);
  const s = okuJ(F.son);
  return { success: true, ozet: s, takvim: { bas: BAS, kuruluslar: FLER.slice(), son: SON, rapor: RAPOR }, deneme: DENEME, plan: PLAN };
}

module.exports = {
  GUN, KOSU_SHA, kosuBirlestir, DENEME, KOL, PLAN, FLER, BAS, SON, RAPOR, PAY_H, PAY_876, D1_ESIK, D2_PUAN, KOD_SHA, TABLO_SHA, GUN0, BEKLEME_GUN,
  gn, gs, lfSha, muhurDenetle, dosyalar, gercekAg, mumGuncelle, fonGuncelle, tvlAl, vKur, haricKur, temelKur, tvlAdaylari,
  maxDD, korelasyon, birlesim, durdurmaBul, raporHesapla, ozetYap, nakitGetiri, btcGetiri, calistir, panelVerisi, gecerliHamlar,
};
