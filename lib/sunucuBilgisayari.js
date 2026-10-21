'use strict';
/**
 * SUNUCU BİLGİSAYARININ SAĞLIĞI (69.2, öz denetim "Sunucu bilgisayarı" grubu) — Pusula'yı en çok Windows durdurur:
 * güncelleme sonrası zorunlu yeniden başlatma, uyku / hazırda bekleme, elektrik kesintisi. Saatte bir, yalnız OKUR
 * (reg query, powercfg /q, PowerShell CIM + olay günlüğü); hiçbir ayarı değiştirmez, yönetici izni istemez.
 *
 *   bekleyen yeniden başlatma  HKLM\…\WindowsUpdate\Auto Update\RebootRequired, …\Component Based Servicing\RebootPending
 *   etkin saatler              HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings ActiveHoursStart/End (Windows bu aralıkta
 *                              kendiliğinden yeniden başlatmaz; 03:02 günlük çalışması aralığın içinde olmalı)
 *   uyku / hazırda bekleme     powercfg /q SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | HIBERNATEIDLE (AC, saniye; 0 = asla)
 *   pil                        Win32_Battery.BatteryStatus (1 = pilden çalışıyor → elektrik kesik olabilir)
 *   beklenmeyen kapanma        System günlüğü Kernel-Power 41 / EventLog 6008, son 7 gün
 * Ayrıştırıcılar saf (öz test); `olc(calistir)` komutları verilen çalıştırıcıyla koşar.
 */

/** reg query çıktısı → DWORD değeri (yoksa null). */
function regDword(cikti, ad) {
  const m = new RegExp(`${ad}\\s+REG_DWORD\\s+0x([0-9a-f]+)`, 'i').exec(String(cikti || ''));
  return m ? parseInt(m[1], 16) : null;
}

/** powercfg /q çıktısı → { ac, dc } saniye (son iki "Current … Power Setting Index"). Etiketler Türkçe Windows'ta da İngilizce. */
function powercfgAyristir(cikti) {
  const ac = /Current AC Power Setting Index:\s*0x([0-9a-f]+)/i.exec(String(cikti || ''));
  const dc = /Current DC Power Setting Index:\s*0x([0-9a-f]+)/i.exec(String(cikti || ''));
  return { ac: ac ? parseInt(ac[1], 16) : null, dc: dc ? parseInt(dc[1], 16) : null };
}

/** Etkin saatler [bas, bit) saat (bit ertesi güne taşabilir: 9 → 2). Saat `s` içinde mi? */
function etkinSaatte(bas, bit, s) {
  if (!Number.isInteger(bas) || !Number.isInteger(bit)) return null;
  if (bas === bit) return true;
  return bas < bit ? s >= bas && s < bit : s >= bas || s < bit;
}

/** PowerShell satırları "pil:2:97", "olay:2:<iso>", "acilis:<iso>" → nesne. */
function psAyristir(cikti) {
  const o = { pil: null, olay: { adet: 0, son: null }, acilis: null };
  for (const s of String(cikti || '').split(/\r?\n/)) {
    let m;
    if ((m = /^pil:(yok|\d+)(?::(\d+))?/.exec(s.trim()))) o.pil = m[1] === 'yok' ? { var: false } : { var: true, durum: +m[1], yuzde: m[2] != null ? +m[2] : null, pilde: +m[1] === 1 };
    else if ((m = /^olay:(\d+)(?::(.+))?/.exec(s.trim()))) o.olay = { adet: +m[1], son: m[2] ? Date.parse(m[2]) : null };
    else if ((m = /^acilis:(.+)/.exec(s.trim()))) { const t = Date.parse(m[1]); o.acilis = Number.isFinite(t) ? t : null; }
  }
  return o;
}

const PS = [
  "$b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue; if ($b) { 'pil:' + $b.BatteryStatus + ':' + $b.EstimatedChargeRemaining } else { 'pil:yok' }",
  "$t=(Get-Date).AddDays(-7); try { $e = @(Get-WinEvent -FilterHashtable @{LogName='System'; Id=41,6008; StartTime=$t} -ErrorAction Stop); 'olay:' + $e.Count + ':' + $e[0].TimeCreated.ToString('o') } catch { 'olay:0' }",
  "'acilis:' + (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToString('o')",
].join('; ');

/**
 * @param calistir (komut, args, {sure}) → Promise<{ kod, cikti }>
 * @returns {{ platform, yenidenBaslatma: {bekliyor, kaynak[]}, etkin: {bas, bit}|null, uyku: {ac, dc}, hazirda: {ac, dc}, pil, olay, acilis, hatalar[] }}
 */
async function olc(calistir, platform = process.platform) {
  if (platform !== 'win32') return { platform, desteklenmiyor: true };
  const hatalar = [];
  const guvenli = async (k, a, sure = 20000) => { try { return await calistir(k, a, { sure }); } catch (e) { hatalar.push(`${k}: ${e.message}`); return { kod: 1, cikti: '' }; } };
  const UX = 'HKLM\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings';
  const [rr, rp, ux, sb, hb, ps] = await Promise.all([
    guvenli('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired']),
    guvenli('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending']),
    guvenli('reg', ['query', UX]),
    guvenli('powercfg', ['/q', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE']),
    guvenli('powercfg', ['/q', 'SCHEME_CURRENT', 'SUB_SLEEP', 'HIBERNATEIDLE']),
    guvenli('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS], 45000),
  ]);
  const kaynak = [];
  if (rr.kod === 0) kaynak.push('Windows Update');
  if (rp.kod === 0) kaynak.push('bileşen kurulumu');
  const bas = regDword(ux.cikti, 'ActiveHoursStart'), bit = regDword(ux.cikti, 'ActiveHoursEnd');
  const p = psAyristir(ps.cikti);
  return {
    platform, yenidenBaslatma: { bekliyor: kaynak.length > 0, kaynak }, etkin: bas != null && bit != null ? { bas, bit } : null,
    uyku: sb.kod === 0 ? powercfgAyristir(sb.cikti) : null, hazirda: hb.kod === 0 ? powercfgAyristir(hb.cikti) : null,
    pil: p.pil, olay: p.olay, acilis: p.acilis, hatalar,
  };
}

module.exports = { olc, regDword, powercfgAyristir, etkinSaatte, psAyristir };
