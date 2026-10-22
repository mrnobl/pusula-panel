/**
 * VERİ ORKESTRATÖRÜ — tüm veri kaynakları tek kayıt defterinde; bayat olanlar bağımlılık sırasıyla, kendiliğinden tazelenir.
 * Öz test (ağsız, sahte kaynaklarla): node scripts/veri-orkestrator-selftest.js · Elle: npm run veri:guncelle [-- --kaynak ad] [--zorla]
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NEDEN (kullanıcı, 2026-10-07)
 * ═══════════════════════════════════════════════════════════════════════════
 * "Verileri motoru çalıştırınca otomatik çeken bir yapı kuralım; tüm verileri daha sonradan tekrar çalıştırmak için
 * uğraşmayalım." Önceden her kaynağın ayrı betiği / zamanlayıcısı vardı (portföy gece 04:30, ileri izleyici 00:15 UTC,
 * arşiv / TradFi listesi / kol önbelleği elle). Bu modül hepsini TEK yerde toplar; indirme kodu KOPYALANMAZ — her kaynak
 * mevcut fonksiyonu ya da betiği ÇAĞIRIR.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KAYIT DEFTERİ — kaynak tanımı
 * ═══════════════════════════════════════════════════════════════════════════
 *   { ad, kisaAd, grup, aciklama, guncelle(ops) → { degisti?, ayrinti? }, tazelik, bagimliliklar: [ad], hizSiniri (metin),
 *     veriGunu() → 'YYYY-MM-DD' | 'YYYY-MM' | null (eldeki son veri günü), pahaliVeriGunu? (true → kayıttaki değer kullanılır,
 *     en çok 6 saatte bir yeniden ölçülür), tahminiSonBasari()? (durum dosyasında kayıt yokken: dosya zamanı vb.),
 *     beklenenVeriGunu(b)? (aylık kaynakta beklenen veri günü), ekBayat(vg)? → neden | null (vg(ad): başka kaynağın veri günü), enAzAralikMs? (talep tetiğinde
 *     aynı kaynak bu süreden sık denenmez; vars. 15 dk), harici? { durum() } (kendi zamanlamasıyla koşar; yalnız raporlanır),
 *     onbellekDusur()? + izlenenDosya()? (süreç içi önbellek: güncelleme sonrası ve dosya imzası değişince düşürülür) }
 *   sonDurum (durum dosyası, kaynak başına): { sonBasari, sonDeneme, sonDegisim (yeni veri geldiği an), sureMs, hata,
 *     hataZamani, veriGunu, ayrinti }.
 *
 *   TAZELİK KURALI (saat dilimli; sonBeklenen(kural, simdi) → { gun, yayin }):
 *     gunluk   { tz, saat, dakika, gecikmeGun=1 }  veri günü D, D+gecikme günü saat:dakika'da yayımlanır (Binance 1d: 00:30 UTC)
 *     isgunu   { tz, saat, dakika }   veri günü D = Pzt–Cum (tz'de), aynı gün saat:dakika'da yayımlanır (Yahoo ABD 18:00 NY,
 *                                     TEFAS 20:00 İstanbul); hafta sonu yeni veri beklenmez
 *     haftalik { tz, gun (0=Pazar), saat, dakika }   yalnız yayın anı (EVDS mevduat, TradFi listesi)
 *     aylik    { tz, gun, saat, dakika }             ayın 'gun'ü (TÜFE ayın 3'ü, PIT arşivi ayın 2'si)
 *     bagimli  türetilmiş: bir bağımlılığın sonDegisim'i kendi sonBasari'sinden yeniyse (ya da ekBayat) bayat
 *   BAYAT DEĞİL ⇔ (beklenen veri günü varsa ve eldeki ≥ beklenen) VEYA (son başarılı güncelleme ≥ son yayın anı).
 *   İkinci koşul tatil korumasıdır: yayından sonra başarıyla denenip yeni veri gelmediyse (bayram, borsa tatili) bir
 *   sonraki yayına kadar yeniden denenmez.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ÇALIŞTIRMA — calistir({ kaynaklar?, zorla?, neden })
 * ═══════════════════════════════════════════════════════════════════════════
 *   · TEK KİLİT: süreç içinde tek koşu (ikinci istek kuyruğa birleşir, ilki bitince koşar) + süreçler arası kilit dosyası
 *     (data/veri-durum.kilit; sunucu ve `npm run veri:guncelle` aynı anda koşamaz; ölü pid / 6 saatten eski kilit bayat).
 *   · Kapanış: istenen + yukarı bağımlılıklar + aşağıdaki türetilmişler; topolojik sıra (kayıt sırası eşitlik bozucu).
 *   · Her adım: zorla değilse ve bayat değilse ATLANIR ('guncel'); ayrı try/catch (biri düşerse diğerleri sürer); sonuç
 *     ve durum her adımdan sonra data/veri-durum.json'a atomik yazılır.
 *   · Artımlı: her kaynağın kendi indiricisi zaten artımlı (Yahoo son 20 gün, TEFAS eksik aylar, Binance son mumdan,
 *     arşiv eksik aylar). Hız sınırı kaynakta (hizSiniri metni) + talep tetiğinde enAzAralikMs.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TETİKLER
 * ═══════════════════════════════════════════════════════════════════════════
 *   (a) açılış: zamanlayiciBaslat() → ~2 dk sonra bayat olanlar.
 *   (b) gece: yerel 04:30 sonrası günde bir (eski portföy zamanlayıcısının YERİNE — lib/portfoy/api.js artık zamanlayıcı
 *       kurmaz); kaynak hatası varsa 2 saat sonra, günde en çok 3 deneme. VERI_ORKESTRATOR=0 (ya da eski
 *       PORTFOY_GUNCELLEME=0) kapatır.
 *   (c) talep: talep(adlar) EŞZAMANLI döner (simülasyonu BLOKLAMAZ); bayat kaynak arka planda tazelenir, dönen veriNotu
 *       "veri X tarihine kadar; güncelleme sürüyor" sonuca eklenir. kaynaklariBul(kimlikler, birim) portföy kimliğinden
 *       kaynak adına çevirir. Yalnız zamanlayıcı kurulmuşsa (etkin) koşu başlatır.
 *   (d) elle: POST /api/veri/guncelle { kaynak?, zorla? } · npm run veri:guncelle [-- --kaynak ad] [--zorla] [--durum].
 *
 * Uçlar (router): GET /api/veri/durum → { kaynaklar: [satır], calisiyor, aktif, sonKosu, gece, ozet } ·
 * POST /api/veri/guncelle → { baslatildi | kuyrukta }. Araştırma modunda açık (ARASTIRMA_KAPALI deseni /api/veri/'ye uymaz).
 *
 * SINIRLAR: lib/live ve lib/risk'e dokunmaz; canlı botun kendi borsa okumaları değişmez (bu modül yalnız data/market.db
 * araştırma deposuna genel uçlardan yazar). Araştırma girdileri (data/nasdaq, data/gercek-varlik, data/bist — ön-kayıtlı
 * ölçümlerin girdisi) DEĞİŞTİRİLMEZ: Yahoo güncellemeleri data/portfoy/yahoo'ya yazılır (portföy kataloğunda öncelikli).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const { execFile } = require('child_process');

const KOK = path.join(__dirname, '..', '..');
const GUN = 864e5;
const SURUM = 1;
const KILIT_OMUR_MS = 6 * 3600e3;
const PAHALI_TAZELE_MS = 6 * 3600e3;
const pad = n => String(n).padStart(2, '0');

// ═══ 1. TAKVİM VE SAAT DİLİMİ ═════════════════════════════════════════════════
const _bicim = new Map();
function bicimci(tz) {
  if (!_bicim.has(tz)) {
    _bicim.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  }
  return _bicim.get(tz);
}
/** t (ms) → tz'de { y, a, g, s, dk, hg (0 = Pazar) }. */
function yerel(t, tz = 'UTC') {
  const p = {};
  for (const x of bicimci(tz).formatToParts(new Date(t))) p[x.type] = x.value;
  const y = +p.year, a = +p.month, g = +p.day;
  return { y, a, g, s: +p.hour % 24, dk: +p.minute, hg: new Date(Date.UTC(y, a - 1, g)).getUTCDay() };
}
/** tz'deki yerel takvim anı → UTC ms (yaz saati dahil). */
function yereldenUtc(y, a, g, s, dk, tz = 'UTC') {
  const hedef = Date.UTC(y, a - 1, g, s, dk);
  let t = hedef;
  for (let i = 0; i < 3; i++) {
    const p = yerel(t, tz);
    const fark = Date.UTC(p.y, p.a - 1, p.g, p.s, p.dk) - hedef;
    if (!fark) break;
    t -= fark;
  }
  return t;
}
const gunEkle = (y, a, g, k) => { const d = new Date(Date.UTC(y, a - 1, g + k)); return { y: d.getUTCFullYear(), a: d.getUTCMonth() + 1, g: d.getUTCDate(), hg: d.getUTCDay() }; };
const gStr = d => `${d.y}-${pad(d.a)}-${pad(d.g)}`;
const GUN_AD = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/** Kural → en son beklenen veri { gun: 'YYYY-MM-DD' | null, yayin: ms }. */
function sonBeklenen(kural, simdi) {
  const tz = kural.tz || 'UTC', s = kural.saat || 0, dk = kural.dakika || 0;
  const b = yerel(simdi, tz);
  if (kural.tur === 'gunluk') {
    const gec = kural.gecikmeGun == null ? 1 : kural.gecikmeGun;
    for (let k = 0; k <= 2; k++) {
      const d = gunEkle(b.y, b.a, b.g, -k);
      const yayin = yereldenUtc(d.y, d.a, d.g, s, dk, tz);
      if (yayin <= simdi) return { gun: gStr(gunEkle(d.y, d.a, d.g, -gec)), yayin };
    }
  } else if (kural.tur === 'isgunu') {
    for (let k = 0; k <= 10; k++) {
      const d = gunEkle(b.y, b.a, b.g, -k);
      if (d.hg === 0 || d.hg === 6) continue;
      const yayin = yereldenUtc(d.y, d.a, d.g, s, dk, tz);
      if (yayin <= simdi) return { gun: gStr(d), yayin };
    }
  } else if (kural.tur === 'haftalik') {
    for (let k = 0; k <= 8; k++) {
      const d = gunEkle(b.y, b.a, b.g, -k);
      if (d.hg !== kural.gun) continue;
      const yayin = yereldenUtc(d.y, d.a, d.g, s, dk, tz);
      if (yayin <= simdi) return { gun: null, yayin };
    }
  } else if (kural.tur === 'aylik') {
    for (let k = 0; k <= 2; k++) {
      const d = new Date(Date.UTC(b.y, b.a - 1 - k, kural.gun || 1));
      const yayin = yereldenUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), s, dk, tz);
      if (yayin <= simdi) return { gun: null, yayin };
    }
  }
  throw new Error(`tazelik kuralı çözülemedi: ${JSON.stringify(kural)}`);
}

function kuralMetni(k) {
  const saat = `${pad(k.saat || 0)}:${pad(k.dakika || 0)} ${k.tz === 'America/New_York' ? 'New York' : k.tz === 'Europe/Istanbul' ? 'İstanbul' : k.tz || 'UTC'}`;
  if (k.tur === 'gunluk') return `her gün ${saat} sonrası (önceki günün kapanışı)`;
  if (k.tur === 'isgunu') return `iş günleri ${saat} sonrası (hafta sonu yeni veri yok)`;
  if (k.tur === 'haftalik') return `haftalık: ${GUN_AD[k.gun]} ${saat}`;
  if (k.tur === 'aylik') return `aylık: ayın ${k.gun}'${k.gun === 2 ? 'si' : k.gun === 3 ? 'ü' : 'i'} ${saat}`;
  if (k.tur === 'bagimli') return 'türetilmiş: bağımlılığı değişince';
  return k.tur;
}

/**
 * Tazelik kararı. kayit: durum dosyasındaki kaynak kaydı; tum: tüm kayıtlar (bağımlılıklar için); veriGunu: eldeki son gün.
 * → { bayat, neden?, beklenen?, not? }
 */
function bayatlik(k, kayit, simdi, tum, veriGunu, vgAl = () => null) {
  kayit = kayit || {};
  const ms = x => (x == null ? null : typeof x === 'number' ? x : Date.parse(x));
  let son = ms(kayit.sonBasari);
  if (son == null && k.tahminiSonBasari) { try { son = ms(k.tahminiSonBasari()); } catch (e) { son = null; } }
  if (k.tazelik.tur === 'bagimli') {
    if (son == null) return { bayat: true, neden: 'hiç kurulmadı' };
    const degisen = (k.bagimliliklar || []).filter(b => tum[b] && ms(tum[b].sonDegisim) != null && ms(tum[b].sonDegisim) > son);
    if (degisen.length) return { bayat: true, neden: `${degisen.join(', ')} değişti` };
    if (k.ekBayat) {
      let e = null; try { e = k.ekBayat(vgAl); } catch (x) { e = null; }
      // Son başarılı kurulumdan HEMEN sonra da aynı neden sürüyorduysa (kurulum düzeltmedi) tekrar kurma: yoksa her talep /
      // gece aynı sonuçla sonsuz yeniden kurulum döngüsü. Neden değişince (yeni piyasa günü) yeniden kurulur.
      if (e && e !== kayit.ekKalinti) return { bayat: true, neden: e };
      if (e) return { bayat: false, not: `aynı nedenle yeniden kuruldu, fark sürüyor: ${e}` };
    }
    return { bayat: false };
  }
  const b = sonBeklenen(k.tazelik, simdi);
  const beklenen = k.beklenenVeriGunu ? k.beklenenVeriGunu(b) : b.gun;
  if (beklenen && veriGunu && veriGunu >= beklenen) return { bayat: false, beklenen };
  if (son != null && son >= b.yayin) {
    return { bayat: false, beklenen, not: beklenen && (!veriGunu || veriGunu < beklenen) ? 'yayından sonra denendi, yeni veri yok (tatil / gecikme)' : null };
  }
  return { bayat: true, beklenen,
    neden: beklenen ? `son veri ${veriGunu || 'yok'}, beklenen ${beklenen}` : `son güncelleme ${son ? new Date(son).toISOString().slice(0, 16).replace('T', ' ') : 'yok'}, yeni yayın ${new Date(b.yayin).toISOString().slice(0, 16).replace('T', ' ')} UTC` };
}

// ═══ 2. YARDIMCILAR ══════════════════════════════════════════════════════════
function pidCanli(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function jsonYazAtomik(p, veri) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const g = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(g, JSON.stringify(veri, null, 1));
  fs.renameSync(g, p);
}
const imza = p => { try { const s = fs.statSync(p); return `${Math.round(s.mtimeMs)}:${s.size}`; } catch (e) { return null; } };
const isoGun = t => new Date(t).toISOString().slice(0, 10);
/** Büyük ayrıntıyı (ör. 250 sembollük hata haritası) durum dosyası için kısalt. */
function kisalt(x, sinir = 3000) {
  if (x == null) return x;
  let s;
  try { s = JSON.stringify(x); } catch (e) { return String(x).slice(0, 200); }
  if (s.length <= sinir) return x;
  if (typeof x === 'object' && !Array.isArray(x)) {
    const o = {};
    for (const [k, v] of Object.entries(x)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 8) {
        const e = Object.entries(v);
        o[k] = Object.fromEntries(e.slice(0, 8)); o[k + 'Sayisi'] = e.length;
      } else if (Array.isArray(v) && v.length > 12) { o[k] = v.slice(-12); o[k + 'Sayisi'] = v.length; } else o[k] = v;
    }
    s = JSON.stringify(o);
    if (s.length <= sinir * 2) return o;
  }
  return { ozet: s.slice(0, sinir) + '…' };
}

/**
 * Hata metnindeki yerel yolları kısaltır (60.9): kullanıcı adı / proje klasörü ekrana ve Telegram'a gitmesin.
 * "Command failed: <node.exe> <betik>" → "komut başarısız"; proje kökü silinir, ev dizini "~" olur, kalan mutlak
 * Windows yolu dosya adına iner. Eski durum dosyasında kayıtlı metinler /api/veri/durum çıktısında da bu süzgeçten geçer.
 */
function yolKisalt(m) {
  if (typeof m !== 'string' || !m) return m;
  let s = m.replace(/Command failed:.*?node(\.exe)?\s+\S+/gi, 'komut başarısız');
  const kok = KOK.replace(/[\\/]+$/, '');
  for (const k of [kok, kok.replace(/\\/g, '/')]) s = s.split(k + '\\').join('').split(k + '/').join('').split(k).join('');
  const ev = require('os').homedir();
  if (ev) for (const k of [ev, ev.replace(/\\/g, '/')]) s = s.split(k).join('~');
  return s.replace(/[A-Za-z]:\\(?:[^\\\s:"']+\\)+([^\\\s:"']+)/g, '$1');
}
function yollariKisalt(x) {
  if (typeof x === 'string') return yolKisalt(x);
  if (Array.isArray(x)) return x.map(yollariKisalt);
  if (x && typeof x === 'object') { const o = {}; for (const [k, v] of Object.entries(x)) o[k] = yollariKisalt(v); return o; }
  return x;
}

/** node alt süreci (betik) → { stdout, stderr }. Hata: çıkış kodu ≠ 0 ya da zaman aşımı (son stderr satırıyla; yollar kısaltılır). */
function cocukKos(betik, args = [], { env, timeoutMs = 30 * 60e3 } = {}) {
  return new Promise((coz, red) => {
    execFile(process.execPath, [path.join(KOK, betik), ...args], { cwd: KOK, env: { ...process.env, ...(env || {}) }, timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const son = String(stderr || stdout || '').trim().split('\n').slice(-1)[0] || '';
        return red(new Error(yolKisalt(`${betik}: ${err.killed ? 'zaman aşımı' : `çıkış kodu ${err.code != null ? err.code : '?'}`}${son ? ' · ' + son.slice(0, 300) : ''}`)));
      }
      coz({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

// ═══ 3. ORKESTRATÖR ══════════════════════════════════════════════════════════
/** O8: t (ms) botun karar penceresindeyse (UTC 23:50–01:30) pencerenin bitişine kalan ms; değilse 0. */
function kararPenceresiKalanMs(t) {
  const d = new Date(t), dk = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (dk >= 23 * 60 + 50) return ((24 * 60 - dk) + 90) * 60000 - d.getUTCSeconds() * 1000;
  if (dk < 90) return (90 - dk) * 60000 - d.getUTCSeconds() * 1000;
  return 0;
}

class Orkestrator {
  /**
   * @param {object} o { kaynaklar: [tanım], durumDosyasi, kilitDosyasi, simdi?: () => ms, log?: (seviye, mesaj) }
   */
  constructor({ kaynaklar, durumDosyasi, kilitDosyasi, simdi, log } = {}) {
    this.liste = kaynaklar || [];
    this.k = {};
    for (const k of this.liste) {
      if (!k.ad || this.k[k.ad]) throw new Error(`kaynak adı eksik/çift: ${k.ad}`);
      if (!k.harici && typeof k.guncelle !== 'function') throw new Error(`${k.ad}: guncelle() yok`);
      if (!k.tazelik || !k.tazelik.tur) throw new Error(`${k.ad}: tazelik kuralı yok`);
      this.k[k.ad] = k;
    }
    for (const k of this.liste) for (const b of k.bagimliliklar || []) if (!this.k[b]) throw new Error(`${k.ad}: bilinmeyen bağımlılık ${b}`);
    this.adlar = this.liste.map(k => k.ad);
    this.sirala(this.adlar);                      // döngü varsa burada patlar
    this.durumDosyasi = durumDosyasi || yollar.veri('veri-durum.json');
    this.kilitDosyasi = kilitDosyasi || this.durumDosyasi.replace(/\.json$/, '') + '.kilit';
    this.simdi = simdi || (() => Date.now());
    this.log = log || (() => {});
    this.etkin = false;                           // talep tetiği yalnız zamanlayıcı kurulunca koşu başlatır
    this._kosu = null; this._kuyruk = null; this._kuyrukSoz = null; this._aktif = null;
    this._vg = new Map();
    this._imzalar = new Map();
  }

  // ── Sıra ve kapanış ─────────────────────────────────────────────────────
  /** Topolojik sıra (Kahn; eşitlikte kayıt sırası). Döngüde fırlatır. */
  sirala(adlar) {
    const kume = new Set(adlar);
    const derece = new Map([...kume].map(a => [a, (this.k[a].bagimliliklar || []).filter(b => kume.has(b)).length]));
    const sira = [];
    while (sira.length < kume.size) {
      const hazir = this.adlar.find(a => kume.has(a) && derece.get(a) === 0 && !sira.includes(a));
      if (!hazir) throw new Error('bağımlılık döngüsü: ' + [...kume].filter(a => !sira.includes(a)).join(', '));
      sira.push(hazir);
      for (const a of kume) if ((this.k[a].bagimliliklar || []).includes(hazir)) derece.set(a, derece.get(a) - 1);
    }
    return sira;
  }
  yukari(adlar) {
    const out = new Set();
    const gez = a => { for (const b of this.k[a].bagimliliklar || []) if (!out.has(b)) { out.add(b); gez(b); } };
    adlar.forEach(gez);
    return out;
  }
  /** istenen + yukarı bağımlılıklar + aşağıdaki türetilmişler. */
  kapanis(adlar) {
    const s = new Set([...adlar, ...this.yukari(adlar)]);
    let degisti = true;
    while (degisti) {
      degisti = false;
      for (const k of this.liste) {
        if (s.has(k.ad) || k.tazelik.tur !== 'bagimli') continue;
        if ((k.bagimliliklar || []).some(b => s.has(b))) { s.add(k.ad); degisti = true; }
      }
    }
    return [...s];
  }

  // ── Kalıcı durum ────────────────────────────────────────────────────────
  durumOku() {
    try {
      const d = JSON.parse(fs.readFileSync(this.durumDosyasi, 'utf8'));
      if (d && d.surum === SURUM) return { kaynaklar: {}, kosular: [], gece: {}, ...d };
    } catch (e) { /* yok / bozuk → boş */ }
    return { surum: SURUM, kaynaklar: {}, kosular: [], gece: {}, aktif: null };
  }
  _degistir(f) {
    const d = this.durumOku();
    f(d);
    d.surum = SURUM;
    d.guncelleme = new Date(this.simdi()).toISOString();
    jsonYazAtomik(this.durumDosyasi, d);
    return d;
  }

  // ── Süreçler arası kilit ────────────────────────────────────────────────
  kilitDurumu() {
    let k = null;
    try { k = JSON.parse(fs.readFileSync(this.kilitDosyasi, 'utf8')); } catch (e) {
      if (e.code === 'ENOENT') return null;
      // Okunamayan / boş dosya: başka süreç 'wx' ile yeni açmış, henüz yazmamış olabilir → 30 sn içindeyse CANLI say (çalma).
      try { const s = fs.statSync(this.kilitDosyasi); if (Date.now() - s.mtimeMs < 30e3) return { pid: null, bas: s.mtime.toISOString(), bayat: false, yaziliyor: true }; } catch (x) { return null; }
      return { pid: null, bas: null, bayat: true };
    }
    if (!k || Date.now() - Date.parse(k.bas) > KILIT_OMUR_MS || !pidCanli(k.pid)) return { ...k, bayat: true };
    return k;
  }
  _kilitAl() {
    fs.mkdirSync(path.dirname(this.kilitDosyasi), { recursive: true });
    for (let d = 0; d < 3; d++) {
      try {
        const fd = fs.openSync(this.kilitDosyasi, 'wx');
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, bas: new Date().toISOString() }));
        fs.closeSync(fd);
        return;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        const k = this.kilitDurumu();
        // Aynı pid: süreç içi kilit (_kosu) zaten tek koşu sağlıyor → kalan dosya çökmeden artmıştır.
        if (!k || k.bayat || k.pid === process.pid) { try { fs.unlinkSync(this.kilitDosyasi); } catch (x) { /* yarış */ } continue; }
        throw new Error(`veri orkestratörü başka bir süreçte çalışıyor (pid ${k.pid == null ? '?' : k.pid}, ${k.bas}'den beri)`);
      }
    }
    throw new Error('kilit alınamadı: ' + this.kilitDosyasi);
  }
  _kilitBirak() {
    try { const k = JSON.parse(fs.readFileSync(this.kilitDosyasi, 'utf8')); if (k.pid === process.pid) fs.unlinkSync(this.kilitDosyasi); } catch (e) { /* yok */ }
  }

  // ── Veri günü (önbellekli) ──────────────────────────────────────────────
  veriGunu(ad, { taze = false, kayit } = {}) {
    const k = this.k[ad];
    if (!k || !k.veriGunu) return null;
    const simdi = Date.now();
    const onb = this._vg.get(ad);
    if (!taze && onb && simdi - onb.t < 60e3) return onb.v;
    if (!taze && k.pahaliVeriGunu) {
      const kk = kayit || this.durumOku().kaynaklar[ad] || {};
      if (kk.veriGunu && kk.veriGunuZamani && simdi - Date.parse(kk.veriGunuZamani) < PAHALI_TAZELE_MS) {
        this._vg.set(ad, { t: simdi, v: kk.veriGunu });
        return kk.veriGunu;
      }
    }
    let v = null;
    try { v = k.veriGunu() || null; } catch (e) { v = null; }
    this._vg.set(ad, { t: simdi, v });
    // Başka süreç (ör. npm run veri:guncelle) koşarken durum dosyasına yazma: onun adım kaydını ezebilir (oku-değiştir-yaz yarışı).
    const kl = k.pahaliVeriGunu && v ? this.kilitDurumu() : null;
    if (k.pahaliVeriGunu && v && !(kl && !kl.bayat && kl.pid !== process.pid)) {
      try { this._degistir(d => { d.kaynaklar[ad] = { ...(d.kaynaklar[ad] || {}), veriGunu: v, veriGunuZamani: new Date(simdi).toISOString() }; }); } catch (e) { /* salt okunur */ }
    }
    return v;
  }

  _kayit(ad, d) {
    const k = this.k[ad];
    if (k.harici && k.harici.durum) { try { return { ...(d.kaynaklar[ad] || {}), ...(k.harici.durum() || {}) }; } catch (e) { return { hata: e.message }; } }
    return d.kaynaklar[ad] || {};
  }
  bayatlik(ad, d = this.durumOku(), vg) {
    const tum = {};
    for (const a of this.adlar) tum[a] = this._kayit(a, d);
    return bayatlik(this.k[ad], tum[ad], this.simdi(), tum, vg === undefined ? this.veriGunu(ad, { kayit: tum[ad] }) : vg, a => this.veriGunu(a));
  }

  /** Süren Binance hız sınırı beklemesi { bitis, kod, neden } | null (418/429 sonrası; süreçler arası, durum dosyasında). */
  binanceBekleme(d) {
    const b = (d || this.durumOku()).binanceBekleme;
    return b && Date.parse(b.bitis) > this.simdi() ? b : null;
  }

  /**
   * Orkestratör DIŞINDAKİ Binance istemcileri (coin tarama, lib/tarama) için ortak bekleme erişimi: `BinanceKota`ya
   * { bekleme } olarak verilir → 418/429 beklemesi tek yerde (data/veri-durum.json) tutulur, iki taraf da uyar.
   */
  binanceBeklemeErisimi(kimden = 'dış istemci') {
    return {
      oku: () => this.binanceBekleme(),
      yaz: (x) => { try { this._degistir(d => { d.binanceBekleme = x; }); } catch (e) { /* yoksay */ } this.log('WARN', `📦 Binance hız sınırı (${x.kod}, ${kimden}): ${x.bitis}'e kadar Binance'e istek atılmayacak`); },
    };
  }

  // ── Durum tablosu ───────────────────────────────────────────────────────
  durum() {
    const d = this.durumOku();
    let aktif = this._aktif ? { ...this._aktif, pid: process.pid } : null;
    if (!aktif && d.aktif && d.aktif.pid !== process.pid && pidCanli(d.aktif.pid)) aktif = d.aktif;
    const kaynaklar = this.adlar.map(ad => {
      const k = this.k[ad], kayit = this._kayit(ad, d);
      const vg = this.veriGunu(ad, { kayit });
      let b;
      try { b = this.bayatlik(ad, d, vg); } catch (e) { b = { bayat: false, neden: e.message }; }
      const hataSon = kayit.hata && (!kayit.sonBasari || Date.parse(kayit.hataZamani || 0) >= Date.parse(kayit.sonBasari));
      let durum;
      if (aktif && aktif.ad === ad) durum = 'calisiyor';
      else if (k.harici && kayit.calisiyor) durum = 'calisiyor';
      else if (hataSon) durum = 'hata';
      else if (b.bayat) durum = 'bayat';
      else durum = 'guncel';
      return {
        ad, kisaAd: k.kisaAd || ad, grup: k.grup || null, aciklama: k.aciklama || '', tur: k.harici ? 'harici' : k.tazelik.tur === 'bagimli' ? 'turetilmis' : 'veri',
        tazelik: kuralMetni(k.tazelik), bagimliliklar: k.bagimliliklar || [], hizSiniri: k.hizSiniri || null,
        veriGunu: vg, beklenen: b.beklenen || null, bayat: !!b.bayat, bayatNeden: b.neden || null, not: b.not || null,
        sonBasari: kayit.sonBasari || null, sonBasariTahmin: !kayit.sonBasari && k.tahminiSonBasari ? (() => { try { return k.tahminiSonBasari() || null; } catch (e) { return null; } })() : null,
        sonDeneme: kayit.sonDeneme || null, sonDegisim: kayit.sonDegisim || null,
        sureMs: kayit.sureMs == null ? null : kayit.sureMs, hata: hataSon ? kayit.hata : null, durum, ayrinti: kayit.ayrinti || null,
        uyari: kayit.uyari || null,
      };
    });
    const ozet = {};
    for (const s of kaynaklar) ozet[s.durum] = (ozet[s.durum] || 0) + 1;
    return { calisiyor: !!aktif, aktif, kuyrukta: !!this._kuyruk, etkin: this.etkin, kaynaklar, ozet,
      binanceBekleme: this.binanceBekleme(d), binanceKip: binanceKip(),
      sonKosu: d.kosular.length ? d.kosular[d.kosular.length - 1] : null, gece: d.gece || {} };
  }

  // ── Çalıştırma ──────────────────────────────────────────────────────────
  /** Bkz. dosya başı. Koşu sürüyorsa istek kuyruğa birleşir; dönen söz kuyruk koşusunun sonucudur. */
  calistir(ops = {}) {
    if (ops.kaynaklar) for (const a of ops.kaynaklar) { if (!this.k[a]) return Promise.reject(new Error(`bilinmeyen kaynak: ${a}`)); }
    if (this._kosu) {
      const q = this._kuyruk || (this._kuyruk = { adlar: new Set(), hepsi: false, zorla: new Set(), zorlaHepsi: false, nedenler: new Set() });
      if (!ops.kaynaklar) q.hepsi = true; else ops.kaynaklar.forEach(a => q.adlar.add(a));
      if (ops.zorla === true) { if (!ops.kaynaklar) q.zorlaHepsi = true; else ops.kaynaklar.forEach(a => q.zorla.add(a)); }
      else if (Array.isArray(ops.zorla)) ops.zorla.forEach(a => q.zorla.add(a));
      q.nedenler.add(ops.neden || 'elle');
      if (!this._kuyrukSoz) {
        this._kuyrukSoz = this._kosu.catch(() => null).then(() => {
          const q2 = this._kuyruk; this._kuyruk = null; this._kuyrukSoz = null;
          return this.calistir({ kaynaklar: q2.hepsi ? undefined : [...q2.adlar], zorla: q2.zorlaHepsi ? true : [...q2.zorla], neden: [...q2.nedenler].join(' + ') });
        });
      }
      return this._kuyrukSoz;
    }
    this._kosu = this._kos(ops).finally(() => { this._kosu = null; });
    return this._kosu;
  }

  async _kos({ kaynaklar, zorla = false, neden = 'elle' } = {}) {
    this._kilitAl();
    const bas = this.simdi();
    const adimlar = {};
    try {
      const istenen = kaynaklar ? [...kaynaklar] : this.adlar.filter(a => !this.k[a].harici);
      const sira = this.sirala(this.kapanis(istenen)).filter(a => !this.k[a].harici);
      for (let i = 0; i < sira.length; i++) {
        const ad = sira[i], k = this.k[ad];
        const zorlaBu = zorla === true ? istenen.includes(ad) || !kaynaklar : Array.isArray(zorla) && zorla.includes(ad);
        let b = null;
        if (!zorlaBu) {
          try { b = this.bayatlik(ad, undefined, this.veriGunu(ad, { taze: !k.pahaliVeriGunu })); } catch (e) { b = { bayat: true, neden: e.message }; }
          if (!b.bayat) { adimlar[ad] = { durum: 'guncel' }; continue; }
        }
        this._aktif = { ad, bas: new Date(this.simdi()).toISOString(), sira: i + 1, toplam: sira.length, neden, ilerleme: null };
        try { this._degistir(d => { d.aktif = { ...this._aktif, pid: process.pid }; }); } catch (e) { /* yoksay */ }
        const once = this.veriGunu(ad, { taze: true });
        const t0 = this.simdi();
        let yeni;
        try {
          const bb = k.binanceApi ? this.binanceBekleme() : null;
          if (bb) throw new Error(`Binance hız sınırı beklemesi (${bb.kod}) ${bb.bitis}'e kadar — istek atılmadı`);
          const r = (await k.guncelle({ zorla: zorlaBu, neden, log: this.log, ilerleme: m => { if (this._aktif) this._aktif.ilerleme = String(m).slice(0, 120); },
            bekleme: { oku: () => this.binanceBekleme(), yaz: x => { try { this._degistir(d => { d.binanceBekleme = x; }); } catch (e) { /* yoksay */ } this.log('WARN', `📦 Binance hız sınırı (${x.kod}): ${x.bitis}'e kadar orkestratör Binance'e istek atmayacak`); } } })) || {};
          if (k.onbellekDusur) { try { k.onbellekDusur(); } catch (e) { /* yoksay */ } }
          if (k.izlenenDosya) this._imzalar.set(ad, imza(k.izlenenDosya()));
          this._vg.delete(ad);
          const sonra = this.veriGunu(ad, { taze: true });
          const degisti = r.degisti != null ? !!r.degisti : sonra !== once;
          let ekKalinti = null;
          if (k.ekBayat) { try { ekKalinti = k.ekBayat(a => this.veriGunu(a)) || null; } catch (e) { ekKalinti = null; } }
          const simdi = new Date(this.simdi()).toISOString(), sure = this.simdi() - t0;
          yeni = x => ({ ...x, sonBasari: simdi, sonDeneme: simdi, sureMs: sure, hata: null, hataZamani: null, veriGunu: sonra, veriGunuZamani: simdi,
            ayrinti: kisalt(r.ayrinti != null ? r.ayrinti : null), sonNeden: b ? b.neden : 'zorla', ekKalinti, uyari: r.uyari || null, ...(degisti ? { sonDegisim: simdi } : {}) });
          adimlar[ad] = { durum: 'tamam', sureMs: sure, degisti, veriGunu: sonra, neden: b ? b.neden : 'zorla', ayrinti: kisalt(r.ayrinti, 600), uyari: r.uyari || null };
          this.log(degisti ? 'SUCCESS' : 'INFO', `📦 Veri: ${k.kisaAd || ad} güncellendi (${(sure / 1000).toFixed(0)} sn${sonra ? `, son veri ${sonra}` : ''}${degisti ? '' : ', yeni veri yok'})`);
          if (r.uyari) this.log('WARN', `📦 Veri: ${k.kisaAd || ad} — ${r.uyari}`);
        } catch (e) {
          const simdi = new Date(this.simdi()).toISOString(), sure = this.simdi() - t0, mesaj = String(e && e.message || e).slice(0, 500);
          yeni = x => ({ ...x, sonDeneme: simdi, sureMs: sure, hata: mesaj, hataZamani: simdi });
          adimlar[ad] = { durum: 'hata', sureMs: sure, hata: mesaj };
          this.log('WARN', `📦 Veri: ${k.kisaAd || ad} güncellenemedi: ${mesaj}`);
        }
        this._aktif = null;
        try { this._degistir(d => { d.kaynaklar[ad] = yeni(d.kaynaklar[ad] || {}); d.aktif = null; }); } catch (e) { this.log('ERROR', `veri durumu yazılamadı: ${e.message}`); }
      }
      const bit = this.simdi();
      const kosu = { bas: new Date(bas).toISOString(), bit: new Date(bit).toISOString(), sureSn: Math.round((bit - bas) / 1000), neden, adimlar,
        hatalar: Object.values(adimlar).filter(a => a.durum === 'hata').length, calisan: Object.values(adimlar).filter(a => a.durum !== 'guncel').length };
      if (kosu.calisan) {
        try { this._degistir(d => { d.kosular = [...(d.kosular || []), { ...kosu, adimlar: Object.fromEntries(Object.entries(adimlar).map(([a, x]) => [a, { durum: x.durum, sureMs: x.sureMs, hata: x.hata, veriGunu: x.veriGunu }])) }].slice(-30); }); } catch (e) { /* yoksay */ }
      }
      return kosu;
    } finally {
      this._aktif = null;
      try { this._degistir(d => { if (d.aktif && d.aktif.pid === process.pid) d.aktif = null; }); } catch (e) { /* yoksay */ }
      this._kilitBirak();
    }
  }

  // ── Talep tetiği ────────────────────────────────────────────────────────
  /**
   * EŞZAMANLI: bayat kaynakları (ve bayat yukarı bağımlılıklarını) arka planda tazelemeyi başlatır, beklemez.
   * → { veriNotu: metin | null, kaynaklar: [{ ad, veriGunu, bayat, guncelleniyor, hata }], baslatildi: [ad] }
   */
  talep(adlar, { neden = 'talep' } = {}) {
    const bos = { veriNotu: null, kaynaklar: [], baslatildi: [] };
    if (!this.etkin || !adlar || !adlar.length) return bos;
    const istenen = [...new Set(adlar)].filter(a => this.k[a] && !this.k[a].harici);
    if (!istenen.length) return bos;
    const d = this.durumOku();
    const kume = this.sirala([...new Set([...istenen, ...this.yukari(istenen)])]).filter(a => !this.k[a].harici);
    const simdi = this.simdi(), sonuc = [], baslat = [];
    const aktifAd = this._aktif && this._aktif.ad;
    for (const ad of kume) {
      const k = this.k[ad], kayit = this._kayit(ad, d);
      const vg = this.veriGunu(ad, { kayit });
      let b; try { b = this.bayatlik(ad, d, vg); } catch (e) { b = { bayat: false }; }
      if (!b.bayat) continue;
      if (k.binanceApi && this.binanceBekleme(d)) {
        sonuc.push({ ad, kisaAd: k.kisaAd || ad, veriGunu: vg, bayat: true, neden: b.neden || null, guncelleniyor: false, hata: 'Binance hız sınırı beklemesi' });
        continue;
      }
      const yakin = kayit.sonDeneme && simdi - Date.parse(kayit.sonDeneme) < (k.enAzAralikMs != null ? k.enAzAralikMs : 15 * 60e3);
      const surecek = !yakin || aktifAd === ad;
      if (!yakin) baslat.push(ad);
      sonuc.push({ ad, kisaAd: k.kisaAd || ad, veriGunu: vg, bayat: true, neden: b.neden || null, guncelleniyor: surecek, hata: kayit.hata || null });
    }
    if (baslat.length) {
      setImmediate(() => this.calistir({ kaynaklar: baslat, neden: neden }).catch(e => this.log('WARN', `📦 Veri talebi (${neden}) koşulamadı: ${e.message}`)));
    }
    const veriNotu = sonuc.length ? sonuc.map(x => `${x.kisaAd}: veri ${x.veriGunu || '?'} tarihine kadar${x.guncelleniyor ? '; güncelleme sürüyor' : x.hata ? `; son güncelleme denemesi başarısız (${x.hata.slice(0, 120)})` : ''}`).join(' · ')
      + ' — sonuç eldeki veriyle hesaplandı.' : null;
    return { veriNotu, kaynaklar: sonuc, baslatildi: baslat };
  }

  // ── Zamanlayıcı (açılış + gece) ─────────────────────────────────────────
  /** Süreç içi önbellekleri, başka süreç (CLI) dosyayı yenilediyse düşür. */
  onbellekNobet() {
    for (const k of this.liste) {
      if (!k.izlenenDosya || !k.onbellekDusur) continue;
      let p; try { p = k.izlenenDosya(); } catch (e) { continue; }
      const im = imza(p);
      if (!this._imzalar.has(k.ad)) { this._imzalar.set(k.ad, im); continue; }
      if (this._imzalar.get(k.ad) !== im) { this._imzalar.set(k.ad, im); try { k.onbellekDusur(); } catch (e) { /* yoksay */ } }
    }
  }

  async geceTik({ saat = 4, dakika = 30 } = {}) {
    const simdi = new Date(this.simdi());
    const bugun = `${simdi.getFullYear()}-${pad(simdi.getMonth() + 1)}-${pad(simdi.getDate())}`;
    if (simdi.getHours() * 60 + simdi.getMinutes() < saat * 60 + dakika) return null;
    const g = this.durumOku().gece || {};
    if (g.sonGun === bugun) return null;
    if (g.hataGun === bugun && ((g.hataSayisi || 0) >= 3 || this.simdi() - Date.parse(g.hataZaman) < 2 * 3600e3)) return null;
    if (this._kosu) return null;
    let kosu = null, hata = null;
    try { kosu = await this.calistir({ neden: 'gece' }); } catch (e) { hata = e.message; }
    const zaman = new Date(this.simdi()).toISOString();
    this._degistir(d => {
      const g0 = d.gece || {};
      if (!hata && kosu.hatalar === 0) d.gece = { sonGun: bugun, son: zaman, sonuc: { calisan: kosu.calisan, sureSn: kosu.sureSn } };
      else d.gece = { ...g0, hataGun: bugun, hataZaman: zaman, hataSayisi: (g0.hataGun === bugun ? g0.hataSayisi || 0 : 0) + 1, sonHata: hata || `${kosu.hatalar} kaynak hatalı` };
    });
    // O10 (62.0): gece güncellemesi o gün 3. kez başarısızsa (bugün artık denenmez) Telegram uyarısı.
    const g1 = (this.durumOku().gece || {});
    if (g1.hataGun === bugun && g1.hataSayisi === 3 && typeof this.alarm === 'function') {
      try { this.alarm('Gece veri güncellemesi yapılamadı', [`Bugün 3 deneme başarısız: ${g1.sonHata}`, 'Portföy modelleri ve tarama bayat veriyle çalışabilir; yarın yeniden denenir. Panel › Ayarlar › Veri.']); } catch { /* */ }
    }
    return kosu || { hata };
  }

  zamanlayiciBaslat({ saat = 4, dakika = 30, aralikMs = 10 * 60e3, acilisMs = 2 * 60e3 } = {}) {
    if (process.env.VERI_ORKESTRATOR === '0' || process.env.PORTFOY_GUNCELLEME === '0') { this.log('INFO', '📦 Veri orkestratörü zamanlayıcısı kapalı (VERI_ORKESTRATOR=0)'); return null; }
    this.etkin = true;
    this.onbellekNobet();
    const tik = () => { this.onbellekNobet(); this.geceTik({ saat, dakika }).catch(e => this.log('ERROR', `📦 Gece veri güncellemesi: ${e.message}`)); };
    // O8 (62.0, DENETIM-CANLI-ALTYAPI): açılış koşusu botun karar penceresine (UTC 23:50–01:30) düşerse pencere sonuna
    // ertelenir — yeniden başlatma 03:00 civarına denk gelirse ağır indirme günlük çalışmayla çakışmasın (418 IP yasağı riski).
    const ertele = kararPenceresiKalanMs(this.simdi() + acilisMs);
    if (ertele > 0) this.log('INFO', `📦 Açılış veri güncellemesi botun karar penceresinden sonraya ertelendi (${Math.round(ertele / 60000)} dk)`);
    const ilk = setTimeout(() => {
      this.calistir({ neden: 'açılış' })
        .then(k => { if (k.calisan) this.log(k.hatalar ? 'WARN' : 'SUCCESS', `📦 Açılış veri güncellemesi: ${k.calisan} kaynak, ${k.sureSn} sn, ${k.hatalar} hata`); })
        .catch(e => this.log('WARN', `📦 Açılış veri güncellemesi koşulamadı: ${e.message}`))
        .finally(() => tik());
    }, acilisMs + ertele);
    const id = setInterval(tik, aralikMs);
    if (ilk.unref) ilk.unref();
    if (id.unref) id.unref();
    return { tik, durdur: () => { clearTimeout(ilk); clearInterval(id); this.etkin = false; } };
  }

  // ── HTTP ────────────────────────────────────────────────────────────────
  router() {
    const express = require('express');
    const r = express.Router();
    r.get('/api/veri/durum', (req, res) => {
      try { res.json({ success: true, ...yollariKisalt(this.durum()) }); } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });
    r.post('/api/veri/guncelle', express.json({ limit: '64kb' }), (req, res) => {
      const g = req.body || {};
      let kaynaklar;
      if (g.kaynak != null && g.kaynak !== '') {
        kaynaklar = [].concat(g.kaynak).map(String);
        const kotu = kaynaklar.find(a => !this.k[a] || this.k[a].harici);
        if (kotu) return res.status(400).json({ success: false, error: `bilinmeyen ya da kendi zamanlamasıyla koşan kaynak: ${kotu}` });
      }
      const kl = this.kilitDurumu();
      if (kl && !kl.bayat && kl.pid !== process.pid) return res.status(409).json({ success: false, error: `veri güncellemesi başka bir süreçte sürüyor (pid ${kl.pid}, ${kl.bas}'den beri)` });
      const zorla = g.zorla === true || g.zorla === '1' || g.zorla === 1;
      const kuyrukta = !!this._kosu;
      this.calistir({ kaynaklar, zorla, neden: 'elle (panel)' })
        .then(k => this.log(k.hatalar ? 'WARN' : 'SUCCESS', `📦 Elle veri güncellemesi: ${k.calisan} kaynak, ${k.sureSn} sn, ${k.hatalar} hata`))
        .catch(e => this.log('ERROR', `📦 Elle veri güncellemesi: ${e.message}`));
      res.json({ success: true, baslatildi: !kuyrukta, kuyrukta });
    });
    return r;
  }
}

// ═══ 4. PORTFÖY KİMLİĞİ → KAYNAK ══════════════════════════════════════════════
/** Portföy tanımındaki kimlikler (+ kıyaslar, birim) → dokunduğu veri kaynakları. */
function kaynaklariBul(kimlikler = [], { birim = 'USD' } = {}) {
  const out = new Set();
  let gv = null;
  const gvSet = () => gv || (gv = new Set(require('../ileri/bollingerIzleme').YAHOO_VARLIKLAR.map(x => x[0])));
  const nasdaqDosya = s => fs.existsSync(yollar.veri('nasdaq', String(s).replace(/[^A-Z0-9.]/gi, '_') + '.json'));
  for (const kim of kimlikler) {
    const k = String(kim || '');
    if (k === '60/40') { out.add('yahoo-nasdaq'); continue; }
    const [tur, ...r] = k.split(':'); const ad = r.join(':');
    if (tur === 'yahoo') out.add(gvSet().has(ad) ? 'yahoo-gercek-varlik' : nasdaqDosya(ad) ? 'yahoo-nasdaq' : 'yahoo-portfoy');
    else if (tur === 'tefas') { out.add('tefas'); out.add('usdtry'); }
    else if (tur === 'tr') { out.add('usdtry'); if (ad === 'mevduat') out.add('evds-mevduat'); }
    else if (tur === 'kripto' && ad !== 'BTC-bitstamp') out.add('binance-market-db');
    else if (tur === 'strateji' && ad === 'qqq-m10') { out.add('yahoo-nasdaq'); out.add('yahoo-gercek-varlik'); out.add('yahoo-portfoy'); }   // hisseler + ^GSPC takvimi + ^IRX
    else if (tur === 'strateji' && ad === 'bist-m10') { out.add('yahoo-bist'); out.add('usdtry'); }
    else if (tur === 'strateji' && ad !== 'nasdaq-n1') out.add('kol-onbellegi');
    else if (tur === 'nakit' && ad === 'tbill') out.add('yahoo-portfoy');
  }
  if (birim === 'TL' || birim === 'TL-reel') out.add('usdtry');
  if (birim === 'TL-reel') out.add('tufe');
  return [...out];
}

// ═══ 5. GERÇEK KAYNAKLAR ══════════════════════════════════════════════════════
const STABIL = /^(USDC|BUSD|TUSD|FDUSD|USDP|DAI|UST|USTC|EUR|GBP|AEUR|PAX|USDE|RLUSD|USD1|BFUSD)$/;
const bekle = ms => new Promise(r => setTimeout(r, ms));

// ─── Binance IP ağırlık bütçesi + 418/429 geri çekilme ─────────────────────────
// Canlı bot (lib/live) AYNI makinede, AYNI IP'den Binance'e gider ve kendi tarafında 418/429 koruması YOK: orkestratör
// kotayı tüketip IP yasağına (418) yol açarsa canlı bot da kör kalır. Bu yüzden: (1) her yanıtta X-MBX-USED-WEIGHT-1M
// (IP'nin TOPLAM kullanımı — canlı bot dahil) okunur; bütçe payını aşınca dakika dönene kadar beklenir, uzarsa adım
// bırakılır; (2) 429/418 görülünce adım HEMEN durur, Retry-After (yoksa 429 → 2 dk, 418 → 2 saat) kadar hiçbir Binance
// kaynağı istek atmaz (bekleme durum dosyasında, süreçler arası); (3) canlı kip (ARASTIRMA_MODU yok = canlı bot bu
// makinede olabilir) sıkı: bütçe %25, istekler arası 1 sn, koşu başına istek tavanı. Araştırma kipi daha gevşek.
const BINANCE_SINIR = { perp: 2400, spot: 6000 };      // IP başına dakikalık ağırlık sınırı (USDⓈ-M / spot)
const KIP_AYAR = Object.freeze({
  canli: Object.freeze({ pay: 0.25, araMs: 1000, istekTavan: 600, azamiBekleMs: 3 * 60e3 }),
  arastirma: Object.freeze({ pay: 0.5, araMs: 250, istekTavan: 3000, azamiBekleMs: 5 * 60e3 }),
});
const binanceKip = (env = process.env) => (env.ARASTIRMA_MODU === '1' ? 'arastirma' : 'canli');
class KotaHatasi extends Error {}
/** Hata → 418 (IP yasağı) | 429 (hız sınırı) | null. */
function kotaKodu(e) {
  const m = String((e && e.message) || e || ''), ad = e && e.constructor && e.constructor.name;
  if (/\b418\b|IP banned|banned until/i.test(m)) return 418;
  if (ad === 'RateLimitExceeded' || ad === 'DDoSProtection' || /\b429\b|Too many requests|-1003/i.test(m)) return 429;
  return null;
}
class BinanceKota {
  /** @param o { kip, simdi, uyu, bekleme: { oku() → {bitis,kod}|null, yaz(x) } } */
  constructor({ kip = binanceKip(), simdi = () => Date.now(), uyu = bekle, bekleme = null } = {}) {
    this.kip = KIP_AYAR[kip] ? kip : 'canli';
    this.ayar = KIP_AYAR[this.kip];
    this.simdi = simdi; this.uyu = uyu;
    this.bekleme = bekleme || { oku: () => null, yaz: () => {} };
    this.istekSayisi = 0; this.toplamBekleMs = 0; this.agirlik = {}; this.enYuksek = {};
  }
  kontrol() {
    const b = this.bekleme.oku();
    if (b && Date.parse(b.bitis) > this.simdi()) throw new KotaHatasi(`Binance hız sınırı beklemesi (${b.kod}) ${b.bitis}'e kadar — istek atılmadı`);
  }
  agirlikYaz(market, deger) {
    const v = deger == null ? NaN : +deger;
    if (!Number.isFinite(v)) return;
    this.agirlik[market] = { v, dk: Math.floor(this.simdi() / 60e3) };
    this.enYuksek[market] = Math.max(this.enYuksek[market] || 0, v);
  }
  _basliktan(market, ex) {
    const h = ex && ex.last_response_headers;
    if (h) this.agirlikYaz(market, h['X-Mbx-Used-Weight-1m'] != null ? h['X-Mbx-Used-Weight-1m'] : h['x-mbx-used-weight-1m']);
  }
  /** 418/429 ise beklemeyi yazar ve KotaHatasi fırlatır; değilse hiçbir şey yapmaz. */
  hataIsle(e, ex) {
    const kod = kotaKodu(e);
    if (!kod) return;
    const h = (ex && ex.last_response_headers) || {};
    const ra = Number(e && e.retryAfter != null ? e.retryAfter : h['Retry-After'] != null ? h['Retry-After'] : h['retry-after']);
    const sure = Number.isFinite(ra) && ra > 0 ? ra * 1000 : kod === 418 ? 2 * 3600e3 : 120e3;
    const bitis = new Date(this.simdi() + sure).toISOString();
    try { this.bekleme.yaz({ bitis, kod, neden: String((e && e.message) || e).slice(0, 200), zaman: new Date(this.simdi()).toISOString() }); } catch (x) { /* yoksay */ }
    throw new KotaHatasi(`Binance hız sınırı (${kod}): ${bitis}'e kadar Binance isteği yok — ${String((e && e.message) || e).slice(0, 120)}`);
  }
  /** Tek Binance isteği: bekleme / tavan / ağırlık bütçesi denetimi → fn() → ağırlık başlığı; 418/429 → kalıcı bekleme. */
  async istek(market, ex, fn) {
    this.kontrol();
    if (this.istekSayisi >= this.ayar.istekTavan) throw new KotaHatasi(`Binance istek tavanı (${this.ayar.istekTavan}, ${this.kip} kipi) doldu — kalan semboller sonraki koşuda`);
    const a = this.agirlik[market], sinir = (BINANCE_SINIR[market] || 2400) * this.ayar.pay;
    if (a && a.v >= sinir && a.dk === Math.floor(this.simdi() / 60e3)) {
      const ms = 60e3 - (this.simdi() % 60e3) + 1000;
      if (this.toplamBekleMs + ms > this.ayar.azamiBekleMs) throw new KotaHatasi(`Binance ağırlık bütçesi (${Math.round(sinir)}/dk, ${this.kip} kipi) ${Math.round(this.toplamBekleMs / 1000)} sn beklemeye rağmen dolu (IP kullanımı ${a.v}) — kalan semboller sonraki koşuda`);
      this.toplamBekleMs += ms;
      await this.uyu(ms);
      delete this.agirlik[market];
    }
    this.istekSayisi++;
    try {
      const r = await fn();
      this._basliktan(market, ex);
      return r;
    } catch (e) {
      this._basliktan(market, ex);
      this.hataIsle(e, ex);
      throw e;
    } finally {
      if (this.ayar.araMs) await this.uyu(this.ayar.araMs);
    }
  }
  ozet() { return { kip: this.kip, istek: this.istekSayisi, bekleSn: Math.round(this.toplamBekleMs / 1000), enYuksekAgirlik: this.enYuksek }; }
}

/** Dosyadan türetilen değer (imza değişmedikçe yeniden okunmaz). */
const _dosyaOnb = new Map();     // anahtar: dosya + '#' + ne çıkarıldığı
function dosyadan(p, f, anahtar = '') {
  const im = imza(p);
  if (!im) return null;
  const ak = p + '#' + anahtar;
  const o = _dosyaOnb.get(ak);
  if (o && o.im === im) return o.v;
  let v = null;
  try { v = f(p); } catch (e) { v = null; }
  _dosyaOnb.set(ak, { im, v });
  return v;
}
const mtimeIso = p => { try { return fs.statSync(p).mtime.toISOString(); } catch (e) { return null; } };

/** Yahoo seri dosyasının son günü (data/portfoy/yahoo biçimi { gunler } ya da data/gercek-varlik { seri }). */
function yahooSonGun(sembol) {
  const ad = String(sembol).replace(/[^A-Z0-9.]/gi, '_') + '.json';
  const adlar = [yollar.veri('portfoy', 'yahoo', ad), yollar.veri('nasdaq', ad), yollar.veri('gercek-varlik', ad),
    yollar.veri('gercek-varlik', String(sembol).replace(/[^A-Za-z0-9.-]/g, '_') + '.json')];
  const p = adlar.find(x => fs.existsSync(x));
  if (!p) return null;
  return dosyadan(p, x => yahooTamGun(JSON.parse(fs.readFileSync(x, 'utf8'))));
}
/**
 * Yahoo dosyasının son TAMAMLANMIŞ günü. indir.js gün içinde koşarsa bugünün AÇIK mumunu da yazar; indirme o günün
 * 18:00 New York'undan önceyse son mum tamamlanmamış sayılır (yoksa veri günü "bugün" görünür, yarım mum kapanış
 * sonrası tazelenmez). Kapanıştan sonra kaynak bayat düşer, yahooIndir son mumu (g.t ≥ sonT) yenisiyle değiştirir.
 */
function yahooTamGun(j) {
  if (Array.isArray(j.gunler) && j.gunler.length) {
    const g = j.gunler, son = isoGun(g[g.length - 1].t), ind = Date.parse(j.indirme || '');
    if (Number.isFinite(ind) && g.length > 1) {
      const [y, a, gg] = son.split('-').map(Number);
      if (ind < yereldenUtc(y, a, gg, 18, 0, 'America/New_York')) return isoGun(g[g.length - 2].t);
    }
    return son;
  }
  if (Array.isArray(j.seri) && j.seri.length) return String(j.seri[j.seri.length - 1][0]).slice(0, 10);
  return null;
}

/** Kol önbelleğiyle yeniden hesaplanan ölçüm ↔ bindirme.js STRATEJILER.kayit (kayıt 3 ondalık yuvarlı → tolerans 0,0006). */
function kayitKarsilastir(olcum, S, tol = 0.0006) {
  const farklar = [];
  for (const [ad, s] of Object.entries(S || {})) {
    const y = olcum && olcum[ad];
    if (!y) { farklar.push({ strateji: ad, ad: s.ad, olcu: '*', kayit: null, yeni: null, not: 'ölçülemedi' }); continue; }
    for (const [olcu, kv] of Object.entries(s.kayit || {})) {
      if (olcu === 'P' || y[olcu] == null || !Number.isFinite(y[olcu])) continue;   // P bootstrap'lı, burada ölçülmez
      const fark = y[olcu] - kv;
      if (Math.abs(fark) > tol) farklar.push({ strateji: ad, ad: s.ad, olcu, kayit: kv, yeni: +y[olcu].toFixed(4), fark: +fark.toFixed(4) });
    }
  }
  return { tutarli: farklar.length === 0, farklar, donem: olcum && olcum.donem ? olcum.donem : null };
}
/** Eski ↔ yeni kol önbelleği: eski dönemdeki günlük getirisi değişen günler (Donchian eğrisi) + yeni eklenen gün sayısı. */
function kolTarihFarki(eski, yeni) {
  const getiri = e => { const ts = e.don.egri.map(x => x[0]).sort((a, b) => a - b), m = new Map(e.don.egri); const r = new Map(); for (let i = 1; i < ts.length; i++) r.set(ts[i], m.get(ts[i]) / m.get(ts[i - 1]) - 1); return { r, son: ts[ts.length - 1] }; };
  const a = getiri(eski), b = getiri(yeni);
  let n = 0, ilk = null, son = null, enB = 0, enBT = null;
  for (const [t, x] of a.r) {
    if (!b.r.has(t)) continue;
    const f = Math.abs(b.r.get(t) - x);
    if (f > 1e-9) { n++; if (ilk == null || t < ilk) ilk = t; if (son == null || t > son) son = t; if (f > enB) { enB = f; enBT = t; } }
  }
  const yeniGun = [...b.r.keys()].filter(t => t > a.son).length;
  return { degisenGun: n, ilk: ilk == null ? null : isoGun(ilk), son: son == null ? null : isoGun(son), enBuyukPuan: +(enB * 100).toFixed(4), enBuyukGun: enBT == null ? null : isoGun(enBT), yeniGun };
}
const sonJson = s => { const l = String(s || '').trim().split('\n').filter(x => x.trim().startsWith('{')); return l.length ? JSON.parse(l[l.length - 1]) : null; };

let _db = null;
function okuDb() {
  if (_db) return _db;
  const { DatabaseSync } = require('node:sqlite');
  _db = new DatabaseSync(yollar.veri('market.db'), { readOnly: true });
  return _db;
}
const tradfi = () => require('./tradfi');
const tabanUygun = taban => !STABIL.test(taban) && !tradfi().tradfiMi(taban + '/USDT:USDT');

/** Ay başı M → o ayın PIT ilk-K'sı (son 30 günün ortalama $ hacmi; pitVeri.evrenKur ile aynı ölçüt; stabil + TradFi hariç). */
function pitIlk(db, ayBasi, K = 15, sonGun = ayBasi) {
  const rows = db.prepare(`SELECT symbol, SUM(volume*close) v, COUNT(*) n FROM candles WHERE venue='binance' AND market='perp' AND timeframe='1d' AND time>=? AND time<? GROUP BY symbol ORDER BY v DESC LIMIT 80`)
    .all(sonGun - 30 * GUN, sonGun);
  return rows.filter(r => r.n >= 25 && tabanUygun(r.symbol.split('/')[0])).slice(0, K).map(r => r.symbol);
}
const ayBasi = (t, k = 0) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1); };

/** binance-market-db veri günü: bu ayın PIT ilk-15'inin perp 1d son günlerinin EN ESKİSİ (kol bunlarla kurulur). */
function binanceVeriGunu() {
  const db = okuDb();
  const ilk = pitIlk(db, ayBasi(Date.now()));
  if (!ilk.length) return null;
  const q = db.prepare(`SELECT MAX(time) s FROM candles WHERE venue='binance' AND market='perp' AND symbol=? AND timeframe='1d'`);
  return isoGun(Math.min(...ilk.map(s => q.get(s).s || 0)));
}

async function binanceSembolleri(kota = new BinanceKota()) {
  const db = okuDb();
  const perp = new Set(['BTC/USDT']), kaynak = { izleme: 0, pit: 0, hacim24s: 0 }, notlar = [];
  const ekle = (s, tur) => { const t = s.split('/')[0]; if (!tabanUygun(t)) return; if (!perp.has(t + '/USDT')) { perp.add(t + '/USDT'); kaynak[tur]++; } };
  let izleme = [];
  try {
    const c = require('../ayarlar').oku(KOK);      // YALNIZ OKUNUR (68.0: varsayılan ⊕ ayarlar.json; eski kurulumda config.json)
    izleme = (c.watchlist || []).map(x => (typeof x === 'string' ? x : x && x.symbol)).filter(s => /^[A-Z0-9]+\/USDT$/.test(String(s || '')));
  } catch (e) { notlar.push('ayarlar okunamadı: ' + e.message); }
  izleme.forEach(s => ekle(s, 'izleme'));
  const simdi = Date.now();
  for (const k of [-2, -1, 0]) pitIlk(db, ayBasi(simdi, k)).forEach(s => ekle(s.replace(':USDT', ''), 'pit'));
  pitIlk(db, null, 15, simdi).forEach(s => ekle(s.replace(':USDT', ''), 'pit'));
  try {
    // Tüm semboller ticker'ı: ağırlık 40 (koşu başına bir kez); kota denetimli.
    const j = await kota.istek('perp', null, async () => {
      const r = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr', { signal: AbortSignal.timeout(30000) });
      kota.agirlikYaz('perp', r.headers.get('x-mbx-used-weight-1m'));
      if (!r.ok) { const e = new Error(`HTTP ${r.status} /fapi/v1/ticker/24hr`); e.retryAfter = r.headers.get('retry-after'); throw e; }
      return r.json();
    });
    const l = j.filter(x => /^[A-Z0-9]+USDT$/.test(x.symbol)).sort((a, b) => +b.quoteVolume - +a.quoteVolume);
    let n = 0;
    for (const x of l) { if (n >= 30) break; const t = x.symbol.slice(0, -4); if (!tabanUygun(t)) continue; n++; ekle(t + '/USDT', 'hacim24s'); }
  } catch (e) { if (e instanceof KotaHatasi) throw e; notlar.push('24 saatlik hacim listesi alınamadı: ' + e.message); }
  const spotDb = db.prepare(`SELECT symbol FROM candles WHERE venue='binance' AND market='spot' AND timeframe='1d' GROUP BY symbol`).all().map(r => r.symbol);
  const spot = [...new Set([...izleme, ...spotDb])].filter(s => /\/USDT$/.test(s) && !STABIL.test(s.split('/')[0]));
  return { perp: [...perp], spot, kaynak, notlar };
}

/**
 * Binance günlük mum + funding (artımlı). Her istek BinanceKota'dan geçer (ağırlık bütçesi, 418/429 → kalıcı bekleme,
 * adım HEMEN durur). Bağımlılıklar test için enjekte edilebilir: { kota, st, ex, exSpot, sem, simdi }.
 * Artımlı istek: son mumdan sonrası, limit 99 (USDⓈ-M klines ağırlığı 1); güncel sembole hiç istek atılmaz; yeni
 * sembolde 2017'den sayfalı (limit 1000). Açık (kapanmamış) gün mumu YAZILMAZ. Funding: son kayıt 4 saatten eskiyse.
 */
async function binanceGuncelle({ ilerleme, bekleme, kota, st, ex, exSpot, sem, simdi } = {}) {
  const aralik = require('./aralik');
  kota = kota || new BinanceKota({ bekleme });
  kota.kontrol();                                   // bekleme sürüyorsa hiç istek atmadan çık
  const sahip = !st;
  if (!st) { const { CandleStore } = require('../candleStore'); st = new CandleStore(yollar.veri('market.db')); }
  const venues = !ex || !exSpot ? require('../venues') : null;
  ex = ex || venues.client('binance', 'perp');
  const KY = { venue: 'binance', market: 'perp' };
  let yeniMum = 0, yeniFunding = 0;
  const hata = {}, yok = [];
  try {
    sem = sem || await binanceSembolleri(kota);
    if (!ex.markets) await kota.istek('perp', ex, () => ex.loadMarkets());
    simdi = simdi || Date.now();
    const sonKapanan = Math.floor(simdi / GUN) * GUN - GUN;
    const parca = async (market, s, i, n) => {
      if (ilerleme) ilerleme(`${market} ${s} (${i + 1}/${n})`);
      const cl = market === 'perp' ? ex : exSpot;
      const ds = aralik.depoSembolu(s, market);
      const kay = { venue: 'binance', market };
      const once = st.stats(ds, '1d', kay);
      if (!(once.lastTime >= sonKapanan)) {
        const limit = once.lastTime != null ? 99 : 1000;
        let imlec = once.lastTime != null ? once.lastTime + GUN : Date.UTC(2017, 0, 1);
        for (let sayfa = 0; sayfa < 20 && imlec <= sonKapanan; sayfa++) {
          const bas = imlec;
          const ham = await kota.istek(market, cl, () => cl.fetchOHLCV(ds, '1d', bas, limit));
          if (!ham || !ham.length) break;
          const mumlar = ham.filter(c => c[0] >= bas && c[0] <= sonKapanan).map(c => ({ time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] }));
          if (mumlar.length) st.saveCandles(ds, '1d', mumlar, kay);
          const son = ham[ham.length - 1][0];
          if (ham.length < limit || !(son >= bas)) break;
          imlec = son + GUN;
        }
        yeniMum += Math.max(0, st.stats(ds, '1d', kay).count - once.count);
      }
      if (market === 'perp') {
        const f0 = st.fundingStats(ds, KY);
        if (!(f0.lastTime >= simdi - 4 * 3600e3)) {
          let imlec = f0.lastTime != null ? f0.lastTime + 1 : simdi - 6 * 365 * GUN;
          const harita = new Map();
          for (let sayfa = 0; sayfa < 40; sayfa++) {
            const bas = imlec;
            const p = await kota.istek('perp', ex, () => ex.fetchFundingRateHistory(ds, bas, 1000));
            if (!p || !p.length) break;
            for (const f of p) { const t = Number(f.timestamp), r = Number(f.fundingRate); if (Number.isFinite(t) && Number.isFinite(r)) harita.set(t, r); }
            const son = Number(p[p.length - 1].timestamp);
            if (p.length < 1000 || !(son >= bas) || son >= simdi - 3600e3) break;
            imlec = son + 1;
          }
          if (harita.size) {
            st.saveFunding(ds, [...harita].map(([time, rate]) => ({ time, rate })).sort((a, b) => a.time - b.time), KY);
            yeniFunding += Math.max(0, st.fundingStats(ds, KY).count - f0.count);
          }
        }
      }
    };
    const isler = [...sem.perp.map(s => ['perp', s]), ...sem.spot.map(s => ['spot', s])];
    let spotHazir = false;
    for (let i = 0; i < isler.length; i++) {
      const [market, s] = isler[i];
      try {
        if (market === 'perp' && !ex.markets[aralik.depoSembolu(s, 'perp')]) { yok.push(s); continue; }
        if (market === 'spot' && !spotHazir) {
          exSpot = exSpot || venues.client('binance', 'spot');
          if (!exSpot.markets) await kota.istek('spot', exSpot, () => exSpot.loadMarkets());
          spotHazir = true;
        }
        if (market === 'spot' && !exSpot.markets[s]) { yok.push(s + ' (spot)'); continue; }
        await parca(market, s, i, isler.length);
      } catch (e) {
        if (e instanceof KotaHatasi) { e.message += ` (bu koşuda ${yeniMum} mum, ${yeniFunding} funding kaydedildi; ${kota.istekSayisi} istek)`; throw e; }
        hata[`${market}:${s}`] = String(e.message || e).slice(0, 160);
      }
    }
    const denenen = isler.length - yok.length;
    if (denenen && Object.keys(hata).length >= denenen) throw new Error('tüm Binance istekleri başarısız: ' + Object.values(hata)[0]);
    return { degisti: yeniMum + yeniFunding > 0,
      ayrinti: { perp: sem.perp.length, spot: sem.spot.length, secim: sem.kaynak, yeniMum, yeniFunding, borsadaYok: yok, hata, notlar: sem.notlar, kota: kota.ozet() } };
  } finally { if (sahip) { try { st.close(); } catch (e) { /* yoksay */ } } }
}

/** Kol önbelleği dosyası (bindirme.js / kaynaklar.js ile aynı ad kuralı). */
const kolDosya = () => yollar.veri('arastirma', process.env.ONBELLEK_DOSYA || 'capraz-marj-onbellek.json');
function kolSonGun() {
  return dosyadan(kolDosya(), p => {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    let m = 0; for (const [t] of j.don.egri) if (t > m) m = t;
    return m ? isoGun(m) : null;
  });
}

function yahooSemboller() {
  const gv = require('../ileri/bollingerIzleme').YAHOO_VARLIKLAR.map(x => x[0]);
  const gvS = new Set(gv);
  const { ENDEKS, ETF } = require('../../scripts/nasdaq-indir');
  const KAT = require('../portfoy/katalog');
  const yv = KAT.ara({ kaynak: 'yahoo' });
  const nasdaqMi = v => v.ek.dizin === 'nasdaq' || (v.ek.yedekKaynaklar || []).some(x => x.startsWith('nasdaq/'));
  const enYeni = yv.reduce((m, v) => (v.sonTarih > m ? v.sonTarih : m), '');
  const sinir = enYeni ? isoGun(Date.parse(enYeni) - 10 * GUN) : '';
  const sabit = new Set([...ENDEKS, ...ETF]);
  const nasdaq = new Set([...sabit].filter(s => !gvS.has(s)));
  const canliDisi = [];
  for (const v of yv) {
    const s = v.ek.sembol;
    if (gvS.has(s) || !nasdaqMi(v) || nasdaq.has(s)) continue;
    if (v.sonTarih >= sinir || (v.etiketler || []).includes('nasdaq-100-guncel')) nasdaq.add(s); else canliDisi.push(s);
  }
  // Portföy tasarımcısı (F2): son ANLIK Nasdaq-100 üyelik görüntüsünün (data/tasarimci/uyelik/YYYY-MM.json) üyeleri de
  // indirilir — endekse yeni giren hisse (katalogda henüz yoksa) M10 kararından önce elde olsun (ör. WBD). Görüntü yoksa
  // (ya da okunamazsa) liste eskisiyle birebir.
  const uyelikEk = [];
  try {
    const UY = require('../tasarimci/uyelik');
    const aylar = UY.anlikAylar();
    if (aylar.length) for (const s of (UY.anlikOku(aylar[aylar.length - 1]) || {}).uyeler || []) if (!gvS.has(s) && !nasdaq.has(s)) { nasdaq.add(s); uyelikEk.push(s); }
  } catch (e) { /* üyelik görüntüsü okunamadı — varsayılan liste */ }
  const portfoy = new Set(yv.filter(v => v.ek.dizin === 'yahoo' && !gvS.has(v.ek.sembol) && !nasdaq.has(v.ek.sembol) && !nasdaqMi(v)
    && !(v.ek.yedekKaynaklar || []).some(x => x.startsWith('gercek-varlik/'))).map(v => v.ek.sembol));
  portfoy.add('^IRX');
  return { gv, nasdaq: [...nasdaq].sort(), portfoy: [...portfoy].sort(), canliDisi: canliDisi.filter(x => !nasdaq.has(x)), uyelikEk: uyelikEk.sort() };
}

async function yahooKaynakGuncelle(semboller, ilerleme, { dizin = null } = {}) {
  const I = require('../portfoy/indir');
  const r = await I.yahooToplu(semboller, { ara: 400, ilerleme: (i, n, s) => ilerleme && ilerleme(`${s} (${i + 1}/${n})`), ...(dizin ? { dizin } : {}) });
  return { degisti: r.yeniGun > 0 || r.tam > 0, ayrinti: { sembol: r.sembol, tamam: r.tamam, artimli: r.artimli, tam: r.tam, yeniGun: r.yeniGun, hataSayisi: Object.keys(r.hata).length, hata: r.hata } };
}

/**
 * Portföy tasarımcısı BIST M10 havuzu (scripts/bist-indir.js GUNCEL + ESKI) + XU030 → data/portfoy/yahoo-bist (ayrı klasör:
 * portföy kataloğu yalnız yahoo / nasdaq / gercek-varlik klasörlerini listeler → Laboratuvar'a 100 BIST hissesi düşmez).
 * ^GSPC (NYSE takvimi) zaten 'yahoo-gercek-varlik'te, ^IRX 'yahoo-portfoy'de, Nasdaq-100 hisseleri 'yahoo-nasdaq'ta.
 */
function bistSemboller() {
  const { GUNCEL, ESKI } = require('../../scripts/bist-indir');
  return [...new Set([...GUNCEL, ...ESKI])].map(s => s + '.IS').concat(['XU030.IS']);
}
const bistDizin = () => require('../portfoy/ortak').yollar().yahooBist;
/** XU030.IS'in son TAMAMLANMIŞ günü (indirme o günün 19:00 İstanbul'undan önceyse önceki gün). */
function bistSonGun() {
  return dosyadan(path.join(bistDizin(), 'XU030.IS.json'), p => {
    const j = JSON.parse(fs.readFileSync(p, 'utf8')), g = (j.gunler || []).filter(x => x.c > 0);
    if (!g.length) return null;
    const son = isoGun(g[g.length - 1].t), ind = Date.parse(j.indirme || '');
    if (Number.isFinite(ind) && g.length > 1) { const [y, a, gg] = son.split('-').map(Number); if (ind < yereldenUtc(y, a, gg, 19, 0, 'Europe/Istanbul')) return isoGun(g[g.length - 2].t); }
    return son;
  });
}

/** Varsayılan kayıt defteri (gerçek kaynaklar). Sıra = eşitlikte çalıştırma sırası. */
function varsayilanKaynaklar() {
  const PY = () => require('../portfoy/ortak').yollar();
  const I = () => require('../portfoy/indir');
  const pv = () => require('../research/portfoyVeri');
  const ISTANBUL = 'Europe/Istanbul', NY = 'America/New_York';
  const yahooKural = { tur: 'isgunu', tz: NY, saat: 18, dakika: 0 };
  return [
    {
      ad: 'binance-tradfi-listesi', kisaAd: 'TradFi listesi', grup: 'Binance',
      aciklama: 'Binance USDⓈ-M TradFi (altın, petrol, hisse, ETF) perp listesi → referans/binance-tradfi-semboller.json (scripts/nasdaq-erisim.js). Kripto evrenlerinden hariç tutulur (lib/veri/tradfi.js).',
      tazelik: { tur: 'haftalik', tz: 'UTC', gun: 1, saat: 3, dakika: 0 }, bagimliliklar: [],
      hizSiniri: 'haftada bir; Binance genel uçlar (exchangeInfo, ticker, premiumIndex, fundingInfo) + api.nasdaq.com + 6 borsa; alt süreç, en çok 10 dk',
      veriGunu: () => dosyadan(tradfi().DOSYA, p => String(JSON.parse(fs.readFileSync(p, 'utf8')).olusturma || '').slice(0, 10) || null, 'gun'),
      tahminiSonBasari: () => dosyadan(tradfi().DOSYA, p => JSON.parse(fs.readFileSync(p, 'utf8')).olusturma || null, 'zaman'),
      izlenenDosya: () => tradfi().DOSYA, onbellekDusur: () => tradfi().sifirla(), binanceApi: true,
      guncelle: async ({ bekleme } = {}) => {
        const once = new Set(tradfi().tabanlar());
        const kota = new BinanceKota({ bekleme });
        kota.kontrol();
        try { await cocukKos('scripts/nasdaq-erisim.js', [], { timeoutMs: 10 * 60e3 }); } catch (e) { kota.hataIsle(e, null); throw e; }
        tradfi().sifirla();
        const sonra = tradfi().tabanlar();
        const yeni = [...sonra].filter(x => !once.has(x)), cikan = [...once].filter(x => !sonra.has(x));
        return { degisti: yeni.length + cikan.length > 0, ayrinti: { sembol: sonra.size, yeni, cikan } };
      },
    },
    {
      ad: 'binance-pit-arsiv', kisaAd: 'PIT arşivi', grup: 'Binance',
      aciklama: 'data.binance.vision aylık USDⓈ-M perp günlük mum + funding arşivi, listeden çıkanlar DAHİL (scripts/arsiv-indir.js) → data/market.db. Nokta-zamanlı (PIT) evrenin tabanı; ay biter bitmez gelir.',
      tazelik: { tur: 'aylik', tz: 'UTC', gun: 2, saat: 6, dakika: 0 }, bagimliliklar: [],
      beklenenVeriGunu: b => { const d = new Date(b.yayin); return isoGun(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)); },
      pahaliVeriGunu: true,
      veriGunu: () => {   // en çok sembolün ortak son günü (REST ile öne geçen ~40 aday hariç kalır)
        const r = okuDb().prepare(`SELECT s, COUNT(*) n FROM (SELECT symbol, MAX(time) s FROM candles WHERE venue='binance' AND market='perp' AND timeframe='1d' GROUP BY symbol) GROUP BY s ORDER BY n DESC LIMIT 1`).get();
        return r && r.s ? isoGun(r.s) : null;
      },
      hizSiniri: 'ayda bir; S3 listeleme + aylık zip (10 sembol × 8 dosya eş zamanlı; Binance API ağırlığı YOK); yalnız eksik aylar; alt süreç, en çok 2 saat',
      enAzAralikMs: 6 * 3600e3,
      guncelle: async () => {
        const r = await cocukKos('scripts/arsiv-indir.js', [], { timeoutMs: 2 * 3600e3 });
        const m = r.stdout.match(/BİTTİ: (\d+) sembol · (\d+) gün · (\d+) hata · ([\d.]+) dk/);
        const ayrinti = m ? { sembol: +m[1], yeniGun: +m[2], hata: +m[3], dk: +m[4] } : { cikti: r.stdout.trim().split('\n').slice(-2).join(' | ') };
        if (m && +m[3] > 0 && +m[3] >= +m[1]) throw new Error(`arşiv: tüm semboller hatalı (${m[3]})`);
        return { degisti: m ? +m[2] > 0 : true, ayrinti };
      },
    },
    {
      ad: 'binance-market-db', kisaAd: 'Binance günlük', grup: 'Binance',
      aciklama: 'Binance USDⓈ-M perp + spot GÜNLÜK mum ve funding (REST, artımlı) → data/market.db. Semboller: izleme listesi + Kairos evreni (bu ve önceki 2 ayın PIT ilk-15\'i + son 30 günün ilk-15\'i) + 24 saatlik hacimde ilk 30 USDT perp (stabil ve TradFi hariç) + BTC; spot: izleme listesi + depoda spot günlüğü olanlar. Veri günü = bu ayın PIT ilk-15\'inin en geride kalanı.',
      tazelik: { tur: 'gunluk', tz: 'UTC', saat: 0, dakika: 30 }, bagimliliklar: ['binance-tradfi-listesi', 'binance-pit-arsiv'],
      pahaliVeriGunu: true, veriGunu: binanceVeriGunu,
      hizSiniri: 'IP ağırlık bütçesi (X-MBX-USED-WEIGHT-1M, canlı bot dahil): canlı kipte (ARASTIRMA_MODU yok) %25 = 600/dk, istekler arası 1 sn, koşu başına ≤ 600 istek; araştırma kipinde %50, 250 ms. 429/418 → adım durur, Retry-After (yoksa 2 dk / 2 saat) boyunca hiçbir Binance kaynağı istek atmaz. Sembol başına artımlı 1 mum isteği (limit 99, ağırlık 1) + funding (son kayıt 4 saatten eskiyse); güncel sembole istek yok. Canlı botun kendi okumalarına dokunmaz.',
      enAzAralikMs: 30 * 60e3, binanceApi: true,
      guncelle: ({ ilerleme, bekleme }) => binanceGuncelle({ ilerleme, bekleme }),
    },
    {
      ad: 'kol-onbellegi', kisaAd: 'Kol önbelleği', grup: 'Türetilmiş',
      aciklama: 'Kalkan kolu bileşenleri (Donchian PIT + DCA PIT) → data/arastirma/capraz-marj-onbellek.json (ONBELLEK=1 SADECE_ONBELLEK=1 node scripts/capraz-marj-sim.js; yeni dosya önce .yeni.json\'a kurulur, sonra yerine geçer, eskisi .onceki.json). Hücum/Denge serileri ve backtest "botun tamamı" kutusu bundan türer.',
      tazelik: { tur: 'bagimli' }, bagimliliklar: ['binance-market-db', 'binance-pit-arsiv', 'binance-tradfi-listesi'],
      veriGunu: kolSonGun, tahminiSonBasari: () => mtimeIso(kolDosya()),
      ekBayat: (vg) => { const a = kolSonGun(), b = vg('binance-market-db'); return a && b && a < b ? `kol ${a}'te bitiyor, piyasa verisi ${b}` : null; },
      hizSiniri: 'ağsız; CPU ağır alt süreç (en çok 60 dk); bağımlılık değişince bir kez',
      izlenenDosya: kolDosya, onbellekDusur: () => require('../research/bindirme').onbellekTemizle(),
      guncelle: async () => {
        const hedef = kolDosya(), adYeni = path.basename(hedef).replace(/\.json$/, '') + '.yeni.json';
        const yeni = path.join(path.dirname(hedef), adYeni);
        try { fs.unlinkSync(yeni); } catch (e) { /* yok */ }
        const r = await cocukKos('scripts/capraz-marj-sim.js', [], { env: { ONBELLEK: '1', SADECE_ONBELLEK: '1', ONBELLEK_DOSYA: adYeni }, timeoutMs: 60 * 60e3 });
        const j = JSON.parse(fs.readFileSync(yeni, 'utf8'));
        if (!j.don || !Array.isArray(j.don.egri) || !j.don.egri.length || !Array.isArray(j.segler)) throw new Error('kol önbelleği beklenen biçimde değil — eski dosya korundu');
        // Kayıtlı ölçüm mutabakatı (YENİ önbellekle, alt süreç) + eski önbelleğe göre tarihsel değişim: sessiz geçmez.
        let kayit = null, tarih = null;
        try {
          const m = await cocukKos('scripts/kol-kayit-mutabakat.js', [], { env: { ONBELLEK_DOSYA: adYeni }, timeoutMs: 10 * 60e3 });
          kayit = kayitKarsilastir(sonJson(m.stdout), require('../research/bindirme').STRATEJILER);
        } catch (e) { kayit = { tutarli: null, hata: String(e.message).slice(0, 200) }; }
        if (fs.existsSync(hedef)) { try { tarih = kolTarihFarki(JSON.parse(fs.readFileSync(hedef, 'utf8')), j); } catch (e) { tarih = { hata: e.message.slice(0, 120) }; } }
        if (fs.existsSync(hedef)) fs.copyFileSync(hedef, hedef.replace(/\.json$/, '') + '.onceki.json');
        fs.renameSync(yeni, hedef);
        const mut = (r.stdout.match(/MUTABAKAT 1[^\n]*/) || [''])[0].trim();
        const takvim = (r.stdout.match(/takvim [^\n]*/) || [''])[0].trim();
        const uyari = [];
        if (kayit && kayit.tutarli === false) {
          uyari.push(`bindirme.js kayıtlı ölçümüyle tutmuyor (${kayit.donem ? kayit.donem.bas + ' → ' + kayit.donem.bit : 'kayıt dönemi'}): `
            + kayit.farklar.map(f => `${f.ad || f.strateji} ${f.olcu} ${f.kayit} → ${f.yeni}`).join(', '));
        }
        if (kayit && kayit.tutarli == null) uyari.push('kayıtlı ölçümle karşılaştırılamadı: ' + (kayit.hata || '?'));
        if (tarih && tarih.degisenGun) uyari.push(`eski önbelleğe göre ${tarih.degisenGun} geçmiş günün getirisi değişti (${tarih.ilk} → ${tarih.son}; en büyük ${tarih.enBuyukPuan} puan, ${tarih.enBuyukGun}); önceki dosya .onceki.json`);
        return { degisti: true, uyari: uyari.length ? uyari.join(' · ') : null,
          ayrinti: { segment: j.segler.length, mutabakat: mut, takvim, kayitMutabakati: kayit, tarihselFark: tarih } };
      },
    },
    {
      ad: 'usdtry', kisaAd: 'USD/TRY', grup: 'Türkiye',
      aciklama: 'USDTRY=X günlük (Yahoo v8) → data/portfoy/USDTRY_X.json (lib/portfoy/indir.js kurIndir). TL birimi ve TL varlıkların USD karşılığı.',
      tazelik: { tur: 'isgunu', tz: ISTANBUL, saat: 23, dakika: 30 }, bagimliliklar: [],
      veriGunu: () => dosyadan(PY().usdtry, p => { const g = JSON.parse(fs.readFileSync(p, 'utf8')).gunler; return g.length ? isoGun(g[g.length - 1].t) : null; }),
      tahminiSonBasari: () => mtimeIso(PY().usdtry), hizSiniri: 'tek istek',
      guncelle: async () => ({ ayrinti: await I().kurIndir() }),
    },
    {
      ad: 'evds-mevduat', kisaAd: 'TL mevduat (EVDS)', grup: 'Türkiye',
      aciklama: 'TCMB EVDS TP.TRY.MT01/MT02/MT06 haftalık TL mevduat faizi → data/portfoy/evds-mevduat.json (indir.js evdsMevduatIndir). Yayın günü yaklaşık (Cuma).',
      tazelik: { tur: 'haftalik', tz: ISTANBUL, gun: 5, saat: 15, dakika: 30 }, bagimliliklar: [],
      veriGunu: () => dosyadan(PY().evds, p => { const m = JSON.parse(fs.readFileSync(p, 'utf8')).MT01 || []; return m.length ? m[m.length - 1].tarih : null; }),
      tahminiSonBasari: () => mtimeIso(PY().evds), hizSiniri: 'tek istek (3 deneme)',
      guncelle: async () => ({ ayrinti: await I().evdsMevduatIndir() }),
    },
    {
      ad: 'tufe', kisaAd: 'TÜFE', grup: 'Türkiye',
      aciklama: 'TÜİK TÜFE 2025=100 (EVDS TP.TUKFIY2025.GENEL, aylık; ayın 3\'ünde 10:00 yayımlanır) → data/portfoy/tufe.json (indir.js tufeIndir). TL-reel birim.',
      tazelik: { tur: 'aylik', tz: ISTANBUL, gun: 3, saat: 11, dakika: 0 }, bagimliliklar: [],
      veriGunu: () => dosyadan(PY().tufe, p => { const a = JSON.parse(fs.readFileSync(p, 'utf8')).aylik || []; return a.length ? a[a.length - 1].ay : null; }),
      tahminiSonBasari: () => mtimeIso(PY().tufe), hizSiniri: 'iki istek (seri + eski seri denetimi)',
      guncelle: async () => { const r = await I().tufeIndir(); return { ayrinti: { ay: r.ay, son: r.son } }; },
    },
    {
      ad: 'tefas', kisaAd: 'TEFAS fonları', grup: 'Türkiye',
      aciklama: 'TEFAS tüm YAT fonları, ham aylar data/portfoy/tefas-ham (5 yıllık kayan pencere; ham dosyalar KALICI, hiç silinmez — pencere kaydıkça eski aylar yerelde kalır) + hazır fon dosyaları (indir.js tefasGuncelle).',
      tazelik: { tur: 'isgunu', tz: ISTANBUL, saat: 20, dakika: 0 }, bagimliliklar: [],
      veriGunu: () => {
        const l = pv().hamAylar();
        if (!l.length) return null;
        return dosyadan(l[l.length - 1], p => { let m = ''; for (const s of pv().hamAyOku(p).satirlar) if (s[1] > m) m = s[1]; return m || null; });
      },
      tahminiSonBasari: () => { const l = pv().hamAylar(); return l.length ? mtimeIso(l[l.length - 1]) : null; },
      hizSiniri: 'istekler arası ≥ 12 sn (TEFAS ~6 istek/dk), 429\'da 65 sn; yalnız eksik / tamamlanmamış aylar',
      guncelle: async () => {
        const r = await I().tefasGuncelle({});
        return { ayrinti: { hamAylar: (r.hamAylar || []).map(x => `${x.ay} +${x.yeniSatir}${x.tam ? ' (tam)' : ''}`), fonDosyasi: r.fonDosyasi } };
      },
    },
    {
      ad: 'yahoo-gercek-varlik', kisaAd: 'Yahoo H2 serileri', grup: 'Yahoo',
      aciklama: 'PLAN-GERCEK-MI-H2\'nin 36 Yahoo serisi (endeksler, emtia vadelileri, tahvil ETF, döviz, kripto) → data/portfoy/yahoo (portföyde öncelikli). data/gercek-varlik araştırma girdisi DEĞİŞMEZ; ileri izleyici kendi indirmesini yapar. Veri günü: ^GSPC.',
      tazelik: yahooKural, bagimliliklar: [],
      veriGunu: () => yahooSonGun('^GSPC'), hizSiniri: 'sıralı, istekler arası 400 ms; artımlı (son 20 gün)',
      guncelle: ({ ilerleme }) => yahooKaynakGuncelle(yahooSemboller().gv, ilerleme),
    },
    {
      ad: 'yahoo-nasdaq', kisaAd: 'Yahoo Nasdaq', grup: 'Yahoo',
      aciklama: 'Nasdaq araştırma evreni: endeks + ETF listesi (scripts/nasdaq-indir.js) + hâlâ işlem gören Nasdaq-100 hisseleri → data/portfoy/yahoo. data/nasdaq (araştırma girdisi, üyelik tablosu dahil) DEĞİŞMEZ. Veri günü: QQQ.',
      tazelik: yahooKural, bagimliliklar: [],
      veriGunu: () => yahooSonGun('QQQ'), hizSiniri: 'sıralı, istekler arası 400 ms; artımlı (son 20 gün; ilk kez tam)',
      guncelle: ({ ilerleme }) => yahooKaynakGuncelle(yahooSemboller().nasdaq, ilerleme),
    },
    {
      ad: 'yahoo-portfoy', kisaAd: 'Yahoo portföy ekleri', grup: 'Yahoo',
      aciklama: 'Portföy laboratuvarında elle eklenen Yahoo serileri (yalnız data/portfoy/yahoo\'da olanlar) + ^IRX (T-bill, nakit getirisi). Veri günü: ^IRX.',
      tazelik: yahooKural, bagimliliklar: [],
      veriGunu: () => yahooSonGun('^IRX'), hizSiniri: 'sıralı, istekler arası 400 ms; artımlı',
      guncelle: ({ ilerleme }) => yahooKaynakGuncelle(yahooSemboller().portfoy, ilerleme),
    },
    {
      ad: 'yahoo-bist', kisaAd: 'Yahoo BIST', grup: 'Yahoo',
      aciklama: 'Portföy tasarımcısı BIST Momentum 10 havuzu (scripts/bist-indir.js güncel + eski BIST 30 üyeleri, .IS) + XU030 → data/portfoy/yahoo-bist (katalog dışı; lib/tasarimci/veri.js canlı kipte data/bist dosyalarından önce okur). data/bist (ölçüm girdisi) DEĞİŞMEZ. Veri günü: XU030.IS.',
      tazelik: { tur: 'isgunu', tz: ISTANBUL, saat: 19, dakika: 0 }, bagimliliklar: [],
      veriGunu: bistSonGun, hizSiniri: 'sıralı, istekler arası 400 ms; artımlı (son 20 gün; ilk kez tam ≈ 100 sembol)',
      guncelle: ({ ilerleme }) => yahooKaynakGuncelle(bistSemboller(), ilerleme, { dizin: bistDizin() }),
    },
    {
      ad: 'katalog-onbellegi', kisaAd: 'Portföy kataloğu', grup: 'Türetilmiş',
      aciklama: 'Portföy varlık kataloğu (data/portfoy/onbellek/katalog.json) + Kairos/Tao/BTC seviye önbellekleri; tüm kaynaklardan türetilir, önceden ısıtılır ki ilk açılış beklemesin.',
      tazelik: { tur: 'bagimli' },
      bagimliliklar: ['binance-market-db', 'binance-tradfi-listesi', 'kol-onbellegi', 'usdtry', 'evds-mevduat', 'tufe', 'tefas', 'yahoo-gercek-varlik', 'yahoo-nasdaq', 'yahoo-portfoy', 'yahoo-bist'],
      veriGunu: () => { const p = PY().katalogOnbellek; const m = mtimeIso(p); return m ? m.slice(0, 10) : null; },
      tahminiSonBasari: () => mtimeIso(PY().katalogOnbellek), hizSiniri: 'ağsız; ≈ 10–60 sn CPU, ALT SÜREÇTE (sunucu / canlı bot olay döngüsü bloklanmaz)',
      guncelle: async () => {
        // ~9 sn senkron CPU: alt süreçte kurulur, disk önbelleklerine yazılır; burada yalnız bellek önbellekleri düşer
        // (katalog.json SİLİNMEZ — gecersizKil('indir'); sonraki istek diskten ~30 ms'de okur).
        const r = await cocukKos('scripts/katalog-isit.js', [], { timeoutMs: 15 * 60e3 });
        I().onbellekleriDusur();
        return { degisti: true, ayrinti: sonJson(r.stdout) };
      },
    },
    {
      ad: 'ileri-bollinger', kisaAd: 'İleri izleyici', grup: 'Harici',
      aciklama: 'Bollinger ileri veri gölge izleyici — KENDİ zamanlamasıyla (açılıştan 1 dk sonra + her gün 00:15 UTC sonrası, server.js) 37 seriyi kendisi indirir. Burada yalnız durumu raporlanır.',
      tazelik: { tur: 'gunluk', tz: 'UTC', saat: 0, dakika: 15 }, bagimliliklar: [],
      veriGunu: () => {
        const p = require('../ileri/bollingerIzleme').dosyalar().son;
        return dosyadan(p, x => { const j = JSON.parse(fs.readFileSync(x, 'utf8')); const b = (j.seriler || []).find(s => s.seri === 'BTC'); return b ? b.sonKapanmis : null; }, 'gun');
      },
      harici: {
        _kanca: null,
        durum() {
          const p = require('../ileri/bollingerIzleme').dosyalar().son;
          const j = dosyadan(p, x => JSON.parse(fs.readFileSync(x, 'utf8')), 'json') || {};
          const h = this._kanca ? this._kanca() || {} : {};
          const eksik = (j.eksik || []).length;
          return { sonBasari: j.zaman || null, sonDeneme: j.zaman || null, sureMs: j.sureMs == null ? null : j.sureMs, calisiyor: !!h.calisiyor,
            hata: h.sonHata || (eksik ? `${eksik} seri indirilemedi` : null), hataZamani: h.sonHata ? new Date().toISOString() : j.zaman || null };
        },
      },
    },
    {
      ad: 'coin-tarama', kisaAd: 'Coin tarama', grup: 'Harici',
      aciklama: 'İleriye dönük günlük zincir üstü tarama kaydı (lib/tarama, sürüm 60.3): GoPlus / RugCheck / DexScreener / RDAP / borsa fiyatı → data/tarama/anlik (yalnız eklenir). KENDİ zamanlamasıyla koşar (panel açılınca ve sunucu zamanlayıcısı, son başarılı tarama otomatik aralıktan eskiyse). Burada yalnız durumu raporlanır.',
      tazelik: { tur: 'gunluk', tz: 'UTC', saat: 0, dakika: 0, gecikmeGun: 1 }, bagimliliklar: [],
      veriGunu: () => {
        const p = path.join(process.env.TARAMA_DIZIN || yollar.veri('tarama'), 'durum.json');
        return dosyadan(p, x => { const j = JSON.parse(fs.readFileSync(x, 'utf8')); return j.sonBasari ? String(j.sonBasari).slice(0, 10) : null; }, 'gun');
      },
      harici: {
        _kanca: null,
        durum() {
          if (this._kanca) { try { return this._kanca() || {}; } catch (e) { return { hata: e.message }; } }
          const p = path.join(process.env.TARAMA_DIZIN || yollar.veri('tarama'), 'durum.json');
          const j = dosyadan(p, x => JSON.parse(fs.readFileSync(x, 'utf8')), 'json') || {};
          const t = j.sonTarama || {};
          return { sonBasari: j.sonBasari || null, sonDeneme: j.sonDeneme || null, sureMs: t.sureSn != null ? t.sureSn * 1000 : null, calisiyor: false,
            hata: t.durum === 'hata' ? t.hata : null, hataZamani: t.bit || null };
        },
      },
    },
  ];
}

// ═══ 6. VARSAYILAN ÖRNEK ══════════════════════════════════════════════════════
let _varsayilan = null;
/** Sunucu ve CLI'nin paylaştığı örnek (gerçek kaynaklar, data/veri-durum.json). */
function varsayilan({ log } = {}) {
  if (!_varsayilan) _varsayilan = new Orkestrator({ kaynaklar: varsayilanKaynaklar(), log });
  else if (log) _varsayilan.log = log;
  return _varsayilan;
}
/** Harici kaynağa canlı durum kancası bağla (server.js: ileri izleyicinin calisiyor/sonHata'sı). */
function hariciBagla(ad, kanca) {
  const o = varsayilan();
  if (o.k[ad] && o.k[ad].harici) o.k[ad].harici._kanca = kanca;
}

module.exports = {
  kararPenceresiKalanMs,
  yolKisalt, yollariKisalt,
  Orkestrator, varsayilan, varsayilanKaynaklar, hariciBagla, kaynaklariBul, BinanceKota, KotaHatasi, binanceKip, KIP_AYAR,
  // saf / test
  sonBeklenen, bayatlik, kuralMetni, yerel, yereldenUtc, kisalt, cocukKos, kotaKodu,
  _ic: { yahooSemboller, bistSemboller, bistSonGun, binanceSembolleri, binanceGuncelle, pitIlk, yahooTamGun, kayitKarsilastir, kolTarihFarki },
};
