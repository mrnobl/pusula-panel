/**
 * NOKTA-ZAMANLI (PIT) EVREN — her ay başı, son 30 günün USDT hacmine göre
 * ilk 15 USDT-M perp (stabil coinler hariç).
 *
 * Kural `scripts/hayatta-kalma.js` ile BİREBİR (B Kalkan ölçümünün evreni):
 *   · ay M'nin evreni, M'den önceki son günün (ay başı − 1 gün) mumu DAHİL
 *     geriye 30 günlük mumdan hesaplanır: puan = ort(hacim × kapanış)
 *   · o gün mumu olmayan ya da 30 mumu dolmayan sembol aday değildir
 *   · puan sırasıyla ilk k (15)
 * Hacim = baz hacim × kapanış (araştırma arşivinin elindeki ölçü; Binance'in
 * kline "quote volume" alanı ccxt OHLCV'de yok — ikisi yakın ama aynı değil,
 * ölçümle aynı kalmak için bu kullanılır).
 *
 * Saf kısım `evrenSec` (test edilir). Borsa kısmı `evrenOlustur`: pazarlardan
 * USDT-M lineer perp'leri süzer, 24 saatlik hacimle ÖN SEÇİM yapar (hepsinin
 * 30 günlük mumunu çekmek ~500 istek olurdu), sonra adayların günlük mumlarıyla
 * `evrenSec`. Ön seçim varsayımı: 30 günlük ilk 15, 24 saatlik ilk `onSecim`
 * (60) içindedir — `evren.json`a ön seçim boyutu ve dışarıda kalan yazılır.
 *
 * `Evren` sınıfı durumu diske yazar (`evren.json`): ay etiketi, semboller,
 * puanlar ve AY GEÇMİŞİ (ters-vol model getirisinde geçmiş üyelik için).
 * Ay değişince yenilenir; borsa okunamazsa ESKİ evren korunur ve `bayat`
 * işaretlenir (evren hiç yoksa hata atılır — boş evrenle işlem yapılmaz).
 */
const fs = require('fs');
const path = require('path');
const kalici = require('./kaliciDosya');

const GUN = 864e5;
/** `scripts/hayatta-kalma.js` STABIL ile aynı (tek kaynak burası; betik buradan okur). */
const STABIL = /^(USDC|BUSD|TUSD|FDUSD|USDP|DAI|UST|USTC|EUR|GBP|AEUR|PAX|USDE|RLUSD|USD1|BFUSD)\//;
const VARSAYILAN = Object.freeze({ k: 15, pencere: 30, onSecim: 60 });

const ayBasi = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const ayEtiketi = (t) => new Date(ayBasi(t)).toISOString().slice(0, 7);
const ayEtiketindenBas = (e) => Date.parse(`${e}-01T00:00:00Z`);

/**
 * SAF: aday listesinden ayın evreni.
 * @param liste [{ symbol, mumlar: [{ time, close, volume }] }]  (en eski → en yeni)
 * @param ay    ay başı (ms, UTC) — ya da o ayın herhangi bir anı
 * @returns {{ ay, semboller, puanlar: [[sembol, ortHacimUSDT]], elenen: [{symbol, sebep}] }}
 */
function evrenSec(liste, ay, ayar = {}) {
  const a = { ...VARSAYILAN, ...ayar };
  const bas = ayBasi(ay);
  const puan = [], elenen = [];
  for (const { symbol, mumlar } of liste) {
    if (STABIL.test(symbol)) { elenen.push({ symbol, sebep: 'stabil' }); continue; }
    const m = mumlar || [];
    const son = m.findIndex(x => x.time === bas - GUN);
    if (son < 0) { elenen.push({ symbol, sebep: 'ay başından önceki günün mumu yok' }); continue; }
    if (son < a.pencere - 1) { elenen.push({ symbol, sebep: `${son + 1} günlük geçmiş < ${a.pencere}` }); continue; }
    let t = 0;
    for (let j = son - a.pencere + 1; j <= son; j++) t += m[j].volume * m[j].close;
    puan.push([symbol, t / a.pencere]);
  }
  // Eşitlikte sembol adı — sonuç girdi sırasına bağlı olmasın.
  puan.sort((x, y) => (y[1] - x[1]) || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return { ay: ayEtiketi(bas), semboller: puan.slice(0, a.k).map(x => x[0]), puanlar: puan.slice(0, a.k), elenen };
}

/**
 * Pazar KRİPTO USDT-M lineer perp mi (stabil hariç, aktif).
 * TradFi HARİÇ (2026-10-07 bulgu): Binance altın/gümüş/petrol/hisse/ETF perp'leri (XAU, XAG, CL, SOXL, SPCX,
 * SKHYNIX, QQQ…) ccxt'de sıradan swap görünür; ayırt eden `info.contractType` ('TRADIFI_PERPETUAL' ↔ 'PERPETUAL')
 * ve `info.underlyingType` ('COMMODITY'/'EQUITY'… ↔ 'COIN'). Ölçülen strateji yalnız kripto evrenidir.
 * `info` taşımayan pazar (kâğıt/test borsası) eskisi gibi kabul edilir.
 */
function perpMi(m) {
  if (!(!!m && (m.swap || m.type === 'swap') && m.linear !== false && m.quote === 'USDT' && (m.settle || 'USDT') === 'USDT'
    && m.active !== false && !STABIL.test(m.symbol))) return false;
  const i = m.info || {};
  if (i.contractType && i.contractType !== 'PERPETUAL') return false;
  if (i.underlyingType && i.underlyingType !== 'COIN') return false;
  return true;
}

/**
 * Evren süzgecinin sürümü — süzgeç değişince kayıtlı ayın evreni GEÇERSİZ sayılır ve yeniden kurulur.
 * 2: TradFi hariç (perpMi).
 */
const FILTRE_SURUMU = 2;

/**
 * Borsadan ayın evreni. Yalnız KAPANMIŞ günlük mumlar kullanılır.
 * @param borsa ccxt benzeri (markets, fetchOHLCV, fetchTickers?)
 */
async function evrenOlustur(borsa, simdi = Date.now(), ayar = {}) {
  const a = { ...VARSAYILAN, ...ayar };
  if (!borsa.markets || !Object.keys(borsa.markets).length) await borsa.loadMarkets();
  if (a.aday === 'veri') return evrenOlusturVeriden(borsa, simdi, a);   // A2 parça 2: OKX botu (Binance PIT ∩ işlem borsası)
  let adaylar = Object.values(borsa.markets).filter(perpMi).map(m => m.symbol);
  // Veri ayrık borsa (demo emir + prod veri): aday yalnız İKİ borsada da aktif olan sembol.
  // Aksi hâlde demo'da hâlâ listeli ama prod'da kaldırılmış bir sembol (SXP) prod'un
  // fetchTickers'ını tümden düşürür ve evren hiç kurulamaz.
  const veri = borsa.__veri;
  let veriDisi = 0;
  if (veri) {
    if (!veri.markets || !Object.keys(veri.markets).length) await veri.loadMarkets();
    const once = adaylar.length;
    adaylar = adaylar.filter(s => perpMi(veri.markets[s]));
    veriDisi = once - adaylar.length;
  }
  const toplamAday = adaylar.length;
  let onSecimDisi = 0;
  if (typeof borsa.fetchTickers === 'function' && adaylar.length > a.onSecim) {
    const t = await borsa.fetchTickers(adaylar);
    const hacim = (s) => { const x = t[s]; return x ? (+x.quoteVolume || (+x.baseVolume || 0) * (+x.last || 0)) : 0; };
    adaylar.sort((x, y) => hacim(y) - hacim(x));
    onSecimDisi = adaylar.length - a.onSecim;
    adaylar = adaylar.slice(0, a.onSecim);
  }
  const bas = ayBasi(simdi);
  const liste = [];
  const hatalar = [];
  for (const symbol of adaylar) {
    try {
      const ham = await borsa.fetchOHLCV(symbol, '1d', bas - (a.pencere + 3) * GUN, a.pencere + 10);
      liste.push({ symbol, mumlar: ham.filter(m => m[0] + GUN <= simdi).map(m => ({ time: m[0], close: m[4], volume: m[5] })) });
    } catch (e) { hatalar.push({ symbol, hata: e.message }); }
  }
  // Çok sayıda okuma hatası evreni sessizce bozar: adayların yarısından fazlası okunamadıysa reddet.
  if (hatalar.length > adaylar.length / 2) throw new Error(`evren: ${hatalar.length}/${adaylar.length} sembolün mumu okunamadı (${hatalar[0].hata})`);
  const s = evrenSec(liste, bas, a);
  return { ...s, zaman: simdi, toplamAday, onSecim: adaylar.length, onSecimDisi, veriDisi, okumaHatasi: hatalar };
}

/**
 * A2 parça 2 (TASARIM §7.5 / §11 #11 — OKX demo botu): evren = BİNANCE PIT evreni ∩ işlem borsası. Adaylar YALNIZ veri borsasının
 * (Binance prod, anahtarsız) pazarlarından — işlem borsasının (OKX) listesi evreni DEĞİŞTİRMEZ: gölgeyle aynı 15 sembol. İşlem
 * borsasında olmayan sembol evrende kalır, hedefi KalkanBot'ta 0 olur (raporda "OKX'te yok"). Veri borsası: veriAyir yüzeyinde
 * `__veri`, kâğıt borsada `veri`; yoksa hata (evren işlem borsasından sessizce kurulmaz). Hesap aynı (fetchTickers / fetchOHLCV veri
 * borsasından), yalnız aday listesi farklı. Binance botlarında bu yol hiç çağrılmaz (ayarda `aday` yok).
 */
async function evrenOlusturVeriden(borsa, simdi, a) {
  const veri = borsa.__veri || (borsa.kagit ? borsa.veri : null);
  if (!veri) throw new Error('evren: veri borsası (Binance) yok — Binance PIT evreni kurulamaz');
  if (!veri.markets || !Object.keys(veri.markets).length) await veri.loadMarkets();
  let adaylar = Object.values(veri.markets).filter(perpMi).map(m => m.symbol);
  const toplamAday = adaylar.length;
  let onSecimDisi = 0;
  if (typeof veri.fetchTickers === 'function' && adaylar.length > a.onSecim) {
    const t = await veri.fetchTickers(adaylar);
    const hacim = (s) => { const x = t[s]; return x ? (+x.quoteVolume || (+x.baseVolume || 0) * (+x.last || 0)) : 0; };
    adaylar.sort((x, y) => hacim(y) - hacim(x));
    onSecimDisi = adaylar.length - a.onSecim;
    adaylar = adaylar.slice(0, a.onSecim);
  }
  const bas = ayBasi(simdi);
  const liste = [], hatalar = [];
  for (const symbol of adaylar) {
    try {
      const ham = await veri.fetchOHLCV(symbol, '1d', bas - (a.pencere + 3) * GUN, a.pencere + 10);
      liste.push({ symbol, mumlar: ham.filter(m => m[0] + GUN <= simdi).map(m => ({ time: m[0], close: m[4], volume: m[5] })) });
    } catch (e) { hatalar.push({ symbol, hata: e.message }); }
  }
  if (hatalar.length > adaylar.length / 2) throw new Error(`evren: ${hatalar.length}/${adaylar.length} sembolün mumu okunamadı (${hatalar[0].hata})`);
  const s = evrenSec(liste, bas, a);
  const islemDisi = s.semboller.filter(x => !(borsa.markets && borsa.markets[x]));
  return { ...s, zaman: simdi, toplamAday, onSecim: adaylar.length, onSecimDisi, veriDisi: 0, okumaHatasi: hatalar, aday: 'veri', islemDisi };
}

class Evren {
  /**
   * @param ayar { dizin (null → yalnız bellek), k, pencere, onSecim, sabit: [semboller] (PIT kapalı), kaydet }
   */
  constructor(ayar = {}) {
    this.ayar = { ...VARSAYILAN, ...ayar };
    this.kaydet = ayar.kaydet || (() => {});
    this.dosya = ayar.dizin ? path.join(ayar.dizin, 'evren.json') : null;
    this.durum = { ay: null, semboller: [], puanlar: [], zaman: null, bayat: false, gecmis: {} };
    // Y2 (61.7): bozuk dosya SESSİZCE sıfırlanmaz — son iyi kopyadan (.yedek) kurtarılır, `this.bozuk` dolar;
    // BindirmeBot bunu ENGEL + alarm yapar (lib/live/kaliciDosya.js).
    this.bozuk = null;
    if (this.dosya) {
      const k = kalici.oku(this.dosya);
      if (k.veri) this.durum = { ...this.durum, ...k.veri };
      if (k.bozuk) { this.bozuk = k.bozuk; this.kaydet('ERROR', `durum dosyası: ${k.bozuk}`); }
    }
  }

  _yaz() {
    if (!this.dosya) return;
    kalici.yaz(this.dosya, this.durum);   // Y2: fsync + son iyi kopya (.yedek)
  }

  sabitMi() { return Array.isArray(this.ayar.sabit) && this.ayar.sabit.length > 0; }

  semboller() { return this.sabitMi() ? [...this.ayar.sabit] : [...this.durum.semboller]; }

  /** Ayın evreni (geçmiş kayıttan); kayıt yoksa null. */
  ayEvreni(t) {
    if (this.sabitMi()) return [...this.ayar.sabit];
    const e = this.durum.gecmis[ayEtiketi(t)];
    return e ? [...e] : null;
  }

  /**
   * Ay değiştiyse evreni borsadan yeniden kurar. `kalici: false` → diske yazmaz
   * (kuru çalıştırma).
   * @returns {{ degisti, ay, semboller, eklenen, cikan, bayat, hata? }}
   */
  async guncelle(borsa, simdi = Date.now(), { kalici = true, zorla = false } = {}) {
    const ay = ayEtiketi(simdi);
    const onceki = this.semboller();
    if (this.sabitMi()) return { degisti: false, ay, semboller: onceki, eklenen: [], cikan: [], bayat: false, sabit: true };
    // Eski süzgeçle kurulmuş evren (ör. TradFi sızıntısı) aynı ay içinde de yeniden kurulur.
    const eskiSuzgec = (this.durum.filtreSurumu || 1) !== FILTRE_SURUMU && !!this.durum.ay;
    if (this.durum.ay === ay && !zorla && !this.durum.bayat && !eskiSuzgec) return { degisti: false, ay, semboller: onceki, eklenen: [], cikan: [], bayat: false };
    let yeni;
    try {
      yeni = await evrenOlustur(borsa, simdi, this.ayar);
      if (!yeni.semboller.length) throw new Error('evren boş çıktı');
    } catch (e) {
      if (!onceki.length) throw new Error(`evren kurulamadı: ${e.message}`);
      this.durum.bayat = true;
      if (kalici) this._yaz();
      this.kaydet('WARN', `Evren yenilenemedi (${e.message}) — ${this.durum.ay} evreni korunuyor`);
      return { degisti: false, ay, semboller: onceki, eklenen: [], cikan: [], bayat: true, hata: e.message };
    }
    const eklenen = yeni.semboller.filter(s => !onceki.includes(s));
    const cikan = onceki.filter(s => !yeni.semboller.includes(s));
    // Eski süzgeçten kalan geçmiş aylar da temizlenir (ters-vol model getirisi geçmiş üyeliği kullanır):
    // bugünkü süzgeçten geçmeyen bilinen pazarlar çıkarılır; borsada artık olmayan sembol (delist) korunur.
    let gecmis = { ...this.durum.gecmis };
    const temizlenen = [];
    if (eskiSuzgec && borsa.markets) {
      const g = {};
      for (const [a, l] of Object.entries(gecmis)) {
        g[a] = l.filter(s => { const m = borsa.markets[s]; const kal = !m || perpMi(m); if (!kal) temizlenen.push(`${a}:${s.split('/')[0]}`); return kal; });
      }
      gecmis = g;
    }
    const durum = { ...this.durum, ay, semboller: yeni.semboller, puanlar: yeni.puanlar, zaman: simdi, bayat: false,
      onSecim: yeni.onSecim, onSecimDisi: yeni.onSecimDisi, toplamAday: yeni.toplamAday, filtreSurumu: FILTRE_SURUMU,
      gecmis: { ...gecmis, [ay]: yeni.semboller } };
    if (kalici) {
      this.durum = durum;
      this._yaz();
      if (eskiSuzgec) this.kaydet('WARN', `Evren süzgeci güncellendi (sürüm ${FILTRE_SURUMU}: TradFi hariç) — ${ay} evreni yeniden kuruldu${temizlenen.length ? `; geçmişten çıkarılan: ${temizlenen.join(', ')}` : ''}`);
      this.kaydet('INFO', `Evren ${ay}: ${yeni.semboller.map(s => s.split('/')[0]).join(', ')}${eklenen.length ? ` · giren ${eklenen.map(s => s.split('/')[0]).join(', ')}` : ''}${cikan.length ? ` · çıkan ${cikan.map(s => s.split('/')[0]).join(', ')}` : ''}`);
    }
    return { degisti: true, ay, semboller: yeni.semboller, eklenen, cikan, bayat: false };
  }

  ozet() { return { ...this.durum, sabit: this.sabitMi() ? this.ayar.sabit : null, k: this.ayar.k }; }
}

module.exports = { Evren, evrenSec, evrenOlustur, evrenOlusturVeriden, perpMi, FILTRE_SURUMU, STABIL, ayBasi, ayEtiketi, ayEtiketindenBas, GUN, VARSAYILAN };
