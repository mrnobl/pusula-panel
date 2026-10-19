/**
 * PINE → MOTOR KÖPRÜSÜ
 *
 * Pine betiğini `BaseStrategy` arayüzüne oturtur: `prepare()` seriyi bağlar,
 * `evaluate()` her barda betiği bir adım ilerletir ve o barın `strategy.*`
 * çağrılarını TEK bir motor sinyaline çevirir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * İKİ MODEL ARASINDAKİ GERÇEK FARKLAR — hepsi burada, hiçbiri gizli değil
 * ─────────────────────────────────────────────────────────────────────────
 * Pine çoklu emir kimliği, piramitleme ve anlık yön çevirme tanır; motor tek
 * pozisyon taşır ve bir barda tek sinyal uygular. Örtüşmeyen yerler:
 *
 * 1. YÖN ÇEVİRME BİR BAR GECİKİR. Pine `strategy.entry` ile ters yönde emir
 *    verildiğinde pozisyonu aynı barda çevirir. Motorda `BUY` yalnızca
 *    pozisyon yokken açar. Bu yüzden köprü: ters yön emrini gördüğü barda
 *    pozisyonu KAPATIR, girişi SONRAKİ bara taşır. Kaç kez olduğu sayılır ve
 *    `indicators.gecikenCevirme` ile raporlanır — göz ardı edilmesin diye.
 *
 * 2. AYNI ANDA BİRDEN ÇOK KİMLİK AÇILAMAZ. `strategy.entry("A", ...)` ve
 *    `strategy.entry("B", ...)` ikisi de açıkken Pine iki pozisyon taşır.
 *    Köprü ilkini taşır, ikincisini yok sayar ve sayar. Sayı sıfırdan
 *    büyükse ölçüm Pine ile aynı değildir; rapor bunu söyler.
 *
 * 3. MİKTAR YÜZDEYLE VERİLİR. `strategy.entry(..., qty = 5)` mutlak miktardır;
 *    motor `allocationPct` ile çalışır. `qty` yok sayılır, `allocationPct`
 *    kullanılır. Bu bir kayıp değil ölçek farkıdır — beklenti yüzdesi aynı
 *    kalır, mutlak kâr farklı olur.
 *
 * 4. `strategy.exit` STOP'U YALNIZCA SIKILAŞTIRIR. Motorun `updateStop`
 *    kuralı gevşemeye izin vermez ("gevşeyen takip eden stop, stop olmaktan
 *    çıkar"). Gevşetmeye çalışan çağrı yok sayılır ve sayılır.
 */
const BaseStrategy = require('../strategies/baseStrategy');
const { inspect } = require('./inspect');
const { PineRuntime } = require('./runtime');
const { PineHata } = require('./parser');
const { izgaraUret } = require('./optimize');

/** Argüman haritasından konum ya da adla değer okur. */
function al(args, sira, ad) {
  if (ad && args.adli && Object.prototype.hasOwnProperty.call(args.adli, ad)) return args.adli[ad];
  return args.konum ? args.konum[sira] : undefined;
}

const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);

/** Stop/hedef bildirilmemiş Pine pozisyonu: motorun %2/%4 varsayılanı yerine (bindirmeStrategy STOPSUZ kalıbı). */
const STOPSUZ = Object.freeze({ stopLossPct: 95, takeProfitPct: 1e6 });

class PineStrategy extends BaseStrategy {
  constructor(config = {}) {
    super(new.target.pineAd || 'Pine Stratejisi', config);
    const S = new.target;
    this.bilgi = S.pineBilgi;
    this.inputAnahtarlari = this.bilgi.inputs.map(i => i.anahtar);
    this.rt = null;
    this.seriImza = null;
    this.sifirla();
  }

  sifirla() {
    this.cikisAyari = new Map();   // from_entry → { stop, limit, qty_percent }
    this.bekleyenGiris = null;     // gecikmiş yön çevirme
    this.acikYon = null;
    // Betik bir kez çoklu/kalıcı emir kullandıysa defter yolunda kalır.
    // Yol ortada değişirse aynı merdivenin bir kısmı deftere, bir kısmı tek
    // emir yoluna giderdi.
    this.defterKullan = false;
    this.sayac = { gecikenCevirme: 0, yoksayilanKimlik: 0, gevsekStop: 0, yoksayilanQty: 0 };
  }

  /** Panel parametreleri: şemada olmayan anahtarlar Pine'a geçmez. */
  pineParams() {
    const c = this.config || {};
    const p = {};
    for (const anahtar of Object.keys(this.bilgi.paramSchema)) {
      if (Object.prototype.hasOwnProperty.call(c, anahtar)) p[anahtar] = c[anahtar];
    }
    return p;
  }

  /**
   * Seriyi bağlar. İLERİYE BAKMA YOK: burada hiçbir hesap yapılmıyor,
   * yalnızca dizi saklanıyor. Betik `evaluate()` sırasında bar bar çalışır.
   */
  prepare(mumlar) {
    if (!Array.isArray(mumlar) || !mumlar.length) return;
    const imza = `${mumlar.length}:${mumlar[0].time}`;
    this.rt = new PineRuntime(this.bilgi.agac, {
      params: this.pineParams(),
      inputAnahtarlari: this.inputAnahtarlari
    });
    this.rt.hazirla(mumlar);
    this.seriImza = imza;
    this.sifirla();
  }

  evaluate(ohlcv, ticker, positions, motorDurumu) {
    if (!Array.isArray(ohlcv) || !ohlcv.length) {
      return { action: 'HOLD', reason: 'Mum verisi yok' };
    }

    // Motor `prepare`i TÜM seriyle, `evaluate`i BÜYÜYEN pencereyle çağırır.
    // İlk çağrı 30. bardan gelir; aradaki barlar da çalıştırılmalı.
    if (!this.rt) this.prepare(ohlcv);
    /**
     * KÂĞIT MOTOR (motorDurumu yok): her tikte YENİ bir mum dizisi gelir (son N mum, kayan
     * pencere; son mum oluşmakta). Eskiden ilk tikteki diziye bağlı kalınıyordu: ikinci tikte
     * `i` eski dizinin dışına düşüyor ve betik her bar "Pine çalışma hatası" ile HOLD
     * dönüyordu — içe aktarılan Pine kâğıt testte HİÇ işlem açamıyordu (Pusula P4). Artık
     * yorumlayıcı o tikin penceresiyle baştan kurulur (TradingView'in grafiği yükleyince
     * geçmişi yeniden hesaplaması gibi); köprünün durumu (çıkış seviyeleri, gecikmiş
     * çevirme) korunur. Backtest yolu (motorDurumu var) değişmedi: tek hazırlık, bar bar.
     */
    else if (!motorDurumu && this.rt.mumlar !== ohlcv) {
      this.rt = new PineRuntime(this.bilgi.agac, { params: this.pineParams(), inputAnahtarlari: this.inputAnahtarlari });
      this.rt.hazirla(ohlcv);
      this.seriImza = `${ohlcv.length}:${ohlcv[0].time}`;
    }
    const i = ohlcv.length - 1;

    const acik = (positions || []).filter(p => p && p.amount > 0);
    const poz = acik[0] || null;
    const yon = poz ? (poz.side === 'short' ? 'short' : 'long') : null;
    this.acikYon = yon;

    let eylemler;
    try {
      eylemler = this.rt.adim(i, {
        pozisyonBoyutu: poz ? (yon === 'short' ? -poz.amount : poz.amount) : 0,
        pozisyonFiyati: poz ? poz.entryPrice : undefined,
        // DCA betikleri açılış dalını `strategy.opentrades == 0` ile kapatır;
        // bu değer beslenmezse merdiven her bar yeniden kurulurdu.
        equity: motorDurumu ? motorDurumu.equity : undefined,
        baslangicSermayesi: motorDurumu ? motorDurumu.initialCapital : undefined,
        acikIslem: motorDurumu ? motorDurumu.openTrades : (poz ? 1 : 0),
        acikEmir: motorDurumu ? motorDurumu.openOrders : 0
      });
    } catch (err) {
      /**
       * Çalışma zamanı hatası SESSİZCE yutulmaz.
       * BACKTEST (motorDurumu verilir): koşu HATAYLA biter — eskiden HOLD dönüyordu ve backtest
       * "0 işlem" gibi doğru görünen yanlış bir sonuçla bitiyordu (Pusula P4).
       * Kâğıt motor (motorDurumu yok): strateji bu barda durur, sebep sinyal metninde.
       */
      if (motorDurumu) {
        const t = ohlcv[i] && ohlcv[i].time != null ? new Date(ohlcv[i].time) : null;
        const zaman = t && !Number.isNaN(t.getTime()) ? t.toISOString().slice(0, 16).replace('T', ' ') : '?';
        throw new PineHata(`Pine çalışma hatası (bar ${i}, ${zaman}): ${err.message}`);
      }
      return { action: 'HOLD', reason: `Pine çalışma hatası: ${err.message}` };
    }

    return this.cevir(eylemler, ohlcv[i], poz, yon);
  }

  /** Bir barın Pine eylemlerini tek motor sinyaline çevirir. */
  cevir(eylemler, mum, poz, yon) {
    const gostergeler = {
      pineEylem: eylemler.length,
      gecikenCevirme: this.sayac.gecikenCevirme,
      yoksayilanKimlik: this.sayac.yoksayilanKimlik
    };

    /**
     * POZİSYON YOKKEN ESKİ ÇIKIŞ AYARLARI ATILIR.
     *
     * `strategy.exit` MUTLAK FİYAT seviyesi bildirir. Kayıt pozisyonlar
     * arasında taşınırsa yeni giriş, ÖNCEKİ işlemin — yani bambaşka bir
     * yapının — stop ve hedef fiyatlarını devralır. Ölçümde yakalandı:
     * çevrilmiş strateji JS aslından sistematik olarak DAHA İYİ görünüyordu
     * (ADA 1d: +%63.6 karşı −%10.9). Bir köprünün aslından iyi çıkması, çeviri
     * doğru olduğu için değil, kaçak bir iyimserlik olduğu için olur.
     *
     * Aynı barda bildirilen çıkış korunur: pozisyon açılmadan önce çıkışını
     * bildiren betikler (yaygın kalıp) böylece doğru seviyelerle girer.
     */
    if (!poz && !this.bekleyenGiris) this.cikisAyari.clear();

    // Bu barın çıkış bildirimleri kaydedilir (stop/hedef seviyeleri).
    for (const e of eylemler) {
      if (e.tur !== 'exit') continue;
      const kimlik = al(e.args, 1, 'from_entry') || al(e.args, 0, 'id') || '__tek';
      const kayit = {
        stop: al(e.args, undefined, 'stop'),
        limit: al(e.args, undefined, 'limit'),
        qty_percent: al(e.args, undefined, 'qty_percent'),
        trail: al(e.args, undefined, 'trail_points') !== undefined
          || al(e.args, undefined, 'trail_offset') !== undefined
      };
      this.cikisAyari.set(kimlik, kayit);
      this.cikisAyari.set('__son', kayit);
    }

    /**
     * ── EMİR DEFTERİ YÜKÜ — EN ÖNCE HESAPLANIR, EN SONA İLİŞTİRİLİR ──
     *
     * Pine bir barda birden çok limitli `strategy.entry` verebilir; DCA
     * botlarının merdiveni tam olarak budur (1 baz + N güvenlik emri).
     * İptaller de burada: `strategy.cancel(id)`, `strategy.cancel_all()`.
     *
     * YÜK SİNYALİ DEĞİŞTİRMEZ, ONA EKLENİR. İlk sürüm defter dalında ERKEN
     * DÖNÜYORDU ve bu sessiz bir hataydı: pozisyon açıkken her bar
     * `strategy.cancel` çağıran betiklerde (yaygın kalıp) `strategy.exit`
     * seviyeleri hiç uygulanmıyordu. Pozisyon stop'suz ve hedefsiz kalıyor,
     * ölçüm sessizce başka bir stratejiyi ölçüyordu — `range-bot.pine`
     * 13 kayıttan 4'e düştü ve testler bunu YAKALAMADI, ancak doğrulama
     * betiğinin işlem karşılaştırması gösterdi.
     */
    const iptaller = eylemler.filter(e => e.tur === 'cancel').map(e => al(e.args, 0, 'id')).filter(Boolean);
    const hepsiIptal = eylemler.some(e => e.tur === 'cancel_all');
    const limitliGirisler = eylemler.filter(e => e.tur === 'entry' && sayiMi(al(e.args, undefined, 'limit')));

    let defterYuku = null;
    if (limitliGirisler.length > 1 || iptaller.length || hepsiIptal
        || (limitliGirisler.length === 1 && this.defterKullan)) {
      this.defterKullan = true;
      const emirler = limitliGirisler.map(e => this.emreCevir(e, mum));
      defterYuku = { orders: emirler };
      if (hepsiIptal) defterYuku.cancelAll = true;
      if (iptaller.length) defterYuku.cancel = iptaller;
      gostergeler.defterEmir = emirler.length;
    }
    /** Üretilen sinyale defter yükünü iliştirir. */
    const ekle = (s) => (defterYuku ? { ...s, ...defterYuku } : s);

    // ── 1) KAPATMA en önceliklidir ──
    const kapat = eylemler.find(e => e.tur === 'close_all' || e.tur === 'close');
    if (kapat && poz) {
      const oran = al(kapat.args, undefined, 'qty_percent');
      const kismi = sayiMi(oran) && oran > 0 && oran < 100 ? oran / 100 : null;
      // Kapatma, bekleyen gecikmiş girişi geçersiz kılar: koşul artık başka.
      if (kapat.tur === 'close_all') this.bekleyenGiris = null;
      return ekle({
        action: yon === 'short' ? 'COVER' : 'SELL',
        ...(kismi ? { partialPct: kismi } : { closeAll: true }),
        reason: `Pine ${kapat.tur}`,
        indicators: gostergeler
      });
    }

    // Defter yolundaki girişler tek-emir dalına DÜŞMEMELİ, yoksa aynı emir
    // hem deftere hem tek emir yoluna giderdi.
    if (defterYuku && limitliGirisler.length) {
      return ekle({ action: 'HOLD', reason: `Pine defter: ${limitliGirisler.length} emir`, indicators: gostergeler });
    }

    // ── 2) GECİKMİŞ YÖN ÇEVİRME: pozisyon kapandıysa şimdi gir ──
    if (this.bekleyenGiris && !poz) {
      const g = this.bekleyenGiris;
      this.bekleyenGiris = null;
      return ekle(this.girisSinyali(g, mum, gostergeler, 'Pine yön çevirme (1 bar gecikmeli)'));
    }

    // ── 3) GİRİŞ (tek, piyasa ya da limit) ──
    const girisler = eylemler.filter(e => e.tur === 'entry');
    if (girisler.length) {
      if (girisler.length > 1) this.sayac.yoksayilanKimlik += girisler.length - 1;
      const e = girisler[0];
      const kimlik = al(e.args, 0, 'id');
      const dogrultu = al(e.args, 1, 'direction');
      const istenenYon = dogrultu === 'short' ? 'short' : 'long';

      if (poz && yon !== istenenYon) {
        /**
         * TERS YÖN: Pine aynı barda çevirir, motor çeviremez. Pozisyonu bu
         * barda kapat, girişi sonraki bara taşı. Sayaç raporlanır — bu bir
         * ölçüm farkıdır, gizlenmemeli.
         */
        this.sayac.gecikenCevirme++;
        this.bekleyenGiris = { kimlik, yon: istenenYon, args: e.args };
        return ekle({
          action: yon === 'short' ? 'COVER' : 'SELL',
          closeAll: true,
          reason: 'Pine yön çevirme — önce kapat',
          indicators: { ...gostergeler, gecikenCevirme: this.sayac.gecikenCevirme }
        });
      }

      if (poz && yon === istenenYon) {
        // Aynı yönde ikinci giriş = piramitleme. Motor bunu yalnızca
        // `addToPosition` bayrağıyla yapar ve bu OPT-IN'dir; Pine tarafında
        // `pyramiding` varsayılanı 0 olduğu için varsayılan davranış YOK SAY.
        const piramit = +(this.bilgi.bildirimArgumanlari.pyramiding || 0);
        if (piramit <= 0) {
          return ekle({ action: 'HOLD', reason: 'Pozisyon açık (pyramiding=0)', indicators: gostergeler });
        }
        return ekle({
          ...this.girisSinyali({ kimlik, yon: istenenYon, args: e.args }, mum, gostergeler, 'Pine kademe'),
          addToPosition: true
        });
      }

      return ekle(this.girisSinyali({ kimlik, yon: istenenYon, args: e.args }, mum, gostergeler, 'Pine giriş'));
    }

    /**
     * ── 4) AÇIK POZİSYONDA ÇIKIŞ SEVİYELERİ ──
     *
     * Pine'ın yaygın kalıbı çıkışı pozisyon AÇILDIKTAN SONRA bildirmektir:
     * `strategy.entry` bir barda, `strategy.exit` pozisyon açıkken HER barda.
     * Bu kalıpta giriş sinyalinde stop/hedef henüz bilinmez; motorun
     * varsayılanına düşülürse stratejinin kendi seviyeleri hiç uygulanmaz.
     * Ölçüldü: aynı kuralın iki sürümü arasında işlem sayısı %42-69 ayrışıyor
     * ve Pine tarafı yanıltıcı biçimde daha iyi görünüyordu.
     *
     * Bu yüzden stop VE hedef her barda motora bildirilir.
     */
    if (poz) {
      const kayit = this.cikisAyari.get('__son');
      if (kayit && (sayiMi(kayit.stop) || sayiMi(kayit.limit))) {
        const sinyal = { action: 'HOLD', reason: 'Pine strategy.exit seviyeleri', indicators: gostergeler };
        if (sayiMi(kayit.stop)) {
          const sikilastirir = yon === 'short'
            ? kayit.stop < (poz.stopPrice === undefined ? Infinity : poz.stopPrice)
            : kayit.stop > (poz.stopPrice === undefined ? -Infinity : poz.stopPrice);
          if (!sikilastirir) this.sayac.gevsekStop++;
          sinyal.updateStop = kayit.stop;
        }
        if (sayiMi(kayit.limit)) sinyal.updateTarget = kayit.limit;
        return ekle(sinyal);
      }
    }

    return ekle({ action: 'HOLD', reason: eylemler.length ? 'Pine eylemi motora çevrilmedi' : 'Pine sinyal yok', indicators: gostergeler });
  }

  /**
   * Pine `strategy.entry` eylemini defter emrine çevirir.
   *
   * MİKTAR: Pine `qty` BİRİM cinsindendir ve defter yolunda AYNEN taşınır.
   * Tek emirli yolda `qty` yok sayılıp `allocationPct` kullanılıyor (ölçek
   * farkı, oran aynı kalıyor) — ama DCA merdiveninde emirler arası ORAN
   * kuralın kendisidir (hacim çarpanı). Hepsini eşitlemek merdiveni yok eder.
   */
  emreCevir(e, mum) {
    const kimlik = String(al(e.args, 0, 'id') || 'BO');
    const dogrultu = al(e.args, 1, 'direction');
    // Pine v4 `strategy.entry(..., long = true/false)` biçimini de kabul et.
    const longBayrak = al(e.args, undefined, 'long');
    let yon = 'long';
    if (dogrultu === 'short') yon = 'short';
    else if (longBayrak === false || longBayrak === 'short') yon = 'short';

    const limit = al(e.args, undefined, 'limit');
    const qty = al(e.args, undefined, 'qty');
    const kayit = this.cikisAyari.get(kimlik) || this.cikisAyari.get('__son') || null;

    const emir = {
      id: kimlik,
      side: yon,
      limitPrice: limit,
      allocationPct: +(this.config && this.config.allocationPct) || 20
    };
    if (sayiMi(qty) && qty > 0) emir.qty = qty;
    if (kayit && sayiMi(kayit.stop)) emir.slLevel = kayit.stop;
    if (kayit && sayiMi(kayit.stop) && sayiMi(limit) && limit > 0) {
      emir.stopLossPct = +(Math.abs(limit - kayit.stop) / limit * 100).toFixed(4);
    }
    if (kayit && sayiMi(kayit.limit) && sayiMi(limit) && limit > 0) {
      emir.takeProfitPct = +(Math.abs(kayit.limit - limit) / limit * 100).toFixed(4);
    }
    void mum;
    return emir;
  }

  /**
   * Giriş sinyali. Stop/hedef, aynı kimliğe bildirilmiş `strategy.exit`ten
   * alınır; yoksa motor varsayılanına düşer.
   */
  girisSinyali(g, mum, gostergeler, sebep) {
    const c = this.config || {};
    const fiyat = mum.close;
    const kayit = this.cikisAyari.get(g.kimlik) || this.cikisAyari.get('__son') || null;

    const sinyal = {
      action: g.yon === 'short' ? 'SHORT' : 'BUY',
      allocationPct: +c.allocationPct || 20,
      reason: `${sebep} (${g.kimlik || '—'})`,
      indicators: gostergeler
    };

    if (al(g.args, undefined, 'qty') !== undefined) this.sayac.yoksayilanQty++;

    // Limit emir: `strategy.entry(..., limit = X)`
    const limit = al(g.args, undefined, 'limit');
    if (sayiMi(limit)) {
      sinyal.action = 'LIMIT';
      sinyal.side = g.yon;
      sinyal.limitPrice = limit;
    }

    const temel = sayiMi(limit) ? limit : fiyat;

    /**
     * STOP / HEDEF YOKSA MOTOR VARSAYILANI KULLANILMAZ (Pusula P4).
     * Pine'da `strategy.exit` bildirilmemiş pozisyonun stopu ve hedefi YOKTUR; çıkış yalnız betiğin
     * kendi `strategy.close` / ters girişiyle olur. Motor eksik alanı %2 stop / %4 hedefle
     * dolduruyordu: SMA kesişimi gibi düz bir betik TradingView'den bambaşka (çok daha kısa,
     * stopla kesilen) işlemler üretiyordu — doğru görünen yanlış sonuç. Aşağıda `strategy.exit`
     * bildirilmişse bu değerlerin üstüne yazılır.
     */
    sinyal.stopLossPct = STOPSUZ.stopLossPct;
    sinyal.takeProfitPct = STOPSUZ.takeProfitPct;

    if (kayit && sayiMi(kayit.stop) && temel > 0) {
      sinyal.slLevel = kayit.stop;
      sinyal.stopLossPct = +(Math.abs(temel - kayit.stop) / temel * 100).toFixed(4);
    }
    if (kayit && sayiMi(kayit.limit) && temel > 0) {
      sinyal.takeProfitPct = +(Math.abs(kayit.limit - temel) / temel * 100).toFixed(4);
    }
    if (kayit && kayit.trail) {
      // Takip eden stop Pine'da bar içi hareket eder; motorun `updateStop`u
      // bar SONUNDA uygulanır. Aynı şey değil — sessizce eşitlemek yerine söyle.
      sinyal.reason += ' [trail desteklenmiyor]';
    }

    return sinyal;
  }
}

/**
 * Pine kaynağından çalıştırılabilir strateji SINIFI üretir.
 *
 * Desteklenmeyen tek bir yapı varsa SINIF ÜRETİLMEZ. Yarısı çevrilmiş bir
 * strateji, doğru görünen yanlış sayı demektir; bu depoda en pahalı hata odur.
 */
function derle(kaynak, meta = {}) {
  const bilgi = inspect(kaynak);

  if (bilgi.surumUyumsuz) {
    throw new PineHata(
      `Bu betik Pine v${bilgi.surumUyumsuz}, desteklenen sürüm v5.\n`
      + '  TradingView düzenleyicisinde açıp "Convert code to v5" ile dönüştürün.');
  }
  if (bilgi.tur !== 'strategy') {
    throw new PineHata(bilgi.tur === 'indicator'
      ? 'Bu bir GÖSTERGE (`indicator`) — backtest için `strategy(...)` bildirimi gerekir.'
      : '`strategy(...)` bildirimi bulunamadı.');
  }
  if (bilgi.desteklenmeyen.length) {
    const ilk = bilgi.desteklenmeyen.slice(0, 6)
      .map(d => `  satır ${d.satir || '?'}: ${d.ad} — ${d.sebep}`).join('\n');
    throw new PineHata(
      `${bilgi.desteklenmeyen.length} desteklenmeyen yapı var, çevrilmedi:\n${ilk}`
      + (bilgi.desteklenmeyen.length > 6 ? `\n  … ve ${bilgi.desteklenmeyen.length - 6} tane daha` : ''));
  }

  class Uretilen extends PineStrategy {}
  Uretilen.pineBilgi = bilgi;
  Uretilen.pineAd = meta.label || bilgi.ad || 'Pine Stratejisi';
  Uretilen.pineKaynak = kaynak;
  Uretilen.paramSchema = {
    ...bilgi.paramSchema,
    allocationPct: {
      type: 'number', default: 20, min: 1, max: 100, step: 1,
      label: 'Pozisyon büyüklüğü (% nakit)', group: 'Motor',
      description: 'Pine `qty` argümanı yerine motorun kendi boyutlandırması kullanılır.'
    }
  };

  /**
   * Isınma: en uzun `input` uzunluğu bilinmediği için sabit bir taban verilir.
   * Pine göstergelerinin çoğu 200 barın altında ısınır; bu sayı raporun
   * "veri kısa mı" uyarısı içindir, hesabı etkilemez.
   */
  Uretilen.warmupBars = () => 200;

  /**
   * OPTİMİZASYON IZGARASI — şemadan üretilir (bkz. `lib/pine/optimize.js`).
   *
   * Izgara bildirmeyen strateji optimizatörde TEK kombinasyon koşar; kullanıcı
   * "optimize et" der, hiçbir şey denenmez ve sonuç mevcut ayarın kendisi
   * olarak döner. İçe aktarılan botların hepsi bu durumdaydı.
   *
   * Izgara bilinçli olarak KÜÇÜK: en çok 4 parametre × 3 değer = 81
   * kombinasyon ve hepsi gerçekten denenir. Şemadaki 14 parametrenin hepsini
   * aramak 4.7 milyon kombinasyon eder; optimizatör onu 150 örneğe indirir ve
   * o 150 örnek uzayı temsil etmez — "en iyi" diye sunulan şey rastgele bir
   * nokta olurdu. Deponun `sigmoid_bb` dersi tam olarak budur.
   */
  Uretilen.optimizeGrid = (baseConfig) => izgaraUret(Uretilen.paramSchema, baseConfig || {}).izgara;

  /** Panel/uç için: hangi parametreler aranabilir, hangileri seçildi. */
  Uretilen.optimizePlan = (baseConfig) => izgaraUret(Uretilen.paramSchema, baseConfig || {});

  return Uretilen;
}

module.exports = { derle, PineStrategy };
