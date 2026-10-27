'use strict';
/**
 * PUSULA DOKTORU — D6 YEDEĞİ YENİDEN DENEME'nin TEK alt süreç noktası (onarım araştırması C §4.5 madde 2).
 * ═══════════════════════════════════════════════════════════════════════════
 * Yalnız `process.execPath` (çalışan node.exe) + SABİT betik yolu scripts/yedek.js — Windows görevi PusulaYedek'in her gün 05:30'da
 * çalıştırdığı komutun AYNISI (öz denetimdeki npm audit ile aynı yöntem: execFile, kabuk YOK, pencere gizli, zaman aşımı).
 * PowerShell / cmd / taskkill / shell:true YOK; argüman yok (hedef kayıtlı ayardan). scripts/doktor-motor-selftest.js bu dosyanın
 * lib/doktor içindeki TEK child_process kullanıcısı olduğunu ve yukarıdaki biçimi metinden denetler.
 * Varsayılan KAPALI kural (K4); yalnız yönetici açarsa ve motor etkin kipteyse çağrılır.
 */
const path = require('path');

const KOK = path.join(__dirname, '..', '..');
const BETIK = path.join(KOK, 'scripts', 'yedek.js');
const ZAMAN_ASIMI_MS = 30 * 60 * 1000;

/** @returns Promise<{ kod: 0 | sayı, cikti, hata }> — hata atmaz. */
function kos({ zamanAsimiMs = ZAMAN_ASIMI_MS, calistir } = {}) {
  const ex = calistir || require('child_process').execFile;
  return new Promise((coz) => {
    try {
      ex(process.execPath, [BETIK], { cwd: KOK, windowsHide: true, timeout: zamanAsimiMs, maxBuffer: 4 << 20, shell: false }, (e, out, err) => {
        coz({ kod: e ? (Number.isFinite(e.code) ? e.code : 1) : 0, cikti: String(out || '').slice(-600), hata: e ? String(err || e.message || '').slice(-300) : null });
      });
    } catch (e) { coz({ kod: 1, cikti: '', hata: String(e.message || e).slice(0, 300) }); }
  });
}

module.exports = { kos, BETIK };
