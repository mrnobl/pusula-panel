'use strict';
/**
 * BOT ŞABLONLARI (74.4, A1 + 2. faz — TASARIM-MAKINE-HESAP-BOT §2.2, karar a3) — SAF, yalnız veri.
 * ═══════════════════════════════════════════════════════════════════════════
 * Panelden kurulabilecek botlar YALNIZ sınanmış mevcut kurallardır; yeni strateji kodu yok.
 *   · motor 'bindirme' → lib/live/bindirmeBot.js (strateji = lib/research/bindirme STRATEJILER anahtarı)
 *   · motor 'model'    → model portföylerin kâğıt hesabı (lib/tasarimci) — ikinci parça (2c), bu sürümde kurulamaz
 * 74.4 (parça 2a): şablonlar Kairos/Tao göçünde ve /api/botlar yanıtında (açıklama) kullanılır.
 * 74.5 (parça 2b): kairos / tao / kairos-s KURULABİLİR (POST /api/botlar — yeni bot her zaman KÂĞITTA başlar, a6). Model şablonları
 *   (nova / lydia / simurg) 2c'de; bu sürümde kurulamaz.
 * 74.6 (parça 2c): nova / lydia / simurg KURULABİLİR — model portföyün İKİNCİ KÂĞIT ÖRNEĞİ (kararlar modelle ortak, kâğıt hesabı ayrı:
 *   lib/tasarimci/ornekler.js). Yalnız kâğıt; demo/canlı ve borsa hesabı bu sürümde YOK. `para`: kâğıt sermayesinin para birimi.
 * `sabit`: şablonun kayda zorla yazdığı alanlar (ör. Kairos-S küçük sermaye kuralı her zaman açık).
 */

const SABLONLAR = Object.freeze({
  kairos: Object.freeze({ motor: 'bindirme', strateji: 'hucum', sabit: Object.freeze({}), kurulabilir: true, ad: 'Kairos tipi',
    aciklama: 'Kairos kuralı: BTC trendi + 15 coinlik sepet (×3), günlük karar.' }),
  tao: Object.freeze({ motor: 'bindirme', strateji: 'denge', sabit: Object.freeze({}), kurulabilir: true, ad: 'Tao tipi',
    aciklama: 'Tao kuralı: BTC en çok %50 + aynı coin sepeti (×3), günlük karar.' }),
  'kairos-s': Object.freeze({ motor: 'bindirme', strateji: 'hucum', sabit: Object.freeze({ kucukSermaye: true }), kurulabilir: true, ad: 'Kairos tipi — küçük sermaye (Kairos-S)',
    aciklama: 'Kairos küçük sermaye kuralı (Kairos-S, 5000 $ altı için).' }),
  // A2 parça 2 (TASARIM §7.5): OKX demo botunun şablonu — Kairos kuralı, işlem borsası OKX (sabit). Kâğıtta OKX pazar kurallarıyla başlar;
  // karar verisi Binance'ten, evren Binance PIT ∩ OKX (OKX'te olmayan coinde hedef 0). OKX bağdaştırıcısı hazir:false iken demo hesaba
  // BAĞLANAMAZ ("OKX demo: hazırlık — henüz bağlanamaz"); canlı hesap yok.
  okxdemo: Object.freeze({ motor: 'bindirme', strateji: 'hucum', sabit: Object.freeze({ borsa: 'okx' }), kurulabilir: true, ad: 'Kairos tipi — OKX (demo hazırlığı)',
    aciklama: 'Kairos kuralı OKX\'te: kâğıtta OKX pazar kurallarıyla; karar verisi Binance\'ten, evren Binance ∩ OKX. OKX demo hesabı henüz bağlanamaz.' }),
  nova: Object.freeze({ motor: 'model', model: 'm-qqq-m10', para: 'USD', sabit: Object.freeze({}), kurulabilir: true, ad: 'Nova örneği (kâğıt)',
    aciklama: 'Nova modelinin (Nasdaq Momentum 10) ikinci kâğıt hesabı: aynı aylık kararlar, ayrı sermaye (USD).' }),
  lydia: Object.freeze({ motor: 'model', model: 'm-bist-m10', para: 'TRY', sabit: Object.freeze({}), kurulabilir: true, ad: 'Lydia örneği (kâğıt)',
    aciklama: 'Lydia modelinin (BIST Momentum 10) ikinci kâğıt hesabı: aynı aylık kararlar, ayrı sermaye (TL).' }),
  simurg: Object.freeze({ motor: 'model', model: 'm-837', para: 'USD', sabit: Object.freeze({}), kurulabilir: true, ad: 'Simurg örneği (kâğıt)',
    aciklama: 'Simurg modelinin (%50 QQQ + %50 Kairos) ikinci kâğıt hesabı: aynı dengeleme kararları, ayrı sermaye (USD).' })
});

/** Göçte iç ad → şablon (Kairos/Tao). */
const GOC_SABLON = Object.freeze({ hucum: 'kairos', denge: 'tao' });

const sablon = (ad) => (Object.prototype.hasOwnProperty.call(SABLONLAR, ad) ? SABLONLAR[ad] : null);

/** Panel/API için düz liste. */
function liste() {
  return Object.entries(SABLONLAR).map(([ad, s]) => ({ ad, motor: s.motor, strateji: s.strateji || null, model: s.model || null, para: s.para || 'USD',
    sabit: { ...s.sabit }, kurulabilir: !!s.kurulabilir, adGorunen: s.ad || ad, aciklama: s.aciklama,
    borsa: s.motor === 'bindirme' ? (s.sabit.borsa || null) : null }));   // A2 parça 2: null = seçilebilir (varsayılan Binance)
}

module.exports = { SABLONLAR, GOC_SABLON, sablon, liste };
