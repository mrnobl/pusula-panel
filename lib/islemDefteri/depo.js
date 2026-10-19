/**
 * İŞLEM DEFTERİ — DEPO (sürüm 64.7; 65.0 Binance dosya ↔ API çift denetimi): `data/islem-defteri/` (git dışı — .gitignore `data/`). Dizin ISLEM_DEFTERI_DIZIN ile değişir.
 *   kayit.jsonl   YALNIZ EKLENİR. Yazım ATOMİK (lib/portfoyum/depo.js ile aynı yol: tüm dosya + yeni satırlar geçici dosyaya,
 *                 fsync, rename — yarım satır kalmaz). Düzeltme yalnız ters kayıtla: `iptal` (tek kayıt) ya da `geri-al` (bir
 *                 yüklemenin tamamı). Geçmiş satır değiştirilmez, silinmez.
 *   okx-durum.json  OKX eşitlemesinin son durumu (son başarılı gün, hata) — sır İÇERMEZ (anahtarlar data/secrets.json'da).
 * 64.8 F5: `istek` alanı = geliştirme bilgisayarından gelen yazmanın x-istek-kimligi (lib/istekBaglami.js); ops.istek ile de verilir.
 * Okuma önbelleği: dosya boyutu + değişme zamanı aynıysa yeniden ayrıştırılmaz (her GET'te 10 binlerce satır okunmasın).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const crypto = require('crypto');
const M = require('./model');
const IB = require('../istekBaglami');

let _dizin = null;
const dizin = (yeni) => { if (yeni !== undefined) _dizin = yeni; return _dizin || process.env.ISLEM_DEFTERI_DIZIN || yollar.veri('islem-defteri'); };
/** Ham ayar (null = ISLEM_DEFTERI_DIZIN / varsayılan) — geçici değiştirip geri almak için. */
const dizinHam = () => _dizin;
const yol = (...p) => path.join(dizin(), ...p);
const KAYIT = () => yol('kayit.jsonl');
const ON_EK = { hesap: 'a', 'hesap-guncelle': 'u', yukleme: 'y', 'geri-al': 'g', iptal: 'z' };

let onbellek = null;   // { anahtar, kayitlar, bozuk }

function oku() {
  let st;
  try { st = fs.statSync(KAYIT()); } catch (e) { return { kayitlar: [], bozuk: [] }; }
  const an = `${KAYIT()}|${st.size}|${st.mtimeMs}`;
  if (onbellek && onbellek.anahtar === an) return { kayitlar: onbellek.kayitlar, bozuk: onbellek.bozuk };
  const m = fs.readFileSync(KAYIT(), 'utf8');
  const kayitlar = [], bozuk = [];
  m.split('\n').forEach((s, i) => {
    if (!s.trim()) return;
    try { kayitlar.push(JSON.parse(s)); } catch (e) { bozuk.push({ satir: i + 1, mesaj: `satır ${i + 1}: geçersiz JSON` }); }
  });
  onbellek = { anahtar: an, kayitlar, bozuk };
  return { kayitlar, bozuk };
}

function atomikYaz(dosya, metin) {
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  const gecici = `${dosya}.${process.pid}.${Date.now()}.tmp`;
  try {
    const fd = fs.openSync(gecici, 'w');
    try { fs.writeSync(fd, metin); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(gecici, dosya);
  } catch (e) { try { fs.unlinkSync(gecici); } catch (x) { /* yok */ } throw e; }
}

/**
 * Durum: hesaplar (güncellemeler uygulanmış), yüklemeler (geri alınanlar işaretli), etkin veri kayıtları, çift anahtarları.
 * Etkin = geri alınmış bir yüklemeye ait değil ve tek tek iptal edilmemiş.
 * bastirilan: iptal edilmiş / geri alınmış (ve etkin bir kopyası olmayan) kayıtların anahtarları → { neden, yukleme }. OKX günlük
 * eşitlemesi ve içe aktarım planı bunları "bilinen" sayar — kullanıcının etkisiz yaptığı satır kendiliğinden geri gelmez;
 * yalnız açık seçimle (iceAktarPlan ops.yenidenAl) yeniden eklenir.
 */
/**
 * Kaydın çift anahtarı OKUMA anında yeniden kurulur (65.0: Binance aileleri tek 'binance' oldu; 64.x'te yazılmış '…|binance-vadeli-csv|…'
 * anahtarları dosyada değişmez ama bugünkü kuralla eşleşir). hesap/kaynakId yoksa saklı anahtar.
 */
const anahtarOf = (k) => (k.hesap && k.kaynakId ? M.anahtar(k.hesap, k.kaynak, k.kaynakId) : k.anahtar);

function durumKur(kayitlar) {
  const hesaplar = new Map(), yuklemeler = new Map(), geriAlinan = new Map(), iptalEdilen = new Map();
  for (const k of kayitlar) {
    if (k.tur === 'hesap') hesaplar.set(k.id, { ...k });
    else if (k.tur === 'hesap-guncelle' && hesaplar.has(k.hesap)) Object.assign(hesaplar.get(k.hesap), k.alanlar || {});
    else if (k.tur === 'yukleme') yuklemeler.set(k.id, { ...k });
    else if (k.tur === 'geri-al') geriAlinan.set(k.yukleme, k);
    else if (k.tur === 'iptal') iptalEdilen.set(k.hedef, k);
  }
  for (const [id, g] of geriAlinan) if (yuklemeler.has(id)) Object.assign(yuklemeler.get(id), { geriAlindi: true, geriAlmaZamani: g.kayitZamani, geriAlmaNedeni: g.neden || '' });
  const veri = [], anahtarlar = new Map(), etkisiz = [];
  for (const k of kayitlar) {
    if (!M.VERI_TURLERI.includes(k.tur)) continue;
    const an = k.anahtar ? anahtarOf(k) : null;
    if (geriAlinan.has(k.yukleme) || iptalEdilen.has(k.id)) { if (an) etkisiz.push([an, k]); continue; }
    veri.push(k);
    if (an) anahtarlar.set(an, k.id);
  }
  const bastirilan = new Map();
  // 65.0: kaynaklar = o anahtarı taşıyan etkisiz satırların kaynakları; tek satır İPTALİ her kaynağı bastırır, yükleme GERİ ALMA yalnız
  // aynı kaynağı (Binance dosyası geri alınınca aynı Trade ID'li API satırı gelebilsin — OKX'te dosya/API kimlikleri zaten ayrı)
  for (const [an, k] of etkisiz) {
    if (anahtarlar.has(an)) continue;
    const o = bastirilan.get(an) || { neden: 'geri-al', yukleme: k.yukleme || null, kaynaklar: [] };
    if (iptalEdilen.has(k.id)) o.neden = 'iptal';
    if (!o.kaynaklar.includes(k.kaynak)) o.kaynaklar.push(k.kaynak);
    bastirilan.set(an, o);
  }
  return { hesaplar, yuklemeler, veri, anahtarlar, bastirilan, iptalEdilen, geriAlinan };
}

function yukle() {
  const { kayitlar, bozuk } = oku();
  return { ...durumKur(kayitlar), kayitlar, bozuk };
}

/** Kayıt ekle (id, sira, zaman atanır). ops.simdi (ms). Döndürür eklenenler. */
function ekle(yeniler, ops = {}) {
  const { kayitlar, bozuk } = oku();
  if (bozuk.length) throw new Error(`kayit.jsonl bozuk (${bozuk[0].mesaj}) — dosyayı elle onarın; yazım durduruldu`);
  const zaman = new Date(ops.simdi != null ? ops.simdi : Date.now()).toISOString();
  // 64.8 F5: geliştirme bilgisayarından gelen yazmanın kimliği her kayda (tekrar gelen istek kayıttan tanınır)
  const istek = ops.istek || IB.kimlik();
  let sira = kayitlar.reduce((m, k) => Math.max(m, k.sira || 0), 0);
  const kullanilan = new Set(kayitlar.map(k => k.id));
  const eklenen = (yeniler || []).map(k => {
    const x = { ...k };
    sira += 1;
    x.sira = sira;
    x.kayitZamani = zaman;
    if (istek) x.istek = istek;   // veri kayıtlarında `zaman` işlemin kendi zamanıdır (ms); kaydın yazıldığı an ayrı alan
    if (!x.id) { let n = sira; let id; do { id = `${ON_EK[x.tur] || 'r'}${n}`; n += 1; } while (kullanilan.has(id)); x.id = id; }
    kullanilan.add(x.id);
    return x;
  });
  // Yer tutucu: aynı paketteki ilk kaydın (yükleme kaydı) kimliği
  if (eklenen.length) for (const x of eklenen) if (x.yukleme === '@ilk') x.yukleme = eklenen[0].id;
  if (!eklenen.length) return [];
  let eski = '';
  try { eski = fs.readFileSync(KAYIT(), 'utf8'); } catch (e) { eski = ''; }
  if (eski && !eski.endsWith('\n')) eski += '\n';
  atomikYaz(KAYIT(), eski + eklenen.map(k => JSON.stringify(k)).join('\n') + '\n');
  onbellek = null;
  return eklenen;
}

/**
 * İçe aktarım planı (yazmaz): ayrıştırılmış kayıtlar → çift denetimi (dosyadaki + kendi içinde), biçim denetimi.
 * Daha önce iptal edilmiş / geri alınmış satır (D.bastirilan) eklenmez, `bastirilan` sayılır — ops.yenidenAl === true ise eklenir.
 * Döndürür: { yeni: [kayıt], cift, bastirilan, hatalar: [{ sira, mesaj }] }.
 */
function iceAktarPlan(D, hesapId, kaynak, kayitlar, ops = {}) {
  const yeni = [], hatalar = [];
  let cift = 0, bastirilan = 0;
  const gorulen = new Set();
  const bas = D.bastirilan || new Map();
  // OKX: dosya (okx-csv) ile API (okx-api) aynı dolumu farklı kimlikle verir → aynı hesap, sembol, yön, ±2 sn, aynı fiyat ve
  // spotta aynı miktar = çift. VADELİDE miktar karşılaştırılmaz (API fillSz sözleşme adedi; dosyada "Trading Unit" coin/USDT
  // olabilir) — onun yerine iki tarafta da varsa gerçekleşen kâr eşit olmalı. Eşleşme BİRE BİR: eşlenen eski kayıt tüketilir.
  // 65.0 BINANCE: dosya (binance-*-csv) ile API (binance-api) arasında — kimliği olan satırlar (vadeli Trade ID "t:…", Transaction ID
  // "tx:…") zaten aynı anahtarla düşer; kimliksiz satırlar (spot Trade History "h:…", Trade ID sütunu olmayan eski vadeli dosya,
  // Transaction ID'siz hareket dosyası) için: dolumda aynı hesap, sembol, yön, ±2 sn, miktar ve fiyat (Binance'te iki tarafta da baz
  // coin); hareket satırında aynı tür, özgün tür (not), para, sembol, tutar, ±2 sn. İki tarafta da kimlik varsa ("t:"/"tx:") benzerlik
  // KULLANILMAZ (aynı saniyede aynı fiyatlı iki ayrı dolum birbirini yutmasın) — kimlik tek söz sahibi.
  const benzer = new Map();
  const benzerAnahtar = (k) => (k.tur === 'islem' ? `i|${k.sembol}|${k.yon}` : `h|${k.tur}|${k.not || ''}|${k.para || ''}|${k.sembol || ''}`);
  const kimlikli = (k) => /^(t|tx):/.test(String(k.kaynakId || ''));
  for (const v of D.veri) {
    if (v.hesap !== hesapId) continue;
    const a = M.aile(v.kaynak);
    if (!((a === 'okx' && v.tur === 'islem') || (a === 'binance' && M.VERI_TURLERI.includes(v.tur)))) continue;
    const an = benzerAnahtar(v); if (!benzer.has(an)) benzer.set(an, []); benzer.get(an).push(v);
  }
  const yakin = (x, y) => Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x), Math.abs(y));
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const tuketilen = new Set();
  const benzerBul = (k) => {
    const kk = k.kaynak || kaynak;
    const a = M.aile(kk);
    if (a === 'okx') {
      if (k.tur !== 'islem') return null;
      const vadeli = k.piyasa === 'vadeli';
      return (benzer.get(benzerAnahtar(k)) || []).find(v => !tuketilen.has(v.id) && (v.kaynak !== kk) && Math.abs(v.zaman - k.zaman) <= 2000 && yakin(v.fiyat, k.fiyat)
        && (vadeli ? (!sayiMi(v.gerceklesenKar) || !sayiMi(k.gerceklesenKar) || yakin(v.gerceklesenKar, k.gerceklesenKar)) : yakin(v.miktar, k.miktar))) || null;
    }
    if (a === 'binance') {
      const api = kk === 'binance-api';
      return (benzer.get(benzerAnahtar(k)) || []).find(v => !tuketilen.has(v.id) && ((v.kaynak === 'binance-api') !== api) && !(kimlikli(v) && kimlikli(k))
        && Math.abs(v.zaman - k.zaman) <= 2000 && (k.tur === 'islem' ? (yakin(v.fiyat, k.fiyat) && yakin(v.miktar, k.miktar)) : yakin(v.tutar, k.tutar))) || null;
    }
    return null;
  };
  (kayitlar || []).forEach((k, i) => {
    const hata = M.kayitDenetle(k);
    if (hata) { hatalar.push({ sira: i + 1, mesaj: hata }); return; }
    const an = M.anahtar(hesapId, k.kaynak || kaynak, k.kaynakId);
    if (D.anahtarlar.has(an) || gorulen.has(an)) { cift++; return; }
    const b = bas.get(an);
    if (b && ops.yenidenAl !== true && (b.neden === 'iptal' || !Array.isArray(b.kaynaklar) || b.kaynaklar.includes(k.kaynak || kaynak))) { gorulen.add(an); bastirilan++; return; }
    const v = benzerBul(k);
    if (v) { tuketilen.add(v.id); cift++; return; }
    gorulen.add(an);
    yeni.push({ ...k, hesap: hesapId, kaynak: k.kaynak || kaynak, anahtar: an });
  });
  return { yeni, cift, bastirilan, hatalar };
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function jsonOku(ad) { try { return JSON.parse(fs.readFileSync(yol(ad), 'utf8')); } catch (e) { return null; } }
function jsonYaz(ad, veri) { atomikYaz(yol(ad), JSON.stringify(veri, null, 1)); }

module.exports = { dizin, dizinHam, oku, yukle, ekle, durumKur, iceAktarPlan, atomikYaz, sha256, jsonOku, jsonYaz, KAYIT };
