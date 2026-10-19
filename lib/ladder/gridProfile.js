/**
 * GRID PROFİLİ — referansın iki yanına simetrik basamaklar
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *              ┌── SHORT girişleri (referansın ÜSTÜ)
 *   referans ──┤
 *              └── LONG girişleri (referansın ALTI)
 *
 * DCA'dan üç yapısal farkı var ve üçü de `gecerlilik` alanının neden
 * eklendiğini açıklıyor:
 *
 *   1. Basamaklar ZİNCİRLEME DEĞİL, REFERANSA GÖRE. Grid'in tamamı tek bir
 *      merkeze asılıdır; merkez kayınca hepsi birlikte kayar. DCA'da her
 *      basamak bir öncekine asılı olduğu için böyle bir kayma tanımsızdır.
 *
 *   2. HER BASAMAĞIN KENDİ TP'Sİ VAR ve bir basamak berisidir. Grid'in kârı
 *      buradan gelir: fiyat basamaklar arasında gidip gelirken her tur bir
 *      adımlık kâr yazar. DCA'da tek bir TP vardır ve pozisyonun
 *      ORTALAMASINA asılıdır.
 *
 *   3. Plan KAYABİLİR ya da İPTAL OLABİLİR (`gecerlilik.tur === 'kayan'`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARALIK ATR CİNSİNDEN — YÜZDE DEĞİL
 * ═══════════════════════════════════════════════════════════════════════════
 * F2'de ölçülen sebep aynen geçerli: aynı fraktal genişlik 4h'te %12–20,
 * 1h'te %4.6–6.6 çıkıyordu. Yüzde aralıklı bir grid'i bir zaman diliminde
 * ayarlayıp diğerinde kullanmak, farkında olmadan bambaşka bir grid kurmak
 * demek. ATR cinsinden aralık her yerde aynı şeyi ifade eder.
 *
 * Yüzde yine de KABUL EDİLİYOR (`adimYuzde`) çünkü bazı varlıklarda ATR
 * anlamsızca dar kalıyor — ama ikisi birden verilirse HATA atılır. Sessizce
 * birini seçmek, kullanıcının hangi grid'i kurduğunu bilmemesi demek.
 */

const { profilKaydet } = require('./planner');

const gridProfili = {
  /**
   * @param {object} g
   *   referans        merkez fiyat
   *   yon             'iki' | 'long' | 'short'   (varsayılan 'iki')
   *   kademe          her yanda kaç basamak
   *   adimAtr         basamak aralığı, ATR katı        ⎫ İKİSİ BİRDEN
   *   adimYuzde       basamak aralığı, ondalık yüzde   ⎭ VERİLEMEZ
   *   atr             o bardaki ATR (adimAtr kullanılıyorsa zorunlu)
   *   tutar           basamak başına tutar
   *   tutarTipi       'Fixed' | '% of equity'
   *   sermaye         '% of equity' modunda taban
   *   tpAdim          TP kaç basamak beride (varsayılan 1)
   *   yenidenMerkezAtr  merkez bu kadar ATR kayınca plan yeniden kurulur
   */
  kur(g) {
    const referans = g.referans;
    const yon = ['iki', 'long', 'short'].includes(g.yon) ? g.yon : 'iki';
    const kademe = Math.max(0, Math.floor(g.kademe || 0));
    const tpAdim = Math.max(1, Math.floor(g.tpAdim || 1));

    const atrVar = Number.isFinite(g.adimAtr);
    const yuzdeVar = Number.isFinite(g.adimYuzde);
    if (atrVar && yuzdeVar) {
      throw new Error('Grid aralığı hem adimAtr hem adimYuzde ile verilemez — hangisi geçerli belirsiz kalır.');
    }
    if (!atrVar && !yuzdeVar) {
      throw new Error('Grid aralığı verilmedi: adimAtr ya da adimYuzde gerekli.');
    }

    /** Aralık MUTLAK FİYAT olarak çözülür; iki mod da aynı sayıya iner. */
    let aralik;
    if (atrVar) {
      if (!(Number.isFinite(g.atr) && g.atr > 0)) {
        throw new Error('adimAtr verildi ama geçerli bir atr yok — ısınma barında grid kurulamaz.');
      }
      aralik = g.adimAtr * g.atr;
    } else {
      aralik = g.adimYuzde * referans;
    }
    if (!(aralik > 0)) {
      return { yon, seviyeler: [], gecerlilik: { tur: 'gecersiz' } };
    }

    const tutar = g.tutarTipi === '% of equity'
      ? (g.tutar / 100) * g.sermaye
      : g.tutar;

    const seviyeler = [];

    /**
     * Basamaklar merkezden DIŞARI doğru numaralanır (L1 en yakın alt, L2
     * bir aşağısı…). Numaralandırma merkeze göre olduğu için grid kayınca
     * kimlikler anlamını korur — "L1 hep en yakın alt basamak".
     */
    const basamakEkle = (k, taraf) => {
      const fiyat = taraf === 'long' ? referans - k * aralik : referans + k * aralik;
      if (!(fiyat > 0)) return false;

      /**
       * TP bir basamak BERİDE — yani merkeze doğru. Alt basamakta alınan
       * long, bir üst basamakta satılır. `tpAdim` bunu genişletir.
       *
       * Merkezin ÖTESİNE geçen bir TP kırpılmaz: fiyat merkezden karşı
       * tarafa sarkabilir ve orada kapanmak hâlâ geçerli bir çıkıştır.
       */
      const tp = taraf === 'long'
        ? fiyat + tpAdim * aralik
        : fiyat - tpAdim * aralik;

      seviyeler.push({
        id: `${taraf === 'long' ? 'L' : 'S'}${k}`,
        yon: taraf,
        fiyat: +fiyat.toFixed(8),
        tutar,
        // DCA ile aynı sözleşme: miktar YUVARLANMAMIŞ fiyata bölünür.
        qty: tutar / fiyat,
        tp: +tp.toFixed(8),
        gecerlilik: null
      });
      return true;
    };

    for (let k = 1; k <= kademe; k++) {
      if (yon === 'iki' || yon === 'long') {
        // Alt basamak sıfırın altına düşerse merdiven ORADA kesilir —
        // DCA'daki `break` ile aynı kural.
        if (!basamakEkle(k, 'long')) break;
      }
    }
    for (let k = 1; k <= kademe; k++) {
      if (yon === 'iki' || yon === 'short') basamakEkle(k, 'short');
    }

    return {
      yon,
      seviyeler,
      /**
       * 'kayan' = plan iptal edilip yeniden kurulabilir. DCA'nın 'sabit'
       * geçerliliğinden ayrılan tek yapısal fark bu; grid'in var olma
       * sebebi de burası.
       *
       * `yenidenMerkezAtr` verilmemişse eşik YOK demektir ve plan kendi
       * kendine kaymaz — varsayılan bir eşik uydurmak, kullanıcının
       * istemediği bir yeniden merkezleme davranışı katardı.
       */
      gecerlilik: {
        tur: 'kayan',
        merkez: referans,
        aralik,
        yenidenMerkezAtr: Number.isFinite(g.yenidenMerkezAtr) ? g.yenidenMerkezAtr : null
      }
    };
  }
};

profilKaydet('grid', gridProfili);

module.exports = gridProfili;
