/**
 * MetaTrader raporları (sürüm 64.7) — saf.
 *  mt4-html  MT4 "Detailed Statement" (Terminal › Account History › sağ tık › Save as Detailed Report → statement.htm).
 *            https://www.metatrader4.com/en/trading-platform/help/overview/terminal/terminal_account_history
 *            "Closed Transactions" tablosu: Ticket, Open Time, Type, Size, Item, Price, S / L, T / P, Close Time, Price, Commission,
 *            Taxes, Swap, Profit. Type = buy/sell → kapanmış pozisyon; balance/credit satırı (Ticket, Time, Type, açıklama (colspan),
 *            tutar) → para girişi/çıkışı. "Open Trades" / "Working Orders" bölümleri alınmaz (kapanmamış).
 *  mt5-html  MT5 "History" raporu (Araç kutusu › Geçmiş › sağ tık › Rapor › HTML; ReportHistory-<hesap>.html, UTF-16LE + BOM).
 *            https://www.metatrader5.com/en/terminal/help/trading_advanced/history_report
 *            "Positions": Time, Position, Symbol, Type, Volume, Price, S / L, T / P, Time, Price, Commission, Swap, Profit →
 *            kapanmış pozisyon. "Deals" (Time, Deal, Symbol, Type, Direction, Volume, Price, Order, Commission, [Fee,] Swap, Profit,
 *            Balance, Comment — https://www.mql5.com/en/articles/5436): yalnız Type = balance/credit satırları → para giriş/çıkışı
 *            (işlem satırları Positions'tan gelir; ikisi birlikte sayılmaz).
 * Sütunlar başlık metninden bulunur (sıra değişse de); yinelenen "Time"/"Price" sırayla açılış → kapanış.
 * Zamanlar SUNUCU SAATİ olarak saklanır (sunucuSaati: true; hesabın "sunucu saat farkı" ayarı okumada uygulanır).
 */
'use strict';
const MT = require('../metin');
const M = require('../model');
const O = require('./ortak');

/** colspan açılmış hücre metinleri. */
function ac(satir) { const out = []; for (const c of satir) { out.push(c.metin); for (let i = 1; i < c.kapsam; i++) out.push(''); } return out; }
const tekHucre = (satir) => satir.filter(c => c.metin).length === 1 ? satir.find(c => c.metin).metin : null;

function hesapBilgi(metin) {
  // doğrusal tarayıcı (bozuk dosyada `<[^>]*>` geri izlemesi sunucuyu dondurmasın)
  const duz = MT.etiketSil(metin, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const para = (/Currency:\s*([A-Z]{3})\b/.exec(duz) || /Account:\s*\d+\s*\(\s*([A-Z]{3})\b/.exec(duz) || /Para birimi:\s*([A-Z]{3})/i.exec(duz) || [])[1] || null;
  const numara = (/Account:\s*(\d+)/.exec(duz) || [])[1] || null;
  return { para, numara: numara ? `…${numara.slice(-3)}` : null };   // hesap numarasının tamamı saklanmaz
}

function tani(metin) {
  const bas = metin.slice(0, 200000);
  if (!/<t[dr]\b/i.test(bas)) return null;
  if (/Closed Transactions/i.test(bas) && /Ticket/i.test(bas)) return 'mt4-html';
  if (/Positions/i.test(bas) && /Deals/i.test(bas) && /(Trade History Report|ReportHistory|Position)/i.test(bas)) return 'mt5-html';
  if (/Ticket/i.test(bas) && /Open Time/i.test(bas) && /Close Time/i.test(bas)) return 'mt4-html';
  return null;
}

const turNorm = (s) => String(s || '').trim().toLowerCase();

function baslikEsle(h) {
  const n = h.map(x => MT.baslikNorm(x).replace(/\s/g, ''));
  const tum = (ad) => n.reduce((l, x, i) => (x === ad ? l.concat(i) : l), []);
  return { n, tum, ilk: (...adlar) => { for (const a of adlar) { const i = n.indexOf(a); if (i >= 0) return i; } return -1; } };
}

function pozisyonKaydi(r, e, kaynak, para, sira) {
  const tip = turNorm(r[e.tip]);
  if (tip !== 'buy' && tip !== 'sell') return null;
  const acZ = O.zamanCoz(r[e.acZ]), kpZ = O.zamanCoz(r[e.kpZ]);
  const hacim = MT.sayi(r[e.hacim]), acF = MT.sayi(r[e.acF]), kpF = MT.sayi(r[e.kpF]), kar = MT.sayi(r[e.kar]);
  if (acZ == null || kpZ == null) return { hata: `satır ${sira}: zaman okunamadı` };
  if (!(hacim > 0) || acF == null || kpF == null || kar == null) return { hata: `satır ${sira}: hacim/fiyat/kâr okunamadı` };
  const s = M.mtSembol(r[e.sembol]);
  return {
    tur: 'islem', islemTuru: 'pozisyon', kaynak, kaynakId: `${kaynak === 'mt4-html' ? 'ticket' : 'pos'}:${String(r[e.no]).trim()}`, zaman: kpZ, sunucuSaati: true,
    acilisZaman: acZ, acilisFiyat: acF, sembol: s.sembol, piyasa: s.piyasa, yon: tip === 'buy' ? 'al' : 'sat', miktar: hacim, kontrat: null, fiyat: kpF,
    ucret: null, gerceklesenKar: kar, komisyon: e.kom >= 0 ? MT.sayi(r[e.kom]) || 0 : 0, vergi: e.vergi >= 0 ? MT.sayi(r[e.vergi]) || 0 : 0, swap: e.swap >= 0 ? MT.sayi(r[e.swap]) || 0 : 0,
    pozisyonId: String(r[e.no]).trim(), para, ham: MT.hamKisalt({ ticket: r[e.no], sembol: r[e.sembol], tip: r[e.tip], hacim: r[e.hacim], acilis: r[e.acZ], kapanis: r[e.kpZ], acilisFiyat: r[e.acF], kapanisFiyat: r[e.kpF], komisyon: e.kom >= 0 ? r[e.kom] : '', swap: e.swap >= 0 ? r[e.swap] : '', kar: r[e.kar] })
  };
}

function bakiyeKaydi(no, zamanMetni, tip, aciklama, tutarMetni, kaynak, para) {
  const tutar = MT.sayi(tutarMetni), zaman = O.zamanCoz(zamanMetni);
  if (tutar == null || !tutar || zaman == null) return null;
  return { tur: tutar > 0 ? 'para-giris' : 'para-cikis', kaynak, kaynakId: `${tip}:${String(no).trim()}`, zaman, sunucuSaati: true, sembol: null, para, tutar,
    not: `${tip}${aciklama ? ' — ' + String(aciklama).slice(0, 80) : ''}`, ham: MT.hamKisalt({ no, zaman: zamanMetni, tip, aciklama, tutar: tutarMetni }) };
}

function mt4(metin) {
  const satirlar = MT.htmlSatirlar(metin);
  const hb = hesapBilgi(metin);
  const para = hb.para || 'USD';
  const kayitlar = [], hatalar = [];
  let bolum = null, e = null, atlanan = 0, satir = 0;
  satirlar.forEach((ham, i) => {
    const t = tekHucre(ham);
    if (t && /^(Closed Transactions|Open Trades|Working Orders|Summary|Details)/i.test(t)) { bolum = /^Closed/i.test(t) ? 'kapali' : 'diger'; e = null; return; }
    const r = ac(ham);
    const b = baslikEsle(r);
    if (b.n.includes('ticket') && b.n.includes('opentime') && b.n.includes('profit')) {
      if (bolum === null) bolum = 'kapali';
      const fiyatlar = b.tum('price');
      e = { no: b.ilk('ticket'), acZ: b.ilk('opentime'), tip: b.ilk('type'), hacim: b.ilk('size', 'volume', 'lots'), sembol: b.ilk('item', 'symbol'), acF: fiyatlar[0], kpZ: b.ilk('closetime'),
        kpF: fiyatlar[1], kom: b.ilk('commission'), vergi: b.ilk('taxes'), swap: b.ilk('swap'), kar: b.ilk('profit') };
      return;
    }
    if (bolum !== 'kapali' || !e) return;
    const tip = turNorm(r[e.tip]);
    if (!/^\d+$/.test(String(r[e.no] || '').trim())) return;
    satir++;
    if (tip === 'balance' || tip === 'credit') {
      const dolu = ham.map(c => c.metin).filter(Boolean);
      const k = bakiyeKaydi(dolu[0], dolu[1], tip, dolu.length > 4 ? dolu.slice(3, -1).join(' ') : '', dolu[dolu.length - 1], 'mt4-html', para);
      if (k) kayitlar.push(k); else atlanan++;
      return;
    }
    const k = pozisyonKaydi(r, e, 'mt4-html', para, i + 1);
    if (!k) { atlanan++; return; }   // iptal edilmiş bekleyen emir (buy limit …) vb.
    if (k.hata) hatalar.push({ sira: i + 1, mesaj: k.hata }); else kayitlar.push(k);
  });
  const uyarilar = [];
  if (!hb.para) uyarilar.push('Raporda hesap para birimi bulunamadı; USD sayıldı.');
  if (!kayitlar.length && !hatalar.length) uyarilar.push('Kapanmış işlem bulunamadı — "Save as Detailed Report" ile kaydedilmiş ve "Account History" sekmesinde dönem "All History" seçili mi?');
  return { kayitlar, hatalar, atlanan, satir, bicim: 'MetaTrader 4 Detailed Statement (HTML)', hesap: { para: hb.para, numara: hb.numara }, uyarilar };
}

function mt5(metin) {
  const satirlar = MT.htmlSatirlar(metin);
  const hb = hesapBilgi(metin);
  const para = hb.para || 'USD';
  const kayitlar = [], hatalar = [];
  let bolum = null, e = null, d = null, atlanan = 0, satir = 0;
  satirlar.forEach((ham, i) => {
    const t = tekHucre(ham);
    if (t && /^(Positions|Orders|Deals|Open Positions|Working Orders|Summary|Results|Pozisyonlar|Emirler|İşlemler)$/i.test(t)) {
      bolum = /^(Positions|Pozisyonlar)$/i.test(t) ? 'poz' : /^(Deals|İşlemler)$/i.test(t) ? 'deal' : 'diger'; e = null; d = null; return;
    }
    const r = ac(ham);
    const b = baslikEsle(r);
    if ((bolum === 'poz' || bolum === null) && b.n.includes('position') && b.n.includes('profit') && b.n.includes('symbol') && !b.n.includes('deal')) {
      bolum = 'poz';
      const z = b.tum('time'), f = b.tum('price');
      e = { no: b.ilk('position'), acZ: z[0], kpZ: z[1], tip: b.ilk('type'), hacim: b.ilk('volume'), sembol: b.ilk('symbol'), acF: f[0], kpF: f[1], kom: b.ilk('commission'), vergi: b.ilk('fee', 'taxes'), swap: b.ilk('swap'), kar: b.ilk('profit') };
      return;
    }
    if (b.n.includes('deal') && b.n.includes('direction')) { bolum = 'deal'; d = { zaman: b.ilk('time'), no: b.ilk('deal'), tip: b.ilk('type'), kar: b.ilk('profit'), yorum: b.ilk('comment') }; return; }
    if (bolum === 'poz' && e) {
      if (!/^\d+$/.test(String(r[e.no] || '').trim())) return;
      satir++;
      const k = pozisyonKaydi(r, e, 'mt5-html', para, i + 1);
      if (!k) { atlanan++; return; }
      if (k.hata) hatalar.push({ sira: i + 1, mesaj: k.hata }); else kayitlar.push(k);
      return;
    }
    if (bolum === 'deal' && d) {
      if (!/^\d+$/.test(String(r[d.no] || '').trim())) return;
      const tip = turNorm(r[d.tip]);
      if (tip !== 'balance' && tip !== 'credit') return;   // işlem dealleri Positions'tan sayıldı
      satir++;
      const k = bakiyeKaydi(r[d.no], r[d.zaman], tip, d.yorum >= 0 ? r[d.yorum] : '', r[d.kar], 'mt5-html', para);
      if (k) kayitlar.push(k); else atlanan++;
    }
  });
  const uyarilar = [];
  if (!hb.para) uyarilar.push('Raporda hesap para birimi bulunamadı; USD sayıldı.');
  if (!kayitlar.length && !hatalar.length) uyarilar.push('Kapanmış pozisyon bulunamadı — rapor "Geçmiş" sekmesinden "Pozisyonlar" görünümüyle ve dönem "Tüm geçmiş" seçilerek mi kaydedildi?');
  return { kayitlar, hatalar, atlanan, satir, bicim: 'MetaTrader 5 History raporu (HTML)', hesap: { para: hb.para, numara: hb.numara }, uyarilar };
}

module.exports = { tani, mt4, mt5, hesapBilgi };
