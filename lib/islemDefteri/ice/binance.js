/**
 * Binance CSV içe aktarıcıları (yalnız geçmiş; Binance anahtarı istenmez) — sürüm 64.7. Başlıklar BittyTax ayrıştırıcısının
 * kayıtlarıyla doğrulandı (https://github.com/BittyTax/BittyTax — src/bittytax/conv/parsers/binance.py) ve TradesViz içe aktarım
 * şartı (https://www.tradesviz.com/brokers/Binance). Excel (XLSX) olarak inen dosya Excel'de "CSV UTF-8" olarak kaydedilir.
 *
 *  binance-spot-csv   Spot "Trade History": `Date(UTC),Pair,Side,Price,Executed,Amount,Fee` (Executed/Amount/Fee birim sonekli:
 *                     "0.001BTC", "12.5USDT", "0.0001BNB") ya da eski `Date(UTC),Market,Type,Price,Amount,Total,Fee,Fee Coin`.
 *  binance-vadeli-csv USDⓈ-M "Trade History": `Date(UTC),Symbol,Side,Price,Quantity,Amount,Fee,Fee Coin,Realized Profit,Quote Asset`
 *                     (Realized Profit ve Fee Coin her dosyada olmayabilir — adla bulunur).
 *  binance-hareket-csv USDⓈ-M "Transaction History": `Date(UTC),type,Amount,Asset,Symbol,Transaction ID` — REALIZED_PNL → kz,
 *                     COMMISSION → ucret, FUNDING_FEE → fonlama, TRANSFER/DEPOSIT/WITHDRAW → para giriş/çıkışı, INSURANCE_CLEAR →
 *                     ucret (tasfiye ücreti), COMMISSION_REBATE / REFERRAL_KICKBACK → ucret (iade); diğerleri atlanır.
 *  Kimliği olmayan satırlar: içerik özeti + aynı içerikte kaçıncı satır (aynı dosya ikinci kez yüklenirse hepsi çift sayılır).
 */
'use strict';
const MT = require('../metin');
const M = require('../model');
const O = require('./ortak');

const ADAY_SPOT = {
  zaman: ['date utc', /^date/, /^time/, 'utc time'], cift: ['pair', 'market', 'symbol'], yon: ['side', 'type'], fiyat: ['price'],
  miktar: ['executed', 'amount'], toplam: ['amount', 'total'], ucret: ['fee'], ucretBirim: ['fee coin', 'fee asset']
};
const ADAY_VADELI = {
  zaman: ['date utc', /^date/, /^time/, 'utc time'], sembol: ['symbol'], yon: ['side'], fiyat: ['price'], miktar: ['quantity', 'qty', 'executed'],
  ucret: ['fee', 'commission'], ucretBirim: ['fee coin', 'fee asset', 'commission asset'], kz: ['realized profit', 'realized pnl', 'realized profit and loss'], kot: ['quote asset'],
  id: ['trade id', 'id']
};
const ADAY_HAREKET = { zaman: ['date utc', /^date/, /^time/, 'utc time'], tur: ['type', 'income type'], tutar: ['amount', 'income'], para: ['asset'], sembol: ['symbol'], id: ['transaction id', 'tran id', 'tranid', 'id'] };

function bul(satirlar, aday, sart) {
  for (let i = 0; i < Math.min(satirlar.length, 10); i++) { const h = O.baslikHaritasi(satirlar[i], aday); if (sart(h, satirlar[i].map(MT.baslikNorm))) return { i, h }; }
  return null;
}
const spotSart = (h, n) => h.zaman != null && h.cift != null && n.some(x => x === 'pair' || x === 'market') && h.yon != null && h.fiyat != null && h.miktar != null && !n.includes('quantity');
const vadeliSart = (h, n) => h.zaman != null && h.sembol != null && h.yon != null && h.fiyat != null && n.includes('quantity');
const hareketSart = (h, n) => h.zaman != null && h.tur != null && h.tutar != null && h.para != null && n.includes('asset') && !n.includes('price');

/**
 * Zaman sütununun saat dilimi: önce başlık ("Date(UTC)"), yoksa dosya adı — yeni Binance dışa aktarımları başlığa yalnız "Time"
 * yazıp yerel saati verir, dilimi dosya adına koyar ("Binance-Futures-Trade-History-202610181328(UTC+3)-part1-of1.csv";
 * 2026-10-18 gerçek dosyada fiyatla doğrulandı: 23:15:44 = 20:15:44 UTC). İkisi de yoksa UTC sayılır ve uyarılır.
 */
function zamanOfseti(baslikHucre, dosyaAdi) {
  const b = O.baslikOfseti(baslikHucre);
  if (b != null) return { ofset: b, uyari: null };
  const d = /\((?:UTC|GMT)\s*(?:[+-]\s*\d{1,2}(?::?\d{2})?)?\)/i.exec(String(dosyaAdi || ''));
  if (d) return { ofset: O.baslikOfseti(d[0]), uyari: `Zaman sütunu saat dilimi yazmıyor; dosya adındaki ${d[0].replace(/\s+/g, '')} kullanıldı.` };
  return { ofset: 0, uyari: 'Zaman sütunu saat dilimi yazmıyor; UTC sayıldı.' };
}

function tani(metin) {
  const s = MT.csvAyristir(metin.slice(0, 20000));
  if (bul(s, ADAY_VADELI, vadeliSart)) return 'binance-vadeli-csv';
  if (bul(s, ADAY_HAREKET, hareketSart)) return 'binance-hareket-csv';
  if (bul(s, ADAY_SPOT, spotSart)) return 'binance-spot-csv';
  return null;
}

/**
 * "1.51000SATS" + bilinen varlık "1000SATS" → 1.5; bilinen varlık yoksa genel ayırma. Virgül körlemesine SİLİNMEZ: binlik mi
 * ondalık mı MT.sayi karar verir ("0,5BTC" → 0,5 · "1,234.5USDT" → 1234,5).
 */
function birimli(s, bilinen) {
  const t = String(s == null ? '' : s).replace(/\s+/g, '').trim();
  for (const v of bilinen.filter(Boolean).sort((a, b) => b.length - a.length)) {
    if (t.toUpperCase().endsWith(v) && t.length > v.length) { const n = MT.sayi(t.slice(0, -v.length)); if (n != null) return { sayi: n, birim: v }; }
  }
  return MT.birimAyir(t);
}

function spot(metin, { dosyaAdi = '' } = {}) {
  const satirlar = MT.csvAyristir(metin);
  const b = bul(satirlar, ADAY_SPOT, spotSart);
  if (!b) return { kayitlar: [], hatalar: [{ sira: 0, mesaj: 'başlık bulunamadı' }], atlanan: 0, satir: 0 };
  const { h } = b, baslik = satirlar[b.i];
  const { ofset, uyari: zamanUyari } = zamanOfseti(baslik[h.zaman], dosyaAdi);
  const sayac = new Map(), kayitlar = [], hatalar = [];
  let atlanan = 0;
  satirlar.slice(b.i + 1).forEach((r, j) => {
    const sira = b.i + j + 2;
    const zaman = O.zamanCoz(r[h.zaman], ofset);
    if (zaman == null) { hatalar.push({ sira, mesaj: `zaman okunamadı: "${r[h.zaman] || ''}"` }); return; }
    const s = M.binanceSembol(r[h.cift], false);
    const [baz, kot] = s.sembol.split('/');
    const yon = /^buy|^al/i.test(String(r[h.yon] || '')) ? 'al' : /^sell|^sat/i.test(String(r[h.yon] || '')) ? 'sat' : null;
    if (!yon) { atlanan++; return; }
    const fiyat = MT.sayi(r[h.fiyat]);
    const mk = birimli(r[h.miktar], [baz]);
    const uc = birimli(r[h.ucret], [baz, kot, 'BNB']);
    const ucretPara = (h.ucretBirim != null ? String(r[h.ucretBirim] || '').toUpperCase() : '') || uc.birim || kot;
    if (!(mk.sayi > 0) || fiyat == null) { hatalar.push({ sira, mesaj: 'miktar/fiyat okunamadı' }); return; }
    kayitlar.push({
      tur: 'islem', islemTuru: 'dolum', kaynak: 'binance-spot-csv', kaynakId: O.icerikKimligi([r[h.zaman], r[h.cift], r[h.yon], r[h.fiyat], r[h.miktar], r[h.ucret]], sayac),
      zaman, sembol: s.sembol, piyasa: 'spot', yon, miktar: Math.abs(mk.sayi), fiyat, ucret: { tutar: Math.abs(uc.sayi || 0), para: ucretPara }, gerceklesenKar: null,
      para: kot, ham: MT.hamKisalt(O.satirNesne(baslik, r))
    });
  });
  return { kayitlar, hatalar, atlanan, satir: satirlar.length - b.i - 1, bicim: 'Binance spot Trade History CSV', uyarilar: zamanUyari ? [zamanUyari] : [] };
}

function vadeli(metin, { dosyaAdi = '' } = {}) {
  const satirlar = MT.csvAyristir(metin);
  const b = bul(satirlar, ADAY_VADELI, vadeliSart);
  if (!b) return { kayitlar: [], hatalar: [{ sira: 0, mesaj: 'başlık bulunamadı' }], atlanan: 0, satir: 0 };
  const { h } = b, baslik = satirlar[b.i];
  const { ofset, uyari: zamanUyari } = zamanOfseti(baslik[h.zaman], dosyaAdi);
  const sayac = new Map(), kayitlar = [], hatalar = [];
  let atlanan = 0;
  satirlar.slice(b.i + 1).forEach((r, j) => {
    const sira = b.i + j + 2;
    const zaman = O.zamanCoz(r[h.zaman], ofset);
    if (zaman == null) { hatalar.push({ sira, mesaj: `zaman okunamadı: "${r[h.zaman] || ''}"` }); return; }
    const s = M.binanceSembol(r[h.sembol], true);
    const yon = /^buy/i.test(String(r[h.yon] || '')) ? 'al' : /^sell/i.test(String(r[h.yon] || '')) ? 'sat' : null;
    if (!yon) { atlanan++; return; }
    const [baz] = s.sembol.split('/');
    const fiyat = MT.sayi(r[h.fiyat]);
    const mk = birimli(r[h.miktar], [baz]);
    const uc = birimli(r[h.ucret], [s.para, 'BNB', 'USDT', 'USDC']);
    const kz = h.kz != null ? birimli(r[h.kz], [s.para, 'USDT', 'USDC']).sayi : null;
    if (!(mk.sayi > 0) || fiyat == null) { hatalar.push({ sira, mesaj: 'miktar/fiyat okunamadı' }); return; }
    const kot = h.kot != null && String(r[h.kot] || '').trim() ? String(r[h.kot]).trim().toUpperCase() : s.para;
    kayitlar.push({
      tur: 'islem', islemTuru: 'dolum', kaynak: 'binance-vadeli-csv',
      kaynakId: h.id != null && String(r[h.id] || '').trim() ? `t:${s.sembol}:${String(r[h.id]).trim()}` : O.icerikKimligi([r[h.zaman], r[h.sembol], r[h.yon], r[h.fiyat], r[h.miktar], r[h.ucret], h.kz != null ? r[h.kz] : ''], sayac),
      zaman, sembol: s.sembol, piyasa: 'vadeli', yon, miktar: Math.abs(mk.sayi), fiyat,
      ucret: { tutar: Math.abs(uc.sayi || 0), para: (h.ucretBirim != null ? String(r[h.ucretBirim] || '').toUpperCase() : '') || uc.birim || kot },
      gerceklesenKar: kz, para: kot, ham: MT.hamKisalt(O.satirNesne(baslik, r))
    });
  });
  const uyarilar = [];
  if (h.kz == null) uyarilar.push('Dosyada "Realized Profit" sütunu yok — vadeli kâr bu dosyadan hesaplanamaz; aynı dönemin "Transaction History" dosyasını da yükleyin (gerçekleşen kâr oradan gelir, çift sayılmaz).');
  if (zamanUyari) uyarilar.push(zamanUyari);
  return { kayitlar, hatalar, atlanan, satir: satirlar.length - b.i - 1, bicim: 'Binance USDⓈ-M Trade History CSV', uyarilar };
}

const HAREKET_ESLE = {
  REALIZED_PNL: 'kz', COMMISSION: 'ucret', FUNDING_FEE: 'fonlama', INSURANCE_CLEAR: 'ucret', LIQUIDATION_FEE: 'ucret',
  COMMISSION_REBATE: 'ucret', REFERRAL_KICKBACK: 'ucret', API_REBATE: 'ucret',
  TRANSFER: 'akis', DEPOSIT: 'akis', WITHDRAW: 'akis', INTERNAL_TRANSFER: 'akis'
};

function hareket(metin, { dosyaAdi = '' } = {}) {
  const satirlar = MT.csvAyristir(metin);
  const b = bul(satirlar, ADAY_HAREKET, hareketSart);
  if (!b) return { kayitlar: [], hatalar: [{ sira: 0, mesaj: 'başlık bulunamadı' }], atlanan: 0, satir: 0 };
  const { h } = b, baslik = satirlar[b.i];
  const { ofset, uyari: zamanUyari } = zamanOfseti(baslik[h.zaman], dosyaAdi);
  const sayac = new Map(), kayitlar = [], hatalar = [];
  let atlanan = 0;
  const atlananTur = new Map();
  satirlar.slice(b.i + 1).forEach((r, j) => {
    const sira = b.i + j + 2;
    const zaman = O.zamanCoz(r[h.zaman], ofset);
    if (zaman == null) { hatalar.push({ sira, mesaj: `zaman okunamadı: "${r[h.zaman] || ''}"` }); return; }
    const turHam = String(r[h.tur] || '').trim().toUpperCase().replace(/\s+/g, '_');
    const e = HAREKET_ESLE[turHam];
    const tutar = MT.sayi(r[h.tutar]);
    if (!e || tutar == null || tutar === 0) { atlanan++; atlananTur.set(turHam || '?', (atlananTur.get(turHam || '?') || 0) + 1); return; }
    const para = String(r[h.para] || '').trim().toUpperCase();
    const sembolHam = h.sembol != null ? String(r[h.sembol] || '').trim() : '';
    const s = sembolHam ? M.binanceSembol(sembolHam, true) : { sembol: null };
    const tur = e === 'akis' ? (tutar > 0 ? 'para-giris' : 'para-cikis') : e;
    kayitlar.push({
      tur, kaynak: 'binance-hareket-csv',
      kaynakId: h.id != null && String(r[h.id] || '').trim() ? `tx:${String(r[h.id]).trim()}:${turHam}:${para}` : O.icerikKimligi([r[h.zaman], turHam, r[h.tutar], para, sembolHam], sayac),
      zaman, sembol: e === 'akis' ? null : s.sembol, piyasa: 'vadeli', para, tutar, not: turHam, ham: MT.hamKisalt(O.satirNesne(baslik, r))
    });
  });
  const uyarilar = [];
  if (atlananTur.size) uyarilar.push(`Sayılmayan satır türleri: ${[...atlananTur.entries()].map(([t, n]) => `${t} (${n})`).join(', ')}.`);
  if (zamanUyari) uyarilar.push(zamanUyari);
  return { kayitlar, hatalar, atlanan, satir: satirlar.length - b.i - 1, bicim: 'Binance USDⓈ-M Transaction History CSV', uyarilar };
}

module.exports = { tani, spot, vadeli, hareket, birimli, HAREKET_ESLE };
