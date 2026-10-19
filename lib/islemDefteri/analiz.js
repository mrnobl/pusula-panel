/**
 * İŞLEM DEFTERİ — PERFORMANS (sürüm 64.7) — SAF: dosya okumaz, ağa çıkmaz. Girdi depo.durumKur çıktısı (D) + fiyat işlevi.
 *
 *   performans(D, { hesap, fiyatUsd(para, ms) → 1 birimin dolar değeri | null, tzDk, birim })
 *     · Gerçekleşen kâr: SPOT'ta FIFO (alış lotları sırayla satışa eşlenir; baz coinle ödenen alış ücreti lotu küçültür);
 *       VADELİ'de kaynağın bildirdiği gerçekleşen kâr (OKX fillPnl / Binance "Realized Profit"); MetaTrader'da işlemin Profit'i.
 *     · Ücret: her dolumun ücreti (zamanında) + MT Commission + Taxes; Fonlama: kaynak satırları (işaretli: + aldın, − ödedin);
 *       Swap: MT işlem swapı. NET = gerçekleşen − ücret + fonlama + swap.
 *     · PARA GİRİŞİ / ÇIKIŞI performansa GİRMEZ (yalnız bakiye eğrisinde).
 *     · Yalnız-kâr / yalnız-komisyon satırları (Binance vadeli "Transaction History" REALIZED_PNL / COMMISSION, kz/ucret):
 *       aynı hesap + sembolde ±2 sn içinde bir dolum varsa o dolumla AYNI şeydir → sayılmaz (çift sayım yok); yoksa sayılır.
 *       Kural YALNIZ özgün türü (k.not) COMMISSION / REALIZED_PNL olan satırlara uygulanır: tasfiye ücreti (LIQUIDATION_FEE,
 *       INSURANCE_CLEAR), iadeler (COMMISSION_REBATE …), OKX faiz / teslim / tasfiye satırları dolumla aynı anda olsa da sayılır.
 *     · MT sunucu saati: hesabın saatKipi 'sabit' (varsayılan) → sunucuSaatFarki saat; 'abd-yaz' → kışın UTC+2, ABD yaz saatinde
 *       (Mart'ın 2. pazarı – Kasım'ın 1. pazarı, New York 02:00) UTC+3 (aracı kurumların yaygın kuralı). Tek yer: utc().
 *     · "İşlem" (istatistik birimi, kapanış): spot eşlenen satış · vadeli gerçekleşen kârı olan dolum · MT kapanmış pozisyon ·
 *       örtülmeyen kz satırı. Olay neti = brüt − kendi ücreti (spot: + eşlenen alış lotlarının ücret payı) (+ MT swap).
 *     · Dolar dışı para birimleri fiyatUsd ile o günün kuruyla çevrilir; çevrilemeyen tutar toplama girmez, uyarı yazılır.
 *       Tek hesap görünümünde hesabın para birimi çevrilemiyorsa o hesap kendi para biriminde gösterilir (birim alanı).
 *   liste(D, sorgu, ops)   işlem listesi (süzgeç, sayfa) — zamanlar sunucu saat farkı uygulanmış.
 *   isaretler(D, hesap, sembol, ops)  fiyat grafiği için alım ▲ / satım ▼ işaretleri.
 */
'use strict';
const M = require('./model');

const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
const GUN = 864e5;
const EPS = 1e-12;
const ORTU_MS = 2000;
const VARSAYILAN_TZ = () => -new Date().getTimezoneOffset();

/** Kaydın UTC zamanı: MT sunucu saati ise hesabın saat farkı düşülür. */
/** ABD yaz saati (UTC ms aralığı): Mart'ın 2. pazarı 07:00 UTC (02:00 EST) → Kasım'ın 1. pazarı 06:00 UTC (02:00 EDT). */
function abdYazAraligi(yil) {
  const pazar = (ay, kacinci) => { const g1 = new Date(Date.UTC(yil, ay, 1)).getUTCDay(); return 1 + ((7 - g1) % 7) + (kacinci - 1) * 7; };
  return { bas: Date.UTC(yil, 2, pazar(2, 2), 7), bit: Date.UTC(yil, 10, pazar(10, 1), 6) };
}
/** Sunucu saatinin UTC farkı (saat). 'abd-yaz': +3 yazın, +2 kışın; aksi hâlde hesabın sabit farkı. */
function sunucuFarki(hesap, t) {
  if (hesap && hesap.saatKipi === 'abd-yaz') {
    const aday = t - 3 * 3600e3;
    const a = abdYazAraligi(new Date(aday).getUTCFullYear());
    return aday >= a.bas && aday < a.bit ? 3 : 2;
  }
  return Number(hesap && hesap.sunucuSaatFarki) || 0;
}
function utc(k, hesap, alan = 'zaman') {
  const t = k[alan];
  if (!sayiMi(t)) return null;
  return k.sunucuSaati ? t - sunucuFarki(hesap, t) * 3600e3 : t;
}
const gunAnahtari = (t, tzDk) => new Date(t + tzDk * 60000).toISOString().slice(0, 10);
const tabanBol = (sembol) => { const s = String(sembol || ''); const [c] = s.split(':'); const [b, q] = c.split('/'); return { baz: b || s, kot: q || null }; };

function istatistik(netler) {
  const n = netler.length;
  const kaz = netler.filter(x => x > 0), kay = netler.filter(x => x < 0);
  const topKaz = kaz.reduce((s, x) => s + x, 0), topKay = kay.reduce((s, x) => s + x, 0);
  return {
    islem: n, kazanan: kaz.length, kaybeden: kay.length,
    kazanmaOrani: n ? kaz.length / n : null,
    ortKazanc: kaz.length ? topKaz / kaz.length : null,
    ortKayip: kay.length ? topKay / kay.length : null,
    karFaktoru: kay.length ? topKaz / -topKay : (kaz.length ? null : null),
    karFaktoruSonsuz: !kay.length && kaz.length > 0,
    beklenen: n ? netler.reduce((s, x) => s + x, 0) / n : null,
    enBuyukKayip: kay.length ? Math.min(...kay) : null,
    enBuyukKazanc: kaz.length ? Math.max(...kaz) : null
  };
}

/**
 * Yeni panel F4 (PLAN-PANEL-YENI §5) — işlem defteri ek ölçütleri (saf):
 *   gün kazanma % (kârlı gün ÷ net ≠ 0 olan gün) · ücret ÷ brüt kazanç (komisyon kârın ne kadarını yiyor) · en uzun kazanç / kayıp
 *   serisi + şu anki seri · toparlanma faktörü (net ÷ |en derin düşüş|) · gün × saat ısı haritası (yerel saat, 4 saatlik dilim) ·
 *   İŞLEM SKORU (TradeZella ağırlıkları): kâr faktörü %25 · ort. kazanç/kayıp %20 · düşüş %20 · kazanma %15 · toparlanma %10 ·
 *   tutarlılık %10. Eksen eşikleri (0–100): KF 0 → 0, ≥ 2,6 → 100 · K/K 0 → 0, ≥ 2,6 → 100 · kazanma 0 → 0, ≥ %60 → 100 ·
 *   düşüş |dd| ÷ max(para girişi, brüt kazanç) %0 → 100, ≥ %50 → 0 · toparlanma 0 → 0, ≥ 3 → 100 · tutarlılık: en iyi günün
 *   toplam kâra payı %0 → 100, ≥ %100 → 0 (net zararda 0).
 */
function ekOlcutler(olaylar, gunluk, top, ist, enDerin, tzDk) {
  const kirp = (x) => Math.max(0, Math.min(100, x));
  const gunler = [...gunluk.values()].filter(g => Math.abs(g.net) > EPS);
  const kazananGun = gunler.filter(g => g.net > 0).length;
  const brutKazanc = olaylar.reduce((s, o) => s + Math.max(0, o.brut || 0), 0);
  const sirali = olaylar.slice().sort((a, b) => a.t - b.t);
  let kaz = 0, kay = 0, enKaz = 0, enKay = 0;
  for (const o of sirali) {
    if (o.net > 0) { kaz++; kay = 0; if (kaz > enKaz) enKaz = kaz; } else if (o.net < 0) { kay++; kaz = 0; if (kay > enKay) enKay = kay; }
  }
  const net = (top.gerceklesen || 0) - (top.ucret || 0) + (top.fonlama || 0) + (top.swap || 0);
  const toparlanma = enDerin < 0 ? net / Math.abs(enDerin) : null;
  // Gün × saat: Pzt..Paz × 00/04/08/12/16/20 (yerel)
  const isi = Array.from({ length: 7 }, () => Array.from({ length: 6 }, () => ({ net: 0, n: 0 })));
  for (const o of olaylar) {
    if (!sayiMi(o.t)) continue;
    const d = new Date(o.t + tzDk * 60000);
    const h = isi[(d.getUTCDay() + 6) % 7][Math.floor(d.getUTCHours() / 4)];
    h.net += o.net || 0; h.n++;
  }
  const enIyiGun = gunler.length ? Math.max(...gunler.map(g => g.net)) : null;
  const pay = net > 0 && enIyiGun != null ? enIyiGun / net : null;
  const kk = ist.ortKazanc != null && ist.ortKayip ? ist.ortKazanc / Math.abs(ist.ortKayip) : null;
  const ddOran = enDerin < 0 ? Math.abs(enDerin) / Math.max(top.paraGiris || 0, brutKazanc, 1e-9) : 0;
  const kf = ist.karFaktoruSonsuz ? 2.6 : ist.karFaktoru;
  const eksen = [
    ['kf', 'Kâr faktörü', 25, sayiMi(kf) ? kirp(kf / 2.6 * 100) : null],
    ['kk', 'Ort. kazanç/kayıp', 20, sayiMi(kk) ? kirp(kk / 2.6 * 100) : (ist.kazanan && !ist.kaybeden ? 100 : null)],
    ['dusus', 'Düşüş', 20, olaylar.length ? kirp(100 - ddOran / 0.5 * 100) : null],
    ['kazanma', 'Kazanma %', 15, sayiMi(ist.kazanmaOrani) ? kirp(ist.kazanmaOrani / 0.6 * 100) : null],
    ['toparlanma', 'Toparlanma', 10, sayiMi(toparlanma) ? kirp(toparlanma / 3 * 100) : (olaylar.length && enDerin >= 0 ? 100 : null)],
    ['tutarlilik', 'Tutarlılık', 10, olaylar.length ? (pay == null ? 0 : kirp(100 - pay * 100)) : null]
  ].map(([k, ad, agirlik, puan]) => ({ k, ad, agirlik, puan }));
  const olculen = eksen.filter(e => sayiMi(e.puan));
  const agT = olculen.reduce((s, e) => s + e.agirlik, 0);
  return {
    gunKazanma: gunler.length ? kazananGun / gunler.length : null, kazananGun, islemGunu: gunler.length,
    ucretBrut: brutKazanc > EPS ? (top.ucret || 0) / brutKazanc : null,
    enUzunKazancSerisi: enKaz, enUzunKayipSerisi: enKay, simdikiSeri: kaz ? kaz : kay ? -kay : 0,
    toparlanmaFaktoru: toparlanma, ortKazancKayip: kk,
    isi: { gunler: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'], dilimler: ['00', '04', '08', '12', '16', '20'], hucreler: isi },
    skor: { puan: agT ? Math.round(olculen.reduce((s, e) => s + e.puan * e.agirlik, 0) / agT) : null, eksenler: eksen }
  };
}

function medyan(l) { if (!l.length) return null; const s = l.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/**
 * Hesap(lar)ın bütün performansı.
 * @returns {{ birim, toplam, gunluk, seri, bakiyeSeri, dusus, aylik, semboller, yonler, sure, olaylar, uyarilar, kapsam }}
 */
function performans(D, ops = {}) {
  const tzDk = sayiMi(ops.tzDk) ? ops.tzDk : VARSAYILAN_TZ();
  const hesapId = ops.hesap || '';
  const hesap = hesapId ? D.hesaplar.get(hesapId) : null;
  const fiyatHam = typeof ops.fiyatUsd === 'function' ? ops.fiyatUsd : () => null;
  const kayitlar = D.veri.filter(k => (!hesapId || k.hesap === hesapId) && D.hesaplar.has(k.hesap));

  // Tek hesap: hesabın para birimi dolara çevrilemiyorsa hesap kendi biriminde gösterilir.
  let birim = 'USD';
  if (hesap && !M.dolarGibiMi(hesap.paraBirimi)) {
    const ornek = kayitlar.find(k => k.para === hesap.paraBirimi);
    if (ornek && fiyatHam(hesap.paraBirimi, utc(ornek, hesap)) == null) birim = hesap.paraBirimi;
  }
  const degerlenemeyen = new Map();
  const usd = (tutar, para, t) => {
    if (!sayiMi(tutar) || tutar === 0) return 0;
    const p = String(para || '').toUpperCase();
    if (birim !== 'USD') { if (p === birim) return tutar; }
    else if (M.dolarGibiMi(p)) return tutar;
    const f = birim === 'USD' ? fiyatHam(p, t) : null;
    if (sayiMi(f)) return tutar * f;
    degerlenemeyen.set(p || '?', (degerlenemeyen.get(p || '?') || 0) + 1);
    return null;
  };
  /** Ücretin olaydaki para cinsinden (kotasyon) dolar değeri. */
  const ucretUsd = (k, t) => {
    const u = k.ucret;
    if (!u || !sayiMi(u.tutar) || !u.tutar) return 0;
    const fp = String(u.para || k.para || '').toUpperCase();
    const { baz } = tabanBol(k.sembol);
    if (fp === String(baz).toUpperCase() && k.piyasa === 'spot' && sayiMi(k.fiyat)) return usd(u.tutar * k.fiyat, k.para, t);
    return usd(u.tutar, fp, t);
  };

  const sirali = kayitlar.map(k => ({ k, h: D.hesaplar.get(k.hesap), t: utc(k, D.hesaplar.get(k.hesap)) }))
    .filter(x => sayiMi(x.t)).sort((a, b) => a.t - b.t || (a.k.sira || 0) - (b.k.sira || 0));

  // Yalnız-kâr / yalnız-komisyon satırları ile dolumların örtüşmesi (±2 sn, aynı hesap + sembol, vadeli)
  const dolumZaman = new Map();
  for (const x of sirali) if (x.k.tur === 'islem' && x.k.piyasa === 'vadeli' && x.k.islemTuru !== 'pozisyon') {
    // kz satırını yalnız kârı olan dolum, ucret satırını yalnız ücreti olan dolum örter (kârsız dosya + hareket dosyası birlikte çalışsın)
    for (const [tur, var_] of [['kz', sayiMi(x.k.gerceklesenKar)], ['ucret', !!(x.k.ucret && x.k.ucret.tutar)]]) {
      if (!var_) continue;
      const a = `${tur}|${x.k.hesap}|${x.k.sembol}`;
      if (!dolumZaman.has(a)) dolumZaman.set(a, []);
      dolumZaman.get(a).push(x.t);
    }
  }
  const ortulu = (x) => {
    const l = dolumZaman.get(`${x.k.tur}|${x.k.hesap}|${x.k.sembol}`);
    if (!l) return false;
    let lo = 0, hi = l.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (Math.abs(l[m] - x.t) <= ORTU_MS) return true; if (l[m] < x.t) lo = m + 1; else hi = m - 1; }
    return false;
  };

  const top = { gerceklesen: 0, ucret: 0, fonlama: 0, swap: 0, paraGiris: 0, paraCikis: 0, dolum: 0, pozisyon: 0, ortulen: 0 };
  const gunluk = new Map();   // gün → { net, akis }
  const gunEkle = (t, net, akis) => {
    const g = gunAnahtari(t, tzDk);
    if (!gunluk.has(g)) gunluk.set(g, { net: 0, akis: 0 });
    const v = gunluk.get(g); v.net += net || 0; v.akis += akis || 0;
  };
  const sem = new Map();
  const semAl = (k) => {
    if (!sem.has(k.sembol)) sem.set(k.sembol, { sembol: k.sembol, piyasa: k.piyasa || null, hesaplar: new Set(), brut: 0, ucret: 0, fonlama: 0, swap: 0, netler: [], dolum: 0 });
    const s = sem.get(k.sembol); s.hesaplar.add(k.hesap); if (!s.piyasa && k.piyasa) s.piyasa = k.piyasa; return s;
  };
  const olaylar = [];
  const lotlar = new Map();   // hesap|sembol → [{ q, px, feeU }]
  const eslenmeyen = new Map();
  let pnlYok = 0;

  for (const x of sirali) {
    const { k, t } = x;
    if (k.tur === 'islem') {
      const s = semAl(k);
      s.dolum++;
      if (k.islemTuru === 'pozisyon') {
        top.pozisyon++;
        const brut = usd(k.gerceklesenKar, k.para, t);
        const kom = usd(k.komisyon, k.para, t), vergi = usd(k.vergi, k.para, t), sw = usd(k.swap, k.para, t);
        const maliyet = -((kom || 0) + (vergi || 0));
        top.gerceklesen += brut || 0; top.ucret += maliyet; top.swap += sw || 0;
        s.brut += brut || 0; s.ucret += maliyet; s.swap += sw || 0;
        const net = (brut || 0) - maliyet + (sw || 0);
        gunEkle(t, net, 0);
        const ta = utc(k, x.h, 'acilisZaman');
        olaylar.push({ id: k.id, hesap: k.hesap, sembol: k.sembol, t, yon: k.yon === 'al' ? 'long' : 'short', brut: brut || 0, ucret: maliyet, swap: sw || 0, net, sureMs: sayiMi(ta) ? Math.max(0, t - ta) : null });
        s.netler.push(net);
        continue;
      }
      top.dolum++;
      const fee = ucretUsd(k, t);
      top.ucret += fee || 0; s.ucret += fee || 0;
      gunEkle(t, -(fee || 0), 0);
      if (k.piyasa === 'spot') {
        const a = `${k.hesap}|${k.sembol}`;
        if (!lotlar.has(a)) lotlar.set(a, []);
        const L = lotlar.get(a);
        const { baz } = tabanBol(k.sembol);
        if (k.yon === 'al') {
          const bazUcret = k.ucret && String(k.ucret.para || '').toUpperCase() === String(baz).toUpperCase() ? k.ucret.tutar : 0;
          const q = Math.max(0, k.miktar - (bazUcret || 0));
          if (q > EPS) L.push({ q, px: k.fiyat, feeU: (fee || 0) / q });
        } else {
          let kalan = k.miktar, brutKot = 0, alisUcret = 0, eslenen = 0;
          while (kalan > EPS && L.length) {
            const lot = L[0], al = Math.min(kalan, lot.q);
            brutKot += al * (k.fiyat - lot.px); alisUcret += al * lot.feeU; eslenen += al;
            lot.q -= al; kalan -= al;
            if (lot.q <= EPS * Math.max(1, k.miktar)) L.shift();
          }
          if (kalan > EPS * Math.max(1, k.miktar)) eslenmeyen.set(k.sembol, (eslenmeyen.get(k.sembol) || 0) + kalan);
          if (eslenen > 0) {
            const brut = usd(brutKot, k.para, t) || 0;
            top.gerceklesen += brut; s.brut += brut;
            gunEkle(t, brut, 0);
            const net = brut - (fee || 0) - alisUcret;
            olaylar.push({ id: k.id, hesap: k.hesap, sembol: k.sembol, t, yon: 'long', brut, ucret: (fee || 0) + alisUcret, swap: 0, net, sureMs: null });
            s.netler.push(net);
          }
        }
      } else {
        if (!sayiMi(k.gerceklesenKar)) { pnlYok++; continue; }
        if (k.gerceklesenKar === 0) continue;
        const brut = usd(k.gerceklesenKar, k.para, t) || 0;
        top.gerceklesen += brut; s.brut += brut;
        gunEkle(t, brut, 0);
        const yon = k.pozisyonYonu === 'long' || k.pozisyonYonu === 'short' ? k.pozisyonYonu : (k.yon === 'sat' ? 'long' : 'short');
        const net = brut - (fee || 0);
        olaylar.push({ id: k.id, hesap: k.hesap, sembol: k.sembol, t, yon, brut, ucret: fee || 0, swap: 0, net, sureMs: null });
        s.netler.push(net);
      }
      continue;
    }
    const v = usd(k.tutar, k.para, t);
    if (v == null) continue;
    if (k.tur === 'para-giris' || k.tur === 'para-cikis') {
      if (v >= 0) top.paraGiris += v; else top.paraCikis += v;
      gunEkle(t, 0, v);
      continue;
    }
    // Yalnız dolumun kendisinin kopyası olan satırlar örtülür (kz ← REALIZED_PNL, ucret ← COMMISSION); tasfiye ücreti vb. sayılır
    if (((k.tur === 'kz' && k.not === 'REALIZED_PNL') || (k.tur === 'ucret' && k.not === 'COMMISSION')) && ortulu(x)) { top.ortulen++; continue; }
    const s = k.sembol ? semAl(k) : null;
    if (k.tur === 'fonlama') { top.fonlama += v; if (s) s.fonlama += v; gunEkle(t, v, 0); }
    else if (k.tur === 'swap') { top.swap += v; if (s) s.swap += v; gunEkle(t, v, 0); }
    else if (k.tur === 'ucret') { top.ucret += -v; if (s) s.ucret += -v; gunEkle(t, v, 0); }
    else if (k.tur === 'kz') {
      top.gerceklesen += v; if (s) { s.brut += v; s.netler.push(v); }
      gunEkle(t, v, 0);
      olaylar.push({ id: k.id, hesap: k.hesap, sembol: k.sembol || '?', t, yon: null, brut: v, ucret: 0, swap: 0, net: v, sureMs: null });
    }
  }
  top.net = top.gerceklesen - top.ucret + top.fonlama + top.swap;

  // Günlük seri: birikimli net, bakiye (para giriş/çıkışı biliniyorsa), tepeden düşüş ($)
  const gunler = [...gunluk.keys()].sort();
  const seri = [], bakiyeSeri = [], dususSeri = [];
  let birNet = 0, birAkis = 0, tepe = 0, enDerin = 0, enDerinGun = null;
  if (gunler.length) {
    const t0 = Date.parse(gunler[0] + 'T00:00:00Z') - GUN;
    seri.push({ t: t0, v: 0 }); dususSeri.push({ t: t0, v: 0 });
    if (top.paraGiris || top.paraCikis) bakiyeSeri.push({ t: t0, v: 0 });
  }
  for (const g of gunler) {
    const d = gunluk.get(g), tg = Date.parse(g + 'T00:00:00Z');
    birNet += d.net; birAkis += d.akis;
    seri.push({ t: tg, v: birNet });
    if (top.paraGiris || top.paraCikis) bakiyeSeri.push({ t: tg, v: birAkis + birNet });
    tepe = Math.max(tepe, birNet);
    const dd = birNet - tepe;
    dususSeri.push({ t: tg, v: dd });
    if (dd < enDerin) { enDerin = dd; enDerinGun = g; }
  }

  // Aylık tablo (yıl × ay, net)
  const ayMap = new Map();
  for (const g of gunler) { const a = g.slice(0, 7); ayMap.set(a, (ayMap.get(a) || 0) + gunluk.get(g).net); }
  const yillar = [...new Set([...ayMap.keys()].map(a => a.slice(0, 4)))].sort();
  const aylik = yillar.map(y => {
    const aylar = Array.from({ length: 12 }, (_, i) => { const a = `${y}-${String(i + 1).padStart(2, '0')}`; return ayMap.has(a) ? ayMap.get(a) : null; });
    return { yil: y, aylar, toplam: aylar.reduce((s, x) => s + (x || 0), 0) };
  });
  const aylikCubuk = [...ayMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([ay, v]) => ({ ay, v }));

  // Sembol tablosu
  const semboller = [...sem.values()].map(s => {
    const ist = istatistik(s.netler);
    return { sembol: s.sembol, piyasa: s.piyasa, hesaplar: [...s.hesaplar], dolum: s.dolum, brut: s.brut, ucret: s.ucret, fonlama: s.fonlama, swap: s.swap,
      net: s.brut - s.ucret + s.fonlama + s.swap, ...ist };
  }).sort((a, b) => b.net - a.net);

  const yonler = {};
  for (const y of ['long', 'short']) {
    const l = olaylar.filter(o => o.yon === y).map(o => o.net);
    yonler[y] = { ...istatistik(l), net: l.reduce((s, x) => s + x, 0) };
  }
  const sureli = olaylar.filter(o => sayiMi(o.sureMs));
  const sure = sureli.length ? {
    adet: sureli.length, ortMs: sureli.reduce((s, o) => s + o.sureMs, 0) / sureli.length, medyanMs: medyan(sureli.map(o => o.sureMs)),
    enKisaMs: Math.min(...sureli.map(o => o.sureMs)), enUzunMs: Math.max(...sureli.map(o => o.sureMs)),
    kazananOrtMs: (() => { const l = sureli.filter(o => o.net > 0); return l.length ? l.reduce((s, o) => s + o.sureMs, 0) / l.length : null; })(),
    kaybedenOrtMs: (() => { const l = sureli.filter(o => o.net < 0); return l.length ? l.reduce((s, o) => s + o.sureMs, 0) / l.length : null; })()
  } : null;

  const uyarilar = [];
  if (degerlenemeyen.size) uyarilar.push({ kod: 'kur-yok', mesaj: `Dolara çevrilemeyen tutar: ${[...degerlenemeyen.entries()].map(([p, n]) => `${p} (${n} satır)`).join(', ')} — o satırlar toplama girmedi (bu para biriminin günlük fiyatı diskte yok).` });
  if (eslenmeyen.size) uyarilar.push({ kod: 'eslenmeyen', mesaj: `Alışı kayıtta olmayan satış: ${[...eslenmeyen.entries()].map(([s, q]) => `${s} ${+q.toPrecision(6)}`).join(', ')} — bu miktarın maliyeti bilinmediği için kârı hesaplanmadı (eski alışları da yükleyin ya da coin başka yerden geldiyse önemsemeyin).` });
  if (pnlYok) uyarilar.push({ kod: 'kz-yok', mesaj: `${pnlYok} vadeli dolumda kaynak gerçekleşen kârı vermedi — bu dolumların kârı sayılmadı (ücretleri sayıldı).` });
  const mtSifir = [...D.hesaplar.values()].filter(h => (!hesapId || h.id === hesapId) && /^fx-mt/.test(h.hesapTuru) && h.saatKipi !== 'abd-yaz' && !Number(h.sunucuSaatFarki) && kayitlar.some(k => k.hesap === h.id && k.sunucuSaati));
  if (mtSifir.length) uyarilar.push({ kod: 'sunucu-saati', mesaj: `${mtSifir.map(h => h.ad).join(', ')}: sunucu saat farkı 0 kabul ediliyor. MetaTrader rapor saatleri aracı kurumun sunucu saatidir (çoğunda UTC+2, yazın UTC+3) — hesabın ayarından düzeltin; gün ve ay sınırları buna göre kayar.` });

  const ist = istatistik(olaylar.map(o => o.net));
  const ek = ekOlcutler(olaylar, gunluk, top, ist, enDerin, tzDk);
  return {
    ek,
    birim, hesap: hesapId || null,
    toplam: { ...top, ...ist, maxDusus: enDerin, maxDususGun: enDerinGun, ilk: sirali.length ? sirali[0].t : null, son: sirali.length ? sirali[sirali.length - 1].t : null, kayit: kayitlar.length },
    seri, bakiyeSeri, dususSeri, aylik, aylikCubuk, semboller, yonler, sure,
    olaySayisi: olaylar.length, uyarilar, tzDk
  };
}

/** İşlem listesi: süzgeç + sayfa. sorgu: { hesap, sembol, bas, bit (YYYY-AA-GG yerel), yon, kaynak, tur ('islem'|'hareket'|''), sayfa, boyut } */
function liste(D, q = {}, ops = {}) {
  const tzDk = sayiMi(ops.tzDk) ? ops.tzDk : VARSAYILAN_TZ();
  const boyut = Math.max(10, Math.min(200, Number(q.boyut) || 50));
  const sayfa = Math.max(1, Number(q.sayfa) || 1);
  const sembolQ = String(q.sembol || '').trim().toUpperCase();
  const l = [];
  for (const k of D.veri) {
    const h = D.hesaplar.get(k.hesap);
    if (!h) continue;
    if (q.hesap && k.hesap !== q.hesap) continue;
    if (q.kaynak && k.kaynak !== q.kaynak) continue;
    if (q.tur === 'islem' && k.tur !== 'islem') continue;
    if (q.tur === 'hareket' && k.tur === 'islem') continue;
    if (q.yon && k.yon !== q.yon) continue;
    if (sembolQ && !String(k.sembol || '').toUpperCase().includes(sembolQ)) continue;
    const t = utc(k, h);
    const g = gunAnahtari(t, tzDk);
    if (q.bas && g < q.bas) continue;
    if (q.bit && g > q.bit) continue;
    l.push({ ...k, t, acilisT: k.islemTuru === 'pozisyon' ? utc(k, h, 'acilisZaman') : null, hesapAd: h.ad, anahtar: undefined });
  }
  l.sort((a, b) => b.t - a.t || (b.sira || 0) - (a.sira || 0));
  const toplam = l.length;
  return { toplam, sayfa, boyut, sayfaSayisi: Math.max(1, Math.ceil(toplam / boyut)), satirlar: l.slice((sayfa - 1) * boyut, sayfa * boyut) };
}

/** Fiyat grafiği işaretleri: dolum → yönü; MT pozisyon → açılış (yönü) + kapanış (ters yön). */
function isaretler(D, hesapId, sembol) {
  const out = [];
  for (const k of D.veri) {
    if (k.tur !== 'islem' || k.sembol !== sembol || (hesapId && k.hesap !== hesapId)) continue;
    const h = D.hesaplar.get(k.hesap);
    const t = utc(k, h);
    const mik = +Number(k.miktar).toPrecision(6);
    if (k.islemTuru === 'pozisyon') {
      const ta = utc(k, h, 'acilisZaman');
      if (sayiMi(ta)) out.push({ t: ta, tur: k.yon, etiket: `açılış ${k.yon === 'al' ? 'alış' : 'satış'} ${mik} lot @ ${k.acilisFiyat}` });
      out.push({ t, tur: k.yon === 'al' ? 'sat' : 'al', etiket: `kapanış ${mik} lot @ ${k.fiyat}` });
    } else out.push({ t, tur: k.yon, etiket: `${k.yon === 'al' ? 'alış' : 'satış'} ${mik} @ ${k.fiyat}` });
  }
  return out.sort((a, b) => a.t - b.t);
}

module.exports = { performans, liste, isaretler, istatistik, ekOlcutler, utc, sunucuFarki, abdYazAraligi, gunAnahtari, ORTU_MS };
