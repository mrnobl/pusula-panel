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
 */
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');
const crypto = require('crypto');

const KRITIK_DIZIN = ['live', 'ileri', 'tarama', 'tasarimci', 'portfoyum', 'portfoy-lab', 'dikkat'];
const KRITIK_DOSYA = ['ayarlar.json', 'guncelleme.json', 'dis-ip.json', 'telegram-son-ozet.json', 'telegram-kuyruk.jsonl', 'yedek-ayar.json'];
const SIR_DOSYA = ['secrets.json', 'telefon-jeton.json', 'acil-pin.json', 'ev-baglanti.json'];   // ev-baglanti: sunucudaki panel jetonu
const SAKLA_GUN = 14;
const SAKLA_HAFTA = 8;
const BULUT = /onedrive|google ?drive|dropbox|icloud/i;
const ATLA = /\.(tmp|db|db-wal|db-shm)$|\.bozuk-\d+\.bak$/;

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

module.exports = { yedekle, dogrula, dondur, geriYukle, kapsam, kaynakYolu, KRITIK_DIZIN, SIR_DOSYA, SAKLA_GUN, SAKLA_HAFTA };
