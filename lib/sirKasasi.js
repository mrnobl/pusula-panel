'use strict';
/**
 * SIR KASASI (69.4) — data/secrets.json (API anahtarları, Telegram jetonu, sağlık adresleri) Windows'ta DPAPI ile şifreli.
 * ═══════════════════════════════════════════════════════════════════════════
 * Neden: dosya düz metindi; yedek, taşıma ya da başka bir kopya yoluyla sızarsa anahtarlar okunurdu (3Commas 2022 dersi).
 * DPAPI (Windows'un yerleşik şifrelemesi) 69.6'dan beri CurrentUser kapsamıyla (kullanıcı kararı 2026-10-21): dosyayı YALNIZ
 * bu bilgisayardaki Pusula'yı çalıştıran Windows kullanıcısı çözer; aynı makinedeki başka hesaplar ve başka makineye kopyalanan
 * dosya çözemez (69.4–69.5 LocalMachine'di: makinedeki her hesap çözebiliyordu). Aynı kullanıcı olarak çalışan kötü amaçlı
 * yazılıma karşı korumaz — oradaki savunma çekim izni kapalı + IP kısıtlı anahtar. Ek paket YOK: PowerShell ProtectedData.
 * Eski LocalMachine zarfı açılışta (`gecir`) çözülüp CurrentUser ile yeniden yazılır. Pusula başka bir Windows hesabına
 * taşınırsa anahtarlar o hesapta çözülemez → panelden yeniden girilir (ya da taşıma dosyasıyla: paket çözülmüş içerik taşır).
 *
 * KASA DOSYALARI (`KASA_DOSYALARI`): secrets.json + 69.6 telefon-jeton.json, ev-baglanti.json, yedek-sifre.json.
 * KURU DENEME (PUSULA_KURU=1): kasa kapalı — her okuma/yazma SirKilitliHatasi (deneme koşusu sır görmez).
 *
 * Dosya biçimi (zarf):  { "_pusulaDpapi": "<base64>", "surum": 1, "kapsam": "CurrentUser", "not": "…" } (kapsam yoksa LocalMachine)
 * Düz JSON da okunur (eski dosya, Windows dışı, PUSULA_SIR_DUZ=1). `oku` zarfı tanır ve çözer; `yaz` Windows'ta zarf yazar.
 * `gecir` (sunucu açılışı): düz dosyayı zarfa çevirir, ÇÖZÜP KARŞILAŞTIRIR; tutmazsa düz dosyayı geri koyar (asla veri kaybı yok).
 * Çözülemeyen zarf → `SirKilitliHatasi`: çağıran dosyanın üstüne YAZMAMALI (server.js saveSecrets reddeder).
 * Çözülmüş içerik süreç içinde dosya değişim zamanına göre önbelleğe alınır (her okumada PowerShell açılmaz).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ZARF = '_pusulaDpapi';
const ENTROPI = 'pusula-sir-kasasi';
const KAPSAM = 'CurrentUser';
const ESKI_KAPSAM = 'LocalMachine';
/** 69.6: kasadan okunup kasaya yazılan GİZLİ dosyalar (adlar; hepsi <veri> altında). */
const KASA_DOSYALARI = ['secrets.json', 'telefon-jeton.json', 'ev-baglanti.json', 'yedek-sifre.json'];
/** Kuru deneme koşusu (lib/kuruDeneme.js) sırları göremez. */
const kuruMu = () => process.env.PUSULA_KURU === '1';
/** Şifreleme ortam değişkeniyle kapatılmış mı (öz denetim uyarır). */
const duzKipMi = () => process.env.PUSULA_SIR_DUZ === '1';

class SirKilitliHatasi extends Error {
  constructor(m) { super(m); this.name = 'SirKilitliHatasi'; this.kod = 'SIR_KILITLI'; }
}

/** Şifreleme bu ortamda açık mı (Windows ve PUSULA_SIR_DUZ ≠ 1). Öz test `ayar.etkin` ile geçersiz kılar. */
const etkinMi = () => process.platform === 'win32' && process.env.PUSULA_SIR_DUZ !== '1';

function ps(betik, girdi) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', betik],
    { input: girdi, encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 16 << 20 }).trim();
}
const PS_KORU = (yon, kapsam = KAPSAM) => `Add-Type -AssemblyName System.Security; $i=[Console]::In.ReadToEnd().Trim(); $b=[Convert]::FromBase64String($i); `
  + `$e=[Text.Encoding]::UTF8.GetBytes('${ENTROPI}'); $s=[Security.Cryptography.DataProtectionScope]::${kapsam === ESKI_KAPSAM ? ESKI_KAPSAM : KAPSAM}; `
  + `$c=[Security.Cryptography.ProtectedData]::${yon}($b,$e,$s); [Console]::Out.Write([Convert]::ToBase64String($c))`;

/** Varsayılan DPAPI işlemleri (Windows). Öz test sahtesini `ayar.kripto` ile verir. */
const DPAPI = {
  sifrele: (metin, kapsam = KAPSAM) => ps(PS_KORU('Protect', kapsam), Buffer.from(String(metin), 'utf8').toString('base64')),
  coz: (b64, kapsam = KAPSAM) => Buffer.from(ps(PS_KORU('Unprotect', kapsam), String(b64)), 'base64').toString('utf8'),
};

let ayar = { kripto: DPAPI, etkin: null };
/** Öz test: { kripto: { sifrele, coz }, etkin: true|false|null } */
function ayarla(o = {}) { ayar = { ...ayar, ...o }; onbellek.clear(); }
const etkin = () => (ayar.etkin == null ? etkinMi() : !!ayar.etkin);

const onbellek = new Map();   // dosya → { mtimeMs, boyut, veri }
const bomsuz = (s) => String(s).replace(/^﻿/, '');
const zarfMi = (j) => !!(j && typeof j === 'object' && typeof j[ZARF] === 'string');

/** Metin → nesne (zarfsa çözer). @throws SirKilitliHatasi (zarf çözülemedi) · SyntaxError (bozuk JSON) */
function metinCoz(metin) {
  if (kuruMu()) throw new SirKilitliHatasi('kuru deneme: sır kasası kapalı');
  const j = JSON.parse(bomsuz(metin));
  if (!zarfMi(j)) return j;
  let acik;
  const kapsam = j.kapsam === KAPSAM ? KAPSAM : ESKI_KAPSAM;   // kapsam alanı yoksa / LocalMachine → eski zarf
  try { acik = ayar.kripto.coz(j[ZARF], kapsam); } catch (e) {
    throw new SirKilitliHatasi(`sır dosyası bu bilgisayarda çözülemedi (DPAPI ${kapsam}${kapsam === KAPSAM ? ' — başka bir Windows kullanıcısıyla şifrelenmiş olabilir' : ''}): ${String(e.message || e).split('\n')[0].slice(0, 160)}`);
  }
  return JSON.parse(acik);
}

/** @returns nesne | null (dosya yok). @throws SirKilitliHatasi · SyntaxError */
function oku(dosya) {
  if (kuruMu()) throw new SirKilitliHatasi('kuru deneme: sır kasası kapalı');
  let st;
  try { st = fs.statSync(dosya); } catch { return null; }
  const o = onbellek.get(dosya);
  if (o && o.mtimeMs === st.mtimeMs && o.boyut === st.size) return JSON.parse(JSON.stringify(o.veri));
  const veri = metinCoz(fs.readFileSync(dosya, 'utf8'));
  onbellek.set(dosya, { mtimeMs: st.mtimeMs, boyut: st.size, veri });
  return JSON.parse(JSON.stringify(veri));
}

/** Okur; yoksa / bozuksa / çözülemezse `yedek` (varsayılan {}) döner — hata atmaz (betikler ve yardımcılar için). */
function okuGuvenli(dosya, yedek = {}) { try { return oku(dosya) || yedek; } catch { return yedek; } }

/** Dosya zarf mı (çözmeden). */
function sifreliMi(dosya) { try { return zarfMi(JSON.parse(bomsuz(fs.readFileSync(dosya, 'utf8')))); } catch { return false; } }
/** Zarfın kapsamı (çözmeden): 'CurrentUser' | 'LocalMachine' | null (düz / yok). */
function kapsamOku(dosya) { try { const j = JSON.parse(bomsuz(fs.readFileSync(dosya, 'utf8'))); return zarfMi(j) ? (j.kapsam === KAPSAM ? KAPSAM : ESKI_KAPSAM) : null; } catch { return null; } }

/** Nesne → dosya metni (Windows'ta zarf). */
function metinUret(nesne) {
  const duz = JSON.stringify(nesne, null, 2);
  if (!etkin()) return duz;
  return JSON.stringify({ [ZARF]: ayar.kripto.sifrele(duz, KAPSAM), surum: 1, kapsam: KAPSAM,
    not: 'Pusula sır kasası: Windows DPAPI ile şifreli — yalnız bu bilgisayardaki bu Windows kullanıcısı çözer. Elle düzenlemeyin; panelden girin.' }, null, 2);
}

/**
 * Atomik yazım (lib/live/kaliciDosya.js: tmp + fsync + rename + önceki iyi kopya .yedek). `.yedek` da aynı biçimdedir.
 * @param kaliciYaz (dosya, nesne) — varsayılan kaliciDosya.yaz; zarf nesnesi yazılır
 */
function yaz(dosya, nesne, kaliciYaz = require('./live/kaliciDosya').yaz) {
  if (kuruMu()) throw new SirKilitliHatasi('kuru deneme: sır kasası kapalı');
  const metin = metinUret(nesne);
  kaliciYaz(dosya, JSON.parse(metin));
  onbellek.delete(dosya);
}

/**
 * Düz dosyayı zarfa çevirir (sunucu açılışı). Sıra: düz içerik okunur → zarf yazılır → yeniden okunup çözülür → karşılaştırılır.
 * Tutmazsa düz içerik geri yazılır. `.yedek` düz kalmışsa o da zarfla değiştirilir (düz anahtar diskte kalmasın).
 * @returns {{ yapildi: boolean, neden?: string }}
 */
function gecir(dosya) {
  if (kuruMu()) return { yapildi: false, neden: 'kuru deneme' };
  if (!etkin()) return { yapildi: false, neden: 'şifreleme bu ortamda kapalı' };
  let ham;
  try { ham = fs.readFileSync(dosya, 'utf8'); } catch { return { yapildi: false, neden: 'dosya yok' }; }
  let j;
  try { j = JSON.parse(bomsuz(ham)); } catch (e) { return { yapildi: false, neden: `dosya bozuk: ${e.message}` }; }
  if (zarfMi(j) && j.kapsam !== KAPSAM) {
    // 69.6: LocalMachine zarfı → CurrentUser. Çöz, yeniden yaz, doğrula; tutmazsa eski zarf geri konur (veri kaybı yok).
    try {
      const acik = metinCoz(ham);
      yaz(dosya, acik);
      const geri = metinCoz(fs.readFileSync(dosya, 'utf8'));
      if (JSON.stringify(geri) !== JSON.stringify(acik)) throw new Error('çözülen içerik özgünle aynı değil');
      fs.writeFileSync(`${dosya}.yedek`, fs.readFileSync(dosya));
      onbellek.delete(dosya);
      return { yapildi: true, neden: `kapsam ${KAPSAM}'a geçirildi` };
    } catch (e) {
      try { fs.writeFileSync(dosya, ham, 'utf8'); } catch { /* */ }
      onbellek.delete(dosya);
      return { yapildi: false, neden: `kapsam geçirilemedi, eski zarf korundu: ${String(e.message).slice(0, 160)}` };
    }
  }
  if (zarfMi(j)) {
    // Ana dosya şifreli; düz ya da eski kapsamlı bir .yedek kaldıysa onu da güncel zarfla değiştir.
    const y = `${dosya}.yedek`;
    try { const yj = JSON.parse(bomsuz(fs.readFileSync(y, 'utf8'))); if (!zarfMi(yj) || yj.kapsam !== KAPSAM) { fs.writeFileSync(y, fs.readFileSync(dosya)); return { yapildi: true, neden: 'düz ya da eski kapsamlı .yedek güncel zarfla değiştirildi' }; } } catch { /* yedek yok */ }
    return { yapildi: false, neden: 'zaten şifreli' };
  }
  try {
    yaz(dosya, j);
    const geri = metinCoz(fs.readFileSync(dosya, 'utf8'));
    if (JSON.stringify(geri) !== JSON.stringify(j)) throw new Error('çözülen içerik özgünle aynı değil');
    fs.writeFileSync(`${dosya}.yedek`, fs.readFileSync(dosya));   // kaliciDosya .yedek'e düz eskiyi koymuştu — zarfla değiştir
    onbellek.delete(dosya);
    return { yapildi: true };
  } catch (e) {
    try { fs.writeFileSync(dosya, ham, 'utf8'); } catch { /* */ }
    onbellek.delete(dosya);
    return { yapildi: false, neden: `şifreleme doğrulanamadı, düz dosya korundu: ${String(e.message).slice(0, 160)}` };
  }
}

/** 69.6: kasa dosyalarının hepsini geçirir (sunucu açılışı). @param yolFn (ad) → tam yol. @returns { [ad]: gecir sonucu } */
function hepsiniGecir(yolFn) { const o = {}; for (const ad of KASA_DOSYALARI) { try { o[ad] = gecir(yolFn(ad)); } catch (e) { o[ad] = { yapildi: false, neden: e.message }; } } return o; }

module.exports = { oku, okuGuvenli, yaz, gecir, hepsiniGecir, sifreliMi, kapsamOku, metinCoz, metinUret, ayarla, SirKilitliHatasi, ZARF, KAPSAM, ESKI_KAPSAM, KASA_DOSYALARI, etkinMi, duzKipMi, kuruMu, _ps: ps };
