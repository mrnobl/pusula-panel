/**
 * CANLI EMİR DEFTERİ — gönderilmeden ÖNCE yazılan günlük (write-ahead log).
 *
 * Süreç emir gönderirken çökerse, yeniden başladığında "hangi emri göndermeye
 * çalışıyordum" sorusunun cevabı burada durur. Her kayıt bir satır JSON
 * (`data/live/emirler.jsonl`); son durum, aynı kimliğin EN SON satırıdır.
 *
 * Durumlar:
 *   GONDERILIYOR → borsaya gitmek üzere (çökme olursa BILINMIYOR sayılır)
 *   ACIK         → borsada bekliyor (limit)
 *   KISMI        → kısmen doldu
 *   DOLDU · IPTAL · RED  → son durumlar
 *   BILINMIYOR   → gönderildi ama cevap gelmedi; clientOrderId ile SORGULANIR,
 *                  körlemesine yeniden gönderilmez
 *
 * Sayaç da burada kalıcı: kimlik üretimi defterden okunur.
 */
const fs = require('fs');
const path = require('path');

const SON_DURUMLAR = new Set(['DOLDU', 'IPTAL', 'RED']);

class Defter {
  /** @param {string} dizin kayıt dizini; `null` → yalnız bellekte (testler) */
  constructor(dizin) {
    this.dizin = dizin;
    this.emirler = new Map();
    this.sayac = 0;
    if (dizin) {
      fs.mkdirSync(dizin, { recursive: true });
      this.dosya = path.join(dizin, 'emirler.jsonl');
      this._yukle();
    }
  }

  _yukle() {
    if (!fs.existsSync(this.dosya)) return;
    const satirlar = fs.readFileSync(this.dosya, 'utf8').split('\n');
    for (const s of satirlar) {
      if (!s.trim()) continue;
      let k;
      try { k = JSON.parse(s); } catch { continue; }   // yarım yazılmış son satır
      if (k.tur === 'sayac') { this.sayac = Math.max(this.sayac, k.deger); continue; }
      if (k.id) this.emirler.set(k.id, { ...(this.emirler.get(k.id) || {}), ...k });
    }
    // Çökme anında "gönderiliyor"da kalan her emir BİLİNMİYOR'dur.
    for (const e of this.emirler.values()) {
      if (e.durum === 'GONDERILIYOR') e.durum = 'BILINMIYOR';
    }
  }

  _yaz(kayit) {
    if (!this.dosya) return;
    // Y2 (61.7): satır gönderimden ÖNCE diske (fsync) — WAL'ın amacı; elektrik kesintisinde "gönderiliyor" kaydı kaybolmaz.
    require('./kaliciDosya').satirEkle(this.dosya, JSON.stringify(kayit));
  }

  sonrakiSayac() {
    this.sayac += 1;
    this._yaz({ tur: 'sayac', deger: this.sayac, zaman: Date.now() });
    return this.sayac;
  }

  /** Kaydı birleştirir ve diske ekler. */
  guncelle(id, alanlar) {
    const yeni = { ...(this.emirler.get(id) || { id }), ...alanlar, id, guncelleme: Date.now() };
    this.emirler.set(id, yeni);
    this._yaz(yeni);
    return yeni;
  }

  al(id) { return this.emirler.get(id) || null; }

  /** Son durumda olmayanlar — mutabakatta borsaya sorulacaklar. */
  acikOlanlar() {
    return [...this.emirler.values()].filter(e => !SON_DURUMLAR.has(e.durum));
  }

  sonEmirler(adet = 50) {
    return [...this.emirler.values()].sort((a, b) => (b.olusturma || 0) - (a.olusturma || 0)).slice(0, adet);
  }
}

module.exports = { Defter, SON_DURUMLAR };
