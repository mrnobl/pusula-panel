'use strict';
/**
 * PUSULA DOKTORU — İKİ ZARARSIZ BAKIM İŞİ (F1, 78.1; K2 "riski artırmayan"): yalnız Node `fs` — alt süreç, PowerShell, cmd YOK.
 * ═══════════════════════════════════════════════════════════════════════════
 * D1 GÜNLÜK DÖNDÜRME `gunlukDondur` — sunucu-konsol.log / supervisor.log ESIK.gunlukBayt'ı (20 MB) aşınca: .2→.3, .1→.2, dosya→.1
 *    (en çok 3 eski kopya; en eski .3 üzerine yazılır). YALNIZ Pusula açılırken çağrılır (scripts/denetleyici-bekle.js --basla:
 *    o anda node server.js henüz başlamadı, konsol dosyası açık değil). Dosya açıksa (EBUSY / EPERM / EACCES) sessizce atlanır ve
 *    sicile yazılır. Yasak saatte (TR 02:30–04:30) yapılmaz. supervisor.log Kairos demo kabul raporunun kaynağı olduğu için
 *    SUPERVISOR_KORUMA_BITIS'e kadar döndürülmez. start-bot.cmd (BASLATMA sınıfı) DEĞİŞMEDİ.
 * D2 GEÇİCİ ARTIK TEMİZLİĞİ `geciciTemizle` — os.tmpdir() altında YALNIZ ARTIK_RE adlı (pusula-tatbikat-XXXXXX, pusula-kuru-XXXXXX —
 *    lib/tatbikat/geriDonus.js ve lib/kuruDeneme.js'in mkdtemp önekleri) ve 24 saatten eski KLASÖRLER silinir. Çift denetim: ad deseni
 *    + üst klasör tam olarak geçici klasör (realpath); bağlantı (symlink / junction) ve dosya atlanır. Başka hiçbir şey silinmez.
 *    Günde bir (sunucu içi zamanlayıcı, lib/sunucu/doktorUclari.js), yasak saatte yapılmaz.
 * Bayat kilitler (D3) burada SİLİNMEZ — yalnız rapor (lib/doktor/kurallar.js d3Kilit).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const K = require('./kurallar');
const sicil = require('./sicil');

const KILITLI = new Set(['EBUSY', 'EPERM', 'EACCES']);
const mb = (b) => `${String(Math.round(b / 1048576 * 10) / 10).replace('.', ',')} MB`;

/**
 * D1 tek dosya. @returns { dosya, durum: yok | kucuk | dondu | atlandi, boyut?, neden? }
 * @param o { esik, kopya, fsOps (test: { statSync, existsSync, renameSync }) }
 */
function dondur(dosya, o = {}) {
  const F = o.fsOps || fs;
  const esik = Number.isFinite(o.esik) ? o.esik : K.ESIK.gunlukBayt;
  const kopya = Number.isFinite(o.kopya) ? o.kopya : K.ESIK.gunlukKopya;
  let st;
  try { st = F.statSync(dosya); } catch { return { dosya, durum: 'yok' }; }
  if (typeof st.isFile === 'function' && !st.isFile()) return { dosya, durum: 'atlandi', neden: 'dosya değil' };
  if (st.size <= esik) return { dosya, durum: 'kucuk', boyut: st.size };
  try {
    for (let i = kopya - 1; i >= 1; i--) { const a = `${dosya}.${i}`; if (F.existsSync(a)) F.renameSync(a, `${dosya}.${i + 1}`); }
    F.renameSync(dosya, `${dosya}.1`);
    return { dosya, durum: 'dondu', boyut: st.size };
  } catch (e) {
    return { dosya, durum: 'atlandi', boyut: st.size, neden: KILITLI.has(e && e.code) ? 'dosya açık (başka program tutuyor) — sonraki açılışta yeniden denenir' : `taşınamadı: ${String(e && e.message || e).slice(0, 120)}` };
  }
}

/** Konsol ve denetleyici günlüklerinin yolları (start-bot.cmd ile aynı yerler). */
function gunlukYollari(env = process.env) {
  const yollar = require('../yollar');
  return [
    { ad: 'sunucu-konsol.log', dosya: env.PUSULA_KONSOL_GUNLUGU || yollar.veri('sunucu-konsol.log') },
    { ad: 'supervisor.log', dosya: yollar.veri('supervisor.log') },
  ];
}

/**
 * D1 açılış adımı (scripts/denetleyici-bekle.js --basla). Hiçbir durumda hata atmaz. Yalnız bir şey olduysa (döndürme / atlama) sicile yazar.
 * @param o { simdi, dosyalar: [{ ad, dosya }], esik, kopya, fsOps, sicilDosya, sicilYaz (false → yazma) }
 * @returns [{ ad, durum, … }]
 */
function acilisDondur(o = {}) {
  const simdi = Number.isFinite(o.simdi) ? o.simdi : Date.now();
  let dosyalar;
  try { dosyalar = o.dosyalar || gunlukYollari(); } catch { return []; }
  const sonuc = [];
  for (const g of dosyalar) {
    let r;
    try {
      if (K.yasakSaatMi(simdi)) r = { dosya: g.dosya, durum: 'yasak-saat' };
      else if (g.ad === 'supervisor.log' && simdi < K.SUPERVISOR_KORUMA_BITIS) r = { dosya: g.dosya, durum: 'korunuyor' };
      else r = dondur(g.dosya, o);
      // Yasak saat / koruma: dosya sınırın üstündeyse kayda geçer (neden döndürülmediği görünsün); küçükse sessiz.
      if (r.durum === 'yasak-saat' || r.durum === 'korunuyor') {
        let boyut = null;
        try { boyut = (o.fsOps || fs).statSync(g.dosya).size; } catch { boyut = null; }
        const esik = Number.isFinite(o.esik) ? o.esik : K.ESIK.gunlukBayt;
        r = boyut != null && boyut > esik ? { dosya: g.dosya, durum: 'atlandi', boyut, neden: r.durum === 'yasak-saat' ? 'TR 02:30–04:30 arası bakım yapılmaz' : 'Kairos demo kabul raporu bu dosyayı okuyor — demo kabul bitişinden 14 gün sonrasına (2026-12-24) kadar döndürülmez' }
          : { dosya: g.dosya, durum: 'kucuk', boyut };
      }
    } catch (e) { r = { dosya: g.dosya, durum: 'atlandi', neden: String(e && e.message || e).slice(0, 120) }; }
    sonuc.push({ ad: g.ad, ...r });
    if ((r.durum === 'dondu' || r.durum === 'atlandi') && o.sicilYaz !== false) {
      sicil.ekle({ z: simdi, is: 'D1', dosya: g.ad, sonuc: r.durum, boyut: r.boyut || null, boyutMetin: Number.isFinite(r.boyut) ? mb(r.boyut) : null, neden: r.neden || null }, o.sicilDosya);
    }
  }
  return sonuc;
}

/** Günlük boyutları (teşhis D1). Dosya yoksa boyut null. */
function gunlukBoyutlari(o = {}) {
  let l;
  try { l = o.dosyalar || gunlukYollari(); } catch { return null; }
  return l.map(g => { let boyut = null; try { boyut = fs.statSync(g.dosya).size; } catch { boyut = null; } return { ad: g.ad, boyut }; });
}

/** D2 adaylar (salt okuma): geçici klasördeki Pusula artıkları. @returns { kok, adaylar: [{ ad, yol, yasMs }], genc } | null */
function artiklar(o = {}) {
  const simdi = Number.isFinite(o.simdi) ? o.simdi : Date.now();
  const yasMs = Number.isFinite(o.yasMs) ? o.yasMs : K.ESIK.artikYasMs;
  let kok;
  try { kok = fs.realpathSync(o.tmpKok || os.tmpdir()); } catch { return null; }
  let l;
  try { l = fs.readdirSync(kok); } catch { return null; }
  const adaylar = [];
  let genc = 0;
  for (const ad of l) {
    if (!K.ARTIK_RE.test(ad)) continue;
    const yol = path.join(kok, ad);
    if (path.dirname(yol) !== kok) continue;            // çift denetim: tam olarak geçici klasörün çocuğu
    let st;
    try { st = fs.lstatSync(yol); } catch { continue; }
    if (!st.isDirectory() || st.isSymbolicLink()) continue;   // dosya, bağlantı (symlink / junction) atlanır
    const yas = simdi - st.mtimeMs;
    if (yas < yasMs) { genc++; continue; }
    adaylar.push({ ad, yol, yasMs: yas });
  }
  return { kok, adaylar, genc };
}

/**
 * D2 temizlik. Hiçbir durumda hata atmaz. @returns { durum: silindi | yok | yasak-saat | okunamadi | hata, sayi, adlar, hatalar }
 * @param o { simdi, tmpKok, yasMs, sicilDosya, sicilYaz }
 */
function geciciTemizle(o = {}) {
  const simdi = Number.isFinite(o.simdi) ? o.simdi : Date.now();
  if (K.yasakSaatMi(simdi)) return { durum: 'yasak-saat', sayi: 0, adlar: [], hatalar: [] };
  const a = artiklar(o);
  if (!a) return { durum: 'okunamadi', sayi: 0, adlar: [], hatalar: [] };
  if (!a.adaylar.length) return { durum: 'yok', sayi: 0, adlar: [], hatalar: [] };   // boş hedef → hiçbir şey yapılmaz, kayıt yok
  const silinen = [], hatalar = [];
  for (const x of a.adaylar) {
    // Silmeden hemen önce ikinci kez: ad + üst klasör + bağlantı değil (yarış).
    try {
      const st = fs.lstatSync(x.yol);
      if (!K.ARTIK_RE.test(path.basename(x.yol)) || path.dirname(x.yol) !== a.kok || !st.isDirectory() || st.isSymbolicLink()) continue;
      fs.rmSync(x.yol, { recursive: true, force: true, maxRetries: 2 });
      silinen.push(x.ad);
    } catch (e) { hatalar.push(`${x.ad}: ${String(e && e.code || e && e.message || e).slice(0, 60)}`); }
  }
  const r = { durum: hatalar.length && !silinen.length ? 'hata' : 'silindi', sayi: silinen.length, adlar: silinen, hatalar };
  if (o.sicilYaz !== false) {
    if (silinen.length) sicil.ekle({ z: simdi, is: 'D2', sonuc: 'silindi', sayi: silinen.length, adlar: silinen.slice(0, 20) }, o.sicilDosya);
    if (hatalar.length) sicil.ekle({ z: simdi, is: 'D2', sonuc: 'hata', sayi: hatalar.length, neden: hatalar.slice(0, 5).join(' · ') }, o.sicilDosya);
  }
  return r;
}

module.exports = { dondur, acilisDondur, gunlukYollari, gunlukBoyutlari, artiklar, geciciTemizle };
