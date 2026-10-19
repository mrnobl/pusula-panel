#!/usr/bin/env node
/**
 * DİKKAT L/S — ham veri indirme + FİYATSIZ olay/eşleme tabloları (PLAN-DIKKAT-LS.md §1.10, §10 madde 1–2; ön kayıt 40a4326).
 *
 *   node scripts/dikkat-ls-veri.js kimlik    # CMS (49/161) başlık+gövde, /hacks, /protocols, lite/protocols2, stablecoins,
 *                                           # CoinGecko coins/list + güncel piyasa değeri, CM katalog + son CapMrktEstUSD
 *   node scripts/dikkat-ls-veri.js tablo     # olay + eşleme + hariç SHA'ları → kayitlar/dikkat-ls/ (+ tablolar.json)
 *   node scripts/dikkat-ls-veri.js seri      # eşlenen birimlerin DefiLlama ücret/gelir/TVL + CM CapMrktEstUSD serileri (önbellek)
 *
 * Bu dosya FİYAT / FUNDING / HACİM OKUMAZ: market.db'den yalnız perp sembol ADLARI (SELECT DISTINCT symbol) okunur.
 * Ham veri bir kez indirilir (dosya varsa yeniden istenmez; indirme günü + SHA-256 `ham/manifest.json`'da) — §1.10 madde 4.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIZIN = process.env.DLS_DIZIN || path.join(ROOT, 'data', 'arastirma', 'dikkat-ls');
const HAM = path.join(DIZIN, 'ham');
const KAYIT = path.join(ROOT, 'kayitlar', 'dikkat-ls');
const DB_YOL = process.env.DLS_DB || path.join(ROOT, 'data', 'market.db');
const GUN = 864e5;
const ONKAYIT = '40a4326';

/** §1.1 hariç listeleri: HEAD (2026-10-16) sürümleri ve sabit SHA-256'ları (çalışma kopyası DEĞİL). */
const HARIC_SHA = {
  'referans/binance-tradfi-semboller.json': '130d1c3a554fffa3386ce73b977ecd1a2cd65cb59f5e372bb24d3cf7ef297bdc',
  'lib/veri/tradfi.js': 'e93f4ed77ab1e11884a648b02f74048d88c45091397be04663bc4659d4fe825b',
  'lib/tarama/evren.js': '26c49662d8f8499de2a9b115b5d5f3ccda505de8d21db7dd6cace0f3f489a08d',
  'lib/research/pitVeri.js': '2c9449756b05284e17a2281048e7fb28007ae1a5c8087ef67d786b4bc1a74735',
};
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
/** Sabit SHA'lı içeriği git nesnelerinden bul (çalışma kopyası değişmiş olabilir): HEAD, sonra ön kayıt commit'i. */
function haricIcerik(rel) {
  for (const rev of ['HEAD', ONKAYIT]) {
    try {
      const b = execFileSync('git', ['show', `${rev}:${rel}`], { cwd: ROOT, maxBuffer: 64 << 20 });
      if (sha(b) === HARIC_SHA[rel]) return { icerik: b, rev };
    } catch { /* sonraki */ }
  }
  throw new Error(`hariç listesi ${rel} sabit SHA'yla (${HARIC_SHA[rel].slice(0, 12)}…) bulunamadı — DUR (§1.1)`);
}
/** Hariç kümeleri (HEAD içeriklerinden). */
function haricKumeleri() {
  const tr = JSON.parse(haricIcerik('referans/binance-tradfi-semboller.json').icerik.toString('utf8'));
  const tradfi = new Set((tr.semboller || []).map(x => x.taban));
  const evSrc = haricIcerik('lib/tarama/evren.js').icerik.toString('utf8');
  const m = /const HARIC_V1 = Object\.freeze\((\{[\s\S]*?\})\);/.exec(evSrc);
  if (!m) throw new Error('evren.js HARIC_V1 ayrıştırılamadı');
  const HARIC_V1 = Function('"use strict"; return (' + m[1] + ');')();
  const pitSrc = haricIcerik('lib/research/pitVeri.js').icerik.toString('utf8');
  const ms = /const STABIL = (\/[^\n]+\/);/.exec(pitSrc);
  if (!ms) throw new Error('pitVeri.js STABIL ayrıştırılamadı');
  const STABIL = Function('"use strict"; return ' + ms[1] + ';')();
  haricIcerik('lib/veri/tradfi.js');   // SHA denetimi (davranış: taban kümesine üyelik — tradfiMi)
  return { tradfi, HARIC_V1, STABIL };
}

/* ═══════════ AĞ ═══════════ */
const bekle = (ms) => new Promise(r => setTimeout(r, ms));
const manifestYol = () => path.join(HAM, 'manifest.json');
let _man = null;
const manifest = () => (_man || (_man = fs.existsSync(manifestYol()) ? JSON.parse(fs.readFileSync(manifestYol(), 'utf8')) : {}));
function manifestYaz() { fs.mkdirSync(HAM, { recursive: true }); const t = manifestYol() + '.tmp'; fs.writeFileSync(t, JSON.stringify(manifest(), null, 0)); fs.renameSync(t, manifestYol()); }
async function getJson(url, { deneme = 8, aralik = 20000, basliklar = {} } = {}) {
  let son;
  for (let i = 0; i < deneme; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'pusula-arastirma/1.0', Accept: 'application/json', ...basliklar } });
      if (r.status === 429 || r.status >= 500) { son = new Error('HTTP ' + r.status); await bekle(aralik * (i + 1)); continue; }
      if (r.status !== 200) { const e = new Error('HTTP ' + r.status); e.durum = r.status; throw e; }
      return await r.text();
    } catch (e) { if (e.durum) throw e; son = e; await bekle(aralik * (i + 1)); }
  }
  throw son;
}
/** rel dosyası yoksa indir (+ isteğe bağlı küçültme), manifest'e yaz. → ayrıştırılmış JSON. */
async function hamAl(rel, url, { kucult, gecikme = 0, basliklar } = {}) {
  const yol = path.join(HAM, rel);
  if (fs.existsSync(yol)) return JSON.parse(fs.readFileSync(yol, 'utf8'));
  if (gecikme) await bekle(gecikme);
  const metin = await getJson(url, { basliklar });
  let j = JSON.parse(metin);
  if (kucult) j = kucult(j);
  const cikti = JSON.stringify(j);
  fs.mkdirSync(path.dirname(yol), { recursive: true });
  fs.writeFileSync(yol + '.tmp', cikti); fs.renameSync(yol + '.tmp', yol);
  manifest()[rel] = { url, indirme: new Date().toISOString(), sha256: sha(cikti), bayt: cikti.length, kucultuldu: !!kucult };
  manifestYaz();
  return j;
}

/* ═══════════ KİMLİK VERİSİ ═══════════ */
const CMS = 'https://www.binance.com/bapi/composite/v1/public/cms/article';
async function cmsListe(katalog) {
  const ilk = await hamAl(`cms/liste-${katalog}-1.json`, `${CMS}/list/query?type=1&catalogId=${katalog}&pageNo=1&pageSize=50`, { gecikme: 500 });
  const toplam = ilk.data.catalogs[0].total, sayfa = Math.ceil(toplam / 50);
  const out = [...ilk.data.catalogs[0].articles];
  for (let p = 2; p <= sayfa; p++) {
    const j = await hamAl(`cms/liste-${katalog}-${p}.json`, `${CMS}/list/query?type=1&catalogId=${katalog}&pageNo=${p}&pageSize=50`, { gecikme: 500 });
    out.push(...j.data.catalogs[0].articles);
  }
  const tekil = new Map(); for (const a of out) tekil.set(a.code, { code: a.code, id: a.id, title: a.title, releaseDate: a.releaseDate, katalog });
  return [...tekil.values()].sort((a, b) => a.releaseDate - b.releaseDate || (a.code < b.code ? -1 : 1));
}
const cmsDetay = (code) => hamAl(`cms/detay/${code}.json`, `${CMS}/detail/query?articleCode=${code}`, {
  gecikme: 1500, kucult: (j) => ({ code, title: j.data.title, publishDate: j.data.publishDate, body: j.data.body, pairs: j.data.pairs, catalogId: j.data.firstCatalogId }),
});
const mtBaslik = (t) => /monitoring tag/i.test(t);

async function kimlik() {
  fs.mkdirSync(HAM, { recursive: true });
  console.log('CMS katalog 49…'); const k49 = await cmsListe(49);
  console.log('CMS katalog 161…'); const k161 = await cmsListe(161);
  const mt = [...k49, ...k161].filter(a => mtBaslik(a.title));
  console.log(`katalog 49: ${k49.length}, 161: ${k161.length}, başlıkta Monitoring Tag: ${mt.length}`);
  let n = 0;
  for (const a of [...mt, ...k161]) { await cmsDetay(a.code); if (++n % 50 === 0) console.log(`  detay ${n}`); }
  console.log('DefiLlama…');
  await hamAl('llama/hacks.json', 'https://api.llama.fi/hacks');
  await hamAl('llama/protocols.json', 'https://api.llama.fi/protocols', {
    kucult: (j) => j.map(p => ({ id: p.id, name: p.name, slug: p.slug, symbol: p.symbol, gecko_id: p.gecko_id, parentProtocol: p.parentProtocol, listedAt: p.listedAt, deadFrom: p.deadFrom, rugged: p.rugged, deprecated: p.deprecated, category: p.category, github: p.github, address: p.address })),
  });
  await hamAl('llama/protocols2.json', 'https://api.llama.fi/lite/protocols2?b=2', {
    kucult: (j) => ({ parentProtocols: j.parentProtocols.map(p => ({ id: p.id, name: p.name, gecko_id: p.gecko_id, github: p.github, symbol: p.symbol })), protocols: j.protocols.map(p => ({ name: p.name, symbol: p.symbol, defillamaId: p.defillamaId, geckoId: p.geckoId, parentProtocol: p.parentProtocol })) }),
  });
  await hamAl('llama/stablecoins.json', 'https://stablecoins.llama.fi/stablecoins?includePrices=false', {
    kucult: (j) => j.peggedAssets.map(p => ({ id: p.id, name: p.name, symbol: p.symbol, gecko_id: p.gecko_id, pegType: p.pegType })),
  });
  console.log('CoinGecko coins/list…');
  await hamAl('cg/coins-list.json', 'https://api.coingecko.com/api/v3/coins/list');
  console.log('CM katalog…');
  await hamAl('cm/katalog.json', 'https://community-api.coinmetrics.io/v4/catalog-v2/asset-metrics?metrics=CapMrktEstUSD&page_size=10000', {
    kucult: (j) => j.data.map(a => { const f = (a.metrics[0].frequencies || []).find(x => x.frequency === '1d') || {}; return { asset: a.asset, min: f.min_time, max: f.max_time, community: f.community }; }),
  });
  // Aday eşlemeler (CM son değeri + CG güncel piyasa değeri yalnız eşleme denetimi için, §1.10 madde 2)
  const ad = adayEslesme();
  const ids = [...new Set(ad.filter(x => x.geckoId).map(x => x.geckoId))].sort();
  for (let i = 0; i < ids.length; i += 200) {
    const parca = ids.slice(i, i + 200);
    await hamAl(`cg/markets-${String(i / 200).padStart(2, '0')}.json`, `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&page=1&ids=${parca.join(',')}`, {
      gecikme: 15000, kucult: (j) => j.map(x => ({ id: x.id, symbol: x.symbol, market_cap: x.market_cap, last_updated: x.last_updated })),
    });
  }
  const kat = new Map(JSON.parse(fs.readFileSync(path.join(HAM, 'cm/katalog.json'), 'utf8')).map(a => [a.asset, a]));
  const cmIds = [...new Set(ad.map(x => x.taban.toLowerCase()).filter(a => kat.has(a)))].sort();
  // son değer: varlıklar kendi max_time günlerine göre gruplanır (çok varlıklı yanıt sayfalanıp kesilmesin), grup başına ≤ 40
  const grup = new Map(); for (const a of cmIds) { const m = String(kat.get(a).max).slice(0, 10); if (!grup.has(m)) grup.set(m, []); grup.get(m).push(a); }
  for (const [m, liste] of [...grup.entries()].sort()) for (let i = 0; i < liste.length; i += 40) {
    const parca = liste.slice(i, i + 40);
    const bas = new Date(Date.parse(m) - 3 * GUN).toISOString().slice(0, 10);
    await hamAl(`cm/son-${m}-${String(i / 40).padStart(2, '0')}.json`, `https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=${parca.join(',')}&metrics=CapMrktEstUSD&frequency=1d&start_time=${bas}&page_size=10000`, {
      gecikme: 800, kucult: (j) => { if (j.next_page_token) throw new Error('CM son değer yanıtı sayfalı — grup küçültülmeli'); const son = {}; for (const r of j.data) son[r.asset] = { t: r.time.slice(0, 10), v: +r.CapMrktEstUSD }; return son; },
    });
  }
  // EK-1 (a): listedAt'i olmayan üyelerin TVL serisi başlangıç günü (yalnız ilk tarih saklanır)
  const bosUye = [...new Set(ad.filter(x => x.durum === 'aday').flatMap(x => x.uyeler.filter(u => u.listedAt == null).map(u => u.slug)))].sort();
  console.log(`listedAt'siz üye TVL başlangıcı: ${bosUye.length}`);
  for (const sl of bosUye) {
    try { await hamAl(`llama/tvlbas/${sl}.json`, `https://api.llama.fi/protocol/${encodeURIComponent(sl)}`, { gecikme: 300, kucult: (j) => ({ slug: sl, bas: (j.tvl || []).length ? Math.min(...j.tvl.map(x => x.date)) : null }) }); }
    catch (e) { if (e.durum === 404 || e.durum === 400) yokYaz(`llama/tvlbas/${sl}.json`, e.durum); else throw e; }
  }
  console.log('kimlik verisi tamam');
}

/* ═══════════ EŞLEME (§1.10 madde 2) ═══════════ */
/** USDⓈ-M çarpan öneki (lib/tarama/evren.js perpTaban ile aynı kural). */
function perpTaban(b) {
  const m = /^(1000000|100000|10000|1000|100|1M)([A-Z0-9]{2,})$/.exec(String(b || ''));
  return m ? { taban: m[2], carpan: m[1] } : { taban: String(b || ''), carpan: null };
}
/** market.db'den YALNIZ sembol adları (fiyat okunmaz). */
function perpSemboller() {
  if (process.env.DLS_SEMBOLLER) return JSON.parse(fs.readFileSync(process.env.DLS_SEMBOLLER, 'utf8'));
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(DB_YOL, { readOnly: true });
  const s = db.prepare("SELECT DISTINCT symbol FROM candles WHERE venue='binance' AND market='perp' AND timeframe='1d'").all().map(r => r.symbol);
  db.close();
  return s.filter(x => /^[A-Z0-9]+\/USDT:USDT$/.test(x)).sort();
}
const hamOku = (rel) => JSON.parse(fs.readFileSync(path.join(HAM, rel), 'utf8'));
const parentSlug = (pid) => String(pid).replace(/^parent#/, '');

/**
 * DefiLlama birimleri: gecko_id → { geckoId, birim: {tip, slug|sluglar}, uyeler, listedAt, github[], dead }.
 * Kural: aynı gecko_id'yi taşıyan protokoller tek birim; taşıyıcılardan biri ebeveyn ise (ya da hepsinin ortak ebeveyni varsa)
 * ebeveyn serisi; tek taşıyıcı → o protokol; ortak ebeveynsiz birden çok taşıyıcı → serilerin toplamı.
 */
function llamaBirimleri() {
  const P = hamOku('llama/protocols.json'), P2 = hamOku('llama/protocols2.json');
  const ebeveyn = new Map(P2.parentProtocols.map(p => [p.id, p]));
  const cocuk = new Map(); for (const p of P) if (p.parentProtocol) { if (!cocuk.has(p.parentProtocol)) cocuk.set(p.parentProtocol, []); cocuk.get(p.parentProtocol).push(p); }
  const tasiyici = new Map();   // gecko_id → [{tur:'ebeveyn'|'protokol', ...}]
  const ekle = (g, x) => { if (!g) return; if (!tasiyici.has(g)) tasiyici.set(g, []); tasiyici.get(g).push(x); };
  for (const e of P2.parentProtocols) ekle(e.gecko_id, { tur: 'ebeveyn', id: e.id, slug: parentSlug(e.id), symbol: e.symbol, github: e.github || [] });
  for (const p of P) ekle(p.gecko_id, { tur: 'protokol', id: p.id, slug: p.slug, symbol: p.symbol, parent: p.parentProtocol || null, github: p.github || [], listedAt: p.listedAt, deadFrom: p.deadFrom });
  const birimler = new Map();
  for (const [g, t] of tasiyici) {
    const eb = t.filter(x => x.tur === 'ebeveyn');
    const pr = t.filter(x => x.tur === 'protokol');
    let birim, uyeler;
    const ortakEb = pr.length && pr.every(x => x.parent && x.parent === pr[0].parent) ? pr[0].parent : null;
    if (eb.length === 1 && pr.every(x => x.parent === eb[0].id)) { birim = { tip: 'ebeveyn', slug: eb[0].slug, id: eb[0].id }; uyeler = cocuk.get(eb[0].id) || []; }
    else if (eb.length === 0 && ortakEb && ebeveyn.has(ortakEb) && !ebeveyn.get(ortakEb).gecko_id) { birim = { tip: 'ebeveyn', slug: parentSlug(ortakEb), id: ortakEb }; uyeler = cocuk.get(ortakEb) || []; }
    else if (eb.length === 0 && pr.length === 1) { birim = { tip: 'protokol', slug: pr[0].slug, id: pr[0].id }; uyeler = [P.find(x => x.id === pr[0].id)]; }
    else if (eb.length === 0 && pr.length > 1 && pr.every(x => !x.parent)) { birim = { tip: 'toplam', sluglar: pr.map(x => x.slug).sort(), id: pr.map(x => x.id).sort().join('+') }; uyeler = pr.map(x => P.find(y => y.id === x.id)); }
    else { birimler.set(g, { geckoId: g, belirsiz: 'gecko_id birden çok ebeveyn/ebeveynsiz karışık taşıyıcıda: ' + t.map(x => x.id).join(', ') }); continue; }
    const listed = uyeler.map(u => u && u.listedAt).filter(Number.isFinite);
    const github = [...new Set([...eb.flatMap(x => x.github), ...pr.flatMap(x => x.github), ...uyeler.flatMap(u => (u && u.github) || [])])].sort();
    const olu = uyeler.length && uyeler.every(u => u && u.deadFrom);
    // EK-1 (a): listedAt kuralı ÜYE düzeyinde uygulanır → üyeler (id, slug, listedAt) tabloya yazılır
    const uyeListe = uyeler.filter(Boolean).map(u => ({ id: String(u.id), slug: u.slug, listedAt: Number.isFinite(u.listedAt) ? u.listedAt : null })).sort((a, b) => (a.slug < b.slug ? -1 : 1));
    birimler.set(g, { geckoId: g, birim, uyeSay: uyeler.length, uyeler: uyeListe, listedAtEnErkenCocuk: listed.length ? Math.min(...listed) : null, github, olu: !!olu,
      llamaSemboller: [...new Set(t.map(x => String(x.symbol || '').toUpperCase()).filter(s => s && s !== '-'))] });
  }
  return birimler;
}
/** Aday eşleme satırları (CM/CG denetiminden önce). */
function adayEslesme() {
  const cg = new Map(hamOku('cg/coins-list.json').map(c => [c.id, String(c.symbol || '').toUpperCase()]));
  const B = llamaBirimleri();
  // taban → DefiLlama'daki gecko_id'ler (CoinGecko coins/list sembolü = taban; §1.10 madde 2)
  const tabanG = new Map();
  const ekle = (s, g) => { if (!s) return; if (!tabanG.has(s)) tabanG.set(s, new Set()); tabanG.get(s).add(g); };
  for (const [g] of B) ekle(cg.get(g), g);
  const out = [];
  for (const sym of perpSemboller()) {
    const ham = sym.split('/')[0];
    const { taban, carpan } = perpTaban(ham);
    const gs = tabanG.get(taban);
    const satir = { perp: sym, ham, taban, carpan, geckoId: null, durum: 'eslesme-yok', neden: null };
    if (!gs || !gs.size) { satir.neden = 'DefiLlama\'da bu tabanlı gecko_id yok'; out.push(satir); continue; }
    if (gs.size > 1) { satir.durum = 'red'; satir.neden = 'belirsiz: taban birden çok gecko_id\'de (' + [...gs].sort().join(', ') + ')'; out.push(satir); continue; }
    const g = [...gs][0];
    if (cg.get(g) !== taban) { satir.durum = 'red'; satir.neden = `CoinGecko sembolü (${cg.get(g) || 'yok'}) ≠ taban (yalnız DefiLlama sembolü tutuyor)`; satir.geckoId = g; out.push(satir); continue; }
    const b = B.get(g);
    if (b.belirsiz) { satir.durum = 'red'; satir.neden = b.belirsiz; satir.geckoId = g; out.push(satir); continue; }
    Object.assign(satir, { geckoId: g, durum: 'aday', birim: b.birim, uyeler: b.uyeler, github: b.github, olu: b.olu, uyeSay: b.uyeSay });
    out.push(satir);
  }
  // aynı gecko_id birden çok perp'te (ör. BOB / 1000000BOB) → hangi perp'in o coin olduğu belirsiz → hepsi red
  const say = new Map(); for (const r of out) if (r.durum === 'aday') say.set(r.geckoId, (say.get(r.geckoId) || 0) + 1);
  for (const r of out) if (r.durum === 'aday' && say.get(r.geckoId) > 1) { r.durum = 'red'; r.neden = `belirsiz: gecko_id ${r.geckoId} birden çok perp'te`; }
  return out;
}

/* ═══════════ OLAYLAR ═══════════ */
/** CMS gövdesi (JSON ağaç) → düz metin; blok öğeleri arasına satır sonu. */
function cmsMetin(body) {
  let b = body; try { b = typeof body === 'string' ? JSON.parse(body) : body; } catch { return String(body || ''); }
  const BLOK = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'tr', 'td', 'th', 'br', 'div', 'table', 'ul', 'ol']);
  const yuru = (n) => {
    if (!n) return '';
    if (Array.isArray(n)) return n.map(yuru).join('');
    if (typeof n === 'string') return n;
    let s = n.node === 'text' ? String(n.text || '') : '';
    if (n.child) s += yuru(n.child);
    if (n.tag && BLOK.has(n.tag)) s = (n.tag === 'td' || n.tag === 'th') ? s + ' | ' : s + '\n';
    return s;
  };
  return yuru(b).replace(/&nbsp;/g, ' ').replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
}
/** Sembol listesi parçası → semboller. "Name (SYM)" varsa parantezler; yoksa BÜYÜK harfli sözcükler (başlık listesi). */
function sembolAyikla(parca) {
  const par = [...parca.matchAll(/\(([A-Z0-9]{1,15})\)/g)].map(m => m[1]);
  if (par.length) return par;
  return [...parca.matchAll(/\b([A-Z0-9]{1,15})\b/g)].map(m => m[1]).filter(s => /[A-Z]/.test(s) && !/^(AND|UTC|BINANCE|USD|USDT|TAG|TAGS|SEED|MONITORING)$/.test(s) && !/^\d+$/.test(s));
}
/**
 * Monitoring Tag duyurusu → { ekle, kaldir, kanit, kaynak }. Kural (mekanik, §1.10 madde 3):
 *  GÖVDE (satır satır): ekleme başlığı = "Monitoring Tag" geçen ve "to be added to" / "newly added" / "applied to the following"
 *  kalıbı taşıyan satır; kaldırma başlığı = "to be removed from the Monitoring Tag". Başlık satırındaki ':' sonrası ile izleyen
 *  "Ad (SYM)" satırları (boş satırlar atlanır, "(SYM)" taşımayan ilk dolu satırda biter) toplanır. Seed Tag listeleri ayrı başlık
 *  olduğundan yok sayılır. "The Monitoring Tag has been applied to Ad (SYM)" tek cümle ekleme.
 *  BAŞLIK (yalnız gövde hiçbir şey vermezse): "Extend the Monitoring Tag to (Include) …" ve "Remove the Monitoring Tag for …";
 *  "… the Seed Tag for …" parçaları atılır.
 */
function mtAyristir(baslik, metin) {
  const ekle = new Set(), kaldir = new Set(), kanit = { ekle: [], kaldir: [] };
  const satirlar = String(metin || '').split('\n').map(s => s.trim());
  for (let i = 0; i < satirlar.length; i++) {
    const s = satirlar[i];
    if (!/monitoring tag/i.test(s)) continue;
    let hedef = null;
    if (/to be removed from the monitoring tag/i.test(s)) hedef = 'kaldir';
    else if (/(to be added to the monitoring tag|newly added|monitoring tags?,? which will be applied to the following)/i.test(s)) hedef = 'ekle';
    if (hedef) {
      const kume = hedef === 'ekle' ? ekle : kaldir;
      const iki = s.lastIndexOf(':');
      const bul = [...(iki >= 0 ? sembolAyiklaPar(s.slice(iki + 1)) : [])];
      let j = i + 1;
      for (; j < satirlar.length; j++) {
        const t = satirlar[j];
        if (!t) continue;
        const p = sembolAyiklaPar(t);
        if (!p.length) break;
        bul.push(...p);
      }
      if (bul.length) { bul.forEach(x => kume.add(x)); kanit[hedef].push('gövde: ' + (s + ' ' + satirlar.slice(i + 1, j).filter(Boolean).join(' ')).slice(0, 400)); }
      continue;
    }
    const m = /the monitoring tag has been applied to (.*?)(?: due to|[.,;]|$)/i.exec(s);
    if (m) { const p = sembolAyiklaPar(m[1]); if (p.length) { p.forEach(x => ekle.add(x)); kanit.ekle.push('gövde: ' + m[0].slice(0, 300)); } }
  }
  let kaynak = 'gövde';
  if (!ekle.size && !kaldir.size) {
    kaynak = 'başlık';
    const c = String(baslik || '').replace(/,?\s*(and\s+)?(remove\s+)?the\s+seed\s+tags?\s+(for|from)\s.*?(?=,?\s*(?:and\s+)?(?:remove|extend)\s+the\s+monitoring|\s+on\s+\d{4}-\d{2}-\d{2}|$)/ig, ' ');
    let m;
    if ((m = /extend\s+the\s+monitoring\s+tags?\s+to\s+(?:include\s+)?(.*?)(?=,?\s*(?:and\s+)?remove\s+the|\s+on\s+\d{4}-\d{2}-\d{2}|$)/i.exec(c))) { const s = sembolAyikla(m[1]); s.forEach(x => ekle.add(x)); if (s.length) kanit.ekle.push('başlık: ' + m[0]); }
    if ((m = /remove\s+the\s+monitoring\s+tags?\s+(?:for|from)\s+(.*?)(?=,?\s*(?:and\s+)?(?:remove|extend)\s+the|\s+on\s+\d{4}-\d{2}-\d{2}|$)/i.exec(c))) { const s = sembolAyikla(m[1]); s.forEach(x => kaldir.add(x)); if (s.length) kanit.kaldir.push('başlık: ' + m[0]); }
  }
  return { ekle: [...ekle].sort(), kaldir: [...kaldir].sort(), kanit, kaynak };
}
/** Yalnız "(SYM)" parantezleri. */
function sembolAyiklaPar(t) { return [...String(t).matchAll(/\(([A-Z0-9]{1,15})\)/g)].map(m => m[1]); }
/** Katalog 161 → perp delist / settlement duyurusunda geçen USDⓈ-M USDT perp sembolleri (mekanik kural). */
function perpDelistAyristir(baslik, metin) {
  const tam = baslik + '\n' + metin;
  const out = new Set(), kanit = [];
  for (const cumle of tam.split(/\n|(?<=[a-z0-9)])\.\s+(?=[A-Z])/)) {
    if (!/(perpetual|contract|futures)/i.test(cumle)) continue;
    if (!/(delist|settle|settlement|close all positions|cease trading|ceasing trading)/i.test(cumle)) continue;
    const s = [...cumle.matchAll(/(?<![A-Z0-9/])([0-9A-Z]{2,20})USDT(?![A-Z0-9])/g)].map(m => m[1]).filter(x => x !== 'USDC' && x !== 'BUSD');
    if (s.length) { s.forEach(x => out.add(x + 'USDT')); kanit.push(cumle.slice(0, 240)); }
  }
  return { perpler: [...out].sort(), kanit };
}

/* ═══════════ TABLOLAR ═══════════ */
const gunStr = (ms) => new Date(ms).toISOString().slice(0, 10);
function kanonikYaz(yol, obj) { const s = JSON.stringify(obj, null, 1) + '\n'; fs.mkdirSync(path.dirname(yol), { recursive: true }); fs.writeFileSync(yol, s); return sha(s); }

function tablo() {
  const H = haricKumeleri();
  const k49 = [], k161 = [];
  for (const f of fs.readdirSync(path.join(HAM, 'cms')).filter(f => /^liste-49-/.test(f))) k49.push(...hamOku('cms/' + f).data.catalogs[0].articles);
  for (const f of fs.readdirSync(path.join(HAM, 'cms')).filter(f => /^liste-161-/.test(f))) k161.push(...hamOku('cms/' + f).data.catalogs[0].articles);
  const tek = (a) => [...new Map(a.map(x => [x.code, x])).values()].sort((x, y) => x.releaseDate - y.releaseDate || (x.code < y.code ? -1 : 1));
  const A49 = tek(k49).map(x => ({ ...x, katalog: 49 })), A161 = tek(k161).map(x => ({ ...x, katalog: 161 }));
  const detay = (code) => hamOku(`cms/detay/${code}.json`);
  const sembolSet = perpSemboller();
  const perpTabanHarita = new Map();   // taban → [perp ham sembolleri]
  for (const s of sembolSet) { const ham = s.split('/')[0]; const { taban } = perpTaban(ham); if (!perpTabanHarita.has(taban)) perpTabanHarita.set(taban, []); perpTabanHarita.get(taban).push(ham); }

  // ── katalog 161 perp delist/settlement ──
  const delist = [];
  for (const a of A161) {
    const d = detay(a.code); const { perpler, kanit } = perpDelistAyristir(a.title, cmsMetin(d.body));
    if (perpler.length) delist.push({ code: a.code, tau: a.releaseDate, gun: gunStr(a.releaseDate), baslik: a.title, perpler, kanit: kanit.slice(0, 3) });
  }
  // ── A1 Monitoring Tag ──
  const mtMak = [...A49, ...A161].filter(a => mtBaslik(a.title)).sort((x, y) => x.releaseDate - y.releaseDate);
  const acik = new Map();   // sembol → etiket açılış duyurusu
  const olaylar = [], duyurular = [];
  for (const a of mtMak) {
    const d = detay(a.code);
    const metin = cmsMetin(d.body);
    const r = mtAyristir(a.title, metin);
    // Başlıkla karşılaştırma (yalnız rapor): başlık ayrıştırması gövdeden farklıysa işaretle
    const rb = mtAyristir(a.title, '');
    const fark = JSON.stringify([rb.ekle, rb.kaldir]) !== JSON.stringify([r.ekle, r.kaldir]) && (rb.ekle.length + rb.kaldir.length > 0);
    duyurular.push({ code: a.code, katalog: a.katalog, tau: a.releaseDate, utc: new Date(a.releaseDate).toISOString(), baslik: a.title, ekle: r.ekle, kaldir: r.kaldir, kanit: r.kanit, baslikFarki: fark ? { ekle: rb.ekle, kaldir: rb.kaldir } : null, pairs: d.pairs || null });
    for (const s of r.kaldir) acik.delete(s);
    for (const s of r.ekle) {
      if (acik.has(s)) { olaylar.push({ sembol: s, tau: a.releaseDate, utc: new Date(a.releaseDate).toISOString(), code: a.code, olay: false, neden: 'etiket zaten açık (' + acik.get(s) + ')' }); continue; }
      acik.set(s, a.code);
      const perpler = perpTabanHarita.get(s) || [];
      const once = delist.filter(x => x.tau <= a.releaseDate + 0 || gunStr(x.tau) === gunStr(a.releaseDate)).filter(x => x.perpler.some(p => perpler.includes(p.replace(/USDT$/, ''))));
      olaylar.push({ sembol: s, tau: a.releaseDate, utc: new Date(a.releaseDate).toISOString(), gun: gunStr(a.releaseDate), code: a.code, olay: true,
        perpler: perpler.map(p => p + '/USDT:USDT'), perpYok: !perpler.length,
        oncekiPerpDelist: once.flatMap(x => x.perpler.filter(p => perpler.includes(p.replace(/USDT$/, ''))).map(p => ({ code: x.code, gun: x.gun, utc: new Date(x.tau).toISOString(), tau: x.tau, perp: p.replace(/USDT$/, '') }))) });
    }
  }
  // Etiketsiz doğrudan perp delist duyurusu olan tabanlar (bilgi)
  const etiketli = new Set(olaylar.filter(o => o.olay).map(o => o.sembol));
  const etiketsizDelist = [...new Set(delist.flatMap(x => x.perpler.map(p => perpTaban(p.replace(/USDT$/, '')).taban)))].filter(t => !etiketli.has(t)).sort();

  // ── Eşleme (§1.10 madde 2) ──
  const ad = adayEslesme();
  const cgMc = new Map(); for (const f of fs.readdirSync(path.join(HAM, 'cg')).filter(f => /^markets-/.test(f))) for (const x of hamOku('cg/' + f)) cgMc.set(x.id, x);
  const cmKat = new Map(hamOku('cm/katalog.json').map(a => [a.asset, a]));
  const cmSon = {}; for (const f of fs.readdirSync(path.join(HAM, 'cm')).filter(f => /^son-/.test(f))) Object.assign(cmSon, hamOku('cm/' + f));
  const cmMaxTum = Math.max(...[...cmKat.values()].map(a => Date.parse(a.max)).filter(Number.isFinite));
  const stabilCg = new Set(hamOku('llama/stablecoins.json').map(s => s.gecko_id).filter(Boolean));
  const cgSembol = new Map(hamOku('cg/coins-list.json').map(c => [c.id, String(c.symbol || '').toUpperCase()]));
  const eslesme = [];
  for (const s of ad) {
    const r = { ...s };
    if (r.uyeler) r.uyeler = r.uyeler.map(u => { if (u.listedAt != null) return u; const p = path.join(HAM, `llama/tvlbas/${u.slug}.json`); const j = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; return { ...u, tvlBas: j && !j.yok && j.bas != null ? gunStr(j.bas * 1000) : null, tvlBasKaynak: j ? (j.yok ? 'yok-' + j.durum : 'llama/protocol') : 'indirilmedi' }; });
    if (s.durum === 'aday') {
      const cmA = s.taban.toLowerCase(), k = cmKat.get(cmA);
      r.cm = k ? cmA : null;
      if (!k) { r.cmDenetim = 'cm-yok'; r.durum = 'gecerli'; }
      else {
        const son = cmSon[cmA], mc = cgMc.get(s.geckoId);
        const cmCanli = Date.parse(k.max) >= cmMaxTum - 7 * GUN;
        const cgCanli = mc && Number.isFinite(mc.market_cap) && mc.market_cap > 0;
        if (cmCanli && cgCanli && son && son.v > 0) {
          const oran = son.v / mc.market_cap;
          r.cmOran = +oran.toFixed(3);
          if (oran >= 1 / 3 && oran <= 3) { r.cmDenetim = 'gecti'; r.durum = 'gecerli'; }
          else { r.cmDenetim = 'red'; r.durum = 'red'; r.neden = `CM/CG piyasa değeri oranı ${oran.toFixed(3)} ∉ [1/3, 3]`; }
        } else { r.cmDenetim = 'zayif'; r.durum = 'gecerli'; r.zayif = true; r.neden = `ölü/canlılık denetlenemedi (CM son ${k.max ? k.max.slice(0, 10) : '—'}, CG piyasa değeri ${cgCanli ? 'var' : 'yok'})`; }
      }
      if (stabilCg.has(s.geckoId)) r.stablecoinCg = true;
    }
    eslesme.push(r);
  }
  // ── A3 hack ──
  const hacks = hamOku('llama/hacks.json');
  const P = hamOku('llama/protocols.json');
  const pid = new Map(P.map(p => [String(p.id), p]));
  const gEslesme = new Map(); for (const e of eslesme) if (e.durum === 'gecerli') { if (!gEslesme.has(e.geckoId)) gEslesme.set(e.geckoId, []); gEslesme.get(e.geckoId).push(e); }
  const B = llamaBirimleri();
  const birimId = new Map(); for (const [g, b] of B) if (b.birim) { birimId.set(b.birim.id, g); if (b.birim.tip === 'toplam') for (const id of b.birim.id.split('+')) birimId.set(id, g); }
  const hackSatir = [];
  for (const h of hacks.slice().sort((a, b) => a.date - b.date || String(a.name).localeCompare(String(b.name)))) {
    if (!h.defillamaId) continue;
    const id = String(h.defillamaId);
    const p = pid.get(id);
    const ebeveyn = h.parentProtocolId || (p && p.parentProtocol) || null;
    // protokol → kendi gecko_id'si; yoksa ebeveyninin birimi
    let g = null, yol = null;
    if (p && p.gecko_id) { g = p.gecko_id; yol = 'protokol gecko_id'; }
    else if (id.startsWith('parent#') && birimId.has(id)) { g = birimId.get(id); yol = 'ebeveyn birimi'; }
    else if (birimId.has(id)) { g = birimId.get(id); yol = 'birim üyesi'; }
    else if (ebeveyn && birimId.has(ebeveyn)) { g = birimId.get(ebeveyn); yol = 'ebeveyn birimi'; }
    const es = g ? (gEslesme.get(g) || []) : [];
    const D = Math.floor(h.date * 1000 / GUN) * GUN;
    hackSatir.push({ ad: h.name, date: h.date, D: gunStr(D), defillamaId: id, ebeveyn, geckoId: g, yol, perpler: es.map(e => e.perp), zayif: es.some(e => e.zayif), tutar: h.amount ?? null, siniflama: h.classification || null });
  }

  // ── Yaz ──
  const tablolar = {
    'a1-monitoring-tag.json': { aciklama: 'PLAN-DIKKAT-LS §2.1 — Binance CMS katalog 49+161, başlıkta "Monitoring Tag" duyuruları; ekleme/kaldırma gövde metninden kuralla (§1.10 madde 3). olay:false = etiket zaten açık.', kural: 'mtAyristir (scripts/dikkat-ls-veri.js)', duyurular, olaylar },
    'k161-perp-delist.json': { aciklama: 'PLAN-DIKKAT-LS §2.1 — katalog 161 duyurularında USDⓈ-M USDT perp delist / settlement cümlelerinde geçen semboller (uygunluk, çıkış kayması, bilgi).', kural: 'perpDelistAyristir', makaleSay: A161.length, duyurular: delist, etiketsizDelistTabanlari: etiketsizDelist },
    'a3-hack.json': { aciklama: 'PLAN-DIKKAT-LS §2.3 — api.llama.fi/hacks, defillamaId\'li kayıtlar → protokol/ebeveyn → eşleme → Binance perp. D = date UTC günü.', satirlar: hackSatir },
    'eslesme.json': { aciklama: 'PLAN-DIKKAT-LS §1.10 madde 2 — Binance USDⓈ-M USDT perp tabanı ↔ gecko_id ↔ DefiLlama birimi ↔ CM varlığı ↔ GitHub org. durum: gecerli | red | eslesme-yok. zayif: canlılık denetlenemedi (CM serisi bitmiş ya da CoinGecko güncel piyasa değeri yok).',
      stabilTabanlar: [...new Set([...stabilCg].map(g => cgSembol.get(g)).filter(Boolean))].sort(),
      stabilGeckoIdler: [...stabilCg].sort(),
      stabilKural: 'EK-1 (c) 3: gecko_id’si belirlenmiş anahtarda (gecerli ya da yalnız CM oranıyla red) stablecoin = gecko_id ∈ stabilGeckoIdler; gecko_id’siz anahtarda taban ∈ stabilTabanlar',
      stabilNot: '§1.1 hariç: DefiLlama stablecoin gecko_id’lerinin CoinGecko sembolleri (taban eşitliğiyle uygulanır)',
      satirlar: eslesme },
  };
  const B0 = boslukTara();
  tablolar['bosluk.json'] = { aciklama: 'EK-1 (c) 2 — market.db binance/perp/1d satır sayımı (fiyatsız): her sembolün ilk ve son satırı arasında satırı olmayan günler. Aynı gün ≥ 2 sembol eksikse gün data.binance.vision günlük kline ile araştırma örtüsüne (data/arastirma/dikkat-ls/ortu/) doldurulur; tek sembol boşlukları §1.2 "mum eksik" kuralıyla kalır.', esik: 2, aralik: ['2019-09-01', '2026-09-30'], gunler: B0, doldurulacak: B0.filter(x => x.n >= 2).map(x => x.gun) };
  const shaler = {};
  fs.mkdirSync(KAYIT, { recursive: true });
  for (const [ad, obj] of Object.entries(tablolar)) {
    shaler[ad] = kanonikYaz(path.join(KAYIT, ad), obj);
    kanonikYaz(path.join(DIZIN, 'tablolar', ad), obj);   // §1.10 madde 1: data/arastirma/dikkat-ls/ altına da (aynı içerik, aynı SHA)
  }
  const ozet = {
    onKayit: ONKAYIT, olusturma: new Date().toISOString(),
    not: 'Fiyat/funding/hacim okunmadan kuruldu (scripts/dikkat-ls-veri.js tablo; market.db\'den yalnız sembol adları). Ölçüm betiği bu SHA\'lar tutmazsa durur.',
    tablolar: shaler,
    haric: { ...HARIC_SHA },
    ham: Object.fromEntries(Object.entries(manifest()).filter(([k]) => !/^seri\//.test(k)).map(([k, v]) => [k, { indirme: v.indirme.slice(0, 10), sha256: v.sha256 }])),
    kapsam: kapsamSay({ duyurular, olaylar, delist, eslesme, hackSatir, A49, A161, etiketsizDelist }),
  };
  { const eski = fs.existsSync(path.join(KAYIT, 'tablolar.json')) ? JSON.parse(fs.readFileSync(path.join(KAYIT, 'tablolar.json'), 'utf8')) : {}; if (eski.ortu) { ozet.ortu = eski.ortu; ozet.ortuNot = eski.ortuNot; } }
  kanonikYaz(path.join(KAYIT, 'tablolar.json'), ozet);
  console.log(JSON.stringify(ozet.kapsam, null, 1));
  return ozet;
}
/** market.db satır boşlukları (yalnız time sütunu). */
function boslukTara() {
  if (process.env.DLS_SEMBOLLER) return [];
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(DB_YOL, { readOnly: true });
  const st = db.prepare("SELECT time FROM candles WHERE venue='binance' AND market='perp' AND timeframe='1d' AND symbol=? AND time >= ? AND time < ? ORDER BY time");
  const gun = new Map();
  for (const sym of perpSemboller()) {
    const t = st.all(sym, Date.parse('2019-09-01'), Date.parse('2026-10-01')).map(r => Math.floor(r.time / GUN));
    for (let i = 1; i < t.length; i++) for (let g = t[i - 1] + 1; g < t[i]; g++) { if (!gun.has(g)) gun.set(g, []); gun.get(g).push(sym.split('/')[0]); }
  }
  db.close();
  return [...gun.entries()].sort((a, b) => a[0] - b[0]).map(([g, s]) => ({ gun: gunStr(g * GUN), n: s.length, semboller: s.sort() }));
}
/** EK-1 (c) 2: çok sembollü boşluk günlerini data.binance.vision günlük kline'dan örtüye doldur (market.db'ye dokunmaz). */
async function ortu() {
  const zlib = require('zlib');
  const B = JSON.parse(fs.readFileSync(path.join(KAYIT, 'bosluk.json'), 'utf8'));
  const isler = B.gunler.filter(x => x.n >= B.esik);
  const dir = path.join(DIZIN, 'ortu');
  fs.mkdirSync(dir, { recursive: true });
  const say = { istek: 0, dolan: 0, yok: 0 };
  const sembolSatir = new Map();
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) sembolSatir.set(f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  for (const x of isler) for (const ham of x.semboller) {
    const o = sembolSatir.get(ham) || { sembol: ham, satirlar: [], yok: [] };
    if (o.satirlar.some(r => gunStr(r[0]) === x.gun) || o.yok.includes(x.gun)) continue;
    const url = `https://data.binance.vision/data/futures/um/daily/klines/${ham}USDT/1d/${ham}USDT-1d-${x.gun}.zip`;
    say.istek++; await bekle(150);
    let r; for (let i = 0; i < 5; i++) { try { r = await fetch(url); break; } catch (e) { if (i === 4) throw e; await bekle(5000 * (i + 1)); } }
    if (r.status === 404) { o.yok.push(x.gun); say.yok++; sembolSatir.set(ham, o); continue; }
    if (r.status !== 200) throw new Error('HTTP ' + r.status + ' ' + url);
    const buf = Buffer.from(await r.arrayBuffer());
    let eocd = -1; for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    const cd = buf.readUInt32LE(eocd + 16), yontem = buf.readUInt16LE(cd + 10), boyut = buf.readUInt32LE(cd + 20), yerel = buf.readUInt32LE(cd + 42);
    const n = buf.readUInt16LE(yerel + 26), m = buf.readUInt16LE(yerel + 28), ham2 = buf.subarray(yerel + 30 + n + m, yerel + 30 + n + m + boyut);
    const metin = (yontem === 0 ? ham2 : zlib.inflateRawSync(ham2)).toString('utf8');
    for (const l of metin.trim().split(/\r?\n/)) { if (!/^\d/.test(l)) continue; const c = l.split(','); const t = +c[0] > 1e14 ? Math.floor(+c[0] / 1000) : +c[0]; const row = [t, +c[1], +c[2], +c[3], +c[4], +c[5]]; if (row.every(Number.isFinite) && gunStr(t) === x.gun) { o.satirlar.push(row); say.dolan++; } }
    o.satirlar.sort((a, b) => a[0] - b[0]);
    sembolSatir.set(ham, o);
  }
  for (const [ham, o] of sembolSatir) { const c = JSON.stringify(o); fs.writeFileSync(path.join(dir, ham + '.json'), c); manifest()['ortu/' + ham] = { url: 'data.binance.vision daily klines', indirme: new Date().toISOString(), sha256: sha(c), bayt: c.length }; }
  manifestYaz();
  ortuMuhur();
  console.log(`örtü: ${isler.length} gün, ${say.istek} istek, ${say.dolan} satır dolduruldu, ${say.yok} dosya yok`);
  return say;
}
/** EK-1 (c) 2: örtü dosyalarının SHA-256'larını tablolar.json `ortu` alanına yazar (yükleyici tutmazsa durur). */
function ortuMuhur() {
  const dir = path.join(DIZIN, 'ortu'), yol = path.join(KAYIT, 'tablolar.json');
  const T = JSON.parse(fs.readFileSync(yol, 'utf8'));
  T.ortu = {}; for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort()) T.ortu[f.slice(0, -5)] = sha(fs.readFileSync(path.join(dir, f)));
  T.ortuNot = 'EK-1 (c) 2: data/arastirma/dikkat-ls/ortu/<sembol>.json SHA-256 (data.binance.vision günlük kline; yalnız bosluk.json doldurulacak günleri)';
  kanonikYaz(yol, T);
  return T.ortu;
}
function kapsamSay({ duyurular, olaylar, delist, eslesme, hackSatir, A49, A161, etiketsizDelist }) {
  const yil = (arr, f) => { const o = {}; for (const x of arr) { const y = f(x); o[y] = (o[y] || 0) + 1; } return o; };
  const ol = olaylar.filter(o => o.olay);
  const es = (d) => eslesme.filter(e => e.durum === d).length;
  return {
    cms: { katalog49: A49.length, katalog161: A161.length, mtDuyuru: duyurular.length, baslikGovdeFarki: duyurular.filter(d => d.baslikFarki).length },
    a1: { coinOlayi: ol.length, perpli: ol.filter(o => !o.perpYok).length, perpliYil: yil(ol.filter(o => !o.perpYok), o => o.gun.slice(0, 4)), oncedenPerpDelist: ol.filter(o => o.oncekiPerpDelist && o.oncekiPerpDelist.length).length, tekrarAd: olaylar.filter(o => !o.olay).length },
    k161: { perpDelistDuyuru: delist.length, perpSembol: new Set(delist.flatMap(d => d.perpler)).size, etiketsizDelistTaban: etiketsizDelist.length },
    eslesme: { perp: eslesme.length, gecerli: es('gecerli'), gecerliZayif: eslesme.filter(e => e.durum === 'gecerli' && e.zayif).length, cmYok: eslesme.filter(e => e.cmDenetim === 'cm-yok').length, red: es('red'), eslesmeYok: es('eslesme-yok'), githubOrgVar: eslesme.filter(e => e.durum === 'gecerli' && e.github && e.github.length).length },
    a3: { defillamaIdli: hackSatir.length, perpEslesen: hackSatir.filter(h => h.perpler.length).length, perpEslesenYil: yil(hackSatir.filter(h => h.perpler.length), h => h.D.slice(0, 4)) },
  };
}

/* ═══════════ SERİLER (ölçüm verisi; fiyat değil ama dönem verisi) ═══════════ */
async function seri() {
  const E = JSON.parse(fs.readFileSync(path.join(KAYIT, 'eslesme.json'), 'utf8')).satirlar.filter(e => e.durum === 'gecerli');
  const birimler = new Map(); for (const e of E) birimler.set(e.geckoId, e.birim);
  const sluglar = [...new Set([...birimler.values()].flatMap(b => b.tip === 'toplam' ? b.sluglar : [b.slug]))].sort();
  console.log(`DefiLlama: ${sluglar.length} slug × (ücret, gelir, TVL)`);
  let n = 0;
  for (const s of sluglar) {
    for (const tip of ['dailyFees', 'dailyRevenue']) {
      try {
        await hamAl(`seri/llama-${tip}/${s}.json`, `https://api.llama.fi/summary/fees/${encodeURIComponent(s)}?dataType=${tip}`, { gecikme: 300, kucult: (j) => ({ slug: j.slug, name: j.name, chart: j.totalDataChart || [] }) });
      } catch (e) { if (e.durum === 404 || e.durum === 400 || e.durum === 500) yokYaz(`seri/llama-${tip}/${s}.json`, e.durum); else throw e; }
    }
    try {
      await hamAl(`seri/llama-tvl/${s}.json`, `https://api.llama.fi/protocol/${encodeURIComponent(s)}`, { gecikme: 300, kucult: (j) => ({ slug: s, tvl: (j.tvl || []).map(x => [x.date, x.totalLiquidityUSD]) }) });
    } catch (e) { if (e.durum === 404 || e.durum === 400) yokYaz(`seri/llama-tvl/${s}.json`, e.durum); else throw e; }
    if (++n % 25 === 0) console.log(`  ${n}/${sluglar.length}`);
  }
  const cm = [...new Set(E.filter(e => e.cm).map(e => e.cm))].sort();
  console.log(`CM CapMrktEstUSD: ${cm.length} varlık`);
  for (const a of cm) {
    const rel = `seri/cm/${a}.json`; if (fs.existsSync(path.join(HAM, rel))) continue;
    const satir = []; let url = `https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=${a}&metrics=CapMrktEstUSD&frequency=1d&page_size=10000&start_time=2019-01-01`;
    while (url) { await bekle(700); const j = JSON.parse(await getJson(url)); for (const r of j.data) satir.push([Date.parse(r.time), +r.CapMrktEstUSD]); url = j.next_page_url || null; }
    const cikti = JSON.stringify({ asset: a, seri: satir });
    fs.mkdirSync(path.dirname(path.join(HAM, rel)), { recursive: true }); fs.writeFileSync(path.join(HAM, rel), cikti);
    manifest()[rel] = { url: 'cm timeseries ' + a, indirme: new Date().toISOString(), sha256: sha(cikti), bayt: cikti.length }; manifestYaz();
  }
  console.log('seriler tamam');
}
function yokYaz(rel, durum) {
  const yol = path.join(HAM, rel); const c = JSON.stringify({ yok: true, durum });
  fs.mkdirSync(path.dirname(yol), { recursive: true }); fs.writeFileSync(yol, c);
  manifest()[rel] = { url: null, indirme: new Date().toISOString(), sha256: sha(c), bayt: c.length, yok: durum }; manifestYaz();
}

if (require.main === module) {
  const k = process.argv[2];
  const is = k === 'ortu-muhur' ? Promise.resolve(ortuMuhur()) : k === 'kimlik' ? kimlik() : k === 'tablo' ? Promise.resolve(tablo()) : k === 'seri' ? seri() : k === 'ortu' ? ortu() : null;
  if (!is) { console.log('kullanım: kimlik | tablo | seri'); process.exitCode = 1; }
  else is.catch(e => { console.error('✗ ' + (e.stack || e.message)); process.exitCode = 1; });
}
module.exports = { ortuMuhur, ortu, boslukTara, DIZIN, HAM, KAYIT, HARIC_SHA, haricKumeleri, haricIcerik, perpTaban, cmsMetin, mtAyristir, perpDelistAyristir, sembolAyikla, kanonikYaz, sha, hamOku, kimlik, tablo, seri, llamaBirimleri, adayEslesme, ONKAYIT };
