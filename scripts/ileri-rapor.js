#!/usr/bin/env node
/**
 * İLERİ VERİ ARA RAPORU — Bollinger düşüş azaltıcı (PLAN-ILERI-BOLLINGER.md). YALNIZ BETİMLEYİCİ:
 * ara raporda HÜKÜM yazılmaz. Hüküm bölümü `hukum()` çıktısıdır ve 2027-10-07'den önce
 * "henüz hüküm zamanı değil" der.
 * Kullanım: node scripts/ileri-rapor.js [--dizin <klasör>] [--bugun YYYY-MM-DD] [--json]
 */
const path = require('path');
const I = require('../lib/ileri/bollingerIzleme');
const R = require('../lib/ileri/bollingerRapor');

const arg = (ad) => { const i = process.argv.indexOf(ad); return i > 0 ? process.argv[i + 1] : null; };
const dizin = arg('--dizin') ? path.resolve(arg('--dizin')) : I.VARSAYILAN_DIZIN;
const bugun = arg('--bugun') || new Date().toISOString().slice(0, 10);
const F = I.dosyalar(dizin);
const kayit = I.satirlariOku(F.kayit), golge = I.satirlariOku(F.golge);
const r = R.araRapor(kayit, golge, bugun);
const h = R.hukum(kayit, bugun);

if (process.argv.includes('--json')) { console.log(JSON.stringify({ araRapor: r, hukum: h }, null, 2)); process.exit(0); }

const yz = (x, b = 1) => (x == null ? '—' : `${(x * 100).toFixed(b)}%`);
const sy = (x, b = 2) => (x == null ? '—' : x.toFixed(b));
const L = (k) => (k == null ? '—' : k ? 'LONG' : 'yok');
console.log(`# İleri veri testi — Bollinger düşüş azaltıcı · ${bugun}`);
console.log(`> ${r.uyari}\n`);
console.log(`Başlangıç ${r.baslangic} (ilk karar ${r.ilkKararGunu} kapanışı) · geçen ${r.gecenGun} gün · sonraki hüküm tarihi ${r.sonrakiHukumTarihi} (${r.kalanGun} gün)`);
console.log(`Kayıt: ${r.satirSayisi} satır, ${r.kayitliSeri}/${r.toplamSeri} seri, son karar günü ${r.sonKararGunu || '—'}, gecikmeli ${r.gecikmeliSatir}`);
console.log(`Düşüş olayı sayacı: al-tut MaxDD ≥ %${R.DD_OLAY * 100} olan seri ${r.dusus.sayi} / eşik ${r.dusus.esikSeri}${r.dusus.seriler.length ? ` (${r.dusus.seriler.join(', ')})` : ''}`);
console.log(`C0 vs C1 MaxDD (${r.kiyas.n} seri): C1 daha düşük ${r.kiyas.c1Dusuk} · C0 daha düşük ${r.kiyas.c0Dusuk} · eşit ${r.kiyas.esit}\n`);
console.log('| Seri | Gün | C0 getiri / MaxDD / Sharpe / işlem | C1 | C3 | Al-tut getiri / MaxDD | Son karar (C0/C1/C3) |');
console.log('|---|---|---|---|---|---|---|');
for (const s of r.seriler) {
  const f = (m) => `${yz(m.getiri)} / ${yz(m.maxdd)} / ${sy(m.sharpe)} / ${m.islem}`;
  console.log(`| ${s.seri}${s.eksik ? ' (eksik)' : ''} | ${s.gun} | ${f(s.m.C0)} | ${f(s.m.C1)} | ${f(s.m.C3)} | ${yz(s.m.AT.getiri)} / ${yz(s.m.AT.maxdd)} | ${s.sonKarar ? `${L(s.sonKarar.C0)}/${L(s.sonKarar.C1)}/${L(s.sonKarar.C3)} (${s.sonKararGunu})` : '—'} |`);
}
const k = r.kriterDurumu;
console.log(`\n## Kriterlerin O ANKİ durumu (betimleyici — hüküm değil)`);
console.log(`1. Varlıklar arası: MaxDD_C1 < MaxDD_C0 ${k.k1.k}/${k.k1.n} (oran ${k.k1.oran == null ? '—' : yz(k.k1.oran)}), işaret p ${sy(k.k1.p, 4)}`);
console.log(`2. BTC: ${k.k2.mevcut ? `MaxDD C0 ${yz(k.k2.ddC0)} · C1 ${yz(k.k2.ddC1)}` : 'veri yok'}`);
console.log(`3. Medyan ΔSharpe (C1 − C0), ${k.k3.n} seri: ${sy(k.k3.medyanDSharpe)} (sınır −0,20)`);
const g = r.golge;
console.log(`\n## Gölge (bilgi, karar dışı): Hücum / Denge model getirisi — ${g.gun} gün${g.gun ? ` (${g.ilk} → ${g.son})` : ''}`);
for (const ad of ['hucum', 'denge']) console.log(`  ${ad === 'hucum' ? 'Hücum' : 'Denge'}: ${['C0', 'C1', 'C3'].map(c => `${c} ${yz(g[ad][c].getiri)} (DD ${yz(g[ad][c].maxdd)})`).join(' · ')}`);
if (r.eksik.length) console.log(`\nEksik seriler (${r.eksik.length}): ${r.eksik.map(e => `${e.seri} — ${e.neden}`).join('; ')}`);
console.log(`\n## Hüküm: ${h.durum === 'hukum' ? `${h.hukum} (${h.kol}, ${h.tarih})` : h.mesaj}`);
