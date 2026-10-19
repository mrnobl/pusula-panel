/**
 * RİSK KATMANLARI — tek saf çekirdek `riskUygula`. ARASTIRMA-RISK.md §4.0–4.6.
 *
 * Backtest (araştırma simülasyonu) ve canlı (`donchianBot` → `yurutucu`) AYNI
 * fonksiyonu çağırır. G/Ç yapmaz; durum dışarıdan gelir (`durum.js`).
 *
 * İLKE: bir hedef katmanlardan geçerken YALNIZCA KÜÇÜLÜR (|çıkış| ≤ |giriş|,
 * işaret korunur ya da 0). Hiçbir katman büyütmez. Her karar `kararlar`a
 * yazılır — "neden pozisyonum küçük" sorusunun cevabı.
 *
 * Katmanlar (sırayla):
 *   L5.1 bayat veri        → sembolün verisi eskiyse o sembolde risk ARTIRILMAZ
 *   L5.5 kill hiyerarşisi  → K3: tepeden düşüş ≥ D3 → her şey 0 (mandallı, elle açılır)
 *                            K2: aylık kayıp ≥ limit → ×0,5 ay sonuna kadar
 *                            K1: günlük/haftalık kayıp ≥ limit → yeni risk yok
 *   L3.4 düşüş programı    → D1'den D2'ye çarpan 1 → 0,5 doğrusal (ayarla açılır; ablasyon)
 *   L1.1 tavanlar          → sembol başı |h| ≤ sembolTavan, brüt Σ|h| ≤ brutTavan
 *   L3.1 portföy vol       → σ_p > τ ise k = τ/σ_p (yalnız küçültür)
 *
 * Hedef birimi: özsermayenin katı olarak nominal, işaretli (+ long, − short).
 */
const VARSAYILAN = Object.freeze({
  sembolTavan: 0.6,          // ARASTIRMA-PORTFOY §6.3
  brutTavan: 2.0,            // Donchian kaynağıyla aynı
  tau: null,                 // portföy yıllık vol hedefi; null = L3.1 kapalı
  veriYasMaxMs: 26 * 3600e3, // günlük stratejide son kapanmış mum en çok 26 saat eski
  ddProgram: false,          // L3.4 — ablasyonla benimsenir (önceden kayıtlı kriter)
  esikler: null              // { D1, D2, D3, gunluk, haftalik, aylik } (lib/risk/esikler.json)
});

const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const kucult = (h, sinir) => sgn(h) * Math.min(Math.abs(h), Math.max(0, sinir));

/**
 * @param hedefler  { sembol: oran }
 * @param durum     { ozsermaye, hwm, gunBasi, haftaBasi, ayBasi, kill (0–3), killNedeni }
 * @param piyasa    { sembol: { mevcutOran, veriZamani } , _sigmaP?: yıllık, _simdi: ms }
 * @param ayarGirdi VARSAYILAN'ın üzerine
 */
function riskUygula(hedefler, durum = {}, piyasa = {}, ayarGirdi = {}) {
  const ayar = { ...VARSAYILAN, ...ayarGirdi };
  const e = ayar.esikler || {};
  const simdi = piyasa._simdi || Date.now();
  const cikis = { ...hedefler };
  const kararlar = [];
  const carpanlar = {};
  const mevcut = (s) => (piyasa[s] && Number.isFinite(piyasa[s].mevcutOran) ? piyasa[s].mevcutOran : 0);
  /** Yeni risk yok: hedef, mevcut pozisyonun büyüklüğünü (aynı yönde) aşamaz. */
  const riskArtirma = (s, neden) => {
    const m = mevcut(s), h = cikis[s];
    const yeni = sgn(h) === sgn(m) ? kucult(h, Math.abs(m)) : 0;
    if (yeni !== h) { kararlar.push({ katman: neden.katman, sembol: s, once: h, sonra: yeni, neden: neden.metin }); cikis[s] = yeni; }
  };

  // ── L5.1 bayat veri ─────────────────────────────────────────────────────
  for (const s of Object.keys(cikis)) {
    const p = piyasa[s];
    const yas = p && Number.isFinite(p.veriZamani) ? simdi - p.veriZamani : Infinity;
    if (yas > ayar.veriYasMaxMs) riskArtirma(s, { katman: 'L5.1', metin: `veri ${Number.isFinite(yas) ? Math.round(yas / 3600e3) + ' saat' : 'yok'} eski` });
  }

  // ── L5.5 kill hiyerarşisi ───────────────────────────────────────────────
  const E = durum.ozsermaye;
  const dd = E > 0 && durum.hwm > 0 ? 1 - E / durum.hwm : 0;
  const kayip = (bas) => (E > 0 && bas > 0 ? 1 - E / bas : 0);
  let kill = durum.kill || 0;
  let killNedeni = durum.killNedeni || null;
  if (e.D3 && dd >= e.D3 && kill < 3) { kill = 3; killNedeni = `tepeden düşüş %${(dd * 100).toFixed(1)} ≥ D3 %${(e.D3 * 100).toFixed(1)}`; }
  if (kill >= 3) {
    for (const s of Object.keys(cikis)) if (cikis[s] !== 0) { kararlar.push({ katman: 'L5.5 K3', sembol: s, once: cikis[s], sonra: 0, neden: killNedeni }); cikis[s] = 0; }
    carpanlar.kill = 0;
    return { hedefler: cikis, carpanlar, kararlar, kill, killNedeni, dd };
  }
  let periyotCarpan = 1;
  const kAy = kayip(durum.ayBasi), kHafta = kayip(durum.haftaBasi), kGun = kayip(durum.gunBasi);
  if (e.aylik && kAy >= e.aylik) { periyotCarpan = 0.5; kararlar.push({ katman: 'L5.5 K2', neden: `aylık kayıp %${(kAy * 100).toFixed(1)} ≥ %${(e.aylik * 100).toFixed(1)} → ×0,5` }); }
  const k1 = (e.gunluk && kGun >= e.gunluk) || (e.haftalik && kHafta >= e.haftalik);
  if (k1) for (const s of Object.keys(cikis)) riskArtirma(s, { katman: 'L5.5 K1', metin: `${kGun >= (e.gunluk || Infinity) ? 'günlük' : 'haftalık'} kayıp limiti` });

  // ── L3.4 düşüş programı ─────────────────────────────────────────────────
  let ddCarpan = 1;
  if (ayar.ddProgram && e.D1 && e.D2) {
    if (dd >= e.D2) ddCarpan = 0.5;
    else if (dd > e.D1) ddCarpan = 1 - 0.5 * (dd - e.D1) / (e.D2 - e.D1);
  }
  const genel = Math.min(periyotCarpan, ddCarpan);
  if (genel < 1) {
    for (const s of Object.keys(cikis)) cikis[s] *= genel;
    if (ddCarpan < 1) kararlar.push({ katman: 'L3.4', neden: `tepeden düşüş %${(dd * 100).toFixed(1)} → ×${ddCarpan.toFixed(2)}` });
  }
  carpanlar.periyot = periyotCarpan; carpanlar.dusus = ddCarpan;

  // ── L1.1 tavanlar ───────────────────────────────────────────────────────
  for (const s of Object.keys(cikis)) {
    if (Math.abs(cikis[s]) > ayar.sembolTavan) { kararlar.push({ katman: 'L1.1', sembol: s, once: cikis[s], sonra: sgn(cikis[s]) * ayar.sembolTavan, neden: `sembol tavanı ${ayar.sembolTavan}x` }); cikis[s] = sgn(cikis[s]) * ayar.sembolTavan; }
  }
  const brut = Object.values(cikis).reduce((t, h) => t + Math.abs(h), 0);
  if (brut > ayar.brutTavan) {
    const k = ayar.brutTavan / brut;
    for (const s of Object.keys(cikis)) cikis[s] *= k;
    kararlar.push({ katman: 'L1.1', neden: `brüt ${brut.toFixed(2)}x > ${ayar.brutTavan}x → ×${k.toFixed(3)}` });
    carpanlar.brut = k;
  }

  // ── L3.1 portföy oynaklık hedefi (yalnız küçültür) ──────────────────────
  if (ayar.tau && piyasa._sigmaP > ayar.tau) {
    const k = ayar.tau / piyasa._sigmaP;
    for (const s of Object.keys(cikis)) cikis[s] *= k;
    kararlar.push({ katman: 'L3.1', neden: `σ_p %${(piyasa._sigmaP * 100).toFixed(1)} > τ %${(ayar.tau * 100).toFixed(1)} → ×${k.toFixed(3)}` });
    carpanlar.vol = k;
  }

  // Güvence: hiçbir katman büyütmedi.
  for (const s of Object.keys(cikis)) {
    const h = hedefler[s] || 0;
    if (Math.abs(cikis[s]) > Math.abs(h) + 1e-12 || (cikis[s] !== 0 && sgn(cikis[s]) !== sgn(h))) {
      throw new Error(`riskUygula sözleşme ihlali: ${s} ${h} → ${cikis[s]}`);
    }
  }
  return { hedefler: cikis, carpanlar, kararlar, kill, killNedeni, dd };
}

/** Eşikleri τ'ya ölçekle: D(yeni) = D × τ / σ_kalibrasyon (kısa vadeli limitler de). */
function esikOlcekle(esikler, tau) {
  if (!esikler || !tau || !esikler.sigmaKalibrasyon) return esikler;
  const k = tau / esikler.sigmaKalibrasyon;
  const o = { ...esikler };
  for (const a of ['D1', 'D2', 'D3', 'gunluk', 'haftalik', 'aylik']) if (o[a] != null) o[a] = Math.min(0.9, o[a] * k);
  return o;
}

module.exports = { riskUygula, esikOlcekle, VARSAYILAN };
