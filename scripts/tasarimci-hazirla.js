#!/usr/bin/env node
/**
 * PORTFÖY TASARIMCISI — VERİ HAZIRLAMA (evdeki PC'de bir kez; sonra orkestratör tazeler). `npm run tasarimci:hazirla`
 * PLAN-PORTFOY-TASARIMCI.md (d) "tasarimci:hazirla (evde veri)", (f) "evdeki PC'de veri yok". SIFIR BÜTÇE: yalnız ücretsiz,
 * anahtarsız kaynaklar (Yahoo Finance v8 chart, Wikipedia API).
 *
 *   node scripts/tasarimci-hazirla.js            # eksikleri indir (var olan ölçüm girdisine dokunmaz)
 *   node scripts/tasarimci-hazirla.js --kuru     # yalnız ne yapılacağını yaz (ağ yok, dosya yok)
 *   node scripts/tasarimci-hazirla.js --nasdaq   # data/nasdaq varsa bile nasdaq-indir.js --eksik (eksik seriler)
 *   node scripts/tasarimci-hazirla.js --bist     # data/bist varsa bile bist-indir.js (tüm havuz yeniden)
 *
 * ADIMLAR (her biri ayrı; biri düşerse diğerleri sürer, sonda özet)
 *   1. data/nasdaq yoksa: scripts/nasdaq-indir.js TAM (Wikipedia PIT üyelik + ~600 Yahoo serisi, ^GSPC dahil; ~5 dk).
 *   2. data/qqq-yenmek/irx.json yoksa: scripts/qqq-momentum.js indir (^IRX, ^NDXE, QQQE — holdout'a dokunmaz).
 *   3. data/bist yoksa: scripts/bist-indir.js (BIST havuzu + XU030, XU100, USDTRY, BTC-USD); TCMB politika faizi tablosu
 *      yoksa git kopyasından (kayitlar/tasarim/veri/tcmb-politika-faizi.json) data/bist'e kopyalanır.
 *   4. Canlı kopyalar orkestratörle (lib/veri/orkestrator.js — sunucuyla aynı kod ve durum dosyası): yahoo-gercek-varlik
 *      (^GSPC), yahoo-nasdaq (QQQ + Nasdaq-100 hisseleri), yahoo-portfoy (^IRX), yahoo-bist (BIST havuzu + XU030 →
 *      data/portfoy/yahoo-bist), usdtry. Sunucu çalışıyorsa kilit nedeniyle bu adım atlanır (sunucu kendi tazeler).
 *   5. Bu ayın Nasdaq-100 anlık görüntüsü (data/tasarimci/uyelik/YYYY-MM.json, bir kez yazılır, revid ile dondurulur).
 *   6. Özet: tazelik tablosu + 2026-09-30 kararlarının en yüksek sürümlü t1-sN.json ilk listeleriyle karşılaştırması (veri yeterse).
 * Botu başlatmaz, canlı modüllere (lib/live, lib/risk) dokunmaz.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const arg = process.argv.slice(2), bayrak = b => arg.includes(b);
const KURU = bayrak('--kuru');
const ozet = [];
const var_ = p => fs.existsSync(yollar.veri(p));

function cocuk(betik, args = []) {
  return new Promise((coz, red) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'scripts', betik), ...args], { cwd: ROOT, stdio: 'inherit' });
    p.on('error', red);
    p.on('exit', k => (k === 0 ? coz() : red(new Error(`${betik} çıkış kodu ${k}`))));
  });
}
async function adim(ad, gerekli, f) {
  if (!gerekli) { ozet.push([ad, 'gerekmedi']); console.log(`\n— ${ad}: gerekmedi`); return; }
  if (KURU) { ozet.push([ad, 'yapılacak (--kuru)']); console.log(`\n— ${ad}: YAPILACAK (--kuru, atlandı)`); return; }
  console.log(`\n— ${ad}`);
  const t0 = Date.now();
  try { const r = await f(); ozet.push([ad, `tamam (${((Date.now() - t0) / 1000).toFixed(0)} sn)${r ? ' · ' + r : ''}`]); }
  catch (e) { ozet.push([ad, 'HATA: ' + e.message]); console.error(`   HATA: ${e.message}`); }
}

(async () => {
  console.log(`Portföy tasarımcısı veri hazırlığı ${KURU ? '(KURU — ağ yok, yazım yok)' : ''}`);
  await adim('1. Nasdaq ölçüm verisi (scripts/nasdaq-indir.js)', !var_('nasdaq/uyelik.json') || !var_('nasdaq/_GSPC.json') || bayrak('--nasdaq'),
    () => cocuk('nasdaq-indir.js', var_('nasdaq/uyelik.json') ? ['--eksik'] : []));
  await adim('2. ^IRX / NDXE / QQQE (scripts/qqq-momentum.js indir)', !var_('qqq-yenmek/irx.json'), () => cocuk('qqq-momentum.js', ['indir']));
  await adim('3. BIST ölçüm verisi (scripts/bist-indir.js)', !var_('bist/XU030.IS.json') || bayrak('--bist'), () => { fs.mkdirSync(yollar.veri('bist'), { recursive: true }); return cocuk('bist-indir.js'); });   // bist-indir.js klasörü kendisi açmaz
  await adim('3b. TCMB politika faizi tablosu → data/bist', var_('bist') && !var_('bist/tcmb-politika-faizi.json'), async () => {
    fs.copyFileSync(path.join(ROOT, 'kayitlar', 'tasarim', 'veri', 'tcmb-politika-faizi.json'), yollar.veri('bist', 'tcmb-politika-faizi.json'));
    return 'kayitlar/tasarim/veri kopyası';
  });
  await adim('4. Canlı kopyalar (orkestratör: ^GSPC, QQQ + Nasdaq-100, ^IRX, BIST havuzu, USDTRY)', true, async () => {
    const ORK = require(path.join(ROOT, 'lib', 'veri', 'orkestrator'));
    const o = ORK.varsayilan({ log: (lv, m) => console.log(`   ${lv} ${m}`) });
    try {
      const r = await o.calistir({ kaynaklar: ['yahoo-gercek-varlik', 'yahoo-nasdaq', 'yahoo-portfoy', 'yahoo-bist', 'usdtry'], neden: 'tasarimci:hazirla' });
      return Object.entries((r && r.adimlar) || {}).map(([k, v]) => `${k} ${v.durum}${v.veriGunu ? ' ' + v.veriGunu : ''}${v.hata ? ' (' + v.hata.slice(0, 80) + ')' : ''}`).join(', ');
    } catch (e) {
      if (/kilit|çalışıyor/i.test(e.message)) return 'atlandı — başka süreç (sunucu?) veri güncelliyor; sunucu kendi tazeler';
      throw e;
    }
  });
  await adim('5. Nasdaq-100 bu ayın anlık görüntüsü (Wikipedia, dondurulur)', true, async () => {
    const UY = require(path.join(ROOT, 'lib', 'tasarimci', 'uyelik'));
    const ay = new Date().toISOString().slice(0, 7);
    let makine = 'ev'; try { if (JSON.parse(fs.readFileSync(yollar.veri('makine.json'), 'utf8')).arastirmaModu) makine = 'gelistirme'; } catch (e) { makine = 'ev'; }   // data/makine.json yalnız geliştirme makinesinde
    const r = await UY.anlikGoruntuAl(ay, { makine });
    if (r.durum === 'hata') throw new Error(r.uyari);
    return `${ay}: ${r.durum} (${r.kayit.uyeSay} üye, revid ${r.kayit.kaynak.guncel.revid}/${r.kayit.kaynak.degisim.revid}${r.kayit.yeniAnahtarlar.length ? ', YENİ anahtar: ' + r.kayit.yeniAnahtarlar.join(' ') + ' — ad denetimi elle' : ''})`;
  });

  console.log('\n═══ Özet ═══');
  for (const [a, d] of ozet) console.log(`  ${a}: ${d}`);
  try {
    const V = require(path.join(ROOT, 'lib', 'tasarimci', 'veri'));
    const tz = V.tazelik();
    console.log('\nTazelik (canlı kip):');
    for (const s of tz.satirlar) console.log(`  ${s.sembol.padEnd(9)} ${s.borsa} ${String(s.dizin || '—').padEnd(12)} son ${s.sonGun || 'YOK'} · beklenen ${s.beklenen}${s.bayat ? ` · BAYAT (${s.eksikGun == null ? 'veri yok' : s.eksikGun + ' işlem günü eksik'})` : ''}`);
  } catch (e) { console.log('  tazelik okunamadı: ' + e.message); }
  if (!KURU) {
    const S = require(path.join(ROOT, 'lib', 'tasarimci', 'model')).sabitleme();   // en yüksek sürüm (t1-sN.json)
    const SAB = require(path.join(ROOT, 'lib', 'tasarimci', 'model')).sabYolu().replace('kayitlar/tasarim/', '').replace('.json', '');   // ör. t1-s2
    const ilk = id => S.modeller.find(m => m.id === id).baslangic.ilkListe.join(' ');
    try { const M = require(path.join(ROOT, 'lib', 'tasarimci', 'stratejiler', 'm10')); const h = M.hedef(M.hazirla(), '2026-09-30'); const l = h.liste.map(x => x.s).join(' '); console.log(`\nNasdaq M10 2026-09-30: ${l} ${l === ilk('m-qqq-m10') ? '= ' + SAB + ' ✓' : '≠ ' + SAB + ' ✗ (' + ilk('m-qqq-m10') + ')'}`); } catch (e) { console.log('\nNasdaq M10 hesaplanamadı: ' + e.message); }
    try { const B = require(path.join(ROOT, 'lib', 'tasarimci', 'stratejiler', 'bistM10')); const h = B.hedef(B.hazirla(), '2026-09-30'); const l = h.liste.map(x => x.s).join(' '); console.log(`BIST M10 2026-09-30: ${l} ${l === ilk('m-bist-m10') ? '= ' + SAB + ' ✓' : '≠ ' + SAB + ' ✗ (' + ilk('m-bist-m10') + ')'}`); } catch (e) { console.log('BIST M10 hesaplanamadı: ' + e.message); }
    console.log('\nSonraki adım: npm run tasarimci:mutabakat (ölçüm betikleriyle birebir denetim).');
  }
  process.exit(ozet.some(([, d]) => /^HATA/.test(d)) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
