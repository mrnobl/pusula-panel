'use strict';
/**
 * AYARLAR › ANAHTARLAR (73.0, Faz 1 "makine × hesap × bot" — taslak claude.ai/artifact/EVY6mrirMqyvpUVf8hYN3y)
 * ═══════════════════════════════════════════════════════════════════════════
 * Kayıtlı BÜTÜN sırların tek ekranı (#/ayarlar/anahtarlar): borsa hesapları, İşlem defterim salt okuma anahtarları, bildirim
 * (Telegram jetonu, healthchecks adresleri) ve erişim (panel/telefon jetonu, acil PIN, sunucu bağlantısı, geliştirme yazma
 * jetonu, yedek şifresi, GitHub jetonu). Her satır: ad · kullanan · MASKELİ değer · bulunduğu makine · durum · not.
 *
 * KURALLAR
 *  · Değerin tamamı HİÇBİR uçtan dönmez: maske yalnız son 4 karakter (`maskele`; kısa değer ve parola/PIN için hiç).
 *    Satırın `ozet`i değerin tuzlu SHA-256'sının ilk 16 hanesi — yalnız "sunucudaki değer o arada değişti mi" karşılaştırması için.
 *  · Her yazma (ekle / değiştir / sil / eski dosyayı kenara al / PIN değiştir) ACİL PIN + onay ister — masaüstünde de
 *    (lib/acilPin.js pinDogrula: aynı yanlış deneme sayacı ve kilit). PIN yanlış → 400 (403 DEĞİL: geliştirme bilgisayarı
 *    403'ü "sunucu reddetti / jeton" sayar), tanımsız → 428, kilit → 429.
 *  · Telefon kademesinde bütün yazmalar 403 (lib/guvenlik.js beyaz listesi zaten keser; burada da).
 *  · Sınama (`/sina`) SALT OKUMA: lib/anahtarSinama.js — emir yok. Sonuç `sonSinama` olarak saklanır.
 *  · Bugünkü iki bot anahtarı (apiKey/apiSecret, testnetApiKey/testnetApiSecret) "Binance canlı (Kairos)" / "Binance demo (Kairos)"
 *    sabit satırlarıdır ve ESKİ alanlara yazılır (server.js sirlariUygula = /api/secrets ile aynı yol) — botlar Faz 1'de aynen
 *    bu anahtarları kullanır. Yeni hesaplar secrets.json `borsaHesaplari` (Faz 2'de botlara bağlanacak).
 *  · İşlem defterim anahtarları lib/islemDefteri/api.js anahtarIslemleri ile (İşlem defterim ekranıyla aynı yol; o ekrandaki kural:
 *    geliştirme bilgisayarından uzaktan kaydedilmez).
 *
 * ARAŞTIRMA KOPYASI (data/makine.json arastirmaModu): ekran SUNUCUDAKİ listeyi gösterir (lib/evOkuma jsonGetir — yalnız maskeli
 * özet). Yazmalar sunucuya iletilir (lib/evYazma, kuyruk YOK; PIN sunucuda doğrulanır). Sunucuya ulaşılamazsa değişiklik
 * yerelde AYRI GİZLİ dosyada (`anahtar-bekleyen.json`, lib/veriTurleri GIZLI) bekler — ev-kuyruk.jsonl'a SIR KONMAZ, PIN hiçbir
 * yere yazılmaz. Kendiliğinden gönderilmez: ekranda "Sunucuya gönderilmeyi bekleyen N değişiklik" + Gönder (PIN yeniden sorulur).
 * Sunucudaki değer o arada değiştiyse (özet farklı) iki maskeli değer yan yana gösterilir, hangisinin geçerli olacağı sorulur.
 *
 * ESKİ ŞİFRELİ DOSYA (69.x DPAPI zarfı, lib/sirKasasi SIR_KILITLI): Pusula çözmeye ÇALIŞMAZ. "Kenara al" dosyayı SİLMEDEN
 * `<ad>.eski-sifreli-<zaman>` olarak yeniden adlandırır (PIN + onay). PowerShell / DPAPI çağrısı YOK.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const sirKasasi = require('./sirKasasi');

const BORSALAR = { binance: 'Binance', okx: 'OKX', bybit: 'Bybit' };
const TURLER = { demo: 'demo', canli: 'canlı' };
const SABIT = {
  'binance-canli': { ad: 'Binance canlı (Kairos)', tur: 'canli', key: 'apiKey', secret: 'apiSecret' },
  'binance-demo': { ad: 'Binance demo (Kairos)', tur: 'demo', key: 'testnetApiKey', secret: 'testnetApiSecret' }
};
const HESAP_ID = /^[a-z0-9][a-z0-9-]{1,31}$/;
const DEFTER_ID = /^[a-z0-9_.-]{1,48}$/;
const BOT_ID = /^[a-z0-9-]{1,32}$/;
const KIMLIK_RE = /^(borsa:[a-z0-9-]{2,32}|defter:(okx|binance):[a-z0-9_.-]{1,48}|telegram|saglik:[a-z0-9-]{1,32})$/;
const BEKLEYEN_AD = 'anahtar-bekleyen.json';
const BEKLEYEN_TAVAN = 50;
const NASIL_YAZMA = 'Bu bilgisayar araştırma kopyası: anahtarlar SUNUCUDA değişir. Yazma bağlantısı gerekir — sunucuda `npm run gelistirme-jeton`, burada `npm run sunucu-baglanti -- --yazma-jeton <jeton>`.';
const NASIL_BAGLANTI = 'Bu bilgisayar araştırma kopyası ve sunucu bağlantısı kurulu değil: anahtarlar sunucudaki panelden değiştirilir (ya da burada `npm run sunucu-baglanti -- --adres … --jeton …`).';

/* ══ Saf yardımcılar ══════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Değerin YALNIZ son 4 karakteri. 12 karakterden kısa değerde hiç karakter gösterilmez. Boş → null. */
function maskele(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  if (s.length < 12) return '••••';
  return `••••${s.slice(-4)}`;
}
/** Karşılaştırma özeti: tuzlu SHA-256'nın ilk 16 hanesi (değer geri çıkarılamaz). Değer yoksa null. */
function ozetle(kimlik, ...degerler) {
  const d = degerler.map(x => String(x == null ? '' : x).trim());
  if (!d.some(Boolean)) return null;
  return crypto.createHash('sha256').update(`pusula-anahtar|${kimlik}|${d.join('\u0000')}`, 'utf8').digest('hex').slice(0, 16);
}
const nesne = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const metin = (v, n = 64) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);

/** Saf: bir yanıt nesnesinde verilen değerlerden biri geçiyor mu (öz test ve savunma: sızıntı denetimi). */
function sizintiVarMi(govde, degerler) {
  const m = JSON.stringify(govde == null ? '' : govde);
  return degerler.filter(v => typeof v === 'string' && v.length >= 6).some(v => m.includes(v));
}

/** Saf: ekle/değiştir gövdesinin biçim denetimi. Döndürür hata metni | null. */
function hesapDogrula(h, yeni) {
  if (yeni) {
    if (!metin(h.ad, 40)) return 'Hesaba bir ad verin (ör. "Binance alt hesap — Tao").';
    if (!BORSALAR[h.borsa]) return 'Borsa Binance, OKX ya da Bybit olmalı.';
    if (!TURLER[h.tur]) return 'Hesap türü demo ya da canlı olmalı.';
    if (h.kimlik != null && h.kimlik !== '' && (!HESAP_ID.test(String(h.kimlik)) || SABIT[h.kimlik])) return 'hesap kimliği geçersiz';
  }
  const anahtar = (v) => v == null || v === '' || /^[\x21-\x7e]{8,256}$/.test(String(v).trim());
  if (!anahtar(h.apiKey)) return 'API anahtarı biçimi geçersiz (8–256 karakter, boşluksuz).';
  if (!anahtar(h.apiSecret)) return 'Gizli anahtar (secret) biçimi geçersiz (8–256 karakter, boşluksuz).';
  if (h.parola != null && h.parola !== '' && !/^[\x20-\x7e]{1,64}$/.test(String(h.parola))) return 'Parola (passphrase) 1–64 karakter olmalı.';
  if (yeni && (!String(h.apiKey || '').trim() || !String(h.apiSecret || '').trim())) return 'API anahtarı ve gizli anahtar (secret) ikisi de gerekli.';
  if (yeni && h.borsa === 'okx' && !String(h.parola || '')) return 'OKX anahtarı için parola (passphrase) gerekli.';
  if (h.altHesap != null && metin(h.altHesap, 41).length > 40) return 'Alt hesap adı en çok 40 karakter.';
  return null;
}

const TELEGRAM_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/;

/* ══ Satırlar ═════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Saf: sırlar + bağlam → satırlar. Hiçbir satır değerin tamamını taşımaz.
 * ctx: { kilitli: metin|null, botlar: [{kimlik, ad, mod}], telegramAcik, panelJetonuEnv, pin: {tanimli, kilitli},
 *        dosya: (ad) → {durum: yok|tamam|eski-sifreli|bozuk}, hesapAdi: (id) → ad|null, gelistirmeJetonu: bool, arastirma }
 */
function satirlar(s0, ctx = {}) {
  const s = nesne(s0);
  const kilit = ctx.kilitli || null;
  const botlar = Array.isArray(ctx.botlar) ? ctx.botlar : [];
  const sinamalar = nesne(s.anahtarSinama);
  const l = [];
  const kilitNotu = 'secrets.json eski şifreli biçimde — okunamıyor (aşağıdaki "Eski şifreli dosyayı kenara al")';
  const sinamaOf = (kimlik, oz) => { const x = sinamalar[kimlik]; return x && x.degerOzeti === oz ? sinamaDisari(x) : null; };
  const satir = (o) => {
    const r = { makine: 'bu', degistirilebilir: false, silinebilir: false, sinanabilir: false, nasil: null, sonSinama: null, ek: null, ...o };
    if (kilit && r.sirDosyasi) { r.durum = 'bakilmali'; r.not = kilitNotu; r.degistirilebilir = false; r.silinebilir = false; r.sinanabilir = false; }
    delete r.sirDosyasi;
    if (r.sonSinama && r.durum === 'tamam') {
      if (r.sonSinama.cekmeIzni) { r.durum = 'bakilmali'; r.not = 'PARA ÇEKME izni açık — borsada hemen kapatın.'; r.tehlike = true; }
      else if (!r.sonSinama.ok) { r.durum = 'bakilmali'; r.not = `Son sınama başarısız: ${r.sonSinama.hata || 'bilinmeyen hata'}`; }
    }
    l.push(r);
  };
  const ad = (k) => { const b = botlar.find(x => x.kimlik === k); return b ? b.ad : k; };
  const kipte = (mod) => botlar.filter(b => b.mod === mod).map(b => b.ad);

  // ── Borsa hesapları ──
  for (const [id, t] of Object.entries(SABIT)) {
    const k = s[t.key], g = s[t.secret];
    const kim = kipte(t.tur === 'canli' ? 'canli' : 'demo');
    const oz = ozetle(`borsa:${id}`, k, g);
    let durum, not;
    if (k && g) { durum = 'tamam'; not = t.tur === 'canli' ? 'Canlı hesap kapısı kapalıyken kullanılmaz.' : 'Botların demo hesap anahtarı.'; }
    else if (k || g) { durum = 'bakilmali'; not = k ? 'Gizli anahtar (secret) eksik.' : 'API anahtarı eksik.'; }
    else if (kim.length) { durum = 'eksik'; not = `${kim.join(', ')} ${t.tur === 'canli' ? 'canlı' : 'demo'} hesapta ama anahtar yok.`; }
    else { durum = 'bos'; not = t.tur === 'canli' ? 'Canlı hesap kapalı — şimdilik gerekmez.' : 'Girilmemiş.'; }
    satir({ kimlik: `borsa:${id}`, grup: 'borsa', tip: 'borsa-sabit', ad: t.ad, sirDosyasi: true,
      kullanan: kim.length ? kim.join(', ') : (t.tur === 'canli' ? 'şu an hiçbir bot (canlı hesap kapalı)' : 'şu an hiçbir bot demo hesapta değil'),
      maske: maskele(k), ozet: oz, durum, not, ek: { borsa: 'binance', tur: t.tur, altHesap: null, sabit: true },
      degistirilebilir: true, silinebilir: !!(k || g), sinanabilir: !!(k && g), sonSinama: sinamaOf(`borsa:${id}`, oz) });
  }
  for (const [id, h0] of Object.entries(nesne(s.borsaHesaplari))) {
    if (!HESAP_ID.test(id) || SABIT[id]) continue;
    const h = nesne(h0);
    const oz = ozetle(`borsa:${id}`, h.apiKey, h.apiSecret, h.parola);
    const eksik = !h.apiKey || !h.apiSecret || (h.borsa === 'okx' && !h.parola);
    const son = h.sonSinama && h.sonSinama.degerOzeti === oz ? sinamaDisari(h.sonSinama) : null;
    satir({ kimlik: `borsa:${id}`, grup: 'borsa', tip: 'borsa-hesap', ad: metin(h.ad, 40) || id, sirDosyasi: true,
      kullanan: 'henüz hiçbir bot (bot → hesap bağlantısı Faz 2)', maske: maskele(h.apiKey), ozet: oz,
      durum: eksik ? 'bakilmali' : 'tamam', not: eksik ? (h.borsa === 'okx' && !h.parola ? 'OKX parolası (passphrase) eksik.' : 'Anahtarın bir parçası eksik.') : (son ? null : 'Henüz sınanmadı.'),
      ek: { borsa: BORSALAR[h.borsa] ? h.borsa : null, tur: TURLER[h.tur] ? h.tur : null, altHesap: metin(h.altHesap, 40) || null, eklendi: h.eklendi || null, degisti: h.degisti || null },
      degistirilebilir: true, silinebilir: true, sinanabilir: !eksik, sonSinama: son });
  }

  // ── İşlem defterim (salt okuma) ──
  const defter = nesne(s.islemDefteri);
  let defterVar = false;
  for (const borsa of ['okx', 'binance']) {
    for (const [id, a0] of Object.entries(nesne(defter[borsa]))) {
      if (!DEFTER_ID.test(id)) continue;
      defterVar = true;
      const a = nesne(a0);
      const kimlik = `defter:${borsa}:${id}`;
      const oz = ozetle(kimlik, a.apiKey, a.secret, a.passphrase);
      const hesapAd = (typeof ctx.hesapAdi === 'function' && ctx.hesapAdi(id)) || id;
      satir({ kimlik, grup: 'defter', tip: `defter-${borsa}`, ad: `${borsa === 'okx' ? 'OKX' : 'Binance'} — ${metin(hesapAd, 40)}`, sirDosyasi: true,
        kullanan: 'İşlem defterim (yalnız okuma: işlem geçmişi eşitleme)', maske: maskele(a.apiKey), ozet: oz,
        durum: a.apiKey && a.secret ? 'tamam' : 'bakilmali', not: Array.isArray(a.izinler) && a.izinler.length ? `İzinler: ${a.izinler.slice(0, 4).map(x => metin(x, 24)).join(', ')}` : null,
        ek: { borsa, hesap: id }, degistirilebilir: !ctx.arastirma, silinebilir: !ctx.arastirma, sinanabilir: !!(a.apiKey && a.secret), sonSinama: sinamaOf(kimlik, oz),
        nasil: ctx.arastirma ? { metin: 'Her bilgisayar kendi İşlem defterim anahtarını kendi panelinden kaydeder.', href: '#/portfoy/islem-defteri' } : null });
    }
  }
  if (!defterVar) {
    satir({ kimlik: 'defter:yok', grup: 'defter', tip: 'bilgi', ad: 'İşlem defterim anahtarı', kullanan: 'İşlem defterim (OKX / Binance eşitleme)', maske: null, ozet: null,
      durum: 'bos', not: 'Kayıtlı salt okuma anahtarı yok. Hesabı seçerek İşlem defterim\'den eklenir.', nasil: { metin: 'İşlem defterim\'de ekle', href: '#/portfoy/islem-defteri' } });
  }

  // ── Bildirim ──
  const tg = nesne(s.telegram).botToken;
  const tgOz = ozetle('telegram', tg);
  satir({ kimlik: 'telegram', grup: 'bildirim', tip: 'telegram', ad: 'Telegram bot jetonu', kullanan: 'Telegram bildirimleri ve komutları', sirDosyasi: true,
    maske: maskele(tg), ozet: tgOz, durum: tg ? 'tamam' : (ctx.telegramAcik ? 'eksik' : 'bos'),
    not: tg ? (ctx.telegramAcik ? null : 'Kayıtlı, bildirimler kapalı (Ayarlar › Bildirimler).') : (ctx.telegramAcik ? 'Bildirimler açık ama jeton yok.' : 'Girilmemiş.'),
    degistirilebilir: true, silinebilir: !!tg, sinanabilir: !!tg, sonSinama: sinamaOf('telegram', tgOz) });
  const bs = nesne(s.bindirmeSaglik);
  for (const b of botlar) {
    if (!BOT_ID.test(b.kimlik)) continue;
    const url = b.kimlik === 'hucum' ? s.healthchecksUrl : bs[b.kimlik];
    const kimlik = `saglik:${b.kimlik}`;
    const oz = ozetle(kimlik, url);
    const calisiyor = b.mod === 'demo' || b.mod === 'canli';
    satir({ kimlik, grup: 'bildirim', tip: 'saglik', ad: `Sağlık sinyali — ${b.ad}`, kullanan: `${b.ad} günlük çalışma sinyali (healthchecks.io)`, sirDosyasi: true,
      maske: maskele(url), ozet: oz, durum: url ? 'tamam' : (calisiyor ? 'bakilmali' : 'bos'),
      not: url ? null : (calisiyor ? `${b.ad} çalışıyor ama sinyal adresi yok — durursa haber gelmez.` : 'Girilmemiş.'),
      degistirilebilir: true, silinebilir: !!url, sinanabilir: !!url, sonSinama: sinamaOf(kimlik, oz) });
  }
  {
    const url = s.healthchecksSunucuUrl;
    const oz = ozetle('saglik:sunucu', url);
    satir({ kimlik: 'saglik:sunucu', grup: 'bildirim', tip: 'saglik', ad: 'Sağlık sinyali — sunucu kalp atışı', kullanan: 'sunucu açık mı (saatte bir)', sirDosyasi: true,
      maske: maskele(url), ozet: oz, durum: url ? 'tamam' : 'bos', not: url ? null : 'İsteğe bağlı.',
      degistirilebilir: true, silinebilir: !!url, sinanabilir: !!url, sonSinama: sinamaOf('saglik:sunucu', oz) });
  }
  {
    const k = nesne(s.ikinciKanal);
    satir({ kimlik: 'ikinci-kanal', grup: 'bildirim', tip: 'bilgi', ad: 'İkinci kanal (ntfy) ve ikinci ölü adam', kullanan: 'Telegram çalışmazsa yedek bildirim', sirDosyasi: true,
      maske: maskele(k.ntfyKonu || k.sinyalUrl), ozet: null, durum: k.ntfyKonu || k.sinyalUrl ? 'tamam' : 'bos', not: k.ntfyKonu || k.sinyalUrl ? null : 'İsteğe bağlı.',
      nasil: { metin: 'Sağlık sayfasından ayarlanır', href: '#/saglik' } });
  }

  // ── Erişim ──
  const pin = nesne(ctx.pin);
  satir({ kimlik: 'acil-pin', grup: 'erisim', tip: 'pin', ad: 'Acil PIN', kullanan: 'telefondan acil durdurma, korumalı işlemler, bu ekrandaki her değişiklik',
    maske: null, ozet: null, durum: !pin.tanimli ? 'eksik' : pin.kilitli ? 'bakilmali' : 'tamam',
    not: !pin.tanimli ? 'Tanımlı değil — bu ekranda değişiklik yapılamaz.' : pin.kilitli ? 'Çok fazla yanlış deneme — 1 dakika kilitli.' : 'Tanımlı (değeri hiçbir yerde gösterilmez). Bütün bilgisayarlarda aynı PIN.',
    degistirilebilir: !!pin.tanimli, nasil: { metin: pin.tanimli ? 'Unutursanız bilgisayar başında sıfırlanır' : 'Bilgisayar başında bir kez', komut: 'npm run acil-pin', href: '#/kilavuz/telefon/acil-pin' } });
  const panelJeton = typeof s.panelToken === 'string' && s.panelToken.length >= 24 ? s.panelToken : null;
  satir({ kimlik: 'panel-jetonu', grup: 'erisim', tip: 'bilgi', ad: 'Panel jetonu', kullanan: 'paneli ağa açık dinletmek (HOST ≠ 127.0.0.1)', sirDosyasi: !ctx.panelJetonuEnv,
    maske: maskele(panelJeton), ozet: null, durum: ctx.panelJetonuEnv || panelJeton ? 'tamam' : 'bos',
    not: ctx.panelJetonuEnv ? 'PANEL_TOKEN ortam değişkeninden.' : panelJeton ? null : 'Yerel dinlemede gerekmez (telefon jetonu kullanılır).', nasil: { metin: 'Komutla', komut: 'npm run telefon-jeton', href: '#/kilavuz/telefon' } });
  const tj = typeof ctx.dosya === 'function' ? ctx.dosya('telefon-jeton.json') : { durum: 'yok' };
  satir({ kimlik: 'telefon-jetonu', grup: 'erisim', tip: 'bilgi', ad: 'Telefon jetonu', kullanan: 'telefondan / Tailscale\'den panele giriş, geliştirme bilgisayarının sunucuyu okuması',
    maske: tj.maske || null, ozet: null, durum: tj.durum === 'tamam' ? 'tamam' : tj.durum === 'yok' ? 'bos' : 'bakilmali',
    not: tj.durum === 'eski-sifreli' ? 'Eski şifreli dosya — okunamıyor (kenara alıp yeniden üretin).' : tj.durum === 'bozuk' ? 'Dosya okunamıyor.' : tj.durum === 'yok' ? 'Tanımlı değil — telefondan erişim kapalı.' : null,
    nasil: { metin: 'Komutla', komut: 'npm run telefon-jeton', href: '#/kilavuz/telefon' } });
  const eb = typeof ctx.dosya === 'function' ? ctx.dosya('ev-baglanti.json') : { durum: 'yok' };
  satir({ kimlik: 'sunucu-baglantisi', grup: 'erisim', tip: 'bilgi', ad: 'Sunucu bağlantısı', kullanan: 'geliştirme bilgisayarı → sunucudaki panel (okuma + yazma)',
    maske: eb.maske || null, ozet: null, durum: eb.durum === 'tamam' ? 'tamam' : eb.durum === 'yok' ? 'bos' : 'bakilmali',
    not: eb.durum === 'yok' ? (ctx.arastirma ? 'Kurulu değil.' : 'Yalnız geliştirme bilgisayarında olur.') : eb.durum === 'eski-sifreli' ? 'Eski şifreli dosya — okunamıyor.' : eb.durum === 'bozuk' ? 'Dosya okunamıyor.' : (eb.adres ? `Adres: ${metin(eb.adres, 80)}` : null),
    nasil: { metin: 'Komutla', komut: 'npm run sunucu-baglanti', href: '#/kilavuz/kurulum' } });
  satir({ kimlik: 'gelistirme-jetonu', grup: 'erisim', tip: 'bilgi', ad: 'Geliştirme yazma jetonu', kullanan: 'geliştirme bilgisayarından sunucuya kayıt yazmak',
    maske: ctx.arastirma ? (eb.yazmaMaske || null) : null, ozet: null,
    durum: ctx.arastirma ? (eb.yazmaMaske ? 'tamam' : 'bos') : (ctx.gelistirmeJetonu ? 'tamam' : 'bos'),
    not: ctx.arastirma ? (eb.yazmaMaske ? 'Sunucu bağlantısı dosyasında.' : 'Yok — buradan sunucuya yazılamaz.') : (ctx.gelistirmeJetonu ? 'Sunucuda yalnız özeti saklanır.' : 'Tanımlı değil.'),
    nasil: { metin: 'Komutla', komut: ctx.arastirma ? 'npm run sunucu-baglanti -- --yazma-jeton <jeton>' : 'npm run gelistirme-jeton', href: '#/kilavuz/kurulum' } });
  const ys = typeof ctx.dosya === 'function' ? ctx.dosya('yedek-sifre.json') : { durum: 'yok' };
  satir({ kimlik: 'yedek-sifresi', grup: 'erisim', tip: 'bilgi', ad: 'Yedek şifresi', kullanan: 'USB yedeğinin gizli kısmını şifreler', maske: null, ozet: null,
    durum: ys.durum === 'tamam' ? 'tamam' : ys.durum === 'yok' ? 'bos' : 'bakilmali',
    not: ys.durum === 'yok' ? 'Yok — USB yedeğine gizli bilgiler girmez.' : ys.durum === 'eski-sifreli' ? 'Eski şifreli dosya — okunamıyor.' : ys.durum === 'bozuk' ? 'Dosya okunamıyor.' : 'Değeri gösterilmez.',
    nasil: { metin: 'Yedek ve taşıma sekmesinde', href: '#/ayarlar/yedek' } });
  const gh = nesne(s.github).token;
  satir({ kimlik: 'github-jetonu', grup: 'erisim', tip: 'bilgi', ad: 'GitHub jetonu', kullanan: 'yalnız araştırma (787 GitHub sinyali)', sirDosyasi: true,
    maske: maskele(gh), ozet: null, durum: gh ? 'tamam' : 'bos', not: gh ? null : 'İsteğe bağlı.', nasil: { metin: 'Komutla', komut: 'npm run github-jeton', href: null } });
  return l;
}

/** Saf: saklanan sınama → ekrana giden (değer yok). */
function sinamaDisari(x) {
  if (!x || typeof x !== 'object') return null;
  return { zaman: x.zaman || null, ok: !!x.ok, cekmeIzni: x.cekmeIzni === true ? true : x.cekmeIzni === false ? false : null, ipKisitli: x.ipKisitli == null ? null : !!x.ipKisitli,
    saltOkuma: x.saltOkuma == null ? null : !!x.saltOkuma, izinler: Array.isArray(x.izinler) ? x.izinler.slice(0, 12).map(v => metin(v, 40)) : null,
    bakiye: x.bakiye && typeof x.bakiye === 'object' ? { varlikSayisi: Number(x.bakiye.varlikSayisi) || 0, usdt: Number.isFinite(x.bakiye.usdt) ? x.bakiye.usdt : null } : null,
    botAdi: x.botAdi ? metin(x.botAdi, 70) : null, uyarilar: Array.isArray(x.uyarilar) ? x.uyarilar.slice(0, 5).map(v => metin(v, 200)) : [], hata: x.hata ? metin(x.hata, 240) : null };
}

/* ══ Kurucu ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * @param d.arastirma      bu bilgisayar araştırma kopyası mı
 * @param d.sir            { oku() → nesne, yaz(nesne), kilit() → metin|null }
 * @param d.acilPin        lib/acilPin.js olustur() sonucu (bu bilgisayarın)
 * @param d.veri           (ad) → veri klasöründeki dosya yolu (lib/yollar.veri)
 * @param d.bilgi          () → { botlar: [{kimlik, ad, mod}], telegramAcik, panelJetonuEnv, gelistirmeJetonu }
 * @param d.sirlariUygula  (govde) → { durum, govde } — server.js /api/secrets çekirdeği (sabit Binance satırları, sağlık adresleri)
 * @param d.telegramUygula (jeton) → { durum, govde }
 * @param d.defter         { kaydet(borsa, g) → Promise<{durum, govde}>, sil(borsa, id) → {durum, govde}, hesapAdi(id) }
 * @param d.sina           { borsa(h), defter(borsa, a), telegram(jeton), saglik(bot) } — ağ (öz testte sahte)
 * @param d.ev             araştırma kopyasında { kurulu(), yazmaKurulu(), oku(yol) → {govde, eski, zaman}|null, yaz(yol, govde) → evYazma.yaz sonucu, adres() }
 * @param d.kasaSonrasi    (ad) → eski şifreli dosya kenara alındıktan sonra (server.js SIRLAR_KILITLI sıfırlar)
 */
function olustur(d) {
  const log = d.log || (() => {});
  const simdi = d.simdi || Date.now;
  const ev = d.arastirma ? d.ev || null : null;
  let sonSunucu = null;   // son başarılı sunucu listesi (bekleyen kaydın taban özeti için)

  /* ── Dosyalar ── */
  function dosyaDurumu(ad) {
    const yol = d.veri(ad);
    if (!fs.existsSync(yol)) return { durum: 'yok' };
    const yedekSifreli = sirKasasi.sifreliMi(`${yol}.yedek`);
    if (sirKasasi.sifreliMi(yol)) return { durum: 'eski-sifreli', yedekSifreli };
    let j = null;
    try { j = sirKasasi.oku(yol); } catch { return { durum: 'bozuk', yedekSifreli }; }
    const o = { durum: 'tamam', yedekSifreli };
    if (ad === 'telefon-jeton.json') o.maske = maskele(j && j.jeton);
    if (ad === 'ev-baglanti.json') { o.maske = maskele(j && j.jeton); o.yazmaMaske = maskele(j && j.yazmaJetonu); o.adres = j && typeof j.adres === 'string' ? j.adres.replace(/\/+$/, '') : null; }
    return o;
  }
  const kasaDosyalari = () => sirKasasi.KASA_DOSYALARI.map(ad => ({ ad, ...dosyaDurumu(ad), maske: undefined, yazmaMaske: undefined, adres: undefined }))
    .map(x => JSON.parse(JSON.stringify(x)));

  function pinOzet() { const p = d.acilPin ? d.acilPin.durum() : {}; return { tanimli: !!p.tanimli, kilitli: !!p.kilitli, kalanHak: p.kalanHak == null ? null : p.kalanHak }; }

  function sirOku() { try { return d.sir.oku() || {}; } catch { return {}; } }

  /** Bu bilgisayarın listesi (sunucuda = asıl liste; araştırma kopyasında yalnız "Bu bilgisayar" ekleri için). */
  function yerelListe() {
    const b = (d.bilgi && d.bilgi()) || {};
    return satirlar(sirOku(), { kilitli: d.sir.kilit ? d.sir.kilit() : null, botlar: b.botlar || [], telegramAcik: !!b.telegramAcik, panelJetonuEnv: !!b.panelJetonuEnv,
      gelistirmeJetonu: !!b.gelistirmeJetonu, pin: pinOzet(), dosya: dosyaDurumu, hesapAdi: d.defter && d.defter.hesapAdi, arastirma: !!d.arastirma });
  }

  /* ── Bekleyen (araştırma kopyası, GİZLİ dosya) ── */
  const bekleyenYol = () => d.veri(BEKLEYEN_AD);
  function bekleyenOku() {
    try { const j = JSON.parse(fs.readFileSync(bekleyenYol(), 'utf8')); return Array.isArray(j.kayitlar) ? j.kayitlar.filter(x => x && x.id && x.kimlik) : []; } catch { return []; }
  }
  function bekleyenYaz(l) {
    const yol = bekleyenYol();
    if (!l.length) { try { fs.unlinkSync(yol); } catch { /* yok */ } return; }
    fs.mkdirSync(path.dirname(yol), { recursive: true });
    const gecici = `${yol}.${process.pid}.${Date.now()}.tmp`;
    const fd = fs.openSync(gecici, 'w', 0o600);
    try { fs.writeSync(fd, JSON.stringify({ surum: 1, not: 'Sunucuya henüz gönderilmemiş anahtar değişiklikleri (Ayarlar › Anahtarlar). PIN burada YOK.', kayitlar: l })); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(gecici, yol);
  }
  const bekleyenDisari = (l) => l.map(x => ({ id: x.id, kimlik: x.kimlik, ad: x.ad, islem: x.islem, yeniMaske: x.yeniMaske || null, zaman: x.zaman, sonHata: x.sonHata || null }));

  /* ── PIN ── */
  function pinKapisi(g) {
    if (g.onay !== true) return { durum: 400, govde: { success: false, error: 'Onay gerekli.' } };
    if (!d.acilPin) return { durum: 428, govde: { success: false, pinTanimsiz: true, error: 'PIN modülü yok.' } };
    const r = d.acilPin.pinDogrula(String(g.pin == null ? '' : g.pin).trim());
    if (r.ok) return null;
    if (r.tanimli === false) return { durum: 428, govde: { success: false, pinTanimsiz: true, error: 'Acil PIN bu bilgisayarda tanımlı değil — önce bilgisayar başında `npm run acil-pin` ile PIN belirleyin.' } };
    return { durum: r.durum === 429 ? 429 : 400, govde: { success: false, pinHatali: true, error: r.hata, pin: pinOzet() } };
  }

  /* ── Uygulama (sunucu ya da bağlantısız yerel kopya) ── */
  async function uygula(islem, g, kademe) {
    const kimlik = islem === 'ekle' ? null : String(g.kimlik || '');
    if (islem !== 'ekle' && !KIMLIK_RE.test(kimlik)) return { durum: 400, govde: { success: false, error: 'bilinmeyen anahtar' } };
    if (kimlik && kimlik.startsWith('defter:') && kademe === 'gelistirme') return { durum: 403, govde: { success: false, error: 'İşlem defterim anahtarı her bilgisayarın kendi panelinden kaydedilir (geliştirme bilgisayarından uzaktan değil).' } };
    const kilit = d.sir.kilit ? d.sir.kilit() : null;
    if (kilit) return { durum: 409, govde: { success: false, kilitli: true, error: 'secrets.json eski şifreli biçimde — önce "Eski şifreli dosyayı kenara al", sonra yeniden deneyin.' } };
    const a = nesne(g.alanlar);
    const sil = islem === 'sil';
    if (islem === 'ekle') {
      const h = nesne(g.hesap);
      const hata = hesapDogrula(h, true);
      if (hata) return { durum: 400, govde: { success: false, error: hata } };
      const s = sirOku();
      const hs = { ...nesne(s.borsaHesaplari) };
      let id = h.kimlik ? String(h.kimlik) : `${h.borsa}-${crypto.randomBytes(3).toString('hex')}`;
      if (hs[id]) { if (h.kimlik) return { durum: 409, govde: { success: false, error: 'bu kimlikte bir hesap zaten var' } }; id = `${h.borsa}-${crypto.randomBytes(4).toString('hex')}`; }
      const z = new Date(simdi()).toISOString();
      hs[id] = { ad: metin(h.ad, 40), borsa: h.borsa, tur: h.tur, altHesap: metin(h.altHesap, 40) || null, apiKey: String(h.apiKey).trim(), apiSecret: String(h.apiSecret).trim(),
        ...(h.parola ? { parola: String(h.parola) } : {}), eklendi: z, degisti: z };
      s.borsaHesaplari = hs;
      d.sir.yaz(s);
      return { durum: 200, govde: { success: true, kimlik: `borsa:${id}` } };
    }
    const [tur, alt, alt2] = kimlik.split(':');
    if (tur === 'borsa' && SABIT[alt]) {
      const t = SABIT[alt];
      const govde = sil ? { [t.key]: '', [t.secret]: '' } : {};
      if (!sil) {
        if (a.apiKey) govde[t.key] = String(a.apiKey).trim();
        if (a.apiSecret) govde[t.secret] = String(a.apiSecret).trim();
        if (!Object.keys(govde).length) return { durum: 400, govde: { success: false, error: 'Yeni API anahtarını ve/veya gizli anahtarı girin.' } };
      }
      return d.sirlariUygula(govde);
    }
    if (tur === 'borsa') {
      const s = sirOku();
      const hs = { ...nesne(s.borsaHesaplari) };
      if (!hs[alt]) return { durum: 404, govde: { success: false, error: 'hesap bulunamadı' } };
      if (sil) delete hs[alt];
      else {
        const hata = hesapDogrula(a, false);
        if (hata) return { durum: 400, govde: { success: false, error: hata } };
        const h = { ...nesne(hs[alt]) };
        if (a.ad != null && metin(a.ad, 40)) h.ad = metin(a.ad, 40);
        if (a.altHesap != null) h.altHesap = metin(a.altHesap, 40) || null;
        if (a.tur && TURLER[a.tur]) h.tur = a.tur;
        for (const k of ['apiKey', 'apiSecret']) if (a[k]) h[k] = String(a[k]).trim();
        if (a.parola) h.parola = String(a.parola);
        h.degisti = new Date(simdi()).toISOString();
        delete h.sonSinama;
        hs[alt] = h;
      }
      if (Object.keys(hs).length) s.borsaHesaplari = hs; else delete s.borsaHesaplari;
      d.sir.yaz(s);
      return { durum: 200, govde: { success: true, kimlik } };
    }
    if (tur === 'defter') {
      if (!d.defter) return { durum: 503, govde: { success: false, error: 'İşlem defterim yüklenmedi' } };
      if (sil) return d.defter.sil(alt, alt2);
      return d.defter.kaydet(alt, { hesap: alt2, apiKey: a.apiKey, secret: a.apiSecret, passphrase: a.parola, saltOkumaOnay: a.saltOkumaOnay === true });
    }
    if (tur === 'telegram') {
      const v = sil ? '' : String(a.deger || '').trim();
      if (!sil && !TELEGRAM_RE.test(v)) return { durum: 400, govde: { success: false, error: 'Telegram jetonu biçimi geçersiz (BotFather\'ın verdiği "123456789:AA…" metni).' } };
      return d.telegramUygula(v);
    }
    if (tur === 'saglik') {
      const v = sil ? '' : String(a.deger || '').trim();
      if (!sil && !v) return { durum: 400, govde: { success: false, error: 'Ping adresini girin (https://hc-ping.com/...).' } };
      if (alt === 'hucum') return d.sirlariUygula({ healthchecksUrl: v });
      if (alt === 'sunucu') return d.sirlariUygula({ healthchecksSunucuUrl: v });
      return d.sirlariUygula({ botSaglik: { [alt]: v } });
    }
    return { durum: 400, govde: { success: false, error: 'bu anahtar panelden değiştirilmez' } };
  }

  /** Yanıttan sır sızıntısı savunması: gövdede gönderilen değerlerden biri varsa yanıt kısaltılır. */
  function temizYanit(govde, g) {
    const a = nesne(g.alanlar), h = nesne(g.hesap);
    const degerler = [a.apiKey, a.apiSecret, a.parola, a.deger, h.apiKey, h.apiSecret, h.parola, g.pin, g.eskiPin, g.yeniPin].filter(Boolean).map(String);
    if (sizintiVarMi(govde, degerler)) return { success: !!(govde && govde.success), error: govde && govde.success ? undefined : 'işlem yapılamadı (ayrıntı gizlendi)' };
    return govde;
  }

  /** Özet bilgi: kimlik → ad (günlük ve bekleyen için). */
  function kimlikAdi(kimlik, liste) {
    const r = (liste || []).find(x => x.kimlik === kimlik);
    return r ? r.ad : kimlik;
  }

  /* ── Araştırma kopyası: sunucuya ilet / bekleyene al ── */
  async function sunucuListesi() {
    if (!ev || !ev.kurulu()) return null;
    const r = await ev.oku('/api/anahtarlar').catch(() => null);
    if (r && r.govde && r.govde.success && !r.eski) sonSunucu = { zaman: r.zaman || simdi(), govde: r.govde };
    return r;
  }

  async function ilet(yol, islem, g) {
    if (!ev || !ev.kurulu()) return { durum: 403, govde: { success: false, arastirma: true, error: NASIL_BAGLANTI } };
    if (!ev.yazmaKurulu()) return { durum: 403, govde: { success: false, arastirma: true, error: NASIL_YAZMA } };
    if (g.onay !== true) return { durum: 400, govde: { success: false, error: 'Onay gerekli.' } };
    // Biçim burada da denetlenir: bekleyene geçersiz kayıt girmesin
    if (islem === 'ekle') { const h = hesapDogrula(nesne(g.hesap), true); if (h) return { durum: 400, govde: { success: false, error: h } }; }
    else if (!KIMLIK_RE.test(String(g.kimlik || ''))) return { durum: 400, govde: { success: false, error: 'bilinmeyen anahtar' } };
    if (islem === 'degistir' && String(g.kimlik).startsWith('borsa:') && !SABIT[String(g.kimlik).slice(6)]) { const h = hesapDogrula(nesne(g.alanlar), false); if (h) return { durum: 400, govde: { success: false, error: h } }; }
    if (String(g.kimlik || '').startsWith('defter:')) return { durum: 403, govde: { success: false, error: 'İşlem defterim anahtarı her bilgisayarın kendi panelinden kaydedilir — sunucudakini sunucunun panelinden, bu bilgisayarınkini İşlem defterim\'den.' } };
    // ekle: kimlik burada üretilir (bekleyip sonra gönderilse de aynı hesap iki kez eklenmesin)
    const govde = islem === 'ekle' ? { ...g, hesap: { ...nesne(g.hesap), kimlik: nesne(g.hesap).kimlik || `${nesne(g.hesap).borsa}-${crypto.randomBytes(3).toString('hex')}` } } : g;
    const r = await ev.yaz(yol, govde);
    if (r.tur === 'tamam' || r.tur === 'red') return { durum: r.durum, govde: { ...nesne(r.govde), evKaynak: { yazma: true, zaman: simdi() } } };
    if (r.tur === 'kurulu-degil') return { durum: 403, govde: { success: false, arastirma: true, error: NASIL_YAZMA } };
    // Ulaşılamadı → GİZLİ bekleyen dosyaya (PIN ve onay YAZILMAZ)
    const kimlik = islem === 'ekle' ? `borsa:${govde.hesap.kimlik}` : String(g.kimlik);
    const taban = sonSunucu && Array.isArray(sonSunucu.govde.satirlar) ? sonSunucu.govde.satirlar.find(x => x.kimlik === kimlik) : null;
    const { pin, onay, ...kayitGovde } = govde;   // eslint-disable-line no-unused-vars
    const l = bekleyenOku();
    const onceki = l.find(x => x.kimlik === kimlik);
    const a = nesne(govde.alanlar), h = nesne(govde.hesap);
    const kayit = { id: crypto.randomUUID(), zaman: new Date(simdi()).toISOString(), islem, yol, kimlik,
      ad: islem === 'ekle' ? metin(h.ad, 40) : (taban ? taban.ad : kimlik), govde: kayitGovde,
      yeniMaske: islem === 'sil' ? null : maskele(islem === 'ekle' ? h.apiKey : (a.apiKey || a.deger)),
      tabanOzet: onceki ? onceki.tabanOzet : (taban ? taban.ozet || null : null), tabanBilinir: onceki ? onceki.tabanBilinir : !!sonSunucu };
    const yeni = [...l.filter(x => x.kimlik !== kimlik), kayit].slice(-BEKLEYEN_TAVAN);
    bekleyenYaz(yeni);
    log('WARN', `Anahtarlar: sunucuya ulaşılamadı — "${kayit.ad}" değişikliği bu bilgisayarda bekliyor (${yeni.length}).`);
    return { durum: 202, govde: { success: true, bekleyen: true, sayi: yeni.length, kimlik,
      mesaj: `Sunucuya şu an ulaşılamıyor — değişiklik bu bilgisayarda bekliyor (${yeni.length}). Bağlantı gelince Anahtarlar ekranındaki "Gönder" ile gönderin (PIN yeniden sorulur).`, hata: r.hata || null } };
  }

  /* ── Router ── */
  const r = express.Router();
  const govdeOf = (req) => nesne(req.body);
  const telefon = (req) => req.kademe === 'telefon';
  const telefonRed = (res) => res.status(403).json({ success: false, kademe: 'telefon', error: 'Telefondan anahtarlar yalnız görüntülenir — değişiklik bilgisayardaki panelden.' });
  const gonder = (res, y, g) => res.status(y.durum).json(temizYanit(y.govde, g || {}));

  r.get('/api/anahtarlar', async (req, res) => {
    try {
      const yerel = { dosyalar: kasaDosyalari(), pin: pinOzet(), kilit: d.sir.kilit ? !!d.sir.kilit() : false };
      const ortak = { success: true, arastirma: !!d.arastirma, kademe: req.kademe || 'yerel', yazilabilir: !telefon(req), yerel, surum: 1 };
      if (!d.arastirma) return res.json({ ...ortak, kaynak: 'yerel', satirlar: yerelListe() });
      const bek = bekleyenOku();
      const yerelSatirlar = yerelListe().filter(x => ['sunucu-baglantisi', 'gelistirme-jetonu', 'acil-pin', 'telefon-jetonu'].includes(x.kimlik) || x.grup === 'defter')
        .map(x => ({ ...x, kimlik: `yerel:${x.kimlik}`, degistirilebilir: x.kimlik === 'acil-pin' && x.degistirilebilir, silinebilir: false, sinanabilir: false,
          nasil: x.grup === 'defter' ? { metin: 'Bu bilgisayarın İşlem defterim anahtarı — İşlem defterim\'den', href: '#/portfoy/islem-defteri' } : x.nasil }));
      const bekleyen = { sayi: bek.length, ogeler: bekleyenDisari(bek) };
      if (!ev || !ev.kurulu()) return res.json({ ...ortak, kaynak: 'sunucu-yok', mesaj: NASIL_BAGLANTI, satirlar: [], yerelSatirlar, bekleyen, yazmaKurulu: false });
      const sr = await sunucuListesi();
      const sg = sr && sr.govde && sr.govde.success ? sr.govde : null;
      if (!sg) return res.json({ ...ortak, kaynak: 'ulasilamadi', mesaj: 'Sunucudaki anahtar listesi okunamadı: sunucu kapalı, Tailscale bağlı değil ya da sunucudaki Pusula 73.0 öncesi bir sürüm (Anahtarlar ekranı yok). Sunucu güncellenince burada görünür; o zamana kadar yapılan değişiklik bu bilgisayarda bekler.', satirlar: [], yerelSatirlar, bekleyen, yazmaKurulu: !!ev.yazmaKurulu(), adres: ev.adres ? ev.adres() : null });
      return res.json({ ...ortak, kaynak: sr.eski ? 'sunucu-eski' : 'sunucu', sunucuZaman: sr.zaman || null, adres: ev.adres ? ev.adres() : null, yazmaKurulu: !!ev.yazmaKurulu(),
        satirlar: (sg.satirlar || []).map(x => ({ ...x, makine: 'sunucu' })), sunucu: { dosyalar: sg.yerel && sg.yerel.dosyalar, pin: sg.yerel && sg.yerel.pin, kilit: !!(sg.yerel && sg.yerel.kilit), surum: sg.surumPanel || null },
        yerelSatirlar, bekleyen });
    } catch (e) { res.status(500).json({ success: false, error: `liste okunamadı: ${String(e.message || e).slice(0, 160)}` }); }
  });

  const yazmaUcu = (islem, yol) => async (req, res) => {
    const g = govdeOf(req);
    if (telefon(req)) return telefonRed(res);
    try {
      if (d.arastirma) return gonder(res, await ilet(yol, islem, g), g);
      const kapi = pinKapisi(g);
      if (kapi) return gonder(res, kapi, g);
      const y = await uygula(islem, g, req.kademe);
      if (y.durum >= 200 && y.durum < 300) {
        const kimlik = y.govde.kimlik || g.kimlik;
        const liste = yerelListe();
        log('INFO', `Anahtarlar: "${kimlikAdi(kimlik, liste)}" ${islem === 'ekle' ? 'eklendi' : islem === 'sil' ? 'silindi' : 'değiştirildi'}${req.kademe === 'gelistirme' ? ' (geliştirme bilgisayarından)' : ''}.`);
        const satir = liste.find(x => x.kimlik === kimlik) || null;
        return gonder(res, { durum: 200, govde: { success: true, kimlik, satir, uyari: y.govde.uyari || null } }, g);
      }
      return gonder(res, y, g);
    } catch (e) { return gonder(res, { durum: 500, govde: { success: false, error: `yazılamadı: ${String(e.message || e).slice(0, 160)}` } }, g); }
  };
  r.post('/api/anahtarlar/hesap', yazmaUcu('ekle', '/api/anahtarlar/hesap'));
  r.post('/api/anahtarlar/degistir', yazmaUcu('degistir', '/api/anahtarlar/degistir'));
  r.post('/api/anahtarlar/sil', yazmaUcu('sil', '/api/anahtarlar/sil'));

  /** SALT OKUMA sınaması — emir yok. Sonuç `sonSinama` olarak saklanır (yazılamazsa da sonuç döner). */
  r.post('/api/anahtarlar/sina', async (req, res) => {
    const g = govdeOf(req);
    if (telefon(req)) return telefonRed(res);
    try {
      if (d.arastirma) {
        if (!ev || !ev.kurulu() || !ev.yazmaKurulu()) return res.status(403).json({ success: false, arastirma: true, error: ev && ev.kurulu() ? NASIL_YAZMA : NASIL_BAGLANTI });
        const y = await ev.yaz('/api/anahtarlar/sina', { kimlik: String(g.kimlik || '') });
        if (y.tur === 'tamam' || y.tur === 'red') return res.status(y.durum).json(y.govde);
        return res.status(503).json({ success: false, error: `Sunucuya ulaşılamadı — sınama sunucuda yapılır. ${y.hata || ''}`.trim() });
      }
      const kimlik = String(g.kimlik || '');
      if (!KIMLIK_RE.test(kimlik)) return res.status(400).json({ success: false, error: 'bilinmeyen anahtar' });
      const s = sirOku();
      const [tur, alt, alt2] = kimlik.split(':');
      let sonuc, oz, sakla;
      if (tur === 'borsa') {
        let h;
        if (SABIT[alt]) h = { borsa: 'binance', tur: SABIT[alt].tur, apiKey: s[SABIT[alt].key], apiSecret: s[SABIT[alt].secret] };
        else h = nesne(nesne(s.borsaHesaplari)[alt]);
        if (!h.apiKey || !h.apiSecret) return res.status(404).json({ success: false, error: 'bu hesapta anahtar kayıtlı değil' });
        oz = ozetle(kimlik, h.apiKey, h.apiSecret, SABIT[alt] ? undefined : h.parola);
        sonuc = await d.sina.borsa({ borsa: h.borsa, tur: h.tur, apiKey: h.apiKey, apiSecret: h.apiSecret, parola: h.parola });
        if (!SABIT[alt]) sakla = (x) => { const hs = { ...nesne(x.borsaHesaplari) }; if (hs[alt]) { hs[alt] = { ...hs[alt], sonSinama: { ...sonuc, zaman: new Date(simdi()).toISOString(), degerOzeti: oz } }; x.borsaHesaplari = hs; } };
      } else if (tur === 'defter') {
        const a = nesne(nesne(nesne(s.islemDefteri)[alt])[alt2]);
        if (!a.apiKey) return res.status(404).json({ success: false, error: 'bu hesapta anahtar kayıtlı değil' });
        oz = ozetle(kimlik, a.apiKey, a.secret, a.passphrase);
        sonuc = await d.sina.defter(alt, a);
      } else if (tur === 'telegram') {
        const t = nesne(s.telegram).botToken;
        if (!t) return res.status(404).json({ success: false, error: 'jeton kayıtlı değil' });
        oz = ozetle(kimlik, t);
        sonuc = await d.sina.telegram(t);
      } else if (tur === 'saglik') {
        const url = alt === 'hucum' ? s.healthchecksUrl : alt === 'sunucu' ? s.healthchecksSunucuUrl : nesne(s.bindirmeSaglik)[alt];
        if (!url) return res.status(404).json({ success: false, error: 'adres kayıtlı değil' });
        oz = ozetle(kimlik, url);
        sonuc = await d.sina.saglik(alt);
      } else return res.status(400).json({ success: false, error: 'bu anahtar sınanmaz' });
      const kayit = { ...sinamaDisari({ ...sonuc, zaman: new Date(simdi()).toISOString() }) };
      let saklandi = false;
      if (!(d.sir.kilit && d.sir.kilit())) {
        try {
          const x = sirOku();
          if (sakla) sakla(x); else x.anahtarSinama = { ...nesne(x.anahtarSinama), [kimlik]: { ...kayit, degerOzeti: oz } };
          d.sir.yaz(x); saklandi = true;
        } catch { /* saklanamadı: sonuç yine döner */ }
      }
      log(kayit.ok ? 'INFO' : 'WARN', `Anahtarlar: "${kimlikAdi(kimlik, yerelListe())}" sınandı — ${kayit.ok ? 'bağlantı tamam' : `başarısız (${kayit.hata})`}${kayit.cekmeIzni ? ' · PARA ÇEKME İZNİ AÇIK' : ''}.`);
      return res.json({ success: true, kimlik, sonuc: kayit, saklandi });
    } catch (e) { return res.status(500).json({ success: false, error: `sınanamadı: ${String(e.message || e).slice(0, 160)}` }); }
  });

  /** Eski şifreli dosyayı SİLMEDEN kenara al (yalnız bu bilgisayarda; PIN + onay). */
  r.post('/api/anahtarlar/eski-kenara-al', (req, res) => {
    const g = govdeOf(req);
    if (telefon(req)) return telefonRed(res);
    if (req.kademe === 'gelistirme') return res.status(403).json({ success: false, error: 'Eski şifreli dosya yalnız o bilgisayarın kendi panelinden kenara alınır.' });
    const ad = String(g.dosya || '');
    if (!sirKasasi.KASA_DOSYALARI.includes(ad)) return res.status(400).json({ success: false, error: 'bilinmeyen dosya' });
    const yol = d.veri(ad);
    const adaylar = [yol, `${yol}.yedek`].filter(f => fs.existsSync(f) && sirKasasi.sifreliMi(f));
    if (!adaylar.length) return res.status(409).json({ success: false, error: 'Bu dosya eski şifreli biçimde değil — kenara alınacak bir şey yok.' });
    const kapi = pinKapisi(g);
    if (kapi) return gonder(res, kapi, g);
    const z = new Date(simdi()).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const yeniAdlar = [];
    try {
      for (const f of adaylar) {
        let hedef = `${f}.eski-sifreli-${z}`;
        for (let i = 2; fs.existsSync(hedef); i++) hedef = `${f}.eski-sifreli-${z}-${i}`;
        fs.renameSync(f, hedef);
        yeniAdlar.push(path.basename(hedef));
      }
    } catch (e) { return res.status(500).json({ success: false, error: `yeniden adlandırılamadı (${e.code || 'hata'}) — dosya yerinde duruyor`, kenaraAlinan: yeniAdlar }); }
    try { sirKasasi.ayarla(); } catch { /* önbellek */ }
    try { if (d.kasaSonrasi) d.kasaSonrasi(ad); } catch { /* */ }
    log('WARN', `Anahtarlar: eski şifreli ${ad} kenara alındı (silinmedi): ${yeniAdlar.join(', ')}.`);
    return res.json({ success: true, dosya: ad, kenaraAlinan: yeniAdlar,
      mesaj: `${ad} silinmedi, ${yeniAdlar[0]} adıyla kenara alındı. ${ad === 'secrets.json' ? 'Anahtarları bu ekrandan yeniden girebilirsiniz.' : ad === 'telefon-jeton.json' ? 'Yeni telefon jetonu: npm run telefon-jeton.' : ''}`.trim() });
  });

  /** Acil PIN değiştir: eski PIN + yeni PIN ×2. Araştırma kopyasında önce sunucu, başarılıysa bu bilgisayar (sessiz ayrışma yok). */
  r.post('/api/anahtarlar/pin-degistir', async (req, res) => {
    const g = govdeOf(req);
    if (telefon(req)) return telefonRed(res);
    if (g.onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
    const yeni = String(g.yeniPin == null ? '' : g.yeniPin).trim();
    if (yeni !== String(g.yeniPin2 == null ? '' : g.yeniPin2).trim()) return res.status(400).json({ success: false, error: 'Yeni PIN iki kez aynı yazılmalı.' });
    const yerelDegistir = () => {
      const s = d.acilPin ? d.acilPin.degistir(g.eskiPin, yeni) : { ok: false, durum: 428, hata: 'PIN modülü yok' };
      if (s.ok) return { ok: true };
      const tanimsiz = !(d.acilPin && d.acilPin.durum().tanimli);
      return { ok: false, durum: tanimsiz ? 428 : s.durum === 403 ? 400 : s.durum, hata: tanimsiz ? 'Bu bilgisayarda acil PIN tanımlı değil — burada `npm run acil-pin` ile aynı PIN\'i belirleyin.' : s.hata };
    };
    if (!d.arastirma) {
      const s = yerelDegistir();
      if (!s.ok) return res.status(s.durum || 400).json({ success: false, error: s.hata, pin: pinOzet() });
      log('WARN', `Anahtarlar: acil PIN değiştirildi${req.kademe === 'gelistirme' ? ' (geliştirme bilgisayarından)' : ''}.`);
      return res.json({ success: true, mesaj: 'Acil PIN değiştirildi. Ortak PIN: öbür bilgisayarlarda da aynı PIN\'i girin (Faz 3\'te kendiliğinden eşitlenecek).' });
    }
    // Araştırma kopyası: önce sunucu (yanlış eski PIN ya da ulaşılamazsa burada da DEĞİŞMEZ), sonra bu bilgisayar.
    let sunucu = { ok: false, hata: NASIL_BAGLANTI, atlandi: true };
    if (ev && ev.kurulu() && ev.yazmaKurulu()) {
      const y = await ev.yaz('/api/anahtarlar/pin-degistir', { eskiPin: g.eskiPin, yeniPin: yeni, yeniPin2: yeni, onay: true });
      sunucu = y.tur === 'tamam' ? { ok: true } : y.tur === 'red' ? { ok: false, hata: metin(y.govde && y.govde.error, 200) } : { ok: false, hata: `sunucuya ulaşılamadı: ${metin(y.hata, 160)}`, ulasilamadi: true };
    } else if (ev && ev.kurulu()) sunucu = { ok: false, hata: NASIL_YAZMA, atlandi: true };
    if (!sunucu.ok) {
      return res.status(sunucu.ulasilamadi ? 503 : 400).json({ success: false, sunucu, yerel: { ok: false, atlandi: true },
        error: `PIN değişmedi (sunucuda da bu bilgisayarda da): ${sunucu.hata}` });
    }
    const yerel = yerelDegistir();
    if (!yerel.ok) {
      log('WARN', 'Anahtarlar: acil PIN SUNUCUDA değişti, bu bilgisayarda DEĞİŞMEDİ.');
      return res.status(207).json({ success: false, ayrisma: true, sunucu, yerel,
        error: `PIN yalnız SUNUCUDA değişti; bu bilgisayarda değişmedi (${yerel.hata}). İki bilgisayarda PIN şu an FARKLI — bu bilgisayarda \`npm run acil-pin\` ile yeni PIN'i girin.` });
    }
    log('WARN', 'Anahtarlar: acil PIN değiştirildi (sunucuda ve bu bilgisayarda).');
    return res.json({ success: true, sunucu, yerel, mesaj: 'Acil PIN sunucuda ve bu bilgisayarda değiştirildi. Başka bilgisayarlar varsa orada da aynı PIN\'i girin (Faz 3\'te kendiliğinden eşitlenecek).' });
  });

  /** Bekleyenleri gönder (araştırma kopyası). Sunucudaki değer o arada değiştiyse 409 + çakışmalar; `secimler` { id: 'yerel'|'sunucu' }. */
  r.post('/api/anahtarlar/bekleyen/gonder', async (req, res) => {
    const g = govdeOf(req);
    if (telefon(req)) return telefonRed(res);
    if (!d.arastirma) return res.status(400).json({ success: false, error: 'bekleyen değişiklik yalnız araştırma kopyasında olur' });
    if (g.onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
    if (!ev || !ev.kurulu() || !ev.yazmaKurulu()) return res.status(403).json({ success: false, error: ev && ev.kurulu() ? NASIL_YAZMA : NASIL_BAGLANTI });
    const l = bekleyenOku();
    if (!l.length) return res.json({ success: true, gonderilen: 0, kalan: 0 });
    const sr = await sunucuListesi();
    if (!sr || sr.eski || !sr.govde || !sr.govde.success) return res.status(503).json({ success: false, error: 'Sunucuya hâlâ ulaşılamıyor — değişiklikler bu bilgisayarda bekliyor.' });
    const sunucuSatir = (k) => (sr.govde.satirlar || []).find(x => x.kimlik === k) || null;
    const secimler = nesne(g.secimler);
    const cakismalar = [];
    for (const p of l) {
      const s = sunucuSatir(p.kimlik);
      const simdiOz = s ? s.ozet || null : null;
      const degisti = p.tabanBilinir ? simdiOz !== (p.tabanOzet || null) : !!simdiOz && p.islem !== 'ekle';
      if (degisti && !['yerel', 'sunucu'].includes(secimler[p.id])) {
        cakismalar.push({ id: p.id, kimlik: p.kimlik, ad: (s && s.ad) || p.ad, islem: p.islem, sunucuMaske: s ? s.maske : null, sunucuDurum: s ? s.durum : 'yok',
          yerelMaske: p.yeniMaske, yerelZaman: p.zaman, tabanBilinmiyor: !p.tabanBilinir });
      }
    }
    if (cakismalar.length) return res.status(409).json({ success: false, cakisma: true, cakismalar, error: 'Sunucudaki değer siz yazdıktan sonra değişmiş — hangisinin geçerli olacağını seçin.' });
    let gonderilen = 0, atilan = 0;
    let kalan = l.slice();
    for (const p of l) {
      if (secimler[p.id] === 'sunucu') { kalan = kalan.filter(x => x.id !== p.id); atilan++; bekleyenYaz(kalan); continue; }
      const y = await ev.yaz(p.yol, { ...p.govde, pin: g.pin, onay: true });
      if (y.tur === 'tamam') { kalan = kalan.filter(x => x.id !== p.id); gonderilen++; bekleyenYaz(kalan); continue; }
      const hata = y.tur === 'red' ? metin(y.govde && y.govde.error, 240) : `sunucuya ulaşılamadı: ${metin(y.hata, 160)}`;
      kalan = kalan.map(x => (x.id === p.id ? { ...x, sonHata: hata } : x));
      bekleyenYaz(kalan);
      const pinHatasi = y.tur === 'red' && y.govde && (y.govde.pinHatali || y.govde.pinTanimsiz);
      if (gonderilen || atilan) log('INFO', `Anahtarlar: ${gonderilen} bekleyen değişiklik sunucuya gönderildi${atilan ? `, ${atilan} bırakıldı` : ''}.`);
      return res.status(y.tur === 'red' ? (y.durum === 429 ? 429 : 400) : 503).json({ success: false, gonderilen, atilan, kalan: kalan.length, pinHatali: !!pinHatasi,
        error: `"${p.ad}" gönderilemedi: ${hata}`, bekleyen: { sayi: kalan.length, ogeler: bekleyenDisari(kalan) } });
    }
    log('INFO', `Anahtarlar: ${gonderilen} bekleyen değişiklik sunucuya gönderildi${atilan ? `, ${atilan} bırakıldı (sunucudaki geçerli)` : ''}.`);
    return res.json({ success: true, gonderilen, atilan, kalan: 0 });
  });

  /** Bekleyen bir değişiklikten vazgeç (yerel kopya silinir; sır azalır — PIN istemez, onay ister). */
  r.post('/api/anahtarlar/bekleyen/vazgec', (req, res) => {
    const g = govdeOf(req);
    if (telefon(req)) return telefonRed(res);
    if (g.onay !== true) return res.status(400).json({ success: false, error: 'Onay gerekli.' });
    const l = bekleyenOku();
    if (!l.some(x => x.id === g.id)) return res.status(404).json({ success: false, error: 'böyle bir bekleyen değişiklik yok' });
    const kalan = l.filter(x => x.id !== g.id);
    bekleyenYaz(kalan);
    return res.json({ success: true, kalan: kalan.length });
  });

  return { router: r, yerelListe, bekleyenOku, kasaDosyalari, sunucuListesi };
}

module.exports = { olustur, satirlar, maskele, ozetle, hesapDogrula, sizintiVarMi, sinamaDisari, SABIT, BORSALAR, KIMLIK_RE, BEKLEYEN_AD, TELEGRAM_RE };
