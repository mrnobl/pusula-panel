/**
 * OKX "Trading history" CSV (Assets → Order center → Order history → Download → Report type: Trading history) — sürüm 64.7.
 * Belgelenen sütunlar (https://www.okx.com/en-us/help/how-to-check-download-order-history-position-history-and-trading-history):
 *   User ID, Order ID, Time, Trade Type, Symbol, Action, Amount, Trading Unit, Filled Price, PnL, Fee, Fee Unit, Position Change,
 *   Position Balance, Balance Change, Balance, Balance Unit.
 * Ham başlık satırı (büyük/küçük harf, baştaki "id" sütunu, "Time(UTC+8)" gibi saat dilimi) resmî olarak yayımlanmadığı için
 * sütunlar ADLA bulunur, sırayla değil (2024'te OKX dosyanın boyutunu "emir"den "dolum"a çevirdi — eski dosyalar farklı olabilir).
 * Türkçe arayüz başlıkları belgelenmedi; yaygın karşılıklar (Zaman, Sembol, İşlem, Miktar, Fiyat, Ücret) yedek aday olarak var.
 * Saat: başlık "UTC±n" yazıyorsa ona göre; yazmıyorsa UTC sayılır (önizlemede aralık görünür — tutmuyorsa kılavuza bakın).
 * Ücret işareti: dosyada eksi ücret varsa OKX kuralı (eksi = ödenen, artı = iade); hepsi artıysa artı = ödenen.
 * Vadeli miktar birimi: API (fillSz) sözleşme adedi verir; dosyanın "Trading Unit"i "Cont" değilse (coin / USDT) miktar farklı
 * birimdedir → önizlemede uyarı (dosya ↔ API çift denetimi vadelide miktara bakmaz; kâr vadelide kaynağın PnL'inden gelir).
 */
'use strict';
const MT = require('../metin');
const M = require('../model');
const O = require('./ortak');

const ADAY = {
  id: ['id', 'trade id', 'bill id', 'fill id'],
  emir: ['order id', 'emir no', 'emir kimliği'],
  zaman: ['time', /^time /, 'fill time', /^filled time/, 'zaman', /^tarih/, /^date/],
  tur: ['trade type', 'instrument type', 'business line', 'işlem türü', 'ürün türü'],
  sembol: ['symbol', 'instrument', 'instrument name', 'sembol', 'enstrüman'],
  aksiyon: ['action', 'side', 'işlem', 'yön'],
  miktar: ['amount', 'filled amount', 'fill size', 'miktar', 'gerçekleşen miktar'],
  birim: ['trading unit', 'amount unit', 'birim', 'işlem birimi'],
  fiyat: ['filled price', 'fill price', 'avg filled price', 'gerçekleşen fiyat', 'fiyat'],
  pnl: ['pnl', 'realized pnl', 'kâr zarar', 'kar zarar', 'k z'],
  ucret: ['fee', 'ücret', 'komisyon'],
  ucretBirim: ['fee unit', 'fee currency', 'ücret birimi'],
  pozDegisim: ['position change'],
  bakiyeDegisim: ['balance change'],
  bakiyeBirim: ['balance unit']
};

/**
 * Saat dilimi (2026-10-18 gerçek dosya): başlık yazmıyor; dosyanın İLK satırı hesap bilgisi
 * "UID:…,Account Type:Main,Time Zone:UTC-3" ve dosya adı "OKX Trading History_2024-10-01~2026-10-16~UTC-3~<özet>.csv".
 * Hesabın OKX saat dilimi ayarıdır (fonlama satırları 05/13/21:00 = UTC 08/16/00:00 ile doğrulandı). Sıra: başlık → üst bilgi → dosya adı.
 */
function zamanOfseti(satirlar, basSira, baslikHucre, dosyaAdi) {
  const b = O.baslikOfseti(baslikHucre);
  if (b != null) return { ofset: b, kaynak: null };
  for (let i = 0; i < basSira; i++) {
    const m = /time\s*zone\s*:\s*((?:UTC|GMT)\s*(?:[+-]\s*\d{1,2}(?::?\d{2})?)?)/i.exec(satirlar[i].join(','));
    if (m) return { ofset: O.baslikOfseti(m[1]), kaynak: `dosyanın üst bilgisindeki ${m[1].replace(/\s+/g, '')}` };
  }
  const d = /[~(_\s]((?:UTC|GMT)[+-]\d{1,2}(?::?\d{2})?)[~)_.\s]/i.exec(String(dosyaAdi || ''));
  if (d) return { ofset: O.baslikOfseti(d[1]), kaynak: `dosya adındaki ${d[1]}` };
  return { ofset: null, kaynak: null };
}

// Dolum olmayan satırlar (Action): fonlama ve işlem hesabına aktarım alınır; teminat ekleme/çıkarma (hesap içi) atlanır.
const FONLAMA_RE = /^funding fee (?:income|expense)$/i;
const AKTARIM_RE = /^transfer (?:in|out)$/i;

function basliklariBul(satirlar) {
  for (let i = 0; i < Math.min(satirlar.length, 15); i++) {
    const h = O.baslikHaritasi(satirlar[i], ADAY);
    if (h.zaman != null && h.sembol != null && h.aksiyon != null && h.fiyat != null && h.miktar != null) return { i, h };
  }
  return null;
}

function tani(metin) {
  if (!/,|;|\t/.test(metin.slice(0, 2000))) return false;
  const s = MT.csvAyristir(metin.slice(0, 20000));
  const b = basliklariBul(s);
  if (!b) return false;
  const norm = s[b.i].map(MT.baslikNorm);
  return norm.includes('trading unit') || norm.includes('fee unit') || norm.some(x => /^trade type$|^balance unit$/.test(x)) || /-SWAP|-USDT\b/.test(metin.slice(0, 20000));
}

function aksiyonCoz(a) {
  const s = String(a || '').toLowerCase();
  const yonP = /long/.test(s) ? 'long' : /short/.test(s) ? 'short' : null;
  if (/close long|open short|kapat.*long|aç.*short|\bsell\b|\bsat/.test(s)) return { yon: 'sat', pozisyonYonu: yonP };
  if (/open long|close short|aç.*long|kapat.*short|\bbuy\b|\bal/.test(s)) return { yon: 'al', pozisyonYonu: yonP };
  return null;
}

function ayristir(metin, { dosyaAdi = '' } = {}) {
  // OKX her satırın başına BOM koyabiliyor ("﻿4011…") — kimlik ve hücreler BOM'suz okunur
  const satirlar = MT.csvAyristir(metin).map(r => r.map(x => (typeof x === 'string' ? x.replace(/^﻿/, '') : x)));
  const b = basliklariBul(satirlar);
  if (!b) return { kayitlar: [], hatalar: [{ sira: 0, mesaj: 'başlık satırı bulunamadı' }], atlanan: 0, satir: 0 };
  const { h } = b;
  const baslik = satirlar[b.i];
  const { ofset, kaynak: ofsetKaynak } = zamanOfseti(satirlar, b.i, baslik[h.zaman], dosyaAdi);
  const govde = satirlar.slice(b.i + 1);
  const eksiUcretVar = govde.some(r => (MT.sayi(r[h.ucret]) || 0) < 0);
  const sayac = new Map();
  const kayitlar = [], hatalar = [];
  let atlanan = 0;
  const atlananTur = new Map();
  const vadeliBirim = new Map();   // sözleşme dışı birimdeki vadeli satırlar: birim → adet
  govde.forEach((r, j) => {
    const sira = b.i + j + 2;
    const zaman = O.zamanCoz(r[h.zaman], ofset || 0);
    const aksiyonHam = String(r[h.aksiyon] || '').trim();
    if (zaman == null) { hatalar.push({ sira, mesaj: `zaman okunamadı: "${r[h.zaman] || ''}"` }); return; }
    const idHam = h.id != null ? String(r[h.id] || '').trim() : '';
    if (FONLAMA_RE.test(aksiyonHam) || AKTARIM_RE.test(aksiyonHam)) {
      // Kimlik `bill:<id>`: OKX API (okxApi.js) fonlama/aktarımı bills-archive billId ile yazar; dosyanın "id"si aynı numara
      // sayıldı (DOĞRULANMADI — iki kaynağın aynı satırı farklı numarayla verdiği görülürse fonlama çift sayılır).
      const fon = FONLAMA_RE.test(aksiyonHam);
      const tutar = fon ? (MT.sayi(r[h.pnl]) ?? MT.sayi(r[h.pozDegisim])) : MT.sayi(r[h.bakiyeDegisim]);
      if (tutar == null || tutar === 0) { atlanan++; atlananTur.set(aksiyonHam, (atlananTur.get(aksiyonHam) || 0) + 1); return; }
      const para = (h.bakiyeBirim != null ? String(r[h.bakiyeBirim] || '') : '').toUpperCase() || (h.ucretBirim != null ? String(r[h.ucretBirim] || '') : '').toUpperCase() || 'USDT';
      const hamSembol = String(r[h.sembol] || '').trim();
      const kid = idHam ? `bill:${idHam}` : O.icerikKimligi([r[h.zaman], hamSembol, aksiyonHam, fon ? r[h.pnl] : r[h.bakiyeDegisim]], sayac);
      kayitlar.push({
        tur: fon ? 'fonlama' : (tutar > 0 ? 'para-giris' : 'para-cikis'), kaynak: 'okx-csv', kaynakId: kid, zaman,
        sembol: fon && /-/.test(hamSembol) ? M.okxSembol(hamSembol.split(/\s+/)[0], '').sembol : null, piyasa: 'vadeli', para, tutar,
        not: fon ? aksiyonHam : 'işlem hesabına aktarım', ham: MT.hamKisalt(O.satirNesne(baslik, r))
      });
      return;
    }
    const ak = aksiyonCoz(aksiyonHam);
    if (!ak) { atlanan++; atlananTur.set(aksiyonHam || '?', (atlananTur.get(aksiyonHam || '?') || 0) + 1); return; }
    const turMetin = h.tur != null ? String(r[h.tur] || '') : '';
    const hamSembol = String(r[h.sembol] || '').trim();
    const vadeliMi = /swap|perp|future|vadeli|sürekli|margin|marjin/i.test(turMetin) || /-SWAP$|-\d{6}$/i.test(hamSembol) || /perpetual|swap/i.test(hamSembol);
    let s;
    if (/-/.test(hamSembol)) s = M.okxSembol(hamSembol.split(/\s+/)[0], /margin|marjin/i.test(turMetin) ? 'MARGIN' : vadeliMi && !/-SWAP$|-\d{6}$/i.test(hamSembol) ? 'SWAP' : '');
    else s = M.binanceSembol(hamSembol.split(/\s+/)[0], vadeliMi);
    if (vadeliMi && s.piyasa === 'spot') { const [bz, q] = s.sembol.split('/'); s = { sembol: `${bz}/${q}:${q}`, piyasa: 'vadeli', para: q }; }
    const fiyat = MT.sayi(r[h.fiyat]);
    let miktar = Math.abs(MT.sayi(r[h.miktar]) || 0);
    const birim = h.birim != null ? String(r[h.birim] || '').toUpperCase() : '';
    const [baz, kot] = s.sembol.split(':')[0].split('/');
    if (birim && kot && birim === kot && fiyat > 0 && s.piyasa === 'spot') miktar = miktar / fiyat;   // tutar kotasyon cinsinden yazılmışsa
    if (!(miktar > 0) || fiyat == null) { hatalar.push({ sira, mesaj: 'miktar/fiyat okunamadı' }); return; }
    if (s.piyasa === 'vadeli' && !/^cont/i.test(birim)) vadeliBirim.set(birim || '(birim yok)', (vadeliBirim.get(birim || '(birim yok)') || 0) + 1);
    const ucretHam = h.ucret != null ? MT.sayi(r[h.ucret]) || 0 : 0;
    const ucret = eksiUcretVar ? -ucretHam : Math.abs(ucretHam);
    const pnl = h.pnl != null ? MT.sayi(r[h.pnl]) : null;
    const kid = h.id != null && String(r[h.id] || '').trim() ? `csv:${String(r[h.id]).trim()}`
      : O.icerikKimligi([h.emir != null ? r[h.emir] : '', r[h.zaman], hamSembol, r[h.aksiyon], r[h.miktar], r[h.fiyat], h.ucret != null ? r[h.ucret] : ''], sayac);
    kayitlar.push({
      tur: 'islem', islemTuru: 'dolum', kaynak: 'okx-csv', kaynakId: kid, zaman, sembol: s.sembol, piyasa: s.piyasa, yon: ak.yon, pozisyonYonu: ak.pozisyonYonu,
      miktar, fiyat, kontrat: /cont/i.test(birim) ? 'sözleşme adedi' : null,
      ucret: { tutar: ucret, para: (h.ucretBirim != null ? String(r[h.ucretBirim] || '') : '').toUpperCase() || s.para || kot },
      gerceklesenKar: s.piyasa === 'vadeli' ? pnl : null, pozisyonId: null, para: s.para || kot,
      ham: MT.hamKisalt(O.satirNesne(baslik, r))
    });
    void baz;
  });
  const uyarilar = [];
  if (vadeliBirim.size) uyarilar.push(`Vadeli satırların miktar birimi sözleşme (Cont) değil: ${[...vadeliBirim.entries()].map(([b, n]) => `${b} (${n})`).join(', ')}. Miktarlar OKX eşitlemesindeki sözleşme adedinden farklı birimde görünür; dosya ile eşitlemenin aynı dolumu fiyat, zaman ve kârdan eşlenir (miktara bakılmaz). Kâr hesabı etkilenmez.`);
  if (atlananTur.size) uyarilar.push(`Sayılmayan satır türleri: ${[...atlananTur.entries()].map(([t, n]) => `${t} (${n})`).join(', ')}.`);
  if (ofsetKaynak) uyarilar.push(`Zaman sütunu saat dilimi yazmıyor; ${ofsetKaynak} kullanıldı.`);
  else if (ofset == null) uyarilar.push('Dosyanın zaman sütunu saat dilimi yazmıyor; saatler UTC sayıldı (OKX indirmesinde hesap saat dilimi kullanıldıysa önizlemedeki aralığa bakın).');
  return { kayitlar, hatalar, atlanan, satir: govde.length, bicim: 'OKX Trading history CSV', uyarilar };
}

module.exports = { tani, ayristir, aksiyonCoz };
