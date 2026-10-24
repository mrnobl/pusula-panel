/**
 * BIST HAFİF FİYAT (73.7) — sunucuda bilanço bildiriminin "BIST 100" evreni için GÜNDE BİR, DÜŞÜK HIZLI fiyat güncellemesi.
 *
 * Sorun (73.6): bilanço evreni (lib/bildirimUreticileri.js bist100Oku) <veri>/bist-temel/fiyat'tan kuruluyor; o veri yalnız
 * geliştirme bilgisayarında (BIST temel araştırması) var → sunucu ~30'luk yedek listeye düşüyordu.
 * Çözüm: yalnız aday kümesi (lib/bist100-adaylar.json, ~160 kod — halka açık piyasa değeri en büyükler) için İş Yatırım
 * HisseTekil'den (lib/tarama/kaynakSagligi.js'de tanımlı, ücretsiz, anahtarsız; resmî API değil → düşük hız) yalnız son ~100 takvim
 * günü (~70 işlem günü) indirilir → <veri>/bist-hafif/fiyat/<KOD>.json (bist-temel ile AYNI satır biçimi). bist100Oku bist-temel
 * yoksa bunu kullanır (63 günlük pencere; 126 gün geçmiş şartı burada uygulanamaz — "yaklaşık" vekil).
 *
 * KURALLAR: karar penceresinde (UTC 23:50–01:30) ÇALIŞMAZ · istekler arası ≥ 4 sn · 429 / 5xx / ağ hatası → tur durur, 6 saat geri
 * çekilme · günde en çok bir tam tur (TR 07:00 sonrası) · araştırma kopyasında ÇALIŞMAZ (server.js) · BIST_HAFIF=0 kapatır.
 * Durum <veri>/bist-hafif/durum.json { sonGun, sonTur, geriCekilme, son: { tamam, hata, kod } }. Emir / anahtar / ücretli kaynak YOK.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ISY = 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/HisseTekil';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const DK = 60000, SAAT = 60 * DK, GUN = 24 * SAAT, TR = 3 * SAAT;
const AYAR = { aralikMs: 4000, gunGeri: 100, geriCekilmeMs: 6 * SAAT, baslaTrSaat: 7, zamanAsimiMs: 30000 };

const trGunAd = (ms) => new Date(ms + TR).toISOString().slice(0, 10);
const isyGun = (ms) => { const d = new Date(ms + TR); return `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`; };
/** Saf: botun karar penceresi (UTC 23:50–01:30) — server.js kararPenceresinde ile aynı. */
function kararPenceresinde(simdi) { const d = new Date(simdi), dk = d.getUTCHours() * 60 + d.getUTCMinutes(); return dk >= 23 * 60 + 50 || dk < 90; }
/** Saf: HisseTekil yanıtı → bist-temel satır biçimi [tarih, kapanış, düz. kapanış, AOF, düz. AOF, hacim TL, PD, HAO_PD, sermaye, XU100]. */
function satirlar(j) {
  return ((j && j.value) || []).map(x => [x.HGDG_TARIH, x.HG_KAPANIS, x.HGDG_KAPANIS, x.HG_AOF, x.HGDG_AOF, x.HG_HACIM, x.PD, x.HAO_PD, x.SERMAYE, x.END_ENDEKS_KODU === '01' ? x.END_DEGER : null])
    .filter(r => typeof r[0] === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(r[0]));
}
function adaylar(kok = path.join(__dirname)) {
  try { const j = JSON.parse(fs.readFileSync(path.join(kok, 'bist100-adaylar.json'), 'utf8')); return (j.kodlar || []).map(k => String(k).toUpperCase()).filter(k => /^[A-Z0-9]{3,6}$/.test(k)); } catch (e) { return []; }
}

/**
 * @param o { dizin (<veri>/bist-hafif), fetchFn, simdi, log(sv, m), bekle(ms), kodlar?, ayar? }
 * @returns { tik(): Promise<sonuc>, durum(): {...}, calisiyor() }
 */
function olustur(o = {}) {
  const dizin = o.dizin;
  const fetchFn = o.fetchFn || ((...a) => fetch(...a));
  const simdi = o.simdi || (() => Date.now());
  const log = o.log || (() => {});
  const bekle = o.bekle || ((ms) => new Promise(r => { const t = setTimeout(r, ms); if (t.unref) t.unref(); }));
  const A = { ...AYAR, ...(o.ayar || {}) };
  const durumYol = path.join(dizin, 'durum.json');
  let calisiyor = false;
  const oku = () => { try { return JSON.parse(fs.readFileSync(durumYol, 'utf8')); } catch (e) { return {}; } };
  const yaz = (d) => { try { fs.mkdirSync(dizin, { recursive: true }); fs.writeFileSync(durumYol + '.tmp', JSON.stringify(d, null, 1)); fs.renameSync(durumYol + '.tmp', durumYol); } catch (e) { /* */ } };

  /** Saf karar: şimdi tur atılmalı mı? → { atla: neden } | { atla: null } */
  function karar(t = simdi(), d = oku()) {
    if (kararPenceresinde(t)) return { atla: 'karar penceresi (UTC 23:50–01:30)' };
    if (d.geriCekilme && Date.parse(d.geriCekilme) > t) return { atla: `geri çekilme ${d.geriCekilme}'e kadar` };
    if (new Date(t + TR).getUTCHours() < A.baslaTrSaat) return { atla: `TR ${A.baslaTrSaat}:00'dan önce` };
    if (d.sonGun === trGunAd(t)) return { atla: 'bugün güncellendi' };
    return { atla: null };
  }

  async function tik() {
    if (calisiyor) return { atlandi: 'sürüyor' };
    const t0 = simdi(), d = oku();
    const k = karar(t0, d);
    if (k.atla) return { atlandi: k.atla };
    const kodlar = (o.kodlar || adaylar()).slice(0, 400);
    if (!kodlar.length) return { atlandi: 'aday listesi yok' };
    calisiyor = true;
    const fd = path.join(dizin, 'fiyat');
    let tamam = 0, hata = null, hataKod = null;
    try {
      fs.mkdirSync(fd, { recursive: true });
      const bas = isyGun(t0 - A.gunGeri * GUN), son = isyGun(t0);
      for (const kod of kodlar) {
        if (kararPenceresinde(simdi())) { hata = 'karar penceresine girildi — tur yarıda bırakıldı'; break; }
        let r = null;
        try { r = await fetchFn(`${ISY}?hisse=${encodeURIComponent(kod)}&startdate=${bas}&enddate=${son}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(A.zamanAsimiMs) }); }
        catch (e) { hata = `ağ: ${String(e.message || e).slice(0, 120)}`; hataKod = kod; break; }
        if (r.status === 429 || r.status >= 500) { hata = `HTTP ${r.status}`; hataKod = kod; break; }
        if (r.ok) {
          let j = null; try { j = JSON.parse(await r.text()); } catch (e) { j = null; }
          const v = satirlar(j);
          if (v.length) { fs.writeFileSync(path.join(fd, `${kod}.json`), JSON.stringify({ kod, kaynak: 'İş Yatırım HisseTekil (hafif, 73.7)', indirme: new Date(simdi()).toISOString(), v })); tamam++; }
        }
        await bekle(A.aralikMs);
      }
    } finally { calisiyor = false; }
    const yeni = { ...d, sonTur: new Date(t0).toISOString(), son: { tamam, toplam: kodlar.length, hata, kod: hataKod } };
    if (hata && /HTTP|ağ/.test(hata)) { yeni.geriCekilme = new Date(simdi() + A.geriCekilmeMs).toISOString(); log('WARN', `[BIST] hafif fiyat güncellemesi durdu (${hata}${hataKod ? `, ${hataKod}` : ''}) — ${A.geriCekilmeMs / SAAT} saat beklenecek; ${tamam}/${kodlar.length} kod güncellendi`); }
    else if (!hata) { yeni.sonGun = trGunAd(t0); yeni.geriCekilme = null; log('INFO', `[BIST] hafif fiyat güncellemesi: ${tamam}/${kodlar.length} kod (bilanço evreni için)`); }
    yaz(yeni);
    return { tamam, toplam: kodlar.length, hata };
  }

  return { tik, durum: () => ({ ...oku(), calisiyor }), calisiyor: () => calisiyor, karar };
}

module.exports = { olustur, satirlar, adaylar, kararPenceresinde, AYAR, ISY };
