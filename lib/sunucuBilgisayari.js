'use strict';
/**
 * SUNUCU BİLGİSAYARININ SAĞLIĞI (69.2, öz denetim "Sunucu bilgisayarı" grubu) — Pusula'yı en çok Windows durdurur:
 * güncelleme sonrası zorunlu yeniden başlatma, uyku / hazırda bekleme. Saatte bir, yalnız OKUR; hiçbir ayarı
 * değiştirmez, yönetici izni istemez. Yalnız Windows'un kendi küçük araçları: reg query ve powercfg /q.
 *
 *   bekleyen yeniden başlatma  HKLM\…\WindowsUpdate\Auto Update\RebootRequired, …\Component Based Servicing\RebootPending
 *   etkin saatler              ilke HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate (scripts/windows-etkin-saat.ps1)
 *                              ya da HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings ActiveHoursStart/End (03:02 içinde olmalı)
 *   uyku / hazırda bekleme     powercfg /q SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | HIBERNATEIDLE (AC, saniye; 0 = asla)
 *   son açılış                 os.uptime()
 *
 * 70.0: PowerShell KULLANILMAZ. 69.2–69.9 pil / beklenmeyen kapanma / disk sağlığı / antivirüs / güvenlik duvarı / port /
 * klasör izni için arka planda `powershell -ExecutionPolicy Bypass` açıyordu; 2026-10-21/22 sunucudaki Kaspersky bunu
 * kötü amaçlı yazılım davranışı sayıp Pusula'yı (server.js) sildi. O ölçümler çıkarıldı (bellek feedback-sunucuyu-bozma).
 * Ayrıştırıcılar saf (öz test); `olc(calistir)` komutları verilen çalıştırıcıyla koşar.
 */
const os = require('os');

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

/**
 * @param calistir (komut, args, {sure}) → Promise<{ kod, cikti }>
 * @returns {{ platform, yenidenBaslatma: {bekliyor, kaynak[]}, etkin: {bas, bit, ilke}|null, uyku: {ac, dc}, hazirda: {ac, dc}, acilis, hatalar[] }}
 */
async function olc(calistir, platform = process.platform) {
  if (platform !== 'win32') return { platform, desteklenmiyor: true };
  const hatalar = [];
  const guvenli = async (k, a, sure = 20000) => { try { return await calistir(k, a, { sure }); } catch (e) { hatalar.push(`${k}: ${e.message}`); return { kod: 1, cikti: '' }; } };
  const UX = 'HKLM\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings';
  const ILKE = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate';   // 69.3: ilke (scripts/windows-etkin-saat.ps1) önce gelir
  const [rr, rp, ux, sb, hb, il] = await Promise.all([
    guvenli('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired']),
    guvenli('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending']),
    guvenli('reg', ['query', UX]),
    guvenli('powercfg', ['/q', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE']),
    guvenli('powercfg', ['/q', 'SCHEME_CURRENT', 'SUB_SLEEP', 'HIBERNATEIDLE']),
    guvenli('reg', ['query', ILKE]),
  ]);
  const kaynak = [];
  if (rr.kod === 0) kaynak.push('Windows Update');
  if (rp.kod === 0) kaynak.push('bileşen kurulumu');
  const ilkeVar = il.kod === 0 && regDword(il.cikti, 'SetActiveHours') === 1;
  const kaynakUx = ilkeVar ? il.cikti : ux.cikti;
  const bas = regDword(kaynakUx, 'ActiveHoursStart'), bit = regDword(kaynakUx, 'ActiveHoursEnd');
  return {
    platform, yenidenBaslatma: { bekliyor: kaynak.length > 0, kaynak }, etkin: bas != null && bit != null ? { bas, bit, ilke: ilkeVar } : null,
    uyku: sb.kod === 0 ? powercfgAyristir(sb.cikti) : null, hazirda: hb.kod === 0 ? powercfgAyristir(hb.cikti) : null,
    acilis: Date.now() - os.uptime() * 1000, hatalar,
  };
}

module.exports = { olc, regDword, powercfgAyristir, etkinSaatte };
