#!/usr/bin/env node
/**
 * OTOMATİK GÜNCELLEME — komut satırı (61.3). Mantık: lib/guncelleme.js. Görev: scripts/install-guncelleme-gorev.ps1 (PusulaGuncelle, 12:00).
 *
 *   node scripts/guncelle.js                 kontrol et; panel değişikliğiyse kur, bot kodu değiştiyse onay bekle
 *   node scripts/guncelle.js --onayla <sha>  (panel "Güncellemeyi kur") bot kodu değişmiş olsa da YALNIZ bu commit'i kur
 *   node scripts/guncelle.js --kuru          ne yapacağını yaz, hiçbir şey değiştirme
 *   node scripts/guncelle.js --onayla <sha> --kuru-fark-onay   (panel "Farkı gördüm, yine de kur") kuru denemedeki karar farkına rağmen kur
 *   node scripts/guncelle.js --durum         son durumu yaz (data/guncelleme.json)
 *
 * Yeniden başlatma: POST /api/sistem/yeniden-baslat (denetleyici 10 sn sonra yeni kodla açar). Pusula kapalıysa
 * `schtasks /run /tn PusulaBot`. 73.6: PowerShell AÇILMAZ (eskiden pusula-sunucu.ps1 / Start-ScheduledTask; antivirüs).
 * Hiçbir süreç dışarıdan kapatılmaz.
 * 72.3: paket kurulumu gerekiyorsa (lib/guncelleme.js paketKurulumuGerekli) Pusula önce `durdur` (POST /api/sistem/durdur) ile
 * kapatılır, npm ci, sonra `baslat`. 73.6 S04: durdurmadan önce nöbetçi (--nobet <pid>) açılır; güncelleyici yarıda ölürse
 * Pusula'yı yeniden açar.
 *   node scripts/guncelle.js --nobet <pid>   (yalnız güncelleyicinin kendisi açar)
 */
'use strict';
// D3 (62.1): zamanlanmış görevde git kimlik penceresi açamaz — giriş isterse beklemeden hata versin (spawn 180 sn takılmasın).
process.env.GIT_TERMINAL_PROMPT = '0';
process.env.GCM_INTERACTIVE = 'never';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync, spawn } = require('child_process');
const G = require('../lib/guncelleme');
// 69.6: kuru deneme modülü merge'den ÖNCE (eski, çalışan kodla) yüklenir — gelen kod kendi denetleyicisini değiştiremesin.
const KD = require('../lib/kuruDeneme');

const KOK = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const arg = process.argv.slice(2);
const deger = (ad) => { const i = arg.indexOf(ad); return i >= 0 ? arg[i + 1] : null; };
const bekle = (ms) => new Promise(r => setTimeout(r, ms));
const WIN = process.platform === 'win32';
// 68.5: PATH'e bağlı kalmasın — çalışan Node'un yanındaki npm (taşınabilir kurulumda <program>\node), git taşınabilirse o.
const NPM_CLI = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npmKomut = (a) => fs.existsSync(NPM_CLI) ? [process.execPath, [NPM_CLI, ...a], false] : [WIN ? 'npm.cmd' : 'npm', a, WIN];
const GIT = (() => { try { return require('../lib/kurulumDenetimi').gitBul(KOK) || 'git'; } catch (e) { return 'git'; } })();

function calistirSenk(komut, args, ops = {}) {
  const r = spawnSync(komut, args, { cwd: KOK, encoding: 'utf8', windowsHide: true, timeout: ops.sure || 180000, shell: !!ops.kabuk });
  return { kod: r.status == null ? 1 : r.status, cikti: `${r.stdout || ''}${r.stderr || ''}${r.error ? r.error.message : ''}` };
}

function istek(yontem, yol, sureMs = 3000, govde = {}) {
  return new Promise((coz) => {
    // 69.6: yeniden başlatma yerel PIN kapısının arkasında — Pusula'nın kendi betiği sistem jetonuyla geçer (lib/yerelPin.js).
    const sistem = (() => { try { return require('../lib/yerelPin').sistemJetonuOku(KOK); } catch (e) { return ''; } })();
    const metin = yontem === 'POST' ? JSON.stringify(govde || {}) : '';
    const q = http.request({ host: '127.0.0.1', port: PORT, path: yol, method: yontem, timeout: sureMs, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(metin), ...(sistem ? { 'x-pusula-sistem': sistem } : {}) } }, (res) => {
      let m = ''; res.setEncoding('utf8'); res.on('data', d => { m += d; });
      res.on('end', () => { let j = null; try { j = JSON.parse(m); } catch (e) { /* metin */ } coz({ durum: res.statusCode, j }); });
    });
    q.on('timeout', () => { q.destroy(); coz(null); });
    q.on('error', () => coz(null));
    if (metin) q.write(metin);
    q.end();
  });
}

async function saglik() { const r = await istek('GET', '/api/health'); return r && r.j ? r.j : null; }

/*
 * 73.6 (S01): PowerShell YOK. 61.3–73.5 bu betik yeniden başlatma / paket kurulumu için arka planda
 * `powershell -ExecutionPolicy Bypass -File pusula-sunucu.ps1` ve `Start-ScheduledTask` açıyordu (antivirüs tetikleyicisi —
 * 2026-10-21/22 Kaspersky). Şimdi: yeniden başlatma ve durdurma Pusula'nın kendi uçlarıyla (POST /api/sistem/yeniden-baslat,
 * /api/sistem/durdur), kapalı Pusula'yı açma yalnız `schtasks /run /tn PusulaBot` ile (Görev Zamanlayıcı kendi başlatır).
 * PusulaBot görevi yoksa açılamaz → "yeniden başlatma gerekli — Pusula kısayoluyla başlatın".
 */
const DURDUR_ISARETI = () => require('../lib/yollar').veri('pusula-durduruldu.txt');
/** Durdurma işareti BU güncelleyicinin (ya da verilen PID'in) mi? Kullanıcının kendi "Pusula'yı durdur"una dokunulmaz. */
function isaretGuncelleyicininMi(pid = null) {
  try { const s = fs.readFileSync(DURDUR_ISARETI(), 'ascii'); const m = s.match(/^guncelleme pid=(\d+)/); return !!m && (pid == null || Number(m[1]) === Number(pid)); } catch (e) { return false; }
}
function schtasks(args) { return calistirSenk('schtasks.exe', args, { sure: 30000 }); }
/** PusulaBot görevini Görev Zamanlayıcı'ya başlat (görev yoksa { var: false }). */
function gorevBaslat() {
  if (!WIN) return { var: false, hata: 'bu bilgisayar Windows değil' };
  if (schtasks(['/query', '/tn', 'PusulaBot']).kod !== 0) return { var: false };
  const r = schtasks(['/run', '/tn', 'PusulaBot']);
  return { var: true, tamam: r.kod === 0, hata: r.kod === 0 ? null : r.cikti.trim().split('\n').slice(-1).join(' ') };
}

async function yenidenBaslat() {
  const s = await saglik();
  if (s) {
    const r = await istek('POST', '/api/sistem/yeniden-baslat', 5000);
    // Denetim 61.8 #5: 409 = sunucu reddetti (botun karar penceresi ya da denetleyicisiz başlatma) — başka yola geçmek
    // korumayı delerdi. Başarısız sayılır; güncelleme "yeniden başlatma gerekli" der, sonraki kontrolde tamamlanır.
    if (r && r.durum === 409 && r.j && /karar saati/.test(String(r.j.error || ''))) return { tamam: false, yol: 'uç', hata: `sunucu yeniden başlatmayı reddetti: ${(r.j && r.j.error) || '409'}` };
    if (r && r.durum === 202) {
      // Eski süreç kapanana kadar bekle (en çok 30 sn); sonra denetleyici 10 sn içinde yenisini açar.
      for (let i = 0; i < 30; i++) { const x = await saglik(); if (!x || x.uptimeSec < (s.uptimeSec || 0)) break; await bekle(1000); }
      return { tamam: true, yol: 'uç' };
    }
    return { tamam: false, yol: 'uç', hata: `yeniden başlatma ucu kabul etmedi (${r ? `${r.durum}${r.j && r.j.error ? `: ${r.j.error}` : ''}` : 'yanıt yok'}) — Pusula'yı durdurup Pusula kısayoluyla yeniden başlatın` };
  }
  return baslat();
}

/**
 * 72.3 PAKET KURULUMU İÇİN DURDUR / BAŞLAT — npm ci Pusula çalışırken koşarsa Windows node_modules'ü kilitli tutar (EPERM,
 * sunucu olayı 2026-10-22). 73.6: durdurma Pusula'nın kendi ucuyla (POST /api/sistem/durdur): bot işini bitirir (en çok
 * 120 sn), kaydı diske yazar, temiz kapanır; "bilerek durduruldu" işareti bu güncelleyicinin PID'iyle yazılır. Hiçbir süreç
 * dışarıdan kapatılmaz. Güncelleyicinin kendisi ayrı (detached) süreç olduğundan durdurmadan etkilenmez.
 * S04: durdurmadan hemen önce bir NÖBETÇİ (bu betik --nobet <pid>) açılır — güncelleyici yarıda ölürse işaretini kaldırıp
 * Pusula'yı yeniden açar.
 */
async function durdur() {
  if (!WIN) return { tamam: false, hata: 'bu bilgisayar Windows değil' };
  nobetciBaslat();
  const r = await istek('POST', '/api/sistem/durdur', 5000, { pid: process.pid });
  if (!r || r.durum !== 202) return { tamam: false, hata: `Durdurma reddedildi (${r ? `${r.durum}${r.j && r.j.error ? `: ${r.j.error}` : ''}` : 'Pusula yanıt vermedi'})` };
  for (let i = 0; i < 150; i++) { if (!(await saglik())) return { tamam: true }; await bekle(1000); }
  return { tamam: false, hata: 'Pusula durdurulduktan sonra hâlâ yanıt veriyor (başka bir yoldan da başlatılmış olabilir)' };
}
/** Pusula'yı aç: bu güncelleyicinin durdurma işaretini kaldır, PusulaBot görevini başlat (yanıt gelene kadar en çok 2 dk). */
async function baslat() {
  if (!WIN) return { tamam: false, yol: 'yok', hata: 'bu bilgisayar Windows değil' };
  if (isaretGuncelleyicininMi()) { try { fs.unlinkSync(DURDUR_ISARETI()); } catch (e) { /* */ } }
  const g = gorevBaslat();
  if (!g.var) return { tamam: false, yol: 'görev', hata: 'PusulaBot görevi bu bilgisayarda kurulu değil — Pusula kısayoluyla başlatın' };
  if (!g.tamam) return { tamam: false, yol: 'görev', hata: `PusulaBot görevi başlatılamadı (${g.hata || '?'}) — Pusula kısayoluyla başlatın` };
  for (let i = 0; i < 60; i++) { if (await saglik()) return { tamam: true, yol: 'görev' }; await bekle(2000); }
  return { tamam: false, yol: 'görev', hata: 'PusulaBot görevi başlatıldı ama Pusula 2 dakikada yanıt vermedi' };
}

/**
 * S04 NÖBETÇİ (73.6): `node scripts/guncelle.js --nobet <pid>` — ayrı, gizli Node süreci. Güncelleyici (pid) yaşarken 10 sn'de
 * bir bakar (en çok 2 saat). Güncelleyici bittiğinde durdurma işareti HÂLÂ o güncelleyicinin adıyla duruyor ve Pusula yanıt
 * vermiyorsa (= güncelleyici Pusula'yı durdurup yarıda öldü) işareti kaldırır, PusulaBot görevini başlatır, olayı güncelleme
 * günlüğüne ve Telegram'a yazar. Kendi PID'i dışında hiçbir süreci kapatmaz; PowerShell açmaz.
 */
function nobetciBaslat() {
  try { spawn(process.execPath, [__filename, '--nobet', String(process.pid)], { cwd: KOK, detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch (e) { /* nöbetçi yoksa eski davranış */ }
}
const yasiyor = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return !!(e && e.code === 'EPERM'); } };
async function nobet(pid, { simdi = Date.now, bekleMs = 10000, enCokMs = 2 * 3600e3 } = {}) {
  const bas = simdi();
  while (yasiyor(pid) && simdi() - bas < enCokMs) await bekle(bekleMs);
  if (yasiyor(pid)) return { durum: 'zaman-asimi' };
  await bekle(3000);
  if (!isaretGuncelleyicininMi(pid)) return { durum: 'temiz' };
  if (await saglik()) { try { fs.unlinkSync(DURDUR_ISARETI()); } catch (e) { /* */ } return { durum: 'zaten-acik' }; }
  try { fs.unlinkSync(DURDUR_ISARETI()); } catch (e) { /* */ }
  G.gunluk(KOK, `NÖBETÇİ: güncelleyici (PID ${pid}) Pusula'yı durdurduktan sonra yarıda kapandı — durdurma işareti kaldırıldı, Pusula yeniden açılıyor`);
  const g = gorevBaslat();
  let acildi = false;
  if (g.var && g.tamam) for (let i = 0; i < 60 && !acildi; i++) { if (await saglik()) acildi = true; else await bekle(2000); }
  G.gunluk(KOK, acildi ? 'NÖBETÇİ: Pusula yeniden açıldı' : `NÖBETÇİ: Pusula açılamadı (${g.var ? (g.hata || 'yanıt yok') : 'PusulaBot görevi yok'}) — sunucuda Pusula kısayoluna tıklayın`);
  try {
    await telegram()('critical', 'Pusula güncellemesi yarıda kaldı', ['Güncelleyici, paket kurulumu için Pusula\'yı durdurduktan sonra beklenmedik biçimde kapandı.',
      acildi ? 'Pusula yeniden açıldı. Ayarlar › Güncelleme sayfasına bakın; gerekirse "Şimdi kontrol et".' : 'Pusula açılamadı: sunucuda masaüstündeki "Pusula" kısayoluna tıklayın, sonra Ayarlar › Güncelleme sayfasına bakın.']);
  } catch (e) { /* */ }
  return { durum: acildi ? 'acildi' : 'acilamadi' };
}

/**
 * 69.2 KURU DENEME (lib/kuruDeneme.js): botların listesi çalışan sunucudan (GET /api/guncelleme/kuru-bilgi); koşucu ayrı süreçte
 * (scripts/kuru-deneme.js). Sunucu yanıt vermezse deneme yapılmaz (uyarı ile kurulum sürer).
 * 72.3: paket kurulumunda Pusula kuru denemeden ÖNCE durur — liste durmadan alınır (`kuruHazirla`).
 */
let kuruBilgi = null;
async function kuruHazirla() {
  const r = await istek('GET', '/api/guncelleme/kuru-bilgi', 5000);
  if (r && r.j && r.j.success) kuruBilgi = r.j;
}
async function kuruDeneme({ eskiRev, yeniRev, ilerleme }) {
  const r = kuruBilgi ? { j: kuruBilgi } : await istek('GET', '/api/guncelleme/kuru-bilgi', 5000);
  if (!r || !r.j || !r.j.success) throw new Error('sunucu bot listesini vermedi (Pusula kapalı ya da eski sürüm)');
  const node = (args, o) => new Promise((coz) => {
    const c = spawn(process.execPath, args, { cwd: KOK, env: o.env, windowsHide: true });
    let s = ''; c.stdout.on('data', d => { s += d; }); c.stderr.on('data', d => { s += d; });
    const t = setTimeout(() => { try { c.kill(); } catch (e) { /* */ } }, o.sure);
    c.on('close', (kod) => { clearTimeout(t); coz({ kod, cikti: s }); });
    c.on('error', (e) => { clearTimeout(t); coz({ kod: 1, cikti: e.message }); });
  });
  const ham = (a) => { const x = spawnSync(GIT, G.guvenliGit(a), { cwd: KOK, windowsHide: true, timeout: 60000, maxBuffer: 64 << 20 }); return { kod: x.status == null ? 1 : x.status, cikti: x.stdout }; };
  return KD.calistir({ kok: KOK, eskiRev, yeniRev, botlar: r.j.botlar || [], ilerleme,
    ops: { git: (a) => calistirSenk(GIT, G.guvenliGit(a)), gitHam: ham, komut: (k, a, o = {}) => calistirSenk(k, a, o), node } });
}

/** Telegram: lib/telegramDosya.js (config.json + data/secrets.json; araştırma kopyasında göndermez). */
const telegram = () => require('../lib/telegramDosya').telegramDosyadan(KOK);

(async () => {
  if (arg.includes('--durum')) { console.log(JSON.stringify(G.durumOku(KOK), null, 1)); return; }
  if (deger('--nobet')) { const r = await nobet(Number(deger('--nobet'))); console.log(`[${new Date().toISOString()}] nöbet: ${r.durum}`); return; }
  const onayla = deger('--onayla');
  // Gece penceresi: botun günlük kararı (~03:02) ve veri indirmesi (04:30). Görev "kaçırılınca açılışta çalış" ayarlı;
  // bilgisayar bu saatlerde açılırsa güncelleme o gün atlanır (onaylı kurulum kullanıcının kararı — atlanmaz).
  // D2 (62.1): pencere UTC'ye bağlı (bot UTC 00:02'de karar verir) — PC'nin saat dilimi İstanbul değilse kaymasın.
  // UTC 23:00–02:00 = TR 02:00–05:00.
  const saat = new Date().getUTCHours();
  if (!onayla && !arg.includes('--kuru') && (saat >= 23 || saat < 2)) { console.log(`[${new Date().toISOString()}] gece penceresi (TR 02:00–05:00) — atlandı`); return; }
  const sonuc = await G.calistir({
    kok: KOK, onayla, kuru: arg.includes('--kuru'), kuruFarkOnay: !!onayla && arg.includes('--kuru-fark-onay'), kuruDeneme,
    git: (a) => calistirSenk(GIT, G.guvenliGit(a)),   // 69.6: fsmonitor/hooks kapalı
    // 69.4: npm ci — yalnız kilit dosyasındaki sürümler; kurulum betikleri çalışmaz (.npmrc ignore-scripts + açık bayrak).
    npmKur: () => { const [k, a, kabuk] = npmKomut(['ci', '--no-audit', '--no-fund', '--ignore-scripts']); return calistirSenk(k, a, { sure: 15 * 60000, kabuk }); },
    nodeCheck: (yol) => calistirSenk(process.execPath, ['--check', yol], { sure: 30000 }),
    yenidenBaslat, saglik, bildir: telegram(), bekle,
    durdur, baslat, kuruHazirla   // 72.3: paket kurulumu yalnız Pusula durmuşken
  });
  console.log(`[${new Date().toISOString()}] ${sonuc.durum}${sonuc.hedefSurum ? ` → ${sonuc.hedefSurum}` : ''}${sonuc.neden ? ` — ${sonuc.neden}` : ''}`);
  if (sonuc.durum === 'kuru') console.log(JSON.stringify(sonuc.plan, null, 1));
})().catch((e) => { console.error(`[${new Date().toISOString()}] HATA: ${e.stack || e.message}`); process.exitCode = 1; });
