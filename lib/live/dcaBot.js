/**
 * DCA CANLI KOLU — `lib/strategies/dcaBotStrategy.js`in merdivenini borsada
 * yürütür. Backtestle AYNI strateji kodu: her sembol için strateji sınıfı
 * kurulur, kalıcı iç durumu (deal sayacı, BO seviyesi, deal ömrü…) diskten
 * geri yüklenir, günlük kapanışta `evaluate` bir kez çağrılır — 1d backtestin
 * bar başına bir çağrısının karşılığı.
 *
 * Sinyal → borsa eşlemesi (backtest motorunun emir defteri kurallarıyla):
 *   orders        → BO + SO limit alışları (miktar stratejiden, adıma aşağı)
 *   updateTarget  → TP: yalnız-azaltan limit satış, miktar = DCA pozisyonu
 *   cancelAll     → kalan merdiven emirleri iptal
 *   SELL          → piyasadan kapat (yalnız `dealMaxBar` açıkken)
 *   updateStop    → DESTEKLENMİYOR: `ttp` / `stopLoss` / Short açık ayar kurucuda
 *                   reddedilir (backtest bar içi dip/tepe ile tetikler; canlı
 *                   karşılığı yazılmadan açmak sessizce farklı bot olurdu)
 *
 * BORSA GERÇEKLERİ (backtestte olmayan, burada çözülen):
 *   · PERCENT_PRICE bandı: merdivenin alt basamakları (%−21, %−35) mark'ın
 *     ±%5 bandı dışında → borsa reddeder. Bant dışı emir yerelde BEKLIYOR
 *     tutulur, fiyat banda girince `senkron` gönderir. Strateji onu açık emir
 *     sayar (backtestte defterde duruyor).
 *   · Bandın ÖTE yanı (`_bantDurumu` → 'gecti'): limit fiyatı mark'ın bandın
 *     ötesinde "arkasında" kalmışsa (TP mark × alt çarpanın altında, alış
 *     basamağı mark × üst çarpanın üstünde) fiyat o seviyeyi çoktan geçmiştir.
 *     Backtest o barda TP'yi / basamağı doldurur; borsa limiti -4131 ile
 *     reddederdi → yalnız-azaltan (TP) ya da düz (alış) PİYASA emri. TP böyle
 *     kapanınca deal sebebi "TP (bant dışı — piyasadan)" (PLAN-TEST M1, aday 1).
 *   · BO RED (asgari nominal/miktar, ön kontrol, kapı) → deal BAŞLAMAMIŞ:
 *     merdiven iptal, strateji durumu geri, o gün yeniden deneme yok. Backtestte
 *     BO dolmadan SO dolamaz (BO en yakın basamak). Pozisyonsuz, BO'su ölü,
 *     dolumsuz merdiven "yetim"dir → masada sayılmaz, iptal edilir (aday 2).
 *   · Satış sonrası adım/2 altı kayan nokta artığı pozisyon sayılmaz (aday 3).
 *   · TP aynı aralıkta SO dolumuyla yarışabilir: backtest o barda TÜM
 *     pozisyonu eski TP'den kapatır. Burada TP eski miktarla dolar; kalan
 *     (yeni SO) miktar piyasadan kapatılır — deal yine biter.
 *   · SO dolunca TP miktarı `senkron`da pozisyona eşitlenir (fiyat günlük
 *     değerlendirmeye kadar aynı kalır — backtest de TP'yi bar sonunda günceller).
 *
 * SANAL POZİSYON: bu kolun pozisyonu kendi dolumlarından tutulur (aynı
 * sembolde Donchian kolu da pozisyon taşıyabilir; borsa netler). Her emrin
 * `islenenDolan`ı kalıcıdır → aynı dolum iki kez işlenmez (çökme güvenli).
 *
 * YENİDEN BAŞLATMA MUTABAKATI (`mutabakat`): izlenen her açık emir borsaya
 * clientOrderId ile sorulur, aradaki dolumlar işlenir; borsada hiç olmayan
 * (gönderilememiş) merdiven basamağı BEKLIYOR'a döner; bu botun önekini
 * taşıyıp durumda olmayan açık emir (sahipsiz) iptal edilir.
 */
const fs = require('fs');
const path = require('path');
const kalici = require('./kaliciDosya');
const DcaBotStrategy = require('../strategies/dcaBotStrategy');
const { adimaYuvarla } = require('./onKontrol');
const { dilimOzeti } = require('./yurutucu');

/** B Kalkan ölçümü: 10000 USDT başına BO 294, SO 412 (k = 2,94). */
const ORAN = Object.freeze({ baseOrder: 0.0294, safeOrder: 0.0412 });
const STRAT_ALANLARI = ['dealSayaci', 'stopSayaci', 'boSeviye', 'ttpAktif', 'ttpUc', 'oncekiPozVar', 'dealBar', 'sayilanBarZaman'];
const SON = new Set(['DOLDU', 'IPTAL', 'RED']);
const MERDIVEN = (rol) => rol === 'BO' || /^SO\d+$/.test(rol);
const EPS = 1e-9;

/** Sembole ayrılan sermayeden strateji ayarı (Fixed, B Kalkan oranları). */
function dcaAyari(sermaye, strateji = {}) {
  return { ...strateji, orderSizeType: 'Fixed', baseOrder: sermaye * ORAN.baseOrder, safeOrder: sermaye * ORAN.safeOrder };
}

class DcaBot {
  /**
   * @param yurutucu CanliYurutucu
   * @param ayar { dizin, bot ('kd'), strateji (dcaBotStrategy ayarları — oranlar hariç), kaydet, bantPayi }
   */
  constructor(yurutucu, ayar = {}) {
    this.y = yurutucu;
    this.ayar = { bot: 'kd', strateji: {}, bantPayi: 0.995, ...ayar };
    const p = new DcaBotStrategy(this.ayar.strateji).cfg();
    if (p.ttp > 0) throw new Error('DCA canlı: trailing take profit (ttp) canlıda desteklenmiyor');
    if (p.stopLoss > 0) throw new Error('DCA canlı: stopLoss canlıda desteklenmiyor');
    if (p.botDirection === 'Short') throw new Error('DCA canlı: yalnız Long (B Kalkan long-only)');
    this.kaydet = ayar.kaydet || (() => {});
    this.dosya = ayar.dizin ? path.join(ayar.dizin, 'dca-bot.json') : null;
    this.durum = { semboller: {}, kapananDeal: [], gerceklesen: 0, ucret: 0 };
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

  _s(symbol) {
    if (!this.durum.semboller[symbol]) {
      this.durum.semboller[symbol] = { strat: null, deal: null, poz: { miktar: 0, maliyet: 0 }, emirler: {} };
    }
    return this.durum.semboller[symbol];
  }

  _pazar(symbol) { return this.y.borsa && this.y.borsa.markets[symbol]; }

  // ── Okuma ────────────────────────────────────────────────────────────────
  pozisyon(symbol) {
    const e = this.durum.semboller[symbol];
    if (!e || e.poz.miktar <= EPS) return { miktar: 0, ortalama: null };
    return { miktar: e.poz.miktar, ortalama: e.poz.maliyet / e.poz.miktar };
  }

  /** { sembol: miktar } — kolun sanal pozisyonları (sıfırlar hariç). */
  sanalMiktarlar() {
    const o = {};
    for (const [s, e] of Object.entries(this.durum.semboller)) if (e.poz.miktar > EPS) o[s] = e.poz.miktar;
    return o;
  }

  /** Strateji açısından "defterde" duran merdiven emirleri (BEKLIYOR dahil). */
  acikMerdiven(symbol) {
    const e = this.durum.semboller[symbol];
    if (!e) return [];
    return Object.values(e.emirler).filter(x => MERDIVEN(x.rol) && !SON.has(x.durum));
  }

  semboller() { return Object.keys(this.durum.semboller); }

  // ── Strateji örneği (backtestle aynı sınıf, durum diskten) ──────────────
  /** @param n Hücum-S merdiven SO sayısı (lib/live/kucukSermaye.js); null / 6 → değişmemiş oranlar. */
  _strateji(symbol, sermaye, n = null) {
    const ayar = n != null && n !== 6 ? require('./kucukSermaye').dcaAyariN(sermaye, n, this.ayar.strateji) : dcaAyari(sermaye, this.ayar.strateji);
    const st = new DcaBotStrategy(ayar);
    const kayit = this._s(symbol).strat;
    if (kayit) for (const a of STRAT_ALANLARI) if (a in kayit) st[a] = kayit[a];
    return st;
  }

  _stratKaydet(symbol, st) {
    const o = {};
    for (const a of STRAT_ALANLARI) o[a] = st[a];
    this._s(symbol).strat = o;
  }

  // ── Dolum işleme ─────────────────────────────────────────────────────────
  /** Emrin borsadan gelen toplam dolumundan, henüz işlenmemiş kısmı pozisyona işler. */
  _dolumIsle(symbol, kayit, toplamDolan, fiyat) {
    const yeni = +(toplamDolan - (kayit.islenenDolan || 0)).toFixed(12);
    if (!(yeni > EPS)) return 0;
    const e = this._s(symbol);
    const m = this._pazar(symbol) || {};
    const oran = kayit.type === 'market' ? (m.taker ?? 0.0005) : (m.maker ?? 0.0002);
    const f = fiyat || kayit.fiyat;
    const ucret = yeni * f * oran;
    this.durum.ucret += ucret;
    if (kayit.side === 'buy') {
      e.poz.miktar = +(e.poz.miktar + yeni).toFixed(12);
      e.poz.maliyet += yeni * f;
      if (e.deal) { e.deal.dolum = (e.deal.dolum || 0) + 1; e.deal.ucret = (e.deal.ucret || 0) + ucret; }
    } else {
      const ort = e.poz.miktar > EPS ? e.poz.maliyet / e.poz.miktar : f;
      const q = Math.min(yeni, e.poz.miktar);
      const kar = q * (f - ort);
      this.durum.gerceklesen += kar;
      e.poz.maliyet -= q * ort;
      e.poz.miktar = +(e.poz.miktar - q).toFixed(12);
      // Kayan nokta artığı: adım/2 altı kalan borsada pozisyon değildir (gönderilemez, -4003);
      // sayılırsa deal kapanmaz ve sembol kilitlenir (PLAN-TEST M1, aday 3).
      const yarimAdim = ((m.precision && m.precision.amount) || 0) / 2;
      if (e.poz.miktar <= Math.max(EPS, yarimAdim)) { e.poz.miktar = 0; e.poz.maliyet = 0; }
      if (e.deal) { e.deal.kar = (e.deal.kar || 0) + kar; e.deal.ucret = (e.deal.ucret || 0) + ucret; }
    }
    kayit.islenenDolan = +((kayit.islenenDolan || 0) + yeni).toFixed(12);
    return yeni;
  }

  /**
   * Limit fiyatının PERCENT_PRICE bandına göre durumu (pay ile — sınırda reddedilmesin):
   *   'ic'    → gönderilebilir
   *   'bekle' → fiyat henüz gelmedi (alış bandın altında / satış bandın üstünde) → BEKLIYOR
   *   'gecti' → fiyat seviyeyi bandın ötesine kadar geçti (alış bandın ÜSTÜNDE / satış
   *             bandın ALTINDA): backtest bu barda doldurur, borsa limiti -4131 ile
   *             reddeder → piyasa emri.
   */
  _bantDurumu(symbol, side, fiyat, mark) {
    const m = this._pazar(symbol);
    const pp = ((m && m.info && m.info.filters) || []).find(f => f.filterType === 'PERCENT_PRICE');
    if (!pp || !(mark > 0) || !(fiyat > 0)) return 'ic';
    const pay = this.ayar.bantPayi;
    const alt = mark * (+pp.multiplierDown) / pay, ust = mark * (+pp.multiplierUp) * pay;
    if (side === 'buy') return fiyat < alt ? 'bekle' : fiyat > ust ? 'gecti' : 'ic';
    return fiyat > ust ? 'bekle' : fiyat < alt ? 'gecti' : 'ic';
  }

  /** Bekletilmeyecek mi (bant içinde ya da bandın ötesine geçilmiş). */
  _bantta(symbol, side, fiyat, mark) { return this._bantDurumu(symbol, side, fiyat, mark) !== 'bekle'; }

  async _mark(symbol) {
    // M3: yürütücünün geri çekilme kapısından geç (418 ban'da istek atılmaz → null → emir kapıda durur).
    const istek = (fn) => (typeof this.y.borsaIstegi === 'function' ? this.y.borsaIstegi(fn) : fn());
    try { const r = await istek(() => this.y.borsa.fetchMarkPrice(symbol)); return +(r.markPrice || (r.info && r.info.markPrice)) || null; } catch { return null; }
  }

  /**
   * Bir emri gönderir ya da bant dışındaysa BEKLIYOR bırakır.
   * @returns kayıt (durum: ACIK · KISMI · DOLDU · RED · BEKLIYOR)
   */
  async _emirVer(symbol, rol, { side, type = 'limit', amount, price = null, reduceOnly = false, neden = null }, mark) {
    const e = this._s(symbol);
    const kayit = e.emirler[rol] && !SON.has(e.emirler[rol].durum) && e.emirler[rol].durum === 'BEKLIYOR'
      ? e.emirler[rol] : { rol, side, type, fiyat: price, miktar: amount, reduceOnly, islenenDolan: 0, olusturma: Date.now() };
    Object.assign(kayit, { side, type, fiyat: price, miktar: amount, reduceOnly });
    e.emirler[rol] = kayit;
    kayit.piyasadan = false;
    if (type === 'limit') {
      const mk = mark ?? await this._mark(symbol);
      const bant = this._bantDurumu(symbol, side, price, mk);
      if (bant === 'bekle') { kayit.durum = 'BEKLIYOR'; kayit.id = null; this._yaz(); return kayit; }
      if (bant === 'gecti') {
        // Fiyat limit seviyesini bandın ötesine kadar geçti: backtest bu barda dolum
        // sayar (TP → pozisyonun tamamı TP'den; alış → basamak dolar). Limit -4131
        // ile reddedilirdi → piyasa emri (TP yalnız-azaltan kalır). kayit.fiyat
        // hedef seviye olarak korunur; dolum fiyatı borsadan gelir.
        type = 'market';
        kayit.type = 'market';
        kayit.piyasadan = true;
        neden = neden || (rol === 'TP' ? 'TP (bant dışı — piyasadan)' : `DCA ${rol} (bant dışı — piyasadan)`);
      }
    }
    const r = await this.y.emirGonder({ symbol, side, type, amount, price: type === 'limit' ? price : undefined, reduceOnly, bot: this.ayar.bot,
      neden: neden || (rol === 'BO' ? 'DCA BO (giriş)' : /^SO\d+$/.test(rol) ? `DCA ${rol} (ortalama düşürme)` : rol === 'TP' ? 'DCA TP (kâr al)' : rol === 'KAPAT' ? 'DCA kapanış' : `DCA ${rol}`) });
    if (!r.emir) {   // ön kontrol/kapı reddi: borsaya gitmedi
      kayit.durum = 'RED'; kayit.sebep = r.sebep; kayit.id = null;
      this.kaydet('WARN', `DCA ${symbol.split('/')[0]} ${rol} gönderilmedi: ${r.sebep}`);
      this._yaz();
      return kayit;
    }
    kayit.id = r.emir.id;
    kayit.durum = r.emir.durum;
    // Dilimli piyasa emri (piyasa emri sınırı, PLAN-TEST aday 4): kayıt tüm dilimleri izler; r.emir toplu durum/dolan.
    if (Array.isArray(r.emir.dilimler)) { kayit.dilimler = [...r.emir.dilimler]; kayit.dilimToplam = r.emir.dilimToplam; }
    else { delete kayit.dilimler; delete kayit.dilimToplam; }
    if (r.onizleme && r.onizleme.emir) { kayit.miktar = r.onizleme.emir.amount; if (type === 'limit') kayit.fiyat = r.onizleme.emir.price; }
    if (r.emir.dolan > 0) this._dolumIsle(symbol, kayit, r.emir.dolan, r.emir.ortFiyat || kayit.fiyat);
    if (!r.basarili) kayit.sebep = r.sebep || r.emir.hata || null;
    this._yaz();
    return kayit;
  }

  /**
   * Dilimli kaydın dilimlerini yeniler: son durumda olmayan dilim clientOrderId ile sorgulanır (yürütücü defteri
   * güncellenir), toplu dolum pozisyona işlenir, kaydın durumu dilimlerin toplu durumudur (yurutucu.dilimOzeti).
   * @returns yeni işlenen miktar
   */
  async _dilimSenkron(symbol, k) {
    const kayitlar = [];
    for (const id of k.dilimler) {
      let d = this.y.defter.al(id);
      if (!d || !SON.has(d.durum)) d = (await this.y.emirSorgula(id, symbol)).kayit;
      kayitlar.push(d);
    }
    const oz = dilimOzeti(kayitlar, k.dilimToplam || k.dilimler.length);
    const yeni = this._dolumIsle(symbol, k, oz.dolan, oz.ortFiyat || k.fiyat);
    k.sonDolan = oz.dolan;
    k.durum = oz.durum;
    return yeni;
  }

  /** Emri iptal eder; arada dolan kısmı işler. BEKLIYOR olan yalnız yerelde kapanır. */
  async _iptal(symbol, kayit) {
    if (SON.has(kayit.durum)) return;
    if (kayit.durum === 'BEKLIYOR' || !kayit.id) { kayit.durum = 'IPTAL'; return; }
    if (Array.isArray(kayit.dilimler)) {
      for (const id of kayit.dilimler) {
        const d = this.y.defter.al(id);
        if (d && !SON.has(d.durum)) { try { await this.y.iptal(id); } catch { /* dolmuş/yok olabilir — sorgu karar verir */ } }
      }
      try {
        await this._dilimSenkron(symbol, kayit);
        if (kayit.durum === 'ACIK' || kayit.durum === 'KISMI') kayit.durum = 'BILINMIYOR';
      } catch (err) { kayit.durum = 'BILINMIYOR'; kayit.sebep = `iptal sonrası sorgu: ${err.message}`; }
      return;
    }
    try { await this.y.iptal(kayit.id); } catch { /* dolmuş/yok olabilir — sorgu karar verir */ }
    try {
      const { kayit: d, ham } = await this.y.emirSorgula(kayit.id, symbol);
      if (ham) this._dolumIsle(symbol, kayit, +ham.filled || 0, ham.average || kayit.fiyat);
      kayit.durum = d.durum === 'ACIK' || d.durum === 'KISMI' ? 'BILINMIYOR' : d.durum;
    } catch (err) {
      kayit.durum = 'BILINMIYOR'; kayit.sebep = `iptal sonrası sorgu: ${err.message}`;
    }
  }

  async _merdiveniIptal(symbol, tpDahil = false) {
    const e = this.durum.semboller[symbol];
    if (!e) return;
    for (const k of Object.values(e.emirler)) if (MERDIVEN(k.rol) || (tpDahil && k.rol === 'TP')) await this._iptal(symbol, k);
  }

  /** Son durumdaki emir kayıtlarını budar (deal kapanınca). */
  _temizle(symbol) {
    const e = this.durum.semboller[symbol];
    if (!e) return;
    for (const [rol, k] of Object.entries(e.emirler)) if (SON.has(k.durum)) delete e.emirler[rol];
  }

  _dealKapat(symbol, sebep) {
    const e = this._s(symbol);
    if (e.deal) {
      this.durum.kapananDeal.push({ symbol, ...e.deal, kapanis: Date.now(), sebep });
      if (this.durum.kapananDeal.length > 200) this.durum.kapananDeal.splice(0, this.durum.kapananDeal.length - 200);
      this.kaydet('SUCCESS', `DCA ${symbol.split('/')[0]} deal ${e.deal.no} kapandı (${sebep}) · kâr ${(e.deal.kar || 0).toFixed(2)} USDT`);
    }
    e.deal = null;
  }

  // ── Periyodik takip ─────────────────────────────────────────────────────
  /**
   * Dolumları işler, TP miktarını pozisyona eşitler, bant içine giren BEKLIYOR
   * emirleri gönderir, TP sonrası kalan merdiveni iptal eder.
   * Ağ hatası olan sembol atlanır (sonraki turda yeniden).
   */
  async senkron() {
    const rapor = { dolum: 0, gonderilen: 0, tpGuncellenen: 0, kapanan: [], hatalar: [] };
    for (const symbol of Object.keys(this.durum.semboller)) {
      try { await this._senkronSembol(symbol, rapor); } catch (err) { rapor.hatalar.push(`${symbol}: ${err.message}`); }
    }
    this._yaz();
    return rapor;
  }

  /**
   * YALNIZ DOLUM OKUMA (68.x, HYPE ENGEL düzeltmesi): izlenen açık emirler borsaya sorulur, yeni dolumlar sanal
   * pozisyona işlenir. Emir GÖNDERMEZ, iptal etmez, TP güncellemez, deal kapatmaz — onlar dakikalık senkron()'un işi.
   * Kalkan günlük çalışmasının sonundaki pozisyon kontrolünden önce çağrılır: çalışma sırasında (mesgul) dakikalık
   * senkron durur; Binance limit emre çoğu zaman "NEW, dolan 0" döner ve emir saniyeler içinde dolar → defter eski kalır.
   * Sembol hatası atlanır ve `hatalar`a yazılır (çağıran kontrolü yine yapar; açıklanamayan fark ENGEL olur).
   * @returns {{ dolum: number, sorgulanan: number, bulunamadi: number, hatalar: string[] }}
   */
  async dolumlariOku() {
    const rapor = { dolum: 0, sorgulanan: 0, bulunamadi: 0, hatalar: [] };
    for (const symbol of Object.keys(this.durum.semboller)) {
      try { await this._dolumAdimi(symbol, rapor, { yoksaDokunma: true }); } catch (err) { rapor.hatalar.push(`${symbol}: ${err.message}`); }
    }
    this._yaz();
    return rapor;
  }

  /**
   * Senkronun 1. adımı (dolumlar): açık emirleri sorar, dolumu işler, kayıt durumunu günceller.
   * `yoksaDokunma` (yalnız dolumlariOku): borsa "emir yok" derse kayıt olduğu gibi kalır (RED yapılmaz; senkron/mutabakat çözer).
   */
  async _dolumAdimi(symbol, rapor, { yoksaDokunma = false } = {}) {
    const e = this.durum.semboller[symbol];
    for (const k of Object.values(e.emirler)) {
      if (!k.id || k.durum === 'BEKLIYOR' || SON.has(k.durum)) continue;
      if (rapor.sorgulanan != null) rapor.sorgulanan++;
      if (Array.isArray(k.dilimler)) { if (await this._dilimSenkron(symbol, k) > 0) rapor.dolum++; continue; }
      const { kayit: d, ham, bulunamadi } = await this.y.emirSorgula(k.id, symbol, yoksaDokunma ? { yoksaDokunma: true } : undefined);
      if (bulunamadi && yoksaDokunma) { if (rapor.bulunamadi != null) rapor.bulunamadi++; continue; }
      if (ham) {
        k.sonDolan = +ham.filled || 0;
        if (this._dolumIsle(symbol, k, k.sonDolan, ham.average || k.fiyat) > 0) rapor.dolum++;
      }
      k.durum = d.durum;
    }
  }

  async _senkronSembol(symbol, rapor) {
    const e = this.durum.semboller[symbol];
    // 1. Dolumlar
    await this._dolumAdimi(symbol, rapor);
    // 2. TP doldu → deal bitti
    if (await this._tpDolduysaKapat(symbol, rapor)) return;
    // 2b. BO'suz (yetim) merdiven: bekleyen basamak borsaya gönderilmez — merdivensiz pozisyon açardı
    if (await this._yetimTemizle(symbol)) return;
    const tp = e.emirler.TP;
    if (e.poz.miktar <= EPS && (!tp || SON.has(tp.durum)) && !this.acikMerdiven(symbol).length) return;
    const mark = await this._mark(symbol);
    // 3. Bant içine giren bekleyen merdiven/TP emirleri
    for (const k of Object.values(e.emirler)) {
      if (k.durum !== 'BEKLIYOR') continue;
      if (k.rol === 'TP' && e.poz.miktar <= EPS) { k.durum = 'IPTAL'; continue; }
      if (this._bantDurumu(symbol, k.side, k.fiyat, mark) === 'bekle') continue;
      const miktar = k.rol === 'TP' ? e.poz.miktar : k.miktar;
      const r = await this._emirVer(symbol, k.rol, { side: k.side, type: 'limit', amount: miktar, price: k.fiyat, reduceOnly: k.reduceOnly }, mark);
      if (r.id) rapor.gonderilen++;
      if (k.rol === 'TP' && r.durum === 'DOLDU') break;     // deal bitti; 5. adım kapatır
    }
    // 4. TP miktarı pozisyonla eşit mi (SO dolduysa büyür)
    const tp2 = e.emirler.TP;
    if (tp2 && (tp2.durum === 'ACIK' || tp2.durum === 'KISMI') && e.poz.miktar > EPS) {
      const m = this._pazar(symbol);
      // Kısmi TP dolumu pozisyondan zaten düşüldü: TP'nin KALAN miktarı = pozisyon.
      const hedef = adimaYuvarla(e.poz.miktar, m.precision.amount, 'asagi');
      if (Math.abs(hedef - (tp2.miktar - (tp2.islenenDolan || 0))) > m.precision.amount / 2) {
        await this._iptal(symbol, tp2);
        if (e.poz.miktar > EPS && tp2.durum !== 'DOLDU') {
          await this._emirVer(symbol, 'TP', { side: 'sell', type: 'limit', amount: e.poz.miktar, price: tp2.fiyat, reduceOnly: true }, mark);
          rapor.tpGuncellenen++;
        }
      }
    }
    // 5. Bu turda gönderilen TP anında dolmuş olabilir (fiyat zaten hedefin üstünde)
    await this._tpDolduysaKapat(symbol, rapor);
  }

  /** TP doldu → deal bitti: kalan merdiven iptal, artık miktar (aynı aralıkta dolan SO) piyasadan kapanır. */
  async _tpDolduysaKapat(symbol, rapor) {
    const e = this.durum.semboller[symbol];
    const tp = e && e.emirler.TP;
    if (!tp || tp.durum !== 'DOLDU') return false;
    await this._merdiveniIptal(symbol);
    if (e.poz.miktar > EPS) {
      delete e.emirler.KAPAT;
      const r = await this._emirVer(symbol, 'KAPAT', { side: 'sell', type: 'market', amount: e.poz.miktar, reduceOnly: true, neden: 'DCA kapanış — TP sonrası artık' });
      if (r.durum !== 'DOLDU') rapor.hatalar.push(`${symbol}: TP sonrası artık kapatılamadı (${r.sebep || r.durum})`);
    }
    if (e.poz.miktar <= EPS) { this._dealKapat(symbol, tp.piyasadan ? 'TP (bant dışı — piyasadan)' : 'take profit'); this._temizle(symbol); rapor.kapanan.push(symbol); }
    return true;
  }

  /**
   * YETİM MERDİVEN: pozisyon yok, BO ölü (RED/IPTAL) ya da hiç yok, deal'de dolum yok,
   * ama basamaklar hâlâ "açık" (çoğu bant dışı BEKLIYOR). Backtestte bu durum olamaz —
   * BO en yakın basamaktır, o dolmadan SO dolmaz. Masada sayılırsa strateji "merdiven
   * masada" der ve sembolde sonsuza dek yeni deal açılmaz (PLAN-TEST M1, aday 2).
   */
  _yetimMi(symbol) {
    const e = this.durum.semboller[symbol];
    if (!e || e.poz.miktar > EPS) return false;
    const bo = e.emirler.BO;
    if (bo && bo.durum !== 'RED' && bo.durum !== 'IPTAL') return false;
    if (e.deal && e.deal.dolum > 0) return false;
    return this.acikMerdiven(symbol).length > 0;
  }

  /** Yetim merdiveni iptal eder; deal başlamamış sayılır. Döner: temizlendi mi. */
  async _yetimTemizle(symbol) {
    if (!this._yetimMi(symbol)) return false;
    const e = this.durum.semboller[symbol];
    const bo = e.emirler.BO;
    for (const k of this.acikMerdiven(symbol)) await this._iptal(symbol, k);
    // İptal sırasında dolum geldiyse ya da sonuç belirsizse deal sürer (güvenli taraf).
    if (e.poz.miktar > EPS || this.acikMerdiven(symbol).length) { this._yaz(); return false; }
    this.kaydet('WARN', `DCA ${symbol.split('/')[0]}: BO'suz merdiven (BO ${bo ? bo.durum + (bo.sebep ? ' — ' + bo.sebep : '') : 'yok'}) — deal başlamamış sayıldı, bekleyen basamaklar iptal`);
    e.deal = null;
    this._temizle(symbol);
    this._yaz();
    return true;
  }

  // ── Günlük değerlendirme ────────────────────────────────────────────────
  /**
   * Kapanmış günlük mumlarla stratejiyi bir kez değerlendirir ve sinyali yürütür.
   * @param mumlar [{ time, open, high, low, close, volume }] — yalnız KAPANMIŞ
   * @param sec { sermaye (sembole ayrılan USDT), yeniDealSerbest, kuru }
   */
  async gunluk(symbol, mumlar, { sermaye, yeniDealSerbest = true, kuru = false, n = null } = {}) {
    if (!(sermaye > 0)) throw new Error(`DCA ${symbol}: sermaye pozitif olmalı`);
    const e = this._s(symbol);
    // Yetim (BO'suz) merdiven masada sayılmaz: gerçek çalışmada iptal edilir, kuruda yalnız sayılmaz.
    if (!kuru) await this._yetimTemizle(symbol);
    const st = this._strateji(symbol, sermaye, n);
    const once = {}; for (const a of STRAT_ALANLARI) once[a] = st[a];
    const poz = this.pozisyon(symbol);
    const positions = poz.miktar > EPS ? [{ amount: poz.miktar, entryPrice: poz.ortalama, side: 'long' }] : [];
    const acikEmir = kuru && this._yetimMi(symbol) ? 0 : this.acikMerdiven(symbol).length;
    const sinyal = st.evaluate(mumlar, null, positions, { openOrders: acikEmir, equity: sermaye, capital: sermaye });
    const gun = new Date(mumlar[mumlar.length - 1].time).toISOString().slice(0, 10);
    const rapor = { symbol, gun, sinyal: sinyal.action,
      sebep: sinyal.reason, merdiven: null, tp: null, iptal: false, engellendi: null, pozisyon: poz, acikEmir };
    if (kuru) {
      if (sinyal.orders) rapor.merdiven = sinyal.orders.map(o => ({ id: o.id, fiyat: o.limitPrice, miktar: o.qty, nominal: o.qty * o.limitPrice }));
      if (Number.isFinite(sinyal.updateTarget)) rapor.tp = sinyal.updateTarget;
      return rapor;      // durum KAYDEDİLMEZ
    }

    if (sinyal.cancelAll) { await this._merdiveniIptal(symbol, positions.length === 0); rapor.iptal = true; }

    if (sinyal.action === 'SELL') {
      await this.kapat(symbol, sinyal.reason || 'strateji çıkışı', { stratSifirla: false });
    }

    if (Array.isArray(sinyal.orders) && sinyal.orders.length) {
      if (!yeniDealSerbest) {
        // Risk katmanı yeni deal'e izin vermiyor: strateji durumu geri alınır,
        // ertesi gün koşul sürüyorsa yeniden denenir.
        for (const a of STRAT_ALANLARI) st[a] = once[a];
        rapor.engellendi = 'risk katmanı: yeni deal yok';
      } else if (e.boRed && e.boRed.gun === gun) {
        // Bugün BO zaten reddedildi (ör. yeniden başlatma aynı günü yeniden çalıştırdı):
        // yeniden deneme yok, ertesi günlük değerlendirmede strateji yeniden karar verir.
        for (const a of STRAT_ALANLARI) st[a] = once[a];
        rapor.engellendi = `BO bugün reddedildi (${e.boRed.sebep}) — ertesi gün yeniden`;
      } else {
        this._temizle(symbol);
        e.deal = { no: st.dealSayaci, acilis: mumlar[mumlar.length - 1].time, bo: sinyal.orders[0].limitPrice, sermaye, kar: 0, ucret: 0, dolum: 0 };
        const mark = await this._mark(symbol);
        rapor.merdiven = [];
        for (const o of sinyal.orders) {
          const k = await this._emirVer(symbol, o.id, { side: 'buy', type: 'limit', amount: o.qty, price: o.limitPrice }, mark);
          rapor.merdiven.push({ id: o.id, fiyat: k.fiyat, miktar: k.miktar, durum: k.durum, sebep: k.sebep || null });
        }
        const boK = e.emirler.BO;
        if (boK && boK.durum === 'RED') {
          // BO gönderilemedi (asgari nominal/miktar, ön kontrol, kapı): deal BAŞLAMADI.
          // Backtestte BO dolmadan SO dolamaz; BO'suz merdiven masada kalırsa sembol kilitlenir.
          const sebep = boK.sebep || 'RED';
          for (const k of this.acikMerdiven(symbol)) await this._iptal(symbol, k);
          if (e.poz.miktar <= EPS && !this.acikMerdiven(symbol).length) {
            for (const a of STRAT_ALANLARI) st[a] = once[a];
            e.deal = null;
            e.boRed = { gun, sebep };
            this._temizle(symbol);
            rapor.engellendi = `BO reddedildi (${sebep}) — deal başlamadı, ertesi gün yeniden değerlendirilir`;
            this.kaydet('WARN', `DCA ${symbol.split('/')[0]}: ${rapor.engellendi}`);
          } else {
            // İptal sırasında basamak doldu ya da sonucu belirsiz: deal sürer, yetim denetimi izler.
            this.kaydet('WARN', `DCA ${symbol.split('/')[0]}: BO reddedildi (${sebep}) ama merdivende dolum/belirsiz emir var — deal sürüyor`);
          }
        } else {
          delete e.boRed;
          this.kaydet('INFO', `DCA ${symbol.split('/')[0]} deal ${st.dealSayaci}: merdiven ${sinyal.orders.length} emir (BO ${sinyal.orders[0].limitPrice})`);
        }
      }
    }

    if (Number.isFinite(sinyal.updateTarget) && this.pozisyon(symbol).miktar > EPS) {
      rapor.tp = await this._tpAyarla(symbol, sinyal.updateTarget);
      // TP bant dışı piyasadan (ya da anında) doldu → deal şimdi kapanır (backtest: bu barda TP).
      if (e.emirler.TP && e.emirler.TP.durum === 'DOLDU') {
        const r = { hatalar: [], kapanan: [] };
        await this._tpDolduysaKapat(symbol, r);
        if (r.hatalar.length) rapor.tpHata = r.hatalar.join('; ');
      }
    }
    this._stratKaydet(symbol, st);
    this._yaz();
    return rapor;
  }

  /** TP'yi hedef fiyata ve tam pozisyon miktarına getirir (değişmediyse dokunmaz). */
  async _tpAyarla(symbol, hedefFiyat) {
    const e = this._s(symbol);
    const m = this._pazar(symbol);
    const fiyat = adimaYuvarla(hedefFiyat, m.precision.price, 'yukari');
    const miktar = adimaYuvarla(e.poz.miktar, m.precision.amount, 'asagi');
    const tp = e.emirler.TP;
    const canli = tp && !SON.has(tp.durum);
    if (canli && tp.fiyat === fiyat && Math.abs(tp.miktar - miktar) <= m.precision.amount / 2) return { fiyat, miktar, durum: tp.durum, degisti: false };
    if (canli) await this._iptal(symbol, tp);
    if (e.emirler.TP && e.emirler.TP.durum === 'DOLDU') return { fiyat, durum: 'DOLDU', degisti: false };   // iptal ederken doldu → senkron kapatır
    if (!(this._s(symbol).poz.miktar > EPS)) return { fiyat, durum: 'pozisyon yok' };
    delete e.emirler.TP;
    const k = await this._emirVer(symbol, 'TP', { side: 'sell', type: 'limit', amount: this._s(symbol).poz.miktar, price: fiyat, reduceOnly: true });
    return { fiyat: k.fiyat, miktar: k.miktar, durum: k.durum, degisti: true };
  }

  /**
   * Sembolün DCA'sını kapatır: tüm emirler iptal, pozisyon piyasadan (yalnız
   * azaltan). Evrenden çıkış, risk K3, acil durumda çağrılır.
   *
   * KURAL — EVRENDEN ÇIKIŞ: sembol PIT evrenden çıktığında açık deal PİYASA
   * emriyle kapatılır ve bekleyen merdiven emirleri (BO/SO, BEKLIYOR dahil)
   * ile TP iptal edilir. Backtest ölçümü böyle (segment evrenden çıkınca
   * biter); "deal'i TP'ye kadar taşı" seçeneği ölçüldü ve REDDEDİLDİ
   * (referans/ANALIZ-DCA-KAYIP.md). Bu davranışı değiştirmek B Kalkan'ın
   * ölçülmüş sonucunu geçersiz kılar.
   */
  async kapat(symbol, sebep = 'kapat', { stratSifirla = true } = {}) {
    const e = this.durum.semboller[symbol];
    if (!e) return { symbol, kapandi: true, bos: true };
    await this._merdiveniIptal(symbol, true);
    let kapandi = true, hata = null;
    if (e.poz.miktar > EPS) {
      delete e.emirler.KAPAT;
      const r = await this._emirVer(symbol, 'KAPAT', { side: 'sell', type: 'market', amount: e.poz.miktar, reduceOnly: true, neden: `DCA kapanış — ${sebep}` });
      if (e.poz.miktar > EPS) { kapandi = false; hata = r.sebep || r.durum; }
    }
    if (kapandi) {
      this._dealKapat(symbol, sebep);
      this._temizle(symbol);
      if (stratSifirla) delete this.durum.semboller[symbol];
    }
    this._yaz();
    return { symbol, kapandi, hata };
  }

  /** Risk K1 (yeni risk yok): dolmamış merdiven emirleri iptal, TP kalır. */
  async girisleriIptal(symbol) {
    if (!this.acikMerdiven(symbol).length) return 0;
    const n = this.acikMerdiven(symbol).length;
    await this._merdiveniIptal(symbol, false);
    this._yaz();
    return n;
  }

  // ── Yeniden başlatma mutabakatı ─────────────────────────────────────────
  /**
   * Açılışta: izlenen emirler borsaya sorulur, aradaki dolumlar işlenir;
   * borsada olmayan merdiven basamağı BEKLIYOR'a döner; sahipsiz önekli emir
   * iptal edilir. Çözülemeyen varsa `cozulemeyen` dolu döner (çağıran durur).
   */
  async mutabakat() {
    const rapor = { sorgulanan: 0, dolum: 0, yenidenKuyruk: 0, sahipsizIptal: 0, cozulemeyen: [] };
    const izlenen = new Set();
    // Denetim D3 (62.1): "bulunamadı" cevabında basamak yeniden kuyruğa alınmadan önce AÇIK EMİR listesine bakılır — Binance eski
    // emirleri tekil sorguda göstermeyebilir; listede olan emri yeniden göndermek çift emir olurdu. Liste okunamazsa yeniden
    // gönderilmez (çözülemeyen → ENGEL; kapalı-başarısız).
    const istekA = (fn, tekrar) => (typeof this.y.borsaIstegi === 'function' ? this.y.borsaIstegi(fn, tekrar) : fn());
    let acikKimlik = null;
    try { acikKimlik = new Set((await istekA(() => this.y.borsa.fetchOpenOrders())).map(o => o.clientOrderId).filter(Boolean)); } catch { acikKimlik = null; }
    for (const [symbol, e] of Object.entries(this.durum.semboller)) {
      for (const k of Object.values(e.emirler)) {
        if (k.id) izlenen.add(k.id);
        if (Array.isArray(k.dilimler)) for (const id of k.dilimler) izlenen.add(id);
        if (!k.id || (SON.has(k.durum) && k.durum !== 'BILINMIYOR')) continue;
        if (k.durum === 'BEKLIYOR') continue;
        rapor.sorgulanan++;
        // Dilimli kayıt: TÜM dilimler sorgulanır, toplu dolum işlenir (yalnız son dilimin dolumu toplam sanılırsa
        // önceki dilimlerin işlenmemiş dolumu kaybolur — denetim 2026-10-07, piyasa-dilim-selftest 8).
        if (Array.isArray(k.dilimler)) {
          try { if (await this._dilimSenkron(symbol, k) > 0) rapor.dolum++; } catch (err) { rapor.cozulemeyen.push({ symbol, rol: k.rol, id: k.id, hata: err.message }); }
          continue;
        }
        try {
          const { kayit: d, ham, bulunamadi } = await this.y.emirSorgula(k.id, symbol);
          if (bulunamadi) {
            if (acikKimlik && acikKimlik.has(k.id)) { k.durum = 'ACIK'; continue; }   // sorgu "yok" dedi ama borsada açık (D3)
            if (!acikKimlik) { rapor.cozulemeyen.push({ symbol, rol: k.rol, id: k.id, hata: 'emir sorguda yok ve açık emir listesi okunamadı — yeniden gönderilmedi' }); continue; }
            // M4-1 sınıfı (DCA mutabakatı): GENÇ emirde "yok" kesin değil — emir borsada işlenmiş (limit/piyasa DOLMUŞ, açık
            // listede de yok) ama sorguda henüz görünmüyor olabilir. Yeniden kuyruğa alınırsa senkron YENİ kimlikle ikinci emri
            // gönderir (çift basamak/TP); KAPAT RED sayılırsa dolmuş kapanış kaybolur. Kayıt olduğu gibi kalır, yürütücü
            // BELIRSIZ durur (otomatik mutabakat: emir görünürse dolum işlenir, üst süreden sonra hâlâ yoksa bugünkü yol).
            if (typeof this.y._yokKesinMi === 'function' && !this.y._yokKesinMi(k.id)) {
              rapor.cozulemeyen.push({ symbol, rol: k.rol, id: k.id, gorunmedi: true, hata: 'genç emir sorguda henüz görünmüyor — yeniden kuyruğa alınmadı / RED sayılmadı' });
              if (this.y.durum === 'AKTIF' && typeof this.y._durdur === 'function') this.y._durdur(`DCA emri ${k.id} sorguda henüz görünmüyor — gönderilmemiş sayılmadı; mutabakat yeniden sorar`, 'BELIRSIZ');
              continue;
            }
            if (MERDIVEN(k.rol) || k.rol === 'TP') { k.durum = 'BEKLIYOR'; k.id = null; rapor.yenidenKuyruk++; }
            else k.durum = 'RED';
            continue;
          }
          k.sonDolan = +ham.filled || 0;
          if (this._dolumIsle(symbol, k, k.sonDolan, ham.average || k.fiyat) > 0) rapor.dolum++;
          k.durum = d.durum;
        } catch (err) { rapor.cozulemeyen.push({ symbol, rol: k.rol, id: k.id, hata: err.message }); }
      }
    }
    try {
      const onek = `ag-${this.ayar.bot}-`;
      // M3: yürütücünün geri çekilme kapısından geç (418 ban'da istek atılmaz).
      const istek = (fn, tekrar) => (typeof this.y.borsaIstegi === 'function' ? this.y.borsaIstegi(fn, tekrar) : fn());
      const acik = await istek(() => this.y.borsa.fetchOpenOrders());
      for (const o of acik) {
        if (typeof o.clientOrderId !== 'string' || !o.clientOrderId.startsWith(onek) || izlenen.has(o.clientOrderId)) continue;
        try { await istek(() => this.y.borsa.cancelOrder(o.id, o.symbol), false); this.y.defter.guncelle(o.clientOrderId, { durum: 'IPTAL', sebep: 'sahipsiz (DCA durumunda yok)' }); rapor.sahipsizIptal++; }
        catch (err) { rapor.cozulemeyen.push({ symbol: o.symbol, id: o.clientOrderId, hata: `sahipsiz iptal: ${err.message}` }); }
      }
    } catch (err) { rapor.cozulemeyen.push({ hata: `açık emirler okunamadı: ${err.message}` }); }
    this._yaz();
    if (rapor.dolum || rapor.yenidenKuyruk || rapor.sahipsizIptal) this.kaydet('WARN', `DCA mutabakatı: ${rapor.dolum} dolum işlendi, ${rapor.yenidenKuyruk} emir yeniden kuyrukta, ${rapor.sahipsizIptal} sahipsiz emir iptal`);
    return rapor;
  }

  /** Acil durdurma sonrası: pozisyonlar borsada kapatıldı, kol durumu sıfırlanır. */
  sifirla(sebep = 'acil durdurma') {
    for (const s of Object.keys(this.durum.semboller)) this._dealKapat(s, sebep);
    this.durum.semboller = {};
    this._yaz();
  }

  /**
   * 73.8 KAYIT EŞİTLEME (Y-03/Y-33, kullanıcı aracı): `sifirla`nın TEK sembollü hâli — pozisyon borsada zaten kapandı (felaket
   * stopu / ADL / likidasyon); deal kapanmış sayılır, sembolün kaydı silinir. Emir GÖNDERMEZ, iptal etmez; borsada kalan önekli
   * merdiven emirlerini sonraki mutabakat "sahipsiz" sayıp iptal eder (mevcut yol).
   */
  sembolSifirla(symbol, sebep = 'kayıt eşitleme') {
    if (!this.durum.semboller[symbol]) return false;
    this._dealKapat(symbol, sebep);
    delete this.durum.semboller[symbol];
    this._yaz();
    return true;
  }

  ozet() {
    const semboller = Object.entries(this.durum.semboller).map(([s, e]) => ({
      symbol: s, deal: e.deal, pozisyon: this.pozisyon(s),
      emirler: Object.values(e.emirler).filter(k => !SON.has(k.durum)).map(k => ({ rol: k.rol, durum: k.durum, fiyat: k.fiyat, miktar: k.miktar })),
    }));
    return { semboller, kapananDeal: this.durum.kapananDeal.slice(-20), gerceklesen: this.durum.gerceklesen, ucret: this.durum.ucret };
  }
}

module.exports = { DcaBot, dcaAyari, ORAN, STRAT_ALANLARI };
