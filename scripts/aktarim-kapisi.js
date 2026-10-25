'use strict';
/**
 * A4 — CANLI HESAP AKTARIM KAPISI: YAZILI KARAR (TASARIM-MAKINE-HESAP-BOT §8.2, §11 #12). YALNIZ SUNUCU BİLGİSAYARINDA, kullanıcı çalıştırır.
 * Kayıt `<veri>/live/aktarim-kapisi.json` (git'e girmez). lib/aktarim/kapi.js okur. Bu dosya TEK BAŞINA kapıyı açmaz: canlı hesap
 * kapısının genel şartları (2027-01-05, G1–G9 yazılı onayı, araştırma modu değil), aktarım anahtarı (çekme izni KAPALI), bot tarafların
 * canlı hesapta olması ayrıca denetlenir. Panelden ya da config'ten AÇILAMAZ.
 *
 *   npm run aktarim-kapisi                                          → durum (kapı açık mı, eksikler)
 *   npm run aktarim-kapisi -- --ac --gerekce "…en az 10 harf…"      → kapıyı aç (2027-01-05'ten önce reddedilir)
 *   npm run aktarim-kapisi -- --kapat                               → kapıyı kapat (her zaman serbest)
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const CK = require('../lib/live/canliKapi');
const KAPI = require('../lib/aktarim/kapi');

const DOSYA = yollar.veri('live', 'aktarim-kapisi.json');
const arg = (ad) => { const i = process.argv.indexOf(`--${ad}`); return i > 0 ? process.argv[i + 1] : undefined; };
const var_ = (ad) => process.argv.includes(`--${ad}`);
const oku = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

function yaz(v) {
  fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
  const g = `${DOSYA}.${process.pid}.tmp`;
  fs.writeFileSync(g, JSON.stringify(v, null, 1) + '\n');
  fs.renameSync(g, DOSYA);
}

(() => {
  if (fs.existsSync(yollar.veri('makine.json')) || process.env.ARASTIRMA_MODU === '1') {
    console.log('Bu geliştirme bilgisayarı (araştırma kopyası) — canlı hesap aktarım kapısı yalnız sunucuda açılır.');
    process.exitCode = 1; return;
  }
  if (var_('kapat')) {
    const d = oku(DOSYA);
    if (d) yaz({ ...d, acik: false, kapandi: new Date().toISOString() });
    console.log('Canlı hesap aktarım kapısı KAPALI. (Prova kipi çalışmaya devam eder.)');
    return;
  }
  if (var_('ac')) {
    const gerekce = String(arg('gerekce') || '').trim();
    const bugun = new Date().toISOString().slice(0, 10);
    if (bugun < CK.CANLI_EN_ERKEN) { console.log(`Reddedildi: canlı hesap aktarımı en erken ${CK.CANLI_EN_ERKEN} (canlı hesap kapısıyla birlikte; bugün ${bugun}).`); process.exitCode = 1; return; }
    if (gerekce.length < 10) { console.log('Reddedildi: --gerekce "…" en az 10 harf olmalı (neden açıyorsunuz?).'); process.exitCode = 1; return; }
    yaz(KAPI.dosyaOlustur({ gerekce }));
    console.log('Aktarım kapısı dosyası yazıldı. Kapı ancak diğer şartlar da sağlanınca açılır:');
  }
  const k = KAPI.denetle({ simdi: Date.now(), dosya: oku(DOSYA), kapilar: oku(yollar.veri('live', 'canli-kapilar.json')), arastirma: false });
  console.log(k.izin ? 'Canlı hesap aktarım kapısı: AÇIK (genel şartlar tamam; anahtar ve bot şartları panelde ayrıca denetlenir).' : 'Canlı hesap aktarım kapısı: KAPALI');
  for (const e of k.eksikler) console.log(`  · ${e.kod}: ${e.metin}`);
})();
