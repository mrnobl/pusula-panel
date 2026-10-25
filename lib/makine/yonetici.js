'use strict';
/**
 * YÖNETİCİ MAKİNE (75.3, 3. faz parça 3b — PLAN-MAKINE-HESAP-BOT §4 f1; TASARIM-MAKINE-HESAP-BOT §4.3, §4.9)
 * ═══════════════════════════════════════════════════════════════════════════
 * Yönetici = Telegram komutlarını dinleyen (getUpdates yoklayan) TEK makine. Bildirim GÖNDERİMİ her makinede sürer; çakışma
 * yalnız getUpdates'te var (aynı bot jetonunu iki yer yoklarsa Telegram eskisini 409 ile keser).
 *
 * SEÇİM: Ayarlar › Makineler › "Yönetici yap" (yerel + PIN) → makineler.json `yonetici: { kimlik, surum, zaman, secen }`; surum
 * bilinen en büyükten bir fazla. Kayıt nabız özetinde (`yonetici`) eşlere yayılır; alan makine, kaydı yalnız DAHA YENİYSE alır
 * (surum, sonra zaman, sonra seçen kimliği — son yazan kazanır) ve yalnız kimliği kendisi ya da kendi eşi ise (bilinmeyen makine
 * yönetici yapılamaz; kaldırılan eş seçimi siler). Seçim yoksa VARSAYILAN: dinleyebilen sunucu makineler arasında sözlük
 * sırasında en küçük kimlik (her makine aynı sonucu bulur; panel "varsayılan" der).
 *
 * KARAR (`karar`, saf) — dakikada bir (`degerlendir`):
 *   · Eşlenmiş makine yok → DİNLE ('tek'): bugünkü davranış, hiçbir şey değişmez.
 *   · Bu makine dinleyemiyor (araştırma modu / geliştirme engeli) ya da rolü geliştirme → dinleme.
 *   · Bu makine (etkin) yönetici → DİNLE ('yonetici').
 *   · Değilse: yönetici ESIK_MS (30 dk) boyunca görülmediyse (son nabız; bu sürecin açılışından ve seçimden itibaren sayılır) VE yedek
 *     sırasında (dinleyebilen sunucular, kimlik sırası, yönetici hariç) benden önce görünen (30 dk içinde) bir makine yoksa →
 *     GEÇİCİ DEVRAL ('gecici') + Telegram'a haber. Yönetici devralmadan SONRA bir kez görülünce → BIRAK + "geri geldi" haberi.
 * BÖLÜNMÜŞ BEYİN (iki makine çalışıyor ama birbirini görmüyor — ör. Tailscale koptu, internet var): yedek 30 dk sonra devralır,
 *   ikisi aynı anda yoklar ve Telegram birini 409 ile keser. Kural: GEÇİCİ dinleyen makine devraldıktan sonra 409 görürse HEMEN
 *   bırakır (yönetici asla bırakmaz) ve CEKISME_MS (30 dk, her seferinde ikiye katlanır, en çok 4 sa) yeniden devralmaz; kullanıcıya
 *   bölüm başına TEK haber. Böylece KARARLI DURUMDA en fazla bir makine yoklar; çakışma yalnız devralma denemesinin ilk birkaç
 *   yoklama turuyla sınırlıdır (öz test: scripts/makine-yonetici-selftest.js).
 *   Bilinen sınır: kullanıcı makineler birbirini GÖRMEZKEN iki ayrı makinede iki ayrı yönetici seçerse ikisi de "yönetici"dir ve
 *   bağlantı gelene kadar çakışır (bağlantı gelince son seçim kazanır).
 * SESSİZ MAKİNE (kullanıcı kararı bekleyen öneri, 75.3'te uygulandı): eşlenmiş SUNUCU 30 dk (geliştirme bilgisayarı bildirim
 *   merkezindeki "Makine sessiz" eşiği, varsayılan 24 sa) nabız vermezse Telegram'a TEK uyarı, yeniden görülünce TEK bilgi. Uyarıyı
 *   yalnız o an Telegram'ı dinleyen makine yollar (iki makine aynı şeyi yazmasın); sessiz olan yöneticiyse devralma haberi uyarı
 *   yerine geçer. Tür: bildirim merkezi 'makine'.
 * Bu modül bot başlatmaz/durdurmaz, emir vermez, ayar/anahtar yazmaz; yalnız Telegram yoklayıcısını açar/kapatır.
 */
const protokol = require('./protokol');
const nabizLib = require('./nabiz');

const ESIK_MS = 30 * 60 * 1000;
const CEKISME_MS = 30 * 60 * 1000;
const CEKISME_TAVAN_MS = 4 * 3600 * 1000;
const SESSIZ_SUNUCU_MS = 30 * 60 * 1000;
const TIK_MS = 60 * 1000;

const zamanMs = (z) => { const t = typeof z === 'number' ? z : Date.parse(z || ''); return Number.isFinite(t) ? t : null; };

/** Saf: yönetici kaydı biçimce geçerli mi. */
function kayitGecerli(r) { return !!r && typeof r === 'object' && !Array.isArray(r) && protokol.denetle(protokol.YONETICI_SEMA, r).length === 0 && Number.isInteger(r.surum) && r.surum >= 1; }
/** Saf: a, b'den YENİ mi (> 0). Sıra: surum → zaman → seçen kimliği (sözlük). Her makine aynı sonucu bulur. */
function kayitKarsilastir(a, b) {
  if (a.surum !== b.surum) return a.surum - b.surum;
  const ta = zamanMs(a.zaman) || 0, tb = zamanMs(b.zaman) || 0;
  if (ta !== tb) return ta - tb;
  const sa = String(a.secen || ''), sb = String(b.secen || '');
  return sa === sb ? (a.kimlik === b.kimlik ? 0 : (a.kimlik > b.kimlik ? 1 : -1)) : (sa > sb ? 1 : -1);
}
/**
 * Saf: gelen kaydı mevcut kayıtla birleştirir. Yalnız geçerli ve BİLİNEN (ben ya da eş) kimlik alınır; mevcut kayıt bilinmeyen
 * makineyi gösteriyorsa yok sayılır. @returns {{ kayit, degisti }}
 */
function birlestir(mevcut, gelen, bilinen) {
  const m = kayitGecerli(mevcut) && bilinen.has(mevcut.kimlik) ? mevcut : null;
  if (!kayitGecerli(gelen) || !bilinen.has(gelen.kimlik)) return { kayit: m, degisti: false };
  const temiz = protokol.temizle(protokol.YONETICI_SEMA, gelen);
  if (!m || kayitKarsilastir(temiz, m) > 0) return { kayit: temiz, degisti: true };
  return { kayit: m, degisti: false };
}

/** Saf: dinleyebilen sunucu makinelerin kimlikleri (ben dahil), sözlük sırasında. */
function adaylar(ben, esler) {
  const l = [];
  if (ben && ben.rol === 'sunucu' && ben.uygun !== false) l.push(ben.kimlik);
  for (const e of esler || []) if (e.rol === 'sunucu' && e.uygun !== false) l.push(e.kimlik);
  return [...new Set(l)].sort();
}
/** Saf: etkin yönetici { kimlik | null, secildi } — seçilen aday değilse (geliştirme / dinleyemez / bilinmiyor) varsayılan. */
function etkinYonetici(ben, esler, kayit) {
  const a = adaylar(ben, esler);
  if (!a.length) return { kimlik: null, secildi: false };
  if (kayitGecerli(kayit) && a.includes(kayit.kimlik)) return { kimlik: kayit.kimlik, secildi: true };
  return { kimlik: a[0], secildi: false };
}
/** Saf: bir eşin sessizlik süresi (ms) — son görülme; hiç görülmediyse eklenme. Bu sürecin açılışı ve `ek` (seçim anı) alt sınırdır. */
function sessizlik(e, simdi, baslangic, ek = null) {
  const t = Math.max(e && Number.isFinite(e.sonGorulme) ? e.sonGorulme : 0, e && Number.isFinite(e.eklendi) ? e.eklendi : 0, Number.isFinite(baslangic) ? baslangic : 0, Number.isFinite(ek) ? ek : 0);
  return Math.max(0, simdi - t);
}

/**
 * Saf KARAR. @param g {
 *   ben: { kimlik, ad, rol, uygun }, esler: [{ kimlik, ad, rol, uygun, sonGorulme (ms|null), eklendi (ms|null) }],
 *   kayit: yönetici kaydı | null, devir: önceki geçici devralma durumu | null, baslangic: bu sürecin açılışı (ms), simdi (ms),
 *   son409: bu makinenin son 409 anı (ms|null) }
 * @returns {{ dinle, kip: 'tek'|'yonetici'|'gecici'|'bekle'|'cekisme'|'uygun-degil', sebep, yonetici: { kimlik, ad, secildi } | null,
 *   devir: yeni durum | null, olaylar: [{ tur: 'devraldi'|'geri'|'cekisme'|'birakti', … }] }}
 */
function karar(g) {
  const { ben, simdi } = g;
  const esler = g.esler || [];
  let d = g.devir && typeof g.devir === 'object' ? { ...g.devir } : {};
  const olaylar = [];
  const sonuc = (dinle, kip, sebep, y) => ({ dinle, kip, sebep, yonetici: y || null, devir: Object.keys(d).length ? d : null, olaylar });
  if (!esler.length) { d = {}; return sonuc(true, 'tek', 'eşlenmiş makine yok — tek makine (bugünkü davranış)'); }
  if (!ben || ben.rol !== 'sunucu' || ben.uygun === false) {
    d = {};
    return sonuc(false, 'uygun-degil', !ben || ben.rol !== 'sunucu' ? 'bu bilgisayar Telegram komutlarını dinlemez (geliştirme / araştırma kopyası)'
      : 'bu bilgisayarda Telegram kurulu değil (ya da geliştirme engeli var) — komutları dinlemez');
  }
  const Y = etkinYonetici(ben, esler, g.kayit);
  const yEs = esler.find(e => e.kimlik === Y.kimlik) || null;
  const yBilgi = { kimlik: Y.kimlik, ad: Y.kimlik === ben.kimlik ? ben.ad : (yEs ? yEs.ad : Y.kimlik), secildi: Y.secildi };
  if (Y.kimlik === ben.kimlik) { d = {}; return sonuc(true, 'yonetici', Y.secildi ? 'bu makine yönetici (seçildi)' : 'bu makine yönetici (varsayılan: seçim yapılmadı)', yBilgi); }
  if (!yEs) { d = {}; return sonuc(false, 'bekle', 'yönetici bulunamadı', yBilgi); }
  const ySon = Number.isFinite(yEs.sonGorulme) ? yEs.sonGorulme : null;
  // Yönetici yeniden görüldüyse çekişme bölümü kapanır (sayaç, bekleme, "bildirildi" sıfırlanır).
  if (d.cekismeAn && ySon && ySon > d.cekismeAn) { delete d.cekismeAn; delete d.cekismeBitis; delete d.cekismeSayi; delete d.cekismeBildirildi; }
  if (d.devralan) {
    if (d.yonetici !== Y.kimlik) {
      olaylar.push({ tur: 'birakti', neden: 'yönetici değişti', yonetici: yBilgi });
      d = { ...d, devralan: false, bas: null, yonetici: null };
    } else if (ySon && ySon > d.bas) {
      olaylar.push({ tur: 'geri', yonetici: yBilgi, sureMs: simdi - d.bas, bildir: !d.cekismeBildirildi });
      d = {};
      return sonuc(false, 'bekle', `yönetici ${yBilgi.ad} geri geldi — komutları o dinliyor`, yBilgi);
    } else if (Number.isFinite(g.son409) && g.son409 >= d.bas) {
      const n = (Number(d.cekismeSayi) || 0) + 1;
      olaylar.push({ tur: 'cekisme', yonetici: yBilgi, bildir: !d.cekismeBildirildi });
      d = { cekismeAn: simdi, cekismeSayi: n, cekismeBitis: simdi + Math.min(CEKISME_MS * 2 ** (n - 1), CEKISME_TAVAN_MS), cekismeBildirildi: true };
      return sonuc(false, 'cekisme', `Telegram'ı başka bir makine dinliyor (409) — geçici dinleme bırakıldı`, yBilgi);
    } else {
      return sonuc(true, 'gecici', `yönetici ${yBilgi.ad} ulaşılamıyor — komutları geçici olarak bu makine dinliyor`, yBilgi);
    }
  }
  const secimAn = Y.secildi && g.kayit ? zamanMs(g.kayit.zaman) : null;
  const ySessiz = sessizlik(yEs, simdi, g.baslangic, secimAn);
  if (ySessiz < ESIK_MS) return sonuc(false, 'bekle', `yönetici makine ${yBilgi.ad} dinliyor`, yBilgi);
  if (d.cekismeBitis && simdi < d.cekismeBitis) return sonuc(false, 'cekisme', `yönetici ${yBilgi.ad} görünmüyor ama Telegram'ı başka bir makine dinliyor (409) — ${Math.ceil((d.cekismeBitis - simdi) / 60000)} dk sonra yeniden denenir`, yBilgi);
  for (const k of adaylar(ben, esler).filter(x => x !== Y.kimlik)) {
    if (k === ben.kimlik) break;
    const e = esler.find(x => x.kimlik === k);
    if (sessizlik(e, simdi, g.baslangic) < ESIK_MS) return sonuc(false, 'bekle', `yönetici ${yBilgi.ad} ulaşılamıyor — sırada ${e.ad} devralır`, yBilgi);
  }
  olaylar.push({ tur: 'devraldi', yonetici: yBilgi, sessizMs: ySessiz, sonGorulme: ySon, bildir: !d.cekismeBildirildi });
  d = { ...d, devralan: true, bas: simdi, yonetici: Y.kimlik };
  return sonuc(true, 'gecici', `yönetici ${yBilgi.ad} ulaşılamıyor — komutları geçici olarak bu makine dinliyor`, yBilgi);
}

/**
 * Saf: sessiz eş uyarıları. @param g { esler, uyarilar: { kimlik: { zaman } }, simdi, baslangic, dinliyor (bu makine Telegram'ı
 * dinliyor mu), kapsanan: Set (devralma haberinin zaten söylediği eşler), esikGelistirmeMs }
 * @returns [{ tur: 'sessiz'|'gorundu', es, sureMs, gonder (bool) }]
 */
function sessizDegerlendir(g) {
  const l = [];
  for (const e of g.esler || []) {
    const u = g.uyarilar && g.uyarilar[e.kimlik];
    const esik = e.rol === 'sunucu' ? SESSIZ_SUNUCU_MS : (Number.isFinite(g.esikGelistirmeMs) ? g.esikGelistirmeMs : 24 * 3600e3);
    if (u && u.zaman) {
      if (Number.isFinite(e.sonGorulme) && e.sonGorulme > zamanMs(u.zaman)) l.push({ tur: 'gorundu', es: e, sureMs: e.sonGorulme - (zamanMs(u.son) || zamanMs(u.zaman)), gonder: !!u.gonderildi });
      continue;
    }
    const s = sessizlik(e, g.simdi, g.baslangic);
    if (s < esik) continue;
    if (g.kapsanan && g.kapsanan.has(e.kimlik)) { l.push({ tur: 'sessiz', es: e, sureMs: s, gonder: false, kapsandi: true }); continue; }
    if (!g.dinliyor) continue;   // uyarıyı yalnız Telegram'ı dinleyen makine yollar
    l.push({ tur: 'sessiz', es: e, sureMs: s, gonder: true });
  }
  return l;
}

const sureMetni = (ms) => { const dk = Math.max(1, Math.round(ms / 60000)); return dk < 120 ? `${dk} dk` : dk < 48 * 60 ? `${Math.round(dk / 60)} saat` : `${Math.round(dk / 1440)} gün`; };
const saatMetni = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'hiç');

/**
 * Durumlu yönetici. @param o {
 *   eslesme, nabiz (lib/makine), ben: () → { kimlik, ad }, rol: () → 'sunucu'|'gelistirme', uygun: () → bool (Telegram dinleyebilir mi),
 *   yoklayiciYonet: bool (false → yoklayıcıya hiç dokunulmaz: araştırma modu / geliştirme engeli), yoklayici: () → TelegramYoklayici | null,
 *   bildir: (parcalar, degiskenler) → Promise (Telegram, tür 'makine'), esikGelistirmeMs: () → ms, simdi: () → ms, baslangic: ms, log }
 */
function olustur(o) {
  const simdi = o.simdi || Date.now;
  const log = o.log || (() => {});
  const bildir = o.bildir || (() => Promise.resolve(null));
  const baslangic = Number.isFinite(o.baslangic) ? o.baslangic : simdi();
  let son = null;           // son karar (telegramEngeli okur)
  let oncekiEsVar = false;  // eş vardı da kaldırıldıysa yoklayıcı bir kez eski hâline getirilir

  function gorunum() {
    const l = o.eslesme.liste();
    const d = o.nabiz.oku();
    const b = o.ben();
    const ben = { kimlik: b.kimlik, ad: b.ad, rol: o.rol(), uygun: !!o.uygun() };
    const esler = l.makineler.map(m => {
      const x = d.esler[m.kimlik] || {};
      const oz = nabizLib.enYeniOzet(x) || {};
      return { kimlik: m.kimlik, ad: oz.ad || m.ad, rol: oz.rol || m.rol, uygun: !(oz.telegram && oz.telegram.uygun === false),
        sonGorulme: nabizLib.sonGorulme(x), eklendi: zamanMs(m.eklendi), ozet: oz, uyari: x.uyari || null };
    });
    return { l, d, ben, esler };
  }

  /** Eşlerin özetindeki yönetici kayıtlarını kendi kaydıyla birleştirir (değiştiyse yazar). */
  function kayitBirlestir(g) {
    const bilinen = new Set([g.ben.kimlik, ...g.esler.map(e => e.kimlik)]);
    let kayit = g.l.yonetici;
    let degisti = false;
    const temel = birlestir(kayit, kayit, bilinen);   // bilinmeyeni at
    if (kayit && !temel.kayit) { kayit = null; degisti = true; }
    for (const e of g.esler) {
      const r = birlestir(kayit, e.ozet && e.ozet.yonetici, bilinen);
      if (r.degisti) { kayit = r.kayit; degisti = true; }
    }
    if (degisti) { o.eslesme.yoneticiYaz(kayit); log('INFO', `🧭 Yönetici makine seçimi eşten alındı: ${kayit ? kayit.kimlik : 'seçim yok (varsayılan)'}`); }
    return kayit;
  }

  function son409() {
    try {
      const y = o.yoklayici && o.yoklayici();
      const h = y && y.durum ? y.durum().sonHata : null;
      return h && /\b409\b/.test(String(h.metin || '')) && Number.isFinite(h.zaman) ? h.zaman : null;
    } catch { return null; }
  }

  function yoklayiciUygula(k, esVar) {
    if (!o.yoklayiciYonet) return;
    if (!esVar && !oncekiEsVar) return;   // hiç eş olmadı: yoklayıcıya DOKUNULMAZ (bugünkü davranış)
    let y = null;
    try { y = o.yoklayici && o.yoklayici(); } catch { y = null; }
    if (!y || typeof y.durum !== 'function') return;
    const calisiyor = !!y.durum().calisiyor;
    if (k.dinle && !calisiyor) { if (y.baslat()) log('INFO', `🧭 Telegram komut yoklaması başlatıldı (${k.kip === 'gecici' ? 'geçici devralma' : k.kip === 'yonetici' ? 'yönetici makine' : 'tek makine'}).`); }
    else if (!k.dinle && calisiyor) { y.durdur(); log('INFO', `🧭 Telegram komut yoklaması bırakıldı: ${k.sebep}.`); }
  }

  function mesaj(parcalar, degiskenler) { try { Promise.resolve(bildir(parcalar, degiskenler)).catch(() => null); } catch { /* bildirim yok */ } }

  function olaylariIsle(k, g) {
    const benAd = g.ben.ad;
    for (const ol of k.olaylar) {
      const Y = ol.yonetici || {};
      if (ol.tur === 'devraldi') {
        log('WARN', `🧭 Yönetici ${Y.ad} ${sureMetni(ol.sessizMs)} ulaşılamıyor — Telegram komutlarını geçici olarak bu makine (${benAd}) dinliyor.`);
        if (ol.bildir) mesaj({ simge: '🧭', baslik: 'Yönetici makine ulaşılamıyor — komutları geçici olarak bu makine dinliyor',
          govde: [`Yönetici ${Y.ad} ${sureMetni(ol.sessizMs)} ulaşılamıyor (son görülme: ${saatMetni(ol.sonGorulme)}).`, `Telegram komutlarını geçici olarak ${benAd} dinliyor; ${Y.ad} geri gelince kendiliğinden bırakır.`],
          ne: `${Y.ad} bilgisayarının açık olduğuna ve Tailscale bağlantısına bakın.` }, { makine: Y.ad, sure: sureMetni(ol.sessizMs), son_gorulme: saatMetni(ol.sonGorulme) });
      } else if (ol.tur === 'geri') {
        log('INFO', `🧭 Yönetici ${Y.ad} geri geldi — geçici dinleme bırakıldı (${sureMetni(ol.sureMs)} sürdü).`);
        if (ol.bildir) mesaj({ simge: '🧭', baslik: `${Y.ad} geri geldi — Telegram komutlarını yine o dinliyor`, govde: [`${benAd} geçici dinlemeyi bıraktı (${sureMetni(ol.sureMs)} sürdü).`], ne: '' },
          { makine: Y.ad, sure: sureMetni(ol.sureMs), son_gorulme: saatMetni(simdi()) });
      } else if (ol.tur === 'cekisme') {
        log('WARN', `🧭 Geçici dinleme bırakıldı: ${Y.ad} bu makineden görünmüyor ama Telegram'ı başka bir makine yokluyor (409).`);
        if (ol.bildir) mesaj({ simge: '⚠️', baslik: 'Telegram\'ı başka bir makine dinliyor — geçici devralma bırakıldı',
          govde: [`${Y.ad} bu makineden (${benAd}) görünmüyor ama Telegram aynı botu başka bir yerden yokluyor (409).`, `${benAd} dinlemeyi bıraktı; iki makine çalışıyor ama birbirini görmüyor olabilir.`],
          ne: 'İki bilgisayarda Tailscale bağlantısına bakın (Ayarlar › Makineler › Şimdi yokla).' }, { makine: Y.ad, sure: '', son_gorulme: '' });
      } else if (ol.tur === 'birakti') {
        log('INFO', `🧭 Geçici dinleme bırakıldı: ${ol.neden}.`);
      }
    }
  }

  function sessizIsle(k, g) {
    const kapsanan = new Set(k.olaylar.filter(x => x.tur === 'devraldi').map(x => x.yonetici.kimlik));
    const uyarilar = {};
    for (const e of g.esler) if (e.uyari) uyarilar[e.kimlik] = e.uyari;
    let esikG = 24 * 3600e3;
    try { const v = o.esikGelistirmeMs && o.esikGelistirmeMs(); if (Number.isFinite(v) && v > 0) esikG = v; } catch { /* varsayılan */ }
    for (const s of sessizDegerlendir({ esler: g.esler, uyarilar, simdi: simdi(), baslangic, dinliyor: k.dinle && k.kip !== 'tek', kapsanan, esikGelistirmeMs: esikG })) {
      const e = s.es;
      if (s.tur === 'sessiz') {
        o.nabiz.uyariYaz(e.kimlik, { zaman: new Date(simdi()).toISOString(), son: Number.isFinite(e.sonGorulme) ? new Date(e.sonGorulme).toISOString() : null, gonderildi: s.gonder });
        log('WARN', `📡 Makine sessiz: ${e.ad} (${sureMetni(s.sureMs)}).`);
        if (s.gonder) mesaj({ simge: '📡', baslik: `Makine sessiz: ${e.ad}`, govde: [`${e.ad} ${sureMetni(s.sureMs)} nabız vermedi (son görülme: ${saatMetni(e.sonGorulme)}).`],
          ne: 'Bilgisayar kapalıysa bir şey yapmanız gerekmiyor; açıksa Tailscale bağlantısına ve Pusula\'nın çalıştığına bakın.' }, { makine: e.ad, sure: sureMetni(s.sureMs), son_gorulme: saatMetni(e.sonGorulme) });
      } else {
        o.nabiz.uyariYaz(e.kimlik, null);
        log('INFO', `📡 Makine yeniden görüldü: ${e.ad}.`);
        if (s.gonder) mesaj({ simge: '📡', baslik: `Makine yeniden görüldü: ${e.ad}`, govde: [`${e.ad} ${sureMetni(s.sureMs)} sessizlikten sonra yeniden nabız verdi.`], ne: '' },
          { makine: e.ad, sure: sureMetni(s.sureMs), son_gorulme: saatMetni(e.sonGorulme) });
      }
    }
  }

  /** Dakikada bir (ve nabızdan sonra): kaydı birleştir, karar ver, durumu yaz, yoklayıcıyı uygula, haberleri yolla. */
  function degerlendir({ yoklayiciya = true } = {}) {
    const g = gorunum();
    const esVar = g.esler.length > 0;
    const kayit = esVar ? kayitBirlestir(g) : g.l.yonetici;
    const k = karar({ ben: g.ben, esler: g.esler, kayit, devir: g.d.yonetici, baslangic, simdi: simdi(), son409: son409() });
    if (JSON.stringify(k.devir || null) !== JSON.stringify(g.d.yonetici || null)) o.nabiz.yoneticiYaz(k.devir);
    son = { ...k, zaman: simdi() };
    if (yoklayiciya) yoklayiciUygula(k, esVar);
    if (esVar) { olaylariIsle(k, g); sessizIsle(k, g); }
    oncekiEsVar = esVar;
    return son;
  }

  /** TelegramYoklayici `engel` kancası: null = dinle; metin = dinleme (neden). Eş yokken her zaman null (bugünkü davranış). */
  function telegramEngeli() {
    const k = son || degerlendir({ yoklayiciya: false });
    return k.dinle ? null : `yönetici makine kuralı: ${k.sebep} (Ayarlar › Makineler)`;
  }

  /** Kullanıcı seçimi (yerel + PIN): yeni kayıt surum = bilinen en büyük + 1. @returns {{ ok, kayit?, neden? }} */
  function sec(kimlik) {
    const g = gorunum();
    if (!protokol.KIMLIK_RE.test(String(kimlik || ''))) return { ok: false, neden: 'makine kimliği geçersiz' };
    const aday = adaylar(g.ben, g.esler);
    if (kimlik !== g.ben.kimlik && !g.esler.some(e => e.kimlik === kimlik)) return { ok: false, neden: 'Bu kimlikte eşlenmiş makine yok.' };
    if (!aday.includes(kimlik)) return { ok: false, neden: 'Yönetici yalnız Telegram\'ı dinleyebilen bir SUNUCU makinesi olabilir (geliştirme / araştırma kopyası olamaz).' };
    const surumlar = [g.l.yonetici, ...g.esler.map(e => e.ozet && e.ozet.yonetici)].filter(kayitGecerli).map(r => r.surum);
    const kayit = { kimlik, surum: (surumlar.length ? Math.max(...surumlar) : 0) + 1, zaman: new Date(simdi()).toISOString(), secen: g.ben.kimlik };
    o.eslesme.yoneticiYaz(kayit);
    // Devralma durumu yeni seçimle yeniden değerlendirilir.
    degerlendir();
    return { ok: true, kayit };
  }

  /** Pano / özet için: bu makinenin Telegram durumu + etkin yönetici. */
  function durum() {
    const k = son || degerlendir({ yoklayiciya: false });
    const g = gorunum();
    let calisiyor = null;
    try { const y = o.yoklayici && o.yoklayici(); calisiyor = y && y.durum ? !!y.durum().calisiyor : null; } catch { calisiyor = null; }
    return { dinle: k.dinle, kip: k.kip, sebep: k.sebep, yonetici: k.yonetici, kayit: g.l.yonetici || null, devir: k.devir, yoklamaCalisiyor: calisiyor, uygun: g.ben.uygun, zaman: k.zaman };
  }
  /** Nabız özeti için (eşlere yayılan alanlar). */
  function ozetAlanlari() {
    const k = son || { dinle: true, kip: 'tek' };
    return { yonetici: kayitGecerli(o.eslesme.liste().yonetici) ? o.eslesme.liste().yonetici : null, telegram: { dinliyor: !!k.dinle && !!o.uygun(), uygun: !!o.uygun(), kip: k.kip || null } };
  }

  let zamanlayici = null;
  function baslat(ms = TIK_MS) {
    if (zamanlayici) return;
    zamanlayici = setInterval(() => { try { degerlendir(); } catch (e) { log('WARN', `🧭 Yönetici kararı verilemedi: ${e.message}`); } }, ms);
    if (zamanlayici.unref) zamanlayici.unref();
  }
  function durdur() { if (zamanlayici) clearInterval(zamanlayici); zamanlayici = null; }

  return { degerlendir, telegramEngeli, sec, durum, ozetAlanlari, baslat, durdur, baslangic };
}

module.exports = { olustur, karar, sessizDegerlendir, birlestir, kayitKarsilastir, kayitGecerli, adaylar, etkinYonetici, sessizlik,
  ESIK_MS, CEKISME_MS, CEKISME_TAVAN_MS, SESSIZ_SUNUCU_MS, TIK_MS };
