/**
 * HESAP İŞLEMLERİ — hesap düzeyinde KAPSAYICI kayıt: borsadaki TÜM dolumlar ve funding ödemeleri.
 *
 * Dosya `data/live/hesap-islemleri.jsonl` — YALNIZ EKLENİR, her satır tekil `anahtar` taşır
 * (aynı işlem ikinci kez yazılmaz → boşluk doldurma idempotent).
 *
 * Satır türleri:
 *   · `islem`   — fetchMyTrades: hesap, sembol, yön, miktar, fiyat, ücret, gerçekleşen K/Z (borsa veriyorsa),
 *                 kaynak (hucum / denge / donchianBot / elle / acil / bilinmeyen)
 *   · `funding` — fetchFundingHistory (Binance gelir geçmişi FUNDING_FEE): sembol, tutar (+ alınan / − ödenen)
 *   · ÇOKLU VARLIK hesabı (senkron({ spot: { varlik: 'BTC' } }) — gerçek parada BTC spot alınıp vadeli teminata aktarılır;
 *     denetim D5, 62.2 — G8 vergi kaydı için borsadan, botun kendi defterinden bağımsız):
 *     · `spot`    — privateGetMyTrades (BTCUSDT spot dolumları; Binance penceresi ≤ 24 saat): yön, miktar, fiyat, ücret
 *     · `aktarim` — sapiGetAssetTransfer (MAIN_UMFUTURE / UMFUTURE_MAIN): varlık, miktar, tranId, durum
 *     · `cevrim`  — fapiPrivateGetIncome AUTO_EXCHANGE (eksi USDT'yi Binance'in BTC teminattan otomatik çevirmesi): varlık, tutar
 *
 * KAYNAK SINIFLAMASI (yazım anında, sonra değişmez):
 *   1. Emir bilinen bir defterde (borsa emir no ya da clientOrderId) → o defterin sahibi;
 *      defterde etiket `acil`/`ad` → acil; Borsa sekmesi defterinde `pnl` → elle.
 *   2. Yoksa clientOrderId öneki (borsa veriyorsa; vermiyorsa sınırlı sayıda fetchOrder ile sorulur):
 *      ag-acil-/ag-ad- → acil · ag-pnl- → elle · ag-dc- → donchianBot · başka ag- → bilinmeyen ·
 *      ag- dışı (web_, android_, ios_ …) → elle · hiç yok → bilinmeyen.
 *
 * GERİ ÇEKİLME (F2): çağıran `borsa` olarak yürütücünün `kapiliBorsa()`sını verir — 418 ban'da istek atılmaz
 * (GeriCekilmeHatasi); ilk böyle hatada tur kesilir (`atlandi: 'geri çekilme'`), kayıt yarım kalmaz (yalnız ekler).
 *
 * BOŞLUK DOLDURMA: her (hesap, sembol) için son kaydın zamanından (yoksa `baslangicGun` önce) bugüne,
 * 7 günlük pencerelerle (Binance userTrades sınırı) — sunucu kapalı kaldıysa açılışta tamamlanır.
 * Binance fetchMyTrades sembol İSTER: sembol listesi = defterler + açık pozisyon + açık emir +
 * funding geçmişi + daha önce kaydedilmiş semboller + çağıranın verdikleri.
 */
const fs = require('fs');
const path = require('path');

const GUN = 864e5;
const PENCERE = 7 * GUN - 1;

const temel = (s) => String(s || '').split(':')[0];
/** Yürütücünün geri çekilme kapısı isteği atmadı (418/429) — tur burada kesilir, bir sonraki senkron tamamlar (F2). */
const geriCekilme = (e) => !!(e && e.kod === 'GERI_CEKILME');
class TurKesildi extends Error {}

function onekKaynak(cid) {
  if (!cid) return 'bilinmeyen';
  const m = /^ag-([a-z0-9]{1,8})-/.exec(String(cid));
  if (!m) return 'elle';                     // web_, android_, ios_ … : borsa arayüzünden elle
  if (m[1] === 'acil' || m[1] === 'ad') return 'acil';
  if (m[1] === 'pnl') return 'elle';
  if (m[1] === 'dc') return 'donchianBot';
  return 'bilinmeyen';
}

class HesapIslemleri {
  /** @param dosya jsonl yolu; null → yalnız bellek (testler) */
  constructor(dosya, ayar = {}) {
    this.dosya = dosya || null;
    this.baslangicGun = ayar.baslangicGun ?? 60;
    this.maxPencere = ayar.maxPencere ?? 30;          // sembol başına tur başına en çok pencere (~210 gün)
    this.maxSorgu = ayar.maxSorgu ?? 20;
    this.sayfaBoyu = ayar.sayfaBoyu ?? 1000;           // borsa sayfa boyu (Binance en çok 1000)               // tur başına fetchOrder sayısı (sınıflama için)
    this.kaydet = ayar.kaydet || (() => {});
    this.kayitlar = [];
    this.anahtarlar = new Set();
    this.sonDurum = {};                                 // hesap → son senkron özeti
    this._mesgul = false;
    if (this.dosya && fs.existsSync(this.dosya)) {
      for (const s of fs.readFileSync(this.dosya, 'utf8').split('\n')) {
        if (!s.trim()) continue;
        let k; try { k = JSON.parse(s); } catch { continue; }   // yarım son satır
        this._bellege(k);
      }
    }
  }

  _bellege(k) {
    if (!k || !k.anahtar || this.anahtarlar.has(k.anahtar)) return false;
    this.anahtarlar.add(k.anahtar);
    this.kayitlar.push(k);
    return true;
  }

  _ekle(k) {
    if (this.anahtarlar.has(k.anahtar)) return false;
    if (this.dosya) {
      fs.mkdirSync(path.dirname(this.dosya), { recursive: true });
      fs.appendFileSync(this.dosya, JSON.stringify(k) + '\n', 'utf8');
    }
    return this._bellege(k);
  }

  /** (hesap, sembol, tür) için son kayıt zamanı. */
  _sonZaman(hesap, tur, symbol = null) {
    let t = null;
    for (const k of this.kayitlar) if (k.hesap === hesap && k.tur === tur && (!symbol || k.symbol === symbol) && (t == null || k.zaman > t)) t = k.zaman;
    return t;
  }

  /** Defterlerden borsa emir no / clientOrderId → { kaynak, bot } haritası. */
  static emirHaritasi(defterler) {
    const m = new Map();
    for (const { kaynak, defter } of defterler || []) {
      if (!defter || !defter.emirler) continue;
      for (const e of defter.emirler.values()) {
        const k = e.bot === 'acil' || e.bot === 'ad' ? 'acil' : (e.bot === 'pnl' ? 'elle' : kaynak);
        const v = { kaynak: k, bot: e.bot || null, neden: e.neden || null, emirId: e.id };
        m.set(`c:${e.id}`, v);
        if (e.borsaId != null) m.set(`o:${e.borsaId}`, v);
      }
    }
    return m;
  }

  /** Pencereli çekim: fn(since, endTime) → dizi. Dolu sayfada aynı pencerede devam eder. */
  async _pencereli(fn, since, simdi, limit) {
    const tum = [];
    let imlec = since, n = 0;
    while (imlec <= simdi && n < this.maxPencere) {
      n++;
      const bitis = Math.min(imlec + PENCERE, simdi);
      const r = (await fn(imlec, bitis)) || [];
      const icinde = r.filter(x => x && x.timestamp >= imlec && x.timestamp <= bitis);
      tum.push(...icinde);
      if (r.length >= limit && icinde.length) imlec = Math.max(...icinde.map(x => x.timestamp)) + 1;
      else imlec = bitis + 1;
    }
    return { liste: tum, tamamlandi: imlec > simdi };
  }

  /**
   * Bir hesabı borsayla eşitler (yalnız ekler). Hata atmaz.
   * @param p { hesap ('testnet' | 'live' | 'kagit-hucum' …), borsa (ccxt benzeri), defterler [{ kaynak, defter }],
   *            ekSemboller [], simdi }
   */
  async senkron({ hesap, borsa, defterler = [], ekSemboller = [], spot = null, simdi = Date.now() }) {
    const ozet = { hesap, zaman: simdi, yeniIslem: 0, yeniFunding: 0, semboller: 0, hatalar: [] };
    if (!borsa || typeof borsa.fetchMyTrades !== 'function') { ozet.atlandi = 'borsa fetchMyTrades desteklemiyor'; return ozet; }
    if (this._mesgul) { ozet.atlandi = 'başka senkron sürüyor'; return ozet; }
    this._mesgul = true;
    const kes = (e, etiket) => { if (geriCekilme(e)) throw new TurKesildi(e.message); ozet.hatalar.push(`${etiket}: ${e.message}`); };
    try {
      const bas0 = simdi - this.baslangicGun * GUN;
      const harita = HesapIslemleri.emirHaritasi(defterler);
      const semboller = new Set(ekSemboller.filter(Boolean));
      for (const { defter } of defterler) if (defter && defter.emirler) for (const e of defter.emirler.values()) if (e.symbol && +e.dolan > 0) semboller.add(e.symbol);
      for (const k of this.kayitlar) if (k.hesap === hesap && k.symbol) semboller.add(k.symbol);
      try { for (const p of await borsa.fetchPositions()) if (Math.abs(+p.contracts || 0) > 0) semboller.add(p.symbol); } catch (e) { kes(e, 'pozisyonlar'); }
      try { for (const o of await borsa.fetchOpenOrders()) semboller.add(o.symbol); } catch (e) { kes(e, 'açık emirler'); }

      // 1. Funding (hesap düzeyi; sembolleri de keşfettirir)
      if (typeof borsa.fetchFundingHistory === 'function') {
        const son = this._sonZaman(hesap, 'funding');
        try {
          const { liste } = await this._pencereli((s, b) => borsa.fetchFundingHistory(undefined, s, this.sayfaBoyu, { endTime: b }), son != null ? son : bas0, simdi, this.sayfaBoyu);
          for (const f of liste) {
            if (!(Number.isFinite(+f.amount))) continue;
            if (f.symbol) semboller.add(f.symbol);
            if (this._ekle({ tur: 'funding', anahtar: `f:${hesap}:${f.id != null ? f.id : `${f.symbol}:${f.timestamp}`}`, hesap, zaman: f.timestamp, symbol: f.symbol || null,
              tutar: +f.amount, birim: f.code || 'USDT', kaynak: 'funding' })) ozet.yeniFunding++;
          }
        } catch (e) { kes(e, 'funding'); }
      }

      // 2. Dolumlar — sembol başına pencereli
      let sorgu = 0;
      for (const symbol of semboller) {
        const son = this._sonZaman(hesap, 'islem', symbol);
        try {
          const { liste } = await this._pencereli((s, b) => borsa.fetchMyTrades(symbol, s, this.sayfaBoyu, { endTime: b }), son != null ? son : bas0, simdi, this.sayfaBoyu);
          for (const t of liste.sort((a, b) => a.timestamp - b.timestamp)) {
            if (!t || t.id == null) continue;
            const anahtar = `t:${hesap}:${symbol}:${t.id}`;
            if (this.anahtarlar.has(anahtar)) continue;
            let cid = t.clientOrderId || (t.info && (t.info.clientOrderId || t.info.origClientOrderId)) || null;
            let b = (t.order != null && harita.get(`o:${t.order}`)) || (cid && harita.get(`c:${cid}`)) || null;
            if (!b && !cid && t.order != null && sorgu < this.maxSorgu && typeof borsa.fetchOrder === 'function') {
              sorgu++;
              try { const o = await borsa.fetchOrder(String(t.order), symbol); cid = (o && o.clientOrderId) || null; b = cid ? harita.get(`c:${cid}`) || null : null; } catch (e) { if (geriCekilme(e)) throw new TurKesildi(e.message); /* sınıflanamadı */ }
            }
            const kz = t.info && t.info.realizedPnl != null && Number.isFinite(+t.info.realizedPnl) ? +t.info.realizedPnl : null;
            if (this._ekle({ tur: 'islem', anahtar, hesap, zaman: t.timestamp, symbol, side: t.side, miktar: +t.amount, fiyat: +t.price,
              ucret: t.fee && t.fee.cost != null ? +t.fee.cost : null, ucretBirim: (t.fee && t.fee.currency) || null, kz,
              kaynak: b ? b.kaynak : onekKaynak(cid), neden: b ? b.neden : null, emirNo: t.order != null ? String(t.order) : null, clientOrderId: cid,
              tradeId: String(t.id) })) ozet.yeniIslem++;
          }
        } catch (e) { if (e instanceof TurKesildi) throw e; kes(e, temel(symbol)); }
      }
      ozet.semboller = semboller.size;

      // 3. Çoklu varlık (D5, 62.2): spot BTC işlemleri, cüzdanlar arası aktarımlar, otomatik çevrimler. Uç yoksa (kâğıt borsa) atlanır.
      if (spot && spot.varlik) await this._cokluVarlik({ hesap, borsa, varlik: spot.varlik, bas0, simdi, ozet, kes });
    } catch (e) {
      if (!(e instanceof TurKesildi)) throw e;
      ozet.atlandi = 'geri çekilme';
      ozet.hatalar.push(`geri çekilme — tur kesildi: ${e.message}`);
    } finally { this._mesgul = false; }
    ozet.hata = ozet.hatalar.length ? ozet.hatalar.join(' · ') : null;
    this.sonDurum[hesap] = ozet;
    if (ozet.yeniIslem || ozet.yeniFunding || ozet.yeniSpot || ozet.yeniAktarim || ozet.yeniCevrim) this.kaydet('INFO', `hesap işlemleri (${hesap}): ${ozet.yeniIslem} yeni dolum, ${ozet.yeniFunding} funding kaydı${spot ? `, ${ozet.yeniSpot || 0} spot, ${ozet.yeniAktarim || 0} aktarım, ${ozet.yeniCevrim || 0} otomatik çevrim` : ''}`);
    if (ozet.hata) this.kaydet('WARN', `hesap işlemleri (${hesap}): ${ozet.hata}`);
    return ozet;
  }

  /** D5 (62.2): çoklu varlık hesabının spot / aktarım / otomatik çevrim kayıtları (yalnız ekler, idempotent anahtarlar). */
  async _cokluVarlik({ hesap, borsa, varlik, bas0, simdi, ozet, kes }) {
    const SPOT_PENCERE = GUN - 1;   // Binance spot myTrades: startTime–endTime en çok 24 saat
    const pencereli = async (fn, since, adim) => {
      const tum = []; let imlec = since, n = 0;
      while (imlec <= simdi && n < this.maxPencere * 7) {
        n++;
        const bitis = Math.min(imlec + adim, simdi);
        const r = (await fn(imlec, bitis)) || [];
        tum.push(...r);
        imlec = bitis + 1;
      }
      return tum;
    };
    // Tarama imleci (bellekte): kayıt olmasa da taranan aralık yeniden taranmaz (15 dk'da bir 60 gün × 24 saatlik pencere olmasın).
    // Yeniden başlatmada bir kez baştan taranır; anahtarlar tekil olduğu için çift kayıt olmaz. 1 dk geri örtüşme.
    this._imlec = this._imlec || {};
    const basla = (anahtar, son) => Math.max(son != null && son >= 0 ? son + 1 : bas0, this._imlec[anahtar] || 0);
    const bitti = (anahtar) => { this._imlec[anahtar] = simdi - 60000; };
    ozet.yeniSpot = ozet.yeniSpot || 0; ozet.yeniAktarim = ozet.yeniAktarim || 0; ozet.yeniCevrim = ozet.yeniCevrim || 0;
    const ciftSembol = `${varlik}USDT`, gorunen = `${varlik}/USDT (spot)`;
    if (typeof borsa.privateGetMyTrades === 'function') {
      const son = this._sonZaman(hesap, 'spot');
      try {
        const l = await pencereli((s, b) => borsa.privateGetMyTrades({ symbol: ciftSembol, startTime: s, endTime: b, limit: 1000 }), basla(`${hesap}:spot`, son), SPOT_PENCERE);
        bitti(`${hesap}:spot`);
        for (const t of l) {
          if (!t || t.id == null) continue;
          if (this._ekle({ tur: 'spot', anahtar: `s:${hesap}:${ciftSembol}:${t.id}`, hesap, zaman: +t.time, symbol: gorunen, side: t.isBuyer ? 'buy' : 'sell',
            miktar: +t.qty, fiyat: +t.price, ucret: t.commission != null ? +t.commission : null, ucretBirim: t.commissionAsset || null, kz: null,
            kaynak: 'coklu-varlik', neden: 'spot BTC (vadeli teminat)', emirNo: t.orderId != null ? String(t.orderId) : null, clientOrderId: null, tradeId: String(t.id) })) ozet.yeniSpot++;
        }
      } catch (e) { kes(e, 'spot işlemleri'); }
    }
    if (typeof borsa.sapiGetAssetTransfer === 'function') {
      for (const tip of ['MAIN_UMFUTURE', 'UMFUTURE_MAIN']) {
        const son = this.kayitlar.filter(k => k.hesap === hesap && k.tur === 'aktarim' && k.side === tip).reduce((a, k) => Math.max(a, k.zaman), -1);
        try {
          const l = await pencereli(async (s, b) => { const r = await borsa.sapiGetAssetTransfer({ type: tip, startTime: s, endTime: b, size: 100 }); return (r && r.rows) || []; }, basla(`${hesap}:aktarim:${tip}`, son), 7 * GUN - 1);
          bitti(`${hesap}:aktarim:${tip}`);
          for (const x of l) {
            if (!x || x.tranId == null || String(x.status).toUpperCase() === 'FAILED') continue;
            if (this._ekle({ tur: 'aktarim', anahtar: `a:${hesap}:${x.tranId}`, hesap, zaman: +x.timestamp, symbol: x.asset || null, side: tip,
              miktar: +x.amount, fiyat: null, ucret: null, ucretBirim: null, kz: null, kaynak: 'coklu-varlik',
              neden: tip === 'MAIN_UMFUTURE' ? 'spot → vadeli (teminat)' : 'vadeli → spot', emirNo: null, clientOrderId: null, tradeId: String(x.tranId), durum: x.status || null })) ozet.yeniAktarim++;
          }
        } catch (e) { kes(e, `aktarımlar ${tip}`); }
      }
    }
    if (typeof borsa.fapiPrivateGetIncome === 'function') {
      const son = this._sonZaman(hesap, 'cevrim');
      try {
        const l = await pencereli((s, b) => borsa.fapiPrivateGetIncome({ incomeType: 'AUTO_EXCHANGE', startTime: s, endTime: b, limit: 1000 }), basla(`${hesap}:cevrim`, son), 7 * GUN - 1);
        bitti(`${hesap}:cevrim`);
        for (const x of l) {
          if (!x || !Number.isFinite(+x.income)) continue;
          if (this._ekle({ tur: 'cevrim', anahtar: `c:${hesap}:${x.tranId != null ? x.tranId : `${x.asset}:${x.time}`}`, hesap, zaman: +x.time, symbol: x.asset || null, side: +x.income >= 0 ? 'giris' : 'cikis',
            miktar: +x.income, fiyat: null, ucret: null, ucretBirim: null, kz: null, kaynak: 'otomatik-cevrim', neden: 'Binance otomatik çevrim (AUTO_EXCHANGE)',
            emirNo: null, clientOrderId: null, tradeId: x.tranId != null ? String(x.tranId) : null })) ozet.yeniCevrim++;
        }
      } catch (e) { kes(e, 'otomatik çevrim'); }
    }
  }

  /** Süzgeç: { hesap, bas (ms), bit (ms), symbol (temel ad da olur), kaynak, tur } */
  suz(f = {}) {
    return this.kayitlar.filter(k => (!f.hesap || k.hesap === f.hesap) && (!f.bas || k.zaman >= f.bas) && (!f.bit || k.zaman <= f.bit)
      && (!f.symbol || temel(k.symbol) === temel(f.symbol)) && (!f.kaynak || k.kaynak === f.kaynak) && (!f.tur || k.tur === f.tur))
      .sort((a, b) => b.zaman - a.zaman);
  }

  static toplamlar(satirlar) {
    const t = { islem: 0, ucret: 0, kz: 0, funding: 0, fundingSayi: 0 };
    for (const k of satirlar) {
      if (k.tur === 'funding') { t.funding += k.tutar || 0; t.fundingSayi++; continue; }
      if (k.tur === 'aktarim' || k.tur === 'cevrim') { t[k.tur] = (t[k.tur] || 0) + 1; continue; }   // D5: K/Z ve ücret toplamına girmez
      if (k.tur === 'spot') { t.spot = (t.spot || 0) + 1; if (k.ucret != null && k.ucretBirim === 'USDT') t.ucret += k.ucret; continue; }
      t.islem++;
      if (k.ucret != null && (!k.ucretBirim || k.ucretBirim === 'USDT')) t.ucret += k.ucret;
      if (k.kz != null) t.kz += k.kz;
    }
    t.net = t.kz - t.ucret + t.funding;
    return t;
  }

  liste(f = {}) {
    const sz = this.suz(f);
    const b = Math.min(500, Math.max(5, +f.boyut || 50));
    const toplamSayfa = Math.max(1, Math.ceil(sz.length / b));
    const p = Math.min(toplamSayfa, Math.max(1, +f.sayfa || 1));
    const hesapta = this.kayitlar.filter(k => !f.hesap || k.hesap === f.hesap);
    return {
      satirlar: sz.slice((p - 1) * b, p * b), toplam: sz.length, sayfa: p, toplamSayfa, boyut: b, toplamlar: HesapIslemleri.toplamlar(sz),
      semboller: [...new Set(hesapta.map(k => k.symbol).filter(Boolean))].sort(), kaynaklar: [...new Set(hesapta.map(k => k.kaynak))].sort(),
      hesaplar: [...new Set(this.kayitlar.map(k => k.hesap))].sort(), sonSenkron: f.hesap ? this.sonDurum[f.hesap] || null : null,
    };
  }

  /** CSV (UTF-8 BOM'lu — Excel Türkçe karakterleri doğru açsın; ayraç `;`, ondalık nokta). */
  csv(f = {}) {
    const kac = (v) => { if (v == null) return ''; const s = String(v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const bas = ['zaman_utc', 'hesap', 'tur', 'kaynak', 'sembol', 'yon', 'miktar', 'fiyat', 'nominal', 'ucret', 'ucret_birim', 'gerceklesen_kz', 'funding', 'sebep', 'emir_no', 'client_order_id', 'islem_no'];
    const satir = this.suz(f).slice().reverse().map(k => [new Date(k.zaman).toISOString(), k.hesap, k.tur, k.kaynak, k.symbol, k.side || '', k.miktar, k.fiyat,
      (k.tur === 'islem' || k.tur === 'spot') && k.miktar && k.fiyat ? +(k.miktar * k.fiyat).toFixed(8) : '', k.ucret, k.ucretBirim, k.kz, k.tur === 'funding' ? k.tutar : '', k.neden, k.emirNo, k.clientOrderId, k.tradeId].map(kac).join(';'));
    return '﻿' + [bas.join(';'), ...satir].join('\r\n') + '\r\n';
  }
}

module.exports = { HesapIslemleri, onekKaynak };
