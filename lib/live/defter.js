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
 * Sayaç da burada kalıcı: kimlik üretimi defterden okunur. Açılışta sayaç, sayaç
 * satırlarının VE kimliklerin en büyüğüdür; yarım satır varsa üstüne güvenlik payı (M4-2).
 */
const fs = require('fs');
const path = require('path');

const SON_DURUMLAR = new Set(['DOLDU', 'IPTAL', 'RED']);
const YARIM_PAY = 1000;     // yarım satır görülünce sayaca eklenen güvenlik payı (kimlik tekrarı olmasın)

/** `ag-<bot>-<gün>-<sayaç>` kimliğinin sayacı (emirKimligi biçimi); başka biçim → 0. */
function kimlikSayisi(id) {
  const m = /^ag-[a-z0-9]+-\d{8}-(\d+)$/.exec(String(id));
  return m ? +m[1] : 0;
}

class Defter {
  /** @param {string} dizin kayıt dizini; `null` → yalnız bellekte (testler) */
  constructor(dizin) {
    this.dizin = dizin;
    this.emirler = new Map();
    this.sayac = 0;
    this.bozukSatirlar = [];    // açılışta okunamayan (yarım) satırlar — yürütücü uyarı yazar
    if (dizin) {
      fs.mkdirSync(dizin, { recursive: true });
      this.dosya = path.join(dizin, 'emirler.jsonl');
      this._yukle();
    }
  }

  _yukle() {
    if (!fs.existsSync(this.dosya)) return;
    const satirlar = fs.readFileSync(this.dosya, 'utf8').split('\n');
    // M4-2 (PLAN-TEST Dalga 2): sayaç HİÇ gerilemez — sayaç satırları VE kimliklerdeki sayı birlikte; kaybolan (yarım)
    // sayaç satırı aynı gün aynı clientOrderId'yi ikinci kez ürettiriyordu.
    let yarimOncesi = null;     // son yarım satıra kadar görülen en büyük sayı (yarım satırdan okunabilenler dahil)
    for (const s of satirlar) {
      if (!s.trim()) continue;
      let k;
      try { k = JSON.parse(s); } catch {
        // Yarım yazılmış satır (elektrik kesintisi): atlanır, çağıran bildirir. İçinden okunabilen sayı da sayaca katılır.
        this.bozukSatirlar.push(s.slice(0, 120));
        const sayilar = [...s.matchAll(/"deger"\s*:\s*(\d+)|ag-[a-z0-9]+-\d{8}-(\d+)/g)].map(m => +(m[1] || m[2]));
        yarimOncesi = Math.max(yarimOncesi || 0, this.sayac, ...sayilar);
        continue;
      }
      if (k.tur === 'sayac') { this.sayac = Math.max(this.sayac, +k.deger || 0); continue; }
      if (k.id) {
        this.sayac = Math.max(this.sayac, kimlikSayisi(k.id));
        this.emirler.set(k.id, { ...(this.emirler.get(k.id) || {}), ...k });
      }
    }
    // Yarım satırın sayısı kesilmiş olabilir (…"deger":12 ← 123): ihtiyat payı. Pay yarım satırdan ÖNCEKİ en büyük sayıya
    // eklenir — sonraki açılışlarda yeni satırlar zaten daha büyük, sayaç her açılışta yeniden sıçramaz.
    if (yarimOncesi != null) this.sayac = Math.max(this.sayac, yarimOncesi + YARIM_PAY);
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

  /** Kaydı birleştirir ve diske ekler. Sayaç defterdeki her kimliğin üstünde kalır (mutabakatta bulunan önekli emir dahil). */
  guncelle(id, alanlar) {
    this.sayac = Math.max(this.sayac, kimlikSayisi(id));
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
