/**
 * BİLDİRİM ÜRETİCİLERİ (73.5 D8, kullanıcı kararı 2026-10-24) — beş yeni bildirim türünü SUNUCUDA üretir.
 * ═══════════════════════════════════════════════════════════════════════════
 * Karar / emir YOK; botların canlı koduna (lib/live, lib/risk, engine, exchange) dokunmaz. Her üretici mesajını türüyle birlikte
 * bildirim merkezinin kapısına verir (`gonder(tur, parcalar, degiskenler)` → lib/telegram.js sendMessageDetailed(metin, { tur, … })):
 * aç/kapat, şablon, kanal, sessiz saat merkezde. Araştırma kopyasında ÇALIŞMAZ (server.js kurmaz — Telegram yalnız sunucudan).
 * Ücretli kaynak yok, yeni paket yok, yalnız düşük hızlı herkese açık uçlar.
 *
 *   fiyat   Sert fiyat hareketi — 5 dk'da bir Binance spot 5 dk mumları (herkese açık /api/v3/klines, sembol başına 1 istek).
 *           Son fiyat, pencere içindeki en düşük/en yüksek kapanışa göre ±eşik → bildirim. Aynı sembol + yön `tekrarSaat`te bir.
 *   makine  Makine sessiz — sunucu 5 dk'da bir kendi nabzını yazar; açılışta son nabız `sunucuEsikDk`'dan eskiyse "sunucu X süre
 *           sessizdi". Araştırma kopyaları 10 dk'da bir GET /api/makine/nabiz (x-pusula-makine) ile görünür; `esikSaat` görünmeyen
 *           makine için bir kez, yeniden görülünce bir kez. (Sunucunun kendisi kapalıyken uyarı healthchecks'in işidir — mevcut.)
 *           Faz 3 çok makine: `makineler` haritası makine adına göre; aynı düzen yeni sunucu makinelerine genişler.
 *   golge   Gölge testler haftalık özeti — pazartesi 09:00 (İstanbul) sonrası haftada bir, lib/golgeOzet.js satırlarından (73.6: getiri, son 7 g,
 *           kıyas, işlem/olay, bant). Başlıkta ve her satırda "🧪 GÖLGE TESTİ — gerçek para değil, emir yok". HÜKÜM / YORUM YAZMAZ.
 *   anahtar Anahtar sınaması — günde bir 06:15 (İstanbul) sonrası, lib/anahtarlar.js otoSina (SALT OKUMA). Başarısız ya da para çekme
 *           izni açık anahtar varsa bildirim.
 *   bilanco Bilanço ÖZETİ (73.6, kullanıcı kararı 2026-10-24) — evren: elde olanlar (Lydia kâğıt hesap + Portföyüm TL hisseler) + BIST 100
 *           vekili (BIST temel çalışmasının evren kuralı; ayar: yalnız elde / elde + BIST 100 [varsayılan] / tüm BIST). TOPLAMA: 08:00–23:00
 *           arası 90 dk'da bir KAP bildirim sorgusu (son 2 gün, "Finansal Rapor"); yeni bildirim kuyruğa (görülen bir daha işlenmez), ayrıntı
 *           sayfası (XBRL) tur başına en çok 15, istekler arası ≥ 20 sn; HTTP hatası / 429 → 6 saat geri çekilme. GÖNDERİM: günde en çok
 *           2 mesaj, ayarlı saatlerde (varsayılan 13:00, 20:30); bilanço yoksa mesaj yok. Mesaj: elde olanlar HER ZAMAN (📌 + hangi botta),
 *           sonra en dikkat çekenler (çeyrek ana ortaklık net kârının geçen yılın aynı çeyreğine göre en büyük artış / düşüş, zarardan kâra,
 *           kârdan zarara; satış değişimi varsa), "N şirket daha", TMS 29 notu. Yorum ve alım-satım önerisi YOK.
 * Durum: data/bildirim-uretici.json (son gönderimler, görülen KAP bildirimleri, makine nabızları).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BM = require('./bildirimMetinleri');

const DK = 60e3, SAAT = 60 * DK, GUN = 24 * SAAT;
const KAP = 'https://www.kap.org.tr/tr/api';
const KAP_SAYFA = 'https://www.kap.org.tr/tr/Bildirim/';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' };

// ── saf yardımcılar ──────────────────────────────────────────────────────────
/** İstanbul saatine göre { gun: 'YYYY-MM-DD', dk: günün dakikası, haftaGunu: 1=Pzt … 7=Paz }. */
function istanbul(simdi = Date.now()) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date(simdi));
  const g = (t) => (p.find(x => x.type === t) || {}).value;
  const hg = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[g('weekday')] || 1;
  return { gun: `${g('year')}-${g('month')}-${g('day')}`, dk: Number(g('hour')) * 60 + Number(g('minute')), haftaGunu: hg };
}
/** ISO hafta etiketi "2026-H43" (İstanbul günü). */
function haftaEtiketi(simdi = Date.now()) {
  const { gun } = istanbul(simdi);
  const d = new Date(gun + 'T00:00:00Z');
  const hg = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - hg + 3);
  const yil = d.getUTCFullYear();
  const ilk = new Date(Date.UTC(yil, 0, 4));
  const no = 1 + Math.round(((d - ilk) / GUN - 3 + ((ilk.getUTCDay() + 6) % 7)) / 7);
  return `${yil}-H${String(no).padStart(2, '0')}`;
}
const trSayi = (x, b = 0) => Number(x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b });
const yuzdeMetin = (x, b = 1) => `${x < 0 ? '−' : '+'}%${trSayi(Math.abs(x) * 100, b)}`;
/** Süre → "26 saat" / "45 dk" / "3 gün". */
function sureMetin(ms) {
  if (ms < SAAT) return `${Math.max(1, Math.round(ms / DK))} dk`;
  if (ms < 3 * GUN) return `${Math.round(ms / SAAT)} saat`;
  return `${Math.round(ms / GUN)} gün`;
}
const kisaZaman = (ms) => BM.kisaZaman(new Date(ms));

/**
 * Saf: Binance kline dizisi ([açılışZamanı, açılış, yüksek, düşük, kapanış, …]) → pencere içi değişim.
 * Son fiyat = son mumun kapanışı; dayanak = önceki mumların kapanışları (en düşük → yükseliş, en yüksek → düşüş).
 * @returns {{ fiyat, yukari: { degisim, dayanak }, asagi: { degisim, dayanak } } | null}
 */
function fiyatDegisimi(mumlar) {
  if (!Array.isArray(mumlar) || mumlar.length < 2) return null;
  const k = mumlar.map(m => Number(m[4])).filter(Number.isFinite);
  if (k.length < 2) return null;
  const fiyat = k[k.length - 1];
  const once = k.slice(0, -1);
  const enDusuk = Math.min(...once), enYuksek = Math.max(...once);
  return { fiyat, yukari: { degisim: fiyat / enDusuk - 1, dayanak: enDusuk }, asagi: { degisim: fiyat / enYuksek - 1, dayanak: enYuksek } };
}

/** Saf: fiyat değişimi + ayar + son gönderimler → gönderilecek olaylar. */
function fiyatOlaylari(sembol, d, ayar, son = {}, simdi = Date.now()) {
  if (!d) return [];
  const esik = ayar.esikYuzde / 100;
  const out = [];
  for (const yon of ['yukari', 'asagi']) {
    const x = d[yon];
    if (!(Math.abs(x.degisim) >= esik) || (yon === 'yukari' ? x.degisim <= 0 : x.degisim >= 0)) continue;
    const anahtar = `${sembol}:${yon}`;
    if (son[anahtar] && simdi - son[anahtar] < ayar.tekrarSaat * SAAT) continue;
    out.push({ anahtar, sembol, yon, degisim: x.degisim, dayanak: x.dayanak, fiyat: d.fiyat });
  }
  // Aynı anda iki yön (çok oynak pencere): büyük olan
  if (out.length > 1) out.sort((a, b) => Math.abs(b.degisim) - Math.abs(a.degisim)).splice(1);
  return out;
}

const fiyatBicim = (x) => (x >= 1000 ? trSayi(x, 0) : x >= 1 ? trSayi(x, 2) : trSayi(x, 6));
function fiyatParcalari(o, ayar) {
  const dk = ayar.pencereDk;
  return {
    parcalar: { simge: o.yon === 'yukari' ? '📈' : '📉', baslik: `${o.sembol} ${dk} dakikada ${yuzdeMetin(o.degisim)}`,
      govde: [`Son fiyat ${fiyatBicim(o.fiyat)} (${dk} dk içindeki en ${o.yon === 'yukari' ? 'düşük' : 'yüksek'} ${fiyatBicim(o.dayanak)}).`, 'Botlar kendi kurallarıyla çalışmaya devam ediyor; bu yalnız bilgi.'], ne: '' },
    degiskenler: { sembol: o.sembol, degisim: yuzdeMetin(o.degisim), fiyat: fiyatBicim(o.fiyat), pencere: `${dk} dk` },
  };
}

/** Saf: makine kayıtları → { uyar: [...], geri: [...] } (yalnız durum değişimleri). */
function makineDegerlendir(makineler, esikSaat, simdi = Date.now()) {
  const uyar = [], geri = [];
  for (const [ad, m] of Object.entries(makineler || {})) {
    if (!m || !m.son) continue;
    const sessiz = simdi - m.son > esikSaat * SAAT;
    if (sessiz && !m.uyarildi) uyar.push(ad);
  }
  return { uyar, geri };
}

/** Saf: ad temizliği (makine adı başlıktan). */
const makineAdi = (s) => String(s || '').trim().replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40);

// ── KAP ayrıştırma (saf) ─────────────────────────────────────────────────────
/** KAP sayfası Next.js akışında kaçışlı HTML taşır: < → < … */
function kapCoz(ham) {
  return String(ham || '').replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&').replace(/\\"/g, '"');
}
/** Saf: "1.000.000 TL" → 1e6, "1.000 TL" → 1e3, "TL" → 1. */
function birimCarpani(t) {
  const m = /Sunum Para Birimi[\s\S]{0,200}?<td[^>]*>\s*([^<]{1,40})<\/td>/.exec(t);
  const s = m ? m[1].trim() : '';
  const n = /^([\d.]+)\s/.exec(s);
  return { birim: s || null, carpan: n ? Number(n[1].replace(/\./g, '')) || 1 : 1, para: /USD|ABD/i.test(s) ? 'USD' : /EUR/i.test(s) ? 'EUR' : 'TL' };
}
/**
 * Saf: KAP finansal rapor sayfası + XBRL kavram sırası → { cari, onceki, cari3, onceki3, birim, carpan, para, kavram } (değerler TL·çarpan
 * uygulanmış) ya da null. Sütunlar tablonun başlık satırından eşlenir (Dipnot · Cari Dönem · Önceki Dönem · Cari Dönem 3 Aylık · Önceki Dönem 3 Aylık).
 */
function kapKalem(ham, kavramlar) {
  const t = kapCoz(ham);
  const b = birimCarpani(t);
  for (const kavram of kavramlar) {
    const re = new RegExp(`>${kavram}(\\||<)`, 'g');
    let m;
    while ((m = re.exec(t))) {
      const i = m.index;
      const rest = t.slice(i + 1, i + 1 + 40000);
      const j = rest.slice(5).search(/>(ifrs-full|kap-fr)_/);
      const satir = j >= 0 ? rest.slice(0, j + 5) : rest;
      const e = satir.indexOf('</table></td>');
      if (e < 0) continue;
      const hucre = satir.slice(e + 13).split('<td').slice(1).map(s => { const x = /title="(-?[\d.]+)"/.exec(s); return x ? Number(x[1]) : null; });
      // başlık satırı: bu satırdan önceki son "Cari Dönem<br/>" içeren <tr>
      const h = t.lastIndexOf('Cari Dönem<br/>', i);
      if (h < 0) continue;
      const trS = t.lastIndexOf('<tr', h), trE = t.indexOf('</tr>', h);
      const basliklar = t.slice(trS, trE).split('<td').slice(1)
        .map(s => s.replace(/<div[^>]*content-en[^>]*>[\s\S]*?<\/div>/g, '').replace(/<[^>]+>/g, ' ').replace(/^[^>]*>/, '').replace(/\s+/g, ' ').trim());
      const etiket = basliklar.slice(1);   // ilk hücre: kalem adı sütunu
      const bul = (re2) => { const k = etiket.findIndex(x => re2.test(x)); return k >= 0 && k < hucre.length ? hucre[k] : null; };
      const cari = bul(/^Cari Dönem(?! 3 Aylık)/), onceki = bul(/^Önceki Dönem(?! 3 Aylık)/);
      const cari3 = bul(/^Cari Dönem 3 Aylık/), onceki3 = bul(/^Önceki Dönem 3 Aylık/);
      if (cari == null && cari3 == null) continue;
      const c = (x) => (x == null ? null : x * b.carpan);
      return { cari: c(cari), onceki: c(onceki), cari3: c(cari3), onceki3: c(onceki3), birim: b.birim, carpan: b.carpan, para: b.para, kavram };
    }
  }
  return null;
}
/** Saf: ana ortaklık net kârı (yoksa dönem kârı). */
const kapNetKar = (ham) => kapKalem(ham, ['ifrs-full_ProfitLossAttributableToOwnersOfParent', 'ifrs-full_ProfitLoss']);
/** Saf: satış gelirleri (hasılat). Bankalarda bu kalem yoktur → null (satırda satış gösterilmez). */
const kapSatis = (ham) => kapKalem(ham, ['ifrs-full_Revenue']);
/** Saf: 4,1e9 → "4,1 milyar TL". */
function paraMetin(x, para = 'TL') {
  if (x == null || !Number.isFinite(x)) return 'okunamadı';
  const a = Math.abs(x), s = x < 0 ? '−' : '';
  if (a >= 1e9) return `${s}${trSayi(a / 1e9, 1)} milyar ${para}`;
  if (a >= 1e6) return `${s}${trSayi(a / 1e6, 1)} milyon ${para}`;
  if (a >= 1e3) return `${s}${trSayi(a / 1e3, 0)} bin ${para}`;
  return `${s}${trSayi(a, 0)} ${para}`;
}
const degisimMetin = (a, b) => (a == null || b == null || !b ? null : yuzdeMetin((a - b) / Math.abs(b), 0));
/** "23.10.2026 18:30:16" → ms (İstanbul, UTC+3). */
function kapZaman(s) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(s || ''));
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 3, +m[5], +m[6]) : NaN;
}
const KOD_RE = /^[A-Z0-9]{3,6}$/;
/**
 * Saf: KAP bildirim listesi + izlenen kodlar (null = TÜM BIST) + görülenler → yeni ilgili finansal rapor bildirimleri.
 * Yayımı 36 saatten eski olan alınmaz (sunucu uzun kapalı kaldıysa eski raporlar özete girmez).
 */
function kapYeniler(liste, izlenen, gorulen = {}, simdi = Date.now()) {
  const kume = izlenen ? new Set([...izlenen].map(s => String(s).toUpperCase())) : null;
  return (Array.isArray(liste) ? liste : []).filter(x => x && x.subject === 'Finansal Rapor' && x.disclosureIndex && !gorulen[x.disclosureIndex])
    .map(x => ({ ...x, kodlar: String(x.stockCodes || '').split(/[,\s]+/).map(s => s.toUpperCase()).filter(s => KOD_RE.test(s)) }))
    .filter(x => x.kodlar.length && (!kume || x.kodlar.some(k => kume.has(k))))
    .filter(x => { const z = kapZaman(x.publishDate); return !Number.isFinite(z) || simdi - z < 36 * SAAT; });
}

// ── BIST 100 evreni (saf + dosya okuma) ──────────────────────────────────────
/**
 * Saf: BIST temel çalışmasının evren kuralı (lib/research/bistTemel.js `evren().ilk100`, XU100-G vekili) — son işlem günü itibarıyla:
 * en az 126 işlem günü verisi, son 5 işlem günü içinde işlem görmüş; büyüklük = son 63 günün ortalama halka açık piyasa değeri
 * (HAO_PD; yoksa PD × son bilinen HAO/PD oranı); 63 günlük medyan cirosu ilk 150'de olanlardan en büyük 100. Banka/holding DAHİL.
 * Borsa İstanbul'un resmî dönemsel üye listesi açık kaynakta yok — bu bir VEKİLDİR (resmî endeksle çoğu üye örtüşür, birebir değil).
 * @param kayitlar [{ kod, n: toplam geçerli satır, k: [{ t, hacim, pd, hao }] (son ~140 satır, sıralı) }]
 * @returns {{ kodlar: string[], veriGunu: string|null, aday: number }}
 */
function bist100Evren(kayitlar, { enAzSatir = 126 } = {}) {
  const say = new Map();
  for (const r of kayitlar) for (const x of r.k) say.set(x.t, (say.get(x.t) || 0) + 1);
  const takvim = [...say.entries()].filter(([, n]) => n >= 3).map(([t]) => t).sort((a, b) => a - b);
  if (!takvim.length) return { kodlar: [], veriGunu: null, aday: 0 };
  const idx = new Map(takvim.map((t, i) => [t, i]));
  const d = takvim.length - 1, bas = Math.max(0, d - 62), pencere = d - bas + 1;
  const aday = [];
  for (const r of kayitlar) {
    if (r.n < enAzSatir || !r.k.length) continue;
    const sonI = idx.get(r.k[r.k.length - 1].t);
    if (sonI == null || d - sonI > 5) continue;
    let oran = NaN, top = 0, adet = 0;
    const hacim = new Map();
    for (const x of r.k) {
      const i = idx.get(x.t);
      let buy = 0;
      if (x.hao > 0) { buy = x.hao; if (x.pd > 0) oran = x.hao / x.pd; } else if (x.pd > 0 && oran > 0) buy = x.pd * oran;
      if (i == null || i < bas) continue;
      if (buy > 0) { top += buy; adet++; }
      hacim.set(i, x.hacim || 0);
    }
    const a = []; for (let i = bas; i <= d; i++) a.push(hacim.get(i) || 0);
    a.sort((x, y) => x - y);
    const m = pencere >> 1;
    aday.push({ kod: r.kod, hao: adet ? top / adet : 0, hm: pencere % 2 ? a[m] : (a[m - 1] + a[m]) / 2 });
  }
  const hmRank = new Map([...aday].sort((x, y) => y.hm - x.hm).map((x, i) => [x.kod, i]));
  // Not: bistTemel önce 100'ü keser, sonra likiditeyle süzer (~85 üye kalır); bildirimde BIST 100 sayısına yakın olsun diye önce süzülür, sonra 100 alınır.
  const kodlar = aday.filter(x => x.hao > 0 && hmRank.get(x.kod) < 150).sort((x, y) => y.hao - x.hao).slice(0, 100).map(x => x.kod);
  return { kodlar, veriGunu: new Date(takvim[d]).toISOString().slice(0, 10), aday: aday.length };
}
const tGun = (s) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s || '')); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : NaN; };
/**
 * Dosyadan BIST 100 vekili: <veri>/bist-temel/fiyat/*.json (İş Yatırım günlük satırları; BIST temel çalışmasının girdisi, SALT OKUMA).
 * Dosya başına okuma + setImmediate ile olay döngüsüne nefes (sunucu takılmaz). Veri yoksa / 50'den az üye çıkarsa yedek:
 * <veri>/bist/*.IS.json (Lydia'nın aday listesi, BIST 30 geçmiş üyeleri) — kaynak "bist-yedek".
 */
async function bist100Oku() {
  const yollar = require('./yollar');
  const fsp = fs.promises;
  // 73.7: önce BIST temel araştırmasının tam fiyatları (geliştirme bilgisayarı); yoksa sunucunun günlük HAFİF indirmesi (lib/bistHafif.js,
  // aday kümesi × son ~100 gün — 126 gün geçmiş şartı uygulanamaz, en az 50 işlem günü aranır).
  for (const [alt, kaynak, enAzSatir] of [['bist-temel', 'bist-temel', 126], ['bist-hafif', 'bist-hafif', 50]]) {
  try {
    const dizin = yollar.veri(alt, 'fiyat');
    const dosyalar = (await fsp.readdir(dizin)).filter(f => f.endsWith('.json'));
    const kayitlar = [];
    for (const f of dosyalar) {
      try {
        const j = JSON.parse(await fsp.readFile(path.join(dizin, f), 'utf8'));
        const v = (j.v || []).filter(x => x[1] > 0 && x[2] > 0);
        kayitlar.push({ kod: String(j.kod || f.replace(/\.json$/, '')).toUpperCase(), n: v.length,
          k: v.slice(-140).map(x => ({ t: tGun(x[0]), hacim: Number(x[5]) || 0, pd: Number(x[6]), hao: Number(x[7]) })).filter(x => Number.isFinite(x.t)).sort((a, b) => a.t - b.t) });
      } catch (e) { /* bozuk dosya atlanır */ }
      await new Promise(r => setImmediate(r));
    }
    const e = bist100Evren(kayitlar, { enAzSatir });
    if (e.kodlar.length >= 50) return { ...e, kaynak };
  } catch (e) { /* veri yok → sıradaki kaynak */ }
  }
  try {
    const kodlar = fs.readdirSync(yollar.veri('bist')).filter(f => /\.IS\.json$/.test(f)).map(f => f.replace(/\.IS\.json$/, '').toUpperCase()).filter(k => KOD_RE.test(k));
    return { kodlar, veriGunu: null, aday: kodlar.length, kaynak: 'bist-yedek' };
  } catch (e) { return { kodlar: [], veriGunu: null, aday: 0, kaynak: 'yok' }; }
}

// ── Eldekiler (Lydia kâğıt hesap + Portföyüm) ────────────────────────────────
const LYDIA = (() => { try { const BA = require('./botAdlari'); return `${BA.ad('m-bist-m10')} (${BA.eski('m-bist-m10')})`; } catch (e) { return 'Lydia (BIST M10)'; } })();
/** Saf: { KOD: ['Lydia (BIST M10)', 'Portföyüm'] } | Map | string[] → Map(kod → etiketler). */
function eldeHaritasi(x) {
  const m = new Map();
  const ekle = (kod, etiket) => {
    const k = String(kod || '').toUpperCase().replace(/\.IS$/i, '');
    if (!KOD_RE.test(k)) return;
    const l = m.get(k) || [];
    if (etiket && !l.includes(etiket)) l.push(etiket);
    m.set(k, l);
  };
  if (x instanceof Map) for (const [k, v] of x) for (const e of [].concat(v || [])) ekle(k, e);
  else if (Array.isArray(x)) for (const k of x) ekle(k, null);
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { ekle(k, null); for (const e of [].concat(v || [])) ekle(k, e); }
  return m;
}
/** Dosyadan (server.js bistKodlari ile aynı kaynaklar, SALT OKUMA): Lydia kâğıt hesabının açık pozisyonları + Portföyüm TL hisseleri. */
function eldekilerOku() {
  const yollar = require('./yollar');
  const o = {};
  const ekle = (kod, etiket) => { (o[kod] = o[kod] || []).includes(etiket) || o[kod].push(etiket); };
  try {
    const j = JSON.parse(fs.readFileSync(yollar.veri('tasarimci', 'kagit.json'), 'utf8'));
    for (const p of (((j.modeller || {})['m-bist-m10'] || {}).pozisyonlar || [])) if (p && p.s && Number(p.adet) > 0) ekle(String(p.s), LYDIA);
  } catch (e) { /* kâğıt hesap yok */ }
  try {
    const { D, muh } = require('./portfoyum/depo').yukle();
    for (const c of muh.ciftler.values()) {
      if (c.nakit || !(c.ana && c.ana.adet > 1e-9)) continue;
      const v = D.varliklar.get(c.varlik);
      if (v && v.sinif === 'hisse' && v.para === 'TRY') ekle(String(v.kod || v.sembol).replace(/\.IS$/i, ''), 'Portföyüm');
    }
  } catch (e) { /* Portföyüm yok */ }
  return o;
}

// ── Bilanço özeti (saf) ──────────────────────────────────────────────────────
const TMS29_NOT = 'TMS 29 dönemi: rakamlar enflasyon düzeltmeli (geçen yılın rakamı bugünkü alım gücüne taşınmış) · kaynak KAP.';
/** Saf: KAP öğesi + ayrıştırılmış kalemler → karşılaştırma ölçüsü (çeyrek: Q1 = dönem, Q2/Q3/Q4 = "3 Aylık" sütunu; yoksa dönem toplamı). */
function bilancoOlcu(x) {
  const nk = x.nk, sat = x.satis;
  const p = Number(x.period);
  const ceyrekVar = nk && nk.cari3 != null && p > 1;
  const etiket = p === 1 || ceyrekVar || (!nk && p >= 2 && p <= 3) ? `${p}Ç` : p === 4 ? 'yıllık' : (x.ruleType || 'dönem');
  // Net kâr ile satış AYNI sütundan (çeyrekse ikisi de 3 aylık; satışta 3 aylık yoksa satış gösterilmez)
  const sec = (k) => (!k ? { c: null, o: null } : ceyrekVar ? (k.cari3 != null ? { c: k.cari3, o: k.onceki3 } : { c: null, o: null }) : { c: k.cari, o: k.onceki });
  const n = sec(nk), s = sec(sat);
  let yon = 'yok', deg = null;
  if (n.c != null && n.o != null && n.o !== 0) {
    deg = (n.c - n.o) / Math.abs(n.o);
    yon = n.o < 0 && n.c > 0 ? 'zarardanKara' : n.o > 0 && n.c < 0 ? 'kardanZarara' : deg >= 0 ? 'artis' : 'dusus';
  }
  const sdeg = s.c != null && s.o != null && s.o !== 0 ? (s.c - s.o) / Math.abs(s.o) : null;
  return { kod: x.kodlar[0], id: x.disclosureIndex, yil: x.year, etiket, c: n.c, o: n.o, deg, yon, sdeg, para: (nk && nk.para) || 'TL', okundu: !!nk };
}
/** Saf: tek satır — yalnız rakam ve yön (yorum / öneri yok). */
function bilancoSatir(m, etiketler) {
  const elde = etiketler && etiketler.length ? ` — elinizde: ${etiketler.join(' · ')}` : '';
  const on = etiketler ? '📌 ' : '';
  if (!m.okundu || m.c == null) return `${on}${m.kod} · ${m.etiket}: rakam okunamadı (KAP ${m.id})${elde}`;
  const gy = m.o != null ? `geçen yıl ${paraMetin(m.o, m.para)}` : 'geçen yıl yok';
  const sat = m.sdeg != null ? ` · satış ${yuzdeMetin(m.sdeg, 0)}` : '';
  if (m.yon === 'zarardanKara') return `${on}${m.kod} · ${m.etiket} zarardan kâra: ${paraMetin(m.c, m.para)} (${gy})${sat}${elde}`;
  if (m.yon === 'kardanZarara') return `${on}${m.kod} · ${m.etiket} kârdan zarara: ${paraMetin(m.c, m.para)} (${gy})${sat}${elde}`;
  return `${on}${m.kod} · ${m.etiket} net kâr ${paraMetin(m.c, m.para)} (${gy}${m.deg != null ? `, ${yuzdeMetin(m.deg, 0)}` : ''})${sat}${elde}`;
}
/**
 * Saf: o turun sonuçları → özet mesaj. Elde olanlar HER ZAMAN (satır sınırı dışında da) listelenir; kalan yer en dikkat çekenlerle
 * dolar: artı taraf (zarardan kâra, sonra en büyük artış) ile eksi taraf (kârdan zarara, sonra en büyük düşüş) sırayla. Gerisi tek satır.
 * @param sonuclar [{ kodlar, disclosureIndex, year, period, ruleType, nk, satis }]  @param elde Map(kod → etiketler)
 * @param ayar { satir }  @param ek { slot, bekleyen }
 */
function bilancoOzet(sonuclar, elde, ayar = {}, ek = {}) {
  // Aynı şirketin aynı dönemi iki kez (ör. konsolide + solo) → okunabilen ilki
  const tekil = new Map();
  for (const x of sonuclar) {
    const a = `${x.kodlar[0]}|${x.year}|${x.period}`;
    const o = tekil.get(a);
    if (!o || (!o.nk && x.nk)) tekil.set(a, x);
  }
  const olcu = [...tekil.values()].map(bilancoOlcu);
  const eldeMi = (m) => elde.has(m.kod);
  const eldeL = olcu.filter(eldeMi);
  const diger = olcu.filter(m => !eldeMi(m));
  const arti = diger.filter(m => m.yon === 'zarardanKara' || m.yon === 'artis').sort((a, b) => (a.yon === b.yon ? b.deg - a.deg : a.yon === 'zarardanKara' ? -1 : 1));
  const eksi = diger.filter(m => m.yon === 'kardanZarara' || m.yon === 'dusus').sort((a, b) => (a.yon === b.yon ? a.deg - b.deg : a.yon === 'kardanZarara' ? -1 : 1));
  const yer = Math.max(0, (ayar.satir || 8) - eldeL.length);
  const secilen = [];
  for (let i = 0; secilen.length < yer && (i < arti.length || i < eksi.length); i++) {
    if (i < arti.length && secilen.length < yer) secilen.push(arti[i]);
    if (i < eksi.length && secilen.length < yer) secilen.push(eksi[i]);
  }
  const daha = diger.length - secilen.length;
  const govde = [...eldeL.map(m => bilancoSatir(m, elde.get(m.kod))), ...secilen.map(m => bilancoSatir(m, null))];
  if (daha > 0) govde.push(`${daha} şirket daha açıkladı.`);
  if (ek.bekleyen) govde.push(`${ek.bekleyen} bildirimin rakamları okunuyor — sonraki özette.`);
  govde.push(TMS29_NOT);
  const toplam = olcu.length;
  return {
    parcalar: { simge: '🏛️', baslik: `Bilanço özeti${ek.slot ? ` · ${ek.slot}` : ''} — ${toplam} şirket açıkladı`, govde: govde.map(BM.kacir), ne: '' },
    degiskenler: { saat: ek.slot || '', sayi: String(toplam), eldeki: eldeL.map(m => BM.kacir(bilancoSatir(m, elde.get(m.kod)))), liste: secilen.map(m => BM.kacir(bilancoSatir(m, null))),
      daha: daha > 0 ? String(daha) : '', not: BM.kacir(TMS29_NOT) },
    secilen: secilen.map(m => m.kod), eldeki: eldeL.map(m => m.kod), daha,
  };
}
/** Saf: "13:00" → 780 (geçersiz → null). */
const saatDk = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
/** Saf: vadesi gelmiş, bugün henüz işlenmemiş EN SON mesaj saati (yoksa null). Öncekiler de işlenmiş sayılır (günde en çok saat sayısı kadar mesaj). */
function vadeliSaat(saatler, z, slot = {}) {
  const yapilan = slot.gun === z.gun ? slot.yapilan || [] : [];
  const vade = (saatler || []).filter(s => saatDk(s) != null && z.dk >= saatDk(s) && !yapilan.includes(s)).sort((a, b) => saatDk(a) - saatDk(b));
  return vade.length ? { saat: vade[vade.length - 1], hepsi: vade } : null;
}

// ── gölge etiketi (saf) ──────────────────────────────────────────────────────
const GOLGE_SATIR = '🧪 GÖLGE ·';
const golgeGun = (t) => { try { return require('./golgeOzet').gun(t); } catch (e) { return t; } };
/** Saf: mesajın ilk satırı — kullanıcı kararı 2026-10-24: gölge testi olduğu NET yazılır. */
function golgeEtiketi(yakin) {
  return `🧪 GÖLGE TESTİ — gerçek para değil, emir yok; ara sonuçtur, hüküm değildir (hüküm tarihi: her satırın sonunda${yakin ? `; en yakını ${golgeGun(yakin)}` : ''}).`;
}
const GOLGE_ETIKET = golgeEtiketi(null);

// ── durum dosyası ────────────────────────────────────────────────────────────
function durumOku(dosya) { try { return JSON.parse(fs.readFileSync(dosya, 'utf8')) || {}; } catch (e) { return {}; } }
function durumYaz(dosya, d) {
  try {
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
    fs.writeFileSync(dosya + '.tmp', JSON.stringify(d, null, 1), 'utf8');
    fs.renameSync(dosya + '.tmp', dosya);
  } catch (e) { /* yazılamadı — sonraki turda */ }
}

/**
 * @param o {
 *   durumDosya, merkez (uretici(ad), acikMi(tur)), gonder: async (tur, parcalar, degiskenler) → { ok },
 *   fetchFn, simdi, log(sv, m), bekle(ms),
 *   kaynaklar: { bistKodlari: () → string[], golgeSatirlari: async () → string[], anahtarSina: async () → [...] }
 * }
 */
function olustur(o = {}) {
  const dosya = o.durumDosya;
  const fetchFn = o.fetchFn || ((...a) => fetch(...a));
  const simdi = o.simdi || (() => Date.now());
  const log = o.log || (() => {});
  const bekle = o.bekle || ((ms) => new Promise(r => setTimeout(r, ms)));
  const k = o.kaynaklar || {};
  let d = durumOku(dosya);
  const kaydet = () => durumYaz(dosya, d);
  const mesgul = {};
  const acik = (tur) => { try { return o.merkez.acikMi(tur); } catch (e) { return true; } };
  const tek = (ad, fn) => async (...a) => { if (mesgul[ad]) return { atlandi: 'mesgul' }; mesgul[ad] = true; try { return await fn(...a); } catch (e) { log('WARN', `[BİLDİRİM] ${ad} üreticisi: ${String(e.message || e).slice(0, 200)}`); d[ad] = { ...(d[ad] || {}), hata: String(e.message || e).slice(0, 200), hataZaman: simdi() }; kaydet(); return { hata: e.message }; } finally { mesgul[ad] = false; } };
  const gonder = async (tur, x) => { const r = await o.gonder(tur, x.parcalar, x.degiskenler); return r || { ok: false }; };

  // ── fiyat ──
  const fiyatTik = tek('fiyat', async () => {
    if (!acik('fiyat')) return { kapali: true };
    const a = o.merkez.uretici('fiyat');
    const f = d.fiyat = d.fiyat || {};
    f.son = f.son || {};
    const sonuc = [];
    for (const sembol of a.semboller) {
      const limit = Math.round(a.pencereDk / 5) + 1;
      const y = await fetchFn(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(sembol)}&interval=5m&limit=${limit}`, { headers: UA, signal: AbortSignal.timeout(15000) });
      if (!y.ok) throw new Error(`Binance ${sembol} HTTP ${y.status}`);
      const dg = fiyatDegisimi(await y.json());
      for (const ol of fiyatOlaylari(sembol, dg, a, f.son, simdi())) {
        const r = await gonder('fiyat', fiyatParcalari(ol, a));
        if (r.ok) { f.son[ol.anahtar] = simdi(); sonuc.push(ol.anahtar); }
      }
    }
    f.kontrol = simdi(); f.hata = null;
    kaydet();
    return { gonderilen: sonuc };
  });

  // ── makine ──
  /** Sunucu açılışı: son nabız eşikten eskiyse bildir, sonra nabzı yaz. */
  const makineAcilis = tek('makine', async () => {
    const m = d.makine = d.makine || { makineler: {} };
    const esik = o.merkez.uretici('makine').sunucuEsikDk * DK;
    const once = m.sunucu && m.sunucu.son;
    m.sunucu = { son: simdi(), acilis: simdi() };
    kaydet();
    if (once && simdi() - once > esik && acik('makine')) {
      await gonder('makine', { parcalar: { simge: '📡', baslik: 'Sunucu bir süre sessiz kaldı', govde: [`Pusula ${sureMetin(simdi() - once)} çalışmadı (son nabız: ${kisaZaman(once)}); şimdi yeniden açıldı.`, 'Bu sürede botların günlük çalışması kaçtıysa bir sonraki çalışmada bugünkü hedefe gidilir.'],
        ne: 'Elektrik / Windows güncellemesi / uyku olabilir — Sağlık › Sunucu bilgisayarı\'na bak.' }, degiskenler: { makine: 'sunucu', sure: sureMetin(simdi() - once), son_gorulme: kisaZaman(once) } });
    }
    return { once };
  });
  /** Araştırma kopyasının (ya da ileride başka makinenin) nabzı. */
  function nabizKaydet(ad, bilgi = {}) {
    const a = makineAdi(ad);
    if (!a) return false;
    const m = d.makine = d.makine || { makineler: {} };
    m.makineler = m.makineler || {};
    const onceki = m.makineler[a] || null;
    m.makineler[a] = { ...(onceki || { ilk: simdi() }), son: simdi(), tur: bilgi.tur || (onceki && onceki.tur) || 'arastirma', surum: bilgi.surum ? String(bilgi.surum).slice(0, 12) : (onceki && onceki.surum) || null, uyarildi: false };
    kaydet();
    if (onceki && onceki.uyarildi && acik('makine')) {
      gonder('makine', { parcalar: { simge: '📡', baslik: `Araştırma kopyası yeniden görüldü: ${a}`, govde: [`${sureMetin(simdi() - onceki.son)} sonra sunucuya yeniden bağlandı.`], ne: '' },
        degiskenler: { makine: a, sure: sureMetin(simdi() - onceki.son), son_gorulme: kisaZaman(onceki.son) } }).catch(() => null);
    }
    return true;
  }
  const makineTik = tek('makineTik', async () => {
    const m = d.makine = d.makine || { makineler: {} };
    m.sunucu = { ...(m.sunucu || {}), son: simdi() };
    const a = o.merkez.uretici('makine');
    const { uyar } = makineDegerlendir(m.makineler, a.esikSaat, simdi());
    for (const ad of uyar) {
      const x = m.makineler[ad];
      if (!acik('makine')) { x.uyarildi = true; continue; }
      const r = await gonder('makine', { parcalar: { simge: '📡', baslik: `Araştırma kopyası sessiz: ${ad}`, govde: [`Sunucuya ${sureMetin(simdi() - x.son)} boyunca görünmedi (son: ${kisaZaman(x.son)}).`],
        ne: 'Bilgisayar kapalıysa bir şey yapman gerekmiyor; açıksa Tailscale bağlantısına ve Pusula\'nın çalıştığına bak.' }, degiskenler: { makine: ad, sure: sureMetin(simdi() - x.son), son_gorulme: kisaZaman(x.son) } });
      if (r.ok) x.uyarildi = true;
    }
    kaydet();
    return { uyar };
  });

  // ── gölge haftalık ──
  const golgeTik = tek('golge', async () => {
    const z = istanbul(simdi());
    const hafta = haftaEtiketi(simdi());
    const g = d.golge = d.golge || {};
    if (g.hafta === hafta) return { zaten: hafta };
    if (z.haftaGunu !== 1 || z.dk < 9 * 60) return { bekliyor: true };
    if (!acik('golge')) { g.hafta = hafta; kaydet(); return { kapali: true }; }
    const ham = (await k.golgeSatirlari()) || [];
    // Her satır gölge etiketiyle başlar (lib/golgeOzet.js yazar; başka kaynaktan gelen satıra burada eklenir)
    const satirlar = ham.map(s => (String(s).startsWith(GOLGE_SATIR) ? String(s) : `${GOLGE_SATIR} ${s}`));
    if (!satirlar.length) { g.hafta = hafta; kaydet(); return { bos: true }; }
    const bugun = new Date(simdi()).toISOString().slice(0, 10);
    const yakin = (ham.hukumTarihleri || []).find(t => t > bugun) || null;
    const etiket = golgeEtiketi(yakin);
    const r = await gonder('golge', { parcalar: { simge: '🧪', baslik: `GÖLGE TESTİ · haftalık ara sonuç (${hafta})`, govde: [etiket, ...satirlar, 'Ayrıntı: İleri test.'].map(BM.kacir), ne: '' },
      degiskenler: { hafta, etiket: BM.kacir(etiket), liste: satirlar.map(BM.kacir), hukum: yakin ? BM.kacir(golgeGun(yakin)) : '' } });
    if (r.ok) { g.hafta = hafta; g.zaman = simdi(); kaydet(); }
    return { gonderildi: !!r.ok };
  });

  // ── anahtar ──
  const anahtarTik = tek('anahtar', async () => {
    const z = istanbul(simdi());
    const a = d.anahtar = d.anahtar || {};
    if (a.gun === z.gun || z.dk < 6 * 60 + 15) return { bekliyor: true };
    const sonuc = (await k.anahtarSina()) || [];
    a.gun = z.gun; a.zaman = simdi(); a.sayi = sonuc.length;
    const sorun = sonuc.filter(x => !x.ok || x.cekmeIzni);
    a.sorun = sorun.map(x => x.kimlik);
    kaydet();
    if (!sorun.length || !acik('anahtar')) return { sinanan: sonuc.length, sorun: sorun.length };
    const satir = (x) => `${x.ad}: ${x.cekmeIzni ? 'PARA ÇEKME izni açık' : `bağlanamadı (${x.hata || 'bilinmeyen hata'})`}.`;
    const r = await gonder('anahtar', { parcalar: { simge: '🔑', baslik: `Anahtar sınaması: ${sorun.length} sorun`, govde: [...sorun.map(x => BM.kacir(satir(x))), `Salt okuma sınaması (emir yok) · ${sonuc.length} anahtar sınandı.`],
      ne: sorun.some(x => x.cekmeIzni) ? 'Para çekme iznini borsada hemen kapat; sonra Ayarlar › Anahtarlar › Sına.' : 'Ayarlar › Anahtarlar\'da anahtara bak (süresi dolmuş, silinmiş ya da IP kısıtı değişmiş olabilir).' },
      degiskenler: { anahtar: BM.kacir(sorun.map(x => x.ad).join(', ')), sorun: BM.kacir(sorun.map(x => (x.cekmeIzni ? 'para çekme izni açık' : 'bağlanamadı')).join(', ')) } });
    return { sinanan: sonuc.length, sorun: sorun.length, gonderildi: !!r.ok };
  });

  // ── bilanço ──
  // Toplama (KAP) ile gönderim (özet) ayrı: toplama 08:00–23:00 arası 90 dk'da bir (mesaj saatinden hemen önce de, son toplama 30 dk'dan
  // eskiyse); özet yalnız ayarlı saatlerde (varsayılan 13:00 ve 20:30) ve yalnız yeni sonuç varsa. Durum: d.bilanco.
  const BIL_TOPLA = 90 * DK, BIL_TAZE = 30 * DK, BIL_AYRINTI = 15, BIL_BEKLE = 20000;
  const bilDurum = () => {
    const b = d.bilanco = d.bilanco || {};
    b.gorulen = b.gorulen || {}; b.kuyruk = b.kuyruk || []; b.sonuc = b.sonuc || []; b.slot = b.slot || {};
    return b;
  };
  const bilAyar = () => ({ evren: 'bist100', saatler: ['13:00', '20:30'], satir: 8, ...((o.merkez.uretici && o.merkez.uretici('bilanco')) || {}) });
  const elde = () => {
    let x = null;
    try { x = k.eldekiler ? k.eldekiler() : eldekilerOku(); } catch (e) { x = null; }
    const m = eldeHaritasi(x || {});
    try { for (const kod of (k.bistKodlari ? k.bistKodlari() : []) || []) { const kk = String(kod).toUpperCase(); if (KOD_RE.test(kk) && !m.has(kk)) m.set(kk, []); } } catch (e) { /* yok */ }
    return m;
  };
  async function bilEvren(b, z) {
    if (b.evren100 && b.evren100.gun === z.gun && b.evren100.kodlar && b.evren100.kodlar.length) return b.evren100;
    const e = await (k.bistEvren ? k.bistEvren() : bist100Oku());
    b.evren100 = { gun: z.gun, kodlar: (e && e.kodlar) || [], kaynak: (e && e.kaynak) || 'yok', veriGunu: (e && e.veriGunu) || null };
    return b.evren100;
  }
  async function bilancoTopla(b, a, z) {
    const E = elde();
    let ev = null;
    if (a.evren !== 'elde') { try { ev = await bilEvren(b, z); } catch (e) { ev = null; } }
    const izlenen = a.evren === 'tum' ? null : [...new Set([...E.keys(), ...(a.evren === 'bist100' && ev ? ev.kodlar : [])])];
    b.izlenen = izlenen ? izlenen.length : null;
    b.kontrol = simdi();
    if (izlenen && !izlenen.length) { kaydet(); return { izlenen: 0 }; }
    const g = (t) => new Date(t).toISOString().slice(0, 10);
    const govde = { fromDate: g(simdi() - 2 * GUN), toDate: g(simdi()), memberType: 'IGS', mkkMemberOidList: [], inactiveMkkMemberOidList: [], disclosureClass: 'FR', subjectList: [], isLate: '', mainSector: '', sector: '', subSector: '', marketOid: '', index: '', bdkReview: '', bdkMemberOidList: [], year: '', term: '', ruleType: '', period: '', fromSrc: false, srcCategory: '', disclosureIndexList: [] };
    let liste;
    try {
      const y = await fetchFn(`${KAP}/disclosure/members/byCriteria`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json', 'Accept-Language': 'tr' }, body: JSON.stringify(govde), signal: AbortSignal.timeout(60000) });
      if (!y.ok) throw new Error(`KAP HTTP ${y.status}`);
      liste = await y.json();
    } catch (e) { b.geriCekil = simdi() + 6 * SAAT; b.hata = String(e.message || e).slice(0, 200); kaydet(); throw e; }
    // Yeni bildirimler kuyruğa; görülen işaretlenir (aynı bildirim iki kez işlenmez)
    const sira = new Map(((ev && ev.kodlar) || []).map((kod, i) => [kod, i]));
    for (const x of kapYeniler(liste, izlenen, b.gorulen, simdi())) {
      b.gorulen[x.disclosureIndex] = simdi();
      b.kuyruk.push({ disclosureIndex: x.disclosureIndex, kodlar: x.kodlar, kapTitle: x.kapTitle || null, year: x.year || null, period: x.period || null, ruleType: x.ruleType || null,
        publishDate: x.publishDate || null, elde: x.kodlar.some(kk => E.has(kk)), sira: Math.min(...x.kodlar.map(kk => (sira.has(kk) ? sira.get(kk) : 1e4))), deneme: 0 });
    }
    // Öncelik: elde olanlar → BIST 100 vekilinde büyükten küçüğe → yayım sırası
    b.kuyruk.sort((p, q) => (p.elde !== q.elde ? (p.elde ? -1 : 1) : p.sira - q.sira));
    kaydet();
    let okunan = 0;
    while (b.kuyruk.length && okunan < BIL_AYRINTI) {
      const x = b.kuyruk[0];
      await bekle(BIL_BEKLE);   // KAP: istekler arası ≥ 20 sn (liste isteği dahil)
      let ham = null, hata = null;
      try {
        const y = await fetchFn(KAP_SAYFA + x.disclosureIndex, { headers: UA, signal: AbortSignal.timeout(90000) });
        if (y.ok) ham = await y.text(); else hata = `KAP ayrıntı HTTP ${y.status}`;
      } catch (e) { hata = String(e.message || e); }
      okunan++;
      if (hata) {
        x.deneme = (x.deneme || 0) + 1;
        if (x.deneme >= 3) { b.kuyruk.shift(); b.sonuc.push({ ...x, nk: null, satis: null, zaman: simdi(), gonderildi: null }); }
        b.geriCekil = simdi() + 6 * SAAT; b.hata = hata.slice(0, 200);
        kaydet();
        return { izlenen: b.izlenen, okunan, hata };
      }
      b.kuyruk.shift();
      b.sonuc.push({ ...x, nk: kapNetKar(ham), satis: kapSatis(ham), zaman: simdi(), gonderildi: null });
      kaydet();
    }
    b.hata = null;
    kaydet();
    return { izlenen: b.izlenen, okunan };
  }
  async function bilancoGonder(b, a, vade, z) {
    b.slot = { gun: z.gun, yapilan: [...new Set([...(b.slot.gun === z.gun ? b.slot.yapilan || [] : []), ...vade.hepsi])] };
    const bekleyen = b.sonuc.filter(x => !x.gonderildi);
    if (!bekleyen.length) { kaydet(); return { bos: true }; }
    const x = bilancoOzet(bekleyen, elde(), a, { slot: vade.saat, bekleyen: b.kuyruk.length });
    const r = await gonder('bilanco', x);
    if (r.ok) { for (const s of bekleyen) s.gonderildi = simdi(); b.sonOzet = { zaman: simdi(), saat: vade.saat, sayi: bekleyen.length }; }
    kaydet();
    return { gonderildi: !!r.ok, sayi: bekleyen.length };
  }
  const bilancoTik = tek('bilanco', async () => {
    const b = bilDurum();
    const z = istanbul(simdi());
    if (!acik('bilanco')) { b.kontrol = simdi(); kaydet(); return { kapali: true }; }
    const a = bilAyar();
    const vade = vadeliSaat(a.saatler, z, b.slot);
    const sonuc = {};
    const saatte = z.dk >= 8 * 60 && z.dk <= 23 * 60;
    const geri = b.geriCekil && simdi() < b.geriCekil;
    const aralik = !b.kontrol || simdi() - b.kontrol >= BIL_TOPLA || (vade && simdi() - b.kontrol >= BIL_TAZE);
    if (saatte && !geri && aralik) {
      try { Object.assign(sonuc, await bilancoTopla(b, a, z)); } catch (e) { sonuc.hata = String(e.message || e).slice(0, 200); }
    } else sonuc.bekliyor = !saatte ? 'saat' : geri ? 'geri çekilme' : 'aralık';
    if (vade) Object.assign(sonuc, { ozet: await bilancoGonder(b, a, vade, z) });
    // görülenler 60 gün; gönderilmiş sonuçlar 3 gün; gönderilemeyen sonuç 4 günden eskiyse düşer
    for (const [id, t] of Object.entries(b.gorulen)) if (simdi() - t > 60 * GUN) delete b.gorulen[id];
    b.sonuc = b.sonuc.filter(x => simdi() - x.zaman < (x.gonderildi ? 3 : 4) * GUN);
    b.kuyruk = b.kuyruk.filter(x => !(simdi() - kapZaman(x.publishDate) > 3 * GUN));
    kaydet();
    return sonuc;
  });

  function durum() {
    const m = (d.makine && d.makine.makineler) || {};
    return {
      fiyat: d.fiyat ? { kontrol: d.fiyat.kontrol || null, hata: d.fiyat.hata || null } : null,
      makine: { sunucu: d.makine && d.makine.sunucu ? d.makine.sunucu : null, makineler: Object.entries(m).map(([ad, x]) => ({ ad, son: x.son, tur: x.tur, surum: x.surum, uyarildi: !!x.uyarildi })) },
      golge: d.golge ? { hafta: d.golge.hafta || null, zaman: d.golge.zaman || null, hata: d.golge.hata || null } : null,
      anahtar: d.anahtar ? { gun: d.anahtar.gun || null, sayi: d.anahtar.sayi || 0, sorun: (d.anahtar.sorun || []).length, hata: d.anahtar.hata || null } : null,
      bilanco: d.bilanco ? { kontrol: d.bilanco.kontrol || null, izlenen: d.bilanco.izlenen == null ? null : d.bilanco.izlenen, hata: d.bilanco.hata || null,
        evren: (() => { try { return bilAyar().evren; } catch (e) { return null; } })(),
        evren100: d.bilanco.evren100 ? { sayi: (d.bilanco.evren100.kodlar || []).length, kaynak: d.bilanco.evren100.kaynak, veriGunu: d.bilanco.evren100.veriGunu } : null,
        kuyruk: (d.bilanco.kuyruk || []).length, bekleyen: (d.bilanco.sonuc || []).filter(x => !x.gonderildi).length,
        sonOzet: d.bilanco.sonOzet || null, geriCekil: d.bilanco.geriCekil && d.bilanco.geriCekil > simdi() ? d.bilanco.geriCekil : null } : null,
    };
  }

  let zamanlayicilar = [];
  /** Sunucu: fiyat 5 dk, makine 5 dk, diğerleri 10 dk'da bir kendi saatini denetler. unref — kapanışı tutmaz. */
  function baslat() {
    const kur = (fn, ms, ilkMs) => { const t1 = setTimeout(() => fn().catch(() => null), ilkMs); const t2 = setInterval(() => fn().catch(() => null), ms); for (const t of [t1, t2]) if (t.unref) t.unref(); zamanlayicilar.push(t1, t2); };
    makineAcilis().catch(() => null);
    kur(fiyatTik, 5 * DK, 2 * DK);
    kur(makineTik, 5 * DK, 5 * DK);
    kur(golgeTik, 10 * DK, 4 * DK);
    kur(anahtarTik, 10 * DK, 6 * DK);
    kur(bilancoTik, 10 * DK, 8 * DK);
  }
  function durdur() { for (const t of zamanlayicilar) { clearTimeout(t); clearInterval(t); } zamanlayicilar = []; }

  return { fiyatTik, makineAcilis, makineTik, nabizKaydet, golgeTik, anahtarTik, bilancoTik, durum, baslat, durdur, _durum: () => d };
}

module.exports = { olustur, istanbul, haftaEtiketi, fiyatDegisimi, fiyatOlaylari, fiyatParcalari, makineDegerlendir, makineAdi, kapCoz, kapNetKar, birimCarpani, paraMetin, kapZaman, kapYeniler, sureMetin,
  kapKalem, kapSatis, bist100Evren, bist100Oku, eldeHaritasi, eldekilerOku, bilancoOlcu, bilancoSatir, bilancoOzet, saatDk, vadeliSaat, TMS29_NOT, GOLGE_ETIKET };
