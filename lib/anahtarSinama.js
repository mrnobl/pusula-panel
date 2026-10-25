'use strict';
/**
 * ANAHTAR SINAMA (73.0, Ayarlar › Anahtarlar — lib/anahtarlar.js) — kayıtlı bir anahtarın SALT OKUMA bağlantı denemesi.
 * ═══════════════════════════════════════════════════════════════════════════
 * Hiçbir emir göndermez, hiçbir şey değiştirmez: yalnız bakiye / hesap bilgisi ve anahtarın izinleri okunur.
 *   · Binance canlı : lib/live/binanceIstemci (ccxt binanceusdm) — vadeli bakiye + apiRestrictions (para çekme izni, IP kısıtı)
 *   · Binance demo  : aynı istemci, demo trading — bakiye; izin sorgusu demo'da yok (null)
 *   · OKX           : ccxt okx — bakiye + account/config `perm` (read_only / trade / withdraw); demo = OKX simüle işlem
 *   · Bybit         : ccxt bybit — bakiye + /v5/user/query-api (permissions, readOnly); demo = Bybit demo trading
 *   · İşlem defterim anahtarları : lib/islemDefteri (okxApi / binanceApi izinOku — kendi yazdığımız salt okuma istemcisi)
 *   · Telegram      : getMe (bot adı)
 * Para çekme izni açıksa `cekmeIzni: true` (ekran kırmızı uyarı verir). Hata metninde anahtar / gizli anahtar / parola ASLA
 * yer almaz (`temizle`): ccxt ve undici bazı hatalarda istek adresini ya da başlığı metne koyabiliyor.
 * Yeni paket YOK — ccxt zaten bağımlılık (package.json değişmez).
 */

const ZAMAN_ASIMI_MS = 20000;

/** Saf: metinden sır değerlerini ve imza/anahtar kalıplarını siler, kısaltır. */
function temizle(metin, sirlar = []) {
  let m = String(metin == null ? '' : metin);
  for (const s of sirlar) {
    const v = String(s || '');
    if (v.length >= 4) m = m.split(v).join('•••');
  }
  m = m.replace(/(signature|apiKey|api_key|secret|passphrase|password|X-MBX-APIKEY|OK-ACCESS-[A-Z]+|X-BAPI-[A-Z-]+)(["'=:\s]+)[^\s&"',}]+/gi, '$1$2•••')
    .replace(/https?:\/\/api\.telegram\.org\/bot[^\s/]+/gi, 'api.telegram.org/bot•••')
    .replace(/https?:\/\/hc-ping\.com\/[^\s]+/gi, 'hc-ping.com/[…]')
    .replace(/[A-Za-z0-9_-]{40,}/g, '•••');
  return m.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function zamanli(p, ms, ne) {
  let t;
  return Promise.race([p, new Promise((_, red) => { t = setTimeout(() => red(new Error(`${ne} ${Math.round(ms / 1000)} sn içinde yanıt vermedi`)), ms); if (t.unref) t.unref(); })])
    .finally(() => clearTimeout(t));
}

/** ccxt fetchBalance → kısa özet (tutar sır değil ama yalnız toplam USDT + varlık sayısı gösterilir). */
function bakiyeOzeti(b) {
  const top = (b && b.total) || {};
  const varlik = Object.entries(top).filter(([, v]) => Number(v) > 0);
  const usdt = Number(top.USDT);
  return { varlikSayisi: varlik.length, usdt: Number.isFinite(usdt) ? Math.round(usdt * 100) / 100 : null };
}

const evet = (v) => v === true || v === 'true' || v === 1 || v === '1';

/**
 * Borsa hesabı sınaması.
 * @param h { borsa: binance|okx|bybit, tur: demo|canli, apiKey, apiSecret, parola? }
 * @param o { ccxt (test), binanceIstemci (test), zamanAsimiMs }
 * @returns { ok, bakiye, izinler: string[]|null, cekmeIzni: bool|null, ipKisitli: bool|null, saltOkuma: bool|null, uyarilar: [], hata }
 */
async function borsaSina(h, o = {}) {
  const ccxt = o.ccxt || require('ccxt');
  const ms = o.zamanAsimiMs || ZAMAN_ASIMI_MS;
  const sirlar = [h.apiKey, h.apiSecret, h.parola];
  const sonuc = { ok: false, bakiye: null, izinler: null, cekmeIzni: null, ipKisitli: null, saltOkuma: null, uyarilar: [], hata: null };
  try {
    if (!h.apiKey || !h.apiSecret) throw new Error('anahtar ya da gizli anahtar kayıtlı değil');
    if (h.borsa === 'binance') {
      const BI = o.binanceIstemci || require('./live/binanceIstemci');
      const canliMi = h.tur === 'canli' || h.tur === 'aktarim';   // A4: aktarım anahtarı ana (canlı) hesabın anahtarıdır
      const b = BI.kur({ ortam: canliMi ? 'live' : 'testnet', apiKey: h.apiKey, apiSecret: h.apiSecret, ccxtSinifi: o.ccxt ? ccxt.binanceusdm : undefined });
      sonuc.bakiye = bakiyeOzeti(await zamanli(b.fetchBalance(), ms, 'Binance'));
      if (h.tur === 'aktarim') {
        // A4: alt hesap aktarımı izni ("Enable Internal Transfer") da okunur — salt okuma, emir / aktarım YOK
        const r = typeof b.sapiGetAccountApiRestrictions === 'function' ? await zamanli(b.sapiGetAccountApiRestrictions(), ms, 'Binance') : null;
        if (r) {
          sonuc.cekmeIzni = evet(r.enableWithdrawals); sonuc.ipKisitli = evet(r.ipRestrict);
          sonuc.izinler = [evet(r.enableInternalTransfer) && 'alt hesap aktarımı', evet(r.permitsUniversalTransfer) && 'hesaplar arası aktarım', evet(r.enableFutures) && 'vadeli', evet(r.enableSpotAndMarginTrading) && 'spot/marjin işlem', evet(r.enableWithdrawals) && 'PARA ÇEKME'].filter(Boolean);
          if (!evet(r.enableInternalTransfer)) sonuc.uyarilar.push('Alt hesap aktarımı izni (Enable Internal Transfer) kapalı — Sermaye dağıtımı aktarım yapamaz.');
          if (evet(r.enableFutures) || evet(r.enableSpotAndMarginTrading)) sonuc.uyarilar.push('Aktarım anahtarında işlem izni gerekmez — kapatmanız önerilir.');
          if (!evet(r.ipRestrict)) sonuc.uyarilar.push('IP kısıtı yok — aktarım anahtarında zorunlu (Binance → API Management → IP kısıtı).');
        }
      } else if (h.tur === 'canli') {
        const iz = await zamanli(BI.anahtarIzinleri(b), ms, 'Binance');
        if (iz) {
          sonuc.cekmeIzni = !!iz.enableWithdrawals; sonuc.ipKisitli = !!iz.ipRestrict;
          sonuc.izinler = [iz.enableFutures && 'vadeli', iz.enableSpotAndMarginTrading && 'spot/marjin işlem', iz.permitsUniversalTransfer && 'hesaplar arası aktarım', iz.enableWithdrawals && 'PARA ÇEKME'].filter(Boolean);
          if (!iz.ipRestrict) sonuc.uyarilar.push('IP kısıtı yok — canlı hesapta zorunlu (Binance → API Management → IP kısıtı).');
        }
      } else sonuc.uyarilar.push('Demo hesapta izin sorgusu yok (Binance demo bunu desteklemiyor).');
    } else if (h.borsa === 'okx') {
      if (!h.parola) throw new Error('OKX için parola (passphrase) gerekli');
      const b = new ccxt.okx({ apiKey: h.apiKey, secret: h.apiSecret, password: h.parola, enableRateLimit: true });
      if (h.tur === 'demo' && typeof b.setSandboxMode === 'function') b.setSandboxMode(true);
      sonuc.bakiye = bakiyeOzeti(await zamanli(b.fetchBalance(), ms, 'OKX'));
      const c = await zamanli(b.privateGetAccountConfig(), ms, 'OKX');
      const perm = String(((c && c.data && c.data[0]) || {}).perm || '');
      const l = perm.split(',').map(x => x.trim()).filter(Boolean);
      sonuc.izinler = l.map(x => ({ read_only: 'okuma', trade: 'işlem', withdraw: 'PARA ÇEKME' }[x] || x.replace(/[^a-z0-9_]/gi, '').slice(0, 24)));
      sonuc.cekmeIzni = l.includes('withdraw');
      sonuc.saltOkuma = l.length > 0 && l.every(x => x === 'read_only');
    } else if (h.borsa === 'bybit') {
      const b = new ccxt.bybit({ apiKey: h.apiKey, secret: h.apiSecret, enableRateLimit: true });
      if (h.tur === 'demo' && typeof b.enableDemoTrading === 'function') b.enableDemoTrading(true);
      sonuc.bakiye = bakiyeOzeti(await zamanli(b.fetchBalance(), ms, 'Bybit'));
      const q = await zamanli(b.privateGetV5UserQueryApi(), ms, 'Bybit');
      const r = (q && q.result) || {};
      const izin = r.permissions && typeof r.permissions === 'object' ? r.permissions : {};
      const duz = Object.entries(izin).flatMap(([g, l]) => (Array.isArray(l) ? l.map(x => `${g}:${x}`) : []));
      sonuc.izinler = duz.map(x => (/withdraw/i.test(x) ? 'PARA ÇEKME' : x.replace(/[^a-z0-9:_]/gi, '').slice(0, 32)));
      sonuc.cekmeIzni = duz.some(x => /withdraw/i.test(x));
      sonuc.saltOkuma = evet(r.readOnly);
      if (Array.isArray(r.ips) ? !r.ips.filter(x => x && x !== '*').length : true) sonuc.uyarilar.push('IP kısıtı yok.');
    } else throw new Error(`bilinmeyen borsa: ${String(h.borsa).slice(0, 12)}`);
    sonuc.ok = true;
  } catch (e) {
    sonuc.hata = temizle(e && e.message ? e.message : e, sirlar) || 'bilinmeyen hata';
  }
  return sonuc;
}

/** İşlem defterim salt okuma anahtarı (borsa: okx | binance; a: { apiKey, secret, passphrase? }). */
async function defterSina(borsa, a, o = {}) {
  const sirlar = [a.apiKey, a.secret, a.passphrase];
  const sonuc = { ok: false, bakiye: null, izinler: null, cekmeIzni: null, ipKisitli: null, saltOkuma: null, uyarilar: [], hata: null };
  try {
    if (borsa === 'okx') {
      const OKX = require('./islemDefteri/okxApi');
      const iz = await zamanli(OKX.izinOku({ apiKey: a.apiKey, secret: a.secret, passphrase: a.passphrase || '' }, { fetch: o.fetch, simdi: o.simdi }), o.zamanAsimiMs || ZAMAN_ASIMI_MS, 'OKX');
      sonuc.izinler = iz.izinler || []; sonuc.saltOkuma = iz.durum === 'salt-okuma'; sonuc.cekmeIzni = (iz.izinler || []).some(x => /withdraw/i.test(x));
      if (iz.durum === 'bilinmiyor') sonuc.uyarilar.push('OKX izinleri bildirmedi.');
    } else {
      const BN = require('./islemDefteri/binanceApi');
      const c = BN.baglam({ fetch: o.fetch, simdi: o.simdi });
      await zamanli(c.saatEsitle(), o.zamanAsimiMs || ZAMAN_ASIMI_MS, 'Binance');
      const iz = await zamanli(BN.izinOku({ apiKey: a.apiKey, secret: a.secret }, { c }), o.zamanAsimiMs || ZAMAN_ASIMI_MS, 'Binance');
      sonuc.izinler = iz.izinler || []; sonuc.saltOkuma = iz.durum === 'salt-okuma'; sonuc.ipKisitli = !!iz.ipKisitli;
      sonuc.cekmeIzni = (iz.yasaklar || []).some(x => /withdraw/i.test(x)) || (iz.izinler || []).some(x => /withdraw/i.test(x));
    }
    if (sonuc.saltOkuma === false) sonuc.uyarilar.push('Anahtar salt okuma değil — İşlem defterim yalnız okuma izinli anahtar ister.');
    sonuc.ok = true;
  } catch (e) {
    sonuc.hata = temizle(e && e.message ? e.message : e, sirlar) || 'bilinmeyen hata';
  }
  return sonuc;
}

/** Telegram getMe — bot adını döndürür. */
async function telegramSina(token, o = {}) {
  const fetchFn = o.fetch || ((...a) => fetch(...a));
  try {
    if (!token) throw new Error('jeton kayıtlı değil');
    const r = await zamanli(fetchFn(`https://api.telegram.org/bot${token}/getMe`, { redirect: 'error' }), o.zamanAsimiMs || 15000, 'Telegram');
    let j = null;
    try { j = await r.json(); } catch { j = null; }
    if (!j || !j.ok) throw new Error(`Telegram reddetti (${(j && j.error_code) || r.status}${j && j.description ? `: ${j.description}` : ''})`);
    return { ok: true, botAdi: j.result && j.result.username ? `@${String(j.result.username).slice(0, 64)}` : null, hata: null };
  } catch (e) {
    return { ok: false, botAdi: null, hata: temizle(e && e.message ? e.message : e, [token]) || 'bilinmeyen hata' };
  }
}

module.exports = { borsaSina, defterSina, telegramSina, temizle, bakiyeOzeti, ZAMAN_ASIMI_MS };
