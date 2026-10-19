#!/usr/bin/env node
/**
 * QQQ AL-TUT'U YENMEK — 830 M10 · 831 M10-F · 833 LRS-2 M10 + hayatta kalma yanlılığı b
 * PLAN-QQQ-YENMEK.md (ön kayıt 43cefcb, ölçümden önce). Parametre ARANMAZ; tek sürüm.
 *
 *   node scripts/qqq-momentum.js indir   # ^IRX → data/qqq-yenmek/irx.json, ^NDXE / QQQE → ndxe.json / qqqe.json (yoksa)
 *   node scripts/qqq-momentum.js gel     # GELİŞTİRME koşusu (veri 2015-12-31'de kesilir; holdout görülmez) — serbest
 *   node scripts/qqq-momentum.js tam     # TAM koşu (holdout okunur) — aday başına BİR KEZ; momentum-holdout-log.json'a yazar,
 *                                        #   log'da önceki 'tam' varsa REDDEDER (--zorla ile koşar ve tekrarı loglar)
 * Çıktı (tam): data/qqq-yenmek/momentum-sonuc.json + momentum-cikti.md
 *
 * ORTAK TANIMLAR (paralel ajanlarla aynı)
 *   · T-bill günlük getirisi = ^IRX kapanışı / 100 / 252 her NYSE işlem gününde (boş günde önceki değer).
 *     YORUM: d günü (d−1 kapanışı → d kapanışı) faizi d−1 günündeki ^IRX ile (önceden bilinen oran).
 *   · Marj finansmanı = (IRX/100 + 0,015)/252 × (brüt − 1)+ ; nakit kısmı (1 − brüt)+ × T-bill — hepsi long olduğundan
 *     nakit bakiyesi = özsermaye × (1 − brüt): nakit > 0 T-bill kazanır, nakit < 0 marj faizi öder (birebir aynı formül).
 *   · Kayma %0,05 el değiştiren nominalde, komisyon 0. Karar kapanışta, işlem ertesi işlem günü AÇILIŞINDA.
 *   · QQQ al-tut: ilk gün açılışta %0,05 kaymayla tüm nakitle alım, nakit yok.
 *   · Sharpe √252, CAGR takvim günü/365,25, MaxDD günlük kapanış özsermayesinden (lib/research/nasdaq.js metrik).
 *   · Bootstrap: eşli durağan, b 20, N 2000, tohum 99, P(aday bileşik > QQQ bileşik), tüm dönem (nasdaq.bootstrapP
 *     = lib/risk/olcum.js duraganBootstrap).
 *
 * KURALLAR
 *   830 M10  : her ay son işlem günü kapanışında o ayın PIT üyeleri (nasdaqVeri.uyeler(t), gecerliler) içinde 12-1 getiri
 *              (t−12 ay sonu kapanışı → t−1 ay sonu kapanışı) en yüksek 10, her biri 1/10; ertesi işlem günü açılışında
 *              tam dengeleme. Seçilmeyen elde tutulan → 0.
 *   831 M10-F: 830 + ay sonu QQQ kapanışı < son 10 ay sonu kapanışının ortalaması (o ay dahil) → ertesi ay T-bill.
 *   833 LRS-2 M10: QQQ gün sonu kapanışı > SMA200 (QQQ düzeltilmiş, o gün dahil 200 kapanış) iken M10 sepeti ×2 (her biri 2/10),
 *              değilse T-bill. Sepet aylık (830 seçimi), filtre günlük; filtre açıkken ay içinde ağırlıklar kayar (günlük
 *              dengeleme yok — "sepet aylık").
 *   YORUMLAR
 *   · "≥ 13 aylık geçmiş" = ilk çubuk ≤ (t−13). ayın son işlem günü → t−12 … t aylarının 13'ü de TAM kapsanır (katı okuma).
 *     Ayrıca t−12 ve t−1 kapanışları kendi aylarında bir çubuk olmalı, son çubuk t'den en çok 10 takvim günü önce.
 *   · İlk karar 2004-12-31 kapanışı: uyeler(2004-12) boş (üyelik 2005-01'de başlar) → uyeler(2005-01) kullanılır; kütüphane
 *     tanımına göre bu liste "2005-01-01 00:00 itibarıyla" = 2004-12-31 kapanışındaki üyeler (bakış-ileri yok). Böylece aday
 *     QQQ ile aynı gün (2005-01-03) piyasaya girer (ilk ayı T-bill'de geçirip QQQ'nun Ocak 2005 düşüşünden kaçmaz).
 *   · Üye listeden çıkan hisse ay sonu dengelemesine kadar tutulur; verisi biten hisse son kapanıştan (kayma ödenerek) nakde,
 *     nakit ay sonuna kadar T-bill kazanır.
 *   · Uygulama günü hissede çubuk yoksa emir bekler (nasdaq.simule ile aynı).
 *   · b: NDXE (^NDXE) FİYAT endeksi (temettüsüz) 2006-05-02'de başlıyor → geliştirme b'si 2006-05-31 → 2015-12-31 örtüşmesinde.
 *     PIT portföy iki biçimde: toplam getiri (düzeltilmiş) ve fiyat (yalnız bölünme düzeltmeli). Bağlayıcı b = ikisinin
 *     BÜYÜĞÜ, en az 0 (temkinli: eşik ne kadar yüksekse şart o kadar sert).
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const ROOT = path.join(__dirname, '..');
const V = require(path.join(ROOT, 'lib', 'research', 'nasdaqVeri'));
const N = require(path.join(ROOT, 'lib', 'research', 'nasdaq'));
const KO = require(path.join(ROOT, 'lib', 'strategies', 'kitap', 'ortak'));

const DIR = yollar.veri('qqq-yenmek');
const LOG = path.join(DIR, 'momentum-holdout-log.json');
const GUN = 864e5, KAYMA = 0.0005, MARJ_EK = 0.015, K = 10;
const BAS = Date.UTC(2005, 0, 1), HOL = Date.UTC(2016, 0, 1);
const tarih = t => new Date(t).toISOString().slice(0, 10);
const yz = (x, n = 1) => (x == null || !isFinite(x) ? '—' : (x * 100).toFixed(n).replace('.', ',') + '%');
const sy = (x, n = 2) => (x == null || !isFinite(x) ? '—' : x.toFixed(n).replace('.', ','));
const pp = (x, n = 1) => (x == null || !isFinite(x) ? '—' : (x >= 0 ? '+' : '') + (x * 100).toFixed(n).replace('.', ','));

// ═══ İNDİRME ════════════════════════════════════════════════════════════════
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' };
async function yahoo(y) {
  const p2 = Math.floor(Date.now() / 1000);
  for (const host of ['query1', 'query2']) for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?period1=0&period2=${p2}&interval=1d&events=div%2Csplit`, { headers: UA });
      if (r.status === 404) return null;
      if (!r.ok) { await new Promise(z => setTimeout(z, 1500)); continue; }
      const x = (await r.json()).chart.result[0];
      const q = x.indicators.quote[0], ac = (x.indicators.adjclose && x.indicators.adjclose[0].adjclose) || q.close;
      const of = (x.meta && x.meta.gmtoffset) || -5 * 3600, gunler = [];
      for (let k = 0; k < x.timestamp.length; k++) {
        if (q.close[k] == null) continue;
        const d = new Date((x.timestamp[k] + of) * 1000), t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        const s = { t, o: q.open[k], c: q.close[k], ac: ac[k] };
        if (gunler.length && gunler[gunler.length - 1].t === t) gunler[gunler.length - 1] = s; else gunler.push(s);
      }
      return { sembol: y, kaynak: `Yahoo Finance v8 chart (${host})`, indirme: new Date().toISOString(), ad: x.meta.longName || x.meta.shortName, gunler };
    } catch (e) { await new Promise(z => setTimeout(z, 1500)); }
  }
  return null;
}
async function indir() {
  fs.mkdirSync(DIR, { recursive: true });
  for (const [y, dosya, not] of [['^IRX', 'irx.json', '13 haftalık T-bill getirisi, yüzde; günlük T-bill = c/100/252'], ['^NDXE', 'ndxe.json', 'Nasdaq-100 Equal Weighted FİYAT endeksi'], ['QQQE', 'qqqe.json', 'Direxion NASDAQ-100 Equal Weighted ETF']]) {
    const yol = path.join(DIR, dosya);
    if (fs.existsSync(yol)) { console.log(dosya, 'var — yazılmadı'); continue; }
    const j = await yahoo(y);
    if (!j) { console.log(y, 'Yahoo\'da YOK'); continue; }
    j.not = not;
    fs.writeFileSync(yol + '.tmp', JSON.stringify(j)); fs.renameSync(yol + '.tmp', yol);
    console.log(dosya, j.gunler.length, 'gün', tarih(j.gunler[0].t), '→', tarih(j.gunler[j.gunler.length - 1].t));
  }
}

// ═══ VERİ ═══════════════════════════════════════════════════════════════════
function hazirla() {
  const tk = V.takvim();
  const oku = d => JSON.parse(fs.readFileSync(path.join(DIR, d), 'utf8'));
  const irx = oku('irx.json').gunler.filter(x => x.c != null && isFinite(x.c));
  // irxGun[d] = ≤ tk[d] son ^IRX kapanışı (yüzde)
  const irxGun = new Float64Array(tk.length); let j = -1;
  for (let d = 0; d < tk.length; d++) { while (j + 1 < irx.length && irx[j + 1].t <= tk[d]) j++; irxGun[d] = j >= 0 ? irx[j].c : 0; }
  const Q = N.seriHazirla('QQQ', V.duzeltilmis('QQQ'), tk);
  const qSma = KO.sma(Q.k, 200);
  // Ay sonu işlem günleri: aySon.get(ayNo) = takvim indeksi; ayNo = yıl*12+ay
  const ayNo = t => { const x = new Date(t); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };
  const aySon = new Map();
  for (let d = 0; d < tk.length; d++) aySon.set(ayNo(tk[d]), d);
  return { tk, irxGun, Q, qSma, ayNo, aySon, irxKaynak: { dosya: 'data/qqq-yenmek/irx.json', ilk: tarih(irx[0].t), son: tarih(irx[irx.length - 1].t) } };
}

const _seri = new Map();
function seri(s, tk) {
  if (!_seri.has(s)) _seri.set(s, V.seriVarMi(s) ? N.seriHazirla(s, V.duzeltilmis(s), tk) : null);
  return _seri.get(s);
}
/** satir dizisinde t ≤ T olan son indeks (ikili arama). */
function sonOnce(satir, T) { let lo = 0, hi = satir.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (satir[m].t <= T) { r = m; lo = m + 1; } else hi = m - 1; } return r; }

/** M10 seçimi d (ay sonu) kapanışında. → { liste:[{s,p}], aday, uyeAy } */
function secim(D, d, ilkKarar = false) {
  const { tk, ayNo, aySon } = D, m = ayNo(tk[d]);
  let uyeT = tk[d], liste = V.uyeler(uyeT);
  if (!liste.length && ilkKarar) { uyeT = Date.UTC(new Date(tk[d]).getUTCFullYear(), new Date(tk[d]).getUTCMonth() + 1, 1); liste = V.uyeler(uyeT); }
  const T = i => tk[aySon.get(i)];
  const puan = [];
  for (const s of liste) {
    const H = seri(s, tk); if (!H) continue;
    const st = H.satir;
    if (!aySon.has(m - 13) || st[0].t > T(m - 13)) continue;                      // ≥ 13 tam ay geçmiş
    const jS = sonOnce(st, tk[d]); if (jS < 0 || tk[d] - st[jS].t > 10 * GUN) continue;   // verisi kesilmemiş
    const j1 = sonOnce(st, T(m - 1)), j12 = sonOnce(st, T(m - 12));
    if (j1 < 0 || j12 < 0 || st[j1].t <= T(m - 2) || st[j12].t <= T(m - 13)) continue;   // kapanış kendi ayında
    puan.push({ s, p: st[j1].c / st[j12].c - 1 });
  }
  puan.sort((a, b) => b.p - a.p || (a.s < b.s ? -1 : 1));
  return { liste: puan.slice(0, K), aday: puan.length, uyeAy: V.ayAnahtar(uyeT), uyeSay: liste.length };
}

// ═══ SİMÜLATÖR ══════════════════════════════════════════════════════════════
/**
 * finans: 'irx' (ana) | 'sabit' (bilgi: borç yıllık %6 takvim günü/365, nakit 0 — PLAN-NASDAQ modeli).
 * karar(d, ctx) → { s: ağırlık } kısmi hedef (özsermayenin katı, açılış özsermayesiyle) | null.
 */
function simule(D, { karar, d0, dSon, finans = 'irx', seriler }) {
  const { tk, irxGun } = D;
  let nakit = 1, ucret = 0, faiz = 0, nakitFaiz = 0;
  const poz = new Map(), bekleyen = new Map(), egri = [], brut = [], adet = [], devir = new Map();
  const kap = (H, d) => (H.sonIdx[d] >= 0 ? H.satir[H.sonIdx[d]].c : NaN);
  const ctx = { poz, oz: 1 };
  for (let d = d0; d <= dSon; d++) {
    if (d > d0) {
      if (finans === 'irx') {
        if (nakit > 0) { const f = nakit * irxGun[d - 1] / 100 / 252; nakit += f; nakitFaiz += f; }
        else if (nakit < 0) { const f = -nakit * (irxGun[d - 1] / 100 + MARJ_EK) / 252; nakit -= f; faiz += f; }
      } else if (nakit < 0) { const f = -nakit * 0.06 * ((tk[d] - tk[d - 1]) / GUN) / 365; nakit -= f; faiz += f; }
      for (const [s, u] of [...poz]) {                         // verisi biten → son kapanıştan nakde
        const H = seriler(s);
        if (H.bar[d] || tk[d] <= H.sonT) continue;
        const f = H.satir[H.satir.length - 1].c, c = Math.abs(u) * f * KAYMA;
        nakit += u * f - c; ucret += c; poz.delete(s); bekleyen.delete(s);
      }
      if (bekleyen.size) {
        let oz = nakit;
        for (const [s, u] of poz) { const H = seriler(s); oz += u * (H.bar[d] ? H.bar[d].o : kap(H, d - 1)); }
        const ay = D.ayNo(tk[d]);
        for (const [s, w] of [...bekleyen]) {
          const H = seriler(s), b = H.bar[d];
          if (!b) { if (tk[d] > H.sonT) bekleyen.delete(s); continue; }
          bekleyen.delete(s);
          const mevcut = poz.get(s) || 0, istenen = w * oz / b.o, fark = istenen - mevcut;
          if (Math.abs(fark * b.o) < 1e-12) continue;
          const c = Math.abs(fark) * b.o * KAYMA;
          nakit -= fark * b.o + c; ucret += c;
          devir.set(ay, (devir.get(ay) || 0) + Math.abs(fark) * b.o / oz);
          if (Math.abs(istenen * b.o) < 1e-12) poz.delete(s); else poz.set(s, istenen);
        }
      }
    }
    let oz = nakit, br = 0;
    for (const [s, u] of poz) { const c = kap(seriler(s), d); oz += u * c; br += Math.abs(u * c); }
    egri.push({ time: tk[d], oz: Math.max(oz, 1e-12) }); brut.push(oz > 0 ? br / oz : 0); adet.push(poz.size);
    if (oz <= 0) break;
    ctx.oz = oz;
    if (d < dSon) { const k = karar(d, ctx); if (k) for (const [s, w] of Object.entries(k)) bekleyen.set(s, w); }
  }
  return { egri, brut, adet, devir, ucret, faiz, nakitFaiz };
}

// ═══ KARAR ÜRETİCİLERİ ═════════════════════════════════════════════════════
function kararM10(D, d0, { faber = false, carpan = 1, kayit = null } = {}) {
  const { tk, Q, ayNo, aySon } = D;
  return (d, ctx) => {
    if (!N.ayGecis(tk, d)) return null;
    let sec = secim(D, d, d === d0).liste.map(x => x.s);
    let kapali = false;
    if (faber) {
      const m = ayNo(tk[d]), c = [];
      for (let i = 0; i < 10; i++) { const jj = aySon.get(m - i); c.push(N.kapanis(Q, jj)); }
      const ort = c.reduce((a, b) => a + b, 0) / 10;
      if (c[0] < ort) { sec = []; kapali = true; }
    }
    if (kayit) kayit.push({ t: tk[d], sec, kapali });
    const o = {};
    for (const s of ctx.poz.keys()) if (!sec.includes(s)) o[s] = 0;
    for (const s of sec) o[s] = carpan / K;
    return Object.keys(o).length ? o : null;
  };
}
function kararLrs(D, d0, { carpan = 2, kayit = null } = {}) {
  const { tk, Q, qSma } = D;
  let sepet = [], acikOnce = false;
  return (d, ctx) => {
    const ay = N.ayGecis(tk, d);
    if (ay) sepet = secim(D, d, d === d0).liste.map(x => x.s);
    const j = Q.sonIdx[d];
    let acik = acikOnce;
    if (Q.bar[d] && j >= 0 && qSma[j] != null) acik = Q.k[j] > qSma[j];
    const o = {};
    if (acik && (ay || !acikOnce)) {
      for (const s of ctx.poz.keys()) if (!sepet.includes(s)) o[s] = 0;
      for (const s of sepet) o[s] = carpan / K;
    } else if (!acik) for (const s of ctx.poz.keys()) o[s] = 0;
    if (kayit && ay) kayit.push({ t: tk[d], sec: sepet, kapali: !acik });
    acikOnce = acik;
    return Object.keys(o).length ? o : null;
  };
}
function kararAlTut() { let ok = false; return () => (ok ? null : (ok = true, { QQQ: 1 / (1 + KAYMA) })); }

// ═══ ÖLÇÜM ══════════════════════════════════════════════════════════════════
const ADAYLAR = [
  { no: 830, ad: 'M10 kesitsel momentum', kur: (D, d0, k) => kararM10(D, d0, { kayit: k }) },
  { no: 831, ad: 'M10-F (Faber 10 ay)', kur: (D, d0, k) => kararM10(D, d0, { faber: true, kayit: k }) },
  { no: 833, ad: 'LRS-2 M10 (×2, QQQ > SMA200)', kur: (D, d0, k) => kararLrs(D, d0, { kayit: k }) },
];

function kos(D, dSon, finans = 'irx') {
  const { tk } = D, d0 = N.ilkIndeks(tk, BAS);
  const seriler = s => (s === 'QQQ' ? D.Q : seri(s, tk));
  const at = simule(D, { karar: kararAlTut(), d0, dSon, finans, seriler });
  const sonuc = ADAYLAR.map(a => { const kayit = []; const r = simule(D, { karar: a.kur(D, d0, kayit), d0, dSon, finans, seriler }); r.kayit = kayit; return { ...a, r }; });
  return { d0, at, sonuc };
}

function bilgiler(D, r, bas = BAS, bit = Infinity) {
  const { tk } = D;
  const i = r.egri.map((x, k) => k).filter(k => r.egri[k].time >= bas && r.egri[k].time < bit && k > 0);
  const ortAdet = i.reduce((a, k) => a + r.adet[k], 0) / i.length;
  const piyasada = i.filter(k => r.adet[k] > 0).length / i.length;
  const ortBrut = i.reduce((a, k) => a + r.brut[k], 0) / i.length;
  const aylar = [...new Set(i.map(k => D.ayNo(r.egri[k].time)))];
  const devir = aylar.reduce((a, m) => a + (r.devir.get(m) || 0), 0) / aylar.length;
  // devredilen isim: ardışık ay sonu seçimleri arasında değişen sembol sayısı
  let deg = 0, n = 0;
  for (let k = 1; k < r.kayit.length; k++) { if (r.kayit[k].t < bas || r.kayit[k].t >= bit) continue; const a = r.kayit[k - 1].kapali ? [] : r.kayit[k - 1].sec, b = r.kayit[k].kapali ? [] : r.kayit[k].sec; deg += b.filter(s => !a.includes(s)).length; n++; }
  return { ortHisse: ortAdet, piyasadaPay: piyasada, ortBrut, aylikDevir: devir, aylikYeniIsim: n ? deg / n : null, ucret: r.ucret, marjFaizi: r.faiz, nakitFaizi: r.nakitFaiz };
}

function olc(egri, atEgri) {
  return { gel: N.metrik(egri, BAS, HOL), hol: N.metrik(egri, HOL), tum: N.metrik(egri, BAS) };
}

// ═══ b — HAYATTA KALMA YANLILIĞI ═══════════════════════════════════════════
function yanlilik(D) {
  const { tk, ayNo, aySon } = D;
  const oku = d => JSON.parse(fs.readFileSync(path.join(DIR, d), 'utf8'));
  const ndxe = fs.existsSync(path.join(DIR, 'ndxe.json')) ? oku('ndxe.json') : null;
  const qqqe = fs.existsSync(path.join(DIR, 'qqqe.json')) ? oku('qqqe.json') : null;
  const sonD = tk.length - 1;
  // Aylık PIT EW portföy: ay M başında uyeler(M) (gecerliler) içinde verisi olanlar eşit ağırlık; getiri ME(M−1) → ME(M) (son ay: veri sonu).
  const ilkAy = ayNo(BAS), sonAy = ayNo(tk[sonD]);
  const eTR = [{ time: tk[aySon.get(ilkAy - 1)], oz: 1 }], ePR = [{ time: tk[aySon.get(ilkAy - 1)], oz: 1 }];
  const kapsama = [];
  for (let m = ilkAy; m <= sonAy; m++) {
    const t0 = tk[aySon.get(m - 1)], t1 = tk[aySon.get(m)];
    const liste = V.uyeler(Date.UTC(Math.floor(m / 12), m % 12, 1));
    let sTR = 0, sPR = 0, n = 0;
    for (const s of liste) {
      const H = seri(s, tk); if (!H) continue;
      const st = H.satir, j0 = sonOnce(st, t0);
      if (j0 < 0 || t0 - st[j0].t > 10 * GUN) continue;
      const j1 = sonOnce(st, t1);   // ay içinde çubuk yoksa j1 = j0 → getiri 0; ay içinde biterse son kapanışa kadar
      sTR += st[j1].c / st[j0].c - 1; sPR += st[j1].ham / st[j0].ham - 1; n++;
    }
    kapsama.push({ ay: m, uye: liste.length, verili: n });
    eTR.push({ time: t1, oz: eTR[eTR.length - 1].oz * (1 + (n ? sTR / n : 0)) });
    ePR.push({ time: t1, oz: ePR[ePR.length - 1].oz * (1 + (n ? sPR / n : 0)) });
  }
  const deger = (seri, T, alan = 'c') => { const j = sonOnce(seri, T); return j >= 0 ? seri[j][alan] : NaN; };
  const egriDeger = (e, T) => { let v = NaN; for (const x of e) { if (x.time <= T) v = x.oz; else break; } return v; };
  const cagr = (v0, v1, t0, t1) => Math.pow(v1 / v0, 365.25 * GUN / (t1 - t0)) - 1;
  const donem = (b, s, ref, alan) => {
    // başlangıç: ref'in ilk ay sonu (ref b'den sonra başlıyorsa) ya da b'den önceki son ay sonu
    const a0 = b <= ref.gunler[0].t ? aySon.get(ayNo(ref.gunler[0].t)) : aySon.get(ayNo(b) - 1);
    const T1 = s === Infinity ? tk[sonD] : tk[aySon.get(ayNo(s) - 1)];
    const A0 = tk[a0];
    const rv0 = deger(ref.gunler, A0, alan), rv1 = deger(ref.gunler, T1, alan);
    const tr = cagr(egriDeger(eTR, A0), egriDeger(eTR, T1), A0, T1), pr = cagr(egriDeger(ePR, A0), egriDeger(ePR, T1), A0, T1), rc = cagr(rv0, rv1, A0, T1);
    return { bas: tarih(A0), son: tarih(T1), pitTR: tr, pitPR: pr, ref: rc, bTR: tr - rc, bPR: pr - rc };
  };
  const out = { kaynak: null, kapsama };
  { let g = [0, 0], h = [0, 0]; for (const k of V.uyelik().keys()) { const t = Date.parse(k + '-15'), o = k < '2016-01' ? g : h; o[0] += V.uyeler(t, { gecerliler: false }).length; o[1] += V.uyeler(t).filter(z => V.seriVarMi(z)).length; } out.tumUyeKapsama = { gel: g[1] / g[0], hol: h[1] / h[0] }; }
  if (ndxe) {
    out.kaynak = '^NDXE (Yahoo, Nasdaq-100 Equal Weighted FİYAT endeksi, ' + tarih(ndxe.gunler[0].t) + ' →)';
    out.gel = donem(BAS, HOL, ndxe, 'c'); out.hol = donem(HOL, Infinity, ndxe, 'c'); out.tum = donem(BAS, Infinity, ndxe, 'c');
    for (const k of ['gel', 'hol', 'tum']) out[k].b = Math.max(0, out[k].bTR, out[k].bPR);
  }
  if (qqqe) {   // bilgi: ETF toplam getiri (adjclose, gider oranı dahil) — PIT TR ile kıyas
    const g = qqqe.gunler.map(x => ({ t: x.t, c: x.ac }));
    out.qqqeBilgi = { kaynak: 'QQQE (Direxion ETF, adjclose, ' + tarih(g[0].t) + ' →)', hol: donem(HOL, Infinity, { gunler: g }, 'c'), tum: donem(BAS, Infinity, { gunler: g }, 'c') };
  }
  return out;
}

// ═══ ANA ════════════════════════════════════════════════════════════════════
async function ana() {
  const kip = process.argv[2] || 'gel';
  if (kip === 'indir') return indir();
  if (!fs.existsSync(path.join(DIR, 'irx.json'))) await indir();
  const D = hazirla();
  const { tk } = D;
  const dGelSon = N.ilkIndeks(tk, HOL);

  // ── 1. GELİŞTİRME (veri 2015-12-31'de kesilir) ──
  const G = kos(D, dGelSon);
  const atGel = N.metrik(G.at.egri, BAS, HOL);
  console.log(`GELİŞTİRME ${tarih(tk[G.d0])} → ${tarih(tk[dGelSon])} · QQQ al-tut CAGR ${yz(atGel.cagr)} DD ${yz(atGel.maxDD)} Sh ${sy(atGel.sharpe)}`);
  for (const x of G.sonuc) {
    const m = N.metrik(x.r.egri, BAS, HOL), b = bilgiler(D, x.r, BAS, HOL);
    console.log(`${x.no} ${x.ad.padEnd(30)} CAGR ${yz(m.cagr)} DD ${yz(m.maxDD)} Sh ${sy(m.sharpe)} · ort hisse ${sy(b.ortHisse, 1)} piyasada ${yz(b.piyasadaPay, 0)} brüt ${sy(b.ortBrut)} devir/ay ${yz(b.aylikDevir, 0)} yeni isim/ay ${sy(b.aylikYeniIsim, 1)}`);
  }
  if (kip === 'gel') {
    const say = new Map(); for (const k of G.sonuc[0].r.kayit) for (const s of k.sec) say.set(s, (say.get(s) || 0) + 1);
    console.log('830 en sık seçilen (ay):', [...say].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([s, n]) => s + ' ' + n).join(', '));
    const kk = G.sonuc[0].r.kayit; console.log('ilk karar', tarih(kk[0].t), kk[0].sec.join(' '), '· son', tarih(kk[kk.length - 1].t), kk[kk.length - 1].sec.join(' '));
    console.log('(holdout okunmadı)'); return;
  }
  if (kip !== 'tam') throw new Error('kip: indir | gel | tam');

  // ── 2. TAM KOŞU — holdout BİR KEZ ──
  const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : [];
  const onceki = log.filter(x => x.kip === 'tam');
  if (onceki.length && !process.argv.includes('--zorla')) { console.error(`HOLDOUT ZATEN OKUNDU (${onceki.map(x => x.zaman).join(', ')}) — tekrar için --zorla (loglanır)`); process.exit(2); }
  log.push({ kip: 'tam', zaman: new Date().toISOString(), adaylar: ADAYLAR.map(a => a.no), tekrar: onceki.length, pid: process.pid });
  fs.writeFileSync(LOG, JSON.stringify(log, null, 1));

  const dSon = tk.length - 1;
  const T = kos(D, dSon), S = kos(D, dSon, 'sabit');
  const at = olc(T.at.egri);
  const Y = yanlilik(D);
  const btcJ = JSON.parse(fs.readFileSync(yollar.veri('gercek', 'bitstamp-btcusd-1d.json'), 'utf8'));
  const btc = btcJ.mumlar.filter(x => x.c > 0).map(x => ({ time: x.t, oz: x.c }));
  const btcBas = btc[0].time;

  const rDevler = G.sonuc.map(x => { const e = x.r.egri; return e.slice(1).map((y, i) => y.oz / e[i].oz - 1); });
  const srListe = rDevler.map(r => N.gunlukSharpe(r));
  const dilimYil = [2008, 2020, 2022];
  const atYil = N.yillik(T.at.egri).filter(x => x.yil >= 2005);

  const satirlar = T.sonuc.map((x, i) => {
    const e = x.r.egri, m = olc(e);
    const gelDev = N.metrik(G.sonuc[i].r.egri, BAS, HOL);
    const tutarli = Math.abs(gelDev.cagr - m.gel.cagr) < 1e-12 && Math.abs(gelDev.maxDD - m.gel.maxDD) < 1e-12;
    const P = N.bootstrapP(N.esliGetiri(e, T.at.egri, BAS));
    const k1 = gelDev.cagr > atGel.cagr, k2 = m.hol.cagr > at.hol.cagr, k3 = m.tum.maxDD < at.tum.maxDD, k4 = P >= 0.70;
    const fGel = gelDev.cagr - atGel.cagr, fHol = m.hol.cagr - at.hol.cagr;
    const yanGel = Y.gel ? fGel > Y.gel.b : false, yanHol = Y.hol ? fHol > Y.hol.b : false;
    const gecti = k1 && k2 && k3 && k4 && yanGel && yanHol;
    const hukum = gecti ? 'GEÇTİ' : (k1 && k2 && k3 && k4 ? 'RED — yanlılık şüpheli, kabul edilmez' : 'RED');
    const yil = N.yillik(e).filter(z => z.yil >= 2005);
    const dilim = Object.fromEntries(dilimYil.map(Y_ => { const a = N.metrik(e, Date.UTC(Y_, 0, 1), Date.UTC(Y_ + 1, 0, 1)), q = N.metrik(T.at.egri, Date.UTC(Y_, 0, 1), Date.UTC(Y_ + 1, 0, 1)); return [Y_, { getiri: a.toplam, maxDD: a.maxDD, qqqGetiri: q.toplam, qqqMaxDD: q.maxDD }]; }));
    const ms = olc(S.sonuc[i].r.egri), Ps = N.bootstrapP(N.esliGetiri(S.sonuc[i].r.egri, S.at.egri, BAS));
    const btcPencere = N.metrik(e, btcBas);
    return {
      no: x.no, ad: x.ad, gel: gelDev, gelTamKosu: m.gel, gelTutarli: tutarli, hol: m.hol, tum: m.tum, P,
      kriter: { k1, k2, k3, k4 }, fark: { gel: fGel, hol: fHol }, yanlilik: { gel: yanGel, hol: yanHol }, gecti, hukum,
      enKotuYil: yil.reduce((a, b) => (b.getiri < a.getiri ? b : a)), yillik: yil, dilim,
      bilgi: { tum: bilgiler(D, x.r, BAS), gel: bilgiler(D, x.r, BAS, HOL), hol: bilgiler(D, x.r, HOL) },
      sabit6: { gel: ms.gel.cagr, hol: ms.hol.cagr, maxDD: ms.tum.maxDD, sharpe: ms.tum.sharpe, P: Ps },
      dsr837: N.dsr(rDevler[i], srListe, 837), srGunlukGel: srListe[i],
      btcPencere: { bas: tarih(btcBas), cagr: btcPencere.cagr, maxDD: btcPencere.maxDD, sharpe: btcPencere.sharpe },
    };
  });

  const btcM = { gel: N.metrik(btc, btcBas, HOL, 365), hol: N.metrik(btc, HOL, Infinity, 365), tum: N.metrik(btc, btcBas, Infinity, 365) };
  const qqqBtcPencere = N.metrik(T.at.egri, btcBas);

  // Son ay sonu M10 listesi
  let dAy = dSon; while (dAy > 0 && !(dAy < dSon && N.ayGecis(tk, dAy))) dAy--;
  const son = secim(D, dAy);
  const faberSon = (() => { const m = D.ayNo(tk[dAy]), c = []; for (let i = 0; i < 10; i++) c.push(N.kapanis(D.Q, D.aySon.get(m - i))); const o = c.reduce((a, b) => a + b, 0) / 10; return { kapanis: c[0], ort10: o, acik: c[0] >= o }; })();
  const jq = D.Q.sonIdx[dSon];
  const lrsSon = { tarih: tarih(tk[dSon]), kapanis: D.Q.k[jq], sma200: D.qSma[jq], acik: D.Q.k[jq] > D.qSma[jq] };

  const sonuc = {
    plan: 'PLAN-QQQ-YENMEK.md (ön kayıt 43cefcb)', betik: 'scripts/qqq-momentum.js', uretim: new Date().toISOString(),
    donem: { bas: tarih(tk[T.d0]), holdout: '2016-01-01', son: tarih(tk[dSon]) }, tbill: D.irxKaynak,
    qqqAlTut: { gel: atGel, hol: at.hol, tum: at.tum, yillik: atYil, btcPencere: { cagr: qqqBtcPencere.cagr, maxDD: qqqBtcPencere.maxDD, sharpe: qqqBtcPencere.sharpe } },
    adaylar: satirlar, yanlilikB: Y, btcAlTut: { kaynak: 'data/gercek/bitstamp-btcusd-1d.json', bas: tarih(btcBas), yillikKatsayi: 365, ...btcM },
    sonAyM10: { kararGunu: tarih(tk[dAy]), uyeAy: son.uyeAy, uyeSay: son.uyeSay, aday: son.aday, liste: son.liste, faber: faberSon, lrs: lrsSon },
    holdoutLog: log,
  };
  fs.writeFileSync(path.join(DIR, 'momentum-sonuc.json'), JSON.stringify(sonuc, null, 1));
  fs.writeFileSync(path.join(DIR, 'momentum-cikti.md'), rapor(sonuc));
  console.log(rapor(sonuc));
}

function rapor(R) {
  const L = [], p = s => L.push(s), a = R.qqqAlTut, Y = R.yanlilikB;
  p(`# QQQ al-tut'u yenmek — 830 M10 · 831 M10-F · 833 LRS-2 M10 (ölçüm)`);
  p(``);
  p(`Ön kayıt ${R.plan}. Betik \`${R.betik}\`. Dönem ${R.donem.bas} kapanışı → ${R.donem.son}; geliştirme → 2015-12-31, holdout ${R.donem.holdout} →. T-bill = ^IRX (${R.tbill.dosya}, ${R.tbill.ilk} → ${R.tbill.son}) /100/252; marj IRX + %1,5; kayma %0,05.`);
  p(``);
  p(`## Kabul tablosu`);
  p(`| # | aday | gel CAGR | hol CAGR | MaxDD | Sharpe | P(>QQQ) | 1 2 3 4 | gel fark / b | hol fark / b | yanlılık şartı | hüküm |`);
  p(`|---|---|---|---|---|---|---|---|---|---|---|---|`);
  p(`| — | QQQ al-tut | ${yz(a.gel.cagr)} | ${yz(a.hol.cagr)} | ${yz(a.tum.maxDD)} | ${sy(a.tum.sharpe)} | — | — | — | — | — | kıyas |`);
  const ok = b => (b ? '✓' : '✗');
  for (const x of R.adaylar) p(`| ${x.no} | ${x.ad} | ${yz(x.gel.cagr)} | ${yz(x.hol.cagr)} | ${yz(x.tum.maxDD)} | ${sy(x.tum.sharpe)} | ${sy(x.P)} | ${ok(x.kriter.k1)} ${ok(x.kriter.k2)} ${ok(x.kriter.k3)} ${ok(x.kriter.k4)} | ${pp(x.fark.gel)} / ${Y.gel ? pp(Y.gel.b) : '—'} | ${pp(x.fark.hol)} / ${Y.hol ? pp(Y.hol.b) : '—'} | ${ok(x.yanlilik.gel)} ${ok(x.yanlilik.hol)} | **${x.hukum}** |`);
  p(`Fark ve b yıllık yüzde puan. Geliştirme metrikleri veri 2015-12-31'de kesilen ayrı koşudan; tam koşuyla birebir aynı: ${R.adaylar.every(x => x.gelTutarli) ? 'evet' : 'HAYIR'}.`);
  p(``);
  p(`## Hayatta kalma yanlılığı b`);
  p(`Kaynak: ${Y.kaynak || 'YOK'}. PIT portföy: her ay başı uyeler(ay) (gecerliler) içinde verisi olanlar eşit ağırlık, ay sonu → ay sonu, maliyetsiz; verisi biten hisse son kapanışından sonra 0 getiri.`);
  p(`| dönem | aralık | PIT EW toplam getiri | PIT EW fiyat | NDXE (fiyat) | b (TR − NDXE) | b (fiyat − NDXE) | bağlayıcı b |`);
  p(`|---|---|---|---|---|---|---|---|`);
  for (const k of ['gel', 'hol', 'tum']) if (Y[k]) p(`| ${k} | ${Y[k].bas} → ${Y[k].son} | ${yz(Y[k].pitTR)} | ${yz(Y[k].pitPR)} | ${yz(Y[k].ref)} | ${pp(Y[k].bTR)} | ${pp(Y[k].bPR)} | ${pp(Y[k].b)} |`);
  if (Y.qqqeBilgi) p(`Bilgi — ${Y.qqqeBilgi.kaynak}: holdout PIT TR ${yz(Y.qqqeBilgi.hol.pitTR)} vs QQQE ${yz(Y.qqqeBilgi.hol.ref)} (fark ${pp(Y.qqqeBilgi.hol.bTR)}); ${Y.qqqeBilgi.tum.bas} → ${Y.qqqeBilgi.tum.son}: ${yz(Y.qqqeBilgi.tum.pitTR)} vs ${yz(Y.qqqeBilgi.tum.ref)} (fark ${pp(Y.qqqeBilgi.tum.bTR)}).`);
  const kp = Y.kapsama, gk = kp.filter(x => x.ay < 2016 * 12), hk = kp.filter(x => x.ay >= 2016 * 12);
  const oran = l => l.reduce((s, x) => s + x.verili, 0) / l.reduce((s, x) => s + x.uye, 0);
  if (Y.tumUyeKapsama) p(`TÜM üye-aylar içinde (gecerliler: false) verisi olan pay: geliştirme ${yz(Y.tumUyeKapsama.gel)}, holdout ${yz(Y.tumUyeKapsama.hol)} — eksik kısım (Yahoo'da olmayan / yanlış şirkete ait) b'nin ölçtüğü yanlılığın kaynağı.`);
  p(`Üyelerin verili oranı (gecerliler içinde, ay başı verisi olan): geliştirme ${yz(oran(gk))}, holdout ${yz(oran(hk))}; en düşük ay ${(() => { const m = kp.reduce((a, b) => (b.verili / b.uye < a.verili / a.uye ? b : a)); return `${Math.floor(m.ay / 12)}-${String(m.ay % 12 + 1).padStart(2, '0')} ${m.verili}/${m.uye}`; })()}.`);
  p(``);
  p(`## Bilgi (hükmü bağlamaz)`);
  p(`| # | Sharpe gel / hol / tüm | en kötü yıl | 2008 | 2020 | 2022 | ort. hisse | piyasada | ort. brüt | aylık devir | yeni isim/ay | %6 borç · nakit 0: gel / hol / DD / P | DSR(837) |`);
  p(`|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
  const ay = (y) => { const q = a.yillik.find(z => z.yil === y); return q ? q.getiri : null; };
  p(`| QQQ | ${sy(a.gel.sharpe)} / ${sy(a.hol.sharpe)} / ${sy(a.tum.sharpe)} | ${(() => { const w = a.yillik.reduce((x, y) => (y.getiri < x.getiri ? y : x)); return `${w.yil} ${yz(w.getiri)}`; })()} | ${yz(ay(2008))} | ${yz(ay(2020))} | ${yz(ay(2022))} | 1 | %100 | 1,00 | — | — | aynı | — |`);
  for (const x of R.adaylar) {
    const b = x.bilgi.tum, d = x.dilim;
    p(`| ${x.no} | ${sy(x.gel.sharpe)} / ${sy(x.hol.sharpe)} / ${sy(x.tum.sharpe)} | ${x.enKotuYil.yil} ${yz(x.enKotuYil.getiri)} | ${yz(d[2008].getiri)} (DD ${yz(d[2008].maxDD, 0)}) | ${yz(d[2020].getiri)} (DD ${yz(d[2020].maxDD, 0)}) | ${yz(d[2022].getiri)} (DD ${yz(d[2022].maxDD, 0)}) | ${sy(b.ortHisse, 1)} | ${yz(b.piyasadaPay, 0)} | ${sy(b.ortBrut)} | ${yz(b.aylikDevir, 0)} | ${sy(b.aylikYeniIsim, 1)} | ${yz(x.sabit6.gel)} / ${yz(x.sabit6.hol)} / ${yz(x.sabit6.maxDD)} / ${sy(x.sabit6.P)} | ${sy(x.dsr837)} |`);
  }
  p(`QQQ dilim DD: 2008 ${yz(R.adaylar[0].dilim[2008].qqqMaxDD, 0)}, 2020 ${yz(R.adaylar[0].dilim[2020].qqqMaxDD, 0)}, 2022 ${yz(R.adaylar[0].dilim[2022].qqqMaxDD, 0)}. Aylık devir = ay içinde el değiştiren nominal / açılış özsermayesi (alım + satım toplamı). DSR: N = 837, σ(SR) yalnız bu 3 adayın günlük geliştirme Sharpe'larından → KABA.`);
  p(``);
  p(`### Yıllık getiriler`);
  const yillar = a.yillik.map(z => z.yil);
  p(`| yıl | QQQ | ${R.adaylar.map(x => x.no).join(' | ')} |`);
  p(`|---|---|${R.adaylar.map(() => '---').join('|')}|`);
  for (const y of yillar) p(`| ${y} | ${yz(ay(y))} | ${R.adaylar.map(x => { const q = x.yillik.find(z => z.yil === y); return yz(q && q.getiri); }).join(' | ')} |`);
  p(``);
  const B = R.btcAlTut;
  p(`### BTC al-tut (bilgi; Bitstamp, ${B.bas} →, Sharpe √365)`);
  p(`BTC: ${B.bas} → 2015-12-31 CAGR ${yz(B.gel.cagr)} / DD ${yz(B.gel.maxDD)} / Sh ${sy(B.gel.sharpe)} · holdout CAGR ${yz(B.hol.cagr)} / DD ${yz(B.hol.maxDD)} / Sh ${sy(B.hol.sharpe)} · tüm CAGR ${yz(B.tum.cagr)} / DD ${yz(B.tum.maxDD)} / Sh ${sy(B.tum.sharpe)}.`);
  p(`Aynı pencerede (${B.bas} →): QQQ ${yz(a.btcPencere.cagr)} / ${yz(a.btcPencere.maxDD)} / ${sy(a.btcPencere.sharpe)}; ${R.adaylar.map(x => `${x.no} ${yz(x.btcPencere.cagr)} / ${yz(x.btcPencere.maxDD)} / ${sy(x.btcPencere.sharpe)}`).join('; ')}.`);
  p(``);
  const S = R.sonAyM10;
  p(`## Son ay sonu M10 listesi (karar ${S.kararGunu} kapanışı, üyelik ${S.uyeAy}: ${S.uyeSay} üye, ${S.aday} uygun aday)`);
  p(`| # | sembol | 12-1 getiri |`);
  p(`|---|---|---|`);
  S.liste.forEach((x, i) => p(`| ${i + 1} | ${x.s} | ${yz(x.p)} |`));
  p(`Faber (831): QQQ ay sonu ${sy(S.faber.kapanis)} vs 10 ay ort. ${sy(S.faber.ort10)} → ${S.faber.acik ? 'AÇIK (M10)' : 'KAPALI (T-bill)'}. LRS (833) ${S.lrs.tarih}: QQQ ${sy(S.lrs.kapanis)} vs SMA200 ${sy(S.lrs.sma200)} → ${S.lrs.acik ? 'AÇIK (×2)' : 'KAPALI'}. (Liste kabul ürünü değil — hiçbir aday geçmediyse yalnız bilgi.)`);
  p(``);
  p(`## Yorumlar (ön kayıtta açık olmayan noktalar, temkinli seçim)`);
  p(`1. "≥ 13 aylık geçmiş" = ilk çubuk t−13. ayın son işlem gününde ya da önce (t−12 … t ayları tam); 12-1 kapanışları kendi aylarında olmalı; son çubuk karar gününden ≤ 10 gün önce.`);
  p(`2. İlk karar (2004-12-31): uyeler(2004-12) boş → uyeler(2005-01) (kütüphane tanımıyla 2004-12-31 kapanışındaki üyeler). Diğer tüm aylarda uyeler(t) = o ayın listesi (ay içi eklemeler bir ay gecikmeli girer).`);
  p(`3. Listeden çıkan hisse ay sonu dengelemesine kadar tutulur; verisi biten hisse son kapanıştan nakde (kayma), nakit T-bill.`);
  p(`4. T-bill/marj faizi d günü için d−1'in ^IRX değeriyle; işlem günü başına /252.`);
  p(`5. 831 Faber ortalaması o ayın kapanışı dahil son 10 ay sonu. 833 filtresi QQQ düzeltilmiş kapanışı vs SMA200 (o gün dahil); filtre açılınca o ayın (son ay sonunda seçilmiş) sepeti alınır, ay içinde dengeleme yok.`);
  p(`6. b: NDXE fiyat endeksi 2006-05'te başlar → geliştirme b'si 2006-05-31 → 2015-12-31. Bağlayıcı b = max(TR−NDXE, fiyat−NDXE, 0) (temkinli: TR−NDXE temettüyü de "yanlılık" sayar; negatif b eşiği gevşetmez).`);
  p(``);
  p(`## Holdout logu`);
  for (const x of R.holdoutLog) p(`- ${x.kip} ${x.zaman} adaylar ${x.adaylar.join(', ')} (tekrar ${x.tekrar})`);
  return L.join('\n') + '\n';
}

// Dışa aktarım (scripts/midas-maliyet.js, 2026-10-13): doğrudan çalıştırılınca davranış aynı.
if (require.main === module) ana().catch(e => { console.error(e); process.exit(1); });
module.exports = { hazirla, seri, secim, simule, kararM10, kararAlTut, bilgiler, BAS, HOL, KAYMA, MARJ_EK, K };
