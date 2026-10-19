/**
 * İçe aktarıcı kaydı (sürüm 64.7): biçim tanıma + ayrıştırma. Biçimlerin kaynakları referans/ISLEM-DEFTERI-FORMATLAR.md.
 *   tani(metin, dosyaAdi) → { kaynak, bicim } | null
 *   ayristir(kaynak, metin, { dosyaAdi }) → { kayitlar, hatalar, atlanan, satir, bicim, hesap?, uyarilar }
 */
'use strict';
const OKX = require('./okx');
const BN = require('./binance');
const MT4_5 = require('./mt');

const AYRISTIRICI = {
  'okx-csv': (m, o) => OKX.ayristir(m, o),
  'binance-spot-csv': (m, o) => BN.spot(m, o),
  'binance-vadeli-csv': (m, o) => BN.vadeli(m, o),
  'binance-hareket-csv': (m, o) => BN.hareket(m, o),
  'mt4-html': (m) => MT4_5.mt4(m),
  'mt5-html': (m) => MT4_5.mt5(m)
};

function tani(metin, dosyaAdi = '') {
  const m = String(metin || '');
  if (/^\s*PK/.test(m.slice(0, 4))) return null;   // XLSX (zip) — CSV olarak kaydedilmeli
  const html = /<html|<table|<tr\b/i.test(m.slice(0, 5000)) || /\.html?$/i.test(dosyaAdi);
  if (html) { const k = MT4_5.tani(m); return k ? { kaynak: k, bicim: k } : null; }
  const b = BN.tani(m);
  if (b) return { kaynak: b, bicim: b };
  if (OKX.tani(m)) return { kaynak: 'okx-csv', bicim: 'okx-csv' };
  return null;
}

function ayristir(kaynak, metin, ops = {}) {
  const f = AYRISTIRICI[kaynak];
  if (!f) throw Object.assign(new Error(`bu kaynak için içe aktarıcı yok: ${kaynak}`), { kod: 400 });
  return f(String(metin || ''), ops);
}

module.exports = { tani, ayristir, KAYNAKLAR: Object.keys(AYRISTIRICI) };
