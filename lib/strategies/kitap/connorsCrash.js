/**
 * CONNORS — CRASH. Yalnız SHORT, yalnız vadeli. Aşırı yükselmiş, çok oynak
 * varlığa limitle short.
 *
 * Kaynak: Connors, *Korkuyu Al*, Bölüm 3 — `referans/kitap-connors-korkuyu-al.md`.
 *
 * Kitap kuralı:
 *   koşul : 100 günlük tarihsel volatilite ≥ %100 (denenen %60/%80),
 *           ConnorsRSI ≥ 90
 *   giriş : ertesi gün, kapanışın %3 (ya da %5) üstünden LİMİT short
 *   çıkış : ConnorsRSI < 30 (ya da < 20), kapanışta
 *   stop  : yok · boyut: kitapta yok · iddia: 2007–2017 "%70+ doğru"
 *
 * Bizim varsayımlarımız:
 *   · Hisse filtreleri (fiyat > 5$, hacim ≥ 1M) kriptoda anlamsız → yok.
 *   · HV yıllıklandırması √365 (7/24 piyasa; kitap √252 hisse).
 *   · Boyut: nakdin %20'si (kitapta yok).
 *   · Limit YALNIZ ertesi bar geçerli; dolmazsa iptal.
 *   · Dolum motorun "dokunma" modelinde iyimser — `dolumModeli: 'gercekci'`
 *     ile de koşulmalı (kitap sentezi §1).
 */
const { hv, connorsRsi, STOPSUZ, KitapStratejisi } = require('./ortak');

class ConnorsCrash extends KitapStratejisi {
  constructor(config = {}) { super('connors_crash', config); }
  sifirla() { this.emir = null; }

  p() {
    const c = this.config || {};
    return { hvPencere: +c.hvPencere || 100, hvEsik: c.hvEsik != null ? +c.hvEsik : 100, crsiGiris: c.crsiGiris != null ? +c.crsiGiris : 90,
      crsiCikis: c.crsiCikis != null ? +c.crsiCikis : 30, limitPct: c.limitPct != null ? +c.limitPct : 3, boyutPct: +c.boyutPct || 20 };
  }

  gostergeler(m) {
    const c = m.map(x => x.close);
    return { c, hv: hv(c, this.p().hvPencere), crsi: connorsRsi(c) };
  }

  karar(i, g, d) {
    const p = this.p();
    const { c, hv: h, crsi } = g;
    if (d.spot) return { action: 'HOLD', reason: 'CRASH yalnız vadelide (short)' };
    if (h[i] == null || crsi[i] == null) return { action: 'HOLD' };
    const indicators = { hv100: +h[i].toFixed(0), crsi: +crsi[i].toFixed(1) };
    const iptal = this.emir && this.emir.bar < i ? [this.emir.id] : null;
    if (iptal) this.emir = null;

    if (d.short) {
      if (crsi[i] < p.crsiCikis) return { action: 'SELL', side: 'short', reason: `CRSI ${crsi[i].toFixed(0)} < ${p.crsiCikis}`, indicators, ...STOPSUZ, ...(iptal ? { cancel: iptal } : {}) };
      return { action: 'HOLD', indicators, ...(iptal ? { cancel: iptal } : {}) };
    }
    if (h[i] >= p.hvEsik && crsi[i] >= p.crsiGiris) {
      const id = `crash-${i}`;
      this.emir = { id, bar: i };
      return {
        action: 'HOLD', indicators,
        reason: `CRASH: HV ${h[i].toFixed(0)}% · CRSI ${crsi[i].toFixed(0)} → %${p.limitPct} üstüne limit short`,
        ...(iptal ? { cancel: iptal } : {}),
        orders: [{ id, side: 'short', limitPrice: c[i] * (1 + p.limitPct / 100), allocationPct: p.boyutPct, ...this.stopAyari(i, c[i]) }]
      };
    }
    return { action: 'HOLD', indicators, ...(iptal ? { cancel: iptal } : {}) };
  }
}

ConnorsCrash.warmupBars = () => 102;
ConnorsCrash.boyutlama = 'sermayePayi';
ConnorsCrash.paramSchema = {
  stopAtr: { type: 'number', default: 0, min: 0, max: 10, step: 0.5, label: 'Gevşek stop (ATR katı)', group: 'Stop', description: '0 = kitap kuralı (stopsuz). Örn. 3 → girişten 3 × ATR(20).' },
  hvEsik: { type: 'number', default: 100, min: 30, max: 300, step: 10, label: 'HV100 eşiği (%)', group: 'Koşul' },
  crsiGiris: { type: 'number', default: 90, min: 60, max: 99, step: 1, label: 'Giriş: CRSI ≥', group: 'Koşul' },
  limitPct: { type: 'number', default: 3, min: 0, max: 15, step: 0.5, label: 'Limit: kapanışın % üstü', group: 'Giriş' },
  crsiCikis: { type: 'number', default: 30, min: 5, max: 60, step: 1, label: 'Çıkış: CRSI <', group: 'Çıkış' },
  boyutPct: { type: 'number', default: 20, min: 1, max: 95, step: 1, label: 'Boyut (nakdin %)', group: 'Boyut', description: 'Kitapta yok — bizim varsayımımız.' }
};

module.exports = ConnorsCrash;
