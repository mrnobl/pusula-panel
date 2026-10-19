/**
 * DİKKAT F1 — İLERİYE DÖNÜK HAM ARŞİV (günlük koşu, manifest zinciri, kota, kilit). PLAN-DIKKAT-LISTESI.md §3 F1,
 * ön kayıt PLAN-DIKKAT-V1-ONKAYIT.md §1 + EK-1 (A4 paydası, A5) + "EK-1 düzeltme (denetim 2)". LİSTE ÜRETMEZ (F2).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * KİPLER (kullanıcı kararı 2026-10-09)
 *   resmî   `--resmi` bayrağıyla (Görev Zamanlayıcı: `--neden zamanlanmis --resmi`). Kök: data/tarama/. İlk resmî gün manifestte
 *           `baslangic: true`. 30 kayıt günü / 7 gün kesintisiz sayaçları YALNIZ bu manifesti sayar. Kaçan gün → `bosluk` satırı.
 *   deneme  bayraksız her koşu (ör. geliştirme makinesinde `--neden elle`). Kök: data/tarama/deneme/ — ayrı manifest
 *           (`resmi: false`), ayrı zincir eşlemesi ve durum; resmî sayaçlara HİÇ girmez. Aynı gün yeniden koşu yalnız `--zorla`.
 *
 * DİZİN (kök = data/tarama[/deneme]; manifestte YALNIZ göreli yol — klasör başka makineye kopyalanınca zincir doğrulanır)
 *   evren/YYYY-MM-DD.jsonl         giren VE elenen her aday + neden + ölçümler (lib/tarama/evren.js)
 *   evren/zincir.json              kalıcı zincir eşlemesi (ilk izleme günü sabitlenir, asla değişmez)
 *   evren/durum.json               izleme durumu (CEX ilk görülme, izleme günleri, GitHub önbelleği, Coin Metrics tam döküm)
 *   arsiv/YYYY-MM-DD/kesif.json    keşif uçlarının ayrıştırılmış yanıtları + uç durumları
 *   arsiv/YYYY-MM-DD/toplu.json    toplu ham veri (borsa listeleri/hacimleri, OKX spot + USDT perp tabanları, DefiLlama protokol/ücret/gelir, CoinGecko piyasa)
 *   (dikkat.jsonl CEX satırlarındaki `okxPerp` yalnız bilgi — PLAN-DIKKAT-LS §8.4; kural-v1/evren-v1'e girmez)
 *   arsiv/YYYY-MM-DD/anlik.jsonl   izlenen her token için kaynak başına ham görüntü + durum
 *   arsiv/YYYY-MM-DD/baglam.json   Coin Metrics (günlük ek, status), BGeometrics, Bitview, DefiLlama stablecoin
 *   arsiv/YYYY-MM-DD/coinmetrics-tam.jsonl   yalnız ilk koşu (tam döküm)
 *   arsiv/YYYY-MM-DD/kosu.json     koşu özeti (neden, kip, süre, kaynak başına ok/boş/hata/kota/uygulanmaz)
 *   arsiv/manifest.jsonl           YALNIZ EKLENİR: gün başına { dosyalar:[{yol, sha256, bayt}], onceki, ozet } (listeler.jsonl deseni)
 *   gunluk.kilit                   (kök data/tarama) iki kip için ORTAK kilit — eşzamanlı iki koşu olmaz
 * Ay sonu: önceki ayların gün dosyaları gzip'lenir (*.gz); manifest SHA'sı sıkıştırılmamış içeriğindir, doğrulama açarak bakar.
 *
 * DURUM SÖZLÜĞÜ (EK-1 düzeltme madde 1 — payda kuralı)
 *   ok          kaynak cevap verdi, veri var                         payda: gözlendi
 *   bos         kaynak cevap verdi, bu token için veri yok            payda: gözlendi-boş (F2 kapı kodu yorumlar)
 *   onbellek    önceki günün değeri (GitHub haftalık tazeleme)       payda: gözlendi (kaynakZamani ile)
 *   hata        çağrıldı, başarısız (ağ, 5xx, zaman aşımı, 4xx)       payda: BİLİNMİYOR
 *   kota        bütçe / hız sınırı yüzünden bugün çağrılmadı (GitHub vb. "ertelendi")   payda: BİLİNMİYOR
 *   belirsiz    CEX tabanının CoinGecko eşlemesi tek anlamlı değil (EK-2 c) payda: BİLİNMİYOR
 *   uygulanmaz  yapısal yokluk (ağa uygun değil, repo yok, sözleşme yok; DefiLlama/CoinGecko eşlemesi yok — YALNIZ eşleme
 *               uçları o gün BAŞARILIYSA; uç hatasında "hata")                                         payda: DIŞINDA
 *
 * KOTA: günlük çağrı sayısı F0 ile ORTAK dosyada (data/dikkat/kota-YYYY-MM-DD.json, `istek[kaynak]`; DIKKAT_DIZIN). BGeometrics
 * günde ≤ 1 (F0 envanteri o gün kullandıysa F1 "kota" yazar). GoPlus ayda ≤ AYLIK_BUTCE. GitHub anahtarsız 60/sa: koşu başına
 * ≤ 50 istek + `x-ratelimit-remaining` ≤ 5 olunca durur; her org en çok haftada bir tazelenir (öncelik: hiç bakılmamış → en eski).
 * İLERİYE BAKIŞ YOK: gün = koşunun başladığı UTC günü; yalnız o günün dosyaları yazılır, geçmiş güne dosya yazılmaz.
 * lib/live, lib/risk ve canlı bot koduna dokunmaz. Binance istekleri veri orkestratörünün BinanceKota'sından geçer.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { dizinler, atomikYaz, jsonOku, satirlariOku, kanonik, sha256, gunStr, temizMetin, sayi, surecCanli, klasor } = require('./ortak');
const { Istemci } = require('./http');
const { AGLAR } = require('./aglar');
const { KAYNAKLAR } = require('./kaynaklar');
const E = require('./evren');
const DT = require('./dikkatTakip');
const IT = require('./izleTakip');

const SURUM = 1;
const SIFIR = '0'.repeat(64);
const KILIT_OMUR_MS = 6 * 3600e3;
const UA = 'Pusula-dikkat-arsiv/F1 (+yerel arastirma)';

/** Günlük çağrı bütçesi (katalog adı → istek). [Ö] GoPlus CU/çağrı belgelenmemiş; ilk ay kota dosyasından ölçülür. */
const GUNLUK_BUTCE = Object.freeze({
  bgeometrics: 1, rdap: 150, goplus: 800, rugcheck: 400, 'geckoterminal-kesif': 40, 'geckoterminal-holder': 140, 'dexscreener-kesif': 1500, 'coingecko-trend': 60, github: 50,
  coinmetrics: 120, bitview: 30, snapshot: 60, 'defillama-tvl': 30, 'defillama-ucret': 30, 'defillama-stablecoin': 30, 'binance-borsa': 40, 'bybit-borsa': 15, 'okx-borsa': 15,
});
const AYLIK_BUTCE = Object.freeze({ goplus: 24000 });
const GITHUB_TAZE_GUN = 7;
const CAGRI_BEKCI_MS = 120e3;
const KAYNAK_SURE_MS = 30 * 60e3;  // token kaynağı başına koşu süresi bütçesi; dolunca kalanlar "kota (ertelendi)" — gece görevi uzayıp ertesi güne taşmasın   // tek token çağrısı (yeniden denemeler dahil) en çok 2 dk — takılan çağrı koşuyu kilitlemesin
/** Süre bekçisi: söz verilen iş ms içinde bitmezse "hata (süre aşımı)" ile reddedilir. */
function bekci(is, ms, ad) {
  let zaman;
  return Promise.race([Promise.resolve(is).finally(() => clearTimeout(zaman)), new Promise((_, red) => { zaman = setTimeout(() => red(new Error(`süre bekçisi: ${ad} ${Math.round(ms / 1000)} sn'de bitmedi`)), ms); if (zaman.unref) zaman.unref(); })]);
}
const CM_METRIKLER = Object.freeze(['CapMVRVCur', 'FlowInExNtv', 'FlowOutExNtv', 'AdrActCnt', 'SplyCur', 'CapMrktCurUSD', 'PriceUSD']);
const CM_EK_GUN = 14;
const BITVIEW_SERILER = Object.freeze(['mvrv', 'realized_price', 'sopr_24h']);
const PAYDA = Object.freeze({ ok: 'gozlendi', bos: 'gozlendi-bos', onbellek: 'gozlendi', hata: 'bilinmiyor', kota: 'bilinmiyor', belirsiz: 'bilinmiyor', uygulanmaz: 'disinda' });

const S = {
  ok: (ham, ek) => ({ durum: 'ok', ham, ...(ek || {}) }),
  bos: (neden, ham) => ({ durum: 'bos', neden, ...(ham ? { ham } : {}) }),
  hata: (hata) => ({ durum: 'hata', hata: temizMetin(hata, 160) }),
  kota: (neden) => ({ durum: 'kota', neden }),
  uyg: (neden) => ({ durum: 'uygulanmaz', neden }),
  belirsiz: (neden) => ({ durum: 'belirsiz', neden }),
  onb: (ham, kaynakZamani) => ({ durum: 'onbellek', ham, kaynakZamani }),
};

// ── Dizinler ─────────────────────────────────────────────────────────────
function kokDizin(o = {}) { const t = dizinler(o).dizin; return o.resmi ? t : path.join(t, 'deneme'); }
function yollar(kok) {
  return { kok, evren: path.join(kok, 'evren'), arsiv: path.join(kok, 'arsiv'), manifest: path.join(kok, 'arsiv', 'manifest.jsonl'),
    durum: path.join(kok, 'evren', 'durum.json'), zincir: path.join(kok, 'evren', 'zincir.json') };
}
const goreli = (kok, p) => path.relative(kok, p).split(path.sep).join('/');
const mutlak = (kok, g) => path.join(kok, ...String(g).split('/'));

// ── Kota (F0 ile ortak dosya) ────────────────────────────────────────────
class Kota {
  constructor({ dizin, gun, butce = GUNLUK_BUTCE, aylik = AYLIK_BUTCE } = {}) {
    this.dizin = dizin || require('./kaynakSagligi').envanterDizini();
    this.gun = gun; this.butce = butce; this.aylik = aylik;
    this.dosya = path.join(this.dizin, `kota-${gun}.json`);
    this.k = jsonOku(this.dosya, null) || { gun, istek: {} };
    if (!this.k.istek) this.k.istek = {};
    this.bu = {};          // bu koşunun harcaması
    this.ay = {};
    for (const ad of Object.keys(aylik)) this.ay[ad] = this._ayToplam(ad);
  }
  _ayToplam(ad) {
    let top = 0;
    try {
      for (const f of fs.readdirSync(this.dizin)) {
        if (!f.startsWith(`kota-${this.gun.slice(0, 7)}`) || f === `kota-${this.gun}.json`) continue;
        const j = jsonOku(path.join(this.dizin, f), null); top += (j && j.istek && j.istek[ad]) || 0;
      }
    } catch { /* dizin yok */ }
    return top;
  }
  kullanim(ad) { return this.k.istek[ad] || 0; }
  izin(ad) {
    const b = this.butce[ad];
    if (b != null && this.kullanim(ad) >= b) return false;
    const a = this.aylik[ad];
    if (a != null && this.ay[ad] + this.kullanim(ad) >= a) return false;
    return true;
  }
  say(ad) { this.k.istek[ad] = this.kullanim(ad) + 1; this.bu[ad] = (this.bu[ad] || 0) + 1; if (Object.values(this.bu).reduce((s, v) => s + v, 0) % 50 === 0) this.kaydet(); }
  /**
   * Birleştirerek yaz (denetim 11): diskteki değer + bu koşunun SON KAYITTAN BU YANA harcaması. Koşu sırasında F0 ya da başka
   * bir süreç aynı dosyaya yazdıysa onun sayımı ezilmez.
   */
  kaydet() {
    try {
      this.yazilan = this.yazilan || {};
      const disk = jsonOku(this.dosya, null) || { gun: this.gun, istek: {} };
      if (!disk.istek) disk.istek = {};
      for (const [a, n] of Object.entries(this.bu)) {
        const fark = n - (this.yazilan[a] || 0);
        if (fark > 0) disk.istek[a] = (disk.istek[a] || 0) + fark;
        this.yazilan[a] = n;
      }
      this.k = disk;
      klasor(this.dizin); atomikYaz(this.dosya, JSON.stringify(disk, null, 1));
    } catch { /* kota dosyası yazılamadı: koşu sürer */ }
  }
}

// ── Manifest (listeler.jsonl zincir deseni) ──────────────────────────────
const ozetHesapla = (k) => { const { ozet, ...g } = k; return sha256(kanonik(g)); };
function dosyaOku(kok, g) {
  const p = mutlak(kok, g);
  try { return fs.readFileSync(p); } catch { /* sıkıştırılmış olabilir */ }
  try { return zlib.gunzipSync(fs.readFileSync(p + '.gz')); } catch { return null; }
}
function manifestOku(kok) { return satirlariOku(yollar(kok).manifest); }

/**
 * Zincir doğrulama. @param o { dosyaGun: n | Infinity } son n 'gun' satırının dosya SHA'larını da sına (varsayılan hepsi).
 * @returns { gecerli, satir, gunSayisi, bosluklar: [gun], sonGun, kesintisiz, baslangic, hatalar: [{no, gun, neden}], dosyaSinanan }
 */
function dogrula(kok, o = {}) {
  const Y = yollar(kok);
  let metin = '';
  try { metin = fs.readFileSync(Y.manifest, 'utf8'); } catch { /* yok */ }
  const satirlar = metin.split('\n').filter(s => s.trim());
  const hatalar = []; const kayitlar = [];
  let onceki = SIFIR;
  satirlar.forEach((s, i) => {
    const no = i + 1;
    let k;
    try { k = JSON.parse(s); } catch { hatalar.push({ no, neden: 'satır JSON değil (bozulmuş)' }); onceki = null; return; }
    kayitlar.push(k);
    if (k.no !== no) hatalar.push({ no, gun: k.gun, neden: `sıra numarası ${k.no} (beklenen ${no})` });
    if (onceki !== null && k.onceki !== onceki) hatalar.push({ no, gun: k.gun, neden: 'önceki satırın özetiyle bağ kopuk (satır silinmiş/değişmiş)' });
    if (ozetHesapla(k) !== k.ozet) hatalar.push({ no, gun: k.gun, neden: 'satır özeti tutmuyor (sonradan değiştirilmiş)' });
    onceki = k.ozet;
  });
  for (let i = 1; i < kayitlar.length; i++) if (!(kayitlar[i].gun > kayitlar[i - 1].gun)) hatalar.push({ no: i + 1, gun: kayitlar[i].gun, neden: 'gün sırası bozuk (aynı gün iki kez / geri)' });
  const gunler = kayitlar.filter(k => k.tur === 'gun');
  const sinanacak = new Set(gunler.slice(-(o.dosyaGun == null ? Infinity : o.dosyaGun)).map(k => k.no));
  let dosyaSinanan = 0;
  for (const k of gunler) {
    if (!sinanacak.has(k.no)) continue;
    for (const d of k.dosyalar || []) {
      if (path.isAbsolute(d.yol) || /\.\.|\\/.test(d.yol)) { hatalar.push({ no: k.no, gun: k.gun, neden: `mutlak/geçersiz yol: ${d.yol}` }); continue; }
      const b = dosyaOku(kok, d.yol);
      dosyaSinanan++;
      if (!b) hatalar.push({ no: k.no, gun: k.gun, neden: `dosya yok: ${d.yol}` });
      else if (sha256Buf(b) !== d.sha256) hatalar.push({ no: k.no, gun: k.gun, neden: `dosya değişmiş (SHA tutmuyor): ${d.yol}` });
    }
  }
  let kesintisiz = 0;
  for (let i = kayitlar.length - 1; i >= 0; i--) {
    const k = kayitlar[i];
    if (k.tur !== 'gun') break;
    if (i < kayitlar.length - 1 && E.gunFark(k.gun, kayitlar[i + 1].gun) !== 1) break;
    kesintisiz++;
  }
  const son = kayitlar[kayitlar.length - 1] || null;
  const bas = kayitlar.find(k => k.baslangic) || null;
  return { gecerli: hatalar.length === 0, satir: satirlar.length, gunSayisi: gunler.length, bosluklar: kayitlar.filter(k => k.tur === 'bosluk').map(k => k.gun),
    sonGun: gunler.length ? gunler[gunler.length - 1].gun : null, sonSatirGun: son ? son.gun : null, kesintisiz, baslangic: bas ? bas.gun : null,
    sonOzet: son ? son.ozet : SIFIR, hatalar, dosyaSinanan };
}
const sha256Buf = (b) => require('crypto').createHash('sha256').update(b).digest('hex');

// ── Evren eşikleri (§1.4 + A5; dikkatTakip N14): manifest zincirine BİR KEZ yazılan evren/esik-v1.json ──
const ESIK_DOSYA = 'evren/esik-v1.json';
const esikAyni = (a, b) => a.V_cex === b.V_cex && a.L_dex === b.L_dex && a.V_dex === b.V_dex && a.t0 === b.t0;
/**
 * Zincirdeki eşik dosyasını okur ve doğrular. @returns null (henüz yok) | { V_cex, L_dex, V_dex, t0, …, kayitGunu }
 * Hata (koşu durur): dosya zincirde yok ama diskte var; zincirde var ama diskte yok / SHA tutmuyor; evren.ESIKLER_V1 doluysa ve çelişiyorsa.
 */
function esikOku(kok, manifestSatirlari) {
  const m = manifestSatirlari || manifestOku(kok).satirlar;
  let kayit = null;
  for (const k of m) if (k.tur === 'gun') { const d = (k.dosyalar || []).find(x => x.yol === ESIK_DOSYA); if (d) { kayit = { gun: k.gun, sha: d.sha256 }; break; } }
  const b = dosyaOku(kok, ESIK_DOSYA);
  if (!kayit) {
    if (b) throw new Error(`${ESIK_DOSYA} diskte var ama manifest zincirinde yok — elle yazılmış olabilir; koşu durduruldu`);
    return null;
  }
  if (!b) throw new Error(`${ESIK_DOSYA} manifestte (${kayit.gun}) var ama dosya yok; koşu durduruldu`);
  if (sha256Buf(b) !== kayit.sha) throw new Error(`${ESIK_DOSYA} SHA'sı manifestle tutmuyor (değiştirilmiş); koşu durduruldu`);
  const e = JSON.parse(b.toString('utf8'));
  if (E.ESIKLER_V1 && !esikAyni(E.ESIKLER_V1, e)) throw new Error(`evren.ESIKLER_V1 (${JSON.stringify(E.ESIKLER_V1)}) zincirdeki eşik dosyasıyla çelişiyor; koşu durduruldu`);
  return { ...e, kayitGunu: kayit.gun };
}
/**
 * Bugünün eşikleri: zincirde varsa o; yoksa ve bugünden önce ≥ 30 kayıt günü varsa İLK 30 kayıt gününden mekanik hesap (evren.esikHesapla)
 * → { esikler, yeni } (yeni = bugün zincire yazılacak dosya içeriği). t0 = 30. kayıt günü + 2 takvim günü (A5).
 */
function esikHazirla(kok, manifestSatirlari, gun, okuyucu = dosyaOku) {
  const var0 = esikOku(kok, manifestSatirlari);
  if (var0) return { esikler: var0, yeni: null };
  const kayit = manifestSatirlari.filter(k => k.tur === 'gun' && k.gun < gun).map(k => k.gun).sort();
  if (kayit.length < E.ESIK_GUN && E.ESIKLER_V1) throw new Error('evren.ESIKLER_V1 dolu ama 30 kayıt günü yok ve zincirde eşik dosyası yok — sessiz seçim yapılmaz; koşu durduruldu');
  if (kayit.length < E.ESIK_GUN) return { esikler: null, yeni: null, neden: `${kayit.length}/${E.ESIK_GUN} kayıt günü` };
  const ilk = kayit.slice(0, E.ESIK_GUN);
  const gunler = ilk.map(g => { const b = okuyucu(kok, `evren/${g}.jsonl`); return { gun: g, satirlar: b ? b.toString('utf8').split('\n').filter(x => x.trim()).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean) : [] }; });
  const r = E.esikHesapla(gunler);
  if (!r.tamam) return { esikler: null, yeni: null, neden: r.neden };
  const t0 = gunStr(Date.parse(`${ilk[ilk.length - 1]}T00:00:00Z`) + 2 * 864e5);
  const yeni = { surum: E.EVREN_SURUM, V_cex: r.V_cex, L_dex: r.L_dex, V_dex: r.V_dex, t0, kullanilanGunler: r.kullanilan, kesintisiz: r.kesintisiz, tablo: r.tablo,
    kural: 'PLAN-DIKKAT-V1-ONKAYIT §1.4 + EK-1 A5 (dikkatTakip N14)', hesaplandi: gun };
  if (E.ESIKLER_V1 && !esikAyni(E.ESIKLER_V1, yeni)) throw new Error(`evren.ESIKLER_V1 (${JSON.stringify(E.ESIKLER_V1)}) mekanik eşik hesabıyla çelişiyor; koşu durduruldu`);
  return { esikler: yeni, yeni };
}

function manifestEkle(kok, govde) {
  const Y = yollar(kok);
  const m = manifestOku(kok).satirlar;
  const son = m[m.length - 1] || null;
  const k = { surum: SURUM, no: m.length + 1, ...govde, onceki: son ? son.ozet : SIFIR };
  k.ozet = ozetHesapla(k);
  klasor(path.dirname(Y.manifest));
  fs.appendFileSync(Y.manifest, JSON.stringify(k) + '\n', 'utf8');
  return k;
}

// ── Kilit (iki kip ortak) ────────────────────────────────────────────────
class KilitHatasi extends Error {}
function kilitYolu(o) { return path.join(dizinler(o).dizin, 'gunluk.kilit'); }
function kilitDurumu(o = {}, simdi = Date.now()) {
  const k = jsonOku(kilitYolu(o), null);
  if (!k) return null;
  const bayat = !(simdi - Date.parse(k.bas || 0) < KILIT_OMUR_MS) || (k.pid !== process.pid && !surecCanli(k.pid));
  return { ...k, bayat };
}
function kilitAl(o, bilgi, simdi) {
  const p = kilitYolu(o);
  klasor(path.dirname(p));
  const yaz = () => { const fd = fs.openSync(p, 'wx'); fs.writeSync(fd, JSON.stringify({ pid: process.pid, bas: new Date(simdi).toISOString(), ...bilgi })); fs.closeSync(fd); };
  try { yaz(); return; } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const k = kilitDurumu(o, simdi);
  if (k && !k.bayat) throw new KilitHatasi(`günlük arşiv başka bir süreçte sürüyor (pid ${k.pid}, ${k.bas}'den beri, ${k.kip || '?'})`);
  // Bayat kilidi devralma (denetim 11): kilit dosyası önce benzersiz bir adla YERİNE TAŞINIR (rename atomik; iki süreçten yalnız
  // biri başarır), sonra wx ile yeni kilit tek atomik adımda oluşturulur. Silme + yeniden oluşturma yarışı (birinin yeni kilidini
  // diğerinin silmesi) böylece olmaz.
  const bayat = `${p}.bayat-${process.pid}-${simdi}`;
  let tasindi = false;
  try { fs.renameSync(p, bayat); tasindi = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (tasindi) {
    const t = jsonOku(bayat, null);
    if (k && t && (t.pid !== k.pid || t.bas !== k.bas)) {   // arada başka süreç taze kilit yazmış: geri koy, çekil
      try { fs.renameSync(bayat, p); } catch { /* yok */ }
      throw new KilitHatasi(`günlük arşiv başka bir süreçte yeni başladı (pid ${t.pid})`);
    }
    try { fs.unlinkSync(bayat); } catch { /* yok */ }
  }
  try { yaz(); } catch (e) { if (e.code === 'EEXIST') throw new KilitHatasi('günlük arşiv başka bir süreçte yeni başladı'); throw e; }
}
function kilitBirak(o) { const p = kilitYolu(o); const k = jsonOku(p, null); if (k && k.pid === process.pid) { try { fs.unlinkSync(p); } catch { /* yok */ } } }

// ── Ay sonu sıkıştırma ───────────────────────────────────────────────────
/** Bu aydan önceki ayların gün dosyalarını gzip'ler (içerik doğrulanarak). @returns sıkıştırılan dosya sayısı */
function eskiAylariSikistir(kok, gun) {
  const Y = yollar(kok); const ay = gun.slice(0, 7); let n = 0;
  const sikistir = (p) => {
    const b = fs.readFileSync(p);
    const gz = zlib.gzipSync(b, { level: 9 });
    if (sha256Buf(zlib.gunzipSync(gz)) !== sha256Buf(b)) return;
    fs.writeFileSync(p + '.gz', gz); fs.unlinkSync(p); n++;
  };
  try { for (const f of fs.readdirSync(Y.evren)) if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 7) < ay) sikistir(path.join(Y.evren, f)); } catch { /* yok */ }
  try {
    for (const d of fs.readdirSync(Y.arsiv)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d.slice(0, 7) >= ay) continue;
      for (const f of fs.readdirSync(path.join(Y.arsiv, d))) if (!f.endsWith('.gz')) sikistir(path.join(Y.arsiv, d, f));
    }
  } catch { /* yok */ }
  return n;
}

// ── Önceki günlerin evren ölçümleri (7 kayıt günü medyanı) ────────────────
function oncekiOlcumler(kok, manifestSatirlari, bugun, n = E.MEDYAN_GUN - 1) {
  const gunler = manifestSatirlari.filter(k => k.tur === 'gun' && k.gun < bugun).slice(-n).map(k => k.gun);
  const m = new Map();
  for (const g of gunler) {
    const b = dosyaOku(kok, `evren/${g}.jsonl`);
    if (!b) continue;
    for (const s of b.toString('utf8').split('\n')) {
      if (!s.trim()) continue;
      let r; try { r = JSON.parse(s); } catch { continue; }
      if (!r.anahtar || !r.olcum) continue;
      if (!m.has(r.anahtar)) m.set(r.anahtar, []);
      m.get(r.anahtar).push({ gun: g, hacim24: r.olcum.hacim24 });
    }
  }
  return { gunler, m };
}

/** OKX `instruments?instType=SWAP` → USDT ile uzlaşan doğrusal, işlemdeki perp'lerin tabanları (Binance gibi çarpan öneki ayıklanır). YALNIZ BİLGİ. */
function okxPerpTabanlari(veri) {
  const out = new Set();
  for (const x of (veri && Array.isArray(veri.data) ? veri.data : [])) {
    if (!x || x.state !== 'live' || x.settleCcy !== 'USDT' || (x.ctType != null && x.ctType !== 'linear')) continue;
    const b = String(x.uly || x.instFamily || x.instId || '').split('-')[0].toUpperCase();
    if (/^[A-Z0-9]{1,20}$/.test(b)) out.add(E.perpTaban(b).taban);
  }
  return out;
}

// ── HTTP yardımcıları ────────────────────────────────────────────────────
function cagirici({ http, kota, fetch: f, uyu, simdi, binanceKota }) {
  const fetchFn = f || ((...a) => globalThis.fetch(...a));
  const uclar = [];   // uç durumları (kosu.json)
  const not = (ad, uc, r) => { uclar.push({ kaynak: ad, uc: uc.replace(/\?.*$/, ''), ok: !!r.ok, durum: r.ok ? 'ok' : r.kota ? 'kota' : 'hata', http: r.durum || null, hata: r.ok ? null : temizMetin(r.hata, 120) }); };
  async function al(ad, url, sec = {}) {
    if (!kota.izin(ad)) { const r = { ok: false, kota: true, hata: 'günlük/aylık bütçe doldu' }; if (!sec.sessiz) not(ad, url, r); return r; }
    kota.say(ad);
    const r = await http.json(url, { ...sec, basliklar: { 'user-agent': UA, ...(sec.basliklar || {}) } });
    if (!sec.sessiz) not(ad, sec.ucEtiket || url, r);   // ucEtiket: aynı yolu farklı sorgu ile çağıran uçları kosu.json'da ayırır
    return r;
  }
  async function binance(url, market) {
    const ad = 'binance-borsa';
    if (!kota.izin(ad)) { const r = { ok: false, kota: true, hata: 'bütçe doldu' }; not(ad, url, r); return r; }
    kota.say(ad);
    const cagir = async () => {
      const r = await http.json(url, { host: `binance-${market}`, araMs: 300, denemeler: 1, zamanAsimiMs: 30000,
        basliklarCb: (h) => { if (binanceKota) binanceKota.agirlikYaz(market, h('x-mbx-used-weight-1m')); } });
      if (r.hiz) { const e = new Error(`HTTP ${r.durum} ${url.replace(/\?.*$/, '')}`); e.retryAfter = r.retryAfter; throw e; }
      return r;
    };
    let r;
    try { r = binanceKota ? await binanceKota.istek(market, null, cagir) : await cagir(); } catch (e) { r = { ok: false, durum: 429, hata: e.message, hiz: true }; }
    not(ad, url, r);
    return r;
  }
  async function post(ad, url, govde, { host, araMs = 1200 } = {}) {
    if (!kota.izin(ad)) { const r = { ok: false, kota: true, hata: 'bütçe doldu' }; not(ad, url, r); return r; }
    kota.say(ad);
    const t0 = simdi();
    let r;
    try {
      const y = await fetchFn(url, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': UA }, body: JSON.stringify(govde), signal: AbortSignal.timeout(30000) });
      const metin = await y.text();
      let veri = null; try { veri = JSON.parse(metin); } catch { /* json değil */ }
      r = y.ok && veri ? { ok: true, durum: y.status, veri, ms: simdi() - t0 } : { ok: false, durum: y.status, hata: `HTTP ${y.status}${veri ? '' : ', JSON değil'}` };
    } catch (e) { r = { ok: false, durum: 0, hata: `ağ hatası: ${String((e && e.message) || e).slice(0, 100)}` }; }
    await uyu(araMs);
    not(ad, url, { ...r, host });
    return r;
  }
  return { al, binance, post, uclar };
}

// ── Sıkıştırılmış toplu kayıtlar (seçilmiş alanlar) ──────────────────────
const protokolKisa = (p) => ({ id: temizMetin(p.id, 40), ad: temizMetin(p.name, 80), slug: temizMetin(p.slug, 80), sembol: temizMetin(p.symbol, 24), gecko: temizMetin(p.gecko_id, 80) || null,
  adres: temizMetin(p.address, 120) || null, kategori: temizMetin(p.category, 40), tvl: sayi(p.tvl), mcap: sayi(p.mcap), ebeveyn: temizMetin(p.parentProtocol, 80) || null,
  deadFrom: p.deadFrom ? temizMetin(p.deadFrom, 30) : null, rugged: p.rugged ? true : null, deprecated: p.deprecated ? true : null, listedAt: sayi(p.listedAt),
  github: Array.isArray(p.github) ? p.github.slice(0, 5).map(x => temizMetin(x, 60)) : null, yonetisim: Array.isArray(p.governanceID) ? p.governanceID.slice(0, 5).map(x => temizMetin(x, 120)) : null });
const ucretKisa = (p) => ({ id: temizMetin(p.defillamaId || p.id, 40), ad: temizMetin(p.name, 80), ebeveyn: temizMetin(p.parentProtocol, 80) || null, kategori: temizMetin(p.category, 40),
  t24: sayi(p.total24h), t7: sayi(p.total7d), t30: sayi(p.total30d), t1y: sayi(p.total1y) });

/** DefiLlama birim (ebeveyn varsa ebeveyn) eşlemesi: cgId → birim, adres → birim; birim: { id, ad, tvl, ucret, gelir, ... }. */
function llamaBirimleri(protokoller, ebeveynler, ucret, gelir) {
  const birim = new Map();
  const yer = (id, ad) => birim.get(id) || (birim.set(id, { id, ad, tvl: 0, tvlVar: false, mcap: null, kategori: null, github: new Set(), yonetisim: new Set(), olu: false, rugged: false, ucret: null, gelir: null, cocuk: 0 }), birim.get(id));
  for (const e of ebeveynler) {
    const b = yer(e.id, e.ad); b.mcap = e.mcap; (e.github || []).forEach(x => b.github.add(x)); (e.yonetisim || []).forEach(x => b.yonetisim.add(x));
  }
  for (const p of protokoller) {
    const b = yer(p.ebeveyn || p.id, p.ebeveyn ? null : p.ad);
    if (!b.ad) b.ad = p.ad;
    if (Number.isFinite(p.tvl)) { b.tvl += p.tvl; b.tvlVar = true; }
    if (b.mcap == null && Number.isFinite(p.mcap)) b.mcap = p.mcap;
    if (!b.kategori) b.kategori = p.kategori;
    (p.github || []).forEach(x => b.github.add(x)); (p.yonetisim || []).forEach(x => b.yonetisim.add(x));
    if (p.deadFrom) b.olu = true; if (p.rugged) b.rugged = true; b.cocuk++;
  }
  const cocukBirim = new Map(protokoller.map(p => [p.id, p.ebeveyn || p.id]));
  const topla = (liste, alan) => {
    if (!liste) return;
    for (const f of liste) {
      const b = birim.get(f.ebeveyn) || birim.get(cocukBirim.get(f.id)) || birim.get(f.id);
      if (!b) continue;
      const x = b[alan] || (b[alan] = { t24: 0, t7: 0, t30: 0, kayit: 0 });
      x.t24 += f.t24 || 0; x.t7 += f.t7 || 0; x.t30 += f.t30 || 0; x.kayit++;
    }
  };
  topla(ucret, 'ucret'); topla(gelir, 'gelir');
  const cg = new Map(); const adres = new Map();
  const birimId = (p) => p.ebeveyn || p.id;
  for (const e of ebeveynler) { if (e.gecko) cg.set(e.gecko, e.id); const a = E.llamaAdres(e.adres); if (a && a.ag && a.adres) adres.set(E.dexAnahtar(a.ag, a.adres), e.id); }
  for (const p of protokoller) {
    if (p.gecko && !cg.has(p.gecko)) cg.set(p.gecko, birimId(p));
    const a = E.llamaAdres(p.adres); if (a && a.ag && a.adres && !adres.has(E.dexAnahtar(a.ag, a.adres))) adres.set(E.dexAnahtar(a.ag, a.adres), birimId(p));
  }
  return { birim, cg, adres };
}
const birimHam = (b) => ({ birim: b.id, ad: b.ad, kategori: b.kategori, tvl: b.tvlVar ? Math.round(b.tvl) : null, mcap: b.mcap, ucret: b.ucret, gelir: b.gelir,
  olu: b.olu || null, rugged: b.rugged || null, github: [...b.github], yonetisim: [...b.yonetisim].filter(x => /^snapshot:/.test(x)) });

// ── Ana koşu ─────────────────────────────────────────────────────────────
/**
 * @param o { resmi, neden: 'elle'|'zamanlanmis', zorla, dizin?, fetch?, simdi?, uyu?, log?, binanceKota?, dikkatDizin?, butce? (test),
 *            tradfi?: Set, azami?: { kaynak: n } (bu koşu için ek tavan) }
 * @returns { durum: 'kaydedildi'|'zaten', gun, kip, ozet, manifest }
 */
async function gunlukKos(o = {}) {
  const simdi = o.simdi || (() => Date.now());
  const uyu = o.uyu || ((ms) => new Promise(r => setTimeout(r, ms)));
  const log = o.log || (() => {});
  const bas = simdi();
  const gun = gunStr(bas);
  const resmi = !!o.resmi;
  const neden = ['elle', 'zamanlanmis'].includes(o.neden) ? o.neden : 'elle';
  const kok = kokDizin(o);
  const Y = yollar(kok);
  kilitAl(o, { kip: resmi ? 'resmi' : 'deneme', neden }, bas);
  try {
    // 1) Manifest: bugün zaten kayıtlı mı?
    let m = manifestOku(kok).satirlar;
    const son = m[m.length - 1] || null;
    if (son && son.gun > gun) throw new Error(`manifestin son günü (${son.gun}) bugünden (${gun}) ileri — saat geri mi alındı? Koşu durduruldu.`);
    if (son && son.gun === gun) {
      if (resmi || !o.zorla) return { durum: 'zaten', gun, kip: resmi ? 'resmi' : 'deneme', neden: `bugün (${gun}) zaten kaydedildi${resmi ? ' (resmî kayıt yeniden yazılmaz)' : ' — deneme kipinde --zorla ile yenilenir'}` };
      // deneme + zorla: son satırı ve günün dosyalarını kaldır (yalnız deneme kipinde; resmî zincire asla).
      const metin = fs.readFileSync(Y.manifest, 'utf8').split('\n').filter(s => s.trim());
      if ((son.dosyalar || []).some(d => d.yol === ESIK_DOSYA)) { try { fs.rmSync(path.join(kok, ESIK_DOSYA), { force: true }); } catch { /* yok */ } }
      atomikYaz(Y.manifest, metin.slice(0, -1).map(s => s + '\n').join(''));
      try { fs.rmSync(path.join(Y.arsiv, gun), { recursive: true, force: true }); fs.rmSync(path.join(Y.evren, `${gun}.jsonl`), { force: true }); } catch { /* yok */ }
      m = manifestOku(kok).satirlar;
    }
    // Evren eşikleri (N14): zincirdeki dosya doğrulanır; yoksa 30. kayıt gününden sonraki ilk koşuda hesaplanır (hata → koşu durur)
    const esikH = esikHazirla(kok, m, gun);
    const esikler = esikH.esikler;
    const sikisan = eskiAylariSikistir(kok, gun);
    const kota = new Kota({ dizin: o.dikkatDizin, gun, butce: { ...GUNLUK_BUTCE, ...(o.butce || {}) } });
    const http = new Istemci({ fetch: o.fetch, simdi, uyu, zamanAsimiMs: 30000 });
    const C = cagirici({ http, kota, fetch: o.fetch, uyu, simdi, binanceKota: o.binanceKota || null });
    const durum = jsonOku(Y.durum, null) || { surum: 1, ilkGun: gun, cexIlk: {}, izleme: {}, cg: {}, github: {}, coinmetricsTam: null };
    const zincir = jsonOku(Y.zincir, null) || {};
    const zincirOnce = JSON.stringify(zincir);
    // Dikkat takibi (F2, §1.3): olay/kontrol penceresindeki token'lar evrenden çıksa da 90 (+14) gün izlenir
    const takipSet = (() => { try { return DT.takipAnahtarlari(kok, gun); } catch { return new Set(); } })();
    // İZLE (64.3, İ18): pencere / ön izleme pozisyonundaki ve listede görünen token'lar 30 (+14) gün izlenir
    try { for (const a of IT.takipAnahtarlari(kok, gun)) takipSet.add(a); } catch { /* izle takibi yok */ }
    const tradfi = o.tradfi || (() => { try { return require('../veri/tradfi').tabanlar(); } catch { return new Set(); } })();

    // 2) Toplu çekimler
    log('INFO', `F1 günlük arşiv ${gun} (${resmi ? 'RESMÎ' : 'deneme'}, ${neden}) — toplu kaynaklar`);
    const [bSpot, bPerp] = [await C.binance('https://api.binance.com/api/v3/exchangeInfo', 'spot'), await C.binance('https://fapi.binance.com/fapi/v1/exchangeInfo', 'perp')];
    const [tSpot, tPerp] = [await C.binance('https://api.binance.com/api/v3/ticker/24hr?type=MINI', 'spot'), await C.binance('https://fapi.binance.com/fapi/v1/ticker/24hr', 'perp')];
    const bybit = await C.al('bybit-borsa', 'https://api.bybit.com/v5/market/instruments-info?category=spot', { host: 'bybit', araMs: 300 });
    const okx = await C.al('okx-borsa', 'https://www.okx.com/api/v5/public/instruments?instType=SPOT', { host: 'okx', araMs: 300 });
    // OKX USDT perp (SWAP) anlık listesi — YALNIZ BİLGİ (PLAN-DIKKAT-LS §8.4): dikkat.jsonl `okxPerp` alanı; kural-v1/evren-v1'e
    // ve kurallarSha'ya girmez. Koşu (= gün; aynı gün ikinci koşu 'zaten') başına TEK istek, `okx-borsa` günlük bütçesinden; liste
    // bugünün toplu.json'ına yazılır (gün önbelleği — sonradan okuyan oradan alır, OKX'e yeniden gitmez).
    const okxSwap = await C.al('okx-borsa', 'https://www.okx.com/api/v5/public/instruments?instType=SWAP', { host: 'okx', araMs: 300, ucEtiket: 'https://www.okx.com/api/v5/public/instruments [SWAP]' });
    // Eşleme yalnız taban sembolüyle (Binance tabanı = OKX `uly` tabanı, çarpan öneki ayıklanmış): aynı sembollü farklı coin
    // ya da farklı çarpanlı sözleşme ayırt edilmez — alan bu yüzden yalnız bilgi.
    const okxPerp = okxSwap.ok ? okxPerpTabanlari(okxSwap.veri) : null;
    const okxPerpDurum = okxPerp && okxPerp.size ? 'ok' : okxSwap.kota ? 'kota' : 'hata';
    const okxPerpEk = (r) => ({ ...r, okxPerp: r.kanat === 'cex' && okxPerpDurum === 'ok' ? okxPerp.has(r.sembol) : null });
    const llProt = await C.al('defillama-tvl', 'https://api.llama.fi/protocols', { host: 'llama', araMs: 500 });
    const llLite = await C.al('defillama-tvl', 'https://api.llama.fi/lite/protocols2?b=2', { host: 'llama', araMs: 500 });
    const llUcret = await C.al('defillama-ucret', 'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true', { host: 'llama', araMs: 500 });
    const llGelir = await C.al('defillama-ucret', 'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue', { host: 'llama', araMs: 500 });
    const llStabil = await C.al('defillama-stablecoin', 'https://stablecoins.llama.fi/stablecoins?includePrices=false', { host: 'llama-stabil', araMs: 500 });
    const llStabilSeri = await C.al('defillama-stablecoin', 'https://stablecoins.llama.fi/stablecoincharts/all', { host: 'llama-stabil', araMs: 500 });
    const kesifHam = { gecko: {}, dex: {}, cg: null };
    const gtYap = async (net, tur) => C.al('geckoterminal-kesif', `https://api.geckoterminal.com/api/v2/networks/${net}/${tur}?include=base_token`, { host: 'geckoterminal', araMs: 2500 });
    for (const ag of E.DEX_AGLAR) {
      const net = AGLAR[ag].gecko;
      const tr = await gtYap(net, 'trending_pools'); const ye = await gtYap(net, 'new_pools');
      kesifHam.gecko[ag] = { trending: tr.ok ? E.geckoHavuzlari(tr.veri, ag) : null, yeni: ye.ok ? E.geckoHavuzlari(ye.veri, ag) : null,
        durum: { trending: tr.ok ? 'ok' : tr.kota ? 'kota' : 'hata', yeni: ye.ok ? 'ok' : ye.kota ? 'kota' : 'hata' } };
    }
    for (const [ad, url] of [['profiller', 'https://api.dexscreener.com/token-profiles/latest/v1'], ['boostSon', 'https://api.dexscreener.com/token-boosts/latest/v1'], ['boostEnCok', 'https://api.dexscreener.com/token-boosts/top/v1']]) {
      const r = await C.al('dexscreener-kesif', url, { host: 'dexscreener-liste', araMs: 1100 });
      kesifHam.dex[ad] = r.ok ? E.dexListesi(r.veri) : null; kesifHam.dex[`${ad}Durum`] = r.ok ? 'ok' : r.kota ? 'kota' : 'hata';
    }
    const cgTr = await C.al('coingecko-trend', 'https://api.coingecko.com/api/v3/search/trending', { host: 'coingecko', araMs: 6500 });
    kesifHam.cg = cgTr.ok ? E.cgTrend(cgTr.veri) : null; kesifHam.cgDurum = cgTr.ok ? 'ok' : cgTr.kota ? 'kota' : 'hata';
    const cgListe = await C.al('coingecko-trend', 'https://api.coingecko.com/api/v3/coins/list?include_platform=true', { host: 'coingecko', araMs: 6500, zamanAsimiMs: 60000 });
    const platform = new Map();   // cgId → [{ag, adres}]
    const cgSembol = new Map();   // sembol(lower) → [cgId]
    if (cgListe.ok && Array.isArray(cgListe.veri)) {
      for (const c of cgListe.veri) {
        if (!c || !c.id) continue;
        const p = [];
        for (const [pl, a] of Object.entries(c.platforms || {})) { const ag = E.AG_CG[pl]; const ad = ag ? E.adresNorm(ag, a) : null; if (ad) p.push({ ag, adres: ad }); }
        platform.set(c.id, p);
        const s = String(c.symbol || '').toLowerCase(); if (s) { if (!cgSembol.has(s)) cgSembol.set(s, []); cgSembol.get(s).push(c.id); }
      }
    }

    // 2b) CoinGecko tokenize hisse kategorileri (EK-2 a) — kategori listesi + kategori başına piyasa sayfaları
    const tokenizeCg = new Set();
    let tokenizeDurum = 'ok';
    const kat = await C.al('coingecko-trend', 'https://api.coingecko.com/api/v3/coins/categories/list', { host: 'coingecko', araMs: 6500 });
    if (!kat.ok || !Array.isArray(kat.veri)) tokenizeDurum = kat.kota ? 'kota' : 'hata';
    else {
      for (const c of kat.veri.filter(x => x && /tokenized-stock|bstocks|xstock/i.test(String(x.category_id || ''))).slice(0, 5)) {
        for (let sayfa = 1; sayfa <= 2; sayfa++) {
          const r = await C.al('coingecko-trend', `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&page=${sayfa}&category=${encodeURIComponent(c.category_id)}`, { host: 'coingecko', araMs: 6500 });
          if (!r.ok || !Array.isArray(r.veri)) { tokenizeDurum = 'kismi'; break; }
          r.veri.forEach(x => x && x.id && tokenizeCg.add(String(x.id)));
          if (r.veri.length < 250) break;
        }
      }
    }
    kesifHam.tokenize = { durum: tokenizeDurum, kimlik: tokenizeCg.size };

    // 3) Ayrıştırma
    const binanceOk = bSpot.ok && bPerp.ok;
    const bT = E.binanceTabanlari(bSpot.ok ? bSpot.veri : null, bPerp.ok ? bPerp.veri : null);
    const hSpot = tSpot.ok ? E.tickerHacim(tSpot.veri) : new Map(), hPerp = tPerp.ok ? E.tickerHacim(tPerp.veri) : new Map();
    const bybitT = new Set(bybit.ok && bybit.veri && bybit.veri.result ? (bybit.veri.result.list || []).filter(x => x.quoteCoin === 'USDT' && x.status === 'Trading').map(x => x.baseCoin) : []);
    const okxT = new Set(okx.ok && okx.veri ? (okx.veri.data || []).filter(x => x.quoteCcy === 'USDT' && x.state === 'live').map(x => x.baseCcy) : []);
    const prot = llProt.ok && Array.isArray(llProt.veri) ? llProt.veri.map(protokolKisa) : [];
    const ebev = llLite.ok && llLite.veri && Array.isArray(llLite.veri.parentProtocols) ? llLite.veri.parentProtocols.map(p => ({ id: temizMetin(p.id, 60), ad: temizMetin(p.name, 80), gecko: temizMetin(p.gecko_id, 80) || null, adres: temizMetin(p.address, 120) || null, mcap: sayi(p.mcap),
      github: Array.isArray(p.github) ? p.github.slice(0, 5).map(x => temizMetin(x, 60)) : null, yonetisim: Array.isArray(p.governanceID) ? p.governanceID.slice(0, 5).map(x => temizMetin(x, 120)) : null })) : [];
    const llamaOk = !!(llProt.ok && Array.isArray(llProt.veri) && llLite.ok && llLite.veri && Array.isArray(llLite.veri.parentProtocols));
    const ucret = llUcret.ok && llUcret.veri && Array.isArray(llUcret.veri.protocols) ? llUcret.veri.protocols.map(ucretKisa) : null;
    const gelir = llGelir.ok && llGelir.veri && Array.isArray(llGelir.veri.protocols) ? llGelir.veri.protocols.map(ucretKisa) : null;
    const L = llamaBirimleri(prot, ebev, ucret, gelir);
    const pegged = llStabil.ok && llStabil.veri && Array.isArray(llStabil.veri.peggedAssets) ? llStabil.veri.peggedAssets : [];
    const stabilCg = new Set(pegged.map(x => temizMetin(x.gecko_id, 80)).filter(Boolean));
    const stabilAdres = new Set();
    for (const x of pegged) { const a = E.llamaAdres(x.address); if (a && a.ag && a.adres) stabilAdres.add(E.dexAnahtar(a.ag, a.adres)); }
    const stabilDurum = llStabil.ok ? 'ok' : llStabil.kota ? 'kota' : 'hata';
    const cexTabanlar = new Set(bT.keys());
    const haricO = { stabilCg, stabilAdres, tradfi, tokenizeCg, tabanlar: cexTabanlar };
    const cgListeOk = !!(cgListe.ok && Array.isArray(cgListe.veri));

    // 4) Aday kümesi
    const adaylar = new Map();
    const adresIndeks = new Map();   // 'ag:adres' → anahtar (CEX platform adresleri + sabit zincirler)
    const cexBorsaYok = () => ({ spot: null, perp: null, carpan: null, listede: false, durum: binanceOk ? 'listede-yok' : 'liste-alinamadi' });
    const ekle = (anahtar, x) => {
      const a = adaylar.get(anahtar);
      if (a) { x.kesif.forEach(k => a.kesif.add(k)); if (x.parali) a.parali = true; if (!a.cgId && x.cgId && !a.cgBelirsiz) a.cgId = x.cgId; if (!a.sembol && x.sembol) a.sembol = x.sembol; if (x.gt) a.gt = [...(a.gt || []), ...x.gt]; return a; }
      const kanat = anahtar.startsWith('cex:') ? 'cex' : x.kanat;
      const y = { ...x, kanat, anahtar, kesif: new Set(x.kesif) };
      if (kanat === 'cex' && !y.borsa) { y.borsa = cexBorsaYok(); if (!y.sembol) y.sembol = anahtar.slice(4); y.ag = null; y.adres = null; }
      adaylar.set(anahtar, y); return y;
    };
    // CEX — CoinGecko eşlemesi: kalıcı eşleme yoksa aynı sembollü kimliklerden piyasa değeri > 0 olan TEK kimlik; birden fazlaysa BELİRSİZ (EK-2 c)
    const cexEslenecek = [];
    for (const [t, b] of bT) {
      const x = ekle(E.cexAnahtar(t), { kanat: 'cex', sembol: t, ad: null, ag: null, adres: null, cgId: null, kesif: ['binance'],
        borsa: { spot: b.spot, perp: b.perp, carpan: b.carpan || b.spotCarpan || null, hamSpot: b.hamSpot, hamPerp: b.hamPerp, perpOnboard: b.perpOnboard || null, bybit: bybitT.has(t), okx: okxT.has(t), listede: true, durum: 'listede' } });
      x.hamTaban = b.hamSpot || b.hamPerp || t;
      if (durum.cg[t]) x.cgId = durum.cg[t];
      else if (cgListeOk && (cgSembol.get(t.toLowerCase()) || []).length) cexEslenecek.push(x);
      else if (!cgListeOk) x.cgEslemeHata = true;
    }
    if (cexEslenecek.length) {
      const adayId = [...new Set(cexEslenecek.flatMap(x => cgSembol.get(x.sembol.toLowerCase()) || []))].sort();
      const mcap = new Map(); let piyasaOk = true;
      for (let i = 0; i < adayId.length; i += 250) {
        const r = await C.al('coingecko-trend', `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&ids=${adayId.slice(i, i + 250).join(',')}`, { host: 'coingecko', araMs: 6500 });
        if (r.ok && Array.isArray(r.veri)) for (const c of r.veri) mcap.set(c.id, sayi(c.market_cap) || 0); else piyasaOk = false;
      }
      for (const x of cexEslenecek) {
        if (!piyasaOk) { x.cgEslemeHata = true; continue; }
        const ids = (cgSembol.get(x.sembol.toLowerCase()) || []).filter(id => (mcap.get(id) || 0) > 0).sort((a, b) => mcap.get(b) - mcap.get(a) || a.localeCompare(b));
        if (ids.length === 1) { x.cgId = ids[0]; durum.cg[x.sembol] = ids[0]; }
        else if (ids.length > 1) { x.cgBelirsiz = true; x.cgAdaylar = ids.slice(0, 5); }
      }
    }
    for (const x of adaylar.values()) if (x.kanat === 'cex' && x.cgId) for (const p of platform.get(x.cgId) || []) adresIndeks.set(E.dexAnahtar(p.ag, p.adres), x.anahtar);
    for (const [k, z] of Object.entries(zincir)) if (z && z.ag && z.adres && !adresIndeks.has(E.dexAnahtar(z.ag, z.adres))) adresIndeks.set(E.dexAnahtar(z.ag, z.adres), k);
    // DEX keşif (Binance'teki token'ın DEX adresi → CEX kaydı, tek satır; EK-2 / denetim 9)
    const dexEkle = (ag, adres, x) => {
      if (!ag) { ekle(`${x.zincir || 'diger'}:${adres || x.sembol || '?'}`, { kanat: 'dex', ag: null, adres, zincir: x.zincir || null, sembol: x.sembol || null, ad: x.ad || null, cgId: x.cgId || null, kesif: x.kesif, parali: x.parali }); return; }
      const k = adresIndeks.get(E.dexAnahtar(ag, adres)) || E.dexAnahtar(ag, adres);
      ekle(k, { kanat: 'dex', ag, adres, sembol: x.sembol || null, ad: x.ad || null, cgId: x.cgId || null, kesif: x.kesif, parali: x.parali, gt: x.gt });
    };
    for (const ag of E.DEX_AGLAR) for (const tur of ['trending', 'yeni']) for (const h of (kesifHam.gecko[ag] && kesifHam.gecko[ag][tur]) || [])
      dexEkle(ag, h.adres, { sembol: h.sembol, ad: h.ad, cgId: h.cgId, kesif: [`geckoterminal-${tur}`], gt: [{ likidite: h.havuzLikidite, hacim24: h.havuzHacim24, kurulus: h.havuzKurulus }] });
    for (const [ad, parali] of [['profiller', false], ['boostSon', true], ['boostEnCok', true]]) for (const d of kesifHam.dex[ad] || [])
      dexEkle(d.ag, d.adres, { zincir: d.zincir, kesif: [`dexscreener-${ad}`], parali });
    const cexCg = new Map([...adaylar.values()].filter(a => a.kanat === 'cex' && a.cgId).map(a => [a.cgId, a]));
    const cgEkle = (cgId, x) => {
      const cexK = cexCg.get(cgId);
      if (cexK) { cexK.kesif.add(x.kesif[0]); return; }
      const p = platform.get(cgId) || [];
      const bilinen = p.map(q => adresIndeks.get(E.dexAnahtar(q.ag, q.adres)) || (adaylar.has(E.dexAnahtar(q.ag, q.adres)) ? E.dexAnahtar(q.ag, q.adres) : null)).find(Boolean);
      if (bilinen) { const a = adaylar.get(bilinen) || ekle(bilinen, { kanat: 'dex', ag: null, adres: null, sembol: x.sembol, ad: x.ad, cgId, kesif: [] }); a.kesif.add(x.kesif[0]); if (!a.cgId && !a.cgBelirsiz) a.cgId = cgId; return; }
      if (zincir[`cg:${cgId}`] || p.length > 1) { ekle(`cg:${cgId}`, { kanat: 'dex', ag: null, adres: null, sembol: x.sembol, ad: x.ad, cgId, kesif: x.kesif, platformlar: p }); return; }
      if (p.length === 1) { dexEkle(p[0].ag, p[0].adres, { ...x, cgId }); return; }
      ekle(`cg:${cgId}`, { kanat: 'dex', ag: null, adres: null, sembol: x.sembol, ad: x.ad, cgId, kesif: x.kesif, platformlar: [], yerel: true });
    };
    for (const c of kesifHam.cg || []) cgEkle(c.cgId, { sembol: c.sembol, ad: c.ad, kesif: ['coingecko-trending'] });
    for (const p of prot) {
      if (p.deadFrom) continue;
      const a = E.llamaAdres(p.adres);
      if (a && a.adres) dexEkle(a.ag, a.adres, { sembol: p.sembol, ad: p.ad, cgId: p.gecko, kesif: ['defillama-protocols'] });
      else if (a && !a.ag) dexEkle(null, temizMetin(String(p.adres).split(':').slice(1).join(':'), 80), { zincir: a.zincir, sembol: p.sembol, ad: p.ad, kesif: ['defillama-protocols'] });
      else if (p.gecko) cgEkle(p.gecko, { sembol: p.sembol, ad: p.ad, kesif: ['defillama-protocols'] });
    }
    // İzlemedeki ve hatırlanan genç adaylar: bugün keşfedilmese de aday (EK-2 d, e)
    const birlesen = [];
    for (const [k, iz] of Object.entries(durum.izleme)) {
      if (iz.birlesti || (iz.bitti && !takipSet.has(k))) continue;
      const hedef = iz.ag && iz.adres ? adresIndeks.get(E.dexAnahtar(iz.ag, iz.adres)) : null;
      if (!k.startsWith('cex:') && hedef && hedef.startsWith('cex:') && hedef !== k) {
        // Binance'e sonradan çıkan DEX token'ı: tek kayıt, kanat = cex; sabit zincir CEX kaydına devredilir.
        if (zincir[k] && !zincir[hedef]) zincir[hedef] = { ...zincir[k], devralindi: k, devirGunu: gun };
        iz.bitti = gun; iz.birlesti = hedef; birlesen.push({ k, hedef, sembol: iz.sembol });
        if (adaylar.has(hedef)) adaylar.get(hedef).kesif.add('izleme');
        continue;
      }
      ekle(k, { kanat: iz.kanat, ag: iz.ag || null, adres: iz.adres || null, sembol: iz.sembol || null, ad: null, cgId: iz.cgId || null, kesif: ['izleme'], platformlar: iz.cgId ? platform.get(iz.cgId) || [] : [] });
    }
    durum.genc = durum.genc || {};
    for (const [k, g] of Object.entries(durum.genc)) {
      if (E.gunFark(g.ilk, gun) > E.IZLEME_GUN) { delete durum.genc[k]; continue; }
      if (!adaylar.has(k)) ekle(k, { kanat: 'dex', ag: g.ag, adres: g.adres, sembol: g.sembol || null, ad: null, cgId: g.cgId || null, kesif: ['genc-hatirla'] });
      else adaylar.get(k).kesif.add('genc-hatirla');
    }

    // 5) DexScreener toplu (30 adres/çağrı): DEX adayları + CEX/cg platform adresleri (zinciri sabitlenmemişse) + sabit zincirler
    const istek = new Map();   // ag → Set(adres)
    const iste = (ag, a) => { if (!ag || !a || !AGLAR[ag] || !AGLAR[ag].dex) return; if (!istek.has(ag)) istek.set(ag, new Set()); istek.get(ag).add(a); };
    for (const x of adaylar.values()) {
      const z = zincir[x.anahtar];
      if (z && z.ag && z.adres) { iste(z.ag, z.adres); continue; }
      if (x.ag && x.adres) { iste(x.ag, x.adres); continue; }
      const p = x.kanat === 'cex' ? (x.cgId ? platform.get(x.cgId) || [] : []) : (x.platformlar || []);
      p.forEach(q => iste(q.ag, q.adres));
    }
    const ds = new Map();      // 'ag:adres' → toplam | null (çift yok)
    const dsHata = new Set();  // 'ag:adres' — çağrı başarısız
    const dsKota = new Set();
    for (const [ag, set] of istek) {
      const liste = [...set].sort();
      for (let i = 0; i < liste.length; i += 30) {
        const parca = liste.slice(i, i + 30);
        const r = await C.al('dexscreener-kesif', `https://api.dexscreener.com/tokens/v1/${AGLAR[ag].dex}/${parca.join(',')}`, { host: 'dexscreener', araMs: 250, sessiz: true });
        if (!r.ok) { parca.forEach(a => (r.kota ? dsKota : dsHata).add(E.dexAnahtar(ag, a))); continue; }
        const t = E.dexToplamlari(r.veri, ag, parca);
        for (const a of parca) ds.set(E.dexAnahtar(ag, a), t.get(a) || null);
      }
    }
    const dsBasarisiz = (ag, a) => dsHata.has(E.dexAnahtar(ag, a)) || dsKota.has(E.dexAnahtar(ag, a));
    C.uclar.push({ kaynak: 'dexscreener-kesif', uc: 'https://api.dexscreener.com/tokens/v1 (toplu)', ok: dsHata.size === 0, durum: dsHata.size ? 'kismi' : 'ok', adres: [...istek.values()].reduce((s, v) => s + v.size, 0), hata: dsHata.size ? `${dsHata.size} adres başarısız` : null, kota: dsKota.size || null });

    // CEX "eski" işareti: spot VE USDⓈ-M listesinin ikisinin de alındığı ilk koşu (denetim 4)
    if (!durum.cexTaban && binanceOk) durum.cexTaban = gun;
    const cexTabanBugun = durum.cexTaban === gun;

    // 6) Ölçüm + karar — token başına try/catch: bir token'daki istisna geceyi durdurmaz (o token "hata" satırı alır)
    const once = oncekiOlcumler(kok, m, gun);
    const evrenSatir = [];
    const izlenecek = [];
    let tokenHata = 0;
    for (const b of birlesen) evrenSatir.push({ gun, surum: E.EVREN_SURUM, anahtar: b.k, kanat: 'dex', sembol: b.sembol || null, karar: 'birlesti', hedef: b.hedef,
      nedenler: [{ kod: 'cex-kanadina-gecti', metin: `token Binance'te listelendi → tek kayıt ${b.hedef} (kanat = cex); bu anahtarın izlemesi bitti, satırlar kalır` }] });
    for (const x of [...adaylar.values()].sort((a, b) => a.anahtar.localeCompare(b.anahtar))) {
      try {
        if (o._testTokenHata && o._testTokenHata === x.anahtar) throw new Error('öz test: yapay istisna');   // yalnız öz test (token başına hata yalıtımı)
        const z = zincir[x.anahtar] || null;
        // Ölçüm zinciri: sabit zincir; yoksa tek adres; yoksa (çok zincir) bugün likiditesi en yüksek platform (sabitlenmez — izleme günü sabitlenir)
        let olcAg = z ? z.ag : x.ag, olcAdres = z ? z.adres : x.adres;
        const platformlar = x.kanat === 'cex' ? (x.cgId ? platform.get(x.cgId) || [] : []) : (x.platformlar || []);
        const secenek = platformlar.map(p => ({ ...p, likidite: (ds.get(E.dexAnahtar(p.ag, p.adres)) || {}).toplamLikidite }));
        if (!z && !x.adres && secenek.length) { const s = E.zincirSec(null, secenek); olcAg = s.ag; olcAdres = s.adres; }
        const dsx = olcAg && olcAdres ? ds.get(E.dexAnahtar(olcAg, olcAdres)) : undefined;
        const olcum = { hacim24: null, hacimKaynak: null, likidite: null, likiditeKaynak: null, ilkCift: null };
        if (x.kanat === 'cex') {
          const b = x.borsa;
          olcum.borsaDurum = b.durum;
          // Spot paritesi varsa hacim YALNIZ spot (A5); spot ticker alınamadıysa hacim bilinmiyor (perp'e düşülmez).
          if (b.spot) { if (!tSpot.ok) olcum.hacimKaynak = 'binance-spot-hata'; else if (hSpot.has(b.spot)) { olcum.hacim24 = hSpot.get(b.spot); olcum.hacimKaynak = 'binance-spot'; } }
          else if (b.perp) { if (!tPerp.ok) olcum.hacimKaynak = 'binance-perp-hata'; else if (hPerp.has(b.perp)) { olcum.hacim24 = hPerp.get(b.perp); olcum.hacimKaynak = 'binance-perp'; } }
          else olcum.hacimKaynak = b.durum === 'liste-alinamadi' ? 'binance-liste-alinamadi' : 'binance-listede-yok';
          let ci = durum.cexIlk[x.sembol];
          if (!ci && b.listede && binanceOk) { ci = { gun, eski: cexTabanBugun }; durum.cexIlk[x.sembol] = ci; }
          olcum.cexIlkGorulme = ci ? ci.gun : null; olcum.eski = !!(ci && ci.eski);
          if (dsx) { olcum.likidite = dsx.toplamLikidite; olcum.likiditeKaynak = 'dexscreener'; }
        } else {
          if (dsx) { olcum.hacim24 = dsx.hacim24; olcum.hacimKaynak = 'dexscreener'; olcum.likidite = dsx.toplamLikidite; olcum.likiditeKaynak = 'dexscreener'; olcum.ilkCift = dsx.ilkCift; }
          else if (x.gt && x.gt.length) {
            const lik = x.gt.map(g => g.likidite).filter(Number.isFinite), hac = x.gt.map(g => g.hacim24).filter(Number.isFinite);
            if (lik.length) { olcum.likidite = Math.max(...lik); olcum.likiditeKaynak = 'geckoterminal-rezerv'; }
            if (hac.length) { olcum.hacim24 = Math.max(...hac); olcum.hacimKaynak = 'geckoterminal-havuz'; }
          }
          const gtK = (x.gt || []).map(g => g.kurulus).filter(Boolean).sort()[0];
          if (gtK && (!olcum.ilkCift || gtK < olcum.ilkCift)) olcum.ilkCift = gtK;
          if (dsx === null && !x.gt) olcum.dexDurum = 'cift-yok';
          if (olcAg && olcAdres && dsBasarisiz(olcAg, olcAdres)) { olcum.dexDurum = 'cagri-basarisiz'; if (!olcum.hacimKaynak) olcum.hacimKaynak = 'dexscreener-hata'; }
        }
        const g = once.m.get(x.anahtar) || [];
        const md = E.medyan7(g.map(v => v.hacim24), olcum.hacim24);
        olcum.hacim7Medyan = md.medyan; olcum.gecmisGun = md.gun;
        const ag = x.kanat === 'dex' ? (olcAg || x.ag || null) : olcAg || null;
        const haric = E.haricNeden({ sembol: x.sembol || (dsx && dsx.sembol), ad: x.ad || (dsx && dsx.ad), cgId: x.cgId, kanat: x.kanat, hamTaban: x.hamTaban }, { ...haricO, adres: ag && olcAdres ? E.dexAnahtar(ag, olcAdres) : null });
        const k = E.evrenKarari({ kanat: x.kanat, ag: x.kanat === 'dex' ? ag : null, zincir: x.zincir, haric, olcum }, gun);
        const iz = durum.izleme[x.anahtar] || null;
        const bugunIzle = (k.karar === 'girdi' && k.taban) || k.isinma;
        const takipte = takipSet.has(x.anahtar);
        const izlemeSurer = !bugunIzle && iz && ((!iz.bitti && E.gunFark(iz.son, gun) <= E.IZLEME_GUN) || takipte);
        const izlemeBitti = !bugunIzle && iz && !iz.bitti && !izlemeSurer;
        const satir = { gun, surum: E.EVREN_SURUM, anahtar: x.anahtar, kanat: x.kanat, sembol: x.sembol || (dsx && dsx.sembol) || null, ad: x.ad || (dsx && dsx.ad) || null,
          ag: ag || (x.kanat === 'cex' ? (z ? z.ag : null) : null), adres: olcAdres || null, zincirSabit: !!z, cgId: x.cgId || null, ...(x.cgBelirsiz ? { cgBelirsiz: true, cgAdaylar: x.cgAdaylar } : {}),
          kesif: [...x.kesif].sort(), parali: !!x.parali, karar: k.karar, nedenler: k.nedenler, taban: k.taban, isinma: k.isinma, izleme: !!(bugunIzle || izlemeSurer), ...(takipte ? { takip: true } : {}), esik: null, olcum };
        if (x.kanat === 'cex') satir.borsa = x.borsa;
        // Genç DEX adayı (yalnız yaş ve/veya geçmiş yüzünden elenip tabanı geçen) hatırlanır (EK-2 e)
        if (x.kanat === 'dex' && !satir.izleme && k.taban && k.nedenler.length && k.nedenler.every(n => n.kod === 'yas' || n.kod === 'gecmis-az') && k.nedenler.some(n => n.kod === 'yas') && x.ag && x.adres) {
          if (!durum.genc[x.anahtar]) durum.genc[x.anahtar] = { ilk: gun, ag: x.ag, adres: x.adres, sembol: satir.sembol, cgId: x.cgId || null, ilkCift: olcum.ilkCift };
          satir.gencHatirla = true;
        }
        evrenSatir.push(satir);
        if (izlemeBitti) { iz.bitti = gun; evrenSatir.push({ gun, surum: E.EVREN_SURUM, anahtar: x.anahtar, kanat: x.kanat, sembol: satir.sembol, karar: 'izleme-bitti', nedenler: [{ kod: 'izleme-30g', metin: `son izleme günü ${iz.son}; ${E.IZLEME_GUN} takvim günü evren dışı — izleme bitti, satırlar kalır` }] }); }
        if (!satir.izleme) continue;
        if (durum.genc[x.anahtar]) delete durum.genc[x.anahtar];
        // Zincir sabitleme (ilk izleme günü; DexScreener başarısızsa ERTELENİR; belirsiz CG eşlemesi sabitlenmez — EK-2 c)
        let ertelendi = null;
        if (!z) {
          let s = null;
          if (x.kanat === 'dex' && x.ag && x.adres && !x.platformlar) s = { ag: x.ag, adres: x.adres, yontem: 'tek-zincir', likidite: dsx ? dsx.toplamLikidite : null };
          else if (x.cgBelirsiz) ertelendi = 'CoinGecko eşlemesi belirsiz (aynı sembollü birden fazla kimlik)';
          else if (x.cgEslemeHata) ertelendi = 'CoinGecko eşleme kaynağı bugün alınamadı';
          else if (secenek.length) {
            if (secenek.some(p => dsBasarisiz(p.ag, p.adres))) ertelendi = 'DexScreener toplu çağrısı başarısız — zincir sabitleme ertelendi';
            else s = E.zincirSec(null, secenek);
          } else if (x.cgId && platform.has(x.cgId)) s = { ag: 'diger', adres: null, yontem: 'yerel-zincir (CoinGecko platformu yok / desteklenmeyen ağ)', likidite: null };
          if (s) { zincir[x.anahtar] = { ag: s.ag, adres: s.adres, yontem: s.yontem, likidite: s.likidite == null ? null : Math.round(s.likidite), cgId: x.cgId || null, sabitlendi: gun }; satir.zincirSabit = true; satir.ag = s.ag; satir.adres = s.adres; }
          else if (ertelendi) { satir.ag = null; satir.adres = null; satir.zincirErtelendi = ertelendi; }
          else if (x.kanat === 'cex') { satir.ag = null; satir.adres = null; }   // eşleme yok: sözleşme bilinmiyor (yapısal; yerel() ayırt eder)
        }
        durum.izleme[x.anahtar] = { kanat: x.kanat, sembol: satir.sembol, ag: satir.ag, adres: satir.adres, cgId: x.cgId || null, ilk: (iz && iz.ilk) || gun, son: bugunIzle ? gun : (iz && iz.son) || gun, bitti: !bugunIzle && iz && iz.bitti ? iz.bitti : null, sonOk: (iz && iz.sonOk) || {} };
        izlenecek.push({ satir, x, dsx: satir.adres && satir.ag ? ds.get(E.dexAnahtar(satir.ag, satir.adres)) : undefined });
      } catch (e) {
        tokenHata++;
        evrenSatir.push({ gun, surum: E.EVREN_SURUM, anahtar: x.anahtar, kanat: x.kanat, sembol: x.sembol || null, karar: 'hata', nedenler: [{ kod: 'islem-hatasi', metin: temizMetin(e && e.message, 200) }] });
        log('WARN', `F1: ${x.anahtar} işlenemedi: ${e && e.message}`);
      }
    }

    // 7) Ham anlık görüntü (izlenen token'lar) — kaynak başına bütçeli, öncelikli kuyruk; kaynaklar arası eşzamanlı
    log('INFO', `F1: ${adaylar.size} aday, ${izlenecek.length} izlenen — anlık görüntüler`);
    const anlik = new Map(izlenecek.map(t => [t.satir.anahtar, { gun, anahtar: t.satir.anahtar, kanat: t.satir.kanat, sembol: t.satir.sembol, ag: t.satir.ag, adres: t.satir.adres, cgId: t.satir.cgId, kaynaklar: {} }]));
    const yaz = (t, ad, s) => {
      const a = anlik.get(t.satir.anahtar);
      const alindi = simdi();
      a.kaynaklar[ad] = { ...s, payda: PAYDA[s.durum], alindi: new Date(alindi).toISOString(), ...(gunStr(alindi) > gun ? { gunSonrasi: true } : {}) };
      if (s.durum === 'ok') durum.izleme[t.satir.anahtar].sonOk[ad] = gun;
    };
    const sirala = (liste, ad, dexOnce) => [...liste].sort((a, b) => {
      const sa = (durum.izleme[a.satir.anahtar].sonOk || {})[ad] || '', sb = (durum.izleme[b.satir.anahtar].sonOk || {})[ad] || '';
      return ((a.satir.izleme && a.satir.karar === 'girdi') ? 0 : 1) - ((b.satir.izleme && b.satir.karar === 'girdi') ? 0 : 1) || sa.localeCompare(sb) || (dexOnce ? (a.satir.kanat === 'dex' ? 0 : 1) - (b.satir.kanat === 'dex' ? 0 : 1) : 0) || a.satir.anahtar.localeCompare(b.satir.anahtar);
    });
    const azami = o.azami || {};
    const sayac = {};
    const tokenKaynak = async (ad, katalog, uygun, getir, dexOnce) => {
      const liste = [];
      for (const t of izlenecek) { const u = uygun(t); if (u === true) liste.push(t); else yaz(t, ad, typeof u === 'string' ? S.uyg(u) : u); }
      let n = 0, ardisikHiz = 0;
      const kBas = simdi();
      for (const t of sirala(liste, ad, dexOnce)) {
        if ((azami[ad] != null && n >= azami[ad]) || !kota.izin(katalog)) { yaz(t, ad, S.kota(azami[ad] != null && n >= azami[ad] ? 'bu koşunun tavanı' : 'günlük/aylık bütçe doldu')); continue; }
        if (simdi() - kBas > KAYNAK_SURE_MS) { yaz(t, ad, { ...S.kota(`ertelendi: kaynağın koşu süresi bütçesi (${KAYNAK_SURE_MS / 60e3} dk) doldu`), ertelendi: true }); continue; }
        if (ardisikHiz >= 5) { yaz(t, ad, { ...S.kota('ertelendi: kaynak art arda hız sınırı (429) verdi — bu koşuda bırakıldı'), ertelendi: true }); continue; }
        kota.say(katalog); n++;
        // eslint-disable-next-line no-await-in-loop
        let s; try { s = await bekci(getir(t), CAGRI_BEKCI_MS, `${ad} ${t.satir.anahtar}`); } catch (e) { s = S.hata(e.message); }
        ardisikHiz = s.durum === 'hata' && /HTTP 429|hız sınırı/.test(s.hata || '') ? ardisikHiz + 1 : 0;
        try { yaz(t, ad, s); } catch (e) { log('WARN', `F1: ${ad} ${t.satir.anahtar} yazılamadı: ${e.message}`); }
        if (n % 100 === 0) log('INFO', `F1: ${ad} ${n}/${liste.length}`);
      }
      sayac[ad] = n;
      log('INFO', `F1: ${ad} bitti (${n} çağrı, ${liste.length} uygun)`);
    };
    const ctx = { http };
    const sar = (r) => (r.durum === 'ok' ? S.ok(r.ham) : r.durum === 'bos' ? S.bos(r.neden, r.ham) : S.hata(r.hata));
    // Sözleşmesi bilinmeyen token: yapısal mı (uygulanmaz), kaynak hatası mı (hata), belirsiz eşleme mi (belirsiz)?
    const yerel = (t) => {
      const x = t.x, sx = t.satir;
      if (sx.zincirErtelendi) return x.cgBelirsiz ? S.belirsiz(sx.zincirErtelendi) : S.hata(sx.zincirErtelendi);
      if (x.cgBelirsiz) return S.belirsiz('CoinGecko eşlemesi belirsiz (aynı sembollü birden fazla kimlik)');
      if (x.cgEslemeHata || (!sx.cgId && !cgListeOk)) return S.hata('CoinGecko eşleme kaynağı bugün alınamadı');
      return sx.kanat === 'cex' && !sx.cgId ? 'CoinGecko eşlemesi yok (sözleşme bilinmiyor)' : 'yerel zincir / sözleşme yok';
    };
    const gpUygun = (t) => (!t.satir.ag || t.satir.ag === 'diger' ? yerel(t) : !AGLAR[t.satir.ag] || !AGLAR[t.satir.ag].goplus ? 'ağ GoPlus kapsamı dışı (EVM değil)' : !t.satir.adres ? 'sözleşme yok' : true);
    const rcUygun = (t) => (!t.satir.ag || t.satir.ag === 'diger' ? yerel(t) : t.satir.ag !== 'sol' ? 'yalnız Solana' : !t.satir.adres ? 'mint adresi yok' : true);
    const gtUygun = (t) => (!t.satir.ag || t.satir.ag === 'diger' ? yerel(t) : !AGLAR[t.satir.ag] || !AGLAR[t.satir.ag].gecko ? 'ağ GeckoTerminal kapsamı dışı / yerel zincir' : !t.satir.adres ? 'sözleşme yok' : true);
    const dsUygun = (t) => (!t.satir.ag || t.satir.ag === 'diger' ? yerel(t) : !AGLAR[t.satir.ag] || !AGLAR[t.satir.ag].dex ? 'ağ DexScreener kapsamı dışı / yerel zincir' : !t.satir.adres ? 'sözleşme yok' : true);
    // RDAP (K16): DexScreener sitesinden alan adı; alan adı başına haftada bir sorgu (durum.rdap önbelleği), arada "onbellek"
    durum.rdap = durum.rdap || {};
    let rdapHarita = null;
    const rdapBoot = async () => {
      if (rdapHarita) return rdapHarita;
      const yol = dizinler(o).rdapBootstrap;
      const b = jsonOku(yol, null);
      if (b && b.harita && simdi() - Date.parse(b.zaman || 0) < 30 * 864e5) return (rdapHarita = b.harita);
      const r = await http.json('https://data.iana.org/rdap/dns.json', { host: 'iana', araMs: 0, denemeler: 2 });
      if (!r.ok || !r.veri || !Array.isArray(r.veri.services)) return (rdapHarita = b && b.harita ? b.harita : {});
      const h = {};
      for (const sv of r.veri.services) {
        if (!Array.isArray(sv) || !Array.isArray(sv[0]) || !Array.isArray(sv[1])) continue;
        const url = sv[1].find(u => /^https:\/\//.test(String(u))) || sv[1][0];
        for (const tld of sv[0]) if (/^[a-z0-9-]{2,63}$/i.test(tld) && url) h[String(tld).toLowerCase()] = temizMetin(url, 200);
      }
      try { atomikYaz(yol, JSON.stringify({ zaman: new Date(simdi()).toISOString(), harita: h })); } catch { /* yoksay */ }
      return (rdapHarita = h);
    };
    const rdUygun = (t) => {
      const u = dsUygun(t); if (u !== true) return u;
      const k = E.dexAnahtar(t.satir.ag, t.satir.adres);
      if (dsKota.has(k)) return S.kota('DexScreener bütçesi → site bilinmiyor');
      if (dsHata.has(k) || !ds.has(k)) return S.hata('DexScreener alınamadı → site bilinmiyor');
      const d = ds.get(k);
      if (!d) return 'DexScreener\'da çift yok → site bilinmiyor';
      if (!d.site) return 'DexScreener\'da site bilgisi yok';
      const c = durum.rdap[d.site];
      if (c && E.gunFark(c.kontrol, gun) < 7) return c.durum === 'ok' ? S.onb(c.ham, c.kontrol) : S.bos(c.neden || 'RDAP kaydı yok', c.ham || { alanAdi: d.site });
      return true;
    };
    const islemler = [
      tokenKaynak('rdap', 'rdap', rdUygun, async (t) => {
        const alan = ds.get(E.dexAnahtar(t.satir.ag, t.satir.adres)).site;
        const r = await KAYNAKLAR.rdap.getir({ alanAdi: alan }, { http, rdapBootstrap: rdapBoot, simdi, ayar: { rdapGun: 7 }, onceki: null });
        if (r.durum === 'ok') durum.rdap[alan] = { kontrol: gun, durum: 'ok', ham: r.ham };
        else if (r.durum === 'bos') durum.rdap[alan] = { kontrol: gun, durum: 'bos', neden: temizMetin(r.neden, 160), ham: r.ham || { alanAdi: alan } };
        return sar(r);
      }),
      tokenKaynak('goplus', 'goplus', gpUygun, async (t) => sar(await KAYNAKLAR.goplus.getir({ ag: t.satir.ag, sozlesme: t.satir.adres }, ctx))),
      tokenKaynak('rugcheck', 'rugcheck', rcUygun, async (t) => sar(await KAYNAKLAR.rugcheck.getir({ ag: 'sol', sozlesme: t.satir.adres }, ctx))),
      tokenKaynak('geckoterminal', 'geckoterminal-holder', gtUygun, async (t) => {
        const r = await http.json(`https://api.geckoterminal.com/api/v2/networks/${AGLAR[t.satir.ag].gecko}/tokens/${encodeURIComponent(t.satir.adres)}/info`, { host: 'geckoterminal', araMs: 4000, denemeler: 1, basliklar: { 'user-agent': UA } });
        if (!r.ok) return r.durum === 404 ? S.bos('GeckoTerminal bu token\'ı tanımıyor') : S.hata(r.hata);
        const a = (r.veri && r.veri.data && r.veri.data.attributes) || {}, h = a.holders || {}, d = h.distribution_percentage || {};
        const pay = (v) => (sayi(v) == null ? null : sayi(v) / 100);
        return S.ok({ holder: sayi(h.count), ilk10: pay(d.top_10), d11_30: pay(d['11_30']), d31_50: pay(d['31_50']), kalan: pay(d.rest), guncelleme: temizMetin(h.last_updated, 30), gtPuan: sayi(a.gt_score) });
      }, true),
      tokenKaynak('dexSiparis', 'dexscreener-kesif', dsUygun, async (t) => {
        const r = await http.json(`https://api.dexscreener.com/orders/v1/${AGLAR[t.satir.ag].dex}/${encodeURIComponent(t.satir.adres)}`, { host: 'dexscreener-siparis', araMs: 1100, basliklar: { 'user-agent': UA } });
        if (!r.ok) return S.hata(r.hata);
        const l = (Array.isArray(r.veri) ? r.veri : []).slice(0, 30).map(x => ({ tur: temizMetin(x.type, 30), durum: temizMetin(x.status, 20), odeme: x.paymentTimestamp ? new Date(Number(x.paymentTimestamp)).toISOString() : null }));
        return l.length ? S.ok({ siparisler: l }) : S.bos('ödenmiş sipariş kaydı yok', { siparisler: [] });
      }, true),
    ];
    // Toplu kaynaklardan token başına (çağrısız) — token başına try/catch
    const llamaYok = (t) => {
      // "eşleme yok → uygulanmaz" YALNIZ eşleme uçları başarılı ve token kimliği kesinse (denetim 6)
      if (!llamaOk) return llProt.kota || llLite.kota ? S.kota('DefiLlama bütçesi') : S.hata('DefiLlama /protocols ya da lite/protocols2 alınamadı');
      if (t.x.cgBelirsiz) return S.belirsiz('CoinGecko eşlemesi belirsiz → DefiLlama eşlemesi kurulamaz');
      if (t.x.cgEslemeHata || (!t.satir.cgId && !cgListeOk)) return S.hata('CoinGecko eşleme kaynağı alınamadı → DefiLlama eşlemesi kurulamaz');
      return S.uyg('DefiLlama eşlemesi yok (gecko_id / adres)');
    };
    for (const t of izlenecek) {
      try {
        const sx = t.satir;
        const u = dsUygun(t);
        if (u !== true) yaz(t, 'dexscreener', typeof u === 'string' ? S.uyg(u) : u);
        else { const k = E.dexAnahtar(sx.ag, sx.adres); yaz(t, 'dexscreener', dsKota.has(k) ? S.kota('bütçe doldu') : dsHata.has(k) || !ds.has(k) ? S.hata('toplu DexScreener çağrısı başarısız') : ds.get(k) ? S.ok(ds.get(k)) : S.bos('DexScreener\'da çift yok')); }
        if (sx.kanat === 'cex') {
          const b = t.x.borsa;
          if (!b.listede) yaz(t, 'borsa', b.durum === 'liste-alinamadi' ? S.hata('Binance exchangeInfo alınamadı') : S.bos('Binance listesinde TRADING USDT paritesi yok (delist olabilir)', { spot: null, perp: null, bybit: bybitT.has(sx.sembol), okx: okxT.has(sx.sembol) }));
          else {
            const sp = b.spot ? hSpot.get(b.spot) : undefined, pp = b.perp ? hPerp.get(b.perp) : undefined;
            yaz(t, 'borsa', (!tSpot.ok && b.spot) || (!tPerp.ok && b.perp && !b.spot) ? S.hata('Binance 24 s ticker alınamadı') : S.ok({ spot: b.spot, perp: b.perp, spotHacim24: sp == null ? null : sp, perpHacim24: pp == null ? null : pp, perpHata: !tPerp.ok && b.perp ? true : undefined, bybit: b.bybit, okx: b.okx }));
          }
        } else yaz(t, 'borsa', S.uyg('DEX kanadı (Binance USDT paritesi yok)'));
        const bid = (sx.cgId && L.cg.get(sx.cgId)) || (sx.ag && sx.adres && L.adres.get(E.dexAnahtar(sx.ag, sx.adres))) || null;
        const b = llamaOk && bid ? L.birim.get(bid) : null;
        t.llama = b;
        if (!b) { const s = llamaYok(t); t.llamaDurum = s; yaz(t, 'defillama', s); }
        else {
          const h = birimHam(b);
          // P/F ailesi: ücret ucu alınamadıysa BİLİNMİYOR (birim eşlemesi ok olsa da)
          yaz(t, 'defillama', S.ok({ ...h, ucretDurum: ucret ? (h.ucret ? 'ok' : 'kayit-yok') : 'hata', gelirDurum: gelir ? (h.gelir ? 'ok' : 'kayit-yok') : 'hata',
            ucretPayda: ucret ? 'gozlendi' : 'bilinmiyor', gelirPayda: gelir ? 'gozlendi' : 'bilinmiyor' }));
        }
      } catch (e) { tokenHata++; log('WARN', `F1: ${t.satir.anahtar} toplu kaynaklar: ${e.message}`); }
    }
    // CoinGecko piyasa (250 kimlik/çağrı)
    const cgIds = [...new Set(izlenecek.map(t => t.satir.cgId).filter(Boolean))].sort();
    const cgPiyasa = new Map(); const cgHata = new Set(); const cgKota = new Set();
    for (let i = 0; i < cgIds.length; i += 250) {
      const p = cgIds.slice(i, i + 250);
      const r = await C.al('coingecko-trend', `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&ids=${p.join(',')}`, { host: 'coingecko', araMs: 6500 });
      if (!r.ok) { p.forEach(x => (r.kota ? cgKota : cgHata).add(x)); continue; }
      for (const c of Array.isArray(r.veri) ? r.veri : []) cgPiyasa.set(c.id, { fiyat: sayi(c.current_price), piyasaDegeri: sayi(c.market_cap), fdv: sayi(c.fully_diluted_valuation), hacim24: sayi(c.total_volume), dolasim: sayi(c.circulating_supply), toplamArz: sayi(c.total_supply), sira: sayi(c.market_cap_rank), guncelleme: temizMetin(c.last_updated, 30) });
    }
    for (const t of izlenecek) {
      const id = t.satir.cgId;
      const yok = () => (t.x.cgBelirsiz ? S.belirsiz('CoinGecko eşlemesi belirsiz') : t.x.cgEslemeHata || !cgListeOk ? S.hata('CoinGecko eşleme kaynağı alınamadı') : S.uyg('CoinGecko kimliği yok'));
      yaz(t, 'coingecko', !id ? yok() : cgKota.has(id) ? S.kota('bütçe') : cgHata.has(id) ? S.hata('coins/markets alınamadı') : cgPiyasa.has(id) ? S.ok(cgPiyasa.get(id)) : S.bos('CoinGecko piyasa kaydı yok'));
    }
    // GitHub (org başına; haftalık tazeleme; 60/sa)
    const orgTok = new Map();
    for (const t of izlenecek) for (const g of (t.llama && t.llama.github) || []) { const org = String(g).replace(/^https?:\/\/github\.com\//i, '').split('/')[0].trim(); if (/^[A-Za-z0-9-_.]{1,60}$/.test(org)) { if (!orgTok.has(org)) orgTok.set(org, []); orgTok.get(org).push(t); } }
    const ghTazele = [...orgTok.keys()].filter(org => { const c = durum.github[org]; return !c || E.gunFark(c.kontrol, gun) >= GITHUB_TAZE_GUN; })
      .sort((a, b) => ((durum.github[a] || {}).kontrol || '').localeCompare((durum.github[b] || {}).kontrol || '') || a.localeCompare(b));
    let ghKalan = null; const ghBugun = new Map();
    const ghIslem = (async () => {
      for (const org of ghTazele) {
        if ((ghKalan != null && ghKalan <= 5) || !kota.izin('github')) { ghBugun.set(org, { ...S.kota(ghKalan != null && ghKalan <= 5 ? 'ertelendi: GitHub saatlik sınırı (x-ratelimit-remaining ≤ 5) — sonraki koşuda' : 'ertelendi: günlük GitHub bütçesi doldu — sonraki koşuda (en eski önce)'), ertelendi: true }); continue; }
        kota.say('github');
        // eslint-disable-next-line no-await-in-loop
        const r = await bekci(http.json(`https://api.github.com/users/${encodeURIComponent(org)}/repos?sort=pushed&per_page=1&type=owner`, { host: 'github', araMs: 1500, denemeler: 1,
          basliklar: { accept: 'application/vnd.github+json', 'user-agent': UA }, basliklarCb: (h) => { const v = Number(h('x-ratelimit-remaining')); if (Number.isFinite(v)) ghKalan = v; } }), CAGRI_BEKCI_MS, `github ${org}`).catch(e => ({ ok: false, durum: 0, hata: e.message }));
        if (r.ok) { const x = Array.isArray(r.veri) ? r.veri[0] : null; const c = { kontrol: gun, repo: x ? temizMetin(x.full_name, 120) : null, pushedAt: x ? temizMetin(x.pushed_at, 30) : null, arsivli: x ? !!x.archived : null }; durum.github[org] = c; ghBugun.set(org, x ? S.ok(c) : S.bos('org/kullanıcının herkese açık reposu yok', c)); }
        else if (r.durum === 404) { const c = { kontrol: gun, repo: null, pushedAt: null, bulunamadi: true }; durum.github[org] = c; ghBugun.set(org, S.bos('GitHub org/kullanıcı bulunamadı (404)', c)); }
        else ghBugun.set(org, r.durum === 403 || r.durum === 429 ? S.kota(`GitHub ${r.durum} (hız sınırı)`) : S.hata(r.hata));
      }
    })();
    // Snapshot (DefiLlama governanceID → space; 40 space/sorgu, son 90 g önerileri)
    const spTok = new Map();
    for (const t of izlenecek) for (const g of (t.llama && t.llama.yonetisim) || []) { const m2 = /^snapshot:(.+)$/.exec(g); if (m2 && /^[A-Za-z0-9._-]{1,80}$/.test(m2[1])) { if (!spTok.has(m2[1])) spTok.set(m2[1], []); spTok.get(m2[1]).push(t); } }
    const spSonuc = new Map();
    const spIslem = (async () => {
      const spaces = [...spTok.keys()].sort();
      const sinir = Math.floor(simdi() / 1000) - 90 * 86400;
      for (let i = 0; i < spaces.length; i += 40) {
        const p = spaces.slice(i, i + 40);
        // eslint-disable-next-line no-await-in-loop
        const r = await C.post('snapshot', 'https://hub.snapshot.org/graphql', { query: `{ proposals(first: 1000, where: { space_in: ${JSON.stringify(p)}, created_gte: ${sinir} }, orderBy: "created", orderDirection: desc) { id created end state space { id } } }` }, { host: 'snapshot' });
        if (!r.ok) { p.forEach(sp => spSonuc.set(sp, r.kota ? S.kota('bütçe') : S.hata(r.hata))); continue; }
        const l = (r.veri && r.veri.data && r.veri.data.proposals) || [];
        for (const sp of p) {
          const b = l.filter(x => x.space && x.space.id === sp);
          const t30 = Math.floor(simdi() / 1000) - 30 * 86400;
          spSonuc.set(sp, b.length ? S.ok({ oneri90: b.length, oneri30: b.filter(x => x.created >= t30).length, aktif: b.filter(x => x.state === 'active').length, sonOneri: new Date(Math.max(...b.map(x => x.created)) * 1000).toISOString(), ilk1000: l.length >= 1000 }) : S.bos('son 90 günde öneri yok', { oneri90: 0 }));
        }
      }
    })();
    await Promise.all([...islemler, ghIslem.then(() => log('INFO', 'F1: GitHub bitti')), spIslem.then(() => log('INFO', 'F1: Snapshot bitti'))]);
    log('INFO', 'F1: token kaynakları bitti');
    for (const t of izlenecek) {
      const orgs = [...orgTok.entries()].filter(([, ts]) => ts.includes(t)).map(([org]) => org);
      if (!t.llama) yaz(t, 'github', t.llamaDurum && t.llamaDurum.durum !== 'uygulanmaz' ? { ...t.llamaDurum, neden: `DefiLlama eşlemesi kurulamadı: ${t.llamaDurum.hata || t.llamaDurum.neden}` } : S.uyg('DefiLlama eşlemesi yok → repo bilinmiyor'));
      else if (!orgs.length) yaz(t, 'github', S.uyg('proje reposu bilinmiyor (DefiLlama github alanı boş)'));
      else {
        const parca = orgs.map(org => ({ org, s: ghBugun.get(org) || (durum.github[org] ? S.onb(durum.github[org], durum.github[org].kontrol) : { ...S.kota('ertelendi: GitHub kuyruğunda, sonraki koşuda'), ertelendi: true }) }));
        const okler = parca.filter(p => ['ok', 'onbellek', 'bos'].includes(p.s.durum));
        const ham = { orglar: parca.map(p => ({ org: p.org, durum: p.s.durum, ...(p.s.ham || {}) })), enYeniPush: okler.map(p => (p.s.ham || {}).pushedAt).filter(Boolean).sort().slice(-1)[0] || null };
        const tumBugun = parca.every(p => p.s.durum === 'ok' || p.s.durum === 'bos');
        yaz(t, 'github', okler.length === parca.length ? (tumBugun ? (okler.some(p => p.s.durum === 'ok') ? S.ok(ham) : S.bos('repo yok', ham)) : S.onb(ham, parca.map(p => (p.s.ham || {}).kontrol).filter(Boolean).sort()[0] || null))
          : parca.some(p => p.s.durum === 'hata') ? { ...S.hata('GitHub çağrısı başarısız'), ham } : { ...S.kota('ertelendi: GitHub bütçesi / saatlik sınır — sonraki koşuda'), ertelendi: true, ham });
      }
      const sps = [...spTok.entries()].filter(([, ts]) => ts.includes(t)).map(([sp]) => sp);
      if (!t.llama) yaz(t, 'snapshot', t.llamaDurum && t.llamaDurum.durum !== 'uygulanmaz' ? { ...t.llamaDurum, neden: `DefiLlama eşlemesi kurulamadı: ${t.llamaDurum.hata || t.llamaDurum.neden}` } : S.uyg('DefiLlama eşlemesi yok → yönetişim alanı bilinmiyor'));
      else if (!sps.length) yaz(t, 'snapshot', S.uyg('Snapshot alanı yok (DefiLlama governanceID)'));
      else {
        const p = sps.map(sp => ({ sp, s: spSonuc.get(sp) || S.hata('sorgulanmadı') }));
        const ham = { alanlar: p.map(x => ({ alan: x.sp, durum: x.s.durum, ...(x.s.ham || {}) })) };
        yaz(t, 'snapshot', p.some(x => x.s.durum === 'ok') ? S.ok(ham) : p.every(x => x.s.durum === 'bos') ? S.bos('son 90 günde öneri yok', ham) : p.some(x => x.s.durum === 'hata') ? { ...S.hata('Snapshot sorgusu başarısız'), ham } : { ...S.kota('bütçe'), ham });
      }
    }

    // 8) Bağlam
    log('INFO', 'F1: bağlam (Coin Metrics, BGeometrics, Bitview, stablecoin)');
    const baglam = { gun, coinmetrics: {}, bgeometrics: null, bitview: {}, stablecoin: null };
    const cmTam = [];
    const cmAl = async (metrik, baslangic) => {
      const satir = []; let url = `https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc,eth&metrics=${metrik}&frequency=1d&start_time=${baslangic}&status=all&page_size=10000`;
      for (let s = 0; s < 6 && url; s++) {
        // eslint-disable-next-line no-await-in-loop
        let r; try { r = await bekci(C.al('coinmetrics', url, { host: 'coinmetrics', araMs: 700, zamanAsimiMs: 60000 }), CAGRI_BEKCI_MS, `coinmetrics ${metrik}`); } catch (e) { r = { ok: false, hata: e.message }; }
        if (!r.ok) return { durum: r.kota ? 'kota' : 'hata', hata: r.hata, http: r.durum, satir };
        for (const d of (r.veri && r.veri.data) || []) satir.push(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, k === 'asset' || k === 'time' || /-status/.test(k) ? temizMetin(v, 40) : sayi(v)])));
        url = r.veri && r.veri.next_page_url ? r.veri.next_page_url : null;
      }
      return { durum: 'ok', satir };
    };
    durum.coinmetricsTam = durum.coinmetricsTam || {};
    for (const mt of CM_METRIKLER) {
      log('INFO', `F1: Coin Metrics ${mt}`);
      const tamYok = !durum.coinmetricsTam[mt];
      const r = await cmAl(mt, tamYok ? '2009-01-03' : gunStr(bas - CM_EK_GUN * 864e5));
      const ekBas = gunStr(bas - CM_EK_GUN * 864e5);
      baglam.coinmetrics[mt] = { durum: r.durum, tur: tamYok ? 'tam' : 'ek', satirSayisi: r.satir.length, seri: r.satir.filter(x => String(x.time) >= ekBas), hata: r.hata || null, http: r.http || null };
      if (r.durum === 'ok' && tamYok) { durum.coinmetricsTam[mt] = gun; cmTam.push(...r.satir.map(x => ({ metrik: mt, ...x }))); }
    }
    // BGeometrics: F0 ile ortak günlük sınır (günde ≤ 1)
    if (!kota.izin('bgeometrics')) baglam.bgeometrics = { durum: 'kota', neden: 'günde ≤ 1 istek (bugün F0 envanteri ya da önceki koşu kullandı)' };
    else {
      const r = await C.al('bgeometrics', 'https://bitcoin-data.com/v1/sth-sopr/last', { host: 'bgeometrics', araMs: 500, denemeler: 1 });
      baglam.bgeometrics = r.ok ? { durum: 'ok', uc: 'sth-sopr/last', ham: Object.fromEntries(Object.entries(r.veri || {}).slice(0, 12).map(([k, v]) => [temizMetin(k, 30), typeof v === 'number' || typeof v === 'boolean' ? v : temizMetin(v, 40)])) } : { durum: r.kota ? 'kota' : 'hata', hata: r.hata };
    }
    for (const sr of BITVIEW_SERILER) {
      const r = await C.al('bitview', `https://bitview.space/api/series/${sr}/day1?start=-10`, { host: 'bitview', araMs: 1000 });
      // day1 indeksi 0 = 2009-01-01 varsayımı (2026-10-09 yoklamasında end 6491 ↔ bugün; ham start/end saklanır)
      baglam.bitview[sr] = r.ok && r.veri && Array.isArray(r.veri.data) ? { durum: 'ok', start: sayi(r.veri.start), end: sayi(r.veri.end), stamp: temizMetin(r.veri.stamp, 30), surum: sayi(r.veri.version),
        seri: r.veri.data.map((v, i) => [gunStr(Date.UTC(2009, 0, 1) + (sayi(r.veri.start) + i) * 864e5), sayi(v)]), gunVarsayimi: 'day1 indeks 0 = 2009-01-01' } : { durum: r.kota ? 'kota' : 'hata', hata: r.hata || 'beklenmeyen biçim' };
    }
    baglam.stablecoin = llStabilSeri.ok && Array.isArray(llStabilSeri.veri) ? { durum: 'ok', nokta: llStabilSeri.veri.length,
      seri: llStabilSeri.veri.slice(-30).map(x => [gunStr(Number(x.date) * 1000), sayi(x.totalCirculatingUSD && x.totalCirculatingUSD.peggedUSD)]),
      liste: (llStabil.ok && llStabil.veri.peggedAssets || []).map(x => ({ id: temizMetin(x.id, 20), sembol: temizMetin(x.symbol, 24), pegType: temizMetin(x.pegType, 20), dolasimUsd: sayi(x.circulating && x.circulating.peggedUSD) })) }
      : { durum: llStabilSeri.kota ? 'kota' : 'hata', hata: llStabilSeri.hata };

    log('INFO', 'F1: dosyalar yazılıyor');
    // 9) Dosyalar (yalnız bugünün) → durum → manifest
    // Kalıcı eşleme koruması DİSKE YAZMADAN ÖNCE: daha önce sabitlenmiş hiçbir zincir değişmedi (denetim 11).
    const eskiZincir = JSON.parse(zincirOnce);
    for (const [k, v] of Object.entries(eskiZincir)) if (JSON.stringify(zincir[k]) !== JSON.stringify(v)) throw new Error(`zincir sabitleme ihlali: ${k} — hiçbir dosya yazılmadı`);
    const gunDiz = path.join(Y.arsiv, gun);
    klasor(gunDiz); klasor(Y.evren);
    const yazilan = [];
    const dosya = (p, icerik) => { atomikYaz(p, icerik); yazilan.push(p); };
    dosya(path.join(Y.evren, `${gun}.jsonl`), evrenSatir.map(r => JSON.stringify(r)).join('\n') + '\n');
    if (esikH.yeni) { dosya(path.join(kok, ESIK_DOSYA), JSON.stringify(esikH.yeni, null, 1)); log('INFO', `F1: evren eşikleri sabitlendi (V_cex ${esikH.yeni.V_cex}, L_dex = V_dex ${esikH.yeni.L_dex}, t0 ${esikH.yeni.t0})`); }
    const anlikDizi = [...anlik.values()].sort((a, b) => a.anahtar.localeCompare(b.anahtar));
    dosya(path.join(gunDiz, 'anlik.jsonl'), anlikDizi.length ? anlikDizi.map(r => JSON.stringify(r)).join('\n') + '\n' : '');
    // Dikkat F2 (kural-v1): KAÇIN listesi + olay/kontrol takibi. Hata arşivi DURDURMAZ: dikkat-hata.json yazılır, arşiv sürer.
    let dk = null, og = null, birlesme = {};
    try {
      og = DT.oncekiGunler(kok, m, gun, dosyaOku, 7, esikler);
      const th = DT.takipHazirla(kok, m, gun, dosyaOku);
      if (th.kuruldu) log('INFO', 'F2: takip durumu gün dosyalarından yeniden kuruldu (takip.json bayattı)');
      birlesme = Object.fromEntries(Object.entries(durum.izleme).filter(([, v]) => v && v.birlesti).map(([k2, v]) => [k2, v.birlesti]));
      dk = DT.gunluk({ gun, anlik: anlikDizi, evren: evrenSatir, oncekiGunler: og.gunler, oncekiDurum: og.durum, esikler, takip: th.takip, birlesme, hukumVar: !!IT.hukumKaydi(m, 'dikkat-hukum.json') });
      // okxPerp (PLAN-DIKKAT-LS §8.4) YALNIZ dosyaya yazılan kopyada: bellekteki satırlar (İZLE girdisi) ve kural çıktıları değişmez
      dosya(path.join(gunDiz, 'dikkat.jsonl'), dk.satirlar.length ? dk.satirlar.map(r => JSON.stringify(okxPerpEk(r))).join('\n') + '\n' : '');
      if (dk.olaySatirlari.length) dosya(path.join(gunDiz, 'dikkat-olay.jsonl'), dk.olaySatirlari.map(r => JSON.stringify(r)).join('\n') + '\n');
      dosya(path.join(gunDiz, 'dikkat-ozet.json'), JSON.stringify(dk.ozet));
      if (dk.hukum) { dosya(path.join(gunDiz, 'dikkat-hukum.json'), JSON.stringify(dk.hukum)); log('INFO', `F2: H-DL1 hükmü yazıldı (${dk.hukum.durum})`); }
    } catch (e) {
      dk = null;
      log('WARN', `F2 dikkat hesabı başarısız (arşiv sürüyor): ${e && e.message}`);
      dosya(path.join(gunDiz, 'dikkat-hata.json'), JSON.stringify({ gun, hata: temizMetin(e && e.message, 300) }));
    }
    // Dikkat F2 İZLE (kural-v1 §3, deneme 781) + puan gölgesi (puan-v1, 782): dikkat satırlarından. Hata arşivi DURDURMAZ (izle-hata.json).
    let iz = null;
    try {
      if (!dk) throw new Error('dikkat hesabı yok (dikkat-hata.json) — İZLE hesaplanamadı');
      const gg = IT.gecmisGunler(kok, m, gun, dosyaOku);
      const ith = IT.takipHazirla(kok, m, gun, dosyaOku);
      if (ith.kuruldu) log('INFO', 'F2: İZLE takip durumu gün dosyalarından yeniden kuruldu');
      iz = IT.gunluk({ gun, satirlar: dk.satirlar, evren: evrenSatir, esikler, gecmis: gg.gunler, gecmisVar: gg.gecmisVar, onceki: IT.oncekiIzle(kok, og.durum, dosyaOku), takip: ith.takip, birlesme,
        hukumVar: !!IT.hukumKaydi(m), gunDosyalari: () => IT.gunDosyalariOku(kok, m, esikler && esikler.t0, dosyaOku) });
      dosya(path.join(gunDiz, 'izle.json'), JSON.stringify(iz.dosya));
      if (iz.hukum) { dosya(path.join(gunDiz, 'izle-hukum.json'), JSON.stringify(iz.hukum)); log('INFO', 'F2: H-DL2/H-DL2P hükmü yazıldı'); }
    } catch (e) {
      iz = null;
      log('WARN', `F2 İZLE hesabı başarısız (arşiv sürüyor): ${e && e.message}`);
      dosya(path.join(gunDiz, 'izle-hata.json'), JSON.stringify({ gun, hata: temizMetin(e && e.message, 300) }));
    }
    dosya(path.join(gunDiz, 'kesif.json'), JSON.stringify({ gun, ...kesifHam }));
    dosya(path.join(gunDiz, 'toplu.json'), JSON.stringify({ gun,
      binance: { spotDurum: bSpot.ok ? 'ok' : 'hata', perpDurum: bPerp.ok ? 'ok' : 'hata', tabanlar: [...bT.values()], spotHacim: Object.fromEntries(hSpot), perpHacim: Object.fromEntries(hPerp) },
      bybit: { durum: bybit.ok ? 'ok' : 'hata', usdtTabanlar: [...bybitT].sort() }, okx: { durum: okx.ok ? 'ok' : 'hata', usdtTabanlar: [...okxT].sort(), perpDurum: okxPerpDurum, perpTabanlar: okxPerpDurum === 'ok' ? [...okxPerp].sort() : [] },
      defillama: { protokolDurum: llProt.ok ? 'ok' : 'hata', protokoller: prot, ebeveynler: ebev, ucret, gelir }, stablecoinKimlik: { durum: stabilDurum, gecko: stabilCg.size, adres: stabilAdres.size }, tokenizeHisse: kesifHam.tokenize, coingeckoListe: { durum: cgListe.ok ? 'ok' : cgListe.kota ? 'kota' : 'hata', kimlik: platform.size } }));
    dosya(path.join(gunDiz, 'baglam.json'), JSON.stringify(baglam));
    if (cmTam.length) dosya(path.join(gunDiz, 'coinmetrics-tam.jsonl'), cmTam.map(r => JSON.stringify(r)).join('\n') + '\n');
    // Kaynak özeti (token başına durumlar)
    const kaynakOzet = {};
    for (const a of anlikDizi) for (const [ad, s] of Object.entries(a.kaynaklar)) { const k = kaynakOzet[ad] || (kaynakOzet[ad] = { ok: 0, bos: 0, onbellek: 0, hata: 0, kota: 0, belirsiz: 0, uygulanmaz: 0 }); k[s.durum] = (k[s.durum] || 0) + 1; }
    const kanat = (kn) => { const r = evrenSatir.filter(x => x.kanat === kn && x.karar !== 'izleme-bitti'); return { aday: r.length, girdi: r.filter(x => x.karar === 'girdi').length, elendi: r.filter(x => x.karar === 'elendi').length, taban: r.filter(x => x.karar === 'girdi' && x.taban).length, isinma: r.filter(x => x.isinma).length, izleme: r.filter(x => x.izleme).length }; };
    const nedenSay = {}; for (const r of evrenSatir) for (const n of r.nedenler || []) nedenSay[n.kod] = (nedenSay[n.kod] || 0) + 1;
    const ozet = { evren: { cex: kanat('cex'), dex: kanat('dex') }, elemeNedenleri: nedenSay, izlemeBitti: evrenSatir.filter(x => x.karar === 'izleme-bitti').length, anlik: anlikDizi.length, kaynakOzet,
      baglam: { coinmetrics: Object.fromEntries(Object.entries(baglam.coinmetrics).map(([k, v]) => [k, `${v.durum}/${v.tur}`])), bgeometrics: baglam.bgeometrics.durum, bitview: Object.fromEntries(Object.entries(baglam.bitview).map(([k, v]) => [k, v.durum])), stablecoin: baglam.stablecoin.durum },
      zincirYeni: Object.keys(zincir).length - Object.keys(JSON.parse(zincirOnce)).length, sikistirilan: sikisan,
      cgBelirsiz: [...adaylar.values()].filter(x => x.cgBelirsiz).length, tokenHata,
      dikkat: dk ? { kacin: dk.ozet.kacin, yetersiz: dk.ozet.yetersiz, yeniGiren: dk.ozet.yeniGiren.length, olay: dk.ozet.olay, kontrol: dk.ozet.kontrol, kapanan: dk.ozet.kapanan.length, isinma: dk.ozet.isinma } : { hata: true },
      izle: iz ? { liste: iz.dosya.liste.length, puan: iz.dosya.puanListe.length, aday: iz.dosya.aday, havuz: iz.dosya.havuzSayi, giren: iz.dosya.girenler.length, cikan: iz.dosya.cikanlar.length, pencere: iz.dosya.pencereAc ? iz.dosya.pencereAc.k : null } : { hata: true },
      takipEdilen: takipSet.size, gencHatirlanan: Object.keys(durum.genc || {}).length, birlesen: birlesen.length };
    const bit = simdi();
    // İleriye bakış koruması: gün etiketi koşu BAŞLANGICININ UTC günü; hiçbir kayıt başlangıçtan önce ya da bitişten sonra alınmış olamaz.
    // UTC gece yarısını aşan koşuda sonraki güne düşen kayıtlar bilgi alanı taşır (gunSonrasi) ve sayılır (denetim 11).
    let gunSonrasi = 0;
    for (const a of anlikDizi) for (const s of Object.values(a.kaynaklar)) {
      const t = Date.parse(s.alindi);
      if (a.gun !== gun || !(t >= bas) || t > bit) throw new Error(`ileriye bakış koruması: ${a.anahtar} kaydı bu koşunun penceresi dışında (${s.alindi})`);
      if (s.gunSonrasi) gunSonrasi++;
    }
    const kosu = { gun, kip: resmi ? 'resmi' : 'deneme', resmi, neden, bas: new Date(bas).toISOString(), bit: new Date(bit).toISOString(), sureSn: Math.round((bit - bas) / 1000), surum: SURUM, evrenSurum: E.EVREN_SURUM,
      ozet, uclar: C.uclar, kota: { bu: kota.bu, gun: kota.k.istek, butce: kota.butce, aylik: AYLIK_BUTCE }, binance: o.binanceKota ? o.binanceKota.ozet() : null, http: http.sayac, tokenKaynakSayac: sayac, tokenHata, gunSonrasiKayit: gunSonrasi, gecYarisiAsildi: gunStr(bit) !== gun };
    dosya(path.join(gunDiz, 'kosu.json'), JSON.stringify(kosu, null, 1));
    atomikYaz(Y.zincir, JSON.stringify(zincir, null, 1));
    atomikYaz(Y.durum, JSON.stringify(durum));
    kota.kaydet();
    if (resmi) {
      const sonG = m.length ? m[m.length - 1].gun : null;
      if (sonG) for (let d = E.gunFark(sonG, gun) - 1, t = Date.parse(`${sonG}T00:00:00Z`) + 864e5; d > 0; d--, t += 864e5)
        manifestEkle(kok, { tur: 'bosluk', gun: gunStr(t), resmi: true, neden: 'kayıt yok (koşu olmadı) — sonradan doldurulamaz', zaman: new Date(bit).toISOString() });
    }
    const satir = manifestEkle(kok, { tur: 'gun', gun, resmi, ...(resmi && !m.some(k => k.tur === 'gun') ? { baslangic: true } : {}), neden, kip: resmi ? 'resmi' : 'deneme', zaman: new Date(bit).toISOString(),
      dosyalar: yazilan.map(p => ({ yol: goreli(kok, p), sha256: sha256Buf(fs.readFileSync(p)), bayt: fs.statSync(p).size })),
      durumOzet: { zincir: sha256Buf(fs.readFileSync(Y.zincir)), durum: sha256Buf(fs.readFileSync(Y.durum)) },
      sayim: { cex: ozet.evren.cex, dex: ozet.evren.dex, anlik: ozet.anlik } });
    // Türetilmiş dikkat durumu manifestten SONRA (gün dosyalarıyla tutarlı; yazılamazsa yenidenKur ile kurulur)
    if (dk) { try { atomikYaz(DT.yollar(kok).takip, JSON.stringify(dk.takip)); } catch (e) { log('WARN', `F2 takip durumu yazılamadı: ${e.message}`); } }
    if (iz) { try { atomikYaz(IT.yollar(kok).takip, JSON.stringify(iz.takip)); } catch (e) { log('WARN', `F2 İZLE takip durumu yazılamadı: ${e.message}`); } }
    log('INFO', `F1 günlük arşiv ${gun} kaydedildi (${Math.round((bit - bas) / 1000)} sn)`);
    return { durum: 'kaydedildi', gun, kip: resmi ? 'resmi' : 'deneme', ozet, kosu, manifest: satir, kok, dikkat: dk ? dk.ozet : null, izle: iz ? { liste: iz.dosya.liste.length, puan: iz.dosya.puanListe.length, bosNeden: iz.dosya.bosNeden } : null };
  } finally {
    kilitBirak(o);
  }
}

/**
 * Panel kartı: kip başına son kayıt günü, kesintisiz gün, boşluklar, zincir. VARSAYILAN HAFİF (denetim 12): satır zinciri tam,
 * dosya SHA'sı yalnız SON kayıt gününün; sonuç manifest (boyut + değişim zamanı) değişmedikçe önbellekten döner (yeniden SHA yok).
 * `tam: true` → tüm gün dosyaları (ağır; yalnız istekle — GET /api/tarama/arsiv?tam=1, CLI --dogrula).
 */
const _durumOnb = new Map();
function arsivDurumu(o = {}) {
  const dosyaGun = o.tam ? Infinity : (o.dosyaGun == null ? 1 : o.dosyaGun);
  const kip = (resmi) => {
    const kok = kokDizin({ ...o, resmi });
    let imza = 'yok';
    try { const st = fs.statSync(yollar(kok).manifest); imza = `${st.size}:${st.mtimeMs}`; } catch { /* manifest yok */ }
    const anahtar = `${kok}|${dosyaGun}`;
    const onb = _durumOnb.get(anahtar);
    if (onb && onb.imza === imza) return { ...onb.deger, onbellek: true };
    const d = dogrula(kok, { dosyaGun });
    const k = d.sonGun ? jsonOku(path.join(yollar(kok).arsiv, d.sonGun, 'kosu.json'), null) || (() => { const b = dosyaOku(kok, `arsiv/${d.sonGun}/kosu.json`); try { return b ? JSON.parse(b.toString('utf8')) : null; } catch { return null; } })() : null;
    const deger = { kip: resmi ? 'resmi' : 'deneme', ...d, dogrulama: o.tam ? 'tam' : 'hafif (satır zinciri + son gün dosyaları)', hatalar: d.hatalar.slice(0, 20),
      sonKosu: k ? { gun: k.gun, neden: k.neden, bas: k.bas, sureSn: k.sureSn, evren: k.ozet.evren, anlik: k.ozet.anlik, kaynakOzet: k.ozet.kaynakOzet, baglam: k.ozet.baglam, tokenHata: k.tokenHata || 0 } : null };
    _durumOnb.set(anahtar, { imza, deger });
    return { ...deger, onbellek: false };
  };
  return { resmi: kip(true), deneme: kip(false), kilit: kilitDurumu(o), esikGun: E.ESIK_GUN, hedefKesintisiz: 7 };
}

module.exports = { gunlukKos, dogrula, arsivDurumu, kokDizin, yollar, Kota, KilitHatasi, kilitAl, kilitBirak, kilitDurumu, manifestEkle, manifestOku, eskiAylariSikistir, llamaBirimleri, protokolKisa,
  GUNLUK_BUTCE, AYLIK_BUTCE, PAYDA, S, SURUM, dosyaOku, esikOku, esikHazirla, ESIK_DOSYA, okxPerpTabanlari };
