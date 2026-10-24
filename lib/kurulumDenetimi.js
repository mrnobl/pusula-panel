/**
 * KURULUM DENETİMİ (68.3, PLAN-TASIMA F4) — bu bilgisayardaki Pusula kurulumunun yoklaması
 * ═══════════════════════════════════════════════════════════════════════════
 * Tek yerde: zamanlanmış görevler, kısayollar, uyku ayarı, veri yeri ve tür klasörleri, Git + uzak depo, sürüm, port,
 * panel / telefon jetonu, kurulum işareti (PUSULA-KURULUM.json). İki kullanıcı:
 *   · scripts/kur.js — her adımdan önce "zaten tamam mı?" diye bakar (idempotent kurulum);
 *   · Sistem › Kurulum denetimi (GET /api/kurulum-denetimi) — yeşil / kırmızı + "Onar" (POST …/onar → kur.js --adim <ad>).
 * Yoklama HİÇBİR ŞEY DEĞİŞTİRMEZ (dosya yazmaz, klasör açmaz — yollar.veri() bile çağrılmaz: yeni düzende o çağrı tür
 * klasörlerini kurar). "Onar" yalnız açık tıklamayla ve yalnız yerel kademede çalışır; telefon kademesi salt okur.
 *
 * 73.6: PowerShell AÇILMAZ (bkz. windowsYokla). Görev / kısayol / PATH "Onar"ı komutu gösterir, çalıştırmaz.
 *
 * Görev adları, install-*.ps1'deki adlarla AYNI (var olan kurulumlarla tutarlı). `onek` yalnız deneme koşusu içindir
 * (sahte görev adları; gerçek görevler görülmez/değişmez).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFile, execFileSync } = require('child_process');
const yollar = require('./yollar');
const turler = require('./veriTurleri');

const PROGRAM = yollar.PROGRAM;
/** install-*.ps1 sırası = kurulum sırası. `roller`: hangi kurulum türünde beklenir. */
const GOREVLER = [
  { adim: 'gorev-autostart', ad: 'PusulaBot', betik: 'install-autostart.ps1', arg: ['-Tetik', 'Oturum'], baslik: 'Otomatik açılış (oturum açılınca Pusula başlar)', roller: ['kullanici', 'sunucu'] },
  { adim: 'gorev-bekci', ad: 'PusulaBekci', betik: 'install-bekci-gorev.ps1', arg: ['-Oturum'], baslik: 'Bekçi (10 dakikada bir: kapandıysa yeniden başlatır)', roller: ['kullanici', 'sunucu'] },
  { adim: 'gorev-dikkat', ad: 'PusulaDikkatArsiv', betik: 'install-dikkat-gorev.ps1', arg: ['-Oturum'], baslik: 'Coin tarama günlük arşivi (gece)', roller: ['kullanici', 'sunucu'] },
  { adim: 'gorev-guncelleme', ad: 'PusulaGuncelle', betik: 'install-guncelleme-gorev.ps1', arg: ['-Oturum'], baslik: 'Otomatik güncelleme (12:00)', roller: ['kullanici', 'sunucu'] },
  { adim: 'gorev-yedek', ad: 'PusulaYedek', betik: 'install-yedek-gorev.ps1', arg: ['-Oturum'], baslik: 'Günlük yedek (05:30)', roller: ['kullanici', 'sunucu'] },
  { adim: 'gorev-yedek-usb', ad: 'PusulaYedekUSB', betik: 'install-yedek-usb-gorev.ps1', arg: ['-Oturum'], baslik: 'Haftalık USB yedeği (pazar 06:00, F: sürücüsü)', roller: ['sunucu'] },
];
const ROLLER = ['kullanici', 'sunucu'];
/** Görev "hiç çalışmadı" sonuç kodu (SCHED_S_TASK_HAS_NOT_RUN) ve "şu an çalışıyor" (SCHED_S_TASK_RUNNING). */
const HIC_CALISMADI = 267011;
const CALISIYOR = 267009;

const jsonOku = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };
/** Uzun yol (8.3 kısa adlar açılır: C:\Users\ABCDEF~1 → gerçek ad) — görev/kısayol hedefleri uzun yolla kayıtlıdır. */
function uzunYol(p) { try { return fs.realpathSync.native(p); } catch (e) { return path.resolve(p); } }
/** Bir görev/kısayol metni program klasörünü gösteriyor mu (büyük/küçük harf, kısa/uzun ad farkı yok)? */
function programiGosterir(metin, program) { const t = String(metin || '').toLowerCase(); return [uzunYol(program), path.resolve(program)].some(p => t.includes(p.toLowerCase())); }
const ayni = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** Saf: bir çözümde bir parçanın yolu — yollar.yolKur'un YAN ETKİSİZ eşi (yeni düzende işaret/klasör kurmaz). */
function veriYolu(c, ...p) {
  if (c.duzen === 'eski') return path.join(c.kok, ...p);
  const ilk = String(p[0]).split(/[\\/]/)[0];
  return path.join(c.kok, turler.klasor(turler.tur(ilk) || turler.BILINMEYEN_TUR), ...p);
}

function surumOku(program = PROGRAM) {
  try { const m = fs.readFileSync(path.join(program, 'server.js'), 'utf8').match(/const APP_VERSION = '([^']+)'/); return m ? m[1] : null; } catch (e) { return null; }
}

/** Kurulum işareti (PUSULA-KURULUM.json) — yoksa null. */
function isaretOku(program = PROGRAM) { return jsonOku(path.join(program, yollar.KURULUM_ISARETI)); }

/** Bu bilgisayar geliştirme kopyası mı (makine.json arastirmaModu)? */
function gelistirmeMi(c) { const m = jsonOku(veriYolu(c, 'makine.json')); return !!(m && m.arastirmaModu); }

/** Rol: işaretteki; yoksa geliştirme bilgisayarı ya da (işaretsiz eski kurulum) sunucu. */
function rolBul(program, c) {
  const i = isaretOku(program);
  if (i && ROLLER.includes(i.rol)) return i.rol;
  return gelistirmeMi(c) ? 'gelistirme' : 'sunucu';
}

/** Taşınabilir çalışma zamanları (kurulum programının getirdiği): <program>\node\node.exe, <program>\git\cmd\git.exe. */
function tasinabilir(program = PROGRAM) {
  const node = path.join(program, 'node', 'node.exe');
  const git = path.join(program, 'git', 'cmd', 'git.exe');
  return { node: fs.existsSync(node) ? node : null, git: fs.existsSync(git) ? git : null,
    nodeDizin: path.join(program, 'node'), gitDizin: path.join(program, 'git', 'cmd') };
}

/** Kullanılacak git: taşınabilir varsa o, yoksa PATH'teki. Bulunamazsa null. */
function gitBul(program = PROGRAM) {
  const t = tasinabilir(program).git;
  if (t) return t;
  try { execFileSync('git', ['--version'], { stdio: 'ignore', windowsHide: true, timeout: 15000 }); return 'git'; } catch (e) { return null; }
}

function gitBilgi(program = PROGRAM) {
  const git = gitBul(program);
  const r = { git, surum: null, depo: fs.existsSync(path.join(program, '.git')), uzak: null, bas: null, kirli: null };
  if (!git) return r;
  const k = (a) => { try { return execFileSync(git, ['-C', program, ...a], { encoding: 'utf8', windowsHide: true, timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { return null; } };
  r.surum = k(['--version']);
  if (r.depo) {
    r.uzak = k(['remote', 'get-url', 'origin']);
    r.bas = k(['rev-parse', '--short', 'HEAD']);
    const s = k(['status', '--porcelain', '--untracked-files=no']);
    r.kirli = s == null ? null : s.split('\n').filter(Boolean).length;
  }
  return r;
}

/**
 * 73.6 (S01): PowerShell YOK. 68.3–73.5 bu yoklama için gizli `powershell -ExecutionPolicy Bypass` açıyordu — 2026-10-21/22
 * sunucudaki Kaspersky aynı davranış sınıfı yüzünden server.js'i sildi. Şimdi:
 *   · görevler: yalnız `schtasks.exe /query /tn <ad> /fo csv /v /nh` (tek amaçlı, salt okuyan Windows aracı; görev başına bir çağrı);
 *   · kısayollar: .lnk dosyası Node ile okunur (alt süreç yok — `lnkOku`);
 *   · kullanıcı PATH'i: bu sürecin ortamı (alt süreç yok).
 * Okunamayan bilgi "bu bilgisayarda kontrol edilemedi" olur; kılavuzdaki komut kullanıcıya gösterilir (ELLE_KOMUT).
 */
const SCHTASKS = 'schtasks.exe';
/** Saf: PowerShell tek tırnaklı dize (yalnız kullanıcının kendi çalıştırdığı scripts/kur.js betik metni için; burada çalıştırılmaz). */
const psDize = (s) => "'" + String(s).replace(/'/g, "''") + "'";
/** Elle doğrulama komutları (kullanıcı kendi penceresinde çalıştırır; Pusula çalıştırmaz). */
const ELLE_KOMUT = {
  gorev: (ad) => `schtasks /query /tn ${ad} /v /fo list`,
  kisayol: 'masaüstündeki "Pusula" kısayoluna sağ tıklayın › Özellikler › Hedef',
};
/** PowerShell betiği isteyen onarımlar (görev / kısayol kurulumu, PATH yazımı) — panel bunları ÇALIŞTIRMAZ, komutu gösterir. */
function elleOnarKomutu(adim, program = PROGRAM) {
  const g = GOREVLER.find(x => x.adim === adim);
  const kok = `cd /d "${program}"`;
  if (g) return `${kok} && powershell -ExecutionPolicy Bypass -File scripts\\${g.betik}${g.arg.length ? ' ' + g.arg.join(' ') : ''}`;
  if (adim === 'kisayol') return `${kok} && powershell -ExecutionPolicy Bypass -File scripts\\kisayol-kur.ps1 -BaslatMenusu`;
  if (adim === 'yol') return `${kok} && npm run kur -- --adim yol`;
  return null;
}
const PS_GEREKEN = new Set([...GOREVLER.map(g => g.adim), 'kisayol', 'yol']);

/**
 * Saf: Windows kısayol (.lnk, MS-SHLLINK) ayrıştırıcı → { hedef, goreli, klasor, arguman } | null.
 * Yalnız gereken alanlar: LinkInfo (yerel yol; Unicode varsa o) ve StringData (göreli yol, çalışma klasörü, argümanlar).
 */
function lnkOku(b) {
  try {
    if (!Buffer.isBuffer(b) || b.length < 0x4c || b.readUInt32LE(0) !== 0x4c) return null;
    const bayrak = b.readUInt32LE(0x14);
    const unicode = !!(bayrak & 0x80);
    const r = { hedef: null, goreli: null, klasor: null, arguman: null };
    let o = 0x4c;
    if (bayrak & 0x1) o += 2 + b.readUInt16LE(o);                       // LinkTargetIDList
    const csz = (bas, genis) => {                                        // sıfırla biten dize
      let e = bas; const p = [];
      if (genis) { while (e + 1 < b.length) { const c = b.readUInt16LE(e); if (!c) break; p.push(c); e += 2; } return String.fromCharCode(...p); }
      while (e < b.length && b[e]) p.push(b[e++]);
      return Buffer.from(p).toString('latin1');
    };
    if (bayrak & 0x2) {                                                  // LinkInfo
      const boy = b.readUInt32LE(o), bas = b.readUInt32LE(o + 4), lf = b.readUInt32LE(o + 8);
      if (lf & 1) {
        if (bas >= 0x24 && b.readUInt32LE(o + 0x1c)) r.hedef = csz(o + b.readUInt32LE(o + 0x1c), true);
        if (!r.hedef) {
          r.hedef = csz(o + b.readUInt32LE(o + 0x10), false);
          const ek = b.readUInt32LE(o + 0x18);
          if (ek) r.hedef += csz(o + ek, false);
        }
      }
      o += boy;
    }
    const dize = () => { const n = b.readUInt16LE(o); o += 2; const L = unicode ? n * 2 : n; const s = b.slice(o, o + L).toString(unicode ? 'utf16le' : 'latin1'); o += L; return s; };
    if (bayrak & 0x4) dize();                                            // NAME_STRING (açıklama)
    if (bayrak & 0x8) r.goreli = dize();
    if (bayrak & 0x10) r.klasor = dize();
    if (bayrak & 0x20) r.arguman = dize();
    return r;
  } catch (e) { return null; }
}

/** Saf: CSV satırı (schtasks "a","b",…) → alanlar. */
function csvSatir(s) {
  const a = []; let i = 0; s = String(s || '').trim();
  while (i < s.length) {
    if (s[i] === '"') {
      let j = i + 1, v = '';
      while (j < s.length) { if (s[j] === '"' && s[j + 1] === '"') { v += '"'; j += 2; } else if (s[j] === '"') break; else v += s[j++]; }
      a.push(v); i = j + 2;
    } else { const j = s.indexOf(',', i); a.push(j < 0 ? s.slice(i) : s.slice(i, j)); i = j < 0 ? s.length : j + 1; }
  }
  return a;
}

/** Saf: schtasks tarih metni (gg.aa.yyyy ss:dd:ss ya da aa/gg/yyyy ss:dd:ss AM/PM) → yerel ISO benzeri; hiç çalışmadı / N/A → null. */
function schtasksTarih(t) {
  const s = String(t || '').trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  let y, ay, g, sa, dk, sn;
  if (m) [, g, ay, y, sa, dk, sn] = m;
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i))) {
    [, ay, g, y, sa, dk, sn] = m;
    if (m[7]) { let h = Number(sa) % 12; if (/pm/i.test(m[7])) h += 12; sa = String(h); }
  } else return null;
  if (Number(y) < 2000) return null;
  const p = (x) => String(x || 0).padStart(2, '0');
  return `${y}-${p(ay)}-${p(g)}T${p(sa)}:${p(dk)}:${p(sn)}`;
}

/**
 * Saf: `schtasks /query /tn <ad> /fo csv /v /nh` çıktısı → görev kaydı (windowsYokla biçimi). Sütun sırası dil bağımsızdır:
 * 0 HostName · 1 TaskName · 2 Next Run Time · 3 Status · 4 Logon Mode · 5 Last Run Time · 6 Last Result · 7 Author ·
 * 8 Task To Run · 9 Start In · 10 Comment · 11 Scheduled Task State. Birden çok tetikleyicide birden çok satır gelir (ilki yeter).
 */
function schtasksAyristir(ad, cikti) {
  const satir = String(cikti || '').split(/\r?\n/).map(s => s.trim()).find(s => s.startsWith('"'));
  if (!satir) return { ad, var: false };
  const f = csvSatir(satir);
  if (f.length < 12) return { ad, var: false };
  const sonuc = /^-?\d+$/.test(String(f[6]).trim()) ? Number(f[6]) : null;
  const devreDisi = /disabled|devre d/i.test(f[11]) || /disabled|devre d/i.test(f[3]);
  return { ad, var: true, durum: devreDisi ? 'Disabled' : (/running|çalış/i.test(f[3]) ? 'Running' : 'Ready'),
    klasor: /^(N\/A|Yok)$/i.test(f[9]) ? '' : f[9], komut: f[8], oturum: /background|arka plan/i.test(f[4]) ? 'Password' : (f[4] ? 'Interactive' : ''),
    son: schtasksTarih(f[5]), sonuc, sonraki: schtasksTarih(f[2]) };
}

/** Varsayılan komut koşucusu (yalnız schtasks için; kabuk YOK). */
function komutKos(k, a) {
  return new Promise((coz) => {
    try {
      execFile(k, a, { encoding: 'latin1', windowsHide: true, timeout: 20000, maxBuffer: 1 << 20 },
        (e, out, err) => coz({ kod: e ? (typeof e.code === 'number' ? e.code : -1) : 0, cikti: out || '', hata: err || (e && e.message) || '' }));
    } catch (e) { coz({ kod: -1, cikti: '', hata: e.message }); }
  });
}

/** Bir görevi schtasks ile sorgula (salt okur). Görev yoksa { var: false }; araç hiç çalışmadıysa { var: null, hata }. */
async function gorevSorgula(ad, { calistir } = {}) {
  const r = await (calistir || komutKos)(SCHTASKS, ['/query', '/tn', ad, '/fo', 'csv', '/v', '/nh']);
  if (r.kod === 0) return schtasksAyristir(ad, r.cikti);
  if (r.kod === -1 || /ENOENT/.test(String(r.hata || ''))) return { ad, var: null, hata: `schtasks çalışmadı: ${String(r.hata).slice(0, 120)}` };
  return { ad, var: false };   // "ERROR: ... bulunamıyor" = görev yok
}

/** Masaüstü klasörü (OneDrive yönlendirmesi dahil) — alt süreç yok. İlk "Pusula.lnk" içereni, yoksa ilk var olanı seçer. */
function masaustuBul(env = process.env) {
  const ev = env.USERPROFILE || require('os').homedir();
  const od = env.OneDrive || env.OneDriveConsumer || path.join(ev, 'OneDrive');
  const adaylar = [path.join(ev, 'Desktop'), path.join(od, 'Desktop'), path.join(od, 'Masaüstü'), path.join(ev, 'Masaüstü')];
  return adaylar.find(d => fs.existsSync(path.join(d, 'Pusula.lnk'))) || adaylar.find(d => fs.existsSync(d)) || adaylar[0];
}
function baslatMenusuBul(env = process.env) {
  const ad = env.APPDATA || path.join(env.USERPROFILE || require('os').homedir(), 'AppData', 'Roaming');
  return path.join(ad, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Pusula');
}

/**
 * Windows yoklaması (salt okur; PowerShell YOK): görevler (schtasks), masaüstü / Başlat menüsü kısayolu (.lnk okuma),
 * kullanıcı PATH'i (bu sürecin ortamı). o.onek: görev adı öneki (deneme) · o.masaustu / o.baslatKlasor: kısayol klasörü (deneme)
 * · o.calistir: deneme için sahte komut koşucusu.
 */
async function windowsYokla(o = {}) {
  const adlar = GOREVLER.map(g => (o.onek || '') + g.ad);
  const gorevler = (process.platform === 'win32' || o.calistir)
    ? await Promise.all(adlar.map(a => gorevSorgula(a, o)))
    : adlar.map(ad => ({ ad, var: null, hata: 'bu bilgisayar Windows değil' }));
  const okunamayan = gorevler.filter(g => g.var === null);
  const mu = o.masaustu || masaustuBul();
  const bm = o.baslatKlasor || baslatMenusuBul();
  const kisayollar = [path.join(mu, 'Pusula.lnk'), path.join(bm, 'Pusula.lnk')].map((y) => {
    if (!fs.existsSync(y)) return { yol: y, var: false };
    let l = null; try { l = lnkOku(fs.readFileSync(y)); } catch (e) { /* */ }
    return { yol: y, var: true, hedef: l ? [l.hedef, l.klasor, l.arguman].filter(Boolean).join(' ') : '', okunamadi: !l };
  });
  const anahtar = Object.keys(process.env).find(k => k.toLowerCase() === 'path') || 'Path';
  const r = { gorevler: gorevler.map(g => (g.var === null ? { ad: g.ad, var: false, okunamadi: true } : g)), masaustu: mu, baslat: bm, kisayollar,
    kullaniciPath: String(process.env[anahtar] || ''), kaynak: 'schtasks + kısayol dosyası (PowerShell yok)' };
  if (okunamayan.length) r.hata = `bu bilgisayarda kontrol edilemedi (${okunamayan[0].hata}) — kendiniz bakın: ${ELLE_KOMUT.gorev('PusulaBot')}`;
  return r;
}

/** Uyku (prize bağlıyken bekleme) süresi, saniye; 0 = hiç uyumaz. Dil bağımsız: powercfg çıktısındaki son iki onaltılık değer AC, DC. */
function uykuOku() {
  try {
    const c = execFileSync('powercfg', ['/q', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE'], { encoding: 'latin1', windowsHide: true, timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] });
    const h = [...c.matchAll(/:\s*0x([0-9a-f]+)\s*$/gim)].map(m => parseInt(m[1], 16));
    if (h.length < 2) return { ac: null, dc: null };
    return { ac: h[h.length - 2], dc: h[h.length - 1] };
  } catch (e) { return { ac: null, dc: null, hata: e.message }; }
}

/** Panel / telefon jetonu (yan etkisiz; guvenlik.jetonBul ile aynı sıra). */
function jetonYokla(c, env = process.env) {
  if ((env.PANEL_TOKEN || '').length >= 24) return { var: true, kaynak: 'PANEL_TOKEN ortam değişkeni' };
  const s = require('./sirKasasi').okuGuvenli(veriYolu(c, 'secrets.json'), null);   // 69.4 DPAPI
  const panelToken = !!(s && typeof s.panelToken === 'string' && s.panelToken.length >= 24);
  if (panelToken) return { var: true, kaynak: 'secrets.json (panelToken)', panelToken };
  const k = require('./sirKasasi').okuGuvenli(veriYolu(c, 'telefon-jeton.json'), null);   // 69.6 sır kasası
  if (k && typeof k.jeton === 'string' && k.jeton.length >= 24) return { var: true, kaynak: 'telefon-jeton.json', panelToken };
  return { var: false, panelToken };
}

/** Veri yeri ve (yeni düzende) tür klasörleri. */
function veriYokla(c) {
  const var_ = fs.existsSync(c.kok);
  const klasorler = c.duzen === 'yeni' ? turler.TURLER.map(t => ({ tur: t, klasor: turler.klasor(t), var: fs.existsSync(path.join(c.kok, turler.klasor(t))) })) : [];
  const isaret = c.duzen === 'yeni' ? fs.existsSync(path.join(c.kok, yollar.ISARET)) : null;
  return { kok: c.kok, duzen: c.duzen, kaynak: c.kaynak, var: var_, klasorler, isaret,
    tamam: var_ && (c.duzen === 'eski' || (isaret && klasorler.every(k => k.var))) };
}

/**
 * 73.8 (S11) GÖREV SONUÇ KODU SÖZLÜĞÜ — Görev Zamanlayıcı'nın "Son sonuç" kodları sade dille. `onar`: kullanıcının kendi Komut İstemi'nde
 * çalıştıracağı tek komut (elleOnarKomutu — görev betiği yeniden kurulur, parolayı o sorar). Pusula bu komutu kendisi ÇALIŞTIRMAZ.
 */
const GOREV_KODU = {
  0x8007052e: { anlam: 'oturum açılamadı — Windows / Microsoft hesabı parolası değişmiş (görev eski parolayla kayıtlı)', onar: true, ipucu: 'Betik parolayı sorar: bilgisayara PIN ile giriyorsanız PIN DEĞİL, hesap parolasını yazın. Sonra bilgisayarı bir kez yeniden başlatıp Pusula\'nın kendiliğinden açıldığını görün.' },
  0x80070005: { anlam: 'erişim reddedildi (yetki ya da antivirüs engeli)', onar: true, ipucu: 'Antivirüs Pusula klasörünü engellediyse önce istisna ekleyin; sonra görevi yeniden kurun.' },
  0x800710e0: { anlam: 'görev reddedildi (çalıştırma koşulu ya da kullanıcı oturumu uymadı)', onar: true, ipucu: 'Görevi yeniden kurun; sürerse bilgisayar pil / uyku ayarına bakın.' },
  0x41303: { anlam: 'görev henüz hiç çalışmadı', onar: false },
  0x41301: { anlam: 'görev şu an çalışıyor', onar: false },
  0x1: { anlam: 'görev başladı ama betik hata ile bitti (yanlış klasör ya da eksik dosya)', onar: true, ipucu: 'Günlüklere bakın; sürerse görevi yeniden kurun.' },
};
/** Saf: sonuç kodu → { anlam, onar, ipucu } | null. */
function gorevKoduAciklama(sonuc) { return sonuc == null ? null : GOREV_KODU[Number(sonuc) >>> 0] || null; }

/** Görev satırının durumu (saf). `adim` (73.8): bilinen kodda tek komutluk düzeltme yolu için. */
function gorevDurumu(g, beklenir, program, adim = null) {
  if (!g || !g.var) return beklenir ? { durum: 'kotu', ayrinti: 'kurulu değil' } : { durum: 'bilgi', ayrinti: 'kurulu değil (bu kurulum türünde beklenmez)' };
  const yer = `${g.klasor || ''} ${g.komut || ''}`;
  if (!programiGosterir(yer, program)) return { durum: 'kotu', ayrinti: `başka bir klasörü gösteriyor: ${(g.klasor || g.komut || '').slice(0, 160)}` };
  const son = g.son ? `son çalışma ${g.son.slice(0, 16).replace('T', ' ')}` : 'henüz çalışmadı';
  if (g.sonuc != null && g.sonuc !== 0 && g.sonuc !== HIC_CALISMADI && g.sonuc !== CALISIYOR) {
    const a = gorevKoduAciklama(g.sonuc);
    const komut = a && a.onar && adim ? elleOnarKomutu(adim, program) : null;
    return { durum: 'uyari', onarGerek: !!(a && a.onar), ayrinti: `${son} · sonuç kodu ${g.sonuc} (0x${Number(g.sonuc >>> 0).toString(16)})${a ? ` — ${a.anlam}` : ''}${komut ? `. Düzeltme (bu bilgisayarda Komut İstemi'ni açıp siz çalıştırın): ${komut}` : ''}${a && a.ipucu ? ` · ${a.ipucu}` : ''}` };
  }
  if (g.durum === 'Disabled') return { durum: 'uyari', ayrinti: `devre dışı · ${son}` };
  return { durum: 'iyi', ayrinti: `${son}${g.sonraki ? ` · sonraki ${g.sonraki.slice(0, 16).replace('T', ' ')}` : ''}${g.oturum ? ` · ${g.oturum === 'Password' ? 'oturum açılmasa da' : 'oturum açıkken'}` : ''}` };
}

/**
 * Tam denetim → { program, rol, gelistirme, surum, maddeler: [{ id, grup, baslik, durum: iyi|uyari|kotu|bilgi, ayrinti, onar }], ozet }
 * o.win (deneme: hazır Windows yoklaması) · o.onek · o.masaustu · o.baslatKlasor · o.port · o.saglik (async → bool)
 */
async function denetle(o = {}) {
  const program = o.program || PROGRAM;
  const c = o.cozum || yollar.cozumle(program);
  const rol = o.rol || rolBul(program, c);
  const gelistirme = rol === 'gelistirme';
  const isaret = isaretOku(program);
  const surum = surumOku(program);
  const win = o.win || await windowsYokla(o);
  const m = [];
  const ekle = (id, grup, baslik, durum, ayrinti, onar = null) => m.push({ id, grup, baslik, durum, ayrinti, onar });

  // Program
  ekle('surum', 'Program', 'Sürüm', surum ? 'iyi' : 'kotu', surum ? `Pusula ${surum}` : 'server.js okunamadı');
  if (isaret) ekle('isaret', 'Program', 'Kurulum işareti', isaret.surum === surum ? 'iyi' : 'uyari',
    `${yollar.KURULUM_ISARETI}: ${isaret.rol === 'sunucu' ? 'sunucu' : 'kullanıcı'} kurulumu · ${String(isaret.kurulum || '').slice(0, 10)}${isaret.surum !== surum ? ` · işaretteki sürüm ${isaret.surum} (onar: güncel sürüm yazılır)` : ''}`, isaret.surum !== surum ? 'isaret' : null);
  else ekle('isaret', 'Program', 'Kurulum işareti', 'bilgi', gelistirme ? 'yok — geliştirme bilgisayarı (veri program klasöründe); gerekmez' : c.kaynak === 'eski-data'
    ? 'yok — kurulum programından önceki kurulum (veri program klasöründe); gerekmez'
    : 'yok — veri program klasöründe (geliştirme kopyası)');
  const t = tasinabilir(program);
  ekle('node', 'Program', 'Node.js', 'iyi', `${process.version}${t.node ? ' · taşınabilir (program klasöründe)' : ' · bilgisayarda kurulu'}`);
  const paket = paketlerTamam(program);
  ekle('paketler', 'Program', 'Paketler (node_modules)', paket.tamam ? 'iyi' : 'kotu', paket.tamam ? `${paket.sayi} paket hazır` : `eksik: ${paket.eksik.slice(0, 5).join(', ')}`, paket.tamam ? null : 'paketler');
  ekle('port', 'Program', 'Panel portu', 'bilgi', `http://127.0.0.1:${o.port || process.env.PORT || 3000}`);

  // Veri
  const v = veriYokla(c);
  ekle('veri', 'Veri', 'Veri yeri', v.tamam ? 'iyi' : 'kotu',
    `${v.kok} · ${v.duzen === 'yeni' ? 'yeni düzen (tür klasörleri)' : 'eski düzen (tek klasör)'}${v.duzen === 'yeni' ? ` · ${v.klasorler.filter(k => k.var).length}/${v.klasorler.length} tür klasörü` : ''}${v.var ? '' : ' · klasör yok'}`, v.tamam ? null : 'veri');
  const j = jetonYokla(c, o.env);
  ekle('jeton', 'Veri', 'Panel / telefon jetonu', j.var ? 'iyi' : 'kotu', j.var ? `var (${j.kaynak})` : 'yok — telefondan erişim için gerekir', j.var ? null : 'jeton');

  // Git
  const g = o.git || gitBilgi(program);
  const depo = (isaret && isaret.depo) || null;
  if (!g.git) ekle('git', 'Güncelleme', 'Git', 'kotu', 'Git bulunamadı — güncelleme çalışmaz', 'git');
  else if (!g.depo) ekle('git', 'Güncelleme', 'Git deposu', 'kotu', `${g.surum || 'git'} · program klasörü git deposu değil — güncelleme çalışmaz`, 'git');
  else ekle('git', 'Güncelleme', 'Git ve uzak depo', g.uzak ? (depo && g.uzak !== depo ? 'uyari' : 'iyi') : 'kotu',
    `${g.surum || 'git'} · uzak: ${g.uzak || 'YOK'} · HEAD ${g.bas || '?'}${g.kirli ? ` · ${g.kirli} değiştirilmiş dosya` : ''}${depo && g.uzak && g.uzak !== depo ? ` · beklenen ${depo}` : ''}`, g.uzak ? null : 'git');

  // Görevler
  if (win.hata) ekle('gorevler', 'Görevler', 'Zamanlanmış görevler', 'uyari', `okunamadı: ${win.hata}`);
  for (const gv of GOREVLER) {
    const kayit = win.gorevler.find(x => x.ad === (o.onek || '') + gv.ad);
    const beklenir = !gelistirme && gv.roller.includes(rol);
    const d = kayit && kayit.okunamadi
      ? { durum: 'uyari', ayrinti: `bu bilgisayarda kontrol edilemedi — kendiniz bakın: ${ELLE_KOMUT.gorev((o.onek || '') + gv.ad)}` }
      : gorevDurumu(kayit, beklenir, program, gv.adim);
    ekle(gv.adim, 'Görevler', `${gv.ad} — ${gv.baslik}`, gelistirme && d.durum === 'kotu' ? 'bilgi' : d.durum,
      gelistirme && !(kayit && kayit.var) ? 'geliştirme bilgisayarı — kurulmaz' : d.ayrinti, ((d.durum === 'kotu' || d.onarGerek) && !gelistirme) ? gv.adim : null);
  }
  const kis = win.kisayollar || [];
  // 73.6: .lnk okunamadıysa "başka klasör" (kırmızı) DENMEZ — kontrol edilemedi, ayrıntıda yazar.
  const kisDurum = (k) => !k || !k.var ? null : (k.okunamadi || programiGosterir(k.hedef, program) ? 'iyi' : 'kotu');
  const [ms, bm] = [kis[0], kis[1]];
  const kd = [kisDurum(ms), kisDurum(bm)];
  ekle('kisayol', 'Görevler', 'Kısayollar (masaüstü + Başlat menüsü)', kd.includes('kotu') ? 'kotu' : (kd[0] === 'iyi' && kd[1] === 'iyi') ? 'iyi' : kd[0] === 'iyi' ? 'uyari' : (gelistirme ? 'bilgi' : 'kotu'),
    `masaüstü: ${ms && ms.var ? (kd[0] === 'iyi' ? 'var' : 'başka klasörü gösteriyor') : 'yok'} · Başlat menüsü: ${bm && bm.var ? (kd[1] === 'iyi' ? 'var' : 'başka klasörü gösteriyor') : 'yok'}${kis.some(k => k && k.okunamadi) ? ` · hedef okunamadı — kendiniz bakın: ${ELLE_KOMUT.kisayol}` : ''}`,
    (kd[0] === 'iyi' && kd[1] === 'iyi') || gelistirme && !kd.includes('kotu') ? null : 'kisayol');

  // Uyku
  const u = o.uyku || uykuOku();
  if (u.ac == null) ekle('uyku', 'Bilgisayar', 'Uyku ayarı', 'uyari', 'okunamadı (powercfg)');
  else ekle('uyku', 'Bilgisayar', 'Uyku ayarı (prize bağlıyken)', u.ac === 0 ? 'iyi' : (gelistirme ? 'bilgi' : 'uyari'),
    u.ac === 0 ? 'bilgisayar uykuya geçmez — botlar çalışmaya devam eder' : `${Math.round(u.ac / 60)} dakika sonra uyur — uykudayken botlar çalışmaz`, u.ac === 0 || gelistirme ? null : 'uyku');

  // PATH (yalnız taşınabilir çalışma zamanı varsa anlamlı)
  if (t.node || t.git) {
    const p = String(win.kullaniciPath || '').toLowerCase().split(';').map(s => s.trim().replace(/\\+$/, ''));
    const eksik = [t.node ? t.nodeDizin : null, t.git ? t.gitDizin : null].filter(Boolean).filter(d => !p.includes(d.toLowerCase().replace(/\\+$/, '')));
    ekle('yol', 'Bilgisayar', 'Kullanıcı PATH (taşınabilir Node / Git)', eksik.length ? 'kotu' : 'iyi', eksik.length ? `eksik: ${eksik.join(', ')}` : 'tamam', eksik.length ? 'yol' : null);
  }

  const ozet = { iyi: 0, uyari: 0, kotu: 0, bilgi: 0 };
  for (const x of m) ozet[x.durum]++;
  return { program, rol, gelistirme, surum, veri: v, maddeler: m, ozet, zaman: new Date().toISOString() };
}

/** package.json bağımlılıkları node_modules'ta mı? */
function paketlerTamam(program = PROGRAM) {
  const p = jsonOku(path.join(program, 'package.json')) || {};
  const adlar = Object.keys(p.dependencies || {});
  const eksik = adlar.filter(a => !fs.existsSync(path.join(program, 'node_modules', a, 'package.json')));
  return { tamam: eksik.length === 0, sayi: adlar.length, eksik };
}

/** Onar'ın çalıştırabileceği adımlar (kur.js adım adları). */
const ONARILIR = new Set(['isaret', 'paketler', 'veri', 'jeton', 'git', 'yol', 'kisayol', 'uyku', ...GOREVLER.map(g => g.adim)]);

/** GET /api/kurulum-denetimi · POST /api/kurulum-denetimi/onar { adim } (yalnız yerel kademe; kur.js --adim <ad> --json). */
function router(o = {}) {
  const express = require('express');
  const r = express.Router();
  const log = o.log || (() => {});
  let onarCalisiyor = false;
  r.get('/api/kurulum-denetimi', async (req, res) => {
    try { res.json({ success: true, kademe: req.kademe || 'yerel', ...(await denetle({ port: o.port })) }); }
    catch (e) { res.status(500).json({ success: false, error: String(e.message).slice(0, 300) }); }
  });
  r.post('/api/kurulum-denetimi/onar', express.json({ limit: '2kb' }), (req, res) => {
    if (req.kademe && req.kademe !== 'yerel') return res.status(403).json({ success: false, kademe: req.kademe, error: 'Onar yalnız bu bilgisayardaki panelden yapılır (telefondan salt okunur).' });
    const adim = String((req.body || {}).adim || '');
    if (!ONARILIR.has(adim)) return res.status(400).json({ success: false, error: `Onarılamayan adım: ${adim}` });
    // 73.6 (S01): görev / kısayol / PATH onarımı PowerShell betiği ister — Pusula arka planda PowerShell AÇMAZ (antivirüs).
    // Komut gösterilir; kullanıcı kendi penceresinde çalıştırır.
    if (PS_GEREKEN.has(adim)) {
      const komut = elleOnarKomutu(adim);
      return res.json({ success: false, elle: true, adim, komut,
        error: `Bu onarım bir PowerShell betiği çalıştırır; antivirüs uyumu için Pusula bunu kendisi açmaz. Bu bilgisayarda Komut İstemi'ni (cmd) açıp şunu yazın: ${komut}` });
    }
    if (onarCalisiyor) return res.status(409).json({ success: false, error: 'Bir onarım zaten çalışıyor.' });
    onarCalisiyor = true;
    const c = spawn(process.execPath, [path.join(PROGRAM, 'scripts', 'kur.js'), '--adim', adim, '--json'], { cwd: PROGRAM, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PUSULA_PS_YOK: '1' } });
    let cikti = '';
    c.stdout.on('data', (d) => { cikti += d.toString('utf8'); });
    c.stderr.on('data', (d) => { cikti += d.toString('utf8'); });
    const bitir = (kod) => {
      onarCalisiyor = false;
      let j = null;
      try { j = JSON.parse(cikti.trim().split('\n').filter(s => s.startsWith('{')).pop()); } catch (e) { /* */ }
      log(kod === 0 ? 'INFO' : 'WARN', `🧰 Kurulum denetimi: "${adim}" onarıldı (çıkış ${kod})`);
      res.status(kod === 0 ? 200 : 500).json({ success: kod === 0, adim, sonuc: j, cikti: j ? undefined : cikti.slice(-1500) });
    };
    c.on('error', (e) => { onarCalisiyor = false; res.status(500).json({ success: false, error: e.message }); });
    c.on('close', bitir);
  });
  return r;
}

module.exports = { uzunYol, programiGosterir, GOREVLER, ROLLER, HIC_CALISMADI, GOREV_KODU, gorevKoduAciklama, veriYolu, surumOku, isaretOku, gelistirmeMi, rolBul, tasinabilir, gitBul, gitBilgi, psDize, lnkOku, csvSatir, schtasksTarih, schtasksAyristir, gorevSorgula, elleOnarKomutu, PS_GEREKEN, ELLE_KOMUT,
  windowsYokla, uykuOku, jetonYokla, veriYokla, gorevDurumu, paketlerTamam, denetle, router, ONARILIR };
