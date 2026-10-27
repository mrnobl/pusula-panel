'use strict';
/**
 * DENETLEYİCİ BEKLEMESİ (62.0, DENETIM-CANLI-ALTYAPI O1) — scripts/start-bot.cmd çağırır.
 *
 * Eskiden sunucu her çöküşte sabit 10 sn sonra, sonsuza kadar yeniden açılıyordu: kalıcı bir hatada (bozuk ayar, eksik paket,
 * port dolu) saatte yüzlerce açılış, her birinde Binance bağlantısı ve "Bot çöktü" Telegram'ı.
 *
 *   node scripts/denetleyici-bekle.js --basla      → açılış zamanını yazar (data/denetleyici.json); 78.1: konsol günlüklerini döndürür (lib/doktor/bakim.js D1);
 *                                                   S-026: yarım paket kurulumunu kurtarır / teşhis eder (lib/paketKurtar.js)
 *   node scripts/denetleyici-bekle.js <çıkışKodu>  → kaç saniye beklenecek (stdout'a yalnız sayı)
 *
 * Kural: süreç HIZLI_SN'den kısa yaşadıysa ardışık hızlı çökme sayacı artar → bekleme 10 · 30 · 60 · 300 sn (sonra 300).
 * Uzun yaşadıysa sayaç sıfırlanır (10 sn). Çıkış 75 (güncelleme yeniden başlatması) sayılmaz: 3 sn. 5. ardışık hızlı çökmede
 * Telegram'a bir kez alarm (lib/telegramDosya.js — araştırma kopyasında göndermez) + sağlık sinyali (healthchecks) fail.
 * S-013: alarm eksik kritik dosyayı ve konsoldaki son "Cannot find module" satırını yazar (antivirüs karantinası adımı).
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

/** S-013 (2026-10-27): konsol günlüğünün son ~32 KB'ındaki son "Cannot find module" satırı (yoksa null). Yalnız okuma. */
function sonEksikModul(dosya = process.env.PUSULA_KONSOL_GUNLUGU || yollar.veri('sunucu-konsol.log')) {
  try {
    const st = fs.statSync(dosya);
    const boy = Math.min(st.size, 32 * 1024);
    const fd = fs.openSync(dosya, 'r');
    const b = Buffer.alloc(boy);
    try { fs.readSync(fd, b, 0, boy, st.size - boy); } finally { fs.closeSync(fd); }
    const l = [...b.toString('utf8').matchAll(/Cannot find module '([^']+)'/g)];
    return l.length ? l[l.length - 1][1].slice(0, 200) : null;
  } catch { return null; }
}
/**
 * Saf (öz test): çökme döngüsü Telegram satırları. S-013: eksik kritik dosya (lib/programDosyalari.js eksikKritik — yalnız existsSync) ya da
 * konsoldaki "Cannot find module" varsa neden ve "antivirüs karantinası" adımı eklenir.
 */
function alarmSatirlari(cikis, ardisik, { eksik = [], modul = null } = {}) {
  const l = [`Pusula ${ardisik} kez üst üste açılıp ${HIZLI_SN} saniye içinde kapandı (son çıkış kodu ${cikis}).`];
  if (eksik.length || modul) {
    l.push(`Son çıkış nedeni: ${modul ? `"Cannot find module '${modul}'"` : 'program dosyası eksik'}${eksik.length ? ` · diskte olmayan: ${eksik.slice(0, 6).join(', ')}${eksik.length > 6 ? ` +${eksik.length - 6}` : ''}` : ''}.`);
    l.push('Antivirüs karantinası olabilir: antivirüs › Karantina › C:\\Pusula dosyalarını geri yükleyin, klasörü istisnaya ekleyin (git checkout / reset YAPMAYIN). Onarım Rehberi › S-013.');
  }
  l.push('Denetleyici artık 5 dakikada bir deniyor. Neden: data\\sunucu-konsol.log son satırları (bozuk ayar, port dolu, eksik paket?).');
  return l;
}

async function alarmGonder(cikis, ardisik) {
  let eksik = [];
  try { eksik = require('../lib/programDosyalari').eksikKritik(KOK); } catch { /* */ }
  const satirlar = alarmSatirlari(cikis, ardisik, { eksik, modul: sonEksikModul() });
  try { await require('../lib/telegramDosya').telegramDosyadan(KOK)('critical', 'Pusula açılamıyor — çökme döngüsü', satirlar); } catch { /* */ }
  try {
    let url = '';
    try { url = (require('../lib/sirKasasi').okuGuvenli(yollar.veri('secrets.json'), {}) || {}).healthchecksSunucuUrl || ''; } catch { /* */ }
    const makine = (() => { try { return JSON.parse(fs.readFileSync(yollar.veri('makine.json'), 'utf8')); } catch { return null; } })();
    if (url && /^https:\/\//.test(url) && !(makine && makine.arastirmaModu)) await fetch(`${url.replace(/\/+$/, '')}/fail`, { method: 'POST', body: satirlar.join('\n'), signal: AbortSignal.timeout(8000) });
  } catch { /* */ }
}

if (require.main === module) {
  (async () => {
    const a = process.argv[2];
    const d = oku();
    if (a === '--basla') {
      yaz({ ...d, basla: Date.now() });
      // 78.1 PUSULA DOKTORU D1: node server.js henüz başlamadı (konsol günlüğü açık değil) — büyüyen sunucu-konsol.log / supervisor.log
      // .1'e döndürülür (20 MB üstü, en çok 3 kopya; yasak saatte ve dosya açıkken atlanır). Yalnız Node fs; hata verirse açılış aynen sürer.
      try { require('../lib/doktor/bakim').acilisDondur(); } catch { /* döndürülemedi — Pusula yine açılır */ }
      // S-026 (2026-10-27): güncelleme paket kurulumu (npm ci) yarıda kaldıysa (elektrik / süreç ölümü) eski kod + eski paketler geri konur
      // ya da yalnız teşhis edilir — lib/paketKurtar.js (yalnız fs.rename + git reset --keep; silme yok; koşullar tutmazsa dokunmaz).
      try { await require('../lib/paketKurtar').acilisKurtar({ kok: KOK, bildir: (s, b, l) => require('../lib/telegramDosya').telegramDosyadan(KOK)(s, b, l) }); } catch { /* kurtarma denenemedi — Pusula yine açılır */ }
      return;
    }
    const cikis = parseInt(a, 10);
    const k = karar(d, Number.isFinite(cikis) ? cikis : -1, Date.now());
    yaz(k.durum);
    if (k.alarm) await alarmGonder(cikis, k.durum.ardisik);
    process.stdout.write(String(k.bekleSn));
  })().catch(() => process.stdout.write('10'));
}

module.exports = { karar, HIZLI_SN, BEKLEME, ALARM_ESIK, alarmSatirlari, sonEksikModul };
