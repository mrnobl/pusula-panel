/**
 * COIN TARAMA — "piyasa" kıyas evreni: Binance USDⓈ-M USDT perp'leri (COIN tipi, PERPETUAL), BTC/ETH, stabil ve TradFi
 * hariç — scripts/temmuz-listesi-analiz.js ile aynı tanım.
 *
 *   anlikFiyatlar()            şu an İŞLEMDEKİ evrenin fiyatları (tek istek: /fapi/v2/ticker/price, ağırlık 2). Liste girilirken
 *                              anlık görüntü olarak saklanır → o listenin kıyası nokta-zamanlı (sonradan listeden çıkan dahil).
 *   acilisHesapla(gun)         GEÇMİŞ bir gün için evren: exchangeInfo'daki (o gün listelenmiş) her sembolün o günkü 1d mumu;
 *                              o gün hacim > 0 olanlar (REST, listeden çıkmış sembole sıfır hacimli düz mum verir).
 *                              ~600 istek → arka plan işi; sonuç `data/tarama/piyasa/acilis-<gun>.json` (değişmez, bir kez).
 *   sonFiyatlar(semboller)     bugünkü fiyat; ticker'da olmayan (listeden çıkmış) sembol son 1d mumunun kapanışıyla.
 * Sınır: exchangeInfo'dan tamamen silinmiş semboller geçmiş gün evrenine giremez (hafif hayatta kalma yanlılığı; not edilir).
 */
'use strict';
const path = require('path');
const { jsonOku, atomikYaz, gunMs, sayi, gunStr } = require('./ortak');

const STABIL = new Set(['USDC', 'BUSD', 'TUSD', 'FDUSD', 'USDP', 'DAI', 'UST', 'USTC', 'EUR', 'GBP', 'AEUR', 'PAX', 'USDE', 'USD1', 'RLUSD', 'XUSD', 'BFUSD', 'PYUSD', 'USDS']);
const HARIC = new Set(['BTCUSDT', 'ETHUSDT']);

function tradfiTabanlari() { try { return require('../veri/tradfi').tabanlar(); } catch { return new Set(); } }

/** exchangeInfo satırı evrene girer mi (durumdan bağımsız). */
function evrendeMi(x, tradfi) {
  return x.tur === 'PERPETUAL' && x.quote === 'USDT' && (!x.alt || x.alt === 'COIN') && /^[A-Z0-9]+USDT$/.test(x.sembol)
    && !HARIC.has(x.sembol) && !STABIL.has(x.taban) && !(tradfi && tradfi.has(x.taban));
}

class Piyasa {
  /** @param o { fiyat: FiyatKaynagi, dizin: data/tarama/piyasa, simdi } */
  constructor({ fiyat, dizin, simdi } = {}) {
    this.fiyat = fiyat;
    this.dizin = dizin;
    this.simdi = simdi || (() => Date.now());
    this._anlik = null;
  }

  acilisDosya(gun) { return path.join(this.dizin, `acilis-${gun}.json`); }
  acilisOku(gun) { return jsonOku(this.acilisDosya(gun), null); }

  async anlikFiyatlar() {
    if (this._anlik && this.simdi() - this._anlik.t < 10 * 60e3) return this._anlik.v;
    const bilgi = await this.fiyat.perpBilgi();
    const tradfi = tradfiTabanlari();
    const evren = new Set(bilgi.filter(x => x.durum === 'TRADING' && evrendeMi(x, tradfi)).map(x => x.sembol));
    const r = await this.fiyat._istek('binance', 'perp', 'https://fapi.binance.com/fapi/v2/ticker/price');
    if (!r.ok || !Array.isArray(r.veri)) throw new Error(`Binance perp fiyat listesi alınamadı: ${r.hata || 'boş yanıt'}`);
    const fiyatlar = {};
    for (const x of r.veri) { const s = String(x.symbol), p = sayi(x.price); if (evren.has(s) && p > 0) fiyatlar[s] = p; }
    const v = { zaman: new Date(this.simdi()).toISOString(), kaynak: 'binance-perp /fapi/v2/ticker/price', n: Object.keys(fiyatlar).length, fiyatlar };
    this._anlik = { t: this.simdi(), v };
    return v;
  }

  /**
   * Geçmiş gün evreni (arka plan işi). `ilerleme(oran, metin)`, `iptal()` → true ise durur (yarım dosya yazılmaz).
   * @returns { gun, n, atlanan, fiyatlar: { SEMBOL: { acilis, hacim } } }
   */
  async acilisHesapla(gun, { ilerleme, iptal } = {}) {
    const var0 = this.acilisOku(gun);
    if (var0) return var0;
    if (gun >= gunStr(this.simdi())) throw new Error('piyasa açılışı yalnız geçmiş (kapanmış) gün için hesaplanır');
    const t = gunMs(gun);
    const bilgi = await this.fiyat.perpBilgi();
    const tradfi = tradfiTabanlari();
    const adaylar = bilgi.filter(x => evrendeMi(x, tradfi) && (!x.liste || x.liste <= t + 864e5));
    const fiyatlar = {}; let atlanan = 0, hata = 0;
    for (let i = 0; i < adaylar.length; i++) {
      if (iptal && iptal()) throw new Error('Kullanıcı iptal etti');
      const s = adaylar[i].sembol;
      // eslint-disable-next-line no-await-in-loop
      const a = await this.fiyat.gunAcilis({ borsa: 'binance', piyasa: 'perp', sembol: s }, gun, { onbellek: false });
      if (a.ok && a.fiyat > 0 && a.hacim > 0) fiyatlar[s] = { acilis: a.fiyat, hacim: a.hacim };
      else if (a.ok || a.bos) atlanan++;
      else hata++;
      if (ilerleme) ilerleme((i + 1) / adaylar.length, `${i + 1}/${adaylar.length} sembol · ${s}`);
    }
    if (hata > adaylar.length * 0.05) throw new Error(`${hata}/${adaylar.length} sembolün mumu alınamadı — sonra yeniden deneyin (kısmi evren kaydedilmedi)`);
    const out = { gun, uretildi: new Date(this.simdi()).toISOString(), kaynak: 'binance-perp 1d klines', aday: adaylar.length, n: Object.keys(fiyatlar).length, atlanan, hata, fiyatlar };
    atomikYaz(this.acilisDosya(gun), JSON.stringify(out));
    return out;
  }

  /** Bugünkü fiyatlar: ticker (tüm semboller) + listeden çıkmış semboller için son 1d mum kapanışı. */
  async sonFiyatlar(semboller) {
    const r = await this.fiyat._istek('binance', 'perp', 'https://fapi.binance.com/fapi/v2/ticker/price');
    if (!r.ok || !Array.isArray(r.veri)) throw new Error(`Binance perp fiyat listesi alınamadı: ${r.hata || 'boş yanıt'}`);
    const m = {};
    for (const x of r.veri) { const p = sayi(x.price); if (p > 0) m[String(x.symbol)] = p; }
    const out = {}; const cikan = [];
    for (const s of semboller) {
      if (m[s] > 0) { out[s] = m[s]; continue; }
      // eslint-disable-next-line no-await-in-loop
      const k = await this.fiyat._istek('binance', 'perp', `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(s)}&interval=1d&limit=1`);
      const x = k.ok && Array.isArray(k.veri) ? k.veri[k.veri.length - 1] : null;
      if (x && sayi(x[4]) > 0) { out[s] = sayi(x[4]); cikan.push(s); }
    }
    return { fiyatlar: out, cikan };
  }
}

module.exports = { Piyasa, evrendeMi, STABIL };
