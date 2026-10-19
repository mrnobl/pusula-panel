/**
 * NASDAQ SİMÜLASYON ÇEKİRDEĞİ — PLAN-NASDAQ.md (ÖN-KAYIT) ölçümlerinin ORTAK motoru.
 * Ölçüm: `node scripts/nasdaq-strateji.js` · öz test: `node scripts/nasdaq-selftest.js`
 * Veri: `lib/research/nasdaqVeri.js` (Yahoo günlük + nokta-zamanlı Nasdaq-100 üyeliği).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SÖZLEŞME (ön-kayıt "Uygulama ve maliyet")
 * ═══════════════════════════════════════════════════════════════════════════
 *   · Karar d günü KAPANIŞINDA (yalnız ≤ d veri), uygulama d+1 işlem günü AÇILIŞINDA.
 *   · Yalnız long. Karar KISMİ hedeftir: { sembol: ağırlık } (özsermayenin katı, açılış
 *     özsermayesiyle); listede olmayan sembolün birimi korunur (her gün dengeleme yok).
 *   · Maliyet tek yön: komisyon 0 + kayma %0,05, el değiştiren tutar üzerinden.
 *   · Borç faizi: nakit < 0 (kaldıraçlı kısım) iken yıllık %6, takvim günü / 365, gece birikir.
 *     Pozitif nakit faiz KAZANMAZ (ana sürüm); `nakitGetiri(d)` verilirse pozitif nakit o günün
 *     getirisini alır (bilgi sürümü, ör. SHY vekili).
 *   · Uygulama günü sembolde çubuk yoksa emir bekler. Verisi BİTEN (delist) sembol son kapanıştan
 *     kayma ödenerek nakde çevrilir; bekleyen emri düşer.
 *   · Fiyatlar düzeltilmiş (adjclose; o/h/l k = ac/c ile) → temettü dahil.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * API
 * ═══════════════════════════════════════════════════════════════════════════
 * Sabitler: KAYMA (0,0005), BORC (0,06), YILLIK (252), GEL_BAS (1990-01-01), HOL (2016-01-01),
 *           HISSE_BAS (2005-01-01, nokta-zamanlı üyeliğin ilk ayı), GUN
 * Veri
 *   takvimGunleri()                      → number[] NYSE günleri (^GSPC)
 *   seriHazirla(ad, satirlar, takvim)    → H = { s, satir, bar[], sonIdx, sonT, k[] (kapanışlar) }
 *   endeksSerisi(takvim)                 → H  (QQQ/NDX zinciri, s = 'QQQ')
 *   hisseSerisi(s, takvim)               → H | null (önbellekli)
 *   ilkIndeks(takvim, t)                 → t'den önceki son işlem gününün indeksi (ilk karar günü d0)
 * Evren
 *   evrenAylik(K = 15, { liste })        → Map(ayBaşı ms → [sembol])  liste yok: nokta-zamanlı (nasdaqVeri.evren);
 *                                           liste verilirse aynı kural o SABİT listeden (ör. bugünkü üyeler).
 *   bugunkuListe()                       → son ayın üyeleri
 *   ayGecis(takvim, d)                   → d ayın son işlem günü mü
 *   sonrakiAy(takvim, d)                 → d+1'in ay başı (d son gün ise bir sonraki takvim ayı)
 * Simülasyon
 *   simule({ takvim, seri: Map(s → H), karar(d, ctx), d0, dSon?, maliyet?, borcFaizi?, nakitGetiri? })
 *        ctx = { oz, poz: Map(s → birim), agirlik(s) (kapanışta), seri }
 *        → { egri:[{time, oz}], brut:Float64Array (gün kapanışı brüt maruziyet), islem, islemGunu, ucret, faiz, d0 }
 *   alTut(H, takvim, d0, { maliyet })    → { egri }  d0+1 açılışında tüm nakitle (kayma dahil, borçsuz) al, tut.
 *   egriGetiri(egri)                     → { ts, r }  (ts[i] günü getirisi)
 *   akisOlcekle({ ts, r, u }, m, { borcFaizi })   → { ts, r, u }  m × getiri − borç(m·u(t−1) − 1)+
 *   akisEgri(ts, r, t0)                  → egri (başlangıç 1, t0 = ilk günden önceki gün)
 * Metrikler (bindirme.js metrikler/bootstrapP ile AYNI tanımlar; yıllıklaştırma 252 işlem günü)
 *   metrik(egri, bas?, bit?, yillik?)    → { cagr, maxDD, sharpe, vol, toplam, enUzunSuAltiGun, calmar } | null
 *   esliGetiri(egriA, egriB, bas?, bit?) → [[ra, rb]]  aynı günler
 *   bootstrapP(satirlar)                 → P(A > B)  eşli durağan bootstrap b 20, N 2000, tohum 99
 *   dsr(rDev, srListe, deneme)           → Deflated Sharpe olasılığı (Bailey & López de Prado 2014)
 *   yillik(egri)                         → [{ yil, getiri }]
 * Strateji karar üreticileri (kurallar ve parametreler kaynak modüllerden; DEĞİŞTİRİLMEDİ)
 *   kararOgc(H, takvim, m, ogcAyar?)  S1  — bindirme.ogcDurum; içerideyken ay başı m'ye dengelenir
 *   donAyarOlcekli(f)         Donchian pencereleri × f (yalnız plato duyarlılığı; kararDonchian* son argümanı)
 *   gecikmeli(karar, gun = 1) uygulama gecikmesi sınavı (karar d → uygulama d+1+gun açılışı)
 *   kararBollinger(H, m)      S5  — trendKurallari 'C1' (B-G 50/1,5); ay başı dengesi
 *   kararDonchianTek(H, m)    S2  — donchianEnsemble (yillikGun 252, kaldiracTavani 1) × m
 *   kararDonchianPortfoy(seri, evrenMap, takvim, m)          S2 hisse — maruziyet/n × m
 *   kararClenow(seriListe | H, evrenMap|null, takvim, m)     S4a — clenowKarsiTrend kuralları
 *   kararConnors(seriListe | H, evrenMap|null, takvim, m)    S4b — connorsRsiGuc kuralları
 *   dcaPortfoy(evrenMap, takvim, { dSon, dcaAyar?, onekBar = 60 })   S3 — motor (dca_bot, k 2,94, 1x) segmentleri
 *        dcaAyar (PLAN-NASDAQ-KOL3): dca_bot ayarına eklenen alanlar (priceDeviation, takeProfit, dsc, dscRsiThreshold …);
 *        onekBar: segment başı ısınma öneki (SMA200 girişi için ≥ 200). Verilmezse davranış AYNI.
 *        → { ts, r, u, segment, sermayeYetmeyen, likidasyon, deal }
 *   tersVolKol(a, b)          kol = ters-vol 60 g (bindirme.veriYukle ile aynı formül) → { ts, r, u, w }
 *   hucum(s1, kol, m, { borcFaizi, nakitGetiri, tavan = 2 })  S6 — doğrusal birleşim, Reg-T brüt tavanı 2
 *        → { ts, r, u, tavanGun }
 * Yeni aileler (PLAN-PORTFOY.md ÖN-KAYIT A; node scripts/nasdaq-yeni-aileler.js)
 *   gerceklesenSigma(k, n)              → Float64Array  i'de son n basit günlük getirinin örneklem σ'sı × √252 (yalnız ≤ i)
 *   donemSigma(H, bas, bit)             → [bas, bit) günlerinin getirileri (ilk gün bas'tan önceki kapanıştan) yıllık σ
 *   kararVolHedef(H, takvim, { n = 20, sigmaHedef, tavan = 2, bant = 0.10 })   N1 — w = min(tavan, σ_hedef/σ̂);
 *        |w − mevcut ağırlık| > bant ise dengele (ilk karar her zaman)
 *   rsi2Durum(H, { smaN = 200, rsiN = 2, esik = 10, cikisN = 5 }) → Uint8Array  N2 durum (giriş c > SMA200 ∧ RSI(2) < 10;
 *        çıkış c > SMA5; çıkış önce denetlenir)
 *   kararRsi2Dip(H, takvim, m, ayar?)   N2 — durumKarari (geçişte m/0; içerideyken ay başı m'ye dengele)
 *   kararMomentum(seri, uyeAylik, F, takvim, m, { K = 10, bak = 252, atla = 21, smaN = 200 })   N3 — ay sonu kapanışında:
 *        sonraki ayın üyeleri içinden 12-1 getirisi (k[j−atla]/k[j−bak] − 1) en yüksek K, her biri m/K;
 *        F (QQQ) kapanışı ≤ SMA200 ise hepsi 0 (nakit). Seçilmeyen elde tutulan → 0.
 */
const path = require('path');
const V = require('./nasdaqVeri');
const ROOT = path.join(__dirname, '..', '..');
const DE = require(path.join(ROOT, 'lib', 'strategies', 'donchianEnsemble'));
const { ogcDurum } = require('./bindirme');
const TK = require('./trendKurallari');
const KO = require(path.join(ROOT, 'lib', 'strategies', 'kitap', 'ortak'));
const ClenowKarsiTrend = require(path.join(ROOT, 'lib', 'strategies', 'kitap', 'clenowKarsiTrend'));
const ConnorsRsiGuc = require(path.join(ROOT, 'lib', 'strategies', 'kitap', 'connorsRsiGuc'));

const GUN = 864e5;
const KAYMA = 0.0005, BORC = 0.06, YILLIK = 252;
const GEL_BAS = Date.UTC(1990, 0, 1), HOL = Date.UTC(2016, 0, 1), HISSE_BAS = Date.UTC(2005, 0, 1);
const DON_AYAR = Object.freeze({ yillikGun: 252, kaldiracTavani: 1 });   // BIST ölçümüyle aynı uyarlama
const DCA_OLCEK = 2.94;                                                   // B Kalkan oranı (capraz-marj-sim.js)

// ═══ VERİ ═══════════════════════════════════════════════════════════════════
const takvimGunleri = () => V.takvim();

function seriHazirla(ad, satirlar, takvim) {
  const { bar, sonIdx } = V.hizala(satirlar, takvim);
  return { s: ad, satir: satirlar, bar, sonIdx, sonT: satirlar.length ? satirlar[satirlar.length - 1].t : -Infinity, k: satirlar.map(x => x.c) };
}
function endeksSerisi(takvim) { return seriHazirla('QQQ', V.ndxZinciri().satirlar, takvim); }
const _hisse = new Map();
function hisseSerisi(s, takvim) {
  const anahtar = s + '|' + takvim.length;
  if (!_hisse.has(anahtar)) _hisse.set(anahtar, V.seriVarMi(s) ? seriHazirla(s, V.duzeltilmis(s), takvim) : null);
  return _hisse.get(anahtar);
}
/** t'den önceki son işlem gününün indeksi (ilk karar kapanışı). */
function ilkIndeks(takvim, t) { let d = -1; for (let i = 0; i < takvim.length && takvim[i] < t; i++) d = i; return d; }
const kapanis = (H, d) => (H.sonIdx[d] >= 0 ? H.satir[H.sonIdx[d]].c : NaN);

// ═══ EVREN ══════════════════════════════════════════════════════════════════
const ayBasT = ay => Date.UTC(+ay.slice(0, 4), +ay.slice(5, 7) - 1, 1);
function bugunkuListe() { const u = V.uyelik(); const son = [...u.keys()].pop(); return V.uyeler(ayBasT(son)); }

/**
 * Aynı kural (nasdaqVeri.evren ile birebir: [A−30 g, A) $ hacim / işlem günü, ≥ 30 çubuk,
 * son çubuk ≤ 10 gün önce) ama aday listesi SABİT. Yalnız "bugünkü liste" bilgi koşusu için.
 */
function evrenListeden(A, liste, K) {
  const p0 = A - 30 * GUN, islemGunu = V.takvim(p0, A - 1).length || 1, puan = [];
  for (const s of liste) {
    if (!V.seriVarMi(s)) continue;
    const x = V.duzeltilmis(s);
    let lo = 0, hi = x.length - 1, son = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (x[m].t < A) { son = m; lo = m + 1; } else hi = m - 1; }
    if (son < 29 || A - x[son].t > 10 * GUN) continue;
    let top = 0; for (let j = son; j >= 0 && x[j].t >= p0; j--) top += x[j].dolar;
    puan.push({ s, puan: top / islemGunu });
  }
  puan.sort((a, b) => b.puan - a.puan || (a.s < b.s ? -1 : 1));
  return puan.slice(0, K).map(x => x.s);
}

function evrenAylik(K = 15, { liste = null } = {}) {
  const out = new Map();
  for (const ay of V.uyelik().keys()) {
    const A = ayBasT(ay);
    out.set(A, liste ? evrenListeden(A, liste, K) : V.evren(A, K).map(x => x.s));
  }
  return out;
}
const ayAnahtarUTC = t => { const x = new Date(t); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };
const ayGecis = (takvim, d) => d === takvim.length - 1 || ayAnahtarUTC(takvim[d + 1]) !== ayAnahtarUTC(takvim[d]);
function sonrakiAy(takvim, d) {
  if (d + 1 < takvim.length) return V.ayBasi(takvim[d + 1]);
  const x = new Date(takvim[d]); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1);
}

// ═══ SİMÜLATÖR ══════════════════════════════════════════════════════════════
function simule({ takvim, seri, karar, d0, dSon = takvim.length - 1, maliyet = KAYMA, borcFaizi = BORC, nakitGetiri = null }) {
  let nakit = 1, islem = 0, ucret = 0, faiz = 0;
  const poz = new Map(), bekleyen = new Map(), islemGunleri = new Set();
  const egri = [], brut = new Float64Array(dSon - d0 + 1);
  const ctx = { poz, seri, oz: 1, agirlik: null };
  for (let d = d0; d <= dSon; d++) {
    if (d > d0) {
      // 0. Gece: borç faizi / (bilgi) nakit getirisi.
      const dt = (takvim[d] - takvim[d - 1]) / GUN;
      if (nakit < 0) { const f = -nakit * borcFaizi * dt / 365; nakit -= f; faiz += f; }
      else if (nakitGetiri && nakit > 0) nakit *= 1 + nakitGetiri(d);
      // 1. Verisi biten sembol → son kapanıştan nakde.
      for (const [s, u] of [...poz]) {
        const H = seri.get(s);
        if (H.bar[d] || takvim[d] <= H.sonT) continue;
        const f = H.satir[H.satir.length - 1].c;
        nakit += u * f - Math.abs(u) * f * maliyet; ucret += Math.abs(u) * f * maliyet;
        poz.delete(s); bekleyen.delete(s); islem++;
      }
      // 2. Dünün kararı bugünün açılışında.
      if (bekleyen.size) {
        let oz = nakit;
        for (const [s, u] of poz) { const H = seri.get(s); oz += u * (H.bar[d] ? H.bar[d].o : kapanis(H, d - 1)); }
        for (const [s, w] of [...bekleyen]) {
          const H = seri.get(s), b = H.bar[d];
          if (!b) { if (takvim[d] > H.sonT) bekleyen.delete(s); continue; }   // işlem yok → bekler
          bekleyen.delete(s);
          const mevcut = poz.get(s) || 0, istenen = w * oz / b.o, fark = istenen - mevcut;
          if (Math.abs(fark * b.o) < 1e-12) continue;
          const u = Math.abs(fark) * b.o * maliyet;
          nakit -= fark * b.o + u; ucret += u; islem++; islemGunleri.add(d);
          if (Math.abs(istenen * b.o) < 1e-12) poz.delete(s); else poz.set(s, istenen);
        }
      }
    }
    // 3. Kapanış özsermayesi ve karar.
    let oz = nakit, br = 0;
    for (const [s, u] of poz) { const c = kapanis(seri.get(s), d); oz += u * c; br += Math.abs(u * c); }
    egri.push({ time: takvim[d], oz: Math.max(oz, 1e-12) });
    brut[d - d0] = oz > 0 ? br / oz : 0;
    if (oz <= 0) break;
    ctx.oz = oz;
    ctx.agirlik = s => { const u = poz.get(s); return u ? u * kapanis(seri.get(s), d) / oz : 0; };
    if (d < dSon) {
      const k = karar(d, ctx);
      if (k) for (const [s, w] of Object.entries(k)) bekleyen.set(s, w);
    }
  }
  return { egri, brut, islem, islemGunu: islemGunleri.size, ucret, faiz, d0 };
}

function alTut(H, takvim, d0, { maliyet = KAYMA, dSon = takvim.length - 1 } = {}) {
  const seri = new Map([[H.s, H]]);
  let alindi = false;
  return simule({ takvim, seri, d0, dSon, maliyet, karar: () => { if (alindi) return null; alindi = true; return { [H.s]: 1 / (1 + maliyet) }; } });   // kayma dahil tüm nakit → borç yok
}

// ═══ GETİRİ AKIŞI (doğrusal birleşim) ══════════════════════════════════════
function egriGetiri(egri, brut = null) {
  const ts = [], r = [], u = [];
  for (let i = 1; i < egri.length; i++) { ts.push(egri[i].time); r.push(egri[i].oz / egri[i - 1].oz - 1); u.push(brut ? brut[i] : 0); }
  return { ts, r, u, t0: egri[0].time };
}
/** u[i] = i günü KAPANIŞINDAKİ brüt maruziyet; i günü borcu (i−1 kapanışından i'ye) u[i−1]'den. */
function akisOlcekle(a, m, { borcFaizi = BORC, u0 = 0 } = {}) {
  const r = [], u = [];
  for (let i = 0; i < a.r.length; i++) {
    const once = i ? a.u[i - 1] : u0, dt = (a.ts[i] - (i ? a.ts[i - 1] : a.t0)) / GUN;
    r.push(m * a.r[i] - Math.max(0, m * once - 1) * borcFaizi * dt / 365);
    u.push(m * a.u[i]);
  }
  return { ts: a.ts, r, u, t0: a.t0 };
}
function akisEgri(ts, r, t0) {
  let oz = 1; const e = [{ time: t0, oz }];
  for (let i = 0; i < ts.length; i++) { oz *= 1 + r[i]; e.push({ time: ts[i], oz: Math.max(oz, 1e-12) }); }
  return e;
}

// ═══ METRİKLER ══════════════════════════════════════════════════════════════
/**
 * portfoySim.metrik tanımı; farklar: yıllıklaştırma (vars. 252 işlem günü) ve dilim başı.
 * [bas, bit) dilimi bas'tan önceki SON kapanıştan başlar (denetim 2026-10-07): aksi hâlde dilimin ilk
 * işlem gününün getirisi (ör. 2016-01-04, 2022-01-03) ne önceki ne bu dilime girerdi.
 * varlik-tarama.js metrik ile aynı tanım. (portfoySim.metrik hâlâ eski tanımda — BTC ölçümleri.)
 */
function metrik(egri, bas = -Infinity, bit = Infinity, yillik = YILLIK) {
  let i0 = egri.findIndex(x => x.time >= bas); if (i0 < 0) return null; if (i0 > 0) i0--;
  const e = egri.slice(i0).filter(x => x.time < bit);
  if (e.length < 20) return null;
  const r = e.slice(1).map((x, i) => x.oz / e[i].oz - 1);
  const o = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - o) ** 2, 0) / (r.length - 1));
  let tepe = e[0].oz, dd = 0, suAlti = 0, enUzun = 0;
  for (const x of e) { if (x.oz >= tepe) { tepe = x.oz; suAlti = 0; } else { suAlti++; enUzun = Math.max(enUzun, suAlti); } dd = Math.max(dd, 1 - x.oz / tepe); }
  const yil = (e[e.length - 1].time - e[0].time) / (365.25 * GUN);
  const top = e[e.length - 1].oz / e[0].oz - 1;
  const cagr = top > -1 ? Math.pow(1 + top, 1 / yil) - 1 : -1;
  return { sharpe: sd > 0 ? o / sd * Math.sqrt(yillik) : 0, cagr, maxDD: dd, toplam: top, vol: sd * Math.sqrt(yillik), enUzunSuAltiGun: enUzun, calmar: dd > 0 ? cagr / dd : null };
}
function esliGetiri(a, b, bas = -Infinity, bit = Infinity) {
  const gb = new Map(); for (let i = 1; i < b.length; i++) gb.set(b[i].time, b[i].oz / b[i - 1].oz - 1);
  const out = [];
  for (let i = 1; i < a.length; i++) { const t = a[i].time; if (t < bas || t >= bit || !gb.has(t)) continue; out.push([a[i].oz / a[i - 1].oz - 1, gb.get(t)]); }
  return out;
}
/** bindirme.bootstrapP ile aynı ayar (b 20, N 2000, tohum 99, H = gün sayısı). */
function bootstrapP(satirlar, { N = 2000 } = {}) {
  const O = require('../risk/olcum');
  const k = O.duraganBootstrap(satirlar, { b: 20, N, H: satirlar.length, tohum: 99, olc: (yol) => { let a = 1, c = 1; for (const [p, q] of yol) { a *= 1 + p; c *= 1 + q; } return a > c ? 1 : 0; } });
  return k.reduce((x, y) => x + y, 0) / k.length;
}
function yillik(egri) {
  const y = {}; let o = egri[0].oz;
  for (const x of egri) { const a = new Date(x.time).getUTCFullYear(); if (!y[a]) y[a] = { b: o }; y[a].s = x.oz; o = x.oz; }
  return Object.entries(y).map(([yil, v]) => ({ yil: +yil, getiri: v.s / v.b - 1 }));
}

// Deflated Sharpe (altut-asama6.js ile aynı formül; srListe = denemelerin GÜNLÜK geliştirme Sharpe'ları).
function ndtri(p) { const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]; const q = Math.min(p, 1 - p); let x; if (q > 0.02425) { const u = q - 0.5, r = u * u; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * u / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); } else { const u = Math.sqrt(-2 * Math.log(q)); x = (((((c[0] * u + c[1]) * u + c[2]) * u + c[3]) * u + c[4]) * u + c[5]) / ((((d[0] * u + d[1]) * u + d[2]) * u + d[3]) * u + 1); return p < 0.5 ? x : -x; } return p > 0.5 ? -x : x; }
const ncdf = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), y = 1 - 0.3989423 * Math.exp(-x * x / 2) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x >= 0 ? y : 1 - y; };
function gunlukSharpe(r) { const o = r.reduce((a, b) => a + b, 0) / r.length; const s = Math.sqrt(r.reduce((a, b) => a + (b - o) ** 2, 0) / (r.length - 1)); return s > 0 ? o / s : 0; }
function dsr(rDev, srListe, deneme) {
  const T = rDev.length, o = rDev.reduce((a, b) => a + b, 0) / T;
  const s = Math.sqrt(rDev.reduce((a, b) => a + (b - o) ** 2, 0) / (T - 1)), sr = o / s;
  const sk = rDev.reduce((a, b) => a + ((b - o) / s) ** 3, 0) / T, ku = rDev.reduce((a, b) => a + ((b - o) / s) ** 4, 0) / T;
  const m = srListe.reduce((a, b) => a + b, 0) / srListe.length, v = srListe.reduce((a, b) => a + (b - m) ** 2, 0) / (srListe.length - 1);
  const g = 0.5772156649, sr0 = Math.sqrt(v) * ((1 - g) * ndtri(1 - 1 / deneme) + g * ndtri(1 - 1 / (deneme * Math.E)));
  return ncdf((sr - sr0) * Math.sqrt(T - 1) / Math.sqrt(1 - sk * sr + (ku - 1) / 4 * sr * sr));
}

// ═══ STRATEJİLER — tek varlık (QQQ/NDX zinciri) ═════════════════════════════
/** Durum dizisi (j kapanışında 0|1) → karar: geçişte m / 0; içerideyken ay sonunda m'ye dengele. */
function durumKarari(H, takvim, durum, m) {
  return (d) => {
    const j = H.sonIdx[d]; if (j < 0) return null;
    if (!H.bar[d]) return null;                                  // bugün yeni kapanış yok
    const w = durum[j] ? m : 0, once = j > 0 ? durum[j - 1] : 0;
    if (durum[j] !== once) return { [H.s]: w };
    if (durum[j] && ayGecis(takvim, d)) return { [H.s]: w };     // ay başı dengesi (bindirme ile aynı)
    return null;
  };
}
const kararOgc = (H, takvim, m, ogcAyar = undefined) => durumKarari(H, takvim, ogcDurum(H.k, ogcAyar).durum, m);   // ogcAyar: { hizli, cikis, yavas } (yalnız duyarlılık sınavı)
const kararBollinger = (H, takvim, m) => durumKarari(H, takvim, Array.from(TK.durumlar(H.k, 'C1')), m);

/** Donchian durumunu bir serinin TÜM satırlarında kesintisiz yürüt (yalnız ≤ i veri). */
const _don = new Map();
function donchianDizi(H, ayar = DON_AYAR) {
  const anahtar = ayar === DON_AYAR ? H.s : H.s + '|' + JSON.stringify(ayar);
  if (_don.has(anahtar) && _don.get(anahtar).n === H.k.length) return _don.get(anahtar);
  let durum = DE.yeniDurum(ayar); const kap = [], mar = new Float64Array(H.k.length), isl = new Uint8Array(H.k.length);
  for (let i = 0; i < H.k.length; i++) {
    kap.push(H.k[i]);
    const r = DE.adim(durum, kap, ayar); durum = r.durum; mar[i] = r.maruziyet; isl[i] = r.islemGerekli ? 1 : 0;
  }
  const o = { mar, isl, n: H.k.length }; _don.set(anahtar, o); return o;
}
/** Donchian ayarı, pencereler × f (yuvarlanmış, ≥ 2) — yalnız ±%20 plato DUYARLILIK sınavı için. */
function donAyarOlcekli(f) { return Object.freeze({ ...DON_AYAR, pencereler: DE.VARSAYILAN.pencereler.map(N => Math.max(2, Math.round(N * f))) }); }
/**
 * Uygulama gecikmesi sınavı: d kapanışındaki karar d+1 kapanışında iletilir → d+2 açılışında uygulanır.
 * Karar üreticisi yine HER GÜN çağrılır (iç durumu bozulmaz); ctx'ye bağlı karar (Clenow) gecikmede eski ağırlığı görür.
 */
function gecikmeli(karar, gun = 1) {
  const kuyruk = [];
  return (d, ctx) => {
    kuyruk.push(karar(d, ctx));
    if (kuyruk.length <= gun) return null;
    return kuyruk.shift();
  };
}
function kararDonchianTek(H, takvim, m, ayar = DON_AYAR) {
  const x = donchianDizi(H, ayar); let ilk = true;
  return (d) => {
    const j = H.sonIdx[d]; if (j < 0 || !H.bar[d]) return null;
    if (ilk || x.isl[j]) { ilk = false; return { [H.s]: m * x.mar[j] }; }
    return null;
  };
}

// ═══ STRATEJİLER — hisse portföyü (aylık nokta-zamanlı evren, n = evren büyüklüğü) ══
function evrenIzleyici(evrenMap, takvim) {
  let ev = null;
  return (d) => {
    if (ev !== null && !ayGecis(takvim, d)) return { ev, yeni: null, cikan: [] };
    const yeni = evrenMap.get(sonrakiAy(takvim, d)) || [];
    const cikan = ev ? ev.filter(s => !yeni.includes(s)) : [];
    const gelen = yeni.filter(s => !ev || !ev.includes(s));
    ev = yeni; return { ev, yeni: gelen, cikan };
  };
}
function kararDonchianPortfoy(seri, evrenMap, takvim, m, ayar = DON_AYAR) {
  const iz = evrenIzleyici(evrenMap, takvim);
  return (d) => {
    const { ev, yeni, cikan } = iz(d), o = {}, n = ev.length || 1;
    for (const s of cikan) o[s] = 0;
    for (const s of ev) {
      const H = seri.get(s), j = H.sonIdx[d]; if (j < 0) continue;
      const x = donchianDizi(H, ayar);
      if ((yeni && yeni.includes(s)) || (H.bar[d] && x.isl[j])) o[s] = m * x.mar[j] / n;
    }
    return Object.keys(o).length ? o : null;
  };
}

/**
 * Kitap kuralları (ClenowKarsiTrend / ConnorsRsiGuc sınıflarının p() varsayılanları ve
 * ortak.js göstergeleri) karar-kapanış / uygulama-ertesi-açılış biçiminde. Sınıf
 * motorda sinyal barının kapanışında dolar; ön-kayıt ertesi açılış ister.
 */
const CLENOW_P = new ClenowKarsiTrend({}).p(), CONNORS_P = new ConnorsRsiGuc({}).p();
function clenowGosterge(H) {
  if (H._cl) return H._cl;
  const c = H.k, p = CLENOW_P, tepe = new Array(c.length).fill(null);
  for (let i = p.tepe - 1; i < c.length; i++) { let t = -Infinity; for (let j = i - p.tepe + 1; j <= i; j++) if (c[j] > t) t = c[j]; tepe[i] = t; }
  H._cl = { hizli: KO.ema(c, p.hizli), yavas: KO.ema(c, p.yavas), std: KO.stdDegisim(c, p.vol), tepe };
  return H._cl;
}
function connorsGosterge(H) {
  if (H._cn) return H._cn;
  H._cn = { ma: KO.sma(H.k, CONNORS_P.ma), r: KO.rsi(H.k, CONNORS_P.rsiN) };
  return H._cn;
}
/** Tek varlık (evrenMap null) ya da portföy. Brüt toplam m'yi aşamaz (Reg-T): yeni giriş sığdığı kadar. */
function kararClenow(seriVeyaH, evrenMap, takvim, m) {
  const tek = !evrenMap, seri = tek ? new Map([[seriVeyaH.s, seriVeyaH]]) : seriVeyaH;
  const iz = tek ? null : evrenIzleyici(evrenMap, takvim), p = CLENOW_P;
  const giris = new Map();   // s → giriş sinyali satır indeksi
  return (d, ctx) => {
    const ev = tek ? [seriVeyaH.s] : null, o = {};
    let liste = ev;
    if (!tek) { const e = iz(d); liste = e.ev; for (const s of e.cikan) { if (giris.has(s)) { giris.delete(s); o[s] = 0; } } }
    let brut = 0; for (const s of giris.keys()) brut += ctx.agirlik(s);
    for (const s of liste) {
      const H = seri.get(s), j = H.sonIdx[d]; if (j < 0 || !H.bar[d]) continue;
      const g = clenowGosterge(H);
      if (g.hizli[j] == null || g.yavas[j] == null || g.std[j] == null || g.tepe[j] == null || !(g.std[j] > 0)) continue;
      const trend = g.hizli[j] > g.yavas[j];
      if (giris.has(s)) {
        if (!trend || j - giris.get(s) >= p.tutma) { giris.delete(s); o[s] = 0; brut -= ctx.agirlik(s); }
        continue;
      }
      if (trend && (H.k[j] - g.tepe[j]) / g.std[j] < p.dip) {
        const w = Math.min(m * p.risk * H.k[j] / g.std[j], Math.max(0, m - brut));
        if (w > 1e-6) { giris.set(s, j); o[s] = w; brut += w; }
      }
    }
    return Object.keys(o).length ? o : null;
  };
}
function kararConnors(seriVeyaH, evrenMap, takvim, m) {
  const tek = !evrenMap, seri = tek ? new Map([[seriVeyaH.s, seriVeyaH]]) : seriVeyaH;
  const iz = tek ? null : evrenIzleyici(evrenMap, takvim), p = CONNORS_P;
  const birim = new Map();
  const W1 = 0.475, W2 = 0.475 + 0.95 * (1 - 0.475);   // 1. birim nakdin %47,5'i; 2. birim kalan nakdin %95'i
  return (d) => {
    const o = {}; let liste, n;
    if (tek) { liste = [seriVeyaH.s]; n = 1; }
    else { const e = iz(d); liste = e.ev; n = e.ev.length || 1; for (const s of e.cikan) if (birim.has(s)) { birim.delete(s); o[s] = 0; } }
    for (const s of liste) {
      const H = seri.get(s), j = H.sonIdx[d]; if (j < 0 || !H.bar[d]) continue;
      const g = connorsGosterge(H); if (g.ma[j] == null || g.r[j] == null) continue;
      const b = birim.get(s) || 0;
      if (b) {
        if (g.r[j] > p.cikis) { birim.delete(s); o[s] = 0; }
        else if (b === 1 && g.r[j] < p.ek) { birim.set(s, 2); o[s] = m * W2 / n; }
      } else if (H.k[j] > g.ma[j] && g.r[j] < p.giris) { birim.set(s, 1); o[s] = m * W1 / n; }
    }
    return Object.keys(o).length ? o : null;
  };
}

// ═══ S3 DCA — motor segmentleri (capraz-marj-sim.js dcaSegment uyarlaması) ═══
/**
 * Her hisse için evrende kesintisiz kaldığı aylar = bir segment. Segment motorla (dca_bot varsayılanları,
 * baseOrder/safeOrder × 2,94, 1x, 'perpetual' kipinde: taker = kayma %0,05, funding 0 → spot 1x eşdeğeri)
 * 60 bar ısınma önekiyle koşar; girişler segment başından itibaren. Motor BO'yu sinyal barı KAPANIŞINDA,
 * güvenlik emirlerini/TP'yi bar içi LİMİT seviyesinde doldurur (ön-kayıtın "ertesi açılış" kuralından sapma).
 * Segment sonunda açık deal varsa kayma kadar çıkış maliyeti son güne yazılır.
 * Portföy = o gün aktif segmentlerin eşit ortalaması; u = aktif segmentlerin ortalama brüt maruziyeti.
 */
function dcaPortfoy(evrenMap, takvim, { dSon = takvim.length - 1, kayma = KAYMA, dcaAyar = null, onekBar = 60 } = {}) {
  const B = require(path.join(ROOT, 'lib', 'backtester'));
  const aylar = [...evrenMap.keys()].sort((a, b) => a - b);
  const tum = new Set([...evrenMap.values()].flat());
  const segler = []; let yetmeyen = 0, lik = 0, deal = 0;
  const sonT = takvim[dSon];
  for (const s of tum) {
    if (!V.seriVarMi(s)) continue;
    const x = V.duzeltilmis(s);
    let bas = null;
    for (let i = 0; i <= aylar.length; i++) {
      const icinde = i < aylar.length && evrenMap.get(aylar[i]).includes(s);
      if (icinde && bas == null) bas = aylar[i];
      if (!icinde && bas != null) {
        const bit = Math.min(i < aylar.length ? aylar[i] : Infinity, sonT + GUN);
        const g = dcaSegment(B, s, x, bas, bit, kayma, dcaAyar, onekBar); if (g) { segler.push(g); yetmeyen += g.yetmeyen; lik += g.lik; deal += g.deal; }
        bas = null;
      }
    }
  }
  const gun = new Map();
  for (const g of segler) for (const [t, v] of g.g) { if (!gun.has(t)) gun.set(t, []); gun.get(t).push([v, g.u.get(t) || 0]); }
  const ts = [], r = [], u = [];
  const d0 = ilkIndeks(takvim, aylar[0]);
  for (let d = d0 + 1; d <= dSon; d++) {
    const l = gun.get(takvim[d]); ts.push(takvim[d]);
    if (!l) { r.push(0); u.push(0); continue; }
    r.push(l.reduce((a, b) => a + b[0], 0) / l.length); u.push(l.reduce((a, b) => a + b[1], 0) / l.length);
  }
  return { ts, r, u, t0: takvim[d0], segment: segler.length, sermayeYetmeyen: yetmeyen, likidasyon: lik, deal };
}
function dcaSegment(B, s, x, bas, bit, kayma, dcaAyar = null, onekBar = 60) {
  const i0 = x.findIndex(z => z.t >= bas); if (i0 < 0) return null;
  let i1 = x.findIndex(z => z.t >= bit); if (i1 < 0) i1 = x.length;
  const onek = Math.min(i0, onekBar);
  const dilim = x.slice(i0 - onek, i1);
  if (dilim.length - onek < 5 || dilim.length < 35) return null;
  const mum = dilim.map(z => ({ time: z.t, open: z.o, high: z.h, low: z.l, close: z.c, volume: z.v }));
  const ayar = { marketType: 'perpetual', leverage: 1, contractSpecs: { taker: kayma, maker: kayma }, fundingPctPer8h: 0, baseOrder: 100 * DCA_OLCEK, safeOrder: 140 * DCA_OLCEK, ...(dcaAyar || {}) };
  const r = B.run('dca_bot', ayar, mum, 10000, '1d', { trace: false, girisBasi: Math.max(30, onek) });
  // Günlük miktar (deal kayıtlarından) → brüt maruziyet.
  const dq = new Map();
  const gunT = z => Math.floor(Date.parse(z) / GUN) * GUN;
  for (const dl of r.deals || []) {
    for (const e of dl.girisler) dq.set(gunT(e.zaman), (dq.get(gunT(e.zaman)) || 0) + e.miktar);
    for (const e of dl.cikislar || []) dq.set(gunT(e.zaman), (dq.get(gunT(e.zaman)) || 0) - e.miktar);
  }
  const g = new Map(), u = new Map();
  let once = null, q = 0, k = 0;
  for (const p of r.equityCurve) {
    const t = gunT(p.time);
    while (k < mum.length && mum[k].time < t) k++;
    q += dq.get(t) || 0; if (Math.abs(q) < 1e-9) q = 0;
    const c = mum[k] && mum[k].time === t ? mum[k].close : null;
    if (t >= bas) {
      if (once != null) { if (p.value <= 0) { g.set(t, -1); break; } g.set(t, p.value / once - 1); }
      if (c != null && p.value > 0) u.set(t, q * c / p.value);
    }
    once = p.value;
  }
  // Segment sonunda açık deal → piyasadan kapanış maliyeti (kayma) son güne.
  const tsSon = [...g.keys()].pop();
  if (tsSon != null && u.get(tsSon) > 0) g.set(tsSon, (1 + g.get(tsSon)) * (1 - u.get(tsSon) * kayma) - 1);
  return { s, bas, bit, g, u, deal: (r.deals || []).length, lik: r.liquidations || 0, yetmeyen: r.orderBook ? r.orderBook.sermayeYetmeyen || 0 : 0 };
}

// ═══ KOL ve S6 HÜCUM (doğrusal birleşim) ═══════════════════════════════════
/** Ortak günlere hizala (a.ts ⊂ takvim, b.ts ⊂ takvim; aynı başlangıç beklenir). */
function hizalaAkis(a, ts) {
  const m = new Map(a.ts.map((t, i) => [t, i]));
  return { ts, r: ts.map(t => (m.has(t) ? a.r[m.get(t)] : 0)), u: ts.map(t => (m.has(t) ? a.u[m.get(t)] : 0)) };
}
/** bindirme.veriYukle ters-vol formülü: w_i = (1/σ_a)/(1/σ_a + 1/σ_b), σ son 60 gün, slice(i−61, i−1). */
function tersVolKol(a, b) {
  const ts = a.ts.filter(t => b.ts.includes(t));
  const A = hizalaAkis(a, ts), Bk = hizalaAkis(b, ts);
  const sapma = (x) => { const o = x.reduce((p, q) => p + q, 0) / x.length; return Math.sqrt(x.reduce((p, q) => p + (q - o) ** 2, 0) / (x.length - 1)); };
  const w = ts.map((_, i) => { if (i < 61) return 0.5; const wa = 1 / (sapma(A.r.slice(i - 61, i - 1)) || 1e-6), wb = 1 / (sapma(Bk.r.slice(i - 61, i - 1)) || 1e-6); return wa / (wa + wb); });
  return { ts, t0: a.t0, w, r: ts.map((_, i) => w[i] * A.r[i] + (1 - w[i]) * Bk.r[i]), u: ts.map((_, i) => w[i] * A.u[i] + (1 - w[i]) * Bk.u[i]) };
}
/**
 * S6: r = r_S1 + k·m·r_kol − borç(u_S1 + k·m·u_kol − 1)+ ; maruziyetler DÜN kapanışından.
 * Reg-T brüt tavanı: u_S1 + m·u_kol > tavan ise kol k = (tavan − u_S1)/(m·u_kol) ile kırpılır.
 * nakitGetiri(t) (bilgi): pozitif nakit payı (1 − brüt) o günün getirisini alır.
 */
function hucum(s1, kol, m, { borcFaizi = BORC, nakitGetiri = null, tavan = 2 } = {}) {
  const ts = kol.ts, A = hizalaAkis(s1, ts);
  const r = [], u = []; let tavanGun = 0, uK = 0;
  const i0 = s1.ts.indexOf(kol.t0); let uS = i0 >= 0 ? s1.u[i0] : 0;   // S1 kol başından önce zaten koşuyor
  for (let i = 0; i < ts.length; i++) {
    const dt = (ts[i] - (i ? ts[i - 1] : kol.t0)) / GUN;
    let k = 1;
    if (uS + m * uK > tavan && uK > 0) { k = Math.max(0, (tavan - uS) / (m * uK)); tavanGun++; }
    const br = uS + k * m * uK;
    let x = A.r[i] + k * m * kol.r[i] - Math.max(0, br - 1) * borcFaizi * dt / 365;
    if (nakitGetiri && br < 1) x += (1 - br) * nakitGetiri(ts[i]);
    r.push(x);
    uS = A.u[i]; uK = kol.u[i]; u.push(uS + m * uK);
  }
  return { ts, t0: kol.t0, r, u, tavanGun };
}

// ═══ YENİ AİLELER — PLAN-PORTFOY.md ÖN-KAYIT A (N1–N3) ═══════════════════════
function gerceklesenSigma(k, n) {
  const o = new Float64Array(k.length).fill(NaN);
  for (let i = n; i < k.length; i++) {
    let t = 0, t2 = 0;
    for (let j = i - n + 1; j <= i; j++) { const r = k[j] / k[j - 1] - 1; t += r; t2 += r * r; }
    const v = (t2 - t * t / n) / (n - 1);
    o[i] = Math.sqrt(Math.max(v, 0) * YILLIK);
  }
  return o;
}
function donemSigma(H, bas, bit) {
  const s = H.satir; let i0 = s.findIndex(x => x.t >= bas); if (i0 < 1) i0 = 1;
  const r = [];
  for (let i = i0; i < s.length && s[i].t < bit; i++) r.push(s[i].c / s[i - 1].c - 1);
  const o = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - o) ** 2, 0) / (r.length - 1) * YILLIK);
}
function kararVolHedef(H, takvim, { n = 20, sigmaHedef, tavan = 2, bant = 0.10 } = {}) {
  if (!(sigmaHedef > 0)) throw new Error('kararVolHedef: sigmaHedef gerekli');
  const sig = gerceklesenSigma(H.k, n); let ilk = true;
  return (d, ctx) => {
    const j = H.sonIdx[d]; if (j < n || !H.bar[d] || !(sig[j] > 0)) return null;
    const w = Math.min(tavan, sigmaHedef / sig[j]);
    if (ilk || Math.abs(w - ctx.agirlik(H.s)) > bant) { ilk = false; return { [H.s]: w }; }
    return null;
  };
}
function rsi2Durum(H, { smaN = 200, rsiN = 2, esik = 10, cikisN = 5 } = {}) {
  const ma = KO.sma(H.k, smaN), ma5 = KO.sma(H.k, cikisN), r = KO.rsi(H.k, rsiN);
  const durum = new Uint8Array(H.k.length); let ic = 0;
  for (let i = 0; i < H.k.length; i++) {
    if (ic) { if (ma5[i] != null && H.k[i] > ma5[i]) ic = 0; }
    else if (ma[i] != null && r[i] != null && H.k[i] > ma[i] && r[i] < esik) ic = 1;
    durum[i] = ic;
  }
  return durum;
}
const kararRsi2Dip = (H, takvim, m, ayar = undefined) => durumKarari(H, takvim, Array.from(rsi2Durum(H, ayar)), m);
function kararMomentum(seri, uyeAylik, F, takvim, m, { K = 10, bak = 252, atla = 21, smaN = 200 } = {}) {
  const fMa = KO.sma(F.k, smaN);
  return (d, ctx) => {
    if (!ayGecis(takvim, d)) return null;
    const o = {};
    const jF = F.sonIdx[d];
    const acik = jF >= 0 && fMa[jF] != null && F.k[jF] > fMa[jF];
    let secilen = [];
    if (acik) {
      const puan = [];
      for (const s of uyeAylik.get(sonrakiAy(takvim, d)) || []) {
        const H = seri.get(s); if (!H) continue;
        const j = H.sonIdx[d]; if (j < bak) continue;
        if (takvim[d] - H.satir[j].t > 10 * GUN) continue;   // verisi kesilmiş
        puan.push({ s, p: H.k[j - atla] / H.k[j - bak] - 1 });
      }
      puan.sort((a, b) => b.p - a.p || (a.s < b.s ? -1 : 1));
      secilen = puan.slice(0, K).map(x => x.s);
    }
    for (const s of ctx.poz.keys()) if (!secilen.includes(s)) o[s] = 0;
    for (const s of secilen) o[s] = m / K;
    return Object.keys(o).length ? o : null;
  };
}

module.exports = {
  GUN, KAYMA, BORC, YILLIK, GEL_BAS, HOL, HISSE_BAS, DON_AYAR, DCA_OLCEK, CLENOW_P, CONNORS_P,
  takvimGunleri, seriHazirla, endeksSerisi, hisseSerisi, ilkIndeks, kapanis,
  evrenAylik, evrenListeden, bugunkuListe, ayGecis, sonrakiAy,
  simule, alTut, egriGetiri, akisOlcekle, akisEgri, hizalaAkis,
  metrik, esliGetiri, bootstrapP, yillik, dsr, gunlukSharpe,
  kararOgc, kararBollinger, kararDonchianTek, kararDonchianPortfoy, kararClenow, kararConnors, donchianDizi,
  donAyarOlcekli, gecikmeli,
  dcaPortfoy, tersVolKol, hucum,
  gerceklesenSigma, donemSigma, kararVolHedef, rsi2Durum, kararRsi2Dip, kararMomentum,
};
