'use strict';
/**
 * EVDEN YAZMA + KUYRUK (64.8) — kullanıcı kararı 2026-10-16: kişisel kayıtların (Portföy › İşlem defterim = lib/islemDefteri,
 * Portföy › Portföyüm = lib/portfoyum) TEK KAYNAĞI sunucudur. Geliştirme bilgisayarında (araştırma modu) yapılan
 * değişiklikler sunucudaki panele iletilir; sunucu kapalıysa burada SIRALI bir kuyrukta bekler ve sunucu açılınca aynı sırayla kendiliğinden
 * gönderilir. İki yönlü birleştirme YOK.
 *
 * İKİ PARÇA:
 *  1) EV TARAFI — `istekDefteri({ dosya })`: geliştirme kademesinden (lib/guvenlik.js `req.kademe === 'gelistirme'`) gelen her
 *     yazma `x-istek-kimligi` (uuid) taşır. İşlenen kimlik + yanıtı `data/ev-istekler.json`'a yazılır (en çok 2000 kayıt / 90 gün);
 *     aynı kimlik ikinci kez gelirse (yanıt yolda kaybolmuş, geliştirme bilgisayarı yeniden denedi) iş yeniden YAPILMAZ, saklı yanıt
 *     döner (`istekTekrar: true`). Aynı kimlik o an işleniyorsa 503 (geliştirme bilgisayarı sonra yeniden dener).
 *  2) GELİŞTİRME TARAFI — `gelistirme({...})`: yalnız araştırma modunda ve `data/ev-baglanti.json` içinde `yazmaJetonu` varken.
 *     İzinli yazma uçları (lib/guvenlik.js GELISTIRME_YAZMA — iki tarafın tek listesi) sunucuya `x-panel-token` + `x-gelistirme-token`
 *     + `x-istek-kimligi` ile iletilir:
 *       · sunucu yanıt verdi (2xx ya da doğrulama 4xx) → yanıt kullanıcıya aynen (+ evKaynak.yazma); 4xx KUYRUĞA GİRMEZ.
 *       · ağ hatası / zaman aşımı / 5xx / sunucudaki panel reddi (401-403: eski sürüm, yanlış jeton) → `data/ev-kuyruk.jsonl`'a eklenir,
 *         202 { kuyrukta: true, sira } döner. Kuyrukta bekleyen varken yeni yazmalar da kuyruğa girer (sırayı geçmez).
 *     Boşaltıcı: 60 sn'de bir + her yazmadan hemen sonra + "Şimdi gönder". Sırayla gönderir; ilk ağ hatasında durur. Kuyruktaki
 *     bir kayda sunucu 4xx verirse kayıt `hata` olur (silinmez; ekranda sunucunun mesajıyla; kullanıcı "Kuyruktan çıkar" der), sonrakiler sürer.
 *     KUYRUK DOSYASI JETON İÇERMEZ (yalnız yöntem, yol, gövde, kimlik, zaman, özet metni, durum). Gönderilen kaydın gövdesi silinir.
 * Önizleme gibi yan etkisiz uçlar kuyruğa girmez: İşlem defterim önizlemesi sunucu kapalıyken BU bilgisayarda ayrıştırılır (çift denetimi
 * sunucu açılınca), Portföyüm CSV önizlemesi / fiyat yenileme / taşıma önizlemesi "sunucu kapalı" der.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');
const crypto = require('crypto');
const GV = require('./guvenlik');
const { ayarOku } = require('./evOkuma');
const IB = require('./istekBaglami');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFTER_TAVAN = 2000;
const DEFTER_SURE_MS = 90 * 864e5;
const YANIT_TAVAN = 16 * 1024;
const YAZMA_ZAMAN_ASIMI_MS = 60000;
const BOSALT_ARALIK_MS = 60000;
const GONDERILEN_TAVAN = 200;

function atomikYaz(dosya, metin) {
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  const gecici = `${dosya}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    const fd = fs.openSync(gecici, 'w');
    try { fs.writeSync(fd, metin); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(gecici, dosya);
  } catch (e) { try { fs.unlinkSync(gecici); } catch { /* yok */ } throw e; }
}

/* ══ 1) EV TARAFI: istek defteri (tekrarlanan isteği ikinci kez uygulamaz) ══════════════════════════════════════════════ */
/** F10e: defterde yanıtın yalnız küçük özeti (≤ 16 KB): üst düzey sayı/metin/mantık alanları; dizi → uzunluğu. */
function yanitKucult(g) {
  try { if (JSON.stringify(g).length <= YANIT_TAVAN) return g; } catch { return { success: false }; }
  const o = { success: !!(g && g.success), kisaltildi: true };
  if (g && typeof g === 'object') for (const [a, v] of Object.entries(g)) {
    if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) o[a] = typeof v === 'string' ? v.slice(0, 500) : v;
    else if (Array.isArray(v)) o[a] = v.length;
  }
  return JSON.stringify(o).length <= YANIT_TAVAN ? o : { success: o.success, kisaltildi: true };
}
/** F10a: isteğin içerik özeti (yöntem + yol + gövde) — aynı kimlik farklı içerikle gelirse 409. */
const icerikOzeti = (req) => crypto.createHash('sha256').update(`${String(req.method).toUpperCase()} ${GV.izinYolu(req.path)} ${JSON.stringify(req.body == null ? {} : req.body)}`).digest('hex');

/**
 * @param {{dosya:string, simdi?:Function, kayitAra?:(kimlik)=>boolean, korumaMs?:number}} o
 *   kayitAra (F5): defterde olmayan kimlik kayıt dosyalarında (`istek` alanı) var mı — varsa iş yapılmış, yanıt defteri yazılamadan
 *   süreç düşmüş demektir: işleyici çalıştırılmaz, 200 { istekTekrar, kurtarildi } döner.
 */
function istekDefteri({ dosya, simdi = () => Date.now(), kayitAra = null, korumaMs = 5 * 60 * 1000 }) {
  const isleniyor = new Set();
  function oku() {
    try { const j = JSON.parse(fs.readFileSync(dosya, 'utf8')); return Array.isArray(j.kayitlar) ? j.kayitlar : []; } catch { return []; }
  }
  function sakla(kimlik, durum, govde, h) {
    const t = simdi();
    const l = oku().filter(x => x.k !== kimlik && t - x.z < DEFTER_SURE_MS);
    l.push({ k: kimlik, z: t, d: durum, h, g: yanitKucult(govde) });
    atomikYaz(dosya, JSON.stringify({ kayitlar: l.slice(-DEFTER_TAVAN) }));
  }
  function bul(kimlik) { return oku().find(x => x.k === kimlik) || null; }

  function middleware(req, res, next) {
    if (req.kademe !== 'gelistirme' || req.method === 'GET' || req.method === 'HEAD') return next();
    const kimlik = String(req.headers['x-istek-kimligi'] || '');
    if (!UUID_RE.test(kimlik)) return res.status(400).json({ success: false, error: 'x-istek-kimligi (uuid) eksik/bozuk — geliştirme bilgisayarından gelen her yazma kimlik taşımalı' });
    const h = icerikOzeti(req);
    const eski = bul(kimlik);
    if (eski) {
      if (eski.h && eski.h !== h) return res.status(409).json({ success: false, error: 'aynı istek kimliği farklı içerikle geldi — reddedildi (kimlik bir kez kullanılır)' });
      res.set('X-Istek-Tekrar', '1');
      const g = eski.g && typeof eski.g === 'object' && !Array.isArray(eski.g) ? { ...eski.g, istekTekrar: true } : eski.g;
      return res.status(eski.d).json(g);
    }
    // F2: bağlantı kapansa da (istemci zaman aşımı) işleyici sürüyor olabilir — koruma YALNIZ yanıt yazılınca / bitince ya da
    // güvenlik süresi dolunca kalkar; bu arada aynı kimlik 503 alır, iş bitince saklı yanıtı alır.
    if (isleniyor.has(kimlik)) return res.status(503).json({ success: false, error: 'bu istek şu an işleniyor — biraz sonra yeniden denenir' });
    if (kayitAra) {
      let var_ = false;
      try { var_ = !!kayitAra(kimlik); } catch { var_ = false; }
      if (var_) {
        const g = { success: true, istekTekrar: true, kurtarildi: true, mesaj: 'bu değişiklik sunucuda zaten kayıtlı (yanıtı önceki denemede kaybolmuştu)' };
        try { sakla(kimlik, 200, g, h); } catch { /* */ }
        return res.status(200).json(g);
      }
    }
    isleniyor.add(kimlik);
    const zamanlayici = setTimeout(() => isleniyor.delete(kimlik), korumaMs);
    if (zamanlayici.unref) zamanlayici.unref();
    const bitir = () => { clearTimeout(zamanlayici); isleniyor.delete(kimlik); };
    res.on('finish', bitir);
    const json = res.json.bind(res);
    res.json = (govde) => {
      try { if (res.statusCode < 500) sakla(kimlik, res.statusCode, govde, h); } catch { /* defter yazılamadı: kayıtlardaki istek alanı korur (F5) */ }
      bitir();
      return json(govde);
    };
    req.istekKimligi = kimlik;
    return IB.calistir(kimlik, () => next());
  }
  return { middleware, oku, bul };
}

/* ══ 2) GELİŞTİRME TARAFI: ilet + kuyruk ═══════════════════════════════════════════════════════════════════════════════════ */

/** Hangi uç kuyruğa girer, hangisi sunucu kapalıyken başka yol izler. (Liste lib/guvenlik.js GELISTIRME_YAZMA; burada yalnız davranış.) */
function ucTanimi(method, yol) {
  const y = GV.izinYolu(yol);
  if (y === '/api/islem-defteri/onizle') return { kuyruk: false, yerelOnizle: true };
  if (y === '/api/portfoyum/csv/onizle' || y === '/api/portfoyum/fiyat-yenile') return { kuyruk: false };
  // 76.9: alış / alışa çevir — nakit yetmezse 409 soru anında cevaplanmalı (kuyrukta cevapsız kalırdı); sunucu kapalıysa 503.
  if (y === '/api/portfoyum/alis' || y === '/api/portfoyum/alisa-cevir') return { kuyruk: false };
  if (y.startsWith('/api/anahtarlar/')) return { kuyruk: false };   // 73.0: sır içeren gövde ev-kuyruk.jsonl'a ASLA girmez
  if (y.startsWith('/api/sorun-arac/')) return { kuyruk: false };   // 73.8: PIN'li gövde kuyruğa girmez; 409 (durum değişti) anında görünür
  // 73.4 model sermayesi / kesirli hisse ayarı (Portföy › Modeller › Bu ay › Ayarlar, "Kesirli hisseyi aç"): sunucu kâğıt hesabının
  // ayarı → sunucuya iletilir. KUYRUĞA GİRMEZ (10 kat değişim onayı 409 sorusu kuyrukta cevapsız kalırdı; sunucu kapalıysa 503).
  // Yazma jetonu kurulu değilse eski davranış: bu bilgisayarın kendi sermaye.json'u (yerel kâğıt hesap) — özellik kaybolmasın.
  if (y === '/api/tasarimci/sermaye') return { kuyruk: false, jetonsuzYerel: true };
  // 73.5 bildirim ayarları (Sistem › Bildirimler): sunucunun bildirim merkezinin ayarı → sunucuya iletilir, KUYRUĞA GİRMEZ (doğrulama
  // hatası anında görünsün; sunucu kapalıysa 503). Yazma jetonu yoksa eski davranış (bu bilgisayarın kendi bildirim-ayar.json'u).
  if (/^\/api\/bildirim\/(ayar|tur|sessiz|uretici|genel|gecici-bitir)$/.test(y)) return { kuyruk: false, jetonsuzYerel: true };   // 74.1: + genel, gecici-bitir
  return { kuyruk: true };
}

/** Kuyruk ve ekran için kısa, sırsız özet metni (gövdedeki dosya içeriği / tutarlar yazılmaz; yalnız ne yapıldığı). */
function ozetMetni(method, yol, govde) {
  const y = GV.izinYolu(yol), g = govde && typeof govde === 'object' ? govde : {};
  const kisa = (x, n = 40) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, n);
  const id = (y.split('/')[4] || '');
  if (y.startsWith('/api/islem-defteri/')) {
    if (y === '/api/islem-defteri/hesap') return `İşlem defterim: hesap aç "${kisa(g.ad)}"`;
    if (/^\/api\/islem-defteri\/hesap\//.test(y)) return `İşlem defterim: hesap ayarı (${kisa(id, 20)})`;
    if (y === '/api/islem-defteri/yukle') return `İşlem defterim: dosya yükle "${kisa(g.dosyaAdi, 60)}"`;
    if (/geri-al$/.test(y)) return `İşlem defterim: yüklemeyi geri al (${kisa(id, 20)})`;
    if (/iptal$/.test(y)) return `İşlem defterim: satır iptali (${kisa(id, 20)})`;
    if (/okx\/kayitlar$/.test(y)) return `İşlem defterim: OKX eşitlemesi — ${Array.isArray(g.kayitlar) ? g.kayitlar.length : 0} satır (bu bilgisayarın anahtarıyla)`;
    if (/binance\/kayitlar$/.test(y)) return `İşlem defterim: Binance eşitlemesi — ${Array.isArray(g.kayitlar) ? g.kayitlar.length : 0} satır (bu bilgisayarın anahtarıyla)`;
    return `İşlem defterim: ${y.slice(19)}`;
  }
  if (/^\/api\/bildirim\//.test(y)) return `Bildirim ayarı: ${kisa(g.tur || y.slice(14), 24)}`;
  if (/^\/api\/sorun-arac\//.test(y)) return `Sorun aracı: ${kisa(y.split('/')[3], 24)} (${kisa(g.bot, 12)}${g.sembol ? ` · ${kisa(g.sembol, 16)}` : ''})`;   // 73.8 — PIN yazılmaz
  if (y === '/api/tasarimci/sermaye') return `Model portföy ayarı: ${'kesirli' in g ? `kesirli hisse ${g.kesirli === true || g.kesirli === 'true' ? 'açık' : 'kapalı'}` : 'sermaye / eşik'}`;
  if (y === '/api/portfoyum/tasima') return `Portföyüm: bu bilgisayardaki ${Array.isArray(g.kayitlar) ? g.kayitlar.length : 0} kaydı sunucuya taşı`;
  if (y === '/api/portfoyum/islem') return `Portföyüm: işlem ekle (${kisa(g.islem, 12)} · ${kisa(g.tarih, 10)})`;
  if (y === '/api/portfoyum/hizli-ekle') {
    // 67.4: Varlık ekle sekmeleri (kaynak: yahoo | tefas | binance | altin | elle | nakit)
    const k = String(g.kaynak || 'yahoo');
    if (k === 'nakit') return `Portföyüm: nakit bakiyesi ekle (${kisa(g.para, 4)})`;
    if (k === 'altin') return 'Portföyüm: gram altın ekle';
    const ad = { tefas: 'fon', binance: 'kripto', elle: 'varlık' }[k] || 'hisse';
    return `Portföyüm: ${ad} ekle (${kisa((g.aday && (g.aday.sembol || g.aday.kod)) || g.kod || g.sembol, 16)})`;
  }
  if (y === '/api/portfoyum/alis') return `Portföyüm: alış (${kisa((g.aday && (g.aday.sembol || g.aday.kod)) || g.kod || g.varlik, 16)})`;
  if (y === '/api/portfoyum/alisa-cevir') return 'Portföyüm: ilk kurulum kaydını alışa çevir';
  if (y === '/api/portfoyum/izle') return `Portföyüm: izleme listesine ekle (${kisa((g.aday && (g.aday.sembol || g.aday.kod)) || g.kod || g.varlik || g.kaynak, 16)})`;
  if (y === '/api/portfoyum/izle/cikar') return 'Portföyüm: izleme listesinden çıkar';
  if (y === '/api/portfoyum/hesap') return `Portföyüm: hesap aç (${kisa(g.kurumAd ? g.kurumAd + ' · ' + g.ad : g.ad, 40)})`;
  if (y === '/api/portfoyum/hizli-duzenle') return 'Portföyüm: zaten olanlar kaydını düzenle';
  if (y === '/api/portfoyum/csv/ice-aktar') return 'Portföyüm: CSV içe aktar';
  if (/^\/api\/portfoyum\/kayit\//.test(y)) return `Portföyüm: kayıt iptali (${kisa(id, 20)})`;
  if (/^\/api\/portfoyum\/hesap\/[^/]+\/portfoy$/.test(y)) return `Portföyüm: hesabı portföye taşı (${kisa(g.yeniPortfoyAd || g.portfoy, 30)})`;
  if (/^\/api\/portfoyum\/hesap\/[^/]+\/kapsam$/.test(y)) return `Portföyüm: hesap toplama ${g.dahil === false || g.dahil === 'false' ? 'dahil değil' : 'dahil'}`;
  if (y === '/api/portfoyum/plan-kaydet') { const n = (Array.isArray(g.satislar) ? g.satislar.length : 0) + (Array.isArray(g.alislar) ? g.alislar.length : 0); return `Portföyüm: para ekle planını kaydet (${g.yatirma ? 'para yatırma + ' : ''}${n} alım/satım)`; }
  if (method === 'PUT' && /^\/api\/portfoyum\/portfoy\/[^/]+$/.test(y)) return `Portföyüm: portföy adını değiştir (${kisa(g.ad, 30)})`;
  if (y === '/api/portfoyum/portfoy') return `Portföyüm: portföy ekle (${kisa(g.ad, 30)})`;
  return `Portföyüm: ${method === 'PUT' ? 'düzenle' : 'ekle'} ${y.slice(15)}`;
}

/**
 * @param {object} o
 *   kok        proje kökü (data/ev-baglanti.json, data/ev-kuyruk.jsonl)
 *   etkin      yalnız araştırma modunda true
 *   fetchFn, simdi, uuid (test)
 *   yerelOnizle async (yol, govde) → JSON (İşlem defterim önizlemesi sunucu kapalıyken)
 *   sonuc      (kayit, durum, govde) → kuyruktaki kayıt gönderildi/hata oldu bildirimi (ör. Portföyüm taşıma bayrağı)
 */
function gelistirme({ kok, etkin, fetchFn = (...a) => fetch(...a), simdi = () => Date.now(), uuid = () => crypto.randomUUID(), yerelOnizle = null, sonuc = null, log = () => {} }) {
  const kuyrukDosya = yollar.programVeri(kok, 'ev-kuyruk.jsonl');
  const durum = { sonBasari: null, sonHata: null, sonHataZaman: null, sonDeneme: null };
  let bosaltiliyor = null;
  let zamanlayici = null;

  /** Okuma bağlantısı (adres + panel jetonu) var mı; yazma jetonu var mı. */
  function okumaAyari() { return etkin ? ayarOku(kok) : null; }
  function yazmaAyari() { const a = okumaAyari(); return a && a.yazmaJetonu ? a : null; }

  function kuyrukOku() {
    let m = '';
    // Yalnız "dosya yok" boş kuyruk demektir; Windows'ta anlık kilit (virüs tarayıcı, rename) kısa beklemeyle yeniden denenir —
    // okunamayan kuyruk ASLA boş sayılmaz (sayılsaydı sonraki yazım bekleyenleri silerdi).
    for (let i = 0; ; i++) {
      try { m = fs.readFileSync(kuyrukDosya, 'utf8'); break; } catch (e) {
        if (e && e.code === 'ENOENT') return [];
        if (i >= 5 || !['EBUSY', 'EPERM', 'EACCES'].includes(e && e.code)) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      }
    }
    const l = [];
    // F10d: bozuk satır sessizce atılmaz — yeniden yazımda aynen korunur, GET /api/ev-kuyruk'ta bildirilir
    const bozuk = [];
    for (const s of m.split('\n')) {
      if (!s.trim()) continue;
      let x = null;
      try { x = JSON.parse(s); } catch { x = null; }
      if (x && typeof x === 'object' && !Array.isArray(x) && x.id) l.push(x); else bozuk.push(s);
    }
    Object.defineProperty(l, 'bozuk', { value: bozuk, enumerable: false });
    return l;
  }
  function kuyrukYaz(l) {
    // Gönderilmiş kayıtlar yalnız son GONDERILEN_TAVAN kadar tutulur (gövdesiz; ekranda "gönderildi" geçmişi)
    const gonderilen = l.filter(x => x.durum === 'gonderildi');
    const at = new Set(gonderilen.slice(0, Math.max(0, gonderilen.length - GONDERILEN_TAVAN)).map(x => x.id));
    const kalan = l.filter(x => !at.has(x.id));
    // Diskteki bozuk satırlar (okunduğu andan bağımsız, şimdiki dosyadan) korunur
    const bozuk = kuyrukOku().bozuk || [];
    const satirlar = [...bozuk, ...kalan.map(x => JSON.stringify(x))];
    atomikYaz(kuyrukDosya, satirlar.join('\n') + (satirlar.length ? '\n' : ''));
  }
  const bekleyenler = () => kuyrukOku().filter(x => x.durum === 'bekliyor');

  function kuyrugaEkle(method, yol, govde, ek = {}) {
    if (/^\/api\/anahtarlar\//.test(GV.izinYolu(yol))) throw new Error('anahtar değişikliği kuyruğa alınmaz (sır)');   // 73.0 savunma
    const l = kuyrukOku();
    const sira = l.reduce((m, x) => Math.max(m, x.sira || 0), 0) + 1;
    const k = { id: ek.istekKimligi || uuid(), sira, zaman: new Date(simdi()).toISOString(), method, yol, govde: govde == null ? {} : govde,
      ozet: ozetMetni(method, yol, govde), etiket: ek.etiket || null, durum: 'bekliyor', deneme: 0, sonHata: ek.sonHata || null,
      // F7: gövde gönderilince silinir — hesap kimliği (OKX imleci için) ayrıca tutulur
      hesap: govde && typeof govde.hesap === 'string' ? govde.hesap.slice(0, 48) : null };
    l.push(k);
    kuyrukYaz(l);
    return k;
  }

  /**
   * Tek istek. Döndürür:
   *   { tur: 'tamam', durum, govde }       sunucu işledi (2xx)
   *   { tur: 'red', durum, govde }         sunucu doğrulama hatası (4xx JSON; 401/403 hariç) — tekrar denemek işe yaramaz
   *   { tur: 'ulasilamadi', hata }         ağ / zaman aşımı / 5xx / 401-403 (jeton, eski sürüm) / JSON olmayan yanıt
   */
  async function gonderBir(a, method, yol, govde, kimlik) {
    durum.sonDeneme = simdi();
    let r, metin, tur;
    try {
      const url = new URL(yol, a.adres + '/');
      if (url.origin !== new URL(a.adres).origin) throw new Error('adres dışı yol');
      const veri = JSON.stringify(govde == null ? {} : govde);
      r = await fetchFn(url.href, { method, headers: { 'content-type': 'application/json', accept: 'application/json',
        'x-panel-token': a.jeton, [GV.GELISTIRME_BASLIK]: a.yazmaJetonu, 'x-istek-kimligi': kimlik }, body: veri, signal: AbortSignal.timeout(YAZMA_ZAMAN_ASIMI_MS),
        redirect: 'error' });   // F3: yönlendirme izlenmez — jetonlar ve gövde başka kökene gitmez (3xx = ulaşılamadı)
      if (r.status >= 300 && r.status < 400) throw new Error(`sunucudaki panel yönlendirme döndü (${r.status}) — izlenmedi`);
      metin = await r.text();
      tur = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
    } catch (e) {
      const hata = e && e.name === 'TimeoutError' ? `sunucudaki panel ${YAZMA_ZAMAN_ASIMI_MS / 1000} sn içinde yanıt vermedi (kapalı ya da Tailscale bağlı değil)` : `sunucudaki panele ulaşılamadı (${String((e && e.message) || e).slice(0, 120)})`;
      return { tur: 'ulasilamadi', hata };
    }
    let j = null;
    if (/json/.test(tur)) { try { j = JSON.parse(metin); } catch { j = null; } }
    if (r.status >= 200 && r.status < 300 && j) return { tur: 'tamam', durum: r.status, govde: j };
    if (r.status === 401 || r.status === 403) {
      return { tur: 'ulasilamadi', hata: `sunucudaki panel reddetti (${r.status}): ${String((j && j.error) || metin || '').slice(0, 200)} — sunucudaki panel 64.8 ya da yenisi mi, yazma jetonu doğru mu?` };
    }
    if (r.status >= 400 && r.status < 500 && j) return { tur: 'red', durum: r.status, govde: j };
    return { tur: 'ulasilamadi', hata: `sunucudaki panel ${r.status} döndü${j && j.error ? `: ${String(j.error).slice(0, 160)}` : ''}` };
  }

  /** Kuyruğu sırayla boşaltır (tek seferde bir boşaltıcı). Döndürür { gonderilen, hata, kalan, durdu }. */
  function bosalt() {
    if (bosaltiliyor) return bosaltiliyor;
    bosaltiliyor = (async () => {
      await null;   // finally, bosaltiliyor atamasından SONRA çalışsın (boş kuyrukta eşzamanlı biten gövde kilidi açık bırakmasın)
      const ozet = { gonderilen: 0, hata: 0, kalan: 0, durdu: null };
      try {
        const a = yazmaAyari();
        if (!a) { ozet.kalan = bekleyenler().length; ozet.durdu = 'yazma bağlantısı kurulu değil'; return ozet; }
        for (;;) {
          const l = kuyrukOku();
          const k = l.find(x => x.durum === 'bekliyor');
          if (!k) break;
          const r = await gonderBir(a, k.method, k.yol, k.govde, k.id);
          const l2 = kuyrukOku();
          const x = l2.find(y => y.id === k.id);
          if (!x) continue;   // bu arada kuyruktan çıkarıldı
          x.deneme = (x.deneme || 0) + 1;
          if (r.tur === 'ulasilamadi') {
            x.sonHata = r.hata; x.sonDeneme = new Date(simdi()).toISOString();
            kuyrukYaz(l2);
            durum.sonHata = r.hata; durum.sonHataZaman = simdi();
            ozet.durdu = r.hata;
            break;
          }
          x.gonderimZamani = new Date(simdi()).toISOString();
          x.yanitDurum = r.durum;
          x.govde = null;   // gönderildi ya da sunucu reddetti: gövde (dosya içeriği vb.) burada tutulmaz
          if (r.tur === 'tamam') { x.durum = 'gonderildi'; x.sonHata = null; x.yanitOzet = yanitOzeti(r.govde); ozet.gonderilen++; durum.sonBasari = simdi(); }
          else { x.durum = 'hata'; x.sonHata = String((r.govde && r.govde.error) || `sunucudaki panel ${r.durum} döndü`).slice(0, 500); ozet.hata++; durum.sonBasari = simdi(); }
          kuyrukYaz(l2);
          if (sonuc) { try { sonuc(x, r.tur, r.govde); } catch { /* bildirim hatası boşaltmayı durdurmaz */ } }
          if (r.tur === 'red') log('WARN', `Sunucu kuyruğu: "${x.ozet}" sunucudaki panelce reddedildi: ${x.sonHata}`);
        }
        ozet.kalan = bekleyenler().length;
        if (ozet.gonderilen) log('INFO', `Sunucu kuyruğu: ${ozet.gonderilen} değişiklik sunucudaki panele gönderildi${ozet.kalan ? ` (${ozet.kalan} bekliyor)` : ''}.`);
        return ozet;
      } finally { bosaltiliyor = null; }
    })();
    return bosaltiliyor;
  }

  const yanitOzeti = (g) => {
    if (!g || typeof g !== 'object') return null;
    const o = {};
    for (const a of ['eklenen', 'cift', 'bastirilan', 'yukleme', 'hesap', 'iptal', 'geriAlinan']) if (g[a] != null && typeof g[a] !== 'object') o[a] = g[a];
    if (Array.isArray(g.eklenen)) o.eklenen = g.eklenen.length;
    return o;
  };

  /**
   * Programla yazma (OKX eşitleme sonucu, Portföyüm taşıma) ve middleware'in ortak yolu.
   * ops.kuyruk (varsayılan uç tanımı), ops.etiket. Döndürür:
   *   { tur: 'tamam'|'red', durum, govde }  ·  { tur: 'kuyrukta', kayit, bekleyen }  ·  { tur: 'ulasilamadi', hata } (kuyruğa girmeyen uç)
   *   { tur: 'kurulu-degil' }
   */
  /**
   * F4: kuyruğa uygun yazmalar TEK zincirde sırayla: A yoldayken B başlamaz (A sonra başarısız olup kuyruğa girerse B onun önüne
   * geçemez — B kuyruğu dolu görür ve arkasına girer). Önizleme gibi kuyruğa girmeyenler zincir dışında.
   */
  let zincir = Promise.resolve();
  function yaz(method, yol, govde, ops = {}) {
    const kuyrugaUygun = ops.kuyruk != null ? !!ops.kuyruk : ucTanimi(method, yol).kuyruk;
    if (!kuyrugaUygun) return yazIc(method, yol, govde, ops, false);
    const p = zincir.then(() => yazIc(method, yol, govde, ops, true));
    zincir = p.catch(() => {});
    return p;
  }
  /** F7: doğrudan giden yazmanın sonucu da bildirilir (ör. geri-al → OKX tam tarama işareti). */
  function dogrudanBildir(method, yol, govde, ops, r) {
    if (!sonuc || (r.tur !== 'tamam' && r.tur !== 'red')) return;
    try { sonuc({ yol, method, etiket: ops.etiket || null, hesap: govde && typeof govde.hesap === 'string' ? govde.hesap : null, dogrudan: true }, r.tur, r.govde); } catch { /* */ }
  }
  async function yazIc(method, yol, govde, ops, kuyrugaUygun) {
    const a = yazmaAyari();
    if (!a) return { tur: 'kurulu-degil' };
    if (kuyrugaUygun && bekleyenler().length) {
      const k = kuyrugaEkle(method, yol, govde, { etiket: ops.etiket });
      setImmediate(() => { bosalt().catch(() => {}); });
      return { tur: 'kuyrukta', kayit: k, bekleyen: bekleyenler().length };
    }
    const kimlik = uuid();
    const r = await gonderBir(a, method, yol, govde, kimlik);
    if (r.tur === 'ulasilamadi') {
      durum.sonHata = r.hata; durum.sonHataZaman = simdi();
      if (!kuyrugaUygun) return r;
      // Aynı kimlikle kuyruğa: istek sunucuya ulaştı ama yanıt kaybolduysa sunucu ikinci kez uygulamaz (istek defteri).
      const k = kuyrugaEkle(method, yol, govde, { istekKimligi: kimlik, etiket: ops.etiket, sonHata: r.hata });
      return { tur: 'kuyrukta', kayit: k, bekleyen: bekleyenler().length };
    }
    durum.sonBasari = simdi();
    dogrudanBildir(method, yol, govde, ops, r);
    return r;
  }

  /** Express ara katmanı (express.json'dan SONRA). İzinli yazma uçlarını iletir; yazma jetonu yoksa: sunucu okuma kuruluysa 403 + nasıl açılır. */
  async function middleware(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || !GV.gelistirmeIzinliMi(req.method, req.path)) return next();
    if (req.kademe && req.kademe !== 'yerel') return next();   // telefon kademesi zaten 403 aldı; bu katman yalnız masaüstü panel içindir
    if (/^\/api\/anahtarlar\//.test(GV.izinYolu(req.path))) return next();   // 73.0: anahtarlar kendi yolundan (kuyruk YOK — lib/anahtarlar.js)
    if (!okumaAyari()) return next();                          // sunucu bağlantısı yok (kılavuz üreticisi EV_OKUMA=0 dahil): eski yerel davranış
    const yol = GV.izinYolu(req.path);
    if (yol === '/api/ev-yazma/dene') return next();
    const tanim = ucTanimi(req.method, req.path);
    if (!yazmaAyari()) return tanim.jetonsuzYerel ? next() : res.status(403).json({ success: false, arastirma: true, evYazma: false, error: NASIL_ACILIR });
    const govde = req.body && typeof req.body === 'object' ? req.body : {};
    let r;
    try { r = await yaz(req.method, req.originalUrl.split('?')[0], govde); } catch (e) { return res.status(500).json({ success: false, error: `sunucuya iletilemedi: ${e.message}` }); }
    setImmediate(() => { bosalt().catch(() => {}); });
    if (r.tur === 'tamam' || r.tur === 'red') {
      const g = r.govde && typeof r.govde === 'object' && !Array.isArray(r.govde) ? { ...r.govde, evKaynak: { yazma: true, zaman: simdi() } } : r.govde;
      return res.status(r.durum).json(g);
    }
    if (r.tur === 'kuyrukta') {
      return res.status(202).json({ success: true, kuyrukta: true, sira: r.kayit.sira, kimlik: r.kayit.id, bekleyen: r.bekleyen, ozet: r.kayit.ozet,
        mesaj: `Sunucuya şu an ulaşılamıyor — değişiklik kuyruğa alındı (${r.bekleyen} bekliyor); sunucu açılınca sırayla kendiliğinden gönderilir.` });
    }
    // kuyruğa girmeyen uç + sunucu kapalı
    if (tanim.yerelOnizle && yerelOnizle) {
      try {
        const o = await yerelOnizle(req.path, govde);
        return res.json({ ...o, evKapali: true });
      } catch (e) { return res.status(e.kod || 400).json({ success: false, evKapali: true, error: e.message }); }
    }
    const ne = yol === '/api/tasarimci/sermaye' ? 'model sermayesi / kesirli hisse ayarı sunucudaki kâğıt hesabın ayarıdır, sunucu açıkken kaydedilir'
      : /^\/api\/bildirim\//.test(yol) ? 'bildirim ayarları sunucunun ayarıdır (bildirimleri sunucu gönderir), sunucu açıkken kaydedilir' : 'bu işlem (önizleme / fiyat yenileme) sunucu açıkken yapılır';
    return res.status(503).json({ success: false, evKapali: true, error: `Sunucuya ulaşılamıyor — ${ne}. ${r.hata || ''}`.trim() });
  }

  /** GET /api/ev-kuyruk — gövdesiz liste + durum (jeton yok). */
  function bilgi() {
    const l = kuyrukOku();
    const a = okumaAyari();
    const bas = l.find(x => x.durum === 'bekliyor');
    // F10c: kuyruğun başı sunucudaki panelce (401/403) reddediliyorsa — sürüm farkı ya da jeton sorunu; kendiliğinden düzelmez
    const ret = bas && /reddetti \((401|403)\)/.test(String(bas.sonHata || ''));
    return {
      etkin: !!etkin, kurulu: !!a, yazmaKurulu: !!(a && a.yazmaJetonu), adres: a ? a.adres : null,
      bozuk: (l.bozuk || []).length, bozukOrnek: (l.bozuk || []).slice(0, 3).map(s => s.slice(0, 120)),
      kafaReddi: ret ? { mesaj: KAFA_REDDI, ayrinti: String(bas.sonHata).slice(0, 300) } : null,
      bekleyen: l.filter(x => x.durum === 'bekliyor').length, hata: l.filter(x => x.durum === 'hata').length,
      ogeler: l.slice().reverse().slice(0, 100).map(x => ({ id: x.id, sira: x.sira, zaman: x.zaman, method: x.method, yol: x.yol, ozet: x.ozet, durum: x.durum, deneme: x.deneme || 0,
        sonHata: x.sonHata || null, gonderimZamani: x.gonderimZamani || null, yanitOzet: x.yanitOzet || null })),
      ...durum, gonderiliyor: !!bosaltiliyor, nasil: a && a.yazmaJetonu ? null : NASIL_ACILIR
    };
  }

  /** Yalnız `hata` durumundaki kayıt çıkarılır (bekleyen kayıt sırayı bozmasın diye çıkarılmaz). */
  function cikar(id) {
    const l = kuyrukOku();
    const x = l.find(y => y.id === id);
    if (!x) return { success: false, kod: 404, error: 'kuyrukta böyle bir kayıt yok' };
    if (x.durum !== 'hata') return { success: false, kod: 409, error: x.durum === 'bekliyor' ? 'bekleyen kayıt çıkarılmaz (sıra bozulur) — sunucu açılınca gönderilir' : 'bu kayıt zaten gönderildi' };
    kuyrukYaz(l.filter(y => y.id !== id));
    if (sonuc) { try { sonuc(x, 'cikar', null); } catch { /* */ } }
    return { success: true, cikarilan: id };
  }

  function baslat() {
    if (zamanlayici || !etkin) return;
    zamanlayici = setInterval(() => { if (yazmaAyari() && bekleyenler().length) bosalt().catch(() => {}); }, BOSALT_ARALIK_MS);
    if (zamanlayici.unref) zamanlayici.unref();
    setTimeout(() => { if (yazmaAyari() && bekleyenler().length) bosalt().catch(() => {}); }, 5000).unref();
  }
  function durdur() { if (zamanlayici) clearInterval(zamanlayici); zamanlayici = null; }

  return { middleware, yaz, bosalt, bilgi, cikar, baslat, durdur, kuyrukOku, okumaAyari, yazmaAyari: () => !!yazmaAyari(), _kuyrukDosya: kuyrukDosya };
}

const NASIL_ACILIR = 'Bu bilgisayardan kayıt girmek için yazma bağlantısı gerekir: sunucuda `npm run gelistirme-jeton` çalıştırın, çıkan jetonu burada `npm run sunucu-baglanti -- --yazma-jeton <jeton>` ile kaydedin. O zamana kadar kayıtlar sunucudaki panelden girilir (bu bilgisayar sunucudakini gösterir).';

const KAFA_REDDI = 'Sunucu bu bilgisayarın yazmasını kabul etmiyor (401/403) — bekleyenler kendiliğinden gitmez. Sunucudaki Pusula\'yı 64.8\'e (ya da yenisine) güncelleyin ya da jetonu yenileyin: sunucuda `npm run gelistirme-jeton -- --yeni`, burada `npm run sunucu-baglanti -- --yazma-jeton <jeton>`.';

module.exports = { istekDefteri, gelistirme, ucTanimi, ozetMetni, yanitKucult, NASIL_ACILIR, KAFA_REDDI, UUID_RE, DEFTER_TAVAN };
