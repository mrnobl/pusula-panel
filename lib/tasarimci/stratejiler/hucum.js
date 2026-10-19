/**
 * HÜCUM / DENGE / KALKAN KOLU — CANLI ÇEKİRDEK (yalnız OKUR; emirleri botlar verir, PLAN-PORTFOY-TASARIMCI.md (a) 1b).
 * Mutabakat: node scripts/tasarimci-mutabakat.js (837 zinciri qqq-cekirdek-uydu.js metrikleri ±0,1).
 *
 * İki kaynak:
 *   1. Simülasyon eğrisi (model portföyün Hücum kolu): scripts/btc-tarih.js / qqq-cekirdek-uydu.js `zincirKur` ile BİREBİR —
 *      2018-01-01 → 2020-09-03 spot vekil (data/gomlek/isci-g2.json `isler.<ad>.egri`), 2020-09-04 → perp entegre simülasyon
 *      (lib/research/bindirme.js `simule({ btcPay })` = bindirmeSonuc()._ham.egri; data/market.db + kol önbelleği).
 *      Takvim günü (7/24), taban 1. Kalkan kolu tek başına: bindirme.simule({ btcVar: false, m: 1 }) (risk katmanı yok —
 *      canlı KalkanBot'un ölçülen tanımına en yakın simülasyon; yalnız bilgi).
 *   2. Canlı bot özsermayesi: data/live/<ad>[-demo]/ozsermaye.jsonl (bindirmeBot.ozsermayeOku ile aynı: gün başına SON satır).
 *      SALT OKUMA — dosya yoksa boş dizi (bu geliştirme makinesinde bot çalışmaz).
 *
 * API
 *   zincir({ ad = 'hucum' | 'denge' }) → { egri:[{ time, oz }], zt:[ms], perpIlk, eklem }   (önbellekli, süreç içi)
 *   zincirDogrula(Z?) → { hucum, denge, altut, tutar }  data/btc-tarih/paket.json zincir metrikleriyle (portfoySim.metrik)
 *   simulasyonEgrisi(ad) → [{ time, oz }]  yalnız perp dönemi (hucum | denge | kalkan)
 *   canliOzsermaye(ad, { demo = true, kok? }) → [{ gun, zaman, mod, ozsermaye, ozsermayeCap, btcFiyat, icerde }]
 *   veriVarMi() → { zincir: bool, perp: bool, eksik: [dosya] }
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../../yollar');

const ROOT = path.join(__dirname, '..', '..', '..');
const GUN = 864e5;
const ms = s => Date.parse(s + 'T00:00:00Z');
const tarih = t => new Date(t).toISOString().slice(0, 10);
const B = () => require(path.join(ROOT, 'lib', 'research', 'bindirme'));
const ISCI = () => yollar.veri('gomlek', 'isci-g2.json');
const PAKET = () => yollar.veri('btc-tarih', 'paket.json');

function veriVarMi() {
  const eksik = [ISCI(), yollar.veri('market.db'), yollar.veri('arastirma', process.env.ONBELLEK_DOSYA || 'capraz-marj-onbellek.json')].filter(p => !fs.existsSync(p));
  const perp = (() => { try { return B().veriVarMi(); } catch (e) { return false; } })();
  return { zincir: perp && fs.existsSync(ISCI()), perp, eksik: eksik.map(p => path.relative(ROOT, p)) };
}

function kes(egri, bas, bit) { const x = egri.filter(p => p.time >= bas - GUN && p.time <= bit); return x.map(p => ({ time: p.time, oz: p.oz / x[0].oz })); }
const _perp = new Map();
function perpEgri(ad) {
  if (!_perp.has(ad)) {
    const b = B();
    const e = ad === 'hucum' ? b.simule({ btcPay: 1 }).egri : ad === 'denge' ? b.simule({ btcPay: 0.5 }).egri : ad === 'altut' ? b.alTut().egri
      : ad === 'kalkan' ? b.simule({ btcVar: false, m: 1 }).egri : null;
    if (!e) throw new Error(`hucum: bilinmeyen eğri '${ad}' (hucum | denge | kalkan | altut)`);
    _perp.set(ad, e);
  }
  return _perp.get(ad);
}
let _Z = null;
/** qqq-cekirdek-uydu.js zincirKur BİREBİR (hucum, denge, altut birlikte; hizası denetlenir). */
function zincirTum() {
  if (_Z) return _Z;
  const w = JSON.parse(fs.readFileSync(ISCI(), 'utf8'));
  const BTC = 'BTC/USDT:USDT';
  const bas = ms('2018-01-01'), eklem = ms('2020-09-03');
  const gunler = w.ts.filter(t => t >= bas && t <= eklem);
  const bar = new Map(w.seriler[BTC].map(([t, o, c]) => [t, { o, c }]));
  const SP = {};
  for (const ad of ['hucum', 'denge']) SP[ad] = kes(w.isler[ad].egri.map(([time, oz]) => ({ time, oz })), bas, eklem);
  const adet = 1 / (bar.get(gunler[0]).o * 1.001);
  SP.altut = [{ time: gunler[0] - GUN, oz: 1 }, ...gunler.map(t => ({ time: t, oz: adet * bar.get(t).c }))];
  const PP = { hucum: perpEgri('hucum'), denge: perpEgri('denge'), altut: perpEgri('altut') };
  const Z = {};
  for (const ad of ['hucum', 'denge', 'altut']) {
    const a = kes(SP[ad], bas, eklem), son = a[a.length - 1].oz;
    Z[ad] = [...a, ...PP[ad].slice(1).map(p => ({ time: p.time, oz: son * p.oz / PP[ad][0].oz }))];
  }
  const zt = Z.hucum.map(p => p.time);
  for (const ad of ['denge', 'altut']) if (Z[ad].length !== zt.length || Z[ad].some((p, i) => p.time !== zt[i])) throw new Error('zincir hizası bozuk ' + ad);
  for (let i = 1; i < zt.length; i++) if (zt[i] - zt[i - 1] !== GUN) throw new Error('zincirde boşluk ' + tarih(zt[i]));
  _Z = { Z, zt, perpIlk: PP.hucum[1].time, eklem };
  return _Z;
}
function zincir({ ad = 'hucum' } = {}) {
  const z = zincirTum();
  if (!z.Z[ad]) throw new Error(`hucum: zincir '${ad}' yok (hucum | denge | altut)`);
  return { egri: z.Z[ad], zt: z.zt, perpIlk: z.perpIlk, eklem: z.eklem };
}
function zincirDogrula() {
  const S = require(path.join(ROOT, 'lib', 'research', 'portfoySim'));
  const z = zincirTum();
  if (!fs.existsSync(PAKET())) return { tutar: null, neden: 'data/btc-tarih/paket.json yok' };
  const P = JSON.parse(fs.readFileSync(PAKET(), 'utf8')), out = {};
  let tutar = true;
  for (const ad of ['hucum', 'denge', 'altut']) {
    const k = P.sistem.zincir.metrik[ad], bit = ms(k.bit);
    const e = z.Z[ad].filter(p => p.time <= bit), u = S.metrik(e);
    out[ad] = { kayit: { cagr: k.cagr, maxDD: k.maxDD, bit: k.bit }, uretilen: { cagr: u.cagr, maxDD: u.maxDD } };
    out[ad].tutar = Math.abs(k.cagr - u.cagr) < 1e-6 && Math.abs(k.maxDD - u.maxDD) < 1e-6;
    tutar = tutar && out[ad].tutar;
  }
  return { ...out, tutar };
}
const simulasyonEgrisi = ad => perpEgri(ad);

function canliOzsermaye(ad, { demo = true, kok = yollar.veri('live') } = {}) {
  const p = path.join(kok, demo ? `${ad}-demo` : ad, 'ozsermaye.jsonl');
  if (!fs.existsSync(p)) return [];
  const g = new Map();
  for (const s of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!s.trim()) continue;
    try { const x = JSON.parse(s); if (x.gun) g.set(x.gun, x); } catch (e) { /* yarım satır */ }
  }
  return [...g.values()].sort((a, b) => (a.gun < b.gun ? -1 : 1))
    .map(x => ({ gun: x.gun, zaman: x.zaman, mod: x.mod, ozsermaye: x.ozsermaye, ozsermayeCap: x.ozsermayeCap, btcFiyat: x.btcFiyat, icerde: x.icerde }));
}

module.exports = { zincir, zincirDogrula, simulasyonEgrisi, canliOzsermaye, veriVarMi, onbellekTemizle: () => { _Z = null; _perp.clear(); } };
