'use strict';
/**
 * PARA AKIŞI ONAYI (kullanıcı kuralı 2026-10-25) — saf yardımcılar. Bot (lib/live/bindirmeBot.js) yalnız `ayar.paraAkisOnay === true`
 * iken kullanır; sunucu (lib/sunucu/botYonetimi.js) kâğıt dışı botlara verir. Kâğıt hesapta para akışı yok.
 *
 *   "Hesaptan kazanılan para çekilebilir, ama bunu kullanıcı kendisi yapar; kendisi yapmadığı durumda botu durduralım. Para ekleme
 *    çıkarma durumunda pozisyonlar yine bakiyeye göre hesaplansın. Para çıkışı ve para girişi onay istesin."
 *
 * Kurallar:
 *   · Borsada algılanan her giriş / çıkış (69.3 otomatik algılama) ONAY BEKLEYEN olur; onaylanana kadar hesaba KATILMAZ: botun
 *     özsermaye ölçümü (`_ozsermaye`) bekleyen tutarı geri çıkarır (giriş) ya da geri ekler (çıkış) — tavan, pozisyon boyutu, risk
 *     katmanı, hesap kesicisi, gölge getirisi eski bakiyeyle sürer. Onaylanınca 69.3 yolu (`_sermayeUygula` + `_tavanArtir`) uygulanır.
 *   · Onaysız ÇIKIŞ → bot durur (günlük karar yok, yürütücü yalnız azaltan emir; açık pozisyon ve felaket stopları DOKUNULMAZ) + alarm.
 *   · Onaysız GİRİŞ → bot durmaz; giriş hesaba katılmaz + uyarı.
 *   · ÖN KAYIT: "Para yatırdım / çektim" kaydı (KAYIT) hareketten ÖNCE ya da SONRA girilebilir. Eşleşme: aynı yön, |tutar farkı| ≤
 *     max(TOLERANS_USDT, TOLERANS_ORAN × |kayıt|), hareket zamanı [kayıt − ONCE_MS, kayıt + PENCERE_MS]. Eşleşen hareket kendiliğinden
 *     onaylıdır (bot durmaz). Eşleşmeyen ön kayıt PENCERE_MS sonunda düşer (uyarı; hiçbir taban kaymaz).
 *   · Kairos demo kabulü (mod demo, 2026-12-09 21:00 UTC'ye kadar — VeriKapisi.dokunulmaz): kural yalnız HABER verir, davranış eskisi.
 *     Süre bitince (2026-12-10 00:00 TR) kural demo botta da KENDİLİĞİNDEN etkin; kalıcı muafiyet yok (76.4, kullanıcı onayı).
 *   · 76.4 "BU BEN DEĞİLİM" (reddet): onay bekleyen ÇIKIŞ reddedilince bot durmuş KALIR, hareket `ret` ile "reddedildi — güvenlik"
 *     işaretlenir, hesaplara katılmaz (özsermaye düzeltmesi sürer), güvenlik alarmı gider. Bot yalnız sonradan bilinçli "onayla" ile
 *     sürer ("Para çektim" kaydı reddedilmiş hareketi onaylamaz).
 *   · 76.4 Onay bekleyen GİRİŞ için günde (TR günü) TEK hatırlatma; tutar yazılmaz. Hareketin algılandığı gün hatırlatma yok (uyarı gitti).
 */

const SAAT = 3600e3;
const TOLERANS_USDT = 2;        // çekim ücreti / yuvarlama payı
const TOLERANS_ORAN = 0.02;     // %2
const PENCERE_MS = 72 * SAAT;   // ön kayıt bu süre içinde borsada görünmeli
const ONCE_MS = 24 * SAAT;      // kayıt hareketten en çok 24 sa SONRA girilmiş olabilir (hareket kayıttan önce)
const TR_FARK = 3 * SAAT;       // Türkiye saati (UTC+3, yaz saati yok)
const RET_ETIKET = 'reddedildi — güvenlik';

/** Bir ön kaydın tutarı algılanan hareketle eşleşir mi (yön + tutar + zaman). */
function eslesir(kayit, akis) {
  if (!kayit || !akis) return false;
  const k = +kayit.tutar, a = +akis.tutar;
  if (!Number.isFinite(k) || !Number.isFinite(a) || k === 0 || a === 0 || Math.sign(k) !== Math.sign(a)) return false;
  const tol = Math.max(TOLERANS_USDT, TOLERANS_ORAN * Math.abs(k));
  if (Math.abs(Math.abs(a) - Math.abs(k)) > tol) return false;
  const z = Number.isFinite(+akis.zaman) ? +akis.zaman : null, kz = +kayit.zaman;
  if (z == null || !Number.isFinite(kz)) return true;
  return z >= kz - ONCE_MS && z <= kz + PENCERE_MS;
}

/** Listede ilk eşleşenin sırası (yoksa −1). */
function eslesenBul(liste, akis) { return (Array.isArray(liste) ? liste : []).findIndex(k => eslesir(k, akis)); }

/** Onay bekleyen hareketlerin net toplamı (USDT; + giriş, − çıkış). */
function bekleyenToplam(liste) { return (Array.isArray(liste) ? liste : []).reduce((s, x) => s + (Number.isFinite(+x.tutar) ? +x.tutar : 0), 0); }

/** Süresi dolan ön kayıtları ayırır. */
function onKayitAyir(liste, simdi) {
  const kalan = [], dusen = [];
  for (const k of Array.isArray(liste) ? liste : []) (simdi - (+k.zaman || 0) > PENCERE_MS ? dusen : kalan).push(k);
  return { kalan, dusen };
}

/** Türkiye günü 'YYYY-AA-GG'. */
const trGun = (t) => new Date(+t + TR_FARK).toISOString().slice(0, 10);
const reddedilmis = (x) => !!(x && x.ret);

/** Reddedilebilir (henüz reddedilmemiş) bekleyen çıkışlar. */
function retAdaylari(liste) { return (Array.isArray(liste) ? liste : []).filter(x => +x.tutar < 0 && !reddedilmis(x)); }

/**
 * Günlük giriş hatırlatması gerekir mi (saf). Onay bekleyen (reddedilmemiş) giriş varsa, bugün (TR) hatırlatma gitmediyse ve
 * girişlerden en az biri BUGÜNDEN önce algılandıysa (algılandığı gün uyarı zaten gitti) → { gerekir: true, gun, adet }.
 */
function hatirlatmaGerekir(liste, sonGun, simdi) {
  const gun = trGun(simdi);
  const gir = (Array.isArray(liste) ? liste : []).filter(x => +x.tutar > 0 && !reddedilmis(x));
  if (!gir.length || sonGun === gun) return { gerekir: false, gun, adet: gir.length };
  const eski = gir.filter(x => trGun(Number.isFinite(+x.algilama) ? +x.algilama : Number.isFinite(+x.zaman) ? +x.zaman : simdi) < gun);
  return { gerekir: eski.length > 0, gun, adet: gir.length };
}

const usdt = (x) => `${x > 0 ? '+' : ''}${(+x).toFixed(2)} USDT`;

/** Sorun aracı önizlemesi (lib/sorunAraclari.js biçimi). @param pa bot.ozet().paraAkisi */
function onizleme(pa) {
  const bek = (pa && pa.bekleyen) || [];
  const durum = { bekleyen: bek.map(x => `${x.id}|${x.tutar}${reddedilmis(x) ? '|ret' : ''}`), durdurma: !!(pa && pa.durdurma) };
  if (!bek.length) return { uygulanabilir: false, neden: 'Onay bekleyen para hareketi yok.', satirlar: [], uyarilar: [], durum };
  const giris = bek.filter(x => x.tutar > 0), cikis = bek.filter(x => x.tutar < 0);
  const satirlar = bek.slice(-10).map(satir);
  const ret = bek.filter(reddedilmis);
  satirlar.push(`Onaylanırsa: net ${usdt(bekleyenToplam(bek))} hesaba katılır — sermaye tavanı, pozisyon boyutu, risk ve hesap kesicisi tabanları yeni bakiyeye göre güncellenir; bu hareket getiri sayılmaz.`);
  if (cikis.length && pa && pa.durdurma) satirlar.push('Onaysız çıkış yüzünden duran bot yeniden çalışır (sonraki günlük çalışmada).');
  if (giris.length && !cikis.length) satirlar.push('Bot şu an durmuyor; giriş onaylanana kadar eski bakiyeyle çalışıyor.');
  const uyarilar = ['Yalnız hareketi SİZ yaptıysanız onaylayın. Siz yapmadıysanız onaylamayın: Binance hesabınızı kontrol edin, API anahtarlarını yenileyin, geliştirme sohbetine yazın.'];
  if (ret.length) uyarilar.unshift(`${ret.length} çıkışı daha önce "Bu ben değilim" diye REDDETTİNİZ. Onaylarsanız bu çıkış sizin sayılır ve bot yeniden çalışır — yalnız hareketin sizin olduğundan EMİNSENİZ onaylayın.`);
  return { uygulanabilir: true, neden: null, baslik: 'Para hareketini onayla', satirlar, durum, plan: { adet: bek.length, net: bekleyenToplam(bek), reddedilen: ret.length },
    uyarilar,
    sonraki: cikis.length ? 'Bot sonraki günlük çalışmada (en geç 15 dk) yeni bakiyeyle sürer.' : 'Sonraki günlük çalışma yeni bakiyeyle hesaplar.' };
}

function satir(x) {
  return `${x.tutar > 0 ? 'Giriş' : 'Çıkış'} ${usdt(x.tutar)} — ${x.not || x.kaynak || 'borsa hareketi'}${Number.isFinite(+x.zaman) ? ` (${new Date(+x.zaman).toISOString().slice(0, 16).replace('T', ' ')} UTC)` : ''}${reddedilmis(x) ? ` — ${RET_ETIKET}` : ''}`;
}

/** "Bu ben değilim" önizlemesi (yalnız henüz reddedilmemiş bekleyen ÇIKIŞLAR). @param pa bot.ozet().paraAkisi */
function retOnizleme(pa) {
  const bek = (pa && pa.bekleyen) || [];
  const aday = retAdaylari(bek);
  const durum = { ret: aday.map(x => `${x.id}|${x.tutar}`), durdurma: !!(pa && pa.durdurma) };
  if (!aday.length) {
    const neden = bek.some(x => x.tutar < 0) ? 'Bekleyen çıkışların hepsi zaten reddedildi — bot durmuş kalıyor.'
      : 'Onay bekleyen para çıkışı yok. (Giriş reddedilmez: sizin değilse onaylamayın ve borsa hesabınızı kontrol edin.)';
    return { uygulanabilir: false, neden, satirlar: [], uyarilar: [], durum };
  }
  const satirlar = aday.slice(-10).map(satir);
  satirlar.push(`Reddedilirse: bot durmuş olarak KALIR (yeni işlem yok; açık pozisyonların stopu yerinde, azaltan emirler serbest), hareket "${RET_ETIKET}" olarak işaretlenir ve hesaplara katılmaz.`);
  satirlar.push('Telegram\'a güvenlik alarmı gider; Sorunlar\'da kırmızı kart kalır.');
  satirlar.push('Sonradan hareketin sizin olduğunu anlarsanız "Para hareketini onayla" ile bilinçli olarak onaylayabilirsiniz — bot ancak o zaman sürer.');
  return { uygulanabilir: true, neden: null, baslik: 'Bu ben değilim — reddet', satirlar, durum, plan: { adet: aday.length, net: bekleyenToplam(aday) },
    uyarilar: ['Hemen yapın: borsa şifresini ve iki adımlı doğrulamayı değiştirin, API anahtarlarını silip yenileyin, geliştirme sohbetine yazın.'],
    sonraki: 'Bot durmuş kalır. Hesabı güvene aldıktan sonra karar sizin: hareket sizinse "Para hareketini onayla".' };
}

module.exports = { TOLERANS_USDT, TOLERANS_ORAN, PENCERE_MS, ONCE_MS, RET_ETIKET, trGun, reddedilmis, retAdaylari, hatirlatmaGerekir, eslesir, eslesenBul,
  bekleyenToplam, onKayitAyir, onizleme, retOnizleme };
