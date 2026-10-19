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
 *   · Yanlış PIN: 15 dakikada 5 deneme → kilit (pencere dolana kadar), kilitlenince Telegram uyarısı.
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
const PENCERE_MS = 15 * 60 * 1000;
const SCRYPT = { N: 16384, r: 8, p: 1, uzunluk: 32 };
/** Telefon kademesinde yazmaya izin verilen acil uçları. */
const ACIL_YOLU = /^\/api\/(bindirme\/[^/]+\/acil|kalkan\/acil|exchange\/kill)$/;
/**
 * 61.3 (kullanıcı 2026-10-13: "sunucuda olmadığım zaman telefondan kontrol etmeliyim"): güncellemeyi şimdi kontrol et / onaylı
 * güncellemeyi kur. Aynı PIN kapısından geçer; onay metni "GÜNCELLE" (aynı yanlış PIN sayacı ve kilit).
 */
const GUNCELLEME_YOLU = /^\/api\/guncelleme\/(kontrol|uygula)$/;
const GUNCELLEME_ONAY = 'GÜNCELLE';
/** Telefonda PIN'le yazılabilen bütün uçlar (lib/guvenlik.js beyaz listesi ve public/js/core/api.js bununla aynı). */
const TELEFON_PIN_YOLU = new RegExp(`(?:${ACIL_YOLU.source})|(?:${GUNCELLEME_YOLU.source})`);

const pinGecerliMi = (pin) => /^\d{6,12}$/.test(String(pin || ''));

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
  // sıfırlayıp saldırgana yeni hak vermesin. Okunamazsa boş (PIN dosyası ayrı; kilit yalnız 15 dk'lık pencere).
  const denemeDosya = dosya.replace(/\.json$/, '') + '-deneme.json';
  let yanlislar = [];
  try { const d = JSON.parse(fs.readFileSync(denemeDosya, 'utf8')); if (Array.isArray(d.yanlislar)) yanlislar = d.yanlislar.filter(Number.isFinite); } catch { /* yok */ }
  let kilitBildirildi = false;
  function denemeYaz() {
    try { fs.mkdirSync(path.dirname(denemeDosya), { recursive: true }); fs.writeFileSync(denemeDosya, JSON.stringify({ yanlislar }), 'utf8'); } catch { /* yazılamadı — bellek sayacı yine çalışır */ }
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
    yanlislar = []; kilitBildirildi = false; denemeYaz();
  }

  function sil() { try { fs.unlinkSync(dosya); } catch { /* yok */ } }

  function pencere() { const t = simdi(); yanlislar = yanlislar.filter(x => t - x < PENCERE_MS); return yanlislar; }

  function durum() {
    const l = pencere();
    const kilitli = l.length >= HAK;
    return { tanimli: !!oku(), kilitli, kalanHak: Math.max(0, HAK - l.length), kilitBitis: kilitli ? new Date(l[0] + PENCERE_MS).toISOString() : null };
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
    if (pencere().length >= HAK) return { ok: false, durum: 429, hata: `Çok fazla yanlış PIN — ${guncelleme ? 'telefon PIN\'i' : 'acil durdurma'} ${Math.ceil((yanlislar[0] + PENCERE_MS - simdi()) / 60000)} dakika kilitli.` };
    const onay = String(g.onay || '').trim().toLocaleUpperCase('tr-TR');
    if (guncelleme ? !(onay === GUNCELLEME_ONAY || onay === 'GUNCELLE') : onay !== ONAY_METNI) return { ok: false, durum: 400, hata: `Onay için "${guncelleme ? GUNCELLEME_ONAY : ONAY_METNI}" yazın.` };
    let dogru = false;
    if (pinGecerliMi(g.pin)) {
      const a = Buffer.from(ozetle(g.pin, k.tuz), 'hex'), b = Buffer.from(k.ozet, 'hex');
      dogru = a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    if (dogru) { if (yanlislar.length) { yanlislar = []; denemeYaz(); } kilitBildirildi = false; return { ok: true }; }
    yanlislar.push(simdi());
    pencere(); denemeYaz();
    const kalan = HAK - pencere().length;
    if (kalan <= 0) {
      if (!kilitBildirildi && typeof o.uyari === 'function') {
        kilitBildirildi = true;
        try { o.uyari(`Telefondan acil durdurma: ${HAK} yanlış PIN — 15 dakika kilitlendi. Siz değilseniz: panel jetonunu yenileyin (npm run telefon-jeton -- --yeni); telefon kaybolduysa Tailscale yönetim sayfasından cihazı çıkarın. Bu sırada acil durdurma bilgisayardan ya da Binance arayüzünden yapılır.`); } catch { /* bildirim hatası kapıyı etkilemez */ }
      }
      return { ok: false, durum: 429, hata: 'PIN yanlış — çok fazla deneme, acil durdurma 15 dakika kilitlendi.' };
    }
    return { ok: false, durum: 403, hata: `PIN yanlış (kalan hak: ${kalan}).` };
  }

  /** Express ara katmanı: express.json'dan SONRA; yalnız telefon kademesindeki acil uçlarını denetler. */
  function middleware(req, res, next) {
    if (req.kademe !== 'telefon' || req.method !== 'POST') return next();
    const yol = acilYolNormal(req.path);
    const tur = ACIL_YOLU.test(yol) ? 'acil' : GUNCELLEME_YOLU.test(yol) ? 'guncelleme' : null;
    if (!tur) return next();
    const s = denetle(req.body, tur);
    if (s.ok) return next();
    res.status(s.durum).json({ success: false, error: s.hata, acilPin: durum() });
  }

  return { ayarla, sil, durum, denetle, middleware, dosya };
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

module.exports = { olustur, acilYolNormal, pinGecerliMi, ACIL_YOLU, GUNCELLEME_YOLU, TELEFON_PIN_YOLU, ONAY_METNI, GUNCELLEME_ONAY, HAK, PENCERE_MS };
