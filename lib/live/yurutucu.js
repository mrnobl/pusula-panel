/**
 * CANLI YÜRÜTÜCÜ — Binance USDⓈ-M'e emir gönderen tek yer.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * İLKELER (araştırma: passivbot, hummingbot, NautilusTrader — PLAN-GECE.md F1)
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. BORSA TEK GERÇEK. Pozisyon ve bakiye her kararda borsadan okunur; yerel
 *    durum yalnız "ben ne göndermiştim" defteridir.
 * 2. AÇILIŞ MUTABAKATI KAPALI-BAŞARISIZ (fail-closed). Bakiye, pozisyon ve
 *    açık emirler eksiksiz okunamazsa ya da defterde çözülemeyen BİLİNMİYOR
 *    emir varsa durum DURDURULDU olur; yalnız azaltan emir ve acil durdurma
 *    çalışır.
 * 3. ÖNCE DEFTERE YAZ, SONRA GÖNDER. Kesin red dışındaki HER sonuç (ağ, zaman
 *    aşımı, -1000/-1001/-1006, 5xx, boş/bozuk gövde, beklenmeyen hata) → BİLİNMİYOR;
 *    aynı clientOrderId ile SORGULANIR, körlemesine yeniden gönderilmez. Tek istisna
 *    -1021 (saat): ölç → sorgula → yoksa aynı kimlikle BİR kez yeniden gönder.
 *    Sorgunun "emir yok" cevabı genç emirde KESİN değildir (M4-1): emir BİLİNMİYOR kalır,
 *    RED ancak `tazeBulunamadiMs` üst süresinden sonra hâlâ "yok" ise yazılır.
 *    418/429 → geri çekilme (Retry-After); 418 ban'da hiçbir istek atılmaz (M3).
 * 4. STRATEJİ HEDEF SÖYLER, YÜRÜTÜCÜ FARKI KAPATIR (`hedefeGetir`).
 * 5. YABANCI EMİRLERE DOKUNULMAZ. İptal ve mutabakat yalnız `ag-` önekli
 *    emirlere uygulanır; elle verilmiş emirler raporlanır.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KAPILAR — gerçek parayı koruyan sıra
 * ═══════════════════════════════════════════════════════════════════════════
 *   · live ortamında anahtarın para çekme izni AÇIKSA bağlantı reddedilir.
 *   · live ortamında pozisyon BÜYÜTEN emir için ayrıca KİLİT AÇIK (arm) olmalı. 61.7 (denetim K1): onay
 *     KALICI (`<dizin>/canli-onay.json`, onaylanan tavanlarla) — yeniden başlatma, 418/429 ya da belirsizlik
 *     durdurması onayı KALDIRMAZ (otonom bot ertesi gün emir verebilmeli). Yalnız ELLE durdurma (acil, kesin
 *     red/çözülemeyen emir) ve "kilidi kapat" kaldırır. Tavanlar onaydakinden büyütülürse onay geçersizdir.
 *     Yalnız-azaltan (reduceOnly) emir kilitten MUAF: risk azaltmak hiçbir zaman engellenmez.
 *   · emir başına ve sembol başına nominal tavanı (USDT).
 *   · DURDURULDU durumunda pozisyon büyüten emir yok.
 * Testnet'te kilit gerekmez (gerçek para yok) ama tavanlar yine uygulanır —
 * testnet davranışı live'ın provası olmalı.
 */
const ccxt = require('ccxt');
const { Defter, SON_DURUMLAR } = require('./defter');
const kimlik = require('./emirKimligi');
const { onKontrol, ondalik } = require('./onKontrol');
const istemci = require('./binanceIstemci');
const fs = require('fs');
const path = require('path');
const kalici = require('./kaliciDosya');

// ═══════════════════════════════════════════════════════════════════════════
// HATA SINIFLAMASI (M3 — PLAN-TEST.md; sözleşme testi scripts/hata-matrisi-selftest.js)
// ═══════════════════════════════════════════════════════════════════════════
// ccxt 4.5.71'in Binance eşlemesi (ölçüldü): -1000/-1001/-1006/-1008 → OperationFailed
// (NetworkError DEĞİL), -1007 → RequestTimeout, -1021 → InvalidNonce, -5028 → BadRequest,
// 418/429 → DDoSProtection, -1003/-1015 → RateLimitExceeded, 200 + boş/null gövde → TypeError,
// 200 + {} → hata YOK (id/status boş emir nesnesi). Bu yüzden "belirsiz" bir beyaz liste
// değil, VARSAYILANDIR: yalnız borsanın emri kesin reddettiğini söyleyen sınıflar RED olur.
//   RED        kesin red (emir defterine girmedi) → RED, sorgu yok
//   BELIRSIZ   emir gitmiş olabilir → BILINMIYOR + aynı clientOrderId ile sorgu
//   HIZ        418/429/-1003/-1015 → geri çekilme (Retry-After, yoksa üstel); 418 = ban
//   SAAT       -1021/-5028 → saat farkı yeniden ölçülür, sorgu, aynı kimlikle BİR yeniden deneme
//   BULUNAMADI OrderNotFound (yalnız sorgu/iptal cevabında anlamlı)
const KESIN_RED = [ccxt.InvalidOrder, ccxt.InsufficientFunds, ccxt.BadRequest, ccxt.AuthenticationError,
  ccxt.OperationRejected, ccxt.NotSupported, ccxt.ArgumentsRequired, ccxt.InvalidAddress];
const SAAT_KODU = /"code"\s*:\s*-(1021|5028)\b/;
const hizHatasiMi = (e) => e instanceof ccxt.DDoSProtection || e instanceof ccxt.RateLimitExceeded;

/** Yürütücü geri çekilmedeyken istek hiç gönderilmedi (borsaya ulaşmadı). */
class GeriCekilmeHatasi extends Error {
  constructor(m) { super(m); this.name = 'GeriCekilmeHatasi'; this.kod = 'GERI_CEKILME'; }
}

/**
 * DURDURMA TÜRÜ (F2): DURDURULDU'dan kim çıkarır?
 *   GERI_CEKILME  418/429 geri çekilmesi (istek atılamadı / hız sınırı) → süre bitince yürütücü KENDİSİ mutabakat yapar
 *   BELIRSIZ      belirsiz sonuç (sorgu ağ/5xx/bozuk gövde, mutabakat okunamadı) → aralıkla KENDİSİ mutabakat yapar
 *   ACILIS        bağlanırken (açılış mutabakatı bekleniyor)
 *   ELLE          acil durdurma, çözülemeyen emir (mutabakatta sorgu yine bozuk), kesin-red sınıfı okuma hatası
 *                 (yetki vb.) → otomatik KALKMAZ; panelden mutabakat / bot yeniden başlatma (günlük çalışmanın
 *                 kendi mutabakatı — mevcut davranış — yine koşar, temizse AKTIF yapar).
 * Bilinmeyen sebep VARSAYILAN ELLE (kapalı-başarısız). ELLE bir durdurma, sonradan gelen otomatik türle İNMEZ
 * (ör. acil durdurma sırasında 429) — yalnız tam mutabakat türü yeniden belirler.
 */
const DURMA_TURU = Object.freeze({ GERI_CEKILME: 'GERI_CEKILME', BELIRSIZ: 'BELIRSIZ', ACILIS: 'ACILIS', ELLE: 'ELLE' });
const OTOMATIK_CIKIS = new Set([DURMA_TURU.GERI_CEKILME, DURMA_TURU.BELIRSIZ]);
// Mutabakatta çözülemeyen emrin iç işareti: genç emir sorguda henüz görünmedi (M4-1) → durdurma BELIRSIZ (otomatik çıkış), ELLE değil.
const GORUNMEDI = 'GORUNMEDI';

/** Hatadan durdurma türü: geri çekilme/hız → GERI_CEKILME; kesin red sınıfı (yetki, hatalı istek) → ELLE; kalan → BELIRSIZ. */
function durmaTuruSec(e) {
  if (e instanceof GeriCekilmeHatasi || (e && e.kod === 'GERI_CEKILME')) return DURMA_TURU.GERI_CEKILME;
  const s = hataSinifi(e);
  if (s === 'HIZ') return DURMA_TURU.GERI_CEKILME;
  if (s === 'RED') return DURMA_TURU.ELLE;
  return DURMA_TURU.BELIRSIZ;
}

/**
 * Hata nesnesine KENDİ cevabının başlıklarını iliştirir (e.yanitBasliklari). ccxt `last_response_headers`
 * istemci başına TEK alandır: paralel isteklerde (mutabakat Promise.all) 429'un Retry-After'ı başka bir
 * cevabın başlıklarıyla ezilir (F2, D18 — önce kırmızı görüldü: 30 sn yerine 1 sn). handleRestResponse
 * başlıkları cevap başına okur; ret aynı zincirde yakalanıp hataya eklenir.
 */
function basliklariYakala(b) {
  if (!b || typeof b.handleRestResponse !== 'function' || typeof b.getResponseHeaders !== 'function' || b.__agBaslikYakala) return;
  const asil = b.handleRestResponse;
  b.handleRestResponse = function (response, ...ek) {
    let h = null;
    try { h = b.getResponseHeaders(response); } catch { h = null; }
    const r = asil.call(this, response, ...ek);
    if (!r || typeof r.then !== 'function') return r;
    return r.catch((e) => {
      if (e && typeof e === 'object' && h && !e.yanitBasliklari) { try { e.yanitBasliklari = h; } catch { /* donmuş nesne */ } }
      throw e;
    });
  };
  b.__agBaslikYakala = true;
}

function hataSinifi(e) {
  if (!e || e instanceof GeriCekilmeHatasi) return 'BELIRSIZ';
  if (e instanceof ccxt.OrderNotFound) return 'BULUNAMADI';
  if (hizHatasiMi(e)) return 'HIZ';
  if (e instanceof ccxt.InvalidNonce || SAAT_KODU.test(String(e.message || ''))) return 'SAAT';
  if (KESIN_RED.some(S => S && e instanceof S)) return 'RED';
  return 'BELIRSIZ';
}

/** Emir cevabı kullanılabilir mi: id + bilinen durum + (varsa) aynı clientOrderId. 200 {} burada elenir. */
function gecerliEmir(o, id) {
  return !!o && typeof o === 'object' && !Array.isArray(o) && o.id != null && o.id !== ''
    && ccxtDurum(o) !== 'BILINMIYOR' && (o.clientOrderId == null || id == null || o.clientOrderId === id);
}
const kisaGovde = (o) => { try { return JSON.stringify(o === undefined ? null : o).slice(0, 80); } catch { return String(o); } };

function ccxtDurum(o) {
  const s = o && o.status;
  const dolan = +(o && o.filled) || 0;
  if (s === 'closed') return 'DOLDU';
  if (s === 'canceled' || s === 'cancelled' || s === 'expired') return dolan > 0 ? 'IPTAL' : 'IPTAL';
  if (s === 'rejected') return 'RED';
  if (s === 'open') return dolan > 0 ? 'KISMI' : 'ACIK';
  return 'BILINMIYOR';
}

/**
 * PİYASA EMRİ DİLİMLERİ (PLAN-TEST M1 hata adayı 4): piyasa emri miktar sınırını (MARKET_LOT_SIZE maxQty =
 * ccxt `limits.market.max`) aşan miktarı en az sayıda, eşit büyüklükte (adım katı) dilime böler; her dilim ≤ sınır.
 * Adım tamsayısıyla hesaplanır (K adım, M = sınırdaki adım sayısı, n = ⌈K / M⌉): dilimler q ya da q + 1 adım, toplam = miktar.
 * @returns {number[] | null}  sınır yoksa/aşılmıyorsa [miktar]; sınır bir adımdan küçükse null
 */
/** Tek emrin en çok bölüneceği dilim sayısı (ayar.maxDilim ile değişir). */
const MAX_DILIM = 10;

function piyasaDilimleri(miktar, maxQ, adim) {
  if (!(maxQ > 0) || !(miktar > maxQ)) return [miktar];
  if (adim > 0) {
    const K = Math.round(miktar / adim), M = Math.floor(maxQ / adim + 1e-9);
    if (M < 1) return null;
    const n = Math.ceil(K / M), q = Math.floor(K / n), r = K - n * q, d = ondalik(adim);
    return Array.from({ length: n }, (_, i) => +((i < r ? q + 1 : q) * adim).toFixed(d));
  }
  const n = Math.ceil(miktar / maxQ);
  return Array.from({ length: n }, () => miktar / n);
}

/**
 * Dilimli emrin toplu durumu (dilim kayıtlarından — defter ya da sorgu): belirsiz dilim varsa BILINMIYOR; açık
 * dilim varsa ACIK/KISMI; hepsi son durumda ve tüm dilimler gönderilip dolduysa DOLDU; kalan gönderilmediyse
 * (bir dilim RED/IPTAL) dolan kısım varsa IPTAL (kısmi — dolan işlenir), yoksa RED.
 * @returns {{ durum, dolan, ortFiyat }}
 */
function dilimOzeti(kayitlar, toplamDilim) {
  const l = kayitlar.filter(Boolean);
  const dolan = +l.reduce((a, k) => a + (+k.dolan || 0), 0).toFixed(12);
  const deger = l.reduce((a, k) => a + (+k.dolan || 0) * (+k.ortFiyat || 0), 0);
  const ortFiyat = dolan > 0 && l.every(k => !(+k.dolan > 0) || +k.ortFiyat > 0) ? deger / dolan : null;
  let durum;
  if (l.some(k => k.durum === 'BILINMIYOR' || k.durum === 'GONDERILIYOR')) durum = 'BILINMIYOR';
  else if (l.some(k => k.durum === 'ACIK' || k.durum === 'KISMI')) durum = dolan > 0 ? 'KISMI' : 'ACIK';
  else if (l.length === toplamDilim && l.every(k => k.durum === 'DOLDU')) durum = 'DOLDU';
  else durum = dolan > 0 ? 'IPTAL' : 'RED';
  return { durum, dolan, ortFiyat };
}

class CanliYurutucu {
  /**
   * @param {object} ayar
   *   dizin              defter dizini (null → yalnız bellek)
   *   maxEmirNominal     USDT, emir başına
   *   maxPozisyonNominal USDT, sembol başına
   *   kaydet(seviye, metin) günlük çıkışı
   *   ccxtSinifi         testte sahte borsa sınıfı
   */
  constructor(ayar = {}) {
    this.ayar = {
      maxEmirNominal: 200, maxPozisyonNominal: 500,
      saatOlcumAraligiMs: 3600e3,        // saat farkı en geç bu aralıkla yeniden ölçülür
      satirIciBeklemeMaxMs: 15000,       // 429 sonrası bu süreye kadar beklenip hemen sorgulanır; uzunsa DURDURULDU
      hizTabanMs: 1000, hizTavanMs: 300e3,       // Retry-After yoksa 429: 1 s, 2 s, 4 s … ≤ 5 dk
      banTabanMs: 120e3, banTavanMs: 3600e3,     // Retry-After yoksa 418: 2 dk, 4 dk … ≤ 1 sa
      hizUnutmaMs: 15 * 60e3,            // bu kadar hız hatası olmazsa üstel sayaç sıfırlanır
      bulunamadiTekrarMs: [500, 2000],   // belirsiz gönderimden sonra "emir yok" → bu aralıklarla yeniden sor
      // M4-1: bundan genç emir için 'emir yok' (OrderNotFound) KESİN değil → RED yazılmaz, emir belirsiz kalır, mutabakat yeniden sorar
      tazeBulunamadiMs: 5 * 60e3,
      otomatikCikisAraligiMs: 5 * 60e3,  // BELIRSIZ durdurmada otomatik mutabakat en sık bu aralıkla (GERI_CEKILME: süre biter bitmez)
      // 69.3 EMİR FRENİ (RTS 6 Md. 15 / SEC 15c3-5 karşılığı): risk artıran emirlerin TOPLAMI zaman pencereli sınırlanır.
      // Günde bir karar veren bot için geniş — yalnız kaçak döngüyü (Knight 2012, Everbright 2013) yakalar. Azaltan emir sayılmaz.
      frenEmir24: 600, frenEmir10dk: 150, frenNominal24Kat: 20,   // nominal: 24 saatte toplam ≤ kat × (maxEmirNominal / 3 = sermaye tavanı)
      ...ayar,
    };
    this.simdi = typeof ayar.simdi === 'function' ? ayar.simdi : Date.now;
    // +20 ms: zamanlayıcı erken uyanırsa geri çekilme kapısı hâlâ kapalı görünmesin.
    this.uyu = typeof ayar.uyu === 'function' ? ayar.uyu : (ms) => new Promise(r => setTimeout(r, ms + 20));
    this.geriCekilme = { bitis: 0, ban: false, kesin: false, ardisik: 0, sonHiz: null, sebep: null, dalgaSonIstek: null };
    // Veri (prod) istemcisinin AYRI geri çekilmesi (denetim F1+F2): demo'da mum/hacim prod'dan gelir; prod'un 429/418'i
    // demo işlem hesabının kapısını (emir, acil durdurma, felaket stopu) KAPATMAZ — yalnız prod'a veri isteğini bekletir.
    this.veriGeriCekilme = { bitis: 0, ban: false, sebep: null };
    this._istekSayac = 0;            // kapıdan geçen her istek bir numara alır (paralel 429 dalgası tespiti)
    this._sonOtoCikis = null;        // son otomatik mutabakat denemesi (simdi)
    this.saatOlcum = { son: null, fark: null, hata: null };
    this._acil = false;
    this.defter = new Defter(ayar.dizin === undefined ? null : ayar.dizin);
    this.borsa = null;
    this.ortam = null;
    this.durum = 'BAGLI_DEGIL';     // BAGLI_DEGIL · AKTIF · DURDURULDU
    this.durmaSebebi = null;
    this.durmaTuru = null;          // DURMA_TURU (DURDURULDU iken)
    this._kilitBellek = false;      // oturum içi kilit (kalıcı onay yokken; acil kapatma)
    this.onayDosya = ayar.dizin ? path.join(ayar.dizin, 'canli-onay.json') : null;
    this.izinler = null;
    this.pozisyonModu = null;       // 'oneway' | 'hedge'
    this.sonMutabakat = null;
    this.kaydet = ayar.kaydet || (() => {});
    // M4-2: emir defterinde yarım (okunamayan) satır — atlandı; sayaç güvenlik payıyla ileri alındı (kimlik tekrarı yok).
    if (this.defter.bozukSatirlar.length) {
      this.kaydet('WARN', `Emir defterinde ${this.defter.bozukSatirlar.length} okunamayan (yarım yazılmış) satır atlandı — sayaç ${this.defter.sayac}'ten devam; ilk: ${this.defter.bozukSatirlar[0].slice(0, 60)}`);
    }
    // 69.3 emir freni: tetiklenince diske yazılır; mutabakat KALDIRMAZ — yalnız frenKaldir() (bot "Engeli kaldır").
    this.frenDosya = ayar.dizin ? path.join(ayar.dizin, 'emir-freni.json') : null;
    this.fren = null;
    if (this.frenDosya) {
      const k = kalici.oku(this.frenDosya);
      if (k.veri && k.veri.fren) this.fren = k.veri.fren;
      // 69.6: bozuk fren dosyası güvenli yönde okunur — fren AÇIK (elle kaldırılır), sessizce kalkmaz.
      if (k.bozuk && !this.fren) this.fren = { zaman: this.simdi(), sebep: `emir freni dosyası bozuk (${k.bozuk}) — güvenli tarafta fren açık`, sayim: null };
    }
    this.frenBildir = null;          // bot bağlar: (metin) → ENGEL + alarm
    // 69.5 AZALTMA: bot güvenli kipteyken yalnız azaltan emir geçer (dakikalık DCA senkronu da yeni risk açamaz).
    // Diske yazılmaz: bot açılışta kendi durum.guvenliKip kaydından geri koyar. Reddin günlük satırı saatte bir.
    this.azaltma = null;
    this._azaltmaGunluk = new Map();
  }

  /** Son pencere içindeki risk artıran (azaltmayan) emirler — RED'ler sayılmaz (borsaya girmedi). */
  _frenSayim(simdi = this.simdi()) {
    let n24 = 0, n10 = 0, nominal24 = 0;
    for (const e of this.defter.emirler.values()) {
      if (e.reduceOnly || e.durum === 'RED' || !Number.isFinite(e.olusturma)) continue;
      const yas = simdi - e.olusturma;
      if (yas < 0 || yas > 864e5) continue;
      n24++;
      if (yas <= 600e3) n10++;
      const p = +(e.price != null ? e.price : e.refMark);
      // 73.8: dolmadan iptal edilen emrin nominale sayılması (Y-14) bilinçli olarak DEĞİŞMEDİ — emir kapısını gevşetmek kullanıcı kararı bekliyor.
      if (Number.isFinite(p) && p > 0) nominal24 += Math.abs(+e.amount || 0) * p;
    }
    return { n24, n10, nominal24 };
  }

  /** 73.8 (Y-14, salt okuma): emir freni dökümü — son 24 sa risk artıran emirler sembol / bot başına + son 10 emir (panel "Neyi saydı?"). */
  frenDokumu(simdi = this.simdi()) {
    const grup = new Map(), son = [];
    for (const e of this.defter.emirler.values()) {
      if (e.reduceOnly || e.durum === 'RED' || !Number.isFinite(e.olusturma)) continue;
      const yas = simdi - e.olusturma;
      if (yas < 0 || yas > 864e5) continue;
      const k = `${e.symbol}|${e.bot || '?'}`;
      const g = grup.get(k) || { symbol: e.symbol, bot: e.bot || '?', n24: 0, n10: 0, nominal: 0, iptal: 0 };
      const p = +(e.price != null ? e.price : e.refMark);
      const miktar = Math.abs(+e.amount || 0);   // fren kapısıyla aynı sayım (iptal edilenler de); ayrıca iptal sayısı gösterilir
      g.n24++; if (yas <= 600e3) g.n10++; if (e.durum === 'IPTAL') g.iptal++;
      if (Number.isFinite(p) && p > 0) g.nominal += miktar * p;
      grup.set(k, g);
      son.push({ id: e.id, symbol: e.symbol, bot: e.bot || '?', side: e.side, amount: +e.amount || 0, dolan: +e.dolan || 0, durum: e.durum, olusturma: e.olusturma });
    }
    son.sort((a, b) => b.olusturma - a.olusturma);
    return { sayim: this._frenSayim(simdi), fren: this.fren, sinir: { emir10dk: this.ayar.frenEmir10dk, emir24: this.ayar.frenEmir24, nominal24: (this.ayar.maxEmirNominal / 3) * this.ayar.frenNominal24Kat },
      gruplar: [...grup.values()].sort((a, b) => b.n24 - a.n24), son: son.slice(0, 10) };
  }

  /** @returns engel metni | null. Sınırı aşacak emirde fren tetiklenir (kalıcı). */
  _frenKapisi(e, nominal) {
    // Kâğıt borsa (sanal para, sanal saat — simülasyon testleri günleri dakikalara sıkıştırır) muaf; demo ve gerçek hesapta çalışır.
    // 69.6: muafiyet yalnız kâğıt bağlantısında (ortam 'kagit' VE kâğıt nesnesi) — tek bir nesne bayrağına güvenilmez.
    if (e.reduceOnly || this.ayar.fren === false || (this.ortam === 'kagit' && this.borsa && this.borsa.kagit === true)) return null;
    if (this.fren) return `EMİR FRENİ: ${this.fren.sebep} — elle kaldırılmalı`;
    const a = this.ayar, c = this._frenSayim();
    const tavan = (a.maxEmirNominal / 3) * a.frenNominal24Kat;
    let sebep = null;
    if (c.n10 + 1 > a.frenEmir10dk) sebep = `10 dakikada ${c.n10 + 1} risk artıran emir (sınır ${a.frenEmir10dk})`;
    else if (c.n24 + 1 > a.frenEmir24) sebep = `24 saatte ${c.n24 + 1} risk artıran emir (sınır ${a.frenEmir24})`;
    else if (nominal != null && c.nominal24 + nominal > tavan) sebep = `24 saatte toplam ${(c.nominal24 + nominal).toFixed(0)} USDT risk artıran emir (sınır ${tavan.toFixed(0)} = ${a.frenNominal24Kat} × sermaye tavanı)`;
    if (!sebep) return null;
    this.fren = { zaman: this.simdi(), sebep, sayim: c };
    if (this.frenDosya) { try { kalici.yaz(this.frenDosya, { fren: this.fren }); } catch (err) { this.kaydet('ERROR', `emir freni yazılamadı: ${err.message}`); } }
    this.kaydet('ERROR', `EMİR FRENİ tetiklendi: ${sebep} — risk artıran emir verilmeyecek (azaltan emir ve stoplar serbest)`);
    if (typeof this.frenBildir === 'function') { try { this.frenBildir(sebep, c); } catch { /* bildirim akışı durdurmaz */ } }
    return `EMİR FRENİ: ${sebep}`;
  }

  /** 69.5 AZALTMA kipini açar (bot güvenli kip). */
  azaltmaKoy(sebep) { this.azaltma = { sebep: String(sebep || 'güvenli kip').slice(0, 200), zaman: this.simdi() }; }
  /** 69.5 AZALTMA kipini kapatır. @returns eski | null */
  azaltmaKaldir() { const eski = this.azaltma; this.azaltma = null; this._azaltmaGunluk.clear(); return eski; }

  /** Freni kaldırır (bot "Engeli kaldır"). @returns eski fren | null */
  frenKaldir() {
    const eski = this.fren;
    if (!eski) return null;
    this.fren = null;
    if (this.frenDosya) { try { kalici.yaz(this.frenDosya, { fren: null, kaldirildi: this.simdi(), eski }); } catch { /* */ } }
    this.kaydet('WARN', `Emir freni elle kaldırıldı (${eski.sebep})`);
    return eski;
  }

  // ── Bağlantı ────────────────────────────────────────────────────────────

  /**
   * @param veri (isteğe bağlı) anahtarsız prod ccxt istemcisi — günlük mum/evren verisi buradan
   *             okunur, emirler `ortam` hesabına gider (`istemci.veriAyir`; Hücum/Denge demo).
   */
  async baglan({ ortam, apiKey, apiSecret, veri = null }) {
    this.kilitAcik = false;
    const b = istemci.veriAyir(istemci.kur({ ortam, apiKey, apiSecret, ccxtSinifi: this.ayar.ccxtSinifi }), veri);
    basliklariYakala(b);
    if (veri) basliklariYakala(veri);    // prod veri istemcisi (fetchOHLCV/fetchTickers) de kapıdan geçer — kendi Retry-After'ı
    await b.loadMarkets();
    // ccxt `adjustForTimeDifference` ile loadMarkets saat farkını ölçtü; sonraki ölçüm saatOlcumAraligiMs sonra.
    this.saatOlcum = { son: this.simdi(), fark: b.options && b.options.timeDifference != null ? b.options.timeDifference : null, hata: null };

    // Para çekme izni açık anahtarla CANLIYA bağlanılmaz.
    if (ortam === 'live') {
      let iz;
      try { iz = await istemci.anahtarIzinleri(b); } catch (e) {
        throw new Error(`API anahtarı izinleri okunamadı (${e.message}) — canlıya bağlanılmadı`);
      }
      if (iz.enableWithdrawals) throw new Error('API anahtarında PARA ÇEKME izni açık — Binance API Management\'tan kapatın; bağlanılmadı');
      if (!iz.enableFutures) throw new Error('API anahtarında Futures izni kapalı');
      // 69.6 (kullanıcı kararı): canlıda BÜTÜN botlarda IP kısıtı zorunlu — çalınan anahtar başka yerden kullanılamasın.
      if (!iz.ipRestrict) throw new Error('API anahtarında IP kısıtı yok — Binance API Management\'ta "Restrict access to trusted IPs only" açın (yalnız sunucunun IP\'si); canlıya bağlanılmadı');
      // Çoklu varlık (BTC spot teminat — lib/live/cokluVarlik.js) için ek izinler ZORUNLU (PLAN-GERCEK-PARA-2027.md §4).
      if (this.ayar.cokluVarlik) {
        if (!iz.enableSpotAndMarginTrading) throw new Error('çoklu varlık: API anahtarında "Enable Spot & Margin Trading" kapalı (spot BTC alım/satımı gerekir); bağlanılmadı');
        if (!iz.permitsUniversalTransfer) throw new Error('çoklu varlık: API anahtarında "Permits Universal Transfer" kapalı (spot ↔ USDⓈ-M aktarımı gerekir); bağlanılmadı');
      }
      this.izinler = iz;
    } else {
      this.izinler = null;
    }

    const mod = await b.fetchPositionMode(undefined).catch(() => null);
    this.pozisyonModu = mod && mod.hedged ? 'hedge' : 'oneway';

    this.borsa = b;
    this.veri = veri;          // prod genel veri istemcisi (varsa) — filtre karşılaştırması için
    this.ortam = ortam;
    this.durum = 'DURDURULDU';
    this.durmaSebebi = 'açılış mutabakatı bekleniyor';
    this.durmaTuru = DURMA_TURU.ACILIS;
    this.kaydet('INFO', `Binance ${ortam} bağlandı · pozisyon modu ${this.pozisyonModu}`);
    await this.mutabakat();
    return this.ozet();
  }

  /**
   * KÂĞIT BORSAYA BAĞLAN (`lib/live/kagitBorsa.js`) — anahtar yok, gerçek emir
   * yok. Ortam `kagit`: canlı kilidi gerekmez, tavanlar ve mutabakat aynen
   * işler (kâğıt koşu canlının provasıdır). Gerçek bir ccxt istemcisi bu yoldan
   * BAĞLANAMAZ — nesne `kagit: true` işaretini taşımalı.
   */
  async baglanKagit(borsa) {
    if (!borsa || borsa.kagit !== true) throw new Error('baglanKagit yalnız kâğıt borsa nesnesi kabul eder');
    this.kilitAcik = false;
    if (!borsa.markets || !Object.keys(borsa.markets).length) await borsa.loadMarkets();
    const mod = await borsa.fetchPositionMode(undefined).catch(() => null);
    this.pozisyonModu = mod && mod.hedged ? 'hedge' : 'oneway';
    this.izinler = null;
    this.borsa = borsa;
    this.ortam = 'kagit';
    this.durum = 'DURDURULDU';
    this.durmaSebebi = 'açılış mutabakatı bekleniyor';
    this.durmaTuru = DURMA_TURU.ACILIS;
    this.kaydet('INFO', `Kâğıt borsa bağlandı · pozisyon modu ${this.pozisyonModu}`);
    await this.mutabakat();
    return this.ozet();
  }

  baglantiyiKes() {
    this.borsa = null;
    this.ortam = null;
    this.durum = 'BAGLI_DEGIL';
    this.kilitAcik = false;
    this.kaydet('INFO', 'Binance bağlantısı kapatıldı');
  }

  /** Kilit açık mı: oturum içi kilit YA DA geçerli kalıcı onay (yalnız live). */
  get kilitAcik() { return this._kilitBellek || this.kaliciOnay() != null; }
  set kilitAcik(v) { this._kilitBellek = !!v; }

  /** Geçerli kalıcı onay ya da null. Onaydaki tavanlardan büyük tavanla çalışılıyorsa geçersiz (yeniden onay). */
  kaliciOnay() {
    if (this.ortam !== 'live' || !this.onayDosya) return null;
    // Bozuk/okunamayan onay = onay YOK (kapalı-başarısız; sık okunur, .bak üretmez).
    let veri = null;
    try { veri = JSON.parse(fs.readFileSync(this.onayDosya, 'utf8')); } catch { return null; }
    if (!veri || veri.acik !== true || veri.ortam !== 'live') return null;
    if (!(this.ayar.maxEmirNominal <= +veri.maxEmirNominal) || !(this.ayar.maxPozisyonNominal <= +veri.maxPozisyonNominal)) return null;
    return veri;
  }

  _onayKaldir(sebep) {
    if (!this.onayDosya || !fs.existsSync(this.onayDosya)) return;
    try {
      kalici.yaz(this.onayDosya, { acik: false, kaldirildi: new Date(this.simdi()).toISOString(), sebep });
      this.kaydet('WARN', `Canlı emir onayı KALDIRILDI: ${sebep} — yeniden "CANLI" onayı gerekir`);
    } catch (e) { this.kaydet('ERROR', `Canlı emir onayı kaldırılamadı (${e.message}) — dosyayı elle silin: ${this.onayDosya}`); }
  }

  kilitAc(onayMetni) {
    if (this.ortam !== 'live') throw new Error('kilit yalnız canlı ortamda anlamlı');
    if (onayMetni !== 'CANLI') throw new Error('onay metni "CANLI" olmalı');
    if (this.durum !== 'AKTIF') throw new Error(`durum ${this.durum} — önce mutabakat temiz olmalı`);
    this._kilitBellek = true;
    if (this.onayDosya) {
      kalici.yaz(this.onayDosya, { acik: true, ortam: 'live', zaman: new Date(this.simdi()).toISOString(),
        maxEmirNominal: this.ayar.maxEmirNominal, maxPozisyonNominal: this.ayar.maxPozisyonNominal });
    }
    this.kaydet('WARN', `⚠ CANLI EMİR KİLİDİ AÇILDI — gerçek para (kalıcı onay; tavan emir ${this.ayar.maxEmirNominal} / sembol ${this.ayar.maxPozisyonNominal} USDT)`);
  }

  kilitKapat() { this._kilitBellek = false; this._onayKaldir('kilit elle kapatıldı'); this.kaydet('INFO', 'Canlı emir kilidi kapatıldı'); }

  _baglantiGerekli() { if (!this.borsa) throw new Error('borsaya bağlı değil'); }

  /**
   * @param tur DURMA_TURU (varsayılan ELLE — bilinmeyen sebep otomatik kalkmaz)
   * @param yeniden true → tam mutabakat/acil sonucu: tür baştan belirlenir. false → ELLE durdurma otomatik türe İNMEZ.
   */
  _durdur(sebep, tur = DURMA_TURU.ELLE, yeniden = false) {
    if (!yeniden && this.durum === 'DURDURULDU' && this.durmaTuru === DURMA_TURU.ELLE && tur !== DURMA_TURU.ELLE) {
      this.durmaSebebi = `${this.durmaSebebi} · ardından: ${sebep}`;
      this.kilitAcik = false;
      this.kaydet('ERROR', `Canlı yürütücü DURDURULDU (elle müdahale bekliyor): ${sebep}`);
      return;
    }
    this.durum = 'DURDURULDU';
    this.durmaSebebi = sebep;
    this.durmaTuru = tur;
    this.kilitAcik = false;
    if (tur === DURMA_TURU.ELLE) this._onayKaldir(sebep);   // K1: geri çekilme/belirsizlik onayı KALDIRMAZ
    this.kaydet('ERROR', `Canlı yürütücü DURDURULDU [${tur}]: ${sebep}`);
  }

  /** Geri çekilme (418/429) süresi dolmadı mı — koruma/marj/hesap işlemleri bu sürede hiç denemez. */
  geriCekilmede() { return this.geriCekilme.bitis > this.simdi(); }

  /**
   * DURDURULDU'DAN OTOMATİK ÇIKIŞ (F2): tür GERI_CEKILME ya da BELIRSIZ ise ve geri çekilme bittiyse tam
   * mutabakat; temizse AKTIF. GERI_CEKILME'de süre biter bitmez ilk deneme, sonra (ve BELIRSIZ'de) en sık
   * `otomatikCikisAraligiMs`. ELLE/ACILIS → null (hiç istek yok). Botların _tik'i çağırır.
   * @returns null (denenmedi) | { onceki: { tur, sebep }, durum, tur, sebep, mutabakat }
   */
  async otomatikCikis() {
    if (!this.borsa || this.durum !== 'DURDURULDU' || !OTOMATIK_CIKIS.has(this.durmaTuru)) return null;
    if (this.geriCekilmede()) return null;
    const simdi = this.simdi();
    const banSonrasi = this._sonOtoCikis == null || this._sonOtoCikis < this.geriCekilme.bitis;
    if (!banSonrasi && simdi - this._sonOtoCikis < this.ayar.otomatikCikisAraligiMs) return null;
    this._sonOtoCikis = simdi;
    const onceki = { tur: this.durmaTuru, sebep: this.durmaSebebi };
    this.kaydet('INFO', `Otomatik mutabakat (DURDURULDU [${onceki.tur}]: ${onceki.sebep})`);
    const m = await this.mutabakat();
    if (this.durum === 'AKTIF') this.kaydet('SUCCESS', `Yürütücü otomatik mutabakatla AKTIF (önceki: ${onceki.sebep})`);
    return { onceki, durum: this.durum, tur: this.durmaTuru, sebep: this.durmaSebebi, mutabakat: m };
  }

  /**
   * Geri çekilme kapısından geçen borsa görünümü: `fetch*` / `create*` / `cancel*` / `edit*` çağrıları
   * `_istek`ten geçer (geri çekilmede istek ATILMAZ → GeriCekilmeHatasi; 429/418 geri çekilmeyi başlatır;
   * -1021 okumada ölçülüp bir kez yeniden denenir). Diğer alanlar (markets, priceToPrecision, kagit …) aynen.
   * Felaket stopu, marj denetimi, hesap işlemleri ve bot okumaları bunu kullanır (F2).
   */
  kapiliBorsa() {
    const b = this.borsa;
    if (!b) return null;
    if (this._kapili && this._kapiliKaynak === b) return this._kapili;
    const y = this;
    const ISTEK = /^(fetch|create|cancel|edit)[A-Z]/;
    this._kapiliKaynak = b;
    this._kapili = new Proxy(b, {
      get(h, ad) {
        const v = h[ad];
        if (typeof v !== 'function') return v;
        if (typeof ad === 'string' && ISTEK.test(ad)) {
          // Veri ayrımı (istemci.veriAyir): fetchOHLCV/fetchTickers PROD'a gider → kendi kapısı (işlem kapısı değil).
          if (h.__veri && istemci.VERI_METOTLARI && istemci.VERI_METOTLARI.has(ad)) return (...a) => y._veriIstek(() => v.apply(h, a));
          return (...a) => y._istek(() => v.apply(h, a), ad.startsWith('fetch'));
        }
        return v.bind(h);
      },
      set(h, ad, deger) { h[ad] = deger; return true; },
    });
    return this._kapili;
  }

  /**
   * Veri (prod) isteği kapısı (denetim F1+F2): prod 418/429 → yalnız prod'a veri isteği bekletilir (Retry-After /
   * "banned until", yoksa taban süre); demo işlem kapısı (geriCekilme) DEĞİŞMEZ — farklı sunucunun ban'ı demo'nun acil
   * çıkışını, emirlerini ve felaket stopunu durdurmamalı. Bekleme sırasında hata kod 'VERI_GERI_CEKILME' (GERI_CEKILME değil).
   */
  async _veriIstek(fn) {
    const g = this.veriGeriCekilme, simdi = this.simdi();
    if (g.bitis > simdi) {
      const e = new Error(`veri borsası (prod) geri çekilmesi sürüyor (${g.ban ? '418 IP ban' : 'hız sınırı'}, ${Math.ceil((g.bitis - simdi) / 1000)} sn kaldı): ${g.sebep || ''}`);
      e.kod = 'VERI_GERI_CEKILME';
      throw e;
    }
    try { return await fn(); } catch (e) {
      if (hataSinifi(e) === 'HIZ') {
        const msj = String((e && e.message) || '');
        const ban = /\b418\b/.test(msj) || /banned until/i.test(msj);
        let ms = null;
        const h = e && e.yanitBasliklari;
        const ra = h ? (h['Retry-After'] ?? h['retry-after']) : undefined;
        if (ra != null && String(ra).trim() !== '' && Number.isFinite(+ra) && +ra >= 0) ms = +ra * 1000;
        const bu = /banned until (\d{12,})/i.exec(msj);
        if (bu) { const kalan = +bu[1] - simdi; if (kalan > 0) ms = Math.max(ms || 0, kalan); }
        if (ms == null) ms = ban ? this.ayar.banTabanMs : this.ayar.hizTabanMs;
        g.bitis = Math.max(g.bitis, simdi + ms); g.ban = ban; g.sebep = msj.slice(0, 160);
        this.kaydet('WARN', `Veri borsası (prod) ${ban ? '418 IP BAN' : 'hız sınırı'}: ${Math.ceil(ms / 1000)} sn veri isteği yok — işlem hesabının kapısı etkilenmez`);
      }
      throw e;
    }
  }

  /** Acil durdurma kapsamı: 429 geri çekilmesinde istekler muaf (kesin 418 ban'da yine istek yok). */
  async acilIstekleri(fn) {
    const o = this._acil;
    this._acil = true;
    try { return await fn(); } finally { this._acil = o; }
  }

  // ── Geri çekilme (418/429) ve saat farkı (-1021) ────────────────────────

  /**
   * Geri çekilme sürüyorsa engel metni, yoksa null. 429'da acil durdurma muaf. 418 ban'da süre SUNUCUDAN
   * geldiyse (Retry-After / "banned until" → g.kesin) hiçbir istek yok; süre yalnız TAHMİNSE (üstel, en çok
   * 1 sa) acil durdurma yine dener — ban çoktan bitmiş olabilir, acil çıkış tahmine kurban edilmez (denetim 2026-10-07).
   */
  _hizKapisi() {
    const g = this.geriCekilme;
    const kalan = g.bitis - this.simdi();
    if (kalan <= 0) return null;
    if (this._acil && (!g.ban || !g.kesin)) return null;
    return `geri çekilme sürüyor (${g.ban ? '418 IP ban' : 'hız sınırı'}, ${Math.ceil(kalan / 1000)} sn kaldı): ${g.sebep || ''}`;
  }

  /**
   * Borsaya giden her istek buradan geçer: geri çekilmede istek ATILMAZ (GeriCekilmeHatasi);
   * hız hatası geri çekilmeyi başlatır. Saat hatası (-1021) → saat farkı hemen yeniden ölçülür;
   * `tekrarlanabilir` (okuma) istek bir kez yeniden atılır. Emir/iptal (tekrarlanabilir=false)
   * otomatik yeniden atılmaz — emir için `_saatKaymasi` önce sorgular.
   */
  async _istek(fn, tekrarlanabilir = true) {
    for (let deneme = 0; ; deneme++) {
      const engel = this._hizKapisi();
      if (engel) throw new GeriCekilmeHatasi(engel);
      const no = ++this._istekSayac;
      try { return await fn(); } catch (e) {
        const s = hataSinifi(e);
        if (s === 'HIZ') this._geriCekil(e, no);
        else if (s === 'SAAT') {
          this.saatOlcum.son = null;
          if (tekrarlanabilir && deneme === 0) {
            await this._saatTazele(true);
            if (this.saatOlcum.hata == null) continue;
          }
        }
        throw e;
      }
    }
  }

  /** Kollar (DCA mutabakatı) için aynı kapı: geri çekilmede istek atılmaz, hız/saat hataları işlenir. */
  borsaIstegi(fn, tekrarlanabilir = true) { return this._istek(fn, tekrarlanabilir); }

  /**
   * Geri çekilme süresi: Retry-After (sn) varsa ona, "banned until" varsa ona, yoksa üstel. @returns ms
   * Retry-After hatanın KENDİ cevabından (e.yanitBasliklari, `basliklariYakala`); yoksa last_response_headers.
   * DALGA (F2): önceki hız hatası işlendiğinde zaten YOLDA olan istek (istekNo ≤ dalgaSonIstek) aynı
   * dalgadır — aynı anda gelen üç 429 üstel sayacı üç kez değil BİR kez ilerletir; süre yalnız uzayabilir.
   */
  _geriCekil(e, istekNo = null) {
    const g = this.geriCekilme, simdi = this.simdi();
    const msj = String((e && e.message) || '');
    const ban = /\b418\b/.test(msj) || /banned until/i.test(msj);
    if (g.sonHiz == null || simdi - g.sonHiz > this.ayar.hizUnutmaMs) { g.ardisik = 0; g.dalgaSonIstek = null; }
    const ayniDalga = istekNo != null && g.dalgaSonIstek != null && istekNo <= g.dalgaSonIstek && g.ardisik > 0;
    let ms = null;
    const h = (e && e.yanitBasliklari) || (this.borsa && this.borsa.last_response_headers);
    const ra = h ? (h['Retry-After'] ?? h['retry-after']) : undefined;
    if (ra != null && String(ra).trim() !== '' && Number.isFinite(+ra) && +ra >= 0) ms = +ra * 1000;
    const bu = /banned until (\d{12,})/i.exec(msj);
    // Yürütücünün saatiyle (this.simdi); Date.now karışırsa sahte saatli testte süre yanlış (denetim 2026-10-07).
    if (bu) { const kalan = +bu[1] - simdi; if (kalan > 0) ms = Math.max(ms || 0, kalan); }
    const kesin = ms != null;                 // süre sunucudan geldi (Retry-After / "banned until")
    if (ms == null) {
      const taban = ban ? this.ayar.banTabanMs : this.ayar.hizTabanMs, tavan = ban ? this.ayar.banTavanMs : this.ayar.hizTavanMs;
      ms = Math.min(taban * 2 ** (ayniDalga ? g.ardisik - 1 : g.ardisik), tavan);
    }
    if (!ayniDalga) g.ardisik++;
    g.dalgaSonIstek = this._istekSayac;      // şu ana dek gönderilmiş her istek bu dalganın parçası
    g.sonHiz = simdi;
    g.ban = ban || (g.ban && simdi < g.bitis);
    if (simdi + ms >= g.bitis) g.kesin = kesin;   // bitişi bu olay belirliyor
    g.bitis = Math.max(g.bitis, simdi + ms);
    g.sebep = msj.slice(0, 160);
    this.kaydet('WARN', `${ban ? '418 IP BAN' : 'Hız sınırı'}: ${Math.ceil(ms / 1000)} sn geri çekilme (ardışık ${g.ardisik}${ayniDalga ? ', aynı dalga' : ''}) — ${g.sebep}`);
    return ms;
  }

  /**
   * Saat farkını yeniden ölçer (ccxt `loadTimeDifference`). Aralık dolmadıysa (zorla değilse) ölçmez.
   * Hata emir akışını durdurmaz; ölçüm zamanı yine işlenir (her istekte yeniden denenmesin).
   */
  async _saatTazele(zorla = false) {
    const b = this.borsa;
    if (!b || typeof b.loadTimeDifference !== 'function') return null;
    const simdi = this.simdi();
    if (!zorla && this.saatOlcum.son != null && simdi - this.saatOlcum.son < this.ayar.saatOlcumAraligiMs) return null;
    if (this._hizKapisi()) return null;
    this.saatOlcum.son = simdi;
    try {
      const f = await this._istek(() => b.loadTimeDifference(), false);
      this.saatOlcum.fark = f ?? null;
      this.saatOlcum.hata = null;
      return f;
    } catch (err) {
      this.saatOlcum.hata = err.message;
      this.kaydet('WARN', `Saat farkı ölçülemedi: ${err.message}`);
      return null;
    }
  }

  /**
   * Emri clientOrderId ile okur. "Yok" cevabında `tekrarli` ise bulunamadiTekrarMs aralıklarıyla
   * yeniden sorar (zaman aşımından hemen sonra emir sorguda henüz görünmeyebilir).
   * @returns {{ o } | { bulunamadi: true, sorgu } | { hata }}
   */
  async _emirOku(id, symbol, tekrarli) {
    const bekle = tekrarli ? (this.ayar.bulunamadiTekrarMs || []) : [];
    for (let i = 0; ; i++) {
      try {
        const o = await this._istek(() => this.borsa.fetchOrder(undefined, symbol, { clientOrderId: id }));
        if (!gecerliEmir(o, id)) return { hata: new ccxt.BadResponse(`fetchOrder geçersiz/boş cevap: ${kisaGovde(o)}`) };
        return { o };
      } catch (err) {
        if (hataSinifi(err) !== 'BULUNAMADI') return { hata: err };
        if (i >= bekle.length) return { bulunamadi: true, sorgu: i + 1 };
        await this.uyu(bekle[i]);
      }
    }
  }

  _emirIsle(id, o) {
    return this.defter.guncelle(id, { durum: ccxtDurum(o), borsaId: o.id, dolan: +o.filled || 0, ortFiyat: o.average || null });
  }

  /**
   * M4-1 (PLAN-TEST Dalga 2): "emir yok" (OrderNotFound) cevabı "gönderilmedi" (RED) sayılabilir mi? Belirsiz gönderimden
   * sonra emir borsada işlenmiş (piyasa emri DOLMUŞ) ama sorguda henüz görünmüyor olabilir — "kısa sürede görünmedi" ≠
   * "gönderilmedi". Kayıt `tazeBulunamadiMs`ten gençse "yok" KESİN DEĞİL: kayıt olduğu gibi kalır, mutabakat yeniden sorar.
   * Yaşlıysa (ya da oluşturma zamanı yoksa) borsanın kimliği tanımaması kesin kabul edilir. Binance dolmuş emri sorguda
   * tutar; sorgulanamayan tek tür "dolumsuz iptal/süresi dolmuş + 3 günden eski" emirdir — RED ile aynı sonuç (dolum yok).
   */
  _yokKesinMi(id) {
    const k = this.defter.al(id);
    return !k || !Number.isFinite(k.olusturma) || this.simdi() - k.olusturma >= this.ayar.tazeBulunamadiMs;
  }

  // ── Mutabakat ───────────────────────────────────────────────────────────

  /**
   * Borsa ile defteri karşılaştırır. Defterdeki açık/bilinmeyen her emir
   * clientOrderId ile sorgulanır. Çözülemeyen varsa DURDURULDU.
   */
  async mutabakat() {
    this._baglantiGerekli();
    const sonuc = { zaman: this.simdi(), cozulen: 0, cozulemeyen: [], yabanciEmir: 0, hata: null };
    let hataTuru = null;
    const cozulemeyenTur = [];
    // Geri çekilmede borsaya HİÇ istek atılmaz (418 ban süresini uzatır); belirsizlik sürer → DURDURULDU.
    let engel = this._hizKapisi();
    if (engel && !this.geriCekilme.ban) {
      // Kısa hız sınırı (≤ satır içi sınır): emirGonder gibi bekle, sonra oku — 1 sn'lik 429 botu durdurmasın
      // (Hücum'da mutabakat günde bir; DURDURULDU gün boyu sürerdi). Denetim 2026-10-07.
      const kalan = this.geriCekilme.bitis - this.simdi();
      if (kalan <= this.ayar.satirIciBeklemeMaxMs) { await this.uyu(kalan); engel = this._hizKapisi(); }
    }
    if (engel) { sonuc.hata = engel; hataTuru = DURMA_TURU.GERI_CEKILME; }
    else try {
      await this._saatTazele();              // periyodik saat farkı (saatOlcumAraligiMs)
      const [bakiye, pozisyonlar, acikEmirler] = await Promise.all([
        this._istek(() => this.borsa.fetchBalance()),
        this._istek(() => this.borsa.fetchPositions()),
        this._istek(() => this.borsa.fetchOpenOrders()),
      ]);
      if (!bakiye || typeof bakiye !== 'object' || !bakiye.total) throw new ccxt.BadResponse(`fetchBalance geçersiz cevap: ${kisaGovde(bakiye)}`);
      if (!Array.isArray(pozisyonlar)) throw new ccxt.BadResponse(`fetchPositions geçersiz cevap: ${kisaGovde(pozisyonlar)}`);
      if (!Array.isArray(acikEmirler)) throw new ccxt.BadResponse(`fetchOpenOrders geçersiz cevap: ${kisaGovde(acikEmirler)}`);
      sonuc.bakiyeUSDT = bakiye.total && bakiye.total.USDT;
      sonuc.pozisyonSay = pozisyonlar.filter(p => Math.abs(+p.contracts || 0) > 0).length;
      sonuc.yabanciEmir = acikEmirler.filter(o => !kimlik.bizimMi(o.clientOrderId)).length;

      const borsadaAcik = new Map(acikEmirler.filter(o => kimlik.bizimMi(o.clientOrderId)).map(o => [o.clientOrderId, o]));
      for (const e of this.defter.acikOlanlar()) {
        let o = borsadaAcik.get(e.id) || null;
        if (!o) {
          // Yeni gönderilmiş belirsiz emir sorguda geç görünebilir → "yok" cevabı yeniden sorulur.
          const taze = !this._yokKesinMi(e.id);
          const r = await this._emirOku(e.id, e.symbol, taze);
          if (r.bulunamadi && taze) {
            // M4-1: genç emir sorguda henüz görünmüyor → gönderilmemiş SAYILMAZ; belirsizlik sürer (BELIRSIZ, otomatik mutabakat).
            sonuc.cozulemeyen.push({ id: e.id, hata: `sorguda henüz görünmüyor (${r.sorgu} sorgu) — gönderilmemiş sayılmadı` });
            cozulemeyenTur.push(GORUNMEDI);
            continue;
          }
          if (r.bulunamadi) {
            // Borsa bu kimliği hiç görmedi (üst süre doldu) → emir gitmemiş.
            this.defter.guncelle(e.id, { durum: 'RED', sebep: `borsada yok (gönderilmemiş; ${r.sorgu} sorgu)` });
            sonuc.cozulen++;
            continue;
          }
          if (r.hata) { sonuc.cozulemeyen.push({ id: e.id, hata: r.hata.message }); cozulemeyenTur.push(durmaTuruSec(r.hata)); continue; }
          o = r.o;
        }
        this.defter.guncelle(e.id, { durum: ccxtDurum(o), dolan: +o.filled || 0, ortFiyat: o.average || null, borsaId: o.id });
        sonuc.cozulen++;
      }
      for (const [id, o] of borsadaAcik) {
        const k = this.defter.al(id);
        if (!k) {
          // Defterde olmayan ama bizim önekli açık emir: başka bir süreç/eski oturum.
          this.defter.guncelle(id, { durum: ccxtDurum(o), symbol: o.symbol, side: o.side, type: o.type,
            amount: o.amount, price: o.price, borsaId: o.id, sebep: 'mutabakatta bulundu' });
        } else if (SON_DURUMLAR.has(k.durum)) {
          // GÜVENLİK AĞI: defter "bitti" (RED/IPTAL/DOLDU) diyor ama emir borsada AÇIK → borsa haklıdır.
          this.defter.guncelle(id, { durum: ccxtDurum(o), dolan: +o.filled || 0, borsaId: o.id, sebep: `mutabakat: defterde ${k.durum} idi, borsada açık` });
          this.kaydet('WARN', `Mutabakat: ${id} defterde ${k.durum} yazılıydı ama borsada AÇIK — düzeltildi`);
          sonuc.duzeltilen = (sonuc.duzeltilen || 0) + 1;
        }
      }
    } catch (err) {
      sonuc.hata = err.message;
      hataTuru = durmaTuruSec(err);
    }

    this.sonMutabakat = sonuc;
    // Tür (F2): okuma geri çekilme/ağ → otomatik çıkış; çözülemeyen emir → ELLE (yalnız geri çekilme yüzünden
    // sorulamadıysa GERI_CEKILME). Tam mutabakat türü baştan belirler (yeniden = true).
    if (sonuc.hata) this._durdur(`mutabakat okunamadı: ${sonuc.hata}`, hataTuru || DURMA_TURU.BELIRSIZ, true);
    else if (sonuc.cozulemeyen.length) {
      const tur = cozulemeyenTur.every(t => t === DURMA_TURU.GERI_CEKILME) ? DURMA_TURU.GERI_CEKILME
        : cozulemeyenTur.every(t => t === DURMA_TURU.GERI_CEKILME || t === GORUNMEDI) ? DURMA_TURU.BELIRSIZ : DURMA_TURU.ELLE;
      this._durdur(`${sonuc.cozulemeyen.length} emrin durumu çözülemedi`, tur, true);
    } else { this.durum = 'AKTIF'; this.durmaSebebi = null; this.durmaTuru = null; }
    sonuc.durmaTuru = this.durum === 'DURDURULDU' ? this.durmaTuru : null;
    return sonuc;
  }

  // ── Hesap ───────────────────────────────────────────────────────────────

  async hesap() {
    this._baglantiGerekli();
    const [bakiye, pozisyonlar, acikEmirler] = await Promise.all([
      this._istek(() => this.borsa.fetchBalance()), this._istek(() => this.borsa.fetchPositions()), this._istek(() => this.borsa.fetchOpenOrders()),
    ]);
    const usdt = (k) => (bakiye[k] && bakiye[k].USDT) ?? null;
    return {
      ortam: this.ortam,
      bakiye: { toplam: usdt('total'), serbest: usdt('free'), kullanilan: usdt('used') },
      pozisyonlar: pozisyonlar.filter(p => Math.abs(+p.contracts || 0) > 0).map(p => ({
        symbol: p.symbol, side: p.side, miktar: +p.contracts, giris: p.entryPrice, mark: p.markPrice,
        likidasyon: p.liquidationPrice, kaldirac: p.leverage, marjModu: p.marginMode,
        gerceklesmemis: p.unrealizedPnl, nominal: p.notional,
      })),
      acikEmirler: acikEmirler.map(o => ({
        id: o.id, clientOrderId: o.clientOrderId, bizim: kimlik.bizimMi(o.clientOrderId),
        symbol: o.symbol, side: o.side, type: o.type, miktar: o.amount, fiyat: o.price,
        dolan: o.filled, durum: o.status, zaman: o.timestamp,
      })),
    };
  }

  async _markFiyati(symbol) {
    try {
      const m = await this._istek(() => this.borsa.fetchMarkPrice(symbol));
      return +(m.markPrice || m.info && m.info.markPrice) || null;
    } catch { return null; }
  }

  async _netPozisyon(symbol) {
    const ps = await this._istek(() => this.borsa.fetchPositions([symbol]));
    if (!Array.isArray(ps)) throw new ccxt.BadResponse(`fetchPositions geçersiz cevap: ${kisaGovde(ps)}`);
    let net = 0;
    for (const p of ps) {
      if (!p || p.symbol !== symbol) continue;
      const q = Math.abs(+p.contracts || 0);
      net += p.side === 'short' ? -q : q;
    }
    return net;
  }

  // ── Emir ────────────────────────────────────────────────────────────────

  /** Göndermeden: düzeltilmiş emir, nominal, hatalar, kapı durumu. */
  async onizle(emir) {
    this._baglantiGerekli();
    const market = this.borsa.markets[emir.symbol];
    const mark = await this._markFiyati(emir.symbol);
    const k = onKontrol(market, emir, { markFiyati: mark });
    const kapi = await this._kapilar(k.emir, k.nominal);
    const ucret = k.nominal != null ? k.nominal * (emir.type === 'limit' ? (market.maker ?? 0.0002) : (market.taker ?? 0.0005)) : null;
    return { ...k, markFiyati: mark, tahminiUcret: ucret, kapi, gecerli: k.gecerli && !kapi.engel };
  }

  async _kapilar(e, nominal) {
    // K1: yalnız-azaltan emir kilitten muaf (risk azaltmak hiçbir zaman engellenmez).
    if (this.ortam === 'live' && !this.kilitAcik && !e.reduceOnly) return { engel: 'canlı emir kilidi kapalı (panelden açılmalı)' };
    const hiz = this._hizKapisi();
    if (hiz) return { engel: hiz };
    if (this.durum !== 'AKTIF' && !e.reduceOnly) return { engel: `durum ${this.durum}: yalnız azaltan emir verilebilir` };
    if (this.azaltma && !e.reduceOnly) return { engel: `AZALTMA (güvenli kip: ${this.azaltma.sebep}): yalnız azaltan emir verilebilir`, azaltma: true };
    // 69.6 (para mantığı Y1): tutar hesaplanamıyorsa (mark yok / 0 / eksi) tavanlar denetlenemez → büyüten emir VERİLMEZ (kapalı-başarısız).
    if (!e.reduceOnly && !(Number.isFinite(nominal) && nominal > 0)) return { engel: 'emir tutarı hesaplanamadı (mark fiyatı yok ya da geçersiz) — tavan denetlenemedi, büyüten emir verilmez' };
    // 69.6 (D1): önce emir tavanı — zaten reddedilecek tek büyük emir freni tetikleyip ENGEL koymasın.
    if (!e.reduceOnly && nominal > this.ayar.maxEmirNominal) {
      return { engel: `emir nominali ${nominal.toFixed(2)} > tavan ${this.ayar.maxEmirNominal} USDT` };
    }
    const fren = this._frenKapisi(e, nominal);
    if (fren) return { engel: fren };
    if (!e.reduceOnly) {
      // Kapalı-başarısız: pozisyon okunamazsa sembol tavanı denetlenemez → büyüten emir verilmez.
      let net;
      try { net = await this._netPozisyon(e.symbol); } catch (err) {
        return { engel: `pozisyon okunamadı (${err.message}) — sembol tavanı denetlenemedi, büyüten emir verilmez` };
      }
      const mark = nominal / e.amount;
      const sonra = Math.abs(net + (e.side === 'buy' ? e.amount : -e.amount)) * mark;
      if (sonra > this.ayar.maxPozisyonNominal && sonra > Math.abs(net) * mark) {
        return { engel: `pozisyon nominali ${sonra.toFixed(2)} > sembol tavanı ${this.ayar.maxPozisyonNominal} USDT` };
      }
    }
    return { engel: null };
  }

  /**
   * Emir gönderir. Sıra: geri çekilme kapısı → ön kontrol → kapılar → deftere yaz → gönder →
   * cevabı sınıfla (`hataSinifi`). Kesin red → RED; belirsiz (ağ, -1000/-1001/-1006/-1007,
   * 5xx, boş/bozuk gövde, beklenmeyen TypeError) → BILINMIYOR + aynı clientOrderId ile sorgu;
   * 418/429 → geri çekilme; -1021 → saat ölçümü + sorgu + aynı kimlikle BİR yeniden deneme.
   * @param emir { symbol, side, type, amount, price?, reduceOnly?, bot? }
   */
  async emirGonder(emir) {
    this._baglantiGerekli();
    const hiz = this._hizKapisi();
    if (hiz) return { basarili: false, sebep: hiz };
    const on = await this.onizle(emir);
    if (!on.gecerli) {
      // Piyasa emri sınırı (-4005) TEK engelse: emir bütün olarak kapılardan geçti (nominal/sembol tavanı) → dilimlere bölünür.
      const plan = this._dilimPlani(emir, on);
      if (plan && plan.dilimler) return this._dilimliGonder(emir, on, plan.dilimler);
      const sebep = on.kapi.engel || [...on.hatalar.map(h => `${h.kod}: ${h.mesaj}`), ...(plan && plan.red ? [plan.red] : [])].join('; ');
      // Denetim K2 (61.7): kapı/ön kontrol reddi eskiden günlüğe hiç yazılmıyordu.
      // 69.5: AZALTMA reddi her dakika tekrar eder (DCA senkronu) → sembol/yön başına saatte bir satır.
      const azAnahtar = on.kapi && on.kapi.azaltma ? `${emir.symbol}:${emir.side}` : null;
      if (azAnahtar && this.simdi() - (this._azaltmaGunluk.get(azAnahtar) || 0) < 3600e3) return { basarili: false, sebep, onizleme: on, azaltma: true };
      if (azAnahtar) this._azaltmaGunluk.set(azAnahtar, this.simdi());
      this.kaydet('WARN', `Emir gönderilmedi (${emir.bot || 'pnl'} ${String(emir.symbol || '').split('/')[0]} ${emir.side}${emir.reduceOnly ? ' azaltan' : ''}): ${sebep}`);
      return { basarili: false, sebep, onizleme: on };
    }
    await this._saatTazele();                // periyodik (saatOlcumAraligiMs dolduysa)
    const e = on.emir;
    const id = kimlik.uret(emir.bot || 'pnl', this.defter.sonrakiSayac());
    const params = { clientOrderId: id };
    if (this.pozisyonModu === 'hedge') {
      // Hedge modda reduceOnly gönderilemez (-1106); yön positionSide ile söylenir.
      params.positionSide = e.reduceOnly ? (e.side === 'sell' ? 'LONG' : 'SHORT') : (e.side === 'buy' ? 'LONG' : 'SHORT');
      params.hedged = true;
    } else if (e.reduceOnly) {
      params.reduceOnly = true;
    }

    this.defter.guncelle(id, { durum: 'GONDERILIYOR', olusturma: this.simdi(), ortam: this.ortam,
      symbol: e.symbol, side: e.side, type: e.type, amount: e.amount, price: e.price ?? null,
      reduceOnly: !!e.reduceOnly, bot: emir.bot || 'pnl', neden: emir.neden || null,
      // PLAN-DEMO-KABUL §8.2 #1 (U4 kayma b): emir anındaki mark (ön kontrolün okuduğu) — yalnız kayıt, karara girmez.
      refMark: Number.isFinite(+on.markFiyati) && +on.markFiyati > 0 ? +on.markFiyati : null,
      ...(emir.dilim ? { dilimGrup: emir.dilim.grup || id, dilimNo: emir.dilim.no, dilimToplam: emir.dilim.toplam } : {}) });

    const sonuc = await this._gonder(id, e, params);
    if (!sonuc.err) {
      let kayit = this._emirIsle(id, sonuc.o);
      // Denetim D2 (62.1): piyasa emri "NEW / dolan 0" dönerse (yoğunlukta RESULT yerine ACK gelebilir) kısa aralıkla yeniden
      // sorgulanır — yoksa kol mutabakatı uyuşmazlık görüp ENGEL koyuyordu (ertesi gün kendiliğinden düzelse de).
      if (e.type === 'market' && kayit.durum === 'ACIK' && !(+kayit.dolan > 0)) {
        for (const ms of this.ayar.piyasaSorguMs || [500, 2000]) {
          await this.uyu(ms);
          try { const r = await this._emirOku(id, e.symbol, false); if (r && !r.hata && !r.bulunamadi && r.o) kayit = this._emirIsle(id, r.o); } catch { /* sorgu hatası: mutabakat çözer */ }
          if (kayit.durum !== 'ACIK' || +kayit.dolan > 0) break;
        }
      }
      this.kaydet('SUCCESS', `Emir ${id}: ${e.side} ${e.amount} ${e.symbol} ${e.type}${e.price ? ' @' + e.price : ''} → ${kayit.durum}`);
      return { basarili: true, emir: kayit, onizleme: on };
    }
    return this._gonderimHatasi(id, e, params, sonuc.err, on, false);
  }

  /**
   * Dilim planı: yalnız piyasa emri, dilim değil, kapı engeli yok ve ön kontrolün TEK hatası -4005 (miktar sınırı).
   * Ön kontrolün -4005 denetimi yerinde kalır; her dilim onu yeniden geçer.
   */
  _dilimPlani(emir, on) {
    if (emir.dilim || on.emir.type !== 'market' || (on.kapi && on.kapi.engel)) return null;
    if (!on.hatalar.length || !on.hatalar.every(h => h.kod === -4005)) return null;
    const m = this.borsa.markets[emir.symbol] || {};
    const lim = m.limits || {};
    const maxQ = (lim.market && lim.market.max) || (lim.amount && lim.amount.max);
    const d = piyasaDilimleri(on.emir.amount, maxQ, m.precision && m.precision.amount);
    if (!d || d.length < 2) return null;
    // Dilim sayısı tavanı (denetim 2026-10-07): küçük/bozuk piyasa sınırı emir yağmuruna dönüşmesin (her dilim ~3 istek;
    // Binance emir hızı 300/10 sn, 1200/dk). Tavan üstünde bölme yapılmaz → emir -4005 ile reddedilir.
    const tavan = this.ayar.maxDilim ?? MAX_DILIM;
    if (d.length > tavan) return { red: `piyasa emri ${d.length} dilim gerektirir > dilim tavanı ${tavan} — bölünmedi` };
    return { dilimler: d };
  }

  /**
   * Sınırı aşan piyasa emrini dilimler hâlinde SIRAYLA gönderir (her dilim ayrı clientOrderId, defterde
   * `dilimGrup` = ilk dilimin kimliği, `dilimNo`, `dilimToplam`; reduceOnly/bot/neden aynen). Bir dilim
   * başarısız ya da belirsizse (basarili değil) KALAN DİLİMLER GÖNDERİLMEZ — belirsizlik/sorgu kuralları
   * dilimin kendi emirGonder'inde zaten uygulanmıştır. Dönüş tek emir biçimindedir (geriye uyumlu):
   * `emir` = son dilimin kaydı üzerine toplu durum/dolan/ortalama + `dilimler` (kimlikler).
   */
  async _dilimliGonder(emir, on, miktarlar) {
    const n = miktarlar.length;
    this.kaydet('INFO', `Piyasa emri ${on.emir.side} ${on.emir.amount} ${on.emir.symbol} piyasa emri sınırını aşıyor → ${n} dilim (${miktarlar.join(' + ')})`);
    const sonuclar = [];
    let grup = null;
    for (let i = 0; i < n; i++) {
      const r = await this.emirGonder({ ...emir, amount: miktarlar[i], dilim: { grup, no: i + 1, toplam: n } });
      sonuclar.push(r);
      if (i === 0 && r.emir) grup = r.emir.id;
      if (!r.basarili) {
        if (i + 1 < n) this.kaydet('WARN', `Dilimli emir ${grup || '?'}: ${i + 1}/${n}. dilim ${r.emir ? r.emir.durum : 'gönderilmedi'} — kalan ${n - i - 1} dilim GÖNDERİLMEDİ (${r.sebep || ''})`);
        break;
      }
    }
    const kayitlar = sonuclar.map(r => r.emir).filter(Boolean);
    const basarili = sonuclar.length === n && sonuclar.every(r => r.basarili);
    const son = sonuclar[sonuclar.length - 1];
    const onizleme = { ...on, gecerli: true, hatalar: [], dilimler: miktarlar };
    if (!kayitlar.length) return { basarili: false, sebep: son.sebep, onizleme, dilimler: sonuclar };
    const oz = dilimOzeti(kayitlar, n);
    const sonKayit = kayitlar[kayitlar.length - 1];
    const toplu = { ...sonKayit, durum: oz.durum, dolan: oz.dolan, ortFiyat: oz.ortFiyat, amount: on.emir.amount,
      dilimGrup: grup, dilimler: kayitlar.map(k => k.id), dilimToplam: n };
    return { basarili, sebep: basarili ? undefined : son.sebep, emir: toplu, onizleme, dilimler: sonuclar,
      ...(sonuclar.some(r => r.belirsizdi) ? { belirsizdi: true } : {}) };
  }

  /** createOrder'ı bir kez çağırır; geçersiz/boş başarı cevabı da hata (BadResponse → belirsiz) sayılır. */
  async _gonder(id, e, params) {
    try {
      const o = await this._istek(() => this.borsa.createOrder(e.symbol, e.type, e.side, e.amount, e.type === 'limit' ? e.price : undefined, { ...params }), false);
      if (gecerliEmir(o, id)) return { o };
      return { err: new ccxt.BadResponse(`createOrder geçersiz/boş cevap: ${kisaGovde(o)}`) };
    } catch (err) { return { err }; }
  }

  async _gonderimHatasi(id, e, params, err, on, yenidenDeneme) {
    if (err instanceof GeriCekilmeHatasi) {
      // İstek hiç atılmadı → kesin gönderilmedi.
      const kayit = this.defter.guncelle(id, { durum: 'RED', hata: err.message, sebep: 'gönderilmedi (geri çekilme)' });
      return { basarili: false, sebep: err.message, emir: kayit, onizleme: on };
    }
    const sinif = hataSinifi(err);
    if (sinif === 'RED' && !yenidenDeneme) {
      const kayit = this.defter.guncelle(id, { durum: 'RED', hata: err.message });
      this.kaydet('ERROR', `Emir ${id} reddedildi: ${err.message}`);
      return { basarili: false, sebep: err.message, emir: kayit, onizleme: on };
    }
    // Buradan sonrası: emir borsaya ULAŞMIŞ olabilir → RED yazılmaz, sorgu karar verir.
    this.defter.guncelle(id, { durum: 'BILINMIYOR', hata: err.message, hataSinifi: sinif });
    this.kaydet('WARN', `Emir ${id} sonucu belirsiz (${sinif}: ${(err && err.constructor && err.constructor.name) || 'hata'}) — sorgulanıyor`);
    const belirsiz = (kayit, sebep) => ({ basarili: kayit.durum !== 'RED' && kayit.durum !== 'BILINMIYOR', emir: kayit, belirsizdi: true,
      sebep: kayit.durum === 'BILINMIYOR' ? sebep || this.durmaSebebi : (kayit.durum === 'RED' ? kayit.sebep || err.message : undefined), onizleme: on });

    if (sinif === 'HIZ') {
      const g = this.geriCekilme;
      const kalan = g.bitis - this.simdi();
      if (g.ban || kalan > this.ayar.satirIciBeklemeMaxMs) {
        // Uzun geri çekilme/ban: istek atılmaz; sonraki mutabakat (süre bitince) sorgular.
        this._durdur(`emir ${id} sonucu belirsiz — ${g.ban ? '418 IP ban' : 'hız sınırı'}, ${Math.ceil(kalan / 1000)} sn geri çekilme; süre bitince mutabakat sorgular`, DURMA_TURU.GERI_CEKILME);
        return belirsiz(this.defter.al(id));
      }
      if (kalan > 0) await this.uyu(kalan);
    }
    if (sinif === 'SAAT' && !yenidenDeneme) return this._saatKaymasi(id, e, params, err, on);
    // -1021'in yeniden denemesi de -1021 aldıysa iki istek de borsada İŞLENMEDEN reddedildi → "yok" kesindir.
    const kayit = await this._sorgula(id, e.symbol, sinif === 'SAAT');
    return belirsiz(kayit);
  }

  /**
   * -1021 (saat kayması): istek borsa tarafından işlenmeden reddedilir; yine de önce saat ölçülür,
   * sonra emir SORGULANIR (gitmiş mi), yoksa AYNI clientOrderId ile BİR KEZ yeniden gönderilir.
   */
  async _saatKaymasi(id, e, params, err, on) {
    this.kaydet('WARN', `Emir ${id}: saat kayması (${err.message.slice(0, 80)}) — saat farkı yeniden ölçülüyor`);
    await this._saatTazele(true);
    // tekrarli=true: emir işlenmiş ama sorguda henüz görünmüyorsa aynı kimlikle yeniden gönderim ÇİFT EMİR olur
    // (piyasa emri hemen dolar; Binance clientOrderId tekilliğini yalnız AÇIK emirlerde arar). Denetim 2026-10-07.
    const r = await this._emirOku(id, e.symbol, true);
    if (r.o) {
      const kayit = this._emirIsle(id, r.o);
      return { basarili: kayit.durum !== 'RED', emir: kayit, belirsizdi: true, onizleme: on };
    }
    if (r.hata) {
      this._durdur(`emir ${id} durumu belirsiz (saat kayması sonrası sorgu): ${r.hata.message}`, durmaTuruSec(r.hata));
      return { basarili: false, sebep: this.durmaSebebi, emir: this.defter.al(id), belirsizdi: true, onizleme: on };
    }
    this.kaydet('WARN', `Emir ${id}: borsada yok — aynı kimlikle bir kez yeniden gönderiliyor`);
    this.defter.guncelle(id, { durum: 'GONDERILIYOR', yenidenDeneme: 1 });
    const s = await this._gonder(id, e, params);
    if (!s.err) {
      const kayit = this._emirIsle(id, s.o);
      this.kaydet('SUCCESS', `Emir ${id} (yeniden deneme): ${e.side} ${e.amount} ${e.symbol} → ${kayit.durum}`);
      return { basarili: true, emir: kayit, belirsizdi: true, onizleme: on };
    }
    // Yeniden denemenin her hatası (kesin red dahil — ör. kimlik çakışması) sorguyla çözülür.
    return this._gonderimHatasi(id, e, params, s.err, on, true);
  }

  /** @param kesinYok true → borsa isteği işlemeden reddettiyse (-1021): "yok" cevabı yaşa bakmadan RED'dir. */
  async _sorgula(id, symbol, kesinYok = false) {
    const r = await this._emirOku(id, symbol, true);
    if (r.o) return this._emirIsle(id, r.o);
    if (r.bulunamadi && (kesinYok || this._yokKesinMi(id))) return this.defter.guncelle(id, { durum: 'RED', sebep: `borsaya ulaşmadı (${r.sorgu} sorgu: yok)` });
    if (r.bulunamadi) {
      // M4-1: emir gitmiş ama sorguda henüz görünmüyor olabilir (piyasa emri dolmuş olur) → BILINMIYOR kalır, yeni pozisyon
      // emri yok; otomatik mutabakat (BELIRSIZ) aynı clientOrderId ile yeniden sorar, üst süreden sonra hâlâ yoksa RED.
      this._durdur(`emir ${id} sorguda henüz görünmüyor (${r.sorgu} sorgu) — gönderilmemiş sayılmadı; mutabakat yeniden sorar`, DURMA_TURU.BELIRSIZ);
      return this.defter.al(id);
    }
    // Sorgu da cevapsız/bozuk: belirsizlik sürüyor → yeni pozisyon emri yok.
    this._durdur(`emir ${id} durumu belirsiz: ${r.hata.message}`, durmaTuruSec(r.hata));
    return this.defter.al(id);
  }

  /**
   * Emrin borsadaki son hâlini sorgular (clientOrderId), defteri günceller.
   * `_sorgula`dan farkı: ağ hatasında yürütücüyü DURDURMAZ, hatayı atar —
   * periyodik dolum takibi (DCA merdiveni) içindir; karar çağırana kalır.
   * Bozuk/boş cevap (200 {}) da hata atar (BadResponse); geri çekilmede istek atılmaz.
   * `yoksaDokunma`: "emir yok" cevabında defter RED yapılmaz (çalışma sonu dolum okuması — emir az önce gönderildi,
   * sorguda geç görünebilir; RED sanılırsa canlı emir yetim kalırdı). Sonuç `bulunamadi: true`, kayıt değişmez.
   * @returns {{ kayit, ham | null, bulunamadi? }}
   */
  async emirSorgula(id, symbol, { yoksaDokunma = false } = {}) {
    this._baglantiGerekli();
    await this._saatTazele();
    const r = await this._emirOku(id, symbol, false);
    if (r.hata) throw r.hata;
    // M4-1: genç emirde "yok" kesin değil (geç görünürlük) → kayıt değişmez, yoksaDokunma ile aynı.
    if (r.bulunamadi) return { kayit: yoksaDokunma || !this._yokKesinMi(id) ? this.defter.al(id) : this.defter.guncelle(id, { durum: 'RED', sebep: 'borsada yok (gönderilmemiş)' }), ham: null, bulunamadi: true };
    return { kayit: this._emirIsle(id, r.o), ham: r.o };
  }

  /** İptal; cevap bozuk/boşsa (200 {}) iptal BELİRSİZDİR → defter değişmez, hata atılır (sorgu karar verir). */
  async iptal(id) {
    this._baglantiGerekli();
    if (!kimlik.bizimMi(id)) throw new Error('yalnız bu botun (ag-) emirleri iptal edilir');
    const e = this.defter.al(id);
    if (!e) throw new Error(`defterde yok: ${id}`);
    const o = await this._istek(() => this.borsa.cancelOrder(undefined, e.symbol, { clientOrderId: id }), false);
    if (!gecerliEmir(o, id)) throw new ccxt.BadResponse(`cancelOrder geçersiz/boş cevap — iptal belirsiz, sorgulanmalı: ${kisaGovde(o)}`);
    return this.defter.guncelle(id, { durum: 'IPTAL' });
  }

  /**
   * Sembolün net pozisyonunu `hedefMiktar`a (işaretli, baz birim) getirir.
   * Sıfırı geçen değişim ikiye bölünür: önce yalnız-azaltan kapanış, sonra açılış.
   * Fark en küçük işlem miktarının altındaysa işlem yapılmaz.
   */
  async hedefeGetir(symbol, hedefMiktar, bot = 'bot', neden = null) {
    this._baglantiGerekli();
    const net = await this._netPozisyon(symbol);
    const fark = hedefMiktar - net;
    const market = this.borsa.markets[symbol];
    const minQ = (market && market.limits && market.limits.amount && market.limits.amount.min) || 0;
    const sonuc = { symbol, net, hedef: hedefMiktar, emirler: [] };
    if (Math.abs(fark) < minQ || Math.abs(fark) < 1e-12) { sonuc.atlandi = 'fark en küçük miktarın altında'; return sonuc; }

    const parcalar = [];
    if (net !== 0 && Math.sign(hedefMiktar) !== Math.sign(net)) {
      parcalar.push({ side: net > 0 ? 'sell' : 'buy', amount: Math.abs(net), reduceOnly: true });
      if (hedefMiktar !== 0) parcalar.push({ side: hedefMiktar > 0 ? 'buy' : 'sell', amount: Math.abs(hedefMiktar), reduceOnly: false });
    } else {
      const azaltan = Math.abs(hedefMiktar) < Math.abs(net);
      parcalar.push({ side: fark > 0 ? 'buy' : 'sell', amount: Math.abs(fark), reduceOnly: azaltan });
    }
    for (const p of parcalar) {
      const r = await this.emirGonder({ symbol, type: 'market', bot, neden, ...p });
      sonuc.emirler.push(r);
      if (!r.basarili) break;
    }
    return sonuc;
  }

  /**
   * Net pozisyonu `fark` kadar değiştirir (işaretli, baz birim). Aynı sembolde
   * birden çok kol (B Kalkan: Donchian + DCA) pozisyon taşıdığında kol kendi
   * payının farkını verir; netin kendisi kolun hedefi değildir.
   */
  async farkaGetir(symbol, fark, bot = 'bot', neden = null) {
    this._baglantiGerekli();
    const net = await this._netPozisyon(symbol);
    return this.hedefeGetir(symbol, net + fark, bot, neden);
  }

  /**
   * ACİL DURDURMA: bizim açık emirlerimiz iptal, tüm pozisyonlar yalnız-azaltan
   * piyasa emriyle kapatılır, durum DURDURULDU. Kilit kontrolü UYGULANMAZ —
   * acil çıkış her zaman mümkün olmalı. Geri çekilme: 429'da acil istekler muaf
   * (tek seferlik kapanış), 418 IP ban'da istek ATILMAZ (ban uzar, istek zaten reddedilir) —
   * rapor.hatalar ban'ı söyler.
   */
  async acilDurdur(sebep = 'kullanıcı') {
    this._baglantiGerekli();
    this._durdur(`acil durdurma (${sebep})`, DURMA_TURU.ELLE, true);
    const rapor = { iptal: 0, kapatilan: [], hatalar: [] };
    this._acil = true;
    try {
      try {
        const acik = await this._istek(() => this.borsa.fetchOpenOrders());
        for (const o of acik.filter(x => kimlik.bizimMi(x.clientOrderId))) {
          try { await this._istek(() => this.borsa.cancelOrder(o.id, o.symbol), false); this.defter.guncelle(o.clientOrderId, { durum: 'IPTAL' }); rapor.iptal++; } catch (e) { rapor.hatalar.push(`iptal ${o.clientOrderId}: ${e.message}`); }
        }
      } catch (e) { rapor.hatalar.push(`açık emirler: ${e.message}`); }
      try {
        const ps = (await this._istek(() => this.borsa.fetchPositions())).filter(p => Math.abs(+p.contracts || 0) > 0);
        for (const p of ps) {
          this.kilitAcik = true;    // kapatma kilitten muaf; ardından kapanır
          try {
            const r = await this.emirGonder({ symbol: p.symbol, type: 'market', side: p.side === 'short' ? 'buy' : 'sell',
              amount: Math.abs(+p.contracts), reduceOnly: true, bot: 'acil', neden: `acil durdurma (${sebep})` });
            rapor.kapatilan.push({ symbol: p.symbol, basarili: r.basarili, sebep: r.sebep });
          } finally { this.kilitAcik = false; }
        }
      } catch (e) { rapor.hatalar.push(`pozisyonlar: ${e.message}`); }
    } finally { this._acil = false; }
    this.kaydet('WARN', `Acil durdurma: ${rapor.iptal} emir iptal, ${rapor.kapatilan.length} pozisyon kapatma emri`);
    return rapor;
  }

  ozet() {
    return {
      ortam: this.ortam, durum: this.durum, durmaSebebi: this.durmaSebebi, durmaTuru: this.durum === 'DURDURULDU' ? this.durmaTuru : null,
      otomatikCikis: this.durum === 'DURDURULDU' && OTOMATIK_CIKIS.has(this.durmaTuru),
      kilitAcik: this.kilitAcik, pozisyonModu: this.pozisyonModu, izinler: this.izinler,
      tavanlar: { emir: this.ayar.maxEmirNominal, pozisyon: this.ayar.maxPozisyonNominal },
      sonMutabakat: this.sonMutabakat,
      fren: this.fren, frenSayim: this._frenSayim(),
      geriCekilme: { ...this.geriCekilme, aktif: this.geriCekilme.bitis > this.simdi() },
      veriGeriCekilme: { ...this.veriGeriCekilme, aktif: this.veriGeriCekilme.bitis > this.simdi() },
      saatOlcum: { ...this.saatOlcum },
      sonEmirler: this.defter.sonEmirler(20),
    };
  }
}

module.exports = { CanliYurutucu, piyasaDilimleri, dilimOzeti, ccxtDurum, hataSinifi, gecerliEmir, GeriCekilmeHatasi, DURMA_TURU, durmaTuruSec, basliklariYakala };
