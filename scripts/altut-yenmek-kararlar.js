/** PLAN-ALTUT-YENMEK aday karar fonksiyonları (betikler ortak). */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const V = require(path.join(ROOT, 'lib', 'research', 'pitVeri'));
const D = require(path.join(ROOT, 'lib', 'strategies', 'donchianEnsemble'));
const BTC = 'BTC/USDT:USDT', GUN = 864e5;
const ev = V.evrenKur(15);
const sma = (m, n) => (m.length >= n ? m.slice(-n).reduce((a, b) => a + b.close, 0) / n : null);
// ── Adaylar (karar fonksiyonları) ───────────────────────────────────────────
function btcTrend(N) {
  let durum = null;
  return (t, b) => {
    const m = b.gecmis(BTC, N);
    const s = sma(m, N); if (s == null) return null;
    const ac = m[m.length - 1].close > s;
    if (ac === durum) return null;
    durum = ac;
    return ac ? { [BTC]: 1 } : {};
  };
}
function btcDonchianKesir() {
  let durum = D.yeniDurum(), son = null;
  return (t, b) => {
    const m = b.gecmis(BTC, 400);
    const r = D.adim(durum, m.map(x => x.close));
    durum = r.durum;
    if (r.isiniyor) return null;
    const hedef = +(r.acikSayisi / 9).toFixed(4);
    if (hedef === son) return null;
    son = hedef;
    return hedef > 0 ? { [BTC]: hedef } : {};
  };
}
function rotasyon(k) {
  return (t, b) => {
    if (new Date(t).getUTCDay() !== 0) return null;        // Pazar kapanışı
    const btc = b.gecmis(BTC, 100);
    const s = sma(btc, 100);
    if (s == null || btc[btc.length - 1].close <= s) return {};   // rejim kapalı → nakit
    const evren = new Set([...(ev.get(V.ayBasi(t + GUN)) || []), BTC]);
    const puan = [];
    for (const sb of evren) {
      const m = b.gecmis(sb, 29);
      if (m.length < 29 || m[m.length - 1].time !== t) continue;
      const g = m[m.length - 1].close / m[0].close - 1;
      if (g > 0) puan.push([sb, g]);
    }
    puan.sort((x, y) => y[1] - x[1]);
    const sec = puan.slice(0, k);
    const w = {}; for (const [sb] of sec) w[sb] = 1 / k;   // bulunamayan pay nakitte
    return w;
  };
}

module.exports = { btcTrend, btcDonchianKesir, rotasyon, sma, BTC };
