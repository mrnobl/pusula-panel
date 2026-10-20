/**
 * ÇOKLU VARLIK (Binance USDⓈ-M Multi-Assets Mode) — BTC ayağının GERÇEK TASARIMI.
 * PLAN-GERCEK-PARA-2027.md (A aşaması); referans/ARASTIRMA-HUCUM-PIYASA.md §1.1; PLAN-BINDIRME-MARJ.md §2.
 *
 * Neden: Hücum/Denge'nin ölçülen sistemi BTC'yi SPOT tutar ve vadeli hesapta TEMİNAT sayar (h = %95). Binance'te bu,
 * BTC'nin USDⓈ-M VADELİ cüzdanında durması + hesabın çoklu varlık modunda olması demektir. Spot cüzdandaki BTC teminat
 * sayılmaz. Bu modül o akışı yürütür:
 *
 *   ALIM  : [süpür: kendi spot BTC'si → vadeli] → (dilim başına) USDT vadeli → spot (UMFUTURE_MAIN) → spot PİYASA alımı
 *           → spottaki BTC → vadeli (MAIN_UMFUTURE) → … → [iade: kendi spot USDT'si → vadeli]
 *   SATIM : (dilim başına) BTC vadeli → spot (UMFUTURE_MAIN) → spot PİYASA satışı → USDT → vadeli (MAIN_UMFUTURE)
 *   ACİL  : satımın kilit kapısı gevşetilmiş hâli; dilim sınırı büyük; aktarım reddinde dilim küçültülür; her satıştan
 *           sonra USDT iadesi (eksi USDT kapanır → çekilebilir BTC büyür → sonraki dilim). Kol pozisyonları ÖNCE kapanır
 *           (bindirmeBot.acilDurdur; kapanamazsa BTC teminatı ÇEKİLMEZ).
 *
 * DİLİM: kol pozisyonları vadeli USDT'nin bir kısmını başlangıç marjına bağlar (maxWithdrawAmount). Alım dilimlenir:
 * çekilebilir USDT'nin `dilimPay`'i (0,5) spota → alım → BTC vadeliye geri (teminat marjı geri getirir) → sonraki dilim.
 * MARJ KAPISI: risk artıran akıştan önce ve HER dilimde hesap marj oranı < `marjKapisi` (%30) olmalı; aktarım tutarı,
 * aktarım sonrası oran kapıyı aşmayacak kadar sınırlanır.
 *
 * GÜVENLİK İLKELERİ (yurutucu.js ile aynı):
 *   · TEK AKIŞ: hesap başına tek CokluVarlik (ikinci örnek reddedilir) ve örnek içinde tek akış (söz kilidi). Acil
 *     durdurma "acil nesli"ni artırır: süren alımın risk artıran sonraki adımı yapılmaz (IPTAL); acil süren akışı
 *     `acilBeklemeMs` kadar bekler, sonra satar.
 *   · DEFTER ÖNCE: her adım göndermeden ÖNCE `coklu-varlik.json`a "GONDERILIYOR" yazılır (atomik) + `coklu-varlik.jsonl`
 *     (yalnız eklenir). Çökmede GONDERILIYOR → BILINMIYOR. Durum dosyası BOZUKSA kapalı-başarısız: yedek
 *     `.bozuk-<zaman>.bak`, ENGEL (yalnız acil serbest), sayaçlar jsonl'den kurtarılır (emir kimliği yeniden kullanılmaz).
 *   · HATA SINIFI (`yurutucu.hataSinifi`): RED → adım RED, akış biter; HIZ → istek atılmadı, akış durur;
 *     BELIRSIZ/SAAT → SORGU:
 *       spot emir : aynı clientOrderId ile `GET /api/v3/order`. Borsada HANGİ durumda bulunursa bulunsun YENİDEN
 *                   GÖNDERİLMEZ; NEW/PARTIALLY_FILLED kalırsa akış BELIRSIZ (spot kimliği yalnız AÇIK emirler arasında
 *                   tekil — dolmuş emri aynı kimlikle yeniden göndermek ÇİFT ALIM olur).
 *       aktarım   : `GET /sapi/v1/asset/transfer` (pencere adım zamanından başlar; bilinen tranId'ler hariç) VE spot
 *                   bakiye farkı BİRLİKTE; geçmiş gecikirse yalnız bakiye farkı.
 *     Yalnız borsada HİÇ bulunamazsa aynı kimlikle BİR kez yeniden gönderilir.
 *   · ADANMIŞ HESAP: spot cüzdanda akışın bıraktığı kalıntı (`kalinti`) dışında bakiye (yabancı) → akış başlamaz,
 *     mutabakat ENGEL. Süpürme/iade/acil yalnız kendi miktarına dokunur.
 *   · KAPILAR: canlıda emir kilidi (acil hariç), canlıda mod otomatik AÇILMAZ; alım yalnız yürütücü AKTIF iken;
 *     alım nominali ≤ `maxPozisyonNominal`; demo (sapi yok) → akış yok (mod okuma/açma serbest).
 *   · MUTABAKAT: mod kapalı + vadelide BTC → ENGEL; vadeli BTC ≠ beklenen (elle / otomatik çevrim) → ENGEL; yabancı spot
 *     bakiye → ENGEL; kendi kalıntısı → uyarı.
 *
 * İSTEKLER ccxt "implicit" ham uçlarıyla (`binanceusdm` sınıfı binance'in tüm uçlarını taşır):
 *   fapiPrivateGetMultiAssetsMargin / fapiPrivatePostMultiAssetsMargin · fapiPrivateV2GetAccount · fapiPublicGetAssetIndex
 *   privateGetAccount / privatePostOrder / privateGetOrder / publicGetTickerPrice / publicGetExchangeInfo (api/v3 — spot)
 *   sapiPostAssetTransfer / sapiGetAssetTransfer (sapi — DEMO'DA YOK: ccxt demo URL tablosunda sapi yok)
 * Kâğıt karşılığı `KagitBorsa` aynı adları taklit eder (uçtan uca test: scripts/coklu-varlik-selftest.js).
 *
 * GERÇEK PARA MODU BU SÜRÜMDE KAPALI (server.js mod yalnız kagit | demo); bu modül kâğıtta çalışır, canlı kapısı hazırdır.
 */
const fs = require('fs');
const path = require('path');
const { hataSinifi } = require('./yurutucu');
const kimlik = require('./emirKimligi');

const GUN = 864e5;
const BEKLENEN_TOL = 1e-4;          // vadeli BTC ↔ beklenen göreli tolerans
const ZAMAN_PAYI = 60000;           // aktarım geçmişi penceresi: adım zamanı − saat payı (denetim D1, 62.1: 2 sn → 60 sn; bilinen tranId'ler zaten elenir)
const SON_DURUM = new Set(['FILLED', 'EXPIRED', 'CANCELED', 'REJECTED', 'EXPIRED_IN_MATCH']);
const GEREKLI_UCLAR = ['fapiPrivateGetMultiAssetsMargin', 'fapiPrivatePostMultiAssetsMargin', 'fapiPrivateV2GetAccount',
  'privateGetAccount', 'privatePostOrder', 'privateGetOrder', 'publicGetTickerPrice', 'sapiPostAssetTransfer', 'sapiGetAssetTransfer'];

/** Hesap başına tek örnek (aynı API anahtarı ya da aynı borsa nesnesi). Aynı dizinli örnek = aynı bot (yeniden kurulum). */
const HESAP_ANAHTAR = new Map();
const HESAP_NESNE = new WeakMap();

/** Akış hatası: tur RED | BELIRSIZ | GERI_CEKILME | KAPI | AG | IPTAL */
class AkisHatasi extends Error {
  constructor(m, tur) { super(m); this.name = 'AkisHatasi'; this.tur = tur; }
}

const sayi = (x) => { const v = +x; return Number.isFinite(v) ? v : 0; };
/** Aşağı yuvarla (8 ondalık — Binance aktarım hassasiyeti). */
const asagi8 = (x) => (x > 0 ? Math.floor(x * 1e8 + 1e-6) / 1e8 : 0);
const ondalikSayisi = (adim) => { const s = String(adim); if (/e-/.test(s)) return +s.split('e-')[1]; const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
/** Adıma aşağı yuvarla. */
const adimaAsagi = (x, adim) => (x > 0 ? +(Math.floor(x / adim + 1e-6) * adim).toFixed(ondalikSayisi(adim)) : 0);   // 1e-6 adım: kayan nokta payı
const metin = (x) => String(+(+x).toFixed(8));

class CokluVarlik {
  /**
   * @param y CanliYurutucu (borsa, ortam, durum, kilitAcik, borsaIstegi, ayar.maxPozisyonNominal)
   * @param ayar { dizin, varlik ('BTC'), etiket (≤ 8 harf/rakam), kaydet, minNominal (5), maxDilim (12), acilMaxDilim (60),
   *               dilimPay (0,5), tampon (0,003), modOtomatikAc (true; canlıda her zaman kapalı), marjKapisi (0,30),
   *               sorguBekleme ([0, 500, 2000] ms), tozUsdt (1), acilBeklemeMs (60 000), uyu (ms → Promise) }
   */
  constructor(y, ayar = {}) {
    this.y = y;
    this.ayar = { varlik: 'BTC', etiket: 'cv', minNominal: 5, maxDilim: 12, acilMaxDilim: 60, dilimPay: 0.5, tampon: 0.003, modOtomatikAc: true,
      marjKapisi: 0.30, sorguBekleme: [0, 500, 2000], tozUsdt: 1, acilBeklemeMs: 60e3, ...ayar };
    if (!/^[a-z0-9]{1,8}$/.test(this.ayar.etiket)) throw new Error(`çoklu varlık etiketi geçersiz: ${this.ayar.etiket}`);
    this.spotSembol = `${this.ayar.varlik}USDT`;
    this.kaydet = ayar.kaydet || (() => {});
    this.uyu = ayar.uyu || (y && typeof y.uyu === 'function' ? y.uyu : (ms) => new Promise(r => setTimeout(r, ms)));
    this.dosya = ayar.dizin ? path.join(ayar.dizin, 'coklu-varlik.json') : null;
    this.gunlukDosya = ayar.dizin ? path.join(ayar.dizin, 'coklu-varlik.jsonl') : null;
    this._kurallar = null;
    this._kilit = null;              // tek akış söz kilidi
    this._acilNesil = 0;             // acil durdurma sayacı (süren alımı keser)
    this.durum = { sayac: 0, akisSayac: 0, acik: null, gecmis: [], beklenenBtc: null, kalinti: { USDT: 0, BTC: 0 }, kalintiBekleyen: null,
      bozuk: null, sonMod: null, sonMutabakat: null };
    if (this.dosya && fs.existsSync(this.dosya)) {
      try { this.durum = { ...this.durum, ...JSON.parse(fs.readFileSync(this.dosya, 'utf8')) }; }
      catch (e) {
        // KAPALI-BAŞARISIZ: bozuk dosya sessizce sıfırlanmaz (açık/belirsiz akış bilgisi kaybolmuş olabilir).
        const yedek = `${this.dosya}.bozuk-${Date.now()}.bak`;
        try { fs.copyFileSync(this.dosya, yedek); } catch { /* yedek alınamadı — mesajda yazar */ }
        this.durum.bozuk = `durum dosyası bozuk (${e.message.slice(0, 80)}) — yedek ${path.basename(yedek)}; borsayı elle incele (Transfer/Order History), sonra "Engeli kaldır"`;
        this.kaydet('ERROR', `çoklu varlık: ${this.durum.bozuk}`);
      }
    }
    this._sayaclariKurtar();
    if (!this.durum.kalinti) this.durum.kalinti = { USDT: 0, BTC: 0 };
    const a = this.durum.acik;
    if (a && !this.durum.bozuk) {
      // Çökme: gönderilmekte olan adım BİLİNMİYOR; açık kalan akış BELIRSIZ (yeni akış açılmaz, coz() çözer).
      let bilinmeyen = false;
      for (const s of a.adimlar || []) if (s.durum === 'GONDERILIYOR' || s.durum === 'BILINMIYOR') { s.durum = 'BILINMIYOR'; bilinmeyen = true; }
      if (bilinmeyen) a.durum = 'BELIRSIZ';
      else {
        this._bitir(a, 'KESILDI', 'süreç akış ortasında durdu (bilinmeyen adım yok) — kalan bakiye sonraki akışta süpürülür');
        this.durum.beklenenBtc = null; this.durum.kalintiBekleyen = a.yabanci || { USDT: 0, BTC: 0 };
      }
    }
  }

  /** emir kimliği / akış sayaçları: durum dosyası ile jsonl günlüğünün EN BÜYÜĞÜ (aynı kimlik asla yeniden kullanılmaz). */
  _sayaclariKurtar() {
    let s = +this.durum.sayac || 0, a = +this.durum.akisSayac || 0;
    if (this.gunlukDosya && fs.existsSync(this.gunlukDosya)) {
      for (const satir of fs.readFileSync(this.gunlukDosya, 'utf8').split('\n')) {
        if (!satir.trim()) continue;
        let k; try { k = JSON.parse(satir); } catch { continue; }
        const m = k.cid && /-(\d{6})$/.exec(k.cid); if (m) s = Math.max(s, +m[1]);
        const n = (k.akis || k.id) && /^cv-\d{8}-(\d+)-/.exec(k.akis || k.id); if (n) a = Math.max(a, +n[1]);
      }
    }
    if (this.durum.bozuk && !this.gunlukDosya) s += 1000;     // günlük yoksa güvenli sıçrama
    this.durum.sayac = s; this.durum.akisSayac = a;
  }

  /** Borsa nesnesi bu akışın uçlarını taşıyor mu (ccxt binanceusdm ya da KagitBorsa). */
  static destekler(b) { return !!b && GEREKLI_UCLAR.every(n => typeof b[n] === 'function'); }

  /**
   * Ortam cüzdan aktarımını (sapi) taşıyor mu. ccxt Binance DEMO URL tablosunda `sapi` yok ("demotrading does not support
   * sapi endpoints") → demo'da aktarım YAPILAMAZ; kâğıt borsada (urls yok) taklit var.
   */
  static aktarimVar(b) {
    if (!b || typeof b.sapiPostAssetTransfer !== 'function') return false;
    const api = b.urls && b.urls.api;
    return !api || typeof api !== 'object' || !!api.sapi;
  }

  // ── Kalıcılık ─────────────────────────────────────────────────────────
  _yaz() {
    if (!this.dosya) return;
    fs.mkdirSync(path.dirname(this.dosya), { recursive: true });
    const gecici = this.dosya + '.tmp';
    fs.writeFileSync(gecici, JSON.stringify(this.durum, null, 2), 'utf8');
    fs.renameSync(gecici, this.dosya);
  }

  _gunluk(kayit) {
    if (!this.gunlukDosya) return;
    try { fs.mkdirSync(path.dirname(this.gunlukDosya), { recursive: true }); fs.appendFileSync(this.gunlukDosya, JSON.stringify({ zaman: Date.now(), ...kayit }) + '\n', 'utf8'); } catch { /* günlük yazılamadı — durum dosyası asıl kayıt */ }
  }

  // ── Hesap sahipliği (hesap başına tek çoklu varlık botu) ───────────────
  _hesapSahibi() {
    const b = this.y && this.y.borsa;
    if (!b) return;
    const anahtar = typeof b.apiKey === 'string' && b.apiKey ? `k:${b.apiKey}` : null;
    const onceki = anahtar ? HESAP_ANAHTAR.get(anahtar) : HESAP_NESNE.get(b);
    if (onceki && onceki !== this && !onceki._birakildi && !(this.dosya && onceki.dosya === this.dosya)) {
      throw new AkisHatasi('bu borsa hesabında başka bir çoklu varlık botu var — hesap başına tek bot (ayrı alt hesap kullanın)', 'KAPI');
    }
    if (anahtar) HESAP_ANAHTAR.set(anahtar, this); else HESAP_NESNE.set(b, this);
  }

  /** Örneği hesaptan bırakır (bot kaldırıldı / test). */
  birak() { this._birakildi = true; }

  // ── İstek kapısı ──────────────────────────────────────────────────────
  async _cagir(ad, params = {}, okuma = true) {
    const b = this.y && this.y.borsa;
    if (!b) throw new Error('borsaya bağlı değil');
    if (typeof b[ad] !== 'function') throw new AkisHatasi(`borsa ${ad} ucunu desteklemiyor`, 'RED');
    const fn = () => b[ad](params);
    // Yürütücünün geri çekilme / saat kapısı (418/429'da istek atılmaz; okuma -1021'de bir kez yeniden).
    return typeof this.y.borsaIstegi === 'function' ? this.y.borsaIstegi(fn, okuma) : fn();
  }

  _kapi({ riskArtiran = false, acil = false, nesil = null } = {}) {
    if (!this.y || !this.y.borsa) throw new AkisHatasi('borsaya bağlı değil', 'KAPI');
    this._hesapSahibi();
    if (this.durum.bozuk && !acil) throw new AkisHatasi(this.durum.bozuk, 'KAPI');
    if (!CokluVarlik.aktarimVar(this.y.borsa)) throw new AkisHatasi('bu borsa ortamı cüzdan aktarımını (sapi/v1/asset/transfer) desteklemiyor (Binance Demo ortamında yok); çoklu varlık akışı yalnız kâğıt ya da gerçek hesapta', 'KAPI');
    if (this.y.ortam === 'live' && !this.y.kilitAcik && !acil) throw new AkisHatasi('canlıda emir kilidi KAPALI — çoklu varlık akışı yapılmadı', 'KAPI');
    if (riskArtiran && this.y.durum !== 'AKTIF') throw new AkisHatasi(`yürütücü ${this.y.durum} — risk artıran akış (alım) yapılmaz`, 'KAPI');
    if (nesil != null && nesil !== this._acilNesil) throw new AkisHatasi('acil durdurma — akış kesildi', 'IPTAL');
    const a = this.durum.acik;
    if (!acil && a && a.durum === 'BELIRSIZ') throw new AkisHatasi(`çözülmemiş belirsiz akış (${a.id}) — önce mutabakat`, 'BELIRSIZ');
  }

  /** Mod okuma/açma kapısı: aktarım (sapi) GEREKMEZ — demo'da da çalışır. Canlıda kilit gerekir. */
  _modKapisi() {
    if (!this.y || !this.y.borsa) throw new AkisHatasi('borsaya bağlı değil', 'KAPI');
    if (this.y.ortam === 'live' && !this.y.kilitAcik) throw new AkisHatasi('canlıda emir kilidi KAPALI — mod değiştirilmedi', 'KAPI');
  }

  /** Tek akış: önceki akış bitmeden yenisi başlamaz. */
  _sirada(fn) {
    const onceki = this._kilit || Promise.resolve();
    let coz;
    const benim = new Promise(r => { coz = r; });
    this._kilit = onceki.then(() => benim);
    return onceki.then(async () => { try { return await fn(); } finally { coz(); } });
  }

  // ── Okumalar ──────────────────────────────────────────────────────────
  /** Çoklu varlık modu açık mı (GET /fapi/v1/multiAssetsMargin). */
  async modOku() {
    const r = await this._cagir('fapiPrivateGetMultiAssetsMargin', {}, true);
    const acik = !!r && (r.multiAssetsMargin === true || r.multiAssetsMargin === 'true');
    this.durum.sonMod = { zaman: Date.now(), acik };
    return acik;
  }

  /** Modu açar (POST /fapi/v1/multiAssetsMargin multiAssetsMargin=true). İdempotent: açıksa istek yok. */
  async modAc() {
    if (await this.modOku()) return { degisti: false, acik: true };
    this._modKapisi();
    let hata = null;
    try { await this._cagir('fapiPrivatePostMultiAssetsMargin', { multiAssetsMargin: 'true' }, false); } catch (e) { hata = e; }
    // Cevap ne olursa olsun (belirsiz ya da -4171 "zaten aynı") gerçek durum yeniden okunur.
    const acik = await this.modOku();
    this._yaz();
    if (!acik) throw new AkisHatasi(`çoklu varlık modu açılamadı${hata ? `: ${hata.message}` : ''} (izole marjlı pozisyon varsa önce çapraz yapın)`, 'RED');
    this.kaydet('WARN', 'Binance çoklu varlık (Multi-Assets) modu AÇILDI');
    this._gunluk({ tur: 'mod', acik: true, hata: hata ? hata.message : null });
    return { degisti: true, acik: true };
  }

  /** Spot cüzdan HAM (yabancı dahil): { USDT, BTC } (free). */
  async spotBakiye() {
    const r = await this._cagir('privateGetAccount', {}, true);
    const out = { USDT: 0, [this.ayar.varlik]: 0 };
    for (const x of (r && r.balances) || []) if (x.asset in out) out[x.asset] = sayi(x.free);
    return out;
  }

  /** Bekleyen kalıntı tabanı (çökme sonrası / elle kabul): mevcut spot − kayıtlı yabancı = kendi kalıntısı. */
  _kalintiBekleyenUygula(s) {
    const y = this.durum.kalintiBekleyen;
    if (!y) return;
    const v = this.ayar.varlik;
    this.durum.kalinti = { USDT: Math.max(0, s.USDT - (y.USDT || 0)), [v]: Math.max(0, s[v] - (y[v] || 0)) };
    this.durum.kalintiBekleyen = null;
    this._yaz();
  }

  /** Spot cüzdanda bu botun payı (kalıntı ile sınırlı) — özsermaye / BTC toplamı için. */
  async spotKendi() {
    const s = await this.spotBakiye();
    this._kalintiBekleyenUygula(s);
    const k = this.durum.kalinti || { USDT: 0, BTC: 0 };
    const v = this.ayar.varlik;
    return { USDT: Math.min(s.USDT, (k.USDT || 0) + this.ayar.tozUsdt), [v]: Math.min(s[v], (k[v] || 0) + this._btcTol()), ham: s };
  }

  _btcTol() { return (this._kurallar && this._kurallar.adim) || 0.00001; }

  /** Spotta kalıntı dışı (yabancı) bakiye. */
  _yabanci(s) {
    const k = this.durum.kalinti || { USDT: 0, BTC: 0 };
    const v = this.ayar.varlik;
    return { USDT: Math.max(0, s.USDT - (k.USDT || 0)), [v]: Math.max(0, s[v] - (k[v] || 0)) };
  }

  _yabanciVarMi(y) { return y.USDT >= this.ayar.tozUsdt || y[this.ayar.varlik] > this._btcTol() * 1.5; }

  /** Vadeli hesap: cüzdanlar, çekilebilir tutarlar, marj bakiyesi, bakım marjı, oran. */
  async vadeliHesap() {
    const r = await this._cagir('fapiPrivateV2GetAccount', {}, true);
    const a = (ad) => ((r && r.assets) || []).find(x => x.asset === ad) || {};
    const u = a('USDT'), b = a(this.ayar.varlik);
    const mb = sayi(r && r.totalMarginBalance), mm = sayi(r && r.totalMaintMargin);
    return {
      mod: r && r.multiAssetsMargin != null ? (r.multiAssetsMargin === true || r.multiAssetsMargin === 'true') : null,
      usdt: { cuzdan: sayi(u.walletBalance), cekilebilir: sayi(u.maxWithdrawAmount) },
      btc: { cuzdan: sayi(b.walletBalance), cekilebilir: sayi(b.maxWithdrawAmount) },
      marjBakiyesi: mb, bakim: mm, marjOrani: mb > 0 ? mm / mb : (mm > 0 ? Infinity : null),
    };
  }

  async spotFiyat() {
    const r = await this._cagir('publicGetTickerPrice', { symbol: this.spotSembol }, true);
    const f = sayi(r && r.price);
    if (!(f > 0)) throw new Error(`${this.spotSembol} spot fiyatı yok`);
    return f;
  }

  /** Spot LOT_SIZE adımı ve asgari nominal (önbellekli). */
  async spotKurallar() {
    if (this._kurallar) return this._kurallar;
    let adim = 0.00001, minNominal = 5;
    try {
      const r = await this._cagir('publicGetExchangeInfo', { symbol: this.spotSembol }, true);
      const s = ((r && r.symbols) || []).find(x => x.symbol === this.spotSembol);
      for (const f of (s && s.filters) || []) {
        if (f.filterType === 'LOT_SIZE' && sayi(f.stepSize) > 0) adim = sayi(f.stepSize);
        if ((f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL') && sayi(f.minNotional) > 0) minNominal = sayi(f.minNotional);
      }
    } catch (e) { this.kaydet('WARN', `spot kuralları okunamadı (${e.message}) — varsayılan adım ${adim}, asgari ${minNominal} USDT`); }
    this._kurallar = { adim, minNominal: Math.max(minNominal, this.ayar.minNominal) };
    return this._kurallar;
  }

  /** BTC ayağının borsadaki toplamı (vadeli teminat + KENDİ spot kalıntısı; yabancı bakiye sayılmaz). */
  async btcToplam() {
    const [v, s] = await Promise.all([this.vadeliHesap(), this.spotKendi()]);
    const q = s[this.ayar.varlik];
    return { vadeli: v.btc.cuzdan, spot: q, toplam: +(v.btc.cuzdan + q).toFixed(12), spotUsdt: s.USDT, yabanci: this._yabanci(s.ham) };
  }

  /** Panel/rapor özeti: mod, cüzdanlar, iskontolu teminat değeri, marj oranı. Hata atmaz. */
  async teminat() {
    try {
      const [mod, v, s, f] = await Promise.all([this.modOku(), this.vadeliHesap(), this.spotBakiye(), this.spotFiyat()]);
      let iskonto = null;
      try { const ai = await this._cagir('fapiPublicGetAssetIndex', { symbol: `${this.ayar.varlik}USD` }, true); iskonto = ai && ai.bidBuffer != null ? sayi(ai.bidBuffer) : null; } catch { /* yalnız bilgi */ }
      return { mod, vadeliBtc: v.btc.cuzdan, spotBtc: s[this.ayar.varlik], spotUsdt: s.USDT, fiyat: f, iskonto,
        teminatDegeri: mod ? v.btc.cuzdan * f * (1 - (iskonto ?? 0.05)) : 0, marjBakiyesi: v.marjBakiyesi, bakim: v.bakim, marjOrani: v.marjOrani };
    } catch (e) { return { hata: e.message }; }
  }

  // ── Adım yürütme (defter önce, belirsizde sorgu) ──────────────────────
  _bilinenTranId() {
    const s = new Set();
    const ekle = (a) => { for (const x of (a && a.adimlar) || []) if (x.sonuc && x.sonuc.tranId != null) s.add(String(x.sonuc.tranId)); };
    for (const a of this.durum.gecmis || []) ekle(a);
    ekle(this.durum.acik);
    return s;
  }

  async _gonder(adim) {
    if (adim.tur === 'aktar') {
      const r = await this._cagir('sapiPostAssetTransfer', { type: adim.tip, asset: adim.varlik, amount: metin(adim.miktar) }, false);
      if (!r || r.tranId == null) throw new Error(`aktarım cevabı geçersiz: ${JSON.stringify(r).slice(0, 80)}`);   // → BELIRSIZ
      return { tranId: String(r.tranId) };
    }
    const r = await this._cagir('privatePostOrder', { symbol: this.spotSembol, side: adim.side, type: 'MARKET', quantity: metin(adim.miktar),
      newClientOrderId: adim.cid, newOrderRespType: 'FULL' }, false);
    if (!r || r.orderId == null || !r.status) throw new Error(`spot emir cevabı geçersiz: ${JSON.stringify(r).slice(0, 80)}`);   // → BELIRSIZ
    if (!SON_DURUM.has(r.status)) { const e = new Error(`spot emir sonuçlanmadı (${r.status})`); e.surmede = true; throw e; }      // → sorgu, yeniden gönderim YOK
    return this._emirSonucu(r);
  }

  _emirSonucu(r) {
    let ucretBtc = 0, ucretUsdt = 0;
    const ucretBilinmiyor = !Array.isArray(r.fills);
    for (const f of r.fills || []) { if (f.commissionAsset === this.ayar.varlik) ucretBtc += sayi(f.commission); else if (f.commissionAsset === 'USDT') ucretUsdt += sayi(f.commission); }
    return { orderId: String(r.orderId), durum: r.status, dolan: sayi(r.executedQty), tutar: sayi(r.cummulativeQuoteQty), ucretBtc: ucretBilinmiyor ? null : ucretBtc, ucretUsdt, ucretBilinmiyor };
  }

  async _aktarimSpot(varlik) { const s = await this.spotBakiye(); return s[varlik] || 0; }

  /**
   * Belirsiz adımı sorgular. @returns {{ bulundu, sonuc, kanit } | { yok: true } | { okunamadi: true, hata }}
   * Spot: borsada bulunan emir (her durum) yeniden gönderilmez; NEW/PARTIALLY_FILLED kalırsa okunamadi (BELIRSIZ).
   * Aktarım: geçmiş (adım zamanından) VE spot bakiye farkı birlikte; geçmiş boşsa yalnız bakiye farkı.
   */
  async _sorgula(adim) {
    let son = null, okunan = 0, surmede = null;
    for (const ms of this.ayar.sorguBekleme) {
      if (ms > 0) await this.uyu(ms);
      try {
        if (adim.tur === 'spot') {
          try {
            const o = await this._cagir('privateGetOrder', { symbol: this.spotSembol, origClientOrderId: adim.cid }, true);
            okunan++;
            if (o && SON_DURUM.has(o.status)) return { bulundu: true, sonuc: this._emirSonucu(o), kanit: 'emir sorgusu' };
            if (o && o.status) surmede = o.status;                // NEW / PARTIALLY_FILLED / PENDING_NEW — beklemeye devam
          } catch (e) {
            if (hataSinifi(e) === 'BULUNAMADI') { okunan++; continue; }
            throw e;
          }
        } else {
          const simdi = await this._aktarimSpot(adim.varlik);
          const fark = adim.tip === 'MAIN_UMFUTURE' ? adim.onceSpot - simdi : simdi - adim.onceSpot;
          const bakiyeTutar = Math.abs(fark - adim.miktar) <= Math.max(1e-8, adim.miktar * 1e-6);
          // D1 (62.1): adım zamanı YEREL saat, borsa kaydı SUNUCU saati — ccxt timeDifference (yerel − sunucu) ile borsa saatine çevrilir.
          const td = (this.y.borsa && this.y.borsa.options && Number.isFinite(+this.y.borsa.options.timeDifference)) ? +this.y.borsa.options.timeDifference : 0;
          const r = await this._cagir('sapiGetAssetTransfer', { type: adim.tip, startTime: adim.zaman - td - ZAMAN_PAYI, endTime: Date.now() + 60e3, size: 100 }, true);
          okunan++;
          const bilinen = this._bilinenTranId();
          const satirlar = ((r && r.rows) || []).filter(k => k.asset === adim.varlik && Math.abs(sayi(k.amount) - adim.miktar) < 1e-8
            && !bilinen.has(String(k.tranId)) && sayi(k.timestamp) >= adim.zaman - td - ZAMAN_PAYI && k.status !== 'FAILED');
          const x = satirlar[0];
          if (x && bakiyeTutar) return { bulundu: true, sonuc: { tranId: String(x.tranId) }, kanit: 'aktarım geçmişi + bakiye' };
          if (!x && bakiyeTutar) return { bulundu: true, sonuc: { tranId: null }, kanit: 'spot bakiye farkı' };
          // Kayıt PENDING ve bakiye henüz değişmemiş → bekle; CONFIRMED ama bakiye değişmemiş → bizim değil (eski/yabancı kayıt).
          if (x && !bakiyeTutar && String(x.status).toUpperCase() === 'PENDING') surmede = 'aktarım kaydı PENDING, bakiye henüz değişmedi';
        }
      } catch (e) { son = e; if (e && e.kod === 'GERI_CEKILME') break; }
    }
    if (surmede) return { okunamadi: true, hata: `borsada bulundu ama sonuçlanmadı: ${surmede}` };
    if (okunan === 0) return { okunamadi: true, hata: son ? son.message : 'sorgu yapılamadı' };
    return { yok: true };
  }

  _tamam(akis, adim, sonuc, kanit) {
    adim.durum = 'TAMAM'; adim.sonuc = sonuc; if (kanit) adim.kanit = kanit;
    this._yaz();
    this._gunluk({ tur: 'adim', akis: akis.id, no: adim.no, adim: adim.tur, tip: adim.tip || adim.side, varlik: adim.varlik, miktar: adim.miktar, cid: adim.cid || null, durum: 'TAMAM', sonuc, kanit: kanit || null });
  }

  /** Bir adımı defter-önce yürütür. @returns adim (TAMAM) — aksi AkisHatasi. */
  async _adim(akis, tanim) {
    // Acil nesli değiştiyse ESKİ akışın HİÇBİR adımı yapılmaz (denetim O7, 62.1): eskiden yalnız risk artıran adımlar (USDT → spot,
    // spot ALIM) duruyordu; risk artırmayan adımlar (BTC → vadeli aktarım, USDT iadesi) acil satışla aynı bakiyeye dokunup birini
    // "yetersiz bakiye" ile düşürebiliyordu. Kalan bakiyeyi acil satış (btcToplam) ve sonraki kalıntı süpürmesi toplar.
    if (akis.nesil != null && akis.nesil !== this._acilNesil) throw new AkisHatasi(tanim.riskArtiran ? 'acil durdurma — alım kesildi' : 'acil durdurma — akış kesildi', 'IPTAL');
    const adim = { no: akis.adimlar.length + 1, ...tanim, durum: 'GONDERILIYOR', zaman: Date.now() };
    if (adim.tur === 'aktar') adim.onceSpot = await this._aktarimSpot(adim.varlik);
    if (adim.tur === 'spot') { this.durum.sayac = (this.durum.sayac || 0) + 1; adim.cid = kimlik.uret(this.ayar.etiket, this.durum.sayac); }
    akis.adimlar.push(adim);
    this._yaz();
    this._gunluk({ tur: 'adim', akis: akis.id, no: adim.no, adim: adim.tur, tip: adim.tip || adim.side, varlik: adim.varlik, miktar: adim.miktar, cid: adim.cid || null, durum: 'GONDERILIYOR' });
    for (let deneme = 0; deneme < 2; deneme++) {
      try {
        const r = await this._gonder(adim);
        this._tamam(akis, adim, r);
        return adim;
      } catch (e) {
        if (e instanceof AkisHatasi) { adim.durum = 'GONDERILMEDI'; adim.hata = e.message; this._yaz(); throw e; }
        const s = e && e.kod === 'GERI_CEKILME' ? 'HIZ' : (e && e.surmede ? 'BELIRSIZ' : hataSinifi(e));
        if (s === 'HIZ') {
          adim.durum = 'GONDERILMEDI'; adim.hata = e.message; this._yaz();
          throw new AkisHatasi(`geri çekilme (istek atılmadı / hız sınırı): ${e.message}`, 'GERI_CEKILME');
        }
        if (s === 'RED') {
          adim.durum = 'RED'; adim.hata = e.message; this._yaz();
          this._gunluk({ tur: 'adim', akis: akis.id, no: adim.no, durum: 'RED', hata: e.message });
          throw new AkisHatasi(e.message, 'RED');
        }
        adim.durum = 'BILINMIYOR'; adim.hata = e.message; this._yaz();
        this._gunluk({ tur: 'adim', akis: akis.id, no: adim.no, durum: 'BILINMIYOR', hata: e.message });
        const q = await this._sorgula(adim);
        if (q.bulundu) { this._tamam(akis, adim, q.sonuc, q.kanit); return adim; }
        if (q.okunamadi || e.surmede) {
          akis.durum = 'BELIRSIZ'; this._yaz();
          this.kaydet('ERROR', `çoklu varlık: adım ${adim.no} (${adim.tur} ${adim.tip || adim.side} ${adim.miktar}) BELİRSİZ: ${q.hata || e.message}`);
          throw new AkisHatasi(`belirsiz sonuç çözülemedi (${adim.tur} ${adim.tip || adim.side}): ${e.message} / sorgu: ${q.hata || 'sonuçlanmadı'}`, 'BELIRSIZ');
        }
        // Borsada HİÇ yok → aynı kimlikle bir kez yeniden gönder
        adim.durum = 'GONDERILIYOR'; adim.tekrar = (adim.tekrar || 0) + 1; this._yaz();
      }
    }
    adim.durum = 'GONDERILMEDI'; this._yaz();
    throw new AkisHatasi(`adım iki denemede de borsaya ulaşmadı (${adim.tur} ${adim.tip || adim.side})`, 'AG');
  }

  // ── Akışlar ───────────────────────────────────────────────────────────
  _yeniAkis(yon, hedefMiktar, sebep, simdi = Date.now(), { nesil = this._acilNesil, zorla = false, yabanci = null } = {}) {
    const eski = this.durum.acik;
    if (eski && (eski.durum === 'SURUYOR' || eski.durum === 'BELIRSIZ')) {
      if (!zorla) throw new AkisHatasi(`süren akış var (${eski.id} ${eski.durum}) — tek akış`, 'KAPI');
      this._bitir(eski, 'KESILDI', `acil durdurma — akış kesildi (${eski.durum})`);
    }
    this.durum.akisSayac = (this.durum.akisSayac || 0) + 1;
    const id = `cv-${new Date(simdi).toISOString().slice(0, 10).replace(/-/g, '')}-${this.durum.akisSayac}-${yon}`;
    const akis = { id, yon, hedefMiktar, sebep: sebep || null, bas: Date.now(), durum: 'SURUYOR', nesil, yabanci: yabanci || { USDT: 0, [this.ayar.varlik]: 0 }, adimlar: [] };
    this.durum.acik = akis;
    this._yaz();
    this._gunluk({ tur: 'akis', id, yon, hedefMiktar, sebep, durum: 'SURUYOR' });
    return akis;
  }

  _bitir(akis, durum, hata = null) {
    if (akis.bit) return;                                     // zaten kapatıldı (acil kesti)
    akis.durum = durum; akis.bit = Date.now(); akis.hata = hata;
    this.durum.gecmis = [...(this.durum.gecmis || []), akis].slice(-50);
    if (this.durum.acik && this.durum.acik.id === akis.id) this.durum.acik = null;
    this._yaz();
    this._gunluk({ tur: 'akis', id: akis.id, durum, hata });
  }

  async _beklenenGuncelle() {
    try { this.durum.beklenenBtc = (await this.vadeliHesap()).btc.cuzdan; }
    catch (e) { this.durum.beklenenBtc = null; this.kaydet('WARN', `çoklu varlık: beklenen BTC okunamadı (${e.message}) — sonraki mutabakatta yeniden alınır`); }
    this._yaz();
  }

  /** Akış sonu: spottaki kendi kalıntısı (yabancı hariç) kaydedilir. */
  async _kalintiGuncelle(yabanci) {
    try {
      const s = await this.spotBakiye();
      const v = this.ayar.varlik, y = yabanci || { USDT: 0, [v]: 0 };
      this.durum.kalinti = { USDT: Math.max(0, s.USDT - (y.USDT || 0)), [v]: Math.max(0, s[v] - (y[v] || 0)) };
    } catch { this.durum.kalintiBekleyen = yabanci || { USDT: 0, [this.ayar.varlik]: 0 }; }
    this._yaz();
  }

  /** Kendi spot bakiyesi (akış başındaki yabancı payı düşülür). */
  async _kendiSpot(akis, varlik) {
    const s = await this._aktarimSpot(varlik);
    return Math.max(0, s - ((akis && akis.yabanci && akis.yabanci[varlik]) || 0));
  }

  /** Kendi spot BTC'si → vadeli (teminat olsun). */
  async _supur(akis) {
    const q = asagi8(await this._kendiSpot(akis, this.ayar.varlik));
    if (q > 0) await this._adim(akis, { tur: 'aktar', tip: 'MAIN_UMFUTURE', varlik: this.ayar.varlik, miktar: q, neden: 'süpürme' });
  }

  /** Kendi spot USDT'si → vadeli. */
  async _iade(akis) {
    const u = asagi8(await this._kendiSpot(akis, 'USDT'));
    if (u >= 0.01) await this._adim(akis, { tur: 'aktar', tip: 'MAIN_UMFUTURE', varlik: 'USDT', miktar: u, neden: 'iade' });
  }

  _sonuc() { return { miktar: 0, tutar: 0, ucretUsdt: 0, vadeliyeTasinan: 0, dilim: 0, adim: 0, hata: null, kisit: null, asgari: false, belirsiz: false, toz: 0 }; }

  _hataIsle(sonuc, akis, e) {
    sonuc.hata = e.message;
    sonuc.belirsiz = e instanceof AkisHatasi && e.tur === 'BELIRSIZ';
    sonuc.hataTuru = e instanceof AkisHatasi ? e.tur : 'BEKLENMEYEN';
  }

  async _akisSonu(akis, sonuc) {
    if (!akis) return sonuc;
    sonuc.adim = akis.adimlar.length;
    if (sonuc.belirsiz) return sonuc;                              // akış açık kalır (BELIRSIZ) — coz()
    this._bitir(akis, sonuc.hata ? (sonuc.miktar > 0 ? 'KISMI' : 'HATA') : (sonuc.kisit ? 'KISIT' : 'TAMAM'), sonuc.hata || sonuc.kisit);
    await this._beklenenGuncelle();
    await this._kalintiGuncelle(akis.yabanci);
    return sonuc;
  }

  /** Akış başında: spotta yabancı bakiye varsa akış YOK (adanmış hesap). @returns yabancı (tolerans altı) */
  async _yabanciDenetle() {
    const s = await this.spotBakiye();
    this._kalintiBekleyenUygula(s);
    const y = this._yabanci(s);
    if (this._yabanciVarMi(y)) throw new AkisHatasi(`spot cüzdanda botun olmayan bakiye var (${y.USDT} USDT, ${y[this.ayar.varlik]} ${this.ayar.varlik}) — adanmış hesap şartı; boşaltın ya da "Engeli kaldır" ile kabul edin`, 'KAPI');
    return { USDT: 0, [this.ayar.varlik]: 0 };      // tolerans altı fark kendi kalıntısı sayılır
  }

  /** Marj kapısı: oran ≥ kapı → risk artıran adım yok. */
  _marjKapisiDenetle(v) {
    if (v.marjOrani != null && v.marjOrani >= this.ayar.marjKapisi) {
      throw new AkisHatasi(`marj oranı %${(v.marjOrani * 100).toFixed(1)} ≥ kapı %${(this.ayar.marjKapisi * 100).toFixed(0)} — BTC alımı (USDT'yi vadeliden çekmek) yapılmaz`, 'KAPI');
    }
  }

  /**
   * ALIM: `miktar` BTC al, vadeli cüzdana teminat olarak taşı. Tek akış kilidinden geçer; acil nesli çağrı anında alınır.
   * @returns {{ miktar (brüt alınan), fiyat, tutar, ucretUsdt, vadeliyeTasinan, dilim, adim, hata, kisit, asgari, belirsiz }}
   */
  al(miktar, secenek = {}) {
    const nesil = this._acilNesil;
    return this._sirada(() => this._al(miktar, { ...secenek, nesil }));
  }

  async _al(miktar, { sebep = null, simdi = Date.now(), nesil } = {}) {
    const sonuc = this._sonuc();
    let akis = null;
    try {
      this._kapi({ riskArtiran: true, nesil });
      const k = await this.spotKurallar();
      const f0 = await this.spotFiyat();
      if (!(miktar > 0) || miktar * f0 < k.minNominal) { sonuc.asgari = true; return sonuc; }
      const tavan = this.y.ayar && this.y.ayar.maxPozisyonNominal;
      if (tavan > 0 && miktar * f0 > tavan) throw new AkisHatasi(`BTC alımı ${(miktar * f0).toFixed(2)} USDT > yürütücü tavanı ${tavan}`, 'KAPI');
      if (!(await this.modOku())) {
        // Canlıda mod OTOMATİK AÇILMAZ (kullanıcı elle açar — BINANCE-BAGLANTI.md §2c).
        if (!this.ayar.modOtomatikAc || this.y.ortam === 'live') throw new AkisHatasi('çoklu varlık modu KAPALI — vadelideki BTC teminat sayılmaz (BINANCE-BAGLANTI.md §2c)', 'KAPI');
        await this.modAc();
      }
      this._marjKapisiDenetle(await this.vadeliHesap());
      const yabanci = await this._yabanciDenetle();
      akis = this._yeniAkis('al', miktar, sebep, simdi, { nesil, yabanci });
      await this._supur(akis);
      let kalan = miktar;
      while (sonuc.dilim < this.ayar.maxDilim) {
        this._kapi({ riskArtiran: true, nesil });                 // her dilimde: AKTIF mi, acil geldi mi
        const f = await this.spotFiyat();
        if (kalan * f < k.minNominal) break;
        let usdt = await this._kendiSpot(akis, 'USDT');
        const ihtiyac = kalan * f * (1 + this.ayar.tampon);
        if (usdt < ihtiyac) {
          const v = await this.vadeliHesap();
          this._marjKapisiDenetle(v);
          // Aktarım sonrası oran kapıyı aşmasın: mm / (mb − aktar) ≤ kapı → aktar ≤ mb − mm / kapı
          const marjSiniri = v.bakim > 0 ? v.marjBakiyesi - v.bakim / this.ayar.marjKapisi : Infinity;
          // Dilim: gereken çekilebilire sığıyorsa tamamı; çekilebilir gerekenin ≥ %95'iyse çekilebilirin tamamı (borsa
          // maxWithdrawAmount'u marjı zaten hesaba katar); değilse çekilebilirin dilimPay'i (0,5) — BTC vadeliye dönünce büyür.
          const gerek = ihtiyac - usdt, cek = v.usdt.cekilebilir;
          const dilim = gerek <= cek ? gerek : (cek >= 0.95 * gerek ? cek : cek * this.ayar.dilimPay);
          const aktar = asagi8(Math.min(dilim, marjSiniri));
          if (aktar >= 0.01) { await this._adim(akis, { tur: 'aktar', tip: 'UMFUTURE_MAIN', varlik: 'USDT', miktar: aktar, riskArtiran: true }); usdt += aktar; }
        }
        const alQ = adimaAsagi(Math.min(kalan, usdt / (f * (1 + this.ayar.tampon)) * (1 + 1e-9)), k.adim);
        if (alQ * f < k.minNominal) {
          // KISIT (hata değil): vadeli USDT cüzdanı boş/çekilemez. Hücum'da (btcPay 1) USDT zaten BTC'ye dönmüştür; kolun
          // GERÇEKLEŞMEMİŞ kârı spota çekilemez (Binance) → ay başı ilavesi ancak gerçekleşen kârla yapılabilir
          // (PLAN-GERCEK-PARA-2027.md bulgu B1; ölçüm 860). Yeniden denenmez.
          sonuc.kisit = `vadeliden spota aktarılabilir USDT yetmedi (marj / gerçekleşmemiş kâr çekilemez) — ${kalan.toFixed(8)} ${this.ayar.varlik} alınamadı`;
          break;
        }
        const a = await this._adim(akis, { tur: 'spot', side: 'BUY', miktar: alQ, riskArtiran: true });
        const r = a.sonuc;
        sonuc.dilim++;
        sonuc.miktar += r.dolan; sonuc.tutar += r.tutar;
        const ort = r.dolan > 0 ? r.tutar / r.dolan : f;
        // Sorgu cevabında komisyon yoksa (ucretBtc null) %0,1 tahmini — gerçek net miktarı spot bakiyesi belirler.
        sonuc.ucretUsdt += (r.ucretBtc != null ? r.ucretBtc * ort : r.tutar * 0.001) + (r.ucretUsdt || 0);
        const tasi = asagi8(await this._kendiSpot(akis, this.ayar.varlik));
        if (tasi > 0) { await this._adim(akis, { tur: 'aktar', tip: 'MAIN_UMFUTURE', varlik: this.ayar.varlik, miktar: tasi }); sonuc.vadeliyeTasinan += tasi; }
        if (!(r.dolan > 0)) { sonuc.hata = `spot alım dolmadı (${r.durum})`; break; }
        kalan = +(kalan - r.dolan).toFixed(12);
      }
      if (!sonuc.hata && !sonuc.kisit && kalan * f0 >= k.minNominal) sonuc.hata = `dilim sınırı (${this.ayar.maxDilim}) — kalan ${kalan.toFixed(8)} ${this.ayar.varlik} sonraki çalışmada`;
      await this._iade(akis);
    } catch (e) {
      this._hataIsle(sonuc, akis, e);
      if (akis && !sonuc.belirsiz) {
        // Alınmış ama taşınamamış BTC'yi vadeliye götürmeyi dene (teminat olsun), sonra USDT iadesi.
        try { await this._supur(akis); } catch { /* sonraki akış */ }
        try { await this._iade(akis); } catch (e2) { if (e2 instanceof AkisHatasi && e2.tur === 'BELIRSIZ') sonuc.belirsiz = true; }
      }
    }
    sonuc.fiyat = sonuc.miktar > 0 ? sonuc.tutar / sonuc.miktar : null;
    return this._akisSonu(akis, sonuc);
  }

  /**
   * SATIM: `miktar` BTC'lik maruziyeti kapat (önce kendi spot kalıntısı, sonra vadeliden çekerek); USDT vadeliye döner.
   * @param acil true → kilit kapısı gevşer, dilim sınırı büyük, aktarım reddinde dilim küçülür, asgari altı da denenir
   */
  sat(miktar, secenek = {}) {
    if (secenek.kilitsiz) return this._sat(miktar, secenek);
    return this._sirada(() => this._sat(miktar, secenek));
  }

  async _sat(miktar, { sebep = null, simdi = Date.now(), acil = false, zorla = false } = {}) {
    const sonuc = this._sonuc();
    let akis = null;
    const maxDilim = acil ? this.ayar.acilMaxDilim : this.ayar.maxDilim;
    try {
      this._kapi({ acil });
      const k = await this.spotKurallar();
      const f0 = await this.spotFiyat();
      if (!(miktar > 0) || (!acil && miktar * f0 < k.minNominal)) { sonuc.asgari = true; return sonuc; }
      let yabanci;
      if (acil) { const s = await this.spotBakiye(); yabanci = this._yabanci(s); }      // acil: yabancıya dokunma, ama durma
      else yabanci = await this._yabanciDenetle();
      akis = this._yeniAkis(acil ? 'acil' : 'sat', miktar, sebep, simdi, { zorla, yabanci });
      let kalan = miktar, ret = 0;
      while (sonuc.dilim < maxDilim && kalan >= k.adim) {
        let sp = await this._kendiSpot(akis, this.ayar.varlik);
        const f = await this.spotFiyat();
        // Kalan satılamayacak kadar küçükse (asgari nominal altı) vadeliden ÇEKİLMEZ — orada teminat olarak kalır (toz).
        if (kalan * f < k.minNominal && sp < k.adim) break;
        sonuc.dilim++;
        const getir = asagi8(kalan - sp);
        if (getir > 0) {
          const v = await this.vadeliHesap();
          // Çekilebilir BTC sınırı (eksi USDT / kol marjı) acilde de geçerli: dilim dilim ilerlenir, her satıştan sonra
          // USDT iadesi eksiyi kapatır ve sonraki dilimde çekilebilir büyür.
          const cek = v.btc.cekilebilir >= getir ? getir : v.btc.cekilebilir * 0.98;
          let tasi = asagi8(Math.min(getir, v.btc.cuzdan, cek) / Math.pow(2, ret));          // ret: acilde reddedilen deneme sayısı → yarıla
          if (!(tasi > 0) && acil && sp < k.adim) tasi = asagi8(Math.min(getir, v.btc.cuzdan) / Math.pow(2, ret + 1));   // çekilebilir 0 → küçük dene
          if (tasi > 0 && tasi * f >= (acil ? 0 : k.minNominal / 2)) {
            try { await this._adim(akis, { tur: 'aktar', tip: 'UMFUTURE_MAIN', varlik: this.ayar.varlik, miktar: tasi }); ret = 0; }
            catch (e) {
              if (!(acil && e instanceof AkisHatasi && e.tur === 'RED') || ++ret > 6) throw e;
              this.kaydet('WARN', `çoklu varlık acil: ${tasi} ${this.ayar.varlik} aktarımı reddedildi (${e.message}) — dilim küçültülüyor`);
              continue;                                              // sonraki turda (yarısı) yeniden
            }
            sp = await this._kendiSpot(akis, this.ayar.varlik);
          } else if (sp < k.adim) { sonuc.hata = `vadeliden çekilebilir ${this.ayar.varlik} yok (marj)`; break; }
        }
        const satQ = adimaAsagi(Math.min(sp, kalan + k.adim / 2), k.adim);
        if (satQ * f < k.minNominal) { if (satQ > 0 || kalan * f >= k.minNominal) sonuc.toz = sp; break; }
        const a = await this._adim(akis, { tur: 'spot', side: 'SELL', miktar: satQ });
        const r = a.sonuc;
        sonuc.miktar += r.dolan; sonuc.tutar += r.tutar; sonuc.ucretUsdt += (r.ucretUsdt || 0) + (r.ucretBilinmiyor ? r.tutar * 0.001 : 0);
        await this._iade(akis);                                       // eksi USDT kapanır → sonraki dilim büyür
        if (!(r.dolan > 0)) { sonuc.hata = `spot satış dolmadı (${r.durum})`; break; }
        kalan = +(kalan - r.dolan).toFixed(12);
      }
      if (!sonuc.hata && kalan * f0 >= k.minNominal) sonuc.hata = `dilim sınırı (${maxDilim}) — kalan ${kalan.toFixed(8)} ${this.ayar.varlik} sonraki çalışmada`;
      sonuc.toz = await this._kendiSpot(akis, this.ayar.varlik);
      // 68.9: satım spottaki kendi kalıntısından karşılandıysa ARTAN BTC spotta kalmaz — vadeliye (teminat) döner. Önceden yalnız
      // sonraki ALIM süpürüyordu; BTC payı < %100 (Denge %50) olan botta ertesi gün yine satım gelince BTC spotta teminatsız kalıyordu.
      if (!acil && sonuc.toz >= k.adim) { await this._supur(akis); sonuc.toz = await this._kendiSpot(akis, this.ayar.varlik); }
      await this._iade(akis);
    } catch (e) {
      this._hataIsle(sonuc, akis, e);
      if (akis && !sonuc.belirsiz) { try { await this._iade(akis); } catch { /* iade sonraki akışta */ } }
    }
    sonuc.fiyat = sonuc.miktar > 0 ? sonuc.tutar / sonuc.miktar : null;
    return this._akisSonu(akis, sonuc);
  }

  /**
   * ACİL: acil neslini artırır (süren alımın risk artıran adımları yapılmaz), süren akışı `acilBeklemeMs` bekler,
   * belirsiz akışı çözmeyi dener, sonra vadeli + KENDİ spot BTC'sini satar.
   */
  /** Acil nesli: süren alımın risk artıran adımları bundan sonra yapılmaz. */
  iptalEt() { this._acilNesil++; }

  async acilSat(sebep = 'acil') {
    this._acilNesil++;
    let zamanAsimi = false;
    if (this._kilit) {
      const r = await Promise.race([this._kilit.then(() => 'bitti'),
        new Promise(c => { const t = setTimeout(() => c('zaman'), this.ayar.acilBeklemeMs); if (t.unref) t.unref(); })]);
      if (r !== 'bitti') { zamanAsimi = true; this.kaydet('ERROR', `çoklu varlık acil: süren akış ${this.ayar.acilBeklemeMs} ms içinde bitmedi — acil satış yine de yapılıyor`); }
    }
    const calis = async () => {
      if (this.durum.acik && this.durum.acik.durum === 'BELIRSIZ') { try { await this.coz(); } catch { /* aşağıda kesilir */ } }
      const t = await this.btcToplam();
      return this._sat(t.toplam, { sebep, acil: true, zorla: true });
    };
    return zamanAsimi ? calis() : this._sirada(calis);
  }

  /** Belirsiz akışın bilinmeyen adımlarını sorgular; çözülürse akış kapanır (KESILDI). */
  async coz() {
    const a = this.durum.acik;
    if (!a || a.durum !== 'BELIRSIZ') return { cozuldu: true, acik: false };
    for (const s of a.adimlar) {
      if (s.durum !== 'BILINMIYOR') continue;
      const q = await this._sorgula(s);
      if (q.bulundu) this._tamam(a, s, q.sonuc, q.kanit);
      else if (q.yok) { s.durum = 'GONDERILMEDI'; this._yaz(); }
      else return { cozuldu: false, hata: q.hata };
    }
    this._bitir(a, 'KESILDI', 'belirsiz adım sorguyla çözüldü — akış kesildi; kalan fark/bakiye sonraki çalışmada');
    await this._beklenenGuncelle();
    await this._kalintiGuncelle(a.yabanci);
    this.kaydet('WARN', `çoklu varlık: belirsiz akış ${a.id} çözüldü (${a.adimlar.map(x => `${x.no}:${x.durum}`).join(' ')})`);
    return { cozuldu: true };
  }

  /**
   * MUTABAKAT (salt okuma + belirsiz akış çözümü). @returns {{ engel, uyarilar, mod, vadeliBtc, spotBtc, spotUsdt, beklenen }}
   */
  async mutabakat() {
    const r = { zaman: Date.now(), engel: null, uyarilar: [], mod: null, vadeliBtc: null, spotBtc: null, spotUsdt: null, beklenen: this.durum.beklenenBtc };
    const v0 = this.ayar.varlik;
    try {
      try { this._hesapSahibi(); } catch (e) { r.engel = e.message; }
      if (this.durum.bozuk) r.engel = r.engel || this.durum.bozuk;
      if (this.durum.acik && this.durum.acik.durum === 'BELIRSIZ') {
        const c = await this.coz();
        if (!c.cozuldu) r.engel = r.engel || `çözülmemiş belirsiz akış ${this.durum.acik.id}: ${c.hata}`;
      }
      const [mod, v, s, f, k] = await Promise.all([this.modOku(), this.vadeliHesap(), this.spotBakiye(), this.spotFiyat(), this.spotKurallar()]);
      Object.assign(r, { mod, vadeliBtc: v.btc.cuzdan, spotBtc: s[v0], spotUsdt: s.USDT, marjOrani: v.marjOrani });
      this._kalintiBekleyenUygula(s);
      if (!mod && v.btc.cuzdan * f >= k.minNominal) r.engel = r.engel || `çoklu varlık modu KAPALI — vadeli cüzdandaki ${v.btc.cuzdan} ${v0} teminat sayılmıyor`;
      const yab = this._yabanci(s);
      if (!this.durum.acik && this._yabanciVarMi(yab)) r.engel = r.engel || `spot cüzdanda botun olmayan bakiye: ${yab.USDT} USDT, ${yab[v0]} ${v0} (adanmış hesap şartı — elle işlem/yatırma?) — boşaltın ya da "Engeli kaldır"`;
      const kal = this.durum.kalinti || {};
      if ((kal[v0] || 0) * f >= k.minNominal) r.uyarilar.push(`spot cüzdanda ${kal[v0]} ${v0} (teminat değil) — sonraki akış vadeliye taşır`);
      if ((kal.USDT || 0) >= this.ayar.tozUsdt) r.uyarilar.push(`spot cüzdanda ${(kal.USDT || 0).toFixed(2)} USDT — sonraki akış vadeliye iade eder`);
      if (this.durum.beklenenBtc == null) { this.durum.beklenenBtc = v.btc.cuzdan; r.beklenen = v.btc.cuzdan; r.taban = true; }
      else {
        const b = this.durum.beklenenBtc;
        if (Math.abs(v.btc.cuzdan - b) > Math.max(1e-6, b * BEKLENEN_TOL)) {
          r.engel = r.engel || `vadeli ${v0} teminatı ${v.btc.cuzdan} ≠ beklenen ${b} (elle aktarım/satış ya da negatif USDT için otomatik çevrim?) — incele, sonra "Engeli kaldır"`;
        }
      }
    } catch (e) {
      r.engel = r.engel || `çoklu varlık okunamadı: ${e.message}`;
      if (e && e.kod === 'GERI_CEKILME') r.geriCekilme = true;
    }
    this.durum.sonMutabakat = r;
    this._yaz();
    if (r.engel) this.kaydet('ERROR', `çoklu varlık mutabakatı: ${r.engel}`);
    for (const u of r.uyarilar) this.kaydet('WARN', `çoklu varlık: ${u}`);
    return r;
  }

  /**
   * Engel kaldırılınca (elle, kullanıcı inceledi): borsadaki vadeli BTC ve spot bakiye yeni taban kabul edilir
   * (sonraki mutabakatta okunur); bozuk durum dosyası işareti kalkar.
   */
  bekleneniSifirla() {
    this.durum.beklenenBtc = null;
    this.durum.kalintiBekleyen = { USDT: 0, [this.ayar.varlik]: 0 };   // mevcut spot bakiyesi = kendi kalıntısı (kabul)
    if (this.durum.bozuk) { this.kaydet('WARN', `çoklu varlık: bozuk durum işareti elle kaldırıldı (${this.durum.bozuk})`); this.durum.bozuk = null; }
    this._yaz();
  }

  ozet() {
    const a = this.durum.acik;
    const kisa = (x) => x && { id: x.id, yon: x.yon, durum: x.durum, hedefMiktar: x.hedefMiktar, sebep: x.sebep, bas: x.bas, bit: x.bit || null, hata: x.hata || null,
      adimlar: (x.adimlar || []).map(s => ({ no: s.no, tur: s.tur, tip: s.tip || s.side, varlik: s.varlik || this.ayar.varlik, miktar: s.miktar, durum: s.durum })) };
    return { acik: kisa(a), gecmis: (this.durum.gecmis || []).slice(-5).map(kisa), beklenenBtc: this.durum.beklenenBtc, kalinti: this.durum.kalinti,
      bozuk: this.durum.bozuk, sonMod: this.durum.sonMod, sonMutabakat: this.durum.sonMutabakat };
  }
}

module.exports = { CokluVarlik, AkisHatasi, GEREKLI_UCLAR, adimaAsagi, asagi8, GUN };
