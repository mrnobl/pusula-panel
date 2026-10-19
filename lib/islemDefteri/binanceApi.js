/**
 * İŞLEM DEFTERİ — BINANCE SALT OKUMA EŞİTLEMESİ (sürüm 65.0; OKX'teki okxApi.js'in Binance karşılığı). EMİR VERMEZ: yalnız
 * aşağıdaki UC listesindeki GET uçları çağrılır (başka yol imzalanmaz). Bot kodu (lib/live) ve bot anahtarları (apiKey /
 * testnetApiKey) KULLANILMAZ: anahtar data/secrets.json `islemDefteri.binance[<hesap>]` altında ayrı tutulur.
 * Belge: https://developers.binance.com/docs/binance-spot-api-docs/rest-api (SIGNED uçlar: HMAC-SHA256 onaltılık imza, timestamp +
 * recvWindow, X-MBX-APIKEY; IP ağırlığı X-MBX-USED-WEIGHT-1M) · Wallet › Get API Key Permission (/sapi/v1/account/apiRestrictions) ·
 * Spot › Account trade list (/api/v3/myTrades) · USDⓈ-M Futures › Account Trade List (/fapi/v1/userTrades) ve Get Income History
 * (/fapi/v1/income).
 *
 *   imza(gizli, sorgu)        hex(HMAC-SHA256(gizli, sorgu))   (sorgu = "a=1&b=2&recvWindow=…&timestamp=…")
 *   izinOku(anahtar, ops)     GET /sapi/v1/account/apiRestrictions → izinDegerlendir
 *   izinDegerlendir(j)        → { durum: 'salt-okuma' | 'yasak' | 'okuma-yok', izinler: [true olan alanlar], yasaklar: [...] }
 *        YALNIZ enableReading true olmalı; enableReading, enableFixReadOnly ve ipRestrict dışında true olan HERHANGİ bir alan (çekim,
 *        iç aktarım, spot/marjin işlem, vadeli, opsiyon, evrensel aktarım, portföy marjin… ve Binance'in ileride ekleyeceği tanınmayan
 *        her izin) → 'yasak'. OKX'teki read_only kuralıyla aynı ruh: kuşkuda reddet. Elle onay YOK.
 *   vadeliDene(anahtar, ops)  GET /fapi/v1/income?limit=1 — salt okuma anahtarının vadeli okumasını Binance kabul ediyor mu?
 *        (DOĞRULANMADI: Binance read-only anahtarla fapi USER_DATA uçlarının açık olup olmadığını belgede açıkça yazmıyor; sonuç
 *        anahtar kaydında ve kartta açıkça yazılır, sessizce geçilmez.)
 *   esitle({ anahtar, hesapId, D, imlec, tamTarama, … })  → { kayitlar, ozet, imlec }
 *
 * VADELİ (USDⓈ-M): income (fonlama, gerçekleşen kâr, komisyon, aktarım, tasfiye… — ice/binance.js HAREKET_ESLE ile aynı eşleme;
 *   kaynakId "tx:<tranId>:<tür>:<para>" = Transaction History dosyasının kimliği) + userTrades (dolumlar; kaynakId
 *   "t:<sembol>:<id>" = Trade History dosyasının "Trade ID" kimliği). İkisi de en çok 7 günlük pencereyle sorulur; income son
 *   GELIR_DERINLIK_GUN, userTrades son ISLEM_DERINLIK_GUN günü verir (Binance belgesi; DOĞRULANMADI — eski pencere hata verirse
 *   kartta uyarı olur). userTrades sembol ister: income'da görülen semboller + son 30 günde görülen semboller + defterde bu
 *   hesabın derinlik içindeki vadeli sembolleri. Artımlı: imlec.vadeli.gelirSon / islemSon (son eşitlemede kapsanan an; bir saat
 *   örtüşmeyle — çiftler depo.iceAktarPlan'da düşer). Vadeli yetki hatası (anahtar fapi'yi kabul etmezse) eşitlemeyi DURDURMAZ:
 *   özet.vadeliRed + uyarı ("vadeli okuma için Binance bu anahtarı kabul etmedi: …"), spot sürer.
 * SPOT: myTrades sembol başına, fromId ile TÜM geçmiş. İlk TAM TARAMA: exchangeInfo'daki (durumu ne olursa olsun — TRADING, BREAK…;
 *   exchangeInfo'da olmayan delist çiftler atlanır) SPOT_KOTASYONLAR kotasyonlu çiftler, eşitleme başına en çok spotCiftTavan çift
 *   (kaldığı yer imlec.spot.tarama.i; kartta "spot tam tarama: 412 / 1630 çift"). Sonraki eşitlemelerde yalnız işlem görülen
 *   (imlec.spot.semboller: sonId) + bakiyesi olan semboller; TAM_TARAMA_GUN günde bir tarama yeniden başlar (iki eşitleme
 *   arasında alınıp tamamen satılan yeni bir coin böyle yakalanır).
 * AĞIRLIK: her yanıtın X-MBX-USED-WEIGHT-1M başlığı okunur (aynı IP'yi kullanan bot da sayılır); spot dakikada AGIRLIK_TAVAN.api
 *   (6000 sınırının altında), vadeli AGIRLIK_TAVAN.fapi (2400 sınırının altında) aşılacaksa bir sonraki dakikaya kadar beklenir.
 *   429 → Retry-After kadar bekle (en çok 3 kez); 418 → dur. Saat farkı: /api/v3/time ile düzeltilir; -1021 bir kez yeniden eşitler.
 * Anahtar nesnesi { apiKey, secret } YALNIZ bu modülün içinde kullanılır; hiçbir yanıta, kayda, günlüğe yazılmaz. Hata mesajları
 * SABİT metin + Binance'in kodu (guvenliMesaj): fetch / undici hatasının e.message'ı asla dışarı verilmez; Binance'in kendi "msg"i
 * yalnız yazdırılabilir ASCII, 32+ karakterlik harf/rakam dizileri silinmiş, 120 karakter.
 */
'use strict';
const crypto = require('crypto');
const M = require('./model');
const MT = require('./metin');
const { HAREKET_ESLE } = require('./ice/binance');

const TABAN = { api: 'https://api.binance.com', fapi: 'https://fapi.binance.com' };
/** kova: ağırlık sayacı ('api' spot + sapi'nin IP ağırlığı ayrı başlıkta, 'fapi' vadeli). */
const UC = {
  zaman: { taban: 'api', yol: '/api/v3/time', agirlik: 1, imzali: false, kova: 'api' },
  borsaBilgi: { taban: 'api', yol: '/api/v3/exchangeInfo', agirlik: 20, imzali: false, kova: 'api' },
  izin: { taban: 'api', yol: '/sapi/v1/account/apiRestrictions', agirlik: 1, imzali: true, kova: 'sapi' },
  hesap: { taban: 'api', yol: '/api/v3/account', agirlik: 20, imzali: true, kova: 'api' },
  spotIslem: { taban: 'api', yol: '/api/v3/myTrades', agirlik: 20, imzali: true, kova: 'api' },
  gelir: { taban: 'fapi', yol: '/fapi/v1/income', agirlik: 30, imzali: true, kova: 'fapi' },
  vadeliIslem: { taban: 'fapi', yol: '/fapi/v1/userTrades', agirlik: 5, imzali: true, kova: 'fapi' },
  // Yeni panel F4 (K-E) bakiye: bütün spot fiyatları (imzasız) + USDⓈ-M vadeli hesap özeti (lib/islemDefteri/bakiye.js)
  fiyatlar: { taban: 'api', yol: '/api/v3/ticker/price', agirlik: 4, imzali: false, kova: 'api' },
  vadeliHesap: { taban: 'fapi', yol: '/fapi/v2/account', agirlik: 5, imzali: true, kova: 'fapi' }
};
const AGIRLIK_TAVAN = { api: 4800, fapi: 1800, sapi: 10000 };
const AGIRLIK_BASLIK = { api: 'x-mbx-used-weight-1m', fapi: 'x-mbx-used-weight-1m', sapi: 'x-sapi-used-ip-weight-1m' };
const RECV_WINDOW = 10000;
const GUN = 864e5;
const PENCERE_MS = 7 * GUN - 1000;      // Binance: startTime–endTime en çok 7 gün
const GELIR_DERINLIK_GUN = 90;          // income: son 3 ay (belge; DOĞRULANMADI)
const ISLEM_DERINLIK_GUN = 180;         // userTrades: son 6 ay (belge; DOĞRULANMADI)
const DERINLIK_PAYI_MS = 3600e3;        // derinlik sınırına bir saat pay (sınırda hata vermesin)
const ORTUSME_MS = 3600e3;              // artımlı eşitlemede bir saat geriden başla (çiftler planda düşer)
const SEMBOL_HATIRLA_GUN = 30;          // son 30 günde görülen vadeli semboller her eşitlemede sorulur
const SAYFA = 1000;
const SPOT_KOTASYONLAR = ['USDT', 'USDC', 'FDUSD', 'BTC', 'BNB', 'TRY'];
const SPOT_CIFT_TAVAN = 400;            // tek eşitlemede taranan en çok çift (≈ 8 000 ağırlık ≈ 2 dk)
const TAM_TARAMA_GUN = 30;
const YETKI_KODLARI = new Set([-2015, -2014, -2008, -1022, -1002, -2017, -2018]);

const imza = (gizli, sorgu) => crypto.createHmac('sha256', String(gizli)).update(String(sorgu)).digest('hex');

/** Yalnız harf/rakam (HTTP başlık değeri olabilecek; Binance HMAC anahtarı ve gizlisi 64 harf/rakam). Mesajda değer YOK. */
function anahtarBicimi(a) {
  if (!a || typeof a !== 'object') return 'anahtar yok';
  const k = String(a.apiKey == null ? '' : a.apiKey).trim(), g = String(a.secret == null ? '' : a.secret).trim();
  if (!/^[A-Za-z0-9]{32,128}$/.test(k)) return 'API Key biçimi geçersiz (Binance: 64 harf/rakam; boşluk ya da başka işaret olamaz)';
  if (!/^[A-Za-z0-9]{32,128}$/.test(g)) return 'Secret Key biçimi geçersiz (Binance: 64 harf/rakam; boşluk ya da başka işaret olamaz)';
  return null;
}

const guvenliHata = (mesaj, ek = {}) => Object.assign(new Error(mesaj), { binanceGuvenli: true }, ek);
const guvenliMesaj = (e) => (e && e.binanceGuvenli ? e.message : `beklenmeyen hata (${(e && e.name) || 'Error'})`);
/** Binance'in "msg"i: yazdırılabilir ASCII, uzun harf/rakam dizileri (anahtar olabilir) silinir, 120 karakter. */
const msgTemizle = (m) => String(m == null ? '' : m).replace(/[^\x20-\x7E]/g, '').replace(/[A-Za-z0-9]{32,}/g, '…').slice(0, 120).trim();
const KOD_ACIKLAMA = {
  '-2015': 'API Key, IP ya da izin geçersiz (anahtarda IP kısıtı varsa bu bilgisayarın IP adresi listede mi?)',
  '-2014': 'API Key biçimi geçersiz', '-2008': 'API Key geçersiz', '-1022': 'imza geçersiz (Secret Key yanlış)',
  '-1021': 'saat farkı (bilgisayarın saatini eşitleyin)', '-1003': 'istek sınırı aşıldı — biraz sonra yeniden', '-1121': 'sembol geçersiz',
  '-1002': 'yetki yok', '-4164': 'pencere geçersiz'
};

const IZIN_SERBEST = new Set(['enableReading', 'enableFixReadOnly', 'ipRestrict']);
const IZIN_AD = {
  enableReading: 'okuma', enableFixReadOnly: 'FIX okuma', ipRestrict: 'IP kısıtlı', enableWithdrawals: 'ÇEKİM', enableInternalTransfer: 'İÇ AKTARIM',
  enableSpotAndMarginTrading: 'SPOT/MARJİN İŞLEM', enableFutures: 'VADELİ İŞLEM', enableMargin: 'MARJİN', enableVanillaOptions: 'OPSİYON',
  permitsUniversalTransfer: 'EVRENSEL AKTARIM', enablePortfolioMarginTrading: 'PORTFÖY MARJİN İŞLEM', enableFixApiTrade: 'FIX İŞLEM'
};
const izinAdi = (k) => IZIN_AD[k] || String(k).replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);

function izinDegerlendir(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { durum: 'okuma-yok', izinler: [], yasaklar: [] };
  const acik = Object.entries(j).filter(([, v]) => v === true || v === 'true').map(([k]) => k);
  const yasaklar = acik.filter(k => !IZIN_SERBEST.has(k));
  const izinler = acik.map(izinAdi);
  if (yasaklar.length) return { durum: 'yasak', izinler, yasaklar: yasaklar.map(izinAdi), ipKisitli: acik.includes('ipRestrict') };
  if (!acik.includes('enableReading')) return { durum: 'okuma-yok', izinler, yasaklar: [], ipKisitli: acik.includes('ipRestrict') };
  return { durum: 'salt-okuma', izinler, yasaklar: [], ipKisitli: acik.includes('ipRestrict') };
}

const bekleVarsayilan = (ms) => new Promise(r => setTimeout(r, ms));

/** Dakikalık ağırlık sayacı (kova başına). Başlık varsa onun değeri esas (aynı IP'deki bot da sayılır). */
function sinirlayici({ simdi, bekle, ozet, tavan = AGIRLIK_TAVAN }) {
  const k = {};
  for (const ad of Object.keys(AGIRLIK_TAVAN)) k[ad] = { tavan: (tavan && tavan[ad]) || AGIRLIK_TAVAN[ad], kullanilan: 0, dakika: null };
  return {
    async once(kova, w) {
      const s = k[kova];
      const t = simdi(), dk = Math.floor(t / 60000);
      if (s.dakika !== dk) { s.dakika = dk; s.kullanilan = 0; }
      if (s.kullanilan + w > s.tavan) {
        const ms = (dk + 1) * 60000 - t + 1000;
        ozet.bekleme++; ozet.bekleMs += ms;
        await bekle(ms);
        s.dakika = Math.floor(simdi() / 60000); s.kullanilan = 0;
      }
      s.kullanilan += w;
      ozet.agirlik[kova] = (ozet.agirlik[kova] || 0) + w;
    },
    sonra(kova, deger) {
      const n = Number(deger);
      if (deger != null && deger !== '' && Number.isFinite(n)) { k[kova].kullanilan = Math.max(k[kova].kullanilan, n); k[kova].dakika = Math.floor(simdi() / 60000); }
    },
    durum: () => k
  };
}

function baglam(ops = {}) {
  const ozet = ops.ozet || { istek: 0, bekleme: 0, bekleMs: 0, agirlik: {} };
  const simdi = ops.simdi || (() => Date.now());
  const bekle = ops.bekle || bekleVarsayilan;
  const c = { fetch: ops.fetch, simdi, bekle, ozet, fark: 0, sinir: ops.sinir || sinirlayici({ simdi, bekle, ozet, tavan: ops.agirlikTavan }) };
  c.saatEsitle = async () => {
    const t0 = simdi();
    const j = await getir(null, 'zaman', null, { ...c, saatEsitle: null });
    const st = Number(j && j.serverTime);
    if (Number.isFinite(st)) c.fark = st - Math.round((t0 + simdi()) / 2);
    return c.fark;
  };
  c.borsaSimdi = () => simdi() + c.fark;
  return c;
}

/**
 * Binance kimlikleri JSON'da SAYI olarak gelir ve 2^53'ü aşabilir (income "tranId": 855932607051448440 — gerçek hareket dosyasındaki
 * Transaction ID). JSON.parse yuvarlar → dosyanın kimliğiyle eşleşmez → fonlama iki kez sayılırdı. Bu alanlar ayrıştırmadan ÖNCE metne çevrilir.
 */
const kimlikMetne = (metin) => String(metin).replace(/"(tranId|tradeId|id|orderId|fromId)"\s*:\s*(-?\d+)(?=\s*[,}\]])/g, '"$1":"$2"');
const baslikOku = (r, ad) => { try { return r && r.headers && typeof r.headers.get === 'function' ? r.headers.get(ad) : null; } catch (e) { return null; } };

/** Tek GET (yalnız UC listesindeki uçlar). İmzalı uçta timestamp (saat farkı düzeltilmiş) + recvWindow + signature. */
async function getir(anahtar, ad, params, c) {
  const u = UC[ad];
  if (!u) throw guvenliHata('izin verilmeyen Binance yolu');
  if (u.imzali) { const b = anahtarBicimi(anahtar); if (b) throw guvenliHata(`Binance anahtarı geçersiz: ${b}`); }
  const fetchFn = c.fetch || ((...a) => globalThis.fetch(...a));
  for (let deneme = 0; ; deneme++) {
    await c.sinir.once(u.kova, u.agirlik);
    let qs = Object.entries(params || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const basliklar = { accept: 'application/json' };
    if (u.imzali) {
      qs += `${qs ? '&' : ''}recvWindow=${RECV_WINDOW}&timestamp=${Math.round(c.simdi() + (c.fark || 0))}`;
      qs += `&signature=${imza(String(anahtar.secret).trim(), qs)}`;
      basliklar['X-MBX-APIKEY'] = String(anahtar.apiKey).trim();
    }
    let r, metin;
    try {
      r = await fetchFn(`${TABAN[u.taban]}${u.yol}${qs ? `?${qs}` : ''}`, {
        method: 'GET', headers: basliklar,
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined
      });
      metin = await r.text();
    } catch (e) {
      // undici başlık hatası değeri (anahtarı) içerebilir → yalnız hata adı
      throw guvenliHata(`Binance'e bağlanılamadı (${(e && e.name) || 'Error'})`);
    }
    c.ozet.istek++;
    c.sinir.sonra(u.kova, baslikOku(r, AGIRLIK_BASLIK[u.kova]));
    const durum = Number(r.status) || 0;
    if (durum === 418) throw guvenliHata('Binance bu IP adresini geçici olarak engelledi (HTTP 418, çok istek) — birkaç saat sonra yeniden deneyin', { binanceKod: 418, http: 418 });
    if (durum === 429 && deneme < 3) {
      const sn = Math.min(300, Math.max(1, Number(baslikOku(r, 'retry-after')) || 60));
      c.ozet.bekleme++; c.ozet.bekleMs += sn * 1000;
      await c.bekle(sn * 1000);
      continue;
    }
    let j = null;
    try { j = JSON.parse(kimlikMetne(metin)); } catch (e) { throw guvenliHata(`Binance yanıtı okunamadı (HTTP ${durum || '?'})`, { http: durum }); }
    const hataNesnesi = j && typeof j === 'object' && !Array.isArray(j) && j.code != null && Number(j.code) < 0;
    if (!r.ok || hataNesnesi) {
      const kod = j && j.code != null && /^-?\d{1,6}$/.test(String(j.code)) ? Number(j.code) : null;
      if (kod === -1021 && deneme < 1 && c.saatEsitle) { await c.saatEsitle(); continue; }
      const ac = kod != null ? KOD_ACIKLAMA[String(kod)] : null;
      const msg = msgTemizle(j && j.msg);
      throw guvenliHata(`Binance reddetti (${kod != null ? `kod ${kod}` : `HTTP ${durum || '?'}`}${ac ? `: ${ac}` : ''}${msg ? ` — "${msg}"` : ''})`,
        { binanceKod: kod, http: durum, yetki: (kod != null && YETKI_KODLARI.has(kod)) || durum === 401 || durum === 403 });
    }
    return j;
  }
}

async function izinOku(anahtar, ops = {}) {
  const c = ops.c || baglam(ops);
  if (!ops.c) await c.saatEsitle();
  const j = await getir(anahtar, 'izin', null, c);
  return izinDegerlendir(j);
}

/** Vadeli okuma denemesi (income, limit 1). { kabul: true } ya da { kabul: false, hata }. Ağ hatası da açıkça yazılır. */
async function vadeliDene(anahtar, ops = {}) {
  const c = ops.c || baglam(ops);
  if (!ops.c) await c.saatEsitle();
  try { await getir(anahtar, 'gelir', { limit: 1 }, c); return { kabul: true }; } catch (e) { return { kabul: false, hata: guvenliMesaj(e), yetki: !!e.yetki }; }
}

const pozYon = (p) => (String(p).toUpperCase() === 'LONG' ? 'long' : String(p).toUpperCase() === 'SHORT' ? 'short' : null);

/** userTrades satırı → normal kayıt. kaynakId "t:<sembol>:<id>" = Binance vadeli Trade History dosyasının "Trade ID" kimliği. */
function vadeliDolumKaydi(t) {
  const s = M.binanceSembol(t.symbol, true);
  return {
    tur: 'islem', islemTuru: 'dolum', kaynak: 'binance-api', kaynakId: `t:${s.sembol}:${t.id}`, zaman: Number(t.time), sembol: s.sembol, piyasa: 'vadeli',
    yon: String(t.side).toUpperCase() === 'BUY' ? 'al' : 'sat', miktar: Math.abs(MT.sayi(t.qty) || 0), fiyat: MT.sayi(t.price) || 0,
    ucret: { tutar: MT.sayi(t.commission) || 0, para: String(t.commissionAsset || s.para || '').toUpperCase() },
    gerceklesenKar: MT.sayi(t.realizedPnl), pozisyonYonu: pozYon(t.positionSide), pozisyonId: null, para: s.para,
    ham: MT.hamKisalt({ symbol: t.symbol, id: t.id, orderId: t.orderId, side: t.side, positionSide: t.positionSide, price: t.price, qty: t.qty, quoteQty: t.quoteQty,
      realizedPnl: t.realizedPnl, commission: t.commission, commissionAsset: t.commissionAsset, maker: t.maker, time: t.time })
  };
}

/** myTrades satırı → normal kayıt (bilgi: exchangeInfo'dan { b, q }). kaynakId "t:<sembol>:<id>"; spot dosyasında kimlik yok → benzerlik eşlemesi. */
function spotDolumKaydi(t, bilgi) {
  const s = bilgi && bilgi.b && bilgi.q ? { sembol: `${bilgi.b}/${bilgi.q}`, para: bilgi.q } : M.binanceSembol(t.symbol, false);
  return {
    tur: 'islem', islemTuru: 'dolum', kaynak: 'binance-api', kaynakId: `t:${s.sembol}:${t.id}`, zaman: Number(t.time), sembol: s.sembol, piyasa: 'spot',
    yon: t.isBuyer === true || t.isBuyer === 'true' ? 'al' : 'sat', miktar: Math.abs(MT.sayi(t.qty) || 0), fiyat: MT.sayi(t.price) || 0,
    ucret: { tutar: Math.abs(MT.sayi(t.commission) || 0), para: String(t.commissionAsset || s.para || '').toUpperCase() }, gerceklesenKar: null, para: s.para,
    ham: MT.hamKisalt({ symbol: t.symbol, id: t.id, orderId: t.orderId, price: t.price, qty: t.qty, quoteQty: t.quoteQty, commission: t.commission,
      commissionAsset: t.commissionAsset, isBuyer: t.isBuyer, isMaker: t.isMaker, time: t.time })
  };
}

/** income satırı → normal kayıt ya da null (tanınmayan tür). kaynakId "tx:<tranId>:<tür>:<para>" = Transaction History dosyasının kimliği. */
function gelirKaydi(g) {
  const tip = String(g.incomeType || '').trim().toUpperCase().replace(/\s+/g, '_');
  const e = HAREKET_ESLE[tip];
  const tutar = MT.sayi(g.income);
  if (!e || tutar == null || tutar === 0) return null;
  const para = String(g.asset || '').trim().toUpperCase();
  const sembolHam = String(g.symbol || '').trim();
  const s = sembolHam ? M.binanceSembol(sembolHam, true) : { sembol: null };
  const kimlik = g.tranId != null && String(g.tranId).trim() ? String(g.tranId).trim() : null;
  return {
    tur: e === 'akis' ? (tutar > 0 ? 'para-giris' : 'para-cikis') : e, kaynak: 'binance-api',
    kaynakId: kimlik ? `tx:${kimlik}:${tip}:${para}` : `gelir:${tip}:${Number(g.time)}:${para}:${sembolHam}:${tutar}`,
    zaman: Number(g.time), sembol: e === 'akis' ? null : s.sembol, piyasa: 'vadeli', para, tutar, not: tip,
    ham: MT.hamKisalt({ symbol: g.symbol, incomeType: g.incomeType, income: g.income, asset: g.asset, info: g.info, time: g.time, tranId: g.tranId, tradeId: g.tradeId })
  };
}

/** Defterdeki vadeli sembol ("BTC/USDT:USDT") → Binance USDⓈ-M sembolü ("BTCUSDT"); ters (coin) sözleşme ya da tarihli → null. */
function fapiSembol(sembol) {
  const m = /^([A-Z0-9]+)\/([A-Z0-9]+):([A-Z0-9]+)$/.exec(String(sembol || ''));
  if (!m || m[2] !== m[3]) return null;
  return m[1] + m[2];
}

/** [bas, bit] aralığını en çok 7 günlük pencerelere böler (artan sırada). */
function pencereler(bas, bit, uzunluk = PENCERE_MS) {
  const l = [];
  for (let s = bas; s < bit; s += uzunluk + 1) l.push([s, Math.min(bit, s + uzunluk)]);
  return l;
}

/**
 * Pencere içinde sayfalama: startTime/endTime + limit 1000; dolu sayfa gelirse son satırın zamanından devam (kimliğe göre tekil).
 * Hepsi aynı milisaniyede 1000 satır (olanaksıza yakın) → 1 ms ileri + uyarı.
 */
async function pencereTara(anahtar, ad, sabit, [bas, bit], kimlikOf, c, uyar) {
  const out = [], gorulen = new Set();
  let s = bas;
  for (let n = 0; n < 1000; n++) {
    const d = await getir(anahtar, ad, { ...sabit, startTime: s, endTime: bit, limit: SAYFA }, c);
    const l = Array.isArray(d) ? d : [];
    for (const x of l) { const k = kimlikOf(x); if (!gorulen.has(k)) { gorulen.add(k); out.push(x); } }
    if (l.length < SAYFA) break;
    const son = Number(l[l.length - 1].time);
    if (!Number.isFinite(son)) break;
    if (son <= s) { uyar(`${ad}: aynı milisaniyede ${SAYFA} satır — 1 ms ileri atlandı`); s = s + 1; } else s = son;
    if (s >= bit) break;
  }
  return out;
}

/**
 * Eşitleme. D: depo durumu (yalnız bu hesabın defterdeki vadeli sembolleri için; çift denetimi depo.iceAktarPlan'da). imlec: önceki
 * eşitlemenin { vadeli, spot }'u (binance-durum.json; api.js saklar). tamTarama: vadelide derinliğin tamamı, spotta bilinen
 * semboller fromId 0'dan (dosya geri alınınca / sunucu satırları reddedince).
 */
async function esitle({ anahtar, hesapId, D, fetch, simdi, bekle = bekleVarsayilan, log = () => {}, imlec = null, tamTarama = false,
  spotCiftTavan = SPOT_CIFT_TAVAN, agirlikTavan = null }) {
  const ozet = { istek: 0, bekleme: 0, bekleMs: 0, agirlik: {}, vadeliDolum: 0, gelir: 0, spotDolum: 0, atlanan: 0, atlananTur: {}, uyarilar: [],
    vadeliRed: null, spotRed: null, tarama: null, vadeliSembol: 0, spotSembol: 0 };
  const c = baglam({ fetch, simdi, bekle, ozet, agirlikTavan });
  const uyar = (m) => { if (!ozet.uyarilar.includes(m)) ozet.uyarilar.push(m); };
  const eski = imlec && typeof imlec === 'object' ? imlec : {};
  const yeni = { vadeli: { ...(eski.vadeli || {}) }, spot: { ...(eski.spot || {}) } };
  const kayitlar = [];
  await c.saatEsitle();
  const simdiB = c.borsaSimdi();

  // ── VADELİ ──────────────────────────────────────────────────────────────
  const v = yeni.vadeli;
  const vSem = { ...(v.semboller || {}) };
  vadeli: {
    const gelirTaban = simdiB - GELIR_DERINLIK_GUN * GUN + DERINLIK_PAYI_MS;
    const gelirBas = Math.max(gelirTaban, !tamTarama && Number.isFinite(v.gelirSon) ? v.gelirSon - ORTUSME_MS : gelirTaban);
    let gelirSon = simdiB;
    for (const p of pencereler(gelirBas, simdiB)) {
      let l;
      try { l = await pencereTara(anahtar, 'gelir', {}, p, (x) => `${x.tranId}|${x.incomeType}|${x.asset}|${x.time}`, c, uyar); } catch (e) {
        if (e.yetki) { ozet.vadeliRed = guvenliMesaj(e); break vadeli; }
        if (!e.binanceGuvenli) throw e;
        uyar(`Binance vadeli hareketleri ${new Date(p[0]).toISOString().slice(0, 10)} → ${new Date(p[1]).toISOString().slice(0, 10)} penceresini vermedi: ${guvenliMesaj(e)} — sonraki eşitleme buradan yeniden dener.`);
        gelirSon = p[0]; break;
      }
      for (const g of l) {
        const sh = String(g.symbol || '').trim().toUpperCase();
        if (sh) vSem[sh] = Math.max(Number(vSem[sh]) || 0, Number(g.time) || 0);
        const k = gelirKaydi(g);
        if (!k) { const t = String(g.incomeType || '?').toUpperCase(); ozet.atlananTur[t] = (ozet.atlananTur[t] || 0) + 1; ozet.atlanan++; continue; }
        kayitlar.push(k); ozet.gelir++;
      }
    }
    // userTrades: sembol zorunlu → income'da / son 30 günde görülenler + defterdeki (derinlik içindeki) vadeli semboller
    const islemTaban = simdiB - ISLEM_DERINLIK_GUN * GUN + DERINLIK_PAYI_MS;
    const islemBas = Math.max(islemTaban, !tamTarama && Number.isFinite(v.islemSon) ? v.islemSon - ORTUSME_MS : islemTaban);
    const semboller = new Set(Object.entries(vSem).filter(([, t]) => Number(t) >= Math.min(islemBas, simdiB - SEMBOL_HATIRLA_GUN * GUN)).map(([s]) => s));
    for (const k of (D && D.veri) || []) if (k.hesap === hesapId && k.piyasa === 'vadeli' && k.tur === 'islem' && k.zaman >= islemBas) { const s = fapiSembol(k.sembol); if (s) semboller.add(s); }
    ozet.vadeliSembol = semboller.size;
    let islemSon = simdiB;
    for (const sem of [...semboller].sort()) {
      for (const p of pencereler(islemBas, simdiB)) {
        let l;
        try { l = await pencereTara(anahtar, 'vadeliIslem', { symbol: sem }, p, (x) => String(x.id), c, uyar); } catch (e) {
          if (e.yetki) { ozet.vadeliRed = guvenliMesaj(e); islemSon = null; break vadeli; }
          if (!e.binanceGuvenli) throw e;
          uyar(`Binance vadeli işlemleri (${sem}) ${new Date(p[0]).toISOString().slice(0, 10)} penceresinde alınamadı: ${guvenliMesaj(e)} — sonraki eşitleme buradan yeniden dener.`);
          islemSon = Math.min(islemSon, p[0]); break;
        }
        for (const t of l) { kayitlar.push(vadeliDolumKaydi(t)); ozet.vadeliDolum++; vSem[sem] = Math.max(Number(vSem[sem]) || 0, Number(t.time) || 0); }
      }
    }
    v.gelirSon = gelirSon; v.islemSon = islemSon; v.semboller = vSem; v.red = null;
  }
  if (ozet.vadeliRed) {
    v.red = ozet.vadeliRed;
    uyar(`Vadeli okuma için Binance bu anahtarı kabul etmedi: ${ozet.vadeliRed} — vadeli işlemler ve fonlama gelmedi (spot sürdü). Vadeli geçmişi dosyayla yükleyebilirsiniz.`);
  }

  // ── SPOT ────────────────────────────────────────────────────────────────
  const sp = yeni.spot;
  const sSem = { ...(sp.semboller || {}) };   // { BTCUSDT: { b, q, sonId } }
  spot: {
    const bilgiOf = (sem) => { if (sSem[sem]) return sSem[sem]; const x = (sp.ciftler || []).find(s => s.startsWith(`${sem}|`)); if (!x) return null; const [, b, q] = x.split('|'); return { b, q }; };
    let bakiye = [];
    try {
      const h = await getir(anahtar, 'hesap', { omitZeroBalances: 'true' }, c);
      // Simple Earn esnek varlıkları "LD" önekiyle gelebilir (LDBTC) → hem kendisi hem öneksiz hâli
      bakiye = (h && Array.isArray(h.balances) ? h.balances : []).filter(b => (MT.sayi(b.free) || 0) + (MT.sayi(b.locked) || 0) > 0)
        .flatMap(b => { const a = String(b.asset || '').toUpperCase(); return /^LD[A-Z0-9]{2,}$/.test(a) ? [a, a.slice(2)] : [a]; });
    } catch (e) {
      if (e.yetki) { ozet.spotRed = guvenliMesaj(e); break spot; }
      if (!e.binanceGuvenli) throw e;
      uyar(`Binance spot bakiyesi okunamadı: ${guvenliMesaj(e)}`);
    }
    // Tam tarama başlat: hiç yapılmadıysa ya da TAM_TARAMA_GUN geçtiyse (çift listesi exchangeInfo'dan tazelenir)
    const tamEski = !sp.tamBitti || simdiB - Date.parse(sp.tamBitti) > TAM_TARAMA_GUN * GUN;
    if ((!sp.tarama && tamEski) || !Array.isArray(sp.ciftler)) {
      let bilgi;
      try { bilgi = await getir(null, 'borsaBilgi', { showPermissionSets: 'false' }, c); } catch (e) {
        if (!e.binanceGuvenli) throw e;
        uyar(`Binance çift listesi (exchangeInfo) okunamadı: ${guvenliMesaj(e)} — spot tam tarama sonraki eşitlemede.`);
        bilgi = null;
      }
      if (bilgi && Array.isArray(bilgi.symbols)) {
        const ciftler = bilgi.symbols.filter(s => s && s.symbol && SPOT_KOTASYONLAR.includes(String(s.quoteAsset || '').toUpperCase()))
          .map(s => `${String(s.symbol).toUpperCase()}|${String(s.baseAsset).toUpperCase()}|${String(s.quoteAsset).toUpperCase()}`).sort();
        sp.ciftler = ciftler;
        if (!sp.tarama && tamEski) sp.tarama = { liste: ciftler.map(x => x.split('|')[0]).filter(s => !sSem[s]), i: 0, bas: new Date(simdiB).toISOString(), n: ciftler.length };
      }
    }
    /** Bir sembolün fromId'den sonraki tüm işlemleri (sayfa sayfa). */
    const sembolTara = async (sem, fromId) => {
      const bilgi = bilgiOf(sem);
      let id = fromId, adet = 0;
      for (let n = 0; n < 10000; n++) {
        const d = await getir(anahtar, 'spotIslem', { symbol: sem, fromId: id, limit: SAYFA }, c);
        const l = Array.isArray(d) ? d : [];
        for (const t of l) { kayitlar.push(spotDolumKaydi(t, bilgi)); ozet.spotDolum++; adet++; }
        if (l.length) {
          const son = Math.max(...l.map(t => Number(t.id)).filter(Number.isFinite));
          sSem[sem] = { ...(bilgi || {}), ...(sSem[sem] || {}), sonId: son };
          id = son + 1;
        }
        if (l.length < SAYFA) break;
      }
      return adet;
    };
    // 1) artımlı: işlem görülen + bakiyesi olan semboller
    const artimli = new Set(Object.keys(sSem));
    for (const a of bakiye) for (const x of (sp.ciftler || [])) { const [s, b] = x.split('|'); if (b === a) artimli.add(s); }
    ozet.spotSembol = artimli.size;
    const taranan = new Set();   // bu eşitlemede zaten sorulan (tam tarama aynı çifti ikinci kez sormaz)
    for (const sem of [...artimli].sort()) {
      const bas = !tamTarama && sSem[sem] && Number.isFinite(Number(sSem[sem].sonId)) ? Number(sSem[sem].sonId) + 1 : 0;
      try { await sembolTara(sem, bas); taranan.add(sem); } catch (e) {
        if (e.yetki) { ozet.spotRed = guvenliMesaj(e); break spot; }
        if (!e.binanceGuvenli) throw e;
        if (e.binanceKod === -1121) continue;   // sembol artık yok (delist)
        uyar(`Binance spot işlemleri (${sem}) alınamadı: ${guvenliMesaj(e)}`);
      }
    }
    // 2) tam tarama: kaldığı yerden, eşitleme başına en çok spotCiftTavan çift
    if (sp.tarama && Array.isArray(sp.tarama.liste)) {
      const T = sp.tarama = { ...sp.tarama };
      let say = 0;
      while (T.i < T.liste.length && say < spotCiftTavan) {
        const sem = T.liste[T.i];
        if (!sSem[sem] && !taranan.has(sem)) {
          try { await sembolTara(sem, 0); } catch (e) {
            if (e.yetki) { ozet.spotRed = guvenliMesaj(e); break; }
            if (!e.binanceGuvenli) throw e;
            if (e.binanceKod !== -1121) { uyar(`Spot tam tarama ${sem} çiftinde durdu: ${guvenliMesaj(e)} — sonraki eşitleme buradan sürer.`); break; }
          }
          say++;
        }
        T.i++;
      }
      ozet.tarama = { i: T.i, n: T.liste.length, bitti: T.i >= T.liste.length };
      if (T.i >= T.liste.length) { sp.tamBitti = new Date(simdiB).toISOString(); sp.tarama = null; } else {
        uyar(`Spot tam tarama: ${T.i} / ${T.liste.length} çift — kalanı sonraki eşitlemede kaldığı yerden sürer.`);
      }
    }
    sp.semboller = sSem;
  }
  if (ozet.spotRed) uyar(`Spot okuma için Binance bu anahtarı kabul etmedi: ${ozet.spotRed}`);
  sp.semboller = sSem;
  if (ozet.vadeliRed && ozet.spotRed) throw guvenliHata(`Binance bu anahtarla okumaya izin vermedi — vadeli: ${ozet.vadeliRed}; spot: ${ozet.spotRed}`);
  const tt = Object.entries(ozet.atlananTur);
  if (tt.length) uyar(`Binance'in işlenmeyen hareket türleri atlandı: ${tt.map(([t, n]) => `${t} (${n})`).join(', ')} — performansa girmedi.`);
  if (ozet.bekleme) log('INFO', `Binance ağırlık sınırı: ${ozet.bekleme} kez beklendi (${Math.round(ozet.bekleMs / 1000)} sn)`);
  // Aynı kimlik iki kez (pencere sınırı, örtüşme) → ilk kalır
  const gorulen = new Set();
  const tekil = kayitlar.filter(k => (gorulen.has(k.kaynakId) ? false : (gorulen.add(k.kaynakId), true)));
  return { kayitlar: tekil, ozet, imlec: yeni };
}

module.exports = {
  imza, anahtarBicimi, izinDegerlendir, izinOku, vadeliDene, getir, baglam, sinirlayici, vadeliDolumKaydi, spotDolumKaydi, gelirKaydi, fapiSembol, pencereler,
  esitle, guvenliMesaj, guvenliHata, msgTemizle, kimlikMetne, UC, TABAN, AGIRLIK_TAVAN, SPOT_KOTASYONLAR, SPOT_CIFT_TAVAN, GELIR_DERINLIK_GUN, ISLEM_DERINLIK_GUN, PENCERE_MS, IZIN_AD
};
