#!/usr/bin/env node
/**
 * KOL ÖNBELLEĞİ ↔ KAYITLI ÖLÇÜM — lib/research/bindirme.js STRATEJILER.kayit dönemi (KAYIT_DONEM) içinde Hücum ve Denge
 * metrikleri, verilen önbellekle (ONBELLEK_DOSYA, data/arastirma/ altında) yeniden hesaplanır. Veri orkestratörü kol
 * önbelleğini yeniden kurunca bunu ALT SÜREÇ olarak çağırır; fark varsa sessizce geçmez, raporlanır.
 *   ONBELLEK_DOSYA=capraz-marj-onbellek.json node scripts/kol-kayit-mutabakat.js
 * Çıktı: son satır JSON { donem: { bas, bit }, hucum: { cagr, holdout, maxDD, vol, gunIci }, denge: { … } }.
 */
'use strict';
const B = require('../lib/research/bindirme');
const T = s => Date.parse(s + 'T00:00:00Z');
const out = { donem: { ...B.KAYIT_DONEM } };
for (const [ad, s] of Object.entries(B.STRATEJILER)) {
  const r = B.bindirmeAralik({ btcPay: s.btcPay, bas: T(B.KAYIT_DONEM.bas) - 864e5, bit: T(B.KAYIT_DONEM.bit) });
  if (r.yok) { out[ad] = null; continue; }
  const m = r.strateji.metrik;
  out[ad] = { cagr: m.cagr, holdout: m.holdout, maxDD: m.maxDD, vol: m.vol, gunIci: m.enKotuGunIci, bit: r.kapsam.bit };
}
console.log(JSON.stringify(out));
