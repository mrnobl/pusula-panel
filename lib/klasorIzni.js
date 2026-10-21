'use strict';
/**
 * KLASÖR İZİNLERİ (69.6, güvenlik testi K3) — Pusula program ve veri klasörleri yalnız SYSTEM, Administrators ve Pusula'yı
 * çalıştıran kullanıcıya açık olmalı. C:\ altında açılan klasörler varsayılan olarak "Users: okuma" ve "Authenticated Users:
 * değiştirme" mirası alıyordu: bilgisayardaki başka bir hesap sır dosyasını okuyabilir, lib/ dosyalarını değiştirip botun açılışta
 * kendi kodunu çalıştırmasını sağlayabilirdi.
 *
 * İş scripts/klasor-izin.ps1'de (Get-Acl SID ile — Türkçe Windows'ta grup adları farklı); bu modül çıktısını okur.
 *   durum(klasorler) → { genis: [{ klasor, sid, ad, haklar }], klasorler, hata? }   (salt okuma)
 *   uygula(klasorler) → { tamam, satirlar, hata? }
 * Kullanan: scripts/kur.js adım 'izin', lib/sunucuBilgisayari.js (öz denetim 'isletim').
 */
const path = require('path');
const { spawnSync } = require('child_process');

const BETIK = path.join(__dirname, '..', 'scripts', 'klasor-izin.ps1');
const SID_AD = { 'S-1-1-0': 'Everyone', 'S-1-5-32-545': 'Users', 'S-1-5-11': 'Authenticated Users', 'S-1-5-32-546': 'Guests' };

/** Saf: betik çıktısı → { genis, klasorler, hatalar, uygulandi }. */
function ayristir(cikti) {
  const genis = [], klasorler = [], hatalar = [];
  let uygulandi = 0, simdiki = null;
  for (const s of String(cikti || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
    if (s.startsWith('KLASOR:')) { simdiki = s.slice(7); klasorler.push(simdiki); }
    else if (s.startsWith('GENIS:')) { const [, sid, ...h] = s.split(':'); genis.push({ klasor: simdiki, sid, ad: SID_AD[sid] || sid, haklar: h.join(':') }); }
    else if (s.startsWith('HATA:')) hatalar.push(s.slice(5));
    else if (s === 'UYGULANDI') uygulandi++;
  }
  return { genis, klasorler, hatalar, uygulandi };
}

function calistir(args, zamanMs = 60000) {
  if (process.platform !== 'win32') return { kod: 0, cikti: '' };
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', BETIK, ...args],
    { encoding: 'utf8', windowsHide: true, timeout: zamanMs });
  return { kod: r.status == null ? 1 : r.status, cikti: `${r.stdout || ''}${r.stderr || ''}${r.error ? r.error.message : ''}` };
}
const klasorArg = (l) => (l || []).filter(Boolean).flatMap(k => ['-Klasor', k]);

/** Salt okuma. */
function durum(klasorler) {
  if (process.platform !== 'win32') return { genis: [], klasorler: [], windowsDisi: true };
  const r = calistir([...klasorArg(klasorler), '-Durum']);
  const a = ayristir(r.cikti);
  return { genis: a.genis, klasorler: a.klasorler, ...(r.kod !== 0 || a.hatalar.length ? { hata: a.hatalar.join(' · ') || r.cikti.trim().slice(-200) } : {}) };
}

/** Mirası kaldırır, yalnız SYSTEM + Administrators + bu kullanıcı. */
function uygula(klasorler) {
  if (process.platform !== 'win32') return { tamam: true, windowsDisi: true, satirlar: [] };
  const r = calistir(klasorArg(klasorler), 180000);
  const a = ayristir(r.cikti);
  return { tamam: r.kod === 0 && !a.hatalar.length, uygulandi: a.uygulandi, genis: a.genis, hata: a.hatalar.join(' · ') || (r.kod !== 0 ? r.cikti.trim().slice(-200) : undefined) };
}

module.exports = { durum, uygula, ayristir, SID_AD, BETIK };
