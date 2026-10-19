/**
 * DİKKAT LİSTESİ F0 — kaynak envanteri, sınama ve kaynak sağlığı (sürüm 60.7, PLAN-DIKKAT-LISTESI.md §3 F0, §5 Ş4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   KATALOG             her ücretsiz kaynak: uç(lar), anahtar gereksinimi, belgelenmiş limit, ToS/lisans notu, aile,
 *                       lib/tarama karşılığı (varsa) ve "bozulursa hangi bayrak üretilemez" haritasının girdisi.
 *   sina({ fetch, simdi, uyu, sadece })
 *                       katalogdaki her uca BİR istek: HTTP kodu, gecikme, limit başlıkları, gövdenin SHA-256'sı, alan listesi,
 *                       geçmiş derinliği, kaynağa özel sayımlar (ör. Coin Metrics MVRV kapsamı). → { surum, zaman, sonuclar }
 *   BAYRAK_KAYNAK       bayrak / kapı → hangi kaynaklardan biri yeter (ağ sınıfına göre). bozulmaHaritasi() kaynak başına
 *                       "üretilemez" (tek kaynak) ve "yedekle sürer" listesini türetir.
 *   saglik({ envanterDizin, taramaDizin, simdi, gun })
 *                       son `gun` günün envanter dosyaları + coin taramasının tarama özetleri → kaynak satırları (son durum,
 *                       başarı oranı, kota kullanımı, bozulma haritası). Panel: Veri ekranı (GET /api/tarama/kaynak-sagligi).
 *
 * Kurallar: ücretli uç YOK; anahtar gereken uç anahtarsız denenir ve beklenen 401/403 "anahtar gerekli" sayılır (hata değil);
 * anahtar hiçbir yerde istenmez/saklanmaz. Tokenomist sayfaları otomatik erişimi açıkça yasaklıyor (403
 * automated_access_not_allowed, 2026-10-09 elle doğrulandı) → betik yalnız API ucunu dener, sayfaları ASLA çekmez.
 * Binance: veri orkestratörünün hız sınırı beklemesi sürüyorsa Binance uçları atlanır (canlı botun kotası korunur).
 * Dış veri yorumlanmaz; yalnız sayılır/özetlenir. lib/live ve lib/risk'e dokunmaz.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const crypto = require('crypto');

const SURUM = 1;
const KOK = path.join(__dirname, '..', '..');
const UA = 'Pusula-dikkat-envanter/60.7 (+yerel arastirma)';
const TARAYICI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const envanterDizini = () => process.env.DIKKAT_DIZIN || yollar.veri('dikkat');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const gunStr = (t) => new Date(t).toISOString().slice(0, 10);
const tarih = (x) => { if (x == null || x === '') return null; const n = Number(x); const t = Number.isFinite(n) ? (n > 1e12 ? n : n * 1000) : Date.parse(String(x)); return Number.isFinite(t) && t > 0 ? new Date(t).toISOString().slice(0, 10) : null; };
const enKucuk = (a) => a.filter(Boolean).sort()[0] || null;
const enBuyuk = (a) => a.filter(Boolean).sort().slice(-1)[0] || null;
const g2 = (n) => String(n).padStart(2, '0');
const trGun = (t) => { const d = new Date(t); return `${g2(d.getUTCDate())}-${g2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`; };

// ── Katalog ──────────────────────────────────────────────────────────────
// Her uç: { kimlik, uc, yontem?, govde?, basliklar?, beklenen: 'json'|'anahtar', kayit?(j) → örnek kayıt, analiz?(j) → { derinlik, ek } }
const KATALOG = [
  {
    ad: 'coinmetrics', kisaAd: 'Coin Metrics Community', grup: 'rejim', anahtar: 'yok',
    limit: '10 istek / 6 sn / IP (belge)', kota: { dakika: 100 },
    tos: 'CC BY-NC 4.0 — ticari olmayan kullanım + atıf; bazı metrikler emekliye ayrılacak (Talos 2025-10-28, liste yok)',
    rol: 'BAĞLAM şeridi (MVRV, BTC/ETH borsa akışı), büyük coinlerde aktif adres',
    uclar: [
      { kimlik: 'mvrv-katalog', uc: 'https://community-api.coinmetrics.io/v4/catalog-v2/asset-metrics?metrics=CapMVRVCur&page_size=10000', beklenen: 'json',
        kayit: (j) => j.data && j.data[0], analiz: (j) => metrikKapsami(j, 'CapMVRVCur') },
      { kimlik: 'akis-katalog', uc: 'https://community-api.coinmetrics.io/v4/catalog-v2/asset-metrics?metrics=FlowInExNtv&page_size=10000', beklenen: 'json',
        kayit: (j) => j.data && j.data[0], analiz: (j) => metrikKapsami(j, 'FlowInExNtv') },
      { kimlik: 'adres-katalog', uc: 'https://community-api.coinmetrics.io/v4/catalog-v2/asset-metrics?metrics=AdrActCnt&page_size=10000', beklenen: 'json',
        kayit: (j) => j.data && j.data[0], analiz: (j) => metrikKapsami(j, 'AdrActCnt') },
    ],
  },
  {
    ad: 'defillama-ucret', kisaAd: 'DefiLlama ücret/gelir', grup: 'temel', anahtar: 'yok',
    limit: 'ücretsiz belgede sayı yok (Pro 300 $ ayrı)', kota: null,
    tos: 'açık API; şart sayfası okunmadı — atıf verilir. /emissions (unlock) Pro: 402',
    rol: 'İZLE temel ailesi (P/F, P/S, ücret 30 g büyümesi); D6 geriye dönük testin girdisi',
    uclar: [
      { kimlik: 'fees-overview', uc: 'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true', beklenen: 'json',
        kayit: (j) => j.protocols && j.protocols[0],
        analiz: (j) => { const p = Array.isArray(j.protocols) ? j.protocols : []; return { ek: { protokol: p.length, gelirAlanli: p.filter(x => x.total30d != null).length } }; } },
      { kimlik: 'fees-gecmis-uniswap', uc: 'https://api.llama.fi/summary/fees/uniswap?dataType=dailyRevenue', beklenen: 'json',
        analiz: (j) => { const c = Array.isArray(j.totalDataChart) ? j.totalDataChart : []; return { derinlik: { ilk: c.length ? tarih(c[0][0]) : null, son: c.length ? tarih(c[c.length - 1][0]) : null, nokta: c.length } }; } },
    ],
  },
  {
    ad: 'defillama-tvl', kisaAd: 'DefiLlama TVL', grup: 'temel', anahtar: 'yok',
    limit: 'ücretsiz belgede sayı yok', kota: null,
    tos: 'açık API; şart sayfası okunmadı — atıf verilir',
    rol: 'TVL 30 g; ÖLÜ protokol izi (deadFrom / rugged / deprecated) hayatta kalma yanlılığını azaltır',
    uclar: [
      { kimlik: 'protocols', uc: 'https://api.llama.fi/protocols', beklenen: 'json', kayit: (j) => Array.isArray(j) && j[0],
        analiz: (j) => { const a = Array.isArray(j) ? j : []; return { ek: { protokol: a.length, deadFrom: a.filter(x => x.deadFrom).length, rugged: a.filter(x => x.rugged).length, deprecated: a.filter(x => x.deprecated).length, tvlSifir: a.filter(x => !x.tvl).length } }; } },
      { kimlik: 'olu-protokol-anchor', uc: 'https://api.llama.fi/protocol/anchor', beklenen: 'json',
        analiz: (j) => { const t = Array.isArray(j.tvl) ? j.tvl : []; return { derinlik: { ilk: t.length ? tarih(t[0].date) : null, son: t.length ? tarih(t[t.length - 1].date) : null, nokta: t.length }, ek: { deadFrom: j.deadFrom || null } }; } },
    ],
  },
  {
    ad: 'defillama-stablecoin', kisaAd: 'DefiLlama stablecoin', grup: 'rejim', anahtar: 'yok',
    limit: 'ücretsiz belgede sayı yok', kota: null, tos: 'açık API; atıf', rol: 'BAĞLAM şeridi (stablecoin arzı — H2 RED, yalnız bilgi)',
    uclar: [{ kimlik: 'stablecoincharts-all', uc: 'https://stablecoins.llama.fi/stablecoincharts/all', beklenen: 'json', kayit: (j) => Array.isArray(j) && j[0],
      analiz: (j) => { const a = Array.isArray(j) ? j : []; return { derinlik: { ilk: a.length ? tarih(a[0].date) : null, son: a.length ? tarih(a[a.length - 1].date) : null, nokta: a.length } }; } }],
  },
  {
    ad: 'geckoterminal-kesif', kisaAd: 'GeckoTerminal trend/yeni', grup: 'kesif', anahtar: 'yok', taramaKaynak: 'geckoterminal',
    limit: '~30 istek/dk anahtarsız (hızlıda 429)', kota: { dakika: 30 },
    tos: 'CoinGecko ToS: önbellek ≤ 24 sa, depolama/türetme yasak — D4 kararı: "yalnız deneme amaçlı" saklama sürüyor',
    rol: 'EVREN keşfi (DEX kanadı); holder dağılımı yedeği',
    uclar: [
      { kimlik: 'trending-pools', uc: 'https://api.geckoterminal.com/api/v2/networks/trending_pools', beklenen: 'json', kayit: (j) => j.data && j.data[0] && { ...j.data[0], ...(j.data[0].attributes || {}) },
        analiz: (j) => ({ derinlik: { not: 'anlık liste (OHLCV 180 g)' }, ek: { havuz: (j.data || []).length } }) },
      { kimlik: 'new-pools', uc: 'https://api.geckoterminal.com/api/v2/networks/new_pools', beklenen: 'json', kayit: (j) => j.data && j.data[0] && { ...j.data[0], ...(j.data[0].attributes || {}) },
        analiz: (j) => ({ derinlik: { not: 'anlık liste' }, ek: { havuz: (j.data || []).length } }) },
    ],
  },
  {
    ad: 'dexscreener-kesif', kisaAd: 'DexScreener profil/boost', grup: 'kesif', anahtar: 'yok', taramaKaynak: 'dexscreener',
    limit: '60 istek/dk (profil/boost), 300/dk (çift/token)', kota: { dakika: 60 },
    tos: 'ticari kullanım serbest, rakip ürün yasak [D]', rol: 'EVREN keşfi + paralı tanıtım (boost/ads/orders) bayrağı',
    uclar: [
      { kimlik: 'token-profiles', uc: 'https://api.dexscreener.com/token-profiles/latest/v1', beklenen: 'json', kayit: (j) => Array.isArray(j) && j[0],
        analiz: (j) => ({ derinlik: { not: 'yalnız anlık; ölü çiftler yok' }, ek: { kayit: Array.isArray(j) ? j.length : 0 } }) },
      { kimlik: 'token-boosts-latest', uc: 'https://api.dexscreener.com/token-boosts/latest/v1', beklenen: 'json', kayit: (j) => Array.isArray(j) && j[0],
        analiz: (j) => ({ derinlik: { not: 'yalnız anlık' }, ek: { kayit: Array.isArray(j) ? j.length : 0 } }) },
      { kimlik: 'token-boosts-top', uc: 'https://api.dexscreener.com/token-boosts/top/v1', beklenen: 'json', kayit: (j) => Array.isArray(j) && j[0],
        analiz: (j) => ({ ek: { kayit: Array.isArray(j) ? j.length : 0 } }) },
    ],
  },
  {
    ad: 'coingecko-trend', kisaAd: 'CoinGecko trending', grup: 'kesif', anahtar: 'yok (Demo anahtarı isteğe bağlı)', taramaKaynak: 'coingecko',
    limit: 'anahtarsız ~5–15/dk (sık 429); Demo 10 bin kredi/ay, 100/dk', kota: { dakika: 5 },
    tos: 'CoinGecko ToS: önbellek ≤ 24 sa, depolama yasak, atıf — D4: deneme amaçlı saklama sürüyor', rol: 'EVREN keşfi (yalnız keşif)',
    uclar: [{ kimlik: 'search-trending', uc: 'https://api.coingecko.com/api/v3/search/trending', beklenen: 'json', kayit: (j) => j.coins && j.coins[0] && j.coins[0].item,
      analiz: (j) => ({ derinlik: { not: 'anlık (son 24 sa)' }, ek: { coin: (j.coins || []).length } }) }],
  },
  {
    ad: 'snapshot', kisaAd: 'Snapshot', grup: 'yonetisim', anahtar: 'yok', limit: 'anahtarsız ~60/dk (başlıktan okunur)', kota: { dakika: 60 },
    tos: 'açık GraphQL; şart okunmadı', rol: 'yönetişim önerileri (bilgi)',
    uclar: [{ kimlik: 'graphql-proposals', uc: 'https://hub.snapshot.org/graphql', yontem: 'POST', beklenen: 'json',
      govde: { query: '{ proposals(first: 5, skip: 0, orderBy: "created", orderDirection: asc) { id created state space { id } } }' },
      kayit: (j) => j.data && j.data.proposals && j.data.proposals[0],
      analiz: (j) => { const p = (j.data && j.data.proposals) || []; return { derinlik: { ilk: enKucuk(p.map(x => tarih(x.created))), not: 'öneri geçmişi (en eski öneri)' } }; } }],
  },
  {
    ad: 'binance-borsa', kisaAd: 'Binance exchangeInfo', grup: 'borsa', anahtar: 'yok', binance: true, taramaKaynak: 'borsa',
    limit: 'IP ağırlığı 6000/dk (spot), 2400/dk (USDⓈ-M); exchangeInfo ağırlığı 20 / 1', kota: { dakika: 6000 },
    tos: 'genel piyasa verisi; Binance API şartları', rol: 'CEX erişimi, yeni listeleme / delist farkı (evren)',
    uclar: [
      { kimlik: 'spot-exchangeInfo', uc: 'https://api.binance.com/api/v3/exchangeInfo', beklenen: 'json', kayit: (j) => j.symbols && j.symbols[0],
        analiz: (j) => { const s = j.symbols || []; return { derinlik: { not: 'anlık; delist edilen sembol listeden düşer (fark günlük kaydedilmeli)' }, ek: { sembol: s.length, trading: s.filter(x => x.status === 'TRADING').length, usdt: s.filter(x => x.quoteAsset === 'USDT').length } }; } },
      { kimlik: 'usdm-exchangeInfo', uc: 'https://fapi.binance.com/fapi/v1/exchangeInfo', beklenen: 'json', kayit: (j) => j.symbols && j.symbols[0],
        analiz: (j) => { const s = j.symbols || []; return { derinlik: { ilk: enKucuk(s.map(x => tarih(x.onboardDate))), not: 'onboardDate; SETTLING/CLOSE durumundakiler bir süre kalır' }, ek: { sembol: s.length, trading: s.filter(x => x.status === 'TRADING').length, perp: s.filter(x => x.contractType === 'PERPETUAL').length } }; } },
    ],
  },
  {
    ad: 'bybit-borsa', kisaAd: 'Bybit instruments', grup: 'borsa', anahtar: 'yok', limit: '600 istek / 5 sn / IP', kota: null,
    tos: 'genel piyasa verisi; Bybit API şartları', rol: 'CEX erişimi (yedek)',
    uclar: [{ kimlik: 'spot-instruments', uc: 'https://api.bybit.com/v5/market/instruments-info?category=spot', beklenen: 'json', kayit: (j) => j.result && j.result.list && j.result.list[0],
      analiz: (j) => ({ derinlik: { not: 'anlık' }, ek: { sembol: ((j.result && j.result.list) || []).length, retCode: j.retCode } }) }],
  },
  {
    ad: 'okx-borsa', kisaAd: 'OKX instruments', grup: 'borsa', anahtar: 'yok', limit: '20 istek / 2 sn', kota: null,
    tos: 'genel piyasa verisi; OKX API şartları', rol: 'CEX erişimi (yedek)',
    uclar: [{ kimlik: 'spot-instruments', uc: 'https://www.okx.com/api/v5/public/instruments?instType=SPOT', beklenen: 'json', kayit: (j) => j.data && j.data[0],
      analiz: (j) => ({ derinlik: { ilk: enKucuk((j.data || []).map(x => tarih(x.listTime))), not: 'listTime' }, ek: { sembol: (j.data || []).length } }) }],
  },
  {
    ad: 'tokenomist', kisaAd: 'Tokenomist', grup: 'arz', anahtar: 'gerekli (API ücretli: Standard 249,95 $)', limit: 'ücretsiz görünüm: 3 geçmiş + 1 gelecek olay, YALNIZ tarayıcıda', kota: null,
    tos: 'sayfalara otomatik erişim YASAK (403 automated_access_not_allowed, 2026-10-09 elle doğrulandı); API anahtarlı ve ücretli → unlock verisi yalnız ELLE girilir',
    rol: 'KAÇIN unlock kapısı (30 g içinde dolaşımın ≥ X\'i) — yarı elle',
    uclar: [{ kimlik: 'api-anahtarsiz', uc: 'https://api.tokenomist.ai/v1/token/list', beklenen: 'anahtar' }],
  },
  {
    ad: 'github', kisaAd: 'GitHub REST', grup: 'gelistirici', anahtar: 'yok (60/sa); PAT ile 5 000/sa (ücretsiz)', limit: 'anahtarsız 60 istek/sa/IP', kota: { saat: 60 },
    tos: 'GitHub ToS / API şartları', rol: 'ölü repo kapısı (son commit > 180 g); D6 geriye dönük testin girdisi',
    uclar: [{ kimlik: 'repo-bitcoin', uc: 'https://api.github.com/repos/bitcoin/bitcoin', beklenen: 'json', basliklar: { accept: 'application/vnd.github+json' },
      analiz: (j) => ({ derinlik: { ilk: tarih(j.created_at), son: tarih(j.pushed_at), not: 'repo geçmişi tam (commit listesi sayfalı)' } }) }],
  },
  {
    ad: 'bgeometrics', kisaAd: 'BGeometrics', grup: 'rejim', anahtar: 'yok', limit: 'saatte 10, günde 15 istek; son 7 gün gecikmeli', kota: { gun: 15 },
    tos: 'şart okunmadı', rol: 'BAĞLAM çapraz kontrol (SOPR, STH-SOPR, NUPL)',
    uclar: [{ kimlik: 'sth-sopr-last', uc: 'https://bitcoin-data.com/v1/sth-sopr/last', beklenen: 'json',
      analiz: (j) => ({ derinlik: { son: j.d || null, not: j.delayed ? 'GECİKMELİ (son 7 gün abonelikle) — STH-SOPR da kapsamda' : 'gecikme işareti yok' }, ek: { delayed: !!j.delayed } }) }],
  },
  {
    ad: 'bitview', kisaAd: 'Bitview (BRK)', grup: 'rejim', anahtar: 'yok', limit: 'belge yok (tek hobi sunucusu)', kota: null,
    tos: 'kod MIT; servis şartı okunmadı; yedeği yok', rol: 'BAĞLAM çapraz kontrol (realized price, SOPR)',
    uclar: [{ kimlik: 'series-search-sopr', uc: 'https://bitview.space/api/series/search?q=sopr', beklenen: 'json',
      analiz: (j) => ({ derinlik: { not: 'genesis (belge); seri uçları ayrıca sınanmalı' }, ek: { seri: Array.isArray(j) ? j.length : 0 } }) }],
  },
  {
    ad: 'goplus', kisaAd: 'GoPlus', grup: 'guvenlik', anahtar: 'yok', taramaKaynak: 'goplus', limit: '~150 bin CU/ay [Ö]; anahtarsız ~30/dk', kota: { ay: 150000 },
    tos: 'şart okunmadı', rol: 'KAÇIN güvenlik kapıları (EVM): honeypot, sahip/mint/vergi, ilk 10, LP kilidi',
    uclar: [{ kimlik: 'token-security-usdt', uc: 'https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=0xdac17f958d2ee523a2206206994597c13d831ec7', beklenen: 'json',
      kayit: (j) => j.result && Object.values(j.result)[0], analiz: (j) => ({ derinlik: { not: 'yalnız anlık' }, ek: { code: j.code } }) }],
  },
  {
    ad: 'rugcheck', kisaAd: 'RugCheck', grup: 'guvenlik', anahtar: 'yok', taramaKaynak: 'rugcheck', limit: 'belge yok (anahtarsız)', kota: null,
    tos: 'şart okunmadı', rol: 'KAÇIN güvenlik kapıları (Solana): rugged, mint/freeze, insider, LP kilidi',
    uclar: [{ kimlik: 'report-summary-bonk', uc: 'https://api.rugcheck.xyz/v1/tokens/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/report/summary', beklenen: 'json',
      analiz: () => ({ derinlik: { not: 'yalnız anlık' } }) }],
  },
  {
    ad: 'isyatirim-malitablo', kisaAd: 'İş Yatırım MaliTablo', grup: 'bist', anahtar: 'yok', limit: 'belge yok; resmî API değil (IP engeli riski — düşük hız)', kota: null,
    tos: 'sözleşmesiz ön yüz ucu; BIST verisi üçüncü kişiye yayımlanmaz', rol: 'F4 BIST temel (bilanço/gelir/nakit akışı) + D9 A testi',
    uclar: [
      { kimlik: 'arclk-2024', uc: 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo?companyCode=ARCLK&exchange=TRY&financialGroup=XI_29&year1=2024&period1=12&year2=2024&period2=9&year3=2024&period3=6&year4=2024&period4=3',
        beklenen: 'json', basliklar: { 'user-agent': TARAYICI_UA }, kayit: (j) => j.value && j.value[0],
        analiz: (j) => ({ ek: { kalem: (j.value || []).length } }) },
      { kimlik: 'arclk-2008', uc: 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo?companyCode=ARCLK&exchange=TRY&financialGroup=XI_29&year1=2008&period1=12&year2=2008&period2=9&year3=2008&period3=6&year4=2008&period4=3',
        beklenen: 'json', basliklar: { 'user-agent': TARAYICI_UA },
        analiz: (j) => { const v = j.value || []; const dolu = v.filter(x => x.value1 != null && x.value1 !== '').length; return { derinlik: { ilk: dolu ? '2008-03-31' : null, not: `2008 sütunu: ${dolu}/${v.length} kalem dolu` } }; } },
      { kimlik: 'trkcm-2018-delist', uc: 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo?companyCode=TRKCM&exchange=TRY&financialGroup=XI_29&year1=2018&period1=12&year2=2018&period2=9&year3=2018&period3=6&year4=2018&period4=3',
        beklenen: 'json', basliklar: { 'user-agent': TARAYICI_UA },
        analiz: (j) => { const v = j.value || []; return { ek: { borsadanCikmis: 'TRKCM', doluKalem: v.filter(x => x.value1 != null && x.value1 !== '').length } }; } },
    ],
  },
  {
    ad: 'isyatirim-hissetekil', kisaAd: 'İş Yatırım HisseTekil', grup: 'bist', anahtar: 'yok', limit: 'belge yok; resmî API değil', kota: null,
    tos: 'sözleşmesiz ön yüz ucu; projede kullanılıyor (scripts/bist-haftalik.js)', rol: 'F4 BIST fiyat (nominal + düzeltilmiş kapanış, hacim)',
    uclar: [
      { kimlik: 'thyao-son-30g', uc: (simdi) => `https://www.isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/Data.aspx/HisseTekil?hisse=THYAO&startdate=${trGun(simdi - 30 * 864e5)}&enddate=${trGun(simdi)}`,
        beklenen: 'json', basliklar: { 'user-agent': TARAYICI_UA }, kayit: (j) => j.value && j.value[0], analiz: (j) => ({ ek: { gun: (j.value || []).length } }) },
      { kimlik: 'thyao-2005-ocak', uc: 'https://www.isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/Data.aspx/HisseTekil?hisse=THYAO&startdate=01-01-2005&enddate=31-01-2005',
        beklenen: 'json', basliklar: { 'user-agent': TARAYICI_UA },
        analiz: (j) => { const v = j.value || []; return { derinlik: { ilk: v.length ? String(v[0].HGDG_TARIH || '').slice(0, 10) || null : null, not: `2005-01: ${v.length} gün` } }; } },
    ],
  },
  {
    ad: 'evds', kisaAd: 'TCMB EVDS3', grup: 'makro', anahtar: 'ön yüz ucu anahtarsız; resmî API anahtar ister (ücretsiz üyelik)', limit: 'belge yok', kota: null,
    tos: 'kaynak gösterilerek yayımlanabilir [V]', rol: 'F4 TÜFE/kur normalizasyonu',
    uclar: [
      { kimlik: 'fe-usdtry', uc: 'https://evds3.tcmb.gov.tr/igmevdsms-dis/fe', yontem: 'POST', beklenen: 'json',
        govde: (simdi) => ({ type: 'json', series: 'TP.DK.USD.A.YTL', aggregationTypes: 'avg', formulas: '0', startDate: trGun(simdi - 14 * 864e5), endDate: trGun(simdi), frequency: '1', decimalSeperator: '.', decimal: '4', dateFormat: '0', lang: 'tr', yon: '', sira: '', ozelFormuller: [], groupSeperator: false, isRaporSayfasi: false }),
        kayit: (j) => j.items && j.items[0], analiz: (j) => ({ ek: { gozlem: (j.items || []).length } }) },
      { kimlik: 'resmi-api-anahtarsiz', uc: (simdi) => `https://evds3.tcmb.gov.tr/igmevdsms-dis/series=TP.DK.USD.A.YTL&startDate=${trGun(simdi - 14 * 864e5)}&endDate=${trGun(simdi)}&type=json`, beklenen: 'anahtar' },
    ],
  },
  // Anahtar gerekenler (sınanmaz; ücretsiz kayıt gerekir — K1: kayıt ücretsiz, yine de kullanıcı kararı):
  { ad: 'alchemy', kisaAd: 'Alchemy RPC', grup: 'rpc', anahtar: 'gerekli (ücretsiz hesap)', limit: '30M CU/ay, 15 rps, arşiv dahil', kota: null, tos: 'şart okunmadı; BSC arşivi ücretsizde mi DOĞRULANAMADI', rol: 'EVM holder geçmişi (Belki listesi)', uclar: [] },
  { ad: 'quicknode', kisaAd: 'QuickNode RPC', grup: 'rpc', anahtar: 'gerekli (ücretsiz hesap)', limit: '10M kredi/ay, 15 rps', kota: null, tos: 'şart okunmadı', rol: 'EVM arşiv RPC yedeği', uclar: [] },
  { ad: 'etherscan', kisaAd: 'Etherscan V2', grup: 'rpc', anahtar: 'gerekli (ücretsiz hesap)', limit: '3/sn, 100 bin/gün; Base/BSC ücretli', kota: null, tos: 'md. 8: kazıma, AI/ML, veri seti yazılı izinsiz YASAK → kullanılmaz', rol: '—', uclar: [] },
];

/** Coin Metrics katalog yanıtı → kapsam sayısı + BTC/ETH ilk gün. */
function metrikKapsami(j, metrik) {
  const d = Array.isArray(j.data) ? j.data : [];
  let topluluk = 0; const ilk = {};
  for (const a of d) {
    const m = (a.metrics || []).find(x => x.metric === metrik);
    const f = m && (m.frequencies || []).find(x => x.frequency === '1d');
    if (f && f.community !== false) topluluk++;
    if (f && (a.asset === 'btc' || a.asset === 'eth')) ilk[a.asset] = tarih(f.min_time);
  }
  return { derinlik: { ilk: enKucuk(Object.values(ilk)), not: `BTC ${ilk.btc || '—'}, ETH ${ilk.eth || '—'}` }, ek: { metrik, varlik: d.length, topluluk } };
}

/** Örnek kayıttan alan listesi (en çok 40). */
function alanListesi(j, kayitFn) {
  let x = null;
  try { x = kayitFn ? kayitFn(j) : null; } catch { x = null; }
  if (!x) x = Array.isArray(j) ? j[0] : j;
  if (!x || typeof x !== 'object') return [];
  return Object.keys(x).slice(0, 40);
}

const LIMIT_BASLIK = /rate|limit|retry-after|x-mbx-used|quota|x-cg|remaining/i;

async function tekIstek(k, u, { fetch: f, simdi }) {
  const t0 = simdi();
  const url = typeof u.uc === 'function' ? u.uc(t0) : u.uc;
  const govde = typeof u.govde === 'function' ? u.govde(t0) : u.govde;
  const sonuc = { kaynak: k.ad, kimlik: u.kimlik, uc: url, yontem: u.yontem || 'GET', zaman: new Date(t0).toISOString(),
    http: null, ms: null, durum: 'hata', hata: null, limitBasliklari: {}, sha256: null, bayt: null, alanlar: [], derinlik: null, ek: null };
  try {
    const r = await f(url, { method: u.yontem || 'GET', headers: { accept: 'application/json', 'user-agent': UA, ...(govde ? { 'content-type': 'application/json' } : {}), ...(u.basliklar || {}) },
      body: govde ? JSON.stringify(govde) : undefined, signal: AbortSignal.timeout(30000), redirect: 'follow' });
    const metin = await r.text();
    sonuc.http = r.status; sonuc.ms = simdi() - t0; sonuc.sha256 = sha(metin); sonuc.bayt = Buffer.byteLength(metin);
    if (r.headers && typeof r.headers.forEach === 'function') r.headers.forEach((v, ad) => { if (LIMIT_BASLIK.test(ad)) sonuc.limitBasliklari[ad] = String(v).slice(0, 80); });
    if (u.beklenen === 'anahtar') {
      sonuc.durum = (r.status === 401 || r.status === 403) ? 'anahtar_gerekli' : r.ok ? 'ok' : 'hata';
      if (sonuc.durum === 'hata') sonuc.hata = `HTTP ${r.status} (401/403 bekleniyordu)`;
      sonuc.ozet = metin.slice(0, 160);
      return sonuc;
    }
    if (!r.ok) { sonuc.hata = `HTTP ${r.status}`; sonuc.ozet = metin.slice(0, 160); return sonuc; }
    let j;
    try { j = JSON.parse(metin); } catch { sonuc.hata = 'gövde JSON değil'; sonuc.ozet = metin.slice(0, 160); return sonuc; }
    sonuc.alanlar = alanListesi(j, u.kayit);
    if (u.analiz) { try { const a = u.analiz(j) || {}; sonuc.derinlik = a.derinlik || null; sonuc.ek = a.ek || null; } catch (e) { sonuc.ek = { analizHatasi: String(e.message).slice(0, 120) }; } }
    sonuc.durum = 'ok';
  } catch (e) {
    sonuc.ms = simdi() - t0;
    sonuc.hata = e && e.name === 'TimeoutError' ? 'zaman aşımı (30 sn)' : `ağ hatası: ${String((e && e.message) || e).slice(0, 120)}`;
  }
  return sonuc;
}

/** Veri orkestratörünün Binance beklemesi sürüyor mu (data/veri-durum.json). */
function binanceBeklemede(simdi) {
  try {
    const d = JSON.parse(fs.readFileSync(yollar.veri('veri-durum.json'), 'utf8'));
    return d.binanceBekleme && Date.parse(d.binanceBekleme.bitis) > simdi ? d.binanceBekleme : null;
  } catch { return null; }
}

/**
 * Katalogdaki her uca bir istek. @param o { fetch, simdi, uyu, sadece: [ad], binanceBekleme: fn }
 * @returns { surum, zaman, tarih, sonuclar: [...], kaynaklar: { ad: { durum, ... } } }
 */
async function sina(o = {}) {
  const f = o.fetch || ((...a) => globalThis.fetch(...a));
  const simdi = o.simdi || (() => Date.now());
  const uyu = o.uyu || ((ms) => new Promise(r => setTimeout(r, ms)));
  const bekleme = o.binanceBekleme || binanceBeklemede;
  const sonuclar = [];
  for (const k of KATALOG) {
    if (o.sadece && !o.sadece.includes(k.ad)) continue;
    if (!k.uclar.length) { sonuclar.push({ kaynak: k.ad, kimlik: '-', uc: null, durum: 'anahtar_gerekli', hata: null, not: 'sınanmadı: anahtar gerekir' }); continue; }
    const b = k.binance ? bekleme(simdi()) : null;
    for (const u of k.uclar) {
      if (b) { sonuclar.push({ kaynak: k.ad, kimlik: u.kimlik, uc: typeof u.uc === 'function' ? u.uc(simdi()) : u.uc, durum: 'atlandi', hata: `Binance hız sınırı beklemesi (${b.bitis}'e kadar)` }); continue; }
      // eslint-disable-next-line no-await-in-loop
      sonuclar.push(await tekIstek(k, u, { fetch: f, simdi }));
      // eslint-disable-next-line no-await-in-loop
      await uyu(k.ad === 'coinmetrics' ? 1500 : 700);
    }
  }
  const t = simdi();
  return { surum: SURUM, zaman: new Date(t).toISOString(), tarih: gunStr(t), sonuclar, kaynaklar: kaynakDurumlari(sonuclar) };
}

/** Uç sonuçları → kaynak başına tek durum: hepsi ok → ok; biri hata → hata (kısmi); anahtar beklenen → anahtar_gerekli. */
function kaynakDurumlari(sonuclar) {
  const out = {};
  for (const s of sonuclar) {
    const k = out[s.kaynak] || (out[s.kaynak] = { uc: 0, ok: 0, hata: 0, anahtar: 0, atlandi: 0, msToplam: 0, msSayi: 0 });
    k.uc++;
    if (s.durum === 'ok') k.ok++; else if (s.durum === 'anahtar_gerekli') k.anahtar++; else if (s.durum === 'atlandi') k.atlandi++; else k.hata++;
    if (Number.isFinite(s.ms)) { k.msToplam += s.ms; k.msSayi++; }
  }
  for (const k of Object.values(out)) {
    k.durum = k.hata ? (k.ok ? 'kismi' : 'hata') : k.atlandi === k.uc ? 'atlandi' : k.anahtar && !k.ok ? 'anahtar_gerekli' : 'ok';
    k.ms = k.msSayi ? Math.round(k.msToplam / k.msSayi) : null;
    delete k.msToplam; delete k.msSayi;
  }
  return out;
}

// ── Bayrak / kapı → kaynak haritası ─────────────────────────────────────
// Her bayrak: { ad, durum: 'mevcut'|'planli', ag: { evm: [[...alternatif kümeler]], sol: [...], hepsi: [...] } }
// İç dizi = birlikte GEREKEN kaynaklar; dış dizi = alternatifler (biri yeter). Kaynak adları KATALOG ya da lib/tarama adlarıdır.
const BAYRAK_KAYNAK = Object.freeze({
  ilk10_artis: { ad: 'İlk 10 payı değişimi', durum: 'mevcut', ag: { evm: [['goplus']], sol: [['rugcheck']] } },
  ilk10_adres_bosaltma: { ad: 'İlk 10 adres boşaltması', durum: 'mevcut', ag: { evm: [['goplus']], sol: [['rugcheck']] } },
  holder_dusus: { ad: 'Holder düşüşü', durum: 'mevcut', ag: { evm: [['goplus'], ['geckoterminal']], sol: [['rugcheck'], ['geckoterminal']] } },
  likidite_dusus: { ad: 'Likidite çekilmesi', durum: 'mevcut', ag: { hepsi: [['dexscreener'], ['geckoterminal']] } },
  lp_kilit_bitiyor: { ad: 'LP kilidi bitiyor / azaldı', durum: 'mevcut', ag: { evm: [['goplus']], sol: [['rugcheck']] } },
  sahip_yetkisi: { ad: 'Sahip yetkisi', durum: 'mevcut', ag: { evm: [['goplus']] } },
  mint_yetkisi: { ad: 'Mint yetkisi', durum: 'mevcut', ag: { evm: [['goplus']], sol: [['rugcheck']] } },
  blacklist: { ad: 'Kara liste / dondurma', durum: 'mevcut', ag: { evm: [['goplus']], sol: [['rugcheck']] } },
  vergi_degisebilir: { ad: 'Vergi değiştirilebilir', durum: 'mevcut', ag: { evm: [['goplus']] } },
  honeypot: { ad: 'Honeypot', durum: 'mevcut', ag: { evm: [['goplus']] } },
  rugged: { ad: 'Rugged', durum: 'mevcut', ag: { sol: [['rugcheck']] } },
  parali_tanitim: { ad: 'Paralı tanıtım', durum: 'mevcut', ag: { hepsi: [['dexscreener']] } },
  alan_adi_yeni: { ad: 'Alan adı yeni', durum: 'mevcut', ag: { hepsi: [['rdap', 'dexscreener']] } },
  veri_kayboldu: { ad: 'Veri kayboldu', durum: 'mevcut', ag: { hepsi: [['borsa'], ['dexscreener'], ['geckoterminal'], ['coingecko']] } },
  // kural-v1 (PLAN-DIKKAT-V1-ONKAYIT.md) — F2'de kodlanacak kapılar ve aileler:
  k_lp_kilitsiz_genc: { ad: 'LP kilitsiz + ilk çift < 90 g', durum: 'planli', ag: { evm: [['goplus', 'dexscreener']], sol: [['rugcheck', 'dexscreener']] } },
  k_unlock_30g: { ad: 'Unlock 30 g ≥ eşik', durum: 'planli', ag: { hepsi: [['tokenomist']] } },
  k_olu_repo: { ad: 'Son commit > 180 g', durum: 'planli', ag: { hepsi: [['github']] } },
  k_delist: { ad: 'CEX delist / erişim', durum: 'planli', ag: { hepsi: [['binance-borsa'], ['bybit-borsa'], ['okx-borsa']] } },
  a_temel: { ad: 'İZLE temel ailesi (P/F, P/S, ücret büyümesi)', durum: 'planli', ag: { hepsi: [['defillama-ucret']] } },
  a_tvl: { ad: 'TVL 30 g', durum: 'planli', ag: { hepsi: [['defillama-tvl']] } },
  e_dex_kesif: { ad: 'Evren keşfi (DEX)', durum: 'planli', ag: { hepsi: [['geckoterminal-kesif'], ['dexscreener-kesif']] } },
  e_cex_kesif: { ad: 'Evren keşfi (CEX)', durum: 'planli', ag: { hepsi: [['binance-borsa']] } },
  b_mvrv: { ad: 'Bağlam: MVRV / SOPR', durum: 'planli', ag: { hepsi: [['coinmetrics'], ['bgeometrics'], ['bitview']] } },
  b_akis: { ad: 'Bağlam: BTC/ETH borsa akışı', durum: 'planli', ag: { hepsi: [['coinmetrics']] } },
  y_yonetisim: { ad: 'Yönetişim notu', durum: 'planli', ag: { hepsi: [['snapshot']] } },
  bist_temel: { ad: 'BIST temel (F4)', durum: 'planli', ag: { hepsi: [['isyatirim-malitablo']] } },
  bist_tufe: { ad: 'BIST TÜFE/kur normalizasyonu (F4)', durum: 'planli', ag: { hepsi: [['evds']] } },
});

/** lib/tarama kaynak adı → katalog adı (aynı servis). */
const TARAMA_ESLEME = Object.freeze({ geckoterminal: 'geckoterminal-kesif', dexscreener: 'dexscreener-kesif', coingecko: 'coingecko-trend', borsa: 'binance-borsa' });
const katalogAdi = (ad) => TARAMA_ESLEME[ad] || ad;

/**
 * Kaynak başına: üretilemez = alternatiflerinin HEPSİ bu kaynağı içeren (ağ sınıfı bazında) bayraklar;
 * yedekleSurer = bu kaynağı içeren ama başka alternatifi olanlar.
 * @returns { [kaynak]: { uretilemez: [{kod, ad, ag}], yedekleSurer: [{kod, ad, ag}] } }
 */
function bozulmaHaritasi() {
  const out = {};
  const yer = (k) => out[k] || (out[k] = { uretilemez: [], yedekleSurer: [] });
  for (const [kod, b] of Object.entries(BAYRAK_KAYNAK)) {
    for (const [ag, alternatifler] of Object.entries(b.ag)) {
      const kaynaklar = new Set(alternatifler.flat().map(katalogAdi));
      for (const k of kaynaklar) {
        const hepsiIcerir = alternatifler.every(al => al.map(katalogAdi).includes(k));
        (hepsiIcerir ? yer(k).uretilemez : yer(k).yedekleSurer).push({ kod, ad: b.ad, ag, durum: b.durum });
      }
    }
  }
  return out;
}

// ── Sağlık: envanter dosyaları + tarama özetleri ─────────────────────────
function envanterDosyalari(dizin, simdi, gun) {
  const sinir = gunStr(simdi - (gun - 1) * 864e5);
  let ad = [];
  try { ad = fs.readdirSync(dizin).filter(f => /^envanter-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch { return []; }
  const out = [];
  for (const f of ad) {
    if (f.slice(9, 19) < sinir) continue;
    try { out.push(JSON.parse(fs.readFileSync(path.join(dizin, f), 'utf8'))); } catch { /* bozuk dosya atlanır */ }
  }
  return out;
}

function taramaOzetleri(taramaDizin, simdi, gun) {
  const sinir = simdi - gun * 864e5;
  let metin = '';
  try { metin = fs.readFileSync(path.join(taramaDizin, 'taramalar.jsonl'), 'utf8'); } catch { return []; }
  const out = [];
  for (const s of metin.split('\n')) { if (!s.trim()) continue; try { const t = JSON.parse(s); if (Date.parse(t.bas) >= sinir) out.push(t); } catch { /* atla */ } }
  return out;
}

/**
 * @param o { envanterDizin?, taramaDizin?, simdi?, gun? = 30 }
 * @returns { gun, envanterGunu, sonEnvanter, satirlar: [ { ad, kisaAd, grup, anahtar, limit, tos, rol, son:{durum,http,ms,zaman,hata},
 *            envanter:{gun, basarili, oran}, tarama:{cagri, yanit, hata, oran}|null, kota:{metin, gunlukKullanim, oran, baslik}, bozulma } ] }
 */
function saglik(o = {}) {
  const simdi = (o.simdi || Date.now)();
  const gun = o.gun || 30;
  const env = envanterDosyalari(o.envanterDizin || envanterDizini(), simdi, gun);
  const tar = taramaOzetleri(o.taramaDizin || process.env.TARAMA_DIZIN || yollar.veri('tarama'), simdi, gun);
  const harita = bozulmaHaritasi();
  const son = env[env.length - 1] || null;
  const satirlar = KATALOG.map(k => {
    const sonUclar = son ? (son.sonuclar || []).filter(s => s.kaynak === k.ad) : [];
    const sonK = son && son.kaynaklar ? son.kaynaklar[k.ad] : null;
    let envBasarili = 0, envGun = 0;
    for (const e of env) { const d = e.kaynaklar && e.kaynaklar[k.ad]; if (!d || d.durum === 'atlandi') continue; envGun++; if (d.durum === 'ok' || d.durum === 'anahtar_gerekli') envBasarili++; }
    let tarama = null;
    if (k.taramaKaynak) {
      let cagri = 0, yanit = 0, hata = 0;
      for (const t of tar) { const x = t.kaynakOzet && t.kaynakOzet[k.taramaKaynak]; if (!x) continue; yanit += (x.ok || 0) + (x.bos || 0); hata += x.hata || 0; cagri += (x.ok || 0) + (x.bos || 0) + (x.hata || 0); }
      tarama = { kaynak: k.taramaKaynak, tarama: tar.length, cagri, yanit, hata, oran: cagri ? yanit / cagri : null };
    }
    // Kota: günlük ortalama çağrı (tarama + envanter) / belgelenmiş limit (gün, ay/30, saat×24, dakika×1440 — en sıkı)
    const gunSayisi = Math.max(1, Math.min(gun, Math.ceil((simdi - Math.min(...[...env.map(e => Date.parse(e.zaman)), ...tar.map(t => Date.parse(t.bas)), simdi])) / 864e5) || 1));
    const envCagri = env.reduce((s, e) => s + (e.sonuclar || []).filter(x => x.kaynak === k.ad && x.http != null && !x.tasindi).length, 0);
    const gunluk = ((tarama ? tarama.cagri : 0) + envCagri) / gunSayisi;
    const kt = k.kota || null;
    const gunlukLimit = kt ? (kt.gun || (kt.ay ? kt.ay / 30 : null) || (kt.saat ? kt.saat * 24 : null) || (kt.dakika ? kt.dakika * 1440 : null)) : null;
    const baslik = {};
    for (const s of sonUclar) Object.assign(baslik, s.limitBasliklari || {});
    return {
      ad: k.ad, kisaAd: k.kisaAd, grup: k.grup, anahtar: k.anahtar, limit: k.limit, tos: k.tos, rol: k.rol,
      son: sonK ? { durum: sonK.durum, ms: sonK.ms, uc: sonK.uc, ok: sonK.ok, zaman: son.zaman, http: [...new Set(sonUclar.map(s => s.http).filter(x => x != null))],
        hata: sonUclar.map(s => s.hata).filter(Boolean)[0] || null } : null,
      envanter: { gun: envGun, basarili: envBasarili, oran: envGun ? envBasarili / envGun : null },
      tarama,
      kota: { metin: k.limit, gunlukKullanim: Math.round(gunluk * 10) / 10, gunlukLimit, oran: gunlukLimit ? gunluk / gunlukLimit : null, baslik },
      bozulma: harita[k.ad] || { uretilemez: [], yedekleSurer: [] },
    };
  });
  // lib/tarama'nın katalogda ayrı satırı olmayan kaynağı (RDAP) da haritada görünsün.
  if (harita.rdap) satirlar.push({ ad: 'rdap', kisaAd: 'RDAP (alan adı)', grup: 'guvenlik', anahtar: 'yok', limit: 'sunucuya göre; haftada bir sorgu', tos: 'IANA RDAP, kamu kaydı', rol: 'alan adı yaşı bayrağı',
    son: null, envanter: { gun: 0, basarili: 0, oran: null }, tarama: (() => { let cagri = 0, yanit = 0, hata = 0; for (const t of tar) { const x = t.kaynakOzet && t.kaynakOzet.rdap; if (!x) continue; yanit += (x.ok || 0) + (x.bos || 0); hata += x.hata || 0; cagri += (x.ok || 0) + (x.bos || 0) + (x.hata || 0); } return { kaynak: 'rdap', tarama: tar.length, cagri, yanit, hata, oran: cagri ? yanit / cagri : null }; })(),
    kota: { metin: 'sunucuya göre', gunlukKullanim: null, gunlukLimit: null, oran: null, baslik: {} }, bozulma: harita.rdap });
  return { gun, envanterGunu: env.length, taramaSayisi: tar.length, sonEnvanter: son ? son.zaman : null, satirlar,
    bayraklar: Object.fromEntries(Object.entries(BAYRAK_KAYNAK).map(([k, v]) => [k, { ad: v.ad, durum: v.durum }])) };
}

/** Envanter sonucunu günün dosyasına yaz (aynı gün yeniden koşulursa üzerine; önceki koşuların özeti `oncekiKosular`da). */
function envanterYaz(sonuc, dizin = envanterDizini()) {
  fs.mkdirSync(dizin, { recursive: true });
  const dosya = path.join(dizin, `envanter-${sonuc.tarih}.json`);
  let onceki = [];
  try { const e = JSON.parse(fs.readFileSync(dosya, 'utf8')); onceki = [...(e.oncekiKosular || []), { zaman: e.zaman, kaynaklar: Object.fromEntries(Object.entries(e.kaynaklar || {}).map(([k, v]) => [k, v.durum])) }]; } catch { /* ilk koşu */ }
  const yaz = { ...sonuc, oncekiKosular: onceki.slice(-20) };
  const gecici = `${dosya}.${process.pid}.tmp`;
  fs.writeFileSync(gecici, JSON.stringify(yaz, null, 1), 'utf8');
  fs.renameSync(gecici, dosya);
  return dosya;
}

module.exports = { KATALOG, BAYRAK_KAYNAK, TARAMA_ESLEME, sina, saglik, bozulmaHaritasi, kaynakDurumlari, envanterYaz, envanterDizini, metrikKapsami, alanListesi, SURUM };
