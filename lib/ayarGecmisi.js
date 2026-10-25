'use strict';
/**
 * AYAR GEÇMİŞİ (74.2, C2 — TASARIM-MAKINE-HESAP-BOT.md; B2 olay akışı ileride bu kaydı okuyacak)
 * ═══════════════════════════════════════════════════════════════════════════
 * Panelin yazdığı her ayar değişikliği: kim (kaynak: panel / telefon / Telegram / araç / sistem), ne zaman, hangi makine,
 * hangi uç, eski → yeni. Tek bir değişiklik "Geri al" ile eski değerine döner.
 *
 * KAYIT: <veri>/ayar-gecmisi/kayit.jsonl — YALNIZ EKLENİR (satır başına bir olay, birden çok alan). Döndürme: dosya 5 MB'ı
 * aşınca ya da ilk satırı 1 yıldan eskiyse bütün dosya `kayit-<ilk gün>_<son gün>.jsonl` adıyla AYNI klasörde kenara
 * alınır — hiçbir satır silinmez. Okuma bütün parçaları birleştirir.
 * Satır: { id (sha 12), z, makine: { ad, rol }, tur: 'config'|'bildirim'|'sermaye'|'anahtar', kaynak, uc, kademe,
 *          degisiklikler: [{ yol, eski, yeni, eskiYok?, yeniYok?, sir?, gizli?, kisaltildi? }], geriAlinan? }
 *
 * SIRLAR ASLA KAYDA GİRMEZ: anahtar adı (apiKey, secret, token/jeton, pin, şifre/parola, healthchecks, chatId …) ya da değer
 * biçimi (Telegram jetonu, hc-ping adresi, uzun rastgele dizi) sır sayılır → değer yerine "•••" (boşsa null): "değişti"
 * bilgisi kalır, değer yok. Sır satırı geri alınamaz.
 *
 * GERİ AL (geriAl): yalnız bilgisayardan (kademe 'yerel'; telefon ve geliştirme kademesi 403 — telefon salt okuma), ACİL PIN
 * (lib/acilPin.js pinDogrula — aynı yanlış deneme sayacı ve kilit), değişiklik uygulayıcısı AYNI doğrulama yolundan geçer
 * (config: /api/config çekirdeği; bildirim: bildirim merkezinin ayarlayıcıları; sermaye: tasarımcı /sermaye çekirdeği).
 * Ayarın bugünkü değeri kaydın "yeni"sine eşit değilse (sonradan yeniden değiştiyse) 409 — sonraki değişiklik ezilmez.
 * Güvenlik kapısını GEVŞETEN geri alma (zarar sınırı büyür, koruma kapanır, uyarı kapanır …) ek olarak "GERİ AL" yazdırır.
 * Geri alma da yeni bir kayıt olarak yazılır (geriAlinan: <id>).
 *
 * BAĞLAM: AsyncLocalStorage — server.js express.json'dan SONRA `middleware` her isteği { kaynak, uc, kademe } ile sarar;
 * Telegram'dan gelen yazma `baglamla({ kaynak: 'telegram' })`; bağlam yoksa 'sistem'.
 * Antivirüs: dosya yalnız eklenir/yeniden adlandırılır; süreç başlatma, ACL, şifreleme YOK.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const MASKE = '•••';
const BOYUT_SINIRI = 5 * 1024 * 1024;
const YAS_SINIRI_GUN = 365;
const DEGER_TAVAN = 4000;   // JSON karakter; üstü kısaltılır (geri alınamaz)
const ONAY_METNI = 'GERİ AL';
const TURLER = ['config', 'bildirim', 'sermaye', 'anahtar'];
const KAYNAKLAR = ['panel', 'telefon', 'telegram', 'arac', 'sistem'];

/* ══ Sır süzgeci (saf) ═══════════════════════════════════════════════════════════════════════════ */
/** Bilinen sır alanları (server.js SECRET_KEYS + Telegram + diğer). */
const SIR_ALANLARI = new Set(['apiKey', 'apiSecret', 'testnetApiKey', 'testnetApiSecret', 'healthchecksUrl', 'healthchecksSunucuUrl',
  'botToken', 'chatId', 'panelToken', 'pin', 'acilPin', 'parola', 'passphrase', 'password', 'secret', 'token', 'jeton',
  'yedekSifre', 'sifre', 'ozet', 'tuz', 'privateKey', 'cookie', 'webhook', 'webhookUrl', 'gelistirmeJetonu', 'yazmaJetonu', 'githubJeton']);
const SIR_ADI = /(api[_-]?key|secret|token|jeton|şifre|sifre|parola|password|passphrase|healthchecks|webhook|chat[_-]?id|cookie|private[_-]?key|mnemonic|credential)/i;
/** "pin", "acilPin", "pinOzet" — "pine", "spinner", "pinned" değil (büyük/küçük harf duyarlı). */
const PIN_ADI = /(^pin|Pin)(?![a-z])/;

function sirAnahtariMi(anahtar) {
  const a = String(anahtar == null ? '' : anahtar);
  return SIR_ALANLARI.has(a) || SIR_ADI.test(a) || PIN_ADI.test(a);
}
/** Değer biçimi sır gibi mi: Telegram jetonu, hc-ping adresi, 32+ karakterlik boşluksuz rastgele dizi. */
function sirDegerMi(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s) return false;
  if (/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(s)) return true;
  if (/hc-ping\.com\//i.test(s)) return true;
  if (/[?&](token|key|secret|sig)=/i.test(s)) return true;
  if (/^[0-9a-f]{32,}$/i.test(s)) return true;
  if (s.length >= 32 && /^[A-Za-z0-9_\-+/=.]+$/.test(s) && /\d/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s) && !/[a-z]_[a-z]/.test(s)) return true;
  return false;
}
const yolSirMi = (yol) => String(yol || '').split('.').some(sirAnahtariMi);
/** Saf: değerin içindeki sırları maskeler (nesne/dizi derinliğinde). */
function temizle(v, derinlik = 0) {
  if (derinlik > 12) return MASKE;
  if (typeof v === 'string') return sirDegerMi(v) ? MASKE : v;
  if (Array.isArray(v)) return v.map(x => temizle(x, derinlik + 1));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = sirAnahtariMi(k) ? (bosMu(x) ? null : MASKE) : temizle(x, derinlik + 1);
    return o;
  }
  return v;
}
const bosMu = (x) => x == null || x === '' || (typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length);
/** Değerde (derinlikte) sır var mı — varsa satır geri alınamaz (maskeli değer geri yazılamaz). */
function sirIceriyor(v, derinlik = 0) {
  if (derinlik > 12) return true;
  if (typeof v === 'string') return sirDegerMi(v);
  if (Array.isArray(v)) return v.some(x => sirIceriyor(x, derinlik + 1));
  if (v && typeof v === 'object') return Object.entries(v).some(([k, x]) => (sirAnahtariMi(k) && !bosMu(x)) || sirIceriyor(x, derinlik + 1));
  return false;
}

/* ══ Fark (saf) ══════════════════════════════════════════════════════════════════════════════════ */
const duzMu = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esit = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/**
 * Saf: iki ayar nesnesinin yaprak farkları [{ yol, eski, yeni }] (yok = undefined). Düz nesneler iç içe; diziler ve `butun`
 * kümesindeki anahtarlar (server.js REPLACE_KEYS: clusters, presets) tek değer sayılır.
 */
function farkBul(eski, yeni, o = {}) {
  const butun = o.butun || new Set(['clusters', 'presets']);
  const out = [];
  const gez = (a, b, onEk) => {
    const anahtarlar = new Set([...Object.keys(duzMu(a) ? a : {}), ...Object.keys(duzMu(b) ? b : {})]);
    for (const k of anahtarlar) {
      const x = duzMu(a) ? a[k] : undefined, y = duzMu(b) ? b[k] : undefined;
      const yol = onEk ? `${onEk}.${k}` : k;
      if (!butun.has(k) && duzMu(x) && duzMu(y)) { gez(x, y, yol); continue; }
      if (!butun.has(k) && duzMu(x) && y === undefined) { gez(x, {}, yol); continue; }
      if (!butun.has(k) && x === undefined && duzMu(y)) { gez({}, y, yol); continue; }
      if (!esit(x, y)) out.push({ yol, eski: x, yeni: y });
    }
  };
  gez(eski, yeni, '');
  return out;
}

/** Saf: ham fark satırı → kayda girecek (sırsız, kısaltılmış) satır. `gizliYol(yol)` true ise değer "•••" (kişisel tutar). */
function satirHazirla(f, o = {}) {
  const sir = yolSirMi(f.yol) || sirDegerMi(f.eski) || sirDegerMi(f.yeni);
  const gizli = !sir && typeof o.gizliYol === 'function' && o.gizliYol(f.yol);
  const s = { yol: String(f.yol) };
  const koy = (ad, v) => {
    if (v === undefined) { s[ad] = null; s[`${ad}Yok`] = true; return; }
    if (sir || gizli) { s[ad] = bosMu(v) ? null : MASKE; return; }
    const t = temizle(v);
    const j = JSON.stringify(t);
    if (j && j.length > DEGER_TAVAN) { s[ad] = null; s.kisaltildi = true; s[`${ad}Ozet`] = { uzunluk: j.length, sha: crypto.createHash('sha256').update(j).digest('hex').slice(0, 12) }; return; }
    s[ad] = t;
  };
  koy('eski', f.eski); koy('yeni', f.yeni);
  if (sir) s.sir = true;
  if (gizli) s.gizli = true;
  if (!sir && (sirIceriyor(f.eski) || sirIceriyor(f.yeni))) s.sirIcerir = true;
  return s;
}

/* ══ Gevşetme (saf) ══════════════════════════════════════════════════════════════════════════════ */
/** Büyüdükçe gevşeyen sayısal sınırlar. */
const BUYUK_GEVSEK = new Set(['risk.maxDrawdownPct', 'risk.dailyLossLimitPct', 'risk.maxPositionSizePct', 'risk.maxOpenRiskPct', 'risk.riskPerTradePct',
  'risk.maxRiskPerBotPct', 'risk.maxConcurrentPositions', 'risk.maxSymbolExposurePct', 'risk.maxClusterExposurePct', 'risk.maxGrossExposurePct',
  'risk.stopLossPct', 'risk.atrStopMaxPct', 'risk.atrStopMultiplier', 'risk.maxLossStreak', 'risk.trailingStopPct', 'risk.atrStopMinPct']);
/** Küçüldükçe gevşeyen. */
const KUCUK_GEVSEK = new Set(['risk.cooldownMinutes', 'risk.antiMartingaleStep']);
/** true → false gevşetir (koruma / uyarı kapanır). */
const KAPANIRSA_GEVSEK = new Set(['risk.dailyLossLimitEnabled', 'risk.openRiskLimitEnabled', 'risk.exposureLimitsEnabled', 'risk.cooldownEnabled',
  'risk.trailingStop', 'risk.atrStopEnabled', 'risk.riskSizingEnabled', 'risk.equityTiersEnabled', 'risk.antiMartingaleEnabled', 'risk.strategyStopPrecedence',
  'telegram.enabled', 'telegram.notifyCritical', 'telegram.notifyErrors', 'telegram.notifyLifecycle', 'telegram.notifyTrades',
  'sermaye.telefondaGizle', 'bildirim.genel.tutarGizle']);
const GEVSEK_AD = /(fren|zarar|kayip|kayıp|loss|drawdown|limit|max|kill|tavan|esik)/i;
const KORUMA_AD = /(enabled|etkin|fren|koruma|guard|stop)/i;

/**
 * Saf: bu ayarı `simdiki` değerden `hedef` değere döndürmek bir güvenlik kapısını gevşetir mi.
 * `tamYol` = `<tur>.<yol>` için 'sermaye.' / 'bildirim.' öneki; config yolu öneksiz.
 */
function gevsetirMi(tamYol, simdiki, hedef) {
  const y = String(tamYol || '');
  const son = y.split('.').pop();
  const n = (v) => (typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : NaN));
  if (y === 'mode') return hedef === 'live' && simdiki !== 'live';
  if (y === 'risk.dailyLossAction') return simdiki === 'halt' && hedef !== 'halt';
  if (y === 'risk.riskTiers') return !esit(simdiki, hedef);   // kademe tablosu: her değişiklik onaylı (yön belirsiz)
  if (BUYUK_GEVSEK.has(y)) return !(n(hedef) <= n(simdiki));
  if (KUCUK_GEVSEK.has(y)) return !(n(hedef) >= n(simdiki));
  if (KAPANIRSA_GEVSEK.has(y)) return (simdiki !== false && hedef === false) || (simdiki === true && hedef !== true);
  if (/^bildirim\.turler\.[^.]+\.acik$/.test(y)) return simdiki === true && hedef === false;   // bildirim türü kapanır
  // Genel sezgi: adı sınır/koruma olan alanlar.
  if (typeof simdiki === 'boolean' && KORUMA_AD.test(son)) return simdiki === true && hedef !== true;
  if (GEVSEK_AD.test(son) && Number.isFinite(n(simdiki)) && Number.isFinite(n(hedef))) return n(hedef) > n(simdiki);
  if (/^risk\./.test(y) && typeof simdiki !== 'number' && typeof simdiki !== 'boolean') return !esit(simdiki, hedef);   // risk bölümünde yönü bilinmeyen
  return false;
}

/* ══ Uygunluk (saf) ══════════════════════════════════════════════════════════════════════════════ */
/** Config'te geri alınamayan üst bölümler (kendi uçları ve ek kapıları var). */
const CONFIG_OZEL_UST = new Set(['bindirme', 'canliIzin', 'canli', 'kalkan', 'bots', 'activeSymbols', 'botConfigs', 'symbolConfigs', 'sirlar']);
/** Config değişikliğinin geri alınabildiği uçlar (aynı genel ayar yolundan geçenler). */
const CONFIG_GENEL_UC = /^POST \/api\/(config|watchlist\/(add|remove)|ayar-gecmisi\/geri-al)$/i;
const SERMAYE_GERI_ALINIR = /^(kesirli|telefondaGizle|minIslemUSD|hesaplar\.[a-z-]{2,20})$/;
const BILDIRIM_GERI_ALINIR = /^(turler\.[a-z]+\.(acik|kanal|sessiz|metin)|sessiz\.(acik|bas|bit)|uretici\.(fiyat|makine|bilanco|takvim)\.[A-Za-z]+|genel\.tutarGizle)$/;

/**
 * Saf: bir değişiklik satırı geri alınabilir mi. `simdiki` = ayarın bugünkü (etkin) değeri (bilinmiyorsa undefined + simdikiYok).
 * Döndürür { uygun, neden?, gevsetme?, hedef?, hedefYok? }.
 */
function uygunluk(kayit, d, o = {}) {
  const red = (neden) => ({ uygun: false, neden });
  if (!kayit || !d) return red('kayıt bulunamadı');
  if (o.kademe && o.kademe !== 'yerel') return red('Telefondan ayar geçmişi yalnız görüntülenir — geri alma bilgisayardaki panelden.');
  if (o.uzak) return red('Bu kayıt sunucuya ait — sunucudaki panelden geri alınır.');
  if (kayit.tur === 'anahtar' || d.sir || d.sirIcerir) return red('Sır (anahtar, jeton, PIN …) değeri kayda yazılmaz — geri alınamaz; Ayarlar › Anahtarlar\'dan yeniden girin.');
  if (d.gizli) return red('Tutar kayda yazılmaz — ilgili ekrandan elle girin.');
  if (d.kisaltildi) return red('Değer çok büyük olduğu için kayda yalnız özeti yazıldı — geri alınamaz.');
  if (kayit.tur === 'config') {
    const ust = String(d.yol).split('.')[0];
    if (CONFIG_OZEL_UST.has(ust)) return red('Bu ayar kendi ekranından (ek onaylarla) değişir — orada geri çevirin.');
    if (!CONFIG_GENEL_UC.test(String(kayit.uc || ''))) return red(`Bu değişiklik kendi ekranından yapıldı (${kayit.uc || 'sistem'}) — geri almak için aynı ekranı kullanın.`);
  } else if (kayit.tur === 'sermaye') {
    if (!SERMAYE_GERI_ALINIR.test(d.yol)) return red('Model sermayesi tutarı geri alınmaz — Model portföyler ekranından girin.');
  } else if (kayit.tur === 'bildirim') {
    if (!BILDIRIM_GERI_ALINIR.test(d.yol)) return red(/^gecici/.test(d.yol) ? 'Geçici sessiz süreyle biter — geri alınmaz ("Erken bitir").' : 'Bu bildirim ayarı geri alınamaz.');
  } else return red('bilinmeyen tür');
  if (o.arastirma && kayit.tur !== 'config') return red('Araştırma kopyası: bu ayar sunucuda tutulur — sunucudaki panelden.');
  if (o.simdikiYok !== true && !esit(o.simdiki === undefined ? null : o.simdiki, d.yeniYok ? null : d.yeni) && !(d.yeniYok && o.simdiki === undefined)) {
    return red('Bu ayar bu değişiklikten SONRA yeniden değişti — önce sonraki değişikliği geri alın (sonraki değişiklik ezilmez).');
  }
  const hedef = d.eskiYok ? undefined : d.eski;
  const tamYol = kayit.tur === 'config' ? d.yol : `${kayit.tur}.${d.yol}`;
  return { uygun: true, hedef, hedefYok: !!d.eskiYok, gevsetme: gevsetirMi(tamYol, o.simdiki, hedef) };
}

/** Onay metni normali ("geri al" = "GERİ AL" = "GERI AL"). */
const onayNormal = (s) => String(s == null ? '' : s).trim().toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/\s+/g, ' ');

/** Saf: nesnede noktalı yola değer koy (undefined → sil; o.tanimsizBirak → anahtar undefined kalır). Kopya döner. */
function yolaKoy(nesne, yol, deger, o = {}) {
  const parcalar = String(yol).split('.');
  const kok = duzMu(nesne) ? JSON.parse(JSON.stringify(nesne)) : {};
  let n = kok;
  for (let i = 0; i < parcalar.length - 1; i++) { if (!duzMu(n[parcalar[i]])) n[parcalar[i]] = {}; n = n[parcalar[i]]; }
  const son = parcalar[parcalar.length - 1];
  if (deger === undefined && !o.tanimsizBirak) delete n[son]; else n[son] = deger;   // tanimsizBirak: birleştirmede anahtarı silsin (JSON'a yazılmaz)
  return kok;
}
function yoldanAl(nesne, yol) {
  let n = nesne;
  for (const p of String(yol).split('.')) { if (!duzMu(n) || !(p in n)) return undefined; n = n[p]; }
  return n;
}

/* ══ Kayıt deposu ═════════════════════════════════════════════════════════════════════════════════ */
/**
 * @param o.dizin    kayıt klasörü (server.js: yollar.veri('ayar-gecmisi'))
 * @param o.makine   { ad, rol } (varsayılan os.hostname / 'sunucu')
 * @param o.acilPin  lib/acilPin.js örneği (pinDogrula)
 * @param o.log      (düzey, metin)
 * @param o.simdi    () → ms (test)
 * @param o.boyutSiniri / o.yasSiniriGun (test)
 */
function olustur(o = {}) {
  if (!o.dizin) throw new Error('ayarGecmisi: dizin gerekli');
  const dizin = o.dizin;
  const dosya = path.join(dizin, 'kayit.jsonl');
  const simdi = o.simdi || Date.now;
  const log = o.log || (() => {});
  const makine = { ad: String((o.makine && o.makine.ad) || os.hostname() || 'bilinmeyen').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40) || 'bilinmeyen', rol: (o.makine && o.makine.rol) || 'sunucu' };
  const boyutSiniri = o.boyutSiniri || BOYUT_SINIRI;
  const yasSiniriMs = (o.yasSiniriGun || YAS_SINIRI_GUN) * 86400000;
  const als = new AsyncLocalStorage();
  let sonHata = null;

  function kaynakOf(req) {
    const uc = `${req.method} ${req.path}`;
    if (req.headers && req.headers['x-pusula-sistem']) return 'sistem';
    if (/^\/api\/sorun-arac\//.test(req.path || '')) return 'arac';
    if (req.kademe === 'telefon') return 'telefon';
    void uc;
    return 'panel';
  }
  /** Express ara katmanı (express.json'dan SONRA). */
  function middleware(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const store = { kaynak: kaynakOf(req), uc: `${req.method} ${req.path}`, kademe: req.kademe || 'yerel', kayit: 0 };
    req.ayarBaglam = store;
    return als.run(store, next);
  }
  /** fn'yi verilen bağlamda çalıştırır (Telegram, geri alma). Mevcut bağlamın sayacı paylaşılır. */
  function baglamla(ek, fn) {
    const ust = als.getStore();
    const store = { ...(ust || {}), ...ek, kayit: 0 };
    try { return als.run(store, fn); } finally { if (ust) ust.kayit += store.kayit; }
  }
  const baglam = () => als.getStore() || null;

  function satirlariOku(f) {
    let metin = '';
    try { metin = fs.readFileSync(f, 'utf8'); } catch { return { satirlar: [], bozuk: 0 }; }
    const satirlar = []; let bozuk = 0;
    for (const s of metin.split('\n')) { if (!s.trim()) continue; try { satirlar.push(JSON.parse(s)); } catch { bozuk++; } }
    return { satirlar, bozuk };
  }
  /** Döndürme: 5 MB üstü ya da ilk satır 1 yıldan eski → bütün dosya kenara (silme yok). */
  function dondur() {
    let st;
    try { st = fs.statSync(dosya); } catch { return null; }
    let ilk = null;
    try {
      const fd = fs.openSync(dosya, 'r');
      try { const b = Buffer.alloc(Math.min(st.size, 65536)); fs.readSync(fd, b, 0, b.length, 0); const s = b.toString('utf8').split('\n')[0]; ilk = JSON.parse(s).z || null; } finally { fs.closeSync(fd); }
    } catch { ilk = null; }
    const eski = ilk && simdi() - Date.parse(ilk) > yasSiniriMs;
    if (st.size < boyutSiniri && !eski) return null;
    const gun = (ms) => new Date(ms).toISOString().slice(0, 10);
    let ad = `kayit-${ilk ? String(ilk).slice(0, 10) : gun(st.mtimeMs)}_${gun(simdi())}.jsonl`;
    for (let i = 2; fs.existsSync(path.join(dizin, ad)); i++) ad = ad.replace(/(-\d+)?\.jsonl$/, `-${i}.jsonl`);
    fs.renameSync(dosya, path.join(dizin, ad));
    log('INFO', `🗂️ Ayar geçmişi döndürüldü: ${ad} (silinmedi)`);
    return ad;
  }

  /**
   * Bir değişiklik olayını yazar. farklar: farkBul çıktısı (ham; burada süzülür). Döndürür kayıt | null (fark yoksa).
   * Hata ayarı yazanı durdurmaz (log + sonHata).
   */
  function kaydet({ tur, farklar, gizliYol, kaynak, uc, kademe } = {}) {
    try {
      if (!TURLER.includes(tur) || !Array.isArray(farklar) || !farklar.length) return null;
      const b = baglam() || {};
      const degisiklikler = farklar.map(f => satirHazirla(f, { gizliYol }));
      const kayit = { id: '', z: new Date(simdi()).toISOString(), makine, tur, kaynak: kaynak || b.kaynak || 'sistem', uc: uc || b.uc || null, kademe: kademe || b.kademe || null,
        degisiklikler, ...(b.geriAlinan ? { geriAlinan: b.geriAlinan } : {}) };
      kayit.id = crypto.createHash('sha256').update(JSON.stringify(kayit) + crypto.randomBytes(8).toString('hex')).digest('hex').slice(0, 12);
      fs.mkdirSync(dizin, { recursive: true });
      dondur();
      fs.appendFileSync(dosya, JSON.stringify(kayit) + '\n', 'utf8');
      if (b && typeof b.kayit === 'number') b.kayit++;
      sonHata = null;
      return kayit;
    } catch (e) { sonHata = e.message; log('WARN', `🗂️ Ayar geçmişi yazılamadı: ${e.message}`); return null; }
  }

  /** Bütün parçalar (eskiden yeniye). */
  function hepsi() {
    let adlar = [];
    try { adlar = fs.readdirSync(dizin).filter(a => /^kayit-.*\.jsonl$/.test(a)).sort(); } catch { adlar = []; }
    const l = []; let bozuk = 0;
    for (const a of [...adlar, 'kayit.jsonl']) { const r = satirlariOku(path.join(dizin, a)); l.push(...r.satirlar); bozuk += r.bozuk; }
    return { kayitlar: l, bozuk, parca: adlar.length + 1 };
  }
  /** Süzgeçli okuma (yeniden eskiye). bas/bit 'YYYY-MM-DD' (dahil), tur, makine, n (≤ 2000). */
  function oku(s = {}) {
    const h = hepsi();
    const n = Math.min(2000, Math.max(1, Number(s.n) || 500));
    const l = h.kayitlar.filter(k => (!s.tur || k.tur === s.tur) && (!s.makine || (k.makine && k.makine.ad) === s.makine)
      && (!s.bas || String(k.z).slice(0, 10) >= s.bas) && (!s.bit || String(k.z).slice(0, 10) <= s.bit));
    return { kayitlar: l.reverse().slice(0, n), toplam: l.length, bozuk: h.bozuk, parca: h.parca };
  }
  const bul = (id) => hepsi().kayitlar.find(k => k.id === id) || null;

  /**
   * GERİ AL. g = { id, yol?, pin, onay }. ctx = { kademe, arastirma, simdiki: (tur, yol) → değer, uygula: { config|bildirim|sermaye: (yol, hedef, hedefYok) → { durum, govde } } }.
   * Döndürür { durum, govde }.
   */
  async function geriAl(g = {}, ctx = {}) {
    const hata = (durum, error, ek = {}) => ({ durum, govde: { success: false, error, ...ek } });
    if ((ctx.kademe || 'yerel') !== 'yerel') return hata(403, 'Geri alma yalnız bilgisayardaki panelden yapılır (telefon salt okuma).');
    const id = String(g.id || '');
    if (!/^[0-9a-f]{12}$/.test(id)) return hata(400, 'kayıt kimliği geçersiz');
    const kayit = bul(id);
    if (!kayit) return hata(404, 'Kayıt bulunamadı.');
    const ds = kayit.degisiklikler || [];
    const d = g.yol != null ? ds.find(x => x.yol === String(g.yol)) : (ds.length === 1 ? ds[0] : null);
    if (!d) return hata(400, ds.length > 1 ? 'Bu kayıtta birden çok alan var — hangi alanın geri alınacağını seçin.' : 'alan bulunamadı');
    if (kayit.makine && kayit.makine.ad !== makine.ad) return hata(409, 'Bu kayıt başka bir makineye ait — o makinenin panelinden geri alınır.');
    let simdiki, simdikiYok = false;
    try { simdiki = ctx.simdiki ? ctx.simdiki(kayit.tur, d.yol) : undefined; } catch { simdikiYok = true; }
    const u = uygunluk(kayit, d, { simdiki, simdikiYok, arastirma: !!ctx.arastirma });
    if (!u.uygun) return hata(409, u.neden);
    if (u.gevsetme && onayNormal(g.onay) !== onayNormal(ONAY_METNI)) {
      return hata(400, `Bu geri alma bir güvenlik kapısını GEVŞETİYOR (${d.yol}). Onay için "${ONAY_METNI}" yazın.`, { gevsetme: true, onayMetni: ONAY_METNI });
    }
    const p = ctx.acilPin ? ctx.acilPin.pinDogrula(String(g.pin == null ? '' : g.pin).trim()) : (o.acilPin ? o.acilPin.pinDogrula(String(g.pin == null ? '' : g.pin).trim()) : { ok: false, durum: 403, hata: 'PIN modülü yok' });
    if (!p.ok) return hata(p.durum || 403, p.hata, { pinHata: true });
    const f = ctx.uygula && ctx.uygula[kayit.tur];
    if (typeof f !== 'function') return hata(409, 'Bu tür bu makinede geri alınamaz.');
    let r;
    try { r = await baglamla({ geriAlinan: id, uc: 'POST /api/ayar-gecmisi/geri-al', kaynak: 'panel' }, () => f(d.yol, u.hedef, u.hedefYok)); }
    catch (e) { return hata(e.durum || 500, `Geri alınamadı: ${e.message}`); }
    if (!r || r.durum >= 300) return { durum: (r && r.durum) || 500, govde: { success: false, error: `Geri alınamadı (aynı doğrulamadan geçmedi): ${(r && r.govde && r.govde.error) || 'bilinmeyen hata'}` } };
    log(u.gevsetme ? 'WARN' : 'INFO', `🗂️ Ayar geri alındı: ${kayit.tur} ${d.yol} (kayıt ${id}${u.gevsetme ? ', GEVŞETME — "GERİ AL" onaylı' : ''}, PIN ile)`);
    return { durum: 200, govde: { success: true, id, yol: d.yol, gevsetme: u.gevsetme, ozet: `${d.yol} eski değerine döndü.` } };
  }

  return { middleware, baglamla, baglam, kaydet, oku, bul, hepsi, dondur, geriAl, makine, dosya, dizin, durum: () => ({ sonHata, dosya }) };
}

module.exports = { olustur, farkBul, satirHazirla, temizle, sirAnahtariMi, sirDegerMi, sirIceriyor, gevsetirMi, uygunluk, yolaKoy, yoldanAl, onayNormal,
  MASKE, ONAY_METNI, TURLER, KAYNAKLAR, BOYUT_SINIRI, YAS_SINIRI_GUN, CONFIG_OZEL_UST };
