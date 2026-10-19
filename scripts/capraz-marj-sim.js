#!/usr/bin/env node
/**
 * ÇAPRAZ MARJ ENTEGRE SİMÜLASYONU — PLAN-CAPRAZ-MARJ.md (kriter ölçümden önce yazıldı).
 *   node scripts/capraz-marj-sim.js
 *
 * Alfa kolu (Donchian PIT + DCA PIT, ters-vol 60 g) POZİSYON düzeyinde yeniden kurulur
 * ve tek bir vadeli ÇAPRAZ marj hesabında m kat büyüklükle yürütülür: kötümser gün içi
 * değerleme (long'lar LOW, short'lar HIGH, aynı anda), kademeli bakım marjı, hesap
 * tasfiyesi, gerçek funding, el değiştiren nominal üzerinden maliyet, başlangıç marjı
 * ve DCA merdiveni sığma kontrolü. A Atak'ın spot BTC ayağı ayrı spot hesapta.
 *
 * Ortam değişkenleri:
 *   SERMAYE=100000     başlangıç sermayesi ($; kademeler mutlak nominale bağlı)
 *   KADEME=sinif|yedek|kotumser   bakım marjı tablosu (varsayılan sinif)
 *   BANT=0.10          bileşen başı hedef sapma bandı (yeniden ölçekleme)
 *   ONBELLEK=1         bileşen çıkarımını data/arastirma/capraz-marj-onbellek.json'dan oku/yaz
 *   POZ_YAZ=1          kolun günlük pozisyon tablosunu data/arastirma/kol-pozisyonlari.json'a yaz
 *   DUYARLILIK=1       sermaye ve kademe duyarlılık tablosunu da çalıştır
 *
 * Bölüm A/B/C kuralları scripts/hayatta-kalma.js ile BİREBİR aynıdır (kopya; o dosya
 * dışa aktarım yapmadığı ve tüm ölçümü yan etkiyle çalıştırdığı için içe alınamaz).
 * Mutabakat: yeniden kurulan kol getirisi data/arastirma/alfa-kolu.json ile gün gün
 * karşılaştırılır.
 */
const path = require('path');
const yollar = require('../lib/yollar');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const D = require(path.join(ROOT, 'lib', 'strategies', 'donchianEnsemble'));
const B = require(path.join(ROOT, 'lib', 'backtester'));
const V = require(path.join(ROOT, 'lib', 'research', 'pitVeri'));
const S = require(path.join(ROOT, 'lib', 'research', 'portfoySim'));
const VEN = require(path.join(ROOT, 'lib', 'venues'));
const AK = require('./altut-yenmek-kararlar');

// EVREN_K / EVREN_HARIC / EVREN_MIN_YAS (PLAN-KOL-BILESIM.md) — hayatta-kalma.js ile aynı anlam; varsayılan ilk 15.
// GOMLEK_BAS (ISO tarih, PLAN-GOMLEK G2): kol başlangıcı; varsayılan 2020-09-03.
const GUN = 864e5, BAS = process.env.GOMLEK_BAS ? Date.parse(process.env.GOMLEK_BAS + 'T00:00:00Z') : Date.UTC(2020, 8, 3), K = Number(process.env.EVREN_K) || 15, HOL = Date.UTC(2024, 0, 1);
const EVREN_HARIC = new Set((process.env.EVREN_HARIC || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean));
const EVREN_MIN_YAS = Number(process.env.EVREN_MIN_YAS) || 0;
const TAKER = 0.0005, KAYMA = 0.0002, TAVAN = 2, MALIYET = TAKER + KAYMA;
const SPOT_MALIYET = 0.001 + 0.0002, TASFIYE_UCRETI = 0.0125;
const DCA_OLCEK = 2.94, DCA_KALDIRAC = 1;
const BTC = 'BTC/USDT:USDT';
const SERMAYE = Number(process.env.SERMAYE) || 100000;
const KADEME = process.env.KADEME || 'sinif';
const BANT = process.env.BANT != null ? Number(process.env.BANT) : 0.10;
// GIRIS_YASAK=<json>: { "SEMBOL/USDT:USDT": [gün ms, ...] } — o KARAR gününde o coine YENİ giriş yok
// (Donchian: düzken hedef 0 kalır; DCA: yeni merdiven kurulmaz). Açık pozisyon/çıkış normal. PLAN-PUMP-FAZ1.md.
const YASAK = process.env.GIRIS_YASAK
  ? new Map(Object.entries(JSON.parse(fs.readFileSync(process.env.GIRIS_YASAK, 'utf8'))).map(([s, l]) => [s, new Set(l)]))
  : null;
const yasakMi = (s, t) => !!YASAK && YASAK.has(s) && YASAK.get(s).has(Math.floor(t / 864e5) * 864e5);
const yasakSay = { donchian: 0, dca: 0 };
const yz = (x, b = 1) => (x == null || !Number.isFinite(x) ? '—' : `%${(x * 100).toFixed(b)}`);
const tarih = (t) => new Date(t).toISOString().slice(0, 10);

// ═══════════════════════════════════════════════════════════════════════════
// 1. BİLEŞENLER (hayatta-kalma.js A/B/C kopyası + pozisyon kaydı)
// ═══════════════════════════════════════════════════════════════════════════
const { seri } = V.yukle();   // sembol → { m, indeks, fon(gün → oran toplamı) }

function evrenKur() {
  const aylar = [];
  for (let d = new Date(BAS); d.getTime() < Date.now(); d.setUTCMonth(d.getUTCMonth() + 1)) aylar.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const evren = new Map();
  for (const ay of aylar) {
    const puan = [];
    for (const [s, { m, indeks }] of seri) {
      const son = indeks.get(ay - GUN);
      if (son == null || son < 29) continue;
      if (EVREN_HARIC.size && EVREN_HARIC.has(s.split('/')[0])) continue;
      let t = 0; for (let j = son - 29; j <= son; j++) t += m[j].volume * m[j].close;
      puan.push([s, t / 30]);
    }
    puan.sort((a, b) => b[1] - a[1]);
    let sec = puan.slice(0, K).map(x => x[0]);
    if (EVREN_MIN_YAS) sec = sec.filter(s => ay - seri.get(s).m[0].time >= EVREN_MIN_YAS * GUN);
    evren.set(ay, new Set(sec));
  }
  return { aylar, evren };
}

function hazirla(s) {
  const { m, fon } = seri.get(s);
  const kap = m.map(x => x.close);
  const a = D.ayarKur(); let durum = D.yeniDurum(), onceki = 0;
  const gunler = new Map();
  for (let t = 0; t < m.length; t++) {
    const r = D.adim(durum, kap.slice(Math.max(0, t - 400), t + 1), undefined);
    durum = r.durum;
    if (!r.isiniyor) {
      const vol = D.yillikVol(kap.slice(Math.max(0, t - 40), t + 1), a.volPencere, a.yillikGun);
      const ham = Math.min(a.kaldiracTavani, vol > 0 ? a.hedefVol / vol : 0);
      onceki = (Math.abs(ham - onceki) >= a.esik || onceki === 0) ? ham : onceki;
    }
    gunler.set(m[t].time, { open: m[t].open, close: m[t].close, hedef: r.maruziyet, funding: fon.get(m[t].time) || 0, hazir: !r.isiniyor, son: t === m.length - 1 });
  }
  return { sembol: s, gunler };
}

/** hayatta-kalma.js simulePIT('hedef') + olay kaydı (açılış işlemleri, delist kapanışları). */
function donchianPIT(varliklar, uygunMu) {
  const tarihler = [...new Set(varliklar.flatMap(v => [...v.gunler.keys()]))].filter(t => t >= BAS - GUN).sort((a, b) => a - b);
  let nakit = 1; const birim = new Map(), sonHedef = new Map(), sonFiyat = new Map();
  for (const v of varliklar) { birim.set(v.sembol, 0); sonHedef.set(v.sembol, 0); }
  let bekleyen = null;
  const egri = new Map();            // t → özsermaye (kapanış)
  const olaylar = new Map();         // t → [{ s, dq, fiyat }]
  const ekle = (t, o) => { if (!olaylar.has(t)) olaylar.set(t, []); olaylar.get(t).push(o); };
  const isle = (t, v, fiyatAcik, h, oz) => {
    const istenen = h * oz / fiyatAcik, fark = istenen - birim.get(v.sembol);
    if (Math.abs(fark) * fiyatAcik < 1e-12) { sonHedef.set(v.sembol, h); return; }
    const fiyat = fark > 0 ? fiyatAcik * (1 + KAYMA) : fiyatAcik * (1 - KAYMA);
    const u = Math.abs(fark) * fiyat * TAKER;
    nakit -= fark * fiyat + u; birim.set(v.sembol, istenen); sonHedef.set(v.sembol, h);
    ekle(t, { s: v.sembol, dq: fark, fiyat: fiyatAcik });
  };
  for (const t of tarihler) {
    for (const v of varliklar) {
      if (birim.get(v.sembol) !== 0 && !v.gunler.has(t)) {
        const f = sonFiyat.get(v.sembol); const q = birim.get(v.sembol);
        nakit += q * f * (1 - Math.sign(q) * KAYMA) - Math.abs(q) * f * TAKER;
        ekle(t, { s: v.sembol, dq: -q, fiyat: f, delist: true });
        birim.set(v.sembol, 0); sonHedef.set(v.sembol, 0);
      }
    }
    if (bekleyen) {
      let oz = nakit; for (const v of varliklar) { const g = v.gunler.get(t); if (g) oz += birim.get(v.sembol) * g.open; }
      for (const v of varliklar) { const g = v.gunler.get(t); if (!g) continue; const h = bekleyen.get(v.sembol) || 0; if (h !== sonHedef.get(v.sembol)) isle(t, v, g.open, h, oz); }
    }
    for (const v of varliklar) { const g = v.gunler.get(t); const q = birim.get(v.sembol); if (g && q && g.funding) nakit -= q * g.close * g.funding; if (g) sonFiyat.set(v.sembol, g.close); }
    const hazirlar = varliklar.filter(v => { const g = v.gunler.get(t); return g && g.hazir && uygunMu(v.sembol, t + GUN) && !g.son; });
    const karar = new Map();
    if (hazirlar.length) {
      const w = 1 / hazirlar.length; let top = 0;
      for (const v of hazirlar) { const h = v.gunler.get(t).hedef * w; karar.set(v.sembol, h); top += Math.abs(h); }
      if (top > TAVAN) for (const [k, h] of karar) karar.set(k, h * TAVAN / top);
    }
    for (const v of varliklar) if (!karar.has(v.sembol)) karar.set(v.sembol, 0);
    if (YASAK) for (const [s, h] of karar) if (h !== 0 && sonHedef.get(s) === 0 && birim.get(s) === 0 && yasakMi(s, t)) { karar.set(s, 0); yasakSay.donchian++; }
    bekleyen = karar;
    if (t >= BAS) { let oz = nakit; for (const v of varliklar) { const g = v.gunler.get(t); oz += birim.get(v.sembol) * (g ? g.close : (sonFiyat.get(v.sembol) || 0)); } egri.set(t, oz); }
  }
  return { egri, olaylar };
}

const DCA_AYAR = { baseOrder: 100 * DCA_OLCEK, safeOrder: 140 * DCA_OLCEK, maxSafeOrder: 6, volScale: 1.5 };
const SO_TUTAR = Array.from({ length: DCA_AYAR.maxSafeOrder }, (_, i) => DCA_AYAR.safeOrder * Math.pow(DCA_AYAR.volScale, i));

/** hayatta-kalma.js dcaSegment + dolum olayları ve açık deal'in kalan merdiveni. */
function dcaSegment(s, bas, bit) {
  const { m } = seri.get(s);
  const fon = fonHam(s);   // ham 8 saatlik funding — motor böyle alıyor
  const i0 = m.findIndex(x => x.time >= bas); if (i0 < 0) return null;
  let i1 = m.findIndex(x => x.time >= bit); if (i1 < 0) i1 = m.length;
  const onek = Math.min(i0, 60);
  const dilim = m.slice(i0 - onek, i1);
  if (dilim.length - onek < 5 || dilim.length < 35) return null;
  const ayar = { marketType: 'perpetual', leverage: DCA_KALDIRAC, contractSpecs: { taker: 0.0005, maker: 0.0002 }, fundingSeries: fon, baseOrder: DCA_AYAR.baseOrder, safeOrder: DCA_AYAR.safeOrder };
  const r = B.run('dca_bot', ayar, dilim, 10000, '1d', { trace: false, girisBasi: Math.max(30, onek), ...(YASAK ? { girisYasak: (i) => yasakMi(s, dilim[i].time) } : {}) });
  if (YASAK) yasakSay.dca += r.girisYasakEngeli || 0;
  const g = new Map(), oz = new Map();
  let once = null;
  for (const p of r.equityCurve) {
    const t = Math.floor(Date.parse(p.time) / GUN) * GUN;
    oz.set(t, p.value);
    if (t >= bas) { if (once != null) { if (p.value <= 0) { g.set(t, -1); break; } g.set(t, p.value / once - 1); } once = p.value; } else once = p.value;
  }
  // Olaylar (deal kaydından; metin ayrıştırılmaz): t → [{dq, fiyat}]; merdiven: t → kalan SO $.
  const olaylar = new Map(), dealler = [];
  const ekle = (t, o) => { if (!olaylar.has(t)) olaylar.set(t, []); olaylar.get(t).push(o); };
  for (const d of r.deals || []) {
    const gir = d.girisler.map(x => ({ t: Math.floor(Date.parse(x.zaman) / GUN) * GUN, q: x.miktar, f: x.fiyat }));
    const cik = (d.cikislar || []).map(x => ({ t: Math.floor(Date.parse(x.zaman) / GUN) * GUN, q: x.miktar, f: x.fiyat }));
    for (const x of gir) ekle(x.t, { dq: x.q, fiyat: x.f, dolum: true });
    for (const x of cik) ekle(x.t, { dq: -x.q, fiyat: x.f });
    dealler.push({ bas: gir[0].t, bit: d.acikKaldi ? Infinity : Math.max(...cik.map(x => x.t)), girisZamanlari: gir.map(x => x.t) });
  }
  return { s, bas, bit, g, oz, olaylar, dealler, lik: r.liquidations || 0, dolum: r.orderBook ? r.orderBook.dolum : 0, yetmeyen: r.orderBook ? r.orderBook.sermayeYetmeyen : 0 };
}
let _fonDb = null;
function fonHam(s) {
  // FUNDING_SABIT (PLAN-GOMLEK G2): tanımlıysa her bar günü için 00/08/16 UTC'de sabit oran (DB okunmaz).
  if (process.env.FUNDING_SABIT != null && process.env.FUNDING_SABIT !== '') {
    const r = Number(process.env.FUNDING_SABIT);
    return seri.get(s).m.flatMap(x => [0, 8, 16].map(h => ({ time: Math.floor(x.time / GUN) * GUN + h * 36e5, rate: r })));
  }
  // MARKET_DB: veritabanı yolu (varsayılan data/market.db).
  // VERI_KESIM / VERI_BOZ (PLAN-COKLU-TABAN): tanımlıysa funding pitVeri.fonSorgu ile (SQL'de time < kesim; BOZ sentetik). Tanımsızken eski sorgu.
  if (!_fonDb) { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.env.MARKET_DB ? yollar.goreli(process.env.MARKET_DB) : yollar.veri('market.db'), { readOnly: true }); _fonDb = V.kesimMs() == null && V.bozMs() == null ? db.prepare(`SELECT time, rate FROM funding WHERE venue='binance' AND market='perp' AND symbol=? ORDER BY time`) : V.fonSorgu(db); }
  return _fonDb.all(s).map(f => ({ time: f.time, rate: f.rate }));
}

function bilesenleriKur() {
  const t0 = Date.now();
  const { aylar, evren } = evrenKur();
  const ayBasi = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
  const herEvren = new Set([...evren.values()].flatMap(s => [...s]));
  const varliklar = [...herEvren].map(hazirla);
  const pit = (s, t) => { const e = evren.get(ayBasi(t)); return !!e && e.has(s); };
  const don = donchianPIT(varliklar, pit);
  console.log(`  Donchian PIT hazır (${herEvren.size} sembol, ${((Date.now() - t0) / 1000).toFixed(0)} sn)`);
  const segler = [];
  for (const s of herEvren) {
    let bas = null;
    for (let i = 0; i <= aylar.length; i++) {
      const icinde = i < aylar.length && evren.get(aylar[i]).has(s);
      if (icinde && bas == null) bas = aylar[i];
      if (!icinde && bas != null) { const g = dcaSegment(s, bas, i < aylar.length ? aylar[i] : Date.now()); if (g) segler.push(g); bas = null; }
    }
  }
  console.log(`  DCA PIT hazır (${segler.length} segment, ${((Date.now() - t0) / 1000).toFixed(0)} sn)`);
  if (YASAK) console.log(`  GİRİŞ YASAĞI uygulandı: Donchian ${yasakSay.donchian} karar · DCA ${yasakSay.dca} merdiven`);
  return { don, segler };
}

// Önbellek (Map'ler diziye çevrilir).
// ONBELLEK_DOSYA: önbellek adı (data/arastirma/ altında) — varsayılan eski ad.
const ONB = yollar.veri('arastirma', process.env.ONBELLEK_DOSYA || 'capraz-marj-onbellek.json');
function yukleVeyaKur() {
  if (process.env.ONBELLEK && fs.existsSync(ONB)) {
    const j = JSON.parse(fs.readFileSync(ONB, 'utf8'));
    const M = (a) => new Map(a);
    return { don: { egri: M(j.don.egri), olaylar: M(j.don.olaylar) }, segler: j.segler.map(x => ({ ...x, bit: x.bit, g: M(x.g), oz: M(x.oz), olaylar: M(x.olaylar), dealler: x.dealler.map(d => ({ ...d, bit: d.bit == null ? Infinity : d.bit })) })) };
  }
  const k = bilesenleriKur();
  if (process.env.ONBELLEK) {
    const A = (m) => [...m];
    fs.writeFileSync(ONB, JSON.stringify({ don: { egri: A(k.don.egri), olaylar: A(k.don.olaylar) }, segler: k.segler.map(x => ({ ...x, g: A(x.g), oz: A(x.oz), olaylar: A(x.olaylar), dealler: x.dealler.map(d => ({ ...d, bit: Number.isFinite(d.bit) ? d.bit : null })) })) }));
  }
  return k;
}

console.log('═'.repeat(110));
console.log(`  ÇAPRAZ MARJ ENTEGRE SİMÜLASYONU · sermaye ${SERMAYE.toLocaleString('tr-TR')} $ · kademe tablosu "${KADEME}" · bant %${(BANT * 100).toFixed(0)}`);
console.log('═'.repeat(110));
const { don, segler } = yukleVeyaKur();

// ── Bölüm C: ters-vol 60 g gecikmeli → bileşen ağırlıkları ─────────────────
const donT = [...don.egri.keys()].sort((a, b) => a - b);
const rD = new Map(); for (let i = 1; i < donT.length; i++) rD.set(donT[i], don.egri.get(donT[i]) / don.egri.get(donT[i - 1]) - 1);
const dcaGun = new Map();   // t → [segIdx]
segler.forEach((sg, i) => { for (const t of sg.g.keys()) { if (!dcaGun.has(t)) dcaGun.set(t, []); dcaGun.get(t).push(i); } });
const dcaR = new Map();
for (const [t, l] of dcaGun) if (t >= BAS) dcaR.set(t, l.reduce((a, i) => a + segler[i].g.get(t), 0) / l.length);
const ts = [...rD.keys()].filter(t => dcaR.has(t)).sort((a, b) => a - b);
const a = ts.map(t => rD.get(t)), b = ts.map(t => dcaR.get(t));
const sapma = (x) => { const o = x.reduce((p, q) => p + q, 0) / x.length; return Math.sqrt(x.reduce((p, q) => p + (q - o) ** 2, 0) / (x.length - 1)); };
const wD = ts.map((_, i) => { if (i < 61) return 0.5; const wa = 1 / (sapma(a.slice(i - 61, i - 1)) || 1e-6), wb = 1 / (sapma(b.slice(i - 61, i - 1)) || 1e-6); return wa / (wa + wb); });
const kolR = ts.map((_, i) => wD[i] * a[i] + (1 - wD[i]) * b[i]);

// Mutabakat 1: alfa-kolu.json
// KOL_DOSYA: mutabakat için kol serisi (varsayılan alfa-kolu.json).
// Dosya yoksa (PLAN-GOMLEK: başka veri/dönem) mutabakat ATLANIR; aşağıdaki doğrusal kıyaslar kurulan kolu kullanır.
const kolYol = yollar.veri('arastirma', process.env.KOL_DOSYA || 'alfa-kolu.json');
const kolVar = fs.existsSync(kolYol);
const kolDosya = kolVar ? JSON.parse(fs.readFileSync(kolYol, 'utf8')) : { gunler: ts, getiri: kolR };
const kolMap = new Map(kolDosya.gunler.map((t, i) => [t, kolDosya.getiri[i]]));
if (!kolVar) console.log(`  MUTABAKAT 1 — atlandı (${path.basename(kolYol)} yok)`);
else {
  let maxFark = 0, ortak = 0, gun = null;
  ts.forEach((t, i) => { if (kolMap.has(t)) { ortak++; const f = Math.abs(kolMap.get(t) - kolR[i]); if (f > maxFark) { maxFark = f; gun = t; } } });
  console.log(`  MUTABAKAT 1 — yeniden kurulan kol vs alfa-kolu.json: ${ortak}/${kolDosya.gunler.length} ortak gün (bizde ${ts.length}), en büyük günlük fark ${(maxFark * 100).toFixed(5)} puan${gun ? ` (${tarih(gun)})` : ''}`);
}
const takvimSurekli = ts.every((t, i) => i === 0 || t - ts[i - 1] === GUN);
console.log(`  takvim ${tarih(ts[0])} → ${tarih(ts[ts.length - 1])}, ${ts.length} gün, ${takvimSurekli ? 'kesintisiz' : 'BOŞLUKLU'}`);
// SADECE_ONBELLEK=1: önbellek kurulup mutabakat 1 yazıldıktan sonra dur (PLAN-KOL-BILESIM.md).
if (process.env.SADECE_ONBELLEK) process.exit(0);

// ═══════════════════════════════════════════════════════════════════════════
// 2. BAKIM MARJI KADEMELERİ
// ═══════════════════════════════════════════════════════════════════════════
// Depoda gerçek Binance leverageBracket tablosu yok (API anahtarı ister — lib/venues.js
// başlığı). YAKLAŞIK, sınıf bazlı Binance benzeri tablolar (2024–25 kamuya açık
// kademelerin yuvarlanmış hali; kesin değildir):
const T = (rows) => rows.map(([cap, mmr, lev]) => ({ maxNotional: cap, maintenanceMarginRate: mmr, maxLeverage: lev }));
const SINIF = {
  major: T([[3e5, 0.004, 125], [8e5, 0.005, 100], [3e6, 0.0065, 75], [12e6, 0.01, 50], [70e6, 0.02, 25], [1e8, 0.025, 20], [2.3e8, 0.05, 10], [4.8e8, 0.1, 5], [6e8, 0.125, 4], [8e8, 0.15, 3], [1.2e9, 0.25, 2], [Infinity, 0.5, 1]]),
  buyukAlt: T([[1e4, 0.005, 75], [5e4, 0.01, 50], [2.5e5, 0.02, 25], [1e6, 0.025, 20], [2e6, 0.05, 10], [5e6, 0.1, 5], [1e7, 0.125, 4], [2e7, 0.15, 3], [5e7, 0.25, 2], [Infinity, 0.5, 1]]),
  alt: T([[5e3, 0.01, 50], [2.5e4, 0.02, 25], [1e5, 0.025, 20], [2.5e5, 0.05, 10], [1e6, 0.1, 5], [2.5e6, 0.125, 4], [5e6, 0.15, 3], [1e7, 0.25, 2], [Infinity, 0.5, 1]])
};
const BUYUK_ALT = new Set(['BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'LINK', 'LTC', 'DOT', 'AVAX', 'BCH', 'ETC', 'TRX', 'MATIC', 'ATOM', 'UNI', 'FIL', 'EOS', 'NEAR', 'XLM', 'SUI', 'AAVE', 'APT', 'ARB', 'OP']);
const KOTUMSER = SINIF.alt.map(t => ({ ...t, maintenanceMarginRate: Math.max(0.025, t.maintenanceMarginRate), maxLeverage: Math.min(20, t.maxLeverage) }));
function kademeler(s, tablo = KADEME) {
  if (tablo === 'yedek') return VEN.YEDEK_KADEMELER;
  if (tablo === 'kotumser') return KOTUMSER;
  const b = s.split('/')[0];
  if (b === 'BTC' || b === 'ETH') return SINIF.major;
  return BUYUK_ALT.has(b) ? SINIF.buyukAlt : SINIF.alt;
}
const MM = (s, N, tablo) => VEN.maintenanceMargin(kademeler(s, tablo), N);
const maxKal = (s, N, tablo) => VEN.tierFor(kademeler(s, tablo), N).maxLeverage;

// ═══════════════════════════════════════════════════════════════════════════
// 3. ENTEGRE SİMÜLASYON
// ═══════════════════════════════════════════════════════════════════════════
// K1 (spot BTC SMA100) durumu: t günü açık mı — t−1 kapanışı > SMA100(t−100..t−1).
const btcM = seri.get(BTC).m, k1Acik = new Map();
for (let i = 100; i < btcM.length; i++) { const s = btcM.slice(i - 100, i).reduce((x, y) => x + y.close, 0) / 100; k1Acik.set(btcM[i].time, btcM[i - 1].close > s); }
const bar = (s, t) => { const x = seri.get(s); const i = x.indeks.get(t); return i == null ? null : x.m[i]; };

/**
 * @param m kol çarpanı
 * @param yapi 'A' (S4: %50 spot BTC SMA100 + kol×m) | 'B' (yalnız kol×m)
 * @param denge 'aylik' | 'gunluk' (spot↔vadeli 50/50 yeniden dengeleme)
 */
function simule({ m, yapi = 'A', sermaye = SERMAYE, tablo = KADEME, denge = 'aylik', bant = BANT, maliyet = MALIYET, gunIciKontrol = true }) {
  const u = new Map();        // anahtar → hesap birimi ('D|sembol' ya da 'C|segIdx')
  const c = new Map();        // anahtar → bileşen birimi (bileşenin kendi ölçeğinde)
  const anahtarSembol = (k) => (k[0] === 'D' ? k.slice(2) : segler[Number(k.slice(2))].s);
  let nakit = yapi === 'A' ? sermaye : sermaye;   // vadeli hesap nakdi (gün başında aktarımla bölünür)
  let btc = 0, spotNakit = 0;                      // spot hesap
  let spotAcik = false;
  const sonKap = new Map();
  const egri = [], vadeliEgri = [];
  let oncekiT = sermaye, oncekiF = nakit;
  const st = { tasfiye: [], ucret: 0, fon: 0, spotUcret: 0, aktarim: 0, enDusukTampon: Infinity, tamponGun: null, tamponGunSonu: Infinity,
    enKotuGunIci: 0, enKotuGunIciT: null, enKotuGun: 0, enKotuGunT: null, imAsim: 0, sigmayanDolum: 0, merdivenSigmazGun: 0, dolum: 0,
    enBuyukNominalOran: 0, enBuyukNominalS: null, enBuyukNominalT: null, enBuyukNominal: 0, kalAsim: 0, bitti: false };
  const pozDegeri = (fiyatF) => { let v = 0; for (const [k, q] of u) if (q) v += q * fiyatF(anahtarSembol(k)); return v; };
  const netSembol = () => { const n = new Map(); for (const [k, q] of u) { if (!q) continue; const s = anahtarSembol(k); n.set(s, (n.get(s) || 0) + q); } return n; };
  const islem = (k, dq, fiyat) => { if (!dq) return; const n = Math.abs(dq) * fiyat; nakit -= dq * fiyat + n * maliyet; st.ucret += n * maliyet; u.set(k, (u.get(k) || 0) + dq); };
  // Kötümser değerleme: long LOW, short HIGH. Döner { E, MMtop, N, IM }.
  const kotumser = (nak, poz, t) => {
    let E = nak, mm = 0, N = 0, im = 0;
    for (const [s, q] of poz) {
      const b = bar(s, t); const f = b ? (q > 0 ? b.low : b.high) : sonKap.get(s);
      E += q * f; const n = Math.abs(q) * f; N += n; mm += MM(s, n, tablo); im += n / maxKal(s, n, tablo);
    }
    return { E, mm, N, im };
  };
  let ayOnce = null, tasfiyeErtesi = false;
  const dayBefore = ts[0] - GUN;
  for (const [s, x] of seri) { const i = x.indeks.get(dayBefore); if (i != null) sonKap.set(s, x.m[i].close); }

  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (st.bitti) break;
    // ── 0. Listeden çıkan sembol: son kapanıştan kapat ──
    for (const [k, q] of u) { if (q && !bar(anahtarSembol(k), t)) islem(k, -q, sonKap.get(anahtarSembol(k))); }
    // ── 1. Spot ↔ vadeli aktarım (açılışta) ──
    const btcB = bar(BTC, t);
    const F_acilis = nakit + pozDegeri(s => { const b = bar(s, t); return b ? b.open : sonKap.get(s); });
    let aktarim = 0;
    if (yapi === 'A') {
      const acik = !!k1Acik.get(t);
      const S_acilis = spotNakit + btc * btcB.open;
      const T0 = S_acilis + F_acilis;
      const ay = new Date(t).getUTCMonth();
      const dengele = acik !== spotAcik || (acik && (denge === 'gunluk' || ay !== ayOnce || tasfiyeErtesi)) || i === 0;
      if (dengele) {
        const hedefS = acik ? 0.5 * T0 : 0;
        const hedefBtc = hedefS / btcB.open;
        const dBtc = hedefBtc - btc;
        const sm = Math.abs(dBtc) * btcB.open * SPOT_MALIYET;
        // spot hesap: önce gerekli nakit vadeliden gelir (ya da satış nakdi vadeliye gider)
        const spotNakitSonra = S_acilis - hedefBtc * btcB.open - sm;   // spot hesapta kalan; vadeliye aktarılır
        aktarim = spotNakitSonra - spotNakit;                          // + : spottan vadeliye
        st.spotUcret += sm; btc = hedefBtc; spotNakit = 0; nakit += spotNakitSonra; // spot nakdi tamamen vadeliye
        if (Math.abs(dBtc) > 0) st.aktarim++;
        spotAcik = acik;
      }
      ayOnce = ay; tasfiyeErtesi = false;
    }
    // ── 2. Hedef ölçek ve açılış yeniden dengeleme ──
    const F_taban = oncekiF + aktarim;          // dünün kapanış özsermayesi + bugünkü aktarım
    const olcek = new Map();                    // anahtar → s_k
    const ED = don.egri.get(t - GUN);
    const dOlay = don.olaylar.get(t) || [];
    const dDegisen = new Set(dOlay.map(o => o.s));
    if (F_taban > 0) {
      const sD = m * F_taban * wD[i] / ED;
      const dSemboller = new Set([...dDegisen]);
      for (const [k] of c) if (k[0] === 'D') dSemboller.add(k.slice(2));
      for (const [k] of u) if (k[0] === 'D') dSemboller.add(k.slice(2));
      for (const s of dSemboller) olcek.set('D|' + s, sD);
      const aktif = dcaGun.get(t) || [];
      for (const j of aktif) { const sg = segler[j]; const E = sg.oz.get(t - GUN); if (E > 0) olcek.set('C|' + j, m * F_taban * (1 - wD[i]) / aktif.length / E); }
    }
    // Donchian açılış olaylarını bileşen birimine uygula (hedef = gün sonu ölçeğinde açılıştan sonraki birim)
    for (const o of dOlay) c.set('D|' + o.s, (c.get('D|' + o.s) || 0) + o.dq);
    const anahtarlar = new Set([...u.keys(), ...olcek.keys()]);
    for (const k of anahtarlar) {
      const s = anahtarSembol(k); const b = bar(s, t); if (!b) continue;
      const hedef = (olcek.get(k) || 0) * (c.get(k) || 0);
      const mevcut = u.get(k) || 0;
      const zorunlu = hedef === 0 || mevcut === 0 || (k[0] === 'D' && dDegisen.has(s));
      if (Math.abs(hedef - mevcut) < 1e-12) continue;
      if (!zorunlu && Math.abs(hedef - mevcut) <= bant * Math.abs(hedef)) continue;
      islem(k, hedef - mevcut, b.open);
    }
    // Gün başı pozisyon anlık görüntüsü (kötümser senaryo 1)
    const poz1 = netSembol(), nakit1 = nakit;
    // ── 3. DCA dolumları (gün içi, bileşen fiyatından, s_k ile ölçekli) ──
    let gunDolum = 0;
    for (const j of dcaGun.get(t) || []) {
      const ol = segler[j].olaylar.get(t); if (!ol) continue;
      const k = 'C|' + j, sk = olcek.get(k) || 0;
      for (const o of ol) { c.set(k, (c.get(k) || 0) + o.dq); if (sk) { islem(k, sk * o.dq, o.fiyat); if (o.dolum) { gunDolum++; st.dolum++; } } }
    }
    // Segment bitti / aktif değil: bileşen birimi sıfırlanır (hesap ertesi açılışta kapatır)
    // (segmentin son günü sonrası olcek yok → hedef 0 → zorunlu kapanış)
    const poz2 = netSembol();
    // ── 4. Kötümser gün içi değerleme, bakım marjı, tasfiye ──
    const k1 = kotumser(nakit1, poz1, t), k2 = kotumser(nakit, poz2, t);
    const kot = k1.E / Math.max(k1.mm, 1e-12) < k2.E / Math.max(k2.mm, 1e-12) ? k1 : k2;
    const Ew = Math.min(k1.E, k2.E);
    const spotW = btc * (btcB ? btcB.low : 0) + spotNakit;
    if (gunIciKontrol && kot.mm > 0) {
      const tampon = kot.E / kot.mm;
      if (tampon < st.enDusukTampon) { st.enDusukTampon = tampon; st.tamponGun = t; }
    }
    if (gunDolum && k2.im > k2.E) st.sigmayanDolum += gunDolum;
    let tasfiye = false;
    if (gunIciKontrol && (k1.E < k1.mm || k2.E < k2.mm)) {
      tasfiye = true;
      const kk = k1.E < k1.mm ? k1 : k2;
      nakit = Math.max(0, kk.mm - TASFIYE_UCRETI * kk.N);
      for (const k of u.keys()) u.set(k, 0);
      st.tasfiye.push({ t, Ew: kk.E, mm: kk.mm, N: kk.N, F: oncekiF });
      tasfiyeErtesi = true;
    }
    // ── 5. Funding ve kapanış ──
    for (const [k, q] of u) {
      if (!q) continue; const s = anahtarSembol(k); const b = bar(s, t); if (!b) continue;
      const f = seri.get(s).fon.get(t) || 0; if (f) { const o = q * b.close * f; nakit -= o; st.fon += o; }
    }
    for (const [s, x] of seri) { const j = x.indeks.get(t); if (j != null) sonKap.set(s, x.m[j].close); }
    const F = nakit + pozDegeri(s => sonKap.get(s));
    const Sv = btc * sonKap.get(BTC) + spotNakit;
    const Tt = F + Sv;
    // Başlangıç marjı ve merdiven kontrolü (gün sonu)
    if (F > 0) {
      const net = netSembol(); let im = 0;
      const ladder = new Map();
      for (const j of dcaGun.get(t) || []) {
        const sg = segler[j], sk = olcek.get('C|' + j) || 0; if (!sk) continue;
        const d = sg.dealler.find(x => x.bas <= t && t < x.bit);
        if (!d) continue;
        const dolan = d.girisZamanlari.filter(z => z <= t).length - 1;   // BO hariç dolan SO
        let kalan = 0; for (let q = Math.max(0, dolan); q < SO_TUTAR.length; q++) kalan += SO_TUTAR[q];
        ladder.set(sg.s, (ladder.get(sg.s) || 0) + kalan * sk);         // $ nominal (miktar×fiyat ölçeği)
      }
      let imTam = 0;
      for (const [s, q] of net) {
        const n = Math.abs(q) * sonKap.get(s); const L = maxKal(s, n, tablo); im += n / L;
        const nt = n + (ladder.get(s) || 0); imTam += nt / maxKal(s, nt, tablo);
        if (n / F > st.enBuyukNominalOran) { st.enBuyukNominalOran = n / F; st.enBuyukNominalS = s; st.enBuyukNominalT = t; }
        if (n > st.enBuyukNominal) st.enBuyukNominal = n;
        if (n / F > L) st.kalAsim++;
      }
      for (const [s, l] of ladder) if (!net.has(s)) imTam += l / maxKal(s, l, tablo);
      if (im > F) st.imAsim++;
      if (imTam > F) st.merdivenSigmazGun++;
      let mmSon = 0; for (const [s, q] of net) mmSon += MM(s, Math.abs(q) * sonKap.get(s), tablo);
      if (mmSon > 0 && F / mmSon < st.tamponGunSonu) st.tamponGunSonu = F / mmSon;
    }
    const gunIci = (Ew + spotW) / oncekiT - 1;
    if (gunIci < st.enKotuGunIci) { st.enKotuGunIci = gunIci; st.enKotuGunIciT = t; }
    const gk = Tt / oncekiT - 1;
    if (gk < st.enKotuGun) { st.enKotuGun = gk; st.enKotuGunT = t; }
    egri.push({ time: t, oz: Math.max(Tt, 1e-9) });
    vadeliEgri.push({ time: t, oz: F });
    oncekiT = Tt; oncekiF = F;
    if (Tt <= sermaye * 1e-6) st.bitti = true;
  }
  const bas = [{ time: ts[0] - GUN, oz: sermaye }, ...egri];
  return { egri: bas, st, tum: S.metrik(bas), hol: S.metrik(bas, HOL), y22: S.metrik(bas, Date.UTC(2021, 10, 1), Date.UTC(2023, 0, 1)) };
}

// ── Doğrusal (altut-asama2 risk menüsü yöntemi) ─────────────────────────────
const k1Sim = S.simule(AK.btcTrend(100), { funding: false });
const rK1 = new Map(k1Sim.egri.slice(1).map((x, i) => [x.time, x.oz / k1Sim.egri[i].oz - 1]));
const tsL = kolDosya.gunler.filter(t => rK1.has(t));
function dogrusal(m, yapi = 'A', kaynak = 'dosya') {
  const kr = kaynak === 'dosya' ? kolMap : new Map(ts.map((t, i) => [t, kolR[i]]));
  const r = tsL.map(t => (yapi === 'B' ? m * kr.get(t) : (k1Acik.get(t) ? 0.5 * rK1.get(t) + 0.5 * m * kr.get(t) : m * kr.get(t))));
  let oz = 1; const e = [{ time: tsL[0] - GUN, oz }]; r.forEach((x, i) => { oz *= 1 + x; e.push({ time: tsL[i], oz }); });
  return { tum: S.metrik(e), hol: S.metrik(e, HOL), enKotuGun: Math.min(...r), enKotuGunT: tsL[r.indexOf(Math.min(...r))] };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. RAPOR
// ═══════════════════════════════════════════════════════════════════════════
const fonYillik = (R) => { const yil = (R.egri[R.egri.length - 1].time - R.egri[0].time) / (365.25 * GUN); const ort = R.egri.reduce((x, y) => x + y.oz, 0) / R.egri.length; return R.st.fon / ort / yil; };
function satir(ad, R) {
  const s = R.st;
  return `  ${ad.padEnd(22)} CAGR ${yz(R.tum.cagr).padStart(7)} · hold ${yz(R.hol.cagr).padStart(7)} · DD ${yz(R.tum.maxDD).padStart(6)} · Sh ${R.tum.sharpe.toFixed(2)} · en kötü gün kapanış ${yz(s.enKotuGun)} (${tarih(s.enKotuGunT)}) / gün içi kötümser ${yz(s.enKotuGunIci)} (${tarih(s.enKotuGunIciT)}) · tasfiye ${s.tasfiye.length} · min tampon ${s.enDusukTampon.toFixed(2)} (${s.tamponGun ? tarih(s.tamponGun) : '—'}) · sığmayan DCA ${s.sigmayanDolum}/${s.dolum} · merdiven sığmaz gün ${s.merdivenSigmazGun} · IM>özs. gün ${s.imAsim} · funding ${Math.round(s.fon).toLocaleString('tr-TR')} $ (${yz(fonYillik(R))}/yıl) · ücret ${Math.round(s.ucret).toLocaleString('tr-TR')} $`;
}

// Mutabakat 2: B Kalkan m=1, maliyet ve bant dahil/hariç
console.log('\n  MUTABAKAT 2 — B Kalkan (yalnız kol, m = 1) · bilinen: Sharpe ~1,50 · CAGR ~%10,2 · DD ~%7,2');
const lB = dogrusal(1, 'B'), lBk = dogrusal(1, 'B', 'kurulan');
console.log(`  doğrusal (dosya)       CAGR ${yz(lB.tum.cagr)} · hold ${yz(lB.hol.cagr)} · DD ${yz(lB.tum.maxDD)} · Sh ${lB.tum.sharpe.toFixed(2)} · en kötü gün ${yz(lB.enKotuGun)}`);
console.log(`  doğrusal (kurulan kol) CAGR ${yz(lBk.tum.cagr)} · hold ${yz(lBk.hol.cagr)} · DD ${yz(lBk.tum.maxDD)} · Sh ${lBk.tum.sharpe.toFixed(2)}`);
const Bsifir = simule({ m: 1, yapi: 'B', bant: 0, maliyet: 0 });
console.log(satir('entegre, maliyet 0/bant 0', Bsifir) + '  ← yöntem kontrolü (bileşen maliyeti kolun içinde, ek maliyet yok)');
const B1 = simule({ m: 1, yapi: 'B' });
console.log(satir('ENTEGRE B Kalkan m=1', B1));

console.log('\n  ANA TABLO — A Atak (S4), doğrusal vs entegre (aylık spot↔vadeli denge) vs entegre (günlük denge, tanısal)');
const sonuc = [];
for (const m of [2, 3, 4, 5]) {
  const L = dogrusal(m, 'A');
  const E = simule({ m, yapi: 'A' });
  const G = simule({ m, yapi: 'A', denge: 'gunluk' });
  console.log(`  m=${m} doğrusal              CAGR ${yz(L.tum.cagr).padStart(7)} · hold ${yz(L.hol.cagr).padStart(7)} · DD ${yz(L.tum.maxDD).padStart(6)} · Sh ${L.tum.sharpe.toFixed(2)} · en kötü gün ${yz(L.enKotuGun)} (${tarih(L.enKotuGunT)})`);
  console.log(satir(`m=${m} entegre (aylık)`, E));
  console.log(satir(`m=${m} entegre (günlük)`, G));
  const s = E.st;
  const guvenli = s.tasfiye.length === 0 && s.enDusukTampon >= 2 && s.enKotuGunIci >= -0.20;
  console.log(`      GÜVENLİK: tasfiye ${s.tasfiye.length} ${s.tasfiye.length === 0 ? '✓' : '✗'} · min tampon ${s.enDusukTampon.toFixed(2)} ${s.enDusukTampon >= 2 ? '✓' : '✗'} · en kötü gün içi ${yz(s.enKotuGunIci)} ${s.enKotuGunIci >= -0.2 ? '✓' : '✗'} → ${guvenli ? 'GÜVENLİ' : 'güvenli değil'}${s.tasfiye.length ? ` · tasfiyeler: ${s.tasfiye.map(x => tarih(x.t)).join(', ')}` : ''}`);
  console.log(`      en büyük sembol nominali / vadeli özs. ${s.enBuyukNominalOran.toFixed(2)}x (${s.enBuyukNominalS ? s.enBuyukNominalS.split('/')[0] : '—'} ${s.enBuyukNominalT ? tarih(s.enBuyukNominalT) : ''}) · en büyük nominal ${Math.round(s.enBuyukNominal).toLocaleString('tr-TR')} $ · kademe kaldıraç aşımı ${s.kalAsim} · gün sonu min tampon ${s.tamponGunSonu.toFixed(2)} · spot işlem/aktarım ${s.aktarim}`);
  sonuc.push({ m, L, E, G, guvenli });
}
const tavan = sonuc.filter(x => x.guvenli).map(x => x.m);
// Güvenli tavan: geçen EN BÜYÜK m (ön-kayıt). Aradaki boşluk da raporlanır.
console.log(`\n  GÜVENLİ TAVAN (ön-kayıt kriteri): ${tavan.length ? 'm = ' + Math.max(...tavan) : 'YOK'} · geçen m'ler: ${tavan.join(', ') || '—'}`);
{
  const r3 = sonuc.find(x => x.m === 3);
  const f = (x, y) => (y ? (x - y) / Math.abs(y) : null);
  console.log(`  m=3 sapma (entegre aylık / doğrusal − 1): CAGR ${yz(f(r3.E.tum.cagr, r3.L.tum.cagr))} · DD ${yz(f(r3.E.tum.maxDD, r3.L.tum.maxDD))} · holdout ${yz(f(r3.E.hol.cagr, r3.L.hol.cagr))}`);
  console.log(`  m=3 sapma (entegre günlük / doğrusal − 1): CAGR ${yz(f(r3.G.tum.cagr, r3.L.tum.cagr))} · DD ${yz(f(r3.G.tum.maxDD, r3.L.tum.maxDD))}`);
  const z = simule({ m: 3, yapi: 'A', denge: 'gunluk', bant: 0, maliyet: 0 });
  console.log(`  m=3 ayrıştırma — günlük denge, bant 0, vadeli maliyet 0: CAGR ${yz(z.tum.cagr)} · DD ${yz(z.tum.maxDD)} (doğrusala en yakın kurgu)`);
  const z2 = simule({ m: 3, yapi: 'A', denge: 'aylik', bant: 0, maliyet: 0 });
  console.log(`  m=3 ayrıştırma — aylık denge, bant 0, vadeli maliyet 0:  CAGR ${yz(z2.tum.cagr)} · DD ${yz(z2.tum.maxDD)}`);
}

if (process.env.DUYARLILIK) {
  console.log('\n  DUYARLILIK — sermaye ve kademe tablosu (A, aylık denge)');
  for (const [sermaye, tablo] of [[10000, 'sinif'], [1000000, 'sinif'], [1e7, 'sinif'], [100000, 'yedek'], [100000, 'kotumser']]) {
    for (const m of [3, 4, 5]) {
      const R = simule({ m, yapi: 'A', sermaye, tablo });
      console.log(`  ${(sermaye.toLocaleString('tr-TR') + ' $ ' + tablo).padEnd(22)} m=${m}: CAGR ${yz(R.tum.cagr)} · DD ${yz(R.tum.maxDD)} · tasfiye ${R.st.tasfiye.length} · min tampon ${R.st.enDusukTampon.toFixed(2)} (${R.st.tamponGun ? tarih(R.st.tamponGun) : '—'}) · gün içi ${yz(R.st.enKotuGunIci)} · sığmayan DCA ${R.st.sigmayanDolum} · merdiven sığmaz ${R.st.merdivenSigmazGun}`);
    }
  }
}

// Kolun günlük pozisyon tablosu (görev 1): kol özsermayesi = 1 birimine göre nominal.
if (process.env.POZ_YAZ) {
  const c = new Map(), ort = new Map(), cikti = [];
  const segOrt = new Map();
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]; const ED = don.egri.get(t - GUN);
    for (const o of don.olaylar.get(t) || []) {
      const k = 'D|' + o.s, q0 = c.get(k) || 0, q1 = q0 + o.dq;
      if (o.dq > 0 && q0 >= 0) ort.set(k, ((ort.get(k) || 0) * q0 + o.fiyat * o.dq) / q1);
      if (Math.abs(q1) < 1e-15) ort.delete(k);
      c.set(k, q1);
    }
    const aktif = dcaGun.get(t) || [];
    for (const j of aktif) for (const o of segler[j].olaylar.get(t) || []) {
      const k = 'C|' + j, q0 = c.get(k) || 0, q1 = q0 + o.dq;
      if (o.dq > 0) segOrt.set(k, ((segOrt.get(k) || 0) * q0 + o.fiyat * o.dq) / q1);
      if (q1 < 1e-12) segOrt.delete(k);
      c.set(k, q1);
    }
    const satirlar = [];
    for (const [k, q] of c) {
      if (Math.abs(q) < 1e-12) continue;
      const isD = k[0] === 'D'; const s = isD ? k.slice(2) : segler[Number(k.slice(2))].s; const b = bar(s, t); if (!b) continue;
      if (!isD && !aktif.includes(Number(k.slice(2)))) continue;
      const pay = isD ? wD[i] * q * b.close / ED : (1 - wD[i]) / aktif.length * q * b.close / segler[Number(k.slice(2))].oz.get(t - GUN);
      satirlar.push([isD ? 'don' : 'dca', s.split('/')[0], q > 0 ? 'long' : 'short', +pay.toFixed(6), +((isD ? ort.get(k) : segOrt.get(k)) || 0).toPrecision(6)]);
    }
    cikti.push([tarih(t), satirlar]);
  }
  fs.writeFileSync(yollar.veri('arastirma', 'kol-pozisyonlari.json'), JSON.stringify({ aciklama: '[tarih, [[bileşen, sembol, yön, kol özsermayesine göre nominal (gün sonu, ×1), ortalama giriş]]]', gunler: cikti }));
  const brut = cikti.map(([, l]) => l.reduce((x, y) => x + Math.abs(y[3]), 0));
  console.log(`\n  kol pozisyon tablosu yazıldı: data/arastirma/kol-pozisyonlari.json · kol brüt nominali ort ${(brut.reduce((x, y) => x + y, 0) / brut.length).toFixed(2)}x, en yüksek ${Math.max(...brut).toFixed(2)}x`);
}
