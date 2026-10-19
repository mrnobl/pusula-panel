#!/usr/bin/env node
/**
 * TELEFON KURULUMU (60.5) — yalnız BU bilgisayardan çalışır (panelden PIN/jeton ayarlanamaz).
 *
 *   npm run acil-pin                       → telefondan acil durdurma PIN'ini belirle/değiştir (6–12 hane, iki kez)
 *   npm run acil-pin -- --sil              → PIN'i sil (telefondan acil durdurma KAPANIR)
 *   npm run telefon-jeton                  → panel jetonunu göster (yoksa üretir: data/telefon-jeton.json)
 *   npm run telefon-jeton -- --adres https://<makine>.<ağ>.ts.net   → telefonda açılacak adres + karekod
 *   npm run telefon-jeton -- --yeni        → jetonu yenile (telefonlardaki oturumlar düşer; kayıp telefon)
 *
 * PIN'den yalnız scrypt özeti saklanır (data/acil-pin.json — lib/acilPin.js). Jeton sırası lib/guvenlik.js
 * `jetonBul` ile aynı (PANEL_TOKEN → data/secrets.json panelToken → data/telefon-jeton.json). Çalışan sunucu
 * yeni PIN'i hemen, yeni jetonu en geç 5 sn içinde kullanır — yeniden başlatma gerekmez.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const guvenlik = require('../lib/guvenlik');
const acilPinLib = require('../lib/acilPin');

const ROOT = path.join(__dirname, '..');
const JETON_DOSYA = yollar.veri('telefon-jeton.json');

/** Ekrana yazmadan (yıldızla) bir satır okur; TTY değilse düz satır. */
function gizliOku(soru) {
  return new Promise((coz, red) => {
    const g = process.stdin;
    process.stdout.write(soru);
    if (!g.isTTY) {
      let tampon = '';
      g.setEncoding('utf8');
      const veri = (p) => { tampon += p; const i = tampon.indexOf('\n'); if (i >= 0) { g.removeListener('data', veri); g.pause(); process.stdout.write('\n'); coz(tampon.slice(0, i).replace(/\r$/, '')); } };
      g.on('data', veri); g.resume();
      return;
    }
    let deger = '';
    g.setRawMode(true); g.resume(); g.setEncoding('utf8');
    const tus = (c) => {
      for (const ch of c) {
        if (ch === '\u0003') { g.setRawMode(false); process.stdout.write('\n'); red(new Error('iptal')); return; }
        if (ch === '\r' || ch === '\n') { g.setRawMode(false); g.pause(); g.removeListener('data', tus); process.stdout.write('\n'); coz(deger); return; }
        if (ch === '\u0008' || ch === '\u007f') { if (deger) { deger = deger.slice(0, -1); process.stdout.write('\b \b'); } continue; }
        deger += ch; process.stdout.write('*');
      }
    };
    g.on('data', tus);
  });
}

async function pinKomutu(argv) {
  const pin = acilPinLib.olustur();
  if (argv.includes('--sil')) {
    pin.sil();
    console.log('✓ Acil PIN silindi — telefondan acil durdurma KAPALI (masaüstü panel etkilenmez).');
    return;
  }
  console.log('Telefondan ACİL DURDURMA için PIN (6–12 hane, panel jetonundan FARKLI). Acil durdurma: bot durur,');
  console.log('emirler iptal edilir, TÜM pozisyonlar piyasadan kapanır, BTC satılır — geri alınamaz.\n');
  const a = await gizliOku('Yeni PIN: ');
  if (!acilPinLib.pinGecerliMi(a)) throw new Error('PIN 6–12 haneli bir sayı olmalı.');
  if (/^(\d)\1+$/.test(a) || '01234567890'.includes(a) || '09876543210'.includes(a)) throw new Error('Tahmin edilebilir PIN (tekrar/ardışık) — başka bir PIN seçin.');
  const b = await gizliOku('PIN (tekrar): ');
  if (a !== b) throw new Error('İki PIN aynı değil.');
  pin.ayarla(a);
  console.log(`✓ Acil PIN kaydedildi (yalnız özeti: ${path.relative(ROOT, pin.dosya)}). Çalışan sunucu hemen kullanır.`);
  console.log('  Yanlış PIN: 15 dakikada 5 deneme → kilit + Telegram uyarısı.');
}

async function jetonKomutu(argv) {
  const yeni = argv.includes('--yeni');
  const ai = argv.indexOf('--adres');
  const adres = ai >= 0 ? String(argv[ai + 1] || '') : '';
  let b = guvenlik.jetonBul(ROOT);
  if (yeni && b && b.kaynak !== 'data/telefon-jeton.json') {
    throw new Error(`Jeton ${b.kaynak} kaynağından geliyor — orayı değiştirin (yalnız data/telefon-jeton.json bu komutla yenilenir).`);
  }
  if (!b || yeni) {
    const jeton = guvenlik.yeniJeton();
    fs.mkdirSync(path.dirname(JETON_DOSYA), { recursive: true });
    fs.writeFileSync(JETON_DOSYA, JSON.stringify({ jeton, olusturma: new Date().toISOString() }, null, 2), { encoding: 'utf8', mode: 0o600 });
    b = { jeton, kaynak: `data/telefon-jeton.json (${yeni ? 'yenilendi — eski oturumlar düştü' : 'yeni üretildi'})` };
  }
  console.log(`Panel jetonu (${b.kaynak}):\n\n  ${b.jeton}\n`);
  if (adres) {
    if (!/^https:\/\/[a-z0-9.-]+\.ts\.net\/?$/i.test(adres)) console.log('  ⚠ Adres https://<makine>.<ağ>.ts.net biçiminde değil — Tailscale adını `tailscale serve status` ile görün.');
    const tam = `${adres.replace(/\/$/, '')}/#jeton=${b.jeton}`;
    console.log(`Telefonda açın (Tailscale açıkken):\n\n  ${tam}\n`);
    try { const qr = require('qrcode-terminal'); await new Promise((c) => qr.generate(tam, { small: true }, (s) => { console.log(s); c(); })); }
    catch { console.log('  (karekod için `npm install` — adres yeterli)'); }
    console.log('Giriş bir kez yapılır (30 gün). Bu adres + jeton = panele erişim: kimseyle paylaşmayın.');
  }
}

async function ana() {
  const [komut, ...argv] = process.argv.slice(2);
  if (komut === 'pin') return pinKomutu(argv);
  if (komut === 'jeton') return jetonKomutu(argv);
  console.log('Kullanım: npm run acil-pin [-- --sil] · npm run telefon-jeton [-- --adres https://<makine>.<ağ>.ts.net] [--yeni]');
  process.exitCode = 2;
}

if (require.main === module) ana().catch((e) => { console.error('✗ ' + e.message); process.exitCode = 1; });
module.exports = { gizliOku };
