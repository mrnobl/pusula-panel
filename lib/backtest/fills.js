/**
 * DOLUM MODELİ — bar verisinden emrin dolup dolmadığına ve hangi fiyattan
 * dolduğuna karar veren tek yer.
 *
 * Neden ayrı: motor bugüne kadar üç iyimser varsayımla çalışıyordu.
 *
 *   1. LİMİT EMRİ DOKUNUNCA DOLAR. Fiyat limit seviyesine yalnızca değip
 *      dönerse gerçek defterde kuyruğun önündekiler dolar, bizimki çoğu zaman
 *      dolmaz. Kaybedenler hep dolar (fiyat seviyeyi geçip gider), kazananların
 *      bir kısmı dolmaz — yanlılık hep aynı yöne. (Fitschen; Pruitt "strict
 *      penetration".) Grid tamamen dinlenen limitlerden oluştuğu için bizi en
 *      çok bu ilgilendirir.
 *   2. STOP SEVİYEDEN ÇIKAR. Bar stop'un ötesinde açıldıysa gerçek çıkış
 *      açılıştan olur, stop fiyatından değil. Kayıp eksik yazılır.
 *   3. KAYMA YOK. Stop ve piyasa emirleri taker'dır, defteri yer.
 *
 * VARSAYILAN `dokunma` — eski davranışın birebir aynısı, mutabakat değişmez.
 * `gercekci` üçünü birden düzeltir. Ölçümler iki modla koşulup FARK
 * raporlanır; hangisinin "doğru" olduğu değil, sonucun bu varsayıma ne kadar
 * duyarlı olduğu bilinmek istenir.
 *
 * Kullanım: `strategyConfig.dolumModeli` = 'dokunma' | 'gercekci' | {
 *   limit: 'dokunma'|'gecis', boslukluStop: bool, kaymaBps: sayı, tickSize: sayı }
 */

const HAZIR = {
  dokunma: { limit: 'dokunma', boslukluStop: false, kaymaBps: 0, tickSize: 0 },
  gercekci: { limit: 'gecis', boslukluStop: true, kaymaBps: 2, tickSize: 0 },
};

function cozumle(girdi) {
  if (!girdi) return { ad: 'dokunma', ...HAZIR.dokunma };
  if (typeof girdi === 'string') {
    if (!HAZIR[girdi]) throw new Error(`dolumModeli bilinmiyor: "${girdi}" (dokunma | gercekci)`);
    return { ad: girdi, ...HAZIR[girdi] };
  }
  const taban = HAZIR[girdi.taban] || HAZIR.dokunma;
  const m = { ad: 'ozel', ...taban, ...girdi };
  if (!['dokunma', 'gecis'].includes(m.limit)) throw new Error(`dolumModeli.limit: "${m.limit}"`);
  if (!(m.kaymaBps >= 0)) throw new Error('dolumModeli.kaymaBps negatif olamaz');
  return m;
}

/**
 * @param girdi dolumModeli yapılandırması
 * @returns {{ model, limitDoldu, stopCikisFiyati, piyasaFiyati }}
 */
function kur(girdi) {
  const model = cozumle(girdi);
  const kayma = model.kaymaBps / 10000;
  const pay = model.tickSize > 0 ? model.tickSize : 0;
  const gecis = model.limit === 'gecis';

  /**
   * Limit emri bu barda doldu mu.
   * @param alis true → alış limiti (long giriş / short kapanış), seviyenin ALTINDA bekler
   */
  function limitDoldu(mum, fiyat, alis) {
    if (alis) return gecis ? mum.low < fiyat - pay : mum.low <= fiyat;
    return gecis ? mum.high > fiyat + pay : mum.high >= fiyat;
  }

  /**
   * Tetiklenmiş stop'un çıkış fiyatı. Tetik kuralı değişmez (stop dokununca
   * tetiklenir — borsada da öyle); değişen, dolum fiyatıdır.
   * @param kisaPoz true → short pozisyonun stopu (alış yönünde çıkar)
   */
  function stopCikisFiyati(mum, seviye, kisaPoz) {
    let p = seviye;
    if (model.boslukluStop) p = kisaPoz ? Math.max(mum.open, seviye) : Math.min(mum.open, seviye);
    return kisaPoz ? p * (1 + kayma) : p * (1 - kayma);
  }

  /** Piyasa emri fiyatına kayma uygular. @param alis alış yönü mü */
  function piyasaFiyati(fiyat, alis) {
    return alis ? fiyat * (1 + kayma) : fiyat * (1 - kayma);
  }

  return { model, limitDoldu, stopCikisFiyati, piyasaFiyati };
}

module.exports = { kur, cozumle, HAZIR };
