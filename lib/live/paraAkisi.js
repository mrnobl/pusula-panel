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
 */

const SAAT = 3600e3;
const TOLERANS_USDT = 2;        // çekim ücreti / yuvarlama payı
const TOLERANS_ORAN = 0.02;     // %2
const PENCERE_MS = 72 * SAAT;   // ön kayıt bu süre içinde borsada görünmeli
const ONCE_MS = 24 * SAAT;      // kayıt hareketten en çok 24 sa SONRA girilmiş olabilir (hareket kayıttan önce)

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

const usdt = (x) => `${x > 0 ? '+' : ''}${(+x).toFixed(2)} USDT`;

/** Sorun aracı önizlemesi (lib/sorunAraclari.js biçimi). @param pa bot.ozet().paraAkisi */
function onizleme(pa) {
  const bek = (pa && pa.bekleyen) || [];
  const durum = { bekleyen: bek.map(x => `${x.id}|${x.tutar}`), durdurma: !!(pa && pa.durdurma) };
  if (!bek.length) return { uygulanabilir: false, neden: 'Onay bekleyen para hareketi yok.', satirlar: [], uyarilar: [], durum };
  const giris = bek.filter(x => x.tutar > 0), cikis = bek.filter(x => x.tutar < 0);
  const satirlar = bek.slice(-10).map(x => `${x.tutar > 0 ? 'Giriş' : 'Çıkış'} ${usdt(x.tutar)} — ${x.not || x.kaynak || 'borsa hareketi'}${Number.isFinite(+x.zaman) ? ` (${new Date(+x.zaman).toISOString().slice(0, 16).replace('T', ' ')} UTC)` : ''}`);
  satirlar.push(`Onaylanırsa: net ${usdt(bekleyenToplam(bek))} hesaba katılır — sermaye tavanı, pozisyon boyutu, risk ve hesap kesicisi tabanları yeni bakiyeye göre güncellenir; bu hareket getiri sayılmaz.`);
  if (cikis.length && pa && pa.durdurma) satirlar.push('Onaysız çıkış yüzünden duran bot yeniden çalışır (sonraki günlük çalışmada).');
  if (giris.length && !cikis.length) satirlar.push('Bot şu an durmuyor; giriş onaylanana kadar eski bakiyeyle çalışıyor.');
  return { uygulanabilir: true, neden: null, baslik: 'Para hareketini onayla', satirlar, durum, plan: { adet: bek.length, net: bekleyenToplam(bek) },
    uyarilar: ['Yalnız hareketi SİZ yaptıysanız onaylayın. Siz yapmadıysanız onaylamayın: Binance hesabınızı kontrol edin, API anahtarlarını yenileyin, geliştirme sohbetine yazın.'],
    sonraki: cikis.length ? 'Bot sonraki günlük çalışmada (en geç 15 dk) yeni bakiyeyle sürer.' : 'Sonraki günlük çalışma yeni bakiyeyle hesaplar.' };
}

module.exports = { TOLERANS_USDT, TOLERANS_ORAN, PENCERE_MS, ONCE_MS, eslesir, eslesenBul, bekleyenToplam, onKayitAyir, onizleme };
