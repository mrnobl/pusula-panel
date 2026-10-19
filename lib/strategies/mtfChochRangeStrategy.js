const BaseStrategy = require('./baseStrategy');
const mtf = require('../mtf');

/**
 * MTF CHoCH Range — iki sınırı da yapıdan, SIRAYLA alan range botu.
 *
 * Pine karşılığı: `pine/mtf-choch-range-strateji.pine`. İkisi AYNI kuralı
 * uygular; biri TradingView'de gözle, diğeri burada ölçüyle sınanır. Kural
 * değişirse İKİSİ BİRDEN değişmeli, yoksa iki farklı stratejiyi aynı sanma
 * hatasına düşülür.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ZAMAN DİLİMİ — HANGİ DİLİMDE ÇALIŞTIRILIR
 * ─────────────────────────────────────────────────────────────────────────
 * Bot ONAY (LTF) diliminde çalışır; HTF bu seriden TOPLANARAK üretilir.
 *
 * Sebebi teknik ve pazarlık dışı: motor stratejiye tek bir seri verir. Düşük
 * dilimden yüksek dilim tam olarak üretilebilir (mumları topla), tersi
 * üretilemez (bir günlük mumun içindeki 4 saatlikler kayıptır). Bu yüzden
 * `range_mr`'ın aksine burada panelin zaman dilimi = CHoCH dilimidir.
 *
 *   panel 4H + htfCarpan 6  →  yapı 1D, karakter değişimi 4H  (asıl tasarım)
 *   panel 1H + htfCarpan 4  →  yapı 4H, karakter değişimi 1H
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RANGE = İTKİ BACAĞININ GENLİĞİ (2026-08-17, `rangeoptimum.png`)
 * ─────────────────────────────────────────────────────────────────────────
 * Kullanıcı elle çizdiği kutuları botunkilerle yan yana koydu: elle çizilen
 * kutular İTKİ BACAĞININ (grafikteki sarı çizgiler) iki ucuna oturuyor,
 * botunkiler ise o kutunun İÇİNDE parça parça duruyor. Üç kusur birbirini
 * besliyordu:
 *   1. range bacaktan çok dar çiziliyor
 *   2. dar olduğu için sapma hemen ihlal ediliyor ve yapı ölüyor
 *   3. ölünce yeni kurulum hemen başlıyor ve SABİT TUTULMASI GEREKEN bacağın
 *      içinde yeni range aranıyor
 * Ölen range'e fiyatın geri dönmesi de ölümün yanlış olduğunun kanıtıydı.
 *
 * YENİ KURAL — düşüş bacağı:
 *   1. HTF salınım tepesi = bacağın başladığı yer → **H** (esnek uç)
 *   2. Fiyat düşer; LTF boğa CHoCH'u bacağın bittiğini onaylar
 *      → o hareketin yapısal düşüğü **L** (taze uç, ÇAPA)
 *   3. Bacak genliği ATR süzgecinden geçerse range KİLİTLENİR
 *   4. GENİŞLEME: fiyat H'nin üstünde kapanırsa range ÖLMEZ, H o uca taşınır.
 *      "Fiyat ölen range'e dönüyorsa range aslında devam ediyordu" şikâyetinin
 *      cevabı budur.
 *   5. ÖLÜM: yalnızca ÇAPA tarafı (L) kapanışla kırılırsa. Ya da genişleme
 *      tavanı aşılırsa — genişleyen range öldürülemez patolojisine karşı.
 * Yükseliş bacağı simetriktir: çapa L (HTF dibi), taze uç H, ölüm H'den.
 *
 * ESKİ KURAL GEÇERSİZ: "düşüşte önce L sonra H" (aynı gün, öğleden önce)
 * H'yi L'den SONRAKİ yükselişin tepesinden alıyordu ve bacaktan dar range
 * üretiyordu — resimdeki parçalanmanın doğrudan sebebi.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * YAPI TESPİTİ
 * ─────────────────────────────────────────────────────────────────────────
 * Fraktal + CHoCH/BOS mantığı LuxAlgo'nun "Market Structure CHoCH/BOS
 * (Fractal)" betiğinden uyarlanmıştır (CC BY-NC-SA 4.0). Test birebir aynı:
 *   bullf = dh == -p and dh[p] == p and high[p] == highest(length)
 * `evtLevel` LuxAlgo'nun support/resistance taramasıdır: geçilen fraktaldan
 * bugüne en düşük/en yüksek.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * İLERİYE BAKMA
 * ─────────────────────────────────────────────────────────────────────────
 * `prepare()` tüm seriyi bir kez işler ama akış TEK YÖNLÜDÜR: her bar yalnızca
 * kendinden öncekilerle hesaplanır, hiçbir yerde ileri indeks okunmaz.
 * Fraktal p bar GECİKMEYLE onaylanır ve o gecikme korunur (aday indeks i-p,
 * onay indeksi i). HTF olayı, o HTF mumunun KAPANDIĞI LTF barına yazılır.
 */
class MtfChochRangeStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('MTF CHoCH Range', config);
    this.hazir = null;
    this.islem = null;
    // Yeniden giriş kapısı: { rangeId, silahli, sonYon, acikti, sayac }
    this.kapi = null;
  }

  cfg() {
    const c = this.config || {};
    return {
      // ── Yapı ──
      htfCarpan: +c.htfCarpan || 6,
      htfLen: +c.htfLen || 5,
      frLen: +c.frLen || 5,
      // Sınırları kim belirler: 'salinim' = ardışık iki HTF fraktalı (varsayılan,
      // 2026-08-19), 'choch' = 2026-08-17 akışı (çapa + LTF CHoCH seviyesi).
      bacakModu: ['choch', 'salinim', 'zigzag'].includes(c.bacakModu) ? c.bacakModu : 'zigzag',
      zzEsik: +c.zzEsik > 0 ? +c.zzEsik : 4,
      sadeceCHoCH: c.sadeceCHoCH !== false,
      ciftYon: c.ciftYon !== false,
      iptalKirilim: c.iptalKirilim !== false,
      capaSadeceUca: c.capaSadeceUca !== false,
      kurulumZamanAsimi: +c.kurulumZamanAsimi || 0,
      /**
       * SINIR KAYNAĞI — varsayılan 'yapisal'a GERİ ALINDI (2026-08-17 gecesi).
       *
       * Kısa süre 'uc' varsayılandı: 4h'te işlem sonucunu 2/8 → 6/8 yapmıştı.
       * O karar YANLIŞTI ve nedeni öğreticidir — 37 işlemlik ince bir
       * örneklemde P&L'e bakıp YAPIYI bozdum:
       *
       *   ölçüt              uc     bacak   yapisal
       *   4h range sayısı    39      29       58
       *   4h medyan genişlik %39.3  %49.6    %28.0
       *   4h medyan ömür    505 bar 751 bar  240 bar
       *   4h ölen→dönüş     %35.5   %31.8    %15.7
       *   (1h'te aynı sıralama)
       *
       * 'uc' = kurulumdan beri gerçek uç; düşüş bacağında fiyat düştükçe uç da
       * düşüyor, range şişiyor ve tek yapı ekranı kaplıyor (BTC 1h'te 4621 bar
       * yaşayan bir range ölçüldü). Kullanıcının "rangeler aynı yerde kalıyor"
       * şikâyetinin sebebi buydu.
       *
       * 'bacak' (bacağın öteki ucu) ise pratikte 'uc' ile AYNI sonucu veriyor:
       * düşüş bacağında yeni dip zaten önceki dibin altına indiği için
       * min() her seferinde 'uc'yi seçiyor. Seçenek duruyor ama kazancı yok.
       */
      sinirKaynak: (c.sinirKaynak === 'uc' || c.sinirKaynak === 'bacak') ? c.sinirKaynak : 'yapisal',

      // ── Bacak süzgeci ──
      // Sarı çizgiler küçük salınımlar değil, ATR'ye göre büyük itki
      // bacaklarıydı. Süzgeç olmadan her mikro bacak range üretiyor.
      bacakEnAzAtr: c.bacakEnAzAtr !== undefined ? +c.bacakEnAzAtr : 2.5,
      atrPeriyot: +c.atrPeriyot || 14,

      // ── Range kuralları ──
      eqSeviye: c.eqSeviye !== undefined ? +c.eqSeviye : 0.5,
      devKat: c.devKat !== undefined ? +c.devKat : 0.377,
      genisleme: c.genisleme !== false,
      genislemeTavani: c.genislemeTavani !== undefined ? +c.genislemeTavani : 3.0,
      /**
       * TAVANA GELİNCE ÖLDÜR — 'durdur' ölçümle ELENDİ (2026-08-17 akşamı).
       * 'durdur' esnek ucu ne genişleyen ne öldüren bir duvara çeviriyordu:
       * BTC 1D'de 2020'de 16k–24k'da doğan range 89k'da hâlâ "aktif"ti.
       * Sayıyla: 1h'te medyan ömür 823 bar ve HAYALET ORANI %62.8 — aktif
       * range varken fiyatın sınırlardan 1R'den uzakta kapandığı bar oranı.
       * Ölmeyen range yeni range'in doğmasını da engelliyordu; "alt zaman
       * dilimlerinde hiç çalışmıyor" şikâyetinin sebebi buydu (1h'te 8 varlık
       * × 5000 barda topu topu 23 range).
       *
       * DERS: ilk turda 'durdur' kazanmış GÖRÜNDÜ çünkü ölçütüm "ölen range'e
       * dönüş oranı"ydı ve ölmeyen range hiç dönüş üretmediği için ödül
       * alıyordu. Metrik kendi kusurunu gizledi. `hayaletPct` bu yüzden var.
       */
      tavanDavranis: c.tavanDavranis === 'durdur' ? 'durdur' : 'oldur',
      olumTamponR: c.olumTamponR !== undefined ? +c.olumTamponR : 0.377,
      ucNoktaOnay: c.ucNoktaOnay !== false,
      temasTolerans: +c.temasTolerans >= 0 ? +c.temasTolerans : 0,
      icRangeEngeli: c.icRangeEngeli !== false,
      /**
       * DEVRALMA EŞİĞİ — yeni yapının aktif range'i devralabilmesi için
       * örtüşmesinin bu oranın ALTINDA olması gerekir. 1.0 = devralma yok
       * (eski davranış: range yalnızca kendi ölümüyle biter).
       */
      devralmaOrtusme: c.devralmaOrtusme !== undefined ? +c.devralmaOrtusme : 0.3,
      ihlalKaynak: c.ihlalKaynak === 'fitil' ? 'fitil' : 'kapanis',
      ihlalBar: +c.ihlalBar || 2,
      ihlalArdisik: c.ihlalArdisik !== false,
      graceBar: c.graceBar !== undefined ? +c.graceBar : 5,
      maxYas: +c.maxYas || 0,
      enAzGenislik: c.enAzGenislik !== undefined ? +c.enAzGenislik : 0,

      // ── İşlem ──
      /**
       * GİRİŞ MODU — kullanıcının 11 ekran görüntüsüyle gösterdiği kusur.
       *
       * 'limit'   : sınıra pasif limit emir (ESKİ). Üç somut arıza üretti:
       *             range hâlâ çizilirken ilk işleme giriyor, dip tam
       *             yerinde olmadığı için süpürmede sapma sınırında stop
       *             oluyor, ve sapmayı hiç görmeden işleme giriyor.
       * 'supurme' : SÜPÜRME + GERİ ALMA (VARSAYILAN). Sınırın DIŞINDA bir
       *             kapanış (süpürme) beklenir, fiyat range'e geri
       *             döndüğünde o barın kapanışında girilir. Stop süpürmenin
       *             ucunun ötesine konur — sabit sapma çizgisine değil.
       *             Kullanıcının elle yaptığı işlem tam olarak budur
       *             (giriş 100.7k · stop 96.5k · hedef 111.9k · R/R 2.67).
       */
      girisModu: c.girisModu === 'limit' ? 'limit' : 'supurme',
      supurmeGecerlilikBar: c.supurmeGecerlilikBar !== undefined ? +c.supurmeGecerlilikBar : 3,
      stopTamponAtr: c.stopTamponAtr !== undefined ? +c.stopTamponAtr : 1.0,
      /** Range hâlâ genişliyorken işleme girilmez — "çizim aşamasında giriş". */
      cizimBekleBar: c.cizimBekleBar !== undefined ? +c.cizimBekleBar : 3,
      hedefTur: c.hedefTur === 'eq' ? 'eq' : 'karsi',
      /**
       * YENİDEN GİRİŞ KAPISI — ölçülmüş zorunluluk (2026-08-17).
       * Bacak çapalı range uzun yaşıyor (medyan 263 bar). Kapı olmadan bot
       * aynı sınırda durmadan yeniden giriyor: XRP'de 2 range içinde 320
       * işlem ve −%99.5. Kapı, pozisyon kapandıktan sonra fiyatın EQ'ya
       * dönmesini şart koşar — bir salınım, bir işlem.
       */
      yenidenGirisEq: c.yenidenGirisEq !== false,
      maxIslem: +c.maxIslem || 0,
      eqPartialPct: c.eqPartialPct !== undefined ? +c.eqPartialPct : 0,
      breakevenAfterEq: c.breakevenAfterEq === true,
      closeOnRangeDeath: c.closeOnRangeDeath !== false,
      stopBufferR: c.stopBufferR !== undefined ? +c.stopBufferR : 0,
      allocationPct: +c.allocationPct || 20,
      allowLong: c.allowLong !== false,
      allowShort: c.allowShort !== false,
      marketType: c.marketType || 'perpetual',

      // ── Maliyet ──
      feePct: c.feePct !== undefined ? +c.feePct : 0.15,
      minCostMultiple: c.minCostMultiple !== undefined ? +c.minCostMultiple : 0
    };
  }

  prepare(candles) {
    const p = this.cfg();
    if (!Array.isArray(candles) || candles.length < 60) { this.hazir = null; return; }
    try {
      this.hazir = hesapla(candles, p);
    } catch (err) {
      this.hazir = null;
    }
  }

  evaluate(ohlcv, ticker, positions) {
    const p = this.cfg();
    if (!Array.isArray(ohlcv) || ohlcv.length < 60) {
      return { action: 'HOLD', reason: 'Yetersiz mum verisi' };
    }
    const sonZaman = ohlcv[ohlcv.length - 1].time;
    if (!this.hazir || !this.hazir.zamanIndeks.has(sonZaman)) this.prepare(ohlcv);
    if (!this.hazir) return { action: 'HOLD', reason: 'Yapı hazırlanamadı' };

    const i = this.hazir.zamanIndeks.get(sonZaman);
    if (i === undefined || i < 1) return { action: 'HOLD', reason: 'Bar indeksi çözülemedi' };

    const H = this.hazir;
    const son = ohlcv[ohlcv.length - 1];
    const fiyat = (ticker && ticker.last) || son.close;

    const rl = H.rangeLow[i];
    const rh = H.rangeHigh[i];
    const eq = H.eq[i];
    const dUp = H.devUp[i];
    const dDn = H.devDn[i];
    const rangeId = H.rangeIdAt[i];
    const durum = H.durumAt[i];

    const gostergeler = {
      rangeId,
      durum,                                  // 0 boşta · ±1 ±2 kurulum · 9 aktif
      rangeLow: Number.isFinite(rl) ? +rl.toFixed(6) : null,
      rangeHigh: Number.isFinite(rh) ? +rh.toFixed(6) : null,
      eq: Number.isFinite(eq) ? +eq.toFixed(6) : null,
      htfBaglam: Number.isFinite(H.baglamAt[i]) ? +H.baglamAt[i].toFixed(6) : null
    };

    const acik = (positions || []).filter(x => x && x.amount > 0);
    const komisyonGidisDonus = p.feePct * 2;

    // ── Yeniden giriş kapısı ───────────────────────────────────────────────
    if (!this.kapi || this.kapi.rangeId !== rangeId) {
      this.kapi = { rangeId, silahli: true, sonYon: null, acikti: false, sayac: 0, silah: null };
    }
    const k = this.kapi;
    if (acik.length) {
      k.acikti = true;
      k.sonYon = acik[0].side === 'short' ? 'short' : 'long';
      /**
       * SÜPÜRME SİLAHI POZİSYON AÇILINCA TÜKENİR.
       * Bulunan hata (kullanıcı ekran görüntüsü 5): 22 Haziran süpürmesi
       * long'u tetikledi, long stop oldu, ama silah masada kaldı. Fiyat
       * EQ'ya dönüp yeniden giriş kapısı açılınca ESKİ süpürme anında
       * ateşledi ve sınırdan uzakta (EQ civarında) ikinci bir long açıldı.
       */
      k.silah = null;
    } else if (k.acikti) {
      // Pozisyon yeni kapandı: kapı düşer, EQ'ya dönene kadar açılmaz.
      k.acikti = false;
      k.sayac++;
      if (p.yenidenGirisEq) k.silahli = false;
    }
    if (!k.silahli && Number.isFinite(eq)) {
      const dondu = k.sonYon === 'long' ? son.close >= eq : son.close <= eq;
      if (dondu) k.silahli = true;
    }

    // ── POZİSYON VARKEN ────────────────────────────────────────────────────
    if (acik.length) {
      const kisa = acik[0].side === 'short';
      const miktar = acik.reduce((a, x) => a + x.amount, 0);
      const giris = acik.reduce((a, x) => a + x.amount * x.entryPrice, 0) / miktar;
      if (!this.islem || this.islem.giris !== +giris.toFixed(8)) {
        this.islem = { giris: +giris.toFixed(8), rangeId, eqAlindi: false };
      }
      gostergeler.yon = kisa ? 'short' : 'long';

      const yapiGitti = rangeId === null || (this.islem.rangeId !== null && rangeId !== this.islem.rangeId);
      if (p.closeOnRangeDeath && yapiGitti) {
        return { action: 'SELL', closeAll: true, reason: 'Range öldü — pozisyon kapatılıyor', indicators: gostergeler };
      }

      /**
       * EQ kısmi kâr VARSAYILAN OLARAK KAPALI (`eqPartialPct: 0`).
       * Ölçüm sebebi: PLAN-RANGE-KURALLARI.md §4/K8 — EQ'da ne kadar çok
       * alınırsa beklenti o kadar düşüyor; kısmiyi tamamen kaldırmak
       * beklentiyi ~ikiye katlıyor (isabet %51 → %42 düşerken). Parametre
       * yine de açık: optimizatör bunu SINAYABİLSİN diye.
       */
      if (p.eqPartialPct > 0 && !this.islem.eqAlindi && Number.isFinite(eq)) {
        const ulasti = kisa ? fiyat <= eq : fiyat >= eq;
        if (ulasti) {
          this.islem.eqAlindi = true;
          return {
            action: 'SELL',
            partialPct: Math.min(0.95, p.eqPartialPct),
            updateStop: p.breakevenAfterEq ? giris : undefined,
            reason: `EQ kısmi kâr %${(p.eqPartialPct * 100).toFixed(0)}`
              + (p.breakevenAfterEq ? ' + breakeven' : ''),
            indicators: gostergeler
          };
        }
      }
      return { action: 'HOLD', reason: `Pozisyon taşınıyor (${kisa ? 'short' : 'long'})`, indicators: gostergeler };
    }

    this.islem = null;

    // ── RANGE AKTİF DEĞİLSE ────────────────────────────────────────────────
    if (durum !== 9 || rangeId === null || !Number.isFinite(rl) || !Number.isFinite(rh) || !(rh > rl)) {
      const aciklama = durum === 1 ? 'Düşüş bacağı açık — boğa CHoCH (L) bekleniyor'
        : durum === -1 ? 'Yükseliş bacağı açık — ayı CHoCH (H) bekleniyor'
        : 'Aktif range yok';
      return { action: 'HOLD', reason: aciklama, indicators: gostergeler };
    }

    /**
     * ÜÇÜNCÜ TEMAS BEKLENİYOR — aday range'de işlem yok.
     * Süpürme silahı da burada temizlenir: aday aşamada biriken bayat bir
     * süpürme, onay gelir gelmez anlamsız bir giriş tetiklerdi.
     */
    if (p.ucNoktaOnay && !H.onayliAt[i]) {
      k.silah = null;
      const rr = H.ranges.find(r => r.id === rangeId);
      const uc = rr && rr.yon === -1 ? 'L' : 'H';
      return { action: 'HOLD', reason: `Range aday — 3. temas (${uc}) bekleniyor`, indicators: gostergeler };
    }

    if (!k.silahli) {
      return { action: 'HOLD', reason: 'Yeniden giriş kapısı kapalı — EQ\'ya dönüş bekleniyor', indicators: gostergeler };
    }
    if (p.maxIslem > 0 && k.sayac >= p.maxIslem) {
      return { action: 'HOLD', reason: `Range başına işlem tavanı doldu (${k.sayac})`, indicators: gostergeler };
    }

    const R = rh - rl;

    // ── ÇİZİM BEKLEME — range hâlâ genişliyorken işlem yok ─────────────────
    // "Range çizim aşamasında girilen ilk işlemin stop olması" şikâyeti.
    if (p.cizimBekleBar > 0) {
      for (let j = Math.max(0, i - p.cizimBekleBar + 1); j <= i; j++) {
        if (H.genisledi[j]) {
          return { action: 'HOLD', reason: 'Range hâlâ genişliyor — çizim bitmeden giriş yok', indicators: gostergeler };
        }
      }
    }

    // ── SÜPÜRME + GERİ ALMA ────────────────────────────────────────────────
    if (p.girisModu === 'supurme') {
      const disardaAlt = son.close < rl;
      const disardaUst = son.close > rh;

      if (disardaAlt) {
        // Alt sınır süpürüldü: dibi izle, geri dönüşü bekle.
        k.silah = k.silah && k.silah.yon === 'long'
          ? { yon: 'long', uc: Math.min(k.silah.uc, son.low), bar: i }
          : { yon: 'long', uc: son.low, bar: i };
        return { action: 'HOLD', reason: `Alt sınır süpürüldü (dip ${k.silah.uc.toFixed(2)}) — geri dönüş bekleniyor`, indicators: gostergeler };
      }
      if (disardaUst) {
        k.silah = k.silah && k.silah.yon === 'short'
          ? { yon: 'short', uc: Math.max(k.silah.uc, son.high), bar: i }
          : { yon: 'short', uc: son.high, bar: i };
        return { action: 'HOLD', reason: `Üst sınır süpürüldü (tepe ${k.silah.uc.toFixed(2)}) — geri dönüş bekleniyor`, indicators: gostergeler };
      }
      if (!k.silah) {
        return { action: 'HOLD', reason: 'Süpürme yok — sınır dışında kapanış bekleniyor', indicators: gostergeler };
      }
      /**
       * SİLAHIN ÖMRÜ VAR. Giriş, süpürmeden SONRAKİ ilk geri dönüş barında
       * olmalı; aradan barlar geçtiyse o süpürme artık bağlam değildir.
       * Pozisyon açıkken bu dal hiç çalışmaz, o yüzden bayat silah tek
       * başına temizlenmiyordu.
       */
      if (p.supurmeGecerlilikBar > 0 && (i - k.silah.bar) > p.supurmeGecerlilikBar) {
        k.silah = null;
        return { action: 'HOLD', reason: 'Süpürme bayatladı — yeni süpürme bekleniyor', indicators: gostergeler };
      }

      // Buraya gelindiyse: süpürme olmuş VE kapanış range'e geri dönmüş.
      const kisaS = k.silah.yon === 'short';
      const supurmeUc = k.silah.uc;
      k.silah = null;

      if (kisaS && !p.allowShort) return { action: 'HOLD', reason: 'Short yönü kapalı', indicators: gostergeler };
      if (!kisaS && !p.allowLong) return { action: 'HOLD', reason: 'Long yönü kapalı', indicators: gostergeler };
      if (kisaS && p.marketType !== 'perpetual') {
        return { action: 'HOLD', reason: 'Short yalnızca vadeli piyasada', indicators: gostergeler };
      }

      // STOP SÜPÜRMENİN UCUNDAN — sabit sapma çizgisinden DEĞİL. İkinci
      // işlemin tam da o çizgide stop olması bu kuralı doğurdu.
      const atr = Number.isFinite(H.atrLtf[i]) ? H.atrLtf[i] : R * 0.1;
      const tampon = p.stopTamponAtr * atr + R * p.stopBufferR;
      const stopS = kisaS ? supurmeUc + tampon : supurmeUc - tampon;
      const hedefS = p.hedefTur === 'eq' ? eq : (kisaS ? rl : rh);
      const giris = son.close;

      if (!Number.isFinite(stopS) || (kisaS ? stopS <= giris : stopS >= giris)) {
        return { action: 'HOLD', reason: 'Süpürme stop seviyesi geçersiz', indicators: gostergeler };
      }
      const stopPct = (Math.abs(giris - stopS) / giris) * 100;
      const hedefPct = (Math.abs(hedefS - giris) / giris) * 100;
      if (p.minCostMultiple > 0 && hedefPct < komisyonGidisDonus * p.minCostMultiple) {
        return { action: 'HOLD', reason: 'Hedef mesafesi maliyeti karşılamıyor', indicators: gostergeler };
      }

      gostergeler.R = +R.toFixed(6);
      gostergeler.yon = kisaS ? 'short' : 'long';
      gostergeler.supurmeUc = +supurmeUc.toFixed(6);

      return {
        action: kisaS ? 'SHORT' : 'BUY',
        allocationPct: p.allocationPct,
        stopLossPct: +stopPct.toFixed(4),
        takeProfitPct: +hedefPct.toFixed(4),
        slLevel: +stopS.toFixed(6),
        reason: `SÜPÜRME ${kisaS ? 'SHORT' : 'LONG'} — ${kisaS ? 'tepe' : 'dip'} $${supurmeUc.toFixed(2)}, `
          + `giriş $${giris.toFixed(2)}, stop $${stopS.toFixed(2)} (%${stopPct.toFixed(2)}), `
          + `hedef $${hedefS.toFixed(2)} (%${hedefPct.toFixed(2)}), R/R ${(hedefPct / stopPct).toFixed(2)}`,
        indicators: gostergeler
      };
    }

    // ── LİMİT EMİR (eski mod) — iki sınıra da, her barda yeniden ───────────
    // Motor bekleyen emri her bar sıfırlayıp bildirimle yeniden kurar; koşul
    // bozulunca (range öldü) emir kendiliğinden iptal olur.
    const uzak = Math.abs(fiyat - rl) <= Math.abs(rh - fiyat);   // hangi sınır yakın
    const kisa = !uzak;

    if (kisa && !p.allowShort) return { action: 'HOLD', reason: 'Short yönü kapalı', indicators: gostergeler };
    if (!kisa && !p.allowLong) return { action: 'HOLD', reason: 'Long yönü kapalı', indicators: gostergeler };
    if (kisa && p.marketType !== 'perpetual') {
      return { action: 'HOLD', reason: 'Short yalnızca vadeli piyasada', indicators: gostergeler };
    }

    const limitSeviye = kisa ? rh : rl;
    const tampon = R * p.stopBufferR;
    const stopSeviye = kisa ? (dUp + tampon) : (dDn - tampon);
    const hedef = p.hedefTur === 'eq' ? eq : (kisa ? rl : rh);

    if (!Number.isFinite(stopSeviye) || !Number.isFinite(hedef) || !Number.isFinite(limitSeviye)) {
      return { action: 'HOLD', reason: 'Seviyeler geçersiz', indicators: gostergeler };
    }

    const stopMesafePct = (Math.abs(limitSeviye - stopSeviye) / limitSeviye) * 100;
    const hedefMesafePct = (Math.abs(hedef - limitSeviye) / limitSeviye) * 100;

    if (p.minCostMultiple > 0 && hedefMesafePct < komisyonGidisDonus * p.minCostMultiple) {
      return {
        action: 'HOLD',
        reason: `Hedef mesafesi maliyeti karşılamıyor (%${hedefMesafePct.toFixed(3)})`,
        indicators: gostergeler
      };
    }

    gostergeler.R = +R.toFixed(6);
    gostergeler.yon = kisa ? 'short' : 'long';
    gostergeler.limit = +limitSeviye.toFixed(6);

    return {
      action: 'LIMIT',
      side: kisa ? 'short' : 'long',
      limitPrice: +limitSeviye.toFixed(6),
      allocationPct: p.allocationPct,
      stopLossPct: +stopMesafePct.toFixed(4),
      takeProfitPct: +hedefMesafePct.toFixed(4),
      slLevel: +stopSeviye.toFixed(6),
      reason: `${kisa ? 'SHORT' : 'LONG'} limit @${limitSeviye.toFixed(4)} — stop $${stopSeviye.toFixed(4)}`
        + ` (%${stopMesafePct.toFixed(2)}), hedef $${hedef.toFixed(4)} (%${hedefMesafePct.toFixed(2)})`,
      indicators: gostergeler
    };
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * YAPI AKIŞI — LuxAlgo fraktal + CHoCH/BOS, tek yönlü akış
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Bir seriyi bar bar işler ve OLAY listesi döndürür.
 *
 * Dönen olaylar (hepsi ONAY indeksiyle, yani gecikme korunarak):
 *   { i, tip: 1|-1, choch: bool, level }   — kapanış fraktal seviyeyi geçti
 *   { i, yeniUst|yeniAlt: true, deger }    — yeni fraktal oluştu
 */
function akisIsle(seri, len) {
  const p = Math.floor(len / 2);
  const olaylar = [];
  if (p < 1) return olaylar;

  let upVal = null, upCrossed = true, loVal = null, loCrossed = true;
  let os = 0, prevClose = null, minSinceUp = null, maxSinceLo = null;

  for (let i = 0; i < seri.length; i++) {
    const c = seri[i];
    if (minSinceUp !== null) minSinceUp = Math.min(minSinceUp, c.low);
    if (maxSinceLo !== null) maxSinceLo = Math.max(maxSinceLo, c.high);

    // Fraktal adayı: p bar önce. Pencere son `len` bar.
    const idx = i - p;
    if (idx - p >= 1 && i - len + 1 >= 0) {
      let hh = -Infinity, ll = Infinity;
      for (let j = i - len + 1; j <= i; j++) {
        if (seri[j].high > hh) hh = seri[j].high;
        if (seri[j].low < ll) ll = seri[j].low;
      }
      let onceH = 0, sonraH = 0, onceL = 0, sonraL = 0;
      for (let j = idx - p + 1; j <= idx; j++) {
        onceH += Math.sign(seri[j].high - seri[j - 1].high);
        onceL += Math.sign(seri[j].low - seri[j - 1].low);
      }
      for (let j = idx + 1; j <= i; j++) {
        sonraH += Math.sign(seri[j].high - seri[j - 1].high);
        sonraL += Math.sign(seri[j].low - seri[j - 1].low);
      }

      if (onceH === p && sonraH === -p && seri[idx].high === hh) {
        upVal = seri[idx].high;
        upCrossed = false;
        let m = seri[idx].low;
        for (let j = idx; j <= i; j++) m = Math.min(m, seri[j].low);
        minSinceUp = m;
        olaylar.push({ i, yeniUst: true, deger: upVal });
      }
      if (onceL === -p && sonraL === p && seri[idx].low === ll) {
        loVal = seri[idx].low;
        loCrossed = false;
        let m = seri[idx].high;
        for (let j = idx; j <= i; j++) m = Math.max(m, seri[j].high);
        maxSinceLo = m;
        olaylar.push({ i, yeniAlt: true, deger: loVal });
      }
    }

    if (prevClose !== null) {
      if (upVal !== null && !upCrossed && prevClose <= upVal && c.close > upVal) {
        olaylar.push({ i, tip: 1, choch: os === -1, level: minSinceUp });
        upCrossed = true;
        os = 1;
      } else if (loVal !== null && !loCrossed && prevClose >= loVal && c.close < loVal) {
        olaylar.push({ i, tip: -1, choch: os === 1, level: maxSinceLo });
        loCrossed = true;
        os = -1;
      }
    }
    prevClose = c.close;
  }
  return olaylar;
}

/** LTF serisini HTF mumlarına toplar. Yalnızca TAMAMLANMIŞ kovalar döner. */
/**
 * EŞİKLİ SALINIM (zigzag) — fraktal akışının yerine geçen olay üreteci.
 *
 * Çıktı biçimi `akisIsle` ile AYNI ({ i, yeniUst|yeniAlt, deger }), böylece
 * eşleştirme mantığı değişmeden çalışır. Zigzag doğası gereği sırayla tepe/dip
 * ürettiği için "ardışık ters fraktal" şartı her zaman sağlanır.
 *
 * NEDEN GEREKİYORDU: kullanıcının elle çizdiği bacakların İÇİNDE ara fraktaller
 * çıktı (18 numaralı etikette bacağın ortasında bir tepe fraktalı var). Sabit
 * fraktal uzunluğu bu bacağı göremiyor: uzunluk küçükken ara salınım bacağı
 * bölüyor, büyükken bacak sayısı çöküyor (len 9'da günlük seride 35 bacak
 * kalıyor). Eşik dereceyi uzunlukla değil HAREKET BÜYÜKLÜĞÜyle tanımlar.
 *
 * ÖLÇÜM (2026-08-19, `scripts/bacak-etiket-sinavi.js`): 7 kesin etiketin
 * 6'sında iki uç da bacak genliğinin %5'i içinde. Sabit fraktal kuralları aynı
 * sette en iyi 3/7 yapıyordu. UYARI: eşik de aynı 7 etiketle seçildi, yani bu
 * ÖRNEKLEM İÇİ bir uyum — bağımsız sette doğrulanmadı.
 *
 * İleriye bakma yok: pivot, eşiğin aşıldığı barda kesinleşir; olayın `i`si o
 * onay barıdır, `deger` geriye dönük uçtur. Fraktalın p barlık gecikmesiyle
 * aynı yapıdadır.
 */
function zigzagOlay(seri, esikPct) {
  const esik = Math.max(0.001, (+esikPct || 4) / 100);
  const out = [];
  if (!seri.length) return out;
  let yon = 1, ucVal = seri[0].high;
  for (let i = 1; i < seri.length; i++) {
    if (yon === 1) {
      if (seri[i].high >= ucVal) { ucVal = seri[i].high; }
      else if ((ucVal - seri[i].low) / ucVal >= esik) {
        out.push({ i, yeniUst: true, deger: ucVal });
        yon = -1; ucVal = seri[i].low;
      }
    } else {
      if (seri[i].low <= ucVal) { ucVal = seri[i].low; }
      else if ((seri[i].high - ucVal) / ucVal >= esik) {
        out.push({ i, yeniAlt: true, deger: ucVal });
        yon = 1; ucVal = seri[i].high;
      }
    }
  }
  return out;
}

/**
 * Tek kaynak `lib/mtf.js`. Bu fonksiyonun gövdesi burada ve `vpfrRange`'de
 * ayrı ayrı duruyordu ve ikisi AYRIŞMIŞTI (biri kovaya `time`/`volume`
 * yazıyordu, diğeri yazmıyordu). Son kovanın dışarıda bırakılması kuralı
 * dahil, hepsi artık orada.
 */
const htfTopla = (candles, carpan) => mtf.topla(candles, carpan);

/** HTF serisinde ATR — bacak genliği süzgecinin ölçüsü. */
function htfAtr(htf, periyot) {
  const out = new Array(htf.length).fill(NaN);
  if (htf.length < 2) return out;
  let toplam = 0;
  const tr = [];
  for (let i = 0; i < htf.length; i++) {
    const c = htf[i];
    const onc = i > 0 ? htf[i - 1].close : c.open;
    const t = Math.max(c.high - c.low, Math.abs(c.high - onc), Math.abs(c.low - onc));
    tr.push(t);
    toplam += t;
    if (i >= periyot) toplam -= tr[i - periyot];
    if (i >= periyot - 1) out[i] = toplam / Math.min(periyot, i + 1);
  }
  return out;
}

/**
 * Durum makinesi. Her LTF barı için range seviyelerini üretir.
 *
 * durum: 0 boşta · 1 düşüş bacağı açık (L bekleniyor)
 *       -1 yükseliş bacağı açık (H bekleniyor) · 9 range AKTİF
 */
function hesapla(candles, p) {
  const n = candles.length;
  const { htf } = htfTopla(candles, Math.max(2, Math.round(p.htfCarpan)));

  // HTF olayları → onay indeksleri LTF barlarına yazılır (kova kapanış barı)
  const htfOlay = p.bacakModu === 'zigzag'
    ? zigzagOlay(htf, p.zzEsik)
    : akisIsle(htf, p.htfLen);
  const htfBarda = new Map();
  for (const o of htfOlay) {
    if (!o.yeniUst && !o.yeniAlt) continue;
    const li = htf[o.i] ? htf[o.i].sonIndex : null;
    if (li === null) continue;
    if (!htfBarda.has(li)) htfBarda.set(li, []);
    htfBarda.get(li).push(o);
  }

  const ltfOlay = akisIsle(candles, p.frLen);
  const ltfBarda = new Map();
  for (const o of ltfOlay) {
    if (!o.tip) continue;
    if (!ltfBarda.has(o.i)) ltfBarda.set(o.i, []);
    ltfBarda.get(o.i).push(o);
  }

  const rangeLow = new Array(n).fill(NaN);
  const rangeHigh = new Array(n).fill(NaN);
  const eq = new Array(n).fill(NaN);
  const devUp = new Array(n).fill(NaN);
  const devDn = new Array(n).fill(NaN);
  const rangeIdAt = new Array(n).fill(null);
  const durumAt = new Array(n).fill(0);
  const baglamAt = new Array(n).fill(NaN);
  const genisledi = new Array(n).fill(false);   // bu barda esnek uç taşındı mı
  const onayliAt = new Array(n).fill(false);    // range o barda ONAYLI mıydı
  const ranges = [];

  // İşlem tarafı için ATR (işlem serisinin kendi ölçeği — HTF ATR'si değil).
  const atrLtf = htfAtr(candles, Math.max(2, Math.round(p.atrPeriyot)));

  // HTF ATR'si LTF barlarına yayılır: her bar YALNIZCA kapanmış son HTF
  // mumunun ATR'sini görür — ileriye bakma yok.
  const atrHtf = htfAtr(htf, Math.max(2, Math.round(p.atrPeriyot)));
  const atrAt = new Array(n).fill(NaN);
  {
    let k = 0;
    for (let i = 0; i < n; i++) {
      while (k < htf.length && htf[k].sonIndex < i) k++;
      atrAt[i] = k > 0 ? atrHtf[k - 1] : NaN;
    }
  }

  let durum = 0;                       // KURULUM durumu: 0 · 1 düşüş · -1 yükseliş
  let aktif = false;                   // range aktif mi (kurulumdan BAĞIMSIZ)
  let capaH = NaN, capaL = NaN;        // bacağın BAŞLADIĞI uç = esnek taraf
  let sonHtfAlt = NaN, sonHtfUst = NaN;  // en son görülen HTF fraktalları
  let sonFraktalTip = 0;                 // +1 tepe · -1 dip (ardışıklık sınavı)
  let bacakDip = NaN, bacakTepe = NaN;   // bacağın öteki ucu (sarı çizginin dibi/tepesi)
  let ucDip = NaN, ucTepe = NaN;
  let kurulumBar = null, kilitBar = null, ihlalSayac = 0, sonId = 0;
  let rl = NaN, rh = NaN, rEq = NaN, rUp = NaN, rDn = NaN, rangeId = null;
  let rYon = 0, ilkR = NaN;
  let oncekiRl = NaN, oncekiRh = NaN, oncekiR = NaN;

  let kurulumTuketildi = false;
  /**
   * ÜÇÜNCÜ TEMAS — 2026-08-19, kullanıcı kuralı.
   * Bacak iki noktayla çizilir ama iki nokta range'in DURDUĞUNU göstermez.
   * Üçüncü temas fiyatın bacağın BAŞLADIĞI uca dönmesidir (L/H/L · H/L/H).
   * O ana kadar range ADAY; işlem açılmaz. "Range hâlâ büyürken işleme
   * giriyoruz" kusurunun çözümü.
   */
  let onayli = false;
  const sifirla = () => {
    durum = 0; capaH = NaN; capaL = NaN; ucDip = NaN; ucTepe = NaN; kurulumBar = null;
  };

  const seviyeleriKur = () => {
    const R = rh - rl;
    rEq = rl + p.eqSeviye * R;
    rUp = rh + p.devKat * R;
    rDn = rl - p.devKat * R;
  };

  /** Bacak süzgeci: sarı çizgiler mikro salınım değil, ATR ölçeğinde itkiydi. */
  const bacakYeter = (i, genlik) => {
    if (!(genlik > 0)) return false;
    if (p.enAzGenislik > 0 && (genlik / candles[i].close) * 100 < p.enAzGenislik) return false;
    const a = atrAt[i];
    if (p.bacakEnAzAtr > 0 && Number.isFinite(a) && a > 0 && genlik < p.bacakEnAzAtr * a) return false;
    return true;
  };

  /**
   * İÇ RANGE ENGELİ — parçalanmanın doğrudan kaynağı.
   * Ölmüş bir range'in İÇİNDE ve ondan DAR yeni yapı kurulmaz; kullanıcının
   * "sabit tutmamız gereken swingin içinde range arıyoruz" dediği kusur budur.
   */
  const rangeKur = (i, low, high, yon) => {
    if (p.icRangeEngeli && Number.isFinite(oncekiRl) && low >= oncekiRl && high <= oncekiRh
        && (high - low) < oncekiR) return false;
    /**
     * AKTİF RANGE'İN İÇİNDE DOĞAN YAPI ONU DEVİRMEZ.
     *
     * "Yeni yapı eskinin yerini alır" kuralı tek başına konfeti üretti:
     * büyük range'in içindeki her küçük bacak onu deviriyordu ve ekran
     * onlarca minik parçaya bölünüyordu (kullanıcı: "bizim belirlediğimiz
     * büyük range yok oldu"). Devralma ancak yeni yapı aktif range'in
     * DIŞINA taşıyorsa meşrudur — o zaman fiyat gerçekten başka bir bölgeye
     * geçmiştir.
     */
    if (aktif) {
      // Örtüşme oranı: yeni yapı aktif range ile aynı bölgeyi çiziyorsa
      // devralamaz. Tam içerme bunun özel hâlidir (oran = 1).
      const kesisim = Math.min(high, rh) - Math.max(low, rl);
      const oran = kesisim > 0 ? kesisim / Math.min(high - low, rh - rl) : 0;
      if (oran >= p.devralmaOrtusme) return false;
    }
    if (aktif) {
      const eski = ranges[ranges.length - 1];
      if (eski && eski.endIndex === null) {
        eski.endIndex = i; eski.rangeLow = rl; eski.rangeHigh = rh; eski.olumSebep = 'yeni yapı';
      }
      oncekiRl = rl; oncekiRh = rh; oncekiR = rh - rl;
    }
    rl = low; rh = high; rYon = yon; ilkR = high - low;
    rangeId = ++sonId; kilitBar = i; ihlalSayac = 0; aktif = true;
    onayli = !p.ucNoktaOnay;
    seviyeleriKur();
    ranges.push({ id: rangeId, yon, startIndex: i, endIndex: null, rangeLow: rl, rangeHigh: rh, eq: rEq, devUp: rUp, devDn: rDn, ilkR, onayBar: onayli ? i : null });
    return true;
  };

  for (let i = 0; i < n; i++) {
    const c = candles[i];

    // ── 1) HTF salınımı: BACAĞIN ÇAPASI ───────────────────────────────────
    for (const o of (htfBarda.get(i) || [])) {
      /**
       * BACAĞIN ÖTEKİ UCU. Bir salınım tepesi, kendisine GÖTÜREN dipten
       * doğar; o dip bacağın (kullanıcının sarı çizgisinin) başlangıcıdır.
       * `sinirKaynak: 'bacak'` bu dibi kullanır — "range low neden daha
       * derin dipte değil" sorusunun cevabı burada: 'uc' yalnızca TEPEDEN
       * SONRAKİ dibi görüyordu, tepeye götüreni değil.
       */
      /**
       * BACAK = ARDIŞIK İKİ FRAKTAL. `bacakDip` yalnızca bu tepeden ÖNCEKİ
       * fraktal bir DİP ise geçerlidir; araya başka bir tepe girmişse o dip
       * bu bacağa ait değildir.
       *
       * Bu kısıt olmadan "geçmişte görülen son ters fraktal" alınıyordu ve
       * bayat, çok uzak bir seviye range'e karışıp yapıyı bozuyordu
       * (kullanıcı ekran görüntüsü: "bacağın öteki ucu" seçilince yapı
       * dağıldı).
       */
      /**
       * RANGE AKTİFKEN DE DİNLENİR — 2026-08-17 gecesi bulunan kusur.
       *
       * Eskiden kurulum yalnızca `durum === 0` iken açılabiliyordu ve range
       * aktifken (durum 9) HTF fraktalları TAMAMEN yok sayılıyordu. Sonuç:
       * yapı ilerlese, yeni bacaklar oluşsa bile eski range yerini bırakmıyor
       * ve aylarca yaşıyordu (BTC 1h'te 4621 bar = 7 ay ölçüldü). "Rangeler
       * hep aynı yerde kalıyor" şikâyetinin kaynağı buydu.
       *
       * Artık kurulum makinesi range'den BAĞIMSIZ çalışır; yeni bacak ATR
       * süzgecinden geçip CHoCH ile onaylanırsa eski range'in yerini alır.
       */
      /**
       * ÇAPA YALNIZCA DAHA UCA TAŞINIR — 2026-08-19, A-düzeltmesi.
       *
       * Bekleyen kurulum, kendisinden DAHA ALÇAK yeni bir tepe fraktalıyla da
       * yeniden çapalanıyordu (koşul sadece `durum === 0 || durum === 1`'di).
       * Ralli tepe yapar → geri çekilir → daha alçak bir tepe fraktalı oluşur
       * → `capaH` oraya iner. Bacağın gerçek başlangıcı kaybolur ve range,
       * kullanıcının çizdiği bacağın İÇİNDE minik bir kutuya döner
       * (BTC 4h: elle 100k–112.5k, bot 104.5k–110k).
       *
       * Yan hasar daha gizliydi: aynı dal `kurulumBar` ve `ucDip`'i de
       * sıfırlıyordu. Yani `sinirKaynak: 'uc'` ("kurulumdan beri uç") fiilen
       * "son fraktaldan beri uç" demekti — 2026-08-17'de o seçeneğe verilen
       * "range'i şişiriyor" hükmü bu hatanın üstünde ölçülmüş, YENİDEN
       * SINANMALI.
       */
      /**
       * SALINIM BACAĞI MODU — sınırlar DOĞRUDAN iki fraktalın kendisi.
       *
       * Kullanıcının kuralı: range = ardışık iki ters fraktal arasındaki
       * bacak, uçları o fraktalların KENDİ değerleri. Eski akış iki uçtan
       * hiçbirini doğrudan kullanmıyordu (biri kurulum çapası, öteki LTF
       * CHoCH'un `evtLevel`i) ve ikisi de bacağın ucundan içeride kalıyordu —
       * 2026-08-19 ölçümünde 18 karenin 17'sinde en az bir uç kaçtı
       * (`data/bacak-etiketleri.json`).
       *
       * `ciftYon` YÖNE göre uygulanır: bu modda yükseliş bacağını tamamlayan
       * olay bir TEPE fraktalıdır, eski akışta ise bir DİP fraktalı kurulumu
       * açıyordu. Dala bakarak kopyalamak anahtarın anlamını ters çevirirdi.
       */
      if (p.bacakModu === 'salinim' || p.bacakModu === 'zigzag') {
        const oncekiUst = sonHtfUst, oncekiAlt = sonHtfAlt;
        const ardisik = o.yeniUst ? sonFraktalTip === -1 : sonFraktalTip === 1;
        if (o.yeniUst) { sonHtfUst = o.deger; sonFraktalTip = 1; }
        else { sonHtfAlt = o.deger; sonFraktalTip = -1; }
        if (!ardisik) continue;
        const aY = o.yeniUst ? -1 : 1;
        if (aY === -1 && !p.ciftYon) continue;
        const aL = o.yeniUst ? oncekiAlt : o.deger;
        const aH = o.yeniUst ? o.deger : oncekiUst;
        if (!Number.isFinite(aL) || !Number.isFinite(aH) || !(aH > aL)) continue;
        if (!bacakYeter(i, aH - aL)) continue;
        if (rangeKur(i, aL, aH, aY)) kurulumTuketildi = true;
        continue;
      }

      if (o.yeniUst) {
        const ardisik = sonFraktalTip === -1;
        sonHtfUst = o.deger;
        sonFraktalTip = 1;
        const dahaUc = !p.capaSadeceUca || !Number.isFinite(capaH) || o.deger > capaH;
        if (durum === 0 || (durum === 1 && dahaUc)) {
          capaH = o.deger; ucDip = c.low;
          bacakDip = ardisik ? sonHtfAlt : NaN;
          kurulumBar = i; durum = 1;
        }
      } else if (o.yeniAlt) {
        const ardisik = sonFraktalTip === 1;
        sonHtfAlt = o.deger;
        sonFraktalTip = -1;
        const dahaUc = !p.capaSadeceUca || !Number.isFinite(capaL) || o.deger < capaL;
        if (p.ciftYon && (durum === 0 || (durum === -1 && dahaUc))) {
          capaL = o.deger; ucTepe = c.high;
          bacakTepe = ardisik ? sonHtfUst : NaN;
          kurulumBar = i; durum = -1;
        }
      }
    }

    // ── 2) Bacak sürerken uç takibi ve iptal ──────────────────────────────
    if (durum === 1) {
      ucDip = Number.isFinite(ucDip) ? Math.min(ucDip, c.low) : c.low;
      if (p.iptalKirilim && kurulumBar !== null && i > kurulumBar && c.close > capaH) sifirla();
    } else if (durum === -1) {
      ucTepe = Number.isFinite(ucTepe) ? Math.max(ucTepe, c.high) : c.high;
      if (p.iptalKirilim && kurulumBar !== null && i > kurulumBar && c.close < capaL) sifirla();
    }
    if (p.kurulumZamanAsimi > 0 && (durum === 1 || durum === -1) && kurulumBar !== null
        && i - kurulumBar >= p.kurulumZamanAsimi) sifirla();
    // CHoCH bir kez tüketildiğinde kurulum kapanır; range aktif olduğu için
    // kurulumun açık kalması, aynı bacaktan ikinci bir range doğurmasına yol
    // açardı.
    if (aktif && kurulumTuketildi) { sifirla(); kurulumTuketildi = false; }

    // ── 3) LTF CHoCH: bacağın BİTTİĞİNİ onaylar → taze uç sabitlenir ──────
    for (const o of (ltfBarda.get(i) || [])) {
      if (p.sadeceCHoCH && !o.choch) continue;

      if (durum === 1 && o.tip === 1) {
        let taze = p.sinirKaynak === 'yapisal' ? o.level : ucDip;
        // 'bacak': tepeye GÖTÜREN dip de hesaba katılır — range sarı bacağın
        // tamamını kapsar, tepeden sonraki geri çekilmeyi değil.
        if (p.sinirKaynak === 'bacak' && Number.isFinite(bacakDip)) {
          taze = Number.isFinite(taze) ? Math.min(taze, bacakDip) : bacakDip;
        }
        if (Number.isFinite(taze) && taze < capaH && bacakYeter(i, capaH - taze)) {
          if (rangeKur(i, taze, capaH, 1)) { kurulumTuketildi = true; break; }
        }
      } else if (p.ciftYon && durum === -1 && o.tip === -1) {
        let taze = p.sinirKaynak === 'yapisal' ? o.level : ucTepe;
        if (p.sinirKaynak === 'bacak' && Number.isFinite(bacakTepe)) {
          taze = Number.isFinite(taze) ? Math.max(taze, bacakTepe) : bacakTepe;
        }
        if (Number.isFinite(taze) && taze > capaL && bacakYeter(i, taze - capaL)) {
          if (rangeKur(i, capaL, taze, -1)) { kurulumTuketildi = true; break; }
        }
      }
    }

    // ── 4) Aktif range: GENİŞLEME ve ÖLÜM ─────────────────────────────────
    if (aktif) {
      const R = rh - rl;
      // ÜÇÜNCÜ TEMAS: fiyat bacağın BAŞLADIĞI uca dönerse range onaylanır.
      // Yükseliş bacağında (rYon -1) o uç L, düşüşte (rYon 1) H'dir — yani her
      // zaman ESNEK uç. Kilit barında sayılmaz; orada fiyat zaten bacağın içinde.
      if (p.ucNoktaOnay && !onayli && kilitBar !== null && i > kilitBar) {
        const tol = p.temasTolerans * R;
        if (rYon === -1 ? c.low <= rl + tol : c.high >= rh - tol) {
          onayli = true;
          const son = ranges[ranges.length - 1];
          if (son && son.endIndex === null) son.onayBar = i;
        }
      }
      /**
       * ASİMETRİ BİLİNÇLİ:
       *   TAZE uç (CHoCH'un onayladığı sınır) ÖLDÜRÜR — yapı orada doğdu,
       *   kırılırsa dayanağı kalmaz.
       *   ESNEK uç (bacağın çapası) GENİŞLETİR — fiyat oraya taşarsa yapı
       *   ölmemiş, sadece büyümüştür. Kullanıcının "fiyat ölen range'e geri
       *   dönüyor" gözlemi tam olarak bunu söylüyordu.
       */
      const olumUstte = rYon === -1;                      // yükseliş bacağı: taze uç H
      const olumCizgi = olumUstte ? rh + p.olumTamponR * R : rl - p.olumTamponR * R;
      const ihlal = p.ihlalKaynak === 'kapanis'
        ? (olumUstte ? c.close > olumCizgi : c.close < olumCizgi)
        : (olumUstte ? c.high > olumCizgi : c.low < olumCizgi);

      /**
       * TAVAN DAVRANIŞI — ölçülmüş kusur (2026-08-17).
       * İlk sürüm tavana çarpınca range'i ÖLDÜRÜYORDU. Ölçüm: range sayısı
       * 60 → 114, ölen range'e dönüş %18.5 → %48.1. Yani tavan ölümü, tam da
       * kullanıcının şikâyet ettiği parçalanmayı ÜRETİYORDU.
       * 'durdur': tavana gelince genişleme durur, yapı yaşamaya devam eder;
       * ölüm yalnızca çapa kırılınca gelir.
       */
      let tavanAsildi = false;
      if (p.genisleme && !ihlal) {
        const tavanR = (Number.isFinite(ilkR) && ilkR > 0 && p.genislemeTavani > 0)
          ? p.genislemeTavani * ilkR : Infinity;
        if (!olumUstte && c.close > rh) {
          const yeni = Math.max(rh, c.high);
          if (yeni - rl <= tavanR) { rh = yeni; seviyeleriKur(); genisledi[i] = true; }
          else if (p.tavanDavranis === 'durdur') { rh = rl + tavanR; seviyeleriKur(); genisledi[i] = true; }
          else tavanAsildi = true;
        } else if (olumUstte && c.close < rl) {
          const yeni = Math.min(rl, c.low);
          if (rh - yeni <= tavanR) { rl = yeni; seviyeleriKur(); genisledi[i] = true; }
          else if (p.tavanDavranis === 'durdur') { rl = rh - tavanR; seviyeleriKur(); genisledi[i] = true; }
          else tavanAsildi = true;
        }
      }

      rangeLow[i] = rl; rangeHigh[i] = rh; eq[i] = rEq; devUp[i] = rUp; devDn[i] = rDn;
      rangeIdAt[i] = rangeId;

      if (ihlal) ihlalSayac++;
      else if (p.ihlalArdisik) ihlalSayac = 0;

      const yas = i - kilitBar;
      const yasBitti = p.maxYas > 0 && yas >= p.maxYas;
      if (yas > p.graceBar && (ihlalSayac >= p.ihlalBar || yasBitti || tavanAsildi)) {
        const son = ranges[ranges.length - 1];
        if (son) {
          son.endIndex = i; son.rangeLow = rl; son.rangeHigh = rh;
          son.olumSebep = tavanAsildi ? 'tavan' : (yasBitti ? 'sure' : 'capa');
        }
        oncekiRl = rl; oncekiRh = rh; oncekiR = rh - rl;
        aktif = false;
        rl = NaN; rh = NaN; rEq = NaN; rUp = NaN; rDn = NaN; rangeId = null; rYon = 0; ilkR = NaN;
      }
    }

    durumAt[i] = aktif ? 9 : durum;
    onayliAt[i] = aktif && onayli;
    baglamAt[i] = durum === 1 ? capaH : (durum === -1 ? capaL : NaN);
  }

  const zamanIndeks = new Map();
  candles.forEach((c, i) => zamanIndeks.set(c.time, i));

  return { rangeLow, rangeHigh, eq, devUp, devDn, rangeIdAt, durumAt, baglamAt,
    genisledi, onayliAt, atrLtf, ranges, zamanIndeks, n };
}

/**
 * Isınma: HTF yapısı için `htfCarpan × (htfLen + p + 2)` LTF barı gerekir,
 * üstüne fraktal onay gecikmesi ve bir kurulum payı.
 */
MtfChochRangeStrategy.warmupBars = (cfg = {}) => {
  const carpan = +cfg.htfCarpan || 6;
  const len = +cfg.htfLen || 5;
  return carpan * (len + Math.floor(len / 2) + 4) + 60;
};

MtfChochRangeStrategy.configWarnings = (cfg = {}) => {
  const u = [];
  const carpan = +cfg.htfCarpan || 6;
  if (carpan < 2) u.push('HTF çarpanı 2\'den küçük: yapı ile onay dilimi aynı olur, MTF anlamını yitirir.');
  if (carpan > 24) u.push('HTF çarpanı 24\'ten büyük: bir HTF mumu için çok fazla LTF barı gerekir, örneklem çöker.');
  if (cfg.allowShort !== false && (cfg.marketType || 'perpetual') !== 'perpetual') {
    u.push('Short açık ama piyasa vadeli değil: short sinyali üretilmez.');
  }
  if ((cfg.eqPartialPct !== undefined ? +cfg.eqPartialPct : 0) > 0) {
    u.push('EQ kısmi kârı açık: K8 ölçümü kısmiyi kaldırmanın beklentiyi ~ikiye katladığını gösterdi (PLAN-RANGE-KURALLARI.md §4).');
  }
  return u;
};

MtfChochRangeStrategy.paramSchema = {
  htfCarpan: { type: 'number', default: 6, min: 2, max: 24, step: 1, label: 'HTF çarpanı (kaç LTF barı = 1 HTF mumu)', group: 'Yapı', description: 'Bot ONAY diliminde çalışır, HTF bu seriden toplanır. 4H bot + 6 = 1D yapı. 1H bot + 4 = 4H yapı.' },
  htfLen: { type: 'number', default: 5, min: 3, max: 15, step: 1, label: 'HTF fraktal uzunluğu', group: 'Yapı' },
  frLen: { type: 'number', default: 5, min: 3, max: 15, step: 1, label: 'LTF fraktal uzunluğu', group: 'Yapı' },
  bacakModu: { type: 'string', default: 'zigzag', options: ['zigzag', 'salinim', 'choch'], label: 'Sınırları ne belirler', group: 'Yapı', description: 'zigzag = eşikli salınım; pivot ancak zıt yönde zzEsik kadar gidilirse sayılır (7 kesin etiketin 6\'sını tutturdu). salinim = ardışık iki HTF fraktalı (1/7). choch = 2026-08-17 akışı, çapa + LTF CHoCH seviyesi (etiketlerin neredeyse hiçbirini tutturmuyor).' },
  zzEsik: { type: 'number', default: 4, min: 0.5, max: 25, step: 0.5, label: 'Salınım eşiği (%)', group: 'Yapı', description: 'Zigzag modunda dönüşün pivot sayılması için gereken zıt yönlü hareket. 2026-08-19 ölçümünde %4 tepe yaptı (6/7); %3 ve %5 4/7. UYARI: eşik aynı etiketlerle seçildi, örneklem içi uyum.' },
  sadeceCHoCH: { type: 'boolean', default: true, label: 'Yalnızca CHoCH (BOS sayılmaz)', group: 'Yapı', description: 'Yalnızca choch modunda seviyeyi etkiler.' },
  ciftYon: { type: 'boolean', default: true, label: 'Ters kurulum da izlensin', group: 'Yapı', description: 'Yükseliş senaryosu: önce H, sonra L.' },
  iptalKirilim: { type: 'boolean', default: true, label: 'Kırılımda kurulumu iptal et', group: 'Yapı', description: 'HTF bağlam seviyesi ya da sabitlenmiş 1. sınır kapanışla delinirse kurulum düşer.' },
  capaSadeceUca: { type: 'boolean', default: true, label: 'Çapa yalnızca daha UCA taşınsın', group: 'Yapı', description: 'Bekleyen kurulum, kendisinden daha uç OLMAYAN yeni bir fraktalla yeniden çapalanmaz. Kapalıyken 2026-08-17 davranışı geri gelir — A/B ölçümü bu anahtarla yapılır.' },
  kurulumZamanAsimi: { type: 'number', default: 0, min: 0, step: 5, label: 'Kurulum zaman aşımı (bar · 0 = sınırsız)', group: 'Yapı' },
  sinirKaynak: { type: 'enum', values: ['yapisal', 'uc', 'bacak'], default: 'yapisal', label: 'Sabitlenen sınır', group: 'Yapı', description: 'yapisal = CHoCH\'un yapısal seviyesi (VARSAYILAN — yapı ölçütlerinin hepsinde en iyi: 4h\'te 58 range, medyan %28 genişlik, 240 bar ömür, %15.7 dönüş) · uc = kurulumdan beri gerçek uç (range şişiyor: %39 genişlik, 505 bar ömür) · bacak = bacağın öteki ucu (pratikte uc ile aynı sonuç). uc, ince örneklemde P&L\'i iyi gösteriyor ama yapıyı bozuyor.' },

  bacakEnAzAtr: { type: 'number', default: 2.5, min: 0, max: 10, step: 0.1, label: 'En az bacak genliği (× HTF ATR)', group: 'Yapı', description: 'İtki bacağı süzgeci. 0 = kapalı. Mikro salınımların range üretmesini engeller — resimdeki sarı çizgiler ATR ölçeğinde büyük bacaklardı. 2.5 ölçümle seçildi.' },
  tavanDavranis: { type: 'enum', values: ['oldur', 'durdur'], default: 'oldur', label: 'Genişleme tavanına gelince', group: 'Range', description: 'oldur = kırılım sayılır, range ölür (VARSAYILAN) · durdur = yapı yaşamaya devam eder. ÖLÇÜM: durdur, 1h\'te medyan ömrü 823 bara ve hayalet oranını %62.8\'e çıkarıyor — ölmeyen range yeni range\'i de engelliyor.' },
  atrPeriyot: { type: 'number', default: 14, min: 2, max: 100, step: 1, label: 'ATR periyodu (HTF)', group: 'Yapı' },

  genisleme: { type: 'boolean', default: true, label: 'Esnek uç genişlesin', group: 'Range', description: 'Fiyat bacağın çapa ucunu aşarsa range ÖLMEZ, o uca taşınır. Kapalıysa aşma da öldürür.' },
  genislemeTavani: { type: 'number', default: 3.0, min: 1, max: 6, step: 0.1, label: 'Genişleme tavanı (× ilk bacak)', group: 'Range', description: 'Aşılırsa yapı ölür. 3.0 ölçümle seçildi: 2.0\'de range sayısı 58→67 (4h) ve 49→73 (1h) artıyor, dönüş oranı da kötüleşiyor.' },
  olumTamponR: { type: 'number', default: 0.377, min: 0, max: 2, step: 0.05, label: 'Ölüm tamponu (R · taze uçtan)', group: 'Range', description: 'Ölüm çizgisi = taze uç ∓ tampon × R. 0 = tam sınırda.' },
  ucNoktaOnay: { type: 'boolean', default: true, label: '3. temas beklensin (L/H/L · H/L/H)', group: 'Range', description: 'Bacak iki noktayla çizilir ama iki nokta range\'in durduğunu göstermez. Fiyat bacağın başladığı uca dönene kadar range ADAY sayılır ve işlem açılmaz — "range hâlâ büyürken işleme giriyoruz" kusurunun çözümü.' },
  temasTolerans: { type: 'number', default: 0, min: 0, max: 0.5, step: 0.01, label: 'Temas toleransı (R)', group: 'Range', description: '0 = fiyat sınıra tam dokunmalı. Büyütmek yaklaşan ama değmeyen dönüşleri de temas sayar.' },
  icRangeEngeli: { type: 'boolean', default: true, label: 'İç range engeli', group: 'Range', description: 'Ölmüş range\'in içinde ve ondan dar yeni yapı kurulmaz. Parçalanmanın doğrudan panzehiri.' },
  devralmaOrtusme: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.05, label: 'Devralma eşiği (örtüşme)', group: 'Range', description: 'Yeni yapının aktif range\'i devralabilmesi için örtüşmesi bu oranın ALTINDA olmalı. 0 = devralma yok (range ölümsüz kalabilir) · 1 = her yeni yapı devralır (ekran konfetiye döner: 4h\'te 38 → 206 range).' },
  eqSeviye: { type: 'number', default: 0.5, min: 0.1, max: 0.9, step: 0.05, label: 'EQ katsayısı', group: 'Range' },
  devKat: { type: 'number', default: 0.377, min: 0.05, max: 2, step: 0.001, label: 'Sapma (stop) katsayısı', group: 'Range' },
  ihlalKaynak: { type: 'enum', values: ['kapanis', 'fitil'], default: 'kapanis', label: 'İhlal', group: 'Range' },
  ihlalBar: { type: 'number', default: 2, min: 1, max: 10, step: 1, label: 'Ölüm için gereken ihlal barı', group: 'Range' },
  ihlalArdisik: { type: 'boolean', default: true, label: 'İhlal barları ardışık olmalı', group: 'Range' },
  graceBar: { type: 'number', default: 5, min: 0, step: 1, label: 'Kilitten sonra ihlal muafiyeti (bar)', group: 'Range' },
  maxYas: { type: 'number', default: 0, min: 0, step: 10, label: 'En fazla yaşam (bar · 0 = sınırsız)', group: 'Range' },
  enAzGenislik: { type: 'number', default: 0, min: 0, max: 20, step: 0.1, label: 'En az genişlik (% · 0 = kapalı)', group: 'Range' },

  hedefTur: { type: 'enum', values: ['karsi', 'eq'], default: 'karsi', label: 'Hedef', group: 'İşlem', description: 'karsi = karşı sınır (tam hedef) · eq = EQ. K8 ölçümü tam hedefi işaret ediyor.' },
  girisModu: { type: 'enum', values: ['supurme', 'limit'], default: 'supurme', label: 'Giriş modu', group: 'İşlem', description: 'supurme = sınır dışında kapanış (süpürme) sonrası range\'e geri dönüş barında giriş, stop süpürmenin ucunda · limit = sınıra pasif limit emir (eski). Süpürme modu kullanıcının elle yaptığı işlemin kuralıdır.' },
  stopTamponAtr: { type: 'number', default: 1.0, min: 0, max: 5, step: 0.1, label: 'Stop tamponu (× ATR · süpürme ucundan)', group: 'İşlem' },
  supurmeGecerlilikBar: { type: 'number', default: 3, min: 1, max: 20, step: 1, label: 'Süpürmenin geçerlilik süresi (bar)', group: 'İşlem', description: 'Giriş, süpürmeden sonraki bu kadar bar içindeki geri dönüşte olmalı. Aksi hâlde bayat süpürme, sınırdan uzakta anlamsız giriş üretir.' },
  cizimBekleBar: { type: 'number', default: 3, min: 0, max: 20, step: 1, label: 'Genişlemeden sonra bekleme (bar)', group: 'İşlem', description: 'Range hâlâ genişliyorken işleme girilmez — "çizim aşamasında giriş" kusuruna karşı.' },
  yenidenGirisEq: { type: 'boolean', default: true, label: 'Yeniden giriş için EQ\'ya dönüş şartı', group: 'İşlem', description: 'Pozisyon kapandıktan sonra fiyat EQ\'ya dönmeden aynı sınıra yeniden girilmez. Kapalıyken uzun yaşayan range\'de bot sınırda makineli tüfek gibi giriyor (ölçüldü: 2 range / 320 işlem / −%99.5).' },
  maxIslem: { type: 'number', default: 0, min: 0, max: 50, step: 1, label: 'Range başına en fazla işlem (0 = sınırsız)', group: 'İşlem' },
  eqPartialPct: { type: 'number', default: 0, min: 0, max: 0.95, step: 0.05, label: 'EQ kısmi oranı', group: 'İşlem', description: '0 = kısmi yok. Ölçüm kısmi kârın beklentiyi düşürdüğünü gösterdi; parametre sınanabilsin diye açık.' },
  breakevenAfterEq: { type: 'boolean', default: false, label: 'EQ sonrası breakeven', group: 'İşlem' },
  closeOnRangeDeath: { type: 'boolean', default: true, label: 'Range ölünce kapat', group: 'İşlem' },
  stopBufferR: { type: 'number', default: 0, min: 0, max: 2, step: 0.05, label: 'Stop tamponu (R)', group: 'İşlem' },
  allocationPct: { type: 'number', default: 20, min: 1, max: 100, step: 1, label: 'Pozisyon büyüklüğü (% nakit)', group: 'İşlem' },
  allowLong: { type: 'boolean', default: true, label: 'Long açık', group: 'İşlem' },
  allowShort: { type: 'boolean', default: true, label: 'Short açık', group: 'İşlem' },

  feePct: { type: 'number', default: 0.15, min: 0, max: 1, step: 0.01, label: 'Tek yön komisyon (%)', group: 'Maliyet' },
  minCostMultiple: { type: 'number', default: 0, min: 0, max: 20, step: 0.5, label: 'Maliyet kapısı (komisyon katı · 0 = kapalı)', group: 'Maliyet' }
};

/**
 * Optimizasyon ızgarası — 48 kombinasyon.
 *
 * Bilinçli olarak DAR: PLAN-RANGE-KURALLARI.md'nin yöntem uyarısı "adaylar aynı
 * veride tek tek denenirse sigmoid_bb yoluna girilir" diyor. Buradaki amaç en
 * iyi ayarı bulmak değil, kuralın parametreye ne kadar duyarlı olduğunu
 * görmek. Seçilen ayar kill kriterine ayrıca sokulmalı.
 */
MtfChochRangeStrategy.optimizeGrid = {
  htfCarpan: [4, 6],
  frLen: [3, 5],
  devKat: [0.25, 0.377, 0.55],
  ihlalBar: [1, 2],
  hedefTur: ['karsi', 'eq']
};

/**
 * ÖLÇÜM KANCASI — yalnızca `scripts/` altındaki ölçüm betikleri için.
 * Motorun kendisi kullanmaz. Yapı kuralını etiket setine karşı sınayabilmek
 * için gerekiyor; kopyasını çıkarmak ikizi üçe bölerdi.
 */
MtfChochRangeStrategy._ic = { akisIsle, htfTopla, hesapla };

module.exports = MtfChochRangeStrategy;
