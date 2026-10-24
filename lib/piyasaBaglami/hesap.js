'use strict';
/**
 * PİYASA BAĞLAMI — SAF HESAPLAR (73.9). Ağ yok, dosya yok, saat yok (simdi parametre). Öz test: scripts/piyasa-baglami-selftest.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Hepsi YALNIZ BİLGİ: hiçbir çıktı bot kararına girmez (lib/live, lib/risk, engine, exchange bu dosyayı çağırmaz).
 *
 * OPSİYON (lib/ileriKayit 'opsiyon' anlık görüntüleri: OKX + Bybit + Binance, BTC ve ETH)
 *   Greek'ler borsanın kendi alanlarından DEĞİL, aynı Black-Scholes formülüyle burada hesaplanır (r = 0, vadeli fiyat F):
 *     d1 = (ln(F/K) + σ²T/2) / (σ√T) · alım deltası N(d1), satım N(d1) − 1 · gamma φ(d1) / (F σ √T)  (1 coin başına, $ başına)
 *   Üç borsanın greek birimleri farklı (OKX "PA" coin cinsinden, Bybit/Binance USD) — tek formül karşılaştırılabilirlik içindir.
 *   AÇIK POZİSYON COIN CİNSİNDEN: OKX oiCcy (coin), Bybit openInterest (1 kontrat = 1 coin), Binance sumOpenInterest (BTC/ETH opsiyon
 *   birimi 1 coin). → kontrat çarpanı 1 coin.
 *   GEX (gamma maruziyeti, 1 %'lik fiyat hareketi başına USD): Σ işaret × Γ × OI × S² × 0,01.
 *     İŞARET KURALI (yaygın "piyasa yapıcı" varsayımı, SpotGamma/Squeezemetrics geleneği): müşteriler alım SATAR, satım ALIR →
 *     piyasa yapıcı alımda uzun gamma (+), satımda kısa gamma (−). Bu bir VARSAYIMDIR; gerçek pozisyon yönü açık veride yok.
 *     Artı GEX = fiyat oynadıkça piyasa yapıcının ters yönde işlem yapması beklenir (oynaklığı bastırır); eksi = tersine.
 *   MAX PAIN (vade başına): opsiyon alıcılarına vadede ödenecek toplam iç değeri en aza indiren kullanım fiyatı (aday = o vadenin
 *     kullanım fiyatları): Σ_alım OI·max(K* − K, 0) + Σ_satım OI·max(K − K*, 0).
 *   ATM IV: ~30 günlük vade (7 günden kısa vadeler hariç, 30 güne en yakın), vadeli fiyata en yakın iki kullanım fiyatı arasında
 *     doğrusal; her kullanım fiyatında alım ve satım IV'sinin ortalaması (yalnız biri varsa o).
 *   25Δ ÇARPIKLIK: aynı vade; parada olmayan satımlar (K < F) delta −0,25'te, alımlar (K > F) +0,25'te deltaya göre doğrusal IV;
 *     çarpıklık = IV(satım 25Δ) − IV(alım 25Δ), oynaklık puanı. Artı = satım (koruma) daha pahalı.
 *   IV/ÇARPIKLIK SIRASI (rank): son 365 gün; (bugün − en düşük) / (en yüksek − en düşük). 365 günden az veri varsa HESAPLANMAZ —
 *     "veri birikiyor: N gün" (veri 73.3'ten beri birikir; geriye dönük indirilemez — Deribit Türkiye'den kapalı).
 *   PUT/CALL: toplam satım OI / toplam alım OI (coin).
 *   Opsiyon verisinde "ana borsa" = o coinin toplam OI'si en büyük borsa; IV ve çarpıklık yalnız ondan (farklı borsaların gülümsemeleri
 *   karıştırılmaz). GEX, max pain ve put/call üç borsanın toplamıdır.
 */

const GUN = 864e5;
const YIL = 365 * GUN;

const sayi = (x) => { if (x == null || x === '') return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
const ort = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
function medyan(a) {
  const l = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!l.length) return null;
  const m = l.length >> 1;
  return l.length % 2 ? l[m] : (l[m - 1] + l[m]) / 2;
}
function ss(a) {
  if (a.length < 2) return null;
  const m = ort(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
const gunStr = (t) => new Date(t).toISOString().slice(0, 10);

// ═══ 1. NORMAL DAĞILIM + BLACK-SCHOLES ═══════════════════════════════════════
function normPdf(x) { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }
/** Abramowitz–Stegun 7.1.26 (hata < 1,5e-7). */
function normCdf(x) {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}
/** @returns {{ delta, gamma } | null} — F vadeli fiyat, K kullanım, T yıl, iv ondalık (0,45), tip 'C' | 'P'. */
function bs({ F, K, T, iv, tip }) {
  if (!(F > 0) || !(K > 0) || !(T > 0) || !(iv > 0)) return null;
  const v = iv * Math.sqrt(T);
  const d1 = (Math.log(F / K) + v * v / 2) / v;
  const nd = normCdf(d1);
  return { delta: tip === 'P' ? nd - 1 : nd, gamma: normPdf(d1) / (F * v) };
}

// ═══ 2. OPSİYON ZİNCİRİ ══════════════════════════════════════════════════════
/** Vade günü → milisaniye (üç borsada vade 08:00 UTC). */
const vadeMs = (vade) => Date.parse(`${vade}T08:00:00Z`);

/**
 * Saf: ileriye kayıt opsiyon satırı → { kaynak, coin, sembol, vade, strike, tip, T, iv, oi, F } | null.
 * Borsa alanları: OKX ham.ozet.markVol / fwdPx, ham.oi.oiCcy · Bybit ham.markIv / underlyingPrice / openInterest ·
 * Binance ham.mark.markIV, ham.oi.sumOpenInterest (vadeli fiyat yok → aynı vadenin diğer borsa F'si ya da spot; çağıran verir).
 */
function opsiyonNorm(r, simdi) {
  if (!r || !r.vade || !(Number(r.strike) > 0) || (r.tip !== 'C' && r.tip !== 'P')) return null;
  const T = (vadeMs(r.vade) - simdi) / YIL;
  if (!(T > 0)) return null;
  const h = r.ham || {};
  let iv = null, oi = null, F = null;
  if (r.kaynak === 'okx') { iv = sayi(h.ozet && h.ozet.markVol); oi = sayi(h.oi && h.oi.oiCcy); F = sayi(h.ozet && h.ozet.fwdPx); }
  else if (r.kaynak === 'bybit') { iv = sayi(h.markIv); oi = sayi(h.openInterest); F = sayi(h.underlyingPrice); }
  else if (r.kaynak === 'binance') { iv = sayi(h.mark && h.mark.markIV); oi = sayi(h.oi && h.oi.sumOpenInterest); }
  else return null;
  return { kaynak: r.kaynak, coin: r.alt || String(r.sembol || '').split('-')[0], sembol: r.sembol, vade: r.vade, strike: Number(r.strike), tip: r.tip, T,
    iv: iv > 0.01 && iv < 10 ? iv : null, oi: oi > 0 ? oi : 0, F: F > 0 ? F : null };
}

/** Saf: eksik vadeli fiyatları doldurur (aynı coin + vade: diğer borsaların F medyanı; yoksa spot). Yerinde değiştirir. */
function vadeliDoldur(zincir, spot) {
  const harita = new Map();
  for (const x of zincir) if (x.F) { const k = `${x.coin}|${x.vade}`; (harita.get(k) || harita.set(k, []).get(k)).push(x.F); }
  for (const x of zincir) if (!x.F) { const l = harita.get(`${x.coin}|${x.vade}`); x.F = l && l.length ? medyan(l) : (spot > 0 ? spot : null); }
  return zincir;
}

/** Saf: GEX (USD / %1 hareket). @returns {{ toplam, alim, satim, kaynak: {okx,..}, kullanim: [{ strike, gex }] (|gex| büyükten, ilk 8), n }} */
function gex(zincir, S) {
  const out = { toplam: 0, alim: 0, satim: 0, kaynak: {}, kullanim: [], n: 0 };
  if (!(S > 0)) return null;
  const kul = new Map();
  for (const x of zincir) {
    if (!x.iv || !(x.oi > 0)) continue;
    const g = bs({ F: x.F || S, K: x.strike, T: x.T, iv: x.iv, tip: x.tip });
    if (!g) continue;
    const isaret = x.tip === 'C' ? 1 : -1;
    const v = isaret * g.gamma * x.oi * S * S * 0.01;
    out.toplam += v; out.n++;
    if (isaret > 0) out.alim += v; else out.satim += v;
    out.kaynak[x.kaynak] = (out.kaynak[x.kaynak] || 0) + v;
    kul.set(x.strike, (kul.get(x.strike) || 0) + v);
  }
  out.kullanim = [...kul.entries()].map(([strike, g]) => ({ strike, gex: g })).sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex)).slice(0, 8);
  return out.n ? out : null;
}

/** Saf: tek vadenin satırlarından max pain. @returns {{ strike, oi, odeme } | null} */
function maxPain(vadeSatirlari) {
  const l = vadeSatirlari.filter(x => x.oi > 0);
  if (!l.length) return null;
  const adaylar = [...new Set(l.map(x => x.strike))].sort((a, b) => a - b);
  let en = null;
  for (const k of adaylar) {
    let odeme = 0;
    for (const x of l) odeme += x.oi * (x.tip === 'C' ? Math.max(k - x.strike, 0) : Math.max(x.strike - k, 0));
    if (!en || odeme < en.odeme) en = { strike: k, odeme };
  }
  return { ...en, oi: l.reduce((s, x) => s + x.oi, 0) };
}

/** Saf: hedef güne en yakın vade (en az enAzGun gün kalan). */
function hedefVade(vadeler, simdi, hedefGun = 30, enAzGun = 7) {
  const l = [...new Set(vadeler)].map(v => ({ v, gun: (vadeMs(v) - simdi) / GUN })).filter(x => x.gun >= enAzGun);
  if (!l.length) return null;
  l.sort((a, b) => Math.abs(a.gun - hedefGun) - Math.abs(b.gun - hedefGun));
  return { vade: l[0].v, gun: l[0].gun };
}

/** Doğrusal ara değer: noktalar [{x, y}] x'e göre sıralı; dışarıdaysa null. */
function araDeger(noktalar, x) {
  const l = noktalar.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
  for (let i = 0; i < l.length - 1; i++) {
    const a = l[i], b = l[i + 1];
    if (x >= a.x && x <= b.x) return b.x === a.x ? (a.y + b.y) / 2 : a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
  }
  if (l.length === 1 && l[0].x === x) return l[0].y;
  return null;
}

/** Saf: tek borsa + tek vade satırlarından ATM IV (vadeli fiyatta). */
function atmIv(satirlar, F) {
  const kul = new Map();
  for (const x of satirlar) { if (!x.iv) continue; const k = kul.get(x.strike) || kul.set(x.strike, []).get(x.strike); k.push(x.iv); }
  const nokta = [...kul.entries()].map(([k, l]) => ({ x: k, y: ort(l) }));
  return araDeger(nokta, F);
}

/** Saf: tek borsa + tek vade satırlarından 25Δ çarpıklığı. @returns {{ satim25, alim25, carpiklik } | null} */
function carpiklik25(satirlar, F) {
  const p = [], c = [];
  for (const x of satirlar) {
    if (!x.iv) continue;
    const g = bs({ F, K: x.strike, T: x.T, iv: x.iv, tip: x.tip });
    if (!g) continue;
    if (x.tip === 'P' && x.strike < F) p.push({ x: g.delta, y: x.iv });
    if (x.tip === 'C' && x.strike > F) c.push({ x: g.delta, y: x.iv });
  }
  const satim25 = araDeger(p, -0.25), alim25 = araDeger(c, 0.25);
  if (satim25 == null || alim25 == null) return null;
  return { satim25, alim25, carpiklik: satim25 - alim25 };
}

/**
 * Saf: bir coinin opsiyon zinciri özeti.
 * @param satirlar ileriye kayıt opsiyon satırları (o coin, son anlık görüntü)  @param simdi ms  @param spot (yoksa vadeli fiyat medyanı)
 */
function opsiyonOzeti(satirlar, simdi, spot = null) {
  const zincir = satirlar.map(r => opsiyonNorm(r, simdi)).filter(Boolean);
  if (!zincir.length) return null;
  const enYakin = [...new Set(zincir.map(x => x.vade))].sort()[0];
  const S = spot > 0 ? spot : medyan(zincir.filter(x => x.vade === enYakin && x.F).map(x => x.F));
  vadeliDoldur(zincir, S);
  if (!(S > 0)) return null;
  const kaynaklar = {};
  for (const x of zincir) { const k = kaynaklar[x.kaynak] || (kaynaklar[x.kaynak] = { oi: 0, sozlesme: 0, alimOi: 0, satimOi: 0 }); k.oi += x.oi; k.sozlesme++; if (x.tip === 'C') k.alimOi += x.oi; else k.satimOi += x.oi; }
  const alimOi = zincir.filter(x => x.tip === 'C').reduce((s, x) => s + x.oi, 0), satimOi = zincir.filter(x => x.tip === 'P').reduce((s, x) => s + x.oi, 0);
  // Max pain: en yakın iki vade + en büyük OI'li vade
  const vadeOi = new Map();
  for (const x of zincir) vadeOi.set(x.vade, (vadeOi.get(x.vade) || 0) + x.oi);
  const vadeler = [...vadeOi.keys()].sort();
  const enBuyuk = [...vadeOi.entries()].sort((a, b) => b[1] - a[1])[0];
  const mpVadeler = [...new Set([...vadeler.slice(0, 2), enBuyuk && enBuyuk[0]].filter(Boolean))].sort();
  const mp = mpVadeler.map(v => ({ vade: v, gun: Math.max(0, (vadeMs(v) - simdi) / GUN), enBuyukOi: !!(enBuyuk && enBuyuk[0] === v), ...(maxPain(zincir.filter(x => x.vade === v)) || {}) })).filter(x => x.strike);
  // IV / çarpıklık: ana borsa
  const ana = Object.entries(kaynaklar).sort((a, b) => b[1].oi - a[1].oi)[0][0];
  const anaZ = zincir.filter(x => x.kaynak === ana);
  const hv = hedefVade(anaZ.map(x => x.vade), simdi);
  let iv = null;
  if (hv) {
    const vz = anaZ.filter(x => x.vade === hv.vade);
    const F = medyan(vz.map(x => x.F)) || S;
    const a = atmIv(vz, F), c = carpiklik25(vz, F);
    iv = { kaynak: ana, vade: hv.vade, gun: Math.round(hv.gun), F, atm: a, ...(c || { satim25: null, alim25: null, carpiklik: null }) };
  }
  return {
    S, sozlesme: zincir.length, kaynaklar, alimOi, satimOi, putCall: alimOi > 0 ? satimOi / alimOi : null,
    gex: gex(zincir, S), maxPain: mp, iv,
  };
}

/** Saf: günlük seri [{ gun, v }] + bugünkü değer → sıra (rank) — 365 günden azsa yeterli değil. */
function siraHesapla(seri, deger, { gunSayi = 365 } = {}) {
  const l = (seri || []).filter(x => x && Number.isFinite(x.v));
  const n = l.length;
  if (!Number.isFinite(deger)) return { n, yeterli: false, sira: null, enDusuk: null, enYuksek: null };
  const son = l.slice(-gunSayi);
  const vs = son.map(x => x.v);
  const enDusuk = vs.length ? Math.min(...vs) : null, enYuksek = vs.length ? Math.max(...vs) : null;
  if (n < gunSayi || enYuksek === enDusuk) return { n, yeterli: false, sira: null, enDusuk, enYuksek };
  return { n, yeterli: true, sira: (deger - enDusuk) / (enYuksek - enDusuk), enDusuk, enYuksek };
}

/** Saf: günlük seriye bugünün değerini yazar (aynı gün → üzerine; en çok `tavan` gün). Yeni dizi döner. */
function gunlukEkle(seri, gun, v, tavan = 800) {
  const l = (seri || []).filter(x => x.gun !== gun);
  if (Number.isFinite(v)) l.push({ gun, v });
  l.sort((a, b) => (a.gun < b.gun ? -1 : a.gun > b.gun ? 1 : 0));
  return l.slice(-tavan);
}

// ═══ 3. POZİSYONLANMA ═══════════════════════════════════════════════════════
/** Saf: z-skoru (son değer, pencerenin ortalamasına göre). */
function zSkor(degerler) {
  const l = degerler.filter(Number.isFinite);
  if (l.length < 2) return null;
  const s = ss(l);
  return s > 0 ? (l[l.length - 1] - ort(l)) / s : 0;
}

/**
 * Saf: Binance /futures/data satırları (ileriye kayıt 'pozisyon') → sembol başına saatlik seriler (zaman damgasına göre tekil, sıralı).
 * @returns {{ [sembol]: { oi: [{t, oi, usd}], ust: [{t, oran, uzun}], genel: [{t, oran}], taker: [{t, al, sat, oran}] } }}
 */
function pozisyonSerileri(satirlar) {
  const out = {};
  const yer = (s) => out[s] || (out[s] = { oi: new Map(), ust: new Map(), ustHesap: new Map(), genel: new Map(), taker: new Map() });
  for (const r of satirlar || []) {
    const h = r && r.ham; if (!h || !r.sembol) continue;
    const t = Number(h.timestamp); if (!Number.isFinite(t)) continue;
    const s = yer(r.sembol);
    const uc = String(r.uc || '');
    if (uc.endsWith('openInterestHist')) s.oi.set(t, { t, oi: sayi(h.sumOpenInterest), usd: sayi(h.sumOpenInterestValue) });
    else if (uc.endsWith('topLongShortPositionRatio')) s.ust.set(t, { t, oran: sayi(h.longShortRatio), uzun: sayi(h.longAccount) });
    else if (uc.endsWith('topLongShortAccountRatio')) s.ustHesap.set(t, { t, oran: sayi(h.longShortRatio), uzun: sayi(h.longAccount) });
    else if (uc.endsWith('globalLongShortAccountRatio')) s.genel.set(t, { t, oran: sayi(h.longShortRatio), uzun: sayi(h.longAccount) });
    else if (uc.endsWith('takerlongshortRatio')) s.taker.set(t, { t, al: sayi(h.buyVol), sat: sayi(h.sellVol), oran: sayi(h.buySellRatio) });
  }
  for (const s of Object.values(out)) for (const k of Object.keys(s)) s[k] = [...s[k].values()].sort((a, b) => a.t - b.t);
  return out;
}

/** Saf: bir sembolün pozisyonlanma ve akış özeti (saatlik seriler). */
function pozisyonOzeti(s, simdi) {
  if (!s) return null;
  const SAAT = 3600e3;
  const sonDeger = (l, alan) => { for (let i = l.length - 1; i >= 0; i--) if (Number.isFinite(l[i][alan])) return l[i]; return null; };
  const geri = (l, alan, ms) => { const son = sonDeger(l, alan); if (!son) return null; const hedef = son.t - ms; let en = null; for (const x of l) if (x.t <= hedef && Number.isFinite(x[alan])) en = x; return en; };
  const oiSon = sonDeger(s.oi, 'usd');
  const oi30 = s.oi.filter(x => oiSon && x.t > oiSon.t - 30 * 24 * SAAT && Number.isFinite(x.usd)).map(x => x.usd);
  const gunKapsam = s.oi.length ? (s.oi[s.oi.length - 1].t - s.oi[0].t) / (24 * SAAT) : 0;
  const deg = (a, b) => (a && b && b > 0 ? a / b - 1 : null);
  const o24 = geri(s.oi, 'usd', 24 * SAAT), o7 = geri(s.oi, 'usd', 7 * 24 * SAAT);
  const ustSon = sonDeger(s.ust, 'oran');
  const ust7 = s.ust.filter(x => ustSon && x.t > ustSon.t - 7 * 24 * SAAT).map(x => x.oran).filter(Number.isFinite);
  const genelSon = sonDeger(s.genel, 'oran');
  // Taker: son 24 sa ve 7 g toplamları; CVD = Σ(alım − satım) (coin); 7 günlük birikimli seri (saatlik)
  const takerSon = s.taker.length ? s.taker[s.taker.length - 1].t : null;
  const topla = (ms) => { let al = 0, sat = 0, n = 0; for (const x of s.taker) if (takerSon != null && x.t > takerSon - ms && Number.isFinite(x.al) && Number.isFinite(x.sat)) { al += x.al; sat += x.sat; n++; } return n ? { al, sat, oran: sat > 0 ? al / sat : null, cvd: al - sat, saat: n } : null; };
  let biriken = 0;
  const cvdSeri = takerSon == null ? [] : s.taker.filter(x => x.t > takerSon - 7 * 24 * SAAT && Number.isFinite(x.al) && Number.isFinite(x.sat)).map(x => { biriken += x.al - x.sat; return [x.t, biriken]; });
  const fiyat = oiSon && oiSon.oi > 0 ? oiSon.usd / oiSon.oi : null;
  return {
    sonZaman: oiSon ? oiSon.t : takerSon, gunKapsam: Math.round(gunKapsam * 10) / 10, fiyat,
    oi: oiSon ? { usd: oiSon.usd, adet: oiSon.oi, d24: deg(oiSon.usd, o24 && o24.usd), d7: deg(oiSon.usd, o7 && o7.usd), z30: oi30.length >= 7 * 24 ? zSkor(oi30) : null, zNokta: oi30.length } : null,
    ustPozisyon: ustSon ? { oran: ustSon.oran, uzun: ustSon.uzun, ort7: ort(ust7) } : null,
    genelHesap: genelSon ? { oran: genelSon.oran, uzun: genelSon.uzun } : null,
    taker: { s24: topla(24 * SAAT), g7: topla(7 * 24 * SAAT) },
    cvdSeri: seyrelt(cvdSeri, 84),
    simdi,
  };
}

/** Saf: seriyi en çok n noktaya indirir (eşit aralıklı örnek, son nokta korunur). */
function seyrelt(l, n) {
  if (!Array.isArray(l) || l.length <= n) return l || [];
  const out = [];
  const adim = (l.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(l[Math.round(i * adim)]);
  return out;
}

/**
 * Saf: Binance /fapi/v1/premiumIndex (tüm semboller) → funding özeti. lastFundingRate 8 saatlik (çoğu sembol); yıllık = × 3 × 365.
 * Piyasa geneli: USDT perp'lerin medyanı ve artı olanların payı.
 */
function fundingOzeti(liste) {
  const l = (Array.isArray(liste) ? liste : []).filter(x => /USDT$/.test(x.symbol)).map(x => ({ s: x.symbol, f: sayi(x.lastFundingRate), mark: sayi(x.markPrice), endeks: sayi(x.indexPrice), sonraki: sayi(x.nextFundingTime) })).filter(x => Number.isFinite(x.f));
  if (!l.length) return null;
  const tek = (s) => { const x = l.find(y => y.s === s); return x ? { oran: x.f, yillik: x.f * 3 * 365, prim: x.mark && x.endeks ? x.mark / x.endeks - 1 : null } : null; };
  const fl = l.map(x => x.f);
  return { BTC: tek('BTCUSDT'), ETH: tek('ETHUSDT'), medyan: medyan(fl), artiPay: fl.filter(x => x > 0).length / fl.length, sembol: fl.length,
    enYuksek: [...l].sort((a, b) => b.f - a.f).slice(0, 3).map(x => ({ s: x.s, oran: x.f })), enDusuk: [...l].sort((a, b) => a.f - b.f).slice(0, 3).map(x => ({ s: x.s, oran: x.f })) };
}

/** Saf: Binance /futures/data/basis satırları → son yıllık baz + 7 g ortalaması. */
function bazOzeti(satirlar) {
  const l = (Array.isArray(satirlar) ? satirlar : []).map(x => ({ t: sayi(x.timestamp), yillik: sayi(x.annualizedBasisRate), oran: sayi(x.basisRate), vadeli: sayi(x.futuresPrice), endeks: sayi(x.indexPrice) }))
    .filter(x => Number.isFinite(x.t) && Number.isFinite(x.yillik)).sort((a, b) => a.t - b.t);
  if (!l.length) return null;
  const son = l[l.length - 1];
  return { t: son.t, yillik: son.yillik, oran: son.oran, ort7: ort(l.filter(x => x.t > son.t - 7 * GUN).map(x => x.yillik)) };
}

/**
 * Saf: Hyperliquid clearinghouseState satırları (son koşu) → büyük hesapların net pozisyonu.
 * @returns {{ hesap, hesapDegeri, uzun, kisa, coinler: [{ coin, uzun, kisa, net, uzunHesap, kisaHesap }] (brüt büyükten, ilk 8), zaman }}
 */
function balinaOzeti(satirlar) {
  const l = (satirlar || []).filter(r => r && r.ham && r.uc === '/info clearinghouseState');
  if (!l.length) return null;
  const sonZ = Math.max(...l.map(r => Date.parse(r.zaman)).filter(Number.isFinite));
  const kos = l.filter(r => sonZ - Date.parse(r.zaman) <= 90 * 60e3);       // son koşu (saatte bir; ~100 adres birkaç dakikada)
  const adres = new Map();
  for (const r of kos) { const o = adres.get(r.adres); if (!o || Date.parse(r.zaman) > Date.parse(o.zaman)) adres.set(r.adres, r); }
  const coin = new Map();
  let hesapDegeri = 0, uzun = 0, kisa = 0;
  for (const r of adres.values()) {
    const m = r.ham.marginSummary || {};
    hesapDegeri += sayi(m.accountValue) || 0;
    for (const ap of r.ham.assetPositions || []) {
      const p = ap && ap.position; if (!p) continue;
      const szi = sayi(p.szi), deger = Math.abs(sayi(p.positionValue) || 0);
      if (!szi || !deger) continue;
      const c = coin.get(p.coin) || coin.set(p.coin, { coin: p.coin, uzun: 0, kisa: 0, uzunHesap: 0, kisaHesap: 0 }).get(p.coin);
      if (szi > 0) { c.uzun += deger; c.uzunHesap++; uzun += deger; } else { c.kisa += deger; c.kisaHesap++; kisa += deger; }
    }
  }
  const coinler = [...coin.values()].map(c => ({ ...c, net: c.uzun - c.kisa })).sort((a, b) => (b.uzun + b.kisa) - (a.uzun + a.kisa)).slice(0, 8);
  return { hesap: adres.size, hesapDegeri, uzun, kisa, net: uzun - kisa, coinler, zaman: new Date(sonZ).toISOString() };
}

// ═══ 4. AKIŞ ═══════════════════════════════════════════════════════════════
/**
 * Saf: Coinbase primi (saatlik). cb, bn, usdt: [[t ms, kapanış]] (Coinbase BTC-USD, Binance BTCUSDT, Coinbase USDT-USD).
 * p = CB / (BN × USDT/USD) − 1 (USDT kuru yoksa o saat atlanır).
 */
function coinbasePrimi(cb, bn, usdt) {
  const B = new Map((bn || []).map(([t, v]) => [t, v])), U = new Map((usdt || []).map(([t, v]) => [t, v]));
  const seri = [];
  for (const [t, c] of (cb || []).slice().sort((a, b) => a[0] - b[0])) {
    const b = B.get(t), u = U.get(t);
    if (c > 0 && b > 0 && u > 0) seri.push([t, c / (b * u) - 1]);
  }
  if (!seri.length) return null;
  const son = seri[seri.length - 1];
  const ortPencere = (ms) => ort(seri.filter(([t]) => t > son[0] - ms).map(x => x[1]));
  return { t: son[0], son: son[1], s24: ortPencere(GUN), g7: ortPencere(7 * GUN), nokta: seri.length, seri: seyrelt(seri.filter(([t]) => t > son[0] - 7 * GUN), 84) };
}

// ═══ 5. MAKRO ═══════════════════════════════════════════════════════════════
/** Saf: [{d, v}] içinde d'ye kadar (dahil) son değer, en çok `gunGeri` gün geriye. */
function oncekiDeger(seri, d, gunGeri = 7) {
  const sinir = gunStr(Date.parse(d + 'T00:00:00Z') - gunGeri * GUN);
  let en = null;
  for (const x of seri) { if (x.d > d) break; if (x.d >= sinir) en = x; }
  return en;
}

/**
 * Saf: NET LİKİDİTE = WALCL − WTREGEN − 1000 × RRPONTSYD (milyon $; haftalık, çarşamba). PLAN-WINC-MAKRO 980 tanımı.
 * RRP o gün ya da 7 gün içinde önceki son değer; yoksa hafta atlanır.
 * @returns {{ seri: [[d, nl]], son: { d, v }, d4, d13, d52 } | null}
 */
function netLikidite(walcl, wtregen, rrp) {
  const sirala = (l) => (l || []).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
  const WS = sirala(wtregen);
  const W = new Map(WS.map(x => [x.d, x.v]));
  const R = sirala(rrp);
  const seri = [];
  for (const x of sirala(walcl)) {
    const tg = W.has(x.d) ? W.get(x.d) : (oncekiDeger(WS, x.d, 6) || {}).v;
    const r = oncekiDeger(R, x.d, 7);
    if (!Number.isFinite(tg) || !r) continue;
    seri.push([x.d, x.v - tg - 1000 * r.v]);
  }
  if (!seri.length) return null;
  const son = seri[seri.length - 1];
  const geri = (h) => (seri.length > h ? seri[seri.length - 1 - h][1] : null);
  const fark = (h) => { const g = geri(h); return g != null ? son[1] - g : null; };
  return { son: { d: son[0], v: son[1] }, d4: fark(4), d13: fark(13), d52: fark(52), seri: seri.slice(-104) };
}

/**
 * Saf: CFTC TFF satırları → kaldıraçlı fon (lev money) ve varlık yöneticisi net pozisyonu, net/OI, COT endeksi (son 52 rapor, en az 26).
 * PLAN-WINC-MAKRO 981/982 tanımı: X = (lev long − lev short) / OI; endeks = (X − min) / (max − min).
 */
function cotOzeti(satirlar) {
  const l = (satirlar || []).map(x => ({ d: String(x.report_date_as_yyyy_mm_dd || '').slice(0, 10), oi: sayi(x.open_interest_all), ll: sayi(x.lev_money_positions_long), ls: sayi(x.lev_money_positions_short),
    al: sayi(x.asset_mgr_positions_long), as: sayi(x.asset_mgr_positions_short), ad: x.market_and_exchange_names || null }))
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.d) && x.oi > 0 && Number.isFinite(x.ll) && Number.isFinite(x.ls)).sort((a, b) => (a.d < b.d ? -1 : 1));
  if (!l.length) return null;
  const X = l.map(x => (x.ll - x.ls) / x.oi);
  const son = l[l.length - 1], xs = X[X.length - 1];
  const pencere = X.slice(-52);
  const mn = Math.min(...pencere), mx = Math.max(...pencere);
  const endeks = pencere.length >= 26 && mx > mn ? (xs - mn) / (mx - mn) : null;
  const once = l.length > 1 ? l[l.length - 2] : null;
  return { d: son.d, ad: son.ad, oi: son.oi, levNet: son.ll - son.ls, levNetOi: xs, levNetDegisim: once ? (son.ll - son.ls) - (once.ll - once.ls) : null,
    varlikNet: Number.isFinite(son.al) && Number.isFinite(son.as) ? son.al - son.as : null, endeks, rapor: pencere.length,
    seri: l.slice(-52).map((x, i, a) => [x.d, X[X.length - a.length + i]]) };
}

/** Saf: günlük seri [{d, v}] → son, h gün önceki ile fark/oran. */
function seriOzeti(seri, { gunler = [30, 91, 365], oran = false } = {}) {
  const l = (seri || []).filter(x => Number.isFinite(x.v)).sort((a, b) => (a.d < b.d ? -1 : 1));
  if (!l.length) return null;
  const son = l[l.length - 1];
  const out = { d: son.d, v: son.v };
  for (const g of gunler) {
    const once = oncekiDeger(l, gunStr(Date.parse(son.d + 'T00:00:00Z') - g * GUN), 10);
    out[`d${g}`] = once ? (oran ? son.v / once.v - 1 : son.v - once.v) : null;
  }
  return out;
}

/**
 * Saf: SENTETİK DOLAR ENDEKSİ (ICE DXY formülü): 50,14348112 × EURUSD^−0,576 × USDJPY^0,136 × GBPUSD^−0,119 × USDCAD^0,091 ×
 * USDSEK^0,042 × USDCHF^0,036. Altı kurun ORTAK günleri; biri eksikse o gün hesaplanmaz (eksik kurla yaklaşık değer üretilmez).
 * @param kur { EURUSD, USDJPY, GBPUSD, USDCAD, USDSEK, USDCHF }: [{ d, v }]
 */
const DXY_AGIRLIK = Object.freeze({ EURUSD: -0.576, USDJPY: 0.136, GBPUSD: -0.119, USDCAD: 0.091, USDSEK: 0.042, USDCHF: 0.036 });
function sentetikDxy(kur) {
  const adlar = Object.keys(DXY_AGIRLIK);
  const eksik = adlar.filter(a => !(kur && Array.isArray(kur[a]) && kur[a].length));
  if (eksik.length) return { eksik, seri: [] };
  const H = Object.fromEntries(adlar.map(a => [a, new Map(kur[a].map(x => [x.d, x.v]))]));
  const gunler = [...H.EURUSD.keys()].filter(d => adlar.every(a => H[a].get(d) > 0)).sort();
  const seri = gunler.map(d => ({ d, v: 50.14348112 * adlar.reduce((p, a) => p * Math.pow(H[a].get(d), DXY_AGIRLIK[a]), 1) }));
  return { eksik: [], seri };
}

/** Saf: aylık endeks [{ ay: 'YYYY-MM', v }] → son ay, aylık ve yıllık değişim. */
function enflasyon(aylik) {
  const l = (aylik || []).filter(x => x && /^\d{4}-\d{2}$/.test(x.ay) && Number.isFinite(x.v)).sort((a, b) => (a.ay < b.ay ? -1 : 1));
  if (l.length < 2) return null;
  const son = l[l.length - 1], once = l[l.length - 2];
  const [y, a] = son.ay.split('-').map(Number);
  const gy = l.find(x => x.ay === `${y - 1}-${String(a).padStart(2, '0')}`);
  return { ay: son.ay, v: son.v, aylik: son.v / once.v - 1, yillik: gy ? son.v / gy.v - 1 : null };
}

// ═══ 6. DUYGU / GENİŞLİK ═════════════════════════════════════════════════════
/** Saf: RSI(14) Wilder — kapanışlar eskiden yeniye. */
function rsi(kapanislar, n = 14) {
  const k = kapanislar.filter(Number.isFinite);
  if (k.length <= n) return null;
  let kaz = 0, kay = 0;
  for (let i = 1; i <= n; i++) { const d = k[i] - k[i - 1]; if (d > 0) kaz += d; else kay -= d; }
  kaz /= n; kay /= n;
  for (let i = n + 1; i < k.length; i++) { const d = k[i] - k[i - 1]; kaz = (kaz * (n - 1) + Math.max(d, 0)) / n; kay = (kay * (n - 1) + Math.max(-d, 0)) / n; }
  if (kay === 0) return 100;
  return 100 - 100 / (1 + kaz / kay);
}

/**
 * Saf: ALT SEZONU (Blockchaincenter tanımının 30 coinlik hâli, PLAN-WINC-MAKRO 984 evren kuralı): BTC hariç, son 30 günün ortalama dolar
 * hacmine göre ilk 30 altcoin (≥ 91 gün geçmişli); 90 günlük getirisi BTC'ninkini geçenlerin oranı → 0–100. ≥ 75 "alt sezonu",
 * ≤ 25 "BTC sezonu". Evren 20'den azsa hesaplanmaz.
 * @param mumlar { sembol: [{ time, close, volume }] (günlük, eskiden yeniye) }, btc: aynı biçim
 */
function altSezonu(mumlar, btc, { ilk = 30, enAz = 20, gun = 90 } = {}) {
  const kap = (l, i) => (l[i] ? Number(l[i].close) : NaN);
  const getiri = (l) => { const n = l.length; if (n <= gun) return null; const a = kap(l, n - 1 - gun), b = kap(l, n - 1); return a > 0 && b > 0 ? b / a - 1 : null; };
  const bg = getiri(btc || []);
  if (bg == null) return { endeks: null, neden: 'BTC günlük verisi 90 günden kısa', evren: 0 };
  const aday = Object.entries(mumlar || {}).map(([s, l]) => {
    const son30 = l.slice(-30);
    return { s, hacim: ort(son30.map(x => Number(x.close) * Number(x.volume)).filter(Number.isFinite)) || 0, g: getiri(l), r: rsi(l.slice(-120).map(x => Number(x.close))) };
  }).filter(x => x.g != null).sort((a, b) => b.hacim - a.hacim).slice(0, ilk);
  if (aday.length < enAz) return { endeks: null, neden: `evren ${aday.length} coin (en az ${enAz} gerekir)`, evren: aday.length };
  const gecen = aday.filter(x => x.g > bg);
  return { endeks: gecen.length / aday.length * 100, evren: aday.length, btc90: bg,
    enIyi: [...aday].sort((a, b) => b.g - a.g).slice(0, 3).map(x => ({ s: x.s, g: x.g })), enKotu: [...aday].sort((a, b) => a.g - b.g).slice(0, 3).map(x => ({ s: x.s, g: x.g })),
    rsi: aday.filter(x => Number.isFinite(x.r)).map(x => ({ s: x.s, r: x.r })) };
}

/** Saf: korku-açgözlülük (alternative.me) → son, 7 g / 30 g ortalama, seri. */
function korkuOzeti(veri) {
  const l = (Array.isArray(veri) ? veri : []).map(x => ({ t: sayi(x.timestamp) * 1000, v: sayi(x.value), s: x.value_classification || null })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.v)).sort((a, b) => a.t - b.t);
  if (!l.length) return null;
  const son = l[l.length - 1];
  const o = (g) => ort(l.filter(x => x.t > son.t - g * GUN).map(x => x.v));
  return { d: gunStr(son.t), v: son.v, sinif: son.s, ort7: o(7), ort30: o(30), seri: l.slice(-60).map(x => [gunStr(x.t), x.v]) };
}

/** Saf: korku-açgözlülük değerinin Türkçe bölgesi (alternative.me sınırları). */
function korkuBolge(v) {
  if (!Number.isFinite(v)) return null;
  return v <= 24 ? 'aşırı korku' : v <= 49 ? 'korku' : v === 50 ? 'nötr' : v <= 74 ? 'açgözlülük' : 'aşırı açgözlülük';
}

// ═══ 7. PROTOKOL KARTI (DefiLlama — coin tarama arşivinden) ══════════════════
/**
 * Saf: arşivin DefiLlama birimleri (lib/tarama/arsiv.js llamaBirimleri → birim Map) → ücrete göre ilk n protokol.
 * P/F = piyasa değeri / (30 g ücret × 365/30) · P/S = piyasa değeri / (30 g gelir × 365/30). Değer yoksa null (sıfıra bölünmez).
 */
function protokolTablosu(birimler, n = 12) {
  const l = [];
  for (const b of birimler.values ? birimler.values() : birimler) {
    const u30 = b.ucret && Number.isFinite(b.ucret.t30) ? b.ucret.t30 : null;
    if (!(u30 > 0) || b.olu) continue;
    const g30 = b.gelir && Number.isFinite(b.gelir.t30) ? b.gelir.t30 : null;
    const yil = (x) => (x > 0 ? x * 365 / 30 : null);
    l.push({ ad: b.ad, kategori: b.kategori || null, ucret30: u30, ucret7: b.ucret.t7 || null, gelir30: g30, tvl: b.tvlVar ? b.tvl : null, mcap: b.mcap > 0 ? b.mcap : null,
      pf: b.mcap > 0 && yil(u30) ? b.mcap / yil(u30) : null, ps: b.mcap > 0 && yil(g30) ? b.mcap / yil(g30) : null });
  }
  return l.sort((a, b) => b.ucret30 - a.ucret30).slice(0, n);
}

module.exports = {
  GUN, YIL, sayi, ort, medyan, ss, gunStr, seyrelt,
  normPdf, normCdf, bs, vadeMs, opsiyonNorm, vadeliDoldur, gex, maxPain, hedefVade, araDeger, atmIv, carpiklik25, opsiyonOzeti, siraHesapla, gunlukEkle,
  zSkor, pozisyonSerileri, pozisyonOzeti, fundingOzeti, bazOzeti, balinaOzeti,
  coinbasePrimi, oncekiDeger, netLikidite, cotOzeti, seriOzeti, DXY_AGIRLIK, sentetikDxy, enflasyon,
  rsi, altSezonu, korkuOzeti, korkuBolge, protokolTablosu,
};
