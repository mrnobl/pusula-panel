/**
 * SİNYALLER — Pusula "Sinyaller" ekranının sunucu tarafı (63.3; kullanıcıyla taslak 1–2).
 * ═══════════════════════════════════════════════════════════════════════════
 * "Bugün sistem ne diyor, ne zaman fikir değiştirebilir?" — Hücum / Denge'nin iki kuralının BUGÜNKÜ durumu, botların
 * kendi kural koduyla (kural burada YENİDEN YAZILMAZ):
 *   · btcTrend()   — BTC ayağı O-GC (`bindirme.ogcDurum`: giriş kapanış > SMA100 VE SMA50 > SMA200; çıkış kapanış < SMA100).
 *                    Karara uzaklık: içerideyken kapanışın SMA100'e göre yüzdesi; dışarıdayken iki giriş koşulunun açığı.
 *   · coinSepeti() — Kalkan kolunun Donchian yarısı (`donchianBot.portfoyHedefleri`, 9 pencere): coin başına açık pencere,
 *                    en yakın çıkış (kapanış / stop − 1), kapalıysa en yakın giriş (kapanış / önceki N günün en yükseği − 1)
 *                    ve oynaklık tavanı (yıllık σ30 > girisVolTavani → yeni pencere açılmaz).
 *                    Coin listesi `pitVeri.evrenKur(15)` (botun evren kuralının araştırma eşi: 30 g ortalama ciro, ilk 15).
 * Veri: data/market.db (Binance perp 1d, `pitVeri` — veri orkestratörü her gün tazeler, önbelleği temizler).
 * Yalnız okur: dosya yazmaz, borsaya bağlanmaz, emir vermez. Model portföyler (M10, 837) ve gölge kurallar panelde var
 * olan uçlardan okunur (GET /api/tasarimci/aday-havuzu, /api/tasarimci/model/m-837, /api/ileri/bollinger).
 */
'use strict';
const B = require('./bindirme');
const P = require('./pitVeri');
const D = require('../strategies/donchianEnsemble');
const { portfoyHedefleri } = require('../live/donchianBot');

const GUN = 864e5;
const tarih = t => new Date(t).toISOString().slice(0, 10);
const R = (x, n = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : null);

/** Saf: kapanış dizisinden O-GC durumu ve karara uzaklık. `zaman`: aynı uzunlukta ms dizisi. */
function btcTrendHesapla(kapanislar, zaman) {
  const o = B.ogcDurum(kapanislar), j = kapanislar.length - 1;
  if (j < 0 || o.sma200[j] == null) return { hazir: false };
  const icerde = o.durum[j] === 1;
  let g = j; while (g > 0 && o.durum[g - 1] === o.durum[j]) g--;
  const sonGecis = g > 0 ? { gun: tarih(zaman[g]), yon: icerde ? 'giris' : 'cikis' } : null;
  return {
    hazir: true, gun: tarih(zaman[j]), icerde, kapanis: kapanislar[j],
    sma50: R(o.sma50[j], 2), sma100: R(o.sma100[j], 2), sma200: R(o.sma200[j], 2),
    // içeride: kapanış SMA100'ün altına inerse çıkar → pay = kapanış / SMA100 − 1 (pozitif = güvende)
    // dışarıda: iki koşul birlikte gerekir → kapanış / SMA100 − 1 ve SMA50 / SMA200 − 1 (ikisi de > 0 olunca girer)
    fiyatPay: R(kapanislar[j] / o.sma100[j] - 1), ortalamaPay: R(o.sma50[j] / o.sma200[j] - 1),
    sonGecis, gunSayisi: j - g + 1
  };
}

/** Saf: bir coinin Donchian durumu (portfoyHedefleri çıktısı + kapanışlar) → panel satırı. */
function coinSatiri(h, kapanislar, ayar = {}) {
  const a = D.ayarKur(ayar), c = h.sonKapanis, t = kapanislar.length - 1;
  const acik = h.altlar.filter(x => x.acik), kapali = h.altlar.filter(x => !x.acik);
  const cikislar = acik.map(x => ({ N: x.N, pay: c / x.stop - 1 })).sort((p, q) => p.pay - q.pay);
  const girisler = kapali.map(x => {
    let y = -Infinity; for (let i = Math.max(0, t - x.N); i <= t - 1; i++) y = Math.max(y, kapanislar[i]);
    return { N: x.N, pay: c / y - 1 };
  }).sort((p, q) => q.pay - p.pay);
  return {
    s: h.symbol, kisa: h.symbol.split('/')[0], acik: acik.length, toplam: h.altlar.length, kapanis: c,
    enYakinCikis: cikislar.length ? { N: cikislar[0].N, pay: R(cikislar[0].pay) } : null,
    enYakinGiris: girisler.length ? { N: girisler[0].N, pay: R(girisler[0].pay) } : null,
    vol: R(h.vol, 3), girisYasak: a.girisVolTavani != null && h.vol > a.girisVolTavani
  };
}

let _onbellek = null;   // { anahtar, sonuc } — market.db'nin son BTC günü değişmedikçe yeniden hesaplanmaz

/** BTC trendi + coin sepeti. Hata olursa ilgili parça { hata } döner (biri diğerini düşürmez). */
function hesapla() {
  const v = P.yukle(), btc = v.seri.get(B.BTC);
  const anahtar = btc && btc.m.length ? btc.m[btc.m.length - 1].time : null;
  if (_onbellek && _onbellek.anahtar === anahtar && _onbellek.v === v) return _onbellek.sonuc;
  const out = { hesaplandi: new Date().toISOString() };
  try {
    if (!btc) throw new Error('market.db içinde BTC günlük verisi yok');
    out.btc = btcTrendHesapla(btc.m.map(m => m.close), btc.m.map(m => m.time));
  } catch (e) { out.btc = { hata: e.message }; }
  try {
    const ev = [...P.evrenKur(15).entries()].pop();
    if (!ev) throw new Error('coin listesi kurulamadı');
    const semboller = ev[1].filter(s => v.seri.has(s));
    const seriler = semboller.map(s => ({ symbol: s, kapanislar: v.seri.get(s).m.map(m => m.close) }));
    const hedef = portfoyHedefleri(seriler, 1, {});
    const coinler = hedef.map((h, i) => coinSatiri(h, seriler[i].kapanislar));
    const sonGun = Math.max(...semboller.map(s => { const m = v.seri.get(s).m; return m[m.length - 1].time; }));
    out.sepet = {
      ay: tarih(ev[0]).slice(0, 7), gun: tarih(sonGun), coinler,
      trendde: coinler.filter(x => x.acik > 0).length, toplam: coinler.length,
      enYakin: coinler.filter(x => x.enYakinCikis).sort((p, q) => p.enYakinCikis.pay - q.enYakinCikis.pay).slice(0, 2)
        .map(x => ({ kisa: x.kisa, pay: x.enYakinCikis.pay })),
      volTavani: D.VARSAYILAN.girisVolTavani
    };
  } catch (e) { out.sepet = { hata: e.message }; }
  _onbellek = { anahtar, v, sonuc: out };
  return out;
}

/**
 * Sunucu için: hesaplamayı AYRI İŞ PARÇACIĞINDA yapar (market.db'nin tamamını yüklemek ~3–6 sn sürer; sunucunun olay
 * döngüsü — bot zamanlayıcıları, marj izleme — beklemesin). Sonuç `azamiYasMs` (varsayılan 30 dk) boyunca bellekte tutulur;
 * aynı anda gelen istekler tek hesaplamayı bekler.
 */
let _son = null, _is = null;
function hesaplaArkada({ azamiYasMs = 30 * 60e3, simdi = Date.now() } = {}) {
  if (_son && simdi - _son.t < azamiYasMs) return Promise.resolve(_son.v);
  if (_is) return _is;
  const { Worker } = require('worker_threads');
  _is = new Promise((ok, red) => {
    const w = new Worker(__filename, { workerData: { sinyallerHesapla: true } });
    w.once('message', ok); w.once('error', red);
    w.once('exit', c => { if (c) red(new Error(`sinyal hesabı yarıda kaldı (çıkış ${c})`)); });
  }).then(v => { _son = { t: Date.now(), v }; return v; }).finally(() => { _is = null; });
  return _is;
}

const WT = require('worker_threads');
if (!WT.isMainThread && WT.workerData && WT.workerData.sinyallerHesapla) WT.parentPort.postMessage(hesapla());

module.exports = { hesapla, hesaplaArkada, btcTrendHesapla, coinSatiri, GUN };
