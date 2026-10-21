'use strict';
/**
 * SIR DOSYALARI (70.0) — data/secrets.json (API anahtarları, Telegram jetonu, sağlık adresleri) ve öteki gizli dosyalar
 * için TEK okuma/yazma noktası. Düz JSON; atomik yazım (lib/live/kaliciDosya.js).
 * ═══════════════════════════════════════════════════════════════════════════
 * Tarihçe: 69.4–69.8 bu dosyaları Windows DPAPI ile şifreliyordu; şifre çözmek için sunucu süreci arka planda PowerShell
 * açıyordu. 2026-10-21/22 sunucudaki Kaspersky bunu kötü amaçlı yazılım davranışı sayıp server.js'i ve bu modülü sildi,
 * Pusula durdu. Kullanıcı kuralı: sunucuyu bozan güvenlik özelliği geri alınır (bellek feedback-sunucuyu-bozma). 70.0'da
 * şifreleme kodu TAMAMEN çıkarıldı; Pusula arka planda PowerShell açmaz.
 * Koruma: Binance anahtarında para çekme izni kapalı + canlıda IP kısıtı zorunlu (lib/live/yurutucu.js) — dosya kopyalansa
 * bile anahtar başka yerden kullanılamaz, para çekilemez.
 *
 * KASA DOSYALARI (`KASA_DOSYALARI`): secrets.json, telefon-jeton.json, ev-baglanti.json, yedek-sifre.json.
 * KURU DENEME (PUSULA_KURU=1): her okuma/yazma SirKilitliHatasi (deneme koşusu sır görmez).
 * ESKİ ŞİFRELİ DOSYA ({ "_pusulaDpapi": … }): Pusula çözmeye ÇALIŞMAZ → SirKilitliHatasi; kullanıcı bir kez Pusula-69.0
 * paketindeki scripts\sir-coz.ps1 ile çözer (kendi PowerShell'inde). Çağıran dosyanın üstüne YAZMAMALI (server.js saveSecrets reddeder).
 */
const fs = require('fs');

const ZARF = '_pusulaDpapi';
const KAPSAM = 'CurrentUser';
const ESKI_KAPSAM = 'LocalMachine';
const KASA_DOSYALARI = ['secrets.json', 'telefon-jeton.json', 'ev-baglanti.json', 'yedek-sifre.json'];
const COZ_KOMUTU = 'Pusula-69.0 paketindeki scripts\\sir-coz.ps1 betiği (Kılavuz › Sağlık › API anahtarları)';
/** Kuru deneme koşusu (lib/kuruDeneme.js) sırları göremez. */
const kuruMu = () => process.env.PUSULA_KURU === '1';
/** 70.0: şifreleme yok — geriye uyum için kalan sorgular. */
const duzKipMi = () => false;
const etkinMi = () => false;

class SirKilitliHatasi extends Error {
  constructor(m) { super(m); this.name = 'SirKilitliHatasi'; this.kod = 'SIR_KILITLI'; }
}

/** Öz testler için geriye uyum (eski { kripto, etkin } ayarı artık etkisiz). */
function ayarla() { onbellek.clear(); }

const onbellek = new Map();   // dosya → { mtimeMs, boyut, veri }
const bomsuz = (s) => String(s).replace(/^﻿/, '');
const zarfMi = (j) => !!(j && typeof j === 'object' && typeof j[ZARF] === 'string');

/** Metin → nesne. @throws SirKilitliHatasi (eski şifreli dosya) · SyntaxError (bozuk JSON) */
function metinCoz(metin) {
  if (kuruMu()) throw new SirKilitliHatasi('kuru deneme: sır kasası kapalı');
  const j = JSON.parse(bomsuz(metin));
  if (zarfMi(j)) throw new SirKilitliHatasi(`sır dosyası eski sürümde (69.4–69.8) şifrelenmiş; Pusula bunu çözmez. Sunucuda bir kez: ${COZ_KOMUTU} — sonra Pusula'yı yeniden başlatın`);
  return j;
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

/** Okur; yoksa / bozuksa / şifreliyse `yedek` (varsayılan {}) döner — hata atmaz (betikler ve yardımcılar için). */
function okuGuvenli(dosya, yedek = {}) { try { return oku(dosya) || yedek; } catch { return yedek; } }

/** Dosya eski şifreli biçimde mi (çözmeden). */
function sifreliMi(dosya) { try { return zarfMi(JSON.parse(bomsuz(fs.readFileSync(dosya, 'utf8')))); } catch { return false; } }
/** Eski şifreli dosyanın kapsamı: 'CurrentUser' | 'LocalMachine' | null (düz / yok). */
function kapsamOku(dosya) { try { const j = JSON.parse(bomsuz(fs.readFileSync(dosya, 'utf8'))); return zarfMi(j) ? (j.kapsam === KAPSAM ? KAPSAM : ESKI_KAPSAM) : null; } catch { return null; } }

/** Nesne → dosya metni (düz JSON). */
function metinUret(nesne) { return JSON.stringify(nesne, null, 2); }

/**
 * Atomik yazım (lib/live/kaliciDosya.js: tmp + fsync + rename + önceki iyi kopya .yedek).
 * @param kaliciYaz (dosya, nesne) — varsayılan kaliciDosya.yaz
 */
function yaz(dosya, nesne, kaliciYaz = require('./live/kaliciDosya').yaz) {
  if (kuruMu()) throw new SirKilitliHatasi('kuru deneme: sır kasası kapalı');
  kaliciYaz(dosya, JSON.parse(metinUret(nesne)));
  onbellek.delete(dosya);
}

/** 70.0: geçiş yok (şifreleme kaldırıldı) — sunucu açılışı çağırır, hiçbir şey yapmaz. */
function gecir() { return { yapildi: false, neden: 'şifreleme yok (70.0)' }; }
function hepsiniGecir() { const o = {}; for (const ad of KASA_DOSYALARI) o[ad] = gecir(); return o; }

module.exports = { oku, okuGuvenli, yaz, gecir, hepsiniGecir, sifreliMi, kapsamOku, metinCoz, metinUret, ayarla, SirKilitliHatasi, ZARF, KAPSAM, ESKI_KAPSAM, KASA_DOSYALARI, etkinMi, duzKipMi, kuruMu, COZ_KOMUTU };
