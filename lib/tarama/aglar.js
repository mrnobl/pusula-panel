/**
 * COIN TARAMA — ağ (zincir) eşlemesi ve başlangıç izleme listesi.
 *
 * Her ağ için kaynakların kendi kimliği: GoPlus zincir no'su, DexScreener / GeckoTerminal ağ adı, CoinGecko platformu.
 * Solana'da GoPlus yerine RugCheck. Kendi zincirindeki coinlerde (TAO) zincir üstü anahtarsız kaynak yok —
 * yalnız borsa fiyatı ve (varsa) alan adı.
 */
'use strict';

const AGLAR = Object.freeze({
  eth: { ad: 'Ethereum', goplus: '1', dex: 'ethereum', gecko: 'eth', cg: 'ethereum', evm: true },
  bsc: { ad: 'BNB Chain', goplus: '56', dex: 'bsc', gecko: 'bsc', cg: 'binance-smart-chain', evm: true },
  base: { ad: 'Base', goplus: '8453', dex: 'base', gecko: 'base', cg: 'base', evm: true },
  arbitrum: { ad: 'Arbitrum', goplus: '42161', dex: 'arbitrum', gecko: 'arbitrum', cg: 'arbitrum-one', evm: true },
  polygon: { ad: 'Polygon', goplus: '137', dex: 'polygon', gecko: 'polygon_pos', cg: 'polygon-pos', evm: true },
  optimism: { ad: 'Optimism', goplus: '10', dex: 'optimism', gecko: 'optimism', cg: 'optimistic-ethereum', evm: true },
  avalanche: { ad: 'Avalanche C', goplus: '43114', dex: 'avalanche', gecko: 'avax', cg: 'avalanche', evm: true },
  sol: { ad: 'Solana', rugcheck: true, dex: 'solana', gecko: 'solana', cg: 'solana', evm: false },
  diger: { ad: 'Kendi zinciri / diğer', evm: false },
});

const BORSALAR = Object.freeze(['binance', 'bybit', 'okx', 'gate']);
const PIYASALAR = Object.freeze(['spot', 'perp']);

/**
 * Başlangıç izleme listesi: arkadaşın Temmuz 2026 listesi (ANALIZ-TEMMUZ-LISTESI.md §1 eşlemesi; tam sözleşmeler
 * scripts/temmuz-listesi-zincir.js'ten). Fiyat kaynağı analizdekiyle aynı (LIT = Lighter → Binance PERP; Binance'teki
 * LITUSDT spot eski Litentry). Alan adı: DexScreener'da site bilgisi olmayan coinler için projenin bilinen sitesi ELLE yazıldı
 * (2026-10-08; RDAP canlı denemesinde doğrulandı ya da TLD RDAP sunmuyor); olmayanlar DexScreener site bilgisinden türetilir.
 * Hepsi panelden (Tarama ayarları) düzeltilebilir.
 */
const TEMMUZ_KAYNAK = 'temmuz-2026';
const BASLANGIC_IZLEME = Object.freeze([
  { sembol: 'TAO', ad: 'Bittensor', ag: 'diger', sozlesme: null, fiyat: { borsa: 'binance', piyasa: 'spot', sembol: 'TAOUSDT' }, alanAdi: 'bittensor.com', belirsizlik: 'Kendi L1 zinciri: holder/ilk 10 anahtarsız kaynakta yok (taostats anahtarlı).' },
  { sembol: 'MNT', ad: 'Mantle', ag: 'eth', sozlesme: '0x3c3a81e81dc49a522a592e7622a7e711c06bf354', fiyat: { borsa: 'bybit', piyasa: 'spot', sembol: 'MNTUSDT' }, alanAdi: 'mantle.xyz', belirsizlik: 'Mantle L2 yerel token; ölçülen yalnız Ethereum ERC-20 tarafı (holder toplamı göstermez). Binance\'te yok.' },
  { sembol: 'MET', ad: 'Meteora', ag: 'sol', sozlesme: 'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL', fiyat: { borsa: 'binance', piyasa: 'spot', sembol: 'METUSDT' }, alanAdi: 'meteora.ag', belirsizlik: 'Metronome (MET, ETH) aynı sembol; arkadaş Solana dediği için Meteora varsayıldı.' },
  { sembol: 'NES', ad: 'Nesa', ag: 'eth', sozlesme: '0x863f08a3d3b14fbd3d42ffd061d0e290f7dbc538', fiyat: { borsa: 'okx', piyasa: 'spot', sembol: 'NES-USDT' }, alanAdi: 'nesa.ai', belirsizlik: 'Çok zincirli (ETH + BSC 0x097acf27503753e77bca940277806156c5925b81); burada ETH sözleşmesi. Binance\'te yok.' },
  { sembol: 'CLANKER', ad: 'tokenbot', ag: 'base', sozlesme: '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb', fiyat: { borsa: 'binance', piyasa: 'perp', sembol: 'CLANKERUSDT' }, belirsizlik: 'CoinGecko\'da CLANKER sembollü 3 kayıt; borsalardaki = tokenbot (CG tokenbot-2). Fiyat Binance perp (spot yok).' },
  { sembol: 'PENDLE', ad: 'Pendle', ag: 'eth', sozlesme: '0x808507121b80c02388fad14726482e061b8da827', fiyat: { borsa: 'binance', piyasa: 'spot', sembol: 'PENDLEUSDT' }, alanAdi: 'pendle.finance', belirsizlik: 'Çok zincirli; ETH sözleşmesi.' },
  { sembol: 'SPK', ad: 'Spark', ag: 'eth', sozlesme: '0xc20059e0317de91738d13af027dfc4a50781b066', fiyat: { borsa: 'binance', piyasa: 'spot', sembol: 'SPKUSDT' }, belirsizlik: null },
  { sembol: 'AIXBT', ad: 'aixbt by Virtuals', ag: 'base', sozlesme: '0x4f9fd6be4a90f2620860d680c0d4d5fb53d1a825', fiyat: { borsa: 'binance', piyasa: 'spot', sembol: 'AIXBTUSDT' }, belirsizlik: null },
  { sembol: 'ONDO', ad: 'Ondo Finance', ag: 'eth', sozlesme: '0xfaba6f8e4a5e8ab82f62fe7c39859fa577269be3', fiyat: { borsa: 'binance', piyasa: 'spot', sembol: 'ONDOUSDT' }, alanAdi: 'ondo.finance', belirsizlik: null },
  { sembol: 'LIT', ad: 'Lighter', ag: 'eth', sozlesme: '0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2', fiyat: { borsa: 'binance', piyasa: 'perp', sembol: 'LITUSDT' }, alanAdi: 'lighter.xyz', belirsizlik: 'Binance\'teki LITUSDT SPOT eski Litentry — fiyat Binance PERP (Lighter).' },
  { sembol: 'UNI', ad: 'Uniswap', ag: 'eth', sozlesme: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', fiyat: { borsa: 'binance', piyasa: 'spot', sembol: 'UNIUSDT' }, alanAdi: 'uniswap.org', belirsizlik: null },
  { sembol: 'SYRUP', ad: 'Maple / syrup', ag: 'eth', sozlesme: '0x643c4e15d7d62ad0abec4a9bd4b001aa3ef52d66', fiyat: { borsa: 'binance', piyasa: 'spot', sembol: 'SYRUPUSDT' }, alanAdi: 'maple.finance', belirsizlik: null },
  { sembol: 'ESP', ad: 'Espresso', ag: 'eth', sozlesme: '0x031de51f3e8016514bd0963d0b2ab825a591db9a', fiyat: { borsa: 'binance', piyasa: 'spot', sembol: 'ESPUSDT' }, alanAdi: 'espressosys.com', belirsizlik: 'spain-coin (ESP) aynı sembollü önemsiz token.' },
  { sembol: 'ZAMA', ad: 'Zama', ag: 'eth', sozlesme: '0xa12cc123ba206d4031d1c7f6223d1c2ec249f4f3', fiyat: { borsa: 'binance', piyasa: 'spot', sembol: 'ZAMAUSDT' }, belirsizlik: null },
  { sembol: 'RE', ad: 'Re (re.xyz)', ag: 'eth', sozlesme: '0x526526528f35ac738177003b8773b402b8df8143', fiyat: { borsa: 'binance', piyasa: 'spot', sembol: 'REUSDT' }, alanAdi: 're.xyz', belirsizlik: 'Binance\'te listeden ~2 hafta önce listelendi (2026-06-18).' },
]);

/** Coin kimliği: sembol + ağ (+ sözleşme başı) — aynı sembollü iki token karışmasın. */
function coinId(c) {
  const s = String(c.sembol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const a = String(c.ag || 'diger').toLowerCase();
  const z = c.sozlesme ? '-' + String(c.sozlesme).replace(/^0x/i, '').slice(0, 6).toLowerCase() : '';
  return `${s}-${a}${z}`;
}

module.exports = { AGLAR, BORSALAR, PIYASALAR, BASLANGIC_IZLEME, TEMMUZ_KAYNAK, coinId };
