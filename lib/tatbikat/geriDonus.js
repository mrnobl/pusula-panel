'use strict';
/**
 * D1 GERİ DÖNÜŞ TATBİKATI (4. faz parça 4c — TASARIM-MAKINE-HESAP-BOT §5.3 d4, §5.6, §5.7 → §11; PLAN-MAKINE-HESAP-BOT §5 d4)
 * ═══════════════════════════════════════════════════════════════════════════
 * Soru: "bu makine bozulsa (ya da öbür makine bozulsa) bot GERÇEKTEN geri getirilebilir mi?" Ayda bir (ayın ilk pazarı 11:00 TR — karar
 * penceresinin dışında; D3 aylık otomatik denetim 11:30'da bu sonucu okur) ve Sistem › Tatbikatlar › "Şimdi çalıştır" ile.
 *
 * KAYNAKLAR (ikisi de SALT OKUNUR):
 *   1. bu makinenin SON GÜNLÜK YEDEĞİ (lib/yedek.js: <hedef>/<AAAA-AA-GG>/yedek-manifest.json) — manifestteki HER dosya var mı, boyut ve
 *      SHA-256 tutuyor mu (yerinde okunur; sır dosyaları da yalnız özetlenir, KOPYALANMAZ);
 *   2. her eşin son EŞ KOPYASI (lib/makine/kopya.js: <veri>/es-kopya/<eş>/kopya) — `kopyaDogrula` (manifestle birebir) + gizli.enc bu
 *      makinenin YEDEK ŞİFRESİYLE çözülebiliyor mu ve devralınabilir her demo botun hesap anahtarı içinde var mı (YALNIZ BELLEKTE; açılan
 *      içerik hemen sıfırlanır, anahtar hiçbir dosyaya, kayda, yanıta yazılmaz — yalnız bot kimlikleri sayılır).
 * KURU GERİ YÜKLEME: kapsamdaki her botun dizini İŞLETİM SİSTEMİNİN GEÇİCİ KLASÖRÜNE (os.tmpdir()/pusula-tatbikat-*) açılır — her dosya
 * açılırken manifestteki SHA-256 ile yeniden doğrulanır; yalnız `live/<bot dizini>/**` açılır (secrets.json, yedek şifresi, makine
 * jetonları, telefon jetonu, acil PIN HİÇ açılmaz). Gerçek bot dizinlerine, yedek klasörüne, eş kopyasına YAZILMAZ.
 * KURU DENEME: her açılan bot için scripts/kuru-deneme.js AYRI SÜREÇTE (lib/kuruDeneme.js ile aynı yol: sırsız ortam `kuruOrtam`, ağ kalkanı
 * `KALKAN_KODU` — yalnız Binance'in herkese açık piyasa verisi, alt süreç yok). Kâğıt botta "karar" (bugünkü karar, emir GÖNDERİLMEDEN),
 * demo botta "yükleme" (hesaba bağlanılmaz). Yerel yedekten açılan bot, aynı botun BUGÜNKÜ dizininin geçici kopyasıyla AYNI kodla
 * karşılaştırılır (`karsilastir` → ayni beklenir; yedek saatler önce alındığı için fark yalnız uyarıdır). Eş kopyasından açılan botta
 * kıyas yok (o makinenin canlı dizini burada değil): bozuk dosya / hata yoksa geçer, ENGEL uyarıdır.
 * KAPSAM: kâğıt ve demo bindirme botları. Canlı hesap (anahtarı kopyada zaten yok), Kairos demo kabulü (2026-12-09 21:00Z'ye kadar —
 * dokunulmaz), başka makineye taşınmış kopya, model örnekleri kapsam dışı ("kapsam dışı" satırı). Geçici klasör sonunda silinir.
 * SONUÇ: <veri>/tatbikat/sonuclar.jsonl (tur 'geri-donus', yalnız eklenir) + <veri>/tatbikat/geri-donus.json (son çalışma özeti — öz
 * denetim `geriDonus` satırı okur) + tek Telegram (tür tatbikat). Yalnız haber: hiçbir botu durdurmaz/başlatmaz, emir yok.
 *
 * Bu modül komut satırı açmaz: alt süreç çağrısı `ops.node` ile DIŞARIDAN verilir (lib/sunucu/geriDonusUclari.js — node + kuru-deneme.js);
 * şifre çözme yalnız lib/paket.js; ağ yok.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const P = require('../paket');
const KL = require('../makine/kopya');
const DV = require('../makine/devralma');
const KD = require('../kuruDeneme');
const botKayit = require('../botKayit');
const { btcAyakSec } = require('../sunucu/botFabrikasi');
const protokol = require('../makine/protokol');

const SAAT = 3600e3, GUN = 864e5, TR = 3 * SAAT;
const KORUMA_BITIS = Date.parse('2026-12-09T21:00:00Z');
/** Ayın ilk pazarı bu dakikadan sonra (TR) — D3 aylık otomatik denetimden (11:30) önce. */
const SAAT_DK = 11 * 60;
/** Yedek bundan eskiyse uyarı (günlük yedek 05:30; bir gün kaçmışsa). */
const YEDEK_ESKI_MS = 36 * SAAT;
/** Eş kopyası bundan eskiyse uyarı (saat başı kopya; öz denetim 2 sa'te sarı). */
const KOPYA_ESKI_MS = 6 * SAAT;
/** Öz denetim: son geri dönüş tatbikatı bundan eskiyse sarı. */
const DENETIM_ESKI_MS = 40 * GUN;
const HATA_TAVAN = 12;
const DURUM_AD = 'geri-donus.json';
const BOT_DIZIN_RE = /^[a-z][a-z0-9]{1,15}(-demo|-canli)?$/;
const GUN_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Yedekten / kopyadan HİÇBİR ZAMAN açılmayan adlar (ikinci kat; zaten yalnız live/<bot dizini>/ açılır). */
const SIR_ADLAR = /^(secrets\.json|telefon-jeton\.json|acil-pin\.json|ev-baglanti\.json|yedek-sifre\.json|makine-jeton.*|gizli\.enc)$/i;

const ayAdi = (simdi) => new Date(simdi + TR).toISOString().slice(0, 7);
const yas = (ms) => (!Number.isFinite(ms) ? '—' : ms < 2 * SAAT ? `${Math.max(0, Math.round(ms / 60e3))} dk` : ms < 2 * GUN ? `${Math.round(ms / SAAT)} sa` : `${Math.round(ms / GUN)} gün`);
const sureMetni = (ms) => (ms < 90e3 ? `${Math.round(ms / 1000)} sn` : `${Math.round(ms / 60e3)} dk`);
const kontrol = (kimlik, ad, durum, metin) => ({ kimlik, ad, durum, metin: String(metin).slice(0, 300) });
const jsonOku = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; } };

/** Saf: geri dönüş tatbikatının zamanı geldi mi? Ayın ilk pazarı ≥ 11:00 TR ve bu ay daha çalışmadı. */
function zamaniGeldi(simdi, sonAy) {
  const d = new Date(simdi + TR);
  if (sonAy === d.toISOString().slice(0, 7)) return false;
  return d.getUTCDay() === 0 && d.getUTCDate() <= 7 && d.getUTCHours() * 60 + d.getUTCMinutes() >= SAAT_DK;
}
/** Saf: bir sonraki çalışma anı (ms) — bu ay çalıştıysa gelecek ayın ilk pazarı. */
function sonrakiZaman(simdi, sonAy) {
  for (let g = 0; g < 70; g++) {
    const d = new Date(simdi + TR + g * GUN);
    if (d.getUTCDay() !== 0 || d.getUTCDate() > 7) continue;
    const z = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.floor(SAAT_DK / 60), SAAT_DK % 60) - TR;
    if (z >= simdi - GUN && ayAdi(z) !== sonAy) return Math.max(z, simdi);
  }
  return null;
}

/** Dosyanın SHA-256'sı — parça parça okunur (büyük dosya belleğe alınmaz). */
function shaDosya(f) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(f, 'r');
  try {
    const buf = Buffer.alloc(1 << 20);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(n === buf.length ? buf : buf.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

/** Son günlük yedek klasörü (<hedef>/<AAAA-AA-GG> + yedek-manifest.json; yarım `.yaziliyor` sayılmaz) → { klasor, gun } | null. */
function sonYedek(hedef) {
  if (!hedef) return null;
  let adlar = [];
  try { adlar = fs.readdirSync(hedef).filter(a => GUN_RE.test(a)).sort().reverse(); } catch { return null; }
  for (const gun of adlar) { const k = path.join(hedef, gun); if (fs.existsSync(path.join(k, 'yedek-manifest.json'))) return { klasor: k, gun }; }
  return null;
}

/**
 * Yedek klasörünü manifestine göre YERİNDE doğrular (hiçbir şey yazılmaz): her dosya var, boyut ve SHA-256 tutuyor; yol klasör dışına
 * çıkmıyor. → { ok, dosya, bayt, hatalar[], manifest }
 */
function yedekDogrula(klasor) {
  const m = jsonOku(path.join(klasor, 'yedek-manifest.json'));
  if (!m || !Array.isArray(m.dosyalar)) return { ok: false, dosya: 0, bayt: 0, hatalar: ['yedek-manifest.json yok ya da bozuk'], manifest: null };
  const kok = path.resolve(klasor);
  const hatalar = [];
  let bayt = 0;
  for (const f of m.dosyalar) {
    if (hatalar.length >= HATA_TAVAN) break;
    const yol = String((f && f.yol) || '');
    const p = path.resolve(kok, ...yol.split('/'));
    if (!yol || !p.startsWith(kok + path.sep)) { hatalar.push(`geçersiz yol: ${yol.slice(0, 80)}`); continue; }
    let st; try { st = fs.statSync(p); } catch { hatalar.push(`eksik: ${yol}`); continue; }
    if (Number.isFinite(f.boyut) && st.size !== f.boyut) { hatalar.push(`boyut tutmuyor: ${yol}`); continue; }
    try { if (shaDosya(p) !== f.sha256) hatalar.push(`SHA-256 tutmuyor: ${yol}`); } catch (e) { hatalar.push(`okunamadı: ${yol} (${e.code || e.message})`); }
    bayt += st.size;
  }
  return { ok: !hatalar.length, dosya: m.dosyalar.length, bayt, hatalar, manifest: m };
}

/**
 * Bir bot dizinini doğrulayarak geçici klasöre açar. `girdiler`: [{ ic: dizin içi göreli yol, kaynak: mutlak yol, boyut, sha256 }].
 * Her dosya bir kez okunur, SHA-256 tutmazsa YAZILMAZ ve hata döner. Sır adlı dosya hiç açılmaz. → { n, bayt, hatalar }
 */
function dogrulayarakAc(girdiler, hedef) {
  const kok = path.resolve(hedef);
  fs.mkdirSync(kok, { recursive: true });
  const hatalar = [];
  let n = 0, bayt = 0;
  for (const g of girdiler) {
    if (hatalar.length >= HATA_TAVAN) break;
    const parcalar = String(g.ic || '').split('/');
    if (parcalar.some(p => !p || p === '..' || p === '.') || SIR_ADLAR.test(parcalar[parcalar.length - 1])) { hatalar.push(`atlandı: ${g.ic}`); continue; }
    const h = path.resolve(kok, ...parcalar);
    if (!h.startsWith(kok + path.sep)) { hatalar.push(`geçersiz yol: ${g.ic}`); continue; }
    let buf; try { buf = fs.readFileSync(g.kaynak); } catch { hatalar.push(`eksik: ${g.ic}`); continue; }
    if ((Number.isFinite(g.boyut) && buf.length !== g.boyut) || crypto.createHash('sha256').update(buf).digest('hex') !== g.sha256) { hatalar.push(`SHA-256 tutmuyor: ${g.ic}`); continue; }
    fs.mkdirSync(path.dirname(h), { recursive: true });
    fs.writeFileSync(h, buf);
    n++; bayt += buf.length;
  }
  return { n, bayt, hatalar };
}

/** Saf: yedek manifestinden bir bot dizininin girdileri (data/live/<dizin>/…). */
function yedekGirdileri(klasor, manifest, dizinAdi) {
  const on = `data/live/${dizinAdi}/`;
  return (manifest.dosyalar || []).filter(f => String(f.yol || '').startsWith(on))
    .map(f => ({ ic: f.yol.slice(on.length), kaynak: path.join(klasor, ...f.yol.split('/')), boyut: f.boyut, sha256: f.sha256 }));
}
/** Saf: eş kopyası manifestinden bir bot dizininin girdileri (live/<dizin>/…). */
function kopyaGirdileri(kopyaKlasor, manifest, dizinAdi) {
  const on = `live/${dizinAdi}/`;
  return Object.entries(manifest.dosyalar || {}).filter(([y]) => y.startsWith(on))
    .map(([y, d]) => ({ ic: y.slice(on.length), kaynak: KL.kopyaDosyaYolu(kopyaKlasor, y), boyut: d.boyut, sha256: d.sha256 }));
}

/**
 * gizli.enc YEDEK ŞİFRESİYLE çözülüyor mu ve içinde hangi botların demo anahtarı var — YALNIZ BELLEKTE. Açılan içerik ve ayrıştırılan
 * nesnedeki anahtar alanları hemen silinir; dönüşte YALNIZ bot kimlikleri (anahtar yok). → { durum: 'var'|'cozulemedi'|'yok', botlar[] }
 */
function gizliDenetle(buf, sifre) {
  if (!buf) return { durum: 'yok', botlar: [] };
  let acik = null;
  try {
    const j = JSON.parse(buf.toString('utf8'));
    if (!j || j.bicim !== KL.GIZLI_BICIM) return { durum: 'cozulemedi', botlar: [] };
    acik = P.coz(Buffer.from(String(j.veri || ''), 'base64'), sifre, j.kripto);
    const ic = JSON.parse(acik.toString('utf8'));
    const botlar = [];
    for (const h of (Array.isArray(ic.hesaplar) ? ic.hesaplar : [])) {
      if (h && typeof h.bot === 'string' && h.apiKey && h.apiSecret) botlar.push(h.bot);
      if (h && typeof h === 'object') { h.apiKey = null; h.apiSecret = null; }
    }
    return { durum: 'var', botlar: [...new Set(botlar)].sort() };
  } catch { return { durum: 'cozulemedi', botlar: [] }; } finally { if (acik) acik.fill(0); }
}

/** Saf: kuru deneme koşucusunun argümanları (lib/kuruDeneme.js ile aynı). */
function kuruArgumanlari({ kalkan, kosucu, kok, dizin, b }) {
  return ['--require', kalkan, kosucu, '--kok', kok, '--dizin', dizin, '--ad', b.ad, '--mod', b.mod, '--btcAyak', b.btcAyak || 'spot',
    '--tavan', String(b.sermayeTavani || 10000), '--k', String(b.k || 15), '--bakiye', String(b.kagitBakiye || 10000), '--kucuk', String(b.kucukSermaye == null ? 'oto' : b.kucukSermaye),
    ...(b.strateji && b.strateji !== b.ad ? ['--strateji', String(b.strateji)] : [])];
}
/** Saf: koşucu çıktısının son JSON satırı. */
function ciktiOku(r) {
  const satir = String((r && r.cikti) || '').trim().split('\n').reverse().find(s => s.trim().startsWith('{'));
  try { return JSON.parse(satir); } catch { return { ok: false, hata: `koşucu çıktısı okunamadı (çıkış ${r ? r.kod : '?'}): ${String((r && r.cikti) || '').trim().slice(-200)}` }; }
}
/** Saf: eş kopyasındaki bot kaydından kuru deneme bilgisi (botFabrikasi ile aynı kurallar). */
function kayittanBilgi(kayit) {
  const a = botKayit.ayar(kayit);
  const mod = kayit.mod;
  return { ad: kayit.kimlik, strateji: kayit.strateji || kayit.kimlik, adGorunen: kayit.adGorunen || kayit.kimlik, mod,
    btcAyak: btcAyakSec(a, mod, kayit.kimlik), sermayeTavani: mod === 'demo' ? a.demoSermayeTavani : a.sermayeTavani, k: a.k, kagitBakiye: a.kagitBakiye, kucukSermaye: a.kucukSermaye };
}
/** Saf: yerel bot kapsamda mı → null | gerekçe. */
function yerelKapsamDisi(b, simdi) {
  if (b.mod === 'canli') return 'canlı hesap — tatbikat kapsamı dışında (anahtarı kopyada da yok)';
  if (b.baskaMakinede) return 'başka makineye taşındı — orada denetlenir';
  if (b.ad === 'hucum' && b.mod === 'demo' && simdi < KORUMA_BITIS) return 'Kairos demo kabulü 2026-12-09\'a kadar sürüyor — tatbikat dokunmaz';
  if (!['kagit', 'demo'].includes(b.mod)) return `bilinmeyen hesap türü (${b.mod || '?'})`;
  return null;
}

/** Saf: yerel yedekten açılan botun kıyası → kontrol. */
function yerelKuruKontrol(k, yedek, kip) {
  const ad = kip === 'karar' ? 'Kuru deneme: bugünkü karar' : 'Kuru deneme: yükleme';
  if (yedek && yedek.ok && yedek.karar && yedek.karar.bozuk) return kontrol('kuru', ad, 'kaldi', `yedekten açılan kayıt bozuk: ${String(yedek.karar.bozuk).slice(0, 160)}`);
  switch (k.durum) {
    case 'ayni': return kontrol('kuru', ad, 'gecti', kip === 'karar' ? 'yedekten kurulan bot bugünkü botla AYNI kararı verdi' : 'yedekten kurulan bot açıldı; kayıtlar bugünkülerle aynı (ENGEL / bozuk dosya yok)');
    case 'fark': return kontrol('kuru', ad, 'uyari', `yedek saatler önce alındı — o arada değişen: ${k.metin}`);
    case 'yeni-hata': return kontrol('kuru', ad, 'kaldi', `yedekten kurulan bot çalışmadı: ${String((yedek && yedek.hata) || k.metin).slice(0, 200)}`);
    case 'ikisi-hata': return kontrol('kuru', ad, 'uyari', `bugünkü bot da aynı hatayı veriyor (geri dönüşten değil): ${k.metin}`);
    case 'eski-hata': return kontrol('kuru', ad, 'uyari', `bugünkü dizinin kopyası çalışmadı ama yedekten kurulan çalıştı: ${k.metin}`);
    default: return kontrol('kuru', ad, 'uyari', k.metin || 'sonuç yok');
  }
}
/** Saf: eş kopyasından açılan botun kuru sonucu → kontrol. */
function esKuruKontrol(r) {
  const kip = (r && r.kip) || null;
  const ad = kip === 'karar' ? 'Kuru deneme: karar' : 'Kuru deneme: yükleme';
  if (!r || !r.ok) return kontrol('kuru', ad, 'kaldi', `kopyadan kurulan bot çalışmadı: ${String((r && r.hata) || 'sonuç yok').slice(0, 200)}`);
  const k = r.karar || {};
  if (k.bozuk) return kontrol('kuru', ad, 'kaldi', `kopyadaki kayıt bozuk: ${String(k.bozuk).slice(0, 160)}`);
  if (k.engel) return kontrol('kuru', ad, 'uyari', `kopyadan kurulan botta ENGEL var: ${String(k.engel).slice(0, 160)}`);
  if (k.mutabakatEngel) return kontrol('kuru', ad, 'uyari', `kâğıt borsa mutabakatı: ${String(k.mutabakatEngel).slice(0, 160)}`);
  if (kip === 'karar') return kontrol('kuru', ad, 'gecti', `kopyadan kurulan bot karar üretti (gün ${k.gun || '—'}, ${k.btcSebep || 'BTC ayağı'}${Array.isArray(k.kolSemboller) ? `, ${k.kolSemboller.length} kol` : ''}) — emir gönderilmedi`);
  return kontrol('kuru', ad, 'gecti', `kopyadan kurulan bot açıldı (son çalışma günü ${k.sonGun || '—'}); hesaba bağlanılmadı`);
}

/** Saf: kayıt → sayılar + hüküm. */
function say(r) {
  const s = { gecti: 0, uyari: 0, kaldi: 0, atlandi: 0, bilgi: 0 };
  for (const k of r.kaynaklar) for (const x of [...k.kontroller, ...k.botlar.flatMap(b => b.kontroller)]) s[x.durum] = (s[x.durum] || 0) + 1;
  if (r.genel) for (const x of r.genel) s[x.durum] = (s[x.durum] || 0) + 1;
  return s;
}

/**
 * Tatbikatı çalıştırır.
 * @param o.kok          program kökü (scripts/kuru-deneme.js buradan; geçici kopyalar aynı kodla koşar)
 * @param o.botlar       bu makinedeki bindirme botları [{ ad, adGorunen, mod, dizin, btcAyak, sermayeTavani, k, kagitBakiye, kucukSermaye, strateji, baskaMakinede }]
 * @param o.yedekHedef   günlük yedek hedef klasörü (yedek-ayar.json hedef) | null
 * @param o.esKopya      <veri>/es-kopya | null · o.esAd(kimlik) → görünen ad · o.ben makine kimliği
 * @param o.yedekSifre   () → yedek şifresi | null (yalnız bellekte kullanılır)
 * @param o.ops          { node(args, { sure, env }) → Promise<{ kod, cikti }> }
 * @param o.tmpKok       geçici klasörün kökü (varsayılan os.tmpdir()) · o.simdi · o.saat () → ms · o.ilerleme(metin)
 */
async function calistir(o = {}) {
  const simdi = o.simdi || Date.now();
  const saat = o.saat || Date.now;
  const bas = saat();
  const ilerleme = o.ilerleme || (() => {});
  if (!o.ops || typeof o.ops.node !== 'function') throw new Error('geri dönüş tatbikatı: kuru deneme koşucusu (ops.node) yok');
  const gecici = fs.mkdtempSync(path.join(o.tmpKok || os.tmpdir(), 'pusula-tatbikat-'));
  const kosucu = path.join(o.kok, 'scripts', 'kuru-deneme.js');
  const env = KD.kuruOrtam(process.env, o.kok);
  const kalkan = path.join(gecici, 'ag-kalkani.js');
  const kaynaklar = [];
  let sira = 0;
  const kos = async (dizin, b) => ciktiOku(await o.ops.node(kuruArgumanlari({ kalkan, kosucu, kok: o.kok, dizin, b }), { sure: 4 * 60000, env }));
  try {
    fs.writeFileSync(kalkan, KD.KALKAN_KODU, 'utf8');

    // ── 1. Bu makinenin son günlük yedeği ──
    const yk = { tur: 'yedek', ad: 'Bu makinenin son günlük yedeği', kontroller: [], botlar: [] };
    kaynaklar.push(yk);
    const sy = sonYedek(o.yedekHedef);
    if (!sy) yk.kontroller.push(kontrol('yedek', 'Günlük yedek bulundu', 'uyari', o.yedekHedef ? 'yedek klasöründe günlük kopya yok — yedek hiç alınmamış ya da disk takılı değil' : 'yedek hedefi kurulmamış (Ayarlar › Yedek ve taşıma)'));
    else {
      ilerleme('yedek doğrulanıyor');
      const v = yedekDogrula(sy.klasor);
      const z = Date.parse((v.manifest && v.manifest.zaman) || '');
      yk.gun = sy.gun;
      yk.zaman = Number.isFinite(z) ? z : null;
      yk.kontroller.push(kontrol('yedek', 'Günlük yedek bulundu', Number.isFinite(z) && simdi - z > YEDEK_ESKI_MS ? 'uyari' : 'gecti', `${sy.gun} kopyası${Number.isFinite(z) ? `, ${yas(simdi - z)} önce` : ''}${Number.isFinite(z) && simdi - z > YEDEK_ESKI_MS ? ' — 36 saatten eski' : ''}`));
      yk.kontroller.push(v.ok ? kontrol('butunluk', 'Bütünlük (SHA-256)', 'gecti', `${v.dosya} dosya, ${(v.bayt / 1e6).toFixed(1).replace('.', ',')} MB — manifestle birebir`)
        : kontrol('butunluk', 'Bütünlük (SHA-256)', 'kaldi', `${v.hatalar.length}${v.hatalar.length >= HATA_TAVAN ? '+' : ''} sorun: ${v.hatalar.slice(0, 4).join(' · ')}`));
      if (v.manifest) {
        for (const b of o.botlar || []) {
          const bs = { ad: b.ad, adGorunen: b.adGorunen || b.ad, mod: b.mod, kontroller: [] };
          yk.botlar.push(bs);
          const red = yerelKapsamDisi(b, simdi);
          if (red) { bs.kapsamDisi = red; continue; }
          const dizinAdi = path.basename(String(b.dizin || ''));
          if (!BOT_DIZIN_RE.test(dizinAdi)) { bs.kontroller.push(kontrol('ac', 'Geçici klasöre açıldı', 'kaldi', 'bot dizini okunamadı')); continue; }
          const girdi = yedekGirdileri(sy.klasor, v.manifest, dizinAdi);
          if (!girdi.length) { bs.kontroller.push(kontrol('ac', 'Geçici klasöre açıldı', 'kaldi', `yedekte bu botun dizini (live/${dizinAdi}) yok`)); continue; }
          const n = ++sira;
          const yedekDiz = path.join(gecici, `y${n}`, dizinAdi);
          const ac = dogrulayarakAc(girdi, yedekDiz);
          if (ac.hatalar.length) { bs.kontroller.push(kontrol('ac', 'Geçici klasöre açıldı', 'kaldi', `${ac.hatalar.length} dosya açılamadı: ${ac.hatalar.slice(0, 3).join(' · ')}`)); continue; }
          bs.kontroller.push(kontrol('ac', 'Geçici klasöre açıldı', 'gecti', `${ac.n} dosya, her biri SHA-256 ile doğrulandı`));
          const bugunDiz = path.join(gecici, `b${n}`, dizinAdi);
          KD.kopyala(b.dizin, bugunDiz);
          ilerleme(`${bs.adGorunen}: yedekten kuru deneme`);
          const yedek = await kos(yedekDiz, b);
          ilerleme(`${bs.adGorunen}: bugünkü dizinle kuru deneme`);
          const bugun = await kos(bugunDiz, b);
          const k = KD.karsilastir(bugun, yedek);
          const kip = (yedek && yedek.kip) || (bugun && bugun.kip) || (b.mod === 'kagit' ? 'karar' : 'yukleme');
          bs.kip = kip;
          bs.kuru = k.durum;
          bs.kontroller.push(yerelKuruKontrol(k, yedek, kip));
        }
      }
    }

    // ── 2. Eş kopyaları ──
    let esler = [];
    try { esler = o.esKopya ? fs.readdirSync(o.esKopya).filter(a => protokol.KIMLIK_RE.test(a) && fs.existsSync(path.join(o.esKopya, a, KL.KOPYA_AD, KL.MANIFEST_AD))).sort() : []; } catch { esler = []; }
    const sifre = (() => { try { return o.yedekSifre ? o.yedekSifre() : null; } catch { return null; } })();
    for (const es of esler) {
      const kk = path.join(o.esKopya, es, KL.KOPYA_AD);
      const ek = { tur: 'es', kimlik: es, ad: `${(o.esAd && o.esAd(es)) || es} makinesinin eş kopyası`, kontroller: [], botlar: [] };
      kaynaklar.push(ek);
      ilerleme(`${es}: kopya doğrulanıyor`);
      const v = KL.kopyaDogrula(kk);
      const z = Date.parse((v.manifest && v.manifest.zaman) || '');
      ek.zaman = Number.isFinite(z) ? z : null;
      ek.kontroller.push(kontrol('kopya', 'Eş kopyası bulundu', !Number.isFinite(z) ? 'uyari' : simdi - z > KOPYA_ESKI_MS ? 'uyari' : 'gecti', Number.isFinite(z) ? `${yas(simdi - z)} önce alındı${simdi - z > KOPYA_ESKI_MS ? ' — 6 saatten eski (eş kapalı olabilir)' : ''}` : 'kopya zamanı okunamadı'));
      ek.kontroller.push(v.ok ? kontrol('butunluk', 'Bütünlük (SHA-256)', 'gecti', `${Object.keys(v.manifest.dosyalar).length} dosya — manifestle birebir`)
        : kontrol('butunluk', 'Bütünlük (SHA-256)', 'kaldi', `${v.hatalar.length} sorun: ${v.hatalar.slice(0, 4).join(' · ')}`));
      if (!v.manifest) continue;
      const kb = DV.kopyaBotlari(kk).botlar.map(x => ({ ...x, red: DV.devralinabilirMi({ kayit: x.kayit, es, ben: o.ben, demoDizinDolu: x.demoDizinDolu, simdi }) }));
      const demolar = kb.filter(x => !x.red && x.kayit && x.kayit.mod === 'demo').map(x => x.kimlik);
      // Şifreli anahtar dosyası: yedek şifresiyle, YALNIZ BELLEKTE
      const gizliYol = path.join(kk, KL.GIZLI_AD);
      let gizliBuf = null; try { gizliBuf = fs.readFileSync(gizliYol); } catch { gizliBuf = null; }
      let gizliBotlar = [], gizliCozuldu = false;
      if (!gizliBuf) ek.kontroller.push(demolar.length ? kontrol('gizli', 'Şifreli anahtar dosyası (gizli.enc)', 'kaldi', `kopyada yok — ${demolar.join(', ')} devralınamazdı`) : kontrol('gizli', 'Şifreli anahtar dosyası (gizli.enc)', 'atlandi', 'kopyada devralınabilir demo bot yok — anahtar gerekmez'));
      else if (!sifre) ek.kontroller.push(kontrol('gizli', 'Şifreli anahtar dosyası (gizli.enc)', demolar.length ? 'kaldi' : 'uyari', 'bu bilgisayarda yedek şifresi yok — çözülemez (Ayarlar › Yedek & taşıma; iki bilgisayarda AYNI şifre)'));
      else {
        const g = gizliDenetle(gizliBuf, sifre);
        gizliBotlar = g.botlar;
        gizliCozuldu = g.durum === 'var';
        if (g.durum !== 'var') ek.kontroller.push(kontrol('gizli', 'Şifreli anahtar dosyası (gizli.enc)', 'kaldi', 'bu bilgisayarın yedek şifresiyle çözülemedi — iki bilgisayarda yedek şifresi aynı olmalı'));
        else {
          const eksik = demolar.filter(k => !g.botlar.includes(k));
          ek.kontroller.push(eksik.length ? kontrol('gizli', 'Şifreli anahtar dosyası (gizli.enc)', 'kaldi', `çözüldü ama ${eksik.join(', ')} için demo hesap anahtarı yok — devralınamazdı`)
            : kontrol('gizli', 'Şifreli anahtar dosyası (gizli.enc)', 'gecti', `yedek şifresiyle çözüldü (yalnız bellekte; diske yazılmadı)${demolar.length ? ` — ${demolar.length} demo botun anahtarı var` : ''}`));
        }
      }
      if (gizliBuf) gizliBuf.fill(0);
      for (const x of kb) {
        const bs = { ad: x.kimlik, adGorunen: (x.kayit && x.kayit.adGorunen) || x.kimlik, mod: x.kayit ? x.kayit.mod : null, kontroller: [] };
        ek.botlar.push(bs);
        if (x.red) { bs.kapsamDisi = x.red.metin; continue; }
        const dizinAdi = x.kayit.mod === 'demo' ? `${x.kimlik}-demo` : x.kimlik;
        const girdi = kopyaGirdileri(kk, v.manifest, dizinAdi);
        if (!girdi.length) { bs.kontroller.push(kontrol('ac', 'Geçici klasöre açıldı', 'kaldi', `kopyada bu botun dizini (live/${dizinAdi}) yok`)); continue; }
        const diz = path.join(gecici, `e${++sira}`, dizinAdi);
        const ac = dogrulayarakAc(girdi, diz);
        if (ac.hatalar.length) { bs.kontroller.push(kontrol('ac', 'Geçici klasöre açıldı', 'kaldi', `${ac.hatalar.length} dosya açılamadı: ${ac.hatalar.slice(0, 3).join(' · ')}`)); continue; }
        bs.kontroller.push(kontrol('ac', 'Geçici klasöre açıldı', 'gecti', `${ac.n} dosya, her biri SHA-256 ile doğrulandı`));
        if (x.kayit.mod === 'demo') bs.kontroller.push(gizliBotlar.includes(x.kimlik) ? kontrol('anahtar', 'Demo hesap anahtarı kopyada', 'gecti', 'var (şifreli; yalnız sayıldı)') : kontrol('anahtar', 'Demo hesap anahtarı kopyada', gizliCozuldu ? 'kaldi' : 'bilgi', gizliCozuldu ? 'yok — devralınamazdı' : 'denetlenemedi (şifreli anahtar dosyası satırına bakın)'));
        ilerleme(`${bs.adGorunen}: kopyadan kuru deneme`);
        let r;
        try { r = await kos(diz, kayittanBilgi(x.kayit)); } catch (e) { r = { ok: false, hata: e.message }; }
        bs.kip = r && r.kip;
        bs.kontroller.push(esKuruKontrol(r));
      }
    }
  } finally {
    try { fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* aşağıda bildirilir */ }
  }
  const geciciSilindi = !fs.existsSync(gecici);
  const genel = [geciciSilindi ? kontrol('gecici', 'Geçici klasör silindi', 'gecti', 'kuru geri yükleme klasörü kaldırıldı')
    : kontrol('gecici', 'Geçici klasör silindi', 'uyari', `silinemedi (Windows dosyayı tutuyor olabilir) — işletim sisteminin geçici klasöründe ${path.basename(gecici)}`)];
  const r = { z: simdi, tur: 'geri-donus', ay: ayAdi(simdi), sureMs: saat() - bas, kaynaklar, genel };
  r.sayilar = say(r);
  r.hukum = r.sayilar.kaldi ? 'geçmedi' : 'geçti';
  r.sure = sureMetni(r.sureMs);
  return r;
}

/** Saf: Telegram metni (tutar ve anahtar yok). */
function telegramMetni(r) {
  const s = r.sayilar;
  const satirlar = [`${s.gecti} geçti · ${s.uyari} uyarı · ${s.kaldi} kaldı · ${s.atlandi} atlandı · süre ${r.sure} (geçici klasörde kuru geri yükleme; emir yok, bot başlatılmadı)`];
  for (const k of r.kaynaklar) {
    const sorun = k.kontroller.filter(x => x.durum === 'kaldi' || x.durum === 'uyari');
    satirlar.push(`• ${k.ad}: ${sorun.length ? sorun.map(x => `${x.ad} — ${x.metin}`).join(' · ') : 'temiz'}`);
    for (const b of k.botlar) {
      if (b.kapsamDisi) continue;
      const bs = b.kontroller.filter(x => x.durum === 'kaldi' || x.durum === 'uyari');
      satirlar.push(`   ${b.adGorunen}: ${bs.length ? bs.map(x => `${x.durum === 'kaldi' ? '✗' : '!'} ${x.metin}`).join(' · ') : 'geri getirilebilir ✓'}`);
    }
  }
  if (!r.kaynaklar.some(k => k.tur === 'es')) satirlar.push('Eş kopyası yok (tek sunucu) — yalnız bu makinenin yedeği sınandı.');
  satirlar.push('Ayrıntı: Pusula › Sistem › Tatbikatlar.');
  return { baslik: `Tatbikat: geri dönüş — ${s.kaldi ? `${s.kaldi} sorun` : s.uyari ? `${s.uyari} uyarı` : 'geri getirilebilir'}`, satirlar: satirlar.map(x => x.slice(0, 400)) };
}

/** Saf: son çalışma özeti (geri-donus.json) — öz denetim ve panel okur. */
function ozetle(r) {
  const sorunlar = [];
  for (const k of r.kaynaklar) {
    for (const x of k.kontroller) if (x.durum === 'kaldi') sorunlar.push(`${k.tur === 'es' ? k.kimlik : 'yedek'}: ${x.ad} — ${x.metin}`);
    for (const b of k.botlar) for (const x of b.kontroller) if (x.durum === 'kaldi') sorunlar.push(`${b.adGorunen}: ${x.metin}`);
  }
  return { sonAy: r.ay, son: r.z, hukum: r.hukum, sayilar: r.sayilar, sure: r.sure, kaynak: r.kaynak || null,
    sorunlar: sorunlar.slice(0, 6).map(s => s.slice(0, 200)), esSayisi: r.kaynaklar.filter(k => k.tur === 'es').length,
    botSayisi: r.kaynaklar.reduce((t, k) => t + k.botlar.filter(b => !b.kapsamDisi).length, 0) };
}

/** Saf: öz denetim `geriDonus` satırı (yalnız haber). @param o son özet (geri-donus.json) | null */
function denetimSonucu(o, simdi = Date.now(), { arastirma = false } = {}) {
  if (arastirma) return { durum: 'tamam', ayrinti: 'geliştirme kopyası — tatbikat sunucuda' };
  if (!o || !Number.isFinite(o.son)) return { durum: 'tamam', ayrinti: `henüz yapılmadı — ilki ayın ilk pazarı 11:00 (Sistem › Tatbikatlar › "Şimdi çalıştır" ile hemen)` };
  const g = simdi - o.son;
  if (o.hukum === 'geçmedi') return { durum: 'uyari', ayrinti: `son geri dönüş tatbikatı (${yas(g)} önce) geçmedi: ${(o.sorunlar || []).slice(0, 2).join(' · ') || 'ayrıntı Sistem › Tatbikatlar'}` };
  if (g > DENETIM_ESKI_MS) return { durum: 'uyari', ayrinti: `son geri dönüş tatbikatı ${yas(g)} önce — aylık tatbikat çalışmadı (Pusula ayın ilk pazarı 11:00'de kapalı mıydı?)` };
  const s = o.sayilar || {};
  return { durum: 'tamam', ayrinti: `son tatbikat ${yas(g)} önce geçti — ${o.botSayisi || 0} bot geri getirilebilir${o.esSayisi ? `, ${o.esSayisi} eş kopyası sınandı` : ''}${s.uyari ? ` (${s.uyari} uyarı)` : ''}` };
}

/** Saf: D3 aylık otomatik denetimin "D1 geri dönüş" satırı (bu ayın son sonucu). */
function otomatikSatiri(o, simdi = Date.now()) {
  const ad = 'D1 geri dönüş';
  if (!o || !Number.isFinite(o.son)) return { kimlik: 'geri-donus', ad, durum: 'uyari', metin: 'geri dönüş tatbikatı henüz hiç çalışmadı (ayın ilk pazarı 11:00; Tatbikatlar › Geri dönüş › "Şimdi çalıştır")' };
  if (o.sonAy !== ayAdi(simdi)) return { kimlik: 'geri-donus', ad, durum: 'uyari', metin: `bu ay çalışmadı — son ${yas(simdi - o.son)} önce (${o.hukum})` };
  const s = o.sayilar || {};
  return { kimlik: 'geri-donus', ad, durum: o.hukum === 'geçmedi' ? 'kaldi' : s.uyari ? 'uyari' : 'gecti',
    metin: o.hukum === 'geçmedi' ? `geçmedi: ${(o.sorunlar || []).slice(0, 2).join(' · ')}` : `${o.botSayisi || 0} bot geçici klasörde geri getirildi${o.esSayisi ? `, ${o.esSayisi} eş kopyası` : ''} — ${s.gecti || 0} geçti · ${s.uyari || 0} uyarı` };
}

module.exports = { calistir, zamaniGeldi, sonrakiZaman, ayAdi, sonYedek, yedekDogrula, dogrulayarakAc, yedekGirdileri, kopyaGirdileri, gizliDenetle, kuruArgumanlari, ciktiOku,
  kayittanBilgi, yerelKapsamDisi, yerelKuruKontrol, esKuruKontrol, telegramMetni, ozetle, denetimSonucu, otomatikSatiri, shaDosya,
  KORUMA_BITIS, SAAT_DK, YEDEK_ESKI_MS, KOPYA_ESKI_MS, DENETIM_ESKI_MS, DURUM_AD, SIR_ADLAR };
