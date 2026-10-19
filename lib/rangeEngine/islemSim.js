/**
 * KURULUM → İŞLEM SİMÜLATÖRÜ
 *
 * `PLAN-RANGE-VPFR.md` §6'daki giriş/çıkış kurallarını, motorun ürettiği
 * kurulum olaylarına uygular. Motor işlem bilmez (§3.1); bilen katman burasıdır.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN BACKTESTER DEĞİL
 * ─────────────────────────────────────────────────────────────────────────
 * `lib/backtester.js` sermaye, pozisyon boyutu, marj ve funding taşır — kill
 * kriteri için gereken şey ise İŞLEM BAŞINA beklentidir. Sermaye eğrisi
 * üzerinden beklenti okumak, pozisyon boyutu kurallarını da ölçüme sokar ve
 * iki soruyu karıştırır. §6.8 kararı da bunu söylüyordu: kaldıraç, strateji
 * kill kriterini geçtikten SONRA ayrı faz.
 *
 * Backtester'a bağlanma, kural donduktan sonra yapılacak (§12).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BAR İÇİ BELİRSİZLİK — daima ALEYHTE çözülür
 * ─────────────────────────────────────────────────────────────────────────
 * Bir barda hem SL hem TP seviyesi görülüyorsa OHLCV hangisinin önce
 * olduğunu söyleyemez. Bu simülatör her zaman ÖNCE SL'yi sayar. İyimser
 * varsayım, bu depoda daha önce sahte edge üretmiş bir hata sınıfıdır.
 */

/** Ortalama `H` barlık ileri getiri — drift nötrleştirmesinin tabanı. */
const notrOnbellek = new WeakMap();

/**
 * DRIFT NÖTRLEŞTİRME (§11 protokol md.2, pazarlık dışı).
 *
 * Aynı varlıkta aynı süre boyunca sadece TUTMANIN ortalama getirisi. İşlem
 * getirisinden bu çıkarılmadan hiçbir sayı rapor edilmez: `range_mr`'da
 * ölçülen "short üstünlüğü" tam olarak bu düzeltme yapılmadığı için sahte
 * çıkmıştı (`PLAN-RANGE-KURALLARI.md` §2.10–2.11).
 */
function notrGetiri(candles, H) {
  if (!(H > 0)) return 0;
  let harita = notrOnbellek.get(candles);
  if (!harita) { harita = new Map(); notrOnbellek.set(candles, harita); }
  if (harita.has(H)) return harita.get(H);

  let toplam = 0, adet = 0;
  for (let t = 0; t + H < candles.length; t++) {
    const a = candles[t].close, b = candles[t + H].close;
    if (a > 0 && b > 0) { toplam += (b / a - 1); adet++; }
  }
  const v = adet ? toplam / adet : 0;
  harita.set(H, v);
  return v;
}

/**
 * KOŞULLU DRIFT NÖTRLEŞTİRMESİ — daha sıkı boş hipotez.
 *
 * Koşulsuz nötr getiri, "aynı varlıkta aynı süre tutmanın" ortalamasıdır.
 * Ama `yonPolitikasi:'hepHtf'` gibi bir kol, işlemleri TREND YÖNÜNDE seçer;
 * o kolun getirisi koşulsuz ortalamayla değil, **aynı trend durumundaki**
 * ortalamayla karşılaştırılmalıdır. Aksi hâlde ölçtüğümüz şey stratejinin
 * katkısı değil, trend yönünde durmanın katkısı olabilir.
 *
 * Bu, `PLAN-RANGE-KURALLARI.md` §2.10'un teşhisidir: orada "short üstünlüğü"
 * yapı değil piyasa yönü çıkmıştı. Aynı hata yön filtreli bir kolda daha da
 * kolay yapılır.
 *
 * Yalnızca `htfYonAt[t] === yon` olan barlardan başlayan pencereler sayılır.
 * Eşleşen bar yoksa koşulsuz değere düşülür ve `kosulluDayanak` ile bildirilir.
 */
const kosulluOnbellek = new WeakMap();
function notrGetiriKosullu(candles, H, htfYonAt, yonIsaret) {
  if (!(H > 0) || !htfYonAt) return { deger: notrGetiri(candles, H), n: 0, dayanak: false };
  let harita = kosulluOnbellek.get(candles);
  if (!harita) { harita = new Map(); kosulluOnbellek.set(candles, harita); }
  const anahtar = `${H}|${yonIsaret}`;
  if (harita.has(anahtar)) return harita.get(anahtar);

  let toplam = 0, adet = 0;
  for (let t = 0; t + H < candles.length; t++) {
    if (htfYonAt[t] !== yonIsaret) continue;
    const a = candles[t].close, b = candles[t + H].close;
    if (a > 0 && b > 0) { toplam += (b / a - 1); adet++; }
  }
  // 30 gözlemin altında koşullu ortalama kendisi gürültüdür; o durumda
  // koşulsuza düşülür ama satır işaretlenir.
  const yeter = adet >= 30;
  const sonuc = {
    deger: yeter ? toplam / adet : notrGetiri(candles, H),
    n: adet,
    dayanak: yeter
  };
  harita.set(anahtar, sonuc);
  return sonuc;
}

function varsayilan(t = {}) {
  const say = (v, d) => (v === undefined || v === null || !Number.isFinite(+v) ? d : +v);
  return {
    yonPolitikasi: ['ilkHtf', 'hepHtf', 'serbest'].includes(t.yonPolitikasi) ? t.yonPolitikasi : 'ilkHtf',
    girisAni: t.girisAni === 'donus' ? 'donus' : 'retest',
    bolgeYoksa: t.bolgeYoksa === 'sinirdanGir' ? 'sinirdanGir' : 'bolgeZorunlu',
    slTamponR: say(t.slTamponR, 0),
    tpTamponR: say(t.tpTamponR, 0),
    eqPartialPct: say(t.eqPartialPct, 0.5),
    girisSinirYakinlik: say(t.girisSinirYakinlik, 0.25),

    /**
     * MALİYET — vadeli taker, gidiş-dönüş.
     * `lib/venues.js` varsayılanı taker %0.06; iki bacak = %0.12. Kısmi kâr
     * alınırsa ÜÇ bacak olur ve maliyet 1.5 katına çıkar (aşağıda hesaplı).
     * config.json'daki `feePct: 0.15` spot dönemine ait, buraya taşınmadı.
     */
    maliyetPct: say(t.maliyetPct, 0.12),

    /**
     * Pozisyon en fazla kaç bar tutulur. Gerekli: range ölse bile pozisyon
     * SL'ye bırakılıyor (§6.9) ve teorik olarak seri sonuna kadar açık
     * kalabilir. Zaman aşımıyla kapanan işlemler ayrıca raporlanır.
     */
    maxTutmaBar: Math.round(say(t.maxTutmaBar, 500))
  };
}

/**
 * @param {Array} candles
 * @param {Array} kurulumlar  motor çıktısı
 * @param {object} tp         işlem parametreleri
 * @returns {Array} işlemler
 */
function simule(candles, kurulumlar, tp = {}, htfYonAt = null) {
  const t = varsayilan(tp);
  const n = candles.length;
  const islemler = [];

  for (const s of kurulumlar) {
    // ── Süzgeçler (§6.1) ──
    if (t.yonPolitikasi === 'hepHtf' && s.htfYonundeMi === false) continue;
    if (t.yonPolitikasi === 'ilkHtf' && s.kacinciSapma === 1 && s.htfYonundeMi === false) continue;
    if (t.bolgeYoksa === 'bolgeZorunlu' && !s.bolgeVar) continue;

    const uzun = s.islemYonu === 'long';

    // ── Giriş ──
    let girisBar, giris;
    if (t.girisAni === 'donus') {
      girisBar = s.bar;
      giris = candles[s.bar].close;
    } else {
      if (!s.retestGeldi || !Number.isFinite(s.retestBar)) continue;
      girisBar = s.retestBar;
      const b = candles[girisBar];
      // Sınıra konmuş limit emri: fiyat sınırı geçtiyse sınırdan, geçmeden
      // döndüyse ulaştığı uçtan dolar. İyimser doldurma yok.
      giris = uzun ? Math.min(s.sinir, b.low >= s.sinir ? b.low : s.sinir)
        : Math.max(s.sinir, b.high <= s.sinir ? b.high : s.sinir);
      if (uzun && b.low > s.sinir) giris = b.low;
      if (!uzun && b.high < s.sinir) giris = b.high;
    }
    if (!(giris > 0)) continue;

    // ── Seviyeler (§6.2, §6.3) ──
    const sl = uzun ? s.devLow - t.slTamponR * s.R : s.devHigh + t.slTamponR * s.R;
    const tpF = uzun ? s.H - t.tpTamponR * s.R : s.L + t.tpTamponR * s.R;
    // Giriş zaten hedefin ötesindeyse kurulum anlamsız — atlanır.
    if (uzun && !(tpF > giris && sl < giris)) continue;
    if (!uzun && !(tpF < giris && sl > giris)) continue;

    // ── Çıkış taraması ──
    let cikisBar = null, cikis = null, sebep = null;
    let eqAlindi = false, eqFiyat = null;
    let aktifSl = sl;
    const son = Math.min(n - 1, girisBar + t.maxTutmaBar);

    for (let i = girisBar + 1; i <= son; i++) {
      const b = candles[i];
      // 1) SL — bar içi belirsizlik daima aleyhte
      if ((uzun && b.low <= aktifSl) || (!uzun && b.high >= aktifSl)) {
        cikisBar = i; cikis = aktifSl; sebep = eqAlindi ? 'slBaskaBasa' : 'sl'; break;
      }
      // 2) EQ kısmi kârı (§6.4) — alındıysa SL girişe çekilir (§6.5)
      if (t.eqPartialPct > 0 && !eqAlindi
        && ((uzun && b.high >= s.eq) || (!uzun && b.low <= s.eq))) {
        eqAlindi = true; eqFiyat = s.eq; aktifSl = giris;
      }
      // 3) TP
      if ((uzun && b.high >= tpF) || (!uzun && b.low <= tpF)) {
        cikisBar = i; cikis = tpF; sebep = 'tp'; break;
      }
    }
    if (cikisBar === null) {
      cikisBar = son; cikis = candles[son].close; sebep = 'zamanAsimi';
    }

    // ── Getiri ──
    const ham = (f) => (uzun ? f / giris - 1 : giris / f - 1);
    const oran = t.eqPartialPct > 0 && eqAlindi ? t.eqPartialPct : 0;
    // DİKKAT: `oran * ham(eqFiyat)` diye yazılamaz — kısmi kâr alınmadığında
    // eqFiyat null olur ve `0 * NaN = NaN` bütün beklentiyi siler. (Bu hata
    // ilk koşuda tüm ham/düzeltilmiş sütunlarını boş bıraktı.)
    const brut = oran > 0
      ? oran * ham(eqFiyat) + (1 - oran) * ham(cikis)
      : ham(cikis);

    // Maliyet: giriş bir bacak, çıkışlar bir ya da iki bacak.
    const bacak = 1 + (eqAlindi && oran > 0 ? 2 : 1);
    const maliyet = (t.maliyetPct / 100) * (bacak / 2);
    const net = brut - maliyet;

    // Drift nötrleştirmesi — yön işaretiyle, KOŞULSUZ ve KOŞULLU
    const H = cikisBar - girisBar;
    const notr = uzun ? notrGetiri(candles, H) : -notrGetiri(candles, H);
    const yonIsaret = uzun ? 1 : -1;
    const kk = notrGetiriKosullu(candles, H, htfYonAt, yonIsaret);
    const notrK = uzun ? kk.deger : -kk.deger;

    islemler.push({
      rangeId: s.rangeId,
      girisBar, cikisBar, sureBar: H,
      yon: s.islemYonu,
      giris, cikis, sl, tp: tpF,
      sebep, eqAlindi,
      brutPct: brut * 100,
      netPct: net * 100,
      notrPct: notr * 100,
      duzeltilmisPct: (net - notr) * 100,
      notrKosulluPct: notrK * 100,
      duzeltilmisKosulluPct: (net - notrK) * 100,
      kosulluDayanak: kk.dayanak,
      rr: Math.abs(tpF - giris) / Math.abs(giris - sl),
      time: candles[girisBar].time
    });
  }
  return islemler;
}

module.exports = { simule, notrGetiri, varsayilan };
