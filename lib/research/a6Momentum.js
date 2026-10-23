/**
 * A6 KESİTSEL MOMENTUM / TERS DÖNÜŞ + DOLAR-NÖTR L/S SİMÜLASYONU — TEK YER (deneme 565–566, PLAN-STRATEJI-AVI.md).
 * ═══════════════════════════════════════════════════════════════════════════
 * Geçmiş test (scripts/avi-gunluk.js: A1-G/H, A6-R, A6-M) ve ileri gölge (lib/ileri/momentumGolge.js, deneme 971,
 * PLAN-ILERI-MOMENTUM.md) kuralı BURADAN alır. 73.1'de betikten AYNEN çıkarıldı (yalnız global `seri` / `ts` / `MAL`
 * parametre oldu; işlem sırası aynı — eşdeğerlik scripts/ileri-momentum-selftest.js ve 73.1 karşılaştırma koşusu).
 *
 * `seri`: Map(sembol → { m: [{ time, open, high, low, close, volume }] (artan), indeks: Map(time → i), fon: Map(gün → funding toplamı) })
 *   — lib/research/pitVeri.yukle() biçimi (Binance USDⓈ-M perp günlük; gün = UTC 00:00 açılışlı mum).
 *
 * A6-M (566): her PAZAR kapanışında PIT ilk 30 (30 g ortalama dolar hacmi = hacim × kapanış, ≥ 90 mum geçmiş) içinde 14 mumluk
 *   getiri (kapanış / 14 mum önceki kapanış − 1) sıralanır; en yüksek 6 long / en düşük 6 short, her biri ±0,5/6 (dilim başına brüt
 *   1×, net 0); ≥ 12 geçerli sembol yoksa dilim boş. 2 dilim (2 hafta tutuş): her Pazar en eski dilim yenilenir, portföy = dilimlerin
 *   ortalaması. Karar t kapanışında, t+1 AÇILIŞINDA uygulanır (her Pazar tam yeniden dengeleme).
 * lsSim: birim tutulur (dengeleme arası kayar); listeden çıkan sembol son kapanıştan kapatılır; maliyet el değiştiren nominalin
 *   MAL'ı (%0,05 taker + %0,02 kayma = %0,07); funding gerçek (birim × kapanış × gün toplamı).
 * Saf işlevler; dosya / ağ yok.
 */
'use strict';

const GUN = 864e5;
const MAL = 0.0005 + 0.0002;
const A6M = Object.freeze({ n: 14, tutHafta: 2, ters: false, secim: 6, agirlik: 0.5 / 6, enAz: 12, evrenN: 30, hacimGun: 30, gecmisMum: 90 });
const A6R = Object.freeze({ n: 28, tutHafta: 4, ters: true });

const pazar = (t) => new Date(t).getUTCDay() === 0;   // Pazar kapanışı → Pazartesi açılışı

/** PIT günlük evren: ilk 30, 30 g dolar hacmi, ≥ 90 g geçmiş (t kapanışında). Önbellekli kapanış döner. */
function evren30Kur(seri) {
  const evrenOnb = new Map();
  return function evren30(t) {
    if (evrenOnb.has(t)) return evrenOnb.get(t);
    const p = [];
    for (const [s, x] of seri) {
      const i = x.indeks.get(t); if (i == null || i < 89) continue;
      let top = 0; for (let j = i - 29; j <= i; j++) top += x.m[j].volume * x.m[j].close;
      p.push([s, top / 30]);
    }
    p.sort((a, b) => b[1] - a[1]);
    const e = p.slice(0, 30).map(q => q[0]);
    evrenOnb.set(t, e); return e;
  };
}

/** n mumluk getiri (indise göre). */
function getiriN(seri, s, t, n) { const x = seri.get(s); const i = x.indeks.get(t); if (i == null || i < n) return null; return x.m[i].close / x.m[i - n].close - 1; }

/**
 * A6 karar işlevi (dilimli). → { karar(t) → Map | null, olusum: [{ t, q: beşte bir listeleri }], dilimler, secimler: [{ t, long, short }] }
 * `secimler` ileri gölge kaydı içindir (karar etkilenmez).
 */
function a6KararKur(seri, evren30, n, tutHafta, ters) {
  const dilimler = Array.from({ length: tutHafta }, () => null);   // her dilim: Map(sembol → ağırlık, dilim başına brüt 1x)
  let hafta = 0;
  const olusum = [];   // beşte bir analizi
  const secimler = [];
  const karar = (t) => {
    if (!pazar(t)) return null;
    const l = [];
    for (const s of evren30(t)) { const g = getiriN(seri, s, t, n); if (g != null) l.push([s, g]); }
    l.sort((a, b) => a[1] - b[1]);
    const w = new Map();
    if (l.length >= 12) {
      const dusuk = l.slice(0, 6), yuksek = l.slice(-6);
      const [L, Sh] = ters ? [dusuk, yuksek] : [yuksek, dusuk];
      for (const [s] of L) w.set(s, 0.5 / 6);
      for (const [s] of Sh) w.set(s, -0.5 / 6);
      if (l.length >= 30) olusum.push({ t, q: [0, 1, 2, 3, 4].map(k => l.slice(k * 6, k * 6 + 6).map(x => x[0])) });
      secimler.push({ t, gecerli: l.length, long: L.map(x => [x[0], x[1]]), short: Sh.map(x => [x[0], x[1]]) });
    } else secimler.push({ t, gecerli: l.length, long: [], short: [] });
    dilimler[hafta % tutHafta] = w; hafta++;
    const top = new Map();
    for (const d of dilimler) if (d) for (const [s, a] of d) top.set(s, (top.get(s) || 0) + a / tutHafta);
    return top;
  };
  return { karar, olusum, secimler };
}

/**
 * Dolar-nötr ağırlık portföyü. karar(t) → Map(sembol → ağırlık) | null (dengeleme yok); t KAPANIŞINDA, t+1 AÇILIŞINDA uygulanır.
 * Pozisyon birim olarak tutulur (dengeleme arası kayar). Listeden çıkan sembol son kapanıştan kapatılır.
 * Maliyet MAL el değiştiren nominal; funding gerçek (q × kapanış × gün toplamı).
 * @param ts günler (UTC 00:00 ms, artan) — ilk kararı ts[0] − 1 gün kapanışı.
 */
function lsSim({ seri, ts, karar, mal = MAL, tarih = (t) => new Date(t).toISOString().slice(0, 10) }) {
  const MAL_ = mal;
  const q = new Map(), sonKap = new Map();
  let nakit = 1, oncekiE = 1, bekleyen = null;
  const r = [], gi = [], rFon = [], rMal = [], longR = [], shortR = [];
  const delist = [];
  const bar = (s, t) => { const x = seri.get(s); const i = x.indeks.get(t); return i == null ? null : x.m[i]; };
  { const t0 = ts[0] - GUN; bekleyen = karar(t0); }
  for (const t of ts) {
    let fon = 0, mal = 0;
    for (const [s, u] of q) if (u && !bar(s, t)) { const f = sonKap.get(s); nakit += u * f - Math.abs(u) * f * MAL_; mal += Math.abs(u) * f * MAL_; q.set(s, 0); delist.push({ s, t: tarih(t), q: u > 0 ? 'long' : 'short' }); }
    const pozOnce = new Map(q), nakitOnce = nakit;
    if (bekleyen) {
      let Eo = nakit; for (const [s, u] of q) if (u) Eo += u * bar(s, t).open;
      for (const s of new Set([...q.keys(), ...bekleyen.keys()])) {
        const b = bar(s, t); if (!b) continue;
        const hedef = (bekleyen.get(s) || 0) * Eo / b.open, d = hedef - (q.get(s) || 0);
        if (Math.abs(d) < 1e-15) continue;
        nakit -= d * b.open + Math.abs(d) * b.open * MAL_; mal += Math.abs(d) * b.open * MAL_; q.set(s, hedef);
      }
      bekleyen = null;
    }
    // kötümser gün içi: long LOW, short HIGH — dengeleme öncesi ve sonrası pozisyonların kötüsü
    const kot = (nak, poz) => { let E = nak; for (const [s, u] of poz) if (u) { const b = bar(s, t); E += u * (b ? (u > 0 ? b.low : b.high) : sonKap.get(s)); } return E; };
    const Ek = Math.min(kot(nakitOnce, pozOnce), kot(nakit, q));
    let lP = 0, sP = 0;
    for (const [s, u] of q) {
      if (!u) continue; const b = bar(s, t);
      const f = seri.get(s).fon.get(t) || 0; if (f) { nakit -= u * b.close * f; fon -= u * b.close * f; }
      const ref = pozOnce.get(s) === u ? sonKap.get(s) : b.open;   // bugün işlem gördüyse açılıştan
      const pnl = u * (b.close - ref) - (f ? u * b.close * f : 0);
      if (u > 0) lP += pnl; else sP += pnl;
    }
    for (const [s] of q) { const b = bar(s, t); if (b) sonKap.set(s, b.close); }
    let E = nakit; for (const [s, u] of q) if (u) E += u * sonKap.get(s);
    r.push(E / oncekiE - 1); gi.push(Ek / oncekiE - 1); rFon.push(fon / oncekiE); rMal.push(-mal / oncekiE);
    longR.push(lP / oncekiE); shortR.push(sP / oncekiE);
    oncekiE = E;
    bekleyen = karar(t);
    // yeni sembollerin son kapanışı (karar verilen semboller için)
    if (bekleyen) for (const s of bekleyen.keys()) { const b = bar(s, t); if (b) sonKap.set(s, b.close); }
  }
  return { r, gi, rFon, rMal, longR, shortR, delist };
}

module.exports = { GUN, MAL, A6M, A6R, pazar, evren30Kur, getiriN, a6KararKur, lsSim };
