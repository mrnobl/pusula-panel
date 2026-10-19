/**
 * LİSTE DEĞERLENDİRMESİ — her listenin başlangıcından bugüne seçilenler vs elenenler; BTC ve piyasa medyanı kıyası.
 * BETİMLEYİCİDİR: tek liste × tek dönem şanstan ayrılamaz; hüküm değildir (ANALIZ-TEMMUZ-LISTESI.md §6).
 *
 * Yöntem (scripts/temmuz-listesi-analiz.js ile aynı):
 *   giriş = başlangıç gününün AÇILIŞI (UTC) — liste o gün girildiyse ve geriye dönük değilse GİRİŞ ANINDA KAYDEDİLEN fiyat;
 *   son   = şimdiki fiyat (aynı kaynak); getiri = son / giriş − 1; ücret/kayma/funding yok.
 *   piyasa = başlangıç günü Binance USDⓈ-M'de işlem gören COIN perp'leri (BTC/ETH/stabil/TradFi hariç, sonradan çıkanlar dahil).
 *   Uç değer: evrendeki birkaç coin %1 000+ yapabilir → ortalama yanında KIRPILMIŞ ortalama (her getiri piyasanın %1–%99
 *   yüzdeliklerine kırpılır; piyasa yoksa grubun kendi %10–%90'ına) ve MEDYAN raporlanır; yorum kırpılmış/medyana dayanır.
 */
'use strict';
const { gunStr, medyan, ortalama, yuzdelikSinir, kirpikOrtalama, jsonOku } = require('./ortak');
const { KAYNAKLAR } = require('./kaynaklar');
const { AGLAR } = require('./aglar');

function kaynakCoz(f) {
  if (!f || !f.kaynak || !f.sembol || f.kaynak === 'dexscreener') return null;
  const [borsa, piyasa] = String(f.kaynak).split('-');
  return borsa && piyasa ? { borsa, piyasa, sembol: f.sembol } : null;
}

function grupOzeti(getiriler, sinir) {
  const g = getiriler.filter(Number.isFinite);
  if (!g.length) return { n: 0, ortalama: null, kirpik: null, medyan: null, pozitif: 0 };
  const s = sinir || yuzdelikSinir(g, 0.1, 0.9);
  return { n: g.length, ortalama: ortalama(g), kirpik: s ? kirpikOrtalama(g, s[0], s[1]) : null, medyan: medyan(g), pozitif: g.filter(x => x > 0).length, kirpikTaban: sinir ? 'piyasa %1–%99' : 'grubun %10–%90\'ı' };
}

/**
 * @param liste etkin liste (Listeler.etkin())
 * @param o { bas?: 'YYYY-MM-DD', fiyat: FiyatKaynagi, piyasa: Piyasa, http: Istemci, piyasaAnlikOku(no) → içerik|null, simdi }
 */
async function degerlendir(liste, o) {
  const simdi = o.simdi || (() => Date.now());
  const girisGunu = String(liste.girisZamani || '').slice(0, 10);
  const bas = o.bas || liste.tarih;
  const bugun = gunStr(simdi());
  if (bas > bugun) throw new Error('başlangıç bugünden sonra olamaz');
  // Kayıtlı giriş fiyatı yalnız başlangıç = giriş günü ve liste geriye dönük değilse kullanılır (aksi hâlde o günün açılışı).
  const kayitliFiyat = bas === girisGunu && !liste.geriyeDonuk;
  const notlar = [];
  const coinler = [];
  for (const c of liste.coinler || []) {
    const satir = { sembol: c.sembol, durum: c.durum, not: c.not || null, ag: c.ag || null, kaynak: null, giris: null, son: null, getiri: null, hata: null };
    try {
      let k = kaynakCoz(c.fiyat);
      if (!k && !(c.fiyat && c.fiyat.kaynak === 'dexscreener')) k = c.fiyatKaynagi || await o.fiyat.cozumle(c.sembol);
      if (kayitliFiyat && c.fiyat && c.fiyat.deger > 0) {
        satir.giris = c.fiyat.deger; satir.kaynak = c.fiyat.kaynak;
      } else if (k) {
        const a = await o.fiyat.gunAcilis(k, bas);
        if (a.ok) { satir.giris = a.fiyat; satir.kaynak = a.kaynak; } else satir.hata = `giriş fiyatı: ${a.hata}`;
      } else if (c.fiyat && c.fiyat.kaynak === 'dexscreener') satir.hata = 'yalnız DEX fiyatı var; geçmiş günün açılışı ücretsiz kaynaktan alınamıyor (başlangıç = giriş günü seçin)';
      else satir.hata = 'fiyat kaynağı bulunamadı';
      // Son fiyat: aynı kaynak
      if (satir.giris > 0) {
        if (satir.kaynak === 'dexscreener' && c.ag && c.sozlesme && AGLAR[c.ag] && AGLAR[c.ag].dex) {
          const d = await KAYNAKLAR.dexscreener.getir({ ag: c.ag, sozlesme: c.sozlesme }, { http: o.http });
          if (d.durum === 'ok' && d.ham.fiyat > 0) satir.son = d.ham.fiyat; else satir.hata = `son fiyat: ${d.neden || d.hata}`;
        } else {
          const kk = k || kaynakCoz({ kaynak: satir.kaynak, sembol: c.fiyat && c.fiyat.sembol });
          const a = kk ? await o.fiyat.anlik(kk) : { ok: false, hata: 'kaynak yok' };
          if (a.ok) satir.son = a.fiyat; else satir.hata = `son fiyat: ${a.hata} (listeden çıkmış olabilir)`;
        }
      }
      if (satir.giris > 0 && satir.son > 0) satir.getiri = satir.son / satir.giris - 1;
    } catch (e) {
      if (e && e.constructor && e.constructor.name === 'KotaHatasi') throw e;
      satir.hata = String(e.message || e).slice(0, 160);
    }
    coinler.push(satir);
  }

  // BTC
  let btc = { giris: null, son: null, getiri: null, hata: null };
  try {
    const k = { borsa: 'binance', piyasa: 'spot', sembol: 'BTCUSDT' };
    if (kayitliFiyat && liste.kiyas && liste.kiyas.BTC && liste.kiyas.BTC.deger > 0) btc.giris = liste.kiyas.BTC.deger;
    else { const a = await o.fiyat.gunAcilis(k, bas); if (a.ok) btc.giris = a.fiyat; else btc.hata = a.hata; }
    const s = await o.fiyat.anlik(k);
    if (s.ok) btc.son = s.fiyat; else btc.hata = s.hata;
    if (btc.giris > 0 && btc.son > 0) btc.getiri = btc.son / btc.giris - 1;
  } catch (e) { if (e && e.constructor && e.constructor.name === 'KotaHatasi') throw e; btc.hata = e.message; }

  // Piyasa
  let piyasa = { durum: 'hesaplanmadi', gun: bas };
  let girisFiyatlari = null, kaynakNotu = null;
  if (kayitliFiyat && liste.piyasaAnlik && o.piyasaAnlikOku) {
    const icerik = o.piyasaAnlikOku(liste.no);
    if (icerik) { try { const j = JSON.parse(icerik); girisFiyatlari = j.fiyatlar; kaynakNotu = `giriş anı anlık görüntüsü (${j.n} sembol, ${String(j.zaman).slice(0, 16).replace('T', ' ')} UTC)`; } catch { /* bozuk → hesapla */ } }
  }
  if (!girisFiyatlari) {
    const a = o.piyasa.acilisOku(bas);
    if (a) { girisFiyatlari = Object.fromEntries(Object.entries(a.fiyatlar).map(([s, v]) => [s, v.acilis])); kaynakNotu = `${bas} açılışı (${a.n} sembol, o gün hacim > 0)`; }
  }
  if (girisFiyatlari) {
    try {
      const semboller = Object.keys(girisFiyatlari);
      const son = await o.piyasa.sonFiyatlar(semboller);
      const g = semboller.map(s => (son.fiyatlar[s] > 0 && girisFiyatlari[s] > 0 ? son.fiyatlar[s] / girisFiyatlari[s] - 1 : null)).filter(Number.isFinite);
      const sinir = yuzdelikSinir(g, 0.01, 0.99);
      piyasa = { durum: 'hazir', gun: bas, kaynak: kaynakNotu, n: g.length, cikan: son.cikan.length, medyan: medyan(g), ortalama: ortalama(g),
        kirpik: sinir ? kirpikOrtalama(g, sinir[0], sinir[1]) : null, kirpSinir: sinir, pozitifPay: g.length ? g.filter(x => x > 0).length / g.length : null };
    } catch (e) {
      if (e && e.constructor && e.constructor.name === 'KotaHatasi') throw e;
      piyasa = { durum: 'hata', gun: bas, hata: String(e.message).slice(0, 200) };
    }
  }
  const sinir = piyasa.durum === 'hazir' ? piyasa.kirpSinir : null;
  const gruplar = {
    secildi: grupOzeti(coinler.filter(c => c.durum === 'secildi').map(c => c.getiri), sinir),
    elendi: grupOzeti(coinler.filter(c => c.durum === 'elendi').map(c => c.getiri), sinir),
  };
  if (!gruplar.elendi.n) notlar.push('Elenen coin kaydı yok — seçim etkisi (seçilen − elenen) ölçülemez.');
  if (liste.geriyeDonuk) notlar.push(`Liste geriye dönük girildi (${girisGunu}); liste tarihi doğrulanamıyor.`);
  if (coinler.some(c => c.hata)) notlar.push(`${coinler.filter(c => c.hata).length} coinin getirisi hesaplanamadı (tabloda nedeni yazıyor).`);
  notlar.push('Betimleyici: tek liste × tek dönem şanstan ayrılamaz; ücret/kayma/funding yok; hüküm değildir.');
  const fark = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? a - b : null);
  return {
    liste: { no: liste.no, tarih: liste.tarih, kaynak: liste.kaynak, girisZamani: liste.girisZamani, geriyeDonuk: !!liste.geriyeDonuk },
    bas, bit: new Date(simdi()).toISOString(), girisYontemi: kayitliFiyat ? 'kayıtlı giriş fiyatı' : `${bas} açılışı (UTC)`,
    coinler, gruplar, btc, piyasa,
    farklar: {
      secilenEksiElenen: fark(gruplar.secildi.medyan, gruplar.elendi.medyan),
      secilenEksiBtc: fark(gruplar.secildi.medyan, btc.getiri),
      secilenEksiPiyasa: fark(gruplar.secildi.medyan, piyasa.durum === 'hazir' ? piyasa.medyan : null),
      olcu: 'medyan',
    },
    notlar,
  };
}

/** Kaydedilmiş acilis dosyası var mı (panelde "Piyasa kıyasını hesapla" düğmesi için). */
function piyasaHazirMi(dizin, gun) { return !!jsonOku(require('path').join(dizin, `acilis-${gun}.json`), null); }

module.exports = { degerlendir, grupOzeti, piyasaHazirMi };
