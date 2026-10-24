'use strict';
/**
 * EVDEN OKUMA (61.7) — geliştirme bilgisayarındaki panel, bot ve işlem ekranlarını sunucudaki panelden SALT OKUMA ile çeker.
 *
 * Sorun (kullanıcı 2026-10-13): bot sunucuda çalışıyor, `data/` git'e girmiyor; geliştirme bilgisayarındaki panel 7 Ekim'de
 * alınmış eski `data/live` kopyasını gösteriyordu (yeni 1000PEPE işlemi görünmüyordu).
 * Çözüm: yalnız ARAŞTIRMA MODUNDA ve `data/ev-baglanti.json` varsa, aşağıdaki GET uçları Tailscale üzerinden sunucudaki
 * panele iletilir (telefon kademesi: `x-panel-token` = sunucudaki panel jetonu). Sunucu panelinde telefon kademesi GET dışında
 * her şeyi reddeder; bu katman da yalnız GET iletir. Veri kopyalanmaz; para tutarı hiçbir dış servise gitmez.
 * Sunucu kapalıysa / ulaşılamazsa o uç için SON BAŞARILI yanıt `evKaynak.eski: true` ile döner; hiç yoksa 502.
 * 64.8: yazma (İşlem defterim + Portföyüm) ayrı katmanda — lib/evYazma.js (sunucu tek kaynak + kuyruk; ayrı yazma jetonu).
 *
 * Kurulum: `npm run sunucu-baglanti -- --adres https://<sunucu>.<ağ>.ts.net --jeton <sunucuda npm run telefon-jeton>`.
 * Sunucuda bu dosya OLMAMALI (sunucu araştırma modunda değilse zaten devre dışı).
 */
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');

/** Sunucudan okunan uçlar: botun canlı durumu ve işlemleri. Güncelleme/sistem (bu makinenin kendisi) ve portföy laboratuvarı yerel kalır. */
/** 64.7: İşlem defterim (lib/islemDefteri) — kayıtlar sunucuda tutulur; bu bilgisayar okuma uçlarını sunucudan gösterir. */
/** 64.8: Portföyüm (lib/portfoyum) da sunucudan okunur (sunucu tek kaynak; yazma lib/evYazma.js ile sunucuya iletilir / kuyruğa girer).
 *  Portföy laboratuvarı ve model portföyler (lib/tasarimci) yerel kalır. */
/** 68.6: Dikkat (KAÇIN + kendini denetleme) ve İZLE de sunucudan — resmî arşiv yalnız sunucunun gece görevinde üretilir; bu
 *  bilgisayarda yalnız elle deneme kaydı vardı (ekran "Resmî kayıt (sunucu)" diyordu). Coin tarama ve kural açıklamaları yerel. */
/** 68.7: Portföyüm İşlem defteri analizi (defter-analiz) da sunucudan — kayıtlar orada. */
/** 73.3: İleriye kayıt durumu (/api/ileri-kayit/durum) da sunucudan — kayıtçılar yalnız sunucuda çalışır. */
/** 68.8: Botlar › portföy botları (QQQ M10 / BIST M10 / 837) — resmî kâğıt hesap ve karar kaydı sunucuda; YALNIZ bu üç okuma ucu
 *  (/api/tasarimci/portfoy-botlar, /portfoy-bot/:id, /portfoy-bot/:id/fiyat). Laboratuvar ve tasarımcının kendi uçları yerel kalır. */
const EV_YOLU = /^\/api\/(dikkat\/(durum|liste|coin|pencereler)$|izle\/(durum|liste)$|bindirme(\/|$)|bindirme-telegram$|kalkan\/durum$|exchange\/(status|account)$|hesap-islemleri(\.csv)?$|hesaplar(\/islemler(\.csv)?)?$|ileri\/|ileri-kayit\/durum$|saglik\/(durum|oz|ikinci-kanal)$|saglik\/kara-kutu\/dosya\/[0-9a-z.-]+$|gunluk(\.csv)?$|rapor(\/liste)?$|islem-defteri\/(ozet|islemler|fiyat|bakiye)$|portfoyum\/(ozet|islemler(\.csv)?|defter-analiz|gecmis|kiyas|rapor|kur|laboratuvar\/girdi)$|tasarimci\/portfoy-bot(lar|\/[a-z0-9-]+(\/fiyat)?)$)/;
/** 73.0: yalnız sunucu içi okumada (jsonGetir) izinli uçlar — ara katman bunları İLETMEZ (Ayarlar › Anahtarlar kendi uç işleyicisinde birleştirir). */
const EV_IC_YOLU = /^\/api\/anahtarlar$/;
const ZAMAN_ASIMI_MS = 10000;
const ONBELLEK_TAVAN = 300;

function ayarYolu(kok) { return yollar.programVeri(kok, 'ev-baglanti.json'); }

/**
 * @returns {{adres:string, jeton:string, yazmaJetonu?:string}|null} geçersiz/eksikse null.
 *   yazmaJetonu (64.8; ≥ 32 karakter) yalnız lib/evYazma.js kullanır — hiçbir yanıta, günlüğe, kuyruğa girmez.
 */
function ayarOku(kok) {
  try {
    const j = require('./sirKasasi').oku(ayarYolu(kok));   // 69.6: sır kasası (düz eski dosya da okunur)
    if (!j) return null;
    const adres = String(j.adres || '').trim().replace(/\/+$/, '');
    const jeton = String(j.jeton || '').trim();
    if (!/^https?:\/\/[^\s/]+$/.test(adres) || jeton.length < 24) return null;
    const yazmaJetonu = String(j.yazmaJetonu || '').trim();
    return yazmaJetonu.length >= 32 ? { adres, jeton, yazmaJetonu } : { adres, jeton };
  } catch { return null; }
}

/**
 * @param {{kok:string, etkin:boolean, fetchFn?:Function, simdi?:Function, donustur?:Function}} o
 *   etkin: yalnız araştırma modunda true (server.js ARASTIRMA_MODU).
 *   donustur(yol, govde): 64.8 — sunucudan gelen JSON nesnesine bu bilgisayarın eklerini yazar (İşlem defterim'de bu
 *   bilgisayarın OKX anahtar durumu, yazma/kuyruk bilgisi). Nesneyi yerinde değiştirir; hata atarsa gövde aynen gider.
 */
function olustur({ kok, etkin, fetchFn = (...a) => fetch(...a), simdi = () => Date.now(), donustur = null }) {
  const onbellek = new Map();          // url → { zaman, durum, tur, govde }
  const durum = { sonBasari: null, sonHata: null, sonHataZaman: null };

  function ayar() { return etkin ? ayarOku(kok) : null; }

  function sakla(url, kayit) {
    onbellek.delete(url);
    onbellek.set(url, kayit);
    while (onbellek.size > ONBELLEK_TAVAN) onbellek.delete(onbellek.keys().next().value);
  }

  function gonder(res, kayit, ek, yol) {
    res.status(kayit.durum);
    res.set('Content-Type', kayit.tur);
    res.set('X-Pusula-Kaynak', ek.eski ? 'ev-eski' : 'ev');
    if (/json/.test(kayit.tur)) {
      let g;
      try { g = JSON.parse(kayit.govde); } catch { g = null; }
      if (g && typeof g === 'object' && !Array.isArray(g)) {
        g.evKaynak = { zaman: kayit.zaman, eski: !!ek.eski, hata: ek.hata || null };
        if (donustur && yol) { try { donustur(yol, g); } catch { /* ek bilgi yazılamadı: gövde aynen */ } }
        return res.send(JSON.stringify(g));
      }
    }
    return res.send(kayit.govde);
  }

  /**
   * Sunucudan GET (önbellekli). Döndürür { zaman, durum, tur, govde } — ulaşılamazsa önbellekteki son başarılı yanıt
   * `{ ..., eski: true, hata }`; o da yoksa `evHata` taşıyan hata atar.
   */
  async function getir(url, a, ops = {}) {
    try {
      // F3: yönlendirme izlenmez (panel jetonu başka kökene gitmesin)
      const r = await fetchFn(url, { headers: { 'x-panel-token': a.jeton, accept: 'application/json, text/csv, */*' }, signal: AbortSignal.timeout(ZAMAN_ASIMI_MS), redirect: 'error' });
      const govde = await r.text();
      const tur = (r.headers && r.headers.get && r.headers.get('content-type')) || 'application/json; charset=utf-8';
      if (r.status >= 300 && r.status < 400) throw new Error(`sunucudaki panel yönlendirme döndü (${r.status}) — izlenmedi`);
      if (r.status === 401 || r.status === 403) throw new Error(`sunucudaki panel reddetti (${r.status}) — jeton yanlış/eskimiş olabilir: ${govde.slice(0, 120)}`);
      // F6: tailscale serve açık ama panel kapalı → vekil 502 text/plain verir; ≥ 500 ağ hatası sayılır (son başarılı kopyaya düşülür)
      if (r.status >= 500) throw new Error(`sunucudaki panel ${r.status} döndü (panel kapalı ya da yeniden başlıyor)`);
      const csvUc = /\.csv$/.test(new URL(url).pathname);
      if (csvUc ? !/csv|text\/plain/.test(tur) : !/json/.test(tur)) throw new Error(`sunucudaki panelden beklenmeyen yanıt (${r.status}, ${tur.split(';')[0]})`);
      const kayit = { zaman: simdi(), durum: r.status, tur, govde };
      if (r.status < 500) { sakla(url, kayit); durum.sonBasari = kayit.zaman; }
      return kayit;
    } catch (e) {
      const hata = e && e.name === 'TimeoutError' ? `sunucudaki panel ${ZAMAN_ASIMI_MS / 1000} sn içinde yanıt vermedi (kapalı ya da Tailscale bağlı değil)` : String((e && e.message) || e);
      durum.sonHata = hata; durum.sonHataZaman = simdi();
      let eski = onbellek.get(url);
      // F6: sunucu içi okumada (jsonGetir) sorgusu farklı ama yolu aynı en yeni kopya da olur (arayüz "ozet?hesap=…" çağırır)
      if (!eski && ops.yolEsle) {
        const p = new URL(url);
        for (const [k, v] of onbellek) { try { const u = new URL(k); if (u.origin === p.origin && u.pathname === p.pathname && (!eski || v.zaman >= eski.zaman)) eski = v; } catch { /* */ } }
      }
      if (eski) return { ...eski, eski: true, hata };
      throw Object.assign(new Error(hata), { evHata: hata });
    }
  }

  async function middleware(req, res, next) {
    if (req.method !== 'GET' || !EV_YOLU.test(req.path)) return next();
    const a = ayar();
    if (!a) return next();
    // Denetim 61.8 #8: "/api/bindirme/../../x" ve mutlak biçimli istek desenden geçiyordu — URL normalleştirilir; köken sunucu adresi
    // ve normalleşmiş yol yine EV_YOLU olmalı.
    let hedefUrl;
    try { hedefUrl = new URL(req.originalUrl, a.adres + '/'); } catch { return next(); }
    if (hedefUrl.origin !== new URL(a.adres).origin || !EV_YOLU.test(hedefUrl.pathname)) return next();
    let k;
    try { k = await getir(hedefUrl.href, a); } catch (e) {
      const hata = e.evHata || String((e && e.message) || e);
      return res.status(502).json({ success: false, error: `Sunucudaki panele ulaşılamadı: ${hata}`, evKaynak: { zaman: null, eski: true, hata } });
    }
    return gonder(res, k, k.eski ? { eski: true, hata: k.hata } : {}, hedefUrl.pathname);
  }

  /**
   * 64.8: sunucu içi okuma (ör. sunucudaki İşlem defterim hesapları — OKX anahtarı bu bilgisayarda kaydedilirken hesap türü).
   * Yalnız EV_YOLU uçları. Döndürür { govde (JSON), eski, zaman, durum } ya da null (kurulu değil / ulaşılamadı + önbellek yok).
   */
  async function jsonGetir(yol) {
    const a = ayar();
    if (!a) return null;
    let url;
    try { url = new URL(yol, a.adres + '/'); } catch { return null; }
    if (url.origin !== new URL(a.adres).origin || !(EV_YOLU.test(url.pathname) || EV_IC_YOLU.test(url.pathname))) return null;
    try {
      const k = await getir(url.href, a, { yolEsle: true });
      return { govde: JSON.parse(k.govde), eski: !!k.eski, zaman: k.zaman, durum: k.durum };
    } catch { return null; }
  }

  /** Panel için: kurulu mu, son başarı/hata. Jeton asla dönmez (64.8: yazma jetonu yalnız var/yok).
   *  71.1: dosya var ama okunamıyorsa `sorun`: 'eski-sifreli' (69.x DPAPI zarfı; 70.0 çözmez) ya da 'gecersiz' — panel sessizce yerel kalmasın. */
  function bilgi() {
    const a = ayar();
    let sorun = null;
    if (etkin && !a && fs.existsSync(ayarYolu(kok))) sorun = require('./sirKasasi').sifreliMi(ayarYolu(kok)) ? 'eski-sifreli' : 'gecersiz';
    return { etkin: !!etkin, kurulu: !!a, sorun, adres: a ? a.adres : null, yazmaKurulu: !!(a && a.yazmaJetonu), ...durum };
  }

  return { middleware, bilgi, jsonGetir, ayar, _onbellek: onbellek };
}

module.exports = { olustur, ayarOku, ayarYolu, EV_YOLU, EV_IC_YOLU };
