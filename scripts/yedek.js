'use strict';
/**
 * OTOMATİK YEDEK komutu (61.8, lib/yedek.js) — evdeki bilgisayarda görev PusulaYedek her gün 05:30 çalıştırır.
 *
 *   npm run yedek -- --hedef D:\PusulaYedek     → hedefi kaydet (data/yedek-ayar.json) + hemen yedekle
 *   npm run yedek                               → kayıtlı hedefe yedekle (görev bunu çalıştırır)
 *   npm run yedek -- --durum                    → kopyalar ve son yedek
 *   npm run yedek -- --geri-yukle 2026-10-13 --dizin C:\Pusula-inceleme   → o günün kopyasını AYRI dizine aç (data/'ya dokunmaz)
 *   npm run yedek -- --ileri                    → günlük yedek + ileriye kayıt artımlı yedeğini (pazartesi değilse de) şimdi al
 *   npm run yedek -- --ileri-dogrula            → ileriye kayıt artımlı kopyasının her dosyasını sha256 ile doğrula
 *   npm run yedek -- --geri-yukle ileriye-kayit --dizin C:\Pusula-inceleme → artımlı kopyayı doğrulayıp AYRI dizine aç
 *
 * 73.4: ileriye kayıt verisi (data/ileriye-kayit) günlük kopyaya girmez; aynı görev haftada bir (pazartesi; kaçtıysa son artımlı
 * 7 günden eskiyse) <hedef>/ileriye-kayit-artimli/ klasörüne YALNIZ yeni/değişen dosyaları kopyalar (lib/yedek.js artimliYedekle).
 * Sonuç data/yedek-ayar.json `ileriyeKayit` alanına yazılır (Sağlık › Yedek denetimi ve Ayarlar › Yedek ve taşıma okur).
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
    console.log(ileriSatiri(ayar, hedef));
    return;
  }
  if (process.argv.includes('--ileri-dogrula')) {
    const r = Y.artimliDogrula(Y.artimliKlasor(hedef));
    console.log(`İleriye kayıt artımlı kopyası doğrulandı: ${r.dosya} dosya, ${(r.bayt / 1e6).toFixed(1)} MB (${Y.artimliKlasor(hedef)})`);
    return;
  }
  const gy = arg('geri-yukle');
  if (gy) {
    const dizin = arg('dizin');
    if (!dizin) throw new Error('--dizin <boş klasör> gerekli (canlı data/ klasörüne geri yüklenmez)');
    if (path.resolve(dizin).toLowerCase() === KOK.toLowerCase()) throw new Error('geri yükleme proje klasörünün kendisine yapılmaz');
    if (gy === 'ileriye-kayit' || gy === Y.ARTIMLI_KLASOR) {
      const n = Y.artimliGeriYukle(Y.artimliKlasor(hedef), path.resolve(dizin));
      console.log(`${n} ileriye kayıt dosyası ${path.resolve(dizin)} içine açıldı (doğrulandı). Gerekirse Pusula'yı durdurup veri klasöründeki ileriye-kayit altına elle kopyalayın.`);
      return;
    }
    const n = Y.geriYukle(path.join(hedef, gy), path.resolve(dizin));
    console.log(`${n} dosya ${path.resolve(dizin)} içine açıldı (doğrulandı). Pusula'yı durdurup gereken dosyaları elle kopyalayın.`);
    return;
  }
  try {
    const r = Y.yedekle({ projeKok: KOK, hedef });
    const son = { zaman: new Date().toISOString(), klasor: r.klasor, dosya: r.dosya, bayt: r.bayt, sirlar: r.sirlar, hata: null };
    fs.writeFileSync(AYAR, JSON.stringify({ ...ayarOku(), hedef, son }, null, 2), 'utf8');
    console.log(`[${son.zaman}] yedek tamam: ${r.dosya} dosya, ${(r.bayt / 1e6).toFixed(1)} MB → ${r.klasor}${r.sirlar ? '' : ' (bulut hedefi: sırlar kopyalanmadı)'}${r.silinen.length ? ` · eski kopya silindi: ${r.silinen.join(', ')}` : ''}`);
    // 69.4 şifreli uzak yedek (restic + rclone; kuruluysa) — başarısızlık yerel yedeği bozmaz, Telegram'a gider.
    if ((ayarOku().uzak || {}).depo) {
      const u = await require('./uzak-yedek').gonder();
      console.log(u.ok ? `[${u.zaman}] uzak yedek tamam: ${u.snapshot || '?'}${u.bakim ? ` · bakım ${u.bakim.ok ? 'tamam' : `HATA ${u.bakim.hata}`}` : ''}` : `[${u.zaman}] UZAK YEDEK BAŞARISIZ: ${u.hata}`);
      if (!u.ok || (u.bakim && !u.bakim.ok)) { try { await require('../lib/telegramDosya').telegramDosyadan(KOK)('error', 'Pusula uzak yedeği başarısız', [u.hata || `bakım: ${u.bakim.hata}`, 'Yerel yedek alındı; buluttaki kopya güncellenmedi. Durum: npm run uzak-yedek -- --durum']); } catch { /* */ } }
    }
  } catch (e) {
    try { fs.writeFileSync(AYAR, JSON.stringify({ ...ayarOku(), hedef, son: { zaman: new Date().toISOString(), hata: e.message } }, null, 2), 'utf8'); } catch { /* */ }
    console.error(`[${new Date().toISOString()}] YEDEK BAŞARISIZ: ${e.message}`);
    try { await require('../lib/telegramDosya').telegramDosyadan(KOK)('error', 'Pusula yedeği alınamadı', [e.message, `Hedef: ${hedef}`]); } catch { /* */ }
    process.exitCode = 1;
  }
  // 73.4: ileriye kayıt — haftalık artımlı (günlük yedekten bağımsız; başarısızlığı günlük kopyayı bozmaz).
  const zorla = process.argv.includes('--ileri');
  let gerekli = false;
  try { gerekli = zorla || Y.artimliGerekli({ projeKok: KOK, hedef }); } catch { gerekli = false; }
  if (!gerekli) return;
  try {
    const r = Y.artimliYedekle({ projeKok: KOK, hedef });
    const ik = { zaman: new Date().toISOString(), klasor: r.klasor, eklenen: r.eklenen, guncellenen: r.guncellenen, ayni: r.ayni, kaldirilan: r.kaldirilan,
      bayt: r.bayt, dosya: r.dosya, toplamBayt: r.toplamBayt, hata: null };
    fs.writeFileSync(AYAR, JSON.stringify({ ...ayarOku(), ileriyeKayit: ik }, null, 2), 'utf8');
    console.log(`[${ik.zaman}] ileriye kayıt artımlı yedeği tamam: ${r.eklenen} yeni, ${r.guncellenen} değişen dosya (${(r.bayt / 1e6).toFixed(1)} MB kopyalandı), ${r.ayni} aynı · toplam ${r.dosya} dosya, ${(r.toplamBayt / 1e6).toFixed(1)} MB → ${r.klasor}`);
  } catch (e) {
    try { fs.writeFileSync(AYAR, JSON.stringify({ ...ayarOku(), ileriyeKayit: { ...(ayarOku().ileriyeKayit || {}), zaman: new Date().toISOString(), hata: e.message } }, null, 2), 'utf8'); } catch { /* */ }
    console.error(`[${new Date().toISOString()}] İLERİYE KAYIT YEDEĞİ BAŞARISIZ: ${e.message}`);
    try { await require('../lib/telegramDosya').telegramDosyadan(KOK)('error', 'İleriye kayıt haftalık yedeği alınamadı', [e.message, `Hedef: ${hedef}`, 'Günlük yedek bundan etkilenmez. Durum: npm run yedek -- --durum']); } catch { /* */ }
    process.exitCode = 1;
  }
})();

/** --durum satırı: ileriye kayıt artımlı yedeği (yedek-ayar.json + hedefteki manifest). */
function ileriSatiri(ayar, hedef) {
  const ik = ayar.ileriyeKayit;
  const m = Y.artimliManifest(hedef);
  if (!ik && !m) return 'İleriye kayıt (haftalık artımlı): henüz alınmadı — ilk günlük yedekte / pazartesi alınır (npm run yedek -- --ileri ile hemen).';
  const son = m && m.son ? m.son : ik;
  const parca = [`İleriye kayıt (haftalık artımlı): ${Y.artimliKlasor(hedef)}`];
  if (son && son.zaman) parca.push(`son ${son.zaman} · ${son.dosya != null ? son.dosya : '?'} dosya · ${((son.toplamBayt || 0) / 1e6).toFixed(1)} MB (son çalışmada ${son.eklenen || 0} yeni, ${son.guncellenen || 0} değişen)`);
  if (ik && ik.hata) parca.push(`HATA: ${ik.hata}`);
  return parca.join(' · ');
}
