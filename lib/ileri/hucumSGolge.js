/**
 * İLERİ GÖLGE — Kairos-S (Hücum-S, 1000 $) ayrı EMİRSİZ gölgesi · deneme 972 · PLAN-ILERI-HUCUM-S.md "İleri gölge (deneme 972)".
 * EMİR YOK, PARA YOK, ANAHTAR YOK: Binance genel API (anahtarsız) + sunucunun Kairos simülasyonu (data/ileri/bindirme-golge.jsonl).
 * lib/live, lib/risk, engine, exchange'e DOKUNMAZ — yalnız saf fonksiyonlarını ÇAĞIRIR (kural tek yerde):
 *   · küçük sermaye kuralı  lib/live/kucukSermaye.js  (Lsec, minEtkin, oncekiAyKapanis, nSecTum, dcaAyariN — canlı Kairos-S'in kullandığı)
 *   · kol modeli            lib/live/kalkanBot.js     (donchianModelGetirisi; DCA segment/ısınma kuralı dcaModelGetirisi ile aynı, merdiven n'li)
 *   · evren / üyelik         lib/live/evren.js + KalkanBot._uyeFn / _segmentBasiFn (C0 gölgesinin evren kaydı data/ileri/kol/, YALNIZ OKUNUR)
 *   · DCA ayarı n = 6        lib/live/dcaBot.js dcaAyari (değişmemiş B Kalkan oranları)
 *   · bantlar               lib/ileri/hucumDengeEsikleri.js DAGILIM.hucumS (deneme 861, DONDURULMUŞ)
 *
 * GÜNLÜK MODEL GETİRİSİ (gün D):
 *   Kairos-S = BTC ayağı + kol_S
 *   BTC ayağı = C0 gölge satırının BTC ayağı (hucum.C0 − kol.getiri; btcPay 1 — Kairos ile aynı: önceki günün O-GC kararı × BTC
 *              getirisi − geçişte %0,12)
 *   kol_S    = 3 × (w_don × r_don_S + w_dca × r_dca_S); w = C0 satırının ters-vol ağırlıkları (canlıda da ağırlık TÜM evrenin
 *              model getirisinden — kalkanBot.calistir adım 1, S'den önce)
 *   r_don_S  = donchianModelGetirisi(evrenin UYGUN sembolleri; 1/N uygunlar üzerinden) — mumlar D'ye kesilir
 *   r_dca_S  = uygun ve merdiveni seçilmiş (n) sembollerin DCA model getirilerinin eşit ortalaması; sembol başına backtester
 *              'dca_bot', 10000 sermaye, BO = 10000 × BO_PAY(n), SO = 1,4 × BO, maxSafeOrder n (n = 6 → dcaAyari)
 *   Ayın S durumu (her ayın ilk günü, kayda bir kez yazılır, sonra DEĞİŞMEZ): F = gölge özsermayesi (1000 $ × birikimli, ay başı),
 *   L = Lsec(F), minEtkin = max(MIN_NOTIONAL, minQty × önceki ay son kapanış) — Binance USDⓈ-M filtreleri (ccxt pazar), uygun ⇔
 *   minEtkin ≤ L, n = nSecTum(uygun, 3 × F × w_dca).
 *
 * MODEL DÜZEYİ (bilinen sınır, PLAN'da yazılı): emir düzeyi yuvarlama (adım / asgari nominal) S kuralının seçtiği semboller ve
 * merdivenle karşılanır, ayrıca simüle edilmez; çekilebilir USDT kısıtı (860) ve "açık deal varken n değişmez" kuralı cüzdan durumu
 * ister — model getirisinde yok (860: kısıtın Kairos-S'e etkisi CAGR −0,3 puan, MaxDD aynı). Gerçekleşen fark B takibinde ölçülür.
 *
 * KAYIT data/ileri/hucum-s/kayit.jsonl — YALNIZ EKLENİR: `ay` (S durumu) · `gun` · `eksik` (kalıcı boşluk) · `kontrol` (90/182/365 g)
 *   · `durum` (uyarı / DUR ilk kez). son.json özet (panel bunu okur). Her çalışmada eksik günler + son DOGRULA günü yeniden
 *   hesaplanır; kayıtlı satırın imzası değişirse UYARI (`degisen`), kayıt değişmez. Ara raporda hüküm yok; kontrol noktaları
 *   deneme 861'in önceden yazılmış A kuralıdır (tutarlı / uyarı), DUR her an.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const I = require('./bollingerIzleme');
const HD = require('./hucumDengeEsikleri');

const DENEME = 972;
const ESIK_DENEME = 861;
const PLAN = 'PLAN-ILERI-HUCUM-S.md';
const BAS = '2026-10-07';            // ilk gölge günü = C0 ileri döneminin ve 861 bantlarının başlangıcı (G3 takvimiyle aynı)
const ON_KAYIT = '2026-10-24';       // ön kayıt günü; BAS → 2026-10-23 arası geriye doldurma (kural donmuş, parametre yok)
const SERMAYE = 1000;
const KOL_M = 3;
const MUM_GUN = 1000;                // canlı kalkanBot ile aynı pencere: D gününün hesabı [D − 999, D] mumlarıyla
const DOGRULA = 3;                   // her çalışmada son kaç kayıtlı gün yeniden hesaplanıp imzası denetlenir
const KALICI_BOSLUK_GUN = 60;        // C0 satırı bu kadar günden eskiyse artık gelmez (bollingerIzleme 60 gün geriye doldurur)
const GUN = 864e5;

const gn = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / GUN);
const gs = (g) => new Date(g * GUN).toISOString().slice(0, 10);
const gunEkle = (s, k) => gs(gn(s) + k);
const ayEt = (s) => s.slice(0, 7);
const ayBasiMs = (s) => Date.parse(`${ayEt(s)}-01T00:00:00Z`);
const sha = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);
const yuv = (x, b = 10) => (Number.isFinite(x) ? Math.round(x * 10 ** b) / 10 ** b : null);
const okuJ = (p, v = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return v; } };
function yazJ(p, o) { fs.mkdirSync(path.dirname(p), { recursive: true }); const t = `${p}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o), 'utf8'); fs.renameSync(t, p); }

/** Kontrol noktaları (861 / G3): BAS + 90 / 182 / 365 gün. */
const KONTROL = Object.freeze(HD.UFUKLAR.map(u => Object.freeze({ ufuk: u, tarih: gunEkle(BAS, u) })));
const KAPI = '2027-01-05';           // PLAN-GERCEK-PARA-2027 G3 — 90. gün kontrolüyle aynı gün

const dosyalar = (dizin = I.VARSAYILAN_DIZIN) => {
  const k = path.join(dizin, 'hucum-s');
  return { kok: k, kayit: path.join(k, 'kayit.jsonl'), son: path.join(k, 'son.json'), golge: I.dosyalar(dizin).golge, kol: path.join(dizin, 'kol') };
};

/* ═══════════ AĞ (Binance genel API, ccxt, anahtarsız) ═══════════ */
function gercekAg() {
  const b = new (require('ccxt').binanceusdm)({ enableRateLimit: true });
  return {
    async hazirla() { if (!b.markets || !Object.keys(b.markets).length) await I.tekrarla(() => b.loadMarkets()); return b.markets; },
    pazar(s) { return b.markets ? b.markets[s] : null; },
    /** Kapanmış günlük mumlar [bas, simdi) — sayfalı; { time, open, high, low, close, volume }. */
    async mumlar(s, basMs, simdi) {
      const out = new Map(); let t = basMs;
      for (let i = 0; i < 6 && t < simdi; i++) {
        const ham = await I.tekrarla(() => b.fetchOHLCV(s, '1d', t, 1000));
        const kap = ham.filter(m => m[0] + GUN <= simdi - 30e3);
        for (const m of kap) out.set(m[0], { time: m[0], open: m[1], high: m[2], low: m[3], close: m[4], volume: m[5] });
        if (ham.length < 1000 || !kap.length) break;
        t = kap[kap.length - 1][0] + GUN;
      }
      return [...out.values()].sort((a, c) => a.time - c.time);
    },
  };
}

/* ═══════════ SAF HESAPLAR ═══════════ */
const kes = (m, D) => { const ust = (gn(D) + 1) * GUN, alt = (gn(D) - MUM_GUN + 1) * GUN; return m.filter(x => x.time >= alt && x.time < ust); };

/**
 * Saf: ayın S durumu (kalkanBot._kucukSermaye ile aynı adımlar, KS fonksiyonları).
 * @param o.U evren · o.mumlar Map(s → mumlar) · o.pazar (s) → ccxt pazar · o.F özsermaye · o.wDca o günün DCA ağırlığı · o.ay 'YYYY-AA'
 */
function ayDurumu({ U, mumlar, pazar, F, wDca, ay }) {
  const KS = require('../live/kucukSermaye');
  const ayMs = Date.parse(`${ay}-01T00:00:00Z`);
  const me = {};
  for (const s of U) { const x = KS.minEtkin(pazar(s), KS.oncekiAyKapanis(mumlar.get(s), ayMs)); me[s] = { deger: yuv(x.deger, 8), minN: x.minN, minQty: x.minQty, bilinen: x.bilinen }; }
  const L = KS.Lsec(F);
  const uygun = L == null ? [] : U.filter(s => me[s].deger <= L);
  const sec = KS.nSecTum(uygun.filter(s => mumlar.has(s)), (s) => me[s].deger, KOL_M * F * wDca);
  const n = {}; for (const [s, k] of sec) n[s] = k;
  return { ay, F: yuv(F, 6), L, wDca: yuv(wDca, 10), U: [...U], uygun, n, me, disarida: U.filter(s => !uygun.includes(s)) };
}

/** Saf: tek sembolün D günü DCA model getirisi (dcaModelGetirisi'nin segment / ısınma kuralı; merdiven n). null = o gün veri yok. */
function dcaSGetiri(mumlarD, n, segBas, D) {
  const B = require('../backtester');
  const { dcaAyari } = require('../live/dcaBot');
  const KS = require('../live/kucukSermaye');
  const ISINMA = 60;
  let i0 = segBas == null ? Math.min(ISINMA, mumlarD.length) : mumlarD.findIndex(m => m.time >= segBas);
  if (i0 < 0) return null;
  const onek = Math.min(i0, ISINMA);
  const dilim = mumlarD.slice(i0 - onek);
  if (dilim.length - onek < 5 || dilim.length < 35) return null;
  const ayar = n === 6 || n == null ? dcaAyari(10000, {}) : KS.dcaAyariN(10000, n, {});
  const r = B.run('dca_bot', { marketType: 'perpetual', leverage: 1, contractSpecs: { taker: 0.0005, maker: 0.0002 }, ...ayar }, dilim, 10000, '1d', { trace: false, girisBasi: Math.max(30, onek) });
  const e = r.equityCurve; if (!e || e.length < 2) return null;
  const son = e[e.length - 1], once = e[e.length - 2];
  if (Math.floor(Date.parse(son.time) / GUN) !== gn(D) || !(once.value > 0)) return null;
  return son.value / once.value - 1;
}

/**
 * Saf: D günü kol_S. → { kolS, rDon, rDca, donSayi, dcaSayi } | { bekle: neden }
 * @param o.S ay durumu · o.mumlar Map(s → tüm mumlar) · o.evren (ayEvreni, sabitMi) · o.c0 C0 gölge satırı
 */
function kolSGunu({ D, S, mumlar, evren, c0 }) {
  const { KalkanBot, donchianModelGetirisi } = require('../live/kalkanBot');
  const ctx = { evren };
  const uye = KalkanBot.prototype._uyeFn.call(ctx, S.U);
  const seg = KalkanBot.prototype._segmentBasiFn.call(ctx, S.U, (gn(D) + 1) * GUN + 15 * 60e3);
  const tD = gn(D) * GUN;
  // Donchian: uygunlar, 1/N uygunlar üzerinden (kalkanBot donU)
  const donKes = new Map();
  for (const s of S.uygun) { const m = mumlar.get(s); if (m) { const x = kes(m, D); if (x.length) donKes.set(s, x); } }
  let rDon = 0, donSayi = 0;
  if (donKes.size) {
    const uyeS = (s, t) => S.uygun.includes(s) && uye(s, t);
    const mD = donchianModelGetirisi(donKes, uyeS, {});
    if (!mD.gunler.length || mD.gunler[mD.gunler.length - 1] !== tD) return { bekle: `uygun sembollerde ${D} mumu yok` };
    rDon = mD.getiri[mD.getiri.length - 1];
    donSayi = [...donKes.keys()].filter(s => uyeS(s, tD)).length;
  }
  // DCA: merdiveni seçilmiş uygunlar, eşit ortalama
  const l = [];
  for (const [s, n] of Object.entries(S.n)) {
    if (!uye(s, tD)) continue;
    const m = mumlar.get(s); if (!m) continue;
    const r = dcaSGetiri(kes(m, D), n, seg(s), D);
    if (Number.isFinite(r)) l.push(r);
  }
  const rDca = l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0;
  const w = c0.kol || {};
  const wDon = Number.isFinite(w.agirlikDon) ? w.agirlikDon : 0.5, wDca = Number.isFinite(w.agirlikDca) ? w.agirlikDca : 0.5;
  return { kolS: KOL_M * (wDon * rDon + wDca * rDca), rDon, rDca, wDon, wDca, donSayi, dcaSayi: l.length };
}

/** Saf: C0 satırından BTC ayağı. */
const btcAyagi = (c0) => c0.hucum.C0 - c0.kol.getiri;

function maxDD(E) { let tepe = -Infinity, m = 0; for (const e of E) { if (e > tepe) tepe = e; m = Math.max(m, 1 - e / tepe); } return m; }
const zincir = (l) => { const o = [1]; for (const r of l) o.push(o[o.length - 1] * (1 + r)); return o; };

/**
 * Saf: ölçüm — Kairos-S, Kairos C0, BTC al-tut yan yana (aynı günler). `gunler` = gün satırları (eksik satırlar ayrı sayılır).
 * → { gun, eksik, ilk, son, hs: { toplam, mdd }, c0: {…}, btc: {…}, seri: [{ gun, hs, c0, btc }] }
 */
function olc(gunler, { kadar = null, eksikler = [] } = {}) {
  const l = gunler.filter(x => !kadar || x.gun <= kadar).slice().sort((a, b) => (a.gun < b.gun ? -1 : 1));
  const E1 = zincir(l.map(x => x.r)), E2 = zincir(l.map(x => x.c0)), E3 = zincir(l.map(x => x.btc));
  const son = (E) => E[E.length - 1] - 1;
  return { gun: l.length, eksik: eksikler.filter(g => !kadar || g <= kadar).length, ilk: l.length ? l[0].gun : null, son: l.length ? l[l.length - 1].gun : null,
    hs: { toplam: son(E1), mdd: maxDD(E1) }, c0: { toplam: son(E2), mdd: maxDD(E2) }, btc: { toplam: son(E3), mdd: maxDD(E3) },
    seri: l.map((x, i) => ({ gun: x.gun, hs: E1[i + 1], c0: E2[i + 1], btc: E3[i + 1] })) };
}

/** Saf: anlık durum (861 A): gölge MaxDD ↔ en yakın ufkun p95 / p99 (hucumS bantları; C0'a uygulanan tutucu gösterim ayrıca). */
function anlikDurum(o) {
  if (!o.gun) return { durum: 'yetersiz', metin: 'henüz gölge günü yok' };
  const hs = HD.modelDurumu('hucumS', o.gun, o.hs.mdd);
  const c0 = HD.modelDurumu('hucumS', o.gun, o.c0.mdd);
  const sira = { normal: 0, uyari: 1, DUR: 2 };
  const birlesik = sira[hs.durum] >= sira[c0.durum] ? hs.durum : c0.durum;
  return { durum: birlesik, hs, c0, not: 'Kairos-S gerçek parada çalışıyorsa ikisinden biri DUR → DUR (861 §Gölge, tutucu).' };
}

/**
 * Saf: kontrol noktaları (861 A — önceden yazılmış): ufuk günü dolunca ilk `ufuk` gün üzerinden; tutarlı ⇔ getiri ≥ p5 VE MaxDD ≤ p95.
 * Eksik gün varsa 'yetersiz' (kalıcı boşluk) ya da 'bekliyor' (veri gelmedi). 365. günde BTC al-tut kıyası (bilgi).
 */
function kontroller(gunler, { bugun, eksikler = [] }) {
  return KONTROL.map(({ ufuk, tarih }) => {
    const d = HD.DAGILIM.hucumS[ufuk];
    const esik = { p5: d.getiri.p5, p95: d.maxdd.p95, p99: d.maxdd.p99 };
    if (bugun < tarih) return { ufuk, tarih, durum: 'bekliyor', ...esik };
    const son = gunEkle(tarih, -1);
    const o = olc(gunler, { kadar: son, eksikler });
    if (o.gun + o.eksik < ufuk) return { ufuk, tarih, durum: 'bekliyor', gun: o.gun, ...esik, metin: `veri ${o.gun}/${ufuk} gün — tamamlanınca değerlendirilir` };
    if (o.eksik) return { ufuk, tarih, durum: 'yetersiz', gun: o.gun, eksik: o.eksik, ...esik, metin: `${o.eksik} gün kalıcı eksik — kontrol yapılamadı` };
    const tutarli = o.hs.toplam >= esik.p5 && o.hs.mdd <= esik.p95;
    return { ufuk, tarih, durum: tutarli ? 'tutarli' : 'uyari', gun: o.gun, getiri: o.hs.toplam, mdd: o.hs.mdd, ...esik,
      c0: { getiri: o.c0.toplam, mdd: o.c0.mdd }, btc: ufuk === 365 ? { getiri: o.btc.toplam, mdd: o.btc.mdd } : undefined,
      metin: tutarli ? 'tutarlı (getiri ≥ p5, en derin düşüş ≤ p95)' : 'uyarı — neden analizi, kural DEĞİŞMEZ' };
  });
}

function araRapor(gunler, { bugun, eksikler = [] }) {
  const o = olc(gunler, { eksikler });
  const k = kontroller(gunler, { bugun, eksikler });
  const sonraki = k.find(x => x.durum === 'bekliyor') || null;
  return { deneme: DENEME, esikDeneme: ESIK_DENEME, plan: PLAN, baslangic: BAS, onKayit: ON_KAYIT, kapi: KAPI, sermaye: SERMAYE, ...o,
    anlik: anlikDurum(o), kontrol: k, sonraki: sonraki ? { ufuk: sonraki.ufuk, tarih: sonraki.tarih } : null,
    bantlar: HD.UFUKLAR.map(u => ({ ufuk: u, ...HD.DAGILIM.hucumS[u] })), not: 'Ara rapor — hüküm değil.' };
}

/* ═══════════ ÇALIŞTIR ═══════════ */
/**
 * @param o.ag { hazirla(), pazar(s), mumlar(s, basMs, simdi) } (test için sahte) · o.evren { ayEvreni(t), sabitMi(), semboller() }
 */
async function calistir({ simdi = Date.now(), dizin = I.VARSAYILAN_DIZIN, ag = null, evren = null, log = () => {}, sonAn = Infinity, bas = BAS } = {}) {
  const F = dosyalar(dizin);
  return I.kilitle(dizin, async () => {
    const t0 = Date.now();
    const zaman = new Date(simdi).toISOString();
    const bugun = gs(Math.floor(simdi / GUN));
    const Y = gs(Math.floor((simdi - 15 * 60e3) / GUN) - 1);     // son kapanmış gün
    const eksik = [], notlar = [], degisen = [];
    const kayit0 = I.satirlariOku(F.kayit);
    const AY = new Map(kayit0.filter(x => x.tur === 'ay').map(x => [x.ay, x]));
    const GK = new Map(kayit0.filter(x => x.tur === 'gun').map(x => [x.gun, x]));
    const EK = new Map(kayit0.filter(x => x.tur === 'eksik').map(x => [x.gun, x]));
    const KK = new Set(kayit0.filter(x => x.tur === 'kontrol').map(x => x.ufuk));
    const DK = new Set(kayit0.filter(x => x.tur === 'durum').map(x => x.durum));
    const C0 = new Map(I.satirlariOku(F.golge).filter(x => x.hucum && Number.isFinite(x.hucum.C0) && x.kol && Number.isFinite(x.kol.getiri)).map(x => [x.gun, x]));
    // Hesaplanacak günler: bas → Y; kayıtlı olmayanlar + son DOGRULA kayıtlı gün
    const tum = []; for (let g = gn(bas); g <= gn(Y); g++) tum.push(gs(g));
    const kayitli = tum.filter(d => GK.has(d));
    const dogrula = new Set(kayitli.slice(-DOGRULA));
    const hedef = tum.filter(d => (!GK.has(d) && !EK.has(d)) || dogrula.has(d));
    let ev = evren;
    if (!ev) { const { Evren } = require('../live/evren'); ev = new Evren({ dizin: F.kol, k: 15 }); }   // YALNIZ OKUNUR (guncelle çağrılmaz)
    const yeni = [];
    let mumlar = new Map(), agHazir = false;
    const A = ag || (hedef.length ? gercekAg() : null);
    const kaynak = { pazar: null, mum: { istenen: 0, alinan: 0, hata: [] } };
    // Gün sırası: ilk hesaplanamayan günde durulur (birikimli F'nin doğru kalması için) — doğrulama günleri hariç
    const sirali = hedef.slice().sort();
    let dur = null;
    for (const D of sirali) {
      if (dur) break;
      if (Date.now() > sonAn) { eksik.push({ seri: 'hucum-s:sure', neden: 'süre bütçesi doldu — kalan günler sonraki çalışmada' }); break; }
      const c0 = C0.get(D);
      if (!c0) {
        const sonC0 = [...C0.keys()].sort().pop();
        if (!GK.has(D) && sonC0 && sonC0 > D && gn(bugun) - gn(D) > KALICI_BOSLUK_GUN) {
          const x = { tur: 'eksik', gun: D, neden: `Kairos simülasyon satırı ${KALICI_BOSLUK_GUN} günden eski ve yok — kalıcı boşluk`, kayitZamani: zaman };
          yeni.push(x); EK.set(D, x); continue;
        }
        eksik.push({ seri: 'hucum-s:kairos', neden: `${D} Kairos simülasyon satırı yok (bindirme-golge.jsonl) — yetersiz, sonraki çalışmada` });
        dur = D; break;
      }
      const Ums = gn(D) * GUN;
      const U = ev.ayEvreni(Ums) || (ev.sabitMi && ev.sabitMi() ? ev.semboller() : null);
      if (!U || !U.length) { eksik.push({ seri: 'hucum-s:evren', neden: `${ayEt(D)} evren kaydı yok (data/ileri/kol/evren.json) — yetersiz` }); dur = D; break; }
      if (!agHazir) {
        try { await A.hazirla(); kaynak.pazar = 'ok'; } catch (e) { kaynak.pazar = `hata: ${e.message}`; eksik.push({ seri: 'hucum-s:pazar', neden: e.message }); dur = D; break; }
        agHazir = true;
      }
      // mumlar: bu güne kadar gereken semboller (ay evreni + önceki ay evreni — segment ve önceki ay kapanışı için)
      const gerek = [...new Set([...U, ...(ev.ayEvreni(ayBasiMs(D) - GUN) || [])])].filter(s => A.pazar(s) || mumlar.has(s));
      for (const s of gerek) {
        if (mumlar.has(s)) continue;                                    // çalışma başına bir kez indirilir
        kaynak.mum.istenen++;
        try { const x = await A.mumlar(s, (gn(bas) - MUM_GUN - 40) * GUN, simdi); mumlar.set(s, x); kaynak.mum.alinan++; }
        catch (e) { kaynak.mum.hata.push(`${s}: ${e.message}`); const x = []; x.yok = true; mumlar.set(s, x); }
      }
      // evrendeki bir sembolün mumu OKUNAMADIYSA (ağ hatası) gün eksik veriyle hesaplanmaz — yetersiz, sonraki çalışmada
      const okunamayan = U.filter(s => mumlar.has(s) && mumlar.get(s).yok);
      if (okunamayan.length) { eksik.push({ seri: 'hucum-s:mum', neden: `${D}: ${okunamayan.map(s => s.split('/')[0]).join(', ')} mumu okunamadı — yetersiz` }); dur = D; break; }
      // ayın S durumu (kayıttaysa aynen)
      const ay = ayEt(D);
      let S = AY.get(ay);
      if (!S) {
        if (ay !== ayEt(bas) && D !== `${ay}-01`) notlar.push(`${ay} S durumu ayın ilk günü değil ${D} gününde kuruldu (o güne kadar veri yoktu; canlı bot da ayın ilk çalışmasında kurar)`);
        const once = [...GK.values()].filter(x => x.gun < `${ay}-01` && x.gun >= bas).sort((a, b) => (a.gun < b.gun ? -1 : 1));
        const Fm = SERMAYE * once.reduce((e, x) => e * (1 + x.r), 1);
        const s0 = ayDurumu({ U, mumlar, pazar: (s) => A.pazar(s), F: Fm, wDca: c0.kol.agirlikDca ?? 0.5, ay });
        S = { tur: 'ay', ...s0, kaynakGun: D, kayitZamani: zaman };
        S.imza = sha([S.ay, S.F, S.L, S.uygun, S.n]);
        yeni.push(S); AY.set(ay, S);
        log('INFO', `Kairos-S gölgesi ${ay}: F ${S.F.toFixed(0)} → L ${S.L ?? 'yok'} · uygun ${S.uygun.length}/${S.U.length} · DCA n ${Object.entries(S.n).map(([s, k]) => `${s.split('/')[0]} ${k}`).join(', ') || '—'}`);
      }
      const k = kolSGunu({ D, S, mumlar, evren: ev, c0 });
      if (k.bekle) { eksik.push({ seri: 'hucum-s:mum', neden: `${D}: ${k.bekle}` }); dur = D; break; }
      const btcA = btcAyagi(c0);
      const x = { gun: D, r: yuv(btcA + k.kolS), kolS: yuv(k.kolS), rDon: yuv(k.rDon), rDca: yuv(k.rDca), wDon: yuv(k.wDon), wDca: yuv(k.wDca),
        btcAyak: yuv(btcA), c0: yuv(c0.hucum.C0), btc: yuv(c0.btcGetiri), karar: c0.kararlar ? c0.kararlar.C0 : null, donSayi: k.donSayi, dcaSayi: k.dcaSayi };
      x.imza = sha([x.gun, x.r, x.kolS, x.c0]);
      const e = GK.get(D);
      if (e) { if (e.imza !== x.imza) degisen.push({ gun: D, kayit: e.r, yeniden: x.r }); continue; }
      const sat = { tur: 'gun', ...x, kayitZamani: zaman, gecikmeli: gn(Y) > gn(D), geriDoldurma: D < ON_KAYIT };
      yeni.push(sat); GK.set(D, sat);
    }
    const gunler = [...GK.values()].sort((a, b) => (a.gun < b.gun ? -1 : 1));
    const eksikler = [...EK.keys()];
    const rapor = araRapor(gunler, { bugun, eksikler });
    // kontrol satırları (yalnız değerlendirilebilenler, bir kez) + durum olayları (uyarı / DUR ilk kez)
    for (const kx of rapor.kontrol) if ((kx.durum === 'tutarli' || kx.durum === 'uyari' || kx.durum === 'yetersiz') && !KK.has(kx.ufuk)) { yeni.push({ tur: 'kontrol', ...kx, kayitZamani: zaman }); KK.add(kx.ufuk); }
    const an = rapor.anlik;
    for (const d of ['uyari', 'DUR']) {
      const hs = an.hs && an.hs.durum, c = an.c0 && an.c0.durum;
      const kim = hs === d || (d === 'uyari' && hs === 'DUR') ? 'hucumS' : (c === d || (d === 'uyari' && c === 'DUR')) ? 'c0' : null;
      if (kim && !DK.has(d)) { yeni.push({ tur: 'durum', durum: d, kaynak: kim, gun: rapor.son, mdd: kim === 'hucumS' ? rapor.hs.mdd : rapor.c0.mdd, kayitZamani: zaman }); DK.add(d); log(d === 'DUR' ? 'ERROR' : 'WARN', `Kairos-S gölgesi: ${d === 'DUR' ? 'DUR' : 'uyarı'} eşiği aşıldı (${kim === 'hucumS' ? 'Kairos-S gölgesi' : 'Kairos simülasyonu'})`); }
    }
    I.ekle(F.kayit, yeni);
    const sonAy = [...AY.values()].sort((a, b) => (a.ay < b.ay ? -1 : 1)).pop() || null;
    const ozet = { zaman, deneme: DENEME, plan: PLAN, sureMs: Date.now() - t0, sonKapanmis: Y, yeniSatir: yeni.length,
      takvim: { bas, onKayit: ON_KAYIT, kapi: KAPI, kontrol: KONTROL },
      rapor: { ...rapor, seri: rapor.seri.slice(-400) },
      ay: sonAy ? { ay: sonAy.ay, F: sonAy.F, L: sonAy.L, uygun: sonAy.uygun, disarida: sonAy.disarida, n: sonAy.n, U: sonAy.U.length } : null,
      kaynak, eksik, notlar, degisen };
    yazJ(F.son, ozet);
    if (degisen.length) log('WARN', `Kairos-S gölgesi: ${degisen.length} kayıtlı günün yeniden hesabı farklı — kayıt DEĞİŞMEDİ`);
    return ozet;
  });
}

/** GET /api/ileri/hucum-s: yalnız son.json (ağ yok, yazmaz). `ILERI_GOLGE_DIZIN` yalnız kılavuz ekran görüntüleri içindir. */
function panelVerisi({ dizin = process.env.ILERI_GOLGE_DIZIN || I.VARSAYILAN_DIZIN } = {}) {
  const s = okuJ(dosyalar(dizin).son);
  return { success: true, ozet: s, takvim: { bas: BAS, onKayit: ON_KAYIT, kapi: KAPI, kontrol: KONTROL }, deneme: DENEME, esikDeneme: ESIK_DENEME, plan: PLAN,
    sermaye: SERMAYE, bantlar: HD.UFUKLAR.map(u => ({ ufuk: u, ...HD.DAGILIM.hucumS[u] })) };
}

module.exports = {
  DENEME, ESIK_DENEME, PLAN, BAS, ON_KAYIT, KAPI, KONTROL, SERMAYE, KOL_M, MUM_GUN, DOGRULA,
  gn, gs, gunEkle, dosyalar, gercekAg, ayDurumu, dcaSGetiri, kolSGunu, btcAyagi, olc, anlikDurum, kontroller, araRapor, calistir, panelVerisi, maxDD,
};
