'use strict';
/**
 * OTOMATİK YEDEK (61.8, DENETIM-CANLI-ALTYAPI Y6) — YENİDEN ÜRETİLEMEYEN veri, her gün tarihli kopya.
 *
 * Kapsam (KRITIK): data/live (emir defteri, işlem geçmişi, durum, vergi kaydı hesap-islemleri.jsonl), data/ileri (2027–28
 * hükmünün tek kaynağı), data/tarama (geriye dönük üretilemez arşiv), data/tasarimci, data/portfoyum, data/portfoy-lab (karar günlüğü), data/dikkat ve
 * kökteki küçük ayar/sır dosyaları + config.json. Piyasa verisi (market.db, mum önbellekleri, araştırma çıktıları) yedeklenmez:
 * yeniden indirilir/üretilir.
 *
 * Yerleşim: <hedef>/<AAAA-AA-GG>/... + <hedef>/<AAAA-AA-GG>/yedek-manifest.json (dosya, boyut, sha256).
 * Saklama: son SAKLA_GUN günlük + son SAKLA_HAFTA pazartesi kopyası; gerisi silinir (yalnız bu düzendeki klasörler).
 * Bulut eşitlemeli hedefte (OneDrive / Google Drive / Dropbox yolu) sırlar (secrets.json, telefon jetonu, acil PIN özeti)
 * KOPYALANMAZ — şifresiz sır buluta gitmez.
 *
 * 73.4 İLERİYE KAYIT HAFTALIK ARTIMLI YEDEK (kullanıcı 2026-10-24 "evet"): data/ileriye-kayit (lib/ileriKayit — geriye dönük
 * indirilemeyen ham kayıt, ~200 MB/ay, SÜRESİZ saklanır) günlük kopyaya GİRMEZ (her gün tam kopya diski doldururdu). Bunun yerine
 * haftada bir (pazartesi günlük kopyasıyla aynı çalışmada; pazartesi kaçtıysa son artımlı 7 günden eskiyse ilk günlük çalışmada)
 * <hedef>/ileriye-kayit-artimli/ TEK klasörüne YALNIZ yeni ya da değişen dosyalar kopyalanır (boyut + değişme zamanı
 * manifesttekiyle aynıysa atlanır). Kayıtlar yalnız eklenir ve günlük dosyalara bölünür (<kayıtçı>/<gün>.jsonl → gün bitince
 * .jsonl.gz): geçmiş günler bir kez kopyalanır, bugünün büyüyen dosyası her hafta yeniden; o günün .gz'si gelince yedekteki yarım
 * .jsonl kaldırılır. Kaynakta silinen dosya (saklaGun verilirse) yedekte KALIR. Manifest <klasör>/artimli-manifest.json (dosya,
 * boyut, sha256); her dosya bir kez okunur, özetlenir, geçici ada yazılır, yeniden okunup özet tutunca yerine konur (yarıda kesilen
 * çalışma eski kopyayı bozmaz). Sır yok → bulut hedefinde de kopyalanır. Günlük klasörlerin saklama kuralı (dondur) bu klasöre
 * dokunmaz (yalnız AAAA-AA-GG adlı klasörleri siler).
 */
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');
const crypto = require('crypto');

const KRITIK_DIZIN = ['live', 'ileri', 'tarama', 'tasarimci', 'portfoyum', 'portfoy-lab', 'dikkat', 'ayar-gecmisi'];   // 74.2: + ayar geçmişi · 74.3: live/<bot>/veri-kalitesi.jsonl 'live' ile girer · 74.4: bot kayıtları live/botlar/<kimlik>.json 'live' ile girer
const KRITIK_DOSYA = ['ayarlar.json', 'guncelleme.json', 'dis-ip.json', 'telegram-son-ozet.json', 'telegram-kuyruk.jsonl', 'yedek-ayar.json'];
const SIR_DOSYA = ['secrets.json', 'telefon-jeton.json', 'acil-pin.json', 'ev-baglanti.json'];   // ev-baglanti: sunucudaki panel jetonu
const SAKLA_GUN = 14;
const SAKLA_HAFTA = 8;
const BULUT = /onedrive|google ?drive|dropbox|icloud/i;
const ATLA = /\.(tmp|db|db-wal|db-shm)$|\.bozuk-\d+\.bak$/;
const ILERI_DIZIN = 'ileriye-kayit';
const ARTIMLI_KLASOR = 'ileriye-kayit-artimli';
const ARTIMLI_MANIFEST = 'artimli-manifest.json';
const ARTIMLI_GUN = 7;
const GUN_MS = 864e5;

function ozet(dosya) { return crypto.createHash('sha256').update(fs.readFileSync(dosya)).digest('hex'); }

function listele(kok, goreli = '') {
  const tam = path.join(kok, goreli);
  if (!fs.existsSync(tam)) return [];
  const st = fs.statSync(tam);
  if (st.isFile()) return ATLA.test(goreli) ? [] : [goreli];
  const out = [];
  for (const ad of fs.readdirSync(tam).sort()) out.push(...listele(kok, path.join(goreli, ad)));
  return out;
}

/**
 * Yedeklenecek dosyalar — yedekteki göreli yol ('data/…' veri parçaları, 'config.json'). Yedek içindeki düzen veri yerinden
 * bağımsız hep 'data/<parça>' (68.0: kaynak lib/yollar.js'ten — eski ya da yeni düzen; kaynakYolu).
 */
function kapsam(projeKok, { sirlar = true } = {}) {
  const veri = (...p) => yollar.programVeri(projeKok, ...p);
  const dosyalar = [];
  for (const d of KRITIK_DIZIN) dosyalar.push(...listele(veri(d)).map(x => path.join('data', d, x)));
  for (const f of [...KRITIK_DOSYA, ...(sirlar ? SIR_DOSYA : [])]) if (fs.existsSync(veri(f))) dosyalar.push(path.join('data', f));
  if (fs.existsSync(path.join(projeKok, 'config.json'))) dosyalar.push('config.json');
  return dosyalar;
}

/** Yedekteki göreli yolun (kapsam) kaynaktaki mutlak yolu. */
function kaynakYolu(projeKok, g) {
  const p = g.split(/[\\/]/);
  return p[0] === 'data' ? yollar.programVeri(projeKok, ...p.slice(1)) : path.join(projeKok, g);
}

/**
 * @param o.projeKok, o.hedef, o.simdi (ms)
 * @returns {{ klasor, dosya, bayt, sirlar, silinen[] }}
 */
function yedekle({ projeKok, hedef, simdi = Date.now() }) {
  if (!hedef) throw new Error('yedek hedefi yok (npm run yedek -- --hedef <klasör>)');
  const hedefTam = path.resolve(hedef);
  if (hedefTam.toLowerCase().startsWith(path.resolve(projeKok).toLowerCase() + path.sep)) throw new Error('yedek hedefi proje klasörünün içinde olamaz');
  const sirlar = !BULUT.test(hedefTam);
  const gun = new Date(simdi).toISOString().slice(0, 10);
  const klasor = path.join(hedefTam, gun);
  const gecici = `${klasor}.yaziliyor`;
  fs.rmSync(gecici, { recursive: true, force: true });
  const manifest = { zaman: new Date(simdi).toISOString(), kaynak: projeKok, sirlar, dosyalar: [] };
  let bayt = 0;
  for (const g of kapsam(projeKok, { sirlar })) {
    const kaynak = kaynakYolu(projeKok, g), hedefDosya = path.join(gecici, g);
    fs.mkdirSync(path.dirname(hedefDosya), { recursive: true });
    fs.copyFileSync(kaynak, hedefDosya);
    const boyut = fs.statSync(hedefDosya).size;
    manifest.dosyalar.push({ yol: g.split(path.sep).join('/'), boyut, sha256: ozet(hedefDosya) });
    bayt += boyut;
  }
  fs.writeFileSync(path.join(gecici, 'yedek-manifest.json'), JSON.stringify(manifest, null, 1), 'utf8');
  dogrula(gecici);   // yazılan kopya okunur ve özetler tutar — tutmazsa hata (eski kopya korunur)
  fs.rmSync(klasor, { recursive: true, force: true });
  fs.renameSync(gecici, klasor);
  const silinen = dondur(hedefTam, simdi);
  return { klasor, dosya: manifest.dosyalar.length, bayt, sirlar, silinen };
}

/** Kopyayı manifestine göre doğrular. @returns {number} dosya sayısı */
function dogrula(klasor) {
  const m = JSON.parse(fs.readFileSync(path.join(klasor, 'yedek-manifest.json'), 'utf8'));
  for (const f of m.dosyalar) {
    const p = path.join(klasor, ...f.yol.split('/'));
    if (!fs.existsSync(p)) throw new Error(`yedekte eksik: ${f.yol}`);
    if (ozet(p) !== f.sha256) throw new Error(`yedekte bozuk: ${f.yol}`);
  }
  return m.dosyalar.length;
}

/** Saklama kuralı: son SAKLA_GUN gün + son SAKLA_HAFTA pazartesi; yalnız AAAA-AA-GG adlı klasörler silinir. */
function dondur(hedef, simdi = Date.now()) {
  const gunler = fs.readdirSync(hedef).filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a)).sort().reverse();
  const tut = new Set(gunler.slice(0, SAKLA_GUN));
  gunler.filter(g => new Date(`${g}T00:00:00Z`).getUTCDay() === 1).slice(0, SAKLA_HAFTA).forEach(g => tut.add(g));
  const silinen = [];
  for (const g of gunler) if (!tut.has(g)) { fs.rmSync(path.join(hedef, g), { recursive: true, force: true }); silinen.push(g); }
  return silinen;
}

/**
 * Geri yükleme (inceleme için): bir yedek klasörünü AYRI bir dizine açar; canlı data/'ya DOKUNMAZ. Kullanıcı Pusula'yı
 * durdurup gereken dosyaları elle kopyalar (EVDE-GECIS-PUSULA.md adım 20).
 */
function geriYukle(klasor, hedefDizin) {
  dogrula(klasor);
  const m = JSON.parse(fs.readFileSync(path.join(klasor, 'yedek-manifest.json'), 'utf8'));
  for (const f of m.dosyalar) {
    const p = path.join(hedefDizin, ...f.yol.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.copyFileSync(path.join(klasor, ...f.yol.split('/')), p);
  }
  return m.dosyalar.length;
}

/* ── 73.4 İleriye kayıt: haftalık artımlı yedek ─────────────────────────────────────────────────────────────────────── */

function jsonOku(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function atomikYaz(f, metin) {
  const tmp = `${f}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, metin); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, f);
}
/** İleriye kayıt kaynağı (lib/ileriKayit ile aynı yer: <veri>/ileriye-kayit). */
function ileriKaynak(projeKok) { return yollar.programVeri(projeKok, ILERI_DIZIN); }
function artimliKlasor(hedef) { return path.join(path.resolve(hedef), ARTIMLI_KLASOR); }
/** Hedefteki artımlı manifest (yoksa / bozuksa null). */
function artimliManifest(hedef) { return jsonOku(path.join(artimliKlasor(hedef), ARTIMLI_MANIFEST)); }

/**
 * Bu çalışmada artımlı yedek alınsın mı? Pazartesi (günlük kopyanın adıyla aynı UTC günü) ya da son artımlı ARTIMLI_GUN günden eski /
 * hiç alınmamış (hedef yeni ya da 73.4'ün ilk çalışması) → true. Kaynak klasör yoksa false (kayıtçı bu bilgisayarda çalışmıyor).
 */
function artimliGerekli({ projeKok, hedef, simdi = Date.now(), kaynak }) {
  const kay = kaynak || ileriKaynak(projeKok);
  if (!fs.existsSync(kay)) return false;
  if (new Date(simdi).getUTCDay() === 1) return true;
  const m = artimliManifest(hedef);
  const z = m && m.son ? Date.parse(m.son.zaman) : NaN;
  return !Number.isFinite(z) || simdi - z >= ARTIMLI_GUN * GUN_MS - 6 * 3600e3;   // 6 saat pay: görev saati kayarsa hafta atlanmasın
}

/**
 * İleriye kayıt verisini hedefteki tek klasöre ARTIMLI kopyalar.
 * @param o { projeKok, hedef, simdi?, kaynak? (test: kaynak klasör) }
 * @returns {{ klasor, eklenen, guncellenen, ayni, kaldirilan, bayt, dosya, toplamBayt }}
 */
function artimliYedekle({ projeKok, hedef, simdi = Date.now(), kaynak }) {
  if (!hedef) throw new Error('yedek hedefi yok (npm run yedek -- --hedef <klasör>)');
  const kay = path.resolve(kaynak || ileriKaynak(projeKok));
  const hedefTam = path.resolve(hedef);
  const icinde = (a, b) => (a + path.sep).toLowerCase().startsWith(path.resolve(b).toLowerCase() + path.sep);
  if (projeKok && icinde(hedefTam, projeKok)) throw new Error('yedek hedefi proje klasörünün içinde olamaz');
  if (icinde(hedefTam, kay)) throw new Error('yedek hedefi ileriye kayıt klasörünün içinde olamaz');
  const kok = artimliKlasor(hedefTam);
  fs.mkdirSync(kok, { recursive: true });
  const mYol = path.join(kok, ARTIMLI_MANIFEST);
  const eskiM = jsonOku(mYol);
  if (fs.existsSync(mYol) && (!eskiM || !eskiM.dosyalar || typeof eskiM.dosyalar !== 'object')) {
    throw new Error(`artımlı manifest okunamadı (${mYol}) — dosyayı kenara alın; sonraki çalışma her şeyi yeniden kopyalar`);
  }
  const m = eskiM || { surum: 1, olusturma: new Date(simdi).toISOString(), dosyalar: {} };
  m.kaynak = kay;
  const kaynakDosyalar = listele(kay).map(g => g.split(path.sep).join('/'));
  const kaynakKume = new Set(kaynakDosyalar);
  const out = { klasor: kok, eklenen: 0, guncellenen: 0, ayni: 0, kaldirilan: 0, bayt: 0, dosya: 0, toplamBayt: 0 };
  const yaz = () => {
    out.dosya = Object.keys(m.dosyalar).length;
    out.toplamBayt = Object.values(m.dosyalar).reduce((a, f) => a + (f.boyut || 0), 0);
    m.son = { zaman: new Date(simdi).toISOString(), eklenen: out.eklenen, guncellenen: out.guncellenen, ayni: out.ayni, kaldirilan: out.kaldirilan, bayt: out.bayt, dosya: out.dosya, toplamBayt: out.toplamBayt };
    atomikYaz(mYol, JSON.stringify(m, null, 1));
  };
  let sayac = 0;
  for (const g of kaynakDosyalar) {
    const src = path.join(kay, ...g.split('/'));
    let st;
    try { st = fs.statSync(src); } catch { continue; }   // arada sıkıştırıldı / silindi: sonraki hafta
    const eski = m.dosyalar[g];
    const dst = path.join(kok, ...g.split('/'));
    // Ucuz denetim: kaynağın boyutu + değişme zamanı manifesttekiyle ve yedekteki kopyanın boyutu manifesttekiyle aynıysa atla
    // (kopyanın tam sha256 doğrulaması: npm run yedek -- --ileri-dogrula).
    let dstBoyut = -1; try { dstBoyut = fs.statSync(dst).size; } catch { /* yok */ }
    if (eski && eski.boyut === st.size && eski.mtimeMs === st.mtimeMs && dstBoyut === eski.boyut) { out.ayni++; continue; }
    let buf;
    try { buf = fs.readFileSync(src); } catch { continue; }
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (eski && eski.sha256 === sha && dstBoyut === buf.length && ozet(dst) === sha) { m.dosyalar[g] = { ...eski, mtimeMs: st.mtimeMs }; out.ayni++; continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const tmp = `${dst}.yaziliyor`;
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, buf); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (ozet(tmp) !== sha) { fs.rmSync(tmp, { force: true }); throw new Error(`artımlı yedekte yazılan dosya okunduğunda tutmadı: ${g}`); }
    fs.renameSync(tmp, dst);
    m.dosyalar[g] = { boyut: buf.length, sha256: sha, mtimeMs: st.mtimeMs, kopya: new Date(simdi).toISOString() };
    if (eski) out.guncellenen++; else out.eklenen++;
    out.bayt += buf.length;
    if (++sayac % 200 === 0) yaz();   // uzun ilk kopyada ara kayıt: kesilirse yapılan iş tekrar edilmez
  }
  // Gün bitip .jsonl.gz olunca yedekteki o günün yarım .jsonl kopyası gereksiz (gz o günün tamamı) — kaynakta artık yoksa kaldırılır.
  for (const g of Object.keys(m.dosyalar)) {
    if (!/\.jsonl$/.test(g) || kaynakKume.has(g) || !m.dosyalar[`${g}.gz`]) continue;
    fs.rmSync(path.join(kok, ...g.split('/')), { force: true });
    delete m.dosyalar[g];
    out.kaldirilan++;
  }
  yaz();
  return out;
}

/** Artımlı klasörü manifestine göre doğrular (her dosyanın varlığı + sha256). @returns {{ dosya, bayt }} */
function artimliDogrula(kok) {
  const m = jsonOku(path.join(kok, ARTIMLI_MANIFEST));
  if (!m || !m.dosyalar || typeof m.dosyalar !== 'object') throw new Error(`artımlı manifest yok ya da bozuk: ${kok}`);
  let bayt = 0;
  for (const [g, f] of Object.entries(m.dosyalar)) {
    const p = path.join(kok, ...g.split('/'));
    if (!fs.existsSync(p)) throw new Error(`artımlı yedekte eksik: ${g}`);
    if (ozet(p) !== f.sha256) throw new Error(`artımlı yedekte bozuk: ${g}`);
    bayt += f.boyut || 0;
  }
  return { dosya: Object.keys(m.dosyalar).length, bayt };
}

/** Artımlı kopyayı doğrulayıp AYRI bir dizine açar (canlı data/'ya dokunmaz). @returns {number} dosya sayısı */
function artimliGeriYukle(kok, hedefDizin) {
  artimliDogrula(kok);
  const m = jsonOku(path.join(kok, ARTIMLI_MANIFEST));
  for (const g of Object.keys(m.dosyalar)) {
    const p = path.join(hedefDizin, ...g.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.copyFileSync(path.join(kok, ...g.split('/')), p);
  }
  return Object.keys(m.dosyalar).length;
}

module.exports = { yedekle, dogrula, dondur, geriYukle, kapsam, kaynakYolu, KRITIK_DIZIN, SIR_DOSYA, SAKLA_GUN, SAKLA_HAFTA,
  ileriKaynak, artimliKlasor, artimliManifest, artimliGerekli, artimliYedekle, artimliDogrula, artimliGeriYukle,
  ILERI_DIZIN, ARTIMLI_KLASOR, ARTIMLI_MANIFEST, ARTIMLI_GUN };
