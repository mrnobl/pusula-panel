/**
 * GENEL HEDEF-AĞIRLIK PORTFÖY SİMÜLATÖRÜ (günlük, PIT). PLAN-ALTUT-YENMEK.md.
 *
 * Sözleşme (ileriye bakma YOK):
 *   · t gününün KAPANIŞINDA `karar(t, baglam)` çağrılır; yalnız t ve öncesi
 *     veriyi görür (`baglam.gecmis(sembol, n)` t dahil son n mum).
 *   · Dönen ağırlıklar (özsermayenin katı, işaretli) t+1 AÇILIŞINDA uygulanır.
 *   · Ağırlığı değişmeyen sembolde birim korunur (her gün yeniden dengeleme yok)
 *     — `esik` (varsayılan 0) altındaki ağırlık değişimi işlem üretmez.
 *   · Maliyet: taker + kayma el değiştiren nominal üzerinden; gerçek funding
 *     (long pozitif oranda öder); listeden çıkan sembol son kapanıştan kapanır.
 *   · LİKİDASYON (izole, basit): bir pozisyonun gün içi aleyhe hareketi
 *     (low/high) girişe göre 1/kaldıraç − bakım marjı'nı aşarsa pozisyonun
 *     marjı kaybedilir. Kaldıraç = |ağırlık| > 1 iken pozisyon başı ağırlık;
 *     portföy brüt kaldıracı ayrıca raporlanır.
 */
const { yukle, GUN } = require('./pitVeri');

function simule(karar, secenek = {}) {
  const { bas = Date.UTC(2020, 8, 3), bit = Infinity, taker = 0.0005, kayma = 0.0002, esik = 0, bakim = 0.005, kayit = false, funding = true, spotMaliyet = 0.001 } = secenek;
  // SPOT KİPİ (funding: false): funding yok, kaldıraç/short yok (ağırlıklar [0,1]'e
  // kırpılır, toplam ≤ 1), komisyon spot taker %0,1. Uzun vadeli long tutan
  // stratejilerde vadeli funding'i 2020–26'da yıllık ~%10–40 maliyet (ölçüldü).
  const spot = !funding;
  const komisyon = spot ? spotMaliyet : taker;
  const { seri, takvim } = yukle();
  const gunler = takvim.filter(t => t >= bas - GUN && t <= bit);
  let nakit = 1;
  const poz = new Map();   // sembol → { birim, giris, agirlik }
  let bekleyen = null, ucret = 0, fon = 0, islem = 0, likidasyon = 0, aktifGun = 0;
  const egri = [], islemGunleri = new Set();
  const sonKapanis = new Map();

  const gecmis = (s, n, t) => {
    const x = seri.get(s); if (!x) return [];
    const i = x.indeks.get(t); if (i == null) return [];
    return x.m.slice(Math.max(0, i - n + 1), i + 1);
  };

  for (const t of gunler) {
    // 0. Listeden çıkan (bugün verisi yok) → son kapanıştan kapat.
    for (const [s, p] of poz) {
      if (seri.get(s).indeks.has(t)) continue;
      const f = sonKapanis.get(s);
      nakit += p.birim * f - Math.abs(p.birim) * f * (komisyon + kayma);
      poz.delete(s); islem++;
    }
    // 1. Dünün kararı bugünün açılışında.
    if (bekleyen) {
      let oz = nakit;
      for (const [s, p] of poz) { const i = seri.get(s).indeks.get(t); oz += p.birim * (i != null ? seri.get(s).m[i].open : sonKapanis.get(s)); }
      const tum = new Set([...poz.keys(), ...Object.keys(bekleyen)]);
      let degisti = false;
      for (const s of tum) {
        const x = seri.get(s); const i = x && x.indeks.get(t); if (i == null) continue;
        const acilis = x.m[i].open;
        const hedef = bekleyen[s] || 0;
        const mevcut = poz.get(s);
        // GERÇEK ağırlık (açılış fiyatıyla) — hedefle değil gerçekle kıyaslanır.
        // İlk sürüm saklanan HEDEF ağırlığa bakıyordu: evren değişince yeni sembol
        // 1/K alınırken drift etmiş eskiler kırpılmıyor, nakit eksiye düşüp gizli
        // kaldıraç birikiyordu (EW sepet %100 düşüş — 2026-10-07).
        const mevcutAg = mevcut && oz > 0 ? mevcut.birim * acilis / oz : 0;
        if (hedef === 0 && !mevcut) continue;
        if (Math.abs(hedef - mevcutAg) <= esik && !(hedef === 0 && mevcut)) continue;
        const istenen = hedef * oz / acilis, fark = istenen - (mevcut ? mevcut.birim : 0);
        if (Math.abs(fark) * acilis < 1e-9) continue;
        const fiyat = acilis * (1 + Math.sign(fark) * kayma);
        const u = Math.abs(fark) * fiyat * komisyon;
        nakit -= fark * fiyat + u; ucret += u + Math.abs(fark) * acilis * kayma; islem++; degisti = true;
        if (Math.abs(istenen) * acilis < 1e-9) poz.delete(s);
        else poz.set(s, { birim: istenen, giris: acilis, agirlik: hedef });
      }
      if (degisti) islemGunleri.add(t);
    }
    // 2. Gün içi likidasyon + funding.
    for (const [s, p] of [...poz]) {
      const x = seri.get(s), i = x.indeks.get(t); if (i == null) continue;
      const b = x.m[i];
      const L = Math.abs(p.agirlik);
      if (L > 1) {
        const esikHareket = 1 / L - bakim;
        const aleyhe = p.birim > 0 ? (p.giris - b.low) / p.giris : (b.high - p.giris) / p.giris;
        if (aleyhe >= esikHareket) {
          // Marj (nominal / kaldıraç) kaybedilir; pozisyon kapanır.
          const nominal = Math.abs(p.birim) * p.giris;
          nakit += p.birim * p.giris - nominal / L - nominal * 0.0125;   // tasfiye ücreti
          poz.delete(s); likidasyon++; islem++; islemGunleri.add(t);
          continue;
        }
      }
      const f = spot ? 0 : (x.fon.get(t) || 0);
      if (f) { const o = p.birim * b.close * f; nakit -= o; fon += o; }
    }
    for (const [s, x] of seri) { const i = x.indeks.get(t); if (i != null) sonKapanis.set(s, x.m[i].close); }
    // 3. Özsermaye ve karar.
    let oz = nakit;
    for (const [s, p] of poz) oz += p.birim * sonKapanis.get(s);
    if (t >= bas) { egri.push({ time: t, oz }); if (poz.size) aktifGun++; }
    if (oz <= 0) { egri.push({ time: t, oz: 1e-9 }); break; }
    const mevcutAgirlik = {};
    for (const [s, p] of poz) mevcutAgirlik[s] = p.birim * sonKapanis.get(s) / oz;
    // null = DEĞİŞİKLİK YOK (tut). Nesne = bu ağırlıklara yeniden dengele (eksik sembol → 0).
    bekleyen = karar(t, { gecmis: (s, n) => gecmis(s, n, t), seri, mevcutAgirlik, ozsermaye: oz });
    if (bekleyen && spot) {
      let top = 0;
      for (const k of Object.keys(bekleyen)) { bekleyen[k] = Math.max(0, Math.min(1, bekleyen[k] || 0)); top += bekleyen[k]; }
      if (top > 1) for (const k of Object.keys(bekleyen)) bekleyen[k] /= top;
    }
  }
  return { egri, ucret, fon, islem, likidasyon, islemGunu: islemGunleri.size, aktifGun };
}

/** Metrikler: [bas, bit) dilimi. */
function metrik(egri, bas = -Infinity, bit = Infinity) {
  const e = egri.filter(x => x.time >= bas && x.time < bit);
  if (e.length < 20) return null;
  const r = e.slice(1).map((x, i) => x.oz / e[i].oz - 1);
  const o = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - o) ** 2, 0) / (r.length - 1));
  let tepe = e[0].oz, dd = 0, suAlti = 0, enUzunSuAlti = 0;
  for (const x of e) { if (x.oz >= tepe) { tepe = x.oz; suAlti = 0; } else { suAlti++; enUzunSuAlti = Math.max(enUzunSuAlti, suAlti); } dd = Math.max(dd, 1 - x.oz / tepe); }
  const yil = (e[e.length - 1].time - e[0].time) / (365.25 * 864e5);
  const top = e[e.length - 1].oz / e[0].oz - 1;
  return { sharpe: sd > 0 ? o / sd * Math.sqrt(365) : 0, cagr: top > -1 ? Math.pow(1 + top, 1 / yil) - 1 : -1, maxDD: dd, toplam: top, vol: sd * Math.sqrt(365), enUzunSuAltiGun: enUzunSuAlti, calmar: dd > 0 ? (Math.pow(1 + top, 1 / yil) - 1) / dd : null };
}

module.exports = { simule, metrik };
