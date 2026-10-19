#!/usr/bin/env node
/**
 * BINANCE ARŞİVİ — listeden çıkmış semboller DAHİL tüm USDⓈ-M perp günlük mumları
 * ve funding geçmişi (data.binance.vision, herkese açık).
 *
 *   node scripts/arsiv-indir.js            # hepsi
 *   node scripts/arsiv-indir.js LUNAUSDT   # tek sembol
 *
 * NEDEN: tüm ölçümler bugünden seçilmiş 15 coinle yapıldı (hayatta kalma
 * yanlılığı — LUNA, FTT gibi çökenler yok). Nokta-zamanlı evren için geçmişte
 * işlem görmüş HER sembol gerekir (ARASTIRMA-PORTFOY.md §4).
 *
 * Depo: market.db, venue 'binance', market 'perp', sembol 'BTC/USDT:USDT',
 * dilim '1d' (mevcut 4h'ten türetilen günlüklerle karışmaz — onlar ayrı dilim).
 */
const path = require('path');
const yollar = require('../lib/yollar');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const { CandleStore } = require(path.join(ROOT, 'lib', 'candleStore'));
const store = new CandleStore(yollar.veri('market.db'));

const S3 = 'https://s3-ap-northeast-1.amazonaws.com/data.binance.vision';
const DOSYA = 'https://data.binance.vision';
const ZORLA = process.argv.includes('--zorla');   // mevcut ayları atlama
// DILIM=15m node scripts/arsiv-indir.js BTCUSDT — gün içi dilimler (PLAN-ALTUT-YENMEK 6. aşama).
const DILIM = process.env.DILIM || '1d';
const STABIL = new Set(['USDC', 'BUSD', 'TUSD', 'FDUSD', 'USDP', 'DAI', 'UST', 'USTC', 'EUR', 'GBP', 'AEUR', 'PAX']);

async function listele(prefix, delimiter = true) {
  const sonuc = [];
  let marker = '';
  for (;;) {
    const url = `${S3}?prefix=${encodeURIComponent(prefix)}${delimiter ? '&delimiter=/' : ''}${marker ? `&marker=${encodeURIComponent(marker)}` : ''}`;
    const xml = await (await fetch(url)).text();
    const parca = delimiter
      ? [...xml.matchAll(/<Prefix>([^<]*)<\/Prefix>/g)].map(m => m[1]).filter(p => p !== prefix)
      : [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map(m => m[1]);
    sonuc.push(...parca);
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) break;
    const sonAnahtar = delimiter ? parca[parca.length - 1] : parca[parca.length - 1];
    const nm = xml.match(/<NextMarker>([^<]*)<\/NextMarker>/);
    marker = nm ? nm[1] : sonAnahtar;
    if (!marker) break;
  }
  return sonuc;
}

/** Tek girdili zip → metin (merkezi dizinden sıkıştırılmış boyut). */
function zipAc(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip sonu yok');
  const cd = buf.readUInt32LE(eocd + 16);
  const yontem = buf.readUInt16LE(cd + 10), boyut = buf.readUInt32LE(cd + 20), yerel = buf.readUInt32LE(cd + 42);
  const n = buf.readUInt16LE(yerel + 26), m = buf.readUInt16LE(yerel + 28);
  const veri = buf.subarray(yerel + 30 + n + m, yerel + 30 + n + m + boyut);
  return (yontem === 0 ? veri : zlib.inflateRawSync(veri)).toString('utf8');
}

async function indirZip(anahtar) {
  for (let d = 0; d < 3; d++) {
    try {
      const r = await fetch(`${DOSYA}/${anahtar}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return zipAc(Buffer.from(await r.arrayBuffer()));
    } catch (e) { if (d === 2) throw e; await new Promise(c => setTimeout(c, 1000 * (d + 1))); }
  }
}

const ccxtSembol = (s) => `${s.slice(0, -4)}/USDT:USDT`;

async function sembolIndir(s) {
  const ds = ccxtSembol(s);
  const mevcut = store.stats(ds, DILIM, { venue: 'binance', market: 'perp' });
  const anahtarlar = (await listele(`data/futures/um/monthly/klines/${s}/${DILIM}/`, false)).filter(k => k.endsWith('.zip'));
  let mum = 0;
  const kIs = async (k) => {
    const ay = k.match(/(\d{4}-\d{2})\.zip$/)[1];
    // Depoda o ayın son günü varsa atla (yeniden çalıştırma ucuz olsun).
    if (!ZORLA && mevcut.lastTime && Date.parse(`${ay}-01T00:00:00Z`) + 31 * 864e5 < mevcut.lastTime && Date.parse(`${ay}-01T00:00:00Z`) >= mevcut.firstTime) return;
    const metin = await indirZip(k);
    if (!metin) return;
    const satirlar = metin.trim().split('\n').filter(x => /^\d/.test(x)).map(x => x.split(','));
    const mumlar = satirlar.map(c => ({ time: +c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5] }));
    if (mumlar.length) { store.saveCandles(ds, DILIM, mumlar, { venue: 'binance', market: 'perp' }); mum += mumlar.length; }
  };
  for (let a = 0; a < anahtarlar.length; a += 8) await Promise.all(anahtarlar.slice(a, a + 8).map(k => kIs(k).catch(() => null)));
  // Funding.
  const fAnahtar = (await listele(`data/futures/um/monthly/fundingRate/${s}/`, false)).filter(k => k.endsWith('.zip'));
  const fMevcut = store.fundingStats(ds, { venue: 'binance', market: 'perp' });
  let fon = 0;
  const fIs = async (k) => {
    const ay = k.match(/(\d{4}-\d{2})\.zip$/)[1];
    if (!ZORLA && fMevcut.lastTime && Date.parse(`${ay}-01T00:00:00Z`) + 31 * 864e5 < fMevcut.lastTime && Date.parse(`${ay}-01T00:00:00Z`) >= fMevcut.firstTime) return;
    const metin = await indirZip(k);
    if (!metin) return;
    const kayit = metin.trim().split('\n').filter(x => /^\d/.test(x)).map(x => x.split(',')).map(c => ({ time: +c[0], rate: +c[2] }))
      .filter(x => Number.isFinite(x.time) && Number.isFinite(x.rate));
    if (kayit.length) { store.saveFunding(ds, kayit, { venue: 'binance', market: 'perp' }); fon += kayit.length; }
  };
  for (let a = 0; a < fAnahtar.length; a += 8) await Promise.all(fAnahtar.slice(a, a + 8).map(k => fIs(k).catch(() => null)));
  return { mum, fon, ay: anahtarlar.length };
}

(async () => {
  const t0 = Date.now();
  let semboller = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!semboller.length) {
    semboller = (await listele('data/futures/um/monthly/klines/'))
      .map(p => p.split('/').slice(-2)[0])
      .filter(s => s.endsWith('USDT') && !STABIL.has(s.slice(0, -4)) && !/_\d{6}$/.test(s));
  }
  console.log(`${semboller.length} sembol`);
  let i = 0, toplam = 0, hata = 0;
  const isci = async () => {
    while (i < semboller.length) {
      const s = semboller[i++];
      try {
        const r = await sembolIndir(s);
        toplam += r.mum;
        if (i % 25 === 0 || semboller.length < 10) console.log(`  ${i}/${semboller.length} ${s}: ${r.mum} gün, ${r.fon} funding (${((Date.now() - t0) / 1000).toFixed(0)} sn)`);
      } catch (e) { hata++; console.log(`  ✗ ${s}: ${e.message}`); }
    }
  };
  await Promise.all(Array.from({ length: 10 }, isci));
  console.log(`\nBİTTİ: ${semboller.length} sembol · ${toplam} gün · ${hata} hata · ${((Date.now() - t0) / 60000).toFixed(1)} dk`);
})();
