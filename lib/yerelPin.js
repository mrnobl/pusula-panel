/**
 * 69.6 YEREL PIN — masaüstü panelin tehlikeli işlemlerinin ikinci kilidi (güvenlik testi 2026-10-21, kullanıcı kararı "1 evet").
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sorun: yerel kademe (127.0.0.1) jetonsuz tam yetkiliydi. Bilgisayardaki herhangi bir süreç ya da tarayıcıdaki bir sayfa
 * gövdesiz POST ile engel kaldırabiliyor, taşıma paketi oluşturup (çözülmüş sırlarla) indirebiliyordu.
 *
 *   · Aşağıdaki TEHLİKELİ uçlar yerel kademede de PIN ister: telefondaki acil PIN'in AYNISI (lib/acilPin.js pinDogrula —
 *     scrypt özeti, aynı kalıcı yanlış deneme sayacı ve 1 dk kilit, kilitlenince Telegram).
 *   · Doğru PIN 10 dakikalık oturum verir: `pusula_pin` çerezi (rastgele 256 bit, yalnız bellekte; HttpOnly, SameSite=Strict).
 *     Pusula yeniden başlayınca bütün oturumlar düşer.
 *   · PIN tanımlı değilse tehlikeli işlem REDDEDİLİR (PIN panelden belirlenemez — belirlenebilseydi bir kötü yazılım önce
 *     kendi PIN'ini koyardı). Belirleme: sunucuda bir kez `npm run acil-pin`.
 *   · Risk AZALTAN işlemler (acil kapatma, durdurma, pozisyon kapatma) PIN İSTEMEZ.
 *   · Sistem jetonu: Pusula'nın kendi betikleri (güncelleyicinin yeniden başlatma isteği) PIN soramaz. Açılışta rastgele bir
 *     jeton <veri>/yerel-sistem-jeton.json'a yazılır; `x-pusula-sistem` başlığıyla gelen istek PIN'siz geçer.
 *   · Araştırma modunda (geliştirme bilgisayarı) kapı kapalıdır; o makinede bu uçlar zaten kapalı ya da yerel denemedir.
 *   · 76.7 TAZE PIN (TAZE listesi — 4b devralmanın SAHİPLEN onayı): açık 10 dk oturum YETMEZ. Geçmesi için oturum son
 *     TAZE_MS (2 dk) içinde PIN girilerek açılmış ve henüz HİÇBİR korumalı işlemde kullanılmamış olmalı (DEVRAL'ın açtığı
 *     oturum SAHİPLEN'i geçirmez → PIN ikinci kez sorulur). Geçen istek oturumu "kullanılmış" yapar; her SAHİPLEN denemesi yeni
 *     PIN ister. Sistem jetonu bu uçları da geçirmez.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yollar = require('./yollar');
const { acilYolNormal } = require('./acilPin');

const CEREZ = 'pusula_pin';
const SURE_MS = 10 * 60 * 1000;
const TAZE_MS = 2 * 60 * 1000;
const SISTEM_BASLIK = 'x-pusula-sistem';
const DURUM_YOLU = '/api/yerel-pin/durum';
const DOGRULA_YOLU = '/api/yerel-pin/dogrula';
const KAPAT_YOLU = '/api/yerel-pin/kapat';

/** PIN isteyen uçlar (normalleşmiş yol: küçük harf, sondaki / yok, yüzde kodu çözülmüş — geniş eşleşme güvenli yön). */
const TEHLIKELI = [
  /^\/api\/tasima\/(olustur|yukle|yerel|onizle|uygula|yedek-sifre|sil\/[^/]+)$/,   // taşıma paketi = çözülmüş sırlar
  /^\/api\/tasima\/indir\/[^/]+$/,                                                  // GET de
  /^\/api\/(secrets|config)$/,                                                      // anahtarlar, Telegram, sağlık adresleri
  /^\/api\/islem-defteri\/(okx|binance)\/anahtar(-sil)?$/,
  /^\/api\/saglik\/ikinci-kanal$/,
  /^\/api\/toplam-risk\/esikler$/,                                                  // A3: sınır kipine geçiş (onaylı eşik); izlemeye dönüş PIN'siz
  /^\/api\/saglik\/oz\/[^/]+\/guvenli-kip-kaldir$/,
  /^\/api\/bindirme\/[^/]+\/(engel-kaldir|mod|canli-onay|kagit-sifirla|kagit-geri-al|sermaye-akisi)$/,   // 77.5: + kâğıt acil geri al (uygulama; önizleme PIN'siz)
  /^\/api\/exchange\/(arm|connect|order)$/,                                         // canlı emir kilidi, bağlantı, elle emir
  /^\/api\/(reset-kill-switch|risk\/reset-daily|reset-all|clear-history)$/,
  /^\/api\/guncelleme\/uygula$/,                                                    // kuru fark onayı dahil
  /^\/api\/sistem\/(yeniden-baslat|durdur)$/,                                       // 73.6 durdur: güncelleyicinin paket kurulumu
  /^\/api\/tatbikat\/kaydet$/,                                                      // D3: tatbikat sonucu Kairos demo kabul prova günlüğüne yazılır
  /^\/api\/makine\/(esle\/kod|esle-baslat|kaldir|yonetici|tasi|devral|devral\/sahiplen)$/,   // 75.2 makine eşleme kodu, eşleşme, eş kaldırma (jeton üretir/siler); 75.3 yönetici seçimi; 75.5 bot taşıma; 4b devralma + sahiplen onayı
  /^\/api\/doktor\/motor\/(etkin|kural-ac)$/,                                       // 78.2 Pusula Doktoru: onarım motorunu ETKİN kipe geçirme + kural açma (gölge / kapalı / kural kapatma PIN'siz)
];
/** 76.7: açık PIN oturumunun YETMEDİĞİ uçlar — PIN bu işlem için yeniden girilir (yukarıdaki TAZE PIN notu). Hepsi TEHLIKELI'de de. */
const TAZE = [
  /^\/api\/makine\/devral\/sahiplen$/,                                              // 4b: borsadaki emirleri deftere alma onayı (DEVRAL'dan sonra ikinci PIN)
];
const OKUMA = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Saf: bu istek PIN ister mi. İndirme ucu GET'te de; diğerleri yalnız yazmada. */
function tehlikeliMi(method, yol) {
  const m = String(method || '').toUpperCase();
  const y = acilYolNormal(yol);
  if (m === 'OPTIONS') return false;
  if (OKUMA.has(m)) return TEHLIKELI[1].test(y);
  return TEHLIKELI.some(r => r.test(y));
}

/** Saf (76.7): bu istek TAZE PIN ister mi (yalnız yazma). */
function tazeMi(method, yol) {
  const m = String(method || '').toUpperCase();
  if (OKUMA.has(m)) return false;
  const y = acilYolNormal(yol);
  return TAZE.some(r => r.test(y));
}

function cerezOku(baslik, ad) {
  for (const p of String(baslik || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === ad) return p.slice(i + 1).trim();
  }
  return '';
}

const esit = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };

function sistemJetonYolu(kok) { return yollar.programVeri(kok, 'yerel-sistem-jeton.json'); }
/** Betikler için: sunucunun yazdığı sistem jetonu (yoksa ''). */
function sistemJetonuOku(kok) {
  try { const j = JSON.parse(fs.readFileSync(sistemJetonYolu(kok), 'utf8').replace(/^﻿/, '')); return typeof j.jeton === 'string' ? j.jeton : ''; } catch { return ''; }
}

/**
 * @param o.acilPin   lib/acilPin.js olustur() sonucu (pinDogrula, durum)
 * @param o.kok       program kökü (sistem jetonu dosyası)
 * @param o.etkin     false → kapı kapalı (araştırma modu)
 * @param o.log       (düzey, metin)
 * @param o.simdi     () → ms (test)
 */
function olustur(o = {}) {
  const acilPin = o.acilPin;
  const simdi = o.simdi || Date.now;
  const log = o.log || (() => {});
  const etkin = o.etkin !== false;
  const oturumlar = new Map();   // jeton → bitiş ms
  const acilislar = new Map();   // 76.7: jeton → PIN'in girildiği an (ms)
  const kullanilan = new Set();  // 76.7: en az bir korumalı işlemde kullanılmış oturumlar
  let sistemJeton = '';
  if (etkin && o.kok) {
    sistemJeton = crypto.randomBytes(32).toString('hex');
    try {
      const d = sistemJetonYolu(o.kok);
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.writeFileSync(d, JSON.stringify({ jeton: sistemJeton, olusturma: new Date(simdi()).toISOString(), not: 'Pusula her açılışta yeniler; güncelleyici yeniden başlatma isteğinde kullanır.' }), { encoding: 'utf8', mode: 0o600 });
    } catch (e) { sistemJeton = ''; log('WARN', `Yerel sistem jetonu yazılamadı: ${e.message}`); }
  }

  function temizle() { const t = simdi(); for (const [k, b] of oturumlar) if (b <= t) { oturumlar.delete(k); acilislar.delete(k); kullanilan.delete(k); } }
  const oturumJetonu = (req) => cerezOku(req.headers && req.headers.cookie, CEREZ);
  /** 76.7: oturum TAZE mi — son TAZE_MS içinde PIN'le açılmış ve hiç kullanılmamış. */
  function tazeOturum(req) {
    if (!oturumBitis(req)) return false;
    const j = oturumJetonu(req), a = acilislar.get(j);
    return Number.isFinite(a) && a >= simdi() - TAZE_MS && !kullanilan.has(j);
  }
  function oturumBitis(req) {
    temizle();
    const j = cerezOku(req.headers && req.headers.cookie, CEREZ);
    if (!/^[0-9a-f]{64}$/.test(j)) return null;
    const b = oturumlar.get(j);
    return b && b > simdi() ? b : null;
  }
  function durum(req) {
    const p = acilPin ? acilPin.durum() : { tanimli: false, kilitli: false, kalanHak: 0 };
    const b = req ? oturumBitis(req) : null;
    return { etkin, tanimli: p.tanimli, kilitli: p.kilitli, kalanHak: p.kalanHak, kilitBitis: p.kilitBitis || null, oturum: !!b, oturumBitis: b ? new Date(b).toISOString() : null, sureDk: SURE_MS / 60000 };
  }
  const jsonYaz = (res, kod, govde, baslik) => {
    res.statusCode = kod;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (baslik) for (const [k, v] of Object.entries(baslik)) res.setHeader(k, v);
    res.end(JSON.stringify(govde));
  };
  function govdeOku(req, cb) {
    if (req.body && typeof req.body === 'object') return cb(req.body);
    let g = '', asti = false;
    req.setEncoding('utf8');
    req.on('data', (p) => { if (asti) return; g += p; if (g.length > 1024) asti = true; });
    req.on('end', () => { let b = {}; if (!asti) { try { b = JSON.parse(g || '{}') || {}; } catch { b = {}; } } cb(b); });
  }

  /**
   * Express ara katmanı: guvenlik.middleware'den SONRA (req.kademe hazır), gövde ayrıştırıcıdan bağımsız.
   * Yalnız YEREL kademede çalışır (telefon kademesi kendi beyaz listesi + acil PIN'iyle zaten sınırlı).
   */
  function middleware(req, res, next) {
    const yol = acilYolNormal(req.path || String(req.url || '').split('?')[0]);
    if (yol === DURUM_YOLU && req.method === 'GET') return jsonYaz(res, 200, { success: true, ...durum(req) });
    if (yol === DOGRULA_YOLU && req.method === 'POST') {
      if (!etkin) return jsonYaz(res, 200, { success: true, ...durum(req) });
      if (req.kademe !== 'yerel') return jsonYaz(res, 403, { success: false, error: 'PIN oturumu yalnız bu bilgisayardaki panelde açılır.' });
      return govdeOku(req, (b) => {
        const s = acilPin ? acilPin.pinDogrula(String(b.pin || '')) : { ok: false, durum: 403, hata: 'PIN modülü yok' };
        if (!s.ok) return jsonYaz(res, s.durum, { success: false, pinGerekli: true, error: s.hata, ...durum(req) });
        temizle();
        const j = crypto.randomBytes(32).toString('hex');
        oturumlar.set(j, simdi() + SURE_MS);
        acilislar.set(j, simdi());
        log('INFO', '🔐 Yerel PIN oturumu açıldı (10 dk)');
        jsonYaz(res, 200, { success: true, ...durum(req), oturum: true, oturumBitis: new Date(simdi() + SURE_MS).toISOString() },
          { 'Set-Cookie': `${CEREZ}=${j}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SURE_MS / 1000}` });
      });
    }
    if (yol === KAPAT_YOLU && req.method === 'POST') {
      const j = cerezOku(req.headers && req.headers.cookie, CEREZ);
      if (j) { oturumlar.delete(j); acilislar.delete(j); kullanilan.delete(j); }
      return jsonYaz(res, 200, { success: true, ...durum(null), oturum: false }, { 'Set-Cookie': `${CEREZ}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
    }
    if (!etkin || req.kademe !== 'yerel' || !tehlikeliMi(req.method, yol)) return next();
    if (tazeMi(req.method, yol)) {
      // 76.7: açık oturum ve sistem jetonu YETMEZ — bu işlem için PIN yeniden girilmiş olmalı
      if (tazeOturum(req)) { kullanilan.add(oturumJetonu(req)); return next(); }
      const d = durum(req);
      return jsonYaz(res, 403, { success: false, pinGerekli: true, kod: 'pin-gerekli', taze: true, ...d,
        error: d.tanimli ? 'Bu onay PIN\'i yeniden ister (açık PIN oturumu bu işlem için yetmez).' : 'Bu işlem PIN ister ama PIN tanımlı değil. Sunucuda bir kez `npm run acil-pin` ile PIN belirleyin.' });
    }
    if (sistemJeton && esit(req.headers && req.headers[SISTEM_BASLIK], sistemJeton)) return next();
    if (oturumBitis(req)) { kullanilan.add(oturumJetonu(req)); return next(); }
    const d = durum(req);
    return jsonYaz(res, 403, { success: false, pinGerekli: true, kod: 'pin-gerekli', ...d,
      error: d.tanimli ? 'Bu işlem PIN ister (10 dakika geçerli).' : 'Bu işlem PIN ister ama PIN tanımlı değil. Sunucuda bir kez `npm run acil-pin` ile PIN belirleyin.' });
  }

  return { middleware, durum, tehlikeliMi, sistemJeton: () => sistemJeton, oturumSayisi: () => (temizle(), oturumlar.size) };
}

module.exports = { olustur, tehlikeliMi, tazeMi, sistemJetonuOku, sistemJetonYolu, TEHLIKELI, TAZE, TAZE_MS, CEREZ, SURE_MS, SISTEM_BASLIK, DURUM_YOLU, DOGRULA_YOLU, KAPAT_YOLU };
