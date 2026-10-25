/**
 * PORTFÖYÜM — DEPO (sürüm 60.8): `data/portfoyum/` (git dışı — .gitignore `data/`). Dizin PORTFOYUM_DIZIN ile değişir.
 *   kayit.jsonl            YALNIZ EKLENİR (silme/değiştirme yok). Yazım ATOMİK: tüm dosya + yeni satırlar geçici dosyaya,
 *                          fsync, rename — yarım satır kalmaz. Eklemeden ÖNCE aday kayıtlar mevcutlarla birlikte yeniden
 *                          oynatılır; YENİ bir hata (bilinmeyen başvuru, kapalı hesap, para birimi, negatif adet…) çıkarsa
 *                          hiçbir şey yazılmaz.
 *   anlik/YYYY-AA-GG.json  günlük anlık görüntü (bugünün dosyası gün içinde güncellenir; geçmiş günler değişmez)
 *   kurlar.json            kur çevirici önbelleği · fiyat-onbellek.json  Binance son fiyatları
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const M = require('./model');
const { muhasebe } = require('./muhasebe');
const FAIZ = require('./faiz');
const IB = require('../istekBaglami');

let _dizin = null;
const dizin = (yeni) => { if (yeni !== undefined) _dizin = yeni; return _dizin || process.env.PORTFOYUM_DIZIN || yollar.veri('portfoyum'); };
/** Ham ayar (null = PORTFOYUM_DIZIN / varsayılan) — geçici değiştirip geri almak için. */
const dizinHam = () => _dizin;
const yol = (...p) => path.join(dizin(), ...p);
const KAYIT = () => yol('kayit.jsonl');
const ON_EK = { kurum: 'k', hesap: 'h', varlik: 'v', islem: 'i', fiyat: 'f', hedef: 'd', duzeltme: 'z', portfoy: 'p', 'hesap-portfoy': 'hp', 'hesap-kapsam': 'hk', izle: 'w' };

function oku() {
  let m;
  try { m = fs.readFileSync(KAYIT(), 'utf8'); } catch (e) { return { kayitlar: [], bozuk: [] }; }
  const kayitlar = [], bozuk = [];
  m.split('\n').forEach((s, i) => {
    if (!s.trim()) return;
    try { kayitlar.push(JSON.parse(s)); } catch (e) { bozuk.push({ satir: i + 1, mesaj: `satır ${i + 1}: geçersiz JSON` }); }
  });
  return { kayitlar, bozuk };
}

/** Atomik yazım: geçici dosya + fsync + rename. */
function atomikYaz(dosya, metin) {
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  const gecici = `${dosya}.${process.pid}.${Date.now()}.tmp`;
  try {
    const fd = fs.openSync(gecici, 'w');
    try { fs.writeSync(fd, metin); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(gecici, dosya);
  } catch (e) { try { fs.unlinkSync(gecici); } catch (x) { /* yok */ } throw e; }
}

/** Hata kimliği: tür + kayıt kimliği (+ çift/hesap). Mesaj metni (ör. değişen tutar) karşılaştırmaya girmez; kimliksiz hatada mesaj. */
const hataAnahtari = (h) => (h.id ? `${h.kod}|${h.id}|${h.hesap || ''}|${h.para || ''}` : `${h.kod}||${h.mesaj}`);

/**
 * Doğrula ve ekle. `yeniler`: kimliksiz kayıt nesneleri (id, sira, zaman burada atanır; id verilmişse korunur — CSV yok).
 * ops: { bugun, simdi, yazma: false (yalnız önizleme), kaynak }
 * Döndürür: { tamam, eklenen: [kayıt], hatalar: [yeni hata], uyarilar: [yeni uyarı] }
 */
function ekle(yeniler, ops = {}) {
  const { kayitlar, bozuk } = oku();
  if (bozuk.length) return { tamam: false, eklenen: [], hatalar: bozuk.map(b => ({ kod: 'dosya', mesaj: `kayit.jsonl bozuk (${b.mesaj}) — dosyayı elle onarın; yazım durduruldu` })), uyarilar: [] };
  const bugun = ops.bugun || M.yerelGun();
  const zaman = new Date(ops.simdi != null ? ops.simdi : Date.now()).toISOString();
  // 64.8 F5: geliştirme bilgisayarından gelen yazmanın kimliği her kayda (tekrar gelen istek kayıttan tanınır)
  const istek = ops.istek || IB.kimlik();
  let sira = kayitlar.reduce((m, k) => Math.max(m, k.sira || 0), 0);
  const kullanilan = new Set(kayitlar.map(k => k.id));
  const eklenen = (yeniler || []).map(k => {
    const x = { ...k };
    sira += 1;
    x.sira = sira;
    x.zaman = zaman;
    if (!x.id) { let n = sira; let id; do { id = `${ON_EK[x.tur] || 'r'}${n}`; n += 1; } while (kullanilan.has(id)); x.id = id; }
    kullanilan.add(x.id);
    if (ops.kaynak && !x.kaynakKayit) x.kaynakKayit = ops.kaynak;
    if (istek) x.istek = istek;
    return x;
  });
  const once = denetle(kayitlar, bugun);
  const sonra = denetle(kayitlar.concat(eklenen), bugun);
  const eskiH = new Set(once.hatalar.map(hataAnahtari));
  const eskiU = new Set(once.uyarilar.map(hataAnahtari));
  const yeniHatalar = sonra.hatalar.filter(h => !eskiH.has(hataAnahtari(h)));
  const yeniUyarilar = sonra.uyarilar.filter(h => !eskiU.has(hataAnahtari(h)));
  if (yeniHatalar.length) return { tamam: false, eklenen: [], hatalar: yeniHatalar, uyarilar: yeniUyarilar };
  if (ops.yazma === false) return { tamam: true, eklenen, hatalar: [], uyarilar: yeniUyarilar, onizleme: true };
  let eski = '';
  try { eski = fs.readFileSync(KAYIT(), 'utf8'); } catch (e) { eski = ''; }
  if (eski && !eski.endsWith('\n')) eski += '\n';
  atomikYaz(KAYIT(), eski + eklenen.map(k => JSON.stringify(k)).join('\n') + '\n');
  return { tamam: true, eklenen, hatalar: [], uyarilar: yeniUyarilar };
}

/**
 * Durum + muhasebe hata/uyarıları. 64.2: hesapların mevduat faizi ayarından biten vadelerin faizi TÜRETİLİR
 * (lib/portfoyum/faiz.js — dosyaya yazılmaz; silinenler D.otoFaizIptal) ve muhasebe bunlarla yeniden kurulur.
 * D.otoFaizler = türetilen bütün otomatik faizler (silinenler dahil; işlem defteri gösterir).
 */
function denetle(kayitlar, bugun) {
  const D = M.durumKur(kayitlar, { bugun });
  let m = muhasebe(D);
  const oto = FAIZ.otoFaizUret(D, m, bugun);
  D.otoFaizler = oto;
  const etkin = oto.filter(x => !D.iptalEdilen.has(x.id));
  if (etkin.length) { D.islemler.push(...etkin); m = muhasebe(D); }
  // 64.2 denetim: elle girilmiş vade faizi (otomatik atlandı) / faiz ayarlı hesapta nakit yok — Portföyüm uyarılarında görünür
  return { D, muh: m, hatalar: D.hatalar.concat(m.hatalar), uyarilar: D.uyarilar.concat(m.uyarilar, D.otoFaizUyarilari || []) };
}

/** Güncel durum (okuma). */
function yukle(ops = {}) {
  const { kayitlar, bozuk } = oku();
  const r = denetle(kayitlar, ops.bugun || M.yerelGun());
  r.kayitlar = kayitlar;
  r.bozuk = bozuk;
  return r;
}

// ── yan dosyalar ─────────────────────────────────────────────────────────────
function jsonOku(ad) { try { return JSON.parse(fs.readFileSync(yol(ad), 'utf8')); } catch (e) { return null; } }
function jsonYaz(ad, veri) { atomikYaz(yol(ad), JSON.stringify(veri, null, 1)); }
const anlikYolu = (gun) => yol('anlik', `${gun}.json`);
function anlikVar(gun) { return fs.existsSync(anlikYolu(gun)); }
function anlikYaz(gun, veri) { atomikYaz(anlikYolu(gun), JSON.stringify(veri, null, 1)); }
function anlikListe() { try { return fs.readdirSync(yol('anlik')).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).sort(); } catch (e) { return []; } }
function anlikOku(gun) { try { return JSON.parse(fs.readFileSync(anlikYolu(gun), 'utf8')); } catch (e) { return null; } }

module.exports = { dizin, dizinHam, oku, ekle, denetle, yukle, atomikYaz, jsonOku, jsonYaz, anlikVar, anlikYaz, anlikListe, anlikOku, KAYIT };
