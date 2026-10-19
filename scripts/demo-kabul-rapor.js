#!/usr/bin/env node
/**
 * DEMO KABUL RAPORU — PLAN-DEMO-KABUL.md §8 (ön-kayıt 2026-10-07). SALT OKUR: bot dosyalarına yazmaz, emir vermez.
 *
 *   node scripts/demo-kabul-rapor.js                         → bugünkü durum (konsol tablosu + data/arastirma/demo-kabul-rapor-<gün>.json)
 *   node scripts/demo-kabul-rapor.js --bit 2026-12-09        → o güne kadar (63. gün hükmü)
 *   seçenekler: --dizin data/live/hucum-demo · --gun0 YYYY-MM-DD · --bit YYYY-MM-DD · --prova <json> · --strateji hucum|denge
 *               --hesap testnet · --ag (prod günlük mum referansı Binance genel ucundan, anahtarsız; önbellek
 *               data/arastirma/demo-kabul-ref.json) · --json (çıktıyı JSON bas) · --yazma (dosya yazma) · --prova-sablon
 *
 * 64.4: HESAP lib/ileri/demoKabulRapor.js'te (panelin İleri test › Demo kabul kartı aynı kodu çalıştırır). Bu betikte yalnız
 * komut satırına özgü işler kaldı: --ag ağ referansı (önbelleği doldurur), rapor JSON'unu yazmak, konsol çıktısı.
 * Eşikler TEK KAYNAKTAN: lib/ileri/demoKabulEsikleri.js (dondurulmuş). Burada eşik sayısı YOK.
 * HÜKÜM yalnız 63. günden sonra (Faz 2); öncesi ARA RAPOR — betimleyici, "geçti/kaldı" denmez (§0.4).
 * Getiri, Sharpe ve BTC al-tut kıyası hükme girmez (§0.3). Prova aralıkları ölçümden hariç (§0.5).
 *
 * Okur: D = --dizin: bindirme-bot.json, kalkan-bot.json, koruma.json, risk-durum.json, ozsermaye.jsonl, emirler.jsonl,
 * kalp.json ve §8.2 kayıtları (alarmlar · marj · mutabakat · golge-farklar · sapma · koruma .jsonl; lib/live/bindirmeBot.js
 * yazar, 2026-10-15'ten sonra); data/live/hesap-islemleri.jsonl (H); data/live/alarmlar.jsonl (sunucu bildirimleri);
 * data/supervisor.log; data/ileri/bindirme-golge.jsonl; prova günlüğü (varsayılan D/prova-gunlugu.json).
 *
 * §8.2 kayıtları yokken (kayıt başlangıcı = mutabakat.jsonl'in ilk satırı) onlara dayanan ölçütler ÖLÇÜLEMEDİ yazar;
 * kayıt Gün 0'dan geç başladıysa her ölçütün yanında "kapsam" gösterilir.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const L = require('../lib/ileri/demoKabulRapor');   // 64.4: hesap çekirdeği (panel de aynısını çalıştırır)
const { yazdir, PROVA_SABLON, jsonOku } = L;

const KOK = path.join(__dirname, '..');
const GUN = 864e5;
const gunMs = (g) => Date.parse(`${g}T00:00:00Z`);

// ── Prod günlük mum referansı (kayma a) — AĞ YALNIZ KOMUT SATIRINDA (--ag); panel yalnız önbelleği okur ──
async function referanslar(istek, { ag, onbellekDosya }) {
  const onbellek = jsonOku(onbellekDosya) || {};
  let degisti = false, hata = null;
  if (ag && typeof fetch === 'function') {
    for (const k of istek) {
      if (onbellek[k] != null) continue;
      const [sembol, gun] = k.split('|');
      const s = sembol.split(':')[0].replace('/', '');
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=1d&startTime=${gunMs(gun)}&endTime=${gunMs(gun) + GUN - 1}&limit=1`;
      try {
        const ctl = new AbortController(); const zt = setTimeout(() => ctl.abort(), 10000);
        const r = await fetch(url, { signal: ctl.signal }); clearTimeout(zt);
        const j = await r.json();
        if (Array.isArray(j) && j[0] && +j[0][0] === gunMs(gun) && +j[0][1] > 0) { onbellek[k] = +j[0][1]; degisti = true; }
      } catch (e) { hata = e.message; }
    }
    if (degisti) { try { fs.mkdirSync(path.dirname(onbellekDosya), { recursive: true }); fs.writeFileSync(onbellekDosya, JSON.stringify(onbellek, null, 1), 'utf8'); } catch { /* önbellek yazılamadı */ } }
  }
  return { ref: onbellek, hata };
}

/** Komut satırı raporu: çekirdek üreteci, referansı (--ag ile) ağdan tamamlayan sürücüyle yürütür. */
async function rapor(o = {}) {
  const g = L.raporAdimlari(o);
  let s = g.next();
  while (!s.done) s = g.next(await referanslar(s.value.istek, { ag: !!o.ag, onbellekDosya: s.value.refDosya }));
  return s.value;
}

function argsOku(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const ad = k.slice(2);
    if (['ag', 'json', 'yazma', 'prova-sablon'].includes(ad)) a[ad] = true;
    else a[ad] = argv[++i];
  }
  return a;
}

async function main() {
  const a = argsOku(process.argv.slice(2));
  if (a['prova-sablon']) { console.log(JSON.stringify(PROVA_SABLON, null, 2)); return; }
  const r = await rapor({ dizin: a.dizin && path.resolve(a.dizin), gun0: a.gun0, bit: a.bit, prova: a.prova && path.resolve(a.prova), strateji: a.strateji, hesap: a.hesap, ag: !!a.ag });
  if (!a.yazma && r.veriVar) {
    const cikti = yollar.veri('arastirma', `demo-kabul-rapor-${r.bugun}.json`);
    try { fs.mkdirSync(path.dirname(cikti), { recursive: true }); fs.writeFileSync(cikti, JSON.stringify(r, null, 2), 'utf8'); r.cikti = path.relative(KOK, cikti); } catch (e) { r.ciktiHata = e.message; }
  }
  console.log(a.json ? JSON.stringify(r, null, 2) : yazdir(r) + (r.cikti ? `\n→ ${r.cikti}` : ''));
}

if (require.main === module) main().catch(e => { console.error(`demo kabul raporu: ${e.stack || e.message}`); process.exit(1); });

module.exports = { rapor, referanslar, S: L.S, genelHukum: L.genelHukum, yazdir, provaYukle: L.provaYukle, supervisorOku: L.supervisorOku, defterOku: L.defterOku, PROVA_SABLON };
