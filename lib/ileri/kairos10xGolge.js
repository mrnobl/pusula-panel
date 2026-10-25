/**
 * İLERİ GÖLGE — KAIROS 10× GÖLGE HESABI (74.9, kullanıcı isteği 2026-10-25: "10× kaldıraçla demo testi açalım; çalışan Kairos'tan
 * işlemleri kopyalayıp yandan test verilerini hesaplayalım" → seçenek "Gölge hesap": EMİR YOK, yalnız hesap).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * KAYNAK (YALNIZ OKUNUR — bu modül oraya hiçbir şey yazmaz; öz test dosya özetiyle kanıtlar):
 *   · <veri>/live/hucum-demo/ozsermaye.jsonl  — Kairos demo botunun günlük özsermaye satırı (gün başına SON satır)
 *   · <veri>/live/hucum-demo/islemler.jsonl   — botun dolumları (kol etiketiyle: BTC ayağı / Donchian / DCA / acil)
 *   · <veri>/live/hucum-demo/bindirme-bot.json — yalnız `sermayeAkislari` (panelden kaydedilen para yatırma/çekme)
 *   · <veri>/live/hesap-islemleri.jsonl        — demo hesabın (hesap 'testnet') funding ödemeleri
 *   · mumlar: Binance USDⓈ-M genel API (anahtarsız; diğer gölgelerle aynı yol — hucumSGolge.gercekAg). Borsaya EMİR / AYAR YOK.
 * BAŞLANGIÇ: demo kabul Gün 0'ı (lib/ileri/demoKabulOzet GUN0_TABAN = 2026-10-07 ve sonrasındaki ilk özsermaye satırı).
 * KAIROS DEĞERİ = demo kabulle aynı "bot değeri" (lib/live/islemGecmisi.botSermayesiTabani): tavan₀ + (E − E₀) − akışlar.
 *
 * DÖNÜŞÜM (kopya defter):
 *   Botun bütün dolumları baştan işlenir; iki ayak ayrı tutulur — bt (BTC ayağı, O-GC trend) ve kol (Donchian + DCA).
 *   Ayak değeri R = nakit akışı (−miktar × fiyat − ücret) + funding payı + Σ miktar × fiyat. Acil durdurma dolumu o sembolde iki
 *   ayağa pozisyon payıyla bölünür; botun olmayan dolum (elle / yabancı) ve sahipsiz funding hiçbir ayağa yazılmaz (artığa düşer).
 *   Funding ödemesi o anki |pozisyon| payıyla ayaklara bölünür (kol payı ölçeklenir — "gerçek oranlarla").
 *   ARTIK = Kairos'un gerçek değişimi − (ΔR_bt + ΔR_kol): defterin açıklayamadığı kısım (demo/prod fiyat farkı, kayıt saati, eksik
 *   ücret…). Artık ÖLÇEKLENMEZ.
 *   GÖLGE (bölüm başına):  G = G₀ + k × [ ΔR_bt + f × ΔR_kol + ΔARTIK ],   f = m / 3 (m = 10 → 10/3), ilk bölümde G₀ = Kairos₀, k = 1.
 *   ⇒ m = 3 iken G ≡ Kairos (MUTABAKAT — öz test ve kuru hesap bunu birebir denetler).
 *   Aynı başlangıç sermayesi; BTC ayağı AYNEN; kolun miktarları, ücretleri ve funding payı 10/3 ile büyür. Gölge Kairos'un
 *   pozisyonlarını kopyalar — kendi özsermayesine göre yeniden boyutlamaz (kopya hesap tanımı).
 *
 * GÜN İÇİ KÖTÜMSER DEĞER (lib/research/bindirme.js simule() §4 ile aynı yaklaşım): günün iki durumu — gün başı (önceki kaydın
 *   pozisyonları) ve gün sonu (gün içi DCA dolumlarından sonra) — uzun pozisyonlar günün LOW'unda, kısalar HIGH'ında, AYNI ANDA.
 *   Gün içi = min(iki durum) / önceki gün değeri − 1. Artık gün içinde eklenmez.
 * BAKIM MARJI: kolun her sembol pozisyonuna araştırma simülatörünün SINIF kademeleri (major / büyük alt / alt; aşağıda AYNEN
 *   kopyalandı — öz test lib/research/bindirme.js metniyle karşılaştırır) + lib/venues.maintenanceMargin. BTC ayağı araştırmadaki
 *   gibi TEMİNAT sayılır: bakım marjı doğurmaz, değeri h = 0,95 ile girer (marj bakiyesi = kötümser değer − 0,05 × BTC ayağı).
 *   MARJ TAMPONU = marj bakiyesi / bakım marjı (gün içi iki durumun küçüğü). < 2 → bilgi notu (İleri test kartı ve Genel bakış durumu; Telegram YOK —
 *   Sorun merkezine bağlanmadı: lib/sorunlar.js canlı kümede, bot kodu değişmesin).
 * TASFİYE (araştırmayla tutarlı): tampon < 1 → o gün "tasfiye oldu" (tarih kaydı); hesapta kalan = max(0, bakım marjı − %1,25 ×
 *   kol nominali) (simule: TASFIYE_UCRETI). Sonrası: araştırma simülatörü tasfiye ertesi kalan nakitle devam eder → gölge de DEVAM
 *   EDER: o günün kaydından itibaren yeni bölüm, Kairos'un pozisyonları k = kalan / Kairos değeri oranıyla (BTC ayağı dahil) kopyalanır.
 *   Kalan ≈ 0 ise (başlangıcın milyonda biri) gölge biter, değer sabit kalır.
 *
 * KAYIT <veri>/ileri/kairos-10x/: kayit.jsonl (YALNIZ EKLENİR: `gun` satırı kapanmış her gün bir kez, `tasfiye` ilk kez, `uyari`
 *   tampon < 2 ilk kez) · son.json (panelin okuduğu özet + anlık hesap için defter durumu). Her çalışmada baştan yeniden hesaplanır;
 *   kayıtlı günün imzası değişirse `degisen` (UYARI, kayıt değişmez). Ara raporda hüküm yok — yalnız betimleme.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yollar = require('../yollar');
const I = require('./bollingerIzleme');
const DK = require('./demoKabulOzet');

const M_GOLGE = 10;
const KOL_M = 3;
const H = 0.95;                       // bindirme.js H_VARS (BTC teminat oranı)
const TASFIYE_UCRETI = 0.0125;        // bindirme.js TASFIYE_UCRETI
const UYARI_TAMPON = 2;
const BAS = DK.GUN0_TABAN;            // demo kabul Gün 0 tabanı (2026-10-07)
const KABUL_SONU = '2026-12-09';      // demo kabul hüküm günü (bilgi; bu gölge kabule girmez)
const GUN = 864e5;
const BTC = 'BTC/USDT:USDT';

const gn = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / GUN);
const gs = (g) => new Date(g * GUN).toISOString().slice(0, 10);
const sha = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);
const yuv = (x, b = 8) => (Number.isFinite(x) ? Math.round(x * 10 ** b) / 10 ** b : null);
const okuJ = (p, v = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return v; } };
function yazJ(p, o) { fs.mkdirSync(path.dirname(p), { recursive: true }); const t = `${p}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o), 'utf8'); fs.renameSync(t, p); }

/* ═══ KADEMELER — lib/research/bindirme.js §3 SINIF / BUYUK_ALT AYNEN (canlı kümede; dışa aktarmadığı için kopya, öz test metinle karşılaştırır) ═══ */
const T = (rows) => rows.map(([cap, mmr, lev]) => ({ maxNotional: cap, maintenanceMarginRate: mmr, maxLeverage: lev }));
const SINIF = {
  major: T([[3e5, 0.004, 125], [8e5, 0.005, 100], [3e6, 0.0065, 75], [12e6, 0.01, 50], [70e6, 0.02, 25], [1e8, 0.025, 20], [2.3e8, 0.05, 10], [4.8e8, 0.1, 5], [6e8, 0.125, 4], [8e8, 0.15, 3], [1.2e9, 0.25, 2], [Infinity, 0.5, 1]]),
  buyukAlt: T([[1e4, 0.005, 75], [5e4, 0.01, 50], [2.5e5, 0.02, 25], [1e6, 0.025, 20], [2e6, 0.05, 10], [5e6, 0.1, 5], [1e7, 0.125, 4], [2e7, 0.15, 3], [5e7, 0.25, 2], [Infinity, 0.5, 1]]),
  alt: T([[5e3, 0.01, 50], [2.5e4, 0.02, 25], [1e5, 0.025, 20], [2.5e5, 0.05, 10], [1e6, 0.1, 5], [2.5e6, 0.125, 4], [5e6, 0.15, 3], [1e7, 0.25, 2], [Infinity, 0.5, 1]]),
};
const BUYUK_ALT = new Set(['BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'LINK', 'LTC', 'DOT', 'AVAX', 'BCH', 'ETC', 'TRX', 'MATIC', 'ATOM', 'UNI', 'FIL', 'EOS', 'NEAR', 'XLM', 'SUI', 'AAVE', 'APT', 'ARB', 'OP']);
function kademeler(s) { const b = s.split('/')[0]; if (b === 'BTC' || b === 'ETH') return SINIF.major; return BUYUK_ALT.has(b) ? SINIF.buyukAlt : SINIF.alt; }
const bakimMarji = (s, N) => require('../venues').maintenanceMargin(kademeler(s), N);

/* ═══ GİRDİ NORMALLEŞTİRME (saf) ═══ */
/** 'HYPE/USDT' · 'HYPE/USDT:USDT' · 'BTC/USDT (spot)' → 'HYPE/USDT:USDT' (perp birleşik ad). */
function sembol(s) { const t = String(s || '').replace(' (spot)', '').trim(); if (!t) return null; return t.includes(':') ? t : `${t}:USDT`; }
/** Kol adı (islemGecmisi.KOL) → ayak. */
function ayak(kol) {
  if (kol === 'BTC ayağı') return 'bt';
  if (kol === 'Donchian' || kol === 'DCA') return 'kol';
  if (/^acil/.test(String(kol || ''))) return 'acil';
  return 'diger';
}
/** ozsermaye.jsonl satırları → gün başına SON satır, gün ≥ BAS, özsermaye > 0 (demoKabulOzet.ozet ile aynı kural). */
function gunlukOzsermaye(satirlar, bas = BAS) {
  const g = new Map();
  for (const k of satirlar || []) {
    const gun = k.gun || (k.zaman ? new Date(typeof k.zaman === 'number' ? k.zaman : Date.parse(k.zaman)).toISOString().slice(0, 10) : null);
    if (gun && gun >= bas && Number(k.ozsermaye) > 0) g.set(gun, { ...k, gun });
  }
  return [...g.values()].sort((a, b) => (a.gun < b.gun ? -1 : 1));
}
/** islemler.jsonl ham satırları → IslemGecmisi görünüm satırları (borsa kaydı varsa gerçek fiyat/ücret). YAZMAZ (dizinsiz örnek). */
function dolumlariCoz(hamSatirlar) {
  const { IslemGecmisi } = require('../live/islemGecmisi');
  const g = new IslemGecmisi(null);                 // dizin yok → dosyaya hiçbir şey yazılamaz
  for (const k of hamSatirlar || []) g._bellege(k);  // yalnız belleğe (kurucunun okuma yolu ile aynı)
  return g.satirlar().map(s => ({ zaman: +s.zaman, symbol: sembol(s.symbol), side: s.side, miktar: +s.miktar, fiyat: +s.fiyat, ucret: Number.isFinite(+s.ucret) && s.ucret != null ? +s.ucret : 0, kol: s.kol }))
    .filter(s => Number.isFinite(s.zaman) && s.symbol && s.miktar > 0 && s.fiyat > 0);
}

/* ═══ KOPYA DEFTER ═══ */
class Defter {
  constructor(d) {
    const x = d || {};
    this.q = { bt: { ...(x.q && x.q.bt) }, kol: { ...(x.q && x.q.kol) } };
    this.nakit = { bt: 0, kol: 0, ...(x.nakit || {}) };
    this.fon = { bt: 0, kol: 0, ...(x.fon || {}) };
    this.disarida = { dolum: 0, fon: 0, ...(x.disarida || {}) };
  }
  durum() { return JSON.parse(JSON.stringify({ q: this.q, nakit: this.nakit, fon: this.fon, disarida: this.disarida })); }
  _dolum(L, s, dq, fiyat, ucret) { this.nakit[L] -= dq * fiyat + ucret; this.q[L][s] = (this.q[L][s] || 0) + dq; if (Math.abs(this.q[L][s]) < 1e-12) delete this.q[L][s]; }
  dolum(d) {
    const dq = d.side === 'buy' ? d.miktar : -d.miktar;
    const A = ayak(d.kol);
    if (A === 'bt' || A === 'kol') return this._dolum(A, d.symbol, dq, d.fiyat, d.ucret || 0);
    if (A === 'acil') {
      const qb = this.q.bt[d.symbol] || 0, qk = this.q.kol[d.symbol] || 0, top = qb + qk;
      if (Math.abs(top) > 1e-12 && Math.sign(top) !== Math.sign(dq)) {
        const pb = qb / top, pk = qk / top;   // azaltan acil dolum: pozisyon payıyla
        if (pb) this._dolum('bt', d.symbol, dq * pb, d.fiyat, (d.ucret || 0) * pb);
        if (pk) this._dolum('kol', d.symbol, dq * pk, d.fiyat, (d.ucret || 0) * pk);
        return;
      }
    }
    this.disarida.dolum++;                       // elle / yabancı / pozisyonsuz acil → artığa
  }
  funding(f) {
    const s = f.symbol, qb = Math.abs(this.q.bt[s] || 0), qk = Math.abs(this.q.kol[s] || 0), top = qb + qk;
    if (!(top > 1e-12)) { this.disarida.fon += f.tutar; return; }
    this.fon.bt += f.tutar * qb / top; this.fon.kol += f.tutar * qk / top;
  }
  /** Ayak değeri; fiyatFn(s, q) → fiyat (null → bilinmiyor; hata). */
  deger(L, fiyatFn) {
    let v = this.nakit[L] + this.fon[L];
    for (const [s, q] of Object.entries(this.q[L])) { const p = fiyatFn(s, q); if (!(p > 0)) throw Object.assign(new Error(`${s} fiyatı yok`), { eksikSembol: s }); v += q * p; }
    return v;
  }
  semboller() { return [...new Set([...Object.keys(this.q.bt), ...Object.keys(this.q.kol)])]; }
}

/**
 * Bir durumun kötümser değerlemesi + marj. `ref` = { Rbt, Rkol, G } önceki kayıt; `seg` = { k, f }.
 * @returns { V, MB, MM, N, tampon }
 */
function kotumserDurum(defter, ref, seg, fiyatKot) {
  const net = (s) => seg.k * ((defter.q.bt[s] || 0) + seg.f * (defter.q.kol[s] || 0));
  const fk = (s) => fiyatKot(s, net(s));
  const Vbt = defter.deger('bt', fk), Vkol = defter.deger('kol', fk);
  const V = ref.G + seg.k * ((Vbt - ref.Rbt) + seg.f * (Vkol - ref.Rkol));
  let teminatKesinti = 0, MM = 0, N = 0;
  for (const [s, q] of Object.entries(defter.q.bt)) if (q > 0) teminatKesinti += (1 - H) * seg.k * q * fk(s);
  for (const [s, q] of Object.entries(defter.q.kol)) { const n = Math.abs(seg.k * seg.f * q) * fk(s); N += n; MM += bakimMarji(s, n); }
  const MB = V - teminatKesinti;
  return { V, MB, MM, N, tampon: MM > 0 ? MB / MM : null };
}

/**
 * SAF HESAP. Girdiler bellekte (öz test sahte dünya verir; calistir dosyalardan okur).
 * @param o.ozs gunlukOzsermaye çıktısı [{gun, zaman, ozsermaye, ozsermayeCap}] (ilk satır = Gün 0)
 * @param o.akislar sermayeAkislari [{zaman, tutar}]
 * @param o.dolumlar [{zaman, symbol, side, miktar, fiyat, ucret, kol}] (TÜM geçmiş — Gün 0 öncesi açılışlar dahil)
 * @param o.funding [{zaman, symbol, tutar}]
 * @param o.mumlar Map(symbol → Map(gun → {open, high, low, close}))
 * @param o.m hedef kol çarpanı (10) · o.uygulaTasfiye (true) · o.sonGun (dahil; varsayılan son özsermaye günü)
 * @returns { gunler, ozet, durum (son günün defter durumu + bölüm), eksik }
 */
function hesapla({ ozs, akislar = [], dolumlar = [], funding = [], mumlar, m = M_GOLGE, kolM = KOL_M, uygulaTasfiye = true, sonGun = null, btcSembol = BTC }) {
  const s0 = (ozs || [])[0];
  if (!s0) return { gunler: [], ozet: null, durum: null, eksik: [{ seri: 'kairos10x:kairos', neden: 'Kairos demo özsermaye kaydı yok (Gün 0 başlamadı)' }] };
  const Tb = require('../live/islemGecmisi').botSermayesiTabani(s0);
  const t0 = +s0.zaman || Date.parse(`${s0.gun}T23:59:59Z`);
  const akisL = (Array.isArray(akislar) ? akislar : []).filter(a => a && Number.isFinite(+a.zaman) && Number.isFinite(+a.tutar));
  const kayit = new Map(ozs.map(x => [x.gun, x]));
  const Kdeger = (x) => { const t = +x.zaman || Date.parse(`${x.gun}T23:59:59Z`); const akis = x === s0 ? 0 : akisL.filter(a => +a.zaman > t0 && +a.zaman <= t).reduce((a, k) => a + +k.tutar, 0); return Tb.deger(Number(x.ozsermaye), akis); };
  const f = m / kolM;
  const olaylar = [...dolumlar.map(d => ({ t: +d.zaman, tur: 'd', d })), ...funding.filter(x => Number.isFinite(+x.tutar) && x.symbol).map(x => ({ t: +x.zaman, tur: 'f', d: { ...x, symbol: sembol(x.symbol), tutar: +x.tutar } }))]
    .filter(e => Number.isFinite(e.t)).sort((a, b) => a.t - b.t || (a.tur === 'f' ? -1 : 1));
  let oi = 0;
  const D = new Defter();
  const ilerle = (t) => { while (oi < olaylar.length && olaylar[oi].t <= t) { const e = olaylar[oi++]; if (e.tur === 'd') D.dolum(e.d); else D.funding(e.d); } };
  const mum = (s, gun) => { const x = mumlar && mumlar.get(s); return x ? x.get(gun) || null : null; };
  const kapanis = (gun) => (s) => { const b = mum(s, gun); return b ? b.close : null; };
  const kot = (gun) => (s, q) => { const b = mum(s, gun); return b ? (q >= 0 ? b.low : b.high) : null; };
  const son = sonGun || ozs[ozs.length - 1].gun;
  const gunler = [], eksik = [];
  let seg = null, onceki = null, bitti = false;
  const B0 = mum(btcSembol, s0.gun);
  for (let g = gn(s0.gun); g <= gn(son); g++) {
    const gun = gs(g);
    const x = kayit.get(gun);
    const T = x && +x.zaman ? +x.zaman : (g + 1) * GUN + 5 * 60e3;
    const X = (g + 1) * GUN;                        // gün sonu (bir sonraki çalışmadan önce)
    try {
      let gunSonu = null;
      if (onceki) {
        // gün başı durumu = önceki kaydın defteri (oncekiDefter); gün sonu = X'e kadar olaylar
        const bas = kotumserDurum(onceki.defter, onceki.ref, seg, kot(gun));
        ilerle(X);
        const sonD = kotumserDurum(D, onceki.ref, seg, kot(gun));
        gunSonu = { bas, son: sonD };
      }
      ilerle(T);
      const Rbt = D.deger('bt', kapanis(gun)), Rkol = D.deger('kol', kapanis(gun));
      const btcK = mum(btcSembol, gun);
      if (!btcK || !B0) throw Object.assign(new Error('BTC mumu yok'), { eksikSembol: btcSembol });
      let K = x ? Kdeger(x) : null;
      if (!seg) {   // Gün 0
        seg = { bas: gun, G0: K, K0: K, Rbt0: Rbt, Rkol0: Rkol, Res0: 0, k: 1, f };
        onceki = null;
      }
      const tahminiK = K == null;
      const RbtD = Rbt - gunler0(gunler, 'Rbt', Rbt), RkolD = Rkol - gunler0(gunler, 'Rkol', Rkol);
      let artik;
      if (K != null) artik = (K - seg0K(gunler, K)) - (RbtD + RkolD);
      else { artik = gunler.length ? gunler[gunler.length - 1].artik : 0; K = seg0K(gunler, 0) + RbtD + RkolD + artik; }
      let G = bitti ? onceki.G : seg.G0 + seg.k * ((Rbt - seg.Rbt0) + f * (Rkol - seg.Rkol0) + (artik - seg.Res0));
      let gunIci = null, tampon = null, tamponAn = null, mm = null, mb = null, tasfiye = null;
      if (gunSonu && !bitti) {
        const a = gunSonu.bas, b = gunSonu.son;
        const ta = a.tampon == null ? Infinity : a.tampon, tb = b.tampon == null ? Infinity : b.tampon;
        const kotu = ta <= tb ? a : b;
        tampon = Number.isFinite(Math.min(ta, tb)) ? Math.min(ta, tb) : null;
        tamponAn = ta <= tb ? 'gün başı' : 'gün sonu';
        mm = kotu.MM; mb = kotu.MB;
        gunIci = Math.min(a.V, b.V) / onceki.G - 1;
        const tasfiyeOlur = (a.MM > 0 && a.MB < a.MM) || (b.MM > 0 && b.MB < b.MM);
        if (tasfiyeOlur) {
          const kk = a.MM > 0 && a.MB < a.MM ? a : b;
          const kalan = Math.max(0, kk.MM - TASFIYE_UCRETI * kk.N);
          tasfiye = { gun, an: kk === a ? 'gün başı' : 'gün sonu', bakimMarji: kk.MM, marjBakiyesi: kk.MB, nominal: kk.N, kalan, oncekiDeger: onceki.G, uygulandi: !!uygulaTasfiye };
          if (uygulaTasfiye) {
            G = kalan;
            gunIci = G / onceki.G - 1;
            if (!(kalan > Tb.sermaye * 1e-6) || !(K > 0)) bitti = true;
            else seg = { bas: gun, G0: kalan, K0: K, Rbt0: Rbt, Rkol0: Rkol, Res0: artik, k: kalan / K, f };
          }
        }
      }
      const kolNom = Object.entries(D.q.kol).reduce((a, [s, q]) => a + Math.abs(q) * (kapanis(gun)(s) || 0), 0);
      const btNom = Object.entries(D.q.bt).reduce((a, [s, q]) => a + q * (kapanis(gun)(s) || 0), 0);
      const satir = { gun, kairos: K, kairosTahmini: tahminiK, golge: G, btc: Tb.sermaye * btcK.close / B0.close, btcGunIci: onceki ? btcK.low / onceki.btcKap - 1 : null,
        gunIci, tampon, tamponAn, bakimMarji: mm, marjBakiyesi: mb, tasfiye, Rbt, Rkol, artik,
        kolNominal: bitti ? 0 : seg.k * f * kolNom, btNominal: bitti ? 0 : seg.k * btNom, kairosKolNominal: kolNom, kairosBtNominal: btNom, k: bitti ? 0 : seg.k, bitti };
      gunler.push(satir);
      onceki = { G, T, defter: new Defter(D.durum()), ref: { Rbt, Rkol, G }, btcKap: btcK.close };   // bir sonraki günün gün başı = bu kayıt
    } catch (e) {
      if (e.eksikSembol) { eksik.push({ seri: 'kairos10x:mum', neden: `${gun}: ${e.eksikSembol.split('/')[0]} günlük mumu yok — yetersiz, sonraki çalışmada` }); break; }
      throw e;
    }
  }
  return { gunler, ozet: ozetle(gunler, Tb.sermaye), durum: gunler.length ? { defter: D.durum(), seg, bitti, sonT: onceki ? onceki.T : null, ref: onceki ? onceki.ref : null, btcKap: onceki ? onceki.btcKap : null } : null, eksik, sermaye: Tb.sermaye, tavanTur: Tb.tur, disarida: D.disarida };
}
// yardımcılar: Gün 0 satırının alanı (ilk satır yoksa verilen varsayılan)
function gunler0(gunler, alan, v) { return gunler.length ? gunler[0][alan] : v; }
function seg0K(gunler, v) { return gunler.length ? gunler[0].kairos : v; }

/** Saf: bir değer serisinin özeti. */
function seriOzet(l, alan, sermaye) {
  const s = l.map(x => x[alan]).filter(Number.isFinite);
  if (!s.length) return null;
  let tepe = s[0], mdd = 0;
  for (const v of s) { tepe = Math.max(tepe, v); mdd = Math.max(mdd, tepe > 0 ? 1 - v / tepe : 0); }
  return { ilk: s[0], son: s[s.length - 1], getiri: s[s.length - 1] / (s[0] || sermaye) - 1, mdd };
}
function ozetle(gunler, sermaye) {
  if (!gunler.length) return null;
  const minBul = (alan) => { let v = null, gun = null; for (const x of gunler) if (Number.isFinite(x[alan]) && (v == null || x[alan] < v)) { v = x[alan]; gun = x.gun; } return v == null ? null : { deger: v, gun }; };
  const tas = gunler.filter(x => x.tasfiye);
  return {
    ilk: gunler[0].gun, son: gunler[gunler.length - 1].gun, gun: gunler.length, sermaye,
    golge: { ...seriOzet(gunler, 'golge', sermaye), enKotuGunIci: minBul('gunIci'), minTampon: minBul('tampon'), tasfiye: tas.length ? tas.map(x => x.tasfiye) : [], bitti: gunler[gunler.length - 1].bitti },
    kairos: seriOzet(gunler, 'kairos', sermaye),
    btc: { ...seriOzet(gunler, 'btc', sermaye), enKotuGunIci: minBul('btcGunIci') },
    artik: { son: gunler[gunler.length - 1].artik, enBuyuk: gunler.reduce((a, x) => Math.max(a, Math.abs(x.artik || 0)), 0) },
  };
}

/* ═══ DOSYALAR ═══ */
const dosyalar = (dizin = I.VARSAYILAN_DIZIN) => { const k = path.join(dizin, 'kairos-10x'); return { kok: k, kayit: path.join(k, 'kayit.jsonl'), son: path.join(k, 'son.json') }; };
const kaynakDosyalari = (o = {}) => {
  const demo = o.demoDizin || yollar.veri('live', 'hucum-demo');
  return { demo, ozsermaye: path.join(demo, 'ozsermaye.jsonl'), islemler: path.join(demo, 'islemler.jsonl'), bot: path.join(demo, 'bindirme-bot.json'),
    hesap: o.hesapDosya || yollar.veri('live', 'hesap-islemleri.jsonl') };
};
/** jsonl okuma — bozuk satır atlanır (kaynak dosyalar botundur; bu modül onları DÜZELTMEZ). */
function jsonlOku(dosya) {
  let metin; try { metin = fs.readFileSync(dosya, 'utf8'); } catch { return []; }
  const out = []; for (const s of metin.split('\n')) { if (!s.trim()) continue; try { out.push(JSON.parse(s)); } catch { /* yarım satır */ } } return out;
}
/** Kaynakları oku (YALNIZ OKUMA). */
function kaynakOku(o = {}) {
  const K = kaynakDosyalari(o);
  const ozs = gunlukOzsermaye(jsonlOku(K.ozsermaye));
  const bot = okuJ(K.bot, {}) || {};
  const dolumlar = dolumlariCoz(jsonlOku(K.islemler));
  const hesapAdi = o.hesapAdi || 'testnet';
  const funding = jsonlOku(K.hesap).filter(x => x && x.tur === 'funding' && x.hesap === hesapAdi).map(x => ({ zaman: +x.zaman, symbol: x.symbol, tutar: +x.tutar }));
  return { ozs, akislar: bot.sermayeAkislari || [], dolumlar, funding, kaynak: K, botMod: bot.mod || null };
}

/* ═══ GÜNLÜK ÇALIŞMA (sunucu: scripts/ileri-izle.js zincirinde) ═══ */
/**
 * @param o.ag { hazirla(), mumlar(s, basMs, simdi) } (test için sahte; varsayılan hucumSGolge.gercekAg — Binance genel API)
 */
async function calistir({ simdi = Date.now(), dizin = I.VARSAYILAN_DIZIN, demoDizin, hesapDosya, ag = null, log = () => {}, sonAn = Infinity } = {}) {
  const F = dosyalar(dizin);
  return I.kilitle(dizin, async () => {
    const t0 = Date.now();
    const zaman = new Date(simdi).toISOString();
    const src = kaynakOku({ demoDizin, hesapDosya });
    const eksik = [], degisen = [];
    const kayit0 = I.satirlariOku(F.kayit);
    const GK = new Map(kayit0.filter(x => x.tur === 'gun').map(x => [x.gun, x]));
    const olaylar = new Set(kayit0.filter(x => x.tur !== 'gun').map(x => x.tur));
    let sonuc = null, kaynak = { mum: { istenen: 0, alinan: 0, hata: [] } };
    if (!src.ozs.length) eksik.push({ seri: 'kairos10x:kairos', neden: 'Kairos demo özsermaye kaydı yok (bu makinede demo bot çalışmıyor ya da Gün 0 başlamadı)' });
    else {
      const gunSon = src.ozs[src.ozs.length - 1].gun;
      const semboller = [...new Set([BTC, ...src.dolumlar.map(d => d.symbol)])];
      const A = ag || require('./hucumSGolge').gercekAg();
      const mumlar = new Map();
      try { await A.hazirla(); } catch (e) { eksik.push({ seri: 'kairos10x:pazar', neden: e.message }); }
      for (const s of semboller) {
        if (Date.now() > sonAn) { eksik.push({ seri: 'kairos10x:sure', neden: 'süre bütçesi doldu — sonraki çalışmada' }); break; }
        kaynak.mum.istenen++;
        try {
          const l = await A.mumlar(s, (gn(src.ozs[0].gun) - 2) * GUN, simdi);
          mumlar.set(s, new Map(l.map(x => [gs(Math.floor(x.time / GUN)), x])));
          kaynak.mum.alinan++;
        } catch (e) { kaynak.mum.hata.push(`${s}: ${e.message}`); }
      }
      sonuc = hesapla({ ozs: src.ozs, akislar: src.akislar, dolumlar: src.dolumlar, funding: src.funding, mumlar, sonGun: gunSon });
      const ref = hesapla({ ozs: src.ozs, akislar: src.akislar, dolumlar: src.dolumlar, funding: src.funding, mumlar, sonGun: gunSon, m: KOL_M, uygulaTasfiye: false });
      eksik.push(...sonuc.eksik);
      // m = 3 mutabakatı (gerçek veri): her kayıtlı günde gölge(m=3) = Kairos
      const mut = ref.gunler.filter(x => !x.kairosTahmini).reduce((a, x) => Math.max(a, Math.abs(x.golge - x.kairos)), 0);
      sonuc.mutabakat = { m3EnBuyukFark: mut, gun: ref.gunler.length };
      sonuc.kairosRef = ref.gunler.map(x => ({ gun: x.gun, tampon: x.tampon, gunIci: x.gunIci, tasfiyeOlurdu: !!x.tasfiye }));
      sonuc.kairosOzet = { enKotuGunIci: ozetle(ref.gunler, ref.sermaye) ? ozetle(ref.gunler, ref.sermaye).golge.enKotuGunIci : null, minTampon: ozetle(ref.gunler, ref.sermaye) ? ozetle(ref.gunler, ref.sermaye).golge.minTampon : null };
    }
    const yeni = [];
    if (sonuc) {
      for (const x of sonuc.gunler) {
        const r = { gun: x.gun, golge: yuv(x.golge, 6), kairos: yuv(x.kairos, 6), btc: yuv(x.btc, 6), tampon: yuv(x.tampon, 4), gunIci: yuv(x.gunIci, 6), tasfiye: !!x.tasfiye };
        r.imza = sha([r.gun, r.golge, r.kairos, r.btc, r.tampon, r.tasfiye]);
        const e = GK.get(x.gun);
        if (e) { if (e.imza !== r.imza) degisen.push({ gun: x.gun, kayit: e.golge, yeniden: r.golge }); continue; }
        const sat = { tur: 'gun', ...r, kayitZamani: zaman, kairosTahmini: !!x.kairosTahmini };
        yeni.push(sat); GK.set(x.gun, sat);
      }
      const t = sonuc.gunler.find(x => x.tasfiye && x.tasfiye.uygulandi);
      if (t && !olaylar.has('tasfiye')) { yeni.push({ tur: 'tasfiye', gun: t.gun, ...t.tasfiye, kayitZamani: zaman }); log('WARN', `Kairos 10× gölge: tasfiye oldu (${t.gun}) — bilgi, emir yok`); }
      const u = sonuc.gunler.find(x => Number.isFinite(x.tampon) && x.tampon < UYARI_TAMPON);
      if (u && !olaylar.has('uyari')) yeni.push({ tur: 'uyari', gun: u.gun, tampon: yuv(u.tampon, 4), kayitZamani: zaman });
    }
    I.ekle(F.kayit, yeni);
    const ozet = { zaman, surum: 1, sureMs: Date.now() - t0, yeniSatir: yeni.length, m: M_GOLGE, kolM: KOL_M, bas: BAS, kabulSonu: KABUL_SONU, uyariTampon: UYARI_TAMPON,
      rapor: sonuc && sonuc.ozet ? { ...sonuc.ozet, kairosRef: sonuc.kairosOzet } : null,
      seri: sonuc ? sonuc.gunler.slice(-400).map(x => ({ gun: x.gun, kairos: yuv(x.kairos, 4), kairosTahmini: x.kairosTahmini || undefined, golge: yuv(x.golge, 4), btc: yuv(x.btc, 4), gunIci: yuv(x.gunIci, 6), tampon: yuv(x.tampon, 3), tamponAn: x.tamponAn, bakimMarji: yuv(x.bakimMarji, 4), kolNominal: yuv(x.kolNominal, 2), btNominal: yuv(x.btNominal, 2), artik: yuv(x.artik, 4), tasfiye: x.tasfiye ? { an: x.tasfiye.an, kalan: yuv(x.tasfiye.kalan, 4) } : undefined })) : [],
      mutabakat: sonuc ? sonuc.mutabakat : null,
      durum: sonuc ? sonuc.durum : null,
      disarida: sonuc ? sonuc.disarida : null,
      kaynak, eksik, degisen, botMod: src.botMod };
    yazJ(F.son, ozet);
    if (degisen.length) log('WARN', `Kairos 10× gölge: ${degisen.length} kayıtlı günün yeniden hesabı farklı — kayıt DEĞİŞMEDİ`);
    return ozet;
  });
}

/* ═══ ANLIK (panel okunduğunda güncel fiyatla) ═══ */
let _fiyatOnbellek = { zaman: 0, anahtar: '', fiyat: null };
async function gercekFiyatlar(semboller) {
  const anahtar = semboller.slice().sort().join(',');
  if (_fiyatOnbellek.fiyat && _fiyatOnbellek.anahtar === anahtar && Date.now() - _fiyatOnbellek.zaman < 60e3) return _fiyatOnbellek.fiyat;
  const b = new (require('ccxt').binanceusdm)({ enableRateLimit: true, timeout: 8000 });
  const t = await b.fetchTickers(semboller);
  const fiyat = new Map(Object.entries(t).map(([s, x]) => [s, +x.last || +x.close || null]));
  _fiyatOnbellek = { zaman: Date.now(), anahtar, fiyat };
  return fiyat;
}
/**
 * Saf: son.json defter durumu + o andan sonraki olaylar + güncel fiyat → anlık gölge / Kairos (tahmini) / BTC.
 * Kairos anlık = son kayıtlı değer + defterle açıklanan değişim (artık eklenmez) — "tahmini".
 */
function anlikHesap(son, { dolumlar = [], funding = [], fiyat, simdi = Date.now() }) {
  const d = son && son.durum, seri = (son && son.seri) || [];
  if (!d || !d.ref || !seri.length || !fiyat) return null;
  const sonS = seri[seri.length - 1];
  const D = new Defter(d.defter);
  const ev = [...dolumlar.filter(x => +x.zaman > d.sonT && +x.zaman <= simdi).map(x => ({ t: +x.zaman, tur: 'd', x })), ...funding.filter(x => +x.zaman > d.sonT && +x.zaman <= simdi).map(x => ({ t: +x.zaman, tur: 'f', x: { ...x, symbol: sembol(x.symbol), tutar: +x.tutar } }))].sort((a, b) => a.t - b.t);
  for (const e of ev) { if (e.tur === 'd') D.dolum(e.x); else D.funding(e.x); }
  const p = (s) => fiyat.get(s) || null;
  let Rbt, Rkol;
  try { Rbt = D.deger('bt', p); Rkol = D.deger('kol', p); } catch (e) { return { hata: `güncel fiyat yok: ${e.eksikSembol || e.message}` }; }
  const seg = d.seg;
  const dBt = Rbt - d.ref.Rbt, dKol = Rkol - d.ref.Rkol;
  const golge = d.bitti ? sonS.golge : sonS.golge + seg.k * (dBt + seg.f * dKol);
  const kairos = sonS.kairos + dBt + dKol;
  const btcP = p(BTC);
  let tampon = null, mm = 0, mb = null;
  if (!d.bitti) {
    const kd = kotumserDurum(D, { Rbt: d.ref.Rbt, Rkol: d.ref.Rkol, G: sonS.golge }, seg, (x) => p(x));
    mm = kd.MM; mb = kd.MB; tampon = kd.tampon;
  }
  return { zaman: simdi, golge, kairos, btc: d.btcKap && btcP ? sonS.btc * btcP / d.btcKap : null, tampon, bakimMarji: mm, marjBakiyesi: mb, yeniOlay: ev.length, tahmini: true };
}

/** GET /api/ileri/kairos-10x: son.json (+ ?anlik=1 → güncel fiyatla anlık; ağ: Binance genel fiyat, 60 sn önbellek). YAZMAZ. */
async function panelVerisi({ dizin = process.env.ILERI_GOLGE_DIZIN || I.VARSAYILAN_DIZIN, anlik = false, fiyatFn = gercekFiyatlar, demoDizin, hesapDosya, simdi = Date.now() } = {}) {
  const s = okuJ(dosyalar(dizin).son);
  const cevap = { success: true, ozet: s ? { ...s, durum: undefined } : null, m: M_GOLGE, kolM: KOL_M, bas: BAS, kabulSonu: KABUL_SONU, uyariTampon: UYARI_TAMPON, anlik: null };
  // ILERI_GOLGE_DIZIN yalnız kılavuz görüntüsü sunucusunda: örnek kayıt + gerçek Kairos dosyası karışmasın → anlık yok
  if (anlik && s && s.durum && !(process.env.ILERI_GOLGE_DIZIN && dizin === process.env.ILERI_GOLGE_DIZIN && !demoDizin)) {
    try {
      const src = kaynakOku({ demoDizin, hesapDosya });
      // son kayıttan sonra açılan pozisyonların da fiyatı gerekir (ör. gün içi DCA girişi)
      const sem = [...new Set([BTC, ...new Defter(s.durum.defter).semboller(), ...src.dolumlar.filter(x => x.zaman > s.durum.sonT && x.zaman <= simdi).map(x => x.symbol)])];
      const fiyat = await fiyatFn(sem);
      const a = anlikHesap(s, { dolumlar: src.dolumlar, funding: src.funding, fiyat, simdi });
      if (a && a.hata) cevap.anlikHata = a.hata; else cevap.anlik = a;
    } catch (e) { cevap.anlikHata = String(e.message || e).slice(0, 200); }
  }
  return cevap;
}

module.exports = {
  M_GOLGE, KOL_M, H, TASFIYE_UCRETI, UYARI_TAMPON, BAS, KABUL_SONU, SINIF, BUYUK_ALT, BTC,
  kademeler, bakimMarji, sembol, ayak, gunlukOzsermaye, dolumlariCoz, Defter, kotumserDurum, hesapla, ozetle, seriOzet,
  dosyalar, kaynakDosyalari, kaynakOku, calistir, anlikHesap, panelVerisi, gn, gs,
};
