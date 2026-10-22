/**
 * BİNDİRME (O-GC + Kalkan kolu ×3) — ARAŞTIRMA / ÖLÇÜM MODÜLÜ.
 * PLAN-ALTUT-YENMEK.md 8.–10b. aşamalar, PLAN-BINDIRME-MARJ.md.
 *
 * İki strateji (panelde kullanıcıya görünen adlar):
 *   · HÜCUM  (`hucum`, btcPay 1)   — trendde %100 BTC teminat + Kalkan kolu ×3 — getiri öncelikli
 *   · DENGE  (`denge`, btcPay 0,5) — trendde %50 BTC + Kalkan kolu ×3 — gün içi risk daha düşük
 *
 * O-GC REJİMİ (Pine betiğiyle BİREBİR — masaüstü "Hucum BTC ayagi - TradingView Pine.txt"):
 *   SMA'lar kapanıştan; hepsi hazır değilse dışarıda.
 *   dışarıdayken  kapanış > SMA100 VE SMA50 > SMA200 → İÇERİ
 *   içerideyken   kapanış < SMA100                   → DIŞARI
 *   Karar j günü KAPANIŞINDA, uygulama j+1 günü AÇILIŞINDA.
 *
 * Entegre simülasyon `scripts/bindirme-marj-sim.js` `simule()`nin BİREBİR
 * taşınmasıdır (tek USDⓈ-M çoklu varlık hesabı, BTC teminatı aylık + geçişte
 * dengelenir, kol pozisyon düzeyinde PIT, bant %10, kol maliyeti %0,07, BTC spot
 * %0,12, gerçek funding, gün içi kötümser değerleme, hesap tasfiyesi). Tek fark:
 * BTC durumu `asama8-O-GC.json`dan OKUNMAZ, `ogcDurum` ile mumlardan HESAPLANIR
 * (selftest ikisinin aynı olduğunu doğrular).
 *
 * Veri: `data/market.db` (pitVeri) + kol bileşenleri önbelleği
 * `data/arastirma/capraz-marj-onbellek.json` (`ONBELLEK=1 node scripts/capraz-marj-sim.js`).
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');

const ROOT = path.join(__dirname, '..', '..');
const GUN = 864e5;
const HOL = Date.UTC(2024, 0, 1);
// TEMINAT / REJIM (PLAN-GOMLEK G3b): teminat ve O-GC rejim sembolü; varsayılan BTC (bugünkü davranış).
const BTC = process.env.TEMINAT || 'BTC/USDT:USDT';
const REJIM = process.env.REJIM || BTC;
// PLAN-HUCUM-VARLIK.md (807–816) — hepsi tanımsızken davranış BİREBİR eskisi:
//   OGC_PARAM="hızlı,çıkış,yavaş"   O-GC parametreleri (varsayılan 50,100,200)
//   REJIM_DOSYA=<json>               { "YYYY-MM-DD": 0|1 } t GÜNÜ uygulanacak rejim (dışarıdan hesaplanmış, ör. borsa işlem günlerinde);
//                                    eksik gün → önceki bilinen değer, hiç yoksa 0
//   TEMINAT_H=<oran>                 varsayılan teminat oranı h (0,95)
//   TEMINAT_FON_YILLIK=<oran>        teminat/taban varlık nominaline yıllık finansman maliyeti (perp ile tutulan TradFi tabanı; 0)
//   TEMINAT_MMR=<oran>               taban varlık nominaline bakım marjı (perp tabanı; 0 = teminat gibi MM doğurmaz)
const OGC_P = process.env.OGC_PARAM ? (([a, b, c]) => ({ hizli: a, cikis: b, yavas: c }))(process.env.OGC_PARAM.split(',').map(Number)) : {};
const H_VARS = process.env.TEMINAT_H != null ? Number(process.env.TEMINAT_H) : 0.95;
const TEM_FON = Number(process.env.TEMINAT_FON_YILLIK) || 0;
const TEM_MMR = Number(process.env.TEMINAT_MMR) || 0;
const TAKER = 0.0005, KAYMA = 0.0002, MALIYET = TAKER + KAYMA;
const SPOT_MALIYET = 0.001 + 0.0002, TASFIYE_UCRETI = 0.0125;
const KOL_M = 3;
// GOMLEK_BAS (ISO tarih, PLAN-GOMLEK G2): kol başlangıcı; varsayılan 2020-09-03.
const BAS = process.env.GOMLEK_BAS ? Date.parse(process.env.GOMLEK_BAS + 'T00:00:00Z') : Date.UTC(2020, 8, 3);
// MARKET_DB (PLAN-GOMLEK G2): veritabanı yolu (kökten göreli ya da mutlak); varsayılan data/market.db.
const DB_YOL = process.env.MARKET_DB ? yollar.goreli(process.env.MARKET_DB) : yollar.veri('market.db');

/**
 * `kayit`: entegre simülasyonun kayıtlı ölçümü (teminat %95, 2020-09-04 → 2026-10-05,
 * PLAN-ALTUT-YENMEK.md 10. AŞAMA). 2026-10-07: TradFi sızıntısı düzeltilince yeniden ölçüldü
 * (önce Hücum %74,8 / %46,1 / P 0,90; Denge %55,6 / %40,4 / P 0,70 — PLAN-TRADFI-SIZINTI.md).
 * 2026-10-07 (geç): kayıt döneminin son 5 günü (10-01…05) eksik veriyle kurulmuştu (yalnız BTC Ekim verisi) — veri
 * orkestratörü tamamladı, yeniden ölçüldü: Hücum %73,2/%43,1 → %73,0/%42,7; Denge %54,1/%37,5 → %53,9/%37,1 (MaxDD/vol aynı). `vol`: yıllık σ — canlı botun risk eşiklerini
 * `esikOlcekle` ile bu σ'ya ölçeklemek için.
 */
// 72.0: görünen ad merkezî tablodan (lib/botAdlari.js) — kimlik (hucum / denge) aynı.
const BOT_ADLARI = require('../botAdlari');
const STRATEJILER = Object.freeze({
  hucum: Object.freeze({ ad: BOT_ADLARI.ad('hucum'), btcPay: 1, aciklama: 'trendde %100 BTC teminat + Kalkan kolu ×3 — getiri öncelikli',
    kayit: Object.freeze({ cagr: 0.730, holdout: 0.427, maxDD: 0.356, P: 0.89, gunIci: -0.306, vol: 0.476 }) }),
  denge: Object.freeze({ ad: BOT_ADLARI.ad('denge'), btcPay: 0.5, aciklama: 'trendde %50 BTC + Kalkan kolu ×3 — gün içi risk daha düşük',
    kayit: Object.freeze({ cagr: 0.539, holdout: 0.371, maxDD: 0.262, P: 0.69, gunIci: -0.228, vol: 0.320 }) }),
});
const AL_TUT_KAYIT = Object.freeze({ cagr: 0.420, holdout: 0.271, maxDD: 0.767 });
/** `kayit` ölçümlerinin dönemi (veri orkestratörü kol önbelleğini yeniden kurunca bu dönemde kayıtla karşılaştırır). */
const KAYIT_DONEM = Object.freeze({ bas: '2020-09-04', bit: '2026-10-05' });

// ═══ 1. O-GC DURUM MAKİNESİ (saf) ═════════════════════════════════════════════
/** Kayan SMA dizisi: i < n−1 → null. Toplam her pencerede baştan (kayan nokta kayması yok). */
function smaDizi(k, n) {
  const o = new Array(k.length).fill(null);
  for (let j = n - 1; j < k.length; j++) { let s = 0; for (let i = j - n + 1; i <= j; i++) s += k[i]; o[j] = s / n; }
  return o;
}

/**
 * @param kapanislar günlük kapanışlar (eski → yeni)
 * @returns {{ durum: number[] (0|1, j KAPANIŞINDAKİ durum), sma50, sma100, sma200 }}
 */
function ogcDurum(kapanislar, { hizli = 50, cikis = 100, yavas = 200 } = {}) {
  const k = kapanislar.map(Number);
  const s50 = smaDizi(k, hizli), s100 = smaDizi(k, cikis), s200 = smaDizi(k, yavas);
  const durum = new Array(k.length).fill(0);
  let ic = false;
  for (let j = 0; j < k.length; j++) {
    const hazir = s50[j] != null && s100[j] != null && s200[j] != null;
    if (hazir) {
      if (!ic && k[j] > s100[j] && s50[j] > s200[j]) ic = true;
      else if (ic && k[j] < s100[j]) ic = false;
    }
    durum[j] = ic ? 1 : 0;
  }
  return { durum, sma50: s50, sma100: s100, sma200: s200 };
}

/**
 * Rejim geçişleri (Pine ile satır satır kıyas için).
 * @param mumlar [{time, open, close}] günlük
 * @param bas    bu tarihten (uygulama günü) önceki geçişler listelenmez; ilk gün içerideyse "başlangıç girişi" yazılır
 * @returns [{ karar (j günü, ms), uygulama (j+1, ms), yon: 'giris'|'cikis', kapanis, sma50, sma100, sma200, fiyat (j+1 açılış | null) }]
 */
function ogcGecisler(mumlar, { bas = -Infinity, ...ayar } = {}) {
  const o = ogcDurum(mumlar.map(m => m.close), ayar);
  const satir = (j, yon) => ({
    karar: mumlar[j].time, uygulama: mumlar[j].time + GUN, yon,
    kapanis: mumlar[j].close, sma50: o.sma50[j], sma100: o.sma100[j], sma200: o.sma200[j],
    fiyat: mumlar[j + 1] ? mumlar[j + 1].open : null,
  });
  const out = [];
  // Pine: pozisyon başlangıçta düz; "aktif" başladığında içerideyse ilk barda giriş emri verilir.
  let onceki = 0;
  for (let j = 0; j < mumlar.length; j++) {
    if (mumlar[j].time + GUN < bas) continue;
    if (o.durum[j] !== onceki) out.push(satir(j, o.durum[j] ? 'giris' : 'cikis'));
    onceki = o.durum[j];
  }
  return out;
}

// ═══ 2. VERİ (bir kez yüklenir) ═══════════════════════════════════════════════
let _veri = null;
function onbellekYolu() { return yollar.veri('arastirma', process.env.ONBELLEK_DOSYA || 'capraz-marj-onbellek.json'); }
function veriVarMi() { return fs.existsSync(DB_YOL) && fs.existsSync(onbellekYolu()); }

function veriYukle() {
  if (_veri) return _veri;
  const V = require('./pitVeri');
  const { seri } = V.yukle();
  const ONB = onbellekYolu();
  if (!fs.existsSync(ONB)) throw new Error('kol önbelleği yok: önce ONBELLEK=1 node scripts/capraz-marj-sim.js');
  const j = JSON.parse(fs.readFileSync(ONB, 'utf8'));
  // VERI_KESIM (PLAN-COKLU-TABAN holdout koruması): kesim günü ve sonrası girdiler ayrıştırmadan hemen sonra atılır (hiçbir hesaba girmez).
  const KES = V.kesimMs();
  const M = KES == null ? (a) => new Map(a) : (a) => new Map(a.filter(([t]) => t < KES));
  const don = { egri: M(j.don.egri), olaylar: M(j.don.olaylar) };
  const segler = j.segler.map(x => ({ ...x, g: M(x.g), oz: M(x.oz), olaylar: M(x.olaylar) }));
  // Ters-vol 60 g gecikmeli (bindirme-marj-sim.js / capraz-marj-sim.js ile aynı)
  const donT = [...don.egri.keys()].sort((a, b) => a - b);
  const rD = new Map(); for (let i = 1; i < donT.length; i++) rD.set(donT[i], don.egri.get(donT[i]) / don.egri.get(donT[i - 1]) - 1);
  const dcaGun = new Map();
  segler.forEach((sg, i) => { for (const t of sg.g.keys()) { if (!dcaGun.has(t)) dcaGun.set(t, []); dcaGun.get(t).push(i); } });
  const dcaR = new Map();
  for (const [t, l] of dcaGun) if (t >= BAS) dcaR.set(t, l.reduce((a, i) => a + segler[i].g.get(t), 0) / l.length);
  const ts = [...rD.keys()].filter(t => dcaR.has(t)).sort((a, b) => a - b);
  const ra = ts.map(t => rD.get(t)), rb = ts.map(t => dcaR.get(t));
  const sapma = (x) => { const o = x.reduce((p, q) => p + q, 0) / x.length; return Math.sqrt(x.reduce((p, q) => p + (q - o) ** 2, 0) / (x.length - 1)); };
  const wD = ts.map((_, i) => { if (i < 61) return 0.5; const wa = 1 / (sapma(ra.slice(i - 61, i - 1)) || 1e-6), wb = 1 / (sapma(rb.slice(i - 61, i - 1)) || 1e-6); return wa / (wa + wb); });
  // O-GC: t gününün durumu = t−1 kapanışındaki karar (rejim sembolü: varsayılan BTC)
  const bm = seri.get(REJIM).m;
  const og = ogcDurum(bm.map(x => x.close), OGC_P);
  const bIdx = seri.get(REJIM).indeks;
  let wMap = new Map(ts.map(t => { const i = bIdx.get(t); return [t, i != null && i >= 1 ? og.durum[i - 1] : 0]; }));
  if (process.env.REJIM_DOSYA) {
    const rj = JSON.parse(fs.readFileSync(yollar.goreli(process.env.REJIM_DOSYA), 'utf8'));
    const g = new Map(Object.entries(rj).map(([k, v]) => [Date.parse(k + 'T00:00:00Z'), Number(v) ? 1 : 0]));
    let son = 0; const tum = [...new Set([...g.keys(), ...ts])].sort((a, b) => a - b); const dolu = new Map();
    for (const t of tum) { if (g.has(t)) son = g.get(t); dolu.set(t, son); }
    wMap = new Map(ts.map(t => [t, dolu.get(t) || 0]));
  }
  _veri = { seri, don, segler, dcaGun, ts, wD, ra, rb, wMap, bm, og };
  return _veri;
}

// ═══ 3. KADEMELER (bindirme-marj-sim.js ile aynı yaklaşık sınıf tablosu) ═══════
const T = (rows) => rows.map(([cap, mmr, lev]) => ({ maxNotional: cap, maintenanceMarginRate: mmr, maxLeverage: lev }));
const SINIF = {
  major: T([[3e5, 0.004, 125], [8e5, 0.005, 100], [3e6, 0.0065, 75], [12e6, 0.01, 50], [70e6, 0.02, 25], [1e8, 0.025, 20], [2.3e8, 0.05, 10], [4.8e8, 0.1, 5], [6e8, 0.125, 4], [8e8, 0.15, 3], [1.2e9, 0.25, 2], [Infinity, 0.5, 1]]),
  buyukAlt: T([[1e4, 0.005, 75], [5e4, 0.01, 50], [2.5e5, 0.02, 25], [1e6, 0.025, 20], [2e6, 0.05, 10], [5e6, 0.1, 5], [1e7, 0.125, 4], [2e7, 0.15, 3], [5e7, 0.25, 2], [Infinity, 0.5, 1]]),
  alt: T([[5e3, 0.01, 50], [2.5e4, 0.02, 25], [1e5, 0.025, 20], [2.5e5, 0.05, 10], [1e6, 0.1, 5], [2.5e6, 0.125, 4], [5e6, 0.15, 3], [1e7, 0.25, 2], [Infinity, 0.5, 1]]),
};
const BUYUK_ALT = new Set(['BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'LINK', 'LTC', 'DOT', 'AVAX', 'BCH', 'ETC', 'TRX', 'MATIC', 'ATOM', 'UNI', 'FIL', 'EOS', 'NEAR', 'XLM', 'SUI', 'AAVE', 'APT', 'ARB', 'OP']);
function kademeler(s) { const b = s.split('/')[0]; if (b === 'BTC' || b === 'ETH') return SINIF.major; return BUYUK_ALT.has(b) ? SINIF.buyukAlt : SINIF.alt; }

// ═══ 4. ENTEGRE SİMÜLASYON (bindirme-marj-sim.js simule() — birebir) ══════════
/**
 * @param btcPay  içerideyken BTC payı (1 = Hücum, 0,5 = Denge)
 * @param m       kol çarpanı (0 → yalnız BTC ayağı, kolsuz)
 * @param btcVar  false → yalnız kol (BTC hiç tutulmaz)
 * @param felaket null (varsayılan, ölçülen sistem) | { k (6), btc (true: BTC ayağı da stoplu), n (20) } —
 *                borsa tarafı felaket stopu ablasyonu (PLAN-FELAKET-ABLASYON.md): sembol başına NET pozisyona
 *                t−1 kapanışı × (1 ∓ k × ATR%) stop; DCA tabanı; tetikte bileşenler kapanır ve kendi modeli
 *                pozisyonu sıfırlayana kadar askıda (BTC ayağı rejim çıkışına kadar).
 * @param cekilebilirKisit null (varsayılan, ölçülen sistem — BİREBİR) | true | { kaldirac (20), otomatikCevrim (false),
 *                tampon (0,025) } — 860 (PLAN-B1-KISIT.md): BTC alımı (rejim girişi + ay başı ilavesi) gerçek Binance'teki
 *                ÇEKİLEBİLİR USDT ile sınırlanır; karşılanamayan kısım o ay yapılmaz; satış kısıtsız. otomatikCevrim:
 *                gün sonu eksi USDT cüzdanı BTC'den × (1 + tampon) çevrilir (ablasyon).
 * @param taban   null (varsayılan, ölçülen sistem — BİREBİR; BTC teminatı btcPay × wMap) | { agirlik(t, i) → Map(sembol → hedef pay) } —
 *                ÇOKLU TABAN (PLAN-COKLU-TABAN.md): BTC ayağı yerine bir taban sepeti. Her üye spot tutulur (teminat h, funding yok,
 *                bakım marjı yok — BTC teminatıyla aynı), hedef = pay × açılış özsermayesi / açılış; üye başına yeniden dengeleme
 *                BTC kuralının aynısı (ilk gün, pay değişince, tasfiye ertesi, içerideyken ay başı), maliyet spotMal. Barı olmayan
 *                üye o gün son kapanıştan satılır ve ay sonuna kadar dışarıda (delist kuralı, §1). taban verilince BTC ayağı
 *                kapalıdır (btcVar yok sayılır); cekilebilirKisit / felaket / TEMINAT_MMR / TEMINAT_FON_YILLIK ile birlikte kullanılamaz.
 */
function simule({ btcPay = 1, h = H_VARS, sermaye = 100000, bant = 0.10, maliyet = MALIYET, spotMal = SPOT_MALIYET, m = KOL_M, btcVar = true, felaket = null, cekilebilirKisit = null, taban = null } = {}) {
  if (taban && (cekilebilirKisit || felaket || TEM_MMR || TEM_FON)) throw new Error('taban: cekilebilirKisit / felaket / TEMINAT_MMR / TEMINAT_FON_YILLIK ile birlikte desteklenmiyor');
  const TB = taban ? { agirlik: taban.agirlik, tq: new Map(), wOnce: new Map(), dusen: new Set(), ay: null, islemler: [] } : null;
  if (TB) btcVar = false;
  const CK = cekilebilirKisit ? { kaldirac: 20, otomatikCevrim: false, tampon: 0.025, ...(cekilebilirKisit === true ? {} : cekilebilirKisit) } : null;
  const VEN = require('../venues');
  const { seri, don, segler, dcaGun, ts, wD, wMap } = veriYukle();
  const MM = (s, N) => VEN.maintenanceMargin(kademeler(s), N);
  const bar = (s, t) => { const x = seri.get(s); const i = x.indeks.get(t); return i == null ? null : x.m[i]; };
  const u = new Map(), c = new Map();
  const anahtarSembol = (k) => (k[0] === 'D' ? k.slice(2) : segler[Number(k.slice(2))].s);
  let nakit = sermaye, btc = 0;
  const sonKap = new Map();
  const egri = [], gunluk = [], btcIslemler = [];
  let oncekiT = sermaye;
  const st = { tasfiye: [], ucret: 0, fon: 0, spotUcret: 0, enDusukTampon: Infinity, tamponGun: null, enKotuGunIci: 0, enKotuGunIciT: null, enKotuGun: 0, enKotuGunT: null, bitti: false };
  const pozDegeri = (fF) => { let v = 0; for (const [k, q] of u) if (q) v += q * fF(anahtarSembol(k)); return v; };
  const netSembol = () => { const n = new Map(); for (const [k, q] of u) { if (!q) continue; const s = anahtarSembol(k); n.set(s, (n.get(s) || 0) + q); } return n; };
  const islem = (k, dq, fiyat) => { if (!dq) return; if (CK) girisIsle(k, dq, fiyat); const n = Math.abs(dq) * fiyat; nakit -= dq * fiyat + n * maliyet; st.ucret += n * maliyet; u.set(k, (u.get(k) || 0) + dq); };
  // ── 860 çekilebilir USDT kısıtı (PLAN-B1-KISIT.md; CK null → bu bloklar hiçbir şeyi değiştirmez) ──
  const giris = new Map();             // anahtar → ortalama giriş fiyatı (vadeli cüzdan = nakit + Σ q × giriş)
  const girisIsle = (k, dq, fiyat) => {
    const q0 = u.get(k) || 0, q1 = q0 + dq, g0 = giris.get(k) || 0;
    if (Math.abs(q1) < 1e-15) giris.delete(k);
    else if (Math.abs(q0) < 1e-15 || Math.sign(q0) !== Math.sign(q1)) giris.set(k, fiyat);
    else if (Math.abs(q1) > Math.abs(q0)) giris.set(k, (Math.abs(q0) * g0 + Math.abs(dq) * fiyat) / Math.abs(q1));
  };
  const cuzdanUsdt = () => { let w = nakit; for (const [k, q] of u) if (q) w += q * (giris.get(k) || 0); return w; };
  /** Çekilebilir USDT = max(0, min(cüzdan, h × BTC değeri + cüzdan + gerçekleşmemiş − başlangıç marjı)) — açılış fiyatlarıyla. */
  const cekilebilir = (t, btcAcilis) => {
    let N = 0, upnl = 0;
    for (const [k, q] of u) { if (!q) continue; const s = anahtarSembol(k); const b = bar(s, t); const f = b ? b.open : sonKap.get(s); N += Math.abs(q) * f; upnl += q * (f - (giris.get(k) || f)); }
    const w = cuzdanUsdt();
    return Math.max(0, Math.min(w, h * btc * btcAcilis + w + upnl - N / CK.kaldirac));
  };
  const ck = { kisitAy: 0, eksikPay: [], enEksiPay: 0, enEksiT: null, cevrim: 0, cevrimBtc: 0 };
  // ── Felaket stopu (yalnız ablasyon; FK null → bu blok hiçbir şeyi değiştirmez) ──
  const FK = felaket ? { k: 6, btc: true, n: 20, ...felaket } : null;
  const sus = new Set();               // askıdaki bileşen anahtarları
  let btcSus = false;
  const dealBO = new Map();            // 'C|j' → { bo, dolum } açık DCA deal'i
  let DCA_TABAN = 1; for (let i = 1; i <= 6; i++) DCA_TABAN *= 1 - 0.015 * Math.pow(1.6, i - 1);   // dcaBotStrategy varsayılanları
  const atrY = (s, t) => {
    const x = seri.get(s); const i = x.indeks.get(t);
    if (i == null || i < FK.n + 1) return null;
    let a = 0; for (let j = i - FK.n; j < i; j++) { const mm = x.m[j], o = x.m[j - 1].close; a += Math.max(mm.high - mm.low, Math.abs(mm.high - o), Math.abs(mm.low - o)); }
    const capa = x.m[i - 1].close; return capa > 0 ? { atr: a / FK.n / capa, capa } : null;
  };
  const ft = { tetik: [] };
  let stopF = new Map();               // bugün tetiklenen sembol → dolum fiyatı
  const kotumser = (nak, poz, t) => {
    let E = nak, mm = 0, N = 0;
    for (const [s, q] of poz) { const b = bar(s, t); const f = b ? (stopF.has(s) ? stopF.get(s) : (q > 0 ? b.low : b.high)) : sonKap.get(s); E += q * f; const n = Math.abs(q) * f; N += n; mm += MM(s, n); }
    return { E, mm, N };
  };
  let wOnce = null, ayOnce = null, tasfiyeErtesi = false;
  for (const [s, x] of seri) { const i = x.indeks.get(ts[0] - GUN); if (i != null) sonKap.set(s, x.m[i].close); }

  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]; if (st.bitti) break;
    for (const [k, q] of u) { if (q && !bar(anahtarSembol(k), t)) islem(k, -q, sonKap.get(anahtarSembol(k))); }
    if (TB) {
      const ayT = new Date(t).getUTCMonth();
      if (ayT !== TB.ay) { TB.dusen.clear(); TB.ay = ayT; }
      for (const [s, q] of TB.tq) {
        if (!q || bar(s, t)) continue;
        const f = sonKap.get(s), sm = Math.abs(q) * f * spotMal;
        nakit += q * f - sm; st.spotUcret += sm; TB.tq.set(s, 0); TB.dusen.add(s);
        TB.islemler.push({ t, s, yon: 'satım', fiyat: f, miktar: -q, sebep: 'barsız gün' });
      }
    }
    const btcB = bar(BTC, t);
    // ── 1. BTC teminatı (açılışta) ──
    if (btcSus && !wMap.get(t)) btcSus = false;
    const w = btcVar && !btcSus ? (wMap.get(t) || 0) * btcPay : 0;
    const ay = new Date(t).getUTCMonth();
    const T_ac = TB
      ? nakit + btc * btcB.open + tabanDeger(TB, s => bar(s, t).open) + pozDegeri(s => { const b = bar(s, t); return b ? b.open : sonKap.get(s); })
      : nakit + btc * btcB.open + pozDegeri(s => { const b = bar(s, t); return b ? b.open : sonKap.get(s); });
    if (i === 0 || w !== wOnce || tasfiyeErtesi || (w > 0 && ay !== ayOnce)) {
      const hedef = w * T_ac / btcB.open;
      let d = hedef - btc;
      if (CK && d > 1e-15) {
        const dMax = cekilebilir(t, btcB.open) / (btcB.open * (1 + spotMal));
        if (d > dMax) { ck.kisitAy++; ck.eksikPay.push((d - Math.max(0, dMax)) * btcB.open / T_ac); d = Math.max(0, dMax); }
      }
      if (Math.abs(d) > 1e-15) {
        const sm = Math.abs(d) * btcB.open * spotMal; nakit -= d * btcB.open + sm; st.spotUcret += sm;
        const sebep = i === 0 ? 'başlangıç' : tasfiyeErtesi ? 'tasfiye ertesi' : w !== wOnce ? (w > (wOnce || 0) ? 'rejim girişi' : 'rejim çıkışı') : 'ay başı dengesi';
        btcIslemler.push({ t, yon: d > 0 ? 'alım' : 'satım', fiyat: btcB.open, miktar: d, nominalPay: Math.abs(d) * btcB.open / T_ac, sebep });
        btc = CK ? btc + d : hedef;
      }
    }
    if (TB) {
      const hed = TB.agirlik(t, i) || new Map();
      for (const s of new Set([...TB.tq.keys(), ...hed.keys()])) {
        const b = bar(s, t);
        if (!b) { if (hed.get(s)) TB.dusen.add(s); TB.wOnce.set(s, 0); continue; }
        const ws = TB.dusen.has(s) ? 0 : (hed.get(s) || 0);
        const wo = TB.wOnce.get(s);
        if (i === 0 || ws !== wo || tasfiyeErtesi || (ws > 0 && ay !== ayOnce)) {
          const q0 = TB.tq.get(s) || 0;
          const hedefQ = ws * T_ac / b.open;
          const d = hedefQ - q0;
          if (Math.abs(d) > 1e-15) {
            const sm = Math.abs(d) * b.open * spotMal; nakit -= d * b.open + sm; st.spotUcret += sm;
            const sebep = i === 0 ? 'başlangıç' : tasfiyeErtesi ? 'tasfiye ertesi' : ws !== wo ? (ws > (wo || 0) ? 'rejim girişi' : 'rejim çıkışı') : 'ay başı dengesi';
            TB.islemler.push({ t, s, yon: d > 0 ? 'alım' : 'satım', fiyat: b.open, miktar: d, nominalPay: Math.abs(d) * b.open / T_ac, sebep });
            TB.tq.set(s, hedefQ);
          }
        }
        TB.wOnce.set(s, ws);
      }
    }
    wOnce = w; ayOnce = ay; tasfiyeErtesi = false;
    // ── 2. Kol ölçeği ve açılış dengesi (taban = tüm hesap dünkü kapanış özsermayesi) ──
    const F_taban = oncekiT;
    const olcek = new Map();
    const ED = don.egri.get(t - GUN);
    const dOlay = don.olaylar.get(t) || [];
    const dDegisen = new Set(dOlay.map(o => o.s));
    if (F_taban > 0) {
      const sD = m * F_taban * wD[i] / ED;
      const dS = new Set([...dDegisen]);
      for (const [k] of c) if (k[0] === 'D') dS.add(k.slice(2));
      for (const [k] of u) if (k[0] === 'D') dS.add(k.slice(2));
      for (const s of dS) olcek.set('D|' + s, sD);
      const aktif = dcaGun.get(t) || [];
      for (const j of aktif) { const E = segler[j].oz.get(t - GUN); if (E > 0) olcek.set('C|' + j, m * F_taban * (1 - wD[i]) / aktif.length / E); }
    }
    for (const o of dOlay) c.set('D|' + o.s, (c.get('D|' + o.s) || 0) + o.dq);
    for (const k of new Set([...u.keys(), ...olcek.keys()])) {
      const s = anahtarSembol(k); const b = bar(s, t); if (!b) continue;
      let hedef = (olcek.get(k) || 0) * (c.get(k) || 0);
      const mevcut = u.get(k) || 0;
      if (sus.has(k)) { if (Math.abs(c.get(k) || 0) < 1e-15) sus.delete(k); else hedef = 0; }
      const zorunlu = hedef === 0 || mevcut === 0 || (k[0] === 'D' && dDegisen.has(s));
      if (Math.abs(hedef - mevcut) < 1e-12) continue;
      if (!zorunlu && Math.abs(hedef - mevcut) <= bant * Math.abs(hedef)) continue;
      islem(k, hedef - mevcut, b.open);
    }
    const poz1 = netSembol(), nakit1 = nakit;
    // ── 3. DCA dolumları ──
    for (const j of dcaGun.get(t) || []) {
      const ol = segler[j].olaylar.get(t); if (!ol) continue;
      const k = 'C|' + j, sk = olcek.get(k) || 0;
      for (const o of ol) {
        if (FK) {
          const once = c.get(k) || 0;
          if (Math.abs(once) < 1e-15 && o.dq > 0) dealBO.set(k, { bo: o.fiyat, dolum: 1 });
          else if (o.dq > 0 && dealBO.has(k)) dealBO.get(k).dolum++;
        }
        c.set(k, (c.get(k) || 0) + o.dq);
        if (FK && Math.abs(c.get(k)) < 1e-15) dealBO.delete(k);
        if (sk && !sus.has(k)) islem(k, sk * o.dq, o.fiyat);
      }
    }
    const poz2 = netSembol();
    // ── 3b. Felaket stopu tetikleri (net pozisyon, seviye t−1 verisinden) ──
    stopF = new Map();
    if (FK) {
      const net = new Map(poz2);
      if (FK.btc && btc > 0) net.set(BTC, (net.get(BTC) || 0) + btc);
      for (const [s, q] of net) {
        if (Math.abs(q) < 1e-12) continue;
        const b = bar(s, t), a = b && atrY(s, t); if (!a) continue;
        if (q > 0) {
          let sv = a.capa * (1 - FK.k * a.atr);
          for (const [k, d] of dealBO) if (d.dolum < 7 && !sus.has(k) && anahtarSembol(k) === s) sv = Math.min(sv, d.bo * DCA_TABAN - a.atr * a.capa);
          if (sv > 0 && b.low <= sv) stopF.set(s, Math.min(b.open, sv));
        } else {
          const sv = a.capa * (1 + FK.k * a.atr);
          if (b.high >= sv) stopF.set(s, Math.max(b.open, sv));
        }
      }
    }
    // ── 4. Kötümser gün içi ──
    const btcLow = stopF.has(BTC) && FK && FK.btc ? stopF.get(BTC) : btcB.low;
    const k1 = kotumser(nakit1, poz1, t), k2 = kotumser(nakit, poz2, t);
    if (TEM_MMR && btc > 0) { const tm = TEM_MMR * btc * btcLow; k1.mm += tm; k2.mm += tm; k1.N += btc * btcLow; k2.N += btc * btcLow; }
    let MB1 = k1.E + h * btc * btcLow, MB2 = k2.E + h * btc * btcLow;
    if (TB) { const tt = tabanDeger(TB, s => bar(s, t).low, h); MB1 += tt; MB2 += tt; }
    const r1 = k1.mm > 0 ? MB1 / k1.mm : Infinity, r2 = k2.mm > 0 ? MB2 / k2.mm : Infinity;
    const kot = r1 < r2 ? { ...k1, r: r1 } : { ...k2, r: r2 };
    if (kot.r < st.enDusukTampon) { st.enDusukTampon = kot.r; st.tamponGun = t; }
    let tasfiye = false;
    if (MB1 < k1.mm || MB2 < k2.mm) {
      tasfiye = true;
      const kk = MB1 < k1.mm ? k1 : k2;
      nakit = Math.max(0, kk.mm - TASFIYE_UCRETI * kk.N); btc = 0;
      if (TB) for (const s of TB.tq.keys()) TB.tq.set(s, 0);
      for (const k of u.keys()) u.set(k, 0);
      if (CK) giris.clear();
      st.tasfiye.push({ t, mm: kk.mm, F: oncekiT });
      tasfiyeErtesi = true;
    }
    const gunIci = TB
      ? (Math.min(k1.E, k2.E) + btc * btcLow + tabanDeger(TB, s => bar(s, t).low)) / oncekiT - 1
      : (Math.min(k1.E, k2.E) + btc * btcLow) / oncekiT - 1;
    if (FK && !tasfiye) {
      for (const [s, f] of stopF) {
        for (const [k, q] of u) if (q && anahtarSembol(k) === s) { islem(k, -q, f); sus.add(k); }
        if (s === BTC && FK.btc && btc > 0) {
          const sm = btc * f * spotMal; nakit += btc * f - sm; st.spotUcret += sm;
          btcIslemler.push({ t, yon: 'satım', fiyat: f, miktar: -btc, nominalPay: null, sebep: 'felaket stopu' });
          btc = 0; btcSus = true;
        }
        ft.tetik.push({ t, s, f });
      }
    }
    // ── 5. Funding, kapanış ──
    for (const [k, q] of u) {
      if (!q) continue; const s = anahtarSembol(k); const b = bar(s, t); if (!b) continue;
      const f = seri.get(s).fon.get(t) || 0; if (f) { const o = q * b.close * f; nakit -= o; st.fon += o; }
    }
    if (TEM_FON && btc > 0) { const o = btc * btcB.close * TEM_FON / 365; nakit -= o; st.fon += o; }
    for (const [s, x] of seri) { const j = x.indeks.get(t); if (j != null) sonKap.set(s, x.m[j].close); }
    if (CK) {
      // Otomatik çevrim (ablasyon): eksi USDT cüzdanı kadar BTC × (1 + 0,025) satılır.
      let w = cuzdanUsdt();
      if (CK.otomatikCevrim && w < 0 && btc > 0) {
        const f = sonKap.get(BTC); const q = Math.min(btc, -w * (1 + CK.tampon) / f);
        btc -= q; nakit += q * f / (1 + CK.tampon); ck.cevrim++; ck.cevrimBtc += q * f;
        w = cuzdanUsdt();
      }
      const Tg = nakit + btc * sonKap.get(BTC) + pozDegeri(s => sonKap.get(s));
      if (Tg > 0 && w / Tg < ck.enEksiPay) { ck.enEksiPay = w / Tg; ck.enEksiT = t; }
    }
    const Tt = TB
      ? nakit + btc * sonKap.get(BTC) + tabanDeger(TB, s => sonKap.get(s)) + pozDegeri(s => sonKap.get(s))
      : nakit + btc * sonKap.get(BTC) + pozDegeri(s => sonKap.get(s));
    if (!tasfiye && gunIci < st.enKotuGunIci) { st.enKotuGunIci = gunIci; st.enKotuGunIciT = t; }
    if (tasfiye) { st.enKotuGunIci = Math.min(st.enKotuGunIci, Tt / oncekiT - 1); st.enKotuGunIciT = t; }
    const gk = Tt / oncekiT - 1; if (gk < st.enKotuGun) { st.enKotuGun = gk; st.enKotuGunT = t; }
    if (TB) gunluk.push({ t, gk, gunIci, w, brut: kot.N / Math.max(oncekiT, 1e-9), tabanPay: tabanDeger(TB, s => sonKap.get(s)) / Math.max(Tt, 1e-9) });
    else gunluk.push({ t, gk, gunIci, w, brut: kot.N / Math.max(oncekiT, 1e-9) });
    egri.push({ time: t, oz: Math.max(Tt, 1e-9) });
    oncekiT = Tt;
    if (Tt <= sermaye * 1e-6) st.bitti = true;
  }
  if (FK) st.felaket = ft;
  if (CK) st.cekilebilir = ck;
  if (TB) return { egri: [{ time: ts[0] - GUN, oz: sermaye }, ...egri], st, gunluk, btcIslemler, tabanIslemler: TB.islemler };
  return { egri: [{ time: ts[0] - GUN, oz: sermaye }, ...egri], st, gunluk, btcIslemler };
}

/** Taban sepeti değeri Σ (k ×) q × fiyat — soldan sağa, 0'dan başlayarak (tek üyede BTC ifadesiyle aynı kayan nokta sırası: (k × q) × f). */
function tabanDeger(TB, fiyat, k = 1) {
  let v = 0;
  for (const [s, q] of TB.tq) if (q) v += k === 1 ? q * fiyat(s) : k * q * fiyat(s);
  return v;
}

/**
 * YALNIZ BTC AYAĞI — Pine betiğinin AYNISI (kolsuz, %100 özsermaye, giriş/çıkış
 * ertesi gün açılışında, her yönde %0,12 maliyet; ay başı dengesi YOK çünkü
 * %100'de dengelenecek bir şey yok). Pine `percent_of_equity 100` ile aynı.
 */
function btcAyagi({ maliyet = SPOT_MALIYET } = {}) {
  const { seri, ts, wMap } = veriYukle();
  const x = seri.get(BTC);
  let nakit = 1, adet = 0;
  const egri = [{ time: ts[0] - GUN, oz: 1 }], islemler = [];
  for (const t of ts) {
    const b = x.m[x.indeks.get(t)];
    const w = wMap.get(t) || 0;
    if (w && !adet) { adet = nakit / (b.open * (1 + maliyet)); const u = adet * b.open * maliyet; islemler.push({ t, yon: 'alım', fiyat: b.open, miktar: adet, ucret: u }); nakit = 0; }
    else if (!w && adet) { const n = adet * b.open; islemler.push({ t, yon: 'satım', fiyat: b.open, miktar: -adet, ucret: n * maliyet }); nakit = n * (1 - maliyet); adet = 0; }
    egri.push({ time: t, oz: nakit + adet * b.close });
  }
  return { egri, islemler };
}

/** BTC al-tut (spot, ilk gün açılışta %0,1 komisyonla alım — portfoySim spot kipiyle aynı). */
function alTut() {
  const { seri, ts } = veriYukle();
  const x = seri.get(BTC);
  const ilk = x.m[x.indeks.get(ts[0])];
  const adet = 1 / (ilk.open * (1 + 0.001));
  return { egri: [{ time: ts[0] - GUN, oz: 1 }, ...ts.map(t => ({ time: t, oz: adet * x.m[x.indeks.get(t)].close }))] };
}

// ═══ 5. METRİKLER ═════════════════════════════════════════════════════════════
function yillik(egri) {
  const y = {}; let o = egri[0].oz;
  for (const x of egri) { const a = new Date(x.time).getUTCFullYear(); if (!y[a]) y[a] = { b: o }; y[a].s = x.oz; o = x.oz; }
  return Object.entries(y).map(([yil, v]) => ({ yil: +yil, getiri: v.s / v.b - 1 }));
}

const getiriler = (e) => e.slice(1).map((x, i) => x.oz / e[i].oz - 1);

/** Eşli durağan bootstrap P(strateji > BTC al-tut) — altut-asama7.js ile aynı ayar (b 20, N 2000, tohum 99). */
function bootstrapP(r, rB, { N = 2000 } = {}) {
  const O = require('../risk/olcum');
  const satir = r.map((x, i) => [x, rB[i]]);
  const k = O.duraganBootstrap(satir, { b: 20, N, H: satir.length, tohum: 99, olc: (yol) => { let a = 1, c = 1; for (const [p, q] of yol) { a *= 1 + p; c *= 1 + q; } return a > c ? 1 : 0; } });
  return k.reduce((x, y) => x + y, 0) / k.length;
}

function metrikler(egri, { gunIci = null, gunIciT = null, tasfiye = null, P = null } = {}) {
  const S = require('./portfoySim');
  const tum = S.metrik(egri), hol = S.metrik(egri, HOL);
  const r = getiriler(egri);
  let mn = Infinity, mt = null; r.forEach((x, i) => { if (x < mn) { mn = x; mt = egri[i + 1].time; } });
  return { cagr: tum.cagr, holdout: hol.cagr, maxDD: tum.maxDD, sharpe: tum.sharpe, vol: tum.vol, toplam: tum.toplam, enUzunSuAltiGun: tum.enUzunSuAltiGun,
    enKotuGun: mn, enKotuGunT: mt, enKotuGunIci: gunIci, enKotuGunIciT: gunIciT, tasfiye, P };
}

const gunStr = (t) => new Date(t).toISOString().slice(0, 10);
const egriDuz = (e) => e.map(x => ({ t: gunStr(x.time), oz: +(x.oz / e[0].oz).toFixed(6) }));

/**
 * Bir stratejinin tam sonucu.
 * @param btcPay  1 (Hücum) | 0,5 (Denge) | herhangi bir pay
 * @param bootstrap  true → P(>BTC) hesaplanır (~1 sn)
 * @returns { btcPay, egri, btcAyagi, kol, alTut (eğriler [{t, oz}], başlangıç 1),
 *            metrik, metrikBtcAyagi, metrikKol, metrikAlTut, yillik{strateji, btcAyagi, kol, alTut},
 *            btcIslemler, gecisler, donem, icerideGun }
 */
function bindirmeSonuc({ btcPay = 1, bootstrap = false, h = H_VARS, sermaye = 100000 } = {}) {
  const v = veriYukle();
  const E = simule({ btcPay, h, sermaye });
  const kol = simule({ btcPay, h, sermaye, btcVar: false });
  const bA = btcAyagi(), aT = alTut();
  const rB = getiriler(aT.egri);
  const P = (e) => (bootstrap ? bootstrapP(getiriler(e), rB) : null);
  const gecisler = ogcGecisler(v.bm, { bas: v.ts[0] }).filter(g => g.uygulama <= v.ts[v.ts.length - 1] + GUN);
  return {
    btcPay,
    donem: { bas: gunStr(v.ts[0]), bit: gunStr(v.ts[v.ts.length - 1]), gun: v.ts.length, holdoutBas: gunStr(HOL) },
    icerideGun: v.ts.filter(t => v.wMap.get(t)).length,
    egri: egriDuz(E.egri), btcAyagi: egriDuz(bA.egri), kol: egriDuz(kol.egri), alTut: egriDuz(aT.egri),
    metrik: metrikler(E.egri, { gunIci: E.st.enKotuGunIci, gunIciT: E.st.enKotuGunIciT, tasfiye: E.st.tasfiye.length, P: P(E.egri) }),
    metrikBtcAyagi: metrikler(bA.egri, { P: P(bA.egri) }),
    metrikKol: metrikler(kol.egri, { gunIci: kol.st.enKotuGunIci, gunIciT: kol.st.enKotuGunIciT, tasfiye: kol.st.tasfiye.length }),
    metrikAlTut: metrikler(aT.egri),
    marj: { enDusukTampon: E.st.enDusukTampon, tamponGun: E.st.tamponGun, teminatOrani: h, ucret: E.st.ucret, spotUcret: E.st.spotUcret, funding: E.st.fon },
    yillik: { strateji: yillik(E.egri), btcAyagi: yillik(bA.egri), kol: yillik(kol.egri), alTut: yillik(aT.egri) },
    btcIslemler: E.btcIslemler.map(x => ({ ...x, tarih: gunStr(x.t) })),
    btcAyagiIslemler: bA.islemler.map(x => ({ ...x, tarih: gunStr(x.t) })),
    gecisler: gecisler.map(g => ({ ...g, kararTarihi: gunStr(g.karar), uygulamaTarihi: gunStr(g.uygulama) })),
    _ham: { egri: E.egri, gunluk: E.gunluk },
  };
}

/**
 * BACKTEST SONUÇ KUTUSU — botun tamamı (kol ×3 dahil) bir tarih aralığında.
 * Tam dönem simülasyonu bir kez koşulur (btcPay başına önbellek), eğriler
 * [bas, bit] aralığına kesilip 1'e normalleştirilir. Aralık PIT arşivin
 * (2020-09-04 → kol önbelleğinin sonu) dışına taşarsa kırpılır ve `kapsam.not`
 * bunu söyler.
 * @param bas, bit  ms (UTC gün)
 */
const _aralikOnbellek = new Map();
function bindirmeAralik({ btcPay = 1, bas = -Infinity, bit = Infinity } = {}) {
  const v = veriYukle();
  const arsivBas = v.ts[0], arsivBit = v.ts[v.ts.length - 1];
  let tam = _aralikOnbellek.get(btcPay);
  if (!tam) {
    tam = { E: simule({ btcPay }), bA: btcAyagi(), aT: alTut() };
    _aralikOnbellek.set(btcPay, tam);
  }
  const b = Math.max(bas, arsivBas - GUN), e = Math.min(bit, arsivBit);
  const notlar = [];
  if (bas < arsivBas - GUN) notlar.push(`Seçilen başlangıç ${gunStr(bas)} arşivin dışında: botun tamamı (15 coinlik PIT kol) ancak ${gunStr(arsivBas - GUN)}'ten ölçülebiliyor — bu kutu oradan başlar.`);
  if (bit > arsivBit + GUN) notlar.push(`Kol verisi ${gunStr(arsivBit)}'te bitiyor (önbellek: ONBELLEK=1 node scripts/capraz-marj-sim.js ile tazelenir) — bu kutu orada biter.`);
  const kes = (egri) => { const x = egri.filter(p => p.time >= b && p.time <= e); return x.length ? x.map(p => ({ time: p.time, oz: p.oz / x[0].oz })) : []; };
  const eS = kes(tam.E.egri), eB = kes(tam.bA.egri), eA = kes(tam.aT.egri);
  const kapsam = { istenenBas: Number.isFinite(bas) ? gunStr(bas) : null, istenenBit: Number.isFinite(bit) ? gunStr(bit) : null,
    bas: eS.length ? gunStr(eS[0].time) : null, bit: eS.length ? gunStr(eS[eS.length - 1].time) : null, arsivBas: gunStr(arsivBas - GUN), arsivBit: gunStr(arsivBit), not: notlar };
  if (eS.length < 30) return { btcPay, kapsam: { ...kapsam, not: [...notlar, 'Seçilen aralık arşivle 30 günden az örtüşüyor — botun tamamı bu aralıkta ölçülemiyor.'] }, yok: true };
  const gun = tam.E.gunluk.filter(g => g.t > eS[0].time && g.t <= e);
  let gi = 0, giT = null; for (const g of gun) if (g.gunIci < gi) { gi = g.gunIci; giT = g.t; }
  const tasfiye = tam.E.st.tasfiye.filter(x => x.t > eS[0].time && x.t <= e).length;
  return {
    btcPay, kapsam,
    strateji: { egri: egriDuz(eS), metrik: metrikler(eS, { gunIci: gi, gunIciT: giT, tasfiye }), yillik: yillik(eS) },
    btcAyagi: { egri: egriDuz(eB), metrik: metrikler(eB), yillik: yillik(eB) },
    alTut: { egri: egriDuz(eA), metrik: metrikler(eA), yillik: yillik(eA) },
  };
}

module.exports = {
  bindirmeAralik,
  STRATEJILER, AL_TUT_KAYIT, ogcDurum, ogcGecisler, smaDizi, bindirmeSonuc, simule, btcAyagi, alTut, yillik, metrikler,
  veriVarMi, veriYukle, BTC, HOL, GUN, KOL_M,
  bootstrapP, getiriler, REJIM, BAS,   // PLAN-GOMLEK ölçüm betikleri için (yalnız dışa aktarım)
  /** Süreç önbelleğini düşür (kol önbelleği / market.db yenilendi — lib/veri/orkestrator.js çağırır). */
  onbellekTemizle: () => { _veri = null; _aralikOnbellek.clear(); try { require('./pitVeri').onbellekTemizle(); } catch (e) { /* yok */ } },
  KAYIT_DONEM,
  _ic: { aralikOnbellekBoyutu: () => _aralikOnbellek.size, aralikOnbellekDoldur: () => _aralikOnbellek.set(-1, {}) },
};
