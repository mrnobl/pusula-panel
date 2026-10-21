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
 * Görev adları, install-*.ps1'deki adlarla AYNI (var olan kurulumlarla tutarlı). `onek` yalnız deneme koşusu içindir
 * (sahte görev adları; gerçek görevler görülmez/değişmez).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
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

/** PowerShell betiği (stdin'den; -EncodedCommand KULLANILMAZ — sunucudaki antivirüs engelliyor) → stdout. */
function ps(betik, { zamanMs = 60000, env } = {}) {
  return new Promise((coz) => {
    let c;
    try {
      c = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
        { windowsHide: true, env: env || process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) { coz({ kod: -1, cikti: '', hata: e.message }); return; }
    let o = '', h = '';
    const t = setTimeout(() => { try { c.kill(); } catch (e) { /* */ } }, zamanMs);
    c.stdout.on('data', (d) => { o += d.toString('utf8'); });
    c.stderr.on('data', (d) => { h += d.toString('utf8'); });
    c.on('error', (e) => { clearTimeout(t); coz({ kod: -1, cikti: o, hata: e.message }); });
    c.on('close', (kod) => { clearTimeout(t); coz({ kod, cikti: o, hata: h }); });
    c.stdin.end('[Console]::OutputEncoding = [Text.Encoding]::UTF8\n$ErrorActionPreference = "SilentlyContinue"\n' + betik + '\nexit 0\n');
  });
}
const psDize = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/**
 * Windows yoklaması (tek PowerShell çağrısı, salt okur): görevler, masaüstü / Başlat menüsü kısayolu, kullanıcı PATH'i.
 * o.onek: görev adı öneki (deneme) · o.masaustu / o.baslatKlasor: kısayol klasörü (deneme).
 */
async function windowsYokla(o = {}) {
  const adlar = GOREVLER.map(g => (o.onek || '') + g.ad);
  const betik = `
$adlar = @(${adlar.map(psDize).join(',')})
$g = @()
foreach ($a in $adlar) {
  $t = Get-ScheduledTask -TaskName $a -ErrorAction SilentlyContinue
  if ($t) {
    $i = Get-ScheduledTaskInfo -TaskName $a -ErrorAction SilentlyContinue
    $ac = @($t.Actions)[0]
    $son = $null; if ($i -and $i.LastRunTime -and $i.LastRunTime.Year -gt 2000) { $son = $i.LastRunTime.ToString('o') }
    $sonraki = $null; if ($i -and $i.NextRunTime -and $i.NextRunTime.Year -gt 2000) { $sonraki = $i.NextRunTime.ToString('o') }
    $g += [pscustomobject]@{ ad = $a; var = $true; durum = [string]$t.State; klasor = [string]$ac.WorkingDirectory; komut = ([string]$ac.Execute + ' ' + [string]$ac.Arguments); oturum = [string]$t.Principal.LogonType; son = $son; sonuc = $(if ($i) { [int64]$i.LastTaskResult } else { $null }); sonraki = $sonraki }
  } else { $g += [pscustomobject]@{ ad = $a; var = $false } }
}
$mu = ${o.masaustu ? psDize(o.masaustu) : "[Environment]::GetFolderPath('Desktop')"}
$bm = ${o.baslatKlasor ? psDize(o.baslatKlasor) : "(Join-Path ([Environment]::GetFolderPath('Programs')) 'Pusula')"}
$sh = New-Object -ComObject WScript.Shell
$kis = @()
foreach ($y in @((Join-Path $mu 'Pusula.lnk'), (Join-Path $bm 'Pusula.lnk'))) {
  if (Test-Path -LiteralPath $y) { $kis += [pscustomobject]@{ yol = $y; var = $true; hedef = [string]$sh.CreateShortcut($y).TargetPath } } else { $kis += [pscustomobject]@{ yol = $y; var = $false } }
}
[pscustomobject]@{ gorevler = $g; masaustu = $mu; baslat = $bm; kisayollar = $kis; kullaniciPath = [string][Environment]::GetEnvironmentVariable('Path', 'User') } | ConvertTo-Json -Depth 5 -Compress
`;
  const r = await ps(betik, { zamanMs: 90000 });
  try {
    const j = JSON.parse(String(r.cikti).trim().split('\n').filter(s => s.trim().startsWith('{')).pop());
    j.gorevler = [].concat(j.gorevler || []);
    j.kisayollar = [].concat(j.kisayollar || []);
    return j;
  } catch (e) { return { hata: (r.hata || r.cikti || 'PowerShell yanıtı okunamadı').slice(0, 300), gorevler: [], kisayollar: [] }; }
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

/** Görev satırının durumu (saf). */
function gorevDurumu(g, beklenir, program) {
  if (!g || !g.var) return beklenir ? { durum: 'kotu', ayrinti: 'kurulu değil' } : { durum: 'bilgi', ayrinti: 'kurulu değil (bu kurulum türünde beklenmez)' };
  const yer = `${g.klasor || ''} ${g.komut || ''}`;
  if (!programiGosterir(yer, program)) return { durum: 'kotu', ayrinti: `başka bir klasörü gösteriyor: ${(g.klasor || g.komut || '').slice(0, 160)}` };
  const son = g.son ? `son çalışma ${g.son.slice(0, 16).replace('T', ' ')}` : 'henüz çalışmadı';
  if (g.sonuc != null && g.sonuc !== 0 && g.sonuc !== HIC_CALISMADI && g.sonuc !== CALISIYOR) return { durum: 'uyari', ayrinti: `${son} · sonuç kodu ${g.sonuc} (0x${Number(g.sonuc >>> 0).toString(16)})` };
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
    const d = gorevDurumu(kayit, beklenir, program);
    ekle(gv.adim, 'Görevler', `${gv.ad} — ${gv.baslik}`, gelistirme && d.durum === 'kotu' ? 'bilgi' : d.durum,
      gelistirme && !(kayit && kayit.var) ? 'geliştirme bilgisayarı — kurulmaz' : d.ayrinti, (d.durum === 'kotu' && !gelistirme) ? gv.adim : null);
  }
  const kis = win.kisayollar || [];
  const kisDurum = (k) => !k || !k.var ? null : (programiGosterir(k.hedef, program) ? 'iyi' : 'kotu');
  const [ms, bm] = [kis[0], kis[1]];
  const kd = [kisDurum(ms), kisDurum(bm)];
  ekle('kisayol', 'Görevler', 'Kısayollar (masaüstü + Başlat menüsü)', kd.includes('kotu') ? 'kotu' : (kd[0] === 'iyi' && kd[1] === 'iyi') ? 'iyi' : kd[0] === 'iyi' ? 'uyari' : (gelistirme ? 'bilgi' : 'kotu'),
    `masaüstü: ${ms && ms.var ? (kd[0] === 'iyi' ? 'var' : 'başka klasörü gösteriyor') : 'yok'} · Başlat menüsü: ${bm && bm.var ? (kd[1] === 'iyi' ? 'var' : 'başka klasörü gösteriyor') : 'yok'}`,
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
    if (onarCalisiyor) return res.status(409).json({ success: false, error: 'Bir onarım zaten çalışıyor.' });
    onarCalisiyor = true;
    const c = spawn(process.execPath, [path.join(PROGRAM, 'scripts', 'kur.js'), '--adim', adim, '--json'], { cwd: PROGRAM, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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

module.exports = { uzunYol, programiGosterir, GOREVLER, ROLLER, HIC_CALISMADI, veriYolu, surumOku, isaretOku, gelistirmeMi, rolBul, tasinabilir, gitBul, gitBilgi, ps, psDize,
  windowsYokla, uykuOku, jetonYokla, veriYokla, gorevDurumu, paketlerTamam, denetle, router, ONARILIR };
