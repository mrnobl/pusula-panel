'use strict';
/**
 * B3 — KADEMELİ GÜNCELLEME KAPISI (75.3, 3. faz parça 3b — PLAN-MAKINE-HESAP-BOT §4 f4; TASARIM-MAKINE-HESAP-BOT §4.6)
 * ═══════════════════════════════════════════════════════════════════════════
 * "Önce bot çalıştırmayan makine, 8 dk gözlem; sonra bot çalıştıranlar tek tek." Güncelleyici (lib/guncelleme.calistir) kodu
 * birleştirmeden ÖNCE `ops.kademe({ hedef })` sorar; scripts/guncelle.js bunu yerel sunucunun GET /api/makine/kademe?hedef= ucuna
 * yöneltir, uç bu saf kuralı eşlerin son nabız özetleriyle çalıştırır.
 *
 * KURAL (`kademeKarar`, saf):
 *   · Eşlenmiş makine yok → İZİN (tek makine = bugünkü davranış).
 *   · Bu makine geliştirme bilgisayarıysa → İZİN (güncelleyici zaten kurmaz; sıraya girmez).
 *   · Bu makinede çalışan bot yok → İZİN ("önce ben").
 *   · Bot çalıştırıyorsam:
 *       (a) ULAŞILABİLEN (son görülme ≤ 15 dk), bot çalıştırmayan sunucu makinelerinden en az biri `hedef`i kurmuş ve KARARLI olmalı.
 *           Öyle makine yoksa (hiç yok ya da hepsi ulaşılamıyor) → bu koşul aranmaz, gerekçeye yazılır.
 *       (b) Sırada benden ÖNCE gelen (kimlik sırası) bot çalıştıran ulaşılabilen sunucular `hedef`i kurup kararlı olmalı.
 *           Ulaşılamayan makine ENGELLEMEZ, rapora yazılır.
 *   · KARARLI: eşin çalışan kodu (özet `commit`) = hedef ve (güncelleyicisi "kuruldu" demiş [kararlılık gözlemi geçti] ya da süreci
 *     en az KARARLI_MS = 8 dk ayakta — özetteki `baslangic` ile `zaman` farkı).
 * Kapı kapalıysa durum 'kademe-bekliyor' (lib/guncelleme.js); sunucu 5 dk'da bir yeniden dener (lib/sunucu/guncellemeUclari.js);
 * 24 saatten uzun kapalı kalırsa Telegram'a TEK uyarı. Onaylı kurulumlar da aynı kapıdan geçer (onay bekletilir, kaybolmaz).
 * Ağa istek atmaz, karar verir; veri lib/makine/nabiz.js'in diskteki özetleridir.
 */
const nabizLib = require('./nabiz');

const KARARLI_MS = 8 * 60 * 1000;
const ERISIM_MS = nabizLib.SESSIZ_MS;   // 15 dk: pano "Sessiz" eşiğiyle aynı

const zamanMs = (z) => { const t = Date.parse(z || ''); return Number.isFinite(t) ? t : null; };
const botCalisiyor = (botlar) => Array.isArray(botlar) && botlar.some(b => b && b.calisiyor);

/** Saf: eş özeti hedef commit'i kurmuş ve kararlı mı. @returns {{ kurdu, kararli, neden }} */
function kararliMi(oz, hedef) {
  const commit = String((oz && oz.commit) || '');
  if (!hedef || !commit || commit !== String(hedef)) return { kurdu: false, kararli: false, neden: `hedef sürüm kurulmadı (çalışan: ${commit ? commit.slice(0, 7) : '?'})` };
  const g = (oz && oz.guncelleme) || {};
  if (g.durum === 'kuruldu' && String(g.sha || '') === String(hedef)) return { kurdu: true, kararli: true, neden: 'kurdu, kararlılık gözlemi geçti' };
  const b = zamanMs(oz.baslangic), z = zamanMs(oz.zaman);
  if (b != null && z != null && z - b >= KARARLI_MS) return { kurdu: true, kararli: true, neden: `kurdu, ${Math.round((z - b) / 60000)} dk ayakta` };
  return { kurdu: true, kararli: false, neden: 'kurdu, 8 dk kararlılık gözlemi sürüyor' };
}

/**
 * Saf KARAR. @param g { ben: { kimlik, rol, botlar }, esler: [{ kimlik, ad, rol, sonGorulme (ms|null), ozet }], hedef, simdi }
 * @returns {{ izin: boolean, neden: string, rapor: [{ kimlik, ad, rol, bot, erisilebilir, durum }] }}
 */
function kademeKarar(g) {
  const esler = g.esler || [];
  const hedef = String(g.hedef || '');
  const rapor = [];
  if (!esler.length) return { izin: true, neden: 'tek makine — kademe yok', rapor };
  if (!g.ben || g.ben.rol !== 'sunucu') return { izin: true, neden: 'geliştirme bilgisayarı sıraya girmez', rapor };
  const sunucular = esler.filter(e => (e.rol || (e.ozet && e.ozet.rol)) === 'sunucu').map(e => {
    const oz = e.ozet || {};
    const erisilebilir = Number.isFinite(e.sonGorulme) && g.simdi - e.sonGorulme <= ERISIM_MS;
    const k = kararliMi(oz, hedef);
    const s = { kimlik: e.kimlik, ad: e.ad || oz.ad || e.kimlik, bot: botCalisiyor(oz.botlar), erisilebilir, kararli: k.kararli, durum: erisilebilir ? k.neden : 'ulaşılamıyor (sırayı engellemez)' };
    rapor.push(s);
    return s;
  });
  if (!botCalisiyor(g.ben.botlar)) return { izin: true, neden: 'bu makinede çalışan bot yok — önce bu makine kurar', rapor };
  // (a) bot çalıştırmayan, ulaşılabilen sunucular
  const botsuz = sunucular.filter(s => !s.bot && s.erisilebilir);
  const notlar = [];
  if (!botsuz.length) notlar.push(sunucular.some(s => !s.bot) ? 'bot çalıştırmayan sunucuya ulaşılamıyor — o koşul aranmadı' : 'bot çalıştırmayan sunucu yok — o koşul aranmadı');
  else if (!botsuz.some(s => s.kararli)) {
    return { izin: false, neden: `Önce bot çalıştırmayan makine kurmalı ve 8 dk kararlı çalışmalı: ${botsuz.map(s => `${s.ad} (${s.durum})`).join(', ')}.`, rapor };
  } else notlar.push(`${botsuz.filter(s => s.kararli).map(s => s.ad).join(', ')} kurdu ve kararlı`);
  // (b) sırada benden önceki bot çalıştıran sunucular
  const onceki = sunucular.filter(s => s.bot && s.kimlik < g.ben.kimlik);
  const bekleyen = onceki.filter(s => s.erisilebilir && !s.kararli);
  if (bekleyen.length) return { izin: false, neden: `Sırada önce şu bot makineleri kurmalı: ${bekleyen.map(s => `${s.ad} (${s.durum})`).join(', ')}.`, rapor };
  const ulasilamayan = onceki.filter(s => !s.erisilebilir);
  if (ulasilamayan.length) notlar.push(`ulaşılamayan: ${ulasilamayan.map(s => s.ad).join(', ')} (engellemedi)`);
  return { izin: true, neden: `sıra geldi — ${notlar.join('; ')}`, rapor };
}

module.exports = { kademeKarar, kararliMi, KARARLI_MS, ERISIM_MS };
