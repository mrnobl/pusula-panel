/**
 * MARJ İZLEME — saatlik (PLAN-RISK.md P0 "marj oranı izleme"; ARASTIRMA-RISK.md L1.3 / L4).
 *
 * İki ölçü, borsanın KENDİ değerlerinden (yerel formül yok — canlıda borsa tek gerçek):
 *   · HESAP MARJ ORANI = toplam bakım marjı / marj bakiyesi (`fetchBalance().info`:
 *     totalMaintMargin / totalMarginBalance). %100 → Binance likide eder.
 *       ≥ %50 uyarı · ≥ %80 alarm.
 *   · POZİSYON LİKİDASYON MESAFESİ = |mark − likidasyon| / mark (`fetchPositions`).
 *       Felaket stopu likidasyondan UZAKTA kalıyorsa (long: likidasyon ≥ stop) stop hiç
 *       çalışmadan likidasyon gelir → alarm. Stop yoksa mesafe < %10 → alarm, < %20 → uyarı.
 * Saf fonksiyon; bildirim ve zamanlama çağıranda (bindirmeBot `_tik`).
 */
const ESIK = Object.freeze({ oranUyari: 0.5, oranAlarm: 0.8, mesafeUyari: 0.2, mesafeAlarm: 0.1 });

const sayi = (x) => { const v = +x; return Number.isFinite(v) ? v : null; };

/**
 * @param bakiye ccxt fetchBalance sonucu
 * @param pozisyonlar ccxt fetchPositions sonucu
 * @param stoplar { symbol: { fiyat, yon } } (KorumaEmri.durum.stoplar)
 */
function marjDurumu(bakiye, pozisyonlar = [], stoplar = {}, esik = ESIK) {
  const info = (bakiye && bakiye.info) || {};
  const bakim = sayi(info.totalMaintMargin), mb = sayi(info.totalMarginBalance);
  const oran = bakim != null && mb > 0 ? bakim / mb : null;
  const sonuc = { oran, seviye: 'normal', uyarilar: [], pozisyonlar: [] };
  const yukselt = (s) => { if (s === 'alarm' || (s === 'uyari' && sonuc.seviye === 'normal')) sonuc.seviye = s; };

  if (oran != null) {
    if (oran >= esik.oranAlarm) { yukselt('alarm'); sonuc.uyarilar.push(`hesap marj oranı %${(oran * 100).toFixed(1)} (≥ %${esik.oranAlarm * 100}; %100'de likidasyon)`); }
    else if (oran >= esik.oranUyari) { yukselt('uyari'); sonuc.uyarilar.push(`hesap marj oranı %${(oran * 100).toFixed(1)} (≥ %${esik.oranUyari * 100})`); }
  }

  for (const p of pozisyonlar) {
    const q = Math.abs(+p.contracts || 0);
    if (!(q > 0)) continue;
    const long = p.side !== 'short';
    const mark = sayi(p.markPrice), liq = sayi(p.liquidationPrice);
    const kisa = p.symbol.split('/')[0];
    const satir = { symbol: p.symbol, yon: long ? 'long' : 'short', mark, likidasyon: liq > 0 ? liq : null, mesafe: null, stop: null, likidasyonOnce: false };
    if (mark > 0 && liq > 0) satir.mesafe = Math.abs(mark - liq) / mark;
    const s = stoplar[p.symbol];
    if (s && s.fiyat > 0) satir.stop = s.fiyat;
    if (satir.likidasyon && satir.stop) {
      satir.likidasyonOnce = long ? satir.likidasyon >= satir.stop : satir.likidasyon <= satir.stop;
      if (satir.likidasyonOnce) { yukselt('alarm'); sonuc.uyarilar.push(`${kisa}: likidasyon ${liq} felaket stopundan (${s.fiyat}) ÖNCE geliyor`); }
    } else if (satir.mesafe != null) {
      if (satir.mesafe < esik.mesafeAlarm) { yukselt('alarm'); sonuc.uyarilar.push(`${kisa}: likidasyona %${(satir.mesafe * 100).toFixed(1)} (stop yok)`); }
      else if (satir.mesafe < esik.mesafeUyari) { yukselt('uyari'); sonuc.uyarilar.push(`${kisa}: likidasyona %${(satir.mesafe * 100).toFixed(1)} (stop yok)`); }
    }
    sonuc.pozisyonlar.push(satir);
  }
  const m = sonuc.pozisyonlar.filter(x => x.mesafe != null).sort((a, b) => a.mesafe - b.mesafe)[0];
  sonuc.enYakin = m ? { symbol: m.symbol, mesafe: m.mesafe } : null;
  return sonuc;
}

module.exports = { marjDurumu, ESIK };
