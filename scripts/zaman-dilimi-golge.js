#!/usr/bin/env node
/**
 * 3d GÖLGE İZLEYİCİ — elle çalıştırma / ara rapor (PLAN-GOLGE-3D.md ÖN KAYIT, deneme 635). Emir YOK.
 * Sunucu bunu her gün `scripts/ileri-izle.js` içinde (Bollinger kaydından sonra) çalıştırır; elle çalıştırmak güvenli (idempotent).
 * Kullanım: node scripts/zaman-dilimi-golge.js [--rapor] [--dizin <klasör>]   (--rapor: indirmeden yalnız ara rapor)
 */
const path = require('path');
const G = require('../lib/ileri/zamanDilimiGolge');
const I = require('../lib/ileri/bollingerIzleme');

const arg = (ad) => { const i = process.argv.indexOf(ad); return i > 0 ? process.argv[i + 1] : null; };
const dizin = arg('--dizin') ? path.resolve(arg('--dizin')) : I.VARSAYILAN_DIZIN;
const yz = (x, b = 1) => (x == null || !Number.isFinite(x) ? '—' : `%${(x * 100).toFixed(b)}`);
const sy = (x, b = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(b));

(async () => {
  if (!process.argv.includes('--rapor')) {
    const o = await G.calistir({ dizin });
    console.log(`3d gölge ${o.zaman} (${(o.sureMs / 1000).toFixed(1)} sn): +${o.yeniSatir} satır${o.gecikmeliSatir ? ` (${o.gecikmeliSatir} gecikmeli)` : ''}, son kapanmış ${o.sonKapanmis}, toplam ${o.satirSayisi}`);
  }
  const F = G.dosyalar(dizin);
  const r = G.araRapor(I.satirlariOku(F.kayit), I.satirlariOku(F.golge));
  console.log(`\nARA RAPOR — hüküm değil (deneme ${r.deneme}; hüküm ${r.hukumTarihi}, olay yoksa ${r.kesinHukum}; ${r.kalanGun} gün kaldı)`);
  console.log(`Kayıt ${r.satirSayisi} satır (gecikmeli ${r.gecikmeliSatir}), son karar günü ${r.sonKararGunu || '—'} · getiri günü ${r.gecenGun} (${r.ilk || '—'} → ${r.sonGun || '—'}), kol eksik ${r.kolEksikGun}`);
  if (r.sonKararlar) console.log(`Son kararlar: ${Object.entries(r.sonKararlar).map(([k, v]) => `${k} ${v ? 'BTC' : 'nakit'}`).join(' · ')} · son 3d bar: ${Object.entries(r.sonBar3d || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`BTC al-tut: ${yz(r.btcAlTut.getiri)} / MaxDD ${yz(r.btcAlTut.maxDD)}`);
  for (const [id, m] of Object.entries(r.adaylar)) {
    console.log(`  ${id} vs T: farklı gün ${m.farkliGun}/${m.gun} (olay şartı ≥ ${G.OLAY_GUN}) · Σd Hücum ${sy(m.sumH * 100, 1)} / Denge ${sy(m.sumD * 100, 1)} puan (en düşük ${sy(m.enDusukSumH * 100, 1)}; V1 ${sy(m.vazgec.esikV1 * 100, 0)}) · boot t ${sy(m.bootT)}`);
    console.log(`     Hücum getiri ${yz(m.aday_.hucum.getiri)} vs ${yz(m.taban.hucum.getiri)} · MaxDD ${yz(m.aday_.hucum.maxDD)} vs ${yz(m.taban.hucum.maxDD)} · işlem ${m.aday_.islem} vs ${m.taban.islem} · testere ${m.aday_.testere} vs ${m.taban.testere} · ${m.vazgec.durum}`);
  }
  for (const [id, b] of Object.entries(r.bilgi)) console.log(`  (bilgi) ${id}: Hücum ${yz(b.hucum.getiri)} · farklı gün ${b.farkliGun}`);
})().catch(e => { console.error('HATA:', e.message); process.exit(1); });
