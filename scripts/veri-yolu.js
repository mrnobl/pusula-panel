#!/usr/bin/env node
/**
 * VERİ YOLU — betikler için (68.0, PLAN-TASIMA F2). PowerShell / .cmd betikleri veri yolunu kendisi kurmaz, buna sorar:
 *
 *   node scripts\veri-yolu.js pusula.pid        → pusula.pid'in tam yolu (eski düzen: <program>\data\pusula.pid)
 *   node scripts\veri-yolu.js --dizin pusula.pid → o parçanın bulunduğu klasör (eski: <program>\data, yeni: <kök>\makine)
 *   node scripts\veri-yolu.js                    → veri kökü
 *   node scripts\veri-yolu.js --bilgi            → { kok, duzen, kaynak } (JSON)
 *
 * Çıktı program klasörünün İÇİNDEYSE göreli yazılır (ör. "data\pusula.pid") — .cmd betikleri yalnız ASCII baytı güvenle
 * okur, program klasörü yolu ise Türkçe harf içerebilir (ör. C:\Users\Ayşe\…). Çağıran göreli çıktıyı program köküne ekler.
 * Hata olursa çıkış kodu 1 ve çıktı yok: betik eski yola (<program>\data) döner.
 */
'use strict';
const path = require('path');

function main(argv) {
  const yollar = require('../lib/yollar');
  if (argv.includes('--bilgi')) return JSON.stringify(yollar.bilgi());
  const dizin = argv.includes('--dizin');
  const parcalar = argv.filter(a => !a.startsWith('--'));
  let y = yollar.veri(...parcalar);
  if (dizin && parcalar.length) y = path.dirname(y);
  const g = path.relative(yollar.PROGRAM, y);
  return (g && !g.startsWith('..') && !path.isAbsolute(g)) ? g : y;
}

if (require.main === module) {
  try { process.stdout.write(main(process.argv.slice(2)) + '\n'); } catch (e) { process.stderr.write(`veri-yolu: ${e.message}\n`); process.exit(1); }
}
module.exports = { main };
