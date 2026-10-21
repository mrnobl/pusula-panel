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
 * Yeniden başlatma: önce POST /api/sistem/yeniden-baslat (61.3+ sunucu; denetleyici 10 sn sonra yeni kodla açar);
 * eski sunucuda bu uç yoksa scripts/pusula-sunucu.ps1 -Islem Durdur -Evet, sonra PusulaBot görevi (yoksa -Islem Baslat
 * -PanelAcma). Süreç kapatma YALNIZ o betiğin kendi PID kaydıyla (toplu kapatma yok).
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

function istek(yontem, yol, sureMs = 3000) {
  return new Promise((coz) => {
    const q = http.request({ host: '127.0.0.1', port: PORT, path: yol, method: yontem, timeout: sureMs, headers: { 'content-type': 'application/json', 'content-length': yontem === 'POST' ? 2 : 0 } }, (res) => {
      let m = ''; res.setEncoding('utf8'); res.on('data', d => { m += d; });
      res.on('end', () => { let j = null; try { j = JSON.parse(m); } catch (e) { /* metin */ } coz({ durum: res.statusCode, j }); });
    });
    q.on('timeout', () => { q.destroy(); coz(null); });
    q.on('error', () => coz(null));
    if (yontem === 'POST') q.write('{}');
    q.end();
  });
}

async function saglik() { const r = await istek('GET', '/api/health'); return r && r.j ? r.j : null; }

function ps(args) {
  return calistirSenk('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], { sure: 240000 });
}

async function yenidenBaslat() {
  const s = await saglik();
  if (s) {
    const r = await istek('POST', '/api/sistem/yeniden-baslat', 5000);
    // Denetim 61.8 #5: 409 = sunucu reddetti (botun karar penceresi ya da denetleyicisiz başlatma) — PowerShell "Durdur" yoluna
    // geçmek korumayı delerdi. Başarısız sayılır; güncelleme "yeniden başlatma gerekli" der, sonraki kontrolde tamamlanır.
    if (r && r.durum === 409 && r.j && /karar saati/.test(String(r.j.error || ''))) return { tamam: false, yol: 'uç', hata: `sunucu yeniden başlatmayı reddetti: ${(r.j && r.j.error) || '409'}` };
    if (r && r.durum === 202) {
      // Eski süreç kapanana kadar bekle (en çok 30 sn); sonra denetleyici 10 sn içinde yenisini açar.
      for (let i = 0; i < 30; i++) { const x = await saglik(); if (!x || x.uptimeSec < (s.uptimeSec || 0)) break; await bekle(1000); }
      return { tamam: true, yol: 'uç' };
    }
  }
  if (!WIN) return { tamam: false, yol: 'yok', hata: 'yeniden başlatma ucu yok ve bu bilgisayar Windows değil' };
  const betik = path.join(KOK, 'scripts', 'pusula-sunucu.ps1');
  if (s) {
    const d = ps(['-File', betik, '-Islem', 'Durdur', '-Evet']);
    if (d.kod !== 0) return { tamam: false, yol: 'betik', hata: `Durdur başarısız (Pusula kısayolla ya da PusulaBot göreviyle başlatılmamış olabilir): ${d.cikti.trim().split('\n').slice(-2).join(' ')}` };
  }
  const gorev = ps(['-Command', "if (Get-ScheduledTask -TaskName PusulaBot -ErrorAction SilentlyContinue) { Start-ScheduledTask -TaskName PusulaBot; exit 0 } else { exit 3 }"]);
  if (gorev.kod === 0) return { tamam: true, yol: 'görev' };
  const b = ps(['-File', betik, '-Islem', 'Baslat', '-PanelAcma']);
  return b.kod === 0 ? { tamam: true, yol: 'betik' } : { tamam: false, yol: 'betik', hata: b.cikti.trim().split('\n').slice(-2).join(' ') };
}

/**
 * 69.2 KURU DENEME (lib/kuruDeneme.js): botların listesi çalışan sunucudan (GET /api/guncelleme/kuru-bilgi); koşucu ayrı süreçte
 * (scripts/kuru-deneme.js). Sunucu yanıt vermezse deneme yapılmaz (uyarı ile kurulum sürer).
 */
async function kuruDeneme({ eskiRev, yeniRev, ilerleme }) {
  const r = await istek('GET', '/api/guncelleme/kuru-bilgi', 5000);
  if (!r || !r.j || !r.j.success) throw new Error('sunucu bot listesini vermedi (Pusula kapalı ya da eski sürüm)');
  const node = (args, o) => new Promise((coz) => {
    const c = spawn(process.execPath, args, { cwd: KOK, env: o.env, windowsHide: true });
    let s = ''; c.stdout.on('data', d => { s += d; }); c.stderr.on('data', d => { s += d; });
    const t = setTimeout(() => { try { c.kill(); } catch (e) { /* */ } }, o.sure);
    c.on('close', (kod) => { clearTimeout(t); coz({ kod, cikti: s }); });
    c.on('error', (e) => { clearTimeout(t); coz({ kod: 1, cikti: e.message }); });
  });
  const ham = (a) => { const x = spawnSync(GIT, a, { cwd: KOK, windowsHide: true, timeout: 60000, maxBuffer: 64 << 20 }); return { kod: x.status == null ? 1 : x.status, cikti: x.stdout }; };
  return require('../lib/kuruDeneme').calistir({ kok: KOK, eskiRev, yeniRev, botlar: r.j.botlar || [], ilerleme,
    ops: { git: (a) => calistirSenk(GIT, a), gitHam: ham, komut: (k, a, o = {}) => calistirSenk(k, a, o), node } });
}

/** Telegram: lib/telegramDosya.js (config.json + data/secrets.json; araştırma kopyasında göndermez). */
const telegram = () => require('../lib/telegramDosya').telegramDosyadan(KOK);

(async () => {
  if (arg.includes('--durum')) { console.log(JSON.stringify(G.durumOku(KOK), null, 1)); return; }
  const onayla = deger('--onayla');
  // Gece penceresi: botun günlük kararı (~03:02) ve veri indirmesi (04:30). Görev "kaçırılınca açılışta çalış" ayarlı;
  // bilgisayar bu saatlerde açılırsa güncelleme o gün atlanır (onaylı kurulum kullanıcının kararı — atlanmaz).
  // D2 (62.1): pencere UTC'ye bağlı (bot UTC 00:02'de karar verir) — PC'nin saat dilimi İstanbul değilse kaymasın.
  // UTC 23:00–02:00 = TR 02:00–05:00.
  const saat = new Date().getUTCHours();
  if (!onayla && !arg.includes('--kuru') && (saat >= 23 || saat < 2)) { console.log(`[${new Date().toISOString()}] gece penceresi (TR 02:00–05:00) — atlandı`); return; }
  const sonuc = await G.calistir({
    kok: KOK, onayla, kuru: arg.includes('--kuru'), kuruFarkOnay: !!onayla && arg.includes('--kuru-fark-onay'), kuruDeneme,
    git: (a) => calistirSenk(GIT, a),
    npmKur: () => { const [k, a, kabuk] = npmKomut(['install', '--no-audit', '--no-fund']); return calistirSenk(k, a, { sure: 15 * 60000, kabuk }); },
    nodeCheck: (yol) => calistirSenk(process.execPath, ['--check', yol], { sure: 30000 }),
    yenidenBaslat, saglik, bildir: telegram(), bekle
  });
  console.log(`[${new Date().toISOString()}] ${sonuc.durum}${sonuc.hedefSurum ? ` → ${sonuc.hedefSurum}` : ''}${sonuc.neden ? ` — ${sonuc.neden}` : ''}`);
  if (sonuc.durum === 'kuru') console.log(JSON.stringify(sonuc.plan, null, 1));
})().catch((e) => { console.error(`[${new Date().toISOString()}] HATA: ${e.stack || e.message}`); process.exitCode = 1; });
