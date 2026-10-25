'use strict';
/**
 * A4 — ALT HESAPLAR ARASI AKTARIM: borsa bağdaştırıcısı (TASARIM-MAKINE-HESAP-BOT §8.2; kullanıcı kararı "onaylı alt hesap aktarımı,
 * çekim izni kapalı").
 * ═══════════════════════════════════════════════════════════════════════════
 * KESİN KURAL — PUSULA DIŞ ADRESE PARA ÇEKMEZ. Bu dosya yalnız aynı borsa hesabının KENDİ ana / alt hesapları ve cüzdanları arasında
 * aktarım yapan uçları çağırır; çağrılar `cagir` üzerinden geçer ve yalnız IZINLI listesindeki yöntemler çağrılabilir (adında
 * "withdraw" geçen hiçbir yöntem listeye giremez — `cagir` ayrıca reddeder). Para çekme izni AÇIK anahtarla hiçbir aktarım yapılmaz
 * (her aktarımdan önce izinler borsadan YENİDEN okunur — `izinOku`).
 *
 *   Binance (ana hesabın "aktarım" anahtarı):
 *     · ana ↔ alt, alt ↔ alt (spot / USDⓈ-M vadeli): POST /sapi/v1/sub-account/universalTransfer (clientTranId ile — belirsiz cevapta
 *       aynı kimlikle SORGULANIR, körlemesine tekrar yok). Gereken izin: "Enable Internal Transfer" (apiRestrictions.enableInternalTransfer).
 *       Alt hesap e-postası Binance'te o ana hesabın alt hesabı değilse borsa reddeder — uç dış adrese para gönderemez.
 *     · ana hesabın kendi spot ↔ vadeli: POST /sapi/v1/asset/transfer (MAIN_UMFUTURE / UMFUTURE_MAIN). Gereken izin "Permits Universal
 *       Transfer". Sorgu: GET /sapi/v1/asset/transfer (tutar + zaman penceresi).
 *     · alt hesabın KENDİ spot ↔ vadeli: bu sürümde YOK (açık soru).
 *   OKX (ana hesabın anahtarı; bağdaştırıcı `hazir: false` iken canlı kipte reddedilir): POST /api/v5/asset/transfer (clientId ile),
 *     ana ↔ alt (type 1 / 2), ana içi (type 0); alt ↔ alt iki adımda (önce ana). Sorgu GET /api/v5/asset/transfer-state.
 * Hata sınıfı: ağ / zaman aşımı / bakım / hız → BELIRSIZ (para gitmiş olabilir → sorgu); diğerleri → RED (kesin, para gitmedi).
 * Bu dosya canlı kümede DEĞİL (lib/live dışında; bot kodu çağırmaz). Gerçek istemci yalnız canlı kipte kurulur; testler sahte borsayla
 * (lib/aktarim/sahte.js).
 */

const IZINLI = Object.freeze({
  binance: Object.freeze(['sapiGetAccountApiRestrictions', 'sapiPostSubAccountUniversalTransfer', 'sapiGetSubAccountUniversalTransfer', 'sapiPostAssetTransfer', 'sapiGetAssetTransfer']),
  okx: Object.freeze(['privateGetAccountConfig', 'privatePostAssetTransfer', 'privateGetAssetTransferState']),
});
const YASAK = /withdraw/i;
const BELIRSIZ_ADLAR = new Set(['NetworkError', 'RequestTimeout', 'ExchangeNotAvailable', 'OnMaintenance', 'DDoSProtection', 'RateLimitExceeded', 'InvalidNonce', 'OperationFailed']);
const CUZDANLAR = Object.freeze(['spot', 'vadeli']);
const BINANCE_HESAP = { spot: 'SPOT', vadeli: 'USDT_FUTURE' };
const OKX_HESAP = { spot: '6', vadeli: '18' };   // 6 = fonlama hesabı, 18 = işlem hesabı
const ZAMAN_PAYI = 10 * 60e3;

/** Yalnız izinli yöntem; adında withdraw geçen yöntem asla. */
async function cagir(borsa, b, yontem, params) {
  const l = IZINLI[borsa];
  if (!l || !l.includes(yontem) || YASAK.test(yontem)) throw Object.assign(new Error(`aktarım bağdaştırıcısı: "${yontem}" çağrılamaz (izinli liste dışında)`), { kod: 'yasak' });
  if (!b || typeof b[yontem] !== 'function') throw Object.assign(new Error(`borsa istemcisinde ${yontem} yok`), { kod: 'yontem-yok' });
  return b[yontem](params);
}

/** ccxt hatası → 'BELIRSIZ' | 'RED'. Sınıf zincirindeki adlara bakar (gerçek ccxt ve sahte hata aynı yoldan). */
function hataSinifi(e) {
  if (!e) return 'RED';
  if (e.belirsiz === true) return 'BELIRSIZ';
  const adlar = new Set([e.name]);
  for (let p = Object.getPrototypeOf(e); p && p.constructor && p.constructor !== Object; p = Object.getPrototypeOf(p)) adlar.add(p.constructor.name);
  for (const a of adlar) if (BELIRSIZ_ADLAR.has(a)) return 'BELIRSIZ';
  return 'RED';
}

const evet = (v) => v === true || v === 'true';

/**
 * İzinler (salt okuma). @returns { cekme: bool|null, ic: bool|null (alt hesap aktarımı), evrensel: bool|null (ana spot↔vadeli), islem: bool|null, ham }
 * Okunamazsa hata atar (aktarım yapılmaz).
 */
async function izinOku(borsa, b) {
  if (borsa === 'binance') {
    const r = await cagir(borsa, b, 'sapiGetAccountApiRestrictions', {});
    if (!r || typeof r !== 'object') throw new Error('Binance anahtar izinleri okunamadı (boş cevap)');
    return { cekme: evet(r.enableWithdrawals), ic: evet(r.enableInternalTransfer), evrensel: evet(r.permitsUniversalTransfer),
      islem: evet(r.enableFutures) || evet(r.enableSpotAndMarginTrading), ipKisit: evet(r.ipRestrict) };
  }
  if (borsa === 'okx') {
    const r = await cagir(borsa, b, 'privateGetAccountConfig', {});
    const perm = String(((r && r.data && r.data[0]) || {}).perm || '');
    if (!perm) throw new Error('OKX anahtar izinleri okunamadı (perm boş)');
    const l = perm.split(',').map(x => x.trim());
    return { cekme: l.includes('withdraw'), ic: l.includes('trade'), evrensel: l.includes('trade'), islem: l.includes('trade'), ipKisit: null };
  }
  throw new Error(`aktarım bu borsada yok: ${String(borsa).slice(0, 12)}`);
}

/** İzinler aktarım için uygun mu → engel metni | null. `gerek`: 'ic' | 'evrensel'. */
function izinEngeli(iz, gerek) {
  if (!iz) return 'anahtar izinleri okunamadı — aktarım yapılmaz';
  if (iz.cekme !== false) return 'aktarım anahtarında PARA ÇEKME izni açık (ya da okunamadı) — aktarım yapılmaz; borsada çekme iznini kapatın';
  if (gerek === 'ic' && iz.ic !== true) return 'aktarım anahtarında alt hesap aktarım izni ("Enable Internal Transfer") kapalı';
  if (gerek === 'evrensel' && iz.evrensel !== true) return 'aktarım anahtarında ana hesap spot ↔ vadeli aktarım izni ("Permits Universal Transfer") kapalı';
  return null;
}

/** İstemci kimliği (Binance clientTranId / OKX clientId): yalnız harf + rakam, ≤ 32. */
const istemciKimligi = (id) => `pa${String(id).replace(/[^a-z0-9]/gi, '')}`.slice(0, 32);
const miktar = (t) => (Math.floor(+t * 100) / 100).toFixed(2);

/**
 * Plan: iki uç → çağrı. uc = { tur: 'ana' | 'alt', adres (Binance e-posta / OKX alt hesap adı; anada null), cuzdan: 'spot' | 'vadeli' }.
 * @returns { yontem, params, gerek: 'ic'|'evrensel', sorgu: { yontem, params }, aciklama } — uygun değilse hata (kod 'plan').
 */
function planla(borsa, kaynak, hedef, tutar, id, simdi = Date.now()) {
  const red = (m) => { throw Object.assign(new Error(m), { kod: 'plan' }); };
  for (const u of [kaynak, hedef]) {
    if (!u || !['ana', 'alt'].includes(u.tur) || !CUZDANLAR.includes(u.cuzdan)) red('aktarım ucu geçersiz');
    if (u.tur === 'alt' && !(typeof u.adres === 'string' && u.adres.length >= 3 && u.adres.length <= 64)) red('alt hesabın adresi (e-posta / alt hesap adı) Anahtarlar\'da kayıtlı değil');
  }
  const ayni = kaynak.tur === hedef.tur && (kaynak.tur === 'ana' || kaynak.adres === hedef.adres);
  if (ayni && kaynak.cuzdan === hedef.cuzdan) red('kaynak ve hedef aynı cüzdan');
  const ck = istemciKimligi(id);
  const m = miktar(tutar);
  if (!(+m > 0)) red('tutar geçersiz');
  if (borsa === 'binance') {
    if (ayni && kaynak.tur === 'ana') {
      const type = kaynak.cuzdan === 'spot' ? 'MAIN_UMFUTURE' : 'UMFUTURE_MAIN';
      return { yontem: 'sapiPostAssetTransfer', params: { type, asset: 'USDT', amount: m }, gerek: 'evrensel',
        sorgu: { yontem: 'sapiGetAssetTransfer', params: { type, startTime: simdi - ZAMAN_PAYI, endTime: simdi + ZAMAN_PAYI, size: 100 }, eslesme: { amount: m } },
        aciklama: `ana hesap içinde ${kaynak.cuzdan} → ${hedef.cuzdan}` };
    }
    if (ayni) red('alt hesabın kendi spot ↔ vadeli aktarımı bu sürümde yok');
    const p = { fromAccountType: BINANCE_HESAP[kaynak.cuzdan], toAccountType: BINANCE_HESAP[hedef.cuzdan], asset: 'USDT', amount: m, clientTranId: ck };
    if (kaynak.tur === 'alt') p.fromEmail = kaynak.adres;
    if (hedef.tur === 'alt') p.toEmail = hedef.adres;
    const sp = { clientTranId: ck, startTime: simdi - ZAMAN_PAYI, endTime: simdi + ZAMAN_PAYI };
    if (p.fromEmail) sp.fromEmail = p.fromEmail;
    if (p.toEmail) sp.toEmail = p.toEmail;
    return { yontem: 'sapiPostSubAccountUniversalTransfer', params: p, gerek: 'ic', sorgu: { yontem: 'sapiGetSubAccountUniversalTransfer', params: sp, eslesme: { clientTranId: ck } },
      aciklama: 'alt hesap evrensel aktarımı (yalnız aynı ana hesabın alt hesapları)' };
  }
  if (borsa === 'okx') {
    if (kaynak.tur === 'alt' && hedef.tur === 'alt') red('OKX\'te alt → alt aktarım iki adımda yapılır: önce ana hesaba, sonra öbür alt hesaba');
    const p = { ccy: 'USDT', amt: m, from: OKX_HESAP[kaynak.cuzdan], to: OKX_HESAP[hedef.cuzdan], clientId: ck };
    if (kaynak.tur === 'ana' && hedef.tur === 'ana') p.type = '0';
    else if (kaynak.tur === 'ana') { p.type = '1'; p.subAcct = hedef.adres; p.to = '18'; }
    else { p.type = '2'; p.subAcct = kaynak.adres; p.from = '18'; }
    return { yontem: 'privatePostAssetTransfer', params: p, gerek: 'ic', sorgu: { yontem: 'privateGetAssetTransferState', params: { clientId: ck, type: p.type }, eslesme: { clientId: ck } },
      aciklama: p.type === '0' ? 'ana hesap içi aktarım' : 'ana ↔ alt hesap aktarımı' };
  }
  return red(`aktarım bu borsada yok: ${String(borsa).slice(0, 12)}`);
}

/** Aktarım çağrısı. @returns { durum: 'TAMAM' | 'BELIRSIZ' | 'RED', borsaKimlik, hata } */
async function aktar(borsa, b, plan) {
  try {
    const r = await cagir(borsa, b, plan.yontem, plan.params);
    if (borsa === 'okx') {
      const d = (r && r.data && r.data[0]) || {};
      if (r && r.code != null && String(r.code) !== '0') return { durum: 'RED', borsaKimlik: null, hata: `OKX ${String(r.code).slice(0, 8)}: ${String(r.msg || '').slice(0, 120)}` };
      return { durum: d.transId ? 'TAMAM' : 'BELIRSIZ', borsaKimlik: d.transId ? String(d.transId) : null, hata: d.transId ? null : 'cevapta aktarım kimliği yok — sorgulanacak' };
    }
    const tran = r && (r.tranId != null ? r.tranId : null);
    return { durum: tran != null ? 'TAMAM' : 'BELIRSIZ', borsaKimlik: tran != null ? String(tran) : null, hata: tran != null ? null : 'cevapta aktarım kimliği yok — sorgulanacak' };
  } catch (e) {
    return { durum: hataSinifi(e), borsaKimlik: null, hata: String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 200) };
  }
}

/**
 * Belirsiz aktarımın borsadan sorgusu (salt okuma; körlemesine tekrar YOK). @returns { durum: 'TAMAM'|'RED'|'BELIRSIZ', borsaKimlik, hata }
 * Binance evrensel: clientTranId eşleşmesi + status. Binance ana içi: aynı tür + tutar + zaman penceresi (tek eşleşme şart).
 * OKX: clientId → state success / failed / pending.
 */
async function sorgula(borsa, b, plan, bilinenKimlikler = []) {
  try {
    const r = await cagir(borsa, b, plan.sorgu.yontem, plan.sorgu.params);
    if (borsa === 'okx') {
      const d = (r && r.data && r.data[0]) || null;
      if (!d) return { durum: 'RED', borsaKimlik: null, hata: 'borsada bu kimlikle aktarım yok' };
      const s = String(d.state || '').toLowerCase();
      if (s === 'success') return { durum: 'TAMAM', borsaKimlik: d.transId ? String(d.transId) : null, hata: null };
      if (s === 'failed') return { durum: 'RED', borsaKimlik: null, hata: 'borsa aktarımı başarısız bildirdi' };
      return { durum: 'BELIRSIZ', borsaKimlik: null, hata: `borsada durum "${s.slice(0, 20) || '?'}" — sonra yeniden sorgulayın` };
    }
    if (plan.sorgu.yontem === 'sapiGetSubAccountUniversalTransfer') {
      const l = (r && Array.isArray(r.result) ? r.result : Array.isArray(r) ? r : []).filter(x => x && x.clientTranId === plan.sorgu.eslesme.clientTranId);
      if (!l.length) return { durum: 'RED', borsaKimlik: null, hata: 'borsada bu kimlikle aktarım yok' };
      const x = l[0];
      const s = String(x.status || 'SUCCESS').toUpperCase();
      if (s === 'SUCCESS') return { durum: 'TAMAM', borsaKimlik: x.tranId != null ? String(x.tranId) : null, hata: null };
      if (s === 'FAILURE' || s === 'FAILED') return { durum: 'RED', borsaKimlik: null, hata: 'borsa aktarımı başarısız bildirdi' };
      return { durum: 'BELIRSIZ', borsaKimlik: null, hata: `borsada durum "${s.slice(0, 20)}" — sonra yeniden sorgulayın` };
    }
    const l = (r && Array.isArray(r.rows) ? r.rows : []).filter(x => x && miktar(x.amount) === plan.sorgu.eslesme.amount && String(x.asset || 'USDT') === 'USDT'
      && !bilinenKimlikler.includes(String(x.tranId)));
    if (l.length === 1) return { durum: String(l[0].status || 'CONFIRMED').toUpperCase() === 'CONFIRMED' ? 'TAMAM' : 'BELIRSIZ', borsaKimlik: String(l[0].tranId), hata: null };
    if (!l.length) return { durum: 'RED', borsaKimlik: null, hata: 'borsada bu tutarda aktarım yok' };
    return { durum: 'BELIRSIZ', borsaKimlik: null, hata: `aynı tutarda ${l.length} aktarım var — borsada (Transfer History) elle bakın` };
  } catch (e) {
    return { durum: 'BELIRSIZ', borsaKimlik: null, hata: `sorgu yapılamadı: ${String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 160)}` };
  }
}

/** Gerçek istemci (yalnız canlı kipte; testte enjekte edilir). Anahtar dışarı verilmez. */
function istemciKur(borsa, anahtar, o = {}) {
  const ccxt = o.ccxt || require('ccxt');
  if (borsa === 'binance') return new ccxt.binance({ apiKey: anahtar.apiKey, secret: anahtar.apiSecret, enableRateLimit: true, options: { adjustForTimeDifference: true } });
  if (borsa === 'okx') return new ccxt.okx({ apiKey: anahtar.apiKey, secret: anahtar.apiSecret, password: anahtar.parola, enableRateLimit: true });
  throw new Error(`aktarım bu borsada yok: ${String(borsa).slice(0, 12)}`);
}

module.exports = { IZINLI, YASAK, CUZDANLAR, cagir, hataSinifi, izinOku, izinEngeli, planla, aktar, sorgula, istemciKur, istemciKimligi, miktar };
