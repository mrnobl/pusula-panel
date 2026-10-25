'use strict';
/**
 * MAKİNE PROTOKOLÜ (75.2, 3. faz parça 3a — TASARIM-MAKINE-HESAP-BOT §4.7 C3-uyum)
 * ═══════════════════════════════════════════════════════════════════════════
 * Makineler arası her yanıtın/gövdenin TEK şema kaynağı. Her makine yanıtında `{ protokol, surum }` döner.
 *
 * UYUM KURALI:
 *   · Okuma (kimlik, nabız, pano) protokol farkı ≤ 1 iken çalışır; bilinmeyen alan YOK SAYILIR (ileriye uyum).
 *   · Taşıma, devralma, kopya (3c / 4. faz) AYNI protokol ister.
 *   · Fark > 1: "uyumsuz" — nabız kaydedilmez (yalnız sürüm bilgisi), panel "önce iki makineyi aynı sürüme güncelleyin" der.
 * Protokol yalnız şema GERİYE UYUMSUZ değişince artar (alan eklemek artırmaz). Değişince `scripts/fixtures/makine-protokol-v<N>/`
 * yeni fikstürleri eklenir; `scripts/surum-uyum-selftest.js` v(N−1) fikstürlerinin de ayrıştırıldığını denetler.
 *
 * Şema biçimi: { alan: { tur, zorunlu?, desen?, enUzun?, enCok?, oge? (dizi öğesi şeması), alt? (nesne şeması), degerler? } }.
 * `temizle` yalnız bilinen alanları, sınırlı boyutta alır — eşten gelen veri diske ve panele BUNDAN geçerek gider.
 */

const MAKINE_PROTOKOL = 1;
const KIMLIK_RE = /^m-[0-9a-f]{12}$/;
const ADRES_RE = /^https?:\/\/[a-z0-9.-]{1,200}(:\d{1,5})?$/i;
const ROLLER = ['sunucu', 'gelistirme'];
const MODLAR = ['kagit', 'demo', 'canli'];
const BOT_TAVAN = 64;
/** 75.5 (3c): bot taşıma aşamaları (lib/makine/botTasima.js; nabız özetindeki bot satırında `tasima`). */
const TASIMA_ASAMALARI = ['tasiniyor', 'tasindi', 'basarisiz', 'yerlesiyor', 'geldi'];
/** 75.5 (3c): makinenin desteklediği yetenekler (alan eklemek protokolü artırmaz; eski eş bu alanı göndermez = yetenek yok). */
const YETENEKLER = ['bot-tasima-1'];

const BOT_SEMA = {
  kimlik: { tur: 'string', zorunlu: true, desen: /^[a-z0-9_-]{1,32}$/ },
  adGorunen: { tur: 'string', enUzun: 60 },
  mod: { tur: 'string|null', degerler: [...MODLAR, null] },
  calisiyor: { tur: 'boolean' },
  nobet: { tur: 'number' },
  // 75.5 (3c): botun sahibi olan makine (bot kaydı `makine`; null = kaydın bulunduğu makine) ve bu makinedeki taşıma aşaması
  makine: { tur: 'string|null', desen: KIMLIK_RE },
  tasima: { tur: 'string|null', degerler: [...TASIMA_ASAMALARI, null] }
};

/** 75.3 (3b, f1): yönetici seçimi kaydı (makineler.json `yonetici`; nabız özetinde `yonetici` — böylece seçim eşlere yayılır). */
const YONETICI_SEMA = {
  kimlik: { tur: 'string', zorunlu: true, desen: KIMLIK_RE },
  surum: { tur: 'number', zorunlu: true },
  zaman: { tur: 'string', zorunlu: true, enUzun: 40 },
  secen: { tur: 'string|null', desen: KIMLIK_RE }
};

/** Makinenin kendini anlattığı özet: GET /api/makine/kimlik yanıtı ve POST /api/makine/nabiz gövdesi bunu taşır.
 * 75.3 (3b) alanları eklendi (alan eklemek protokolü artırmaz; 75.2 eşi bunları okumadan atar): guncelleme.sha / guncelleme.kurulum,
 * baslangic, yonetici, telegram. */
const OZET_SEMA = {
  protokol: { tur: 'number', zorunlu: true },
  surum: { tur: 'string', zorunlu: true, enUzun: 24 },
  commit: { tur: 'string|null', enUzun: 40 },
  kimlik: { tur: 'string', zorunlu: true, desen: KIMLIK_RE },
  ad: { tur: 'string', zorunlu: true, enUzun: 64 },
  rol: { tur: 'string', zorunlu: true, degerler: ROLLER },
  zaman: { tur: 'string', zorunlu: true, enUzun: 40 },
  botlar: { tur: 'array', enCok: BOT_TAVAN, oge: BOT_SEMA },
  // sha = guncelleme.json'daki kurulu commit, kurulum = son "kuruldu" anı (B3 kademe kapısı: "hedefi kurmuş ve kararlı mı").
  guncelleme: { tur: 'object|null', alt: { durum: { tur: 'string|null', enUzun: 40 }, zaman: { tur: 'string|null', enUzun: 40 },
    sha: { tur: 'string|null', enUzun: 40 }, kurulum: { tur: 'string|null', enUzun: 40 } } },
  disk: { tur: 'object|null', alt: { bosGB: { tur: 'number|null' } } },
  /** Bu sürecin açılış anı (B3: çalışan kod en az 8 dk ayakta mı). */
  baslangic: { tur: 'string|null', enUzun: 40 },
  /** Bu makinenin bildiği yönetici seçimi. */
  yonetici: { tur: 'object|null', alt: YONETICI_SEMA },
  /** Telegram komut yoklaması: dinliyor mu, dinleyebilir mi (geliştirme engeli / araştırma modu yok), karar kipi. */
  telegram: { tur: 'object|null', alt: { dinliyor: { tur: 'boolean' }, uygun: { tur: 'boolean' }, kip: { tur: 'string|null', enUzun: 16 } } },
  /** 75.5 (3c): yetenekler (ör. 'bot-tasima-1' — bot taşıma uçları var). */
  yetenek: { tur: 'array', enCok: 16, oge: null }
};

/**
 * A3 (TASARIM-MAKINE-HESAP-BOT §6.1): GET /api/makine/risk satırı — eşin botlarının toplam risk ölçümü (lib/toplamRisk.js botOlc).
 * Sır yok (hesap = Anahtarlar kimliği, anahtarın kendisi değil). Alan eklemek protokolü artırmaz; 75.4 eşinde uç yok (404 → "eş eski sürüm").
 */
const RISK_BOT_SEMA = {
  kimlik: { tur: 'string', zorunlu: true, desen: /^[a-z0-9_-]{1,32}$/ },
  adGorunen: { tur: 'string|null', enUzun: 60 },
  mod: { tur: 'string|null', degerler: [...MODLAR, null] },
  hesap: { tur: 'string|null', enUzun: 64 },
  zaman: { tur: 'string', zorunlu: true, enUzun: 40 },
  ozsermaye: { tur: 'number|null' },
  brutNominal: { tur: 'number|null' },
  netNominal: { tur: 'number|null' },
  netBtcNominal: { tur: 'number|null' },
  kaldirac: { tur: 'number|null' },
  marjOrani: { tur: 'number|null' },
  felaketKayip: { tur: 'number|null' },
  korunmasizNominal: { tur: 'number|null' },
  semboller: { tur: 'array', enCok: 40, oge: { varlik: { tur: 'string', zorunlu: true, enUzun: 20 }, nominal: { tur: 'number', zorunlu: true } } },
  olculemedi: { tur: 'string|null', enUzun: 200 },
  kaynak: { tur: 'string|null', enUzun: 16 },        // 'kayit' = demo kabul botu: borsadan değil botun son kaydından
  kayitZamani: { tur: 'string|null', enUzun: 40 },
  not: { tur: 'string|null', enUzun: 200 },
  dokunulmaz: { tur: 'boolean' }
};

const SEMALAR = {
  /** GET /api/makine/kimlik */
  kimlik: { success: { tur: 'boolean', zorunlu: true }, ...OZET_SEMA },
  /** POST /api/makine/nabiz gövdesi (gönderen makinenin özeti) */
  nabiz: { ...OZET_SEMA },
  /** POST /api/makine/nabiz yanıtı (alan makinenin özeti + kaydedildi + uyum) */
  nabizYanit: { success: { tur: 'boolean', zorunlu: true }, kaydedildi: { tur: 'boolean', zorunlu: true }, uyum: { tur: 'string', zorunlu: true, degerler: ['tam', 'okuma', 'uyumsuz'] }, ...OZET_SEMA },
  /** A3: GET /api/makine/risk (eşin botlarının toplam risk satırları; yalnız o makinenin KENDİ botları) */
  risk: {
    success: { tur: 'boolean', zorunlu: true },
    protokol: { tur: 'number', zorunlu: true },
    kimlik: { tur: 'string', zorunlu: true, desen: KIMLIK_RE },
    zaman: { tur: 'string|null', enUzun: 40 },
    satirlar: { tur: 'array', zorunlu: true, enCok: BOT_TAVAN, oge: RISK_BOT_SEMA }
  },
  /** POST /api/makine/esle gövdesi (eşlemeyi başlatan B → kodu üreten A) */
  esleIstek: {
    kod: { tur: 'string', zorunlu: true, enUzun: 64 },
    kimlik: { tur: 'string', zorunlu: true, desen: KIMLIK_RE },
    ad: { tur: 'string', zorunlu: true, enUzun: 64 },
    rol: { tur: 'string', zorunlu: true, degerler: ROLLER },
    adres: { tur: 'string', zorunlu: true, desen: ADRES_RE },
    protokol: { tur: 'number', zorunlu: true },
    surum: { tur: 'string', zorunlu: true, enUzun: 24 },
    jeton: { tur: 'string', zorunlu: true, desen: /^[A-Za-z0-9_-]{43}$/ }
  },
  /** POST /api/makine/esle yanıtı (A → B) */
  esleYanit: {
    success: { tur: 'boolean', zorunlu: true },
    kimlik: { tur: 'string', zorunlu: true, desen: KIMLIK_RE },
    ad: { tur: 'string', zorunlu: true, enUzun: 64 },
    rol: { tur: 'string', zorunlu: true, degerler: ROLLER },
    protokol: { tur: 'number', zorunlu: true },
    surum: { tur: 'string', zorunlu: true, enUzun: 24 },
    jeton: { tur: 'string', zorunlu: true, desen: /^[A-Za-z0-9_-]{43}$/ }
  },
  /** 75.5 (3c) POST /api/makine/tasima/hazirlik gövdesi (kaynak → hedef): "bu botu sana taşıyabilir miyim?" — hedef ön denetimi. */
  tasimaHazirlik: {
    protokol: { tur: 'number', zorunlu: true },
    surum: { tur: 'string', zorunlu: true, enUzun: 24 },
    kimlik: { tur: 'string', zorunlu: true, desen: KIMLIK_RE },
    bot: { tur: 'object', zorunlu: true, alt: {
      kimlik: { tur: 'string', zorunlu: true, desen: /^[a-z][a-z0-9]{1,15}$/ },
      adGorunen: { tur: 'string|null', enUzun: 60 },
      mod: { tur: 'string', zorunlu: true, degerler: ['kagit', 'demo'] },
      nobet: { tur: 'number', zorunlu: true },
      strateji: { tur: 'string|null', enUzun: 32 },
      hesap: { tur: 'string|null', enUzun: 40 }
    } },
    gizli: { tur: 'boolean', zorunlu: true },
    boyut: { tur: 'number', zorunlu: true }
  },
  /** 75.5 (3c) hazırlık yanıtı (hedef → kaynak): tek kullanımlık hazırlık kimliği + hedefteki mevcut nöbet. */
  tasimaHazirlikYanit: {
    success: { tur: 'boolean', zorunlu: true },
    protokol: { tur: 'number', zorunlu: true },
    surum: { tur: 'string', zorunlu: true, enUzun: 24 },
    kimlik: { tur: 'string', zorunlu: true, desen: KIMLIK_RE },
    hazirlik: { tur: 'string', zorunlu: true, desen: /^[0-9a-f]{32}$/ },
    nobet: { tur: 'number', zorunlu: true },
    bitis: { tur: 'string', zorunlu: true, enUzun: 40 }
  },
  /** 75.5 (3c) POST /api/makine/tasima/al yanıtı (hedef → kaynak): paket yerleşti, kayıt yazıldı (taşımanın tamamlanma noktası). */
  tasimaAlYanit: {
    success: { tur: 'boolean', zorunlu: true },
    protokol: { tur: 'number', zorunlu: true },
    surum: { tur: 'string', zorunlu: true, enUzun: 24 },
    kimlik: { tur: 'string', zorunlu: true, desen: KIMLIK_RE },
    bot: { tur: 'string', zorunlu: true, desen: /^[a-z][a-z0-9]{1,15}$/ },
    nobet: { tur: 'number', zorunlu: true },
    mutabakat: { tur: 'string', zorunlu: true, degerler: ['bekliyor', 'elle'] },
    uyarilar: { tur: 'array', enCok: 16, oge: null }
  }
};

function turUyar(v, tur) {
  return String(tur).split('|').some(t => (t === 'null' ? v === null : t === 'array' ? Array.isArray(v)
    : t === 'object' ? (v !== null && typeof v === 'object' && !Array.isArray(v)) : t === 'number' ? (typeof v === 'number' && Number.isFinite(v)) : typeof v === t));
}

/** Saf: nesne şemaya uyuyor mu → hata listesi (boş = uyar). Bilinmeyen alanlar hata DEĞİL. */
function denetle(sema, nesne, onek = '') {
  const h = [];
  if (!nesne || typeof nesne !== 'object' || Array.isArray(nesne)) return [`${onek || 'gövde'}: nesne değil`];
  for (const [ad, s] of Object.entries(sema)) {
    const v = nesne[ad];
    const yol = `${onek}${ad}`;
    if (v === undefined) { if (s.zorunlu) h.push(`${yol}: eksik`); continue; }
    if (!turUyar(v, s.tur)) { h.push(`${yol}: tür ${s.tur} değil`); continue; }
    if (s.degerler && !s.degerler.includes(v)) h.push(`${yol}: izinli değerlerden değil`);
    if (typeof v === 'string' && s.enUzun && v.length > s.enUzun) h.push(`${yol}: çok uzun`);
    if (typeof v === 'string' && s.desen && !s.desen.test(v)) h.push(`${yol}: biçim geçersiz`);
    if (Array.isArray(v)) {
      if (s.enCok && v.length > s.enCok) h.push(`${yol}: çok fazla öğe`);
      if (s.oge) v.slice(0, s.enCok || v.length).forEach((x, i) => h.push(...denetle(s.oge, x, `${yol}[${i}].`)));
    }
    if (s.alt && v && typeof v === 'object' && !Array.isArray(v)) h.push(...denetle(s.alt, v, `${yol}.`));
  }
  return h;
}

/** Saf: adı verilen şemaya göre denetle. @returns {{ ok: boolean, hatalar: string[] }} */
function dogrula(ad, nesne) {
  const s = SEMALAR[ad];
  if (!s) throw new Error(`bilinmeyen makine şeması: ${ad}`);
  const hatalar = denetle(s, nesne);
  return { ok: !hatalar.length, hatalar };
}

/** Saf: yalnız şemadaki alanlar (bilinmeyenler atılır, diziler tavanlı). Önce dogrula ile denetlenmiş olmalı. */
function temizle(sema, nesne) {
  if (typeof sema === 'string') sema = SEMALAR[sema];
  const o = {};
  if (!nesne || typeof nesne !== 'object') return o;
  for (const [ad, s] of Object.entries(sema)) {
    const v = nesne[ad];
    if (v === undefined || !turUyar(v, s.tur)) continue;
    if (Array.isArray(v)) o[ad] = s.oge ? v.slice(0, s.enCok || v.length).map(x => temizle(s.oge, x)) : v.slice(0, s.enCok || v.length);
    else if (s.alt && v && typeof v === 'object') o[ad] = temizle(s.alt, v);
    else if (typeof v === 'string' && s.enUzun) o[ad] = v.slice(0, s.enUzun);
    else o[ad] = v;
  }
  return o;
}

/** Saf: karşı makinenin protokolüne göre uyum. 'tam' (aynı) · 'okuma' (fark 1: yalnız okuma) · 'uyumsuz' (fark > 1 ya da bozuk). */
function uyum(karsi, ben = MAKINE_PROTOKOL) {
  if (!Number.isInteger(karsi) || karsi < 1) return 'uyumsuz';
  const f = Math.abs(karsi - ben);
  return f === 0 ? 'tam' : f === 1 ? 'okuma' : 'uyumsuz';
}

/** Saf: uyumun panel/insan metni. */
function uyumMetni(u) {
  return u === 'tam' ? 'aynı protokol' : u === 'okuma' ? 'yalnız okuma — taşıma ve devralma için iki makineyi aynı sürüme güncelleyin'
    : 'uyumsuz — önce iki makineyi aynı sürüme güncelleyin';
}

/** Saf (75.5): özet bu yeteneği bildiriyor mu (eski eş alanı göndermez → yok). */
const yetenekVar = (ozet, ad) => !!ozet && Array.isArray(ozet.yetenek) && ozet.yetenek.some(x => x === ad);

module.exports = { MAKINE_PROTOKOL, KIMLIK_RE, ADRES_RE, ROLLER, MODLAR, SEMALAR, OZET_SEMA, BOT_SEMA, YONETICI_SEMA, RISK_BOT_SEMA, TASIMA_ASAMALARI, YETENEKLER, yetenekVar, denetle, dogrula, temizle, uyum, uyumMetni };
