/**
 * DİKKAT F1 — aday evren (`evren-v1`, PLAN-DIKKAT-V1-ONKAYIT.md §1 + EK-1 A5 + "EK-1 düzeltme (denetim 2)" madde 3).
 * ═══════════════════════════════════════════════════════════════════════════
 * Bu modül LİSTE ÜRETMEZ (F2'nin işi). Yalnız: keşif uçlarının ham yanıtı → aday kümesi → her aday için evren kararı
 * (girdi / elendi + NEDEN) → `data/tarama/<kip>/evren/YYYY-MM-DD.jsonl`. Ağ çağrıları lib/tarama/arsiv.js'te; burada
 * keşif yanıtlarını ayrıştıran ve kararı veren SAF fonksiyonlar + sürümlü sabitler var (öz test bunları doğrudan sınar).
 *
 *   KANATLAR   cex: Binance spot ya da USDⓈ-M'de TRADING USDT paritesi olan taban varlık (aynı gün DEX'te de bulunsa cex).
 *              dex: sol, base, eth, bsc, arbitrum ağlarında keşfedilen (GeckoTerminal trend/yeni havuz, DexScreener profil/
 *              boost, CoinGecko trending, DefiLlama /protocols — adres/gecko_id taşıyan, deadFrom'suz), Binance'te olmayan.
 *              Boost kaynağından gelen aday `parali: true` taşır (aynı kurallara tabi).
 *   HARİÇ      EK-1 A5 sürümlü listesi (HARIC_V1) + o günün DefiLlama stablecoin sembolleri + referans/binance-tradfi-semboller.json.
 *              Listeye ekleme = evren-v2 (yeni deneme numarası) — bu dosyada sabit DEĞİŞTİRİLMEZ.
 *   EŞİKLER    V_cex, L_dex, V_dex HENÜZ YOK (§1.4: 30 resmî kayıt gününden sonra BİR KEZ, scripts/evren-esik-sabitle.js).
 *              Isınmada karar = eşik dışı şartlar (sınıf, ağ, yaş, ≥ 3 gün geçmiş); her satır ölçümleri (24 s hacim, 7 kayıt
 *              günü medyanı, likidite) taşır ki eşik betiği dağılımı yeniden kurabilsin. `taban` = ön kayıttaki en küçük
 *              seçilebilir değerlerle (V_cex 100 bin $, L_dex = V_dex 50 bin $) geçer mi — nihai eşik ≥ taban olduğundan
 *              nihai evren ⊆ taban kümesi; ham anlık görüntü bu kümeye alınır (ilk günden itibaren seri birikir).
 *   ZİNCİR     Çok zincirli token'ın zinciri İLK İZLEME GÜNÜNDE (ısınmada evrene ilk giriş) DexScreener likiditesi en yüksek
 *              zincir olarak sabitlenir ve kalıcı eşleme dosyasına (`evren/zincir.json`) yazılır; bir daha seçilmez.
 *   İZLEME     Son evren/izleme gününden 30 gün geçince izleme biter (satırlar silinmez; `izleme-bitti` olayı yazılır).
 *
 * Dış veri yorumlanmaz; yalnız seçilmiş alanlar sayı/kısaltılmış metin olarak alınır (ortak.temizMetin / sayi).
 * lib/live ve lib/risk'e dokunmaz; canlı bot kararlarını etkilemez.
 */
'use strict';
const { AGLAR } = require('./aglar');
const { temizMetin, sayi, medyan } = require('./ortak');
const { alanAdiCikar } = require('./kaynaklar');

const EVREN_SURUM = 'evren-v1';
const DEX_AGLAR = Object.freeze(['sol', 'base', 'eth', 'bsc', 'arbitrum']);
/** Eşiklerin seçileceği 1-2-5 ızgarası ve tabanlar (§1.4). */
const IZGARA = Object.freeze([20e3, 50e3, 100e3, 200e3, 500e3, 1e6, 2e6, 5e6, 10e6, 20e6, 50e6, 100e6, 200e6, 500e6]);
const TABAN = Object.freeze({ cex: 100e3, dex: 50e3 });
const HEDEF_EVREN = 200;            // kanat başına ortalama günlük evren ≤ 200 (§1.4)
const ESIK_GUN = 30;                // eşik sabitleme için gereken resmî kayıt günü
const MIN_GECMIS = 3;               // A5: 3 günden az geçmiş → evren dışı
const MEDYAN_GUN = 7;               // son 7 kayıt günü
const YAS_GUN = 14;                 // yaş ≥ 14 g
const IZLEME_GUN = 30;              // 30 g evren dışı → izleme biter
/**
 * Evren eşikleri — §1.4: elle commit'e BAĞLI DEĞİL (64.3, dikkatTakip N14). Günlük koşu 30. kayıt gününden sonraki ilk koşuda
 * `esikHesapla` ile hesaplayıp `evren/esik-v1.json`'u manifest zincirine BİR KEZ yazar (arsiv.esikHazirla / esikOku); t0 = 30. kayıt
 * günü + 2 (A5). Bu sabit null kalabilir; doluysa ve zincirdeki dosyayla çelişirse koşu DURUR (sessiz seçim yok).
 */
const ESIKLER_V1 = null;

// ── EK-1 A5 hariç sınıflar (sürümlü; DEĞİŞTİRİLMEZ — ekleme evren-v2) ──────────────────────────────────────────
const HARIC_V1 = Object.freeze({
  stablecoin: ['USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDP', 'PYUSD', 'USDE', 'USDS', 'FRAX', 'LUSD', 'GUSD', 'USD1', 'RLUSD', 'USDD', 'CRVUSD', 'GHO', 'EURC', 'EURI', 'AEUR'],
  emtiaFiat: ['PAXG', 'XAUT', 'EUR', 'GBP', 'AUD', 'TRY', 'BRL', 'JPY', 'RUB', 'UAH', 'NGN', 'ARS', 'ZAR', 'PLN', 'RON', 'CZK', 'MXN', 'IDR', 'BIDR', 'IDRT', 'BKRW', 'TRYB', 'BRZ', 'XSGD', 'EURS', 'EURT', 'EURR', 'CADC', 'GYEN', 'JPYC', 'ZARP', 'MXNT', 'NZDS', 'XIDR', 'QCAD'],
  wrapped: ['WBTC', 'WETH', 'WBNB', 'WSOL', 'WAVAX', 'WMATIC', 'WPOL', 'CBBTC', 'BTCB', 'TBTC', 'RENBTC', 'SOLVBTC'],
  lst: ['STETH', 'WSTETH', 'RETH', 'CBETH', 'BETH', 'WBETH', 'SFRXETH', 'ANKRETH', 'EZETH', 'WEETH', 'RSETH', 'PUFETH', 'METH', 'MSOL', 'JITOSOL', 'BSOL', 'JUPSOL', 'STSOL', 'BNSOL', 'INF'],
  kaldiracSonek: ['UP', 'DOWN', 'BULL', 'BEAR', '3L', '3S', '5L', '5S'],
});
const SET = Object.fromEntries(Object.entries(HARIC_V1).map(([k, v]) => [k, new Set(v)]));

/**
 * Hariç sınıf nedeni ya da null (A5 + EK-2 a).
 * @param t { sembol, ad, cgId, kanat: 'cex'|'dex', hamTaban (Binance ham tabanı, çarpan öneki ayıklanmadan) }
 * @param o { stabilCg: Set (o günün DefiLlama stablecoin gecko_id'leri), stabilAdres: Set ('ag:adres'), adres: 'ag:adres',
 *            tradfi: Set (Binance TradFi tabanları), tokenizeCg: Set (CoinGecko tokenize hisse kategorileri), tabanlar: Set (CEX tabanları) }
 * Sembol listeleri (A5 stablecoin, emtia/fiat, TradFi) YALNIZ CEX tabanına uygulanır; stablecoin iki kanatta da KİMLİKLE.
 */
function haricNeden(t, o = {}) {
  const ham = String(t.sembol || '');
  const s = ham.toUpperCase();
  const ad = String(t.ad || '');
  const cex = t.kanat === 'cex';
  if (!s) return { kod: 'sembol-yok', metin: 'sembol yok' };
  if (t.cgId && o.stabilCg && o.stabilCg.has(t.cgId)) return { kod: 'stablecoin', metin: `stablecoin (DefiLlama stablecoin kaydı, gecko_id ${t.cgId})` };
  if (o.adres && o.stabilAdres && o.stabilAdres.has(o.adres)) return { kod: 'stablecoin', metin: 'stablecoin (DefiLlama stablecoin kaydı, kontrat adresi)' };
  if (cex && SET.stablecoin.has(s)) return { kod: 'stablecoin', metin: 'stablecoin (A5 listesi, CEX tabanı)' };
  if (cex && SET.emtiaFiat.has(s)) return { kod: 'emtia-fiat', metin: 'emtia / fiat bağlı (CEX tabanı)' };
  if (t.cgId && o.tokenizeCg && o.tokenizeCg.has(t.cgId)) return { kod: 'tradfi', metin: `tokenize hisse (CoinGecko kategorisi, ${t.cgId})` };
  const hamTaban = String(t.hamTaban || s).toUpperCase();
  if (cex && o.tradfi && o.tradfi.has(hamTaban)) return { kod: 'tradfi', metin: 'TradFi tabanı (binance-tradfi-semboller.json, ham taban)' };
  if (cex && o.tradfi && /B$/.test(hamTaban) && hamTaban.length > 2 && o.tradfi.has(hamTaban.slice(0, -1))) return { kod: 'tradfi', metin: 'tokenize hisse (Binance "kök+B", kök TradFi listesinde)' };
  if (SET.wrapped.has(s)) return { kod: 'wrapped', metin: 'wrapped / köprülenmiş (A5 listesi)' };
  if (/\.E$/.test(s) || /^AXL[A-Z]/.test(s) || /\(wormhole\)/i.test(ad)) return { kod: 'wrapped', metin: 'köprü sürümü (.e / axl / "(Wormhole)" etiketi)' };
  if (SET.lst.has(s)) return { kod: 'lst', metin: 'likit staking / restaking (A5 listesi)' };
  for (const son of HARIC_V1.kaldiracSonek) {
    // BTCUP / ETHDOWN biçimi: önek bilinen bir CEX tabanı olmalı (JUP, SUP gibi sıradan adlar elenmesin).
    if (s.length > son.length + 1 && s.endsWith(son) && o.tabanlar && o.tabanlar.has(s.slice(0, -son.length))) return { kod: 'kaldiracli', metin: `kaldıraçlı token (${son} soneki)` };
  }
  if (/^[A-Z0-9]{1,6}x$/.test(ham)) return { kod: 'tradfi', metin: 'tokenize hisse (xStocks …x)' };
  if (/^[A-Z0-9]{1,6}on$/.test(ham)) return { kod: 'tradfi', metin: 'tokenize hisse (Ondo Global Markets …on)' };
  return null;
}

// ── Ağ / adres eşlemeleri ────────────────────────────────────────────────
const AG_DEX = Object.fromEntries(Object.entries(AGLAR).filter(([, v]) => v.dex).map(([k, v]) => [v.dex, k]));       // 'ethereum' → 'eth'
const AG_GECKO = Object.fromEntries(Object.entries(AGLAR).filter(([, v]) => v.gecko).map(([k, v]) => [v.gecko, k]));  // 'solana' → 'sol'
const AG_CG = Object.fromEntries(Object.entries(AGLAR).filter(([, v]) => v.cg).map(([k, v]) => [v.cg, k]));           // 'binance-smart-chain' → 'bsc'
const AG_LLAMA = Object.freeze({ ethereum: 'eth', bsc: 'bsc', binance: 'bsc', base: 'base', arbitrum: 'arbitrum', solana: 'sol', polygon: 'polygon', optimism: 'optimism', avax: 'avalanche', avalanche: 'avalanche' });
/** Zincir önceliği (likidite bilgisi yoksa sabitleme sırası). */
const AG_ONCELIK = Object.freeze(['eth', 'bsc', 'sol', 'base', 'arbitrum', 'polygon', 'optimism', 'avalanche']);

function adresNorm(ag, a) {
  const s = temizMetin(a, 80);
  if (!s) return null;
  if (AGLAR[ag] && AGLAR[ag].evm) return /^0x[0-9a-fA-F]{40}$/.test(s) ? s.toLowerCase() : null;
  if (ag === 'sol') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) ? s : null;
  return null;
}
const dexAnahtar = (ag, adres) => `${ag}:${adres}`;
const cexAnahtar = (taban) => `cex:${taban}`;

/** USDⓈ-M çarpan öneki (1000PEPE → PEPE). Hacim USDT cinsinden olduğu için çarpan hacmi etkilemez. */
function perpTaban(b) {
  const m = /^(1000000|100000|10000|1000|100|1M)([A-Z0-9]{2,})$/.exec(String(b || ''));
  return m ? { taban: m[2], carpan: m[1] } : { taban: String(b || ''), carpan: null };
}

/** DefiLlama `address` alanı → { ag, adres } | null. Çıplak 0x adres = Ethereum (DefiLlama kuralı). */
function llamaAdres(x) {
  const s = String(x || '').trim();
  if (!s || s === '-' || s === 'null') return null;
  const m = /^([a-z0-9_-]+):(.+)$/i.exec(s);
  if (!m) { const a = adresNorm('eth', s); return a ? { ag: 'eth', adres: a } : null; }
  const ag = AG_LLAMA[m[1].toLowerCase()];
  if (!ag) return { ag: null, zincir: m[1].toLowerCase(), adres: null };
  const a = adresNorm(ag, m[2]);
  return a ? { ag, adres: a } : null;
}

// ── Keşif yanıtı ayrıştırıcıları (SAF) ───────────────────────────────────
/**
 * Binance spot + USDⓈ-M exchangeInfo → Map taban → { taban, spot, perp, carpan, hamSpot, hamPerp } (yalnız TRADING USDT;
 * USDⓈ-M'de yalnız PERPETUAL — TRADIFI_PERPETUAL girmez). Çarpan öneki (1000SATS, 1MBABYDOGE) spot ve perp'te aynı
 * biçimde ayıklanır → tek token (EK-2 / denetim 9).
 */
function binanceTabanlari(spotJ, perpJ) {
  const m = new Map();
  const yer = (t) => m.get(t) || (m.set(t, { taban: t, spot: null, perp: null, carpan: null, hamSpot: null, hamPerp: null }), m.get(t));
  for (const s of (spotJ && Array.isArray(spotJ.symbols) ? spotJ.symbols : [])) {
    if (s.status !== 'TRADING' || s.quoteAsset !== 'USDT' || !/^[A-Z0-9]{1,20}$/.test(s.baseAsset || '')) continue;
    const p = perpTaban(s.baseAsset);
    const x = yer(p.taban); x.spot = s.symbol; x.hamSpot = s.baseAsset; if (p.carpan) x.spotCarpan = p.carpan;
  }
  for (const s of (perpJ && Array.isArray(perpJ.symbols) ? perpJ.symbols : [])) {
    if (s.status !== 'TRADING' || s.quoteAsset !== 'USDT' || s.contractType !== 'PERPETUAL' || !/^[A-Z0-9]{1,24}$/.test(s.baseAsset || '')) continue;
    const p = perpTaban(s.baseAsset);
    const x = yer(p.taban); x.perp = s.symbol; x.carpan = p.carpan; x.hamPerp = s.baseAsset;
    if (s.onboardDate) x.perpOnboard = new Date(Number(s.onboardDate)).toISOString().slice(0, 10);
  }
  return m;
}

/** 24 s ticker dizisi → Map sembol → quoteVolume (USDT). */
const tickerHacim = (j) => new Map((Array.isArray(j) ? j : []).filter(x => x && x.symbol).map(x => [x.symbol, sayi(x.quoteVolume)]));

/** GeckoTerminal trending/new pools (include=base_token) → [{ ag, adres, sembol, ad, cgId, havuzLikidite, havuzHacim24, havuzKurulus }]. */
function geckoHavuzlari(j, ag) {
  const tok = new Map((j && Array.isArray(j.included) ? j.included : []).filter(x => x && x.type === 'token').map(x => [x.id, x.attributes || {}]));
  const out = [];
  for (const p of (j && Array.isArray(j.data) ? j.data : [])) {
    const a = p.attributes || {};
    const bid = p.relationships && p.relationships.base_token && p.relationships.base_token.data && p.relationships.base_token.data.id;
    const t = tok.get(bid) || {};
    const adres = adresNorm(ag, t.address || (bid ? String(bid).replace(/^[^_]+_/, '') : null));
    if (!adres) continue;
    out.push({ ag, adres, sembol: temizMetin(t.symbol, 24), ad: temizMetin(t.name, 60), cgId: temizMetin(t.coingecko_coin_id, 80) || null,
      havuzLikidite: sayi(a.reserve_in_usd), havuzHacim24: sayi(a.volume_usd && a.volume_usd.h24), havuzKurulus: a.pool_created_at ? String(a.pool_created_at).slice(0, 10) : null });
  }
  return out;
}

/** DexScreener token-profiles / token-boosts → [{ ag|null, zincir, adres, tutar? }] (açıklama/bağlantı metni ALINMAZ). */
function dexListesi(j) {
  const out = [];
  for (const x of (Array.isArray(j) ? j : [])) {
    if (!x || !x.chainId || !x.tokenAddress) continue;
    const ag = AG_DEX[x.chainId] || null;
    out.push({ ag, zincir: temizMetin(x.chainId, 30), adres: ag ? adresNorm(ag, x.tokenAddress) : temizMetin(x.tokenAddress, 80), tutar: sayi(x.amount), toplamTutar: sayi(x.totalAmount) });
  }
  return out;
}

/** CoinGecko search/trending → [{ cgId, sembol, ad, sira }]. */
const cgTrend = (j) => (j && Array.isArray(j.coins) ? j.coins : []).map(c => c && c.item).filter(Boolean)
  .map(i => ({ cgId: temizMetin(i.id, 80), sembol: temizMetin(i.symbol, 24), ad: temizMetin(i.name, 60), sira: sayi(i.market_cap_rank) }));

/**
 * DexScreener tokens/v1 çift dizisi → Map adres → toplamlar (yalnız istenen adresler; taban ya da karşı token olarak).
 * `ciftler` (2026-10-20): çift başına likidite, büyükten ilk 20 — { adres: pairAddress, dex, lik }. DexScreener her çağrıda
 * değişen bir çift alt kümesi döndürdüğü için K11 (kural-v1.1) yalnız iki günde de görülen çiftleri karşılaştırır; anlık.jsonl
 * satırı bunu taşır ki ertesi gece kıyaslanabilsin. toplamLikidite evren eşiği ve gösterim içindir (değişmedi).
 */
function dexToplamlari(ciftler, ag, adresler) {
  const ist = new Set(adresler);
  const norm = (a) => adresNorm(ag, a);
  const m = new Map();
  for (const p of (Array.isArray(ciftler) ? ciftler : [])) {
    if (!p || !p.baseToken || !p.quoteToken) continue;
    for (const [rol, tk] of [['taban', p.baseToken], ['karsi', p.quoteToken]]) {
      const a = norm(tk.address);
      if (!a || !ist.has(a)) continue;
      const x = m.get(a) || { ciftSayisi: 0, toplamLikidite: 0, hacim24: 0, ilkCift: null, boostAktif: 0, fiyat: null, fdv: null, piyasaDegeri: null, enLikit: null, siteVar: false, site: null, sembol: null, ad: null, ciftler: [] };
      const lik = sayi(p.liquidity && p.liquidity.usd) || 0;
      if (p.pairAddress) x.ciftler.push({ adres: temizMetin(p.pairAddress, 80), dex: temizMetin(p.dexId, 30), lik });
      x.ciftSayisi++; x.toplamLikidite += lik; x.hacim24 += sayi(p.volume && p.volume.h24) || 0;
      const t = sayi(p.pairCreatedAt);
      if (t > 0) { const g = new Date(t).toISOString().slice(0, 10); if (!x.ilkCift || g < x.ilkCift) x.ilkCift = g; }
      x.boostAktif = Math.max(x.boostAktif, sayi(p.boosts && p.boosts.active) || 0);
      if (p.info && Array.isArray(p.info.websites) && p.info.websites.length) {
        x.siteVar = true;
        // Alan adı (RDAP / K16): taban token'ın çiftindeki ilk site — yalnız kayıt edilebilir alan adı saklanır, metin değil
        if (rol === 'taban' && !x.site) { const w = p.info.websites.find(v => v && v.url); const a = w ? alanAdiCikar(String(w.url)) : null; if (a && /^[a-z0-9.-]{3,80}$/.test(a)) x.site = a; }
      }
      if (rol === 'taban' && (!x.enLikit || lik > x.enLikit.likidite)) {
        x.enLikit = { dex: temizMetin(p.dexId, 30), cift: temizMetin(p.pairAddress, 80), likidite: lik, karsi: temizMetin(p.quoteToken.symbol, 20) };
        x.fiyat = sayi(p.priceUsd); x.fdv = sayi(p.fdv); x.piyasaDegeri = sayi(p.marketCap);
        x.sembol = temizMetin(tk.symbol, 24); x.ad = temizMetin(tk.name, 60);
      }
      m.set(a, x);
    }
  }
  for (const x of m.values()) {
    x.toplamLikidite = Math.round(x.toplamLikidite * 100) / 100;
    x.ciftler = x.ciftler.sort((a, b) => b.lik - a.lik || a.adres.localeCompare(b.adres)).slice(0, 20).map(c => ({ ...c, lik: Math.round(c.lik * 100) / 100 }));
  }
  return m;
}

// ── Karar (SAF) ──────────────────────────────────────────────────────────
/** Son 7 kayıt günü medyanı: gecmis = önceki günlerin değerleri (en eskiden yeniye), bugun dahil edilir. */
function medyan7(gecmis, bugun) {
  const seri = [...(gecmis || []), bugun].filter(v => Number.isFinite(v)).slice(-MEDYAN_GUN);
  return { medyan: seri.length ? medyan(seri) : null, gun: seri.length };
}
const gunFark = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/**
 * Eşik dışı şartlar → { karar: 'girdi'|'elendi', nedenler, taban, isinma }.
 * @param a aday { kanat, ag, haric, olcum: { hacim7Medyan, gecmisGun, likidite, ilkCift, cexIlkGorulme, eski } }, @param gun 'YYYY-MM-DD'
 *   taban   = taban eşikleriyle geçer mi (yalnız izleme kümesi için; KARAR DEĞİL)
 *   isinma  = yalnız "geçmiş < 3 gün" yüzünden elendi ve mevcut günlerle tabanı geçiyor (ham görüntü yine alınır)
 */
function evrenKarari(a, gun) {
  const n = [];
  const o = a.olcum || {};
  if (a.haric) n.push({ kod: `haric-${a.haric.kod}`, metin: a.haric.metin });
  if (a.kanat === 'dex' && !DEX_AGLAR.includes(a.ag)) n.push({ kod: 'ag-disi', metin: `ağ listesi dışı (${a.ag || a.zincir || 'bilinmiyor'}; evren-v1: ${DEX_AGLAR.join(', ')})` });
  if (a.kanat === 'cex') {
    if (o.borsaDurum === 'listede-yok') n.push({ kod: 'cex-listede-yok', metin: 'bugün Binance spot/USDⓈ-M listesinde TRADING USDT paritesi yok (delist olabilir)' });
    else if (o.borsaDurum === 'liste-alinamadi') n.push({ kod: 'cex-bilinmiyor', metin: 'Binance exchangeInfo bugün alınamadı (bilinmiyor)' });
    if (!o.eski && !o.cexIlkGorulme) n.push({ kod: 'yas-bilinmiyor', metin: 'Binance ilk görülme bilinmiyor (spot + USDⓈ-M listesinin ikisi birden henüz alınamadı)' });
    else if (!o.eski && o.cexIlkGorulme && gunFark(o.cexIlkGorulme, gun) < YAS_GUN) n.push({ kod: 'yas', metin: `Binance'te ilk görülme ${o.cexIlkGorulme} (< ${YAS_GUN} g)` });
  } else if (!o.ilkCift) n.push({ kod: 'yas-olculemedi', metin: 'ilk çift tarihi yok (DexScreener / GeckoTerminal)' });
  else if (gunFark(o.ilkCift, gun) < YAS_GUN) n.push({ kod: 'yas', metin: `ilk çift ${o.ilkCift} (< ${YAS_GUN} g)` });
  if (a.kanat === 'dex' && !(Number.isFinite(o.likidite))) n.push({ kod: 'likidite-yok', metin: 'DEX likiditesi ölçülemedi (DexScreener çift yok, GeckoTerminal rezerv yok)' });
  if (!Number.isFinite(o.hacim7Medyan)) n.push(/hata|alinamadi/.test(String(o.hacimKaynak || '')) ? { kod: 'hacim-bilinmiyor', metin: `hacim kaynağı bugün alınamadı (${o.hacimKaynak})` } : { kod: 'hacim-yok', metin: 'hacim ölçülemedi' });
  const gecmisAz = (o.gecmisGun || 0) < MIN_GECMIS;
  const digerleri = n.length;
  if (gecmisAz) n.push({ kod: 'gecmis-az', metin: `${o.gecmisGun || 0} kayıt günü geçmiş (< ${MIN_GECMIS}; A5)` });
  const t = a.kanat === 'cex' ? TABAN.cex : TABAN.dex;
  const taban = Number.isFinite(o.hacim7Medyan) && o.hacim7Medyan >= t && (a.kanat === 'cex' || (Number.isFinite(o.likidite) && o.likidite >= t));
  return { karar: n.length ? 'elendi' : 'girdi', nedenler: n, taban, isinma: gecmisAz && digerleri === 0 && taban };
}

/**
 * Çok zincirli token'ın zinciri: mevcut sabit eşleme varsa ONU döner (asla değiştirmez); yoksa likiditesi en yüksek
 * zincir, likidite bilgisi yoksa AG_ONCELIK sırası. @param secenek [{ ag, adres, likidite|null }]
 */
function zincirSec(mevcut, secenek) {
  if (mevcut) return { ...mevcut, yeni: false };
  const s = (secenek || []).filter(x => x && x.ag && x.adres);
  if (!s.length) return null;
  const likitli = s.filter(x => Number.isFinite(x.likidite) && x.likidite > 0).sort((a, b) => b.likidite - a.likidite || AG_ONCELIK.indexOf(a.ag) - AG_ONCELIK.indexOf(b.ag));
  if (likitli.length) return { ag: likitli[0].ag, adres: likitli[0].adres, yontem: 'dexscreener-en-yuksek-likidite', likidite: likitli[0].likidite, yeni: true };
  const sirali = [...s].sort((a, b) => (AG_ONCELIK.indexOf(a.ag) + 99 * (AG_ONCELIK.indexOf(a.ag) < 0)) - (AG_ONCELIK.indexOf(b.ag) + 99 * (AG_ONCELIK.indexOf(b.ag) < 0)));
  return { ag: sirali[0].ag, adres: sirali[0].adres, yontem: 'likidite-yok-oncelik-sirasi', likidite: null, yeni: true };
}

// ── Eşik sabitleme (SAF; §1.4) — scripts/evren-esik-sabitle.js çağırır, F1'de ÇALIŞTIRILMAZ ──────────────────
/**
 * @param gunler [{ gun, satirlar: [evren satırı] }] — YALNIZ resmî kayıt günleri, tarih sıralı.
 * @returns { tamam: false, neden } | { tamam: true, kullanilan: [gun], V_cex, L_dex, V_dex, tablo: { cex: [{esik, ortalama}], dex: [...] } }
 * Kural: ilk 30 resmî kayıt günü (EK-2 sonrası; kesintisiz olup olmadığı yalnız bilgi). Aday = eşik dışı şartlardan geçen (karar 'girdi')
 * satır. V_cex = ortalama günlük CEX evrenini ≤ 200 yapan en küçük ızgara değeri (taban 100 bin); L_dex = V_dex aynı kural
 * (taban 50 bin). İleri getiri / fiyat değişimi HESAPLANMAZ — fonksiyon yalnız likidite ve 7 g medyan hacme bakar.
 */
function esikHesapla(gunler) {
  const g = (gunler || []).filter(x => x && x.gun).sort((a, b) => a.gun.localeCompare(b.gun));
  if (g.length < ESIK_GUN) return { tamam: false, neden: `${g.length} resmî kayıt günü var; eşik sabitleme için ${ESIK_GUN} gerekir (PLAN-DIKKAT-V1-ONKAYIT §1.4)` };
  // EK-2 / denetim 10: her zaman İLK 30 resmî kayıt günü (kesintisizlik yalnız bilgi).
  const secim = g.slice(0, ESIK_GUN);
  let kesintisiz = true;
  for (let k = 1; k < secim.length; k++) if (gunFark(secim[k - 1].gun, secim[k].gun) !== 1) { kesintisiz = false; break; }
  const ort = (kanat, esik) => {
    let top = 0;
    for (const d of secim) top += d.satirlar.filter(r => r.kanat === kanat && r.karar === 'girdi' && r.olcum && Number.isFinite(r.olcum.hacim7Medyan) && r.olcum.hacim7Medyan >= esik
      && (kanat === 'cex' || (Number.isFinite(r.olcum.likidite) && r.olcum.likidite >= esik))).length;
    return top / secim.length;
  };
  const tablo = { cex: [], dex: [] };
  let V_cex = null, L_dex = null;
  for (const e of IZGARA) {
    if (e >= TABAN.cex) { const o = ort('cex', e); tablo.cex.push({ esik: e, ortalama: Math.round(o * 10) / 10 }); if (V_cex == null && o <= HEDEF_EVREN) V_cex = e; }
    if (e >= TABAN.dex) { const o = ort('dex', e); tablo.dex.push({ esik: e, ortalama: Math.round(o * 10) / 10 }); if (L_dex == null && o <= HEDEF_EVREN) L_dex = e; }
  }
  if (V_cex == null || L_dex == null) return { tamam: false, neden: 'ızgaranın en büyük değeri bile ortalama evreni ≤ 200 yapmıyor — elle inceleme gerekir', tablo };
  return { tamam: true, kesintisiz, kullanilan: secim.map(x => x.gun), V_cex, L_dex, V_dex: L_dex, tablo };
}

module.exports = {
  EVREN_SURUM, ESIKLER_V1, DEX_AGLAR, IZGARA, TABAN, HEDEF_EVREN, ESIK_GUN, MIN_GECMIS, MEDYAN_GUN, YAS_GUN, IZLEME_GUN, HARIC_V1,
  AG_DEX, AG_GECKO, AG_CG, AG_LLAMA, AG_ONCELIK,
  haricNeden, adresNorm, dexAnahtar, cexAnahtar, perpTaban, llamaAdres, binanceTabanlari, tickerHacim, geckoHavuzlari, dexListesi, cgTrend,
  dexToplamlari, medyan7, gunFark, evrenKarari, zincirSec, esikHesapla,
};
