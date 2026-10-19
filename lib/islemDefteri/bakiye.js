/**
 * İŞLEM DEFTERİ — BORSA BAKİYESİ (yeni panel F4, PLAN-PANEL-YENI EK-1 K-E: "kripto borsa bakiyeleri Pano toplamına dahil")
 * ═══════════════════════════════════════════════════════════════════════════
 * İşlem defterinin SALT OKUMA anahtarlarıyla (secrets.json islemDefteri; bot anahtarlarından ayrı) bugünkü bakiye — yalnız GET:
 *   · Binance: spot (/api/v3/account, sıfır olmayanlar) + USDⓈ-M vadeli (/fapi/v2/account totalMarginBalance; vadeli okuma
 *     kapalıysa yalnız spot ve bunu yazar). Spot coinler /api/v3/ticker/price ile USDT'ye çevrilir: USDT/USDC/FDUSD/BUSD = 1,
 *     yoksa <coin>USDT, yoksa <coin>BTC × BTCUSDT; "LD" önekli Simple Earn varlıkları coinin fiyatıyla; TRY = 1 ÷ USDTTRY.
 *     Çevrilemeyen coin toplama girmez, adıyla yazılır.
 *   · OKX: /api/v5/asset/asset-valuation?ccy=USD → bütün hesaplar (fonlama + işlem + kazanç) toplamı.
 * Sonuç önbellekte (data/islem-defteri/bakiye.json, 10 dk); hata hesabın satırına yazılır, öbür hesap etkilenmez.
 * Emir, transfer, çekim YOK — uç listeleri binanceApi.UC / okxApi.UC dışına çıkılamaz.
 */
'use strict';
const BN = require('./binanceApi');
const OKX = require('./okxApi');

const SABIT = new Set(['USDT', 'USDC', 'FDUSD', 'BUSD', 'USD', 'DAI', 'TUSD']);
const sayi = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

/** Saf: spot bakiyeleri + fiyat listesi → { usd, kalemler, degerlenemeyen }. */
function spotDegerle(bakiyeler, fiyatlar) {
  const f = new Map((fiyatlar || []).map(x => [String(x.symbol), sayi(x.price)]));
  const btc = f.get('BTCUSDT') || null;
  const birim = (coin) => {
    const c = String(coin).replace(/^LD(?=[A-Z0-9]{2,})/, '');
    if (SABIT.has(c)) return 1;
    if (c === 'TRY') { const p = f.get('USDTTRY'); return p ? 1 / p : null; }
    if (f.get(c + 'USDT')) return f.get(c + 'USDT');
    if (f.get(c + 'BTC') && btc) return f.get(c + 'BTC') * btc;
    return null;
  };
  let usd = 0;
  const kalemler = [], degerlenemeyen = [];
  for (const b of bakiyeler || []) {
    const m = sayi(b.free) + sayi(b.locked);
    if (m <= 0) continue;
    const p = birim(b.asset);
    if (p == null) { degerlenemeyen.push(b.asset); continue; }
    const v = m * p;
    usd += v;
    kalemler.push({ varlik: b.asset, miktar: m, usd: v });
  }
  kalemler.sort((a, b) => b.usd - a.usd);
  return { usd, kalemler, degerlenemeyen };
}

async function binance(anahtar, ops = {}) {
  const c = BN.baglam(ops);
  await c.saatEsitle();
  const [hesap, fiyatlar] = await Promise.all([BN.getir(anahtar, 'hesap', { omitZeroBalances: 'true' }, c), BN.getir(null, 'fiyatlar', null, c)]);
  const spot = spotDegerle(hesap && hesap.balances, fiyatlar);
  let vadeliUSD = null, vadeliNot = null;
  try {
    const v = await BN.getir(anahtar, 'vadeliHesap', null, c);
    vadeliUSD = sayi(v && v.totalMarginBalance);
  } catch (e) { vadeliNot = BN.guvenliMesaj(e); }
  return { borsa: 'binance', toplamUSD: spot.usd + (vadeliUSD || 0), spotUSD: spot.usd, vadeliUSD, vadeliNot, kalemler: spot.kalemler.slice(0, 12), degerlenemeyen: spot.degerlenemeyen };
}

async function okx(anahtar, ops = {}) {
  const d = await OKX.getir(anahtar, OKX.UC.degerleme, { ccy: 'USD' }, ops);
  const x = d[0] || {};
  const det = x.details || {};
  return { borsa: 'okx', toplamUSD: sayi(x.totalBal), fonlamaUSD: sayi(det.funding), islemUSD: sayi(det.trading), kazancUSD: sayi(det.earn) };
}

module.exports = { spotDegerle, binance, okx, SABIT };
