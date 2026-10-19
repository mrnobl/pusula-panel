#!/usr/bin/env node
/**
 * DİKKAT F1 → evren eşikleri (PLAN-DIKKAT-V1-ONKAYIT.md §1.4 + EK-1 A5) — GÖSTER / DOĞRULA. `npm run evren:esik [-- --deneme]`
 *
 * 64.3'ten beri eşikler ELLE commit'lenmez (dikkatTakip N14): günlük arşiv koşusu, manifestte 30. kayıt günü tamamlandıktan sonraki
 * ilk koşuda ilk 30 kayıt gününden mekanik hesapla `evren/esik-v1.json`'u o günün dosyası olarak manifest zincirine BİR KEZ yazar
 * (t0 = 30. kayıt günü + 2). Bu betik HİÇBİR DOSYA YAZMAZ:
 *   - zincir TAM doğrulanır (bozuksa çıkış 1);
 *   - dosya zincirdeyse değerler + tablo gösterilir ve ilk 30 kayıt gününden yeniden hesaplanıp karşılaştırılır (tutmazsa çıkış 1);
 *   - dosya yoksa: 30 kayıt günü yoksa REDDEDER (çıkış 2); varsa "bir sonraki gece koşusu yazacak" der ve önizlemeyi basar.
 * Varsayılan resmî arşiv; `--deneme` deneme kökünü inceler (resmî sayaçlara girmez). Ağ kullanmaz. İleri getiri hesaplanmaz.
 */
'use strict';
const A = require('../lib/tarama/arsiv');
const E = require('../lib/tarama/evren');

const resmi = !process.argv.includes('--deneme');
const kok = A.kokDizin({ resmi });
const v = A.dogrula(kok);
if (!v.gecerli) { console.error(`Manifest zinciri BOZUK — eşik doğrulanmaz:\n${v.hatalar.map(h => `  #${h.no} ${h.gun || ''} ${h.neden}`).join('\n')}`); process.exit(1); }
const m = A.manifestOku(kok).satirlar;
const $ = (x) => `${(x / 1e3).toLocaleString('tr-TR')} bin $`;
const tabloYaz = (r) => {
  console.log('\n| eşik | CEX ort. günlük evren | DEX ort. günlük evren |\n|---|---|---|');
  const dex = new Map(r.tablo.dex.map(x => [x.esik, x.ortalama]));
  for (const e of E.IZGARA.filter(x => x >= E.TABAN.dex)) console.log(`| ${$(e)} | ${(r.tablo.cex.find(x => x.esik === e) || {}).ortalama ?? '—'} | ${dex.get(e) ?? '—'} |`);
};
let mevcut;
try { mevcut = A.esikOku(kok, m); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
if (mevcut) {
  console.log(`${resmi ? 'Resmî' : 'Deneme'} evren eşikleri (zincirde, ${mevcut.kayitGunu} günü yazıldı): V_cex = ${$(mevcut.V_cex)} · L_dex = V_dex = ${$(mevcut.L_dex)} · t0 = ${mevcut.t0}`);
  console.log(`Kullanılan ${mevcut.kullanilanGunler.length} kayıt günü: ${mevcut.kullanilanGunler[0]} … ${mevcut.kullanilanGunler[mevcut.kullanilanGunler.length - 1]} (${mevcut.kesintisiz ? 'kesintisiz' : 'boşluklu'})`);
  tabloYaz(mevcut);
  const yeniden = A.esikHazirla(kok, m.filter(k => k.gun < mevcut.kayitGunu), mevcut.kayitGunu);
  const ayni = !!yeniden.esikler && ['V_cex', 'L_dex', 'V_dex', 't0'].every(k => yeniden.esikler[k] === mevcut[k]);
  console.log(ayni ? '\n✓ İlk 30 kayıt gününden yeniden hesap aynı sonucu veriyor.' : `\n✗ Yeniden hesap farklı: ${JSON.stringify(yeniden.esikler || yeniden.neden)}`);
  process.exit(ayni ? 0 : 1);
}
if (v.gunSayisi < E.ESIK_GUN) { console.log(`REDDEDİLDİ: ${v.gunSayisi} ${resmi ? 'resmî ' : ''}kayıt günü var; ${E.ESIK_GUN} gerekir (deneme günleri resmî sayaca girmez). Eşik henüz sabitlenmedi.`); process.exit(2); }
const on = A.esikHazirla(kok, m, '9999-12-31');
if (!on.esikler) { console.log(`Hesaplanamadı: ${on.neden}`); process.exit(2); }
console.log(`ÖNİZLEME (dosya yazılmadı): V_cex = ${$(on.esikler.V_cex)} · L_dex = V_dex = ${$(on.esikler.L_dex)} · t0 = ${on.esikler.t0}`);
tabloYaz(on.esikler);
console.log('\nBir sonraki gece arşiv koşusu bu değerleri evren/esik-v1.json olarak zincire bir kez yazacak.');
