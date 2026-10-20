/**
 * COIN TARAMA — ayarlar (`data/tarama/ayarlar.json`) + elle değişiklik DENETİM KAYDI (`data/tarama/denetim.jsonl`).
 *
 * config.json'a DOKUNMAZ. Panelden gelen her yama doğrulanır (bilinmeyen anahtar / aralık dışı değer reddedilir) ve
 * her elle değişiklik denetim kaydına yazılır: { zaman, kim, islem, hedef, eski, yeni } (yalnız eklenir).
 *
 * EŞİKLER ÖN KAYIT DEĞİL, BAŞLANGIÇ DEĞERİDİR: ileriye dönük kayıt birikmeden hiçbir eşiğin yanlış alarm / isabet
 * oranı bilinmiyor (ARASTIRMA-ONCHAIN.md §5: "eşikler ön kayıtla belirlenecek — şimdi sayı yok"). Gerekçe metinleri
 * bu yüzden "neden bu mertebe" der, "ölçüldü" demez. Kırmızı bayrak bir alım/satım sinyali DEĞİLDİR.
 */
'use strict';
const { atomikYaz, jsonOku, satirEkle, satirlariOku, temizMetin, dizinler } = require('./ortak');
const { AGLAR, BORSALAR, PIYASALAR, BASLANGIC_IZLEME, TEMMUZ_KAYNAK, coinId } = require('./aglar');

const SURUM = 1;

/**
 * Kaynaklar: açık/kapalı varsayılanı + gerekçe. CoinGecko ToS'u kalıcı depolamayı yasaklıyor → kapalı.
 * GeckoTerminal 2026-10-20'de çıkarıldı (her taramada 429 + aynı CoinGecko koşulları): eski ayarlar.json'daki
 * `kaynaklar.geckoterminal` okumada atılır (birlestir), yamada sessizce yok sayılır (KALDIRILAN_KAYNAK) — hata vermez.
 */
const KAYNAK_TANIM = Object.freeze({
  goplus: { ad: 'GoPlus', varsayilan: true, aciklama: 'EVM token güvenliği: holder sayısı, ilk 10 holder (sözleşme/kilit/etiket), LP sahipleri ve kilidi, sahip/mint/blacklist/vergi bayrakları. Anahtarsız.' },
  rugcheck: { ad: 'RugCheck', varsayilan: true, aciklama: 'Solana: toplam holder, ilk holder\'lar (insider), bilinen hesaplar, LP kilidi, mint/freeze yetkisi, "rugged". Anahtarsız.' },
  dexscreener: { ad: 'DexScreener', varsayilan: true, aciklama: 'DEX çiftleri: likidite, 24 s hacim, fiyat, ilk çift tarihi, site; paralı tanıtım kaydı (boost, ödenmiş reklam/profil). Anahtarsız, ToS ticari kullanıma izin veriyor.' },
  rdap: { ad: 'RDAP (alan adı)', varsayilan: true, aciklama: 'Alan adı kayıt tarihi ve kayıt şirketi (IANA bootstrap). Haftada bir sorgulanır, aradaki günlerde son değer "önbellek" diye kayda geçer.' },
  borsa: { ad: 'Borsa fiyatı', varsayilan: true, aciklama: 'Binance spot/perp (gerekirse Bybit, OKX, Gate) genel ticker: son fiyat, 24 s hacim. Binance istekleri veri orkestratörünün kota sayacından geçer.' },
  coingecko: { ad: 'CoinGecko', varsayilan: false, aciklama: 'Kategori (anlatı), piyasa değeri, dolaşım/toplam arz. VARSAYILAN KAPALI: aynı CoinGecko koşulları; anahtarsız uç sık 429 verir.' },
});
/** Kaldırılmış kaynaklar: eski panel/ayar dosyası gönderirse yok sayılır (bilinmeyen kaynak hatası değil). */
const KALDIRILAN_KAYNAK = new Set(['geckoterminal']);

/** Eşikler: varsayılan + sınır + gerekçe. Hepsi "başlangıç değeri, ön kayıt değil". */
const ESIK_TANIM = Object.freeze({
  ilk10DegisimPuan: { varsayilan: 5, min: 0.5, max: 50, birim: 'puan', ad: 'İlk 10 payı değişimi', gerekce: 'Ayıklanmış (sözleşme/kilit/etiket/yakma dışı) ilk 10 holder payının iki tarama arasında ±5 puan oynaması tek günde büyük bir el değiştirmedir. Temmuz listesinin tek anlık görüntüsünde bu pay coinler arasında %3–70; günlük gürültü bilinmiyor — ilk aylardaki yanlış alarm sayısına bakıp ayarlayın.' },
  adresDususPuan: { varsayilan: 2, min: 0.1, max: 50, birim: 'puan', ad: 'İlk 10 tek adres boşaltması', gerekce: 'Önceki taramada ilk 10\'da olan tek bir adresin payı arzın ≥ 2 puanı kadar azaldıysa "ana cüzdandan boşaltma" adayı (adres düzeyinde süreklilik, ARASTIRMA-ONCHAIN §3). Etiketsiz borsa cüzdanları da EOA görünür — inceleme ister.' },
  holderDususPct: { varsayilan: 5, min: 0.5, max: 90, birim: '%', ad: 'Holder sayısı düşüşü', gerekce: 'Holder sayısı normalde yavaş artar; iki tarama arasında %5 düşüş olağandışıdır (BAFE vakasında holder serisi çöküşte düz kaldı — gecikmeli bir gösterge, tek başına yetmez).' },
  likiditeDususPct: { varsayilan: 30, min: 1, max: 99, birim: '%', ad: 'Likidite çekilmesi', gerekce: 'Klasik LP çekme likiditenin çoğunu tek seferde götürür; %30 erken uyarı mertebesi. Fiyat düşüşü de likiditeyi (USD) düşürür — bayrak "çekildi" değil "düştü" der.' },
  lpKilitKalanGun: { varsayilan: 30, min: 1, max: 365, birim: 'gün', ad: 'LP kilidi bitişi', gerekce: 'LP kilidinin bitmesine 30 günden az kaldıysa kilit açılınca likidite çekilebilir. Kilit tarihi her kaynakta yok (GoPlus locked_detail, RugCheck lockers).' },
  lpKilitDususPuan: { varsayilan: 20, min: 1, max: 100, birim: 'puan', ad: 'Kilitli LP payı azalması', gerekce: 'Kilitli LP payı iki tarama arasında 20 puandan fazla azaldıysa kilit açılmış ya da LP taşınmış olabilir.' },
  alanAdiGun: { varsayilan: 30, min: 1, max: 730, birim: 'gün', ad: 'Alan adı yaşı (token\'a göre)', gerekce: 'Alan adı ilk DEX çiftinden ÖNCE ve en çok bu kadar gün önce kaydedilmişse "token için yeni alınmış" bayrağı çıkar. Token\'dan SONRA alınan alan adı olağandır, bayrak değil yalnız bilgi. BAFE vakasında alan adı token\'dan 9 gün önce alınmıştı. Eski bir alan adı satın alınmış olabilir — kayıt tarihi sahiplik değişimini göstermez.' },
  kayipTarama: { varsayilan: 2, min: 1, max: 30, birim: 'tarama', ad: 'Fiyat/hacim kaybı', gerekce: 'Önceden fiyatı olan token\'ın fiyatı ve hacmi art arda 2 taramada hiçbir kaynakta yoksa "kayboldu" (tek seferlik kaynak kesintisi bayrak olmasın). Token kayıttan silinmez.' },
});

const GENEL_TANIM = Object.freeze({
  otomatikSaat: { varsayilan: 20, min: 1, max: 168, ad: 'Otomatik tarama aralığı (saat)', gerekce: 'Panel açılınca (ya da sunucu zamanlayıcısı) son başarılı tarama bundan eskiyse arka planda tarama başlar. 20 saat: günde bir kayıt, saat kayması birikmesin.' },
  gecikmeSaat: { varsayilan: 36, min: 2, max: 336, ad: 'Gecikme uyarısı (saat)', gerekce: 'Son başarılı tarama bundan eskiyse "tarama gecikti" uyarısı (bir günlük kayıt kaçtı).' },
  rdapGun: { varsayilan: 7, min: 1, max: 90, ad: 'Alan adı sorgu aralığı (gün)', gerekce: 'Kayıt tarihi/şirketi nadiren değişir; RDAP sunucularını her gün yormamak için.' },
  zamanAsimiSn: { varsayilan: 15, min: 3, max: 120, ad: 'İstek zaman aşımı (sn)', gerekce: 'Yanıt vermeyen kaynak bütün taramayı bekletmesin.' },
});

/** Bayrak kodları (yok sayılabilir) — açıklamalar bayraklar.js'te. */
const BAYRAK_KODLARI = Object.freeze(['ilk10_artis', 'ilk10_azalis', 'ilk10_adres_bosaltma', 'holder_dusus', 'likidite_dusus', 'lp_kilit_bitiyor', 'lp_kilit_azaldi',
  'sahip_yetkisi', 'mint_yetkisi', 'blacklist', 'vergi_degisebilir', 'honeypot', 'rugged', 'parali_tanitim', 'alan_adi_yeni', 'veri_kayboldu']);

function varsayilanCoin(c, kaynak) {
  return { id: coinId(c), sembol: c.sembol, ad: c.ad || null, ag: c.ag, sozlesme: c.sozlesme || null, fiyat: c.fiyat || null, alanAdi: c.alanAdi || null,
    coingeckoId: c.coingeckoId || null, belirsizlik: c.belirsizlik || null, not: c.not || null, yokSay: [], aktif: true, kaynak: kaynak || null, eklendi: c.eklendi || null };
}

function varsayilanlar() {
  const kaynaklar = {}; for (const [k, v] of Object.entries(KAYNAK_TANIM)) kaynaklar[k] = v.varsayilan;
  const esikler = {}; for (const [k, v] of Object.entries(ESIK_TANIM)) esikler[k] = v.varsayilan;
  const genel = {}; for (const [k, v] of Object.entries(GENEL_TANIM)) genel[k] = v.varsayilan;
  return { surum: SURUM, kaynaklar, esikler, ...genel, telegram: false, dikkatTelegram: true, izleme: BASLANGIC_IZLEME.map(c => varsayilanCoin({ ...c, eklendi: '2026-10-08' }, TEMMUZ_KAYNAK)) };
}

// ── Doğrulama ────────────────────────────────────────────────────────────
class AyarHatasi extends Error {}
const hata = (m) => { throw new AyarHatasi(m); };

function sayiDogrula(ad, v, t) {
  const n = Number(v);
  if (typeof v === 'boolean' || v === '' || v === null || !Number.isFinite(n)) hata(`${t.ad || ad}: sayı olmalı`);
  if (n < t.min || n > t.max) hata(`${t.ad || ad}: ${t.min} ile ${t.max} arasında olmalı`);
  return n;
}

const SEMBOL_RE = /^[A-Z0-9]{1,20}$/;
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ALAN_RE = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const BORSA_SEMBOL_RE = /^[A-Z0-9]{2,20}(-USDT|_USDT|USDT)$/;

/** Coin girdisi (panelden) → temiz coin nesnesi; hatada AyarHatasi. */
function coinDogrula(g, eski = null) {
  if (!g || typeof g !== 'object') hata('coin bilgisi eksik');
  const sembol = String(g.sembol ?? (eski && eski.sembol) ?? '').trim().toUpperCase();
  if (!SEMBOL_RE.test(sembol)) hata('sembol 1–20 harf/rakam olmalı (ör. MET)');
  const ag = String(g.ag ?? (eski && eski.ag) ?? 'diger').trim().toLowerCase();
  if (!AGLAR[ag]) hata(`bilinmeyen ağ: ${ag} (${Object.keys(AGLAR).join(', ')})`);
  let sozlesme = g.sozlesme === undefined ? (eski ? eski.sozlesme : null) : (g.sozlesme === null || String(g.sozlesme).trim() === '' ? null : String(g.sozlesme).trim());
  if (sozlesme) {
    if (AGLAR[ag].evm && !EVM_RE.test(sozlesme)) hata('EVM sözleşme adresi 0x + 40 onaltılık hane olmalı');
    if (ag === 'sol' && !SOL_RE.test(sozlesme)) hata('Solana mint adresi base58, 32–44 karakter olmalı');
    if (ag === 'diger' && sozlesme.length > 80) hata('adres çok uzun');
    if (AGLAR[ag].evm) sozlesme = sozlesme.toLowerCase();
  }
  if (sozlesme && !AGLAR[ag].evm && ag !== 'sol' && !/^[\w.:-]{1,80}$/.test(sozlesme)) hata('adres biçimi tanınmadı');
  let fiyat = g.fiyat === undefined ? (eski ? eski.fiyat : null) : g.fiyat;
  if (fiyat && typeof fiyat === 'object' && (fiyat.sembol || fiyat.borsa)) {
    const borsa = String(fiyat.borsa || 'binance').toLowerCase(), piyasa = String(fiyat.piyasa || 'spot').toLowerCase();
    const fs2 = String(fiyat.sembol || '').trim().toUpperCase();
    if (!BORSALAR.includes(borsa)) hata(`fiyat borsası ${BORSALAR.join(' / ')} olmalı`);
    if (!PIYASALAR.includes(piyasa)) hata('fiyat piyasası spot ya da perp olmalı');
    if (piyasa === 'perp' && borsa !== 'binance') hata('perp fiyatı yalnız Binance için');
    if (!BORSA_SEMBOL_RE.test(fs2)) hata('borsa sembolü ör. METUSDT / NES-USDT / MNT_USDT biçiminde olmalı');
    fiyat = { borsa, piyasa, sembol: fs2 };
  } else fiyat = null;
  let alanAdi = g.alanAdi === undefined ? (eski ? eski.alanAdi : null) : (g.alanAdi ? String(g.alanAdi).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '') : null);
  if (alanAdi && !ALAN_RE.test(alanAdi)) hata('alan adı ör. meteora.ag biçiminde olmalı');
  const coingeckoId = g.coingeckoId === undefined ? (eski ? eski.coingeckoId : null) : (g.coingeckoId ? String(g.coingeckoId).trim().toLowerCase() : null);
  if (coingeckoId && !/^[a-z0-9-]{1,80}$/.test(coingeckoId)) hata('CoinGecko kimliği küçük harf/rakam/tire olmalı');
  const yokSay = g.yokSay === undefined ? (eski ? eski.yokSay : []) : g.yokSay;
  if (!Array.isArray(yokSay) || yokSay.some(k => !BAYRAK_KODLARI.includes(k))) hata('yok sayılacak bayrak listesi geçersiz');
  const metin = (k, n) => (g[k] === undefined ? (eski ? eski[k] : null) : (g[k] ? temizMetin(g[k], n) : null));
  return {
    id: eski ? eski.id : coinId({ sembol, ag, sozlesme }),
    sembol, ad: metin('ad', 60), ag, sozlesme, fiyat, alanAdi, coingeckoId,
    belirsizlik: metin('belirsizlik', 400), not: metin('not', 400), yokSay: [...new Set(yokSay)],
    aktif: g.aktif === undefined ? (eski ? eski.aktif !== false : true) : !!g.aktif,
    kaynak: metin('kaynak', 60) || (eski ? eski.kaynak : 'elle'), eklendi: eski ? eski.eklendi : new Date().toISOString().slice(0, 10),
  };
}

/** Eşik/kaynak/genel yaması → yeni ayarlar (izleme listesi bu yolla değişmez). */
function yamaUygula(ayar, yama) {
  if (!yama || typeof yama !== 'object' || Array.isArray(yama)) hata('yama nesne olmalı');
  const y = JSON.parse(JSON.stringify(ayar));
  for (const [k, v] of Object.entries(yama)) {
    if (k === 'kaynaklar') {
      if (!v || typeof v !== 'object') hata('kaynaklar nesne olmalı');
      for (const [kk, vv] of Object.entries(v)) { if (KALDIRILAN_KAYNAK.has(kk)) continue; if (!KAYNAK_TANIM[kk]) hata(`bilinmeyen kaynak: ${kk}`); if (typeof vv !== 'boolean') hata(`${kk}: açık/kapalı (true/false) olmalı`); y.kaynaklar[kk] = vv; }
    } else if (k === 'esikler') {
      if (!v || typeof v !== 'object') hata('eşikler nesne olmalı');
      for (const [kk, vv] of Object.entries(v)) { if (!ESIK_TANIM[kk]) hata(`bilinmeyen eşik: ${kk}`); y.esikler[kk] = sayiDogrula(kk, vv, ESIK_TANIM[kk]); }
    } else if (GENEL_TANIM[k]) {
      y[k] = sayiDogrula(k, v, GENEL_TANIM[k]);
    } else if (k === 'telegram' || k === 'dikkatTelegram') {
      if (typeof v !== 'boolean') hata(`${k}: açık/kapalı (true/false) olmalı`);
      y[k] = v;
    } else hata(`bilinmeyen ayar: ${k}`);
  }
  if (y.gecikmeSaat <= y.otomatikSaat) hata('gecikme uyarısı otomatik tarama aralığından uzun olmalı');
  return y;
}

/** Diskteki ayarı varsayılanla birleştirir (yeni eklenen kaynak/eşik varsayılanını alır; bilinmeyenler atılır). */
function birlestir(disk) {
  const v = varsayilanlar();
  if (!disk || typeof disk !== 'object') return v;
  const out = { ...v, surum: SURUM };
  for (const k of Object.keys(KAYNAK_TANIM)) if (disk.kaynaklar && typeof disk.kaynaklar[k] === 'boolean') out.kaynaklar[k] = disk.kaynaklar[k];
  for (const [k, t] of Object.entries(ESIK_TANIM)) { const n = Number(disk.esikler && disk.esikler[k]); if (Number.isFinite(n) && n >= t.min && n <= t.max) out.esikler[k] = n; }
  for (const [k, t] of Object.entries(GENEL_TANIM)) { const n = Number(disk[k]); if (Number.isFinite(n) && n >= t.min && n <= t.max) out[k] = n; }
  if (typeof disk.telegram === 'boolean') out.telegram = disk.telegram;
  // Dikkat listesine yeni giren coin bildirimi (ön kayıt A11: varsayılan AÇIK; karar/değerlendirme etkisi yok)
  if (typeof disk.dikkatTelegram === 'boolean') out.dikkatTelegram = disk.dikkatTelegram;
  if (Array.isArray(disk.izleme)) out.izleme = disk.izleme.filter(c => c && c.id && c.sembol && AGLAR[c.ag]).map(c => ({ ...varsayilanCoin(c), ...c, yokSay: Array.isArray(c.yokSay) ? c.yokSay.filter(k => BAYRAK_KODLARI.includes(k)) : [] }));
  return out;
}

class AyarDeposu {
  constructor(o = {}) {
    this.D = dizinler(o);
    this.simdi = o.simdi || (() => Date.now());
    this._onb = null;
  }
  oku() {
    if (this._onb) return this._onb;
    const disk = jsonOku(this.D.ayarlar, null);
    this._onb = birlestir(disk);
    if (!disk) this._yaz(this._onb);   // ilk açılış: varsayılan (Temmuz izleme listesi) diske
    return this._onb;
  }
  _yaz(a) { atomikYaz(this.D.ayarlar, JSON.stringify(a, null, 2)); this._onb = a; }
  denetimYaz(kim, islem, hedef, eski, yeni) {
    satirEkle(this.D.denetim, { zaman: new Date(this.simdi()).toISOString(), kim: temizMetin(kim, 80) || 'bilinmiyor', islem, hedef, eski: eski === undefined ? null : eski, yeni: yeni === undefined ? null : yeni });
  }
  denetimOku(limit = 100) { const { satirlar } = satirlariOku(this.D.denetim); return satirlar.slice(-limit).reverse(); }

  /** Kaynak/eşik/genel yaması. Değişen her alan ayrı denetim satırı. */
  yamala(yama, kim) {
    const eski = this.oku();
    const yeni = yamaUygula(eski, yama);
    const farklar = [];
    for (const g of ['kaynaklar', 'esikler']) for (const k of Object.keys(yeni[g])) if (yeni[g][k] !== eski[g][k]) farklar.push([`${g}.${k}`, eski[g][k], yeni[g][k]]);
    for (const k of [...Object.keys(GENEL_TANIM), 'telegram', 'dikkatTelegram']) if (yeni[k] !== eski[k]) farklar.push([k, eski[k], yeni[k]]);
    if (!farklar.length) return { degisti: false, ayarlar: eski };
    this._yaz(yeni);
    for (const [h, e, y] of farklar) this.denetimYaz(kim, 'ayar', h, e, y);
    return { degisti: true, ayarlar: yeni, farklar: farklar.map(f => f[0]) };
  }

  /** İzleme listesi: ekle | guncelle | cikar. */
  izleme(islem, girdi, kim) {
    const a = JSON.parse(JSON.stringify(this.oku()));
    if (islem === 'ekle') {
      const c = coinDogrula(girdi, null);
      if (a.izleme.some(x => x.id === c.id)) hata(`${c.sembol} (${c.ag}) zaten listede`);
      a.izleme.push(c);
      this._yaz(a); this.denetimYaz(kim, 'izleme-ekle', c.id, null, c);
      return c;
    }
    const id = String((girdi && girdi.id) || '');
    const i = a.izleme.findIndex(x => x.id === id);
    if (i < 0) hata('coin listede yok');
    if (islem === 'cikar') {
      const eski = a.izleme[i];
      a.izleme.splice(i, 1);
      this._yaz(a); this.denetimYaz(kim, 'izleme-cikar', id, eski, null);
      return eski;
    }
    if (islem === 'guncelle') {
      const eski = a.izleme[i];
      const yeni = coinDogrula(girdi, eski);
      // Kimlik (id) değişmez: sözleşme/ağ düzeltmesi geçmiş kayıtla aynı coin olarak izlenir; düzeltme denetimde görünür.
      a.izleme[i] = yeni;
      const degisen = Object.keys(yeni).filter(k => JSON.stringify(yeni[k]) !== JSON.stringify(eski[k]));
      if (!degisen.length) return yeni;
      this._yaz(a);
      const e = {}, y = {}; for (const k of degisen) { e[k] = eski[k]; y[k] = yeni[k]; }
      this.denetimYaz(kim, 'izleme-duzelt', id, e, y);
      return yeni;
    }
    hata('islem ekle / guncelle / cikar olmalı');
  }
  gecersizKil() { this._onb = null; }
}

module.exports = { AyarDeposu, AyarHatasi, varsayilanlar, birlestir, yamaUygula, coinDogrula, KAYNAK_TANIM, ESIK_TANIM, GENEL_TANIM, BAYRAK_KODLARI, SURUM };
