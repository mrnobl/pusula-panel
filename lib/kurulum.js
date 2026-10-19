/**
 * KURULUM SİHİRBAZI — ilk açılışta kullanıcıyı eğiten adımlar ve risk onayı (PLAN-PANEL-2 §0.6, kullanıcı kararı 2026-10-19)
 * ═══════════════════════════════════════════════════════════════════════════
 * Başka kullanıcılar Pusula'yı KENDİ bilgisayarında, kendi borsa anahtarıyla çalıştırır; geliştiriciye hiçbir veri gelmez.
 * İlk açılışta panel #/kurulum'a gider (js/pages/kurulum.js). Kullanım şartları ve risk bildirimi onaylanmadan bot BAŞLATILAMAZ
 * ve hesap türü değiştirilemez (`engel` ara yazılımı: POST /api/bindirme/:ad/baslat|mod → 403).
 * Kayıt data/kurulum.json: { onay: { surum, tarih, maddeler }, tamamlandi, tarih, eski }.
 * MEVCUT kurulum (data/secrets.json zaten var) ilk okumada "eski" olarak tamamlanmış sayılır — sahibin sunucusu sihirbazı görmez.
 * 68.1 (PLAN-TASIMA F3): ilk adımda "Başka bilgisayardan taşı" (lib/tasimaApi.js). Taşınan kurulum.json onayı getirir; KOSUL_SURUM
 * değiştiyse onayliMi() false → yeniden onay. Taşıma sonrası botlar mutabakat bekler (durum.tasima).
 * Şartların metni TASLAKTIR: yayından önce bir hukukçu okumalı (PLAN-PANEL-2 §6). Metin değişirse KOSUL_SURUM artar ve
 * kullanıcı yeniden onaylar.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');

const KOSUL_SURUM = '1-taslak';
const MADDELER = [
  { id: 'tavsiye-degil', metin: 'Pusula\'nın yatırım tavsiyesi, danışmanlığı ya da portföy yönetimi hizmeti olmadığını; kararlarımı kendim verdiğimi anladım.' },
  { id: 'kayip', metin: 'Kripto ve hisse piyasalarında paramın tamamını kaybedebileceğimi; geçmiş test sonuçlarının geleceği göstermediğini anladım.' },
  { id: 'demo', metin: 'Önce demo (sanal para) hesapla başlayacağımı; gerçek hesabı ancak kendi kararımla ve kendi sorumluluğumda açacağımı anladım.' },
  { id: 'sartlar', metin: 'Kullanım şartlarını okudum ve kabul ediyorum.' },
];
const ADIMLAR = ['hosgeldin', 'riskler', 'ne-yapar', 'binance', 'telegram', 'telefon', 'acil', 'ilk-deneme'];

function olustur(o = {}) {
  const kok = o.kok || path.join(__dirname, '..');
  const dosya = o.dosya || yollar.programVeri(kok, 'kurulum.json');
  const simdi = o.simdi || (() => new Date());
  /** 68.1: taşıma sonrası "mutabakat bekliyor" işareti (lib/tasima.js bekleyenOku) — sihirbaz ve bant gösterir. */
  const tasima = typeof o.tasima === 'function' ? o.tasima : () => null;

  function oku() { try { return JSON.parse(fs.readFileSync(dosya, 'utf8')) || {}; } catch (e) { return null; } }
  function yaz(j) {
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
    const g = dosya + '.tmp';
    fs.writeFileSync(g, JSON.stringify(j, null, 2), 'utf8');
    fs.renameSync(g, dosya);
    return j;
  }
  /** Kayıt; yoksa ve bu bilgisayarda kurulu bir Pusula varsa (secrets.json) "eski" olarak tamamlanmış yazılır. */
  function kayit() {
    const j = oku();
    if (j) return j;
    if (fs.existsSync(yollar.programVeri(kok, 'secrets.json'))) {
      try { return yaz({ tamamlandi: true, eski: true, tarih: simdi().toISOString() }); } catch (e) { return { tamamlandi: true, eski: true }; }
    }
    return {};
  }

  const onayliMi = (j = kayit()) => !!(j.eski || (j.onay && j.onay.surum === KOSUL_SURUM));
  function durum() {
    const j = kayit();
    return { gerekli: !j.tamamlandi, tamamlandi: !!j.tamamlandi, eski: !!j.eski, onayli: onayliMi(j), onay: j.onay || null,
      kosulSurum: KOSUL_SURUM, maddeler: MADDELER, adimlar: ADIMLAR, tasima: (() => { try { return tasima(); } catch (e) { return null; } })() };
  }
  function onayla(b = {}) {
    const isaret = new Set(Array.isArray(b.maddeler) ? b.maddeler.map(String) : []);
    const eksik = MADDELER.filter(m => !isaret.has(m.id));
    if (eksik.length) throw Object.assign(new Error(`Onaylanmamış madde: ${eksik.map(m => m.id).join(', ')}`), { durum: 400 });
    if (b.surum !== KOSUL_SURUM) throw Object.assign(new Error('Şartların metni değişti — sayfayı yenileyip yeniden okuyun.'), { durum: 409 });
    const j = kayit();
    return yaz({ ...j, onay: { surum: KOSUL_SURUM, tarih: simdi().toISOString(), maddeler: MADDELER.map(m => m.id) } });
  }
  function tamamla() {
    const j = kayit();
    if (!onayliMi(j)) throw Object.assign(new Error('Önce riskler ve kullanım şartları onaylanmalı.'), { durum: 400 });
    return yaz({ ...j, tamamlandi: true, tarih: simdi().toISOString() });
  }

  /** Ara yazılım: onaysız kurulumda bot başlatma ve hesap türü değiştirme kapalı. */
  function engel(req, res, next) {
    if (req.method === 'POST' && /^\/api\/bindirme\/[^/]+\/(baslat|mod)$/.test(req.path) && !onayliMi()) {
      return res.status(403).json({ success: false, error: 'Önce kurulum sihirbazında riskleri ve kullanım şartlarını onaylayın (Bilgi › Kurulum sihirbazı).' });
    }
    return next();
  }

  return { durum, onayla, tamamla, onayliMi: () => onayliMi(), engel, dosya };
}

/** GET /api/kurulum · POST /api/kurulum/onay { surum, maddeler: [id] } · POST /api/kurulum/tamam */
function router(k, o = {}) {
  const express = require('express');
  const r = express.Router();
  const json = express.json({ limit: '4kb' });
  const log = o.log || (() => {});
  r.get('/api/kurulum', (req, res) => res.json({ success: true, ...k.durum() }));
  r.post('/api/kurulum/onay', json, (req, res) => {
    try { const j = k.onayla(req.body || {}); log('INFO', `🧭 Kurulum: kullanım şartları onaylandı (sürüm ${j.onay.surum})`); res.json({ success: true, ...k.durum() }); }
    catch (e) { res.status(e.durum || 500).json({ success: false, error: String(e.message).slice(0, 300) }); }
  });
  r.post('/api/kurulum/tamam', json, (req, res) => {
    try { k.tamamla(); log('INFO', '🧭 Kurulum sihirbazı tamamlandı'); res.json({ success: true, ...k.durum() }); }
    catch (e) { res.status(e.durum || 500).json({ success: false, error: String(e.message).slice(0, 300) }); }
  });
  return r;
}

module.exports = { olustur, router, KOSUL_SURUM, MADDELER, ADIMLAR };
