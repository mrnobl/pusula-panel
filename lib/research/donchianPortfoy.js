/**
 * DONCHIAN PORTFÖYÜ — ölçüm motoru (Aday A2), betik ve panel ORTAK.
 *
 * `scripts/donchian-portfoy.js` bu modülü yazdırır; panel (`/api/strateji/
 * donchian`) aynı sonucu JSON olarak alır. İki kopya bu depoda daha önce
 * sessizce ayrıştı (PLAN-MOTOR M5, `htfTopla`) — bu yüzden tek kaynak.
 *
 * Kurallar ve kill kriteri: PLAN-GECE.md "F6 · Aday A2". Kaynaktan birebir
 * değil (rotasyon kuralı özette yok): varlıklar eşit ağırlık, her varlık
 * `donchianEnsemble` ile kendi hedef maruziyetini üretir, toplam brüt
 * maruziyet tavanı 2x.
 *
 * Simülasyon sözleşmesi: karar günün kapanışında, dolum ertesi gün
 * açılışında; bir varlığın hedefi değişmediyse birimi korunur; taker + kayma
 * el değiştiren nominal üzerinden; gerçek funding (long pozitif oranda öder).
 *
 * Tek varlık verilirse 5. kriter "varlık çıkar" yerine "alt model çıkar"
 * olur (Aday A'nın kriteri) — tek varlıktan varlık çıkarılamaz.
 */
const D = require('../strategies/donchianEnsemble');
const G = require('../backtest/gunluk');

const VARSAYILAN_VARLIKLAR = Object.freeze(['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
  'ADA/USDT', 'DOGE/USDT', 'LINK/USDT', 'AVAX/USDT', 'ATOM/USDT',
  'DOT/USDT', 'LTC/USDT', 'TRX/USDT', 'UNI/USDT', 'FIL/USDT']);
const TAKER = 0.0005, KAYMA = 0.0002, TAVAN = 2;
const YAYIN = Date.UTC(2025, 5, 1);    // kaynağın yayın tarihi — sonrası örneklem dışı
const KRITER = Object.freeze({ sharpe: 0.8, maxDD: 0.30, tekYil: 0.5, funding: 0.40, duyarlilik: 0.30 });

/** Varlık başına: tarih → { open, close, hedef (strateji), alTut, funding, hazir, acik, vol } */
function varlikHazirla(sembol, ayar, secenek = {}) {
  // DON-VWAP (PLAN-SEVIYE-KOMBO.md): maruziyet ARTIŞI yalnız günün kapanışı >
  // günün VWAP'ı iken (1s perp mumlarından). Azalış her zaman serbest.
  const gunVwap = secenek.vwapFiltresi ? secenek.gunVwap : null;
  const { mumlar } = G.gunlukMumlar(sembol);
  const f = G.fundingGunluk(sembol);
  const kap = mumlar.map(m => m.close);
  const a = D.ayarKur(ayar);
  let durum = D.yeniDurum(ayar), onceki = 0;
  const gunler = new Map();
  for (let t = 0; t < mumlar.length; t++) {
    const r = D.adim(durum, kap.slice(0, t + 1), ayar);
    if (gunVwap && r.maruziyet > (durum.maruziyet || 0)) {
      const v = gunVwap.get(mumlar[t].time);
      if (!(v != null && mumlar[t].close > v)) { r.maruziyet = durum.maruziyet || 0; r.durum = { ...r.durum, maruziyet: r.maruziyet }; }
    }
    durum = r.durum;
    let bh = 0;
    if (!r.isiniyor) {
      const vol = D.yillikVol(kap.slice(0, t + 1), a.volPencere, a.yillikGun);
      const ham = Math.min(a.kaldiracTavani, vol > 0 ? a.hedefVol / vol : 0);
      onceki = (Math.abs(ham - onceki) >= a.esik || onceki === 0) ? ham : onceki;
      bh = onceki;
    }
    // Hazır: ısınma bitti VE funding geçmişi başladı.
    const hazir = !r.isiniyor && f.ilk != null && mumlar[t].time >= f.ilk;
    gunler.set(mumlar[t].time, { open: mumlar[t].open, close: mumlar[t].close,
      hedef: r.maruziyet, alTut: bh, funding: f.gunluk.get(mumlar[t].time) || 0, hazir,
      acik: r.acikSayisi, vol: r.vol });
  }
  return { sembol, gunler, altModel: a.pencereler.length };
}

/**
 * @param varliklar varlikHazirla çıktıları
 * @param alan 'hedef' | 'alTut'
 */
function simule(varliklar, alan, { fundingYok = false, risk = null } = {}) {
  // RİSK KATMANI (PLAN-RISK.md ablasyonu): verilirse kapanış kararı
  // `riskUygula`dan geçer — canlı botla AYNI çekirdek. Verilmezse davranış aynı.
  const RK = risk ? require('../risk/katmanlar') : null;
  const RD = risk ? require('../risk/durum') : null;
  let riskDurum = risk ? RD.bos() : null;
  const riskKararlari = [];
  const tarihler = [...new Set(varliklar.flatMap(v => [...v.gunler.keys()]))].sort((a, b) => a - b);
  let nakit = 1;
  const birim = new Map(varliklar.map(v => [v.sembol, 0]));
  const sonHedef = new Map(varliklar.map(v => [v.sembol, 0]));   // uygulanan ağırlıklı hedef
  let bekleyen = null;   // dünün kararı: sembol → ağırlıklı hedef
  let ucret = 0, fundingOdenen = 0, islem = 0;
  const egri = [];
  let basladi = false;

  for (const t of tarihler) {
    // 1. Dünün kararını bugünün açılışında uygula.
    if (bekleyen) {
      let oz = nakit;
      for (const v of varliklar) { const g = v.gunler.get(t); if (g) oz += birim.get(v.sembol) * g.open; }
      for (const v of varliklar) {
        const g = v.gunler.get(t);
        if (!g) continue;
        const h = bekleyen.get(v.sembol) || 0;
        if (h === sonHedef.get(v.sembol)) continue;
        const istenen = h * oz / g.open;
        const fark = istenen - birim.get(v.sembol);
        if (Math.abs(fark) * g.open < 1e-12) { sonHedef.set(v.sembol, h); continue; }
        const fiyat = fark > 0 ? g.open * (1 + KAYMA) : g.open * (1 - KAYMA);
        const u = Math.abs(fark) * fiyat * TAKER;
        nakit -= fark * fiyat + u;
        ucret += u + Math.abs(fark) * g.open * KAYMA;
        birim.set(v.sembol, istenen);
        sonHedef.set(v.sembol, h);
        islem++;
      }
    }
    // 2. Funding.
    if (!fundingYok) {
      for (const v of varliklar) {
        const g = v.gunler.get(t); const q = birim.get(v.sembol);
        if (g && q && g.funding) { const o = q * g.close * g.funding; nakit -= o; fundingOdenen += o; }
      }
    }
    // 3. Kapanışta karar: hazır varlıklar arasında eşit ağırlık, toplam tavan.
    const hazirlar = varliklar.filter(v => { const g = v.gunler.get(t); return g && g.hazir; });
    if (hazirlar.length) {
      basladi = true;
      const w = 1 / hazirlar.length;
      const karar = new Map();
      let toplam = 0;
      for (const v of hazirlar) { const h = v.gunler.get(t)[alan] * w; karar.set(v.sembol, h); toplam += Math.abs(h); }
      if (toplam > TAVAN) for (const [k, h] of karar) karar.set(k, h * TAVAN / toplam);
      // Hazır olmayan / bugün verisi olmayan varlık: kararı değiştirme (birim korunur).
      for (const v of varliklar) if (!karar.has(v.sembol)) karar.set(v.sembol, sonHedef.get(v.sembol));
      if (risk) {
        let oz = nakit;
        for (const v of varliklar) { const g = v.gunler.get(t); if (g) oz += birim.get(v.sembol) * g.close; }
        riskDurum = RD.guncelle(riskDurum, oz, t + 864e5 - 1);
        const piyasa = { _simdi: t };
        for (const v of varliklar) {
          const g = v.gunler.get(t);
          piyasa[v.sembol] = { mevcutOran: g && oz > 0 ? birim.get(v.sembol) * g.close / oz : 0, veriZamani: g ? t : -Infinity };
        }
        const r = RK.riskUygula(Object.fromEntries(karar), riskDurum, piyasa, risk);
        riskDurum = RD.killIsle(riskDurum, r, t);
        if (r.kararlar.length) riskKararlari.push({ t, kararlar: r.kararlar.length, kill: r.kill, dd: r.dd });
        for (const [k, h] of Object.entries(r.hedefler)) karar.set(k, h);
      }
      bekleyen = karar;
    }
    if (basladi) {
      let oz = nakit;
      for (const v of varliklar) {
        const g = v.gunler.get(t);
        if (!g) continue;
        oz += birim.get(v.sembol) * g.close;
      }
      egri.push({ time: t, oz });
    }
  }
  return { egri, ucret, fundingOdenen, islem, sonKarar: bekleyen, riskKararlari, riskDurum };
}

const gun = (t) => new Date(t).toISOString().slice(0, 10);

/** Grafik için haftalık seyreltme — son nokta her zaman dahil. */
function seyrelt(egri, adim = 7) {
  const s = egri.filter((_, i) => i % adim === 0);
  if (egri.length && s[s.length - 1] !== egri[egri.length - 1]) s.push(egri[egri.length - 1]);
  return s.map(x => ({ t: gun(x.time), oz: +x.oz.toFixed(4) }));
}

/**
 * Tam ölçüm: metrikler, kill kriteri, yıllık getiri, duyarlılık, eğri ve
 * son kapanmış günün hedef maruziyetleri.
 */
function olc(semboller = VARSAYILAN_VARLIKLAR) {
  const varliklar = semboller.map(s => varlikHazirla(s)).filter(v => v.gunler.size > 0);
  if (!varliklar.length) throw new Error('Seçilen varlıklar için 4h perp verisi yok — önce vadeli veri çekin.');
  const tekVarlik = varliklar.length === 1;

  const S = simule(varliklar, 'hedef');
  const B = simule(varliklar, 'alTut');
  const Brut = simule(varliklar, 'hedef', { fundingYok: true });
  if (S.egri.length < 30) throw new Error('Ölçüm için yeterli gün yok (ısınma 361 gün + funding geçmişi gerekir).');
  const mS = G.metrik(S.egri), mB = G.metrik(B.egri);

  const yillar = G.yillik(S.egri);
  const toplamKar = S.egri[S.egri.length - 1].oz - 1;
  const enBuyuk = yillar.reduce((a, b) => (b.kar > a.kar ? b : a));

  // 5. kriter: portföyde varlık, tek varlıkta alt model çıkarılır.
  const duyarlilik = [];
  if (tekVarlik) {
    for (const N of D.VARSAYILAN.pencereler) {
      const v = varlikHazirla(varliklar[0].sembol, { pencereler: D.VARSAYILAN.pencereler.filter(n => n !== N) });
      const m = G.metrik(simule([v], 'hedef').egri);
      duyarlilik.push({ ad: `N=${N}`, sharpe: m.sharpe, degisim: Math.abs(m.sharpe - mS.sharpe) / Math.abs(mS.sharpe || 1) });
    }
  } else {
    for (const v of varliklar) {
      const m = G.metrik(simule(varliklar.filter(x => x !== v), 'hedef').egri);
      duyarlilik.push({ ad: v.sembol, sharpe: m.sharpe, degisim: Math.abs(m.sharpe - mS.sharpe) / Math.abs(mS.sharpe || 1) });
    }
  }
  const enKotu = duyarlilik.reduce((a, b) => Math.max(a, b.degisim), 0);

  const brutKar = Brut.egri[Brut.egri.length - 1].oz - 1;
  const fundingPay = brutKar > 0 ? S.fundingOdenen / brutKar : null;
  const tekYilPay = toplamKar > 0 ? enBuyuk.kar / toplamKar : null;
  const kriterler = [
    { no: 1, ad: 'Net Sharpe ≥ 0,80 ve ≥ al-tut', deger: mS.sharpe, kiyas: mB.sharpe, gecti: mS.sharpe >= KRITER.sharpe && mS.sharpe >= mB.sharpe, sonuc: 'ÖLDÜR' },
    { no: 2, ad: 'En büyük düşüş ≤ %30', deger: mS.maxDD, gecti: mS.maxDD <= KRITER.maxDD, sonuc: 'ÖLDÜR' },
    { no: 3, ad: `Tek yıl net kârın ≤ %50'si (${enBuyuk.yil})`, deger: tekYilPay, gecti: !(toplamKar > 0 && tekYilPay > KRITER.tekYil), sonuc: 'BEKLET' },
    { no: 4, ad: 'Funding brüt kârın ≤ %40\'ı', deger: fundingPay, gecti: fundingPay == null || fundingPay <= KRITER.funding, sonuc: 'ÖLDÜR' },
    { no: 5, ad: tekVarlik ? 'Bir alt model çıkınca Sharpe değişimi ≤ %30' : 'Bir varlık çıkınca Sharpe değişimi ≤ %30', deger: enKotu, gecti: enKotu <= KRITER.duyarlilik, sonuc: 'ÖLDÜR' }
  ];
  const olumcul = kriterler.filter(k => k.sonuc === 'ÖLDÜR' && !k.gecti).length;
  const karar = olumcul ? 'ÖLDÜ' : (kriterler[2].gecti ? 'GEÇTİ' : 'BEKLET');

  // Son kapanmış gün: hangi varlıkta ne kadar maruziyet isteniyor.
  const sonGun = Math.max(...varliklar.map(v => Math.max(...v.gunler.keys())));
  const hazirSon = varliklar.filter(v => { const g = v.gunler.get(sonGun); return g && g.hazir; });
  let toplamHedef = 0;
  const w = hazirSon.length ? 1 / hazirSon.length : 0;
  const hedefler = varliklar.map(v => {
    const g = v.gunler.get(sonGun);
    const agirlikli = g && g.hazir ? g.hedef * w : 0;
    toplamHedef += Math.abs(agirlikli);
    return { sembol: v.sembol, kapanis: g ? g.close : null, acikAltModel: g ? g.acik : null, altModel: v.altModel,
      vol: g && g.vol != null ? +g.vol.toFixed(4) : null, varlikMaruziyeti: g ? +g.hedef.toFixed(4) : null, portfoyAgirligi: agirlikli };
  });
  const olcek = toplamHedef > TAVAN ? TAVAN / toplamHedef : 1;
  for (const h of hedefler) h.portfoyAgirligi = +(h.portfoyAgirligi * olcek).toFixed(4);

  const yuvarla = (m) => (m ? { sharpe: +m.sharpe.toFixed(2), cagr: +m.cagr.toFixed(4), maxDD: +m.maxDD.toFixed(4), toplam: +m.toplam.toFixed(4) } : null);
  return {
    semboller: varliklar.map(v => v.sembol),
    tekVarlik,
    maliyet: { taker: TAKER, kayma: KAYMA, tavan: TAVAN },
    donem: { bas: gun(S.egri[0].time), bit: gun(S.egri[S.egri.length - 1].time), yayin: gun(YAYIN) },
    veriSonGun: gun(sonGun),
    metrik: {
      strateji: yuvarla(mS),
      alTut: yuvarla(mB),
      yayinOncesi: yuvarla(G.metrik(S.egri, [0, YAYIN])),
      yayinSonrasi: yuvarla(G.metrik(S.egri, [YAYIN, Infinity])),
      alTutYayinSonrasi: yuvarla(G.metrik(B.egri, [YAYIN, Infinity]))
    },
    islem: S.islem,
    ucretPay: +S.ucret.toFixed(4),
    fundingPay: +S.fundingOdenen.toFixed(4),
    yillik: yillar.map(y => ({ yil: y.yil, getiri: +y.getiri.toFixed(4) })),
    duyarlilik: duyarlilik.map(d => ({ ad: d.ad, sharpe: +d.sharpe.toFixed(2), degisim: +d.degisim.toFixed(3) })),
    kriterler,
    karar,
    hedefler,
    egri: { strateji: seyrelt(S.egri), alTut: seyrelt(B.egri) },
    // Yuvarlanmamış ara sonuçlar — betik yazdırır, sunucu yanıttan çıkarır.
    _ham: { S, B, Brut, mS, mB, varliklar, yillar, enBuyuk, toplamKar, fundingPay, enKotu, duyarlilik }
  };
}

module.exports = { VARSAYILAN_VARLIKLAR, TAKER, KAYMA, TAVAN, YAYIN, varlikHazirla, simule, olc };
