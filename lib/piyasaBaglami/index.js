'use strict';
/**
 * PİYASA BAĞLAMI (73.9 D7 + WinC panosu, kullanıcı kararı 2026-10-24) — "Karar kuralı yok · bilgi"
 * ═══════════════════════════════════════════════════════════════════════════
 * Sunucuda çalışan küçük bir TOPLAYICI + TÜRETİCİ. Sayfa: #/piyasa (public/js/pages/piyasaBaglami.js), Ana sayfa "Bu hafta" kartı.
 * HİÇBİR GÖSTERGE BOT KARARINA GİRMEZ: lib/live, lib/risk, engine, exchange bu modülü çağırmaz; emir yok, anahtar yok.
 *
 * VERİ (üç yerden):
 *   1. Ağ (kaynaklar.js — ücretsiz, anahtarsız; User-Agent Pusula/<sürüm>): FRED · CFTC COT · Coinbase + Binance saatlik (prim) ·
 *      Binance funding + çeyreklik baz · alternative.me korku-açgözlülük · DefiLlama stablecoin · Coin Metrics MVRV · Yahoo SEK=X ·
 *      federalreserve.gov FOMC takvimi + karar açıklaması (RSS) · FRED yayın takvimi (ABD TÜFE günü).
 *      → <veri>/piyasa-baglami/ham/<kaynak>.json { zaman, veri }.
 *   2. Sunucunun kendi dosyaları (ağsız): ileriye kayıt (lib/ileriKayit — opsiyon, pozisyon, Hyperliquid), market.db günlük mumları
 *      (alt sezonu, RSI), coin tarama gece arşivi toplu.json (DefiLlama ücret/gelir/TVL), Yahoo portföy serileri (kurlar, ^IRX,
 *      USD/TRY), TÜFE (EVDS). → <veri>/piyasa-baglami/turev/<ad>.json (girdi imzası değişmedikçe yeniden hesaplanmaz).
 *   3. Elle: <veri>/piyasa-olaylar.json (kilit açılımı vb.; otomatik ücretsiz kaynak yok).
 *
 * KURALLAR: karar penceresinde (UTC 23:50–01:30, ve 15 dk öncesi) ağ isteği ve türetme YOK; aynı anda tek iş; Binance istekleri
 * BinanceKota'dan; diğer host'larda 429/418 → host beklemesi. Araştırma kopyasında ÇALIŞMAZ — sayfa sunucunun verisini gösterir
 * (lib/evOkuma EV_YOLU). PIYASA_BAGLAMI=0 kapatır.
 * BAYATLIK: her kartın veri zamanı istek anında eşiğe göre değerlendirilir; bayat kart "bayat — son veri X — neden" der, değer
 * soluk gösterilir; veri yoksa "veri yok — neden". Eski değer asla güncel gibi gösterilmez.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const { Http } = require('../ileriKayit/kaynaklar');
const IO = require('./ileriOku');
const H = require('./hesap');
const K = require('./kaynaklar');
const T = require('./takvim');

const DK = 60e3, SAAT = 60 * DK, GUN = 24 * SAAT;
const KOK_PROJE = path.join(__dirname, '..', '..');
const gunStr = (t) => new Date(t).toISOString().slice(0, 10);

/** Ağ kaynakları. bayatSaat: veri bu kadar eskiyse kart bayat (kartın kendi veri tarihine göre; aşağıda kart başına ayrıca). */
const KAYNAKLAR = [
  { ad: 'fred', kisaAd: 'FRED', ne: 'Fed bilançosu (WALCL), Hazine hesabı (WTREGEN), ters repo (RRPONTSYD), kredi spreadi (BAA10Y), ABD TÜFE (CPIAUCSL), politika faizi (DFEDTARU/L)', siklik: '6 saatte bir (TÜFE günü açıklamadan sonra 15 dk\'da bir)', aralikMs: 6 * SAAT, kos: (c) => K.fred(c) },
  { ad: 'cftc', kisaAd: 'CFTC COT', ne: 'Traders in Financial Futures: CME Bitcoin (133741), Nasdaq-100 E-mini (209742)', siklik: '12 saatte bir (rapor haftalık: salı verisi, cuma yayımı)', aralikMs: 12 * SAAT, kos: (c) => K.cftc(c) },
  { ad: 'coinbase', kisaAd: 'Coinbase + Binance saatlik', ne: 'Coinbase BTC-USD ve USDT-USD, Binance spot BTCUSDT saatlik kapanış (Coinbase primi)', siklik: 'saatte bir', aralikMs: SAAT, kos: (c) => K.coinbase(c) },
  { ad: 'binanceVadeli', kisaAd: 'Binance vadeli', ne: 'Funding (tüm USDT perp, /fapi/v1/premiumIndex) + BTC/ETH çeyreklik vadeli bazı (/futures/data/basis)', siklik: 'saatte bir', aralikMs: SAAT, kos: (c) => K.binanceVadeli(c) },
  { ad: 'korku', kisaAd: 'alternative.me', ne: 'Kripto korku-açgözlülük endeksi (günlük)', siklik: '6 saatte bir', aralikMs: 6 * SAAT, kos: (c) => K.korku(c) },
  { ad: 'stablecoin', kisaAd: 'DefiLlama stablecoin', ne: 'Toplam stablecoin arzı (peggedUSD, günlük)', siklik: '12 saatte bir', aralikMs: 12 * SAAT, kos: (c) => K.stablecoin(c) },
  { ad: 'mvrv', kisaAd: 'Coin Metrics', ne: 'BTC MVRV (CapMVRVCur, Community API, CC BY-NC 4.0)', siklik: '12 saatte bir', aralikMs: 12 * SAAT, kos: (c) => K.mvrv(c) },
  { ad: 'sek', kisaAd: 'Yahoo SEK=X', ne: 'USD/SEK günlük (sentetik dolar endeksinin altıncı kuru; diğer beşi Yahoo portföy serilerinde)', siklik: '12 saatte bir', aralikMs: 12 * SAAT, kos: (c) => K.sek(c) },
  { ad: 'fomc', kisaAd: 'Fed FOMC takvimi', ne: 'federalreserve.gov/monetarypolicy/fomccalendars.htm (planlı toplantılar)', siklik: 'haftada bir', aralikMs: 7 * GUN, kos: (c) => K.fomc(c) },
  { ad: 'abdTufe', kisaAd: 'FRED yayın takvimi', ne: 'ABD TÜFE açıklama günleri (BLS takvimi, FRED releases/calendar rid=10)', siklik: 'haftada bir', aralikMs: 7 * GUN, kos: (c) => K.abdTufe(c) },
];

/** "Bu gösterge strateji olarak sınandı" notları (kayitlar/denemeler.jsonl). acik: ön kayıtlı, sonuç bekliyor. */
const SINANDI = Object.freeze({
  netLikidite: { metin: 'bu gösterge strateji olarak sınandı, geçmedi: deneme 980' },
  'cot-btc': { metin: 'bu gösterge strateji olarak sınandı, geçmedi: deneme 981' },
  'cot-nq': { metin: 'bu gösterge strateji olarak sınandı, geçmedi: deneme 982' },
  'coinbase-primi': { metin: 'bu gösterge strateji olarak sınandı, geçmedi: deneme 983' },
  'alt-sezonu': { metin: 'bu gösterge strateji olarak sınandı, geçmedi: deneme 984' },
  kredi: { metin: 'bu gösterge strateji olarak sınandı, geçmedi: deneme 985' },
  stablecoin: { metin: 'bu gösterge strateji olarak sınandı, geçmedi: deneme 773' },
  mvrv: { metin: 'bu gösterge strateji olarak sınandı, geçmedi: deneme 903 (904 sonuçsuz)' },
  korku: { metin: 'bu gösterge strateji olarak sınandı, geçmedi: deneme 908' },
  funding: { metin: 'bu gösterge strateji olarak sınandı, geçmedi: denemeler 720–725, 562–564' },
  oi: { metin: 'bu gösterge strateji olarak sınandı, geçmedi: denemeler 726, 754 (907 sonuçsuz)' },
  cvd: { metin: 'bu gösterge strateji olarak sınandı, geçmedi: denemeler 744 (taker oranı), 757–759 (CVD)' },
  baz: { metin: 'bu gösterge strateji olarak sınandı, geçmedi: denemeler 615, 867' },
  protokol: { metin: 'bu göstergeler strateji olarak sınandı, geçmedi: denemeler 785 (P/F), 786 (P/S), 875 (ücret büyümesi), 876 (TVL; ileri gölgesi 882 sürüyor)' },
  opsiyon: { metin: 'IV sırası ve 25Δ çarpıklık ön kayıtlı: denemeler 986–987 (sonuç bekleniyor); GEX, max pain, put/call sınanmadı', acik: true },
});

/** Kart veri eşikleri (veri tarihi bu kadar eskiyse bayat). */
const ESIK = Object.freeze({
  WALCL: 10 * GUN, WTREGEN: 10 * GUN, RRPONTSYD: 7 * GUN, BAA10Y: 8 * GUN, CPIAUCSL: 50 * GUN, DFEDTARU: 7 * GUN,
  cftc: 14 * GUN, coinbase: 3 * SAAT, binanceVadeli: 3 * SAAT, korku: 2 * GUN, stablecoin: 3 * GUN, mvrv: 5 * GUN, yahoo: 5 * GUN,
  tufeTr: 45 * GUN, opsiyon: 9 * SAAT, pozisyon: 7 * SAAT, hyperliquid: 3 * SAAT, marketDb: 3 * GUN, tarama: 3 * GUN,
});

function jsonOku(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; } }
function atomikYaz(f, nesne) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(nesne));
  fs.renameSync(tmp, f);
}
function mtime(f) { try { return fs.statSync(f).mtimeMs; } catch { return null; } }
const kisaHata = (e) => String((e && e.message) || e).slice(0, 200);

function kararPenceresiKalanMs(t) { return require('../veri/orkestrator').kararPenceresiKalanMs(t); }

/** Yahoo portföy dosyası → [{ d, v }] (kapanış). */
function yahooSeri(f) {
  const j = jsonOku(f);
  if (!j || !Array.isArray(j.gunler)) return null;
  return j.gunler.filter(g => g && Number.isFinite(g.c) && g.c > 0).map(g => ({ d: gunStr(g.t), v: g.c }));
}

class PiyasaBaglami {
  /**
   * @param o { kok?, ileriKok?, taramaKok?, portfoyKok?, elleDosya?, fomcStatik?, fetch?, simdi?, uyu?, log?, kota?: () => BinanceKota,
   *            mumDeposu?, arastirma?: bool, surum?, acilisBeklemeMs?, tikMs? }
   */
  constructor(o = {}) {
    this.simdi = o.simdi || (() => Date.now());
    this.uyu = o.uyu || ((ms) => new Promise(r => { const t = setTimeout(r, ms); if (t.unref) t.unref(); }));
    this.log = o.log || (() => {});
    this.kok = o.kok || process.env.PIYASA_BAGLAMI_DIZIN || yollar.veri('piyasa-baglami');
    this.ileriKok = o.ileriKok || process.env.ILERI_KAYIT_DIZIN || yollar.veri('ileriye-kayit');
    this.portfoyKok = o.portfoyKok || yollar.veri('portfoy');
    this.elleDosya = o.elleDosya || yollar.veri('piyasa-olaylar.json');
    this.fomcStatik = o.fomcStatik || path.join(KOK_PROJE, 'kayitlar', 'qqq-ay-donumu', 'fomc-tarihleri.json');
    this.taramaKokFn = o.taramaKok ? () => o.taramaKok : () => { try { return require('../tarama/arsiv').kokDizin({ resmi: true }); } catch { return yollar.veri('tarama'); } };
    this.surum = o.surum || '73.9';
    this.arastirma = o.arastirma != null ? !!o.arastirma : require('../ileriKayit').arastirmaMi();
    this.kapali = process.env.PIYASA_BAGLAMI === '0';
    // Kılavuz görüntüsü (scripts/kilavuz-ekran.js): araştırma kopyasında ÖRNEK klasör (scripts/piyasa-baglami-ornek.js) sunucudaymış gibi
    // gösterilir — toplayıcı yine ÇALIŞMAZ, sayılar uydurmadır.
    this.ornek = this.arastirma && process.env.PIYASA_BAGLAMI_ORNEK === '1';
    this.mumDeposuFn = o.mumDeposu !== undefined ? () => o.mumDeposu : (() => { let c = null; return () => { if (!c) { const { CandleStore } = require('../candleStore'); c = new CandleStore(yollar.veri('market.db')); } return c; }; })();
    this.kotaFn = o.kota || (() => require('../ileriKayit').yalinKota(this.uyu));
    this.acilisBeklemeMs = o.acilisBeklemeMs != null ? o.acilisBeklemeMs : 3 * DK;
    this.tikMs = o.tikMs || 2 * DK;
    this._durum = null;
    this.http = new Http({ fetch: o.fetch, simdi: this.simdi, bekleme: this.durum().hostBekleme, ua: `Pusula/${this.surum}` });
    this.kosan = null;
    this.baslangic = null;
    this._hamOnbellek = new Map();
    this._ozetOnbellek = null;
  }

  calisabilir() { return !this.arastirma && !this.kapali; }
  neden() { return this.arastirma ? 'araştırma kopyası — toplayıcı yalnız sunucuda çalışır; sayfa sunucu bağlantısıyla sunucunun verisini gösterir' : this.kapali ? 'PIYASA_BAGLAMI=0 ile kapalı' : null; }

  // ── Durum ────────────────────────────────────────────────────────────────
  durum() {
    if (!this._durum) this._durum = jsonOku(path.join(this.kok, 'durum.json')) || {};
    const d = this._durum;
    d.kaynaklar = d.kaynaklar || {}; d.hostBekleme = d.hostBekleme || {}; d.fedKarar = d.fedKarar || {}; d.turev = d.turev || {}; d.seri = d.seri || {};
    return d;
  }
  durumYaz() { try { atomikYaz(path.join(this.kok, 'durum.json'), { ...this.durum(), surum: 1, guncelleme: new Date(this.simdi()).toISOString() }); } catch { /* sonraki turda */ } }
  kd(ad) { const d = this.durum(); return d.kaynaklar[ad] || (d.kaynaklar[ad] = {}); }
  dizin(alt) { return path.join(this.kok, alt); }

  ham(ad) {
    const f = path.join(this.kok, 'ham', `${ad}.json`);
    const m = mtime(f);
    const o = this._hamOnbellek.get(f);
    if (o && o.m === m) return o.j;
    const j = m ? jsonOku(f) : null;
    this._hamOnbellek.set(f, { m, j });
    return j;
  }
  hamYaz(ad, veri) { atomikYaz(path.join(this.kok, 'ham', `${ad}.json`), { zaman: new Date(this.simdi()).toISOString(), veri }); this._ozetOnbellek = null; }
  turev(ad) { return this.ham(`../turev/${ad}`); }
  turevYaz(ad, veri, imza) { atomikYaz(path.join(this.kok, 'turev', `${ad}.json`), { zaman: new Date(this.simdi()).toISOString(), imza, veri }); this._ozetOnbellek = null; }

  ctx() { return { http: this.http, kota: this.kotaFn, uyu: this.uyu, simdi: this.simdi, dizin: (a) => this.dizin(a) }; }

  // ── Zamanlama ────────────────────────────────────────────────────────────
  zamaniGeldi(k, simdi = this.simdi()) {
    const d = this.kd(k.ad);
    if (d.sonBasari && simdi - Date.parse(d.sonBasari) < k.aralikMs) return false;
    if (d.sonDeneme && simdi - Date.parse(d.sonDeneme) < Math.min(k.aralikMs, Math.max(20 * DK, k.aralikMs / 6))) return false;
    return true;
  }

  async kos(ad, { seriler } = {}) {
    const k = KAYNAKLAR.find(x => x.ad === ad);
    if (!k) throw new Error(`bilinmeyen kaynak: ${ad}`);
    if (this.kosan) return { atlandi: `başka iş sürüyor (${this.kosan})` };
    this.kosan = ad;
    const d = this.kd(ad);
    d.sonDeneme = new Date(this.simdi()).toISOString();
    try {
      let veri = await (seriler ? K.fred(this.ctx(), { seriler }) : k.kos(this.ctx()));
      if (seriler) { const eski = (this.ham('fred') || {}).veri || { seriler: {} }; veri = { ...eski, seriler: { ...eski.seriler, ...veri.seriler }, hatalar: veri.hatalar }; }
      this.hamYaz(ad, veri);
      if (!seriler) d.sonBasari = new Date(this.simdi()).toISOString();
      if (d.sonHata) this.log('INFO', `🧭 Piyasa bağlamı — ${k.kisaAd} yeniden alınıyor`);
      d.sonHata = null; d.uyari = veri && veri.hatalar && veri.hatalar.length ? veri.hatalar.slice(0, 3) : null;
      return { ok: true };
    } catch (e) {
      const onceki = d.sonHata;
      d.sonHata = kisaHata(e); d.hataZamani = new Date(this.simdi()).toISOString();
      if (!onceki) this.log('WARN', `🧭 Piyasa bağlamı — ${k.kisaAd}: ${d.sonHata}`);
      return { ok: false, hata: d.sonHata };
    } finally { this.kosan = null; this.durumYaz(); }
  }

  /** Olay günü özel yoklamaları: FOMC kararı (RSS) ve ABD TÜFE (FRED CPIAUCSL). */
  ozelIs(simdi = this.simdi()) {
    const d = this.durum();
    for (const o of this.olaylar(simdi - GUN, simdi + DK)) {
      if (o.tur === 'fomc' && simdi >= o.zaman + 2 * DK && simdi <= o.zaman + 5 * SAAT) {
        const g = gunStr(o.zaman), x = d.fedKarar[g];
        if (x && x.karar) continue;
        if (x && x.sonDeneme && simdi - x.sonDeneme < 10 * DK) continue;
        return { tur: 'fed', gun: g };
      }
      if (o.tur === 'tufe-abd' && simdi >= o.zaman + 3 * DK && simdi <= o.zaman + 6 * SAAT && !this.abdTufeSonucu(o)) {
        const k = d.tufeYoklama || {};
        if (k.olay === o.kimlik && simdi - k.zaman < 15 * DK) continue;
        return { tur: 'cpi', olay: o.kimlik };
      }
    }
    return null;
  }

  async ozelKos(is) {
    const d = this.durum();
    if (is.tur === 'fed') {
      if (this.kosan) return null;
      this.kosan = 'fed';
      const x = d.fedKarar[is.gun] = d.fedKarar[is.gun] || {};
      x.sonDeneme = this.simdi();
      try {
        const r = await K.fedKarar(this.ctx(), is.gun);
        if (r) { Object.assign(x, { link: r.link, zaman: r.zaman, karar: r.karar || null, hata: r.karar ? null : 'açıklama sayfasında faiz cümlesi okunamadı' }); this._ozetOnbellek = null; }
      } catch (e) { x.hata = kisaHata(e); } finally { this.kosan = null; this.durumYaz(); }
      return x;
    }
    if (is.tur === 'cpi') {
      d.tufeYoklama = { olay: is.olay, zaman: this.simdi() };
      return this.kos('fred', { seriler: ['CPIAUCSL'] });
    }
    return null;
  }

  pencerede(simdi) { return kararPenceresiKalanMs(simdi) > 0 || kararPenceresiKalanMs(simdi + 15 * DK) > 0; }

  /** Tik: (karar penceresi dışında) özel yoklama → vadesi gelen kaynak → türetme. */
  async tik() {
    if (!this.calisabilir()) return null;
    const simdi = this.simdi();
    if (this.pencerede(simdi) || this.kosan) return null;
    if (this.baslangic && simdi - this.baslangic < this.acilisBeklemeMs) return null;
    const oz = this.ozelIs(simdi);
    if (oz) return this.ozelKos(oz);
    const k = KAYNAKLAR.find(x => this.zamaniGeldi(x, simdi));
    if (k) return this.kos(k.ad);
    return this.turet();
  }

  baslat() {
    if (!this.calisabilir()) { this.log('INFO', `🧭 Piyasa bağlamı toplayıcısı kapalı: ${this.neden()}`); return false; }
    if (this._id) return true;
    this.baslangic = this.simdi();
    this._id = setInterval(() => { this.tik().catch(e => this.log('WARN', `🧭 Piyasa bağlamı: ${kisaHata(e)}`)); }, this.tikMs);
    if (this._id.unref) this._id.unref();
    this.log('INFO', '🧭 Piyasa bağlamı toplayıcısı başladı (FRED, CFTC, Coinbase, Binance, DefiLlama, Coin Metrics, Fed takvimi) — yalnız bilgi, emir yok');
    return true;
  }
  durdur() { if (this._id) clearInterval(this._id); this._id = null; }

  // ── Türetme (ağsız) ──────────────────────────────────────────────────────
  ileriDurum() { return jsonOku(path.join(this.ileriKok, 'durum.json')) || { kayitcilar: {} }; }

  /** Girdi imzası değiştiyse yeniden hesaplar. Her parça ayrı try/catch. */
  async turet({ zorla = false } = {}) {
    if (this.kosan) return null;
    this.kosan = 'turet';
    const sonuc = {};
    const d = this.durum();
    const id = this.ileriDurum();
    const ik = (ad) => (((id.kayitcilar || {})[ad] || {}).sonYazim) || null;
    const parca = async (ad, imza, fn) => {
      const eski = this.turev(ad);
      if (!zorla && eski && eski.imza === imza && imza != null) { sonuc[ad] = 'guncel'; return; }
      try { const v = await fn(); this.turevYaz(ad, v, imza); d.turev[ad] = { zaman: new Date(this.simdi()).toISOString(), hata: null }; sonuc[ad] = 'ok'; }
      catch (e) { d.turev[ad] = { ...(d.turev[ad] || {}), hataZamani: new Date(this.simdi()).toISOString(), hata: kisaHata(e) }; sonuc[ad] = 'hata'; }
      await this.uyu(0);
    };
    try {
      await parca('opsiyon', ik('opsiyon'), () => this.opsiyonTuret());
      await parca('pozisyon', ik('pozisyon'), () => this.pozisyonTuret());
      await parca('hyperliquid', ik('hyperliquid'), () => this.balinaTuret());
      const md = this.mumDeposuFn();
      const btcSon = md ? ((md.stats('BTC/USDT:USDT', '1d', { venue: 'binance', market: 'perp' }) || {}).lastTime || null) : null;
      await parca('genislik', btcSon ? `${btcSon}|${gunStr(this.simdi())}` : null, () => this.genislikTuret());
      const tg = this.taramaGunu();
      await parca('protokol', tg ? tg.gun : null, () => this.protokolTuret(tg));
    } finally { this.kosan = null; this.durumYaz(); }
    return sonuc;
  }

  async opsiyonTuret() {
    const s = await IO.sonGoruntu(this.ileriKok, 'opsiyon', this.simdi(), { onSuzgec: (x) => !x.includes('"tur":"tarihsel-oynaklik"') });
    if (!s) throw new Error('ileriye kayıtta opsiyon anlık görüntüsü yok (kayıtçı henüz yazmadı)');
    const out = { gun: s.gun, zaman: s.zaman, coinler: {} };
    const spot = this.spotlar();
    for (const coin of ['BTC', 'ETH']) {
      const l = s.satirlar.filter(x => x.alt === coin);
      const z = H.opsiyonOzeti(l, Math.max(...Object.values(s.zaman).map(Date.parse)), spot[coin]);
      if (z) out.coinler[coin] = z;
    }
    // IV / çarpıklık günlük serisi (sıra hesabı için birikir; ileriye kayıttan yeniden üretilebilir)
    const d = this.durum();
    for (const coin of Object.keys(out.coinler)) {
      const iv = out.coinler[coin].iv;
      d.seri[`iv-${coin}`] = H.gunlukEkle(d.seri[`iv-${coin}`], s.gun, iv ? iv.atm : NaN);
      d.seri[`skew-${coin}`] = H.gunlukEkle(d.seri[`skew-${coin}`], s.gun, iv ? iv.carpiklik : NaN);
    }
    await this.ivGeriDoldur(2);
    return out;
  }

  /** Seride olmayan geçmiş günleri ileriye kayıttan doldurur (tur başına en çok n gün; o günün son görüntüsü). */
  async ivGeriDoldur(n) {
    const d = this.durum();
    const var_ = new Set([...(d.seri['iv-BTC'] || []).map(x => x.gun), ...(d.seri.bosGun || [])]);
    const eksik = IO.gunler(this.ileriKok, 'opsiyon').filter(g => g < gunStr(this.simdi()) && !var_.has(g)).slice(-n);
    for (const g of eksik) {
      const gunSonu = Date.parse(`${g}T23:59:59Z`);
      // eslint-disable-next-line no-await-in-loop
      const s = await IO.sonGoruntu(this.ileriKok, 'opsiyon', gunSonu, { gunGeri: 1, onSuzgec: (x) => !x.includes('"tur":"tarihsel-oynaklik"') });
      for (const coin of ['BTC', 'ETH']) {
        const z = s ? H.opsiyonOzeti(s.satirlar.filter(x => x.alt === coin), Math.max(...Object.values(s.zaman).map(Date.parse))) : null;
        d.seri[`iv-${coin}`] = H.gunlukEkle(d.seri[`iv-${coin}`], g, z && z.iv ? z.iv.atm : NaN);
        d.seri[`skew-${coin}`] = H.gunlukEkle(d.seri[`skew-${coin}`], g, z && z.iv ? z.iv.carpiklik : NaN);
      }
      // değer üretilemeyen gün bir daha denenmesin: işaretle
      if (!(d.seri['iv-BTC'] || []).some(x => x.gun === g)) d.seri.bosGun = [...(d.seri.bosGun || []), g].slice(-400);
    }
  }

  /** Binance funding ham verisinden mark fiyatları (opsiyon GEX'i için spot). */
  spotlar() {
    const b = this.ham('binanceVadeli');
    const out = {};
    for (const x of (b && b.veri && b.veri.prim) || []) { if (x.symbol === 'BTCUSDT') out.BTC = Number(x.indexPrice) || null; if (x.symbol === 'ETHUSDT') out.ETH = Number(x.indexPrice) || null; }
    return out;
  }

  async pozisyonTuret() {
    const l = await IO.sonGunler(this.ileriKok, 'pozisyon', this.simdi(), 31, { onSuzgec: (x) => x.includes('"sembol":"BTCUSDT"') || x.includes('"sembol":"ETHUSDT"') });
    if (!l.length) throw new Error('ileriye kayıtta vadeli pozisyon istatistiği yok (kayıtçı henüz yazmadı)');
    const S = H.pozisyonSerileri(l);
    return { BTC: H.pozisyonOzeti(S.BTCUSDT, this.simdi()), ETH: H.pozisyonOzeti(S.ETHUSDT, this.simdi()) };
  }

  async balinaTuret() {
    const sinir = new Date(this.simdi() - 3 * SAAT).toISOString();
    // Gün başında (UTC 04:00 öncesi) dünün dosyası da okunur; sonrasında yalnız bugün (son 3 saat bugünün dosyasında).
    const gunSayisi = new Date(this.simdi()).getUTCHours() >= 4 ? 1 : 2;
    const l = await IO.sonGunler(this.ileriKok, 'hyperliquid', this.simdi(), gunSayisi, { onSuzgec: (x) => { if (!x.includes('clearinghouseState')) return false; const m = /"zaman":"([^"]+)"/.exec(x.slice(0, 200)); return !m || m[1] >= sinir; } });
    const b = H.balinaOzeti(l);
    if (!b) throw new Error('ileriye kayıtta son 3 saatte Hyperliquid görüntüsü yok');
    return b;
  }

  async genislikTuret() {
    const md = this.mumDeposuFn();
    if (!md) throw new Error('market.db açılamadı');
    const { tradfiMi } = require('../veri/tradfi');
    const STABIL = /^(USDC|BUSD|TUSD|FDUSD|USDP|DAI|UST|USTC|EUR|GBP|AEUR|PAX|USDE|RLUSD|USD1|BFUSD|USDT|PYUSD|XUSD)\//;
    const sinir = this.simdi() - 4 * GUN;
    const seriler = md.listSeries().filter(s => s.venue === 'binance' && s.market === 'perp' && s.timeframe === '1d' && /\/USDT:USDT$/.test(s.symbol) && s.son >= sinir && s.n >= 95);
    const al = (s) => md.getCandles(s, '1d', 130, { venue: 'binance', market: 'perp' });
    const btc = al('BTC/USDT:USDT');
    const mumlar = {};
    let i = 0;
    for (const s of seriler) {
      if (s.symbol === 'BTC/USDT:USDT' || STABIL.test(s.symbol)) continue;
      let tf = false; try { tf = tradfiMi(s.symbol); } catch { tf = false; }
      if (tf) continue;
      mumlar[s.symbol.split('/')[0]] = al(s.symbol);
      // eslint-disable-next-line no-await-in-loop
      if (++i % 25 === 0) await this.uyu(0);
    }
    const a = H.altSezonu(mumlar, btc);
    const btcRsi = H.rsi(btc.slice(-120).map(x => Number(x.close)));
    return { ...a, btcRsi, btcSon: btc.length ? gunStr(btc[btc.length - 1].time) : null };
  }

  taramaGunu() {
    for (const kok of [this.taramaKokFn(), path.join(this.taramaKokFn(), 'deneme')]) {
      try {
        const gunler = fs.readdirSync(path.join(kok, 'arsiv')).filter(g => /^\d{4}-\d{2}-\d{2}$/.test(g)).sort().reverse();
        for (const g of gunler) if (fs.existsSync(path.join(kok, 'arsiv', g, 'toplu.json'))) return { gun: g, dosya: path.join(kok, 'arsiv', g, 'toplu.json'), deneme: /deneme/.test(kok) };
      } catch { /* yok */ }
    }
    return null;
  }

  async protokolTuret(tg) {
    if (!tg) throw new Error('coin tarama gece arşivi (toplu.json) yok');
    const j = jsonOku(tg.dosya);
    const L = j && j.defillama;
    if (!L || L.protokolDurum !== 'ok') throw new Error(`arşiv ${tg.gun}: DefiLlama protokol listesi alınamamış`);
    const { llamaBirimleri } = require('../tarama/arsiv');
    const b = llamaBirimleri(L.protokoller || [], L.ebeveynler || [], L.ucret || null, L.gelir || null);
    return { gun: tg.gun, deneme: tg.deneme, tablo: H.protokolTablosu(b.birim, 12), ucretVar: !!(L.ucret && L.ucret.length), gelirVar: !!(L.gelir && L.gelir.length) };
  }

  // ── Takvim ───────────────────────────────────────────────────────────────
  elleOlaylar() { const j = jsonOku(this.elleDosya); return Array.isArray(j) ? j : (j && Array.isArray(j.olaylar) ? j.olaylar : []); }
  fomcListesi() {
    const h = this.ham('fomc');
    const statik = (jsonOku(this.fomcStatik) || {}).tarihler || [];
    const m = new Map(statik.map(g => [g, { gun: g, sep: false }]));
    for (const x of (h && h.veri) || []) m.set(x.gun, x);
    return [...m.values()].sort((a, b) => (a.gun < b.gun ? -1 : 1));
  }
  olaylar(bas, bit) {
    const a = this.ham('abdTufe');
    return T.olaylar({ fomc: this.fomcListesi(), abdTufe: (a && a.veri) || [], elle: this.elleOlaylar() }, bas, bit);
  }

  // ── Olay sonuçları (FOMC kararı, açıklanan TÜFE) ───────────────────────────
  fredSeri(id) { const f = this.ham('fred'); return (f && f.veri && f.veri.seriler && f.veri.seriler[id]) || []; }
  abdTufeSonucu(o) {
    const l = this.fredSeri('CPIAUCSL').map(x => ({ ay: x.d.slice(0, 7), v: x.v }));
    if (!l.some(x => x.ay === o.ay)) return null;
    const e = H.enflasyon(l.filter(x => x.ay <= o.ay));
    return e ? { ...e, kaynak: 'FRED CPIAUCSL (BLS)' } : null;
  }
  trTufeSonucu(o) {
    const j = jsonOku(path.join(this.portfoyKok, 'tufe.json'));
    const l = ((j && j.aylik) || []).map(x => ({ ay: x.ay, v: Number(x.deger) }));
    if (!l.some(x => x.ay === o.ay)) return null;
    const e = H.enflasyon(l.filter(x => x.ay <= o.ay));
    return e ? { ...e, kaynak: 'TCMB EVDS (TÜİK TÜFE 2025=100)' } : null;
  }
  fomcSonucu(o) {
    const x = this.durum().fedKarar[gunStr(o.zaman)];
    if (x && x.karar) return { ...x.karar, kaynak: 'federalreserve.gov FOMC açıklaması', link: x.link };
    // Yedek: FRED politika faizi (ertesi gün yayımlanır) — karar gününden sonraki ilk değer, önceki günün değeriyle
    const u = this.fredSeri('DFEDTARU'), l = this.fredSeri('DFEDTARL');
    const g = gunStr(o.zaman);
    const sonra = u.find(y => y.d >= g), once = [...u].reverse().find(y => y.d < g);
    if (!sonra || !once || this.simdi() < o.zaman + 12 * SAAT) return null;
    const alt = (l.find(y => y.d === sonra.d) || {}).v;
    if (!Number.isFinite(alt)) return null;
    const fark = sonra.v - once.v;
    return { yon: fark > 1e-9 ? 'artirdi' : fark < -1e-9 ? 'indirdi' : 'sabit', adim: Math.abs(fark), alt, ust: sonra.v, kaynak: 'FRED DFEDTARU/DFEDTARL (yedek)' };
  }
  olaySonucu(o) {
    try {
      if (o.tur === 'fomc') return this.fomcSonucu(o);
      if (o.tur === 'tufe-abd') return this.abdTufeSonucu(o);
      if (o.tur === 'tufe-tr') return this.trTufeSonucu(o);
    } catch { /* sonuç yok */ }
    return null;
  }

  // ── Kart kurma (istek anında, tazelik değerlendirmesiyle) ─────────────────
  /** Kaynak satırının ne zaman/neden durumu. */
  kaynakNeden(ad) {
    const d = this.kd(ad);
    if (!this.calisabilir() && !d.sonBasari) return this.neden();
    if (d.sonHata) return `son deneme hatası (${d.hataZamani ? d.hataZamani.slice(0, 16).replace('T', ' ') : ''} UTC): ${d.sonHata}`;
    if (!d.sonBasari) return 'ilk toplama bekleniyor (sunucu açıldıktan birkaç dakika sonra)';
    return 'kaynak yeni veri yayımlamadı';
  }
  /** Kart iskeleti + tazelik. veriMs: kartın en son verisinin zamanı. */
  kart(kimlik, o) {
    const simdi = this.simdi();
    const k = { kimlik, baslik: o.baslik, grup: o.grup, kaynak: o.kaynak, siklik: o.siklik, sinandi: SINANDI[o.sinandi || kimlik] || null, deger: o.deger || null,
      veriZamani: Number.isFinite(o.veriMs) ? new Date(o.veriMs).toISOString() : null, durum: 'iyi', neden: null };
    if (!o.deger) { k.durum = 'yok'; k.neden = o.yokNeden || 'veri yok'; return k; }
    if (Number.isFinite(o.veriMs) && o.esikMs && simdi - o.veriMs > o.esikMs) { k.durum = 'bayat'; k.neden = o.bayatNeden || 'kaynak yeni veri yayımlamadı'; }
    return k;
  }
  turevNeden(ad, varsayilan) {
    const t = this.durum().turev[ad];
    if (t && t.hata) return t.hata;
    if (!this.calisabilir()) return this.neden();
    return varsayilan;
  }

  ozet() {
    const simdi = this.simdi();
    if (this._ozetOnbellek && simdi - this._ozetOnbellek.zaman < 60e3) return this._ozetOnbellek.v;
    const kartlar = [];
    const ekle = (f) => { try { const x = f(); if (Array.isArray(x)) kartlar.push(...x); else if (x) kartlar.push(x); } catch (e) { kartlar.push({ kimlik: 'hata', baslik: 'Kart hesaplanamadı', durum: 'yok', neden: kisaHata(e), grup: 'genel' }); } };
    ekle(() => this.takvimKarti());
    ekle(() => this.protokolKarti());
    ekle(() => this.makroKartlari());
    ekle(() => this.opsiyonKartlari());
    ekle(() => this.pozisyonKartlari());
    ekle(() => this.akisKartlari());
    ekle(() => this.duyguKartlari());
    const v = {
      success: true, surum: this.surum, zaman: new Date(simdi).toISOString(), calisiyor: this.ornek || (this.calisabilir() && !!this._id), neden: this.ornek ? null : this.neden(), ornek: this.ornek || undefined,
      kararPenceresi: this.pencerede(simdi), baslik: 'Karar kuralı yok · bilgi',
      kartlar,
      kaynaklar: KAYNAKLAR.map(k => { const d = this.kd(k.ad); return { ad: k.ad, kisaAd: k.kisaAd, ne: k.ne, siklik: k.siklik, sonBasari: d.sonBasari || null, sonDeneme: d.sonDeneme || null, sonHata: d.sonHata || null }; })
        .concat([
          { ad: 'ileriye-kayit', kisaAd: 'İleriye kayıt (sunucu)', ne: 'Opsiyon (OKX + Bybit + Binance, 4 sa), vadeli pozisyon istatistikleri (3 sa), Hyperliquid büyük hesaplar (1 sa) — lib/ileriKayit', siklik: 'türetme: kayıtçı yeni yazdığında, en çok 2 dk\'da bir bakılır', sonBasari: (this.durum().turev.opsiyon || {}).zaman || null, sonHata: (this.durum().turev.opsiyon || {}).hata || null },
          { ad: 'market-db', kisaAd: 'market.db (Binance günlük)', ne: 'Alt sezonu ve RSI haritası — veri orkestratörünün günlük Binance mumları', siklik: 'günde bir (yeni mum gelince)', sonBasari: (this.durum().turev.genislik || {}).zaman || null, sonHata: (this.durum().turev.genislik || {}).hata || null },
          { ad: 'tarama-arsiv', kisaAd: 'Coin tarama gece arşivi', ne: 'DefiLlama protokol listesi, ücret ve gelir (toplu.json)', siklik: 'günde bir (gece taraması)', sonBasari: (this.durum().turev.protokol || {}).zaman || null, sonHata: (this.durum().turev.protokol || {}).hata || null },
          { ad: 'yahoo', kisaAd: 'Yahoo portföy serileri', ne: 'EURUSD, USDJPY, GBPUSD, USDCAD, USDCHF, ^IRX, USD/TRY — veri orkestratörü (her gece)', siklik: 'okunur: her istekte', sonBasari: null, sonHata: null },
          { ad: 'tufe', kisaAd: 'TÜFE (EVDS)', ne: 'TÜİK TÜFE — veri orkestratörü (ayın 3\'ü 11:00 sonrası)', siklik: 'okunur: her istekte', sonBasari: null, sonHata: null },
        ]),
    };
    this._ozetOnbellek = { zaman: simdi, v };
    return v;
  }

  takvimKarti() {
    const simdi = this.simdi();
    const gelecek = this.olaylar(simdi - 2 * SAAT, simdi + 21 * GUN).map(o => ({ ...o, metin: T.olayMetni(o), gecti: o.zaman <= simdi }));
    const gecmis = this.olaylar(simdi - 14 * GUN, simdi).filter(o => ['fomc', 'tufe-abd', 'tufe-tr'].includes(o.tur)).map(o => { const s = this.olaySonucu(o); return { ...o, metin: T.olayMetni(o), sonuc: s, sonucMetin: s ? sonucCumlesi(o, s) : null }; }).reverse();
    const f = this.kd('fomc'), a = this.kd('abdTufe');
    const notlar = [];
    if (!f.sonBasari) notlar.push(`FOMC: ${f.sonHata ? `takvim sayfası okunamadı (${f.sonHata}) — ` : ''}depodaki statik liste kullanılıyor (kayitlar/qqq-ay-donumu/fomc-tarihleri.json)`);
    if (!a.sonBasari) notlar.push(`ABD TÜFE: ${a.sonHata ? `FRED takvimi okunamadı (${a.sonHata})` : 'takvim henüz alınmadı'} — tarihler gösterilemiyor`);
    notlar.push('Coin kilit açılımları: otomatik ücretsiz kaynak yok (Tokenomist otomatik erişimi yasaklıyor, DefiLlama emissions ücretli) — yalnız elle eklenenler görünür.');
    return this.kart('takvim', { baslik: 'Önümüzdeki 3 hafta ve açıklanan sonuçlar', grup: 'takvim', kaynak: 'federalreserve.gov · FRED yayın takvimi · TÜİK kuralı · SPK süreleri · elle', siklik: 'takvimler haftada bir; sonuçlar olay anında',
      deger: { gelecek, gecmis, notlar }, veriMs: simdi });
  }

  protokolKarti() {
    const t = this.turev('protokol');
    return this.kart('protokol', { baslik: 'Protokol kartı — ücret, gelir, TVL', grup: 'protokol', kaynak: 'DefiLlama (coin tarama gece arşivi)', siklik: 'günde bir',
      deger: t && t.veri, veriMs: t && t.veri ? Date.parse(t.veri.gun + 'T12:00:00Z') : null, esikMs: ESIK.tarama,
      yokNeden: this.turevNeden('protokol', 'coin tarama gece arşivi henüz yok'), bayatNeden: 'coin tarama gece arşivi güncellenmedi (Veri › Günlük arşiv)' });
  }

  makroKartlari() {
    const out = [];
    const f = this.ham('fred');
    const fs_ = (id) => this.fredSeri(id);
    const fn = this.kaynakNeden('fred');
    const sonMs = (l) => (l.length ? Date.parse(l[l.length - 1].d + 'T00:00:00Z') : null);
    // Net likidite
    const nl = f ? H.netLikidite(fs_('WALCL'), fs_('WTREGEN'), fs_('RRPONTSYD')) : null;
    out.push(this.kart('netLikidite', { baslik: 'Net likidite (Fed bilançosu − TGA − ters repo)', grup: 'makro', kaynak: 'FRED WALCL, WTREGEN, RRPONTSYD', siklik: 'haftalık (perşembe yayımı)',
      deger: nl, veriMs: nl ? Date.parse(nl.son.d + 'T00:00:00Z') : null, esikMs: ESIK.WALCL, yokNeden: fn, bayatNeden: fn }));
    // Faiz: ^IRX + Fed politika faizi
    const irx = yahooSeri(path.join(this.portfoyKok, 'yahoo', '_IRX.json'));
    const ust = fs_('DFEDTARU'), alt = fs_('DFEDTARL');
    const faiz = irx ? { irx: H.seriOzeti(irx, { gunler: [30, 91, 365] }), politika: ust.length && alt.length ? { d: ust[ust.length - 1].d, ust: ust[ust.length - 1].v, alt: alt[alt.length - 1].v } : null, seri: irx.slice(-260).map(x => [x.d, x.v]) } : null;
    out.push(this.kart('faiz', { baslik: 'Kısa vadeli faiz (13 haftalık hazine bonosu ^IRX) + Fed politika faizi', grup: 'makro', kaynak: 'Yahoo ^IRX (sunucu Yahoo serisi) · FRED DFEDTARU/L', siklik: 'iş günü',
      deger: faiz, veriMs: irx ? Date.parse(irx[irx.length - 1].d + 'T00:00:00Z') : null, esikMs: ESIK.yahoo, yokNeden: 'Yahoo ^IRX dosyası yok (veri orkestratörü "Yahoo portföy ekleri")', bayatNeden: 'Yahoo ^IRX güncellenmedi (Veri › Kaynaklar)' }));
    // Sentetik dolar endeksi
    const Y = (ad) => yahooSeri(path.join(this.portfoyKok, 'yahoo', `${ad}.json`));
    const sekS = yahooSeri(path.join(this.dizin('yahoo'), 'SEK_X.json'));
    const dx = H.sentetikDxy({ EURUSD: Y('EURUSD_X'), USDJPY: Y('JPY_X'), GBPUSD: Y('GBPUSD_X'), USDCAD: Y('CAD_X'), USDSEK: sekS, USDCHF: Y('CHF_X') });
    const dxo = dx.seri.length ? { ...H.seriOzeti(dx.seri, { gunler: [30, 365], oran: true }), seri: dx.seri.slice(-260).map(x => [x.d, x.v]) } : null;
    out.push(this.kart('dxy', { baslik: 'Sentetik dolar endeksi (DXY formülü)', grup: 'makro', kaynak: 'Yahoo EURUSD, JPY, GBPUSD, CAD, CHF (sunucu) + SEK=X', siklik: 'iş günü',
      deger: dxo, veriMs: dxo ? Date.parse(dxo.d + 'T00:00:00Z') : null, esikMs: ESIK.yahoo,
      yokNeden: dx.eksik.length ? `eksik kur: ${dx.eksik.join(', ')}${dx.eksik.includes('USDSEK') ? ` (${this.kaynakNeden('sek')})` : ''} — eksik kurla yaklaşık değer üretilmez` : 'ortak gün yok', bayatNeden: 'kur serileri güncellenmedi' }));
    // USD/TRY
    const tr = yahooSeri(path.join(this.portfoyKok, 'USDTRY_X.json'));
    const tro = tr ? { ...H.seriOzeti(tr, { gunler: [30, 365], oran: true }), seri: tr.slice(-260).map(x => [x.d, x.v]) } : null;
    out.push(this.kart('usdtry', { baslik: 'USD/TRY', grup: 'makro', kaynak: 'Yahoo USDTRY=X (veri orkestratörü)', siklik: 'iş günü',
      deger: tro, veriMs: tro ? Date.parse(tro.d + 'T00:00:00Z') : null, esikMs: ESIK.yahoo, yokNeden: 'USDTRY_X.json yok', bayatNeden: 'USD/TRY güncellenmedi (Veri › Kaynaklar)' }));
    // Enflasyon
    const cpi = fs_('CPIAUCSL').map(x => ({ ay: x.d.slice(0, 7), v: x.v }));
    const tj = jsonOku(path.join(this.portfoyKok, 'tufe.json'));
    const trt = ((tj && tj.aylik) || []).map(x => ({ ay: x.ay, v: Number(x.deger) }));
    const ea = H.enflasyon(cpi), et = H.enflasyon(trt);
    const ayMs = (ay) => (ay ? Date.parse(`${ay}-15T00:00:00Z`) : null);
    out.push(this.kart('tufe', { baslik: 'Enflasyon (TÜFE) — ABD ve Türkiye', grup: 'makro', kaynak: 'FRED CPIAUCSL (BLS) · TCMB EVDS (TÜİK)', siklik: 'aylık',
      deger: ea || et ? { abd: ea, tr: et } : null, veriMs: Math.min(...[ayMs(ea && ea.ay), ayMs(et && et.ay)].filter(Number.isFinite)), esikMs: ESIK.CPIAUCSL, yokNeden: fn, bayatNeden: 'yeni ay verisi gelmedi' }));
    // Stablecoin
    const st = this.ham('stablecoin');
    const sto = st && st.veri && st.veri.length ? { ...H.seriOzeti(st.veri, { gunler: [30, 91, 365], oran: true }), seri: st.veri.slice(-365).map(x => [x.d, x.v]) } : null;
    out.push(this.kart('stablecoin', { baslik: 'Stablecoin arzı (toplam, USD)', grup: 'makro', kaynak: 'DefiLlama stablecoincharts', siklik: 'günlük',
      deger: sto, veriMs: sto ? Date.parse(sto.d + 'T00:00:00Z') : null, esikMs: ESIK.stablecoin, yokNeden: this.kaynakNeden('stablecoin'), bayatNeden: this.kaynakNeden('stablecoin') }));
    // MVRV
    const mv = this.ham('mvrv');
    const mvl = mv && mv.veri ? mv.veri : [];
    const mvo = mvl.length ? { ...H.seriOzeti(mvl, { gunler: [30, 365] }), yil: { enDusuk: Math.min(...mvl.slice(-365).map(x => x.v)), enYuksek: Math.max(...mvl.slice(-365).map(x => x.v)) }, seri: mvl.slice(-365).map(x => [x.d, x.v]) } : null;
    out.push(this.kart('mvrv', { baslik: 'BTC MVRV (piyasa değeri / gerçekleşmiş değer)', grup: 'makro', kaynak: 'Coin Metrics Community (CapMVRVCur)', siklik: 'günlük',
      deger: mvo, veriMs: mvo ? Date.parse(mvo.d + 'T00:00:00Z') : null, esikMs: ESIK.mvrv, yokNeden: this.kaynakNeden('mvrv'), bayatNeden: this.kaynakNeden('mvrv') }));
    // Kredi spreadi
    const baa = fs_('BAA10Y');
    const ko = baa.length ? { ...H.seriOzeti(baa, { gunler: [30, 91, 365] }), seri: baa.slice(-500).map(x => [x.d, x.v]) } : null;
    out.push(this.kart('kredi', { baslik: "Kredi spreadi (Moody's Baa − 10 yıl)", grup: 'makro', kaynak: 'FRED BAA10Y', siklik: 'iş günü',
      deger: ko, veriMs: sonMs(baa), esikMs: ESIK.BAA10Y, yokNeden: fn, bayatNeden: fn }));
    // COT
    const c = this.ham('cftc');
    for (const [ad, kim, baslik] of [['btc', 'cot-btc', 'COT — CME Bitcoin (kaldıraçlı fonlar)'], ['nq', 'cot-nq', 'COT — Nasdaq-100 E-mini (kaldıraçlı fonlar)']]) {
      const o = c && c.veri ? H.cotOzeti(c.veri[ad]) : null;
      out.push(this.kart(kim, { baslik, grup: 'makro', kaynak: 'CFTC Traders in Financial Futures (gpe5-46if)', siklik: 'haftalık (salı verisi, cuma yayımı)',
        deger: o, veriMs: o ? Date.parse(o.d + 'T00:00:00Z') : null, esikMs: ESIK.cftc, yokNeden: this.kaynakNeden('cftc'),
        bayatNeden: `${this.kaynakNeden('cftc')} (ABD hükümet kapanmasında CFTC raporları gecikir)` }));
    }
    return out;
  }

  opsiyonKartlari() {
    const t = this.turev('opsiyon');
    const d = this.durum();
    return ['BTC', 'ETH'].map(coin => {
      const z = t && t.veri && t.veri.coinler && t.veri.coinler[coin];
      let deger = null;
      if (z) {
        const iv = z.iv && Number.isFinite(z.iv.atm) ? H.siraHesapla(d.seri[`iv-${coin}`], z.iv.atm) : null;
        const sk = z.iv && Number.isFinite(z.iv.carpiklik) ? H.siraHesapla(d.seri[`skew-${coin}`], z.iv.carpiklik) : null;
        deger = { ...z, ivSira: iv, skewSira: sk, gorunum: t.veri.zaman };
      }
      const zm = z && t.veri.zaman ? Math.max(...Object.entries(t.veri.zaman).filter(([k]) => k.endsWith(`|${coin}`)).map(([, v]) => Date.parse(v))) : null;
      return this.kart(`opsiyon-${coin}`, { baslik: `Opsiyon — ${coin}`, grup: 'opsiyon', sinandi: 'opsiyon', kaynak: 'ileriye kayıt: OKX + Bybit + Binance opsiyon (strike bazında)', siklik: '4 saatte bir anlık görüntü',
        deger, veriMs: Number.isFinite(zm) ? zm : null, esikMs: ESIK.opsiyon, yokNeden: this.turevNeden('opsiyon', 'ileriye kayıt opsiyon görüntüsü henüz işlenmedi'), bayatNeden: 'ileriye kayıt opsiyon kayıtçısı yeni görüntü yazmadı (Veri › İleriye kayıt)' });
    });
  }

  pozisyonKartlari() {
    const out = [];
    const b = this.ham('binanceVadeli');
    const fo = b && b.veri ? H.fundingOzeti(b.veri.prim) : null;
    out.push(this.kart('funding', { baslik: 'Funding (vadeli fonlama oranı)', grup: 'pozisyon', kaynak: 'Binance /fapi/v1/premiumIndex', siklik: 'saatte bir',
      deger: fo, veriMs: b ? Date.parse(b.zaman) : null, esikMs: ESIK.binanceVadeli, yokNeden: this.kaynakNeden('binanceVadeli'), bayatNeden: this.kaynakNeden('binanceVadeli') }));
    const p = this.turev('pozisyon');
    const pv = p && p.veri;
    const sonT = pv ? Math.max(...['BTC', 'ETH'].map(c => (pv[c] && pv[c].sonZaman) || 0)) : null;
    out.push(this.kart('oi', { baslik: 'Açık pozisyon (OI) ve büyük hesap long/short', grup: 'pozisyon', kaynak: 'ileriye kayıt: Binance /futures/data (1 saatlik)', siklik: '3 saatte bir',
      deger: pv ? { BTC: pv.BTC && { oi: pv.BTC.oi, ustPozisyon: pv.BTC.ustPozisyon, genelHesap: pv.BTC.genelHesap, gunKapsam: pv.BTC.gunKapsam }, ETH: pv.ETH && { oi: pv.ETH.oi, ustPozisyon: pv.ETH.ustPozisyon, genelHesap: pv.ETH.genelHesap, gunKapsam: pv.ETH.gunKapsam } } : null,
      veriMs: sonT || null, esikMs: ESIK.pozisyon, yokNeden: this.turevNeden('pozisyon', 'ileriye kayıt pozisyon verisi henüz işlenmedi'), bayatNeden: 'ileriye kayıt pozisyon kayıtçısı yeni veri yazmadı' }));
    const h = this.turev('hyperliquid');
    out.push(this.kart('hyperliquid', { baslik: 'Hyperliquid büyük hesaplar (ilk 100)', grup: 'pozisyon', kaynak: 'ileriye kayıt: Hyperliquid liderlik + clearinghouseState', siklik: 'saatte bir',
      deger: h && h.veri, veriMs: h && h.veri ? Date.parse(h.veri.zaman) : null, esikMs: ESIK.hyperliquid, yokNeden: this.turevNeden('hyperliquid', 'ileriye kayıt Hyperliquid verisi henüz işlenmedi'), bayatNeden: 'Hyperliquid kayıtçısı son 3 saatte yazmadı' }));
    return out;
  }

  akisKartlari() {
    const out = [];
    const p = this.turev('pozisyon');
    const pv = p && p.veri;
    const sonT = pv ? Math.max(...['BTC', 'ETH'].map(c => (pv[c] && pv[c].sonZaman) || 0)) : null;
    out.push(this.kart('cvd', { baslik: 'Taker al/sat oranı ve CVD (birikimli hacim farkı)', grup: 'akis', kaynak: 'ileriye kayıt: Binance takerlongshortRatio (1 saatlik)', siklik: '3 saatte bir',
      deger: pv ? { BTC: pv.BTC && { taker: pv.BTC.taker, cvdSeri: pv.BTC.cvdSeri, fiyat: pv.BTC.fiyat }, ETH: pv.ETH && { taker: pv.ETH.taker, cvdSeri: pv.ETH.cvdSeri, fiyat: pv.ETH.fiyat } } : null,
      veriMs: sonT || null, esikMs: ESIK.pozisyon, yokNeden: this.turevNeden('pozisyon', 'ileriye kayıt pozisyon verisi henüz işlenmedi'), bayatNeden: 'ileriye kayıt pozisyon kayıtçısı yeni veri yazmadı' }));
    const cb = this.ham('coinbase');
    const pr = cb && cb.veri ? H.coinbasePrimi(cb.veri.cb, cb.veri.bn, cb.veri.usdt) : null;
    out.push(this.kart('coinbase-primi', { baslik: 'Coinbase primi (ABD alım vekili)', grup: 'akis', kaynak: 'Coinbase BTC-USD, USDT-USD · Binance BTCUSDT (saatlik)', siklik: 'saatte bir',
      deger: pr, veriMs: pr ? pr.t : null, esikMs: ESIK.coinbase, yokNeden: this.kaynakNeden('coinbase'), bayatNeden: this.kaynakNeden('coinbase') }));
    const b = this.ham('binanceVadeli');
    const bz = b && b.veri ? { BTC: H.bazOzeti(b.veri.baz && b.veri.baz.BTCUSDT), ETH: H.bazOzeti(b.veri.baz && b.veri.baz.ETHUSDT), perp: H.fundingOzeti(b.veri.prim) } : null;
    const bzT = bz && (bz.BTC || bz.ETH) ? Math.max((bz.BTC || {}).t || 0, (bz.ETH || {}).t || 0) : null;
    out.push(this.kart('baz', { baslik: 'Vadeli baz (çeyreklik vadeli − endeks, yıllık)', grup: 'akis', kaynak: 'Binance /futures/data/basis (CURRENT_QUARTER) · perp prim', siklik: 'saatte bir',
      deger: bz && (bz.BTC || bz.ETH) ? bz : null, veriMs: bzT, esikMs: ESIK.binanceVadeli, yokNeden: this.kaynakNeden('binanceVadeli'), bayatNeden: this.kaynakNeden('binanceVadeli') }));
    return out;
  }

  duyguKartlari() {
    const out = [];
    const k = this.ham('korku');
    const ko = k && k.veri ? H.korkuOzeti(k.veri) : null;
    if (ko) ko.bolge = H.korkuBolge(ko.v);
    out.push(this.kart('korku', { baslik: 'Korku-açgözlülük endeksi (kripto)', grup: 'duygu', kaynak: 'alternative.me Fear & Greed', siklik: 'günlük',
      deger: ko, veriMs: ko ? Date.parse(ko.d + 'T00:00:00Z') : null, esikMs: ESIK.korku, yokNeden: this.kaynakNeden('korku'), bayatNeden: this.kaynakNeden('korku') }));
    const g = this.turev('genislik');
    const gv = g && g.veri;
    const gT = gv && gv.btcSon ? Date.parse(gv.btcSon + 'T00:00:00Z') : null;
    out.push(this.kart('alt-sezonu', { baslik: 'Alt sezonu endeksi (ilk 30 altcoin, 90 gün)', grup: 'duygu', kaynak: 'market.db Binance vadeli günlük mumları', siklik: 'günlük',
      deger: gv && Number.isFinite(gv.endeks) ? { endeks: gv.endeks, evren: gv.evren, btc90: gv.btc90, enIyi: gv.enIyi, enKotu: gv.enKotu } : null, veriMs: gT, esikMs: ESIK.marketDb,
      yokNeden: gv && gv.neden ? gv.neden : this.turevNeden('genislik', 'market.db günlük mumları henüz işlenmedi'), bayatNeden: 'market.db Binance günlük mumları güncellenmedi (Veri › Kaynaklar › Binance günlük)' }));
    out.push(this.kart('rsi', { baslik: 'RSI haritası (14 gün, günlük)', grup: 'duygu', sinandi: null, kaynak: 'market.db Binance vadeli günlük mumları', siklik: 'günlük',
      deger: gv && gv.rsi && gv.rsi.length ? { btc: gv.btcRsi, coinler: gv.rsi.slice().sort((a, b) => b.r - a.r) } : null, veriMs: gT, esikMs: ESIK.marketDb,
      yokNeden: this.turevNeden('genislik', 'market.db günlük mumları henüz işlenmedi'), bayatNeden: 'market.db Binance günlük mumları güncellenmedi' }));
    return out;
  }

  /** Ana sayfa "Bu hafta": İstanbul haftasının olayları + açıklanan sonuçlar. */
  hafta() {
    const simdi = this.simdi();
    const { bas, bit } = T.haftaSiniri(simdi);
    const satir = (o) => ({ kimlik: o.kimlik, tur: o.tur, metin: T.olayMetni(o), zaman: new Date(o.zaman).toISOString(), gecti: o.zaman <= simdi, tahmini: o.tahmini, sonuc: o.zaman <= simdi ? this.sonucMetni(o) : null });
    const olaylar = this.olaylar(bas, bit).map(satir);
    // Bu haftanın kalan olayı yoksa (ör. hafta sonu) gelecek haftanınkiler de gösterilir.
    const sonraki = olaylar.some(o => !o.gecti) ? [] : this.olaylar(bit + 1, bit + 7 * GUN).map(satir);
    return { success: true, bas: new Date(bas).toISOString(), bit: new Date(bit).toISOString(), olaylar, sonraki, calisiyor: this.calisabilir(), neden: this.neden() };
  }

  /** Saf olmayan (veri okur): olay sonucu → tek satır Türkçe metin (yorum yok). */
  sonucMetni(o) {
    const s = this.olaySonucu(o);
    if (!s) return null;
    return sonucCumlesi(o, s);
  }

  /** Sorun merkezi için: uzun süredir alınamayan kaynaklar (yalnız sunucu). */
  saglik() {
    if (!this.calisabilir()) return { calisiyor: false, sorunlu: [] };
    const simdi = this.simdi();
    const sorunlu = [];
    for (const k of KAYNAKLAR) {
      const d = this.kd(k.ad);
      if (!d.sonHata) continue;
      const ref = d.sonBasari ? Date.parse(d.sonBasari) : this.baslangic;
      if (ref && simdi - ref > Math.max(2 * k.aralikMs, 6 * SAAT)) sorunlu.push({ ad: k.ad, kisaAd: k.kisaAd, hata: d.sonHata, saat: Math.round((simdi - ref) / SAAT) });
    }
    return { calisiyor: true, sorunlu };
  }

  router() {
    const express = require('express');
    const r = express.Router();
    r.get('/api/piyasa-baglami', (req, res) => { try { res.json(this.ozet()); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
    r.get('/api/piyasa-baglami/hafta', (req, res) => { try { res.json(this.hafta()); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
    return r;
  }
}

const yz = (x, b = 1) => `%${(Math.abs(x) * 100).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b })}`;
const isaretli = (x, b = 1) => `${x < 0 ? '−' : '+'}${yz(x, b)}`;
const faizMetin = (x) => `%${x.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Saf: olay + sonuç → tek cümle (yalnız rakam; yorum / öneri yok). */
function sonucCumlesi(o, s) {
  if (o.tur === 'fomc') {
    const aralik = `${faizMetin(s.alt)}–${faizMetin(s.ust).slice(1)}`;
    if (s.yon === 'sabit') return `Fed politika faizini ${aralik} aralığında sabit bıraktı.`;
    return `Fed politika faizini ${(s.adim || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} puan ${s.yon === 'artirdi' ? 'artırdı' : 'indirdi'}: ${aralik}.`;
  }
  if (o.tur === 'tufe-abd' || o.tur === 'tufe-tr') {
    return `${o.tur === 'tufe-abd' ? 'ABD' : 'Türkiye'} TÜFE ${T.ayAdi(s.ay)}: aylık ${isaretli(s.aylik)}${s.yillik != null ? `, yıllık ${isaretli(s.yillik)}` : ''}.`;
  }
  return null;
}

/**
 * server.js bağlantısı (tek satır): router + sunucuda toplayıcı. @param o { app, log, binanceBekleme?, mumDeposu?, surum? }
 */
function kur({ app, log, binanceBekleme, mumDeposu, surum } = {}) {
  let kota;
  if (binanceBekleme) {
    const { BinanceKota } = require('../veri/orkestrator');
    kota = () => new BinanceKota({ bekleme: binanceBekleme });
  }
  const pb = new PiyasaBaglami({ log, kota, mumDeposu, surum });
  if (app) app.use(pb.router());
  pb.baslat();
  return pb;
}

module.exports = { PiyasaBaglami, KAYNAKLAR, SINANDI, ESIK, kur, sonucCumlesi, yahooSeri };
