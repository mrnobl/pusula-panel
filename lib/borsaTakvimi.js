'use strict';
/**
 * BORSA BAKIM VE DELİST TAKVİMİ (69.2, öz denetim) — Binance'in ücretsiz, anahtarsız duyuru uçları, saatte bir:
 *   sistem durumu   GET api.binance.com/sapi/v1/system/status          { status: 0 normal | 1 bakım }
 *   duyurular       GET www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=<k>&pageNo=1&pageSize=20 (en çok 20 — 30 HTTP 400)
 *                   157 = Maintenance Updates, 161 = Delisting
 *   duyuru metni    GET …/cms/article/detail/query?articleCode=<kod>    (yalnız vadeli/sistem bakımı başlıkları — saat aralığı metinde)
 * Bakım (vadeli işlem / sistem yükseltmesi): pencere içinde (10 dk önce … 15 dk sonra) botlar güvenli kipe girer, sonra çıkar.
 * Delist: botların evrenindeki bir vadeli sözleşme ya da coin çıkarılacaksa yalnız haber (evren seçimi stratejinin işi).
 * Ayrıştırıcılar saf (öz test); `getir(fetch)` ağdan okur.
 */
const BASE = 'https://www.binance.com/bapi/composite/v1/public/cms/article';
const KATALOG = { bakim: 157, delist: 161 };

/** Vadeli/sistem işlem bakımı mı (cüzdan, ağ yükseltmesi, hisse, Convert, Earn… değil)? */
function ilgiliBakim(baslik) {
  const b = String(baslik || '');
  if (/stock trading|wallet|network upgrade|hard fork|convert|earn|alpha|p2p|\bpay\b|nft|launchpool|token merge|contract swap|airdrop/i.test(b)) return false;
  return /(futures|usdⓈ-m|usds-m|derivatives|system (upgrade|maintenance)|trading engine|scheduled (system )?(upgrade|maintenance)|matching engine)/i.test(b);
}

/** Duyuru gövdesi (JSON ağaç ya da düz metin) → düz metin. */
function govdeMetni(body) {
  if (body == null) return '';
  let agac = body;
  if (typeof body === 'string') { try { agac = JSON.parse(body); } catch { return body; } }
  const out = [];
  const gez = (n) => { if (!n) return; if (Array.isArray(n)) { n.forEach(gez); return; } if (typeof n === 'object') { if (n.node === 'text' && n.text) out.push(n.text); if (n.child) gez(n.child); } };
  gez(agac);
  return out.join(' ').replace(/\s+/g, ' ');
}

/**
 * Metinden bakım penceresi (UTC). "2026-10-25 02:00 (UTC) to 2026-10-25 04:00 (UTC)", "on 2026-10-25 from 02:00 to 04:00 (UTC)",
 * "2026-10-25 02:00 - 04:00 UTC" … Bulunamazsa null.
 */
function bakimPenceresi(metin) {
  const t = String(metin || '');
  const tarih = '(\\d{4}-\\d{2}-\\d{2})', saat = '(\\d{1,2}:\\d{2})';
  const R = [
    new RegExp(`${tarih}\\s+${saat}\\s*(?:\\(?UTC\\)?)?\\s*(?:to|until|and|-|–|—)\\s*(?:${tarih}\\s+)?${saat}\\s*\\(?UTC`, 'i'),
    new RegExp(`${tarih}[^0-9]{0,40}?(?:from|between)\\s+${saat}\\s*(?:\\(?UTC\\)?)?\\s*(?:to|until|and|-|–)\\s*()${saat}\\s*\\(?UTC`, 'i'),
  ];
  for (const r of R) {
    const m = r.exec(t);
    if (!m) continue;
    const g1 = m[1], s1 = m[2], g2 = m[3] || m[1], s2 = m[4];
    const pad = (s) => s.padStart(5, '0');
    const bas = Date.parse(`${g1}T${pad(s1)}:00Z`); let bit = Date.parse(`${g2}T${pad(s2)}:00Z`);
    if (!Number.isFinite(bas) || !Number.isFinite(bit)) continue;
    if (bit <= bas) bit += 864e5;                       // gece yarısını geçen pencere
    if (bit - bas > 2 * 864e5) continue;               // anlamsız uzun
    return { bas, bit };
  }
  return null;
}

/** Delist başlığı → { vadeli: [ 'PTBUSDT', … ], spot: [ 'EPIC', … ], tarih } */
function delistAyristir(baslik) {
  const b = String(baslik || '');
  const tarihM = /(\d{4}-\d{2}-\d{2})/.exec(b);
  const sonuc = { vadeli: [], spot: [], tarih: tarihM ? tarihM[1] : null };
  if (/futures|perpetual|usdⓈ-m|usds-m/i.test(b)) {
    for (const m of b.matchAll(/\b([A-Z0-9]{2,20}USDT)\b/g)) sonuc.vadeli.push(m[1]);
  } else if (/will delist|delisting of/i.test(b)) {
    const m = /delist\s+(.+?)\s+on\s+\d{4}/i.exec(b) || /delist\s+(.+)$/i.exec(b);
    if (m) for (const p of m[1].split(/,|\band\b/)) { const s = p.trim().toUpperCase(); if (/^[A-Z0-9]{2,15}$/.test(s)) sonuc.spot.push(s); }
  }
  return sonuc;
}

/** ccxt sembolü 'ETH/USDT:USDT' → { taban: 'ETH', vadeli: 'ETHUSDT' } */
function sembolAyir(s) {
  const m = /^([A-Z0-9]+)\/USDT/.exec(String(s || ''));
  return m ? { taban: m[1], vadeli: `${m[1]}USDT` } : null;
}

/**
 * Saf: delist duyuruları × botların sembolleri → eşleşmeler [{ sembol, tarih, baslik, tur }].
 * @param delistler [{ baslik, zaman }]   @param semboller ccxt sembolleri
 */
function delistEslestir(delistler, semboller) {
  const set = (semboller || []).map(sembolAyir).filter(Boolean);
  const out = [];
  for (const d of delistler || []) {
    const a = delistAyristir(d.baslik);
    for (const s of set) {
      if (a.vadeli.includes(s.vadeli)) out.push({ sembol: s.vadeli, tarih: a.tarih, baslik: d.baslik, tur: 'vadeli' });
      else if (a.spot.includes(s.taban)) out.push({ sembol: s.taban, tarih: a.tarih, baslik: d.baslik, tur: 'spot' });
    }
  }
  return out;
}

/**
 * Ağdan okur. @param fetchFn (url, {signal}) → Response
 * @returns {{ sistem: {status, msg}|null, bakimlar: [{baslik, kod, zaman, bas, bit}], delistler: [{baslik, kod, zaman}], hatalar[] }}
 */
async function getir(fetchFn, { simdi = Date.now() } = {}) {
  const hatalar = [];
  const json = async (url) => { const r = await fetchFn(url, { signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  const liste = async (k) => {
    try {
      const j = await json(`${BASE}/list/query?type=1&catalogId=${k}&pageNo=1&pageSize=20`);
      return ((((j || {}).data || {}).catalogs || [])[0] || {}).articles || [];
    } catch (e) { hatalar.push(`duyurular (${k}): ${e.message}`); return []; }
  };
  let sistem = null;
  try { sistem = await json('https://api.binance.com/sapi/v1/system/status'); } catch (e) { hatalar.push(`sistem durumu: ${e.message}`); }
  const [bk, dl] = await Promise.all([liste(KATALOG.bakim), liste(KATALOG.delist)]);
  const bakimlar = [];
  for (const a of bk.filter(x => ilgiliBakim(x.title) && simdi - x.releaseDate < 14 * 864e5).slice(0, 5)) {
    let p = bakimPenceresi(a.title);
    if (!p) {
      try { const d = await json(`${BASE}/detail/query?articleCode=${encodeURIComponent(a.code)}`); p = bakimPenceresi(govdeMetni(d && d.data && d.data.body)); } catch (e) { hatalar.push(`bakım metni: ${e.message}`); }
    }
    bakimlar.push({ baslik: a.title, kod: a.code, zaman: a.releaseDate, bas: p ? p.bas : null, bit: p ? p.bit : null });
  }
  const delistler = dl.filter(x => simdi - x.releaseDate < 30 * 864e5).map(x => ({ baslik: x.title, kod: x.code, zaman: x.releaseDate }));
  return { sistem, bakimlar, delistler, hatalar };
}

module.exports = { getir, ilgiliBakim, govdeMetni, bakimPenceresi, delistAyristir, delistEslestir, sembolAyir, KATALOG };
