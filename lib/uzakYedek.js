'use strict';
/**
 * ŞİFRELİ UZAK YEDEK (69.4) — günlük yerel yedeğin (lib/yedek.js) şifreli bulut kopyası: restic + rclone (ikisi de ücretsiz, açık kaynak).
 * ═══════════════════════════════════════════════════════════════════════════
 * Neden: yerel kopya ve USB, sunucu çalınır / yanar / diski bozulursa kopyayla birlikte gider (3-2-1 kuralı: bir kopya başka yerde).
 * restic depoyu her zaman parolayla şifreler (bulut sağlayıcısı içeriği göremez); rclone ücretsiz bir bulut hesabına (Google Drive,
 * OneDrive …) yazar. Kurulum kullanıcıda: `winget install restic.restic rclone.rclone`, `rclone config`, sonra
 * `npm run uzak-yedek -- --kur --depo rclone:<uzak>:PusulaYedek` (parola sır kasasına — lib/sirKasasi.js — yazılır, depo açılır).
 *
 * Ayar: data/yedek-ayar.json `uzak` { depo, restic?, rclone?, son?, sonBakim? } (yol yoksa PATH'teki restic / rclone).
 * Parola: secrets.json `uzakYedek.parola` (DPAPI). Kaybolursa yedek AÇILAMAZ — kullanıcı ayrıca iki yerde saklar.
 * Saklama: restic forget --keep-daily 14 --keep-weekly 8 --prune (yerel düzenle aynı) + restic check — haftada bir.
 * Sırlar: yerel kopya bulut klasörü değilse secrets.json'u da içerir; restic şifrelediği için buluta düz gitmez (ve dosya zaten DPAPI zarfı).
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const HAFTA = 7 * 864e5;

const varsayilanCalistir = (komut, args, o = {}) => new Promise((coz) => {
  execFile(komut, args, { timeout: o.sure || 30 * 60000, windowsHide: true, encoding: 'utf8', maxBuffer: 64 << 20, env: o.env || process.env },
    (e, out, err) => coz({ kod: e ? (Number.isInteger(e.code) ? e.code : 1) : 0, cikti: `${out || ''}`, hata: `${err || ''}${e && !Number.isInteger(e.code) ? e.message : ''}` }));
});

/** restic ortamı: depo + parola ortam değişkenleriyle (komut satırında görünmez). */
function ortam(ayar, parola) {
  return { ...process.env, RESTIC_REPOSITORY: ayar.depo, RESTIC_PASSWORD: parola, RESTIC_PROGRESS_FPS: '0.1' };
}
const ekArgs = (ayar) => (ayar.rclone ? ['-o', `rclone.program=${ayar.rclone}`] : []);

/** restic backup --json çıktısı → { snapshot, dosya, bayt } (summary satırı). */
function ozetAyristir(cikti) {
  const satir = String(cikti || '').split(/\r?\n/).reverse().find(s => s.includes('"message_type":"summary"'));
  if (!satir) return null;
  try { const j = JSON.parse(satir); return { snapshot: j.snapshot_id || null, dosya: (j.files_new || 0) + (j.files_changed || 0) + (j.files_unmodified || 0), bayt: j.total_bytes_processed || null, eklenen: j.data_added || null }; } catch { return null; }
}

/**
 * @param o.klasor  yedeklenecek yerel klasör (bugünün yerel kopyası)
 * @param o.ayar    { depo, restic?, rclone?, sonBakim? }
 * @param o.parola  restic parolası
 * @param o.calistir (komut, args, {sure, env}) → Promise<{kod, cikti, hata}>
 * @param o.simdi
 * @returns {{ ok, zaman, snapshot?, dosya?, bayt?, bakim?: {ok, zaman, hata?}, hata? }}
 */
async function calistir({ klasor, ayar, parola, calistir: cal = varsayilanCalistir, simdi = Date.now() }) {
  const zaman = new Date(simdi).toISOString();
  if (!ayar || !ayar.depo) return { ok: false, zaman, hata: 'uzak yedek kurulmamış (depo yok)' };
  if (!parola) return { ok: false, zaman, hata: 'uzak yedek parolası sır kasasında yok (npm run uzak-yedek -- --kur)' };
  if (!klasor || !fs.existsSync(klasor)) return { ok: false, zaman, hata: `yerel yedek klasörü yok: ${klasor}` };
  const restic = ayar.restic || 'restic';
  const env = ortam(ayar, parola);
  const b = await cal(restic, ['backup', klasor, '--json', '--tag', 'pusula', '--host', 'pusula-sunucu', ...ekArgs(ayar)], { env, sure: 60 * 60000 });
  if (b.kod !== 0) return { ok: false, zaman, hata: `restic backup başarısız (çıkış ${b.kod}): ${String(b.hata || b.cikti).trim().split('\n').slice(-2).join(' ').slice(0, 300)}` };
  const oz = ozetAyristir(b.cikti) || {};
  const sonuc = { ok: true, zaman, ...oz };
  const sonBakim = ayar.sonBakim && Date.parse(ayar.sonBakim.zaman);
  if (!Number.isFinite(sonBakim) || simdi - sonBakim >= HAFTA - 3600e3) {
    const f = await cal(restic, ['forget', '--tag', 'pusula', '--keep-daily', '14', '--keep-weekly', '8', '--prune', ...ekArgs(ayar)], { env, sure: 60 * 60000 });
    const c = f.kod === 0 ? await cal(restic, ['check', ...ekArgs(ayar)], { env, sure: 60 * 60000 }) : null;
    sonuc.bakim = { zaman, ok: f.kod === 0 && c && c.kod === 0, hata: f.kod !== 0 ? `forget: ${String(f.hata || f.cikti).trim().slice(-200)}` : c && c.kod !== 0 ? `check: ${String(c.hata || c.cikti).trim().slice(-200)}` : null };
  }
  return sonuc;
}

/** Deponun açılması (ilk kurulum): restic init; depo zaten varsa (config already exists) başarı sayılır. */
async function depoAc({ ayar, parola, calistir: cal = varsayilanCalistir }) {
  const r = await cal(ayar.restic || 'restic', ['init', ...ekArgs(ayar)], { env: ortam(ayar, parola), sure: 10 * 60000 });
  if (r.kod === 0) return { ok: true, yeni: true };
  if (/already (exists|initialized)|config file already exists/i.test(`${r.hata}${r.cikti}`)) return { ok: true, yeni: false };
  return { ok: false, hata: String(r.hata || r.cikti).trim().slice(-300) };
}

/** Kopya listesi (durum). */
async function kopyalar({ ayar, parola, calistir: cal = varsayilanCalistir }) {
  const r = await cal(ayar.restic || 'restic', ['snapshots', '--json', '--tag', 'pusula', ...ekArgs(ayar)], { env: ortam(ayar, parola), sure: 10 * 60000 });
  if (r.kod !== 0) return { ok: false, hata: String(r.hata || r.cikti).trim().slice(-300) };
  try { const l = JSON.parse(r.cikti || '[]'); return { ok: true, kopyalar: l.map(x => ({ id: x.short_id || String(x.id).slice(0, 8), zaman: x.time, yollar: x.paths })) }; } catch { return { ok: false, hata: 'snapshots çıktısı okunamadı' }; }
}

module.exports = { calistir, depoAc, kopyalar, ozetAyristir, HAFTA };
