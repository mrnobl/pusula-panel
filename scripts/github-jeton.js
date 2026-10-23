#!/usr/bin/env node
/**
 * GITHUB JETONU — PLAN-DIKKAT-LS.md §2.4 (787) için kullanıcının ücretsiz kişisel erişim jetonunu kaydeder.
 *
 *   npm run github-jeton            # jetonu gizli girişle sorar, GitHub'da doğrular, data/secrets.json → github.token
 *   npm run github-jeton -- --sil   # jetonu siler (diğer anahtarlar korunur)
 *   node scripts/github-jeton.js --oztest   # ağsız öz test (npm test zincirinde)
 *
 * Jeton hiçbir yere yazdırılmaz / loglanmaz; yalnız data/secrets.json'a (git dışı) atomik yazılır (UTF-8, BOM'suz).
 * Giriş ekranda görünmez (stdin ham kip). Terminal (TTY) değilse çalışmaz.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');

const VARSAYILAN_YOL = yollar.veri('secrets.json');

/** Dosyayı oku (BOM ayıklanır); yoksa {}. Bozuk JSON → hata (üzerine yazıp başka sırları silmemek için). */
function oku(yol) {
  if (!fs.existsSync(yol)) return {};
  const ham = fs.readFileSync(yol, 'utf8').replace(/^﻿/, '');
  if (!ham.trim()) return {};
  const j = require('../lib/sirKasasi').metinCoz(ham);   // 69.4: DPAPI zarfı çözülür (çözülemezse hata — üstüne yazılmaz)
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('secrets.json nesne değil');
  return j;
}
/** Mevcut sırlar + jeton → yeni nesne (diğer anahtarlar ve github altındaki diğer alanlar korunur). */
function birlestir(mevcut, token) {
  const o = { ...(mevcut || {}) };
  const g = o.github && typeof o.github === 'object' && !Array.isArray(o.github) ? { ...o.github } : {};
  g.token = token;
  o.github = g;
  return o;
}
/** Jetonu çıkar; github nesnesi boş kalırsa o da silinir. */
function cikar(mevcut) {
  const o = { ...(mevcut || {}) };
  if (o.github && typeof o.github === 'object') {
    const g = { ...o.github }; delete g.token;
    if (Object.keys(g).length) o.github = g; else delete o.github;
  }
  return o;
}
/** Atomik yazım: geçici dosya + rename; UTF-8, BOM yok. */
function yaz(yol, obj) {
  fs.mkdirSync(path.dirname(yol), { recursive: true });
  const tmp = yol + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, require('../lib/sirKasasi').metinUret(obj) + '\n', { encoding: 'utf8' });   // 69.4: Windows'ta DPAPI zarfı
  fs.renameSync(tmp, yol);
}
/** Jeton biçimi (ghp_…, github_pat_… ya da eski 40 hex). Boşluk içermez. */
const bicimUygun = (t) => typeof t === 'string' && /^[A-Za-z0-9_]{20,255}$/.test(t);

/** GET /rate_limit → { ok, kalan, limit, durum }. Jeton hiçbir mesajda yer almaz. */
async function dogrula(token) {
  const r = await fetch('https://api.github.com/rate_limit', {
    headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'pusula-dikkat-ls', Accept: 'application/vnd.github+json' },
  });
  if (r.status !== 200) return { ok: false, durum: r.status };
  const j = await r.json();
  const c = (j.resources && j.resources.core) || j.rate || {};
  return { ok: true, kalan: c.remaining, limit: c.limit, durum: 200 };
}

/** Gizli giriş (ham kip, yankı yok). */
function gizliSor(soru) {
  return new Promise((coz, red) => {
    const g = process.stdin;
    process.stdout.write(soru);
    let s = '';
    g.setRawMode(true); g.resume(); g.setEncoding('utf8');
    const bitir = (hata) => { g.setRawMode(false); g.pause(); g.removeListener('data', al); process.stdout.write('\n'); hata ? red(hata) : coz(s); };
    const al = (parca) => {
      for (const ch of parca) {
        if (ch === '\r' || ch === '\n') return bitir();
        if (ch === '\u0003') return bitir(new Error('iptal edildi'));
        if (ch === '\u0008' || ch === '\u007f') { s = s.slice(0, -1); continue; }
        if (ch >= ' ') s += ch;
      }
    };
    g.on('data', al);
  });
}

async function main(argv) {
  if (argv.includes('--oztest')) return oztest();
  const yol = VARSAYILAN_YOL;
  if (argv.includes('--sil')) {
    const m = oku(yol);
    if (!(m.github && m.github.token)) { console.log('Kayıtlı GitHub jetonu yok.'); return 0; }
    yaz(yol, cikar(m));
    console.log('GitHub jetonu silindi (data/secrets.json; diğer ayarlar korundu).');
    return 0;
  }
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    console.error('Bu komut jetonu gizli sormak için gerçek bir terminal ister — normal bir PowerShell penceresinde çalıştırın: npm run github-jeton');
    return 1;
  }
  console.log('GitHub ücretsiz kişisel erişim jetonu (yetki gerekmez; yalnız herkese açık depoları okur).');
  console.log('Yazdığınız karakterler ekranda görünmez. Bitince Enter.');
  let token;
  try { token = (await gizliSor('Jeton: ')).trim(); } catch (e) { console.error(e.message); return 1; }
  if (!bicimUygun(token)) { console.error('Jeton biçimi tanınmadı (boş ya da geçersiz karakter). Kaydedilmedi.'); return 1; }
  let d;
  try { d = await dogrula(token); } catch (e) { console.error('GitHub\'a ulaşılamadı (' + e.message.replace(token, '***') + '). Kaydedilmedi.'); return 1; }
  if (!d.ok) { console.error(`GitHub jetonu kabul etmedi (HTTP ${d.durum}). Kaydedilmedi.`); return 1; }
  yaz(yol, birlestir(oku(yol), token));
  console.log(`Jeton doğrulandı ve kaydedildi (data/secrets.json). Kalan istek hakkı: ${d.kalan} / ${d.limit} (saatlik).`);
  return 0;
}

function oztest() {
  const assert = require('assert');
  require('../lib/sirKasasi').ayarla({ etkin: false });   // biçim testi düz JSON üzerinde (DPAPI ayrı: scripts/sir-kasasi-selftest.js)
  const os = require('os');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ghjeton-'));
  const yol = path.join(d, 'secrets.json');
  // 1) dosya yok → yalnız github
  assert.deepStrictEqual(birlestir(oku(yol), 'ghp_' + 'a'.repeat(36)), { github: { token: 'ghp_' + 'a'.repeat(36) } });
  // 2) BOM'lu mevcut dosya: diğer anahtarlar korunur, BOM'suz yazılır
  fs.writeFileSync(yol, '﻿' + JSON.stringify({ telegram: { chatId: 1 }, github: { not: 'x', token: 'eski' } }));
  yaz(yol, birlestir(oku(yol), 'yeni_jeton_123456789012'));
  const ham = fs.readFileSync(yol);
  assert.notStrictEqual(ham[0], 0xEF, 'BOM yazılmamalı');
  const j = JSON.parse(ham.toString('utf8'));
  assert.deepStrictEqual(j, { telegram: { chatId: 1 }, github: { not: 'x', token: 'yeni_jeton_123456789012' } });
  // 3) sil: github.not kalır; tek alan ise github tümden gider
  assert.deepStrictEqual(cikar(j), { telegram: { chatId: 1 }, github: { not: 'x' } });
  assert.deepStrictEqual(cikar({ a: 1, github: { token: 't' } }), { a: 1 });
  assert.deepStrictEqual(cikar({ a: 1 }), { a: 1 });
  // 4) geçici dosya kalmadı; bozuk JSON üzerine yazılmaz
  assert.deepStrictEqual(fs.readdirSync(d), ['secrets.json']);
  fs.writeFileSync(yol, '{bozuk');
  assert.throws(() => oku(yol));
  // 5) biçim
  assert.ok(bicimUygun('ghp_' + 'A1'.repeat(18)) && bicimUygun('github_pat_' + 'x'.repeat(40)));
  assert.ok(!bicimUygun('') && !bicimUygun('a b c d e f g h i j k l') && !bicimUygun('kısa'));
  fs.rmSync(d, { recursive: true, force: true });
  console.log('github-jeton öz testi: 5/5 geçti');
  return 0;
}

if (require.main === module) main(process.argv.slice(2)).then(k => { process.exitCode = k; }, e => { console.error('✗ ' + e.message); process.exitCode = 1; });
module.exports = { oku, birlestir, cikar, yaz, bicimUygun, dogrula };
