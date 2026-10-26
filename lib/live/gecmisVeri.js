'use strict';
/**
 * GEÇMİŞ VERİ (77.5, kâğıt acil durdurmayı geri al — lib/live/kagitGeriAl.js) — kâğıt borsanın VERİ yüzünü SANAL SAATE bağlayan
 * ince sarmalayıcı. Simülatör DEĞİLDİR: dolum kuralları kâğıt borsanın kendisinde (`KagitBorsa.tikle` / `_limitleriIsle`), karar
 * botun kendi kodunda (`BindirmeBot._tik` → `gunlukCalisma`). Bu nesne yalnız "o dakikada borsa ne gösterirdi" sorusunu
 * cevaplar: `KagitBorsa({ veri: new GecmisVeri(ccxtGenel, () => saat) })`.
 *
 *   · fetchOHLCV(s, '1m', since, limit) — genel Binance 1 dk mumlarından (anahtarsız; ilk istekte [bas, bit] aralığı sayfa sayfa
 *     indirilir, bellekte tutulur), YALNIZ sanal saatte KAPANMIŞ olanlar (m.zaman + 1 dk ≤ saat).
 *   · fetchOHLCV(s, '1d' | diğer, …) — temel istemciye sorulur, yalnız sanal saatte kapanmış mumlar döner (oluşmakta olan gün,
 *     gerçek borsada da kısmi gelir ve canlı kod onu zaten atar — burada hiç verilmez: ileriye bakış yok).
 *   · fetchMarkPrice(s) — sanal saatten önceki SON kapanmış 1 dk mumun kapanışı (kâğıt yaklaşımı: işaret fiyatı ≈ son fiyat).
 *   · loadMarkets / markets — temel istemcinin pazarları (kurallar bugünkü).
 *   · fetchTickers — temel istemciye (BUGÜNKÜ hacim). Yalnız ay dönümünde evren ön seçiminde kullanılır; aralık ay dönümünü
 *     geçiyorsa önizleme bunu uyarı olarak yazar.
 * Boşluk: indirilen 1 dk serisinde eksik dakika sayısı `bosluklar[s]`ta (önizleme uyarısı).
 */

const DK = 60000;
const SURE = { '1m': DK, '3m': 3 * DK, '5m': 5 * DK, '15m': 15 * DK, '30m': 30 * DK, '1h': 3600e3, '2h': 7200e3, '4h': 14400e3, '1d': 864e5 };

class GecmisVeri {
  /**
   * @param temel ccxt genel istemci (anahtarsız binanceusdm) ya da aynı yüzü taşıyan sahte nesne (testler)
   * @param saatFn () → sanal saat (ms)
   * @param o.bas, o.bit  1 dk önbelleğinin aralığı (ms) — ilk istekte bu aralık indirilir
   * @param o.sayfa       sayfa başına mum (Binance vadeli 1 dk için ≤ 1500; 1000)
   */
  constructor(temel, saatFn, o = {}) {
    if (!temel || typeof temel.fetchOHLCV !== 'function') throw new Error('GecmisVeri: temel veri istemcisi gerekli');
    if (typeof saatFn !== 'function') throw new Error('GecmisVeri: sanal saat işlevi gerekli');
    this.temel = temel;
    this.saat = saatFn;
    this.bas = Number.isFinite(o.bas) ? o.bas : null;
    this.bit = Number.isFinite(o.bit) ? o.bit : null;
    this.sayfa = o.sayfa || 1000;
    this._dk = new Map();         // sembol → [[t,o,h,l,c,v]] (artan)
    this._yukleniyor = new Map(); // sembol → Promise (aynı sembol iki kez indirilmesin)
    this._gunluk = new Map();     // anahtar → Promise<mumlar>
    this.bosluklar = {};          // sembol → eksik dakika sayısı
    this.istekSayisi = 0;
  }

  get markets() { return this.temel.markets; }
  set markets(v) { this.temel.markets = v; }
  async loadMarkets(...a) { return this.temel.loadMarkets(...a); }
  async fetchTickers(...a) { this.istekSayisi++; return this.temel.fetchTickers(...a); }

  /** [bas, bit] aralığının 1 dk mumlarını indirir (sayfa sayfa), önbelleğe birleştirir. */
  async _indir(symbol, bas, bit) {
    const out = [];
    let since = Math.floor(bas / DK) * DK;
    for (let g = 0; g < 400 && since <= bit; g++) {
      this.istekSayisi++;
      const l = await this.temel.fetchOHLCV(symbol, '1m', since, this.sayfa);
      if (!Array.isArray(l) || !l.length) break;
      for (const m of l) if (m[0] >= since && m[0] <= bit) out.push(m);
      const son = l[l.length - 1][0];
      if (!(son >= since)) break;
      since = son + DK;
      if (l.length < 2) break;
    }
    const eski = this._dk.get(symbol) || [];
    const harita = new Map(eski.map(m => [m[0], m]));
    for (const m of out) harita.set(m[0], m);
    const seri = [...harita.values()].sort((a, b) => a[0] - b[0]);
    this._dk.set(symbol, seri);
    let eksik = 0;
    for (let i = 1; i < seri.length; i++) eksik += Math.max(0, Math.round((seri[i][0] - seri[i - 1][0]) / DK) - 1);
    this.bosluklar[symbol] = eksik;
    return seri;
  }

  /**
   * Sembolün 1 dk serisi. İlk istekte [min(bas, istenen), bit] indirilir; sonradan daha eski bir başlangıç istenirse (kâğıt borsanın
   * bayat `sonKontrol`u) yalnız eksik eski parça indirilir. Aynı sembolün süren indirmesi beklenir.
   */
  async _seri(symbol, istenenBas) {
    if (!this._aralik) this._aralik = new Map();
    const varsayilanBas = this.bas != null ? this.bas : this.saat() - 6 * 3600e3;
    const isBas = Math.floor((istenenBas != null ? Math.min(istenenBas, varsayilanBas) : varsayilanBas) / DK) * DK;
    while (this._yukleniyor.has(symbol)) { try { await this._yukleniyor.get(symbol); } catch { /* aşağıda yeniden denenir */ } }
    const a = this._aralik.get(symbol);
    if (a && a.bas <= isBas) return this._dk.get(symbol) || [];
    const bit = this.bit != null ? this.bit : this.saat();
    const p = this._indir(symbol, isBas, a ? a.bas - DK : bit)
      .then((s) => { this._aralik.set(symbol, { bas: isBas, bit: a ? a.bit : bit }); return s; })
      .finally(() => this._yukleniyor.delete(symbol));
    this._yukleniyor.set(symbol, p);
    return p;
  }

  async fetchOHLCV(symbol, tf = '1m', since, limit) {
    const t = this.saat();
    if (tf === '1m') {
      const seri = await this._seri(symbol, since != null ? since : null);
      let l = seri.filter(m => (since == null || m[0] >= since) && m[0] + DK <= t);
      if (limit) l = l.slice(0, limit);
      return l.map(m => m.slice());
    }
    const sure = SURE[tf] || 0;
    const anahtar = `${symbol}|${tf}|${since}|${limit}`;
    if (!this._gunluk.has(anahtar)) {
      this.istekSayisi++;
      const p = this.temel.fetchOHLCV(symbol, tf, since, limit);
      p.catch(() => this._gunluk.delete(anahtar));
      this._gunluk.set(anahtar, p);
    }
    const ham = await this._gunluk.get(anahtar);
    return (ham || []).filter(m => m[0] + sure <= t).map(m => m.slice());
  }

  /** Sanal saatten önceki son kapanmış 1 dk mumun kapanışı; mum yoksa boş (kâğıt borsa son bilinen fiyatı kullanır). */
  async fetchMarkPrice(symbol) {
    const t = this.saat();
    const seri = await this._seri(symbol, null);
    if (!seri.length) return { symbol, markPrice: undefined, info: {} };
    let lo = 0, hi = seri.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (seri[m][0] + DK <= t) lo = m + 1; else hi = m; }
    const m = lo > 0 ? seri[lo - 1] : null;
    if (!m || t - (m[0] + DK) > 6 * 3600e3) return { symbol, markPrice: undefined, info: {} };   // 6 saatten eski fiyat yok sayılır
    return { symbol, markPrice: m[4], info: { markPrice: String(m[4]) }, timestamp: m[0] + DK };
  }

  /** Önbellekteki 1 dk serisinin t anındaki fiyatı (önizleme değerlemesi; ağ yok). */
  fiyat(symbol, t = this.saat()) {
    const seri = this._dk.get(symbol) || [];
    let son = null;
    for (const m of seri) { if (m[0] + DK <= t) son = m; else break; }
    return son ? son[4] : null;
  }
}

module.exports = { GecmisVeri, DK };
