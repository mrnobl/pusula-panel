/**
 * DONMA BEKÇİSİ (73.6, S03) — "süreç yaşıyor ama yanıt vermiyor" durumunu yakalar.
 * ═══════════════════════════════════════════════════════════════════════════
 * Sorun: donmuş (olay döngüsü kilitli ya da HTTP sunucusu yanıtsız) ama YAŞAYAN süreci kimse yeniden başlatmıyordu: denetleyici
 * (scripts/start-bot.cmd) yalnız süreç ÇIKINCA açar, bekçi (pusula-sunucu.ps1 -Yinele) "denetleyici yaşıyor" deyip çıkar,
 * öz denetim kendi donmasını ölçemez.
 * Çözüm: ayrı bir İŞ PARÇACIĞI (worker_threads — ana döngü kilitlense de çalışır) dakikada bir kendi sürecinin
 * GET /api/health ucunu yoklar. Art arda `esik` (varsayılan 10) kez HİÇ yanıt gelmezse (503 de yanıttır, sayılmaz) ve süreç
 * en az 15 dk'dır açıksa: <veri>/donma.json'a yazar ve YALNIZ KENDİ PID'İNİ sonlandırır (process.kill(process.pid)) →
 * denetleyici 10 sn sonra yeniden açar. Başka hiçbir süreç kapatılmaz; alt süreç / PowerShell / kabuk YOK.
 * Yalnız denetleyiciyle başlatılmışsa (PUSULA_KONSOL_GUNLUGU) çalışır — yoksa kapanan süreci kimse açmazdı. Kapanış sürerken durur.
 */
'use strict';
const { Worker } = require('worker_threads');

const IS_KODU = `
const { parentPort, workerData } = require('worker_threads');
const http = require('http');
const fs = require('fs');
const { port, aralikMs, zamanAsimiMs, esik, ilkMs, dosya, bas } = workerData;
let ardisik = 0, dur = false;
parentPort.on('message', (m) => { if (m === 'dur') dur = true; });
function yokla() {
  return new Promise((coz) => {
    const q = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: zamanAsimiMs }, (r) => { r.resume(); coz(true); });
    q.on('timeout', () => { q.destroy(); coz(false); });
    q.on('error', () => coz(false));
  });
}
(async function dongu() {
  while (!dur) {
    await new Promise(r => setTimeout(r, aralikMs));
    if (dur) break;
    const ok = await yokla();
    ardisik = ok ? 0 : ardisik + 1;
    if (!ok && ardisik >= esik && Date.now() - bas >= ilkMs && !dur) {
      const kayit = { zaman: Date.now(), pid: process.pid, ardisik, neden: 'sağlık ucu ' + ardisik + ' kez üst üste yanıt vermedi — süreç dondu, kendi PID ile yeniden başlatılıyor' };
      try { fs.writeFileSync(dosya, JSON.stringify(kayit), 'utf8'); } catch (e) { /* */ }
      try { process.stderr.write('[DONMA BEKÇİSİ] ' + kayit.neden + '\\n'); } catch (e) { /* */ }
      process.kill(process.pid);   // YALNIZ kendi süreci; denetleyici yeniden açar
      return;
    }
  }
})();
`;

/**
 * @param o.port panel portu · o.dosya donma.json yolu · o.esik ardışık yanıtsız yoklama (10) · o.aralikMs (60 sn)
 * @returns { durdur() } | null (denetleyicisiz başlatmada çalışmaz)
 */
function baslat(o = {}) {
  if (!o.zorla && !process.env.PUSULA_KONSOL_GUNLUGU) return null;
  const w = new Worker(IS_KODU, { eval: true, workerData: {
    port: o.port || 3000, aralikMs: o.aralikMs || 60e3, zamanAsimiMs: o.zamanAsimiMs || 20e3, esik: o.esik || 10,
    ilkMs: o.ilkMs != null ? o.ilkMs : 15 * 60e3, dosya: o.dosya, bas: Date.now() } });
  w.unref();
  w.on('error', () => { /* bekçi düşerse Pusula etkilenmez */ });
  return { durdur: () => { try { w.postMessage('dur'); w.unref(); } catch { /* */ } }, worker: w };
}

/** Son donma kaydı (öz denetim / panel için) — yoksa null. */
function sonKayit(dosya) { try { return JSON.parse(require('fs').readFileSync(dosya, 'utf8')); } catch { return null; } }

module.exports = { baslat, sonKayit, IS_KODU };
