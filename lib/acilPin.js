/**
 * ACİL PIN — telefondan acil durdurmanın ikinci kilidi (sürüm 60.5, PLAN-UYGULAMA-YOL-HARITASI.md §0 K2).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Telefon kademesindeki istek (lib/guvenlik.js `kademe`) yalnız izleyebilir; tek yazma izni acil durdurma
 * uçlarıdır ve onlar da bu kapıdan geçer: gövdede `pin` + `onay: "DURDUR"`. Masaüstü (yerel kademe) acil
 * davranışı DEĞİŞMEZ — bu kapı yalnız telefon kademesinde çalışır.
 *
 *   · PIN panel jetonundan AYRI, 6–12 hane. Sunucuda yalnız scrypt özeti + tuz saklanır
 *     (`data/acil-pin.json`; data/ depoya girmez, hiçbir uç bu dosyayı döndürmez).
 *   · PIN tanımlı değilse telefondan acil KAPALI (açık mesaj). PIN yalnız bu bilgisayardan ayarlanır:
 *     `npm run acil-pin` (scripts/telefon-kur.js).
 *   · Yanlış PIN: 1 dakikada 5 deneme → 1 dakika kilit (73.0, kullanıcı kararı 2026-10-23: kilit HER ZAMAN 1 dk, artan kilit
 *     YOK), kilitlenince Telegram uyarısı.
 *   · 73.0 PIN DEĞİŞTİRME (`degistir`, Ayarlar › Anahtarlar): eski PIN + yeni PIN; eski PIN aynı yanlış deneme sayacından geçer.
 *     PIN unutulursa sıfırlama yine yalnız bilgisayar başında `npm run acil-pin` (eski PIN istemez).
 *     Sayaç tek (IP başına değil): telefon tek kullanıcı; saldırgan IP değiştirerek hak çoğaltamaz.
 *   · Doğru PIN de "DURDUR" onayı olmadan geçmez (yanlışlıkla dokunma).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');
const crypto = require('crypto');

const ONAY_METNI = 'DURDUR';
const HAK = 5;
const PENCERE_MS = 60 * 1000;   // 73.0: yanlış denemeler 1 dakikalık pencerede sayılır
const KILIT_MS = 60 * 1000;     // 73.0: 5. yanlıştan sonra kilit HER ZAMAN 1 dakika
const SCRYPT = { N: 16384, r: 8, p: 1, uzunluk: 32 };
/** Telefon kademesinde yazmaya izin verilen acil uçları. */
const ACIL_YOLU = /^\/api\/(bindirme\/[^/]+\/acil|kalkan\/acil|exchange\/kill)$/;
/**
 * 61.3 (kullanıcı 2026-10-13: "sunucuda olmadığım zaman telefondan kontrol etmeliyim"): güncellemeyi şimdi kontrol et / onaylı
 * güncellemeyi kur. Aynı PIN kapısından geçer; onay metni "GÜNCELLE" (aynı yanlış PIN sayacı ve kilit).
 */
const GUNCELLEME_YOLU = /^\/api\/guncelleme\/(kontrol|uygula)$/;
const GUNCELLEME_ONAY = 'GÜNCELLE';
/**
 * 73.8 SORUN ARAÇLARI (lib/sorunAraclari.js; kullanıcı kararı 2026-10-24: telefondan da — acil PIN + onay): kayıt eşitleme, zarar
 * sınırı sıfırlama, sapma / yatırma kabulü. Aynı PIN ve yanlış deneme sayacı; onay metni araç başına (ESITLE / SIFIRLA / KABUL) — uç
 * işleyicisi PIN'i ve onayı HER kademede yeniden doğrular (bu kapı telefonda PIN'siz / yanlış PIN'li isteği önden keser).
 * 77.x (kullanıcı 2026-10-26: "sunucuya ulaşamama durumunda tek imkanımız telefon"): güvenli kipten çıkış (KALDIR) ve elle güvenli
 * kipe alma (GÜVENLİ) aynı kalıpla eklendi — önizleme + PIN + onay + parmak izi. Başka yetki AÇILMADI (Engeli kaldır, Başlat, ayar YOK).
 * 77.8 (kullanıcı 2026-10-26, "Telefondan devralma"): devral (DEVRAL + "eski makine kapalı" kutusu) / devral-sahiplen (SAHİPLEN) /
 * devral-baslat (BAŞLAT — YALNIZ yeni devralınmış ve hiç başlatılmamış bota, bir kez). Doğrudan /api/makine/devral, /devral/sahiplen ve
 * genel Başlat (/api/bindirme/:ad/baslat) telefonda 403 KALIR. Geliştirme bilgisayarından iletilmez (SORUN_ARAC_GELISTIRME_YOLU'nda yok).
 */
const SORUN_ARAC_YOLU = /^\/api\/sorun-arac\/(kayit-esitle|zarar-siniri-sifirla|sapma-kabul|yatirma-kabul|para-akisi-onay|para-akisi-reddet|guvenli-kip-kaldir|guvenli-kip-gir|borsa-karsilastir|yeniden-baslat|devral|devral-sahiplen|devral-baslat)\/uygula$/;
/**
 * 77.x: geliştirme bilgisayarından (araştırma kopyası) sunucuya İLETİLEBİLEN araçlar — telefona özel "Borsayla karşılaştır" ve
 * "Pusula'yı yeniden başlat" YOK (kullanıcı onayı yalnız telefon için; lib/guvenlik.js GELISTIRME_YAZMA bunu kullanır).
 */
const SORUN_ARAC_GELISTIRME_YOLU = /^\/api\/sorun-arac\/(kayit-esitle|zarar-siniri-sifirla|sapma-kabul|yatirma-kabul|para-akisi-onay|para-akisi-reddet|guvenli-kip-kaldir|guvenli-kip-gir)\/uygula$/;
/**
 * 77.x (kullanıcı onayı 2026-10-26, envanter #14 / #8): telefonda PIN'SİZ izinli iki zararsız yazma — öz denetimi şimdi yokla
 * (uç telefona dakikada 1 sınırı koyar — lib/sunucu/saglikUclari.js) ve Telegram geçici sessizini erken bitir (yalnız susturmayı
 * kaldırır; sessize ALMA telefonda yok). Bu kapı bunlara dokunmaz.
 */
const TELEFON_SERBEST_YOLU = /^\/api\/(saglik\/oz\/yokla|bildirim\/gecici-bitir)$/;
/** Telefonda PIN'le yazılabilen bütün uçlar (lib/guvenlik.js beyaz listesi ve public/js/core/api.js bununla aynı). */
const TELEFON_PIN_YOLU = new RegExp(`(?:${ACIL_YOLU.source})|(?:${GUNCELLEME_YOLU.source})|(?:${SORUN_ARAC_YOLU.source})`);

const pinGecerliMi = (pin) => /^\d{6,12}$/.test(String(pin || ''));
/** 73.0: tahmin edilebilir PIN (hepsi aynı rakam ya da ardışık) — scripts/telefon-kur.js ile aynı kural. */
const pinZayifMi = (pin) => { const a = String(pin || ''); return /^(\d)\1+$/.test(a) || '01234567890'.includes(a) || '09876543210'.includes(a); };

function ozetle(pin, tuz) {
  return crypto.scryptSync(String(pin), Buffer.from(tuz, 'hex'), SCRYPT.uzunluk, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString('hex');
}

/**
 * @param o.dosya   PIN özetinin dosyası (varsayılan data/acil-pin.json)
 * @param o.uyari   (metin) → void; kilitlenince çağrılır (Telegram)
 * @param o.simdi   () → ms (test)
 */
function olustur(o = {}) {
  const dosya = o.dosya || yollar.veri('acil-pin.json');
  const simdi = o.simdi || Date.now;
  // O5 (62.0, DENETIM-CANLI-ALTYAPI): yanlış deneme zamanları KALICI (<dosya>-deneme.json) — yeniden başlatma sayacı
  // sıfırlayıp saldırgana yeni hak vermesin. Okunamazsa boş (PIN dosyası ayrı; kilit yalnız 1 dakika).
  const denemeDosya = dosya.replace(/\.json$/, '') + '-deneme.json';
  let yanlislar = [];
  let kilitSon = 0;   // 73.0: kilidin bittiği an (ms); 0 = kilit yok
  try {
    const d = JSON.parse(fs.readFileSync(denemeDosya, 'utf8'));
    if (Array.isArray(d.yanlislar)) yanlislar = d.yanlislar.filter(Number.isFinite);
    if (Number.isFinite(d.kilitSon)) kilitSon = d.kilitSon;
  } catch { /* yok */ }
  let kilitBildirildi = false;
  function denemeYaz() {
    try { fs.mkdirSync(path.dirname(denemeDosya), { recursive: true }); fs.writeFileSync(denemeDosya, JSON.stringify({ yanlislar, kilitSon }), 'utf8'); } catch { /* yazılamadı — bellek sayacı yine çalışır */ }
  }

  function oku() {
    try {
      const k = JSON.parse(fs.readFileSync(dosya, 'utf8'));
      return k && typeof k.ozet === 'string' && typeof k.tuz === 'string' ? k : null;
    } catch { return null; }
  }

  function ayarla(pin) {
    if (!pinGecerliMi(pin)) throw new Error('PIN 6–12 haneli bir sayı olmalı.');
    const tuz = crypto.randomBytes(16).toString('hex');
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
    fs.writeFileSync(dosya, JSON.stringify({ surum: 1, algoritma: 'scrypt', N: SCRYPT.N, tuz, ozet: ozetle(pin, tuz), olusturma: new Date(simdi()).toISOString() }, null, 2),
      { encoding: 'utf8', mode: 0o600 });
    yanlislar = []; kilitSon = 0; kilitBildirildi = false; denemeYaz();
  }

  function sil() { try { fs.unlinkSync(dosya); } catch { /* yok */ } }

  function pencere() { const t = simdi(); yanlislar = yanlislar.filter(x => t - x < PENCERE_MS); return yanlislar; }
  const kilitliMi = () => kilitSon > simdi();
  const kilitMetni = (ne) => `Çok fazla yanlış PIN — ${ne} ${Math.max(1, Math.ceil((kilitSon - simdi()) / 1000))} saniye kilitli (kilit 1 dakika).`;

  function durum() {
    const kilitli = kilitliMi();
    const l = kilitli ? [] : pencere();
    return { tanimli: !!oku(), kilitli, kalanHak: kilitli ? 0 : Math.max(0, HAK - l.length), kilitBitis: kilitli ? new Date(kilitSon).toISOString() : null };
  }

  /**
   * Telefon kademesindeki acil isteğinin kapısı.
   * @returns {{ ok: true } | { ok: false, durum: number, hata: string }}
   */
  function denetle(govde, tur = 'acil') {
    const g = govde || {};
    const k = oku();
    const guncelleme = tur === 'guncelleme';
    if (!k) return { ok: false, durum: 403, hata: guncelleme ? 'Telefondan güncelleme KAPALI: acil PIN tanımlı değil. Sunucuda `npm run acil-pin` ile PIN belirleyin.' : 'Telefondan acil durdurma KAPALI: acil PIN tanımlı değil. Sunucuda `npm run acil-pin` ile PIN belirleyin.' };
    if (kilitliMi()) return { ok: false, durum: 429, hata: kilitMetni(guncelleme ? 'telefon PIN\'i' : 'acil durdurma') };
    const onay = String(g.onay || '').trim().toLocaleUpperCase('tr-TR');
    if (guncelleme ? !(onay === GUNCELLEME_ONAY || onay === 'GUNCELLE') : onay !== ONAY_METNI) return { ok: false, durum: 400, hata: `Onay için "${guncelleme ? GUNCELLEME_ONAY : ONAY_METNI}" yazın.` };
    return pinSina(g.pin, k);
  }

  /**
   * 69.6 YEREL PIN (lib/yerelPin.js): masaüstü panelin tehlikeli işlemleri de aynı PIN'i ister — onay metni yok, aynı yanlış
   * deneme sayacı ve kilit (telefon ile masaüstü hak paylaşır; saldırgan iki yoldan hak çoğaltamaz).
   */
  function pinDogrula(pin) {
    const k = oku();
    if (!k) return { ok: false, durum: 403, tanimli: false, hata: 'PIN tanımlı değil. Sunucuda bir kez `npm run acil-pin` ile 6–12 haneli PIN belirleyin.' };
    if (kilitliMi()) return { ok: false, durum: 429, hata: kilitMetni('PIN') };
    return pinSina(pin, k);
  }

  /**
   * 73.0 PIN DEĞİŞTİRME (Ayarlar › Anahtarlar): eski PIN aynı sayaçla doğrulanır; yeni PIN 6–12 hane, tahmin edilebilir değil,
   * eskisinden farklı. Döndürür { ok: true } | { ok: false, durum, hata }. PIN değeri ya da özeti hiçbir dönüşte yer almaz.
   */
  function degistir(eskiPin, yeniPin) {
    const yeni = String(yeniPin == null ? '' : yeniPin).trim();
    const eski = String(eskiPin == null ? '' : eskiPin).trim();
    if (!pinGecerliMi(yeni)) return { ok: false, durum: 400, hata: 'Yeni PIN 6–12 haneli bir sayı olmalı.' };
    if (pinZayifMi(yeni)) return { ok: false, durum: 400, hata: 'Tahmin edilebilir PIN (tekrar/ardışık) — başka bir PIN seçin.' };
    const d = pinDogrula(eski);
    if (!d.ok) return d.durum === 403 && d.tanimli !== false ? { ...d, hata: d.hata.replace('PIN yanlış', 'Eski PIN yanlış') } : d;
    if (eski === yeni) return { ok: false, durum: 400, hata: 'Yeni PIN eskisiyle aynı.' };
    ayarla(yeni);
    return { ok: true };
  }

  function pinSina(pin, k) {
    let dogru = false;
    if (pinGecerliMi(pin)) {
      const a = Buffer.from(ozetle(pin, k.tuz), 'hex'), b = Buffer.from(k.ozet, 'hex');
      dogru = a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    if (dogru) { if (yanlislar.length) { yanlislar = []; denemeYaz(); } kilitBildirildi = false; return { ok: true }; }
    yanlislar.push(simdi());
    const kalan = HAK - pencere().length;
    if (kalan <= 0) { kilitSon = simdi() + KILIT_MS; yanlislar = []; }
    denemeYaz();
    if (kalan <= 0) {
      if (!kilitBildirildi && typeof o.uyari === 'function') {
        kilitBildirildi = true;
        try { o.uyari(`PIN: ${HAK} yanlış deneme — 1 dakika kilitlendi (telefondan acil durdurma ve masaüstü panelin korumalı işlemleri). Siz değilseniz: panel jetonunu yenileyin (npm run telefon-jeton -- --yeni); telefon kaybolduysa Tailscale yönetim sayfasından cihazı çıkarın. Bu sırada acil durdurma bilgisayardan ya da Binance arayüzünden yapılır.`); } catch { /* bildirim hatası kapıyı etkilemez */ }
      }
      return { ok: false, durum: 429, hata: 'PIN yanlış — çok fazla deneme, PIN 1 dakika kilitlendi.' };
    }
    return { ok: false, durum: 403, hata: `PIN yanlış (kalan hak: ${kalan}).` };
  }

  /** Express ara katmanı: express.json'dan SONRA; yalnız telefon kademesindeki acil uçlarını denetler. */
  function middleware(req, res, next) {
    if (req.kademe !== 'telefon' || req.method !== 'POST') return next();
    const yol = acilYolNormal(req.path);
    const tur = ACIL_YOLU.test(yol) ? 'acil' : GUNCELLEME_YOLU.test(yol) ? 'guncelleme' : SORUN_ARAC_YOLU.test(yol) ? 'arac' : null;
    if (!tur) return next();
    if (tur === 'arac') {   // 73.8: onay metnini uç işleyicisi (araç başına) denetler; PIN burada da
      const s = pinDogrula(String((req.body && req.body.pin) || '').trim());
      if (s.ok) return next();
      return res.status(s.durum).json({ success: false, pinHata: true, error: s.hata, acilPin: durum() });
    }
    const s = denetle(req.body, tur);
    if (s.ok) return next();
    res.status(s.durum).json({ success: false, error: s.hata, acilPin: durum() });
  }

  return { ayarla, sil, durum, denetle, pinDogrula, degistir, middleware, dosya };
}

/**
 * Saf (denetim 61.1 O3): Express harf duyarsız ve sondaki eğik çizgiyi yok sayar; telefon beyaz listesi
 * "/API/KALKAN/ACIL/" yolunu kabul ettiği için PIN kapısı da aynı yolu tanımalı (yoksa PIN atlanırdı).
 * Bu kapı GENİŞ eşleşir (yüzde kodu çözülür, çift eğik çizgi teke iner): fazladan PIN istemek güvenli yön.
 */
function acilYolNormal(yol) {
  let y = String(yol == null ? '' : yol).split('?')[0];
  try { y = decodeURIComponent(y); } catch { /* bozuk kod: olduğu gibi */ }
  y = y.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
  if (y.length > 1) y = y.replace(/\/+$/, '');
  return y;
}

module.exports = { olustur, acilYolNormal, pinGecerliMi, pinZayifMi, KILIT_MS, ACIL_YOLU, GUNCELLEME_YOLU, SORUN_ARAC_YOLU, SORUN_ARAC_GELISTIRME_YOLU, TELEFON_SERBEST_YOLU, TELEFON_PIN_YOLU, ONAY_METNI, GUNCELLEME_ONAY, HAK, PENCERE_MS };
