/**
 * DCA PROFİLİ — bugünkü `dca_bot` merdiveninin aynısı
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   BO  : referans fiyat (koşulun sağlandığı barın kapanışı)
 *   SO1 : BO  × (1 − sapma)
 *   SO2 : SO1 × (1 − sapma × adımÇarpanı)
 *   SO3 : SO2 × (1 − sapma × adımÇarpanı²)   …
 *
 * Tutarlar da büyür: güvenlikTutarı × hacimÇarpanı^(k−1).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BASAMAKLAR ZİNCİRLEME — REFERANSA GÖRE DEĞİL
 * ═══════════════════════════════════════════════════════════════════════════
 * Her basamak BİR ÖNCEKİ basamağa göre hesaplanır (`sonSeviye`), referansa
 * göre değil. Fark küçük görünür ama adım çarpanı 1'den büyükken hızla
 * açılır — ve yönü SEZGİNİN TERSİ: zincirleme merdiven referansa göre
 * hesaplanandan daha aşağı DEĞİL, daha yukarı iner.
 *
 *     zincir          = referans × ∏(1 − sapma_k)
 *     referansa göre  = referans × (1 − Σ sapma_k)
 *
 * ve ∏(1−a) > 1−Σa her zaman doğrudur. Örnek (sapma %1.5, çarpan 1.6, 6
 * basamak): zincirleme 65.93'e iner, referansa göre 60.56'ya inerdi. Sapma
 * her adımda KALAN fiyata uygulandığı için taban küçülür.
 *
 * `dcaBotStrategy` zincirleme yapıyor; burada da öyle.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * GEÇERLİLİK: 'sabit'
 * ═══════════════════════════════════════════════════════════════════════════
 * DCA merdiveni kurulduktan sonra değişmez; yalnızca deal kapanınca komple
 * iptal edilir. Bugünkü davranış bu, ve F4 bunun DEĞİŞMEMESİNİ istiyor.
 * Alan yine de dolduruluyor ki grid profili ikinci bir türle gelebilsin.
 */

const { profilKaydet } = require('./planner');

/** `k`. güvenlik emrinin BİR ÖNCEKİ seviyeye göre sapması. */
const sapma = (k, p) => p.priceDeviation * Math.pow(p.safeOrderStepScale, k - 1);

/** Tutar, 'Fixed' modunda mutlak; '% of equity' modunda sermayenin yüzdesi. */
const tutarCoz = (deger, tip, sermaye) => (tip === 'Fixed' ? deger : (deger / 100) * sermaye);

const dcaProfili = {
  /**
   * @param {object} g
   *   referans              BO fiyatı
   *   yon                   'long' | 'short'
   *   sermaye               '% of equity' modunda taban
   *   orderSizeType         'Fixed' | '% of equity'
   *   baseOrder, safeOrder
   *   maxSafeOrder, priceDeviation (ondalık), safeOrderVolumeScale,
   *   safeOrderStepScale
   *   takeProfit (ondalık), takeProfitType
   */
  kur(g) {
    const p = {
      priceDeviation: g.priceDeviation,
      safeOrderStepScale: g.safeOrderStepScale,
      safeOrderVolumeScale: g.safeOrderVolumeScale,
      maxSafeOrder: Math.max(0, Math.floor(g.maxSafeOrder || 0))
    };
    const yon = g.yon === 'short' ? 'short' : 'long';
    const uzun = yon === 'long';
    const referans = g.referans;
    const sermaye = g.sermaye;

    const bazTutar = tutarCoz(g.baseOrder, g.orderSizeType, sermaye);

    /**
     * TP hesabı `dcaBotStrategy`nin çıkış mantığının aynısı: 'toplam hacim'
     * modunda pozisyonun ORTALAMASINA, 'baz emir' modunda BO'ya uygulanır.
     * Plan kurulurken ortalama henüz bilinmediği için ilk basamakta ikisi de
     * referanstır; sonraki basamakların TP'si ancak dolduklarında ortalama
     * üzerinden yeniden hesaplanır. Bu yüzden `tp` alanı PLANLANAN hedeftir,
     * kesin çıkış değil — motor pozisyon ortalamasından kendi hedefini kurar.
     */
    const tpCarpan = Number.isFinite(g.takeProfit)
      ? (uzun ? 1 + g.takeProfit : 1 - g.takeProfit)
      : null;
    const tpHesapla = (fiyat) => (tpCarpan === null ? null : fiyat * tpCarpan);

    const seviyeler = [{
      id: 'BO',
      yon,
      // Fiyat 8 haneye yuvarlanır…
      fiyat: +referans.toFixed(8),
      tutar: bazTutar,
      // …ama miktar YUVARLANMAMIŞ referansa bölünür. Bkz. planner.js
      // "KORUNAN TUHAFLIK" — bilinçli olarak düzeltilmedi.
      qty: bazTutar / referans,
      tp: tpHesapla(referans),
      gecerlilik: null
    }];

    let sonSeviye = referans;
    for (let k = 1; k <= p.maxSafeOrder; k++) {
      const sap = sapma(k, p);
      const seviye = uzun ? sonSeviye * (1 - sap) : sonSeviye * (1 + sap);
      /**
       * Sapma toplamı %100'ü aşınca seviye sıfırın altına düşer ve merdiven
       * ORADA KESİLİR — kalan basamaklar hiç üretilmez. `dcaBotStrategy`
       * aynı yerde `break` ediyor; negatif fiyatlı emir üretmek yerine
       * merdiveni kısaltmak doğru davranış, ama sessiz: kullanıcı 6 basamak
       * isteyip 4 alır. Uyarıyı `configWarnings` veriyor.
       */
      if (!(seviye > 0)) break;

      const tutar = tutarCoz(g.safeOrder, g.orderSizeType, sermaye)
        * Math.pow(p.safeOrderVolumeScale, k - 1);

      seviyeler.push({
        id: `SO${k}`,
        yon,
        fiyat: +seviye.toFixed(8),
        tutar,
        qty: tutar / seviye,
        tp: tpHesapla(seviye),
        gecerlilik: null
      });
      sonSeviye = seviye;
    }

    return {
      yon,
      seviyeler,
      /**
       * 'sabit' = plan hiçbir koşulda güncellenmez, yalnızca komple iptal
       * edilir (deal kapanınca `cancelAll`). Bugünkü DCA davranışının adı.
       */
      gecerlilik: { tur: 'sabit' }
    };
  }
};

profilKaydet('dca', dcaProfili);

module.exports = dcaProfili;
