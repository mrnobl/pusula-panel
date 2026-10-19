/**
 * PINE YORUMLAYICI — ağacı bar bar çalıştırır.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ÇALIŞMA MODELİ
 * ─────────────────────────────────────────────────────────────────────────
 * Pine betiği HER BAR için baştan sona bir kez çalışır. Değişkenler barlar
 * arasında yaşar; `var` ile bildirilenler yalnızca İLK barda değerlenir,
 * diğerleri her bar yeniden hesaplanır.
 *
 * `x[1]` bir bar önceki DEĞERDİR. Bunu doğru vermek için her ifade düğümüne
 * ayrıştırma sonrası bir kimlik verilir ve her barda o düğümün ürettiği değer
 * geçmişe yazılır. Böylece `ta.sma(close, 20)[2]` gibi ifadeler de çalışır —
 * yalnızca değişkenler değil.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BİLİNEN AYRIM: KOŞUL İÇİNDEKİ DURUMLU ÇAĞRI
 * ─────────────────────────────────────────────────────────────────────────
 * Pine'da `ta.sma` bir `if` bloğunun içinde olsa bile HER BAR hesaplanır
 * (TradingView'ın bilinen tuzağı). Burada blok çalışmadığında çağrı da
 * çalışmaz, yani pencere beslenmez. Bu ayrım sonucu değiştirebileceği için
 * `inspect.js` böyle bir kullanım gördüğünde UYARI üretir; sessizce
 * geçilmez.
 */
const { TA, MATH, NA, sayiMi } = require('./builtins');
const { PineHata } = require('./parser');

/** Ağaçtaki her düğüme kimlik verir (geçmiş ve durum bu kimlikte saklanır). */
function kimliklendir(dugum, sayac = { n: 0 }) {
  if (!dugum || typeof dugum !== 'object') return sayac.n;
  if (Array.isArray(dugum)) { dugum.forEach(d => kimliklendir(d, sayac)); return sayac.n; }
  if (dugum.tip) dugum.__id = sayac.n++;
  for (const k of Object.keys(dugum)) {
    if (k === 'tip' || k === '__id') continue;
    kimliklendir(dugum[k], sayac);
  }
  return sayac.n;
}

/** Blok kapsamı: `if` içinde bildirilen ad dışarı sızmamalı. */
class Kapsam {
  constructor(ust = null) { this.ust = ust; this.yerel = new Map(); }
  bul(ad) {
    let k = this;
    while (k) { if (k.yerel.has(ad)) return k.yerel; k = k.ust; }
    return null;
  }
  oku(ad) {
    const kap = this.bul(ad);
    return kap ? kap.get(ad) : undefined;
  }
  yaz(ad, deger) { this.yerel.set(ad, deger); }
  guncelle(ad, deger) {
    const kap = this.bul(ad);
    if (kap) kap.set(ad, deger); else this.yerel.set(ad, deger);
  }
}

/** Akış denetimi için — `break` / `continue` istisnayla taşınır. */
const BREAK = Symbol('break');
const CONTINUE = Symbol('continue');

class PineRuntime {
  /**
   * @param {Object} agac  `parse()` çıktısı
   * @param {Object} secenekler
   *   - params: panel parametreleri (input.* değerlerini EZER)
   *   - inputAnahtarlari: input çağrı sırası → parametre anahtarı eşlemesi
   *   - onStrategy: `strategy.*` çağrıları için geri arama
   */
  constructor(agac, secenekler = {}) {
    this.agac = agac;
    this.params = secenekler.params || {};
    this.inputAnahtarlari = secenekler.inputAnahtarlari || [];
    this.onStrategy = secenekler.onStrategy || null;
    /**
     * Bar sonu kancası: `(barIndex, kokKapsam)`.
     *
     * Doğrulama içindir — Pine betiğinin ürettiği DEĞİŞKENLERİ JS
     * karşılığıyla bar bar karşılaştırabilmek için. Çeviricinin doğruluğu
     * ancak sayıları yan yana koyarak gösterilebilir; "çalıştı, hata vermedi"
     * bir kanıt değildir.
     */
    this.onBar = secenekler.onBar || null;

    kimliklendir(agac);
    this.dugumGecmisi = new Map();   // __id → [bar bazlı değer]
    this.cagriDurumu = new Map();    // __id → durumlu işlev durumu
    this.kaliciDegerler = new Map(); // `var` bildirimleri
    this.fonksiyonlar = new Map();
    this.inputSayaci = 0;
    this.uyarilar = [];
  }

  // ── Çalıştırma ───────────────────────────────────────────────────────────

  /**
   * Seriyi bağlar ve ilerlemeyi sıfırlar.
   *
   * Bar bar ilerleme, canlı POZİSYON DURUMUNU beslemek için gerekli:
   * `strategy.position_size` gerçek pozisyondan okunmalı, yoksa
   * `strategy.exit` gibi pozisyon bağımlı dallar hiç çalışmaz. Tüm seriyi
   * baştan hesaplayıp sonucu saklamak bunu imkânsız kılardı — motor hangi
   * emrin dolduğunu ancak bar bar bilir.
   */
  hazirla(mumlar) {
    this.mumlar = mumlar;
    this.sonrakiBar = 0;
    this.dugumGecmisi.clear();
    this.cagriDurumu.clear();
    this.kaliciDegerler.clear();
    this.fonksiyonlar.clear();
    if (this.kaliciAdlar) this.kaliciAdlar.clear();
    return this;
  }

  /**
   * `hedef` barına kadar (dahil) çalıştırır. Atlanan barlar da çalıştırılır —
   * Pine betiği HER bar çalışmalıdır, yoksa `var` sayaçları ve gösterge
   * pencereleri delik kalır.
   *
   * @param {number} hedef  bar indeksi
   * @param {Object} durum  { pozisyonBoyutu, pozisyonFiyati }
   * @returns {Array} hedef barda üretilen strateji eylemleri
   */
  adim(hedef, durum = {}) {
    if (!this.mumlar) throw new PineHata('Önce hazirla(mumlar) çağrılmalı');
    if (hedef < this.sonrakiBar - 1) {
      throw new PineHata(`Geriye adım atılamaz (${hedef} < ${this.sonrakiBar - 1})`);
    }
    let sonEylemler = [];
    while (this.sonrakiBar <= hedef) {
      const i = this.sonrakiBar++;
      // Pozisyon durumu yalnızca HEDEF bar için gerçektir; atlanan barlarda
      // motor da bir şey yapmamıştır, o yüzden aynı durum taşınır.
      this.pozisyonBoyutu = durum.pozisyonBoyutu || 0;
      this.pozisyonFiyati = durum.pozisyonFiyati;
      this.equity = durum.equity;
      this.baslangicSermayesi = durum.baslangicSermayesi;
      this.acikIslem = durum.acikIslem || 0;
      this.acikEmir = durum.acikEmir || 0;
      sonEylemler = this.barCalistir(i);
    }
    return sonEylemler;
  }

  barCalistir(i) {
    this.barIndex = i;
    this.bar = this.mumlar[i];
    this.oncekiBar = i > 0 ? this.mumlar[i - 1] : null;
    this.inputSayaci = 0;
    this.barEylemleri = [];

    const kapsam = new Kapsam();
    this.kokKapsam = kapsam;

    try {
      this.blokCalistir(this.agac.govde, kapsam);
    } catch (err) {
      if (err === BREAK || err === CONTINUE) throw new PineHata('Döngü dışında break/continue');
      throw err;
    }
    if (this.onBar) this.onBar(i, kapsam);
    return this.barEylemleri;
  }

  /**
   * Tüm seriyi tek seferde çalıştırır (testler ve inceleme için).
   * @returns {{barlar: Array}} her bar için üretilen strateji eylemleri
   */
  run(mumlar) {
    if (!Array.isArray(mumlar) || !mumlar.length) return { barlar: [] };
    this.hazirla(mumlar);
    const barlar = [];
    for (let i = 0; i < mumlar.length; i++) barlar.push(this.barCalistir(i));
    return { barlar, uyarilar: this.uyarilar };
  }

  blokCalistir(govde, kapsam) {
    let son;
    for (const d of govde) son = this.deyimCalistir(d, kapsam);
    return son;
  }

  deyimCalistir(d, kapsam) {
    switch (d.tip) {
      case 'Bildirim': return this.bildirimCalistir(d, kapsam);

      case 'DemetBildirimi': {
        const deger = this.degerlendir(d.deger, kapsam);
        const liste = Array.isArray(deger) ? deger : [deger];
        d.adlar.forEach((ad, i) => kapsam.yaz(ad, liste[i] === undefined ? NA : liste[i]));
        return deger;
      }

      case 'FonksiyonTanimi':
        this.fonksiyonlar.set(d.ad, d);
        return undefined;

      case 'Eger': {
        const kosul = this.degerlendir(d.kosul, kapsam);
        if (this.dogruMu(kosul)) return this.blokCalistir(d.dogru, new Kapsam(kapsam));
        if (d.yanlis) return this.blokCalistir(d.yanlis, new Kapsam(kapsam));
        return NA;
      }

      case 'Dongu': {
        const bas = this.degerlendir(d.baslangic, kapsam);
        const bit = this.degerlendir(d.bitis, kapsam);
        const adim = d.adim ? this.degerlendir(d.adim, kapsam) : (bas <= bit ? 1 : -1);
        if (!sayiMi(bas) || !sayiMi(bit) || !sayiMi(adim) || adim === 0) return NA;

        // Sonsuz döngü koruması: kullanıcı kodu paneli kilitlememeli.
        let tur = 0;
        const AZAMI = 100000;
        for (let v = bas; adim > 0 ? v <= bit : v >= bit; v += adim) {
          if (++tur > AZAMI) throw new PineHata('Döngü sınırı aşıldı (100000 tur)');
          const ic = new Kapsam(kapsam);
          ic.yaz(d.sayac, v);
          try {
            this.blokCalistir(d.govde, ic);
          } catch (err) {
            if (err === BREAK) break;
            if (err === CONTINUE) continue;
            throw err;
          }
        }
        return NA;
      }

      case 'Break': throw BREAK;
      case 'Continue': throw CONTINUE;

      case 'IfadeDeyimi': return this.degerlendir(d.ifade, kapsam);

      default:
        throw new PineHata(`Çalıştırılamayan deyim: ${d.tip}`, d.satir);
    }
  }

  bildirimCalistir(d, kapsam) {
    if (d.yenidenAtama) {
      const deger = this.degerlendir(d.deger, kapsam);
      // `:=` mevcut değişkeni günceller. `var` ile bildirilmişse kalıcı
      // depodaki değer de güncellenmeli, yoksa sonraki barda eski değere dönerdi.
      kapsam.guncelle(d.ad, deger);
      if (this.kaliciDegerler.has(d.__id + ':' + d.ad)) { /* aşağıda ele alınır */ }
      const kalici = this.kaliciAnahtar(d.ad);
      if (this.kaliciDegerler.has(kalici)) this.kaliciDegerler.set(kalici, deger);
      this.gecmiseYaz(d, deger);
      return deger;
    }

    if (d.kalici) {
      /**
       * `var x = ...` yalnızca İLK barda değerlenir. Sonraki barlarda saklanan
       * değer geri yüklenir — Pine'ın kalıcı değişken semantiği budur ve
       * range yapısı gibi durum makineleri tamamen buna dayanır.
       */
      const anahtar = this.kaliciAnahtar(d.ad, d.__id);
      if (!this.kaliciDegerler.has(anahtar)) {
        this.kaliciDegerler.set(anahtar, this.degerlendir(d.deger, kapsam));
      }
      const deger = this.kaliciDegerler.get(anahtar);
      kapsam.yaz(d.ad, deger);
      this.gecmiseYaz(d, deger);
      // `:=` sonradan güncelleyebilsin diye adı kalıcı anahtara bağla.
      this.kaliciAdlar = this.kaliciAdlar || new Map();
      this.kaliciAdlar.set(d.ad, anahtar);
      return deger;
    }

    const deger = this.degerlendir(d.deger, kapsam);
    kapsam.yaz(d.ad, deger);
    this.gecmiseYaz(d, deger);
    return deger;
  }

  kaliciAnahtar(ad, id) {
    if (id !== undefined) return `var:${id}:${ad}`;
    const m = this.kaliciAdlar && this.kaliciAdlar.get(ad);
    return m || `var:?:${ad}`;
  }

  // ── İfade değerlendirme ──────────────────────────────────────────────────

  degerlendir(d, kapsam) {
    const deger = this.degerlendirIc(d, kapsam);
    this.gecmiseYaz(d, deger);
    return deger;
  }

  gecmiseYaz(d, deger) {
    if (!d || d.__id === undefined) return;
    let g = this.dugumGecmisi.get(d.__id);
    if (!g) { g = []; this.dugumGecmisi.set(d.__id, g); }
    g[this.barIndex] = deger;
  }

  degerlendirIc(d, kapsam) {
    switch (d.tip) {
      case 'Sayi': return d.deger;
      case 'Metin': return d.deger;
      case 'Mantik': return d.deger;
      case 'Renk': return d.deger;
      case 'Na': return NA;

      case 'Demet': return d.ogeler.map(o => this.degerlendir(o, kapsam));

      case 'Ad': return this.adCoz(d.ad, kapsam, d);

      case 'Uye': {
        const yol = this.yolMetni(d);
        if (yol === null) return NA;
        const sabit = this.sabitCoz(yol);
        if (sabit !== undefined) return sabit;

        /**
         * ÇİZİM/BİÇİM sabitleri (`line.style_dashed`, `color.red`,
         * `shape.triangleup`) metin olarak taşınır — sonucu etkilemezler.
         *
         * BAŞKA HER YOL HATA VERİR. Eskiden yol adının kendisi dönüyordu ve
         * bu, boş olmayan bir METİNDİ: `if barstate.islast` HER BAR DOĞRU
         * oluyordu. Sessiz ve tam olarak kaçınmamız gereken türden bir hata.
         */
        if (this.sabitAilesiMi(yol.split('.')[0])) return yol;
        throw new PineHata(`Desteklenmeyen değer: ${yol}`, d.satir);
      }

      case 'Gecmis': {
        const kaydirma = this.degerlendir(d.kaydirma, kapsam);
        // Taban HER BAR değerlendirilmeli, yoksa geçmişi delik olur.
        this.degerlendir(d.taban, kapsam);
        if (!sayiMi(kaydirma) || kaydirma < 0) return NA;
        const g = this.dugumGecmisi.get(d.taban.__id);
        if (!g) return NA;
        const idx = this.barIndex - Math.floor(kaydirma);
        if (idx < 0) return NA;
        const v = g[idx];
        return v === undefined ? NA : v;
      }

      case 'Uclu': {
        const k = this.degerlendir(d.kosul, kapsam);
        // İKİ DAL DA değerlendirilir mi? Pine'da HAYIR — yalnızca seçilen dal.
        // Durumlu göstergeleri üçlü içinde kullanmak bu yüzden risklidir;
        // `inspect.js` bunu uyarı olarak bildirir.
        return this.dogruMu(k)
          ? this.degerlendir(d.dogru, kapsam)
          : this.degerlendir(d.yanlis, kapsam);
      }

      case 'Birli': {
        const v = this.degerlendir(d.deger, kapsam);
        if (d.op === 'not') return !this.dogruMu(v);
        if (d.op === '-') return sayiMi(v) ? -v : NA;
        return NA;
      }

      case 'Ikili': return this.ikiliHesapla(d, kapsam);

      case 'Cagri': return this.cagriCalistir(d, kapsam);

      case 'Eger': {
        // İfade konumunda `if` — son deyimin değeri döner.
        const kosul = this.degerlendir(d.kosul, kapsam);
        if (this.dogruMu(kosul)) return this.blokCalistir(d.dogru, new Kapsam(kapsam));
        if (d.yanlis) return this.blokCalistir(d.yanlis, new Kapsam(kapsam));
        return NA;
      }

      default:
        throw new PineHata(`Değerlendirilemeyen düğüm: ${d.tip}`, d.satir);
    }
  }

  ikiliHesapla(d, kapsam) {
    const op = d.op;

    // Kısa devre: `and` / `or` sağ tarafı gereksizse değerlendirmez.
    if (op === 'and') {
      const s = this.degerlendir(d.sol, kapsam);
      if (!this.dogruMu(s)) return false;
      return this.dogruMu(this.degerlendir(d.sag, kapsam));
    }
    if (op === 'or') {
      const s = this.degerlendir(d.sol, kapsam);
      if (this.dogruMu(s)) return true;
      return this.dogruMu(this.degerlendir(d.sag, kapsam));
    }

    const a = this.degerlendir(d.sol, kapsam);
    const b = this.degerlendir(d.sag, kapsam);

    // Metin birleştirme: Pine'da `+` metinlerde de çalışır.
    if (op === '+' && (typeof a === 'string' || typeof b === 'string')) return String(a) + String(b);

    if (op === '==') return this.esitMi(a, b);
    if (op === '!=') return !this.esitMi(a, b);

    /**
     * `na` YAYILIMI: sayısal işlemde bir taraf `na` ise sonuç `na`.
     * JS'te `null + 1 === 1` olur; bu, ısınma barlarında sahte sinyal üretirdi.
     */
    if (!sayiMi(a) || !sayiMi(b)) return NA;

    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? NA : a / b;
      case '%': return b === 0 ? NA : a % b;
      case '<': return a < b;
      case '>': return a > b;
      case '<=': return a <= b;
      case '>=': return a >= b;
      default: throw new PineHata(`Bilinmeyen operatör: ${op}`);
    }
  }

  esitMi(a, b) {
    if (a === NA || b === NA || a === undefined || b === undefined) return (a === NA || a === undefined) && (b === NA || b === undefined);
    return a === b;
  }

  /** Pine'da `na` YANLIŞ sayılır; 0 da yanlıştır. */
  dogruMu(v) {
    if (v === NA || v === undefined) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v.length > 0;
    return !!v;
  }

  yolMetni(d) {
    if (d.tip === 'Ad') return d.ad;
    if (d.tip === 'Uye') {
      const on = this.yolMetni(d.nesne);
      return on === null ? null : `${on}.${d.ad}`;
    }
    return null;
  }

  /** Yerleşik seri değişkenleri ve sabitler. */
  adCoz(ad, kapsam, dugum) {
    const yerel = kapsam.oku(ad);
    if (yerel !== undefined) return yerel;

    const b = this.bar;
    switch (ad) {
      case 'open': return b.open;
      case 'high': return b.high;
      case 'low': return b.low;
      case 'close': return b.close;
      case 'volume': return b.volume === undefined ? NA : b.volume;
      case 'hl2': return (b.high + b.low) / 2;
      case 'hlc3': return (b.high + b.low + b.close) / 3;
      case 'ohlc4': return (b.open + b.high + b.low + b.close) / 4;
      case 'hlcc4': return (b.high + b.low + b.close + b.close) / 4;
      case 'bar_index': return this.barIndex;
      case 'time': return b.time;
      case 'time_close': return b.time;
      case 'na': return NA;
      case 'last_bar_index': return this.mumlar.length - 1;
      default: break;
    }

    throw new PineHata(`Tanımsız değişken: ${ad}`, dugum && dugum.satir);
  }

  /** `strategy.long`, `strategy.position_size` gibi anlamı OLAN sabitler. */
  sabitCoz(yol) {
    /**
     * `barstate.*` — geçmiş veri üzerinde anlamı KESİNDİR, bu yüzden
     * gerçeklendi. Canlı grafikte `isconfirmed` bar kapanana dek yanlıştır;
     * backtest'te her bar kapalıdır, dolayısıyla her zaman doğru. Aynı
     * sebeple `isrealtime` her zaman yanlış.
     */
    if (yol === 'barstate.isfirst') return this.barIndex === 0;
    if (yol === 'barstate.islast') return this.barIndex === this.mumlar.length - 1;
    if (yol === 'barstate.isconfirmed') return true;
    if (yol === 'barstate.ishistory') return true;
    if (yol === 'barstate.isrealtime') return false;
    if (yol === 'barstate.isnew') return true;
    if (yol === 'barstate.islastconfirmedhistory') return this.barIndex === this.mumlar.length - 1;

    if (yol === 'strategy.long') return 'long';
    if (yol === 'strategy.short') return 'short';
    if (yol === 'strategy.position_size') return this.pozisyonBoyutu || 0;
    if (yol === 'strategy.position_avg_price') return this.pozisyonFiyati === undefined ? NA : this.pozisyonFiyati;
    // Motordan beslenen hesap durumu. Beslenmediyse `na` döner — sıfır dönmek
    // "hesap boş" anlamına gelirdi ve DCA betiklerinin sermaye kapılarını
    // sessizce kapatırdı.
    if (yol === 'strategy.equity') return this.equity === undefined ? NA : this.equity;
    if (yol === 'strategy.initial_capital') return this.baslangicSermayesi === undefined ? NA : this.baslangicSermayesi;
    if (yol === 'strategy.opentrades') return this.acikIslem || 0;
    if (yol === 'strategy.closedtrades') return NA;
    return undefined;
  }

  /**
   * Sonucu etkilemeyen sabit aileleri. Bu köklerden gelen yollar metin olarak
   * geçer; `strategy` burada çünkü `strategy.commission.percent` gibi yollar
   * yalnızca bildirim argümanı olarak kullanılır (anlamı olanlar `sabitCoz`de
   * önce yakalanır).
   */
  sabitAilesiMi(kok) {
    return ['color', 'line', 'label', 'box', 'table', 'shape', 'size', 'location',
      'position', 'format', 'extend', 'xloc', 'yloc', 'scale', 'display',
      'font', 'text', 'plot', 'hline', 'currency', 'order', 'adjustment',
      'strategy', 'math', 'linefill', 'polyline'].includes(kok);
  }

  // ── Çağrılar ─────────────────────────────────────────────────────────────

  cagriCalistir(d, kapsam) {
    const yol = this.yolMetni(d.hedef);
    if (yol === null) throw new PineHata('Çağrı hedefi çözülemedi', d.satir);

    const parcalar = yol.split('.');
    const kok = parcalar[0];
    const uye = parcalar[1] || null;

    // 0) Küresel yardımcılar. `na(x)` boşluk sınamasıdır — `x == na`
    // yazımıyla aynı işi görür ama Pine kodunda ezici çoğunlukla bu biçim
    // kullanılır. `nz(x, y)` boşsa yedek değeri verir.
    if (yol === 'na') {
      const v = this.argDegerleri(d, kapsam)[0];
      return v === NA || v === undefined || (typeof v === 'number' && !Number.isFinite(v));
    }
    if (yol === 'nz') {
      const a = this.argDegerleri(d, kapsam);
      const v = a[0];
      const bos = v === NA || v === undefined || (typeof v === 'number' && !Number.isFinite(v));
      return bos ? (a.length > 1 ? a[1] : 0) : v;
    }

    // 1) Kullanıcı fonksiyonu
    if (this.fonksiyonlar.has(yol)) return this.kullaniciFonksiyonu(this.fonksiyonlar.get(yol), d, kapsam);

    // 2) input.* — panel parametresi varsa ONU kullan
    if (kok === 'input') return this.inputCoz(d, kapsam);

    // 3) ta.*
    if (kok === 'ta') {
      const kayit = TA[uye];
      if (!kayit) throw new PineHata(`ta.${uye} desteklenmiyor`, d.satir);
      const args = this.argDegerleri(d, kapsam);
      const durum = this.durumAl(d.__id);
      const ctx = { bar: this.bar, oncekiBar: this.oncekiBar, barIndex: this.barIndex };
      return kayit.fn(durum, args, ctx);
    }

    /**
     * 3b) str.* — KOZMETİK DEĞİL.
     *
     * `str.tostring` çizim ailesinde sayılıp `na` dönüyordu. Oysa Pine
     * betikleri onunla EMİR KİMLİĞİ üretir: `strategy.entry("SO" +
     * str.tostring(i), ...)`. `na` dönünce bütün güvenlik emirleri aynı
     * kimliği alıyor ve birbirini eziyordu — DCA merdiveni tek emre iniyordu.
     * Metin işlevleri davranışı belirlediği için gerçek gerçeklenir.
     */
    if (kok === 'str') {
      const a = this.argDegerleri(d, kapsam);
      const metin = (v) => {
        if (v === NA || v === undefined) return 'NaN';
        if (typeof v === 'number') {
          // Pine tam sayı değerli float'ı ondalıksız yazar: 1.0 → "1".
          return Number.isInteger(v) ? String(v) : String(v);
        }
        return String(v);
      };
      switch (uye) {
        case 'tostring': return metin(a[0]);
        case 'length': return typeof a[0] === 'string' ? a[0].length : NA;
        case 'upper': return typeof a[0] === 'string' ? a[0].toUpperCase() : NA;
        case 'lower': return typeof a[0] === 'string' ? a[0].toLowerCase() : NA;
        case 'contains': return typeof a[0] === 'string' && typeof a[1] === 'string' ? a[0].includes(a[1]) : false;
        case 'startswith': return typeof a[0] === 'string' && typeof a[1] === 'string' ? a[0].startsWith(a[1]) : false;
        case 'endswith': return typeof a[0] === 'string' && typeof a[1] === 'string' ? a[0].endsWith(a[1]) : false;
        case 'substring': return typeof a[0] === 'string' ? a[0].substring(a[1] || 0, a.length > 2 ? a[2] : undefined) : NA;
        case 'replace_all': return typeof a[0] === 'string' ? a[0].split(a[1]).join(a[2]) : NA;
        case 'tonumber': { const n = parseFloat(a[0]); return Number.isFinite(n) ? n : NA; }
        case 'format': {
          // `str.format("{0} {1}", x, y)` — konumlu yer tutucular.
          let s = String(a[0] === undefined ? '' : a[0]);
          for (let k = 1; k < a.length; k++) s = s.split(`{${k - 1}}`).join(metin(a[k]));
          return s;
        }
        default:
          throw new PineHata(`str.${uye} desteklenmiyor`, d.satir);
      }
    }

    // 4) math.*
    if (kok === 'math') {
      const fn = MATH[uye];
      if (!fn) throw new PineHata(`math.${uye} desteklenmiyor`, d.satir);
      return fn(this.argDegerleri(d, kapsam));
    }

    /**
     * 5a) BİLDİRİM çağrıları — `strategy("Ad", ...)` / `indicator(...)`.
     *
     * Bu denetim `strategy.*` işlem dalından ÖNCE gelmeli: `strategy(...)`
     * ile `strategy.entry(...)` aynı kökü paylaşır ve sıra yanlış olduğunda
     * bildirimin kendisi her bar bir "işlem eylemi" olarak kaydediliyordu
     * (500 barda 500 sahte eylem).
     */
    if (parcalar.length === 1 && (kok === 'strategy' || kok === 'indicator' || kok === 'library')) {
      return NA;
    }

    // 5) strategy.* — işlem çağrıları dışarı bildirilir
    if (kok === 'strategy') {
      const args = this.argHaritasi(d, kapsam);
      if (this.onStrategy) this.onStrategy(uye, args, { barIndex: this.barIndex, satir: d.satir });
      this.barEylemleri.push({ tur: uye, args, satir: d.satir });
      return NA;
    }

    // 6) Tip dönüşümleri
    if (parcalar.length === 1 && ['int', 'float'].includes(kok)) {
      const v = this.argDegerleri(d, kapsam)[0];
      if (!sayiMi(v)) return NA;
      return kok === 'int' ? Math.trunc(v) : v;
    }
    if (parcalar.length === 1 && kok === 'bool') return this.dogruMu(this.argDegerleri(d, kapsam)[0]);
    if (parcalar.length === 1 && kok === 'string') return String(this.argDegerleri(d, kapsam)[0]);
    if (parcalar.length === 1 && kok === 'color') return String(this.argDegerleri(d, kapsam)[0]);

    // 7) Bildirim çağrıları — çalıştırmada etkisiz
    if (kok === 'strategy' || kok === 'indicator' || kok === 'library') return NA;

    /**
     * 8) ÇİZİM ve BİÇİMLENDİRME — argümanları DEĞERLENDİRİLİR ama sonuç atılır.
     *
     * Argümanların yine de değerlendirilmesi şart: `plot(ta.sma(close, 20))`
     * içindeki `ta.sma` her bar beslenmezse penceresi delik kalır ve aynı
     * göstergeyi başka yerde kullanan kod yanlış değer görür.
     */
    if (this.cizimAilesiMi(kok)) {
      this.argDegerleri(d, kapsam);
      return NA;
    }

    throw new PineHata(`Desteklenmeyen çağrı: ${yol}`, d.satir);
  }

  cizimAilesiMi(kok) {
    return ['plot', 'plotshape', 'plotchar', 'plotarrow', 'plotbar', 'plotcandle',
      'bgcolor', 'barcolor', 'fill', 'hline', 'alertcondition', 'alert',
      'label', 'line', 'box', 'table', 'linefill', 'polyline', 'log',
      'color', 'str', 'size', 'shape', 'location', 'extend', 'xloc', 'yloc',
      'position', 'format', 'scale', 'display', 'currency', 'order',
      'adjustment', 'font', 'text'].includes(kok);
  }

  /**
   * `input.*` çağrısı: PANEL DEĞERİ varsa o kullanılır, yoksa Pine'daki
   * varsayılan. Sıra önemlidir — `inspect.js` input'ları görülme sırasına
   * göre numaralandırır ve panel şeması o sırayla üretilir.
   */
  inputCoz(d, kapsam) {
    const sira = this.inputSayaci++;
    const anahtar = this.inputAnahtarlari[sira];
    if (anahtar && Object.prototype.hasOwnProperty.call(this.params, anahtar)) {
      return this.params[anahtar];
    }
    const adsiz = d.argumanlar.filter(a => !a.ad);
    const defval = d.argumanlar.find(a => a.ad === 'defval') || adsiz[0];
    return defval ? this.degerlendir(defval.deger, kapsam) : NA;
  }

  durumAl(id) {
    let s = this.cagriDurumu.get(id);
    if (!s) { s = {}; this.cagriDurumu.set(id, s); }
    return s;
  }

  argDegerleri(d, kapsam) {
    return d.argumanlar.map(a => this.degerlendir(a.deger, kapsam));
  }

  argHaritasi(d, kapsam) {
    const konum = [];
    const adli = {};
    for (const a of d.argumanlar) {
      const v = this.degerlendir(a.deger, kapsam);
      if (a.ad) adli[a.ad] = v; else konum.push(v);
    }
    return { konum, adli };
  }

  kullaniciFonksiyonu(tanim, cagri, kapsam) {
    const ic = new Kapsam(this.kokKapsam);
    const adsiz = cagri.argumanlar.filter(a => !a.ad);
    tanim.parametreler.forEach((p, i) => {
      const adli = cagri.argumanlar.find(a => a.ad === p.ad);
      const dugum = adli ? adli.deger : (adsiz[i] ? adsiz[i].deger : p.varsayilan);
      ic.yaz(p.ad, dugum ? this.degerlendir(dugum, kapsam) : NA);
    });
    return this.blokCalistir(tanim.govde, ic);
  }
}

module.exports = { PineRuntime, kimliklendir, Kapsam };
