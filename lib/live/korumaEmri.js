/**
 * FELAKET STOPU — borsada BEKLEYEN koruma emri (PLAN-RISK.md P0, ARASTIRMA-RISK.md L1.2,
 * ARASTIRMA-DUNYA-BOTLAR.md P0-1).
 *
 * Sorun: model stopları günde bir, kapanışta değerlendirilir. Bilgisayar kapalıyken,
 * süreç ölmüşken ya da internet kesikken pozisyon 24 saat+ korumasız kalır.
 * Çözüm: her açık NET pozisyon için Binance'te `STOP_MARKET` + `closePosition=true` +
 * `workingType=MARK_PRICE` + `priceProtect=TRUE` koşullu emri (`/fapi/v1/algoOrder`).
 * Emir borsada durur; bot ölse de tetiklenir.
 *
 * SEVİYE (long; short simetrik):
 *   stop = mark × (1 − k × ATR20%)              k = 6 (varsayılan)
 *   DCA merdiveni açıksa: stop ≤ en derin bekleyen SO − 1 × ATR20
 *   (felaket stopu DCA'nın ortalama düşürmek için BİLEREK beklediği bölgede tetiklenmemeli).
 * ATR yüzdesi KAPANMIŞ günlük mumlardan (karar verisi — demo'da prod), çapa işlem borsasının
 * mark fiyatı: demo fiyatları prod'dan farklı olabildiği için seviye mutlak değil oransal taşınır.
 *
 * k neden 6 (ölçüm 2026-10-07, PIT ilk-15 evren 2020-09 → 2026-10, 33.263 sembol-gün,
 * son fiyat iğneleri — mark daha az iğneler):
 *   k=3: %0,63 tetik, %68'i gün sonu toparlandı ·  k=4: %0,33, %59 toparlandı
 *   k=5: %0,22, %46                             ·  k=6: %0,16, %26 (çoğu 2025-10-10)
 * k=4'te tetiklerin çoğu anlık iğne — ölçülen sistemin tutacağı pozisyonu keserdi. k=6 yalnız
 * gerçek çöküşleri yakalar. Backtest ablasyonu (L1.2 kabul kuralı) YAPILMADI — açık iş.
 *
 * YAŞAM DÖNGÜSÜ:
 *   · `guncelle` — günlük çalışmanın SONUNDA: her net pozisyona seviye yeniden çapalanır,
 *     pozisyonu kalmayan sembolün stopu iptal edilir.
 *   · `denetle` — saatlik: pozisyon var, stop yok → yeniden konur (kayıtlı seviyeden);
 *     kayıtlı stop borsadan kaybolmuşsa (tetiklendi / elle iptal) → alarm.
 *   · `hepsiniIptal` — acil durdurmada (closePosition emri sonradan açılan pozisyonu kapatır!).
 * Konulamayan stop: alarm + sağlık sinyali; bot DURMAZ (bir sonraki denetim yeniden dener).
 *
 * KİMLİK: `ag-fs-<gün>-<sayaç>` (clientAlgoId). Koşullu emirler normal açık emir listesinde
 * GÖRÜNMEZ — yürütücü mutabakatı onları görmez, bu modül ayrı listeden (`trigger: true`) okur.
 * Kâğıt borsada çalışmaz (`kagit: true`): kâğıt borsa bar içi tetik taşımıyor.
 *
 * HARİÇ TUTULAN PAY (`haricFn(symbol)` → işaretli miktar): sembolün netinin bir kısmı stop DIŞINDA kalır
 * (Hücum demo: BTC ayağı — PLAN-FELAKET-ABLASYON.md, kullanıcı kararı 2026-10-07: bedel BTC ayağından,
 * gerçek parada BTC ayağı zaten spot teminat). O sembolde closePosition yerine YALNIZ korunan pay kadar
 * reduceOnly STOP_MARKET konur; korunan pay asgari miktarın altındaysa stop yok. Kısmi stop tetiklenince
 * pozisyon sıfırlanmadığı için "tetiklendi mi" emrin borsadaki durumundan okunur (`fetchOrder`, trigger).
 */
const fs = require('fs');
const path = require('path');
const kalici = require('./kaliciDosya');
const kimlik = require('./emirKimligi');
const { kapanmisGunlukMumlar, mumKapisi } = require('./donchianBot');
const { hataSinifi } = require('./yurutucu');

const BOT = 'fs';
const ONEK = `${kimlik.ONEK}-${BOT}-`;
const ATR_N = 20;
const SAAT = 3600e3;
// Koşullu emirde KESİN red (emir defterine girmedi): -4130 aynı yönde closePosition var, -2021 hemen tetiklenir,
// -4120 yanlış uç. ccxt 4.5.71 bunları ExchangeError eşliyor (sınıf BELIRSIZ) — kodla ayrılır, sorgu gerekmez.
const STOP_KESIN_RED = /-(4130|4120|2021)\b/;
const BULUNAMADI_METIN = /does not exist|unknown order|-2013\b|-2011\b/i;
const geriCekilmeHatasiMi = (e) => !!(e && e.kod === 'GERI_CEKILME');

/** ATR(n) / son kapanış — Wilder değil, basit ortalama (ölçümle aynı). */
function atrYuzde(mumlar, n = ATR_N) {
  if (!mumlar || mumlar.length < n + 1) return null;
  let t = 0;
  for (let j = mumlar.length - n; j < mumlar.length; j++) {
    const m = mumlar[j], o = mumlar[j - 1].close;
    t += Math.max(m.high - m.low, Math.abs(m.high - o), Math.abs(m.low - o));
  }
  const son = mumlar[mumlar.length - 1].close;
  return son > 0 ? t / n / son : null;
}

/**
 * Saf seviye hesabı.
 * @param yon 'long' | 'short'
 * @param dcaTaban long için en derin bekleyen DCA alış fiyatı (yoksa null)
 */
function seviye({ yon, mark, atrY, k = 6, dcaTaban = null }) {
  if (!(mark > 0) || !(atrY > 0)) return null;
  if (yon === 'long') {
    let s = mark * (1 - k * atrY);
    if (dcaTaban > 0) s = Math.min(s, dcaTaban - atrY * mark);
    return s > 0 ? s : null;
  }
  return mark * (1 + k * atrY);
}

const emirFiyati = (o) => +(o.triggerPrice ?? o.stopPrice ?? (o.info && (o.info.triggerPrice ?? o.info.stopPrice))) || null;

class KorumaEmri {
  /**
   * @param yurutucu CanliYurutucu
   * @param ayar { dizin, k (6), tolerans (0,005 — bu kadar yakın seviye yeniden konmaz), kaydet,
   *               bildir(tur, baslik, satirlar, secenek) | null, dcaTabanFn(symbol) | null, etkin (true) }
   */
  constructor(yurutucu, ayar = {}) {
    this.y = yurutucu;
    this.ayar = { k: 6, tolerans: 0.005, etkin: true, ...ayar };
    this.kaydet = ayar.kaydet || (() => {});
    this.dosya = ayar.dizin ? path.join(ayar.dizin, 'koruma.json') : null;
    this.durum = { sayac: 0, stoplar: {}, sonGuncelleme: null, sonDenetim: null, olaylar: [] };
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

  aktif() {
    const b = this.y.borsa;
    return !!(this.ayar.etkin && b && b.kagit !== true);
  }

  _olay(tur, symbol, metin) {
    this.durum.olaylar = [...(this.durum.olaylar || []), { zaman: Date.now(), tur, symbol, metin }].slice(-100);
  }

  async _bildir(tur, baslik, satirlar, anahtar) {
    if (!this.ayar.bildir) return;
    try { await this.ayar.bildir(tur, baslik, satirlar, { anahtar }); } catch { /* bildirim botu durdurmaz */ }
  }

  /** Borsa görünümü: yürütücünün geri çekilme kapısından (F2 — 418 ban'da istek atılmaz); yalın test yürütücüsünde borsanın kendisi. */
  _b() { return (typeof this.y.kapiliBorsa === 'function' && this.y.kapiliBorsa()) || this.y.borsa; }
  _geriCekilmede() { return typeof this.y.geriCekilmede === 'function' && this.y.geriCekilmede(); }
  _uyu(ms) { return typeof this.y.uyu === 'function' ? this.y.uyu(ms) : Promise.resolve(); }
  _tekrarMs() { return this.ayar.bulunamadiTekrarMs || (this.y.ayar && this.y.ayar.bulunamadiTekrarMs) || [500, 2000]; }

  async _netler() {
    const ps = await this._b().fetchPositions();
    if (!Array.isArray(ps)) throw new Error(`fetchPositions geçersiz cevap (${typeof ps})`);
    const net = {};
    for (const p of ps) {
      const q = Math.abs(+p.contracts || 0);
      if (q > 0) net[p.symbol] = (net[p.symbol] || 0) + (p.side === 'short' ? -q : q);
    }
    for (const s of Object.keys(net)) if (Math.abs(net[s]) < 1e-12) delete net[s];
    return net;
  }

  /** Bizim açık koşullu emirlerimiz: { symbol: [emir] }. */
  async acikStoplar() {
    const liste = await this._b().fetchOpenOrders(undefined, undefined, undefined, { trigger: true });
    if (!Array.isArray(liste)) throw new Error(`koşullu emir listesi geçersiz cevap (${typeof liste})`);
    const o = {};
    for (const e of liste) {
      if (typeof e.clientOrderId !== 'string' || !e.clientOrderId.startsWith(ONEK)) continue;
      (o[e.symbol] = o[e.symbol] || []).push(e);
    }
    return o;
  }

  async _mark(symbol) {
    try {
      const m = await this._b().fetchMarkPrice(symbol);
      return +(m.markPrice || (m.info && m.info.markPrice)) || null;
    } catch { return null; }
  }

  /**
   * Stopla korunacak pay. null → bu sembolde stop yok (hariç pay tüm neti kapsıyor ya da kalan asgari altı).
   * { tam: true } → closePosition · { tam: false, miktar } → reduceOnly miktarlı.
   */
  _korunan(symbol, q) {
    const haric = this.ayar.haricFn ? (+this.ayar.haricFn(symbol) || 0) : 0;
    if (Math.abs(haric) < 1e-12) return { tam: true, miktar: null };
    const p = q - haric;
    const m = this.y.borsa.markets && this.y.borsa.markets[symbol];
    const minQ = (m && m.limits && m.limits.amount && m.limits.amount.min) || 0;
    const adim = (m && m.precision && m.precision.amount) || 0;
    if (Math.sign(p) !== Math.sign(q)) return null;
    let mq = Math.abs(p);
    if (adim > 0) mq = Math.floor(mq / adim + 1e-9) * adim;
    mq = +mq.toFixed(12);
    if (!(mq > 0) || mq < minQ) return null;
    return { tam: false, miktar: mq, haric };
  }

  async _koy(symbol, side, fiyat, miktar = null) {
    const b = this._b();
    const id = kimlik.uret(BOT, ++this.durum.sayac);
    this._yaz();                                   // sayaç önce kalıcı — aynı kimlik iki kez üretilmez
    const p = b.priceToPrecision ? +b.priceToPrecision(symbol, fiyat) : fiyat;
    const params = { clientOrderId: id, triggerPrice: p, workingType: 'MARK_PRICE', priceProtect: true };
    const hedge = this.y.pozisyonModu === 'hedge';
    if (hedge) params.positionSide = side === 'sell' ? 'LONG' : 'SHORT';
    if (miktar == null) params.closePosition = true;
    else if (!hedge) params.reduceOnly = true;      // hedge modda reduceOnly gönderilemez (-1106); yön positionSide ile
    let o;
    try { o = await b.createOrder(symbol, 'STOP_MARKET', side, miktar == null ? undefined : miktar, undefined, params); } catch (e) {
      return this._koyBelirsiz(e, { symbol, id, fiyat: p, miktar });
    }
    if (!o || typeof o !== 'object' || o.id == null) return this._koyBelirsiz(new Error(`createOrder geçersiz/boş cevap: ${JSON.stringify(o)}`.slice(0, 120)), { symbol, id, fiyat: p, miktar });
    return { id, borsaId: o.id, fiyat: p, miktar };
  }

  /**
   * Stop koyma hatası (F2): istek atılmadıysa (geri çekilme) ya da kesin redse (-4130/-2021/-4120, kesin-red sınıfı)
   * hata aynen atılır. BELİRSİZSE (-1006/-1000/-1001/-1007, 5xx, ağ, 429, bozuk gövde) emir borsada OLABİLİR →
   * aynı clientAlgoId ile sorulur ("yok" cevabı kısa aralıklarla yeniden sorulur): VAR → kondu sayılır; YOK →
   * `stopKonmadi` (yeniden deneme serbest); OKUNAMADI → `stopBelirsiz` (çağıran ikinci stop KOYMAZ, kimliği
   * kaydeder; sonraki denetim borsadaki listeden çözer).
   */
  async _koyBelirsiz(e, k) {
    const msj = String((e && e.message) || '');
    if (geriCekilmeHatasiMi(e) || STOP_KESIN_RED.test(msj) || hataSinifi(e) === 'RED') throw e;
    const d = await this._stopDogrula(k.symbol, k.id, true);
    if (d === 'acik' || d === 'kapali') {
      this.kaydet('WARN', `Felaket stopu ${k.id}: cevap belirsiz (${msj.slice(0, 80)}) ama borsada VAR — kondu sayıldı`);
      return { id: k.id, borsaId: null, fiyat: k.fiyat, miktar: k.miktar, belirsizdi: true };
    }
    if (d === 'yok') { try { e.stopKonmadi = true; } catch { /* */ } throw e; }
    const h = new Error(`felaket stopu sonucu BELİRSİZ (${msj.slice(0, 120)}) — borsada olabilir; ikinci stop konmadı, sonraki denetim sorgular`);
    Object.assign(h, { stopBelirsiz: true, stopId: k.id, stopFiyat: k.fiyat, stopMiktar: k.miktar, asil: e });
    this.kaydet('ERROR', h.message);
    throw h;
  }

  /**
   * Stopun borsadaki hâli: 'acik' | 'kapali' (bulundu, açık değil — tetiklendi/iptal) | 'yok' (açık listede yok,
   * tek sorgu da bulamadı ya da desteklemiyor) | null (okunamadı — geri çekilme/ağ).
   */
  async _stopSorgu(symbol, id) {
    let tek = null;
    try {
      const o = await this._b().fetchOrder(undefined, symbol, { clientOrderId: id, trigger: true });
      if (o && typeof o === 'object' && (o.clientOrderId == null || o.clientOrderId === id)) {
        const ham = String((o.info && (o.info.algoStatus || o.info.status)) || '').toUpperCase();
        if (o.status === 'open' || /^(NEW|PARTIALLY_FILLED)$/.test(ham)) return 'acik';
        if (o.status || ham) return 'kapali';
      }
    } catch (e) {
      if (geriCekilmeHatasiMi(e)) return null;
      if (hataSinifi(e) === 'BULUNAMADI' || BULUNAMADI_METIN.test(String((e && e.message) || ''))) tek = 'yok';
    }
    try {
      const acik = await this.acikStoplar();
      return Object.values(acik).some(l => l.some(x => x.clientOrderId === id)) ? 'acik' : 'yok';
    } catch { return tek; }
  }

  /** Belirsiz koymadan sonra: "yok" kısa aralıklarla yeniden sorulur (emir sorguda geç görünebilir); okunamadı → hemen null. */
  async _stopDogrula(symbol, id, tekrarli) {
    const bekle = tekrarli ? this._tekrarMs() : [];
    let d = await this._stopSorgu(symbol, id);
    for (let i = 0; d === 'yok' && i < bekle.length; i++) {
      await this._uyu(bekle[i]);
      d = await this._stopSorgu(symbol, id);
    }
    return d;
  }

  /** Borsadaki emir korunan payla aynı mı (tam ↔ closePosition, kısmi ↔ miktar). */
  _ayniPay(e, kp) {
    const tamMi = e.closePosition === true || (e.info && (e.info.closePosition === true || e.info.closePosition === 'true')) || !(+e.amount > 0);
    if (kp.tam) return tamMi;
    if (tamMi) return false;
    return Math.abs(+e.amount - kp.miktar) <= Math.max(1e-12, kp.miktar * 0.01);
  }

  /** İptal; cevap belirsiz/"bilinmeyen emir" ise stop sorgulanır — artık açık değilse iptal sayılır, açıksa hata (F2). */
  async _iptal(symbol, emir) {
    try { await this._b().cancelOrder(emir.id, symbol, { trigger: true }); } catch (e) {
      if (geriCekilmeHatasiMi(e)) throw e;
      const d = await this._stopSorgu(symbol, emir.clientOrderId);
      if (d === 'yok' || d === 'kapali') { this.kaydet('WARN', `Felaket stopu ${emir.clientOrderId}: iptal cevabı belirsiz (${String(e.message).slice(0, 80)}) — sorgu: açık değil, iptal sayıldı`); return; }
      throw e;
    }
  }

  /**
   * Günlük çalışmadan sonra: her net pozisyonun stopunu bugünün mark'ına çapalar.
   * @returns { konan, korunan, iptal, hatalar, atlandi? }
   */
  async guncelle(simdi = Date.now()) {
    const rapor = { zaman: simdi, konan: [], korunan: [], iptal: [], hatalar: [], kaybolan: [] };
    if (!this.aktif()) { rapor.atlandi = this.y.borsa && this.y.borsa.kagit ? 'kâğıt borsa' : 'kapalı'; return rapor; }
    if (this._geriCekilmede()) {
      // 418/429 geri çekilmesi: borsaya istek yok; güncelleme bekliyor işaretlenir, geri çekilme bitince denetim tamamlar.
      rapor.atlandi = 'geri çekilme';
      this.durum.guncellemeBekliyor = true; this._yaz();
      this.kaydet('WARN', 'Felaket stopu güncellemesi ertelendi (geri çekilme sürüyor) — süre bitince saatlik denetim tamamlar');
      return rapor;
    }
    const [net, acik] = await Promise.all([this._netler(), this.acikStoplar()]);
    await this._kayiplariBul(net, acik, rapor);
    rapor.haric = [];

    for (const [symbol, q] of Object.entries(net)) {
      const yon = q > 0 ? 'long' : 'short', side = q > 0 ? 'sell' : 'buy';
      const kp = this._korunan(symbol, q);
      if (!kp) {
        // Hariç pay tüm neti kapsıyor: bu sembolde stop olmamalı.
        for (const e of acik[symbol] || []) {
          try { await this._iptal(symbol, e); rapor.iptal.push({ symbol, id: e.clientOrderId }); } catch (err) { rapor.hatalar.push({ symbol, hata: `iptal: ${err.message}` }); }
        }
        delete this.durum.stoplar[symbol];
        rapor.haric.push({ symbol, net: q });
        continue;
      }
      try {
        const mumlar = await kapanmisGunlukMumlar(this._b(), symbol, simdi, ATR_N + 5);
        // 69.6 (O2): ATR'nin mumları da veri kapısından geçer (bozuk mum stopu kaldırmasın / çok uzağa koymasın) — geçmezse
        // bu sembolde stop güncellenmez (hata; borsadaki mevcut stop yerinde kalır). ATR %90/k ile kırpılır: long stop ≥ mark × 0,1.
        const vk = mumKapisi(mumlar, simdi, { sicrama: 3, dusus: 0.8, pencere: ATR_N + 5, fiyatPencere: ATR_N + 5 });
        if (!vk.gecerli) throw new Error(`veri kapısı: ${vk.sebep} — stop güncellenmedi`);
        const atrHam = atrYuzde(mumlar);
        const atrY = atrHam > 0 ? Math.min(atrHam, 0.9 / (this.ayar.k || 6)) : atrHam;
        const mark = await this._mark(symbol);
        const dcaTaban = yon === 'long' && this.ayar.dcaTabanFn ? this.ayar.dcaTabanFn(symbol) : null;
        const hedef = seviye({ yon, mark, atrY, k: this.ayar.k, dcaTaban });
        if (!hedef) throw new Error(`seviye hesaplanamadı (mark ${mark}, ATR% ${atrY})`);
        const mevcut = acik[symbol] || [];
        const uygun = mevcut.find(e => e.side === side && this._ayniPay(e, kp) && Math.abs(emirFiyati(e) / hedef - 1) <= this.ayar.tolerans);
        const fazla = mevcut.filter(e => e !== uygun);
        if (uygun) {
          rapor.korunan.push({ symbol, fiyat: emirFiyati(uygun) });
          this.durum.stoplar[symbol] = { ...(this.durum.stoplar[symbol] || {}), id: uygun.clientOrderId, side, fiyat: emirFiyati(uygun), yon, miktar: kp.miktar, net: q, zaman: simdi, belirsiz: false };
        } else {
          // Önce yenisi, sonra eskisi iptal: arada korumasız an olmasın. Borsa aynı yönde ikinci
          // closePosition emrini reddederse eskiler iptal edilip bir kez daha denenir.
          let k;
          try { k = await this._koy(symbol, side, hedef, kp.miktar); } catch (ilk) {
            // Eskileri iptal edip yeniden deneme YALNIZ ilk stop kesin konmadıysa (kesin red ya da sorgu "yok");
            // belirsizde yeni stop borsada olabilir → körlemesine ikinci stop KONMAZ (F2).
            if (!fazla.length || ilk.stopBelirsiz || geriCekilmeHatasiMi(ilk)) throw ilk;
            for (const e of fazla.splice(0)) { await this._iptal(symbol, e); rapor.iptal.push({ symbol, id: e.clientOrderId }); }
            k = await this._koy(symbol, side, hedef, kp.miktar);
          }
          this.durum.stoplar[symbol] = { id: k.id, side, fiyat: k.fiyat, yon, miktar: kp.miktar, net: q, mark, atrY, dcaTaban, zaman: simdi };
          rapor.konan.push({ symbol, yon, fiyat: k.fiyat, mark, miktar: kp.miktar, uzaklik: Math.abs(k.fiyat / mark - 1) });
          this._olay('kondu', symbol, `${yon} stop ${k.fiyat}${kp.miktar != null ? ` (yalnız ${kp.miktar} — hariç pay ${kp.haric})` : ''} (mark ${mark}, %${(Math.abs(k.fiyat / mark - 1) * 100).toFixed(1)})`);
        }
        for (const e of fazla) { await this._iptal(symbol, e); rapor.iptal.push({ symbol, id: e.clientOrderId }); }
      } catch (e) {
        if (e && e.stopBelirsiz) {
          this.durum.stoplar[symbol] = { id: e.stopId, side, fiyat: e.stopFiyat, yon, miktar: kp.miktar, net: q, zaman: simdi, belirsiz: true };
          rapor.hatalar.push({ symbol, hata: e.message, belirsiz: true });
        } else rapor.hatalar.push({ symbol, hata: e.message });
        this._olay('hata', symbol, e.message);
      }
    }
    // Pozisyonu kalmayan sembolün stopu: iptal (closePosition sonradan açılacak pozisyonu kapatırdı).
    for (const [symbol, emirler] of Object.entries(acik)) {
      if (net[symbol]) continue;
      for (const e of emirler) {
        try { await this._iptal(symbol, e); rapor.iptal.push({ symbol, id: e.clientOrderId }); } catch (err) { rapor.hatalar.push({ symbol, hata: `iptal: ${err.message}` }); }
      }
      delete this.durum.stoplar[symbol];
    }
    for (const s of Object.keys(this.durum.stoplar)) if (!net[s]) delete this.durum.stoplar[s];
    this.durum.guncellemeBekliyor = false;
    this.durum.sonGuncelleme = { zaman: simdi, konan: rapor.konan.length, korunan: rapor.korunan.length, iptal: rapor.iptal.length, hatalar: rapor.hatalar };
    this._yaz();
    if (rapor.konan.length || rapor.iptal.length) this.kaydet('INFO', `Felaket stopu: ${rapor.konan.length} kondu, ${rapor.korunan.length} yerinde, ${rapor.iptal.length} iptal`);
    if (rapor.hatalar.length) {
      this.kaydet('ERROR', `Felaket stopu KONAMADI: ${rapor.hatalar.map(h => `${h.symbol.split('/')[0]} ${h.hata}`).join(' · ')}`);
      await this._bildir('alarm', 'felaket stopu konamadı', rapor.hatalar.map(h => `${h.symbol}: ${h.hata}`), `fs-hata:${rapor.hatalar.map(h => h.symbol).join(',')}`);
    }
    return rapor;
  }

  /**
   * Emrin borsadaki son durumu: 'tetiklendi' | 'iptal' | null (okunamadı). Binance algo emri
   * `algoStatus` taşır (TRIGGERED / FINISHED / CANCELED / EXPIRED); ccxt `status` de denenir.
   */
  async _emirDurumu(symbol, id) {
    try {
      const o = await this._b().fetchOrder(undefined, symbol, { clientOrderId: id, trigger: true });
      const ham = String((o.info && (o.info.algoStatus || o.info.status)) || '').toUpperCase();
      if (/TRIGGER|FINISH|FILLED/.test(ham) || o.status === 'closed' || o.status === 'triggered') return 'tetiklendi';
      if (/CANCEL|EXPIRE|REJECT/.test(ham) || ['canceled', 'cancelled', 'expired', 'rejected'].includes(o.status)) return 'iptal';
      return null;
    } catch { return null; }
  }

  /** Kayıtlı stopu borsada artık olmayan semboller: tetiklendi ya da elle iptal edildi. */
  async _kayiplariBul(net, acik, rapor) {
    for (const [symbol, s] of Object.entries(this.durum.stoplar || {})) {
      if ((acik[symbol] || []).some(e => e.clientOrderId === s.id)) continue;
      const kalan = net[symbol] || 0;
      let durum = await this._emirDurumu(symbol, s.id);
      if (s.belirsiz && durum !== 'tetiklendi') {
        // Sonucu belirsiz konmuş stop borsada yok → hiç konmamış: alarm yok, kayıt silinir, denetim yeniden koyar.
        delete this.durum.stoplar[symbol];
        this._olay('belirsiz-yok', symbol, `belirsiz stop ${s.id} borsada yok — konmamış; yeniden konacak`);
        this.kaydet('WARN', `Felaket stopu: ${symbol} belirsiz stop ${s.id} borsada yok (konmamış) — yeniden konacak`);
        continue;
      }
      if (!durum) {
        // Okunamadı → pozisyondan tahmin: tam stopta pozisyon sıfır; kısmi stopta net en az stop miktarının yarısı kadar azaldı.
        const azaldi = s.miktar != null && s.net != null && Math.abs(kalan) <= Math.abs(s.net) - s.miktar * 0.5;
        durum = kalan === 0 || azaldi ? 'tetiklendi' : 'iptal';
      }
      const tetik = durum === 'tetiklendi';
      const metin = tetik
        ? `${symbol} felaket stopu TETİKLENDİ (seviye ${s.fiyat}${s.miktar != null ? `, ${s.miktar} adet` : ''}). Kol mutabakatı uyuşmazlık verecek: kontrol edip acil durdurma ya da düzeltme gerekir.`
        : `${symbol} felaket stopu borsada yok, tetiklenmedi (elle iptal?) — yeniden konuyor.`;
      rapor.kaybolan.push({ symbol, fiyat: s.fiyat, tetiklendi: tetik, pozisyonKaldi: kalan !== 0 });
      this._olay(tetik ? 'tetiklendi' : 'kayboldu', symbol, metin);
      this.kaydet(tetik ? 'ERROR' : 'WARN', `Felaket stopu: ${metin}`);
      this._bildir('alarm', tetik ? 'felaket stopu tetiklendi' : 'felaket stopu kayboldu', [metin], `fs-kayip:${symbol}:${s.id}`);
      if (tetik) delete this.durum.stoplar[symbol];
    }
  }

  /**
   * Saatlik denetim (ağ çağrısı: pozisyonlar + koşullu emirler). Stopsuz pozisyon → kayıtlı
   * seviyeden yeniden konur; kayıt yoksa ya da seviye mark'ın yanlış tarafındaysa tam `guncelle`.
   */
  async denetle(simdi = Date.now()) {
    const rapor = { zaman: simdi, konan: [], korunan: [], iptal: [], hatalar: [], kaybolan: [] };
    if (!this.aktif()) { rapor.atlandi = 'kapalı'; return rapor; }
    // Geri çekilmede istek yok; sonDenetim güncellenmez → süre bitince ilk tik denetler (F2).
    if (this._geriCekilmede()) { rapor.atlandi = 'geri çekilme'; return rapor; }
    const [net, acik] = await Promise.all([this._netler(), this.acikStoplar()]);
    await this._kayiplariBul(net, acik, rapor);
    let tamGerekli = !!this.durum.guncellemeBekliyor;
    for (const [symbol, q] of Object.entries(net)) {
      const side = q > 0 ? 'sell' : 'buy';
      const kp = this._korunan(symbol, q);
      if (!kp) continue;                                          // hariç pay — stop yok (fazlasını guncelle temizler)
      const yerinde = (acik[symbol] || []).filter(e => e.side === side);
      if (yerinde.length) {
        const s0 = this.durum.stoplar[symbol];
        if (s0 && s0.belirsiz && yerinde.some(e => e.clientOrderId === s0.id)) s0.belirsiz = false;   // belirsiz stop borsada bulundu
        rapor.korunan.push({ symbol }); continue;
      }
      const s = this.durum.stoplar[symbol];
      const mark = await this._mark(symbol);
      const gecerli = s && s.side === side && mark > 0 && (side === 'sell' ? s.fiyat < mark : s.fiyat > mark);
      if (!gecerli) { tamGerekli = true; continue; }
      try {
        const k = await this._koy(symbol, side, s.fiyat, kp.miktar);
        this.durum.stoplar[symbol] = { ...s, id: k.id, miktar: kp.miktar, net: q, zaman: simdi };
        rapor.konan.push({ symbol, fiyat: k.fiyat });
        this._olay('yeniden', symbol, `stop yeniden kondu ${k.fiyat}`);
      } catch (e) {
        if (e && e.stopBelirsiz) this.durum.stoplar[symbol] = { ...s, id: e.stopId, miktar: kp.miktar, net: q, zaman: simdi, belirsiz: true };
        rapor.hatalar.push({ symbol, hata: e.message, ...(e && e.stopBelirsiz ? { belirsiz: true } : {}) });
      }
    }
    this.durum.sonDenetim = { zaman: simdi, konan: rapor.konan.length, korunan: rapor.korunan.length, hatalar: rapor.hatalar };
    this._yaz();
    if (tamGerekli) {
      const g = await this.guncelle(simdi);
      return { ...g, kaybolan: [...rapor.kaybolan, ...g.kaybolan], konan: [...rapor.konan, ...g.konan], hatalar: [...rapor.hatalar, ...g.hatalar] };
    }
    if (rapor.hatalar.length) {
      this.kaydet('ERROR', `Felaket stopu denetimi: ${rapor.hatalar.map(h => `${h.symbol.split('/')[0]} ${h.hata}`).join(' · ')}`);
      await this._bildir('alarm', 'felaket stopu konamadı', rapor.hatalar.map(h => `${h.symbol}: ${h.hata}`), `fs-hata:${rapor.hatalar.map(h => h.symbol).join(',')}`);
    }
    return rapor;
  }

  /** Saatte bir mi? (`_tik` her dakika çağırır.) */
  denetimZamani(simdi = Date.now()) {
    // Geri çekilme yüzünden ertelenmiş güncelleme (yeni pozisyon stopsuz olabilir) saati BEKLEMEZ: süre biter
    // bitmez ilk tik denetler → tam güncelleme (denetim F1+F2; önce en çok 1 sa korumasız kalabiliyordu).
    if (this.durum.guncellemeBekliyor) return true;
    const s = this.durum.sonDenetim && this.durum.sonDenetim.zaman;
    return !s || simdi - s >= SAAT;
  }

  /** Acil durdurma: bizim TÜM koşullu emirlerimiz iptal. */
  async hepsiniIptal() {
    const rapor = { iptal: 0, hatalar: [] };
    if (!this.aktif()) return rapor;
    let acik = {};
    try { acik = await this.acikStoplar(); } catch (e) { rapor.hatalar.push(`koşullu emirler: ${e.message}`); return rapor; }
    for (const [symbol, emirler] of Object.entries(acik)) {
      for (const e of emirler) {
        try { await this._iptal(symbol, e); rapor.iptal++; } catch (err) { rapor.hatalar.push(`iptal ${e.clientOrderId}: ${err.message}`); }
      }
    }
    this.durum.stoplar = {};
    this._olay('acil', null, `${rapor.iptal} felaket stopu iptal`);
    this._yaz();
    return rapor;
  }

  ozet() {
    return {
      aktif: this.aktif(), k: this.ayar.k, stoplar: this.durum.stoplar,
      sonGuncelleme: this.durum.sonGuncelleme, sonDenetim: this.durum.sonDenetim,
      olaylar: (this.durum.olaylar || []).slice(-20),
    };
  }
}

module.exports = { KorumaEmri, atrYuzde, seviye, ONEK };
