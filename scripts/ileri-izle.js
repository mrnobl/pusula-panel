#!/usr/bin/env node
/**
 * İLERİ VERİ GÖLGE İZLEYİCİ — elle çalıştırma (PLAN-ILERI-BOLLINGER.md). Emir YOK.
 * Sunucu aynı işi her gün 00:15 UTC sonrası ilk tikte ve açılışta bir kez yapar (bu betiği
 * alt süreç olarak `--json` ile koşar); ikisi aynı anda koşarsa kilit dosyası sıraya sokar.
 * Tekrar çalıştırmak güvenli (idempotent).
 * Ardından 3d gölge izleyici (PLAN-GOLGE-3D.md, lib/ileri/zamanDilimiGolge.js) aynı çalışmada koşar; hatası Bollinger
 * sonucunu bozmaz (`zamanDilimi.hata`), eksik günler sonraki çalışmada gecikmeli yazılır.
 * Sonra D3 range vetosu gölgesi (PLAN-GOLGE-D3.md, lib/ileri/rangeVetoGolge.js) aynı şekilde koşar (`rangeVeto`; hatası
 * diğerlerini bozmaz).
 * En son EUR/USD CBDR gölge testi (PLAN-ILERI-CBDR.md, lib/ileri/cbdrGolge.js; deneme 864) aynı şekilde koşar (`cbdr`; hatası
 * diğerlerini bozmaz): Binance EURUSDT 5 dk mumları, kesinleşen iş günleri yalnız eklenir.
 * Ardından 876 TVL L/S gölgesi + Hücum %90 / 876 %10 birleşimi (PLAN-ILERI-876.md, lib/ileri/golge876.js; deneme 882) aynı şekilde
 * koşar (`golge876`; hatası diğerlerini bozmaz): Binance USDⓈ-M günlük mum + funding, kuruluş günlerinde DefiLlama TVL; eksik veri
 * `eksik` listesine "876:…" olarak eklenir (sunucu aynı gün 30 dk arayla yeniden dener).
 * Kullanım: node scripts/ileri-izle.js [--dizin <klasör>] [--json]   (--json: özet stdout'a JSON)
 */
const path = require('path');
const I = require('../lib/ileri/bollingerIzleme');
const ZD = require('../lib/ileri/zamanDilimiGolge');
const RV = require('../lib/ileri/rangeVetoGolge');
const CB = require('../lib/ileri/cbdrGolge');
const G876 = require('../lib/ileri/golge876');

const arg = (ad) => { const i = process.argv.indexOf(ad); return i > 0 ? process.argv[i + 1] : null; };
const dizin = arg('--dizin') ? path.resolve(arg('--dizin')) : I.VARSAYILAN_DIZIN;
const json = process.argv.includes('--json');

(async () => {
  let o = null, hata = null;
  try { o = await I.calistir({ dizin, log: (s, m) => (json ? console.error : console.log)(`[${s}] ${m}`) }); } catch (e) { hata = e; }
  let zd;
  try { zd = await ZD.calistir({ dizin }); } catch (e) { zd = { hata: e.message }; }
  let rv;
  try { rv = await RV.calistir({ dizin }); } catch (e) { rv = { hata: e.message }; }
  let cb;
  try { cb = await CB.calistir({ dizin }); cb = { ...cb, siradaki: cb.siradaki ? { gun: cb.siradaki.gun, durum: cb.siradaki.durum } : null }; } catch (e) { cb = { hata: e.message }; }
  let g8;
  try {
    const x = await G876.calistir({ dizin, log: (s, m) => (json ? console.error : console.log)(`[${s}] ${m}`) });
    g8 = { durum: x.durum, sonKapanmis: x.sonKapanmis, yeniSatir: x.yeniSatir, eksik: x.eksik, degisen: x.degisen.length, ay: x.ay ? { F: x.ay.F, long: x.ay.long, short: x.ay.short } : null };
  } catch (e) { g8 = { hata: e.message }; }
  if (hata) throw hata;
  if (g8.eksik && g8.eksik.length) o.eksik.push(...g8.eksik.slice(0, 5));
  o.golge876 = g8;
  o.zamanDilimi = zd;
  o.rangeVeto = rv;
  o.cbdr = cb;
  if (json) { process.stdout.write(JSON.stringify(o)); return; }
  console.log(`İleri izleme ${o.zaman} (${(o.sureMs / 1000).toFixed(1)} sn) — dizin ${dizin}`);
  console.log(`  yeni kayıt satırı: ${o.yeniSatir} (gecikmeli ${o.gecikmeliSatir}) · gölge: ${o.golgeYeni}${o.golgeHata ? ` (HATA: ${o.golgeHata})` : ''}`);
  console.log(`  kaydı olan seri: ${o.kaydedilenSeri}/${I.SERILER.length}`);
  for (const s of o.seriler) console.log(`    ${s.seri.padEnd(10)} son kapanmış ${s.sonKapanmis || '-'}  yeni ${s.yeni}${s.gecikmeli ? ` (gecikmeli ${s.gecikmeli})` : ''}`);
  if (o.eksik.length) console.log(`  İNDİRİLEMEYEN: ${o.eksik.map(e => `${e.seri} (${e.neden})`).join(' · ')}`);
  for (const [s, n] of Object.entries(o.notlar)) console.log(`  not ${s}: ${n}`);
  console.log(rv.hata ? `  D3 gölge HATA: ${rv.hata}` : `  D3 gölge: +${rv.yeniSatir} satır${rv.gecikmeliSatir ? ` (gecikmeli ${rv.gecikmeliSatir})` : ''}, son kapanmış ${rv.sonKapanmis}`);
  console.log(cb.hata ? `  CBDR gölge HATA: ${cb.hata}` : `  CBDR gölge: +${cb.yeniSatir} gün${cb.gecikmeliSatir ? ` (gecikmeli ${cb.gecikmeliSatir})` : ''}, ${cb.satirSayisi} kayıtlı gün${cb.degisen.length ? ` · UYARI ${cb.degisen.length} gün yeniden hesapta farklı` : ''}`);
  console.log(g8.hata ? `  876 gölge HATA: ${g8.hata}` : `  876 gölge: ${g8.durum}, +${g8.yeniSatir} satır, son kapanmış ${g8.sonKapanmis}${g8.ay ? ` · ${g8.ay.F} sepeti ${g8.ay.long} long / ${g8.ay.short} short` : ''}${g8.eksik.length ? ` · eksik ${g8.eksik.length}` : ''}${g8.degisen ? ` · UYARI ${g8.degisen} satır yeniden hesapta farklı` : ''}`);
  console.log(zd.hata ? `  3d gölge HATA: ${zd.hata}` : `  3d gölge: +${zd.yeniSatir} satır${zd.gecikmeliSatir ? ` (gecikmeli ${zd.gecikmeliSatir})` : ''}, son kapanmış ${zd.sonKapanmis}`);
})().catch(e => { console.error('HATA:', e.message); process.exit(1); });
