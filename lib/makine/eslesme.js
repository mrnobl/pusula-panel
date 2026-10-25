'use strict';
/**
 * MAKİNE EŞLEMESİ VE JETONLARI (75.2, 3a — TASARIM-MAKINE-HESAP-BOT §4.1, §4.2 "Eşleme", f5)
 * ═══════════════════════════════════════════════════════════════════════════
 * Üç dosya:
 *   makineler.json        (KİŞİSEL) { surum, kendi: { adres }, makineler: [{ kimlik, ad, adres, rol, sira, eklendi }], yonetici: null }
 *                         — `yonetici` 3b'de (f1) dolar; 3a'da hep null kalır (ileriye uyumlu alan).
 *   makine-jetonlari.json (GİZLİ, sır kasası lib/sirKasasi) { giden: { <kimlik>: jeton }, gelen: { <kimlik>: { ozet, eklendi } } }
 *                         giden = O makineyi çağırırken BENİM gönderdiğim jeton; gelen = o makinenin bana gönderdiği jetonun SHA-256 özeti.
 *   makine-esleme.json    (MAKİNE) tek kullanımlık eşleme kodunun özeti + bitiş (10 dk) + yanlış deneme sayısı.
 *
 * JETON YÖNÜ (KARAR, 75.2): her makine KENDİSİNE gelecek istekler için jetonu KENDİSİ üretir ve yalnız özetini saklar; jetonun
 * kendisini karşıya verir. Böylece hiçbir makine, karşısının saklayacağı özetin kaynağını seçemez. Eşlemede:
 *   B (başlatan) T_B üretir → A'ya gönderir (A: giden[B] = T_B) · B: gelen[A] = sha(T_B)
 *   A (kodu üreten) T_A üretir → yanıtla B'ye verir (B: giden[A] = T_A) · A: gelen[B] = sha(T_A)
 * Aynı makineyle yeniden eşlemek iki jetonu da yeniler ("jetonu yenile" = yeniden eşle).
 *
 * KOD: 8 grup × 4 rakam (10^32 olasılık), crypto.randomInt. Dosyada yalnız özeti. 10 dk geçerli, TEK kullanımlık; 5 yanlış denemede
 * kod geçersiz olur (uç ayrıca IP başına 10 dk'da 5 deneme sınırı koyar).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { KIMLIK_RE, ADRES_RE, ROLLER } = require('./protokol');

const KOD_SURE_MS = 10 * 60 * 1000;
const KOD_YANLIS_HAK = 5;
const ES_TAVAN = 16;
const JETON_RE = /^[A-Za-z0-9_-]{43}$/;

const ozet = (s) => crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
const esitMi = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };
/** Saf: kod girişi → yalnız rakamlar (boşluk, tire, nokta atılır). */
const kodNormal = (k) => String(k || '').replace(/[^0-9]/g, '');
/** Saf: 32 rakamı 4'lük gruplara böler (gösterim). */
const kodBicim = (k) => (kodNormal(k).match(/.{1,4}/g) || []).join('-');
function jetonUret() { return crypto.randomBytes(32).toString('base64url'); }
function kodUretHam() { let s = ''; for (let i = 0; i < 8; i++) s += String(crypto.randomInt(0, 10000)).padStart(4, '0'); return s; }

/** Saf: adres normali (sondaki / atılır, küçük harf şema+ad) → geçersizse null. */
function adresNormal(a) {
  const s = String(a || '').trim().replace(/\/+$/, '');
  if (!ADRES_RE.test(s)) return null;
  try { const u = new URL(s); if (u.username || u.password || (u.pathname && u.pathname !== '/') || u.search || u.hash) return null; return `${u.protocol}//${u.host}`.toLowerCase(); } catch { return null; }
}

function jsonOku(f, yedek) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return yedek; } }
function jsonYaz(f, n) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const g = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(g, JSON.stringify(n, null, 2), 'utf8');
  fs.renameSync(g, f);
}

/**
 * @param o.dosyalar { makineler, jetonlar, esleme } (varsayılan yollar.veri(...))
 * @param o.sir      { oku(dosya) → nesne|null (hata atabilir), yaz(dosya, nesne) } (varsayılan lib/sirKasasi)
 * @param o.simdi    () → ms
 */
function olustur(o = {}) {
  const yollar = require('../yollar');
  const D = { makineler: yollar.veri('makineler.json'), jetonlar: yollar.veri('makine-jetonlari.json'), esleme: yollar.veri('makine-esleme.json'), ...(o.dosyalar || {}) };
  const sir = o.sir || require('../sirKasasi');
  const simdi = o.simdi || Date.now;

  function liste() {
    const j = jsonOku(D.makineler, null);
    const l = j && Array.isArray(j.makineler) ? j.makineler.filter(m => m && KIMLIK_RE.test(String(m.kimlik || ''))) : [];
    return { surum: 1, kendi: { adres: (j && j.kendi && adresNormal(j.kendi.adres)) || null }, makineler: l, yonetici: (j && j.yonetici) || null };
  }
  function listeYaz(l) { jsonYaz(D.makineler, { surum: 1, kendi: l.kendi, makineler: l.makineler, yonetici: l.yonetici || null }); }
  function jetonlar() {
    let j = null;
    try { j = sir.oku(D.jetonlar); } catch { j = null; }
    return { giden: (j && j.giden && typeof j.giden === 'object') ? j.giden : {}, gelen: (j && j.gelen && typeof j.gelen === 'object') ? j.gelen : {} };
  }

  function kendiAdresYaz(adres) {
    const a = adresNormal(adres);
    if (!a) return false;
    const l = liste();
    if (l.kendi.adres === a) return true;
    l.kendi = { adres: a };
    listeYaz(l);
    return true;
  }

  /* ── Kod ── */
  function kodUret() {
    const kod = kodUretHam();
    const bitis = simdi() + KOD_SURE_MS;
    jsonYaz(D.esleme, { ozet: ozet(kod), bitis, olusturma: new Date(simdi()).toISOString(), yanlis: 0 });
    return { kod: kodBicim(kod), bitis: new Date(bitis).toISOString() };
  }
  function kodDurumu() {
    const j = jsonOku(D.esleme, null);
    return j && j.ozet && j.bitis > simdi() ? { var: true, bitis: new Date(j.bitis).toISOString() } : { var: false, bitis: null };
  }
  function kodSil() { try { fs.unlinkSync(D.esleme); } catch { /* yok */ } }
  /** Kodu dener; doğruysa SİLER (tek kullanımlık). @returns {{ ok, neden? }} */
  function kodKullan(kod) {
    const j = jsonOku(D.esleme, null);
    if (!j || !j.ozet) return { ok: false, neden: 'Bu bilgisayarda geçerli eşleme kodu yok — önce "Kod üret".' };
    if (!(j.bitis > simdi())) { kodSil(); return { ok: false, neden: 'Eşleme kodunun süresi doldu (10 dk) — yeni kod üretin.' }; }
    const n = kodNormal(kod);
    if (n.length !== 32 || !esitMi(ozet(n), j.ozet)) {
      const yanlis = (Number(j.yanlis) || 0) + 1;
      if (yanlis >= KOD_YANLIS_HAK) kodSil(); else jsonYaz(D.esleme, { ...j, yanlis });
      return { ok: false, neden: yanlis >= KOD_YANLIS_HAK ? 'Eşleme kodu yanlış — çok fazla yanlış deneme, kod iptal edildi; yeni kod üretin.' : 'Eşleme kodu yanlış.' };
    }
    kodSil();
    return { ok: true };
  }

  /* ── Eşler ── */
  function es(kimlik) { return liste().makineler.find(m => m.kimlik === kimlik) || null; }
  /**
   * Eşi ekler ya da günceller (yeniden eşleme: jetonlar yenilenir). @param bilgi { kimlik, ad, adres, rol } @param j { giden, gelen } (gelen = jetonun KENDİSİ; özeti saklanır)
   * @returns {{ ok, neden? , es? }}
   */
  function esEkle(bilgi, j) {
    const kimlik = String(bilgi && bilgi.kimlik || '');
    const adres = adresNormal(bilgi && bilgi.adres);
    if (!KIMLIK_RE.test(kimlik)) return { ok: false, neden: 'makine kimliği geçersiz' };
    if (!adres) return { ok: false, neden: 'makine adresi geçersiz' };
    if (!ROLLER.includes(bilgi.rol)) return { ok: false, neden: 'makine rolü geçersiz' };
    if (!j || !JETON_RE.test(String(j.giden || '')) || !JETON_RE.test(String(j.gelen || ''))) return { ok: false, neden: 'jeton biçimi geçersiz' };
    const l = liste();
    const var_ = l.makineler.find(m => m.kimlik === kimlik);
    if (!var_ && l.makineler.length >= ES_TAVAN) return { ok: false, neden: `en çok ${ES_TAVAN} makine eşlenebilir` };
    const zaman = new Date(simdi()).toISOString();
    const kayit = { kimlik, ad: String(bilgi.ad || kimlik).slice(0, 64), adres, rol: bilgi.rol, sira: var_ ? var_.sira : (l.makineler.reduce((a, m) => Math.max(a, Number(m.sira) || 0), 0) + 1),
      eklendi: var_ ? var_.eklendi : zaman, yenilendi: var_ ? zaman : null };
    // Önce sır dosyası (jetonsuz eş kaydı kalmasın), sonra liste.
    const jt = jetonlar();
    jt.giden[kimlik] = String(j.giden);
    jt.gelen[kimlik] = { ozet: ozet(j.gelen), eklendi: zaman };
    sir.yaz(D.jetonlar, jt);
    l.makineler = var_ ? l.makineler.map(m => (m.kimlik === kimlik ? kayit : m)) : [...l.makineler, kayit];
    listeYaz(l);
    return { ok: true, es: kayit, yenilendi: !!var_ };
  }
  function esKaldir(kimlik) {
    const l = liste();
    const var_ = l.makineler.some(m => m.kimlik === kimlik);
    const jt = jetonlar();
    const jetonVar = kimlik in jt.giden || kimlik in jt.gelen;
    if (jetonVar) { delete jt.giden[kimlik]; delete jt.gelen[kimlik]; sir.yaz(D.jetonlar, jt); }
    if (var_) { l.makineler = l.makineler.filter(m => m.kimlik !== kimlik); listeYaz(l); }
    return var_ || jetonVar;
  }
  function gidenJeton(kimlik) { const t = jetonlar().giden[kimlik]; return JETON_RE.test(String(t || '')) ? t : null; }
  /** Gelen istek jetonu doğru mu (özetler zaman sabit karşılaştırılır). Eş listede yoksa false. */
  function gelenDogru(kimlik, jeton) {
    if (!KIMLIK_RE.test(String(kimlik || '')) || typeof jeton !== 'string' || !JETON_RE.test(jeton)) return false;
    const g = jetonlar().gelen[kimlik];
    if (!g || !/^[0-9a-f]{64}$/.test(String(g.ozet || ''))) return false;
    return esitMi(ozet(jeton), g.ozet);
  }

  return { liste, kendiAdresYaz, kodUret, kodDurumu, kodKullan, es, esEkle, esKaldir, gidenJeton, gelenDogru, dosyalar: D };
}

module.exports = { olustur, jetonUret, kodNormal, kodBicim, adresNormal, ozet, KOD_SURE_MS, KOD_YANLIS_HAK, ES_TAVAN, JETON_RE };
