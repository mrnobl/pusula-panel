'use strict';
/**
 * OTOMATİK YEDEK komutu (61.8, lib/yedek.js) — evdeki bilgisayarda görev PusulaYedek her gün 05:30 çalıştırır.
 *
 *   npm run yedek -- --hedef D:\PusulaYedek     → hedefi kaydet (data/yedek-ayar.json) + hemen yedekle
 *   npm run yedek                               → kayıtlı hedefe yedekle (görev bunu çalıştırır)
 *   npm run yedek -- --durum                    → kopyalar ve son yedek
 *   npm run yedek -- --geri-yukle 2026-10-13 --dizin C:\Pusula-inceleme   → o günün kopyasını AYRI dizine aç (data/'ya dokunmaz)
 *
 * Hedef önerisi: ikinci disk / USB disk (disk arızasına karşı). Aynı disk yalnız silinme/bozulmaya karşı korur.
 * Hedef OneDrive klasörüyse sırlar kopyalanmaz (şifresiz sır buluta gitmez). Başarısızlık Telegram'a gider (yalnız ev).
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const Y = require('../lib/yedek');

const KOK = path.join(__dirname, '..');
const AYAR = yollar.veri('yedek-ayar.json');
const arg = (ad) => { const i = process.argv.indexOf(`--${ad}`); return i > 0 ? process.argv[i + 1] : undefined; };
const ayarOku = () => { try { return JSON.parse(fs.readFileSync(AYAR, 'utf8')); } catch { return {}; } };

(async () => {
  const ayar = ayarOku();
  const yeniHedef = arg('hedef');
  if (yeniHedef) {
    fs.mkdirSync(path.dirname(AYAR), { recursive: true });
    fs.writeFileSync(AYAR, JSON.stringify({ ...ayar, hedef: path.resolve(yeniHedef) }, null, 2), 'utf8');
    ayar.hedef = path.resolve(yeniHedef);
    console.log(`Yedek hedefi kaydedildi: ${ayar.hedef}`);
  }
  const hedef = ayar.hedef || path.join(require('os').homedir(), 'PusulaYedek');
  if (process.argv.includes('--durum')) {
    const kopyalar = fs.existsSync(hedef) ? fs.readdirSync(hedef).filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a)).sort() : [];
    console.log(`Hedef: ${hedef}${ayar.hedef ? '' : ' (varsayılan — kaydedilmemiş)'}`);
    console.log(`Kopyalar (${kopyalar.length}): ${kopyalar.join(', ') || 'yok'}`);
    if (ayar.son) console.log(`Son yedek: ${ayar.son.zaman} · ${ayar.son.dosya} dosya · ${(ayar.son.bayt / 1e6).toFixed(1)} MB${ayar.son.hata ? ` · HATA: ${ayar.son.hata}` : ''}`);
    return;
  }
  const gy = arg('geri-yukle');
  if (gy) {
    const dizin = arg('dizin');
    if (!dizin) throw new Error('--dizin <boş klasör> gerekli (canlı data/ klasörüne geri yüklenmez)');
    if (path.resolve(dizin).toLowerCase() === KOK.toLowerCase()) throw new Error('geri yükleme proje klasörünün kendisine yapılmaz');
    const n = Y.geriYukle(path.join(hedef, gy), path.resolve(dizin));
    console.log(`${n} dosya ${path.resolve(dizin)} içine açıldı (doğrulandı). Pusula'yı durdurup gereken dosyaları elle kopyalayın.`);
    return;
  }
  try {
    const r = Y.yedekle({ projeKok: KOK, hedef });
    const son = { zaman: new Date().toISOString(), klasor: r.klasor, dosya: r.dosya, bayt: r.bayt, sirlar: r.sirlar, hata: null };
    fs.writeFileSync(AYAR, JSON.stringify({ ...ayarOku(), hedef, son }, null, 2), 'utf8');
    console.log(`[${son.zaman}] yedek tamam: ${r.dosya} dosya, ${(r.bayt / 1e6).toFixed(1)} MB → ${r.klasor}${r.sirlar ? '' : ' (bulut hedefi: sırlar kopyalanmadı)'}${r.silinen.length ? ` · eski kopya silindi: ${r.silinen.join(', ')}` : ''}`);
  } catch (e) {
    try { fs.writeFileSync(AYAR, JSON.stringify({ ...ayarOku(), hedef, son: { zaman: new Date().toISOString(), hata: e.message } }, null, 2), 'utf8'); } catch { /* */ }
    console.error(`[${new Date().toISOString()}] YEDEK BAŞARISIZ: ${e.message}`);
    try { await require('../lib/telegramDosya').telegramDosyadan(KOK)('error', 'Pusula yedeği alınamadı', [e.message, `Hedef: ${hedef}`]); } catch { /* */ }
    process.exitCode = 1;
  }
})();
