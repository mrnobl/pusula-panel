'use strict';
/**
 * GELİŞTİRME YAZMA JETONU (64.8) — YALNIZ EVDEKİ BİLGİSAYARDA çalıştırılır. Geliştirme bilgisayarının İşlem defterim ve
 * Portföyüm kayıtlarını sunucudaki panele yazabilmesi için ayrı bir jeton (panel/telefon jetonundan FARKLI) üretir.
 *
 *   npm run gelistirme-jeton            → yoksa üretir ve BİR KEZ gösterir; varsa yalnız "kurulu" der (jeton bir daha gösterilmez)
 *   npm run gelistirme-jeton -- --yeni  → yenisini üretir (eskisi hemen geçersiz; geliştirme bilgisayarında yeniden kaydedin)
 *   npm run gelistirme-jeton -- --kapat → siler (geliştirme bilgisayarından yazma kapanır; okuma sürer)
 *
 * Dosya: data/gelistirme-jeton.json — YALNIZ SHA-256 ÖZETİ (jetonun kendisi diskte durmaz). Çalışan sunucu yeni jetonu en geç
 * 5 sn içinde kullanır (yeniden başlatma gerekmez). Jeton yalnız lib/guvenlik.js GELISTIRME_YAZMA uçlarına yazar (bot, ayar,
 * güncelleme, OKX anahtarı yok). Geliştirme bilgisayarında: `npm run sunucu-baglanti -- --yazma-jeton <jeton>`.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const crypto = require('crypto');
const GV = require('../lib/guvenlik');

const KOK = path.join(__dirname, '..');
const DOSYA = GV.gelistirmeJetonYolu(KOK);

function main(argv = process.argv.slice(2), cikti = console.log, kok = KOK) {
  const dosya = GV.gelistirmeJetonYolu(kok);
  let makine = null;
  try { makine = JSON.parse(fs.readFileSync(yollar.programVeri(kok, 'makine.json'), 'utf8').replace(/^﻿/, '')); } catch { makine = null; }
  if (makine && makine.arastirmaModu) {
    cikti('✗ Bu bilgisayar geliştirme (araştırma modu) bilgisayarı — yazma jetonu EVDEKİ bilgisayarda üretilir. Burada `npm run sunucu-baglanti -- --yazma-jeton <jeton>` ile kaydedilir.');
    return 1;
  }
  if (argv.includes('--kapat')) {
    try { fs.unlinkSync(dosya); cikti('Geliştirme yazma jetonu silindi — geliştirme bilgisayarı artık yazamaz (okuma sürer).'); } catch { cikti('Zaten kapalı.'); }
    return 0;
  }
  let var_ = null;
  try { var_ = JSON.parse(fs.readFileSync(dosya, 'utf8')); } catch { var_ = null; }
  if (var_ && /^[0-9a-f]{64}$/.test(String(var_.ozet || '')) && !argv.includes('--yeni')) {
    cikti(`Geliştirme yazma jetonu kurulu (${String(var_.olusturma || '').slice(0, 16).replace('T', ' ')}). Jeton bir daha gösterilmez; kaybettiyseniz: npm run gelistirme-jeton -- --yeni`);
    return 0;
  }
  const jeton = crypto.randomBytes(32).toString('base64url');   // 256 bit
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  fs.writeFileSync(dosya, JSON.stringify({ ozet: GV.gelistirmeOzeti(jeton), olusturma: new Date().toISOString(), not: 'Yalnız SHA-256 özeti. Jeton geliştirme bilgisayarında data/ev-baglanti.json yazmaJetonu.' }, null, 2), { encoding: 'utf8', mode: 0o600 });
  cikti(`Geliştirme yazma jetonu ${var_ ? 'YENİLENDİ (eskisi geçersiz)' : 'üretildi'}. BİR KEZ gösteriliyor — geliştirme bilgisayarında şunu çalıştırın:\n\n  npm run sunucu-baglanti -- --yazma-jeton ${jeton}\n\nBu jeton yalnız İşlem defterim ve Portföyüm kayıtlarını yazar (bot, ayar, güncelleme, OKX anahtarı değil). Kimseyle paylaşmayın.`);
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { main, DOSYA };
