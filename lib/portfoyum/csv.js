/**
 * PORTFÖYÜM — CSV DIŞA / İÇE AKTARIM (sürüm 60.8)
 * ═══════════════════════════════════════════════════════════════════════════
 * Sütunlar (başlık satırı zorunlu, sıra serbest; ayraç ';' ya da ',' — ilk satırdan anlaşılır; ';' ayraçta ondalık virgül olur):
 *   tarih;islem;hesap;varlik;adet;fiyat;tutar;para;ucret;vergi;hedefHesap;oran;birimMaliyet;gunIciSira;acilisSonrasi;kaynakKayit;not
 *   hesap / hedefHesap: hesap kimliği (h3) ya da hesap ADI; varlik: kimlik (v5) ya da SEMBOL.
 * İçe aktarım iki adımlı: önizleme (her satır çözülür + bütün dosya mevcut kayıtlarla birlikte denetlenir — hiçbir şey
 * yazılmaz) → onay (önizlemede hata yoksa hepsi TEK atomik yazımla eklenir; biri bile hatalıysa hiçbiri).
 * Dışa aktarımda formül enjeksiyonu önlenir: = + - @ | (tam genişlikli ＝＋－＠ dahil; baştaki boşluktan sonra da) ile başlayan
 * METİN hücrenin başına ' eklenir (sayılar değil). Sayılar üstel gösterimsiz düz ondalık yazılır (1.5e-7 → 0,00000015).
 * İçe aktarımda: "durum" sütunu "iptal" olan satırlar (kendi dışa aktarımımızdaki iptal edilmiş işlemler) ATLANIR; mevcut bir
 * işlemle (ya da dosyadaki önceki satırla) aynı tarih + tür + hesap + varlık + adet/tutar → "mükerrer olabilir" uyarısı.
 * ',' ayraçlı CSV'de nokta her zaman ondalıktır; ';' ayraçlıda Türkçe kural (model.js sayiCoz: "2.000" belirsiz → hata).
 */
'use strict';
const M = require('./model');

const MUH = require('./muhasebe');

// 61.1 (Ö10): gunIciSira (aynı gün sırası, boş = varsayılan), acilisSonrasi (1 = açılıştan sonra, 0 = açılışa dahil, boş = açılış günü
// değil / elle varsayılan), kaynakKayit (tasarimci | boş = elle). Bu sütunları taşımayan ESKİ dosyalar aynen okunur.
const SUTUNLAR = ['id', 'tarih', 'islem', 'hesap', 'varlik', 'adet', 'fiyat', 'tutar', 'para', 'ucret', 'vergi', 'hedefHesap', 'ulasanTutar', 'oran', 'birimMaliyet', 'gunIciSira', 'acilisSonrasi', 'kaynakKayit', 'not', 'durum'];
const ICE_SUTUNLAR = ['tarih', 'islem', 'hesap', 'varlik', 'adet', 'fiyat', 'tutar', 'para', 'ucret', 'vergi', 'hedefHesap', 'ulasanTutar', 'oran', 'birimMaliyet', 'gunIciSira', 'acilisSonrasi', 'kaynakKayit', 'not'];
const EN_COK_SATIR = 5000;

/** Üstel gösterimsiz düz ondalık ("1.5e-7" → "0.00000015"). */
function duzSayi(x) {
  if (!Number.isFinite(x)) return '';
  return x.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
}
const FORMUL = /^[\s\u00a0]*[=+\-@|\uFF1D\uFF0B\uFF0D\uFF20]|^[\t\r]/;
function hucre(x, ayrac) {
  if (x == null) return '';
  let s = typeof x === 'number' ? (ayrac === ';' ? duzSayi(x).replace('.', ',') : duzSayi(x)) : String(x);
  if (typeof x !== 'number' && FORMUL.test(s)) s = "'" + s;
  if (s.includes(ayrac) || /["\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** İşlemler → CSV metni (Excel için UTF-8 BOM'lu döner; çağıran ekler). */
function disaAktar(D, islemler, ops = {}) {
  const ayrac = ops.ayrac || ';';
  const hAd = (id) => { const h = id && D.hesaplar.get(id); return h ? h.ad : id || ''; };
  const vSem = (id) => { const v = id && D.varliklar.get(id); return v ? v.sembol : id || ''; };
  const satirlar = [SUTUNLAR.join(ayrac)];
  // Etkin açılış anlamı ve gün içi sıra muhasebeyle aynı kaynaktan (eski tasarımcı kayıtlarının türetilmiş sırası dahil).
  const etkin = new Map((D.islemler || []).map(x => [x.id, x]));
  const sonra = new Set([...MUH.acilisSonrasiKumesi({ islemler: D.islemler || [], varliklar: D.varliklar })].map(x => x.id));
  const acilisGun = new Set((D.islemler || []).filter(x => x.islem === 'acilis').map(x => x.hesap + '|' + x.tarih));
  for (const x of islemler) {
    const e = etkin.get(x.id) || x;
    const gunAcilis = acilisGun.has(x.hesap + '|' + x.tarih) || (x.hedefHesap && acilisGun.has(x.hedefHesap + '|' + x.tarih));
    const as = x.islem === 'acilis' ? '' : sonra.has(x.id) || (!etkin.has(x.id) && x.acilisSonrasi === true) ? '1' : gunAcilis && x.kaynakKayit === 'tasarimci' ? '0' : '';
    const s = { ...x, hesap: hAd(x.hesap), hedefHesap: hAd(x.hedefHesap), varlik: vSem(x.varlik), durum: x._iptal ? 'iptal' : '',
      gunIciSira: Number.isInteger(e.gunIciSira) ? e.gunIciSira : '', acilisSonrasi: as, kaynakKayit: x.kaynakKayit || '' };
    satirlar.push(SUTUNLAR.map(a => hucre(s[a], ayrac)).join(ayrac));
  }
  return satirlar.join('\r\n') + '\r\n';
}

/** RFC 4180 ayrıştırıcı (tırnaklı alan, "" kaçışı, satır sonu içinde). */
function ayristir(metin, ayrac) {
  const satirlar = [];
  let alan = '', satir = [], tirnak = false;
  const s = String(metin || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (tirnak) {
      if (c === '"') { if (s[i + 1] === '"') { alan += '"'; i++; } else tirnak = false; } else alan += c;
    } else if (c === '"' && alan === '') tirnak = true;
    else if (c === ayrac) { satir.push(alan); alan = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; satir.push(alan); satirlar.push(satir); satir = []; alan = ''; }
    else alan += c;
  }
  if (alan !== '' || satir.length) { satir.push(alan); satirlar.push(satir); }
  return satirlar.filter(r => r.some(x => String(x).trim() !== ''));
}

/**
 * CSV → işlem kayıtları (çözülmüş başvurularla) + satır hataları. Bütün-dosya denetimi depo.ekle({ yazma: false }) ile yapılır.
 * Döndürür: { satirlar: [{ no, ham, kayit?, hatalar: [] }], ayrac, sutunlar, hata? }
 */
function iceAktarCoz(metin, D) {
  const ilk = String(metin || '').replace(/^﻿/, '').split(/\r?\n/)[0] || '';
  const ayrac = (ilk.match(/;/g) || []).length >= (ilk.match(/,/g) || []).length ? ';' : ',';
  const tablo = ayristir(metin, ayrac);
  if (!tablo.length) return { satirlar: [], ayrac, sutunlar: [], hata: 'CSV boş' };
  const baslik = tablo[0].map(x => String(x).trim().replace(/^'/, ''));
  const bilinmeyen = baslik.filter(b => b && !SUTUNLAR.includes(b));
  if (!baslik.includes('tarih') || !baslik.includes('islem')) return { satirlar: [], ayrac, sutunlar: baslik, hata: `başlık satırında 'tarih' ve 'islem' sütunları olmalı (sütunlar: ${ICE_SUTUNLAR.join(ayrac)})` };
  if (tablo.length - 1 > EN_COK_SATIR) return { satirlar: [], ayrac, sutunlar: baslik, hata: `en çok ${EN_COK_SATIR} satır` };
  const hesapCoz = (x) => {
    const s = String(x || '').trim(); if (!s) return { id: '' };
    if (D.hesaplar.has(s)) return { id: s };
    const l = [...D.hesaplar.values()].filter(h => h.ad.toLocaleLowerCase('tr-TR') === s.toLocaleLowerCase('tr-TR'));
    if (l.length === 1) return { id: l[0].id };
    return { hata: l.length > 1 ? `hesap adı '${s}' birden çok hesapta — kimlik (h…) yazın` : `bilinmeyen hesap '${s}'` };
  };
  const varlikCoz = (x) => {
    const s = String(x || '').trim(); if (!s) return { id: '' };
    if (D.varliklar.has(s)) return { id: s };
    const l = [...D.varliklar.values()].filter(v => v.sembol === s.toUpperCase());
    if (l.length === 1) return { id: l[0].id };
    return { hata: l.length > 1 ? `sembol '${s}' birden çok varlıkta (farklı para birimi) — kimlik (v…) yazın` : `bilinmeyen varlık '${s}' (önce Yönetim'den varlığı ekleyin)` };
  };
  const satirlar = [];
  // Mükerrer denetimi: mevcut (iptal edilmemiş) işlemler + dosyadaki önceki satırlar.
  const imza = (x) => [x.tarih, x.islem, x.hesap || '', x.hedefHesap || '', x.varlik || '', x.varlik ? '' : (x.para || ''), x.adet != null ? +x.adet : '', x.tutar != null ? +x.tutar : ''].join('|');
  const mevcut = new Map();
  for (const x of D.islemler || []) mevcut.set(imza(x), `mevcut kayıt ${x.id}`);
  for (let i = 1; i < tablo.length; i++) {
    const r = {};
    let durum = '';
    baslik.forEach((b, j) => {
      const deger = String(tablo[i][j] == null ? '' : tablo[i][j]);
      if (b === 'durum') durum = deger.trim().toLowerCase();
      else if (b && b !== 'id') r[b] = (b === 'not' ? deger : deger.trim()).replace(/^'(?=[\s\u00a0]*[=+\-@|\uFF1D\uFF0B\uFF0D\uFF20])/, '').trim();
    });
    if (durum === 'iptal') { satirlar.push({ no: i + 1, ham: r, kayit: null, hatalar: [], atla: 'iptal edilmiş satır (durum = iptal) — atlandı' }); continue; }
    const hatalar = [];
    const h = hesapCoz(r.hesap), hh = hesapCoz(r.hedefHesap), v = varlikCoz(r.varlik);
    for (const x of [h, hh, v]) if (x.hata) hatalar.push(x.hata);
    const ham = { ...r, hesap: h.id || r.hesap, hedefHesap: hh.id || r.hedefHesap, varlik: v.id || r.varlik };
    if (ayrac === ',') for (const a of ['adet', 'fiyat', 'tutar', 'ucret', 'vergi', 'oran', 'birimMaliyet', 'ulasanTutar']) if (ham[a] && /,/.test(ham[a])) hatalar.push(`${a}: ',' ayraçlı CSV'de ondalık nokta kullanın`);
    const kayit = M.islemNormalle(ham, ayrac === ',' ? { nokta: 'ondalik' } : {});
    hatalar.push(...M.bicimDenetle(kayit));
    const uyarilar = [];
    if (!hatalar.length) {
      const k = imza(kayit);
      if (mevcut.has(k)) uyarilar.push(`mükerrer olabilir: ${mevcut.get(k)} ile aynı (tarih, tür, hesap, varlık, adet/tutar)`);
      else mevcut.set(k, `satır ${i + 1}`);
    }
    satirlar.push({ no: i + 1, ham: r, kayit: hatalar.length ? null : kayit, hatalar, uyarilar });
  }
  return { satirlar, ayrac, sutunlar: baslik, bilinmeyenSutunlar: bilinmeyen };
}

module.exports = { SUTUNLAR, ICE_SUTUNLAR, EN_COK_SATIR, disaAktar, ayristir, iceAktarCoz, hucre, duzSayi };
