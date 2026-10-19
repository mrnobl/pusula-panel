#!/usr/bin/env node
/**
 * COIN TARAMA — komut satırı (sunucu kapalıyken de kayıt sürsün diye). `npm run tarama [-- --durum | --zorla]`
 *
 *   (bayraksız)  son başarılı tarama otomatik aralıktan eskiyse tarar (panel/zamanlayıcıyla aynı karar)
 *   --zorla      aralığa bakmadan tarar
 *   --durum      yalnız son durumu ve uyarıları yazar (ağ yok)
 *
 * Sunucuyla aynı kilidi kullanır (data/tarama/tarama.kilit): ikisi aynı anda koşamaz. Binance istekleri veri orkestratörünün
 * kota sayacından ve ortak 418/429 beklemesinden geçer (canlı kip: %25 ağırlık, istekler arası 1 sn).
 */
'use strict';
const { kur } = require('../lib/tarama');
const ORK = require('../lib/veri/orkestrator');

(async () => {
  const arg = new Set(process.argv.slice(2));
  const ork = ORK.varsayilan({ log: () => {} });
  const T = kur({ log: (l, m) => console.log(`[${l}] ${m}`), kota: () => new ORK.BinanceKota({ bekleme: ork.binanceBeklemeErisimi('coin tarama (CLI)') }) });
  const durumYaz = () => {
    const d = T.durumOzeti();
    console.log(`Son başarılı tarama: ${d.sonBasari || 'hiç'} · son deneme: ${d.sonDeneme || 'hiç'} · otomatik: ${d.otomatik.gerekli ? 'GEREKLİ' : 'gerekli değil'} (${d.otomatik.neden})`);
    if (d.sonTarama) console.log(`Son tarama ${d.sonTarama.id}: ${d.sonTarama.durum}, ${d.sonTarama.coin} coin, ${d.sonTarama.sureSn} sn`);
    for (const u of d.uyarilar) console.log(`  [${u.seviye}] ${u.metin}`);
  };
  if (arg.has('--durum')) { durumYaz(); return; }
  const k = T.tarayici.otomatikGerekli();
  if (!arg.has('--zorla') && !k.gerekli) { console.log(`Tarama gerekmiyor: ${k.neden} (zorlamak için --zorla)`); durumYaz(); return; }
  const t = await T.tarayici.tara({ neden: arg.has('--zorla') ? 'elle (CLI, zorla)' : `elle (CLI: ${k.neden})`, kim: 'komut satırı' });
  console.log(`Tarama ${t.id}: ${t.durum} · ${t.coin} coin · ${t.sureSn} sn`);
  for (const [ad, s] of Object.entries(t.kaynakOzet)) console.log(`  ${ad.padEnd(14)} veri ${s.ok} · son sorgudan ${s.onbellek} · yok ${s.bos} · hata ${s.hata} · uygulanmaz ${s.atlandi}${s.sonHata ? ` · son hata: ${s.sonHata}` : ''}`);
  durumYaz();
})().catch(e => { console.error(e.message); process.exit(1); });
