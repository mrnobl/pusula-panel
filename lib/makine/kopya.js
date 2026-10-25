'use strict';
/**
 * SAAT BAŞI KARŞILIKLI KOPYA (4. faz parça 4a — TASARIM-MAKINE-HESAP-BOT §5.1 d3 + B4; PLAN-MAKINE-HESAP-BOT §5; §11 kararları)
 * ═══════════════════════════════════════════════════════════════════════════
 * ÇEKME MODELİ: her SUNUCU makinesi saatte bir (her saatin 20. dakikası, UTC — 00:02 günlük çalışmasından sonra) eşlenmiş her SUNUCU
 * eşinden o eşin bot verisinin kopyasını çeker. Bot çalıştırmayan sunucu da çeker. Geliştirme / araştırma bilgisayarı ÇEKMEZ ve ona
 * kopya VERİLMEZ (§11 karar 8: sır taşınmasın; araştırma kopyası sunucuyu zaten canlı okuyor).
 *
 * KAPSAM (kopyası alınan makinede, `kapsamda`): live/<bot dizini>/** (kimlik, kimlik-demo, kimlik-canli; bot dizini ad kuralı),
 * live/botlar/** (bot kayıtları), live/hesap-islemleri.jsonl, ayarlar.json (SIR ALANLARI BOŞALTILMIŞ hâli — sunucu `donustur`),
 * bildirim-ayar.json. İleriye kayıt, araştırma, önbellek, günlükler, secrets DAHİL DEĞİL. Geçici dosyalar (.tmp/.yaziliyor/.kilit) atlanır.
 *
 * İKİ UÇ (yalnız makine kademesi — lib/guvenlik.js MAKINE_IZINLI; yalnız eşlenmiş SUNUCU eşinin jetonuyla):
 *   GET  /api/makine/kopya/manifest   → { bicim, zaman, dosyalar: { yol: { boyut, sha256, mtimeMs } }, gizli } (protokol.kopyaManifest)
 *   POST /api/makine/kopya/paket      { yollar: [...] } → YALNIZ istenen (değişen) dosyalar: tar.gz (lib/paket.js tarYazici) bütünüyle
 *                                     YEDEK ŞİFRESİYLE şifreli (lib/paket.js sifrele: AES-256-GCM + scrypt); başlıklarda şifre
 *                                     parametreleri (tuz/iv/etiket — şifre DEĞİL) ve şifreli gövdenin SHA-256'sı. Bu uç hiçbir şey YAZMAZ
 *                                     (yalnız "kopyayı kim, ne zaman aldı" kaydı, verilen.json).
 *   Paketin içinde `gizli.enc`: eşin TAŞINABİLİR demo botlarının (lib/makine/nobet.js tasinabilirMi — canlı hesap ve Kairos demo kabulü
 *   HARİÇ) bağlı borsa hesabı + taşınabilir botların sağlık adresleri, AYRICA yedek şifresiyle şifreli. Çeken makinede gizli.enc
 *   ŞİFRELİ KALIR (yalnız GCM doğrulaması yapılır, içerik açılıp saklanmaz) — 4b devralmada açılır. Sırlar düz metin hiçbir yere gitmez.
 *   Yedek şifresi iki makinede AYNI olmalı (taşımayla aynı kural); yoksa kopya ALINMAZ (durum "yedek-sifre-yok").
 *
 * YERLEŞİM (çeken makine): <veri>/es-kopya/<eş kimliği>/kopya/{ manifest.json, veri/<yol>, gizli.enc } + son.json (son deneme) —
 * veri türü MAKİNE (lib/veriTurleri.js 'es-kopya': hiçbir pakete / yedeğe girmez — zaten başka makinenin verisi).
 * BÜTÜNLÜK: değişmeyen dosyalar eski kopyadan SHA-256 doğrulanarak, değişenler paketten (bildirideki SHA-256 ile) yeni bir klasöre
 * (kopya.yeni-*) yazılır; çekme sonunda yeni klasörün HER dosyası manifestle karşılaştırılır; tutarsa klasör bütünüyle yer değiştirir
 * (kopya → kopya.eski-* → sil). Yarıda kalan çekme eski kopyayı BOZMAZ; açılışta / sonraki çekmede yarım klasörler temizlenir.
 * Kopya 2 saatten eskiyse öz denetim `kopya` denetimi (grup sunucu, yalnız haber) sarı yanar.
 *
 * Bu modül bot başlatmaz/durdurmaz, emir vermez, ayar/anahtar YAZMAZ; komut satırı, alt süreç, PowerShell, Görev Zamanlayıcı, ACL
 * kullanmaz; ağ yalnız lib/makine/istemci.js; şifreleme yalnız lib/paket.js.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { Readable } = require('stream');
const P = require('../paket');
const protokol = require('./protokol');
const istemci = require('./istemci');
const nabizLib = require('./nabiz');

const BICIM = 'pusula-es-kopya';
const BICIM_SURUM = 1;
const GIZLI_BICIM = 'pusula-es-kopya-gizli';
const YETENEK = 'es-kopya-1';
const KOPYA_MS = 60 * 60 * 1000;
/** Her saatin bu dakikasında (UTC) çekilir — günlük çalışma 00:02 UTC'de; 00:20 çekmesi onun sonucunu da alır. */
const KOPYA_DAKIKA = 20;
/** Kopya bundan eskiyse öz denetim sarı (TASARIM §5.1). */
const ESKI_MS = 2 * 60 * 60 * 1000;
/** Yeni eşlenen eşin ilk kopyası için bekleme payı (bu süre içinde "ilk kopya bekleniyor" — sarı değil). */
const ILK_PAY_MS = 2 * 60 * 60 * 1000;
const PAKET_TAVAN = 64 * 1024 * 1024;
const DOSYA_TAVAN = 20000;
const MANIFEST_YANIT_TAVAN = 8 * 1024 * 1024;
const ZAMAN_ASIMI_MS = 120 * 1000;
const KOPYA_AD = 'kopya';
const MANIFEST_AD = 'manifest.json';
const SON_AD = 'son.json';
const VERILEN_AD = 'verilen.json';
const GIZLI_AD = 'gizli.enc';
const PARCA_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const BOT_DIZIN_RE = /^[a-z][a-z0-9]{1,15}(-demo|-canli)?$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const GECICI = /\.tmp$|\.yaziliyor(-\d+)?$|\.kilit$/i;
const KOK_DOSYALAR = ['ayarlar.json', 'bildirim-ayar.json'];
const SONUCLAR = ['tamam', 'hata', 'ulasilamadi', 'yedek-sifre-yok', 'es-yedek-sifre-yok', 'sifre-farkli', 'uyumsuz', 'yetenek-yok', 'red', 'buyuk'];

const hata = (mesaj, durum = 400, kod) => Object.assign(new Error(mesaj), { durum, kod });
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const rastgele = () => crypto.randomBytes(6).toString('hex');

function jsonOku(f, yedek = null) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return yedek; } }
function jsonYaz(f, n) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const g = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(g, JSON.stringify(n, null, 1), 'utf8');
  fs.renameSync(g, f);
}
function dosyaYaz(f, buf) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const fd = fs.openSync(f, 'w');
  try { fs.writeSync(fd, buf); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

/* ══ Saf kurallar ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Saf: göreli yol ('/' ayraçlı) kopya kapsamında mı. */
function kapsamda(y) {
  const p = String(y || '').split('/');
  if (!p.length || p.some(x => !PARCA_RE.test(x) || x === '.' || x === '..')) return false;
  if (p.length === 1) return KOK_DOSYALAR.includes(p[0]);
  if (p[0] !== 'live') return false;
  if (p.length === 2) return p[1] === 'hesap-islemleri.jsonl';
  return BOT_DIZIN_RE.test(p[1]);
}
/** Saf: paket / manifest içindeki yol geçerli mi (kapsam ya da gizli.enc). */
const icYolGecerli = (y) => y === GIZLI_AD || kapsamda(y);

/** Saf: eşten gelen manifest haritasını denetler → { ok, hatalar, dosyalar (temiz) }. */
function manifestDogrula(m) {
  const hatalar = [];
  const v = protokol.dogrula('kopyaManifest', m);
  if (!v.ok) return { ok: false, hatalar: v.hatalar, dosyalar: {} };
  const g = Object.entries(m.dosyalar || {});
  if (g.length > DOSYA_TAVAN) return { ok: false, hatalar: [`çok fazla dosya (${g.length})`], dosyalar: {} };
  const dosyalar = {};
  let toplam = 0;
  for (const [y, d] of g) {
    if (!icYolGecerli(y)) { hatalar.push(`kapsam dışı yol: ${String(y).slice(0, 80)}`); continue; }
    if (!d || !Number.isInteger(d.boyut) || d.boyut < 0 || !SHA_RE.test(String(d.sha256 || ''))) { hatalar.push(`bozuk girdi: ${y}`); continue; }
    toplam += d.boyut;
    dosyalar[y] = { boyut: d.boyut, sha256: d.sha256, mtimeMs: Number.isFinite(d.mtimeMs) ? d.mtimeMs : 0 };
  }
  if (toplam > PAKET_TAVAN) hatalar.push(`kopya kapsamı ${Math.round(toplam / 1048576)} MB — sınır ${PAKET_TAVAN / 1048576} MB`);
  if (!!m.gizli !== !!dosyalar[GIZLI_AD]) hatalar.push('gizli işareti dosya listesiyle tutmuyor');
  return { ok: !hatalar.length, hatalar, dosyalar };
}

/** Saf: uzak manifest ↔ yerel kopya manifesti → { iste: [yol] (yeni ya da değişmiş), ayni: [yol], sil: [yol] (eşte artık yok) }. */
function fark(uzak, yerel) {
  const iste = [], ayni = [], sil = [];
  const y = yerel || {};
  for (const [k, d] of Object.entries(uzak || {})) (y[k] && y[k].sha256 === d.sha256 && y[k].boyut === d.boyut ? ayni : iste).push(k);
  for (const k of Object.keys(y)) if (!(uzak || {})[k]) sil.push(k);
  return { iste: iste.sort(), ayni: ayni.sort(), sil: sil.sort() };
}

const dkMetin = (ms) => { const dk = Math.max(0, Math.round(ms / 60000)); return dk < 60 ? `${dk} dk` : dk < 48 * 60 ? `${Math.round(dk / 6) / 10} sa`.replace('.', ',') : `${Math.round(dk / 1440)} gün`; };

/** Saf: son.json sonucunun insan metni. */
function sonucMetni(s) {
  if (!s || !s.sonuc) return 'henüz denenmedi';
  const ek = s.hata ? `: ${s.hata}` : '';
  switch (s.sonuc) {
    case 'tamam': return 'tamam';
    case 'ulasilamadi': return `eşe ulaşılamadı${ek}`;
    case 'yedek-sifre-yok': return 'bu bilgisayarda yedek şifresi yok — kopya şifreli alınır (Ayarlar › Yedek & taşıma; iki bilgisayarda AYNI şifre)';
    case 'es-yedek-sifre-yok': return 'eşte yedek şifresi yok — o bilgisayarda Ayarlar › Yedek & taşıma\'dan AYNI yedek şifresini girin';
    case 'sifre-farkli': return 'iki bilgisayarın yedek şifresi farklı — kopya çözülemedi (Ayarlar › Yedek & taşıma\'da ikisini aynı yapın)';
    case 'uyumsuz': return `eş başka bir makine protokolünde — iki makineyi aynı sürüme güncelleyin${ek}`;
    case 'yetenek-yok': return 'eşin sürümü kopyayı bilmiyor — eşi bu sürüme güncelleyin';
    case 'red': return `eş kopya vermedi${ek}`;
    case 'buyuk': return `kopya sınırı aşıldı${ek}`;
    default: return `başarısız${ek}`;
  }
}

/**
 * Saf: öz denetim `kopya` satırı (TASARIM §5.1: kopya 2 saatten eskiyse uyarı; yalnız haber).
 * @param v { rol, etkin, esler: [{ kimlik, ad, eklendi, son: son.json | null }] }
 */
function denetimSonucu(v, simdi = Date.now()) {
  if (!v) return { durum: 'bilinmiyor', ayrinti: 'kopya durumu okunamadı' };
  if (v.rol !== 'sunucu') return { durum: 'tamam', ayrinti: 'geliştirme / araştırma kopyası — kopya çekmez (sır taşınmasın)' };
  const esler = v.esler || [];
  if (!esler.length) return { durum: 'tamam', ayrinti: 'eşlenmiş sunucu yok — kopya gerekmez' };
  if (v.etkin === false) return { durum: 'uyari', ayrinti: 'saat başı kopya kapalı (MAKINE_KOPYA=0) — eşlenmiş sunucuların kopyası alınmıyor' };
  const kotu = [], iyi = [];
  for (const e of esler) {
    const s = e.son || {};
    const b = Date.parse(s.basari || '');
    const yas = Number.isFinite(b) ? simdi - b : null;
    if (yas !== null && yas <= ESKI_MS) { iyi.push(`${e.ad}: ${dkMetin(yas)} önce (${s.dosya != null ? s.dosya : '?'} dosya)${s.sonuc && s.sonuc !== 'tamam' ? ` — son deneme: ${sonucMetni(s)}` : ''}`); continue; }
    const ek = Date.parse(e.eklendi || '');
    if (yas === null && Number.isFinite(ek) && simdi - ek < ILK_PAY_MS && (!s.sonuc || s.sonuc === 'tamam' || s.sonuc === 'ulasilamadi')) { iyi.push(`${e.ad}: ilk kopya bekleniyor`); continue; }
    kotu.push(`${e.ad}: ${yas === null ? 'hiç kopya alınamadı' : `son kopya ${dkMetin(yas)} önce`}${s.sonuc && s.sonuc !== 'tamam' ? ` — ${sonucMetni(s)}` : ''}`);
  }
  if (kotu.length) return { durum: 'uyari', ayrinti: [...kotu, ...iyi].join(' · ') };
  return { durum: 'tamam', ayrinti: iyi.join(' · ') };
}

/** Sır alanı adları (ayarlar.json ikinci kat temizliği; dosya zaten sırsız yazılır — lib/sunucu/ayarDeposu saveConfig). */
const SIR_ADI = /^(apiKey|apiSecret|testnetApiKey|testnetApiSecret|botToken|healthchecks\w*Url|\w*[Ss]ecret|\w*[Tt]oken|sifre|pin)$/;
/** Saf: ayarlar.json gövdesinde sır alanları (SECRET_KEYS + ad kalıbı: telegram.botToken, bot sağlık adresleri …) boşaltılır. */
function ayarSirsiz(buf, sirAnahtarlari = []) {
  let j;
  try { j = JSON.parse(buf.toString('utf8').replace(/^﻿/, '')); } catch { return Buffer.from('{"_kopya":"ayarlar.json okunamadı — kopyaya konmadı"}\n', 'utf8'); }
  const ad = new Set(sirAnahtarlari || []);
  const temizle = (x, d) => {
    if (!x || typeof x !== 'object' || d > 8) return x;
    if (Array.isArray(x)) return x.map(v => temizle(v, d + 1));
    const o = {};
    for (const [k, v] of Object.entries(x)) o[k] = (ad.has(k) || SIR_ADI.test(k)) && v !== '' && v != null ? '' : temizle(v, d + 1);
    return o;
  };
  return Buffer.from(`${JSON.stringify(temizle(j, 0), null, 2)}\n`, 'utf8');
}

/**
 * Saf: kopyaya girecek sırlar — YALNIZ bu makinenin TAŞINABİLİR botları (lib/makine/nobet.js tasinabilirMi: canlı hesap, Kairos demo kabulü,
 * model örneği HARİÇ): demo botun bağlı hesabı + botun sağlık adresi. Başka makineye taşınmış bot (kayıt makine ≠ ben) dahil değil.
 * @param botlar [{ kimlik, motor, mod, makine, demoDizinDolu }] · @param sirlar (k, mod) → { hesap, saglik } · @param ben makine kimliği
 */
function sirlarSec({ botlar, sirlar, ben, simdi = Date.now() }) {
  const nobetLib = require('./nobet');
  const hesaplar = [], saglik = {};
  for (const b of botlar || []) {
    if (!b || b.motor !== 'bindirme' || (b.makine && b.makine !== ben)) continue;
    if (nobetLib.tasinabilirMi(b, simdi)) continue;
    const s = sirlar(b.kimlik, b.mod) || {};
    if (b.mod === 'demo' && s.hesap && s.hesap.apiKey && s.hesap.apiSecret) hesaplar.push({ bot: b.kimlik, ...s.hesap });
    if (s.saglik) saglik[b.kimlik] = s.saglik;
  }
  return { hesaplar, saglik };
}

/** Saf: bir sonraki çekme anı (her saatin KOPYA_DAKIKA'sı, UTC). */
function sonrakiCekme(simdi = Date.now()) {
  const d = new Date(simdi);
  d.setUTCMinutes(KOPYA_DAKIKA, 0, 0);
  let t = d.getTime();
  if (t <= simdi) t += KOPYA_MS;
  return t;
}

/* ══ Kopyası alınan makine (kaynak) ═════════════════════════════════════════════════════════════════════════════ */

/**
 * @param o.kaynakYol  (parca) → mutlak yol (yollar.veri) — 'live', 'ayarlar.json', 'bildirim-ayar.json'
 * @param o.donustur   (yol, buf) → buf (ayarlar.json sır alanları boşaltılır; yoksa olduğu gibi)
 * @param o.gizliFn    () → { hesaplar: [...], saglik: { bot: url } } | null — YALNIZ taşınabilir botların sırları
 * @param o.yedekSifre () → yedek şifresi | null
 * @param o.ben, o.surum, o.simdi, o.log, o.kayitKlasor (verilen.json için — <veri>/es-kopya)
 */
function kaynakOlustur(o) {
  const simdi = o.simdi || Date.now;
  const log = o.log || (() => {});
  const donustur = o.donustur || ((y, b) => b);
  const onbellek = new Map();   // tam yol → { boyut, mtimeMs, cikis: { boyut, sha256 } }
  let gizliOnbellek = null;     // { anahtar, buf, sha } — yalnız bellekte; yedek şifresi ya da sırlar değişince yeniden üretilir

  /** Kapsamdaki dosyalar [{ yol, tam }] (bağ izlenmez, geçici dosya atlanır, ad kuralına uymayan atlanır). */
  function listele() {
    const out = [];
    for (const ad of KOK_DOSYALAR) {
      const tam = o.kaynakYol(ad);
      try { if (fs.lstatSync(tam).isFile()) out.push({ yol: ad, tam }); } catch { /* yok */ }
    }
    const gez = (d, g) => {
      let st; try { st = fs.lstatSync(d); } catch { return; }
      if (st.isSymbolicLink()) return;
      if (st.isDirectory()) { for (const a of fs.readdirSync(d).sort()) gez(path.join(d, a), `${g}/${a}`); return; }
      if (!st.isFile() || GECICI.test(d) || !kapsamda(g)) return;
      out.push({ yol: g, tam: d });
    };
    gez(o.kaynakYol('live'), 'live');
    if (out.length > DOSYA_TAVAN) throw hata(`kopya kapsamında çok fazla dosya (${out.length})`, 413, 'buyuk');
    return out;
  }
  function icerik(f) { return donustur(f.yol, fs.readFileSync(f.tam)); }

  function gizliHazirla() {
    let acik = null;
    try { acik = o.gizliFn ? o.gizliFn() : null; } catch (e) { log('WARN', `🗂 Kopya: sır listesi okunamadı (${e.message}) — kopya sırsız gidiyor`); acik = null; }
    if (!acik || ((!acik.hesaplar || !acik.hesaplar.length) && !Object.keys(acik.saglik || {}).length)) { gizliOnbellek = null; return null; }
    const sifre = o.yedekSifre();
    if (!sifre) throw hata('bu bilgisayarda yedek şifresi yok — kopya yedek şifresiyle şifreli verilir', 409, 'yedek-sifre-yok');
    const j = JSON.stringify(acik);
    const anahtar = sha256(`${sifre}\u0000${j}`);
    if (gizliOnbellek && gizliOnbellek.anahtar === anahtar) return gizliOnbellek;
    const e = P.sifrele(Buffer.from(j, 'utf8'), sifre);
    const buf = Buffer.from(JSON.stringify({ bicim: GIZLI_BICIM, surum: 1, kaynak: o.ben().kimlik, zaman: new Date(simdi()).toISOString(), kripto: e.kripto, veri: e.veri.toString('base64') }), 'utf8');
    gizliOnbellek = { anahtar, buf, sha: sha256(buf) };
    return gizliOnbellek;
  }

  /** Manifest (boyut + değişme zamanı aynıysa SHA önbellekten). */
  function manifest() {
    if (!o.yedekSifre()) throw hata('bu bilgisayarda yedek şifresi yok — kopya yedek şifresiyle şifreli verilir; Ayarlar › Yedek & taşıma\'dan AYNI yedek şifresini girin', 409, 'yedek-sifre-yok');
    const dosyalar = {};
    let toplam = 0;
    const gorulen = new Set();
    for (const f of listele()) {
      let st; try { st = fs.statSync(f.tam); } catch { continue; }
      gorulen.add(f.tam);
      let c = onbellek.get(f.tam);
      if (!c || c.boyut !== st.size || c.mtimeMs !== st.mtimeMs) {
        let buf; try { buf = icerik(f); } catch { continue; }
        c = { boyut: st.size, mtimeMs: st.mtimeMs, cikis: { boyut: buf.length, sha256: sha256(buf) } };
        onbellek.set(f.tam, c);
      }
      dosyalar[f.yol] = { boyut: c.cikis.boyut, sha256: c.cikis.sha256, mtimeMs: c.mtimeMs };
      toplam += c.cikis.boyut;
    }
    for (const k of [...onbellek.keys()]) if (!gorulen.has(k)) onbellek.delete(k);
    const g = gizliHazirla();
    if (g) { dosyalar[GIZLI_AD] = { boyut: g.buf.length, sha256: g.sha, mtimeMs: 0 }; toplam += g.buf.length; }
    return { success: true, protokol: protokol.MAKINE_PROTOKOL, surum: String(o.surum()), kimlik: o.ben().kimlik, bicim: BICIM, zaman: new Date(simdi()).toISOString(),
      dosyaSayisi: Object.keys(dosyalar).length, toplamBayt: toplam, gizli: !!g, dosyalar };
  }

  /** İstenen dosyaların şifreli paketi → { buf, kripto, sha, dosya, bayt }. */
  async function paket(yollar) {
    if (!Array.isArray(yollar) || !yollar.length) throw hata('istenen dosya yok', 400);
    if (yollar.length > DOSYA_TAVAN) throw hata('çok fazla dosya istendi', 413, 'buyuk');
    const istenen = new Set();
    for (const y of yollar) { if (typeof y !== 'string' || !icYolGecerli(y)) throw hata(`kapsam dışı yol istendi: ${String(y).slice(0, 80)}`, 400, 'kapsam'); istenen.add(y); }
    const sifre = o.yedekSifre();
    if (!sifre) throw hata('bu bilgisayarda yedek şifresi yok — kopya yedek şifresiyle şifreli verilir', 409, 'yedek-sifre-yok');
    const varOlan = new Map(listele().map(f => [f.yol, f]));
    const girdiler = [], yok = [];
    let toplam = 0;
    for (const y of [...istenen].sort()) {
      let buf = null, mtimeMs = 0;
      if (y === GIZLI_AD) { const g = gizliHazirla(); buf = g ? g.buf : null; }
      else {
        const f = varOlan.get(y);
        if (f) { try { const st = fs.statSync(f.tam); mtimeMs = st.mtimeMs; buf = icerik(f); } catch { buf = null; } }
      }
      if (!buf) { yok.push(y); continue; }
      toplam += buf.length;
      if (toplam > PAKET_TAVAN) throw hata(`kopya paketi ${PAKET_TAVAN / 1048576} MB sınırını aşıyor`, 413, 'buyuk');
      girdiler.push({ yol: y, buf, mtimeMs });
    }
    const bildiri = { bicim: BICIM, surum: BICIM_SURUM, kaynak: o.ben().kimlik, zaman: new Date(simdi()).toISOString(),
      dosyalar: girdiler.map(g => ({ yol: g.yol, boyut: g.buf.length, sha256: sha256(g.buf), mtimeMs: g.mtimeMs })), yok };
    const gz = zlib.createGzip();
    const parcalar = [];
    gz.on('data', (c) => parcalar.push(c));
    const bitti = new Promise((ok, red) => { gz.on('end', ok); gz.on('error', red); });
    const t = P.tarYazici(gz);
    const bb = Buffer.from(JSON.stringify(bildiri), 'utf8');
    await t.dosya('bildiri.json', bb.length, bb);
    for (const g of girdiler) await t.dosya(`veri/${g.yol}`, g.buf.length, g.buf);
    await t.bitir();
    gz.end();
    await bitti;
    const acik = Buffer.concat(parcalar);
    const e = P.sifrele(acik, sifre);
    acik.fill(0);
    return { buf: e.veri, kripto: e.kripto, sha: sha256(e.veri), dosya: girdiler.length, bayt: toplam };
  }

  /** "Kopyayı kim aldı" kaydı (yalnız zaman ve sayı). */
  function verilenKaydet(kimlik, alan, ek = {}) {
    if (!o.kayitKlasor || !protokol.KIMLIK_RE.test(String(kimlik || ''))) return;
    try {
      const f = path.join(o.kayitKlasor, VERILEN_AD);
      const j = jsonOku(f, {}) || {};
      j[kimlik] = { ...(j[kimlik] || {}), [alan]: new Date(simdi()).toISOString(), ...ek };
      jsonYaz(f, j);
    } catch (e) { log('WARN', `🗂 Kopya kaydı yazılamadı: ${e.message}`); }
  }
  function verilenOku() { return o.kayitKlasor ? (jsonOku(path.join(o.kayitKlasor, VERILEN_AD), {}) || {}) : {}; }

  return { manifest, paket, listele, verilenKaydet, verilenOku };
}

/* ══ Çeken makine ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Bir eşin kopya klasörünü yarım işlerden temizler: kopya.yeni-* silinir; kopya yoksa en yeni kopya.eski-* geri alınır. */
function klasorOnar(esKlasor) {
  let adlar = [];
  try { adlar = fs.readdirSync(esKlasor); } catch { return; }
  for (const a of adlar) if (a.startsWith(`${KOPYA_AD}.yeni-`)) fs.rmSync(path.join(esKlasor, a), { recursive: true, force: true });
  const eskiler = adlar.filter(a => a.startsWith(`${KOPYA_AD}.eski-`)).sort();
  const asil = path.join(esKlasor, KOPYA_AD);
  if (!fs.existsSync(asil) && eskiler.length) { fs.renameSync(path.join(esKlasor, eskiler.pop()), asil); }
  for (const a of eskiler) fs.rmSync(path.join(esKlasor, a), { recursive: true, force: true });
}
const kopyaDosyaYolu = (kopyaKlasor, yol) => (yol === GIZLI_AD ? path.join(kopyaKlasor, GIZLI_AD) : path.join(kopyaKlasor, 'veri', ...yol.split('/')));

/** Kopya klasörünü manifestine göre doğrular (her dosya var ve SHA-256 tutuyor; fazla dosya yok) → { ok, hatalar }. */
function kopyaDogrula(kopyaKlasor) {
  const m = jsonOku(path.join(kopyaKlasor, MANIFEST_AD));
  if (!m || m.bicim !== BICIM || !m.dosyalar || typeof m.dosyalar !== 'object') return { ok: false, hatalar: ['manifest yok ya da bozuk'], manifest: null };
  const hatalar = [];
  for (const [y, d] of Object.entries(m.dosyalar)) {
    if (!icYolGecerli(y)) { hatalar.push(`kapsam dışı: ${y}`); continue; }
    let buf; try { buf = fs.readFileSync(kopyaDosyaYolu(kopyaKlasor, y)); } catch { hatalar.push(`eksik: ${y}`); continue; }
    if (buf.length !== d.boyut || sha256(buf) !== d.sha256) hatalar.push(`tutmuyor: ${y}`);
  }
  const say = { n: 0 };
  const gez = (d) => { for (const a of fs.readdirSync(d, { withFileTypes: true })) { if (a.isDirectory()) gez(path.join(d, a.name)); else say.n++; } };
  try { gez(path.join(kopyaKlasor, 'veri')); } catch { /* veri yok */ }
  const beklenen = Object.keys(m.dosyalar).filter(y => y !== GIZLI_AD).length;
  if (say.n !== beklenen) hatalar.push(`dosya sayısı ${say.n} ≠ manifest ${beklenen}`);
  return { ok: !hatalar.length, hatalar, manifest: m };
}

/** Şifreli gizli.enc yedek şifresiyle doğrulanabiliyor mu (GCM; açılan içerik hemen silinir, saklanmaz) → 'var' | 'cozulemedi'. */
function gizliDogrula(buf, sifre) {
  try {
    const j = JSON.parse(buf.toString('utf8'));
    if (!j || j.bicim !== GIZLI_BICIM) return 'cozulemedi';
    const acik = P.coz(Buffer.from(String(j.veri || ''), 'base64'), sifre, j.kripto);
    JSON.parse(acik.toString('utf8'));
    acik.fill(0);
    return 'var';
  } catch { return 'cozulemedi'; }
}

/**
 * @param o.klasor     <veri>/es-kopya
 * @param o.eslesme    lib/makine/eslesme olustur()
 * @param o.nabiz      lib/makine/nabiz olustur()
 * @param o.ben        () → { kimlik, ad }
 * @param o.rol        () → 'sunucu' | 'gelistirme'
 * @param o.yedekSifre () → yedek şifresi | null
 * @param o.etkin      () → bool (MAKINE_KOPYA=0 → false)
 * @param o.log, o.simdi, o.fetchFn, o.zamanAsimiMs
 */
function cekiciOlustur(o) {
  const simdi = o.simdi || Date.now;
  const log = o.log || (() => {});
  let suruyor = null;
  const esKlasor = (k) => { if (!protokol.KIMLIK_RE.test(String(k))) throw hata('eş kimliği geçersiz'); return path.join(o.klasor, k); };
  const sonOku = (k) => jsonOku(path.join(esKlasor(k), SON_AD));
  const sonYaz = (k, v) => { try { jsonYaz(path.join(esKlasor(k), SON_AD), v); } catch (e) { log('WARN', `🗂 Kopya durumu yazılamadı: ${e.message}`); } };

  /** Eşlenmiş SUNUCU eşleri (geliştirme bilgisayarından kopya çekilmez). */
  function sunucuEsleri() {
    const d = o.nabiz.oku();
    return o.eslesme.liste().makineler.map(m => ({ m, oz: nabizLib.enYeniOzet(d.esler[m.kimlik] || {}) || null })).filter(x => ((x.oz && x.oz.rol) || x.m.rol) === 'sunucu');
  }

  /** Tek eşten kopya çeker → son.json kaydı. */
  async function cek(es, oz) {
    const bas = simdi();
    const onceki = sonOku(es.kimlik) || {};
    const kayit = (sonuc, ek = {}) => {
      const v = { surum: 1, kimlik: es.kimlik, ad: es.ad, deneme: new Date(bas).toISOString(), sonuc, hata: ek.hata || null, sure: simdi() - bas,
        basari: sonuc === 'tamam' ? new Date(simdi()).toISOString() : (onceki.basari || null),
        dosya: sonuc === 'tamam' ? ek.dosya : (onceki.dosya != null ? onceki.dosya : null), bayt: sonuc === 'tamam' ? ek.bayt : (onceki.bayt != null ? onceki.bayt : null),
        aktarilan: sonuc === 'tamam' ? ek.aktarilan : null, aktarilanBayt: sonuc === 'tamam' ? ek.aktarilanBayt : null, silinen: sonuc === 'tamam' ? ek.silinen : null,
        kaynakZaman: sonuc === 'tamam' ? ek.kaynakZaman : (onceki.kaynakZaman || null), kaynakSurum: sonuc === 'tamam' ? ek.kaynakSurum : (onceki.kaynakSurum || null),
        gizli: sonuc === 'tamam' ? ek.gizli : (onceki.gizli || null) };
      sonYaz(es.kimlik, v);
      if (sonuc !== 'tamam') log(sonuc === 'ulasilamadi' ? 'INFO' : 'WARN', `🗂 ${es.ad} kopyası alınamadı: ${sonucMetni(v)}`);
      return v;
    };
    if (!oz || protokol.uyum(oz.protokol) !== 'tam') return kayit('uyumsuz', { hata: oz ? `eş ${oz.surum}` : 'eşin sürümü henüz bilinmiyor (nabız gelmedi)' });
    if (!protokol.yetenekVar(oz, YETENEK)) return kayit('yetenek-yok');
    const sifre = o.yedekSifre();
    if (!sifre) return kayit('yedek-sifre-yok');
    const jeton = o.eslesme.gidenJeton(es.kimlik);
    if (!jeton) return kayit('red', { hata: 'bu eş için jeton yok — yeniden eşleyin' });
    const ben = o.ben().kimlik;
    const zaman = o.zamanAsimiMs || ZAMAN_ASIMI_MS;
    // 1. manifest
    let r;
    try { r = await istemci.istek(es.adres, '/api/makine/kopya/manifest', { ben, jeton, fetchFn: o.fetchFn, zamanAsimiMs: zaman, yanitTavan: MANIFEST_YANIT_TAVAN }); }
    catch (e) { return kayit('ulasilamadi', { hata: e.message }); }
    if (r.durum !== 200) {
      const kod = r.govde && r.govde.kod;
      return kayit(kod === 'yedek-sifre-yok' ? 'es-yedek-sifre-yok' : r.durum === 413 ? 'buyuk' : 'red', { hata: `${r.durum}: ${String((r.govde && r.govde.error) || '').slice(0, 200)}` });
    }
    const mv = manifestDogrula(r.govde);
    if (!mv.ok) return kayit('hata', { hata: `eşin manifesti geçersiz: ${mv.hatalar.slice(0, 3).join('; ')}` });
    if (r.govde.kimlik !== es.kimlik) return kayit('hata', { hata: 'adresteki makine başka bir kimlik bildiriyor — yeniden eşleyin' });
    const uzak = mv.dosyalar;
    // 2. yarım işleri temizle, yerel kopyayla karşılaştır
    const ek = esKlasor(es.kimlik);
    fs.mkdirSync(ek, { recursive: true });
    klasorOnar(ek);
    const asil = path.join(ek, KOPYA_AD);
    const yerelM = jsonOku(path.join(asil, MANIFEST_AD));
    const f = fark(uzak, yerelM && yerelM.bicim === BICIM ? yerelM.dosyalar : null);
    const yeni = path.join(ek, `${KOPYA_AD}.yeni-${rastgele()}`);
    const son = {};
    try {
      // 2a. değişmeyenler eski kopyadan (SHA doğrulanarak); tutmayan yeniden istenir
      const iste = [...f.iste];
      for (const y of f.ayni) {
        let buf = null;
        try { buf = fs.readFileSync(kopyaDosyaYolu(asil, y)); } catch { buf = null; }
        if (!buf || buf.length !== uzak[y].boyut || sha256(buf) !== uzak[y].sha256) { iste.push(y); continue; }
        dosyaYaz(kopyaDosyaYolu(yeni, y), buf);
        son[y] = uzak[y];
      }
      // 2b. değişenler eşten (şifreli paket)
      let aktarilanBayt = 0, aktarilan = 0;
      if (iste.length) {
        let p;
        try { p = await istemci.istek(es.adres, '/api/makine/kopya/paket', { method: 'POST', govde: { yollar: iste }, ben, jeton, fetchFn: o.fetchFn, zamanAsimiMs: zaman, ikili: true, yanitTavan: PAKET_TAVAN + 1024 * 1024 }); }
        catch (e) { throw Object.assign(new Error(e.message), { sonuc: 'ulasilamadi' }); }
        if (p.durum !== 200 || !Buffer.isBuffer(p.govde)) {
          const kod = p.govde && p.govde.kod;
          throw Object.assign(new Error(`${p.durum}: ${String((p.govde && p.govde.error) || 'paket gelmedi').slice(0, 200)}`), { sonuc: kod === 'yedek-sifre-yok' ? 'es-yedek-sifre-yok' : p.durum === 413 ? 'buyuk' : 'red' });
        }
        if (sha256(p.govde) !== String(p.basliklar['x-pusula-kopya-sha256'] || '')) throw Object.assign(new Error('paket aktarımda bozuldu (SHA-256 tutmuyor)'), { sonuc: 'hata' });
        let kripto;
        try { kripto = JSON.parse(Buffer.from(String(p.basliklar['x-pusula-kopya-kripto'] || ''), 'base64').toString('utf8')); } catch { kripto = null; }
        if (!kripto) throw Object.assign(new Error('paketin şifre parametreleri eksik'), { sonuc: 'hata' });
        let acik;
        try { acik = P.coz(p.govde, sifre, kripto); } catch { throw Object.assign(new Error('paket bu bilgisayarın yedek şifresiyle çözülemedi'), { sonuc: 'sifre-farkli' }); }
        let tar;
        try { tar = zlib.gunzipSync(acik, { maxOutputLength: PAKET_TAVAN + 4 * 1024 * 1024 }); } catch (e) { throw Object.assign(new Error(`paket açılamadı (${e.message})`), { sonuc: 'hata' }); }
        acik.fill(0);
        let bildiri = null;
        const gelen = new Map();
        const istenen = new Set(iste);
        await P.tarOku(Readable.from([tar]), async ({ ad, boyut }) => {
          if (boyut > PAKET_TAVAN) throw new Error(`paket bozuk: ${ad} çok büyük`);
          const parca = [];
          return { yaz: async (b) => { parca.push(b); }, bitir: async () => {
            const buf = Buffer.concat(parca);
            if (ad === 'bildiri.json') { if (bildiri) throw new Error('paket bozuk: iki bildiri'); bildiri = JSON.parse(buf.toString('utf8')); return; }
            if (!bildiri) throw new Error('paket bozuk: bildiri ilk kayıt değil');
            if (!ad.startsWith('veri/')) throw new Error(`paket bozuk: beklenmeyen kayıt ${ad}`);
            const y = ad.slice(5);
            if (!icYolGecerli(y) || !istenen.has(y) || gelen.has(y)) throw new Error(`paket bozuk: istenmeyen ya da yinelenen dosya ${y}`);
            gelen.set(y, buf);
          } };
        }).catch((e) => { throw Object.assign(new Error(e.message), { sonuc: 'hata' }); });
        tar.fill(0);
        if (!bildiri || bildiri.bicim !== BICIM || bildiri.kaynak !== es.kimlik || !Array.isArray(bildiri.dosyalar)) throw Object.assign(new Error('paket bildirisi geçersiz'), { sonuc: 'hata' });
        const bl = new Map(bildiri.dosyalar.map(d => [d.yol, d]));
        if (bl.size !== gelen.size) throw Object.assign(new Error('paket bildirisi dosyalarla tutmuyor'), { sonuc: 'hata' });
        for (const [y, buf] of gelen) {
          const d = bl.get(y);
          if (!d || d.boyut !== buf.length || sha256(buf) !== d.sha256) throw Object.assign(new Error(`paket bozuk: ${y} SHA-256 tutmuyor`), { sonuc: 'hata' });
          dosyaYaz(kopyaDosyaYolu(yeni, y), buf);
          son[y] = { boyut: buf.length, sha256: d.sha256, mtimeMs: Number.isFinite(d.mtimeMs) ? d.mtimeMs : 0 };
          aktarilan++; aktarilanBayt += buf.length;
        }
        // eşte manifest ile paket arasında silinen dosyalar kopyadan da çıkar; hiç gelmeyen istenen dosya → hata
        const yok = new Set(Array.isArray(bildiri.yok) ? bildiri.yok : []);
        for (const y of iste) if (!gelen.has(y) && !yok.has(y)) throw Object.assign(new Error(`paket eksik: ${y}`), { sonuc: 'hata' });
      }
      // 3. gizli.enc: şifreli kalır, yalnız doğrulanır
      let gizli = 'yok';
      if (son[GIZLI_AD]) gizli = gizliDogrula(fs.readFileSync(kopyaDosyaYolu(yeni, GIZLI_AD)), sifre);
      // 4. manifest + tam doğrulama
      fs.mkdirSync(path.join(yeni, 'veri'), { recursive: true });
      const toplam = Object.values(son).reduce((a, d) => a + d.boyut, 0);
      jsonYaz(path.join(yeni, MANIFEST_AD), { bicim: BICIM, surum: BICIM_SURUM, kaynak: { kimlik: es.kimlik, ad: es.ad, surum: r.govde.surum }, kaynakZaman: r.govde.zaman,
        cekilen: new Date(simdi()).toISOString(), ceken: ben, gizli, dosyaSayisi: Object.keys(son).length, toplamBayt: toplam, dosyalar: son });
      const dg = kopyaDogrula(yeni);
      if (!dg.ok) throw Object.assign(new Error(`kopya doğrulanamadı: ${dg.hatalar.slice(0, 3).join('; ')}`), { sonuc: 'hata' });
      // 5. yer değiştirme (eski kopya ancak yeni tam doğrulandıktan sonra bırakılır)
      const eski = path.join(ek, `${KOPYA_AD}.eski-${Date.now()}-${rastgele()}`);
      const asilVar = fs.existsSync(asil);
      if (asilVar) fs.renameSync(asil, eski);
      try { fs.renameSync(yeni, asil); } catch (e) { if (asilVar) fs.renameSync(eski, asil); throw e; }
      if (asilVar) fs.rmSync(eski, { recursive: true, force: true });
      return kayit('tamam', { dosya: Object.keys(son).length, bayt: toplam, aktarilan, aktarilanBayt, silinen: f.sil.length, kaynakZaman: r.govde.zaman, kaynakSurum: r.govde.surum, gizli });
    } catch (e) {
      try { fs.rmSync(yeni, { recursive: true, force: true }); } catch { /* sonraki çekmede klasorOnar */ }
      return kayit(e.sonuc && SONUCLAR.includes(e.sonuc) ? e.sonuc : 'hata', { hata: e.message });
    }
  }

  /** Bütün SUNUCU eşlerinden sırayla kopya çeker (aynı anda tek tur). */
  async function tur({ neden = 'saatlik' } = {}) {
    if (o.rol() !== 'sunucu') return { atlandi: 'gelistirme', sonuclar: [] };
    if (o.etkin && !o.etkin()) return { atlandi: 'kapali', sonuclar: [] };
    if (suruyor) return { atlandi: 'suruyor', sonuclar: [] };
    const esler = sunucuEsleri();
    if (!esler.length) return { atlandi: 'es-yok', sonuclar: [] };
    suruyor = { bas: simdi(), neden };
    try {
      const sonuclar = [];
      for (const { m, oz } of esler) {
        try { sonuclar.push(await cek(m, oz)); } catch (e) { log('ERROR', `🗂 ${m.ad} kopyası hatası: ${e.message}`); sonuclar.push({ kimlik: m.kimlik, sonuc: 'hata', hata: e.message }); }
      }
      return { sonuclar };
    } finally { suruyor = null; }
  }

  /** Pano / öz denetim için eş başına durum. */
  function durum() {
    const esler = sunucuEsleri().map(({ m }) => {
      let s = null; try { s = sonOku(m.kimlik); } catch { s = null; }
      return { kimlik: m.kimlik, ad: m.ad, eklendi: m.eklendi || null, son: s };
    });
    return { rol: o.rol(), etkin: o.etkin ? !!o.etkin() : true, yedekSifre: !!o.yedekSifre(), suruyor: suruyor ? { bas: new Date(suruyor.bas).toISOString(), neden: suruyor.neden } : null, esler };
  }
  /** Saf olmayan: eşin kopyasının yaşı (dk) | null. */
  function yasDk(kimlik, t = simdi()) {
    let s = null; try { s = sonOku(kimlik); } catch { return null; }
    const b = Date.parse((s && s.basari) || '');
    return Number.isFinite(b) ? Math.max(0, Math.round((t - b) / 60000)) : null;
  }

  return { tur, cek, durum, yasDk, sonOku, denetim: (t = simdi()) => denetimSonucu(durum(), t), sunucuEsleri, esKlasor, suruyor: () => !!suruyor };
}

/**
 * Kaynak + çekici + uç kapısı + pano tek örnekte (lib/sunucu/makineUclari.js ve öz test aynı kurucuyu kullanır).
 * @param o  kaynakOlustur ve cekiciOlustur seçenekleri birlikte: klasor, kaynakYol, donustur, gizliFn, yedekSifre, eslesme, nabiz, ben,
 *           rol, surum, etkin, log, simdi, fetchFn, zamanAsimiMs
 */
function olustur(o) {
  const simdi = o.simdi || Date.now;
  const kaynak = kaynakOlustur({ ...o, kayitKlasor: o.klasor });
  const cekici = cekiciOlustur(o);
  const esRolu = (kimlik) => {
    const es = o.eslesme.es(kimlik);
    if (!es) return null;
    const oz = nabizLib.enYeniOzet(o.nabiz.oku().esler[kimlik] || {}) || {};
    return oz.rol || es.rol || null;
  };
  return {
    kaynak, cekici,
    /** Bu makine bu eşe kopya verir mi → null | { durum, kod, error } (yalnız SUNUCU eşine; geliştirme kopyası kopya vermez). */
    kaynakIzin(kimlik) {
      if (o.rol() !== 'sunucu') return { durum: 409, kod: 'gelistirme', error: 'Bu bilgisayar geliştirme / araştırma kopyası — kopya vermez (botlar sunucuda).' };
      if (esRolu(kimlik) !== 'sunucu') return { durum: 403, kod: 'rol', error: 'Kopya yalnız eşlenmiş SUNUCU makinesine verilir (geliştirme bilgisayarı kopya çekmez).' };
      return null;
    },
    /** Pano (lib/makine/api.js panoVerisi): satır başına yaş + son deneme + eşin bu bilgisayardan son alışı; özet. */
    pano() {
      const d = cekici.durum();
      let verilen = {};
      try { verilen = kaynak.verilenOku(); } catch { verilen = {}; }
      const t = simdi();
      const calisir = d.etkin && d.rol === 'sunucu';
      return {
        yas: (k) => cekici.yasDk(k, t),
        satir: (k) => {
          const s = (d.esler.find(e => e.kimlik === k) || {}).son || null;
          const v = verilen[k] || null;
          if (!s && !v) return null;
          return { sonuc: s ? s.sonuc : null, metin: s ? sonucMetni(s) : null, deneme: s ? s.deneme : null, basari: s ? s.basari : null, dosya: s ? s.dosya : null, bayt: s ? s.bayt : null,
            aktarilan: s ? s.aktarilan : null, gizli: s ? s.gizli : null, kaynakSurum: s ? s.kaynakSurum : null, verilen: v ? { manifest: v.manifest || null, paket: v.paket || null } : null };
        },
        ozet: { etkin: calisir, rol: d.rol, yedekSifre: d.yedekSifre, suruyor: d.suruyor, sonraki: calisir ? new Date(sonrakiCekme(t)).toISOString() : null,
          dakika: KOPYA_DAKIKA, eskiSaat: ESKI_MS / 3600e3, denetim: denetimSonucu(d, t) }
      };
    },
    /**
     * 4b (kullanıcı onaylı): eşlemesi KALDIRILAN makinenin kopyası silinir — <veri>/es-kopya/<kimlik>/ bütünüyle (şifreli gizli.enc dahil)
     * ve "kopyamızı aldı" kaydındaki satırı. → silindi mi. Kimlik biçimi dışı / klasör dışına çıkan yol reddedilir.
     */
    esSil(kimlik) {
      if (!protokol.KIMLIK_RE.test(String(kimlik || ''))) return false;
      const d = path.join(o.klasor, kimlik);
      if (path.dirname(path.resolve(d)) !== path.resolve(o.klasor)) return false;
      let var_ = false;
      try { var_ = fs.existsSync(d); if (var_) fs.rmSync(d, { recursive: true, force: true }); } catch (e) { (o.log || (() => {}))('WARN', `🗂 ${kimlik} kopyası silinemedi: ${e.message}`); return false; }
      try {
        const f = path.join(o.klasor, VERILEN_AD);
        const j = jsonOku(f, null);
        if (j && j[kimlik]) { delete j[kimlik]; jsonYaz(f, j); }
      } catch { /* kayıt satırı kalabilir — zararsız */ }
      return var_;
    },
    /** Açılış onarımı: her eş klasöründe yarım kalmış çekme (kopya.yeni-*) silinir, yer değiştirmede kalan kopya.eski-* geri alınır. */
    acilisOnar() {
      let adlar = [];
      try { adlar = fs.readdirSync(o.klasor); } catch { return 0; }
      let n = 0;
      for (const k of adlar) if (protokol.KIMLIK_RE.test(k)) { klasorOnar(path.join(o.klasor, k)); n++; }
      return n;
    }
  };
}

module.exports = {
  olustur, kaynakOlustur, cekiciOlustur, ayarSirsiz, sirlarSec, SIR_ADI, kapsamda, icYolGecerli, manifestDogrula, fark, denetimSonucu, sonucMetni, sonrakiCekme, klasorOnar, kopyaDogrula, gizliDogrula, kopyaDosyaYolu,
  BICIM, BICIM_SURUM, GIZLI_BICIM, YETENEK, KOPYA_MS, KOPYA_DAKIKA, ESKI_MS, ILK_PAY_MS, PAKET_TAVAN, DOSYA_TAVAN, MANIFEST_YANIT_TAVAN, KOPYA_AD, MANIFEST_AD, SON_AD, VERILEN_AD, GIZLI_AD, SONUCLAR, KOK_DOSYALAR
};
