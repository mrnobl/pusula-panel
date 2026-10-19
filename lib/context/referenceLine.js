/**
 * REFERANS HATTI — "fiyatın içinde gezen çizgi" (`PLAN-GRID-DCA.md` §4.1, F2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Grid ve DCA'nın ortak çapası. Hangi çizgi olursa olsun aynı şeyi döndürür:
 *
 *   deger[i]    çizginin o bardaki fiyatı
 *   egim[i]     yönü      — ATR cinsinden
 *   mesafe[i]   uzaklığı  — ATR cinsinden, İŞARETSİZ
 *   taraf[i]    +1 fiyat üstünde, −1 altında
 *   kaynak      'ema' | 'vwap' | 'avwap' | 'eq' | 'poc'
 *
 * Böylece **"MA mı AVWAP mı" bir PARAMETRE olur**: yeni bir çizgi eklemek
 * yeni bir sağlayıcı yazmak demektir, stratejiye dokunmak değil.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NEDEN ATR CİNSİNDEN
 * ═══════════════════════════════════════════════════════════════════════════
 * Yüzde mesafe varlıklar VE zaman dilimleri arasında kıyaslanamaz. Bu depoda
 * ölçüldü: aynı fraktal genişliği 4h'te %12–20, 1h'te %4.6–6.6 çıkıyordu —
 * aynı sayı iki dilimde farklı şey demekti. ATR cinsinden mesafe, "fiyat
 * çizgiden ne kadar uzakta" sorusunu her yerde aynı birimle cevaplar.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ISINMA UYDURULMAZ
 * ═══════════════════════════════════════════════════════════════════════════
 * Isınma barlarında dört dizi de `null` taşır ve `warmup` alanı kaç bar
 * gerektiğini SÖYLER. Isınmayı sıfırla doldurmak, stratejiye "çizgi tam
 * fiyatın üstünde" dedirtir ve ilk barlarda sahte sinyal üretir — bu depoda
 * gösterge havuzu tam bu yüzden ısınma bildirimini zorunlu kılıyor.
 */

const havuz = require('../indicatorPool');

/** ATR sıfır ya da tanımsızken bölme yapılmaz — sahte büyük sayı üretmesin. */
const atrBol = (fark, atr) => (Number.isFinite(atr) && atr > 0 ? fark / atr : null);

/* ═══ SAĞLAYICILAR ═════════════════════════════════════════════════════════
   Her sağlayıcı `{ seri, warmup }` döndürür. `seri` mum dizisiyle AYNI
   uzunlukta olmalı ve ısınmada `null` taşımalı — hizalama sözleşmesi
   gösterge havuzununkiyle aynı, çünkü strateji ikisini yan yana okuyacak. */

const SAGLAYICILAR = {
  /** Üstel hareketli ortalama — en yalın referans. */
  ema(mumlar, p) {
    const r = havuz.computeOne(mumlar, 'ema', { period: p.period || 50, source: p.source || 'close' });
    return { seri: r.value, warmup: p.period || 50 };
  },

  /** Dönemsel VWAP (gün/hafta/ay) — hacim ağırlıklı, seans sıfırlamalı. */
  vwap(mumlar, p) {
    const r = havuz.computeOne(mumlar, 'vwap_period', { anchor: p.anchor || 'day' });
    return { seri: r.vwap, warmup: 0 };
  },

  /** Çapalı VWAP — çapa salınım noktası ya da hacim zirvesi olabilir. */
  avwap(mumlar, p) {
    const r = havuz.computeOne(mumlar, 'vwap_anchored', {
      mode: p.mode || 'swing',
      swingAtrMultiple: p.swingAtrMultiple,
      swingLookback: p.swingLookback
    });
    return { seri: r.vwap, warmup: 40 };
  },

  /** Denge (equilibrium) — işlem aralığının ortası. */
  eq(mumlar, p) {
    const r = havuz.computeOne(mumlar, 'dealing_range', {
      swingAtrMultiple: p.swingAtrMultiple,
      swingLookback: p.swingLookback,
      atrPeriod: p.atrPeriod
    });
    return { seri: r.equilibrium, warmup: 60 };
  },

  /**
   * Hacim profilinin POC'u (en çok işlem gören fiyat).
   *
   * ⚠ TEK SAĞLAYICI KI KAYNAK GÖSTERGE SERİ DEĞİL. `volume_profile` bir
   * ANLIK GÖRÜNTÜDÜR (`kind: 'levels'`) — tek bir POC sayısı döndürür.
   * Hizalı bir seri elde etmek için profil KAYAN PENCEREYLE yeniden
   * hesaplanıp ileriye taşınıyor.
   *
   * ADIM neden var: her bar için profil hesaplamak 3000 barlık bir koşuda
   * 3000 profil demek. Adım varsayılan 10; aradaki barlar son hesaplanan
   * değeri taşır.
   *
   * İLERİYE BAKMA YOK: hesap noktaları serinin BAŞINDAN sayılır
   * (`i = warmup, warmup+adim, …`), sonundan değil. Bar `i`'nin değeri
   * yalnızca `≤ i` barlardan gelir; ileriye taşıma da `≤ k ⊆ ≤ i` olduğu
   * için güvenlidir. Adımı serinin sonuna göre hizalamak, seri uzadıkça
   * geçmiş barların değerini değiştirirdi.
   */
  poc(mumlar, p) {
    const pencere = p.pencere || 200;
    const adim = Math.max(1, p.adim || 10);
    const isinma = pencere;
    const n = mumlar.length;
    const seri = new Array(n).fill(null);

    let son = null;
    for (let i = 0; i < n; i++) {
      if (i < isinma - 1) continue;
      if ((i - (isinma - 1)) % adim === 0) {
        const dilim = mumlar.slice(i - pencere + 1, i + 1);
        const r = havuz.computeOne(dilim, 'volume_profile', {
          mode: 'bars', bars: pencere, bins: p.bins || 50
        });
        if (r && Number.isFinite(r.poc)) son = r.poc;
      }
      seri[i] = son;
    }
    return { seri, warmup: isinma };
  }
};

const KAYNAKLAR = Object.keys(SAGLAYICILAR);

/**
 * Referans hattını kurar.
 *
 * @param {Array}  mumlar  OHLCV dizisi
 * @param {object} p
 *   kaynak     'ema' | 'vwap' | 'avwap' | 'eq' | 'poc'   (varsayılan 'ema')
 *   atrPeriod  ATR periyodu (varsayılan 14)
 *   egimBar    eğim kaç barlık farktan ölçülsün (varsayılan 5)
 *   …          sağlayıcıya özel parametreler
 */
function referansHatti(mumlar, p = {}) {
  const kaynak = p.kaynak || 'ema';
  const saglayici = SAGLAYICILAR[kaynak];
  if (!saglayici) {
    // Bilinmeyen kaynak SESSİZCE 'ema'ya düşmez: strateji istediği çizgiyle
    // çalıştığını sanır ve ölçüm başka bir şeyi ölçer.
    throw new Error(`Bilinmeyen referans hattı kaynağı: '${kaynak}' (geçerli: ${KAYNAKLAR.join(', ')})`);
  }

  const n = Array.isArray(mumlar) ? mumlar.length : 0;
  const bos = {
    deger: [], egim: [], mesafe: [], taraf: [],
    kaynak, warmup: 0, atr: []
  };
  if (!n) return bos;

  const atrPeriod = p.atrPeriod || 14;
  const egimBar = Math.max(1, p.egimBar || 5);

  const { seri, warmup: cizgiWarmup } = saglayici(mumlar, p);
  const atrSeri = havuz.computeOne(mumlar, 'atr', { period: atrPeriod }).value;

  /**
   * Isınma üç şeyin en büyüğü: çizginin kendi ısınması, ATR'ninki ve eğim
   * için gereken geçmiş. Biri atlanırsa o barlarda `null` yerine hesaplanmış
   * ama anlamsız bir sayı çıkardı.
   */
  const warmup = Math.max(cizgiWarmup, atrPeriod + 1, egimBar);

  const deger = new Array(n).fill(null);
  const egim = new Array(n).fill(null);
  const mesafe = new Array(n).fill(null);
  const taraf = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    /**
     * ISINMA MASKELENİR — kaynak gösterge daha erken değer üretse bile.
     *
     * `vwap_period` ilk bardan itibaren bir sayı döndürür ama o sayı tek
     * mumun ağırlıklı ortalamasıdır; ATR de henüz oturmamıştır. Erken
     * değeri geçirmek "çizgi hazır" demek olur ve strateji ilk barlarda
     * gerçek olmayan bir mesafe okur. Sözleşme tek cümle: `warmup`a kadar
     * dört dizi de `null`.
     */
    if (i < warmup) continue;

    const d = seri && seri[i];
    if (!Number.isFinite(d)) continue;
    deger[i] = d;

    const atr = atrSeri && atrSeri[i];
    const kapanis = mumlar[i].close;

    if (Number.isFinite(kapanis)) {
      const fark = kapanis - d;
      // `taraf` işareti taşır, `mesafe` taşımaz — sözleşme ikisini ayırıyor.
      taraf[i] = fark >= 0 ? 1 : -1;
      const m = atrBol(Math.abs(fark), atr);
      if (m !== null) mesafe[i] = m;
    }

    const onceki = seri[i - egimBar];
    if (i >= egimBar && Number.isFinite(onceki)) {
      const e = atrBol(d - onceki, atr);
      if (e !== null) egim[i] = e;
    }
  }

  return { deger, egim, mesafe, taraf, kaynak, warmup, atr: atrSeri };
}

module.exports = { referansHatti, KAYNAKLAR, SAGLAYICILAR };
