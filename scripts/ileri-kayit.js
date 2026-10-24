#!/usr/bin/env node
/**
 * İLERİYE KAYIT — elle deneme / durum (73.3, lib/ileriKayit). Sunucu kayıtçıları kendisi çalıştırır; bu betik YALNIZ:
 *   node scripts/ileri-kayit.js --durum                         → veri klasöründeki kayıt durumu (ağ yok)
 *   node scripts/ileri-kayit.js --deneme <BOŞ dizin> [--yalniz pozisyon,opsiyon,hyperliquid,derinlik,tasfiye] [--tasfiye-sn 60]
 *        → kayıtçıları GERÇEK uçlarla bir kez, VERİLEN geçici dizine koşturur (asıl veri klasörüne yazmaz): uçlar, biçim ve
 *          disk ölçümü için. Dizin veri kökünün içinde olamaz.
 * Emir yok, anahtar yok. Binance istekleri arasında 1 sn (canlı kipteki BinanceKota ile aynı tempo).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const yollar = require('../lib/yollar');
const { IleriKayit, KAYITCILAR } = require('../lib/ileriKayit');

const arg = (ad) => { const i = process.argv.indexOf(ad); return i > 0 ? process.argv[i + 1] : null; };

async function deneme() {
  const dizin = path.resolve(arg('--deneme') || '');
  if (!arg('--deneme')) throw new Error('--deneme <dizin> gerekli');
  const kok = path.resolve(yollar.kok());
  if (dizin.toLowerCase().startsWith(kok.toLowerCase())) throw new Error(`deneme dizini veri kökünün (${kok}) içinde olamaz`);
  if (fs.existsSync(dizin) && fs.readdirSync(dizin).length) throw new Error(`deneme dizini boş olmalı: ${dizin}`);
  fs.mkdirSync(dizin, { recursive: true });
  const yalniz = (arg('--yalniz') || KAYITCILAR.map(k => k.ad).join(',')).split(',').map(s => s.trim()).filter(Boolean);
  const log = (sv, m) => console.log(`[${sv}] ${m}`);
  const { BinanceKota } = require('../lib/veri/orkestrator');
  const uyu = (ms) => new Promise(r => setTimeout(r, ms));   // unref'siz: betik beklerken kapanmasın
  const ik = new IleriKayit({ kok: dizin, log, arastirma: false, uyu, kota: () => new BinanceKota({ kip: 'canli', uyu }) });
  for (const ad of yalniz.filter(a => a !== 'tasfiye')) {
    const t0 = Date.now();
    // eslint-disable-next-line no-await-in-loop
    const r = await ik.kos(ad, { zorla: true });
    console.log(`${ad}: ${r.satir || 0} satır, ${Math.round((Date.now() - t0) / 1000)} sn${(r.hatalar || []).length ? ` · uyarı: ${r.hatalar.slice(0, 3).join(' | ')}` : ''}`);
  }
  if (yalniz.includes('tasfiye')) {
    const sn = Number(arg('--tasfiye-sn') || 60);
    await ik._bybitSemboller();
    ik.tasfiye.baslat();
    await new Promise(r => setTimeout(r, sn * 1000));
    ik.tasfiye.durdur();
    const n = ik.tasfiye.bosalt();
    console.log(`tasfiye: ${sn} sn'de ${n} satır`, JSON.stringify(ik.tasfiye.ozet().akislar.map(a => [a.ad, a.mesaj, a.satir, a.sonHata])));
  }
  ik.depo.durumYaz();
  // Ölçüm: ham ve gzip boyutu
  for (const ad of yalniz) {
    const d = path.join(dizin, ad);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      const b = fs.readFileSync(path.join(d, f));
      const gz = zlib.gzipSync(b, { level: 9 });
      console.log(`  ${ad}/${f}: ${(b.length / 1024).toFixed(0)} KB ham → ${(gz.length / 1024).toFixed(0)} KB gzip (oran ${(gz.length / b.length).toFixed(3)})`);
    }
  }
}

function durum() {
  const ik = new IleriKayit({ arastirma: false });
  const d = ik.durum();
  for (const k of d.kayitcilar) console.log(`${k.kisaAd.padEnd(40)} son yazım ${k.sonYazim || '—'} · bugün ${k.bugunSatir} satır · disk ${(k.disk.bayt / 1048576).toFixed(1)} MB · ~${k.disk.aylikTahminMB} MB/ay${k.sonHata ? ` · HATA ${k.sonHata}` : ''}`);
  console.log(`Toplam ${d.disk.toplamMB} MB · tahmin ~${d.disk.aylikTahminMB} MB/ay · saklama ${d.disk.saklama}`);
}

(async () => {
  try {
    if (process.argv.includes('--durum')) durum();
    else if (arg('--deneme')) await deneme();
    else { console.log('Kullanım: --durum | --deneme <boş dizin> [--yalniz a,b] [--tasfiye-sn 60]'); process.exitCode = 2; }
  } catch (e) { console.error(`HATA: ${e.message}`); process.exitCode = 1; }
})();
