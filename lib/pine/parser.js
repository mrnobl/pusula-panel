/**
 * PINE AYRIŞTIRICI (v5 altkümesi) — belirteçlerden sözdizimi ağacı.
 *
 * TASARIM KARARI: AĞAÇ ÜRETİLİR, JS KAYNAK KODU ÜRETİLMEZ.
 *
 * Alternatif "Pine → JS kaynağı → eval" yolu iki yerden yaralanır:
 *   1. Seri semantiği. Pine'da `x[1]` bir bar önceki DEĞERDİR ve her ifade
 *      düğümünün kendi geçmişi vardır. Kod üretiminde bunu doğru kurmak için
 *      zaten bir çalışma zamanı gerekir; o hâlde ağacı doğrudan yorumlamak
 *      hem daha az kod hem daha az sessiz hata demektir.
 *   2. Güvenlik ve ayıklanabilirlik. Kullanıcının yapıştırdığı metinden JS
 *      üretip çalıştırmak, panelde `eval` açmaktır. Yorumlayıcı yalnızca
 *      TANIDIĞI düğümleri çalıştırır; tanımadığına ayrıştırma anında hata verir.
 *
 * DESTEKLENMEYEN HER ŞEY AÇIKÇA REDDEDİLİR. Sessizce atlanan tek bir satır,
 * doğru görünen yanlış bir backtest üretir — bu deponun en pahalı hatası.
 */
const { lex, PineHata } = require('./lexer');

/** İkili operatör öncelikleri — düşükten yükseğe. */
const ONCELIK = {
  'or': 1,
  'and': 2,
  '==': 3, '!=': 3,
  '<': 4, '>': 4, '<=': 4, '>=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6
};

class Parser {
  constructor(tokens) {
    this.t = tokens;
    this.i = 0;
  }

  bak(k = 0) { return this.t[this.i + k] || this.t[this.t.length - 1]; }
  get simdi() { return this.bak(0); }

  esit(tip, deger) {
    const tk = this.simdi;
    return tk.tip === tip && (deger === undefined || tk.deger === deger);
  }

  yut(tip, deger) {
    if (this.esit(tip, deger)) return this.t[this.i++];
    return null;
  }

  bekle(tip, deger) {
    const tk = this.yut(tip, deger);
    if (!tk) {
      const g = this.simdi;
      throw new PineHata(
        `Beklenen ${deger || tip}, bulunan ${g.deger === null ? g.tip : JSON.stringify(g.deger)}`,
        g.satir, g.sutun);
    }
    return tk;
  }

  /**
   * Bir deyimden sonra satır BİTMELİDİR.
   *
   * Bu denetim olmadan `x = 1 y = 2` sessizce İKİ deyim olarak kabul
   * ediliyordu. Satır devamı desteği eklendikten sonra bu gerçek bir risk:
   * hatalı girintilenmiş bir satır önceki satıra yapıştırılır ve sonuç
   * ayrıştırılabilir görünür — yani yanlış program sessizce çalışır.
   *
   * Blok üreten deyimler (if/for/fonksiyon) kendi satır sonlarını zaten
   * tüketir, onlarda denetim yapılmaz.
   */
  deyimSonu(deyim) {
    if (!deyim) return;
    if (deyim.tip === 'Eger' || deyim.tip === 'Dongu' || deyim.tip === 'FonksiyonTanimi') return;
    if (this.esit('NEWLINE') || this.esit('DEDENT') || this.esit('EOF')) return;
    const g = this.simdi;
    throw new PineHata(
      `Deyim bitmeden yeni ifade başladı: ${g.deger === null ? g.tip : JSON.stringify(g.deger)}`
      + ' (girinti hatalı olabilir)', g.satir, g.sutun);
  }

  satirSonu() {
    // Birden çok NEWLINE üst üste gelebilir (boş satırlar elenmiş olsa da).
    let n = 0;
    while (this.yut('NEWLINE')) n++;
    return n;
  }

  // ── Program ──────────────────────────────────────────────────────────────
  program() {
    const govde = [];
    this.satirSonu();
    while (!this.esit('EOF')) {
      const st = this.deyim();
      this.deyimSonu(st);
      if (st) govde.push(st);
      this.satirSonu();
    }
    return { tip: 'Program', govde };
  }

  /** Girintili blok: INDENT ... DEDENT. */
  blok() {
    this.satirSonu();
    if (!this.yut('INDENT')) {
      const g = this.simdi;
      throw new PineHata('Girintili blok bekleniyordu', g.satir, g.sutun);
    }
    const govde = [];
    this.satirSonu();
    while (!this.esit('DEDENT') && !this.esit('EOF')) {
      const st = this.deyim();
      this.deyimSonu(st);
      if (st) govde.push(st);
      this.satirSonu();
    }
    this.yut('DEDENT');
    return govde;
  }

  // ── Deyimler ─────────────────────────────────────────────────────────────
  deyim() {
    const tk = this.simdi;

    if (tk.tip === 'KEYWORD') {
      if (tk.deger === 'if') return this.egerDeyimi();
      if (tk.deger === 'for') return this.donguDeyimi();
      if (tk.deger === 'var' || tk.deger === 'varip') return this.bildirim();
      if (tk.deger === 'while' || tk.deger === 'switch') {
        throw new PineHata(`'${tk.deger}' henüz desteklenmiyor`, tk.satir, tk.sutun);
      }
      if (tk.deger === 'import' || tk.deger === 'export' || tk.deger === 'type'
          || tk.deger === 'method' || tk.deger === 'enum') {
        throw new PineHata(`'${tk.deger}' desteklenmiyor (kütüphane/kullanıcı tipi)`, tk.satir, tk.sutun);
      }
      if (tk.deger === 'break' || tk.deger === 'continue') {
        this.i++;
        return { tip: tk.deger === 'break' ? 'Break' : 'Continue', satir: tk.satir };
      }
    }

    // Tip önekli bildirim: `float x = 1.0`, `var float x = na`
    if (tk.tip === 'TYPE' && this.bak(1).tip === 'NAME') return this.bildirim();

    // Demet bildirimi: `[a, b] = f()`
    if (tk.tip === 'OP' && tk.deger === '[') {
      const geri = this.i;
      const demet = this.demetBildirimiDene();
      if (demet) return demet;
      this.i = geri;
    }

    // Fonksiyon tanımı: `ad(a, b) => ...`
    if (tk.tip === 'NAME') {
      const fn = this.fonksiyonTanimiDene();
      if (fn) return fn;
    }

    // Atama: `ad = ifade` ya da `ad := ifade`
    if (tk.tip === 'NAME' && this.bak(1).tip === 'OP'
        && (this.bak(1).deger === '=' || this.bak(1).deger === ':=')) {
      return this.bildirim();
    }

    // Geriye kalan: ifade deyimi (`strategy.entry(...)`, `plot(...)` gibi)
    const ifade = this.ifade();
    return { tip: 'IfadeDeyimi', ifade, satir: tk.satir };
  }

  /** `[a, b] = f()` — çoklu dönüş. Değilse null döner, çağıran geri sarar. */
  demetBildirimiDene() {
    const bas = this.simdi;
    this.bekle('OP', '[');
    const adlar = [];
    while (!this.esit('OP', ']')) {
      const ad = this.yut('NAME');
      if (!ad) return null;
      adlar.push(ad.deger);
      if (!this.yut('OP', ',')) break;
    }
    if (!this.yut('OP', ']')) return null;
    if (!this.yut('OP', '=')) return null;
    const deger = this.ifade();
    return { tip: 'DemetBildirimi', adlar, deger, satir: bas.satir };
  }

  /** `ad(p1, p2) => gövde`. Değilse null. */
  fonksiyonTanimiDene() {
    const geri = this.i;
    const bas = this.simdi;
    const ad = this.bekle('NAME').deger;
    if (!this.yut('OP', '(')) { this.i = geri; return null; }

    const parametreler = [];
    while (!this.esit('OP', ')')) {
      // Parametre tip öneki taşıyabilir: `f(simple int len) =>`
      this.yut('TYPE');
      const p = this.yut('NAME');
      if (!p) { this.i = geri; return null; }
      let varsayilan = null;
      if (this.yut('OP', '=')) varsayilan = this.ifade();
      parametreler.push({ ad: p.deger, varsayilan });
      if (!this.yut('OP', ',')) break;
    }
    if (!this.yut('OP', ')')) { this.i = geri; return null; }
    if (!this.yut('OP', '=>')) { this.i = geri; return null; }

    // Gövde: ya aynı satırda tek ifade, ya girintili blok.
    let govde;
    if (this.esit('NEWLINE')) {
      govde = this.blok();
    } else {
      govde = [{ tip: 'IfadeDeyimi', ifade: this.ifade(), satir: bas.satir }];
    }
    return { tip: 'FonksiyonTanimi', ad, parametreler, govde, satir: bas.satir };
  }

  bildirim() {
    const bas = this.simdi;
    const kalici = !!(this.yut('KEYWORD', 'var') || this.yut('KEYWORD', 'varip'));
    const tipTk = this.yut('TYPE');
    const ad = this.bekle('NAME').deger;

    const op = this.yut('OP', ':=') || this.yut('OP', '=');
    if (!op) {
      // `var float x` — değersiz bildirim. Pine buna izin vermez; net söyle.
      throw new PineHata(`'${ad}' bildiriminde değer yok`, bas.satir, bas.sutun);
    }
    const deger = this.ifade();
    return {
      tip: 'Bildirim',
      ad,
      kalici,                         // `var` — yalnızca ilk barda değerlenir
      yenidenAtama: op.deger === ':=',
      tipAdi: tipTk ? tipTk.deger : null,
      deger,
      satir: bas.satir
    };
  }

  egerDeyimi() {
    const bas = this.bekle('KEYWORD', 'if');
    const kosul = this.ifade();
    const dogru = this.blok();
    let yanlis = null;

    this.satirSonu();
    if (this.esit('KEYWORD', 'else')) {
      this.bekle('KEYWORD', 'else');
      if (this.esit('KEYWORD', 'if')) {
        yanlis = [this.egerDeyimi()];
      } else {
        yanlis = this.blok();
      }
    }
    return { tip: 'Eger', kosul, dogru, yanlis, satir: bas.satir };
  }

  donguDeyimi() {
    const bas = this.bekle('KEYWORD', 'for');
    // `for i = 0 to n` / `for i = n to 0 by -1`
    const sayac = this.bekle('NAME').deger;
    this.bekle('OP', '=');
    const baslangic = this.ifade();
    this.bekle('KEYWORD', 'to');
    const bitis = this.ifade();
    let adim = null;
    if (this.yut('KEYWORD', 'by')) adim = this.ifade();
    const govde = this.blok();
    return { tip: 'Dongu', sayac, baslangic, bitis, adim, govde, satir: bas.satir };
  }

  // ── İfadeler ─────────────────────────────────────────────────────────────
  ifade() { return this.ucluIfade(); }

  ucluIfade() {
    const kosul = this.ikiliIfade(0);
    if (this.yut('OP', '?')) {
      const dogru = this.ucluIfade();
      this.bekle('OP', ':');
      const yanlis = this.ucluIfade();
      return { tip: 'Uclu', kosul, dogru, yanlis };
    }
    return kosul;
  }

  ikiliIfade(minOncelik) {
    let sol = this.birli();
    for (;;) {
      const tk = this.simdi;
      const op = (tk.tip === 'OP' || tk.tip === 'KEYWORD') ? tk.deger : null;
      const onc = op !== null ? ONCELIK[op] : undefined;
      if (onc === undefined || onc < minOncelik) break;
      this.i++;
      const sag = this.ikiliIfade(onc + 1);
      sol = { tip: 'Ikili', op, sol, sag };
    }
    return sol;
  }

  birli() {
    if (this.esit('KEYWORD', 'not')) { this.i++; return { tip: 'Birli', op: 'not', deger: this.birli() }; }
    if (this.esit('OP', '-')) { this.i++; return { tip: 'Birli', op: '-', deger: this.birli() }; }
    if (this.esit('OP', '+')) { this.i++; return this.birli(); }
    return this.sonEk();
  }

  /** Üye erişimi, çağrı ve GEÇMİŞ indeksi (`x[1]`) — hepsi soldan bağlar. */
  sonEk() {
    let d = this.temel();
    for (;;) {
      if (this.yut('OP', '.')) {
        /**
         * Nokta sonrası ad TİP ya da ANAHTAR KELİME de olabilir: `input.int`,
         * `input.bool`, `input.string`, `input.color`, `color.new`,
         * `strategy.close`. Sözcük çözümleyici bunları kendi sınıflarında
         * işaretler; üye konumunda hepsi düz addır.
         */
        const tk = this.yut('NAME') || this.yut('TYPE') || this.yut('KEYWORD');
        if (!tk) {
          const g = this.simdi;
          throw new PineHata('Nokta sonrası üye adı bekleniyordu', g.satir, g.sutun);
        }
        // Satır: denetim raporu çağrı OLMAYAN üye erişimini de (syminfo.tickerid) satırıyla gösterir (P4).
        d = { tip: 'Uye', nesne: d, ad: tk.deger, satir: tk.satir };
      } else if (this.esit('OP', '(')) {
        // Satır numarası ÇAĞRIDA taşınır: çalışma zamanı hataları ("şu çağrı
        // desteklenmiyor") ancak kaynak satırıyla birlikte işe yarar.
        const satir = this.simdi.satir;
        d = { tip: 'Cagri', hedef: d, argumanlar: this.argumanlar(), satir };
      } else if (this.yut('OP', '[')) {
        // Pine'da köşeli parantez SERİ GEÇMİŞİDİR, dizi indeksi değil.
        // `close[1]` = bir önceki barın kapanışı.
        const gecmis = this.ifade();
        this.bekle('OP', ']');
        d = { tip: 'Gecmis', taban: d, kaydirma: gecmis };
      } else {
        break;
      }
    }
    return d;
  }

  argumanlar() {
    this.bekle('OP', '(');
    const liste = [];
    while (!this.esit('OP', ')')) {
      let ad = null;
      /**
       * Adlandırılmış argüman: `minval = 10`. `==` ile karışmasın diye
       * ileriye bakılır.
       *
       * Argüman ADI bir TİP adı da olabilir — `line.new(..., color = ...)`
       * burada `color` hem tip hem argüman adıdır. Yalnızca NAME kabul etmek
       * gerçek Pine dosyalarında ayrıştırmayı kırıyordu.
       */
      const adTk = this.simdi;
      /**
       * ANAHTAR KELİME de argüman adı olabilir. En yaygın örnek Pine v4'ün
       * `input(4.5, type=input.float, ...)` biçimidir: `type` v5'te kullanıcı
       * tipi bildirimi olduğu için anahtar kelimedir, ama argüman konumunda
       * düpedüz bir addır. `==` ile karışma riski yok — sözcük çözümleyici
       * onu tek belirteç olarak üretir, buradaki denetim tam olarak `=` arar.
       */
      if ((adTk.tip === 'NAME' || adTk.tip === 'TYPE' || adTk.tip === 'KEYWORD')
          && this.bak(1).tip === 'OP' && this.bak(1).deger === '=') {
        ad = adTk.deger;
        this.i += 2;
      }
      liste.push({ ad, deger: this.ifade() });
      if (!this.yut('OP', ',')) break;
    }
    this.bekle('OP', ')');
    return liste;
  }

  temel() {
    const tk = this.simdi;

    if (tk.tip === 'NUMBER') { this.i++; return { tip: 'Sayi', deger: tk.deger }; }
    if (tk.tip === 'STRING') { this.i++; return { tip: 'Metin', deger: tk.deger }; }
    if (tk.tip === 'COLOR') { this.i++; return { tip: 'Renk', deger: tk.deger }; }

    if (tk.tip === 'KEYWORD') {
      if (tk.deger === 'true' || tk.deger === 'false') {
        this.i++; return { tip: 'Mantik', deger: tk.deger === 'true' };
      }
      if (tk.deger === 'na') {
        this.i++;
        /**
         * `na` iki farklı şeydir: DEĞER (`x = na`) ve İŞLEV (`na(x)` — "x
         * boş mu"). Ayrımı yalnızca sonraki belirteç söyler. İşlev biçimini
         * değer sanmak, `na(ihlalBar)` gibi son derece yaygın bir kalıbı
         * ayrıştırılamaz kılıyordu.
         */
        if (this.esit('OP', '(')) return { tip: 'Ad', ad: 'na' };
        return { tip: 'Na' };
      }
      if (tk.deger === 'if') {
        // `x = if kosul \n deger \n else \n deger` — ifade konumunda if.
        return this.egerDeyimi();
      }
    }

    // Tip dönüşümü çağrısı: `int(x)`, `float(x)`, `color.new(...)` gibi
    // TİP adı da çağrı hedefi olabilir.
    if (tk.tip === 'TYPE') { this.i++; return { tip: 'Ad', ad: tk.deger }; }
    if (tk.tip === 'NAME') { this.i++; return { tip: 'Ad', ad: tk.deger }; }

    if (this.yut('OP', '(')) {
      const ic = this.ifade();
      this.bekle('OP', ')');
      return ic;
    }

    // Demet değeri: `[a, b]` (fonksiyon dönüşlerinde)
    if (this.yut('OP', '[')) {
      const ogeler = [];
      while (!this.esit('OP', ']')) {
        ogeler.push(this.ifade());
        if (!this.yut('OP', ',')) break;
      }
      this.bekle('OP', ']');
      return { tip: 'Demet', ogeler };
    }

    throw new PineHata(
      `Beklenmeyen ${tk.deger === null ? tk.tip : JSON.stringify(tk.deger)}`,
      tk.satir, tk.sutun);
  }
}

/**
 * Kaynağı ayrıştırır.
 * @returns {{tip:'Program', govde:Array, version:number|null}}
 */
function parse(kaynak) {
  const { tokens, version } = lex(kaynak);
  const p = new Parser(tokens);
  const agac = p.program();
  agac.version = version;
  return agac;
}

module.exports = { parse, Parser, PineHata };
