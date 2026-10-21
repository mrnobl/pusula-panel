#!/usr/bin/env node
/**
 * 69.5 İSTATİSTİK KOMUTU — `npm run istatistik -- [seçenek]`. Ağ yok, yalnız okur.
 *
 *   (seçeneksiz)              kayitlar/denemeler.jsonl özeti: toplam deneme sayısı, aileler, kabul/red, ve bu kadar denemeden
 *                             sonra ŞANSLA beklenen en iyi yıllık Sharpe (DSR eşiği). --sr-std ile denemelerin yıllık Sharpe
 *                             yayılımı (varsayılan 0,5).
 *   --seri <dosya>            günlük getiri listesi (JSON dizi ya da satır başına bir sayı): yıllık Sharpe, PSR(0),
 *                             PSR(eşik), MinTRL (gün). --esik <yıllık Sharpe> karşılaştırma eşiği (varsayılan 0).
 *   --matris <dosya>          JSON T×N getiri matrisi (satır: gün, sütun: aday): PBO (CSCV). --bloklar <S> (varsayılan 16).
 */
const fs = require('fs');
const path = require('path');
const I = require('../lib/istatistik');

const KOK = path.join(__dirname, '..');
const arg = (ad, vars = null) => { const i = process.argv.indexOf(ad); return i > 0 && process.argv[i + 1] != null ? process.argv[i + 1] : vars; };
const yuzde = (x, b = 1) => `%${(x * 100).toFixed(b).replace('.', ',')}`;
const sayi = (x, b = 2) => (Number.isFinite(x) ? x.toFixed(b).replace('.', ',') : String(x));

function seriOku(dosya) {
  const m = fs.readFileSync(dosya, 'utf8').trim();
  if (m.startsWith('[')) return JSON.parse(m).map(Number);
  return m.split(/\r?\n/).map(Number).filter(Number.isFinite);
}

/** denemeler.jsonl özeti (panel ve kitapçık aynı sayıyı kullanır: en büyük aralık sonu = deneme sayacı). */
function denemeOzeti(dosya = path.join(KOK, 'kayitlar', 'denemeler.jsonl'), srStd = 0.5) {
  const l = fs.readFileSync(dosya, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const N = l.reduce((a, x) => Math.max(a, (x.aralik || [0, 0])[1] || 0), 0);
  const aileler = {};
  for (const x of l) {
    const a = aileler[x.aile || '?'] = aileler[x.aile || '?'] || { ad: x.aileAd || x.aile, kayit: 0, deneme: 0, kabul: 0, red: 0 };
    a.kayit++; a.deneme += x.aralik ? x.aralik[1] - x.aralik[0] + 1 : 0;
    if (/KABUL/i.test(x.durum || '')) a.kabul++; else if (/RED/i.test(x.durum || '')) a.red++;
  }
  // Yıllık Sharpe yayılımı → günlük (√365): DSR eşiği günlükte hesaplanır, yıllığa geri çevrilir.
  const gunlukStd = srStd / Math.sqrt(365);
  const esik = (n) => I.beklenenMaxSharpe(n, gunlukStd ** 2) * Math.sqrt(365);
  return { N, kayit: l.length, aileler, esikN: esik(N), esikler: [10, 100, 500, N].filter((v, i, a) => v >= 2 && a.indexOf(v) === i).map(n => ({ n, sr: esik(n) })), srStd };
}

function main() {
  const seri = arg('--seri'), matris = arg('--matris');
  if (seri) {
    const r = seriOku(seri);
    const esikY = +arg('--esik', 0);
    const a = I.anlar(r);
    const e0 = esikY / Math.sqrt(365);
    console.log(`Gün: ${r.length} · yıllık Sharpe ${sayi(a.sr * Math.sqrt(365))} · çarpıklık ${sayi(a.sk)} · basıklık ${sayi(a.ku)}`);
    console.log(`PSR(0) ${yuzde(I.psr(r, 0))} · PSR(${sayi(esikY)}) ${yuzde(I.psr(r, e0))}`);
    const t = I.minTRL(r, e0);
    console.log(`MinTRL (%95, eşik ${sayi(esikY)}): ${Number.isFinite(t) ? `${Math.ceil(t)} gün` : 'Sharpe eşiğin altında — yeterli kayıt yok'}`);
    return;
  }
  if (matris) {
    const M = JSON.parse(fs.readFileSync(matris, 'utf8'));
    const r = I.pbo(M, { S: +arg('--bloklar', 16) });
    if (!r) { console.log('Matris uygun değil (en az 2 aday, en az 2×S satır, S çift).'); process.exitCode = 1; return; }
    console.log(`PBO (CSCV, ${r.bolme} bölme): ${yuzde(r.pbo)} · medyan logit ${sayi(r.medyanLogit)}`);
    console.log(r.pbo > 0.5 ? 'İçeride en iyi aday dışarıda çoğunlukla medyanın ALTINDA: seçim büyük olasılıkla aşırı uydurma.' : 'İçeride en iyi aday dışarıda çoğunlukla medyanın üstünde.');
    return;
  }
  const o = denemeOzeti(undefined, +arg('--sr-std', 0.5));
  console.log(`Deneme sayacı: ${o.N} (${o.kayit} kayıt)`);
  for (const a of Object.values(o.aileler).sort((x, y) => y.deneme - x.deneme).slice(0, 15)) console.log(`  ${String(a.ad).slice(0, 48).padEnd(48)} ${String(a.deneme).padStart(5)} deneme · ${a.kabul} kabul · ${a.red} red`);
  console.log(`\nŞansla beklenen en iyi yıllık Sharpe (denemelerin yıllık Sharpe yayılımı ${sayi(o.srStd)} varsayımıyla):`);
  for (const e of o.esikler) console.log(`  ${String(e.n).padStart(5)} deneme → ${sayi(e.sr)}`);
  console.log(`Yeni bir aday ${o.N}. denemeden sonra bu eşiği geçmeden "kenar var" sayılmamalı (Deflated Sharpe, Bailey & López de Prado 2014).`);
}

if (require.main === module) main();
module.exports = { denemeOzeti, seriOku };
