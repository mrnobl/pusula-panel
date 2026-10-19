#!/usr/bin/env node
/**
 * VERİ GÜNCELLEME (elle tetik) — lib/veri/orkestrator.js
 *   npm run veri:guncelle                          # bayat olan tüm kaynaklar (bağımlılık sırasıyla)
 *   npm run veri:guncelle -- --kaynak tefas        # tek kaynak (+ bayat yukarı bağımlılıkları + türetilmişler); virgülle çoklu
 *   npm run veri:guncelle -- --zorla               # tazelik kuralına bakmadan hepsi (--kaynak ile: yalnız o kaynak zorlanır)
 *   npm run veri:guncelle -- --durum               # yalnız tablo (ağ yok)
 *   --json                                         # çıktı JSON
 * Sunucu aynı anda güncelleme yapıyorsa kilit dosyası (data/veri-durum.kilit) yüzünden reddedilir.
 */
'use strict';
const ORK = require('../lib/veri/orkestrator');

const arg = process.argv.slice(2);
const bayrak = b => arg.includes(b);
const deger = b => { const i = arg.indexOf(b); return i >= 0 ? arg[i + 1] : null; };
const kaynaklar = deger('--kaynak') ? deger('--kaynak').split(',').map(s => s.trim()).filter(Boolean) : undefined;
const zorla = bayrak('--zorla');
const json = bayrak('--json');

const o = ORK.varsayilan({ log: (lv, m) => { if (!json) console.log(`  ${new Date().toISOString().slice(11, 19)} ${lv.padEnd(7)} ${m}`); } });

function tablo() {
  const d = o.durum();
  if (json) return d;
  const ROZET = { guncel: 'güncel', bayat: 'BAYAT', hata: 'HATA', calisiyor: 'sürüyor' };
  console.log('\n  ' + ['kaynak'.padEnd(23), 'son veri'.padEnd(11), 'durum'.padEnd(8), 'son güncelleme'.padEnd(17), 'süre'.padStart(7), '  ayrıntı'].join(' '));
  for (const r of d.kaynaklar) {
    const zs = r.sonBasari || r.sonBasariTahmin;   // tahmin: kayıt yokken dosya zamanı (~)
    const son = zs ? (r.sonBasari ? '' : '~') + new Date(zs).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    const sure = r.sureMs == null ? '—' : `${(r.sureMs / 1000).toFixed(0)} sn`;
    console.log('  ' + [r.ad.padEnd(23), String(r.veriGunu || '—').padEnd(11), (ROZET[r.durum] || r.durum).padEnd(8), son.padEnd(17), sure.padStart(7),
      '  ' + (r.hata ? 'hata: ' + r.hata.slice(0, 90) : r.bayatNeden || r.not || '')].join(' '));
    if (r.uyari) console.log('  ' + ' '.repeat(23) + ' UYARI: ' + r.uyari);
  }
  console.log(`
  Binance kipi: ${d.binanceKip}${d.binanceKip === 'canli' ? ' (kısıtlı: canlı bot bu makinede olabilir; ARASTIRMA_MODU=1 ile gevşer)' : ''}${d.binanceBekleme ? ` · HIZ SINIRI BEKLEMESİ (${d.binanceBekleme.kod}) ${d.binanceBekleme.bitis}'e kadar` : ''}`);
  return d;
}

(async () => {
  if (bayrak('--durum')) { const d = tablo(); if (json) console.log(JSON.stringify(d, null, 1)); return; }
  if (kaynaklar) for (const a of kaynaklar) if (!o.k[a]) { console.error(`Bilinmeyen kaynak: ${a}\nKaynaklar: ${o.adlar.join(', ')}`); process.exit(2); }
  const t0 = Date.now();
  if (!json) console.log(`Veri orkestratörü: ${kaynaklar ? kaynaklar.join(', ') : 'tüm kaynaklar'}${zorla ? ' (ZORLA)' : ' (yalnız bayat olanlar)'}`);
  const k = await o.calistir({ kaynaklar, zorla, neden: 'elle (npm run veri:guncelle)' });
  if (json) { console.log(JSON.stringify(k, null, 1)); }
  else {
    console.log(`\nBİTTİ: ${k.calisan} kaynak çalıştı, ${k.hatalar} hata, ${((Date.now() - t0) / 1000).toFixed(0)} sn`);
    for (const [ad, a] of Object.entries(k.adimlar)) {
      console.log(`  ${ad.padEnd(23)} ${a.durum.padEnd(7)} ${a.sureMs != null ? `${(a.sureMs / 1000).toFixed(1)} sn` : ''}${a.veriGunu ? ` · son veri ${a.veriGunu}` : ''}${a.degisti === false ? ' · yeni veri yok' : ''}${a.hata ? ' · ' + a.hata : ''}`);
    }
    tablo();
  }
  process.exit(k.hatalar ? 1 : 0);   // ccxt / fetch bağlantıları süreci açık tutmasın
})().catch(e => { console.error('HATA:', e.message); process.exit(1); });
