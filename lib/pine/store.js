/**
 * İÇE AKTARILAN PINE BETİKLERİNİN DEPOSU
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TEK DOĞRULUK KAYNAĞI: .pine DOSYALARININ KENDİSİ
 * ─────────────────────────────────────────────────────────────────────────
 * Betikler `data/pine/<anahtar>.pine` olarak durur. AYRI BİR DİZİN DOSYASI
 * (index.json) YOK — çünkü iki kayıt yeri iki gerçek demektir ve bu depoda
 * o hatanın bedeli ödendi (`catalog.js`: liste altı yerde tutuluyordu, biri
 * ötekinden farklıydı ve yazılmış bir strateji çalıştırılamıyordu).
 *
 * Etiket ve parametreler her açılışta KAYNAKTAN yeniden çıkarılır. Böylece
 * kullanıcı dosyayı elle düzenlese bile panel doğru olanı gösterir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AÇILIŞTA DERLEME HATASI SUNUCUYU DÜŞÜRMEZ
 * ─────────────────────────────────────────────────────────────────────────
 * Desteklenen altküme zamanla değişir; dün derlenen bir betik bugün
 * reddedilebilir. Böyle bir betik ATLANIR ve hatası raporlanır — panelde
 * "bu betik artık derlenmiyor, sebebi şu" diye görünür. Sunucunun açılmaması
 * ya da betiğin sessizce kaybolması kabul edilebilir değil.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const { derle } = require('./strategy');
const { inspect } = require('./inspect');
const { anahtarlastir } = require('./inspect');
const catalog = require('../strategies/catalog');

// PINE_DIZIN: testler gerçek depoya yazmasın diye (B-27 — yarıda kalan uç testi data/pine'de
// "Uc Testi Botu" kopyaları bırakıyordu ve strateji listesinde iki kez görünüyordu).
const DIZIN = process.env.PINE_DIZIN ? path.resolve(process.env.PINE_DIZIN) : yollar.veri('pine');
const ONEK = 'pine_';

function dizinHazirla() {
  if (!fs.existsSync(DIZIN)) fs.mkdirSync(DIZIN, { recursive: true });
  return DIZIN;
}

/**
 * Anahtar dosya adına girer; `pine_x/../..` gibi bir değer DIZIN dışına
 * çıkıp başka dosyayı okutup sildirebiliyordu (panel API'si anahtarı URL'den
 * alıyor). Yalnız harf, rakam, alt çizgi ve tire kabul edilir.
 */
function dosyaYolu(anahtar) {
  if (typeof anahtar !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(anahtar)) {
    throw new Error(`Geçersiz betik anahtarı: ${String(anahtar).slice(0, 40)}`);
  }
  return path.join(DIZIN, `${anahtar}.pine`);
}

/** Betik adından katalog anahtarı. `pine_` öneki içe aktarılanı belli eder. */
function anahtarUret(baslik, mevcutlar) {
  const taban = ONEK + (anahtarlastir(baslik || 'betik').toLowerCase() || 'betik');
  if (!mevcutlar.has(taban)) return taban;
  let n = 2;
  while (mevcutlar.has(`${taban}_${n}`)) n++;
  return `${taban}_${n}`;
}

/** Depodaki tüm betikler (derlenmeye çalışılmadan, yalnızca dosya listesi). */
function dosyalar() {
  dizinHazirla();
  return fs.readdirSync(DIZIN)
    .filter(f => f.endsWith('.pine'))
    .map(f => f.slice(0, -5));
}

function kaynakOku(anahtar) {
  const y = dosyaYolu(anahtar);
  if (!fs.existsSync(y)) return null;
  return fs.readFileSync(y, 'utf8');
}

/** Dosyanın son yazılma günü (YYYY-MM-DD) — aynı adlı betikleri listede ayırt etmek için. */
function iceAktarmaGunu(anahtar) {
  try { return fs.statSync(dosyaYolu(anahtar)).mtime.toISOString().slice(0, 10); } catch (e) { return null; }
}

/**
 * Bir betiği derler ve kataloğa kaydeder.
 * @returns {{anahtar, etiket, bilgi}}
 */
function kayitYap(anahtar, kaynak) {
  const bilgi = inspect(kaynak);
  const Sinif = derle(kaynak, { label: bilgi.ad });
  const kayit = catalog.kaydet({
    key: anahtar,
    label: bilgi.ad || anahtar,
    Class: Sinif,
    archived: false,
    pine: true,
    iceAktarma: iceAktarmaGunu(anahtar),
    note: `İÇE AKTARILAN PINE — ${bilgi.inputs.length} parametre. `
      + `Motor ile Pine arasındaki farklar için CLAUDE.md → "PineScript içe aktarma".`
  });
  return { anahtar, etiket: kayit.label, bilgi };
}

/**
 * Açılışta tüm depoyu yükler.
 * @returns {{yuklendi: Array, hatalar: Array}}
 */
function yukle() {
  const yuklendi = [];
  const hatalar = [];
  for (const anahtar of dosyalar()) {
    const kaynak = kaynakOku(anahtar);
    if (kaynak === null) continue;
    try {
      const r = kayitYap(anahtar, kaynak);
      yuklendi.push({ anahtar: r.anahtar, etiket: r.etiket, parametre: r.bilgi.inputs.length });
    } catch (err) {
      hatalar.push({ anahtar, hata: err.message });
    }
  }
  return { yuklendi, hatalar };
}

/**
 * Yeni betik kaydeder ya da mevcut anahtarı GÜNCELLER.
 *
 * Derleme ÖNCE yapılır: derlenmeyen bir betik diske hiç yazılmaz. Aksi hâlde
 * depo çalışmayan dosyalarla dolar ve her açılışta hata listesi büyür.
 */
function kaydet(kaynak, secenekler = {}) {
  if (typeof kaynak !== 'string' || !kaynak.trim()) {
    throw new Error('Boş betik kaydedilemez');
  }
  dizinHazirla();

  const bilgi = inspect(kaynak);
  // Derlemeyi burada dene — hata mesajı doğrudan kullanıcıya gider.
  derle(kaynak, { label: bilgi.ad });

  const mevcutlar = new Set(dosyalar());
  const anahtar = secenekler.anahtar && mevcutlar.has(secenekler.anahtar)
    ? secenekler.anahtar
    : anahtarUret(bilgi.ad, mevcutlar);

  fs.writeFileSync(dosyaYolu(anahtar), kaynak, 'utf8');
  const r = kayitYap(anahtar, kaynak);
  return { anahtar: r.anahtar, etiket: r.etiket, parametre: r.bilgi.inputs.length, guncelleme: mevcutlar.has(anahtar) };
}

/** Kataloğdan çıkarır ve dosyayı siler. */
function sil(anahtar) {
  if (!String(anahtar).startsWith(ONEK)) {
    // Yerleşik stratejiler bu uçtan silinemez — kaza koruması.
    throw new Error('Yalnızca içe aktarılan Pine betikleri silinebilir');
  }
  const y = dosyaYolu(anahtar);
  const vardi = fs.existsSync(y);
  if (vardi) fs.unlinkSync(y);
  catalog.sil(anahtar);
  return vardi;
}

/** Panel listesi: her betik için derleme durumu da verilir. */
function listele() {
  return dosyalar().map(anahtar => {
    const kaynak = kaynakOku(anahtar);
    const y = dosyaYolu(anahtar);
    const durum = { anahtar, satir: kaynak ? kaynak.split('\n').length : 0 };
    try {
      const st = fs.statSync(y);
      durum.tarih = st.mtime.toISOString();
      durum.boyut = st.size;
    } catch (e) { /* dosya okunamadıysa alanlar boş kalır */ }
    try {
      const bilgi = inspect(kaynak);
      durum.etiket = bilgi.ad || anahtar;
      durum.tur = bilgi.tur;
      durum.parametre = bilgi.inputs.length;
      durum.derlenir = bilgi.tur === 'strategy' && bilgi.desteklenmeyen.length === 0;
      durum.desteklenmeyen = bilgi.desteklenmeyen;
      durum.uyarilar = bilgi.uyarilar;
    } catch (err) {
      durum.etiket = anahtar;
      durum.derlenir = false;
      durum.hata = err.message;
    }
    return durum;
  });
}

module.exports = { yukle, kaydet, sil, listele, kaynakOku, DIZIN, ONEK };
