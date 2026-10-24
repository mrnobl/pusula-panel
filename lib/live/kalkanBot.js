/**
 * B KALKAN CANLI BOTU — Donchian PIT + DCA PIT, ters-oynaklık birleşim,
 * risk katmanı bağlı. PLAN-ADAYLAR.md "Geliştirme yolu" 2.
 *
 * Ölçülen tanım (scripts/hayatta-kalma.js, DCA_KALDIRAC=1 DCA_OLCEK=2.94):
 *   · EVREN: her ay başı son 30 gün hacmine göre ilk 15 USDT-M perp
 *     (`lib/live/evren.js`), stabil hariç.
 *   · DONCHIAN KOLU: `donchianEnsemble`, evrene eşit ağırlık 1/n, brüt tavan 2,
 *     karar günlük kapanışta; evrenden çıkan sembolde hedef 0.
 *   · DCA KOLU: `dcaBotStrategy` varsayılanları, 10000 başına BO 294 / SO 412
 *     (sembole ayrılan sermayeyle orantılı), kaldıraç 1, evrendeki her
 *     sembolde ayrı deal; evrenden çıkınca deal PİYASADAN kapanır.
 *   · BİRLEŞİM: kol payları ters-oynaklık, son 60 günün günlük getiri σ'sı,
 *     BİR GÜN GECİKMELİ (hayatta-kalma.js bölüm C ile aynı formül:
 *     `tersVolAgirlik`). 61 günden az getiri varsa eşit ağırlık.
 *   · RİSK: `lib/risk` `riskUygula` (yalnız küçültür), Donchian botundaki gibi.
 *
 * KOL GETİRİSİ = MODEL GETİRİSİ. Ters-vol için kolların günlük getirisi her
 * gün piyasa verisinden AYNI strateji koduyla yeniden hesaplanır (Donchian
 * `adim` serisi, DCA `backtester.run('dca_bot')`) — canlı dolumlardan değil.
 * Gerekçe: ölçümdeki ağırlık da modelin getirisinden; yeniden başlatmada
 * kaybolacak muhasebe yok; ilk gün de 60 günlük pencere hazır (eşit ağırlıkla
 * başlamak ölçülmemiş bir dönem olurdu). Yaklaşımlar: Donchian kapanıştan
 * kapanışa (ölçüm: ertesi açılış), maliyetsiz; DCA pencere boyunca sürekli
 * (ölçüm: evren segmenti başında taze); geçmiş ayların evreni `evren.json`
 * geçmişinden, kayıt yoksa bugünkü evren.
 *
 * İKİ KOL AYNI SEMBOLDE: borsa one-way netler. Her kol kendi SANAL
 * pozisyonunu tutar: DCA kendi dolumlarından (`dcaBot`), Donchian yürütücü
 * defterindeki `kn` etiketli dolumların toplamından (+ acil durdurma
 * düzeltmesi) — defter önce-yaz günlüğü olduğu için çökme güvenli.
 * Donchian farkı `farkaGetir` ile verir. Mutabakat: borsa neti = Donchian
 * sanal + DCA sanal; tutmazsa ENGEL (yalnız acil durdurma çalışır).
 *
 * RİSK EŞLEMESİ (DCA hedef değil merdiven taşıdığı için):
 *   hedef_s = Donchian hedefi + DCA'nın mevcut nominali (özsermaye katı)
 *   → riskUygula → oran f_s = çıkış/hedef
 *   · Donchian hedefi × f_s
 *   · K3 (tepeden düşüş): her şey kapanır — DCA deal'leri piyasadan
 *   · K1 (günlük/haftalık kayıp, yeni risk yok): DCA'nın dolmamış merdiven
 *     emirleri iptal, yeni deal yok (açık deal TP ile sürer)
 *   · sembolde f_s < 1 ya da bayat veri: o sembolde yeni DCA deal'i yok
 *   · K2 / düşüş programı / brüt / vol çarpanları: yeni DCA merdiveni o çarpanla küçük
 *
 * KOL OLARAK KULLANIM (lib/live/bindirmeBot.js — Hücum / Denge):
 *   · `kolCarpani` (varsayılan 1): kol nominali = m × özsermaye × kol payları
 *     (Donchian sermayesi ve DCA sembol sermayesi m ile çarpılır).
 *   · `ozsermayeFn(hesap)`: özsermaye kaynağı (varsayılan `hesap.bakiye.toplam`);
 *     bindirmede USDT + spot BTC teminatı. Risk durumu da bununla güncellenir.
 *   · `ekSanalFn()`: üst katmanın aynı hesapta taşıdığı ek sanal pozisyon ({ sembol: miktar }) —
 *     mutabakatta borsa neti = Donchian + DCA + ek (bindirme demo: BTC ayağı perp LONG).
 *   · Rapor `model.kolGetiri`: son kapanmış günün MODEL kol getirisi (dünkü
 *     ağırlıklarla, ×m) — üst katmanın "beklenti sapması" için.
 */
const fs = require('fs');
const path = require('path');
const kalici = require('./kaliciDosya');
const D = require('../strategies/donchianEnsemble');
const { portfoyHedefleri, kapanmisGunlukMumlar, mumKapisi } = require('./donchianBot');
const { DcaBot, dcaAyari } = require('./dcaBot');
const { Evren, ayBasi: ayBasiMs } = require('./evren');
const RK = require('../risk/katmanlar');
const RD = require('../risk/durum');

const GUN = 864e5;
const PENCERE = 60;
const MODEL_GUN = 75;          // model getirisi penceresi (≥ 61)
const DCA_ISINMA = 60;
/** Borsanın asgari emir kuralı (-4164 nominal / -4003 miktar): küçük sermayede beklenen, ayrı sayılır (bindirmeBot ASGARI_KOD). */
const ASGARI_KOD = /-4164|-4003/;
/** Y3 (61.7): modelin (ve çekilebilir USDT formülünün) varsaydığı kaldıraç ve marj kipi. */
const KALDIRAC = 20;
const MARJ_KIPI = 'cross';
const DEGISIKLIK_YOK = /-4046|-4059|No need to change/i;
const ACIK_EMIR_VAR = /-4067|cannot be changed if there exists open orders/i;   // açık emir (felaket stopu / DCA) varken kip değiştirilemez   // zaten bu kipte / zaten bu modda         // hayatta-kalma.js: segment başına 60 günlük önek

/**
 * TERS-VOL AĞIRLIK — `scripts/hayatta-kalma.js` bölüm C'nin BİREBİR karşılığı.
 * Orada gün i'nin getirisi, i−61 … i−2 aralığındaki 60 getirinin σ'sıyla
 * ağırlanır (bir gün gecikme). Burada `rD`/`rC` en son kapanmış güne kadar
 * olan getirilerdir ve sonuç YARININ ağırlığıdır: i = n → slice(n−61, n−1).
 * @returns {{ don, dca, yontem, sigmaD, sigmaC, n }}
 */
function tersVolAgirlik(rD, rC, pencere = PENCERE) {
  const n = Math.min(rD.length, rC.length);
  if (n < pencere + 1) return { don: 0.5, dca: 0.5, yontem: 'esit', sigmaD: null, sigmaC: null, n };
  const a = rD.slice(rD.length - n), b = rC.slice(rC.length - n);
  const sapma = (x) => { const o = x.reduce((p, q) => p + q, 0) / x.length; return Math.sqrt(x.reduce((p, q) => p + (q - o) ** 2, 0) / (x.length - 1)); };
  const sD = sapma(a.slice(n - pencere - 1, n - 1)), sC = sapma(b.slice(n - pencere - 1, n - 1));
  const wa = 1 / (sD || 1e-6), wb = 1 / (sC || 1e-6);       // σ = 0 → NaN olmasın (ölçümle aynı)
  return { don: wa / (wa + wb), dca: wb / (wa + wb), yontem: 'tersVol', sigmaD: sD, sigmaC: sC, n };
}

/**
 * Donchian kolunun model günlük getirisi (portföy, özsermayenin katı olarak).
 * @param seriler Map sembol → mumlar (kapanmış, en eski → en yeni)
 * @param uyeMi (sembol, t) → bool — t gününün ayının evreni
 * @returns {{ gunler: [t], getiri: [r] }} son `gunSayisi` gün
 */
function donchianModelGetirisi(seriler, uyeMi, { ayar, gunSayisi = MODEL_GUN, tavan } = {}) {
  const a = D.ayarKur(ayar);
  const kap = a.kaldiracTavani;
  const tabloh = new Map();     // sembol → Map(t → { c, h(maruziyet), hazir })
  for (const [s, mumlar] of seriler) {
    const k = mumlar.map(m => m.close);
    let durum = D.yeniDurum(ayar);
    const t = new Map();
    for (let i = 0; i < k.length; i++) {
      const r = D.adim(durum, k.slice(Math.max(0, i - 400), i + 1), ayar);
      durum = r.durum;
      t.set(mumlar[i].time, { c: k[i], h: r.maruziyet, hazir: !r.isiniyor });
    }
    tabloh.set(s, t);
  }
  const tumGunler = [...new Set([...seriler.values()].flatMap(m => m.map(x => x.time)))].sort((x, y) => x - y);
  const gunler = tumGunler.slice(-(gunSayisi + 1));
  const out = { gunler: [], getiri: [] };
  for (let i = 1; i < gunler.length; i++) {
    const dun = gunler[i - 1], bugun = gunler[i];
    const hazir = [];
    for (const [s, t] of tabloh) { const x = t.get(dun); if (x && x.hazir && uyeMi(s, bugun)) hazir.push([s, x]); }
    let r = 0;
    if (hazir.length) {
      const w = 1 / hazir.length;
      let top = hazir.reduce((p, [, x]) => p + Math.abs(x.h * w), 0);
      const olcek = top > (tavan ?? kap) ? (tavan ?? kap) / top : 1;
      for (const [s, x] of hazir) { const y = tabloh.get(s).get(bugun); if (y) r += x.h * w * olcek * (y.c / x.c - 1); }
    }
    out.gunler.push(bugun); out.getiri.push(r);
  }
  return out;
}

/**
 * DCA kolunun model günlük getirisi: evrendeki sembollerin DCA getirilerinin
 * eşit ağırlıklı ortalaması (ölçümdeki `dcaPortfoy`). Sembol başına
 * `backtester.run('dca_bot')`, 10000 sermaye, BO 294 / SO 412, kaldıraç 1.
 *
 * SEGMENT: ölçümde DCA, sembolün evrendeki kesintisiz ay bloğu boyunca TEK
 * koşudur (segment başında 60 günlük ısınma öneki, taze sermaye). Deal'ler
 * haftalarca açık kalabildiği için son 75 günle taze başlatmak açık deal'leri
 * kaçırır ve σ'yı sıfıra yakın gösterir (gerçek veride ölçüldü: BTC/ETH/SOL'de
 * 75 günlük koşu 0 işlem, 1000 günlük 86–129). `segmentBasi(s)` bloğun
 * başını verir; null → kayıt yok, eldeki tüm geçmiş (≤1000 gün) tek segment.
 */
function dcaModelGetirisi(seriler, uyeMi, { strateji = {}, gunSayisi = MODEL_GUN, segmentBasi = () => null } = {}) {
  const B = require('../backtester');
  const getiriler = new Map();   // sembol → Map(t → r)
  for (const [s, mumlar] of seriler) {
    const bas = segmentBasi(s);
    let i0 = bas == null ? Math.min(DCA_ISINMA, mumlar.length) : mumlar.findIndex(m => m.time >= bas);
    if (i0 < 0) continue;
    const onek = Math.min(i0, DCA_ISINMA);
    const dilim = mumlar.slice(i0 - onek);
    if (dilim.length - onek < 5 || dilim.length < 35) continue;      // ölçümle aynı alt sınır
    const r = B.run('dca_bot', { marketType: 'perpetual', leverage: 1, contractSpecs: { taker: 0.0005, maker: 0.0002 }, ...dcaAyari(10000, strateji) },
      dilim, 10000, '1d', { trace: false, girisBasi: Math.max(30, onek) });
    const m = new Map();
    let once = null;
    for (const p of r.equityCurve) {
      const t = Math.floor(Date.parse(p.time) / GUN) * GUN;
      if (once != null && once > 0) m.set(t, p.value / once - 1);
      once = p.value;
    }
    getiriler.set(s, m);
  }
  const tumGunler = [...new Set([...seriler.values()].flatMap(m => m.map(x => x.time)))].sort((x, y) => x - y);
  const gunler = tumGunler.slice(-gunSayisi);
  const out = { gunler: [], getiri: [] };
  for (const t of gunler) {
    const l = [];
    for (const [s, m] of getiriler) if (uyeMi(s, t) && m.has(t)) l.push(m.get(t));
    out.gunler.push(t); out.getiri.push(l.length ? l.reduce((p, q) => p + q, 0) / l.length : 0);
  }
  return out;
}

class KalkanBot {
  /**
   * @param yurutucu CanliYurutucu (kâğıt / testnet / live — kendi defter dizini)
   * @param ayar { dizin, sermayeTavani, evren (Evren | ayar nesnesi), dca (strateji ayarı),
   *               donchian (strateji ayarı), risk (riskUygula ayarı), esikler, kaydet }
   */
  constructor(yurutucu, ayar = {}) {
    this.y = yurutucu;
    this.ayar = { sermayeTavani: 1000, kolCarpani: 1, ...ayar };
    this.kaydet = ayar.kaydet || (() => {});
    const dizin = ayar.dizin || null;
    this.evren = ayar.evren instanceof Evren ? ayar.evren : new Evren({ dizin, kaydet: this.kaydet, ...(ayar.evren || {}) });
    this.dca = new DcaBot(yurutucu, { dizin, strateji: ayar.dca || {}, kaydet: this.kaydet });
    this.dosya = dizin ? path.join(dizin, 'kalkan-bot.json') : null;
    this.riskDosya = dizin ? path.join(dizin, 'risk-durum.json') : null;
    this.riskBozuk = this.riskDosya ? kalici.oku(this.riskDosya).bozuk : null;   // Y2: K3/HWM dosyası bozuksa (yedekten okunur) ENGEL
    this.durum = { calisiyor: false, sonGun: null, sonRapor: null, donDuzeltme: {}, engel: null, sonMutabakat: null, agirlikGecmisi: [] };
    // Y2 (61.7): bozuk dosya SESSİZCE sıfırlanmaz — son iyi kopyadan (.yedek) kurtarılır, `this.bozuk` dolar;
    // BindirmeBot bunu ENGEL + alarm yapar (lib/live/kaliciDosya.js).
    this.bozuk = null;
    if (this.dosya) {
      const k = kalici.oku(this.dosya);
      if (k.veri) this.durum = { ...this.durum, ...k.veri };
      if (k.bozuk) { this.bozuk = k.bozuk; this.kaydet('ERROR', `durum dosyası: ${k.bozuk}`); }
    }
    this.zamanlayici = null;
    this.mesgul = false;
  }

  _yaz() {
    if (!this.dosya) return;
    kalici.yaz(this.dosya, this.durum);   // Y2: fsync + son iyi kopya (.yedek)
  }

  // ── Sanal pozisyonlar ────────────────────────────────────────────────────
  /** Donchian kolu: defterdeki `kn` dolumlarının işaretli toplamı + düzeltme. */
  donSanal() {
    const o = {};
    for (const e of this.y.defter.emirler.values()) {
      if (e.bot !== 'kn' || !(+e.dolan > 0)) continue;
      o[e.symbol] = (o[e.symbol] || 0) + (e.side === 'buy' ? 1 : -1) * +e.dolan;
    }
    for (const [s, d] of Object.entries(this.durum.donDuzeltme || {})) o[s] = (o[s] || 0) + d;
    for (const s of Object.keys(o)) { o[s] = +o[s].toFixed(12); if (Math.abs(o[s]) < 1e-12) delete o[s]; }
    return o;
  }

  /**
   * Borsa neti = Donchian sanal + DCA sanal mı. Tutmazsa ENGEL.
   * @returns {{ temiz, farklar: [{symbol, borsa, don, dca, fark}] }}
   */
  async pozisyonMutabakati() {
    // Yürütücünün geri çekilme kapısından (F2 — 418 ban'da istek atılmaz).
    const b = (typeof this.y.kapiliBorsa === 'function' && this.y.kapiliBorsa()) || this.y.borsa;
    const ps = await b.fetchPositions();
    if (!Array.isArray(ps)) throw new Error(`fetchPositions geçersiz cevap (${typeof ps})`);
    const net = {};
    for (const p of ps) { const q = Math.abs(+p.contracts || 0); if (q > 0) net[p.symbol] = (net[p.symbol] || 0) + (p.side === 'short' ? -q : q); }
    const don = this.donSanal(), dca = this.dca.sanalMiktarlar();
    // Üst katmanın aynı hesapta taşıdığı ek sanal pozisyon (bindirme demo: BTC ayağı perp LONG).
    const ek = this.ayar.ekSanalFn ? (this.ayar.ekSanalFn() || {}) : {};
    const farklar = [];
    for (const s of new Set([...Object.keys(net), ...Object.keys(don), ...Object.keys(dca), ...Object.keys(ek)])) {
      const b = net[s] || 0, d = don[s] || 0, c = dca[s] || 0, x = ek[s] || 0;
      const m = this.y.borsa.markets[s];
      const tol = Math.max(1e-9, ((m && m.precision && m.precision.amount) || 0) / 2);
      if (Math.abs(b - d - c - x) > tol) farklar.push({ symbol: s, borsa: b, don: d, dca: c, ...(x ? { ek: x } : {}), fark: +(b - d - c - x).toFixed(12) });
    }
    return { temiz: farklar.length === 0, farklar };
  }

  /**
   * Kolların bu çalışmada borsaya gitmiş ve henüz son durumda olmayan emirlerinin dolumlarını okur (emir GÖNDERMEZ):
   * DCA → dcaBot.dolumlariOku(); Donchian → defterde ACIK/KISMI `kn` emirleri clientOrderId ile sorulur (D2'nin
   * piyasa emri yeniden sorgusu sonrası hâlâ "NEW / dolan 0" kalan emir; yalnız bu çalışmada oluşturulanlar —
   * `knSonra` ms). Hata yutulmaz, `hatalar`a yazılır.
   */
  async _kolDolumlariniOku(knSonra = 0) {
    const out = { dca: null, donchian: 0, hatalar: [] };
    try {
      out.dca = await this.dca.dolumlariOku();
      for (const h of out.dca.hatalar) out.hatalar.push(`DCA ${h}`);
    } catch (e) { out.hatalar.push(`DCA dolum okuma: ${e.message}`); }
    for (const e of [...this.y.defter.emirler.values()]) {
      if (e.bot !== 'kn' || (e.durum !== 'ACIK' && e.durum !== 'KISMI') || !((e.olusturma || 0) >= knSonra)) continue;
      try { await this.y.emirSorgula(e.id, e.symbol, { yoksaDokunma: true }); out.donchian++; } catch (err) { out.hatalar.push(`Donchian ${e.id}: ${err.message}`); }
    }
    return out;
  }

  /**
   * Günlük çalışma sonu pozisyon kontrolü (HYPE 2026-10-18 yanlış ENGEL düzeltmesi): çalışma sırasında dakikalık DCA
   * senkronu durur (mesgul) ve Binance limit BO/SO'ya "NEW, dolan 0" döndürüp saniyeler içinde doldurur → kontrol
   * borsa netini defterden fazla görürdü. Sıra: dolumları oku → kontrol; temiz değilse kısa bekleme
   * (`calismaSonuBeklemeMs`, varsayılan 500 + 2000 ms) → dolumları yeniden oku → yeniden kontrol. Fark SÜRERSE
   * sonuç temiz değildir (çağıran ENGEL koyar — kapalı-başarısız). İlk kontrol okunamazsa hata atılır (eskisi gibi);
   * yeniden denemedeki okuma hatası son temiz-olmayan sonucu değiştirmez (yanlış "temiz" yok).
   * @returns {{ temiz, farklar, deneme: number, beklenenMs: number, dolumOkuma: [] }}
   */
  async _calismaSonuMutabakati(knSonra = 0) {
    const okumalar = [await this._kolDolumlariniOku(knSonra)];
    let poz = await this.pozisyonMutabakati();
    let deneme = 1, beklenenMs = 0;
    const uyu = this.ayar.uyu || (typeof this.y.uyu === 'function' ? (ms) => this.y.uyu(ms) : (ms) => new Promise(r => setTimeout(r, ms)));
    for (const ms of (poz.temiz ? [] : (this.ayar.calismaSonuBeklemeMs || [500, 2000]))) {
      await uyu(ms);
      beklenenMs += ms;
      deneme++;
      okumalar.push(await this._kolDolumlariniOku(knSonra));
      let yeni;
      try { yeni = await this.pozisyonMutabakati(); } catch (e) { okumalar[okumalar.length - 1].hatalar.push(`pozisyon okuma: ${e.message}`); continue; }
      poz = yeni;
      if (poz.temiz) break;
    }
    const hatalar = okumalar.flatMap(o => o.hatalar);
    // 73.6 (Y-29): gecikmeli dolumun ikinci denemede TEMİZ çıkması zararsız — bilgi satırı (tekrar sayacına / günlük ışığına girmez).
    if (deneme > 1) this.kaydet(poz.temiz ? (hatalar.length ? 'WARN' : 'INFO') : 'ERROR', `Kalkan çalışma sonu kontrolü: ilk kontrolde fark vardı, ${deneme}. denemede ${poz.temiz ? 'TEMİZ (gecikmeli dolum deftere işlendi)' : 'fark SÜRÜYOR'} · ${beklenenMs} ms beklendi${hatalar.length ? ` · okuma hatası: ${hatalar.join(' · ')}` : ''}`);
    else if (hatalar.length) this.kaydet('WARN', `Kalkan çalışma sonu dolum okuması: ${hatalar.join(' · ')}`);
    return { ...poz, deneme, beklenenMs, dolumOkuma: okumalar.map(o => ({ dca: o.dca ? o.dca.dolum : null, donchian: o.donchian, hatalar: o.hatalar })) };
  }

  /**
   * Açılış mutabakatı: DCA emirleri borsaya sorulur, sonra pozisyonlar
   * karşılaştırılır. Uyuşmazlık / çözülemeyen emir → ENGEL (fail-closed).
   */
  async mutabakat() {
    if (!this.y.borsa) throw new Error('borsaya bağlı değil');
    const dca = await this.dca.mutabakat();
    const poz = await this.pozisyonMutabakati();
    let engel = null;
    if (dca.cozulemeyen.length) engel = `${dca.cozulemeyen.length} DCA emrinin durumu çözülemedi`;
    else if (!poz.temiz) engel = `pozisyon uyuşmazlığı: ${poz.farklar.map(f => `${f.symbol.split('/')[0]} borsa ${f.borsa} ≠ ${f.don} + ${f.dca}${f.ek ? ` + ${f.ek}` : ''}`).join(' · ')}`;
    if (this.y.durum !== 'AKTIF') engel = engel || `yürütücü ${this.y.durum}: ${this.y.durmaSebebi}`;
    this.durum.engel = engel;
    this.durum.sonMutabakat = { zaman: Date.now(), dca, pozisyon: poz };
    this._yaz();
    if (engel) this.kaydet('ERROR', `Kalkan mutabakatı: ${engel} — emir verilmeyecek (acil durdurma serbest)`);
    return { engel, dca, pozisyon: poz };
  }

  // ── Günlük çalışma ──────────────────────────────────────────────────────
  _uyeFn(guncel) {
    return (s, t) => { const e = this.evren.ayEvreni(t); return (e || guncel).includes(s); };
  }

  /**
   * Sembolün EN SON kesintisiz evren bloğunun başı (ay başı, ms) — DCA model
   * segmenti. Ay kaydı biterse null (tam geçmiş). Sabit evrende null.
   */
  _segmentBasiFn(guncel, simdi) {
    return (s) => {
      if (this.evren.sabitMi()) return null;
      const ayE = (t) => this.evren.ayEvreni(t) || (ayBasiMs(t) === ayBasiMs(simdi) ? guncel : null);
      let ay = ayBasiMs(simdi);
      for (let i = 0; i < 3 && !(ayE(ay) || []).includes(s); i++) { ay = ayBasiMs(ay - GUN); if (!ayE(ay)) return null; }
      if (!(ayE(ay) || []).includes(s)) return null;
      for (;;) {
        const onceki = ayBasiMs(ay - GUN);
        const e = ayE(onceki);
        if (!e) return null;
        if (!e.includes(s)) return ay;
        ay = onceki;
      }
    };
  }

  /**
   * @param {boolean} kuru true → yalnız hesap; emir YOK, durum (evren, risk, DCA) YAZILMAZ
   */
  async calistir({ kuru = false, simdi = Date.now() } = {}) {
    if (!this.y.borsa) throw new Error('borsaya bağlı değil');
    if (!kuru && this.durum.engel) throw new Error(`kalkan ENGELLİ: ${this.durum.engel}`);
    const borsa = this.y.borsa;
    const evrenR = await this.evren.guncelle(borsa, simdi, { kalici: !kuru });
    const U = evrenR.semboller;
    const donSanal = this.donSanal();
    const dcaSanal = this.dca.sanalMiktarlar();
    const oncekiAy = this.evren.ayEvreni(simdi - 40 * GUN) || [];
    const gerekli = [...new Set([...U, ...Object.keys(donSanal), ...this.dca.semboller(), ...oncekiAy])].filter(s => borsa.markets[s]);
    const mumlar = new Map();
    const atlanan = [];
    for (const s of gerekli) {
      try {
        const m = await kapanmisGunlukMumlar(borsa, s, simdi);
        // 69.3 veri kapısı: boşluk/bayat/anlamsız sıçrama → sembol bu çalışmada atlanır (mum yok ile aynı yol). Yeni listelenen coinde boşluk yok sayılmaz.
        const vk = m.length ? mumKapisi(m, simdi, { sicrama: 3 }) : { gecerli: false, sebep: 'mum yok' };
        if (vk.gecerli) mumlar.set(s, m); else atlanan.push({ symbol: s, sebep: m.length ? `veri kapısı: ${vk.sebep}` : 'mum yok' });
      }
      catch (e) { atlanan.push({ symbol: s, sebep: e.message }); }
    }
    // 69.6 (güvenlik testi O1): verisi okunamayan ya da kapıdan geçmeyen sembolde açık Donchian pozisyonu KAPATILMAZ (eskiden hedef 0 →
    // piyasadan satış). Pozisyon korunur, yeni risk açılmaz; evrenden çıkış ve K3 yine kapatır.
    const veriYok = new Set(atlanan.map(a => a.symbol));

    // 1. Kol payları — ters-vol 60g, bir gün gecikmeli, model getirisi.
    const uye = this._uyeFn(U);
    const mD = donchianModelGetirisi(mumlar, uye, { ayar: this.ayar.donchian });
    const mC = dcaModelGetirisi(mumlar, uye, { strateji: this.ayar.dca, segmentBasi: this._segmentBasiFn(U, simdi) });
    const agirlik = tersVolAgirlik(mD.getiri, mC.getiri);
    const kolM = this.ayar.kolCarpani > 0 ? this.ayar.kolCarpani : 1;
    // Son kapanmış günün model kol getirisi, o günün (dünkü) ağırlıklarıyla.
    const agirlikDun = tersVolAgirlik(mD.getiri.slice(0, -1), mC.getiri.slice(0, -1));
    const sonR = (m) => (m.getiri.length ? m.getiri[m.getiri.length - 1] : 0);
    const model = { gun: mD.gunler.length ? new Date(mD.gunler[mD.gunler.length - 1]).toISOString().slice(0, 10) : null,
      rDon: sonR(mD), rDca: sonR(mC), kolGetiri: kolM * (agirlikDun.don * sonR(mD) + agirlikDun.dca * sonR(mC)) };

    // 2. Özsermaye
    const hesap = await this.y.hesap();
    const hesapToplam = this.ayar.ozsermayeFn ? await this.ayar.ozsermayeFn(hesap) : (hesap.bakiye.toplam || 0);
    const ozsermaye = Math.min(hesapToplam || 0, this.ayar.sermayeTavani);
    if (!(ozsermaye > 0)) throw new Error('özsermaye 0');
    const sonKapanis = (s) => { const m = mumlar.get(s); return m ? m[m.length - 1].close : null; };
    const sonGun = (s) => { const m = mumlar.get(s); return m ? m[m.length - 1].time : -Infinity; };

    // 2b. Küçük sermaye (Hücum-S, lib/live/kucukSermaye.js): ay başı uygun semboller + DCA merdiven n
    const S = this._kucukSermaye({ U, mumlar, ozsermaye, kolM, agirlik, simdi, kuru });
    const donU = S ? U.filter(s => S.uygun.includes(s)) : U;
    const dcaU = S ? U.filter(s => s in S.n) : U;

    // 3. Donchian hedefleri (kolun payıyla)
    const isinma = D.isinma(this.ayar.donchian);
    const seriler = donU.filter(s => mumlar.has(s) && mumlar.get(s).length >= isinma)
      .map(s => ({ symbol: s, kapanislar: mumlar.get(s).map(m => m.close), sonGun: sonGun(s) }));
    for (const s of donU) if (!seriler.find(x => x.symbol === s)) atlanan.push({ symbol: s, sebep: `Donchian ısınması yetersiz (${(mumlar.get(s) || []).length}/${isinma} gün)` });
    const donSermaye = ozsermaye * kolM * agirlik.don;
    const donHedef = seriler.length ? portfoyHedefleri(seriler, donSermaye, this.ayar.donchian) : [];
    const hedefOran = {}, piyasa = { _simdi: simdi };
    const tum = new Set([...U, ...Object.keys(donSanal), ...Object.keys(dcaSanal)]);
    for (const s of tum) {
      const c = sonKapanis(s);
      const dh = donHedef.find(h => h.symbol === s);
      const d = dh ? dh.hedefNominal / ozsermaye : 0;          // evren dışı → 0
      const dcaNom = (dcaSanal[s] || 0) * (c || 0);
      hedefOran[s] = d + dcaNom / ozsermaye;
      piyasa[s] = { mevcutOran: ((donSanal[s] || 0) + (dcaSanal[s] || 0)) * (c || 0) / ozsermaye, veriZamani: sonGun(s) + GUN };
    }

    // 4. Risk katmanı
    let esikler = null;
    try { esikler = this.ayar.esikler !== undefined ? this.ayar.esikler : require('../risk/esikler.json'); } catch { /* yalnız tavanlar */ }
    let riskDurum = RD.guncelle(this.riskDosya ? RD.yukle(this.riskDosya) : (this._riskBellek || RD.bos()), hesapToplam || 0, simdi);
    const risk = RK.riskUygula(hedefOran, riskDurum, piyasa, { esikler, ...(this.ayar.risk || {}) });
    riskDurum = RD.killIsle(riskDurum, risk, simdi);
    if (!kuru) { if (this.riskDosya) RD.kaydet(riskDurum, this.riskDosya); else this._riskBellek = riskDurum; }
    const K1 = risk.kararlar.some(k => k.katman === 'L5.5 K1');
    const K3 = risk.kill >= 3;
    const c = risk.carpanlar;
    const boyutCarpani = K3 ? 0 : (c.periyot ?? 1) * (c.dusus ?? 1) * (c.brut ?? 1) * (c.vol ?? 1);
    const oranF = (s) => (hedefOran[s] > 0 ? risk.hedefler[s] / hedefOran[s] : 1);
    const bayat = new Set(risk.kararlar.filter(k => k.katman === 'L5.1').map(k => k.sembol));
    if (risk.kararlar.length) this.kaydet(K3 ? 'ERROR' : 'WARN', `Kalkan risk: ${risk.kararlar.map(k => `${k.katman}${k.sembol ? ' ' + k.sembol.split('/')[0] : ''}: ${k.neden}`).join(' · ')}`);

    const donPlan = [];
    const korunan = [];
    for (const s of tum) {
      if (!K3 && veriYok.has(s) && U.includes(s) && Math.abs(donSanal[s] || 0) > 0) {
        korunan.push(s);
        donPlan.push({ symbol: s, evrende: true, riskOncesiNominal: null, hedefNominal: null, hedefMiktar: donSanal[s], sanal: donSanal[s], fark: 0, acikAltModel: 0, veriYok: true });
        continue;
      }
      const dh = donHedef.find(h => h.symbol === s);
      const c0 = sonKapanis(s);
      const hedefNom = dh ? dh.hedefNominal * Math.min(1, oranF(s)) : 0;
      const hedefMiktar = c0 > 0 ? hedefNom / c0 : 0;
      donPlan.push({ symbol: s, evrende: U.includes(s), riskOncesiNominal: dh ? dh.hedefNominal : 0, hedefNominal: hedefNom, hedefMiktar,
        sanal: donSanal[s] || 0, fark: hedefMiktar - (donSanal[s] || 0), acikAltModel: dh ? dh.acikAltModel : 0 });
    }
    if (korunan.length) this.kaydet('WARN', `Kalkan: ${korunan.map(s => s.split('/')[0]).join(', ')} verisi yok / veri kapısından geçmedi — açık Donchian pozisyonu KORUNDU (değiştirilmedi): ${atlanan.filter(a => korunan.includes(a.symbol)).map(a => a.sebep).join(' · ').slice(0, 200)}`);
    const dcaSembolSermaye = dcaU.length ? ozsermaye * kolM * agirlik.dca / dcaU.length : 0;

    const rapor = {
      zaman: simdi, gun: new Date(Math.max(...[...mumlar.values()].map(m => m[m.length - 1].time))).toISOString().slice(0, 10),
      kuru, ortam: this.y.ortam, ozsermaye, kolCarpani: kolM, model,
      evren: { ay: evrenR.ay, semboller: U, eklenen: evrenR.eklenen, cikan: evrenR.cikan, bayat: evrenR.bayat },
      agirlik: { ...agirlik, modelGun: mD.getiri.length },
      donchian: { sermaye: donSermaye, plan: donPlan },
      dca: { sembolSermaye: dcaSembolSermaye, boyutCarpani, plan: [] },
      risk: { kararlar: risk.kararlar, kill: risk.kill, killNedeni: risk.killNedeni, dusus: risk.dd, carpanlar: c, K1, K3 },
      atlanan, veriYokKorunan: korunan, yurutme: null, kucukSermaye: S,
    };

    if (kuru) {
      for (const s of dcaU) {
        if (!mumlar.has(s)) continue;
        const r = await this.dca.gunluk(s, mumlar.get(s).slice(-250), { sermaye: dcaSembolSermaye * (boyutCarpani || 1), kuru: true, n: S ? S.n[s] : null });
        rapor.dca.plan.push(r);
      }
      this.durum.sonRapor = rapor; this._yaz();
      this.kaydet('INFO', `Kalkan (kuru) ${rapor.gun}: pay Donchian %${(agirlik.don * 100).toFixed(0)} / DCA %${(agirlik.dca * 100).toFixed(0)} · evren ${U.length}`);
      return rapor;
    }

    // 5. Yürütme
    const calismaBasi = typeof this.y.simdi === 'function' ? this.y.simdi() : Date.now();   // 5d: bu çalışmanın kn emirleri
    const y = rapor.yurutme = { dcaKapanan: [], donchian: [], dca: [], girisIptal: 0, hatalar: [] };
    // Y3 (61.7): evren değişince (ve ilk çalışmada) her sembolde çapraz marj + ×20 kaldıraç ayarlanır ve doğrulanır.
    // Hesapta önceden 1–5× bırakılmış bir sembol kol emirlerini -2019 ile reddettirirdi; izole kip likidasyonu felaket stopundan önce getirebilirdi.
    if (!kuru) { const kh = await this.kaldiracHazirla([...U, ...(this.ayar.kaldiracEkSemboller || [])]); if (kh.hatalar.length) y.hatalar.push(...kh.hatalar); rapor.kaldirac = kh; }
    // 5a. K3 ya da evrenden çıkış → DCA deal'i piyasadan kapanır (kural: dcaBot.kapat)
    // Hücum-S: o ay uygun olmayan (ya da n = 0 bile sağlamayan) segmentin pozisyonu da kapanır (betikte hedef 0).
    for (const s of this.dca.semboller()) {
      const disarida = !U.includes(s), sDisi = !!S && !dcaU.includes(s);
      if (K3 || disarida || (sDisi && (this.dca.pozisyon(s).miktar > 0 || this.dca.acikMerdiven(s).length))) {
        const sebep = K3 ? 'risk K3' : disarida ? 'evrenden çıktı' : 'Kairos-S: bu ay uygun değil';
        const r = await this.dca.kapat(s, sebep);
        y.dcaKapanan.push({ symbol: s, sebep, ...r });
      }
    }
    // 5b. Donchian farkları
    for (const p of donPlan) {
      const m = borsa.markets[p.symbol];
      const minQ = (m && m.limits && m.limits.amount && m.limits.amount.min) || 0;
      if (Math.abs(p.fark) < Math.max(minQ, 1e-12)) continue;
      try {
        const neden = Math.abs(p.sanal) < 1e-12 && p.fark > 0 ? 'Donchian — LONG AÇ (kırılım)'
          : Math.abs(p.hedefMiktar) < 1e-12 ? (p.evrende ? 'Donchian — LONG KAPAT (trend bitti / risk)' : 'Donchian — LONG KAPAT (evrenden çıkış)')
            : p.fark > 0 ? 'Donchian — LONG artır (boyut)' : 'Donchian — LONG azalt (boyut / risk)';
        const r = await this.y.farkaGetir(p.symbol, p.fark, 'kn', neden);
        y.donchian.push({ symbol: p.symbol, fark: p.fark, atlandi: r.atlandi || null,
          emirler: r.emirler.map(e => ({ basarili: e.basarili, sebep: e.sebep || null, id: e.emir && e.emir.id, durum: e.emir && e.emir.durum, dolan: e.emir && e.emir.dolan })) });
      } catch (e) { y.donchian.push({ symbol: p.symbol, hata: e.message }); y.hatalar.push(`Donchian ${p.symbol}: ${e.message}`); }
    }
    // 5c. DCA: K1 → dolmamış merdiven iptal; evrendeki her sembolde günlük değerlendirme
    if (K1) for (const s of this.dca.semboller()) y.girisIptal += await this.dca.girisleriIptal(s);
    if (!K3) {
      for (const s of dcaU) {
        if (!mumlar.has(s)) continue;
        const serbest = !K1 && !bayat.has(s) && oranF(s) >= 1 - 1e-9 && boyutCarpani > 0;
        try {
          const r = await this.dca.gunluk(s, mumlar.get(s).slice(-250), { sermaye: dcaSembolSermaye * (boyutCarpani > 0 ? boyutCarpani : 1), yeniDealSerbest: serbest, n: S ? S.n[s] : null });
          y.dca.push(r);
        } catch (e) { y.dca.push({ symbol: s, hata: e.message }); y.hatalar.push(`DCA ${s}: ${e.message}`); }
      }
    }
    // 5c'. Denetim K2 (61.7): reddedilen kol emirleri ARTIK SESSİZ DEĞİL — y.hatalar'a girer → bindirme raporHatalari →
    // Telegram "çalışmada hata" alarmı + healthchecks fail. Asgari nominal/miktar retleri (küçük sermaye) hariç: onlar
    // "Verilmeyen küçük emir" sayacında. Azaltan/kapatan emrin reddi ayrıca "KAPANIŞ REDDEDİLDİ" diye başlar.
    y.hatalar.push(...KalkanBot.kolRetleri(y));
    // 5d. Sonrası: borsa neti = kolların toplamı mı (önce bu çalışmada dolan limit emirler deftere işlenir)
    const poz = await this._calismaSonuMutabakati(calismaBasi);
    rapor.mutabakat = poz;
    if (!poz.temiz) {
      this.durum.engel = `çalışma sonrası pozisyon uyuşmazlığı: ${poz.farklar.map(f => f.symbol.split('/')[0]).join(', ')}`;
      this.kaydet('ERROR', `Kalkan: ${this.durum.engel}`);
    }
    this.durum.sonGun = rapor.gun;
    this.durum.sonRapor = rapor;
    this.durum.agirlikGecmisi = [...(this.durum.agirlikGecmisi || []), { gun: rapor.gun, don: agirlik.don, dca: agirlik.dca, yontem: agirlik.yontem }].slice(-60);
    this._yaz();
    this.kaydet('INFO', `Kalkan ${rapor.gun}: pay Donchian %${(agirlik.don * 100).toFixed(0)} / DCA %${(agirlik.dca * 100).toFixed(0)} · Donchian ${y.donchian.length} emir · DCA ${y.dca.filter(r => r.merdiven).length} yeni merdiven${y.dcaKapanan.length ? ` · ${y.dcaKapanan.length} DCA kapandı` : ''}`);
    return rapor;
  }

  /**
   * Y3: semboller için çapraz marj + KALDIRAC. Aynı sembol kümesi bir kez başarıyla ayarlandıysa yeniden istek atmaz
   * (`durum.kaldirac.imza`); kâğıt borsada atlanır. Doğrulama: setLeverage cevabındaki kaldıraç = KALDIRAC.
   * 62.5: önce mevcut kip/kaldıraç salt okunur (positionRisk v2); zaten çapraz ×KALDIRAC olan sembole istek atılmaz. Açık emir
   * varken Binance kip isteğine -4067 döner (2026-10-14 03:03 yanlış alarm: 7 sembol zaten cross ×20 idi) — o zaman kip yeniden
   * okunur, çaprazsa hata sayılmaz ve kaldıraç adımı atlanmaz.
   * @returns {{ ayarlanan: number, atlandi?: string, hatalar: string[] }}
   */
  async kaldiracHazirla(semboller) {
    const b = this.y.borsa;
    const out = { ayarlanan: 0, hatalar: [] };
    if (!b || b.kagit) { out.atlandi = 'kâğıt borsa'; return out; }
    if (typeof b.setLeverage !== 'function') { out.atlandi = 'borsa setLeverage desteklemiyor'; return out; }
    const liste = [...new Set(semboller)].filter(s => b.markets && b.markets[s]).sort();
    const imza = `${KALDIRAC}|${MARJ_KIPI}|${liste.join(',')}`;
    if (this.durum.kaldirac && this.durum.kaldirac.imza === imza && !(this.durum.kaldirac.hatalar || []).length) { out.atlandi = 'değişmedi'; return out; }
    const istek = (fn) => (typeof this.y.borsaIstegi === 'function' ? this.y.borsaIstegi(fn, true) : fn());
    let mevcut = await this._mevcutKaldirac(liste, istek);
    for (const s of liste) {
      const ad = s.split('/')[0];
      let m = mevcut && mevcut.get(s);
      if (m && m.kip === MARJ_KIPI && m.kaldirac === KALDIRAC) { out.ayarlanan++; out.zatenHazir = (out.zatenHazir || 0) + 1; continue; }
      if (typeof b.setMarginMode === 'function' && !(m && m.kip === MARJ_KIPI)) {
        try { await istek(() => b.setMarginMode(MARJ_KIPI, s)); }
        catch (e) {
          const msj = String(e && e.message);
          let sorun = !DEGISIKLIK_YOK.test(msj);
          if (sorun && ACIK_EMIR_VAR.test(msj)) {
            // Açık emir varken kip değiştirilemez: gerçekten ne olduğunu oku (önceki okuma yoksa yeniden dene)
            if (!mevcut) mevcut = await this._mevcutKaldirac(liste, istek);
            m = mevcut && mevcut.get(s);
            if (m && m.kip === MARJ_KIPI) sorun = false;
            else { out.hatalar.push(`${ad}: marj kipi ${MARJ_KIPI} yapılamadı — açık emir varken kip değiştirilemez, şu anki kip ${m ? m.kip : 'okunamadı'}`); continue; }
          }
          if (sorun) { out.hatalar.push(`${ad}: marj kipi ${MARJ_KIPI} yapılamadı (${e.message})`); continue; }
        }
      }
      if (m && m.kaldirac === KALDIRAC) { out.ayarlanan++; continue; }
      try {
        const r = await istek(() => b.setLeverage(KALDIRAC, s));
        const k = r && +(r.leverage ?? (r.info && r.info.leverage));
        if (k && k !== KALDIRAC) out.hatalar.push(`${ad}: kaldıraç ${k}× (beklenen ${KALDIRAC}×)`);
        else out.ayarlanan++;
      } catch (e) {
        if (e && e.kod === 'GERI_CEKILME') { out.hatalar.push(`${ad}: kaldıraç ayarı geri çekilmede ertelendi`); continue; }
        out.hatalar.push(`${ad}: kaldıraç ${KALDIRAC}× ayarlanamadı (${e.message})`);
      }
    }
    this.durum.kaldirac = { imza, zaman: Date.now(), ayarlanan: out.ayarlanan, hatalar: out.hatalar };
    if (out.hatalar.length) this.kaydet('ERROR', `Kaldıraç/marj kipi: ${out.hatalar.join(' · ')}`);
    else this.kaydet('INFO', `Kaldıraç/marj kipi: ${out.ayarlanan} sembol çapraz ×${KALDIRAC}${out.zatenHazir ? ` (${out.zatenHazir} zaten hazırdı, istek atılmadı)` : ''}`);
    return out;
  }

  /**
   * Salt okuma: semboller için mevcut marj kipi ve kaldıraç (Binance /fapi/v2/positionRisk, one-way → positionSide BOTH).
   * Okunamazsa null (çağıran eski yola düşer: setMarginMode + setLeverage). → Map(sembol → { kip: 'cross'|'isolated', kaldirac })
   */
  async _mevcutKaldirac(liste, istek) {
    const b = this.y.borsa;
    if (!b || typeof b.fapiPrivateV2GetPositionRisk !== 'function') return null;
    const idHarita = new Map(liste.map(s => [b.markets[s] && b.markets[s].id, s]).filter(([id]) => id));
    try {
      const l = await istek(() => b.fapiPrivateV2GetPositionRisk());
      const out = new Map();
      for (const x of Array.isArray(l) ? l : []) {
        const s = idHarita.get(x.symbol);
        if (!s || (x.positionSide && String(x.positionSide).toUpperCase() !== 'BOTH' && out.has(s))) continue;
        const tip = String(x.marginType || '').toLowerCase();
        out.set(s, { kip: tip === 'cross' || tip === 'crossed' ? 'cross' : tip === 'isolated' ? 'isolated' : null, kaldirac: +x.leverage || null });
      }
      return out;
    } catch (e) { this.kaydet('WARN', `Kaldıraç/marj kipi okunamadı (positionRisk): ${e.message} — doğrudan ayarlanacak`); return null; }
  }

  /** Bu çalışmada reddedilen kol emirleri (asgari nominal/miktar hariç) → okunur satırlar. Saf işlev (öz test). */
  static kolRetleri(y) {
    const out = [];
    const ad = (s) => String(s || '').split('/')[0];
    const asgari = (s) => ASGARI_KOD.test(String(s || ''));
    for (const d of y.donchian || []) {
      for (const e of d.emirler || []) {
        if (e.basarili || asgari(e.sebep)) continue;
        out.push(`${d.fark < 0 ? 'KAPANIŞ REDDEDİLDİ — ' : ''}Donchian ${ad(d.symbol)} emri reddedildi: ${e.sebep || 'sebep yok'}`);
      }
    }
    for (const r of y.dca || []) {
      for (const k of r.merdiven || []) if (k.durum === 'RED' && !asgari(k.sebep)) out.push(`DCA ${ad(r.symbol)} ${k.id || ''} emri reddedildi: ${k.sebep || 'sebep yok'}`);
      if (r.tp && r.tp.durum === 'RED' && !asgari(r.tp.sebep)) out.push(`KAPANIŞ REDDEDİLDİ — DCA ${ad(r.symbol)} TP (kâr al) emri reddedildi${r.tp.sebep ? `: ${r.tp.sebep}` : ''}`);
      if (r.tpHata) out.push(`DCA ${ad(r.symbol)} TP: ${r.tpHata}`);
    }
    for (const k of y.dcaKapanan || []) if (k.kapandi === false) out.push(`KAPANIŞ REDDEDİLDİ — DCA ${ad(k.symbol)} kapanışı (${k.sebep}): ${k.hata || 'pozisyon kapanmadı'}`);
    return out;
  }

  /**
   * KÜÇÜK SERMAYE (S) — PLAN-SERMAYE-1000.md §3 / scripts/sermaye-1000.js kuralının canlı karşılığı.
   * Ay başında (ya da ilk çalışmada) hesaplanır, ay boyunca sabit. Filtreler işlem borsasının pazarından.
   * n yalnız o sembolde açık DCA pozisyonu yokken değişir. `kucukSermaye`: true | false | 'oto' (F < 5000).
   * @returns null (kapalı) | { ay, F, L, uygun[], n{}, me{}, disarida[] }
   */
  _kucukSermaye({ U, mumlar, ozsermaye, kolM, agirlik, simdi, kuru }) {
    const KS = require('./kucukSermaye');
    if (!KS.etkinMi(this.ayar.kucukSermaye, ozsermaye)) { if (!kuru && this.durum.S) { this.durum.S = null; } return null; }
    const ay = ayBasiMs(simdi);
    const eski = this.durum.S;
    if (eski && eski.ay === ay && eski.evrenImza === U.join(',')) return eski;
    const borsa = this.y.borsa;
    const me = {};
    for (const s of U) me[s] = KS.minEtkin(borsa.markets[s], KS.oncekiAyKapanis(mumlar.get(s), ay));
    const L = KS.Lsec(ozsermaye);
    const uygun = L == null ? [] : U.filter(s => me[s].deger <= L);
    const sec = KS.nSecTum(uygun.filter(s => mumlar.has(s)), (s) => me[s].deger, kolM * ozsermaye * agirlik.dca);
    const n = {};
    for (const [s, k] of sec) {
      const once = eski && eski.n ? eski.n[s] : undefined;
      n[s] = (once != null && once !== k && this.dca.pozisyon(s).miktar > 0) ? once : k;   // açık deal varken n değişmez
    }
    const S = { ay, ayStr: new Date(ay).toISOString().slice(0, 7), F: ozsermaye, L, uygun, n, me, evrenImza: U.join(','),
      disarida: U.filter(s => !uygun.includes(s)), dcaDisi: uygun.filter(s => !(s in n)) };
    if (!kuru) this.durum.S = S;
    this.kaydet('INFO', `Kairos-S ${new Date(ay).toISOString().slice(0, 7)}: F ${ozsermaye.toFixed(0)} → L ${L ?? 'yok'} · uygun ${uygun.length}/${U.length}${S.disarida.length ? ` (dışarıda: ${S.disarida.map(x => x.split('/')[0]).join(', ')})` : ''} · DCA n: ${Object.entries(n).map(([s, k]) => `${s.split('/')[0]} ${k}`).join(', ') || '—'}`);
    return S;
  }

  // ── Zamanlama ───────────────────────────────────────────────────────────
  /** Dakikada bir: dolum takibi; UTC gün değiştikten 2 dk sonra günlük çalışma. */
  async _tik(simdi = Date.now()) {
    if (!this.durum.calisiyor || !this.y.borsa || this.mesgul) return;
    if (this.y.durum === 'DURDURULDU' && typeof this.y.otomatikCikis === 'function') {
      // F2: geri çekilme / belirsiz sonuç kaynaklı durdurma → süre bitince yürütücü kendisi mutabakat yapar;
      // AKTIF'e dönünce yalnız yürütücü durumundan doğan ENGEL kol mutabakatıyla yeniden değerlendirilir.
      this.mesgul = true;
      try {
        const r = await this.y.otomatikCikis();
        if (r && this.y.durum === 'AKTIF' && this.durum.engel && /^yürütücü /.test(this.durum.engel)) await this.mutabakat();
      } catch (e) { this.kaydet('WARN', `Kalkan otomatik mutabakat: ${e.message}`); }
      finally { this.mesgul = false; }
    }
    if (this.y.durum !== 'AKTIF') return;
    this.mesgul = true;
    try {
      if (typeof this.y.borsa.tikle === 'function') await this.y.borsa.tikle(simdi);
      const s = await this.dca.senkron();
      if (s.hatalar.length) this.kaydet('WARN', `Kalkan DCA senkron: ${s.hatalar.join(' · ')}`);
      const dun = new Date(simdi - GUN).toISOString().slice(0, 10);
      if (this.durum.sonGun !== dun && simdi % GUN >= 2 * 60000 && !this.durum.engel) await this.calistir({ simdi });
    } catch (e) { this.kaydet('ERROR', `Kalkan botu: ${e.message}`); }
    finally { this.mesgul = false; }
  }

  baslat() {
    this.durum.calisiyor = true; this._yaz();
    if (!this.zamanlayici) this.zamanlayici = setInterval(() => this._tik(), 60000);
    this.kaydet('INFO', `Kalkan botu başlatıldı (sermaye tavanı ${this.ayar.sermayeTavani} USDT)`);
  }

  durdur() {
    this.durum.calisiyor = false; this._yaz();
    if (this.zamanlayici) { clearInterval(this.zamanlayici); this.zamanlayici = null; }
    this.kaydet('INFO', 'Kalkan botu durduruldu (pozisyon ve emirler KAPATILMADI — gerekirse acil durdurma)');
  }

  /**
   * ACİL: yürütücünün acil durdurması (bizim emirler iptal, pozisyonlar
   * piyasadan), sonra kol durumları sıfırlanır: DCA deal'leri kapanmış sayılır,
   * Donchian sanal pozisyonu düzeltmeyle 0'a çekilir. Engel kalkar.
   */
  async acilDurdur(sebep = 'kullanıcı') {
    this.durdur();
    const rapor = await this.y.acilDurdur(sebep);
    this.dca.sifirla(`acil durdurma (${sebep})`);
    const don = this.donSanal();
    const duz = { ...(this.durum.donDuzeltme || {}) };
    for (const [s, q] of Object.entries(don)) duz[s] = (duz[s] || 0) - q;
    this.durum.donDuzeltme = duz;
    this.durum.engel = null;
    this._yaz();
    return rapor;
  }

  /**
   * 73.8 KAYIT EŞİTLEME (Y-03/Y-33, kullanıcı aracı — lib/sorunAraclari.js planlar): acilDurdur'daki kol sıfırlamasının TEK sembollü,
   * EMİRSİZ hâli. `donEk`: Donchian düzeltmesine eklenecek miktar (sanal = borsa netine çekilir); `dcaSifirla`: DCA deal'i kapanmış
   * sayılır. Engel burada KALKMAZ — kol engeli yalnız temiz mutabakatla kalkar ("Borsayla karşılaştır").
   */
  kayitEsitle(symbol, { donEk = 0, dcaSifirla = false, sebep = 'kayıt eşitleme' } = {}) {
    if (Number.isFinite(donEk) && donEk !== 0) {
      const duz = { ...(this.durum.donDuzeltme || {}) };
      duz[symbol] = +((duz[symbol] || 0) + donEk).toFixed(12);
      this.durum.donDuzeltme = duz;
    }
    const dca = dcaSifirla ? this.dca.sembolSifirla(symbol, sebep) : false;
    this._yaz();
    this.kaydet('WARN', `Kalkan: ${symbol} kaydı borsaya eşitlendi (${sebep}) — Donchian düzeltme ${donEk || 0}${dca ? ', DCA deal kapandı' : ''}; emir gönderilmedi`);
    return { donEk: donEk || 0, dcaSifirlandi: dca };
  }

  /** 73.8 (Y-04): kalıcı risk durumu (K3 mandalı, tepe) — salt okuma. */
  riskDurumu() { return this.riskDosya ? RD.yukle(this.riskDosya) : (this._riskBellek || RD.bos()); }
  /** 73.8 (Y-04, kullanıcı aracı): K3 mandalını elle sıfırlar — `killSifirla` (yeni tepe = son kayıtlı özsermaye). */
  riskSifirla() {
    const once = this.riskDurumu();
    const yeni = RD.killSifirla(once);
    if (this.riskDosya) RD.kaydet(yeni, this.riskDosya); else this._riskBellek = yeni;
    this.kaydet('WARN', `Kalkan risk: K3 zarar sınırı ELLE sıfırlandı (kill ${once.kill || 0} → 0, yeni tepe ${yeni.hwm})`);
    return { once, yeni };
  }

  ozet() {
    return {
      calisiyor: this.durum.calisiyor, sonGun: this.durum.sonGun, engel: this.durum.engel,
      ortam: this.y.ortam, yurutucu: this.y.borsa ? this.y.durum : 'BAGLI_DEGIL',
      sermayeTavani: this.ayar.sermayeTavani,
      evren: this.evren.ozet(), donchianSanal: this.donSanal(), dca: this.dca.ozet(),
      agirlikGecmisi: (this.durum.agirlikGecmisi || []).slice(-10), sonMutabakat: this.durum.sonMutabakat, sonRapor: this.durum.sonRapor,
    };
  }
}

module.exports = { KalkanBot, tersVolAgirlik, donchianModelGetirisi, dcaModelGetirisi, PENCERE };
