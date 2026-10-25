'use strict';
/**
 * BOT TAŞIMA (75.5, 3. faz parça 3c — TASARIM-MAKINE-HESAP-BOT §4.4 adım adım; PLAN-MAKINE-HESAP-BOT §4 f2/f3; §11 kararları)
 * ═══════════════════════════════════════════════════════════════════════════
 * Bir bindirme botunu (kâğıt ya da demo; GERÇEK PARA ve Kairos demo kabulü HARİÇ — lib/makine/nobet.js tasinabilirMi) eşlenmiş bir
 * SUNUCU makinesine taşır. Kaynak sürer (itme modeli); hedef yalnız iki dar makine ucu açar (makine jetonuyla, MAKINE_IZINLI):
 *   POST /api/makine/tasima/hazirlik   hedef ön denetimi → tek kullanımlık hazırlık kimliği (10 dk) + hedefteki mevcut nöbet
 *   POST /api/makine/tasima/al         paket (application/octet-stream, ≤ PAKET_TAVAN, başlıkta SHA-256) → doğrula, yerleştir, kaydı yaz
 *
 * AKIŞ (kaynak — `tasi`, yalnız bu bilgisayar + yerel PIN + "TAŞI"; uç lib/makine/api.js):
 *   1. Ön denetim: bot taşınabilir mi (canlı / Kairos demo / model örneği red), zaten taşınıyor ya da başka makinede mi, hedef eşlenmiş
 *      SUNUCU mu, aynı protokol + 'bot-tasima-1' yeteneği, karar penceresi dışı, demo ise bağlı hesap + bu makinede yedek şifresi.
 *   2. Hedef ön denetimi (hazırlık) — RED gelirse kaynakta HİÇBİR ŞEY değişmez (bot çalışıyorsa çalışmaya devam eder).
 *   3. Kaynak hazırlık: durum `tasiniyor` { hedef, nöbet n+1 } DİSKE yazılır (bot artık burada başlayamaz), bot DURDURULUR (pozisyonlara,
 *      borsadaki emirlere/felaket stoplarına DOKUNULMAZ), süren çalışma beklenir, borsa bağlantısı kesilir.
 *   4. Paket (tar.gz, lib/paket.js): bildiri.json (dosya başına SHA-256) + kayit.json (makine = hedef, nöbet n+1) + veri/<bot dizinleri>/…
 *      + (demo) gizli.enc — bağlı borsa hesabının anahtarı ve sağlık adresi, YEDEK ŞİFRESİYLE (AES-256-GCM + scrypt; lib/paket.js sifrele).
 *      Sır düz metin hiçbir yere yazılmaz, gitmez; kâğıt botta sır paketlenmez.
 *   5. Aktarım → hedef: geçici klasöre açar, her dosyayı SHA-256 ile doğrular, gizliyi KENDİ yedek şifresiyle çözer (iki makinede aynı
 *      olmalı; yoksa/farklıysa red), YERLEŞTİRİR: var olan bot dizinleri onceki-bot-<kimlik>-<zaman>'a TAŞINIR (silinmez), yeniler yerine;
 *      eksik anahtar eklenir (var olan FARKLI anahtarın üzerine yazılmaz → red); KAYIT YAZILIR (= taşımanın tamamlanma noktası); bot
 *      `tasima-bekliyor`a girer (kendiliğinden başlamaz). Yarıda hata → yerleşim günlüğüyle (yerlesim.json) her adım geri alınır, 4xx.
 *      Hedef süreç yarıda düşerse açılışta günlükten geri alınır (yarimKalanlariGeriAl — bot dizinleri kurulmadan önce).
 *   6. Kaynak: 200 → kayıt makine = hedef, nöbet n+1 ("taşındı"; dizinler olduğu gibi durur — geri dönüş için), Telegram haberi.
 *      Kesin red (4xx) → `basarisiz` (bot durmuş kalır; kullanıcı Başlat ile geri açar). Belirsiz (ağ hatası / zaman aşımı / 5xx) →
 *      hedefin özeti sorulur (cozumle): hedef yeni nöbeti taşıyorsa "taşındı", taşımıyorsa "başarısız", ulaşılamıyorsa `tasiniyor`
 *      KALIR (iki makinede de başlamaz) — "Yeniden denetle" / açılışta yeniden sorulur.
 *   7. Hedefte mutabakat (borsayla karşılaştırma) yanıttan SONRA çalışır; temizse Başlat açılır — kullanıcı basar (f3).
 *   GERİ ALMA YOLU: başarısız/belirsiz durumlar yukarıdaki gibi; tamamlanmış taşıma = aynı akışla geri taşıma (hedef → kaynak, nöbet n+2).
 *
 * Bot verisinin ve kaydın yeri, sırların yazımı, botun yeniden kurulması ve mutabakat sunucu tarafında (lib/sunucu/makineUclari.js `bot`
 * bağdaştırıcısı) — bu modül komut satırı, alt süreç, PowerShell, Görev Zamanlayıcı, ACL kullanmaz; ağ yalnız lib/makine/istemci.js.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { PassThrough, Readable } = require('stream');
const P = require('../paket');
const protokol = require('./protokol');
const istemci = require('./istemci');
const nobetLib = require('./nobet');

const BICIM = 'pusula-bot-tasima';
const BICIM_SURUM = 1;
const PAKET_TAVAN = 64 * 1024 * 1024;
const HAZIRLIK_MS = 10 * 60 * 1000;
const AL_ZAMAN_ASIMI_MS = 120 * 1000;
const DURUM_AD = 'bot-tasima.json';
const GUNLUK_AD = 'yerlesim.json';
const YETENEK = 'bot-tasima-1';
const BOT_RE = /^[a-z][a-z0-9]{1,15}$/;
const DIZIN_RE = /^[a-z][a-z0-9]{1,15}(-demo|-canli)?$/;
const PARCA_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
/** Pakete girmeyen geçici dosyalar (lib/tasima.js GECICI ile aynı). */
const GECICI = /\.tmp$|\.yaziliyor(-\d+)?$|\.kilit$/i;

const hata = (mesaj, durum = 400, kod) => Object.assign(new Error(mesaj), { durum, kod });
const damga = (t = Date.now()) => new Date(t).toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function jsonOku(f, yedek = null) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return yedek; } }
function jsonYaz(f, n) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const g = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(g, JSON.stringify(n, null, 1), 'utf8');
  fs.renameSync(g, f);
}
function icDolu(d) {
  let st; try { st = fs.lstatSync(d); } catch { return false; }
  if (st.isFile()) return true;
  if (!st.isDirectory()) return false;
  for (const a of fs.readdirSync(d)) if (icDolu(path.join(d, a))) return true;
  return false;
}
/** Klasör altındaki düz dosyalar [{ goreli, tam }]; bağlar izlenmez, geçici dosyalar atlanır, ad kuralına uymayan parça RED. */
function dosyalar(kok) {
  const out = [];
  const gez = (d, g) => {
    let st; try { st = fs.lstatSync(d); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) { for (const a of fs.readdirSync(d).sort()) gez(path.join(d, a), g ? `${g}/${a}` : a); return; }
    if (!st.isFile() || GECICI.test(d)) return;
    for (const p of g.split('/')) if (!PARCA_RE.test(p)) throw hata(`bot dizininde paketlenemeyen dosya adı: ${g}`, 409, 'dosya-adi');
    out.push({ goreli: g, tam: d });
  };
  gez(kok, '');
  return out;
}

/* ══ Paket ══════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Paket üretir (bellekte; bot dizinleri MB düzeyinde, tavan PAKET_TAVAN).
 * @param o.meta     bildiriye girecek alanlar (bot, nobet, kaynak, hedef, uygulama, protokol, mod, adGorunen)
 * @param o.kayit    taşınan bot kaydı (makine = hedef, nobet = yeni)
 * @param o.dizinler [{ ad: 'kimlik' | 'kimlik-demo' | 'kimlik-canli', yol }]
 * @param o.gizli    { veri: Buffer (şifreli), kripto } | null
 * @returns {Promise<{ buf: Buffer, sha: string, bildiri }>}
 */
async function paketUret({ meta, kayit, dizinler, gizli = null }) {
  const girdiler = [];
  const kayitBuf = Buffer.from(JSON.stringify(kayit, null, 1), 'utf8');
  girdiler.push({ yol: 'kayit.json', buf: kayitBuf });
  let toplam = kayitBuf.length;
  for (const d of dizinler || []) {
    if (!DIZIN_RE.test(d.ad)) throw hata(`bot dizini adı geçersiz: ${d.ad}`, 409);
    for (const f of dosyalar(d.yol)) {
      const buf = fs.readFileSync(f.tam);
      toplam += buf.length;
      if (toplam > PAKET_TAVAN) throw hata(`bot verisi taşıma sınırını (${PAKET_TAVAN / 1048576} MB) aşıyor`, 413, 'buyuk');
      girdiler.push({ yol: `veri/${d.ad}/${f.goreli}`, buf });
    }
  }
  if (gizli) girdiler.push({ yol: 'gizli.enc', buf: gizli.veri });
  const bildiri = { bicim: BICIM, surum: BICIM_SURUM, ...meta, dizinler: (dizinler || []).map(d => d.ad),
    dosyalar: girdiler.map(g => ({ yol: g.yol, boyut: g.buf.length, sha256: sha256(g.buf) })), gizli: gizli ? gizli.kripto : null };
  const gz = zlib.createGzip();
  const parcalar = [];
  gz.on('data', (c) => parcalar.push(c));
  const bitti = new Promise((ok, red) => { gz.on('end', ok); gz.on('error', red); });
  const t = P.tarYazici(gz);
  const bb = Buffer.from(JSON.stringify(bildiri, null, 1), 'utf8');
  await t.dosya('bildiri.json', bb.length, bb);
  for (const g of girdiler) await t.dosya(g.yol, g.buf.length, g.buf);
  await t.bitir();
  gz.end();
  await bitti;
  const buf = Buffer.concat(parcalar);
  if (buf.length > PAKET_TAVAN) throw hata('paket taşıma sınırını aşıyor', 413, 'buyuk');
  return { buf, sha: sha256(buf), bildiri };
}

/** Saf: paket içi yol güvenli mi (bildiri.json, kayit.json, gizli.enc, veri/<bot dizini>/<parçalar>). */
function icYolGecerli(y) {
  if (y === 'kayit.json' || y === 'gizli.enc') return true;
  const p = String(y || '').split('/');
  if (p.length < 3 || p[0] !== 'veri' || !DIZIN_RE.test(p[1])) return false;
  return p.slice(2).every(x => PARCA_RE.test(x) && x !== '..' && x !== '.');
}

/**
 * Paketi geçici klasöre açar ve DOĞRULAR (fazla/eksik dosya, boyut, SHA-256). @returns { bildiri, kayit, gizli: Buffer|null }
 * Hata → throw (çağıran geçici klasörü siler).
 */
async function paketAc(buf, hedef) {
  fs.mkdirSync(hedef, { recursive: true });
  let bildiri = null;
  const gorulen = new Map();
  const kaynak = Readable.from([buf]);
  const gz = zlib.createGunzip();
  kaynak.pipe(gz);
  try {
    await P.tarOku(gz, async (kayit) => {
      if (!bildiri) {
        if (kayit.ad !== 'bildiri.json') throw hata('paket bozuk: ilk kayıt bildiri değil', 400, 'paket');
        const parca = [];
        return { yaz: async (b) => { parca.push(b); }, bitir: async () => {
          try { bildiri = JSON.parse(Buffer.concat(parca).toString('utf8')); } catch { throw hata('paket bozuk: bildiri okunamadı', 400, 'paket'); }
          if (!bildiri || bildiri.bicim !== BICIM || bildiri.surum !== BICIM_SURUM || !Array.isArray(bildiri.dosyalar)) throw hata('paket biçimi tanınmıyor (bot taşıma paketi değil ya da başka sürüm)', 400, 'paket');
          for (const d of bildiri.dosyalar) if (!d || !icYolGecerli(d.yol) || !Number.isInteger(d.boyut) || !/^[0-9a-f]{64}$/.test(String(d.sha256 || ''))) throw hata(`paket bozuk: bildiride geçersiz dosya (${d && d.yol})`, 400, 'paket');
        } };
      }
      const bek = bildiri.dosyalar.find(d => d.yol === kayit.ad);
      if (!bek || gorulen.has(kayit.ad)) throw hata(`paket bozuk: bildiride olmayan ya da yinelenen dosya (${kayit.ad})`, 400, 'paket');
      const tam = path.join(hedef, ...kayit.ad.split('/'));
      if (!path.resolve(tam).startsWith(path.resolve(hedef) + path.sep)) throw hata('paket bozuk: yol dışarı çıkıyor', 400, 'paket');
      fs.mkdirSync(path.dirname(tam), { recursive: true });
      const h = crypto.createHash('sha256');
      let boyut = 0;
      const fd = fs.openSync(tam, 'w');
      return { yaz: async (b) => { h.update(b); boyut += b.length; fs.writeSync(fd, b); }, bitir: async () => {
        fs.closeSync(fd);
        gorulen.set(kayit.ad, { sha: h.digest('hex'), boyut });
      } };
    });
  } catch (e) {
    if (e && e.durum) throw e;
    throw hata(`paket açılamadı: ${e.message}`, 400, 'paket');
  }
  if (!bildiri) throw hata('paket boş', 400, 'paket');
  for (const d of bildiri.dosyalar) {
    const g = gorulen.get(d.yol);
    if (!g) throw hata(`paket eksik: ${d.yol}`, 400, 'paket');
    if (g.sha !== d.sha256 || g.boyut !== d.boyut) throw hata(`paket bozuk: ${d.yol} doğrulanamadı (SHA-256)`, 400, 'paket');
  }
  if (!gorulen.has('kayit.json')) throw hata('paket eksik: kayit.json', 400, 'paket');
  const kayit = jsonOku(path.join(hedef, 'kayit.json'));
  if (!kayit) throw hata('paket bozuk: kayıt okunamadı', 400, 'paket');
  const gizli = gorulen.has('gizli.enc') ? fs.readFileSync(path.join(hedef, 'gizli.enc')) : null;
  if (!!gizli !== !!bildiri.gizli) throw hata('paket bozuk: gizli kısım bildiriyle uyuşmuyor', 400, 'paket');
  return { bildiri, kayit, gizli };
}

/* ══ Yerleşim günlüğü (hedef) ══════════════════════════════════════════════════════════════════════════════════ */

/**
 * Günlüğü geri alır: dizin taşımalarını ters sırayla çözer, kayıt ve sırları eski hâline döndürür. Dosya düzeyi (açılışta bot
 * dizinleri kurulmadan önce de çalışır). @param ops { kayitGeriYukle(k, eski), sirGeriAl(eklenen) } — açılışta kayıt dosya düzeyinde.
 */
function gunlukGeriAl(gunluk, ops = {}, log = () => {}) {
  const hatalar = [];
  const adimlar = Array.isArray(gunluk.adimlar) ? [...gunluk.adimlar].reverse() : [];
  for (const a of adimlar) {
    try {
      if (a.tur === 'yeni' && fs.existsSync(a.yer)) {
        // yerleştirilen yeni dizin → geçici klasörün çöp kısmına (silinmez; günlükle birlikte kalır)
        let cop = path.join(gunluk.gecici, 'geri-alinan', path.basename(a.yer));
        for (let i = 2; fs.existsSync(cop); i++) cop = path.join(gunluk.gecici, 'geri-alinan', `${path.basename(a.yer)}-${i}`);
        fs.mkdirSync(path.dirname(cop), { recursive: true });
        fs.renameSync(a.yer, cop);
      } else if (a.tur === 'onceki' && fs.existsSync(a.onceki) && !fs.existsSync(a.yer)) {
        fs.mkdirSync(path.dirname(a.yer), { recursive: true });
        fs.renameSync(a.onceki, a.yer);
      }
    } catch (e) { hatalar.push(`${a.yer}: ${e.message}`); }
  }
  if (gunluk.kayitYazildi && ops.kayitGeriYukle) { try { ops.kayitGeriYukle(gunluk.bot, gunluk.kayitOnceki || null); } catch (e) { hatalar.push(`kayıt: ${e.message}`); } }
  if (Array.isArray(gunluk.sirEklenen) && gunluk.sirEklenen.length && ops.sirGeriAl) { try { ops.sirGeriAl(gunluk.sirEklenen); } catch (e) { hatalar.push(`sır: ${e.message}`); } }
  if (hatalar.length) log('ERROR', `🚚 Taşıma geri alınırken sorun: ${hatalar.join(' · ')}`);
  return hatalar;
}

/**
 * AÇILIŞ ONARIMI (hedef süreç yerleşim sırasında düştüyse): <klasor>/bot-*\/yerlesim.json durumu 'tamam' değilse geri alınır.
 * Kayıt yazıldıktan sonra düştüyse (durum 'kayit') taşıma TAMAMDIR — yalnız günlük kapatılır (bot tasima-bekliyor'da).
 * bot dizinleri ve bot kayıtları yüklenmeden ÖNCE çağrılır (lib/sunucu/botYonetimi.js kur() başı). Döndürür [{ bot, sonuc }].
 */
function yarimKalanlariGeriAl({ klasor, kayitDizini, sirGeriAl, bekleyenEkle, log = () => {} } = {}) {
  const sonuc = [];
  let adlar = [];
  try { adlar = fs.readdirSync(klasor).filter(a => /^bot-[a-z][a-z0-9]{1,15}-/.test(a)); } catch { return sonuc; }
  for (const a of adlar) {
    const f = path.join(klasor, a, GUNLUK_AD);
    const g = jsonOku(f);
    if (!g || g.durum === 'tamam' || g.durum === 'geri-alindi') continue;
    if (g.durum === 'kayit') {
      try { if (bekleyenEkle) bekleyenEkle(g.bot, { kaynak: g.kaynak, nobet: g.nobet }); } catch { /* */ }
      jsonYaz(f, { ...g, durum: 'tamam', kapanis: 'açılışta tamamlandı' });
      durumGuncelle(klasor, g.bot, (x) => (x && x.asama === 'yerlesiyor' ? { ...x, asama: 'geldi', zaman: new Date().toISOString() } : x));
      log('WARN', `🚚 ${g.bot}: taşıma yerleşimi kayıt yazıldıktan sonra kesilmişti — tamamlandı sayıldı (bot mutabakat bekliyor)`);
      sonuc.push({ bot: g.bot, sonuc: 'tamamlandi' });
      continue;
    }
    const kayitGeriYukle = (k, eski) => {
      const dosya = path.join(kayitDizini, `${k}.json`);
      if (eski) require('../live/kaliciDosya').yaz(dosya, eski);
      else for (const x of [dosya, `${dosya}.yedek`]) { try { fs.rmSync(x, { force: true }); } catch { /* */ } }
    };
    const h = gunlukGeriAl(g, { kayitGeriYukle, sirGeriAl }, log);
    jsonYaz(f, { ...g, durum: 'geri-alindi', kapanis: 'açılışta geri alındı', hatalar: h });
    durumGuncelle(klasor, g.bot, (x) => (x && x.asama === 'yerlesiyor' ? (x.onceki || null) : x));
    log('WARN', `🚚 ${g.bot}: yarıda kalan taşıma yerleşimi açılışta geri alındı${h.length ? ` (${h.length} sorun — günlüğe bakın)` : ''}`);
    sonuc.push({ bot: g.bot, sonuc: 'geri-alindi', hatalar: h });
  }
  return sonuc;
}

/**
 * Yerleşimde EKLENEN sırları geri alır (yalnız eklenenler — taşıma var olan bir anahtarın üzerine hiç yazmaz). @param eklenen
 * [{ tur: 'sabit', key, secret } | { tur: 'hesap', id }] · @param d { loadSecrets, saveSecrets, config (bellekteki; sabit alanlar boşaltılır) }
 */
function sirEklenenGeriAl(eklenen, d) {
  if (!Array.isArray(eklenen) || !eklenen.length) return;
  const g = { ...(d.loadSecrets() || {}) };
  for (const e of eklenen) {
    if (e && e.tur === 'sabit' && /^[A-Za-z]{3,40}$/.test(String(e.key)) && /^[A-Za-z]{3,40}$/.test(String(e.secret))) {
      delete g[e.key]; delete g[e.secret];
      if (d.config) { d.config[e.key] = ''; d.config[e.secret] = ''; }
    } else if (e && e.tur === 'hesap' && g.borsaHesaplari && typeof g.borsaHesaplari === 'object') {
      const hs = { ...g.borsaHesaplari }; delete hs[e.id];
      if (Object.keys(hs).length) g.borsaHesaplari = hs; else delete g.borsaHesaplari;
    }
  }
  d.saveSecrets(g);
}

/* ══ Taşıma durumu (her makinede, MAKİNE türü <veri>/tasima/bot-tasima.json) ═════════════════════════════════════ */

function durumYolu(klasor) { return path.join(klasor, DURUM_AD); }
function durumOku(klasor) { const j = jsonOku(durumYolu(klasor)); return { surum: 1, botlar: (j && j.botlar && typeof j.botlar === 'object') ? j.botlar : {} }; }
function durumGuncelle(klasor, bot, fn) {
  const d = durumOku(klasor);
  const y = fn(d.botlar[bot] || null);
  if (y) d.botlar[bot] = y; else delete d.botlar[bot];
  jsonYaz(durumYolu(klasor), d);
  return y;
}

/**
 * Saf olmayan küçük yardımcı (lib/sunucu/botYonetimi bagla kapısı, açılış): bu bot için YEREL nöbet engeli → null | { kod, metin }.
 * Ağ yok: bot kaydı + <klasor>/bot-tasima.json + makine kimliği.
 */
function yerelEngelOku({ bot, kayit, klasor, ben }) {
  let t = null;
  try { t = durumOku(klasor).botlar[bot] || null; } catch { t = null; }
  return nobetLib.yerelEngel({ kayit, tasima: t, ben });
}

/* ══ Kurucu ══════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * @param o.klasor      taşıma klasörü (<veri>/tasima — MAKİNE türü)
 * @param o.oncekiYolu  (bot, damga) → hedefte yerinden alınan dizinlerin klasörü (<veri>/onceki-bot-<bot>-<damga> — MAKİNE)
 * @param o.ben         () → { kimlik, ad }
 * @param o.eslesme     lib/makine/eslesme olustur()
 * @param o.bot         sunucu bağdaştırıcısı (lib/sunucu/makineUclari.js) — bilgi, durdur, sirlar, hedefDenetle, sirDenetle, sirYaz,
 *                      sirGeriAl, kayitDogrula, dosyaKaydi, kayitYaz, kayitGeriYukle, dizinYolu, dizinlerAdlar, yenidenKur, mutabakat,
 *                      sahipYaz, bekleyenEkle, saglikYaz, adres
 * @param o.yedekSifre  () → yedek şifresi | null (lib/tasima.js yedekSifre)
 * @param o.surum       () → uygulama sürümü
 * @param o.rol         () → 'sunucu' | 'gelistirme'
 * @param o.kararPenceresi () → true ise taşıma 409 (UTC 23:50–01:30 — günlük karar sırasında taşıma yok)
 * @param o.log, o.bildir (baslik, satirlar, tur), o.simdi, o.fetchFn, o.alZamanAsimiMs
 */
function olustur(o) {
  const log = o.log || (() => {});
  const bildir = o.bildir || (() => {});
  const simdi = o.simdi || Date.now;
  const klasor = o.klasor;
  const B = o.bot;
  const zaman = () => new Date(simdi()).toISOString();
  const hazirliklar = new Map();   // id → { kaynak, bot, mod, nobetHedef, bitis, kullanildi }
  let yerlesimSuruyor = null;      // aynı anda tek yerleşim (bot kimliği)

  const durum = () => durumOku(klasor);
  const botDurum = (k) => durum().botlar[k] || null;
  const botDurumYaz = (k, v) => durumGuncelle(klasor, k, () => v);
  const esAd = (kimlik) => { try { return (o.eslesme.es(kimlik) || {}).ad || kimlik; } catch { return kimlik; } };

  /** Bu bot için yerel nöbet engeli (bagla kapısı, panel, uç kapısı). */
  function engel(k) {
    const b = B.bilgi(k);
    const t = botDurum(k);
    const e = nobetLib.yerelEngel({ kayit: b ? { makine: b.makine, nobet: b.nobet } : null, tasima: t, ben: o.ben().kimlik });
    if (!e) return null;
    return { ...e, metin: nobetLib.yerelEngel({ kayit: b ? { makine: b.makine, nobet: b.nobet } : null, tasima: t, ben: o.ben().kimlik, esAd: esAd(e.makine) }).metin };
  }
  /** Şu an bu makineye YERLEŞMEKTE olan (bot listesinde henüz olmayabilir) botlar — özet bunları da bildirir (kaynak "bekle" der). */
  function yerlesenler() { return Object.entries(durum().botlar).filter(([, v]) => v && v.asama === 'yerlesiyor').map(([k]) => k); }
  /** Nabız özetindeki bot satırına eklenen alanlar. */
  function botOzetAlanlari(k) {
    const t = botDurum(k);
    return { tasima: t && protokol.TASIMA_ASAMALARI.includes(t.asama) ? t.asama : null };
  }

  /** Eşin taze özeti (GET /api/makine/kimlik, makine jetonuyla) → { ok, ozet, hata }. */
  async function esOzeti(es, zamanAsimiMs = 8000) {
    const jeton = o.eslesme.gidenJeton(es.kimlik);
    if (!jeton) return { ok: false, hata: 'bu eş için jeton yok — yeniden eşleyin' };
    try {
      const r = await istemci.istek(es.adres, '/api/makine/kimlik', { ben: o.ben().kimlik, jeton, fetchFn: o.fetchFn, zamanAsimiMs });
      if (r.durum !== 200) return { ok: false, hata: `eş ${r.durum} döndü: ${String((r.govde && r.govde.error) || '').slice(0, 160)}` };
      const v = protokol.dogrula('kimlik', r.govde);
      if (!v.ok) return { ok: false, hata: `eşin yanıtı protokole uymuyor: ${v.hatalar.slice(0, 2).join('; ')}` };
      if (r.govde.kimlik !== es.kimlik) return { ok: false, hata: 'adresteki makine başka bir kimlik bildiriyor — yeniden eşleyin' };
      return { ok: true, ozet: protokol.temizle('kimlik', r.govde) };
    } catch (e) { return { ok: false, hata: e.message, ag: true }; }
  }

  /* ── KAYNAK ── */

  /** Taşıma ekranı için: bu makinedeki botlar + taşınabilirlik + taşıma durumu + hedef adayları. */
  function liste() {
    const ben = o.ben();
    const esler = o.eslesme.liste().makineler.filter(m => m.rol === 'sunucu').map(m => ({ kimlik: m.kimlik, ad: m.ad, adres: m.adres }));
    const botlar = B.adlar().map(k => {
      const b = B.bilgi(k);
      if (!b) return null;
      const t = botDurum(k);
      const red = nobetLib.tasinabilirMi(b, simdi());
      const e = engel(k);
      return { kimlik: k, adGorunen: b.adGorunen, mod: b.mod, calisiyor: !!b.calisiyor, nobet: b.nobet, makine: b.makine || null, makineAd: b.makine && b.makine !== ben.kimlik ? esAd(b.makine) : null,
        tasima: t ? { asama: t.asama, hedef: t.hedef || null, hedefAd: t.hedef ? esAd(t.hedef) : null, kaynak: t.kaynak || null, kaynakAd: t.kaynak ? esAd(t.kaynak) : null, nobet: t.nobet, zaman: t.zaman, neden: t.neden || null, belirsiz: !!t.belirsiz, mutabakat: t.mutabakat || null } : null,
        tasinabilir: !red && !e, neden: red ? red.metin : e ? e.metin : null };
    }).filter(Boolean);
    return { botlar, hedefler: esler, rol: o.rol(), yedekSifre: !!o.yedekSifre(), tavanMB: PAKET_TAVAN / 1048576 };
  }

  /** Bot taşıma (kaynak). @returns { durum, govde } */
  async function tasi({ bot: k, hedef }) {
    const ben = o.ben();
    if (o.rol() !== 'sunucu') return { durum: 409, govde: { success: false, error: 'Geliştirme / araştırma kopyası bot çalıştırmaz — taşıma botun çalıştığı sunucudan yapılır.' } };
    if (o.kararPenceresi && o.kararPenceresi()) return { durum: 409, govde: { success: false, error: 'Günlük karar penceresi (UTC 23:50–01:30) sürüyor — taşıma bu sırada yapılmaz; pencere bitince yeniden deneyin.' } };
    if (!BOT_RE.test(String(k || ''))) return { durum: 400, govde: { success: false, error: 'bot kimliği geçersiz' } };
    if (!protokol.KIMLIK_RE.test(String(hedef || ''))) return { durum: 400, govde: { success: false, error: 'hedef makine kimliği geçersiz' } };
    if (hedef === ben.kimlik) return { durum: 400, govde: { success: false, error: 'Hedef bu bilgisayarın kendisi.' } };
    if (yerlesimSuruyor) return { durum: 409, govde: { success: false, error: 'Bu bilgisayarda başka bir taşıma sürüyor — bitince yeniden deneyin.' } };
    const b = B.bilgi(k);
    if (!b) return { durum: 404, govde: { success: false, error: `bilinmeyen bot: ${k}` } };
    if (b.motor === 'bindirme' && (!b.yuklu || b.arsiv)) return { durum: 409, govde: { success: false, error: `${b.adGorunen || k} bu bilgisayarda yüklü değil (arşivde) — önce arşivden geri getirin.` } };
    const red = nobetLib.tasinabilirMi(b, simdi());
    if (red) return { durum: 409, govde: { success: false, kod: red.kod, error: red.metin } };
    const e = engel(k);
    if (e) return { durum: 409, govde: { success: false, kod: e.kod, error: e.metin } };
    if (!b.kayit) return { durum: 409, govde: { success: false, error: 'bot kaydı kullanılamıyor (eski yol) — taşıma için bot kaydı gerekli; Pusula\'yı yeniden başlatıp yeniden deneyin.' } };
    const es = o.eslesme.es(hedef);
    if (!es) return { durum: 404, govde: { success: false, error: 'Bu kimlikte eşlenmiş makine yok.' } };
    const oz = await esOzeti(es);
    if (!oz.ok) return { durum: 502, govde: { success: false, error: `Hedef makineye ulaşılamadı: ${oz.hata}. Hiçbir şey değiştirilmedi.` } };
    if (oz.ozet.rol !== 'sunucu') return { durum: 409, govde: { success: false, error: `${es.ad} geliştirme / araştırma bilgisayarı — bot yalnız sunucuya taşınır.` } };
    if (protokol.uyum(oz.ozet.protokol) !== 'tam') return { durum: 409, govde: { success: false, error: `${es.ad} başka bir makine protokolünde (${oz.ozet.surum}) — taşıma için iki makine aynı sürümde olmalı.` } };
    if (!protokol.yetenekVar(oz.ozet, YETENEK)) return { durum: 409, govde: { success: false, error: `${es.ad} sürümü (${oz.ozet.surum}) bot taşımayı bilmiyor — önce onu bu sürüme güncelleyin.` } };
    // Demo: bağlı hesabın anahtarı + sağlık adresi şifreli gider (yedek şifresi). Kâğıtta sır yok (sağlık adresi hedefte yeniden girilir).
    let gizliAcik = null;
    const uyarilar = [];
    const sir = B.sirlar(k, b.mod) || {};
    if (b.mod === 'demo') {
      if (!sir.hesap || !sir.hesap.apiKey || !sir.hesap.apiSecret) return { durum: 409, govde: { success: false, error: `${b.adGorunen}: demo hesabının anahtarı bu bilgisayarda yok — taşınacak hesap yok.` } };
      if (!o.yedekSifre()) return { durum: 409, govde: { success: false, kod: 'yedek-sifre-yok', error: 'Bu bilgisayarda yedek şifresi yok — demo hesabının anahtarı yedek şifresiyle şifrelenip taşınır. Ayarlar › Yedek & taşıma\'dan yedek şifresini girin (iki bilgisayarda AYNI olmalı).' } };
      gizliAcik = { hesap: sir.hesap, saglik: sir.saglik || null };
    } else if (sir.saglik) uyarilar.push('Sağlık sinyali adresi (healthchecks) kâğıt botta taşınmaz — hedefte Ayarlar › Anahtarlar\'dan yeniden girin.');
    let boyut = 0;
    for (const d of b.dizinler) for (const f of dosyalar(d.yol)) { try { boyut += fs.statSync(f.tam).size; } catch { /* */ } }
    if (boyut > PAKET_TAVAN) return { durum: 413, govde: { success: false, error: `bot verisi taşıma sınırını (${PAKET_TAVAN / 1048576} MB) aşıyor` } };
    // 2. hedef ön denetimi
    let h;
    try {
      h = await istemci.istek(es.adres, '/api/makine/tasima/hazirlik', { method: 'POST', ben: ben.kimlik, jeton: o.eslesme.gidenJeton(es.kimlik), fetchFn: o.fetchFn, zamanAsimiMs: 20000,
        govde: { protokol: protokol.MAKINE_PROTOKOL, surum: o.surum(), kimlik: ben.kimlik, gizli: !!gizliAcik, boyut,
          bot: { kimlik: k, adGorunen: b.adGorunen || null, mod: b.mod, nobet: Number(b.nobet) || 0, strateji: b.strateji || null, hesap: gizliAcik ? gizliAcik.hesap.id : null } } });
    } catch (x) { return { durum: 502, govde: { success: false, error: `Hedef makineye ulaşılamadı: ${x.message}. Hiçbir şey değiştirilmedi.` } }; }
    if (h.durum !== 200) return { durum: h.durum >= 500 ? 502 : 409, govde: { success: false, kod: (h.govde && h.govde.kod) || 'hedef-red', error: `${es.ad} taşımayı kabul etmedi: ${String((h.govde && h.govde.error) || h.durum).slice(0, 300)}. Hiçbir şey değiştirilmedi.` } };
    const hv = protokol.dogrula('tasimaHazirlikYanit', h.govde);
    if (!hv.ok || h.govde.kimlik !== es.kimlik) return { durum: 502, govde: { success: false, error: `Hedefin yanıtı protokole uymuyor: ${hv.hatalar.slice(0, 2).join('; ')}. Hiçbir şey değiştirilmedi.` } };
    const yeniNobet = Math.max(Number(b.nobet) || 0, Number(h.govde.nobet) || 0) + 1;
    // 3. kaynak hazırlık — durum diske, sonra bot durur (bundan sonra bot burada başlayamaz)
    botDurumYaz(k, { asama: 'tasiniyor', hedef, nobet: yeniNobet, zaman: zaman(), oncekiCalisiyor: !!b.calisiyor, oncekiNobet: Number(b.nobet) || 0 });
    log('WARN', `🚚 ${b.adGorunen} (${k}) ${es.ad} makinesine taşınıyor (nöbet ${yeniNobet}) — bot durduruluyor; pozisyonlara ve borsadaki emirlere dokunulmuyor`);
    yerlesimSuruyor = k;
    try {
      try { await B.durdur(k); } catch (x) {
        botDurumYaz(k, { asama: 'basarisiz', hedef, nobet: Number(b.nobet) || 0, zaman: zaman(), neden: `bot durdurulamadı: ${x.message}` });
        return { durum: 500, govde: { success: false, error: `Bot durdurulamadı (${x.message}) — taşıma yapılmadı.` } };
      }
      // 4. paket
      let paket;
      try {
        const kayit = { ...JSON.parse(JSON.stringify(b.kayit)), makine: hedef, nobet: yeniNobet };
        const gizli = gizliAcik ? P.sifrele(Buffer.from(JSON.stringify(gizliAcik), 'utf8'), o.yedekSifre()) : null;
        gizliAcik = null;
        paket = await paketUret({ meta: { bot: k, adGorunen: b.adGorunen || null, mod: b.mod, nobet: yeniNobet, kaynak: { kimlik: ben.kimlik, ad: ben.ad }, hedef, uygulama: o.surum(), protokol: protokol.MAKINE_PROTOKOL, zaman: zaman() },
          kayit, dizinler: b.dizinler, gizli });
      } catch (x) {
        botDurumYaz(k, { asama: 'basarisiz', hedef, nobet: Number(b.nobet) || 0, zaman: zaman(), neden: `paket hazırlanamadı: ${x.message}` });
        return { durum: x.durum || 500, govde: { success: false, error: `Paket hazırlanamadı (${x.message}) — taşıma yapılmadı; bot durdu, Başlat ile yeniden açabilirsiniz.` } };
      }
      // 5. aktarım
      let r = null, agHatasi = null;
      try {
        r = await istemci.istek(es.adres, '/api/makine/tasima/al', { method: 'POST', ham: paket.buf, ben: ben.kimlik, jeton: o.eslesme.gidenJeton(es.kimlik), fetchFn: o.fetchFn,
          zamanAsimiMs: o.alZamanAsimiMs || AL_ZAMAN_ASIMI_MS, basliklar: { 'x-pusula-tasima-hazirlik': h.govde.hazirlik, 'x-pusula-tasima-sha256': paket.sha } });
      } catch (x) { agHatasi = x.message; }
      if (o.testKesinti && o.testKesinti('gonderildi')) return { durum: 500, govde: { success: false, error: 'test kesintisi' } };
      if (r && r.durum === 200) {
        const v = protokol.dogrula('tasimaAlYanit', r.govde);
        if (v.ok && r.govde.bot === k && r.govde.nobet === yeniNobet && r.govde.kimlik === es.kimlik) {
          const t = tamamla(k, { hedef, nobet: yeniNobet, adGorunen: b.adGorunen, esAd: es.ad, adres: es.adres });
          return { durum: 200, govde: { success: true, bot: k, hedef, hedefAd: es.ad, nobet: yeniNobet, mutabakat: r.govde.mutabakat, uyarilar: [...uyarilar, ...(r.govde.uyarilar || []).map(String)], durum: t } };
        }
        agHatasi = `hedefin yanıtı beklenen gibi değil (${v.hatalar.slice(0, 2).join('; ') || 'nöbet/kimlik farklı'})`;
      }
      if (r && r.durum >= 400 && r.durum < 500) {
        // KESİN RED: hedef yerleşmediğini garanti eder (4xx yalnız geri alma tamamlandıktan sonra döner)
        const neden = String((r.govde && r.govde.error) || r.durum).slice(0, 300);
        botDurumYaz(k, { asama: 'basarisiz', hedef, nobet: Number(b.nobet) || 0, zaman: zaman(), neden: `hedef reddetti: ${neden}` });
        log('WARN', `🚚 ${b.adGorunen}: ${es.ad} taşımayı reddetti (${neden}) — bot bu bilgisayarda kaldı (durmuş; Başlat ile açılır)`);
        return { durum: 409, govde: { success: false, kod: (r.govde && r.govde.kod) || 'hedef-red', error: `${es.ad} paketi reddetti: ${neden}. Bot bu bilgisayarda kaldı (durmuş) — Botlar sayfasından Başlat ile yeniden açabilirsiniz.` } };
      }
      // BELİRSİZ: ağ hatası / zaman aşımı / 5xx → hedefe sor
      const neden = agHatasi || `hedef ${r && r.durum} döndü`;
      log('WARN', `🚚 ${b.adGorunen}: taşıma yanıtı alınamadı (${neden}) — hedefin durumu soruluyor`);
      const c = await cozumle(k, { neden });
      return { durum: c.asama === 'tasindi' ? 200 : c.asama === 'basarisiz' ? 409 : 202, govde: { success: c.asama === 'tasindi', bot: k, hedef, hedefAd: es.ad, nobet: yeniNobet, belirsiz: c.asama === 'tasiniyor', asama: c.asama, error: c.asama === 'tasindi' ? undefined : c.metin, metin: c.metin, uyarilar } };
    } finally { yerlesimSuruyor = null; }
  }

  /** Kaynakta taşımayı tamamlar: KAYIT (makine = hedef, nöbet) — sonra durum "taşındı", haber. */
  function tamamla(k, { hedef, nobet, adGorunen, esAd: ad, adres }) {
    B.sahipYaz(k, { makine: hedef, nobet });
    const t = botDurumYaz(k, { asama: 'tasindi', hedef, nobet, zaman: zaman() });
    try { if (B.bekleyenCikar) B.bekleyenCikar(k); } catch { /* işaret yalnız Başlat'ı kapatır; nöbet zaten kapatıyor */ }
    log('SUCCESS', `🚚 ${adGorunen || k} artık ${ad || hedef} makinesinde (nöbet ${nobet}) — buradaki kopya salt okunur; bu bilgisayarda başlamaz`);
    bildir(`${adGorunen || k} artık ${ad || hedef} makinesinde`, [
      `Bot ${o.ben().ad} bilgisayarından ${ad || hedef} bilgisayarına taşındı (nöbet ${nobet}).`,
      `Orada önce Mutabakat (borsayla karşılaştırma), temizse Başlat: ${adres ? `${adres}/#/botlar/${k}` : `#/botlar/${k}`}`,
      'Eski bilgisayardaki kopya artık başlamaz; geri getirmek için yeni makineden bu bilgisayara taşıyın.'
    ], 'bilgi');
    return t;
  }

  /**
   * Belirsiz taşımayı çözer (kaynak): hedefin özeti → yeni nöbet orada mı? ("Yeniden denetle" ucu, açılış, taşıma yanıtı alınamayınca)
   * @returns { asama: 'tasindi' | 'basarisiz' | 'tasiniyor', metin }
   */
  async function cozumle(k, { neden } = {}) {
    const t = botDurum(k);
    if (!t || t.asama !== 'tasiniyor') return { asama: t ? t.asama : null, metin: 'bu bot için süren taşıma yok' };
    const es = o.eslesme.es(t.hedef);
    const b = B.bilgi(k);
    const ad = es ? es.ad : t.hedef;
    if (b && b.makine === t.hedef && (Number(b.nobet) || 0) >= t.nobet) {
      // kayıt zaten yazılmış (kaynak tamamlamanın ortasında düştü) — yalnız durum kapanır
      botDurumYaz(k, { asama: 'tasindi', hedef: t.hedef, nobet: t.nobet, zaman: zaman() });
      return { asama: 'tasindi', metin: `${ad}: taşıma tamamlanmış (kayıt yazılmıştı)` };
    }
    if (!es) {
      botDurumYaz(k, { ...t, belirsiz: true, sonDenetim: zaman(), neden: 'hedef makinenin eşlemesi kaldırılmış' });
      return { asama: 'tasiniyor', metin: `Hedef makinenin (${t.hedef}) eşlemesi kaldırılmış — taşımanın sonucu doğrulanamıyor. Bot iki makinede de başlamaz; yeniden eşleyip "Yeniden denetle"ye basın.` };
    }
    const oz = await esOzeti(es);
    if (!oz.ok) {
      botDurumYaz(k, { ...t, belirsiz: true, sonDenetim: zaman(), neden: neden || oz.hata });
      log('WARN', `🚚 ${k}: taşımanın sonucu doğrulanamadı (${oz.hata}) — bot iki makinede de başlamaz; hedefe ulaşılınca yeniden sorulacak`);
      return { asama: 'tasiniyor', metin: `${ad} makinesine ulaşılamadı (${oz.hata}) — taşımanın sonucu belli değil. Bot iki makinede de başlamaz; ${ad} açılınca "Yeniden denetle"ye basın (açılışta da kendiliğinden sorulur).` };
    }
    const x = nobetLib.esBotu(oz.ozet, k);
    if (x && x.tasima === 'yerlesiyor') {
      botDurumYaz(k, { ...t, belirsiz: true, sonDenetim: zaman() });
      return { asama: 'tasiniyor', metin: `${ad} paketi hâlâ yerleştiriyor — birazdan "Yeniden denetle"ye basın.` };
    }
    if (x && (Number(x.nobet) || 0) >= t.nobet) {
      tamamla(k, { hedef: t.hedef, nobet: t.nobet, adGorunen: b && b.adGorunen, esAd: ad, adres: es.adres });
      return { asama: 'tasindi', metin: `${ad} botu aldı (nöbet ${x.nobet}) — taşıma tamamlandı.` };
    }
    botDurumYaz(k, { asama: 'basarisiz', hedef: t.hedef, nobet: t.oncekiNobet || 0, zaman: zaman(), neden: `hedef paketi almadı${neden ? ` (${neden})` : ''}` });
    log('WARN', `🚚 ${k}: ${ad} paketi almamış — taşıma başarısız; bot bu bilgisayarda kaldı (durmuş; Başlat ile açılır)`);
    return { asama: 'basarisiz', metin: `${ad} paketi almamış — taşıma yapılmadı. Bot bu bilgisayarda kaldı (durmuş); Botlar sayfasından Başlat ile yeniden açabilirsiniz.` };
  }

  /** Açılışta: süren (belirsiz) taşımaları hedefe sor. */
  async function acilisCozumle() {
    const l = Object.entries(durum().botlar).filter(([, v]) => v && v.asama === 'tasiniyor').map(([k]) => k);
    const out = [];
    for (const k of l) { try { out.push({ bot: k, ...(await cozumle(k, { neden: 'açılışta denetlendi' })) }); } catch (e) { out.push({ bot: k, asama: 'tasiniyor', metin: e.message }); } }
    return out;
  }

  /* ── HEDEF ── */

  function hazirlikTemizle() { const t = simdi(); for (const [id, x] of hazirliklar) if (x.bitis < t || x.kullanildi) hazirliklar.delete(id); }

  /** POST /api/makine/tasima/hazirlik (makine kademesi). @returns { durum, govde } */
  function hazirlik(g, kaynakKimlik) {
    const v = protokol.dogrula('tasimaHazirlik', g);
    if (!v.ok) return { durum: 400, govde: { success: false, error: `hazırlık isteği geçersiz: ${v.hatalar.slice(0, 3).join('; ')}` } };
    if (g.kimlik !== kaynakKimlik) return { durum: 403, govde: { success: false, error: 'istekteki kimlik jetonun kimliğiyle aynı değil' } };
    if (protokol.uyum(g.protokol) !== 'tam') return { durum: 409, govde: { success: false, error: `makine protokolü farklı (${g.surum}) — iki makineyi aynı sürüme güncelleyin` } };
    if (o.rol() !== 'sunucu') return { durum: 409, govde: { success: false, kod: 'gelistirme', error: 'bu bilgisayar geliştirme / araştırma kopyası — bot alamaz' } };
    if (o.kararPenceresi && o.kararPenceresi()) return { durum: 409, govde: { success: false, error: 'günlük karar penceresi (UTC 23:50–01:30) sürüyor — taşıma bu sırada yapılmaz' } };
    if (yerlesimSuruyor) return { durum: 409, govde: { success: false, error: 'bu bilgisayarda başka bir taşıma sürüyor' } };
    if (!Number.isInteger(g.bot.nobet) || g.bot.nobet < 0) return { durum: 400, govde: { success: false, error: 'nöbet geçersiz' } };
    if (g.boyut > PAKET_TAVAN) return { durum: 413, govde: { success: false, error: 'bot verisi taşıma sınırını aşıyor' } };
    if (g.gizli && !o.yedekSifre()) return { durum: 409, govde: { success: false, kod: 'yedek-sifre-yok', error: 'bu bilgisayarda yedek şifresi yok — demo hesabının anahtarı yedek şifresiyle gelir; bu bilgisayarda Ayarlar › Yedek & taşıma\'dan AYNI yedek şifresini girin' } };
    const red = nobetLib.tasinabilirMi({ kimlik: g.bot.kimlik, motor: 'bindirme', mod: g.bot.mod, demoDizinDolu: false }, simdi());
    if (red) return { durum: 409, govde: { success: false, kod: red.kod, error: red.metin } };
    const mevcut = B.bilgi(g.bot.kimlik);
    const hn = Number(mevcut && mevcut.nobet) || 0;
    if (hn >= g.bot.nobet + 1 && mevcut && mevcut.makine && mevcut.makine !== kaynakKimlik) {
      // bu bilgisayar o botun kaynaktakinden yeni bir nöbetini biliyor ve sahibi kaynak değil — eski kopya taşınmasın
      return { durum: 409, govde: { success: false, kod: 'nobet', error: `bu bilgisayar bu botun daha yeni nöbetini biliyor (${hn} > ${g.bot.nobet}) — kaynaktaki kopya eski olabilir` } };
    }
    const d = B.hedefDenetle({ kimlik: g.bot.kimlik, mod: g.bot.mod, strateji: g.bot.strateji, hesap: g.bot.hesap, kaynak: kaynakKimlik });
    if (d) return { durum: 409, govde: { success: false, kod: 'hedef', error: d } };
    hazirlikTemizle();
    const id = crypto.randomBytes(16).toString('hex');
    const bitis = simdi() + HAZIRLIK_MS;
    hazirliklar.set(id, { kaynak: kaynakKimlik, bot: g.bot.kimlik, mod: g.bot.mod, nobetKaynak: g.bot.nobet, nobetHedef: hn, gizli: !!g.gizli, bitis, kullanildi: false });
    log('INFO', `🚚 ${esAd(kaynakKimlik)} "${g.bot.adGorunen || g.bot.kimlik}" botunu bu bilgisayara taşımak istiyor — ön denetim geçti (10 dk geçerli)`);
    return { durum: 200, govde: { success: true, protokol: protokol.MAKINE_PROTOKOL, surum: o.surum(), kimlik: o.ben().kimlik, hazirlik: id, nobet: hn, bitis: new Date(bitis).toISOString() } };
  }

  /** POST /api/makine/tasima/al (makine kademesi, application/octet-stream). @returns Promise<{ durum, govde }> */
  async function al(buf, basliklar, kaynakKimlik) {
    const id = String(basliklar['x-pusula-tasima-hazirlik'] || '');
    const shaBas = String(basliklar['x-pusula-tasima-sha256'] || '');
    hazirlikTemizle();
    const hz = hazirliklar.get(id);
    if (!hz || hz.kaynak !== kaynakKimlik) return { durum: 409, govde: { success: false, kod: 'hazirlik', error: 'hazırlık kimliği geçersiz ya da süresi doldu (10 dk) — taşımayı yeniden başlatın' } };
    hz.kullanildi = true;   // tek kullanımlık (hata olsa da)
    if (yerlesimSuruyor) return { durum: 409, govde: { success: false, error: 'bu bilgisayarda başka bir taşıma sürüyor' } };
    const k = hz.bot;
    yerlesimSuruyor = k;
    const oncekiDurum = botDurum(k);
    botDurumYaz(k, { asama: 'yerlesiyor', kaynak: kaynakKimlik, nobet: null, zaman: zaman(), onceki: oncekiDurum });
    // Zaman damgası + rastgele ek: aynı saniyede iki deneme aynı geçici / onceki klasörü paylaşmasın (günlük ezilmesin)
    const d = `${damga(simdi())}-${crypto.randomBytes(3).toString('hex')}`;
    const gecici = path.join(klasor, `bot-${k}-${d}`);
    const gunlukDosya = path.join(gecici, GUNLUK_AD);
    let gunluk = null;
    let saglikGelen = null;
    const geriAl = (neden, durumKodu, kod) => {
      if (gunluk) {
        gunlukGeriAl(gunluk, { kayitGeriYukle: (bk, eski) => B.kayitGeriYukle(bk, eski), sirGeriAl: (e) => B.sirGeriAl(e) }, log);
        try { jsonYaz(gunlukDosya, { ...gunluk, durum: 'geri-alindi', neden }); } catch { /* */ }
        try { B.yenidenKur(k, { geriAlma: true }); } catch (e) { log('ERROR', `🚚 ${k}: geri almadan sonra bot yeniden kurulamadı: ${e.message}`); }
      }
      botDurumYaz(k, oncekiDurum);
      try { for (const a of fs.readdirSync(gecici)) if (a === 'veri' || a === 'kayit.json' || a === 'gizli.enc') fs.rmSync(path.join(gecici, a), { recursive: true, force: true }); } catch { /* */ }
      if (!gunluk) { try { fs.rmSync(gecici, { recursive: true, force: true }); } catch { /* */ } }
      log('WARN', `🚚 ${esAd(kaynakKimlik)} → bu bilgisayar: "${k}" taşıması reddedildi/geri alındı — ${neden}`);
      return { durum: durumKodu || 409, govde: { success: false, kod: kod || 'red', error: neden } };
    };
    try {
      if (!Buffer.isBuffer(buf) || !buf.length) return geriAl('paket boş', 400, 'paket');
      if (buf.length > PAKET_TAVAN) return geriAl('paket taşıma sınırını aşıyor', 413, 'buyuk');
      if (!/^[0-9a-f]{64}$/.test(shaBas) || sha256(buf) !== shaBas) return geriAl('paketin SHA-256 özeti tutmuyor (aktarım yarıda kalmış ya da bozulmuş)', 400, 'sha');
      let ac;
      try { ac = await paketAc(buf, gecici); } catch (e) { return geriAl(e.message, e.durum || 400, e.kod || 'paket'); }
      const { bildiri, kayit, gizli } = ac;
      if (bildiri.bot !== k || !bildiri.kaynak || bildiri.kaynak.kimlik !== kaynakKimlik || bildiri.hedef !== o.ben().kimlik) return geriAl('paket bu hazırlığa ait değil (bot / kaynak / hedef farklı)', 409, 'paket');
      const nb = bildiri.nobet;
      if (!Number.isInteger(nb) || nb !== Math.max(hz.nobetKaynak, hz.nobetHedef) + 1) return geriAl(`paketteki nöbet (${nb}) beklenenden farklı`, 409, 'nobet');
      if (!kayit || kayit.kimlik !== k || kayit.makine !== o.ben().kimlik || kayit.nobet !== nb || kayit.mod !== hz.mod) return geriAl('paketteki bot kaydı tutarsız (kimlik / makine / nöbet / mod)', 409, 'kayit');
      const kv = B.kayitDogrula(kayit);
      if (kv) return geriAl(`paketteki bot kaydı geçersiz: ${kv}`, 409, 'kayit');
      for (const ad of bildiri.dizinler || []) if (!DIZIN_RE.test(ad) || !(ad === k || ad === `${k}-demo` || ad === `${k}-canli`)) return geriAl(`pakette bu bota ait olmayan dizin: ${ad}`, 409, 'paket');
      const mevcut = B.bilgi(k);
      if ((Number(mevcut && mevcut.nobet) || 0) >= nb) return geriAl(`bu bilgisayardaki nöbet (${mevcut.nobet}) paketteki kadar ya da daha yeni — eski paket`, 409, 'nobet');
      const dn = B.hedefDenetle({ kimlik: k, mod: kayit.mod, strateji: kayit.strateji, hesap: kayit.hesap && kayit.hesap.demo, kaynak: kaynakKimlik });
      if (dn) return geriAl(dn, 409, 'hedef');
      let sirAcik = null;
      if (gizli) {
        const sifre = o.yedekSifre();
        if (!sifre) return geriAl('bu bilgisayarda yedek şifresi yok — AYNI yedek şifresini girip taşımayı yeniden başlatın', 409, 'yedek-sifre-yok');
        try { sirAcik = JSON.parse(P.coz(gizli, sifre, bildiri.gizli).toString('utf8')); } catch (e) { return geriAl('gizli kısım bu bilgisayarın yedek şifresiyle çözülemedi — iki bilgisayarda yedek şifresi aynı olmalı (Ayarlar › Yedek & taşıma)', 409, 'sifre-farkli'); }
        const sd = B.sirDenetle(k, sirAcik, kayit);
        if (sd) { sirAcik = null; return geriAl(sd, 409, 'sir'); }
        saglikGelen = typeof sirAcik.saglik === 'string' && sirAcik.saglik ? sirAcik.saglik : null;
      } else if (kayit.mod === 'demo') return geriAl('demo botun hesap anahtarı pakette yok', 409, 'sir');
      // YERLEŞTİR — günlükle
      gunluk = { durum: 'basladi', bot: k, kaynak: kaynakKimlik, nobet: nb, zaman: zaman(), gecici, adimlar: [], kayitOnceki: B.dosyaKaydi(k), kayitYazildi: false, sirEklenen: [] };
      jsonYaz(gunlukDosya, gunluk);
      const tk1 = o.testKesinti && o.testKesinti('yerlesim-basi');
      if (tk1) throw Object.assign(hata('test kesintisi (yerleşim başı)', 500), { testOlum: tk1 === 'olum' });
      if (sirAcik && sirAcik.hesap) {
        gunluk.sirEklenen = B.sirYaz(k, sirAcik.hesap) || [];
        jsonYaz(gunlukDosya, gunluk);
      }
      const oncekiKok = o.oncekiYolu(k, d);
      for (const ad of B.dizinlerAdlar(k)) {
        const yer = B.dizinYolu(ad);
        if (fs.existsSync(yer)) {
          const onceki = path.join(oncekiKok, ad);
          fs.mkdirSync(oncekiKok, { recursive: true });
          gunluk.adimlar.push({ tur: 'onceki', yer, onceki });
          jsonYaz(gunlukDosya, gunluk);
          fs.renameSync(yer, onceki);
        }
      }
      for (const ad of bildiri.dizinler || []) {
        const kaynak = path.join(gecici, 'veri', ad);
        const yer = B.dizinYolu(ad);
        gunluk.adimlar.push({ tur: 'yeni', yer });
        jsonYaz(gunlukDosya, gunluk);
        fs.mkdirSync(path.dirname(yer), { recursive: true });
        if (fs.existsSync(kaynak)) fs.renameSync(kaynak, yer); else fs.mkdirSync(yer, { recursive: true });
      }
      const tk2 = o.testKesinti && o.testKesinti('kayit-oncesi');
      if (tk2) throw Object.assign(hata('test kesintisi (kayıt öncesi)', 500), { testOlum: tk2 === 'olum' });
      // KAYIT = tamamlanma noktası
      gunluk.kayitYazildi = true;
      jsonYaz(gunlukDosya, gunluk);
      B.kayitYaz(kayit);
      gunluk.durum = 'kayit';
      jsonYaz(gunlukDosya, gunluk);
    } catch (e) {
      // Yalnız öz test (o.testKesinti 'olum'): süreç burada DÜŞTÜ sayılır — geri alma YAPILMAZ, açılış onarımı (yarimKalanlariGeriAl) sınanır.
      if (e && e.testOlum && o.testKesinti) { yerlesimSuruyor = null; throw e; }
      const r = geriAl(`yerleştirme yarıda kaldı: ${e.message} — yapılanlar geri alındı`, 500, 'yerlesim');
      yerlesimSuruyor = null;
      return { durum: e.durum && e.durum < 500 ? e.durum : 500, govde: r.govde };
    } finally { if (!gunluk || gunluk.durum !== 'kayit') yerlesimSuruyor = null; }
    // ── tamamlandı: buradan sonrası taşımayı geri çevirmez (hata yalnız uyarı)
    const uyarilar = [];
    const nb = gunluk.nobet;
    try { B.bekleyenEkle(k, { kaynak: kaynakKimlik, nobet: nb }); } catch (e) { uyarilar.push(`mutabakat işareti yazılamadı: ${e.message}`); }
    try { B.yenidenKur(k, {}); } catch (e) { uyarilar.push(`bot yeniden kurulamadı (${e.message}) — Pusula'yı yeniden başlatınca yüklenir`); log('ERROR', `🚚 ${k}: taşınan bot kurulamadı: ${e.message}`); }
    try { const u = saglikGelen && B.saglikYaz ? B.saglikYaz(k, saglikGelen) : null; if (u) uyarilar.push(u); } catch (e) { uyarilar.push(`sağlık adresi yazılamadı: ${e.message}`); }
    saglikGelen = null;
    gunluk.durum = 'tamam';
    try { jsonYaz(gunlukDosya, gunluk); } catch { /* */ }
    try { for (const a of fs.readdirSync(gecici)) if (a !== GUNLUK_AD) fs.rmSync(path.join(gecici, a), { recursive: true, force: true }); } catch { /* */ }
    botDurumYaz(k, { asama: 'geldi', kaynak: kaynakKimlik, nobet: nb, zaman: zaman(), mutabakat: 'bekliyor' });
    yerlesimSuruyor = null;
    const ad = esAd(kaynakKimlik);
    const bb = B.bilgi(k) || {};
    log('SUCCESS', `🚚 "${bb.adGorunen || k}" ${ad} makinesinden bu bilgisayara taşındı (nöbet ${nb}) — kendiliğinden başlamaz: önce Mutabakat, temizse Başlat`);
    // 6–7. mutabakat yanıttan sonra (borsayla karşılaştırma); sonucu panel ve Telegram
    setTimeout(() => {
      Promise.resolve().then(() => B.mutabakat(k)).then((m) => {
        const temiz = !!m && !m.engel;
        durumGuncelle(klasor, k, (x) => (x && x.asama === 'geldi' ? { ...x, mutabakat: temiz ? 'temiz' : 'engel', mutabakatNeden: temiz ? null : String(m && m.engel).slice(0, 300), mutabakatZaman: zaman() } : x));
        bildir(`${bb.adGorunen || k} bu makineye taşındı`, [`${ad} bilgisayarından geldi (nöbet ${nb}).`, temiz ? 'Borsayla karşılaştırma TEMİZ — Botlar sayfasında Başlat\'a basabilirsiniz (kendiliğinden başlamaz).' : `Borsayla karşılaştırma TEMİZ DEĞİL: ${String(m && m.engel).slice(0, 200)} — Başlat kapalı; Botlar sayfasındaki fark listesine bakın.`], temiz ? 'bilgi' : 'uyari');
      }).catch((e) => {
        durumGuncelle(klasor, k, (x) => (x && x.asama === 'geldi' ? { ...x, mutabakat: 'elle', mutabakatNeden: String(e.message).slice(0, 300), mutabakatZaman: zaman() } : x));
        log('WARN', `🚚 ${k}: taşıma sonrası mutabakat yapılamadı (${e.message}) — Botlar sayfasından Mutabakat'a basın`);
        bildir(`${bb.adGorunen || k} bu makineye taşındı`, [`${ad} bilgisayarından geldi (nöbet ${nb}).`, `Borsayla karşılaştırma yapılamadı (${String(e.message).slice(0, 160)}) — Botlar sayfasında önce Mutabakat, temizse Başlat.`], 'uyari');
      });
    }, o.mutabakatGecikmeMs == null ? 500 : o.mutabakatGecikmeMs).unref?.();
    return { durum: 200, govde: { success: true, protokol: protokol.MAKINE_PROTOKOL, surum: o.surum(), kimlik: o.ben().kimlik, bot: k, nobet: nb, mutabakat: 'bekliyor', uyarilar: uyarilar.slice(0, 16) } };
  }

  return { liste, tasi, cozumle, acilisCozumle, hazirlik, al, engel, botOzetAlanlari, yerlesenler, botDurum, durum, esOzeti, tamamla, _hazirliklar: hazirliklar };
}

module.exports = { olustur, paketUret, paketAc, icYolGecerli, gunlukGeriAl, yarimKalanlariGeriAl, sirEklenenGeriAl, durumOku, durumGuncelle, yerelEngelOku, dosyalar, icDolu,
  BICIM, BICIM_SURUM, PAKET_TAVAN, HAZIRLIK_MS, AL_ZAMAN_ASIMI_MS, DURUM_AD, GUNLUK_AD, YETENEK, DIZIN_RE };
