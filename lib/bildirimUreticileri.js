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
 *   golge   Gölge testler haftalık özeti — pazartesi 09:00 (İstanbul) sonrası haftada bir, server.js'in verdiği satırlardan. HÜKÜM YAZMAZ.
 *   anahtar Anahtar sınaması — günde bir 06:15 (İstanbul) sonrası, lib/anahtarlar.js otoSina (SALT OKUMA). Başarısız ya da para çekme
 *           izni açık anahtar varsa bildirim.
 *   bilanco Bilanço açıklandı — 08:00–23:00 arası 3 saatte bir KAP bildirim sorgusu (son 2 gün, "Finansal Rapor"); izlenen kodun yeni
 *           bildirimi için ayrıntı sayfası (XBRL tablo) okunur: ana ortaklık net kârı, geçen yılın aynı dönemi (+ çeyrek sütunları).
 *           İstekler arası ≥ 20 sn, tur başına en çok 5 ayrıntı; hata → 6 saat geri çekilme. Yayımı 36 saatten eski bildirim gönderilmez.
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
 * Saf: KAP finansal rapor sayfası → { cari, onceki, cari3, onceki3, birim, carpan, para, kavram } (değerler TL·çarpan uygulanmış) ya da null.
 * Kavram sırası: ifrs-full_ProfitLossAttributableToOwnersOfParent (ana ortaklık payı) → ifrs-full_ProfitLoss. Sütunlar tablonun başlık
 * satırından eşlenir (Dipnot · Cari Dönem · Önceki Dönem · Cari Dönem 3 Aylık · Önceki Dönem 3 Aylık).
 */
function kapNetKar(ham) {
  const t = kapCoz(ham);
  const b = birimCarpani(t);
  for (const kavram of ['ifrs-full_ProfitLossAttributableToOwnersOfParent', 'ifrs-full_ProfitLoss']) {
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
/** Saf: KAP bildirim listesi + izlenen kodlar + görülenler → yeni ilgili bildirimler. */
function kapYeniler(liste, izlenen, gorulen = {}, simdi = Date.now()) {
  const kume = new Set([...izlenen].map(s => String(s).toUpperCase()));
  return (Array.isArray(liste) ? liste : []).filter(x => x && x.subject === 'Finansal Rapor' && x.disclosureIndex && !gorulen[x.disclosureIndex])
    .map(x => ({ ...x, kodlar: String(x.stockCodes || '').split(/[,\s]+/).filter(Boolean) }))
    .filter(x => x.kodlar.some(k => kume.has(k)))
    .filter(x => { const z = kapZaman(x.publishDate); return !Number.isFinite(z) || simdi - z < 36 * SAAT; });
}
function bilancoParcalari(x, nk) {
  const kod = x.kodlar.find(Boolean) || '?';
  const donem = `${x.year || '?'} · ${x.ruleType || (x.period ? `${x.period}. dönem` : '')}`.trim();
  const govde = [];
  const para = nk ? nk.para : 'TL';
  let net = null, once = null, deg = null;
  if (!nk) govde.push('Net kâr tablodan okunamadı — ayrıntı KAP bildiriminde.');
  else if (nk.cari3 != null && Number(x.period) > 1 && Number(x.period) < 4) {
    net = paraMetin(nk.cari3, para); once = nk.onceki3 != null ? paraMetin(nk.onceki3, para) : null; deg = degisimMetin(nk.cari3, nk.onceki3);
    govde.push(`Çeyrek net kâr: ${net}${once ? ` (geçen yılın aynı çeyreği: ${once}${deg ? `, ${deg}` : ''})` : ''}.`);
    if (nk.cari != null) govde.push(`${x.ruleType || 'Dönem'} toplam: ${paraMetin(nk.cari, para)}${nk.onceki != null ? ` (geçen yıl: ${paraMetin(nk.onceki, para)})` : ''}.`);
  } else {
    net = paraMetin(nk.cari, para); once = nk.onceki != null ? paraMetin(nk.onceki, para) : null; deg = degisimMetin(nk.cari, nk.onceki);
    govde.push(`${x.ruleType || 'Dönem'} net kâr: ${net}${once ? ` (geçen yılın aynı dönemi: ${once}${deg ? `, ${deg}` : ''})` : ''}.`);
  }
  govde.push(`Kaynak: KAP bildirimi ${x.disclosureIndex}${x.isLate ? ' (geç bildirim)' : ''}.`);
  return {
    parcalar: { simge: '🏛️', baslik: `${BM.kacir(kod)} bilanço açıkladı`, govde: govde.map(BM.kacir), ne: '' },
    degiskenler: { sirket: BM.kacir(x.kapTitle || kod), kod: BM.kacir(kod), donem: BM.kacir(donem), net_kar: net || '', onceki: once || '', degisim: deg || '', kaynak: KAP_SAYFA + x.disclosureIndex },
  };
}

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
    const satirlar = (await k.golgeSatirlari()) || [];
    if (!satirlar.length) { g.hafta = hafta; kaydet(); return { bos: true }; }
    const r = await gonder('golge', { parcalar: { simge: '🧪', baslik: `Gölge testler · haftalık özet (${hafta})`, govde: [...satirlar.map(BM.kacir), 'Hüküm yok — ara durum. Ayrıntı: İleri test.'], ne: '' },
      degiskenler: { hafta, liste: satirlar.map(BM.kacir) } });
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
  const bilancoTik = tek('bilanco', async () => {
    const b = d.bilanco = d.bilanco || { gorulen: {} };
    const z = istanbul(simdi());
    if (z.dk < 8 * 60 || z.dk > 23 * 60) return { bekliyor: 'saat' };
    if (b.geriCekil && simdi() < b.geriCekil) return { bekliyor: 'geri çekilme' };
    if (b.kontrol && simdi() - b.kontrol < 3 * SAAT) return { bekliyor: 'aralık' };
    if (!acik('bilanco')) { b.kontrol = simdi(); kaydet(); return { kapali: true }; }
    const izlenen = [...new Set((k.bistKodlari() || []).map(s => String(s).toUpperCase()).filter(s => /^[A-Z0-9]{3,6}$/.test(s)))];
    b.izlenen = izlenen.length;
    b.kontrol = simdi();
    if (!izlenen.length) { kaydet(); return { izlenen: 0 }; }
    const g = (t) => new Date(t).toISOString().slice(0, 10);
    const govde = { fromDate: g(simdi() - 2 * GUN), toDate: g(simdi()), memberType: 'IGS', mkkMemberOidList: [], inactiveMkkMemberOidList: [], disclosureClass: 'FR', subjectList: [], isLate: '', mainSector: '', sector: '', subSector: '', marketOid: '', index: '', bdkReview: '', bdkMemberOidList: [], year: '', term: '', ruleType: '', period: '', fromSrc: false, srcCategory: '', disclosureIndexList: [] };
    let liste;
    try {
      const y = await fetchFn(`${KAP}/disclosure/members/byCriteria`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json', 'Accept-Language': 'tr' }, body: JSON.stringify(govde), signal: AbortSignal.timeout(60000) });
      if (!y.ok) throw new Error(`KAP HTTP ${y.status}`);
      liste = await y.json();
    } catch (e) { b.geriCekil = simdi() + 6 * SAAT; b.hata = String(e.message || e).slice(0, 200); kaydet(); throw e; }
    const yeni = kapYeniler(liste, izlenen, b.gorulen, simdi()).slice(0, 5);
    let gonderilen = 0;
    for (const x of yeni) {
      await bekle(20000);
      let nk = null;
      try {
        const y = await fetchFn(KAP_SAYFA + x.disclosureIndex, { headers: UA, signal: AbortSignal.timeout(90000) });
        if (y.ok) nk = kapNetKar(await y.text());
      } catch (e) { nk = null; }
      const r = await gonder('bilanco', bilancoParcalari(x, nk));
      if (r.ok) { b.gorulen[x.disclosureIndex] = simdi(); gonderilen++; }
    }
    // görülenler 60 gün tutulur
    for (const [id, t] of Object.entries(b.gorulen)) if (simdi() - t > 60 * GUN) delete b.gorulen[id];
    b.hata = null;
    kaydet();
    return { izlenen: izlenen.length, yeni: yeni.length, gonderilen };
  });

  function durum() {
    const m = (d.makine && d.makine.makineler) || {};
    return {
      fiyat: d.fiyat ? { kontrol: d.fiyat.kontrol || null, hata: d.fiyat.hata || null } : null,
      makine: { sunucu: d.makine && d.makine.sunucu ? d.makine.sunucu : null, makineler: Object.entries(m).map(([ad, x]) => ({ ad, son: x.son, tur: x.tur, surum: x.surum, uyarildi: !!x.uyarildi })) },
      golge: d.golge ? { hafta: d.golge.hafta || null, zaman: d.golge.zaman || null, hata: d.golge.hata || null } : null,
      anahtar: d.anahtar ? { gun: d.anahtar.gun || null, sayi: d.anahtar.sayi || 0, sorun: (d.anahtar.sorun || []).length, hata: d.anahtar.hata || null } : null,
      bilanco: d.bilanco ? { kontrol: d.bilanco.kontrol || null, izlenen: d.bilanco.izlenen || 0, hata: d.bilanco.hata || null } : null,
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

module.exports = { olustur, istanbul, haftaEtiketi, fiyatDegisimi, fiyatOlaylari, fiyatParcalari, makineDegerlendir, makineAdi, kapCoz, kapNetKar, birimCarpani, paraMetin, kapZaman, kapYeniler, bilancoParcalari, sureMetin };
