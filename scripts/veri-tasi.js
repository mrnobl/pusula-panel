#!/usr/bin/env node
/**
 * VERİ TAŞIMA — eski `data/` klasöründen program dışındaki veri yerine (68.0, PLAN-TASIMA F2)
 * ═══════════════════════════════════════════════════════════════════════════
 *   npm run veri-tasi -- --deneme                      → yalnız PLAN: ne nereye gidecek, kaç dosya, kaç MB (hiçbir şey değişmez)
 *   npm run veri-tasi                                  → C:\Pusula-Veri'ye taşı
 *   npm run veri-tasi -- --hedef D:\PusulaVeri         → başka yere
 *
 * KENDİLİĞİNDEN ÇALIŞMAZ: var olan kurulum (sunucu, bu bilgisayar) bu komut verilmedikçe eskisi gibi `data/`'yı kullanır
 * (lib/yollar.js). Sıra:
 *   1. RED koşulları: Pusula çalışıyor (data/pusula.pid'deki süreç yaşıyor ya da panel portu cevap veriyor) · PUSULA_VERI
 *      ortam değişkeni tanımlı · zaten taşınmış (veri-yeri.json var) · hedef boş değil · hedef diskte yer yok.
 *   2. KOPYALA: her parça türünün alt klasörüne (kisisel/ gizli/ arastirma/ onbellek/ makine/ — lib/veriTurleri.js), önce
 *      geçici `<hedef>.yaziliyor-<pid>` klasörüne.
 *   3. DOĞRULA: dosya sayısı, her dosyanın boyutu ve SHA-256 özeti kaynakla birebir (tam karşılaştırma).
 *   4. Ayarlar: kökteki config.json → <yeni>/kisisel/ayarlar.json (yalnız varsayılandan farklar; ayarlar.json yoksa).
 *   5. Geçici klasör → hedef (yeniden adlandırma), `PUSULA-VERI.json` işareti, sonra program kökünde `veri-yeri.json`.
 * Eski `data/` OLDUĞU GİBİ KALIR (silinmez, adı değişmez). GERİ DÖNÜŞ: Pusula'yı durdurun, `veri-yeri.json`'u silin —
 * program yeniden eski `data/`'yı kullanır. Herhangi bir adımda hata / kesinti → veri-yeri.json yazılmaz, hiçbir şey değişmez
 * (yarım geçici klasör bir sonraki çalıştırmada silinir).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const yollar = require('../lib/yollar');
const turler = require('../lib/veriTurleri');

const MB = 1024 * 1024;

function argDeger(argv, ad) { const i = argv.indexOf(ad); return i >= 0 ? argv[i + 1] : undefined; }

/** Klasör altındaki dosyalar (göreli yol, boyut). Sembolik bağlar izlenmez. */
function dosyalar(kok) {
  const out = [];
  const gez = (d, g) => {
    let st;
    try { st = fs.lstatSync(d); } catch (e) { return; }
    if (st.isSymbolicLink()) return;
    if (st.isFile()) { out.push({ goreli: g, boyut: st.size }); return; }
    if (st.isDirectory()) for (const a of fs.readdirSync(d)) gez(path.join(d, a), g ? path.join(g, a) : a);
  };
  gez(kok, '');
  return out;
}

function sha256(f) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(f, 'r');
  try {
    const tampon = Buffer.allocUnsafe(4 * MB);
    let n;
    while ((n = fs.readSync(fd, tampon, 0, tampon.length, null)) > 0) h.update(tampon.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

function yasiyor(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

function saglikVar(port, ms = 1500) {
  return new Promise((coz) => {
    if (!port) return coz(false);
    const q = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: ms }, (r) => { r.resume(); coz(true); });
    q.on('error', () => coz(false)); q.on('timeout', () => { q.destroy(); coz(false); });
  });
}

/**
 * Plan (dosya sistemine yazmaz). @returns {{ red?: string, kaynak, hedef, parcalar: [{ad, tur, klasor, dosya, bayt}], ozet, toplam }}
 */
function planla({ program = yollar.PROGRAM, hedef, env = process.env } = {}) {
  const c = yollar.cozumle(program, { env });
  const p = { program: path.resolve(program), kaynak: c.kok, hedef: path.resolve(hedef || yollar.VARSAYILAN_KOK), parcalar: [], ozet: {}, toplam: { dosya: 0, bayt: 0 } };
  if (path.resolve(program) === path.resolve(yollar.PROGRAM) && env.PUSULA_VERI) return { ...p, red: 'PUSULA_VERI ortam değişkeni tanımlı — veri yeri ondan geliyor; taşıma bu durumda yapılmaz (değişkeni kaldırın).' };
  if (c.kaynak === yollar.YER_DOSYASI) return { ...p, red: `Zaten taşınmış: veri yeri ${c.kok} (veri-yeri.json). Geri dönmek için Pusula kapalıyken veri-yeri.json'u silin.` };
  if (c.duzen !== 'eski' || !fs.existsSync(c.kok)) return { ...p, red: `Taşınacak eski veri klasörü yok (${c.kok}).` };
  const kaynakTam = path.resolve(c.kok).toLowerCase(), hedefTam = p.hedef.toLowerCase();
  if (hedefTam === kaynakTam || hedefTam.startsWith(kaynakTam + path.sep)) return { ...p, red: 'Hedef, eski veri klasörünün kendisi ya da içinde olamaz.' };
  if (kaynakTam.startsWith(hedefTam + path.sep)) return { ...p, red: 'Hedef, eski veri klasörünü içeren bir klasör olamaz.' };
  if (fs.existsSync(p.hedef) && fs.readdirSync(p.hedef).length) {
    // 68.1: içinde kişisel/gizli veri olmayan yarım bir Pusula veri klasörü (68.0'da işaretsiz bir git çalışma kopyası / test
    // C:\Pusula-Veri'ye düşebiliyordu) — yine REDDEDİLİR (üzerine yazılmaz) ama ne olduğu açıkça söylenir.
    let yarim = false;
    try {
      yarim = fs.existsSync(path.join(p.hedef, yollar.ISARET)) && !require('../lib/tasima').doluluk({ program: p.program, kok: p.hedef, duzen: 'yeni', kaynak: 'hedef' }).dolu;
    } catch (e) { yarim = false; }
    return { ...p, yarim, red: yarim
      ? `Hedef klasör boş değil: ${p.hedef} — içinde kişisel ya da gizli veri YOK (yalnız PUSULA-VERI.json, boş tür klasörleri, önbellek/günlük): bir test ya da git çalışma kopyasının yanlışlıkla oluşturduğu yarım veri klasörü olabilir. İçine bakın; gerekmiyorsa silip yeniden deneyin ya da --hedef ile başka bir yer verin (üzerine yazılmaz).`
      : `Hedef klasör boş değil: ${p.hedef} — boş bir klasör ya da yeni bir ad verin.` };
  }
  for (const x of yollar.parcalar(c)) {
    const t = x.tur || turler.BILINMEYEN_TUR;
    const d = dosyalar(x.yol);
    const bayt = d.reduce((s, f) => s + f.boyut, 0);
    p.parcalar.push({ ad: x.ad, tur: t, bilinmeyen: !x.tur, klasor: turler.klasor(t), dosya: d.length, bayt });
    p.ozet[t] = p.ozet[t] || { parca: 0, dosya: 0, bayt: 0 };
    p.ozet[t].parca++; p.ozet[t].dosya += d.length; p.ozet[t].bayt += bayt;
    p.toplam.dosya += d.length; p.toplam.bayt += bayt;
  }
  // Yer: hedefin (ya da var olan en yakın üst klasörünün) diskinde toplam + %5 pay.
  let yokla = p.hedef;
  while (!fs.existsSync(yokla) && path.dirname(yokla) !== yokla) yokla = path.dirname(yokla);
  try { const s = fs.statfsSync(yokla); p.bosYer = s.bavail * s.bsize; } catch (e) { p.bosYer = null; }
  if (p.bosYer != null && p.bosYer < p.toplam.bayt * 1.05) return { ...p, red: `Hedef diskte yer yok: gereken ${(p.toplam.bayt / MB).toFixed(0)} MB, boş ${(p.bosYer / MB).toFixed(0)} MB.` };
  return p;
}

/** Pusula çalışıyor mu (PID kaydı + panel portu). @returns {Promise<string|null>} red nedeni */
async function calisiyorMu({ program, kaynak, portlar }) {
  const pidDosya = path.join(kaynak, 'pusula.pid');
  let kayit = null;
  try { kayit = JSON.parse(fs.readFileSync(pidDosya, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { /* yok */ }
  if (kayit) {
    const canli = [kayit.denetleyici, kayit.sunucu].filter(p => Number.isInteger(p) && p > 0 && yasiyor(p));
    if (canli.length) return `Pusula çalışıyor (PID ${canli.join(', ')}, ${pidDosya}). Önce "Pusula'yı durdur" ile kapatın.`;
  }
  const denenen = [...new Set([kayit && kayit.port, ...portlar].filter(x => Number.isInteger(x) && x > 0))];
  for (const port of denenen) if (await saglikVar(port)) return `Port ${port}'ta çalışan bir Pusula paneli var. Önce kapatın (taşıma, kullanımdaki dosyaları kopyalamaz).`;
  void program;
  return null;
}

/** Ana iş. ops: { program, hedef, deneme, portlar, env, log } → { durum: 'plan'|'red'|'tamam'|'hata', ... } */
async function tasi(ops = {}) {
  const log = ops.log || ((m) => console.log(m));
  const program = path.resolve(ops.program || yollar.PROGRAM);
  const env = ops.env || process.env;
  const p = planla({ program, hedef: ops.hedef, env });
  const satir = (t) => { const o = p.ozet[t]; return o ? `${turler.AD[t].padEnd(20)} ${String(o.parca).padStart(3)} parça ${String(o.dosya).padStart(7)} dosya ${(o.bayt / MB).toFixed(1).padStart(9)} MB → ${turler.klasor(t)}\\` : null; };
  log(`Kaynak : ${p.kaynak}`);
  log(`Hedef  : ${p.hedef}`);
  if (p.red) { log(`✗ TAŞINMADI: ${p.red}`); return { durum: 'red', neden: p.red, plan: p }; }
  for (const t of turler.TURLER) { const s = satir(t); if (s) log('  ' + s); }
  log(`  Toplam: ${p.parcalar.length} parça, ${p.toplam.dosya} dosya, ${(p.toplam.bayt / MB).toFixed(1)} MB${p.bosYer != null ? ` (hedef diskte boş ${(p.bosYer / MB / 1024).toFixed(1)} GB)` : ''}`);
  const bilinmeyen = p.parcalar.filter(x => x.bilinmeyen);
  if (bilinmeyen.length) log(`  ⚠ Türü tabloda olmayan parça (kisisel\\ altına gider): ${bilinmeyen.map(x => x.ad).join(', ')}`);
  const calisiyor = await calisiyorMu({ program, kaynak: p.kaynak, portlar: ops.portlar || [Number(env.PORT) || 3000] });
  if (ops.deneme) {
    if (calisiyor) log(`  ⚠ Şu an gerçek taşıma REDDEDİLİR: ${calisiyor}`);
    log('Deneme (--deneme): hiçbir şey kopyalanmadı, hiçbir şey değişmedi.');
    return { durum: 'plan', plan: p, calisiyor };
  }
  if (calisiyor) { log(`✗ TAŞINMADI: ${calisiyor}`); return { durum: 'red', neden: calisiyor, plan: p }; }

  const ust = path.dirname(p.hedef);
  fs.mkdirSync(ust, { recursive: true });
  // Önceki yarım denemelerin geçici klasörleri (yalnız bu adla biçimlenmiş olanlar).
  for (const a of fs.readdirSync(ust)) if (a.startsWith(path.basename(p.hedef) + '.yaziliyor-')) fs.rmSync(path.join(ust, a), { recursive: true, force: true });
  const gecici = `${p.hedef}.yaziliyor-${process.pid}`;
  const t0 = Date.now();
  try {
    fs.mkdirSync(gecici);
    for (const t of turler.TURLER) fs.mkdirSync(path.join(gecici, turler.klasor(t)));
    // 2. kopyala
    let kopyalanan = 0;
    for (const x of p.parcalar) {
      fs.cpSync(path.join(p.kaynak, x.ad), path.join(gecici, x.klasor, x.ad), { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false });
      kopyalanan += x.bayt;
      if (x.bayt > 50 * MB) log(`  kopyalandı: ${x.ad} (${(x.bayt / MB).toFixed(0)} MB) — ${Math.round(100 * kopyalanan / Math.max(1, p.toplam.bayt))}%`);
    }
    // 3. doğrula: sayı + boyut + SHA-256 (tam)
    let dosyaSay = 0;
    for (const x of p.parcalar) {
      const kd = dosyalar(path.join(p.kaynak, x.ad)), hd = dosyalar(path.join(gecici, x.klasor, x.ad));
      if (kd.length !== hd.length) throw new Error(`doğrulama: ${x.ad} dosya sayısı ${kd.length} ≠ ${hd.length}`);
      const hm = new Map(hd.map(f => [f.goreli, f.boyut]));
      for (const f of kd) {
        if (hm.get(f.goreli) !== f.boyut) throw new Error(`doğrulama: ${path.join(x.ad, f.goreli)} boyutu tutmuyor`);
        const a = path.join(p.kaynak, x.ad, f.goreli), b = path.join(gecici, x.klasor, x.ad, f.goreli);
        if (sha256(a) !== sha256(b)) throw new Error(`doğrulama: ${path.join(x.ad, f.goreli)} içeriği (SHA-256) tutmuyor`);
        dosyaSay++;
      }
    }
    log(`  doğrulandı: ${dosyaSay} dosya, boyut + SHA-256 birebir (${Math.round((Date.now() - t0) / 1000)} sn)`);
    // 4. ayarlar: eski config.json → kisisel/ayarlar.json (yoksa)
    const A = require('../lib/ayarlar');
    const ayarYeni = path.join(gecici, turler.klasor('KISISEL'), A.KULLANICI_AD);
    const eskiConfig = path.join(program, A.ESKI_AD);
    let ayarNotu = 'ayarlar.json zaten veri içindeydi';
    if (!fs.existsSync(ayarYeni) && fs.existsSync(eskiConfig)) {
      const eski = JSON.parse(fs.readFileSync(eskiConfig, 'utf8').replace(/^\uFEFF/, ''));
      const v = A.varsayilan(program);
      require('../lib/live/kaliciDosya').yaz(ayarYeni, A.fark(eski, v));
      const k = JSON.parse(fs.readFileSync(ayarYeni, 'utf8'));
      if (Object.keys(A.fark(eski, A.birlestir(v, k))).length) throw new Error('ayar göçü doğrulanamadı');
      ayarNotu = `config.json → ${turler.klasor('KISISEL')}\\${A.KULLANICI_AD} (${Object.keys(k).length} üst anahtar varsayılandan farklı)`;
    }
    log(`  ayarlar: ${ayarNotu}`);
    // 5. işaret + yerine koy + veri-yeri.json
    fs.writeFileSync(path.join(gecici, yollar.ISARET), JSON.stringify({ pusulaVeri: 1, duzen: 'yeni', olusturma: new Date().toISOString(), kaynak: p.kaynak, program, not: 'Pusula veri klasörü (npm run veri-tasi). Eski data/ olduğu gibi duruyor; geri dönüş: program klasöründeki veri-yeri.json silinir.' }, null, 2));
    fs.writeFileSync(path.join(gecici, turler.klasor('MAKINE'), 'veri-tasi.log'), `[${new Date().toISOString()}] ${p.kaynak} → ${p.hedef}: ${p.parcalar.length} parça, ${dosyaSay} dosya, ${(p.toplam.bayt / MB).toFixed(1)} MB doğrulandı; ${ayarNotu}\n`);
    if (fs.existsSync(p.hedef)) fs.rmdirSync(p.hedef);   // planda boş olduğu denetlendi
    fs.renameSync(gecici, p.hedef);
  } catch (e) {
    try { fs.rmSync(gecici, { recursive: true, force: true }); } catch (e2) { /* */ }
    log(`✗ HATA, TAŞINMADI (hiçbir şey değişmedi; eski data/ kullanılmaya devam ediyor): ${e.message}`);
    return { durum: 'hata', neden: e.message, plan: p };
  }
  try {
    const yer = path.join(program, yollar.YER_DOSYASI);
    const tmp = `${yer}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ kok: p.hedef, tasima: new Date().toISOString(), eski: p.kaynak, not: 'Pusula veri yeri (npm run veri-tasi). Silinirse program eski data/ klasörünü kullanır.' }, null, 2));
    fs.renameSync(tmp, yer);
    const c = yollar.cozumle(program, { env: {} });
    if (path.resolve(c.kok) !== path.resolve(p.hedef) || c.duzen !== 'yeni') throw new Error(`çözüm doğrulanamadı (${c.kok}, ${c.duzen})`);
  } catch (e) {
    try { fs.rmSync(path.join(program, yollar.YER_DOSYASI), { force: true }); } catch (e2) { /* */ }
    try { fs.rmSync(p.hedef, { recursive: true, force: true }); } catch (e2) { /* */ }
    log(`✗ HATA, TAŞINMADI (veri-yeri.json yazılamadı; eski data/ kullanılmaya devam ediyor): ${e.message}`);
    return { durum: 'hata', neden: e.message, plan: p };
  }
  log(`✓ TAŞINDI: ${p.hedef}`);
  log(`  Eski klasör olduğu gibi duruyor: ${p.kaynak} (Pusula yeni yerle sorunsuz açıldıktan sonra isterseniz silebilirsiniz).`);
  log(`  Geri dönüş: Pusula'yı durdurun, ${path.join(program, yollar.YER_DOSYASI)} dosyasını silin.`);
  return { durum: 'tamam', plan: p };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const portStr = argDeger(argv, '--port');
  tasi({ hedef: argDeger(argv, '--hedef'), deneme: argv.includes('--deneme'), program: argDeger(argv, '--program'), portlar: portStr ? [Number(portStr)] : undefined })
    .then(r => process.exit(r.durum === 'tamam' || r.durum === 'plan' ? 0 : r.durum === 'red' ? 2 : 1))
    .catch(e => { console.error('✗ ' + (e.stack || e.message)); process.exit(1); });
}
module.exports = { tasi, planla, calisiyorMu, dosyalar };
