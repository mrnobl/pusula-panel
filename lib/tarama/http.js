/**
 * COIN TARAMA — HTTP istemcisi: zaman aşımı, yeniden deneme, oran sınırı (host başına), 429 / Retry-After.
 *
 *   const h = new Istemci({ fetch, simdi, uyu, zamanAsimiMs, denemeler });
 *   const r = await h.json(url, { host: 'goplus', araMs: 2500 })
 *     → { ok: true, durum: 200, veri, ms }  |  { ok: false, durum, hata, ms, hiz?: true }
 *
 * Kurallar:
 *   · Aynı host'a ardışık istekler arasında en az `araMs` (kaynağın anahtarsız sınırına göre).
 *   · 429 / 5xx / ağ hatası / zaman aşımı → üstel bekleme ile yeniden (Retry-After varsa ona uyulur, en çok 60 sn).
 *   · 4xx (429 hariç) → yeniden denenmez (yanlış adres / bulunamadı — kaynak cevap verdi).
 *   · Devre kesici: bir host aynı koşuda `kesiciEsik` kez üst üste son denemede de başarısız olursa o koşuda
 *     o host'a bir daha istek atılmaz (`{ ok:false, hata:'kaynak bu koşuda erişilemez' }`) — kesik kaynağı dövmemek için.
 *   · Gövde JSON değilse hata (içerik YORUMLANMAZ).
 * `fetch` enjekte edilebilir (testlerde sahte yanıt).
 */
'use strict';

const bekle = (ms) => new Promise(r => setTimeout(r, ms));

class Istemci {
  constructor({ fetch: f, simdi, uyu, zamanAsimiMs = 15000, denemeler = 3, kesiciEsik = 3, azamiRetryMs = 60000, log } = {}) {
    this.fetch = f || ((...a) => globalThis.fetch(...a));
    this.simdi = simdi || (() => Date.now());
    this.uyu = uyu || bekle;
    this.zamanAsimiMs = zamanAsimiMs;
    this.denemeler = denemeler;
    this.kesiciEsik = kesiciEsik;
    this.azamiRetryMs = azamiRetryMs;
    this.log = log || (() => {});
    this._son = new Map();      // host → son istek zamanı
    this._sira = new Map();     // host → zincir (aynı host'a istekler sırayla)
    this._ardisikHata = new Map();
    this.sayac = { istek: 0, hata: 0, hiz: 0 };
  }

  kesikMi(host) { return (this._ardisikHata.get(host) || 0) >= this.kesiciEsik; }

  /** Host sırasına gir: bir önceki istek bitince ve araMs dolunca çalışır. */
  _sirala(host, araMs, is) {
    const onceki = this._sira.get(host) || Promise.resolve();
    const yeni = onceki.catch(() => {}).then(async () => {
      const son = this._son.get(host) || 0;
      const kalan = son + araMs - this.simdi();
      if (kalan > 0) await this.uyu(kalan);
      try { return await is(); } finally { this._son.set(host, this.simdi()); }
    });
    this._sira.set(host, yeni.catch(() => {}));
    return yeni;
  }

  async _tek(url, secenek) {
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const zaman = setTimeout(() => { if (ac) ac.abort(); }, secenek.zamanAsimiMs || this.zamanAsimiMs);
    const bas = this.simdi();
    try {
      this.sayac.istek++;
      const r = await this.fetch(url, { method: 'GET', headers: { accept: 'application/json', 'user-agent': 'Pusula-tarama/60.3 (+yerel arastirma)', ...(secenek.basliklar || {}) }, signal: ac ? ac.signal : undefined, redirect: 'follow' });
      const metin = await r.text();
      const ms = this.simdi() - bas;
      const baslik = (ad) => (r.headers && typeof r.headers.get === 'function' ? r.headers.get(ad) : null);
      if (secenek.basliklarCb) { try { secenek.basliklarCb(baslik); } catch { /* yoksay */ } }
      if (r.status === 429 || r.status === 418) return { ok: false, durum: r.status, hata: `HTTP ${r.status}`, ms, hiz: true, retryAfter: Number(baslik('retry-after')) };
      if (r.status >= 500) return { ok: false, durum: r.status, hata: `HTTP ${r.status}`, ms, gecici: true };
      let veri;
      // 403 + HTML gövde: Cloudflare / bot koruması (sık istekte RDAP sunucuları böyle cevap veriyor) → hız sınırı gibi bekleyip yeniden dene.
      try { veri = metin === '' ? null : JSON.parse(metin); } catch { return { ok: false, durum: r.status, hata: `HTTP ${r.status}, JSON değil`, ms, gecici: r.status >= 500, hiz: r.status === 403 && /^\s*</.test(metin) }; }
      if (r.status >= 400) return { ok: false, durum: r.status, hata: `HTTP ${r.status}`, ms, veri };
      return { ok: true, durum: r.status, veri, ms };
    } catch (e) {
      const ms = this.simdi() - bas;
      const zamanAsimi = e && (e.name === 'AbortError' || /abort/i.test(e.message || ''));
      return { ok: false, durum: 0, hata: zamanAsimi ? `zaman aşımı (${Math.round((secenek.zamanAsimiMs || this.zamanAsimiMs) / 1000)} sn)` : `ağ hatası: ${String((e && e.message) || e).slice(0, 120)}`, ms, gecici: true };
    } finally {
      clearTimeout(zaman);
    }
  }

  /**
   * @param url
   * @param secenek { host, araMs, zamanAsimiMs, denemeler, basliklar, basliklarCb(baslikOku), hizKontrol(veri) → true ise 429 say }
   */
  async json(url, secenek = {}) {
    const host = secenek.host || (() => { try { return new URL(url).host; } catch { return 'bilinmeyen'; } })();
    if (this.kesikMi(host)) return { ok: false, durum: 0, hata: 'kaynak bu koşuda erişilemez (art arda hata)', ms: 0, kesik: true };
    const n = secenek.denemeler || this.denemeler;
    let son = null;
    for (let d = 0; d < n; d++) {
      // eslint-disable-next-line no-await-in-loop
      let r = await this._sirala(host, secenek.araMs || 0, () => this._tek(url, secenek));
      if (r.ok && typeof secenek.hizKontrol === 'function' && secenek.hizKontrol(r.veri)) r = { ok: false, durum: 429, hata: 'kaynak hız sınırı (gövdede)', ms: r.ms, hiz: true };
      son = r;
      if (r.ok) { this._ardisikHata.set(host, 0); return r; }
      if (!r.hiz && !r.gecici) { this._ardisikHata.set(host, 0); return r; }       // kaynak cevap verdi (4xx) — yeniden deneme anlamsız
      if (r.hiz) this.sayac.hiz++;
      if (d === n - 1) break;
      const ra = Number.isFinite(r.retryAfter) && r.retryAfter > 0 ? r.retryAfter * 1000 : null;
      const ms = Math.min(this.azamiRetryMs, ra || (r.hiz ? 10000 : 2000) * Math.pow(2, d));
      // eslint-disable-next-line no-await-in-loop
      await this.uyu(ms);
    }
    this.sayac.hata++;
    this._ardisikHata.set(host, (this._ardisikHata.get(host) || 0) + 1);
    return { ...son, denemeler: n };
  }
}

module.exports = { Istemci, bekle };
