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
 *   69.6 GÜVENLİK (güvenlik testi O4, salt okuma): antivirüs (SecurityCenter2 ürünleri + Defender gerçek zamanlı koruma ve tanım
 *   yaşı), güvenlik duvarı profilleri, Pusula portunun dinlediği adres (yalnız 127.0.0.1 olmalı), Uzak Masaüstü (fDenyTSConnections),
 *   Pusula klasör izinleri (scripts/klasor-izin.ps1 -Durum; geniş = Everyone / Users / Authenticated Users / Guests).
 * Ayrıştırıcılar saf (öz test); `olc(calistir)` komutları verilen çalıştırıcıyla koşar.
 *
 * 69.9: PowerShell VARSAYILAN KAPALI (ek.powershell === true ile açılır). Sunucudaki Kaspersky, arka planda
 * `powershell -ExecutionPolicy Bypass` açan Pusula'yı virüs sanıp server.js'i sildi. Kapalıyken yalnız reg ve powercfg
 * çalışır (Windows'un kendi küçük araçları); pil, beklenmeyen kapanma ve disk sağlığı okunmaz, açılış zamanı os.uptime'dan.
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
  const o = { pil: null, olay: { adet: 0, son: null }, acilis: null, diskler: [] };
  for (const s of String(cikti || '').split(/\r?\n/)) {
    let m;
    if ((m = /^pil:(yok|\d+)(?::(\d+))?/.exec(s.trim()))) o.pil = m[1] === 'yok' ? { var: false } : { var: true, durum: +m[1], yuzde: m[2] != null ? +m[2] : null, pilde: +m[1] === 1 };
    else if ((m = /^olay:(\d+)(?::(.+))?/.exec(s.trim()))) o.olay = { adet: +m[1], son: m[2] ? Date.parse(m[2]) : null };
    else if ((m = /^acilis:(.+)/.exec(s.trim()))) { const t = Date.parse(m[1]); o.acilis = Number.isFinite(t) ? t : null; }
    else if ((m = /^disk:([^:]*):([^:]*):(.*)$/.exec(s.trim()))) o.diskler.push({ ad: m[1].trim(), saglik: m[2].trim(), durum: m[3].trim() });
    else if ((m = /^av:(.*):(\d+)$/.exec(s.trim()))) (o.av = o.av || []).push(avDurumu(m[1].trim(), +m[2]));
    else if ((m = /^mp:(True|False|):([^:]*):(True|False|)(?::(.*))?$/i.exec(s.trim()))) o.defender = { gercekZamanli: /true/i.test(m[1]), servis: /true/i.test(m[3]), tanim: m[4] ? Date.parse(m[4]) : null };
    else if ((m = /^fw:([^:]+):(True|False)$/i.exec(s.trim()))) (o.guvenlikDuvari = o.guvenlikDuvari || []).push({ profil: m[1], acik: /true/i.test(m[2]) });
    else if ((m = /^port:(.+)$/.exec(s.trim()))) (o.dinleme = o.dinleme || []).push(m[1].trim());
  }
  return o;
}

/**
 * SecurityCenter2 productState (belgelenmemiş ama yaygın kullanım): bayt 2 (0x00FF00) 0x10/0x11/0x20 → açık; bayt 3 (0x0000FF) 0x00 → tanımlar
 * güncel, 0x10 → eski. Saf.
 */
function avDurumu(ad, durum) {
  // 0x10 açık (Defender 0x11), 0x00/0x01 kapalı/ertelenmiş; bazı üçüncü taraf ürünler 0x20 yazıyor (açık sayılır, doğrulanmadı).
  const orta = (durum >> 8) & 0xff;
  const acik = (orta & 0x30) !== 0;
  const guncel = (durum & 0xff) === 0x00;
  return { ad, durum, acik, guncel };
}

const PS = [
  "$b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue; if ($b) { 'pil:' + $b.BatteryStatus + ':' + $b.EstimatedChargeRemaining } else { 'pil:yok' }",
  "$t=(Get-Date).AddDays(-7); try { $e = @(Get-WinEvent -FilterHashtable @{LogName='System'; Id=41,6008; StartTime=$t} -ErrorAction Stop); 'olay:' + $e.Count + ':' + $e[0].TimeCreated.ToString('o') } catch { 'olay:0' }",
  "'acilis:' + (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToString('o')",
  // 69.4 disk sağlığı (SMART'tan türeyen Windows değerlendirmesi; ek araç yok)
  "Get-PhysicalDisk -ErrorAction SilentlyContinue | ForEach-Object { 'disk:' + ($_.FriendlyName -replace ':', ' ') + ':' + $_.HealthStatus + ':' + $_.OperationalStatus }",
].join('; ');
/**
 * 69.6 güvenlik sorguları — 69.8'den beri VARSAYILAN KAPALI (ek.guvenlik === true ile açılır). 2026-10-21 sunucuda Kaspersky
 * davranış izleyicisi Pusula'yı (server.js) 'PDM:Trojan.Win32.Generic' diye silip karantinaya aldı: antivirüs ürünlerini,
 * güvenlik duvarını ve dinleyen portları soran bir arka plan programı casus yazılım gibi görünüyor. Kullanıcı kuralı: sunucuyu
 * bozacak davranış eklenmez (bellek feedback-sunucuyu-bozma).
 */
const PS_GUVENLIK = [
  "Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction SilentlyContinue | ForEach-Object { 'av:' + ($_.displayName -replace ':', ' ') + ':' + $_.productState }",
  "try { $m = Get-MpComputerStatus -ErrorAction Stop; 'mp:' + $m.RealTimeProtectionEnabled + ':x:' + $m.AMServiceEnabled + ':' + $m.AntivirusSignatureLastUpdated.ToString('o') } catch { }",
  "Get-NetFirewallProfile -ErrorAction SilentlyContinue | ForEach-Object { 'fw:' + $_.Name + ':' + $_.Enabled }",
].join('; ');
/** 69.6: Pusula portunu dinleyen yerel adresler (tek satır PowerShell; port sayısal). */
const psPort = (port) => `Get-NetTCPConnection -State Listen -LocalPort ${Math.trunc(+port)} -ErrorAction SilentlyContinue | ForEach-Object { 'port:' + $_.LocalAddress }`;

/**
 * @param calistir (komut, args, {sure}) → Promise<{ kod, cikti }>
 * @returns {{ platform, yenidenBaslatma: {bekliyor, kaynak[]}, etkin: {bas, bit}|null, uyku: {ac, dc}, hazirda: {ac, dc}, pil, olay, acilis, hatalar[] }}
 */
async function olc(calistir, platform = process.platform, ek = {}) {
  if (platform !== 'win32') return { platform, desteklenmiyor: true };
  const hatalar = [];
  const guvenli = async (k, a, sure = 20000) => { try { return await calistir(k, a, { sure }); } catch (e) { hatalar.push(`${k}: ${e.message}`); return { kod: 1, cikti: '' }; } };
  const UX = 'HKLM\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings';
  const ILKE = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate';   // 69.3: ilke (scripts/windows-etkin-saat.ps1) önce gelir
  const guvenlik = ek.guvenlik === true;   // 69.8: varsayılan kapalı (antivirüs yanlış alarmı, yukarıda)
  const powershell = ek.powershell === true || guvenlik;   // 69.9: varsayılan kapalı
  const port = guvenlik && Number.isFinite(+ek.port) && +ek.port > 0 ? +ek.port : null;
  const klasorler = guvenlik ? (ek.klasorler || []).filter(Boolean) : [];
  const [rr, rp, ux, sb, hb, ps, il, rdp, pp, kz] = await Promise.all([
    guvenli('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired']),
    guvenli('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending']),
    guvenli('reg', ['query', UX]),
    guvenli('powercfg', ['/q', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE']),
    guvenli('powercfg', ['/q', 'SCHEME_CURRENT', 'SUB_SLEEP', 'HIBERNATEIDLE']),
    powershell ? guvenli('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', guvenlik ? `${PS}; ${PS_GUVENLIK}` : PS], 45000) : Promise.resolve({ kod: 1, cikti: '' }),
    guvenli('reg', ['query', ILKE]),
    guvenlik ? guvenli('reg', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server', '/v', 'fDenyTSConnections']) : Promise.resolve({ kod: 1, cikti: '' }),
    port ? guvenli('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psPort(port)], 30000) : Promise.resolve({ kod: 1, cikti: '' }),
    klasorler.length ? guvenli('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', require('./klasorIzni').BETIK, ...klasorler.flatMap(k => ['-Klasor', k]), '-Durum'], 45000) : Promise.resolve(null),
  ]);
  const kaynak = [];
  if (rr.kod === 0) kaynak.push('Windows Update');
  if (rp.kod === 0) kaynak.push('bileşen kurulumu');
  const ilkeVar = il.kod === 0 && regDword(il.cikti, 'SetActiveHours') === 1;
  const kaynakUx = ilkeVar ? il.cikti : ux.cikti;
  const bas = regDword(kaynakUx, 'ActiveHoursStart'), bit = regDword(kaynakUx, 'ActiveHoursEnd');
  const p = psAyristir(ps.cikti);
  if (!powershell) { p.acilis = Date.now() - require('os').uptime() * 1000; p.pil = null; p.olay = null; p.diskler = []; }
  return {
    powershellKapali: !powershell,
    platform, yenidenBaslatma: { bekliyor: kaynak.length > 0, kaynak }, etkin: bas != null && bit != null ? { bas, bit, ilke: ilkeVar } : null,
    uyku: sb.kod === 0 ? powercfgAyristir(sb.cikti) : null, hazirda: hb.kod === 0 ? powercfgAyristir(hb.cikti) : null,
    pil: p.pil, olay: p.olay, acilis: p.acilis, diskler: p.diskler, hatalar,
    // 69.6 güvenlik
    guvenlik: !guvenlik ? { kapali: true } : {
      av: p.av || [], defender: p.defender || null, guvenlikDuvari: p.guvenlikDuvari || [],
      rdpAcik: rdp.kod === 0 ? regDword(rdp.cikti, 'fDenyTSConnections') === 0 : null,
      port, dinleme: port ? psAyristir(pp.cikti).dinleme || [] : null,
      klasor: kz ? require('./klasorIzni').ayristir(kz.cikti) : null,
    },
  };
}

module.exports = { olc, regDword, powercfgAyristir, etkinSaatte, psAyristir, avDurumu, psPort };
