/**
 * UZUN İŞLER — veri indirme ve backtest (iş parçacığında) için durum kaydı.
 *
 * Panel isteği beklemez: iş kimliği alır, ilerlemeyi WebSocket'ten (`IS`)
 * izler, bitince sonucu `/api/is/:id` ile çeker. Sonuçlar bellekte tutulur;
 * en çok `TUT` iş saklanır, eskiler düşer (sunucu yeniden başlarsa gider).
 */
const { Worker } = require('worker_threads');
const path = require('path');

const TUT = 12;

class Isler {
  constructor(yayinla) {
    this.yayinla = yayinla || (() => {});
    this.isler = new Map();
    this.sayac = 0;
  }

  yeni(tur, aciklama) {
    const id = `is-${Date.now().toString(36)}-${++this.sayac}`;
    const is = { id, tur, aciklama, durum: 'calisiyor', oran: 0, asama: 'Başlıyor', basladi: Date.now(), bitti: null, hata: null, sonuc: null, ek: null, iptal: false, isci: null };
    this.isler.set(id, is);
    this.budama();
    this.duyur(is);
    return is;
  }

  /** Panelin gördüğü özet — sonuç ve iş parçacığı nesnesi hariç. */
  ozet(is) {
    if (!is) return null;
    const { sonuc, ek, isci, ...o } = is;
    return { ...o, sure: (is.bitti || Date.now()) - is.basladi };
  }

  duyur(is) { this.yayinla('IS', this.ozet(is)); }

  guncelle(is, oran, asama) {
    if (oran != null) is.oran = Math.max(0, Math.min(1, oran));
    if (asama) is.asama = asama;
    // Çok sık yayın panelin olay kuyruğunu doldurur: en çok 4/sn.
    const simdi = Date.now();
    if (!is._son || simdi - is._son > 250 || oran === 1) { is._son = simdi; this.duyur(is); }
  }

  bitir(is, sonuc, ek) {
    is.durum = 'bitti'; is.oran = 1; is.asama = 'Tamamlandı'; is.bitti = Date.now();
    is.sonuc = sonuc; is.ek = ek || null; is.isci = null;
    this.duyur(is);
  }

  hata(is, mesaj) {
    is.durum = is.iptal ? 'iptal' : 'hata'; is.hata = mesaj; is.bitti = Date.now(); is.isci = null;
    this.duyur(is);
  }

  iptalEt(id) {
    const is = this.isler.get(id);
    if (!is || is.durum !== 'calisiyor') return false;
    is.iptal = true;
    if (is.isci) is.isci.terminate();
    this.hata(is, 'Kullanıcı iptal etti');
    return true;
  }

  al(id) { return this.isler.get(id) || null; }

  liste() { return [...this.isler.values()].map(is => this.ozet(is)).reverse(); }

  budama() {
    const tum = [...this.isler.values()];
    if (tum.length <= TUT) return;
    for (const is of tum.slice(0, tum.length - TUT)) if (is.durum !== 'calisiyor') this.isler.delete(is.id);
  }

  /**
   * İş parçacığını başlatır; ilerleme ve günlük mesajlarını işler.
   * @param log  (level, message) → ana süreç günlüğü
   * @param dosya  iş parçacığı betiği (vars. lib/backtest/isci.js; portföy laboratuvarı lib/portfoy/isci.js verir)
   */
  isciCalistir(is, workerData, log, dosya) {
    return new Promise((coz, reddet) => {
      const w = new Worker(dosya || path.join(__dirname, 'backtest', 'isci.js'), { workerData });
      is.isci = w;
      let bitti = false;
      w.on('message', (m) => {
        if (m.tur === 'ilerleme') this.guncelle(is, m.oran, m.asama);
        else if (m.tur === 'log') { if (log) log(m.level, m.message); }
        else if (m.tur === 'sonuc') { bitti = true; coz(m); }
        else if (m.tur === 'hata') { bitti = true; reddet(new Error(m.mesaj)); }
      });
      w.on('error', (e) => { if (!bitti) { bitti = true; reddet(e); } });
      w.on('exit', (kod) => { if (!bitti) { bitti = true; reddet(new Error(is.iptal ? 'Kullanıcı iptal etti' : `İş parçacığı beklenmedik şekilde kapandı (kod ${kod})`)); } });
    });
  }
}

module.exports = { Isler };
