'use strict';
/**
 * PİYASA BAĞLAMI — TELEGRAM (73.9). İki tür, bildirim merkezinin kapısından (aç/kapat, şablon, kanal, sessiz saat merkezde):
 *   takvim  · pazartesi (İstanbul) haftalikSaat'ten sonra haftada bir: haftanın olayları TEK mesaj (olay yoksa mesaj yok)
 *           · olaydan bir gün önce oncekiSaat'ten sonra: "Yarın: …" (olay başına bir kez)
 *   olay    olay açıklanınca SONUÇ (olay başına bir kez; en çok 3 gün geriye — sunucu uzun kapalı kaldıysa eski sonuç gönderilmez):
 *           FOMC kararı (federalreserve.gov açıklaması; yedek FRED DFEDTARU/L), ABD TÜFE (FRED CPIAUCSL), Türkiye TÜFE (EVDS).
 *           BIST bilanço SONUÇLARI burada YOK — 73.6 bilanço özeti (bildirimUreticileri 'bilanco') zaten gönderiyor; çakıştırılmaz.
 * Yorum / alım-satım önerisi YOK; her mesajda "yalnız bilgi". Yalnız sunucu (server.js bildirim üreticileriyle birlikte kurar).
 * Durum: <veri>/piyasa-bildirim.json (gönderilen hafta, hatırlatılan / sonucu gönderilen olaylar).
 */
const fs = require('fs');
const path = require('path');
const BM = require('../bildirimMetinleri');
const BU = require('../bildirimUreticileri');
const T = require('./takvim');

const DK = 60e3, SAAT = 60 * DK, GUN = 24 * SAAT;
const SONUC_TURLERI = ['fomc', 'tufe-abd', 'tufe-tr'];
const KAYNAK_AD = { fomc: 'federalreserve.gov FOMC açıklaması', 'tufe-abd': 'FRED CPIAUCSL (BLS)', 'tufe-tr': 'TCMB EVDS (TÜİK)' };

function durumOku(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')) || {}; } catch { return {}; } }
function durumYaz(f, d) { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(d)); fs.renameSync(f + '.tmp', f); } catch { /* sonraki tur */ } }

/** Saf: haftalık mesaj parçaları. */
function haftaParcalari(olaylar, hafta) {
  const satir = olaylar.map(o => T.olayMetni(o));
  return { parcalar: { simge: '🗓️', baslik: `Bu hafta piyasa takvimi (${hafta})`, govde: [...satir, 'Yalnız bilgi — botlar kendi kurallarıyla çalışır.'].map(BM.kacir), ne: '' },
    degiskenler: { hafta, liste: satir.map(BM.kacir), olay: '', ne_zaman: '' } };
}
/** Saf: bir gün önce hatırlatma parçaları. */
function oncekiParcalari(o) {
  const ne = T.olayMetni(o).split(' · ')[0];
  return { parcalar: { simge: '⏰', baslik: `Yarın: ${o.baslik}`, govde: [ne + (o.ayrinti ? ` · ${o.ayrinti}` : ''), `Kaynak: ${o.kaynak}`, 'Yalnız bilgi — botlar kendi kurallarıyla çalışır.'].map(BM.kacir), ne: '' },
    degiskenler: { hafta: '', liste: [], olay: BM.kacir(o.baslik), ne_zaman: BM.kacir(ne) } };
}
/** Saf: sonuç parçaları. */
function sonucParcalari(o, cumle, kaynak) {
  return { parcalar: { simge: '📣', baslik: `${o.baslik} — açıklandı`, govde: [cumle, `Kaynak: ${kaynak}`, 'Yalnız bilgi — botların kararına girmez.'].map(BM.kacir), ne: '' },
    degiskenler: { olay: BM.kacir(o.baslik), sonuc: BM.kacir(cumle), kaynak: BM.kacir(kaynak) } };
}

/**
 * @param o { pb (PiyasaBaglami), durumDosya, merkez (uretici, acikMi), gonder: async (tur, parcalar, degiskenler) → { ok }, simdi?, log? }
 */
function olustur(o = {}) {
  const pb = o.pb;
  const simdi = o.simdi || (() => Date.now());
  const log = o.log || (() => {});
  const dosya = o.durumDosya;
  let d = durumOku(dosya);
  d.onceki = d.onceki || {}; d.sonuc = d.sonuc || {};
  const kaydet = () => durumYaz(dosya, d);
  const acik = (tur) => { try { return o.merkez.acikMi(tur); } catch { return true; } };
  const ayar = () => ({ haftalikSaat: '09:00', oncekiSaat: '18:00', ...((o.merkez && o.merkez.uretici && o.merkez.uretici('takvim')) || {}) });
  let mesgul = false;

  async function tik() {
    if (mesgul) return { atlandi: 'mesgul' };
    mesgul = true;
    const out = { hafta: null, onceki: [], sonuc: [] };
    try {
      const t = simdi();
      const z = BU.istanbul(t);
      const a = ayar();
      // 1) Haftalık
      const hafta = BU.haftaEtiketi(t);
      if (d.hafta !== hafta && z.haftaGunu === 1 && z.dk >= (BU.saatDk(a.haftalikSaat) ?? 540)) {
        const { bas, bit } = T.haftaSiniri(t);
        const l = pb.olaylar(bas, bit);
        if (!acik('takvim') || !l.length) { d.hafta = hafta; out.hafta = acik('takvim') ? 'bos' : 'kapali'; }
        else { const x = haftaParcalari(l, hafta); const r = await o.gonder('takvim', x.parcalar, x.degiskenler); if (r && r.ok) { d.hafta = hafta; out.hafta = l.length; } }
        kaydet();
      }
      // 2) Bir gün önce
      const yarin = BU.istanbul(t + GUN).gun;
      if (z.dk >= (BU.saatDk(a.oncekiSaat) ?? 1080)) {
        for (const ol of pb.olaylar(t, t + 2 * GUN)) {
          if (T.ist(ol.zaman).gun !== yarin || d.onceki[ol.kimlik]) continue;
          if (!acik('takvim')) { d.onceki[ol.kimlik] = t; continue; }
          const x = oncekiParcalari(ol);
          // eslint-disable-next-line no-await-in-loop
          const r = await o.gonder('takvim', x.parcalar, x.degiskenler);
          if (r && r.ok) { d.onceki[ol.kimlik] = t; out.onceki.push(ol.kimlik); }
        }
        kaydet();
      }
      // 3) Sonuç
      for (const ol of pb.olaylar(t - 3 * GUN, t)) {
        if (!SONUC_TURLERI.includes(ol.tur) || d.sonuc[ol.kimlik]) continue;
        const s = pb.olaySonucu(ol);
        if (!s) continue;
        const cumle = require('./index').sonucCumlesi(ol, s);
        if (!cumle) continue;
        if (!acik('olay')) { d.sonuc[ol.kimlik] = t; continue; }
        const x = sonucParcalari(ol, cumle, s.kaynak || KAYNAK_AD[ol.tur]);
        // eslint-disable-next-line no-await-in-loop
        const r = await o.gonder('olay', x.parcalar, x.degiskenler);
        if (r && r.ok) { d.sonuc[ol.kimlik] = t; out.sonuc.push(ol.kimlik); }
      }
      // 60 günden eski işaretler düşer
      for (const k of ['onceki', 'sonuc']) for (const [id, z2] of Object.entries(d[k])) if (t - z2 > 60 * GUN) delete d[k][id];
      d.kontrol = t; d.hata = null;
      kaydet();
    } catch (e) {
      d.hata = String((e && e.message) || e).slice(0, 200);
      kaydet();
      log('WARN', `[BİLDİRİM] piyasa takvimi: ${d.hata}`);
      out.hata = d.hata;
    } finally { mesgul = false; }
    return out;
  }

  let zt = [];
  function baslat() {
    const t1 = setTimeout(() => tik().catch(() => null), 5 * DK);
    const t2 = setInterval(() => tik().catch(() => null), 3 * DK);
    for (const x of [t1, t2]) if (x.unref) x.unref();
    zt.push(t1, t2);
  }
  function durdur() { for (const x of zt) { clearTimeout(x); clearInterval(x); } zt = []; }
  function durum() { return { kontrol: d.kontrol || null, hafta: d.hafta || null, hatirlatilan: Object.keys(d.onceki).length, sonuc: Object.keys(d.sonuc).length, hata: d.hata || null }; }

  return { tik, baslat, durdur, durum, _durum: () => d };
}

module.exports = { olustur, haftaParcalari, oncekiParcalari, sonucParcalari };
