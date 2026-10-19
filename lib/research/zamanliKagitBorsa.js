/**
 * ZAMANLI KÂĞIT BORSA — canlı kodu (lib/live/) geçmiş veride SANAL SAATLE yeniden oynatmak için
 * `KagitBorsa` alt sınıfı. PLAN-TEST.md M1 (canlı kod = araştırma). lib/live/ altında hiçbir şey
 * değişmez; bu sınıf yalnız kâğıt borsanın VERİ yüzünü PIT arşive (data/market.db, pitVeri) bağlar.
 *
 * İLERİYE BAKIŞ YOK:
 *   · `simdi` (sanal saat) `saatAyarla` ile ilerler.
 *   · `fetchOHLCV(…, '1d')` yalnız KAPANMIŞ mumları verir: mum.time + 1 gün ≤ simdi. Oluşmakta olan gün
 *     (gerçek Binance kısmi mum döndürür) hiç verilmez — canlı kod onu zaten atar
 *     (`kapanmisGunlukMumlar`, `evrenOlustur`), ama arşivdeki mum günün TAMAMI olduğu için vermek sızıntı olurdu.
 *   · `fetchTickers` 24 saatlik hacmi son KAPANMIŞ günün mumundan verir (quoteVolume = hacim × kapanış;
 *     evren ön seçimi bununla). O gün mumu olmayan (henüz listelenmemiş / listeden çıkmış) sembol ticker vermez.
 *   · Mark fiyatı sürücü tarafından konur (`markAyarla` / `fiyatAyarla`): gün açılışı, gün içi yol, kapanış.
 *
 * KÂĞIT BORSADA OLMAYAN, BURADA EKLENEN:
 *   · FUNDING (`fonlamaUygula(t)`): t gününün oran toplamı × net pozisyon × t kapanışı cüzdandan düşer
 *     (araştırma simi `simule` ile aynı formül: q × kapanış × Σoran). Kâğıt borsa funding'i bilinçli taşımıyor
 *     ("bilinen eksik"); yeniden oynatmada araştırmayla kıyas için gerekli.
 *   · İşlem kancası (`islemKancasi`): her dolum (clientOrderId, miktar, fiyat, ücret) sürücüye bildirilir —
 *     kol bazında K/Z ayrıştırması için. `islemler` dizisi 2000'de budandığı için ayrı tutulur.
 *   · Budama (`buda(sonMu)`): son durumdaki (closed/canceled) emirler bellekte birikmesin diye silinir;
 *     yalnız defterde de SON durumda olanlar (yürütücü onları bir daha sormaz).
 *
 * Pazar filtreleri: `filtreler` (sembol → { tick, adim, minMiktar, minNominal, piyasaMax }) verilmezse
 * `pazarKur` varsayılanı. Sürücü bunları borsa anlık görüntüsünden (data/arastirma/exchangeinfo-*.json) kurar.
 */
const { KagitBorsa, pazarKur } = require('../live/kagitBorsa');

const GUN = 864e5;

/** times (artan) içinde x'ten büyük-eşit ilk indeks. */
function altSinir(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }

class ZamanliKagitBorsa extends KagitBorsa {
  /**
   * @param opts { seri (pitVeri.yukle().seri), bakiye, filtreler {sembol: pazarKur ayarı}, spotUcret, semboller (süzgeç) }
   */
  constructor(opts = {}) {
    super({ bakiye: opts.bakiye ?? 100000, spotUcret: opts.spotUcret });
    this.simdi = 0;
    this.seri = opts.seri;
    this._zaman = new Map();
    this._ham = new Map();
    this.fonlamaToplam = 0;
    this.fonlamaSembol = {};
    this.islemKancasi = null;
    const izin = opts.semboller ? new Set(opts.semboller) : null;
    for (const [s, x] of this.seri) {
      if (izin && !izin.has(s)) continue;
      this.markets[s] = pazarKur(s, (opts.filtreler && opts.filtreler[s]) || {});
      this._zaman.set(s, x.m.map(m => m.time));
      this._ham.set(s, x.m.map(m => [m.time, m.open, m.high, m.low, m.close, m.volume]));
    }
  }

  saatAyarla(t) { this.simdi = t; }

  /** Gün t'nin mumu (yoksa null). */
  mum(s, t) { const x = this.seri.get(s); if (!x) return null; const i = x.indeks.get(t); return i == null ? null : x.m[i]; }

  markAyarla(s, f) { if (f > 0) this.marklar[s] = f; }

  async loadMarkets() { this._hata('loadMarkets'); return this.markets; }

  async fetchOHLCV(symbol, tf, since, limit) {
    const h = this._hata('fetchOHLCV'); if (h) throw h.hata;
    if (tf !== '1d') throw new Error(`zamanlı kâğıt borsa yalnız 1d mum verir (${tf})`);
    const z = this._zaman.get(symbol);
    if (!z) return [];
    const bas = since == null ? 0 : altSinir(z, since);
    const bit = altSinir(z, this.simdi - GUN + 1);         // time + GUN <= simdi  ⇔  time <= simdi − GUN
    const son = limit ? Math.min(bit, bas + limit) : bit;
    return bas < son ? this._ham.get(symbol).slice(bas, son) : [];
  }

  async fetchTickers(semboller) {
    const h = this._hata('fetchTickers'); if (h) throw h.hata;
    const dun = Math.floor(this.simdi / GUN) * GUN - GUN;    // son kapanmış gün
    const out = {};
    for (const s of semboller || Object.keys(this.markets)) {
      const m = this.mum(s, dun);
      if (!m) continue;
      out[s] = { symbol: s, last: m.close, baseVolume: m.volume, quoteVolume: m.volume * m.close, timestamp: dun + GUN };
    }
    return out;
  }

  _doldur(o, fiyat, tur) {
    const once = o.filled;
    super._doldur(o, fiyat, tur);
    if (this.islemKancasi && o.filled > once) {
      const m = this.markets[o.symbol] || {};
      const oran = tur === 'maker' ? (m.maker ?? 0.0002) : (m.taker ?? 0.0005);
      const q = +(o.filled - once).toFixed(12);
      this.islemKancasi({ clientOrderId: o.clientOrderId, symbol: o.symbol, side: o.side, miktar: q, fiyat, ucret: q * fiyat * oran, tur, zaman: this.simdi });
    }
  }

  async spotEmir(varlik, side, miktar, params = {}) {
    const o = await super.spotEmir(varlik, side, miktar, params);
    if (this.islemKancasi) this.islemKancasi({ clientOrderId: o.clientOrderId, symbol: `${varlik}/USDT (spot)`, side, miktar: o.amount, fiyat: o.average, ucret: o.ucret, tur: 'spot', zaman: this.simdi });
    return o;
  }

  /**
   * t gününün funding'i: net pozisyon × t kapanışı × Σoran (pitVeri `fon` gün toplamı). Long öder (oran > 0).
   * @returns {{ sembol: tutar }} (USDT, + = ödenen)
   */
  fonlamaUygula(t) {
    const out = {};
    for (const [s, p] of Object.entries(this.pozisyonlar)) {
      const x = this.seri.get(s); const m = this.mum(s, t);
      if (!x || !m || !p.miktar) continue;
      const f = x.fon.get(t) || 0;
      if (!f) continue;
      const tutar = p.miktar * m.close * f;
      this.bakiye -= tutar;
      this.fonlamaToplam += tutar;
      this.fonlamaSembol[s] = (this.fonlamaSembol[s] || 0) + tutar;
      out[s] = tutar;
    }
    return out;
  }

  /** Son durumdaki emirleri bellekten siler (yalnız `sonMu(clientOrderId)` true olanlar). */
  buda(sonMu) {
    let n = 0;
    for (const [id, o] of this.emirler) if (o.status !== 'open' && sonMu(o.clientOrderId)) { this.emirler.delete(id); n++; }
    return n;
  }

  /** Özsermaye: USDT (cüzdan + gerçekleşmemiş) + spot varlıklar × mark. */
  ozsermaye() {
    let upnl = 0;
    for (const [s, p] of Object.entries(this.pozisyonlar)) upnl += p.miktar * ((this._mark(s) || p.giris) - p.giris);
    let spot = 0;
    for (const [v, q] of Object.entries(this.varliklar)) spot += q * (this._mark(`${v}/USDT:USDT`) || 0);
    return this.bakiye + upnl + spot;
  }
}

module.exports = { ZamanliKagitBorsa, altSinir, GUN };
