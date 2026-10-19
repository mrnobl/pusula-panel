#!/usr/bin/env node
/**
 * DİKKAT F1 — günlük ham arşiv koşusu (lib/tarama/arsiv.js). `npm run tarama:gunluk -- --neden elle`
 *
 *   --neden elle|zamanlanmis   koşunun nedeni (kayda yazılır; varsayılan elle)
 *   --resmi                    RESMÎ kayıt günü (data/tarama/). Görev Zamanlayıcı bunu verir: --neden zamanlanmis --resmi.
 *                              Bayrak yoksa DENEME kipi (data/tarama/deneme/) — resmî sayaçlara girmez.
 *   --zorla                    (yalnız deneme) bugünün deneme kaydını silip yeniden koş
 *   --dogrula [--resmi]        ağsız: manifest zincirini ve TÜM gün dosyalarının SHA'sını doğrula (çıkış kodu 1 = bozuk)
 *   --durum                    ağsız: iki kipin özeti (son gün, kesintisiz gün, boşluklar)
 *   --azami goplus=50,rugcheck=20   bu koşu için kaynak başına ek tavan (deneme amaçlı)
 *
 * Kilit: data/tarama/gunluk.kilit (iki kip ortak). Binance istekleri veri orkestratörünün BinanceKota'sından geçer.
 */
'use strict';
const A = require('../lib/tarama/arsiv');

const argv = process.argv.slice(2);
const var_ = (a) => argv.includes(a);
const deger = (a) => { const i = argv.indexOf(a); return i >= 0 ? argv[i + 1] : null; };

function ozetYaz(d) {
  const k = (x) => `${x.kip.padEnd(6)} son gün ${x.sonGun || '—'} · kayıt günü ${x.gunSayisi} · kesintisiz ${x.kesintisiz} · boşluk ${x.bosluklar.length}${x.baslangic ? ` · başlangıç ${x.baslangic}` : ''} · zincir ${x.gecerli ? 'SAĞLAM' : 'BOZUK'} (${x.dosyaSinanan} dosya sınandı)`;
  console.log(k(d.resmi)); console.log(k(d.deneme));
  for (const x of [d.resmi, d.deneme]) for (const h of x.hatalar) console.log(`  ✗ ${x.kip} #${h.no} ${h.gun || ''}: ${h.neden}`);
}

(async () => {
  if (var_('--durum')) { ozetYaz(A.arsivDurumu()); return; }
  if (var_('--dogrula')) {
    const d = A.dogrula(A.kokDizin({ resmi: var_('--resmi') }));
    console.log(`${var_('--resmi') ? 'resmî' : 'deneme'}: ${d.satir} satır, ${d.gunSayisi} kayıt günü, ${d.dosyaSinanan} dosya — ${d.gecerli ? 'SAĞLAM' : 'BOZUK'}`);
    for (const h of d.hatalar) console.log(`  ✗ #${h.no} ${h.gun || ''}: ${h.neden}`);
    process.exitCode = d.gecerli ? 0 : 1; return;
  }
  const neden = deger('--neden') || 'elle';
  if (!['elle', 'zamanlanmis'].includes(neden)) throw new Error('--neden elle | zamanlanmis olmalı');
  const resmi = var_('--resmi');
  if (resmi && var_('--zorla')) throw new Error('--zorla yalnız deneme kipinde (resmî kayıt yeniden yazılmaz)');
  const azami = {};
  for (const p of String(deger('--azami') || '').split(',').filter(Boolean)) { const [a, n] = p.split('='); if (a && Number.isFinite(Number(n))) azami[a.trim()] = Number(n); }
  const ORK = require('../lib/veri/orkestrator');
  const ork = ORK.varsayilan({ log: () => {} });
  const binanceKota = new ORK.BinanceKota({ bekleme: ork.binanceBeklemeErisimi('dikkat F1 günlük arşiv') });
  const t0 = Date.now();
  const r = await A.gunlukKos({ resmi, neden, zorla: var_('--zorla'), azami, binanceKota, log: (l, m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`) });
  if (r.durum === 'zaten') { console.log(r.neden); return; }
  const o = r.ozet;
  console.log(`\n${r.gun} ${r.kip.toUpperCase()} kaydedildi · ${Math.round((Date.now() - t0) / 1000)} sn · manifest #${r.manifest.no}`);
  for (const kn of ['cex', 'dex']) { const e = o.evren[kn]; console.log(`  ${kn}: aday ${e.aday} · girdi ${e.girdi} (taban ${e.taban}) · elendi ${e.elendi} · ısınma ${e.isinma} · izlenen ${e.izleme}`); }
  console.log(`  eleme nedenleri: ${Object.entries(o.elemeNedenleri).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`  anlık görüntü: ${o.anlik} token`);
  for (const [ad, s] of Object.entries(o.kaynakOzet)) console.log(`    ${ad.padEnd(14)} ok ${s.ok} · boş ${s.bos} · önbellek ${s.onbellek} · hata ${s.hata} · kota ${s.kota} · uygulanmaz ${s.uygulanmaz}`);
  console.log(`  bağlam: ${JSON.stringify(o.baglam)}`);
  console.log(`  kota (bu koşu): ${JSON.stringify(r.kosu.kota.bu)}`);
  const hatali = r.kosu.uclar.filter(u => !u.ok);
  if (hatali.length) { console.log('  başarısız uçlar:'); for (const u of hatali) console.log(`    ${u.kaynak} ${u.uc} ${u.durum} ${u.http || ''} ${u.hata || ''}`); }
})().catch(e => { console.error(e && e.stack ? e.stack : e); process.exitCode = 1; });
