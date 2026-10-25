'use strict';
/**
 * BOT ŞABLONLARI (74.4, A1 + 2. faz — TASARIM-MAKINE-HESAP-BOT §2.2, karar a3) — SAF, yalnız veri.
 * ═══════════════════════════════════════════════════════════════════════════
 * Panelden kurulabilecek botlar YALNIZ sınanmış mevcut kurallardır; yeni strateji kodu yok.
 *   · motor 'bindirme' → lib/live/bindirmeBot.js (strateji = lib/research/bindirme STRATEJILER anahtarı)
 *   · motor 'model'    → model portföylerin kâğıt hesabı (lib/tasarimci) — ikinci parça (2c), bu sürümde kurulamaz
 * 74.4 (parça 2a): şablonlar yalnız Kairos/Tao göçünde ve /api/botlar yanıtında (açıklama) kullanılır. YENİ BOT OLUŞTURMA YOK (2b).
 * `sabit`: şablonun kayda zorla yazdığı alanlar (ör. Kairos-S küçük sermaye kuralı her zaman açık).
 */

const SABLONLAR = Object.freeze({
  kairos: Object.freeze({ motor: 'bindirme', strateji: 'hucum', sabit: Object.freeze({}), kurulabilir: false,
    aciklama: 'Kairos kuralı: BTC trendi + 15 coinlik sepet (×3), günlük karar.' }),
  tao: Object.freeze({ motor: 'bindirme', strateji: 'denge', sabit: Object.freeze({}), kurulabilir: false,
    aciklama: 'Tao kuralı: BTC en çok %50 + aynı coin sepeti (×3), günlük karar.' }),
  'kairos-s': Object.freeze({ motor: 'bindirme', strateji: 'hucum', sabit: Object.freeze({ kucukSermaye: true }), kurulabilir: false,
    aciklama: 'Kairos küçük sermaye kuralı (Kairos-S, 5000 $ altı için).' }),
  nova: Object.freeze({ motor: 'model', model: 'm-qqq-m10', sabit: Object.freeze({}), kurulabilir: false, aciklama: 'Nova modeli (Nasdaq Momentum 10) — ikinci parça.' }),
  lydia: Object.freeze({ motor: 'model', model: 'm-bist-m10', sabit: Object.freeze({}), kurulabilir: false, aciklama: 'Lydia modeli (BIST Momentum 10) — ikinci parça.' }),
  simurg: Object.freeze({ motor: 'model', model: 'm-837', sabit: Object.freeze({}), kurulabilir: false, aciklama: 'Simurg modeli (%50 QQQ + %50 Kairos) — ikinci parça.' })
});

/** Göçte iç ad → şablon (Kairos/Tao). */
const GOC_SABLON = Object.freeze({ hucum: 'kairos', denge: 'tao' });

const sablon = (ad) => (Object.prototype.hasOwnProperty.call(SABLONLAR, ad) ? SABLONLAR[ad] : null);

/** Panel/API için düz liste. */
function liste() {
  return Object.entries(SABLONLAR).map(([ad, s]) => ({ ad, motor: s.motor, strateji: s.strateji || null, model: s.model || null,
    sabit: { ...s.sabit }, kurulabilir: !!s.kurulabilir, aciklama: s.aciklama }));
}

module.exports = { SABLONLAR, GOC_SABLON, sablon, liste };
