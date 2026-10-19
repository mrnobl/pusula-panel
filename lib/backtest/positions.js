/**
 * HEDGE DEFTERİ — long ve short AYRI, sermaye ORTAK (`PLAN-MOTOR.md` M-4)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NEDEN VAR
 * ═══════════════════════════════════════════════════════════════════════════
 * Motor bugün tek pozisyon taşıyor (`let position = null`) ve defterde dolan
 * TERS YÖNLÜ emir yok sayılıyor (`tersYonYokSayilan`). Grid botunun short
 * bacağı bu yüzden sessizce çöpe giderdi.
 *
 * Kullanıcı kararları (2026-09-06, `PLAN-GRID-DCA.md` §7):
 *   K1  TEK BOT, İKİ TARAF   — iki yön aynı botta, birbirini görerek
 *   K5  TARAF BAŞINA TAVAN   — her yön sermayenin en çok %N'ini kullanır
 *   K7  HER YÖN AYRI DEAL    — long ve short ayrı sayılır, ayrı ölçülür
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NETLEŞME YOK
 * ═══════════════════════════════════════════════════════════════════════════
 * Bir long ve bir short AYNI ANDA açık kalabilir; birbirini kapatmazlar.
 * Borsadaki "hedge mode" davranışı budur ve grid'in iki bacağı bunu ister.
 * Netleşme isteyen bir kullanım, `netMiktar()` ile net pozisyonu okur.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VARSAYILAN KAPALI — ESKİ SONUÇLAR DEĞİŞMESİN
 * ═══════════════════════════════════════════════════════════════════════════
 * `hedge: false` (varsayılan) iken defter TEK pozisyonlu davranır: ikinci
 * bir yön açılmaya çalışılırsa reddedilir ve sayılır. Bu, bugünkü motorun
 * davranışının birebir aynısıdır — yedi mevcut stratejinin sonuçları
 * değişmez. Yeni davranış açıkça `hedge: true` verilerek istenir.
 *
 * ⚠ Bu modül POZİSYON KAYDIDIR, işlem mantığı değildir: stop tetikleme,
 * kâr hesabı, komisyon burada YOK. Defter neyin açık olduğunu bilir,
 * ne yapılması gerektiğini bilmez.
 */

const YONLER = ['long', 'short'];

function yonDogrula(yon) {
  if (!YONLER.includes(yon)) throw new Error(`Geçersiz yön: ${yon}`);
  return yon;
}

class HedgeBook {
  /**
   * @param {object} cfg
   * @param {boolean} cfg.hedge          iki yön aynı anda açılabilsin mi
   * @param {number}  cfg.tarafTavanPct  yön başına sermaye tavanı (%)
   * @param {number}  cfg.baslangicSermaye  tavanın ölçüldüğü taban
   */
  constructor(cfg = {}) {
    this.hedge = cfg.hedge === true;
    /**
     * Tavan, hedge KAPALIYKEN anlamsızdır (zaten tek taraf var) ve
     * bağlayıcı olmamalıdır — yoksa mevcut stratejilerin pozisyon boyutu
     * sessizce değişirdi. Bu yüzden varsayılanı hedge durumuna bağlı.
     */
    this.tavanBelirtildi = Number.isFinite(cfg.tarafTavanPct);
    this.tarafTavanPct = this.tavanBelirtildi
      ? cfg.tarafTavanPct
      : (this.hedge ? 50 : 100);
    this.baslangicSermaye = Number.isFinite(cfg.baslangicSermaye) ? cfg.baslangicSermaye : 0;

    this.long = null;
    this.short = null;

    /** Hedge kapalıyken reddedilen ters yön açılışları — sessiz kalmamalı. */
    this.tersYonReddedilen = 0;
    /** Taraf tavanı yüzünden kısılan emirler. */
    this.tavanKisilan = 0;
  }

  /* ── Okuma ─────────────────────────────────────────────────────────── */

  get(yon) { return this[yonDogrula(yon)]; }
  var(yon) { return this.get(yon) !== null; }

  get acikYonler() { return YONLER.filter(y => this[y] !== null); }

  /**
   * Açık pozisyonlar — YENİ bir dizi.
   *
   * Çağıran bunun üzerinde dönerken pozisyon kapatır (çıkış denetimi tam
   * olarak bunu yapar). Defterin canlı hâli üzerinde gezilseydi, kapanan
   * yön listeden düşer ve sıradaki yön atlanırdı.
   */
  acikPozisyonlar() { return this.acikYonler.map(y => this[y]); }

  /**
   * `ac(yon, …)` başarılı olur muydu?
   *
   * Çağıran, SERMAYEYİ HARCAMADAN ÖNCE sorabilsin diye var. Sırayı ters
   * çevirmek — önce nakdi düşüp sonra defterin reddini görmek — o nakdi
   * geri almayı unutmaya açık bir kalıptır; bu depoda `ac()` reddi zaten
   * bir kez sessiz sermaye sızıntısı adayı olmuştu.
   */
  acilabilirMi(yon) {
    yonDogrula(yon);
    if (this[yon]) return false;
    return this.hedge || this.adet === 0;
  }
  get adet() { return this.acikYonler.length; }
  get bos() { return this.adet === 0; }

  /**
   * Tek açık pozisyon.
   *
   * Hedge kapalıyken motorun bugünkü `position` değişkeninin karşılığıdır.
   * İki taraf birden açıkken TEK bir pozisyon diye bir şey yoktur; burada
   * `null` dönmek sessiz hataya yol açardı, o yüzden hata atılır.
   */
  get aktif() {
    if (this.adet === 0) return null;
    if (this.adet === 1) return this[this.acikYonler[0]];
    throw new Error('İki yön birden açık — `aktif` tekil pozisyon varsayar, `get(yon)` kullanın');
  }

  /* ── Yazma ─────────────────────────────────────────────────────────── */

  /**
   * Bir yönü açar.
   * @returns {boolean} açıldı mı. Reddedilirse sayaç artar, sessiz kalmaz.
   */
  ac(yon, poz) {
    yonDogrula(yon);
    if (this[yon]) throw new Error(`${yon} zaten açık — ekleme için ekle() kullanın`);
    if (!this.hedge && this.adet > 0) {
      // Bugünkü davranış: ters yön yok sayılır.
      this.tersYonReddedilen++;
      return false;
    }
    this[yon] = poz;
    return true;
  }

  /** Açık bir yöne lot ekler; ortalama maliyeti çağıran hesaplar. */
  ekle(yon, poz) {
    yonDogrula(yon);
    if (!this[yon]) throw new Error(`${yon} açık değil`);
    this[yon] = poz;
    return true;
  }

  /** Bir yönü kapatır ve kapanan pozisyonu döndürür. */
  kapat(yon) {
    yonDogrula(yon);
    const p = this[yon];
    this[yon] = null;
    return p;
  }

  /* ── Sermaye ───────────────────────────────────────────────────────── */

  /**
   * Bu yöne ayrılabilecek en fazla sermaye.
   *
   * Tavan BAŞLANGIÇ sermayesine göre ölçülür, anlık nakde göre değil:
   * anlık nakde göre ölçmek, tavanı zarar ettikçe daraltır ve merdivenin
   * alt basamaklarını tam ihtiyaç duyulduğu anda keserdi.
   *
   * @param {string} yon
   * @param {number} nakit           o an eldeki nakit
   * @param {number} yondeKullanilan bu yönün hâlihazırda bağladığı sermaye
   * @returns {number} ayrılabilecek üst sınır (asla nakitten fazla değil)
   */
  ayrilabilir(yon, nakit, yondeKullanilan = 0) {
    yonDogrula(yon);
    /**
     * HEDGE KAPALIYKEN TAVAN HİÇ ÖLÇÜLMEZ — %100 yazıp formülü işletmek
     * YETMEZ. Tavan başlangıç sermayesine göre ölçüldüğü için, sermaye
     * kâr edip başlangıcın üstüne çıktığında "%100" bağlayıcı hâle gelir:
     * $10.000 ile başlayıp $14.250 taşıyan bir koşuda tam boyutlu bir emir
     * sessizce $10.000'a kısılırdı. Mevcut yedi stratejinin ölçümü tam da
     * böyle değişirdi. Kullanıcı tavanı açıkça verdiyse elbette uygulanır.
     */
    if (!this.hedge && !this.tavanBelirtildi) return nakit;
    const taban = this.baslangicSermaye > 0 ? this.baslangicSermaye : nakit;
    const tavan = taban * (this.tarafTavanPct / 100);
    const kalan = Math.max(0, tavan - yondeKullanilan);
    return Math.min(nakit, kalan);
  }

  /** Tavanın bir emri kıstığını kaydeder — künyede görünsün. */
  kisildi() { this.tavanKisilan++; }

  /* ── Künye ─────────────────────────────────────────────────────────── */

  /** Yönlü net miktar: long pozitif, short negatif. */
  netMiktar() {
    const l = this.long ? this.long.amount : 0;
    const s = this.short ? this.short.amount : 0;
    return l - s;
  }

  /** İki tarafın toplam büyüklüğü — hedge'de net sıfır olsa da risk vardır. */
  brutMiktar() {
    const l = this.long ? this.long.amount : 0;
    const s = this.short ? this.short.amount : 0;
    return l + s;
  }

  /** Bağlanmış sermaye (marj/maliyet esası). */
  kullanilanMarj() {
    return YONLER.reduce((t, y) => t + (this[y] ? (this[y].cost || 0) : 0), 0);
  }

  ozet() {
    return {
      hedge: this.hedge,
      tarafTavanPct: this.tarafTavanPct,
      acikYonler: this.acikYonler,
      netMiktar: this.netMiktar(),
      brutMiktar: this.brutMiktar(),
      kullanilanMarj: +this.kullanilanMarj().toFixed(6),
      tersYonReddedilen: this.tersYonReddedilen,
      tavanKisilan: this.tavanKisilan
    };
  }
}

module.exports = { HedgeBook, YONLER };
