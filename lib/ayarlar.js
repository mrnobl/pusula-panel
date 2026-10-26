/**
 * AYARLAR — varsayılan ⊕ kullanıcı (68.0, PLAN-TASIMA F1)
 * ═══════════════════════════════════════════════════════════════════════════
 * Eskiden tek `config.json` hem program varsayılanı hem kullanıcı ayarıydı ve depoda izleniyordu (kişisel değerler —
 * Telegram chat id — depoya giriyordu). Artık iki katman:
 *
 *   config.varsayilan.json   program kökünde, DEPODA — kişisel değer yok (anahtarlar, chat id, sağlık adresleri boş)
 *   <veri>/ayarlar.json      kullanıcı ayarı, YALNIZ varsayılandan FARKLI olanlar (lib/yollar.js — KİŞİSEL tür)
 *
 * Okuma tek yerden: oku() = birlestir(varsayılan, kullanıcı). Derin birleştirme: düz nesneler iç içe birleşir; diziler,
 * tekil değerler ve DEGISTIR_ANAHTARLARI (clusters, presets — panelde silinen küme geri gelmesin) olduğu gibi değişir.
 *
 * GEÇİŞ (var olan kurulumlar — sunucu ve bu bilgisayar): `ayarlar.json` YOKSA kökteki eski `config.json` kullanıcı
 * katmanı sayılır — davranış birebir aynı (varsayılan, depodaki config.json'un kişisel değerleri boşaltılmış hâlidir;
 * birleşim eski dosyanın kendisini verir). Kullanıcı dosyası ilk ayar kaydında (yaz) ya da açıkça (gocEt: veri-tasi,
 * güncelleme config.json'a dokunmadan önce) oluşur; o andan sonra config.json OKUNMAZ. Kökteki config.json bu sürümde
 * depoda KALIR (sunucuda git pull onu silmesin/çakışmasın) — kaldırma ayrı adım: PLAN-TASIMA "Uygulama notları F0–F2".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');
const kalici = require('./live/kaliciDosya');

const VARSAYILAN_AD = 'config.varsayilan.json';
const ESKI_AD = 'config.json';
const KULLANICI_AD = 'ayarlar.json';
/** Birleştirilmeyip bütün olarak değişen anahtarlar (server.js REPLACE_KEYS ile aynı). */
const DEGISTIR_ANAHTARLARI = new Set(['clusters', 'presets']);

const duzMu = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esit = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Saf: varsayılan ⊕ kullanıcı. */
function birlestir(v, k) {
  if (!duzMu(v) || !duzMu(k)) return k === undefined ? v : k;
  const out = { ...v };
  for (const [a, x] of Object.entries(k)) out[a] = (!DEGISTIR_ANAHTARLARI.has(a) && duzMu(x) && duzMu(v[a])) ? birlestir(v[a], x) : x;
  return out;
}

/** Saf: tam ayardan varsayılana göre en küçük kullanıcı katmanı — birlestir(v, fark(t, v)) ⊇ t. */
function fark(t, v) {
  const out = {};
  for (const [a, x] of Object.entries(t || {})) {
    if (!(a in (v || {}))) { out[a] = x; continue; }
    if (!DEGISTIR_ANAHTARLARI.has(a) && duzMu(x) && duzMu(v[a])) { const f = fark(x, v[a]); if (Object.keys(f).length) out[a] = f; continue; }
    if (!esit(x, v[a])) out[a] = x;
  }
  return out;
}

function jsonOku(f) { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); }

/** Dosya yolları — kok: program kökü (varsayılan bu kopya; testler geçici kopya verir). */
function yollari(kok = yollar.PROGRAM) {
  return { varsayilan: path.join(kok, VARSAYILAN_AD), eski: path.join(kok, ESKI_AD), kullanici: yollar.programVeri(kok, KULLANICI_AD) };
}

/** Varsayılan katman (yoksa boş — eski kopya: yalnız config.json). */
function varsayilan(kok) {
  const y = yollari(kok);
  return fs.existsSync(y.varsayilan) ? jsonOku(y.varsayilan) : {};
}

/**
 * Kullanıcı katmanı: { kaynak: 'ayarlar'|'eski-config'|'yok', deger, yol, bozuk }.
 * ayarlar.json bozuksa kaliciDosya .yedek'ten okur (bozuk notuyla); yedek de yoksa HATA (ayarlar sessizce sıfırlanmaz).
 */
function kullanici(kok) {
  const y = yollari(kok);
  if (fs.existsSync(y.kullanici) || fs.existsSync(`${y.kullanici}.yedek`)) {
    const r = kalici.oku(y.kullanici);
    if (r.veri == null) throw new Error(`${KULLANICI_AD} okunamadı (${r.bozuk || 'boş'}) — ${y.kullanici}`);
    return { kaynak: 'ayarlar', deger: r.veri, yol: y.kullanici, bozuk: r.bozuk };
  }
  if (fs.existsSync(y.eski)) return { kaynak: 'eski-config', deger: jsonOku(y.eski), yol: y.eski, bozuk: null };
  return { kaynak: 'yok', deger: {}, yol: y.kullanici, bozuk: null };
}

/** Etkin ayar (varsayılan ⊕ kullanıcı) + kaynak bilgisi. */
function okuBilgi(kok) {
  const k = kullanici(kok);
  return { ayar: birlestir(varsayilan(kok), k.deger), kaynak: k.kaynak, yol: k.yol, bozuk: k.bozuk };
}
function oku(kok) { return okuBilgi(kok).ayar; }

/** Tam ayarı kaydet: kullanıcı dosyasına YALNIZ varsayılandan farklı olanlar (atomik + fsync + .yedek). */
function yaz(tam, kok) {
  const y = yollari(kok);
  fs.mkdirSync(path.dirname(y.kullanici), { recursive: true });
  kalici.yaz(y.kullanici, fark(tam, varsayilan(kok)));
  return y.kullanici;
}

/**
 * Eski config.json → ayarlar.json (yalnız ayarlar.json YOKKEN; varsa dokunmaz). Eski dosya yerinde kalır.
 * @returns {{ yapildi: bool, neden, yol }}
 */
function gocEt(kok) {
  const y = yollari(kok);
  // 77.x: yalnız .yedek kalmışsa da kullanıcı katmanı VAR (kullanici() onu okur) — eski config.json onu ezmesin.
  if (fs.existsSync(y.kullanici) || fs.existsSync(`${y.kullanici}.yedek`)) return { yapildi: false, neden: `${KULLANICI_AD} zaten var`, yol: y.kullanici };
  if (!fs.existsSync(y.eski)) return { yapildi: false, neden: 'eski config.json yok', yol: y.kullanici };
  const eski = jsonOku(y.eski);
  yaz(eski, kok);
  // Doğrula: birleşim eski dosyayı birebir kapsıyor.
  const sonra = oku(kok);
  const eksik = Object.keys(fark(eski, sonra));
  if (eksik.length) throw new Error(`ayar göçü doğrulanamadı (${eksik.join(', ')})`);
  return { yapildi: true, neden: null, yol: y.kullanici };
}

module.exports = { oku, okuBilgi, yaz, gocEt, birlestir, fark, varsayilan, kullanici, yollari, VARSAYILAN_AD, ESKI_AD, KULLANICI_AD, DEGISTIR_ANAHTARLARI };
