'use strict';
/**
 * İLERİYE KAYIT — GERÇEKLEŞEN TASFİYELER (canlı akış, 73.3). KARAR VERMEZ; yalnız herkese açık tasfiye akışları.
 * ═══════════════════════════════════════════════════════════════════════════
 *   Binance  wss://fstream.binance.com/market/ws/!forceOrder@arr  (tüm USDⓈ-M; eski /ws/ adresi 2026-10'da sessiz — REST 404)
 *            Binance her sembol için saniyede en çok bir (son) tasfiyeyi yayımlar: bu bir ÖRNEKTİR, tam liste değil.
 *   OKX      wss://ws.okx.com:8443/ws/v5/public  {op:subscribe, args:[{channel:'liquidation-orders', instType:'SWAP'}]}  (tüm swap)
 *   Bybit    wss://stream.bybit.com/v5/public/linear  allLiquidation.<SEMBOL> (sembol başına; çekirdek + günün hacimli ilk 10'u)
 * Kalıcı bağlantı (Node yerleşik WebSocket — yeni paket yok). Kopunca artan bekleme (2 sn → 5 dk), 60 sn sağlam kalınca sıfırlanır;
 * sessizlik bekçisi (OKX/Bybit uygulama pingine cevap 90 sn gelmezse, Binance 15 dk hiç mesaj yoksa) yeniden bağlar.
 * Satırlar bellekte tamponlanır, DAKİKADA BİR toplu yazılır (tampon tavanı 50 000; aşılırsa en eskiler düşer ve sayılır).
 * Yeniden bağlanınca aynı tasfiyenin tekrar gelmesine karşı kısa ömürlü tekrar süzgeci (son ~20 000 anahtar).
 */

const ADRES = {
  binance: 'wss://fstream.binance.com/market/ws/!forceOrder@arr',
  okx: 'wss://ws.okx.com:8443/ws/v5/public',
  bybit: 'wss://stream.bybit.com/v5/public/linear',
};
const TAMPON_TAVAN = 50000;
const TEKRAR_TAVAN = 20000;

class TasfiyeAkisi {
  /**
   * @param o { WebSocket (kurucu; yoksa küresel), simdi, log, ekle(satirlar) → n, semboller: () => [bybit sembolleri],
   *            zamanla: (fn, ms) → kimlik, temizle: (kimlik) }
   */
  constructor(o = {}) {
    this.WS = o.WebSocket || globalThis.WebSocket;
    this.simdi = o.simdi || (() => Date.now());
    this.log = o.log || (() => {});
    this.ekle = o.ekle || (() => 0);
    this.semboller = o.semboller || (() => []);
    this.zamanla = o.zamanla || ((fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; });
    this.yineleZamanla = o.yineleZamanla || ((fn, ms) => { const t = setInterval(fn, ms); if (t.unref) t.unref(); return t; });
    this.temizle = o.temizle || ((t) => { clearTimeout(t); clearInterval(t); });
    this.akislar = {};
    this.tampon = [];
    this.dusen = 0;
    this._tekrar = new Set();
    this._tekrarSira = [];
    this.calisiyor = false;
  }

  destekli() { return typeof this.WS === 'function'; }

  baslat() {
    if (this.calisiyor) return;
    if (!this.destekli()) { this.log('WARN', '🧾 İleriye kayıt: bu Node sürümünde WebSocket yok — tasfiye akışı kapalı'); return; }
    this.calisiyor = true;
    for (const ad of Object.keys(ADRES)) this._ac(ad);
    this._bekci = this.yineleZamanla(() => this._bekciTik(), 30e3);
  }

  durdur() {
    this.calisiyor = false;
    if (this._bekci) this.temizle(this._bekci);
    for (const a of Object.values(this.akislar)) {
      if (a.ping) this.temizle(a.ping);
      if (a.yeniden) this.temizle(a.yeniden);
      try { if (a.ws) a.ws.close(); } catch { /* */ }
      a.bagli = false;
    }
  }

  _akis(ad) {
    return this.akislar[ad] || (this.akislar[ad] = { ad, adres: ADRES[ad], bagli: false, deneme: 0, yenidenBaglanma: 0, mesaj: 0, satir: 0, sonMesaj: null, sonSatir: null, sonHata: null, bagliSince: null });
  }

  _ac(ad) {
    if (!this.calisiyor) return;
    const a = this._akis(ad);
    let ws;
    try { ws = new this.WS(a.adres); } catch (e) { a.sonHata = String(e.message || e).slice(0, 160); this._yeniden(ad); return; }
    a.ws = ws;
    ws.onopen = () => {
      a.bagli = true; a.bagliSince = this.simdi(); a.sonMesaj = this.simdi(); a.sonHata = null;
      if (ad === 'okx') {
        ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'liquidation-orders', instType: 'SWAP' }] }));
        a.ping = this.yineleZamanla(() => { try { ws.send('ping'); } catch { /* */ } }, 25e3);
      } else if (ad === 'bybit') {
        const s = [...new Set((this.semboller() || []).filter(x => /^[A-Z0-9]+USDT$/.test(x)))].slice(0, 40);
        for (let i = 0; i < s.length; i += 10) ws.send(JSON.stringify({ op: 'subscribe', args: s.slice(i, i + 10).map(x => `allLiquidation.${x}`) }));
        a.abone = s.length;
        a.ping = this.yineleZamanla(() => { try { ws.send(JSON.stringify({ op: 'ping' })); } catch { /* */ } }, 20e3);
      }
    };
    ws.onmessage = (m) => { a.mesaj++; a.sonMesaj = this.simdi(); try { this._isle(ad, typeof m.data === 'string' ? m.data : String(m.data)); } catch (e) { a.sonHata = `ayrıştırma: ${String(e.message || e).slice(0, 120)}`; } };
    ws.onerror = (e) => { a.sonHata = String((e && (e.message || (e.error && e.error.message))) || 'bağlantı hatası').slice(0, 160); };
    ws.onclose = () => {
      a.bagli = false;
      if (a.ping) { this.temizle(a.ping); a.ping = null; }
      if (a.ws === ws) a.ws = null;
      this._yeniden(ad);
    };
  }

  _yeniden(ad) {
    if (!this.calisiyor) return;
    const a = this._akis(ad);
    if (a.yeniden) return;
    // 60 sn'den uzun bağlı kaldıysa bekleme baştan
    if (a.bagliSince && this.simdi() - a.bagliSince > 60e3) a.deneme = 0;
    a.bagliSince = null;
    const ms = Math.min(5 * 60e3, 2000 * Math.pow(2, a.deneme));
    a.deneme++;
    a.yenidenBaglanma++;
    a.sonrakiDeneme = this.simdi() + ms;
    a.yeniden = this.zamanla(() => { a.yeniden = null; this._ac(ad); }, ms);
  }

  _bekciTik() {
    const simdi = this.simdi();
    for (const [ad, a] of Object.entries(this.akislar)) {
      if (!a.bagli || !a.ws) continue;
      const sinir = ad === 'binance' ? 15 * 60e3 : 90e3;
      if (a.sonMesaj && simdi - a.sonMesaj > sinir) {
        a.sonHata = `${Math.round((simdi - a.sonMesaj) / 1000)} sn mesaj yok — yeniden bağlanılıyor`;
        try { a.ws.close(); } catch { /* */ }
      }
    }
  }

  _tekrarMi(anahtar) {
    if (this._tekrar.has(anahtar)) return true;
    this._tekrar.add(anahtar);
    this._tekrarSira.push(anahtar);
    if (this._tekrarSira.length > TEKRAR_TAVAN) this._tekrar.delete(this._tekrarSira.shift());
    return false;
  }

  _tamponla(ad, satirlar) {
    if (!satirlar.length) return;
    const a = this._akis(ad);
    a.satir += satirlar.length; a.sonSatir = this.simdi();
    for (const s of satirlar) this.tampon.push(s);
    if (this.tampon.length > TAMPON_TAVAN) { const fazla = this.tampon.length - TAMPON_TAVAN; this.tampon.splice(0, fazla); this.dusen += fazla; }
  }

  /** Saf olmayan ama ağsız: bir ham mesajı satırlara çevirip tampona ekler. */
  _isle(ad, metin) {
    if (metin === 'pong') return;
    const j = JSON.parse(metin);
    const zaman = new Date(this.simdi()).toISOString();
    const out = [];
    if (ad === 'binance') {
      const l = Array.isArray(j) ? j : [j];
      for (const x of l) {
        if (!x || x.e !== 'forceOrder' || !x.o) continue;
        if (this._tekrarMi(`b|${x.o.s}|${x.o.T}|${x.o.S}|${x.o.z}|${x.o.ap}`)) continue;
        out.push({ kaynak: 'binance', uc: 'wss !forceOrder@arr', zaman, sembol: x.o.s, ham: x });
      }
    } else if (ad === 'okx') {
      if (j.event) { if (j.event === 'error') this._akis(ad).sonHata = `OKX: ${j.code} ${j.msg || ''}`.slice(0, 160); return; }
      for (const d of j.data || []) {
        for (const det of d.details || []) {
          if (this._tekrarMi(`o|${d.instId}|${det.ts}|${det.side}|${det.sz}|${det.bkPx}`)) continue;
          out.push({ kaynak: 'okx', uc: 'wss liquidation-orders SWAP', zaman, sembol: d.instId, ham: { instId: d.instId, instFamily: d.instFamily, instType: d.instType, uly: d.uly, ...det } });
        }
      }
    } else if (ad === 'bybit') {
      if (j.op) { if (j.op === 'subscribe' && j.success === false) this._akis(ad).sonHata = `Bybit abonelik: ${j.ret_msg || ''}`.slice(0, 160); return; }
      if (!/^allLiquidation\./.test(j.topic || '')) return;
      for (const d of Array.isArray(j.data) ? j.data : [j.data]) {
        if (!d) continue;
        if (this._tekrarMi(`y|${d.s}|${d.T}|${d.S}|${d.v}|${d.p}`)) continue;
        out.push({ kaynak: 'bybit', uc: 'wss allLiquidation', zaman, sembol: d.s, ham: d });
      }
    }
    this._tamponla(ad, out);
  }

  /** Tamponu yaz (dakikalık). @returns yazılan satır */
  bosalt() {
    if (!this.tampon.length) return 0;
    const l = this.tampon;
    this.tampon = [];
    try { return this.ekle(l); } catch (e) {
      // Disk hatası: geri koy (tavan korunur), sonraki dakikada yeniden.
      this.tampon = l.concat(this.tampon);
      if (this.tampon.length > TAMPON_TAVAN) { const fazla = this.tampon.length - TAMPON_TAVAN; this.tampon.splice(0, fazla); this.dusen += fazla; }
      throw e;
    }
  }

  ozet() {
    return {
      calisiyor: this.calisiyor, destekli: this.destekli(), tampon: this.tampon.length, dusen: this.dusen,
      akislar: Object.values(this.akislar).map(a => ({ ad: a.ad, bagli: a.bagli, mesaj: a.mesaj, satir: a.satir, yenidenBaglanma: a.yenidenBaglanma, abone: a.abone,
        sonMesaj: a.sonMesaj ? new Date(a.sonMesaj).toISOString() : null, sonSatir: a.sonSatir ? new Date(a.sonSatir).toISOString() : null, sonHata: a.sonHata })),
    };
  }
}

module.exports = { TasfiyeAkisi, ADRES };
