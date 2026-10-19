#!/usr/bin/env node
/**
 * PORTFÖY TASARIMCISI — ELLE TİK. `npm run tasarimci:tik` (lib/tasarimci/zamanlayici.js tik; sunucu zamanlayıcısı da bunu
 * alt süreçte koşar).
 *   node scripts/tasarimci-tik.js            # karar / dolum / gün satırları, emir taslağı, aylık dışa aktarım, durum.json
 *   node scripts/tasarimci-tik.js --veri     # önce orkestratörle veri kaynaklarını tazele (sunucu çalışıyorsa kilit → atlanır)
 *   node scripts/tasarimci-tik.js --json     # tek satır JSON özet (sunucu alt süreci bunu okur)
 *   TASARIMCI=0 kapatır (--zorla ile yine koşar). Dizin: TASARIMCI_DIZIN (vars. data/tasarimci).
 * Geliştirme makinesinde (data/makine.json arastirmaModu) kayıtlar `deneme: true`; resmî kayıt yalnız sunucuda.
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const arg = process.argv.slice(2), bayrak = b => arg.includes(b);
const JSONK = bayrak('--json');

(async () => {
  if (bayrak('--veri')) {
    const ORK = require(path.join(ROOT, 'lib', 'veri', 'orkestrator'));
    const Z = require(path.join(ROOT, 'lib', 'tasarimci', 'zamanlayici'));
    try { await ORK.varsayilan({ log: (lv, m) => { if (!JSONK) console.log(`  ${lv} ${m}`); } }).calistir({ kaynaklar: Z.VERI_KAYNAKLARI, neden: 'tasarimci:tik --veri' }); }
    catch (e) { if (!JSONK) console.log(`  veri tazelenemedi (${e.message}) — eldeki veriyle sürüyor`); }
  }
  const Z = require(path.join(ROOT, 'lib', 'tasarimci', 'zamanlayici'));
  const d = await Z.tik({ zorla: bayrak('--zorla'), log: (lv, m) => { if (!JSONK) console.log(`${lv} ${m}`); } });
  if (JSONK) { process.stdout.write(JSON.stringify(d) + '\n'); return process.exit(0); }
  if (d.kapali) { console.log('Tasarımcı kapalı (TASARIMCI=0).'); return process.exit(0); }
  if (d.reddedildi) { console.error(`\nTasarımcı tik REDDEDİLDİ — ${d.neden}`); return process.exit(2); }
  console.log(`\nTasarımcı tik — ${d.bugun} · makine ${d.makine === "ev" ? "sunucu" : d.makine}${d.deneme ? ' (DENEME kayıtları)' : ''} · ${d.sureSn.toFixed(1)} sn`);
  console.log(`  eklenen: ${d.eklenen.kararlar} karar, ${d.eklenen.gunluk} gün, ${d.eklenen.dolumlar} dolum; emir taslağı: ${d.eklenen.emirler.join(', ') || '—'}; aylık dışa aktarım: ${d.eklenen.disari.length}`);
  for (const [id, s] of Object.entries(d.seriler)) console.log(`  ${id.padEnd(12)} son ${s.sonGun || '—'} · endeks ${typeof s.sonEndeks === 'number' ? s.sonEndeks.toFixed(2) : '—'} · ${s.satir} satır${s.veriNotu ? ' · ' + s.veriNotu : ''}`);
  if (d.uyarilar.length) { console.log('  Uyarılar:'); for (const u of d.uyarilar) console.log('   - ' + u); }
  console.log(`  sonraki karar: NYSE ${d.sonrakiKarar.NYSE.karar} → ${d.sonrakiKarar.NYSE.uygulama} · BIST ${d.sonrakiKarar.BIST.karar} → ${d.sonrakiKarar.BIST.uygulama}`);
  process.exit(0);
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
