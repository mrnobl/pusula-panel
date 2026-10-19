/**
 * KÂĞIT BORSA — ccxt `binanceusdm`in yürütücünün kullandığı alt kümesi,
 * ÇOK SEMBOLLÜ, gerçek emir göndermeyen bir hesap.
 *
 * İki kip:
 *   · SENTETİK (testler): pazarlar `pazarEkle`, mumlar `mumlarAyarla`,
 *     fiyat `fiyatAyarla(sembol, fiyat, { dusuk, yuksek })` ile verilir.
 *   · GERÇEK VERİ (`veri` = anahtarsız ccxt binanceusdm): pazarlar, mumlar,
 *     ticker ve mark fiyatı borsadan OKUNUR; emirler yalnız burada yaşar.
 *     Bekleyen limitler `tikle()` ile son 1 dakikalık mumların dip/tepesine
 *     göre doldurulur.
 *
 * `kagit: true` işareti yürütücünün `baglanKagit` kapısıdır — gerçek bir
 * ccxt istemcisi bu yoldan bağlanamaz.
 *
 * DOLUM KURALLARI (backtest `lib/backtest/fills.js` "dokunma" modeliyle aynı):
 *   · alış limiti  : dip ≤ fiyat → limit fiyatından dolar (maker)
 *   · satış limiti : tepe ≥ fiyat → limit fiyatından dolar (maker)
 *   · fiyatı mark'ı yarım tick'ten fazla GEÇEN limit anında mark'tan
 *     dolar (taker) — borsada da emir defterini süpürür. Mark'a EŞİT limit
 *     bekler (backtest: emir verildiği barda dolmaz, sonraki barın dibi
 *     seviyeye inerse dolar).
 *   · bir fiyat adımında önce ALIŞLAR sonra SATIŞLAR işlenir (backtest sırası:
 *     emir defteri dolumu → take-profit).
 *   · yalnız-azaltan emir dolarken miktar pozisyonla sınırlanır; pozisyon
 *     yoksa emir iptal olur (Binance davranışı).
 * Kısmi dolum yok. Funding yok (bilinen eksik — kâğıt PnL'i funding içermez).
 *
 * SPOT VARLIK (çoklu varlık modu — Bindirme/Hücum/Denge): `spotEmir(varlik, side, miktar)`
 * USDT ↔ varlık (ör. BTC) piyasa dönüşümü; fiyat `VARLIK/USDT:USDT` mark'ı (spot
 * fiyat yerine perp mark — kâğıt yaklaşımı), ücret `spotUcret` (varsayılan %0,1).
 * Varlık `fetchBalance().total[VARLIK]` altında durur; `total.USDT` ANLAMI
 * DEĞİŞMEZ (USDT cüzdan + gerçekleşmemiş). Teminat oranı / marj hesabı yok.
 *
 * ÇOKLU VARLIK TAKLİDİ (yalnız lib/live/cokluVarlik.js — Bindirme btcAyak 'coklu', gerçek tasarım): Binance ham uçlarının
 * kâğıt karşılığı — fapiPrivate{Get,Post}MultiAssetsMargin, fapiPrivateV2GetAccount (maxWithdrawAmount: çapraz marj,
 * kaldıraç 20 ile başlangıç marjı), fapiPublicGetAssetIndex, privateGetAccount / privatePostOrder (MARKET, komisyon alınan
 * varlıktan) / privateGetOrder, publicGetTickerPrice / publicGetExchangeInfo, sapiPostAssetTransfer / sapiGetAssetTransfer.
 * Vadeli cüzdan = `bakiye` + `varliklar` (spotEmir'in koyduğu yer — eski anlam aynı), spot cüzdan = `spotCuzdan`.
 * Mod açıkken fetchBalance'a `info.totalMaintMargin/totalMarginBalance` eklenir (BTC teminatı × (1 − 0,05)).
 * Bu uçlar çağrılmadıkça davranış ve kalıcılık dosyası BİREBİR aynıdır.
 *
 * Muhasebe one-way net pozisyon: ortalama giriş, gerçekleşen kâr cüzdana,
 * komisyon cüzdandan. `fetchBalance().total` = cüzdan + gerçekleşmemiş
 * (ccxt binance `marginBalance` eşlemesiyle aynı anlam).
 */
const fs = require('fs');
const path = require('path');
const ccxt = require('ccxt');

const GUN = 864e5;
const EPS = 1e-12;

function pazarKur(symbol, o = {}) {
  const [base] = symbol.split('/');
  return {
    id: base + 'USDT', symbol, base, quote: 'USDT', settle: 'USDT',
    type: 'swap', swap: true, linear: true, contract: true, contractSize: 1, active: true,
    taker: o.taker ?? 0.0005, maker: o.maker ?? 0.0002,
    precision: { price: o.tick ?? 0.01, amount: o.adim ?? 0.001 },
    limits: { amount: { min: o.minMiktar ?? (o.adim ?? 0.001), max: o.maxMiktar ?? 1e9 },
      market: { min: o.minMiktar ?? (o.adim ?? 0.001), max: o.piyasaMax ?? 1e9 },
      cost: { min: o.minNominal ?? 5 }, price: { min: o.tick ?? 0.01 } },
    info: { filters: o.bant === false ? [] : [{ filterType: 'PERCENT_PRICE', multiplierUp: String(o.bantYukari ?? 1.05), multiplierDown: String(o.bantAsagi ?? 0.95) }] },
  };
}

class KagitBorsa {
  /**
   * @param opts { veri (ccxt public istemci | null), bakiye (USDT), dosya (durum JSON | null) }
   */
  constructor(opts = {}) {
    this.kagit = true;
    this.veri = opts.veri || null;
    this.dosya = opts.dosya || null;
    this.markets = {};
    this.marklar = {};
    this.mumlar = {};                // sentetik: sembol → [[t,o,h,l,c,v]]
    this.pozisyonlar = {};           // sembol → { miktar (işaretli), giris }
    this.emirler = new Map();        // borsa id → emir
    this.kosullu = new Map();        // KOŞULLU (algo) emirler — Binance gibi ayrı liste; yalnız saklanır, TETİKLENMEZ
    this.sira = 0;
    this.bakiye = opts.bakiye ?? 10000;
    this.ucretToplam = 0;
    this.sonKontrol = {};            // gerçek veri: sembol → son işlenen 1m mum zamanı
    this.hataPlani = [];
    this.cagri = [];
    this.hedged = false;
    this.varliklar = {};             // spot varlık → miktar (ör. { BTC: 0.5 })
    this.spotIslemler = [];          // spot dönüşüm kayıtları (son 500)
    this.islemler = [];              // vadeli dolumlar (ccxt "trade" biçimi, son 2000) — fetchMyTrades
    this.spotUcret = opts.spotUcret ?? 0.001;
    // ÇOKLU VARLIK TAKLİDİ (lib/live/cokluVarlik.js — "gerçek tasarım" kipi; yalnız o modül kullanır, varsayılan yol DEĞİŞMEZ)
    this.cokluMod = false;           // Binance Multi-Assets Mode (fapi/v1/multiAssetsMargin)
    this.spotCuzdan = {};            // SPOT cüzdan: varlık → miktar (USDT dahil). Vadeli cüzdan = bakiye (USDT) + varliklar
    this.aktarimlar = [];            // sapi/v1/asset/transfer kayıtları (son 500)
    this.spotEmirler = [];           // api/v3/order kayıtları (son 500)
    this.teminatIskonto = opts.teminatIskonto ?? 0.05;   // BTC bidBuffer (assetIndex) — teminat değeri = endeks × (1 − 0,05)
    this.kaldirac = opts.kaldirac ?? 20;                  // başlangıç marjı = nominal / kaldıraç (yalnız aktarım sınırı için)
    this.bakimOrani = opts.bakimOrani ?? 0.005;           // bakım marjı ≈ nominal × oran (yalnız çoklu mod marj oranı için)
    this.spotAdim = opts.spotAdim ?? 0.00001;             // BTCUSDT spot LOT_SIZE stepSize
    this.spotMinNominal = opts.spotMinNominal ?? 5;       // BTCUSDT spot NOTIONAL minNotional
    // Daha az iyimser SEÇENEKLİ senaryolar (varsayılan KAPALI — davranış aynı):
    this.otomatikCevrim = !!opts.otomatikCevrim;          // eksi vadeli USDT → BTC teminatından otomatik çevrim (tampon %2,5)
    this.otomatikCevrimTampon = opts.otomatikCevrimTampon ?? 0.025;
    this.otomatikCevrimler = [];
    this.spotKayma = opts.spotKayma ?? 0;                 // spot piyasa dolumunda kayma (alış f×(1+k), satış f×(1−k))
    this.spotKismi = opts.spotKismi ?? null;              // 0..1: piyasa emri bu oranda dolar, durum EXPIRED
    this.aktarimBeklet = new Set(opts.aktarimBeklet || []);   // n. aktarım çağrısı: işlem yapılır, cevap -5012 (in progress)
    this._aktarimSayac = 0;
    if (this.dosya && fs.existsSync(this.dosya)) this._yukle();
  }

  // ── Kalıcılık (gerçek veri kipinde sunucu yeniden başlasa da "borsa" sürer) ──
  _yukle() {
    try {
      const d = JSON.parse(fs.readFileSync(this.dosya, 'utf8'));
      this.bakiye = d.bakiye; this.ucretToplam = d.ucretToplam || 0; this.sira = d.sira || 0;
      this.pozisyonlar = d.pozisyonlar || {}; this.marklar = d.marklar || {}; this.sonKontrol = d.sonKontrol || {};
      this.emirler = new Map((d.emirler || []).map(o => [o.id, o]));
      this.varliklar = d.varliklar || {}; this.spotIslemler = d.spotIslemler || []; this.islemler = d.islemler || [];
      this.cokluMod = !!d.cokluMod; this.spotCuzdan = d.spotCuzdan || {}; this.aktarimlar = d.aktarimlar || []; this.spotEmirler = d.spotEmirler || [];
    } catch { /* bozuk dosya → boş hesap */ }
  }

  _kaydet() {
    if (!this.dosya) return;
    fs.mkdirSync(path.dirname(this.dosya), { recursive: true });
    // Son durumdaki eski emirler budanır (dosya büyümesin) — açıklar her zaman kalır.
    const hepsi = [...this.emirler.values()];
    const acik = hepsi.filter(o => o.status === 'open');
    const kapali = hepsi.filter(o => o.status !== 'open').slice(-500);
    const d = { bakiye: this.bakiye, ucretToplam: this.ucretToplam, sira: this.sira, pozisyonlar: this.pozisyonlar,
      marklar: this.marklar, sonKontrol: this.sonKontrol, emirler: [...kapali, ...acik],
      varliklar: this.varliklar, spotIslemler: this.spotIslemler.slice(-500), islemler: this.islemler.slice(-2000) };
    // Çoklu varlık alanları yalnız kullanıldıysa yazılır (varsayılan kâğıt dosyası birebir aynı kalır).
    if (this.cokluMod || Object.keys(this.spotCuzdan).length || this.aktarimlar.length || this.spotEmirler.length) {
      Object.assign(d, { cokluMod: this.cokluMod, spotCuzdan: this.spotCuzdan, aktarimlar: this.aktarimlar.slice(-500), spotEmirler: this.spotEmirler.slice(-500) });
    }
    const gecici = this.dosya + '.tmp';
    fs.writeFileSync(gecici, JSON.stringify(d), 'utf8');
    fs.renameSync(gecici, this.dosya);
  }

  _hata(metot) {
    this.cagri.push(metot);
    const i = this.hataPlani.findIndex(h => h.metot === metot);
    if (i < 0) return null;
    return this.hataPlani.splice(i, 1)[0];
  }

  // ── Sentetik kip yardımcıları ──────────────────────────────────────────
  pazarEkle(symbol, o = {}) { this.markets[symbol] = pazarKur(symbol, o); if (o.fiyat) this.marklar[symbol] = o.fiyat; return this.markets[symbol]; }
  mumlarAyarla(symbol, mumlar) { this.mumlar[symbol] = mumlar.map(m => (Array.isArray(m) ? m : [m.time, m.open, m.high, m.low, m.close, m.volume])); }
  mumEkle(symbol, m) { (this.mumlar[symbol] = this.mumlar[symbol] || []).push(Array.isArray(m) ? m : [m.time, m.open, m.high, m.low, m.close, m.volume]); }

  /**
   * Fiyat hareketi: bekleyen limitler [dusuk, yuksek] aralığına göre dolar,
   * sonra mark = fiyat.
   */
  fiyatAyarla(symbol, fiyat, { dusuk = fiyat, yuksek = fiyat } = {}) {
    this._limitleriIsle(symbol, dusuk, yuksek);
    this.marklar[symbol] = fiyat;
    if (this.otomatikCevrim) this.otomatikCevrimIsle();
    this._kaydet();
  }

  /**
   * SEÇENEKLİ: çoklu varlık modunda vadeli USDT cüzdanı eksiyse Binance teminattan otomatik çevrim yapar (auto-exchange):
   * eksiyi kapatacak kadar BTC, endeks × (1 − tampon) fiyatından USDT'ye döner. @returns çevrilen BTC
   */
  otomatikCevrimIsle() {
    if (!this.cokluMod || !(this.bakiye < 0)) return 0;
    let top = 0;
    for (const v of Object.keys(this.varliklar)) {
      if (!(this.bakiye < 0)) break;
      const f = this._mark(`${v}/USDT:USDT`); const q = this.varliklar[v];
      if (!(f > 0) || !(q > 0)) continue;
      const birim = f * (1 - this.otomatikCevrimTampon);
      const sat = Math.min(q, -this.bakiye / birim);
      this.varliklar[v] = +(q - sat).toFixed(12); if (this.varliklar[v] < EPS) delete this.varliklar[v];
      this.bakiye += sat * birim;
      this.otomatikCevrimler.push({ zaman: Date.now(), varlik: v, miktar: sat, fiyat: birim });
      top += sat;
    }
    return top;
  }

  _limitleriIsle(symbol, dusuk, yuksek) {
    const acik = [...this.emirler.values()].filter(o => o.status === 'open' && o.symbol === symbol && o.type === 'limit');
    const alis = acik.filter(o => o.side === 'buy').sort((a, b) => b.price - a.price);
    const satis = acik.filter(o => o.side === 'sell').sort((a, b) => a.price - b.price);
    for (const o of alis) if (dusuk <= o.price) this._doldur(o, o.price, 'maker');
    for (const o of satis) if (yuksek >= o.price) this._doldur(o, o.price, 'maker');
  }

  _doldur(o, fiyat, tur) {
    let miktar = o.amount - o.filled;
    if (o.reduceOnly) {
      const p = this.pozisyonlar[o.symbol];
      const net = p ? p.miktar : 0;
      const azaltir = (o.side === 'sell' && net > EPS) || (o.side === 'buy' && net < -EPS);
      if (!azaltir) { o.status = 'canceled'; o.sebep = 'yalnız-azaltan: pozisyon yok'; return; }
      miktar = Math.min(miktar, Math.abs(net));
    }
    const m = this.markets[o.symbol] || {};
    const oran = tur === 'maker' ? (m.maker ?? 0.0002) : (m.taker ?? 0.0005);
    // Gerçekleşen K/Z (Binance userTrades.realizedPnl karşılığı): kapanan kısmın (fiyat − giriş) farkı, ücretsiz.
    const p0 = this.pozisyonlar[o.symbol];
    const q = o.side === 'buy' ? miktar : -miktar;
    const kz = p0 && Math.abs(p0.miktar) > EPS && Math.sign(p0.miktar) !== Math.sign(q) ? Math.min(Math.abs(q), Math.abs(p0.miktar)) * (fiyat - p0.giris) * Math.sign(p0.miktar) : 0;
    this._pozisyonaIsle(o.symbol, q, fiyat, oran);
    const zaman = Date.now();
    this.islemler.push({ id: `t${this.islemler.length + 1}-${o.id}`, order: o.id, clientOrderId: o.clientOrderId, symbol: o.symbol, side: o.side,
      amount: miktar, price: fiyat, cost: miktar * fiyat, fee: { cost: miktar * fiyat * oran, currency: 'USDT' }, takerOrMaker: tur, timestamp: zaman, info: { realizedPnl: String(kz) } });
    if (this.islemler.length > 2000) this.islemler.splice(0, this.islemler.length - 2000);
    o.filled = +(o.filled + miktar).toFixed(12);
    o.average = fiyat;
    o.status = 'closed';
    o.lastTradeTimestamp = Date.now();
  }

  _pozisyonaIsle(symbol, q, fiyat, ucretOrani) {
    const p = this.pozisyonlar[symbol] || { miktar: 0, giris: 0 };
    const ucret = Math.abs(q) * fiyat * ucretOrani;
    this.bakiye -= ucret; this.ucretToplam += ucret;
    if (Math.abs(p.miktar) < EPS || Math.sign(p.miktar) === Math.sign(q)) {
      const yeni = p.miktar + q;
      p.giris = (Math.abs(p.miktar) * p.giris + Math.abs(q) * fiyat) / Math.abs(yeni);
      p.miktar = yeni;
    } else {
      const kapanan = Math.min(Math.abs(q), Math.abs(p.miktar));
      this.bakiye += kapanan * (fiyat - p.giris) * Math.sign(p.miktar);
      const kalan = p.miktar + q;
      if (Math.abs(kalan) < EPS) { p.miktar = 0; p.giris = 0; }
      else if (Math.sign(kalan) === Math.sign(p.miktar)) p.miktar = kalan;
      else { p.miktar = kalan; p.giris = fiyat; }       // ters yöne geçti
    }
    p.miktar = +p.miktar.toFixed(12);
    if (Math.abs(p.miktar) < EPS) delete this.pozisyonlar[symbol]; else this.pozisyonlar[symbol] = p;
  }

  _mark(symbol) {
    const m = this.marklar[symbol];
    if (m > 0) return m;
    const s = this.mumlar[symbol];
    return s && s.length ? s[s.length - 1][4] : null;
  }

  /** Gerçek veri kipi: bekleyen limitleri son 1m mumların dip/tepesine göre doldur, mark'ı tazele. */
  async tikle(simdi = Date.now()) {
    if (!this.veri) return;
    const semboller = new Set([...this.emirler.values()].filter(o => o.status === 'open').map(o => o.symbol));
    for (const s of Object.keys(this.pozisyonlar)) semboller.add(s);
    for (const s of semboller) {
      try {
        const bas = this.sonKontrol[s] || simdi - 5 * 60000;
        const mumlar = await this.veri.fetchOHLCV(s, '1m', bas, 1000);
        for (const m of mumlar) {
          if (m[0] + 60000 > simdi) break;          // oluşmakta olan dakika
          if (m[0] < bas) continue;
          this._limitleriIsle(s, m[3], m[2]);
          this.sonKontrol[s] = m[0] + 60000;
        }
        const mk = await this.veri.fetchMarkPrice(s).catch(() => null);
        const f = mk && +(mk.markPrice || (mk.info && mk.info.markPrice));
        if (f > 0) this.marklar[s] = f;
      } catch { /* bir sembolün okunamaması diğerlerini durdurmaz; sonraki tikte yeniden */ }
    }
    this._kaydet();
  }

  // ── ccxt alt kümesi ────────────────────────────────────────────────────
  enableDemoTrading() {}

  async loadMarkets() {
    this._hata('loadMarkets');
    if (this.veri) {
      const m = await this.veri.loadMarkets();
      this.markets = {};
      for (const [k, v] of Object.entries(m)) if (v.swap && v.linear && v.quote === 'USDT') this.markets[k] = v;
    }
    return this.markets;
  }

  async fetchPositionMode() { return { hedged: this.hedged }; }

  async fetchMarkPrice(symbol) {
    const h = this._hata('fetchMarkPrice'); if (h) throw h.hata;
    if (this.veri) {          // gerçek veri: her sorguda taze mark (önbellek bayatlamasın)
      const mk = await this.veri.fetchMarkPrice(symbol);
      const f = +(mk.markPrice || (mk.info && mk.info.markPrice));
      if (f > 0) this.marklar[symbol] = f;
    }
    return { symbol, markPrice: this._mark(symbol) };
  }

  async fetchTickers(semboller) {
    const h = this._hata('fetchTickers'); if (h) throw h.hata;
    if (this.veri) return this.veri.fetchTickers(semboller);
    const out = {};
    for (const s of semboller || Object.keys(this.markets)) {
      const m = this.mumlar[s];
      if (!m || !m.length) continue;
      const son = m[m.length - 1];
      out[s] = { symbol: s, last: son[4], baseVolume: son[5], quoteVolume: son[5] * son[4] };
    }
    return out;
  }

  async fetchOHLCV(symbol, tf, since, limit) {
    const h = this._hata('fetchOHLCV'); if (h) throw h.hata;
    if (this.veri) return this.veri.fetchOHLCV(symbol, tf, since, limit);
    if (tf !== '1d') throw new Error(`sentetik kâğıt borsa yalnız 1d mum verir (${tf})`);
    const s = (this.mumlar[symbol] || []).filter(m => since == null || m[0] >= since);
    return limit ? s.slice(0, limit) : s;
  }

  async fetchBalance() {
    const h = this._hata('fetchBalance'); if (h) throw h.hata;
    let upnl = 0, kullanilan = 0;
    for (const [s, p] of Object.entries(this.pozisyonlar)) {
      const mk = this._mark(s) || p.giris;
      upnl += p.miktar * (mk - p.giris);
      kullanilan += Math.abs(p.miktar) * mk;           // 1x marj
    }
    const toplam = this.bakiye + upnl;
    const out = { total: { USDT: toplam }, free: { USDT: toplam - kullanilan }, used: { USDT: kullanilan } };
    for (const [v, q] of Object.entries(this.varliklar)) if (q > EPS) { out.total[v] = q; out.free[v] = q; out.used[v] = 0; }
    // Çoklu varlık modu açıksa (yalnız cokluVarlik.js açar) borsanın marj alanları — marjIzleme oranı okur.
    if (this.cokluMod) { const v = this._vadeliHesapHam(); out.info = { totalMaintMargin: String(v.totalMaintMargin), totalMarginBalance: String(v.totalMarginBalance), multiAssetsMargin: true }; }
    return out;
  }

  /**
   * SPOT DÖNÜŞÜM (piyasa): USDT ↔ varlık. Alımda USDT cüzdanı `miktar × fiyat × (1 + ücret)`
   * azalır; satışta eldeki miktarı aşamaz. Aynı clientOrderId ikinci kez reddedilir.
   * @returns {{ id, clientOrderId, varlik, side, amount, average, cost, ucret, status, timestamp }}
   */
  async spotEmir(varlik, side, miktar, params = {}) {
    const h = this._hata('spotEmir'); if (h) throw h.hata;
    if (!['buy', 'sell'].includes(side)) throw new ccxt.InvalidOrder(`spot side buy|sell: ${side}`);
    if (!(miktar > 0)) throw new ccxt.InvalidOrder('spot miktar pozitif olmalı');
    if (params.clientOrderId && this.spotIslemler.some(x => x.clientOrderId === params.clientOrderId)) throw new ccxt.InvalidOrder('-4015 Client order id is not valid (duplicate)');
    const sembol = `${varlik}/USDT:USDT`;
    if (this.veri) { try { await this.fetchMarkPrice(sembol); } catch { /* son bilinen mark */ } }
    const fiyat = this._mark(sembol);
    if (!(fiyat > 0)) throw new ccxt.ExchangeError(`${varlik} için fiyat yok`);
    const eldeki = this.varliklar[varlik] || 0;
    if (side === 'sell' && miktar > eldeki + EPS) throw new ccxt.InsufficientFunds(`-2010 yetersiz ${varlik}: ${eldeki} < ${miktar}`);
    const q = side === 'sell' ? Math.min(miktar, eldeki) : miktar;
    const cost = q * fiyat, ucret = cost * this.spotUcret;
    if (side === 'buy') { this.bakiye -= cost + ucret; this.varliklar[varlik] = +(eldeki + q).toFixed(12); }
    else { this.bakiye += cost - ucret; this.varliklar[varlik] = +(eldeki - q).toFixed(12); }
    if (Math.abs(this.varliklar[varlik]) < EPS) delete this.varliklar[varlik];
    this.ucretToplam += ucret;
    const o = { id: 'S' + (++this.sira), clientOrderId: params.clientOrderId || null, varlik, side, amount: q, average: fiyat, cost, ucret, status: 'closed', timestamp: Date.now() };
    this.spotIslemler.push(o);
    this._kaydet();
    return { ...o };
  }

  async fetchPositions(semboller) {
    const h = this._hata('fetchPositions'); if (h) throw h.hata;
    return Object.entries(this.pozisyonlar)
      .filter(([s, p]) => Math.abs(p.miktar) > EPS && (!semboller || semboller.includes(s)))
      .map(([s, p]) => {
        const mk = this._mark(s) || p.giris;
        return { symbol: s, side: p.miktar > 0 ? 'long' : 'short', contracts: Math.abs(p.miktar), entryPrice: p.giris,
          markPrice: mk, liquidationPrice: null, leverage: 1, marginMode: 'cross',
          unrealizedPnl: p.miktar * (mk - p.giris), notional: Math.abs(p.miktar) * mk };
      });
  }

  async fetchOpenOrders(symbol, since, limit, params = {}) {
    const h = this._hata('fetchOpenOrders'); if (h) throw h.hata;
    if (params.trigger === true) return [...this.kosullu.values()].filter(o => o.status === 'open' && (!symbol || o.symbol === symbol)).map(o => ({ ...o }));
    return [...this.emirler.values()].filter(o => o.status === 'open' && (!symbol || o.symbol === symbol)).map(o => ({ ...o }));
  }

  _bul(id, params = {}) {
    const cid = params.clientOrderId || params.origClientOrderId;
    for (const o of this.emirler.values()) if ((cid && o.clientOrderId === cid) || (id && o.id === id)) return o;
    return null;
  }

  /** ccxt `fetchMyTrades` karşılığı: sembolün dolumları (since ms'den itibaren). */
  async fetchMyTrades(symbol, since, limit) {
    const h = this._hata('fetchMyTrades'); if (h) throw h.hata;
    let l = this.islemler.filter(t => (!symbol || t.symbol === symbol) && (!since || t.timestamp >= since));
    if (limit) l = l.slice(0, limit);
    return l.map(t => ({ ...t, fee: { ...t.fee } }));
  }

  async fetchOrder(id, symbol, params = {}) {
    const h = this._hata('fetchOrder'); if (h) throw h.hata;
    if (params.trigger === true) {
      const cid = params.clientOrderId;
      const ko = [...this.kosullu.values()].find(x => (cid && x.clientOrderId === cid) || (id && x.id === id));
      if (!ko) throw new ccxt.OrderNotFound('Order does not exist');
      return { ...ko };
    }
    const o = this._bul(id, params);
    if (!o) throw new ccxt.OrderNotFound('Order does not exist');
    return { ...o };
  }

  async createOrder(symbol, type, side, amount, price, params = {}) {
    const h = this._hata('createOrder');
    if (h && !h.gitti) throw h.hata;
    if (!this.markets[symbol]) throw new ccxt.BadSymbol(`-1121 Invalid symbol ${symbol}`);
    if (params.triggerPrice != null || params.stopPrice != null) {
      // Koşullu emir (felaket stopu): ayrı listede durur, normal açık emirlerde görünmez. Kâğıt borsa
      // bar içi tetik taşımadığı için TETİKLENMEZ — demo/canlı yolunun API biçimini sınamak içindir.
      const o = { id: `a${++this.sira}`, clientOrderId: params.clientOrderId, symbol, type, side, amount: amount ?? null,
        triggerPrice: +(params.triggerPrice ?? params.stopPrice), closePosition: !!params.closePosition, reduceOnly: !!params.reduceOnly, status: 'open', timestamp: Date.now() };
      this.kosullu.set(o.id, o);
      return { ...o };
    }
    if (params.clientOrderId && this._bul(null, params)) throw new ccxt.InvalidOrder('-4015 Client order id is not valid (duplicate)');
    if (params.reduceOnly) {
      const p = this.pozisyonlar[symbol];
      const net = p ? p.miktar : 0;
      const azaltir = (side === 'sell' && net > EPS) || (side === 'buy' && net < -EPS);
      if (!azaltir) throw new ccxt.InvalidOrder('-2022 ReduceOnly Order is rejected');
    }
    const mark = this._mark(symbol);
    if (!(mark > 0)) throw new ccxt.ExchangeError(`${symbol} için fiyat yok`);
    const o = { id: String(++this.sira), clientOrderId: params.clientOrderId, symbol, type, side, amount,
      price: price ?? null, filled: 0, average: null, status: 'open', reduceOnly: !!params.reduceOnly, timestamp: Date.now() };
    this.emirler.set(o.id, o);
    if (type === 'market') this._doldur(o, mark, 'taker');
    else {
      // Yuvarlama artığı (yarım tick) "mark'ı geçti" sayılmaz — backtestte de emir verildiği barda dolmaz.
      const pay = ((this.markets[symbol].precision || {}).price || 0) / 2;
      if ((side === 'buy' && price - mark > pay) || (side === 'sell' && mark - price > pay)) this._doldur(o, mark, 'taker');
    }
    this._kaydet();
    if (h && h.gitti) throw h.hata;     // emir borsaya ULAŞTI ama cevap kayboldu
    return { ...o };
  }

  async cancelOrder(id, symbol, params = {}) {
    const h = this._hata('cancelOrder'); if (h) throw h.hata;
    if (params.trigger === true) {
      const k = this.kosullu.get(id);
      if (!k || k.status !== 'open') throw new ccxt.OrderNotFound('-2011 Unknown order sent');
      k.status = 'canceled';
      return { ...k };
    }
    const o = this._bul(id, params);
    if (!o || o.status !== 'open') throw new ccxt.OrderNotFound('-2011 Unknown order sent');
    o.status = 'canceled';
    this._kaydet();
    return { ...o };
  }

  // ── ÇOKLU VARLIK TAKLİDİ — Binance ham uçları (ccxt "implicit" adlarıyla, cevaplar Binance biçiminde: sayılar metin) ──
  // Yalnız lib/live/cokluVarlik.js çağırır. Vadeli cüzdan = `bakiye` (USDT) + `varliklar` (BTC teminat); spot cüzdan = `spotCuzdan`.
  // Hata planı (`hataPlani`) her metotta geçerli; `{ gitti: true }` → işlem YAPILIR ama cevap kaybolur (belirsiz sonuç sınaması).

  _spotFiyat(symbol) {
    const base = String(symbol || '').replace(/USDT$/, '');
    const f = this._mark(`${base}/USDT:USDT`);
    if (!(f > 0)) throw new ccxt.ExchangeError(`binance {"code":-1121,"msg":"Invalid symbol ${symbol} (fiyat yok)"}`);
    return { base, f };
  }

  /** Vadeli hesap (çapraz, çoklu varlık modunda BTC iskontolu teminat). Sayılar (metin değil). */
  _vadeliHesapHam() {
    let upnl = 0, nominal = 0;
    for (const [s, p] of Object.entries(this.pozisyonlar)) { const mk = this._mark(s) || p.giris; upnl += p.miktar * (mk - p.giris); nominal += Math.abs(p.miktar) * mk; }
    const teminat = {};
    let teminatToplam = 0;
    for (const [v, q] of Object.entries(this.varliklar)) {
      const f = this._mark(`${v}/USDT:USDT`) || 0;
      teminat[v] = this.cokluMod ? q * f * (1 - this.teminatIskonto) : 0;
      teminatToplam += teminat[v];
    }
    const mb = this.bakiye + upnl + teminatToplam, im = nominal / this.kaldirac, mm = nominal * this.bakimOrani;
    const serbest = Math.max(0, mb - im);
    const assets = [{ asset: 'USDT', walletBalance: this.bakiye, unrealizedProfit: upnl, marginBalance: this.bakiye + upnl, maxWithdrawAmount: Math.max(0, Math.min(this.bakiye, serbest)) }];
    for (const [v, q] of Object.entries(this.varliklar)) {
      const f = this._mark(`${v}/USDT:USDT`) || 0;
      const birim = this.cokluMod ? f * (1 - this.teminatIskonto) : 0;
      assets.push({ asset: v, walletBalance: q, unrealizedProfit: 0, marginBalance: q, maxWithdrawAmount: birim > 0 ? Math.min(q, serbest / birim) : q });
    }
    return { multiAssetsMargin: this.cokluMod, totalMarginBalance: mb, totalMaintMargin: mm, totalInitialMargin: im, availableBalance: serbest, assets };
  }

  async fapiPrivateGetMultiAssetsMargin() {
    const h = this._hata('fapiPrivateGetMultiAssetsMargin'); if (h) throw h.hata;
    return { multiAssetsMargin: this.cokluMod };
  }

  async fapiPrivatePostMultiAssetsMargin(params = {}) {
    const h = this._hata('fapiPrivatePostMultiAssetsMargin'); if (h && !h.gitti) throw h.hata;
    const v = String(params.multiAssetsMargin) === 'true';
    if (v === this.cokluMod) throw new ccxt.BadRequest('binanceusdm {"code":-4171,"msg":"Adjusted Multi-Assets mode is same as current."}');
    this.cokluMod = v;
    this._kaydet();
    if (h && h.gitti) throw h.hata;
    return { code: 200, msg: 'success' };
  }

  async fapiPrivateV2GetAccount() {
    const h = this._hata('fapiPrivateV2GetAccount'); if (h) throw h.hata;
    const v = this._vadeliHesapHam();
    const m = (x) => String(+(+x).toFixed(8));
    return { multiAssetsMargin: v.multiAssetsMargin, totalMarginBalance: m(v.totalMarginBalance), totalMaintMargin: m(v.totalMaintMargin),
      totalInitialMargin: m(v.totalInitialMargin), availableBalance: m(v.availableBalance),
      assets: v.assets.map(a => ({ asset: a.asset, walletBalance: m(a.walletBalance), unrealizedProfit: m(a.unrealizedProfit), marginBalance: m(a.marginBalance), maxWithdrawAmount: m(a.maxWithdrawAmount) })) };
  }

  async fapiPublicGetAssetIndex(params = {}) {
    const h = this._hata('fapiPublicGetAssetIndex'); if (h) throw h.hata;
    const base = String(params.symbol || 'BTCUSD').replace(/USD$/, '');
    const f = this._mark(`${base}/USDT:USDT`);
    return { symbol: `${base}USD`, index: String(f), bidBuffer: String(this.teminatIskonto), askBuffer: String(this.teminatIskonto), autoExchangeBidBuffer: '0.025' };
  }

  async privateGetAccount() {
    const h = this._hata('privateGetAccount'); if (h) throw h.hata;
    return { canTrade: true, accountType: 'SPOT', balances: Object.entries(this.spotCuzdan).map(([asset, q]) => ({ asset, free: String(+q.toFixed(12)), locked: '0' })) };
  }

  async publicGetTickerPrice(params = {}) {
    const h = this._hata('publicGetTickerPrice'); if (h) throw h.hata;
    const { f } = this._spotFiyat(params.symbol);
    return { symbol: params.symbol, price: String(f) };
  }

  async publicGetExchangeInfo(params = {}) {
    const h = this._hata('publicGetExchangeInfo'); if (h) throw h.hata;
    return { symbols: [{ symbol: params.symbol || 'BTCUSDT', status: 'TRADING', filters: [
      { filterType: 'LOT_SIZE', minQty: String(this.spotAdim), maxQty: '9000', stepSize: String(this.spotAdim) },
      { filterType: 'NOTIONAL', minNotional: String(this.spotMinNominal), applyMinToMarket: true }] }] };
  }

  /** api/v3/order — yalnız MARKET. Ücret (spotUcret) ALINAN varlıktan düşer (Binance, BNB'siz). */
  async privatePostOrder(params = {}) {
    const h = this._hata('privatePostOrder'); if (h && !h.gitti) throw h.hata;
    const side = String(params.side || '').toUpperCase();
    if (!['BUY', 'SELL'].includes(side)) throw new ccxt.BadRequest('binance {"code":-1102,"msg":"side"}');
    if (String(params.type || '').toUpperCase() !== 'MARKET') throw new ccxt.InvalidOrder('binance {"code":-1013,"msg":"yalnız MARKET (kâğıt)"}');
    const q = +params.quantity;
    const { base, f } = this._spotFiyat(params.symbol);
    const adimSayisi = q / this.spotAdim;
    if (!(q > 0) || Math.abs(adimSayisi - Math.round(adimSayisi)) > 1e-6) throw new ccxt.InvalidOrder('binance {"code":-1013,"msg":"Filter failure: LOT_SIZE"}');
    if (q * f < this.spotMinNominal) throw new ccxt.InvalidOrder('binance {"code":-1013,"msg":"Filter failure: NOTIONAL"}');
    const cid = params.newClientOrderId || `kagit_${this.sira + 1}`;
    // Binance spot: newClientOrderId yalnız AÇIK emirler arasında tekil — dolmuş emrin kimliği yeniden kullanılabilir (çift emir riski!).
    const usdt = this.spotCuzdan.USDT || 0, eldeki = this.spotCuzdan[base] || 0;
    // Seçenekli kısmi dolum (EXPIRED) ve kayma
    const tam = q;
    const qq = this.spotKismi != null ? Math.floor(q * this.spotKismi / this.spotAdim + 1e-9) * this.spotAdim : q;
    const fd = f * (1 + (side === 'BUY' ? 1 : -1) * this.spotKayma);
    return this._spotDoldur(params, side, base, +qq.toFixed(12), fd, cid, usdt, eldeki, tam, h);
  }

  _spotDoldur(params, side, base, q, f, cid, usdt, eldeki, tam, h) {
    const cost = q * f;
    if (side === 'BUY' && cost > usdt + 1e-9) throw new ccxt.InsufficientFunds('binance {"code":-2010,"msg":"Account has insufficient balance for requested action."}');
    if (side === 'SELL' && q > eldeki + EPS) throw new ccxt.InsufficientFunds('binance {"code":-2010,"msg":"Account has insufficient balance for requested action."}');
    let komisyon, komisyonVarlik;
    if (side === 'BUY') {
      komisyon = q * this.spotUcret; komisyonVarlik = base;
      this.spotCuzdan.USDT = +(usdt - cost).toFixed(10);
      this.spotCuzdan[base] = +(eldeki + q - komisyon).toFixed(12);
      this.ucretToplam += komisyon * f;
    } else {
      komisyon = cost * this.spotUcret; komisyonVarlik = 'USDT';
      this.spotCuzdan[base] = +(eldeki - q).toFixed(12);
      this.spotCuzdan.USDT = +(usdt + cost - komisyon).toFixed(10);
      this.ucretToplam += komisyon;
    }
    for (const k of Object.keys(this.spotCuzdan)) if (Math.abs(this.spotCuzdan[k]) < EPS) delete this.spotCuzdan[k];
    const o = { symbol: params.symbol, orderId: ++this.sira, clientOrderId: cid, transactTime: Date.now(), price: '0', origQty: String(tam), executedQty: String(q),
      cummulativeQuoteQty: String(cost), status: q < tam - EPS ? 'EXPIRED' : 'FILLED', type: 'MARKET', side,
      fills: [{ price: String(f), qty: String(q), commission: String(komisyon), commissionAsset: komisyonVarlik }] };
    this.spotEmirler.push(o);
    if (this.spotEmirler.length > 500) this.spotEmirler.splice(0, this.spotEmirler.length - 500);
    this._kaydet();
    if (h && h.gitti) throw h.hata;
    return JSON.parse(JSON.stringify(o));
  }

  async privateGetOrder(params = {}) {
    const h = this._hata('privateGetOrder'); if (h) throw h.hata;
    const o = [...this.spotEmirler].reverse().find(x => x.symbol === params.symbol && ((params.origClientOrderId && x.clientOrderId === params.origClientOrderId) || (params.orderId != null && String(x.orderId) === String(params.orderId))));
    if (!o) throw new ccxt.OrderNotFound('binance {"code":-2013,"msg":"Order does not exist."}');
    const { fills, ...kalan } = o;
    return { ...kalan, time: o.transactTime, updateTime: o.transactTime };
  }

  /** sapi/v1/asset/transfer — yalnız MAIN_UMFUTURE (spot → vadeli) ve UMFUTURE_MAIN (vadeli → spot). */
  async sapiPostAssetTransfer(params = {}) {
    const h = this._hata('sapiPostAssetTransfer'); if (h && !h.gitti) throw h.hata;
    this._aktarimSayac++;
    const { type, asset } = params;
    const q = +params.amount;
    if (!['MAIN_UMFUTURE', 'UMFUTURE_MAIN'].includes(type)) throw new ccxt.BadRequest(`binance {"code":-1100,"msg":"type ${type}"}`);
    if (!(q > 0)) throw new ccxt.BadRequest('binance {"code":-1100,"msg":"amount"}');
    const yetersiz = () => new ccxt.InsufficientFunds('binance {"code":-5013,"msg":"Asset transfer failed: insufficient balance"}');
    if (type === 'MAIN_UMFUTURE') {
      const s = this.spotCuzdan[asset] || 0;
      if (q > s + 1e-9) throw yetersiz();
      this.spotCuzdan[asset] = +(s - q).toFixed(12);
      if (asset === 'USDT') this.bakiye += q; else this.varliklar[asset] = +((this.varliklar[asset] || 0) + q).toFixed(12);
    } else {
      const v = this._vadeliHesapHam();
      const a = v.assets.find(x => x.asset === asset);
      if (!a || q > a.maxWithdrawAmount + 1e-9) throw yetersiz();
      if (asset === 'USDT') this.bakiye -= q; else this.varliklar[asset] = +((this.varliklar[asset] || 0) - q).toFixed(12);
      this.spotCuzdan[asset] = +((this.spotCuzdan[asset] || 0) + q).toFixed(12);
    }
    for (const k of Object.keys(this.spotCuzdan)) if (Math.abs(this.spotCuzdan[k]) < EPS) delete this.spotCuzdan[k];
    for (const k of Object.keys(this.varliklar)) if (Math.abs(this.varliklar[k]) < EPS) delete this.varliklar[k];
    const kayit = { tranId: 900000 + (++this.sira), type, asset, amount: String(q), status: 'CONFIRMED', timestamp: Date.now() };
    this.aktarimlar.push(kayit);
    if (this.aktarimlar.length > 500) this.aktarimlar.splice(0, this.aktarimlar.length - 500);
    this._kaydet();
    if (h && h.gitti) throw h.hata;
    if (this.aktarimBeklet.has(this._aktarimSayac)) throw new ccxt.ExchangeError('binance {"code":-5012,"msg":"Asset transfer is in progress."}');
    return { tranId: kayit.tranId };
  }

  async sapiGetAssetTransfer(params = {}) {
    const h = this._hata('sapiGetAssetTransfer'); if (h) throw h.hata;
    const bas = params.startTime != null ? +params.startTime : -Infinity, bit = params.endTime != null ? +params.endTime : Infinity;
    const rows = this.aktarimlar.filter(x => x.type === params.type && x.timestamp >= bas && x.timestamp <= bit).slice().reverse().slice(0, +params.size || 10);
    return { total: rows.length, rows: rows.map(x => ({ ...x })) };
  }

  /** Test yardımcısı: borsaya elle (yabancı) emir koy. */
  yabanciEmirKoy(symbol, fiyat, miktar = 1) {
    const o = { id: String(++this.sira), clientOrderId: 'web_elle_123', symbol, type: 'limit',
      side: 'buy', amount: miktar, price: fiyat, filled: 0, status: 'open', timestamp: Date.now() };
    this.emirler.set(o.id, o);
    return o;
  }
}

module.exports = { KagitBorsa, pazarKur, GUN };
