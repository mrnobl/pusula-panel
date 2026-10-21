#!/usr/bin/env node
/**
 * KOD İMZASI (69.6, kullanıcı kararı 2026-10-21: "sunucu yalnız imzalı kodu kursun") — ağ isteği YOK.
 *
 * GELİŞTİRME BİLGİSAYARINDA (bir kez):
 *   npm run imza-kur
 *     · ~/.ssh/pusula_imza (ed25519) yoksa üretir, varsa yeniden kullanır
 *     · bu depoda VE dağıtım deposunda (../pusula-dagitim; sunucu oradan çeker): gpg.format=ssh, user.signingkey=<açık anahtar>, commit.gpgsign=true (+ Windows OpenSSH ssh-keygen)
 *     · sunucuya girilecek satırı yazdırır ("izinli imza satırı")
 *   npm run imza-kur -- --durum            bu depodaki ayar + son commit imzalı mı
 * SUNUCUDA (bir kez; satırı geliştirme bilgisayarındaki çıktıdan kopyalayın):
 *   npm run imza-kur -- --sunucu "<izinli imza satırı>"
 *     · satırı <veri>/makine/imza-izinli dosyasına yazar (depo DIŞINDA — gelen kod değiştiremez)
 *     · bundan sonra güncelleyici (lib/guncelleme.js imzaDenetle) her commit'in bu anahtarla imzalı olmasını şart koşar
 *   npm run imza-kur -- --sunucu-durum     dosya var mı, kaç anahtar
 * Not: GitHub'ın web arayüzünde birleştirilen commit'ler (ör. Dependabot PR'ı "Merge") GitHub'ın anahtarıyla imzalanır ve
 * izinli değildir → sunucu kurmaz. Birleştirmeyi geliştirme bilgisayarında yapın (git merge + imzalı commit).
 * Anahtar parolasızdır (otomatik commit'ler için); geliştirme bilgisayarı ele geçirilirse anahtar da geçer — o zaman
 * sunucuda imza-izinli dosyasını yeni anahtarla değiştirin.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('../lib/guncelleme');

const KOK = path.join(__dirname, '..');
const arg = process.argv.slice(2);
const deger = (ad) => { const i = arg.indexOf(ad); return i >= 0 ? arg[i + 1] : null; };
const ANAHTAR = path.join(os.homedir(), '.ssh', 'pusula_imza');

// Sunucu kodu DAĞITIM deposundan (pusula-panel) çeker: imza orada da açık olmalı. --dagitim <yol>, varsayılan ../pusula-dagitim.
const DAGITIM = path.resolve(KOK, deger('--dagitim') || path.join('..', 'pusula-dagitim'));
const depolar = () => [KOK, DAGITIM].filter((d, i, a) => a.indexOf(d) === i && fs.existsSync(path.join(d, '.git')));
const git = (a, cwd = KOK) => { const r = spawnSync('git', G.guvenliGit(a), { cwd, encoding: 'utf8', windowsHide: true }); return { kod: r.status == null ? 1 : r.status, cikti: `${r.stdout || ''}${r.stderr || ''}` }; };
const KEYGEN = () => G.sshKeygenBul() || 'ssh-keygen';

/** Saf: açık anahtar satırı ("ssh-ed25519 AAAA… yorum") + kimlik → allowed_signers satırı. Zaten satırsa olduğu gibi. */
function izinliSatir(girdi, kimlik = '*') {
  const s = String(girdi || '').trim();
  if (/^\S+\s+namespaces="git"\s+(ssh-ed25519|ssh-rsa|ecdsa-sha2-\S+|sk-\S+)\s+[A-Za-z0-9+/=]+/.test(s)) return s.split(/\r?\n/)[0];
  const m = /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-\S+|sk-\S+)\s+([A-Za-z0-9+/=]{40,})(\s+.*)?$/.exec(s);
  if (!m) return null;
  return `${kimlik} namespaces="git" ${m[1]} ${m[2]}${m[3] || ''}`;
}

function gelistirme() {
  fs.mkdirSync(path.dirname(ANAHTAR), { recursive: true });
  if (!fs.existsSync(ANAHTAR)) {
    const r = spawnSync(KEYGEN(), ['-q', '-t', 'ed25519', '-N', '', '-C', 'pusula-imza', '-f', ANAHTAR], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) throw new Error(`ssh-keygen başarısız: ${(r.stderr || r.stdout || r.error || '').toString().trim().slice(0, 200)}`);
    console.log(`İmza anahtarı üretildi: ${ANAHTAR}`);
  } else console.log(`Var olan imza anahtarı kullanılıyor: ${ANAHTAR}`);
  const pub = fs.readFileSync(`${ANAHTAR}.pub`, 'utf8').trim();
  const ayar = [['gpg.format', 'ssh'], ['user.signingkey', `${ANAHTAR}.pub`.replace(/\\/g, '/')], ['commit.gpgsign', 'true']];
  const kg = G.sshKeygenBul();
  if (kg) ayar.push(['gpg.ssh.program', kg.replace(/\\/g, '/')]);
  for (const d of depolar()) for (const [k, v] of ayar) { const r = git(['config', '--local', k, v], d); if (r.kod !== 0) throw new Error(`git config ${k} (${d}): ${r.cikti.trim()}`); }
  const eposta = git(['config', 'user.email']).cikti.trim();
  const satir = izinliSatir(pub, eposta && /@/.test(eposta) ? eposta : '*');
  console.log(`Commit imzası açıldı (gpg.format=ssh, commit.gpgsign=true): ${depolar().join(' · ')}`);
  if (!depolar().includes(DAGITIM)) console.log(`UYARI: dağıtım deposu bulunamadı (${DAGITIM}) — sunucuya giden commit'ler imzasız kalır; --dagitim <yol> ile yeniden çalıştırın.`);
  console.log('\nSUNUCUDA bir kez çalıştırın (tek satır, tırnaklarla):\n');
  console.log(`  npm run imza-kur -- --sunucu "${satir.replace(/"/g, '\\"')}"\n`);
  console.log('İzinli imza satırı:');
  console.log(`  ${satir}`);
}

function durum() {
  for (const d of depolar()) {
  const v = (k) => git(['config', '--local', '--get', k], d).cikti.trim() || '—';
  console.log(d);
  console.log(`gpg.format=${v('gpg.format')} · commit.gpgsign=${v('commit.gpgsign')} · user.signingkey=${v('user.signingkey')}`);
  const r = git(['log', '-1', '--format=%h %G? %GS'], d);
  console.log(`son commit: ${r.cikti.trim()} (G = imzalı ve izinli; N = imzasız; burada izinli liste yoksa imzalı commit "U"/"N" görünebilir)`);
  }
}

function sunucu(girdi) {
  const satir = izinliSatir(girdi);
  if (!satir) throw new Error('Geçerli bir imza satırı değil — geliştirme bilgisayarındaki "npm run imza-kur" çıktısını aynen kopyalayın.');
  const dosya = G.imzaDosyasi(KOK);
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  const eski = fs.existsSync(dosya) ? fs.readFileSync(dosya, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  const yeni = eski.includes(satir) ? eski : [...eski, satir];
  fs.writeFileSync(`${dosya}.tmp`, yeni.join('\n') + '\n', 'utf8');
  fs.renameSync(`${dosya}.tmp`, dosya);
  console.log(`İzinli imza kaydedildi: ${dosya} (${yeni.length} anahtar). Bundan sonra yalnız imzalı güncelleme kurulur.`);
}

function sunucuDurum() {
  const dosya = G.imzaDosyasi(KOK);
  if (!fs.existsSync(dosya)) { console.log(`İmza doğrulaması KURULMAMIŞ (${dosya} yok) — güncellemeler imzasız da kurulur (geçiş dönemi).`); return; }
  const l = fs.readFileSync(dosya, 'utf8').split(/\r?\n/).filter(x => x.trim() && !x.startsWith('#'));
  console.log(`İmza doğrulaması AÇIK: ${l.length} izinli anahtar (${dosya}).`);
}

if (require.main === module) {
  try {
    if (arg.includes('--sunucu')) sunucu(deger('--sunucu'));
    else if (arg.includes('--sunucu-durum')) sunucuDurum();
    else if (arg.includes('--durum')) durum();
    else gelistirme();
  } catch (e) { console.error(`HATA: ${e.message}`); process.exitCode = 1; }
}
module.exports = { izinliSatir, ANAHTAR };
