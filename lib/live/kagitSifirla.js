'use strict';
/**
 * KÂĞIT HESABI SIFIRLA (TEMİZ BAŞLA) — 68.8, kullanıcı 2026-10-20. POST /api/bindirme/:ad/kagit-sifirla (server.js).
 * ═══════════════════════════════════════════════════════════════════════════
 * Kâğıt hesaptaki bir portföy botunu (Hücum / Denge) sıfırdan başlatır: botun dizini (data/live/<ad>, lib/yollar.js veri yeri)
 * SİLİNMEZ — kardeş yedeğe TAŞINIR (`<ad>-onceki-<UTC zaman>`), bot yeni dizinde taze durumla kurulur: sermaye = ayarlardaki
 * kagitBakiye, son gün yok → ilk çalışmada kaçırılan gün telafisi YOK (bindirmeBot telafi yalnız durum.sonGun varken).
 * YALNIZ kâğıt modda ve bot DURMUŞKEN; demo / canlı hesaba ve çalışan bota 409 (çift güvence: dizin adı -demo / -canli ile
 * bitiyorsa ya da veri kökünün dışındaysa yine reddedilir — Hücum'un demo kabul testindeki data/live/hucum-demo'ya dokunulamaz).
 *
 * API (saf + tek dosya sistemi işi):
 *   engel({ ad, mod, calisiyor, dizin, kok }) → null | Türkçe neden (409)
 *   yedekYolu(dizin, simdi) → '<dizin>-onceki-YYYYMMDDTHHMMSSZ' (varsa -2, -3 …)
 *   sifirla({ ad, mod, calisiyor, dizin, kok, simdi }) → { yedek: tam yol | null (dizin zaten yoktu) } — engel varsa hata atar
 */
const fs = require('fs');
const path = require('path');

const ONAY = 'SIFIRLA';

function engel({ ad, mod, calisiyor, dizin, kok }) {
  if (mod !== 'kagit') return `${ad} kâğıt hesapta değil (hesap türü: ${mod === 'demo' ? 'demo' : mod === 'canli' ? 'canlı hesap' : mod}) — sıfırlama yalnız kâğıt hesapta yapılır; demo ve canlı hesaba dokunulmaz.`;
  if (calisiyor) return `${ad} çalışıyor — önce botu durdurun, sonra kâğıt hesabı sıfırlayın.`;
  const ad2 = path.basename(String(dizin || ''));
  if (!dizin || /-(demo|canli)$/.test(ad2) || /-onceki-/.test(ad2)) return `bu dizin kâğıt hesap dizini değil (${ad2 || '—'}) — sıfırlanmadı.`;
  if (kok) {
    const g = path.relative(path.resolve(kok), path.resolve(dizin));
    if (!g || g.startsWith('..') || path.isAbsolute(g) || g.includes(path.sep)) return `bot dizini veri yerinin dışında (${ad2}) — sıfırlanmadı.`;
  }
  return null;
}

function zamanEtiketi(simdi) { return new Date(simdi).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'); }

function yedekYolu(dizin, simdi = Date.now()) {
  const taban = `${dizin}-onceki-${zamanEtiketi(simdi)}`;
  let y = taban, n = 2;
  while (fs.existsSync(y)) y = `${taban}-${n++}`;
  return y;
}

function sifirla(o) {
  const e = engel(o);
  if (e) throw Object.assign(new Error(e), { kod: 409 });
  if (!fs.existsSync(o.dizin)) return { yedek: null };
  const yedek = yedekYolu(o.dizin, o.simdi || Date.now());
  fs.renameSync(o.dizin, yedek);   // aynı klasörde ad değişikliği: atomik; bir şey silinmez
  return { yedek };
}

module.exports = { engel, yedekYolu, sifirla, ONAY };
