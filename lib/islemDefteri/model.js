/**
 * İŞLEM DEFTERİ — MODEL (sürüm 64.7) — saf: sabitler, sembol normalleştirme, kayıt biçimi denetimi.
 *
 * Kayıt türleri (data/islem-defteri/kayit.jsonl, YALNIZ EKLENİR):
 *   hesap          { id 'a…', ad, hesapTuru, paraBirimi, not, aktif, sunucuSaatFarki (saat; MT sunucu saati → UTC) }
 *   hesap-guncelle { hesap, alanlar: { ad?, not?, aktif?, sunucuSaatFarki?, paraBirimi? } }   (ad değişikliği de ek kayıttır)
 *   yukleme        { id 'y…', hesap, kaynak, bicim, dosyaAdi, sha256, kodlama, satir, eklenen, atlanan, cift, hata, aralik }
 *   islem          dolum ya da (MetaTrader) kapanmış pozisyon — aşağıda NORMAL KAYIT
 *   fonlama · swap · kz (yalnız gerçekleşen kâr satırı) · ucret (yalnız komisyon satırı) · para-giris · para-cikis
 *   geri-al        { yukleme, neden } — bir yüklemenin TAMAMI etkisiz (satırlar dosyada kalır)
 *   iptal          { hedef, neden } — tek kayıt etkisiz (ters kayıt)
 *
 * NORMAL KAYIT (D4): { id 'r…', yukleme, hesap, kaynak, kaynakId, anahtar (çift denetimi), zaman (ms; MT'de sunucu saati —
 *   sunucuSaati: true, hesabın sunucuSaatFarki OKUMA anında uygulanır), sembol, piyasa ('spot'|'vadeli'|'fx'|'cfd'),
 *   yon ('al'|'sat'), miktar (baz birim; FX'te lot), kontrat (FX lot büyüklüğü, bilinmiyorsa null), fiyat, ucret { tutar (ödenen +, iade −), para },
 *   gerceklesenKar (kaynağın bildirdiği, para cinsinden; yoksa null), komisyon, swap, pozisyonId, para (kotasyon/uzlaşma),
 *   islemTuru ('dolum' | 'pozisyon' — MT kapanmış işlem: acilisZaman, acilisFiyat; zaman/fiyat = kapanış), tutar (hareketlerde,
 *   işaretli, para cinsinden), ham (seçilmiş ham alanlar, kısaltılmış) }
 */
'use strict';

const HESAP_TURLERI = {
  'kripto-okx': { ad: 'Kripto — OKX', kaynaklar: ['okx-csv', 'okx-api'], para: 'USDT' },
  'kripto-binance': { ad: 'Kripto — Binance', kaynaklar: ['binance-spot-csv', 'binance-vadeli-csv', 'binance-hareket-csv', 'binance-api'], para: 'USDT' },
  'fx-mt4': { ad: 'FX — MetaTrader 4', kaynaklar: ['mt4-html'], para: 'USD' },
  'fx-mt5': { ad: 'FX — MetaTrader 5', kaynaklar: ['mt5-html'], para: 'USD' },
  diger: { ad: 'Diğer', kaynaklar: null, para: 'USD' }
};
const KAYNAK_AD = {
  'okx-csv': 'OKX dosyası', 'okx-api': 'OKX eşitleme (salt okuma)',
  'binance-spot-csv': 'Binance spot işlem geçmişi', 'binance-vadeli-csv': 'Binance vadeli işlem geçmişi',
  'binance-hareket-csv': 'Binance vadeli hesap hareketleri', 'binance-api': 'Binance eşitleme (salt okuma)',
  'mt4-html': 'MetaTrader 4 raporu', 'mt5-html': 'MetaTrader 5 raporu'
};
const HAREKET_TURLERI = ['fonlama', 'swap', 'kz', 'ucret', 'para-giris', 'para-cikis'];
const VERI_TURLERI = ['islem', ...HAREKET_TURLERI];
const PIYASALAR = ['spot', 'vadeli', 'fx', 'cfd'];
const DOLAR_GIBI = new Set(['USD', 'USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USDP', 'DAI', 'USDE', 'USD1']);
const KOTASYONLAR = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'USDP', 'DAI', 'TRY', 'EUR', 'BRL', 'GBP', 'JPY', 'BTC', 'ETH', 'BNB', 'USD'];
const FIAT = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'TRY', 'ZAR', 'MXN', 'SGD', 'HKD', 'PLN', 'HUF', 'CZK', 'CNH', 'RUB', 'XAU', 'XAG']);

const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);

/** Birleşik kripto çifti "BTCUSDT" → ['BTC','USDT'] (bilinen kotasyon sonekiyle); bulunamazsa null. */
function ciftBol(s) {
  const t = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const q of KOTASYONLAR) if (t.length > q.length && t.endsWith(q)) return [t.slice(0, -q.length), q];
  return null;
}

/**
 * OKX instId → { sembol, piyasa, para }: "BTC-USDT" → BTC/USDT spot · "BTC-USDT-SWAP" → BTC/USDT:USDT vadeli ·
 * "BTC-USD-SWAP" → BTC/USD:BTC (ters, uzlaşma coin) · "BTC-USDT-250328" → BTC/USDT:USDT-250328 · opsiyon "BTC-USD-250328-60000-C".
 */
function okxSembol(instId, instType) {
  const p = String(instId || '').toUpperCase().split('-').filter(Boolean);
  const tip = String(instType || '').toUpperCase();
  if (p.length < 2) return { sembol: String(instId || '').toUpperCase() || '?', piyasa: 'spot', para: null };
  const [b, q] = p;
  if (p.length === 2 && tip !== 'MARGIN') return { sembol: `${b}/${q}`, piyasa: 'spot', para: q };
  if (p.length === 2) return { sembol: `${b}/${q}`, piyasa: 'vadeli', para: q, marjin: true };
  const uzlasma = q === 'USD' ? b : q;   // ters (coin-margined) sözleşme coinle uzlaşır
  if (p[2] === 'SWAP') return { sembol: `${b}/${q}:${uzlasma}`, piyasa: 'vadeli', para: uzlasma };
  return { sembol: `${b}/${q}:${uzlasma}-${p.slice(2).join('-')}`, piyasa: 'vadeli', para: uzlasma };
}

/** Binance sembolü: "BTCUSDT" / "BTC/USDT" / "BTC-USDT" → spot "BTC/USDT" ya da vadeli "BTC/USDT:USDT"; "BTCUSD_PERP" → ters. */
function binanceSembol(s, vadeli) {
  const ham = String(s || '').toUpperCase().trim();
  const ters = /_PERP$|USD_\d{6}$/.test(ham);
  let b, q;
  const ayr = /^([A-Z0-9]+)[/\-]([A-Z0-9]+)$/.exec(ham);
  if (ayr) { b = ayr[1]; q = ayr[2]; } else { const c = ciftBol(ham.replace(/_PERP$|_\d{6}$/, '')); if (c) [b, q] = c; }
  if (!b) return { sembol: ham || '?', piyasa: vadeli ? 'vadeli' : 'spot', para: null };
  if (!vadeli) return { sembol: `${b}/${q}`, piyasa: 'spot', para: q };
  if (ters) return { sembol: `${b}/${q}:${b}`, piyasa: 'vadeli', para: b };
  return { sembol: `${b}/${q}:${q}`, piyasa: 'vadeli', para: q };
}

/**
 * MetaTrader sembolü: aracı kurum sonekleri ("EURUSD.m", "EURUSDm", "EURUSD.pro", "#EURUSD") atılır → "EURUSD"; altı harfli
 * döviz/metal çifti değilse büyük harfle olduğu gibi (CFD: "US30", "XTIUSD", "BTCUSD"). piyasa: döviz/metal çifti 'fx', değilse 'cfd'.
 */
function mtSembol(s) {
  const ham = String(s || '').trim().toUpperCase();
  const m = /^[#._]?([A-Z]{3})([A-Z]{3})(?:[^A-Z].*|[A-Z]{0,4})?$/.exec(ham);
  if (m && FIAT.has(m[1]) && FIAT.has(m[2])) return { sembol: m[1] + m[2], piyasa: 'fx', ham };
  return { sembol: ham.replace(/^[#._]/, '') || '?', piyasa: 'cfd', ham };
}

const dolarGibiMi = (p) => DOLAR_GIBI.has(String(p || '').toUpperCase());

/** Normal kaydın biçimi (içe aktarıcıların çıktısı). Hata metni ya da null. */
function kayitDenetle(k) {
  if (!k || typeof k !== 'object') return 'kayıt yok';
  if (!VERI_TURLERI.includes(k.tur)) return `bilinmeyen kayıt türü: ${k.tur}`;
  if (!sayiMi(k.zaman) || k.zaman < Date.UTC(2009, 0, 1) || k.zaman > Date.now() + 3 * 864e5) return 'zaman geçersiz';
  if (!k.kaynakId) return 'kaynak kimliği yok';
  if (k.tur === 'islem') {
    if (!PIYASALAR.includes(k.piyasa)) return `piyasa geçersiz: ${k.piyasa}`;
    if (k.yon !== 'al' && k.yon !== 'sat') return `yön geçersiz: ${k.yon}`;
    if (!sayiMi(k.miktar) || k.miktar <= 0) return 'miktar geçersiz';
    if (!sayiMi(k.fiyat) || k.fiyat < 0) return 'fiyat geçersiz';
    if (!k.sembol) return 'sembol yok';
    if (k.ucret && !sayiMi(k.ucret.tutar)) return 'ücret geçersiz';   // eksi = iade (OKX maker rebate)
    if (k.islemTuru === 'pozisyon' && !sayiMi(k.acilisZaman)) return 'açılış zamanı yok';
  } else if (!sayiMi(k.tutar)) return 'tutar geçersiz';
  return null;
}

/**
 * Çift denetimi anahtarı: hesap | kaynak ailesi | kaynak kimliği. 65.0: Binance dosyaları (binance-*-csv) ve eşitlemesi (binance-api) TEK
 * aile 'binance' — vadeli Trade ID ("t:<sembol>:<id>") ve Transaction ID ("tx:<id>:<tür>:<para>") dosyayla API'de aynı anahtar olsun.
 * Eski kayıtların dosyada saklı `anahtar` alanı ('…|binance-vadeli-csv|…') okurken depo.durumKur'da bu kuralla yeniden kurulur.
 */
const aile = (kaynak) => (/^okx/.test(kaynak) ? 'okx' : /^mt[45]/.test(kaynak) ? 'mt' : /^binance/.test(kaynak) ? 'binance' : String(kaynak || ''));
const anahtar = (hesap, kaynak, kaynakId) => `${hesap}|${aile(kaynak)}|${kaynakId}`;

module.exports = { HESAP_TURLERI, KAYNAK_AD, HAREKET_TURLERI, VERI_TURLERI, PIYASALAR, DOLAR_GIBI, FIAT, ciftBol, okxSembol, binanceSembol, mtSembol, dolarGibiMi, kayitDenetle, aile, anahtar, sayiMi };
