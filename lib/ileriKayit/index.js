'use strict';
/**
 * İLERİYE KAYIT (73.3, kullanıcı 2026-10-24 WinC taslağı: "önce ileriye kayıt, veri kaybolmasın")
 * ═══════════════════════════════════════════════════════════════════════════
 * Sunucuda çalışan ileriye dönük HAM VERİ kayıtçıları. KARAR VERMEZ, emir yok, anahtar yok, ücretli kaynak yok; yalnız ileride
 * ön kayıtlı testler ve "Piyasa bağlamı" panosu için veri biriktirir. Bu veri geriye dönük indirilemez (çoğu uç yalnız anlık ya
 * da son 30 gün verir) → tür ARAŞTIRMA (lib/veriTurleri.js 'ileriye-kayit'), asla önbellek değil.
 *
 *   pozisyon     Binance USDⓈ-M /futures/data (OI, büyük hesap L/S pozisyon + hesap, genel L/S, taker al/sat) — 1 saatlik
 *                çözünürlük, 3 saatte bir; ilk çalışmada son 30 gün geriye doldurulur. Evren: 20 sabit likit + günün hacimli 10'u.
 *   opsiyon      OKX + Bybit + Binance opsiyon, BTC ve ETH, tüm vadeler, strike başına OI / IV / greek / mark — 4 saatte bir.
 *   hyperliquid  Liderlik tablosunda hesap değeri en büyük 100 adres (günde bir) → clearinghouseState pozisyonları — saatte bir.
 *   derinlik     Binance spot + perp emir defteri: en iyi alış/satış, makas, ±%0,1/%0,5/%1 derinlik — saatte bir (6 sembol).
 *   tasfiye      Binance / OKX / Bybit canlı tasfiye akışları (WebSocket) — dakikada bir toplu yazım.
 *
 * KURALLAR: botların karar penceresinde (UTC 23:50–01:30, lib/veri/orkestrator kararPenceresiKalanMs) REST koşusu başlamaz
 * (WebSocket akışı pasif, sürer). Aynı anda tek REST koşusu. Binance istekleri orkestratörün BinanceKota'sından geçer
 * (canlı botla ortak IP bütçesi, ortak 418/429 beklemesi). Araştırma kopyasında (ARASTIRMA_MODU=1 ya da data/makine.json
 * arastirmaModu) kayıtçılar ÇALIŞMAZ — sunucu tek kaynak; uç yalnız durumu gösterir. ILERI_KAYIT=0 kapatır.
 * Disk: <veri>/ileriye-kayit/<kayıtçı>/<gün>.jsonl → gün bitince .jsonl.gz (lib/ileriKayit/depo.js). Saklama varsayılan
 * SONSUZ; ayarlar.json `ileriyeKayit.saklaGun` (sayı ya da { kayıtçı: gün }) verilirse yalnız o kadar tutulur.
 *
 * server.js'e tek satır: require('./lib/ileriKayit').kur({ app, log, ozDenetim, binanceBekleme }).
 * Uç: GET /api/ileri-kayit/durum. Sağlık: öz denetim 'kayitci' (6 saatten uzun yazmayan kayıtçı → sarı).
 * Öz test (ağsız, sahte uçlar): node scripts/ileri-kayit-selftest.js
 */
const fs = require('fs');
const yollar = require('../yollar');
const { Depo, gunStr } = require('./depo');
const K = require('./kaynaklar');
const { TasfiyeAkisi } = require('./tasfiye');

const DK = 60e3;
const SAAT = 60 * DK;
const SAGLIK_ESIK_MS = 6 * SAAT;
const GZ_ORAN = 0.12;             // ölçülmüş tipik sıkıştırma oranı (jsonl → gzip -9); gerçek .gz günleri olunca o kullanılır

/** Kayıtçı tanımları — panel ve kılavuz aynı listeyi gösterir. tahminiAylikMB: sıkıştırılmış, ilk ölçüm (73.3, 2026-10-24). */
const KAYITCILAR = [
  { ad: 'pozisyon', kisaAd: 'Vadeli pozisyon istatistikleri', kaynak: 'Binance USDⓈ-M /futures/data — OI, büyük hesap long/short (pozisyon + hesap), genel long/short, taker al/sat',
    siklik: '3 saatte bir · 1 saatlik çözünürlük · ilk çalışmada son 30 gün geriye', aralikMs: 3 * SAAT, ofsetMs: 20 * DK, kos: K.pozisyon, tahminiAylikMB: 2 },
  { ad: 'opsiyon', kisaAd: 'Opsiyon açık pozisyonu (strike bazında)', kaynak: 'OKX, Bybit, Binance opsiyon — BTC ve ETH, tüm vadeler: OI, IV, delta/gamma, mark',
    siklik: '4 saatte bir anlık görüntü', aralikMs: 4 * SAAT, ofsetMs: 35 * DK, kos: K.opsiyon, tahminiAylikMB: 75 },
  { ad: 'hyperliquid', kisaAd: 'Hyperliquid büyük hesaplar', kaynak: 'Hyperliquid liderlik tablosu (günde bir, hesap değeri en büyük 100) + clearinghouseState pozisyonları',
    siklik: 'saatte bir', aralikMs: SAAT, ofsetMs: 10 * DK, kos: K.hyperliquid, tahminiAylikMB: 30 },
  { ad: 'derinlik', kisaAd: 'Emir defteri derinliği ve makas', kaynak: 'Binance spot + perp emir defteri — BTC, ETH, SOL, XRP, BNB, DOGE: en iyi fiyatlar, makas, ±%0,1 / %0,5 / %1',
    siklik: 'saatte bir', aralikMs: SAAT, ofsetMs: 3 * DK, kos: K.derinlik, tahminiAylikMB: 4 },
  { ad: 'tasfiye', kisaAd: 'Gerçekleşen tasfiyeler (canlı)', kaynak: 'Binance !forceOrder@arr, OKX liquidation-orders (tüm swap), Bybit allLiquidation (likit semboller)',
    siklik: 'canlı akış · dakikada bir yazım', akis: true, tahminiAylikMB: 90 },
];

function arastirmaMi(env = process.env) {
  if (env.ARASTIRMA_MODU === '1') return true;
  try { return !!JSON.parse(fs.readFileSync(yollar.veri('makine.json'), 'utf8').replace(/^﻿/, '')).arastirmaModu; } catch { return false; }
}

function kararPenceresiKalanMs(t) {
  try { return require('../veri/orkestrator').kararPenceresiKalanMs(t); } catch {
    const d = new Date(t), dk = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (dk >= 23 * 60 + 50) return ((24 * 60 - dk) + 90) * 60000;
    return dk < 90 ? (90 - dk) * 60000 : 0;
  }
}

/** Sahte kota (testte ya da bekleme erişimi yokken): yine de istekler arası bekler. */
function yalinKota(uyu) {
  let n = 0;
  return { istek: async (m, ex, fn) => { n++; try { return await fn(); } finally { await uyu(1000); } }, ozet: () => ({ istek: n }) };
}

class IleriKayit {
  /**
   * @param o { kok?, fetch?, WebSocket?, simdi?, uyu?, log?, kota?: () => BinanceKota, ayar?: () => {}, arastirma?: bool,
   *            acilisBeklemeMs?, tikMs? }
   */
  constructor(o = {}) {
    this.simdi = o.simdi || (() => Date.now());
    this.uyu = o.uyu || ((ms) => new Promise(r => { const t = setTimeout(r, ms); if (t.unref) t.unref(); }));
    this.log = o.log || (() => {});
    // ILERI_KAYIT_DIZIN: yalnız kılavuz görüntü üreticisinin geçici ÖRNEK klasörü (scripts/kilavuz-ekran.js).
    this.depo = new Depo({ kok: o.kok || process.env.ILERI_KAYIT_DIZIN || yollar.veri('ileriye-kayit'), simdi: this.simdi });
    const d = this.depo.durum();
    d.hostBekleme = d.hostBekleme || {};
    this.http = new K.Http({ fetch: o.fetch, simdi: this.simdi, bekleme: d.hostBekleme });
    this.kotaFn = o.kota || (() => yalinKota(this.uyu));
    this.ayarFn = o.ayar || (() => { try { return require('../ayarlar').oku().ileriyeKayit || {}; } catch { return {}; } });
    this.arastirma = o.arastirma != null ? !!o.arastirma : arastirmaMi();
    this.kapali = process.env.ILERI_KAYIT === '0';
    // Kılavuz görüntüsü: araştırma kopyasında ÖRNEK durum sunucudaymış gibi gösterilir (kayıtçı yine ÇALIŞMAZ).
    this.ornek = this.arastirma && process.env.ILERI_KAYIT_ORNEK === '1';
    this.acilisBeklemeMs = o.acilisBeklemeMs != null ? o.acilisBeklemeMs : 10 * DK;
    this.tikMs = o.tikMs || DK;
    this.baslangic = null;
    this.kosan = null;
    this.tasfiye = new TasfiyeAkisi({
      WebSocket: o.WebSocket, simdi: this.simdi, log: this.log,
      ekle: (l) => this.depo.ekle('tasfiye', l),
      semboller: () => (this.depo.kayitciDurum('tasfiye').imlec || {}).bybitSemboller || K.CEKIRDEK,
      zamanla: o.zamanla, yineleZamanla: o.yineleZamanla, temizle: o.temizle,
    });
  }

  tanim(ad) { return KAYITCILAR.find(k => k.ad === ad); }
  calisabilir() { return !this.arastirma && !this.kapali; }
  neden() { return this.arastirma ? 'araştırma kopyası — kayıtçılar yalnız sunucuda çalışır (sunucu tek kaynak)' : this.kapali ? 'ILERI_KAYIT=0 ile kapalı' : null; }

  // ── Zamanlama ──────────────────────────────────────────────────────────
  _slot(k, t) { return Math.floor((t - k.ofsetMs) / k.aralikMs); }
  /** Saf sayılır: bu kayıtçının şimdi koşması gerekiyor mu. */
  zamaniGeldi(k, simdi = this.simdi()) {
    const d = this.depo.kayitciDurum(k.ad);
    const slot = this._slot(k, simdi);
    if (d.sonBasari && this._slot(k, Date.parse(d.sonBasari)) >= slot) return false;
    if (d.slotDeneme && d.slotDeneme.slot === slot) {
      if (d.slotDeneme.n >= 3) return false;                                  // bu dilimde 3 deneme yapıldı
      if (d.sonDeneme && simdi - Date.parse(d.sonDeneme) < 20 * DK) return false;   // başarısız denemeden sonra 20 dk
    }
    return true;
  }

  async kos(ad, { zorla = false } = {}) {
    const k = this.tanim(ad);
    if (!k || k.akis) throw new Error(`bilinmeyen REST kayıtçısı: ${ad}`);
    if (this.kosan) return { atlandi: `başka kayıtçı koşuyor (${this.kosan})` };
    const simdi = this.simdi();
    if (!zorla && kararPenceresiKalanMs(simdi) > 0) return { atlandi: 'karar penceresi' };
    this.kosan = ad;
    const d = this.depo.kayitciDurum(ad);
    d.imlec = d.imlec || {};
    const slot = this._slot(k, simdi);
    d.slotDeneme = d.slotDeneme && d.slotDeneme.slot === slot ? { slot, n: d.slotDeneme.n + 1 } : { slot, n: 1 };
    d.sonDeneme = new Date(simdi).toISOString();
    const bas = this.simdi();
    let r;
    try {
      r = await k.kos({ http: this.http, kota: this.kotaFn, depo: this.depo, ad, imlec: d.imlec, simdi: this.simdi, uyu: this.uyu, ayar: this.ayarFn() || {}, log: this.log });
    } catch (e) {
      r = { satir: 0, hatalar: [String((e && e.message) || e).slice(0, 200)], durdu: true };
    } finally { this.kosan = null; }
    d.sonSure = Math.round((this.simdi() - bas) / 1000);
    d.sonSatir = r.satir || 0;
    d.ayrinti = r.ayrinti || null;
    d.uyarilar = (r.hatalar || []).slice(0, 8);
    const basarisiz = r.durdu || (!r.satir && (r.hatalar || []).length > 0);
    const onceki = d.sonHata;
    if (basarisiz) {
      d.sonHata = (r.hatalar || [])[0] || 'bilinmeyen hata';
      d.hataZamani = new Date(this.simdi()).toISOString();
      if (!onceki) this.log('WARN', `🧾 İleriye kayıt — ${k.kisaAd}: ${d.sonHata}`);
    } else {
      d.sonBasari = new Date(this.simdi()).toISOString();
      d.sonHata = null;
      if (onceki) this.log('INFO', `🧾 İleriye kayıt — ${k.kisaAd} yeniden yazıyor (${r.satir} satır)`);
    }
    this.depo.durumYaz();
    return r;
  }

  /** Bybit tasfiye abonelik listesi: çekirdek + Bybit'in günün hacimli ilk 10'u (UTC günde bir). */
  async _bybitSemboller() {
    const d = this.depo.kayitciDurum('tasfiye');
    d.imlec = d.imlec || {};
    const bugun = gunStr(this.simdi());
    if (d.imlec.bybitGun === bugun) return;
    d.imlec.bybitGun = bugun;
    try {
      const j = (await this.http.istek(`${K.UC.BYBIT}/v5/market/tickers?category=linear`)).veri;
      const l = ((j && j.result && j.result.list) || []).filter(x => /^[A-Z0-9]+USDT$/.test(x.symbol));
      const var_ = new Set(l.map(x => x.symbol));
      const cekirdek = K.CEKIRDEK.filter(s => var_.has(s));
      const ek = l.filter(x => !cekirdek.includes(x.symbol)).sort((a, b) => Number(b.turnover24h) - Number(a.turnover24h)).slice(0, 10).map(x => x.symbol);
      const yeni = [...cekirdek, ...ek];
      const eski = d.imlec.bybitSemboller || [];
      d.imlec.bybitSemboller = yeni;
      // Liste değiştiyse Bybit akışını yeni abonelikle yeniden aç.
      if (JSON.stringify(eski) !== JSON.stringify(yeni)) { const a = this.tasfiye.akislar.bybit; if (a && a.ws) { try { a.ws.close(); } catch { /* */ } } }
    } catch { /* dünkü liste / çekirdek sürer */ }
  }

  /** Günlük bakım: dünkü dosyaları sıkıştır, (istenmişse) saklama. Karar penceresinden sonra, günde bir. */
  bakim() {
    const d = this.depo.durum();
    const bugun = gunStr(this.simdi());
    if (d.bakimGun === bugun) return null;
    d.bakimGun = bugun;
    const ayar = this.ayarFn() || {};
    const out = { sikisan: 0, silinen: 0, hata: [] };
    for (const k of KAYITCILAR) {
      const s = this.depo.sikistir(k.ad);
      out.sikisan += s.sikisan; out.hata.push(...s.hata);
      const sg = ayar.saklaGun != null && typeof ayar.saklaGun === 'object' ? ayar.saklaGun[k.ad] : ayar.saklaGun;
      out.silinen += this.depo.saklama(k.ad, sg).silinen;
    }
    if (out.hata.length) this.log('WARN', `🧾 İleriye kayıt sıkıştırma: ${out.hata[0]}`);
    this.depo.durumYaz();
    return out;
  }

  /** Dakikalık tik: tasfiye tamponu → disk; bakım; sıradaki REST kayıtçısı (arka planda). */
  async tik() {
    const simdi = this.simdi();
    try {
      const n = this.tasfiye.bosalt();
      const d = this.depo.kayitciDurum('tasfiye');
      if (n) { d.sonHata = null; }
      d.ayrinti = this.tasfiye.ozet();
    } catch (e) {
      const d = this.depo.kayitciDurum('tasfiye');
      d.sonHata = `disk: ${String(e.message || e).slice(0, 160)}`; d.hataZamani = new Date(simdi).toISOString();
    }
    // Pencereden 15 dk önce de yeni REST koşusu başlamaz (uzun koşu — ilk geriye doldurma ~7 dk — pencereye taşmasın).
    const pencere = kararPenceresiKalanMs(simdi) > 0 || kararPenceresiKalanMs(simdi + 15 * DK) > 0;
    if (!pencere) {
      try { this.bakim(); } catch (e) { this.log('WARN', `🧾 İleriye kayıt bakımı: ${e.message}`); }
    }
    this.depo.durumYaz();
    if (pencere || this.kosan || (this.baslangic && simdi - this.baslangic < this.acilisBeklemeMs)) return null;
    await this._bybitSemboller();
    const k = KAYITCILAR.find(x => !x.akis && this.zamaniGeldi(x, simdi));
    if (!k) return null;
    return this.kos(k.ad);
  }

  baslat() {
    if (!this.calisabilir()) { this.log('INFO', `🧾 İleriye kayıt kapalı: ${this.neden()}`); return false; }
    if (this._id) return true;
    this.baslangic = this.simdi();
    this.depo.durum().baslangic = new Date(this.baslangic).toISOString();
    const ilk = setTimeout(() => {
      this._bybitSemboller().catch(() => {}).finally(() => this.tasfiye.baslat());
    }, Math.min(DK, this.acilisBeklemeMs));
    if (ilk.unref) ilk.unref();
    this._ilk = ilk;
    // Kapanışta (yeniden başlatma, güncelleme) tasfiye tamponundaki son dakika da yazılsın — eşzamanlı, kısa.
    this._cikis = () => { try { this.tasfiye.bosalt(); this.depo.durumYaz(); } catch { /* kapanış işi durdurmaz */ } };
    process.once('exit', this._cikis);
    this._id = setInterval(() => { this.tik().catch(e => this.log('WARN', `🧾 İleriye kayıt: ${e.message}`)); }, this.tikMs);
    if (this._id.unref) this._id.unref();
    this.log('INFO', '🧾 İleriye kayıt başladı (pozisyon istatistikleri, opsiyon, Hyperliquid, derinlik, tasfiye) — emir yok, yalnız ham veri');
    return true;
  }

  durdur() {
    if (this._ilk) clearTimeout(this._ilk);
    if (this._id) clearInterval(this._id);
    this._id = null;
    if (this._cikis) { process.removeListener('exit', this._cikis); this._cikis = null; }
    this.tasfiye.durdur();
    try { this.tasfiye.bosalt(); } catch { /* */ }
    this.depo.durumYaz();
  }

  // ── Durum / sağlık ─────────────────────────────────────────────────────
  aylikTahminMB(k, b) {
    if (b.sikisikGun > 0) return +(b.sikisikBayt / b.sikisikGun * 30 / 1048576).toFixed(1);
    // Henüz sıkıştırılmış gün yok: bugünün düz dosyasını 24 saate büyüt × tipik sıkıştırma oranı (en az 3 saatlik veriyle).
    const simdi = this.simdi();
    const gunBasi = Date.parse(`${gunStr(simdi)}T00:00:00Z`);
    const bas = Math.max(gunBasi, this.baslangic || gunBasi);
    const gecen = simdi - bas;
    let bugunBayt = 0;
    try { bugunBayt = fs.statSync(this.depo.dosya(k.ad, gunStr(simdi))).size; } catch { /* yok */ }
    if (bugunBayt > 0 && gecen >= 3 * SAAT) return +(bugunBayt * (24 * SAAT / gecen) * GZ_ORAN * 30 / 1048576).toFixed(1);
    return k.tahminiAylikMB;
  }

  durum() {
    const simdi = this.simdi();
    const d = this.depo.durum();
    const satirlar = KAYITCILAR.map(k => {
      const x = d.kayitcilar[k.ad] || {};
      const b = this.depo.boyut(k.ad);
      const sonYazimMs = x.sonYazim ? Date.parse(x.sonYazim) : null;
      const ref = sonYazimMs || this.baslangic || (d.baslangic ? Date.parse(d.baslangic) : null);
      const gec = this.calisabilir() && this.baslangic && ref != null && simdi - ref > SAGLIK_ESIK_MS;
      const durum = !this.calisabilir() && !this.ornek ? 'kapali' : x.sonHata ? 'hata' : gec ? 'uyari' : sonYazimMs ? 'iyi' : 'bekliyor';
      return {
        ad: k.ad, kisaAd: k.kisaAd, kaynak: k.kaynak, siklik: k.siklik, akis: !!k.akis,
        sonYazim: x.sonYazim || null, sonDeneme: x.sonDeneme || null, sonBasari: x.sonBasari || null, sonSure: x.sonSure != null ? x.sonSure : null,
        bugunSatir: this.depo.bugunSatir(k.ad), toplamSatir: x.toplamSatir || 0,
        sonHata: x.sonHata || null, hataZamani: x.hataZamani || null, uyarilar: x.uyarilar || [],
        durum, gec: !!gec,
        disk: { bayt: b.bayt, dosya: b.dosya, ilkGun: b.ilkGun, sonGun: b.sonGun, aylikTahminMB: this.aylikTahminMB(k, b) },
        akislar: k.akis ? this.tasfiye.ozet().akislar : undefined,
        ayrinti: k.akis ? { tampon: this.tasfiye.tampon.length, dusen: this.tasfiye.dusen } : (x.ayrinti || null),
      };
    });
    const toplamBayt = satirlar.reduce((s, x) => s + x.disk.bayt, 0);
    return {
      calisiyor: this.ornek || (this.calisabilir() && !!this._id), neden: this.ornek ? null : this.neden(), ornek: this.ornek || undefined, baslangic: d.baslangic || null, kosan: this.kosan,
      kararPenceresi: kararPenceresiKalanMs(simdi) > 0,
      kayitcilar: satirlar,
      disk: { toplamMB: +(toplamBayt / 1048576).toFixed(1), aylikTahminMB: +satirlar.reduce((s, x) => s + (x.disk.aylikTahminMB || 0), 0).toFixed(0), saklama: this._saklamaMetni() },
      esikSaat: SAGLIK_ESIK_MS / SAAT,
    };
  }

  _saklamaMetni() {
    const a = (this.ayarFn() || {}).saklaGun;
    if (a == null || a === 0) return 'süresiz (ham veri silinmez)';
    if (typeof a === 'number') return `${a} gün`;
    return Object.entries(a).filter(([, v]) => v).map(([k, v]) => `${k} ${v} gün`).join(', ') || 'süresiz (ham veri silinmez)';
  }

  /** Öz denetim için: { calisiyor, neden, gecikenler: [{ ad, kisaAd, saat }], toplam, esikSaat }. */
  saglik() {
    const dur = this.durum();
    if (!this.calisabilir()) return { calisiyor: false, neden: dur.neden, gecikenler: [], hatali: [], toplam: KAYITCILAR.length, esikSaat: dur.esikSaat };
    const simdi = this.simdi();
    const gecikenler = dur.kayitcilar.filter(x => x.gec).map(x => ({ ad: x.ad, kisaAd: x.kisaAd, saat: x.sonYazim ? Math.round((simdi - Date.parse(x.sonYazim)) / SAAT * 10) / 10 : null, hata: x.sonHata }));
    const hatali = dur.kayitcilar.filter(x => x.sonHata && !x.gec).map(x => ({ ad: x.ad, kisaAd: x.kisaAd, hata: x.sonHata }));
    return { calisiyor: true, gecikenler, hatali, toplam: KAYITCILAR.length, esikSaat: dur.esikSaat, sessizAkislar: this.sessizAkislar(gecikenler) };
  }

  /**
   * 78.2 (Pusula Doktoru D5): 6 saatten uzun süredir SATIR gelmeyen tek tasfiye akışı (ör. OKX abonelik sessizce düştü; bağlantı ping'le
   * canlı göründüğü için sessizlik bekçisi yakalamaz). Bütün tasfiye kayıtçısı zaten gecikiyorsa boş (o 'tasfiye' kayıtçısı olarak sayılır).
   * Öz denetim 'kayitci' denetimi bunu OKUMAZ (davranışı değişmedi); yalnız Doktor okur.
   */
  sessizAkislar(gecikenler = []) {
    if (!this.tasfiye || !this.tasfiye.calisiyor || !this.baslangic || gecikenler.some(g => g.ad === 'tasfiye')) return [];
    const simdi = this.simdi();
    const AD = { binance: 'Binance', okx: 'OKX', bybit: 'Bybit' };
    return Object.keys(AD).map(ad => {
      const a = this.tasfiye.akislar[ad] || {};
      const ref = a.sonSatir || this.baslangic;
      if (!Number.isFinite(ref) || simdi - ref <= SAGLIK_ESIK_MS) return null;
      return { ad, kisaAd: `Tasfiye akışı (${AD[ad]})`, saat: Math.round((simdi - ref) / SAAT * 10) / 10, bagli: !!a.bagli, hata: a.sonHata || null };
    }).filter(Boolean);
  }

  /**
   * 78.2 (Pusula Doktoru D5): kayıtçının KENDİ yeniden deneme yolu — REST kayıtçısı için bir kez kos() (tek koşu kuralı ve karar
   * penceresi kendi içinde), 'tasfiye' için bütün akışlar, tek akış (binance / okx / bybit) için yalnız o bağlantı yeniden açılır.
   * Botlara, emirlere, ayara dokunmaz. @returns { tamam, atlandi?, ayrinti }
   */
  async yenile(ad, tur = 'kayitci') {
    if (!this.calisabilir() || !this._id) return { tamam: false, ayrinti: this.neden() || 'kayıtçılar çalışmıyor' };
    if (tur === 'akis') return this.tasfiye.yenidenAc(ad);
    if (ad === 'tasfiye') { this.tasfiye.durdur(); this.tasfiye.baslat(); return { tamam: true, ayrinti: 'bütün tasfiye akışları yeniden açıldı' }; }
    const k = this.tanim(ad);
    if (!k || k.akis) return { tamam: false, ayrinti: `bilinmeyen kayıtçı: ${ad}` };
    if (this.kosan) return { tamam: false, atlandi: true, ayrinti: `başka kayıtçı koşuyor (${this.kosan})` };
    if (kararPenceresiKalanMs(this.simdi()) > 0) return { tamam: false, atlandi: true, ayrinti: 'botların karar penceresi' };
    const r = await this.kos(ad);
    if (r && r.atlandi) return { tamam: false, atlandi: true, ayrinti: String(r.atlandi) };
    const ok = !!r && !r.durdu && (r.satir || 0) > 0;
    return { tamam: ok, ayrinti: ok ? `${r.satir} satır yazıldı` : String(((r && r.hatalar) || [])[0] || 'satır yazılmadı').slice(0, 200) };
  }

  router() {
    const express = require('express');
    const r = express.Router();
    r.get('/api/ileri-kayit/durum', (req, res) => {
      try { res.json({ success: true, ...this.durum() }); } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });
    return r;
  }
}

/**
 * server.js bağlantısı (tek satır). Router'ı bağlar, öz denetime 'kayitci' ölçümünü verir, sunucuda zamanlayıcıyı başlatır.
 * @param o { app, log, ozDenetim?, binanceBekleme? ({ oku, yaz } — orkestratörün ortak 418/429 beklemesi) }
 */
function kur({ app, log, ozDenetim, binanceBekleme } = {}) {
  let kota;
  if (binanceBekleme) {
    const { BinanceKota } = require('../veri/orkestrator');
    kota = () => new BinanceKota({ bekleme: binanceBekleme });
  }
  const ik = new IleriKayit({ log, kota });
  if (app) app.use(ik.router());
  if (ozDenetim && ozDenetim.ctx) {
    ozDenetim.ctx.kayitci = () => ik.saglik();
    ozDenetim.ctx.kayitciYenile = (ad, tur) => ik.yenile(ad, tur);   // 78.2: yalnız Pusula Doktoru D5 (lib/sunucu/doktorUclari.js) çağırır
  }
  ik.baslat();
  return ik;
}

module.exports = { IleriKayit, KAYITCILAR, kur, arastirmaMi, SAGLIK_ESIK_MS, GZ_ORAN, yalinKota };
