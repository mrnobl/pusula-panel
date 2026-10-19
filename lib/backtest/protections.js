/**
 * KORUMA KATMANI — strateji sonuçlarına bakıp yeni girişi kilitler (M6)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NEDEN VAR
 * ═══════════════════════════════════════════════════════════════════════════
 * `lib/riskManager.js` sermayeye bakar: drawdown, kill-switch, kademe. Ama
 * STRATEJİNİN SONUÇLARINA bakan bir katman yoktu — arka arkaya stop yemek,
 * bir varlığın kâr üretmemesi, çıkıştan hemen sonra yeniden girmek.
 *
 * Bu katmanın stratejinin İÇİNDE olamamasının sebebi ölçülmüş: DCA/grid
 * merdiveni **zarar büyüdükçe pozisyonu BÜYÜTEN** bir mekanizmadır. Kendi
 * içinden "bu iş yürümüyor" diyemez; her yeni basamak ortalamayı düşürdüğü
 * için kendi gözünde durum hep iyileşiyordur. Fren üstte durmalı.
 *
 * Emsal: Freqtrade'in Protections eklentileri (`referans/freqtrade.md` §4).
 * ⚠ GPL-3.0 — **kod alınmadı**, yalnızca hangi korumaların gerektiği fikri.
 * Kurallar burada kendi kelimelerimizle ve kendi motorumuzun kavramlarıyla
 * yeniden yazıldı.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VARSAYILAN KAPALI — MEVCUT ÖLÇÜMLER DEĞİŞMESİN
 * ═══════════════════════════════════════════════════════════════════════════
 * Hiçbir koruma yapılandırılmamışsa katman TAMAMEN devre dışıdır: giriş
 * sorusu sabit bir "serbest" döndürür, bar sonu ve kapanış kayıtları hiç
 * tutulmaz. Yedi mevcut stratejinin sonucu bu yüzden birebir aynı kalır ve
 * mutabakat bunu kanıtlar.
 *
 * ⚠ Bu modül KARAR VERİR, uygulamaz: pozisyon açmaz, kapatmaz, emir
 * iptal etmez. Yalnızca "yeni giriş serbest mi" sorusunu cevaplar. Açık
 * pozisyonların çıkışına ASLA karışmaz — bir freni, açık bir pozisyonu
 * stop'suz bırakacak şekilde çalıştırmak korumanın kendisini riske çevirir.
 */

const SERBEST = Object.freeze({ serbest: true, sebep: null, bitisBar: 0 });

/** Sayı mı ve pozitif mi — yapılandırma değerleri sessizce yok sayılmasın. */
const gecerli = (n) => Number.isFinite(n) && n > 0;

class Korumalar {
  /**
   * @param {object} cfg  `strategyConfig.protections`
   *
   * Her koruma AYRI AYRI açılır; biri açık diğerleri kapalı olabilir.
   * Bilinmeyen anahtar sessizce yok sayılmaz — `bilinmeyenAnahtarlar`
   * künyede görünür, çünkü yanlış yazılmış bir koruma adı "koruma var
   * sanıp korumasız koşmak" demektir.
   */
  constructor(cfg) {
    const c = cfg || {};
    this.tanimlar = {};

    /**
     * STOP KALKANI — pencerede N stop yenirse yeni giriş durur.
     *
     * `pencereBar` kadar geriye bakar, `islemSiniri` kadar stop görürse
     * `durmaBar` kadar yeni giriş kapanır. Sayılan yalnızca STOP'tur;
     * hedefe ulaşıp kapanan işlem burada sayılmaz, çünkü ölçülen şey
     * "strateji yanılıyor mu", "işlem yapıyor mu" değil.
     */
    if (c.stopKalkani && gecerli(c.stopKalkani.pencereBar) && gecerli(c.stopKalkani.islemSiniri)) {
      this.tanimlar.stopKalkani = {
        pencereBar: c.stopKalkani.pencereBar,
        islemSiniri: c.stopKalkani.islemSiniri,
        durmaBar: gecerli(c.stopKalkani.durmaBar) ? c.stopKalkani.durmaBar : c.stopKalkani.pencereBar,
        yonBazli: c.stopKalkani.yonBazli === true
      };
    }

    /**
     * MAKSİMUM DÜŞÜŞ — pencere içindeki zirveden `esikPct` düşülürse durur.
     *
     * Zirve PENCERE İÇİNDEKİ zirvedir, koşunun tamamındaki değil: koşu
     * zirvesine göre ölçmek, aylar önceki bir tepeden sonra freni sürekli
     * basılı tutardı.
     */
    if (c.maxDusus && gecerli(c.maxDusus.pencereBar) && gecerli(c.maxDusus.esikPct)) {
      this.tanimlar.maxDusus = {
        pencereBar: c.maxDusus.pencereBar,
        esikPct: c.maxDusus.esikPct,
        durmaBar: gecerli(c.maxDusus.durmaBar) ? c.maxDusus.durmaBar : c.maxDusus.pencereBar
      };
    }

    /**
     * SOĞUMA — her kapanıştan sonra zorunlu bekleme.
     *
     * Kapanış sebebine bakmaz. Sebebe bakan koruma stop kalkanıdır; bu
     * fren "aynı bara geri dönme" davranışını kesmek içindir.
     */
    if (c.soguma && gecerli(c.soguma.durmaBar)) {
      this.tanimlar.soguma = { durmaBar: c.soguma.durmaBar };
    }

    /**
     * DÜŞÜK KÂR — pencerede en az N işlem kapandıysa ve TOPLAM sonuç
     * eşiğin altındaysa durur.
     *
     * `islemSiniri` olmadan tek bir zararlı işlem freni indirirdi; ölçülen
     * şey "bu kurulum bu piyasada para kazanıyor mu", tek işlemin sonucu
     * değil.
     */
    if (c.dusukKar && gecerli(c.dusukKar.pencereBar) && gecerli(c.dusukKar.islemSiniri)) {
      this.tanimlar.dusukKar = {
        pencereBar: c.dusukKar.pencereBar,
        islemSiniri: c.dusukKar.islemSiniri,
        gerekenKar: Number.isFinite(c.dusukKar.gerekenKar) ? c.dusukKar.gerekenKar : 0,
        durmaBar: gecerli(c.dusukKar.durmaBar) ? c.dusukKar.durmaBar : c.dusukKar.pencereBar
      };
    }

    const BILINEN = ['stopKalkani', 'maxDusus', 'soguma', 'dusukKar'];
    this.bilinmeyenAnahtarlar = Object.keys(c).filter(k => !BILINEN.includes(k));

    this.aktif = Object.keys(this.tanimlar).length > 0;

    /** Kapanan işlemler: { bar, sebepKodu, kar, yon } */
    this.kapananlar = [];
    /** Sermaye izi: { bar, deger } — yalnızca `maxDusus` açıkken tutulur. */
    this.sermayeIzi = [];
    /** Kilit: hangi bara kadar giriş kapalı. */
    this.kilitBitis = 0;
    this.kilitSebep = null;
    /** Kaç giriş isteği kilit yüzünden reddedildi — künyede görünmeli. */
    this.engellenen = 0;
    this.tetikleyenler = {};
  }

  /**
   * Yeni giriş serbest mi?
   *
   * Kapalıyken PAYLAŞILAN donmuş nesne döner — her barda yeni nesne
   * ayırmak, korumasız koşuya bedel bindirirdi.
   */
  girisSerbest(bar) {
    if (!this.aktif) return SERBEST;
    if (bar < this.kilitBitis) {
      this.engellenen++;
      return { serbest: false, sebep: this.kilitSebep, bitisBar: this.kilitBitis };
    }
    return SERBEST;
  }

  /** Bir işlem kapandı. Motor her TAM kapanışta çağırır. */
  islemKapandi(bar, kayit) {
    if (!this.aktif) return;
    this.kapananlar.push({
      bar,
      sebepKodu: kayit.sebepKodu || null,
      kar: Number.isFinite(kayit.profitUSDT) ? kayit.profitUSDT : 0,
      yon: kayit.direction === 'short' ? 'short' : 'long'
    });
    this._degerlendir(bar);
  }

  /** Bar sonu — sermaye izi ve düşüş kontrolü. */
  barSonu(bar, sermaye) {
    if (!this.aktif) return;
    if (this.tanimlar.maxDusus) {
      this.sermayeIzi.push({ bar, deger: sermaye });
      // Pencere dışına düşenler atılır; iz sınırsız büyümesin.
      const sinir = bar - this.tanimlar.maxDusus.pencereBar;
      while (this.sermayeIzi.length && this.sermayeIzi[0].bar < sinir) this.sermayeIzi.shift();
    }
    this._degerlendir(bar);
  }

  /* ── İç değerlendirme ─────────────────────────────────────────────── */

  _kilitle(bar, durmaBar, sebep) {
    const bitis = bar + durmaBar;
    // En UZUN kilit kazanır; kısa bir fren uzun bir freni açamamalı.
    if (bitis > this.kilitBitis) {
      this.kilitBitis = bitis;
      this.kilitSebep = sebep;
    }
    this.tetikleyenler[sebep] = (this.tetikleyenler[sebep] || 0) + 1;
  }

  _pencerede(bar, pencereBar) {
    const bas = bar - pencereBar;
    return this.kapananlar.filter(k => k.bar > bas);
  }

  _degerlendir(bar) {
    const t = this.tanimlar;

    if (t.stopKalkani) {
      const p = t.stopKalkani;
      const stoplar = this._pencerede(bar, p.pencereBar)
        .filter(k => k.sebepKodu === 'stop' || k.sebepKodu === 'likidasyon');
      if (p.yonBazli) {
        for (const yon of ['long', 'short']) {
          if (stoplar.filter(k => k.yon === yon).length >= p.islemSiniri) {
            this._kilitle(bar, p.durmaBar, `stop-kalkani-${yon}`);
          }
        }
      } else if (stoplar.length >= p.islemSiniri) {
        this._kilitle(bar, p.durmaBar, 'stop-kalkani');
      }
    }

    if (t.maxDusus && this.sermayeIzi.length > 1) {
      const p = t.maxDusus;
      let zirve = -Infinity;
      for (const s of this.sermayeIzi) if (s.deger > zirve) zirve = s.deger;
      const son = this.sermayeIzi[this.sermayeIzi.length - 1].deger;
      if (zirve > 0) {
        const dususPct = ((zirve - son) / zirve) * 100;
        if (dususPct >= p.esikPct) this._kilitle(bar, p.durmaBar, 'max-dusus');
      }
    }

    if (t.soguma && this.kapananlar.length) {
      const sonKapanis = this.kapananlar[this.kapananlar.length - 1];
      if (sonKapanis.bar === bar) this._kilitle(bar, t.soguma.durmaBar, 'soguma');
    }

    if (t.dusukKar) {
      const p = t.dusukKar;
      const pencere = this._pencerede(bar, p.pencereBar);
      if (pencere.length >= p.islemSiniri) {
        const toplam = pencere.reduce((a, k) => a + k.kar, 0);
        if (toplam < p.gerekenKar) this._kilitle(bar, p.durmaBar, 'dusuk-kar');
      }
    }
  }

  /* ── Künye ────────────────────────────────────────────────────────── */

  ozet() {
    if (!this.aktif) {
      return {
        aktif: false,
        bilinmeyenAnahtarlar: this.bilinmeyenAnahtarlar
      };
    }
    return {
      aktif: true,
      korumalar: Object.keys(this.tanimlar),
      engellenenGiris: this.engellenen,
      tetikleyenler: this.tetikleyenler,
      sonKilitBitis: this.kilitBitis,
      bilinmeyenAnahtarlar: this.bilinmeyenAnahtarlar
    };
  }
}

module.exports = { Korumalar };
