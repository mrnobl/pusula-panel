'use strict';
/**
 * DENETLEYİCİ BEKLEMESİ (62.0, DENETIM-CANLI-ALTYAPI O1) — scripts/start-bot.cmd çağırır.
 *
 * Eskiden sunucu her çöküşte sabit 10 sn sonra, sonsuza kadar yeniden açılıyordu: kalıcı bir hatada (bozuk ayar, eksik paket,
 * port dolu) saatte yüzlerce açılış, her birinde Binance bağlantısı ve "Bot çöktü" Telegram'ı.
 *
 *   node scripts/denetleyici-bekle.js --basla      → açılış zamanını yazar (data/denetleyici.json)
 *   node scripts/denetleyici-bekle.js <çıkışKodu>  → kaç saniye beklenecek (stdout'a yalnız sayı)
 *
 * Kural: süreç HIZLI_SN'den kısa yaşadıysa ardışık hızlı çökme sayacı artar → bekleme 10 · 30 · 60 · 300 sn (sonra 300).
 * Uzun yaşadıysa sayaç sıfırlanır (10 sn). Çıkış 75 (güncelleme yeniden başlatması) sayılmaz: 3 sn. 5. ardışık hızlı çökmede
 * Telegram'a bir kez alarm (lib/telegramDosya.js — araştırma kopyasında göndermez) + sağlık sinyali (healthchecks) fail.
 * Bu betik hata verirse start-bot.cmd 10 sn'ye düşer (eski davranış).
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');

const KOK = path.join(__dirname, '..');
const DOSYA = yollar.veri('denetleyici.json');
const HIZLI_SN = 120;
const BEKLEME = [10, 30, 60, 300];
const ALARM_ESIK = 5;

function oku() { try { return JSON.parse(fs.readFileSync(DOSYA, 'utf8')); } catch { return { ardisik: 0 }; } }
function yaz(d) { try { fs.mkdirSync(path.dirname(DOSYA), { recursive: true }); fs.writeFileSync(DOSYA, JSON.stringify(d, null, 2), 'utf8'); } catch { /* */ } }

/** Saf karar (öz test). @returns {{ bekleSn, durum, alarm }} */
function karar(d, cikis, simdi) {
  if (cikis === 75) return { bekleSn: 3, durum: { ...d, ardisik: 0 }, alarm: false };
  const yasadi = d.basla ? (simdi - d.basla) / 1000 : Infinity;
  const ardisik = yasadi < HIZLI_SN ? (d.ardisik || 0) + 1 : 0;
  const bekleSn = ardisik === 0 ? BEKLEME[0] : BEKLEME[Math.min(ardisik - 1, BEKLEME.length - 1)];
  const alarm = ardisik === ALARM_ESIK;
  return { bekleSn, durum: { ...d, ardisik, sonCikis: cikis, sonCikisZaman: simdi }, alarm };
}

async function alarmGonder(cikis, ardisik) {
  const satirlar = [`Pusula ${ardisik} kez üst üste açılıp ${HIZLI_SN} saniye içinde kapandı (son çıkış kodu ${cikis}).`,
    'Denetleyici artık 5 dakikada bir deniyor. Neden: data\\sunucu-konsol.log son satırları (bozuk ayar, port dolu, eksik paket?).'];
  try { await require('../lib/telegramDosya').telegramDosyadan(KOK)('critical', 'Pusula açılamıyor — çökme döngüsü', satirlar); } catch { /* */ }
  try {
    let url = '';
    try { url = (JSON.parse(fs.readFileSync(yollar.veri('secrets.json'), 'utf8')) || {}).healthchecksSunucuUrl || ''; } catch { /* */ }
    const makine = (() => { try { return JSON.parse(fs.readFileSync(yollar.veri('makine.json'), 'utf8')); } catch { return null; } })();
    if (url && /^https:\/\//.test(url) && !(makine && makine.arastirmaModu)) await fetch(`${url.replace(/\/+$/, '')}/fail`, { method: 'POST', body: satirlar.join('\n'), signal: AbortSignal.timeout(8000) });
  } catch { /* */ }
}

if (require.main === module) {
  (async () => {
    const a = process.argv[2];
    const d = oku();
    if (a === '--basla') { yaz({ ...d, basla: Date.now() }); return; }
    const cikis = parseInt(a, 10);
    const k = karar(d, Number.isFinite(cikis) ? cikis : -1, Date.now());
    yaz(k.durum);
    if (k.alarm) await alarmGonder(cikis, k.durum.ardisik);
    process.stdout.write(String(k.bekleSn));
  })().catch(() => process.stdout.write('10'));
}

module.exports = { karar, HIZLI_SN, BEKLEME, ALARM_ESIK };
