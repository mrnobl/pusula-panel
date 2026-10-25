'use strict';
/**
 * VERİ KALİTESİ KAPISI (74.3, D4 — PLAN-MAKINE-HESAP-BOT.md §1, TASARIM-MAKINE-HESAP-BOT.md §1)
 * ═══════════════════════════════════════════════════════════════════════════
 * Botun karar girdileri karar anından ÖNCE tek kapıdan geçer: mum (iki kaynak), fiyat, hesap, evren, kol mumları, funding.
 * 69.3 veri kapısının (lib/live/donchianBot.js mumKapisi) GENİŞLETİLMİŞİ — mevcut kapı aynen önce çalışır, metinleri değişmez.
 *
 *   denetle(tur, girdi, esikler) → { agirlik: 'temiz'|'hafif'|'agir', bulgular: [{ tur, kod, metin, deger, esik, agirlik }] }   (SAF)
 *   VeriKapisi (bot başına): ikinci kaynak okuma, çalışma kaydı <bot dizini>/veri-kalitesi.jsonl (YALNIZ EKLENİR), durum özeti.
 *
 * KİP (kullanıcı kararı 2026-10-25): 'izleme' (varsayılan, ilk 7 gün gözlem) | 'etkin'. İzlemede hiçbir bulgu kararı engellemez —
 *   yalnız kayıt + Sağlık / Sorunlar. Etkin kipte AĞIR bulgu → bot güvenli kipe (karar ertelenir, stop korunur; lib/live/bindirmeBot.js).
 *   Demo kabul botu (Kairos, mod demo, 2026-12-09 sonuna kadar) kip ne olursa olsun YALNIZ HABER alır (dokunulmaz).
 * KESİN KURALLAR: ikinci kaynak okunamazsa HAFİF (kod ikinci-kaynak-yok), karar ASLA engellenmez · funding ASLA ağır değil ·
 *   yeni npm paketi yok, ağ isteği yalnız Binance herkese açık spot ucu (kuru deneme ağ kalkanıyla uyumlu), 418/429 beklemesi ortak.
 */
const fs = require('fs');
const path = require('path');

const GUN = 864e5;
const DOSYA = 'veri-kalitesi.jsonl';
/** Demo kabul bitişi — lib/ozDenetim.js AYAR.demoKorumaBitis ile AYNI (veri-kalitesi-selftest denetler). */
const KORUMA_BITIS = Date.parse('2026-12-09T21:00:00Z');
const KIPLER = ['izleme', 'etkin'];
const IZLEME_GUN = 7;

/** Varsayılan eşikler (config.varsayilan.json veriKalitesi.esikler ile aynı; ayar dosyası üstüne yazar). */
const ESIKLER = {
  ikiKaynakHafif: 0.015,      // perp ↔ spot günlük kapanış farkı %1,5 → hafif
  ikiKaynakAgir: 0.03,        // %3 → ağır
  fiyatSapmaHafif: 0.20,      // mark fiyatı son kapanıştan %20'den fazla uzak → hafif
  kolAtlananHafif: 0.30,      // evrenin %30'undan fazlası veri kapısından geçemedi → hafif
  evrenAzOran: 0.5,           // evren sembol sayısı < k × 0,5 → ağır
  hesapSicramaHafif: 0.30,    // özsermaye önceki çalışmaya göre ±%30 (akış yokken) → hafif
  fundingHafif: 0.01,         // |funding| > %1 / 8 sa → hafif (asla ağır değil)
  zamanAsimiMs: 8000,         // ikinci kaynak isteği zaman aşımı (karar penceresi uzamasın)
};
const SIRA = { temiz: 0, hafif: 1, agir: 2 };
const enKotu = (l) => l.reduce((a, x) => (SIRA[x] > SIRA[a] ? x : a), 'temiz');
const yuzde = (x, n = 2) => `%${(x * 100).toFixed(n).replace('.', ',')}`;
const gunStr = (t) => new Date(t).toISOString().slice(0, 10);

function esikBirlestir(e) { const o = { ...ESIKLER }; for (const [k, v] of Object.entries(e || {})) if (k in ESIKLER && Number.isFinite(+v) && +v > 0) o[k] = +v; return o; }

/**
 * SAF denetim. @param tur 'mum-btc' | 'mum-kol' | 'fiyat' | 'evren' | 'hesap' | 'funding' | 'oi'
 * Girdiler:
 *   mum-btc { kapanis, ikinci: { kapanis } | { hata } | null, sembol }
 *   mum-kol { atlanan: [{ symbol, sebep }], semboller: [evren] (ya da evren: n) }
 *   fiyat   { fiyat, sonKapanis }
 *   evren   { semboller: n, k, bayat, tickerBos }
 *   hesap   { toplam, ozsermaye, onceki, akisVar }
 *   funding { okunamadi, oran }
 *   oi      (bugün karar girdisi değil — tür tanımlı, bulgu üretmez; ileriye kayıt için)
 */
function denetle(tur, g = {}, esikler = ESIKLER) {
  const E = esikBirlestir(esikler);
  const b = [];
  const ekle = (agirlik, kod, metin, deger = null, esik = null) => b.push({ tur, kod, metin, deger, esik, agirlik });
  if (tur === 'mum-btc') {
    const ik = g.ikinci;
    const k1 = +g.kapanis;
    if (!ik || ik.hata || !(+ik.kapanis > 0)) ekle('hafif', 'ikinci-kaynak-yok', `ikinci kaynak (Binance spot) okunamadı${ik && ik.hata ? `: ${String(ik.hata).slice(0, 120)}` : ''} — karar engellenmedi`);
    else if (k1 > 0) {
      const fark = Math.abs(k1 / +ik.kapanis - 1);
      const m = `${g.sembol || 'BTC'} günlük kapanış: vadeli ${+k1.toPrecision(8)} · spot ${+(+ik.kapanis).toPrecision(8)} (fark ${yuzde(fark)})`;
      if (fark > E.ikiKaynakAgir) ekle('agir', 'iki-kaynak', `iki kaynak çok farklı — ${m}`, fark, E.ikiKaynakAgir);
      else if (fark > E.ikiKaynakHafif) ekle('hafif', 'iki-kaynak', `iki kaynak farklı — ${m}`, fark, E.ikiKaynakHafif);
    }
  } else if (tur === 'mum-kol') {
    const U = Array.isArray(g.semboller) ? g.semboller : null;
    const n = U ? U.length : Math.max(0, +g.evren || 0);
    const veri = (g.atlanan || []).filter(a => /^veri kapısı|^mum yok/.test(String(a.sebep || '')) && (!U || U.includes(a.symbol)));
    if (n > 0 && veri.length / n > E.kolAtlananHafif) ekle('hafif', 'kol-atlanan', `kol evreninin ${veri.length}/${n} sembolü veri kapısından geçemedi (${veri.slice(0, 4).map(a => String(a.symbol).split('/')[0]).join(', ')}) — o semboller bu çalışmada atlandı`, veri.length / n, E.kolAtlananHafif);
  } else if (tur === 'fiyat') {
    const f = +g.fiyat, c = +g.sonKapanis;
    if (!(f > 0)) ekle('agir', 'fiyat-gecersiz', `mark fiyatı sıfır ya da geçersiz (${g.fiyat})`);
    else if (c > 0 && Math.abs(f / c - 1) > E.fiyatSapmaHafif) ekle('hafif', 'fiyat-sapma', `mark fiyatı ${+f.toPrecision(8)} son kapanıştan (${+c.toPrecision(8)}) ${yuzde(Math.abs(f / c - 1), 1)} uzak`, Math.abs(f / c - 1), E.fiyatSapmaHafif);
  } else if (tur === 'evren') {
    const n = +g.semboller || 0, k = +g.k || 0;
    if (g.tickerBos || n === 0) ekle('agir', 'evren-bos', 'coin evreni boş geldi (borsa listesi okunamadı)');
    else if (k > 0 && n < k * E.evrenAzOran) ekle('agir', 'evren-az', `coin evreni ${n} sembol — beklenen ${k} (yarısından az)`, n, Math.ceil(k * E.evrenAzOran));
    if (g.bayat && !(g.tickerBos || n === 0)) ekle('hafif', 'evren-bayat', 'coin evreni bu ay güncellenemedi — eski evren kullanılıyor');
  } else if (tur === 'hesap') {
    const t = g.toplam == null ? 0 : (typeof g.toplam === 'number' ? g.toplam : NaN);   // null = hesapta USDT yok (0); sayı olmayan / negatif = bozuk
    if (!Number.isFinite(t) || t < 0) ekle('agir', 'hesap-gecersiz', `hesap bakiyesi geçersiz (${g.toplam})`);
    else if (!g.akisVar && +g.onceki > 0 && Number.isFinite(+g.ozsermaye) && Math.abs(+g.ozsermaye / +g.onceki - 1) > E.hesapSicramaHafif) {
      const r = +g.ozsermaye / +g.onceki - 1;
      ekle('hafif', 'hesap-sicrama', `özsermaye önceki çalışmaya göre ${r > 0 ? '+' : '−'}${yuzde(Math.abs(r), 1)} değişti, para yatırma/çekme kaydı yok`, r, E.hesapSicramaHafif);
    }
  } else if (tur === 'funding') {
    if (g.okunamadi) ekle('hafif', 'funding-yok', `BTC ayağı funding okunamadı${typeof g.okunamadi === 'string' ? ` (${g.okunamadi.slice(0, 100)})` : ''} — yalnız ölçüm, karar etkilenmez`);
    else if (Number.isFinite(+g.oran) && Math.abs(+g.oran) > E.fundingHafif) ekle('hafif', 'funding-asiri', `funding ${yuzde(+g.oran, 3)} / 8 sa — olağan dışı`, +g.oran, E.fundingHafif);
  }
  return { agirlik: enKotu(b.map(x => x.agirlik)), bulgular: b };
}

/** Birden çok denetim sonucunu tek sonuca birleştirir. */
function birlestir(sonuclar) {
  const bulgular = sonuclar.filter(Boolean).flatMap(s => s.bulgular || []);
  return { agirlik: enKotu(bulgular.map(x => x.agirlik)), bulgular };
}

/** Bulgu listesi → tek satır metin (güvenli kip sebebi, günlük). */
function ozetMetni(sonuc) {
  const l = (sonuc && sonuc.bulgular) || [];
  const agir = l.filter(x => x.agirlik === 'agir');
  return (agir.length ? agir : l).map(x => x.metin).join(' · ').slice(0, 280);
}

/**
 * Binance SPOT günlük kapanış okuyucu (anahtarsız herkese açık uç; api.binance.com — kuru deneme ağ kalkanının izin listesinde).
 * @param o { fetchFn (yerleşik fetch), bekleme ({ oku() → {bitis,kod}|null, yaz(x) } — veri orkestratörünün ORTAK 418/429 beklemesi),
 *            zamanAsimiMs, simdi }
 * @returns async (sembol 'BTCUSDT', gunMs) → { kapanis } | { hata }
 */
function spotOkuyucu({ fetchFn = (typeof fetch === 'function' ? fetch : null), bekleme = null, zamanAsimiMs = ESIKLER.zamanAsimiMs, simdi = () => Date.now() } = {}) {
  return async (sembol, gunMs) => {
    try {
      const bk = bekleme && typeof bekleme.oku === 'function' ? bekleme.oku() : null;
      if (bk && Date.parse(bk.bitis) > simdi()) return { hata: `Binance hız sınırı beklemesi (${bk.kod}) — istek atılmadı` };
      if (!fetchFn) return { hata: 'fetch yok' };
      const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(sembol)}&interval=1d&startTime=${gunMs}&limit=2`;
      const r = await fetchFn(url, { signal: AbortSignal.timeout(zamanAsimiMs) });
      if (r.status === 418 || r.status === 429) {
        const ra = Number(r.headers && typeof r.headers.get === 'function' ? r.headers.get('retry-after') : NaN);
        const sure = Number.isFinite(ra) && ra > 0 ? ra * 1000 : r.status === 418 ? 2 * 3600e3 : 120e3;
        try { if (bekleme && typeof bekleme.yaz === 'function') bekleme.yaz({ bitis: new Date(simdi() + sure).toISOString(), kod: r.status, neden: 'veri kalitesi ikinci kaynak', zaman: new Date(simdi()).toISOString() }); } catch { /* yoksay */ }
        return { hata: `HTTP ${r.status} (hız sınırı)` };
      }
      if (!r.ok) return { hata: `HTTP ${r.status}` };
      const l = await r.json();
      const m = Array.isArray(l) ? l.find(x => Array.isArray(x) && +x[0] === gunMs) : null;
      if (!m) return { hata: `${gunStr(gunMs)} günlük mumu spot listesinde yok` };
      const c = +m[4];
      return c > 0 ? { kapanis: c } : { hata: 'spot kapanışı geçersiz' };
    } catch (e) { return { hata: String((e && e.message) || e).slice(0, 160) }; }
  };
}

class VeriKapisi {
  /**
   * @param o { dizin (bot dizini), kipFn () → 'izleme'|'etkin', esikFn () → eşikler, ikinciKaynak (spotOkuyucu sonucu), varlik 'BTC',
   *            kaydet (seviye, metin), simdi }
   */
  constructor({ dizin = null, kipFn = () => 'izleme', esikFn = () => ESIKLER, ikinciKaynak = null, varlik = 'BTC', kaydet = () => {}, simdi = () => Date.now() } = {}) {
    this.dizin = dizin;
    this.dosya = dizin ? path.join(dizin, DOSYA) : null;
    this.kipFn = kipFn;
    this.esikFn = esikFn;
    this.ikinciKaynak = ikinciKaynak;
    this.varlik = varlik;
    this.kaydet = kaydet;
    this.simdi = simdi;
    this._son = null;   // son çalışma kaydı (bellek; açılışta dosyadan)
  }
  kip() { let k; try { k = this.kipFn(); } catch { k = 'izleme'; } return KIPLER.includes(k) ? k : 'izleme'; }
  esikler() { let e; try { e = this.esikFn(); } catch { e = null; } return esikBirlestir(e); }
  /** Demo kabul botu: kip ne olursa olsun yalnız haber. */
  static dokunulmaz(mod, simdi = Date.now()) { return mod === 'demo' && simdi < KORUMA_BITIS; }
  /** Etkin kip bu bot için geçerli mi (ağır bulguda güvenli kip). */
  etkinMi(mod, simdi = this.simdi()) { return this.kip() === 'etkin' && !VeriKapisi.dokunulmaz(mod, simdi); }

  denetle(tur, girdi) { return denetle(tur, girdi, this.esikler()); }

  /** mum-btc: son kapanmış perp mumu ↔ Binance spot aynı gün kapanışı. İkinci kaynak hatası ASLA atılmaz (hafif bulgu). */
  async mumBtc(mumlar) {
    const son = Array.isArray(mumlar) && mumlar.length ? mumlar[mumlar.length - 1] : null;
    if (!son) return denetle('mum-btc', { kapanis: null, ikinci: { hata: 'mum yok' } }, this.esikler());
    let ikinci;
    try { ikinci = this.ikinciKaynak ? await this.ikinciKaynak(`${this.varlik}USDT`, +son.time) : { hata: 'ikinci kaynak tanımlı değil' }; }
    catch (e) { ikinci = { hata: String((e && e.message) || e).slice(0, 160) }; }
    return denetle('mum-btc', { kapanis: son.close, ikinci, sembol: this.varlik }, this.esikler());
  }

  /**
   * Çalışma kaydı (YALNIZ EKLENİR) — her günlük çalışmada bir satır (temiz dahil: "şu an açık mı" ve 30 gün sayacı için).
   * @param s { zaman, gun, sonuc, kip, eylem ('kayit'|'guvenli-kip'|'haber'), mod }
   */
  calismaKaydet({ zaman = this.simdi(), gun = null, sonuc, kip = this.kip(), eylem = 'kayit', mod = null } = {}) {
    const satir = { zaman, gun, agirlik: (sonuc && sonuc.agirlik) || 'temiz', kip, eylem, mod, bulgular: ((sonuc && sonuc.bulgular) || []).slice(0, 20) };
    this._son = satir;
    if (!this.dosya) return satir;
    try { fs.mkdirSync(this.dizin, { recursive: true }); fs.appendFileSync(this.dosya, JSON.stringify(satir) + '\n', 'utf8'); }
    catch (e) { try { this.kaydet('WARN', `veri kalitesi kaydı yazılamadı: ${e.message}`); } catch { /* */ } }
    return satir;
  }
  /** Kip değişikliği satırı (izleme başlangıcı bu satırlardan okunur). */
  kipKaydet(kip, kim = 'panel', zaman = this.simdi()) {
    if (!this.dosya) return null;
    const satir = { zaman, tur: 'kip', kip, kim };
    try { fs.mkdirSync(this.dizin, { recursive: true }); fs.appendFileSync(this.dosya, JSON.stringify(satir) + '\n', 'utf8'); } catch { /* */ }
    return satir;
  }
  /** Kayıtlar (eskiden yeniye). @param gun son kaç gün (null → hepsi) */
  oku(gun = 30) {
    if (!this.dosya || !fs.existsSync(this.dosya)) return [];
    const sinir = gun == null ? -Infinity : this.simdi() - gun * GUN;
    let l = [];
    try { l = fs.readFileSync(this.dosya, 'utf8').split('\n').filter(Boolean).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(x => x && Number.isFinite(x.zaman) && x.zaman >= sinir); } catch { l = []; }
    return l;
  }
  /** Panel / öz denetim özeti: son çalışma, açık bulgu (son çalışma temiz değilse), 30 gün sayacı, son bulgular. */
  durum({ mod = null } = {}) {
    const simdi = this.simdi();
    const l = this.oku(30);
    const calisma = l.filter(x => x.tur !== 'kip');
    const son = calisma.length ? calisma[calisma.length - 1] : this._son;
    const sayac30 = { calisma: calisma.length, temiz: 0, hafif: 0, agir: 0, guvenliKip: 0 };
    for (const x of calisma) { sayac30[x.agirlik] = (sayac30[x.agirlik] || 0) + 1; if (x.eylem === 'guvenli-kip') sayac30.guvenliKip++; }
    const sonBulgular = calisma.filter(x => x.agirlik !== 'temiz').slice(-5).reverse().map(x => ({ zaman: x.zaman, gun: x.gun, agirlik: x.agirlik, eylem: x.eylem, bulgular: (x.bulgular || []).slice(0, 4) }));
    const kip = this.kip();
    return { kip, etkin: this.etkinMi(mod, simdi), dokunulmaz: VeriKapisi.dokunulmaz(mod, simdi), son: son || null,
      acik: son && son.agirlik !== 'temiz' ? { agirlik: son.agirlik, zaman: son.zaman, metin: ozetMetni(son), eylem: son.eylem } : null,
      sayac30, sonBulgular, ilkKayit: (this.oku(null)[0] || {}).zaman || null };
  }
}

/**
 * İzleme bilgisi (panel: "izleme başlangıcı + 7 gün doldu, bulgular şu, etkin kipe geçmek ister misiniz" — OTOMATİK GEÇİŞ YOK).
 * @param o { kip, izlemeBas (ms|null — ayardaki), kapilar: [VeriKapisi], simdi }
 */
function izlemeBilgisi({ kip, izlemeBas = null, kapilar = [], simdi = Date.now() } = {}) {
  if (kip !== 'izleme') return { kip, bas: null, gun: null, doldu: null, sayac: null, mesaj: 'Etkin kip: ağır bulguda bot güvenli kipe girer (demo kabul botu yalnız haber alır).' };
  const ilk = kapilar.map(k => { try { return k.durum().ilkKayit; } catch { return null; } }).filter(Number.isFinite);
  const bas = Number.isFinite(+izlemeBas) && +izlemeBas > 0 ? +izlemeBas : (ilk.length ? Math.min(...ilk) : null);
  const sayac = { calisma: 0, temiz: 0, hafif: 0, agir: 0 };
  if (bas != null) for (const k of kapilar) { for (const x of k.oku(null)) if (x.tur !== 'kip' && x.zaman >= bas) { sayac.calisma++; sayac[x.agirlik] = (sayac[x.agirlik] || 0) + 1; } }
  const gun = bas != null ? Math.floor((simdi - bas) / GUN) : null;
  const doldu = bas != null && simdi - bas >= IZLEME_GUN * GUN;
  const mesaj = bas == null ? 'İzleme kipi: ilk günlük çalışma bekleniyor. Bulgular kaydedilir, karar engellenmez.'
    : doldu ? `İzleme ${IZLEME_GUN} günü doldu (${gun} gün): ${sayac.calisma} çalışma · ${sayac.temiz} temiz · ${sayac.hafif} hafif · ${sayac.agir} ağır bulgu. Bulgular size uygun görünüyorsa etkin kipe geçebilirsiniz — Pusula kendiliğinden geçmez.`
      : `İzleme kipi: ${gun}. gün (${IZLEME_GUN} günde dolar). Şimdiye kadar ${sayac.calisma} çalışma · ${sayac.hafif} hafif · ${sayac.agir} ağır bulgu. Karar engellenmez.`;
  return { kip, bas, gun, doldu, sayac, mesaj, izlemeGun: IZLEME_GUN };
}

module.exports = { VeriKapisi, denetle, birlestir, ozetMetni, spotOkuyucu, izlemeBilgisi, esikBirlestir, ESIKLER, KIPLER, KORUMA_BITIS, IZLEME_GUN, DOSYA };
