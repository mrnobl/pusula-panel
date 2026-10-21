#!/usr/bin/env node
/**
 * TELEFONDAN PANEL — `npm run telefon` (kılavuz: TELEFONDAN-PANEL.md)
 *
 * Paneli aynı Wi-Fi'daki telefona jetonla açar ve terminale açılacak adresi + karekodu basar.
 * İki kip, otomatik seçilir:
 *
 *   KÖPRÜ   Bu bilgisayarda 127.0.0.1:<hedef> (varsayılan 3000) üzerinde Pusula ZATEN çalışıyorsa
 *           (evdeki canlı bot). İkinci sunucu BAŞLATILMAZ: aynı data/ klasörüne iki süreç yazmasın,
 *           canlı bot yeniden başlamasın. lib/telefonKopru.js istekleri jetonla aktarır. TELEFON
 *           KADEMESİ (60.5): yalnız izleme + acil durdurma (acil PIN + "DURDUR"; `npm run acil-pin`).
 *           Eski `--tam` (tam erişim) kaldırıldı.
 *   SUNUCU  Çalışan Pusula yoksa (bu geliştirme makinesi): server.js yerel ağ adresinde ARAŞTIRMA
 *           MODUNDA başlatılır — Telegram kapalı (aynı bot jetonunu evdeki sunucu dinliyor; iki
 *           dinleyici çakışır), hiçbir bot başlamaz, bot/borsa/emir uçları kapalı. Canlı bot evde
 *           çalıştığı için bu makinede normal kip gerekmez.
 *
 * Jeton (≥ 24 karakter) sırası: PANEL_TOKEN ortam değişkeni → data/secrets.json `panelToken` →
 * data/telefon-jeton.json (yoksa üretilir; `--yeni-jeton` yeniler ve telefonlardaki oturumları
 * geçersiz kılar). data/ depoya girmez.
 *
 * Seçenekler: --ip <adres> · --port <n> (varsayılan 3100) · --hedef <n> (varsayılan 3000) ·
 *             --yeni (köprü yerine araştırma sunucusu; çalışan Pusula varsa REDDEDİLİR) ·
 *             --yeni-jeton · --karekod-yok
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const yollar = require('../lib/yollar');
const http = require('http');
const { spawn } = require('child_process');
const guvenlik = require('../lib/guvenlik');

const ROOT = path.join(__dirname, '..');
const JETON_DOSYA = yollar.veri('telefon-jeton.json');
const SIR_DOSYA = yollar.veri('secrets.json');

function argOku(argv) {
  const a = { port: 3100, hedef: 3000 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const deger = () => argv[++i];
    if (k === '--ip') a.ip = deger();
    else if (k === '--port') a.port = Number(deger());
    else if (k === '--hedef') a.hedef = Number(deger());
    else if (k === '--yeni') a.yeni = true;
    else if (k === '--tam') throw new Error('--tam 60.5\'te kaldırıldı: telefondan yalnız izleme ve acil durdurma yapılır (PLAN-UYGULAMA-YOL-HARITASI.md §0).');
    else if (k === '--yeni-jeton') a.yeniJeton = true;
    else if (k === '--karekod-yok') a.karekodYok = true;
    else if (k === '--yardim' || k === '-h') a.yardim = true;
    else throw new Error(`Bilinmeyen seçenek: ${k}`);
  }
  if (!(a.port > 0 && a.port < 65536) || !(a.hedef > 0 && a.hedef < 65536)) throw new Error('Port 1–65535 olmalı.');
  return a;
}

/** Sanal/VPN bağdaştırıcıları telefonun göremeyeceği adreslerdir. */
const SANAL = /vEthernet|Hyper-V|VirtualBox|VMware|WSL|Loopback|Bluetooth|Tailscale|ZeroTier|docker|vbox|utun|tun\d|tap\d/i;

/** Yerel ağ IPv4 adayları, en olası önde: 192.168 → 10 → 172.16–31 → diğer. */
function lanAdresleri(arayuzler = os.networkInterfaces()) {
  const sira = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1
    : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  const l = [];
  for (const [ad, liste] of Object.entries(arayuzler || {})) {
    for (const a of liste || []) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (!v4 || a.internal || a.address.startsWith('169.254.')) continue;
      l.push({ ad, ip: a.address, sanal: SANAL.test(ad) });
    }
  }
  return l.sort((x, y) => (x.sanal - y.sanal) || (sira(x.ip) - sira(y.ip)));
}

function jsonOku(dosya) {
  try { return JSON.parse(fs.readFileSync(dosya, 'utf8').replace(/^﻿/, '')); } catch { return null; }
}

function jetonBul({ yeniJeton } = {}, env = process.env) {
  if ((env.PANEL_TOKEN || '').length >= 24) return { jeton: env.PANEL_TOKEN, kaynak: 'PANEL_TOKEN ortam değişkeni' };
  const sir = require('../lib/sirKasasi').okuGuvenli(SIR_DOSYA, null);   // 69.4/69.6 sır kasası
  if (sir && typeof sir.panelToken === 'string' && sir.panelToken.length >= 24) {
    return { jeton: sir.panelToken, kaynak: 'data/secrets.json (panelToken)' };
  }
  const kayit = require('../lib/sirKasasi').okuGuvenli(JETON_DOSYA, null);
  if (!yeniJeton && kayit && typeof kayit.jeton === 'string' && kayit.jeton.length >= 24) {
    return { jeton: kayit.jeton, kaynak: 'data/telefon-jeton.json' };
  }
  const jeton = guvenlik.yeniJeton();
  fs.mkdirSync(path.dirname(JETON_DOSYA), { recursive: true });
  require('../lib/sirKasasi').yaz(JETON_DOSYA, { jeton, olusturma: new Date().toISOString() });   // 69.6 sır kasası
  return { jeton, kaynak: 'data/telefon-jeton.json (yeni üretildi)' };
}

/** 127.0.0.1:<port>'ta Pusula çalışıyor mu? (`/api/health` → appVersion; 503 de olsa gövde JSON) */
function pusulaVarMi(port, zamanAsimi = 1500) {
  return new Promise((coz) => {
    const istek = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: zamanAsimi }, (res) => {
      let g = '';
      res.setEncoding('utf8');
      res.on('data', (p) => { g += p; });
      res.on('end', () => { try { const v = JSON.parse(g); coz(v && v.appVersion ? v : null); } catch { coz(null); } });
    });
    istek.on('timeout', () => { istek.destroy(); coz(null); });
    istek.on('error', () => coz(null));
  });
}

async function karekodBas(metin) {
  let qr;
  try { qr = require('qrcode-terminal'); } catch {
    console.log('  (karekod için `npm install` gerekiyor — adres yeterli)');
    return;
  }
  await new Promise((coz) => qr.generate(metin, { small: true }, (s) => { console.log(s.split('\n').map(x => '    ' + x).join('\n')); coz(); }));
}

function dinlemeHatasi(e, port) {
  if (e.code === 'EADDRINUSE') return `Port ${port} kullanımda — başka bir port deneyin: npm run telefon -- --port ${port + 1}`;
  if (e.code === 'EADDRNOTAVAIL') return 'Bu IP adresi bu bilgisayarda yok — `--ip` ile doğru adresi verin.';
  return e.message;
}

async function ana() {
  let a;
  try { a = argOku(process.argv.slice(2)); } catch (e) { console.error('✗ ' + e.message); process.exit(2); }
  if (a.yardim) {
    console.log('Kullanım: npm run telefon [-- --ip <adres>] [--port 3100] [--hedef 3000] [--yeni] [--yeni-jeton] [--karekod-yok]\nAyrıntı: TELEFONDAN-PANEL.md');
    return;
  }

  const adaylar = lanAdresleri();
  const ip = a.ip || (adaylar[0] && adaylar[0].ip);
  if (!ip) { console.error('✗ Yerel ağ adresi bulunamadı — Wi-Fi/kablo bağlı mı? Elle verin: npm run telefon -- --ip 192.168.1.20'); process.exit(1); }
  if (guvenlik.geriDonusMu(ip)) { console.error('✗ 127.0.0.1 telefondan açılmaz; yerel ağ adresini verin (ipconfig → IPv4 Adresi).'); process.exit(2); }

  const { jeton, kaynak } = jetonBul(a);
  const calisan = await pusulaVarMi(a.hedef);
  let kip;
  let cocuk = null;
  let kopru = null;

  if (calisan && a.yeni) {
    console.error(`✗ 127.0.0.1:${a.hedef}'te Pusula zaten çalışıyor (sürüm ${calisan.appVersion}). İkinci sunucu aynı data/ klasörüne yazar;`
      + ' --yeni olmadan çalıştırın (köprü kipi).');
    process.exit(1);
  }

  if (calisan) {
    kip = `KÖPRÜ → 127.0.0.1:${a.hedef} (Pusula ${calisan.appVersion}${calisan.arastirmaModu ? ', araştırma modu' : ''}) · `
      + 'telefon kademesi: yalnız izleme + acil durdurma (acil PIN gerekir: npm run acil-pin)';
    const { kopruKur } = require('../lib/telefonKopru');
    kopru = kopruKur({ dinlenen: ip, port: a.port, hedefPort: a.hedef, jeton,
      izinliHostlar: (process.env.PANEL_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean) });
    await new Promise((coz) => {
      kopru.once('error', (e) => { console.error('✗ ' + dinlemeHatasi(e, a.port)); process.exit(1); });
      kopru.listen(a.port, ip, coz);
    });
  } else {
    kip = 'ARAŞTIRMA SUNUCUSU (ARASTIRMA_MODU=1: Telegram kapalı, botlar başlamaz, bot/borsa/emir işlemleri kapalı)';
    cocuk = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, HOST: ip, PORT: String(a.port), PANEL_TOKEN: jeton, ARASTIRMA_MODU: '1' }
    });
    cocuk.on('exit', (kod) => { console.log(`\nSunucu kapandı (çıkış ${kod}).`); process.exit(kod || 0); });
    // Sunucu dinlemeye başlayana kadar bekle (jetonsuz sayfa isteği 401 giriş sayfası döner).
    const bas = Date.now();
    for (;;) {
      const durum = await new Promise((coz) => {
        const r = http.get({ host: ip, port: a.port, path: '/', timeout: 1000 }, (res) => { res.resume(); coz(res.statusCode); });
        r.on('timeout', () => { r.destroy(); coz(0); });
        r.on('error', () => coz(0));
      });
      if (durum) break;
      if (Date.now() - bas > 60000) { console.error('✗ Sunucu 60 sn içinde açılmadı.'); cocuk.kill(); process.exit(1); }
      await new Promise((c) => setTimeout(c, 500));
    }
  }

  const adres = `http://${ip}:${a.port}/`;
  console.log('\n==================== 📱 Telefondan Pusula ====================');
  console.log(`  Kip:    ${kip}`);
  console.log(`  Jeton:  ${kaynak}`);
  if (!a.ip && adaylar.length > 1) console.log(`  Diğer adresler: ${adaylar.slice(1).map(x => `${x.ip} (${x.ad})`).join(', ')} — gerekirse --ip`);
  console.log('\n  Telefon AYNI Wi-Fi\'da olmalı. Kamerayla karekodu okutun ya da adresi açın:');
  console.log(`\n    ${adres}#jeton=${jeton}\n`);
  if (!a.karekodYok) await karekodBas(`${adres}#jeton=${jeton}`);
  console.log(`  Jeton sorulursa elle: ${jeton}`);
  console.log('  Giriş bir kez yapılır (30 gün); sonra yalnız şu adres yeter: ' + adres);
  console.log('\n  Açılmıyorsa: Windows güvenlik duvarı "Node.js" için izin isterse "Özel ağlar"ı işaretleyip');
  console.log(`  "Erişime izin ver"e basın. Ayrıntı ve sorun giderme: TELEFONDAN-PANEL.md`);
  console.log('  Durdurmak: Ctrl+C');
  console.log('==============================================================\n');

  const kapat = () => {
    if (cocuk && cocuk.exitCode === null) cocuk.kill();
    if (kopru) kopru.close();
    if (!cocuk) process.exit(0);
  };
  process.on('SIGINT', kapat);
  process.on('SIGTERM', kapat);
}

if (require.main === module) ana().catch((e) => { console.error('✗ ' + (e.stack || e.message)); process.exit(1); });

module.exports = { argOku, lanAdresleri, jetonBul, pusulaVarMi };
