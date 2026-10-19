/**
 * PORTFÖY KARAR MOTORU — VARLIK KATALOĞU (L1). Tüm kullanılabilir serileri tek listede toplar.
 * Öz test: node scripts/portfoy-katalog-selftest.js
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * API
 * ═══════════════════════════════════════════════════════════════════════════
 *   katalog({ yenile? })      → { olusturma, varliklar: [Varlık], sayilar: { sinif:{}, hesap:{}, kaynak:{}, durum:{} }, disarida, kaynakHatalari }
 *        disarida: [{ kimlik, neden }] — kullanılamayan seriler (ör. < 20 gözlem); katalogda yok
 *        Kaynak başına disk önbelleği (data/portfoy/onbellek/katalog.json): kaynağın imzası (dosya mtime/boyut) değişmedikçe
 *        o kaynak yeniden taranmaz. İlk kurulum ≈ 5–10 sn (bindirme gün dizisi + 250 Yahoo dosyası + TEFAS ham), sonra < 0,1 sn.
 *        yenile: true → tüm kaynakları yeniden tara.
 *   varlik(kimlik)            → Varlık | throws ('katalog: bilinmeyen kimlik …' + benzer öneriler)
 *   varMi(kimlik)             → bool
 *   ara({ metin?, sinif?, hesap?, durum?, kaynak?, etiket?, enAzGun?, enGecBas? })  → [Varlık]
 *        metin: kimlik/ad/alt kategori içinde, büyük-küçük harf ve Türkçe harf duyarsız. enGecBas: 'YYYY-MM-DD' — bu günden
 *        önce başlayanlar. enAzGun: gunSayisi alt sınırı.
 *   ozet()                    → { toplam, sinif:{}, hesap:{}, kaynak:{}, durum:{}, sinifHesap: { sinif: { hesap: n } } }
 *   gecersizKil(kaynak?)      → bellek + disk önbelleğini düşür (indir/guncelle çağırır)
 *   SINIFLAR, HESAPLAR        → izin verilen değerler
 *
 * Varlık alanları
 *   kimlik       benzersiz: '<kaynak>:<ad>' — yahoo:QQQ, yahoo:^NDX, tefas:TI1, tr:mevduat, tr:tl-nakit, strateji:hucum,
 *                kripto:BTC, kripto:BTC-bitstamp, nakit:usd, nakit:tbill
 *   ad, sinif    sinif ∈ SINIFLAR; altKategori (TEFAS kategorisi, 'endeks ETF', 'vadeli', 'Nasdaq-100 hissesi' …)
 *   paraBirimi   serinin YEREL birimi ('USD', 'TRY', 'EUR' …). Döviz tutma serileri (EURUSD=X, JPY=X…) USD cinsinden verilir.
 *   ilkTarih, sonTarih ('YYYY-MM-DD', yerel gözlem), gunSayisi (yerel gözlem sayısı)
 *   kaynak       insan okur açıklama (dosya yolu), hesap ∈ HESAPLAR (hangi hesapta tutulabilir; 'yok' = doğrudan alınamaz)
 *   not          uyarılar ('fiyat endeksi — temettüsüz', 'vekil', 'iyimser…', 'fon stopajı düşülmedi' …)
 *   etiketler    ['temsilci:hisse', 'kapandi', 'iyimser', 'senaryolu', 'kaldiracli', 'nasdaq-100-guncel', 'spot', 'perp' …]
 *   durum        'hazir' (seri okunabilir) | 'indirilebilir' (indir.js ile; TEFAS ham aylardan AĞSIZ)
 *   ek           kaynağa özgü ayrıntı (sembol, dosya, TEFAS kategori kodu ve son büyüklük, strateji senaryoları …)
 */
const fs = require('fs');
const O = require('./ortak');
const K = require('./kaynaklar');

const SINIFLAR = ['hisse-endeks', 'hisse', 'tahvil', 'emtia', 'doviz', 'tl-nakit', 'fon', 'kripto', 'strateji', 'nakit'];
const HESAPLAR = ['binance', 'abd-araci', 'tr-banka', 'tefas', 'yok'];
const SURUM = 2;

let _katalog = null;     // { olusturma, varliklar, indeks: Map }

function diskOku() {
  try { const j = O.jsonOku(O.yollar().katalogOnbellek); return j.surum === SURUM ? j : null; } catch (e) { return null; }
}

function katalog({ yenile = false } = {}) {
  if (_katalog && !yenile) {
    // Bellekteki katalog: kaynak imzaları hâlâ tutuyor mu (ucuz kontrol, en çok 5 sn'de bir)?
    if (O.ortamAl().simdi() - _katalog._kontrol < 5000) return _katalog.disari;
    const degisti = Object.entries(K.KAYNAKLAR).some(([ad, k]) => { try { return k.imza() !== _katalog.imzalar[ad]; } catch (e) { return true; } });
    _katalog._kontrol = O.ortamAl().simdi();
    if (!degisti) return _katalog.disari;
  }
  const disk = yenile ? null : diskOku();
  const kaynaklar = {}, imzalar = {}, hatalar = {};
  let yazildi = false;
  for (const [ad, k] of Object.entries(K.KAYNAKLAR)) {
    let im = null;
    try { im = k.imza(); } catch (e) { im = 'hata:' + e.message; }
    if (disk && disk.kaynaklar[ad] && disk.kaynaklar[ad].imza === im) { kaynaklar[ad] = disk.kaynaklar[ad].varliklar; imzalar[ad] = im; continue; }
    try { kaynaklar[ad] = k.listele(); } catch (e) { kaynaklar[ad] = []; hatalar[ad] = e.message; }
    imzalar[ad] = im; yazildi = true;
  }
  const varliklar = [], disarida = [];
  const indeks = new Map();
  for (const ad of Object.keys(K.KAYNAKLAR)) for (const v of kaynaklar[ad]) {
    if (v._disarida) { disarida.push({ kimlik: v.kimlik, neden: v._disarida }); continue; }
    if (indeks.has(v.kimlik)) { hatalar['cift:' + v.kimlik] = 'aynı kimlik iki kez — ikincisi atlandı'; continue; }
    v.kaynakTur = ad;
    indeks.set(v.kimlik, v); varliklar.push(v);
  }
  const olusturma = new Date(O.ortamAl().simdi()).toISOString();
  if (yazildi || !disk) {
    const kayit = { surum: SURUM, olusturma, kaynaklar: {} };
    for (const ad of Object.keys(K.KAYNAKLAR)) if (!hatalar[ad]) kayit.kaynaklar[ad] = { imza: imzalar[ad], varliklar: kaynaklar[ad] };
    try { O.jsonYaz(O.yollar().katalogOnbellek, kayit); } catch (e) { hatalar._disk = e.message; }
  }
  const disari = { olusturma, varliklar, sayilar: sayilar(varliklar), disarida, kaynakHatalari: hatalar };
  _katalog = { disari, indeks, imzalar, _kontrol: O.ortamAl().simdi() };
  return disari;
}

function say(l, f) { const o = {}; for (const x of l) { const k = f(x); o[k] = (o[k] || 0) + 1; } return o; }
function sayilar(l) {
  const sinifHesap = {};
  for (const v of l) { (sinifHesap[v.sinif] = sinifHesap[v.sinif] || {})[v.hesap] = (sinifHesap[v.sinif][v.hesap] || 0) + 1; }
  return { toplam: l.length, sinif: say(l, v => v.sinif), hesap: say(l, v => v.hesap), kaynak: say(l, v => v.kaynakTur), durum: say(l, v => v.durum), sinifHesap };
}

const normal = s => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

function varMi(kimlik) { katalog(); return _katalog.indeks.has(kimlik); }
function varlik(kimlik) {
  katalog();
  const v = _katalog.indeks.get(kimlik);
  if (v) return v;
  const n = normal(String(kimlik).split(':').pop());
  const benzer = n ? _katalog.disari.varliklar.filter(x => normal(x.kimlik).includes(n)).slice(0, 5).map(x => x.kimlik) : [];
  throw new Error(`katalog: bilinmeyen kimlik '${kimlik}'${benzer.length ? ' — benzer: ' + benzer.join(', ') : ''}. Yahoo/TEFAS ise indir() ile eklenebilir.`);
}

function ara(f = {}) {
  const l = katalog().varliklar;
  const m = f.metin ? normal(f.metin) : null;
  return l.filter(v => (!m || normal(v.kimlik + ' ' + v.ad + ' ' + (v.altKategori || '')).includes(m))
    && (!f.sinif || (Array.isArray(f.sinif) ? f.sinif.includes(v.sinif) : v.sinif === f.sinif))
    && (!f.hesap || (Array.isArray(f.hesap) ? f.hesap.includes(v.hesap) : v.hesap === f.hesap))
    && (!f.durum || v.durum === f.durum)
    && (!f.kaynak || v.kaynakTur === f.kaynak)
    && (!f.etiket || v.etiketler.includes(f.etiket))
    && (!f.enAzGun || v.gunSayisi >= f.enAzGun)
    && (!f.enGecBas || (v.ilkTarih && v.ilkTarih <= f.enGecBas)));
}

function ozet() { return katalog().sayilar; }

function gecersizKil(kaynak) {
  _katalog = null;
  K.onbellekTemizle();
  if (kaynak == null) { try { fs.unlinkSync(O.yollar().katalogOnbellek); } catch (e) { /* yok */ } }
}

module.exports = { katalog, varlik, varMi, ara, ozet, gecersizKil, SINIFLAR, HESAPLAR };
